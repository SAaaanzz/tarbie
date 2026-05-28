import { Hono } from 'hono';
import type { Env } from '../env.js';
import { generateId, nowISO, structuredLog } from '@tarbie/shared';

interface TgUpdate { update_id: number; message?: TgMessage; callback_query?: TgCallbackQuery; }
interface TgMessage { message_id: number; from: { id: number; first_name: string; last_name?: string }; chat: { id: number; type: string }; text?: string; contact?: { phone_number: string; user_id?: number }; reply_to_message?: TgMessage; }
interface TgCallbackQuery { id: string; from: { id: number; first_name: string }; message?: TgMessage; data?: string; }

async function tg(token: string, method: string, body: Record<string, unknown>) {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return res.json() as Promise<{ ok: boolean; result?: unknown; description?: string }>;
}

const bot = new Hono<{ Bindings: Env }>();

// Webhook setup & diagnostics — protected by TELEGRAM_WEBHOOK_SECRET
function checkBotAdminSecret(c: { req: { header: (k: string) => string | undefined; query: (k: string) => string | undefined }; env: Env }): boolean {
  const provided = c.req.header('X-Admin-Secret') ?? c.req.query('secret') ?? '';
  return provided !== '' && provided === c.env.TELEGRAM_WEBHOOK_SECRET;
}

bot.get('/setup', async (c) => {
  if (!checkBotAdminSecret(c)) return c.json({ success: false, message: 'Unauthorized' }, 401);
  const token = c.env.TELEGRAM_BOT_TOKEN;
  const webhookUrl = 'https://dprabota.bahtyarsanzhar.workers.dev/api/telegram/webhook';
  const setRes = await tg(token, 'setWebhook', {
    url: webhookUrl,
    secret_token: c.env.TELEGRAM_WEBHOOK_SECRET,
    allowed_updates: ['message', 'callback_query'],
  });
  const infoRes = await tg(token, 'getWebhookInfo', {});
  return c.json({ success: true, set: setRes, info: infoRes });
});

bot.get('/info', async (c) => {
  if (!checkBotAdminSecret(c)) return c.json({ success: false, message: 'Unauthorized' }, 401);
  const token = c.env.TELEGRAM_BOT_TOKEN;
  const infoRes = await tg(token, 'getWebhookInfo', {});
  const adminChatId = await c.env.KV.get('support_admin_chat_id');
  return c.json({ success: true, webhook: infoRes, support_admin_chat_id: adminChatId ?? '(not set)' });
});

bot.post('/webhook', async (c) => {
  const secret = c.req.header('X-Telegram-Bot-Api-Secret-Token');
  if (secret !== c.env.TELEGRAM_WEBHOOK_SECRET) return c.json({ ok: false }, 401);
  const update: TgUpdate = await c.req.json();
  const token = c.env.TELEGRAM_BOT_TOKEN;
  try {
    if (update.callback_query) await handleCallback(update.callback_query, c.env, token);
    else if (update.message) await handleMessage(update.message, c.env, token);
  } catch (err) { structuredLog('error', 'Bot error', { error: err instanceof Error ? err.message : 'unknown' }); }
  return c.json({ ok: true });
});

// ══════════════════════════════════════════════
// MESSAGE HANDLER
// ══════════════════════════════════════════════
async function handleMessage(msg: TgMessage, env: Env, token: string) {
  const chatId = msg.chat.id;
  const text = msg.text?.trim() ?? '';
  if (msg.contact) return handleContact(msg, env, token);
  if (msg.reply_to_message && text) { const h = await handleAdminReply(msg, env, token); if (h) return; }
  const flowData = await env.KV.get(`bot_flow:${chatId}`);
  if (flowData) return handleFlow(chatId, text, JSON.parse(flowData), env, token);
  if (text === '/start') return sendLanguageSelection(chatId, token);
  if (text === '/menu' || text === '/help') { const l = await getLang(chatId, env); return sendMainMenu(chatId, l, token); }
  if (text === '/login') return handleLoginCmd(chatId, env, token);
  if (text === '/rate') return handleRateCmd(chatId, env, token);
  if (text === '/faq') { const l = await getLang(chatId, env); return sendFAQ(chatId, l, token); }
  // Block manual phone number input — require contact button
  if (/^\+?[78]\d{10}$/.test(text.replace(/[\s\-()]/g, ''))) {
    const l = await getLang(chatId, env);
    const k = l === 'kz';
    return tg(token, 'sendMessage', { chat_id: chatId, text: k ? '⚠️ Қауіпсіздік үшін нөмірді қолмен жіберу мүмкін емес.\n\nТөмендегі батырманы басыңыз:' : '⚠️ Для безопасности нельзя привязать номер вручную.\n\nНажмите кнопку ниже:',
      reply_markup: { keyboard: [[{ text: k ? '📱 Менің нөмірімді жіберу' : '📱 Отправить мой номер', request_contact: true }]], resize_keyboard: true, one_time_keyboard: true } });
  }
  const lang = await getLang(chatId, env);
  return sendMainMenu(chatId, lang, token);
}

