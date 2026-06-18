// Маршруты куратора: его ученики, его группы и импорт учеников/групп.
// Все маршруты требуют роль teacher.
import { Hono } from 'hono';
import type { HonoEnv } from '../env.js';
import { authMiddleware, requireRole } from '../middleware/auth.js';
import { createUserSchema, generateId, nowISO, ERROR_CODES } from '@tarbie/shared';

const teacher = new Hono<HonoEnv>();

teacher.use('*', authMiddleware, requireRole('teacher'));

// ── List users visible to this teacher (curator) ──
// A curator sees the participants of their own groups (students enrolled in
// classes where they are the teacher or the creator) PLUS any users they
// created themselves (so freshly-created students show up immediately and can
// be assigned to a group). Students linked to a curator's group by an admin or
// via import are now visible too — previously the list was filtered to
// `created_by = me` only, which left curators with an empty user list and made
// it impossible to add those students to a group (and therefore to grade them).
teacher.get('/users', async (c) => {
  const user = c.get('user');
  const rows = await c.env.DB.prepare(
    `SELECT DISTINCT u.id, u.full_name, u.role, u.phone, u.telegram_chat_id,
            u.lang, u.avatar_url, u.created_at
     FROM users u
     WHERE u.school_id = ?
       AND (
         u.created_by = ?
         OR u.id IN (
           SELECT cs.student_id
           FROM class_students cs
           JOIN classes cl ON cs.class_id = cl.id
           WHERE cl.school_id = ? AND (cl.teacher_id = ? OR cl.created_by = ?)
         )
       )
     ORDER BY u.full_name`
  ).bind(user.school_id, user.id, user.school_id, user.id, user.id).all();
  return c.json({ success: true, data: rows.results });
});

// ── Create user (student only) ──
teacher.post('/users', async (c) => {
  const user = c.get('user');
  const body = await c.req.json();
  const parsed = createUserSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ success: false, code: ERROR_CODES.VALIDATION_ERROR, message: parsed.error.issues[0]?.message ?? 'Invalid input' }, 400);
  }

  // Teachers can only create students
  if (parsed.data.role !== 'student') {
    return c.json({ success: false, code: ERROR_CODES.FORBIDDEN, message: 'Teachers can only create students' }, 403);
  }

  const existing = await c.env.DB.prepare(
    'SELECT id FROM users WHERE phone = ? AND school_id = ?'
  ).bind(parsed.data.phone, user.school_id).first();

  if (existing) {
    return c.json({ success: false, code: ERROR_CODES.DUPLICATE_ENTRY, message: 'User with this phone already exists' }, 409);
  }

  const id = generateId();
  const now = nowISO();

  await c.env.DB.prepare(
    `INSERT INTO users (id, school_id, full_name, role, phone, telegram_chat_id, whatsapp_number, lang, created_at, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    id, user.school_id, parsed.data.full_name, parsed.data.role,
    parsed.data.phone, parsed.data.telegram_chat_id ?? null,
    parsed.data.whatsapp_number ?? null, parsed.data.lang, now, user.id
  ).run();

  return c.json({ success: true, data: { id, ...parsed.data } }, 201);
});

// ── Bulk create users (student only) ──
teacher.post('/users/bulk', async (c) => {
  const user = c.get('user');
  const body = await c.req.json() as { users: Array<{ full_name: string; phone: string; role: string; lang: string }> };

  if (!Array.isArray(body.users) || body.users.length === 0) {
    return c.json({ success: false, code: ERROR_CODES.VALIDATION_ERROR, message: 'users must be a non-empty array' }, 400);
  }
  if (body.users.length > 5000) {
    return c.json({ success: false, code: ERROR_CODES.VALIDATION_ERROR, message: 'Maximum 5000 users per batch' }, 400);
  }

  const results: Array<{ index: number; full_name: string; phone: string; status: 'created' | 'duplicate' | 'error'; id?: string; message?: string }> = [];
  const now = nowISO();
  const schoolId = user.school_id;

  const existingRows = await c.env.DB.prepare(
    'SELECT phone FROM users WHERE school_id = ?'
  ).bind(schoolId).all<{ phone: string }>();
  const existingPhones = new Set((existingRows.results ?? []).map(r => r.phone));

  const toInsert: Array<{ index: number; id: string; full_name: string; phone: string; role: string; lang: string }> = [];

  for (let i = 0; i < body.users.length; i++) {
    const u = body.users[i]!;
    // Force role to student only
    if (u.role && u.role !== 'student') {
      u.role = 'student';
    }
    const parsed = createUserSchema.safeParse(u);
    if (!parsed.success) {
      results.push({ index: i, full_name: u.full_name || '', phone: u.phone || '', status: 'error', message: parsed.error.issues[0]?.message ?? 'Invalid' });
      continue;
    }
    if (existingPhones.has(parsed.data.phone)) {
      results.push({ index: i, full_name: parsed.data.full_name, phone: parsed.data.phone, status: 'duplicate', message: 'Phone already exists' });
      continue;
    }
    existingPhones.add(parsed.data.phone);
    const id = generateId();
    toInsert.push({ index: i, id, full_name: parsed.data.full_name, phone: parsed.data.phone, role: parsed.data.role, lang: parsed.data.lang });
  }

  const CHUNK = 50;
  for (let start = 0; start < toInsert.length; start += CHUNK) {
    const chunk = toInsert.slice(start, start + CHUNK);
    const stmts = chunk.map(u =>
      c.env.DB.prepare(
        `INSERT INTO users (id, school_id, full_name, role, phone, lang, created_at, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(u.id, schoolId, u.full_name, u.role, u.phone, u.lang, now, user.id)
    );
    try {
      await c.env.DB.batch(stmts);
      for (const u of chunk) {
        results.push({ index: u.index, full_name: u.full_name, phone: u.phone, status: 'created', id: u.id });
      }
    } catch {
      for (const u of chunk) {
        results.push({ index: u.index, full_name: u.full_name, phone: u.phone, status: 'error', message: 'DB batch error' });
      }
    }
  }

  const created = results.filter(r => r.status === 'created').length;
  const duplicates = results.filter(r => r.status === 'duplicate').length;
  const errors = results.filter(r => r.status === 'error').length;

  return c.json({ success: true, data: { results, summary: { total: body.users.length, created, duplicates, errors } } }, 201);
});

