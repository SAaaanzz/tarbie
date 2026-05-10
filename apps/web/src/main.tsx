import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { useAuthStore } from './store/auth';
import { Layout } from './components/Layout';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { SessionsPage } from './pages/SessionsPage';
import { ReportsPage } from './pages/ReportsPage';
import { SettingsPage } from './pages/SettingsPage';
import { GradesPage } from './pages/GradesPage';
import { EventsPage } from './pages/EventsPage';
import { OpenSessionsPage } from './pages/OpenSessionsPage';
import { ProfilePage } from './pages/ProfilePage';
import { SupportPage } from './pages/SupportPage';
import { AssistantPage } from './pages/AssistantPage';
import { TeacherRatingsPage } from './pages/TeacherRatingsPage';
import { CourseCatalogPage } from './pages/CourseCatalogPage';
import { CourseDetailPage } from './pages/CourseDetailPage';
import { LessonPage } from './pages/LessonPage';
import { MyCoursesPage } from './pages/MyCoursesPage';
import { CourseBuilderPage } from './pages/CourseBuilderPage';
import { TestRunnerPage } from './pages/TestRunnerPage';
import { StudentReviewPage } from './pages/StudentReviewPage';
import { api } from './lib/api';
import { subscribe, getPath, getSearchParam } from './lib/router';
import { GraduationCap, Plus, Loader2, Users, UserPlus, BookOpen, Trash2, X, Eye, Upload, FileSpreadsheet, AlertTriangle, CheckCircle2, Search, Download, Edit3, Crown } from 'lucide-react';
import { Avatar } from './components/Avatar';
import type { Lang } from '@tarbie/shared';
import './index.css';

function AccessDenied() {
  const { lang } = useAuthStore();
  return (
    <div className="flex flex-col items-center justify-center py-20 text-gray-400">
      <AlertTriangle size={40} className="mb-3 text-amber-400" />
      <p className="text-lg font-semibold">{lang === 'kz' ? 'Қол жетімсіз' : 'Нет доступа'}</p>
      <p className="mt-1 text-sm">{lang === 'kz' ? 'Бұл бетке кіру құқығыңыз жоқ' : 'У вас нет доступа к этой странице'}</p>
    </div>
  );
}

function PremiumRequired() {
  const { lang } = useAuthStore();
  return (
    <div className="flex flex-col items-center justify-center py-20 text-gray-400">
      <Crown size={40} className="mb-3 text-amber-400" />
      <p className="text-lg font-semibold">Premium</p>
      <p className="mt-1 text-sm text-center">{lang === 'kz' ? 'Бұл мүмкіндік Premium жазылымда қолжетімді' : 'Эта функция доступна в Premium-подписке'}</p>
      <a href="/profile" className="mt-4 rounded-lg bg-gradient-to-r from-amber-500 to-yellow-500 px-6 py-2 text-sm font-bold text-white hover:shadow-md transition-shadow">
        {lang === 'kz' ? 'Premium сатып алу' : 'Купить Premium'}
      </a>
    </div>
  );
}

function Router({ path }: { path: string }) {
  const { user } = useAuthStore();
  const role = user?.role ?? '';

  const hasRole = (...roles: string[]) => roles.includes(role);

  // Dynamic routes for courses
  const courseLessonMatch = path.match(/^\/courses\/([^/]+)\/lessons\/([^/]+)$/);
  if (courseLessonMatch) {
    return <LessonPage courseId={courseLessonMatch[1]!} lessonId={courseLessonMatch[2]!} />;
  }

  const courseDetailMatch = path.match(/^\/courses\/([^/]+)$/);
  if (courseDetailMatch && courseDetailMatch[1] !== 'builder') {
    return <CourseDetailPage courseId={courseDetailMatch[1]!} />;
  }

  switch (path) {
    case '/':
      return <DashboardPage />;
    case '/sessions':
      return hasRole('admin', 'teacher', 'student') ? <SessionsPage /> : <AccessDenied />;
    case '/reports':
      return hasRole('admin', 'teacher') ? <ReportsPage /> : <AccessDenied />;
    case '/settings':
      return <SettingsPage />;
    case '/admin/users':
      return hasRole('admin') ? <AdminUsersPage /> : <AccessDenied />;
    case '/admin/classes':
      return hasRole('admin') ? <AdminClassesPage /> : <AccessDenied />;
    case '/grades':
      return hasRole('admin', 'teacher', 'student') ? <GradesPage /> : <AccessDenied />;
    case '/events':
      return hasRole('admin', 'teacher', 'student') ? <EventsPage /> : <AccessDenied />;
    case '/open-sessions':
      return hasRole('admin', 'teacher', 'student') ? <OpenSessionsPage /> : <AccessDenied />;
    case '/profile':
      return <ProfilePage />;
    case '/support':
      return <SupportPage />;
    case '/assistant':
      return hasRole('admin', 'teacher') ? (user?.premium ? <AssistantPage /> : <PremiumRequired />) : <AccessDenied />;
    case '/ratings':
      return hasRole('admin') ? <TeacherRatingsPage /> : <AccessDenied />;
    case '/reviews':
      return hasRole('student') ? <StudentReviewPage /> : <AccessDenied />;
    case '/courses':
      return hasRole('admin', 'teacher', 'student') ? <CourseCatalogPage /> : <AccessDenied />;
    case '/courses/builder':
      return hasRole('admin', 'teacher') ? <CourseBuilderPage courseId={getSearchParam('id')} /> : <AccessDenied />;
    case '/my-courses':
      return <MyCoursesPage />;
    case '/test-runner':
      return hasRole('admin') ? <TestRunnerPage /> : <AccessDenied />;
    default:
      return <DashboardPage />;
  }
}

function LoadingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-primary-50 via-white to-accent-50">
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-600 text-white shadow-lg">
          <GraduationCap size={32} />
        </div>
        <Loader2 size={24} className="mx-auto animate-spin text-primary-600" />
      </div>
    </div>
  );
}

function App() {
  const { isAuthenticated, isLoading } = useAuthStore();
  const [path, setPath] = useState(getPath());

  useEffect(() => {
    const unsub = subscribe(() => setPath(getPath()));
    const onPop = () => setPath(getPath());
    window.addEventListener('popstate', onPop);
    return () => { unsub(); window.removeEventListener('popstate', onPop); };
  }, []);

  if (isLoading) {
    return <LoadingScreen />;
  }

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  return (
    <Layout>
      <Router path={path} />
    </Layout>
  );
}

/* ─── Admin Users Page ─── */

interface UserRow {
  id: string;
  full_name: string;
  phone: string;
  role: string;
  telegram_chat_id: string | null;
  lang: string;
  created_at: string;
  avatar_url?: string | null;
  premium?: number;
  premium_expires_at?: string | null;
}

function roleLabel(role: string, lang: Lang) {
  const map: Record<string, Record<string, string>> = {
    admin: { kz: 'Әкімші', ru: 'Администратор' },
    teacher: { kz: 'Мұғалім', ru: 'Учитель' },
    student: { kz: 'Оқушы', ru: 'Ученик' },
    parent: { kz: 'Ата-ана', ru: 'Родитель' },
  };
  return map[role]?.[lang] ?? role;
}

