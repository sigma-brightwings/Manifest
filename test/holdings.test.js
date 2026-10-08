/* holdings.test.js — industry you own, and what owning it does to a system.
 *
 *     node test/holdings.test.js
 *
 * Astra, 2026-10-07: any struggling industry can be bought, and owning it
 * is how a corrupt, low-tech system becomes a lawful, high-tech one — or,
 * run dirty, the other way. See src/holdings.js and the project doc
 * claude/industry-and-uplift.md.
 */
global.window = global.window || global;
require('../src/vec3.js');
var Eco = require('../src/economy.js');
var Gen = require('../src/generate.js');
require('../src/sim.js');
var Combat = require('../src/combat.js');
var H = require('../src/holdings.js');
var Galaxy = require('../src/galaxy.js');

var pass = 0, fail = 0;
function check(n, c, d) {
  if (c) { pass++; console.log('  ok   ' + n + (d ? '   ' + d : '')); }
  else { fail++; console.log('  FAIL  ' + n + (d ? '   ' + d : '')); }
}

var gal = Galaxy.build('kawartha');
function optsFor(st) {
  var fac = gal.factionById ? gal.factionById[st.factionId] : null;
  return fac ? { faction: fac, allFactions: gal.factions } : undefined;
}
var systems = [];
for (var s = 0; s < gal.stars.length && s < 80; s++) {
  systems.push({ star: gal.stars[s], sys: Gen.generateSystem(gal.stars[s].seed, optsFor(gal.stars[s])) });
}
function blankG() { return { t: 0, here: null, ship: { credits: 0, docked: null }, holdings: [], uplift: {} }; }

console.log('--- the books, measured against plants of the same kind ---');
/* KIND_MEDIAN was measured across two galaxies. A fresh galaxy must land
 * near it, or the constants have drifted from the economy they describe
 * and every plant's health is being judged on a stale scale. */
var byKind = {};
systems.forEach(function (x) {
  (x.sys.ports || []).forEach(function (p) {
    var k = H.kindOf(p);
    if (!k || !H.KIND_MEDIAN[k]) return;
    (byKind[k] = byKind[k] || []).push(H.books(p).ratio);
  });
});
Object.keys(byKind).sort().forEach(function (k) {
  var a = byKind[k].slice().sort(function (x, y) { return x - y; });
  if (a.length < 15) return;
  var med = a[Math.floor(a.length / 2)];
  var off = med / H.KIND_MEDIAN[k];
  check('the ' + k + ' median still describes the economy', off > 0.65 && off < 1.5,
        med.toFixed(2) + ' against ' + H.KIND_MEDIAN[k] + ' (' + a.length + ' plants)');
});

console.log('--- distress gathers where the racket is ---');
var clean = 0, cleanD = 0, dirty = 0, dirtyD = 0, forSaleN = 0, sysWith = 0;
systems.forEach(function (x) {
  var G = blankG();
  var list = H.forSale(G, x.sys, x.star.id);
  forSaleN += list.length;
  if (list.length) sysWith++;
  (x.sys.ports || []).forEach(function (p) {
    var q = H.quote(G, x.sys, x.star.id, p);
    if (q.health === undefined) return;
    if (x.sys.corruption < 40) { clean++; if (q.ok) cleanD++; }
    if (x.sys.corruption >= 60) { dirty++; if (q.ok) dirtyD++; }
  });
});
var cleanShare = cleanD / Math.max(1, clean), dirtyShare = dirtyD / Math.max(1, dirty);
check('a corrupt system has far more plants for sale than a clean one',
      dirtyShare > 2 * cleanShare, (cleanShare * 100).toFixed(1) + '% clean, ' +
      (dirtyShare * 100).toFixed(1) + '% corrupt');
check('but there is something to buy somewhere', forSaleN > 0,
      forSaleN + ' plants in ' + sysWith + ' of ' + systems.length + ' systems');

console.log('--- what is not for sale says why ---');
var sawState = false, sawSound = false, sawTrade = false;
systems.forEach(function (x) {
  var G = blankG();
  (x.sys.ports || []).forEach(function (p) {
    var q = H.quote(G, x.sys, x.star.id, p);
    if (q.ok) return;
    if (!q.why) { check('a refusal with no reason at ' + p.name, false); return; }
    if (H.STATE_ASSET[p.market && p.market.role]) sawState = true;
    if (/books are sound/.test(q.why)) sawSound = true;
    if (/trading port/.test(q.why)) sawTrade = true;
  });
});
check('a milfuel factory or carrier is refused as a state asset', sawState);
check('a healthy plant is refused with its health and the line', sawSound);
check('a plain trading port is refused as having no works', sawTrade);

