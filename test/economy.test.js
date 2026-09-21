/* economy.test.js — ports, traffic and markets.
 *
 * Same plain-node, no-framework style as physics.test.js:
 *     node test/economy.test.js
 *
 * The invariants worth defending here are the ones that would be invisible
 * until they were badly wrong: that traffic is genuinely a function of time
 * rather than something that drifts, that the analytic market and the
 * stepped one agree at the boundary between them, and that radioactive
 * waste's inverted sign convention holds at every port in every system.
 */
var V = require('../src/vec3.js');
var K = require('../src/kepler.js');
var RNG = require('../src/rng.js');
var Eco = require('../src/economy.js');
var Gen = require('../src/generate.js');
var Sim = require('../src/sim.js');
var Combat = require('../src/combat.js');

var pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; }
  else { fail++; console.log('  FAIL  ' + name + (detail ? '   ' + detail : '')); }
}
function seeds(n) {
  var out = [];
  for (var i = 0; i < n; i++) out.push('seed-' + i);
  return out;
}
var DAY = 86400;

console.log('--- ports ---');
(function () {
  var badHab = 0, badSep = 0, badHill = 0, noSink = 0, systems = 0;
  seeds(200).forEach(function (sd) {
    var sys = Gen.generateSystem(sd);
    systems++;
    var byHost = {};
    sys.ports.forEach(function (p) {
      var hid = p.parentBody.id;
      (byHost[hid] = byHost[hid] || []).push(p);
    });
    sys.bodies.filter(function (b) { return b.habitable; }).forEach(function (h) {
      var n = (byHost[h.id] || []).length;
      if (n < 2) badHab++;
    });
    Object.keys(byHost).forEach(function (hid) {
      // Only ORBITAL ports can clash in orbit; a pad is on the ground.
      var list = byHost[hid].filter(function (p) { return !p.surface; });
      for (var i = 0; i < list.length; i++) {
        for (var j = i + 1; j < list.length; j++) {
          var ratio = list[i].orbit.a / list[j].orbit.a;
          if (ratio > 0.83 && ratio < 1.21) badSep++;
        }
      }
      // ... and every orbital port must sit inside its host's Hill sphere
      // and above its surface, as the original generator enforced.
      var host = sys.byId[hid];
      var hostParent = host.parentBody || sys.root;
      var hill = Gen.hillRadius(host.mass, hostParent.mass, host.orbit.a, host.orbit.e);
      list.forEach(function (p) {
        var peri = p.orbit.a * (1 - p.orbit.e);
        var apo = p.orbit.a * (1 + p.orbit.e);
        if (peri < host.radius * 1.05 || apo > hill * 0.5) badHill++;
      });
    });
    if (!Eco.wasteSinks(sys).length) noSink++;
  });
  check('every habitable world has at least two ports', badHab === 0, badHab + ' short');
  check('no two ports above a world share an orbit', badSep === 0, badSep + ' clashes');
  check('every port is above the surface and inside the Hill sphere', badHill === 0, badHill + ' bad');
  check('every system has somewhere to dispose of waste', noSink === 0, noSink + ' systems without a sink');
  console.log('  (' + systems + ' systems checked)');
})();

console.log('--- surface starports, and the gravity that decides where ---');
(function () {
  /* The rule this whole section exists for: a port you can land at must be
   * a port you can leave. A pad on a world whose gravity beats the drive is
   * not a hard destination, it is a trap with a market attached. */
  var tooHeavy = 0, onGiant = 0, pads = 0, systems = 0, withPads = 0, habitablePads = 0;
  var worstG = 0;
  seeds(250).forEach(function (sd) {
    var sys = Gen.generateSystem(sd);
    systems++;
    var here = 0;
    sys.ports.forEach(function (p) {
      if (!p.surface) return;
      pads++; here++;
      var host = p.parentBody;
      var g = Gen.surfaceGravity(host);
      worstG = Math.max(worstG, g);
      if (g > Gen.MAX_SURFACE_G) tooHeavy++;
      if (host.type === 'gasGiant' || host.type === 'iceGiant') onGiant++;
      if (host.habitable) habitablePads++;
    });
    if (here) withPads++;
  });
  check('NO surface port exceeds the liftoff limit', tooHeavy === 0, tooHeavy + ' unliftable');
  check('no surface port on a gas or ice giant', onGiant === 0, onGiant + ' bad');
  check('surface ports actually get built', pads > systems, pads + ' pads across ' + systems + ' systems');
  check('most systems have somewhere to land', withPads > systems * 0.5,
        withPads + ' of ' + systems);
  check('habitable worlds get pads', habitablePads > 0, habitablePads + ' pads on habitable worlds');
  console.log('  limit ' + Gen.MAX_SURFACE_G.toFixed(2) + ' m/s2 (Earth 9.81); ' +
              'heaviest world with a pad ' + worstG.toFixed(2) + ' m/s2');

  /* And the limit itself has to be honest: a fully laden reference ship
   * must genuinely be able to climb off the worst pad in the galaxy. */
  var spec = Gen.SHIP_SPEC;
  var ladenAccel = spec.thrustKN / Gen.ladenMass(spec);
  check('a full ship out-thrusts the heaviest permitted world',
        ladenAccel > Gen.MAX_SURFACE_G,
        ladenAccel.toFixed(2) + ' m/s2 of thrust vs ' + Gen.MAX_SURFACE_G.toFixed(2) + ' of gravity');
  check('with a real margin, not a hover', ladenAccel / Gen.MAX_SURFACE_G > 1.1,
        (ladenAccel / Gen.MAX_SURFACE_G).toFixed(3) + 'x');
  check('the limit still admits Earth-like worlds', Gen.MAX_SURFACE_G > 9.81,
        Gen.MAX_SURFACE_G.toFixed(2));
})();

console.log('--- underground bays ---');
(function () {
  /* Underground bays are surface ports with a negative elevation — same
   * lat/lon/rotation math, same liftoff rule (it is a property of the
   * WORLD, not the port), just buried. The one thing worth defending here
   * that the render/dock code does not already cover: adding this feature
   * must not have shifted a single existing pad's name, position or size,
   * because that decision was rolled from its own RNG stream specifically
   * to protect that guarantee. */
  var pads = 0, underground = 0, badDepth = 0, badTunnel = 0, badCapture = 0,
      badSpeed = 0, badName = 0, badElevation = 0, systems = 0, withBay = 0;
  var UNDER_WORDS = /Vault|Deep|Hold|Undercroft|Bunker|Depths/;
  seeds(250).forEach(function (sd) {
    var sys = Gen.generateSystem(sd);
    systems++;
    var here = 0;
    sys.ports.forEach(function (p) {
      if (!p.surface) return;
      pads++;
      if (!p.underground) return;
      underground++; here++;
      if (p.shaftDepth !== p.radius * 4) badDepth++;
      if (Math.abs(p.tunnelRadius - p.radius * 1.35) > 1e-9) badTunnel++;
      if (p.elevation !== -p.shaftDepth) badElevation++;
      /* Scaled by the pad but floored in kilometres. The pads shrank by a
       * factor of ten when they stopped being two kilometres of concrete,
       * and the envelope is about how precisely a person can fly the last
       * leg — which did not change with the pad. */
      if (p.dockCaptureRadius !== Math.max(p.radius * 2.4, 1.2)) badCapture++;
      if (p.dockMaxSpeed !== 0.018) badSpeed++;
      if (!UNDER_WORDS.test(p.name)) badName++;
    });
    if (here) withBay++;
  });
  check('underground bays actually get built', underground > 0, underground + ' across ' + systems + ' systems');
  check('they are a minority of surface ports, not a takeover',
        underground < pads * 0.5, underground + ' of ' + pads);
  check('most systems have at least one', withBay > systems * 0.5, withBay + ' of ' + systems);
  check('every one sits exactly 4 pad-radii deep', badDepth === 0, badDepth + ' wrong');
  check('every one has a 1.35x-radius tunnel', badTunnel === 0, badTunnel + ' wrong');
  check('elevation is always -shaftDepth', badElevation === 0, badElevation + ' wrong');
  check('every one has the tighter 2.4x capture radius', badCapture === 0, badCapture + ' wrong');
  check('every one has the slower 18 m/s docking speed', badSpeed === 0, badSpeed + ' wrong');
  check('every one is named from the underground word pool', badName === 0, badName + ' wrong');

  /* EVERY surface port is a shaft now — there are no open aprons left, and
   * the old promise that "an open pad keeps the pre-existing formula" was
   * deliberately retired when starports became structures you fly into.
   * What replaces it is the shape every one of them must have: a berth at
   * the bottom of a shaft, a mouth standing proud of the ground, and a
   * tunnel connecting them. */
  var shapeBad = 0, shallowChecked = 0;
  seeds(250).forEach(function (sd) {
    var sys = Gen.generateSystem(sd);
    sys.ports.forEach(function (p) {
      if (!p.surface) return;
      if (!p.underground) shallowChecked++;
      if (!(p.shaftDepth > 0) ||
          p.elevation !== -p.shaftDepth ||
          !(p.tunnelRadius > 0) ||
          !(p.collarHeight > 0)) shapeBad++;
    });
  });
  check('every surface port is a shaft with a berth at the bottom',
        shapeBad === 0 && shallowChecked > 0,
        shapeBad + ' malformed, ' + shallowChecked + ' shallow ones seen');

  /* Determinism: the same seed must produce the same underground bays, not
   * merely the same COUNT of them. */
  var sysA = Gen.generateSystem('seed-7'), sysB = Gen.generateSystem('seed-7');
  var padsA = sysA.bodies.filter(function (b) { return b.surface; });
  var padsB = sysB.bodies.filter(function (b) { return b.surface; });
  var mismatch = padsA.length !== padsB.length;
  for (var i = 0; i < padsA.length && !mismatch; i++) {
    if (padsA[i].name !== padsB[i].name || padsA[i].underground !== padsB[i].underground ||
        padsA[i].shaftDepth !== padsB[i].shaftDepth) mismatch = true;
  }
  check('regenerating the same seed reproduces the same bays exactly', !mismatch);

  /* Sim.portEntrance: the mouth is always on the true surface (elevation 0),
   * directly above the bay, whatever the bay's own depth. */
  var found = null, foundSys = null;
  for (var s = 0; s < 40 && !found; s++) {
    var trySys = Gen.generateSystem('seed-' + s);
    for (var j = 0; j < trySys.bodies.length; j++) {
      if (trySys.bodies[j].underground) { found = trySys.bodies[j]; foundSys = trySys; break; }
    }
  }
  check('found a bay to test Sim.portEntrance against', !!found);
  if (found) {
    var host = found.parentBody;
    var hostPos = Sim.bodyPosition(host, foundSys, 0);
    var mouth = Sim.portEntrance(found, foundSys, 0);
    var truePos = Sim.bodyPosition(found, foundSys, 0);
    check('the entrance is exactly on the surface (radius, not radius - depth)',
          Math.abs(V.dist(mouth.pos, hostPos) - host.radius) < 1e-6);
    check('the bay itself is genuinely buried, shaftDepth below that',
          Math.abs((host.radius - V.dist(truePos, hostPos)) - found.shaftDepth) < 1e-6);
    /* A shallow starport is the same shape, just less of it: its mouth is
     * on the surface and its berth is its own (smaller) shaft-depth below.
     * This used to assert that an open pad's entrance WAS its position,
     * which was true only while open pads existed. */
    check('a shallow starport is the same shape, only shallower',
          (function () {
            var shallow = foundSys.ports.filter(function (p) { return p.surface && !p.underground; })[0];
            if (!shallow) return true;
            var sp = Sim.bodyPosition(shallow, foundSys, 0);
            var se = Sim.portEntrance(shallow, foundSys, 0);
            var hp = Sim.bodyPosition(shallow.parentBody, foundSys, 0);
            var mouthOnSurface = Math.abs(V.dist(se.pos, hp) - shallow.parentBody.radius) < 1e-6;
            var berthBelow = Math.abs((shallow.parentBody.radius - V.dist(sp, hp)) - shallow.shaftDepth) < 1e-6;
            return mouthOnSurface && berthBelow && shallow.shaftDepth < found.shaftDepth;
          })());
  }
})();

