// Paste into the DevTools console of the running wrapper (ares-inspect).
// Reports which Widevine / PlayReady robustness levels EME grants.
(function () {
  if (!navigator.requestMediaKeySystemAccess) {
    console.log('NO EME: navigator.requestMediaKeySystemAccess is missing (insecure context or disabled)');
    return;
  }
  function cfg(robustness) {
    return [{
      initDataTypes: ['cenc'],
      videoCapabilities: [{ contentType: 'video/mp4; codecs="avc1.640028"', robustness: robustness }],
      audioCapabilities: [{ contentType: 'audio/mp4; codecs="mp4a.40.2"', robustness: robustness }]
    }];
  }
  var probes = [
    ['com.widevine.alpha', ['', 'SW_SECURE_CRYPTO', 'SW_SECURE_DECODE', 'HW_SECURE_CRYPTO', 'HW_SECURE_DECODE', 'HW_SECURE_ALL']],
    ['com.microsoft.playready', ['']],
    ['com.microsoft.playready.recommendation', ['', '2000', '3000']]
  ];
  probes.forEach(function (p) {
    p[1].forEach(function (r) {
      var label = p[0] + (r ? ' ' + r : ' (any robustness)');
      navigator.requestMediaKeySystemAccess(p[0], cfg(r))
        .then(function () { console.log('OK ', label); })
        .catch(function (e) { console.log('NO ', label, e.name); });
    });
  });
})();
