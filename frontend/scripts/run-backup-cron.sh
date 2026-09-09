#!/usr/bin/env bash
# Cron wrapper for scripts/run-backup.ts (Pattern 7 hardening, see
# docs/DEPLOYMENT_AND_RUNTIME.md section 14). Scheduled via crontab -e:
#   0 6 * * * /home/ubuntu/Market_Sponsorship_Automation/frontend/scripts/run-backup-cron.sh
# Runs daily at 06:00 UTC (~03:00 BRT, off-peak).
set -uo pipefail

cd "$(dirname "$0")/.."

LOG_DIR="./logs"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/backup-$(date -u +%Y-%m-%d).log"

set -a
source .env.local
set +a

{
  echo "=== backup run started $(date -u -Iseconds) ==="
  npx tsx scripts/run-backup.ts
  status=$?
  echo "=== backup run finished $(date -u -Iseconds), exit code $status ==="
} >> "$LOG_FILE" 2>&1

exit "$status"
