// Работа с Telegram: приём вебхуков бота и отправка сообщений пользователям.
import type { BotEnv } from './env.js';
import { structuredLog, formatDate, nowISO, generateId } from '@tarbie/shared';
import type { Lang } from '@tarbie/shared';

interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from: { id: number; first_name: string; last_name?: string };
    chat: { id: number; type: string };
    text?: string;
    contact?: { phone_number: string; user_id?: number };
  };
}

interface TelegramSendResult {
  ok: boolean;
  description?: string;
}

async function sendTelegramMessage(botToken: string, chatId: string, text: string, replyMarkup?: unknown): Promise<TelegramSendResult> {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  const payload: Record<string, unknown> = { chat_id: chatId, text, parse_mode: 'HTML' };
  if (replyMarkup) payload.reply_markup = replyMarkup;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return res.json() as Promise<TelegramSendResult>;
}

export async function handleTelegramWebhook(request: Request, env: BotEnv): Promise<Response> {
  const secretToken = request.headers.get('X-Telegram-Bot-Api-Secret-Token');
  if (secretToken !== env.TELEGRAM_WEBHOOK_SECRET) {
    structuredLog('warn', 'Invalid Telegram webhook secret');
    return new Response('Unauthorized', { status: 401 });
  }

  const update = (await request.json()) as TelegramUpdate;
  const chatId = String(update.message?.chat?.id ?? '');
  if (!chatId || !update.message) {
    return new Response('OK', { status: 200 });
  }

  const fromName = [update.message.from.first_name, update.message.from.last_name].filter(Boolean).join(' ');

  if (update.message.contact) {
    const contact = update.message.contact;
    if (contact.user_id && contact.user_id !== update.message.from.id) {
      await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, chatId,
        '⚠️ Вы отправили чужой контакт. Нажмите кнопку «📱 Отправить номер телефона» чтобы отправить свой.',
        {
          keyboard: [[{ text: '📱 Отправить номер телефона', request_contact: true }]],
          resize_keyboard: true,
        });
      return new Response('OK', { status: 200 });
    }
    let phone = contact.phone_number;
    if (!phone.startsWith('+')) phone = '+' + phone;
    structuredLog('info', 'Contact shared (verified)', { chat_id: chatId, phone });
    await handlePhoneRegistration(env, chatId, phone);
    return new Response('OK', { status: 200 });
  }

  const text = (update.message.text ?? '').trim();
  if (!text) {
    return new Response('OK', { status: 200 });
  }

  structuredLog('info', 'Telegram message received', { chat_id: chatId, text: text.slice(0, 50) });

  if (text.startsWith('/start')) {
    await handleStart(env, chatId, text, fromName);
  } else if (text === '/login') {
    await handleLogin(env, chatId);
  } else if (text === '/my_sessions') {
    await handleMySessions(env, chatId);
  } else if (text.startsWith('/confirm')) {
    await handleConfirm(env, chatId, text);
  } else if (/^\+?[78]\d{10}$/.test(text.replace(/[\s\-()]/g, ''))) {
    await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, chatId,
      '⚠️ Для безопасности нельзя привязать аккаунт вводом номера вручную.\n\nНажмите кнопку ниже, чтобы поделиться контактом — так мы убедимся, что это ваш номер.',
      {
        keyboard: [[{ text: '📱 Отправить номер телефона', request_contact: true }]],
        resize_keyboard: true,
      });
  } else {
    // Check if user is linked
    const linked = await env.DB.prepare('SELECT id, lang FROM users WHERE telegram_chat_id = ?')
      .bind(chatId).first<{ id: string; lang: string }>();
    if (linked) {
      await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, chatId, getHelpMessage(linked.lang as Lang));
    } else {
      await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, chatId, getHelpMessage(null), {
        keyboard: [[{ text: '📱 Отправить номер телефона', request_contact: true }]],
        resize_keyboard: true,
      });
    }
  }

  return new Response('OK', { status: 200 });
}

async function handlePhoneRegistration(env: BotEnv, chatId: string, phone: string, _fromName?: string): Promise<void> {
  const user = await env.DB.prepare('SELECT id, full_name, lang FROM users WHERE phone = ?')
    .bind(phone).first<{ id: string; full_name: string; lang: string }>();

  if (!user) {
    await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, chatId,
      '❌ Пользователь с таким номером не найден в системе.\n\nОбратитесь к администратору колледжа для регистрации.',
      { remove_keyboard: true });
    return;
  }

  await env.DB.prepare('UPDATE users SET telegram_chat_id = ? WHERE id = ?')
    .bind(chatId, user.id).run();

  const lang = (user.lang ?? 'ru') as Lang;
  const msg = lang === 'kz'
    ? `✅ Сәлеметсіз бе, ${user.full_name}!\n\nСіздің Telegram аккаунтыңыз сәтті байланыстырылды.\nЕнді кіру кодтары осы чатқа жіберіледі.\n\nКомандалар:\n/my_sessions — Менің тәрбие сағаттарым\n/confirm <id> — Сабақты аяқтау`
    : `✅ Здравствуйте, ${user.full_name}!\n\nВаш Telegram аккаунт успешно привязан.\nТеперь коды для входа будут приходить в этот чат.\n\nКоманды:\n/my_sessions — Мои классные часы\n/confirm <id> — Завершить занятие`;
  await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, chatId, msg, { remove_keyboard: true });
  structuredLog('info', 'User linked Telegram', { user_id: user.id, chat_id: chatId });
}

