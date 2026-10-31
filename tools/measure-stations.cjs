/* measure-stations.cjs - what a founded station earns and costs a week
 * (stations.js books), across many sites and every type.
 *
 *     node tools/measure-stations.cjs
 */
'use strict';
global.window = global.window || global;
['vec3', 'rng', 'kepler', 'economy', 'generate', 'sim'].forEach(m => require('../src/' + m + '.js'));
require('../src/combat.js');
require('../src/crew.js');
require('../src/holdings.js');
const Galaxy = require('../src/galaxy.js');
const Cn = require('../src/construction.js');
const S = require('../src/stations.js');
const Gen = global.Gen;
const g = Galaxy.build('kawartha');
const LOADS = {
  market: ['market', 'warehouse', 'quarters'],
  refinery: ['refinery', 'warehouse', 'quarters'],
  mining: ['oreworks', 'warehouse', 'quarters'],
  hab: ['habring', 'berth', 'berth', 'quarters'],
  shipyard: ['slipway', 'repair', 'quarters']
};
const res = {};
let n = 0;
for (const star of g.stars.slice(0, 60)) {
  const f = g.factionById[star.factionId];
  const sys = Gen.generateSystem(star.seed, Galaxy.systemOpts(g, star)); sys.starId = star.id;
  const worlds = sys.bodies.filter(b => (b.kind === 'planet' || b.kind === 'moon') && b.radius > 500);
  if (!worlds.length || !(sys.ports || []).length) continue;
  const host = worlds[n++ % worlds.length];
  for (const type in LOADS) {
    const st = { id: 'm' + n + type, name: 'Probe ' + type, star: star.id, type: type, typeName: type, kind: 'orbital', host: host.id,
                 orbit: { parent: host.id, a: host.radius * 1.6, e: 0, inc: 0, lan: 0, argp: 0, m0: 0 },
                 crates: LOADS[type], order: S.crewOrder(LOADS[type]), rates: { unpack: 1.5, ferry: 1 },
                 startedAt: 0, hand: {}, crew: [{ name: 'a', rating: 3 }, { name: 'b', rating: 3 }],
                 licence: null, faction: sys.ports[0].faction, crawler: {}, stock: {} };
    const port = S.makePort(st, sys);
    if (!port) continue;
    const fc = S.forecast(st);
    (res[type] = res[type] || []).push(Object.assign({ cost: S.buildCost(st), visits: st.books.visits, burn: st.books.burn * 7 }, fc));
  }
}
const med = (a, k) => { const b = a.map(x => x[k]).sort((x, y) => x - y); return Math.round(b[Math.floor(b.length / 2)]); };
const q = (a, k, f) => { const b = a.map(x => x[k]).sort((x, y) => x - y); return Math.round(b[Math.floor((b.length - 1) * f)]); };
for (const t in res) {
  const a = res[t];
  console.log(t.padEnd(9) + ' n=' + a.length + '  cost ' + med(a, 'cost') +
    '  market ' + med(a, 'market') + '  berths ' + med(a, 'berths') + ' (' + med(a, 'visits') + ' calls)' +
    '  wages ' + med(a, 'wages') + '  upkeep ' + med(a, 'upkeep') + '  fuel ' + med(a, 'fuel') + ' (' + med(a, 'burn') + ' t)' +
    '  NET median ' + med(a, 'net') + '  [p10 ' + q(a, 'net', 0.1) + ', p90 ' + q(a, 'net', 0.9) + ']' +
    '  payback ' + Math.round(med(a, 'cost') / Math.max(1, med(a, 'net'))) + ' wk');
}
