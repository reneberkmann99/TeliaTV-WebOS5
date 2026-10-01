#!/usr/bin/env bash
# Smoke test for scripts/*.sh. ssh and ares-* are replaced by stubs that log their
# arguments (and stdin), so nothing touches a real TV. Run: bash tests/scripts.sh
set -euo pipefail
SRC="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
# Run against a copy, so the install check never touches the real dist/.
ROOT="$TMP/repo"
mkdir -p "$ROOT"
cp -R "$SRC/scripts" "$SRC/teliatv-wrapper" "$ROOT/"
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
RC=0
run() { : > "$LOG"; RC=0; "$@" </dev/null >/dev/null 2>"$TMP/err" || RC=$?; }
status() {  # status DESCRIPTION EXPECTED-EXIT-CODE (of the last run)
  if [ "$RC" -eq "$2" ]; then echo "ok   $1"; else echo "FAIL $1 (exit $RC, wanted $2)"; sed 's/^/     /' "$TMP/err"; fails=$((fails+1)); fi
}
expect() {  # expect DESCRIPTION FIXED-STRING
  if grep -qF -- "$2" "$LOG"; then echo "ok   $1"; else echo "FAIL $1 (wanted: $2)"; sed 's/^/     /' "$LOG"; fails=$((fails+1)); fi
}

# bash -n only checks its first file argument, so check each script separately.
for f in "$ROOT"/scripts/*.sh; do
  if bash -n "$f"; then echo "ok   bash -n scripts/${f##*/}"; else echo "FAIL bash -n scripts/${f##*/}"; fails=$((fails+1)); fi
done

run bash "$ROOT/scripts/update-block.sh" on 10.0.0.5
status "update-block on exits 0" 0
expect "update-block on"     "ssh [root@10.0.0.5] [touch /var/luna/preferences/webosbrew_block_updates && reboot]"
run bash "$ROOT/scripts/update-block.sh" off 10.0.0.5
status "update-block off exits 0" 0
expect "update-block off"    "ssh [root@10.0.0.5] [rm -f /var/luna/preferences/webosbrew_block_updates && reboot]"
run bash "$ROOT/scripts/update-block.sh" status 10.0.0.5
status "update-block status exits 0" 0
expect "update-block status" "grep -E '(snu|su|su-dev|su-ssl)\.lge\.com' /etc/hosts"
run bash "$ROOT/scripts/update-block.sh" bogus 10.0.0.5
status "update-block rejects unknown command" 1

run bash "$ROOT/scripts/recon.sh" 10.0.0.5
status "recon exits 0" 0
expect "recon uses sh -s"    "ssh [root@10.0.0.5] [sh] [-s]"
expect "recon sends luna-send" "stdin: luna-send -n 1 -f luna://com.webos.applicationManager/launch"

run bash "$ROOT/scripts/deploy.sh" setup 10.0.0.5 "$TMP/home/.ssh/id_rsa"
status "setup exits 0" 0
expect "setup shortens ~/.ssh path" "ares-setup-device [-a] [tvroot] [-i] [username=root] [-i] [privatekey=id_rsa] [-i] [host=10.0.0.5] [-i] [port=22]"
run bash "$ROOT/scripts/deploy.sh" setup 10.0.0.5 id_rsa
status "setup with file name exits 0" 0
expect "setup accepts file name" "[privatekey=id_rsa]"
KEY_PASSPHRASE=s3cret run bash "$ROOT/scripts/deploy.sh" setup 10.0.0.5 id_rsa
status "setup with passphrase exits 0" 0
expect "setup passes passphrase" "[passphrase=s3cret]"
run bash "$ROOT/scripts/deploy.sh" setup 10.0.0.5 /etc/id_rsa
status "setup rejects key outside ~/.ssh" 1
run bash "$ROOT/scripts/deploy.sh" setup 10.0.0.5 missing_key
status "setup rejects missing key" 1
DEVICE=mytv run bash "$ROOT/scripts/deploy.sh" install
status "install exits 0" 0
expect "install packages"  "ares-package [./teliatv-wrapper] [-o] [dist]"
expect "install installs"  "ares-install [-d] [mytv] [dist/ee.local.teliatv_0.1.0_all.ipk]"

if [ "$fails" -eq 0 ]; then echo "all passed"; else echo "$fails failed"; exit 1; fi
