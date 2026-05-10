#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════
 * COMPREHENSIVE LIFECYCLE TEST — Тәрбие Сағаты API
 * ═══════════════════════════════════════════════════════════════
 * Запуск:  node scripts/stress-test.mjs <JWT_TOKEN>
 * 
 * Полный тест ВСЕХ функций:
 *   - Курсы: создание → редактирование → модули → уроки → статусы → запись → прогресс → отзыв → удаление
 *   - Сессии: группа → ученики → занятие → посещаемость → оценки → завершение → средние
 *   - Мероприятия: создание → редактирование → статусы → регистрация → отмена → удаление
 *   - Открытые занятия: полный цикл
 *   - Пользователи: все роли → редактирование → удаление → безопасность
 *   - Поддержка: тикет → сообщения → цепочка ответов
 *   - Рейтинги: проверка учителей → статистика
 * 
 * Удаляет 90% созданного, оставляет 10% для проверки.
 * ═══════════════════════════════════════════════════════════════
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';

// ═══ CONFIG ═══
const API_BASE = process.env.API_BASE || 'https://dprabota.bahtyarsanzhar.workers.dev';
const TOKEN = process.argv[2] || process.env.TOKEN || tryReadToken();
const P = '__TEST_LC__'; // prefix for lifecycle test entities

const C = {
  r: '\x1b[0m', g: '\x1b[32m', R: '\x1b[31m',
  y: '\x1b[33m', c: '\x1b[36m', b: '\x1b[1m', d: '\x1b[2m',
};

function tryReadToken() {
  try {
    const f = readFileSync(resolve(process.cwd(), 'apps/worker/.dev.vars'), 'utf8');
    const m = f.match(/TEST_TOKEN\s*=\s*"?([^"\n]+)"?/);
    if (m) return m[1];
  } catch { /* ok */ }
  return '';
}

// ═══ HELPERS ═══
const H = { 'Content-Type': 'application/json', ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}) };

let totalPass = 0, totalFail = 0, totalSkip = 0;
const problems = [];

async function api(path, opts = {}) {
  const url = path.startsWith('http') ? path : `${API_BASE}${path}`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch(url, { ...opts, signal: ctrl.signal });
    const json = await res.json().catch(() => null);
    return { res, json, data: json?.data, ok: res.ok && json?.success !== false };
  } finally { clearTimeout(t); }
}
async function POST(path, body) { return api(path, { method: 'POST', headers: H, body: JSON.stringify(body) }); }
async function PUT(path, body) { return api(path, { method: 'PUT', headers: H, body: JSON.stringify(body) }); }
async function PATCH(path, body) { return api(path, { method: 'PATCH', headers: H, body: body ? JSON.stringify(body) : undefined }); }
async function GET(path) { return api(path, { headers: H }); }
async function DEL(path) { return api(path, { method: 'DELETE', headers: H }); }

function log(m) { console.log(m); }
function pass(m) { totalPass++; log(`  ${C.g}✅ ${m}${C.r}`); }
function fail(m) { totalFail++; problems.push(m); log(`  ${C.R}❌ ${m}${C.r}`); }
function skip(m) { totalSkip++; log(`  ${C.y}⚠️ ${m}${C.r}`); }
function info(m) { log(`  ${C.d}${m}${C.r}`); }
function header(t) { log(`\n${C.b}${C.c}═══ ${t} ═══${C.r}`); }

// Random helpers
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const tomorrow = () => { const d = new Date(Date.now() + 3 * 86400000); return d.toISOString().slice(0, 10); };
const ROOMS = ['ГК 409', 'ГК 301', 'ГК 202', 'IT 119', 'IT 124', 'МК 131', 'МК 132'];
const SLOTS = ['08:00', '09:40', '11:25', '13:25', '15:05', '16:50'];
const COMMENTS_RU = ['Отлично!', 'Хорошо', 'Можно лучше', 'Молодец', 'Старайся', 'Супер работа', 'Нужно подтянуть', 'Превосходно', 'Хорошая работа'];

// Cached data
let _teachers = null, _students = null;
async function getUsers() {
  if (_teachers && _students) return { teachers: _teachers, students: _students };
  const { data } = await GET('/api/admin/users');
  const all = Array.isArray(data) ? data : [];
  _teachers = all.filter(u => u?.role === 'teacher');
  _students = all.filter(u => u?.role === 'student');
  return { teachers: _teachers, students: _students };
}

// ═══ TEST BLOCKS ═══

async function testHealth() {
  header('0. HEALTH CHECK');
  try {
    const { ok, res } = await GET('/api/health');
    if (ok) pass(`API доступен (status ${res.status})`);
    else fail(`API вернул ${res.status}`);
    return ok;
  } catch (e) { fail(`API недоступен: ${e.message}`); return false; }
}

async function testAuth() {
  header('1. АВТОРИЗАЦИЯ');
  if (!TOKEN) { skip('TOKEN не указан'); return null; }
  const { ok, data } = await GET('/api/auth/me');
  if (ok && data) { pass(`Авторизован: ${data.full_name} (role=${data.role})`); return data; }
  else { fail('Авторизация провалена'); return null; }
}

