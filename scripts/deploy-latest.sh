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
LOCAL=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/api/health || echo "fail")
NGROK=$(curl -s -o /dev/null -w "%{http_code}" https://eligibly-facing-unloved.ngrok-free.dev/api/health -H "ngrok-skip-browser-warning: true" || echo "fail")
echo "localhost:3000 => $LOCAL"
echo "ngrok public   => $NGROK"
pm2 list
echo ""
echo "Done. Site stays up when you close Cursor/laptop (runs on this server)."
