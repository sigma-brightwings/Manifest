/* appeal.test.js - worlds worth visiting, slice 1: the appeal score, and
 * the ferries that carry people because of it.
 *
 *     node test/appeal.test.js
 *
 * claude/worlds-people-and-infrastructure.md. Pinned here:
 *  - no air, no appeal; a giant is not a destination;
 *  - every score is 0..1 and the same twice; all four tiers occur in a real
 *    galaxy, and harsh worlds are not the habitable majority;
 *  - each ingredient pulls the right way: heavier gravity, thinner air, more
 *    cloud, a colder sun cost; aurorae, big moons, a ringed giant overhead
 *    and an endless sunset pay; the view cannot rescue a lethal world;
 *  - ferries over an appealing world carry souls, ferries over a harsh one
 *    do not, and liners keep their own seats.
 */
'use strict';
global.window = global;
var path = require('path'), SRC = path.join(__dirname, '..', 'src');
['vec3', 'kepler', 'rng', 'economy', 'appeal', 'generate', 'galaxy'].forEach(function (f) { require(path.join(SRC, f + '.js')); });
var Gen = global.Gen, Galaxy = global.Galaxy, A = global.Appeal;

var pass = 0, fail = 0;
function check(n, c, d) {
  if (c) { pass++; console.log('  ok   ' + n + (d !== undefined ? '   ' + d : '')); }
  else { fail++; console.log('  FAIL ' + n + (d !== undefined ? '   ' + d : '')); }
}

var g = Galaxy.build('kawartha');
var systems = g.stars.filter(function (s) { return s.factionId; }).slice(0, 60).map(function (st) {
  return Gen.generateSystem(st.seed, { faction: g.factionById[st.factionId], allFactions: g.factions });
});

console.log('--- who gets a score ---');
var anyAirless = null, anyGiant = null;
systems.forEach(function (s) { s.bodies.forEach(function (b) {
  if (!anyAirless && b.kind !== 'star' && !b.atmosphere) anyAirless = { s: s, b: b };
  if (!anyGiant && b.type === 'gasGiant') anyGiant = { s: s, b: b };
}); });
check('an airless world has none', !anyAirless || A.of(anyAirless.s, anyAirless.b) === null);
check('a gas giant has none', !anyGiant || A.of(anyGiant.s, anyGiant.b) === null);

console.log('--- across a real galaxy ---');
var all = [], tiers = {}, habTiers = {};
systems.forEach(function (s) { s.bodies.forEach(function (b) {
  var a = A.of(s, b);
  if (!a) return;
  all.push({ s: s, b: b, a: a });
  tiers[a.tier] = (tiers[a.tier] || 0) + 1;
  if (b.habitable) habTiers[a.tier] = (habTiers[a.tier] || 0) + 1;
}); });
check('every score is inside 0..1', all.every(function (r) { return r.a.score >= 0 && r.a.score <= 1; }));
var r0 = all[5];
check('the same world scores the same twice', JSON.stringify(A.of(r0.s, r0.b)) === JSON.stringify(r0.a));
check('all four tiers occur', ['postcard', 'pleasant', 'livable', 'harsh'].every(function (t) { return tiers[t] > 0; }), JSON.stringify(tiers));
var habN = Object.keys(habTiers).reduce(function (n, k) { return n + habTiers[k]; }, 0);
check('most habitable worlds are worth a visit (harsh is the minority)', (habTiers.harsh || 0) < habN / 3, JSON.stringify(habTiers));
var start = systems[0].bodies.map(function (b) { return A.of(systems[0], b); }).filter(Boolean);
console.log('       ' + all.length + ' worlds with air; ' + JSON.stringify(tiers));

