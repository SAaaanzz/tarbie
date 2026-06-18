// Маршруты техподдержки: тикеты пользователей и пересылка их админу в Telegram.
import { Hono } from 'hono';
import type { HonoEnv } from '../env.js';
import { authMiddleware } from '../middleware/auth.js';
import { generateId, nowISO, ERROR_CODES } from '@tarbie/shared';
import { forwardTicketToAdmin, forwardMessageToAdmin } from './telegram-bot.js';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

const support = new Hono<HonoEnv>();

support.use('*', authMiddleware);

// List my tickets
support.get('/tickets', async (c) => {
  const user = c.get('user');
  const rows = await c.env.DB.prepare(
    `SELECT t.*, 
       (SELECT COUNT(*) FROM support_messages WHERE ticket_id = t.id) as message_count,
       (SELECT message FROM support_messages WHERE ticket_id = t.id ORDER BY created_at DESC LIMIT 1) as last_message
     FROM support_tickets t
     WHERE t.user_id = ?
     ORDER BY t.updated_at DESC`
  ).bind(user.id).all();
  return c.json({ success: true, data: rows.results });
});

// Create ticket
support.post('/tickets', async (c) => {
  const user = c.get('user');
  const body = await c.req.json() as { subject: string; message: string; priority?: string };

  if (!body.subject?.trim() || !body.message?.trim()) {
    return c.json({ success: false, code: ERROR_CODES.VALIDATION_ERROR, message: 'Subject and message are required' }, 400);
  }

  const ticketId = generateId();
  const messageId = generateId();
  const now = nowISO();
  const priority = ['low', 'normal', 'high', 'urgent'].includes(body.priority ?? '') ? body.priority! : 'normal';

  await c.env.DB.batch([
    c.env.DB.prepare(
      'INSERT INTO support_tickets (id, school_id, user_id, subject, priority, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).bind(ticketId, user.school_id, user.id, body.subject.trim(), priority, now, now),
    c.env.DB.prepare(
      'INSERT INTO support_messages (id, ticket_id, sender_id, is_admin, message, created_at) VALUES (?, ?, ?, 0, ?, ?)'
    ).bind(messageId, ticketId, user.id, body.message.trim(), now),
  ]);

  // Forward to admin Telegram (non-blocking)
  const senderUser = await c.env.DB.prepare('SELECT full_name FROM users WHERE id = ?').bind(user.id).first<{ full_name: string }>();
  c.executionCtx.waitUntil(
    forwardTicketToAdmin(ticketId, body.subject.trim(), body.message.trim(), senderUser?.full_name ?? '', c.env, c.env.TELEGRAM_BOT_TOKEN)
  );

  return c.json({ success: true, data: { id: ticketId } }, 201);
});

// Get ticket with messages
support.get('/tickets/:id', async (c) => {
  const user = c.get('user');
  const ticketId = c.req.param('id');

  const ticket = await c.env.DB.prepare(
    'SELECT * FROM support_tickets WHERE id = ? AND user_id = ?'
  ).bind(ticketId, user.id).first();

  if (!ticket) {
    return c.json({ success: false, code: ERROR_CODES.USER_NOT_FOUND, message: 'Ticket not found' }, 404);
  }

  const messages = await c.env.DB.prepare(
    `SELECT sm.*, u.full_name as sender_name
     FROM support_messages sm
     JOIN users u ON sm.sender_id = u.id
     WHERE sm.ticket_id = ?
     ORDER BY sm.created_at ASC`
  ).bind(ticketId).all();

  return c.json({ success: true, data: { ticket, messages: messages.results } });
});

// Add message to ticket
support.post('/tickets/:id/messages', async (c) => {
  const user = c.get('user');
  const ticketId = c.req.param('id');
  const body = await c.req.json() as { message: string };

  if (!body.message?.trim()) {
    return c.json({ success: false, code: ERROR_CODES.VALIDATION_ERROR, message: 'Message is required' }, 400);
  }

  const ticket = await c.env.DB.prepare(
    'SELECT * FROM support_tickets WHERE id = ? AND user_id = ?'
  ).bind(ticketId, user.id).first();

  if (!ticket) {
    return c.json({ success: false, code: ERROR_CODES.USER_NOT_FOUND, message: 'Ticket not found' }, 404);
  }

  const messageId = generateId();
  const now = nowISO();

  await c.env.DB.batch([
    c.env.DB.prepare(
      'INSERT INTO support_messages (id, ticket_id, sender_id, is_admin, message, created_at) VALUES (?, ?, ?, 0, ?, ?)'
    ).bind(messageId, ticketId, user.id, body.message.trim(), now),
    c.env.DB.prepare(
      'UPDATE support_tickets SET updated_at = ?, status = CASE WHEN status = \'resolved\' THEN \'open\' ELSE status END WHERE id = ?'
    ).bind(now, ticketId),
  ]);

  // Forward to admin Telegram (non-blocking)
  const senderUser2 = await c.env.DB.prepare('SELECT full_name FROM users WHERE id = ?').bind(user.id).first<{ full_name: string }>();
  const ticketData = ticket as { subject?: string };
  c.executionCtx.waitUntil(
    forwardMessageToAdmin(ticketId, ticketData.subject ?? '', body.message.trim(), senderUser2?.full_name ?? '', c.env, c.env.TELEGRAM_BOT_TOKEN)
  );

  return c.json({ success: true, data: { id: messageId } }, 201);
});

// ── Phone change: request OTP ──
support.post('/phone-change/request', async (c) => {
  const user = c.get('user');
  const body = await c.req.json() as { new_phone: string };

  if (!body.new_phone?.match(/^\+7\d{10}$/)) {
    return c.json({ success: false, code: ERROR_CODES.VALIDATION_ERROR, message: 'Phone must be +7XXXXXXXXXX' }, 400);
  }

  // Check if phone already taken
  const existing = await c.env.DB.prepare(
    'SELECT id FROM users WHERE phone = ? AND school_id = ?'
  ).bind(body.new_phone, user.school_id).first();

  if (existing) {
    return c.json({ success: false, code: 'PHONE_TAKEN', message: 'Этот номер уже занят' }, 409);
  }

  // Get user's telegram_chat_id
  const dbUser = await c.env.DB.prepare(
    'SELECT telegram_chat_id FROM users WHERE id = ?'
  ).bind(user.id).first<{ telegram_chat_id: string | null }>();

  if (!dbUser?.telegram_chat_id) {
    return c.json({ success: false, code: 'TELEGRAM_NOT_LINKED', message: 'Telegram не привязан' }, 400);
  }

  const otp = String(Math.floor(100000 + Math.random() * 900000));
  const id = generateId();
  const now = nowISO();

  // Expire old pending requests
  await c.env.DB.prepare(
    "UPDATE phone_change_requests SET status = 'expired' WHERE user_id = ? AND status = 'pending'"
  ).bind(user.id).run();

  await c.env.DB.prepare(
    'INSERT INTO phone_change_requests (id, user_id, new_phone, otp, status, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(id, user.id, body.new_phone, otp, 'pending', now).run();

  // Also store in KV for fast lookup with TTL
  await c.env.KV.put(`phone_change:${user.id}`, JSON.stringify({ id, otp, new_phone: body.new_phone }), { expirationTtl: 300 });

  // Send OTP via Telegram
  try {
    await fetch(`https://api.telegram.org/bot${c.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: dbUser.telegram_chat_id,
        text: `🔄 Код для смены номера: <b>${otp}</b>\n\nНовый номер: ${body.new_phone}\nДействителен 5 минут.`,
        parse_mode: 'HTML',
      }),
    });
  } catch {
    return c.json({ success: false, code: 'TELEGRAM_SEND_FAILED', message: 'Не удалось отправить код' }, 500);
  }

  return c.json({ success: true, data: { message: 'Код отправлен в Telegram', expires_in: 300 } });
});

// ── Phone change: verify OTP ──
support.post('/phone-change/verify', async (c) => {
  const user = c.get('user');
  const body = await c.req.json() as { otp: string };

  if (!body.otp?.match(/^\d{6}$/)) {
    return c.json({ success: false, code: ERROR_CODES.VALIDATION_ERROR, message: 'OTP must be 6 digits' }, 400);
  }

  const stored = await c.env.KV.get(`phone_change:${user.id}`);
  if (!stored) {
    return c.json({ success: false, code: 'OTP_EXPIRED', message: 'Код истёк. Запросите новый.' }, 400);
  }

  const data = JSON.parse(stored) as { id: string; otp: string; new_phone: string };
  if (data.otp !== body.otp) {
    return c.json({ success: false, code: 'OTP_INVALID', message: 'Неверный код' }, 400);
  }

  // Update phone
  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE users SET phone = ? WHERE id = ?').bind(data.new_phone, user.id),
    c.env.DB.prepare("UPDATE phone_change_requests SET status = 'verified' WHERE id = ?").bind(data.id),
  ]);

  await c.env.KV.delete(`phone_change:${user.id}`);

  return c.json({ success: true, data: { phone: data.new_phone } });
});

// ── File upload for support messages (max 10MB) ──
support.post('/tickets/:id/upload', async (c) => {
  const user = c.get('user');
  const ticketId = c.req.param('id');

  const ticket = await c.env.DB.prepare(
    'SELECT * FROM support_tickets WHERE id = ? AND user_id = ?'
  ).bind(ticketId, user.id).first();
  if (!ticket) return c.json({ success: false, code: ERROR_CODES.NOT_FOUND, message: 'Ticket not found' }, 404);

  const contentType = c.req.header('content-type') ?? '';
  let fileData: ArrayBuffer;
  let fileName: string;
  let fileMime: string;

  if (contentType.includes('multipart/form-data')) {
    const formData = await c.req.formData();
    const file = formData.get('file') as File | null;
    if (!file) return c.json({ success: false, code: ERROR_CODES.VALIDATION_ERROR, message: 'No file provided' }, 400);
    if (file.size > MAX_FILE_SIZE) return c.json({ success: false, code: ERROR_CODES.VALIDATION_ERROR, message: 'File too large (max 10MB)' }, 400);
    fileData = await file.arrayBuffer();
    fileName = file.name;
    fileMime = file.type || 'application/octet-stream';
  } else {
    const body = await c.req.json() as { name: string; data: string; mime?: string };
    if (!body.name || !body.data) return c.json({ success: false, code: ERROR_CODES.VALIDATION_ERROR, message: 'name and data (base64) required' }, 400);
    const raw = Uint8Array.from(atob(body.data), ch => ch.charCodeAt(0));
    if (raw.length > MAX_FILE_SIZE) return c.json({ success: false, code: ERROR_CODES.VALIDATION_ERROR, message: 'File too large (max 10MB)' }, 400);
    fileData = raw.buffer;
    fileName = body.name;
    fileMime = body.mime || 'application/octet-stream';
  }

  const fileId = generateId();
  const kvKey = `file:${fileId}`;
  await c.env.KV.put(kvKey, fileData, { metadata: { name: fileName, mime: fileMime, ticketId, uploadedBy: user.id, uploadedAt: nowISO() } });

  const fileUrl = `/api/support/files/${fileId}`;
  // Also add as a message with file reference
  const messageId = generateId();
  const now = nowISO();
  await c.env.DB.batch([
    c.env.DB.prepare(
      'INSERT INTO support_messages (id, ticket_id, sender_id, is_admin, message, file_url, file_name, created_at) VALUES (?, ?, ?, 0, ?, ?, ?, ?)'
    ).bind(messageId, ticketId, user.id, `📎 ${fileName}`, fileUrl, fileName, now),
    c.env.DB.prepare('UPDATE support_tickets SET updated_at = ? WHERE id = ?').bind(now, ticketId),
  ]);

  return c.json({ success: true, data: { file_id: fileId, file_url: fileUrl, file_name: fileName, message_id: messageId } });
});

// ── Serve support file ──
support.get('/files/:fileId', async (c) => {
  const fileId = c.req.param('fileId');
  const kvKey = `file:${fileId}`;
  const { value, metadata } = await c.env.KV.getWithMetadata<{ name: string; mime: string }>(kvKey, 'arrayBuffer');
  if (!value || !metadata) return c.json({ success: false, code: ERROR_CODES.NOT_FOUND, message: 'File not found' }, 404);

  return new Response(value as ArrayBuffer, {
    headers: {
      'Content-Type': metadata.mime,
      'Content-Disposition': `inline; filename="${encodeURIComponent(metadata.name)}"`,
      'Cache-Control': 'public, max-age=86400',
    },
  });
});

export default support;
