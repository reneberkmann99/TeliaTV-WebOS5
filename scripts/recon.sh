#!/usr/bin/env bash
# Phase 0 reconnaissance. Usage: scripts/recon.sh TV_IP
set -euo pipefail
TV="${1:?usage: recon.sh TV_IP}"
ssh "root@$TV" bash -s <<'REMOTE'
luna-send -n 1 -f luna://com.webos.service.tv.systemproperty/getSystemInfo \
  '{"keys":["modelName","firmwareVersion","sdkVersion"]}'
luna-send -n 1 -f luna://com.webos.settingsservice/getSystemSettings \
  '{"category":"option","keys":["country","smartServiceCountryCode2"]}'
# Open the web player in the built-in browser (not inspectable; visual check only)
luna-send -n 1 -f luna://com.webos.applicationmanager/launch \
  '{"id":"com.webos.app.browser","params":{"target":"https://www.teliatv.ee/"}}'
REMOTE
