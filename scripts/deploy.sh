#!/usr/bin/env bash
# ==============================================================================
# Prozo FC Margin Monitor - One-Command Deployment / Update Script
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(dirname "${SCRIPT_DIR}")"

cd "${APP_DIR}"

echo "=========================================================="
echo " Updating & Redeploying Prozo FC Margin Monitor Stack     "
echo " Working Directory: ${APP_DIR}                           "
echo " Timestamp: $(date -u +"%Y-%m-%dT%H:%M:%SZ")              "
echo "=========================================================="

# 1. Pull latest code if git remote tracking exists
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    if git remote -v | grep -q 'origin'; then
        echo "==> Pulling latest changes from Git repository..."
        git pull --rebase || echo "Notice: git pull skipped or up to date."
    fi
fi

# 2. Build Docker images with latest source
echo "==> Building updated Docker images..."
docker compose build

# 3. Apply updates with zero downtime / minimal transition
echo "==> Restarting containers with updated images..."
docker compose up -d --remove-orphans

# 4. Cleanup old dangling images
echo "==> Pruning unused Docker images..."
docker image prune -f

echo "==> Stack Status:"
docker compose ps

echo "=========================================================="
echo " Redeployment Completed Successfully!                     "
echo "=========================================================="