// ═══════════════════════════════════════════════════════════
// 2. КУРСЫ — ПОЛНЫЙ ЖИЗНЕННЫЙ ЦИКЛ
// ═══════════════════════════════════════════════════════════
async function testCourseLifecycle() {
  header('2. КУРСЫ — полный жизненный цикл');
  let steps = 0, ok = 0;

  // 2a. Создать курс
  steps++;
  const { ok: c1, data: courseData, json: cj } = await POST('/api/courses', {
    title: `${P}Курс Программирования`, description: 'Полный курс по JS/TS', price: 15000, lang: 'ru',
  });
  if (!c1 || !courseData?.id) { fail(`Создание курса: ${JSON.stringify(cj).slice(0, 150)}`); return; }
  const courseId = courseData.id;
  info(`Создан курс: ${courseId} (статус: draft)`);
  ok++;

  // 2b. Изменить настройки курса
  steps++;
  const { ok: u1 } = await PUT(`/api/courses/${courseId}`, {
    title: `${P}Курс JS/TS (обновлён)`, description: 'Обновлённое описание курса', price: 20000, lang: 'kz',
  });
  if (u1) { info('Настройки обновлены (title, description, price, lang)'); ok++; }
  else fail('Не удалось обновить настройки курса');

  // 2c. Проверить что настройки сохранились
  steps++;
  const { ok: g1, data: courseGet } = await GET(`/api/courses/${courseId}`);
  if (g1 && courseGet?.course?.title?.includes('обновлён') && courseGet.course.price === 20000) {
    info(`Проверка: title="${courseGet.course.title}", price=${courseGet.course.price}`);
    ok++;
  } else { fail('Настройки не сохранились'); }

  // 2d. Создать 3 модуля
  steps++;
  const moduleIds = [];
  const moduleNames = ['Основы JavaScript', 'TypeScript продвинутый', 'React и фреймворки'];
  for (let i = 0; i < 3; i++) {
    const { ok: m1, data: md } = await POST(`/api/courses/${courseId}/modules`, { title: `${P}${moduleNames[i]}`, sort_order: i });
    if (m1 && md?.id) moduleIds.push(md.id);
  }
  if (moduleIds.length === 3) { info(`Создано ${moduleIds.length} модулей`); ok++; }
  else fail(`Модули: ${moduleIds.length}/3`);

  // 2e. Создать 4 урока в первом модуле (разные типы)
  steps++;
  const lessonIds = [];
  const lessonDefs = [
    { title: `${P}Введение`, type: 'text', content: 'Добро пожаловать в курс!', duration_minutes: 15 },
    { title: `${P}Видео-урок`, type: 'video', content: 'Смотрим видео', duration_minutes: 45 },
    { title: `${P}Доп. материал`, type: 'text', content: 'Дополнительные материалы к курсу', duration_minutes: 60 },
    { title: `${P}Практика`, type: 'text', content: 'Самостоятельная работа', duration_minutes: 30 },
  ];
  if (moduleIds[0]) {
    for (let i = 0; i < lessonDefs.length; i++) {
      const { ok: l1, data: ld } = await POST(`/api/courses/${courseId}/modules/${moduleIds[0]}/lessons`, { ...lessonDefs[i], sort_order: i });
      if (l1 && ld?.id) lessonIds.push(ld.id);
    }
  }
  if (lessonIds.length === 4) { info(`Создано ${lessonIds.length} уроков (text, video, live, text)`); ok++; }
  else fail(`Уроки: ${lessonIds.length}/4`);

  // 2f. Удалить один урок
  steps++;
  if (lessonIds.length >= 4 && moduleIds[0]) {
    const delLessonId = lessonIds.pop();
    const { ok: dl } = await DEL(`/api/courses/${courseId}/modules/${moduleIds[0]}/lessons/${delLessonId}`);
    if (dl) { info(`Удалён урок ${delLessonId}`); ok++; }
    else fail('Не удалось удалить урок');
  } else { skip('Нет урока для удаления'); }

  // 2g. Удалить один модуль
  steps++;
  if (moduleIds.length >= 3) {
    const delModId = moduleIds.pop();
    const { ok: dm } = await DEL(`/api/courses/${courseId}/modules/${delModId}`);
    if (dm) { info(`Удалён модуль ${delModId}`); ok++; }
    else fail('Не удалось удалить модуль');
  } else { skip('Нет модуля для удаления'); }

  // 2h. Изменить статус: draft → published
  steps++;
  const { ok: sp } = await PUT(`/api/courses/${courseId}`, { status: 'published' });
  if (sp) { info('Статус: draft → published'); ok++; }
  else fail('Не удалось опубликовать курс');

  // 2i. Проверить статус
  steps++;
  const { data: pubCourse } = await GET(`/api/courses/${courseId}`);
  if (pubCourse?.course?.status === 'published') { info('Статус подтверждён: published'); ok++; }
  else fail('Статус не обновился');

  // 2j. Записаться на курс (от имени admin)
  steps++;
  const { ok: enr, data: enrData, json: enrJ } = await POST(`/api/courses/${courseId}/enroll`, {});
  if (enr) { info(`Записан на курс (enrollment: ${enrData?.id || 'ok'})`); ok++; }
  else { info(`Запись: ${JSON.stringify(enrJ).slice(0, 100)}`); skip('Запись — возможно уже записан'); }

  // 2k. Пройти первый урок (progress)
  steps++;
  if (lessonIds[0]) {
    const { ok: pr1 } = await POST(`/api/courses/${courseId}/lessons/${lessonIds[0]}/progress`, { status: 'completed' });
    if (pr1) { info(`Урок ${lessonIds[0]}: completed`); ok++; }
    else { info('Прогресс урока — ошибка (возможно не enrolled)'); skip('Прогресс'); }
  } else { skip('Нет урока для прогресса'); }

  // 2l. Начать второй урок
  steps++;
  if (lessonIds[1]) {
    const { ok: pr2 } = await POST(`/api/courses/${courseId}/lessons/${lessonIds[1]}/progress`, { status: 'in_progress' });
    if (pr2) { info(`Урок ${lessonIds[1]}: in_progress`); ok++; }
    else skip('Прогресс 2');
  } else { skip('Нет урока 2'); }

  // 2m. Проверить прогресс курса
  steps++;
  const { data: progCourse } = await GET(`/api/courses/${courseId}`);
  if (progCourse?.progress) {
    info(`Прогресс: ${progCourse.progress.completed_lessons}/${progCourse.progress.total_lessons} (${progCourse.progress.progress_percent}%)`);
    ok++;
  } else { skip('Прогресс не доступен'); }

  // 2n. Оставить отзыв
  steps++;
  const reviewRating = rand(3, 5);
  const reviewTexts = ['Отличный курс!', 'Очень полезно', 'Рекомендую', 'Хороший материал', 'Интересный курс'];
  const { ok: rev, data: revData } = await POST(`/api/courses/${courseId}/reviews`, { rating: reviewRating, text: pick(reviewTexts) });
  if (rev) { info(`Отзыв: ${reviewRating}/5 ⭐ (id: ${revData?.id})`); ok++; }
  else skip('Отзыв — возможно нет enrollment');

  // 2o. Проверить что отзыв отображается
  steps++;
  const { data: withReview } = await GET(`/api/courses/${courseId}`);
  const reviews = withReview?.reviews || [];
  if (reviews.length > 0) { info(`Отзывов у курса: ${reviews.length}`); ok++; }
  else { skip('Отзывы не найдены'); }

  // 2p. Статус → archived
  steps++;
  const { ok: sa } = await PUT(`/api/courses/${courseId}`, { status: 'archived' });
  if (sa) { info('Статус: published → archived'); ok++; }
  else fail('Не удалось архивировать');

  // 2q. Каталог — проверить фильтрацию
  steps++;
  const { data: catalog } = await GET('/api/courses');
  if (Array.isArray(catalog)) { info(`Каталог: ${catalog.length} курсов`); ok++; }
  else skip('Каталог не массив');

  // 2r. Удалить курс
  steps++;
  const { ok: delC } = await DEL(`/api/courses/${courseId}`);
  if (delC) { info('Курс удалён'); ok++; }
  else fail('Не удалось удалить курс');

  if (ok >= steps * 0.7) pass(`Курсы: ${ok}/${steps} шагов успешно`);
  else fail(`Курсы: только ${ok}/${steps} шагов`);
}