console.log('--- buying one ---');
var target = null;
for (var i = 0; i < systems.length && !target; i++) {
  var l = H.forSale(blankG(), systems[i].sys, systems[i].star.id);
  if (l.length) target = { star: systems[i].star, sys: systems[i].sys, port: l[0].port, q: l[0].quote };
}
var G = blankG();
G.here = target.star;
var r1 = H.buy(G, target.sys, target.star.id, target.port);
check('not from somebody else\'s desk', !r1.ok && /own desk/.test(r1.why), r1.why);
G.ship.docked = target.port.id;
var r2 = H.buy(G, target.sys, target.star.id, target.port);
check('not without the money, and it names the figure', !r2.ok && r2.why.indexOf(String(target.q.price)) >= 0, r2.why);
G.ship.credits = target.q.price + 1000;
var r3 = H.buy(G, target.sys, target.star.id, target.port);
check('bought at the asking price', r3.ok && G.ship.credits === 1000, target.port.name + ' for ' + target.q.price);
check('and it is yours, run clean', H.list(G).length === 1 && H.list(G)[0].mode === 'clean');
var r4 = H.quote(G, target.sys, target.star.id, target.port);
check('and no longer on the market', !r4.ok && r4.mine);

console.log('--- the desk ---');
var h = H.list(G)[0], id = target.star.id, base = target.sys.corruption;
var crimeBefore = H.crimeOf(G, target.sys, id);
check('an untouched system reads its generated crime score exactly',
      crimeBefore === target.sys.crimeScore && Gen.permissivity(target.sys.violence, base) === target.sys.crimeScore);
var c0 = G.ship.credits;
var lines = H.settle(G, 3.5 * H.WEEK);
check('three whole weeks paid, the half carried', lines.length === 1 && h.paidTo === 3 * H.WEEK, lines[0]);
check('and it paid', G.ship.credits > c0, '+' + (G.ship.credits - c0) + ' cr');
var u = H.shiftOf(G, id);
check('three clean weeks bring corruption down', Math.abs(u.corr - 3 * H.RATE.clean.corr) < 1e-9, u.corr.toFixed(2));
check('and development up', u.dev > 0, '+' + u.dev.toFixed(3));
check('which the grey market and the scans read', Combat.effectiveCorruption(G, base, id) < base,
      base + ' -> ' + Combat.effectiveCorruption(G, base, id));
check('and the police', H.crimeOf(G, target.sys, id) <= crimeBefore,
      crimeBefore + ' -> ' + H.crimeOf(G, target.sys, id));
check('and the yard', H.devOf(G, target.port, id) > target.port.market.dev);
check('nothing at all for the system next door', H.shiftOf(G, systems[0].star.id === id ? systems[1].star.id : systems[0].star.id).corr === 0);

console.log('--- money pushes harder ---');
var flat = H.weeklyDrift(h).corr;
G.ship.credits = 1e9;
var inv = H.invest(G, h.id, 'training');
check('training costs a fifth of the price, then more', inv.ok && inv.cost === Math.round(h.price * 0.2 / 100) * 100, inv.cost + ' cr');
check('and cleans faster', H.weeklyDrift(h).corr < flat, flat.toFixed(2) + ' -> ' + H.weeklyDrift(h).corr.toFixed(2));
H.invest(G, h.id, 'training'); H.invest(G, h.id, 'training');
var cap = H.invest(G, h.id, 'training');
check('three levels and no more, and it says so', !cap.ok && /as far as it goes/.test(cap.why), cap.why);
var autoPay0 = H.weeklyIncome(G, h);
H.invest(G, h.id, 'automation');
check('automation pays', H.weeklyIncome(G, h) > autoPay0);

console.log('--- the mirror ---');
var G2 = blankG();
G2.here = target.star; G2.ship.docked = target.port.id; G2.ship.credits = 1e9;
H.buy(G2, target.sys, target.star.id, target.port);
var h2 = H.list(G2)[0];
var cleanPay = H.weeklyIncome(G2, h2);
H.setMode(G2, h2.id, 'dirty');
check('a skim pays more', H.weeklyIncome(G2, h2) > cleanPay, cleanPay + ' -> ' + H.weeklyIncome(G2, h2));
H.settle(G2, 4 * H.WEEK);
check('and drags the system the other way', H.shiftOf(G2, id).corr > 0 && H.shiftOf(G2, id).dev === 0,
      '+' + H.shiftOf(G2, id).corr.toFixed(1) + ' corruption');
check('a mode that is neither says so', !H.setMode(G2, h2.id, 'grey').ok);

console.log('--- the government still shows through ---');
var G3 = blankG();
for (var k = 0; k < 500; k++) H.addShift(G3, 'x', { corr: -5, viol: -5, dev: 0.05 });
var u3 = H.shiftOf(G3, 'x');
check('the shift is capped', u3.corr === -H.CAP_CORR && u3.viol === -H.CAP_VIOL && u3.dev === H.CAP_DEV,
      u3.corr + ' / ' + u3.viol + ' / ' + u3.dev);

console.log('--- the seed is untouched ---');
var a = Gen.generateSystem(target.star.seed, optsFor(target.star));
H.forSale(G, a, target.star.id);
var b = Gen.generateSystem(target.star.seed, optsFor(target.star));
check('asking about a system changes nothing about it',
      JSON.stringify(a.ports.map(function (p) { return [p.id, p.market.role, p.market.dev]; })) ===
      JSON.stringify(b.ports.map(function (p) { return [p.id, p.market.role, p.market.dev]; })) &&
      a.corruption === b.corruption && a.crimeScore === b.crimeScore);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
