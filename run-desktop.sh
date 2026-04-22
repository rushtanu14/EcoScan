#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

desktop_pid_file=".ecoscan.desktop.pid"
desktop_backend_pid_file=".ecoscan.desktop.backend.pid"

backend_port=8000
frontend_port=5173
backend_args=()

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

port_in_use() {
  local port="$1"
  python3 - "$port" <<'PY'
import socket
import sys

port = int(sys.argv[1])
sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
try:
    sock.bind(("127.0.0.1", port))
except OSError:
    sys.exit(0)
finally:
    sock.close()

sys.exit(1)
PY
}

existing_desktop_pid="$(read_pid "$desktop_pid_file")"
if is_running "$existing_desktop_pid"; then
  echo "EcoScan desktop is already running (PID ${existing_desktop_pid})."
  echo "Use ./stop.sh first if you want to restart it."
  exit 1
fi

# Parse optional flags and remove them from args passed to the backend/desktop.
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

echo "Launching EcoScan desktop app..."
if port_in_use "$backend_port"; then
  echo "Backend port ${backend_port} is already in use by another process."
  echo "Stop the existing process, or start EcoScan on another port: ./run-desktop.sh --port 8123"
  exit 1
fi

# If a frontend app exists, build it and copy the production output into the
# Python server static directory so the desktop app shows the up-to-date UI.
if [ "$SKIP_FRONTEND_BUILD" -ne 1 ] && [ -d "frontend" ] && [ -f "frontend/package.json" ] && command -v npm >/dev/null 2>&1; then
  echo "Building frontend production bundle..."
  # Try to install dependencies (best-effort) and build. Failures shouldn't stop the server.
  if (cd frontend && npm install --no-audit --no-fund); then
    if (cd frontend && npm run build); then
      echo "Copying frontend build into server static folder..."
      rm -rf src/ecoscan/static/* || true
      cp -R frontend/dist/* src/ecoscan/static/ || true
    else
      echo "Warning: frontend build failed; continuing with existing static files."
    fi
  else
    echo "Warning: npm install failed; skipping frontend build."
  fi
fi

PYTHONPATH=src python3 -m ecoscan.cli serve --data-dir data/sample_inputs --port "$backend_port" "$@" &
desktop_backend_pid=$!
echo "$desktop_backend_pid" >"$desktop_backend_pid_file"

for _ in $(seq 1 40); do
  if curl -s "http://127.0.0.1:${backend_port}/health" >/dev/null; then
    break
  fi
  sleep 0.25
done

if ! curl -s "http://127.0.0.1:${backend_port}/health" >/dev/null; then
  echo "Backend failed to start on port ${backend_port}."
  exit 1
fi

# Launch desktop UI (pywebview) which loads the local frontend or backend UI
PYTHONPATH=src python3 -m ecoscan.desktop "$@" &
desktop_pid=$!
echo "$desktop_pid" >"$desktop_pid_file"

echo "EcoScan desktop backend: http://127.0.0.1:${backend_port}"
echo "Launched EcoScan desktop app (PID ${desktop_pid})."

trap '[[ -n "$desktop_pid" ]] && kill "$desktop_pid" 2>/dev/null || true; [[ -n "$desktop_backend_pid" ]] && kill "$desktop_backend_pid" 2>/dev/null || true; rm -f "$desktop_pid_file" "$desktop_backend_pid_file"' EXIT INT TERM

wait "$desktop_pid"