// ══════════════════════════════════════════════
// CALLBACK HANDLER
// ══════════════════════════════════════════════
async function handleCallback(cb: TgCallbackQuery, env: Env, token: string) {
  const chatId = cb.message?.chat.id;
  if (!chatId || !cb.data) return;
  await tg(token, 'answerCallbackQuery', { callback_query_id: cb.id });
  const d = cb.data;

  if (d.startsWith('lang:')) {
    const lang = d.split(':')[1] as 'kz' | 'ru';
    await env.KV.put(`bot_lang:${chatId}`, lang, { expirationTtl: 86400 * 365 });
    const u = await env.DB.prepare('SELECT id FROM users WHERE telegram_chat_id = ?').bind(String(chatId)).first<{ id: string }>();
    if (u) await env.DB.prepare('UPDATE users SET lang = ? WHERE id = ?').bind(lang, u.id).run();
    return sendMainMenu(chatId, lang, token);
  }

  const lang = await getLang(chatId, env);
  const k = lang === 'kz';

  // Main menu
  if (d === 'menu:help') return sendHelpMenu(chatId, lang, token);
  if (d === 'menu:faq') return sendFAQ(chatId, lang, token);
  if (d === 'menu:complaint') return startTicketFlow(chatId, lang, 'complaint', env, token);
  if (d === 'menu:request') return startTicketFlow(chatId, lang, 'request', env, token);
  if (d === 'menu:support') return startTicketFlow(chatId, lang, 'support', env, token);
  if (d === 'back:menu') return sendMainMenu(chatId, lang, token);
  if (d === 'back:help') return sendHelpMenu(chatId, lang, token);

  // Help topics
  if (d === 'help:code') return sendHelpCode(chatId, lang, token);
  if (d === 'help:site') return sendHelpSite(chatId, lang, env, token);
  if (d === 'help:grades') return sendHelpGrades(chatId, lang, token);
  if (d === 'help:attendance') return sendHelpAttendance(chatId, lang, token);
  if (d === 'help:profile') return sendHelpProfile(chatId, lang, token);
  if (d === 'help:schedule') return sendHelpSchedule(chatId, lang, token);
  if (d === 'help:telegram_link') return sendHelpTelegramLink(chatId, lang, token);
  if (d === 'help:phone_change') return sendHelpPhoneChange(chatId, lang, token);
  if (d === 'help:notifications') return sendHelpNotifications(chatId, lang, token);
  if (d === 'help:still_broken') return startTicketFlow(chatId, lang, 'support', env, token);

  // FAQ
  if (d.startsWith('faq:')) return handleFAQItem(chatId, d.substring(4), lang, token);

  // Rating
  if (d.startsWith('rate_session:')) {
    const sid = d.substring('rate_session:'.length);
    await env.KV.put(`bot_flow:${chatId}`, JSON.stringify({ step: 'rate_score', sessionId: sid }), { expirationTtl: 600 });
    return tg(token, 'sendMessage', { chat_id: chatId, text: k ? '⭐ Сабаққа баға беріңіз (1-ден 10-ға дейін):' : '⭐ Оцените занятие (от 1 до 10):' });
  }

  // Rating: anonymous choice
  if (d.startsWith('rate_anon:')) {
    const isAnon = d === 'rate_anon:yes';
    const flowData = await env.KV.get(`bot_flow:${chatId}`);
    if (!flowData) return tg(token, 'sendMessage', { chat_id: chatId, text: '❌ Session expired' });
    const flow: FlowState = JSON.parse(flowData);
    if (flow.step !== 'rate_anon' || !flow.sessionId || !flow.rating) return tg(token, 'sendMessage', { chat_id: chatId, text: '❌ Error' });
    await env.KV.delete(`bot_flow:${chatId}`);
    return submitRating(chatId, flow.sessionId, flow.rating, flow.message ?? null, isAnon, env, token, lang);
  }

  // Admin ticket actions
  if (d.startsWith('reply:')) {
    const tid = d.split(':')[1]!;
    await env.KV.put(`bot_flow:${chatId}`, JSON.stringify({ step: 'admin_reply', ticketId: tid }), { expirationTtl: 600 });
    return tg(token, 'sendMessage', {
      chat_id: chatId,
      text: k ? `✍️ Жауабыңызды жазыңыз (ID: ${tid.slice(0, 8)}):` : `✍️ Напишите ваш ответ (ID: ${tid.slice(0, 8)}):`,
      reply_markup: { force_reply: true, selective: true },
    });
  }
  if (d.startsWith('close:')) {
    await env.DB.prepare("UPDATE support_tickets SET status = 'resolved', updated_at = ? WHERE id = ?").bind(nowISO(), d.split(':')[1]!).run();
    return tg(token, 'sendMessage', { chat_id: chatId, text: '✅ Тикет закрыт / Тикет жабылды' });
  }
  if (d.startsWith('progress:')) {
    await env.DB.prepare("UPDATE support_tickets SET status = 'in_progress', updated_at = ? WHERE id = ?").bind(nowISO(), d.split(':')[1]!).run();
    return tg(token, 'sendMessage', { chat_id: chatId, text: '🔄 Тикет в работе / Тикет өңделуде' });
  }
}

// ══════════════════════════════════════════════
// FLOW STATE MACHINE
// ══════════════════════════════════════════════
interface FlowState { step: string; type?: string; fio?: string; phone?: string; subject?: string; message?: string; ticketId?: string; sessionId?: string; rating?: number; isAnonymous?: boolean; }

async function handleFlow(chatId: number, text: string, flow: FlowState, env: Env, token: string) {
  const lang = await getLang(chatId, env);
  const k = lang === 'kz';
  if (text === '/cancel' || text === '/menu') { await env.KV.delete(`bot_flow:${chatId}`); return sendMainMenu(chatId, lang, token); }

  // Admin reply
  if (flow.step === 'admin_reply' && flow.ticketId) { await env.KV.delete(`bot_flow:${chatId}`); return saveAdminReply(chatId, flow.ticketId, text, env, token); }

  // Rating: score
  if (flow.step === 'rate_score' && flow.sessionId) {
    const score = parseInt(text, 10);
    if (isNaN(score) || score < 1 || score > 10) return tg(token, 'sendMessage', { chat_id: chatId, text: k ? '❌ 1-ден 10-ға дейін сан жазыңыз:' : '❌ Введите число от 1 до 10:' });
    flow.rating = score; flow.step = 'rate_reason';
    await env.KV.put(`bot_flow:${chatId}`, JSON.stringify(flow), { expirationTtl: 600 });
    return tg(token, 'sendMessage', { chat_id: chatId, text: k ? `📝 Сіз <b>${score}/10</b> қойдыңыз.\n\nНеге осындай баға? (немесе /skip):` : `📝 Вы поставили <b>${score}/10</b>.\n\nПочему такая оценка? (или /skip):`, parse_mode: 'HTML' });
  }

  // Rating: reason → ask anonymous
  if (flow.step === 'rate_reason' && flow.sessionId && flow.rating) {
    const reason = text === '/skip' ? null : text;
    flow.step = 'rate_anon';
    flow.message = reason ?? undefined;
    await env.KV.put(`bot_flow:${chatId}`, JSON.stringify(flow), { expirationTtl: 600 });
    return tg(token, 'sendMessage', {
      chat_id: chatId,
      text: k
        ? '🕶 <b>Анонимді бағалау</b>\n\nАнонимді болса — бағаңыз бен пікіріңіз көрінеді, бірақ атыңыз жасырылады.'
        : '🕶 <b>Анонимный отзыв</b>\n\nВаша оценка и комментарий будут видны, но ваше имя будет скрыто.',
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: [
        [{ text: k ? '🕶 Анонимді (атым жасырын)' : '🕶 Анонимно (имя скрыто)', callback_data: 'rate_anon:yes' }],
        [{ text: k ? '👁 Ашық (атым көрінеді)' : '👁 Открыто (имя видно)', callback_data: 'rate_anon:no' }],
      ] },
    });
  }

  // Ticket: FIO
  if (flow.step === 'ask_fio') {
    flow.fio = text; flow.step = 'ask_phone';
    await env.KV.put(`bot_flow:${chatId}`, JSON.stringify(flow), { expirationTtl: 600 });
    return tg(token, 'sendMessage', { chat_id: chatId, text: k ? '📱 Телефон нөміріңізді жазыңыз (+7XXXXXXXXXX):' : '📱 Напишите ваш номер телефона (+7XXXXXXXXXX):' });
  }
  if (flow.step === 'ask_phone') {
    flow.phone = text; flow.step = 'ask_subject';
    await env.KV.put(`bot_flow:${chatId}`, JSON.stringify(flow), { expirationTtl: 600 });
    const prompts: Record<string, Record<string, string>> = { complaint: { kz: '📝 Шағым тақырыбы:', ru: '📝 Тема жалобы:' }, request: { kz: '📝 Сұраныс тақырыбы:', ru: '📝 Тема обращения:' }, support: { kz: '📝 Мәселе тақырыбы:', ru: '📝 Тема проблемы:' } };
    return tg(token, 'sendMessage', { chat_id: chatId, text: prompts[flow.type ?? 'support']?.[lang] ?? prompts.support![lang]! });
  }
  if (flow.step === 'ask_subject') {
    flow.subject = text; flow.step = 'ask_message';
    await env.KV.put(`bot_flow:${chatId}`, JSON.stringify(flow), { expirationTtl: 600 });
    const prompts: Record<string, Record<string, string>> = { complaint: { kz: '💬 Шағымды толық жазыңыз:', ru: '💬 Подробно опишите жалобу:' }, request: { kz: '💬 Сұранысты толық жазыңыз:', ru: '💬 Подробно опишите обращение:' }, support: { kz: '💬 Мәселені толық жазыңыз:', ru: '💬 Подробно опишите проблему:' } };
    return tg(token, 'sendMessage', { chat_id: chatId, text: prompts[flow.type ?? 'support']?.[lang] ?? prompts.support![lang]! });
  }
  if (flow.step === 'ask_message') {
    flow.message = text; await env.KV.delete(`bot_flow:${chatId}`);
    return createTicketFromBot(chatId, flow, env, token, lang);
  }
}

