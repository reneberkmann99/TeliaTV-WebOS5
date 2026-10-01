// Tests for teliatv-wrapper/webOSUserScripts/userScript.js. Run: node tests/userscript.test.js
// The script runs in a sandbox where Chrome 68's missing APIs are removed and the DOM is stubbed.
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const src = fs.readFileSync(path.join(__dirname, '../teliatv-wrapper/webOSUserScripts/userScript.js'), 'utf8');
const native = { flat: Array.prototype.flat, flatMap: Array.prototype.flatMap, fromEntries: Object.fromEntries };
delete Array.prototype.flat;
delete Array.prototype.flatMap;
delete Object.fromEntries;

class KeyboardEvent {
  constructor(type, init) { this.type = type; Object.assign(this, init); this.isTrusted = false; }
}
const dispatched = [];
let listener = null;
let videos = [];
const body = { dispatchEvent: (ev) => dispatched.push(ev) };
const document = {
  body,
  activeElement: body,
  addEventListener: (type, fn) => { if (type === 'keydown') listener = fn; },
  querySelectorAll: () => videos,
};
const window = {};
new Function('window', 'navigator', 'document', 'KeyboardEvent', src)(window, {}, document, KeyboardEvent);

let failures = 0;
function test(name, fn) {
  try { fn(); console.log('ok  ', name); } catch (e) { failures++; console.log('FAIL', name, '\n     ', e.message); }
}
const trusted = (keyCode, key) => ({ keyCode, key, isTrusted: true, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } });

test('polyfills are not enumerable', () => {
  const keys = []; for (const k in ['a', 'b']) keys.push(k);
  assert.deepStrictEqual(keys, ['0', '1']);
  assert.strictEqual(Object.getOwnPropertyDescriptor(Object, 'fromEntries').enumerable, false);
  assert.strictEqual(window.globalThis, window);
});

test('flat matches native', () => {
  const cases = [
    [[1, [2, [3, [4]]]], undefined], [[1, [2, [3, [4]]]], Infinity], [[1, , 3, [4, , 6]], 1],
    [[[1], [2]], 0], [[1, [2]], -1], [[1, [2, [3]]], '2'], [[1, [2, [3]]], 1.5], [[1, [2]], NaN],
  ];
  for (const [arr, d] of cases) {
    assert.deepStrictEqual(Array.prototype.flat.call(arr, d), native.flat.call(arr, d), `flat(${String(d)}) of ${JSON.stringify(arr)}`);
  }
  const arrayLike = { length: 2, 0: [1], 1: 2 };
  assert.deepStrictEqual(Array.prototype.flat.call(arrayLike), native.flat.call(arrayLike));
});

test('flatMap matches native', () => {
  const f = (x, i) => (x % 2 ? [x, [i]] : []);
  const arr = [1, 2, 3, , 5];
  assert.deepStrictEqual(Array.prototype.flatMap.call(arr, f), native.flatMap.call(arr, f));
  const growing = [1, 2];
  assert.deepStrictEqual(growing.flatMap((x) => { growing.push(x); return [x]; }), [1, 2], 'length snapshotted');
  assert.deepStrictEqual(Array.prototype.flatMap.call({ length: -1 }, (x) => x), [], 'negative length clamps to 0');
  assert.deepStrictEqual(Array.prototype.flat.call({ length: -1 }), [], 'negative length clamps to 0 (flat)');
  assert.throws(() => [].flatMap(null), TypeError, 'non-callable callback throws even when empty');
  assert.throws(() => Array.prototype.flat.call(null), TypeError, 'flat on null receiver throws');
  assert.throws(() => Array.prototype.flatMap.call(undefined, (x) => x), TypeError, 'flatMap on undefined receiver throws');
  const self = { k: 10 };
  assert.deepStrictEqual([1].flatMap(function (x) { return [x + this.k]; }, self), [11]);
});

test('flat is linear (40k one-element arrays < 200 ms)', () => {
  const many = Array.from({ length: 40000 }, (_, i) => [i]);
  const t = Date.now();
  assert.strictEqual(many.flat().length, 40000);
  assert.strictEqual(many.flatMap((x) => x).length, 40000);
  const ms = Date.now() - t;
  assert.ok(ms < 200, `took ${ms} ms`);
});

