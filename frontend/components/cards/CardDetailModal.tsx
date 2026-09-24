'use client';
import { useEffect, useState, useRef } from 'react';
import api from '@/lib/api';
import { useBoard } from '@/hooks/useBoard';
import { getLabelStyles, formatRelativeTime } from '@/lib/utils';
import { getSocket } from '@/lib/socket';
import type { Card, Comment, Attachment, Activity } from '@/types';
import { LABEL_COLORS } from '@/types';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

const LABEL_BG: Record<string, string> = {
  red: 'bg-red-500', orange: 'bg-orange-400', yellow: 'bg-yellow-400',
  green: 'bg-green-500', blue: 'bg-blue-500', purple: 'bg-purple-500', pink: 'bg-pink-400',
};

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function ActivityAction({ action, metadata }: { action: string; metadata: Record<string, unknown> }) {
  const text = (() => {
    switch (action) {
      case 'card_created': return `created this card in "${metadata.list_name}"`;
      case 'card_updated': return 'updated this card';
      case 'card_moved': return `moved this card to "${metadata.to_list}"`;
      case 'card_assigned': return 'was assigned to this card';
      case 'comment_added': return `commented: "${metadata.preview}"`;
      case 'attachment_added': return `attached "${metadata.name}"`;
      default: return action.replace(/_/g, ' ');
    }
  })();
  return <span>{text}</span>;
}

interface Props {
  cardId: string;
  boardId: string;
  onClose: () => void;
}

