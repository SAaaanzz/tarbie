// Страница курса: описание, программа (модули/уроки), запись на курс.
import { useEffect, useState } from 'react';
import { useAuthStore } from '../store/auth';
import { api } from '../lib/api';
import { navigate } from '../lib/router';
import {
  ArrowLeft, BookOpen, Star, Clock, FileText, Video,
  ChevronDown, ChevronUp, Loader2, Send,
} from 'lucide-react';
import { Avatar } from '../components/Avatar';
import type { Lang } from '@tarbie/shared';

interface LessonRow {
  id: string;
  module_id: string;
  title: string;
  type: string;
  duration_minutes: number;
  sort_order: number;
}

interface ModuleRow {
  id: string;
  title: string;
  sort_order: number;
  lessons: LessonRow[];
}

interface ReviewRow {
  id: string;
  user_id: string;
  rating: number;
  text: string;
  created_at: string;
  user_name: string;
  user_avatar_url: string | null;
}

interface CourseDetail {
  id: string;
  title: string;
  description: string;
  teacher_id: string;
  price: number;
  status: string;
  cover_url: string | null;
  created_at: string;
  teacher_name: string;
  teacher_avatar_url: string | null;
  category_name: string | null;
  enrolled_count: number;
  avg_rating: number | null;
  modules_count: number;
  lessons_count: number;
}

interface ProgressInfo {
  total_lessons: number;
  completed_lessons: number;
  progress_percent: number;
}

interface EnrollmentRow {
  id: string;
  status: string;
}

const t = (lang: Lang, kz: string, ru: string) => lang === 'kz' ? kz : ru;

function lessonIcon(type: string) {
  if (type === 'video') return <Video size={16} className="text-blue-500" />;
  return <FileText size={16} className="text-gray-500" />;
}

