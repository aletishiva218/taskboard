'use client';
import { useEffect, useRef } from 'react';
import { getSocket, disconnectSocket } from '@/lib/socket';
import { useBoardStore } from '@/store/boardStore';
import { useAuthStore } from '@/store/authStore';
import type { Socket } from 'socket.io-client';
import type { List, Card, Activity, BoardRole, ChatMessage } from '@/types';

export const useSocket = (boardId: string | null) => {
  const socketRef = useRef<Socket | null>(null);
  const { addList, updateList, removeList, reorderLists, addCard, updateCard, removeCard,
    moveCard, reorderCards, setOnlineUsers, addOnlineUser, removeOnlineUser, updateBoard,
    addChatMessage, updateChatMessage, incrementChatUnread, setTypingUser, removeTypingUser, clearTypingUsers } = useBoardStore();

  useEffect(() => {
    if (!boardId) return;

    const socket = getSocket();
    socketRef.current = socket;

    // Emit board:join on every successful connect so it always fires — even after a
    // token-expiry disconnect where the send buffer was cleared before reconnection.
    const joinBoard = () => socket.emit('board:join', { boardId });
    socket.on('connect', joinBoard);
    if (socket.connected) joinBoard();

    socket.on('board:online_users', ({ users }: { users: Array<{ id: string; name: string; avatarUrl: string | null }> }) => {
      setOnlineUsers(users);
    });

    socket.on('user:joined', ({ user }: { user: { id: string; name: string; avatarUrl: string | null } }) => {
      addOnlineUser(user);
    });

    socket.on('user:left', ({ userId }: { userId: string }) => {
      removeOnlineUser(userId);
    });

    socket.on('list:created', ({ list }: { list: List }) => {
      addList(list);
    });

    socket.on('list:updated', ({ list }: { list: List }) => {
      updateList(list.id, list);
    });

    socket.on('list:deleted', ({ listId }: { listId: string }) => {
      removeList(listId);
    });

    socket.on('lists:reordered', ({ orderedIds }: { orderedIds: string[] }) => {
      reorderLists(orderedIds);
    });

    socket.on('card:created', ({ card }: { card: Card }) => {
      addCard(card);
    });

    socket.on('card:updated', ({ card }: { card: Card }) => {
      updateCard(card);
    });

    socket.on('card:deleted', ({ cardId, listId }: { cardId: string; listId: string }) => {
      removeCard(cardId, listId);
    });

    socket.on('card:moved', ({ card, oldListId, newListId, position }: {
      card: Card; oldListId: string; newListId: string; position: number
    }) => {
      moveCard(card.id, oldListId, newListId, position);
    });

    socket.on('cards:reordered', ({ listId, orderedIds }: { listId: string; orderedIds: string[] }) => {
      reorderCards(listId, orderedIds);
    });

    socket.on('member:role_updated', ({ boardId: bid, role }: { boardId: string; role: BoardRole }) => {
      if (bid === boardId) updateBoard(boardId, { role });
    });

    socket.on('chat:message', ({ message }: { message: ChatMessage }) => {
      addChatMessage(message);
      const currentUserId = useAuthStore.getState().user?.id;
      if (message.user.id !== currentUserId) {
        incrementChatUnread();
      }
    });

    socket.on('chat:message_updated', ({ message }: { message: ChatMessage }) => {
      updateChatMessage(message);
    });

    socket.on('chat:typing', ({ userId, name }: { userId: string; name: string }) => {
      setTypingUser({ id: userId, name });
    });

    socket.on('chat:stop_typing', ({ userId }: { userId: string }) => {
      removeTypingUser(userId);
    });

    return () => {
      socket.emit('board:leave', { boardId });
      socket.off('connect', joinBoard);
      socket.off('board:online_users');
      socket.off('user:joined');
      socket.off('user:left');
      socket.off('list:created');
      socket.off('list:updated');
      socket.off('list:deleted');
      socket.off('lists:reordered');
      socket.off('card:created');
      socket.off('card:updated');
      socket.off('card:deleted');
      socket.off('card:moved');
      socket.off('cards:reordered');
      socket.off('member:role_updated');
      socket.off('chat:message');
      socket.off('chat:message_updated');
      socket.off('chat:typing');
      socket.off('chat:stop_typing');
      clearTypingUsers();
      setOnlineUsers([]);
    };
  }, [boardId]);

  return socketRef.current;
};
