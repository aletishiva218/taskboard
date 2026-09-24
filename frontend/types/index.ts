export interface ChatAttachment {
  url: string;
  name: string;
  type: string;
  size: number;
}

export interface ChatMessage {
  id: string;
  boardId: string;
  content: string | null;
  createdAt: string;
  editedAt?: string | null;
  user: {
    id: string;
    name: string;
    avatarUrl: string | null;
  };
  attachment?: ChatAttachment | null;
}

export interface User {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  googleId: string | null;
  emailNotifications: boolean;
  notificationPreferences: NotificationPreferences;
  hasPassword: boolean;
}

export interface NotificationPreferences {
  board_invite: boolean;
  card_assigned: boolean;
  due_date: boolean;
  activity: boolean;
  role_changed: boolean;
}

export interface BoardMember {
  user_id: string;
  role: 'owner' | 'editor' | 'viewer';
  name: string;
  email: string;
  avatar_url: string | null;
}

export interface Board {
  id: string;
  name: string;
  owner_id: string;
  created_at: string;
  updated_at: string;
  role?: 'owner' | 'editor' | 'viewer';
  member_count?: number;
  is_favourite?: boolean;
  members?: BoardMember[];
  lists?: List[];
  cards?: Card[];
}

export interface List {
  id: string;
  board_id: string;
  name: string;
  position: number;
  created_at: string;
}

export interface CardLabel {
  id: string;
  color: string;
  text: string | null;
}

export interface CardAssignee {
  id: string;
  name: string;
  avatarUrl: string | null;
}

export interface Card {
  id: string;
  list_id: string;
  board_id: string;
  name: string;
  description: string | null;
  due_date: string | null;
  position: number;
  created_at: string;
  labels: CardLabel[];
  assignees: CardAssignee[];
}

export interface Comment {
  id: string;
  card_id: string;
  user_id: string;
  text: string;
  created_at: string;
  user_name: string;
  avatar_url: string | null;
}

export interface Attachment {
  id: string;
  card_id: string;
  user_id: string;
  filename: string;
  original_name: string;
  mimetype: string;
  size: number;
  created_at: string;
  user_name: string;
}

export interface Notification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  message: string;
  data: Record<string, unknown>;
  is_read: boolean;
  created_at: string;
}

export interface Activity {
  id: string;
  action: string;
  metadata: Record<string, unknown>;
  created_at: string;
  user_id: string | null;
  name: string | null;
  avatar_url: string | null;
}

export interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data?: T;
}

export type BoardRole = 'owner' | 'editor' | 'viewer';

export const LABEL_COLORS = [
  { value: 'red', bg: 'bg-red-100', text: 'text-red-700', border: 'border-red-200' },
  { value: 'orange', bg: 'bg-orange-100', text: 'text-orange-700', border: 'border-orange-200' },
  { value: 'yellow', bg: 'bg-yellow-100', text: 'text-yellow-700', border: 'border-yellow-200' },
  { value: 'green', bg: 'bg-green-100', text: 'text-green-700', border: 'border-green-200' },
  { value: 'blue', bg: 'bg-blue-100', text: 'text-blue-700', border: 'border-blue-200' },
  { value: 'purple', bg: 'bg-purple-100', text: 'text-purple-700', border: 'border-purple-200' },
  { value: 'pink', bg: 'bg-pink-100', text: 'text-pink-700', border: 'border-pink-200' },
] as const;
