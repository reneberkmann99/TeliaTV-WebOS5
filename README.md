# Telia TV (Estonia) on a rooted LG webOS 5 TV

Telia Eesti has **no official Telia TV app for LG webOS**, so there is nothing to sideload or unlock by changing region. This repo is a homebrew wrapper that loads the teliatv.ee web player in a webOS app. Whether it works depends on three things you can check in about 30 minutes:

1. Does the player's JavaScript run on Chromium 68 (webOS 5's engine, never updated by LG)?
2. Does Telia's license server accept the TV's Widevine or PlayReady CDM?
3. Can the TV decode the streams the player picks (codecs, profiles, DRM robustness level)?

If any of these fails, the dependable option is an Android TV / Google TV device on HDMI (Chromecast with Google TV, Google TV Streamer, or Telia's rented Android box), which Telia officially supports.

> Unofficial and unsupported. Using it breaks no rule we found (it shows Telia's own web player with your own login), but Telia forbids VPNs, rooting may affect your LG warranty, and you get no support. Don't redistribute the IPK with Telia branding.

## Layout

| Path | Purpose |
|---|---|
| `teliatv-wrapper/` | The webOS app (`appinfo.json`, redirect `index.html`, `webOSUserScripts/userScript.js`) |
| `scripts/package.sh` | Build the IPK into `dist/` |
| `scripts/deploy.sh` | `setup`, `install`, `launch`, `inspect`, `remove` via ares-cli |
| `scripts/recon.sh` | Phase 0 checks over SSH |
| `scripts/update-block.sh` | Toggle the Homebrew Channel firmware-update block |
| `probe/eme-probe.js` | DevTools snippet: Widevine / PlayReady availability |
| `router/lg-update-block.dnsmasq.conf` | Router-level block of the LG update hosts |
| `proxy/` | Optional mitmproxy + esbuild proxy for Chrome 68 syntax errors |
| `tests/` | Tests, no TV needed: `bash tests/scripts.sh` (stubs ssh/ares) and `node tests/userscript.test.js` |

## Prerequisites

- Rooted webOS 5.x TV with Homebrew Channel and SSH (key auth) enabled.
- **Do not install LG's Developer Mode app** on a rooted TV; it can break the system. Homebrew Channel provides the same features.
- PC with Node and `npm install -g @webos-tools/cli` (`ares -V` should work). A Chromium 68 build is recommended for DevTools.
- A phone with Smart-ID or Mobiil-ID to log in.

## Usage

```bash
# 0. Before building anything: search "Telia" in the TV's Content Store in case an app has launched.

# 1. Recon (system info, region settings, opens the built-in browser on teliatv.ee)
scripts/recon.sh TV_IP

# 2. Register the TV (root SSH on port 22, not the Developer Mode account on 9922).
#    ares-cli only reads keys from ~/.ssh, so pass the key's file name.
#    If the key has a passphrase, prefix with KEY_PASSPHRASE=...
scripts/deploy.sh setup TV_IP id_rsa

# 3. Build, install, launch, debug
scripts/deploy.sh install
scripts/deploy.sh launch
scripts/deploy.sh inspect      # opens DevTools; or browse to http://TV_IP:9998
```

Set `DEVICE=name` to use a device name other than `tvroot`.

### What the built-in browser test tells you

| Result | Meaning |
|---|---|
| Blank page or stuck spinner | The bundle probably fails to parse on Chrome 68 (`?.` / `??` syntax) |
| "Browser not supported" banner | UA sniffing; the wrapper's JS-level UA spoof may help |
| Login and guide work, playback fails | Past the JS problem; check DRM |
| Playback works | Use the wrapper for remote keys and a launcher tile |

## Debugging checklist (DevTools)

1. **Console:** `SyntaxError: Unexpected token ?` or `.` in a vendor bundle is the modern-syntax wall. Polyfills cannot fix syntax; the only workaround is the optional transpiling proxy in `proxy/` (see `proxy/README.md`).
2. **DRM:** paste `probe/eme-probe.js` into the console. Then play a channel with the Network tab open and note the manifest type (`.mpd` or `.m3u8`), the license URL and the license POST status. A 4xx alone does not prove the CDM was rejected: read the status and response body first. An expired login, missing entitlement, geo restriction, rate limit or malformed request can all return 4xx, so re-login and retry before concluding anything. Only a policy or device/CDM-not-allowed error in the response points to Telia refusing this TV's CDM, and no client-side trick will fix that.
3. **Media and license processing:** `MEDIA_ERR_DECODE` points to codec, profile or robustness problems. A rejected `MediaKeySession.update()` is a different failure: the CDM refused the license response (invalid or incompatible license, session mismatch, or CDM policy), so debug it alongside step 2, not as a codec issue.
4. **Login:** Smart-ID / Mobiil-ID confirm on your phone, so any browser that renders the page works.
5. **Navigation:** arrow keys and OK arrive as normal keyboard events, but a desktop UI may still need the Magic Remote pointer. BACK is handled by webOS using the page's own history; check what it does on the first page (exit or nothing). REW/FF/STOP/CH± are re-sent as ArrowLeft/ArrowRight/Escape/PageUp/PageDown, and PLAY/PAUSE drive the largest playing `<video>`. To see what the TV actually sends, run `addEventListener('keydown', e => console.log(e.keyCode, e.key, e.code, e.isTrusted), true)` in the console.

### UA header variant

The user script only spoofs `navigator.userAgent` in JavaScript. If the site checks the HTTP header server-side, add this to `appinfo.json`. The key name follows the webosbrew appinfo.json page (`vendorExtensions`, plural); if the header doesn't change on your firmware, check the request in DevTools. Note that `netcast` trust level removes `window.PalmServiceBridge`:

```json
"trustLevel": "netcast",
"vendorExtensions": { "userAgent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36" }
```

## Keeping root: blocking firmware updates

```bash
scripts/update-block.sh on TV_IP       # sets the Homebrew Channel flag and reboots
scripts/update-block.sh status TV_IP   # flag + /etc/hosts sinkholes
scripts/update-block.sh off TV_IP      # rollback (reboots)
```

The block is not bulletproof, so also:

- add the lines from `router/lg-update-block.dnsmasq.conf` to your router's dnsmasq config. On Pi-hole v6, paste them into Settings > All settings > Misc > `misc.dnsmasq_lines` (v6 ignores `/etc/dnsmasq.d` unless `misc.etc_dnsmasq_d` is enabled);
- turn off automatic updates in the TV menu (Settings > General > About this TV);
- **don't block all of `lge.com`**: that breaks the Content Store, LG login and time sync;
- check CanI.RootMy.TV for your model and firmware before accepting any update.

## Rollback

```bash
scripts/deploy.sh remove
scripts/update-block.sh off TV_IP   # only if you want updates back
```

To fully restore updates, also remove the router-side block: remove those lines from your dnsmasq config or Pi-hole's `misc.dnsmasq_lines` and reload DNS, and remove any manually added `snu|su|su-dev|su-ssl.lge.com` entries from the TV's `/etc/hosts`.

If you changed the LG Services Country while experimenting, restore the original value and reboot. Changing region is not useful here: no store has a Telia app that works with an Estonian account on webOS 5.

## Why not the other approaches

- **Official Telia webOS IPK:** doesn't exist for Estonia. Telia Play LT (needs webOS 25) and Telia Play SE are separate services with separate accounts.
- **Region change:** pointless, and can leave apps showing "not available in current country".
- **Casting:** Telia EE doesn't document it and webOS 5 has no Google Cast receiver.
- **Android APK:** webOS can't run APKs.

## Caveats

- Which DRM the Telia player uses is undocumented, and its policy toward a TV CDM on a desktop web page is unknown; you can only test it.
- Remote key codes, the `com.webos.app.browser` launch parameters and the `getSystemInfo` keys are homebrew conventions; verify them on your firmware.
- Expect breakage whenever Telia redeploys the player.
- No one on webosbrew, openlgtv or digi-tv.ee is known to have wrapped Telia TV, so you may be first.

Background research and sources: see issue 1 and the original feasibility report.
