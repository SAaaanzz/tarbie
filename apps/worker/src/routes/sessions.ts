// Маршруты занятий (тәрбие сағаты): список и фильтры по ролям,
// создание, изменение, завершение и удаление занятий, проверка занятости кабинетов.
import { Hono } from 'hono';
import type { HonoEnv } from '../env.js';
import { authMiddleware, requireRole } from '../middleware/auth.js';
import {
  createSessionSchema, updateSessionSchema, completeSessionSchema,
  sessionsQuerySchema, generateId, nowISO, ERROR_CODES, structuredLog,
  isValidRoom, isValidTimeSlot,
} from '@tarbie/shared';
import type { QueueMessage } from '@tarbie/shared';
import { sendRatingRequest } from './telegram-bot.js';

const sessions = new Hono<HonoEnv>();

sessions.use('*', authMiddleware);

// Get classes accessible to current user (for dropdowns etc.)
sessions.get('/classes', async (c) => {
  const user = c.get('user');
  let rows;
  if (user.role === 'admin') {
    rows = await c.env.DB.prepare(
      `SELECT cl.id, cl.name, cl.teacher_id, cl.academic_year, u.full_name as teacher_name,
         (SELECT COUNT(*) FROM class_students WHERE class_id = cl.id) as student_count
       FROM classes cl JOIN users u ON cl.teacher_id = u.id
       WHERE cl.school_id = ? ORDER BY cl.name`
    ).bind(user.school_id).all();
  } else if (user.role === 'teacher') {
    rows = await c.env.DB.prepare(
      `SELECT cl.id, cl.name, cl.teacher_id, cl.academic_year, u.full_name as teacher_name,
         (SELECT COUNT(*) FROM class_students WHERE class_id = cl.id) as student_count
       FROM classes cl JOIN users u ON cl.teacher_id = u.id
       WHERE cl.teacher_id = ? ORDER BY cl.name`
    ).bind(user.id).all();
  } else {
    rows = await c.env.DB.prepare(
      `SELECT cl.id, cl.name, cl.teacher_id, cl.academic_year, u.full_name as teacher_name,
         (SELECT COUNT(*) FROM class_students WHERE class_id = cl.id) as student_count
       FROM classes cl JOIN users u ON cl.teacher_id = u.id
       JOIN class_students cs ON cs.class_id = cl.id
       WHERE cs.student_id = ? ORDER BY cl.name`
    ).bind(user.id).all();
  }
  return c.json({ success: true, data: rows.results });
});

