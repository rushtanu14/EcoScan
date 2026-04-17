#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

pid_file=".ecoscan.pid"

if [[ ! -f "$pid_file" ]]; then
  echo "No EcoScan PID file found. If the app is still running, stop it manually."
  exit 0
fi

pid="$(cat "$pid_file" 2>/dev/null || true)"
if [[ -z "$pid" ]]; then
  echo "EcoScan PID file is empty. Removing it."
  rm -f "$pid_file"
  exit 0
fi

if kill -0 "$pid" 2>/dev/null; then
  echo "Stopping EcoScan process $pid"
  kill "$pid" 2>/dev/null || true
  for _ in $(seq 1 20); do
    if ! kill -0 "$pid" 2>/dev/null; then
      break
    fi
    sleep 0.25
  done
  if kill -0 "$pid" 2>/dev/null; then
    echo "Process still running, forcing stop"
    kill -9 "$pid" 2>/dev/null || true
  fi
else
  echo "Process $pid is not running."
fi

rm -f "$pid_file"
echo "EcoScan stopped."