test('fromEntries', () => {
  assert.deepStrictEqual(Object.fromEntries(new Map([['a', 1], ['b', 2]])), { a: 1, b: 2 });
  assert.deepStrictEqual(Object.fromEntries([['x', 3]]), { x: 3 });
  assert.throws(() => Object.fromEntries({ 0: ['x', 1], length: 1 }), TypeError, 'array-like is not iterable');
  assert.throws(() => Object.fromEntries(null), TypeError, 'null entries');
  assert.throws(() => Object.fromEntries(['ab']), TypeError, 'primitive entry');
  let reads = 0;
  const once = { get [Symbol.iterator]() { reads++; return reads === 1 ? function* () { yield ['k', 1]; } : undefined; } };
  assert.deepStrictEqual(Object.fromEntries(once), { k: 1 }, 'iterator method read once');
  let closed = false;
  const closing = { [Symbol.iterator]() { return { next: () => ({ value: 'bad', done: false }), return: () => { closed = true; return {}; } }; } };
  assert.throws(() => Object.fromEntries(closing), TypeError);
  assert.ok(closed, 'iterator closed on error');
  const evil = Object.fromEntries([['__proto__', { polluted: true }]]);
  assert.strictEqual(Object.getPrototypeOf(evil), Object.prototype, '__proto__ key does not change the prototype');
  assert.deepStrictEqual(Object.getOwnPropertyDescriptor(evil, '__proto__').value, { polluted: true });
  assert.strictEqual(evil.polluted, undefined);
});

test('BACK (461) is left to webOS', () => {
  dispatched.length = 0;
  const ev = trusted(461, 'Unidentified');
  listener(ev);
  assert.strictEqual(dispatched.length, 0);
  assert.strictEqual(ev.defaultPrevented, false);
});

test('mapped keys carry key, code, keyCode and which', () => {
  dispatched.length = 0;
  listener(trusted(412, 'MediaRewind'));
  assert.strictEqual(dispatched.length, 1);
  const ev = dispatched[0];
  assert.strictEqual(ev.key, 'ArrowLeft');
  assert.strictEqual(ev.code, 'ArrowLeft');
  assert.strictEqual(ev.keyCode, 37);
  assert.strictEqual(ev.which, 37);
  assert.strictEqual(ev.cancelable, true);
});

test('no re-send when the native key already matches (CH+ as PageUp)', () => {
  dispatched.length = 0;
  listener(trusted(33, 'PageUp'));
  assert.strictEqual(dispatched.length, 0);
  listener(trusted(33, 'Unidentified'));
  assert.strictEqual(dispatched.length, 1);
  // Normalized key but LG keyCode: keyCode-based handlers still need the remapped event
  listener(trusted(412, 'ArrowLeft'));
  assert.strictEqual(dispatched.length, 2);
  assert.strictEqual(dispatched[1].keyCode, 37);
});

test('synthetic events are ignored', () => {
  dispatched.length = 0;
  listener({ keyCode: 412, key: 'MediaRewind', isTrusted: false });
  assert.strictEqual(dispatched.length, 0);
});

test('PLAY/PAUSE drive the largest loaded video', () => {
  const calls = [];
  const mk = (name, w, h, readyState) => ({
    clientWidth: w, clientHeight: h, readyState,
    play() { calls.push(name + '.play'); return Promise.reject(new Error('AbortError')); },
    pause() { calls.push(name + '.pause'); },
  });
  videos = [mk('preview', 320, 180, 4), mk('main', 1920, 1080, 4), mk('empty', 3840, 2160, 0)];
  const play = trusted(415, 'MediaPlay');
  listener(play);
  listener(trusted(19, 'Pause'));
  assert.deepStrictEqual(calls, ['main.play', 'main.pause']);
  assert.strictEqual(play.defaultPrevented, true);
  videos = [];
  const none = trusted(415, 'MediaPlay');
  listener(none);
  assert.strictEqual(none.defaultPrevented, false);
});

process.on('exit', () => {
  console.log(failures ? `${failures} failed` : 'all passed');
  if (failures) process.exitCode = 1;
});
