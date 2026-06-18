// Маршруты онлайн-курсов: курсы, модули, уроки, запись на курс,
// прогресс прохождения и отзывы о курсах.
import { Hono } from 'hono';
import type { HonoEnv } from '../env.js';
import { authMiddleware, requireRole } from '../middleware/auth.js';
import {
  createCourseSchema, updateCourseSchema, createModuleSchema, updateModuleSchema,
  createLessonSchema, updateLessonSchema, coursesQuerySchema, createReviewSchema,
  updateProgressSchema, generateId, nowISO, ERROR_CODES, structuredLog,
} from '@tarbie/shared';
import type { CourseWithMeta, ModuleWithLessons, Lesson, CourseReviewWithUser } from '@tarbie/shared';

const courses = new Hono<HonoEnv>();

courses.use('*', authMiddleware);

// ── Categories ──
courses.get('/categories', async (c) => {
  const rows = await c.env.DB.prepare('SELECT * FROM categories ORDER BY name').all();
  return c.json({ success: true, data: rows.results });
});

// ── Course Catalog (published courses) ──
courses.get('/', async (c) => {
  const user = c.get('user');
  const query = coursesQuerySchema.safeParse(Object.fromEntries(new URL(c.req.url).searchParams));
  if (!query.success) {
    return c.json({ success: false, code: ERROR_CODES.VALIDATION_ERROR, message: query.error.issues[0]?.message ?? 'Invalid query' }, 400);
  }

  const { categoryId, status, search, page, pageSize } = query.data;
  const conditions: string[] = ['co.school_id = ?'];
  const params: (string | number)[] = [user.school_id];

  if (user.role === 'student') {
    conditions.push("co.status = 'published'");
  } else if (status) {
    conditions.push('co.status = ?');
    params.push(status);
  }

  if (user.role === 'teacher') {
    conditions.push('(co.teacher_id = ? OR co.status = ?)');
    params.push(user.id, 'published');
  }

  if (categoryId) {
    conditions.push('co.category_id = ?');
    params.push(categoryId);
  }
  if (search) {
    conditions.push("(co.title LIKE ? OR co.description LIKE ?)");
    const s = `%${search}%`;
    params.push(s, s);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const offset = (page - 1) * pageSize;

  const countResult = await c.env.DB.prepare(
    `SELECT COUNT(*) as total FROM courses co ${where}`
  ).bind(...params).first<{ total: number }>();

  const rows = await c.env.DB.prepare(
    `SELECT co.*,
            u.full_name as teacher_name,
            u.avatar_url as teacher_avatar_url,
            cat.name as category_name,
            (SELECT COUNT(*) FROM enrollments WHERE course_id = co.id AND status != 'cancelled') as enrolled_count,
            (SELECT AVG(rating) FROM course_reviews WHERE course_id = co.id) as avg_rating,
            (SELECT COUNT(*) FROM modules WHERE course_id = co.id) as modules_count,
            (SELECT COUNT(*) FROM lessons l JOIN modules m ON l.module_id = m.id WHERE m.course_id = co.id) as lessons_count
     FROM courses co
     JOIN users u ON co.teacher_id = u.id
     LEFT JOIN categories cat ON co.category_id = cat.id
     ${where}
     ORDER BY co.created_at DESC
     LIMIT ? OFFSET ?`
  ).bind(...params, pageSize, offset).all<CourseWithMeta>();

  return c.json({
    success: true,
    data: rows.results,
    total: countResult?.total ?? 0,
    page,
    pageSize,
  });
});

// ── Get single course with modules & lessons ──
courses.get('/:id', async (c) => {
  const user = c.get('user');
  const courseId = c.req.param('id');

  const course = await c.env.DB.prepare(
    `SELECT co.*,
            u.full_name as teacher_name,
            u.avatar_url as teacher_avatar_url,
            cat.name as category_name,
            (SELECT COUNT(*) FROM enrollments WHERE course_id = co.id AND status != 'cancelled') as enrolled_count,
            (SELECT AVG(rating) FROM course_reviews WHERE course_id = co.id) as avg_rating,
            (SELECT COUNT(*) FROM modules WHERE course_id = co.id) as modules_count,
            (SELECT COUNT(*) FROM lessons l JOIN modules m ON l.module_id = m.id WHERE m.course_id = co.id) as lessons_count
     FROM courses co
     JOIN users u ON co.teacher_id = u.id
     LEFT JOIN categories cat ON co.category_id = cat.id
     WHERE co.id = ? AND co.school_id = ?`
  ).bind(courseId, user.school_id).first<CourseWithMeta>();

  if (!course) {
    return c.json({ success: false, code: ERROR_CODES.NOT_FOUND, message: 'Course not found' }, 404);
  }

  if (user.role === 'student' && course.status !== 'published') {
    return c.json({ success: false, code: ERROR_CODES.NOT_FOUND, message: 'Course not found' }, 404);
  }

  const modulesRaw = await c.env.DB.prepare(
    'SELECT * FROM modules WHERE course_id = ? ORDER BY sort_order'
  ).bind(courseId).all();

  const lessonsRaw = await c.env.DB.prepare(
    `SELECT l.* FROM lessons l
     JOIN modules m ON l.module_id = m.id
     WHERE m.course_id = ?
     ORDER BY l.sort_order`
  ).bind(courseId).all<Lesson>();

  const modules: ModuleWithLessons[] = (modulesRaw.results as { id: string; course_id: string; title: string; sort_order: number; created_at: string }[]).map(m => ({
    ...m,
    lessons: lessonsRaw.results.filter(l => l.module_id === m.id),
  }));

  const enrollment = await c.env.DB.prepare(
    'SELECT * FROM enrollments WHERE user_id = ? AND course_id = ?'
  ).bind(user.id, courseId).first();

  let progress = null;
  if (enrollment) {
    const totalLessons = lessonsRaw.results.length;
    const completedResult = await c.env.DB.prepare(
      `SELECT COUNT(*) as cnt FROM lesson_progress lp
       JOIN lessons l ON lp.lesson_id = l.id
       JOIN modules m ON l.module_id = m.id
       WHERE m.course_id = ? AND lp.user_id = ? AND lp.status = 'completed'`
    ).bind(courseId, user.id).first<{ cnt: number }>();
    const completed = completedResult?.cnt ?? 0;
    progress = {
      total_lessons: totalLessons,
      completed_lessons: completed,
      progress_percent: totalLessons > 0 ? Math.round((completed / totalLessons) * 100) : 0,
    };
  }

  const reviews = await c.env.DB.prepare(
    `SELECT cr.*, u.full_name as user_name, u.avatar_url as user_avatar_url
     FROM course_reviews cr JOIN users u ON cr.user_id = u.id
     WHERE cr.course_id = ? ORDER BY cr.created_at DESC LIMIT 20`
  ).bind(courseId).all<CourseReviewWithUser>();

  return c.json({
    success: true,
    data: {
      course,
      modules,
      enrollment: enrollment ?? null,
      progress,
      reviews: reviews.results,
    },
  });
});

// ── Create course (teacher/admin) ──
courses.post('/', requireRole('admin', 'teacher'), async (c) => {
  const user = c.get('user');
  const body = await c.req.json();
  const parsed = createCourseSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ success: false, code: ERROR_CODES.VALIDATION_ERROR, message: parsed.error.issues[0]?.message ?? 'Invalid input' }, 400);
  }

  const id = generateId();
  const now = nowISO();
  const { title, description, category_id, price, cover_url, lang } = parsed.data;

  await c.env.DB.prepare(
    `INSERT INTO courses (id, title, description, teacher_id, school_id, category_id, price, status, cover_url, lang, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?)`
  ).bind(id, title, description, user.id, user.school_id, category_id ?? null, price, cover_url ?? null, lang, now, now).run();

  structuredLog('info', 'Course created', { course_id: id, teacher_id: user.id });

  return c.json({ success: true, data: { id, title, status: 'draft' } }, 201);
});

