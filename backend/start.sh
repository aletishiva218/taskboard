#!/bin/sh
set -e
echo "[start.sh] Running migrations..."
node src/migrations/run.js
echo "[start.sh] Migrations complete. Starting server..."
exec node src/server.js