async function handleStart(env: BotEnv, chatId: string, text: string, fromName: string): Promise<void> {
  const parts = text.split(' ');
  const userToken = parts[1];

  if (userToken === 'login') {
    await handleLogin(env, chatId);
    return;
  }

  if (userToken) {
    const storedUserId = await env.KV.get(`tg_link:${userToken}`);
    if (storedUserId) {
      await env.DB.prepare('UPDATE users SET telegram_chat_id = ? WHERE id = ?')
        .bind(chatId, storedUserId).run();
      await env.KV.delete(`tg_link:${userToken}`);

      const user = await env.DB.prepare('SELECT full_name, lang FROM users WHERE id = ?')
        .bind(storedUserId).first<{ full_name: string; lang: string }>();

      const lang = (user?.lang ?? 'ru') as Lang;
      const msg = lang === 'kz'
        ? `✅ Сәлеметсіз бе, ${user?.full_name ?? fromName}! Telegram аккаунтыңыз сәтті байланыстырылды.\n\nКомандалар:\n/my_sessions — Менің тәрбие сағаттарым\n/confirm <id> — Сабақты аяқтау`
        : `✅ Здравствуйте, ${user?.full_name ?? fromName}! Telegram аккаунт успешно привязан.\n\nКоманды:\n/my_sessions — Мои классные часы\n/confirm <id> — Завершить занятие`;
      await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, chatId, msg, { remove_keyboard: true });
      return;
    }
  }

  const existingUser = await env.DB.prepare('SELECT id, full_name, lang FROM users WHERE telegram_chat_id = ?')
    .bind(chatId).first<{ id: string; full_name: string; lang: string }>();

  if (existingUser) {
    const lang = existingUser.lang as Lang;
    const msg = lang === 'kz'
      ? `Сәлеметсіз бе, ${existingUser.full_name}! Сіз тіркелгенсіз.\n\n/my_sessions — Менің тәрбие сағаттарым\n/login — Жүйеге кіру`
      : `Здравствуйте, ${existingUser.full_name}! Вы уже зарегистрированы.\n\n/my_sessions — Мои классные часы\n/login — Войти в систему`;
    await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, chatId, msg, { remove_keyboard: true });
  } else {
    const msg = '🏫 <b>Тәрбие Сағаты Manager</b>\n\n' +
      'Для привязки аккаунта нажмите кнопку ниже, чтобы безопасно поделиться своим номером телефона.';

    const keyboard = {
      keyboard: [[{ text: '📱 Отправить номер телефона', request_contact: true }]],
      resize_keyboard: true,
    };
    await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, chatId, msg, keyboard);
  }
}

async function handleLogin(env: BotEnv, chatId: string): Promise<void> {
  const user = await env.DB.prepare(
    'SELECT id, full_name, lang FROM users WHERE telegram_chat_id = ?'
  ).bind(chatId).first<{ id: string; full_name: string; lang: string }>();

  if (!user) {
    await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, chatId,
      '❌ Ваш Telegram не привязан к аккаунту.\n\nОтправьте свой номер телефона для привязки.',
      {
        keyboard: [[{ text: '📱 Отправить номер телефона', request_contact: true }]],
        resize_keyboard: true,
      });
    return;
  }

  const token = generateId() + generateId();
  await env.KV.put(`tg_auth:${token}`, user.id, { expirationTtl: 300 });

  const loginUrl = `${env.APP_URL}?auth_token=${token}`;
  const lang = (user.lang ?? 'ru') as Lang;

  const msg = lang === 'kz'
    ? `🔑 ${user.full_name}, жүйеге кіру сілтемесі:\n\n<b>Сілтеме 5 минут жарамды.</b>`
    : `🔑 ${user.full_name}, ссылка для входа:\n\n<b>Ссылка действительна 5 минут.</b>`;

  const keyboard = {
    inline_keyboard: [[{ text: lang === 'kz' ? '🚀 Жүйеге кіру' : '🚀 Войти в систему', url: loginUrl }]],
  };
  await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, chatId, msg, keyboard);
  structuredLog('info', 'Login magic link sent', { user_id: user.id, chat_id: chatId });
}