// ── Update course ──
courses.put('/:id', requireRole('admin', 'teacher'), async (c) => {
  const user = c.get('user');
  const courseId = c.req.param('id');
  const body = await c.req.json();
  const parsed = updateCourseSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ success: false, code: ERROR_CODES.VALIDATION_ERROR, message: parsed.error.issues[0]?.message ?? 'Invalid input' }, 400);
  }

  const existing = await c.env.DB.prepare(
    'SELECT * FROM courses WHERE id = ? AND school_id = ?'
  ).bind(courseId, user.school_id).first<{ id: string; teacher_id: string }>();

  if (!existing) {
    return c.json({ success: false, code: ERROR_CODES.NOT_FOUND, message: 'Course not found' }, 404);
  }
  if (user.role === 'teacher' && existing.teacher_id !== user.id) {
    return c.json({ success: false, code: ERROR_CODES.FORBIDDEN, message: 'Not your course' }, 403);
  }

  const updates: string[] = [];
  const values: (string | number | null)[] = [];
  const d = parsed.data;

  if (d.title !== undefined) { updates.push('title = ?'); values.push(d.title); }
  if (d.description !== undefined) { updates.push('description = ?'); values.push(d.description); }
  if (d.category_id !== undefined) { updates.push('category_id = ?'); values.push(d.category_id ?? null); }
  if (d.price !== undefined) { updates.push('price = ?'); values.push(d.price); }
  if (d.status !== undefined) { updates.push('status = ?'); values.push(d.status); }
  if (d.cover_url !== undefined) { updates.push('cover_url = ?'); values.push(d.cover_url ?? null); }
  if (d.lang !== undefined) { updates.push('lang = ?'); values.push(d.lang); }

  if (updates.length === 0) {
    return c.json({ success: true, data: { id: courseId, updated: false } });
  }

  updates.push('updated_at = ?');
  values.push(nowISO());
  values.push(courseId);

  await c.env.DB.prepare(
    `UPDATE courses SET ${updates.join(', ')} WHERE id = ?`
  ).bind(...values).run();

  return c.json({ success: true, data: { id: courseId, updated: true } });
});

