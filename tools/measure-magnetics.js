/* measure-magnetics.js - what slice 3 would do to the magnetic map (2026-11-22).
 *
 *     node tools/measure-magnetics.js [systems]
 *
 * Today the magnetometer's anomaly is the ore-grade map: every metal
 * province is a bump, whatever it is made of and however deep. Slice 3
 * reads the buried bodies instead - magnetic compositions only, above the
 * Curie depth, falling off as 1/depth^3. Before switching, count how many
 * of today's province highs survive, weaken or vanish, and how many new
 * highs from buried bodies appear, since players may already be using the
 * old highs as a prospecting shortcut. */
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
var ANOMALY = 0.30, ORE_FLOOR = 0.12, SEEN = 0.01;   // 0.01 = 500 nT, about one ramp step
var gal = Galaxy.build('kawartha');
var C = { prov: 0, kept: 0, weak: 0, gone: 0, goneCurie: 0, goneComp: 0,
          byComp: {}, buried: 0, buriedSeen: 0, worlds: 0, minePorts: 0, minePortsGone: 0 };
var n = Math.min(N, gal.stars.length);
function cellOf(c) { return Sv.cellOfLatLon(Math.asin(c[2]), Math.atan2(c[1], c[0])); }
for (var s = 0; s < n; s++) {
  var sy = Gen.generateSystem(gal.stars[s].seed, Galaxy.systemOpts(gal, gal.stars[s]));
  sy.bodies.forEach(function (b) {
    if (b.kind !== 'planet' && b.kind !== 'moon') return;
    var gm = Sv.groundMap(b, sy), I = In.of(b, sy);
    if (!gm || !I || !gm.grade.ores) return;
    var wg = gm.world.ores;
    if (!(wg > 0)) return;
    C.worlds++;
    I.bodies.forEach(function (m) {
      if (m.kind === 'province') {
        C.prov++;
        var i = +m.id.slice(4), pr = gm.provinces[i];
        var old = ANOMALY * Math.max(0, gm.grade.ores[cellOf(pr.c)] / wg - ORE_FLOOR) / (1 - ORE_FLOOR);
        var nu = m.magnetic ? ANOMALY * pr.w * m.mag : 0;
        var k = C.byComp[m.comp] || (C.byComp[m.comp] = { n: 0, gone: 0 });
        k.n++;
        if (old < SEEN) { C.kept++; return; }           // never showed; nothing to lose
        if (nu >= 0.75 * old) C.kept++;
        else if (nu >= SEEN) C.weak++;
        else {
          C.gone++; k.gone++;
          if (!m.aboveCurie) C.goneCurie++; else C.goneComp++;
        }
      } else if (m.kind === 'buried') {
        C.buried++;
        var a = m.magnetic ? ANOMALY * m.mag * Math.pow(m.radKm / Math.max(m.zKm, m.radKm), 3) : 0;
        if (a >= SEEN) C.buriedSeen++;
      }
    });
  });
}
console.log('systems', n, 'worlds with ore', C.worlds);
console.log('province highs: ' + C.prov + '  kept ' + C.kept + '  weakened ' + C.weak +
            '  vanish ' + C.gone + ' (below Curie ' + C.goneCurie + ', non-magnetic ' + C.goneComp + ')');
Object.keys(C.byComp).forEach(function (k) {
  console.log('  ' + k + ': ' + C.byComp[k].n + ' provinces, ' + C.byComp[k].gone + ' vanish');
});
console.log('buried bodies: ' + C.buried + '  new highs >= ' + SEEN + ': ' + C.buriedSeen);
