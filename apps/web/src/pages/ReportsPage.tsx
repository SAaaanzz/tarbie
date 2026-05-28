import { useEffect, useState } from 'react';
import { useAuthStore } from '../store/auth';
import { api } from '../lib/api';
import { BarChart3, Download, Loader2 } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

interface ClassOption {
  id: string;
  name: string;
}

interface ReportData {
  class_name: string;
  month: string;
  total_planned: number;
  total_completed: number;
  total_cancelled: number;
  total_rescheduled: number;
  completion_rate: number;
  attendance_rate: number;
  total_students: number;
  sessions: Array<{
    id: string;
    topic: string;
    planned_date: string;
    status: string;
  }>;
}

export function ReportsPage() {
  const { lang } = useAuthStore();
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [classId, setClassId] = useState('');
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [report, setReport] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.get<ClassOption[]>('/api/sessions/classes')
      .then((res) => {
        const data = Array.isArray(res) ? res : [];
        setClasses(data);
        if (data.length > 0 && !classId) setClassId(data[0]!.id);
      })
      .catch(() => setClasses([]));
  }, []);

  const loadReport = async () => {
    if (!classId || !month) return;
    setLoading(true);
    try {
      const res = await api.get<ReportData>('/api/reports/monthly', { classId, month });
      setReport(res);
    } catch {
      setReport(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (classId) loadReport();
  }, [classId, month]);

  const chartData = report ? [
    {
      name: lang === 'kz' ? 'Аяқталған' : 'Завершено',
      value: report.total_completed,
    },
    {
      name: lang === 'kz' ? 'Жоспарланған' : 'Запланировано',
      value: report.total_planned - report.total_completed - report.total_cancelled - report.total_rescheduled,
    },
    {
      name: lang === 'kz' ? 'Бас тартылған' : 'Отменено',
      value: report.total_cancelled,
    },
    {
      name: lang === 'kz' ? 'Ауыстырылған' : 'Перенесено',
      value: report.total_rescheduled,
    },
  ] : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          {lang === 'kz' ? 'Есептер' : 'Отчёты'}
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          {lang === 'kz' ? 'Ай сайынғы статистика' : 'Ежемесячная статистика'}
        </p>
      </div>

      <div className="card">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              {lang === 'kz' ? 'Топ' : 'Группа'}
            </label>
            <select
              className="input-field"
              value={classId}
              onChange={(e) => setClassId(e.target.value)}
            >
              {classes.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div className="flex-1">
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              {lang === 'kz' ? 'Ай' : 'Месяц'}
            </label>
            <input
              type="month"
              className="input-field"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
            />
          </div>
          <button className="btn-secondary w-full sm:w-auto" onClick={loadReport} disabled={loading}>
            {loading ? <Loader2 size={18} className="animate-spin" /> : <BarChart3 size={18} />}
            <span className="ml-2">{lang === 'kz' ? 'Жүктеу' : 'Загрузить'}</span>
          </button>
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={32} className="animate-spin text-primary-600" />
        </div>
      )}

      {report && !loading && (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <MetricCard
              label={lang === 'kz' ? 'Барлық сабақтар' : 'Всего занятий'}
              value={report.total_planned}
              color="text-gray-900"
            />
            <MetricCard
              label={lang === 'kz' ? 'Орындалу' : 'Выполнение'}
              value={`${report.completion_rate}%`}
              color="text-green-600"
            />
            <MetricCard
              label={lang === 'kz' ? 'Қатысу' : 'Посещаемость'}
              value={`${report.attendance_rate}%`}
              color="text-blue-600"
            />
            <MetricCard
              label={lang === 'kz' ? 'Студенттер' : 'Студентов'}
              value={report.total_students}
              color="text-purple-600"
            />
          </div>

          <div className="card">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">
              {lang === 'kz' ? 'Сабақтар бөлінісі' : 'Распределение занятий'}
            </h2>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis type="number" />
                <YAxis dataKey="name" type="category" width={120} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend />
                <Bar dataKey="value" fill="#3b82f6" radius={[0, 6, 6, 0]} name={lang === 'kz' ? 'Саны' : 'Количество'} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">
                {lang === 'kz' ? 'Сабақтар тізімі' : 'Список занятий'}
              </h2>
              <button className="btn-secondary text-xs">
                <Download size={14} className="mr-1" />
                PDF
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-semibold uppercase text-gray-500">
                      {lang === 'kz' ? 'Тақырып' : 'Тема'}
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-semibold uppercase text-gray-500">
                      {lang === 'kz' ? 'Күні' : 'Дата'}
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-semibold uppercase text-gray-500">
                      {lang === 'kz' ? 'Мәртебе' : 'Статус'}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {report.sessions.map((s) => (
                    <tr key={s.id}>
                      <td className="px-4 py-2 text-sm text-gray-900">{s.topic}</td>
                      <td className="px-4 py-2 text-sm text-gray-600">{s.planned_date}</td>
                      <td className="px-4 py-2">
                        <span className={`badge-${s.status}`}>
                          {s.status === 'completed' ? (lang === 'kz' ? 'Аяқталған' : 'Завершён') :
                           s.status === 'planned' ? (lang === 'kz' ? 'Жоспарланған' : 'Запланирован') :
                           s.status === 'cancelled' ? (lang === 'kz' ? 'Бас тартылған' : 'Отменён') :
                           lang === 'kz' ? 'Ауыстырылған' : 'Перенесён'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function MetricCard({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div className="card text-center">
      <p className="text-sm text-gray-500">{label}</p>
      <p className={`mt-1 text-3xl font-bold ${color}`}>{value}</p>
    </div>
  );
}
