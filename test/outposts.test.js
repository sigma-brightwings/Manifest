/* outposts.test.js - an outpost built by the drones on a claim (2026-11-19).
 *
 *     node test/outposts.test.js
 *
 * Pinned (outposts.js):
 *   - it takes two of your drones on a live claim, and the Guild's fee;
 *   - while they build, they dig nothing - the hoppers hold still until the
 *     day it stands, which is the drone-days of work over the drones;
 *   - once it stands each drone holds the outpost's bins, not 30 t, and the
 *     answer is closed-form (asking along the way changes nothing);
 *   - thieves come half as often;
 *   - N at the outpost empties the whole claim, and N beside a drone while
 *     it is still being built still empties that drone, without breaking
 *     the bigger bins later;
 *   - a drone set down during the build waits for it too;
 *   - it is announced once, when it stands.
 */
global.window = global.window || global;
require('../src/vec3.js');
require('../src/rng.js');
require('../src/kepler.js');
var Eco = require('../src/economy.js');
var Gen = require('../src/generate.js');
var Galaxy = require('../src/galaxy.js');
require('../src/rings.js');
var Sim = require('../src/sim.js');
var Sv = require('../src/survey.js');
var Cl = require('../src/claims.js');
var Op = require('../src/outposts.js');
var V = global.V;
var DAY = 86400;

var pass = 0, fail = 0;
function check(n, c, d) {
  if (c) { pass++; console.log('  ok   ' + n + (d ? '   ' + d : '')); }
  else { fail++; console.log('  FAIL  ' + n + (d ? '   ' + d : '')); }
}

var gal = Galaxy.build('kawartha');
function optsFor(st) {
  var fac = gal.factionById ? gal.factionById[st.factionId] : null;
  return fac ? { faction: fac, allFactions: gal.factions } : {};
}
var sys = null, world = null;
var probe = Sim.makeShip({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 });
Sim.refreshShip(probe);
for (var si = 0; si < gal.stars.length && si < 80 && !world; si++) {
  var sy = Gen.generateSystem(gal.stars[si].seed, optsFor(gal.stars[si]));
  sy.bodies.forEach(function (b) {
    if (world || (b.kind !== 'planet' && b.kind !== 'moon')) return;
    if (Sim.surfaceG(b) > probe.maxAccel * 0.5) return;
    var rows = Sv.deposits(b, sy).filter(function (r) { return r.cid !== 'hydrogen' && r.tonnes > 0; });
    if (rows.length) { sys = sy; world = b; }
  });
}
check('a liftable world with ore', !!world, world && world.name);

var t0 = 1000 * DAY;
var G = { here: { id: 'test' }, sys: sys, t: t0, surveys: {}, claims: {}, drones: [], extracted: {}, outposts: [] };
var hs = Sim.bodyState(world, sys, t0);
var ship = Sim.makeShip(V.add(hs.pos, Sim.surfaceOffset(world, { lat: 0.3, lon: 1.1, elevation: 0.004 }, t0).pos), hs.vel);
Sim.refreshShip(ship);
ship.credits = 100000;
G.ship = ship;
ship.landed = true; ship.crashed = false; ship.landedAt = Sim.landSpot(world, sys, t0, ship.pos);
var key = Cl.keyOf(G, world.id);
G.surveys[key] = { key: key, cov: 0.6, t: t0 };
check('claim filed', Cl.fileClaim(G, sys, world, t0).ok);
Cl.buyDrone(G); Cl.buyDrone(G);

/* Two drones on two good cells, the way a prospector who read the map would. */
var m = Sv.groundMap(world, sys), cells = [];
if (m && m.grade.ores) {
  var idx = []; for (var i = 0; i < Sv.NCELL; i++) idx.push(i);
  idx.sort(function (a, b) { return m.grade.ores[b] - m.grade.ores[a]; });
  cells = [idx[0], idx[400]];
}
function landOn(cell, t) {
  var la = Math.floor(cell / Sv.LON_BINS), lo = cell % Sv.LON_BINS;
  ship.landedAt.lat = -Math.PI / 2 + (la + 0.5) * Math.PI / Sv.LAT_BINS;
  ship.landedAt.lon = (lo + 0.5) * 2 * Math.PI / Sv.LON_BINS;
  Sim.updateLandedShip(ship, sys, t);
}
landOn(cells[0], t0);
var r1 = Cl.act(G, sys, t0);
check('first drone down', r1.ok, r1.text || r1.why);
var d1 = G.drones[0];
check('one drone is not enough', /takes 2 drones/.test(Op.refusal(G, sys, t0, d1.id) || ''), Op.refusal(G, sys, t0, d1.id));
landOn(cells[1], t0);
var r2 = Cl.act(G, sys, t0);
check('second drone down', r2.ok && G.drones.length === 2, r2.text || r2.why);
var d2 = G.drones[1];
G.drones.forEach(function (d) { d.stripRate = 1e-9; });      // quiet, for the arithmetic

