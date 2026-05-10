import { useEffect, useState } from 'react';
import { useAuthStore } from '../store/auth';
import { api } from '../lib/api';
import { navigate } from '../lib/router';
import {
  ArrowLeft, Plus, Trash2, GripVertical, Save, Eye, BookOpen,
  ChevronDown, ChevronUp, Video, FileText, Loader2, X, Check, Upload, Paperclip,
} from 'lucide-react';
import type { Lang } from '@tarbie/shared';

interface CategoryRow { id: string; name: string; slug: string; }

interface LessonRow {
  id: string;
  module_id: string;
  title: string;
  type: string;
  content: string;
  video_url: string | null;
  file_url: string | null;
  file_name: string | null;
  duration_minutes: number;
  sort_order: number;
}

interface ModuleRow {
  id: string;
  course_id: string;
  title: string;
  sort_order: number;
  lessons: LessonRow[];
}

interface CourseData {
  id: string;
  title: string;
  description: string;
  category_id: string | null;
  price: number;
  status: string;
  cover_url: string | null;
  lang: string;
}

const t = (lang: Lang, kz: string, ru: string) => lang === 'kz' ? kz : ru;

export function CourseBuilderPage({ courseId }: { courseId: string | null }) {
  const { lang } = useAuthStore();
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [course, setCourse] = useState<CourseData | null>(null);
  const [modules, setModules] = useState<ModuleRow[]>([]);
  const [loading, setLoading] = useState(!!courseId);
  const [saving, setSaving] = useState(false);
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set());
  const [editingLesson, setEditingLesson] = useState<LessonRow | null>(null);

  // New course form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState<string>('');
  const [price, setPrice] = useState(0);
  const [status, setStatus] = useState('draft');

  useEffect(() => {
    api.get<CategoryRow[]>('/api/courses/categories').then(setCategories).catch(() => {});
  }, []);

  useEffect(() => {
    if (!courseId) { setLoading(false); return; }
    setLoading(true);
    api.get<{ course: CourseData; modules: ModuleRow[] }>(`/api/courses/${courseId}`)
      .then((res) => {
        setCourse(res.course);
        setModules(res.modules);
        setTitle(res.course.title);
        setDescription(res.course.description);
        setCategoryId(res.course.category_id ?? '');
        setPrice(res.course.price);
        setStatus(res.course.status);
        setExpandedModules(new Set(res.modules.map(m => m.id)));
      })
      .catch(() => navigate('/courses'))
      .finally(() => setLoading(false));
  }, [courseId]);

  const saveCourse = async () => {
    setSaving(true);
    try {
      if (course) {
        await api.put(`/api/courses/${course.id}`, {
          title, description,
          category_id: categoryId || null,
          price, status,
        });
      } else {
        const res = await api.post<{ id: string }>('/api/courses', {
          title, description,
          category_id: categoryId || null,
          price,
        });
        navigate(`/courses/builder?id=${res.id}`);
        return;
      }
    } catch { }
    setSaving(false);
  };

  const addModule = async () => {
    if (!course) return;
    try {
      const res = await api.post<{ id: string }>(`/api/courses/${course.id}/modules`, {
        title: t(lang, 'Жаңа модуль', 'Новый модуль'),
        sort_order: modules.length,
      });
      const newMod: ModuleRow = {
        id: res.id,
        course_id: course.id,
        title: t(lang, 'Жаңа модуль', 'Новый модуль'),
        sort_order: modules.length,
        lessons: [],
      };
      setModules(prev => [...prev, newMod]);
      setExpandedModules(prev => new Set([...prev, res.id]));
    } catch { }
  };

  const updateModuleTitle = async (moduleId: string, newTitle: string) => {
    if (!course) return;
    setModules(prev => prev.map(m => m.id === moduleId ? { ...m, title: newTitle } : m));
    try {
      await api.put(`/api/courses/${course.id}/modules/${moduleId}`, { title: newTitle });
    } catch { }
  };

  const deleteModule = async (moduleId: string) => {
    if (!course) return;
    if (!confirm(t(lang, 'Модульді жоюға сенімдісіз бе?', 'Удалить модуль?'))) return;
    try {
      await api.delete(`/api/courses/${course.id}/modules/${moduleId}`);
      setModules(prev => prev.filter(m => m.id !== moduleId));
    } catch { }
  };

  const addLesson = async (moduleId: string) => {
    if (!course) return;
    try {
      const res = await api.post<{ id: string }>(`/api/courses/${course.id}/modules/${moduleId}/lessons`, {
        title: t(lang, 'Жаңа сабақ', 'Новый урок'),
        type: 'text',
        sort_order: (modules.find(m => m.id === moduleId)?.lessons.length ?? 0),
      });
      const newLesson: LessonRow = {
        id: res.id,
        module_id: moduleId,
        title: t(lang, 'Жаңа сабақ', 'Новый урок'),
        type: 'text',
        content: '',
        video_url: null,
        file_url: null,
        file_name: null,
        duration_minutes: 0,
        sort_order: 0,
      };
      setModules(prev => prev.map(m =>
        m.id === moduleId ? { ...m, lessons: [...m.lessons, newLesson] } : m
      ));
    } catch { }
  };

  const saveLesson = async (lesson: LessonRow) => {
    if (!course) return;
    try {
      await api.put(`/api/courses/${course.id}/modules/${lesson.module_id}/lessons/${lesson.id}`, {
        title: lesson.title,
        type: lesson.type,
        content: lesson.content,
        video_url: lesson.video_url || null,
        duration_minutes: lesson.duration_minutes,
      });
      setModules(prev => prev.map(m =>
        m.id === lesson.module_id
          ? { ...m, lessons: m.lessons.map(l => l.id === lesson.id ? lesson : l) }
          : m
      ));
      setEditingLesson(null);
    } catch { }
  };

  const deleteLesson = async (moduleId: string, lessonId: string) => {
    if (!course) return;
    if (!confirm(t(lang, 'Сабақты жоюға сенімдісіз бе?', 'Удалить урок?'))) return;
    try {
      await api.delete(`/api/courses/${course.id}/modules/${moduleId}/lessons/${lessonId}`);
      setModules(prev => prev.map(m =>
        m.id === moduleId ? { ...m, lessons: m.lessons.filter(l => l.id !== lessonId) } : m
      ));
    } catch { }
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

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button onClick={() => navigate(course ? `/courses/${course.id}` : '/courses')}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
          <ArrowLeft size={16} />
          {t(lang, 'Артқа', 'Назад')}
        </button>
        <div className="flex items-center gap-2">
          {course && (
            <button onClick={() => navigate(`/courses/${course.id}`)} className="btn-secondary text-sm">
              <Eye size={16} className="mr-1" />
              {t(lang, 'Алдын ала қарау', 'Предпросмотр')}
            </button>
          )}
          <button onClick={saveCourse} disabled={saving || !title.trim()} className="btn-primary text-sm">
            {saving ? <Loader2 size={16} className="animate-spin mr-1" /> : <Save size={16} className="mr-1" />}
            {t(lang, 'Сақтау', 'Сохранить')}
          </button>
        </div>
      </div>

      {/* Course Info Form */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-4">
        <h2 className="text-lg font-bold text-gray-900">
          {course ? t(lang, 'Курсты өңдеу', 'Редактирование курса') : t(lang, 'Жаңа курс', 'Новый курс')}
        </h2>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t(lang, 'Атауы', 'Название')} *
            </label>
            <input
              type="text"
              className="input-field text-sm"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t(lang, 'Курс атауы', 'Название курса')}
            />
          </div>

          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t(lang, 'Сипаттама', 'Описание')}
            </label>
            <textarea
              className="input-field text-sm"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t(lang, 'Курс сипаттамасы', 'Описание курса')}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t(lang, 'Санат', 'Категория')}
            </label>
            <select
              className="input-field text-sm"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
            >
              <option value="">{t(lang, 'Таңдалмаған', 'Не выбрана')}</option>
              {categories.map(cat => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t(lang, 'Баға (₸)', 'Цена (₸)')}
            </label>
            <input
              type="number"
              className="input-field text-sm"
              value={price}
              onChange={(e) => setPrice(Number(e.target.value))}
              min={0}
            />
          </div>

          {course && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t(lang, 'Күйі', 'Статус')}
              </label>
              <select
                className="input-field text-sm"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="draft">{t(lang, 'Жоба', 'Черновик')}</option>
                <option value="published">{t(lang, 'Жарияланды', 'Опубликован')}</option>
                <option value="archived">{t(lang, 'Мұрағатталды', 'В архиве')}</option>
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Modules & Lessons */}
      {course && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-gray-900">
              {t(lang, 'Модульдер мен сабақтар', 'Модули и уроки')}
            </h2>
            <button onClick={addModule} className="btn-secondary text-sm">
              <Plus size={16} className="mr-1" />
              {t(lang, 'Модуль қосу', 'Добавить модуль')}
            </button>
          </div>

          {modules.length === 0 ? (
            <div className="rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 py-12 text-center">
              <BookOpen size={32} className="mx-auto mb-2 text-gray-300" />
              <p className="text-sm text-gray-400">{t(lang, 'Модульдер жоқ. Бірінші модульді қосыңыз.', 'Модулей нет. Добавьте первый модуль.')}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {modules.map((mod, mi) => (
                <div key={mod.id} className="rounded-xl border border-gray-200 bg-white overflow-hidden">
                  {/* Module header */}
                  <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-3">
                    <GripVertical size={16} className="text-gray-300 cursor-grab" />
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-50 text-xs font-bold text-primary-700">
                      {mi + 1}
                    </span>
                    <input
                      className="flex-1 border-0 bg-transparent text-sm font-medium text-gray-900 focus:outline-none focus:ring-0"
                      value={mod.title}
                      onChange={(e) => updateModuleTitle(mod.id, e.target.value)}
                      onBlur={() => updateModuleTitle(mod.id, mod.title)}
                    />
                    <span className="text-xs text-gray-400">{mod.lessons.length} {t(lang, 'сабақ', 'уроков')}</span>
                    <button onClick={() => toggleModule(mod.id)} className="p-1 text-gray-400 hover:text-gray-600">
                      {expandedModules.has(mod.id) ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>
                    <button onClick={() => deleteModule(mod.id)} className="p-1 text-gray-400 hover:text-red-600">
                      <Trash2 size={15} />
                    </button>
                  </div>

                  {/* Lessons */}
                  {expandedModules.has(mod.id) && (
                    <div>
                      {mod.lessons.map((lesson) => (
                        <div key={lesson.id} className="flex items-center gap-2 border-b border-gray-50 px-4 py-2 hover:bg-gray-50">
                          <GripVertical size={14} className="text-gray-200 cursor-grab" />
                          {lesson.type === 'video' ? <Video size={14} className="text-blue-500" /> :
                           <FileText size={14} className="text-gray-400" />}
                          <button
                            onClick={() => { setEditingLesson({ ...lesson }); }}
                            className="flex-1 text-left text-sm text-gray-700 hover:text-primary-700"
                          >
                            {lesson.title}
                          </button>
                          {lesson.duration_minutes > 0 && (
                            <span className="text-xs text-gray-400">{lesson.duration_minutes} {t(lang, 'мин', 'мин')}</span>
                          )}
                          <button onClick={() => deleteLesson(mod.id, lesson.id)} className="p-1 text-gray-300 hover:text-red-600">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ))}

                      <button
                        onClick={() => addLesson(mod.id)}
                        className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-gray-400 hover:text-primary-600 hover:bg-primary-50 transition-colors"
                      >
                        <Plus size={14} />
                        {t(lang, 'Сабақ қосу', 'Добавить урок')}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Lesson editor modal */}
      {editingLesson && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
              <h3 className="text-lg font-bold text-gray-900">{t(lang, 'Сабақты өңдеу', 'Редактирование урока')}</h3>
              <button onClick={() => setEditingLesson(null)} className="p-1 text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t(lang, 'Атауы', 'Название')}</label>
                <input
                  type="text"
                  className="input-field text-sm"
                  value={editingLesson.title}
                  onChange={(e) => setEditingLesson({ ...editingLesson, title: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t(lang, 'Түрі', 'Тип')}</label>
                <div className="flex gap-2">
                  {[
                    { value: 'text', icon: <FileText size={14} />, label: t(lang, 'Мәтін', 'Текст') },
                    { value: 'video', icon: <Video size={14} />, label: t(lang, 'Видео', 'Видео') },
                  ].map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => setEditingLesson({ ...editingLesson, type: opt.value })}
                      className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm ${
                        editingLesson.type === opt.value
                          ? 'border-primary-300 bg-primary-50 text-primary-700'
                          : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {opt.icon} {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {editingLesson.type === 'video' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t(lang, 'Видео URL', 'URL видео')}</label>
                  <input
                    type="url"
                    className="input-field text-sm"
                    value={editingLesson.video_url ?? ''}
                    onChange={(e) => setEditingLesson({ ...editingLesson, video_url: e.target.value || null })}
                    placeholder="https://youtube.com/watch?v=..."
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t(lang, 'Ұзақтығы (мин)', 'Длительность (мин)')}
                </label>
                <input
                  type="number"
                  className="input-field text-sm w-32"
                  value={editingLesson.duration_minutes}
                  onChange={(e) => setEditingLesson({ ...editingLesson, duration_minutes: Number(e.target.value) })}
                  min={0}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t(lang, 'Мазмұны', 'Содержание')}</label>
                <textarea
                  className="input-field text-sm font-mono"
                  rows={10}
                  value={editingLesson.content}
                  onChange={(e) => setEditingLesson({ ...editingLesson, content: e.target.value })}
                  placeholder={t(lang, 'Сабақ мазмұны...', 'Содержание урока...')}
                />
              </div>

              {/* File attachment */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <Paperclip size={14} className="inline mr-1" />
                  {t(lang, 'Файл (макс 10 MB)', 'Файл (макс 10 MB)')}
                </label>
                {editingLesson.file_url ? (
                  <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                    <Paperclip size={14} className="text-blue-500" />
                    <a href={`https://dprabota.bahtyarsanzhar.workers.dev${editingLesson.file_url}`} target="_blank" rel="noopener" className="text-sm text-blue-600 hover:underline flex-1 truncate">
                      {editingLesson.file_name || t(lang, 'Файл', 'Файл')}
                    </a>
                    <button
                      type="button"
                      onClick={async () => {
                        if (!course) return;
                        try {
                          await api.delete(`/api/courses/${course.id}/modules/${editingLesson.module_id}/lessons/${editingLesson.id}/file`);
                          setEditingLesson({ ...editingLesson, file_url: null, file_name: null });
                          setModules(prev => prev.map(m => m.id === editingLesson.module_id
                            ? { ...m, lessons: m.lessons.map(l => l.id === editingLesson.id ? { ...l, file_url: null, file_name: null } : l) }
                            : m
                          ));
                        } catch { }
                      }}
                      className="p-1 text-red-400 hover:text-red-600"
                      title={t(lang, 'Файлды жою', 'Удалить файл')}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ) : (
                  <label className="flex items-center gap-2 rounded-lg border-2 border-dashed border-gray-300 hover:border-primary-400 bg-gray-50 hover:bg-primary-50 px-4 py-3 cursor-pointer transition-colors">
                    <Upload size={16} className="text-gray-400" />
                    <span className="text-sm text-gray-500">{t(lang, 'Файлды таңдаңыз', 'Выберите файл')}</span>
                    <input
                      type="file"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file || !course) return;
                        if (file.size > 10 * 1024 * 1024) {
                          alert(t(lang, 'Файл 10 MB-дан аспауы керек', 'Файл не должен превышать 10 MB'));
                          return;
                        }
                        const formData = new FormData();
                        formData.append('file', file);
                        try {
                          const res = await fetch(
                            `https://dprabota.bahtyarsanzhar.workers.dev/api/courses/${course.id}/modules/${editingLesson.module_id}/lessons/${editingLesson.id}/file`,
                            { method: 'POST', headers: { 'Authorization': `Bearer ${localStorage.getItem('tarbie-auth') ? JSON.parse(localStorage.getItem('tarbie-auth')!).state?.token : ''}` }, body: formData }
                          );
                          const json = await res.json() as { success: boolean; data?: { file_url: string; file_name: string } };
                          if (json.success && json.data) {
                            setEditingLesson({ ...editingLesson, file_url: json.data.file_url, file_name: json.data.file_name });
                            setModules(prev => prev.map(m => m.id === editingLesson.module_id
                              ? { ...m, lessons: m.lessons.map(l => l.id === editingLesson.id ? { ...l, file_url: json.data!.file_url, file_name: json.data!.file_name } : l) }
                              : m
                            ));
                          }
                        } catch { }
                      }}
                    />
                  </label>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-gray-200 px-6 py-4">
              <button onClick={() => setEditingLesson(null)} className="btn-secondary text-sm">
                {t(lang, 'Болдырмау', 'Отмена')}
              </button>
              <button
                onClick={() => saveLesson(editingLesson)}
                className="btn-primary text-sm"
              >
                <Check size={16} className="mr-1" />
                {t(lang, 'Сақтау', 'Сохранить')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