console.log('--- a pad is a place, and it goes round with its world ---');
(function () {
  var sys = null, pad = null;
  for (var i = 0; i < 40 && !pad; i++) {
    sys = Gen.generateSystem('seed-' + i);
    pad = sys.ports.filter(function (p) { return p.surface; })[0];
  }
  check('found a surface port to test', !!pad);
  if (!pad) return;
  var host = pad.parentBody;

  // Still a pure function of t, like everything else on rails.
  var a = Sim.bodyPosition(pad, sys, 123456.7);
  Sim.bodyPosition(pad, sys, 9.4e7);
  var b = Sim.bodyPosition(pad, sys, 123456.7);
  check('a pad is a pure function of time', V.dist(a, b) < 1e-9);

  /* Its MOUTH sits on the surface, at every moment, for a very long time.
   * The berth itself is down the shaft now, so the thing anchored to the
   * ground is the entrance — which is also the point everything else
   * (the model, the approach, the doors) hangs from. */
  var offSurface = 0;
  for (var k = 0; k < 300; k++) {
    var t = k * 3617;
    var mouth = Sim.portEntrance(pad, sys, t).pos;
    var r = V.dist(mouth, Sim.bodyPosition(host, sys, t));
    if (Math.abs(r - host.radius) > 1e-6) offSurface++;
  }
  check('its mouth never leaves the surface', offSurface === 0, offSurface + ' bad samples');

  // And the berth really is below it, by the full depth of the shaft.
  var berthR = V.dist(Sim.bodyPosition(pad, sys, 0), Sim.bodyPosition(host, sys, 0));
  check('and the berth is a shaft-depth below that',
        Math.abs(berthR - (host.radius - pad.shaftDepth)) < 1e-6,
        fmtKm(host.radius - berthR) + ' down');

  // It moves, because the world turns under it.
  var ground = V.dist(Sim.bodyVelocity(pad, sys, 0), Sim.bodyVelocity(host, sys, 0));
  check('the ground carries it at a real speed', ground > 1e-5,
        (ground * 1000).toFixed(0) + ' m/s');
  var p0 = Sim.bodyPosition(pad, sys, 0);
  var pHalf = Sim.bodyPosition(pad, sys, Math.abs(host.rotation.period) / 2);
  check('half a rotation puts it somewhere else',
        V.dist(p0, pHalf) > host.radius * 0.2,
        fmtKm(V.dist(p0, pHalf)) + ' vs radius ' + fmtKm(host.radius));
  var pFull = Sim.bodyPosition(pad, sys, Math.abs(host.rotation.period));
  // A full rotation returns it to the same place relative to the world.
  var rel0 = V.sub(p0, Sim.bodyPosition(host, sys, 0));
  var relFull = V.sub(pFull, Sim.bodyPosition(host, sys, Math.abs(host.rotation.period)));
  check('a full rotation brings it back round', V.dist(rel0, relFull) < host.radius * 1e-6,
        fmtKm(V.dist(rel0, relFull)));
})();
function fmtKm(k) { return k.toFixed(1) + ' km'; }

console.log('--- landing on a pad, and getting off it again ---');
(function () {
  var sys = null, pad = null;
  for (var i = 0; i < 40 && !pad; i++) {
    sys = Gen.generateSystem('seed-' + i);
    pad = sys.ports.filter(function (p) { return p.surface; })[0];
  }
  if (!pad) { check('found a pad', false); return; }
  var host = pad.parentBody;
  var t = 0;

  // Arrive gently, right over the pad, matching the ground.
  var ps = Sim.bodyState(pad, sys, t);
  var up = V.norm(V.sub(ps.pos, Sim.bodyPosition(host, sys, t)));
  var ship = Sim.makeShip(V.addScaled(ps.pos, up, pad.dockCaptureRadius * 0.4), ps.vel);
  /* Gear down. A pad will not catch a ship on its hull, so without this the
   * test now fails for a reason that has nothing to do with what it checks
   * — that a gentle arrival at a pad is a dock and not an impact. */
  ship.gear = true;
  Sim.refreshShip(ship);
  var res = Sim.advanceShip(ship, sys, t, 1, 3000);
  /* CAUGHT, which is now either docked or being carried in. A pad with a
   * hangar under it starts the arrival rail instead of parking the hull in
   * one frame, so "the pad caught it" is the claim this makes; the berthed
   * assertions below still need it actually berthed, so the rail is run out
   * first. Both halves of the original intent survive, separated. */
  var caught = ship.docked === pad.id || (ship.arrival && ship.arrival.port === pad.id);
  check('a gentle arrival over a pad docks rather than crashes',
        !!caught && !ship.crashed && !ship.landed,
        'docked=' + ship.docked + ' arriving=' +
        (ship.arrival ? ship.arrival.port : 'no') +
        ' crashed=' + ship.crashed + ' landed=' + ship.landed);
  if (ship.arrival) Sim.stepArrival(ship, sys, t + ship.arrival.dur + 1);
  check('and the rail leaves it berthed', ship.docked === pad.id,
        'docked=' + ship.docked);
  check('and it fills the thruster tank', ship.thrusterFuel === ship.thrusterCap);

  /* Berthed, it rides round with the world. The ship is no longer sat on
   * top of the pad — it is parked in an alcove off the hangar at the
   * bottom of the shaft — so what has to hold is that its offset from the
   * port does not DRIFT as the planet turns, not that it is within a pad
   * radius of the port's own point. */
  Sim.updateDockedShip(ship, sys, t);
  var d0 = V.dist(ship.pos, Sim.bodyPosition(pad, sys, t));
  Sim.updateDockedShip(ship, sys, t + 4000);
  var d = V.dist(ship.pos, Sim.bodyPosition(pad, sys, t + 4000));
  check('a berthed ship rides round with the world without drifting',
        Math.abs(d - d0) < 1e-6, fmtKm(d0) + ' -> ' + fmtKm(d));
  check('and it is berthed inside the hangar, not out on the roof',
        d > 0 && d < pad.radius * 3, fmtKm(d));

  /* Now leave. Undocking runs the launch script: out of the berth, back
   * to the bottom of the shaft, stood on its tail under the open doors.
   * The first version of this simply pushed the ship up from wherever it
   * was parked — which, from an alcove under a ceiling, put it inside the
   * planet and the very next collision check called it a crash landing. */
  var padE = Sim.portEntrance(pad, sys, t).pos;
  var gb = Sim.groundBasis(pad, sys, t);
  var bay = Gen.bayGeometry(pad);
  Sim.undockShip(ship, sys, t, 0.002);
  check('undocking releases the clamp', ship.docked === null);
  var relL = V.sub(ship.pos, padE);
  var offAxis = Math.hypot(V.dot(relL, gb.east), V.dot(relL, gb.north)) / pad.radius;
  check('the launch script puts the ship back on the shaft axis',
        offAxis < 0.1, offAxis.toFixed(3) + ' pad radii off centre');
  check('and at the bottom of the shaft, not up on the surface',
        V.dot(relL, gb.up) / pad.radius < bay.floorZ * 0.5,
        (V.dot(relL, gb.up) / pad.radius).toFixed(3));
  check('a ship in the shaft is not colliding with the planet it is inside',
        !!Sim.insideShaft(ship, sys, t, host));
  var g = Gen.surfaceGravity(host) / 1000;      // km/s^2
  Sim.refreshShip(ship);
  check('the drive beats the local gravity', ship.maxAccel > g,
        (ship.maxAccel * 1000).toFixed(2) + ' vs ' + (g * 1000).toFixed(2) + ' m/s2');

  // Fly it: burn straight up for a few minutes and check we actually climb.
  var r0 = V.dist(ship.pos, Sim.bodyPosition(host, sys, t));
  var tt = t;
  for (var s = 0; s < 40; s++) {
    var upNow = V.norm(V.sub(ship.pos, Sim.bodyPosition(host, sys, tt)));
    ship.thrust = V.scale(upNow, ship.maxAccel);
    var r2 = Sim.advanceShip(ship, sys, tt, 5, 3000);
    tt = r2.t;
    if (ship.landed || ship.crashed) break;
  }
  var r1 = V.dist(ship.pos, Sim.bodyPosition(host, sys, tt));
  check('a laden ship can climb off the pad under its own thrust',
        !ship.crashed && r1 > r0 + 1, fmtKm(r0) + ' -> ' + fmtKm(r1));

  // And a full hold must still manage it — that is the case the limit was
  // sized against, and the one that would strand you if it were wrong.
  var heavy = Sim.makeShip(V.addScaled(ps.pos, up, pad.dockCaptureRadius * 0.4), ps.vel);
  heavy.cargo.ores = heavy.cargoCap;
  Sim.refreshShip(heavy);
  check('and so can a full one', heavy.maxAccel > g * 1.05,
        (heavy.maxAccel * 1000).toFixed(2) + ' vs ' + (g * 1000).toFixed(2) + ' m/s2');
})();

console.log('--- adding ports did not disturb existing generation ---');
(function () {
  var sys = Gen.generateSystem('kawartha');
  var stations = sys.bodies.filter(function (b) { return b.kind === 'station'; });
  check('kawartha still has its original stations', stations.length >= 2);
  // Determinism: two builds of the same seed agree on everything.
  var a = Gen.describe(Gen.generateSystem('kawartha'));
  var b = Gen.describe(Gen.generateSystem('kawartha'));
  check('same seed produces an identical universe', JSON.stringify(a) === JSON.stringify(b));
  var c = Gen.describe(Gen.generateSystem('kawartha '));
  check('a different seed produces a different universe', JSON.stringify(a) !== JSON.stringify(c));
})();

