'use client';
import { useBoardStore } from '@/store/boardStore';
import { formatRelativeTime, getInitials } from '@/lib/utils';

const ACTION_LABELS: Record<string, string> = {
  board_created: 'created this board',
  board_renamed: 'renamed the board',
  list_created: 'created a list',
  list_renamed: 'renamed a list',
  list_deleted: 'deleted a list',
  card_created: 'created a card',
  card_updated: 'updated a card',
  card_deleted: 'deleted a card',
  card_moved: 'moved a card',
  card_assigned: 'assigned a card',
  member_invited: 'invited a member',
  member_role_changed: 'changed a member role',
};

export default function ActivityFeed() {
  const activities = useBoardStore((s) => s.activities);

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-gray-200">
        <h3 className="font-semibold text-gray-900 text-sm">Activity</h3>
      </div>

      <div className="flex-1 overflow-y-auto">
        {activities.length === 0 ? (
          <div className="px-4 py-8 text-center text-gray-400 text-sm">No activity yet</div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {activities.map((activity) => (
              <li key={activity.id} className="px-4 py-3 flex gap-3">
                <div className="flex-shrink-0">
                  {activity.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={activity.avatar_url} alt={activity.name || ''} className="w-7 h-7 rounded-full" />
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-indigo-500 flex items-center justify-center text-white text-xs font-bold">
                      {activity.name ? getInitials(activity.name) : '?'}
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-700 leading-relaxed">
                    <span className="font-medium">{activity.name || 'Someone'}</span>{' '}
                    {ACTION_LABELS[activity.action] || activity.action}
                    {(activity.metadata as Record<string, string>)?.card_name && (
                      <span className="font-medium"> &ldquo;{(activity.metadata as Record<string, string>).card_name}&rdquo;</span>
                    )}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">{formatRelativeTime(activity.created_at)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