console.log('--- each ingredient pulls the right way ---');
/* A test world: Earth, more or less, alone in its sky. */
function world(over) {
  var b = { id: 'w', kind: 'planet', type: 'terran', habitable: true, habitableBand: 'global',
            mu: 398600, radius: 6371, insolation: 1,
            atmosphere: { rho0: 1.225, cloud: 0.2 }, children: [], magnetosphere: null };
  for (var k in over) b[k] = over[k];
  return b;
}
var sys0 = { byId: {} };
var base = A.of(sys0, world({})).score;
check('an Earth with a clear sky is pleasant or better', base >= 0.5, base.toFixed(3));
check('heavier gravity costs', A.of(sys0, world({ mu: 398600 * 1.8 })).score < base);
check('thinner air costs', A.of(sys0, world({ atmosphere: { rho0: 0.3, cloud: 0.2 } })).score < base);
check('more cloud costs', A.of(sys0, world({ atmosphere: { rho0: 1.225, cloud: 0.9 } })).score < base);
check('a colder sun costs', A.of(sys0, world({ insolation: 0.45 })).score < base);
var aur = A.of(sys0, world({ magnetosphere: { strength: 0.8, activity: 0.8 } }));
check('aurorae pay, and say so', aur.score > base && aur.why.indexOf('aurorae') >= 0, aur.score.toFixed(3));
var moonB = { id: 'm1', kind: 'moon', radius: 1737, orbit: { a: 384400 } };
var withMoon = A.of(sys0, world({ children: [moonB] }));
check('a big moon in the sky pays', withMoon.score > base && withMoon.why.join().indexOf('big moon') >= 0, withMoon.score.toFixed(3));
var smallMoon = A.of(sys0, world({ children: [{ id: 'm2', kind: 'moon', radius: 11, orbit: { a: 9400 } }] }));
check('a pebble of a moon does not', smallMoon.score === base);
var giant = { id: 'gg', kind: 'planet', type: 'gasGiant', radius: 69911 };
var ringed = { id: 'rg', kind: 'planet', type: 'gasGiant', radius: 69911, ring: { inner: 90000, outer: 140000 } };
var sysG = { byId: { gg: giant, rg: ringed } };
function moonOf(id) { return world({ kind: 'moon', habitable: false, habitableBand: null, orbit: { parent: id, a: 1.0e6 } }); }
var underGiant = A.of(sysG, moonOf('gg')), underRing = A.of(sysG, moonOf('rg'));
check('a giant overhead pays', underGiant.view >= A.GIANT_VIEW, underGiant.why.join(', '));
check('a ringed one pays more', underRing.score > underGiant.score, underRing.why.join(', '));
var term = A.of(sys0, world({ habitableBand: 'terminator' }));
check('a twilight ring is less livable but has its sunset', term.earthlike < A.of(sys0, world({})).earthlike && term.why.indexOf('a sun that never sets') >= 0);
var lethal = A.of(sys0, world({ mu: 398600 * 4, atmosphere: { rho0: 0.01, cloud: 0.1 }, insolation: 3,
                                children: [moonB], magnetosphere: { strength: 1, activity: 1 } }));
check('the best view cannot rescue a lethal world', lethal.tier === 'harsh', lethal.score.toFixed(3));

console.log('--- ferries carry people where people want to go ---');
var ferries = 0, seated = 0, wrong = 0, over = 0;
systems.forEach(function (s) { (s.traffic || []).forEach(function (r) {
  if (!r.feeder || r.cls !== 'shuttle') return;
  ferries++;
  var w = s.byId[r.parentId], a = w ? A.of(s, w) : null, score = a ? a.score : 0;
  if (r.souls) { seated++; if (score < 0.3) wrong++; if (r.souls > 24 * 1.4 + 1) over++; }
  else if (score >= 0.3) wrong++;
}); });
console.log('       ' + seated + ' of ' + ferries + ' ferries carry people');
check('ferries carry people exactly where the world is worth it', ferries > 0 && seated > 0 && wrong === 0, wrong + ' wrong');
check('never more than a shuttle holds', over === 0);
var liners = 0, linerSeats = 0;
systems.forEach(function (s) { (s.traffic || []).forEach(function (r) { if (r.cls === 'liner') { liners++; if (r.souls >= 12) linerSeats++; } }); });
check('liners keep their own seats', liners === linerSeats, linerSeats + ' of ' + liners);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
