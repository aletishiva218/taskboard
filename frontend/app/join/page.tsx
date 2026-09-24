'use client';
import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import api from '@/lib/api';
import { useAuthStore } from '@/store/authStore';

interface InvitePayload {
  boardId: string;
  email: string;
  role: string;
  inviterName: string;
  boardName: string;
  exp: number;
}

function decodeToken(token: string): InvitePayload | null {
  try {
    const payload = token.split('.')[1];
    return JSON.parse(atob(payload)) as InvitePayload;
  } catch {
    return null;
  }
}

function JoinContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';
  const user = useAuthStore((s) => s.user);

  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [boardId, setBoardId] = useState('');

  const payload = decodeToken(token);
  const isExpired = payload ? payload.exp * 1000 < Date.now() : false;

  const handleAccept = async () => {
    setError('');
    setAccepting(true);
    try {
      const { data } = await api.post('/boards/join', { token });
      setBoardId(data.data.boardId);
      setAccepted(true);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(msg || 'Failed to accept invitation. Please try again.');
    } finally {
      setAccepting(false);
    }
  };

  useEffect(() => {
    if (accepted && boardId) {
      const timer = setTimeout(() => router.push(`/board/${boardId}`), 1500);
      return () => clearTimeout(timer);
    }
  }, [accepted, boardId, router]);

  if (!token || !payload) {
    return (
      <div className="text-center">
        <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">Invalid Invitation</h2>
        <p className="text-gray-500 text-sm">This invitation link is invalid or malformed.</p>
        <Link href="/dashboard" className="mt-6 inline-block text-indigo-600 text-sm font-medium hover:underline">
          Go to Dashboard
        </Link>
      </div>
    );
  }

  if (isExpired) {
    return (
      <div className="text-center">
        <div className="w-12 h-12 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">Invitation Expired</h2>
        <p className="text-gray-500 text-sm">This invitation link has expired. Please ask the board owner to send a new invitation.</p>
      </div>
    );
  }

  if (accepted) {
    return (
      <div className="text-center">
        <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">Invitation Accepted!</h2>
        <p className="text-gray-500 text-sm">Redirecting you to the board…</p>
      </div>
    );
  }

  const encodedToken = encodeURIComponent(token);

  return (
    <div>
      <div className="text-center mb-6">
        <div className="w-14 h-14 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-7 h-7 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </div>
        <p className="text-sm text-gray-500 mb-1">
          <span className="font-medium text-gray-700">{payload.inviterName}</span> invited you to join
        </p>
        <h2 className="text-2xl font-bold text-gray-900 mb-1">&quot;{payload.boardName}&quot;</h2>
        <span className="inline-block text-xs font-medium px-2.5 py-1 bg-indigo-100 text-indigo-700 rounded-full capitalize">
          as {payload.role}
        </span>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>
      )}

      {user ? (
        <>
          {user.email.toLowerCase() === payload.email.toLowerCase() ? (
            <button
              onClick={handleAccept}
              disabled={accepting}
              className="w-full py-3 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 transition disabled:opacity-60"
            >
              {accepting ? 'Accepting…' : 'Accept Invitation'}
            </button>
          ) : (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800 text-center">
              This invitation was sent to <strong>{payload.email}</strong>.<br />
              Please sign in with that account to accept it.
            </div>
          )}
        </>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-gray-500 text-center">Sign in or create an account to accept this invitation.</p>
          <Link
            href={`/register?redirect=/join%3Ftoken%3D${encodedToken}`}
            className="block w-full py-3 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 transition text-center"
          >
            Create Account & Join
          </Link>
          <Link
            href={`/login?redirect=/join%3Ftoken%3D${encodedToken}`}
            className="block w-full py-3 bg-white border border-gray-300 text-gray-700 rounded-xl font-semibold hover:bg-gray-50 transition text-center"
          >
            Sign In to Accept
          </Link>
        </div>
      )}
    </div>
  );
}

export default function JoinPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 to-white px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold text-indigo-600">TaskBoard</h1>
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
          <Suspense fallback={
            <div className="flex justify-center py-8">
              <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
            </div>
          }>
            <JoinContent />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