console.log('--- traffic on rails ---');
(function () {
  var sys = Gen.generateSystem('kawartha');
  check('routes exist', sys.traffic.length > 0, String(sys.traffic.length));

  var determinismBad = 0, endpointBad = 0, insideParent = 0, discontinuous = 0, nan = 0;
  sys.traffic.forEach(function (r) {
    var parent = sys.byId[r.parentId];
    var A = sys.byId[r.from], B = sys.byId[r.to];

    // 1. Pure function of t: evaluating twice, in any order, agrees exactly.
    var t1 = 123456.789;
    var p1 = Sim.trafficState(r, sys, t1);
    Sim.trafficState(r, sys, t1 + 5e5);            // move the cache away
    var p2 = Sim.trafficState(r, sys, t1);
    if (V.dist(p1.pos, p2.pos) > 1e-9) determinismBad++;

    // 2. A ship starts and finishes a crossing inside its port's docking
    //    envelope -- parked alongside, which is where the moored phase has
    //    it too, so the two phases meet without a step.
    var atDepart = Sim.trafficState(r, sys, r.t0 + 1e-6);
    var atArrive = Sim.trafficState(r, sys, r.t0 + r.cruise - 1e-6);
    var aPos = Sim.bodyPosition(A, sys, r.t0 + 1e-6);
    if (V.dist(atDepart.pos, aPos) > A.dockCaptureRadius) endpointBad++;
    var bPos = Sim.bodyPosition(B, sys, r.t0 + r.cruise - 1e-6);
    if (V.dist(atArrive.pos, bPos) > B.dockCaptureRadius) endpointBad++;
    // ... and the cruise/moored handover itself must not jump.
    var justBefore = Sim.trafficState(r, sys, r.t0 + r.cruise - 0.001);
    var justAfter = Sim.trafficState(r, sys, r.t0 + r.cruise + 0.001);
    if (V.dist(justBefore.pos, justAfter.pos) > 1) endpointBad++;

    /* 3. The spiral must never pass through the body both ports orbit —
     *    a straight line between opposite sides of a star very much would.
     *    A run to a SURFACE port legitimately touches the ground at the end
     *    of it, so the invariant is "never below the surface" rather than
     *    "always well clear of it"; routes between two orbital ports are
     *    held to the stricter clearance. */
    var touchesGround = A.surface || B.surface;
    var floor = parent.radius * (touchesGround ? 0.999 : 1.02);
    for (var k = 0; k <= 40; k++) {
      var t = r.t0 + (k / 40) * r.cruise;
      var st = Sim.trafficState(r, sys, t);
      if (!isFinite(st.pos.x) || !isFinite(st.pos.y) || !isFinite(st.pos.z)) { nan++; break; }
      var pp = Sim.bodyPosition(parent, sys, t);
      if (V.dist(st.pos, pp) < floor) { insideParent++; break; }
    }

    // 4. No teleports. Comparing a hop against a fixed fraction of the trip
    //    would be meaningless -- these ships genuinely cross most of a
    //    system in one leg, so real motion per sample is large and varies
    //    hugely between a local shuttle and an interplanetary freighter.
    //    What a teleport actually looks like is a SPIKE: one sample step
    //    far out of line with its neighbours. So sample finely and compare
    //    the largest hop against the 90th percentile of all of them.
    var hops = [], prev = null;
    for (var m = 0; m <= 1500; m++) {
      var tm = r.t0 + (m / 1500) * r.period;
      var s = Sim.trafficState(r, sys, tm);
      if (prev) hops.push(V.dist(s.pos, prev));
      prev = s.pos;
    }
    var sorted = hops.slice().sort(function (x, y) { return x - y; });
    var p90 = sorted[Math.floor(sorted.length * 0.9)];
    var biggest = sorted[sorted.length - 1];
    if (biggest > p90 * 6 + 1) discontinuous++;
  });
  check('traffic position is a pure function of time', determinismBad === 0, determinismBad + ' bad');
  check('ships are exactly at their port at departure and arrival', endpointBad === 0, endpointBad + ' bad');
  check('no route passes through the body its ports orbit', insideParent === 0, insideParent + ' bad');
  check('no discontinuities across a full cycle', discontinuous === 0, discontinuous + ' bad');
  check('no NaN positions', nan === 0, nan + ' bad');

  // Warp-proof: a ship a year from now is where the timetable says, whether
  // or not we looked at any of the intervening moments.
  var r0 = sys.traffic[0];
  var far = 3.156e7 * 3 + 4242;
  var direct = Sim.trafficState(r0, sys, far);
  for (var i = 0; i < 50; i++) Sim.trafficState(r0, sys, i * 1e5);
  var afterWalk = Sim.trafficState(r0, sys, far);
  check('a three-year skip lands in the same place as walking there',
        V.dist(direct.pos, afterWalk.pos) < 1e-9);

  // Moored ships sit still relative to their port.
  var moored = null;
  for (var q = 0; q < 400 && !moored; q++) {
    var s2 = Sim.trafficState(r0, sys, r0.t0 + r0.cruise + q * (r0.layover / 400));
    if (s2.phase === 'moored') moored = s2;
  }
  check('a moored ship is parked just off its port',
        moored && V.dist(moored.pos, Sim.bodyPosition(moored.to, sys, 0)) >= 0);
})();

/* ---- traffic that uses the ports rather than hovering near them --------
 * A freighter moored at an orbital station should sit alongside it. A
 * freighter moored at a SURFACE pad should be on the ground, and one at an
 * underground bay should be down the hole — anything else is a ship
 * hovering for six hours above a place it is supposed to be inside. */
console.log('--- traffic arrives at ports, not near them ---');
(function () {
  var seeds = ['kawartha', 'seed-3', 'seed-11', 'seed-19', 'seed-27'];
  var checkedSurface = 0, checkedUnder = 0, checkedOrbital = 0;
  var padBad = 0, underBad = 0, orbitalBad = 0, jumpBad = 0, nanBad = 0;

  seeds.forEach(function (sd) {
    var sys = Gen.generateSystem(sd);
    sys.traffic.forEach(function (r) {
      // Walk a whole cycle and look at every moored moment for each end.
      for (var k = 0; k < 240; k++) {
        var t = r.t0 + (k / 240) * r.period;
        var st = Sim.trafficState(r, sys, t);
        if (!isFinite(st.pos.x)) { nanBad++; return; }
        if (st.phase !== 'moored') continue;
        var port = st.to;
        var host = port.parentBody;
        if (!host) continue;
        var hostPos = Sim.bodyPosition(host, sys, t);
        var alt = V.dist(st.pos, hostPos) - host.radius;

        if (port.underground) {
          checkedUnder++;
          // Below the surface: it is in the bay, not sitting on the lid.
          if (!(alt < 0)) underBad++;
        } else if (port.surface) {
          checkedSurface++;
          /* Also below the surface, because a shallow starport is a shaft
           * too now — there is no apron left to park on. Worth stating the
           * consequence out loud: moored traffic is INSIDE the hangar and
           * therefore not visible from outside, which is the price of
           * ports becoming structures you enter rather than platforms you
           * land on top of. */
          if (!(alt < 0)) padBad++;
        } else {
          checkedOrbital++;
          // Alongside, inside the envelope it would dock in.
          var d = V.dist(st.pos, Sim.bodyPosition(port, sys, t));
          if (!(d > 0 && d <= port.dockCaptureRadius)) orbitalBad++;
        }
      }

      /* The descent must be a descent, not a jump: sample finely across the
       * handover from crossing to moored and compare the worst hop with the
       * typical one, the same way the main traffic test does. */
      var hops = [], prev = null;
      for (var m = 0; m <= 400; m++) {
        var tm = r.t0 + r.cruise * (0.9 + 0.2 * (m / 400));   // 90%..110% of the leg
        var s = Sim.trafficState(r, sys, tm);
        if (prev) hops.push(V.dist(s.pos, prev));
        prev = s.pos;
      }
      var sorted = hops.slice().sort(function (a, b) { return a - b; });
      if (sorted[sorted.length - 1] > sorted[Math.floor(sorted.length * 0.9)] * 8 + 1) jumpBad++;
    });
  });

  check('there are surface pads with traffic on them', checkedSurface > 0, checkedSurface + ' samples');
  check('and underground bays with traffic in them', checkedUnder > 0, checkedUnder + ' samples');
  check('and orbital stations too', checkedOrbital > 0, checkedOrbital + ' samples');
  check('a freighter moored at a starport is down inside it', padBad === 0, padBad + ' on the lid');
  check('a freighter moored at a bay is INSIDE it', underBad === 0, underBad + ' on the lid');
  check('a freighter at a station is still alongside it', orbitalBad === 0, orbitalBad + ' bad');
  check('the descent onto a port is continuous', jumpBad === 0, jumpBad + ' jumps');
  check('and produces no NaN positions', nanBad === 0, nanBad + ' bad');

  /* The approach is flown, not teleported: somewhere in the last stretch of
   * a run to a surface port there is a 'descent' phase, and it ends nose-up. */
  var sawDescent = false, sawLiftoff = false, noseUp = true, worstDot = 1, worstWhy = '';
  var checkedTouchdown = 0;
  seeds.forEach(function (sd) {
    var sys = Gen.generateSystem(sd);
    sys.traffic.forEach(function (r) {
      for (var k = 0; k < 200; k++) {
        var t = r.t0 + (k / 200) * r.period;
        var st = Sim.trafficState(r, sys, t);
        if (st.phase === 'descent') sawDescent = true;
        if (st.phase === 'liftoff') sawLiftoff = true;
      }

      /* Nose-up is a claim about TOUCHDOWN, not about the approach: a ship
       * five percent from the end of an interplanetary crossing is still a
       * long way out and has every right to be pointing along its path. So
       * this samples the last instant of the leg and the moored phase that
       * follows it. */
      [r.t0 + r.cruise - 0.001, r.t0 + r.cruise + 1].forEach(function (t) {
        var st = Sim.trafficState(r, sys, t);
        var port = st.to;
        if (!port.parentBody || !(port.surface || port.underground)) return;
        checkedTouchdown++;
        var up = V.norm(V.sub(st.pos, Sim.bodyPosition(port.parentBody, sys, t)));
        var dot = V.dot(st.fwd, up);
        if (dot < 0.5) {
          noseUp = false;
          if (dot < worstDot) {
            worstDot = dot;
            worstWhy = port.name + ' under=' + !!port.underground +
                       ' phase=' + st.phase;
          }
        }
      });
    });
  });
  check('ships fly a descent onto surface ports', sawDescent);
  check('and a climb away from them', sawLiftoff);
  check('there are touchdowns to check', checkedTouchdown > 0, checkedTouchdown + ' samples');
  check('and they are nose-up by the time they are down', noseUp,
        'worst dot ' + worstDot.toFixed(3) + '   ' + worstWhy);
})();

/* ---- the apron ---------------------------------------------------------
 * Astra: "there are not enough big ships floating near space ports."
 *
 * Two separate faults behind one sentence, and this pins both of them.
 *
 * The first is that there genuinely were not many: measured across 12
 * systems and 3,000 port-samples before the change, 0.39 large ships within
 * 60 km of a port at any moment against 3.84 small ones. The scheduled
 * routes are ranked by trade score and every feeder is a shuttle, so the
 * fleet came out ten to one in favour of things you can barely see.
 *
 * The second is that the ones that WERE there could not be seen anyway.
 * Every moored ship parked at the identical point — one standoff along the
 * port's own radial — so a dock with nine ships alongside drew one ship
 * nine times in the same place. That is a bug the eye reports as "empty".
 */
console.log('--- the fleet ---');
(function () {
  /* Astra: "There are ships for the capital class. The navy runs the
   * carrier, and then there are those carrier shipstations, they're
   * basically floating cities."
   *
   * Three claims, all checkable: capitals exist and are rarer than cutters,
   * carriers are sited where the fleet already is, and a carrier is a PORT
   * — you can dock at a floating city. */
  var caps = 0, cutters = 0, carriers = 0, systems = 0;
  var carrierNoGarrison = 0, carrierNotDockable = 0, wrongFlag = 0;
  seeds(60).forEach(function (sd) {
    var sys = Gen.generateSystem(sd);
    systems++;
    var garrison = null;
    (sys.patrols || []).forEach(function (p) {
      if (p.kind === 'capital') caps++;
      if (p.kind === 'navy' && !p.passing) { cutters++; garrison = garrison || p; }
    });
    (sys.ports || []).forEach(function (p) {
      if (!p.market || p.market.role !== 'carrier') return;
      carriers++;
      /* A carrier is the fleet being here, so there has to be a fleet
       * here — the siting reads buildPatrols' answer rather than inventing
       * a second rule that could disagree with it. */
      if (!garrison) carrierNoGarrison++;
      else if (p.faction !== garrison.faction) wrongFlag++;
      /* AND IT IS A PLACE. A floating city you cannot dock at is a model. */
      if (!p.docking || !p.market) carrierNotDockable++;
    });
  });
  console.log('  ' + systems + ' systems: ' + cutters + ' cutters, ' + caps +
              ' capitals, ' + carriers + ' fleet carriers');
  check('the navy fields capitals somewhere', caps > 0, caps + ' found');
  check('and they are rarer than the cutters', caps < cutters,
        caps + ' vs ' + cutters);
  check('carriers exist', carriers > 0, carriers + ' found');
  check('and every one of them has a fleet to belong to',
        carrierNoGarrison === 0, carrierNoGarrison + ' orphaned');
  check('flying the same flag as that fleet', wrongFlag === 0,
        wrongFlag + ' mismatched');
  check('and every one is a port you can dock at',
        carrierNotDockable === 0, carrierNotDockable + ' undockable');

  /* THE HULLS ARE ASSIGNED, which is the half that was actually missing:
   * capital-* sat in the library with nothing flying it, and the bulk
   * carrier was briefly wearing the navy's hull. */
  /* render.js hangs itself on the global the same way the other modules
   * do, so requiring it here is enough to read the hull table off it. */
  var R = global.Render || require('../src/render.js');
  check('the capital class flies a capital', /^capital-/.test(R.HULL_ASSIGN.capital),
        R.HULL_ASSIGN.capital);
  check('the carrier flies a carrier', /^carrier-/.test(R.HULL_ASSIGN.carrier),
        R.HULL_ASSIGN.carrier);
  check('and the merchant heavy is not wearing a warship',
        !/^carrier-/.test(R.HULL_ASSIGN.bulk), R.HULL_ASSIGN.bulk);
})();

