import { Hono } from 'hono';
import type { HonoEnv } from '../env.js';
import { authMiddleware, requireRole } from '../middleware/auth.js';
import { structuredLog } from '@tarbie/shared';

const assistant = new Hono<HonoEnv>();

assistant.use('*', authMiddleware, requireRole('admin', 'teacher'));

const DAILY_LIMIT = 30;

// Strict restriction prefix — AI must only answer about project-related topics
const RESTRICTION_RU = `ВАЖНО: Ты — AI-ассистент ТОЛЬКО для кураторов колледжей Казахстана в системе «Тәрбие Сағаты». Ты ОБЯЗАН отвечать СТРОГО по теме: тәрбие сағат (воспитательный час), кураторство, педагогика, работа с учениками, родителями, документация для кураторов.

ЗАПРЕЩЕНО:
- Отвечать на вопросы, НЕ связанные с кураторской/педагогической работой (программирование, рецепты, политика, развлечения, личные вопросы и т.д.)
- Генерировать код, скрипты, SQL-запросы
- Обсуждать внутреннюю работу системы или API
- Давать медицинские, юридические или финансовые консультации

Если запрос НЕ по теме — вежливо откажи: «Извините, я могу помочь только с вопросами по кураторской работе и тәрбие сағат.»

`;

const RESTRICTION_KZ = `МАҢЫЗДЫ: Сен — «Тәрбие Сағаты» жүйесіндегі Қазақстан колледж кураторларына арналған AI-көмекшісің. Сен ТЕГІС тақырып бойынша ғана жауап беруің КЕРЕК: тәрбие сағат, кураторлық, педагогика, оқушылармен жұмыс, ата-аналармен жұмыс, куратор құжаттамасы.

ТЫЙЫМ САЛЫНАДЫ:
- Кураторлық/педагогикалық жұмысқа ҚАТЫСЫ ЖОҚ сұрақтарға жауап беру (бағдарламалау, рецепттер, саясат, ойын-сауық, жеке сұрақтар т.б.)
- Код, скрипттер, SQL-сұраулар жасау
- Жүйенің ішкі жұмысы немесе API туралы талқылау
- Медициналық, заңдық немесе қаржылық кеңес беру

Егер сұрау тақырыптан тыс болса — сыпайы бас тарт: «Кешіріңіз, мен тек кураторлық жұмыс пен тәрбие сағат бойынша көмектесе аламын.»

`;

const SYSTEM_PROMPTS: Record<string, Record<string, string>> = {
  topics: {
    ru: RESTRICTION_RU + 'Генерируй 10 креативных тем для тарбие сағат (воспитательный час) по запросу пользователя. Формат: нумерованный список с названием темы в кавычках и кратким описанием. Отвечай на русском.',
    kz: RESTRICTION_KZ + 'Пайдаланушының сұрауы бойынша тәрбие сағатына 10 креативті тақырып жаса. Формат: нөмірленген тізім, тақырып атауы тырнақшада және қысқаша сипаттамасымен. Қазақша жауап бер.',
  },
  plan: {
    ru: RESTRICTION_RU + 'Составь подробный план занятия (тарбие сағат) на 45 минут по заданной теме. Включи цели, ход занятия по этапам с хронометражем, интерактивные элементы, рефлексию и материалы. Отвечай на русском.',
    kz: RESTRICTION_KZ + 'Берілген тақырып бойынша 45 минуттық сабақтың (тәрбие сағат) толық жоспарын құр. Мақсаттарды, хронометражбен кезеңдерді, интерактивті элементтерді, рефлексияны және материалдарды қос. Қазақша жауап бер.',
  },
  activity: {
    ru: RESTRICTION_RU + 'Предложи 5-6 интерактивных активностей и игр по заданной теме для студентов. Для каждой активности укажи формат, правила, время и ожидаемый результат. Отвечай на русском.',
    kz: RESTRICTION_KZ + 'Берілген тақырып бойынша студенттерге арналған 5-6 интерактивті белсенділік пен ойын ұсын. Әр белсенділік үшін формат, ережелер, уақыт пен күтілетін нәтижені көрсет. Қазақша жауап бер.',
  },
  advice: {
    ru: RESTRICTION_RU + 'Дай 7 практических советов куратору по описанной ситуации. Включи шаги действий, работу с родителями и рекомендации. Отвечай на русском.',
    kz: RESTRICTION_KZ + 'Сипатталған жағдай бойынша кураторға 7 практикалық кеңес бер. Іс-әрекет қадамдарын, ата-аналармен жұмысты және ұсыныстарды қос. Қазақша жауап бер.',
  },
  document: {
    ru: RESTRICTION_RU + 'Составь шаблон документа по запросу. Включи все необходимые поля, структуру и пример заполнения. Отвечай на русском.',
    kz: RESTRICTION_KZ + 'Сұрау бойынша құжат үлгісін құр. Барлық қажетті өрістерді, құрылымды және толтыру мысалын қос. Қазақша жауап бер.',
  },
};

