// Catch startup crashes BEFORE any other module loads so the error is always visible in logs
process.on('uncaughtException', (err) => {
  process.stderr.write('[server] UNCAUGHT EXCEPTION: ' + String(err && (err.stack || err.message || err)) + '\n');
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  process.stderr.write('[server] UNHANDLED REJECTION: ' + String(reason && (reason.stack || reason.message || reason)) + '\n');
  process.exit(1);
});

process.stdout.write('[server] process starting, PID=' + process.pid + ' node=' + process.version + '\n');

require('dotenv').config();
process.stdout.write('[server] dotenv loaded\n');

const http = require('http');
process.stdout.write('[server] requiring app...\n');
const app = require('./app');
process.stdout.write('[server] app loaded\n');

const { initSocket } = require('./socket');
const logger = require('./utils/logger');
const { pool } = require('./config/db');
const { redisClient } = require('./config/redis');
const { startDueDateReminderJob } = require('./cron/dueDateReminder');

const PORT = process.env.PORT || 5000;
process.stdout.write('[server] PORT=' + PORT + '\n');

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
  // Verify SMTP connectivity at startup so misconfiguration is immediately visible in logs
  require('./services/emailService').verify().catch(() => {});
});

module.exports = server;
