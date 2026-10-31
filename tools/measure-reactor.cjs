/* measure-reactor.cjs - what the universal reactor demand (2026-10-31) did
 * to fissile prices and the milfuel ladder.
 *
 *     node tools/measure-reactor.cjs [path/to/economy.js]
 *
 * Run once with the current economy and once with an older copy (git show
 * HEAD~N:src/economy.js > some file) and compare. Prices are at the
 * baseline shelf (Eco.priceAt at t=0 if present, else value*local).
 */
'use strict';
const path = require('path');
global.window = global.window || global;
['vec3', 'rng', 'kepler'].forEach(m => require('../src/' + m + '.js'));
const ecoPath = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(__dirname, '../src/economy.js');
global.Economy = require(ecoPath);
const Gen = require('../src/generate.js');
const Galaxy = require('../src/galaxy.js');
const Eco = global.Economy;
const g = Galaxy.build('kawartha');
function price(port, cid) {
  const r = port.market && port.market.rows[cid];
  if (!r) return null;
  if (Eco.priceAt) { try { return Eco.priceAt(port, cid, 0); } catch (e) { /* fall through */ } }
  return r.value * r.local;
}
const nonExp = [], sellAt = [], buyAt = [], legs = [];
let ports = 0, withRow = 0;
for (const st of g.stars.slice(0, 80)) {
  const sys = Gen.generateSystem(st.seed, Galaxy.systemOpts(g, st));
  let bestPlant = null, bestFactory = null;
  for (const p of sys.ports || []) {
    ports++;
    if (!p.market || !p.market.rows.fissile) continue;
    withRow++;
    const pr = price(p, 'fissile'), r = p.market.rows.fissile;
    if (!r.exporter) nonExp.push(pr);
    if (r.exporter) { sellAt.push(pr); if (!bestPlant || pr < bestPlant) bestPlant = pr; }
    if (p.market.role === 'milfuel' || (p.market.slugs > 0)) { buyAt.push(pr); if (!bestFactory || pr > bestFactory) bestFactory = pr; }
  }
  if (bestPlant && bestFactory) legs.push(bestFactory - bestPlant);
}
const med = a => { const b = a.slice().sort((x, y) => x - y); return b.length ? Math.round(b[Math.floor(b.length / 2)]) : null; };
console.log(path.basename(ecoPath));
console.log('  ports ' + ports + ', with a fissile row ' + withRow);
console.log('  fissile, median price where not exported: ' + med(nonExp) + ' cr/t (' + nonExp.length + ' ports)');
console.log('  fissile, median price where exported:     ' + med(sellAt) + ' cr/t (' + sellAt.length + ' ports)');
console.log('  fissile, median price at a milfuel press: ' + med(buyAt) + ' cr/t (' + buyAt.length + ' ports)');
console.log('  plant -> press spread, median per tonne:  ' + med(legs) + ' cr/t (' + legs.length + ' systems)');
