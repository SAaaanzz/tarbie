import { createMiddleware } from 'hono/factory';
import type { HonoEnv } from '../env.js';
import { verifyJwt } from '../lib/jwt.js';
import type { Role } from '@tarbie/shared';
import { ERROR_CODES } from '@tarbie/shared';

// Middleware авторизации: проверяет JWT и роли пользователя.

// Проверяет заголовок Authorization, валидирует токен и кладёт user в контекст.
export const authMiddleware = createMiddleware<HonoEnv>(async (c, next) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ success: false, code: ERROR_CODES.UNAUTHORIZED, message: 'Missing or invalid Authorization header' }, 401);
  }

  const token = authHeader.slice(7);
  const payload = await verifyJwt(token, c.env.JWT_SECRET);
  if (!payload) {
    return c.json({ success: false, code: ERROR_CODES.UNAUTHORIZED, message: 'Invalid or expired token' }, 401);
  }

  c.set('user', {
    id: payload.sub,
    role: payload.role,
    school_id: payload.school_id,
  });

  await next();
});

// Ограничивает доступ к маршруту только указанными ролями.
export function requireRole(...roles: Role[]) {
  return createMiddleware<HonoEnv>(async (c, next) => {
    const user = c.get('user');
    if (!roles.includes(user.role)) {
      return c.json({ success: false, code: ERROR_CODES.FORBIDDEN, message: 'Insufficient permissions' }, 403);
    }
    await next();
  });
}
