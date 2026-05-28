import { Hono } from 'hono';
import type { HonoEnv } from '../env.js';
import { authMiddleware, requireRole } from '../middleware/auth.js';
import { signJwt } from '../lib/jwt.js';
import { createUserSchema, createClassSchema, generateId, nowISO, ERROR_CODES } from '@tarbie/shared';

const admin = new Hono<HonoEnv>();

admin.use('*', authMiddleware, requireRole('admin'));

admin.get('/users', async (c) => {
  const user = c.get('user');
  const rows = await c.env.DB.prepare(
    'SELECT u.id, u.full_name, u.role, u.phone, u.telegram_chat_id, u.whatsapp_number, u.lang, u.created_at, u.avatar_url, u.premium, u.premium_expires_at, u.created_by, cb.full_name as created_by_name FROM users u LEFT JOIN users cb ON u.created_by = cb.id WHERE u.school_id = ? ORDER BY u.full_name'
  ).bind(user.school_id).all();
  return c.json({ success: true, data: rows.results });
});

admin.post('/users', async (c) => {
  const user = c.get('user');
  const body = await c.req.json();
  const parsed = createUserSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ success: false, code: ERROR_CODES.VALIDATION_ERROR, message: parsed.error.issues[0]?.message ?? 'Invalid input' }, 400);
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

