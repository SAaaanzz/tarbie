// Маршруты открытых занятий: публикация и запись на открытые уроки.
import { Hono } from 'hono';
import type { HonoEnv } from '../env.js';
import { authMiddleware, requireRole } from '../middleware/auth.js';
import { generateId, nowISO, ERROR_CODES } from '@tarbie/shared';

const openSessions = new Hono<HonoEnv>();

openSessions.use('*', authMiddleware);

// List open sessions
// Students: only sessions where their class matches OR they are registered
// Teachers/Admins: all school sessions
openSessions.get('/', async (c) => {
  const user = c.get('user');
  const status = c.req.query('status');

  let sql = `SELECT os.*, u.full_name as teacher_name,
    u.avatar_url as teacher_avatar_url,
    cl.name as class_name,
    (SELECT COUNT(*) FROM open_session_registrations osr WHERE osr.open_session_id = os.id) as registered_count
    FROM open_sessions os
    JOIN users u ON os.teacher_id = u.id
    LEFT JOIN classes cl ON os.class_id = cl.id
    WHERE os.school_id = ?`;
  const params: (string | number)[] = [user.school_id];

  if (user.role === 'student') {
    sql += ` AND (
      os.class_id IN (SELECT class_id FROM class_students WHERE student_id = ?)
      OR os.id IN (SELECT open_session_id FROM open_session_registrations WHERE student_id = ?)
    )`;
    params.push(user.id, user.id);
  }

  if (status) {
    sql += ' AND os.status = ?';
    params.push(status);
  }
  sql += ' ORDER BY os.session_date DESC';

  const rows = await c.env.DB.prepare(sql).bind(...params).all();
  return c.json({ success: true, data: rows.results });
});

// Get single open session with registrations
openSessions.get('/:id', async (c) => {
  const user = c.get('user');
  const sessionId = c.req.param('id');

  const session = await c.env.DB.prepare(
    `SELECT os.*, u.full_name as teacher_name,
      u.avatar_url as teacher_avatar_url,
      cl.name as class_name,
      (SELECT COUNT(*) FROM open_session_registrations osr WHERE osr.open_session_id = os.id) as registered_count
     FROM open_sessions os JOIN users u ON os.teacher_id = u.id
     LEFT JOIN classes cl ON os.class_id = cl.id
     WHERE os.id = ? AND os.school_id = ?`
  ).bind(sessionId, user.school_id).first();

  if (!session) {
    return c.json({ success: false, code: 'NOT_FOUND', message: 'Open session not found' }, 404);
  }

  const registrations = await c.env.DB.prepare(
    `SELECT osr.id, osr.student_id, osr.registered_at, u.full_name as student_name,
            u.avatar_url as student_avatar_url
     FROM open_session_registrations osr
     JOIN users u ON osr.student_id = u.id
     WHERE osr.open_session_id = ?
     ORDER BY osr.registered_at`
  ).bind(sessionId).all();

  const myReg = await c.env.DB.prepare(
    'SELECT id FROM open_session_registrations WHERE open_session_id = ? AND student_id = ?'
  ).bind(sessionId, user.id).first();

  return c.json({
    success: true,
    data: { ...session, registrations: registrations.results, is_registered: !!myReg },
  });
});

// Create open session (teacher/admin)
openSessions.post('/', requireRole('admin', 'teacher'), async (c) => {
  const user = c.get('user');
  const body = await c.req.json() as {
    title: string; description?: string; session_date: string;
    session_time?: string; location?: string; max_students?: number;
    class_id?: string; room?: string;
  };

  if (!body.title || !body.session_date) {
    return c.json({ success: false, code: ERROR_CODES.VALIDATION_ERROR, message: 'title and session_date required' }, 400);
  }

  const today = new Date().toISOString().split('T')[0]!;
  if (body.session_date < today) {
    return c.json({ success: false, code: ERROR_CODES.VALIDATION_ERROR, message: 'Cannot create sessions in the past' }, 400);
  }

  // Validate class_id if provided
  if (body.class_id) {
    const cls = await c.env.DB.prepare('SELECT id FROM classes WHERE id = ? AND school_id = ?').bind(body.class_id, user.school_id).first();
    if (!cls) return c.json({ success: false, code: ERROR_CODES.VALIDATION_ERROR, message: 'Class not found' }, 400);
  }

  const id = generateId();
  const now = nowISO();

  await c.env.DB.prepare(
    `INSERT INTO open_sessions (id, school_id, teacher_id, title, description, session_date, session_time, location, max_students, class_id, room, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)`
  ).bind(
    id, user.school_id, user.id, body.title, body.description || null,
    body.session_date, body.session_time || null, body.location || null,
    body.max_students || 30, body.class_id || null, body.room || null, now, now
  ).run();

  // Auto-register all students in the class
  if (body.class_id) {
    const students = await c.env.DB.prepare(
      'SELECT student_id FROM class_students WHERE class_id = ?'
    ).bind(body.class_id).all<{ student_id: string }>();
    if (students.results.length > 0) {
      const stmts = students.results.map(s =>
        c.env.DB.prepare(
          'INSERT INTO open_session_registrations (id, open_session_id, student_id, registered_at) VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING'
        ).bind(generateId(), id, s.student_id, now)
      );
      await c.env.DB.batch(stmts);
    }
  }

  return c.json({ success: true, data: { id } }, 201);
});

