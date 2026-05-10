export type Role = 'admin' | 'teacher' | 'student' | 'parent';
export type Lang = 'kz' | 'ru';
export type SessionStatus = 'planned' | 'completed' | 'cancelled' | 'rescheduled';
export type AttendanceStatus = 'present' | 'absent' | 'late' | 'excused';
export type NotificationChannel = 'telegram' | 'whatsapp';
export type NotificationStatus = 'sent' | 'failed' | 'pending' | 'dead_letter';
export type NotificationEventType =
  | 'SESSION_PLANNED'
  | 'SESSION_REMINDER'
  | 'SESSION_COMPLETED'
  | 'SESSION_RESCHEDULED'
  | 'ABSENCE_ALERT'
  | 'TOPIC_REMINDER';

export interface School {
  id: string;
  name: string;
  bin: string;
  city: string;
  created_at: string;
}

export interface User {
  id: string;
  school_id: string;
  full_name: string;
  role: Role;
  phone: string;
  telegram_chat_id: string | null;
  whatsapp_number: string | null;
  lang: Lang;
  avatar_url: string | null;
  premium: number;
  premium_expires_at: string | null;
  premium_frame: string | null;
  premium_name_color: string | null;
  created_at: string;
}

export interface Class {
  id: string;
  school_id: string;
  name: string;
  teacher_id: string;
  academic_year: string;
}

export interface TarbieSession {
  id: string;
  class_id: string;
  teacher_id: string;
  topic: string;
  planned_date: string;
  actual_date: string | null;
  status: SessionStatus;
  duration_minutes: number;
  room: string | null;
  time_slot: string | null;
  notes: string | null;
  attachment_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface SessionAttendance {
  id: string;
  session_id: string;
  student_id: string;
  status: AttendanceStatus;
  marked_at: string;
}

export interface NotificationLog {
  id: string;
  user_id: string;
  session_id: string | null;
  channel: NotificationChannel;
  message_text: string;
  sent_at: string;
  status: NotificationStatus;
  error_msg: string | null;
}

export interface NotificationTemplate {
  id: string;
  school_id: string;
  event_type: NotificationEventType;
  lang: Lang;
  template_text: string;
}

export type GradeStatus = 'present' | 'absent' | 'makeup';

export interface Grade {
  id: string;
  session_id: string;
  student_id: string;
  status: GradeStatus;
  grade: number | null;
  comment: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface GradeWithMeta extends Grade {
  student_name: string;
  topic?: string;
  planned_date?: string;
  class_name?: string;
}

export interface MonthlyStudentAverage {
  student_id: string;
  student_name: string;
  total_sessions: number;
  attended: number;
  absent: number;
  makeup: number;
  sum_grades: number;
  average: number;
}

export interface ApiResponse<T = unknown> {
  success: true;
  data: T;
}

export interface ApiError {
  success: false;
  code: string;
  message: string;
}

export interface PaginatedResponse<T> {
  success: true;
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface JwtPayload {
  sub: string;
  role: Role;
  school_id: string;
  iat: number;
  exp: number;
}

export interface QueueMessage {
  event_type: NotificationEventType;
  session_id: string;
  user_ids: string[];
  template_vars: Record<string, string>;
  attempt: number;
}

export interface SessionRating {
  id: string;
  session_id: string;
  student_id: string;
  teacher_id: string;
  rating: number;
  reason: string | null;
  is_valid: number;
  filter_reason: string | null;
  is_anonymous: boolean;
  created_at: string;
}

export interface TeacherRatingStats {
  teacher_id: string;
  teacher_name: string;
  total_ratings: number;
  valid_ratings: number;
  average_rating: number;
  recent_reviews: { rating: number; reason: string; created_at: string; is_anonymous: boolean; student_name: string | null; student_avatar_url: string | null }[];
}

export type CourseStatus = 'draft' | 'published' | 'archived';
export type LessonType = 'video' | 'text';
export type EnrollmentStatus = 'active' | 'completed' | 'cancelled';
export type LessonProgressStatus = 'not_started' | 'in_progress' | 'completed';

export interface Category {
  id: string;
  name: string;
  slug: string;
  parent_id: string | null;
  created_at: string;
}

export interface Course {
  id: string;
  title: string;
  description: string;
  teacher_id: string;
  school_id: string;
  category_id: string | null;
  price: number;
  status: CourseStatus;
  cover_url: string | null;
  lang: Lang;
  created_at: string;
  updated_at: string;
}

export interface CourseWithMeta extends Course {
  teacher_name: string;
  teacher_avatar_url: string | null;
  category_name: string | null;
  enrolled_count: number;
  avg_rating: number | null;
  modules_count: number;
  lessons_count: number;
}

export interface Module {
  id: string;
  course_id: string;
  title: string;
  sort_order: number;
  created_at: string;
}

export interface Lesson {
  id: string;
  module_id: string;
  title: string;
  type: LessonType;
  content: string;
  video_url: string | null;
  file_url: string | null;
  file_name: string | null;
  duration_minutes: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface LessonWithProgress extends Lesson {
  progress_status: LessonProgressStatus;
}

export interface ModuleWithLessons extends Module {
  lessons: Lesson[];
}

export interface Enrollment {
  id: string;
  user_id: string;
  course_id: string;
  status: EnrollmentStatus;
  enrolled_at: string;
  completed_at: string | null;
}

export interface LessonProgress {
  id: string;
  user_id: string;
  lesson_id: string;
  status: LessonProgressStatus;
  completed_at: string | null;
}

export interface CourseReview {
  id: string;
  user_id: string;
  course_id: string;
  rating: number;
  text: string;
  created_at: string;
}

export interface CourseReviewWithUser extends CourseReview {
  user_name: string;
  user_avatar_url: string | null;
}

export interface CourseProgress {
  total_lessons: number;
  completed_lessons: number;
  progress_percent: number;
}

export interface MonthlyReport {
  class_id: string;
  class_name: string;
  month: string;
  total_planned: number;
  total_completed: number;
  total_cancelled: number;
  total_rescheduled: number;
  completion_rate: number;
  attendance_rate: number;
  sessions: TarbieSession[];
}
