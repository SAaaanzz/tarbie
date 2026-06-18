// Глобальное состояние авторизации (Zustand): текущий пользователь, токен,
// язык интерфейса. Сохраняется в localStorage между сессиями.
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User, Lang } from '@tarbie/shared';
import { api } from '../lib/api';

interface AuthState {
  token: string | null;
  user: User | null;
  lang: Lang;
  isAuthenticated: boolean;
  isLoading: boolean;
  setAuth: (token: string, user: User) => void;
  setLang: (lang: Lang) => void;
  logout: () => void;
  fetchMe: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      lang: 'ru',
      isAuthenticated: false,
      isLoading: true,

      setAuth: (token: string, user: User) => {
        api.setToken(token);
        api.setOnUnauthorized(() => get().logout());
        set({ token, user, isAuthenticated: true, lang: user.lang, isLoading: false });
      },

      setLang: (lang: Lang) => {
        set({ lang });
      },

      logout: () => {
        api.setToken(null);
        set({ token: null, user: null, isAuthenticated: false });
      },

      fetchMe: async () => {
        const state = get();
        if (!state.token) {
          set({ isLoading: false });
          return;
        }
        api.setToken(state.token);
        api.setOnUnauthorized(() => get().logout());
        try {
          const user = await api.get<User>('/api/auth/me');
          set({ user, isAuthenticated: true, isLoading: false });
        } catch {
          set({ token: null, user: null, isAuthenticated: false, isLoading: false });
        }
      },
    }),
    {
      name: 'tarbie-auth',
      partialize: (state) => ({ token: state.token, lang: state.lang }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.fetchMe();
        }
      },
    }
  )
);
