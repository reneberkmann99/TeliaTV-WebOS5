#!/usr/bin/env bash
# Package the wrapper into an IPK (requires: npm i -g @webos-tools/cli)
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p dist
rm -f dist/*.ipk   # drop stale builds so exactly one IPK remains
ares-package ./teliatv-wrapper -o dist
ls -1 dist/*.ipk
