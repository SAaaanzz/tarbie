import { Hono } from 'hono';
import type { HonoEnv } from '../env.js';
import { authMiddleware, requireRole } from '../middleware/auth.js';
import { bulkAttendanceSchema, generateId, nowISO, ERROR_CODES, structuredLog } from '@tarbie/shared';


const attendance = new Hono<HonoEnv>();

attendance.use('*', authMiddleware);

attendance.post('/:id/attendance', requireRole('admin', 'teacher'), async (c) => {
  const user = c.get('user');
  const sessionId = c.req.param('id');
  const body = await c.req.json();
  const parsed = bulkAttendanceSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ success: false, code: ERROR_CODES.VALIDATION_ERROR, message: parsed.error.issues[0]?.message ?? 'Invalid input' }, 400);
  }

  const session = await c.env.DB.prepare(
    `SELECT ts.id, ts.class_id, c.school_id, c.name as class_name
     FROM tarbie_sessions ts JOIN classes c ON ts.class_id = c.id WHERE ts.id = ?`
  ).bind(sessionId).first<{ id: string; class_id: string; school_id: string; class_name: string }>();

  if (!session || session.school_id !== user.school_id) {
    return c.json({ success: false, code: ERROR_CODES.SESSION_NOT_FOUND, message: 'Session not found' }, 404);
  }

  const now = nowISO();
  const statements = parsed.data.attendance.map((entry) => {
    const id = generateId();
    return c.env.DB.prepare(
      `INSERT INTO session_attendance (id, session_id, student_id, status, marked_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(session_id, student_id) DO UPDATE SET status = excluded.status, marked_at = excluded.marked_at`
    ).bind(id, sessionId, entry.student_id, entry.status, now);
  });

  await c.env.DB.batch(statements);

  const absentStudents = parsed.data.attendance
    .filter(e => e.status === 'absent')
    .map(e => e.student_id);

  if (absentStudents.length > 0) {
    for (const studentId of absentStudents) {
      const absenceCount = await c.env.DB.prepare(
        `SELECT COUNT(*) as cnt FROM session_attendance
         WHERE student_id = ? AND status = 'absent'
         AND session_id IN (
           SELECT id FROM tarbie_sessions WHERE class_id = ?
           ORDER BY planned_date DESC LIMIT 5
         )`
      ).bind(studentId, session.class_id).first<{ cnt: number }>();

      if (absenceCount && absenceCount.cnt >= 3) {
        structuredLog('warn', 'Student has 3+ absences', { student_id: studentId, class_id: session.class_id });
      }
    }
  }

  structuredLog('info', 'Attendance recorded', { session_id: sessionId, count: parsed.data.attendance.length });

  return c.json({ success: true, data: { session_id: sessionId, recorded: parsed.data.attendance.length } });
});

attendance.get('/:id/attendance', requireRole('admin', 'teacher'), async (c) => {
  const user = c.get('user');
  const sessionId = c.req.param('id');

  const session = await c.env.DB.prepare(
    `SELECT ts.id, c.school_id FROM tarbie_sessions ts JOIN classes c ON ts.class_id = c.id WHERE ts.id = ?`
  ).bind(sessionId).first<{ id: string; school_id: string }>();

  if (!session || session.school_id !== user.school_id) {
    return c.json({ success: false, code: ERROR_CODES.SESSION_NOT_FOUND, message: 'Session not found' }, 404);
  }

  const rows = await c.env.DB.prepare(
    `SELECT sa.*, u.full_name as student_name
     FROM session_attendance sa
     JOIN users u ON sa.student_id = u.id
     WHERE sa.session_id = ?
     ORDER BY u.full_name`
  ).bind(sessionId).all();

  return c.json({ success: true, data: rows.results });
});

export default attendance;
