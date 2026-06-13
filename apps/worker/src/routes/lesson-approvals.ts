import { Hono } from 'hono';
import type { HonoEnv } from '../env.js';
import { authMiddleware, requireRole } from '../middleware/auth.js';
import { generateId, ERROR_CODES } from '@tarbie/shared';
import type { QueueMessage } from '@tarbie/shared';
import { notifyAdminLessonApproval, notifyCuratorApprovalResult } from './telegram-bot.js';

const lessonApprovals = new Hono<HonoEnv>();

lessonApprovals.use('*', authMiddleware);

// ── Curator: submit lesson for approval (upload Word file) ──
lessonApprovals.post('/', requireRole('teacher'), async (c) => {
  const user = c.get('user');
  const formData = await c.req.formData();
  const sessionId = formData.get('session_id') as string;
  const file = formData.get('file') as File | null;

  if (!sessionId || !file) {
    return c.json({ success: false, code: ERROR_CODES.VALIDATION_ERROR, message: 'session_id and file are required' }, 400);
  }

  // Validate file type
  const validTypes = [
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ];
  if (!validTypes.includes(file.type) && !file.name.endsWith('.doc') && !file.name.endsWith('.docx')) {
    return c.json({ success: false, code: ERROR_CODES.VALIDATION_ERROR, message: 'Only .doc/.docx files allowed' }, 400);
  }

  // Verify session belongs to this curator
  const session = await c.env.DB.prepare(
    'SELECT id FROM tarbie_sessions WHERE id = ? AND teacher_id = ?'
  ).bind(sessionId, user.id).first<{ id: string }>();

  if (!session) {
    return c.json({ success: false, code: ERROR_CODES.USER_NOT_FOUND, message: 'Session not found or not yours' }, 404);
  }

  // Check if already submitted
  const existing = await c.env.DB.prepare(
    'SELECT id, status FROM lesson_approvals WHERE session_id = ? AND curator_id = ?'
  ).bind(sessionId, user.id).first<{ id: string; status: string }>();

  if (existing && existing.status === 'pending') {
    return c.json({ success: false, code: ERROR_CODES.VALIDATION_ERROR, message: 'Already pending approval' }, 400);
  }

  // Upload file to KV as base64 string
  const fileKey = `lesson-approvals:${generateId()}_${file.name}`;
  const arrayBuffer = await file.arrayBuffer();
  const uint8 = new Uint8Array(arrayBuffer);
  let binaryStr = '';
  for (let i = 0; i < uint8.length; i++) {
    binaryStr += String.fromCharCode(uint8[i]!);
  }
  await c.env.KV.put(fileKey, btoa(binaryStr), { metadata: { contentType: file.type, fileName: file.name } });

  const now = new Date().toISOString();
  const id = generateId();

  // Get curator's signature
  const curatorSig = await c.env.DB.prepare(
    'SELECT id FROM user_signatures WHERE user_id = ?'
  ).bind(user.id).first<{ id: string }>();

  await c.env.DB.prepare(
    `INSERT INTO lesson_approvals (id, session_id, curator_id, school_id, word_file_url, word_file_name, status, curator_signature_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)`
  ).bind(id, sessionId, user.id, user.school_id, fileKey, file.name, curatorSig?.id || null, now, now).run();

  // Notify admin via Telegram
  const session2 = await c.env.DB.prepare(
    'SELECT topic FROM tarbie_sessions WHERE id = ?'
  ).bind(sessionId).first<{ topic: string }>();
  const curatorUser = await c.env.DB.prepare(
    'SELECT full_name FROM users WHERE id = ?'
  ).bind(user.id).first<{ full_name: string }>();
  c.executionCtx.waitUntil(
    notifyAdminLessonApproval(curatorUser?.full_name ?? '', session2?.topic ?? 'Без темы', id, c.env, c.env.TELEGRAM_BOT_TOKEN)
      .catch(() => {})
  );

  return c.json({ success: true, data: { id, status: 'pending' } }, 201);
});

