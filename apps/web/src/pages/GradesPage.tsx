import { useEffect, useState } from 'react';
import { useAuthStore } from '../store/auth';
import { api } from '../lib/api';
import { Star, Loader2, CheckCircle2, XCircle, RotateCcw, Save, ChevronLeft } from 'lucide-react';
import { Avatar } from '../components/Avatar';

/* ─── Types ─── */

interface ClassRow {
  id: string;
  name: string;
  teacher_name: string;
}

interface SessionRow {
  id: string;
  topic: string;
  planned_date: string;
  status: string;
}

interface GradeEntry {
  id: string;
  session_id: string;
  student_id: string;
  student_name: string;
  status: 'present' | 'absent' | 'makeup';
  grade: number | null;
  comment: string | null;
  student_avatar_url?: string | null;
}

interface MonthlyRow {
  student_id: string;
  student_name: string;
  total_sessions: number;
  attended: number;
  absent: number;
  makeup: number;
  sum_grades: number;
  average: number;
}

interface StudentGrade {
  id: string;
  session_id: string;
  status: 'present' | 'absent' | 'makeup';
  grade: number | null;
  comment: string | null;
  topic: string;
  planned_date: string;
  class_name: string;
}

interface StudentMonthly {
  class_id: string;
  class_name: string;
  total_sessions: number;
  sum_grades: number;
  average: number;
}

/* ─── Helpers ─── */

function gradeColor(g: number): string {
  if (g >= 80) return 'text-green-700 bg-green-100';
  if (g >= 50) return 'text-blue-700 bg-blue-100';
  if (g >= 30) return 'text-amber-700 bg-amber-100';
  return 'text-red-700 bg-red-100';
}

function statusIcon(s: string) {
  if (s === 'present') return <CheckCircle2 size={14} className="text-green-600" />;
  if (s === 'makeup') return <RotateCcw size={14} className="text-blue-600" />;
  return <XCircle size={14} className="text-red-500" />;
}

function displayGrade(status: string, grade: number | null): string {
  if (status === 'present') return grade !== null ? String(grade) : '—';
  if (status === 'makeup') return grade !== null ? `Н(${grade})` : 'Н';
  return 'Н';
}

/* ─── Main Component ─── */

export function GradesPage() {
  const { lang, user } = useAuthStore();

  if (user?.role === 'student') return <StudentView lang={lang} userId={user.id} />;
  if (user?.role === 'admin' || user?.role === 'teacher') return <TeacherAdminView lang={lang} />;

  return (
    <div className="py-20 text-center text-gray-400">
      {lang === 'kz' ? 'Қол жетімсіз' : 'Нет доступа'}
    </div>
  );
}

/* ─── Teacher / Admin View ─── */

