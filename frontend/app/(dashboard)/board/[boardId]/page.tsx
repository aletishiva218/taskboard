'use client';
import { useEffect, useState, useRef } from 'react';
import { useParams } from 'next/navigation';
import { useBoard } from '@/hooks/useBoard';
import { useSocket } from '@/hooks/useSocket';
import { useDragAndDrop } from '@/hooks/useDragAndDrop';
import { DragDropContext, Droppable } from '@hello-pangea/dnd';
import ListColumn from '@/components/lists/ListColumn';
import CreateListForm from '@/components/lists/CreateListForm';
import LiveAvatars from '@/components/layout/LiveAvatars';
import ActivityFeed from '@/components/activity/ActivityFeed';
import CardDetailModal from '@/components/cards/CardDetailModal';
import ShareBoardModal from '@/components/board/ShareBoardModal';
import BoardChat from '@/components/board/BoardChat';
import { useBoardStore } from '@/store/boardStore';

export default function BoardPage() {
  const { boardId } = useParams<{ boardId: string }>();
  const { currentBoard, lists, fetchBoard, fetchActivity, toggleFavourite, exportBoard, printBoard } = useBoard();
  const { onDragEnd } = useDragAndDrop(boardId);
  const [loading, setLoading] = useState(true);
  const [showActivity, setShowActivity] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [showShare, setShowShare] = useState(false);
  const chatUnreadCount = useBoardStore((s) => s.chatUnreadCount);
  const clearChatUnread = useBoardStore((s) => s.clearChatUnread);
  const [showExport, setShowExport] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [printing, setPrinting] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);

  useSocket(boardId);

  useEffect(() => {
    Promise.all([fetchBoard(boardId), fetchActivity(boardId)])
      .finally(() => setLoading(false));
  }, [boardId]);

  // Close export dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) {
        setShowExport(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleExport = async (format: 'csv' | 'json') => {
    setShowExport(false);
    setExporting(true);
    try {
      await exportBoard(boardId, format);
    } finally {
      setExporting(false);
    }
  };

  const handlePrint = async () => {
    setPrinting(true);
    try {
      await printBoard(boardId);
    } finally {
      setPrinting(false);
    }
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-gray-500 text-sm">Loading board...</p>
        </div>
      </div>
    );
  }

  if (!currentBoard) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-gray-500">Board not found</p>
      </div>
    );
  }

  const isFavourite = !!currentBoard.is_favourite;

  return (
    <>
      <div className="h-full flex flex-col">
        {/* Board header */}
        <div className="flex items-center justify-between px-3 sm:px-6 py-2.5 sm:py-3 bg-white border-b border-gray-200 no-print gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <h1 className="font-bold text-base sm:text-lg text-gray-900 truncate max-w-[140px] sm:max-w-xs">{currentBoard.name}</h1>
            <button
              onClick={() => toggleFavourite(boardId, isFavourite)}
              title={isFavourite ? 'Remove from favourites' : 'Add to favourites'}
              className="text-gray-400 hover:text-yellow-400 transition shrink-0"
            >
              <svg
                className={`w-5 h-5 ${isFavourite ? 'fill-yellow-400 text-yellow-400' : 'fill-none'}`}
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
              </svg>
            </button>
          </div>

          <div className="flex items-center gap-1 sm:gap-2 shrink-0">
            <LiveAvatars />

            {/* Share — icon-only on mobile */}
            <button
              onClick={() => setShowShare(true)}
              className="flex items-center gap-1.5 p-2 sm:px-3 sm:py-1.5 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 transition"
              title="Share"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
              </svg>
              <span className="hidden sm:inline">Share</span>
            </button>

            {/* Export dropdown */}
            <div className="relative" ref={exportRef}>
              <button
                onClick={() => setShowExport((v) => !v)}
                disabled={exporting}
                className="flex items-center gap-1.5 p-2 sm:px-3 sm:py-1.5 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 transition disabled:opacity-50"
                title="Export"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                <span className="hidden sm:inline">{exporting ? 'Exporting...' : 'Export'}</span>
              </button>
              {showExport && (
                <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg py-1 w-40 z-20 animate-scale-in">
                  <button
                    onClick={() => handleExport('csv')}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition flex items-center gap-2"
                  >
                    <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Export as CSV
                  </button>
                  <button
                    onClick={() => handleExport('json')}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition flex items-center gap-2"
                  >
                    <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                    </svg>
                    Export as JSON
                  </button>
                </div>
              )}
            </div>

            {/* Generate PDF — icon-only on mobile */}
            <button
              onClick={handlePrint}
              disabled={printing}
              className="flex items-center gap-1.5 p-2 sm:px-3 sm:py-1.5 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 transition disabled:opacity-50"
              title="Generate PDF"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
              </svg>
              <span className="hidden sm:inline">{printing ? 'Generating...' : 'Generate PDF'}</span>
            </button>

            {/* Activity toggle */}
            <button
              onClick={() => setShowActivity((v) => !v)}
              className={`flex items-center gap-1.5 p-2 sm:px-3 sm:py-1.5 rounded-lg text-sm font-medium transition ${showActivity ? 'bg-indigo-100 text-indigo-700' : 'text-gray-600 hover:bg-gray-100'}`}
              title="Activity"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
              </svg>
              <span className="hidden sm:inline">Activity</span>
            </button>

            {/* Chat toggle */}
            <button
              onClick={() => { setShowChat((v) => !v); clearChatUnread(); }}
              className={`relative flex items-center gap-1.5 p-2 sm:px-3 sm:py-1.5 rounded-lg text-sm font-medium transition ${showChat ? 'bg-indigo-100 text-indigo-700' : 'text-gray-600 hover:bg-gray-100'}`}
              title="Chat"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              <span className="hidden sm:inline">Chat</span>
              {chatUnreadCount > 0 && !showChat && (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
                  {chatUnreadCount > 99 ? '99+' : chatUnreadCount}
                </span>
              )}
            </button>
          </div>
        </div>

        <div className="flex flex-1 overflow-hidden relative">
          {/* Lists area */}
          <div className="flex-1 overflow-x-auto overflow-y-hidden p-3 sm:p-4">
            <DragDropContext onDragEnd={onDragEnd}>
              <Droppable droppableId="board" type="LIST" direction="horizontal">
                {(provided) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className="flex gap-3 h-full items-start board-lists-container"
                  >
                    {lists.map((list, index) => (
                      <ListColumn
                        key={list.id}
                        list={list}
                        index={index}
                        boardId={boardId}
                        onCardClick={setSelectedCardId}
                      />
                    ))}
                    {provided.placeholder}
                    <div className="no-print">
                      <CreateListForm boardId={boardId} />
                    </div>
                  </div>
                )}
              </Droppable>
            </DragDropContext>
          </div>

          {/* Activity — slide-over on mobile, static panel on desktop */}
          {showActivity && (
            <>
              <div
                className="fixed inset-0 bg-black/30 z-20 sm:hidden animate-fade-in no-print"
                onClick={() => setShowActivity(false)}
              />
              <div className="fixed inset-y-0 right-0 z-30 w-[min(320px,90vw)] sm:static sm:z-auto sm:w-80 border-l border-gray-200 bg-white overflow-hidden flex-shrink-0 no-print animate-slide-in-right sm:animate-none">
                <ActivityFeed />
              </div>
            </>
          )}

          {/* Chat — slide-over on mobile, static panel on desktop */}
          {showChat && (
            <>
              <div
                className="fixed inset-0 bg-black/30 z-20 sm:hidden animate-fade-in no-print"
                onClick={() => { setShowChat(false); }}
              />
              <div className="fixed inset-y-0 right-0 z-30 w-[min(320px,90vw)] sm:static sm:z-auto sm:w-80 border-l border-gray-200 overflow-hidden flex-shrink-0 no-print animate-slide-in-right sm:animate-none">
                <BoardChat boardId={boardId} onClose={() => setShowChat(false)} />
              </div>
            </>
          )}
        </div>

        {selectedCardId && (
          <CardDetailModal
            cardId={selectedCardId}
            boardId={boardId}
            onClose={() => setSelectedCardId(null)}
          />
        )}
      </div>

      {showShare && (
        <ShareBoardModal
          boardId={boardId}
          boardName={currentBoard.name}
          currentRole={currentBoard.role || 'viewer'}
          onClose={() => setShowShare(false)}
        />
      )}
    </>
  );
}
