import type { BotEnv } from './env.js';
import { sendTelegramMessage } from './telegram.js';
import { sendWhatsAppMessage } from './whatsapp.js';
import { renderTemplate, generateId, nowISO, structuredLog } from '@tarbie/shared';
import type { QueueMessage, NotificationEventType, Lang } from '@tarbie/shared';

const MAX_ATTEMPTS = 3;

// Throwable error carrying Telegram-suggested retry delay.
class TelegramRateLimitedError extends Error {
  constructor(public retryAfter: number) {
    super('TELEGRAM_RATE_LIMITED');
  }
}

interface UserRow {
  id: string;
  telegram_chat_id: string | null;
  whatsapp_number: string | null;
  lang: string;
  school_id: string;
}

interface FailureEntry {
  userId: string;
  channel: 'telegram' | 'whatsapp';
  messageText: string;
  errorMsg: string;
  status: 'failed' | 'dead_letter';
}

// Fetch all users for a batch in 1 query (eliminates N+1).
async function fetchUsers(env: BotEnv, userIds: string[]): Promise<Map<string, UserRow>> {
  if (userIds.length === 0) return new Map();
  const placeholders = userIds.map(() => '?').join(',');
  const rows = await env.DB.prepare(
    `SELECT id, telegram_chat_id, whatsapp_number, lang, school_id FROM users WHERE id IN (${placeholders})`
  ).bind(...userIds).all<UserRow>();
  const map = new Map<string, UserRow>();
  for (const r of rows.results) map.set(r.id, r);
  return map;
}

// Fetch all needed templates in 1 query, keyed by `${schoolId}|${eventType}|${lang}`.
async function fetchTemplates(
  env: BotEnv,
  schoolIds: string[],
  eventType: NotificationEventType,
  langs: Lang[]
): Promise<Map<string, string>> {
  const uniqueSchools = Array.from(new Set([...schoolIds, '__default__']));
  const uniqueLangs = Array.from(new Set(langs));
  if (uniqueSchools.length === 0 || uniqueLangs.length === 0) return new Map();
  const schoolPh = uniqueSchools.map(() => '?').join(',');
  const langPh = uniqueLangs.map(() => '?').join(',');
  const rows = await env.DB.prepare(
    `SELECT school_id, lang, template_text FROM notification_templates
     WHERE school_id IN (${schoolPh}) AND event_type = ? AND lang IN (${langPh})`
  ).bind(...uniqueSchools, eventType, ...uniqueLangs).all<{ school_id: string; lang: string; template_text: string }>();
  const map = new Map<string, string>();
  for (const r of rows.results) map.set(`${r.school_id}|${r.lang}`, r.template_text);
  return map;
}

function pickTemplate(
  templates: Map<string, string>,
  schoolId: string,
  lang: Lang
): string | null {
  return templates.get(`${schoolId}|${lang}`) ?? templates.get(`__default__|${lang}`) ?? null;
}

