'use client';
import { create } from 'zustand';
import type { Board, List, Card, Activity, ChatMessage } from '@/types';

interface BoardState {
  boards: Board[];
  currentBoard: Board | null;
  lists: List[];
  cards: Record<string, Card[]>; // listId -> cards
  activities: Activity[];
  onlineUsers: Array<{ id: string; name: string; avatarUrl: string | null }>;
  chatMessages: ChatMessage[];
  chatUnreadCount: number;
  typingUsers: Array<{ id: string; name: string }>;

  setBoards: (boards: Board[]) => void;
  addBoard: (board: Board) => void;
  updateBoard: (boardId: string, updates: Partial<Board>) => void;
  removeBoard: (boardId: string) => void;
  toggleFavourite: (boardId: string, isFavourite: boolean) => void;

  setCurrentBoard: (board: Board | null) => void;
  setLists: (lists: List[]) => void;
  setCards: (cards: Card[]) => void;
  setActivities: (activities: Activity[]) => void;

  addList: (list: List) => void;
  updateList: (listId: string, updates: Partial<List>) => void;
  removeList: (listId: string) => void;
  reorderLists: (orderedIds: string[]) => void;

  addCard: (card: Card) => void;
  updateCard: (card: Card) => void;
  removeCard: (cardId: string, listId: string) => void;
  moveCard: (cardId: string, fromListId: string, toListId: string, position: number) => void;
  reorderCards: (listId: string, orderedIds: string[]) => void;

  setOnlineUsers: (users: Array<{ id: string; name: string; avatarUrl: string | null }>) => void;
  addOnlineUser: (user: { id: string; name: string; avatarUrl: string | null }) => void;
  removeOnlineUser: (userId: string) => void;

  addActivity: (activity: Activity) => void;

  setChatMessages: (messages: ChatMessage[]) => void;
  addChatMessage: (message: ChatMessage) => void;
  updateChatMessage: (message: ChatMessage) => void;
  incrementChatUnread: () => void;
  clearChatUnread: () => void;
  setTypingUser: (user: { id: string; name: string }) => void;
  removeTypingUser: (userId: string) => void;
  clearTypingUsers: () => void;

  reset: () => void;
}

const initialState = {
  boards: [],
  currentBoard: null,
  lists: [],
  cards: {},
  activities: [],
  onlineUsers: [],
  chatMessages: [] as ChatMessage[],
  chatUnreadCount: 0,
  typingUsers: [] as Array<{ id: string; name: string }>,
};

