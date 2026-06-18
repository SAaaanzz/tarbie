import { createMiddleware } from 'hono/factory';
import type { HonoEnv } from '../env.js';
import { ERROR_CODES } from '@tarbie/shared';

// Ограничение частоты запросов (защита от перебора/спама) через KV.

// Middleware: лимит запросов по IP за окно времени.
export function rateLimit(maxRequests: number, windowSeconds: number) {
  return createMiddleware<HonoEnv>(async (c, next) => {
    const key = c.req.header('CF-Connecting-IP') ?? 'unknown';
    const rateLimitKey = `rl:${c.req.path}:${key}`;

    const current = await c.env.KV.get(rateLimitKey);
    const count = current ? parseInt(current, 10) : 0;

    if (count >= maxRequests) {
      return c.json(
        { success: false, code: ERROR_CODES.RATE_LIMITED, message: 'Too many requests. Try again later.' },
        429
      );
    }

    await c.env.KV.put(rateLimitKey, String(count + 1), { expirationTtl: windowSeconds });
    await next();
  });
}

// Ручная проверка лимита внутри обработчика — когда нужно ограничивать
// не по IP, а по данным из тела запроса (например, по номеру телефона).
// Возвращает true, если лимит превышен и нужно ответить 429.
export async function isOverLimit(
  kv: KVNamespace,
  bucket: string,
  identifier: string,
  maxRequests: number,
  windowSeconds: number
): Promise<boolean> {
  const key = `rl:${bucket}:${identifier}`;
  const current = await kv.get(key);
  const count = current ? parseInt(current, 10) : 0;
  if (count >= maxRequests) return true;
  await kv.put(key, String(count + 1), { expirationTtl: windowSeconds });
  return false;
}
