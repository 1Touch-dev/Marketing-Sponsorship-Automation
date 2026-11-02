#!/usr/bin/env bash
# Health of every address that serves the app: the local port, the configured public address (APP_URL),
# and the legacy ngrok address while it still runs. Reads APP_URL from frontend/.env.local; nothing is hardcoded.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT/frontend/.env.local"
LEGACY_NGROK="${LEGACY_NGROK_URL:-https://eligibly-facing-unloved.ngrok-free.dev}"

APP_URL=""
if [ -f "$ENV_FILE" ]; then
  APP_URL="$(grep -E '^APP_URL=' "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '"' | sed 's#/$##')"
fi

probe() {
  curl -s -o /dev/null -m 10 -w "%{http_code}" "$1/api/health" -H "ngrok-skip-browser-warning: true" || echo "fail"
}

echo "local   http://127.0.0.1:3000        => $(probe http://127.0.0.1:3000)"
if [ -n "$APP_URL" ]; then
  echo "APP_URL $APP_URL => $(probe "$APP_URL")"
fi
if [ -n "$LEGACY_NGROK" ] && [ "$LEGACY_NGROK" != "$APP_URL" ]; then
  echo "legacy  $LEGACY_NGROK => $(probe "$LEGACY_NGROK")"
fi
