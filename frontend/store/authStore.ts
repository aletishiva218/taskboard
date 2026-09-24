'use client';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { User } from '@/types';

interface AuthState {
  user: User | null;
  accessToken: string | null;
  setAuth: (user: User, token: string) => void;
  setToken: (token: string) => void;
  setUser: (user: User) => void;
  logout: () => void;
  isAuthenticated: () => boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,

      setAuth: (user, accessToken) => set({ user, accessToken }),

      setToken: (accessToken) => set({ accessToken }),

      setUser: (user) => set({ user }),

      logout: () => set({ user: null, accessToken: null }),

      isAuthenticated: () => !!get().accessToken && !!get().user,
    }),
    {
      name: 'taskboard-auth',
      storage: createJSONStorage(() => localStorage),
      // Only persist what's needed for auth check in middleware
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
      }),
    }
  )
);
