import React, { useEffect, useState } from 'react';
import { useAuthStore } from '../store/auth';
import { api } from '../lib/api';
import { StatusBadge } from '../components/StatusBadge';
import { CalendarDays, CheckCircle2, Clock, TrendingUp } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import type { TarbieSession, SessionStatus } from '@tarbie/shared';

interface SessionWithMeta extends TarbieSession {
  class_name: string;
  teacher_name: string;
}

export function DashboardPage() {
  const { user, lang } = useAuthStore();
  const [sessions, setSessions] = useState<SessionWithMeta[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const now = new Date();
        const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        const result = await api.getRaw<{ data: SessionWithMeta[]; total: number }>('/api/sessions', { month, pageSize: '500' });
        setSessions(result.data ?? []);
      } catch {
        setSessions([]);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const stats = {
    total: sessions.length,
    completed: sessions.filter((s) => s.status === 'completed').length,
    planned: sessions.filter((s) => s.status === 'planned').length,
    cancelled: sessions.filter((s) => s.status === 'cancelled').length,
  };

  const completionRate = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;

  const chartData = [
    { name: lang === 'kz' ? 'Аяқталған' : 'Завершено', value: stats.completed, color: '#22c55e' },
    { name: lang === 'kz' ? 'Жоспарланған' : 'Запланировано', value: stats.planned, color: '#3b82f6' },
    { name: lang === 'kz' ? 'Бас тартылған' : 'Отменено', value: stats.cancelled, color: '#ef4444' },
  ];

  const upcoming = sessions
    .filter((s) => s.status === 'planned')
    .sort((a, b) => a.planned_date.localeCompare(b.planned_date))
    .slice(0, 5);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-200 border-t-primary-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          {lang === 'kz' ? 'Сәлеметсіз бе' : 'Добро пожаловать'}, <span className="text-primary-600">{user?.full_name?.split(' ')[0]}</span>!
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          {lang === 'kz' ? 'Ағымдағы ай бойынша жалпы шолу' : 'Обзор за текущий месяц'}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<CalendarDays size={20} />}
          label={lang === 'kz' ? 'Барлығы' : 'Всего'}
          value={stats.total}
          color="bg-gray-100 text-gray-700"
        />
        <StatCard
          icon={<CheckCircle2 size={20} />}
          label={lang === 'kz' ? 'Аяқталған' : 'Завершено'}
          value={stats.completed}
          color="bg-green-100 text-green-700"
        />
        <StatCard
          icon={<Clock size={20} />}
          label={lang === 'kz' ? 'Жоспарланған' : 'Запланировано'}
          value={stats.planned}
          color="bg-blue-100 text-blue-700"
        />
        <StatCard
          icon={<TrendingUp size={20} />}
          label={lang === 'kz' ? 'Орындалу %' : 'Выполнение %'}
          value={`${completionRate}%`}
          color="bg-purple-100 text-purple-700"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="card">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">
            {lang === 'kz' ? 'Ай статистикасы' : 'Статистика за месяц'}
          </h2>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
              <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                {chartData.map((entry, index) => (
                  <Cell key={index} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">
            {lang === 'kz' ? 'Алдағы сабақтар' : 'Предстоящие занятия'}
          </h2>
          {upcoming.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-400">
              {lang === 'kz' ? 'Жоспарланған сабақтар жоқ' : 'Нет запланированных занятий'}
            </p>
          ) : (
            <div className="space-y-3">
              {upcoming.map((s) => (
                <div key={s.id} className="flex items-center gap-3 rounded-lg border border-gray-100 p-3">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-600">
                    <CalendarDays size={18} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-gray-900">{s.topic}</p>
                    <p className="text-xs text-gray-500">
                      {s.planned_date}{s.time_slot ? ` · ${s.time_slot}` : ''} · {s.class_name}{s.room ? ` · ${s.room}` : ''}
                    </p>
                  </div>
                  <StatusBadge status={s.status as SessionStatus} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ChartTooltip({ active, payload }: {
  active?: boolean;
  payload?: Array<{ value: number; payload: { name: string; color: string } }>;
}) {
  const first = payload?.[0];
  if (!active || !first) return null;
  const item = first.payload;
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-sm">
      <p className="flex items-center gap-2 text-sm font-medium text-gray-900">
        <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
        {item.name}
      </p>
      <p className="mt-0.5 text-sm text-gray-600">{first.value}</p>
    </div>
  );
}

function StatCard({ icon, label, value, color }: {
  icon: React.ReactNode; label: string; value: string | number; color: string;
}) {
  return (
    <div className="card flex items-center gap-4">
      <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${color}`}>
        {icon}
      </div>
      <div>
        <p className="text-sm text-gray-500">{label}</p>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
      </div>
    </div>
  );
}
