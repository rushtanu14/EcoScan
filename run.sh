#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

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

PYTHONPATH=src python3 -m ecoscan.cli serve --data-dir data/sample_inputs "${args[@]}" &
server_pid=$!

cleanup() {
  kill "$server_pid" 2>/dev/null || true
}

trap cleanup EXIT INT TERM

for _ in $(seq 1 30); do
  if curl -s "http://127.0.0.1:${port}/health" >/dev/null; then
    break
  fi
  sleep 0.25
done

echo "Opening EcoScan dashboard at http://127.0.0.1:${port}"

if command -v open >/dev/null 2>&1; then
  open "http://127.0.0.1:${port}" >/dev/null 2>&1 || true
fi

wait "$server_pid"
