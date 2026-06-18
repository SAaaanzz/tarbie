// Страница «Мои курсы»: курсы, на которые записан ученик, и их прогресс.
import { useEffect, useState } from 'react';
import { useAuthStore } from '../store/auth';
import { api } from '../lib/api';
import { navigate } from '../lib/router';
import { BookOpen, Loader2, Play } from 'lucide-react';
import { Avatar } from '../components/Avatar';
import type { Lang } from '@tarbie/shared';

interface EnrolledCourse {
  id: string;
  title: string;
  description: string;
  cover_url: string | null;
  teacher_name: string;
  teacher_avatar_url: string | null;
  category_name: string | null;
  lessons_count: number;
  completed_lessons: number;
  enrollment_status: string;
  enrolled_at: string;
}

const t = (lang: Lang, kz: string, ru: string) => lang === 'kz' ? kz : ru;

export function MyCoursesPage() {
  const { lang } = useAuthStore();
  const [courses, setCourses] = useState<EnrolledCourse[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<EnrolledCourse[]>('/api/courses/my/enrolled')
      .then((res) => setCourses(Array.isArray(res) ? res : []))
      .catch(() => setCourses([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={32} className="animate-spin text-primary-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {t(lang, 'Менің курстарым', 'Мои курсы')}
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            {t(lang, `${courses.length} курс`, `${courses.length} курсов`)}
          </p>
        </div>
        <button className="btn-secondary text-sm" onClick={() => navigate('/courses')}>
          <BookOpen size={16} className="mr-1.5" />
          {t(lang, 'Каталог', 'Каталог')}
        </button>
      </div>

      {courses.length === 0 ? (
        <div className="py-20 text-center text-gray-400">
          <BookOpen size={48} className="mx-auto mb-3" />
          <p className="text-lg font-medium">{t(lang, 'Сіз әлі курсқа жазылмадыңыз', 'Вы ещё не записались на курсы')}</p>
          <button className="mt-4 btn-primary text-sm" onClick={() => navigate('/courses')}>
            {t(lang, 'Каталогқа өту', 'Перейти в каталог')}
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {courses.map((course) => {
            const progressPercent = course.lessons_count > 0
              ? Math.round((course.completed_lessons / course.lessons_count) * 100)
              : 0;

            return (
              <div
                key={course.id}
                onClick={() => navigate(`/courses/${course.id}`)}
                className="group flex cursor-pointer items-center gap-4 rounded-xl border border-gray-200 bg-white p-4 transition-all hover:shadow-md hover:border-primary-200"
              >
                {/* Cover thumbnail */}
                <div className="hidden sm:flex h-20 w-28 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary-50 to-accent-50 overflow-hidden">
                  {course.cover_url ? (
                    <img src={course.cover_url} alt={course.title} className="h-full w-full object-cover" />
                  ) : (
                    <BookOpen size={24} className="text-primary-300" />
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      {course.category_name && (
                        <span className="inline-flex rounded-full bg-primary-50 px-2 py-0.5 text-[10px] font-medium text-primary-700 mb-1">
                          {course.category_name}
                        </span>
                      )}
                      <h3 className="text-sm font-semibold text-gray-900 group-hover:text-primary-700 transition-colors line-clamp-1">
                        {course.title}
                      </h3>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Avatar name={course.teacher_name} size="xs" avatarUrl={course.teacher_avatar_url} />
                    <span className="text-xs text-gray-500">{course.teacher_name}</span>
                  </div>

                  {/* Progress bar */}
                  <div>
                    <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                      <span>
                        {course.completed_lessons}/{course.lessons_count} {t(lang, 'сабақ', 'уроков')}
                      </span>
                      <span className="font-medium">{progressPercent}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          progressPercent >= 100 ? 'bg-green-500' : 'bg-primary-500'
                        }`}
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>
                  </div>
                </div>

                {/* Play button */}
                <div className="hidden sm:flex shrink-0">
                  <div className="rounded-full bg-primary-50 p-2.5 text-primary-600 group-hover:bg-primary-100 transition-colors">
                    <Play size={18} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