// ── Delete course ──
courses.delete('/:id', requireRole('admin', 'teacher'), async (c) => {
  const user = c.get('user');
  const courseId = c.req.param('id');

  const existing = await c.env.DB.prepare(
    'SELECT id, teacher_id FROM courses WHERE id = ? AND school_id = ?'
  ).bind(courseId, user.school_id).first<{ id: string; teacher_id: string }>();

  if (!existing) {
    return c.json({ success: false, code: ERROR_CODES.NOT_FOUND, message: 'Course not found' }, 404);
  }
  if (user.role === 'teacher' && existing.teacher_id !== user.id) {
    return c.json({ success: false, code: ERROR_CODES.FORBIDDEN, message: 'Not your course' }, 403);
  }

  await c.env.DB.prepare('DELETE FROM courses WHERE id = ?').bind(courseId).run();
  structuredLog('info', 'Course deleted', { course_id: courseId });

  return c.json({ success: true, data: { id: courseId, deleted: true } });
});

// ── Enroll in course ──
courses.post('/:id/enroll', async (c) => {
  const user = c.get('user');
  const courseId = c.req.param('id');

  const course = await c.env.DB.prepare(
    "SELECT id, status FROM courses WHERE id = ? AND school_id = ? AND status = 'published'"
  ).bind(courseId, user.school_id).first<{ id: string }>();

  if (!course) {
    return c.json({ success: false, code: ERROR_CODES.NOT_FOUND, message: 'Course not found or not published' }, 404);
  }

  const existing = await c.env.DB.prepare(
    'SELECT id, status FROM enrollments WHERE user_id = ? AND course_id = ?'
  ).bind(user.id, courseId).first<{ id: string; status: string }>();

  if (existing && existing.status !== 'cancelled') {
    return c.json({ success: false, code: ERROR_CODES.DUPLICATE_ENTRY, message: 'Already enrolled' }, 409);
  }

  if (existing && existing.status === 'cancelled') {
    await c.env.DB.prepare(
      "UPDATE enrollments SET status = 'active', enrolled_at = ?, completed_at = NULL WHERE id = ?"
    ).bind(nowISO(), existing.id).run();
    return c.json({ success: true, data: { id: existing.id, enrolled: true } });
  }

  const id = generateId();
  await c.env.DB.prepare(
    'INSERT INTO enrollments (id, user_id, course_id, status, enrolled_at) VALUES (?, ?, ?, ?, ?)'
  ).bind(id, user.id, courseId, 'active', nowISO()).run();

  return c.json({ success: true, data: { id, enrolled: true } }, 201);
});

