#!/bin/bash
set -e

# Auto-healing: Ensure volume mounts have correct permissions for the node user (UID 1000)
# This fixes "unable to open database file" when host directories are mounted as root.

if [ -d "/app/prisma" ]; then
    # Check if the directory is not owned by node (1000)
    if [ "$(stat -c '%U' /app/prisma)" != "node" ]; then
        echo "[Auto-Healing] Fixing permissions for /app/prisma..."
        chown -R node:node /app/prisma
    fi
fi

if [ -d "/app/.cache" ]; then
    if [ "$(stat -c '%U' /app/.cache)" != "node" ]; then
        echo "[Auto-Healing] Fixing permissions for /app/.cache..."
        chown -R node:node /app/.cache
    fi
fi

# Execute the main command (supervisord)
exec "$@"