// ── Curator: get my pending approvals (waiting list) ──
lessonApprovals.get('/my', requireRole('teacher'), async (c) => {
  const user = c.get('user');
  const rows = await c.env.DB.prepare(
    `SELECT la.*, ts.topic, ts.planned_date
     FROM lesson_approvals la
     JOIN tarbie_sessions ts ON ts.id = la.session_id
     WHERE la.curator_id = ?
     ORDER BY la.created_at DESC`
  ).bind(user.id).all();

  return c.json({ success: true, data: rows.results });
});

// ── Admin: get all pending approvals for school ──
lessonApprovals.get('/pending', requireRole('admin'), async (c) => {
  const user = c.get('user');
  const rows = await c.env.DB.prepare(
    `SELECT la.*, ts.topic, ts.planned_date, u.full_name as curator_name
     FROM lesson_approvals la
     JOIN tarbie_sessions ts ON ts.id = la.session_id
     JOIN users u ON u.id = la.curator_id
     WHERE la.school_id = ? AND la.status = 'pending'
     ORDER BY la.created_at ASC`
  ).bind(user.school_id).all();

  return c.json({ success: true, data: rows.results });
});

// ── Admin: get all approvals for school (all statuses) ──
lessonApprovals.get('/all', requireRole('admin'), async (c) => {
  const user = c.get('user');
  const rows = await c.env.DB.prepare(
    `SELECT la.*, ts.topic, ts.planned_date, u.full_name as curator_name
     FROM lesson_approvals la
     JOIN tarbie_sessions ts ON ts.id = la.session_id
     JOIN users u ON u.id = la.curator_id
     WHERE la.school_id = ?
     ORDER BY la.created_at DESC
     LIMIT 100`
  ).bind(user.school_id).all();

  return c.json({ success: true, data: rows.results });
});

// ── Admin: approve lesson ──
lessonApprovals.post('/:id/approve', requireRole('admin'), async (c) => {
  const user = c.get('user');
  const approvalId = c.req.param('id');

  const approval = await c.env.DB.prepare(
    'SELECT * FROM lesson_approvals WHERE id = ? AND school_id = ?'
  ).bind(approvalId, user.school_id).first<{ id: string; status: string; session_id: string; curator_id: string }>();

  if (!approval) {
    return c.json({ success: false, code: ERROR_CODES.USER_NOT_FOUND, message: 'Approval not found' }, 404);
  }

  if (approval.status !== 'pending') {
    return c.json({ success: false, code: ERROR_CODES.VALIDATION_ERROR, message: 'Already processed' }, 400);
  }

  // Get admin's signature
  const adminSig = await c.env.DB.prepare(
    'SELECT id FROM user_signatures WHERE user_id = ?'
  ).bind(user.id).first<{ id: string }>();

  const now = new Date().toISOString();

  await c.env.DB.prepare(
    `UPDATE lesson_approvals SET status = 'approved', approved_by = ?, approved_at = ?, admin_signature_id = ?, updated_at = ? WHERE id = ?`
  ).bind(user.id, now, adminSig?.id || null, now, approvalId).run();

  // Update session status to 'planned'
  await c.env.DB.prepare(
    `UPDATE tarbie_sessions SET status = 'planned', updated_at = ? WHERE id = ?`
  ).bind(now, approval.session_id).run();

  // Send SESSION_PLANNED notification to students
  const session = await c.env.DB.prepare(
    `SELECT ts.topic, ts.planned_date, ts.class_id, ts.teacher_id, c.name as class_name
     FROM tarbie_sessions ts JOIN classes c ON c.id = ts.class_id WHERE ts.id = ?`
  ).bind(approval.session_id).first<{ topic: string; planned_date: string; class_id: string; teacher_id: string; class_name: string }>();

  if (session) {
    const students = await c.env.DB.prepare(
      'SELECT student_id FROM class_students WHERE class_id = ?'
    ).bind(session.class_id).all<{ student_id: string }>();
    const userIds = [session.teacher_id, ...students.results.map(s => s.student_id)];
    const queueMsg: QueueMessage = {
      event_type: 'SESSION_PLANNED',
      session_id: approval.session_id,
      user_ids: userIds,
      template_vars: { topic: session.topic, date: session.planned_date, class_name: session.class_name, teacher_name: '' },
      attempt: 0,
    };
    await c.env.NOTIFICATION_QUEUE.send(queueMsg);
  }

  // Notify curator that lesson was approved
  c.executionCtx.waitUntil(
    notifyCuratorApprovalResult(approval.curator_id, session?.topic ?? '', true, null, c.env, c.env.TELEGRAM_BOT_TOKEN)
      .catch(() => {})
  );

  return c.json({ success: true, data: { id: approvalId, status: 'approved', approved_at: now } });
});

