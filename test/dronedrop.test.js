/* dronedrop.test.js - putting a mining drone on a cell you picked off the
 * scanner map (2026-11-10).
 *
 *     node test/dronedrop.test.js
 *
 * Claims.deployAt is the map's half of rung 2: the survey map used to be a
 * thing you read and then flew to, and this lets you point at a cell and
 * put a drone on it. What it must hold:
 *   - the same gates as landing and pressing N (a live claim, a drone
 *     aboard) plus one of its own: THE CELL MUST BE MAPPED;
 *   - you have to be there - landed on that world, or in orbit within the
 *     survey range; from orbit the pod costs reaction mass;
 *   - the drone digs what is under IT, at that cell's grade, so dropping on
 *     a rich cell beats dropping on a poor one;
 *   - and the drone ends up where it was asked to, to the cell.
 */
global.window = global.window || global;
require('../src/vec3.js');
require('../src/rng.js');
require('../src/kepler.js');
require('../src/economy.js');
var Gen = require('../src/generate.js');
var Galaxy = require('../src/galaxy.js');
require('../src/rings.js');
var Sim = require('../src/sim.js');
var Sv = require('../src/survey.js');
var Cl = require('../src/claims.js');
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
/* A world with ore that varies across its ground - the whole point is
 * picking WHERE. */
var sys = null, world = null, rich = 0, poor = 0;
for (var si = 0; si < gal.stars.length && si < 80 && !world; si++) {
  var sy = Gen.generateSystem(gal.stars[si].seed, optsFor(gal.stars[si]));
  for (var bi = 0; bi < sy.bodies.length; bi++) {
    var b = sy.bodies[bi];
    if (b.kind !== 'planet' && b.kind !== 'moon') continue;
    var m = Sv.groundMap(b, sy);
    if (!m || !m.grade.ores) continue;
    var hi = 0, lo = -1;
    for (var i = 0; i < Sv.NCELL; i++) {
      if (m.grade.ores[i] > m.grade.ores[hi]) hi = i;
      if (m.grade.ores[i] > 0.02 && (lo < 0 || m.grade.ores[i] < m.grade.ores[lo])) lo = i;
    }
    if (m.grade.ores[hi] > 0.35 && lo >= 0 && m.grade.ores[lo] < m.grade.ores[hi] * 0.5) {
      sys = sy; world = b; rich = hi; poor = lo; break;
    }
  }
}
check('found a world whose ore is somewhere in particular', !!world,
      world ? world.name + ': best ' + Sv.groundMap(world, sys).grade.ores[rich].toFixed(2) +
              ' at cell ' + rich + ', worst ' + Sv.groundMap(world, sys).grade.ores[poor].toFixed(2) : '');

var t0 = 1000 * DAY;
var key = 'test:' + world.id;
function fresh(where) {
  var hs = Sim.bodyState(world, sys, t0);
  var ship;
  if (where === 'orbit') {
    ship = Sim.makeShip(V.add(hs.pos, { x: world.radius * 1.4, y: 0, z: 0 }), hs.vel);
    Sim.refreshShip(ship);
  } else if (where === 'far') {
    ship = Sim.makeShip(V.add(hs.pos, { x: world.radius * 40, y: 0, z: 0 }), hs.vel);
    Sim.refreshShip(ship);
  } else {
    ship = Sim.makeShip(V.add(hs.pos, Sim.surfaceOffset(world, { lat: 0.2, lon: 0.4, elevation: 0.004 }, t0).pos), hs.vel);
    Sim.refreshShip(ship);
    ship.landed = true; ship.crashed = false;
    ship.landedAt = Sim.landSpot(world, sys, t0, ship.pos);
  }
  ship.drones = 1;
  ship.thrusterFuel = 10;
  var G = { here: { id: 'test' }, sys: sys, t: t0, ship: ship, drones: [], extracted: {},
            claims: {}, surveys: {} };
  /* A survey that has read the whole world, grade 1. */
  var all = new Uint8Array(Sv.NCELL);
  for (var c = 0; c < Sv.NCELL; c++) all[c] = 1;
  G.surveys[key] = { key: key, kind: 'world', name: world.name, body: world.id, cov: 1, t: t0,
                     cells: Sv.packCells(all), grade: 1 };
  G.claims[key] = { key: key, until: t0 + 365 * DAY, filed: t0 };
  return G;
}

