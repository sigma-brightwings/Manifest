/* navsystem.test.js — the current system's chart, on the NAV screen.
 *
 *     node test/navsystem.test.js
 *
 * Astra, 2026-10-19: "slipspace chart info should be displayed for current
 * system in the nav menu. Stuff like what type of planet each of the
 * bodies in order from their star are."
 */
global.window = global.window || global;
var V = require('../src/vec3.js');
require('../src/economy.js');
var Gen = require('../src/generate.js');
require('../src/sim.js');
var Galaxy = require('../src/galaxy.js');
var Screens = require('../src/screens.js');

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
var tried = 0, withMoons = 0, withPorts = 0;
for (var s = 0; s < gal.stars.length && tried < 12; s++) {
  var sys = Gen.generateSystem(gal.stars[s].seed, optsFor(gal.stars[s]));
  var m = Screens.systemManifest(sys);
  var planets = sys.bodies.filter(function (b) { return b.kind === 'planet'; });
  if (!planets.length) continue;
  tried++;
  var tag = gal.stars[s].name;
  check(tag + ': every planet is listed once', m.length === planets.length &&
        planets.every(function (p) { return m.filter(function (r) { return r.body === p; }).length === 1; }));
  var inOrder = m.every(function (r, i) { return i === 0 || r.body.orbit.a >= m[i - 1].body.orbit.a; });
  check(tag + ': nearest the star first', inOrder);
  check(tag + ': numbered 1..n', m.every(function (r, i) { return r.n === i + 1; }));
  check(tag + ': every planet has a type', m.every(function (r) { return !!r.typeName; }));
  var moonTotal = sys.bodies.filter(function (b) { return b.kind === 'moon' && planets.some(function (p) { return p.id === b.orbit.parent; }); }).length;
  check(tag + ': the moons add up', m.reduce(function (a, r) { return a + r.moons; }, 0) === moonTotal);
  var hz = m.filter(function (r) { return r.habitable; }).map(function (r) { return r.body.id; });
  check(tag + ': HZ flags match the generator', planets.every(function (p) { return (hz.indexOf(p.id) >= 0) === !!p.habitable; }));
  if (moonTotal) withMoons++;
  var portSum = m.reduce(function (a, r) { return a + r.ports; }, 0);
  if (portSum) withPorts++;
  check(tag + ': no port counted twice', portSum <= (sys.ports || []).length, portSum + ' of ' + (sys.ports || []).length);
}
/* The WORLD tab: one world as the chart describes it. */
var wsys = null;
for (var s2 = 0; s2 < gal.stars.length && !wsys; s2++) {
  var cand = Gen.generateSystem(gal.stars[s2].seed, optsFor(gal.stars[s2]));
  if (cand.bodies.some(function (b) { return b.kind === 'moon'; }) &&
      cand.bodies.some(function (b) { return b.habitable; })) wsys = cand;
}
check('found a system with a habitable world and moons', !!wsys);
if (wsys) {
  var man = Screens.systemManifest(wsys);
  var hab = man.filter(function (r) { return r.habitable; })[0];
  var f = Screens.worldFacts(wsys, hab.body);
  var nth = { 1: '1st', 2: '2nd', 3: '3rd' }[hab.n] || hab.n + 'th';
  check('a planet says where it sits: ' + f.place, f.place.indexOf(nth + ' of ' + man.length + ' from ') === 0);
  check('and what it is', f.typeName === hab.typeName && f.habitable);
  check('and its air', f.air === (hab.body.composition || f.air) && f.air.length > 0);
  check('and its moons and ports, matching the SYSTEM tab', f.moons === hab.moons && f.ports === hab.ports);
  check('its surface pull is a sensible number', f.gravity > 0.05 && f.gravity < 5, f.gravity && f.gravity.toFixed(2) + ' g');
  check('the chart\'s notes come along for a habitable world', f.notes.length > 0);
  var moon = wsys.bodies.filter(function (b) { return b.kind === 'moon'; })[0];
  var mf = Screens.worldFacts(wsys, moon);
  var parent = wsys.byId[moon.orbit.parent];
  check('a moon is placed against its planet: ' + mf.place, mf.place === 'moon of ' + parent.name);
  check('and the SYSTEM tab lights its planet', mf.planetRow && mf.planetRow.body === parent);
}

check('sampled real systems', tried >= 6, tried + ' systems');
check('and some had moons and ports to count', withMoons > 0 && withPorts > 0);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
