const Redis = require('ioredis');
const logger = require('../utils/logger');

const createRedisClient = (options = {}) => {
  // Upstash uses rediss:// (TLS). ioredis enables TLS for rediss:// automatically,
  // but rejectUnauthorized must be false for Upstash's certificate chain.
  // enableReadyCheck must be false — Upstash's serverless model doesn't support it.
  // maxRetriesPerRequest: null lets Bull's blocking commands run without per-request retry limits.
  const isTLS = process.env.REDIS_URL?.startsWith('rediss://');
  const client = new Redis(process.env.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    retryStrategy(times) {
      if (times > 10) return null; // stop retrying after 10 attempts
      return Math.min(times * 100, 3000);
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