// Update open session
openSessions.put('/:id', requireRole('admin', 'teacher'), async (c) => {
  const user = c.get('user');
  const sessionId = c.req.param('id');
  const body = await c.req.json() as {
    title?: string; description?: string; session_date?: string;
    session_time?: string; location?: string; max_students?: number; status?: string;
  };

  const existing = await c.env.DB.prepare(
    'SELECT id, teacher_id FROM open_sessions WHERE id = ? AND school_id = ?'
  ).bind(sessionId, user.school_id).first<{ id: string; teacher_id: string }>();

  if (!existing) {
    return c.json({ success: false, code: 'NOT_FOUND', message: 'Open session not found' }, 404);
  }
  if (user.role === 'teacher' && existing.teacher_id !== user.id) {
    return c.json({ success: false, code: 'FORBIDDEN', message: 'Access denied' }, 403);
  }

  const updates: string[] = [];
  const values: (string | number)[] = [];
  if (body.title) { updates.push('title = ?'); values.push(body.title); }
  if (body.description !== undefined) { updates.push('description = ?'); values.push(body.description || ''); }
  if (body.session_date) { updates.push('session_date = ?'); values.push(body.session_date); }
  if (body.session_time !== undefined) { updates.push('session_time = ?'); values.push(body.session_time || ''); }
  if (body.location !== undefined) { updates.push('location = ?'); values.push(body.location || ''); }
  if (body.max_students !== undefined) { updates.push('max_students = ?'); values.push(body.max_students); }
  if ((body as any).class_id !== undefined) { updates.push('class_id = ?'); values.push((body as any).class_id || ''); }
  if ((body as any).room !== undefined) { updates.push('room = ?'); values.push((body as any).room || ''); }
  if (body.status && ['open', 'closed', 'completed', 'cancelled'].includes(body.status)) {
    updates.push('status = ?'); values.push(body.status);
  }

  if (updates.length === 0) {
    return c.json({ success: false, code: ERROR_CODES.VALIDATION_ERROR, message: 'Nothing to update' }, 400);
  }

  updates.push('updated_at = ?'); values.push(nowISO());
  values.push(sessionId);

  await c.env.DB.prepare(
    `UPDATE open_sessions SET ${updates.join(', ')} WHERE id = ?`
  ).bind(...values).run();

  return c.json({ success: true, data: { id: sessionId, updated: true } });
});

// Delete open session — teachers can only delete their own
openSessions.delete('/:id', requireRole('admin', 'teacher'), async (c) => {
  const user = c.get('user');
  const sessionId = c.req.param('id');

  const existing = await c.env.DB.prepare(
    'SELECT id, teacher_id FROM open_sessions WHERE id = ? AND school_id = ?'
  ).bind(sessionId, user.school_id).first<{ id: string; teacher_id: string }>();

  if (!existing) {
    return c.json({ success: false, code: 'NOT_FOUND', message: 'Open session not found' }, 404);
  }
  if (user.role === 'teacher' && existing.teacher_id !== user.id) {
    return c.json({ success: false, code: 'FORBIDDEN', message: 'You can only delete your own sessions' }, 403);
  }

  await c.env.DB.prepare('DELETE FROM open_sessions WHERE id = ?').bind(sessionId).run();
  return c.json({ success: true, data: { id: sessionId, deleted: true } });
});

// Register for open session (any student)
openSessions.post('/:id/register', async (c) => {
  const user = c.get('user');
  const sessionId = c.req.param('id');

  const session = await c.env.DB.prepare(
    'SELECT id, max_students, status FROM open_sessions WHERE id = ? AND school_id = ?'
  ).bind(sessionId, user.school_id).first<{ id: string; max_students: number; status: string }>();

  if (!session) {
    return c.json({ success: false, code: 'NOT_FOUND', message: 'Open session not found' }, 404);
  }
  if (session.status !== 'open') {
    return c.json({ success: false, code: 'SESSION_CLOSED', message: 'Session is not open for registration' }, 400);
  }

  if (session.max_students > 0) {
    const count = await c.env.DB.prepare(
      'SELECT COUNT(*) as cnt FROM open_session_registrations WHERE open_session_id = ?'
    ).bind(sessionId).first<{ cnt: number }>();
    if (count && count.cnt >= session.max_students) {
      return c.json({ success: false, code: 'CAPACITY_FULL', message: 'Session is full' }, 400);
    }
  }

  const existing = await c.env.DB.prepare(
    'SELECT id FROM open_session_registrations WHERE open_session_id = ? AND student_id = ?'
  ).bind(sessionId, user.id).first();
  if (existing) {
    return c.json({ success: false, code: 'ALREADY_REGISTERED', message: 'Already registered' }, 409);
  }

  const id = generateId();
  await c.env.DB.prepare(
    'INSERT INTO open_session_registrations (id, open_session_id, student_id, registered_at) VALUES (?, ?, ?, ?)'
  ).bind(id, sessionId, user.id, nowISO()).run();

  return c.json({ success: true, data: { id, registered: true } }, 201);
});

// Unregister from open session
openSessions.delete('/:id/register', async (c) => {
  const user = c.get('user');
  const sessionId = c.req.param('id');

  await c.env.DB.prepare(
    'DELETE FROM open_session_registrations WHERE open_session_id = ? AND student_id = ?'
  ).bind(sessionId, user.id).run();

  return c.json({ success: true, data: { unregistered: true } });
});

export default openSessions;