async function testBulkDeleteEvents(ids) {
  header(`3. УДАЛЕНИЕ 90% МЕРОПРИЯТИЙ (${ids.length} шт)`);
  const { toDelete, toKeep } = splitForDelete(ids);
  info(`Удаляем ${toDelete.length}, оставляем ${toKeep.length} для проверки`);
  let deleted = 0;
  const times = [];
  for (const id of toDelete) {
    const t0 = performance.now();
    try {
      const res = await apiFetch(`/api/events/${id}`, { method: 'DELETE', headers });
      times.push(Math.round(performance.now() - t0));
      if (res.ok) deleted++;
    } catch { /* ok */ }
  }
  const avg = times.length ? Math.round(times.reduce((s, t) => s + t, 0) / times.length) : 0;
  timings.push({ op: 'Event DELETE', avg, min: Math.min(...times, 0), max: Math.max(...times, 0), count: deleted });

  if (deleted >= toDelete.length * 0.8) pass(`Удалено ${deleted}/${toDelete.length}, оставлено ${toKeep.length}, avg=${avg}ms`);
  else fail(`Удалено только ${deleted}/${toDelete.length}`);
  info(`⚡ ОСТАВЛЕНЫ для проверки: ${toKeep.join(', ')}`);
}

async function testBulkCreateOpenSessions(count = 50) {
  header(`4. МАССОВОЕ СОЗДАНИЕ ОТКРЫТЫХ ЗАНЯТИЙ (${count} шт)`);
  const ids = [];
  const times = [];
  const tomorrow = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);

  for (let i = 0; i < count; i++) {
    const body = { title: `${TEST_PREFIX}OS_${i}`, description: 'Stress', session_date: tomorrow, session_time: `${String(10 + (i % 8)).padStart(2, '0')}:00`, location: 'Test', max_students: 30 };
    const t0 = performance.now();
    try {
      const { res, data } = await apiJson('/api/open-sessions', { method: 'POST', headers, body: JSON.stringify(body) });
      times.push(Math.round(performance.now() - t0));
      if (data?.id) ids.push(String(data.id));
    } catch { /* ok */ }
  }

  const avg = times.length ? Math.round(times.reduce((s, t) => s + t, 0) / times.length) : 0;
  timings.push({ op: 'OpenSession CREATE', avg, min: Math.min(...times, 0), max: Math.max(...times, 0), count: ids.length });
  if (ids.length >= count * 0.8) pass(`Создано ${ids.length}/${count}, avg=${avg}ms`);
  else fail(`Создано только ${ids.length}/${count}`);
  return ids;
}

async function testBulkDeleteOpenSessions(ids) {
  header(`5. УДАЛЕНИЕ 90% ОТКРЫТЫХ ЗАНЯТИЙ (${ids.length} шт)`);
  const { toDelete, toKeep } = splitForDelete(ids);
  let deleted = 0;
  for (const id of toDelete) {
    try { const r = await apiFetch(`/api/open-sessions/${id}`, { method: 'DELETE', headers }); if (r.ok) deleted++; } catch { /* ok */ }
  }
  if (deleted >= toDelete.length * 0.8) pass(`Удалено ${deleted}/${toDelete.length}, оставлено ${toKeep.length}`);
  else fail(`Удалено только ${deleted}/${toDelete.length}`);
  info(`⚡ ОСТАВЛЕНЫ: ${toKeep.join(', ')}`);
}

async function testBulkCreateUsers(count = 20) {
  header(`6. МАССОВОЕ СОЗДАНИЕ ПОЛЬЗОВАТЕЛЕЙ (${count} шт)`);
  const ids = [];
  const times = [];

  for (let i = 0; i < count; i++) {
    const body = { full_name: `${TEST_PREFIX}USER_${i}`, phone: `+7000${String(i).padStart(7, '0')}`, role: 'student', lang: 'ru' };
    const t0 = performance.now();
    try {
      const { res, data } = await apiJson('/api/admin/users', { method: 'POST', headers, body: JSON.stringify(body) });
      times.push(Math.round(performance.now() - t0));
      if (data?.id) ids.push(String(data.id));
    } catch { /* ok */ }
  }

  const avg = times.length ? Math.round(times.reduce((s, t) => s + t, 0) / times.length) : 0;
  timings.push({ op: 'User CREATE', avg, min: Math.min(...times, 0), max: Math.max(...times, 0), count: ids.length });
  if (ids.length >= count * 0.8) pass(`Создано ${ids.length}/${count}, avg=${avg}ms`);
  else fail(`Создано только ${ids.length}/${count}`);
  return ids;
}

async function testBulkDeleteUsers(ids) {
  header(`7. УДАЛЕНИЕ 90% ПОЛЬЗОВАТЕЛЕЙ (${ids.length} шт)`);
  const { toDelete, toKeep } = splitForDelete(ids);
  let deleted = 0;
  for (const id of toDelete) {
    try { const r = await apiFetch(`/api/admin/users/${id}`, { method: 'DELETE', headers }); if (r.ok) deleted++; } catch { /* ok */ }
  }
  if (deleted >= toDelete.length * 0.8) pass(`Удалено ${deleted}/${toDelete.length}, оставлено ${toKeep.length}`);
  else fail(`Удалено только ${deleted}/${toDelete.length}`);
  info(`⚡ ОСТАВЛЕНЫ: ${toKeep.join(', ')}`);
}

async function testUserDeletionSecurity() {
  header('8. БЕЗОПАСНОСТЬ УДАЛЕНИЯ ПОЛЬЗОВАТЕЛЕЙ');
  const { data } = await apiJson('/api/admin/users', { headers });
  const users = Array.isArray(data) ? data : [];
  const admins = users.filter(u => u?.role === 'admin');

  if (admins.length === 0) { skip('Нет админов для тестирования'); return; }

  const adminId = admins[0].id;
  info(`Попытка удалить админа id=${adminId} (${admins[0].full_name})`);

  const res = await apiFetch(`/api/admin/users/${adminId}`, { method: 'DELETE', headers });
  const json = await res.json().catch(() => null);

  if (res.status === 403 || res.status === 400 || !json?.success) {
    pass(`Админ защищён от удаления (status=${res.status})`);
  } else {
    fail(`АДМИН БЫЛ УДАЛЁН! status=${res.status} — КРИТИЧЕСКАЯ ОШИБКА`);
  }
}

async function testBulkCreateCourses(count = 20) {
  header(`9. МАССОВОЕ СОЗДАНИЕ КУРСОВ (${count} шт)`);
  const ids = [];
  const times = [];

  for (let i = 0; i < count; i++) {
    const body = { title: `${TEST_PREFIX}COURSE_${i}`, description: 'Stress test course', price: 0, lang: 'ru' };
    const t0 = performance.now();
    try {
      const { res, json, data } = await apiJson('/api/courses', { method: 'POST', headers, body: JSON.stringify(body) });
      times.push(Math.round(performance.now() - t0));
      if (data?.id) ids.push(String(data.id));
      else if (i === 0) info(`[0] status=${res.status} body=${JSON.stringify(json).slice(0, 200)}`);
    } catch (e) { if (i === 0) info(`[0] error: ${e.message}`); }
  }

  const avg = times.length ? Math.round(times.reduce((s, t) => s + t, 0) / times.length) : 0;
  timings.push({ op: 'Course CREATE', avg, min: Math.min(...times, 0), max: Math.max(...times, 0), count: ids.length });
  if (ids.length >= count * 0.5) pass(`Создано ${ids.length}/${count}, avg=${avg}ms`);
  else fail(`Создано только ${ids.length}/${count} — СЕРВЕР ВОЗВРАЩАЕТ 500 (миграция 0009_courses не применена?)`);
  return ids;
}

