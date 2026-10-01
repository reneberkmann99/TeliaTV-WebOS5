"""Run: python3 proxy/test_transpile.py  (transform tests need esbuild on PATH)"""
import asyncio
import os
import shutil
import stat
import sys
import tempfile
import time
import types

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import transpile_addon as t


def reset_cache(limit=64 * 1024 * 1024):
    t.CACHE_MAX_BYTES = limit
    t._cache.clear()
    t._cache_bytes = 0


def check(cond, msg):
    if not cond:
        raise AssertionError(msg)


check(t.host_allowed("www.teliatv.ee") and t.host_allowed("teliatv.ee"), "allow-listed hosts")
check(not t.host_allowed("evilteliatv.ee") and not t.host_allowed("example.com"), "other hosts rejected")
check(t.is_js("application/javascript; charset=utf-8") and not t.is_js("text/html"), "content-type check")

# LRU is bounded by bytes and evicts the oldest entries
reset_cache(10)
for i in range(5):
    t._cache_put(str(i), b"xxxx")
check(t._cache_bytes <= 10 and list(t._cache) == ["3", "4"], (t._cache_bytes, list(t._cache)))
t._cache_put("big", b"x" * 11)
check("big" not in t._cache, "oversized entry not cached")
# Replacing an entry doesn't double-count its size
t._cache_put("4", b"yy")
check(t._cache_bytes == 6, ("replace accounting", t._cache_bytes))
reset_cache()


# request(): conditional headers are dropped for every GET on allowed hosts, including extensionless URLs
def fake_flow(host, path, method="GET"):
    headers = {"if-none-match": '"abc"', "if-modified-since": "Mon, 01 Jan 2024 00:00:00 GMT"}
    return types.SimpleNamespace(request=types.SimpleNamespace(method=method, pretty_host=host, path=path, headers=headers))


for path in ("/static/app.js?v=1", "/_next/static/chunks/main"):
    f = fake_flow("www.teliatv.ee", path)
    t.request(f)
    check(not f.request.headers, ("headers stripped", path))
f = fake_flow("cdn.example.com", "/app.js")
t.request(f)
check(len(f.request.headers) == 2, "other hosts untouched")


def stub(script):
    """Create an executable stand-in for esbuild and point the addon at it."""
    d = tempfile.mkdtemp()
    p = os.path.join(d, "esbuild")
    with open(p, "w") as fh:
        fh.write("#!/bin/sh\n" + script)
    os.chmod(p, os.stat(p).st_mode | stat.S_IEXEC)
    return p


real_esbuild = t.ESBUILD

# Timeouts are cached: the second request returns at once instead of waiting again
t.ESBUILD, t.TIMEOUT = stub("sleep 5\n"), 0.3
start = time.monotonic()
check(asyncio.run(t.transpile(b"var slow = 1;")) is None, "timeout -> None")
check(asyncio.run(t.transpile(b"var slow = 1;")) is None, "cached timeout -> None")
check(time.monotonic() - start < 2, "timeout cached")

# A missing esbuild isn't cached, so installing it later works
reset_cache()
t.ESBUILD = "/nonexistent/esbuild"
check(asyncio.run(t.transpile(b"var a = 1;")) is None and not t._cache, "missing esbuild not cached")


# Concurrent requests share one esbuild run, and the event loop keeps running meanwhile
async def concurrent():
    ticks = 0

    async def ticker():
        nonlocal ticks
        while True:
            await asyncio.sleep(0.05)
            ticks += 1

    tick_task = asyncio.ensure_future(ticker())
    results = await asyncio.gather(*(t.transpile(b"shared") for _ in range(3)))
    tick_task.cancel()
    return results, ticks


reset_cache()
counter = os.path.join(tempfile.mkdtemp(), "runs")
t.ESBUILD, t.TIMEOUT = stub(f"echo run >> {counter}\nsleep 0.5\ncat\n"), 5
results, ticks = asyncio.run(concurrent())
check(results == [b"shared"] * 3, results)
check(open(counter).read().count("run") == 1, "one esbuild run for identical scripts")
check(ticks >= 5, ("event loop kept running", ticks))



# Cancelling one flow doesn't fail the others sharing the same run
async def cancel_one():
    a = asyncio.ensure_future(t.transpile(b"cancel-me"))
    b = asyncio.ensure_future(t.transpile(b"cancel-me"))
    await asyncio.sleep(0.1)
    a.cancel()
    return await b, a.cancelled()


reset_cache()
t.ESBUILD, t.TIMEOUT = stub("sleep 0.5\ncat\n"), 5
result, a_cancelled = asyncio.run(cancel_one())
check(a_cancelled and result == b"cancel-me", ("peer survives cancellation", result, a_cancelled))
check(not t._inflight and t._cache.get(next(iter(t._cache))) == b"cancel-me", "result cached, inflight cleared")

# Distinct scripts are limited to TRANSPILE_JOBS concurrent esbuild runs
async def distinct(n):
    return await asyncio.gather(*(t.transpile(b"job%d" % i) for i in range(n)))


reset_cache()
log = os.path.join(tempfile.mkdtemp(), "jobs")
t.ESBUILD, t.TIMEOUT, t.JOBS = stub(f"echo start >> {log}\nsleep 0.2\necho end >> {log}\ncat\n"), 5, 1
check(asyncio.run(distinct(3)) == [b"job0", b"job1", b"job2"], "distinct jobs complete")
check(open(log).read().split() == ["start", "end"] * 3, ("one esbuild at a time", open(log).read().split()))
t.JOBS = 4

t.ESBUILD, t.TIMEOUT = real_esbuild, 60
reset_cache()
if shutil.which(t.ESBUILD):
    out = asyncio.run(t.transpile(b"const a = {b:{c:1}}; console.log(a?.b?.c ?? 2);"))
    check(out is not None and b"?." not in out and b"??" not in out, out)
    check(asyncio.run(t.transpile(b"const = ;")) is None, "syntax error -> passthrough")
    print("ok (with esbuild)")
else:
    print("ok (esbuild not installed; transform tests skipped)")
