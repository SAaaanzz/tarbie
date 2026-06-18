// Отправка сообщений через WhatsApp Business API.
import type { BotEnv } from './env.js';
import { structuredLog } from '@tarbie/shared';

interface WhatsAppSendResult {
  messages?: Array<{ id: string }>;
  error?: { message: string; code: number };
}

export async function sendWhatsAppMessage(
  env: BotEnv,
  toNumber: string,
  text: string
): Promise<WhatsAppSendResult> {
  const url = `https://graph.facebook.com/v18.0/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${env.WHATSAPP_TOKEN}`,
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: toNumber.replace(/\+/g, ''),
      type: 'text',
      text: { preview_url: false, body: text },
    }),
  });

  const result = (await res.json()) as WhatsAppSendResult;

  if (result.error) {
    structuredLog('error', 'WhatsApp send failed', {
      to: toNumber,
      error: result.error.message,
      code: result.error.code,
    });
  }

  return result;
}

export async function sendWhatsAppTemplate(
  env: BotEnv,
  toNumber: string,
  templateName: string,
  languageCode: string,
  parameters: string[]
): Promise<WhatsAppSendResult> {
  const url = `https://graph.facebook.com/v18.0/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${env.WHATSAPP_TOKEN}`,
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: toNumber.replace(/\+/g, ''),
      type: 'template',
      template: {
        name: templateName,
        language: { code: languageCode },
        components: [
          {
            type: 'body',
            parameters: parameters.map((p) => ({ type: 'text', text: p })),
          },
        ],
      },
    }),
  });

  const result = (await res.json()) as WhatsAppSendResult;

  if (result.error) {
    structuredLog('error', 'WhatsApp template send failed', {
      to: toNumber,
      template: templateName,
      error: result.error.message,
    });
  }

  return result;
}
