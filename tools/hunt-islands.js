/* hunt-islands.js (bug hunt 2026-11-21): which ports are islands nearly
 * always, with every public relay alive? Split by kind of port, so a late
 * port (companion b0cp*, resort *rs, dig) that never joined the network
 * shows up against the ordinary ones.
 *     node tools/hunt-islands.js [systems=80]
 */
'use strict';
global.window = global.window || global;
['vec3', 'rng', 'kepler', 'economy', 'appeal', 'generate', 'galaxy', 'rings', 'sim', 'rumours', 'comsats']
  .forEach(function (f) { require('../src/' + f + '.js'); });
var Gen = global.Gen, Galaxy = global.Galaxy, Cs = global.Comsats || require('../src/comsats.js');
var N = +(process.argv[2] || 80), DAY = 86400;
var gal = Galaxy.build('kawartha');
var G = { comsats: [], digs: {} };
var kinds = {}, worst = [];
function kindOf(p) {
  if (/^b0cp/.test(p.id)) return 'companion';
  if (p.resort) return 'resort';
  if (p.dug) return 'dig';
  return p.surface ? 'pad' : 'station';
}
gal.stars.filter(function (s) { return s.factionId; }).slice(0, N).forEach(function (st) {
  var sys = Gen.generateSystem(st.seed, Galaxy.systemOpts(gal, st)); sys.starId = st.id;
  (sys.ports || []).forEach(function (p) {
    if (!p.market) return;
    var isl = 0, n = 0;
    for (var d = 0; d < 365; d += 7) {
      /* Lapses (RTGs running out) would muddy this: ask about relays only. */
      var t = d * DAY + 3600 * (d % 24);
      n++;
      if (Cs.isIsland(G, sys, st.id, p, t)) isl++;
    }
    var k = kindOf(p);
    kinds[k] = kinds[k] || { ports: 0, always: 0, frac: 0 };
    kinds[k].ports++; kinds[k].frac += isl / n;
    if (isl / n > 0.9) { kinds[k].always++; worst.push(st.name + ' ' + p.id + ' ' + p.name + ' ' + (isl / n).toFixed(2)); }
  });
});
Object.keys(kinds).forEach(function (k) {
  var x = kinds[k];
  console.log(k + ': ' + x.ports + ' ports, mean island fraction ' + (x.frac / x.ports).toFixed(3) + ', islands >90% of the year: ' + x.always);
});
console.log(worst.slice(0, 12).join('\n'));
