const Redis = require('ioredis');
const logger = require('../utils/logger');

const createRedisClient = (options = {}) => {
  // Upstash uses rediss:// (TLS). ioredis enables TLS automatically for rediss://
  // but needs rejectUnauthorized: false for Upstash's certificate chain.
  const isTLS = process.env.REDIS_URL?.startsWith('rediss://');
  const client = new Redis(process.env.REDIS_URL, {
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    retryStrategy(times) {
      const delay = Math.min(times * 50, 2000);
      return delay;
    },
    ...(isTLS ? { tls: { rejectUnauthorized: false } } : {}),
    ...options,
  });

  client.on('connect', () => logger.info('Redis client connecting'));
  client.on('ready', () => logger.info('Redis client ready'));
  client.on('error', (err) => logger.error('Redis client error', { error: err.message }));
  client.on('close', () => logger.warn('Redis client connection closed'));
  client.on('reconnecting', () => logger.info('Redis client reconnecting'));

  return client;
};

// Primary client for general use
const redisClient = createRedisClient();

// Separate clients for pub/sub (ioredis requires separate connections)
const pubClient = createRedisClient();
const subClient = createRedisClient();

module.exports = { redisClient, pubClient, subClient, createRedisClient };