// ── Admin: reject lesson ──
lessonApprovals.post('/:id/reject', requireRole('admin'), async (c) => {
  const user = c.get('user');
  const approvalId = c.req.param('id');
  const body = await c.req.json() as { comment?: string };

  const approval = await c.env.DB.prepare(
    'SELECT * FROM lesson_approvals WHERE id = ? AND school_id = ?'
  ).bind(approvalId, user.school_id).first<{ id: string; status: string }>();

  if (!approval) {
    return c.json({ success: false, code: ERROR_CODES.USER_NOT_FOUND, message: 'Approval not found' }, 404);
  }

  if (approval.status !== 'pending') {
    return c.json({ success: false, code: ERROR_CODES.VALIDATION_ERROR, message: 'Already processed' }, 400);
  }

  const now = new Date().toISOString();

  const approval2 = await c.env.DB.prepare(
    'SELECT session_id, curator_id FROM lesson_approvals WHERE id = ?'
  ).bind(approvalId).first<{ session_id: string; curator_id: string }>();

  await c.env.DB.prepare(
    `UPDATE lesson_approvals SET status = 'rejected', approved_by = ?, admin_comment = ?, updated_at = ? WHERE id = ?`
  ).bind(user.id, body.comment || null, now, approvalId).run();

  // Cancel the session
  await c.env.DB.prepare(
    `UPDATE tarbie_sessions SET status = 'cancelled', updated_at = ? WHERE id = ? AND status = 'pending_approval'`
  ).bind(now, approval2?.session_id ?? '').run();

  // Notify curator via Telegram
  if (approval2) {
    const sess = await c.env.DB.prepare('SELECT topic FROM tarbie_sessions WHERE id = ?')
      .bind(approval2.session_id).first<{ topic: string }>();
    c.executionCtx.waitUntil(
      notifyCuratorApprovalResult(approval2.curator_id, sess?.topic ?? '', false, body.comment || null, c.env, c.env.TELEGRAM_BOT_TOKEN)
        .catch(() => {})
    );
  }

  return c.json({ success: true, data: { id: approvalId, status: 'rejected' } });
});

// ── Get approval document data (for PDF generation) ──
lessonApprovals.get('/:id/document', async (c) => {
  const user = c.get('user');
  const approvalId = c.req.param('id');

  const approval = await c.env.DB.prepare(
    `SELECT la.*, ts.topic, ts.planned_date, 
     cu.full_name as curator_name,
     au.full_name as admin_name
     FROM lesson_approvals la
     JOIN tarbie_sessions ts ON ts.id = la.session_id
     JOIN users cu ON cu.id = la.curator_id
     LEFT JOIN users au ON au.id = la.approved_by
     WHERE la.id = ? AND la.school_id = ?`
  ).bind(approvalId, user.school_id).first<{
    id: string; status: string; curator_name: string; admin_name: string;
    topic: string; planned_date: string; approved_at: string;
    curator_signature_id: string; admin_signature_id: string;
    curator_id: string; approved_by: string;
  }>();

  if (!approval) {
    return c.json({ success: false, code: ERROR_CODES.USER_NOT_FOUND, message: 'Not found' }, 404);
  }

  // Get signatures (only if approved; for pending - return nulls)
  let curatorSignature: string | null = null;
  let adminSignature: string | null = null;
  let adminSignature2: string | null = null;

  if (approval.curator_id) {
    const cs = await c.env.DB.prepare(
      'SELECT signature_data FROM user_signatures WHERE user_id = ?'
    ).bind(approval.curator_id).first<{ signature_data: string }>();
    curatorSignature = cs?.signature_data || null;
  }

  if (approval.status === 'approved' && approval.approved_by) {
    const as2 = await c.env.DB.prepare(
      'SELECT signature_data, signature_data_2 FROM user_signatures WHERE user_id = ?'
    ).bind(approval.approved_by).first<{ signature_data: string; signature_data_2: string | null }>();
    adminSignature = as2?.signature_data || null;
    adminSignature2 = as2?.signature_data_2 || null;
  }

  return c.json({
    success: true,
    data: {
      id: approval.id,
      topic: approval.topic,
      planned_date: approval.planned_date,
      curator_name: approval.curator_name,
      admin_name: approval.admin_name,
      approved_at: approval.approved_at,
      curator_signature: curatorSignature,
      admin_signature: adminSignature,
      admin_signature_2: adminSignature2,
      status: approval.status,
    },
  });
});