// Batch-insert failure logs. Successes are not logged (saves ~95% D1 writes).
async function batchLogFailures(env: BotEnv, sessionId: string, failures: FailureEntry[]): Promise<void> {
  if (failures.length === 0) return;
  const now = nowISO();
  const CHUNK = 50;
  for (let i = 0; i < failures.length; i += CHUNK) {
    const slice = failures.slice(i, i + CHUNK);
    const stmts = slice.map(f =>
      env.DB.prepare(
        `INSERT INTO notifications_log (id, user_id, session_id, channel, message_text, sent_at, status, error_msg)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(generateId(), f.userId, sessionId, f.channel, f.messageText, now, f.status, f.errorMsg)
    );
    await env.DB.batch(stmts);
  }
}

// Parse Telegram error description for retry_after hint (e.g. "Too Many Requests: retry after 5").
function extractRetryAfter(description: string | undefined): number | null {
  if (!description) return null;
  const m = description.match(/retry after (\d+)/i);
  return m ? parseInt(m[1]!, 10) : null;
}

async function processMessage(env: BotEnv, msg: QueueMessage): Promise<void> {
  const { event_type, session_id, user_ids, template_vars } = msg;

  // 1 query for all users.
  const users = await fetchUsers(env, user_ids);
  if (users.size === 0) return;

  // 1 query for all templates.
  const schoolIds = Array.from(new Set(Array.from(users.values()).map(u => u.school_id)));
  const langs = Array.from(new Set(Array.from(users.values()).map(u => u.lang as Lang)));
  const templates = await fetchTemplates(env, schoolIds, event_type, langs);

  const failures: FailureEntry[] = [];
  let sentCount = 0;

  for (const userId of user_ids) {
    const user = users.get(userId);
    if (!user) {
      structuredLog('warn', 'User not found for notification', { user_id: userId });
      continue;
    }

    const lang = user.lang as Lang;
    const template = pickTemplate(templates, user.school_id, lang);
    if (!template) {
      structuredLog('warn', 'No template found', { event_type, lang, school_id: user.school_id });
      continue;
    }

    const messageText = renderTemplate(template, template_vars);
    let sent = false;

    if (user.telegram_chat_id) {
      try {
        const result = await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, user.telegram_chat_id, messageText);
        if (result.ok) {
          sent = true;
          sentCount++;
        } else {
          // Surface Telegram 429 to outer handler so the queue retries with delay.
          const retryAfter = extractRetryAfter(result.description);
          if (retryAfter !== null) {
            // Persist what we've already logged before bailing out.
            await batchLogFailures(env, session_id, failures);
            throw new TelegramRateLimitedError(retryAfter);
          }
          failures.push({ userId, channel: 'telegram', messageText, errorMsg: result.description ?? 'Unknown error', status: 'failed' });
        }
      } catch (err) {
        if (err instanceof TelegramRateLimitedError) throw err;
        failures.push({ userId, channel: 'telegram', messageText, errorMsg: err instanceof Error ? err.message : 'Unknown error', status: 'failed' });
      }
    }

    if (!sent && user.whatsapp_number) {
      try {
        const result = await sendWhatsAppMessage(env, user.whatsapp_number, messageText);
        if (result.messages && result.messages.length > 0) {
          sent = true;
          sentCount++;
        } else {
          failures.push({ userId, channel: 'whatsapp', messageText, errorMsg: result.error?.message ?? 'Unknown error', status: 'failed' });
        }
      } catch (err) {
        failures.push({ userId, channel: 'whatsapp', messageText, errorMsg: err instanceof Error ? err.message : 'Unknown error', status: 'failed' });
      }
    }

    if (!sent && !user.telegram_chat_id && !user.whatsapp_number) {
      failures.push({ userId, channel: 'telegram', messageText, errorMsg: 'No contact channel configured', status: 'failed' });
    }
  }

  await batchLogFailures(env, session_id, failures);

  structuredLog('info', 'Notification batch processed', {
    event_type,
    session_id,
    sent: sentCount,
    failed: failures.length,
  });
}

export async function handleQueue(
  batch: MessageBatch<QueueMessage>,
  env: BotEnv
): Promise<void> {
  for (const message of batch.messages) {
    const msg = message.body;

    try {
      await processMessage(env, msg);
      message.ack();
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      structuredLog('error', 'Queue message failed', {
        event_type: msg.event_type,
        attempt: msg.attempt,
        error: errorMsg,
      });

      if (msg.attempt < MAX_ATTEMPTS - 1) {
        // Honour Telegram-suggested retry delay if present; else exponential back-off.
        const baseDelay = err instanceof TelegramRateLimitedError
          ? Math.max(err.retryAfter, 1)
          : Math.pow(2, msg.attempt);
        structuredLog('info', 'Retrying message', { attempt: msg.attempt + 1, delay_s: baseDelay });
        message.retry({ delaySeconds: baseDelay });
      } else {
        structuredLog('error', 'Dead letter: max attempts reached', {
          event_type: msg.event_type,
          session_id: msg.session_id,
        });

        // Batch dead-letter logs.
        const now = nowISO();
        const CHUNK = 50;
        const ids = msg.user_ids;
        for (let i = 0; i < ids.length; i += CHUNK) {
          const slice = ids.slice(i, i + CHUNK);
          const stmts = slice.map(userId =>
            env.DB.prepare(
              `INSERT INTO notifications_log (id, user_id, session_id, channel, message_text, sent_at, status, error_msg)
               VALUES (?, ?, ?, ?, ?, ?, 'dead_letter', ?)`
            ).bind(generateId(), userId, msg.session_id, 'telegram', '', now, `Max attempts (${MAX_ATTEMPTS}) reached: ${errorMsg}`)
          );
          await env.DB.batch(stmts);
        }
        message.ack();
      }
    }
  }
}
