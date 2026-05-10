import { Hono } from 'hono';
import type { HonoEnv, Env } from './env.js';
import { corsMiddleware } from './middleware/cors.js';
import authRoutes from './routes/auth.js';
import sessionRoutes from './routes/sessions.js';
import attendanceRoutes from './routes/attendance.js';
import notificationRoutes from './routes/notifications.js';
import adminRoutes from './routes/admin.js';
import reportRoutes from './routes/reports.js';
import gradeRoutes from './routes/grades.js';
import eventRoutes from './routes/events.js';
import openSessionRoutes from './routes/open-sessions.js';
import supportRoutes from './routes/support.js';
import telegramBotRoutes from './routes/telegram-bot.js';
import ratingRoutes from './routes/ratings.js';
import courseRoutes from './routes/courses.js';
import assistantRoutes from './routes/assistant.js';
import premiumRoutes from './routes/premium.js';
import { structuredLog, nowISO } from '@tarbie/shared';
import type { QueueMessage } from '@tarbie/shared';
import { sendRatingRequest } from './routes/telegram-bot.js';

const app = new Hono<HonoEnv>();

app.use('*', corsMiddleware);

app.route('/api/auth', authRoutes);
app.route('/api/sessions', sessionRoutes);
app.route('/api/sessions', attendanceRoutes);
app.route('/api/notifications', notificationRoutes);
app.route('/api/admin', adminRoutes);
app.route('/api/reports', reportRoutes);
app.route('/api/grades', gradeRoutes);
app.route('/api/events', eventRoutes);
app.route('/api/open-sessions', openSessionRoutes);
app.route('/api/support', supportRoutes);
app.route('/api/telegram', telegramBotRoutes);
app.route('/api/ratings', ratingRoutes);
app.route('/api/courses', courseRoutes);
app.route('/api/assistant', assistantRoutes);
app.route('/api/premium', premiumRoutes);

app.get('/api/health', (c) => {
  return c.json({ success: true, data: { status: 'ok', timestamp: new Date().toISOString() } });
});

app.notFound((c) => {
  return c.json({ success: false, code: 'NOT_FOUND', message: 'Route not found' }, 404);
});

app.onError((err, c) => {
  structuredLog('error', 'Unhandled error', { error: err.message, path: c.req.path });
  return c.json({ success: false, code: 'INTERNAL_ERROR', message: 'Internal server error' }, 500);
});

