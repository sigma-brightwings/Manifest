/* measure-low.js - how much sky the low layer (stratus, sea fog) takes
 * (2026-11-22). Like measure-climate: the field does not care where it
 * is, so the cover at a given cut is the fraction of the field that
 * clears it - measured from the field itself, at the dry cut, the wet
 * one, and between.
 *
 *     node tools/measure-low.js
 */
global.window = global.window || global;
var W = require('../src/weather.js');
var K = W.K;
function ss(a, b, x) { var t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); }
var F = [];
for (var i = 0; i < 40000; i++) F.push(W.fbm2(Math.random() * 400, Math.random() * 400, Math.random() * 400) * 1.25);
var m = 0, mx = 0;
F.forEach(function (v) { m += v; mx = Math.max(mx, v); });
m /= F.length;
var sd = 0;
F.forEach(function (v) { sd += (v - m) * (v - m); });
sd = Math.sqrt(sd / F.length);
console.log('low field: mean ' + m.toFixed(3) + ' sd ' + sd.toFixed(3) + ' max ' + mx.toFixed(3));
[0, 0.25, 0.5, 0.75, 1].forEach(function (wet) {
  var cut = K.LOW_CUT_HI + (K.LOW_CUT_LO - K.LOW_CUT_HI) * wet, s = 0;
  F.forEach(function (v) { s += ss(cut, cut + K.EDGE, v); });
  console.log('wetSea ' + wet.toFixed(2) + '  cut ' + cut.toFixed(3) + '  low cover ' + (100 * s / F.length).toFixed(1) + '%');
});
