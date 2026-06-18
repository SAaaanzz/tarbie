// Маршруты оценок: выставление оценок куратором за занятие, журнал группы,
// средние баллы за месяц и оценки конкретного ученика (для его личного кабинета).
import { Hono } from 'hono';
import type { HonoEnv } from '../env.js';
import { authMiddleware, requireRole } from '../middleware/auth.js';
import { bulkGradeSchema, generateId, nowISO, ERROR_CODES, structuredLog } from '@tarbie/shared';
import { sendGradeNotification } from './telegram-bot.js';

const grades = new Hono<HonoEnv>();

grades.use('*', authMiddleware);

// ── Helper: verify session ownership (teacher can only access own classes) ──
async function verifySessionAccess(
  db: D1Database, sessionId: string, user: { id: string; role: string; school_id: string }
): Promise<{ id: string; class_id: string; teacher_id: string; school_id: string } | null> {
  const session = await db.prepare(
    `SELECT ts.id, ts.class_id, ts.teacher_id, c.school_id
     FROM tarbie_sessions ts JOIN classes c ON ts.class_id = c.id
     WHERE ts.id = ?`
  ).bind(sessionId).first<{ id: string; class_id: string; teacher_id: string; school_id: string }>();

  if (!session || session.school_id !== user.school_id) return null;
  if (user.role === 'teacher' && session.teacher_id !== user.id) return null;
  if (user.role === 'student') {
    const enrolled = await db.prepare(
      'SELECT 1 FROM class_students WHERE class_id = ? AND student_id = ?'
    ).bind(session.class_id, user.id).first();
    if (!enrolled) return null;
  }
  return session;
}

// ── Helper: verify class ownership ──
async function verifyClassAccess(
  db: D1Database, classId: string, user: { id: string; role: string; school_id: string }
): Promise<{ id: string; teacher_id: string } | null> {
  const cls = await db.prepare(
    'SELECT id, teacher_id FROM classes WHERE id = ? AND school_id = ?'
  ).bind(classId, user.school_id).first<{ id: string; teacher_id: string }>();

  if (!cls) return null;
  if (user.role === 'teacher' && cls.teacher_id !== user.id) return null;
  if (user.role === 'student') {
    const enrolled = await db.prepare(
      'SELECT 1 FROM class_students WHERE class_id = ? AND student_id = ?'
    ).bind(classId, user.id).first();
    if (!enrolled) return null;
  }
  return cls;
}

// ── Init grades for a session: create absent entries for all students ──
grades.post('/sessions/:sessionId/init', requireRole('admin', 'teacher'), async (c) => {
  const user = c.get('user');
  const sessionId = c.req.param('sessionId');

  const session = await verifySessionAccess(c.env.DB, sessionId, user);
  if (!session) {
    return c.json({ success: false, code: ERROR_CODES.SESSION_NOT_FOUND, message: 'Session not found or access denied' }, 404);
  }

  // Get all students in the class
  const students = await c.env.DB.prepare(
    'SELECT student_id FROM class_students WHERE class_id = ?'
  ).bind(session.class_id).all<{ student_id: string }>();

  if (students.results.length === 0) {
    return c.json({ success: true, data: { session_id: sessionId, initialized: 0 } });
  }

  const now = nowISO();
  const statements = students.results.map((s) => {
    const id = generateId();
    return c.env.DB.prepare(
      `INSERT INTO grades (id, session_id, student_id, status, grade, comment, created_by, created_at, updated_at)
       VALUES (?, ?, ?, 'absent', NULL, NULL, ?, ?, ?)
       ON CONFLICT(session_id, student_id) DO NOTHING`
    ).bind(id, sessionId, s.student_id, user.id, now, now);
  });

  await c.env.DB.batch(statements);

  structuredLog('info', 'Grades initialized', { session_id: sessionId, count: students.results.length });
  return c.json({ success: true, data: { session_id: sessionId, initialized: students.results.length } });
});

