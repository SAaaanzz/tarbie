import { useEffect, useState } from 'react';
import { Sparkles, Loader2, FileText, AlertTriangle, Clock, Send, CheckCircle2 } from 'lucide-react';
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

interface SessionRow {
  id: string;
  topic: string;
  planned_date: string;
  class_name?: string;
  time_slot?: string;
  status?: string;
}

export function LessonPlanGenerator() {
  const { lang, user } = useAuthStore();
  const ru = lang !== 'kz';
  const isTeacher = user?.role === 'teacher';

  const [topic, setTopic] = useState('');
  const [duration, setDuration] = useState(45);
  const [lessonNumber, setLessonNumber] = useState('');
  const [group, setGroup] = useState('');
  const [curatorName, setCuratorName] = useState('');
  const [date, setDate] = useState('');
  const [weekTopic, setWeekTopic] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [plan, setPlan] = useState<LessonPlan | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [usage, setUsage] = useState<{ used: number; limit: number } | null>(null);
  const [downloading, setDownloading] = useState(false);

  // Phase 3 — attach to a session and send for approval
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [sessionId, setSessionId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!isTeacher) return;
    api.get<SessionRow[]>('/api/sessions')
      .then((rows) => setSessions(Array.isArray(rows) ? rows : []))
      .catch(() => {});
  }, [isTeacher]);

  const onSelectSession = (id: string) => {
    setSessionId(id);
    const s = sessions.find((x) => x.id === id);
    if (s) {
      if (s.class_name) setGroup(s.class_name);
      if (s.planned_date) setDate(s.planned_date.split('T')[0]?.split(' ')[0] ?? s.planned_date);
    }
  };

  const buildMeta = (): LessonPlanMeta => ({
    lang,
    group,
    curatorName: curatorName || user?.full_name || '',
    date,
    weekTopic: weekTopic || undefined,
  });

  const handleGenerate = async () => {
    if (!topic.trim()) return;
    setLoading(true);
    setError('');
    setPlan(null);
    try {
      const res = await api.post<PlanResponse>('/api/assistant/lesson-plan', {
        topic: topic.trim(),
        lang,
        duration_minutes: duration,
        lesson_number: lessonNumber ? Number(lessonNumber) : undefined,
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
      const meta = buildMeta();
      const blob = await buildLessonPlanDocx(plan, meta);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${lessonPlanFileName(plan, meta)}.docx`;
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

  const handleSubmitForApproval = async () => {
    if (!plan || !sessionId) return;
    setSubmitting(true);
    setError('');
    try {
      const meta = buildMeta();
      const blob = await buildLessonPlanDocx(plan, meta);
      const file = new File([blob], `${lessonPlanFileName(plan, meta)}.docx`, { type: DOCX_MIME });
      const formData = new FormData();
      formData.append('session_id', sessionId);
      formData.append('file', file);
      await api.postFormData('/api/lesson-approvals', formData);
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : ru ? 'Ошибка отправки на утверждение' : 'Бекітуге жіберу қатесі');
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

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              {ru ? 'Длительность (мин)' : 'Ұзақтығы (мин)'}
            </label>
            <input type="number" min={10} max={90} className="input-field w-full"
              value={duration} onChange={(e) => setDuration(Number(e.target.value))} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              {ru ? 'Номер урока' : 'Сабақ нөмірі'}
            </label>
            <input type="text" className="input-field w-full" placeholder="2"
              value={lessonNumber} onChange={(e) => setLessonNumber(e.target.value)} />
          </div>
        </div>

        <p className="text-xs text-gray-500 pt-1">
          {ru
            ? 'Данные для титульного листа (группа, куратор, дата) — можно заполнить сейчас или перед скачиванием Word.'
            : 'Титул беті үшін деректер (топ, жетекші, күні) — қазір немесе Word жүктер алдында толтыруға болады.'}
        </p>
        <div className="grid grid-cols-2 gap-3">
          <input type="text" className="input-field w-full" placeholder={ru ? 'Группа (Т22-4А)' : 'Топ (Т22-4А)'}
            value={group} onChange={(e) => setGroup(e.target.value)} />
          <input type="text" className="input-field w-full" placeholder={ru ? 'Куратор (Н. Фамилия)' : 'Жетекші (Н. Тегі)'}
            value={curatorName} onChange={(e) => setCuratorName(e.target.value)} />
          <input type="text" className="input-field w-full" placeholder={ru ? 'Дата (17.05.2026)' : 'Күні (17.05.2026)'}
            value={date} onChange={(e) => setDate(e.target.value)} />
          <input type="text" className="input-field w-full" placeholder={ru ? 'Тема недели (необяз.)' : 'Апта тақырыбы (міндетті емес)'}
            value={weekTopic} onChange={(e) => setWeekTopic(e.target.value)} />
        </div>

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

          {/* Confirm → create lesson (send for approval) */}
          {isTeacher && (
            <div className="border-t border-gray-100 pt-4">
              {submitted ? (
                <div className="flex items-start gap-2 rounded-xl bg-green-50 border border-green-200 p-3 text-sm text-green-800">
                  <CheckCircle2 size={18} className="shrink-0 mt-0.5" />
                  <span>
                    {ru
                      ? 'Отправлено на утверждение. Урок появился в «Моих уроках»; после одобрения администратором будет доступен PDF.'
                      : 'Бекітуге жіберілді. Сабақ «Менің сабақтарымда» пайда болды; әкімші бекіткеннен кейін PDF қолжетімді болады.'}
                  </span>
                </div>
              ) : (
                <>
                  <p className="text-sm font-semibold text-gray-700 mb-2">
                    {ru ? 'Проверьте план. Создать урок?' : 'Жоспарды тексеріңіз. Сабақ құру керек пе?'}
                  </p>
                  {sessions.length === 0 ? (
                    <p className="text-xs text-gray-500">
                      {ru
                        ? 'Сначала запланируйте занятие в разделе «Занятия», затем вернитесь сюда, чтобы прикрепить план.'
                        : 'Алдымен «Сабақтар» бөлімінде сабақ жоспарлаңыз, содан кейін жоспарды тіркеу үшін осында оралыңыз.'}
                    </p>
                  ) : (
                    <div className="flex flex-col sm:flex-row gap-2">
                      <select
                        className="input-field flex-1"
                        value={sessionId}
                        onChange={(e) => onSelectSession(e.target.value)}
                      >
                        <option value="">{ru ? '— выберите занятие —' : '— сабақты таңдаңыз —'}</option>
                        {sessions.map((s) => (
                          <option key={s.id} value={s.id}>
                            {[s.planned_date?.slice(0, 10), s.class_name, s.topic].filter(Boolean).join(' · ')}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={handleSubmitForApproval}
                        disabled={submitting || !sessionId}
                        className="btn-primary flex items-center gap-1.5 px-4 shrink-0"
                      >
                        {submitting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                        {ru ? 'Создать урок (на утверждение)' : 'Сабақ құру (бекітуге)'}
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