// Bulk create users — optimized with DB.batch()
admin.post('/users/bulk', async (c) => {
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

  // Pre-fetch ALL existing phones for this school in 1 query
  const existingRows = await c.env.DB.prepare(
    'SELECT phone FROM users WHERE school_id = ?'
  ).bind(schoolId).all<{ phone: string }>();
  const existingPhones = new Set((existingRows.results ?? []).map(r => r.phone));

  // Validate and split into to-create vs duplicates
  const toInsert: Array<{ index: number; id: string; full_name: string; phone: string; role: string; lang: string }> = [];

  for (let i = 0; i < body.users.length; i++) {
    const u = body.users[i]!;
    const parsed = createUserSchema.safeParse(u);
    if (!parsed.success) {
      results.push({ index: i, full_name: u.full_name || '', phone: u.phone || '', status: 'error', message: parsed.error.issues[0]?.message ?? 'Invalid' });
      continue;
    }
    if (existingPhones.has(parsed.data.phone)) {
      results.push({ index: i, full_name: parsed.data.full_name, phone: parsed.data.phone, status: 'duplicate', message: 'Phone already exists' });
      continue;
    }
    // Mark as seen to catch dupes within the batch itself
    existingPhones.add(parsed.data.phone);
    const id = generateId();
    toInsert.push({ index: i, id, full_name: parsed.data.full_name, phone: parsed.data.phone, role: parsed.data.role, lang: parsed.data.lang });
  }

  // Batch INSERT in chunks of 50
  const CHUNK = 50;
  for (let start = 0; start < toInsert.length; start += CHUNK) {
    const chunk = toInsert.slice(start, start + CHUNK);
    const stmts = chunk.map(u =>
      c.env.DB.prepare(
        `INSERT INTO users (id, school_id, full_name, role, phone, telegram_chat_id, whatsapp_number, lang, created_at, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(u.id, schoolId, u.full_name, u.role, u.phone, null, null, u.lang, now, user.id)
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

// ── Comprehensive import: teachers + groups + students + assignments ──
// Optimized with DB.batch() — supports up to 5000 entries per request
admin.post('/import', async (c) => {
  const user = c.get('user');
  const body = await c.req.json() as {
    entries: Array<{
      student_name: string;
      student_phone: string;
      group_name: string;
      teacher_name: string;
      teacher_phone: string;
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

  // ── Pre-fetch ALL existing data in 2 bulk queries ──
  const batchRes = await c.env.DB.batch([
    c.env.DB.prepare('SELECT id, phone FROM users WHERE school_id = ?').bind(schoolId),
    c.env.DB.prepare('SELECT id, name FROM classes WHERE school_id = ?').bind(schoolId),
  ]);

  const phoneToId = new Map<string, string>();
  for (const row of (batchRes[0]?.results ?? []) as Array<{ id: string; phone: string }>) {
    phoneToId.set(row.phone, row.id);
  }
  const classNameToId = new Map<string, string>();
  for (const row of (batchRes[1]?.results ?? []) as Array<{ id: string; name: string }>) {
    classNameToId.set(row.name, row.id);
  }

  // ── Phase 1: Collect & batch-insert unique teachers ──
  const teacherMap = new Map<string, { name: string; phone: string }>();
  for (const e of body.entries) {
    if (e.teacher_phone && e.teacher_name) {
      const tp = e.teacher_phone.trim();
      if (!teacherMap.has(tp)) {
        teacherMap.set(tp, { name: e.teacher_name.trim(), phone: tp });
      }
    }
  }

  const teacherLog: Array<{ name: string; phone: string; status: 'created' | 'exists' | 'error'; id?: string }> = [];
  const teacherInserts: D1PreparedStatement[] = [];
  const teacherInsertMeta: Array<{ phone: string; name: string; id: string }> = [];

  for (const [phone, t] of teacherMap) {
    if (phoneToId.has(phone)) {
      teacherLog.push({ name: t.name, phone, status: 'exists', id: phoneToId.get(phone) });
    } else {
      const id = generateId();
      phoneToId.set(phone, id);
      teacherInserts.push(
        c.env.DB.prepare(
          `INSERT INTO users (id, school_id, full_name, role, phone, lang, created_at) VALUES (?, ?, ?, 'teacher', ?, ?, ?)`
        ).bind(id, schoolId, t.name, phone, lang, now)
      );
      teacherInsertMeta.push({ phone, name: t.name, id });
    }
  }

  // Execute teacher inserts in batches
  for (let i = 0; i < teacherInserts.length; i += CHUNK) {
    const chunk = teacherInserts.slice(i, i + CHUNK);
    const meta = teacherInsertMeta.slice(i, i + CHUNK);
    try {
      await c.env.DB.batch(chunk);
      for (const m of meta) teacherLog.push({ name: m.name, phone: m.phone, status: 'created', id: m.id });
    } catch {
      for (const m of meta) teacherLog.push({ name: m.name, phone: m.phone, status: 'error' });
    }
  }

  // ── Phase 2: Collect & batch-insert unique groups ──
  const groupMap = new Map<string, string>(); // group_name → teacher_phone
  for (const e of body.entries) {
    const gn = e.group_name?.trim();
    if (gn && !groupMap.has(gn) && e.teacher_phone) {
      groupMap.set(gn, e.teacher_phone.trim());
    }
  }

  const groupLog: Array<{ name: string; teacher: string; status: 'created' | 'exists' | 'error' }> = [];
  const groupInserts: D1PreparedStatement[] = [];
  const groupInsertMeta: Array<{ name: string; teacher: string; id: string }> = [];

  for (const [groupName, teacherPhone] of groupMap) {
    if (classNameToId.has(groupName)) {
      groupLog.push({ name: groupName, teacher: teacherPhone, status: 'exists' });
    } else {
      const teacherId = phoneToId.get(teacherPhone);
      if (!teacherId) {
        groupLog.push({ name: groupName, teacher: teacherPhone, status: 'error' });
        continue;
      }
      const id = generateId();
      classNameToId.set(groupName, id);
      groupInserts.push(
        c.env.DB.prepare(
          'INSERT INTO classes (id, school_id, name, teacher_id, academic_year) VALUES (?, ?, ?, ?, ?)'
        ).bind(id, schoolId, groupName, teacherId, academicYear)
      );
      groupInsertMeta.push({ name: groupName, teacher: teacherPhone, id });
    }
  }

  for (let i = 0; i < groupInserts.length; i += CHUNK) {
    const chunk = groupInserts.slice(i, i + CHUNK);
    const meta = groupInsertMeta.slice(i, i + CHUNK);
    try {
      await c.env.DB.batch(chunk);
      for (const m of meta) groupLog.push({ name: m.name, teacher: m.teacher, status: 'created' });
    } catch {
      for (const m of meta) groupLog.push({ name: m.name, teacher: m.teacher, status: 'error' });
    }
  }

  // ── Phase 3: Batch-insert students & assignments ──
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
          `INSERT INTO users (id, school_id, full_name, role, phone, lang, created_at) VALUES (?, ?, ?, 'student', ?, ?, ?)`
        ).bind(studentId, schoolId, sName, sPhone, lang, now)
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

  // Batch insert students
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

  // Batch assign to groups
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
      teachers: { log: teacherLog, created: teacherLog.filter(t => t.status === 'created').length, total: teacherLog.length },
      groups: { log: groupLog, created: groupLog.filter(g => g.status === 'created').length, total: groupLog.length },
      students: { log: studentLog, created: studentLog.filter(s => s.status === 'created').length, assigned: studentLog.filter(s => s.status === 'assigned').length, errors: studentLog.filter(s => s.status === 'error').length, total: studentLog.length },
    },
  }, 201);
});

admin.get('/classes', async (c) => {
  const user = c.get('user');
  const rows = await c.env.DB.prepare(
    `SELECT cl.*, u.full_name as teacher_name, cb.full_name as created_by_name,
       (SELECT COUNT(*) FROM class_students WHERE class_id = cl.id) as student_count
     FROM classes cl
     JOIN users u ON cl.teacher_id = u.id
     LEFT JOIN users cb ON cl.created_by = cb.id
     WHERE cl.school_id = ?
     ORDER BY cl.name`
  ).bind(user.school_id).all();
  return c.json({ success: true, data: rows.results });
});

admin.post('/classes', async (c) => {
  const user = c.get('user');
  const body = await c.req.json();
  const parsed = createClassSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ success: false, code: ERROR_CODES.VALIDATION_ERROR, message: parsed.error.issues[0]?.message ?? 'Invalid input' }, 400);
  }

  const teacher = await c.env.DB.prepare(
    "SELECT id FROM users WHERE id = ? AND school_id = ? AND role = 'teacher'"
  ).bind(parsed.data.teacher_id, user.school_id).first();

  if (!teacher) {
    return c.json({ success: false, code: ERROR_CODES.USER_NOT_FOUND, message: 'Teacher not found' }, 404);
  }

  const id = generateId();
  await c.env.DB.prepare(
    'INSERT INTO classes (id, school_id, name, teacher_id, academic_year, created_by) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(id, user.school_id, parsed.data.name, parsed.data.teacher_id, parsed.data.academic_year, user.id).run();

  return c.json({ success: true, data: { id, school_id: user.school_id, ...parsed.data } }, 201);
});

admin.post('/classes/:id/students', async (c) => {
  const user = c.get('user');
  const classId = c.req.param('id');
  const body = await c.req.json() as { student_ids: string[] };

  const cls = await c.env.DB.prepare(
    'SELECT id FROM classes WHERE id = ? AND school_id = ?'
  ).bind(classId, user.school_id).first();

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

// Edit user
admin.put('/users/:id', async (c) => {
  const authUser = c.get('user');
  const userId = c.req.param('id');
  const body = await c.req.json() as { full_name?: string; role?: string; phone?: string; lang?: string };

  const existing = await c.env.DB.prepare(
    'SELECT id FROM users WHERE id = ? AND school_id = ?'
  ).bind(userId, authUser.school_id).first();
  if (!existing) {
    return c.json({ success: false, code: ERROR_CODES.USER_NOT_FOUND, message: 'User not found' }, 404);
  }

  // Validate lang if provided
  if (body.lang && !['kz', 'ru'].includes(body.lang)) {
    return c.json({ success: false, code: ERROR_CODES.VALIDATION_ERROR, message: 'lang must be kz or ru' }, 400);
  }
  // Validate role if provided
  const validRoles = ['admin', 'teacher', 'student'];
  if (body.role && !validRoles.includes(body.role)) {
    return c.json({ success: false, code: ERROR_CODES.VALIDATION_ERROR, message: 'Invalid role' }, 400);
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

// Delete user
admin.delete('/users/:id', async (c) => {
  const authUser = c.get('user');
  const userId = c.req.param('id');

  if (userId === authUser.id) {
    return c.json({ success: false, code: 'CANNOT_DELETE_SELF', message: 'Cannot delete yourself' }, 400);
  }

  const existing = await c.env.DB.prepare(
    'SELECT id FROM users WHERE id = ? AND school_id = ?'
  ).bind(userId, authUser.school_id).first();
  if (!existing) {
    return c.json({ success: false, code: ERROR_CODES.USER_NOT_FOUND, message: 'User not found' }, 404);
  }

  await c.env.DB.prepare('DELETE FROM users WHERE id = ?').bind(userId).run();
  return c.json({ success: true, data: { id: userId, deleted: true } });
});

// Get class students
admin.get('/classes/:id/students', async (c) => {
  const authUser = c.get('user');
  const classId = c.req.param('id');

  const cls = await c.env.DB.prepare(
    'SELECT id FROM classes WHERE id = ? AND school_id = ?'
  ).bind(classId, authUser.school_id).first();
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

// Edit class
admin.put('/classes/:id', async (c) => {
  const authUser = c.get('user');
  const classId = c.req.param('id');
  const body = await c.req.json() as { name?: string; teacher_id?: string; academic_year?: string };

  const existing = await c.env.DB.prepare(
    'SELECT id FROM classes WHERE id = ? AND school_id = ?'
  ).bind(classId, authUser.school_id).first();
  if (!existing) {
    return c.json({ success: false, code: ERROR_CODES.CLASS_NOT_FOUND, message: 'Class not found' }, 404);
  }

  const updates: string[] = [];
  const values: string[] = [];
  if (body.name) { updates.push('name = ?'); values.push(body.name); }
  if (body.teacher_id) { updates.push('teacher_id = ?'); values.push(body.teacher_id); }
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

// Delete class
admin.delete('/classes/:id', async (c) => {
  const authUser = c.get('user');
  const classId = c.req.param('id');

  const existing = await c.env.DB.prepare(
    'SELECT id FROM classes WHERE id = ? AND school_id = ?'
  ).bind(classId, authUser.school_id).first();
  if (!existing) {
    return c.json({ success: false, code: ERROR_CODES.CLASS_NOT_FOUND, message: 'Class not found' }, 404);
  }

  await c.env.DB.prepare('DELETE FROM classes WHERE id = ?').bind(classId).run();
  return c.json({ success: true, data: { id: classId, deleted: true } });
});

// Remove student from class
admin.delete('/classes/:classId/students/:studentId', async (c) => {
  const authUser = c.get('user');
  const classId = c.req.param('classId');
  const studentId = c.req.param('studentId');

  const cls = await c.env.DB.prepare(
    'SELECT id FROM classes WHERE id = ? AND school_id = ?'
  ).bind(classId, authUser.school_id).first();
  if (!cls) {
    return c.json({ success: false, code: ERROR_CODES.CLASS_NOT_FOUND, message: 'Class not found' }, 404);
  }

  await c.env.DB.prepare(
    'DELETE FROM class_students WHERE class_id = ? AND student_id = ?'
  ).bind(classId, studentId).run();

  return c.json({ success: true, data: { class_id: classId, student_id: studentId, removed: true } });
});

// ── Schedule-based auto-assignment of tarbiye lessons ──
admin.post('/sessions/auto-assign', async (c) => {
  const user = c.get('user');
  const body = await c.req.json() as {
    schedule: Array<{
      group_name: string;
      weekday: number; // 1=Mon..6=Sat
      shift: number;   // 1 or 2
      first_pair: number; // local pair number 1-4 within the shift
      auditorium?: string; // room / cabinet number
    }>;
    date_from: string; // YYYY-MM-DD
    date_to: string;   // YYYY-MM-DD
    duration_minutes?: number; // 15 or 30, default 30
  };

  if (!body.schedule || body.schedule.length === 0) {
    return c.json({ success: false, code: ERROR_CODES.VALIDATION_ERROR, message: 'schedule is required' }, 400);
  }
  if (!body.date_from || !body.date_to) {
    return c.json({ success: false, code: ERROR_CODES.VALIDATION_ERROR, message: 'date_from and date_to are required' }, 400);
  }

  const schoolId = user.school_id;
  const now = nowISO();
  const duration = body.duration_minutes ?? 30;

  // Pre-load classes — build multiple lookup keys for flexible matching
  const allClasses = await c.env.DB.prepare(
    'SELECT id, name, teacher_id FROM classes WHERE school_id = ?'
  ).bind(schoolId).all<{ id: string; name: string; teacher_id: string }>();
  const classMap = new Map<string, { id: string; name: string; teacher_id: string }>();
  for (const cl of allClasses.results) {
    const raw = cl.name.toLowerCase().trim();
    classMap.set(raw, cl);
    // Also index without spaces: "ис 25-1" → "ис25-1"
    const noSpace = raw.replace(/\s+/g, '');
    if (noSpace !== raw) classMap.set(noSpace, cl);
  }

  // Real college pair time slots (first 30 min of each pair)
  // Shift 1: pairs 1-4 (08:00–14:55)
  // Shift 2: pairs 1-4 mapped to afternoon (13:25–20:00)
  const pairSlotsByShift: Record<number, Record<number, string>> = {
    1: { 1: '08:00-08:30', 2: '09:40-10:10', 3: '11:25-11:55', 4: '13:25-13:55' },
    2: { 1: '13:25-13:55', 2: '15:05-15:35', 3: '16:50-17:20', 4: '18:30-19:00' },
  };

  // Build lookup: group_name_lower → { weekday → { shift, first_pair } }
  const scheduleMap = new Map<string, Map<number, { shift: number; first_pair: number; auditorium: string }>>();
  for (const entry of body.schedule) {
    const key = entry.group_name.toLowerCase().trim();
    const val = { shift: entry.shift || 1, first_pair: entry.first_pair, auditorium: entry.auditorium || '' };
    if (!scheduleMap.has(key)) scheduleMap.set(key, new Map());
    scheduleMap.get(key)!.set(entry.weekday, val);
    // Also store normalized (no spaces) variant
    const noSpace = key.replace(/\s+/g, '');
    if (noSpace !== key) {
      if (!scheduleMap.has(noSpace)) scheduleMap.set(noSpace, new Map());
      scheduleMap.get(noSpace)!.set(entry.weekday, val);
    }
  }

  // Iterate each date in range
  const log: Array<{
    group: string; date: string; pair: number; room?: string;
    status: 'created' | 'duplicate' | 'group_not_found' | 'no_schedule' | 'error';
    message?: string;
  }> = [];

  const startDate = new Date(body.date_from + 'T00:00:00');
  const endDate = new Date(body.date_to + 'T00:00:00');

  for (const [groupKey, cls] of classMap) {
    const dayMap = scheduleMap.get(groupKey);
    if (!dayMap) continue; // no schedule for this group

    const current = new Date(startDate);
    while (current <= endDate) {
      const weekday = current.getDay(); // 0=Sun..6=Sat
      const isoWeekday = weekday === 0 ? 7 : weekday; // 1=Mon..7=Sun
      const entry = dayMap.get(isoWeekday);

      if (entry) {
        const { shift, first_pair, auditorium } = entry;
        const dateStr = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}-${String(current.getDate()).padStart(2, '0')}`;
        const shiftSlots = pairSlotsByShift[shift] || pairSlotsByShift[1]!;
        const timeSlot = shiftSlots[first_pair] || `s${shift}p${first_pair}`;

        // Check duplicate
        const existing = await c.env.DB.prepare(
          `SELECT id FROM tarbie_sessions WHERE class_id = ? AND planned_date = ? AND time_slot = ? AND status != 'cancelled'`
        ).bind(cls.id, dateStr, timeSlot).first<{ id: string }>();

        if (existing) {
          log.push({ group: cls.name, date: dateStr, pair: first_pair, room: auditorium, status: 'duplicate' });
        } else {
          const id = generateId();
          try {
            await c.env.DB.prepare(
              `INSERT INTO tarbie_sessions (id, class_id, teacher_id, topic, planned_date, time_slot, room, status, duration_minutes, created_at, updated_at)
               VALUES (?, ?, ?, '', ?, ?, ?, 'planned', ?, ?, ?)`
            ).bind(id, cls.id, cls.teacher_id, dateStr, timeSlot, auditorium || null, duration, now, now).run();
            log.push({ group: cls.name, date: dateStr, pair: first_pair, room: auditorium, status: 'created' });
            try { await logChange(c.env.DB, schoolId, user.id, 'session', id, 'auto_assign', { date: { new: dateStr }, group: { new: cls.name }, pair: { new: String(first_pair) }, shift: { new: String(shift) } }); } catch {}
          } catch (err) {
            log.push({ group: cls.name, date: dateStr, pair: first_pair, room: auditorium, status: 'error', message: String(err) });
          }
        }
      }

      current.setDate(current.getDate() + 1);
    }
  }

  // Also report groups in schedule that were not found
  for (const [groupKey] of scheduleMap) {
    if (!classMap.has(groupKey)) {
      log.push({ group: groupKey, date: '', pair: 0, status: 'group_not_found', message: 'Group not found in system' });
    }
  }

  return c.json({
    success: true,
    data: {
      log,
      created: log.filter(l => l.status === 'created').length,
      duplicates: log.filter(l => l.status === 'duplicate').length,
      errors: log.filter(l => l.status === 'error' || l.status === 'group_not_found').length,
      total: log.length,
    },
  }, 201);
});