console.log('--- ordering it ---');
var tO = t0 + 10 * DAY;
var held1 = Cl.hopper(G, d1, tO).tonnes, held2 = Cl.hopper(G, d2, tO).tonnes;
var cr = ship.credits;
var o = Op.order(G, sys, tO, d1.id);
check('two drones on a live claim build it', o.ok, o.text || o.why);
check('the Guild takes its fee', ship.credits === cr - Op.OUTPOST_FEE);
check('it stands after the work over the drones', Math.abs(o.outpost.doneAt - tO - Op.OUTPOST_WORK / 2 * DAY) < 1e-6,
      ((o.outpost.doneAt - tO) / DAY) + ' days');
check('it stands where the drone does', o.outpost.at.lat === d1.at.lat && o.outpost.at.lon === d1.at.lon);
check('one to a claim', /already building/.test(Op.refusal(G, sys, tO, d2.id) || ''));
var mid = tO + 0.5 * (o.outpost.doneAt - tO);
check('while they build they dig nothing', Cl.hopper(G, d1, mid).tonnes === held1 && Cl.hopper(G, d2, mid).tonnes === held2,
      held1.toFixed(2) + ' t, ' + held2.toFixed(2) + ' t');
check('the thieves are halved', Math.abs(d1.stripRate - 1e-9 * Op.OUTPOST_STRIP) < 1e-20);

console.log('--- a drone emptied during the build ---');
landOn(cells[1], mid);
var cm = Cl.act(G, sys, mid);
check('N beside a drone still empties it', cm.ok && cm.taken === Math.floor(held2), cm.text || cm.why);
check('and it waits for the outpost before digging again', d2.baseT === o.outpost.doneAt);
Cl.buyDrone(G);
landOn(cells[0] + 7, mid);
var r3 = Cl.act(G, sys, mid);
check('a drone set down during the build waits too', r3.ok && r3.drone.baseT === o.outpost.doneAt, r3.text || r3.why);
var d3 = r3.drone; d3.stripRate = 1e-9;

console.log('--- standing ---');
var said = [];
check('not announced before its day', Op.tick(G, mid, { say: function (s) { said.push(s); } }) === 0);
var tD = o.outpost.doneAt;
check('announced once on its day', Op.tick(G, tD + 1, { say: function (s) { said.push(s); } }) === 1 &&
      Op.tick(G, tD + 2, { say: function (s) { said.push(s); } }) === 0, said[0]);
var long = tD + 2000 * DAY;
G.claims[key].until = t0 + 20000 * DAY;      // renewed, year on year, for the long view
check('each drone now holds the bins', Cl.hopper(G, d1, long).tonnes === Op.OUTPOST_HOPPER &&
      Cl.hopper(G, d2, long).tonnes === Op.OUTPOST_HOPPER, Op.OUTPOST_HOPPER + ' t');
var t30 = tD + 30 * DAY, want = held1 + Cl.DRONE_RATE * d1.grade * 30;
check('and digs from the day it stood', Math.abs(Cl.hopper(G, d1, t30).tonnes - Math.min(Op.OUTPOST_HOPPER, want)) < 1e-9);
for (var k = 0; k < 20; k++) Cl.hopper(G, d1, tD + k * DAY);
check('asking along the way changes nothing', Math.abs(Cl.hopper(G, d1, t30).tonnes - Math.min(Op.OUTPOST_HOPPER, want)) < 1e-9);

console.log('--- emptying the claim at the outpost ---');
ship.cargo = {}; Sim.refreshShip(ship);
landOn(cells[0], t30);
var near = Op.near(G, sys, t30);
check('landed at it, the ship is at the outpost', near && near.id === o.outpost.id);
var b1 = Math.floor(Cl.hopper(G, d1, t30).tonnes), b2 = Math.floor(Cl.hopper(G, d2, t30).tonnes), b3 = Math.floor(Cl.hopper(G, d3, t30).tonnes);
var ca = Cl.act(G, sys, t30);
var aboard = Object.keys(ship.cargo).reduce(function (s, c) { return s + ship.cargo[c]; }, 0);
check('N empties every drone on the claim', ca.ok && Math.abs(aboard - Math.min(b1 + b2 + b3, Math.floor(ship.cargoCap))) <= 3,
      ca.text + '  (' + (b1 + b2 + b3) + ' t in the bins)');
check('and keeps its bins after', d1.baseT === t30 && Cl.hopper(G, d1, long + t30).tonnes === Op.OUTPOST_HOPPER);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