async function handleCron(event: ScheduledEvent, env: Env): Promise<void> {
  const cron = event.cron;
  structuredLog('info', 'Cron triggered', { cron });

  if (cron === '0 4 * * *') {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    const sessions = await env.DB.prepare(
      `SELECT ts.id, ts.topic, ts.planned_date, ts.class_id, ts.teacher_id,
              c.name as class_name
       FROM tarbie_sessions ts
       JOIN classes c ON ts.class_id = c.id
       WHERE ts.planned_date = ? AND ts.status = 'planned'`
    ).bind(tomorrowStr).all<{
      id: string; topic: string; planned_date: string;
      class_id: string; teacher_id: string; class_name: string;
    }>();

    for (const session of sessions.results) {
      const students = await env.DB.prepare(
        'SELECT student_id FROM class_students WHERE class_id = ?'
      ).bind(session.class_id).all<{ student_id: string }>();

      const queueMsg: QueueMessage = {
        event_type: 'SESSION_REMINDER',
        session_id: session.id,
        user_ids: [session.teacher_id, ...students.results.map(s => s.student_id)],
        template_vars: {
          topic: session.topic,
          date: session.planned_date,
          class_name: session.class_name,
        },
        attempt: 0,
      };

      await env.NOTIFICATION_QUEUE.send(queueMsg);
    }

    structuredLog('info', 'Daily reminders queued', { count: sessions.results.length });

    // ── Curator notifications: sessions in next 7 days with empty topic ──
    const weekAhead = new Date();
    weekAhead.setDate(weekAhead.getDate() + 7);
    const weekAheadStr = weekAhead.toISOString().split('T')[0];
    const todayStr2 = new Date().toISOString().split('T')[0];

    const emptyTopicSessions = await env.DB.prepare(
      `SELECT ts.id, ts.topic, ts.planned_date, ts.teacher_id, c.name as class_name
       FROM tarbie_sessions ts
       JOIN classes c ON ts.class_id = c.id
       WHERE ts.planned_date BETWEEN ? AND ?
         AND ts.status = 'planned'
         AND (ts.topic IS NULL OR ts.topic = '')`
    ).bind(todayStr2, weekAheadStr).all<{
      id: string; topic: string; planned_date: string;
      teacher_id: string; class_name: string;
    }>();

    for (const session of emptyTopicSessions.results) {
      const reminderMsg: QueueMessage = {
        event_type: 'TOPIC_REMINDER',
        session_id: session.id,
        user_ids: [session.teacher_id],
        template_vars: {
          topic: '',
          date: session.planned_date,
          class_name: session.class_name,
        },
        attempt: 0,
      };
      await env.NOTIFICATION_QUEUE.send(reminderMsg);
    }

    structuredLog('info', 'Topic reminders queued', { count: emptyTopicSessions.results.length });
  }

  // Weekly incomplete check (runs on Fridays inside the daily cron)
  if (cron === '0 4 * * *' && new Date().getUTCDay() === 5) {
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - 5);
    const weekStartStr = weekStart.toISOString().split('T')[0];
    const todayStr = new Date().toISOString().split('T')[0];

    const incomplete = await env.DB.prepare(
      `SELECT ts.id, ts.topic, ts.class_id, c.name as class_name, c.school_id
       FROM tarbie_sessions ts
       JOIN classes c ON ts.class_id = c.id
       WHERE ts.planned_date BETWEEN ? AND ? AND ts.status = 'planned'`
    ).bind(weekStartStr, todayStr).all<{
      id: string; topic: string; class_id: string; class_name: string; school_id: string;
    }>();

    structuredLog('info', 'Weekly incomplete check', { count: incomplete.results.length });
  }

  // ── Auto-complete sessions whose time has passed (runs daily at 09:00 local) ──
  if (cron === '0 4 * * *') {
    // Complete all past-date planned sessions (yesterday and earlier)
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0]!;

    const pastSessions = await env.DB.prepare(
      `SELECT ts.id, ts.topic, ts.planned_date, ts.class_id, ts.teacher_id,
              c.name as class_name, c.school_id
       FROM tarbie_sessions ts
       JOIN classes c ON ts.class_id = c.id
       WHERE ts.planned_date <= ? AND ts.status = 'planned'`
    ).bind(yesterdayStr).all<{
      id: string; topic: string; planned_date: string;
      class_id: string; teacher_id: string; class_name: string; school_id: string;
    }>();

    let autoCompleted = 0;
    for (const session of pastSessions.results) {
      const nowStr = nowISO();
      await env.DB.prepare(
        `UPDATE tarbie_sessions SET status = 'completed', actual_date = ?, updated_at = ? WHERE id = ?`
      ).bind(session.planned_date, nowStr, session.id).run();

      const admins = await env.DB.prepare(
        "SELECT id FROM users WHERE school_id = ? AND role = 'admin'"
      ).bind(session.school_id).all<{ id: string }>();

      const students = await env.DB.prepare(
        'SELECT student_id FROM class_students WHERE class_id = ?'
      ).bind(session.class_id).all<{ student_id: string }>();

      const queueMsg: QueueMessage = {
        event_type: 'SESSION_COMPLETED',
        session_id: session.id,
        user_ids: [...admins.results.map(a => a.id), ...students.results.map(s => s.student_id)],
        template_vars: {
          topic: session.topic,
          class_name: session.class_name,
          attendance_count: '0',
          total_students: String(students.results.length),
        },
        attempt: 0,
      };
      await env.NOTIFICATION_QUEUE.send(queueMsg);

      // Send rating requests to students
      await sendRatingRequest(session.id, session.topic, env, env.TELEGRAM_BOT_TOKEN);

      autoCompleted++;
    }

    if (autoCompleted > 0) {
      structuredLog('info', 'Auto-completed past sessions', { count: autoCompleted });
    }
  }
}

export default {
  fetch: app.fetch,
  scheduled: handleCron,
};
