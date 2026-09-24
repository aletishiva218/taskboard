'use client';
import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import api from '@/lib/api';

export default function CallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setAuth } = useAuthStore();

  useEffect(() => {
    const token = searchParams.get('token');
    const error = searchParams.get('error');

    if (error) {
      router.replace('/login?error=oauth_failed');
      return;
    }

    if (!token) {
      router.replace('/login');
      return;
    }

    const finishAuth = async () => {
      try {
        // Fetch user profile with the token
        const { data } = await api.get('/auth/me', {
          headers: { Authorization: `Bearer ${token}` },
        });

        setAuth(data.data.user, token);

        // Set lightweight cookie for middleware auth check
        document.cookie = 'tb-auth-check=1; path=/; max-age=604800; samesite=lax';

        // Navigate to the originally requested page (or dashboard if none)
        const redirect = searchParams.get('redirect') || '';
        router.replace(redirect.startsWith('/') ? redirect : '/dashboard');
      } catch {
        router.replace('/login?error=oauth_failed');
      }
    };

    finishAuth();
  }, [searchParams, setAuth, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 to-white">
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-indigo-100 rounded-full mb-4">
          <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
        </div>
        <h2 className="text-xl font-semibold text-gray-900">Signing you in...</h2>
        <p className="text-gray-500 mt-2">Please wait while we complete your sign-in.</p>
      </div>
    </div>
  );
}
