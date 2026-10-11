#!/usr/bin/env bash
# DateToday on the web (desktop), straight from this repo. Used by Replit (.replit).
#   bash scripts/replit-web.sh          pull latest main, build, serve   (Run button)
#   bash scripts/replit-web.sh build    pull latest main, build          (Deploy: build)
#   bash scripts/replit-web.sh serve    serve the last build             (Deploy: run)
set -euo pipefail
cd "$(dirname "$0")/.."

mode="${1:-run}"
port="${PORT:-3000}"

pull_latest() {
  git rev-parse --is-inside-work-tree >/dev/null 2>&1 || return 0
  if git fetch --quiet origin main && git merge --ff-only --quiet origin/main; then
    echo "On latest main: $(git log -1 --format='%h %s')"
  else
    echo "Couldn't fast-forward to the latest main (local edits?). Building what's here."
  fi
}

install_deps() {
  local want stamp=node_modules/.package-lock.sha
  want="$(sha1sum package-lock.json | cut -d' ' -f1)"
  if [ ! -f "$stamp" ] || [ "$(cat "$stamp")" != "$want" ]; then
    npm ci --no-audit --no-fund
    echo "$want" > "$stamp"
  fi
}

build() {
  # Public client config only (it ships in the page). Firebase config comes from lib/env.ts.
  EXPO_NO_DOTENV=1 \
  EXPO_PUBLIC_APP_ENV=production \
  EXPO_PUBLIC_USE_MOCK_DATA=false \
  EXPO_PUBLIC_WEB_CHECKOUT=true \
  EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=626033907762-6c3mb8spcs4ppomfsjm4um135t5t443o.apps.googleusercontent.com \
    npx expo export --platform web --output-dir dist --clear
}

serve() {
  [ -d dist ] || { echo "No build yet. Run: bash scripts/replit-web.sh build"; exit 1; }
  PORT="$port" node scripts/web-server.mjs dist
}

case "$mode" in
  build) pull_latest; install_deps; build ;;
  serve) serve ;;
  run) pull_latest; install_deps; build; serve ;;
  *) echo "Usage: $0 [run|build|serve]"; exit 1 ;;
esac