// ── Bulk sessions import from Excel ──
admin.post('/sessions/import', async (c) => {
  const user = c.get('user');
  const body = await c.req.json() as {
    sessions: Array<{
      group_name: string;
      topic: string;
      date: string;
      pair_number: number;
      auditorium: string;
      duration_minutes?: number;
    }>;
  };

  if (!Array.isArray(body.sessions) || body.sessions.length === 0) {
    return c.json({ success: false, code: ERROR_CODES.VALIDATION_ERROR, message: 'sessions must be a non-empty array' }, 400);
  }
  if (body.sessions.length > 300) {
    return c.json({ success: false, code: ERROR_CODES.VALIDATION_ERROR, message: 'Maximum 300 sessions per import' }, 400);
  }

  const schoolId = user.school_id;
  const now = nowISO();

  // Pre-load all classes for this school
  const allClasses = await c.env.DB.prepare(
    'SELECT id, name, teacher_id FROM classes WHERE school_id = ?'
  ).bind(schoolId).all<{ id: string; name: string; teacher_id: string }>();
  const classMap = new Map(allClasses.results.map(cl => [cl.name.toLowerCase().trim(), cl]));

  // Pair number → time slot mapping (real college schedule)
  // Shift 1 pairs 1-4, Shift 2 pairs 5-8
  const pairSlots: Record<number, string> = {
    1: '08:00-08:30', 2: '09:40-10:10', 3: '11:25-11:55', 4: '13:25-13:55',
    5: '13:25-13:55', 6: '15:05-15:35', 7: '16:50-17:20', 8: '18:30-19:00',
  };

  const log: Array<{
    group: string; topic: string; date: string; pair: number; room: string;
    status: 'created' | 'duplicate' | 'group_not_found' | 'error';
    message?: string;
  }> = [];

  for (const entry of body.sessions) {
    const groupName = (entry.group_name ?? '').trim();
    const topic = (entry.topic ?? '').trim();
    const date = (entry.date ?? '').trim();
    const pair = entry.pair_number ?? 0;
    const room = (entry.auditorium ?? '').trim();
    const duration = entry.duration_minutes ?? 30;

    // Resolve class
    const cls = classMap.get(groupName.toLowerCase());
    if (!cls) {
      log.push({ group: groupName, topic, date, pair, room, status: 'group_not_found', message: 'Group not found' });
      continue;
    }

    // Determine time slot
    const timeSlot = pairSlots[pair] || `pair-${pair}`;

    // Check for duplicate: same class, same date, same time_slot
    const existing = await c.env.DB.prepare(
      `SELECT id FROM tarbie_sessions WHERE class_id = ? AND planned_date = ? AND time_slot = ? AND status != 'cancelled'`
    ).bind(cls.id, date, timeSlot).first<{ id: string }>();

    if (existing) {
      log.push({ group: groupName, topic, date, pair, room, status: 'duplicate', message: 'Session already exists' });
      continue;
    }

    // Create session
    const id = generateId();
    try {
      await c.env.DB.prepare(
        `INSERT INTO tarbie_sessions (id, class_id, teacher_id, topic, planned_date, time_slot, room, status, duration_minutes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'planned', ?, ?, ?)`
      ).bind(id, cls.id, cls.teacher_id, topic || '', date, timeSlot, room || null, duration, now, now).run();
      log.push({ group: groupName, topic, date, pair, room, status: 'created' });
      try { await logChange(c.env.DB, schoolId, user.id, 'session', id, 'import', { topic: { new: topic }, date: { new: date }, group: { new: groupName } }); } catch {}
    } catch (err) {
      log.push({ group: groupName, topic, date, pair, room, status: 'error', message: String(err) });
    }
  }

  return c.json({
    success: true,
    data: {
      log,
      created: log.filter(l => l.status === 'created').length,
      duplicates: log.filter(l => l.status === 'duplicate').length,
      errors: log.filter(l => l.status === 'error' || l.status === 'group_not_found').length,
      total: log.length,
    },
  }, 201);
});

