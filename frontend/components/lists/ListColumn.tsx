'use client';
import { useState } from 'react';
import { Draggable, Droppable } from '@hello-pangea/dnd';
import { useBoardStore } from '@/store/boardStore';
import { useBoard } from '@/hooks/useBoard';
import CardItem from '@/components/cards/CardItem';
import type { List } from '@/types';

interface Props {
  list: List;
  index: number;
  boardId: string;
  onCardClick: (cardId: string) => void;
}

export default function ListColumn({ list, index, boardId, onCardClick }: Props) {
  const cards = useBoardStore((s) => s.cards[list.id] || []);
  const role = useBoardStore((s) => s.currentBoard?.role);
  const isViewer = role === 'viewer';
  const { createCard, updateList, deleteList } = useBoard();
  const [newCardName, setNewCardName] = useState('');
  const [addingCard, setAddingCard] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [listName, setListName] = useState(list.name);
  const [saving, setSaving] = useState(false);

  const handleAddCard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCardName.trim()) return;
    setSaving(true);
    try {
      await createCard(boardId, list.id, newCardName.trim());
      setNewCardName('');
      setAddingCard(false);
    } finally {
      setSaving(false);
    }
  };

  const handleRenameList = async () => {
    if (listName.trim() === list.name || !listName.trim()) {
      setEditingName(false);
      setListName(list.name);
      return;
    }
    try {
      await updateList(boardId, list.id, listName.trim());
    } catch {
      setListName(list.name);
    }
    setEditingName(false);
  };

  const handleDeleteList = async () => {
    if (!confirm(`Delete list "${list.name}" and all its cards?`)) return;
    await deleteList(boardId, list.id);
  };

  return (
    <Draggable draggableId={list.id} index={index} isDragDisabled={isViewer}>
      {(provided) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          className="w-[272px] sm:w-72 flex-shrink-0 flex flex-col bg-gray-100 rounded-xl max-h-full"
        >
          {/* List header */}
          <div
            {...provided.dragHandleProps}
            className={`flex items-center justify-between px-3 py-2.5 ${isViewer ? 'cursor-default' : 'cursor-grab active:cursor-grabbing'}`}
          >
            {editingName ? (
              <input
                autoFocus
                value={listName}
                onChange={(e) => setListName(e.target.value)}
                onBlur={handleRenameList}
                onKeyDown={(e) => { if (e.key === 'Enter') handleRenameList(); if (e.key === 'Escape') { setListName(list.name); setEditingName(false); } }}
                className="flex-1 text-sm font-semibold bg-white border border-indigo-400 rounded px-2 py-0.5 outline-none"
              />
            ) : (
              <h3
                className="flex-1 text-sm font-semibold text-gray-800 truncate"
                onDoubleClick={isViewer ? undefined : () => setEditingName(true)}
              >
                {list.name}
              </h3>
            )}
            <div className="flex items-center gap-1 ml-2">
              <span className="text-xs text-gray-500 bg-gray-200 rounded-full px-2 py-0.5">{cards.length}</span>
              {!isViewer && (
                <button
                  onClick={handleDeleteList}
                  className="p-1 rounded hover:bg-gray-200 text-gray-400 hover:text-red-500 transition"
                  title="Delete list"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          </div>

          {/* Cards */}
          <Droppable droppableId={list.id} type="CARD">
            {(drop, snapshot) => (
              <div
                ref={drop.innerRef}
                {...drop.droppableProps}
                className={`flex-1 overflow-y-auto px-2 pb-2 min-h-[8px] space-y-2 ${snapshot.isDraggingOver ? 'bg-indigo-50 rounded-lg' : ''}`}
              >
                {cards.map((card, idx) => (
                  <CardItem key={card.id} card={card} index={idx} onClick={() => onCardClick(card.id)} />
                ))}
                {drop.placeholder}
              </div>
            )}
          </Droppable>

          {/* Add card */}
          {!isViewer && <div className="px-2 pb-2">
            {addingCard ? (
              <form onSubmit={handleAddCard}>
                <textarea
                  autoFocus
                  value={newCardName}
                  onChange={(e) => setNewCardName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Escape') { setAddingCard(false); setNewCardName(''); } }}
                  placeholder="Card title..."
                  rows={2}
                  className="w-full text-sm px-3 py-2 border border-gray-300 rounded-lg resize-none outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <div className="flex gap-2 mt-1.5">
                  <button
                    type="submit"
                    disabled={saving || !newCardName.trim()}
                    className="flex-1 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-medium hover:bg-indigo-700 transition disabled:opacity-60"
                  >
                    Add
                  </button>
                  <button
                    type="button"
                    onClick={() => { setAddingCard(false); setNewCardName(''); }}
                    className="px-2 py-1.5 text-gray-500 hover:text-gray-700"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </form>
            ) : (
              <button
                onClick={() => setAddingCard(true)}
                className="w-full flex items-center gap-2 px-3 py-2 text-gray-500 hover:text-gray-700 hover:bg-gray-200 rounded-lg text-sm transition"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add a card
              </button>
            )}
          </div>}
        </div>
      )}
    </Draggable>
  );
}
