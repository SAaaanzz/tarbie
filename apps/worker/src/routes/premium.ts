import { Hono } from 'hono';
import type { HonoEnv } from '../env.js';
import { authMiddleware, requireRole } from '../middleware/auth.js';
import { nowISO, structuredLog } from '@tarbie/shared';

const premium = new Hono<HonoEnv>();

// ── External callback: myavka-donate activates premium for a phone number ──
// POST /api/premium/activate { phone, duration_days }
// Auth: X-Premium-Secret header
premium.post('/activate', async (c) => {
  const secret = c.req.header('x-premium-secret');
  if (!secret || secret !== c.env.PREMIUM_SECRET) {
    return c.json({ success: false, message: 'Unauthorized' }, 401);
  }

  const body = await c.req.json() as { phone?: string; duration_days?: number };
  if (!body.phone) {
    return c.json({ success: false, message: 'phone is required' }, 400);
  }

  const days = body.duration_days || 30;
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + days);
  const expiresAtStr = expiresAt.toISOString();

  // Find user by phone
  const user = await c.env.DB.prepare(
    'SELECT id, full_name FROM users WHERE phone = ?'
  ).bind(body.phone).first<{ id: string; full_name: string }>();

  if (!user) {
    return c.json({ success: false, message: 'User not found with this phone' }, 404);
  }

  await c.env.DB.prepare(
    'UPDATE users SET premium = 1, premium_expires_at = ?, updated_at = ? WHERE id = ?'
  ).bind(expiresAtStr, nowISO(), user.id).run();

  structuredLog('info', 'Premium activated', { user_id: user.id, phone: body.phone, expires_at: expiresAtStr });

  return c.json({
    success: true,
    data: { user_id: user.id, full_name: user.full_name, premium_expires_at: expiresAtStr },
  });
});

// ── Check premium status (authenticated) ──
premium.get('/status', authMiddleware, async (c) => {
  const authUser = c.get('user');
  const user = await c.env.DB.prepare(
    'SELECT premium, premium_expires_at FROM users WHERE id = ?'
  ).bind(authUser.id).first<{ premium: number; premium_expires_at: string | null }>();

  if (!user) {
    return c.json({ success: false, message: 'User not found' }, 404);
  }

  // Auto-expire premium
  let isPremium = !!user.premium;
  if (isPremium && user.premium_expires_at) {
    if (new Date(user.premium_expires_at) < new Date()) {
      await c.env.DB.prepare(
        'UPDATE users SET premium = 0, premium_expires_at = NULL WHERE id = ?'
      ).bind(authUser.id).run();
      isPremium = false;
    }
  }

  return c.json({
    success: true,
    data: {
      premium: isPremium,
      premium_expires_at: isPremium ? user.premium_expires_at : null,
    },
  });
});

// ── Super admin: revoke premium ──
premium.delete('/users/:userId', authMiddleware, requireRole('admin'), async (c) => {
  const authUser = c.get('user');
  const targetUserId = c.req.param('userId');

  // Check if current admin is super_admin (first admin in the school or has super_admin flag)
  const adminUser = await c.env.DB.prepare(
    'SELECT role FROM users WHERE id = ? AND role = ?'
  ).bind(authUser.id, 'admin').first();
  if (!adminUser) {
    return c.json({ success: false, message: 'Only admin can revoke premium' }, 403);
  }

  await c.env.DB.prepare(
    'UPDATE users SET premium = 0, premium_expires_at = NULL, updated_at = ? WHERE id = ?'
  ).bind(nowISO(), targetUserId).run();

  structuredLog('info', 'Premium revoked by admin', { admin_id: authUser.id, target_user_id: targetUserId });

  return c.json({ success: true, data: { user_id: targetUserId, premium: false } });
});

// ── Admin: list premium users ──
premium.get('/users', authMiddleware, requireRole('admin'), async (c) => {
  const authUser = c.get('user');
  const rows = await c.env.DB.prepare(
    'SELECT id, full_name, phone, role, premium_expires_at FROM users WHERE school_id = ? AND premium = 1'
  ).bind(authUser.school_id).all<{
    id: string; full_name: string; phone: string; role: string; premium_expires_at: string | null;
  }>();

  return c.json({ success: true, data: rows.results });
});

export default premium;
