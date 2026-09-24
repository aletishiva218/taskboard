import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '@/store/authStore';

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:5000';

let socket: Socket | null = null;

export const getSocket = (): Socket => {
  if (socket) return socket;

  const authToken = typeof window !== 'undefined'
    ? (useAuthStore.getState().accessToken || '')
    : '';

  socket = io(SOCKET_URL, {
    auth: { token: authToken },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
    timeout: 20000,
  });

  return socket;
};

export const disconnectSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
};

// Called after access token refresh so the socket reconnects with the new token.
// Socket.io reuses the same JS object — updating auth here takes effect on the next connect().
export const updateSocketToken = (newToken: string) => {
  if (socket) {
    (socket as any).auth = { token: newToken };
    if (!socket.connected) {
      socket.connect();
    }
  }
};

export { socket };
