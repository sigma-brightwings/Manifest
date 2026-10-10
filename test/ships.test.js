/* ships.test.js — factions, patrols, and the rails/live boundary.
 *
 *     node test/ships.test.js
 *
 * The interesting thing to defend here is the seam. Police, escorts and
 * pirates are pure functions of time until the player is close enough to
 * matter, at which point they are lifted off their rail into a steered
 * agent. Both halves are easy; the seam is where bugs live, so most of what
 * follows is about crossing it in both directions.
 */
var V = require('../src/vec3.js');
var Eco = require('../src/economy.js');
var Gen = require('../src/generate.js');
var Sim = require('../src/sim.js');
var Combat = require('../src/combat.js');

var pass = 0, fail = 0;
function check(n, c, d) { if (c) pass++; else { fail++; console.log('  FAIL  ' + n + (d ? '   ' + d : '')); } }
function seeds(n) { var o = []; for (var i = 0; i < n; i++) o.push('seed-' + i); return o; }

console.log('--- factions ---');
(function () {
  var unowned = 0, noFac = 0, outlawPort = 0, kinds = {};
  seeds(120).forEach(function (sd) {
    var sys = Gen.generateSystem(sd);
    if (!sys.factions.length) noFac++;
    sys.ports.forEach(function (p) {
      if (!p.faction || !sys.factionById[p.faction]) unowned++;
      if (p.faction === 'outlaw') outlawPort++;
    });
    (sys.patrols || []).forEach(function (n) { kinds[n.kind] = (kinds[n.kind] || 0) + 1; });
  });
  check('every system has at least one faction', noFac === 0);
  check('every port belongs to a known faction', unowned === 0, unowned + ' unowned');
  check('no port flies the outlaw flag', outlawPort === 0, outlawPort + ' bad');
  check('police are generated', kinds.police > 0, String(kinds.police));
  check('pirates are generated', kinds.pirate > 0, String(kinds.pirate));
  console.log('  across 120 systems: ' + JSON.stringify(kinds));
})();

console.log('--- patrols on rails ---');
(function () {
  var bad = 0, nan = 0, insideBody = 0, notDeterministic = 0, checked = 0;
  seeds(40).forEach(function (sd) {
    var sys = Gen.generateSystem(sd);
    (sys.patrols || []).forEach(function (spec) {
      checked++;
      for (var k = 0; k < 30; k++) {
        var t = k * 7.3e4;
        var st = Sim.patrolState(spec, sys, t);
        if (!st || !isFinite(st.pos.x) || !isFinite(st.pos.y) || !isFinite(st.pos.z)) { nan++; break; }
        if (!isFinite(st.fwd.x) || Math.abs(V.len(st.fwd) - 1) > 1e-6) { bad++; break; }
        // A pirate loitering inside its planet would be a generation bug.
        if (spec.rail.type === 'orbit') {
          var parent = sys.byId[spec.rail.parent];
          if (V.dist(st.pos, Sim.bodyPosition(parent, sys, t)) < parent.radius) { insideBody++; break; }
        }
      }
      // Pure function of t, like everything else on a rail.
      var a = Sim.patrolState(spec, sys, 55555).pos;
      Sim.patrolState(spec, sys, 9e6);
      var b = Sim.patrolState(spec, sys, 55555).pos;
      if (V.dist(a, b) > 1e-9) notDeterministic++;
    });
  });
  check('patrol positions are finite with a unit heading', nan === 0 && bad === 0, nan + ' nan, ' + bad + ' bad');
  check('no pirate loiters inside the world it is watching', insideBody === 0, insideBody + ' bad');
  check('patrol positions are a pure function of time', notDeterministic === 0, notDeterministic + ' bad');
  console.log('  (' + checked + ' patrols checked)');
})();

