#!/usr/bin/env bash
# Wire PM2 for 24/7 app + ngrok on AWS. Safe to re-run.
set -euo pipefail

ROOT="/home/ubuntu/Market_Sponsorship_Automation"
cd "$ROOT"

echo "==> Stopping duplicate systemd units (avoid port 3000 / ngrok conflicts)..."
sudo systemctl stop nextjs.service ngrok.service 2>/dev/null || true
sudo systemctl disable nextjs.service ngrok.service 2>/dev/null || true

echo "==> Starting PM2 apps from ecosystem.config.cjs..."
pm2 delete sponsorship-platform ngrok-tunnel 2>/dev/null || true
pm2 start ecosystem.config.cjs
pm2 save

echo "==> Enabling PM2 on boot (systemd pm2-ubuntu)..."
STARTUP=$(pm2 startup systemd -u ubuntu --hp /home/ubuntu 2>&1 | grep -E "sudo env" || true)
if [ -n "$STARTUP" ]; then
  eval "$STARTUP"
fi
sudo systemctl enable pm2-ubuntu.service 2>/dev/null || true
sudo systemctl start pm2-ubuntu.service 2>/dev/null || true

sleep 4
echo ""
echo "==> Status"
pm2 list
echo ""
HTTP_LOCAL=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/health || echo "fail")
HTTP_NGROK=$(curl -s -o /dev/null -w "%{http_code}" https://eligibly-facing-unloved.ngrok-free.dev/api/health || echo "fail")
echo "localhost:3000/api/health => $HTTP_LOCAL"
echo "ngrok /api/health          => $HTTP_NGROK"
echo ""
echo "Public base URL (share with James): https://eligibly-facing-unloved.ngrok-free.dev"
echo "Closing Cursor/laptop does NOT stop the server — processes live on this EC2 instance."