export default function CardDetailModal({ cardId, boardId, onClose }: Props) {
  const { updateCard, deleteCard, currentBoard } = useBoard();
  const isViewer = (currentBoard?.role ?? 'viewer') === 'viewer';
  const boardMembers = currentBoard?.members || [];

  const [card, setCard] = useState<Card | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [comments, setComments] = useState<Comment[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [newComment, setNewComment] = useState('');
  const [activeTab, setActiveTab] = useState<'comments' | 'activity'>('comments');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [addingComment, setAddingComment] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [togglingLabel, setTogglingLabel] = useState<string | null>(null);
  const [togglingAssignee, setTogglingAssignee] = useState<string | null>(null);
  const [saveError, setSaveError] = useState('');
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    Promise.all([
      api.get(`/boards/${boardId}/cards/${cardId}`),
      api.get(`/boards/${boardId}/cards/${cardId}/comments`),
      api.get(`/boards/${boardId}/cards/${cardId}/attachments`),
      api.get(`/boards/${boardId}/cards/${cardId}/activity`),
    ]).then(([cardRes, commentsRes, attachmentsRes, activityRes]) => {
      const c = cardRes.data.data.card as Card;
      setCard(c);
      setName(c.name);
      setDescription(c.description || '');
      setDueDate(c.due_date ? c.due_date.substring(0, 10) : '');
      setComments(commentsRes.data.data.comments);
      setAttachments(attachmentsRes.data.data.attachments);
      setActivity(activityRes.data.data.activity);
    }).finally(() => setLoading(false));
  }, [cardId, boardId]);

  useEffect(() => {
    const socket = getSocket();
    const onCommentCreated = ({ comment, cardId: cId }: { comment: Comment; cardId: string }) => {
      if (cId === cardId) setComments(prev => prev.some(c => c.id === comment.id) ? prev : [...prev, comment]);
    };
    const onCommentDeleted = ({ commentId, cardId: cId }: { commentId: string; cardId: string }) => {
      if (cId === cardId) setComments(prev => prev.filter(c => c.id !== commentId));
    };
    const onAttachmentCreated = ({ attachment, cardId: cId }: { attachment: Attachment; cardId: string }) => {
      if (cId === cardId) setAttachments(prev => prev.some(a => a.id === attachment.id) ? prev : [attachment, ...prev]);
    };
    const onAttachmentDeleted = ({ attachmentId, cardId: cId }: { attachmentId: string; cardId: string }) => {
      if (cId === cardId) setAttachments(prev => prev.filter(a => a.id !== attachmentId));
    };
    socket.on('comment:created', onCommentCreated);
    socket.on('comment:deleted', onCommentDeleted);
    socket.on('attachment:created', onAttachmentCreated);
    socket.on('attachment:deleted', onAttachmentDeleted);
    return () => {
      socket.off('comment:created', onCommentCreated);
      socket.off('comment:deleted', onCommentDeleted);
      socket.off('attachment:created', onAttachmentCreated);
      socket.off('attachment:deleted', onAttachmentDeleted);
    };
  }, [cardId]);

  const handleSave = async () => {
    setSaving(true);
    setSaveError('');
    try {
      await updateCard(boardId, cardId, {
        name: name.trim(),
        description: description || null,
        due_date: dueDate || null,
      } as Partial<Card>);
      onClose();
    } catch {
      setSaveError('Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Delete this card?')) return;
    await deleteCard(boardId, cardId);
    onClose();
  };

  const toggleLabel = async (color: string) => {
    if (!card || togglingLabel) return;
    setTogglingLabel(color);
    try {
      const existing = card.labels.find(l => l.color === color);
      if (existing) {
        await api.delete(`/boards/${boardId}/cards/${cardId}/labels/${existing.id}`);
        setCard(prev => prev ? { ...prev, labels: prev.labels.filter(l => l.id !== existing.id) } : null);
      } else {
        const { data } = await api.post(`/boards/${boardId}/cards/${cardId}/labels`, { color });
        setCard(data.data.card);
      }
    } finally {
      setTogglingLabel(null);
    }
  };

  const toggleAssignee = async (userId: string, isAssigned: boolean) => {
    if (togglingAssignee || !card) return;
    setTogglingAssignee(userId);
    try {
      if (isAssigned) {
        await api.delete(`/boards/${boardId}/cards/${cardId}/assignees/${userId}`);
        setCard((prev) => prev ? { ...prev, assignees: prev.assignees.filter((a) => a.id !== userId) } : null);
      } else {
        const { data } = await api.post(`/boards/${boardId}/cards/${cardId}/assignees`, { userId });
        setCard(data.data.card);
      }
    } finally {
      setTogglingAssignee(null);
    }
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim() || addingComment) return;
    setAddingComment(true);
    try {
      const { data } = await api.post(`/boards/${boardId}/cards/${cardId}/comments`, { text: newComment.trim() });
      setComments(prev => prev.some(c => c.id === data.data.comment.id) ? prev : [...prev, data.data.comment]);
      setNewComment('');
    } finally {
      setAddingComment(false);
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    await api.delete(`/boards/${boardId}/cards/${cardId}/comments/${commentId}`);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingFile(true);
    const formData = new FormData();
    formData.append('file', file);
    try {
      const { data } = await api.post(`/boards/${boardId}/cards/${cardId}/attachments`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setAttachments(prev => prev.some(a => a.id === data.data.attachment.id) ? prev : [data.data.attachment, ...prev]);
    } finally {
      setUploadingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDeleteAttachment = async (attachmentId: string) => {
    await api.delete(`/boards/${boardId}/cards/${cardId}/attachments/${attachmentId}`);
  };

  return (
    <>
      {/* Lightbox */}
      {lightboxSrc && (
        <div
          className="fixed inset-0 bg-black/80 z-[60] flex items-center justify-center p-4"
          onClick={() => setLightboxSrc(null)}
        >
          <img src={lightboxSrc} alt="Preview" className="max-w-full max-h-full rounded-lg object-contain" />
          <button className="absolute top-4 right-4 text-white hover:text-gray-300">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      <div
        className="fixed inset-0 bg-black/50 flex items-end sm:items-start justify-center z-50 sm:p-4 sm:pt-8 sm:overflow-y-auto animate-fade-in"
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      >
        <div className="bg-gray-100 rounded-t-2xl sm:rounded-2xl shadow-xl w-full max-w-3xl sm:mb-8 sm:flex-shrink-0 animate-slide-up max-h-[90vh] overflow-y-auto sm:max-h-none sm:overflow-visible">
          {loading ? (
            <div className="p-12 text-center">
              <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto" />
            </div>
          ) : card ? (
            <>
              {/* Header */}
              <div className="flex items-start gap-3 p-4 sm:p-5 pb-3">
                <svg className="w-5 h-5 text-gray-500 mt-1 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                <input
                  value={name}
                  onChange={(e) => !isViewer && setName(e.target.value)}
                  readOnly={isViewer}
                  className={`flex-1 text-lg font-bold text-gray-900 bg-transparent border-none outline-none rounded px-1 py-0.5 ${isViewer ? 'cursor-default' : 'focus:bg-white focus:ring-2 focus:ring-indigo-500'}`}
                />
                <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 shrink-0">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Body */}
              <div className="flex flex-col sm:flex-row gap-4 px-4 sm:px-5 pb-5">
                {/* Left column */}
                <div className="flex-1 min-w-0 space-y-5">

                  {/* Labels display */}
                  {card.labels.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Labels</p>
                      <div className="flex flex-wrap gap-1.5">
                        {card.labels.map((label) => {
                          const s = getLabelStyles(label.color);
                          return (
                            <span key={label.id} className={`text-xs px-2.5 py-1 rounded-full font-medium ${s.bg} ${s.text}`}>
                              {label.text || label.color}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Assignees */}
                  {card.assignees.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Members</p>
                      <div className="flex flex-wrap gap-2">
                        {card.assignees.map((a) => (
                          <span key={a.id} className="flex items-center gap-1.5 text-sm text-gray-700 bg-white rounded-full px-3 py-1 shadow-sm">
                            <div className="w-5 h-5 rounded-full bg-indigo-500 flex items-center justify-center text-white text-xs font-bold">
                              {a.name.charAt(0).toUpperCase()}
                            </div>
                            {a.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Due date display */}
                  {dueDate && (
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Due Date</p>
                      <span className="text-sm text-gray-700 bg-white rounded-lg px-3 py-1.5 shadow-sm inline-block">
                        {new Date(dueDate + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                      </span>
                    </div>
                  )}

                  {/* Description */}
                  <div className="bg-white rounded-xl p-4 shadow-sm">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Description</p>
                    <textarea
                      value={description}
                      onChange={(e) => !isViewer && setDescription(e.target.value)}
                      readOnly={isViewer}
                      rows={4}
                      placeholder={isViewer ? 'No description.' : 'Add a more detailed description...'}
                      className={`w-full text-sm text-gray-700 outline-none resize-none placeholder-gray-400 ${isViewer ? 'cursor-default' : ''}`}
                    />
                  </div>

                  {/* Attachments */}
                  {attachments.length > 0 && (
                    <div className="bg-white rounded-xl p-4 shadow-sm">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Attachments</p>
                      <div className="space-y-2">
                        {attachments.map((att) => {
                          const isImage = att.mimetype.startsWith('image/');
                          const fileUrl = (att as { url?: string | null }).url ?? `${API_URL}/uploads/${att.filename}`;
                          return (
                            <div key={att.id} className="flex items-center gap-3 group">
                              {isImage ? (
                                <button
                                  onClick={() => setLightboxSrc(fileUrl)}
                                  className="w-16 h-12 rounded-lg overflow-hidden bg-gray-100 shrink-0"
                                >
                                  <img src={fileUrl} alt={att.original_name} className="w-full h-full object-cover" />
                                </button>
                              ) : (
                                <div className="w-16 h-12 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
                                  <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                  </svg>
                                </div>
                              )}
                              <div className="flex-1 min-w-0">
                                <a
                                  href={fileUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-sm font-medium text-gray-800 hover:text-indigo-600 truncate block"
                                >
                                  {att.original_name}
                                </a>
                                <p className="text-xs text-gray-400 mt-0.5">
                                  {formatBytes(att.size)} · {formatRelativeTime(att.created_at)} by {att.user_name}
                                </p>
                              </div>
                              {!isViewer && (
                                <button
                                  onClick={() => handleDeleteAttachment(att.id)}
                                  className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition p-1"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                  </svg>
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Activity & Comments */}
                  <div className="bg-white rounded-xl p-4 shadow-sm">
                    <div className="flex gap-4 mb-4 border-b border-gray-100">
                      {(['comments', 'activity'] as const).map((tab) => (
                        <button
                          key={tab}
                          onClick={() => setActiveTab(tab)}
                          className={`pb-2 text-sm font-medium capitalize transition border-b-2 -mb-px ${
                            activeTab === tab
                              ? 'border-indigo-600 text-indigo-600'
                              : 'border-transparent text-gray-500 hover:text-gray-700'
                          }`}
                        >
                          {tab} {tab === 'comments' ? `(${comments.length})` : `(${activity.length})`}
                        </button>
                      ))}
                    </div>

                    {activeTab === 'comments' && (
                      <div>
                        {/* Add comment — hidden for viewers */}
                        {!isViewer && (
                          <form onSubmit={handleAddComment} className="mb-4">
                            <textarea
                              value={newComment}
                              onChange={(e) => setNewComment(e.target.value)}
                              placeholder="Write a comment..."
                              rows={2}
                              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                                  e.preventDefault();
                                  handleAddComment(e as unknown as React.FormEvent);
                                }
                              }}
                            />
                            {newComment.trim() && (
                              <div className="flex gap-2 mt-2">
                                <button
                                  type="submit"
                                  disabled={addingComment}
                                  className="px-3 py-1.5 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-60"
                                >
                                  {addingComment ? 'Saving...' : 'Save'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setNewComment('')}
                                  className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900"
                                >
                                  Cancel
                                </button>
                              </div>
                            )}
                          </form>
                        )}

                        {/* Comments list */}
                        <div className="space-y-3">
                          {comments.length === 0 && (
                            <p className="text-sm text-gray-400 text-center py-4">No comments yet.</p>
                          )}
                          {comments.map((comment) => (
                            <div key={comment.id} className="flex gap-3 group">
                              <div className="w-7 h-7 rounded-full bg-indigo-500 flex items-center justify-center text-white text-xs font-bold shrink-0 mt-0.5">
                                {comment.user_name.charAt(0).toUpperCase()}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-baseline gap-2">
                                  <span className="text-sm font-medium text-gray-800">{comment.user_name}</span>
                                  <span className="text-xs text-gray-400">{formatRelativeTime(comment.created_at)}</span>
                                </div>
                                <p className="text-sm text-gray-700 mt-0.5 whitespace-pre-wrap">{comment.text}</p>
                              </div>
                              {!isViewer && (
                                <button
                                  onClick={() => handleDeleteComment(comment.id)}
                                  className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition p-1 shrink-0"
                                >
                                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                  </svg>
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {activeTab === 'activity' && (
                      <div className="space-y-2">
                        {activity.length === 0 && (
                          <p className="text-sm text-gray-400 text-center py-4">No activity yet.</p>
                        )}
                        {activity.map((entry) => (
                          <div key={entry.id} className="flex gap-3">
                            <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 text-xs font-bold shrink-0 mt-0.5">
                              {entry.name ? entry.name.charAt(0).toUpperCase() : '?'}
                            </div>
                            <div className="flex-1">
                              <span className="text-sm font-medium text-gray-700">{entry.name || 'System'} </span>
                              <span className="text-sm text-gray-500">
                                <ActivityAction action={entry.action} metadata={entry.metadata as Record<string, unknown>} />
                              </span>
                              <p className="text-xs text-gray-400 mt-0.5">{formatRelativeTime(entry.created_at)}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {saveError && (
                    <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">{saveError}</div>
                  )}
                </div>

                {/* Right sidebar — full width on mobile, fixed-width column on desktop */}
                {!isViewer && (
                  <div className="w-full sm:w-48 shrink-0 space-y-4">
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Add to card</p>

                      {/* Members */}
                      <div className="bg-white rounded-xl p-3 shadow-sm mb-3">
                        <p className="text-xs font-medium text-gray-600 mb-2">Members</p>
                        <div className="space-y-1">
                          {boardMembers.map((member) => {
                            const isAssigned = card.assignees.some((a) => a.id === member.user_id);
                            const isToggling = togglingAssignee === member.user_id;
                            return (
                              <button
                                key={member.user_id}
                                onClick={() => toggleAssignee(member.user_id, isAssigned)}
                                disabled={isToggling}
                                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg transition text-left disabled:opacity-60 ${
                                  isAssigned ? 'bg-indigo-50' : 'hover:bg-gray-50'
                                }`}
                              >
                                <div className="w-6 h-6 rounded-full bg-indigo-500 flex items-center justify-center text-white text-xs font-bold shrink-0">
                                  {member.name.charAt(0).toUpperCase()}
                                </div>
                                <span className={`text-xs flex-1 truncate ${isAssigned ? 'text-indigo-700 font-medium' : 'text-gray-700'}`}>
                                  {member.name}
                                </span>
                                {isAssigned && (
                                  <svg className="w-3.5 h-3.5 text-indigo-600 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                  </svg>
                                )}
                              </button>
                            );
                          })}
                          {boardMembers.length === 0 && (
                            <p className="text-xs text-gray-400 text-center py-1">No members</p>
                          )}
                        </div>
                      </div>

                      {/* Labels */}
                      <div className="bg-white rounded-xl p-3 shadow-sm mb-3">
                        <p className="text-xs font-medium text-gray-600 mb-2">Labels</p>
                        <div className="grid grid-cols-4 gap-1.5">
                          {LABEL_COLORS.map(({ value }) => {
                            const isActive = card.labels.some(l => l.color === value);
                            return (
                              <button
                                key={value}
                                onClick={() => toggleLabel(value)}
                                disabled={togglingLabel === value}
                                title={value}
                                className={`h-6 rounded transition-all ${LABEL_BG[value] || 'bg-gray-400'} ${
                                  isActive ? 'ring-2 ring-offset-1 ring-gray-700 opacity-100' : 'opacity-70 hover:opacity-100'
                                }`}
                              />
                            );
                          })}
                        </div>
                      </div>

                      {/* Due Date */}
                      <div className="bg-white rounded-xl p-3 shadow-sm mb-3">
                        <p className="text-xs font-medium text-gray-600 mb-2">Due Date</p>
                        <input
                          type="date"
                          value={dueDate}
                          onChange={(e) => setDueDate(e.target.value)}
                          className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                        {dueDate && (
                          <button
                            onClick={() => setDueDate('')}
                            className="text-xs text-gray-400 hover:text-red-500 mt-1"
                          >
                            Remove date
                          </button>
                        )}
                      </div>

                      {/* Attachment */}
                      <div className="bg-white rounded-xl p-3 shadow-sm">
                        <p className="text-xs font-medium text-gray-600 mb-2">Attachment</p>
                        <input
                          ref={fileInputRef}
                          type="file"
                          className="hidden"
                          onChange={handleFileChange}
                        />
                        <button
                          onClick={() => fileInputRef.current?.click()}
                          disabled={uploadingFile}
                          className="w-full text-xs py-1.5 px-2 border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600 transition disabled:opacity-60"
                        >
                          {uploadingFile ? 'Uploading...' : '+ Add file'}
                        </button>
                      </div>
                    </div>

                    {/* Actions */}
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Actions</p>
                      <div className="space-y-2">
                        <button
                          onClick={handleSave}
                          disabled={saving}
                          className="w-full py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition disabled:opacity-60"
                        >
                          {saving ? 'Saving...' : 'Save Changes'}
                        </button>
                        <button
                          onClick={handleDelete}
                          className="w-full py-2 bg-red-50 text-red-600 rounded-lg text-sm font-medium hover:bg-red-100 transition"
                        >
                          Delete Card
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="p-8 text-center text-gray-500">Card not found</div>
          )}
        </div>
      </div>
    </>
  );
}