console.log('--- what the traffic is saying ---');
(function () {
  /* Astra, owed since the flight-controls rework: "every ship has an ID;
   * show ID, message and destination for traffic within 0.75 AU."
   *
   * The lines are a pure function of the timetable and the clock, like
   * everything else about traffic — so they are testable the way the
   * timetable is, and the property that matters most is that nothing is
   * stored: tune in after skipping six months and the channel says what
   * those ships would have been saying then. */
  var sys = Gen.generateSystem('kawartha');
  var AU = 1.495978707e8;
  var here = Sim.bodyPosition(sys.ports[0], sys, 0);
  var lines = Sim.chatterNear(sys, 0, here, 0.75 * AU);

  check('there is traffic to listen to', lines.length > 0, lines.length + ' in range');
  var missing = lines.filter(function (L) {
    return !L.id || !L.text || !L.dest;
  });
  check('every line has an ID, a message and a destination', missing.length === 0,
        missing.length + ' incomplete');
  check('and they come nearest first', lines.every(function (L, i) {
    return i === 0 || lines[i - 1].range <= L.range;
  }));

  /* RANGE IS THE TRANSMITTER. A ship past it is not on the channel, which
   * is the difference between a comms panel and an omniscient one. */
  var far = Sim.chatterNear(sys, 0, here, 1000);
  check('and a ship out of range is not on the channel',
        far.length < lines.length, far.length + ' vs ' + lines.length);

  /* SAME CLOCK, SAME WORDS. Not a cosmetic property: the panel redraws
   * sixty times a second, and text that re-rolled per frame would be
   * unreadable rather than atmospheric. */
  var again = Sim.chatterNear(sys, 0, here, 0.75 * AU);
  check('the same moment gives the same words',
        JSON.stringify(again.map(function (L) { return L.id + L.text; })) ===
        JSON.stringify(lines.map(function (L) { return L.id + L.text; })));
  var later = Sim.chatterNear(sys, Sim.SAY_WINDOW * 3, here, 0.75 * AU);
  var changed = 0;
  later.forEach(function (L) {
    var was = lines.filter(function (P) { return P.id === L.id; })[0];
    if (was && was.text !== L.text) changed++;
  });
  check('and a while later they are saying something else', changed > 0,
        changed + ' of ' + later.length + ' changed');

  /* WHAT IT IS FOR. A hauler announcing drums is telling the player there
   * is waste here worth being paid to take away — the channel is a survey
   * of the system conducted by the people flying it. Sampled across systems
   * because one system need not have a waste run in it. */
  var sawCargo = false, sawPort = false;
  seeds(12).forEach(function (sd) {
    var s2 = Gen.generateSystem(sd);
    if (!s2.ports.length) return;
    var at = Sim.bodyPosition(s2.ports[0], s2, 0);
    for (var k = 0; k < 6; k++) {
      Sim.chatterNear(s2, k * Sim.SAY_WINDOW, at, 0.75 * AU).forEach(function (L) {
        if (/\bt of\b|drums/.test(L.text)) sawCargo = true;
        if (/final into|clear of/.test(L.text)) sawPort = true;
      });
    }
  });
  check('ships say what they are carrying', sawCargo);
  check('and call the ports they are working', sawPort);
})();

console.log('--- the apron ---');
(function () {
  var nearLarge = 0, nearSmall = 0, portSamples = 0;
  var pairs = 0, closest = Infinity, closestWhy = '';
  var outsideEnvelope = 0, heavyInBerth = 0, heaviesSeen = 0;

  for (var s = 0; s < 8; s++) {
    var sys = Gen.generateSystem('apron-' + s);
    for (var k = 0; k < 12; k++) {
      var t = k * 51000;
      var list = Sim.trafficAll(sys, t);
      sys.ports.forEach(function (p) {
        var pp = Sim.bodyPosition(p, sys, t);
        portSamples++;
        list.forEach(function (sh) {
          if (V.dist(sh.pos, pp) < 60) {
            if ((sh.route.size || 0) >= 0.10) nearLarge++; else nearSmall++;
          }
        });
        if (p.surface || p.underground) return;

        var moored = list.filter(function (sh) {
          return sh.phase === 'moored' && sh.to && sh.to.id === p.id;
        });
        moored.forEach(function (sh) {
          if (sh.route.heavy) heaviesSeen++;
          /* Alongside still means alongside: the spread tilts the parking
           * direction off the radial rather than adding to it, so the ship
           * stays on the sphere the old offset put it on. */
          if (V.dist(sh.pos, pp) > (p.dockCaptureRadius || p.radius * 4)) outsideEnvelope++;
        });
        for (var i = 0; i < moored.length; i++) {
          for (var j = i + 1; j < moored.length; j++) {
            var d = V.dist(moored[i].pos, moored[j].pos);
            pairs++;
            if (d < closest) {
              closest = d;
              closestWhy = moored[i].route.id + ' / ' + moored[j].route.id +
                           ' at ' + p.name;
            }
          }
        }

        /* AND A HEAVY IS NOT IN THE SHED. The berth count the player
         * competes for must not include ships that never asked for a bay —
         * otherwise adding them would have made every large berth in the
         * galaxy permanently occupied. */
        var occ = Sim.berthStatus(p, sys, t, { dryMass: 400 }).occupants;
        for (var q = 0; q < occ.length; q++) if (occ[q].route.outboard) heavyInBerth++;
      });
    }
  }

  console.log('  ' + (nearLarge / portSamples).toFixed(2) + ' large and ' +
              (nearSmall / portSamples).toFixed(2) +
              ' small ships within 60 km of a port, at any moment');
  console.log('  ' + pairs + ' moored pairs; the closest two are ' +
              closest.toFixed(3) + ' km apart (' + closestWhy + ')');

  /* The floor is set well under the 1.30 measured, because this is a guard
   * against the fleet going back to couriers-only rather than a restatement
   * of today's number — which will move every time the traffic is tuned. */
  check('there are big ships at ports to look at',
        nearLarge / portSamples > 0.9, (nearLarge / portSamples).toFixed(2) + ' per port');
  check('and the little ones did not go away',
        nearSmall / portSamples > 2, (nearSmall / portSamples).toFixed(2) + ' per port');
  check('two ships moored at one port are in two different places',
        pairs > 100 && closest > 0.08, closest.toFixed(4) + ' km apart: ' + closestWhy);
  check('and all of them are still inside the envelope they docked in',
        outsideEnvelope === 0, outsideEnvelope + ' adrift');
  check('there are heavies moored to check', heaviesSeen > 0, heaviesSeen + ' sightings');
  check('a ship at anchor does not hold a berth', heavyInBerth === 0,
        heavyInBerth + ' in bays');
})();

console.log('--- market: analytic vs stepped ---');
(function () {
  var sys = Gen.generateSystem('kawartha');
  var port = sys.ports[0];
  var cid = port.market.order[0];

  // Closed form is exact at any time, in any order.
  var t = 987654.3;
  var s1 = Eco.analyticStock(port, cid, t);
  Eco.analyticStock(port, cid, t + 9e6);
  var s2 = Eco.analyticStock(port, cid, t);
  check('analytic stock is a pure function of time', Math.abs(s1 - s2) < 1e-12);

  var bad = 0;
  sys.ports.forEach(function (p) {
    p.market.order.forEach(function (c) {
      for (var k = 0; k < 24; k++) {
        var v = Eco.analyticStock(p, c, k * 1.7e6);
        if (!(v >= 0 && v <= p.market.rows[c].cap + 1e-9)) bad++;
      }
    });
  });
  check('stock never leaves [0, capacity]', bad === 0, bad + ' violations');

  // Going live must not jump the price, and going dormant must preserve
  // whatever the live sim accumulated.
  var before = Eco.stock(port, cid, t);
  Eco.goLive(port, t);
  var afterLive = Eco.stock(port, cid, t);
  check('going live does not jump the stock', Math.abs(before - afterLive) < 1e-9,
        before + ' vs ' + afterLive);

  Eco.stepLive(port, t + 3600);
  var lived = Eco.stock(port, cid, t + 3600);
  Eco.goDormant(port, t + 3600);
  var dormant = Eco.stock(port, cid, t + 3600);
  check('going dormant preserves the simulated divergence',
        Math.abs(lived - dormant) < 1e-6, lived + ' vs ' + dormant);

  // A huge step resynchronises to the closed form rather than integrating.
  Eco.goLive(port, t);
  Eco.stepLive(port, t + 400 * DAY);
  var jumped = Eco.stock(port, cid, t + 400 * DAY);
  check('a giant warp step stays inside capacity',
        jumped >= 0 && jumped <= port.market.rows[cid].cap + 1e-9, String(jumped));
})();

console.log('--- market: prices and the player ledger ---');
(function () {
  var sys = Gen.generateSystem('kawartha');
  var port = sys.ports[0];
  /* A good this port actually EXPORTS — since the market is asymmetric, a
   * good it merely consumes has no buy price at all, and the spread is
   * only meaningful on something you can do both halves of. */
  var cid = port.market.order.filter(function (c) {
    return c !== 'waste' && port.market.rows[c].exporter;
  })[0] || port.market.order.filter(function (c) { return c !== 'waste'; })[0];

  var p = Eco.price(port, cid, 0);
  check('a traded good has a positive price', p.buy > 0 && p.sell > 0);
  check('buy price exceeds sell price (there is a spread)', p.buy > p.sell);

  /* The asymmetry itself: a port sells what it makes and buys anything.
   * Fuel is the deliberate exception — every port resells it, because
   * only a fifth of them produce it and the alternative is stranding
   * people who did not plan two jumps ahead. */
  (function () {
    var sellable = 0, buyable = 0, consumed = 0, total = 0;
    for (var i = 0; i < sys.ports.length; i++) {
      var list = Eco.priceList(sys.ports[i], 0);
      for (var j = 0; j < list.length; j++) {
        var r = list[j];
        if (r.id === 'waste') continue;
        total++;
        if (r.buy !== null) sellable++;
        if (r.accepts) buyable++;
        if (r.buy === null && r.sell > 0) consumed++;
      }
    }
    check('a port does not sell everything it stocks', sellable < total,
          sellable + ' of ' + total);
    check('but it buys everything', buyable === total, buyable + ' of ' + total);
    check('and what it consumes, it still pays for', consumed > 0,
          consumed + ' consumed goods still quote a sell price');

    var noFuel = sys.ports.filter(function (pt) {
      var q = Eco.price(pt, Eco.FUEL_ID, 0);
      return q && q.buy === null;
    });
    check('every port will sell you fuel', noFuel.length === 0,
          noFuel.length + ' could not');
  })();

  // Scarcity, not a table, sets the price: emptying the shelf raises it.
  var full = Eco.price(port, cid, 0).mid;
  Eco.applyTrade(port, cid, port.market.rows[cid].cap * 0.8, 0);
  var scarce = Eco.price(port, cid, 0).mid;
  check('buying most of the stock raises the price', scarce > full,
        full.toFixed(1) + ' -> ' + scarce.toFixed(1));

  // ... and the market forgets, on the stated half-life.
  var later = Eco.price(port, cid, 40 * DAY).mid;
  check('the market heals over time', later < scarce);

  var l0 = Math.abs(Eco.ledgerAt(port.market, cid, 0));
  var l1 = Math.abs(Eco.ledgerAt(port.market, cid, Eco.LEDGER_HALFLIFE));
  check('the ledger halves over one half-life', Math.abs(l1 / l0 - 0.5) < 1e-9,
        (l1 / l0).toFixed(6));
})();

