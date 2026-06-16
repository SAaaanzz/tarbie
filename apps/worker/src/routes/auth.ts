import { Hono } from 'hono';
import type { HonoEnv } from '../env.js';
import { signJwt } from '../lib/jwt.js';
import { loginSchema, verifyOtpSchema, generateId, ERROR_CODES, structuredLog } from '@tarbie/shared';
import { rateLimit, isOverLimit } from '../middleware/rate-limit.js';
import { authMiddleware } from '../middleware/auth.js';

const auth = new Hono<HonoEnv>();

// --- Helper: create JWT + session for a user ---
async function createAuthSession(
  user: { id: string; role: string; school_id: string; full_name: string; lang: string; phone?: string; telegram_chat_id?: string | null; whatsapp_number?: string | null; avatar_url?: string | null; premium?: number; created_at?: string },
  env: { JWT_SECRET: string; KV: KVNamespace }
) {
  const token = await signJwt(
    { sub: user.id, role: user.role as 'admin' | 'teacher' | 'student', school_id: user.school_id },
    env.JWT_SECRET,
    86400
  );
  const sessionId = generateId();
  await env.KV.put(`session:${sessionId}`, JSON.stringify({ user_id: user.id, token }), { expirationTtl: 86400 });
  return {
    token,
    user: {
      id: user.id,
      full_name: user.full_name,
      role: user.role,
      school_id: user.school_id,
      lang: user.lang,
      phone: user.phone ?? '',
      telegram_chat_id: user.telegram_chat_id ?? null,
      whatsapp_number: user.whatsapp_number ?? null,
      avatar_url: user.avatar_url ?? null,
      premium: user.premium ?? 0,
      created_at: user.created_at ?? '',
    },
  };
}

