#!/usr/bin/env bash
# Package the wrapper into an IPK (requires: npm i -g @webos-tools/cli)
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p dist
ares-package ./teliatv-wrapper -o dist
ls -1 dist/*.ipk
