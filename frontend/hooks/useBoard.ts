'use client';
import { useCallback } from 'react';
import api from '@/lib/api';
import { useBoardStore } from '@/store/boardStore';
import type { Board, List, Card } from '@/types';
import { downloadBoardPDF } from '@/lib/boardPrint';
import type { BoardExport } from '@/lib/boardPrint';

export const useBoard = () => {
  const store = useBoardStore();

  const fetchBoards = useCallback(async () => {
    const { data } = await api.get('/boards');
    store.setBoards(data.data.boards);
    return data.data.boards as Board[];
  }, []);

  const fetchBoard = useCallback(async (boardId: string) => {
    const { data } = await api.get(`/boards/${boardId}`);
    const board = data.data as Board;
    store.setCurrentBoard(board);
    store.setLists(board.lists || []);
    store.setCards(board.cards || []);
    return board;
  }, []);

  const createBoard = useCallback(async (name: string) => {
    const { data } = await api.post('/boards', { name });
    store.addBoard(data.data.board);
    return data.data.board as Board;
  }, []);

  const updateBoard = useCallback(async (boardId: string, name: string) => {
    const { data } = await api.patch(`/boards/${boardId}`, { name });
    store.updateBoard(boardId, { name });
    return data.data.board as Board;
  }, []);

  const deleteBoard = useCallback(async (boardId: string) => {
    await api.delete(`/boards/${boardId}`);
    store.removeBoard(boardId);
  }, []);

  const createList = useCallback(async (boardId: string, name: string) => {
    const { data } = await api.post(`/boards/${boardId}/lists`, { name });
    return data.data.list as List;
  }, []);

  const updateList = useCallback(async (boardId: string, listId: string, name: string) => {
    const { data } = await api.patch(`/boards/${boardId}/lists/${listId}`, { name });
    return data.data.list as List;
  }, []);

  const deleteList = useCallback(async (boardId: string, listId: string) => {
    await api.delete(`/boards/${boardId}/lists/${listId}`);
  }, []);

  const reorderLists = useCallback(async (boardId: string, orderedIds: string[]) => {
    store.reorderLists(orderedIds); // optimistic
    await api.post(`/boards/${boardId}/lists/reorder`, { orderedIds });
  }, []);

  const createCard = useCallback(async (boardId: string, listId: string, name: string) => {
    const { data } = await api.post(`/boards/${boardId}/cards`, { listId, name });
    return data.data.card as Card;
  }, []);

  const updateCard = useCallback(async (boardId: string, cardId: string, updates: Partial<Card>) => {
    const { data } = await api.patch(`/boards/${boardId}/cards/${cardId}`, updates);
    return data.data.card as Card;
  }, []);

  const deleteCard = useCallback(async (boardId: string, cardId: string) => {
    await api.delete(`/boards/${boardId}/cards/${cardId}`);
  }, []);

  const moveCard = useCallback(async (
    boardId: string,
    cardId: string,
    listId: string,
    position: number,
    fromListId: string
  ) => {
    store.moveCard(cardId, fromListId, listId, position); // optimistic
    await api.patch(`/boards/${boardId}/cards/${cardId}/move`, { listId, position });
  }, []);

  const reorderCards = useCallback(async (boardId: string, listId: string, orderedIds: string[]) => {
    store.reorderCards(listId, orderedIds); // optimistic
    await api.post(`/boards/${boardId}/cards/reorder`, { listId, orderedIds });
  }, []);

  const fetchActivity = useCallback(async (boardId: string) => {
    const { data } = await api.get(`/boards/${boardId}/activity`);
    store.setActivities(data.data.activities);
    return data.data.activities;
  }, []);

  const toggleFavourite = useCallback(async (boardId: string, currentlyFavourite: boolean) => {
    store.toggleFavourite(boardId, !currentlyFavourite); // optimistic
    try {
      await api.post(`/boards/${boardId}/favourite`);
    } catch {
      store.toggleFavourite(boardId, currentlyFavourite); // rollback
    }
  }, []);

  const printBoard = useCallback(async (boardId: string) => {
    const token =
      typeof window !== 'undefined'
        ? (() => {
            try {
              const raw = localStorage.getItem('taskboard-auth');
              if (raw) return JSON.parse(raw).state?.accessToken;
            } catch {}
            return null;
          })()
        : null;

    const res = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'}/api/boards/${boardId}/export?format=json`,
      { headers: token ? { Authorization: `Bearer ${token}` } : {} }
    );
    const data: BoardExport = await res.json();
    await downloadBoardPDF(data);
  }, []);

  const exportBoard = useCallback(async (boardId: string, format: 'csv' | 'json') => {
    const token =
      typeof window !== 'undefined'
        ? (() => {
            try {
              const raw = localStorage.getItem('taskboard-auth');
              if (raw) return JSON.parse(raw).state?.accessToken;
            } catch {}
            return null;
          })()
        : null;

    const res = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'}/api/boards/${boardId}/export?format=${format}`,
      { headers: token ? { Authorization: `Bearer ${token}` } : {} }
    );
    const blob = await res.blob();
    const disposition = res.headers.get('content-disposition') || '';
    const match = disposition.match(/filename="?([^"]+)"?/);
    const filename = match?.[1] || `board_export.${format}`;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  return {
    ...store,
    fetchBoards,
    fetchBoard,
    createBoard,
    updateBoard,
    deleteBoard,
    createList,
    updateList,
    deleteList,
    reorderLists,
    createCard,
    updateCard,
    deleteCard,
    moveCard,
    reorderCards,
    fetchActivity,
    toggleFavourite,
    exportBoard,
    printBoard,
  };
};
