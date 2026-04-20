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

existing_desktop_pid="$(read_pid "$desktop_pid_file")"
if is_running "$existing_desktop_pid"; then
  echo "EcoScan desktop is already running (PID ${existing_desktop_pid})."
  echo "Use ./stop.sh first if you want to restart it."
  exit 1
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

echo "Launching EcoScan desktop app..."
PYTHONPATH=src python3 -m ecoscan.desktop "$@"
