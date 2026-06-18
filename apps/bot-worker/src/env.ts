// Окружение фонового воркера: привязки к ресурсам Cloudflare и секреты ботов.
export interface BotEnv {
  DB: D1Database;
  KV: KVNamespace;
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_WEBHOOK_SECRET: string;
  WHATSAPP_TOKEN: string;
  WHATSAPP_PHONE_NUMBER_ID: string;
  ENVIRONMENT: string;
  APP_URL: string;
}
