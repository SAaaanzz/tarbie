import React, { useState } from 'react';
import { useAuthStore } from '../store/auth';
import { useThemeStore } from '../store/theme';
import { navigate, getPath } from '../lib/router';
import {
  LayoutDashboard, CalendarDays, BarChart3, Users,
  Settings, LogOut, GraduationCap, Star,
  Sparkles, UserCircle, CalendarHeart,
  MessageCircle, BookOpen, Library, Moon, Sun,
} from 'lucide-react';
import { Avatar } from './Avatar';

interface LayoutProps {
  children: React.ReactNode;
}

interface NavItem {
  label: string;
  labelKz: string;
  icon: React.ReactNode;
  href: string;
  roles: string[];
}

const navItems: NavItem[] = [
  { label: 'Панель управления', labelKz: 'Басқару тақтасы', icon: <LayoutDashboard size={20} />, href: '/', roles: ['admin', 'teacher', 'student', 'parent'] },
  { label: 'Тәрбие сағаттары', labelKz: 'Тәрбие сағаттары', icon: <CalendarDays size={20} />, href: '/sessions', roles: ['admin', 'teacher', 'student'] },
  { label: 'Оценки', labelKz: 'Бағалар', icon: <Star size={20} />, href: '/grades', roles: ['admin', 'teacher', 'student'] },
  { label: 'Мероприятия', labelKz: 'Іс-шаралар', icon: <CalendarHeart size={20} />, href: '/events', roles: ['admin', 'teacher', 'student'] },
  { label: 'Открытые занятия', labelKz: 'Ашық сабақтар', icon: <Sparkles size={20} />, href: '/open-sessions', roles: ['admin', 'teacher', 'student'] },
  { label: 'Каталог курсов', labelKz: 'Курстар каталогы', icon: <BookOpen size={20} />, href: '/courses', roles: ['admin', 'teacher', 'student'] },
  { label: 'Мои курсы', labelKz: 'Менің курстарым', icon: <Library size={20} />, href: '/my-courses', roles: ['student'] },
  { label: 'Отчёты', labelKz: 'Есептер', icon: <BarChart3 size={20} />, href: '/reports', roles: ['admin', 'teacher'] },
  { label: 'Пользователи', labelKz: 'Пайдаланушылар', icon: <Users size={20} />, href: '/admin/users', roles: ['admin'] },
  { label: 'Группы', labelKz: 'Топтар', icon: <GraduationCap size={20} />, href: '/admin/classes', roles: ['admin'] },
  { label: 'Поддержка', labelKz: 'Қолдау', icon: <MessageCircle size={20} />, href: '/support', roles: ['admin', 'teacher', 'student', 'parent'] },
  { label: 'AI-ассистент', labelKz: 'AI-көмекші', icon: <Sparkles size={20} />, href: '/assistant', roles: ['admin', 'teacher'] },
  { label: 'Рейтинг учителей', labelKz: 'Мұғалімдер рейтингі', icon: <Star size={20} />, href: '/ratings', roles: ['admin'] },
  { label: 'Отзывы', labelKz: 'Бағалау', icon: <Star size={20} />, href: '/reviews', roles: ['student'] },
  { label: 'Тесты', labelKz: 'Тесттер', icon: <Settings size={20} />, href: '/test-runner', roles: ['admin'] },
  { label: 'Профиль', labelKz: 'Профиль', icon: <UserCircle size={20} />, href: '/profile', roles: ['admin', 'teacher', 'student', 'parent'] },
  { label: 'Настройки', labelKz: 'Баптаулар', icon: <Settings size={20} />, href: '/settings', roles: ['admin', 'teacher', 'student', 'parent'] },
];

