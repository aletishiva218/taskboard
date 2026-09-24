'use client';
import { useState, useEffect, useRef } from 'react';
import api from '@/lib/api';
import type { BoardMember } from '@/types';

interface Props {
  boardId: string;
  boardName: string;
  currentRole: string;
  onClose: () => void;
}

const ROLE_COLORS: Record<string, string> = {
  owner: 'bg-purple-100 text-purple-700',
  editor: 'bg-blue-100 text-blue-700',
  viewer: 'bg-gray-100 text-gray-600',
};

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function Avatar({ name, avatarUrl }: { name: string; avatarUrl: string | null }) {
  if (avatarUrl) {
    return <img src={avatarUrl} alt={name} className="w-8 h-8 rounded-full object-cover" />;
  }
  return (
    <div className="w-8 h-8 rounded-full bg-indigo-500 flex items-center justify-center text-white text-xs font-semibold flex-shrink-0">
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

export default function ShareBoardModal({ boardId, boardName, currentRole, onClose }: Props) {
  const [members, setMembers] = useState<BoardMember[]>([]);
  const [emailInput, setEmailInput] = useState('');
  const [emailChips, setEmailChips] = useState<string[]>([]);
  const [role, setRole] = useState<'editor' | 'viewer'>('editor');
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState('');
  const [inviteSuccess, setInviteSuccess] = useState('');
  const [removingId, setRemovingId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const isOwner = currentRole === 'owner';

  useEffect(() => {
    api.get(`/boards/${boardId}`).then(({ data }) => {
      setMembers(data.data.members || []);
    });
  }, [boardId]);

  const addChip = (value: string) => {
    const trimmed = value.trim().toLowerCase();
    if (trimmed && isValidEmail(trimmed) && !emailChips.includes(trimmed)) {
      setEmailChips((prev) => [...prev, trimmed]);
    }
    setEmailInput('');
  };

  const removeChip = (chip: string) => {
    setEmailChips((prev) => prev.filter((e) => e !== chip));
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addChip(emailInput);
    } else if (e.key === 'Backspace' && !emailInput && emailChips.length > 0) {
      setEmailChips((prev) => prev.slice(0, -1));
    }
  };

  const handleInviteAll = async () => {
    const toInvite = emailInput.trim() ? [...emailChips, emailInput.trim()] : [...emailChips];
    const validEmails = toInvite.filter(isValidEmail);
    if (validEmails.length === 0) return;

    setInviteError('');
    setInviteSuccess('');
    setInviteLoading(true);

    const errors: string[] = [];
    for (const email of validEmails) {
      try {
        await api.post(`/boards/${boardId}/members`, { email, role });
      } catch (err: unknown) {
        const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
        errors.push(`${email}: ${msg || 'Failed'}`);
      }
    }

    setInviteLoading(false);
    setEmailChips([]);
    setEmailInput('');

    if (errors.length > 0) {
      setInviteError(errors.join(' · '));
    } else {
      const count = validEmails.length;
      setInviteSuccess(`Invitation${count > 1 ? 's' : ''} sent to ${count} ${count > 1 ? 'people' : 'person'}.`);
    }
  };

  const handleRemove = async (userId: string) => {
    setRemovingId(userId);
    try {
      await api.delete(`/boards/${boardId}/members/${userId}`);
      setMembers((prev) => prev.filter((m) => m.user_id !== userId));
    } catch {}
    setRemovingId(null);
  };

  const handleRoleChange = async (userId: string, newRole: 'editor' | 'viewer') => {
    try {
      await api.patch(`/boards/${boardId}/members/${userId}/role`, { role: newRole });
      setMembers((prev) => prev.map((m) => (m.user_id === userId ? { ...m, role: newRole } : m)));
    } catch {}
  };

  const pendingCount = emailChips.length + (emailInput.trim() && isValidEmail(emailInput.trim()) ? 1 : 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="font-bold text-gray-900 text-lg">Share Board</h2>
            <p className="text-gray-500 text-sm mt-0.5 truncate max-w-xs">{boardName}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-4 space-y-5">
          {/* Invite by email (owners only) */}
          {isOwner && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Invite People</p>

              {/* Chip input box */}
              <div
                className="min-h-[42px] w-full border border-gray-200 rounded-lg px-2 py-1.5 flex flex-wrap gap-1.5 cursor-text focus-within:ring-2 focus-within:ring-indigo-400 focus-within:border-transparent"
                onClick={() => inputRef.current?.focus()}
              >
                {emailChips.map((chip) => (
                  <span
                    key={chip}
                    className="inline-flex items-center gap-1 bg-indigo-50 text-indigo-700 text-xs font-medium px-2 py-0.5 rounded-full"
                  >
                    {chip}
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); removeChip(chip); }}
                      className="text-indigo-400 hover:text-indigo-700 leading-none"
                    >
                      ×
                    </button>
                  </span>
                ))}
                <input
                  ref={inputRef}
                  type="text"
                  value={emailInput}
                  onChange={(e) => { setEmailInput(e.target.value); setInviteError(''); setInviteSuccess(''); }}
                  onKeyDown={handleInputKeyDown}
                  onBlur={() => { if (emailInput.trim()) addChip(emailInput); }}
                  placeholder={emailChips.length === 0 ? 'Type email and press Enter…' : ''}
                  className="flex-1 min-w-[140px] text-sm outline-none bg-transparent py-0.5"
                />
              </div>

              <div className="flex gap-2 mt-2">
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as 'editor' | 'viewer')}
                  className="border border-gray-200 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                >
                  <option value="editor">Editor</option>
                  <option value="viewer">Viewer</option>
                </select>
                <button
                  type="button"
                  onClick={handleInviteAll}
                  disabled={inviteLoading || pendingCount === 0}
                  className="flex-1 bg-indigo-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition"
                >
                  {inviteLoading ? 'Sending…' : pendingCount > 1 ? `Invite ${pendingCount} people` : 'Send Invite'}
                </button>
              </div>

              {inviteError && <p className="text-red-600 text-xs mt-1.5">{inviteError}</p>}
              {inviteSuccess && <p className="text-green-600 text-xs mt-1.5">{inviteSuccess}</p>}
            </div>
          )}

          {/* Members list */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Members ({members.length})
            </p>
            <ul className="space-y-2">
              {members.map((member) => (
                <li key={member.user_id} className="flex items-center gap-3">
                  <Avatar name={member.name} avatarUrl={member.avatar_url} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{member.name}</p>
                    <p className="text-xs text-gray-400 truncate">{member.email}</p>
                  </div>
                  {isOwner && member.role !== 'owner' ? (
                    <div className="flex items-center gap-1.5">
                      <select
                        value={member.role}
                        onChange={(e) => handleRoleChange(member.user_id, e.target.value as 'editor' | 'viewer')}
                        className="text-xs border border-gray-200 rounded-md px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                      >
                        <option value="editor">Editor</option>
                        <option value="viewer">Viewer</option>
                      </select>
                      <button
                        onClick={() => handleRemove(member.user_id)}
                        disabled={removingId === member.user_id}
                        className="text-red-400 hover:text-red-600 transition disabled:opacity-50"
                        title="Remove member"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ) : (
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${ROLE_COLORS[member.role]}`}>
                      {member.role}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