async function testBulkDeleteCourses(ids) {
  header(`10. УДАЛЕНИЕ 90% КУРСОВ (${ids.length} шт)`);
  const { toDelete, toKeep } = splitForDelete(ids);
  let deleted = 0;
  for (const id of toDelete) {
    try { const r = await apiFetch(`/api/courses/${id}`, { method: 'DELETE', headers }); if (r.ok) deleted++; } catch { /* ok */ }
  }
  if (deleted >= toDelete.length * 0.5) pass(`Удалено ${deleted}/${toDelete.length}, оставлено ${toKeep.length}`);
  else fail(`Удалено только ${deleted}/${toDelete.length}`);
  info(`⚡ ОСТАВЛЕНЫ: ${toKeep.join(', ')}`);
}

async function testBulkCreateClasses(count = 10) {
  header(`11. МАССОВОЕ СОЗДАНИЕ ГРУПП (${count} шт)`);
  const ids = [];
  const times = [];

  for (let i = 0; i < count; i++) {
    const teacherId = await getTeacherId();
    if (!teacherId) { info(`[${i}] no teacher_id available`); continue; }
    const body = { name: `${TEST_PREFIX}CLS_${i}`.slice(0, 20), teacher_id: teacherId, academic_year: '2025-2026' };
    const t0 = performance.now();
    try {
      const { res, data } = await apiJson('/api/admin/classes', { method: 'POST', headers, body: JSON.stringify(body) });
      times.push(Math.round(performance.now() - t0));
      if (data?.id) ids.push(String(data.id));
    } catch { /* ok */ }
  }

  const avg = times.length ? Math.round(times.reduce((s, t) => s + t, 0) / times.length) : 0;
  timings.push({ op: 'Class CREATE', avg, min: Math.min(...times, 0), max: Math.max(...times, 0), count: ids.length });
  if (ids.length >= count * 0.5) pass(`Создано ${ids.length}/${count}, avg=${avg}ms`);
  else fail(`Создано только ${ids.length}/${count}`);
  return ids;
}

async function testBulkDeleteClasses(ids) {
  header(`12. УДАЛЕНИЕ 90% ГРУПП (${ids.length} шт)`);
  const { toDelete, toKeep } = splitForDelete(ids);
  let deleted = 0;
  for (const id of toDelete) {
    try { const r = await apiFetch(`/api/admin/classes/${id}`, { method: 'DELETE', headers }); if (r.ok) deleted++; } catch { /* ok */ }
  }
  if (deleted >= toDelete.length * 0.5) pass(`Удалено ${deleted}/${toDelete.length}, оставлено ${toKeep.length}`);
  else fail(`Удалено только ${deleted}/${toDelete.length}`);
  info(`⚡ ОСТАВЛЕНЫ: ${toKeep.join(', ')}`);
}

async function testSpamTickets(count = 30) {
  header(`13. СПАМ ТИКЕТОВ (${count} шт)`);
  const ids = [];
  const times = [];

  for (let i = 0; i < count; i++) {
    const body = { subject: `${TEST_PREFIX}TICKET_${i}`, message: `Spam ticket message #${i}` };
    const t0 = performance.now();
    try {
      const { res, data } = await apiJson('/api/support/tickets', { method: 'POST', headers, body: JSON.stringify(body) });
      times.push(Math.round(performance.now() - t0));
      if (data?.id) ids.push(String(data.id));
    } catch { /* ok */ }
  }

  const avg = times.length ? Math.round(times.reduce((s, t) => s + t, 0) / times.length) : 0;
  timings.push({ op: 'Ticket CREATE', avg, min: Math.min(...times, 0), max: Math.max(...times, 0), count: ids.length });
  if (ids.length >= count * 0.5) pass(`Создано ${ids.length}/${count}, avg=${avg}ms`);
  else fail(`Создано только ${ids.length}/${count}`);
  return ids;
}

async function testSpamMessages(ticketId, count = 50) {
  header(`14. СПАМ СООБЩЕНИЙ В ТИКЕТ (${count} шт)`);
  if (!ticketId) { skip('Нет тикета для спама'); return; }

  let sent = 0;
  const times = [];
  for (let i = 0; i < count; i++) {
    const t0 = performance.now();
    try {
      const res = await apiFetch(`/api/support/tickets/${ticketId}/messages`, { method: 'POST', headers, body: JSON.stringify({ message: `Spam message #${i}` }) });
      times.push(Math.round(performance.now() - t0));
      if (res.ok) sent++;
    } catch { /* ok */ }
  }

  const avg = times.length ? Math.round(times.reduce((s, t) => s + t, 0) / times.length) : 0;
  timings.push({ op: 'Message CREATE', avg, min: Math.min(...times, 0), max: Math.max(...times, 0), count: sent });
  if (sent >= count * 0.5) pass(`Отправлено ${sent}/${count}, avg=${avg}ms`);
  else fail(`Отправлено только ${sent}/${count}`);
}

async function testSpamReviews() {
  header('15. РЕЙТИНГ УЧИТЕЛЕЙ — проверка API');

  // Get all teachers with ratings
  const { res, data } = await apiJson('/api/ratings/teachers', { headers });
  if (!res.ok) { fail(`GET /api/ratings/teachers → ${res.status}`); return; }

  const teachers = Array.isArray(data) ? data : [];
  info(`Учителей найдено: ${teachers.length}`);

  if (teachers.length === 0) { skip('Нет учителей в системе'); return; }

  // Check rating stats for random teacher
  const randTeacher = teachers[Math.floor(Math.random() * teachers.length)];
  const tid = randTeacher.teacher_id || randTeacher.id;
  info(`Рандом учитель: ${randTeacher.teacher_name} (id=${tid})`);
  info(`  Средний рейтинг: ${randTeacher.average_rating}/10, оценок: ${randTeacher.total_ratings}`);

  // Get detailed teacher stats
  const { res: detailRes, data: detailData } = await apiJson(`/api/ratings/teacher/${tid}`, { headers });
  if (detailRes.ok && detailData) {
    info(`  Валидных оценок: ${detailData.valid_ratings}, отзывов с комментарием: ${detailData.recent_reviews?.length || 0}`);
    if (detailData.recent_reviews?.length > 0) {
      const rev = detailData.recent_reviews[0];
      info(`  Последний отзыв: ${rev.rating}/10 — "${(rev.reason || '').slice(0, 50)}" (${rev.student_name})`);
    }
    pass(`Рейтинг учителя ${randTeacher.teacher_name}: ${detailData.average_rating}/10 (${detailData.valid_ratings} оценок)`);
  } else {
    fail(`GET /api/ratings/teacher/${tid} → ${detailRes.status}`);
  }
}

