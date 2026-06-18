// Страница «Каталог курсов»: список доступных курсов с поиском и фильтрами.
import { useEffect, useState } from 'react';
import { useAuthStore } from '../store/auth';
import { api } from '../lib/api';
import { navigate } from '../lib/router';
import { Search, BookOpen, Users, Star, Loader2, ChevronRight } from 'lucide-react';
import { Avatar } from '../components/Avatar';
import type { Lang } from '@tarbie/shared';

interface CourseRow {
  id: string;
  title: string;
  description: string;
  teacher_id: string;
  category_id: string | null;
  price: number;
  status: string;
  cover_url: string | null;
  lang: string;
  created_at: string;
  teacher_name: string;
  teacher_avatar_url: string | null;
  category_name: string | null;
  enrolled_count: number;
  avg_rating: number | null;
  modules_count: number;
  lessons_count: number;
}

interface CategoryRow {
  id: string;
  name: string;
  slug: string;
}

const t = (lang: Lang, kz: string, ru: string) => lang === 'kz' ? kz : ru;

export function CourseCatalogPage() {
  const { lang, user } = useAuthStore();
  const [courses, setCourses] = useState<CourseRow[]>([]);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const pageSize = 12;

  const loadCategories = () => {
    api.get<CategoryRow[]>('/api/courses/categories').then(setCategories).catch(() => {});
  };

  const loadCourses = () => {
    setLoading(true);
    const params: Record<string, string> = {
      page: String(page),
      pageSize: String(pageSize),
    };
    if (categoryFilter !== 'all') params.categoryId = categoryFilter;
    if (search.trim()) params.search = search.trim();

    api.get<CourseRow[]>('/api/courses', params)
      .then((res) => {
        const arr = Array.isArray(res) ? res : [];
        setCourses(arr);
        setHasMore(arr.length >= pageSize);
      })
      .catch(() => setCourses([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadCategories(); }, []);
  useEffect(() => { loadCourses(); }, [page, categoryFilter, search]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {t(lang, 'Курстар каталогы', 'Каталог курсов')}
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            {t(lang, 'Білім алу үшін курсты таңдаңыз', 'Выберите курс для обучения')}
          </p>
        </div>
        {(user?.role === 'admin' || user?.role === 'teacher') && (
          <button className="btn-primary text-sm" onClick={() => navigate('/courses/builder')}>
            <BookOpen size={16} className="mr-1.5" />
            {t(lang, 'Курс құру', 'Создать курс')}
          </button>
        )}
      </div>

      {/* Search + Category Filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            className="input-field pl-9 text-sm"
            placeholder={t(lang, 'Курсты іздеу...', 'Поиск курса...')}
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        <div className="flex gap-1 rounded-lg bg-gray-100 p-1 overflow-x-auto scrollbar-hide">
          <button
            onClick={() => { setCategoryFilter('all'); setPage(1); }}
            className={`shrink-0 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              categoryFilter === 'all' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t(lang, 'Бәрі', 'Все')}
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => { setCategoryFilter(cat.id); setPage(1); }}
              className={`shrink-0 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                categoryFilter === cat.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>
      </div>

      {/* Course Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={32} className="animate-spin text-primary-600" />
        </div>
      ) : courses.length === 0 ? (
        <div className="py-20 text-center text-gray-400">
          <BookOpen size={48} className="mx-auto mb-3" />
          <p className="text-lg font-medium">
            {search ? t(lang, 'Курстар табылмады', 'Курсы не найдены') : t(lang, 'Курстар жоқ', 'Курсов пока нет')}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {courses.map((course) => (
            <CourseCard key={course.id} course={course} lang={lang} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {(page > 1 || hasMore) && (
        <div className="flex items-center justify-center gap-2">
          <button
            disabled={page <= 1}
            onClick={() => setPage(p => p - 1)}
            className="rounded-lg border px-3 py-1.5 text-sm disabled:opacity-40"
          >
            ←
          </button>
          <span className="text-sm text-gray-600">{t(lang, 'Бет', 'Страница')} {page}</span>
          <button
            disabled={!hasMore}
            onClick={() => setPage(p => p + 1)}
            className="rounded-lg border px-3 py-1.5 text-sm disabled:opacity-40"
          >
            →
          </button>
        </div>
      )}
    </div>
  );
}

function CourseCard({ course, lang }: { course: CourseRow; lang: Lang }) {
  return (
    <div
      onClick={() => navigate(`/courses/${course.id}`)}
      className="group cursor-pointer overflow-hidden rounded-xl border border-gray-200 bg-white transition-all hover:shadow-lg hover:border-primary-200"
    >
      {/* Cover */}
      <div className="h-40 bg-gradient-to-br from-primary-100 via-primary-50 to-accent-50 flex items-center justify-center">
        {course.cover_url ? (
          <img src={course.cover_url} alt={course.title} className="h-full w-full object-cover" />
        ) : (
          <BookOpen size={48} className="text-primary-300" />
        )}
      </div>

      <div className="p-4 space-y-3">
        {/* Category badge */}
        {course.category_name && (
          <span className="inline-flex rounded-full bg-primary-50 px-2 py-0.5 text-xs font-medium text-primary-700">
            {course.category_name}
          </span>
        )}

        <h3 className="text-base font-semibold text-gray-900 line-clamp-2 group-hover:text-primary-700 transition-colors">
          {course.title}
        </h3>

        <p className="text-sm text-gray-500 line-clamp-2">
          {course.description || t(lang, 'Сипаттама жоқ', 'Без описания')}
        </p>

        {/* Teacher */}
        <div className="flex items-center gap-2">
          <Avatar name={course.teacher_name} size="xs" avatarUrl={course.teacher_avatar_url} />
          <span className="text-xs text-gray-600">{course.teacher_name}</span>
        </div>

        {/* Stats row */}
        <div className="flex items-center justify-between border-t border-gray-100 pt-3">
          <div className="flex items-center gap-3 text-xs text-gray-500">
            <span className="flex items-center gap-1">
              <Users size={13} />
              {course.enrolled_count}
            </span>
            <span className="flex items-center gap-1">
              <BookOpen size={13} />
              {course.lessons_count} {t(lang, 'сабақ', 'уроков')}
            </span>
            {course.avg_rating && (
              <span className="flex items-center gap-1 text-amber-500">
                <Star size={13} fill="currentColor" />
                {Number(course.avg_rating).toFixed(1)}
              </span>
            )}
          </div>
          <ChevronRight size={16} className="text-gray-300 group-hover:text-primary-500 transition-colors" />
        </div>
      </div>
    </div>
  );
}
