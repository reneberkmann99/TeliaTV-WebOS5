// Paste into the DevTools console of the running wrapper (ares-inspect).
// Reports Widevine / PlayReady availability via EME.
(function () {
  var cfg = [{
    initDataTypes: ['cenc'],
    videoCapabilities: [{ contentType: 'video/mp4; codecs="avc1.640028"', robustness: '' }],
    audioCapabilities: [{ contentType: 'audio/mp4; codecs="mp4a.40.2"' }]
  }];
  ['com.widevine.alpha', 'com.microsoft.playready'].forEach(function (ks) {
    navigator.requestMediaKeySystemAccess(ks, cfg)
      .then(function (a) { console.log('OK', ks, a.getConfiguration()); })
      .catch(function (e) { console.log('NO', ks, e.name); });
  });
})();
