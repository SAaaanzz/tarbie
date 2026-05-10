import { useEffect, useState } from 'react';
import { useAuthStore } from '../store/auth';
import { api } from '../lib/api';
import { navigate } from '../lib/router';
import {
  ArrowLeft, CheckCircle2, Circle, Loader2, ChevronLeft, ChevronRight,
} from 'lucide-react';
import type { Lang } from '@tarbie/shared';

interface LessonData {
  id: string;
  module_id: string;
  title: string;
  type: string;
  content: string;
  video_url: string | null;
  duration_minutes: number;
  sort_order: number;
}

interface ProgressData {
  id: string;
  status: string;
  completed_at: string | null;
}

interface ModuleRow {
  id: string;
  title: string;
  sort_order: number;
  lessons: { id: string; title: string; type: string; sort_order: number }[];
}

const t = (lang: Lang, kz: string, ru: string) => lang === 'kz' ? kz : ru;

export function LessonPage({ courseId, lessonId }: { courseId: string; lessonId: string }) {
  const { lang } = useAuthStore();
  const [lesson, setLesson] = useState<LessonData | null>(null);
  const [progress, setProgress] = useState<ProgressData | null>(null);
  const [allLessons, setAllLessons] = useState<{ id: string; title: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [completing, setCompleting] = useState(false);

  const load = () => {
    setLoading(true);
    Promise.all([
      api.get<{ lesson: LessonData; progress: ProgressData | null }>(`/api/courses/${courseId}/lessons/${lessonId}`),
      api.get<{ course: unknown; modules: ModuleRow[] }>(`/api/courses/${courseId}`),
    ])
      .then(([lessonRes, courseRes]) => {
        setLesson(lessonRes.lesson);
        setProgress(lessonRes.progress);
        const flat = courseRes.modules.flatMap(m => m.lessons.map(l => ({ id: l.id, title: l.title })));
        setAllLessons(flat);
      })
      .catch(() => navigate(`/courses/${courseId}`))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [courseId, lessonId]);

  const markProgress = async (status: 'in_progress' | 'completed') => {
    setCompleting(true);
    try {
      await api.post(`/api/courses/${courseId}/lessons/${lessonId}/progress`, { status });
      setProgress(prev => prev ? { ...prev, status } : { id: '', status, completed_at: status === 'completed' ? new Date().toISOString() : null });
    } catch { }
    setCompleting(false);
  };

  useEffect(() => {
    if (lesson && (!progress || progress.status === 'not_started')) {
      markProgress('in_progress');
    }
  }, [lesson?.id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={32} className="animate-spin text-primary-600" />
      </div>
    );
  }

  if (!lesson) return null;

  const currentIdx = allLessons.findIndex(l => l.id === lessonId);
  const prevLesson = currentIdx > 0 ? allLessons[currentIdx - 1] : null;
  const nextLesson = currentIdx < allLessons.length - 1 ? allLessons[currentIdx + 1] : null;
  const isCompleted = progress?.status === 'completed';

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(`/courses/${courseId}`)} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
          <ArrowLeft size={16} />
          {t(lang, 'Курсқа оралу', 'Назад к курсу')}
        </button>
      </div>

      {/* Lesson content */}
      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        {/* Video player */}
        {lesson.type === 'video' && lesson.video_url && (
          <div className="aspect-video bg-black">
            {lesson.video_url.includes('youtube.com') || lesson.video_url.includes('youtu.be') ? (
              <iframe
                src={lesson.video_url.replace('watch?v=', 'embed/')}
                className="h-full w-full"
                allowFullScreen
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              />
            ) : (
              <video src={lesson.video_url} controls className="h-full w-full" />
            )}
          </div>
        )}

        <div className="p-6 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-xl font-bold text-gray-900">{lesson.title}</h1>
              {lesson.duration_minutes > 0 && (
                <p className="mt-1 text-sm text-gray-500">
                  {lesson.duration_minutes} {t(lang, 'мин', 'мин')}
                </p>
              )}
            </div>

            {/* Completion button */}
            <button
              onClick={() => markProgress(isCompleted ? 'in_progress' : 'completed')}
              disabled={completing}
              className={`shrink-0 flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                isCompleted
                  ? 'bg-green-50 text-green-700 border border-green-200'
                  : 'bg-gray-100 text-gray-700 hover:bg-primary-50 hover:text-primary-700'
              }`}
            >
              {completing ? (
                <Loader2 size={16} className="animate-spin" />
              ) : isCompleted ? (
                <CheckCircle2 size={16} />
              ) : (
                <Circle size={16} />
              )}
              {isCompleted
                ? t(lang, 'Аяқталды', 'Завершено')
                : t(lang, 'Аяқталды деп белгілеу', 'Отметить как пройдено')}
            </button>
          </div>

          {/* Lesson text content */}
          {lesson.content && (
            <div
              className="prose prose-sm max-w-none text-gray-700"
              dangerouslySetInnerHTML={{ __html: lesson.content.replace(/\n/g, '<br/>') }}
            />
          )}
        </div>
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between">
        {prevLesson ? (
          <button
            onClick={() => navigate(`/courses/${courseId}/lessons/${prevLesson.id}`)}
            className="flex items-center gap-1.5 rounded-lg border px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            <ChevronLeft size={16} />
            <span className="hidden sm:inline">{prevLesson.title}</span>
            <span className="sm:hidden">{t(lang, 'Алдыңғы', 'Назад')}</span>
          </button>
        ) : <div />}

        <span className="text-xs text-gray-400">
          {currentIdx + 1} / {allLessons.length}
        </span>

        {nextLesson ? (
          <button
            onClick={() => navigate(`/courses/${courseId}/lessons/${nextLesson.id}`)}
            className="flex items-center gap-1.5 rounded-lg border px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            <span className="hidden sm:inline">{nextLesson.title}</span>
            <span className="sm:hidden">{t(lang, 'Келесі', 'Далее')}</span>
            <ChevronRight size={16} />
          </button>
        ) : (
          <button
            onClick={() => navigate(`/courses/${courseId}`)}
            className="flex items-center gap-1.5 rounded-lg bg-primary-600 px-4 py-2 text-sm text-white hover:bg-primary-700"
          >
            {t(lang, 'Курсты аяқтау', 'Завершить курс')}
          </button>
        )}
      </div>
    </div>
  );
}
