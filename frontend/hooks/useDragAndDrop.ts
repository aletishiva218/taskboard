'use client';
import { useCallback } from 'react';
import type { DropResult } from '@hello-pangea/dnd';
import { useBoard } from './useBoard';

export const useDragAndDrop = (boardId: string) => {
  const { lists, cards, reorderLists, moveCard, reorderCards } = useBoard();

  const onDragEnd = useCallback(
    async (result: DropResult) => {
      const { source, destination, type } = result;

      if (!destination) return;
      if (source.droppableId === destination.droppableId && source.index === destination.index) return;

      if (type === 'LIST') {
        const orderedIds = Array.from(lists.map((l) => l.id));
        const [removed] = orderedIds.splice(source.index, 1);
        orderedIds.splice(destination.index, 0, removed);
        await reorderLists(boardId, orderedIds);
        return;
      }

      if (type === 'CARD') {
        const sourceListId = source.droppableId;
        const destListId = destination.droppableId;
        const sourceCards = [...(cards[sourceListId] || [])];
        const destCards = sourceListId === destListId ? sourceCards : [...(cards[destListId] || [])];

        const [movedCard] = sourceCards.splice(source.index, 1);

        if (sourceListId === destListId) {
          sourceCards.splice(destination.index, 0, movedCard);
          const orderedIds = sourceCards.map((c) => c.id);
          await reorderCards(boardId, sourceListId, orderedIds);
        } else {
          destCards.splice(destination.index, 0, movedCard);

          // Calculate position between surrounding cards
          const prev = destCards[destination.index - 1];
          const next = destCards[destination.index + 1];
          const prevPos = prev?.position ?? 0;
          const nextPos = next?.position ?? (prevPos + 2000);
          const position = (prevPos + nextPos) / 2;

          await moveCard(boardId, movedCard.id, destListId, position, sourceListId);
        }
      }
    },
    [boardId, lists, cards, reorderLists, moveCard, reorderCards]
  );

  return { onDragEnd };
};
