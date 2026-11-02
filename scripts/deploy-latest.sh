#!/usr/bin/env bash
# Build latest frontend and restart PM2 (24/7 on EC2). Safe to re-run after git pull.
set -euo pipefail

ROOT="/home/ubuntu/Market_Sponsorship_Automation"
cd "$ROOT/frontend"

echo "==> Building production bundle..."
npm run build

echo "==> Restarting PM2 apps..."
pm2 restart sponsorship-platform
pm2 restart ngrok-tunnel
pm2 save

sleep 3
echo ""
echo "==> Health check"
bash "$ROOT/scripts/check-public-urls.sh"
pm2 list
echo ""
echo "Done. Site stays up when you close Cursor/laptop (runs on this server)."