// ── Admin Change Log ──

// Helper: log an admin action
async function logChange(
  db: D1Database,
  schoolId: string,
  userId: string,
  entityType: 'session' | 'user' | 'class',
  entityId: string,
  action: 'create' | 'update' | 'delete' | 'import' | 'auto_assign',
  changes?: Record<string, { old?: string; new?: string }>
) {
  const id = generateId();
  const now = nowISO();
  await db.prepare(
    `INSERT INTO admin_change_log (id, school_id, user_id, entity_type, entity_id, action, changes, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(id, schoolId, userId, entityType, entityId, action, changes ? JSON.stringify(changes) : null, now).run();
}

admin.get('/changelog', async (c) => {
  const user = c.get('user');
  const url = new URL(c.req.url);
  const page = parseInt(url.searchParams.get('page') || '1');
  const pageSize = Math.min(parseInt(url.searchParams.get('pageSize') || '50'), 100);
  const entityType = url.searchParams.get('entity_type') || '';
  const offset = (page - 1) * pageSize;

  let where = 'WHERE cl.school_id = ?';
  const params: (string | number)[] = [user.school_id];

  if (entityType) {
    where += ' AND cl.entity_type = ?';
    params.push(entityType);
  }

  const countResult = await c.env.DB.prepare(
    `SELECT COUNT(*) as total FROM admin_change_log cl ${where}`
  ).bind(...params).first<{ total: number }>();

  const rows = await c.env.DB.prepare(
    `SELECT cl.*, u.full_name as user_name
     FROM admin_change_log cl
     JOIN users u ON cl.user_id = u.id
     ${where}
     ORDER BY cl.created_at DESC
     LIMIT ? OFFSET ?`
  ).bind(...params, pageSize, offset).all();

  return c.json({
    success: true,
    data: rows.results,
    total: countResult?.total ?? 0,
    page,
    pageSize,
  });
});

// ── Telegram webhook setup ──
admin.post('/settings/setup-webhook', async (c) => {
  const webhookUrl = 'https://dprabota.bahtyarsanzhar.workers.dev/api/telegram/webhook';
  const res = await fetch(`https://api.telegram.org/bot${c.env.TELEGRAM_BOT_TOKEN}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: webhookUrl,
      secret_token: c.env.TELEGRAM_WEBHOOK_SECRET,
      allowed_updates: ['message', 'callback_query'],
    }),
  });
  const result = await res.json() as { ok: boolean; description?: string };
  return c.json({ success: result.ok, data: { url: webhookUrl, result } });
});

