'use client';
import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import { disconnectSocket } from '@/lib/socket';
import type { User } from '@/types';

export const useAuth = () => {
  const router = useRouter();
  const { user, accessToken, setAuth, logout: clearAuth, isAuthenticated } = useAuthStore();

  const login = useCallback(async (email: string, password: string) => {
    const { data } = await api.post('/auth/login', { email, password });
    const { accessToken, user } = data.data;
    setAuth(user as User, accessToken);
    return { user, accessToken };
  }, [setAuth]);

  const register = useCallback(async (name: string, email: string, password: string) => {
    const { data } = await api.post('/auth/register', { name, email, password });
    const { accessToken, user } = data.data;
    setAuth(user as User, accessToken);
    return { user, accessToken };
  }, [setAuth]);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } catch {}
    clearAuth();
    disconnectSocket();
    // Clear the middleware auth cookie so Next.js stops protecting routes
    document.cookie = 'tb-auth-check=; path=/; max-age=0; samesite=lax';
    router.push('/login');
    router.refresh();
  }, [clearAuth, router]);

  const fetchCurrentUser = useCallback(async () => {
    const { data } = await api.get('/auth/me');
    return data.data.user as User;
  }, []);

  return {
    user,
    accessToken,
    isAuthenticated: isAuthenticated(),
    login,
    register,
    logout,
    fetchCurrentUser,
  };
};
