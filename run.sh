#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

backend_pid_file=".ecoscan.backend.pid"
frontend_pid_file=".ecoscan.frontend.pid"
legacy_pid_file=".ecoscan.pid"
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

while (($#)); do
  case "$1" in
    --port|--backend-port)
      if [[ $# -lt 2 ]]; then
        echo "Missing value for $1"
        exit 1
      fi
      backend_port="$2"
      shift 2
      ;;
    --frontend-port)
      if [[ $# -lt 2 ]]; then
        echo "Missing value for $1"
        exit 1
      fi
      frontend_port="$2"
      shift 2
      ;;
    *)
      backend_args+=("$1")
      shift
      ;;
  esac
done

clean_stale_pid "$backend_pid_file"
clean_stale_pid "$frontend_pid_file"
clean_stale_pid "$legacy_pid_file"

existing_backend_pid="$(read_pid "$backend_pid_file")"
existing_frontend_pid="$(read_pid "$frontend_pid_file")"
existing_legacy_pid="$(read_pid "$legacy_pid_file")"

if is_running "$existing_backend_pid" || is_running "$existing_frontend_pid" || is_running "$existing_legacy_pid"; then
  echo "EcoScan appears to already be running."
  [[ -n "$existing_backend_pid" ]] && echo "Backend PID: $existing_backend_pid"
  [[ -n "$existing_frontend_pid" ]] && echo "Frontend PID: $existing_frontend_pid"
  [[ -n "$existing_legacy_pid" ]] && echo "Legacy PID: $existing_legacy_pid"
  echo "Use ./stop.sh first if you want to restart it."
  exit 1
fi

backend_cmd=(python3 -m ecoscan.cli serve --data-dir data/sample_inputs --port "$backend_port")
if ((${#backend_args[@]})); then
  backend_cmd+=("${backend_args[@]}")
fi

PYTHONPATH=src "${backend_cmd[@]}" &
backend_pid=$!
echo "$backend_pid" >"$backend_pid_file"

frontend_pid=""

cleanup() {
  [[ -n "$frontend_pid" ]] && kill "$frontend_pid" 2>/dev/null || true
  [[ -n "$backend_pid" ]] && kill "$backend_pid" 2>/dev/null || true
  rm -f "$frontend_pid_file" "$backend_pid_file"
}

trap cleanup EXIT INT TERM

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

if ! command -v npm >/dev/null 2>&1; then
  echo "npm is not installed, so only the backend was started."
  echo "Install Node.js 20+ and run ./run.sh again to launch the React UI."
  echo "Backend is running at http://127.0.0.1:${backend_port}"
  if command -v open >/dev/null 2>&1; then
    open "http://127.0.0.1:${backend_port}" >/dev/null 2>&1 || true
  fi
  wait "$backend_pid"
  exit 0
fi

if [[ ! -d frontend/node_modules ]]; then
  echo "Installing frontend dependencies..."
  (cd frontend && npm install)
fi

(
  cd frontend
  npm run dev -- --host 127.0.0.1 --port "$frontend_port" --strictPort
) &
frontend_pid=$!
echo "$frontend_pid" >"$frontend_pid_file"

for _ in $(seq 1 60); do
  if curl -s "http://127.0.0.1:${frontend_port}" >/dev/null; then
    break
  fi
  sleep 0.25
done

if ! curl -s "http://127.0.0.1:${frontend_port}" >/dev/null; then
  echo "Frontend failed to start on port ${frontend_port}."
  exit 1
fi

echo "EcoScan backend: http://127.0.0.1:${backend_port}"
echo "EcoScan UI:      http://127.0.0.1:${frontend_port}"
echo "Press Ctrl+C here, or run ./stop.sh from another terminal to stop EcoScan."

if command -v open >/dev/null 2>&1; then
  open "http://127.0.0.1:${frontend_port}" >/dev/null 2>&1 || true
fi

wait "$frontend_pid"
