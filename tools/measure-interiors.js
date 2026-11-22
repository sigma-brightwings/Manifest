/* measure-interiors.js - what Interior.of() makes of the galaxy (2026-11-22).
 *
 *     node tools/measure-interiors.js [systems]
 *
 * Slice 1 of the planetary interiors plan: before anything reads the
 * interior, count what it says, per type - dynamo share against today's
 * rolled field, crust and Curie ranges, heat, compositions, how many masses
 * a coil could hear - and list every world WITH A PORT that would gain or
 * lose a field when slice 6 rebuilds the field from the core, since those
 * are the ones players have seen. Measured, not guessed, then tuned. */
global.window = global.window || global;
require('../src/vec3.js');
require('../src/rng.js');
require('../src/kepler.js');
require('../src/economy.js');
var Gen = require('../src/generate.js');
var Galaxy = require('../src/galaxy.js');
require('../src/rings.js');
require('../src/sim.js');
require('../src/weather.js');
var Sv = require('../src/survey.js');
require('../src/gravity.js');
var In = require('../src/interior.js');

var N = +process.argv[2] || 120;
var gal = Galaxy.build('kawartha');
var T = {}, ported = [], comps = {}, nul = 0, worlds = 0;
function row(k) {
  return T[k] || (T[k] = { n: 0, had: 0, dyn: 0, both: 0, gain: 0, lose: 0,
                           crust: [1e9, 0], curie: [1e9, 0], heat: [1e9, 0], inner: [1e9, 0],
                           bodies: 0, magnetic: 0, deepSilent: 0, ice: 0, remn: 0, ocean: 0 });
}
function rng2(r, v) { if (v < r[0]) r[0] = v; if (v > r[1]) r[1] = v; }
function portsOn(b, sy) {
  return (sy.bodies || []).filter(function (p) {
    if (p.kind !== 'station') return false;
    var host = p.parentBody ? (p.parentBody.id || p.parentBody) : (p.orbit && p.orbit.parent);
    return host === b.id;
  });
}
var n = Math.min(N, gal.stars.length);
for (var s = 0; s < n; s++) {
  var sy = Gen.generateSystem(gal.stars[s].seed, Galaxy.systemOpts(gal, gal.stars[s]));
  sy.bodies.forEach(function (b) {
    if (b.kind !== 'planet' && b.kind !== 'moon') return;
    worlds++;
    var I = In.of(b, sy);
    if (!I) { nul++; return; }
    var r = row(I.type), had = !!b.magnetosphere;
    r.n++; if (had) r.had++; if (I.dynamo) r.dyn++;
    if (had && I.dynamo) r.both++;
    if (!had && I.dynamo) r.gain++;
    if (had && !I.dynamo) r.lose++;
    rng2(r.crust, I.shellKm || I.crustKm);
    if (I.curieKm != null) rng2(r.curie, I.curieKm);
    rng2(r.heat, I.heat); rng2(r.inner, I.innerFrac);
    if (I.remanence > 0) r.remn++;
    if (I.oceanKm > 0) r.ocean++;
    I.bodies.forEach(function (m) {
      r.bodies++; comps[m.comp] = (comps[m.comp] || 0) + 1;
      if (m.magnetic) r.magnetic++;
      if (m.mag > 0 && !m.aboveCurie) r.deepSilent++;
      if (m.comp === 'ice') r.ice++;
    });
    if (had !== I.dynamo && portsOn(b, sy).length) {
      ported.push((I.dynamo ? 'GAIN ' : 'LOSE ') + gal.stars[s].name + ' / ' + (b.name || b.id) +
                  ' (' + I.type + ', heat ' + I.heat.toFixed(2) + ', shell ' + I.outerShell.toFixed(2) +
                  ', spin x' + I.spin.toFixed(2) + ')');
    }
  });
}
function pct(a, b) { return b ? Math.round(100 * a / b) + '%' : '-'; }
function rg(r, d) { return r[0] > r[1] ? '-' : r[0].toFixed(d) + '-' + r[1].toFixed(d); }
console.log(worlds + ' worlds in ' + n + ' systems' + (nul ? ', ' + nul + ' with no interior' : ''));
console.log('type        n   field now  dynamo  agree  gain  lose   crust/shell km  curie km   heat       inner    remn  ocean  bodies  coil-hears  silent<curie  ice');
Object.keys(T).sort().forEach(function (k) {
  var r = T[k];
  console.log(k.padEnd(10) + String(r.n).padStart(4) + '   ' + pct(r.had, r.n).padStart(6) + '   ' +
              pct(r.dyn, r.n).padStart(6) + '  ' + pct(r.n - r.gain - r.lose, r.n).padStart(5) + '  ' +
              String(r.gain).padStart(4) + '  ' + String(r.lose).padStart(4) + '   ' +
              rg(r.crust, 0).padStart(13) + '  ' + rg(r.curie, 0).padStart(9) + '  ' + rg(r.heat, 2).padStart(9) + '  ' +
              rg(r.inner, 2).padStart(9) + '  ' + String(r.remn).padStart(4) + '  ' + String(r.ocean).padStart(5) + '  ' +
              String(r.bodies).padStart(6) + '  ' + String(r.magnetic).padStart(10) + '  ' +
              String(r.deepSilent).padStart(12) + '  ' + String(r.ice).padStart(3));
});
console.log('compositions: ' + JSON.stringify(comps));
console.log('ported worlds whose field would change (' + ported.length + '):');
ported.forEach(function (l) { console.log('  ' + l); });