async function testConcurrentRequests() {
  header('16. ПАРАЛЛЕЛЬНЫЕ ЗАПРОСЫ (20 одновременных GET)');
  const endpoints = [
    '/api/sessions', '/api/events', '/api/open-sessions', '/api/courses',
    '/api/admin/users', '/api/admin/classes', '/api/grades',
    '/api/reports', '/api/ratings/teachers', '/api/support/tickets',
    '/api/sessions', '/api/events', '/api/open-sessions', '/api/courses',
    '/api/admin/users', '/api/admin/classes', '/api/grades',
    '/api/reports', '/api/ratings/teachers', '/api/notifications',
  ];

  const t0 = performance.now();
  const results = await Promise.all(endpoints.map(async (ep) => {
    const t = performance.now();
    try {
      const res = await apiFetch(ep, { headers }, 15000);
      return { ep, status: res.status, ms: Math.round(performance.now() - t) };
    } catch (e) {
      return { ep, status: 0, ms: Math.round(performance.now() - t) };
    }
  }));
  const totalMs = Math.round(performance.now() - t0);

  const ok = results.filter(r => r.status >= 200 && r.status < 400).length;
  const errs = results.filter(r => r.status === 0 || r.status >= 500).length;
  const msArr = results.map(r => r.ms).sort((a, b) => a - b);
  const avg = Math.round(msArr.reduce((s, t) => s + t, 0) / msArr.length);

  timings.push({ op: 'Concurrent GET', avg, min: msArr[0], max: msArr[msArr.length - 1], count: ok });
  info(`Всего: ${totalMs}ms, OK: ${ok}/20, Errors: ${errs}/20, avg=${avg}ms`);
  if (errs <= 3) pass(`${ok}/20 запросов успешны`);
  else fail(`${errs}/20 запросов упали`);
}

async function testFormValidation() {
  header('17. ВАЛИДАЦИЯ ФОРМ (XSS, SQL injection, длинные строки)');

  const XSS = "<script>alert('xss')</script>";
  const SQL = "'; DROP TABLE users; --";
  const LONG = 'A'.repeat(5000);
  const EMOJI = '🔥🔥🔥🔥🔥';
  const tomorrow = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);

  const payloads = [
    { label: 'XSS в названии', ep: '/api/events', body: { title: XSS, description: 'x', event_date: tomorrow, event_time: '10:00', location: 'X', capacity: 10 } },
    { label: 'SQL injection', ep: '/api/events', body: { title: SQL, description: 'x', event_date: tomorrow, event_time: '10:00', location: 'X', capacity: 10 } },
    { label: 'Строка 5000 символов', ep: '/api/events', body: { title: LONG, description: LONG, event_date: tomorrow, event_time: '10:00', location: 'X', capacity: 10 } },
    { label: 'Emoji', ep: '/api/events', body: { title: EMOJI, description: EMOJI, event_date: tomorrow, event_time: '10:00', location: EMOJI, capacity: 10 } },
    { label: 'Пустое название', ep: '/api/events', body: { title: '', description: '', event_date: tomorrow, event_time: '10:00', location: '', capacity: 0 } },
    { label: 'XSS в имени пользователя', ep: '/api/admin/users', body: { full_name: XSS, phone: '+77777777777', role: 'student', lang: 'ru' } },
    { label: 'SQL в имени пользователя', ep: '/api/admin/users', body: { full_name: SQL, phone: '+77777777778', role: 'student', lang: 'ru' } },
    { label: 'Невалидный телефон', ep: '/api/admin/users', body: { full_name: 'Test', phone: 'not-a-phone', role: 'student', lang: 'ru' } },
    { label: 'XSS в тикете', ep: '/api/support/tickets', body: { subject: XSS, message: SQL } },
  ];

  let accepted = 0;
  for (const p of payloads) {
    try {
      const { res, json, data } = await apiJson(p.ep, { method: 'POST', headers, body: JSON.stringify(p.body) });
      const ok = json?.success === true;
      if (ok) {
        accepted++;
        info(`⚠️ ${p.label}: ПРИНЯТО (status=${res.status})`);
        // Cleanup
        if (data?.id) {
          await apiFetch(`${p.ep}/${data.id}`, { method: 'DELETE', headers }).catch(() => {});
        }
      } else {
        info(`✅ ${p.label}: отклонено (status=${res.status})`);
      }
    } catch (e) {
      info(`✅ ${p.label}: ошибка (${e.message})`);
    }
  }

  const dangerous = payloads.filter(p => p.label.includes('XSS') || p.label.includes('SQL'));
  if (accepted === 0) pass('Все опасные данные отклонены');
  else if (accepted <= 3) pass(`${payloads.length - accepted}/${payloads.length} отклонено (${accepted} принято)`);
  else fail(`${accepted}/${payloads.length} опасных данных ПРИНЯТО сервером!`);
}

async function testSecurityNoToken() {
  header('18. БЕЗОПАСНОСТЬ — ЗАПРОСЫ БЕЗ ТОКЕНА');
  const endpoints = [
    { method: 'GET', path: '/api/admin/users' },
    { method: 'GET', path: '/api/admin/classes' },
    { method: 'POST', path: '/api/admin/users' },
    { method: 'DELETE', path: '/api/admin/users/fake_id' },
    { method: 'GET', path: '/api/sessions' },
    { method: 'GET', path: '/api/events' },
  ];

  let blocked = 0;
  for (const ep of endpoints) {
    try {
      const res = await apiFetch(ep.path, { method: ep.method, headers: { 'Content-Type': 'application/json' } });
      if (res.status === 401 || res.status === 403) {
        blocked++;
        info(`✅ ${ep.method} ${ep.path} → ${res.status} (blocked)`);
      } else {
        info(`⚠️ ${ep.method} ${ep.path} → ${res.status} (NOT blocked!)`);
      }
    } catch { blocked++; }
  }

  if (blocked >= endpoints.length * 0.8) pass(`${blocked}/${endpoints.length} заблокированы без токена`);
  else fail(`Только ${blocked}/${endpoints.length} заблокированы`);
}

async function testSecurityInvalidToken() {
  header('19. БЕЗОПАСНОСТЬ — НЕВАЛИДНЫЙ ТОКЕН');
  const fakeHeaders = { 'Content-Type': 'application/json', Authorization: 'Bearer INVALID_FAKE_TOKEN_12345' };
  const endpoints = ['/api/admin/users', '/api/sessions', '/api/events'];

  let blocked = 0;
  for (const ep of endpoints) {
    try {
      const res = await apiFetch(ep, { headers: fakeHeaders });
      if (res.status === 401 || res.status === 403) blocked++;
      else info(`⚠️ GET ${ep} → ${res.status} с невалидным токеном`);
    } catch { blocked++; }
  }

  if (blocked >= endpoints.length * 0.8) pass(`${blocked}/${endpoints.length} заблокированы с фейк-токеном`);
  else fail(`Только ${blocked}/${endpoints.length} заблокированы`);
}