export function CourseDetailPage({ courseId }: { courseId: string }) {
  const { lang, user } = useAuthStore();
  const [course, setCourse] = useState<CourseDetail | null>(null);
  const [modules, setModules] = useState<ModuleRow[]>([]);
  const [enrollment, setEnrollment] = useState<EnrollmentRow | null>(null);
  const [progress, setProgress] = useState<ProgressInfo | null>(null);
  const [reviews, setReviews] = useState<ReviewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [enrolling, setEnrolling] = useState(false);
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set());
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewText, setReviewText] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);

  const load = () => {
    setLoading(true);
    api.get<{
      course: CourseDetail;
      modules: ModuleRow[];
      enrollment: EnrollmentRow | null;
      progress: ProgressInfo | null;
      reviews: ReviewRow[];
    }>(`/api/courses/${courseId}`)
      .then((res) => {
        setCourse(res.course);
        setModules(res.modules);
        setEnrollment(res.enrollment);
        setProgress(res.progress);
        setReviews(res.reviews);
        const all = new Set(res.modules.map(m => m.id));
        setExpandedModules(all);
      })
      .catch(() => navigate('/courses'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [courseId]);

  const handleEnroll = async () => {
    setEnrolling(true);
    try {
      await api.post(`/api/courses/${courseId}/enroll`);
      load();
    } catch { }
    setEnrolling(false);
  };

  const handleReview = async () => {
    setSubmittingReview(true);
    try {
      await api.post(`/api/courses/${courseId}/reviews`, { rating: reviewRating, text: reviewText });
      setReviewText('');
      load();
    } catch { }
    setSubmittingReview(false);
  };

  const toggleModule = (id: string) => {
    setExpandedModules(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={32} className="animate-spin text-primary-600" />
      </div>
    );
  }

  if (!course) return null;

  const isOwner = user?.role === 'admin' || course.teacher_id === user?.id;
  const isEnrolled = enrollment && enrollment.status !== 'cancelled';
  const totalDuration = modules.reduce((sum, m) => sum + m.lessons.reduce((s, l) => s + l.duration_minutes, 0), 0);

  return (
    <div className="space-y-6">
      {/* Back button */}
      <button onClick={() => navigate('/courses')} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
        <ArrowLeft size={16} />
        {t(lang, 'Каталогқа оралу', 'Назад к каталогу')}
      </button>

      {/* Hero section */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="h-48 bg-gradient-to-br from-primary-100 via-primary-50 to-accent-50 flex items-center justify-center">
          {course.cover_url ? (
            <img src={course.cover_url} alt={course.title} className="h-full w-full object-cover" />
          ) : (
            <BookOpen size={64} className="text-primary-300" />
          )}
        </div>

        <div className="p-6 space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
            <div className="space-y-2 flex-1">
              {course.category_name && (
                <span className="inline-flex rounded-full bg-primary-50 px-2.5 py-0.5 text-xs font-medium text-primary-700">
                  {course.category_name}
                </span>
              )}
              <h1 className="text-2xl font-bold text-gray-900">{course.title}</h1>
              <p className="text-gray-600">{course.description}</p>

              {/* Teacher info */}
              <div className="flex items-center gap-2 pt-2">
                <Avatar name={course.teacher_name} size="sm" avatarUrl={course.teacher_avatar_url} />
                <div>
                  <p className="text-sm font-medium text-gray-900">{course.teacher_name}</p>
                  <p className="text-xs text-gray-500">{t(lang, 'Оқытушы', 'Преподаватель')}</p>
                </div>
              </div>
            </div>

            {/* Stats + CTA */}
            <div className="lg:w-72 shrink-0 space-y-4">
              <div className="rounded-lg border border-gray-200 p-4 space-y-3">
                <div className="grid grid-cols-2 gap-3 text-center">
                  <div>
                    <p className="text-lg font-bold text-gray-900">{course.lessons_count}</p>
                    <p className="text-xs text-gray-500">{t(lang, 'Сабақтар', 'Уроков')}</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-gray-900">{course.modules_count}</p>
                    <p className="text-xs text-gray-500">{t(lang, 'Модульдер', 'Модулей')}</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-gray-900">{course.enrolled_count}</p>
                    <p className="text-xs text-gray-500">{t(lang, 'Студенттер', 'Студентов')}</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-gray-900">
                      {totalDuration > 0 ? `${totalDuration}` : '—'}
                    </p>
                    <p className="text-xs text-gray-500">{t(lang, 'мин', 'мин')}</p>
                  </div>
                </div>

                {course.avg_rating && (
                  <div className="flex items-center justify-center gap-1 text-amber-500">
                    <Star size={16} fill="currentColor" />
                    <span className="font-semibold">{Number(course.avg_rating).toFixed(1)}</span>
                    <span className="text-xs text-gray-400">({reviews.length})</span>
                  </div>
                )}

                {/* Enroll / Go to lesson */}
                {isOwner ? (
                  <button
                    className="btn-primary w-full text-sm"
                    onClick={() => navigate(`/courses/builder?id=${courseId}`)}
                  >
                    {t(lang, 'Өңдеу', 'Редактировать')}
                  </button>
                ) : isEnrolled ? (
                  <div className="space-y-2">
                    {progress && (
                      <div>
                        <div className="flex items-center justify-between text-xs text-gray-600 mb-1">
                          <span>{t(lang, 'Прогресс', 'Прогресс')}</span>
                          <span>{progress.progress_percent}%</span>
                        </div>
                        <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-primary-500 transition-all"
                            style={{ width: `${progress.progress_percent}%` }}
                          />
                        </div>
                      </div>
                    )}
                    <button
                      className="btn-primary w-full text-sm"
                      onClick={() => {
                        const firstLesson = modules[0]?.lessons[0];
                        if (firstLesson) navigate(`/courses/${courseId}/lessons/${firstLesson.id}`);
                      }}
                    >
                      {t(lang, 'Оқуды жалғастыру', 'Продолжить обучение')}
                    </button>
                  </div>
                ) : (
                  <button
                    className="btn-primary w-full text-sm"
                    onClick={handleEnroll}
                    disabled={enrolling}
                  >
                    {enrolling ? (
                      <Loader2 size={16} className="animate-spin mr-1.5" />
                    ) : null}
                    {course.price > 0
                      ? `${t(lang, 'Жазылу', 'Записаться')} — ${course.price}₸`
                      : t(lang, 'Тегін жазылу', 'Записаться бесплатно')}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Course Program */}
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="text-lg font-bold text-gray-900 mb-4">
          {t(lang, 'Курс бағдарламасы', 'Программа курса')}
        </h2>

        {modules.length === 0 ? (
          <p className="text-sm text-gray-400 py-4 text-center">
            {t(lang, 'Модульдер жоқ', 'Модулей пока нет')}
          </p>
        ) : (
          <div className="space-y-2">
            {modules.map((mod, mi) => (
              <div key={mod.id} className="border border-gray-100 rounded-lg overflow-hidden">
                <button
                  onClick={() => toggleModule(mod.id)}
                  className="flex w-full items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-50 text-xs font-bold text-primary-700">
                      {mi + 1}
                    </span>
                    <span className="text-sm font-medium text-gray-900">{mod.title}</span>
                    <span className="text-xs text-gray-400">
                      {mod.lessons.length} {t(lang, 'сабақ', 'уроков')}
                    </span>
                  </div>
                  {expandedModules.has(mod.id) ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
                </button>

                {expandedModules.has(mod.id) && mod.lessons.length > 0 && (
                  <div className="border-t border-gray-100">
                    {mod.lessons.map((lesson) => (
                      <button
                        key={lesson.id}
                        onClick={() => {
                          if (isEnrolled || isOwner) navigate(`/courses/${courseId}/lessons/${lesson.id}`);
                        }}
                        disabled={!isEnrolled && !isOwner}
                        className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {lessonIcon(lesson.type)}
                        <span className="flex-1 text-sm text-gray-700">{lesson.title}</span>
                        {lesson.duration_minutes > 0 && (
                          <span className="flex items-center gap-1 text-xs text-gray-400">
                            <Clock size={12} /> {lesson.duration_minutes} {t(lang, 'мин', 'мин')}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Reviews */}
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="text-lg font-bold text-gray-900 mb-4">
          {t(lang, 'Пікірлер', 'Отзывы')} ({reviews.length})
        </h2>

        {/* Add review */}
        {isEnrolled && (
          <div className="mb-6 rounded-lg border border-gray-100 p-4 space-y-3">
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4, 5].map(n => (
                <button key={n} onClick={() => setReviewRating(n)}>
                  <Star size={20} className={n <= reviewRating ? 'text-amber-400 fill-amber-400' : 'text-gray-300'} />
                </button>
              ))}
            </div>
            <textarea
              className="input-field text-sm"
              rows={2}
              placeholder={t(lang, 'Пікіріңізді жазыңыз...', 'Напишите отзыв...')}
              value={reviewText}
              onChange={(e) => setReviewText(e.target.value)}
            />
            <button className="btn-primary text-sm" onClick={handleReview} disabled={submittingReview}>
              {submittingReview ? <Loader2 size={14} className="animate-spin mr-1" /> : <Send size={14} className="mr-1" />}
              {t(lang, 'Жіберу', 'Отправить')}
            </button>
          </div>
        )}

        {reviews.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">
            {t(lang, 'Пікірлер жоқ', 'Отзывов пока нет')}
          </p>
        ) : (
          <div className="space-y-4">
            {reviews.map((r) => (
              <div key={r.id} className="flex gap-3">
                <Avatar name={r.user_name} size="sm" avatarUrl={r.user_avatar_url} />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900">{r.user_name}</span>
                    <div className="flex items-center gap-0.5">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star key={i} size={12} className={i < r.rating ? 'text-amber-400 fill-amber-400' : 'text-gray-200'} />
                      ))}
                    </div>
                    <span className="text-xs text-gray-400">{new Date(r.created_at).toLocaleDateString()}</span>
                  </div>
                  {r.text && <p className="mt-1 text-sm text-gray-600">{r.text}</p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