// ══════════════════════════════════════════════
// MENUS
// ══════════════════════════════════════════════
function sendLanguageSelection(chatId: number, token: string) {
  return tg(token, 'sendMessage', { chat_id: chatId, text: '🌐 Тілді таңдаңыз / Выберите язык:', reply_markup: { inline_keyboard: [[{ text: '🇰🇿 Қазақша', callback_data: 'lang:kz' }, { text: '🇷🇺 Русский', callback_data: 'lang:ru' }]] } });
}

function sendMainMenu(chatId: number, lang: string, token: string) {
  const k = lang === 'kz';
  return tg(token, 'sendMessage', { chat_id: chatId, text: k ? '📋 <b>Басты мәзір</b>\n\nТөмендегі әрекетті таңдаңыз:' : '📋 <b>Главное меню</b>\n\nВыберите действие:', parse_mode: 'HTML', reply_markup: { inline_keyboard: [
    [{ text: k ? '🆘 Көмек / Нұсқаулық' : '🆘 Помощь / Инструкция', callback_data: 'menu:help' }],
    [{ text: k ? '❓ Жиі сұрақтар (FAQ)' : '❓ Частые вопросы (FAQ)', callback_data: 'menu:faq' }],
    [{ text: k ? '📨 Колледжге сұраныс' : '📨 Обращение в колледж', callback_data: 'menu:request' }],
    [{ text: k ? '⚠️ Мұғалімге шағым' : '⚠️ Жалоба на учителя', callback_data: 'menu:complaint' }],
    [{ text: k ? '📩 Қолдауға жазу' : '📩 Написать в поддержку', callback_data: 'menu:support' }],
    [{ text: k ? '🌐 Тілді өзгерту' : '🌐 Сменить язык', callback_data: 'lang:kz' }],
  ] } });
}

// ══════════════════════════════════════════════
// HELP MENU (9 topics)
// ══════════════════════════════════════════════
function sendHelpMenu(chatId: number, lang: string, token: string) {
  const k = lang === 'kz';
  return tg(token, 'sendMessage', { chat_id: chatId, text: k ? '🆘 <b>Көмек</b>\n\nТақырыпты таңдаңыз:' : '🆘 <b>Помощь</b>\n\nВыберите тему:', parse_mode: 'HTML', reply_markup: { inline_keyboard: [
    [{ text: k ? '🔐 Код келмейді' : '🔐 Не приходит код', callback_data: 'help:code' }],
    [{ text: k ? '📖 Сайт жұмысы' : '📖 Как работает сайт', callback_data: 'help:site' }],
    [{ text: k ? '📊 Бағалар' : '📊 Оценки', callback_data: 'help:grades' }, { text: k ? '📅 Кесте' : '📅 Расписание', callback_data: 'help:schedule' }],
    [{ text: k ? '✅ Қатысу' : '✅ Посещаемость', callback_data: 'help:attendance' }, { text: k ? '👤 Профиль' : '👤 Профиль', callback_data: 'help:profile' }],
    [{ text: k ? '🔗 Telegram байл.' : '🔗 Привязка TG', callback_data: 'help:telegram_link' }, { text: k ? '📱 Нөмір өзг.' : '📱 Смена номера', callback_data: 'help:phone_change' }],
    [{ text: k ? '🔔 Хабарландыру' : '🔔 Уведомления', callback_data: 'help:notifications' }],
    [{ text: k ? '◀️ Артқа' : '◀️ Назад', callback_data: 'back:menu' }],
  ] } });
}

function sendHelpCode(chatId: number, lang: string, token: string) {
  const k = lang === 'kz';
  const t = k
    ? '🔐 <b>Код келмейді?</b>\n\n1️⃣ Telegram ашыңыз → @TarbieSagatyBot → /start\n2️⃣ «📱 Телефон жіберу» басыңыз\n3️⃣ Нөмірді тексеріңіз — TG мен сайт бірдей болуы керек\n4️⃣ Telegram жаңартыңыз\n5️⃣ 5 мин күтіңіз\n6️⃣ Кэш тазалаңыз: Settings → Data → Clear Cache\n\n⚠️ Көмектеспесе → төмен басыңыз'
    : '🔐 <b>Не приходит код?</b>\n\n1️⃣ Откройте Telegram → @TarbieSagatyBot → /start\n2️⃣ Нажмите «📱 Отправить номер»\n3️⃣ Проверьте номер — в TG и на сайте должен совпадать\n4️⃣ Обновите Telegram\n5️⃣ Подождите 5 мин\n6️⃣ Очистите кэш: Settings → Data → Clear Cache\n\n⚠️ Не помогло → нажмите ниже';
  return tg(token, 'sendMessage', { chat_id: chatId, text: t, parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: k ? '📩 Қолдауға жазу' : '📩 В поддержку', callback_data: 'help:still_broken' }], [{ text: k ? '◀️ Артқа' : '◀️ Назад', callback_data: 'back:help' }]] } });
}

function sendHelpSite(chatId: number, lang: string, env: Env, token: string) {
  const k = lang === 'kz'; const url = env.APP_URL || 'https://tarbie.online';
  const t = k
    ? `📖 <b>Сайт жұмысы</b>\n\n🔹 <b>Кіру:</b> ${url} → телефон → TG код\n🔹 <b>Сабақтар:</b> тізім, тақырыптар, қатысу\n🔹 <b>Бағалар:</b> бағалау, есептер\n🔹 <b>Профиль:</b> тіл, нөмір, аватар\n🔹 <b>AI-көмекші:</b> сабақ жоспарлау\n🔹 <b>Қолдау:</b> обращение жіберу`
    : `📖 <b>Как работает сайт</b>\n\n🔹 <b>Вход:</b> ${url} → телефон → код TG\n🔹 <b>Занятия:</b> список, темы, посещаемость\n🔹 <b>Оценки:</b> выставление, отчёты\n🔹 <b>Профиль:</b> язык, номер, аватар\n🔹 <b>AI-ассистент:</b> планирование\n🔹 <b>Поддержка:</b> обращения`;
  return tg(token, 'sendMessage', { chat_id: chatId, text: t, parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: k ? '◀️ Артқа' : '◀️ Назад', callback_data: 'back:help' }]] } });
}

