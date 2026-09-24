'use client';
import { Draggable } from '@hello-pangea/dnd';
import type { Card } from '@/types';
import { getLabelStyles, isOverdue, isDueSoon, getInitials } from '@/lib/utils';
import { useBoardStore } from '@/store/boardStore';

interface Props {
  card: Card;
  index: number;
  onClick: () => void;
}

export default function CardItem({ card, index, onClick }: Props) {
  const isViewer = useBoardStore((s) => s.currentBoard?.role) === 'viewer';
  const due = card.due_date ? new Date(card.due_date) : null;
  const overdue = isOverdue(card.due_date);
  const dueSoon = isDueSoon(card.due_date);

  return (
    <Draggable draggableId={card.id} index={index} isDragDisabled={isViewer}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          onClick={onClick}
          className={`bg-white rounded-lg p-3 shadow-sm border border-gray-200 cursor-pointer hover:shadow-md transition-shadow group ${snapshot.isDragging ? 'shadow-lg rotate-1 ring-2 ring-indigo-400' : ''}`}
        >
          {/* Labels */}
          {card.labels.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-2">
              {card.labels.map((label) => {
                const styles = getLabelStyles(label.color);
                return (
                  <span
                    key={label.id}
                    className={`text-xs px-2 py-0.5 rounded-full font-medium ${styles.bg} ${styles.text}`}
                  >
                    {label.text || label.color}
                  </span>
                );
              })}
            </div>
          )}

          {/* Card name */}
          <p className="text-sm font-medium text-gray-800 line-clamp-2 mb-2">{card.name}</p>

          {/* Footer row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {/* Due date badge */}
              {due && (
                <span
                  className={`text-xs px-1.5 py-0.5 rounded font-medium flex items-center gap-1 ${
                    overdue ? 'bg-red-100 text-red-700' : dueSoon ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-500'
                  }`}
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  {due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
              )}

              {/* Description indicator */}
              {card.description && (
                <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
                </svg>
              )}
            </div>

            {/* Assignees */}
            {card.assignees.length > 0 && (
              <div className="flex -space-x-1.5">
                {card.assignees.slice(0, 3).map((a) => (
                  a.avatarUrl ? (
                    <img key={a.id} src={a.avatarUrl} alt={a.name} width={20} height={20} className="w-5 h-5 rounded-full border border-white object-cover" />
                  ) : (
                    <div
                      key={a.id}
                      title={a.name}
                      className="w-5 h-5 rounded-full border border-white bg-indigo-500 flex items-center justify-center text-white text-xs font-bold"
                    >
                      {getInitials(a.name).charAt(0)}
                    </div>
                  )
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </Draggable>
  );
}
