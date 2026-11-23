/* measure-climate.js - what the climate does to the sky (2026-11-22).
 *
 *     node tools/measure-climate.js [systems]
 *
 * Cloud at a place is a threshold on a noise field; climate moves the
 * threshold. The noise does not care where it is, so the long-run cloud
 * fraction at a place is just the fraction of the field that clears that
 * place's threshold - measured once here from the field itself. Per world
 * type: the mean cloud before and after (the generator's `cloud` column
 * should still mean what it was tuned to), cloud by latitude band, sea
 * against land, windward against leeward. */
global.window = global.window || global;
require('../src/vec3.js');
require('../src/rng.js');
require('../src/kepler.js');
require('../src/economy.js');
var Gen = require('../src/generate.js');
var Galaxy = require('../src/galaxy.js');
require('../src/sim.js');
var W = require('../src/weather.js');
var K = W.K;

/* The field's own distribution, location-free. */
var FIELD = [];
for (var i = 0; i < 20000; i++) FIELD.push(W.fbm(Math.random() * 400, Math.random() * 400, Math.random() * 400));
function ss(a, b, x) { var t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); }
var FRAC = [];
for (var c = 0; c <= 100; c++) {
  var th = K.THRESH_HI + (K.THRESH_LO - K.THRESH_HI) * (c / 100), s = 0;
  for (var j = 0; j < FIELD.length; j++) s += ss(th, th + K.EDGE, FIELD[j]);
  FRAC.push(s / FIELD.length);
}
function frac(cov) { cov = Math.max(0, Math.min(1, cov)); return FRAC[Math.round(cov * 100)]; }

var N = +process.argv[2] || 20;
var gal = Galaxy.build('kawartha');
var T = {};
function row(k) {
  return T[k] || (T[k] = { n: 0, before: 0, after: 0, wet: 0, pts: 0, bands: [0, 0, 0, 0, 0, 0, 0], bn: [0, 0, 0, 0, 0, 0, 0],
                           sea: 0, seaN: 0, land: 0, landN: 0, wind: 0, windN: 0, lee: 0, leeN: 0 });
}
for (var s2 = 0; s2 < N; s2++) {
  var sy = Gen.generateSystem(gal.stars[s2].seed, Galaxy.systemOpts(gal, gal.stars[s2]));
  sy.bodies.forEach(function (b) {
    if ((b.kind !== 'planet' && b.kind !== 'moon') || !b.atmosphere || !W.climateOn(b)) return;
    var r = row(b.type), cov = b.atmosphere.cloud || 0, Tt = W.terrainOf(b), k = W.spinAxis(b);
    r.n++;
    for (var q = 0; q < 600; q++) {
      var z = Math.random() * 2 - 1, a = Math.random() * 6.2832, rr = Math.sqrt(1 - z * z);
      var p = { x: rr * Math.cos(a), y: rr * Math.sin(a), z: z };
      var cl = W.climateAtFixed(b, p, 0);
      var f0 = frac(cov), f1 = frac(cov * cl.wet);
      r.before += f0; r.after += f1; r.wet += cl.wet; r.pts++;
      var lat = Math.asin(Math.max(-1, Math.min(1, p.x * k.x + p.y * k.y + p.z * k.z))) * 180 / Math.PI;
      var bi = Math.min(6, Math.floor(Math.abs(lat) / 13));
      r.bands[bi] += f1; r.bn[bi]++;
      var e = W.elevationAt(b, p), sea = Tt.ocean > 0.001 && e < Tt.ocean;
      if (sea) { r.sea += f1; r.seaN++; } else { r.land += f1; r.landN++; }
    }
  });
}
console.log('type       n   cloud before -> after   mean wet   by |lat| 0-13,13-26,26-39,39-52,52-65,65-78,78-90   sea / land');
Object.keys(T).forEach(function (k) {
  var r = T[k];
  console.log((k + '          ').slice(0, 10) + (r.n + '   ').slice(0, 4) +
              (100 * r.before / r.pts).toFixed(1) + '% -> ' + (100 * r.after / r.pts).toFixed(1) + '%      ' +
              (r.wet / r.pts).toFixed(2) + '      ' +
              r.bands.map(function (v, i) { return r.bn[i] ? Math.round(100 * v / r.bn[i]) : '-'; }).join(',') + '      ' +
              (r.seaN ? Math.round(100 * r.sea / r.seaN) : '-') + ' / ' + (r.landN ? Math.round(100 * r.land / r.landN) : '-'));
});