function sendHelpGrades(chatId: number, lang: string, token: string) {
  const k = lang === 'kz';
  const t = k
    ? '📊 <b>Бағалар</b>\n\n🔹 Сабақты ашу → «Бағалар» бөлімі\n🔹 Қатысу + баға (1-10)\n🔹 Есептерде ай бойынша статистика\n🔹 PDF экспорт қолжетімді\n\n❓ Баға қою мүмкін емес? Сабақ статусы «completed» болуы керек'
    : '📊 <b>Оценки</b>\n\n🔹 Откройте занятие → «Оценки»\n🔹 Посещаемость + оценка (1-10)\n🔹 Статистика по месяцам в «Отчёты»\n🔹 PDF-экспорт доступен\n\n❓ Не получается? Статус занятия должен быть «completed»';
  return tg(token, 'sendMessage', { chat_id: chatId, text: t, parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: k ? '📩 Мәселе бар' : '📩 Есть проблема', callback_data: 'help:still_broken' }], [{ text: k ? '◀️ Артқа' : '◀️ Назад', callback_data: 'back:help' }]] } });
}

function sendHelpSchedule(chatId: number, lang: string, token: string) {
  const k = lang === 'kz';
  const t = k
    ? '📅 <b>Кесте</b>\n\n🔹 «Сабақтар» — барлық жоспарланған\n🔹 Сүзгі: апта/ай\n🔹 «+ Жаңа сабақ» — қосу\n🔹 Сабақты ашу → күн/уақыт өзгерту\n🔹 Статус: жоспарланған → аяқталған/болдырмау'
    : '📅 <b>Расписание</b>\n\n🔹 «Занятия» — все запланированные\n🔹 Фильтр: неделя/месяц\n🔹 «+ Новое занятие» — добавить\n🔹 Откройте → изменить дату/время\n🔹 Статус: запланировано → завершено/отменено';
  return tg(token, 'sendMessage', { chat_id: chatId, text: t, parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: k ? '◀️ Артқа' : '◀️ Назад', callback_data: 'back:help' }]] } });
}

function sendHelpAttendance(chatId: number, lang: string, token: string) {
  const k = lang === 'kz';
  const t = k
    ? '✅ <b>Қатысу</b>\n\n🔹 Сабақ → «Қатысу» бөлімі\n🔹 Оқушы тізімі автоматты\n🔹 Статус: қатысты/болмады/кешікті/сылтау\n🔹 Аяқталғаннан кейін де белгілеуге болады\n💡 Есептерде көрінеді'
    : '✅ <b>Посещаемость</b>\n\n🔹 Занятие → «Посещаемость»\n🔹 Список учеников автоматически\n🔹 Статус: присутствовал/отсутствовал/опоздал/ув.причина\n🔹 Можно отметить и после завершения\n💡 Видно в отчётах';
  return tg(token, 'sendMessage', { chat_id: chatId, text: t, parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: k ? '◀️ Артқа' : '◀️ Назад', callback_data: 'back:help' }]] } });
}

function sendHelpProfile(chatId: number, lang: string, token: string) {
  const k = lang === 'kz';
  const t = k
    ? '👤 <b>Профиль</b>\n\n🔹 <b>Аватар:</b> суретті басу → жүктеу\n🔹 <b>Тіл:</b> таңдау → сақтау\n🔹 <b>Нөмір:</b> «Өзгерту» → жаңа нөмір → TG код\n🔹 <b>Аты-жөні:</b> тек әкімші өзгертеді\n🔹 <b>Premium:</b> AI-көмекші, импорт/экспорт'
    : '👤 <b>Профиль</b>\n\n🔹 <b>Аватар:</b> нажать на фото → загрузить\n🔹 <b>Язык:</b> выбрать → сохранить\n🔹 <b>Номер:</b> «Изменить» → новый → код из TG\n🔹 <b>ФИО:</b> меняет только админ\n🔹 <b>Premium:</b> AI-ассистент, импорт/экспорт';
  return tg(token, 'sendMessage', { chat_id: chatId, text: t, parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: k ? '◀️ Артқа' : '◀️ Назад', callback_data: 'back:help' }]] } });
}

function sendHelpTelegramLink(chatId: number, lang: string, token: string) {
  const k = lang === 'kz';
  const t = k
    ? '🔗 <b>Telegram байланыстыру</b>\n\n1. @TarbieSagatyBot ашу\n2. /start басу\n3. «📱 Телефон жіберу» басу\n4. Нөмір жүйеде болса — байланысады ✅\n\n❌ «Табылмады» → әкімшіге хабарласыңыз'
    : '🔗 <b>Привязка Telegram</b>\n\n1. Откройте @TarbieSagatyBot\n2. Нажмите /start\n3. Нажмите «📱 Отправить номер»\n4. Если номер в системе — привязка готова ✅\n\n❌ «Не найден» → обратитесь к админу';
  return tg(token, 'sendMessage', { chat_id: chatId, text: t, parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: k ? '📩 Мәселе бар' : '📩 Проблема', callback_data: 'help:still_broken' }], [{ text: k ? '◀️ Артқа' : '◀️ Назад', callback_data: 'back:help' }]] } });
}

function sendHelpPhoneChange(chatId: number, lang: string, token: string) {
  const k = lang === 'kz';
  const t = k
    ? '📱 <b>Нөмір өзгерту</b>\n\n1. Профиль → «Өзгерту»\n2. Жаңа нөмір (+7XXXXXXXXXX)\n3. TG-ға 6 санды код келеді\n4. Кодты енгізу → растау\n\n⚠️ Жаңа нөмір Telegram-да тіркелген болуы керек!'
    : '📱 <b>Смена номера</b>\n\n1. Профиль → «Изменить»\n2. Новый номер (+7XXXXXXXXXX)\n3. В TG придёт 6-значный код\n4. Ввести код → подтвердить\n\n⚠️ Новый номер должен быть в Telegram!';
  return tg(token, 'sendMessage', { chat_id: chatId, text: t, parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: k ? '◀️ Артқа' : '◀️ Назад', callback_data: 'back:help' }]] } });
}

function sendHelpNotifications(chatId: number, lang: string, token: string) {
  const k = lang === 'kz';
  const t = k
    ? '🔔 <b>Хабарландырулар</b>\n\n🔹 TG арқылы келеді (бот байланысқан болса)\n🔹 Жаңа сабақ / есетру / баға беру сұрауы\n🔹 Обращениеге жауап\n\n❌ Келмесе:\n— TG байланысын тексеріңіз\n— Ботты блоктамаңыз\n— Хабарландыру рұқсатын тексеріңіз'
    : '🔔 <b>Уведомления</b>\n\n🔹 Приходят через TG (если бот привязан)\n🔹 Новое занятие / напоминание / оценка\n🔹 Ответ на обращение\n\n❌ Не приходят:\n— Проверьте привязку TG\n— Не блокируйте бота\n— Проверьте разрешения';
  return tg(token, 'sendMessage', { chat_id: chatId, text: t, parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: k ? '📩 Мәселе бар' : '📩 Проблема', callback_data: 'help:still_broken' }], [{ text: k ? '◀️ Артқа' : '◀️ Назад', callback_data: 'back:help' }]] } });
}