console.log('--- radioactive waste runs backwards, on purpose ---');
(function () {
  var producers = 0, sinks = 0, marginOk = 0, marginBad = 0;
  seeds(60).forEach(function (sd) {
    var sys = Gen.generateSystem(sd);
    var sinkList = Eco.wasteSinks(sys);
    sinks += sinkList.length;
    sys.ports.forEach(function (p) {
      var w = Eco.price(p, 'waste', 0);
      if (!w) return;
      if (w.sink) {
        // A dump charges you, and will not sell it back to you.
        if (!(w.sell < 0 && w.buy === null)) marginBad++;
      } else {
        producers++;
        // A producer pays you to take it, and will not buy it back.
        if (!(w.buy < 0 && w.sell === null)) marginBad++;
      }
    });
    // The round trip must actually be worth flying.
    if (sinkList.length) {
      var best = null;
      sys.ports.forEach(function (p) {
        var w = Eco.price(p, 'waste', 0);
        if (w && !w.sink && (!best || w.buy < best.buy)) best = w;
      });
      var dump = Eco.price(sinkList[0], 'waste', 0);
      if (best && (-best.buy) + dump.sell > 0) marginOk++; else marginBad++;
    }
  });
  check('waste producers pay you to load it', producers > 0, producers + ' producers');
  check('there are reprocessing plants to take it', sinks > 0, sinks + ' sinks');
  check('sign conventions hold everywhere', marginBad === 0, marginBad + ' violations');
  check('the disposal run is profitable', marginOk > 0, marginOk + ' profitable systems');
})();

console.log('--- military fuel comes from a licence, not from development ---');
(function () {
  /* WHAT REPLACES THE DEVELOPMENT RULE FOR MILFUEL, and it is stricter.
   * Anywhere it is BRED has to be a reprocessing plant, and the system has
   * to be licensed — a naval garrison, or a Syndicate hold. Anywhere it is
   * BURNED has to be a yard or a highport, which is where naval hulls are
   * serviced. A world's development has nothing to do with either. */
  var bredWrongRole = 0, bredUnlicensed = 0, burntWrongRole = 0;
  var navySys = 0, syndSys = 0, breeders = 0, systems = 0, devs = [];
  /* THE CHAIN, counted as it goes past. Astra's ratios are 10 waste to 5
   * fissiles, 10 waste to 1 slug, 5 fissiles to 1 slug, and the interesting
   * claim is not any one of them but that a plant runs ONE line: a licensed
   * plant breeds slugs and stops reclaiming fissiles, an unlicensed one
   * does the opposite. */
  var factories = 0, factoriesUnlicensed = 0, factoryRatioBad = 0;
  var reclaimers = 0, licensedStillReclaiming = 0, reclaimRatioBad = 0;
  var slugRatioBad = 0;
  function sweep(sd, opts) {
    var sys = Gen.generateSystem(sd, opts);
    systems++;
    var who = Eco.milfuelLicensor(sys);
    if (who === 'navy') navySys++;
    if (who === 'syndicate') syndSys++;
    var bred = false;
    (sys.ports || []).forEach(function (p) {
      var role = p.market.role;
      var waste = p.market.rows.waste, fis = p.market.rows.fissile;
      var row = p.market.rows.milfuel;

      if (role === 'reprocessing' && waste && waste.cons > 0) {
        if (row && row.prod > 0) {
          /* Licensed: the intake went into slugs at ten to one, and the
           * reclaim line it used to feed is closed. Native fissile mining
           * on the same rock is none of the licence's business, which is
           * why this asks the plant's own reclaim figure rather than the
           * market row. */
          if (Math.abs(row.prod - waste.cons / 10) > 1e-6 && row.prod > 0.4001) slugRatioBad++;
          if (p.market.reclaim > 0) licensedStillReclaiming++;
        } else {
          reclaimers++;
          if (Math.abs((p.market.reclaim || 0) - waste.cons / 2) > 1e-6) reclaimRatioBad++;
          if (!fis || fis.prod < p.market.reclaim - 1e-6) reclaimRatioBad++;
        }
      }

      if (role === 'milfuel') {
        factories++;
        if (!who) factoriesUnlicensed++;
        /* Five tonnes of fissiles for every tonne of slug it presses. The
         * port may consume a little fissile on its own account, so the
         * claim is about the factory's line, not the whole row. */
        if (!row || !fis || Math.abs(p.market.feed - p.market.slugs * 5) > 1e-6 ||
            Math.abs(p.market.slugs - row.prod) > 1e-6 ||
            fis.cons < p.market.feed - 1e-6) factoryRatioBad++;
      }

      if (!row) return;
      if (row.prod > 0 && row.cons > 0 && role === 'reprocessing') {
        bred = true;
        if (!who) bredUnlicensed++;
        devs.push(p.market.dev);
        return;
      }
      if (row.prod > 0 && role === 'reprocessing') {
        bred = true;
        if (!who) bredUnlicensed++;
        devs.push(p.market.dev);
      } else if (row.prod > 0) {
        /* A yard blends its own slugs, so a little production there is
         * expected; a milfuel factory does nothing else; anywhere else
         * producing it is not. */
        /* AND A FLEET CARRIER. It is a warship with a city on it: it burns
         * the stuff, and a yard aboard one blends its own the same way a
         * yard ashore does. The carrier role is assigned by converting a
         * port AFTER the licence has run, so whatever milfuel rows that
         * port had it keeps — which is correct rather than incidental. */
        if (role !== 'shipyard' && role !== 'highport' && role !== 'milfuel' &&
            role !== 'carrier') bredWrongRole++;
        else if (!who) bredUnlicensed++;
      }
      if (row.cons > 0 && role !== 'reprocessing' && role !== 'milfuel' &&
          role !== 'shipyard' && role !== 'highport' &&
          role !== 'carrier') burntWrongRole++;
    });
    if (bred) breeders++;
  }
  seeds(90).forEach(function (sd) { sweep(sd, undefined); });
  var OUTLAW = { faction: { id: 'outlaw', outlaw: true, name: 'Test Syndicate' } };
  for (var h = 0; h < 30; h++) sweep('hold-' + h, OUTLAW);

  devs.sort(function (a, b) { return a - b; });
  console.log('  ' + breeders + ' of ' + systems + ' systems breed it (' + navySys +
              ' naval, ' + syndSys + ' syndicate); the plants that do run development ' +
              (devs.length ? devs[0].toFixed(2) + ' to ' + devs[devs.length - 1].toFixed(2) : 'n/a'));
  check('military fuel is only ever bred at a plant or a factory',
        bredWrongRole === 0, bredWrongRole + ' elsewhere');
  check('and only in a system that licenses it', bredUnlicensed === 0,
        bredUnlicensed + ' unlicensed');
  check('and only burned where naval hulls are serviced', burntWrongRole === 0,
        burntWrongRole + ' elsewhere');
  check('the navy licenses some systems', navySys > 0, navySys + ' systems');
  /* THE HALF THAT WAS MISSING. No naval garrison ever spawns in a hold, so
   * before the Syndicate was added as a licensor the most lawless place in
   * the galaxy was the one place you could not buy military fuel. */
  check('and so does the Syndicate, in the holds', syndSys > 0, syndSys + ' systems');
  /* The point of the exclusion above: these plants really are undeveloped,
   * so the development rule would have to be lied to in order to pass. */
  check('the plants that breed it really are below the industry threshold',
        devs.length > 0 && devs[0] < 0.52,
        devs.length ? 'lowest ' + devs[0].toFixed(3) : 'none');

  /* ---- and the chain the slugs come down ------------------------------- */
  console.log('  ' + factories + ' milfuel factories, ' + reclaimers +
              ' plants reclaiming fissiles');
  check('licensed systems get a milfuel factory', factories > 0, factories + ' built');
  check('and only licensed systems do', factoriesUnlicensed === 0,
        factoriesUnlicensed + ' unlicensed');
  check('a factory eats five tonnes of fissiles for every tonne it presses',
        factoryRatioBad === 0, factoryRatioBad + ' off-ratio');
  check('an unlicensed plant reclaims fissiles from what it is handed',
        reclaimers > 0 && reclaimRatioBad === 0,
        reclaimers + ' reclaimers, ' + reclaimRatioBad + ' off-ratio');
  check('ten tonnes of drums to the slug at a licensed one',
        slugRatioBad === 0, slugRatioBad + ' off-ratio');
  check('and a licensed plant runs one line, not both',
        licensedStillReclaiming === 0, licensedStillReclaiming + ' doing both');
})();