// ── My Courses (enrolled) ──
courses.get('/my/enrolled', async (c) => {
  const user = c.get('user');

  const rows = await c.env.DB.prepare(
    `SELECT co.*,
            u.full_name as teacher_name,
            u.avatar_url as teacher_avatar_url,
            cat.name as category_name,
            e.status as enrollment_status,
            e.enrolled_at,
            (SELECT COUNT(*) FROM enrollments WHERE course_id = co.id AND status != 'cancelled') as enrolled_count,
            (SELECT AVG(rating) FROM course_reviews WHERE course_id = co.id) as avg_rating,
            (SELECT COUNT(*) FROM modules WHERE course_id = co.id) as modules_count,
            (SELECT COUNT(*) FROM lessons l JOIN modules m ON l.module_id = m.id WHERE m.course_id = co.id) as lessons_count,
            (SELECT COUNT(*) FROM lesson_progress lp
             JOIN lessons l2 ON lp.lesson_id = l2.id
             JOIN modules m2 ON l2.module_id = m2.id
             WHERE m2.course_id = co.id AND lp.user_id = ? AND lp.status = 'completed') as completed_lessons
     FROM enrollments e
     JOIN courses co ON e.course_id = co.id
     JOIN users u ON co.teacher_id = u.id
     LEFT JOIN categories cat ON co.category_id = cat.id
     WHERE e.user_id = ? AND e.status != 'cancelled'
     ORDER BY e.enrolled_at DESC`
  ).bind(user.id, user.id).all();

  return c.json({ success: true, data: rows.results });
});

// ── Modules CRUD ──
courses.post('/:courseId/modules', requireRole('admin', 'teacher'), async (c) => {
  const user = c.get('user');
  const courseId = c.req.param('courseId');
  const body = await c.req.json();
  const parsed = createModuleSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ success: false, code: ERROR_CODES.VALIDATION_ERROR, message: parsed.error.issues[0]?.message ?? 'Invalid input' }, 400);
  }

  const course = await c.env.DB.prepare(
    'SELECT id, teacher_id FROM courses WHERE id = ? AND school_id = ?'
  ).bind(courseId, user.school_id).first<{ id: string; teacher_id: string }>();
  if (!course) return c.json({ success: false, code: ERROR_CODES.NOT_FOUND, message: 'Course not found' }, 404);
  if (user.role === 'teacher' && course.teacher_id !== user.id) {
    return c.json({ success: false, code: ERROR_CODES.FORBIDDEN, message: 'Not your course' }, 403);
  }

  const id = generateId();
  await c.env.DB.prepare(
    'INSERT INTO modules (id, course_id, title, sort_order, created_at) VALUES (?, ?, ?, ?, ?)'
  ).bind(id, courseId, parsed.data.title, parsed.data.sort_order, nowISO()).run();

  return c.json({ success: true, data: { id, title: parsed.data.title } }, 201);
});

courses.put('/:courseId/modules/:moduleId', requireRole('admin', 'teacher'), async (c) => {
  const user = c.get('user');
  const courseId = c.req.param('courseId');
  const moduleId = c.req.param('moduleId');
  const body = await c.req.json();
  const parsed = updateModuleSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ success: false, code: ERROR_CODES.VALIDATION_ERROR, message: parsed.error.issues[0]?.message ?? 'Invalid input' }, 400);
  }

  const course = await c.env.DB.prepare(
    'SELECT id, teacher_id FROM courses WHERE id = ? AND school_id = ?'
  ).bind(courseId, user.school_id).first<{ id: string; teacher_id: string }>();
  if (!course) return c.json({ success: false, code: ERROR_CODES.NOT_FOUND, message: 'Course not found' }, 404);
  if (user.role === 'teacher' && course.teacher_id !== user.id) {
    return c.json({ success: false, code: ERROR_CODES.FORBIDDEN, message: 'Not your course' }, 403);
  }

  const updates: string[] = [];
  const values: (string | number)[] = [];
  if (parsed.data.title !== undefined) { updates.push('title = ?'); values.push(parsed.data.title); }
  if (parsed.data.sort_order !== undefined) { updates.push('sort_order = ?'); values.push(parsed.data.sort_order); }

  if (updates.length === 0) return c.json({ success: true, data: { id: moduleId, updated: false } });

  values.push(moduleId);
  values.push(courseId);
  await c.env.DB.prepare(
    `UPDATE modules SET ${updates.join(', ')} WHERE id = ? AND course_id = ?`
  ).bind(...values).run();

  return c.json({ success: true, data: { id: moduleId, updated: true } });
});