export const useBoardStore = create<BoardState>((set, get) => ({
  ...initialState,

  setBoards: (boards) => set({ boards }),
  addBoard: (board) => set((s) => ({ boards: [board, ...s.boards] })),
  updateBoard: (boardId, updates) =>
    set((s) => ({
      boards: s.boards.map((b) => (b.id === boardId ? { ...b, ...updates } : b)),
      currentBoard: s.currentBoard?.id === boardId ? { ...s.currentBoard, ...updates } : s.currentBoard,
    })),
  removeBoard: (boardId) =>
    set((s) => ({ boards: s.boards.filter((b) => b.id !== boardId) })),
  toggleFavourite: (boardId, isFavourite) =>
    set((s) => ({
      boards: s.boards.map((b) => (b.id === boardId ? { ...b, is_favourite: isFavourite } : b)),
      currentBoard:
        s.currentBoard?.id === boardId
          ? { ...s.currentBoard, is_favourite: isFavourite }
          : s.currentBoard,
    })),

  setCurrentBoard: (board) => set({ currentBoard: board }),

  setLists: (lists) => set({ lists }),

  setCards: (cards) => {
    const byList: Record<string, Card[]> = {};
    for (const card of cards) {
      if (!byList[card.list_id]) byList[card.list_id] = [];
      byList[card.list_id].push(card);
    }
    // Sort each list's cards by position
    for (const listId of Object.keys(byList)) {
      byList[listId].sort((a, b) => a.position - b.position);
    }
    set({ cards: byList });
  },

  setActivities: (activities) => set({ activities }),

  addList: (list) => set((s) => ({ lists: [...s.lists, list].sort((a, b) => a.position - b.position) })),

  updateList: (listId, updates) =>
    set((s) => ({ lists: s.lists.map((l) => (l.id === listId ? { ...l, ...updates } : l)) })),

  removeList: (listId) =>
    set((s) => {
      const { [listId]: _, ...rest } = s.cards;
      return { lists: s.lists.filter((l) => l.id !== listId), cards: rest };
    }),

  reorderLists: (orderedIds) =>
    set((s) => ({
      lists: orderedIds
        .map((id, index) => {
          const list = s.lists.find((l) => l.id === id);
          return list ? { ...list, position: (index + 1) * 1000 } : null;
        })
        .filter(Boolean) as List[],
    })),

  addCard: (card) =>
    set((s) => ({
      cards: {
        ...s.cards,
        [card.list_id]: [...(s.cards[card.list_id] || []), card].sort((a, b) => a.position - b.position),
      },
    })),

  updateCard: (card) =>
    set((s) => {
      const updated: Record<string, Card[]> = { ...s.cards };
      for (const listId of Object.keys(updated)) {
        updated[listId] = updated[listId].map((c) => (c.id === card.id ? card : c));
      }
      return { cards: updated };
    }),

  removeCard: (cardId, listId) =>
    set((s) => ({
      cards: {
        ...s.cards,
        [listId]: (s.cards[listId] || []).filter((c) => c.id !== cardId),
      },
    })),

  moveCard: (cardId, fromListId, toListId, position) =>
    set((s) => {
      const fromCards = (s.cards[fromListId] || []).filter((c) => c.id !== cardId);
      const movingCard = (s.cards[fromListId] || []).find((c) => c.id === cardId);
      if (!movingCard) return s;

      const updatedCard = { ...movingCard, list_id: toListId, position };
      const toCards = [...(s.cards[toListId] || []).filter((c) => c.id !== cardId), updatedCard]
        .sort((a, b) => a.position - b.position);

      return {
        cards: {
          ...s.cards,
          [fromListId]: fromCards,
          [toListId]: toCards,
        },
      };
    }),

  reorderCards: (listId, orderedIds) =>
    set((s) => ({
      cards: {
        ...s.cards,
        [listId]: orderedIds
          .map((id, index) => {
            const card = (s.cards[listId] || []).find((c) => c.id === id);
            return card ? { ...card, position: (index + 1) * 1000 } : null;
          })
          .filter(Boolean) as Card[],
      },
    })),

  setOnlineUsers: (users) => set({ onlineUsers: users.filter((u, i, arr) => arr.findIndex((x) => x.id === u.id) === i) }),
  addOnlineUser: (user) =>
    set((s) => {
      if (s.onlineUsers.some((u) => u.id === user.id)) return s;
      return { onlineUsers: [...s.onlineUsers, user] };
    }),
  removeOnlineUser: (userId) =>
    set((s) => ({ onlineUsers: s.onlineUsers.filter((u) => u.id !== userId) })),

  addActivity: (activity) =>
    set((s) => ({ activities: [activity, ...s.activities].slice(0, 50) })),

  setChatMessages: (chatMessages) => set({ chatMessages }),

  addChatMessage: (message) =>
    set((s) => {
      if (s.chatMessages.some((m) => m.id === message.id)) return s;
      return { chatMessages: [...s.chatMessages, message] };
    }),

  updateChatMessage: (message) =>
    set((s) => ({
      chatMessages: s.chatMessages.map((m) => (m.id === message.id ? message : m)),
    })),

  incrementChatUnread: () =>
    set((s) => ({ chatUnreadCount: s.chatUnreadCount + 1 })),

  clearChatUnread: () => set({ chatUnreadCount: 0 }),

  setTypingUser: (user) =>
    set((s) => {
      if (s.typingUsers.some((u) => u.id === user.id)) return s;
      return { typingUsers: [...s.typingUsers, user] };
    }),
  removeTypingUser: (userId) =>
    set((s) => ({ typingUsers: s.typingUsers.filter((u) => u.id !== userId) })),
  clearTypingUsers: () => set({ typingUsers: [] }),

  reset: () => set(initialState),
}));