// ── Edit user (only own created, student role only) ──
teacher.put('/users/:id', async (c) => {
  const authUser = c.get('user');
  const userId = c.req.param('id');
  const body = await c.req.json() as { full_name?: string; role?: string; phone?: string; lang?: string };

  const existing = await c.env.DB.prepare(
    'SELECT id, created_by FROM users WHERE id = ? AND school_id = ?'
  ).bind(userId, authUser.school_id).first<{ id: string; created_by: string | null }>();
  if (!existing || existing.created_by !== authUser.id) {
    return c.json({ success: false, code: ERROR_CODES.USER_NOT_FOUND, message: 'User not found or not created by you' }, 404);
  }

  if (body.role && body.role !== 'student') {
    return c.json({ success: false, code: ERROR_CODES.FORBIDDEN, message: 'Teachers can only assign student role' }, 403);
  }
  if (body.lang && !['kz', 'ru'].includes(body.lang)) {
    return c.json({ success: false, code: ERROR_CODES.VALIDATION_ERROR, message: 'lang must be kz or ru' }, 400);
  }

  // Phone has a UNIQUE constraint. Pre-check so the caller gets a proper 409
  // instead of a generic 500 when the DB rejects the insert.
  if (body.phone) {
    const clash = await c.env.DB.prepare(
      'SELECT id FROM users WHERE phone = ? AND id != ?'
    ).bind(body.phone, userId).first();
    if (clash) {
      return c.json({ success: false, code: ERROR_CODES.DUPLICATE_ENTRY, message: 'Phone already in use' }, 409);
    }
  }

  const updates: string[] = [];
  const values: string[] = [];
  if (body.full_name) { updates.push('full_name = ?'); values.push(body.full_name); }
  if (body.role) { updates.push('role = ?'); values.push(body.role); }
  if (body.phone) { updates.push('phone = ?'); values.push(body.phone); }
  if (body.lang) { updates.push('lang = ?'); values.push(body.lang); }

  if (updates.length === 0) {
    return c.json({ success: false, code: ERROR_CODES.VALIDATION_ERROR, message: 'Nothing to update' }, 400);
  }

  values.push(userId);
  await c.env.DB.prepare(
    `UPDATE users SET ${updates.join(', ')} WHERE id = ?`
  ).bind(...values).run();

  return c.json({ success: true, data: { id: userId, updated: true } });
});

// ── Delete user (only own created) ──
teacher.delete('/users/:id', async (c) => {
  const authUser = c.get('user');
  const userId = c.req.param('id');

  const existing = await c.env.DB.prepare(
    'SELECT id, created_by FROM users WHERE id = ? AND school_id = ?'
  ).bind(userId, authUser.school_id).first<{ id: string; created_by: string | null }>();
  if (!existing || existing.created_by !== authUser.id) {
    return c.json({ success: false, code: ERROR_CODES.USER_NOT_FOUND, message: 'User not found or not created by you' }, 404);
  }

  await c.env.DB.prepare('DELETE FROM users WHERE id = ?').bind(userId).run();
  return c.json({ success: true, data: { id: userId, deleted: true } });
});