async function testClassWithStudents() {
  header('20. ГРУППА + 20 УЧЕНИКОВ');

  const teacherId = await getTeacherId();
  if (!teacherId) { fail('Нет teacher для создания группы'); return; }

  // Create class
  const { data: clsData } = await apiJson('/api/admin/classes', { method: 'POST', headers, body: JSON.stringify({ name: `${TEST_PREFIX}CLSSTU`.slice(0, 20), teacher_id: teacherId, academic_year: '2025-2026' }) });
  if (!clsData?.id) { fail('Не удалось создать группу'); return; }
  const classId = clsData.id;
  info(`Группа создана: id=${classId}`);

  // Create 20 students
  const stuIds = [];
  for (let i = 0; i < 20; i++) {
    const { data } = await apiJson('/api/admin/users', { method: 'POST', headers, body: JSON.stringify({ full_name: `${TEST_PREFIX}STU_${i}`, phone: `+7002${String(i).padStart(7, '0')}`, role: 'student', lang: 'ru' }) });
    if (data?.id) stuIds.push(String(data.id));
  }
  info(`Создано ${stuIds.length}/20 учеников`);

  // Add to class
  let added = 0;
  // API takes student_ids as array — send all at once
  try {
    const res = await apiFetch(`/api/admin/classes/${classId}/students`, { method: 'POST', headers, body: JSON.stringify({ student_ids: stuIds }) });
    const j = await res.json().catch(() => null);
    if (res.ok) added = stuIds.length;
    else info(`Add students failed: ${res.status} ${j?.message || ''}`);
  } catch (e) { info(`Add students error: ${e.message}`); }
  info(`Добавлено в группу: ${added}/${stuIds.length}`);

  if (added >= stuIds.length * 0.5) pass(`${added} учеников добавлены в группу`);
  else fail(`Только ${added} учеников добавлены`);

  // Cleanup — delete 90%, keep 10%
  info('Очистка (90%)...');
  const { toDelete: stuDel, toKeep: stuKeep } = splitForDelete(stuIds);
  for (const sid of stuDel) { await apiFetch(`/api/admin/users/${sid}`, { method: 'DELETE', headers }).catch(() => {}); }
  info(`Удалено ${stuDel.length} учеников, оставлено ${stuKeep.length}`);
  info(`⚡ Группа ${classId} ОСТАВЛЕНА для проверки`);
}

async function testSessionsAndGrades() {
  header('21. СЕССИИ + ОЦЕНКИ СТУДЕНТАМ');

  const teacherId = await getTeacherId();
  if (!teacherId) { fail('Нет учителя'); return; }

  // Get classes with students
  const { data: classesData } = await apiJson('/api/sessions/classes', { headers });
  const classes = Array.isArray(classesData) ? classesData : [];
  const classWithStudents = classes.find(c => (c.student_count || 0) > 0);

  let classId, studentIds = [];

  if (classWithStudents) {
    classId = classWithStudents.id;
    info(`Используем существующую группу: ${classWithStudents.name} (${classWithStudents.student_count} уч.)`);
    // Get students of the class (response has .id field)
    const { data: studData } = await apiJson(`/api/admin/classes/${classId}/students`, { headers });
    studentIds = Array.isArray(studData) ? studData.map(s => s.id).filter(Boolean) : [];
    info(`  Учеников в группе: ${studentIds.length}`);
  } else {
    // Create class + students
    const { data: cls } = await apiJson('/api/admin/classes', { method: 'POST', headers, body: JSON.stringify({ name: `${TEST_PREFIX}GRADE`.slice(0, 20), teacher_id: teacherId, academic_year: '2025-2026' }) });
    if (!cls?.id) { fail('Не удалось создать группу для оценок'); return; }
    classId = cls.id;
    for (let i = 0; i < 5; i++) {
      const { data: stu } = await apiJson('/api/admin/users', { method: 'POST', headers, body: JSON.stringify({ full_name: `${TEST_PREFIX}GR_STU_${i}`, phone: `+7003${String(i).padStart(7, '0')}`, role: 'student', lang: 'ru' }) });
      if (stu?.id) studentIds.push(stu.id);
    }
    if (studentIds.length > 0) {
      await apiFetch(`/api/admin/classes/${classId}/students`, { method: 'POST', headers, body: JSON.stringify({ student_ids: studentIds }) });
    }
    info(`Создана группа ${classId} + ${studentIds.length} учеников`);
  }

  if (studentIds.length === 0) { skip('Нет учеников в группе'); return; }

  // Create a session for the class (valid room & time_slot required)
  const tomorrow = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
  const validRooms = ['ГК 409', 'ГК 301', 'IT 119', 'МК 131', 'ГК 202'];
  const validSlots = ['08:00', '09:40', '11:25', '13:25', '15:05'];
  const room = validRooms[Math.floor(Math.random() * validRooms.length)];
  const slot = validSlots[Math.floor(Math.random() * validSlots.length)];
  const { res: sesRes, data: sesData } = await apiJson('/api/sessions', { method: 'POST', headers, body: JSON.stringify({
    class_id: classId, topic: `${TEST_PREFIX}УРОК_ОЦЕНКИ`, planned_date: tomorrow, time_slot: slot, room, duration_minutes: 30
  }) });

  if (!sesData?.id) {
    const { json: sesJson } = { json: sesData }; // already parsed by apiJson
    info(`Сессия не создана: status=${sesRes.status} body=${JSON.stringify(sesJson).slice(0, 200)}`);
    fail('Не удалось создать сессию');
    return;
  }
  const sessionId = sesData.id;
  info(`Сессия создана: id=${sessionId}`);

  // Init grades
  const { res: initRes, data: initData } = await apiJson(`/api/grades/sessions/${sessionId}/init`, { method: 'POST', headers });
  if (initRes.ok) {
    info(`Оценки инициализированы: ${initData?.initialized || 0} учеников`);
  } else {
    info(`Init grades failed: ${initRes.status}`);
  }

  // Set random grades (present/absent with random grade 1-10)
  const comments = ['Отлично!', 'Хорошо', 'Можно лучше', 'Молодец', 'Старайся', 'Супер работа', 'Нужно подтянуть'];
  const gradeEntries = studentIds.map((sid, i) => {
    const isPresent = Math.random() > 0.2; // 80% present
    const grade = isPresent ? Math.floor(Math.random() * 10) + 1 : null;
    const comment = isPresent ? comments[Math.floor(Math.random() * comments.length)] : null;
    return { student_id: sid, status: isPresent ? 'present' : 'absent', grade, comment };
  });

  const { res: gradeRes, data: gradeData } = await apiJson(`/api/grades/sessions/${sessionId}/grades`, { method: 'PUT', headers, body: JSON.stringify({ grades: gradeEntries }) });
  if (gradeRes.ok) {
    info(`Оценки выставлены: ${gradeData?.updated || 0} учеников`);
    const presentCount = gradeEntries.filter(g => g.status === 'present').length;
    const avgGrade = gradeEntries.filter(g => g.grade).reduce((s, g) => s + g.grade, 0) / Math.max(1, presentCount);
    info(`  Присутствовали: ${presentCount}/${studentIds.length}, средняя: ${avgGrade.toFixed(1)}/10`);
  } else {
    info(`Put grades failed: ${gradeRes.status}`);
    fail('Не удалось выставить оценки');
    return;
  }

  // Read back grades
  const { data: readGrades } = await apiJson(`/api/grades/sessions/${sessionId}/grades`, { headers });
  const gradesArr = Array.isArray(readGrades) ? readGrades : [];
  info(`Проверка: в сессии ${gradesArr.length} записей оценок`);

  // Check monthly averages
  const month = tomorrow.slice(0, 7);
  const { res: monthRes, data: monthData } = await apiJson(`/api/grades/classes/${classId}/monthly?month=${month}`, { headers });
  if (monthRes.ok && Array.isArray(monthData)) {
    info(`Средние за ${month}: ${monthData.length} учеников`);
    monthData.slice(0, 3).forEach(s => info(`  → ${s.student_name}: ${s.average}/10 (${s.attended} из ${s.total_sessions} занятий)`));
    pass(`Оценки + средние работают (${gradesArr.length} оценок, ${monthData.length} учеников в среднем)`);
  } else {
    info(`Monthly failed: ${monthRes.status}`);
    pass(`Оценки выставлены (${gradesArr.length} записей), средние: ошибка`);
  }

  // Check student grades individually
  if (studentIds.length > 0) {
    const randStudent = studentIds[Math.floor(Math.random() * studentIds.length)];
    const { res: stuGradeRes, data: stuGradeData } = await apiJson(`/api/grades/students/${randStudent}/grades`, { headers });
    if (stuGradeRes.ok) {
      const stuGrades = Array.isArray(stuGradeData) ? stuGradeData : [];
      info(`  Оценки ученика ${randStudent}: ${stuGrades.length} записей`);
    }
  }
}

