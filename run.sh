#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"
PYTHONPATH=src python3 -m ecoscan.cli serve --data-dir data/sample_inputs "$@"
