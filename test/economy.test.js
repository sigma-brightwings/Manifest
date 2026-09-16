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
  if (ship.arrival) Sim.stepArrival(ship, sys, t + Sim.arrivalTotal() + 1);
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
  function sweep(sd, opts) {
    var sys = Gen.generateSystem(sd, opts);
    systems++;
    var who = Eco.milfuelLicensor(sys);
    if (who === 'navy') navySys++;
    if (who === 'syndicate') syndSys++;
    var bred = false;
    (sys.ports || []).forEach(function (p) {
      var row = p.market.rows.milfuel;
      if (!row) return;
      var role = p.market.role;
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
         * expected; anywhere else producing it is not. */
        if (role !== 'shipyard' && role !== 'highport') bredWrongRole++;
        else if (!who) bredUnlicensed++;
      }
      if (row.cons > 0 && role !== 'reprocessing' &&
          role !== 'shipyard' && role !== 'highport') burntWrongRole++;
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
  check('military fuel is only ever bred at a reprocessing plant',
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

console.log('');
console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
