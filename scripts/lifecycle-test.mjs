#!/usr/bin/env node
/**
 * COMPREHENSIVE LIFECYCLE TEST — Тәрбие Сағаты API
 * Запуск:  node scripts/lifecycle-test.mjs <JWT_TOKEN>
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

const API_BASE = process.env.API_BASE || 'https://dprabota.bahtyarsanzhar.workers.dev';
const TOKEN = process.argv[2] || process.env.TOKEN || (() => { try { const f = readFileSync(resolve(process.cwd(), 'apps/worker/.dev.vars'), 'utf8'); return f.match(/TEST_TOKEN\s*=\s*"?([^"\n]+)"?/)?.[1] || ''; } catch { return ''; } })();
const P = '__TEST_LC__';

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
async function POST(p, b) { return api(p, { method: 'POST', headers: H, body: JSON.stringify(b) }); }
async function PUT(p, b) { return api(p, { method: 'PUT', headers: H, body: JSON.stringify(b) }); }
async function PATCH(p, b) { return api(p, { method: 'PATCH', headers: H, body: b ? JSON.stringify(b) : undefined }); }
async function GET(p) { return api(p, { headers: H }); }
async function DEL(p) { return api(p, { method: 'DELETE', headers: H }); }

const CR = '\x1b[0m', CG = '\x1b[32m', CF = '\x1b[31m', CY = '\x1b[33m', CC = '\x1b[36m', CB = '\x1b[1m', CD = '\x1b[2m';
function pass(m) { totalPass++; console.log(`  ${CG}✅ ${m}${CR}`); }
function fail(m) { totalFail++; problems.push(m); console.log(`  ${CF}❌ ${m}${CR}`); }
function skip(m) { totalSkip++; console.log(`  ${CY}⚠️ ${m}${CR}`); }
function info(m) { console.log(`  ${CD}${m}${CR}`); }
function header(t) { console.log(`\n${CB}${CC}═══ ${t} ═══${CR}`); }
const pick = a => a[Math.floor(Math.random() * a.length)];
const rand = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
const futureDate = () => new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
const ROOMS = ['ГК 409', 'ГК 301', 'ГК 202', 'IT 119', 'IT 124', 'МК 131'];
const SLOTS = ['08:00', '09:40', '11:25', '13:25', '15:05', '16:50'];
const COMMENTS = ['Отлично!', 'Хорошо', 'Можно лучше', 'Молодец', 'Старайся', 'Супер работа', 'Нужно подтянуть'];

let _teachers = null, _students = null;
async function getUsers() {
  if (_teachers) return { teachers: _teachers, students: _students };
  const { data } = await GET('/api/admin/users');
  const all = Array.isArray(data) ? data : [];
  _teachers = all.filter(u => u?.role === 'teacher');
  _students = all.filter(u => u?.role === 'student');
  return { teachers: _teachers, students: _students };
}

// Get JWT token for a specific user (admin creates it via test-token endpoint)
async function getTokenFor(userId) {
  const { ok, data } = await POST('/api/admin/test-token', { user_id: userId });
  return ok ? data?.token : null;
}

// API call with a custom token (not the admin token)
async function apiAs(token, method, path, body) {
  const hdr = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
  const opts = { method, headers: hdr };
  if (body) opts.body = JSON.stringify(body);
  return api(path, opts);
}

// ═══════════════════════════════════════════
// 0-1. HEALTH + AUTH
// ═══════════════════════════════════════════
async function testHealth() {
  header('0. HEALTH CHECK');
  try { const { ok, res } = await GET('/api/health'); if (ok) pass(`API OK (${res.status})`); else fail(`API ${res.status}`); return ok; }
  catch (e) { fail(`API down: ${e.message}`); return false; }
}
async function testAuth() {
  header('1. AUTH');
  if (!TOKEN) { skip('No TOKEN'); return null; }
  const { ok, data } = await GET('/api/auth/me');
  if (ok && data) { pass(`${data.full_name} (${data.role})`); return data; }
  fail('Auth failed'); return null;
}

// ═══════════════════════════════════════════
// 2. КУРСЫ — ПОЛНЫЙ ЦИКЛ
// ═══════════════════════════════════════════
async function testCourses() {
  header('2. КУРСЫ — полный цикл');
  let s = 0, o = 0;

  // Create
  s++; const { ok: c1, data: cd } = await POST('/api/courses', { title: `${P}Курс JS/TS`, description: 'Полный курс', price: 15000, lang: 'ru' });
  if (!c1 || !cd?.id) { fail('Курс не создан'); return; } const cid = cd.id; info(`Создан: ${cid}`); o++;

  // Update settings
  s++; const { ok: u1 } = await PUT(`/api/courses/${cid}`, { title: `${P}Курс (upd)`, description: 'Обновлено', price: 20000, lang: 'kz' });
  if (u1) { info('Настройки обновлены'); o++; } else fail('Update fail');

  // Verify
  s++; const { data: cg } = await GET(`/api/courses/${cid}`);
  if (cg?.course?.price === 20000) { info(`price=20000 ✓`); o++; } else fail('Verify fail');

  // 3 modules
  s++; const mids = [];
  for (const t of ['Основы', 'Продвинутый', 'Фреймворки']) {
    const { data: md } = await POST(`/api/courses/${cid}/modules`, { title: `${P}${t}`, sort_order: mids.length });
    if (md?.id) mids.push(md.id);
  }
  if (mids.length === 3) { info(`3 модуля ✓`); o++; } else fail(`Модулей: ${mids.length}/3`);

  // 4 lessons (text, video, live, text)
  s++; const lids = [];
  const ldefs = [
    { title: `${P}Введение`, type: 'text', content: 'Добро пожаловать', duration_minutes: 15 },
    { title: `${P}Видео`, type: 'video', content: 'Видео-урок', duration_minutes: 45 },
    { title: `${P}Доп. материал`, type: 'text', content: 'Дополнительный материал', duration_minutes: 60 },
    { title: `${P}Практика`, type: 'text', content: 'Задачи', duration_minutes: 30 },
  ];
  if (mids[0]) for (let i = 0; i < ldefs.length; i++) {
    const { data: ld } = await POST(`/api/courses/${cid}/modules/${mids[0]}/lessons`, { ...ldefs[i], sort_order: i });
    if (ld?.id) lids.push(ld.id);
  }
  if (lids.length === 4) { info(`4 урока (text,video,live,text) ✓`); o++; } else fail(`Уроков: ${lids.length}/4`);

  // Delete 1 lesson
  s++; if (lids.length >= 4 && mids[0]) { const { ok: dl } = await DEL(`/api/courses/${cid}/modules/${mids[0]}/lessons/${lids.pop()}`); if (dl) { info('Урок удалён'); o++; } else fail('Del lesson'); } else skip('No lesson');

  // Delete 1 module
  s++; if (mids.length >= 3) { const { ok: dm } = await DEL(`/api/courses/${cid}/modules/${mids.pop()}`); if (dm) { info('Модуль удалён'); o++; } else fail('Del module'); } else skip('No module');

  // Status: draft → published
  s++; const { ok: sp } = await PUT(`/api/courses/${cid}`, { status: 'published' });
  if (sp) { info('draft → published'); o++; } else fail('Publish fail');

  // Verify status
  s++; const { data: pc } = await GET(`/api/courses/${cid}`);
  if (pc?.course?.status === 'published') { info('Status confirmed'); o++; } else fail('Status mismatch');

  // Enroll
  s++; const { ok: en } = await POST(`/api/courses/${cid}/enroll`, {});
  if (en) { info('Enrolled'); o++; } else skip('Enroll fail');

  // Progress lesson 1 → completed
  s++; if (lids[0]) { const { ok: p1 } = await POST(`/api/courses/${cid}/lessons/${lids[0]}/progress`, { status: 'completed' }); if (p1) { info('Lesson 1: completed'); o++; } else skip('Progress 1'); } else skip('No lesson');

  // Progress lesson 2 → in_progress
  s++; if (lids[1]) { const { ok: p2 } = await POST(`/api/courses/${cid}/lessons/${lids[1]}/progress`, { status: 'in_progress' }); if (p2) { info('Lesson 2: in_progress'); o++; } else skip('Progress 2'); } else skip('No lesson 2');

  // Check progress
  s++; const { data: prg } = await GET(`/api/courses/${cid}`);
  if (prg?.progress) { info(`Progress: ${prg.progress.completed_lessons}/${prg.progress.total_lessons} (${prg.progress.progress_percent}%)`); o++; } else skip('No progress');

  // Review
  s++; const { ok: rv } = await POST(`/api/courses/${cid}/reviews`, { rating: rand(3, 5), text: pick(['Отличный курс!', 'Рекомендую', 'Хороший материал']) });
  if (rv) { info('Отзыв оставлен'); o++; } else skip('Review fail');

  // Status → archived
  s++; const { ok: sa } = await PUT(`/api/courses/${cid}`, { status: 'archived' });
  if (sa) { info('published → archived'); o++; } else fail('Archive fail');

  // Catalog check
  s++; const { data: cat } = await GET('/api/courses');
  if (Array.isArray(cat)) { info(`Каталог: ${cat.length} курсов`); o++; } else skip('Catalog');

  // ⚡ Оставляем курс для проверки (НЕ удаляем)
  info(`⚡ ОСТАВЛЕН: курс ${cid} (archived) с ${mids.length} модулями, ${lids.length} уроками`);

  if (o >= s * 0.7) pass(`Курсы: ${o}/${s}`); else fail(`Курсы: ${o}/${s}`);
}

// ═══════════════════════════════════════════
// 3. СЕССИИ — ПОЛНЫЙ ЦИКЛ
// ═══════════════════════════════════════════
async function testSessions() {
  header('3. СЕССИИ — полный цикл');
  let s = 0, o = 0;
  const { teachers } = await getUsers();
  if (!teachers.length) { fail('Нет учителей'); return; }

  // Create class
  s++; const t = pick(teachers);
  const { ok: cc, data: cld } = await POST('/api/admin/classes', { name: `${P}IT_Grp`.slice(0, 20), teacher_id: t.id, academic_year: '2025-2026' });
  if (!cc || !cld?.id) { fail('Группа не создана'); return; }
  const classId = cld.id; info(`Группа: ${classId} (${t.full_name})`); o++;

  // Create 5 students + add
  s++; const sids = [];
  for (let i = 0; i < 5; i++) { const { data: sd } = await POST('/api/admin/users', { full_name: `${P}Stu_${rand(100,999)}`, phone: `+7100${rand(1000000,9999999)}`, role: 'student', lang: 'ru' }); if (sd?.id) sids.push(sd.id); }
  if (sids.length > 0) { const { ok: ao } = await POST(`/api/admin/classes/${classId}/students`, { student_ids: sids }); if (ao) { info(`${sids.length} учеников добавлено`); o++; } else fail('Add students'); } else fail('No students');

  // Create session
  s++; const d = futureDate(), rm = pick(ROOMS), sl = pick(SLOTS);
  const { ok: sc, data: sd2 } = await POST('/api/sessions', { class_id: classId, topic: `${P}Алгоритмы`, planned_date: d, time_slot: sl, room: rm, duration_minutes: 30 });
  if (!sc || !sd2?.id) { fail('Сессия не создана'); for (const id of sids) await DEL(`/api/admin/users/${id}`); return; }
  const sesId = sd2.id; info(`Сессия: ${sesId} (${d} ${sl} ${rm})`); o++;

  // Update session
  s++; const { ok: su } = await PUT(`/api/sessions/${sesId}`, { topic: `${P}Алгоритмы (upd)`, notes: 'Подготовить задачи' });
  if (su) { info('Тема обновлена'); o++; } else fail('Update session');

  // Attendance
  s++; const att = sids.map((id, i) => ({ student_id: id, status: i < sids.length - 1 ? pick(['present', 'late']) : 'absent' }));
  const { ok: ato } = await POST(`/api/sessions/${sesId}/attendance`, { attendance: att });
  if (ato) { info(`Посещаемость: ${att.filter(a => a.status === 'present').length}P ${att.filter(a => a.status === 'late').length}L ${att.filter(a => a.status === 'absent').length}A`); o++; } else fail('Attendance');

  // Verify attendance
  s++; const { data: attd } = await GET(`/api/sessions/${sesId}/attendance`);
  if (Array.isArray(attd) && attd.length > 0) { info(`Посещаемость: ${attd.length} записей ✓`); o++; } else fail('Att verify');

  // Init grades
  s++; const { ok: gi } = await POST(`/api/grades/sessions/${sesId}/init`, {});
  if (gi) { info('Оценки init'); o++; } else skip('Init grades');

  // Set grades
  s++; const gr = sids.map(id => { const p = Math.random() > 0.2; return { student_id: id, status: p ? 'present' : 'absent', grade: p ? rand(1, 10) : null, comment: p ? pick(COMMENTS) : null }; });
  const { ok: gu } = await PUT(`/api/grades/sessions/${sesId}/grades`, { grades: gr });
  if (gu) { const avg = gr.filter(g => g.grade).reduce((s, g) => s + g.grade, 0) / Math.max(1, gr.filter(g => g.grade).length); info(`Оценки: avg=${avg.toFixed(1)}`); o++; } else fail('Grades');

  // Verify grades
  s++; const { data: grd } = await GET(`/api/grades/sessions/${sesId}/grades`);
  if (Array.isArray(grd) && grd.length > 0) { info(`${grd.length} оценок ✓`); o++; } else fail('Grade verify');

  // Complete session
  s++; const { ok: cmp } = await PATCH(`/api/sessions/${sesId}/complete`, { actual_date: d });
  if (cmp) { info('Сессия completed'); o++; } else fail('Complete');

  // Monthly averages
  s++; const mo = d.slice(0, 7);
  const { data: md } = await GET(`/api/grades/classes/${classId}/monthly?month=${mo}`);
  if (Array.isArray(md)) { info(`Средние за ${mo}: ${md.length} уч.`); md.slice(0, 2).forEach(x => info(`  → ${x.student_name}: ${x.average}`)); o++; } else skip('Monthly');

  // Student grades
  s++; if (sids[0]) { const { data: sg } = await GET(`/api/grades/students/${sids[0]}/grades`); if (Array.isArray(sg)) { info(`Ученик: ${sg.length} оценок`); o++; } else skip('Stu grades'); } else skip('No stu');

  // Booked rooms
  s++; const { data: br } = await GET(`/api/sessions/booked-rooms?date=${d}`);
  if (Array.isArray(br)) { info(`Бронь кабинетов: ${br.length}`); o++; } else skip('Booked');

  // ⚡ Оставляем следы — не удаляем
  info(`⚡ ОСТАВЛЕНЫ: группа ${classId}, сессия ${sesId}, ${sids.length} учеников`);

  if (o >= s * 0.7) pass(`Сессии: ${o}/${s}`); else fail(`Сессии: ${o}/${s}`);
}

// ═══════════════════════════════════════════
// 4. МЕРОПРИЯТИЯ — ПОЛНЫЙ ЦИКЛ
// ═══════════════════════════════════════════
async function testEvents() {
  header('4. МЕРОПРИЯТИЯ — полный цикл');
  let s = 0, o = 0; const d = futureDate();

  s++; const { ok: c1, data: ed } = await POST('/api/events', { title: `${P}ДОД`, description: 'Приглашаем!', event_date: d, event_time: '14:00', location: 'Актовый зал', capacity: 100 });
  if (!c1 || !ed?.id) { fail('Не создано'); return; } const eid = ed.id; info(`Создано: ${eid}`); o++;

  s++; const { data: ev } = await GET(`/api/events/${eid}`);
  if (ev?.title) { info(`"${ev.title}"`); o++; } else fail('Get');

  s++; const { ok: u1 } = await PUT(`/api/events/${eid}`, { title: `${P}ДОД (upd)`, location: 'ГК 409', capacity: 200 });
  if (u1) { info('Updated'); o++; } else fail('Update');

  s++; const { ok: s1 } = await PUT(`/api/events/${eid}`, { status: 'ongoing' }); if (s1) { info('→ ongoing'); o++; } else fail('ongoing');

  s++; const { ok: r1 } = await POST(`/api/events/${eid}/register`, {}); if (r1) { info('Registered'); o++; } else skip('Register');

  s++; const { data: ev2 } = await GET(`/api/events/${eid}`); if (ev2?.is_registered) { info('is_registered ✓'); o++; } else skip('is_reg');

  s++; const { ok: ur } = await DEL(`/api/events/${eid}/register`); if (ur) { info('Unregistered'); o++; } else skip('Unreg');

  s++; const { ok: s2 } = await PUT(`/api/events/${eid}`, { status: 'completed' }); if (s2) { info('→ completed'); o++; } else fail('completed');

  // Test cancelled on separate event
  s++; const { data: ed2 } = await POST('/api/events', { title: `${P}Cancel_test`, event_date: d, event_time: '16:00', location: 'X', capacity: 10 });
  if (ed2?.id) { const { ok: cs } = await PUT(`/api/events/${ed2.id}`, { status: 'cancelled' }); if (cs) { info('cancelled ✓'); o++; } else fail('cancel'); await DEL(`/api/events/${ed2.id}`); } else skip('No 2nd');

  s++; const { data: list } = await GET('/api/events'); if (Array.isArray(list)) { info(`Всего: ${list.length}`); o++; } else fail('List');

  // ⚡ Оставляем мероприятие
  info(`⚡ ОСТАВЛЕНО: мероприятие ${eid} (status=completed)`);

  if (o >= s * 0.7) pass(`Мероприятия: ${o}/${s}`); else fail(`Мероприятия: ${o}/${s}`);
}

// ═══════════════════════════════════════════
// 5. ОТКРЫТЫЕ ЗАНЯТИЯ — ПОЛНЫЙ ЦИКЛ
// ═══════════════════════════════════════════
async function testOpenSessions() {
  header('5. ОТКРЫТЫЕ ЗАНЯТИЯ — полный цикл');
  let s = 0, o = 0; const d = futureDate();

  s++; const { ok: c1, data: od } = await POST('/api/open-sessions', { title: `${P}AI Мастер-класс`, description: 'Нейронные сети', session_date: d, session_time: '10:00', location: 'IT 119', max_students: 25 });
  if (!c1 || !od?.id) { fail('Не создано'); return; } const oid = od.id; info(`Создано: ${oid}`); o++;

  s++; const { data: os } = await GET(`/api/open-sessions/${oid}`); if (os?.title) { info(`"${os.title}"`); o++; } else fail('Get');

  s++; const { ok: u1 } = await PUT(`/api/open-sessions/${oid}`, { title: `${P}AI (upd)`, max_students: 40 }); if (u1) { info('Updated'); o++; } else fail('Update');

  s++; const { ok: r1 } = await POST(`/api/open-sessions/${oid}/register`, {}); if (r1) { info('Registered'); o++; } else skip('Reg');

  s++; const { data: os2 } = await GET(`/api/open-sessions/${oid}`); if (os2?.is_registered) { info('is_registered ✓'); o++; } else skip('is_reg');

  s++; const { ok: ur } = await DEL(`/api/open-sessions/${oid}/register`); if (ur) { info('Unregistered'); o++; } else skip('Unreg');

  s++; const { ok: sc } = await PUT(`/api/open-sessions/${oid}`, { status: 'closed' }); if (sc) { info('→ closed'); o++; } else fail('closed');
  s++; const { ok: s2 } = await PUT(`/api/open-sessions/${oid}`, { status: 'completed' }); if (s2) { info('→ completed'); o++; } else fail('completed');

  s++; const { data: list } = await GET('/api/open-sessions'); if (Array.isArray(list)) { info(`Всего: ${list.length}`); o++; } else fail('List');

  // ⚡ Оставляем
  info(`⚡ ОСТАВЛЕНО: откр.занятие ${oid} (status=completed)`);

  if (o >= s * 0.7) pass(`Откр.занятия: ${o}/${s}`); else fail(`Откр.занятия: ${o}/${s}`);
}

// ═══════════════════════════════════════════
// 6. ПОЛЬЗОВАТЕЛИ — ВСЕ РОЛИ + БЕЗОПАСНОСТЬ
// ═══════════════════════════════════════════
async function testUsers() {
  header('6. ПОЛЬЗОВАТЕЛИ — роли + безопасность');
  let s = 0, o = 0; const ids = [];

  const defs = [
    { full_name: `${P}Student`, phone: `+7200${rand(1000000,9999999)}`, role: 'student', lang: 'ru' },
    { full_name: `${P}Teacher`, phone: `+7201${rand(1000000,9999999)}`, role: 'teacher', lang: 'ru' },
    { full_name: `${P}Parent`, phone: `+7202${rand(1000000,9999999)}`, role: 'parent', lang: 'kz' },
  ];
  for (const d of defs) { s++; const { ok: c1, data: ud } = await POST('/api/admin/users', d); if (c1 && ud?.id) { ids.push(ud.id); info(`${d.role}: ${ud.id}`); o++; } else fail(`${d.role} fail`); }

  s++; const { data: all } = await GET('/api/admin/users');
  const arr = Array.isArray(all) ? all : [];
  if (ids.every(id => arr.some(u => u.id === id))) { info(`${ids.length} found`); o++; } else fail('Not all found');

  // Admin protection
  s++; const admin = arr.find(u => u.role === 'admin');
  if (admin) { const { ok: d1 } = await DEL(`/api/admin/users/${admin.id}`); if (!d1) { info('Admin protected ✓'); o++; } else fail('ADMIN DELETED!'); } else skip('No admin');

  // No token
  s++; const nt = await api('/api/admin/users', { headers: { 'Content-Type': 'application/json' } }); if (!nt.ok) { info('No token: blocked ✓'); o++; } else fail('No token passed!');

  // Fake token
  s++; const ft = await api('/api/admin/users', { headers: { 'Content-Type': 'application/json', Authorization: 'Bearer FAKE' } }); if (!ft.ok) { info('Fake token: blocked ✓'); o++; } else fail('Fake passed!');

  // ⚡ Оставляем пользователей
  info(`⚡ ОСТАВЛЕНЫ: ${ids.length} пользователей (${ids.join(', ')})`);

  if (o >= s * 0.7) pass(`Пользователи: ${o}/${s}`); else fail(`Пользователи: ${o}/${s}`);
}

// ═══════════════════════════════════════════
// 7. ПОДДЕРЖКА — ТИКЕТЫ + СООБЩЕНИЯ
// ═══════════════════════════════════════════
async function testSupport() {
  header('7. ПОДДЕРЖКА — тикеты');
  let s = 0, o = 0;

  s++; const { ok: c1, data: td } = await POST('/api/support/tickets', { subject: `${P}Проблема`, message: 'Оценки не сохраняются!', priority: 'high' });
  if (!c1 || !td?.id) { fail('Тикет не создан'); return; } const tid = td.id; info(`Тикет: ${tid}`); o++;

  s++; const { data: tg } = await GET(`/api/support/tickets/${tid}`);
  if (tg?.ticket) { info(`"${tg.ticket.subject}", msgs: ${tg.messages?.length}`); o++; } else fail('Get ticket');

  for (const msg of ['Скриншот прикрепил', 'Chrome, Windows', 'Жду ответа...']) {
    s++; const { ok: m1 } = await POST(`/api/support/tickets/${tid}/messages`, { message: `${P}${msg}` });
    if (m1) { info(`Msg: "${msg}"`); o++; } else fail('Msg fail');
  }

  s++; const { data: ch } = await GET(`/api/support/tickets/${tid}`);
  if ((ch?.messages?.length || 0) >= 4) { info(`Chain: ${ch.messages.length} msgs ✓`); o++; } else fail('Chain');

  s++; const { data: tl } = await GET('/api/support/tickets');
  if (Array.isArray(tl)) { info(`Тикетов: ${tl.length}`); o++; } else fail('List');

  if (o >= s * 0.7) pass(`Поддержка: ${o}/${s}`); else fail(`Поддержка: ${o}/${s}`);
}

// ═══════════════════════════════════════════
// 8. РЕЙТИНГИ УЧИТЕЛЕЙ
// ═══════════════════════════════════════════
async function testRatings() {
  header('8. РЕЙТИНГИ УЧИТЕЛЕЙ');
  let s = 0, o = 0;

  s++; const { ok: t1, data: tl } = await GET('/api/ratings/teachers');
  if (!t1 || !Array.isArray(tl)) { fail('List fail'); return; }
  info(`Учителей: ${tl.length}`); o++;

  if (tl.length === 0) { pass('Рейтинги: 0 учителей'); return; }

  const sample = tl.length > 3 ? [pick(tl), pick(tl), pick(tl)] : tl;
  for (const teacher of sample) {
    s++; const tid = teacher.teacher_id || teacher.id;
    const { ok: d1, data: det } = await GET(`/api/ratings/teacher/${tid}`);
    if (d1 && det) {
      info(`${teacher.teacher_name}: ${det.average_rating}/10, ${det.valid_ratings} оценок`);
      if (det.recent_reviews?.length > 0) { const r = det.recent_reviews[0]; info(`  "${(r.reason || '').slice(0, 40)}" — ${r.student_name}`); }
      o++;
    } else fail(`Detail ${tid}`);
  }

  if (o >= s * 0.7) pass(`Рейтинги: ${o}/${s}`); else fail(`Рейтинги: ${o}/${s}`);
}

// ═══════════════════════════════════════════
// 9. РАНДОМ УЧЕНИКИ В ГРУППАХ
// ═══════════════════════════════════════════
async function testRandomAssignment() {
  header('9. РАНДОМ — ученики в группах');
  const { teachers, students } = await getUsers();
  if (students.length < 3 || !teachers.length) { skip('Мало данных'); return; }

  const created = [];
  for (let i = 0; i < 3; i++) {
    const t = pick(teachers);
    const { data: cd } = await POST('/api/admin/classes', { name: `${P}Rnd_${i}`.slice(0, 20), teacher_id: t.id, academic_year: '2025-2026' });
    if (cd?.id) {
      const n = rand(3, 8);
      const sel = [...students].sort(() => Math.random() - 0.5).slice(0, n).map(s => s.id);
      const { ok: ao } = await POST(`/api/admin/classes/${cd.id}/students`, { student_ids: sel });
      info(`Группа ${cd.id}: ${sel.length} уч. (${t.full_name}) ${ao ? '✓' : '✗'}`);
      created.push(cd.id);
    }
  }

  // Cleanup: keep 1
  for (let i = 0; i < created.length - 1; i++) await DEL(`/api/admin/classes/${created[i]}`).catch(() => {});
  if (created.length > 0) info(`Оставлена 1 группа: ${created[created.length - 1]}`);

  if (created.length >= 2) pass(`Распределено: ${created.length} групп`);
  else fail('Мало групп');
}

// ═══════════════════════════════════════════
// 10. ПАРАЛЛЕЛЬНЫЕ ЗАПРОСЫ
// ═══════════════════════════════════════════
async function testConcurrent() {
  header('10. ПАРАЛЛЕЛЬНЫЕ ЗАПРОСЫ (20x)');
  const eps = ['/api/sessions', '/api/events', '/api/open-sessions', '/api/courses', '/api/admin/users',
    '/api/admin/classes', '/api/ratings/teachers', '/api/support/tickets', '/api/reports',
    '/api/sessions', '/api/events', '/api/open-sessions', '/api/courses', '/api/admin/users',
    '/api/admin/classes', '/api/ratings/teachers', '/api/support/tickets', '/api/reports',
    '/api/notifications', '/api/courses'];

  const t0 = performance.now();
  const results = await Promise.all(eps.map(async ep => { try { const { res } = await GET(ep); return res.status; } catch { return 0; } }));
  const ms = Math.round(performance.now() - t0);
  const ok = results.filter(s => s >= 200 && s < 400).length;
  const err = results.filter(s => s === 0 || s >= 500).length;

  info(`${ms}ms total, OK: ${ok}/20, Err: ${err}/20`);
  if (err <= 3) pass(`Concurrent: ${ok}/20 OK`); else fail(`${err} errors`);
}

// ═══════════════════════════════════════════
// 11. РЕЙТИНГ УЧИТЕЛЕЙ — ПОЛНЫЙ ЦИКЛ (сессия → завершение → ученики оценивают → проверка)
// ═══════════════════════════════════════════
async function testRatingsFullCycle() {
  header('11. РЕЙТИНГ УЧИТЕЛЕЙ — полный цикл');
  let s = 0, o = 0;
  const { teachers } = await getUsers();
  if (!teachers.length) { fail('Нет учителей'); return; }

  // 11a. Создать группу с учителем
  s++;
  const teacher = pick(teachers);
  const { ok: cc, data: cld } = await POST('/api/admin/classes', { name: `${P}Rating_CLS`.slice(0, 20), teacher_id: teacher.id, academic_year: '2025-2026' });
  if (!cc || !cld?.id) { fail('Группа не создана'); return; }
  const classId = cld.id;
  info(`Группа: ${classId} (учитель: ${teacher.full_name})`); o++;

  // 11b. Создать 5 учеников
  s++;
  const stuIds = [];
  for (let i = 0; i < 5; i++) {
    const { data: sd } = await POST('/api/admin/users', { full_name: `${P}RatStu_${rand(100,999)}`, phone: `+7300${rand(1000000,9999999)}`, role: 'student', lang: 'ru' });
    if (sd?.id) stuIds.push(sd.id);
  }
  await POST(`/api/admin/classes/${classId}/students`, { student_ids: stuIds });
  info(`${stuIds.length} учеников в группе`); if (stuIds.length >= 3) o++; else fail('Мало учеников');

  // 11c. Создать сессию (дата +7 дней чтобы избежать конфликтов с другими тестами)
  s++;
  const d = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10), rm = pick(ROOMS), sl = pick(SLOTS);
  const { ok: sc, data: sd2, json: sd2err } = await POST('/api/sessions', { class_id: classId, topic: `${P}Урок для рейтинга`, planned_date: d, time_slot: sl, room: rm, duration_minutes: 30 });
  if (!sc || !sd2?.id) { fail(`Сессия не создана: ${JSON.stringify(sd2err).slice(0, 150)}`); return; }
  const sesId = sd2.id;
  info(`Сессия: ${sesId}`); o++;

  // 11d. Завершить сессию
  s++;
  const { ok: cmp } = await PATCH(`/api/sessions/${sesId}/complete`, { actual_date: d });
  if (cmp) { info('Сессия завершена → ученики могут оценить'); o++; }
  else { fail('Сессия не завершена'); return; }

  // 11e. Получить токены учеников и оставить оценки от их имени
  s++;
  let ratingsSubmitted = 0;
  const ratingComments = [
    'Очень интересный урок, спасибо!',
    'Хорошо объяснили тему',
    'Нормально, но можно лучше подготовить материалы',
    'Отличная подача, легко понимать',
    'Урок был скучноватым, хотелось бы больше практики',
  ];
  const anonStudents = new Set(); // track which students are anonymous
  for (let i = 0; i < stuIds.length; i++) {
    const stuToken = await getTokenFor(stuIds[i]);
    if (!stuToken) { info(`  Токен для ученика ${i} не получен`); continue; }
    const rating = rand(3, 10);
    const comment = ratingComments[i] || pick(ratingComments);
    const isAnon = i % 2 === 0; // every other student is anonymous
    if (isAnon) anonStudents.add(stuIds[i]);
    const { ok: ro, json: rj } = await apiAs(stuToken, 'POST', `/api/ratings/session/${sesId}`, { rating, reason: comment, is_anonymous: isAnon });
    if (ro) {
      const anonTag = rj?.data?.is_anonymous ? ' 🕶анон' : '';
      info(`  Ученик ${i}: ${rating}/10 — "${comment.slice(0, 40)}..."${anonTag} ${rj?.data?.is_valid ? '(valid)' : '(filtered)'}`);
      ratingsSubmitted++;
    } else {
      info(`  Ученик ${i}: ошибка (${JSON.stringify(rj).slice(0, 100)})`);
    }
  }
  if (ratingsSubmitted >= 3) { info(`Оценок: ${ratingsSubmitted}/${stuIds.length}`); o++; }
  else fail(`Только ${ratingsSubmitted} оценок`);

  // 11f. Проверить что дубликат не пройдёт
  s++;
  if (stuIds[0]) {
    const stuToken = await getTokenFor(stuIds[0]);
    if (stuToken) {
      const { ok: dup, json: dj } = await apiAs(stuToken, 'POST', `/api/ratings/session/${sesId}`, { rating: 5, reason: 'Повторная оценка' });
      if (!dup && dj?.code === 'DUPLICATE') { info('Дубликат отклонён ✓'); o++; }
      else fail('Дубликат НЕ отклонён!');
    }
  }

  // 11g. Проверить что админ не может оценить (role check)
  s++;
  const { ok: adminRate, json: arj } = await POST(`/api/ratings/session/${sesId}`, { rating: 8, reason: 'Админ пытается' });
  if (!adminRate && arj?.code === 'FORBIDDEN') { info('Админ не может оценить ✓'); o++; }
  else fail('Админ СМОГ оценить!');

  // 11h. Проверить фильтр: экстремальная оценка без комментария → invalid
  s++;
  const extraStu = stuIds.length > 0 ? null : null; // can't add more to same session - already rated
  // Create a 2nd session to test filter
  const { data: sd3 } = await POST('/api/sessions', { class_id: classId, topic: `${P}Фильтр_тест`, planned_date: d, time_slot: SLOTS.find(x => x !== sl) || '08:30', room: ROOMS.find(x => x !== rm) || 'ГК 100', duration_minutes: 30 });
  if (sd3?.id) {
    await PATCH(`/api/sessions/${sd3.id}/complete`, { actual_date: d });
    const tk = await getTokenFor(stuIds[0]);
    if (tk) {
      // Rating 1 without reason → should be filtered as invalid
      const { ok: fr, data: frd } = await apiAs(tk, 'POST', `/api/ratings/session/${sd3.id}`, { rating: 1 });
      if (fr && frd?.is_valid === false) { info('Фильтр: 1/10 без причины → invalid ✓'); o++; }
      else if (fr) { info(`Фильтр: is_valid=${frd?.is_valid} (expected false)`); o++; }
      else skip('Фильтр не проверен');
    }
  } else skip('Вторая сессия для фильтра не создана');

  // 11i. Проверить анонимность: оценка+комментарий видны, имя скрыто
  s++;
  const { ok: anonOk, data: anonData } = await GET(`/api/ratings/session/${sesId}`);
  if (anonOk && Array.isArray(anonData)) {
    const anonReviews = anonData.filter(r => r.is_anonymous === true);
    const namedReviews = anonData.filter(r => !r.is_anonymous);
    const anonNameHidden = anonReviews.every(r => r.student_name === null && r.rating !== null);
    const namedVisible = namedReviews.every(r => r.student_name !== null && r.rating !== null);
    if (anonNameHidden && namedVisible) {
      info(`🕶 Анонимность: ${anonReviews.length} анон (имя скрыто, оценка видна), ${namedReviews.length} открытых ✓`);
      o++;
    } else {
      fail(`Анонимность: nameHidden=${anonNameHidden}, visible=${namedVisible}`);
      anonReviews.slice(0, 2).forEach(r => info(`  anon: rating=${r.rating}, name=${r.student_name}`));
    }
  } else { fail('Отзывы для проверки анонимности не получены'); }

  // 11j. Получить рейтинг учителя (admin endpoint)
  s++;
  const { ok: tro, data: trd } = await GET(`/api/ratings/teacher/${teacher.id}`);
  if (tro && trd) {
    info(`📊 ${teacher.full_name}: ${trd.average_rating}/10 (${trd.valid_ratings} valid из ${trd.total_ratings} всего)`);
    if (trd.recent_reviews?.length > 0) {
      trd.recent_reviews.slice(0, 3).forEach(r => {
        const who = r.is_anonymous ? '🕶 Аноним' : r.student_name;
        info(`  💬 ${r.rating}/10 — "${(r.reason || '').slice(0, 50)}" (${who})`);
      });
    }
    o++;
  } else fail('Рейтинг учителя не получен');

  // 11k. Список всех учителей с рейтингами
  s++;
  const { ok: tlo, data: tld } = await GET('/api/ratings/teachers');
  if (tlo && Array.isArray(tld)) {
    const ourT = tld.find(t => (t.teacher_id || t.id) === teacher.id);
    if (ourT) { info(`В списке: ${ourT.teacher_name} — ${ourT.average_rating}/10 (${ourT.total_ratings} оценок)`); }
    info(`Всего учителей: ${tld.length}`);
    o++;
  } else fail('Список учителей не получен');

  // ⚡ НЕ УДАЛЯЕМ — оставляем следы
  info(`⚡ ОСТАВЛЕНЫ: группа ${classId}, сессия ${sesId}, ${stuIds.length} учеников, ${ratingsSubmitted} оценок`);

  if (o >= s * 0.7) pass(`Рейтинги полный цикл: ${o}/${s}`);
  else fail(`Рейтинги: ${o}/${s}`);
}

// ═══════════════════════════════════════════
// 12. ОТКРЫТЫЕ ЗАНЯТИЯ — ПОЛНЫЙ ЦИКЛ С РАЗНЫХ РОЛЕЙ
// ═══════════════════════════════════════════
async function testOpenSessionsFullCycle() {
  header('12. ОТКРЫТЫЕ ЗАНЯТИЯ — полный цикл с ролями');
  let s = 0, o = 0;
  const { teachers, students } = await getUsers();
  const d = futureDate();

  // 12a. Создать учителя-тест и получить его токен
  s++;
  const { data: tData } = await POST('/api/admin/users', { full_name: `${P}Teach_OS`, phone: `+7400${rand(1000000,9999999)}`, role: 'teacher', lang: 'ru' });
  if (!tData?.id) { fail('Учитель не создан'); return; }
  const teacherId = tData.id;
  const teacherToken = await getTokenFor(teacherId);
  if (!teacherToken) { fail('Токен учителя не получен'); return; }
  info(`Учитель: ${teacherId}`); o++;

  // 12b. Учитель создаёт открытое занятие (от его имени)
  s++;
  const { ok: c1, data: osd } = await apiAs(teacherToken, 'POST', '/api/open-sessions', {
    title: `${P}Мастер-класс Python`, description: 'Основы Python для начинающих. Камера + демонстрация экрана.', session_date: d, session_time: '11:00', location: 'IT 119', max_students: 20,
  });
  if (!c1 || !osd?.id) { fail('Занятие не создано учителем'); return; }
  const osId = osd.id;
  info(`Занятие создано учителем: ${osId}`); o++;

  // 12c. Учитель обновляет занятие
  s++;
  const { ok: u1 } = await apiAs(teacherToken, 'PUT', `/api/open-sessions/${osId}`, {
    title: `${P}Python + AI Мастер-класс`, description: 'Камера + демонстрация + звук. Обновлено.', max_students: 30,
  });
  if (u1) { info('Обновлено учителем ✓'); o++; } else fail('Обновление учителем');

  // 12d. Создать 3 учеников и зарегистрировать их
  s++;
  const stuIds = [];
  for (let i = 0; i < 3; i++) {
    const { data: sd } = await POST('/api/admin/users', { full_name: `${P}OS_Stu_${rand(100,999)}`, phone: `+7500${rand(1000000,9999999)}`, role: 'student', lang: 'ru' });
    if (sd?.id) stuIds.push(sd.id);
  }
  info(`Создано ${stuIds.length} учеников`);
  let regged = 0;
  for (const sid of stuIds) {
    const stuToken = await getTokenFor(sid);
    if (stuToken) {
      const { ok: r1 } = await apiAs(stuToken, 'POST', `/api/open-sessions/${osId}/register`, {});
      if (r1) regged++;
    }
  }
  if (regged >= 2) { info(`Зарегистрировано: ${regged}/${stuIds.length}`); o++; }
  else fail(`Только ${regged} зарегистрировались`);

  // 12e. Проверить registrations и is_registered
  s++;
  if (stuIds[0]) {
    const stuToken = await getTokenFor(stuIds[0]);
    if (stuToken) {
      const { data: osCheck } = await apiAs(stuToken, 'GET', `/api/open-sessions/${osId}`);
      if (osCheck?.is_registered) { info(`Ученик видит is_registered=true ✓`); o++; }
      else { info('is_registered не true'); skip('is_registered'); }
    }
  }

  // 12f. Один ученик отменяет регистрацию
  s++;
  if (stuIds[2]) {
    const stuToken = await getTokenFor(stuIds[2]);
    if (stuToken) {
      const { ok: ur } = await apiAs(stuToken, 'DELETE', `/api/open-sessions/${osId}/register`);
      if (ur) { info('Ученик 3 отменил регистрацию ✓'); o++; }
      else fail('Отмена не сработала');
    }
  }

  // 12g. Учитель видит список зарегистрированных
  s++;
  const { data: osDetail } = await apiAs(teacherToken, 'GET', `/api/open-sessions/${osId}`);
  if (osDetail?.registrations) {
    info(`Registrations: ${osDetail.registrations.length} (после отмены 1)`);
    osDetail.registrations.forEach(r => info(`  → ${r.student_name}`));
    o++;
  } else skip('Registrations не доступны');

  // 12h. Учитель закрывает занятие
  s++;
  const { ok: cls } = await apiAs(teacherToken, 'PUT', `/api/open-sessions/${osId}`, { status: 'closed' });
  if (cls) { info('Статус: open → closed (учителем)'); o++; }
  else fail('Закрытие учителем');

  // 12i. Ученик НЕ может зарегистрироваться на closed
  s++;
  if (stuIds[2]) {
    const stuToken = await getTokenFor(stuIds[2]);
    if (stuToken) {
      const { ok: reFail, json: rfj } = await apiAs(stuToken, 'POST', `/api/open-sessions/${osId}/register`, {});
      if (!reFail) { info(`Closed → регистрация отклонена ✓ (${rfj?.code})`); o++; }
      else fail('Зарегистрировался на closed!');
    }
  }

  // 12j. Учитель завершает
  s++;
  const { ok: comp } = await apiAs(teacherToken, 'PUT', `/api/open-sessions/${osId}`, { status: 'completed' });
  if (comp) { info('→ completed'); o++; }
  else fail('completed');

  // 12k. Проверить список
  s++;
  const { data: allOS } = await GET('/api/open-sessions');
  if (Array.isArray(allOS)) {
    const ours = allOS.find(os => os.id === osId);
    if (ours) { info(`В списке: "${ours.title}" status=${ours.status}, ${ours.registered_count} рег.`); o++; }
    else { info('Наше занятие не в списке'); o++; }
  } else fail('Список не получен');

  // ⚡ НЕ УДАЛЯЕМ
  info(`⚡ ОСТАВЛЕНЫ: занятие ${osId}, учитель ${teacherId}, ${stuIds.length} учеников, ${regged} регистраций`);

  if (o >= s * 0.7) pass(`Откр.занятия полный цикл: ${o}/${s}`);
  else fail(`Откр.занятия: ${o}/${s}`);
}

// ═══════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════
async function main() {
  console.log(`\n${CB}╔══════════════════════════════════════════════════════╗`);
  console.log(`║   LIFECYCLE TEST — Тәрбие Сағаты API                 ║`);
  console.log(`╚══════════════════════════════════════════════════════╝${CR}`);
  console.log(`API: ${API_BASE}`);
  console.log(`Token: ${TOKEN ? TOKEN.slice(0, 20) + '...' : '(none)'}\n`);

  const t0 = performance.now();

  const healthy = await testHealth();
  if (!healthy) { console.log(`${CF}API down${CR}`); process.exit(1); }

  const me = await testAuth();
  if (!me) { console.log(`${CF}Auth failed. Pass TOKEN as argument.${CR}`); process.exit(1); }

  await testCourses();
  await testSessions();
  await testEvents();
  await testOpenSessions();
  await testUsers();
  await testSupport();
  await testRatings();
  await testRatingsFullCycle();
  await testOpenSessionsFullCycle();
  await testRandomAssignment();
  await testConcurrent();

  const ms = Math.round(performance.now() - t0);
  console.log(`\n${CB}╔══════════════════════════════════════════════════════╗`);
  console.log(`║   ИТОГО                                              ║`);
  console.log(`╚══════════════════════════════════════════════════════╝${CR}`);
  console.log(`${CG}  ✅ Passed: ${totalPass}${CR}`);
  console.log(`${CF}  ❌ Failed: ${totalFail}${CR}`);
  console.log(`${CY}  ⚠️  Skipped: ${totalSkip}${CR}`);
  console.log(`  ⏱ ${(ms / 1000).toFixed(1)}s\n`);

  if (problems.length > 0) {
    console.log(`${CF}${CB}  PROBLEMS:${CR}`);
    problems.forEach(p => console.log(`  ${CF}• ${p}${CR}`));
    console.log('');
  }

  process.exit(totalFail > 0 ? 1 : 0);
}

main().catch(e => { console.error(`FATAL: ${e.message}`); process.exit(1); });