console.log('--- waking and sleeping ---');
(function () {
  var sys = Gen.generateSystem('kawartha');
  var pirate = sys.patrols.filter(function (p) { return p.kind === 'pirate'; })[0];
  check('there is a pirate to test', !!pirate);

  var t = 0;
  var rail = Sim.patrolState(pirate, sys, t);
  // Put the player right next to it, moving with it.
  var ship = Sim.makeShip(V.addScaled(rail.pos, { x: 1, y: 0, z: 0 }, 900), rail.vel);
  ship.cargo.rare = 30;
  ship.credits = 5000;
  Sim.refreshShip(ship);

  var far = Sim.makeShip(V.addScaled(rail.pos, { x: 1, y: 0, z: 0 }, 50000), rail.vel);
  var r0 = Sim.updateEncounters(sys, t, 1, far);
  check('a distant pirate stays on its rail', r0.active.length === 0 && !pirate.live);

  var r1 = Sim.updateEncounters(sys, t, 1, ship);
  check('a close pirate wakes', r1.active.length > 0 && !!pirate.live, String(r1.active.length));
  check('waking pins the time warp', r1.warpCap <= 500, String(r1.warpCap));

  /* Fly the encounter forward. The PLAYER has to be integrated too --
   * leaving the ship frozen in absolute space while the pirate flies its
   * orbit means the pirate is chasing a point that is violating physics at
   * roughly the planet's 48 km/s heliocentric speed, and it will of course
   * appear to run away. (This was a real bug in the first draft of this
   * test, and it is exactly the reference-frame mistake that keeps biting
   * everything else in this codebase.) */
  var closed = false, demanded = false;
  for (var i = 0; i < 900 && !demanded; i++) {
    var adv = Sim.advanceShip(ship, sys, t, 2, 3000);
    t = adv.t;
    var res = Sim.updateEncounters(sys, t, 2, ship);
    if (!pirate.live) break;
    var rng = V.dist(pirate.live.pos, ship.pos);
    if (rng < Sim.CLOSE_RANGE) closed = true;
    if (res.demand) demanded = true;
    if (!isFinite(pirate.live.pos.x)) break;
  }
  check('the pirate actually closes to interdiction range', closed);
  check('it then makes a demand', demanded);

  if (demanded) {
    var d = Sim.pirateDemand(pirate, ship, Eco);
    check('it demands the most valuable thing aboard', d.type === 'cargo' && d.cid === 'rare',
          JSON.stringify(d));
    var before = ship.cargo.rare;
    var paid = Sim.payPirate(pirate, ship, Eco);
    check('handing it over actually costs you the cargo', (ship.cargo.rare || 0) < before, paid);
    check('paying makes it break off', pirate.mode === 'breakoff');
  }

  // Docking is sanctuary.
  var pirate2 = sys.patrols.filter(function (p) { return p.kind === 'pirate'; })[0];
  var rail2 = Sim.patrolState(pirate2, sys, t);
  var docked = Sim.makeShip(V.addScaled(rail2.pos, { x: 0, y: 1, z: 0 }, 400), rail2.vel);
  docked.docked = sys.ports[0].id;
  var r2 = Sim.updateEncounters(sys, t, 1, docked);
  check('nobody interdicts a ship on the clamps', r2.active.length === 0);
})();

console.log('--- an empty hold is a demand for cash, not a free pass ---');
(function () {
  var sys = Gen.generateSystem('seed-7');
  var pirate = sys.patrols.filter(function (p) { return p.kind === 'pirate'; })[0];
  var ship = Sim.makeShip({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 });
  ship.credits = 4000;
  var d = Sim.pirateDemand(pirate, ship, Eco);
  check('an empty hold is shaken down for credits', d.type === 'credits' && d.credits > 0, JSON.stringify(d));
  // Waste is not worth robbing anyone of.
  var ship2 = Sim.makeShip({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 });
  ship2.cargo.waste = 40; ship2.credits = 4000;
  var p2 = sys.patrols.filter(function (p) { return p.kind === 'pirate'; })[0];
  p2._demand = null;
  var d2 = Sim.pirateDemand(p2, ship2, Eco);
  check('nobody robs you of radioactive waste', d2.type === 'credits', JSON.stringify(d2));
})();