sessions.get('/', async (c) => {
  const user = c.get('user');
  const query = sessionsQuerySchema.safeParse(Object.fromEntries(new URL(c.req.url).searchParams));
  if (!query.success) {
    return c.json({ success: false, code: ERROR_CODES.VALIDATION_ERROR, message: query.error.issues[0]?.message ?? 'Invalid query' }, 400);
  }

  const { classId, month, status, page, pageSize } = query.data;
  const conditions: string[] = [];
  const params: string[] = [];

  if (user.role === 'teacher') {
    conditions.push('ts.teacher_id = ?');
    params.push(user.id);
  } else if (user.role === 'student') {
    conditions.push('ts.class_id IN (SELECT class_id FROM class_students WHERE student_id = ?)');
    params.push(user.id);
    // Students should not see sessions pending approval
    conditions.push("ts.status != 'pending_approval'");
  } else {
    conditions.push('c.school_id = ?');
    params.push(user.school_id);
  }

  if (classId) {
    conditions.push('ts.class_id = ?');
    params.push(classId);
  }
  if (month) {
    conditions.push("ts.planned_date LIKE ? || '%'");
    params.push(month);
  }
  if (status) {
    conditions.push('ts.status = ?');
    params.push(status);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const offset = (page - 1) * pageSize;

  const countResult = await c.env.DB.prepare(
    `SELECT COUNT(*) as total FROM tarbie_sessions ts JOIN classes c ON ts.class_id = c.id ${where}`
  ).bind(...params).first<{ total: number }>();

  const rows = await c.env.DB.prepare(
    `SELECT ts.*, c.name as class_name, u.full_name as teacher_name,
            u.avatar_url as teacher_avatar_url
     FROM tarbie_sessions ts
     JOIN classes c ON ts.class_id = c.id
     JOIN users u ON ts.teacher_id = u.id
     ${where}
     ORDER BY ts.planned_date DESC
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

sessions.post('/', requireRole('admin', 'teacher'), async (c) => {
  const user = c.get('user');
  const body = await c.req.json();
  const parsed = createSessionSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ success: false, code: ERROR_CODES.VALIDATION_ERROR, message: parsed.error.issues[0]?.message ?? 'Invalid input' }, 400);
  }

  const { class_id, topic, planned_date, time_slot, room, duration_minutes, notes } = parsed.data;

  // Validate time slot and room
  if (!isValidTimeSlot(time_slot)) {
    return c.json({ success: false, code: ERROR_CODES.VALIDATION_ERROR, message: 'Invalid time slot. Must be a valid 30-min college slot.' }, 400);
  }
  if (!isValidRoom(room)) {
    return c.json({ success: false, code: ERROR_CODES.VALIDATION_ERROR, message: 'Invalid room. Choose a valid college room.' }, 400);
  }

  const cls = await c.env.DB.prepare('SELECT id, teacher_id, name FROM classes WHERE id = ? AND school_id = ?')
    .bind(class_id, user.school_id).first<{ id: string; teacher_id: string; name: string }>();
  if (!cls) {
    return c.json({ success: false, code: ERROR_CODES.CLASS_NOT_FOUND, message: 'Class not found' }, 404);
  }

  // Teacher can only create sessions for their own classes
  if (user.role === 'teacher' && cls.teacher_id !== user.id) {
    return c.json({ success: false, code: 'FORBIDDEN', message: 'You can only create sessions for your own classes' }, 403);
  }

  // Room conflict check: same date + same time_slot + same room + not cancelled
  const conflict = await c.env.DB.prepare(
    `SELECT id, topic FROM tarbie_sessions WHERE planned_date = ? AND time_slot = ? AND room = ? AND status != 'cancelled'`
  ).bind(planned_date, time_slot, room).first<{ id: string; topic: string }>();
  if (conflict) {
    return c.json({ success: false, code: 'ROOM_CONFLICT', message: `Room ${room} is already booked at ${time_slot} on ${planned_date}` }, 409);
  }

  const teacherId = user.role === 'teacher' ? user.id : cls.teacher_id;
  const id = generateId();
  const now = nowISO();

  // Curators need admin approval; admins create directly as planned
  const initialStatus = user.role === 'teacher' ? 'pending_approval' : 'planned';

  await c.env.DB.prepare(
    `INSERT INTO tarbie_sessions (id, class_id, teacher_id, topic, planned_date, time_slot, room, status, duration_minutes, notes, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(id, class_id, teacherId, topic, planned_date, time_slot, room, initialStatus, duration_minutes, notes ?? null, now, now).run();

  // Only send SESSION_PLANNED notification if admin created it directly
  if (initialStatus === 'planned') {
    const students = await c.env.DB.prepare(
      'SELECT student_id FROM class_students WHERE class_id = ?'
    ).bind(class_id).all<{ student_id: string }>();

    const userIds = [teacherId, ...students.results.map(s => s.student_id)];

    const queueMsg: QueueMessage = {
      event_type: 'SESSION_PLANNED',
      session_id: id,
      user_ids: userIds,
      template_vars: { topic, date: planned_date, class_name: cls.name, teacher_name: '' },
      attempt: 0,
    };
    await c.env.NOTIFICATION_QUEUE.send(queueMsg);
  }

  structuredLog('info', 'Session created', { session_id: id, class_id, teacher_id: teacherId, status: initialStatus });

  return c.json({ success: true, data: { id, class_id, teacher_id: teacherId, topic, planned_date, time_slot, room, status: initialStatus, duration_minutes } }, 201);
});

sessions.put('/:id', requireRole('admin', 'teacher'), async (c) => {
  const user = c.get('user');
  const sessionId = c.req.param('id');
  const body = await c.req.json();
  const parsed = updateSessionSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ success: false, code: ERROR_CODES.VALIDATION_ERROR, message: parsed.error.issues[0]?.message ?? 'Invalid input' }, 400);
  }

  const existing = await c.env.DB.prepare(
    `SELECT ts.*, c.name as class_name, c.school_id FROM tarbie_sessions ts JOIN classes c ON ts.class_id = c.id WHERE ts.id = ?`
  ).bind(sessionId).first<{ id: string; class_id: string; teacher_id: string; topic: string; planned_date: string; status: string; class_name: string; school_id: string }>();

  if (!existing || existing.school_id !== user.school_id) {
    return c.json({ success: false, code: ERROR_CODES.SESSION_NOT_FOUND, message: 'Session not found' }, 404);
  }

  // Teacher can only update their own sessions
  if (user.role === 'teacher' && existing.teacher_id !== user.id) {
    return c.json({ success: false, code: 'FORBIDDEN', message: 'You can only edit your own sessions' }, 403);
  }

  const updates: string[] = [];
  const values: (string | number)[] = [];
  const data = parsed.data;

  if (data.topic !== undefined) { updates.push('topic = ?'); values.push(data.topic); }
  if (data.planned_date !== undefined) { updates.push('planned_date = ?'); values.push(data.planned_date); }
  if (data.time_slot !== undefined) {
    if (!isValidTimeSlot(data.time_slot)) {
      return c.json({ success: false, code: ERROR_CODES.VALIDATION_ERROR, message: 'Invalid time slot' }, 400);
    }
    updates.push('time_slot = ?'); values.push(data.time_slot);
  }
  if (data.room !== undefined) {
    if (!isValidRoom(data.room)) {
      return c.json({ success: false, code: ERROR_CODES.VALIDATION_ERROR, message: 'Invalid room' }, 400);
    }
    updates.push('room = ?'); values.push(data.room);
  }
  if (data.duration_minutes !== undefined) { updates.push('duration_minutes = ?'); values.push(data.duration_minutes); }
  if (data.notes !== undefined) { updates.push('notes = ?'); values.push(data.notes ?? ''); }
  if (data.status !== undefined) { updates.push('status = ?'); values.push(data.status); }

  // Room conflict check if date/time/room changed
  const newDate = data.planned_date ?? existing.planned_date;
  const newSlot = data.time_slot ?? (existing as unknown as { time_slot: string | null }).time_slot;
  const newRoom = data.room ?? (existing as unknown as { room: string | null }).room;
  if (newSlot && newRoom) {
    const conflict = await c.env.DB.prepare(
      `SELECT id FROM tarbie_sessions WHERE planned_date = ? AND time_slot = ? AND room = ? AND status != 'cancelled' AND id != ?`
    ).bind(newDate, newSlot, newRoom, sessionId).first<{ id: string }>();
    if (conflict) {
      return c.json({ success: false, code: 'ROOM_CONFLICT', message: `Room ${newRoom} is already booked at ${newSlot} on ${newDate}` }, 409);
    }
  }

  updates.push('updated_at = ?');
  values.push(nowISO());
  values.push(sessionId);

  await c.env.DB.prepare(
    `UPDATE tarbie_sessions SET ${updates.join(', ')} WHERE id = ?`
  ).bind(...values).run();

  const isRescheduled = data.planned_date && data.planned_date !== existing.planned_date;
  if (isRescheduled) {
    const students = await c.env.DB.prepare(
      'SELECT student_id FROM class_students WHERE class_id = ?'
    ).bind(existing.class_id).all<{ student_id: string }>();

    const queueMsg: QueueMessage = {
      event_type: 'SESSION_RESCHEDULED',
      session_id: sessionId,
      user_ids: [existing.teacher_id, ...students.results.map(s => s.student_id)],
      template_vars: {
        topic: data.topic ?? existing.topic,
        old_date: existing.planned_date,
        new_date: data.planned_date!,
        class_name: existing.class_name,
      },
      attempt: 0,
    };
    await c.env.NOTIFICATION_QUEUE.send(queueMsg);
  }

  structuredLog('info', 'Session updated', { session_id: sessionId, rescheduled: !!isRescheduled });

  return c.json({ success: true, data: { id: sessionId, updated: true } });
});

