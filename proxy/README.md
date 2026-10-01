# Optional: transpiling proxy for the Chromium 68 syntax problem

Only useful if DevTools shows `SyntaxError: Unexpected token ?` (or similar) from Telia's bundles. Experimental personal tool: it breaks whenever Telia ships a new build, and it is more intrusive than simply viewing the service, so don't expect it to be maintainable.

`transpile_addon.py` is a [mitmproxy](https://mitmproxy.org) addon. It runs `esbuild --target=chrome68` on JavaScript responses from allow-listed hosts (default `teliatv.ee` and its subdomains). esbuild runs without blocking the proxy, results are cached, and if esbuild fails or times out the original script is served. Everything else (HTML, JSON, license requests, media segments) passes through untouched.

## Run (on a Linux machine on your LAN, e.g. a Raspberry Pi)

```bash
pip install mitmproxy && npm i -g esbuild
python3 proxy/test_transpile.py   # quick self-test
```

Environment: `TRANSPILE_HOSTS` (comma-separated host suffixes), `TRANSPILE_TARGET` (default `chrome68`), `TRANSPILE_TIMEOUT` (seconds, default 60), `TRANSPILE_MAX_BYTES`, `TRANSPILE_CACHE_BYTES` (LRU cache size, default 64 MiB), `ESBUILD` (binary path).

## Route the TV through it

LG webOS has no HTTP proxy setting, so use **transparent mode** with the proxy machine as the TV's gateway:

1. On the proxy machine (replace `eth0` with its LAN interface):
   ```bash
   sudo sysctl -w net.ipv4.ip_forward=1
   sudo sysctl -w net.ipv4.conf.all.send_redirects=0
   sudo iptables -t nat -A PREROUTING -i eth0 -p tcp --dport 80  -j REDIRECT --to-port 8080
   sudo iptables -t nat -A PREROUTING -i eth0 -p tcp --dport 443 -j REDIRECT --to-port 8080
   mitmdump --mode transparent --showhost --listen-port 8080 \
     --allow-hosts '(^|\.)teliatv\.ee(:443)?$' -s proxy/transpile_addon.py
   ```
   `--allow-hosts` makes mitmproxy intercept only teliatv.ee; all other traffic (DRM licenses, CDNs, LG services) is forwarded without TLS interception.
2. On the TV: Settings > Network > (Wi-Fi or wired) > Edit, switch to manual IP, and set **Gateway** to the proxy machine's IP (keep IP, subnet and DNS as before).
3. **Certificate (unverified):** mitmproxy re-signs teliatv.ee with its own CA (`~/.mitmproxy/mitmproxy-ca-cert.pem`), and the TV's web engine must trust it or every teliatv.ee request fails with a certificate error. How webOS's WebAppManager loads trusted CAs has not been verified; the root filesystem is read-only, so adding a CA likely means bind-mounting a modified CA bundle at boot. Without a trusted CA this proxy cannot work.
4. **Clear the cache:** the broken bundle may already be cached. Open DevTools (`scripts/deploy.sh inspect`), tick **Network > Disable cache**, use **Application > Clear storage** (this also removes service workers), then reload. The addon strips `If-None-Match` / `If-Modified-Since` on teliatv.ee GETs so revalidation returns a full body instead of a 304.
5. Re-check the DevTools console.

To undo: restore the TV's network settings to automatic, then delete the iptables rules (`sudo iptables -t nat -F PREROUTING` if you have no other rules there).

## Limitations

- Only external script files are transpiled. Inline `<script>` blocks in Telia's HTML pass through unchanged, so modern syntax there still fails.
- For classic (non-module) scripts, esbuild declares its helper variables at the top level (e.g. `var _a, _k; _k = new WeakMap()`), which become shared globals across all transpiled scripts. Bundled code (webpack/Vite) is unaffected; separately transpiled classic scripts with same-named private class fields could clash.
- Syntax is down-levelled but missing runtime APIs still need polyfills (see the wrapper's user script).
- Certificate pinning, Content-Security-Policy or subresource-integrity checks on Telia's side can block rewritten scripts.

Only use this for your own account and device.