async function handleMySessions(env: BotEnv, chatId: string): Promise<void> {
  const user = await env.DB.prepare(
    'SELECT id, role, lang, school_id FROM users WHERE telegram_chat_id = ?'
  ).bind(chatId).first<{ id: string; role: string; lang: string; school_id: string }>();

  if (!user) {
    await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, chatId,
      'Вы не зарегистрированы. Привяжите аккаунт через веб-приложение.');
    return;
  }

  const lang = user.lang as Lang;
  let sessions;

  if (user.role === 'teacher') {
    sessions = await env.DB.prepare(
      `SELECT ts.id, ts.topic, ts.planned_date, ts.status, c.name as class_name
       FROM tarbie_sessions ts
       JOIN classes c ON ts.class_id = c.id
       WHERE ts.teacher_id = ? AND ts.status = 'planned' AND ts.planned_date >= date('now')
       ORDER BY ts.planned_date LIMIT 10`
    ).bind(user.id).all<{ id: string; topic: string; planned_date: string; status: string; class_name: string }>();
  } else {
    sessions = await env.DB.prepare(
      `SELECT ts.id, ts.topic, ts.planned_date, ts.status, c.name as class_name
       FROM tarbie_sessions ts
       JOIN classes c ON ts.class_id = c.id
       JOIN class_students cs ON cs.class_id = c.id
       WHERE cs.student_id = ? AND ts.status = 'planned' AND ts.planned_date >= date('now')
       ORDER BY ts.planned_date LIMIT 10`
    ).bind(user.id).all<{ id: string; topic: string; planned_date: string; status: string; class_name: string }>();
  }

  if (sessions.results.length === 0) {
    const msg = lang === 'kz'
      ? '📋 Жоспарланған тәрбие сағаттары жоқ.'
      : '📋 Нет запланированных классных часов.';
    await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, chatId, msg);
    return;
  }

  const header = lang === 'kz' ? '📋 <b>Алдағы тәрбие сағаттары:</b>\n\n' : '📋 <b>Предстоящие классные часы:</b>\n\n';
  const lines = sessions.results.map((s, i) => {
    const date = formatDate(s.planned_date, lang);
    return `${i + 1}. <b>${s.topic}</b>\n   📅 ${date} | 🏫 ${s.class_name}\n   ID: <code>${s.id.slice(0, 8)}</code>`;
  });

  await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, chatId, header + lines.join('\n\n'));
}

async function handleConfirm(env: BotEnv, chatId: string, text: string): Promise<void> {
  const parts = text.split(' ');
  const sessionIdPrefix = parts[1];

  if (!sessionIdPrefix) {
    await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, chatId, 'Использование: /confirm <session_id>');
    return;
  }

  const user = await env.DB.prepare(
    "SELECT id, lang FROM users WHERE telegram_chat_id = ? AND role = 'teacher'"
  ).bind(chatId).first<{ id: string; lang: string }>();

  if (!user) {
    await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, chatId, 'Только учителя могут подтверждать завершение.');
    return;
  }

  const lang = user.lang as Lang;

  const session = await env.DB.prepare(
    `SELECT id, topic, class_id FROM tarbie_sessions
     WHERE id LIKE ? || '%' AND teacher_id = ? AND status = 'planned'`
  ).bind(sessionIdPrefix, user.id).first<{ id: string; topic: string; class_id: string }>();

  if (!session) {
    const msg = lang === 'kz' ? 'Сабақ табылмады немесе ол аяқталған.' : 'Занятие не найдено или уже завершено.';
    await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, chatId, msg);
    return;
  }

  const now = nowISO();
  await env.DB.prepare(
    "UPDATE tarbie_sessions SET status = 'completed', actual_date = ?, updated_at = ? WHERE id = ?"
  ).bind(now.split('T')[0], now, session.id).run();

  const msg = lang === 'kz'
    ? `✅ <b>${session.topic}</b> тәрбие сағаты аяқталды деп белгіленді.`
    : `✅ Классный час <b>${session.topic}</b> отмечен как завершённый.`;
  await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, chatId, msg);
}

function getHelpMessage(lang: Lang | null): string {
  if (lang === 'kz') {
    return '🏫 <b>Тәрбие Сағаты Manager</b>\n\nАккаунтыңызды байланыстыру үшін /start басып, контакт жіберіңіз.\n\nКомандалар:\n/start — Аккаунтты байланыстыру\n/login — Жүйеге кіру\n/my_sessions — Менің тәрбие сағаттарым\n/confirm <id> — Сабақты аяқтау';
  }
  return '🏫 <b>Тәрбие Сағаты Manager</b>\n\nДля привязки аккаунта нажмите /start и отправьте контакт.\n\nКоманды:\n/start — Привязать аккаунт\n/login — Войти в систему\n/my_sessions — Мои классные часы\n/confirm <id> — Завершить занятие';
}

export { sendTelegramMessage };