function TeacherAdminView({ lang }: { lang: 'kz' | 'ru' }) {
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [selectedClass, setSelectedClass] = useState('');
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [monthly, setMonthly] = useState<MonthlyRow[]>([]);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [gradingSession, setGradingSession] = useState<SessionRow | null>(null);

  // Load classes
  useEffect(() => {
    api.get<ClassRow[]>('/api/sessions/classes')
      .then((res) => {
        const d = Array.isArray(res) ? res : [];
        setClasses(d);
        if (d.length > 0 && d[0]) setSelectedClass(d[0].id);
      })
      .catch(() => {});
  }, []);

  // Load monthly data + sessions when class or month changes
  useEffect(() => {
    if (!selectedClass) return;
    setLoading(true);
    setGradingSession(null);

    Promise.all([
      api.get<MonthlyRow[]>(`/api/grades/classes/${selectedClass}/monthly`, { month }),
      api.get<SessionRow[]>(`/api/grades/classes/${selectedClass}/sessions`, { month }),
    ])
      .then(([m, s]) => {
        setMonthly(Array.isArray(m) ? m : []);
        setSessions(Array.isArray(s) ? s : []);
      })
      .catch(() => { setMonthly([]); setSessions([]); })
      .finally(() => setLoading(false));
  }, [selectedClass, month]);

  const refresh = () => {
    if (!selectedClass) return;
    Promise.all([
      api.get<MonthlyRow[]>(`/api/grades/classes/${selectedClass}/monthly`, { month }),
      api.get<SessionRow[]>(`/api/grades/classes/${selectedClass}/sessions`, { month }),
    ])
      .then(([m, s]) => {
        setMonthly(Array.isArray(m) ? m : []);
        setSessions(Array.isArray(s) ? s : []);
      })
      .catch(() => {});
  };

  if (gradingSession) {
    return (
      <SessionGradingForm
        lang={lang}
        session={gradingSession}
        onBack={() => { setGradingSession(null); refresh(); }}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-gray-900">
          {lang === 'kz' ? 'Бағалар журналы' : 'Журнал оценок'}
        </h1>
        <div className="flex flex-wrap gap-2">
          <select
            className="input-field w-full sm:w-auto sm:min-w-[180px]"
            value={selectedClass}
            onChange={(e) => setSelectedClass(e.target.value)}
          >
            {classes.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <input
            type="month"
            className="input-field w-full sm:w-auto"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
          />
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 size={32} className="animate-spin text-primary-600" />
        </div>
      ) : (
        <>
          {/* Monthly averages table */}
          <div className="card">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">
              {lang === 'kz' ? 'Ай бойынша орта баға' : 'Средние оценки за месяц'}
              <span className="ml-2 text-sm font-normal text-gray-400">
                ({lang === 'kz' ? 'формула: барлық бағалар қосындысы ÷ сабақ саны' : 'формула: сумма оценок ÷ кол-во уроков'})
              </span>
            </h2>

            {monthly.length === 0 ? (
              <div className="py-8 text-center text-gray-400">
                <Star size={32} className="mx-auto mb-2" />
                {lang === 'kz' ? 'Оқушылар жоқ' : 'Нет учеников'}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">{lang === 'kz' ? 'Оқушы' : 'Ученик'}</th>
                      <th className="px-3 py-3 text-center text-xs font-semibold uppercase text-gray-500">{lang === 'kz' ? 'Сабақтар' : 'Уроков'}</th>
                      <th className="px-3 py-3 text-center text-xs font-semibold uppercase text-green-600">✓</th>
                      <th className="px-3 py-3 text-center text-xs font-semibold uppercase text-red-500">Н</th>
                      <th className="px-3 py-3 text-center text-xs font-semibold uppercase text-blue-600">{lang === 'kz' ? 'Қайта' : 'Отраб'}</th>
                      <th className="px-3 py-3 text-center text-xs font-semibold uppercase text-gray-500">{lang === 'kz' ? 'Қосынды' : 'Сумма'}</th>
                      <th className="px-3 py-3 text-center text-xs font-semibold uppercase text-gray-900">{lang === 'kz' ? 'Орта баға' : 'Средний'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {monthly.map((s) => (
                      <tr key={s.student_id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm font-medium text-gray-900">
                          <div className="flex items-center gap-2">
                            <span>{s.student_name}</span>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-center text-sm text-gray-600">{s.total_sessions}</td>
                        <td className="px-3 py-3 text-center text-sm text-green-700">{s.attended}</td>
                        <td className="px-3 py-3 text-center text-sm text-red-600">{s.absent}</td>
                        <td className="px-3 py-3 text-center text-sm text-blue-600">{s.makeup}</td>
                        <td className="px-3 py-3 text-center text-sm text-gray-600">{s.sum_grades}</td>
                        <td className="px-3 py-3 text-center">
                          <span className={`inline-flex h-8 min-w-[2.5rem] items-center justify-center rounded-full px-2 text-sm font-bold ${
                            s.total_sessions > 0 ? gradeColor(s.average) : 'bg-gray-100 text-gray-400'
                          }`}>
                            {s.total_sessions > 0 ? s.average : '—'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Sessions list for grading */}
          <div className="card">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">
              {lang === 'kz' ? 'Сабақтар — бағалау' : 'Занятия — выставление оценок'}
            </h2>

            {sessions.length === 0 ? (
              <p className="py-6 text-center text-sm text-gray-400">
                {lang === 'kz' ? 'Аяқталған сабақтар жоқ' : 'Нет завершённых занятий'}
              </p>
            ) : (
              <div className="space-y-2">
                {sessions.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setGradingSession(s)}
                    className="flex w-full items-center gap-3 rounded-lg border border-gray-200 p-3 text-left transition-colors hover:border-primary-300 hover:bg-primary-50"
                  >
                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-600">
                      <Star size={18} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{s.topic}</p>
                      <p className="text-xs text-gray-500">{s.planned_date}</p>
                    </div>
                    <span className="text-xs font-medium text-primary-600">
                      {lang === 'kz' ? 'Бағалау →' : 'Оценить →'}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/* ─── Session Grading Form ─── */

interface GradingFormEntry {
  student_id: string;
  student_name: string;
  status: 'present' | 'absent' | 'makeup';
  grade: number | null;
  comment: string;
  student_avatar_url?: string | null;
}

function SessionGradingForm({ lang, session, onBack }: {
  lang: 'kz' | 'ru';
  session: SessionRow;
  onBack: () => void;
}) {
  const [entries, setEntries] = useState<GradingFormEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    loadGrades();
  }, [session.id]);

  const loadGrades = async () => {
    setLoading(true);
    try {
      // First init grades (creates absent entries for new students)
      await api.post(`/api/grades/sessions/${session.id}/init`, {});

      // Then load them
      const res = await api.get<GradeEntry[]>(`/api/grades/sessions/${session.id}/grades`);
      const data = Array.isArray(res) ? res : [];
      setEntries(data.map(g => ({
        student_id: g.student_id,
        student_name: g.student_name,
        status: g.status,
        grade: g.grade,
        comment: g.comment ?? '',
        student_avatar_url: g.student_avatar_url,
      })));
    } catch {
      setEntries([]);
    } finally {
      setLoading(false);
    }
  };

  const updateEntry = (idx: number, field: string, value: unknown) => {
    setEntries(prev => {
      const next = [...prev];
      const entry = { ...next[idx]! };

      if (field === 'status') {
        entry.status = value as 'present' | 'absent' | 'makeup';
        if (entry.status === 'absent') {
          entry.grade = null;
        } else if (entry.grade === null) {
          entry.grade = 0;
        }
      } else if (field === 'grade') {
        const v = Number(value);
        entry.grade = isNaN(v) ? null : Math.min(100, Math.max(0, v));
      } else if (field === 'comment') {
        entry.comment = value as string;
      }

      next[idx] = entry;
      return next;
    });
    setSaved(false);
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      await api.put(`/api/grades/sessions/${session.id}/grades`, {
        grades: entries.map(e => ({
          student_id: e.student_id,
          status: e.status,
          grade: e.status === 'absent' ? null : e.grade,
          comment: e.comment || null,
        })),
      });
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : (lang === 'kz' ? 'Қате' : 'Ошибка'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="btn-secondary px-3 py-2">
          <ChevronLeft size={16} />
        </button>
        <div>
          <h2 className="text-xl font-bold text-gray-900">{session.topic}</h2>
          <p className="text-sm text-gray-500">{session.planned_date}</p>
        </div>
      </div>

      {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {saved && <div className="rounded-lg bg-green-50 p-3 text-sm text-green-700">{lang === 'kz' ? 'Сақталды!' : 'Сохранено!'}</div>}

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 size={32} className="animate-spin text-primary-600" />
        </div>
      ) : entries.length === 0 ? (
        <div className="card py-10 text-center text-gray-400">
          {lang === 'kz' ? 'Оқушылар жоқ' : 'Нет учеников'}
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">
                    {lang === 'kz' ? 'Оқушы' : 'Ученик'}
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold uppercase text-gray-500">
                    {lang === 'kz' ? 'Қатысу' : 'Статус'}
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold uppercase text-gray-500">
                    {lang === 'kz' ? 'Баға (0-100)' : 'Оценка (0-100)'}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">
                    {lang === 'kz' ? 'Пікір' : 'Комментарий'}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {entries.map((e, idx) => (
                  <tr key={e.student_id} className={
                    e.status === 'absent' ? 'bg-red-50/50' :
                    e.status === 'makeup' ? 'bg-blue-50/50' : ''
                  }>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        {statusIcon(e.status)}
                        <Avatar name={e.student_name} size="xs" avatarUrl={e.student_avatar_url} />
                        <span className="text-sm font-medium text-gray-900">{e.student_name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <select
                        className="rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-xs font-medium"
                        value={e.status}
                        onChange={(ev) => updateEntry(idx, 'status', ev.target.value)}
                      >
                        <option value="present">{lang === 'kz' ? '✓ Қатысты' : '✓ Присутствовал(а)'}</option>
                        <option value="absent">{lang === 'kz' ? '✗ Келмеді (Н)' : '✗ Отсутствовал(а) (Н)'}</option>
                        <option value="makeup">{lang === 'kz' ? '↻ Отработка Н(X)' : '↻ Отработка Н(X)'}</option>
                      </select>
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      {e.status === 'absent' ? (
                        <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-red-100 text-sm font-bold text-red-600">Н</span>
                      ) : (
                        <input
                          type="number"
                          min={0}
                          max={100}
                          className="w-16 rounded-lg border border-gray-300 px-2 py-1.5 text-center text-sm font-medium focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                          value={e.grade ?? ''}
                          onChange={(ev) => updateEntry(idx, 'grade', ev.target.value)}
                        />
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <input
                        type="text"
                        className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm text-gray-700 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                        placeholder={lang === 'kz' ? 'Пікір...' : 'Комментарий...'}
                        value={e.comment}
                        onChange={(ev) => updateEntry(idx, 'comment', ev.target.value)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
            <p className="text-xs text-gray-400">
              {lang === 'kz'
                ? 'Н = келмеді (0 балл), Н(X) = отработка (X балл)'
                : 'Н = отсутствовал (0 баллов), Н(X) = отработка (X баллов)'}
            </p>
            <button
              onClick={handleSave}
              disabled={saving}
              className="btn-primary w-full sm:w-auto"
            >
              {saving ? <Loader2 size={16} className="mr-2 animate-spin" /> : <Save size={16} className="mr-2" />}
              {lang === 'kz' ? 'Сақтау' : 'Сохранить'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/* ─── Student View ─── */

function StudentView({ lang, userId }: { lang: 'kz' | 'ru'; userId: string }) {
  const [grades, setGrades] = useState<StudentGrade[]>([]);
  const [monthly, setMonthly] = useState<StudentMonthly[]>([]);
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.get<StudentGrade[]>(`/api/grades/students/${userId}/grades`),
      api.get<StudentMonthly[]>(`/api/grades/students/${userId}/monthly`, { month }),
    ])
      .then(([g, m]) => {
        setGrades(Array.isArray(g) ? g : []);
        setMonthly(Array.isArray(m) ? m : []);
      })
      .catch(() => { setGrades([]); setMonthly([]); })
      .finally(() => setLoading(false));
  }, [userId, month]);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 size={32} className="animate-spin text-primary-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-gray-900">
          {lang === 'kz' ? 'Менің бағаларым' : 'Мои оценки'}
        </h1>
        <input
          type="month"
          className="input-field w-auto"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
        />
      </div>

      {/* Monthly averages */}
      {monthly.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {monthly.map((m) => (
            <div key={m.class_id} className="card text-center">
              <p className="text-sm font-medium text-gray-500">{m.class_name}</p>
              <p className={`mt-2 text-3xl font-bold ${m.total_sessions > 0 ? gradeColor(m.average).split(' ')[0]! : 'text-gray-400'}`}>
                {m.total_sessions > 0 ? m.average : '—'}
              </p>
              <p className="mt-1 text-xs text-gray-400">
                {lang === 'kz'
                  ? `${m.total_sessions} сабақ, баллдар: ${m.sum_grades}`
                  : `${m.total_sessions} уроков, баллы: ${m.sum_grades}`}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* All grades */}
      {grades.length === 0 ? (
        <div className="card py-10 text-center text-gray-400">
          <Star size={32} className="mx-auto mb-2" />
          {lang === 'kz' ? 'Бағалар жоқ' : 'Оценок пока нет'}
        </div>
      ) : (
        <>
        <div className="hidden md:block overflow-hidden rounded-xl border border-gray-200 bg-white">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">{lang === 'kz' ? 'Тақырып' : 'Тема'}</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">{lang === 'kz' ? 'Топ' : 'Группа'}</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">{lang === 'kz' ? 'Күні' : 'Дата'}</th>
                <th className="px-4 py-3 text-center text-xs font-semibold uppercase text-gray-500">{lang === 'kz' ? 'Қатысу' : 'Статус'}</th>
                <th className="px-4 py-3 text-center text-xs font-semibold uppercase text-gray-500">{lang === 'kz' ? 'Баға' : 'Оценка'}</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">{lang === 'kz' ? 'Пікір' : 'Комментарий'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {grades.map((g) => (
                <tr key={g.id} className={g.status === 'absent' ? 'bg-red-50/40' : g.status === 'makeup' ? 'bg-blue-50/40' : ''}>
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{g.topic}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{g.class_name}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{g.planned_date}</td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-1">
                      {statusIcon(g.status)}
                      <span className="text-xs">{
                        g.status === 'present' ? (lang === 'kz' ? 'Қатысты' : 'Присутствовал(а)') :
                        g.status === 'makeup' ? (lang === 'kz' ? 'Отработка' : 'Отработка') :
                        lang === 'kz' ? 'Келмеді' : 'Отсутствовал(а)'
                      }</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-flex h-7 min-w-[1.75rem] items-center justify-center rounded-full px-1.5 text-sm font-bold ${
                      g.status === 'absent' ? 'bg-red-100 text-red-600' :
                      g.grade !== null ? gradeColor(g.grade) : 'bg-gray-100 text-gray-400'
                    }`}>
                      {displayGrade(g.status, g.grade)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">{g.comment || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile card list */}
        <div className="md:hidden space-y-2">
          {grades.map((g) => (
            <div key={g.id} className={`rounded-xl border bg-white p-3 space-y-1.5 ${
              g.status === 'absent' ? 'border-red-200 bg-red-50/30' : g.status === 'makeup' ? 'border-blue-200 bg-blue-50/30' : 'border-gray-200'
            }`}>
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-semibold text-gray-900 leading-tight">{g.topic}</p>
                <span className={`shrink-0 inline-flex h-7 min-w-[1.75rem] items-center justify-center rounded-full px-1.5 text-sm font-bold ${
                  g.status === 'absent' ? 'bg-red-100 text-red-600' :
                  g.grade !== null ? gradeColor(g.grade) : 'bg-gray-100 text-gray-400'
                }`}>
                  {displayGrade(g.status, g.grade)}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
                <span>{g.class_name}</span>
                <span>{g.planned_date}</span>
                <span className="flex items-center gap-1">
                  {statusIcon(g.status)}
                  {g.status === 'present' ? (lang === 'kz' ? 'Қатысты' : 'Присутствовал(а)') :
                   g.status === 'makeup' ? (lang === 'kz' ? 'Отработка' : 'Отработка') :
                   lang === 'kz' ? 'Келмеді' : 'Отсутствовал(а)'}
                </span>
              </div>
              {g.comment && <p className="text-xs text-gray-400">{g.comment}</p>}
            </div>
          ))}
        </div>
        </>
      )}
    </div>
  );
}
