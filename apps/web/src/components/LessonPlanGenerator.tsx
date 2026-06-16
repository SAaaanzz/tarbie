import { useEffect, useMemo, useState } from 'react';
import { Sparkles, Loader2, FileText, AlertTriangle, Clock, Send, CheckCircle2 } from 'lucide-react';
import { COLLEGE_PAIRS, BUILDINGS, getFloorsForBuilding, getRoomsForFloor } from '@tarbie/shared';
import { useAuthStore } from '../store/auth';
import { api } from '../lib/api';
import {
  buildLessonPlanDocx,
  lessonPlanFileName,
  type LessonPlan,
  type LessonPlanMeta,
  type LessonLang,
} from '../lib/lessonDoc';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

interface PlanResponse {
  plan: LessonPlan;
  meta: { lang: LessonLang; duration_minutes: number; total_minutes: number; warnings: string[] };
  usage: { used: number; limit: number };
}

export function LessonPlanGenerator() {
  const { lang, user } = useAuthStore();
  const ru = lang !== 'kz';
  const isTeacher = user?.role === 'teacher';

  const [topic, setTopic] = useState('');
  const [duration, setDuration] = useState(30);
  const [pairNumber, setPairNumber] = useState('');
  const [classId, setClassId] = useState('');
  const [date, setDate] = useState('');
  const [weekTopic, setWeekTopic] = useState('');
  const [classes, setClasses] = useState<Array<{ id: string; name: string }>>([]);

  // Room (needed to create the lesson/session for approval)
  const [building, setBuilding] = useState('');
  const [room, setRoom] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [plan, setPlan] = useState<LessonPlan | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [usage, setUsage] = useState<{ used: number; limit: number } | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!isTeacher) return;
    api.get<Array<{ id: string; name: string }>>('/api/sessions/classes')
      .then((rows) => setClasses(Array.isArray(rows) ? rows : []))
      .catch(() => {});
  }, [isTeacher]);

  const rooms = useMemo(() => {
    if (!building) return [];
    return getFloorsForBuilding(building as never).flatMap((f) => getRoomsForFloor(building as never, f));
  }, [building]);

  const groupName = classes.find((c) => c.id === classId)?.name ?? '';

  // Native date input gives YYYY-MM-DD; the document uses DD.MM.YYYY.
  const fmtDate = (d: string) => {
    const [y, m, dd] = d.split('-');
    return dd && m && y ? `${dd}.${m}.${y}` : d;
  };

  const buildMeta = (): LessonPlanMeta => ({
    lang,
    group: groupName,
    curatorName: user?.full_name || '',
    date: date ? fmtDate(date) : '',
    weekTopic: weekTopic || undefined,
  });

  const handleGenerate = async () => {
    if (!topic.trim()) return;
    setLoading(true);
    setError('');
    setPlan(null);
    setSubmitted(false);
    try {
      const res = await api.post<PlanResponse>('/api/assistant/lesson-plan', {
        topic: topic.trim(),
        lang,
        duration_minutes: duration,
        lesson_number: pairNumber ? Number(pairNumber) : undefined,
      });
      setPlan(res.plan);
      setWarnings(res.meta.warnings ?? []);
      setUsage(res.usage);
    } catch (err) {
      setError(err instanceof Error ? err.message : ru ? 'Ошибка генерации' : 'Генерация қатесі');
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async () => {
    if (!plan) return;
    setDownloading(true);
    try {
      const blob = await buildLessonPlanDocx(plan, buildMeta());
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${lessonPlanFileName(plan, buildMeta())}.docx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : ru ? 'Ошибка создания Word' : 'Word жасау қатесі');
    } finally {
      setDownloading(false);
    }
  };

  // Create a NEW lesson (session) from the form, then send the generated .docx for approval.
  const handleCreateLesson = async () => {
    if (!plan) return;
    if (!classId || !date || !pairNumber || !room) {
      setError(ru ? 'Заполните группу, дату, урок и кабинет' : 'Топ, күн, сабақ және кабинетті толтырыңыз');
      return;
    }
    const pair = COLLEGE_PAIRS.find((p) => p.number === Number(pairNumber));
    const timeSlot = pair?.slots[0];
    if (!timeSlot) {
      setError(ru ? 'Выберите урок (время)' : 'Сабақты (уақытты) таңдаңыз');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      // 1. Create the session (the lesson)
      const session = await api.post<{ id: string }>('/api/sessions', {
        class_id: classId,
        topic: plan.topic_title,
        planned_date: date,
        time_slot: timeSlot,
        room,
        duration_minutes: duration,
      });
      // 2. Submit the generated .docx for approval against the new session
      const meta = buildMeta();
      const blob = await buildLessonPlanDocx(plan, meta);
      const file = new File([blob], `${lessonPlanFileName(plan, meta)}.docx`, { type: DOCX_MIME });
      const formData = new FormData();
      formData.append('session_id', session.id);
      formData.append('file', file);
      await api.postFormData('/api/lesson-approvals', formData);
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : ru ? 'Ошибка создания урока' : 'Сабақ құру қатесі');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-5">
      {error && (
        <div className="flex items-center gap-2 rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-700">
          <AlertTriangle size={16} className="shrink-0" />
          {error}
        </div>
      )}

      {/* Form */}
      <div className="rounded-2xl bg-white p-5 shadow-sm border border-gray-200 space-y-3">
        <label className="block text-sm font-medium text-gray-700">
          {ru ? 'Тема урока' : 'Сабақ тақырыбы'}
        </label>
        <input
          type="text"
          className="input-field w-full"
          placeholder={ru ? 'например: электробезопасность' : 'мысалы: электр қауіпсіздігі'}
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleGenerate(); }}
        />

        {/* Group — only the teacher's own classes, no free typing */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">{ru ? 'Группа' : 'Топ'}</label>
          <select className="input-field w-full" value={classId} onChange={(e) => setClassId(e.target.value)}>
            <option value="">{ru ? '— выберите группу —' : '— топты таңдаңыз —'}</option>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">{ru ? 'Дата' : 'Күні'}</label>
            <input type="date" className="input-field w-full" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">{ru ? 'Длительность' : 'Ұзақтығы'}</label>
            <select className="input-field w-full" value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
              <option value={30}>30 {ru ? 'мин' : 'мин'}</option>
              <option value={60}>60 {ru ? 'мин' : 'мин'}</option>
              <option value={90}>90 {ru ? 'мин' : 'мин'}</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1 flex items-center gap-1">
              <Clock size={12} />{ru ? 'Урок (время)' : 'Сабақ (уақыты)'}
            </label>
            <select className="input-field w-full" value={pairNumber} onChange={(e) => setPairNumber(e.target.value)}>
              <option value="">{ru ? '— выберите урок —' : '— сабақты таңдаңыз —'}</option>
              {COLLEGE_PAIRS.map((p) => (
                <option key={p.number} value={p.number}>
                  {p.number}-{ru ? 'урок' : 'сабақ'} ({p.start}–{p.end})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">{ru ? 'Тема недели (необяз.)' : 'Апта тақырыбы (міндетті емес)'}</label>
            <input type="text" className="input-field w-full"
              value={weekTopic} onChange={(e) => setWeekTopic(e.target.value)} />
          </div>
        </div>

        {/* Room (for creating the lesson) */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">{ru ? 'Корпус' : 'Корпус'}</label>
            <select className="input-field w-full" value={building}
              onChange={(e) => { setBuilding(e.target.value); setRoom(''); }}>
              <option value="">{ru ? '— корпус —' : '— корпус —'}</option>
              {BUILDINGS.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">{ru ? 'Кабинет' : 'Кабинет'}</label>
            <select className="input-field w-full" value={room} onChange={(e) => setRoom(e.target.value)} disabled={!building}>
              <option value="">{ru ? '— кабинет —' : '— кабинет —'}</option>
              {rooms.map((r) => <option key={r.displayName} value={r.displayName}>{r.displayName}</option>)}
            </select>
          </div>
        </div>

        <p className="text-xs text-gray-500">
          {ru ? 'Куратор: ' : 'Жетекші: '}<span className="font-medium text-gray-700">{user?.full_name}</span>
          {ru ? ' (берётся автоматически)' : ' (автоматты түрде алынады)'}
        </p>

        <div className="flex items-center justify-between pt-1">
          {usage && (
            <span className="text-xs text-gray-500">
              {usage.used}/{usage.limit} {ru ? 'планов сегодня' : 'жоспар бүгін'}
            </span>
          )}
          <button onClick={handleGenerate} disabled={loading || !topic.trim()}
            className="btn-primary flex items-center gap-1.5 px-4 ml-auto">
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
            {ru ? 'Сгенерировать план' : 'Жоспар жасау'}
          </button>
        </div>
      </div>

      {/* Preview */}
      {plan && (
        <div className="rounded-2xl bg-white p-5 shadow-sm border border-gray-200 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <h3 className="text-base font-bold text-gray-900">{plan.topic_title}</h3>
            <button onClick={handleDownload} disabled={downloading}
              className="btn-primary flex items-center gap-1.5 px-4 shrink-0">
              {downloading ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />}
              {ru ? 'Скачать Word' : 'Word жүктеу'}
            </button>
          </div>

          {warnings.length > 0 && (
            <div className="flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 p-2 text-xs text-amber-800">
              <Clock size={14} />
              {ru ? 'Хронометраж требует проверки' : 'Хронометражды тексеру қажет'}: {warnings.join('; ')}
            </div>
          )}

          <div>
            <p className="text-sm font-semibold text-gray-700">{ru ? 'Цели' : 'Мақсаты'}</p>
            <ul className="list-disc pl-5 text-sm text-gray-600 space-y-0.5">
              {plan.goals.map((g, i) => <li key={i}>{g}</li>)}
            </ul>
          </div>

          <div>
            <p className="text-sm font-semibold text-gray-700">{ru ? 'Ход занятия' : 'Сабақ барысы'}</p>
            <ul className="text-sm text-gray-600 space-y-1.5">
              {[...plan.stages].sort((a, b) => a.order - b.order).map((st) => (
                <li key={st.order}>
                  <span className="font-medium">{st.order}. {st.name}</span>
                  <span className="text-gray-400"> — {st.minutes} {ru ? 'мин' : 'мин'}</span>
                  <p className="text-gray-500">{st.content}</p>
                </li>
              ))}
            </ul>
          </div>

          {plan.group_work?.length > 0 && (
            <div>
              <p className="text-sm font-semibold text-gray-700">{ru ? 'Групповая работа' : 'Топтық жұмыс'}</p>
              {plan.group_work.map((gw, i) => (
                <p key={i} className="text-sm text-gray-600">{gw.group}: {gw.title}</p>
              ))}
            </div>
          )}

          <div>
            <p className="text-sm font-semibold text-gray-700">{ru ? 'Рефлексия' : 'Рефлексия'}</p>
            <p className="text-sm text-gray-600">{plan.reflection.method} — {plan.reflection.question}</p>
          </div>

          {/* Confirm → create a new lesson (send for approval) */}
          {isTeacher && (
            <div className="border-t border-gray-100 pt-4">
              {submitted ? (
                <div className="flex items-start gap-2 rounded-xl bg-green-50 border border-green-200 p-3 text-sm text-green-800">
                  <CheckCircle2 size={18} className="shrink-0 mt-0.5" />
                  <span>
                    {ru
                      ? 'Урок создан и отправлен на утверждение. Он появился в «Моих уроках»; после одобрения администратором будет доступен PDF с подписями.'
                      : 'Сабақ құрылып, бекітуге жіберілді. Ол «Менің сабақтарымда» пайда болды; әкімші бекіткеннен кейін қолтаңбалы PDF қолжетімді болады.'}
                  </span>
                </div>
              ) : (
                <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                  <p className="text-sm font-semibold text-gray-700 flex-1">
                    {ru ? 'Проверьте план. Создать урок и отправить на утверждение?' : 'Жоспарды тексеріңіз. Сабақ құрып, бекітуге жіберу керек пе?'}
                  </p>
                  <button
                    onClick={handleCreateLesson}
                    disabled={submitting}
                    className="btn-primary flex items-center gap-1.5 px-4 shrink-0"
                  >
                    {submitting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                    {ru ? 'Создать урок' : 'Сабақ құру'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