// ══════════════════════════════════════════════
// FAQ (12 items)
// ══════════════════════════════════════════════
function sendFAQ(chatId: number, lang: string, token: string) {
  const k = lang === 'kz';
  return tg(token, 'sendMessage', { chat_id: chatId, text: k ? '❓ <b>Жиі сұрақтар</b>' : '❓ <b>Частые вопросы</b>', parse_mode: 'HTML', reply_markup: { inline_keyboard: [
    [{ text: k ? '🔐 Кіру мүмкін емес' : '🔐 Не могу войти', callback_data: 'faq:login' }],
    [{ text: k ? '📱 Нөмір өзгерту' : '📱 Сменить номер', callback_data: 'faq:phone' }],
    [{ text: k ? '🤖 Ботты байланыстыру' : '🤖 Привязать бота', callback_data: 'faq:link' }],
    [{ text: k ? '📊 Бағаларды көру' : '📊 Где оценки?', callback_data: 'faq:grades' }],
    [{ text: k ? '📅 Сабақ қосу' : '📅 Добавить занятие', callback_data: 'faq:session' }],
    [{ text: k ? '✅ Қатысу белгілеу' : '✅ Отметить посещаемость', callback_data: 'faq:attend' }],
    [{ text: k ? '📄 PDF жүктеу' : '📄 Скачать PDF', callback_data: 'faq:pdf' }],
    [{ text: k ? '👤 Аватар өзгерту' : '👤 Сменить аватар', callback_data: 'faq:avatar' }],
    [{ text: k ? '🤖 AI-көмекші' : '🤖 AI-ассистент', callback_data: 'faq:ai' }],
    [{ text: k ? '⭐ Сабақты бағалау' : '⭐ Оценить занятие', callback_data: 'faq:rate' }],
    [{ text: k ? '🔔 Хабарландыру жоқ' : '🔔 Нет уведомлений', callback_data: 'faq:notif' }],
    [{ text: k ? '💬 Қолдауға жазу' : '💬 Написать в поддержку', callback_data: 'faq:support' }],
    [{ text: k ? '◀️ Артқа' : '◀️ Назад', callback_data: 'back:menu' }],
  ] } });
}

function handleFAQItem(chatId: number, key: string, lang: string, token: string) {
  const k = lang === 'kz';
  const answers: Record<string, { kz: string; ru: string }> = {
    login: { kz: '🔐 1. Нөмірді тексеріңіз (+7)\n2. TG байланысын тексеріңіз\n3. /start басыңыз\n4. Кэш тазалаңыз\n5. 5 мин күтіңіз', ru: '🔐 1. Проверьте номер (+7)\n2. Проверьте привязку TG\n3. Нажмите /start\n4. Очистите кэш\n5. Подождите 5 мин' },
    phone: { kz: '📱 Профиль → «Өзгерту» → жаңа нөмір → TG код → растау', ru: '📱 Профиль → «Изменить» → новый номер → код TG → подтвердить' },
    link: { kz: '🤖 @TarbieSagatyBot → /start → «📱 Телефон жіберу»', ru: '🤖 @TarbieSagatyBot → /start → «📱 Отправить номер»' },
    grades: { kz: '📊 Сабақты ашу → «Бағалар». Есептер бөлімінде ай статистика', ru: '📊 Откройте занятие → «Оценки». В «Отчёты» — статистика' },
    session: { kz: '📅 «Сабақтар» → «+ Жаңа сабақ» → толтыру → сақтау', ru: '📅 «Занятия» → «+ Новое» → заполнить → сохранить' },
    attend: { kz: '✅ Сабақ → «Қатысу» → статус таңдау', ru: '✅ Занятие → «Посещаемость» → выбрать статус' },
    pdf: { kz: '📄 Есептер → ай таңдау → «PDF жүктеу» батырмасы', ru: '📄 Отчёты → выбрать месяц → кнопка «Скачать PDF»' },
    avatar: { kz: '👤 Профиль → аватарды басу → суретті таңдау → жүктеу', ru: '👤 Профиль → нажать на аватар → выбрать фото → загрузить' },
    ai: { kz: '🤖 AI-көмекші сабақ жоспарлау, тақырыптар, белсенділіктер жасайды. Мәзір → AI-көмекші', ru: '🤖 AI-ассистент создаёт планы уроков, темы, активности. Меню → AI-ассистент' },
    rate: { kz: '⭐ Сабақ аяқталғаннан кейін TG-ға хабарлама келеді. 1-10 баға + себебі', ru: '⭐ После занятия в TG придёт запрос. Оценка 1-10 + причина' },
    notif: { kz: '🔔 TG байланысын тексеріңіз. Ботты блоктамаңыз. Рұқсаттарды тексеріңіз', ru: '🔔 Проверьте привязку TG. Не блокируйте бота. Проверьте разрешения' },
    support: { kz: '💬 Мәзір → «Қолдауға жазу» немесе сайтта Қолдау бөлімі', ru: '💬 Меню → «Написать в поддержку» или раздел Поддержка на сайте' },
  };
  const a = answers[key];
  if (!a) return sendFAQ(chatId, lang, token);
  return tg(token, 'sendMessage', { chat_id: chatId, text: k ? a.kz : a.ru, parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: k ? '📩 Шешілмеді' : '📩 Не помогло', callback_data: 'help:still_broken' }], [{ text: k ? '◀️ FAQ' : '◀️ FAQ', callback_data: 'menu:faq' }]] } });
}

// ══════════════════════════════════════════════
// RATING SYSTEM
// ══════════════════════════════════════════════
async function handleRateCmd(chatId: number, env: Env, token: string) {
  const lang = await getLang(chatId, env);
  const k = lang === 'kz';
  const user = await env.DB.prepare('SELECT id FROM users WHERE telegram_chat_id = ?').bind(String(chatId)).first<{ id: string }>();
  if (!user) return tg(token, 'sendMessage', { chat_id: chatId, text: k ? '❌ Алдымен Telegram-ды байланыстырыңыз' : '❌ Сначала привяжите Telegram' });

  // Find recent completed sessions for this student
  const sessions = await env.DB.prepare(
    `SELECT ts.id, ts.topic, ts.planned_date, c.name as class_name
     FROM tarbie_sessions ts
     JOIN classes c ON ts.class_id = c.id
     JOIN class_students cs ON cs.class_id = c.id AND cs.student_id = ?
     WHERE ts.status = 'completed'
       AND ts.id NOT IN (SELECT session_id FROM session_ratings WHERE student_id = ?)
     ORDER BY ts.planned_date DESC LIMIT 5`
  ).bind(user.id, user.id).all<{ id: string; topic: string; planned_date: string; class_name: string }>();

  if (!sessions.results.length) return tg(token, 'sendMessage', { chat_id: chatId, text: k ? '📭 Бағалайтын сабақ жоқ' : '📭 Нет занятий для оценки' });

  const buttons = sessions.results.map(s => [{ text: `${s.planned_date} — ${s.topic.slice(0, 30)}`, callback_data: `rate_session:${s.id}` }]);
  buttons.push([{ text: k ? '◀️ Артқа' : '◀️ Назад', callback_data: 'back:menu' }]);
  return tg(token, 'sendMessage', { chat_id: chatId, text: k ? '⭐ <b>Сабаққа баға беру</b>\n\nТаңдаңыз:' : '⭐ <b>Оценить занятие</b>\n\nВыберите:', parse_mode: 'HTML', reply_markup: { inline_keyboard: buttons } });
}

