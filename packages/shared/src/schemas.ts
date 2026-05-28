import { z } from 'zod';

const phoneRegex = /^\+7\d{10}$/;

export const langSchema = z.enum(['kz', 'ru']);
export const roleSchema = z.enum(['admin', 'teacher', 'student']);
export const sessionStatusSchema = z.enum(['pending_approval', 'planned', 'completed', 'cancelled', 'rescheduled']);
export const attendanceStatusSchema = z.enum(['present', 'absent', 'late', 'excused']);
export const gradeStatusSchema = z.enum(['present', 'absent', 'makeup']);
export const notificationChannelSchema = z.enum(['telegram', 'whatsapp']);
export const notificationEventTypeSchema = z.enum([
  'SESSION_PLANNED',
  'SESSION_REMINDER',
  'SESSION_COMPLETED',
  'SESSION_RESCHEDULED',
  'ABSENCE_ALERT',
  'TOPIC_REMINDER',
]);

export const loginSchema = z.object({
  phone: z.string().regex(phoneRegex, 'Phone must be in +7XXXXXXXXXX format'),
});

export const verifyOtpSchema = z.object({
  phone: z.string().regex(phoneRegex, 'Phone must be in +7XXXXXXXXXX format'),
  otp: z.string().length(6, 'OTP must be 6 digits').regex(/^\d{6}$/, 'OTP must contain only digits'),
});

export const createSessionSchema = z.object({
  class_id: z.string().uuid(),
  topic: z.string().min(1).max(500),
  planned_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  time_slot: z.string().regex(/^\d{2}:\d{2}$/, 'Time slot must be HH:MM'),
  room: z.string().min(1).max(50),
  duration_minutes: z.number().int().min(15).max(180).default(30),
  notes: z.string().max(2000).nullable().optional(),
});

export const updateSessionSchema = z.object({
  topic: z.string().min(1).max(500).optional(),
  planned_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD').optional(),
  time_slot: z.string().regex(/^\d{2}:\d{2}$/, 'Time slot must be HH:MM').optional(),
  room: z.string().min(1).max(50).optional(),
  duration_minutes: z.number().int().min(15).max(180).optional(),
  notes: z.string().max(2000).nullable().optional(),
  status: sessionStatusSchema.optional(),
});

export const completeSessionSchema = z.object({
  actual_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD').optional(),
  notes: z.string().max(2000).nullable().optional(),
  attachment_url: z.string().url().nullable().optional(),
});

export const attendanceEntrySchema = z.object({
  student_id: z.string().uuid(),
  status: attendanceStatusSchema,
});

export const bulkAttendanceSchema = z.object({
  attendance: z.array(attendanceEntrySchema).min(1),
});

export const createUserSchema = z.object({
  full_name: z.string().min(2).max(200),
  role: roleSchema,
  phone: z.string().regex(phoneRegex, 'Phone must be in +7XXXXXXXXXX format'),
  lang: langSchema.default('ru'),
  telegram_chat_id: z.string().nullable().optional(),
  whatsapp_number: z.string().nullable().optional(),
});

export const createClassSchema = z.object({
  name: z.string().min(1).max(20),
  teacher_id: z.string().uuid(),
  academic_year: z.string().regex(/^\d{4}-\d{4}$/, 'Must be YYYY-YYYY format'),
});

export const sessionsQuerySchema = z.object({
  classId: z.string().uuid().optional(),
  month: z.string().regex(/^\d{4}-\d{2}$/, 'Must be YYYY-MM format').optional(),
  status: sessionStatusSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(2500).default(50),
});

export const monthlyReportQuerySchema = z.object({
  classId: z.string().uuid(),
  month: z.string().regex(/^\d{4}-\d{2}$/, 'Must be YYYY-MM format'),
});

export const sendNotificationSchema = z.object({
  session_id: z.string().uuid(),
  event_type: notificationEventTypeSchema,
  user_ids: z.array(z.string().uuid()).min(1).optional(),
});

export const notificationLogQuerySchema = z.object({
  userId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const updateNotificationTemplateSchema = z.object({
  template_text: z.string().min(1).max(2000),
});

export const schoolSchema = z.object({
  name: z.string().min(2).max(300),
  bin: z.string().length(12, 'BIN must be 12 digits').regex(/^\d{12}$/, 'BIN must contain only digits'),
  city: z.string().min(2).max(100),
});

export const gradeEntrySchema = z.object({
  student_id: z.string().uuid(),
  status: gradeStatusSchema,
  grade: z.number().int().min(0).max(100).nullable(),
  comment: z.string().max(500).nullable().optional(),
});

export const bulkGradeSchema = z.object({
  grades: z.array(gradeEntrySchema).min(1),
});

export const courseStatusSchema = z.enum(['draft', 'published', 'archived']);
export const lessonTypeSchema = z.enum(['video', 'text']);
export const enrollmentStatusSchema = z.enum(['active', 'completed', 'cancelled']);
export const lessonProgressStatusSchema = z.enum(['not_started', 'in_progress', 'completed']);

export const createCourseSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().max(5000).default(''),
  category_id: z.string().nullable().optional(),
  price: z.number().min(0).default(0),
  cover_url: z.string().url().nullable().optional(),
  lang: langSchema.default('ru'),
});

export const updateCourseSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().max(5000).optional(),
  category_id: z.string().nullable().optional(),
  price: z.number().min(0).optional(),
  status: courseStatusSchema.optional(),
  cover_url: z.string().url().nullable().optional(),
  lang: langSchema.optional(),
});

export const createModuleSchema = z.object({
  title: z.string().min(1).max(300),
  sort_order: z.number().int().min(0).default(0),
});

export const updateModuleSchema = z.object({
  title: z.string().min(1).max(300).optional(),
  sort_order: z.number().int().min(0).optional(),
});

export const createLessonSchema = z.object({
  title: z.string().min(1).max(500),
  type: lessonTypeSchema.default('text'),
  content: z.string().max(50000).default(''),
  video_url: z.string().url().nullable().optional(),
  duration_minutes: z.number().int().min(0).default(0),
  sort_order: z.number().int().min(0).default(0),
});

export const updateLessonSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  type: lessonTypeSchema.optional(),
  content: z.string().max(50000).optional(),
  video_url: z.string().url().nullable().optional(),
  duration_minutes: z.number().int().min(0).optional(),
  sort_order: z.number().int().min(0).optional(),
});

export const coursesQuerySchema = z.object({
  categoryId: z.string().optional(),
  status: courseStatusSchema.optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const createReviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  text: z.string().max(2000).default(''),
});

export const updateProgressSchema = z.object({
  status: lessonProgressStatusSchema,
});