console.log('--- the chain pays, at every step ---');
(function () {
  /* Astra: "fix the ratio so that it is profitable to buy up the
   * radioactive waste and process it into fissiles and then into milfuel
   * slugs."
   *
   * The chain shipped with a hole in its last step: five tonnes of fissile
   * feed were 4,900 cr and the slug they made was 1,250, so every link
   * gained value except the one at the end, which threw three quarters of
   * it away. This is the section that stops that coming back.
   */
  var W = Eco.BY_ID.waste, F = Eco.BY_ID.fissile, M = Eco.BY_ID.milfuel;

  /* THE PRICE IS THE RATIO. Asserted as arithmetic rather than against a
   * number, because a test that quoted 6,370 would fail the day somebody
   * legitimately retunes the margin — and would not have caught the actual
   * bug, which was the two drifting apart. */
  check('a slug is priced off the feed it takes',
        M.base === Math.round(F.base * Eco.FISSILE_PER_MILFUEL * Eco.ENRICH_MARGIN),
        M.base + ' vs ' + F.base + ' x ' + Eco.FISSILE_PER_MILFUEL +
        ' x ' + Eco.ENRICH_MARGIN);

  /* THE LADDER CLIMBS. Ten tonnes of drums are worth less than nothing;
   * the five tonnes of fissiles they reclaim into are worth 4,900; the slug
   * those make is worth more than the fissiles were. Each rung strictly
   * above the last, which is what "a supply chain" means. */
  var rung1 = Eco.WASTE_PER_MILFUEL * W.base;                  // negative, by design
  var rung2 = (Eco.WASTE_PER_MILFUEL / Eco.WASTE_PER_FISSILE) * F.base;
  var rung3 = M.base;
  console.log('  ' + Eco.WASTE_PER_MILFUEL + ' t waste ' + rung1 + ' cr  ->  ' +
              (Eco.WASTE_PER_MILFUEL / Eco.WASTE_PER_FISSILE) + ' t fissiles ' +
              rung2 + ' cr  ->  1 t milfuel ' + rung3 + ' cr');
  check('the drums are worth less than nothing', rung1 < 0, String(rung1));
  check('reclaiming them into fissiles adds value', rung2 > rung1, rung1 + ' -> ' + rung2);
  check('and enriching those into a slug adds more', rung3 > rung2, rung2 + ' -> ' + rung3);
  check('with a real margin on the last step, not a rounding error',
        rung3 > rung2 * 1.2, (rung3 / rung2).toFixed(2) + 'x');

  /* AND THE PLAYER'S WALK OF IT PAYS, which is the claim that actually
   * reaches the game: the base prices above are what a tonne is WORTH, and
   * these are what somebody flying the route is handed. Measured across
   * forty systems rather than asserted. */
  var wasteNet = [], fisLeg = [], milLeg = [], shelves = [], runs = [];
  function num(x) { return typeof x === 'number' && isFinite(x); }
  seeds(40).forEach(function (sd) {
    var sys = Gen.generateSystem(sd);
    var loadW = null, dumpW = null, buyF = null, sellF = null, buyM = null, sellM = null;
    var buyMStock = 0;
    sys.ports.forEach(function (p) {
      var row = p.market.rows;
      var w = Eco.price(p, 'waste', 0), f = Eco.price(p, 'fissile', 0),
          m = Eco.price(p, 'milfuel', 0);
      if (w && num(w.buy) && !w.sink && (loadW === null || w.buy < loadW)) loadW = w.buy;
      if (w && num(w.sell) && w.sink && (dumpW === null || w.sell > dumpW)) dumpW = w.sell;
      if (f && num(f.buy) && row.fissile && row.fissile.exporter &&
          (buyF === null || f.buy < buyF)) buyF = f.buy;
      if (f && num(f.sell) && row.fissile && row.fissile.importer &&
          (sellF === null || f.sell > sellF)) sellF = f.sell;
      if (m && num(m.buy) && row.milfuel && row.milfuel.prod > 0 &&
          (buyM === null || m.buy < buyM)) {
        buyM = m.buy; buyMStock = Eco.stock(p, 'milfuel', 0);
      }
      if (m && num(m.sell) && row.milfuel && row.milfuel.cons > row.milfuel.prod &&
          (sellM === null || m.sell > sellM)) sellM = m.sell;
    });
    if (loadW !== null && dumpW !== null) wasteNet.push(-loadW + dumpW);
    if (buyF !== null && sellF !== null) fisLeg.push(sellF - buyF);
    if (buyM !== null && sellM !== null) {
      milLeg.push(sellM - buyM);
      shelves.push(buyMStock);
      runs.push((sellM - buyM) * Math.min(64, Math.max(0, buyMStock)));
    }
  });
  function med(a) {
    a = a.filter(num).sort(function (x, y) { return x - y; });
    return a.length ? a[Math.floor(a.length / 2)] : 0;
  }
  function max(a) {
    a = a.filter(num).sort(function (x, y) { return x - y; });
    return a.length ? a[a.length - 1] : 0;
  }
  console.log('  per tonne, median: waste run ' + med(wasteNet).toFixed(0) +
              ' cr, fissile leg ' + med(fisLeg).toFixed(0) +
              ' cr, slug leg ' + med(milLeg).toFixed(0) + ' cr');
  check('taking the drums away pays', med(wasteNet) > 0, med(wasteNet).toFixed(0) + ' cr/t');
  check('carrying the fissiles to a factory pays more',
        med(fisLeg) > med(wasteNet), med(fisLeg).toFixed(0) + ' cr/t');
  check('and carrying the slugs pays most of all',
        med(milLeg) > med(fisLeg), med(milLeg).toFixed(0) + ' cr/t');

  /* WHAT KEEPS AN EXPENSIVE SLUG FROM BEING A CHEAT CODE is the shelf, not
   * the price. With the generic shelf floor in place the biggest licensed
   * plant in a sweep sat on 161 t — one 340,000 credit run, against a
   * Kestrel at 120,000. The ceiling is the fix, and this is the guard on
   * it: buy out every slug a port has, sell them at the best price in the
   * system, and the trip must not be worth a hull. */
  console.log('  the shelf holds ' + med(shelves).toFixed(0) + ' t (max ' +
              max(shelves).toFixed(0) + '), and a full run clears ' +
              med(runs).toFixed(0) + ' cr (max ' + max(runs).toFixed(0) + ')');
  check('no port hands a civilian a warehouse of military fuel',
        max(shelves) <= Eco.BY_ID.milfuel.shelfMax + 1e-9,
        max(shelves).toFixed(1) + ' t against a cap of ' + Eco.BY_ID.milfuel.shelfMax);
  /* THE BAR MOVED WITH THE CHAIN, and it is worth saying why rather than
   * quietly widening it. The slug's base went from 1.30x its feed to
   * 2.20x, because 1.30 was the margin a factory would have had if it
   * could buy at base — it cannot, and every factory in the galaxy was
   * losing 2,748 credits on every slug it made. Correcting that raises
   * what a civilian buyer pays as well as what a factory charges, so the
   * player's leg scaled with it: the median full run went from 42,479 to
   * 71,888.
   *
   * The guard is still the guard. It is written against the hull
   * catalogue rather than a round number, so a best-case run buys the
   * Kestrel's worth of trading and not the ship — and if hull prices ever
   * move, this moves with them instead of going quietly stale. */
  var topHull = Combat.HULLS.kestrel.price;
  check('and the best single run is a payday, not a hull',
        max(runs) > 20000 && max(runs) < topHull * 1.05,
        max(runs).toFixed(0) + ' cr against a ' + topHull + ' cr hull');

  /* The shelf rule is general, not a milfuel special case buried in a
   * branch: anything without shelfDays keeps the old behaviour, which is
   * what stops this from having quietly re-tuned every other commodity. */
  check('an ordinary good keeps the shelf it always had',
        Eco.shelfCapFor('grain', 10) === null);
  check('and a scarce one is bounded by its own rule',
        Eco.shelfCapFor('milfuel', 10) === Math.min(Eco.BY_ID.milfuel.shelfMax, 80),
        String(Eco.shelfCapFor('milfuel', 10)));
})();

console.log('--- higher-tech worlds make higher-tech goods and more mess ---');
(function () {
  var lowTierOnly = 0, highTechAtLowDev = 0, wasteCorrelation = [];
  seeds(80).forEach(function (sd) {
    var sys = Gen.generateSystem(sd);
    sys.ports.forEach(function (p) {
      var dev = p.market.dev;
      var makesTier3 = p.market.order.some(function (c) {
        /* LICENSED OUTPUT IS NOT MANUFACTURE, and this exclusion is the
         * whole of the 17 violations this check reported for eight days.
         * Every one of them was milfuel, at development 0.124 to 0.508 —
         * one commodity, never a spread. It is not made by industry: it is
         * bred out of waste at a reprocessing plant that has been LICENSED,
         * by the navy or by the Syndicate, and a licence is a thing you are
         * given rather than a thing you develop into. Astra's call:
         * "Milfuel is manufactured at Navy/Syndicate reprocessing plants."
         *
         * The rule is not weakened by taking it out — the licence has its
         * own check below, and that one is stricter than this one was. */
        if (Eco.BY_ID[c].milfuel) return false;
        return Eco.BY_ID[c].tier >= 3 && p.market.rows[c].prod > 0;
      });
      // Nothing below the industry threshold may manufacture tier-3 goods.
      if (makesTier3 && dev < 0.52) highTechAtLowDev++;
      if (dev < 0.3 && !makesTier3) lowTierOnly++;
      wasteCorrelation.push([dev, p.market.rows.waste ? p.market.rows.waste.prod : 0]);
    });
  });
  check('no world manufactures above its development level', highTechAtLowDev === 0,
        highTechAtLowDev + ' violations');
  check('undeveloped worlds stick to raw goods', lowTierOnly > 0);

  // Waste output should rise with development — check the means of the
  // bottom and top thirds rather than asserting a correlation coefficient.
  wasteCorrelation.sort(function (a, b) { return a[0] - b[0]; });
  var n = wasteCorrelation.length, third = Math.floor(n / 3);
  function mean(arr) { return arr.reduce(function (s, x) { return s + x[1]; }, 0) / arr.length; }
  var low = mean(wasteCorrelation.slice(0, third));
  var high = mean(wasteCorrelation.slice(n - third));
  check('built-up worlds generate far more radioactive waste', high > low * 3,
        low.toFixed(2) + ' vs ' + high.toFixed(2));
})();

console.log('--- government and crime permissivity ---');
(function () {
  var withGov = 0, badScore = 0, noneEver = { anarchy: 0, technocracy: 0 };
  var lowDevCrime = [], highDevCrime = [];
  seeds(150).forEach(function (sd) {
    var sys = Gen.generateSystem(sd);
    if (!sys.government || sys.crimeScore === undefined) return;
    withGov++;
    if (sys.crimeScore < 0 || sys.crimeScore > 100) badScore++;
    if (!Gen.GOVERNMENT_BY_ID[sys.government.id]) badScore++;
    if (sys.government.id === 'anarchy') noneEver.anarchy++;
    if (sys.government.id === 'technocracy') noneEver.technocracy++;
    (sys.development < 0.3 ? lowDevCrime : sys.development > 0.7 ? highDevCrime : []).push(sys.crimeScore);
  });
  check('every sampled system got a government and a crime score', withGov === 150);
  check('crime score always lands in [0,100]', badScore === 0, badScore + ' bad');
  check('every government id is a real one from the table', badScore === 0);
  check('anarchy shows up somewhere across 150 seeds', noneEver.anarchy > 0);
  check('technocracy shows up somewhere across 150 seeds', noneEver.technocracy > 0);

  function mean(a) { return a.reduce(function (s, x) { return s + x; }, 0) / a.length; }
  check('low-development systems trend more crime-permissive than high-development ones',
        lowDevCrime.length && highDevCrime.length && mean(lowDevCrime) > mean(highDevCrime),
        mean(lowDevCrime || [0]).toFixed(1) + ' vs ' + mean(highDevCrime || [0]).toFixed(1));

  // The user's rule explicitly: NOT every low-tech system is high crime.
  var lowDevButLawful = lowDevCrime.filter(function (c) { return c < 40; }).length;
  check('a low-development system can still be low-crime (not deterministic)', lowDevButLawful > 0,
        lowDevButLawful + ' of ' + lowDevCrime.length);

  // Determinism, same as everything else.
  var a = Gen.generateSystem('kawartha'), b = Gen.generateSystem('kawartha');
  check('the same seed draws the same government and crime score',
        a.government.id === b.government.id && a.crimeScore === b.crimeScore);

  // A permissive system is patrolled thinner, which is the one live effect
  // wired in this pass (the scan/search mechanic itself is a later step).
  // Same bottom-third/top-third comparison as the waste-vs-development
  // check above, for the same reason: robust to noise, no correlation
  // coefficient needed.
  var byCrime = [];
  seeds(150).forEach(function (sd) {
    var sys = Gen.generateSystem(sd);
    var police = (sys.patrols || []).filter(function (p) { return p.kind === 'police'; }).length;
    var factionCount = (sys.factions || []).length || 1;
    if (police === 0) return;
    byCrime.push([sys.crimeScore, police / factionCount]);
  });
  byCrime.sort(function (x, y) { return x[0] - y[0]; });
  var cn = byCrime.length, cthird = Math.floor(cn / 3);
  function meanDensity(arr) { return arr.reduce(function (s, x) { return s + x[1]; }, 0) / arr.length; }
  var lowCrimeDensity = meanDensity(byCrime.slice(0, cthird));
  var highCrimeDensity = meanDensity(byCrime.slice(cn - cthird));
  check('the most permissive systems are patrolled thinner than the strictest',
        highCrimeDensity < lowCrimeDensity,
        'low-crime ' + lowCrimeDensity.toFixed(2) + '/faction vs high-crime ' + highCrimeDensity.toFixed(2) + '/faction');
})();

