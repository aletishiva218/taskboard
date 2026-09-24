import axios from 'axios';
import { useAuthStore } from '@/store/authStore';
import { updateSocketToken } from './socket';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

const api = axios.create({
  baseURL: `${API_URL}/api`,
  withCredentials: true, // send httpOnly refresh token cookie
  headers: { 'Content-Type': 'application/json' },
});

// Attach access token to every request — read from the store (source of truth)
api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    try {
      const token = useAuthStore.getState().accessToken;
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    } catch {}
  }
  return config;
});

let isRefreshing = false;
let refreshQueue: Array<{ resolve: (token: string) => void; reject: (err: unknown) => void }> = [];

// Auto-refresh on any 401 from non-auth endpoints (covers expired, missing, and invalid tokens)
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    const isAuthEndpoint = originalRequest.url?.includes('/auth/');

    if (
      error.response?.status === 401 &&
      !isAuthEndpoint &&
      !originalRequest._retry
    ) {
      originalRequest._retry = true;

      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          refreshQueue.push({
            resolve: (token: string) => {
              originalRequest.headers.Authorization = `Bearer ${token}`;
              resolve(api(originalRequest));
            },
            reject,
          });
        });
      }

      isRefreshing = true;

      try {
        const { data } = await axios.post(`${API_URL}/api/auth/refresh`, {}, { withCredentials: true });
        const newToken = data.data.accessToken;

        // Update Zustand store — persist middleware writes to localStorage automatically.
        // Do NOT manually write to localStorage: any subsequent store update would
        // overwrite it with the stale in-memory token and break the next request.
        useAuthStore.getState().setToken(newToken);
        if (data.data.user) {
          useAuthStore.getState().setUser(data.data.user);
        }

        // Reconnect socket with the new token if it disconnected due to the expired token.
        updateSocketToken(newToken);

        refreshQueue.forEach(({ resolve }) => resolve(newToken));
        refreshQueue = [];

        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return api(originalRequest);
      } catch (refreshError) {
        // Reject all queued requests so their callers get a real error
        refreshQueue.forEach(({ reject }) => reject(refreshError));
        refreshQueue = [];

        if (typeof window !== 'undefined') {
          useAuthStore.getState().logout();
          // Must clear the middleware cookie — otherwise middleware redirects /login → /dashboard
          document.cookie = 'tb-auth-check=; path=/; max-age=0; samesite=lax';
          window.location.href = '/login';
        }
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

export default api;