sessions.patch('/:id/complete', requireRole('admin', 'teacher'), async (c) => {
  const user = c.get('user');
  const sessionId = c.req.param('id');
  let body = {};
  try { body = await c.req.json(); } catch { /* empty body is ok */ }
  const parsed = completeSessionSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ success: false, code: ERROR_CODES.VALIDATION_ERROR, message: parsed.error.issues[0]?.message ?? 'Invalid input' }, 400);
  }

  const existing = await c.env.DB.prepare(
    `SELECT ts.*, c.name as class_name, c.school_id FROM tarbie_sessions ts JOIN classes c ON ts.class_id = c.id WHERE ts.id = ?`
  ).bind(sessionId).first<{ id: string; class_id: string; teacher_id: string; topic: string; class_name: string; school_id: string }>();

  if (!existing || existing.school_id !== user.school_id) {
    return c.json({ success: false, code: ERROR_CODES.SESSION_NOT_FOUND, message: 'Session not found' }, 404);
  }

  // Teacher can only complete their own sessions
  if (user.role === 'teacher' && existing.teacher_id !== user.id) {
    return c.json({ success: false, code: 'FORBIDDEN', message: 'You can only complete your own sessions' }, 403);
  }

  const now = nowISO();
  const actualDate = parsed.data.actual_date ?? now.split('T')[0];

  await c.env.DB.prepare(
    `UPDATE tarbie_sessions SET status = 'completed', actual_date = ?, notes = COALESCE(?, notes), attachment_url = COALESCE(?, attachment_url), updated_at = ? WHERE id = ?`
  ).bind(actualDate, parsed.data.notes ?? null, parsed.data.attachment_url ?? null, now, sessionId).run();

  const attendanceCount = await c.env.DB.prepare(
    "SELECT COUNT(*) as cnt FROM session_attendance WHERE session_id = ? AND status IN ('present','late')"
  ).bind(sessionId).first<{ cnt: number }>();

  const totalStudents = await c.env.DB.prepare(
    'SELECT COUNT(*) as cnt FROM class_students WHERE class_id = ?'
  ).bind(existing.class_id).first<{ cnt: number }>();

  const admins = await c.env.DB.prepare(
    "SELECT id FROM users WHERE school_id = ? AND role = 'admin'"
  ).bind(user.school_id).all<{ id: string }>();

  const classStudents = await c.env.DB.prepare(
    'SELECT student_id FROM class_students WHERE class_id = ?'
  ).bind(existing.class_id).all<{ student_id: string }>();

  const queueMsg: QueueMessage = {
    event_type: 'SESSION_COMPLETED',
    session_id: sessionId,
    user_ids: [...admins.results.map(a => a.id), ...classStudents.results.map(s => s.student_id)],
    template_vars: {
      topic: existing.topic,
      class_name: existing.class_name,
      attendance_count: String(attendanceCount?.cnt ?? 0),
      total_students: String(totalStudents?.cnt ?? 0),
    },
    attempt: 0,
  };
  await c.env.NOTIFICATION_QUEUE.send(queueMsg);

  // Send rating requests to students via Telegram (non-blocking)
  c.executionCtx.waitUntil(
    sendRatingRequest(sessionId, existing.topic, c.env, c.env.TELEGRAM_BOT_TOKEN)
  );

  structuredLog('info', 'Session completed', { session_id: sessionId });

  return c.json({ success: true, data: { id: sessionId, status: 'completed' } });
});

