// Точка входа фонового воркера уведомлений: принимает вебхуки Telegram
// и обрабатывает сообщения из очереди рассылок.
import type { BotEnv } from './env.js';
import { handleTelegramWebhook } from './telegram.js';
import { handleQueue } from './queue-consumer.js';
import { structuredLog } from '@tarbie/shared';
import type { QueueMessage } from '@tarbie/shared';

export default {
  async fetch(request: Request, env: BotEnv): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/telegram/webhook' && request.method === 'POST') {
      return handleTelegramWebhook(request, env);
    }

    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ success: true, data: { status: 'ok', service: 'bot-worker' } }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: false, code: 'NOT_FOUND', message: 'Route not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  },

  async queue(batch: MessageBatch<QueueMessage>, env: BotEnv): Promise<void> {
    structuredLog('info', 'Queue batch received', { size: batch.messages.length });
    await handleQueue(batch, env);
  },
};