async function submitRating(chatId: number, sessionId: string, rating: number, reason: string | null, isAnonymous: boolean, env: Env, token: string, lang: string) {
  const k = lang === 'kz';
  const user = await env.DB.prepare('SELECT id FROM users WHERE telegram_chat_id = ?').bind(String(chatId)).first<{ id: string }>();
  if (!user) return tg(token, 'sendMessage', { chat_id: chatId, text: '❌ Error' });

  const session = await env.DB.prepare('SELECT teacher_id, topic FROM tarbie_sessions WHERE id = ?').bind(sessionId).first<{ teacher_id: string; topic: string }>();
  if (!session) return tg(token, 'sendMessage', { chat_id: chatId, text: '❌ Session not found' });

  // Check duplicate
  const exists = await env.DB.prepare('SELECT id FROM session_ratings WHERE session_id = ? AND student_id = ?').bind(sessionId, user.id).first();
  if (exists) return tg(token, 'sendMessage', { chat_id: chatId, text: k ? '⚠️ Сіз бұл сабақты бағалап қойғансыз' : '⚠️ Вы уже оценили это занятие' });

  // Smart filter
  let isValid = 1;
  let filterReason: string | null = null;
  if ((rating <= 2 || rating >= 10) && (!reason || reason.trim().length < 5)) { isValid = 0; filterReason = 'extreme_no_reason'; }
  else if (reason && reason.trim().length > 0 && reason.trim().length < 3) { isValid = 0; filterReason = 'too_short'; }
  else if (reason && /^(.)\1{4,}$/.test(reason.trim())) { isValid = 0; filterReason = 'gibberish'; }

  const id = generateId();
  await env.DB.prepare(
    'INSERT INTO session_ratings (id, session_id, student_id, teacher_id, rating, reason, is_valid, filter_reason, is_anonymous, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(id, sessionId, user.id, session.teacher_id, rating, reason, isValid, filterReason, isAnonymous ? 1 : 0, nowISO()).run();

  const anonLabel = isAnonymous ? (k ? ' 🕶' : ' 🕶') : '';
  const emoji = rating >= 8 ? '🌟' : rating >= 5 ? '👍' : '😔';
  return tg(token, 'sendMessage', {
    chat_id: chatId,
    text: k
      ? `${emoji} Рахмет! Сіз <b>${rating}/10</b> қойдыңыз.${anonLabel}${reason ? '\n\n💬 ' + esc(reason) : ''}\n\nБағаңыз қабылданды ✅`
      : `${emoji} Спасибо! Вы поставили <b>${rating}/10</b>.${anonLabel}${reason ? '\n\n💬 ' + esc(reason) : ''}\n\nОценка принята ✅`,
    parse_mode: 'HTML',
    reply_markup: { inline_keyboard: [[{ text: k ? '◀️ Мәзір' : '◀️ Меню', callback_data: 'back:menu' }]] },
  });
}

// Send rating request to students after session completion
export async function sendRatingRequest(sessionId: string, topic: string, env: Env, token: string) {
  const session = await env.DB.prepare(
    'SELECT ts.class_id FROM tarbie_sessions ts WHERE ts.id = ?'
  ).bind(sessionId).first<{ class_id: string }>();
  if (!session) return;

  const students = await env.DB.prepare(
    `SELECT u.telegram_chat_id, u.lang FROM class_students cs
     JOIN users u ON cs.student_id = u.id
     WHERE cs.class_id = ? AND u.telegram_chat_id IS NOT NULL`
  ).bind(session.class_id).all<{ telegram_chat_id: string; lang: string }>();

  for (const s of students.results) {
    const k = s.lang === 'kz';
    await tg(token, 'sendMessage', {
      chat_id: s.telegram_chat_id,
      text: k
        ? `📝 <b>Сабақ аяқталды!</b>\n\n📋 Тақырып: ${esc(topic)}\n\nСабаққа баға беріңіз:`
        : `📝 <b>Занятие завершено!</b>\n\n📋 Тема: ${esc(topic)}\n\nОцените занятие:`,
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: [[{ text: k ? '⭐ Бағалау' : '⭐ Оценить', callback_data: `rate_session:${sessionId}` }]] },
    });
  }
}

// Send grade/comment notification to a student via Telegram
export async function sendGradeNotification(
  studentId: string, topic: string, grade: number | null, comment: string | null, status: string, env: Env, token: string
) {
  const student = await env.DB.prepare(
    'SELECT telegram_chat_id, lang FROM users WHERE id = ? AND telegram_chat_id IS NOT NULL'
  ).bind(studentId).first<{ telegram_chat_id: string; lang: string }>();
  if (!student) return;

  const k = student.lang === 'kz';
  const statusText = status === 'present' ? (k ? 'Қатысты ✅' : 'Присутствовал(а) ✅') :
    status === 'makeup' ? (k ? 'Отработка 🔄' : 'Отработка 🔄') :
    (k ? 'Келмеді ❌' : 'Отсутствовал(а) ❌');

  let text = k
    ? `📊 <b>Баға қойылды!</b>\n\n📋 Тақырып: ${esc(topic)}\n📌 Статус: ${statusText}`
    : `📊 <b>Оценка выставлена!</b>\n\n📋 Тема: ${esc(topic)}\n📌 Статус: ${statusText}`;

  if (grade !== null) {
    text += k ? `\n⭐ Баға: <b>${grade}/100</b>` : `\n⭐ Оценка: <b>${grade}/100</b>`;
  }
  if (comment) {
    text += `\n💬 ${k ? 'Пікір' : 'Комментарий'}: ${esc(comment)}`;
  }

  await tg(token, 'sendMessage', { chat_id: student.telegram_chat_id, text, parse_mode: 'HTML' });
}

// ══════════════════════════════════════════════
// TICKET CREATION
// ══════════════════════════════════════════════
function startTicketFlow(chatId: number, lang: string, type: string, env: Env, token: string) {
  const k = lang === 'kz';
  const titles: Record<string, { kz: string; ru: string }> = {
    complaint: { kz: '⚠️ <b>Мұғалімге шағым</b>', ru: '⚠️ <b>Жалоба на учителя</b>' },
    request: { kz: '📨 <b>Колледжге сұраныс</b>', ru: '📨 <b>Обращение в колледж</b>' },
    support: { kz: '📩 <b>Қолдауға жазу</b>', ru: '📩 <b>Обращение в поддержку</b>' },
  };
  const title = titles[type] ?? titles.support!;
  env.KV.put(`bot_flow:${chatId}`, JSON.stringify({ step: 'ask_fio', type }), { expirationTtl: 600 });
  return tg(token, 'sendMessage', { chat_id: chatId, text: `${k ? title.kz : title.ru}\n\n👤 ${k ? 'Аты-жөніңізді жазыңыз:' : 'Напишите ваше ФИО:'}`, parse_mode: 'HTML' });
}

