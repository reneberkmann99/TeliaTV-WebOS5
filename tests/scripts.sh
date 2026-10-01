#!/usr/bin/env bash
# Smoke test for scripts/*.sh. ssh and ares-* are replaced by stubs that log their
# arguments (and stdin), so nothing touches a real TV. Run: bash tests/scripts.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d)"
# Only clean up dist/ if this test created it (the install check builds into it).
if [ -d "$ROOT/dist" ]; then KEEP_DIST=1; else KEEP_DIST=0; fi
cleanup() { rm -rf "$TMP"; if [ "$KEEP_DIST" = 0 ]; then rm -rf "$ROOT/dist"; fi; }
trap cleanup EXIT
LOG="$TMP/log"
mkdir -p "$TMP/bin" "$TMP/home/.ssh"
touch "$TMP/home/.ssh/id_rsa"

for cmd in ssh ares-setup-device ares-install ares-launch ares-inspect; do
  cat > "$TMP/bin/$cmd" <<STUB
#!/usr/bin/env bash
printf '%s' "$cmd" >> "$LOG"; printf ' [%s]' "\$@" >> "$LOG"; echo >> "$LOG"
if [ "$cmd" = ssh ] && [ ! -t 0 ]; then sed 's/^/  stdin: /' >> "$LOG"; fi
STUB
done
cat > "$TMP/bin/ares-package" <<STUB
#!/usr/bin/env bash
printf 'ares-package'  >> "$LOG"; printf ' [%s]' "\$@" >> "$LOG"; echo >> "$LOG"
touch "\$3/ee.local.teliatv_0.1.0_all.ipk"
STUB
chmod +x "$TMP/bin/"*
export PATH="$TMP/bin:$PATH" HOME="$TMP/home"

fails=0
run() { : > "$LOG"; "$@" </dev/null >/dev/null 2>"$TMP/err" || echo "exit $?" >> "$LOG"; }
expect() {  # expect DESCRIPTION FIXED-STRING
  if grep -qF -- "$2" "$LOG"; then echo "ok   $1"; else echo "FAIL $1 (wanted: $2)"; sed 's/^/     /' "$LOG"; fails=$((fails+1)); fi
}

bash -n "$ROOT"/scripts/*.sh && echo "ok   bash -n scripts/*.sh"

run bash "$ROOT/scripts/update-block.sh" on 10.0.0.5
expect "update-block on"     "ssh [root@10.0.0.5] [touch /var/luna/preferences/webosbrew_block_updates && reboot]"
run bash "$ROOT/scripts/update-block.sh" off 10.0.0.5
expect "update-block off"    "ssh [root@10.0.0.5] [rm -f /var/luna/preferences/webosbrew_block_updates && reboot]"
run bash "$ROOT/scripts/update-block.sh" status 10.0.0.5
expect "update-block status" "grep -E '(snu|su|su-dev|su-ssl)\.lge\.com' /etc/hosts"
run bash "$ROOT/scripts/update-block.sh" bogus 10.0.0.5
expect "update-block rejects unknown command" "exit 1"

: > "$LOG"; bash "$ROOT/scripts/recon.sh" 10.0.0.5 >/dev/null 2>&1 <<<"" || true
expect "recon uses sh -s"    "ssh [root@10.0.0.5] [sh] [-s]"
expect "recon sends luna-send" "stdin: luna-send -n 1 -f luna://com.webos.applicationManager/launch"

run bash "$ROOT/scripts/deploy.sh" setup 10.0.0.5 "$TMP/home/.ssh/id_rsa"
expect "setup shortens ~/.ssh path" "ares-setup-device [-a] [tvroot] [-i] [username=root] [-i] [privatekey=id_rsa] [-i] [host=10.0.0.5] [-i] [port=22]"
run bash "$ROOT/scripts/deploy.sh" setup 10.0.0.5 id_rsa
expect "setup accepts file name" "[privatekey=id_rsa]"
KEY_PASSPHRASE=s3cret run bash "$ROOT/scripts/deploy.sh" setup 10.0.0.5 id_rsa
expect "setup passes passphrase" "[passphrase=s3cret]"
run bash "$ROOT/scripts/deploy.sh" setup 10.0.0.5 /etc/id_rsa
expect "setup rejects key outside ~/.ssh" "exit 1"
run bash "$ROOT/scripts/deploy.sh" setup 10.0.0.5 missing_key
expect "setup rejects missing key" "exit 1"
DEVICE=mytv run bash "$ROOT/scripts/deploy.sh" install
expect "install packages"  "ares-package [./teliatv-wrapper] [-o] [dist]"
expect "install installs"  "ares-install [-d] [mytv] [dist/ee.local.teliatv_0.1.0_all.ipk]"

if [ "$fails" -eq 0 ]; then echo "all passed"; else echo "$fails failed"; exit 1; fi
