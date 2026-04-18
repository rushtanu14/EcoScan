#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

pid_file=".ecoscan.pid"
port=8000
args=()

while (($#)); do
  if [[ "$1" == "--port" && $# -ge 2 ]]; then
    port="$2"
    args+=("$1" "$2")
    shift 2
    continue
  fi
  args+=("$1")
  shift
done

if [[ -f "$pid_file" ]]; then
  existing_pid="$(cat "$pid_file" 2>/dev/null || true)"
  if [[ -n "$existing_pid" ]] && kill -0 "$existing_pid" 2>/dev/null; then
    echo "EcoScan is already running with PID $existing_pid."
    echo "Use ./stop.sh first if you want to restart it."
    exit 1
  fi
  rm -f "$pid_file"
fi

server_cmd=(python3 -m ecoscan.cli serve --data-dir data/sample_inputs)
if ((${#args[@]})); then
  server_cmd+=("${args[@]}")
fi

PYTHONPATH=src "${server_cmd[@]}" &
server_pid=$!
echo "$server_pid" >"$pid_file"

cleanup() {
  kill "$server_pid" 2>/dev/null || true
  rm -f "$pid_file"
}

trap cleanup EXIT INT TERM

for _ in $(seq 1 30); do
  if curl -s "http://127.0.0.1:${port}/health" >/dev/null; then
    break
  fi
  sleep 0.25
done

echo "Opening EcoScan dashboard at http://127.0.0.1:${port}"
echo "Press Ctrl+C here, or run ./stop.sh from another terminal to stop EcoScan."

if command -v open >/dev/null 2>&1; then
  open "http://127.0.0.1:${port}" >/dev/null 2>&1 || true
fi

wait "$server_pid"
