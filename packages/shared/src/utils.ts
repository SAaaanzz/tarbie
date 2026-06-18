// Вспомогательные функции, общие для всего проекта:
// генерация ID, работа с датами, шаблоны уведомлений, коды ошибок, логирование.

// Сгенерировать уникальный идентификатор (UUID).
export function generateId(): string {
  return crypto.randomUUID();
}

// Текущее время в формате ISO (используется для created_at/updated_at).
export function nowISO(): string {
  return new Date().toISOString();
}

// Подставить переменные {{name}} в текст шаблона уведомления.
export function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    return vars[key] ?? `{{${key}}}`;
  });
}

// Дата прописью на казахском (для документов/уведомлений).
export function formatDateKz(dateStr: string): string {
  const d = new Date(dateStr);
  const months: Record<number, string> = {
    0: 'қаңтар', 1: 'ақпан', 2: 'наурыз', 3: 'сәуір',
    4: 'мамыр', 5: 'маусым', 6: 'шілде', 7: 'тамыз',
    8: 'қыркүйек', 9: 'қазан', 10: 'қараша', 11: 'желтоқсан',
  };
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

// Дата прописью на русском.
export function formatDateRu(dateStr: string): string {
  const d = new Date(dateStr);
  const months: Record<number, string> = {
    0: 'января', 1: 'февраля', 2: 'марта', 3: 'апреля',
    4: 'мая', 5: 'июня', 6: 'июля', 7: 'августа',
    8: 'сентября', 9: 'октября', 10: 'ноября', 11: 'декабря',
  };
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

// Выбрать формат даты по языку пользователя.
export function formatDate(dateStr: string, lang: 'kz' | 'ru'): string {
  return lang === 'kz' ? formatDateKz(dateStr) : formatDateRu(dateStr);
}

// Единый справочник кодов ошибок API (используется в ответах сервера).
export const ERROR_CODES = {
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  RATE_LIMITED: 'RATE_LIMITED',
  SESSION_NOT_FOUND: 'SESSION_NOT_FOUND',
  USER_NOT_FOUND: 'USER_NOT_FOUND',
  CLASS_NOT_FOUND: 'CLASS_NOT_FOUND',
  OTP_EXPIRED: 'OTP_EXPIRED',
  OTP_INVALID: 'OTP_INVALID',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  DUPLICATE_ENTRY: 'DUPLICATE_ENTRY',
  NOTIFICATION_FAILED: 'NOTIFICATION_FAILED',
  COURSE_NOT_FOUND: 'COURSE_NOT_FOUND',
  MODULE_NOT_FOUND: 'MODULE_NOT_FOUND',
  LESSON_NOT_FOUND: 'LESSON_NOT_FOUND',
  NOT_ENROLLED: 'NOT_ENROLLED',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

// Структурированный лог в JSON (удобно искать в логах Cloudflare).
export function structuredLog(
  level: 'info' | 'warn' | 'error',
  message: string,
  meta?: Record<string, unknown>
): void {
  const entry = {
    timestamp: nowISO(),
    level,
    message,
    ...meta,
  };
  if (level === 'error') {
    console.error(JSON.stringify(entry));
  } else if (level === 'warn') {
    console.warn(JSON.stringify(entry));
  } else {
    console.log(JSON.stringify(entry));
  }
}