assistant.post('/generate', async (c) => {
  const user = c.get('user');
  const body = await c.req.json() as { category: string; prompt: string; lang: string };
  const { category, prompt, lang } = body;

  if (!prompt?.trim() || !category) {
    return c.json({ success: false, message: 'prompt and category required' }, 400);
  }

  if (!SYSTEM_PROMPTS[category]) {
    return c.json({ success: false, message: 'invalid category' }, 400);
  }

  // Rate limit: daily usage per user
  const today = new Date().toISOString().split('T')[0];
  const usageKey = `ai_usage:${user.id}:${today}`;
  const usageStr = await c.env.KV.get(usageKey);
  const usage = usageStr ? parseInt(usageStr, 10) : 0;

  if (usage >= DAILY_LIMIT) {
    return c.json({
      success: false,
      code: 'RATE_LIMIT',
      message: lang === 'kz'
        ? `Күнделікті лимит (${DAILY_LIMIT} сұрау) аяқталды. Ертең қайта көріңіз.`
        : `Дневной лимит (${DAILY_LIMIT} запросов) исчерпан. Попробуйте завтра.`,
    }, 429);
  }

  const apiKey = c.env.GEMINI_API_KEY;
  if (!apiKey) {
    return c.json({ success: false, message: 'AI service not configured' }, 503);
  }

  const systemPrompt = SYSTEM_PROMPTS[category]![lang === 'kz' ? 'kz' : 'ru']!;

  try {
    const models = ['gemini-2.5-flash', 'gemini-2.0-flash-lite'];
    const geminiBody = JSON.stringify({
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: [{ parts: [{ text: prompt.trim() }] }],
      generationConfig: {
        temperature: 0.8,
        maxOutputTokens: 2048,
      },
    });

    let geminiRes: Response | null = null;
    for (const model of models) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      geminiRes = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: geminiBody,
      });
      if (geminiRes.ok) {
        structuredLog('info', 'Gemini model used', { model });
        break;
      }
      if (geminiRes.status === 429) {
        structuredLog('warn', `Model ${model} rate limited, trying next`);
        continue;
      }
      break;
    }

    if (!geminiRes || !geminiRes.ok) {
      const errText = geminiRes ? await geminiRes.text() : 'no response';
      structuredLog('error', 'Gemini API error', { status: geminiRes?.status, body: errText.slice(0, 500) });
      const msg = geminiRes?.status === 429
        ? (lang === 'kz' ? 'AI қызметі қазір бос емес. Бірнеше секунд күтіп қайта көріңіз.' : 'AI сервис перегружен. Подождите несколько секунд и попробуйте снова.')
        : (lang === 'kz' ? 'AI қызметі уақытша қол жетімсіз' : 'AI сервис временно недоступен');
      return c.json({ success: false, message: msg }, 502);
    }

    const geminiData = await geminiRes.json() as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };

    const text = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      return c.json({ success: false, message: 'Empty response from AI' }, 502);
    }

    // Increment usage
    await c.env.KV.put(usageKey, String(usage + 1), { expirationTtl: 86400 });

    structuredLog('info', 'AI generation', { user_id: user.id, category, usage: usage + 1 });

    return c.json({
      success: true,
      data: {
        result: text,
        usage: { used: usage + 1, limit: DAILY_LIMIT },
      },
    });
  } catch (err) {
    structuredLog('error', 'Gemini fetch error', { error: err instanceof Error ? err.message : 'unknown' });
    return c.json({ success: false, message: 'AI service error' }, 502);
  }
});

// Get current usage
assistant.get('/usage', async (c) => {
  const user = c.get('user');
  const today = new Date().toISOString().split('T')[0];
  const usageKey = `ai_usage:${user.id}:${today}`;
  const usageStr = await c.env.KV.get(usageKey);
  const used = usageStr ? parseInt(usageStr, 10) : 0;
  return c.json({ success: true, data: { used, limit: DAILY_LIMIT } });
});

export default assistant;
