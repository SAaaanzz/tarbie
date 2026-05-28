import { Hono } from 'hono';
import type { HonoEnv, Env } from './env.js';
import { corsMiddleware } from './middleware/cors.js';
import { bodyLimit } from './middleware/body-limit.js';
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
import teacherRoutes from './routes/teacher.js';
import { signatures as signatureRoutes } from './routes/signatures.js';
import { lessonApprovals as lessonApprovalRoutes } from './routes/lesson-approvals.js';
import { structuredLog, nowISO } from '@tarbie/shared';
import type { QueueMessage } from '@tarbie/shared';
import { sendRatingRequest } from './routes/telegram-bot.js';

const app = new Hono<HonoEnv>();

app.use('*', corsMiddleware);
app.use('*', bodyLimit());

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
app.route('/api/teacher', teacherRoutes);
app.route('/api/signatures', signatureRoutes);
app.route('/api/lesson-approvals', lessonApprovalRoutes);

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

// Cloudflare Queues hard-limit message body to 128 KB. With ~36-byte UUIDs,
// 100 user IDs ≈ 3.6 KB plus overhead — safe and parallelisable.
const QUEUE_FANOUT_CHUNK = 100;

async function queueFanOut(
  env: Env,
  base: Omit<QueueMessage, 'user_ids'>,
  userIds: string[]
): Promise<void> {
  if (userIds.length === 0) return;
  for (let i = 0; i < userIds.length; i += QUEUE_FANOUT_CHUNK) {
    const slice = userIds.slice(i, i + QUEUE_FANOUT_CHUNK);
    await env.NOTIFICATION_QUEUE.send({ ...base, user_ids: slice });
  }
}

async function handleCron(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
  const cron = event.cron;
  structuredLog('info', 'Cron triggered', { cron });

  if (cron === '0 4 * * *') {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    // 1 JOIN query collects sessions + class students for tomorrow (eliminates N+1).
    const reminderRows = await env.DB.prepare(
      `SELECT ts.id as session_id, ts.topic, ts.planned_date, ts.teacher_id,
              c.name as class_name, cs.student_id
       FROM tarbie_sessions ts
       JOIN classes c ON ts.class_id = c.id
       LEFT JOIN class_students cs ON cs.class_id = ts.class_id
       WHERE ts.planned_date = ? AND ts.status = 'planned'`
    ).bind(tomorrowStr).all<{
      session_id: string; topic: string; planned_date: string;
      teacher_id: string; class_name: string; student_id: string | null;
    }>();

    // Group rows by session.
    const sessionMap = new Map<string, {
      topic: string; planned_date: string; teacher_id: string;
      class_name: string; student_ids: Set<string>;
    }>();
    for (const r of reminderRows.results) {
      let s = sessionMap.get(r.session_id);
      if (!s) {
        s = { topic: r.topic, planned_date: r.planned_date, teacher_id: r.teacher_id,
              class_name: r.class_name, student_ids: new Set() };
        sessionMap.set(r.session_id, s);
      }
      if (r.student_id) s.student_ids.add(r.student_id);
    }

    for (const [sessionId, s] of sessionMap) {
      const userIds = [s.teacher_id, ...s.student_ids];
      await queueFanOut(env, {
        event_type: 'SESSION_REMINDER',
        session_id: sessionId,
        template_vars: {
          topic: s.topic,
          date: s.planned_date,
          class_name: s.class_name,
        },
        attempt: 0,
      }, userIds);
    }

    structuredLog('info', 'Daily reminders queued', { count: sessionMap.size });

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
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0]!;

    // Fetch all sessions + their class students + school admins in 2 joined queries (no N+1).
    const pastRows = await env.DB.prepare(
      `SELECT ts.id as session_id, ts.topic, ts.planned_date, ts.class_id,
              c.name as class_name, c.school_id, cs.student_id
       FROM tarbie_sessions ts
       JOIN classes c ON ts.class_id = c.id
       LEFT JOIN class_students cs ON cs.class_id = ts.class_id
       WHERE ts.planned_date <= ? AND ts.status = 'planned'`
    ).bind(yesterdayStr).all<{
      session_id: string; topic: string; planned_date: string; class_id: string;
      class_name: string; school_id: string; student_id: string | null;
    }>();

    if (pastRows.results.length === 0) {
      return;
    }

    // Group sessions and collect distinct school_ids for an admin lookup batch.
    const sessions = new Map<string, {
      topic: string; planned_date: string; class_id: string; class_name: string;
      school_id: string; student_ids: Set<string>;
    }>();
    const schoolIds = new Set<string>();
    for (const r of pastRows.results) {
      let s = sessions.get(r.session_id);
      if (!s) {
        s = { topic: r.topic, planned_date: r.planned_date, class_id: r.class_id,
              class_name: r.class_name, school_id: r.school_id, student_ids: new Set() };
        sessions.set(r.session_id, s);
        schoolIds.add(r.school_id);
      }
      if (r.student_id) s.student_ids.add(r.student_id);
    }

    // 1 query for all school admins.
    const adminsBySchool = new Map<string, string[]>();
    if (schoolIds.size > 0) {
      const schoolList = Array.from(schoolIds);
      const ph = schoolList.map(() => '?').join(',');
      const admins = await env.DB.prepare(
        `SELECT id, school_id FROM users WHERE school_id IN (${ph}) AND role = 'admin'`
      ).bind(...schoolList).all<{ id: string; school_id: string }>();
      for (const a of admins.results) {
        const arr = adminsBySchool.get(a.school_id) ?? [];
        arr.push(a.id);
        adminsBySchool.set(a.school_id, arr);
      }
    }

    // Batch UPDATE all sessions to completed.
    const nowStr = nowISO();
    const sessionList = Array.from(sessions.entries());
    const UPDATE_CHUNK = 50;
    for (let i = 0; i < sessionList.length; i += UPDATE_CHUNK) {
      const slice = sessionList.slice(i, i + UPDATE_CHUNK);
      const stmts = slice.map(([sid, s]) =>
        env.DB.prepare(
          `UPDATE tarbie_sessions SET status = 'completed', actual_date = ?, updated_at = ? WHERE id = ?`
        ).bind(s.planned_date, nowStr, sid)
      );
      await env.DB.batch(stmts);
    }

    // Queue SESSION_COMPLETED notifications (chunked fan-out).
    for (const [sessionId, s] of sessions) {
      const admins = adminsBySchool.get(s.school_id) ?? [];
      const userIds = [...admins, ...s.student_ids];
      await queueFanOut(env, {
        event_type: 'SESSION_COMPLETED',
        session_id: sessionId,
        template_vars: {
          topic: s.topic,
          class_name: s.class_name,
          attendance_count: '0',
          total_students: String(s.student_ids.size),
        },
        attempt: 0,
      }, userIds);
    }

    // Rating requests run async via waitUntil so cron doesn't block on Telegram HTTP.
    // Each call still loops through students sequentially inside; for very large schools
    // consider moving this to its own queue event in the future.
    ctx.waitUntil((async () => {
      for (const [sessionId, s] of sessions) {
        try {
          await sendRatingRequest(sessionId, s.topic, env, env.TELEGRAM_BOT_TOKEN);
        } catch (err) {
          structuredLog('warn', 'sendRatingRequest failed', {
            session_id: sessionId,
            error: err instanceof Error ? err.message : 'unknown',
          });
        }
      }
    })());

    structuredLog('info', 'Auto-completed past sessions', { count: sessions.size });
  }
}

export default {
  fetch: app.fetch,
  scheduled: handleCron,
};
