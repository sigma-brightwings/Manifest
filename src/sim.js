/* sim.js — where the clockwork meets the chaos.
 *
 * Two different kinds of motion live in this file, on purpose:
 *
 *   Bodies (planets, moons, stations) are ON RAILS. Their position is
 *   evaluated analytically from orbital elements at time t. No integration,
 *   no error accumulation, no possibility of decay or ejection. You can warp
 *   a thousand years ahead, or come back from hyperspace, and the system is
 *   exactly where the maths says it should be.
 *
 *   The ship is FREE. It feels the summed Newtonian pull of every massive
 *   body at once — no sphere-of-influence switching, no fudging — integrated
 *   with RK4. That is where the interesting gameplay lives: slingshots,
 *   transfer burns, and the fact that a badly planned orbit really will put
 *   you into a mountain.
 */
(function (global) {
  'use strict';

  var V = global.V || require('./vec3.js');
  var K = global.Kepler || require('./kepler.js');
  /* Bound the same way, and needed for the same reason vec3 is: wreckage is
   * hashed off the victim's id rather than rolled. Bound at the top rather
   * than reached for through `global` at the call site — regCode below does
   * that and falls back to a hash of ZERO when it is missing, which for a
   * registration is a cosmetic wrong answer and for a debris field would be
   * every shard thrown in exactly the same direction. Under a browser-shaped
   * harness the globals hang off `window`, not off node's global, so the
   * bare name does not resolve; this is what the require fallback is for. */
  var RNG = global.RNG || require('./rng.js');
  /* The reference hull is defined in generate.js, because the generator has
   * to know what a ship can do before it can decide where ports may be. */
  var Gen = global.Gen || (typeof require !== 'undefined' ? require('./generate.js') : null);
  var SPEC = (Gen && Gen.SHIP_SPEC) || {};

  /* Gravitational parameter governing a body's orbit about its parent.
   * Using (parent + self) keeps finalize() and the evaluator in agreement. */
  function orbitMu(body, sys) {
    var parent = sys.byId[body.orbit.parent];
    return parent.mu + body.mu;
  }

  /* ---- rails ---------------------------------------------------------- */

  /* Absolute world position of a body at time t.
   * Cached per time value: a single frame asks for the same positions many
   * times (render, gravity substeps, HUD), and a moon's position requires
   * walking up to its planet and then to the star. */
  /* ---- bolted to the ground --------------------------------------------
   * A surface port has no orbit. It sits at a latitude and longitude on a
   * spinning world, which makes its position a pure function of t exactly
   * like everything else here — just driven by the world's rotation rather
   * than by Kepler's equation. Same guarantee: exact a thousand years out,
   * no integration, no drift.
   *
   * Worth noticing that this gives a pad a real velocity. A world turning
   * once a day carries its ports round at a few hundred metres a second,
   * so landing means matching that, and taking off hands it back to you. */
  function surfaceOffset(host, port, t) {
    var rot = host.rotation || { period: 86400, tilt: 0, phase: 0 };
    var w = K.TAU / rot.period;                  // rad/s, signed
    var lon = port.lon + rot.phase + w * t;
    var clat = Math.cos(port.lat), slat = Math.sin(port.lat);
    // Body-fixed equatorial frame, then tipped by the axial tilt about x.
    var ex = clat * Math.cos(lon), ey = clat * Math.sin(lon), ez = slat;
    var ct = Math.cos(rot.tilt), st = Math.sin(rot.tilt);
    var r = host.radius + (port.elevation || 0);
    var px = ex * r, py = (ey * ct - ez * st) * r, pz = (ey * st + ez * ct) * r;

    // v = omega x r, with omega = (0,0,w) tipped by the same rotation.
    var oy = -st * w, oz = ct * w;
    return {
      pos: { x: px, y: py, z: pz },
      vel: { x: oy * pz - oz * py, y: oz * px, z: -oy * px }
    };
  }

  function bodyState(body, sys, t) {
    var cache = sys._cache;
    if (cache.t !== t) { cache.t = t; cache.pos = {}; cache.vel = {}; }
    var hit = cache.pos[body.id];
    if (hit) return { pos: hit, vel: cache.vel[body.id] };

    var pos, vel;
    if (body.surface) {
      var hostState = bodyState(body.parentBody, sys, t);
      var off = surfaceOffset(body.parentBody, body, t);
      pos = V.add(hostState.pos, off.pos);
      vel = V.add(hostState.vel, off.vel);
    } else if (!body.orbit) {
      pos = V.zero();
      vel = V.zero();
    } else {
      var rel = K.state(body.orbit, orbitMu(body, sys), t);
      var parent = bodyState(sys.byId[body.orbit.parent], sys, t);
      pos = V.add(parent.pos, rel.pos);
      vel = V.add(parent.vel, rel.vel);
    }
    cache.pos[body.id] = pos;
    cache.vel[body.id] = vel;
    return { pos: pos, vel: vel };
  }

  function bodyPosition(body, sys, t) { return bodyState(body, sys, t).pos; }
  function bodyVelocity(body, sys, t) { return bodyState(body, sys, t).vel; }

  /* Where a surface port's mouth is, regardless of how far underground the
   * port itself sits. For an open pad this is just bodyState(port, ...) —
   * elevation is already 0. For an underground bay it is the point on the
   * actual surface directly above the bay: same lat/lon, same rotation,
   * elevation 0. Docking, distances and the rest of the sim only ever care
   * where the port TRULY is (bodyState); this is purely for the entrance a
   * pilot can see from outside — the visual anchor render.js hangs the
   * shaft mesh from, and nothing else. */
  /* The ground frame at a surface port: local vertical plus two axes lying
   * flat on the ground. Derived exactly the way the renderer derives the
   * frame it draws the bay's mesh in — same cross products, same order —
   * because a berth computed in a different basis than the one the hangar
   * was drawn in is a ship parked in the wall. */
  function groundBasis(port, sys, t) {
    var host = port.parentBody;
    if (!host) return null;
    var ent = portEntrance(port, sys, t);
    var hs = bodyState(host, sys, t);
    var up = V.norm(V.sub(ent.pos, hs.pos));
    if (V.len(up) < 1e-9) return null;
    var east = V.norm(V.cross({ x: 0, y: 0, z: 1 }, up));
    if (V.len(east) < 1e-6) east = V.norm(V.cross({ x: 0, y: 1, z: 0 }, up));
    return { up: up, east: east, north: V.cross(east, up), entrance: ent };
  }

  /* Which berth a ship gets. Stable per port and per hull size, so you are
   * put back in the same bay when you reload — a starport that reshuffles
   * its parking every time you look away is a starport you cannot learn.
   * Berth 0 is the large bay and is reserved for hulls that need it; the
   * rest take a small or a medium interchangeably. */
  function assignBerth(ship, port) {
    var Gen = global.Gen;
    var n = (Gen && Gen.BERTH_COUNT) || 6;
    var big = (ship && ship.dryMass || 0) > 260;   // t; freighters and up
    if (big || n < 2) return 0;
    var k = String(port && port.id || 'x');
    var h = 0;
    for (var i = 0; i < k.length; i++) h = (h * 31 + k.charCodeAt(i)) >>> 0;
    return 1 + (h % (n - 1));
  }

  /* Where in the world berth `i` of this port is, and which way the ship
   * parked in it faces. */
  function berthState(port, sys, t, i) {
    var Gen = global.Gen;
    var basis = groundBasis(port, sys, t);
    if (!basis || !Gen || !Gen.berthOffset) return null;
    var g = Gen.bayGeometry(port);
    var off = Gen.berthOffset(port, i || 0);
    var r = port.radius || 1;
    var p = V.addScaled(basis.entrance.pos, basis.up, (off.z + g.lift) * r);
    p = V.addScaled(p, basis.east, off.x * r);
    p = V.addScaled(p, basis.north, off.y * r);
    return { pos: p, vel: V.clone(basis.entrance.vel), basis: basis, off: off };
  }

  function portEntrance(port, sys, t) {
    var host = port.parentBody;
    var hostState = bodyState(host, sys, t);
    var off = surfaceOffset(host, { lat: port.lat, lon: port.lon, elevation: 0 }, t);
    return { pos: V.add(hostState.pos, off.pos), vel: V.add(hostState.vel, off.vel) };
  }

  /* ---- gravity -------------------------------------------------------- */

  /* Summed gravitational acceleration at a point, in km/s^2.
   * Softened at 0.35 radii so a trajectory that clips a body's centre
   * produces a large-but-finite force rather than NaN; impacts are detected
   * separately and honestly. */
  function acceleration(pos, sys, t, out) {
    var ax = 0, ay = 0, az = 0;
    var list = sys.gravBodies;
    for (var i = 0; i < list.length; i++) {
      var b = list[i];
      var bp = bodyPosition(b, sys, t);
      var dx = bp.x - pos.x, dy = bp.y - pos.y, dz = bp.z - pos.z;
      var d2 = dx * dx + dy * dy + dz * dz;
      var soft = b.radius * 0.35;
      if (d2 < soft * soft) d2 = soft * soft;
      var d = Math.sqrt(d2);
      var f = b.mu / (d2 * d); // mu / d^3, ready to multiply by the vector
      ax += dx * f; ay += dy * f; az += dz * f;
    }
    if (out) { out.x = ax; out.y = ay; out.z = az; return out; }
    return { x: ax, y: ay, z: az };
  }

  /* Which body is currently in charge of this point — the one exerting the
   * strongest pull. Drives the HUD readout and the reference frame the
   * player's apoapsis/periapsis are quoted in. */
  function dominantBody(pos, sys, t) {
    var best = null, bestPull = -Infinity;
    for (var i = 0; i < sys.gravBodies.length; i++) {
      var b = sys.gravBodies[i];
      var d = V.dist(bodyPosition(b, sys, t), pos);
      if (d < 1e-6) d = 1e-6;
      var pull = b.mu / (d * d);
      if (pull > bestPull) { bestPull = pull; best = b; }
    }
    return best;
  }

  /* ---- the ship ------------------------------------------------------- */

  /* Any unit vector not parallel to v, for building a starting basis. */
  function anyPerpendicular(v) {
    var ref = Math.abs(v.z) < 0.9 ? { x: 0, y: 0, z: 1 } : { x: 0, y: 1, z: 0 };
    return V.norm(V.cross(ref, v));
  }

  /* "Up," locally: the direction away from whatever body currently
   * dominates this point. This is the reference the attitude ladder banks
   * and pitches against — the same local-vertical convention every
   * spacecraft navball and HUD in real use is built on. Between planets it
   * still resolves (toward whatever has the most pull, however faint),
   * so the ladder is always well-defined, just not always meaningful to
   * "level" against. */
  function localVertical(pos, sys, t) {
    var dom = dominantBody(pos, sys, t);
    var toBody = V.sub(bodyPosition(dom, sys, t), pos);
    var d = V.len(toBody);
    return { up: d > 1e-9 ? V.scale(toBody, -1 / d) : { x: 0, y: 0, z: 1 }, body: dom };
  }

  /* Where does a point sit relative to the ship's own body-frame axes?
   * The pure math behind the radar/compass HUD: a "plan view" through
   * ship-body-fixed fwd/right (fwd = 12 o'clock, right = 3 o'clock), with
   * "up" giving how far above (+) or below (-) that plane the point sits.
   * Deliberately tied to attitude, not to whatever camera happens to be
   * active, so the instrument reads the same in cockpit and orbit view —
   * exactly like a real aircraft's heading-up radar/HSI. */
  function relativeToShipFrame(ship, targetPos) {
    var rel = V.sub(targetPos, ship.pos);
    var range = V.len(rel);
    if (range < 1e-9) {
      return { range: 0, azimuth: 0, elevation: 0, fwd: 0, right: 0, up: 0 };
    }
    var fwd = V.dot(rel, ship.fwd);
    var right = V.dot(rel, ship.right);
    var up = V.dot(rel, ship.up);
    var planarRange = Math.hypot(fwd, right);
    return {
      range: range,
      azimuth: Math.atan2(right, fwd),           // 0 = dead ahead, +pi/2 = right, radians
      elevation: Math.atan2(up, planarRange || 1e-9),
      fwd: fwd, right: right, up: up              // raw ship-frame components, km
    };
  }

  /* Pitch and roll of a ship's attitude relative to a local-vertical
   * reference, i.e. the pure math behind the cockpit attitude ladder,
   * separated from drawing so it can be tested and reasoned about on its
   * own. "Pitch" is the angle of the nose above/below the local horizontal
   * plane; "roll" is how far the ship's own up has been rotated away from
   * local vertical, measured about the nose. Degenerate exactly when the
   * nose points along local vertical (looking straight at the zenith or
   * nadir), where "horizontal heading" stops being a meaningful concept —
   * every real ADI has this same pole. */
  function attitudeAngles(ship, upRef) {
    var fwd = ship.fwd;
    var vComp = V.dot(fwd, upRef);
    var horizFwd = V.sub(fwd, V.scale(upRef, vComp));
    var hLen = V.len(horizFwd);
    if (hLen < 1e-4) {
      return { pitchDeg: vComp > 0 ? 90 : -90, rollDeg: 0, horizFwd: null, degenerate: true };
    }
    horizFwd = V.scale(horizFwd, 1 / hLen);
    var pitchDeg = Math.asin(Math.max(-1, Math.min(1, vComp))) / (Math.PI / 180);

    var upRefPerp = V.sub(upRef, V.scale(fwd, V.dot(upRef, fwd)));
    var uLen = V.len(upRefPerp);
    var rollDeg = 0;
    if (uLen > 1e-6) {
      upRefPerp = V.scale(upRefPerp, 1 / uLen);
      rollDeg = Math.atan2(V.dot(V.cross(upRefPerp, ship.up), fwd), V.dot(upRefPerp, ship.up)) / (Math.PI / 180);
    }
    return { pitchDeg: pitchDeg, rollDeg: rollDeg, horizFwd: horizFwd, degenerate: false };
  }

  /* ---- the ship's mass budget ------------------------------------------
   * Once there is cargo, "how hard can I push" stops being a constant. The
   * drive produces a fixed FORCE, so acceleration is force over mass, and
   * mass is hull plus fuel plus whatever is in the hold. A full hold is
   * therefore genuinely slower to manoeuvre than an empty one, which is the
   * whole reason a trade route is a decision rather than a price lookup.
   *
   * Units: thrust in kN, masses in tonnes. kN/t is exactly m/s^2, so the
   * only conversion in here is the /1000 into the km/s^2 the rest of the
   * simulation speaks. */
  var G0 = 9.80665e-3;      // km/s^2, for Tsiolkovsky

  /* ---- two tanks, and only one of them is a decision -------------------
   *
   * The ship carries hydrogen for JUMPS and reaction mass for THRUSTERS,
   * and they are deliberately different problems.
   *
   * Jump fuel is the resource the game is about. It is scarce, it scales
   * with how much you are hauling, and running out of it strands you.
   *
   * Thruster propellant is not, and an earlier version was wrong to make it
   * so. The manoeuvring drive is a fusion torch with an exhaust velocity
   * north of a thousand km/s — the same performance the freighters must
   * have to fly the constant-acceleration transfers they fly — which means
   * nine tonnes of reaction mass is about nine hours of continuous
   * full-throttle burn. You will not spend that on an orbital insertion,
   * and stations top the tank off as part of docking. It is modelled, it is
   * displayed, and it will bite you if you hold the throttle down for half
   * a day in deep space; the rest of the time it is correctly beneath
   * notice. Flying should be about where to go, not about whether you can
   * afford to turn. */
  function cargoMass(ship) {
    var m = 0;
    for (var k in ship.cargo) m += ship.cargo[k];
    return m;
  }

  function shipMass(ship) {
    return ship.dryMass + ship.fuel + (ship.thrusterFuel || 0) + cargoMass(ship);
  }

  /* Exhaust velocity, km/s. Isp is quoted in seconds as everyone quotes it. */
  function exhaustVelocity(ship) { return (ship.thrusterIsp || ship.isp) * G0; }

  /* Tsiolkovsky on the thruster tank. With a torch drive this is a very
   * large number — that is the honest consequence of the exhaust velocity,
   * and it is why endurance rather than delta-v is the figure worth putting
   * in front of a pilot. */
  function deltaV(ship) {
    var m0 = shipMass(ship);
    var m1 = m0 - (ship.thrusterFuel || 0);
    if (m1 <= 0 || !(ship.thrusterFuel > 0)) return 0;
    return exhaustVelocity(ship) * Math.log(m0 / m1);
  }

  /* Seconds of continuous full-throttle burn left in the thruster tank.
   * The number a pilot can actually use. */
  function thrusterEndurance(ship) {
    // Tonnes per second, the same expression fuelBurn uses. (Reading this
    // as kg/s and then converting is exactly how the first version came out
    // a thousand times too long — nine thousand hours of endurance is a
    // number you notice, which is why there is a test for it.)
    var mdot = ship.thrustKN / (ship.thrusterIsp * 9.80665);
    if (!(mdot > 0)) return Infinity;
    return ship.thrusterFuel / mdot;
  }

  /* Recompute derived performance after anything changes the mass — a
   * trade, a refuel, a jettison. Cheap, so callers can just call it. */
  function refreshShip(ship) {
    ship.mass = shipMass(ship);
    ship.maxAccel = (ship.thrustKN / ship.mass) / 1000;   // km/s^2
    ship.deltaV = deltaV(ship);
    /* Frontal area for drag, derived rather than tabulated: area goes as
     * the two-thirds power of mass for anything built to roughly the same
     * proportions, so one expression covers every hull in the catalogue and
     * stays right for hulls nobody has written yet. Uses DRY mass, because
     * loading cargo makes a ship heavier without making it any wider —
     * which is exactly why a laden ship falls through an atmosphere faster
     * than an empty one, and it should. */
    ship.dragArea = 0.9 * Math.pow(Math.max(ship.dryMass || 1, 1), 2 / 3);
    /* Gear down is a third again as much to push through the air. Small
     * enough to ignore in vacuum, where it costs nothing at all, and large
     * enough that dropping it early on an entry is a decision rather than a
     * free habit — which is the only thing that makes remembering to raise
     * it worth anything. */
    if (ship.gear) ship.dragArea *= GEAR_DRAG_FACTOR;
    return ship;
  }

  var GEAR_DRAG_FACTOR = 1.34;

  /* Propellant burned in dt seconds at the ship's current thrust setting.
   *   mdot [kg/s] = F [N] / (Isp [s] * g0 [m/s^2])
   * with F = thrustKN * 1000, and the result divided by 1000 again to land
   * in tonnes — so the two conversions cancel and the expression below is
   * simply thrustKN * throttle * dt / (Isp * g0). Worth spelling out: the
   * first version of this dropped the newton conversion and burned fuel a
   * thousand times too slowly, which made the tank effectively infinite and
   * quietly removed the entire point of having range as a constraint. */
  function fuelBurn(ship, dt) {
    var throttle = ship.maxAccel > 0 ? V.len(ship.thrust) / ship.maxAccel : 0;
    if (throttle <= 0) return 0;
    return (ship.thrustKN * throttle * dt) / (ship.thrusterIsp * 9.80665);   // tonnes
  }

  function makeShip(pos, vel) {
    // Face prograde by default — the direction you are actually going is
    // the only sane default when nothing else has been chosen yet.
    var fwd = V.len(vel) > 1e-9 ? V.norm(vel) : { x: 1, y: 0, z: 0 };
    var right = anyPerpendicular(fwd);
    var up = V.cross(right, fwd);
    var ship = {
      pos: V.clone(pos),
      vel: V.clone(vel),
      thrust: V.zero(),      // commanded acceleration, km/s^2
      throttle: 0,
      maxAccel: 2.0e-5,      // recomputed from thrust/mass by refreshShip

      /* Mass budget. A fusion torch: high exhaust velocity, so the tank is
       * small relative to the delta-v it buys, but not free — a full hold
       * roughly halves both acceleration and range. */
      /* The hull's numbers live in generate.js, not here. The world is
       * built around them — whether a world may have a surface port at all
       * is decided by whether this ship can lift off it — so there has to
       * be exactly one copy, and the generator is the thing that needs it
       * first. The fallbacks below are only for loading sim.js alone. */
      dryMass: SPEC.dryMass || 42,
      thrustKN: SPEC.thrustKN || 1800,
      isp: 4200,                                  // legacy field
      thrusterIsp: SPEC.thrusterIsp || 450000,
      thrusterFuel: SPEC.thrusterFuel || 12,      // reaction mass; free on docking
      thrusterCap: SPEC.thrusterCap || 12,
      fuel: SPEC.fuel || 28,                      // hydrogen — JUMP fuel, the scarce one
      fuelCap: SPEC.fuelCap || 28,
      gear: false,                                // landing gear, Shift+G
      cargo: {},                                  // commodity id -> tonnes
      cargoCap: SPEC.cargoCap || 64,
      credits: SPEC.credits || 3200,
      fuelOut: false,

      landed: false,
      crashed: false,
      landedOn: null,
      docked: null,           // body this ship is docked to, or null

      /* Attitude: an orthonormal basis, NOT tied to the velocity vector.
       * A spacecraft can point anywhere regardless of where it's going —
       * that's the whole reason attitude and translation are separate
       * systems here, just as they are on a real vehicle. */
      fwd: fwd, up: up, right: right,
      angRate: { pitch: 0, yaw: 0, roll: 0 }   // rad/s, body-frame
    };
    return refreshShip(ship);
  }

  /* Simplification, noted honestly: real rigid-body rotation is
   * frictionless and would spin forever once started, same as translation.
   * We add damping here so the ship "coasts to a stop" when the player lets
   * go, the way almost every playable space sim models RCS with assumed
   * damping thrusters rather than making the player fight momentum on every
   * axis. A true free-rotation mode (no damping) would be a fine option to
   * add later, not a fix — this is a deliberate playability choice. */
  var ANG_ACCEL = 0.6;     // rad/s^2 while a rotation key is held
  var ANG_DAMPING = 1.8;   // 1/s
  var ANG_RATE_MAX = 0.8;  // rad/s

  function integrateAttitude(ship, dt, cmd) {
    var r = ship.angRate;
    r.pitch = clampRate(r.pitch + ((cmd.pitch || 0) * ANG_ACCEL - r.pitch * ANG_DAMPING) * dt);
    r.yaw   = clampRate(r.yaw   + ((cmd.yaw   || 0) * ANG_ACCEL - r.yaw   * ANG_DAMPING) * dt);
    r.roll  = clampRate(r.roll  + ((cmd.roll  || 0) * ANG_ACCEL - r.roll  * ANG_DAMPING) * dt);

    // Body rates -> one world-frame angular velocity vector, applied as a
    // single Rodrigues rotation this step (first-order but accurate for the
    // small angles a frame covers).
    var wx = ship.right.x * r.pitch + ship.up.x * r.yaw + ship.fwd.x * r.roll;
    var wy = ship.right.y * r.pitch + ship.up.y * r.yaw + ship.fwd.y * r.roll;
    var wz = ship.right.z * r.pitch + ship.up.z * r.yaw + ship.fwd.z * r.roll;
    var wLen = Math.sqrt(wx * wx + wy * wy + wz * wz);
    if (wLen > 1e-10) {
      var axis = { x: wx / wLen, y: wy / wLen, z: wz / wLen };
      var ang = wLen * dt;
      ship.fwd = V.rotateAroundAxis(ship.fwd, axis, ang);
      ship.up = V.rotateAroundAxis(ship.up, axis, ang);
    }
    orthonormalize(ship);
  }

  function clampRate(r) { return Math.max(-ANG_RATE_MAX, Math.min(ANG_RATE_MAX, r)); }

  /* Floating-point drift and the first-order rotation above both nudge the
   * basis away from orthonormal over many frames. Fix it every step — cheap,
   * and it means the ship model and cockpit view never visibly skew. */
  function orthonormalize(ship) {
    ship.fwd = V.norm(ship.fwd);
    ship.right = V.norm(V.cross(ship.fwd, ship.up));
    ship.up = V.cross(ship.right, ship.fwd);
  }

  /* One RK4 step of dt seconds starting at absolute time t.
   * The acceleration field is time-dependent (the bodies move underneath us),
   * so each stage samples the field at its own time offset. */
  /* ---- atmosphere -------------------------------------------------------
   * Density at an altitude, as a plain exponential. Below the surface it
   * clamps rather than running away to infinity, because the integrator can
   * and does step a ghost briefly underground before checkImpact catches
   * it, and an exponential evaluated at negative altitude would hand back a
   * drag force large enough to fling that ghost across the system. */
  function airDensity(body, altitudeKm) {
    var at = body && body.atmosphere;
    if (!at) return 0;
    if (altitudeKm >= at.top) return 0;
    if (altitudeKm < 0) altitudeKm = 0;
    return at.rho0 * Math.exp(-altitudeKm / at.scaleHeight);
  }

  /* Is the ship inside anything's air, and if so whose?
   *
   * Resolved ONCE per integration step rather than per RK4 stage: the four
   * stages span at most a few seconds of a body's orbit, so which body owns
   * the air cannot change between them, and doing the lookup four times
   * would put dominantBody back in the hot path that the trajectory work
   * just got it out of. */
  function anyAtmosphere(sys) {
    if (sys._anyAtmosphere === undefined) {
      var any = false;
      for (var i = 0; i < sys.bodies.length; i++) {
        if (sys.bodies[i].atmosphere) { any = true; break; }
      }
      sys._anyAtmosphere = any;
    }
    return sys._anyAtmosphere;
  }

  function atmosphereContext(pos, sys, t) {
    if (!anyAtmosphere(sys)) return null;
    var dom = dominantBody(pos, sys, t);
    if (!dom || !dom.atmosphere) return null;
    var st = bodyState(dom, sys, t);
    var alt = V.dist(pos, st.pos) - dom.radius;
    if (alt >= dom.atmosphere.top) return null;
    return { body: dom, pos: st.pos, vel: st.vel };
  }

  /* Drag acceleration, km/s^2.
   *
   *   a = ½ ρ v² (Cd·A) / m
   *
   * with ρ in kg/m³, v in km/s and m in tonnes, the unit conversions cancel
   * to exactly one half — the metres in v² cancel the tonnes in m. Worth
   * stating because it looks like a missing constant and is not.
   *
   * Velocity is measured RELATIVE TO THE BODY, not absolutely: a ship
   * parked in a planet's atmosphere is still doing 30 km/s around the star,
   * and charging it drag for the planet's own orbital motion would burn it
   * up while sitting on the pad. Rotation of the atmosphere itself is
   * ignored; it is a few hundred m/s against entry speeds in the thousands. */
  function dragAccel(pos, vel, atmo, ship) {
    if (!atmo) return ZERO_ACC;
    var alt = V.dist(pos, atmo.pos) - atmo.body.radius;
    var rho = airDensity(atmo.body, alt);
    if (rho <= 0) return ZERO_ACC;
    var rel = V.sub(vel, atmo.vel);
    var speed = V.len(rel);
    if (speed < 1e-9) return ZERO_ACC;
    var k = 0.5 * rho * speed * (ship.dragArea || DEFAULT_DRAG_AREA) /
            Math.max(ship.mass || 1, 1e-6);
    return { x: -rel.x * k, y: -rel.y * k, z: -rel.z * k };
  }

  var ZERO_ACC = { x: 0, y: 0, z: 0 };
  var DEFAULT_DRAG_AREA = 14;      // Cd*A, m^2 — a small ship, blunt side on

  function stepShip(ship, sys, t, dt) {
    var p0 = ship.pos, v0 = ship.vel, th = ship.thrust;
    var atmo = ship.noDrag ? null : atmosphereContext(p0, sys, t);

    var a1 = acceleration(p0, sys, t);
    var p1 = p0, v1 = v0;
    var d1 = dragAccel(p0, v1, atmo, ship);
    var A1 = { x: a1.x + th.x + d1.x, y: a1.y + th.y + d1.y, z: a1.z + th.z + d1.z };

    var p2 = V.addScaled(p0, v1, dt / 2);
    var v2 = V.addScaled(v0, A1, dt / 2);
    var a2 = acceleration(p2, sys, t + dt / 2);
    var d2 = dragAccel(p2, v2, atmo, ship);
    var A2 = { x: a2.x + th.x + d2.x, y: a2.y + th.y + d2.y, z: a2.z + th.z + d2.z };

    var p3 = V.addScaled(p0, v2, dt / 2);
    var v3 = V.addScaled(v0, A2, dt / 2);
    var a3 = acceleration(p3, sys, t + dt / 2);
    var d3 = dragAccel(p3, v3, atmo, ship);
    var A3 = { x: a3.x + th.x + d3.x, y: a3.y + th.y + d3.y, z: a3.z + th.z + d3.z };

    var p4 = V.addScaled(p0, v3, dt);
    var v4 = V.addScaled(v0, A3, dt);
    var a4 = acceleration(p4, sys, t + dt);
    var d4 = dragAccel(p4, v4, atmo, ship);
    var A4 = { x: a4.x + th.x + d4.x, y: a4.y + th.y + d4.y, z: a4.z + th.z + d4.z };

    var sixth = dt / 6;
    ship.pos = {
      x: p0.x + sixth * (v1.x + 2 * v2.x + 2 * v3.x + v4.x),
      y: p0.y + sixth * (v1.y + 2 * v2.y + 2 * v3.y + v4.y),
      z: p0.z + sixth * (v1.z + 2 * v2.z + 2 * v3.z + v4.z)
    };
    ship.vel = {
      x: v0.x + sixth * (A1.x + 2 * A2.x + 2 * A3.x + A4.x),
      y: v0.y + sixth * (A1.y + 2 * A2.y + 2 * A3.y + A4.y),
      z: v0.z + sixth * (A1.z + 2 * A2.z + 2 * A3.z + A4.z)
    };
    return ship;
  }

  /* ---- re-entry heating -------------------------------------------------
   * Compression heating, as a Sutton-Graves proxy: flux goes as the square
   * root of density times the CUBE of speed. No fluid dynamics, and none
   * needed — the cube is the whole story a player has to feel. It says that
   * halving your entry speed cuts the heating eightfold, which is precisely
   * the lesson a shallow approach is supposed to teach, and no amount of
   * real CFD would teach it better.
   *
   * Deliberately NOT part of stepShip. The integrator is run on throwaway
   * ghosts hundreds of times a second by the trajectory predictor and the
   * impact scanner, and a ghost that banked heat would either corrupt the
   * player's hull from a prediction or need the state carefully stripped
   * out afterwards. Heat belongs to the one real ship, so it is applied
   * from the live update and nowhere else. */
  var HEAT_K = 4.0;             // tunes sqrt(rho) * v^3 into heat units/s
  var HEAT_LIMIT = 100;         // hull starts cooking above this
  /* Stored heat is capped rather than left to accumulate. Uncapped, a steep
   * entry ran the figure to twelve times the limit within seconds, which
   * had two bad consequences: the damage rate became effectively unbounded,
   * and the heat shield's 42-a-second stopped mattering at all, since
   * nothing it sheds makes a dent in a number that large. Capping it means
   * the shield is always doing something you can feel, and the worst case
   * is a survivable ten hull points a second rather than an instant kill. */
  var HEAT_MAX = 300;
  var HEAT_DAMAGE = 0.025;      // hull points/s per unit of overshoot
  /* Tuned against the measured flux envelope rather than guessed. Across a
   * thick world, flux runs from 0.1 units/s high and slow to 10,000 deep
   * and fast — the cube law means SPEED is almost the whole story, and
   * dropping from orbital to a third of it cuts heating roughly fortyfold.
   *
   * Bare hull sheds 18, which covers a properly flown descent: slow first,
   * then down. It does not cover arriving at orbital speed, and should not.
   * The shield's 130 covers a fast entry at sensible altitude and still
   * fails if you take it deep at speed — there is meant to be a way to die
   * with one fitted, or it is not a decision, just a tax. */
  var BASE_HEAT_SHED = 18;      // what bare hull radiates away, units/s
  /* The flux that reads as a fully lit shock layer. Set at 60 to begin
   * with, which was far too low: a survivable entry already runs well past
   * it, so the glow pinned at maximum the moment air was touched and the
   * whole orange-to-white progression the shader draws was never once
   * visible in play. Only looking at it showed that up.
   *
   * 220 puts the interesting part of the curve where the interesting part
   * of the flight is — faint at speeds you can survive, fierce when you are
   * in trouble — and the square root spreads the low end out, because
   * apparent brightness is not linear in flux and the difference between
   * "warm" and "worryingly warm" is the one worth seeing. */
  var GLOW_REFERENCE = 220;

  function heatFlux(ship, sys, t) {
    var atmo = atmosphereContext(ship.pos, sys, t);
    if (!atmo) { ship.windDir = null; return 0; }
    var alt = V.dist(ship.pos, atmo.pos) - atmo.body.radius;
    var rho = airDensity(atmo.body, alt);
    if (rho <= 0) { ship.windDir = null; return 0; }
    var rel = V.sub(ship.vel, atmo.vel);
    var v = V.len(rel);
    /* Which way the air is arriving from, in world space. Stored rather
     * than recomputed by the renderer: it falls out of the flux
     * calculation for free, and it is the only thing the plasma shader
     * needs to know WHERE on the hull to burn — the windward faces, not
     * the whole ship. A hull that glows uniformly looks like it is on
     * fire; one that glows only where it is hitting the air looks like it
     * is going too fast, which is the thing being communicated. */
    ship.windDir = v > 1e-9 ? { x: rel.x / v, y: rel.y / v, z: rel.z / v } : null;
    return HEAT_K * Math.sqrt(rho) * v * v * v;
  }

  /* Returns hull damage dealt this step, so the caller can react to it
   * (warn, make a noise, kill the player) without sim.js having to know
   * what any of those mean. */
  function updateHeating(ship, sys, t, dt) {
    if (!(dt > 0)) return 0;
    var flux = heatFlux(ship, sys, t);
    ship.heatFlux = flux;

    /* Shedding is THROUGHPUT, and it is the whole distinction between the
     * two shields on sale. An energy shield is a bucket: large capacity,
     * refilled slowly, perfect against one hard hit and useless against a
     * sustained load. A heat shield is a pipe: no capacity at all, but it
     * moves heat away continuously for as long as the load lasts. Buying
     * the wrong one for the job is a real mistake, and it should be. */
    var shed = BASE_HEAT_SHED + (ship.heatShed || 0);
    ship.heat = Math.max(0, Math.min(HEAT_MAX,
                (ship.heat || 0) + (flux - shed) * dt));
    ship.reentryGlow = Math.max(0, Math.min(1, Math.sqrt(flux / GLOW_REFERENCE)));

    if (ship.heat <= HEAT_LIMIT) return 0;
    var dmg = (ship.heat - HEAT_LIMIT) * HEAT_DAMAGE * dt;
    if (ship.hullHp !== undefined) ship.hullHp = Math.max(0, ship.hullHp - dmg);
    return dmg;
  }

  /* A sensible integration step: a fixed small fraction of the orbital period
   * at the current distance from whatever body dominates. Close to a moon
   * that means seconds; out between planets it means many minutes. */
  function suggestedStep(ship, sys, t) {
    var dom = dominantBody(ship.pos, sys, t);
    var r = V.dist(bodyPosition(dom, sys, t), ship.pos);
    if (r < dom.radius) r = dom.radius;
    var localPeriod = K.TAU * Math.sqrt((r * r * r) / dom.mu);
    return Math.max(0.05, Math.min(localPeriod / 900, 7200));
  }

  /* Would advancing dtSim seconds fly straight through something?
   * A big warp jump takes one giant physical step; if the ship's current
   * trajectory intersects a body anywhere inside that span, the substepped
   * integration will find the impact correctly, but the PLAYER never saw it
   * coming — the periapsis was eaten between one rendered frame and the
   * next. This runs the same forward integration the trajectory line uses,
   * cheaply (it reuses suggestedStep's adaptive sizing, not a fixed fine
   * grid), and reports the first impact so callers can warn or cap warp
   * before committing to the jump rather than after. */
  function scanForImpact(ship, sys, t, dtSim, maxSteps) {
    maxSteps = maxSteps || 2000;
    var ghost = makeShip(ship.pos, ship.vel);
    var tt = t, remaining = dtSim;
    for (var i = 0; i < maxSteps && remaining > 1e-6; i++) {
      var h = Math.min(suggestedStep(ghost, sys, tt), remaining);
      stepShip(ghost, sys, tt, h);
      tt += h; remaining -= h;
      var hit = checkImpact(ghost, sys, tt);
      if (hit) return { body: hit, t: tt, inSeconds: tt - t, speed: ghost.impactSpeed };
    }
    return null;
  }

  /* Advance the ship by dtSim seconds of game time, substepping for accuracy.
   * If honest accuracy would need more substeps than we can afford in a
   * frame, we say so (physicsLimited) rather than quietly integrating
   * garbage — a lie in the physics is worse than a lower time warp. */
  function advanceShip(ship, sys, t, dtSim, maxSteps) {
    maxSteps = maxSteps || 3000;
    if (ship.landed || ship.crashed) return { t: t + dtSim, steps: 0, physicsLimited: false };

    var h = suggestedStep(ship, sys, t);
    var steps = Math.ceil(Math.abs(dtSim) / h);
    var limited = false;
    if (steps > maxSteps) { steps = maxSteps; limited = true; }
    if (steps < 1) steps = 1;
    h = dtSim / steps;

    /* Propellant is spent in SIMULATION seconds, not real ones. This is the
     * one place that distinction really bites: holding W at 10,000x burns
     * ten thousand times the fuel, because it is ten thousand times the
     * burn. Anything else would make time warp a free delta-v cheat. */
    ship.fuelOut = false;
    for (var i = 0; i < steps; i++) {
      if (ship.thrusterFuel <= 0 && V.len(ship.thrust) > 0) {
        ship.thrust = V.zero();
        ship.throttle = 0;
        ship.fuelOut = true;
      }
      var burn = fuelBurn(ship, Math.abs(h));
      if (burn > 0) {
        if (burn >= ship.thrusterFuel) {
          /* Ran dry inside this substep. Rather than pretend the whole step
           * was powered, scale the thrust down to what the remaining
           * reaction mass could actually deliver and then shut the drive
           * off. Note this is the THRUSTER tank; the jump tank is never
           * touched by manoeuvring. */
          var frac = ship.thrusterFuel / burn;
          ship.thrust = V.scale(ship.thrust, frac);
          ship.thrusterFuel = 0;
          ship.fuelOut = true;
        } else {
          ship.thrusterFuel -= burn;
        }
        refreshShip(ship);
      }
      stepShip(ship, sys, t, h);
      t += h;
      var hit = checkImpact(ship, sys, t, true);
      if (hit) break;
    }
    if (ship.fuelOut) ship.thrust = V.zero();
    return { t: t, steps: steps, physicsLimited: limited, fuelOut: ship.fuelOut };
  }

  /* ---- other ships -----------------------------------------------------
   * Traffic is ON RAILS, in exactly the sense the planets are. A route is a
   * timetable — depart A, cross, sit at B, cross back — and this function
   * evaluates where that puts a ship at time t. Nothing is integrated, so
   * a freighter cannot drift, cannot need catching up after a warp jump,
   * and is in precisely the same place every time you visit that instant.
   *
   * The one thing worth being careful about is the reference frame, because
   * it is the same trap that bit the trajectory display and the ship's
   * spawn attitude. Interpolating between two ports in ABSOLUTE coordinates
   * would drag every local shuttle hop sideways through the planet's own
   * ~48 km/s solar orbit, and the result looks like the ship is being flung
   * across the system. So the crossing is computed relative to the two
   * ports' COMMON PARENT — the planet for a local hop, the star for an
   * interplanetary run — and only then placed back into world coordinates.
   *
   * The path itself is a spiral rather than a straight line: rotate the
   * departure direction toward the arrival direction while easing the
   * radius from one orbit to the other. That costs nothing extra, reads as
   * a transfer rather than a ruler line, and — the actual reason — it can
   * never pass through the body both ports are orbiting, which a straight
   * lerp between opposite sides of a star very much would. */
  function smootherstep(u) {
    return u * u * u * (u * (u * 6 - 15) + 10);
  }
  function smootherstepPrime(u) {
    return 30 * u * u * (u - 1) * (u - 1);
  }

  /* Body position/velocity WITHOUT touching the per-frame memo.
   *
   * Needed because a leg's geometry is defined at its scheduled departure
   * and arrival times, not at the current instant, and the normal
   * bodyState() cache holds exactly one time value — asking it for t+cruise
   * would flush every position the rest of the frame is about to reuse.
   * A station is three links from the root, so this is a handful of Kepler
   * solves and it is called once per leg, not once per frame. */
  function bodyStateAt(body, sys, t) {
    if (body.surface) {
      var hostAt = bodyStateAt(body.parentBody, sys, t);
      var off = surfaceOffset(body.parentBody, body, t);
      return { pos: V.add(hostAt.pos, off.pos), vel: V.add(hostAt.vel, off.vel) };
    }
    if (!body.orbit) return { pos: V.zero(), vel: V.zero() };
    var rel = K.state(body.orbit, orbitMu(body, sys), t);
    var parent = bodyStateAt(sys.byId[body.orbit.parent], sys, t);
    return { pos: V.add(parent.pos, rel.pos), vel: V.add(parent.vel, rel.vel) };
  }

  /* Where a ship parks when it is alongside a port rather than inside it —
   * straight "up" from the port, along the port's own radial. Returned as a
   * world vector so the cruise arc can blend into it at both ends. */
  function parkOffset(port, sys, t, parentFallback) {
    var host = port.parentBody || parentFallback;
    var ps = bodyStateAt(port, sys, t);
    var hs = bodyStateAt(host, sys, t);
    var radial = V.norm(V.sub(ps.pos, hs.pos));
    if (V.len(radial) < 1e-9) radial = { x: 0, y: 0, z: 1 };
    var park = (port.dockCaptureRadius || port.radius * 4) * 0.85;
    return { dir: radial, vec: V.scale(radial, park) };
  }

  /* A single leg's geometry, frozen.
   *
   * This is the fix for a bug worth recording. The first version built the
   * transfer arc from where the two ports are RIGHT NOW and rotated the
   * departure bearing toward the arrival bearing along the shorter way
   * round. But the ports keep orbiting during the crossing, so the angle
   * between them sweeps — and the instant it passes 180 degrees, "the
   * shorter way round" flips to the other side and the ship jumped bodily
   * across the sky mid-flight.
   *
   * A leg is therefore pinned to its own two moments in time: where port A
   * is when it departs, and where port B will be when it arrives. Those are
   * constants for the whole crossing, so the arc cannot flip, and the ship
   * still leaves exactly from A and still arrives exactly at B, because
   * those are the very points the arc was built from. It also makes the
   * "on rails" claim literally true: a leg is a fixed arc between two fixed
   * events, not a curve recomputed from live inputs every frame. */
  function legGeometry(route, sys, key, src, dst, parent, tDep, tArr) {
    if (route._leg && route._leg.key === key) return route._leg;

    var pDep = bodyStateAt(parent, sys, tDep), pArr = bodyStateAt(parent, sys, tArr);
    var sState = bodyStateAt(src, sys, tDep), dState = bodyStateAt(dst, sys, tArr);
    var s = V.sub(sState.pos, pDep.pos);
    var d = V.sub(dState.pos, pArr.pos);
    var rs = V.len(s), rd = V.len(d);
    var sh = rs > 1e-9 ? V.scale(s, 1 / rs) : { x: 1, y: 0, z: 0 };
    var dh = rd > 1e-9 ? V.scale(d, 1 / rd) : { x: 0, y: 1, z: 0 };

    var cosA = Math.max(-1, Math.min(1, V.dot(sh, dh)));
    var ang = Math.acos(cosA);
    var axis = V.cross(sh, dh);
    var al = V.len(axis);
    if (al < 1e-9) axis = anyPerpendicular(sh);
    else axis = V.scale(axis, 1 / al);

    route._leg = {
      key: key, sh: sh, dh: dh, rs: rs, rd: rd, ang: ang, axis: axis,
      chord: V.sub(d, s),
      vs: V.sub(sState.vel, pDep.vel), vd: V.sub(dState.vel, pArr.vel),
      srcPark: parkOffset(src, sys, tDep, parent),
      dstPark: parkOffset(dst, sys, tArr, parent)
    };
    return route._leg;
  }

  /* ---- where a moored ship actually is ----------------------------------
   * Traffic used to park alongside every port the same way, which is right
   * for a station in orbit and wrong for the two kinds of port that are
   * holes in a planet: a freighter "moored" at a surface pad hovered a few
   * kilometres over it for hours, and one at an underground bay hung above
   * the mouth it was supposed to be inside. Ports read as places when the
   * traffic uses them the way you do.
   *
   * Still a pure function of t — the pose is derived from the port, not
   * integrated — so nothing here breaks the rails. */
  function dockPose(dst, sys, t, parent) {
    var host = dst.parentBody || parent;
    var hs = bodyState(host, sys, t);
    var ds = bodyState(dst, sys, t);
    var up = V.norm(V.sub(ds.pos, hs.pos));
    if (V.len(up) < 1e-9) up = { x: 0, y: 0, z: 1 };

    if (dst.underground) {
      /* Down the shaft and out of sight. Parked a little below the collar,
       * so from orbit the bay reads as occupied rather than as a ship
       * sitting on a hole. */
      var mouth = portEntrance(dst, sys, t);
      var mup = V.norm(V.sub(mouth.pos, hs.pos));
      return {
        pos: V.addScaled(mouth.pos, mup, -(dst.tunnelRadius || dst.radius) * 1.6),
        vel: mouth.vel, up: mup, fwd: mup, inside: true
      };
    }
    if (dst.surface) {
      // Sitting on the pad, nose up, the way it would have landed.
      return {
        pos: V.addScaled(ds.pos, up, dst.radius * 0.4),
        vel: ds.vel, up: up, fwd: up, landed: true
      };
    }
    /* An orbital station: alongside, not inside. A freighter drawn exactly
     * on top of the port's own marker just looks like the marker got
     * brighter. */
    var park = (dst.dockCaptureRadius || dst.radius * 4) * 0.85;
    var along = V.sub(ds.vel, hs.vel);
    return {
      pos: V.addScaled(ds.pos, up, park), vel: ds.vel, up: up,
      fwd: V.len(along) > 1e-9 ? V.norm(along) : up
    };
  }

  /* The last of an approach and the first of a departure are flown as a
   * descent and a climb rather than as more of the crossing. This is the
   * fraction of a leg each of those takes. */
  var TRAFFIC_TOUCHDOWN = 0.05;

  function trafficState(route, sys, t) {
    var A = sys.byId[route.from], B = sys.byId[route.to];
    var parent = sys.byId[route.parentId];
    var period = route.period, cruise = route.cruise, lay = route.layover;

    var cycle = Math.floor((t - route.t0) / period);
    var cycleStart = route.t0 + cycle * period;
    var ph = t - cycleStart;

    var outbound, u, moored, tDep;
    if (ph < cruise) {
      outbound = true; moored = false; u = ph / cruise; tDep = cycleStart;
    } else if (ph < cruise + lay) {
      outbound = true; moored = true; u = 1; tDep = cycleStart;
    } else if (ph < 2 * cruise + lay) {
      outbound = false; moored = false;
      u = (ph - cruise - lay) / cruise; tDep = cycleStart + cruise + lay;
    } else {
      outbound = false; moored = true; u = 1; tDep = cycleStart + cruise + lay;
    }

    var src = outbound ? A : B, dst = outbound ? B : A;

    if (moored) {
      var pose = dockPose(dst, sys, t, parent);
      var moor = finishTraffic(route, pose.pos, pose.vel, pose.fwd, pose.up,
                               'moored', u, src, dst, outbound);
      moor.throttle = 0;              // parked; drives cold
      moor.landed = !!pose.landed;
      moor.inside = !!pose.inside;
      return moor;
    }

    var leg = legGeometry(route, sys, cycle * 2 + (outbound ? 0 : 1),
                          src, dst, parent, tDep, tDep + cruise);
    var ps = bodyState(parent, sys, t);

    var e = smootherstep(u);
    var dir = V.rotateAroundAxis(leg.sh, leg.axis, leg.ang * e);
    var r = leg.rs + (leg.rd - leg.rs) * e;
    // A small outward bow, so the arc reads as a transfer with an apoapsis
    // rather than as a radius sweep at constant altitude.
    r *= 1 + 0.055 * Math.sin(Math.PI * e);

    /* Blend from parked-alongside-A to parked-alongside-B across the
     * crossing, so the cruise meets the moored phase at both ends with no
     * step. Without this the ship jumped by the parking offset — small, but
     * exactly the kind of small jump that reads as a glitch. */
    var wpos = {
      x: ps.pos.x + dir.x * r + leg.srcPark.vec.x * (1 - e) + leg.dstPark.vec.x * e,
      y: ps.pos.y + dir.y * r + leg.srcPark.vec.y * (1 - e) + leg.dstPark.vec.y * e,
      z: ps.pos.z + dir.z * r + leg.srcPark.vec.z * (1 - e) + leg.dstPark.vec.z * e
    };

    /* Velocity, from the analytic derivative of the straight-chord form of
     * the same motion. It differs from the spiral's true derivative by a
     * few percent mid-crossing — invisible on a heading arrow — and is
     * right at both ends, where it is the difference between a ship that
     * arrives station-keeping and one that arrives sideways. */
    var ep = smootherstepPrime(u) / cruise;
    var velRel = {
      x: leg.vs.x + (leg.vd.x - leg.vs.x) * e + leg.chord.x * ep,
      y: leg.vs.y + (leg.vd.y - leg.vs.y) * e + leg.chord.y * ep,
      z: leg.vs.z + (leg.vd.z - leg.vs.z) * e + leg.chord.z * ep
    };
    var wvel = V.add(ps.vel, velRel);
    var heading = V.len(velRel) > 1e-9 ? V.norm(velRel) : dir;

    /* Past the midpoint the ship has flipped to brake — that is what a
     * constant-acceleration transfer IS, and it is the single detail that
     * makes watching traffic legible: a freighter coming toward you is
     * pointing at you, and one that has already turned over is showing you
     * its drive. The velocity is unchanged; only which way it faces. */
    var facing = u > 0.5 ? V.scale(heading, -1) : heading;

    /* Touchdown and lift-off. The crossing above ends alongside the port;
     * these last and first moments take the ship the rest of the way in —
     * down onto a pad, or down the shaft of a bay — and back out again. It
     * is an interpolation rather than a landing simulation, but it is the
     * difference between traffic that visits ports and traffic that stops
     * near them, and it costs one blend.
     *
     * Only surface pads and underground bays get this. A station in orbit
     * is already where a moored ship should be. */
    var phase = 'cruise', landing = 0, pose = null;
    if (u > 1 - TRAFFIC_TOUCHDOWN && (dst.surface || dst.underground)) {
      pose = dockPose(dst, sys, t, parent);
      landing = smootherstep((u - (1 - TRAFFIC_TOUCHDOWN)) / TRAFFIC_TOUCHDOWN);
      phase = 'descent';
    } else if (u < TRAFFIC_TOUCHDOWN && (src.surface || src.underground)) {
      pose = dockPose(src, sys, t, parent);
      landing = smootherstep(1 - u / TRAFFIC_TOUCHDOWN);
      phase = 'liftoff';
    }
    if (pose) {
      wpos = {
        x: wpos.x + (pose.pos.x - wpos.x) * landing,
        y: wpos.y + (pose.pos.y - wpos.y) * landing,
        z: wpos.z + (pose.pos.z - wpos.z) * landing
      };
      wvel = {
        x: wvel.x + (pose.vel.x - wvel.x) * landing,
        y: wvel.y + (pose.vel.y - wvel.y) * landing,
        z: wvel.z + (pose.vel.z - wvel.z) * landing
      };
      /* The nose comes up to vertical when the ship is CLOSE, not when the
       * clock says it is nearly there. Blending on the phase fraction had a
       * freighter standing on its tail thirteen thousand kilometres out,
       * because five percent of an interplanetary crossing is still a long
       * way — the manoeuvre belongs to the last few pad-widths, so it is
       * driven by the distance that is actually left. */
      var flare = V.dist(wpos, pose.pos);
      var faceUp = 1 - Math.min(1, flare / Math.max((dst.radius || 0.05) * 60, 8));
      facing = V.norm({
        x: facing.x + (pose.up.x - facing.x) * faceUp,
        y: facing.y + (pose.up.y - facing.y) * faceUp,
        z: facing.z + (pose.up.z - facing.z) * faceUp
      });
      if (V.len(facing) < 1e-9) facing = pose.up;
    }

    var st = finishTraffic(route, wpos, wvel, facing, dir, phase, u, src, dst, outbound);
    st.throttle = phase === 'cruise' ? 1 : Math.max(0.25, 1 - landing * 0.75);
    st.braking = u > 0.5 && phase !== 'liftoff';
    st.landing = landing;
    return st;
  }

  /* ---- ships that are not carrying anything ---------------------------
   * Police, escorts and pirates. Two kinds of rail: a police patrol or an
   * escort flies a timetable, which is exactly a trade route with an empty
   * manifest, so it goes straight through trafficState. A pirate instead
   * sits on a real Kepler orbit — nobody is expecting a pirate, so a
   * timetable would be the wrong shape for it, and an eccentric loiter
   * above a busy port is both cheaper and more honest.
   *
   * Either way it stays a pure function of t right up until the player is
   * close enough for it to matter. */
  function patrolState(spec, sys, t) {
    if (spec.live) return spec.live;

    /* A lifted trader has no rail of its own — its rail is the traffic
     * route it came off, and combat.js reaps it the moment it sleeps. If
     * anything asks in the one frame between those two events, the honest
     * answer is nothing. */
    if (spec.rail.type === 'lifted') return null;

    var st;
    if (spec.rail.type === 'route') {
      st = trafficState(spec.rail.route, sys, t);
    } else {
      var parent = sys.byId[spec.rail.parent];
      var ps = bodyState(parent, sys, t);
      var rel = K.state(spec.rail.el, parent.mu, t);
      var pos = V.add(ps.pos, rel.pos);
      var vel = V.add(ps.vel, rel.vel);
      var fwd = V.norm(rel.vel);
      if (V.len(fwd) < 1e-9) fwd = { x: 1, y: 0, z: 0 };
      st = finishTraffic(spec.rail.route || { id: spec.id, name: spec.name },
                         pos, vel, fwd, V.norm(rel.pos), 'loiter', 0,
                         parent, parent, true);
      // Loitering on a Kepler orbit is coasting: no thrust, just the idle
      // glow of a drive that is lit but not pushing.
      st.throttle = 0.12;
    }
    decorate(st, spec);
    return st;
  }

  function decorate(st, spec) {
    st.spec = spec;
    st.kind = spec.kind;
    st.faction = spec.faction;
    st.reg = spec.reg || (spec.reg = regCode(spec.id));
    st.name = spec.name;
    st.className = spec.className;
    st.color = spec.color;
    st.size = spec.size;
    st.hostile = spec.kind === 'pirate';
    st.mode = spec.mode || null;
    /* `cls` is the hull key the renderer looks a mesh up by. Trade ships
     * carry theirs from the route; patrols take it from their kind, so
     * every ship state has one and the renderer never has to work out which
     * sort of thing it is holding. */
    st.cls = spec.kind;
    return st;
  }

  /* Everything flying in the system at time t: freighters and patrols
   * together, because every consumer (renderer, radar, contact readout)
   * wants the same list and should not have to know which rail a given
   * ship happens to be on. */
  function shipsAll(sys, t) {
    if (sys._ships && sys._ships.t === t) return sys._ships.list;
    var list = trafficAll(sys, t).slice();
    var patrols = sys.patrols || [];
    for (var i = 0; i < patrols.length; i++) {
      if (patrols[i].dead) continue;
      var st = patrolState(patrols[i], sys, t);
      if (st) list.push(st);
    }
    sys._ships = { t: t, list: list };
    return list;
  }

  function nearestShip(sys, t, pos, maxRange) {
    var list = shipsAll(sys, t);
    var best = null, bestD = maxRange || Infinity;
    for (var i = 0; i < list.length; i++) {
      var d = V.dist(list[i].pos, pos);
      if (d < bestD) { bestD = d; best = list[i]; }
    }
    if (best) best.range = bestD;
    return best;
  }

  /* ---- encounters -------------------------------------------------------
   * The one place where determinism is deliberately given up, and only
   * where it buys something a rail cannot: a ship reacting to the player.
   *
   * An NPC on a rail is free and exact. Inside WAKE_RANGE it is lifted off
   * the rail into a small steered agent that feels the same gravity field
   * the player does; outside SLEEP_RANGE it is put back. The hysteresis gap
   * matters — a single threshold would flicker a ship between two different
   * positions every frame at exactly the range where you are most likely to
   * be looking at it. Waking and sleeping both happen thousands of km away,
   * where the discontinuity is sub-pixel.
   *
   * Steering is a saturated PD controller toward a standoff point beside
   * the player. Saturation is what makes it read as a ship rather than a
   * spring: far away it is a flat-out burn, and it only becomes a
   * proportional hold in the last few km.
   *
   * Time is the awkward part. Space is big enough that closing even 3000 km
   * at a few g takes minutes of real time, so NPCs integrate in SIMULATION
   * seconds — an intercept resolves in seconds of real time while you are
   * warping. Once anyone is genuinely close, warp is pinned back down (the
   * caller enforces `warpCap`), because that is the moment the player needs
   * their own reaction time back. */
  var WAKE_RANGE = 3000;        // km — lift off the rail
  var SLEEP_RANGE = 5200;       // km — put back on it
  var CLOSE_RANGE = 250;        // km — warp is pinned to 1x inside this
  var PIRATE_STANDOFF = 18;     // km
  var POLICE_STANDOFF = 45;     // km
  var POLICE_DETERRENT = 30000; // km — a pirate will not work this close to the law

  function wakeNpc(spec, railState) {
    spec.live = {
      pos: V.clone(railState.pos), vel: V.clone(railState.vel),
      fwd: V.clone(railState.fwd), up: V.clone(railState.up), right: V.clone(railState.right),
      phase: 'live', progress: 0, from: railState.from, to: railState.to,
      route: railState.route, manifest: []
    };
    spec.mode = spec.kind === 'pirate' ? 'intercept'
              : spec.kind === 'police' ? 'inspect' : 'shadow';
    spec.modeSince = 0;
    spec.hailed = false;
    decorate(spec.live, spec);
    return spec.live;
  }

  function steerNpc(spec, sys, t, dtSim, ship) {
    var live = spec.live;
    var toShip = V.sub(ship.pos, live.pos);
    var range = V.len(toShip);
    /* Attackers close to knife range; everyone else holds a polite
     * distance. 6 km against 12 km guns means a fight is a fight, not an
     * exchange of letters. */
    var standoff = spec.mode === 'attack' ? 6
                 : spec.kind === 'pirate' ? PIRATE_STANDOFF : POLICE_STANDOFF;

    var aim;
    if (spec.mode === 'breakoff') {
      // Run for it: aim well past the player's far side.
      aim = V.addScaled(live.pos, V.norm(V.sub(live.pos, ship.pos)), SLEEP_RANGE);
    } else {
      // Hold station beside the player, on whatever bearing we came in from.
      var bearing = range > 1e-6 ? V.scale(toShip, -1 / range) : { x: 1, y: 0, z: 0 };
      aim = V.addScaled(ship.pos, bearing, standoff);
    }

    var offset = V.sub(aim, live.pos);
    var vErr = V.sub(spec.mode === 'breakoff' ? V.zero() : ship.vel, live.vel);
    var w = 0.010;                              // rad/s, closes in ~100 s
    var cmd = {
      x: offset.x * w * w + vErr.x * 2 * w,
      y: offset.y * w * w + vErr.y * 2 * w,
      z: offset.z * w * w + vErr.z * 2 * w
    };
    var mag = V.len(cmd);
    if (mag > spec.accel) cmd = V.scale(cmd, spec.accel / mag);

    /* Integrate in sim seconds, substepped. Capped rather than unbounded:
     * beyond this the caller has already pinned warp down, so a slight lag
     * costs nothing and an unbounded loop would cost a frame. */
    var remaining = Math.max(0, dtSim);
    for (var i = 0; i < 80 && remaining > 1e-6; i++) {
      var h = Math.min(remaining, 5);
      var g = acceleration(live.pos, sys, t);
      live.vel = {
        x: live.vel.x + (g.x + cmd.x) * h,
        y: live.vel.y + (g.y + cmd.y) * h,
        z: live.vel.z + (g.z + cmd.z) * h
      };
      live.pos = V.addScaled(live.pos, live.vel, h);
      remaining -= h;
    }

    // Point where it is going; that is what a pilot would do and it makes
    // the hull silhouette readable.
    var fwd = V.len(live.vel) > 1e-9 ? V.norm(V.sub(live.vel, ship.vel)) : live.fwd;
    if (V.len(fwd) < 1e-6) fwd = live.fwd;
    live.fwd = fwd;
    live.right = V.norm(V.cross(live.fwd, V.norm(live.pos)));
    if (V.len(live.right) < 1e-9) live.right = anyPerpendicular(live.fwd);
    live.up = V.cross(live.right, live.fwd);
    live.mode = spec.mode;
    // A woken NPC is manoeuvring hard, and the plume should say so.
    live.throttle = Math.min(1, mag / spec.accel);
    return range;
  }

  /* Is the law close enough to spoil a robbery? Checked against rail
   * positions as well as woken ones, so flying inside a patrol lane
   * genuinely protects you without anything needing to be simulated. */
  function policeNearby(sys, t, pos) {
    var patrols = sys.patrols || [];
    for (var i = 0; i < patrols.length; i++) {
      /* A warship counts. It is not the law in the sense a cutter is, but
       * no pirate is going to hold somebody up in front of one. */
      if (patrols[i].kind !== 'police' && patrols[i].kind !== 'navy') continue;
      var st = patrolState(patrols[i], sys, t);
      if (V.dist(st.pos, pos) < POLICE_DETERRENT) return patrols[i];
      }
    return null;
  }

  function updateEncounters(sys, t, dtSim, ship) {
    var result = { active: [], demand: null, closest: Infinity, warpCap: Infinity };
    var patrols = sys.patrols || [];
    if (!patrols.length) return result;

    // Docked is safe. Nobody boards a ship sitting on a station's clamps.
    var safe = !!ship.docked || !!ship.landed;

    for (var i = 0; i < patrols.length; i++) {
      var spec = patrols[i];
      var state = patrolState(spec, sys, t);
      if (!state) continue;              // a lifted trader between sleep and reap
      var range = V.dist(state.pos, ship.pos);

      if (!spec.live && !safe && range < WAKE_RANGE) { wakeNpc(spec, state); }

      if (spec.live) {
        if (safe) { sleepNpc(spec); continue; }

        if (spec.kind === 'pirate' && spec.mode !== 'breakoff' && policeNearby(sys, t, ship.pos)) {
          spec.mode = 'breakoff';
          spec.brokeOffBecause = 'police';
        }

        range = steerNpc(spec, sys, t, dtSim, ship);
        spec.modeSince += dtSim;

        if (range > SLEEP_RANGE) { sleepNpc(spec); continue; }

        /* A pirate that has actually matched course and closed is in a
         * position to demand something. Requiring BOTH proximity and a low
         * relative speed is what stops a fly-past at 40 km/s counting as a
         * hold-up. */
        if (spec.kind === 'pirate' && spec.mode === 'intercept') {
          var relSpeed = V.dist(spec.live.vel, ship.vel);
          if (range < CLOSE_RANGE && relSpeed < 0.9) {
            spec.holdTime = (spec.holdTime || 0) + dtSim;
            if (spec.holdTime > 4) { spec.mode = 'demand'; spec.demanding = true; }
          } else {
            spec.holdTime = 0;
          }
        }

        /* A police scan needs no player input, unlike a pirate's demand —
         * it just HAPPENS once the patrol has held alongside long enough,
         * which is why this is a one-shot `scanNow` flag rather than a
         * mode the caller has to keep noticing. `spec.scanned` stops the
         * same patrol re-rolling every frame for the rest of the hold. */
        if (spec.kind === 'police' && spec.mode === 'inspect' && !spec.scanned) {
          var relSpeedP = V.dist(spec.live.vel, ship.vel);
          if (range < CLOSE_RANGE && relSpeedP < 0.9) {
            spec.scanHoldTime = (spec.scanHoldTime || 0) + dtSim;
            if (spec.scanHoldTime > 3) { spec.scanned = true; result.scanNow = spec; }
          } else {
            spec.scanHoldTime = 0;
          }
        }

        if (spec.demanding && spec.mode === 'demand') result.demand = spec;
        result.active.push(spec);
        result.closest = Math.min(result.closest, range);
      }
    }

    /* Warp policy. Anything awake keeps the clock sane; anything close
     * pins it, because that is exactly when the player needs to be able to
     * react in real time. */
    if (result.active.length) result.warpCap = 500;
    if (result.closest < CLOSE_RANGE * 4) result.warpCap = 1;
    sys._ships = null;   // the live states just moved; drop the per-frame memo
    return result;
  }

  function sleepNpc(spec) {
    spec.live = null;
    spec.mode = null;
    spec.demanding = false;
    spec.holdTime = 0;
    spec.scanned = false;
    spec.scanHoldTime = 0;
  }

  /* Put every NPC in a system back on its rail. Called when the player
   * leaves the system entirely: a live agent's position is only meaningful
   * relative to a player who is no longer there, and leaving one frozen
   * mid-intercept would mean returning years later to find it still hanging
   * exactly where you left it. Back on the rail, it is wherever the
   * timetable says — which is the whole point of the rail. */
  function sleepAll(sys) {
    var patrols = sys.patrols || [];
    for (var i = 0; i < patrols.length; i++) {
      sleepNpc(patrols[i]);
      patrols[i]._demand = null;
    }
    sys._ships = null;
  }

  /* What a pirate wants, quoted in the player's own cargo. It asks for the
   * most valuable thing aboard; an empty hold is shaken down for credits
   * instead, because "you have nothing I want, carry on" would make running
   * empty strictly safer than the alternative and that is a boring rule. */
  function pirateDemand(spec, ship, Economy) {
    if (spec._demand) return spec._demand;
    var bestId = null, bestValue = -Infinity;
    for (var cid in ship.cargo) {
      if (ship.cargo[cid] <= 0) continue;
      var com = Economy.BY_ID[cid];
      if (!com || com.waste) continue;      // nobody robs you of your rubbish
      if (com.base > bestValue) { bestValue = com.base; bestId = cid; }
    }
    if (bestId) {
      spec._demand = {
        type: 'cargo', cid: bestId, name: Economy.BY_ID[bestId].name,
        tonnes: Math.max(1, Math.ceil(ship.cargo[bestId] * 0.6))
      };
    } else {
      spec._demand = {
        type: 'credits',
        credits: Math.max(200, Math.round(ship.credits * 0.25))
      };
    }
    return spec._demand;
  }

  function payPirate(spec, ship, Economy) {
    var d = pirateDemand(spec, ship, Economy);
    var paid;
    if (d.type === 'cargo') {
      var take = Math.min(d.tonnes, ship.cargo[d.cid] || 0);
      ship.cargo[d.cid] -= take;
      if (ship.cargo[d.cid] <= 1e-9) delete ship.cargo[d.cid];
      paid = take + 't of ' + d.name;
    } else {
      var cash = Math.min(d.credits, ship.credits);
      ship.credits -= cash;
      paid = Math.round(cash) + ' credits';
    }
    refreshShip(ship);
    spec.mode = 'breakoff';
    spec.demanding = false;
    spec._demand = null;
    spec.brokeOffBecause = 'paid';
    return paid;
  }

  /* Every hull that flies carries a registration — deterministic from its
   * id, so the same ship reads the same code forever without a byte of
   * stored state. Two letters, a dash, four digits: enough to quote over
   * comms, short enough for a scanner readout. */
  function regCode(id) {
    var h = global.RNG ? global.RNG.hashString('reg|' + id) : 0;
    var letters = 'ABCDEFGHJKLMNPRSTUVWXYZ';           // no I/O/Q: they read as digits
    return letters[h % letters.length] +
           letters[Math.floor(h / 23) % letters.length] + '-' +
           ('000' + (h % 10000)).slice(-4);
  }

  function finishTraffic(route, pos, vel, fwd, upRef, phase, u, src, dst, outbound) {
    var right = V.cross(fwd, upRef);
    if (V.len(right) < 1e-9) right = anyPerpendicular(fwd);
    right = V.norm(right);
    var up = V.cross(right, fwd);
    return {
      route: route, id: route.id, name: route.name,
      reg: route.reg || (route.reg = regCode(route.id)),
      kind: route.kind || 'trade',
      cls: route.cls, className: route.className,
      size: route.size, color: route.color,
      pos: pos, vel: vel, fwd: fwd, up: up, right: right,
      phase: phase, progress: u, from: src, to: dst, outbound: outbound,
      manifest: outbound ? route.out : route.back
    };
  }

  /* Every traffic ship at time t, memoised per time value the same way body
   * positions are — the renderer, the radar and the HUD all ask for this
   * list within a single frame. */
  function trafficAll(sys, t) {
    if (!sys.traffic || !sys.traffic.length) return [];
    if (sys._traffic && sys._traffic.t === t) return sys._traffic.list;
    var list = [];
    for (var i = 0; i < sys.traffic.length; i++) {
      /* A dead route stays dead — combat killed the ship that flew it. A
       * suppressed one is temporarily off the timetable because its ship
       * has been lifted into the encounter system (being robbed, usually)
       * and is being drawn from there instead. */
      var r = sys.traffic[i];
      if (r.dead || r.suppressed) continue;
      list.push(trafficState(r, sys, t));
    }
    sys._traffic = { t: t, list: list };
    return list;
  }

  /* The nearest traffic ship to a point, for the cockpit's contact readout.
   * Range-limited so a scan does not report a freighter four AU away as
   * "nearest contact", which is technically true and practically useless. */
  function nearestTraffic(sys, t, pos, maxRange) {
    var list = trafficAll(sys, t);
    var best = null, bestD = maxRange || Infinity;
    for (var i = 0; i < list.length; i++) {
      var d = V.dist(list[i].pos, pos);
      if (d < bestD) { bestD = d; best = list[i]; }
    }
    if (best) best.range = bestD;
    return best;
  }

  /* Is the ship inside a landing pad's envelope, arriving gently enough to
   * use it?
   *
   * This is checked against the PADS, not against the ground. The first
   * version only looked once the ship had already crossed the planet's
   * radius — that is, once it was underground — so a perfect approach to a
   * hovering stop three hundred metres over the pad did nothing at all, and
   * the only way to land was to fly into the dirt and hope. A pad catches
   * you where a pad is, which is above the surface. */
  function padCapture(ship, sys, t) {
    var pads = sys.pads || [];
    for (var i = 0; i < pads.length; i++) {
      var pad = pads[i];
      var ps = bodyState(pad, sys, t);
      if (V.dist(ps.pos, ship.pos) > pad.dockCaptureRadius) continue;
      /* Inside the envelope but still on the hull. Flagged rather than
       * silently ignored: a pad that declines to catch you for a reason you
       * cannot see is indistinguishable from a broken pad, and the first
       * thing a player does is try the same approach again. main.js reads
       * this and says so. */
      if (!ship.gear) { ship.gearBalked = true; continue; }
      /* Speed relative to the PAD, which is itself being carried round by
       * the world underneath it. Hovering motionless above a spinning
       * planet is not hovering over the pad. */
      if (V.dist(ship.vel, ps.vel) > (pad.dockMaxSpeed || 0.03)) continue;
      return pad;
    }
    return null;
  }

  /* Is the ship inside a starport's shaft or hangar on this body?
   *
   * The volume is the union of two boxes in the port's own ground frame:
   * the duct from the mouth down to the floor, and the shed at the bottom.
   * Generous by a margin, because the cost of saying no when the answer is
   * yes is a crash into the ground you are supposed to be flying through,
   * and the cost of saying yes when the answer is no is a few metres of
   * rock you can briefly clip.
   *
   * Only surface ports on `host` are checked, and only ones the ship is
   * genuinely near — this runs inside the collision loop. */
  var SHAFT_SLACK = 0.10;        // pad radii

  function insideShaft(ship, sys, t, host) {
    var Gen = global.Gen;
    var pads = sys.pads;
    if (!pads || !pads.length || !Gen || !Gen.bayGeometry) return null;
    for (var i = 0; i < pads.length; i++) {
      var p = pads[i];
      if (!p.surface || p.parentBody !== host) continue;
      var r = p.radius || 1;
      var basis = groundBasis(p, sys, t);
      if (!basis) continue;
      var rel = V.sub(ship.pos, basis.entrance.pos);
      var z = V.dot(rel, basis.up) / r;
      var g = Gen.bayGeometry(p);
      if (z > g.lift + SHAFT_SLACK || z < g.floorZ - 0.2) continue;
      var e = Math.abs(V.dot(rel, basis.east)) / r;
      var n = Math.abs(V.dot(rel, basis.north)) / r;
      // In the duct...
      if (z > g.floorZ && e < g.mouthR + SHAFT_SLACK && n < g.mouthR + SHAFT_SLACK) return p;
      // ...or in the shed under it.
      if (e < g.chamberX + SHAFT_SLACK && n < g.chamberY + SHAFT_SLACK) return p;
    }
    return null;
  }

  /* Did we hit something? Returns the body if so.
   *
   * `allowDock` is passed only by advanceShip, i.e. by the authoritative
   * ship. Trajectory prediction and the collision scanner run throwaway
   * copies of the ship through here too, and a ghost latching onto a
   * landing pad would end the prediction with a phantom dock rather than
   * telling the player what they wanted to know. */
  function checkImpact(ship, sys, t, allowDock) {
    /* Pads first, and independently of the ground. Coming to rest over a
     * starport is a landing; it should not have to become a collision with
     * the planet before anyone notices. */
    if (allowDock) {
      var pad = padCapture(ship, sys, t);
      if (pad) {
        dockShip(ship, pad, sys, t);
        ship.landed = false;
        ship.crashed = false;
        ship.landedOn = null;
        return pad;
      }
    }

    for (var i = 0; i < sys.bodies.length; i++) {
      var b = sys.bodies[i];
      if (b.kind === 'station') continue; // docking, not impact — handled elsewhere
      var bp = bodyPosition(b, sys, t);
      if (V.dist(bp, ship.pos) < b.radius) {
        /* Below the surface is not always underground. A starport is a
         * shaft cut through this exact ground, and a ship in the shaft —
         * descending, berthed, or climbing back out — is inside the body's
         * radius on purpose. Without this the first metre of a launch is
         * a crash into the planet you are standing in a hangar inside. */
        if (insideShaft(ship, sys, t, b)) continue;
        var bv = bodyVelocity(b, sys, t);
        var relSpeed = V.dist(ship.vel, bv);

        ship.landed = true;
        ship.landedOn = b;
        /* Gear down, 100 m/s relative is a hard but survivable arrival.
         * Gear up, there is no such thing as a good one — you are landing
         * on the hull, and the number that matters is not your speed. */
        ship.crashed = !ship.gear || relSpeed > 0.1;
        ship.impactSpeed = relSpeed;
        // Sit on the surface rather than inside it.
        var n = V.norm(V.sub(ship.pos, bp));
        ship.pos = V.add(bp, V.scale(n, b.radius));
        ship.vel = V.clone(bv);
        return b;
      }
    }
    return null;
  }

  /* ---- docking ---------------------------------------------------------
   * A station has no attitude of its own in this model — it doesn't spin or
   * bank — so a docked ship's offset from it only needs to be expressed in
   * the station's ORBITAL frame (radial / prograde / normal), not a full
   * attitude. Recomputing that frame from the station's live position and
   * velocity every frame is enough to keep the ship sitting still relative
   * to the station as it swings around its own orbit, with no extra state
   * to track on the station's side. */
  function orbitalBasis(pos, vel) {
    var radial = V.norm(pos);
    var prograde = V.norm(vel);
    var normal = V.norm(V.cross(radial, prograde));
    if (V.len(normal) < 1e-12) normal = { x: 0, y: 0, z: 1 };
    // Re-orthogonalize prograde against radial so small numerical wobble in
    // a near-circular station orbit can't tilt the docked ship over time.
    prograde = V.norm(V.cross(normal, radial));
    return { radial: radial, prograde: prograde, normal: normal };
  }

  /* Is the ship inside the target's capture envelope right now? Read-only —
   * callers decide whether to actually latch on. */
  function dockingStatus(ship, target, sys, t) {
    var ts = bodyState(target, sys, t);
    var rel = V.sub(ship.pos, ts.pos);
    var vrel = V.sub(ship.vel, ts.vel);
    var range = V.len(rel);
    var closingSpeed = range > 1e-9 ? -V.dot(rel, vrel) / range : 0; // + = approaching
    return {
      target: target, range: range, relSpeed: V.len(vrel), closingSpeed: closingSpeed,
      inRange: range <= (target.dockCaptureRadius || target.radius * 4),
      slowEnough: V.len(vrel) <= (target.dockMaxSpeed || 0.006)
    };
  }

  /* Latch the ship to the target. Captures the current offset in the
   * station's orbital frame so the relative position is preserved as the
   * station moves. */
  function dockShip(ship, target, sys, t) {
    var ts = bodyState(target, sys, t);

    /* A pad is not an orbital clamp. There is no orbital frame to express
     * an offset in — the thing is bolted to a planet — so the ship simply
     * sits on it, a few metres up, and rides round with the world. */
    if (target.surface) {
      ship.docked = target.id;
      /* Berthed, not parked on the roof. `height` survives as the fallback
       * for anything that has no bay geometry to place a berth in. */
      ship.dockOffset = { surface: true, berth: assignBerth(ship, target),
                          height: Math.max(0.006, target.radius * 0.05) };
      ship.thrust = V.zero();
      ship.throttle = 0;
      ship.angRate = { pitch: 0, yaw: 0, roll: 0 };
      ship.thrusterFuel = ship.thrusterCap;
      ship.fuelOut = false;
      refreshShip(ship);
      updateDockedShip(ship, sys, t);
      /* Parked, not stood on its tail. A berthed ship sits level with its
       * nose out toward the middle of the shed, which is how a thing that
       * has to be pushed back out is left. The old nose-up attitude was
       * from when a surface port was an open pad you took off vertically
       * from; leaving is a script now (see the launch clearance), and it
       * can stand the ship up itself. */
      var bs2 = berthState(target, sys, t, ship.dockOffset.berth);
      if (bs2) {
        var f = V.scale(bs2.basis.north, bs2.off.facing || 1);
        ship.fwd = V.norm(f);
        ship.up = V.clone(bs2.basis.up);
        ship.right = V.cross(ship.fwd, ship.up);
      } else {
        var up = V.norm(V.sub(ship.pos, bodyPosition(target.parentBody, sys, t)));
        ship.fwd = V.clone(up);
        ship.right = anyPerpendicular(ship.fwd);
        ship.up = V.cross(ship.right, ship.fwd);
      }
      return;
    }

    var basis = orbitalBasis(ts.pos, ts.vel);
    var rel = V.sub(ship.pos, ts.pos);
    ship.docked = target.id;
    ship.dockOffset = {
      radial: V.dot(rel, basis.radial),
      prograde: V.dot(rel, basis.prograde),
      normal: V.dot(rel, basis.normal)
    };
    ship.thrust = V.zero();
    ship.angRate = { pitch: 0, yaw: 0, roll: 0 };
    /* Reaction mass is topped up on the clamps, free. It is a bulk
     * commodity a station has in tanks and no reason to meter; the fuel
     * worth charging for, and worth the player thinking about, is the
     * hydrogen that crosses light years. */
    ship.thrusterFuel = ship.thrusterCap;
    ship.fuelOut = false;
    refreshShip(ship);
    // Face the station on capture — cosmetic, but arriving nose-first and
    // ending up staring out into space would look wrong.
    /* Face the station on capture. The guard matters more than it looks:
     * if the ship is sitting exactly on the station's centre — which auto
     * -dock will not do but a script or a lucky approach can — then rel is
     * the zero vector, norm() of it is also zero, and the ship ends up with
     * a zero-length "forward". Nothing complains. Attitude integration
     * keeps it zero, the hull renders as a point, and anything that flies
     * along the nose (cruise, most obviously) silently stops moving the
     * ship at all. Fall back to the station's own prograde instead. */
    /* LEVEL FIRST, POINTING SECOND. The obvious construction — face the
     * station, then roll so up is as near the radial as it can be — is not
     * good enough, because it is only level when the nose happens to be
     * perpendicular to the radial. Approach a station from directly below it
     * and the nose IS the radial, at which point "as near as it can be" is
     * forty degrees off and the ship sits on the clamps cocked over.
     *
     * A berthed ship should be level whatever it flew in along, so up is the
     * radial outright and the nose gets whatever is left: the direction of
     * the station flattened into the horizontal plane. Being parked straight
     * matters more than aiming the nose exactly at the port. */
    /* THE UP REFERENCE IS NOT basis.radial. `orbitalBasis` takes absolute
     * position and normalises it, so its radial points away from the SYSTEM
     * ORIGIN — the star — not away from the planet the station is orbiting.
     * That is harmless for the dockOffset above, which only needs a
     * consistent frame that turns with the station, and it is quite wrong as
     * a local vertical: it left a berthed ship fifty-eight degrees off level
     * and reading three degrees of roll.
     *
     * orbitalBasisAt already answers this properly, against whatever body
     * actually dominates where the station is. */
    var facing = V.scale(rel, -1);
    var upRef = orbitalBasisAt(ts.pos, ts.vel, sys, t).radial;
    var flat = V.sub(facing, V.scale(upRef, V.dot(facing, upRef)));
    ship.fwd = V.len(flat) > 1e-9 ? V.norm(flat) : V.clone(basis.prograde);
    /* LEVEL, NOT ARBITRARY, and this line was a real bug for as long as
     * saves have existed.
     *
     * `anyPerpendicular` picks any vector at right angles to the nose. That
     * is fine for making a basis and terrible for making an ATTITUDE: the
     * roll it produces is whatever falls out of the arithmetic, so a ship on
     * the clamps sat at some random bank angle.
     *
     * Which nobody would mind, except that save.js re-docks on load —
     * restore() sets the saved fwd/up/right and then calls dockShip, which
     * lands here and throws the restored attitude away. Its own comment says
     * saves are made on a station's clamps "given when saves happen", and
     * main.js restores the autosave at boot. So the common path was: quit
     * docked, come back, and be lying on your side, with the attitude ladder
     * reading ninety degrees of bank before you had touched anything.
     *
     * circularOrbit already solved this for the spawn and its comment
     * describes the identical symptom. Same construction here: right from
     * fwd x radial puts UP along the local vertical, so a berthed ship is
     * level and its gear points at the planet. The fallback is only reachable
     * with the nose exactly along the radial, where "level" has no meaning. */
    ship.right = V.cross(ship.fwd, upRef);
    ship.right = V.len(ship.right) > 1e-9
      ? V.norm(ship.right) : anyPerpendicular(ship.fwd);
    ship.up = V.cross(ship.right, ship.fwd);
  }

  /* Recompute a docked ship's world position/velocity from wherever its
   * target is right now. Call this every frame instead of advanceShip while
   * ship.docked is set. */
  function updateDockedShip(ship, sys, t) {
    var target = sys.byId[ship.docked];
    var ts = bodyState(target, sys, t);

    if (target.surface) {
      /* In a berth in the hangar at the bottom of the shaft, riding round
       * with the world. The berth is derived from the SAME table the mesh
       * is built from (Gen.bayGeometry / Gen.berthOffset), so the ship
       * stands on the floor that is drawn rather than near it. */
      var bs = berthState(target, sys, t, ship.dockOffset && ship.dockOffset.berth);
      if (bs) {
        ship.pos = bs.pos;
        ship.vel = bs.vel;
        return target;
      }
      // Fallback: no bay geometry available, so sit on the pad itself.
      var host = bodyState(target.parentBody, sys, t);
      var up = V.norm(V.sub(ts.pos, host.pos));
      ship.pos = V.addScaled(ts.pos, up, ship.dockOffset.height);
      ship.vel = V.clone(ts.vel);
      return target;
    }

    var basis = orbitalBasis(ts.pos, ts.vel);
    var off = ship.dockOffset;
    var offset = V.add(V.add(V.scale(basis.radial, off.radial), V.scale(basis.prograde, off.prograde)),
                       V.scale(basis.normal, off.normal));
    ship.pos = V.add(ts.pos, offset);
    ship.vel = V.clone(ts.vel);
    return target;
  }

  /* Push away with a small separation velocity along the current offset
   * (i.e., straight out from the station) so undocking never immediately
   * re-triggers capture. */
  function undockShip(ship, sys, t, sepSpeed) {
    var target = sys.byId[ship.docked];
    var ts = bodyState(target, sys, t);
    var away;

    if (target.surface) {
      /* Leaving the ground is straight up, and the pad gives you nothing —
       * you climb on the drive alone. This is the moment the whole
       * MAX_SURFACE_G rule exists to protect: if the generator had put a
       * port on a world whose gravity beat the drive, this is where the
       * game would quietly stop. */
      /* THE LAUNCH SCRIPT. A berthed ship is parked in an alcove off the
       * side of the shed, nose pointed at the middle of the floor — it
       * cannot simply climb from where it stands, because what is directly
       * above it is the ceiling. So leaving runs the ship out of the berth
       * and back to the bottom of the shaft first, stands it on its tail,
       * and hands it over pointed at the open sky. That is the whole of
       * "a script to put the ship back at the bottom of the shaft".
       *
       * The doors are already open: main.js will not undock a surface port
       * without launch clearance, and clearance is what opens them. */
      var basis0 = groundBasis(target, sys, t);
      away = basis0 ? basis0.up
                    : V.norm(V.sub(ts.pos, bodyPosition(target.parentBody, sys, t)));
      var Gen0 = global.Gen;
      if (basis0 && Gen0 && Gen0.bayGeometry) {
        var g0 = Gen0.bayGeometry(target);
        var r0 = target.radius || 1;
        ship.pos = V.addScaled(basis0.entrance.pos, basis0.up,
                               (g0.floorZ + g0.lift + g0.standoff * 2) * r0);
        ship.vel = V.clone(basis0.entrance.vel);
      } else {
        ship.pos = V.addScaled(ship.pos, away, target.radius * 0.5);
      }
      ship.docked = null;
      ship.dockOffset = null;
      ship.vel = V.addScaled(ship.vel, away, sepSpeed || 0.002);
      ship.fwd = V.clone(away);
      ship.right = anyPerpendicular(ship.fwd);
      ship.up = V.cross(ship.right, ship.fwd);
      return target;
    }

    away = V.norm(V.sub(ship.pos, ts.pos));
    if (V.len(away) < 1e-9) away = V.scale(ship.fwd, -1);
    // ... and if the nose was degenerate too, pick any direction rather
    // than pushing off along a zero vector and going nowhere.
    if (V.len(away) < 1e-9) away = anyPerpendicular(orbitalBasis(ts.pos, ts.vel).radial);
    if (V.len(ship.fwd) < 1e-9) {
      ship.fwd = V.clone(away);
      ship.right = anyPerpendicular(ship.fwd);
      ship.up = V.cross(ship.right, ship.fwd);
    }
    ship.docked = null;
    ship.dockOffset = null;
    ship.vel = V.addScaled(ship.vel, away, sepSpeed || 0.002);
    return target;
  }

  /* Forward trajectory prediction: integrate a throwaway copy of the ship and
   * hand back a polyline. This is the single most important thing on screen —
   * it turns invisible gravity into a shape the player can steer. */
  /* IMPORTANT: the points come back RELATIVE TO A REFERENCE BODY, not in
   * absolute world coordinates. This is not a detail — it is the difference
   * between a usable navigation display and a useless one. A ship in a
   * 10-hour orbit of a planet is, in absolute terms, also being carried
   * 2 million km around the star during those 10 hours, so an absolute
   * trajectory shoots off the screen in a straight smear and tells you
   * nothing. Drawn in the planet's frame, the same data is the clean closed
   * ellipse you actually want to steer. */
  /* ---- prediction as a resumable job ------------------------------------
   * The integration below is the most expensive thing in the game, and it
   * used to happen in one lump inside a single frame: 12-25 ms against a
   * 2.2 ms median, four to twelve times a second, producing a stall you
   * could feel exactly while burning — which is the one time the display is
   * worth having.
   *
   * Nothing here is faster than it was. It is the same arithmetic, split
   * into a job the caller can advance a few milliseconds at a time and
   * collect when it finishes. The cost is unchanged and the frame is no
   * longer where it lands: the path is a few frames old instead of the
   * frame being a few frames long, and a prediction of the next six hours
   * does not care about a hundred milliseconds.
   *
   * predictTrajectory is kept as the synchronous form — begin, run to
   * completion, hand back the result — because the tests and the node
   * planner want an answer now and are not inside a frame. */
  function beginPrediction(ship, sys, t, opts) {
    opts = opts || {};
    var maxPoints = opts.maxPoints || 900;
    var horizon = opts.horizon;         // seconds of look-ahead
    var includeThrust = !!opts.includeThrust;
    var ref = opts.reference || dominantBody(ship.pos, sys, t);

    var ghost = makeShip(ship.pos, ship.vel);
    if (includeThrust) ghost.thrust = V.clone(ship.thrust);

    if (!horizon) {
      var oe0 = oscElements(ship, sys, t);
      horizon = (oe0 && oe0.closed && isFinite(oe0.period))
        ? Math.min(oe0.period * 1.05, 3.2e7)
        : 8.64e5;
    }

    return {
      ghost: ghost, ref: ref, maxPoints: maxPoints, horizon: horizon,
      t0: t, tt: t, h: Math.max(horizon / maxPoints, 0.5), i: 0,
      pts: [ V.sub(ghost.pos, bodyPosition(ref, sys, t)) ],
      impact: null, truncated: false, done: false, result: null
    };
  }

  /* Advance a job by at most `budgetMs` of wall clock (0 = run it out).
   * Returns true when the job is finished and job.result is ready. */
  function stepPrediction(job, sys, budgetMs) {
    if (job.done) return true;
    var clock = (budgetMs > 0 && typeof performance !== 'undefined') ? performance : null;
    var startedAt = clock ? clock.now() : 0;

    while (job.i < job.maxPoints) {
      // Refine the step near a body so predictions stay faithful where it
      // matters most — close approaches.
      var sub = Math.min(8, Math.max(1, Math.ceil(job.h / suggestedStep(job.ghost, sys, job.tt))));
      var hs = job.h / sub;
      for (var k = 0; k < sub; k++) { stepShip(job.ghost, sys, job.tt, hs); job.tt += hs; }
      job.pts.push(V.sub(job.ghost.pos, bodyPosition(job.ref, sys, job.tt)));
      job.i++;

      var hit = checkImpact(job.ghost, sys, job.tt);
      if (hit) {
        job.impact = {
          body: hit,
          rel: V.sub(job.ghost.pos, bodyPosition(job.ref, sys, job.tt)),
          t: job.tt, speed: job.ghost.impactSpeed
        };
        break;
      }
      /* Checked every 16 points, because performance.now() is not free and
       * the whole point of this is to stop paying for things per point. */
      if (clock && (job.i & 15) === 0 && clock.now() - startedAt > budgetMs) return false;
    }

    finishPrediction(job);
    return true;
  }

  function finishPrediction(job) {
    job.done = true;
    job.result = {
      points: job.pts, impact: job.impact, reference: job.ref,
      horizon: job.horizon, endTime: job.tt, truncated: job.truncated,
      startedAt: job.t0
    };
    return job.result;
  }

  function predictTrajectory(ship, sys, t, opts) {
    opts = opts || {};
    var maxPoints = opts.maxPoints || 900;
    var horizon = opts.horizon;         // seconds of look-ahead
    var includeThrust = !!opts.includeThrust;
    var ref = opts.reference || dominantBody(ship.pos, sys, t);

    /* An optional wall-clock ceiling, in milliseconds. This is a SAFETY NET,
     * not the main cost control — the caller is expected to size maxPoints so
     * the whole path fits its budget, because a path cut short mid-flight is
     * a worse display than a complete one drawn coarsely. This exists so that
     * a pathological case (a near-parabolic orbit whose period explodes, a
     * hundred-body system) can never blow a single frame outright.
     * Checked every 32 points, because performance.now() is not free. */
    var budgetMs = opts.budgetMs || 0;
    var job = beginPrediction(ship, sys, t, {
      maxPoints: maxPoints, horizon: horizon,
      includeThrust: includeThrust, reference: ref
    });

    /* The budget keeps its old meaning here: a safety net that truncates
     * rather than a scheduler. Callers that want the work spread out use
     * beginPrediction/stepPrediction directly. */
    if (!stepPrediction(job, sys, budgetMs)) {
      job.truncated = true;
      finishPrediction(job);
    }
    return job.result;
  }

  /* The closed-form alternative to integrating, and the reason the predicted
   * path is affordable at all.
   *
   * predictTrajectory's cost is driven by the HORIZON, not by the point
   * count: drawing a full closed loop means integrating one whole orbital
   * period, and a 60-day period is 60 days of n-body stepping — measured at
   * 20-90 ms on the target laptop, four times a second. No amount of
   * budgeting or resolution-tuning fixes that, because the work is
   * proportional to the time span being covered.
   *
   * But a stable orbit does not need integrating. It is an ellipse, and the
   * game already propagates bodies and jettisoned canisters on exactly this
   * closed form — this is the same rails-versus-integration split applied to
   * the one thing that had been left out of it. Pure trigonometry, no
   * stepping, and the whole loop for well under a millisecond.
   *
   * The honest caveat: this is the OSCULATING two-body ellipse, so it
   * ignores perturbation from everything except the dominant body. Where
   * that matters — under thrust, or on a path heading for a surface — the
   * caller integrates instead, which is what predictTrajectory is for. */
  function ellipsePath(ship, sys, t, segments, reference) {
    var dom = reference || dominantBody(ship.pos, sys, t);
    if (!dom || !(dom.mu > 0)) return null;
    var rel = V.sub(ship.pos, bodyPosition(dom, sys, t));
    var vrel = V.sub(ship.vel, bodyVelocity(dom, sys, t));
    var el = K.elementsFromState(rel, vrel, dom.mu);
    if (!el.closed || !isFinite(el.period)) return null;
    return {
      points: K.samplePath(el, segments || 240),
      impact: null,
      reference: dom,
      horizon: el.period,
      endTime: t + el.period,
      truncated: false,
      kepler: true          // callers can tell an ellipse from an integration
    };
  }

  /* The ship's current osculating orbit about its dominant body — the
   * ellipse it would follow from here if everything else vanished. */
  function oscElements(ship, sys, t) {
    var dom = dominantBody(ship.pos, sys, t);
    if (!dom) return null;
    var rel = V.sub(ship.pos, bodyPosition(dom, sys, t));
    var vrel = V.sub(ship.vel, bodyVelocity(dom, sys, t));
    var oe = K.elementsFromState(rel, vrel, dom.mu);
    oe.body = dom;
    oe.altitude = V.len(rel) - dom.radius;
    oe.apoAlt = oe.closed ? oe.apoapsis - dom.radius : Infinity;
    oe.periAlt = oe.periapsis - dom.radius;
    oe.relSpeed = V.len(vrel);
    return oe;
  }

  /* Put a ship into a clean circular orbit at a given altitude above a body —
   * used to place the player at the start, and handy for testing. */
  function circularOrbit(body, sys, t, altitude, inclination, phase) {
    var r = body.radius + altitude;
    var speed = Math.sqrt(body.mu / r);
    inclination = inclination || 0;
    phase = phase || 0;
    var pos = K.perifocalToWorld(r * Math.cos(phase), r * Math.sin(phase), inclination, 0, 0);
    var vel = K.perifocalToWorld(-speed * Math.sin(phase), speed * Math.cos(phase), inclination, 0, 0);
    var bs = bodyState(body, sys, t);
    var ship = makeShip(V.add(bs.pos, pos), V.add(bs.vel, vel));

    /* makeShip's own default faces absolute velocity, which is dominated by
     * whatever body WE orbit is itself orbiting (a planet's ~50 km/s around
     * its star dwarfs the few km/s the ship actually has relative to that
     * planet). "Face prograde" only means something sensible measured
     * relative to the body you are spawning above, so re-face the ship
     * along the RELATIVE velocity we just computed — the same frame the
     * prograde arrow and the flight-path marker already use. */
    ship.fwd = V.norm(vel);

    /* ... and roll level while we are at it. anyPerpendicular() picks an
     * arbitrary vector at right angles to the nose, which is fine for a
     * basis and terrible for a first impression: it spawned the player at
     * ninety degrees of bank, so the attitude ladder came up as a set of
     * vertical stripes and the game looked broken before you touched
     * anything. It was not — the maths was right and the ship really was
     * on its side.
     *
     * Building right from fwd x radialOut makes up come out exactly along
     * the local vertical (the two are perpendicular on a circular orbit),
     * so the ladder reads zero roll on spawn, which is what a ship parked
     * in orbit ought to look like. */
    var radialOut = V.norm(pos);
    ship.right = V.cross(ship.fwd, radialOut);
    ship.right = V.len(ship.right) > 1e-9 ? V.norm(ship.right) : anyPerpendicular(ship.fwd);
    ship.up = V.cross(ship.right, ship.fwd);
    return ship;
  }

  /* ---- manoeuvre nodes ---------------------------------------------------
   * A node is a planned burn: a delta-v vector, expressed in the orbital
   * frame, at a specific moment in the future. Everything else here is
   * derived from those four numbers.
   *
   * THE BURN IS PLANNED IMPULSIVELY AND FLOWN FINITELY, and the split is
   * deliberate. Planning impulsively is what makes the node cheap enough to
   * re-evaluate while the player drags it around — one coast to the node,
   * one vector addition, one call to elementsFromState, and the resulting
   * orbit is exact rather than sampled. Flying it finitely is what stops it
   * being a cheat: a burn takes real minutes, spends real reaction mass at
   * the rocket equation's rate, and the ship moves while it happens. The
   * cost of the difference is handed to the player rather than hidden —
   * `burn.duration` and the T-minus-half-duration ignition lead are on the
   * instrument, so a burn long enough for the impulsive plan to be a poor
   * approximation is visibly a burn long enough for that to be true.
   *
   * The dv components are in the SAME frame the manual thrust keys use
   * (main.js orbitalFrame): prograde along relative velocity, radial out
   * along the position vector, normal along r x v. That is not a
   * convenience — it means "3 m/s prograde" on the node and "hold W" are
   * the same axis, so a plan can be flown by hand without a mental
   * transform. */

  /* The orbital basis at an ARBITRARY state, not just the ship's current
   * one. A node's frame has to be evaluated where and WHEN the node is, not
   * where the ship is now: prograde at apoapsis points somewhere quite
   * different from prograde at periapsis, and a node whose axes were baked
   * from the current frame would silently change meaning as the ship coasted
   * toward it. */
  /* NAME COLLISION, fixed here: this used to be called orbitalBasis, which
   * is also the name of the two-argument helper the docking code has used
   * since docking existed (see above, ~line 1150). Two function
   * declarations with the same name in one scope means the later one wins
   * silently, so every dockShip/updateDockedShip call was landing in this
   * function with sys and t undefined — docking threw the moment anything
   * touched a clamp. Renamed rather than merged because the two genuinely
   * answer different questions: that one takes a state already relative to
   * its primary, this one works out which primary applies. */
  function orbitalBasisAt(pos, vel, sys, t) {
    var dom = dominantBody(pos, sys, t);
    var bs = bodyState(dom, sys, t);
    var rel = V.sub(pos, bs.pos);
    var vrel = V.sub(vel, bs.vel);
    var prograde = V.len(vrel) > 1e-12 ? V.norm(vrel) : { x: 1, y: 0, z: 0 };
    var radial = V.len(rel) > 1e-12 ? V.norm(rel) : { x: 0, y: 0, z: 1 };
    var normal = V.cross(rel, vrel);
    normal = V.len(normal) > 1e-12 ? V.norm(normal) : { x: 0, y: 0, z: 1 };
    return {
      body: dom, bodyState: bs, rel: rel, vrel: vrel,
      prograde: prograde, radial: radial, normal: normal
    };
  }

  function makeNode(tAt, dv) {
    dv = dv || {};
    return {
      t: tAt,
      dv: { pro: dv.pro || 0, nor: dv.nor || 0, rad: dv.rad || 0 }
    };
  }

  function nodeMagnitude(node) {
    var d = node.dv;
    return Math.sqrt(d.pro * d.pro + d.nor * d.nor + d.rad * d.rad);
  }

  /* Coast a throwaway copy forward to an absolute time, optionally recording
   * the path. Unpowered by construction — a node is planned against the
   * orbit you are ON, so a thruster the player happens to be holding down
   * must not leak into the plan. */
  function coastTo(ship, sys, tTarget, t, opts) {
    opts = opts || {};
    var maxSteps = opts.maxSteps || 4000;
    var ghost = makeShip(ship.pos, ship.vel);
    ghost.thrust = V.zero();
    var ref = opts.reference || null;
    var pts = opts.samples ? [] : null;
    var every = 1, steps = 0, tt = t;
    var remaining = tTarget - t;

    if (pts) pts.push(ref ? V.sub(ghost.pos, bodyPosition(ref, sys, tt)) : V.clone(ghost.pos));
    if (remaining <= 0) {
      return { pos: V.clone(ship.pos), vel: V.clone(ship.vel), t: t,
               steps: 0, truncated: false, points: pts };
    }
    /* Sample thinning: a node a full period out is ~900 integration steps,
     * and a polyline does not need 900 vertices to read as a curve. */
    if (pts && opts.samples) {
      var est = Math.max(1, Math.ceil(remaining / Math.max(suggestedStep(ghost, sys, tt), 1e-6)));
      every = Math.max(1, Math.ceil(est / opts.samples));
    }
    while (remaining > 1e-9 && steps < maxSteps) {
      var h = Math.min(suggestedStep(ghost, sys, tt), remaining);
      stepShip(ghost, sys, tt, h);
      tt += h; remaining -= h; steps++;
      if (pts && (steps % every === 0)) {
        pts.push(ref ? V.sub(ghost.pos, bodyPosition(ref, sys, tt)) : V.clone(ghost.pos));
      }
    }
    if (pts) pts.push(ref ? V.sub(ghost.pos, bodyPosition(ref, sys, tt)) : V.clone(ghost.pos));
    return {
      pos: ghost.pos, vel: ghost.vel, t: tt, steps: steps,
      truncated: remaining > 1e-6, points: pts
    };
  }

  /* What a delta-v of this size actually costs this ship, right now.
   * Tsiolkovsky for the propellant, mass flow for the clock. Both depend on
   * current mass, so a laden ship is quoted a longer burn for the same plan
   * — which is the mass model doing its job, not a penalty bolted on. */
  function nodeBurn(ship, dv) {
    var m0 = shipMass(ship);
    var ve = exhaustVelocity(ship);
    var mdot = ship.thrustKN / ((ship.thrusterIsp || ship.isp) * G0 * 1000);  // t/s
    if (!(dv > 0)) {
      return { dv: 0, fuel: 0, duration: 0, lead: 0, feasible: true, massAfter: m0 };
    }
    var mf = m0 * Math.exp(-dv / ve);
    var fuel = m0 - mf;
    var duration = mdot > 0 ? fuel / mdot : Infinity;
    return {
      dv: dv, fuel: fuel, duration: duration,
      /* Ignition lead. A finite burn centred on the node's instant is the
       * standard approximation to the impulse the plan assumed — half the
       * delta-v goes in early, half late, and the errors largely cancel.
       * Starting AT the node instead puts the entire burn late. */
      lead: duration / 2,
      feasible: fuel <= (ship.thrusterFuel || 0) + 1e-12,
      massAfter: mf
    };
  }

  /* Everything the instruments and the renderer need about a node, in one
   * object: where the ship will be, what the burn does to the orbit, what it
   * costs, and when to light the engine. */
  function nodePlan(ship, sys, t, node, opts) {
    opts = opts || {};
    if (!node) return null;
    var arrive = coastTo(ship, sys, node.t, t, {
      maxSteps: opts.maxSteps || 4000,
      samples: opts.samples || 0,
      reference: opts.reference || null
    });
    var basis = orbitalBasisAt(arrive.pos, arrive.vel, sys, arrive.t);

    var dvVec = V.zero();
    dvVec = V.addScaled(dvVec, basis.prograde, node.dv.pro);
    dvVec = V.addScaled(dvVec, basis.normal, node.dv.nor);
    dvVec = V.addScaled(dvVec, basis.radial, node.dv.rad);
    var magnitude = V.len(dvVec);
    var postVel = V.add(arrive.vel, dvVec);

    var mu = basis.body.mu;
    var before = K.elementsFromState(basis.rel, basis.vrel, mu);
    var after = K.elementsFromState(basis.rel, V.sub(postVel, basis.bodyState.vel), mu);
    before.periAlt = before.periapsis - basis.body.radius;
    before.apoAlt = before.closed ? before.apoapsis - basis.body.radius : Infinity;
    after.periAlt = after.periapsis - basis.body.radius;
    after.apoAlt = after.closed ? after.apoapsis - basis.body.radius : Infinity;

    var burn = nodeBurn(ship, magnitude);
    return {
      node: node,
      pos: arrive.pos, vel: arrive.vel, postVel: postVel,
      dvVec: dvVec, magnitude: magnitude,
      basis: basis, body: basis.body,
      /* The frame the path points are expressed in. The caller has to know
       * it to anchor them, exactly as it does for a live prediction. */
      reference: opts.reference || basis.body,
      before: before, after: after,
      burn: burn,
      eta: node.t - t,
      ignition: node.t - burn.lead,
      countdown: (node.t - burn.lead) - t,
      path: arrive.points,
      truncated: arrive.truncated
    };
  }

  /* The orbit the burn puts you on, as a polyline — the same forward
   * integration the live prediction uses, started from the post-burn state.
   * Integrated rather than drawn as a conic on purpose: the conic is only
   * the osculating approximation, and the whole reason this game integrates
   * the ship at all is that the approximation is where transfers go wrong. */
  function predictAfterNode(plan, sys, opts) {
    opts = opts || {};
    if (!plan) return null;
    var ghost = makeShip(plan.pos, plan.postVel);
    return predictTrajectory(ghost, sys, plan.node.t, {
      maxPoints: opts.maxPoints || 420,
      horizon: opts.horizon,
      reference: opts.reference || plan.body,
      includeThrust: false
    });
  }

  /* Time to the next periapsis and apoapsis on the current osculating orbit.
   * This is what makes a node placeable rather than merely draggable: almost
   * every burn worth planning happens at an apsis, and hunting for one by
   * nudging a time cursor is miserable. Returns null on an open orbit (a
   * hyperbola has a periapsis but may already be past it) or a circle (where
   * no apsis is defined and snapping would be meaningless). */
  function apsisTimes(ship, sys, t) {
    var dom = dominantBody(ship.pos, sys, t);
    if (!dom || !(dom.mu > 0)) return null;
    var bs = bodyState(dom, sys, t);
    var rel = V.sub(ship.pos, bs.pos);
    var vrel = V.sub(ship.vel, bs.vel);
    var oe = K.elementsFromState(rel, vrel, dom.mu);
    if (!oe.closed || !isFinite(oe.period)) return null;

    var r = V.len(rel);
    var mu = dom.mu;
    var v2 = V.dot(vrel, vrel);
    var eVec = V.sub(V.scale(rel, (v2 - mu / r) / mu),
                     V.scale(vrel, V.dot(rel, vrel) / mu));
    var e = V.len(eVec);
    if (e < 1e-6) return { body: dom, period: oe.period, circular: true, e: e,
                           toPeriapsis: 0, toApoapsis: oe.period / 2 };

    // True anomaly, then eccentric, then mean — the standard chain.
    var cosNu = V.dot(eVec, rel) / (e * r);
    var nu = Math.acos(Math.max(-1, Math.min(1, cosNu)));
    if (V.dot(rel, vrel) < 0) nu = K.TAU - nu;
    var E = 2 * Math.atan2(Math.sqrt(1 - e) * Math.sin(nu / 2),
                           Math.sqrt(1 + e) * Math.cos(nu / 2));
    var M = K.wrapAngle(E - e * Math.sin(E));
    var n = K.TAU / oe.period;
    return {
      body: dom, period: oe.period, circular: false, e: e,
      toPeriapsis: (K.TAU - M) / n,
      toApoapsis: K.wrapAngle(Math.PI - M) / n
    };
  }

  /* ---- jettisoned cargo -------------------------------------------------
   * A canister is a ship with no engine: it inherits your state vector at
   * the moment you push it out, and from then on it is on the same physics
   * as everything else. That is the whole model, and it gets three things
   * right for free — dumping cargo in a low orbit means watching it burn in
   * later, dumping it on an escape trajectory means never seeing it again,
   * and anything with a cargo scanner can read the manifest off it.
   *
   * They are integrated only while the player is near enough to see them
   * (WAKE_RANGE, same as an NPC), and they are forgotten after a day of
   * game time, because a system littered with every tonne anyone ever
   * dropped is a memory leak with a story attached. */
  var CANISTER_LIFE = 86400;     // seconds of game time before it is gone
  var CANISTER_TUMBLE = 0.35;    // rad/s, so the scanner return flickers
  var ZERO = { x: 0, y: 0, z: 0 };

  function dropCanister(sys, ship, cid, tonnes, t) {
    if (!sys.canisters) sys.canisters = [];
    /* Push it gently out of the lock, away from the nose: a canister that
     * shares your velocity exactly is a canister you will re-collide with
     * the moment you decelerate. */
    var away = V.len(ship.fwd) > 1e-9 ? V.norm(ship.fwd) : { x: 1, y: 0, z: 0 };
    var can = {
      kind: 'canister',
      id: 'can' + (sys.canisterSeq = (sys.canisterSeq || 0) + 1),
      name: 'Cargo canister',
      cid: cid,
      tonnes: tonnes,
      pos: V.addScaled(ship.pos, away, -0.05),      // 50 m behind
      vel: V.addScaled(ship.vel, away, -0.012),     // 12 m/s, a good shove
      born: t,
      expires: t + CANISTER_LIFE,
      spin: CANISTER_TUMBLE,
      radius: 0.004                                  // 4 m, for the scanner
    };
    sys.canisters.push(can);
    return can;
  }

  /* The same rails-versus-integration split everything else in this game
   * uses. Near the player a canister is integrated, because that is the
   * only time the difference between an ellipse and the real n-body path
   * is visible. Far away it is a Kepler orbit about whatever dominates
   * where it is, evaluated in closed form — which costs one Kepler solve
   * and, crucially, is still MOVING. The first version simply stopped
   * integrating out of range, which froze the canister in absolute space
   * while the planet it was orbiting flew off at 42 km/s. */
  function canisterRail(c, sys, t) {
    var dom = dominantBody(c.pos, sys, t);
    if (!dom || !(dom.mu > 0)) return null;
    var bs = bodyState(dom, sys, t);
    var el = K.elementsFromState(V.sub(c.pos, bs.pos), V.sub(c.vel, bs.vel), dom.mu);
    // An escaping canister has no ellipse to sit on; it is simply gone.
    if (!el.closed) return null;
    el.m0 = el.m - K.meanMotion(el.a, dom.mu) * t;
    return { parent: dom.id, el: el };
  }

  function canisterAt(c, sys, t) {
    var parent = sys.byId[c.rail.parent];
    var ps = bodyState(parent, sys, t);
    var rel = K.state(c.rail.el, parent.mu, t);
    return { pos: V.add(ps.pos, rel.pos), vel: V.add(ps.vel, rel.vel) };
  }

  function updateCanisters(sys, shipPos, t, dtSim) {
    var list = sys.canisters;
    if (!list || !list.length) return;
    var keep = [];
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      if (t >= c.expires) continue;

      var near = V.dist(c.pos, shipPos) < WAKE_RANGE;

      /* Wreckage takes the cheap path and takes it first. Out of range it is
       * simply dropped rather than parked on an ellipse — the player asked
       * for despawn-on-leaving-the-area, and the wake radius is already this
       * game's definition of "the area". */
      if (c.kind === 'debris') {
        if (!near) continue;
        if (dtSim > 0) stepDebris(c, sys, t, dtSim);
        keep.push(c);
        continue;
      }

      if (near) {
        // Waking: pick up wherever the rail says it got to.
        if (c.rail) {
          var st = canisterAt(c, sys, t);
          c.pos = st.pos; c.vel = st.vel;
          c.rail = null;
        }
        if (dtSim > 0) {
          /* Sub-stepped the same way the ship is, so a canister dropped in
           * a low orbit does not tunnel through the planet at high warp. */
          var left = dtSim, guard = 0, tt = t;
          c.thrust = ZERO;
          while (left > 1e-9 && guard++ < 64) {
            var h = Math.min(left, suggestedStep(c, sys, tt));
            stepShip(c, sys, tt, h);
            left -= h; tt += h;
          }
          /* It falls like anything else falls. Hitting the ground is the
           * end of it — there is no crater to inspect. */
          if (checkImpact(c, sys, t)) continue;
        }
      } else {
        // Sleeping: freeze the ellipse once, then read it off every frame.
        if (!c.rail) {
          c.rail = canisterRail(c, sys, t);
          if (!c.rail) continue;          // escaping: nobody will see it again
        }
        var s2 = canisterAt(c, sys, t);
        c.pos = s2.pos; c.vel = s2.vel;
      }
      keep.push(c);
    }
    sys.canisters = keep;
  }

  function canistersAll(sys) { return sys.canisters || []; }

  /* ---- wreckage ---------------------------------------------------------
   * What is left of a ship, and the thing the explosion has been standing in
   * for since combat existed. Also, eventually, what comes off a rock under
   * a mining laser — same shards, same physics, same scoop, two sources.
   *
   * IN sys.canisters, NOT BESIDE IT. A shard shares almost everything with a
   * jettisoned crate: it drifts, it expires, it is a scanner return, it can
   * be flown into, and some of it is worth taking aboard. Giving it its own
   * list would mean a second collision test, a second scoop, a second
   * expiry sweep and a second thing to remember on every code path that
   * touches loose objects — four chances to forget one. So it goes in the
   * same array with `kind: 'debris'`, and the handful of places that care
   * branch once.
   *
   * WHAT IT DOES NOT SHARE IS THE PHYSICS, and that is deliberate. A canister
   * lives a DAY of game time and is put on a Kepler rail when it sleeps,
   * because it has to still be there — and still be moving correctly — when
   * you come back for it tomorrow. A shard lives ninety seconds. Solving an
   * ellipse for something that will not exist by the time it completes one
   * degree of it is work done for nobody, and the frame budget on the target
   * machine is not there to spend: the trajectory predictor already costs
   * ~25 ms and the renderer ~3 ms. So debris gets:
   *
   *   - no Kepler rail. Out of range is GONE, not asleep.
   *   - no stepShip, no substepping, no impact test against terrain. One
   *     gravity evaluation and a velocity-Verlet-ish half step.
   *   - ONE dominant body, resolved at spawn and never again. A shard covers
   *     a few kilometres in its whole life, so the body that dominates where
   *     it died still dominates where it dies. This is the single biggest
   *     saving here and it costs nothing in fidelity.
   *
   * MEASURED, because the rule is that anything on the per-frame path gets
   * costed against the budget explicitly rather than asserted to be cheap.
   * A FULL field — 96 shards, the cap — through updateCanisters:
   *
   *     updateCanisters, full field   0.0143 ms/frame
   *     spawnDebris, one whole wreck  0.0168 ms   (once per kill, not per frame)
   *     one Sim.acceleration call     0.0097 ms   <- the unit to compare against
   *
   * So the worst case the cap allows is about one and a half gravity
   * evaluations a frame, against a predictor that costs ~25 ms and a
   * renderer that costs ~3. It is the dominant-body shortcut that buys this:
   * resolving one per shard per frame would have made it 96 of them.
   */
  var DEBRIS_LIFE = 90;          // seconds of game time
  var DEBRIS_MAX = 96;           // shards alive at once, system-wide
  var DEBRIS_SALVAGE_FRAC = 0.3; // share of a wreck's hold that survives it

  /* Everything about a wreck is a pure function of the ship that made it, so
   * a replayed kill throws the same pieces the same way. Math.random() here
   * would have been invisible — nobody re-watches an explosion frame by
   * frame — which is exactly the kind of place the doctrine exists to cover.
   *
   * One hash, read in slices, the same way manifestFor does it: one call and
   * one place to look when a shard comes out wrong. */
  function shardHash(id, i) {
    /* Salt FIRST and avalanche after. `wakeHash` learned this the hard way:
     * appending the index to a shared prefix and reading the high bits does
     * not diffuse in FNV-1a, so every arc of a wake came out identical and
     * drew stacked on top of itself. */
    var h = RNG.hashString('shard|' + i + '|' + id);
    h ^= h >>> 13; h = (h * 0x5bd1e995) >>> 0; h ^= h >>> 15;
    return h >>> 0;
  }

  /* Blow a ship apart. `at`/`vel` are where and how fast it was going; the
   * shards inherit that and get a radial kick, because an explosion is a
   * thing that happens to a ship rather than a thing that stops it. */
  function spawnDebris(sys, id, at, vel, size, t, salvage) {
    if (!sys || !at) return [];
    if (!sys.canisters) sys.canisters = [];

    /* Count follows the hull. A shuttle coming apart should not litter the
     * sky the way a bulk freighter does. */
    var scale = Math.max(0.02, size || 0.06);
    var n = Math.max(6, Math.min(16, Math.round(8 + scale * 90)));

    /* Resolved once, for all of them — see the note above. */
    var dom = dominantBody(at, sys, t);
    var domId = dom ? dom.id : null;

    var made = [];
    for (var i = 0; i < n; i++) {
      var h = shardHash(id, i);

      /* A direction off the hash, not off Math.random. Spherical, and taken
       * from two independent slices so the shards do not band. */
      var u = ((h & 1023) / 1023) * 2 - 1;              // cos(polar)
      var az = (((h >>> 10) & 1023) / 1023) * K.TAU;
      var r = Math.sqrt(Math.max(0, 1 - u * u));
      var dir = { x: r * Math.cos(az), y: r * Math.sin(az), z: u };

      /* Kick, in km/s. Scaled to hull size — a big ship holds more energy —
       * and spread over a wide range so the field stretches instead of
       * expanding as a shell, which is what actually reads as an explosion. */
      var kick = (0.004 + ((h >>> 20) & 255) / 255 * 0.026) * (0.6 + scale * 6);

      var c = {
        kind: 'debris',
        id: 'dbr' + (sys.canisterSeq = (sys.canisterSeq || 0) + 1),
        name: 'Wreckage',
        shard: (h >>> 28) & 7,                          // which mesh
        /* Metres, roughly: a plate off a hull, not a whole deck. */
        lengthKm: 0.006 + ((h >>> 5) & 31) / 31 * 0.020,
        tint: null,
        pos: V.addScaled(at, dir, 0.004),
        vel: V.addScaled(vel || ZERO, dir, kick),
        /* Tumble: an axis and a rate. Anything torn off something that just
         * exploded is spinning, and a shard that does not is a floating
         * brick. */
        spinAxis: { x: ((h >>> 3) & 255) / 255 - 0.5,
                    y: ((h >>> 11) & 255) / 255 - 0.5,
                    z: ((h >>> 19) & 255) / 255 - 0.5 },
        spinRate: 0.4 + ((h >>> 26) & 15) / 15 * 2.6,   // rad/s
        phase: (h & 63) / 63 * K.TAU,
        born: t,
        expires: t + DEBRIS_LIFE,
        domId: domId,
        radius: 0.003
      };
      var sl = V.len(c.spinAxis);
      c.spinAxis = sl > 1e-6 ? V.scale(c.spinAxis, 1 / sl) : { x: 0, y: 0, z: 1 };
      sys.canisters.push(c);
      made.push(c);
    }

    /* SOME OF IT IS WORTH TAKING. Salvage rides on the shards rather than on
     * a parallel object, so the scoop, the hold accounting and the scanner
     * all work on it with no new code — a shard with a `cid` is a canister
     * that happens to be shaped like a piece of a ship. */
    if (salvage && salvage.length) {
      var slots = Math.min(made.length, Math.max(2, Math.min(4, salvage.length + 1)));
      var put = 0;
      for (var s = 0; s < salvage.length && put < slots; s++) {
        var amount = (salvage[s].qty || salvage[s].tonnes || 0) * DEBRIS_SALVAGE_FRAC;
        if (!(amount > 0)) continue;
        /* Spread over up to two shards so salvage is a small FIELD to fly
         * through rather than one lucky pixel. */
        var pieces = amount > 6 ? 2 : 1;
        for (var p = 0; p < pieces && put < slots; p++, put++) {
          var sh = made[put];
          sh.cid = salvage[s].cid;
          sh.tonnes = Math.max(0.1, Math.round((amount / pieces) * 10) / 10);
          sh.name = 'Salvage';
          sh.lengthKm = Math.max(sh.lengthKm, 0.014);   // worth spotting
        }
      }
    }

    /* Globally capped, oldest first. An uncapped field is a memory leak that
     * grows with the body count, and the oldest shards are the ones the
     * player has already stopped looking at. Only debris is culled — a
     * jettisoned canister is somebody's cargo and is not litter. */
    var live = 0, k;
    for (k = 0; k < sys.canisters.length; k++) {
      if (sys.canisters[k].kind === 'debris') live++;
    }
    while (live > DEBRIS_MAX) {
      for (k = 0; k < sys.canisters.length; k++) {
        if (sys.canisters[k].kind === 'debris') { sys.canisters.splice(k, 1); break; }
      }
      live--;
    }
    return made;
  }

  /* One shard, one frame. Deliberately not stepShip: see the note above. */
  function stepDebris(c, sys, t, dt) {
    var parent = c.domId && sys.byId ? sys.byId[c.domId] : null;
    if (parent && parent.mu > 0) {
      var bp = bodyPosition(parent, sys, t);
      var dx = bp.x - c.pos.x, dy = bp.y - c.pos.y, dz = bp.z - c.pos.z;
      var d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > 1e-9) {
        var d = Math.sqrt(d2), a = parent.mu / d2 / d;   // mu/d^2, then normalise
        c.vel.x += dx * a * dt;
        c.vel.y += dy * a * dt;
        c.vel.z += dz * a * dt;
      }
    }
    c.pos.x += c.vel.x * dt;
    c.pos.y += c.vel.y * dt;
    c.pos.z += c.vel.z * dt;
  }

  function debrisAll(sys) {
    var list = sys.canisters, out = [];
    if (!list) return out;
    for (var i = 0; i < list.length; i++) {
      if (list[i].kind === 'debris') out.push(list[i]);
    }
    return out;
  }

  var Sim = {
    orbitMu: orbitMu,
    bodyState: bodyState,
    bodyPosition: bodyPosition,
    bodyVelocity: bodyVelocity,
    acceleration: acceleration,
    dominantBody: dominantBody,
    localVertical: localVertical,
    relativeToShipFrame: relativeToShipFrame,
    attitudeAngles: attitudeAngles,
    makeShip: makeShip,
    integrateAttitude: integrateAttitude,
    stepShip: stepShip,
    suggestedStep: suggestedStep,
    advanceShip: advanceShip,
    checkImpact: checkImpact,
    scanForImpact: scanForImpact,
    dockingStatus: dockingStatus,
    dockShip: dockShip,
    updateDockedShip: updateDockedShip,
    undockShip: undockShip,
    GEAR_DRAG_FACTOR: GEAR_DRAG_FACTOR,
    airDensity: airDensity,
    atmosphereContext: atmosphereContext,
    heatFlux: heatFlux,
    updateHeating: updateHeating,
    HEAT_LIMIT: HEAT_LIMIT,
    predictTrajectory: predictTrajectory,
    beginPrediction: beginPrediction,
    stepPrediction: stepPrediction,
    ellipsePath: ellipsePath,
    oscElements: oscElements,
    orbitalBasis: orbitalBasis,
    orbitalBasisAt: orbitalBasisAt,
    makeNode: makeNode,
    nodeMagnitude: nodeMagnitude,
    coastTo: coastTo,
    nodeBurn: nodeBurn,
    nodePlan: nodePlan,
    predictAfterNode: predictAfterNode,
    apsisTimes: apsisTimes,
    circularOrbit: circularOrbit,
    cargoMass: cargoMass,
    shipMass: shipMass,
    exhaustVelocity: exhaustVelocity,
    deltaV: deltaV,
    thrusterEndurance: thrusterEndurance,
    refreshShip: refreshShip,
    fuelBurn: fuelBurn,
    surfaceOffset: surfaceOffset,
    portEntrance: portEntrance,
    groundBasis: groundBasis,
    insideShaft: insideShaft,
    berthState: berthState,
    assignBerth: assignBerth,
    padCapture: padCapture,
    smootherstep: smootherstep,
    trafficState: trafficState,
    trafficAll: trafficAll,
    nearestTraffic: nearestTraffic,
    bodyStateAt: bodyStateAt,
    patrolState: patrolState,
    shipsAll: shipsAll,
    nearestShip: nearestShip,
    updateEncounters: updateEncounters,
    policeNearby: policeNearby,
    pirateDemand: pirateDemand,
    payPirate: payPirate,
    sleepAll: sleepAll,
    regCode: regCode,
    dropCanister: dropCanister,
    updateCanisters: updateCanisters,
    canistersAll: canistersAll,
    spawnDebris: spawnDebris, debrisAll: debrisAll, stepDebris: stepDebris,
    DEBRIS_LIFE: DEBRIS_LIFE, DEBRIS_MAX: DEBRIS_MAX,
    CANISTER_LIFE: CANISTER_LIFE,
    WAKE_RANGE: WAKE_RANGE,
    SLEEP_RANGE: SLEEP_RANGE,
    CLOSE_RANGE: CLOSE_RANGE
  };

  global.Sim = Sim;
  if (typeof module !== 'undefined' && module.exports) module.exports = Sim;
})(typeof window !== 'undefined' ? window : globalThis);
