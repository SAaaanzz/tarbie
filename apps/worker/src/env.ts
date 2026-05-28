export interface Env {
  DB: D1Database;
  KV: KVNamespace;
  AVATARS: R2Bucket;
  NOTIFICATION_QUEUE: Queue;
  JWT_SECRET: string;
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_WEBHOOK_SECRET: string;
  WHATSAPP_TOKEN: string;
  WHATSAPP_PHONE_NUMBER_ID: string;
  ENVIRONMENT: string;
  APP_URL: string;
  GEMINI_API_KEY: string;
  PREMIUM_SECRET: string;
}

export interface AuthUser {
  id: string;
  role: 'admin' | 'teacher' | 'student';
  school_id: string;
}

export interface HonoEnv {
  Bindings: Env;
  Variables: {
    user: AuthUser;
  };
}