// --- Login: send OTP via Telegram ---
auth.post('/login', rateLimit(20, 300), async (c) => {
  const body = await c.req.json();
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ success: false, code: ERROR_CODES.VALIDATION_ERROR, message: parsed.error.issues[0]?.message ?? 'Invalid input' }, 400);
  }

  const { phone } = parsed.data;

  // Phone-scoped throttle: at most 5 OTPs per phone per 5 min, regardless of IP.
  if (await isOverLimit(c.env.KV, 'login_phone', phone, 5, 300)) {
    return c.json({ success: false, code: ERROR_CODES.RATE_LIMITED, message: 'Слишком много попыток. Подождите 5 минут.' }, 429);
  }

  const user = await c.env.DB.prepare('SELECT id, telegram_chat_id FROM users WHERE phone = ?')
    .bind(phone).first<{ id: string; telegram_chat_id: string | null }>();
  if (!user) {
    return c.json({ success: false, code: ERROR_CODES.USER_NOT_FOUND, message: 'Пользователь с таким номером не найден' }, 404);
  }

  if (!user.telegram_chat_id && c.env.ENVIRONMENT === 'production') {
    return c.json({
      success: false,
      code: 'TELEGRAM_NOT_LINKED',
      message: 'Telegram не привязан. Нажмите /start в боте @TarbieSagatyBot и отправьте свой номер телефона.',
    }, 400);
  }

  const otpBuf = new Uint32Array(1);
  crypto.getRandomValues(otpBuf);
  const otp = String(100000 + (otpBuf[0]! % 900000));
  await c.env.KV.put(`otp:${phone}`, otp, { expirationTtl: 300 });

  // Local dev only: skip Telegram delivery and use a fixed code for self-service login.
  if (c.env.ENVIRONMENT !== 'production') {
    await c.env.KV.put(`otp:${phone}`, '000000', { expirationTtl: 300 });
    structuredLog('info', 'DEV login: use OTP 000000', { phone });
    return c.json({ success: true, data: { message: 'DEV: введите код 000000', expires_in: 300 } });
  }

  try {
    const tgRes = await fetch(`https://api.telegram.org/bot${c.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: user.telegram_chat_id,
        text: `🔐 Код для входа: <b>${otp}</b>\n\nДействителен 5 минут. Никому не сообщайте этот код.`,
        parse_mode: 'HTML',
      }),
    });
    const tgResult = await tgRes.json() as { ok: boolean; description?: string };
    if (!tgResult.ok) {
      structuredLog('warn', 'Telegram send failed', { phone, description: tgResult.description });
      return c.json({
        success: false,
        code: 'TELEGRAM_SEND_FAILED',
        message: 'Не удалось отправить код. Убедитесь, что вы нажали /start в боте @TarbieSagatyBot.',
      }, 400);
    }
  } catch (err) {
    structuredLog('warn', 'Telegram send error', { phone, error: err instanceof Error ? err.message : 'unknown' });
    return c.json({ success: false, code: 'TELEGRAM_SEND_FAILED', message: 'Ошибка отправки кода в Telegram' }, 500);
  }

  structuredLog('info', 'OTP sent via Telegram', { phone });
  return c.json({ success: true, data: { message: 'Код отправлен в Telegram', expires_in: 300 } });
});

// --- Verify OTP ---
auth.post('/verify', rateLimit(10, 900), async (c) => {
  const body = await c.req.json();
  const parsed = verifyOtpSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ success: false, code: ERROR_CODES.VALIDATION_ERROR, message: parsed.error.issues[0]?.message ?? 'Invalid input' }, 400);
  }

  const { phone, otp } = parsed.data;

  // Phone-scoped throttle prevents an attacker from brute-forcing OTPs by rotating IPs.
  if (await isOverLimit(c.env.KV, 'verify_phone', phone, 10, 900)) {
    return c.json({ success: false, code: ERROR_CODES.RATE_LIMITED, message: 'Слишком много попыток ввода кода. Подождите 15 минут.' }, 429);
  }

  // Verify via KV stored OTP
  const storedOtp = await c.env.KV.get(`otp:${phone}`);
  if (!storedOtp) {
    return c.json({ success: false, code: ERROR_CODES.OTP_EXPIRED, message: 'Код истёк. Запросите новый.' }, 400);
  }
  if (storedOtp !== otp) {
    return c.json({ success: false, code: ERROR_CODES.OTP_INVALID, message: 'Неверный код' }, 400);
  }
  await c.env.KV.delete(`otp:${phone}`);

  const user = await c.env.DB.prepare(
    'SELECT id, role, school_id, full_name, lang, phone, telegram_chat_id, whatsapp_number, created_at FROM users WHERE phone = ?'
  ).bind(phone).first<{ id: string; role: string; school_id: string; full_name: string; lang: string; phone: string; telegram_chat_id: string | null; whatsapp_number: string | null; created_at: string }>();

  if (!user) {
    return c.json({ success: false, code: ERROR_CODES.USER_NOT_FOUND, message: 'Пользователь не найден' }, 404);
  }

  const session = await createAuthSession(user, c.env);
  structuredLog('info', 'User authenticated via OTP', { user_id: user.id, role: user.role });

  return c.json({ success: true, data: session });
});

// --- Magic link login from Telegram bot ---
auth.post('/telegram-login', rateLimit(20, 300), async (c) => {
  const { token: magicToken } = await c.req.json() as { token?: string };
  if (!magicToken) {
    return c.json({ success: false, code: ERROR_CODES.VALIDATION_ERROR, message: 'Token required' }, 400);
  }

  const userId = await c.env.KV.get(`tg_auth:${magicToken}`);
  if (!userId) {
    return c.json({ success: false, code: 'TOKEN_EXPIRED', message: 'Ссылка истекла. Запросите новую через /login в боте.' }, 400);
  }

  await c.env.KV.delete(`tg_auth:${magicToken}`);

  const user = await c.env.DB.prepare(
    'SELECT id, role, school_id, full_name, lang, phone, telegram_chat_id, whatsapp_number, created_at FROM users WHERE id = ?'
  ).bind(userId).first<{ id: string; role: string; school_id: string; full_name: string; lang: string; phone: string; telegram_chat_id: string | null; whatsapp_number: string | null; created_at: string }>();

  if (!user) {
    return c.json({ success: false, code: ERROR_CODES.USER_NOT_FOUND, message: 'Пользователь не найден' }, 404);
  }

  const session = await createAuthSession(user, c.env);
  structuredLog('info', 'User authenticated via Telegram magic link', { user_id: user.id });

  return c.json({ success: true, data: session });
});

auth.get('/me', authMiddleware, async (c) => {
  const authUser = c.get('user');
  const user = await c.env.DB.prepare(
    'SELECT id, school_id, full_name, role, phone, telegram_chat_id, whatsapp_number, lang, avatar_url, premium, premium_expires_at, created_at FROM users WHERE id = ?'
  ).bind(authUser.id).first();

  if (!user) {
    return c.json({ success: false, code: ERROR_CODES.USER_NOT_FOUND, message: 'User not found' }, 404);
  }

  return c.json({ success: true, data: user });
});

// Self-update profile
auth.put('/me', authMiddleware, async (c) => {
  const authUser = c.get('user');
  const body = await c.req.json() as { lang?: string };

  const updates: string[] = [];
  const values: unknown[] = [];

  if (body.lang && ['kz', 'ru'].includes(body.lang)) {
    updates.push('lang = ?');
    values.push(body.lang);
  }

  if (updates.length === 0) {
    return c.json({ success: false, code: ERROR_CODES.VALIDATION_ERROR, message: 'Nothing to update' }, 400);
  }

  values.push(authUser.id);
  await c.env.DB.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).bind(...values).run();

  return c.json({ success: true, data: { updated: true } });
});

// Avatar upload — stored in R2 (KV cannot hold 30 GB of images at scale).
auth.post('/me/avatar', authMiddleware, async (c) => {
  const authUser = c.get('user');
  const body = await c.req.json() as { avatar: string };

  if (!body.avatar || typeof body.avatar !== 'string') {
    return c.json({ success: false, code: ERROR_CODES.VALIDATION_ERROR, message: 'avatar (base64 data URL) required' }, 400);
  }

  if (!body.avatar.startsWith('data:image/')) {
    return c.json({ success: false, code: ERROR_CODES.VALIDATION_ERROR, message: 'Invalid image format' }, 400);
  }

  // ~200 KB base64 (raw ~150 KB).
  if (body.avatar.length > 300000) {
    return c.json({ success: false, code: ERROR_CODES.VALIDATION_ERROR, message: 'Image too large (max 200KB)' }, 400);
  }

  // Decode data URL into raw bytes for R2 (cheaper to serve, easier to cache).
  const match = body.avatar.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
  if (!match) {
    return c.json({ success: false, code: ERROR_CODES.VALIDATION_ERROR, message: 'Malformed data URL' }, 400);
  }
  const contentType = match[1]!;
  const bytes = Uint8Array.from(atob(match[2]!), ch => ch.charCodeAt(0));

  await c.env.AVATARS.put(authUser.id, bytes, {
    httpMetadata: { contentType, cacheControl: 'public, max-age=86400' },
  });

  // Clean up any stale KV-based avatar from the legacy code path.
  try { await c.env.KV.delete(`avatar:${authUser.id}`); } catch { /* ignore */ }

  const avatarUrl = `/api/auth/avatar/${authUser.id}`;
  await c.env.DB.prepare('UPDATE users SET avatar_url = ? WHERE id = ?').bind(avatarUrl, authUser.id).run();

  return c.json({ success: true, data: { avatar_url: avatarUrl } });
});

// Serve avatar image. Reads from R2 first, falls back to legacy KV for users who
// uploaded their avatar before the R2 migration.
auth.get('/avatar/:userId', async (c) => {
  const userId = c.req.param('userId');

  const object = await c.env.AVATARS.get(userId);
  if (object) {
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('Cache-Control', 'public, max-age=86400');
    if (!headers.get('Content-Type')) headers.set('Content-Type', 'image/jpeg');
    return new Response(object.body, { headers });
  }

  // Legacy fallback — old avatars stored as data URLs in KV.
  const data = await c.env.KV.get(`avatar:${userId}`);
  if (!data) {
    return c.json({ success: false, message: 'No avatar' }, 404);
  }
  const match = data.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
  if (!match) {
    return c.json({ success: false, message: 'Invalid avatar data' }, 500);
  }
  const contentType = match[1]!;
  const base64 = match[2]!;
  const bytes = Uint8Array.from(atob(base64), ch => ch.charCodeAt(0));
  return new Response(bytes, {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=86400',
    },
  });
});

export default auth;
