#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

venv_dir=".venv"
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

if ! command -v python3 >/dev/null 2>&1; then
  echo "EcoScan requires python3 to run."
  exit 1
fi

if [[ ! -d "$venv_dir" ]]; then
  echo "Creating local virtual environment in $venv_dir"
  python3 -m venv "$venv_dir"
fi

# shellcheck disable=SC1091
source "$venv_dir/bin/activate"

python3 -m pip install --upgrade pip >/dev/null

if ! python3 -c "import ecoscan, PIL" >/dev/null 2>&1; then
  echo "Installing EcoScan dependencies"
  python3 -m pip install -e '.[full]' >/dev/null
fi

server_cmd=(python3 -m ecoscan.cli serve --data-dir data/sample_inputs)
if ((${#args[@]})); then
  server_cmd+=("${args[@]}")
fi

PYTHONPATH=src "${server_cmd[@]}" &
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
