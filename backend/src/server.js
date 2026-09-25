// Catch startup crashes BEFORE any other module loads so the error is always visible in logs
process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION — server will exit:', err.stack || err.message);
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  console.error('UNHANDLED REJECTION — server will exit:', reason instanceof Error ? reason.stack : reason);
  process.exit(1);
});

require('dotenv').config();
const http = require('http');
const app = require('./app');
const { initSocket } = require('./socket');
const logger = require('./utils/logger');
const { pool } = require('./config/db');
const { redisClient } = require('./config/redis');
const { startDueDateReminderJob } = require('./cron/dueDateReminder');

const PORT = process.env.PORT || 5000;

const server = http.createServer(app);

// Initialize Socket.io
initSocket(server);

// Start cron jobs
startDueDateReminderJob();

const shutdown = async () => {
  logger.info('Shutting down server...');
  server.close(async () => {
    await pool.end();
    await redisClient.quit();
    logger.info('Server shut down gracefully');
    process.exit(0);
  });
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

server.listen(PORT, () => {
  logger.info(`TaskBoard API running on port ${PORT}`, {
    env: process.env.NODE_ENV,
    port: PORT,
  });
});

module.exports = server;
