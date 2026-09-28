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

if shutil.which(t.ESBUILD):
    out = t.transpile(b"const a = {b:{c:1}}; console.log(a?.b?.c ?? 2);")
    assert out is not None and b"?." not in out and b"??" not in out, out
    assert t.transpile(b"const = ;") is None  # syntax error -> passthrough
    print("ok (with esbuild)")
else:
    print("ok (esbuild not installed; transform tests skipped)")