function AdminUsersPage() {
  const { lang } = useAuthStore();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [editUser, setEditUser] = useState<UserRow | null>(null);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');

  const loadUsers = () => {
    setLoading(true);
    api.get<UserRow[]>('/api/admin/users')
      .then((res) => { setUsers(Array.isArray(res) ? res : []); })
      .catch(() => setUsers([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadUsers(); }, []);

  const filtered = users.filter(u => {
    if (roleFilter !== 'all' && u.role !== roleFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return u.full_name.toLowerCase().includes(q) || u.phone.includes(q);
    }
    return true;
  });

  const roleCounts: Record<string, number> = { all: users.length, admin: 0, teacher: 0, student: 0, parent: 0 };
  for (const u of users) { if (u.role in roleCounts) roleCounts[u.role]!++; }

  const exportUsers = async () => {
    const XLSX = await import('xlsx');
    const data = filtered.map(u => ({
      [lang === 'kz' ? 'Аты-жөні' : 'ФИО']: u.full_name,
      [lang === 'kz' ? 'Телефон' : 'Телефон']: u.phone,
      [lang === 'kz' ? 'Рөлі' : 'Роль']: roleLabel(u.role, lang),
      'Telegram': u.telegram_chat_id ? (lang === 'kz' ? 'Иә' : 'Да') : (lang === 'kz' ? 'Жоқ' : 'Нет'),
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Users');
    XLSX.writeFile(wb, 'users_export.xlsx');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={32} className="animate-spin text-primary-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {lang === 'kz' ? 'Пайдаланушылар' : 'Пользователи'}
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            {lang === 'kz' ? `Барлығы: ${users.length}` : `Всего: ${users.length}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-secondary text-sm" onClick={exportUsers}>
            <Download size={16} className="mr-1.5" />
            Excel
          </button>
          <button className="btn-secondary text-sm" onClick={() => setShowBulkImport(true)}>
            <Upload size={16} className="mr-1.5" />
            {lang === 'kz' ? 'Импорт' : 'Импорт'}
          </button>
          <button className="btn-primary text-sm" onClick={() => setShowForm(true)}>
            <UserPlus size={16} className="mr-1.5" />
            {lang === 'kz' ? 'Қосу' : 'Добавить'}
          </button>
        </div>
      </div>

      {/* Search + filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" className="input-field pl-9 text-sm"
            placeholder={lang === 'kz' ? 'Іздеу: аты немесе телефон...' : 'Поиск: имя или телефон...'}
            value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="flex gap-1 rounded-lg bg-gray-100 p-1 overflow-x-auto scrollbar-hide">
          {(['all', 'teacher', 'student', 'admin', 'parent'] as const).map(r => (
            <button key={r} onClick={() => setRoleFilter(r)}
              className={`shrink-0 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${roleFilter === r ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              {r === 'all' ? (lang === 'kz' ? 'Бәрі' : 'Все') : roleLabel(r, lang)} ({(roleCounts as Record<string, number>)[r]})
            </button>
          ))}
        </div>
      </div>

      {/* Desktop table */}
      <div className="hidden md:block overflow-hidden rounded-xl border border-gray-200 bg-white">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">
                {lang === 'kz' ? 'Аты-жөні' : 'ФИО'}
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">
                {lang === 'kz' ? 'Телефон' : 'Телефон'}
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">
                {lang === 'kz' ? 'Рөлі' : 'Роль'}
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">
                Telegram
              </th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-gray-500"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.map((u) => (
              <tr key={u.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Avatar name={u.full_name} size="xs" avatarUrl={u.avatar_url} />
                    <span className="text-sm font-medium text-gray-900">{u.full_name}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-sm text-gray-600">{u.phone}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                    u.role === 'admin' ? 'bg-purple-100 text-purple-700' :
                    u.role === 'teacher' ? 'bg-blue-100 text-blue-700' :
                    u.role === 'student' ? 'bg-green-100 text-green-700' :
                    'bg-gray-100 text-gray-700'
                  }`}>{roleLabel(u.role, lang)}</span>
                </td>
                <td className="px-4 py-3 text-sm">
                  {u.telegram_chat_id
                    ? <span className="text-green-600">✓</span>
                    : <span className="text-gray-400">—</span>
                  }
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <button onClick={() => setEditUser(u)}
                      className="rounded p-1 text-gray-400 hover:bg-blue-50 hover:text-blue-600"
                      title={lang === 'kz' ? 'Өңдеу' : 'Редактировать'}>
                      <Edit3 size={15} />
                    </button>
                    {u.premium ? (
                      <button
                        onClick={() => { if (confirm(lang === 'kz' ? 'Premium жоюға сенімдісіз бе?' : 'Отозвать Premium?')) { api.delete(`/api/premium/users/${u.id}`).then(loadUsers).catch(() => {}); } }}
                        className="rounded p-1 text-amber-500 hover:bg-amber-50 hover:text-amber-700"
                        title={lang === 'kz' ? 'Premium жою' : 'Отозвать Premium'}>
                        <Crown size={15} />
                      </button>
                    ) : null}
                    <button
                      onClick={() => { if (confirm(lang === 'kz' ? 'Жоюға сенімдісіз бе?' : 'Удалить пользователя?')) { api.delete(`/api/admin/users/${u.id}`).then(loadUsers).catch(() => {}); } }}
                      className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
                      title={lang === 'kz' ? 'Жою' : 'Удалить'}>
                      <Trash2 size={15} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="py-10 text-center text-gray-400">
                  <Users size={32} className="mx-auto mb-2" />
                  {search || roleFilter !== 'all'
                    ? (lang === 'kz' ? 'Нәтижелер табылмады' : 'Ничего не найдено')
                    : (lang === 'kz' ? 'Пайдаланушылар табылмады' : 'Пользователи не найдены')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile card list */}
      <div className="md:hidden space-y-2">
        {filtered.length === 0 ? (
          <div className="py-10 text-center text-gray-400">
            <Users size={32} className="mx-auto mb-2" />
            {search || roleFilter !== 'all'
              ? (lang === 'kz' ? 'Нәтижелер табылмады' : 'Ничего не найдено')
              : (lang === 'kz' ? 'Пайдаланушылар табылмады' : 'Пользователи не найдены')}
          </div>
        ) : (
          filtered.map((u) => (
            <div key={u.id} className="rounded-xl border border-gray-200 bg-white p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Avatar name={u.full_name} size="xs" avatarUrl={u.avatar_url} />
                    <p className="text-sm font-semibold text-gray-900">{u.full_name}</p>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">{u.phone}</p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                    u.role === 'admin' ? 'bg-purple-100 text-purple-700' :
                    u.role === 'teacher' ? 'bg-blue-100 text-blue-700' :
                    u.role === 'student' ? 'bg-green-100 text-green-700' :
                    'bg-gray-100 text-gray-700'
                  }`}>{roleLabel(u.role, lang)}</span>
                  {u.telegram_chat_id && <span className="text-green-500 text-xs">✓ TG</span>}
                </div>
              </div>
              <div className="flex items-center gap-2 mt-2 pt-2 border-t border-gray-100">
                <button onClick={() => setEditUser(u)}
                  className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 transition-colors">
                  <Edit3 size={13} />
                  {lang === 'kz' ? 'Өңдеу' : 'Ред.'}
                </button>
                <button
                  onClick={() => { if (confirm(lang === 'kz' ? 'Жоюға сенімдісіз бе?' : 'Удалить пользователя?')) { api.delete(`/api/admin/users/${u.id}`).then(loadUsers).catch(() => {}); } }}
                  className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 transition-colors ml-auto">
                  <Trash2 size={13} />
                  {lang === 'kz' ? 'Жою' : 'Удалить'}
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {showForm && (
        <CreateUserModal
          lang={lang}
          onClose={() => setShowForm(false)}
          onCreated={() => { setShowForm(false); loadUsers(); }}
        />
      )}
      {editUser && (
        <EditUserModal
          lang={lang}
          user={editUser}
          onClose={() => setEditUser(null)}
          onSaved={() => { setEditUser(null); loadUsers(); }}
        />
      )}
      {showBulkImport && (
        <BulkImportModal
          lang={lang}
          onClose={() => setShowBulkImport(false)}
          onDone={() => { setShowBulkImport(false); loadUsers(); }}
        />
      )}
    </div>
  );
}

function CreateUserModal({ lang, onClose, onCreated }: {
  lang: Lang; onClose: () => void; onCreated: () => void;
}) {
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('+7');
  const [role, setRole] = useState<string>('teacher');
  const [userLang, setUserLang] = useState<string>('ru');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await api.post('/api/admin/users', { full_name: fullName, phone, role, lang: userLang });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : (lang === 'kz' ? 'Қате' : 'Ошибка'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">
          {lang === 'kz' ? 'Жаңа пайдаланушы' : 'Новый пользователь'}
        </h2>
        {error && <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              {lang === 'kz' ? 'Аты-жөні' : 'ФИО'}
            </label>
            <input type="text" className="input-field" value={fullName}
              onChange={(e) => setFullName(e.target.value)} required
              placeholder={lang === 'kz' ? 'Толық аты-жөні' : 'Полное имя'} />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              {lang === 'kz' ? 'Телефон' : 'Телефон'}
            </label>
            <input type="tel" className="input-field" value={phone}
              onChange={(e) => setPhone(e.target.value)} required pattern="\+7\d{10}"
              placeholder="+7XXXXXXXXXX" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                {lang === 'kz' ? 'Рөлі' : 'Роль'}
              </label>
              <select className="input-field" value={role} onChange={(e) => setRole(e.target.value)}>
                <option value="teacher">{lang === 'kz' ? 'Мұғалім' : 'Учитель'}</option>
                <option value="student">{lang === 'kz' ? 'Оқушы' : 'Ученик'}</option>
                <option value="parent">{lang === 'kz' ? 'Ата-ана' : 'Родитель'}</option>
                <option value="admin">{lang === 'kz' ? 'Әкімші' : 'Администратор'}</option>
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                {lang === 'kz' ? 'Тілі' : 'Язык'}
              </label>
              <select className="input-field" value={userLang} onChange={(e) => setUserLang(e.target.value)}>
                <option value="ru">Русский</option>
                <option value="kz">Қазақша</option>
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" className="btn-secondary" onClick={onClose}>
              {lang === 'kz' ? 'Бас тарту' : 'Отмена'}
            </button>
            <button type="submit" className="btn-primary" disabled={submitting}>
              {submitting ? <Loader2 size={18} className="animate-spin" /> :
                lang === 'kz' ? 'Жасау' : 'Создать'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EditUserModal({ lang, user, onClose, onSaved }: {
  lang: Lang; user: UserRow; onClose: () => void; onSaved: () => void;
}) {
  const [fullName, setFullName] = useState(user.full_name);
  const [phone, setPhone] = useState(user.phone);
  const [role, setRole] = useState(user.role);
  const [userLang, setUserLang] = useState(user.lang || 'ru');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await api.put(`/api/admin/users/${user.id}`, { full_name: fullName, phone, role, lang: userLang });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : (lang === 'kz' ? 'Қате' : 'Ошибка'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">
          {lang === 'kz' ? 'Пайдаланушыны өңдеу' : 'Редактировать пользователя'}
        </h2>
        {error && <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              {lang === 'kz' ? 'Аты-жөні' : 'ФИО'}
            </label>
            <input type="text" className="input-field" value={fullName}
              onChange={(e) => setFullName(e.target.value)} required />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              {lang === 'kz' ? 'Телефон' : 'Телефон'}
            </label>
            <input type="tel" className="input-field" value={phone}
              onChange={(e) => setPhone(e.target.value)} required pattern="\+7\d{10}" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                {lang === 'kz' ? 'Рөлі' : 'Роль'}
              </label>
              <select className="input-field" value={role} onChange={(e) => setRole(e.target.value)}>
                <option value="teacher">{lang === 'kz' ? 'Мұғалім' : 'Учитель'}</option>
                <option value="student">{lang === 'kz' ? 'Оқушы' : 'Ученик'}</option>
                <option value="parent">{lang === 'kz' ? 'Ата-ана' : 'Родитель'}</option>
                <option value="admin">{lang === 'kz' ? 'Әкімші' : 'Администратор'}</option>
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                {lang === 'kz' ? 'Тілі' : 'Язык'}
              </label>
              <select className="input-field" value={userLang} onChange={(e) => setUserLang(e.target.value)}>
                <option value="ru">Русский</option>
                <option value="kz">Қазақша</option>
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" className="btn-secondary" onClick={onClose}>
              {lang === 'kz' ? 'Бас тарту' : 'Отмена'}
            </button>
            <button type="submit" className="btn-primary" disabled={submitting}>
              {submitting ? <Loader2 size={18} className="animate-spin" /> :
                lang === 'kz' ? 'Сақтау' : 'Сохранить'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ─── Bulk Import Modal (Enhanced: students + groups + teachers) ─── */

interface ImportEntry {
  student_name: string;
  student_phone: string;
  group_name: string;
  teacher_name: string;
  teacher_phone: string;
  error?: string;
}

type ImportMode = 'simple' | 'full';

interface ImportResults {
  teachers: { log: Array<{ name: string; phone: string; status: string }>; created: number; total: number };
  groups: { log: Array<{ name: string; status: string }>; created: number; total: number };
  students: { log: Array<{ name: string; phone: string; group: string; status: string; message?: string }>; created: number; assigned: number; errors: number; total: number };
}

function BulkImportModal({ lang, onClose, onDone }: {
  lang: Lang; onClose: () => void; onDone: () => void;
}) {
  const [step, setStep] = useState<'mode' | 'upload' | 'preview' | 'results'>('mode');
  const [mode, setMode] = useState<ImportMode>('full');
  const [entries, setEntries] = useState<ImportEntry[]>([]);
  const [userLang, setUserLang] = useState<string>('ru');
  const [academicYear, setAcademicYear] = useState('2025-2026');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [results, setResults] = useState<ImportResults | null>(null);
  const [simpleRole, setSimpleRole] = useState<string>('student');
  const [simpleResults, setSimpleResults] = useState<{ results: Array<{ full_name: string; phone: string; status: string; message?: string }>; summary: { total: number; created: number; duplicates: number; errors: number } } | null>(null);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const normalizePhone = (raw: string): string => {
    let p = String(raw).replace(/[^\d+]/g, '');
    if (p.startsWith('87') && p.length === 11) p = '+7' + p.slice(1);
    if (p.startsWith('7') && p.length === 11) p = '+' + p;
    if (!p.startsWith('+')) p = '+' + p;
    return p;
  };

  const validatePhone = (p: string) => /^\+7\d{10}$/.test(p);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    try {
      const XLSX = await import('xlsx');
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]!];
      if (!ws) { setError(lang === 'kz' ? 'Бос файл' : 'Пустой файл'); return; }
      const json = XLSX.utils.sheet_to_json(ws, { header: 1 }) as unknown[][];

      if (mode === 'full') {
        // Full mode: col1=StudentName, col2=StudentPhone, col3=GroupName, col4=TeacherName, col5=TeacherPhone
        // Teacher range inheritance: if teacher columns are empty, inherit from last row that had them
        const parsed: ImportEntry[] = [];
        let lastTeacherName = '';
        let lastTeacherPhone = '';
        let lastGroupName = '';

        for (const row of json) {
          if (!Array.isArray(row) || row.length < 2) continue;
          const sName = String(row[0] ?? '').trim();
          const sPhone = normalizePhone(String(row[1] ?? ''));
          if (!sName && !sPhone) continue;

          const gName = String(row[2] ?? '').trim() || lastGroupName;
          const tName = String(row[3] ?? '').trim();
          const tPhone = String(row[4] ?? '').trim();

          // Update inherited teacher if this row has teacher info
          if (tName && tPhone) {
            lastTeacherName = tName;
            lastTeacherPhone = normalizePhone(tPhone);
          }
          if (gName) lastGroupName = gName;

          const entry: ImportEntry = {
            student_name: sName,
            student_phone: sPhone,
            group_name: gName,
            teacher_name: lastTeacherName,
            teacher_phone: lastTeacherPhone,
          };

          // Validate
          if (!sName) entry.error = lang === 'kz' ? 'Аты жоқ' : 'Нет имени';
          else if (!validatePhone(sPhone)) entry.error = lang === 'kz' ? 'Телефон қате' : 'Неверный телефон';
          else if (gName && !lastTeacherPhone) entry.error = lang === 'kz' ? 'Куратор жоқ' : 'Нет куратора';
          else if (lastTeacherPhone && !validatePhone(lastTeacherPhone)) entry.error = lang === 'kz' ? 'Куратор телефоны қате' : 'Неверный тел. куратора';

          parsed.push(entry);
        }

        if (parsed.length === 0) {
          setError(lang === 'kz' ? 'Деректер табылмады' : 'Данные не найдены. Проверьте формат файла.');
          return;
        }
        setEntries(parsed);
      } else {
        // Simple mode: col1=Name, col2=Phone
        const parsed: ImportEntry[] = [];
        for (const row of json) {
          if (!Array.isArray(row) || row.length < 2) continue;
          const name = String(row[0] ?? '').trim();
          const phone = normalizePhone(String(row[1] ?? ''));
          if (!name && !phone) continue;
          const entry: ImportEntry = { student_name: name, student_phone: phone, group_name: '', teacher_name: '', teacher_phone: '' };
          if (!name) entry.error = lang === 'kz' ? 'Аты жоқ' : 'Нет имени';
          else if (!validatePhone(phone)) entry.error = lang === 'kz' ? 'Телефон қате' : 'Неверный телефон';
          parsed.push(entry);
        }
        if (parsed.length === 0) {
          setError(lang === 'kz' ? 'Деректер табылмады' : 'Данные не найдены.');
          return;
        }
        setEntries(parsed);
      }
      setStep('preview');
    } catch {
      setError(lang === 'kz' ? 'Файлды оқу қатесі' : 'Ошибка чтения файла');
    }
  };

  const removeRow = (idx: number) => setEntries(prev => prev.filter((_, i) => i !== idx));
  const validEntries = entries.filter(e => !e.error);
  const hasErrors = entries.some(e => e.error);

  // Grouped preview for full mode
  const groupedPreview = () => {
    const groups = new Map<string, { teacher: string; students: Array<{ name: string; phone: string }> }>();
    const noGroup: Array<{ name: string; phone: string }> = [];
    for (const e of validEntries) {
      if (e.group_name) {
        const key = e.group_name;
        if (!groups.has(key)) groups.set(key, { teacher: `${e.teacher_name} (${e.teacher_phone})`, students: [] });
        groups.get(key)!.students.push({ name: e.student_name, phone: e.student_phone });
      } else {
        noGroup.push({ name: e.student_name, phone: e.student_phone });
      }
    }
    return { groups, noGroup };
  };

  const handleSubmit = async () => {
    if (validEntries.length === 0) return;
    setSubmitting(true);
    setError('');
    setProgress(null);
    try {
      if (mode === 'full') {
        const CHUNK_SIZE = 2000;
        const allEntries = validEntries.map(e => ({
          student_name: e.student_name,
          student_phone: e.student_phone,
          group_name: e.group_name,
          teacher_name: e.teacher_name,
          teacher_phone: e.teacher_phone,
        }));

        if (allEntries.length <= CHUNK_SIZE) {
          const res = await api.post<ImportResults>('/api/admin/import', {
            entries: allEntries, lang: userLang, academic_year: academicYear,
          });
          setResults(res);
        } else {
          // Chunked import with progress
          const merged: ImportResults = {
            teachers: { log: [], created: 0, total: 0 },
            groups: { log: [], created: 0, total: 0 },
            students: { log: [], created: 0, assigned: 0, errors: 0, total: 0 },
          };
          const totalChunks = Math.ceil(allEntries.length / CHUNK_SIZE);
          for (let i = 0; i < totalChunks; i++) {
            setProgress({ current: i + 1, total: totalChunks });
            const chunk = allEntries.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
            const res = await api.post<ImportResults>('/api/admin/import', {
              entries: chunk, lang: userLang, academic_year: academicYear,
            });
            merged.teachers.log.push(...res.teachers.log);
            merged.teachers.created += res.teachers.created;
            merged.teachers.total += res.teachers.total;
            merged.groups.log.push(...res.groups.log);
            merged.groups.created += res.groups.created;
            merged.groups.total += res.groups.total;
            merged.students.log.push(...res.students.log);
            merged.students.created += res.students.created;
            merged.students.assigned += res.students.assigned;
            merged.students.errors += res.students.errors;
            merged.students.total += res.students.total;
          }
          setResults(merged);
        }
      } else {
        const CHUNK_SIZE = 3000;
        const allUsers = validEntries.map(e => ({ full_name: e.student_name, phone: e.student_phone, role: simpleRole, lang: userLang }));

        if (allUsers.length <= CHUNK_SIZE) {
          const res = await api.post<{ results: Array<{ full_name: string; phone: string; status: string; message?: string }>; summary: { total: number; created: number; duplicates: number; errors: number } }>('/api/admin/users/bulk', { users: allUsers });
          setSimpleResults(res);
        } else {
          const merged = { results: [] as Array<{ full_name: string; phone: string; status: string; message?: string }>, summary: { total: 0, created: 0, duplicates: 0, errors: 0 } };
          const totalChunks = Math.ceil(allUsers.length / CHUNK_SIZE);
          for (let i = 0; i < totalChunks; i++) {
            setProgress({ current: i + 1, total: totalChunks });
            const chunk = allUsers.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
            const res = await api.post<{ results: Array<{ full_name: string; phone: string; status: string; message?: string }>; summary: { total: number; created: number; duplicates: number; errors: number } }>('/api/admin/users/bulk', { users: chunk });
            merged.results.push(...res.results);
            merged.summary.total += res.summary.total;
            merged.summary.created += res.summary.created;
            merged.summary.duplicates += res.summary.duplicates;
            merged.summary.errors += res.summary.errors;
          }
          setSimpleResults(merged);
        }
      }
      setStep('results');
    } catch (err) {
      setError(err instanceof Error ? err.message : (lang === 'kz' ? 'Қате' : 'Ошибка'));
    } finally {
      setSubmitting(false);
      setProgress(null);
    }
  };

  const downloadTemplate = async () => {
    const XLSX = await import('xlsx');
    const ws = XLSX.utils.aoa_to_sheet(mode === 'full' ? [
      ['ФИО ученика', 'Телефон ученика', 'Группа', 'ФИО куратора', 'Телефон куратора'],
      ['Иванов Алексей', '+77011234567', 'ИТ-21', 'Петров А.Б.', '+77051112233'],
      ['Сидорова Мария', '+77029876543', 'ИТ-21', '', ''],
      ['Козлов Данияр', '+77031234567', 'ИТ-21', '', ''],
      ['Нурлан Айгерим', '+77041234567', 'ИТ-22', 'Смирнова В.Г.', '+77061112233'],
      ['Ахметов Болат', '+77051234567', 'ИТ-22', '', ''],
    ] : [
      ['ФИО', 'Телефон'],
      ['Иванов Алексей', '+77011234567'],
      ['Петрова Мария', '87029876543'],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Import');
    XLSX.writeFile(wb, mode === 'full' ? 'import_template_full.xlsx' : 'import_template_simple.xlsx');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-4xl rounded-2xl bg-white p-6 shadow-xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <FileSpreadsheet size={20} className="text-green-600" />
            {lang === 'kz' ? 'Excel-ден импорт' : 'Импорт из Excel'}
          </h2>
          <button onClick={onClose} className="rounded p-1 hover:bg-gray-100"><X size={20} /></button>
        </div>

        {error && <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}

        {/* STEP 0: Choose mode */}
        {step === 'mode' && (
          <div className="flex-1 flex flex-col gap-4 py-4">
            <p className="text-sm text-gray-600 text-center mb-2">
              {lang === 'kz' ? 'Импорт режимін таңдаңыз:' : 'Выберите режим импорта:'}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <button onClick={() => { setMode('full'); setStep('upload'); }}
                className="rounded-xl border-2 border-gray-200 p-5 text-left hover:border-primary-400 hover:bg-primary-50 transition-colors group">
                <div className="flex items-center gap-3 mb-2">
                  <div className="rounded-lg bg-primary-100 p-2 group-hover:bg-primary-200"><Users size={20} className="text-primary-700" /></div>
                  <h3 className="font-semibold text-gray-900">{lang === 'kz' ? 'Толық импорт' : 'Полный импорт'}</h3>
                </div>
                <p className="text-xs text-gray-500">
                  {lang === 'kz'
                    ? 'Оқушылар + Топтар + Кураторлар. 5 баған: ФИО, Телефон, Топ, Куратор ФИО, Куратор Телефон'
                    : 'Ученики + Группы + Кураторы. 5 столбцов: ФИО, Телефон, Группа, ФИО куратора, Телефон куратора'}
                </p>
                <p className="mt-2 text-xs text-primary-600 font-medium">
                  {lang === 'kz' ? 'Куратор мәліметтері тек 1 рет жазылады — қалғандарына мұра болады' : 'Данные куратора пишутся 1 раз — наследуются для остальных'}
                </p>
              </button>
              <button onClick={() => { setMode('simple'); setStep('upload'); }}
                className="rounded-xl border-2 border-gray-200 p-5 text-left hover:border-green-400 hover:bg-green-50 transition-colors group">
                <div className="flex items-center gap-3 mb-2">
                  <div className="rounded-lg bg-green-100 p-2 group-hover:bg-green-200"><UserPlus size={20} className="text-green-700" /></div>
                  <h3 className="font-semibold text-gray-900">{lang === 'kz' ? 'Қарапайым импорт' : 'Простой импорт'}</h3>
                </div>
                <p className="text-xs text-gray-500">
                  {lang === 'kz'
                    ? 'Тек пайдаланушылар. 2 баған: ФИО, Телефон'
                    : 'Только пользователи. 2 столбца: ФИО, Телефон'}
                </p>
              </button>
            </div>
          </div>
        )}

        {/* STEP 1: Upload */}
        {step === 'upload' && (
          <div className="flex-1 flex flex-col items-center justify-center py-6">
            <div className="mb-4 rounded-2xl bg-green-50 p-5 text-center max-w-lg">
              <FileSpreadsheet size={40} className="mx-auto mb-2 text-green-500" />
              <p className="text-sm font-medium text-gray-700 mb-1">
                {lang === 'kz' ? 'Excel файлды таңдаңыз (.xlsx, .xls)' : 'Выберите Excel файл (.xlsx, .xls)'}
              </p>
              <p className="text-xs text-gray-500">
                {mode === 'full'
                  ? (lang === 'kz' ? '5 баған: ФИО, Телефон, Топ, Куратор ФИО, Куратор Телефон' : '5 столбцов: ФИО, Телефон, Группа, ФИО куратора, Тел. куратора')
                  : (lang === 'kz' ? '2 баған: ФИО, Телефон' : '2 столбца: ФИО, Телефон')}
              </p>
            </div>
            <div className="flex gap-3">
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFile} className="hidden" />
              <button className="btn-primary" onClick={() => fileRef.current?.click()}>
                <Upload size={18} className="mr-2" />
                {lang === 'kz' ? 'Файлды таңдау' : 'Выбрать файл'}
              </button>
              <button className="btn-secondary" onClick={downloadTemplate}>
                <Download size={18} className="mr-2" />
                {lang === 'kz' ? 'Үлгіні жүктеу' : 'Скачать шаблон'}
              </button>
            </div>
            {mode === 'full' && (
              <div className="mt-5 rounded-lg bg-blue-50 p-4 text-xs text-blue-700 max-w-lg w-full">
                <p className="font-medium mb-2">{lang === 'kz' ? 'Мысал:' : 'Пример:'}</p>
                <div className="overflow-auto">
                  <table className="w-full text-left text-blue-600 whitespace-nowrap">
                    <thead><tr className="border-b border-blue-200">
                      <th className="pb-1 pr-2">{lang === 'kz' ? 'ФИО' : 'ФИО'}</th>
                      <th className="pb-1 pr-2">{lang === 'kz' ? 'Тел' : 'Тел'}</th>
                      <th className="pb-1 pr-2">{lang === 'kz' ? 'Топ' : 'Группа'}</th>
                      <th className="pb-1 pr-2">{lang === 'kz' ? 'Куратор' : 'Куратор'}</th>
                      <th className="pb-1">{lang === 'kz' ? 'Тел кур.' : 'Тел кур.'}</th>
                    </tr></thead>
                    <tbody>
                      <tr className="font-medium"><td className="pr-2 py-0.5">Иванов А.</td><td className="pr-2">+7701...</td><td className="pr-2">ИТ-21</td><td className="pr-2">Петров Б.</td><td>+7705...</td></tr>
                      <tr><td className="pr-2 py-0.5">Сидорова М.</td><td className="pr-2">+7702...</td><td className="pr-2 text-blue-400">↑ ИТ-21</td><td className="pr-2 text-blue-400">↑ наслед.</td><td className="text-blue-400">↑</td></tr>
                      <tr className="font-medium"><td className="pr-2 py-0.5">Нурлан А.</td><td className="pr-2">+7704...</td><td className="pr-2">ИТ-22</td><td className="pr-2">Смирнова В.</td><td>+7706...</td></tr>
                      <tr><td className="pr-2 py-0.5">Ахметов Б.</td><td className="pr-2">+7705...</td><td className="pr-2 text-blue-400">↑ ИТ-22</td><td className="pr-2 text-blue-400">↑ наслед.</td><td className="text-blue-400">↑</td></tr>
                    </tbody>
                  </table>
                </div>
                <p className="mt-2 text-blue-500">{lang === 'kz' ? 'Куратор деректері бос болса, жоғарыдағыдан алынады' : 'Если столбцы куратора пустые — берутся из строки выше'}</p>
              </div>
            )}
            <button className="mt-4 text-sm text-gray-500 hover:text-gray-700" onClick={() => { setStep('mode'); setEntries([]); }}>
              ← {lang === 'kz' ? 'Режимді өзгерту' : 'Сменить режим'}
            </button>
          </div>
        )}

        {/* STEP 2: Preview */}
        {step === 'preview' && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">{lang === 'kz' ? 'Тіл' : 'Язык'}</label>
                <select className="input-field text-sm" value={userLang} onChange={(e) => setUserLang(e.target.value)}>
                  <option value="ru">Русский</option>
                  <option value="kz">Қазақша</option>
                </select>
              </div>
              {mode === 'full' && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">{lang === 'kz' ? 'Оқу жылы' : 'Учебный год'}</label>
                  <input className="input-field text-sm" value={academicYear} onChange={(e) => setAcademicYear(e.target.value)} pattern="\d{4}-\d{4}" />
                </div>
              )}
              {mode === 'simple' && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">{lang === 'kz' ? 'Рөлі' : 'Роль'}</label>
                  <select className="input-field text-sm" value={simpleRole} onChange={(e) => setSimpleRole(e.target.value)}>
                    <option value="student">{lang === 'kz' ? 'Оқушы' : 'Ученик'}</option>
                    <option value="teacher">{lang === 'kz' ? 'Мұғалім' : 'Учитель'}</option>
                    <option value="parent">{lang === 'kz' ? 'Ата-ана' : 'Родитель'}</option>
                  </select>
                </div>
              )}
            </div>

            {hasErrors && (
              <div className="mb-3 flex items-center gap-2 rounded-lg bg-amber-50 p-2.5 text-xs text-amber-700">
                <AlertTriangle size={14} />
                {lang === 'kz' ? 'Қателер бар жолдар жіберілмейді' : 'Строки с ошибками не будут импортированы'}
              </div>
            )}

            {mode === 'full' && (() => {
              const { groups, noGroup } = groupedPreview();
              return (
                <div className="flex-1 overflow-auto space-y-3 mb-4">
                  {Array.from(groups.entries()).map(([gName, info]) => (
                    <div key={gName} className="rounded-lg border border-gray-200">
                      <div className="flex items-center justify-between bg-gray-50 px-3 py-2 rounded-t-lg">
                        <div>
                          <span className="text-sm font-semibold text-gray-900">{gName}</span>
                          <span className="ml-2 text-xs text-gray-500">{info.teacher}</span>
                        </div>
                        <span className="text-xs text-gray-400">{info.students.length} {lang === 'kz' ? 'оқушы' : 'уч.'}</span>
                      </div>
                      <div className="divide-y divide-gray-100">
                        {info.students.map((s, i) => (
                          <div key={i} className="flex items-center justify-between px-3 py-1.5 text-sm">
                            <span className="text-gray-800">{s.name}</span>
                            <span className="text-gray-500 text-xs">{s.phone}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                  {noGroup.length > 0 && (
                    <div className="rounded-lg border border-gray-200">
                      <div className="bg-gray-50 px-3 py-2 rounded-t-lg">
                        <span className="text-sm font-semibold text-gray-500">{lang === 'kz' ? 'Топсыз' : 'Без группы'}</span>
                      </div>
                      <div className="divide-y divide-gray-100">
                        {noGroup.map((s, i) => (
                          <div key={i} className="flex items-center justify-between px-3 py-1.5 text-sm">
                            <span className="text-gray-800">{s.name}</span>
                            <span className="text-gray-500 text-xs">{s.phone}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

            {mode === 'simple' && (
              <div className="flex-1 overflow-auto rounded-lg border border-gray-200 mb-4">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 w-8">#</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">{lang === 'kz' ? 'Аты-жөні' : 'ФИО'}</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">{lang === 'kz' ? 'Телефон' : 'Телефон'}</th>
                      <th className="px-3 py-2 w-8"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {entries.map((r, i) => (
                      <tr key={i} className={r.error ? 'bg-red-50/50' : ''}>
                        <td className="px-3 py-2 text-xs text-gray-400">{i + 1}</td>
                        <td className="px-3 py-2 text-sm text-gray-900">{r.student_name}</td>
                        <td className="px-3 py-2 text-sm text-gray-600">
                          {r.student_phone}
                          {r.error && <span className="ml-2 text-xs text-red-500">({r.error})</span>}
                        </td>
                        <td className="px-3 py-2">
                          <button onClick={() => removeRow(i)} className="rounded p-0.5 text-gray-400 hover:text-red-500"><X size={14} /></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Errors table for full mode */}
            {mode === 'full' && hasErrors && (
              <div className="mb-3 rounded-lg border border-red-200 overflow-auto max-h-32">
                <table className="min-w-full text-xs">
                  <thead className="bg-red-50"><tr>
                    <th className="px-2 py-1 text-left text-red-600">{lang === 'kz' ? 'Қате жолдар' : 'Строки с ошибками'}</th>
                    <th className="px-2 py-1 text-left text-red-600">{lang === 'kz' ? 'Себебі' : 'Причина'}</th>
                  </tr></thead>
                  <tbody className="divide-y divide-red-100">
                    {entries.filter(e => e.error).map((e, i) => (
                      <tr key={i}>
                        <td className="px-2 py-1 text-gray-700">{e.student_name || '?'} — {e.student_phone}</td>
                        <td className="px-2 py-1 text-red-600">{e.error}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-500">
                {mode === 'full'
                  ? (lang === 'kz'
                      ? `${validEntries.length} оқушы, ${groupedPreview().groups.size} топ`
                      : `${validEntries.length} учеников, ${groupedPreview().groups.size} групп`)
                  : (lang === 'kz'
                      ? `Барлығы: ${entries.length}, дұрыс: ${validEntries.length}`
                      : `Всего: ${entries.length}, корректных: ${validEntries.length}`)}
              </p>
              <div className="flex gap-2">
                <button className="btn-secondary text-sm" onClick={() => { setStep('upload'); setEntries([]); }}>
                  {lang === 'kz' ? 'Артқа' : 'Назад'}
                </button>
                <button className="btn-primary text-sm" onClick={handleSubmit} disabled={submitting || validEntries.length === 0}>
                  {submitting ? (
                    <span className="flex items-center gap-1.5">
                      <Loader2 size={16} className="animate-spin" />
                      {progress ? `${progress.current}/${progress.total}` : (lang === 'kz' ? 'Жүктелуде...' : 'Загрузка...')}
                    </span>
                  ) : `${lang === 'kz' ? 'Импорттау' : 'Импортировать'} (${validEntries.length})`}
                </button>
              </div>
            </div>
          </>
        )}

        {/* STEP 3: Results */}
        {step === 'results' && mode === 'full' && results && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              <div className="rounded-lg bg-blue-50 p-3 text-center">
                <p className="text-2xl font-bold text-blue-700">{results.teachers.total}</p>
                <p className="text-xs text-blue-600">{lang === 'kz' ? 'Кураторлар' : 'Кураторов'}</p>
                {results.teachers.created > 0 && <p className="text-[10px] text-green-600">+{results.teachers.created} {lang === 'kz' ? 'жаңа' : 'новых'}</p>}
              </div>
              <div className="rounded-lg bg-purple-50 p-3 text-center">
                <p className="text-2xl font-bold text-purple-700">{results.groups.total}</p>
                <p className="text-xs text-purple-600">{lang === 'kz' ? 'Топтар' : 'Групп'}</p>
                {results.groups.created > 0 && <p className="text-[10px] text-green-600">+{results.groups.created} {lang === 'kz' ? 'жаңа' : 'новых'}</p>}
              </div>
              <div className="rounded-lg bg-green-50 p-3 text-center">
                <p className="text-2xl font-bold text-green-700">{results.students.total}</p>
                <p className="text-xs text-green-600">{lang === 'kz' ? 'Оқушылар' : 'Учеников'}</p>
                {results.students.created > 0 && <p className="text-[10px] text-green-600">+{results.students.created} {lang === 'kz' ? 'жаңа' : 'новых'}</p>}
              </div>
              <div className="rounded-lg bg-amber-50 p-3 text-center">
                <p className="text-2xl font-bold text-amber-700">{results.students.assigned}</p>
                <p className="text-xs text-amber-600">{lang === 'kz' ? 'Тағайындалды' : 'Назначено'}</p>
              </div>
            </div>

            <div className="flex-1 overflow-auto space-y-2 mb-4">
              {results.teachers.log.length > 0 && (
                <details className="rounded-lg border border-gray-200">
                  <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-gray-700 bg-gray-50 rounded-lg">
                    {lang === 'kz' ? 'Кураторлар' : 'Кураторы'} ({results.teachers.total})
                  </summary>
                  <div className="divide-y divide-gray-100 px-3">
                    {results.teachers.log.map((t, i) => (
                      <div key={i} className="flex items-center justify-between py-1.5 text-sm">
                        <span>{t.name} <span className="text-gray-400 text-xs">{t.phone}</span></span>
                        <span className={`text-xs ${t.status === 'created' ? 'text-green-600' : t.status === 'exists' ? 'text-gray-500' : 'text-red-500'}`}>
                          {t.status === 'created' ? '✓ создан' : t.status === 'exists' ? 'уже был' : '✗ ошибка'}
                        </span>
                      </div>
                    ))}
                  </div>
                </details>
              )}
              {results.groups.log.length > 0 && (
                <details className="rounded-lg border border-gray-200">
                  <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-gray-700 bg-gray-50 rounded-lg">
                    {lang === 'kz' ? 'Топтар' : 'Группы'} ({results.groups.total})
                  </summary>
                  <div className="divide-y divide-gray-100 px-3">
                    {results.groups.log.map((g, i) => (
                      <div key={i} className="flex items-center justify-between py-1.5 text-sm">
                        <span>{g.name}</span>
                        <span className={`text-xs ${g.status === 'created' ? 'text-green-600' : g.status === 'exists' ? 'text-gray-500' : 'text-red-500'}`}>
                          {g.status === 'created' ? '✓ создана' : g.status === 'exists' ? 'уже была' : '✗ ошибка'}
                        </span>
                      </div>
                    ))}
                  </div>
                </details>
              )}
              <details open className="rounded-lg border border-gray-200">
                <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-gray-700 bg-gray-50 rounded-lg">
                  {lang === 'kz' ? 'Оқушылар' : 'Ученики'} ({results.students.total})
                </summary>
                <div className="divide-y divide-gray-100 px-3 max-h-60 overflow-auto">
                  {results.students.log.map((s, i) => (
                    <div key={i} className="flex items-center justify-between py-1.5 text-sm">
                      <div>
                        <span>{s.name}</span>
                        {s.group && <span className="ml-2 text-xs bg-gray-100 rounded px-1 py-0.5 text-gray-600">{s.group}</span>}
                      </div>
                      <span className={`text-xs ${s.status === 'created' ? 'text-green-600' : s.status === 'assigned' ? 'text-blue-600' : s.status === 'exists' ? 'text-gray-500' : 'text-red-500'}`}>
                        {s.status === 'created' ? '✓ создан' : s.status === 'assigned' ? '✓ назначен' : s.status === 'exists' ? 'уже был' : `✗ ${s.message || 'ошибка'}`}
                      </span>
                    </div>
                  ))}
                </div>
              </details>
            </div>
            <div className="flex justify-end">
              <button className="btn-primary text-sm" onClick={onDone}>{lang === 'kz' ? 'Дайын' : 'Готово'}</button>
            </div>
          </>
        )}

        {step === 'results' && mode === 'simple' && simpleResults && (
          <>
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="rounded-lg bg-green-50 p-3 text-center">
                <p className="text-2xl font-bold text-green-700">{simpleResults.summary.created}</p>
                <p className="text-xs text-green-600">{lang === 'kz' ? 'Құрылды' : 'Создано'}</p>
              </div>
              <div className="rounded-lg bg-amber-50 p-3 text-center">
                <p className="text-2xl font-bold text-amber-700">{simpleResults.summary.duplicates}</p>
                <p className="text-xs text-amber-600">{lang === 'kz' ? 'Қайталанды' : 'Дубликаты'}</p>
              </div>
              <div className="rounded-lg bg-red-50 p-3 text-center">
                <p className="text-2xl font-bold text-red-700">{simpleResults.summary.errors}</p>
                <p className="text-xs text-red-600">{lang === 'kz' ? 'Қателер' : 'Ошибки'}</p>
              </div>
            </div>
            <div className="flex-1 overflow-auto rounded-lg border border-gray-200 mb-4">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50 sticky top-0"><tr>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">{lang === 'kz' ? 'Аты' : 'Имя'}</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">{lang === 'kz' ? 'Телефон' : 'Телефон'}</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">{lang === 'kz' ? 'Нәтиже' : 'Результат'}</th>
                </tr></thead>
                <tbody className="divide-y divide-gray-100">
                  {simpleResults.results.map((r, i) => (
                    <tr key={i}>
                      <td className="px-3 py-2 text-gray-900">{r.full_name}</td>
                      <td className="px-3 py-2 text-gray-600">{r.phone}</td>
                      <td className="px-3 py-2">
                        {r.status === 'created' && <span className="inline-flex items-center gap-1 text-xs text-green-700"><CheckCircle2 size={12} />{lang === 'kz' ? 'Құрылды' : 'Создан'}</span>}
                        {r.status === 'duplicate' && <span className="inline-flex items-center gap-1 text-xs text-amber-700"><AlertTriangle size={12} />{lang === 'kz' ? 'Қайталанды' : 'Дубликат'}</span>}
                        {r.status === 'error' && <span className="inline-flex items-center gap-1 text-xs text-red-700"><AlertTriangle size={12} />{r.message}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end">
              <button className="btn-primary text-sm" onClick={onDone}>{lang === 'kz' ? 'Дайын' : 'Готово'}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ─── Admin Classes Page ─── */

interface ClassRow {
  id: string;
  name: string;
  teacher_id: string;
  teacher_name: string;
  academic_year: string;
  student_count: number;
}

function AdminClassesPage() {
  const { lang } = useAuthStore();
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [addStudentClassId, setAddStudentClassId] = useState<string | null>(null);
  const [viewStudentsClassId, setViewStudentsClassId] = useState<string | null>(null);

  const loadClasses = () => {
    setLoading(true);
    api.get<ClassRow[]>('/api/admin/classes')
      .then((res) => { setClasses(Array.isArray(res) ? res : []); })
      .catch(() => setClasses([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadClasses(); }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={32} className="animate-spin text-primary-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {lang === 'kz' ? 'Топтар' : 'Группы'}
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            {lang === 'kz' ? `Барлығы: ${classes.length}` : `Всего: ${classes.length}`}
          </p>
        </div>
        <button className="btn-primary text-sm" onClick={() => setShowForm(true)}>
          <Plus size={18} className="mr-2" />
          {lang === 'kz' ? 'Топ қосу' : 'Добавить группу'}
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {classes.map((c) => (
          <div key={c.id} className="card hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">{c.name}</h3>
                <p className="mt-1 text-sm text-gray-500">
                  {lang === 'kz' ? 'Куратор' : 'Куратор'}: {c.teacher_name}
                </p>
                <p className="text-sm text-gray-500">
                  {lang === 'kz' ? 'Оқу жылы' : 'Учебный год'}: {c.academic_year}
                </p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-100 text-primary-700">
                <BookOpen size={18} />
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-gray-100 pt-3">
              <span className="text-sm text-gray-500">
                {lang === 'kz' ? 'Оқушылар' : 'Учеников'}: <span className="font-medium text-gray-900">{c.student_count}</span>
              </span>
              <div className="flex gap-2">
                <button onClick={() => setViewStudentsClassId(c.id)}
                  className="text-xs font-medium text-primary-600 hover:text-primary-700">
                  <Eye size={14} className="inline mr-0.5" />{lang === 'kz' ? 'Тізім' : 'Список'}
                </button>
                <button onClick={() => setAddStudentClassId(c.id)}
                  className="text-xs font-medium text-primary-600 hover:text-primary-700">
                  <Plus size={14} className="inline mr-0.5" />{lang === 'kz' ? 'Қосу' : 'Добавить'}
                </button>
                <button onClick={() => { if (confirm(lang === 'kz' ? 'Топты жоюға сенімдісіз бе?' : 'Удалить группу?')) { api.delete(`/api/admin/classes/${c.id}`).then(loadClasses).catch(() => {}); } }}
                  className="text-xs font-medium text-red-500 hover:text-red-700">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          </div>
        ))}
        {classes.length === 0 && (
          <div className="col-span-full py-10 text-center text-gray-400">
            <BookOpen size={32} className="mx-auto mb-2" />
            {lang === 'kz' ? 'Топтар табылмады' : 'Группы не найдены'}
          </div>
        )}
      </div>

      {showForm && (
        <CreateClassModal
          lang={lang}
          onClose={() => setShowForm(false)}
          onCreated={() => { setShowForm(false); loadClasses(); }}
        />
      )}
      {addStudentClassId && (
        <AddStudentsModal
          lang={lang}
          classId={addStudentClassId}
          onClose={() => setAddStudentClassId(null)}
          onAdded={() => { setAddStudentClassId(null); loadClasses(); }}
        />
      )}
      {viewStudentsClassId && (
        <ViewStudentsModal
          lang={lang}
          classId={viewStudentsClassId}
          onClose={() => setViewStudentsClassId(null)}
          onChanged={() => loadClasses()}
        />
      )}
    </div>
  );
}

function CreateClassModal({ lang, onClose, onCreated }: {
  lang: Lang; onClose: () => void; onCreated: () => void;
}) {
  const [name, setName] = useState('');
  const [teacherId, setTeacherId] = useState('');
  const [academicYear, setAcademicYear] = useState('2025-2026');
  const [teachers, setTeachers] = useState<Array<{ id: string; full_name: string }>>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get<UserRow[]>('/api/admin/users')
      .then((res) => {
        const data = Array.isArray(res) ? res : [];
        setTeachers(data.filter((u) => u.role === 'teacher'));
      })
      .catch(() => setTeachers([]));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await api.post('/api/admin/classes', { name, teacher_id: teacherId, academic_year: academicYear });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : (lang === 'kz' ? 'Қате' : 'Ошибка'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">
          {lang === 'kz' ? 'Жаңа топ' : 'Новая группа'}
        </h2>
        {error && <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              {lang === 'kz' ? 'Топ атауы' : 'Название группы'}
            </label>
            <input type="text" className="input-field" value={name}
              onChange={(e) => setName(e.target.value)} required
              placeholder={lang === 'kz' ? 'Мысалы: ИТ-21' : 'Например: ИТ-21'} />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              {lang === 'kz' ? 'Куратор' : 'Куратор'}
            </label>
            <select className="input-field" value={teacherId} onChange={(e) => setTeacherId(e.target.value)} required>
              <option value="">{lang === 'kz' ? 'Таңдаңыз' : 'Выберите'}</option>
              {teachers.map((t) => (
                <option key={t.id} value={t.id}>{t.full_name}</option>
              ))}
            </select>
            {teachers.length === 0 && (
              <p className="mt-1 text-xs text-amber-600">
                {lang === 'kz' ? 'Алдымен мұғалім қосыңыз' : 'Сначала добавьте учителя'}
              </p>
            )}
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              {lang === 'kz' ? 'Оқу жылы' : 'Учебный год'}
            </label>
            <input type="text" className="input-field" value={academicYear}
              onChange={(e) => setAcademicYear(e.target.value)} required
              pattern="\d{4}-\d{4}" placeholder="2025-2026" />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" className="btn-secondary" onClick={onClose}>
              {lang === 'kz' ? 'Бас тарту' : 'Отмена'}
            </button>
            <button type="submit" className="btn-primary" disabled={submitting || !teacherId}>
              {submitting ? <Loader2 size={18} className="animate-spin" /> :
                lang === 'kz' ? 'Жасау' : 'Создать'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function AddStudentsModal({ lang, classId, onClose, onAdded }: {
  lang: Lang; classId: string; onClose: () => void; onAdded: () => void;
}) {
  const [students, setStudents] = useState<Array<{ id: string; full_name: string }>>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get<UserRow[]>('/api/admin/users')
      .then((res) => {
        const data = Array.isArray(res) ? res : [];
        setStudents(data.filter((u) => u.role === 'student'));
      })
      .catch(() => setStudents([]));
  }, []);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleSubmit = async () => {
    if (selected.size === 0) return;
    setSubmitting(true);
    setError('');
    try {
      await api.post(`/api/admin/classes/${classId}/students`, { student_ids: Array.from(selected) });
      onAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : (lang === 'kz' ? 'Қате' : 'Ошибка'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">
          {lang === 'kz' ? 'Оқушыларды қосу' : 'Добавить учеников'}
        </h2>
        {error && <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}
        <div className="max-h-64 overflow-y-auto rounded-lg border border-gray-200">
          {students.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-400">
              {lang === 'kz' ? 'Оқушылар табылмады. Алдымен оқушы қосыңыз.' : 'Ученики не найдены. Сначала добавьте учеников.'}
            </p>
          ) : (
            students.map((s) => (
              <label key={s.id} className="flex cursor-pointer items-center gap-3 border-b border-gray-100 px-4 py-3 last:border-0 hover:bg-gray-50">
                <input type="checkbox" checked={selected.has(s.id)}
                  onChange={() => toggle(s.id)}
                  className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500" />
                <span className="text-sm text-gray-900">{s.full_name}</span>
              </label>
            ))
          )}
        </div>
        <div className="mt-4 flex justify-end gap-3">
          <button type="button" className="btn-secondary" onClick={onClose}>
            {lang === 'kz' ? 'Бас тарту' : 'Отмена'}
          </button>
          <button className="btn-primary" onClick={handleSubmit} disabled={submitting || selected.size === 0}>
            {submitting ? <Loader2 size={18} className="animate-spin" /> :
              `${lang === 'kz' ? 'Қосу' : 'Добавить'} (${selected.size})`}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── View Students Modal ─── */

interface ClassStudent {
  id: string;
  full_name: string;
  phone: string;
  telegram_chat_id: string | null;
}

function ViewStudentsModal({ lang, classId, onClose, onChanged }: {
  lang: Lang; classId: string; onClose: () => void; onChanged: () => void;
}) {
  const [students, setStudents] = useState<ClassStudent[]>([]);
  const [loading, setLoading] = useState(true);

  const loadStudents = () => {
    setLoading(true);
    api.get<ClassStudent[]>(`/api/admin/classes/${classId}/students`)
      .then((res) => setStudents(Array.isArray(res) ? res : []))
      .catch(() => setStudents([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadStudents(); }, [classId]);

  const removeStudent = (studentId: string) => {
    if (!confirm(lang === 'kz' ? 'Оқушыны жоюға сенімдісіз бе?' : 'Удалить ученика из группы?')) return;
    api.delete(`/api/admin/classes/${classId}/students/${studentId}`)
      .then(() => { loadStudents(); onChanged(); })
      .catch(() => {});
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">
            {lang === 'kz' ? 'Оқушылар тізімі' : 'Список учеников'}
          </h2>
          <button onClick={onClose} className="rounded p-1 hover:bg-gray-100"><X size={20} /></button>
        </div>
        {loading ? (
          <div className="flex justify-center py-8"><Loader2 size={24} className="animate-spin text-primary-600" /></div>
        ) : students.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-400">
            {lang === 'kz' ? 'Оқушылар жоқ' : 'Учеников нет'}
          </p>
        ) : (
          <div className="max-h-80 overflow-y-auto rounded-lg border border-gray-200 divide-y divide-gray-100">
            {students.map((s) => (
              <div key={s.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-gray-900">{s.full_name}</p>
                  <p className="text-xs text-gray-500">{s.phone} {s.telegram_chat_id ? '• TG ✓' : ''}</p>
                </div>
                <button onClick={() => removeStudent(s.id)}
                  className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600">
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="mt-4 flex justify-end">
          <button className="btn-secondary" onClick={onClose}>
            {lang === 'kz' ? 'Жабу' : 'Закрыть'}
          </button>
        </div>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