sessions.delete('/:id', requireRole('admin', 'teacher'), async (c) => {
  const user = c.get('user');
  const sessionId = c.req.param('id');

  const existing = await c.env.DB.prepare(
    `SELECT ts.id, ts.teacher_id, c.school_id FROM tarbie_sessions ts JOIN classes c ON ts.class_id = c.id WHERE ts.id = ?`
  ).bind(sessionId).first<{ id: string; teacher_id: string; school_id: string }>();

  if (!existing || existing.school_id !== user.school_id) {
    return c.json({ success: false, code: ERROR_CODES.SESSION_NOT_FOUND, message: 'Session not found' }, 404);
  }

  // Teacher can only delete their own sessions
  if (user.role === 'teacher' && existing.teacher_id !== user.id) {
    return c.json({ success: false, code: 'FORBIDDEN', message: 'You can only delete your own sessions' }, 403);
  }

  await c.env.DB.prepare('DELETE FROM tarbie_sessions WHERE id = ?').bind(sessionId).run();

  structuredLog('info', 'Session deleted', { session_id: sessionId });

  return c.json({ success: true, data: { id: sessionId, deleted: true } });
});

// Get booked rooms for a given date — returns list of { time_slot, room } that are occupied
sessions.get('/booked-rooms', async (c) => {
  const user = c.get('user');
  const date = c.req.query('date');
  if (!date) {
    return c.json({ success: false, code: ERROR_CODES.VALIDATION_ERROR, message: 'date query param required' }, 400);
  }

  const rows = await c.env.DB.prepare(
    `SELECT ts.time_slot, ts.room, ts.topic, c.name as class_name
     FROM tarbie_sessions ts
     JOIN classes c ON ts.class_id = c.id
     WHERE ts.planned_date = ? AND ts.status != 'cancelled' AND ts.room IS NOT NULL AND ts.time_slot IS NOT NULL
     AND c.school_id = ?`
  ).bind(date, user.school_id).all<{ time_slot: string; room: string; topic: string; class_name: string }>();

  return c.json({ success: true, data: rows.results });
});

export default sessions;
