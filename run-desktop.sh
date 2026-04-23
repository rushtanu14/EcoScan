#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

desktop_pid_file=".ecoscan.desktop.pid"
desktop_backend_pid_file=".ecoscan.desktop.backend.pid"

is_running() {
  local pid="${1:-}"
  [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null
}

read_pid() {
  local file="$1"
  if [[ -f "$file" ]]; then
    cat "$file" 2>/dev/null || true
  fi
}

clean_stale_pid() {
  local file="$1"
  local pid
  pid="$(read_pid "$file")"
  if [[ -n "$pid" ]] && ! is_running "$pid"; then
    rm -f "$file"
  fi
}

clean_stale_pid "$desktop_pid_file"
clean_stale_pid "$desktop_backend_pid_file"

existing_backend_pid="$(read_pid "$desktop_backend_pid_file")"
existing_desktop_pid="$(read_pid "$desktop_pid_file")"

if is_running "$existing_backend_pid" || is_running "$existing_desktop_pid"; then
  echo "EcoScan desktop appears to already be running."
  [[ -n "$existing_backend_pid" ]] && echo "Backend PID: $existing_backend_pid"
  [[ -n "$existing_desktop_pid" ]] && echo "Desktop PID: $existing_desktop_pid"
  echo "Use ./stop.sh first if you want to restart it."
  exit 1
fi

# Parse optional flags and remove them from args passed to ecoscan.desktop.
SKIP_FRONTEND_BUILD=0
NEW_ARGS=()
for a in "$@"; do
  case "$a" in
    --no-build|--skip-build)
      SKIP_FRONTEND_BUILD=1
      ;;
    *)
      NEW_ARGS+=("$a")
      ;;
  esac
done

if [[ ${#NEW_ARGS[@]} -gt 0 ]]; then
  set -- "${NEW_ARGS[@]}"
else
  set --
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 is required."
  exit 1
fi

if ! python3 - <<'PY' >/dev/null 2>&1
import importlib.util
import sys
sys.exit(0 if importlib.util.find_spec("webview") else 1)
PY
then
  echo "pywebview is required for desktop mode."
  echo "Install it with:"
  echo "  python3 -m pip install pywebview"
  exit 1
fi

if [ "$SKIP_FRONTEND_BUILD" -ne 1 ]; then
  if [[ ! -d frontend ]] || [[ ! -f frontend/package.json ]]; then
    echo "Missing ./frontend package; cannot sync desktop UI from web source."
    echo "Run with --no-build to use current static assets."
    exit 1
  fi
  if ! command -v npm >/dev/null 2>&1; then
    echo "npm is required to build the frontend for desktop mode."
    echo "Install Node.js 20+ or run ./run-desktop.sh --no-build"
    exit 1
  fi

  if [[ ! -d frontend/node_modules ]]; then
    echo "Installing frontend dependencies..."
    (cd frontend && npm install --no-audit --no-fund)
  fi

  echo "Building frontend production bundle..."
  (cd frontend && npm run build)

  echo "Syncing frontend/dist into src/ecoscan/static..."
  rm -rf src/ecoscan/static/*
  cp -R frontend/dist/. src/ecoscan/static/
fi

echo "Launching EcoScan desktop app..."
PYTHONPATH=src python3 -m ecoscan.desktop "$@"
