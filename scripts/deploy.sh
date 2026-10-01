#!/usr/bin/env bash
# Install / launch / inspect / remove the wrapper.
# Usage: scripts/deploy.sh setup TV_IP KEY_NAME | install | launch | inspect | remove
# Device name defaults to "tvroot"; override with DEVICE=...
# setup: ares-cli reads the private key from ~/.ssh/<KEY_NAME>, so the key must live in ~/.ssh.
#        A path inside ~/.ssh is accepted and shortened. Set KEY_PASSPHRASE if the key has one.
set -euo pipefail
cd "$(dirname "$0")/.."
DEVICE="${DEVICE:-tvroot}"
APP=ee.local.teliatv
usage() { echo "usage: $0 setup TV_IP KEY_NAME | install | launch | inspect | remove" >&2; exit 1; }
case "${1:-}" in
  setup)
    [ $# -eq 3 ] || usage
    TV="$2"
    KEY="$3"
    SSH_DIR="$HOME/.ssh"
    case "$KEY" in
      "$SSH_DIR"/*) KEY="${KEY#"$SSH_DIR"/}" ;;
      /*|./*|../*)
        echo "error: ares-cli only reads keys from $SSH_DIR. Copy the key there and pass its file name (e.g. id_rsa)." >&2
        exit 1 ;;
    esac
    if [ ! -f "$SSH_DIR/$KEY" ]; then
      echo "error: no key at $SSH_DIR/$KEY" >&2
      exit 1
    fi
    if [ -n "${KEY_PASSPHRASE:-}" ]; then
      ares-setup-device -a "$DEVICE" -i "username=root" -i "privatekey=$KEY" \
        -i "passphrase=$KEY_PASSPHRASE" -i "host=$TV" -i "port=22"
    else
      ares-setup-device -a "$DEVICE" -i "username=root" -i "privatekey=$KEY" \
        -i "host=$TV" -i "port=22"
    fi
    ares-setup-device --list ;;
  install) bash scripts/package.sh >/dev/null
    ares-install -d "$DEVICE" dist/${APP}_*_all.ipk ;;
  launch)  ares-launch -d "$DEVICE" "$APP" ;;
  inspect) ares-inspect -d "$DEVICE" --app "$APP" --open ;;
  remove)  ares-install -d "$DEVICE" --remove "$APP" ;;
  *) usage ;;
esac