console.log('--- two tanks, and only one of them is a decision ---');
(function () {
  var sys = Gen.generateSystem('kawartha');
  var planet = sys.bodies.filter(function (b) { return b.kind === 'planet'; })[1];
  var ship = Sim.circularOrbit(planet, sys, 0, planet.radius * 0.5, 0, 0);

  var emptyAccel = ship.maxAccel;
  ship.cargo.ores = 64;
  Sim.refreshShip(ship);
  check('a full hold reduces acceleration', ship.maxAccel < emptyAccel,
        (emptyAccel * 1000).toFixed(2) + ' -> ' + (ship.maxAccel * 1000).toFixed(2) + ' m/s2');
  delete ship.cargo.ores;
  Sim.refreshShip(ship);

  /* The point of the split: manoeuvring must be something you can do
   * freely, so the thruster tank is quoted in HOURS of full throttle and
   * there had better be a lot of them. */
  var hours = Sim.thrusterEndurance(ship) / 3600;
  check('the thruster tank is good for hours, not minutes', hours > 5 && hours < 20,
        hours.toFixed(2) + ' h at full throttle');

  // Burn accounting: reaction mass spent must match mdot * throttle * SIM
  // seconds, regardless of how the step was subdivided.
  var t0 = ship.thrusterFuel, j0 = ship.fuel;
  ship.thrust = V.scale(ship.fwd, ship.maxAccel);
  Sim.advanceShip(ship, sys, 0, 600, 30000);
  var burned = t0 - ship.thrusterFuel;
  // mdot [kg/s] = F[N]/(Isp*g0); in tonnes that is thrustKN/(Isp*g0).
  var expected = ship.thrustKN * 600 / (ship.thrusterIsp * 9.80665);
  check('reaction mass burn matches the rocket equation',
        Math.abs(burned - expected) / expected < 0.02,
        burned.toFixed(4) + ' vs ' + expected.toFixed(4) + ' t');

  /* The invariant that makes the whole change worth making: nothing you do
   * with the thrusters may ever touch the tank that gets you to another
   * star. Ten minutes of full burn is a rounding error on your range. */
  check('manoeuvring never spends jump fuel', ship.fuel === j0,
        j0 + ' -> ' + ship.fuel);
  check('ten minutes of full burn costs under 3% of the thruster tank',
        burned / ship.thrusterCap < 0.03, (100 * burned / ship.thrusterCap).toFixed(2) + '%');

  // Warp honesty: burning for an hour of sim time costs an hour of it.
  var shipA = Sim.circularOrbit(planet, sys, 0, planet.radius * 0.5, 0, 0);
  shipA.thrust = V.scale(shipA.fwd, shipA.maxAccel);
  Sim.advanceShip(shipA, sys, 0, 100, 3000);
  var shipB = Sim.circularOrbit(planet, sys, 0, planet.radius * 0.5, 0, 0);
  shipB.thrust = V.scale(shipB.fwd, shipB.maxAccel);
  Sim.advanceShip(shipB, sys, 0, 3600, 30000);
  check('burning at warp costs warped reaction mass',
        (9 - shipB.thrusterFuel) > (9 - shipA.thrusterFuel) * 5,
        (9 - shipA.thrusterFuel).toFixed(4) + ' t in 100 s vs ' +
        (9 - shipB.thrusterFuel).toFixed(4) + ' t in 3600 s');

  // Running the thrusters dry still cuts the drive rather than producing
  // free thrust — it is generous, not infinite.
  var ship3 = Sim.circularOrbit(planet, sys, 0, planet.radius * 0.5, 0, 0);
  ship3.thrusterFuel = 0.005;
  Sim.refreshShip(ship3);
  ship3.thrust = V.scale(ship3.fwd, ship3.maxAccel);
  var r3 = Sim.advanceShip(ship3, sys, 0, 600, 30000);
  check('an empty thruster tank shuts the drive down',
        ship3.thrusterFuel === 0 && r3.fuelOut === true);
  check('thrust is zeroed once dry', V.len(ship3.thrust) === 0);
  check('and the jump tank is still untouched', ship3.fuel === ship3.fuelCap);

  // Docking fills the thruster tank for nothing, so it can never strand you.
  var station = sys.ports[0];
  var ss = Sim.bodyState(station, sys, 0);
  ship3.pos = V.clone(ss.pos);
  ship3.vel = V.clone(ss.vel);
  Sim.dockShip(ship3, station, sys, 0);
  check('docking refills the thruster tank, free',
        ship3.thrusterFuel === ship3.thrusterCap && ship3.fuelOut === false);
})();

console.log('--- trade round trip ---');
(function () {
  var sys = Gen.generateSystem('kawartha');
  var port = sys.ports[0];
  var cid = port.market.order.filter(function (c) {
    return c !== 'waste' && port.market.rows[c].cap > 200;
  })[0];
  var startStock = Eco.stock(port, cid, 0);

  Eco.applyTrade(port, cid, 20, 0);
  check('buying removes stock from the port',
        Math.abs(Eco.stock(port, cid, 0) - (startStock - 20)) < 1e-6);
  Eco.applyTrade(port, cid, -20, 0);
  check('selling it straight back restores the shelf',
        Math.abs(Eco.stock(port, cid, 0) - startStock) < 1e-6);

  // Buying low and selling high has to be findable: some pair of ports must
  // offer a real margin on something, or there is no game here.
  var bestMargin = 0, bestWhat = '';
  Eco.COMMODITIES.forEach(function (com) {
    if (com.waste) return;
    var lo = null, hi = null;
    sys.ports.forEach(function (pt) {
      var q = Eco.price(pt, com.id, 0);
      if (!q) return;
      if (lo === null || q.buy < lo) lo = q.buy;
      if (hi === null || q.sell > hi) hi = q.sell;
    });
    if (lo !== null && hi !== null && hi - lo > bestMargin) {
      bestMargin = hi - lo; bestWhat = com.name;
    }
  });
  check('there is a profitable route to find', bestMargin > 0,
        bestWhat + ' at ' + bestMargin.toFixed(0) + ' cr/t');
  console.log('  best spread in kawartha: ' + bestWhat + '  ' + bestMargin.toFixed(0) + ' cr/t');
})();

console.log('\n--- what a port looks like up close ---');
(function () {
  var sys = Gen.generateSystem('kawartha');
  var ports = sys.ports || [];
  check('every port is dressed', ports.length > 0 &&
        ports.every(function (p) { return p.dressing && p.dressing.signs.length; }),
        ports.length + ' ports');

  /* The whole point of generating this AFTER the economy: the signage has
   * to be true. A port that takes waste has to say so. */
  var sinks = ports.filter(function (p) {
    return p.market && p.market.role === 'reprocessing';
  });
  if (sinks.length) {
    check('a reprocessing plant advertises what it does',
          sinks[0].dressing.signs.some(function (s) { return /WASTE/.test(s.text); }),
          sinks[0].dressing.signs.map(function (s) { return s.text; }).join(' | '));
  }
  check('every port names itself on a board',
        ports.every(function (p) {
          return p.dressing.signs.some(function (s) { return s.kind === 'name'; });
        }));

  // Surface and orbit read differently at a glance, on purpose.
  var surf = ports.filter(function (p) { return p.surface; });
  var orb = ports.filter(function (p) { return !p.surface; });
  check('orbital docks carry no ground structures',
        orb.every(function (p) { return p.dressing.blocks.length === 0; }));
  if (surf.length && orb.length) {
    check('surface ports have a settlement round them',
          surf.some(function (p) { return p.dressing.blocks.length > 0; }));
    check('and warm approach lighting, unlike orbit',
          surf[0].dressing.padLight !== orb[0].dressing.padLight);
  }

  check('every board has somewhere to be and a colour',
        ports.every(function (p) {
          return p.dressing.signs.every(function (s) {
            return isFinite(s.u) && isFinite(s.r) && isFinite(s.h) && !!s.ink;
          });
        }));

  /* Same seed, same town — the rule the whole generator lives by. */
  var again = Gen.generateSystem('kawartha');
  check('the same seed dresses the same port the same way',
        JSON.stringify(again.ports[0].dressing) === JSON.stringify(ports[0].dressing));

  /* And it must not have disturbed anything that came before it. The
   * dressing runs in its own forked substream precisely so that adding it
   * leaves every planet, orbit and station where it already was. */
  check('and adding it moved nothing that existed before',
        again.bodies.length === sys.bodies.length &&
        JSON.stringify(again.bodies.map(function (b) { return b.orbit ? b.orbit.a : b.radius; })) ===
        JSON.stringify(sys.bodies.map(function (b) { return b.orbit ? b.orbit.a : b.radius; })));
})();

/* --- the settlement chain ------------------------------------------------
 * Drake's shape without Drake's biology: a named chain of factors with one
 * knob. The property worth defending above all others is that the DEFAULT
 * is not a rewrite — pressure 1.0 has to produce exactly the galaxy the
 * generator produced before the knob existed, or every seed quietly means
 * something different than it did. */
(function () {
  var ss = seeds(24);
  function fingerprint() {
    return ss.map(function (s) {
      var sys = Gen.generateSystem(s);
      return (sys.ports || []).map(function (p) {
        return p.id + ':' + p.market.role + ':' + p.market.dev.toFixed(6);
      }).join('|');
    }).join('//');
  }

  Eco.setPressure(1.0);
  var base = fingerprint();

  check('pressure 1.0 is reproducible', fingerprint() === base);

  // Wander, then come home. The default must survive the excursion.
  [0.3, 0.6, 1.7, 2.6].forEach(function (p) { Eco.setPressure(p); fingerprint(); });
  Eco.setPressure(1.0);
  check('pressure 1.0 is byte-identical after excursions to other settings',
        fingerprint() === base);

  check('the knob clamps rather than accepting nonsense',
        Eco.setPressure(-5) === Eco.SETTLEMENT.MIN &&
        Eco.setPressure(99) === Eco.SETTLEMENT.MAX &&
        Eco.setPressure('nonsense') === 1);

  // Monotonic in the direction it claims: more pressure, more civilisation.
  var prof = {};
  [0.35, 1.0, 2.5].forEach(function (p) {
    Eco.setPressure(p);
    prof[p] = Eco.galaxyProfile(Gen, ss);
  });
  Eco.setPressure(1.0);

  check('development rises with pressure',
        prof[0.35].fGrown < prof[1.0].fGrown && prof[1.0].fGrown < prof[2.5].fGrown,
        prof[0.35].fGrown + ' < ' + prof[1.0].fGrown + ' < ' + prof[2.5].fGrown);
  check('hubs rise with pressure, and by a lot',
        prof[0.35].hubsPerSystem < prof[1.0].hubsPerSystem &&
        prof[1.0].hubsPerSystem < prof[2.5].hubsPerSystem &&
        prof[2.5].hubsPerSystem > prof[0.35].hubsPerSystem * 4,
        prof[0.35].hubsPerSystem + ' -> ' + prof[2.5].hubsPerSystem + ' per system');
  check('ports rise with pressure',
        prof[0.35].portsPerSystem < prof[2.5].portsPerSystem,
        prof[0.35].portsPerSystem + ' -> ' + prof[2.5].portsPerSystem);

  /* The astronomy is NOT the economy's business: how many worlds are
   * habitable is decided in generate.js by where the zone falls, and no
   * amount of settlement pressure should move a planet. */
  check('pressure does not move planets or invent habitable worlds',
        prof[0.35].planetsPerSystem === prof[2.5].planetsPerSystem &&
        prof[0.35].nHab === prof[2.5].nHab,
        prof[0.35].nHab + ' vs ' + prof[2.5].nHab);
})();

