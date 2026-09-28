# Optional: transpiling proxy for the Chromium 68 syntax problem

Only useful if DevTools shows `SyntaxError: Unexpected token ?` (or similar) from Telia's bundles. Experimental personal tool: it breaks whenever Telia ships a new build, and it is more intrusive than simply viewing the service, so don't expect it to be maintainable.

`transpile_addon.py` is a [mitmproxy](https://mitmproxy.org) addon. It runs `esbuild --target=chrome68` on JavaScript responses from allow-listed hosts (default `teliatv.ee` and its subdomains). Everything else (HTML, JSON, license requests, media segments) passes through untouched, and if esbuild fails the original script is served.

## Run (on a LAN machine, e.g. a Raspberry Pi)

```bash
pip install mitmproxy && npm i -g esbuild
mitmdump -s proxy/transpile_addon.py --listen-port 8080
python3 proxy/test_transpile.py   # quick self-test
```

Environment: `TRANSPILE_HOSTS` (comma-separated host suffixes), `TRANSPILE_TARGET` (default `chrome68`), `TRANSPILE_MAX_BYTES`, `ESBUILD` (binary path).

## Point the TV at it

1. Set the TV's Wi-Fi/Ethernet proxy to `PROXY_HOST:8080` (Settings > Network), or route the wrapper's traffic through it another way.
2. mitmproxy re-signs HTTPS with its own CA (`~/.mitmproxy/mitmproxy-ca-cert.pem`). The TV must trust that CA; on a rooted set, add it to the system trust store. Remove it when you're done.
3. Reload the wrapper and re-check the DevTools console.

Caveats: syntax is down-levelled but missing runtime APIs still need polyfills (see the wrapper's user script); certificate pinning or Content-Security-Policy / subresource-integrity checks on Telia's side can also block rewritten scripts. Only use this for your own account and device.