// ── Get grades for a session ──
grades.get('/sessions/:sessionId/grades', async (c) => {
  const user = c.get('user');
  const sessionId = c.req.param('sessionId');

  const session = await verifySessionAccess(c.env.DB, sessionId, user);
  if (!session) {
    return c.json({ success: false, code: ERROR_CODES.SESSION_NOT_FOUND, message: 'Session not found or access denied' }, 404);
  }

  const rows = await c.env.DB.prepare(
    `SELECT g.id, g.session_id, g.student_id, g.status, g.grade, g.comment,
            g.created_by, g.created_at, g.updated_at,
            u.full_name as student_name, u.avatar_url as student_avatar_url
     FROM grades g
     JOIN users u ON g.student_id = u.id
     WHERE g.session_id = ?
     ORDER BY u.full_name`
  ).bind(sessionId).all();

  return c.json({ success: true, data: rows.results });
});

// ── Bulk update grades for a session (mark present/absent/makeup, set grade 0-100) ──
grades.put('/sessions/:sessionId/grades', requireRole('admin', 'teacher'), async (c) => {
  const user = c.get('user');
  const sessionId = c.req.param('sessionId');

  const session = await verifySessionAccess(c.env.DB, sessionId, user);
  if (!session) {
    return c.json({ success: false, code: ERROR_CODES.SESSION_NOT_FOUND, message: 'Session not found or access denied' }, 404);
  }

  const body = await c.req.json();
  const parsed = bulkGradeSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ success: false, code: ERROR_CODES.VALIDATION_ERROR, message: parsed.error.issues[0]?.message ?? 'Invalid input' }, 400);
  }

  // Validate: present/makeup must have grade, absent must have null grade
  for (const entry of parsed.data.grades) {
    if (entry.status === 'present' && entry.grade === null) {
      return c.json({ success: false, code: ERROR_CODES.VALIDATION_ERROR, message: `Present student ${entry.student_id} must have a grade (0-100)` }, 400);
    }
    if (entry.status === 'makeup' && entry.grade === null) {
      return c.json({ success: false, code: ERROR_CODES.VALIDATION_ERROR, message: `Makeup student ${entry.student_id} must have a grade (0-100)` }, 400);
    }
    if (entry.status === 'absent' && entry.grade !== null) {
      return c.json({ success: false, code: ERROR_CODES.VALIDATION_ERROR, message: `Absent student cannot have a grade` }, 400);
    }
  }

  const now = nowISO();
  const statements = parsed.data.grades.map((entry) => {
    const id = generateId();
    return c.env.DB.prepare(
      `INSERT INTO grades (id, session_id, student_id, status, grade, comment, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(session_id, student_id) DO UPDATE SET
         status = excluded.status,
         grade = excluded.grade,
         comment = excluded.comment,
         updated_at = excluded.updated_at`
    ).bind(id, sessionId, entry.student_id, entry.status, entry.grade, entry.comment ?? null, user.id, now, now);
  });

  await c.env.DB.batch(statements);

  // Get session topic for notification
  const sessionInfo = await c.env.DB.prepare(
    'SELECT topic FROM tarbie_sessions WHERE id = ?'
  ).bind(sessionId).first<{ topic: string }>();
  const topic = sessionInfo?.topic ?? '';

  // Send Telegram notifications to every student (non-blocking)
  c.executionCtx.waitUntil((async () => {
    for (const entry of parsed.data.grades) {
      await sendGradeNotification(
        entry.student_id, topic, entry.grade, entry.comment ?? null, entry.status,
        c.env, c.env.TELEGRAM_BOT_TOKEN
      );
    }
  })());

  structuredLog('info', 'Grades updated', { session_id: sessionId, count: parsed.data.grades.length });
  return c.json({ success: true, data: { session_id: sessionId, updated: parsed.data.grades.length } });
});