export function Layout({ children }: LayoutProps) {
  const { user, lang, logout } = useAuthStore();
  const { theme, toggleTheme } = useThemeStore();
  const [collapsed, setCollapsed] = useState(typeof window !== 'undefined' && window.innerWidth < 1024);

  const filteredNav = navItems.filter((item) => user && item.roles.includes(user.role));
  const currentPath = getPath();

  const handleNav = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    e.preventDefault();
    navigate(href);
  };

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50 dark:bg-gray-900">
      {/* Sidebar — always visible, toggles between icons-only and full */}
      <aside
        className={`${collapsed ? 'w-[60px]' : 'w-60'} shrink-0 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 transition-all duration-200 ease-in-out flex flex-col h-full`}
      >
        {/* Logo — click to toggle collapse */}
        <div className={`flex h-14 items-center border-b border-gray-200 dark:border-gray-700 ${collapsed ? 'justify-center px-1' : 'gap-3 px-4'}`}>
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-600 text-white hover:bg-primary-700 active:scale-95 transition-all"
            title={collapsed ? (lang === 'kz' ? 'Мәзірді ашу' : 'Развернуть меню') : (lang === 'kz' ? 'Мәзірді жабу' : 'Свернуть меню')}
          >
            <GraduationCap size={18} />
          </button>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <h1 className="text-sm font-bold text-gray-900 dark:text-gray-100 truncate">Тәрбие Сағаты</h1>
              <p className="text-[10px] text-gray-400">{lang === 'kz' ? 'Басқару жүйесі' : 'Система управления'}</p>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-1.5 py-2">
          <ul className="space-y-0.5">
            {filteredNav.map((item) => {
              const isActive = currentPath === item.href;
              return (
                <li key={item.href}>
                  <a
                    href={item.href}
                    onClick={(e) => handleNav(e, item.href)}
                    title={collapsed ? (lang === 'kz' ? item.labelKz : item.label) : undefined}
                    className={`flex items-center gap-3 rounded-lg ${collapsed ? 'justify-center px-2 py-2.5' : 'px-3 py-2'} text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
                        : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                    }`}
                  >
                    <span className="shrink-0">{item.icon}</span>
                    {!collapsed && <span className="truncate">{lang === 'kz' ? item.labelKz : item.label}</span>}
                  </a>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* User info */}
        <div className={`border-t border-gray-200 dark:border-gray-700 ${collapsed ? 'p-1.5' : 'p-3'}`}>
          <div className={`flex items-center ${collapsed ? 'justify-center' : 'gap-3'}`}>
            <a
              href="/profile"
              onClick={(e) => handleNav(e, '/profile')}
              className="shrink-0 hover:ring-2 hover:ring-primary-200 rounded-full transition-all"
            >
              <Avatar name={user?.full_name ?? '?'} size={collapsed ? 'xs' : 'sm'} avatarUrl={user?.avatar_url} />
            </a>
            {!collapsed && (
              <>
                <div className="flex-1 min-w-0">
                  <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">{user?.full_name}</p>
                  <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                    {user?.role === 'admin' ? (lang === 'kz' ? 'Әкімші' : 'Админ') :
                     user?.role === 'teacher' ? (lang === 'kz' ? 'Мұғалім' : 'Учитель') :
                     user?.role === 'student' ? (lang === 'kz' ? 'Оқушы' : 'Ученик') :
                     lang === 'kz' ? 'Ата-ана' : 'Родитель'}
                  </p>
                </div>
                <button
                  onClick={logout}
                  className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-600"
                  title={lang === 'kz' ? 'Шығу' : 'Выйти'}
                >
                  <LogOut size={18} />
                </button>
              </>
            )}
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden min-w-0">
        <header className="flex h-14 items-center gap-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 lg:px-6">
          <div className="flex-1" />
          <button
            onClick={toggleTheme}
            className="rounded-lg border border-gray-300 dark:border-gray-600 p-1.5 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
            title={theme === 'dark' ? (lang === 'kz' ? 'Жарық режім' : 'Светлый режим') : (lang === 'kz' ? 'Қараңғы режім' : 'Тёмный режим')}
          >
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <button
            onClick={() => useAuthStore.getState().setLang(lang === 'kz' ? 'ru' : 'kz')}
            className="rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            {lang === 'kz' ? 'РУС' : 'ҚАЗ'}
          </button>
        </header>

        <main className="flex-1 overflow-y-auto p-4 lg:p-6 dark:text-gray-100">
          {children}
        </main>
      </div>
    </div>
  );
}
