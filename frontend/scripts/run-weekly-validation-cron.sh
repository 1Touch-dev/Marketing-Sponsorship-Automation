#!/usr/bin/env bash
# Cron wrapper for scripts/run-weekly-validation.ts (Phase 3 clean-window
# requirement). Scheduled via crontab -e:
#   0 7 * * 1 /home/ubuntu/Market_Sponsorship_Automation/frontend/scripts/run-weekly-validation-cron.sh
# Runs weekly, Mondays at 07:00 UTC (~04:00 BRT, an hour after the daily backup).
set -uo pipefail

cd "$(dirname "$0")/.."

LOG_DIR="./logs"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/weekly-validation-$(date -u +%Y-%m-%d).log"

set -a
source .env.local
set +a

{
  echo "=== weekly validation run started $(date -u -Iseconds) ==="
  npx tsx scripts/run-weekly-validation.ts
  status=$?
  echo "=== weekly validation run finished $(date -u -Iseconds), exit code $status ==="
} >> "$LOG_FILE" 2>&1

exit "$status"
