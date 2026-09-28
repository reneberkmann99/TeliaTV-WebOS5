(function () {
  // 1) JS-level UA / platform spoof (does NOT change the HTTP header)
  var UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
  try {
    Object.defineProperty(navigator, 'userAgent', { get: function () { return UA; } });
    Object.defineProperty(navigator, 'appVersion', { get: function () { return UA.slice(8); } });
    Object.defineProperty(navigator, 'platform', { get: function () { return 'Linux x86_64'; } });
  } catch (e) {}

  // 2) Runtime polyfills for APIs missing in Chrome 68 (syntax like ?. cannot be polyfilled)
  if (typeof globalThis === 'undefined') { window.globalThis = window; }
  if (!Array.prototype.flat) {
    Array.prototype.flat = function (d) {
      d = d === undefined ? 1 : d;
      return d > 0 ? this.reduce(function (a, v) { return a.concat(Array.isArray(v) ? v.flat(d - 1) : v); }, []) : this.slice();
    };
  }
  if (!Array.prototype.flatMap) { Array.prototype.flatMap = function (f, t) { return this.map(f, t).flat(); }; }
  if (!Object.fromEntries) {
    Object.fromEntries = function (it) { var o = {}; for (var p of it) { o[p[0]] = p[1]; } return o; };
  }

  // 3) LG remote keys -> behaviour the web player understands
  var map = {
    461: 'Escape',      // BACK
    415: ' ',           // PLAY
    19: ' ',            // PAUSE
    413: 'Escape',      // STOP
    412: 'ArrowLeft',   // REW
    417: 'ArrowRight',  // FF
    33: 'PageUp',       // CH+
    34: 'PageDown'      // CH-
  };
  document.addEventListener('keydown', function (ev) {
    var k = map[ev.keyCode];
    if (!k || !ev.isTrusted) { return; }
    if (ev.keyCode === 461 && history.length > 1) { history.back(); ev.preventDefault(); return; }
    var v = document.querySelector('video');
    if ((ev.keyCode === 415 || ev.keyCode === 19) && v) {
      if (ev.keyCode === 415) { v.play(); } else { v.pause(); }
      ev.preventDefault();
      return;
    }
    if (document.activeElement) {
      document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
    }
  }, true);
})();
