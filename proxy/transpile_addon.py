"""mitmproxy addon: down-level teliatv.ee JavaScript to a Chromium 68 target.

Run:  mitmdump -s proxy/transpile_addon.py --listen-port 8080
Needs `esbuild` on PATH (npm i -g esbuild) or ESBUILD=/path/to/esbuild.

Only JavaScript responses from allow-listed hosts are rewritten. Everything else
(HTML, JSON, license requests, media segments) is passed through untouched.
Experimental personal tool: it breaks whenever Telia ships a new build.
"""
import hashlib
import os
import subprocess

ESBUILD = os.environ.get("ESBUILD", "esbuild")
TARGET = os.environ.get("TRANSPILE_TARGET", "chrome68")
# Comma-separated host suffixes whose scripts may be rewritten.
HOSTS = tuple(h.strip().lower() for h in os.environ.get("TRANSPILE_HOSTS", "teliatv.ee").split(",") if h.strip())
MAX_BYTES = int(os.environ.get("TRANSPILE_MAX_BYTES", str(20 * 1024 * 1024)))

_cache = {}


def host_allowed(host):
    host = (host or "").lower()
    return any(host == h or host.endswith("." + h) for h in HOSTS)


def is_js(content_type):
    ct = (content_type or "").split(";")[0].strip().lower()
    return ct in ("application/javascript", "text/javascript", "application/x-javascript", "application/ecmascript")


def transpile(source):
    """Return down-levelled source, or None if esbuild fails."""
    key = hashlib.sha256(source).hexdigest()
    if key in _cache:
        return _cache[key]
    try:
        proc = subprocess.run(
            [ESBUILD, "--target=" + TARGET, "--log-level=error"],
            input=source, capture_output=True, timeout=60,
        )
    except (OSError, subprocess.TimeoutExpired):
        return None
    out = proc.stdout if proc.returncode == 0 and proc.stdout else None
    _cache[key] = out
    return out


def response(flow):
    resp = flow.response
    if resp is None or resp.status_code != 200:
        return
    if flow.request.method != "GET" or not host_allowed(flow.request.pretty_host):
        return
    if not is_js(resp.headers.get("content-type")):
        return
    body = resp.get_content(strict=False)  # decoded (gunzip etc.)
    if not body or len(body) > MAX_BYTES:
        return
    out = transpile(body)
    if out is None:
        return  # leave the original response alone
    resp.set_content(out)  # re-encodes per Content-Encoding handling, fixes length
    resp.headers["x-transpiled-by"] = "teliatv-webos5"
