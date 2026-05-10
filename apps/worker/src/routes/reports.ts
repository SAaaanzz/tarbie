import { Hono } from 'hono';
import type { HonoEnv } from '../env.js';
import { authMiddleware, requireRole } from '../middleware/auth.js';
import { monthlyReportQuerySchema, ERROR_CODES } from '@tarbie/shared';

const reports = new Hono<HonoEnv>();

reports.use('*', authMiddleware, requireRole('admin', 'teacher'));

reports.get('/monthly', async (c) => {
  const user = c.get('user');
  const query = monthlyReportQuerySchema.safeParse(Object.fromEntries(new URL(c.req.url).searchParams));
  if (!query.success) {
    return c.json({ success: false, code: ERROR_CODES.VALIDATION_ERROR, message: query.error.issues[0]?.message ?? 'Invalid query' }, 400);
  }

  const { classId, month } = query.data;

  const cls = await c.env.DB.prepare(
    'SELECT id, name, teacher_id FROM classes WHERE id = ? AND school_id = ?'
  ).bind(classId, user.school_id).first<{ id: string; name: string; teacher_id: string }>();

  if (!cls) {
    return c.json({ success: false, code: ERROR_CODES.CLASS_NOT_FOUND, message: 'Class not found' }, 404);
  }

  const sessions = await c.env.DB.prepare(
    `SELECT * FROM tarbie_sessions
     WHERE class_id = ? AND planned_date LIKE ? || '%'
     ORDER BY planned_date`
  ).bind(classId, month).all();

  const totalPlanned = sessions.results.length;
  const totalCompleted = sessions.results.filter((s: Record<string, unknown>) => s['status'] === 'completed').length;
  const totalCancelled = sessions.results.filter((s: Record<string, unknown>) => s['status'] === 'cancelled').length;
  const totalRescheduled = sessions.results.filter((s: Record<string, unknown>) => s['status'] === 'rescheduled').length;

  const totalStudents = await c.env.DB.prepare(
    'SELECT COUNT(*) as cnt FROM class_students WHERE class_id = ?'
  ).bind(classId).first<{ cnt: number }>();

  let totalAttendanceRecords = 0;
  let totalPresentRecords = 0;

  for (const session of sessions.results) {
    const sid = (session as Record<string, unknown>)['id'] as string;
    // Check grades table first (primary attendance source)
    const gradeAtt = await c.env.DB.prepare(
      `SELECT COUNT(*) as total,
              SUM(CASE WHEN status IN ('present','makeup') THEN 1 ELSE 0 END) as present_count
       FROM grades WHERE session_id = ?`
    ).bind(sid).first<{ total: number; present_count: number }>();
    if (gradeAtt && gradeAtt.total > 0) {
      totalAttendanceRecords += gradeAtt.total;
      totalPresentRecords += gradeAtt.present_count;
    } else {
      // Fallback to session_attendance
      const att = await c.env.DB.prepare(
        `SELECT COUNT(*) as total,
                SUM(CASE WHEN status IN ('present','late') THEN 1 ELSE 0 END) as present_count
         FROM session_attendance WHERE session_id = ?`
      ).bind(sid).first<{ total: number; present_count: number }>();
      if (att && att.total > 0) {
        totalAttendanceRecords += att.total;
        totalPresentRecords += att.present_count;
      }
    }
  }

  const completionRate = totalPlanned > 0 ? Math.round((totalCompleted / totalPlanned) * 100) : 0;
  const attendanceRate = totalAttendanceRecords > 0 ? Math.round((totalPresentRecords / totalAttendanceRecords) * 100) : 0;

  return c.json({
    success: true,
    data: {
      class_id: classId,
      class_name: cls.name,
      month,
      total_planned: totalPlanned,
      total_completed: totalCompleted,
      total_cancelled: totalCancelled,
      total_rescheduled: totalRescheduled,
      completion_rate: completionRate,
      attendance_rate: attendanceRate,
      total_students: totalStudents?.cnt ?? 0,
      sessions: sessions.results,
    },
  });
});

export default reports;
