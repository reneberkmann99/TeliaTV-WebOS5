(function () {
  // 1) JS-level UA / platform spoof (does NOT change the HTTP header)
  var UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
  try {
    Object.defineProperty(navigator, 'userAgent', { get: function () { return UA; } });
    Object.defineProperty(navigator, 'appVersion', { get: function () { return UA.slice(8); } });
    Object.defineProperty(navigator, 'platform', { get: function () { return 'Linux x86_64'; } });
  } catch (e) {}

  // 2) Runtime polyfills for APIs missing in Chrome 68 (syntax like ?. cannot be polyfilled).
  // Defined non-enumerable like the native versions, so for...in loops don't see them.
  function define(obj, name, value) {
    if (!(name in obj)) {
      Object.defineProperty(obj, name, { value: value, writable: true, configurable: true, enumerable: false });
    }
  }
  define(window, 'globalThis', window);
  // Appends the elements of `src` to `out`, flattening nested arrays up to `depth`.
  // Holes are skipped, as in the native flat().
  function flatInto(out, src, depth) {
    for (var i = 0; i < src.length; i++) {
      if (!(i in src)) { continue; }
      var v = src[i];
      if (depth > 0 && Array.isArray(v)) { flatInto(out, v, depth - 1); } else { out.push(v); }
    }
    return out;
  }
  define(Array.prototype, 'flat', function (depth) {
    var d = depth === undefined ? 1 : Math.trunc(Number(depth));
    return flatInto([], Object(this), d > 0 ? d : 0);
  });
  define(Array.prototype, 'flatMap', function (fn, thisArg) {
    var src = Object(this);
    var out = [];
    for (var i = 0; i < src.length; i++) {
      if (!(i in src)) { continue; }
      var v = fn.call(thisArg, src[i], i, src);
      if (Array.isArray(v)) { flatInto(out, v, 0); } else { out.push(v); }
    }
    return out;
  });
  define(Object, 'fromEntries', function (entries) {
    var o = {};
    Array.from(entries, function (p) { o[p[0]] = p[1]; });
    return o;
  });

  // 3) LG remote keys -> keys the web player understands.
  // BACK (461) is left to webOS, which follows the page's real history (see appinfo.json).
  var map = {
    413: { key: 'Escape', code: 'Escape', keyCode: 27 },          // STOP
    412: { key: 'ArrowLeft', code: 'ArrowLeft', keyCode: 37 },    // REW
    417: { key: 'ArrowRight', code: 'ArrowRight', keyCode: 39 },  // FF
    33: { key: 'PageUp', code: 'PageUp', keyCode: 33 },           // CH+
    34: { key: 'PageDown', code: 'PageDown', keyCode: 34 }        // CH-
  };

  // The main player: the largest visible <video> that has media loaded.
  function mainVideo() {
    var best = null;
    var bestArea = 0;
    var videos = document.querySelectorAll('video');
    for (var i = 0; i < videos.length; i++) {
      var v = videos[i];
      var area = v.clientWidth * v.clientHeight;
      if (v.readyState > 0 && area > bestArea) { best = v; bestArea = area; }
    }
    return best;
  }

  function sendKey(target, k) {
    var ev = new KeyboardEvent('keydown', { key: k.key, code: k.code, bubbles: true, cancelable: true });
    // keyCode/which are legacy init fields some engines ignore; set them on the instance instead.
    Object.defineProperty(ev, 'keyCode', { get: function () { return k.keyCode; } });
    Object.defineProperty(ev, 'which', { get: function () { return k.keyCode; } });
    target.dispatchEvent(ev);
  }

  document.addEventListener('keydown', function (ev) {
    if (!ev.isTrusted) { return; }
    if (ev.keyCode === 415 || ev.keyCode === 19) {  // PLAY / PAUSE
      var v = mainVideo();
      if (!v) { return; }
      if (ev.keyCode === 415) {
        var p = v.play();
        if (p && p.catch) { p.catch(function () {}); }
      } else {
        v.pause();
      }
      ev.preventDefault();
      return;
    }
    var k = map[ev.keyCode];
    // Skip if the TV already delivers this key natively (e.g. CH+ as PageUp), to avoid a double action.
    if (!k || ev.key === k.key) { return; }
    sendKey(document.activeElement || document.body, k);
  }, true);
})();