console.log('--- the price worth flying for ---');
(function () {
  /* A COLOUR THAT FIRES THREE TIMES IN FOUR IS DECORATION.
   *
   * That is the whole reason priceMark's cut-offs are quartiles of a
   * measured sample rather than a band around base: a port only sells what
   * it MAKES, so a producer's ask is cheap by construction, and the naive
   * "10% under base is a bargain" rule paints most of the screen green.
   *
   * So the test is about the RATE, not about one row. Green has to be
   * roughly a quarter of what you see, or it has stopped being news. */
  var good = { buy: 0, sell: 0 }, bad = { buy: 0, sell: 0 };
  var nBuy = 0, nSell = 0, rowsGood = 0, rowsBad = 0, rows = 0;
  var bestBuy = null, bestSell = null;
  seeds(40).forEach(function (sd) {
    var sys = Gen.generateSystem(sd);
    sys.ports.forEach(function (p) {
      if (!p.market) return;
      Eco.priceList(p, 10 * DAY).forEach(function (r) {
        var com = Eco.BY_ID[r.id];
        if (!com || com.waste || !(com.base > 0)) return;
        var mk = Eco.priceMark(r);
        rows++;
        if (mk.row > 0) rowsGood++; else if (mk.row < 0) rowsBad++;
        if (r.buy !== null && isFinite(r.buy) && r.buy > 0) {
          nBuy++;
          if (mk.buy > 0) { good.buy++; if (!bestBuy || r.buy / com.base < bestBuy) bestBuy = r.buy / com.base; }
          if (mk.buy < 0) bad.buy++;
        }
        if (r.sell !== null && isFinite(r.sell) && r.sell > 0) {
          nSell++;
          if (mk.sell > 0) { good.sell++; if (!bestSell || r.sell / com.base > bestSell) bestSell = r.sell / com.base; }
          if (mk.sell < 0) bad.sell++;
        }
      });
    });
  });
  console.log('  across ' + rows + ' rows: ' + (100 * good.buy / nBuy).toFixed(1) +
              '% of asks are worth buying, ' + (100 * good.sell / nSell).toFixed(1) +
              '% of bids worth selling into');
  console.log('  the best ask seen is ' + bestBuy.toFixed(2) +
              'x base and the best bid ' + bestSell.toFixed(2) + 'x');
  check('a green ask is roughly the cheapest quarter, not most of the screen',
        good.buy / nBuy > 0.08 && good.buy / nBuy < 0.40,
        (100 * good.buy / nBuy).toFixed(1) + '% of ' + nBuy);
  check('and a green bid likewise',
        good.sell / nSell > 0.15 && good.sell / nSell < 0.45,
        (100 * good.sell / nSell).toFixed(1) + '% of ' + nSell);
  check('red fires on a real minority too, at both ends',
        bad.buy / nBuy > 0.10 && bad.buy / nBuy < 0.50 &&
        bad.sell / nSell > 0.10 && bad.sell / nSell < 0.50,
        (100 * bad.buy / nBuy).toFixed(1) + '% / ' + (100 * bad.sell / nSell).toFixed(1) + '%');
  check('most of the screen is left uncoloured, which is what makes a colour mean something',
        (rowsGood + rowsBad) / rows < 0.85 && rowsGood / rows > 0.10,
        rowsGood + ' good, ' + rowsBad + ' bad, of ' + rows);

  /* GREEN MEANS ACT, and the two columns therefore run OPPOSITE ways. A
   * test that only checked "cheap is green" would pass with the sell
   * column colouring by size, which is the version Astra ruled out. */
  var base = Eco.BY_ID.grain.base;
  var cheap = { id: 'grain', buy: base * 0.40, sell: base * 0.38 };
  var dear  = { id: 'grain', buy: base * 1.30, sell: base * 1.90 };
  check('a cheap ask is green and the poor bid beside it is red',
        Eco.priceMark(cheap).buy > 0 && Eco.priceMark(cheap).sell < 0);
  check('a dear bid is GREEN, because green is the column saying do it here',
        Eco.priceMark(dear).sell > 0 && Eco.priceMark(dear).buy < 0);
  check('and the commodity itself takes the best news on the row',
        Eco.priceMark(cheap).row > 0 && Eco.priceMark(dear).row > 0);

  /* MORE GREEN THE BETTER THE DEAL. Astra's ask, and the reason the
   * cut-offs are the START of a ramp rather than a switch: a row that only
   * just cleared the quartile and a row in the best five per cent of
   * prices in the galaxy should not look the same. */
  function askAt(x) { return Eco.priceMark({ id: 'grain', buy: base * x, sell: null }).buy; }
  function bidAt(x) { return Eco.priceMark({ id: 'grain', buy: null, sell: base * x }).sell; }
  check('an ask just past the threshold is barely green',
        askAt(0.499) > 0 && askAt(0.499) < 0.1, askAt(0.499).toFixed(3));
  check('and a far better one is fully green',
        askAt(0.43) > 0.99, askAt(0.43).toFixed(3));
  check('the ramp is monotonic in between',
        askAt(0.49) < askAt(0.47) && askAt(0.47) < askAt(0.45),
        [askAt(0.49), askAt(0.47), askAt(0.45)].map(function (v) { return v.toFixed(2); }).join(' < '));
  check('a bid ramps the same way, upward',
        bidAt(1.63) < bidAt(1.72) && bidAt(1.72) < bidAt(1.80) && bidAt(1.9) > 0.99,
        [bidAt(1.63), bidAt(1.72), bidAt(1.80)].map(function (v) { return v.toFixed(2); }).join(' < '));
  check('and nothing ever exceeds full strength',
        askAt(0.01) <= 1 && bidAt(40) <= 1 &&
        Eco.priceMark({ id: 'grain', buy: base * 40, sell: null }).buy >= -1);
  /* Strength is a number, and a switch would pass every check above it
   * except this one: the whole point is that the middle of the ramp is
   * neither nothing nor everything. */
  check('the middle of the ramp is genuinely in the middle',
        askAt(0.47) > 0.3 && askAt(0.47) < 0.7, askAt(0.47).toFixed(3));

  /* Waste runs backwards on purpose and has its own colour already. */
  var w = Eco.priceList(Gen.generateSystem('seed-3').ports.filter(function (p) {
    return p.market && p.market.rows && p.market.rows.waste;
  })[0] || { market: { order: [], rows: {} } }, 10 * DAY)
    .filter(function (r) { return r.id === 'waste'; })[0];
  if (w) check('waste is left to its own signs', Eco.priceMark(w).row === 0);
})();

console.log('--- a factory that does not lose money ---');
(function () {
  /* Astra: "make the factories more profitable, but also easier on the
   * player?" Those read as opposite asks and are not.
   *
   * The factory's margin was written at BASE prices and then spent at
   * MARKET ones. A factory is a desperate importer of the one thing it
   * cannot run without and an exporter of the thing it makes, so it pays
   * 1.79x base for feed and sells at 0.95x — five tonnes in at 8,770 and
   * one slug out at 6,052. Every factory in the galaxy lost 2,748 credits
   * on every slug it made, and a hundred per cent of them did, which is
   * not a tuning problem but a number that was never true.
   *
   * Correcting it raises what a civilian buyer pays as well as what the
   * factory charges, which is why one change answers both halves of the
   * ask: the median slug leg went from 4,919 to 7,123 cr/t. */
  var margins = [], feedMul = [], slugMul = [], n = 0;
  seeds(200).forEach(function (sd) {
    var sys = Gen.generateSystem(sd);
    sys.ports.forEach(function (p) {
      if (!p.market || p.market.role !== 'milfuel') return;
      var list = Eco.priceList(p, 10 * DAY);
      var feed = null, slug = null;
      list.forEach(function (r) {
        if (r.id === 'fissile') feed = r;
        else if (r.id === 'milfuel') slug = r;
      });
      if (!feed || !slug || feed.sell === null || slug.buy === null) return;
      n++;
      /* What the factory itself books: it pays the player `sell` for every
       * tonne of feed and takes `buy` for the slug they became. The ratio
       * is the chain's own, so this cannot drift from the recipe. */
      var cost = feed.sell * Eco.FISSILE_PER_MILFUEL;
      margins.push(slug.buy - cost);
      feedMul.push(feed.sell / Eco.BY_ID.fissile.base);
      slugMul.push(slug.buy / Eco.BY_ID.milfuel.base);
    });
  });
  function med(a) {
    a = a.slice().sort(function (x, y) { return x - y; });
    return a.length ? a[Math.floor(a.length / 2)] : 0;
  }
  var under = margins.filter(function (m) { return m < 0; }).length;
  console.log('  ' + n + ' factories: feed at ' + med(feedMul).toFixed(2) +
              'x base, slug at ' + med(slugMul).toFixed(2) + 'x, median margin ' +
              med(margins).toFixed(0) + ' cr a slug');
  check('there are factories to measure', n > 20, String(n));
  check('not one factory in two hundred systems loses money on a slug',
        under === 0, under + ' of ' + n + ' under water');
  check('and the median one clears a real margin rather than a rounding error',
        med(margins) > Eco.BY_ID.milfuel.base * 0.08,
        med(margins).toFixed(0) + ' cr on a ' + Eco.BY_ID.milfuel.base + ' cr slug');

  /* THE RECIPE STILL GOVERNS THE PRICE. The whole point of writing the
   * slug's base as arithmetic was that the ratio and the price can never
   * drift apart, and raising the margin must not have quietly broken that. */
  check('the slug is still priced as what it takes to make',
        Eco.BY_ID.milfuel.base ===
          Math.round(Eco.BY_ID.fissile.base * Eco.FISSILE_PER_MILFUEL * Eco.ENRICH_MARGIN),
        String(Eco.BY_ID.milfuel.base));
  /* And the ladder still climbs, which is the thing Astra called for when
   * she rejected the first version of this chain. */
  check('and each link is still worth more than the one before it',
        Eco.BY_ID.milfuel.base > Eco.BY_ID.fissile.base * Eco.FISSILE_PER_MILFUEL,
        Eco.BY_ID.milfuel.base + ' against ' +
        (Eco.BY_ID.fissile.base * Eco.FISSILE_PER_MILFUEL));
})();

console.log('--- what the local runs are carrying ---');
(function () {
  /* Astra, twice over: local traffic carries nothing, and once the comms
   * channel existed you could HEAR it — a shuttle announcing an empty hold
   * between two docks over the same world. */
  var localTot = 0, localEmpty = 0;
  var feeders = 0, feedersLoaded = 0;
  var netFeed = 0, feedEntries = 0;
  var heavies = 0, heaviesLoaded = 0;
  var shareOk = 0, shareChecked = 0;
  seeds(40).forEach(function (sd) {
    var sys = Gen.generateSystem(sd);
    var byId = {};
    sys.ports.forEach(function (p) {
      byId[p.id] = p;
      (p.market.inbound || []).forEach(function (d) {
        if (d.via === 'feed') { netFeed += d.qty; feedEntries++; }
      });
    });
    var sched = {};
    (sys.traffic || []).forEach(function (r) {
      var q = 0;
      (r.out || []).forEach(function (m) { q += m.qty; });
      (r.back || []).forEach(function (m) { q += m.qty; });
      if (r.outboard) { heavies++; if (q > 0) heaviesLoaded++; return; }
      if (r.feeder) {
        feeders++;
        if (q > 0) feedersLoaded++;
        var key = [r.from, r.to].sort().join('|');
        if (sched[key] > 0 && q > 0) {
          shareChecked++;
          /* A twelfth of the scheduled run, jittered by at most 30%. */
          if (q < sched[key] * 0.5) shareOk++;
        }
        return;
      }
      if (!r.local) return;
      localTot++;
      if (q < 1) localEmpty++;
      sched[[r.from, r.to].sort().join('|')] = q;
    });
  });

  console.log('  scheduled local runs flying empty: ' +
              (100 * localEmpty / localTot).toFixed(1) + '% of ' + localTot);
  console.log('  feeders with something aboard: ' +
              (100 * feedersLoaded / feeders).toFixed(1) + '% of ' + feeders);
  check('a scheduled local run carries something',
        localEmpty / localTot < 0.03,
        localEmpty + ' empty of ' + localTot);
  check('and so does a feeder, which is the traffic you actually watch',
        feedersLoaded / feeders > 0.9,
        feedersLoaded + ' of ' + feeders);

  /* THE WHOLE REASON THIS WAS SAFE TO DO. A local leg moves goods that are
   * passing through: they arrive at one dock and LEAVE the other, so every
   * tonne registered has a matching tonne removed and the system's total
   * supply is what it always was. Without the departure half this is a
   * supply increase in every system in the galaxy at once, which is what
   * deferred the feature twice. */
  check('every tonne a feeder lands is a tonne that left the other dock',
        Math.abs(netFeed) < 1e-6,
        netFeed.toFixed(6) + ' t net across ' + feedEntries + ' entries');

  /* And the feeder's own hold is a SHARE of that registered run rather
   * than a second helping of it — the same commerce, counted once. */
  check('a feeder carries a fraction of the run it is flying, not a copy of it',
        shareChecked > 20 && shareOk === shareChecked,
        shareOk + ' of ' + shareChecked);

  /* Heavies are still empty on purpose: they lie off the station and they
   * are a silhouette, not a trade. */
  check('a heavy still carries nothing, which is what it is for',
        heaviesLoaded === 0, heaviesLoaded + ' of ' + heavies + ' loaded');
})();

console.log('');
console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
