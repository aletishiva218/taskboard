'use client';
import { useState, useRef } from 'react';
import { useAuthStore } from '@/store/authStore';
import { getInitials } from '@/lib/utils';
import api from '@/lib/api';

export default function SettingsPage() {
  const { user, setUser } = useAuthStore();
  const [name, setName] = useState(user?.name || '');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarMsg, setAvatarMsg] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [pwMsg, setPwMsg] = useState('');
  const [pwSaving, setPwSaving] = useState(false);

  const [prefs, setPrefs] = useState(user?.notificationPreferences || {
    board_invite: true,
    card_assigned: true,
    due_date: true,
    activity: true,
    role_changed: true,
  });
  const [emailNotifications, setEmailNotifications] = useState(user?.emailNotifications ?? true);
  const [prefSaving, setPrefSaving] = useState(false);

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarUploading(true);
    setAvatarMsg('');
    try {
      const formData = new FormData();
      formData.append('avatar', file);
      const { data } = await api.post('/users/avatar', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setUser({ ...user!, avatarUrl: data.data.user.avatar_url });
      setAvatarMsg('Photo updated.');
    } catch {
      setAvatarMsg('Failed to upload photo.');
    } finally {
      setAvatarUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleAvatarRemove = async () => {
    setAvatarUploading(true);
    setAvatarMsg('');
    try {
      await api.delete('/users/avatar');
      setUser({ ...user!, avatarUrl: null });
      setAvatarMsg('Photo removed.');
    } catch {
      setAvatarMsg('Failed to remove photo.');
    } finally {
      setAvatarUploading(false);
    }
  };

  const saveProfile = async () => {
    setSaving(true);
    setMsg('');
    try {
      const { data } = await api.patch('/users/profile', { name });
      setUser({ ...user!, name: data.data.user.name });
      setMsg('Profile updated.');
    } catch {
      setMsg('Failed to update profile.');
    } finally {
      setSaving(false);
    }
  };

  const savePassword = async () => {
    setPwSaving(true);
    setPwMsg('');
    try {
      await api.patch('/users/change-password', { currentPassword: currentPw, newPassword: newPw });
      setPwMsg('Password updated. Please log in again.');
      setCurrentPw('');
      setNewPw('');
    } catch (err: unknown) {
      const m = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setPwMsg(m || 'Failed to update password.');
    } finally {
      setPwSaving(false);
    }
  };

  const savePrefs = async () => {
    setPrefSaving(true);
    try {
      await api.patch('/users/notification-preferences', {
        emailNotifications,
        notificationPreferences: prefs,
      });
    } catch {}
    setPrefSaving(false);
  };

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-8">
      <h1 className="text-2xl font-bold text-gray-900">Settings</h1>

      {/* Profile */}
      <section className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Profile</h2>
        <div className="space-y-4">
          {/* Avatar */}
          <div className="flex items-center gap-5">
            <div className="relative shrink-0">
              {user?.avatarUrl ? (
                <img
                  src={user.avatarUrl}
                  alt={user.name}
                  className="w-20 h-20 rounded-full object-cover border-2 border-gray-200"
                />
              ) : (
                <div className="w-20 h-20 bg-indigo-600 rounded-full flex items-center justify-center text-white text-2xl font-bold border-2 border-gray-200">
                  {getInitials(user?.name || '')}
                </div>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp"
                className="hidden"
                onChange={handleAvatarChange}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={avatarUploading}
                className="px-3 py-1.5 text-sm font-medium text-indigo-600 border border-indigo-300 rounded-lg hover:bg-indigo-50 transition disabled:opacity-60"
              >
                {avatarUploading ? 'Uploading...' : 'Change Photo'}
              </button>
              {user?.avatarUrl && (
                <button
                  onClick={handleAvatarRemove}
                  disabled={avatarUploading}
                  className="px-3 py-1.5 text-sm font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition disabled:opacity-60"
                >
                  Remove Photo
                </button>
              )}
              {avatarMsg && <p className="text-xs text-indigo-600">{avatarMsg}</p>}
              <p className="text-xs text-gray-400">JPG, PNG, GIF or WebP · max 5 MB</p>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              value={user?.email || ''}
              readOnly
              className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm bg-gray-50 text-gray-500 cursor-not-allowed"
            />
          </div>
          {msg && <p className="text-sm text-indigo-600">{msg}</p>}
          <button
            onClick={saveProfile}
            disabled={saving}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition disabled:opacity-60"
          >
            {saving ? 'Saving...' : 'Save Profile'}
          </button>
        </div>
      </section>

      {/* Change Password — hidden for OAuth-only users */}
      {user?.hasPassword && (
        <section className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Change Password</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Current Password</label>
              <input
                type="password"
                value={currentPw}
                onChange={(e) => setCurrentPw(e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">New Password</label>
              <input
                type="password"
                value={newPw}
                onChange={(e) => setNewPw(e.target.value)}
                minLength={8}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
            {pwMsg && <p className="text-sm text-indigo-600">{pwMsg}</p>}
            <button
              onClick={savePassword}
              disabled={pwSaving}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition disabled:opacity-60"
            >
              {pwSaving ? 'Updating...' : 'Update Password'}
            </button>
          </div>
        </section>
      )}

      {/* Notification Preferences */}
      <section className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-1">Notification Preferences</h2>
        <p className="text-sm text-gray-500 mb-4">Choose which emails you want to receive.</p>

        <div className="space-y-3">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={emailNotifications}
              onChange={(e) => setEmailNotifications(e.target.checked)}
              className="w-4 h-4 text-indigo-600 rounded"
            />
            <span className="text-sm font-medium text-gray-900">Email notifications enabled</span>
          </label>

          {emailNotifications && (
            <div className="ml-7 space-y-2 pt-2 border-t border-gray-100">
              {(Object.entries(prefs) as [keyof typeof prefs, boolean][]).map(([key, val]) => (
                <label key={key} className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={val}
                    onChange={(e) => setPrefs((p) => ({ ...p, [key]: e.target.checked }))}
                    className="w-4 h-4 text-indigo-600 rounded"
                  />
                  <span className="text-sm text-gray-700 capitalize">{key.replace('_', ' ')}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        <button
          onClick={savePrefs}
          disabled={prefSaving}
          className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition disabled:opacity-60"
        >
          {prefSaving ? 'Saving...' : 'Save Preferences'}
        </button>
      </section>
    </div>
  );
}