// ── Monthly auto-calculation for a class ──
// Formula: average = sum(grades where present/makeup) / total_completed_sessions
// Absent with no makeup = 0
grades.get('/classes/:classId/monthly', async (c) => {
  const user = c.get('user');
  const classId = c.req.param('classId');
  const month = c.req.query('month'); // YYYY-MM

  const cls = await verifyClassAccess(c.env.DB, classId, user);
  if (!cls) {
    return c.json({ success: false, code: ERROR_CODES.CLASS_NOT_FOUND, message: 'Class not found or access denied' }, 404);
  }

  // Get completed sessions for the month
  let sessionsSql = `SELECT id FROM tarbie_sessions WHERE class_id = ? AND status = 'completed'`;
  const sessionParams: string[] = [classId];
  if (month) {
    sessionsSql += ` AND planned_date LIKE ? || '%'`;
    sessionParams.push(month);
  }

  const sessionsResult = await c.env.DB.prepare(sessionsSql).bind(...sessionParams).all<{ id: string }>();
  const sessionIds = sessionsResult.results.map(s => s.id);
  const totalSessions = sessionIds.length;

  if (totalSessions === 0) {
    // Return students with 0 averages
    const students = await c.env.DB.prepare(
      `SELECT u.id as student_id, u.full_name as student_name
       FROM class_students cs JOIN users u ON cs.student_id = u.id
       WHERE cs.class_id = ? ORDER BY u.full_name`
    ).bind(classId).all<{ student_id: string; student_name: string }>();

    const data = students.results.map(s => ({
      student_id: s.student_id,
      student_name: s.student_name,
      total_sessions: 0, attended: 0, absent: 0, makeup: 0,
      sum_grades: 0, average: 0,
    }));
    return c.json({ success: true, data });
  }

  // Build placeholders for IN clause
  const placeholders = sessionIds.map(() => '?').join(',');

  // Get all students in the class
  const students = await c.env.DB.prepare(
    `SELECT u.id as student_id, u.full_name as student_name
     FROM class_students cs JOIN users u ON cs.student_id = u.id
     WHERE cs.class_id = ? ORDER BY u.full_name`
  ).bind(classId).all<{ student_id: string; student_name: string }>();

  // Get all grades for these sessions
  const gradesResult = await c.env.DB.prepare(
    `SELECT student_id, status, grade
     FROM grades
     WHERE session_id IN (${placeholders})`
  ).bind(...sessionIds).all<{ student_id: string; status: string; grade: number | null }>();

  // Build lookup: student_id -> array of grades
  const gradeMap = new Map<string, Array<{ status: string; grade: number | null }>>();
  for (const g of gradesResult.results) {
    if (!gradeMap.has(g.student_id)) gradeMap.set(g.student_id, []);
    gradeMap.get(g.student_id)!.push({ status: g.status, grade: g.grade });
  }

  // Calculate averages
  const data = students.results.map(s => {
    const entries = gradeMap.get(s.student_id) ?? [];
    let attended = 0, absent = 0, makeup = 0, sumGrades = 0;

    for (const e of entries) {
      if (e.status === 'present') {
        attended++;
        sumGrades += e.grade ?? 0;
      } else if (e.status === 'makeup') {
        makeup++;
        sumGrades += e.grade ?? 0;
      } else {
        absent++;
        // absent = 0 contribution
      }
    }

    // Sessions without any grade entry = absent with 0
    const ungradedSessions = totalSessions - entries.length;
    absent += ungradedSessions;

    const average = totalSessions > 0 ? Math.round((sumGrades / totalSessions) * 10) / 10 : 0;

    return {
      student_id: s.student_id,
      student_name: s.student_name,
      total_sessions: totalSessions,
      attended,
      absent,
      makeup,
      sum_grades: sumGrades,
      average,
    };
  });

  return c.json({ success: true, data });
});

// ── Get completed sessions for a class (for grading UI) ──
grades.get('/classes/:classId/sessions', async (c) => {
  const user = c.get('user');
  const classId = c.req.param('classId');
  const month = c.req.query('month');

  const cls = await verifyClassAccess(c.env.DB, classId, user);
  if (!cls) {
    return c.json({ success: false, code: ERROR_CODES.CLASS_NOT_FOUND, message: 'Class not found or access denied' }, 404);
  }

  let sql = `SELECT id, topic, planned_date, status FROM tarbie_sessions WHERE class_id = ? AND status = 'completed'`;
  const params: string[] = [classId];
  if (month) {
    sql += ` AND planned_date LIKE ? || '%'`;
    params.push(month);
  }
  sql += ` ORDER BY planned_date`;

  const rows = await c.env.DB.prepare(sql).bind(...params).all();
  return c.json({ success: true, data: rows.results });
});

