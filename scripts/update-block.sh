#!/usr/bin/env bash
# Manage the Homebrew Channel firmware-update block on a rooted TV.
# Usage: scripts/update-block.sh {on|off|status} TV_IP
set -euo pipefail
CMD="${1:?usage: update-block.sh {on|off|status} TV_IP}"
TV="${2:?usage: update-block.sh {on|off|status} TV_IP}"
FLAG=/var/luna/preferences/webosbrew_block_updates
HOSTS_RE='(snu|su|su-dev|su-ssl)\.lge\.com'
case "$CMD" in
  on)  ssh "root@$TV" "touch $FLAG && reboot" ;;
  off) ssh "root@$TV" "rm -f $FLAG && reboot" ;;
  status)
    ssh "root@$TV" "[ -e $FLAG ] && echo 'flag: present' || echo 'flag: absent'
grep -E '$HOSTS_RE' /etc/hosts || echo 'no LG update hosts sinkholed in /etc/hosts'" ;;
  *) echo "usage: $0 {on|off|status} TV_IP" >&2; exit 1 ;;
esac
