#!/usr/bin/env bash
# Install / launch / inspect / remove the wrapper. Usage: scripts/deploy.sh {setup|install|launch|inspect|remove} [args]
# Device name defaults to "tvroot"; override with DEVICE=...
set -euo pipefail
cd "$(dirname "$0")/.."
DEVICE="${DEVICE:-tvroot}"
APP=ee.local.teliatv
case "${1:-}" in
  setup)  # scripts/deploy.sh setup TV_IP /path/to/id_rsa
    ares-setup-device -a "$DEVICE" -i "username=root" -i "privatekey=${3:?key path}" \
      -i "host=${2:?TV_IP}" -i "port=22"
    ares-setup-device --list ;;
  install) scripts/package.sh >/dev/null
    ares-install -d "$DEVICE" dist/${APP}_*_all.ipk ;;
  launch)  ares-launch -d "$DEVICE" "$APP" ;;
  inspect) ares-inspect -d "$DEVICE" --app "$APP" --open ;;
  remove)  ares-install -d "$DEVICE" --remove "$APP" ;;
  *) echo "usage: $0 {setup|install|launch|inspect|remove}" >&2; exit 1 ;;
esac
