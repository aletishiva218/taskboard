'use client';
import { useEffect, useState } from 'react';
import { useBoard } from '@/hooks/useBoard';
import BoardCard from '@/components/board/BoardCard';
import CreateBoardModal from '@/components/board/CreateBoardModal';
import type { Board } from '@/types';

export default function DashboardPage() {
  const { boards, fetchBoards, toggleFavourite, deleteBoard } = useBoard();
  const [showCreate, setShowCreate] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchBoards()
      .catch(() => setError('Failed to load boards'))
      .finally(() => setLoading(false));
  }, []);

  const favourites = boards.filter((b: Board) => b.is_favourite);
  const allBoards = boards;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Boards</h1>
          <p className="text-gray-500 text-sm mt-1">{boards.length} board{boards.length !== 1 ? 's' : ''}</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition text-sm"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Board
        </button>
      </div>

      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-32 bg-gray-200 rounded-xl animate-pulse" />
          ))}
        </div>
      )}

      {!loading && error && (
        <div className="text-center py-12 text-red-600">{error}</div>
      )}

      {!loading && !error && boards.length === 0 && (
        <div className="text-center py-16">
          <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No boards yet</h3>
          <p className="text-gray-500 mb-4">Create your first board to get started</p>
          <button
            onClick={() => setShowCreate(true)}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition text-sm"
          >
            Create a board
          </button>
        </div>
      )}

      {!loading && !error && boards.length > 0 && (
        <>
          {/* Favourites section */}
          {favourites.length > 0 && (
            <div className="mb-8">
              <div className="flex items-center gap-2 mb-3">
                <svg className="w-4 h-4 text-yellow-500 fill-yellow-400" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                </svg>
                <h2 className="text-sm font-semibold text-gray-700">Favourites</h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {favourites.map((board: Board) => (
                  <BoardCard key={board.id} board={board} onToggleFavourite={toggleFavourite} onDelete={deleteBoard} />
                ))}
              </div>
            </div>
          )}

          {/* All boards */}
          <div>
            {favourites.length > 0 && (
              <h2 className="text-sm font-semibold text-gray-700 mb-3">All Boards</h2>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {allBoards.map((board: Board) => (
                <BoardCard key={board.id} board={board} onToggleFavourite={toggleFavourite} onDelete={deleteBoard} />
              ))}
              <button
                onClick={() => setShowCreate(true)}
                className="h-32 border-2 border-dashed border-gray-300 rounded-xl flex flex-col items-center justify-center text-gray-400 hover:border-indigo-400 hover:text-indigo-500 transition group"
              >
                <svg className="w-6 h-6 mb-2 group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                <span className="text-sm font-medium">New Board</span>
              </button>
            </div>
          </div>
        </>
      )}

      {showCreate && <CreateBoardModal onClose={() => setShowCreate(false)} />}
    </div>
  );
}