// ── Download the uploaded Word file ──
lessonApprovals.get('/:id/file', async (c) => {
  const user = c.get('user');
  const approvalId = c.req.param('id');

  const approval = await c.env.DB.prepare(
    'SELECT word_file_url, word_file_name, school_id, curator_id FROM lesson_approvals WHERE id = ?'
  ).bind(approvalId).first<{ word_file_url: string; word_file_name: string; school_id: string; curator_id: string }>();

  if (!approval || approval.school_id !== user.school_id) {
    return c.json({ success: false, code: ERROR_CODES.USER_NOT_FOUND, message: 'Not found' }, 404);
  }

  const base64Value = await c.env.KV.get(approval.word_file_url, { type: 'text' });
  if (!base64Value) {
    return c.json({ success: false, message: 'File not found in storage' }, 404);
  }

  // Decode base64 back to binary
  const binaryStr = atob(base64Value);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }

  return new Response(bytes, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(approval.word_file_name)}"`,
      'Content-Length': String(bytes.length),
      'Access-Control-Allow-Origin': c.req.header('Origin') || '*',
      'Access-Control-Allow-Credentials': 'true',
    },
  });
});

// ── Convert a (signed) .docx to PDF via ConvertAPI, return the PDF ──
// The client generates the signed .docx (signatures injected) and POSTs the
// raw bytes here; the API key stays server-side and never reaches the browser.
lessonApprovals.post('/:id/pdf', async (c) => {
  const user = c.get('user');
  const approvalId = c.req.param('id');

  const approval = await c.env.DB.prepare(
    'SELECT word_file_name, school_id FROM lesson_approvals WHERE id = ?'
  ).bind(approvalId).first<{ word_file_name: string; school_id: string }>();
  if (!approval || approval.school_id !== user.school_id) {
    return c.json({ success: false, code: ERROR_CODES.USER_NOT_FOUND, message: 'Not found' }, 404);
  }

  const apiKey = c.env.CONVERT_API_KEY;
  if (!apiKey) {
    return c.json({ success: false, message: 'PDF конвертация не настроена: задайте секрет CONVERT_API_KEY' }, 503);
  }

  const docxBytes = new Uint8Array(await c.req.arrayBuffer());
  if (docxBytes.length === 0) {
    return c.json({ success: false, message: 'Пустой документ' }, 400);
  }

  const form = new FormData();
  form.append('File', new Blob([docxBytes], {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  }), 'document.docx');

  const convRes = await fetch(`https://v2.convertapi.com/convert/docx/to/pdf?Secret=${encodeURIComponent(apiKey)}&StoreFile=false`, {
    method: 'POST',
    body: form,
  });
  if (!convRes.ok) {
    const errText = await convRes.text();
    return c.json({ success: false, message: `Конвертация не удалась (${convRes.status}): ${errText.slice(0, 200)}` }, 502);
  }
  const result = await convRes.json() as { Files?: Array<{ FileData?: string }> };
  const fileData = result.Files?.[0]?.FileData;
  if (!fileData) {
    return c.json({ success: false, message: 'Конвертер не вернул файл' }, 502);
  }

  const binaryStr = atob(fileData);
  const pdfBytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) pdfBytes[i] = binaryStr.charCodeAt(i);

  const pdfName = approval.word_file_name.replace(/\.docx?$/i, '') + '_signed.pdf';
  return new Response(pdfBytes, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(pdfName)}"`,
      'Content-Length': String(pdfBytes.length),
      'Access-Control-Allow-Origin': c.req.header('Origin') || '*',
      'Access-Control-Allow-Credentials': 'true',
    },
  });
});

export { lessonApprovals };