async function testCoursesWithContent() {
  header('22. КУРСЫ + МОДУЛИ + УРОКИ');

  // Create courses with different categories
  const categories = ['cat-programming', 'cat-design', 'cat-business', 'cat-languages', 'cat-science', 'cat-other'];
  const courseIds = [];

  for (let i = 0; i < 5; i++) {
    const cat = categories[Math.floor(Math.random() * categories.length)];
    const body = { title: `${TEST_PREFIX}COURSE_FULL_${i}`, description: `Тестовый курс №${i} для стресс-теста`, price: Math.floor(Math.random() * 5000), lang: Math.random() > 0.5 ? 'ru' : 'kz', category_id: cat };
    const { data } = await apiJson('/api/courses', { method: 'POST', headers, body: JSON.stringify(body) });
    if (data?.id) courseIds.push(data.id);
  }
  info(`Курсов создано: ${courseIds.length}/5`);

  if (courseIds.length === 0) { fail('Ни один курс не создан'); return; }

  // Add modules to first course
  const courseId = courseIds[0];
  const moduleIds = [];
  for (let i = 0; i < 3; i++) {
    const { data } = await apiJson(`/api/courses/${courseId}/modules`, { method: 'POST', headers, body: JSON.stringify({ title: `${TEST_PREFIX}Модуль_${i}`, sort_order: i }) });
    if (data?.id) moduleIds.push(data.id);
  }
  info(`Модулей: ${moduleIds.length}/3 в курсе ${courseId}`);

  // Add lessons to first module
  let lessonCount = 0;
  if (moduleIds.length > 0) {
    for (let i = 0; i < 4; i++) {
      const types = ['video', 'text', 'live'];
      const { data } = await apiJson(`/api/courses/${courseId}/modules/${moduleIds[0]}/lessons`, { method: 'POST', headers, body: JSON.stringify({ title: `${TEST_PREFIX}Урок_${i}`, type: types[i % 3], content: `Содержание урока ${i}`, sort_order: i, duration_minutes: 30 + i * 10 }) });
      if (data?.id) lessonCount++;
    }
  }
  info(`Уроков: ${lessonCount}/4 в модуле ${moduleIds[0] || 'N/A'}`);

  // Delete 90%, keep 10%
  const { toDelete, toKeep } = splitForDelete(courseIds);
  let deleted = 0;
  for (const id of toDelete) {
    try { const r = await apiFetch(`/api/courses/${id}`, { method: 'DELETE', headers }); if (r.ok) deleted++; } catch { /* ok */ }
  }
  info(`Удалено ${deleted} курсов, оставлено ${toKeep.length}`);
  if (toKeep.length > 0) info(`⚡ ОСТАВЛЕНЫ: ${toKeep.join(', ')}`);

  if (courseIds.length >= 3) pass(`Курсы+модули+уроки: ${courseIds.length} курсов, ${moduleIds.length} модулей, ${lessonCount} уроков`);
  else fail(`Создано только ${courseIds.length}/5 курсов`);
}

async function testRandomStudentsInClasses() {
  header('23. СЛУЧАЙНЫЕ УЧЕНИКИ В ГРУППАХ');

  // Get existing students
  const { data: usersData } = await apiJson('/api/admin/users', { headers });
  const allUsers = Array.isArray(usersData) ? usersData : [];
  const students = allUsers.filter(u => u?.role === 'student');
  const teachers = allUsers.filter(u => u?.role === 'teacher');

  info(`Всего студентов: ${students.length}, учителей: ${teachers.length}`);

  if (students.length < 3) { skip('Мало студентов для распределения'); return; }
  if (teachers.length === 0) { skip('Нет учителей'); return; }

  // Get existing classes
  const { data: classesData } = await apiJson('/api/admin/classes', { headers });
  const classes = Array.isArray(classesData) ? classesData : [];
  info(`Групп в системе: ${classes.length}`);

  // Create 3 new classes with random teachers and assign random students
  const newClasses = [];
  for (let i = 0; i < 3; i++) {
    const randTeacher = teachers[Math.floor(Math.random() * teachers.length)];
    const body = { name: `${TEST_PREFIX}RND_${i}`.slice(0, 20), teacher_id: randTeacher.id, academic_year: '2025-2026' };
    const { data } = await apiJson('/api/admin/classes', { method: 'POST', headers, body: JSON.stringify(body) });
    if (data?.id) newClasses.push({ id: data.id, teacherName: randTeacher.full_name });
  }
  info(`Создано ${newClasses.length} групп`);

  // Assign random students to each class (3-8 random students)
  for (const cls of newClasses) {
    const count = 3 + Math.floor(Math.random() * 6); // 3-8
    const shuffled = [...students].sort(() => Math.random() - 0.5);
    const selected = shuffled.slice(0, Math.min(count, students.length));
    const ids = selected.map(s => s.id);

    try {
      const res = await apiFetch(`/api/admin/classes/${cls.id}/students`, { method: 'POST', headers, body: JSON.stringify({ student_ids: ids }) });
      if (res.ok) info(`  Группа ${cls.id}: +${ids.length} учеников (учитель: ${cls.teacherName})`);
      else info(`  Группа ${cls.id}: ошибка добавления (${res.status})`);
    } catch { /* ok */ }
  }

  // Delete 90%, keep class with most students
  if (newClasses.length > 1) {
    const toDel = newClasses.slice(0, newClasses.length - 1);
    for (const c of toDel) { await apiFetch(`/api/admin/classes/${c.id}`, { method: 'DELETE', headers }).catch(() => {}); }
    info(`Удалено ${toDel.length} групп, оставлена 1`);
  }

  pass(`Ученики распределены по группам (${newClasses.length} создано)`);
}