async function createTicketFromBot(chatId: number, flow: FlowState, env: Env, token: string, lang: string) {
  const ticketId = generateId();
  const messageId = generateId();
  const now = nowISO();
  const k = lang === 'kz';

  let userId: string | null = null;
  let schoolId = '__default__';
  const existing = await env.DB.prepare('SELECT id, school_id FROM users WHERE telegram_chat_id = ?').bind(String(chatId)).first<{ id: string; school_id: string }>();
  if (existing) { userId = existing.id; schoolId = existing.school_id; }

  const prefixes: Record<string, Record<string, string>> = { complaint: { kz: '[Шағым]', ru: '[Жалоба]' }, request: { kz: '[Сұраныс]', ru: '[Обращение]' }, support: { kz: '[Қолдау]', ru: '[Поддержка]' } };
  const prefix = prefixes[flow.type ?? 'support']?.[lang] ?? '[Поддержка]';
  const subject = `${prefix} ${flow.subject ?? ''}`;
  const fullMessage = `👤 ${flow.fio}\n📱 ${flow.phone}\n\n${flow.message ?? ''}`;

  if (userId) {
    await env.DB.batch([
      env.DB.prepare('INSERT INTO support_tickets (id, school_id, user_id, subject, priority, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(ticketId, schoolId, userId, subject, 'normal', now, now),
      env.DB.prepare('INSERT INTO support_messages (id, ticket_id, sender_id, is_admin, message, created_at) VALUES (?, ?, ?, 0, ?, ?)').bind(messageId, ticketId, userId, fullMessage, now),
    ]);
  } else {
    const admin = await env.DB.prepare("SELECT id, school_id FROM users WHERE role = 'admin' LIMIT 1").first<{ id: string; school_id: string }>();
    if (!admin) return tg(token, 'sendMessage', { chat_id: chatId, text: k ? '❌ Қате. Кейінірек қайталаңыз.' : '❌ Ошибка. Попробуйте позже.' });
    schoolId = admin.school_id; userId = admin.id;
    await env.DB.batch([
      env.DB.prepare('INSERT INTO support_tickets (id, school_id, user_id, subject, priority, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(ticketId, schoolId, userId, subject, 'normal', now, now),
      env.DB.prepare('INSERT INTO support_messages (id, ticket_id, sender_id, is_admin, message, created_at) VALUES (?, ?, ?, 0, ?, ?)').bind(messageId, ticketId, userId, fullMessage + `\n\n[Telegram: ${chatId}]`, now),
    ]);
  }

  await tg(token, 'sendMessage', {
    chat_id: chatId,
    text: k
      ? `✅ <b>Сұранысыңыз қабылданды!</b>\n\n📋 Тақырып: ${flow.subject}\n🔖 ID: <code>${ticketId.slice(0, 8)}</code>\n\nЖауап келгенде хабарлаймыз.`
      : `✅ <b>Обращение принято!</b>\n\n📋 Тема: ${flow.subject}\n🔖 ID: <code>${ticketId.slice(0, 8)}</code>\n\nСообщим, когда будет ответ.`,
    parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: k ? '◀️ Мәзір' : '◀️ Меню', callback_data: 'back:menu' }]] },
  });
  await forwardTicketToAdmin(ticketId, subject, fullMessage, flow.fio ?? '', env, token);
}

// ══════════════════════════════════════════════
// FORWARD TO ADMIN
// ══════════════════════════════════════════════
export async function forwardTicketToAdmin(ticketId: string, subject: string, message: string, senderName: string, env: Env, token: string) {
  const adminChatId = await env.KV.get('support_admin_chat_id');
  if (!adminChatId) {
    structuredLog('warn', 'support_admin_chat_id not set in KV, cannot forward ticket', { ticketId });
    return;
  }
  const res = await tg(token, 'sendMessage', { chat_id: adminChatId, text: `🔔 <b>Новое обращение</b>\n\n📋 <b>Тема:</b> ${esc(subject)}\n👤 <b>От:</b> ${esc(senderName)}\n🔖 <b>ID:</b> <code>${ticketId.slice(0, 8)}</code>\n\n💬 ${esc(message.slice(0, 500))}${message.length > 500 ? '...' : ''}`, parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: '✍️ Ответить', callback_data: `reply:${ticketId}` }, { text: '🔄 В работу', callback_data: `progress:${ticketId}` }], [{ text: '✅ Закрыть', callback_data: `close:${ticketId}` }]] } });
  if (!res.ok) {
    structuredLog('error', 'Failed to forward ticket to admin', { ticketId, error: res.description });
  }
}

export async function forwardMessageToAdmin(ticketId: string, ticketSubject: string, message: string, senderName: string, env: Env, token: string) {
  const adminChatId = await env.KV.get('support_admin_chat_id');
  if (!adminChatId) return;
  await tg(token, 'sendMessage', { chat_id: adminChatId, text: `💬 <b>Новое сообщение</b>\n\n📋 <b>Тикет:</b> ${esc(ticketSubject)}\n👤 <b>От:</b> ${esc(senderName)}\n🔖 <b>ID:</b> <code>${ticketId.slice(0, 8)}</code>\n\n${esc(message.slice(0, 500))}${message.length > 500 ? '...' : ''}`, parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: '✍️ Ответить', callback_data: `reply:${ticketId}` }, { text: '✅ Закрыть', callback_data: `close:${ticketId}` }]] } });
}

// ══════════════════════════════════════════════
// LESSON APPROVAL NOTIFICATION
// ══════════════════════════════════════════════
export async function notifyAdminLessonApproval(curatorName: string, topic: string, approvalId: string, env: Env, token: string) {
  // Notify all admins in the same school who have telegram_chat_id
  const adminChatId = await env.KV.get('support_admin_chat_id');
  if (!adminChatId) {
    structuredLog('warn', 'support_admin_chat_id not set, cannot notify about lesson approval', { approvalId });
    return;
  }
  const text = `📝 <b>Новая заявка на утверждение урока</b>\n\n👤 <b>Куратор:</b> ${esc(curatorName)}\n📋 <b>Тема:</b> ${esc(topic)}\n🔖 <b>ID:</b> <code>${approvalId.slice(0, 8)}</code>\n\n🔗 Зайдите в систему для проверки и подписания.`;
  await tg(token, 'sendMessage', { chat_id: adminChatId, text, parse_mode: 'HTML' });
}

export async function notifyCuratorApprovalResult(curatorId: string, topic: string, approved: boolean, comment: string | null, env: Env, token: string) {
  const curator = await env.DB.prepare('SELECT telegram_chat_id FROM users WHERE id = ?').bind(curatorId).first<{ telegram_chat_id: string | null }>();
  if (!curator?.telegram_chat_id) return;

  let text: string;
  if (approved) {
    text = `✅ <b>Урок утверждён</b>\n\n📋 <b>Тема:</b> ${esc(topic)}\n\n🎉 Ваш урок одобрен администратором. Можете скачать подписанный PDF в разделе «Утверждение уроков».`;
  } else {
    text = `❌ <b>Урок отклонён</b>\n\n📋 <b>Тема:</b> ${esc(topic)}`;
    if (comment) {
      text += `\n💬 <b>Комментарий:</b> ${esc(comment)}`;
    }
    text += `\n\nВнесите исправления и отправьте заново.`;
  }
  await tg(token, 'sendMessage', { chat_id: curator.telegram_chat_id, text, parse_mode: 'HTML' });
}

