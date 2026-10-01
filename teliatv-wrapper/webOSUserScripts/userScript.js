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
  // Native-style ToLength: negative, NaN and missing lengths become 0 (no unsigned wrap-around).
  function toLength(x) {
    var n = Math.trunc(Number(x));
    return n > 0 ? Math.min(n, 9007199254740991) : 0;
  }
  // Appends the elements of `src` to `out`, flattening nested arrays up to `depth`.
  // Holes are skipped, as in the native flat().
  function flatInto(out, src, depth) {
    // Length is read once, as in the native method, so a source that grows during the loop can't loop forever.
    for (var i = 0, len = toLength(src.length); i < len; i++) {
      if (!(i in src)) { continue; }
      var v = src[i];
      if (depth > 0 && Array.isArray(v)) { flatInto(out, v, depth - 1); } else { out.push(v); }
    }
    return out;
  }
  // Strict mode keeps a null/undefined receiver as-is (sloppy mode would substitute window).
  function toObject(value, method) {
    if (value == null) { throw new TypeError('Array.prototype.' + method + ' called on null or undefined'); }
    return Object(value);
  }
  define(Array.prototype, 'flat', function (depth) {
    'use strict';
    var src = toObject(this, 'flat');
    var d = depth === undefined ? 1 : Math.trunc(Number(depth));
    return flatInto([], src, d > 0 ? d : 0);
  });
  define(Array.prototype, 'flatMap', function (fn, thisArg) {
    'use strict';
    var src = toObject(this, 'flatMap');
    if (typeof fn !== 'function') { throw new TypeError('flatMap callback must be a function'); }
    var out = [];
    for (var i = 0, len = toLength(src.length); i < len; i++) {
      if (!(i in src)) { continue; }
      var v = fn.call(thisArg, src[i], i, src);
      if (Array.isArray(v)) { flatInto(out, v, 0); } else { out.push(v); }
    }
    return out;
  });
  define(Object, 'fromEntries', function (entries) {
    // Like native: entries must be iterable (no array-like fallback) and each entry an object.
    // The iterator method is read once and then used directly.
    var method = entries == null ? undefined : entries[Symbol.iterator];
    if (typeof method !== 'function') { throw new TypeError('Object.fromEntries requires an iterable'); }
    var it = method.call(entries);
    var next = it.next;  // read once, like native
    var o = {};
    try {
      for (;;) {
        var step = next.call(it);
        if (step.done) { break; }
        var p = step.value;
        if (Object(p) !== p) { throw new TypeError('Object.fromEntries: entry is not an object'); }
        // defineProperty, not assignment: a "__proto__" key must become an own property, not set the prototype.
        Object.defineProperty(o, p[0], { value: p[1], writable: true, enumerable: true, configurable: true });
      }
    } catch (e) {
      // Close the iterator on any error, including from next(); this matches Chrome's native behaviour.
      try {
        var ret = it['return'];  // read once
        if (typeof ret === 'function') { ret.call(it); }
      } catch (ignored) {}
      throw e;
    }
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
    // Skip only if the TV already delivers this exact key natively (e.g. CH+ as key PageUp with keyCode 33),
    // to avoid a double action. `code` isn't compared: it is often empty on TV remotes, and re-sending
    // would then fire key- and keyCode-based handlers twice.
    if (!k || (ev.key === k.key && ev.keyCode === k.keyCode)) { return; }
    sendKey(document.activeElement || document.body, k);
  }, true);
})();
