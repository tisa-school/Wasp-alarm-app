#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo 'Please install Node.js 20.11 or newer, then open this file again.'
  read -r -p 'Press Enter to close.'
  exit 1
fi
node start-local.mjs
