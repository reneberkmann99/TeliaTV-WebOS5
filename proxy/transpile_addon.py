"""mitmproxy addon: down-level teliatv.ee JavaScript to a Chromium 68 target.

Run:  mitmdump -s proxy/transpile_addon.py --listen-port 8080
Needs `esbuild` on PATH (npm i -g esbuild) or ESBUILD=/path/to/esbuild.

Only JavaScript responses from allow-listed hosts are rewritten. Everything else
(HTML, JSON, license requests, media segments) is passed through untouched.
Experimental personal tool: it breaks whenever Telia ships a new build.
"""
import asyncio
import hashlib
import os
import signal
from collections import OrderedDict

ESBUILD = os.environ.get("ESBUILD", "esbuild")
TARGET = os.environ.get("TRANSPILE_TARGET", "chrome68")
# Comma-separated host suffixes whose scripts may be rewritten.
HOSTS = tuple(h.strip().lower() for h in os.environ.get("TRANSPILE_HOSTS", "teliatv.ee").split(",") if h.strip())
MAX_BYTES = int(os.environ.get("TRANSPILE_MAX_BYTES", str(20 * 1024 * 1024)))
TIMEOUT = float(os.environ.get("TRANSPILE_TIMEOUT", "60"))
# Max esbuild processes at once (each can use a lot of CPU and memory on a small proxy host).
JOBS = max(1, int(os.environ.get("TRANSPILE_JOBS", str(min(4, os.cpu_count() or 1)))))

CACHE_MAX_BYTES = int(os.environ.get("TRANSPILE_CACHE_BYTES", str(64 * 1024 * 1024)))

# LRU of transpile results (None = esbuild failed or timed out), bounded by total output bytes.
_cache = OrderedDict()
_cache_bytes = 0
# Transpiles in progress, so concurrent requests for the same script share one esbuild run.
_inflight = {}
_sem = None
_sem_loop = None


def _semaphore():
    """Semaphore limiting concurrent esbuild runs, created for the running event loop."""
    global _sem, _sem_loop
    loop = asyncio.get_running_loop()
    if _sem is None or _sem_loop is not loop:
        _sem, _sem_loop = asyncio.Semaphore(JOBS), loop
    return _sem


def _size(out):
    return len(out) if out else 0


def _cache_put(key, out):
    global _cache_bytes
    if key in _cache:
        _cache_bytes -= _size(_cache.pop(key))
    size = _size(out)
    if size > CACHE_MAX_BYTES:
        return  # too big to cache; recompute next time
    _cache[key] = out
    _cache_bytes += size
    while _cache_bytes > CACHE_MAX_BYTES and _cache:
        _, old = _cache.popitem(last=False)
        _cache_bytes -= _size(old)


def host_allowed(host):
    host = (host or "").lower()
    return any(host == h or host.endswith("." + h) for h in HOSTS)


def is_js(content_type):
    ct = (content_type or "").split(";")[0].strip().lower()
    return ct in ("application/javascript", "text/javascript", "application/x-javascript", "application/ecmascript")


async def _run_esbuild(source):
    """Return (output or None, cacheable).

    Syntax errors and timeouts are cacheable, so the same bundle isn't retried on every
    request. A missing esbuild is not, so installing it takes effect without a restart.
    """
    try:
        proc = await asyncio.create_subprocess_exec(
            ESBUILD, "--target=" + TARGET, "--log-level=error",
            stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
            start_new_session=True,  # own process group, so a timeout kills any children too
        )
    except OSError:
        return None, False
    try:
        out, _ = await asyncio.wait_for(proc.communicate(source), TIMEOUT)
    except asyncio.TimeoutError:
        await _kill(proc)
        return None, True
    except asyncio.CancelledError:  # e.g. proxy shutting down: don't leave esbuild running
        await _kill(proc)
        raise
    return (out if proc.returncode == 0 and out else None), True


async def _kill(proc):
    try:
        if hasattr(os, "killpg"):
            os.killpg(proc.pid, signal.SIGKILL)
        else:  # Windows: no process groups
            proc.kill()
    except ProcessLookupError:
        pass
    await proc.wait()


async def _job(key, source):
    """One esbuild run shared by every flow that requested this script."""
    try:
        async with _semaphore():  # the timeout starts once a slot is free, not while queued
            out, cacheable = await _run_esbuild(source)
        if cacheable:
            _cache_put(key, out)
        return out
    finally:
        _inflight.pop(key, None)


async def transpile(source):
    """Return down-levelled source, or None if it can't be transpiled.

    Runs esbuild without blocking mitmproxy's event loop, so other flows keep moving.
    """
    key = hashlib.sha256(source).hexdigest()
    if key in _cache:
        _cache.move_to_end(key)
        return _cache[key]
    task = _inflight.get(key)
    if task is None:
        task = _inflight[key] = asyncio.ensure_future(_job(key, source))
    # shield: if one flow is cancelled (client aborted), the shared run keeps going for the others.
    return await asyncio.shield(task)


def request(flow):
    """Drop conditional headers on allow-listed hosts so a cached original script is
    re-fetched in full (200, not 304). Scripts are recognised by Content-Type only in the
    response, so this applies to every GET on those hosts, not just *.js paths."""
    req = flow.request
    if req.method == "GET" and host_allowed(req.pretty_host):
        req.headers.pop("if-none-match", None)
        req.headers.pop("if-modified-since", None)


async def response(flow):
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
    out = await transpile(body)
    if out is None:
        return  # leave the original response alone
    resp.set_content(out)  # re-encodes per Content-Encoding handling, fixes length
    resp.headers["x-transpiled-by"] = "teliatv-webos5"
