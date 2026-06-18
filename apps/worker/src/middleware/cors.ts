import { createMiddleware } from 'hono/factory';
import type { HonoEnv } from '../env.js';

// CORS: разрешает запросы только с доверенных доменов фронтенда.
export const corsMiddleware = createMiddleware<HonoEnv>(async (c, next) => {
  const origin = c.req.header('Origin') ?? '';
  const appUrl = c.env.APP_URL ?? '';
  // Белый список разрешённых источников (прод-домены + локальная разработка).
  const allowedOrigins = [appUrl, 'https://tarbie.online', 'https://tarbie-sagaty.pages.dev', 'https://tarbie-online.pages.dev', 'https://tarbie-web.pages.dev', 'http://localhost:5173'].filter(Boolean);
  // Плюс превью-деплои на поддоменах *.tarbie-sagaty.pages.dev
  const isPagesPreview = /^https:\/\/[a-z0-9-]+\.tarbie-sagaty\.pages\.dev$/.test(origin);
  
  const isAllowed = allowedOrigins.includes(origin) || isPagesPreview;
  const allowOrigin = isAllowed && origin ? origin : (allowedOrigins[0] ?? '*');

  if (c.req.method === 'OPTIONS') {
    c.header('Access-Control-Allow-Origin', allowOrigin);
    c.header('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    c.header('Access-Control-Allow-Headers', 'Content-Type,Authorization');
    c.header('Access-Control-Allow-Credentials', 'true');
    c.header('Access-Control-Max-Age', '86400');
    return c.body(null, 204);
  }

  await next();

  c.res.headers.set('Access-Control-Allow-Origin', allowOrigin);
  c.res.headers.set('Access-Control-Allow-Credentials', 'true');
  c.res.headers.set('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  c.res.headers.set('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  c.res.headers.set('X-Content-Type-Options', 'nosniff');
  c.res.headers.set('X-Frame-Options', 'DENY');
});