// ── List classes created by this teacher (or where they are teacher_id) ──
teacher.get('/classes', async (c) => {
  const user = c.get('user');
  const rows = await c.env.DB.prepare(
    `SELECT cl.*, u.full_name as teacher_name,
       (SELECT COUNT(*) FROM class_students WHERE class_id = cl.id) as student_count
     FROM classes cl
     JOIN users u ON cl.teacher_id = u.id
     WHERE cl.school_id = ? AND (cl.created_by = ? OR cl.teacher_id = ?)
     ORDER BY cl.name`
  ).bind(user.school_id, user.id, user.id).all();
  return c.json({ success: true, data: rows.results });
});

// ── Create class (teacher is auto-assigned as teacher_id) ──
teacher.post('/classes', async (c) => {
  const user = c.get('user');
  const body = await c.req.json() as { name: string; academic_year?: string };

  if (!body.name || typeof body.name !== 'string' || body.name.trim().length === 0) {
    return c.json({ success: false, code: ERROR_CODES.VALIDATION_ERROR, message: 'name is required' }, 400);
  }

  const id = generateId();
  const academicYear = body.academic_year || '2025-2026';

  await c.env.DB.prepare(
    'INSERT INTO classes (id, school_id, name, teacher_id, academic_year, created_by) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(id, user.school_id, body.name.trim(), user.id, academicYear, user.id).run();

  return c.json({ success: true, data: { id, school_id: user.school_id, name: body.name.trim(), teacher_id: user.id, academic_year: academicYear } }, 201);
});

// ── Add students to class (own classes only) ──
teacher.post('/classes/:id/students', async (c) => {
  const user = c.get('user');
  const classId = c.req.param('id');
  const body = await c.req.json() as { student_ids: string[] };

  const cls = await c.env.DB.prepare(
    'SELECT id FROM classes WHERE id = ? AND school_id = ? AND (created_by = ? OR teacher_id = ?)'
  ).bind(classId, user.school_id, user.id, user.id).first();

  if (!cls) {
    return c.json({ success: false, code: ERROR_CODES.CLASS_NOT_FOUND, message: 'Class not found' }, 404);
  }

  if (!Array.isArray(body.student_ids) || body.student_ids.length === 0) {
    return c.json({ success: false, code: ERROR_CODES.VALIDATION_ERROR, message: 'student_ids must be a non-empty array' }, 400);
  }

  const statements = body.student_ids.map((studentId: string) => {
    const id = generateId();
    return c.env.DB.prepare(
      'INSERT OR IGNORE INTO class_students (id, class_id, student_id) VALUES (?, ?, ?)'
    ).bind(id, classId, studentId);
  });

  await c.env.DB.batch(statements);

  return c.json({ success: true, data: { class_id: classId, added: body.student_ids.length } }, 201);
});

// ── Get class students (own classes only) ──
teacher.get('/classes/:id/students', async (c) => {
  const user = c.get('user');
  const classId = c.req.param('id');

  const cls = await c.env.DB.prepare(
    'SELECT id FROM classes WHERE id = ? AND school_id = ? AND (created_by = ? OR teacher_id = ?)'
  ).bind(classId, user.school_id, user.id, user.id).first();
  if (!cls) {
    return c.json({ success: false, code: ERROR_CODES.CLASS_NOT_FOUND, message: 'Class not found' }, 404);
  }

  const rows = await c.env.DB.prepare(
    `SELECT u.id, u.full_name, u.phone, u.telegram_chat_id, u.lang
     FROM class_students cs
     JOIN users u ON cs.student_id = u.id
     WHERE cs.class_id = ?
     ORDER BY u.full_name`
  ).bind(classId).all();

  return c.json({ success: true, data: rows.results });
});

// ── Edit class (own classes only) ──
teacher.put('/classes/:id', async (c) => {
  const user = c.get('user');
  const classId = c.req.param('id');
  const body = await c.req.json() as { name?: string; academic_year?: string };

  const existing = await c.env.DB.prepare(
    'SELECT id FROM classes WHERE id = ? AND school_id = ? AND (created_by = ? OR teacher_id = ?)'
  ).bind(classId, user.school_id, user.id, user.id).first();
  if (!existing) {
    return c.json({ success: false, code: ERROR_CODES.CLASS_NOT_FOUND, message: 'Class not found' }, 404);
  }

  const updates: string[] = [];
  const values: string[] = [];
  if (body.name) { updates.push('name = ?'); values.push(body.name); }
  if (body.academic_year) { updates.push('academic_year = ?'); values.push(body.academic_year); }

  if (updates.length === 0) {
    return c.json({ success: false, code: ERROR_CODES.VALIDATION_ERROR, message: 'Nothing to update' }, 400);
  }

  values.push(classId);
  await c.env.DB.prepare(
    `UPDATE classes SET ${updates.join(', ')} WHERE id = ?`
  ).bind(...values).run();

  return c.json({ success: true, data: { id: classId, updated: true } });
});

// ── Delete class (own created only) ──
teacher.delete('/classes/:id', async (c) => {
  const user = c.get('user');
  const classId = c.req.param('id');

  const existing = await c.env.DB.prepare(
    'SELECT id FROM classes WHERE id = ? AND school_id = ? AND created_by = ?'
  ).bind(classId, user.school_id, user.id).first();
  if (!existing) {
    return c.json({ success: false, code: ERROR_CODES.CLASS_NOT_FOUND, message: 'Class not found or not created by you' }, 404);
  }

  await c.env.DB.prepare('DELETE FROM classes WHERE id = ?').bind(classId).run();
  return c.json({ success: true, data: { id: classId, deleted: true } });
});

// ── Remove student from class (own classes only) ──
teacher.delete('/classes/:classId/students/:studentId', async (c) => {
  const user = c.get('user');
  const classId = c.req.param('classId');
  const studentId = c.req.param('studentId');

  const cls = await c.env.DB.prepare(
    'SELECT id FROM classes WHERE id = ? AND school_id = ? AND (created_by = ? OR teacher_id = ?)'
  ).bind(classId, user.school_id, user.id, user.id).first();
  if (!cls) {
    return c.json({ success: false, code: ERROR_CODES.CLASS_NOT_FOUND, message: 'Class not found' }, 404);
  }

  await c.env.DB.prepare(
    'DELETE FROM class_students WHERE class_id = ? AND student_id = ?'
  ).bind(classId, studentId).run();

  return c.json({ success: true, data: { class_id: classId, student_id: studentId, removed: true } });
});

// ── Import: students + groups (teacher scoped) ──
teacher.post('/import', async (c) => {
  const user = c.get('user');
  const body = await c.req.json() as {
    entries: Array<{
      student_name: string;
      student_phone: string;
      group_name: string;
    }>;
    lang: string;
    academic_year: string;
  };

  if (!Array.isArray(body.entries) || body.entries.length === 0) {
    return c.json({ success: false, code: ERROR_CODES.VALIDATION_ERROR, message: 'entries must be a non-empty array' }, 400);
  }
  if (body.entries.length > 5000) {
    return c.json({ success: false, code: ERROR_CODES.VALIDATION_ERROR, message: 'Maximum 5000 entries per request' }, 400);
  }

  const now = nowISO();
  const lang = ['kz', 'ru'].includes(body.lang) ? body.lang : 'ru';
  const academicYear = body.academic_year || '2025-2026';
  const schoolId = user.school_id;
  const CHUNK = 50;

  // Pre-fetch existing data
  const batchRes = await c.env.DB.batch([
    c.env.DB.prepare('SELECT id, phone FROM users WHERE school_id = ?').bind(schoolId),
    c.env.DB.prepare('SELECT id, name FROM classes WHERE school_id = ? AND (created_by = ? OR teacher_id = ?)').bind(schoolId, user.id, user.id),
  ]);

  const phoneToId = new Map<string, string>();
  for (const row of (batchRes[0]?.results ?? []) as Array<{ id: string; phone: string }>) {
    phoneToId.set(row.phone, row.id);
  }
  const classNameToId = new Map<string, string>();
  for (const row of (batchRes[1]?.results ?? []) as Array<{ id: string; name: string }>) {
    classNameToId.set(row.name, row.id);
  }

  // Phase 1: Groups
  const groupNames = new Set<string>();
  for (const e of body.entries) {
    const gn = e.group_name?.trim();
    if (gn) groupNames.add(gn);
  }

  const groupLog: Array<{ name: string; status: 'created' | 'exists' | 'error' }> = [];
  const groupInserts: D1PreparedStatement[] = [];
  const groupInsertMeta: Array<{ name: string; id: string }> = [];

  for (const groupName of groupNames) {
    if (classNameToId.has(groupName)) {
      groupLog.push({ name: groupName, status: 'exists' });
    } else {
      const id = generateId();
      classNameToId.set(groupName, id);
      groupInserts.push(
        c.env.DB.prepare(
          'INSERT INTO classes (id, school_id, name, teacher_id, academic_year, created_by) VALUES (?, ?, ?, ?, ?, ?)'
        ).bind(id, schoolId, groupName, user.id, academicYear, user.id)
      );
      groupInsertMeta.push({ name: groupName, id });
    }
  }

  for (let i = 0; i < groupInserts.length; i += CHUNK) {
    const chunk = groupInserts.slice(i, i + CHUNK);
    const meta = groupInsertMeta.slice(i, i + CHUNK);
    try {
      await c.env.DB.batch(chunk);
      for (const m of meta) groupLog.push({ name: m.name, status: 'created' });
    } catch {
      for (const m of meta) groupLog.push({ name: m.name, status: 'error' });
    }
  }

  // Phase 2: Students & assignments
  const studentLog: Array<{ name: string; phone: string; group: string; status: 'created' | 'exists' | 'assigned' | 'error'; message?: string }> = [];
  const studentInserts: D1PreparedStatement[] = [];
  const studentInsertMeta: Array<{ name: string; phone: string; group: string; id: string; isNew: boolean }> = [];
  const assignInserts: D1PreparedStatement[] = [];
  const assignInsertMeta: Array<{ name: string; phone: string; group: string; isNew: boolean }> = [];

  for (const e of body.entries) {
    const sName = e.student_name?.trim();
    const sPhone = e.student_phone?.trim();
    const gName = e.group_name?.trim();

    if (!sName || !sPhone) {
      studentLog.push({ name: sName || '', phone: sPhone || '', group: gName || '', status: 'error', message: 'Missing name or phone' });
      continue;
    }

    let studentId = phoneToId.get(sPhone);
    const isNew = !studentId;

    if (!studentId) {
      studentId = generateId();
      phoneToId.set(sPhone, studentId);
      studentInserts.push(
        c.env.DB.prepare(
          `INSERT INTO users (id, school_id, full_name, role, phone, lang, created_at, created_by) VALUES (?, ?, ?, 'student', ?, ?, ?, ?)`
        ).bind(studentId, schoolId, sName, sPhone, lang, now, user.id)
      );
      studentInsertMeta.push({ name: sName, phone: sPhone, group: gName || '', id: studentId, isNew: true });
    }

    if (gName) {
      const classId = classNameToId.get(gName);
      if (classId) {
        const assignId = generateId();
        assignInserts.push(
          c.env.DB.prepare(
            'INSERT OR IGNORE INTO class_students (id, class_id, student_id) VALUES (?, ?, ?)'
          ).bind(assignId, classId, studentId)
        );
        assignInsertMeta.push({ name: sName, phone: sPhone, group: gName, isNew });
      } else if (!isNew) {
        studentLog.push({ name: sName, phone: sPhone, group: gName, status: 'exists', message: 'Group not found' });
      }
    } else if (!isNew) {
      studentLog.push({ name: sName, phone: sPhone, group: '', status: 'exists' });
    }
  }

  for (let i = 0; i < studentInserts.length; i += CHUNK) {
    const chunk = studentInserts.slice(i, i + CHUNK);
    const meta = studentInsertMeta.slice(i, i + CHUNK);
    try {
      await c.env.DB.batch(chunk);
      for (const m of meta) {
        if (!m.group) studentLog.push({ name: m.name, phone: m.phone, group: '', status: 'created' });
      }
    } catch {
      for (const m of meta) studentLog.push({ name: m.name, phone: m.phone, group: m.group, status: 'error', message: 'DB batch error' });
    }
  }

  for (let i = 0; i < assignInserts.length; i += CHUNK) {
    const chunk = assignInserts.slice(i, i + CHUNK);
    const meta = assignInsertMeta.slice(i, i + CHUNK);
    try {
      await c.env.DB.batch(chunk);
      for (const m of meta) studentLog.push({ name: m.name, phone: m.phone, group: m.group, status: m.isNew ? 'created' : 'assigned' });
    } catch {
      for (const m of meta) studentLog.push({ name: m.name, phone: m.phone, group: m.group, status: 'error', message: 'Assign batch error' });
    }
  }

  return c.json({
    success: true,
    data: {
      teachers: { log: [], created: 0, total: 0 },
      groups: { log: groupLog, created: groupLog.filter(g => g.status === 'created').length, total: groupLog.length },
      students: { log: studentLog, created: studentLog.filter(s => s.status === 'created').length, assigned: studentLog.filter(s => s.status === 'assigned').length, errors: studentLog.filter(s => s.status === 'error').length, total: studentLog.length },
    },
  }, 201);
});

export default teacher;
