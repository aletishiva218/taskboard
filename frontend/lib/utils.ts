import type { CardLabel } from '@/types';

export const formatRelativeTime = (dateString: string): string => {
  const date = new Date(dateString);
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return date.toLocaleDateString();
};

export const getLabelStyles = (color: string) => {
  const map: Record<string, { bg: string; text: string }> = {
    red: { bg: 'bg-red-100', text: 'text-red-700' },
    orange: { bg: 'bg-orange-100', text: 'text-orange-700' },
    yellow: { bg: 'bg-yellow-100', text: 'text-yellow-700' },
    green: { bg: 'bg-green-100', text: 'text-green-700' },
    blue: { bg: 'bg-blue-100', text: 'text-blue-700' },
    purple: { bg: 'bg-purple-100', text: 'text-purple-700' },
    pink: { bg: 'bg-pink-100', text: 'text-pink-700' },
  };
  return map[color] || { bg: 'bg-gray-100', text: 'text-gray-700' };
};

export const getInitials = (name: string): string => {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
};

export const isDueSoon = (dueDate: string | null): boolean => {
  if (!dueDate) return false;
  const due = new Date(dueDate);
  const now = new Date();
  const diffMs = due.getTime() - now.getTime();
  return diffMs > 0 && diffMs < 24 * 60 * 60 * 1000;
};

export const isOverdue = (dueDate: string | null): boolean => {
  if (!dueDate) return false;
  return new Date(dueDate) < new Date();
};

export const cn = (...classes: (string | undefined | null | false)[]): string => {
  return classes.filter(Boolean).join(' ');
};