console.log('--- what it refuses ---');
(function () {
  var G = fresh('orbit');
  G.claims = {};
  check('no claim, no drone', !Cl.deployAt(G, sys, t0, world, rich).ok, Cl.deployAt(G, sys, t0, world, rich).why);
  G = fresh('orbit');
  G.ship.drones = 0;
  check('no drone aboard, nothing to drop', !Cl.deployAt(G, sys, t0, world, rich).ok);
  G = fresh('orbit');
  G.surveys[key].cells = Sv.packCells(new Uint8Array(Sv.NCELL));
  G.surveys[key].cov = 0;
  var r = Cl.deployAt(G, sys, t0, world, rich);
  check('unmapped ground is refused, and says so', !r.ok && /not mapped/.test(r.why), r.why);
  G = fresh('far');
  r = Cl.deployAt(G, sys, t0, world, rich);
  check('from across the system there is nothing to drop from', !r.ok && /orbit|land/.test(r.why), r.why);
  G = fresh('orbit');
  G.ship.thrusterFuel = 0.05;
  r = Cl.deployAt(G, sys, t0, world, rich);
  check('a pod needs reaction mass for its burn', !r.ok && /reaction mass/.test(r.why), r.why);
})();

console.log('--- the drop ---');
(function () {
  var G = fresh('orbit');
  var fuel0 = G.ship.thrusterFuel;
  var r = Cl.deployAt(G, sys, t0, world, rich);
  check('from orbit, a pod goes down', r.ok, r.ok ? r.text : r.why);
  check('and it costs the drone and the burn',
        G.ship.drones === 0 && Math.abs(fuel0 - G.ship.thrusterFuel - Cl.POD_FUEL) < 1e-9,
        (fuel0 - G.ship.thrusterFuel).toFixed(2) + ' t');
  var d = G.drones[0];
  check('the drone is on the cell that was asked for',
        Sv.cellOfLatLon(d.at.lat, d.at.lon) === rich, 'cell ' + Sv.cellOfLatLon(d.at.lat, d.at.lon) + ' vs ' + rich);
  check('digging the ore that is under it, at that ground\'s grade',
        d.cid === 'ores' && Math.abs(d.grade - Sv.localGrade(world, sys, 'ores', rich)) < 1e-9,
        d.cid + ' ' + d.grade.toFixed(3));
  /* The whole argument for the map: a rich cell is worth more than a poor
   * one, and the drone's rate follows the ground it stands on. */
  var G2 = fresh('orbit');
  var r2 = Cl.deployAt(G2, sys, t0, world, poor);
  check('dropping on poor ground gives a poorer drone',
        r2.ok && G2.drones[0].grade < d.grade * 0.6,
        r2.ok ? G2.drones[0].grade.toFixed(3) + ' vs ' + d.grade.toFixed(3) : r2.why);
  var hi = Cl.hopper(G, d, t0 + 30 * DAY).tonnes, lo = Cl.hopper(G2, G2.drones[0], t0 + 30 * DAY).tonnes;
  check('and a month later the hopper says so', hi > lo * 1.5, hi.toFixed(1) + ' t vs ' + lo.toFixed(1) + ' t');
})();

console.log('--- landed, no pod ---');
(function () {
  var G = fresh('landed');
  var fuel0 = G.ship.thrusterFuel;
  var r = Cl.deployAt(G, sys, t0, world, rich);
  check('landed on the claim it walks over, free', r.ok && G.ship.thrusterFuel === fuel0, r.ok ? r.text : r.why);
  check('still on the cell asked for', Sv.cellOfLatLon(G.drones[0].at.lat, G.drones[0].at.lon) === rich);
  /* N where you stand is untouched: the map adds a way, it does not take
   * the old one away. */
  var G2 = fresh('landed');
  var r2 = Cl.act(G2, sys, t0);
  check('and N where you stand still works', r2.ok && G2.drones.length === 1, r2.ok ? r2.text : r2.why);
})();

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
