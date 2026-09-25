'use client';
import { useState } from 'react';
import Link from 'next/link';
import type { Board } from '@/types';

const BOARD_COLORS = [
  'from-indigo-500 to-indigo-600',
  'from-purple-500 to-purple-600',
  'from-blue-500 to-blue-600',
  'from-emerald-500 to-emerald-600',
  'from-orange-500 to-orange-600',
  'from-rose-500 to-rose-600',
];

const getBoardColor = (id: string) => {
  const idx = id.charCodeAt(0) % BOARD_COLORS.length;
  return BOARD_COLORS[idx];
};

interface Props {
  board: Board;
  onToggleFavourite?: (boardId: string, current: boolean) => void;
  onDelete?: (boardId: string) => void;
}

export default function BoardCard({ board, onToggleFavourite, onDelete }: Props) {
  const color = getBoardColor(board.id);
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <>
      <div className="h-32 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow group relative">
        <div className={`absolute inset-0 bg-gradient-to-br ${color}`} />
        <Link href={`/board/${board.id}`} className="absolute inset-0 z-0" aria-label={board.name} />
        <div className="relative z-10 h-full flex flex-col justify-between p-4 pointer-events-none">
          <div className="flex items-start justify-between">
            <h3 className="font-bold text-white text-base leading-tight line-clamp-2 group-hover:opacity-90 pr-14">
              {board.name}
            </h3>
            <div className="absolute top-2 right-2 flex items-center gap-1 pointer-events-auto">
              {/* Favourite */}
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onToggleFavourite?.(board.id, !!board.is_favourite);
                }}
                className="text-white/70 hover:text-yellow-300 transition p-1"
                title={board.is_favourite ? 'Remove from favourites' : 'Add to favourites'}
              >
                <svg
                  className={`w-4 h-4 ${board.is_favourite ? 'fill-yellow-300 text-yellow-300' : 'fill-none'}`}
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"
                  />
                </svg>
              </button>

              {/* Delete icon — only for owners, visible on hover */}
              {board.role === 'owner' && (
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setConfirmDelete(true);
                  }}
                  className="text-white/0 group-hover:text-white/60 hover:!text-red-300 transition p-1"
                  title="Delete board"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              )}
            </div>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-white/70 text-xs">
              {board.member_count} member{board.member_count !== 1 ? 's' : ''}
            </span>
            <span className="text-white/70 text-xs capitalize">{board.role}</span>
          </div>
        </div>
      </div>

      {/* Delete confirmation modal */}
      {confirmDelete && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => setConfirmDelete(false)}
        >
          <div
            className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Delete board?</h3>
            <p className="text-sm text-gray-500 mb-6">
              <span className="font-medium text-gray-700">{board.name}</span> and all its lists, cards, and data will be permanently deleted. This cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setConfirmDelete(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setConfirmDelete(false);
                  onDelete?.(board.id);
                }}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