courses.delete('/:courseId/modules/:moduleId', requireRole('admin', 'teacher'), async (c) => {
  const user = c.get('user');
  const courseId = c.req.param('courseId');
  const moduleId = c.req.param('moduleId');

  const course = await c.env.DB.prepare(
    'SELECT id, teacher_id FROM courses WHERE id = ? AND school_id = ?'
  ).bind(courseId, user.school_id).first<{ id: string; teacher_id: string }>();
  if (!course) return c.json({ success: false, code: ERROR_CODES.NOT_FOUND, message: 'Course not found' }, 404);
  if (user.role === 'teacher' && course.teacher_id !== user.id) {
    return c.json({ success: false, code: ERROR_CODES.FORBIDDEN, message: 'Not your course' }, 403);
  }

  await c.env.DB.prepare('DELETE FROM modules WHERE id = ? AND course_id = ?').bind(moduleId, courseId).run();
  return c.json({ success: true, data: { id: moduleId, deleted: true } });
});

// ── Lessons CRUD ──
courses.post('/:courseId/modules/:moduleId/lessons', requireRole('admin', 'teacher'), async (c) => {
  const user = c.get('user');
  const courseId = c.req.param('courseId');
  const moduleId = c.req.param('moduleId');
  const body = await c.req.json();
  const parsed = createLessonSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ success: false, code: ERROR_CODES.VALIDATION_ERROR, message: parsed.error.issues[0]?.message ?? 'Invalid input' }, 400);
  }

  const course = await c.env.DB.prepare(
    'SELECT id, teacher_id FROM courses WHERE id = ? AND school_id = ?'
  ).bind(courseId, user.school_id).first<{ id: string; teacher_id: string }>();
  if (!course) return c.json({ success: false, code: ERROR_CODES.NOT_FOUND, message: 'Course not found' }, 404);
  if (user.role === 'teacher' && course.teacher_id !== user.id) {
    return c.json({ success: false, code: ERROR_CODES.FORBIDDEN, message: 'Not your course' }, 403);
  }

  const mod = await c.env.DB.prepare(
    'SELECT id FROM modules WHERE id = ? AND course_id = ?'
  ).bind(moduleId, courseId).first();
  if (!mod) return c.json({ success: false, code: ERROR_CODES.NOT_FOUND, message: 'Module not found' }, 404);

  const id = generateId();
  const now = nowISO();
  const { title, type, content, video_url, duration_minutes, sort_order } = parsed.data;

  await c.env.DB.prepare(
    `INSERT INTO lessons (id, module_id, title, type, content, video_url, duration_minutes, sort_order, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(id, moduleId, title, type, content, video_url ?? null, duration_minutes, sort_order, now, now).run();

  return c.json({ success: true, data: { id, title } }, 201);
});

courses.put('/:courseId/modules/:moduleId/lessons/:lessonId', requireRole('admin', 'teacher'), async (c) => {
  const user = c.get('user');
  const courseId = c.req.param('courseId');
  const lessonId = c.req.param('lessonId');
  const body = await c.req.json();
  const parsed = updateLessonSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ success: false, code: ERROR_CODES.VALIDATION_ERROR, message: parsed.error.issues[0]?.message ?? 'Invalid input' }, 400);
  }

  const course = await c.env.DB.prepare(
    'SELECT id, teacher_id FROM courses WHERE id = ? AND school_id = ?'
  ).bind(courseId, user.school_id).first<{ id: string; teacher_id: string }>();
  if (!course) return c.json({ success: false, code: ERROR_CODES.NOT_FOUND, message: 'Course not found' }, 404);
  if (user.role === 'teacher' && course.teacher_id !== user.id) {
    return c.json({ success: false, code: ERROR_CODES.FORBIDDEN, message: 'Not your course' }, 403);
  }

  const updates: string[] = [];
  const values: (string | number | null)[] = [];
  const d = parsed.data;
  if (d.title !== undefined) { updates.push('title = ?'); values.push(d.title); }
  if (d.type !== undefined) { updates.push('type = ?'); values.push(d.type); }
  if (d.content !== undefined) { updates.push('content = ?'); values.push(d.content); }
  if (d.video_url !== undefined) { updates.push('video_url = ?'); values.push(d.video_url ?? null); }
  if (d.duration_minutes !== undefined) { updates.push('duration_minutes = ?'); values.push(d.duration_minutes); }
  if (d.sort_order !== undefined) { updates.push('sort_order = ?'); values.push(d.sort_order); }

  if (updates.length === 0) return c.json({ success: true, data: { id: lessonId, updated: false } });

  updates.push('updated_at = ?');
  values.push(nowISO());
  values.push(lessonId);

  await c.env.DB.prepare(
    `UPDATE lessons SET ${updates.join(', ')} WHERE id = ?`
  ).bind(...values).run();

  return c.json({ success: true, data: { id: lessonId, updated: true } });
});

courses.delete('/:courseId/modules/:moduleId/lessons/:lessonId', requireRole('admin', 'teacher'), async (c) => {
  const user = c.get('user');
  const courseId = c.req.param('courseId');
  const lessonId = c.req.param('lessonId');

  const course = await c.env.DB.prepare(
    'SELECT id, teacher_id FROM courses WHERE id = ? AND school_id = ?'
  ).bind(courseId, user.school_id).first<{ id: string; teacher_id: string }>();
  if (!course) return c.json({ success: false, code: ERROR_CODES.NOT_FOUND, message: 'Course not found' }, 404);
  if (user.role === 'teacher' && course.teacher_id !== user.id) {
    return c.json({ success: false, code: ERROR_CODES.FORBIDDEN, message: 'Not your course' }, 403);
  }

  await c.env.DB.prepare('DELETE FROM lessons WHERE id = ?').bind(lessonId).run();
  return c.json({ success: true, data: { id: lessonId, deleted: true } });
});

// ── Get single lesson ──
courses.get('/:courseId/lessons/:lessonId', async (c) => {
  const user = c.get('user');
  const courseId = c.req.param('courseId');
  const lessonId = c.req.param('lessonId');

  const course = await c.env.DB.prepare(
    'SELECT id, status, teacher_id FROM courses WHERE id = ? AND school_id = ?'
  ).bind(courseId, user.school_id).first<{ id: string; status: string; teacher_id: string }>();
  if (!course) return c.json({ success: false, code: ERROR_CODES.NOT_FOUND, message: 'Course not found' }, 404);

  const isOwner = user.role === 'admin' || course.teacher_id === user.id;
  if (!isOwner) {
    const enrollment = await c.env.DB.prepare(
      "SELECT id FROM enrollments WHERE user_id = ? AND course_id = ? AND status = 'active'"
    ).bind(user.id, courseId).first();
    if (!enrollment) {
      return c.json({ success: false, code: ERROR_CODES.FORBIDDEN, message: 'Not enrolled in this course' }, 403);
    }
  }

  const lesson = await c.env.DB.prepare(
    `SELECT l.* FROM lessons l
     JOIN modules m ON l.module_id = m.id
     WHERE l.id = ? AND m.course_id = ?`
  ).bind(lessonId, courseId).first<Lesson>();

  if (!lesson) return c.json({ success: false, code: ERROR_CODES.NOT_FOUND, message: 'Lesson not found' }, 404);

  const progress = await c.env.DB.prepare(
    'SELECT * FROM lesson_progress WHERE user_id = ? AND lesson_id = ?'
  ).bind(user.id, lessonId).first();

  return c.json({ success: true, data: { lesson, progress: progress ?? null } });
});

// ── Update lesson progress ──
courses.post('/:courseId/lessons/:lessonId/progress', async (c) => {
  const user = c.get('user');
  const courseId = c.req.param('courseId');
  const lessonId = c.req.param('lessonId');
  const body = await c.req.json();
  const parsed = updateProgressSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ success: false, code: ERROR_CODES.VALIDATION_ERROR, message: parsed.error.issues[0]?.message ?? 'Invalid input' }, 400);
  }

  const enrollment = await c.env.DB.prepare(
    "SELECT id FROM enrollments WHERE user_id = ? AND course_id = ? AND status = 'active'"
  ).bind(user.id, courseId).first();
  if (!enrollment) {
    return c.json({ success: false, code: ERROR_CODES.FORBIDDEN, message: 'Not enrolled' }, 403);
  }

  const lesson = await c.env.DB.prepare(
    `SELECT l.id FROM lessons l JOIN modules m ON l.module_id = m.id WHERE l.id = ? AND m.course_id = ?`
  ).bind(lessonId, courseId).first();
  if (!lesson) return c.json({ success: false, code: ERROR_CODES.NOT_FOUND, message: 'Lesson not found' }, 404);

  const existing = await c.env.DB.prepare(
    'SELECT id FROM lesson_progress WHERE user_id = ? AND lesson_id = ?'
  ).bind(user.id, lessonId).first<{ id: string }>();

  const completedAt = parsed.data.status === 'completed' ? nowISO() : null;

  if (existing) {
    await c.env.DB.prepare(
      'UPDATE lesson_progress SET status = ?, completed_at = ? WHERE id = ?'
    ).bind(parsed.data.status, completedAt, existing.id).run();
  } else {
    const id = generateId();
    await c.env.DB.prepare(
      'INSERT INTO lesson_progress (id, user_id, lesson_id, status, completed_at) VALUES (?, ?, ?, ?, ?)'
    ).bind(id, user.id, lessonId, parsed.data.status, completedAt).run();
  }

  return c.json({ success: true, data: { status: parsed.data.status } });
});

// ── Reviews ──
courses.post('/:id/reviews', async (c) => {
  const user = c.get('user');
  const courseId = c.req.param('id');
  const body = await c.req.json();
  const parsed = createReviewSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ success: false, code: ERROR_CODES.VALIDATION_ERROR, message: parsed.error.issues[0]?.message ?? 'Invalid input' }, 400);
  }

  const enrollment = await c.env.DB.prepare(
    "SELECT id FROM enrollments WHERE user_id = ? AND course_id = ? AND status != 'cancelled'"
  ).bind(user.id, courseId).first();
  if (!enrollment) {
    return c.json({ success: false, code: ERROR_CODES.FORBIDDEN, message: 'Must be enrolled to review' }, 403);
  }

  const existing = await c.env.DB.prepare(
    'SELECT id FROM course_reviews WHERE user_id = ? AND course_id = ?'
  ).bind(user.id, courseId).first<{ id: string }>();

  if (existing) {
    await c.env.DB.prepare(
      'UPDATE course_reviews SET rating = ?, text = ? WHERE id = ?'
    ).bind(parsed.data.rating, parsed.data.text, existing.id).run();
    return c.json({ success: true, data: { id: existing.id, updated: true } });
  }

  const id = generateId();
  await c.env.DB.prepare(
    'INSERT INTO course_reviews (id, user_id, course_id, rating, text, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(id, user.id, courseId, parsed.data.rating, parsed.data.text, nowISO()).run();

  return c.json({ success: true, data: { id, created: true } }, 201);
});

// ── File Upload (max 10MB, stored in KV) ──
courses.post('/:courseId/modules/:moduleId/lessons/:lessonId/file', requireRole('admin', 'teacher'), async (c) => {
  const user = c.get('user');
  const courseId = c.req.param('courseId');
  const lessonId = c.req.param('lessonId');

  const course = await c.env.DB.prepare(
    'SELECT id, teacher_id FROM courses WHERE id = ? AND school_id = ?'
  ).bind(courseId, user.school_id).first<{ id: string; teacher_id: string }>();
  if (!course) return c.json({ success: false, code: ERROR_CODES.NOT_FOUND, message: 'Course not found' }, 404);
  if (user.role === 'teacher' && course.teacher_id !== user.id) {
    return c.json({ success: false, code: ERROR_CODES.FORBIDDEN, message: 'Not your course' }, 403);
  }

  const contentType = c.req.header('content-type') ?? '';
  let fileData: ArrayBuffer;
  let fileName: string;
  let fileMime: string;

  if (contentType.includes('multipart/form-data')) {
    const formData = await c.req.formData();
    const file = formData.get('file') as File | null;
    if (!file) return c.json({ success: false, code: ERROR_CODES.VALIDATION_ERROR, message: 'No file provided' }, 400);
    if (file.size > 10 * 1024 * 1024) return c.json({ success: false, code: ERROR_CODES.VALIDATION_ERROR, message: 'File too large (max 10MB)' }, 400);
    fileData = await file.arrayBuffer();
    fileName = file.name;
    fileMime = file.type || 'application/octet-stream';
  } else {
    const body = await c.req.json() as { name: string; data: string; mime?: string };
    if (!body.name || !body.data) return c.json({ success: false, code: ERROR_CODES.VALIDATION_ERROR, message: 'name and data (base64) required' }, 400);
    const raw = Uint8Array.from(atob(body.data), ch => ch.charCodeAt(0));
    if (raw.length > 10 * 1024 * 1024) return c.json({ success: false, code: ERROR_CODES.VALIDATION_ERROR, message: 'File too large (max 10MB)' }, 400);
    fileData = raw.buffer;
    fileName = body.name;
    fileMime = body.mime || 'application/octet-stream';
  }

  const fileId = generateId();
  const kvKey = `file:${fileId}`;
  await c.env.KV.put(kvKey, fileData, { metadata: { name: fileName, mime: fileMime, lessonId, uploadedBy: user.id, uploadedAt: nowISO() } });

  // Save file reference in lesson
  const fileUrl = `/api/courses/files/${fileId}`;
  await c.env.DB.prepare(
    'UPDATE lessons SET file_url = ?, file_name = ?, updated_at = ? WHERE id = ?'
  ).bind(fileUrl, fileName, nowISO(), lessonId).run();

  return c.json({ success: true, data: { file_id: fileId, file_url: fileUrl, file_name: fileName } });
});

// ── Serve file ──
courses.get('/files/:fileId', async (c) => {
  const fileId = c.req.param('fileId');
  const kvKey = `file:${fileId}`;
  const { value, metadata } = await c.env.KV.getWithMetadata<{ name: string; mime: string }>(kvKey, 'arrayBuffer');
  if (!value || !metadata) return c.json({ success: false, code: ERROR_CODES.NOT_FOUND, message: 'File not found' }, 404);

  return new Response(value as ArrayBuffer, {
    headers: {
      'Content-Type': metadata.mime,
      'Content-Disposition': `inline; filename="${encodeURIComponent(metadata.name)}"`,
      'Cache-Control': 'public, max-age=86400',
    },
  });
});

// ── Delete file ──
courses.delete('/:courseId/modules/:moduleId/lessons/:lessonId/file', requireRole('admin', 'teacher'), async (c) => {
  const user = c.get('user');
  const courseId = c.req.param('courseId');
  const lessonId = c.req.param('lessonId');

  const course = await c.env.DB.prepare(
    'SELECT id, teacher_id FROM courses WHERE id = ? AND school_id = ?'
  ).bind(courseId, user.school_id).first<{ id: string; teacher_id: string }>();
  if (!course) return c.json({ success: false, code: ERROR_CODES.NOT_FOUND, message: 'Course not found' }, 404);
  if (user.role === 'teacher' && course.teacher_id !== user.id) {
    return c.json({ success: false, code: ERROR_CODES.FORBIDDEN, message: 'Not your course' }, 403);
  }

  const lesson = await c.env.DB.prepare('SELECT file_url FROM lessons WHERE id = ?').bind(lessonId).first<{ file_url: string | null }>();
  if (lesson?.file_url) {
    const fileId = lesson.file_url.split('/').pop();
    if (fileId) await c.env.KV.delete(`file:${fileId}`);
  }

  await c.env.DB.prepare('UPDATE lessons SET file_url = NULL, file_name = NULL, updated_at = ? WHERE id = ?').bind(nowISO(), lessonId).run();
  return c.json({ success: true, data: { deleted: true } });
});

export default courses;
