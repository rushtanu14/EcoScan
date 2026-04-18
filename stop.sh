#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

pid_file=".ecoscan.pid"

if [[ ! -f "$pid_file" ]]; then
  echo "EcoScan does not appear to be running."
  exit 0
fi

pid="$(cat "$pid_file" 2>/dev/null || true)"

if [[ -z "$pid" ]]; then
  rm -f "$pid_file"
  echo "EcoScan PID file was empty. Cleaned it up."
  exit 0
fi

if kill -0 "$pid" 2>/dev/null; then
  kill "$pid" 2>/dev/null || true
  for _ in $(seq 1 20); do
    if ! kill -0 "$pid" 2>/dev/null; then
      rm -f "$pid_file"
      echo "EcoScan stopped."
      exit 0
    fi
    sleep 0.2
  done
  kill -9 "$pid" 2>/dev/null || true
fi

rm -f "$pid_file"
echo "EcoScan stopped."
