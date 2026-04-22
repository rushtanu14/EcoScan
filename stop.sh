#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

backend_pid_file=".ecoscan.backend.pid"
frontend_pid_file=".ecoscan.frontend.pid"
legacy_pid_file=".ecoscan.pid"
desktop_pid_file=".ecoscan.desktop.pid"
desktop_backend_pid_file=".ecoscan.desktop.backend.pid"

stop_by_pid_file() {
  local pid_file="$1"
  local label="$2"

  if [[ ! -f "$pid_file" ]]; then
    return
  fi

  local pid
  pid="$(cat "$pid_file" 2>/dev/null || true)"
  if [[ -z "$pid" ]]; then
    rm -f "$pid_file"
    return
  fi

  if kill -0 "$pid" 2>/dev/null; then
    kill "$pid" 2>/dev/null || true
    for _ in $(seq 1 20); do
      if ! kill -0 "$pid" 2>/dev/null; then
        rm -f "$pid_file"
        echo "${label} stopped."
        return
      fi
      sleep 0.2
    done
    kill -9 "$pid" 2>/dev/null || true
    rm -f "$pid_file"
    echo "${label} stopped."
    return
  fi

  rm -f "$pid_file"
}

stop_by_pid_file "$frontend_pid_file" "EcoScan frontend"
stop_by_pid_file "$backend_pid_file" "EcoScan backend"
stop_by_pid_file "$legacy_pid_file" "EcoScan legacy server"
stop_by_pid_file "$desktop_backend_pid_file" "EcoScan desktop backend"
stop_by_pid_file "$desktop_pid_file" "EcoScan desktop app"

# Additionally, kill any processes listening on the common dev ports (frontend/backend)
kill_by_port() {
  local port="$1"
  if command -v lsof >/dev/null 2>&1; then
    for pid in $(lsof -tiTCP:"${port}" -sTCP:LISTEN 2>/dev/null || true); do
      if [[ -n "$pid" ]]; then
        echo "Killing process $pid listening on port ${port}"
        kill "$pid" 2>/dev/null || true
        for _ in $(seq 1 20); do
          if ! kill -0 "$pid" 2>/dev/null; then
            echo "Process $pid on port ${port} stopped."
            break
          fi
          sleep 0.1
        done
        kill -9 "$pid" 2>/dev/null || true
      fi
    done
  fi
}

# Common ports used by EcoScan
kill_by_port 8000
kill_by_port 5173

if [[ -f "$frontend_pid_file" || -f "$backend_pid_file" || -f "$legacy_pid_file" || -f "$desktop_backend_pid_file" || -f "$desktop_pid_file" ]]; then
  rm -f "$frontend_pid_file" "$backend_pid_file" "$legacy_pid_file" "$desktop_backend_pid_file" "$desktop_pid_file"
fi

echo "EcoScan stop command completed."