// ── Settings: support admin Telegram chat ID ──
admin.get('/settings/support-chat', async (c) => {
  const chatId = await c.env.KV.get('support_admin_chat_id');
  return c.json({ success: true, data: { chat_id: chatId ?? '' } });
});

admin.put('/settings/support-chat', async (c) => {
  const body = await c.req.json() as { chat_id: string };
  if (!body.chat_id?.trim()) {
    await c.env.KV.delete('support_admin_chat_id');
    return c.json({ success: true, data: { chat_id: '' } });
  }
  await c.env.KV.put('support_admin_chat_id', body.chat_id.trim());
  return c.json({ success: true, data: { chat_id: body.chat_id.trim() } });
});

// ── Test token: generate JWT for any user (admin-only, for testing) ──
admin.post('/test-token', async (c) => {
  const body = await c.req.json() as { user_id: string };
  if (!body.user_id) {
    return c.json({ success: false, code: ERROR_CODES.VALIDATION_ERROR, message: 'user_id required' }, 400);
  }

  const adminUser = c.get('user');
  const targetUser = await c.env.DB.prepare(
    'SELECT id, role, school_id FROM users WHERE id = ? AND school_id = ?'
  ).bind(body.user_id, adminUser.school_id).first<{ id: string; role: string; school_id: string }>();

  if (!targetUser) {
    return c.json({ success: false, code: ERROR_CODES.USER_NOT_FOUND, message: 'User not found' }, 404);
  }

  const token = await signJwt(
    { sub: targetUser.id, role: targetUser.role as 'admin' | 'teacher' | 'student', school_id: targetUser.school_id },
    c.env.JWT_SECRET,
    3600
  );

  return c.json({ success: true, data: { token, user_id: targetUser.id, role: targetUser.role } });
});

