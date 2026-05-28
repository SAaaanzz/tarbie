import { Hono } from 'hono';
import type { HonoEnv } from '../env.js';
import { generateId, nowISO, ERROR_CODES } from '@tarbie/shared';
import { authMiddleware } from '../middleware/auth.js';

const ratings = new Hono<HonoEnv>();

// ── Smart review filter: auto-invalidate suspicious ratings ──
function filterRating(rating: number, reason: string | null): { valid: boolean; filterReason: string | null } {
  // Empty reason on extreme ratings → invalid
  if ((rating <= 2 || rating >= 10) && (!reason || reason.trim().length < 5)) {
    return { valid: false, filterReason: 'extreme_no_reason' };
  }
  // Very short reason on any rating
  if (reason && reason.trim().length > 0 && reason.trim().length < 3) {
    return { valid: false, filterReason: 'reason_too_short' };
  }
  // Gibberish detection: all same char or numeric-only reason
  if (reason && /^(.)\1{4,}$/.test(reason.trim())) {
    return { valid: false, filterReason: 'gibberish' };
  }
  // Single word insult-like patterns (common spam)
  if (reason && /^[а-яА-ЯёЁa-zA-Z]{1,3}$/.test(reason.trim())) {
    return { valid: false, filterReason: 'too_brief' };
  }
  return { valid: true, filterReason: null };
}

