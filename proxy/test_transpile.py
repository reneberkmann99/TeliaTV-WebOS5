"""Run: python3 proxy/test_transpile.py  (needs esbuild on PATH)"""
import shutil
import sys
import types

sys.modules.setdefault("mitmproxy", types.ModuleType("mitmproxy"))
sys.path.insert(0, __file__.rsplit("/", 1)[0])
import transpile_addon as t

assert t.host_allowed("www.teliatv.ee") and t.host_allowed("teliatv.ee")
assert not t.host_allowed("evilteliatv.ee") and not t.host_allowed("example.com")
assert t.is_js("application/javascript; charset=utf-8") and not t.is_js("text/html")

assert t.is_script_path("/a/app.js?v=1") and not t.is_script_path("/a/page.html")

# LRU is bounded by bytes and evicts the oldest entries
t.CACHE_MAX_BYTES = 10
t._cache.clear(); t._cache_bytes = 0
for i in range(5):
    t._cache_put(str(i), b"xxxx")
assert t._cache_bytes <= 10 and list(t._cache) == ["3", "4"], (t._cache_bytes, list(t._cache))
t._cache_put("big", b"x" * 11)
assert "big" not in t._cache
t.CACHE_MAX_BYTES = 64 * 1024 * 1024
t._cache.clear(); t._cache_bytes = 0

if shutil.which(t.ESBUILD):
    out = t.transpile(b"const a = {b:{c:1}}; console.log(a?.b?.c ?? 2);")
    assert out is not None and b"?." not in out and b"??" not in out, out
    assert t.transpile(b"const = ;") is None  # syntax error -> passthrough
    print("ok (with esbuild)")
else:
    print("ok (esbuild not installed; transform tests skipped)")
