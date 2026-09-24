'use client';
import { useBoardStore } from '@/store/boardStore';
import { getInitials } from '@/lib/utils';

export default function LiveAvatars() {
  const onlineUsers = useBoardStore((s) => s.onlineUsers);

  if (onlineUsers.length === 0) return null;

  const visible = onlineUsers.slice(0, 5);
  const overflow = onlineUsers.length - 5;

  return (
    <div className="flex items-center">
      <span className="text-xs text-gray-500 mr-2 font-medium">{onlineUsers.length} online</span>
      <div className="flex -space-x-2">
        {visible.map((user) => (
          <div key={user.id} title={user.name} className="relative">
            {user.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt={user.name}
                width={28}
                height={28}
                className="w-7 h-7 rounded-full border-2 border-white ring-2 ring-green-400 object-cover"
              />
            ) : (
              <div className="w-7 h-7 rounded-full border-2 border-white ring-2 ring-green-400 bg-indigo-500 flex items-center justify-center text-white text-xs font-bold">
                {getInitials(user.name)}
              </div>
            )}
          </div>
        ))}
        {overflow > 0 && (
          <div className="w-7 h-7 rounded-full border-2 border-white bg-gray-200 flex items-center justify-center text-xs font-medium text-gray-600">
            +{overflow}
          </div>
        )}
      </div>
    </div>
  );
}
