# Следующие шаги для завершения настройки

## ✅ Что уже сделано:

1. ✅ D1 база данных создана: `87e867fe-6797-431f-adc3-59593cee80af`
2. ✅ KV namespace создан: `4302997f858144d481fade050ff55e8b`
3. ✅ Queue создана: `tarbie-notifications`
4. ✅ Миграции применены
5. ✅ Создан администратор с номером: `+77001234567`

## 📝 Что нужно сделать:

### 1. Настроить секреты для API Worker

```bash
cd apps/worker

# JWT секрет (минимум 32 символа)
npx wrangler secret put JWT_SECRET
# Введите: my-super-secret-jwt-key-at-least-32-characters-long

# OTP секрет (минимум 32 символа)
npx wrangler secret put OTP_SECRET
# Введите: my-super-secret-otp-key-at-least-32-characters-long
```

### 2. Создать Telegram бота

1. Откройте https://t.me/BotFather
2. Отправьте команду: `/newbot`
3. Введите имя бота (например: `Tarbie Sagaty Manager`)
4. Введите username бота (например: `TarbieSagatyBot`)

### 3. Настроить секреты для Bot Worker

```bash
cd apps/bot-worker

# Telegram Bot Token (от BotFather)
npx wrangler secret put TELEGRAM_BOT_TOKEN
# Введите токен от BotFather

# Webhook Secret (любая случайная строка)
npx wrangler secret put TELEGRAM_WEBHOOK_SECRET
# Введите: my-random-webhook-secret-string-123

# WhatsApp (опционально, можно пропустить)
# npx wrangler secret put WHATSAPP_TOKEN
# npx wrangler secret put WHATSAPP_PHONE_NUMBER_ID
```

### 4. Задеплоить Workers

```bash
# API Worker
cd apps/worker
npx wrangler deploy

# Bot Worker  
cd ../bot-worker
npx wrangler deploy
```

После деплоя вы увидите URL bot-worker (например: `https://tarbie-bot.bahtyarsanzhar.workers.dev`)

### 5. Настроить Telegram Webhook

✅ **УЖЕ ВЫПОЛНЕНО!** Webhook настроен на `https://tarbie-bot.bahtyarsanzhar.workers.dev/telegram/webhook`

Для справки, команда PowerShell:


### 6. Деплой Frontend

```bash
cd apps/web

# Создайте .env.production
echo VITE_API_URL=https://dprabota.bahtyarsanzhar.workers.dev > .env.production
echo VITE_TELEGRAM_BOT_USERNAME=TarbieSagatyBot >> .env.production

# Соберите
pnpm build

# Задеплойте
npx wrangler pages deploy dist --project-name=tarbie-sagaty
```

### 7. Проверка работы

1. Откройте URL Cloudflare Pages
2. Войдите с номером: `+77001234567`
3. Проверьте логи для получения OTP:
   ```bash
   npx wrangler tail dprabota
   ```
4. Введите код и войдите

## 🔧 Локальная разработка

Для локальной разработки создайте файлы вручную (они в .gitignore):

**apps/worker/.dev.vars:**
```
JWT_SECRET=local-dev-jwt-secret-min-32-chars
OTP_SECRET=local-dev-otp-secret-min-32-chars
```

**apps/bot-worker/.dev.vars:**
```
TELEGRAM_BOT_TOKEN=ваш-токен-от-botfather
TELEGRAM_WEBHOOK_SECRET=local-webhook-secret
```

**apps/web/.env.local:**
```
VITE_API_URL=http://localhost:8787
VITE_TELEGRAM_BOT_USERNAME=TarbieSagatyBot
```

Запустите в 3 терминалах:
```bash
# Терминал 1
cd apps/worker && pnpm dev

# Терминал 2  
cd apps/bot-worker && pnpm dev

# Терминал 3
cd apps/web && pnpm dev
```{
  "level": "info",
  "timestamp": "2026-03-14T20:01:33.213Z",
  "message": "Verify OTP attempt",
  "phone": "+77085732571",
  "method": "twilio",
  "otpLength": 6,
  "$workers": {
    "event": {
      "request": {
        "url": "https://dprabota.bahtyarsanzhar.workers.dev/api/auth/verify",
        "method": "POST",
        "path": "/api/auth/verify"
      }
    },
    "outcome": "ok",
    "scriptName": "dprabota",
    "eventType": "fetch",
    "executionModel": "stateless",
    "scriptVersion": {
      "id": "a5f848bc-a395-493d-8642-ce40d7f42489"
    },
    "truncated": false,
    "requestId": "9dc5def32ba6f55f"
  },
  "$metadata": {
    "id": "01KKPZ15GXXBD37ZJ2MZCNASGM",
    "requestId": "9dc5def32ba6f55f",
    "trigger": "POST /api/auth/verify",
    "service": "dprabota",
    "level": "info",
    "statusCode": 400,
    "message": "Verify OTP attempt",
    "url": "https://dprabota.bahtyarsanzhar.workers.dev/api/auth/verify",
    "account": "ab97371e176030ab556199f93e3588e4",
    "provider": "cloudflare",
    "type": "cf-worker",
    "fingerprint": "3fd2a25fc862afe558ffb67efbad6e2d",
    "origin": "fetch",
    "messageTemplate": "Verify OTP attempt"
  }
}

Откройте http://localhost:5173

## 📞 Данные для входа

- **Номер телефона**: `+77001234567`
- **Роль**: Администратор
- **OTP код**: Проверьте в логах worker при входе

## 🎯 Готово!

После выполнения всех шагов ваша система будет полностью настроена и готова к использованию.
