#!/usr/bin/env bash
set -euo pipefail
python worker.py &
exec uvicorn app:app --host 0.0.0.0 --port "${PORT:-10000}" --workers 1