// One-shot migration of legacy KV-stored avatars to R2. Idempotent: safely skips
// users whose avatar already exists in R2, and deletes the KV copy on success.
// Caller passes ?limit=N to bound the batch (KV list is paginated by Cloudflare).
admin.post('/migrate-avatars', async (c) => {
  const limit = Math.min(parseInt(c.req.query('limit') ?? '100', 10) || 100, 1000);
  const cursor = c.req.query('cursor') ?? undefined;

  const listed = await c.env.KV.list({ prefix: 'avatar:', limit, cursor });

  let migrated = 0;
  let skipped = 0;
  let failed = 0;

  for (const key of listed.keys) {
    const userId = key.name.slice('avatar:'.length);
    try {
      // If R2 already has the avatar, just clean up KV.
      const existing = await c.env.AVATARS.head(userId);
      if (existing) {
        await c.env.KV.delete(key.name);
        skipped++;
        continue;
      }

      const data = await c.env.KV.get(key.name);
      if (!data) { skipped++; continue; }
      const match = data.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
      if (!match) { failed++; continue; }
      const contentType = match[1]!;
      const bytes = Uint8Array.from(atob(match[2]!), ch => ch.charCodeAt(0));

      await c.env.AVATARS.put(userId, bytes, {
        httpMetadata: { contentType, cacheControl: 'public, max-age=86400' },
      });
      await c.env.KV.delete(key.name);
      migrated++;
    } catch {
      failed++;
    }
  }

  return c.json({
    success: true,
    data: {
      migrated,
      skipped,
      failed,
      list_complete: listed.list_complete,
      cursor: listed.list_complete ? null : listed.cursor,
    },
  });
});

export default admin;
