/* reach.test.js - how far away a mission's target is, from where you are now.
 *
 *     node test/reach.test.js
 *
 * Astra (2026-11-18): "I also want the missions to describe how far away the
 * target is." Missions.reach is read at draw time, so the claims pinned here
 * are that it measures from the SHIP (not from the port the job was posted
 * at), that it moves when the ship does, that another star gives light
 * years, and that it says nothing rather than something made up.
 */
var path = require('path');
var SRC = path.join(__dirname, '..', 'src');
require(path.join(SRC, 'rng.js'));
require(path.join(SRC, 'economy.js'));
var Gen = require(path.join(SRC, 'generate.js'));
var Galaxy = require(path.join(SRC, 'galaxy.js'));
var Sim = require(path.join(SRC, 'sim.js'));
var Combat = require(path.join(SRC, 'combat.js'));
var Missions = require(path.join(SRC, 'missions.js'));
var V = global.V;

var pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  ok   ' + name + (detail ? '   ' + detail : '')); }
  else { fail++; console.log('  FAIL ' + name + (detail ? '   ' + detail : '')); }
}

var galaxy = Galaxy.build('reach-test');
var star = null, sys = null, a = null, b = null;
for (var i = 0; i < galaxy.stars.length && !b; i++) {
  var s = galaxy.stars[i];
  var y = Gen.generateSystem(s.seed, { faction: galaxy.factionById[s.factionId], allFactions: galaxy.factions });
  var ports = (y.ports || []).filter(function (p) { return p.market && !p.surface; });
  if (ports.length >= 2) { star = s; sys = y; a = ports[0]; b = ports[1]; }
}
check('found a system with two orbital ports', !!b);

var planet = sys.bodies.filter(function (q) { return q.kind === 'planet'; })[0];
var ship = Sim.circularOrbit(planet, sys, 0, planet.radius * 0.6, 0.1, 0);
ship.cargo = {}; Combat.initShip(ship); Sim.refreshShip(ship);
Sim.dockShip(ship, a, sys, 0);
var G = { ship: ship, sys: sys, galaxy: galaxy, here: star, t: 0 };

var m = { toPortId: b.id, toName: b.name };
var r = Missions.reach(G, m);
var truth = V.dist(ship.pos, Sim.bodyPosition(b, sys, 0));
check('measures from the ship to the target', r && Math.abs(r.km - truth) < 1e-6 * Math.max(1, truth),
      r ? r.text : 'null');
check('gives a burn time when the hull can thrust', r && r.secs > 0 &&
      Math.abs(r.secs - 2 * Math.sqrt(truth / ship.maxAccel)) < 1e-6 * r.secs);
check('the line says "at full burn"', r && /at full burn/.test(r.text));

check('docked at the target says so', /docked here/.test(Missions.reach(G, { toPortId: a.id }).text));

var before = r.km;
G.ship = { pos: Sim.bodyPosition(b, sys, 0), maxAccel: ship.maxAccel };
var near = Missions.reach(G, m);
check('moves with the ship: next to the target is near zero', near.km < before * 1e-3,
      near.text);
G.ship = ship;

var far = galaxy.stars.filter(function (q) { return q.id !== star.id; })[0];
var rf = Missions.reach(G, { toStarId: far.id, toName: far.name + ' system' });
check('another star is given in light years', rf && rf.ly > 0 && / ly away/.test(rf.text), rf && rf.text);
check('...and the ly matches the chart', rf && Math.abs(rf.ly - Galaxy.distance3(star, far)) < 1e-9);

check('this star, no port: says any port', /any port/.test(Missions.reach(G, { toStarId: star.id }).text));
check('no target recorded: says nothing', Missions.reach(G, { toName: 'somewhere' }) === null);
check('no hull thrust: distance but no time', (function () {
  var save = ship.maxAccel; ship.maxAccel = 0;
  var q = Missions.reach(G, m); ship.maxAccel = save;
  return q && q.secs === null && !/burn/.test(q.text);
})());

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
