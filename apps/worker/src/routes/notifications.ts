// Маршруты уведомлений: постановка рассылок в очередь и журнал отправок.
import { Hono } from 'hono';
import type { HonoEnv } from '../env.js';
import { authMiddleware, requireRole } from '../middleware/auth.js';
import { sendNotificationSchema, notificationLogQuerySchema, ERROR_CODES } from '@tarbie/shared';
import type { QueueMessage } from '@tarbie/shared';

const notifications = new Hono<HonoEnv>();

notifications.use('*', authMiddleware);

notifications.post('/send', requireRole('admin', 'teacher'), async (c) => {
  const body = await c.req.json();
  const parsed = sendNotificationSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ success: false, code: ERROR_CODES.VALIDATION_ERROR, message: parsed.error.issues[0]?.message ?? 'Invalid input' }, 400);
  }

  const user = c.get('user');
  const { session_id, event_type, user_ids } = parsed.data;

  const session = await c.env.DB.prepare(
    `SELECT ts.id, ts.topic, ts.planned_date, c.name as class_name, c.school_id, u.full_name as teacher_name
     FROM tarbie_sessions ts
     JOIN classes c ON ts.class_id = c.id
     JOIN users u ON ts.teacher_id = u.id
     WHERE ts.id = ?`
  ).bind(session_id).first<{
    id: string; topic: string; planned_date: string;
    class_name: string; school_id: string; teacher_name: string;
  }>();

  if (!session || session.school_id !== user.school_id) {
    return c.json({ success: false, code: ERROR_CODES.SESSION_NOT_FOUND, message: 'Session not found' }, 404);
  }

  let targetUserIds = user_ids;
  if (!targetUserIds) {
    const classStudents = await c.env.DB.prepare(
      `SELECT cs.student_id FROM class_students cs
       JOIN tarbie_sessions ts ON ts.class_id = cs.class_id
       WHERE ts.id = ?`
    ).bind(session_id).all<{ student_id: string }>();
    targetUserIds = classStudents.results.map(s => s.student_id);
  }

  const queueMsg: QueueMessage = {
    event_type,
    session_id,
    user_ids: targetUserIds,
    template_vars: {
      topic: session.topic,
      date: session.planned_date,
      class_name: session.class_name,
      teacher_name: session.teacher_name,
    },
    attempt: 0,
  };

  await c.env.NOTIFICATION_QUEUE.send(queueMsg);

  return c.json({ success: true, data: { queued: true, recipients: targetUserIds.length } });
});

notifications.get('/log', requireRole('admin'), async (c) => {
  const query = notificationLogQuerySchema.safeParse(Object.fromEntries(new URL(c.req.url).searchParams));
  if (!query.success) {
    return c.json({ success: false, code: ERROR_CODES.VALIDATION_ERROR, message: query.error.issues[0]?.message ?? 'Invalid query' }, 400);
  }

  const user = c.get('user');
  const { userId, page, pageSize } = query.data;
  const offset = (page - 1) * pageSize;

  let sql = `SELECT nl.*, u.full_name as user_name
             FROM notifications_log nl
             JOIN users u ON nl.user_id = u.id
             WHERE u.school_id = ?`;
  const params: string[] = [user.school_id];

  if (userId) {
    sql += ' AND nl.user_id = ?';
    params.push(userId);
  }

  sql += ' ORDER BY nl.sent_at DESC LIMIT ? OFFSET ?';

  const countSql = userId
    ? 'SELECT COUNT(*) as total FROM notifications_log nl JOIN users u ON nl.user_id = u.id WHERE u.school_id = ? AND nl.user_id = ?'
    : 'SELECT COUNT(*) as total FROM notifications_log nl JOIN users u ON nl.user_id = u.id WHERE u.school_id = ?';

  const countResult = await c.env.DB.prepare(countSql)
    .bind(...params.slice(0, userId ? 2 : 1))
    .first<{ total: number }>();

  const rows = await c.env.DB.prepare(sql).bind(...params, pageSize, offset).all();

  return c.json({
    success: true,
    data: rows.results,
    total: countResult?.total ?? 0,
    page,
    pageSize,
  });
});

export default notifications;