// ── Submit a rating (student) ──
ratings.post('/session/:sessionId', authMiddleware, async (c) => {
  const authUser = c.get('user');
  const sessionId = c.req.param('sessionId');
  const body = await c.req.json() as { rating: number; reason?: string; is_anonymous?: boolean };

  if (authUser.role !== 'student') {
    return c.json({ success: false, code: 'FORBIDDEN', message: 'Only students can rate sessions' }, 403);
  }

  if (!body.rating || body.rating < 1 || body.rating > 10) {
    return c.json({ success: false, code: ERROR_CODES.VALIDATION_ERROR, message: 'Rating must be 1-10' }, 400);
  }

  // Get session + verify student was actually enrolled in the session's class.
  // Without this any student in any school could vote on any session and tank
  // a stranger's rating.
  const session = await c.env.DB.prepare(
    `SELECT ts.teacher_id, ts.class_id, c.school_id
     FROM tarbie_sessions ts
     JOIN classes c ON ts.class_id = c.id
     WHERE ts.id = ?`
  ).bind(sessionId).first<{ teacher_id: string; class_id: string; school_id: string }>();

  if (!session || session.school_id !== authUser.school_id) {
    return c.json({ success: false, code: 'NOT_FOUND', message: 'Session not found' }, 404);
  }

  const enrolled = await c.env.DB.prepare(
    'SELECT 1 as ok FROM class_students WHERE class_id = ? AND student_id = ? LIMIT 1'
  ).bind(session.class_id, authUser.id).first<{ ok: number }>();
  if (!enrolled) {
    return c.json({ success: false, code: 'FORBIDDEN', message: 'You were not enrolled in this session\'s class' }, 403);
  }

  // Check duplicate
  const existing = await c.env.DB.prepare(
    'SELECT id FROM session_ratings WHERE session_id = ? AND student_id = ?'
  ).bind(sessionId, authUser.id).first();

  if (existing) {
    return c.json({ success: false, code: 'DUPLICATE', message: 'Already rated this session' }, 409);
  }

  const reason = body.reason?.trim() || null;
  const { valid, filterReason } = filterRating(body.rating, reason);

  const isAnonymous = body.is_anonymous ? 1 : 0;
  const id = generateId();
  await c.env.DB.prepare(
    'INSERT INTO session_ratings (id, session_id, student_id, teacher_id, rating, reason, is_valid, filter_reason, is_anonymous, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(id, sessionId, authUser.id, session.teacher_id, body.rating, reason, valid ? 1 : 0, filterReason, isAnonymous, nowISO()).run();

  return c.json({ success: true, data: { id, is_valid: valid, is_anonymous: !!isAnonymous } });
});

// ── Get teacher rating stats (admin/teacher) ──
ratings.get('/teacher/:teacherId', authMiddleware, async (c) => {
  const authUser = c.get('user');
  const teacherId = c.req.param('teacherId');

  // Only admin or the teacher themselves can view
  if (authUser.role !== 'admin' && authUser.id !== teacherId) {
    return c.json({ success: false, code: 'FORBIDDEN', message: 'Access denied' }, 403);
  }

  const teacher = await c.env.DB.prepare(
    'SELECT full_name FROM users WHERE id = ?'
  ).bind(teacherId).first<{ full_name: string }>();

  if (!teacher) {
    return c.json({ success: false, code: 'NOT_FOUND', message: 'Teacher not found' }, 404);
  }

  // Aggregate valid ratings
  const stats = await c.env.DB.prepare(
    `SELECT COUNT(*) as total, AVG(rating) as avg_rating
     FROM session_ratings WHERE teacher_id = ? AND is_valid = 1`
  ).bind(teacherId).first<{ total: number; avg_rating: number | null }>();

  const totalAll = await c.env.DB.prepare(
    'SELECT COUNT(*) as total FROM session_ratings WHERE teacher_id = ?'
  ).bind(teacherId).first<{ total: number }>();

  // Recent reviews with reasons
  const reviews = await c.env.DB.prepare(
    `SELECT sr.rating, sr.reason, sr.created_at, sr.is_anonymous,
            u.full_name as student_name, u.avatar_url as student_avatar_url
     FROM session_ratings sr
     JOIN users u ON sr.student_id = u.id
     WHERE sr.teacher_id = ? AND sr.is_valid = 1 AND sr.reason IS NOT NULL AND sr.reason != ''
     ORDER BY sr.created_at DESC LIMIT 20`
  ).bind(teacherId).all<{ rating: number; reason: string; created_at: string; is_anonymous: number; student_name: string; student_avatar_url: string | null }>();

  return c.json({
    success: true,
    data: {
      teacher_id: teacherId,
      teacher_name: teacher.full_name,
      total_ratings: totalAll?.total ?? 0,
      valid_ratings: stats?.total ?? 0,
      average_rating: Math.round((stats?.avg_rating ?? 0) * 10) / 10,
      recent_reviews: reviews.results.map(r => ({
        rating: r.rating,
        reason: r.reason,
        created_at: r.created_at,
        is_anonymous: !!r.is_anonymous,
        student_name: r.is_anonymous ? 'Аноним' : r.student_name,
        student_avatar_url: r.is_anonymous ? null : r.student_avatar_url,
      })),
    },
  });
});

// ── List all teachers with ratings (admin) ──
ratings.get('/teachers', authMiddleware, async (c) => {
  const authUser = c.get('user');
  if (authUser.role !== 'admin') {
    return c.json({ success: false, code: 'FORBIDDEN', message: 'Admin only' }, 403);
  }

  const teachers = await c.env.DB.prepare(
    `SELECT u.id, u.full_name, u.avatar_url,
            COUNT(sr.id) as total_ratings,
            SUM(CASE WHEN sr.is_valid = 1 THEN 1 ELSE 0 END) as valid_ratings,
            AVG(CASE WHEN sr.is_valid = 1 THEN sr.rating ELSE NULL END) as avg_rating
     FROM users u
     LEFT JOIN session_ratings sr ON u.id = sr.teacher_id
     WHERE u.role = 'teacher' AND u.school_id = ?
     GROUP BY u.id
     ORDER BY avg_rating DESC`
  ).bind(authUser.school_id).all<{
    id: string; full_name: string; total_ratings: number; valid_ratings: number; avg_rating: number | null;
  }>();

  return c.json({
    success: true,
    data: teachers.results.map(t => ({
      teacher_id: t.id,
      teacher_name: t.full_name,
      teacher_avatar_url: (t as any).avatar_url ?? null,
      total_ratings: t.total_ratings,
      valid_ratings: t.valid_ratings,
      average_rating: Math.round((t.avg_rating ?? 0) * 10) / 10,
    })),
  });
});

// ── Get all reviews for a session (teacher who taught it, or admin) ──
ratings.get('/session/:sessionId', authMiddleware, async (c) => {
  const authUser = c.get('user');
  const sessionId = c.req.param('sessionId');

  // Locate the session and confirm the caller is allowed to inspect its reviews.
  const session = await c.env.DB.prepare(
    `SELECT ts.teacher_id, c.school_id
     FROM tarbie_sessions ts
     JOIN classes c ON ts.class_id = c.id
     WHERE ts.id = ?`
  ).bind(sessionId).first<{ teacher_id: string; school_id: string }>();
  if (!session || session.school_id !== authUser.school_id) {
    return c.json({ success: false, code: 'NOT_FOUND', message: 'Session not found' }, 404);
  }
  const isOwnTeacher = authUser.role === 'teacher' && session.teacher_id === authUser.id;
  if (authUser.role !== 'admin' && !isOwnTeacher) {
    return c.json({ success: false, code: 'FORBIDDEN', message: 'Access denied' }, 403);
  }

  const results = await c.env.DB.prepare(
    `SELECT sr.id, sr.rating, sr.reason, sr.is_valid, sr.filter_reason, sr.is_anonymous, sr.created_at,
            u.full_name as student_name
     FROM session_ratings sr
     JOIN users u ON sr.student_id = u.id
     WHERE sr.session_id = ?
     ORDER BY sr.created_at DESC`
  ).bind(sessionId).all<{ id: string; rating: number; reason: string | null; is_valid: number; filter_reason: string | null; is_anonymous: number; created_at: string; student_name: string }>();

  return c.json({
    success: true,
    data: results.results.map(r => ({
      id: r.id,
      rating: r.rating,
      reason: r.reason,
      created_at: r.created_at,
      is_anonymous: !!r.is_anonymous,
      // Internal fields (is_valid, filter_reason) are only revealed to admins.
      ...(authUser.role === 'admin' ? { is_valid: !!r.is_valid, filter_reason: r.filter_reason } : {}),
      student_name: r.is_anonymous ? 'Аноним' : r.student_name,
    })),
  });
});

export default ratings;