// ── Get all grades for a student (student view) ──
grades.get('/students/:studentId/grades', async (c) => {
  const user = c.get('user');
  const studentId = c.req.param('studentId');

  // Students can only see own grades.
  if (user.role === 'student' && user.id !== studentId) {
    return c.json({ success: false, code: 'FORBIDDEN', message: 'Access denied' }, 403);
  }

  // Verify student belongs to same school (teacher / admin path).
  if (user.role !== 'student') {
    const student = await c.env.DB.prepare(
      'SELECT id FROM users WHERE id = ? AND school_id = ?'
    ).bind(studentId, user.school_id).first();
    if (!student) {
      return c.json({ success: false, code: 'NOT_FOUND', message: 'Student not found' }, 404);
    }
  }

  const rows = await c.env.DB.prepare(
    `SELECT g.id, g.session_id, g.student_id, g.status, g.grade, g.comment,
            g.created_at, g.updated_at,
            ts.topic, ts.planned_date, c.name as class_name
     FROM grades g
     JOIN tarbie_sessions ts ON g.session_id = ts.id
     JOIN classes c ON ts.class_id = c.id
     WHERE g.student_id = ?
     ORDER BY ts.planned_date DESC
     LIMIT 100`
  ).bind(studentId).all();

  return c.json({ success: true, data: rows.results });
});

// ── Get monthly averages for a student across all classes ──
grades.get('/students/:studentId/monthly', async (c) => {
  const user = c.get('user');
  const studentId = c.req.param('studentId');
  const month = c.req.query('month');

  if (user.role === 'student' && user.id !== studentId) {
    return c.json({ success: false, code: 'FORBIDDEN', message: 'Access denied' }, 403);
  }

  // Verify student belongs to same school (teacher / admin path).
  if (user.role !== 'student') {
    const student = await c.env.DB.prepare(
      'SELECT id FROM users WHERE id = ? AND school_id = ?'
    ).bind(studentId, user.school_id).first();
    if (!student) {
      return c.json({ success: false, code: 'NOT_FOUND', message: 'Student not found' }, 404);
    }
  }

  // Get classes the student belongs to
  const classes = await c.env.DB.prepare(
    `SELECT cs.class_id, c.name as class_name
     FROM class_students cs JOIN classes c ON cs.class_id = c.id
     WHERE cs.student_id = ?`
  ).bind(studentId).all<{ class_id: string; class_name: string }>();

  const result: Array<{ class_id: string; class_name: string; total_sessions: number; sum_grades: number; average: number }> = [];

  for (const cls of classes.results) {
    let sessionsSql = `SELECT id FROM tarbie_sessions WHERE class_id = ? AND status = 'completed'`;
    const params: string[] = [cls.class_id];
    if (month) {
      sessionsSql += ` AND planned_date LIKE ? || '%'`;
      params.push(month);
    }

    const sessions = await c.env.DB.prepare(sessionsSql).bind(...params).all<{ id: string }>();
    const total = sessions.results.length;
    if (total === 0) {
      result.push({ class_id: cls.class_id, class_name: cls.class_name, total_sessions: 0, sum_grades: 0, average: 0 });
      continue;
    }

    const placeholders = sessions.results.map(() => '?').join(',');
    const gradesRow = await c.env.DB.prepare(
      `SELECT COALESCE(SUM(CASE WHEN status IN ('present','makeup') THEN grade ELSE 0 END), 0) as sum_grades
       FROM grades WHERE session_id IN (${placeholders}) AND student_id = ?`
    ).bind(...sessions.results.map(s => s.id), studentId).first<{ sum_grades: number }>();

    const sumGrades = gradesRow?.sum_grades ?? 0;
    const average = Math.round((sumGrades / total) * 10) / 10;

    result.push({ class_id: cls.class_id, class_name: cls.class_name, total_sessions: total, sum_grades: sumGrades, average });
  }

  return c.json({ success: true, data: result });
});

export default grades;