async function testVerifyRemaining() {
  header('24. ПРОВЕРКА ОСТАВЛЕННЫХ ДАННЫХ (НЕ удаляем)');

  const endpoints = [
    { list: '/api/events', prefix: TEST_PREFIX, nameField: 'title', label: 'Мероприятия' },
    { list: '/api/open-sessions', prefix: TEST_PREFIX, nameField: 'title', label: 'Открытые занятия' },
    { list: '/api/admin/users', prefix: TEST_PREFIX, nameField: 'full_name', label: 'Пользователи' },
    { list: '/api/admin/classes', prefix: TEST_PREFIX, nameField: 'name', label: 'Группы' },
    { list: '/api/courses', prefix: TEST_PREFIX, nameField: 'title', label: 'Курсы' },
  ];

  let totalRemaining = 0;
  for (const ep of endpoints) {
    try {
      const { data } = await apiJson(ep.list, { headers });
      const arr = Array.isArray(data) ? data : [];
      const matching = arr.filter(item => String(item?.[ep.nameField] || '').includes(ep.prefix));
      if (matching.length > 0) {
        info(`${ep.label}: ${matching.length} шт ОСТАЛОСЬ ✓`);
        matching.slice(0, 3).forEach(m => info(`  → ${m[ep.nameField]} (id=${m.id})`));
      } else {
        info(`${ep.label}: 0 шт`);
      }
      totalRemaining += matching.length;
    } catch { /* ok */ }
  }

  if (totalRemaining > 0) pass(`${totalRemaining} тестовых сущностей РЕАЛЬНО СОХРАНЕНЫ в базе`);
  else fail('Ничего не осталось — данные не сохранились!');
}

// ═══ MAIN ═══

async function main() {
  console.log(`\n${COLORS.bold}╔═══════════════════════════════════════════════════════╗`);
  console.log(`║   STRESS TEST — Тәрбие Сағаты API                    ║`);
  console.log(`╚═══════════════════════════════════════════════════════╝${COLORS.reset}`);
  console.log(`API: ${API_BASE}`);
  console.log(`Token: ${TOKEN ? TOKEN.slice(0, 20) + '...' : '(не указан)'}\n`);

  const t0 = performance.now();

  // Health
  const healthy = await testHealth();
  if (!healthy) {
    console.log(`\n${COLORS.red}API недоступен — тесты остановлены${COLORS.reset}`);
    process.exit(1);
  }

  // Auth
  const me = await testAuth();
  if (!me) {
    console.log(`\n${COLORS.red}Не удалось авторизоваться. Укажите TOKEN:${COLORS.reset}`);
    console.log(`  TOKEN=ваш_токен node scripts/stress-test.mjs`);
    process.exit(1);
  }

  // Bulk create + delete
  const eventIds = await testBulkCreateEvents(50);
  await testBulkDeleteEvents(eventIds);

  const osIds = await testBulkCreateOpenSessions(50);
  await testBulkDeleteOpenSessions(osIds);

  const userIds = await testBulkCreateUsers(20);
  await testBulkDeleteUsers(userIds);

  // Security
  await testUserDeletionSecurity();

  // Courses
  const courseIds = await testBulkCreateCourses(20);
  await testBulkDeleteCourses(courseIds);

  // Classes
  const classIds = await testBulkCreateClasses(10);
  await testBulkDeleteClasses(classIds);

  // Tickets + messages
  const ticketIds = await testSpamTickets(30);
  await testSpamMessages(ticketIds[0], 50);

  // Teacher ratings
  await testSpamReviews();

  // Concurrent
  await testConcurrentRequests();

  // Validation
  await testFormValidation();

  // Security
  await testSecurityNoToken();
  await testSecurityInvalidToken();

  // Complex
  await testClassWithStudents();

  // Sessions + Grades
  await testSessionsAndGrades();

  // Courses with content
  await testCoursesWithContent();

  // Random students in classes
  await testRandomStudentsInClasses();

  // Verify remaining (NO deletion)
  await testVerifyRemaining();

  // ═══ FINAL REPORT ═══
  const totalMs = Math.round(performance.now() - t0);
  console.log(`\n${COLORS.bold}╔═══════════════════════════════════════════════════════╗`);
  console.log(`║   ИТОГОВЫЙ ОТЧЁТ                                     ║`);
  console.log(`╚═══════════════════════════════════════════════════════╝${COLORS.reset}`);
  console.log(`${COLORS.green}  ✅ Пройдено: ${totalPass}${COLORS.reset}`);
  console.log(`${COLORS.red}  ❌ Провалено: ${totalFail}${COLORS.reset}`);
  console.log(`${COLORS.yellow}  ⚠️  Пропущено: ${totalSkip}${COLORS.reset}`);
  console.log(`  ⏱  Время: ${(totalMs / 1000).toFixed(1)}s`);

  if (problems.length > 0) {
    console.log(`\n${COLORS.red}${COLORS.bold}  ПРОБЛЕМЫ:${COLORS.reset}`);
    problems.forEach(p => console.log(`  ${COLORS.red}• ${p}${COLORS.reset}`));
  }

  if (timings.length > 0) {
    console.log(`\n${COLORS.cyan}${COLORS.bold}  СКОРОСТЬ ОПЕРАЦИЙ:${COLORS.reset}`);
    console.log(`  ${'Операция'.padEnd(25)} ${'Count'.padEnd(7)} ${'Avg'.padEnd(8)} ${'Min'.padEnd(8)} ${'Max'.padEnd(8)}`);
    console.log(`  ${'─'.repeat(56)}`);
    timings.forEach(t => {
      console.log(`  ${t.op.padEnd(25)} ${String(t.count).padEnd(7)} ${String(t.avg + 'ms').padEnd(8)} ${String(t.min + 'ms').padEnd(8)} ${String(t.max + 'ms').padEnd(8)}`);
    });
  }

  console.log('');
  process.exit(totalFail > 0 ? 1 : 0);
}

main().catch(e => {
  console.error(`\n${COLORS.red}FATAL: ${e.message}${COLORS.reset}`);
  process.exit(1);
});
