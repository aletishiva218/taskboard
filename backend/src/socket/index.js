const { Server } = require('socket.io');
const { createAdapter } = require('@socket.io/redis-adapter');
const { pubClient, subClient } = require('../config/redis');
const { verifyAccessToken } = require('../utils/jwt');
const { query } = require('../config/db');
const logger = require('../utils/logger');

let io;

const initSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: process.env.CLIENT_URL || 'http://localhost:3000',
      credentials: true,
      methods: ['GET', 'POST'],
    },
    transports: ['websocket', 'polling'],
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  // Redis adapter for horizontal scaling
  io.adapter(createAdapter(pubClient, subClient));

  // Auth middleware — verify JWT on connection
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.split(' ')[1];
      if (!token) {
        return next(new Error('Authentication required'));
      }

      const payload = verifyAccessToken(token);
      const result = await query(
        'SELECT id, name, email, avatar_url FROM users WHERE id = $1',
        [payload.sub]
      );

      if (result.rows.length === 0) {
        return next(new Error('User not found'));
      }

      socket.user = result.rows[0];
      next();
    } catch (err) {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    const user = socket.user;
    logger.info('Socket connected', { socketId: socket.id, userId: user.id });

    // Join per-user room for personal notifications
    socket.join(`user:${user.id}`);

    // Join a board room
    socket.on('board:join', async ({ boardId }) => {
      try {
        // Verify user has access to this board
        const access = await query(
          'SELECT role FROM board_members WHERE board_id = $1 AND user_id = $2',
          [boardId, user.id]
        );

        if (access.rows.length === 0) {
          socket.emit('error', { message: 'Access denied to this board' });
          return;
        }

        socket.join(`board:${boardId}`);
        socket.currentBoardId = boardId;

        // Fetch all sockets now in the room (includes this one)
        const roomSockets = await io.in(`board:${boardId}`).fetchSockets();

        // Only tell others this user joined if they have no OTHER socket already in the room.
        // On a refresh the old socket may still be alive, so we'd be duplicating presence.
        const alreadyPresent = roomSockets.some(
          (s) => s.id !== socket.id && s.user?.id === user.id
        );
        if (!alreadyPresent) {
          socket.to(`board:${boardId}`).emit('user:joined', {
            user: { id: user.id, name: user.name, avatarUrl: user.avatar_url },
            boardId,
          });
        }

        // Build deduplicated online-users list (one entry per user ID)
        const seen = new Set();
        const onlineUsers = roomSockets
          .filter((s) => {
            if (!s.user?.id || seen.has(s.user.id)) return false;
            seen.add(s.user.id);
            return true;
          })
          .map((s) => ({
            id: s.user.id,
            name: s.user.name,
            avatarUrl: s.user.avatar_url,
          }));

        socket.emit('board:online_users', { boardId, users: onlineUsers });

        logger.debug('User joined board', { userId: user.id, boardId });
      } catch (err) {
        logger.error('Error joining board', { error: err.message, userId: user.id, boardId });
        socket.emit('error', { message: 'Failed to join board' });
      }
    });

    // Leave a board room
    socket.on('board:leave', async ({ boardId }) => {
      socket.leave(`board:${boardId}`);
      socket.currentBoardId = null;
      // Only tell others the user left if they have no other socket still in the room
      const roomSockets = await io.in(`board:${boardId}`).fetchSockets();
      const stillPresent = roomSockets.some(
        (s) => s.id !== socket.id && s.user?.id === user.id
      );
      if (!stillPresent) {
        socket.to(`board:${boardId}`).emit('user:left', { userId: user.id, boardId });
      }
    });

    // Cursor position (optional UX enhancement)
    socket.on('cursor:move', ({ boardId, position }) => {
      socket.to(`board:${boardId}`).emit('cursor:moved', {
        userId: user.id,
        position,
      });
    });

    // Chat typing indicators
    socket.on('chat:typing', ({ boardId }) => {
      socket.to(`board:${boardId}`).emit('chat:typing', {
        userId: user.id,
        name: user.name,
      });
    });

    socket.on('chat:stop_typing', ({ boardId }) => {
      socket.to(`board:${boardId}`).emit('chat:stop_typing', { userId: user.id });
    });

    socket.on('disconnect', async (reason) => {
      const boardId = socket.currentBoardId;
      if (boardId) {
        // The disconnected socket is already removed from rooms by the time this fires.
        // Only broadcast user:left if the user has no other socket still in the room.
        try {
          const roomSockets = await io.in(`board:${boardId}`).fetchSockets();
          const stillPresent = roomSockets.some((s) => s.user?.id === user.id);
          if (!stillPresent) {
            io.to(`board:${boardId}`).emit('user:left', { userId: user.id, boardId });
          }
        } catch {
          // Fallback: always emit if fetchSockets fails
          io.to(`board:${boardId}`).emit('user:left', { userId: user.id, boardId });
        }
      }
      logger.info('Socket disconnected', { socketId: socket.id, userId: user.id, reason });
    });

    socket.on('error', (err) => {
      logger.error('Socket error', { socketId: socket.id, error: err.message });
    });
  });

  logger.info('Socket.io initialized with Redis adapter');
  return io;
};

const getIO = () => {
  if (!io) throw new Error('Socket.io not initialized — call initSocket first');
  return io;
};

module.exports = { initSocket, getIO };
