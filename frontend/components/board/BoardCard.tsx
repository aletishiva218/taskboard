'use client';
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
}

export default function BoardCard({ board, onToggleFavourite }: Props) {
  const color = getBoardColor(board.id);

  return (
    <div className="h-32 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow group relative">
      <div className={`absolute inset-0 bg-gradient-to-br ${color}`} />
      <Link href={`/board/${board.id}`} className="absolute inset-0 z-0" aria-label={board.name} />
      <div className="relative z-10 h-full flex flex-col justify-between p-4 pointer-events-none">
        <div className="flex items-start justify-between">
          <h3 className="font-bold text-white text-base leading-tight line-clamp-2 group-hover:opacity-90 pr-6">
            {board.name}
          </h3>
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onToggleFavourite?.(board.id, !!board.is_favourite);
            }}
            className="pointer-events-auto absolute top-3 right-3 text-white/70 hover:text-yellow-300 transition"
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
        </div>
        <div className="flex items-center justify-between">
          <span className="text-white/70 text-xs">
            {board.member_count} member{board.member_count !== 1 ? 's' : ''}
          </span>
          <span className="text-white/70 text-xs capitalize">{board.role}</span>
        </div>
      </div>
    </div>
  );
}
