'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useBoardStore } from '@/store/boardStore';
import { useAuthStore } from '@/store/authStore';
import { getInitials, formatRelativeTime } from '@/lib/utils';
import { getSocket } from '@/lib/socket';
import api from '@/lib/api';
import type { ChatMessage } from '@/types';

interface Props {
  boardId: string;
  onClose: () => void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const EDIT_WINDOW_MS = 60 * 1000;

export default function BoardChat({ boardId, onClose }: Props) {
  const { chatMessages, setChatMessages, addChatMessage, updateChatMessage, clearChatUnread, typingUsers } =
    useBoardStore();
  const { user } = useAuthStore();
  const [content, setContent] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  // Tick every second so edit buttons disappear at the right time
  const [, setTick] = useState(0);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const editTextareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isTypingRef = useRef(false);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    clearChatUnread();
    api
      .get(`/boards/${boardId}/messages`)
      .then(({ data }) => setChatMessages(data.data.messages))
      .finally(() => setLoading(false));
    return () => {
      clearChatUnread();
      if (isTypingRef.current) getSocket().emit('chat:stop_typing', { boardId });
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    };
  }, [boardId]);

  // Per-second tick to keep edit window timer accurate
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // Jump to bottom on initial load
  useEffect(() => {
    if (!loading) messagesEndRef.current?.scrollIntoView({ behavior: 'instant' });
  }, [loading]);

  // Smooth scroll on new messages (not when editing)
  useEffect(() => {
    if (!loading && !editingId) messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages.length]);

  // Auto-focus edit textarea when edit mode opens
  useEffect(() => {
    if (editingId) editTextareaRef.current?.focus();
  }, [editingId]);

  const emitTyping = useCallback(() => {
    const socket = getSocket();
    if (!isTypingRef.current) {
      isTypingRef.current = true;
      socket.emit('chat:typing', { boardId });
    }
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      isTypingRef.current = false;
      socket.emit('chat:stop_typing', { boardId });
    }, 2000);
  }, [boardId]);

  const stopTyping = useCallback(() => {
    if (isTypingRef.current) {
      isTypingRef.current = false;
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      getSocket().emit('chat:stop_typing', { boardId });
    }
  }, [boardId]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPendingFile(file);
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (ev) => setFilePreview(ev.target?.result as string);
      reader.readAsDataURL(file);
    } else {
      setFilePreview(null);
    }
    e.target.value = '';
  };

  const clearPendingFile = () => {
    setPendingFile(null);
    setFilePreview(null);
  };

  const sendMessage = async () => {
    const text = content.trim();
    if ((!text && !pendingFile) || sending) return;
    setContent('');
    setSending(true);
    stopTyping();
    if (textareaRef.current) textareaRef.current.style.height = 'auto';

    try {
      let data;
      if (pendingFile) {
        const formData = new FormData();
        formData.append('file', pendingFile);
        if (text) formData.append('caption', text);
        ({ data } = await api.post(`/boards/${boardId}/messages/upload`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        }));
        clearPendingFile();
      } else {
        ({ data } = await api.post(`/boards/${boardId}/messages`, { content: text }));
      }
      addChatMessage(data.data.message);
    } catch {
      setContent(text);
    } finally {
      setSending(false);
      textareaRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // ── Edit helpers ────────────────────────────────────────────────────────────

  const canEdit = (msg: ChatMessage) =>
    !!msg.content &&
    msg.user.id === user?.id &&
    Date.now() - new Date(msg.createdAt).getTime() < EDIT_WINDOW_MS;

  const startEdit = (msg: ChatMessage) => {
    setEditingId(msg.id);
    setEditContent(msg.content ?? '');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditContent('');
  };

  const saveEdit = async () => {
    const text = editContent.trim();
    if (!text || editSaving) return;
    setEditSaving(true);
    try {
      const { data } = await api.patch(`/boards/${boardId}/messages/${editingId}`, { content: text });
      updateChatMessage(data.data.message);
      setEditingId(null);
      setEditContent('');
    } catch {
      // Keep edit open so user can retry
    } finally {
      setEditSaving(false);
    }
  };

  const handleEditKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      saveEdit();
    }
    if (e.key === 'Escape') cancelEdit();
  };

  // Group consecutive messages from the same user within 5 minutes
  const isGrouped = (msg: ChatMessage, prev: ChatMessage | undefined) => {
    if (!prev || msg.user.id !== prev.user.id) return false;
    return new Date(msg.createdAt).getTime() - new Date(prev.createdAt).getTime() < 5 * 60 * 1000;
  };

  const visibleTypers = typingUsers.filter((u) => u.id !== user?.id);

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 shrink-0">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          <h3 className="text-sm font-semibold text-gray-900">Board Chat</h3>
        </div>
        <button
          onClick={onClose}
          className="p-1 text-gray-400 hover:text-gray-600 rounded transition"
          aria-label="Close chat"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-3">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : chatMessages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <div className="w-12 h-12 bg-indigo-50 rounded-full flex items-center justify-center mb-3">
              <svg className="w-6 h-6 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <p className="text-sm font-medium text-gray-700 mb-1">No messages yet</p>
            <p className="text-xs text-gray-400">Start the conversation with your team</p>
          </div>
        ) : (
          <div className="space-y-0.5">
            {chatMessages.map((msg, i) => {
              const prev = chatMessages[i - 1];
              const grouped = isGrouped(msg, prev);
              const isOwn = msg.user.id === user?.id;
              const inEditMode = editingId === msg.id;
              const editable = canEdit(msg);

              return (
                <div
                  key={msg.id}
                  className={`flex gap-2 ${grouped ? 'mt-0.5' : 'mt-3'} ${isOwn ? 'flex-row-reverse' : ''}`}
                >
                  {/* Avatar column */}
                  <div className="w-7 shrink-0">
                    {!grouped && !isOwn && (
                      msg.user.avatarUrl ? (
                        <img
                          src={msg.user.avatarUrl}
                          alt={msg.user.name}
                          className="w-7 h-7 rounded-full object-cover mt-0.5"
                        />
                      ) : (
                        <div className="w-7 h-7 rounded-full bg-indigo-500 flex items-center justify-center text-white text-[10px] font-bold mt-0.5">
                          {getInitials(msg.user.name)}
                        </div>
                      )
                    )}
                  </div>

                  {/* Bubble / edit area */}
                  <div className={`group flex flex-col max-w-[78%] ${isOwn ? 'items-end' : 'items-start'}`}>
                    {!grouped && (
                      <span className={`text-[10px] text-gray-400 mb-0.5 px-1 ${isOwn ? 'text-right' : ''}`}>
                        {isOwn ? 'You' : msg.user.name} · {formatRelativeTime(msg.createdAt)}
                      </span>
                    )}

                    {inEditMode ? (
                      /* ── Inline edit UI ── */
                      <div className="flex flex-col gap-1.5 w-56 sm:w-64">
                        <textarea
                          ref={editTextareaRef}
                          value={editContent}
                          onChange={(e) => setEditContent(e.target.value)}
                          onKeyDown={handleEditKeyDown}
                          rows={2}
                          className="w-full px-3 py-2 text-sm rounded-xl border border-indigo-400 ring-1 ring-indigo-200 outline-none resize-none bg-white text-gray-800 leading-relaxed"
                        />
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={saveEdit}
                            disabled={!editContent.trim() || editSaving}
                            className="px-2.5 py-1 text-xs font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition disabled:opacity-40"
                          >
                            {editSaving ? 'Saving…' : 'Save'}
                          </button>
                          <button
                            onClick={cancelEdit}
                            className="px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition"
                          >
                            Cancel
                          </button>
                          <span className="text-[10px] text-gray-400 ml-auto">Esc to cancel</span>
                        </div>
                      </div>
                    ) : (
                      /* ── Normal bubble ── */
                      <>
                        <div
                          className={`px-3 py-2 text-sm leading-relaxed break-words whitespace-pre-wrap ${
                            isOwn
                              ? 'bg-indigo-600 text-white rounded-2xl rounded-tr-sm'
                              : 'bg-gray-100 text-gray-800 rounded-2xl rounded-tl-sm'
                          }`}
                        >
                          {/* Attachment */}
                          {msg.attachment && (
                            <div className="mb-1">
                              {msg.attachment.type.startsWith('image/') ? (
                                <a href={msg.attachment.url} target="_blank" rel="noopener noreferrer">
                                  <img
                                    src={msg.attachment.url}
                                    alt={msg.attachment.name}
                                    className="max-w-full rounded-lg max-h-48 object-cover"
                                  />
                                </a>
                              ) : (
                                <a
                                  href={msg.attachment.url}
                                  download={msg.attachment.name}
                                  className={`flex items-center gap-2 rounded-lg px-2 py-1.5 transition ${
                                    isOwn
                                      ? 'bg-indigo-500 hover:bg-indigo-400'
                                      : 'bg-white hover:bg-gray-50 border border-gray-200'
                                  }`}
                                >
                                  <svg className={`w-4 h-4 shrink-0 ${isOwn ? 'text-indigo-200' : 'text-indigo-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                                  </svg>
                                  <div className="min-w-0">
                                    <p className={`text-xs font-medium truncate ${isOwn ? 'text-white' : 'text-gray-800'}`}>
                                      {msg.attachment.name}
                                    </p>
                                    <p className={`text-[10px] ${isOwn ? 'text-indigo-200' : 'text-gray-400'}`}>
                                      {formatBytes(msg.attachment.size)}
                                    </p>
                                  </div>
                                  <svg className={`w-3.5 h-3.5 shrink-0 ml-auto ${isOwn ? 'text-indigo-200' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                  </svg>
                                </a>
                              )}
                            </div>
                          )}

                          {/* Text content */}
                          {msg.content && (
                            <span>
                              {msg.content}
                              {msg.editedAt && (
                                <span className={`text-[10px] italic ml-1.5 ${isOwn ? 'text-indigo-200' : 'text-gray-400'}`}>
                                  (edited)
                                </span>
                              )}
                            </span>
                          )}
                        </div>

                        {/* Edit button — only own text messages within 1 minute */}
                        {editable && (
                          <button
                            onClick={() => startEdit(msg)}
                            className="opacity-0 group-hover:opacity-100 transition-opacity mt-0.5 flex items-center gap-0.5 text-[10px] text-gray-400 hover:text-indigo-600 px-1"
                          >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                            Edit
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Typing indicator */}
        {visibleTypers.length > 0 && (
          <div className="flex items-center gap-1.5 px-2 pt-2">
            <div className="flex gap-0.5 items-end">
              <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
            <span className="text-xs text-gray-400">
              {visibleTypers.length === 1
                ? `${visibleTypers[0].name} is typing…`
                : visibleTypers.length === 2
                ? `${visibleTypers[0].name} and ${visibleTypers[1].name} are typing…`
                : 'Several people are typing…'}
            </span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* File preview strip */}
      {pendingFile && (
        <div className="mx-3 mb-2 p-2 bg-gray-50 border border-gray-200 rounded-xl flex items-center gap-2">
          {filePreview ? (
            <img src={filePreview} alt="preview" className="w-10 h-10 rounded-lg object-cover shrink-0" />
          ) : (
            <div className="w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
              </svg>
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-gray-800 truncate">{pendingFile.name}</p>
            <p className="text-[10px] text-gray-400">{formatBytes(pendingFile.size)}</p>
          </div>
          <button
            onClick={clearPendingFile}
            className="p-1 text-gray-400 hover:text-gray-600 rounded transition shrink-0"
            aria-label="Remove file"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Input */}
      <div className="px-3 pb-3 pt-2 border-t border-gray-100 shrink-0">
        <div className="flex gap-2 items-end bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 focus-within:border-indigo-400 focus-within:ring-1 focus-within:ring-indigo-200 transition">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="shrink-0 text-gray-400 hover:text-indigo-500 transition pb-0.5"
            title="Attach file"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
            </svg>
          </button>
          <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileSelect} />

          <textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => {
              setContent(e.target.value);
              emitTyping();
            }}
            onKeyDown={handleKeyDown}
            placeholder={pendingFile ? 'Add a caption… (optional)' : 'Message the team…'}
            rows={1}
            className="flex-1 bg-transparent text-sm text-gray-800 placeholder-gray-400 resize-none outline-none"
            style={{ maxHeight: '120px' }}
            onInput={(e) => {
              const el = e.currentTarget;
              el.style.height = 'auto';
              el.style.height = Math.min(el.scrollHeight, 120) + 'px';
            }}
          />
          <button
            onClick={sendMessage}
            disabled={(!content.trim() && !pendingFile) || sending}
            className="shrink-0 w-8 h-8 flex items-center justify-center bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label="Send message"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </div>
        <p className="text-[10px] text-gray-400 mt-1 ml-1">Enter to send · Shift+Enter for new line</p>
      </div>
    </div>
  );
}
