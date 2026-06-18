// Страница «Открытые занятия»: публикация открытых уроков и запись на них.
import React, { useEffect, useState } from 'react';
import { useAuthStore } from '../store/auth';
import { api } from '../lib/api';
import { Sparkles, Plus, Loader2, MapPin, Users, Clock, X, Trash2, UserPlus, UserMinus, DoorOpen, UsersRound } from 'lucide-react';
import { Avatar } from '../components/Avatar';
import { BUILDINGS, getFloorsForBuilding, getRoomsForFloor } from '@tarbie/shared';
import type { BuildingCode, RoomInfo } from '@tarbie/shared';

interface ClassRow { id: string; name: string; }

interface OpenSessionItem {
  id: string;
  title: string;
  description: string | null;
  session_date: string;
  session_time: string | null;
  location: string | null;
  max_students: number;
  registered_count: number;
  teacher_name: string;
  teacher_id: string;
  status: string;
  teacher_avatar_url?: string | null;
  class_id: string | null;
  class_name: string | null;
  room: string | null;
}

interface OpenSessionDetail extends OpenSessionItem {
  registrations: Array<{ id: string; student_id: string; student_name: string; registered_at: string; student_avatar_url?: string | null }>;
  is_registered: boolean;
}

export function OpenSessionsPage() {
  const { user, lang } = useAuthStore();
  const [sessions, setSessions] = useState<OpenSessionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<OpenSessionDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const isAdmin = user?.role === 'admin';
  const isTeacher = user?.role === 'teacher';
  const canCreate = isAdmin || isTeacher;

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get<OpenSessionItem[]>('/api/open-sessions');
      setSessions(Array.isArray(res) ? res : []);
    } catch { setSessions([]); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const loadDetail = async (id: string) => {
    setSelectedId(id);
    setDetailLoading(true);
    try {
      const res = await api.get<OpenSessionDetail>(`/api/open-sessions/${id}`);
      setDetail(res);
    } catch { setDetail(null); }
    finally { setDetailLoading(false); }
  };

  const handleRegister = async () => {
    if (!selectedId) return;
    setActionLoading(true);
    try {
      await api.post(`/api/open-sessions/${selectedId}/register`);
      await loadDetail(selectedId);
      await load();
    } catch (err) { alert(err instanceof Error ? err.message : (lang === 'kz' ? 'Қате' : 'Ошибка')); }
    finally { setActionLoading(false); }
  };

  const handleUnregister = async () => {
    if (!selectedId) return;
    setActionLoading(true);
    try {
      await api.delete(`/api/open-sessions/${selectedId}/register`);
      await loadDetail(selectedId);
      await load();
    } catch (err) { alert(err instanceof Error ? err.message : (lang === 'kz' ? 'Қате' : 'Ошибка')); }
    finally { setActionLoading(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(lang === 'kz' ? 'Жоюға сенімдісіз бе?' : 'Удалить занятие?')) return;
    try {
      await api.delete(`/api/open-sessions/${id}`);
      setSelectedId(null); setDetail(null);
      await load();
    } catch (err) { alert(err instanceof Error ? err.message : (lang === 'kz' ? 'Қате' : 'Ошибка')); }
  };

  const statusColor = (s: string) => {
    if (s === 'open') return 'bg-green-100 text-green-700';
    if (s === 'closed') return 'bg-amber-100 text-amber-700';
    if (s === 'completed') return 'bg-gray-100 text-gray-600';
    return 'bg-red-100 text-red-700';
  };

  const statusLabel = (s: string) => {
    const map: Record<string, Record<string, string>> = {
      open: { kz: 'Ашық', ru: 'Открыто' },
      closed: { kz: 'Жабық', ru: 'Закрыто' },
      completed: { kz: 'Аяқталды', ru: 'Завершено' },
      cancelled: { kz: 'Бас тартылды', ru: 'Отменено' },
    };
    return map[s]?.[lang] ?? s;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <Sparkles size={24} className="text-yellow-500" />
          {lang === 'kz' ? 'Ашық сабақтар' : 'Открытые занятия'}
        </h1>
        {canCreate && (
          <button className="btn-primary text-sm" onClick={() => setShowCreate(true)}>
            <Plus size={16} className="mr-1" />
            {lang === 'kz' ? 'Жаңа ашық сабақ' : 'Новое открытое занятие'}
          </button>
        )}
      </div>

      <p className="text-sm text-gray-500">
        {lang === 'kz'
          ? 'Кураторлар ашық сабақтар жасайды — топ студенттері қатыса алады'
          : 'Кураторы создают открытые занятия для группы — студенты видят свои занятия'}
      </p>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 size={24} className="animate-spin text-gray-400" /></div>
      ) : sessions.length === 0 ? (
        <div className="rounded-2xl bg-white p-8 text-center shadow-sm border border-gray-200">
          <Sparkles size={40} className="mx-auto mb-3 text-gray-300" />
          <p className="text-gray-500">{lang === 'kz' ? 'Ашық сабақтар жоқ' : 'Нет открытых занятий'}</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sessions.map(s => (
            <div key={s.id} onClick={() => loadDetail(s.id)}
              className="cursor-pointer rounded-xl bg-white p-4 shadow-sm border border-gray-200 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-2">
                <h3 className="font-semibold text-gray-900 line-clamp-2">{s.title}</h3>
                <span className={`shrink-0 ml-2 rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusColor(s.status)}`}>
                  {statusLabel(s.status)}
                </span>
              </div>
              {s.description && <p className="text-xs text-gray-500 line-clamp-2 mb-2">{s.description}</p>}
              <div className="flex items-center gap-1.5 text-xs text-gray-400 mb-3">
                <Avatar name={s.teacher_name} size="xs" avatarUrl={(s as any).teacher_avatar_url} />
                <span>{lang === 'kz' ? 'Куратор' : 'Куратор'}: </span>
                <span className="font-medium">{s.teacher_name}</span>
              </div>
              <div className="flex flex-wrap gap-3 text-xs text-gray-500">
                <span className="flex items-center gap-1"><Clock size={12} />{s.session_date}{s.session_time ? ` ${s.session_time}` : ''}</span>
                {s.room && <span className="flex items-center gap-1"><DoorOpen size={12} />{s.room}</span>}
                {s.class_name && <span className="flex items-center gap-1"><UsersRound size={12} />{s.class_name}</span>}
                {!s.room && s.location && <span className="flex items-center gap-1"><MapPin size={12} />{s.location}</span>}
                <span className="flex items-center gap-1">
                  <Users size={12} />{s.registered_count}/{s.max_students}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Detail modal */}
      {selectedId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-y-auto">
          <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl my-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">{lang === 'kz' ? 'Ашық сабақ' : 'Открытое занятие'}</h2>
              <button onClick={() => { setSelectedId(null); setDetail(null); }} className="rounded p-1 hover:bg-gray-100"><X size={20} /></button>
            </div>

            {detailLoading ? (
              <div className="flex justify-center py-8"><Loader2 size={24} className="animate-spin text-gray-400" /></div>
            ) : detail && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-lg font-bold text-gray-900">{detail.title}</h3>
                  <div className="flex items-center gap-1.5 text-xs text-gray-500 mt-0.5">
                    <Avatar name={detail.teacher_name} size="xs" avatarUrl={(detail as any).teacher_avatar_url} />
                    <span>{lang === 'kz' ? 'Куратор' : 'Куратор'}: </span>
                    <span className="font-medium">{detail.teacher_name}</span>
                  </div>
                </div>
                {detail.description && <p className="text-sm text-gray-600">{detail.description}</p>}

                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-lg bg-gray-50 p-2.5">
                    <p className="text-xs text-gray-500 mb-0.5">{lang === 'kz' ? 'Күні' : 'Дата'}</p>
                    <p className="font-medium">{detail.session_date}{detail.session_time ? ` ${detail.session_time}` : ''}</p>
                  </div>
                  <div className="rounded-lg bg-gray-50 p-2.5">
                    <p className="text-xs text-gray-500 mb-0.5">{lang === 'kz' ? 'Кабинет' : 'Кабинет'}</p>
                    <p className="font-medium">{detail.room || detail.location || '—'}</p>
                  </div>
                  <div className="rounded-lg bg-gray-50 p-2.5">
                    <p className="text-xs text-gray-500 mb-0.5">{lang === 'kz' ? 'Топ' : 'Группа'}</p>
                    <p className="font-medium">{(detail as any).class_name || '—'}</p>
                  </div>
                  <div className="rounded-lg bg-gray-50 p-2.5">
                    <p className="text-xs text-gray-500 mb-0.5">{lang === 'kz' ? 'Тіркелгендер' : 'Записано'}</p>
                    <p className="font-medium">{detail.registered_count} / {detail.max_students}</p>
                  </div>
                  <div className="rounded-lg bg-gray-50 p-2.5">
                    <p className="text-xs text-gray-500 mb-0.5">{lang === 'kz' ? 'Статус' : 'Статус'}</p>
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${statusColor(detail.status)}`}>{statusLabel(detail.status)}</span>
                  </div>
                </div>

                {detail.registrations.length > 0 && canCreate && (
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

                <div className="flex gap-2 pt-2">
                  {detail.status === 'open' && (
                    detail.is_registered ? (
                      <button className="btn-secondary text-sm flex-1" onClick={handleUnregister} disabled={actionLoading}>
                        {actionLoading ? <Loader2 size={14} className="animate-spin mr-1" /> : <UserMinus size={14} className="mr-1" />}
                        {lang === 'kz' ? 'Бас тарту' : 'Отменить запись'}
                      </button>
                    ) : (
                      <button className="btn-primary text-sm flex-1" onClick={handleRegister} disabled={actionLoading || detail.registered_count >= detail.max_students}>
                        {actionLoading ? <Loader2 size={14} className="animate-spin mr-1" /> : <UserPlus size={14} className="mr-1" />}
                        {detail.registered_count >= detail.max_students
                          ? (lang === 'kz' ? 'Орын жоқ' : 'Мест нет')
                          : (lang === 'kz' ? 'Тіркелу' : 'Записаться')}
                      </button>
                    )
                  )}
                  {(isAdmin || (isTeacher && detail.teacher_id === user?.id)) && (
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

      {showCreate && (
        <CreateOpenSessionModal lang={lang as 'kz' | 'ru'}
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); load(); }}
        />
      )}
    </div>
  );
}

function CreateOpenSessionModal({ lang, onClose, onCreated }: { lang: 'kz' | 'ru'; onClose: () => void; onCreated: () => void }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [sessionDate, setSessionDate] = useState('');
  const [sessionTime, setSessionTime] = useState('');
  const [maxStudents, setMaxStudents] = useState(30);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Room selector
  const [building, setBuilding] = useState<BuildingCode | ''>('');
  const [floor, setFloor] = useState<number | ''>('');
  const [selectedRoom, setSelectedRoom] = useState('');
  const floors = building ? getFloorsForBuilding(building as BuildingCode) : [];
  const rooms: RoomInfo[] = building && floor !== '' ? getRoomsForFloor(building as BuildingCode, Number(floor)) : [];

  // Class selector
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [classId, setClassId] = useState('');
  useEffect(() => {
    api.get<{ id: string; name: string }[]>('/api/sessions/classes')
      .then(res => setClasses(Array.isArray(res) ? res : []))
      .catch(() => {});
  }, []);

  const todayStr = new Date().toISOString().split('T')[0]!;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true); setError('');
    try {
      await api.post('/api/open-sessions', {
        title,
        description: description || undefined,
        session_date: sessionDate,
        session_time: sessionTime || undefined,
        room: selectedRoom || undefined,
        class_id: classId || undefined,
        max_students: maxStudents,
      });
      onCreated();
    } catch (err) { setError(err instanceof Error ? err.message : (lang === 'kz' ? 'Қате' : 'Ошибка')); }
    finally { setSubmitting(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-y-auto">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl my-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">{lang === 'kz' ? 'Жаңа ашық сабақ' : 'Новое открытое занятие'}</h2>
          <button onClick={onClose} className="rounded p-1 hover:bg-gray-100"><X size={20} /></button>
        </div>
        {error && <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">{lang === 'kz' ? 'Тақырып' : 'Тема'}</label>
            <input type="text" className="input-field" value={title} onChange={e => setTitle(e.target.value)} required
              placeholder={lang === 'kz' ? 'Сабақ тақырыбы' : 'Тема занятия'} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">{lang === 'kz' ? 'Сипаттама' : 'Описание'}</label>
            <textarea className="input-field" rows={2} value={description} onChange={e => setDescription(e.target.value)} />
          </div>

          {/* Group selector */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              <UsersRound size={14} className="inline mr-1" />
              {lang === 'kz' ? 'Топ (группа)' : 'Группа'}
            </label>
            <select className="input-field" value={classId} onChange={e => setClassId(e.target.value)}>
              <option value="">{lang === 'kz' ? 'Топты таңдаңыз' : 'Выберите группу'}</option>
              {classes.map(cl => <option key={cl.id} value={cl.id}>{cl.name}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">{lang === 'kz' ? 'Күні' : 'Дата'}</label>
              <input type="date" className="input-field" value={sessionDate} min={todayStr} onChange={e => setSessionDate(e.target.value)} required />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">{lang === 'kz' ? 'Уақыты' : 'Время'}</label>
              <input type="time" className="input-field" value={sessionTime} onChange={e => setSessionTime(e.target.value)} />
            </div>
          </div>

          {/* Room selector */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              <DoorOpen size={14} className="inline mr-1" />
              {lang === 'kz' ? 'Кабинет' : 'Кабинет'}
            </label>
            <div className="grid grid-cols-3 gap-2">
              <select className="input-field text-sm" value={building} onChange={e => { setBuilding(e.target.value as BuildingCode | ''); setFloor(''); setSelectedRoom(''); }}>
                <option value="">{lang === 'kz' ? 'Ғимарат' : 'Корпус'}</option>
                {BUILDINGS.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
              <select className="input-field text-sm" value={floor} disabled={!building} onChange={e => { setFloor(Number(e.target.value)); setSelectedRoom(''); }}>
                <option value="">{lang === 'kz' ? 'Қабат' : 'Этаж'}</option>
                {floors.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
              <select className="input-field text-sm" value={selectedRoom} disabled={!floor} onChange={e => setSelectedRoom(e.target.value)}>
                <option value="">{lang === 'kz' ? 'Кабинет' : 'Кабинет'}</option>
                {rooms.map(r => <option key={r.displayName} value={r.displayName}>{r.displayName}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">{lang === 'kz' ? 'Макс. студент' : 'Макс. студентов'}</label>
            <input type="number" className="input-field w-32" value={maxStudents} min={1} onChange={e => setMaxStudents(Number(e.target.value))} />
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
