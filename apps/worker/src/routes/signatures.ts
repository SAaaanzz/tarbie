import { Hono } from 'hono';
import type { HonoEnv } from '../env.js';
import { authMiddleware, requireRole } from '../middleware/auth.js';
import { generateId, ERROR_CODES } from '@tarbie/shared';

const signatures = new Hono<HonoEnv>();

signatures.use('*', authMiddleware);

// ── Get my signature ──
signatures.get('/me', async (c) => {
  const user = c.get('user');
  const sig = await c.env.DB.prepare(
    'SELECT id, signature_data, created_at, updated_at FROM user_signatures WHERE user_id = ?'
  ).bind(user.id).first<{ id: string; signature_data: string; created_at: string; updated_at: string }>();

  return c.json({ success: true, data: sig || null });
});

// ── Save/update my signature ──
signatures.post('/me', async (c) => {
  const user = c.get('user');
  const body = await c.req.json() as { signature_data: string };

  if (!body.signature_data || typeof body.signature_data !== 'string') {
    return c.json({ success: false, code: ERROR_CODES.VALIDATION_ERROR, message: 'signature_data is required' }, 400);
  }

  // Only curators (teachers) and admins can have signatures
  if (user.role === 'student') {
    return c.json({ success: false, code: ERROR_CODES.FORBIDDEN, message: 'Students cannot set signatures' }, 403);
  }

  const now = new Date().toISOString();
  const existing = await c.env.DB.prepare(
    'SELECT id FROM user_signatures WHERE user_id = ?'
  ).bind(user.id).first<{ id: string }>();

  if (existing) {
    await c.env.DB.prepare(
      'UPDATE user_signatures SET signature_data = ?, updated_at = ? WHERE user_id = ?'
    ).bind(body.signature_data, now, user.id).run();
    return c.json({ success: true, data: { id: existing.id, updated: true } });
  } else {
    const id = generateId();
    await c.env.DB.prepare(
      'INSERT INTO user_signatures (id, user_id, signature_data, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
    ).bind(id, user.id, body.signature_data, now, now).run();
    return c.json({ success: true, data: { id, updated: false } }, 201);
  }
});

// ── Check if user has signature (for first-login prompt) ──
signatures.get('/check', async (c) => {
  const user = c.get('user');

  // Students don't need signatures
  if (user.role === 'student') {
    return c.json({ success: true, data: { has_signature: true, required: false } });
  }

  const sig = await c.env.DB.prepare(
    'SELECT id FROM user_signatures WHERE user_id = ?'
  ).bind(user.id).first<{ id: string }>();

  return c.json({ success: true, data: { has_signature: !!sig, required: true } });
});

// ── Admin: get any user's signature ──
signatures.get('/users/:userId', requireRole('admin'), async (c) => {
  const userId = c.req.param('userId');
  const sig = await c.env.DB.prepare(
    'SELECT id, user_id, signature_data, created_at, updated_at FROM user_signatures WHERE user_id = ?'
  ).bind(userId).first<{ id: string; user_id: string; signature_data: string; created_at: string; updated_at: string }>();

  if (!sig) {
    return c.json({ success: false, code: ERROR_CODES.USER_NOT_FOUND, message: 'Signature not found' }, 404);
  }

  return c.json({ success: true, data: sig });
});

export { signatures };
