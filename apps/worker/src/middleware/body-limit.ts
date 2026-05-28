import { createMiddleware } from 'hono/factory';
import type { HonoEnv } from '../env.js';
import { ERROR_CODES } from '@tarbie/shared';

// Global cap on JSON body size to prevent a single malicious caller from forcing
// the worker to buffer huge payloads in memory. The avatar endpoint already
// enforces its own ~200 KB limit; everything else easily fits in 1 MB.
const DEFAULT_MAX_BODY_BYTES = 10_000_000;

export function bodyLimit(maxBytes = DEFAULT_MAX_BODY_BYTES) {
  return createMiddleware<HonoEnv>(async (c, next) => {
    const method = c.req.method;
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
      return next();
    }
    const cl = c.req.header('Content-Length');
    if (cl) {
      const n = parseInt(cl, 10);
      if (!Number.isNaN(n) && n > maxBytes) {
        return c.json(
          { success: false, code: ERROR_CODES.VALIDATION_ERROR, message: `Request body too large (max ${maxBytes} bytes)` },
          413
        );
      }
    }
    await next();
  });
}