// ══════════════════════════════════════════════
// ADMIN REPLY
// ══════════════════════════════════════════════
async function handleAdminReply(msg: TgMessage, env: Env, token: string): Promise<boolean> {
  const replyText = msg.reply_to_message?.text ?? '';
  const m = replyText.match(/ID:\s*([a-zA-Z0-9]+)/);
  if (!m) return false;
  const ticket = await env.DB.prepare("SELECT id, user_id, subject FROM support_tickets WHERE id LIKE ? || '%'").bind(m[1]!).first<{ id: string; user_id: string; subject: string }>();
  if (!ticket) return false;
  await saveAdminReply(msg.chat.id, ticket.id, msg.text ?? '', env, token);
  return true;
}

async function saveAdminReply(chatId: number, ticketId: string, message: string, env: Env, token: string) {
  const admin = await env.DB.prepare("SELECT id FROM users WHERE telegram_chat_id = ? OR (role = 'admin')").bind(String(chatId)).first<{ id: string }>();
  if (!admin) return tg(token, 'sendMessage', { chat_id: chatId, text: '❌ Администратор не найден' });

  const msgId = generateId(); const now = nowISO();
  await env.DB.batch([
    env.DB.prepare('INSERT INTO support_messages (id, ticket_id, sender_id, is_admin, message, created_at) VALUES (?, ?, ?, 1, ?, ?)').bind(msgId, ticketId, admin.id, message, now),
    env.DB.prepare("UPDATE support_tickets SET updated_at = ?, status = 'in_progress' WHERE id = ?").bind(now, ticketId),
  ]);

  const ticket = await env.DB.prepare('SELECT user_id, subject FROM support_tickets WHERE id = ?').bind(ticketId).first<{ user_id: string; subject: string }>();
  if (ticket) {
    const u = await env.DB.prepare('SELECT telegram_chat_id, lang FROM users WHERE id = ?').bind(ticket.user_id).first<{ telegram_chat_id: string | null; lang: string }>();
    if (u?.telegram_chat_id) {
      const k = u.lang === 'kz';
      await tg(token, 'sendMessage', { chat_id: u.telegram_chat_id, text: k ? `📩 <b>Жауап келді!</b>\n\n📋 ${esc(ticket.subject)}\n\n💬 ${esc(message)}` : `📩 <b>Ответ на обращение!</b>\n\n📋 ${esc(ticket.subject)}\n\n💬 ${esc(message)}`, parse_mode: 'HTML' });
    }
  }
  return tg(token, 'sendMessage', { chat_id: chatId, text: '✅ Ответ отправлен / Жауап жіберілді' });
}

// ══════════════════════════════════════════════
// CONTACT & LOGIN
// ══════════════════════════════════════════════
async function handleContact(msg: TgMessage, env: Env, token: string) {
  const chatId = msg.chat.id;
  const lang = await getLang(chatId, env);
  const k = lang === 'kz';

  // Security: only allow sharing own contact (button "Send my number")
  if (msg.contact!.user_id && msg.contact!.user_id !== msg.from.id) {
    return tg(token, 'sendMessage', { chat_id: chatId, text: k ? '⚠️ Тек өз нөміріңізді жіберіңіз. Төмендегі батырманы басыңыз.' : '⚠️ Отправьте свой номер. Нажмите кнопку «📱 Отправить мой номер».',
      reply_markup: { keyboard: [[{ text: k ? '📱 Менің нөмірімді жіберу' : '📱 Отправить мой номер', request_contact: true }]], resize_keyboard: true, one_time_keyboard: true } });
  }

  // Prevent re-registration: if this chat is already linked, reject
  const alreadyLinked = await env.DB.prepare('SELECT id, full_name FROM users WHERE telegram_chat_id = ?').bind(String(chatId)).first<{ id: string; full_name: string }>();
  if (alreadyLinked) {
    return tg(token, 'sendMessage', { chat_id: chatId, text: k ? `✅ Сіз бұрыннан тіркелгенсіз: ${alreadyLinked.full_name}` : `✅ Вы уже привязаны: ${alreadyLinked.full_name}`, reply_markup: { inline_keyboard: [[{ text: k ? '📋 Мәзір' : '📋 Меню', callback_data: 'back:menu' }]] } });
  }

  const phone = msg.contact!.phone_number.startsWith('+') ? msg.contact!.phone_number : `+${msg.contact!.phone_number}`;
  const user = await env.DB.prepare('SELECT id, full_name, lang FROM users WHERE phone = ?').bind(phone).first<{ id: string; full_name: string; lang: string }>();
  if (!user) { return tg(token, 'sendMessage', { chat_id: chatId, text: k ? '❌ Нөмір жүйеде табылмады' : '❌ Номер не найден в системе' }); }

  // Check if this phone is already linked to another Telegram
  const phoneLinked = await env.DB.prepare('SELECT telegram_chat_id FROM users WHERE id = ?').bind(user.id).first<{ telegram_chat_id: string | null }>();
  if (phoneLinked?.telegram_chat_id && phoneLinked.telegram_chat_id !== String(chatId)) {
    return tg(token, 'sendMessage', { chat_id: chatId, text: k ? '⚠️ Бұл нөмір басқа Telegram-ға байланысты.' : '⚠️ Этот номер уже привязан к другому Telegram.' });
  }

  await env.DB.prepare('UPDATE users SET telegram_chat_id = ? WHERE id = ?').bind(String(chatId), user.id).run();
  const uk = user.lang === 'kz';
  return tg(token, 'sendMessage', { chat_id: chatId, text: uk ? `✅ Telegram байланыстырылды!\n\n👤 ${user.full_name}` : `✅ Telegram привязан!\n\n👤 ${user.full_name}`, reply_markup: { inline_keyboard: [[{ text: uk ? '📋 Мәзір' : '📋 Меню', callback_data: 'back:menu' }]] } });
}

async function handleLoginCmd(chatId: number, env: Env, token: string) {
  const user = await env.DB.prepare('SELECT id, lang FROM users WHERE telegram_chat_id = ?').bind(String(chatId)).first<{ id: string; lang: string }>();
  if (!user) { const l = await getLang(chatId, env); return tg(token, 'sendMessage', { chat_id: chatId, text: l === 'kz' ? '❌ Алдымен /start басыңыз' : '❌ Сначала нажмите /start' }); }
  const magicToken = generateId();
  await env.KV.put(`tg_auth:${magicToken}`, user.id, { expirationTtl: 300 });
  const url = `${env.APP_URL || 'https://tarbie.online'}?auth_token=${magicToken}`;
  const k = user.lang === 'kz';
  return tg(token, 'sendMessage', { chat_id: chatId, text: k ? '🔗 <b>Жүйеге кіру</b> (5 мин):' : '🔗 <b>Вход</b> (5 мин):', parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: k ? '🚀 Кіру' : '🚀 Войти', url }]] } });
}

// ══════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════
async function getLang(chatId: number, env: Env): Promise<string> {
  const c = await env.KV.get(`bot_lang:${chatId}`);
  if (c) return c;
  const u = await env.DB.prepare('SELECT lang FROM users WHERE telegram_chat_id = ?').bind(String(chatId)).first<{ lang: string }>();
  return u?.lang ?? 'ru';
}

function esc(s: string): string { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

export default bot;
