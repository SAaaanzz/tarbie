// Страница «Мероприятия»: список и управление событиями.
import React, { useEffect, useState } from 'react';
import { useAuthStore } from '../store/auth';
import { api } from '../lib/api';
import { CalendarHeart, Plus, Loader2, MapPin, Users, Clock, X, Trash2, UserPlus, UserMinus } from 'lucide-react';
import { Avatar } from '../components/Avatar';

interface EventItem {
  id: string;
  title: string;
  description: string | null;
  event_date: string;
  event_time: string | null;
  location: string | null;
  capacity: number;
  registered_count: number;
  creator_name: string;
  created_by: string;
  status: string;
}

interface EventDetail extends EventItem {
  registrations: Array<{ id: string; student_id: string; student_name: string; registered_at: string; student_avatar_url?: string | null }>;
  is_registered: boolean;
}

export function EventsPage() {
  const { user, lang } = useAuthStore();
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<string | null>(null);
  const [detail, setDetail] = useState<EventDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const isAdmin = user?.role === 'admin';
  const isTeacher = user?.role === 'teacher';
  const canCreate = isAdmin || isTeacher;

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get<EventItem[]>('/api/events');
      setEvents(Array.isArray(res) ? res : []);
    } catch { setEvents([]); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const loadDetail = async (id: string) => {
    setSelectedEvent(id);
    setDetailLoading(true);
    try {
      const res = await api.get<EventDetail>(`/api/events/${id}`);
      setDetail(res);
    } catch { setDetail(null); }
    finally { setDetailLoading(false); }
  };

  const handleRegister = async () => {
    if (!selectedEvent) return;
    setActionLoading(true);
    try {
      await api.post(`/api/events/${selectedEvent}/register`);
      await loadDetail(selectedEvent);
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : (lang === 'kz' ? 'Қате' : 'Ошибка'));
    } finally { setActionLoading(false); }
  };

  const handleUnregister = async () => {
    if (!selectedEvent) return;
    setActionLoading(true);
    try {
      await api.delete(`/api/events/${selectedEvent}/register`);
      await loadDetail(selectedEvent);
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : (lang === 'kz' ? 'Қате' : 'Ошибка'));
    } finally { setActionLoading(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(lang === 'kz' ? 'Жоюға сенімдісіз бе?' : 'Удалить мероприятие?')) return;
    try {
      await api.delete(`/api/events/${id}`);
      setSelectedEvent(null);
      setDetail(null);
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : (lang === 'kz' ? 'Қате' : 'Ошибка'));
    }
  };

  const statusColor = (s: string) => {
    if (s === 'upcoming') return 'bg-blue-100 text-blue-700';
    if (s === 'ongoing') return 'bg-green-100 text-green-700';
    if (s === 'completed') return 'bg-gray-100 text-gray-600';
    return 'bg-red-100 text-red-700';
  };

  const statusLabel = (s: string) => {
    const map: Record<string, Record<string, string>> = {
      upcoming: { kz: 'Алдағы', ru: 'Предстоящее' },
      ongoing: { kz: 'Жүріп жатыр', ru: 'Идёт' },
      completed: { kz: 'Аяқталды', ru: 'Завершено' },
      cancelled: { kz: 'Бас тартылды', ru: 'Отменено' },
    };
    return map[s]?.[lang] ?? s;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <CalendarHeart size={24} className="text-pink-600" />
          {lang === 'kz' ? 'Іс-шаралар' : 'Мероприятия'}
        </h1>
        {canCreate && (
          <button className="btn-primary text-sm" onClick={() => setShowCreate(true)}>
            <Plus size={16} className="mr-1" />
            {lang === 'kz' ? 'Жаңа іс-шара' : 'Новое мероприятие'}
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 size={24} className="animate-spin text-gray-400" /></div>
      ) : events.length === 0 ? (
        <div className="rounded-2xl bg-white p-8 text-center shadow-sm border border-gray-200">
          <CalendarHeart size={40} className="mx-auto mb-3 text-gray-300" />
          <p className="text-gray-500">{lang === 'kz' ? 'Іс-шаралар жоқ' : 'Нет мероприятий'}</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {events.map(ev => (
            <div key={ev.id} onClick={() => loadDetail(ev.id)}
              className="cursor-pointer rounded-xl bg-white p-4 shadow-sm border border-gray-200 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-2">
                <h3 className="font-semibold text-gray-900 line-clamp-2">{ev.title}</h3>
                <span className={`shrink-0 ml-2 rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusColor(ev.status)}`}>
                  {statusLabel(ev.status)}
                </span>
              </div>
              {ev.description && <p className="text-xs text-gray-500 line-clamp-2 mb-3">{ev.description}</p>}
              <div className="flex flex-wrap gap-3 text-xs text-gray-500">
                <span className="flex items-center gap-1"><Clock size={12} />{ev.event_date}{ev.event_time ? ` ${ev.event_time}` : ''}</span>
                {ev.location && <span className="flex items-center gap-1"><MapPin size={12} />{ev.location}</span>}
                <span className="flex items-center gap-1">
                  <Users size={12} />
                  {ev.registered_count}{ev.capacity > 0 ? `/${ev.capacity}` : ''}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Detail modal */}
      {selectedEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-y-auto">
          <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl my-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">{lang === 'kz' ? 'Іс-шара' : 'Мероприятие'}</h2>
              <button onClick={() => { setSelectedEvent(null); setDetail(null); }} className="rounded p-1 hover:bg-gray-100"><X size={20} /></button>
            </div>

            {detailLoading ? (
              <div className="flex justify-center py-8"><Loader2 size={24} className="animate-spin text-gray-400" /></div>
            ) : detail && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-lg font-bold text-gray-900">{detail.title}</h3>
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold mt-1 ${statusColor(detail.status)}`}>
                    {statusLabel(detail.status)}
                  </span>
                </div>

                {detail.description && <p className="text-sm text-gray-600">{detail.description}</p>}

                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-lg bg-gray-50 p-2.5">
                    <p className="text-xs text-gray-500 mb-0.5">{lang === 'kz' ? 'Күні' : 'Дата'}</p>
                    <p className="font-medium">{detail.event_date}{detail.event_time ? ` ${detail.event_time}` : ''}</p>
                  </div>
                  <div className="rounded-lg bg-gray-50 p-2.5">
                    <p className="text-xs text-gray-500 mb-0.5">{lang === 'kz' ? 'Орны' : 'Место'}</p>
                    <p className="font-medium">{detail.location || '—'}</p>
                  </div>
                  <div className="rounded-lg bg-gray-50 p-2.5">
                    <p className="text-xs text-gray-500 mb-0.5">{lang === 'kz' ? 'Тіркелгендер' : 'Зарегистрировано'}</p>
                    <p className="font-medium">{detail.registered_count}{detail.capacity > 0 ? ` / ${detail.capacity}` : ''}</p>
                  </div>
                  <div className="rounded-lg bg-gray-50 p-2.5">
                    <p className="text-xs text-gray-500 mb-0.5">{lang === 'kz' ? 'Ұйымдастырушы' : 'Организатор'}</p>
                    <p className="font-medium">{detail.creator_name}</p>
                  </div>
                </div>

                {/* Registration list */}
                {detail.registrations.length > 0 && (canCreate) && (
                  <div>
                    <p className="text-xs font-semibold text-gray-500 mb-1">{lang === 'kz' ? 'Қатысушылар' : 'Участники'} ({detail.registrations.length})</p>
                    <div className="max-h-32 overflow-auto rounded-lg border border-gray-200">
                      {detail.registrations.map((r, i) => (
                        <div key={r.id} className={`px-3 py-1.5 text-sm flex items-center gap-2 ${i > 0 ? 'border-t border-gray-100' : ''}`}>
                          <Avatar name={r.student_name} size="xs" avatarUrl={r.student_avatar_url} />
                          <span>{r.student_name}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-2 pt-2">
                  {(detail.status === 'upcoming' || detail.status === 'ongoing') && (
                    detail.is_registered ? (
                      <button className="btn-secondary text-sm flex-1" onClick={handleUnregister} disabled={actionLoading}>
                        {actionLoading ? <Loader2 size={14} className="animate-spin mr-1" /> : <UserMinus size={14} className="mr-1" />}
                        {lang === 'kz' ? 'Бас тарту' : 'Отменить запись'}
                      </button>
                    ) : (
                      <button className="btn-primary text-sm flex-1" onClick={handleRegister} disabled={actionLoading || (detail.capacity > 0 && detail.registered_count >= detail.capacity)}>
                        {actionLoading ? <Loader2 size={14} className="animate-spin mr-1" /> : <UserPlus size={14} className="mr-1" />}
                        {detail.capacity > 0 && detail.registered_count >= detail.capacity
                          ? (lang === 'kz' ? 'Орын жоқ' : 'Мест нет')
                          : (lang === 'kz' ? 'Тіркелу' : 'Записаться')}
                      </button>
                    )
                  )}
                  {canCreate && (
                    <button className="rounded-lg p-2 text-red-500 hover:bg-red-50" onClick={() => handleDelete(detail.id)}>
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <CreateEventModal lang={lang as 'kz' | 'ru'}
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); load(); }}
        />
      )}
    </div>
  );
}

function CreateEventModal({ lang, onClose, onCreated }: { lang: 'kz' | 'ru'; onClose: () => void; onCreated: () => void }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [eventTime, setEventTime] = useState('');
  const [location, setLocation] = useState('');
  const [capacity, setCapacity] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const todayStr = new Date().toISOString().split('T')[0]!;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await api.post('/api/events', { title, description: description || undefined, event_date: eventDate, event_time: eventTime || undefined, location: location || undefined, capacity });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : (lang === 'kz' ? 'Қате' : 'Ошибка'));
    } finally { setSubmitting(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">{lang === 'kz' ? 'Жаңа іс-шара' : 'Новое мероприятие'}</h2>
          <button onClick={onClose} className="rounded p-1 hover:bg-gray-100"><X size={20} /></button>
        </div>
        {error && <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">{lang === 'kz' ? 'Атауы' : 'Название'}</label>
            <input type="text" className="input-field" value={title} onChange={e => setTitle(e.target.value)} required
              placeholder={lang === 'kz' ? 'Іс-шара атауы' : 'Название мероприятия'} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">{lang === 'kz' ? 'Сипаттама' : 'Описание'}</label>
            <textarea className="input-field" rows={3} value={description} onChange={e => setDescription(e.target.value)}
              placeholder={lang === 'kz' ? 'Толық сипаттама' : 'Подробное описание'} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">{lang === 'kz' ? 'Күні' : 'Дата'}</label>
              <input type="date" className="input-field" value={eventDate} min={todayStr} onChange={e => setEventDate(e.target.value)} required />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">{lang === 'kz' ? 'Уақыты' : 'Время'}</label>
              <input type="time" className="input-field" value={eventTime} onChange={e => setEventTime(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">{lang === 'kz' ? 'Орны' : 'Место'}</label>
              <input type="text" className="input-field" value={location} onChange={e => setLocation(e.target.value)}
                placeholder={lang === 'kz' ? 'Мекен-жай' : 'Актовый зал'} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">{lang === 'kz' ? 'Орын саны' : 'Кол-во мест'}</label>
              <input type="number" className="input-field" value={capacity} min={0} onChange={e => setCapacity(Number(e.target.value))}
                placeholder="0 = без ограничений" />
              <p className="mt-0.5 text-[10px] text-gray-400">0 = {lang === 'kz' ? 'шектеусіз' : 'без ограничений'}</p>
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" className="btn-secondary" onClick={onClose}>{lang === 'kz' ? 'Бас тарту' : 'Отмена'}</button>
            <button type="submit" className="btn-primary" disabled={submitting}>
              {submitting ? <Loader2 size={16} className="animate-spin" /> : lang === 'kz' ? 'Құру' : 'Создать'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