console.log('--- a laden ship cannot outrun a pirate; an empty one can ---');
(function () {
  var sys = Gen.generateSystem('kawartha');
  var pirateAccel = Gen.PATROL_CLASSES.pirate.accel;
  var planet = sys.bodies.filter(function (b) { return b.kind === 'planet'; })[1];
  var empty = Sim.circularOrbit(planet, sys, 0, planet.radius * 0.5, 0, 0);
  /* A REAL TALON, not the bare hull circularOrbit hands back.
   *
   * That hull carries SHIP_SPEC's thrust — the generator's lift reference,
   * which is deliberately frozen at the value the galaxy's surface ports
   * were placed against and is no longer what any ship flies. So this
   * whole section was measuring a ship that does not exist: the hulls were
   * given half as much thrust again and all three checks below sat there
   * passing. Ask combat.js for the numbers and the guard points at the
   * ship the player is actually in. */
  var talon = Combat.HULLS.talon;
  empty.dryMass = talon.dryMass;
  empty.thrustKN = talon.thrustKN;
  empty.cargoCap = talon.cargoCap;
  empty.fuelCap = talon.fuelCap; empty.fuel = talon.fuelCap;
  empty.thrusterCap = talon.thrusterCap; empty.thrusterFuel = talon.thrusterCap;
  Sim.refreshShip(empty);
  /* This is the counter-play to being held up, and it is entirely a
   * consequence of the mass model rather than a rule anywhere. It is also
   * fragile: anything that changes the ship's dry mass, its thrust or its
   * tankage can silently erase it, which is what happened when the thruster
   * tank was split out. Hence a margin rather than a bare comparison. */
  check('an empty ship comfortably outruns a pirate', empty.maxAccel > pirateAccel * 1.08,
        (empty.maxAccel * 1000).toFixed(2) + ' vs ' + (pirateAccel * 1000).toFixed(2) + ' m/s2');
  empty.cargo.ores = 64;
  Sim.refreshShip(empty);
  check('a full hold cannot', empty.maxAccel < pirateAccel * 0.85,
        (empty.maxAccel * 1000).toFixed(2) + ' vs ' + (pirateAccel * 1000).toFixed(2) + ' m/s2');
  // Half a hold is where it should get interesting rather than obvious.
  empty.cargo.ores = 26;
  Sim.refreshShip(empty);
  check('a half-full hold is roughly a match for one',
        Math.abs(empty.maxAccel - pirateAccel) / pirateAccel < 0.25,
        (empty.maxAccel * 1000).toFixed(2) + ' vs ' + (pirateAccel * 1000).toFixed(2) + ' m/s2');
  console.log('  laden ' + (empty.maxAccel * 1000).toFixed(1) +
              ' m/s2 against a pirate at ' + (pirateAccel * 1000).toFixed(1));

  /* AND EVERY HULL CAN STILL LEAVE THE WORST PAD IN THE GALAXY. The
   * generator decides where a surface port may exist from a frozen
   * reference thrust (SHIP_SPEC), not from the hulls — which is safe only
   * for as long as every real hull is stronger than the reference. A hull
   * lighter on thrust than that would be a ship that can land somewhere it
   * can never leave, and the player would find that out at the bottom of a
   * gravity well. */
  var worst = Gen.MAX_SURFACE_G;
  check('the galaxy has a worst pad at all', worst > 0, String(worst));
  Object.keys(Combat.HULLS).forEach(function (id) {
    var h = Combat.HULLS[id];
    var laden = h.dryMass + h.fuelCap + h.thrusterCap + h.cargoCap;
    var g = h.thrustKN / laden;
    check('a laden ' + id + ' can lift off the heaviest world with a port',
          g > worst, g.toFixed(2) + ' vs ' + worst.toFixed(2) + ' m/s2');
  });
})();

console.log('');
console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
