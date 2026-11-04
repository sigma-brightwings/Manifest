/* intercept.js — the lead pip, and the flight law that flies to it.
 *
 * Astra, 2026-11-03: "can we simplify the orbital mechanics controls for
 * the player? Maybe like when you have selected a target, a navigation pip
 * shows up on the HUD, if it's in orbit of a star, that pip should track
 * ahead of the target so that your ship will end up reaching the target
 * when the target will also be intersecting that point in space?"
 *
 * Two follow-up answers shaped it:
 *   - THE TIME IS DRIVE-AWARE. With the cruise drive available for the
 *     trip, the travel time is the cruise drive's; close in, or with cruise
 *     blocked, it is the thrusters' at your current speed and thrust. The
 *     pip follows whichever you would actually use.
 *   - "I want the autopilot to do most of the flying with the option to
 *     take the controls myself." So the same law that predicts the trip is
 *     the law the intercept assist flies (main.js advanceIntercept), and a
 *     prediction that is not the flight is a prediction nobody can check.
 *
 * WHAT IS SOLVED. The intercept time T such that the time to fly from here
 * to where the target will be at t+T, arriving MATCHED to it, equals T. The
 * pip is the target's position at t+T. A fixed point first, because it
 * converges in two or three steps for every case measured; a bracketed
 * bisection behind it, because a fixed point that oscillates must not
 * leave the HUD showing whatever the last guess was.
 *
 * WHY THE THRUSTER LEG IS FLOWN IN THE TARGET'S FRAME. A ship that matches
 * a target's velocity and then closes straight along the line between them
 * arrives where the target will be, when it will be there — in absolute
 * space its path bends toward the pip on its own. Flying it that way means
 * the travel time does not depend on the guess for T at all (the solve
 * converges at once), and the one thing that would spoil it — the target
 * accelerating round its orbit while the ship does not — is paid for
 * explicitly: the assist feeds the target's own acceleration forward and
 * cancels the ship's local gravity, so in the target's frame the ship is in
 * free space. The cruise leg is where T genuinely feeds back: the drive's
 * speed limit is set by the worlds along the straight path, and the path
 * runs to the pip.
 *
 * Pure: no G, no Sim. main.js hands in the ship, the target's rails as a
 * function of time, and the worlds the cruise lock answers to. That is
 * what lets test/intercept.test.js pin the solve without booting the game.
 */
(function (global) {
  'use strict';

  /* ---- the law's constants, and where each came from --------------------
   * Every one is the existing autopilot's (main.js advanceAutodock and
   * steerAutoCruise), so the intercept assist is the same pilot with a
   * different aim point rather than a second opinion about how to fly. */
  var GAIN = 0.5;          // per s — the close-phase proportional gain
  var BRAKE = 0.55;        // fraction of thrust the approach plans to brake on
  var V_CAP = 45;          // km/s — the close phase's speed ceiling
  var CRUISE_GAIN = 0.2;   // per s — cruise closes a fifth of the gap a second
  var CRUISE_MIN = 60;     // km/s — the drive's floor (main.js CRUISE_MIN)
  var CRUISE_LOCK_K = 0.55;// km/s of speed allowed per km of clearance
  /* The cruise leg hands over to the thrusters a little before the drive
   * would mass-lock itself out (at CRUISE_MIN * 1.02), so the hand-over is
   * the assist's — at the target's velocity — rather than the drive's own
   * circular orbit about whatever happened to be nearest, which comes out
   * kilometres a second off a station's. */
  var CRUISE_HANDOVER = CRUISE_MIN * 1.15;
  /* Matched means within this, relative. "Matched to within a few m/s" was
   * the ask; 3 m/s is also twice the 1.5 m/s match-orbit calls done, so a
   * ship arriving like this and then asked to match orbit is a second's
   * trim, not a second manoeuvre. */
  var ARRIVE_DV = 0.003;   // km/s

  function len(x, y, z) { return Math.sqrt(x * x + y * y + z * z); }

  /* ---- the thruster law ---------------------------------------------------
   * r: from the ship to the aim point (km). w: the ship's velocity less the
   * velocity it should arrive with (km/s). Returns the steering
   * acceleration in the target's frame, km/s^2, already within `accel`.
   *
   * Go as fast as the braking distance allows along the line, null
   * everything across it — advanceAutodock's close phase exactly. The one
   * change is the gain under time warp: the law gets one vote a frame, and
   * at 500x a frame is eight simulated seconds, so a gain of 0.5/s would
   * ask for four times the correction and ring. Capping gain·dt below one
   * keeps it a damped approach at any clock, and at 1x changes nothing. */
  function thrustLaw(r, w, accel, dtSim, cap) {
    var d = len(r.x, r.y, r.z);
    var vWant = Math.min(cap || V_CAP, Math.sqrt(2 * BRAKE * accel * Math.max(0, d)));
    var ux = d > 1e-12 ? r.x / d : 0, uy = d > 1e-12 ? r.y / d : 0, uz = d > 1e-12 ? r.z / d : 0;
    var g = Math.min(GAIN, 0.9 / Math.max(1e-3, dtSim || 0.016));
    var cx = (ux * vWant - w.x) * g, cy = (uy * vWant - w.y) * g, cz = (uz * vWant - w.z) * g;
    var m = len(cx, cy, cz);
    if (m > accel && m > 0) { var k = accel / m; cx *= k; cy *= k; cz *= k; }
    return { x: cx, y: cy, z: cz };
  }

  /* Pay `hold` in full, then steer with the largest share of `steer` that
   * still fits in `A`. main.js holdUpThenSteer, generalised from "gravity"
   * to "whatever must be paid first" — for the assist that is the target's
   * acceleration less the ship's gravity, so the target's frame is free
   * space for the law above. */
  function payThenSteer(hold, steer, A) {
    var hh = hold.x * hold.x + hold.y * hold.y + hold.z * hold.z;
    if (hh >= A * A) { var s = A / Math.sqrt(hh); return { x: hold.x * s, y: hold.y * s, z: hold.z * s }; }
    var ee = steer.x * steer.x + steer.y * steer.y + steer.z * steer.z;
    if (ee < 1e-30) return { x: hold.x, y: hold.y, z: hold.z };
    var eh = steer.x * hold.x + steer.y * hold.y + steer.z * hold.z;
    var k = (-eh + Math.sqrt(eh * eh + ee * (A * A - hh))) / ee;
    k = Math.max(0, Math.min(1, k));
    return { x: hold.x + steer.x * k, y: hold.y + steer.y * k, z: hold.z + steer.z * k };
  }

  /* ---- how long the thrusters take ---------------------------------------
   * The law above, flown forward in the target's frame until it has
   * arrived: inside `tol` of the aim point and within ARRIVE_DV of its
   * velocity. That is the same test the assist uses to say "alongside", so
   * the number on the HUD and the moment it reaches zero are one rule.
   *
   * The step is a fortieth of the time still to go, kept between 0.05 s
   * and 1 s: long enough that a 5,000 s crossing is a few hundred steps,
   * short enough against the 2 s time constant (1/GAIN) that Euler does not
   * invent an overshoot the real ship would not fly. Measured: under 0.1 ms
   * for a typical trip. */
  var MODEL_STEPS = 20000;
  function thrusterTime(r0, w0, accel, tol, cap, give) {
    if (!(accel > 0)) return { T: Infinity, why: 'no thrust' };
    var rx = r0.x, ry = r0.y, rz = r0.z, wx = w0.x, wy = w0.y, wz = w0.z, t = 0;
    var r = { x: 0, y: 0, z: 0 }, w = { x: 0, y: 0, z: 0 };
    for (var i = 0; i < MODEL_STEPS; i++) {
      var d = len(rx, ry, rz), s = len(wx, wy, wz);
      if (d < tol && s < ARRIVE_DV) return { T: t, steps: i };
      /* Racing another drive: past `give` this one has lost, and how badly
       * does not need working out. */
      if (give && t > give) return { T: t, steps: i, over: true };
      var vWant = Math.min(cap || V_CAP, Math.sqrt(2 * BRAKE * accel * d));
      var dt = Math.max(0.05, Math.min(600, 0.025 * d / (s + vWant + 1e-6)));
      r.x = rx; r.y = ry; r.z = rz; w.x = wx; w.y = wy; w.z = wz;
      var a = thrustLaw(r, w, accel, dt, cap);
      wx += a.x * dt; wy += a.y * dt; wz += a.z * dt;
      rx -= wx * dt; ry -= wy * dt; rz -= wz * dt;
      t += dt;
    }
    return { T: t, steps: MODEL_STEPS, capped: true };
  }

  /* ---- how long the cruise drive takes -----------------------------------
   * The drive is kinematic: it goes where the nose points at the speed it
   * is set to, and the assist sets that speed the way steerAutoCruise does
   * for auto-dock — the aim point's own velocity plus a closing term of a
   * fifth of the gap a second, inside the lock's ceiling, never under the
   * drive's floor. In the target's frame that is a closing speed k(r):
   *
   *   want = aimVel + u·k,  |want| <= lock ceiling,  |want| >= CRUISE_MIN
   *
   * and the time is the integral of dr / k from here to where the drive
   * drops out. The lock ceiling is read at points along the absolute path,
   * which runs from the ship to the pip — the only place in this file where
   * T feeds back on itself. The worlds are interpolated between where they
   * are now and where they will be at t+T; a station's planet moves a
   * couple of thousand kilometres during a cruise arrival, and the lock near
   * the end is that planet's.
   *
   * Then the last stretch: out of the bubble at the target's own velocity,
   * `dropR` short of the aim point (or wherever the lock squeezed the
   * drive below CRUISE_HANDOVER), and the thrusters close the rest. */
  /* Nodes at both ends. The time goes where the drive is slow, and it is
   * slow in two places: leaving (the world you are climbing off holds the
   * ceiling down for the first few thousand kilometres) and arriving (the
   * exponential wind-down onto the target). The first version spaced the
   * nodes in the remaining gap only, so its first node spanned a quarter of
   * a 95-million-km crossing and the departure did not exist — the cruise
   * came out 20-30% slower than predicted (kawartha, measured). Departure
   * nodes are log-spaced in distance travelled, arrival nodes in distance
   * left, half each. */
  var CRUISE_NODES = 64;
  var DEPART_FROM = 10;     // km travelled at the first departure node
  function cruiseNodes(r0, dropR) {
    var half = 0.5 * (r0 + dropR), out = [], n = CRUISE_NODES >> 1, i;
    var sMax = r0 - half;
    if (sMax > DEPART_FROM * 2) {
      out.push(r0 - Math.min(DEPART_FROM, sMax * 0.5));
      for (i = 1; i <= n; i++) out.push(r0 - DEPART_FROM * Math.pow(sMax / DEPART_FROM, i / n));
    }
    for (i = 1; i <= n; i++) out.push(half * Math.pow(dropR / half, i / n));
    return out;
  }
  function lockCeiling(px, py, pz, bodies0, bodies1, f, top) {
    var best = Infinity;
    for (var i = 0; i < bodies0.length; i++) {
      var a = bodies0[i], b = bodies1[i] || a;
      var bx = a.pos.x + (b.pos.x - a.pos.x) * f;
      var by = a.pos.y + (b.pos.y - a.pos.y) * f;
      var bz = a.pos.z + (b.pos.z - a.pos.z) * f;
      var clear = len(px - bx, py - by, pz - bz) - a.keep;
      if (clear < best) best = clear;
    }
    return Math.max(CRUISE_MIN, Math.min(top, CRUISE_LOCK_K * Math.max(0, best)));
  }
  /* The closing speed for one gap, under one ceiling. */
  function cruiseClosing(r, au, a2, L) {
    var k = CRUISE_GAIN * r;
    var kmax = -au + Math.sqrt(Math.max(0, au * au - a2 + L * L));
    var kmin = -au + Math.sqrt(Math.max(0, au * au - a2 + CRUISE_MIN * CRUISE_MIN));
    if (k > kmax) k = kmax;
    if (k < kmin) k = kmin;
    return k;
  }
  /* ROUND A WORLD UNDER CRUISE, WIDE — the one rule, used by the model here
   * and by the assist in flight (main.js cruiseDetour). A thruster is walked
   * round a world hugging its keep-out (routeAround), because on thrust
   * distance is fuel. Under cruise it is the other way round: the ceiling is
   * proportional to clearance, so a path that hugs a world is flown at the
   * drive's floor. Measured on seed ip-3, a parking orbit with the port on
   * the far side of the star crawled 1,300 s along a world at 60-75 km/s.
   * So: if the straight line passes inside 1.2 keep-outs of a world (the
   * destination's own world shrunk to just under the destination, as
   * routeAround does), the waypoint is out to the side, three keep-outs from
   * the centre, on the side the ship is already on. The climb to it runs the
   * ceiling up exponentially and the line on from it is clear. */
  var DETOUR_HIT = 1.2, DETOUR_OUT = 3;
  function cruiseWaypoint(from, to, bodies, skipIndex) {
    var sx = to.x - from.x, sy = to.y - from.y, sz = to.z - from.z;
    var sl2 = sx * sx + sy * sy + sz * sz;
    if (!(sl2 > 1e-18)) return null;
    var worst = -1, depth = 0;
    for (var i = 0; i < bodies.length; i++) {
      if (i === skipIndex) continue;
      var p = bodies[i].pos;
      var keep = Math.min(bodies[i].keep * DETOUR_HIT, len(to.x - p.x, to.y - p.y, to.z - p.z) * 0.97);
      var t = ((p.x - from.x) * sx + (p.y - from.y) * sy + (p.z - from.z) * sz) / sl2;
      t = Math.max(0, Math.min(1, t));
      var miss = len(from.x + sx * t - p.x, from.y + sy * t - p.y, from.z + sz * t - p.z);
      if (miss < keep && keep - miss > depth) { depth = keep - miss; worst = i; }
    }
    if (worst < 0) return null;
    var sl = Math.sqrt(sl2), ux = sx / sl, uy = sy / sl, uz = sz / sl;
    var c = bodies[worst].pos;
    var rx = from.x - c.x, ry = from.y - c.y, rz = from.z - c.z;
    var d = rx * ux + ry * uy + rz * uz;
    var qx = rx - ux * d, qy = ry - uy * d, qz = rz - uz * d, ql = len(qx, qy, qz);
    if (ql < 1e-6) {
      /* Dead in line: any direction across will do. */
      var ax = Math.abs(uz) < 0.9 ? 0 : 1, az = Math.abs(uz) < 0.9 ? 1 : 0;
      qx = uy * az - uz * 0; qy = uz * ax - ux * az; qz = ux * 0 - uy * ax; ql = len(qx, qy, qz);
    }
    var R = bodies[worst].keep * DETOUR_OUT;
    return { index: worst, pos: { x: c.x + qx / ql * R, y: c.y + qy / ql * R, z: c.z + qz / ql * R } };
  }

  function cruiseTime(o, pip, bodies0, bodies1) {
    var rx = o.aim.x - o.ship.x, ry = o.aim.y - o.ship.y, rz = o.aim.z - o.ship.z;
    var direct = len(rx, ry, rz);
    var dropR = Math.max(o.dropR, 1e-6);
    /* Out of the bubble inside the arrival radius and at the target's
     * velocity is already arrived: no tail. */
    if (direct <= dropR) return { T: 0, cruise: 0, tail: 0 };
    var ux = rx / direct, uy = ry / direct, uz = rz / direct;
    var au = o.aimVel.x * ux + o.aimVel.y * uy + o.aimVel.z * uz;
    var a2 = o.aimVel.x * o.aimVel.x + o.aimVel.y * o.aimVel.y + o.aimVel.z * o.aimVel.z;
    /* The absolute path: to the pip, by way of a waypoint if a world is in
     * the way. The gap the closing law sees is the path left, as in flight. */
    var pts = [o.ship];
    var wp = cruiseWaypoint(o.ship, pip, bodies0, o.skipIndex);
    if (wp) pts.push(wp.pos);
    pts.push(pip);
    var segs = [], S = 0;
    for (var q = 1; q < pts.length; q++) {
      var sl = len(pts[q].x - pts[q - 1].x, pts[q].y - pts[q - 1].y, pts[q].z - pts[q - 1].z);
      segs.push(sl); S += sl;
    }
    var straight = len(pip.x - o.ship.x, pip.y - o.ship.y, pip.z - o.ship.z);
    var r0 = direct + Math.max(0, S - straight);
    function along(f) {
      var want = f * S, k = 0;
      while (k < segs.length - 1 && want > segs[k]) { want -= segs[k]; k++; }
      var g = segs[k] > 0 ? Math.min(1, want / segs[k]) : 0, A = pts[k], B = pts[k + 1];
      return { x: A.x + (B.x - A.x) * g, y: A.y + (B.y - A.y) * g, z: A.z + (B.z - A.z) * g };
    }
    var t = 0, prev = r0, nodes = cruiseNodes(r0, dropR);
    /* And around every close pass on the way: a world the path grazes holds
     * the ceiling down for a stretch about as long as the miss distance,
     * which in the middle of a long crossing falls between two nodes. */
    var base = 0;
    for (var sg = 0; sg < segs.length; sg++) {
      var A0 = pts[sg], B0 = pts[sg + 1], px = B0.x - A0.x, py = B0.y - A0.y, pz = B0.z - A0.z, pl = segs[sg];
      if (pl > 1e-9) {
        for (var bi = 0; bi < bodies0.length; bi++) {
          var bp = bodies0[bi].pos;
          var fs = ((bp.x - A0.x) * px + (bp.y - A0.y) * py + (bp.z - A0.z) * pz) / (pl * pl);
          if (!(fs > 0 && fs < 1)) continue;
          var miss = len(A0.x + px * fs - bp.x, A0.y + py * fs - bp.y, A0.z + pz * fs - bp.z);
          if (miss > bodies0[bi].keep * 30) continue;
          [-3, -1, -0.3, -0.1, 0, 0.1, 0.3, 1, 3].forEach(function (m) {
            var ss = base + (fs * pl) + m * Math.max(miss, bodies0[bi].keep);
            if (ss > 0 && ss < S) nodes.push(r0 - (ss / S) * (r0 - dropR));
          });
        }
      }
      base += pl;
    }
    nodes.sort(function (a, b) { return b - a; });
    for (var i = 0; i < nodes.length; i++) {
      var r = nodes[i];
      var mid = 0.5 * (prev + r);
      var f = 1 - (mid - dropR) / (r0 - dropR);
      var at = along(f);
      var L = lockCeiling(at.x, at.y, at.z, bodies0, bodies1, f, o.top);
      /* Mass-locked short of the drop point — but only on the way in. A
       * ship climbing off a world starts inside the squeeze with the drive
       * already running; that is departure, not arrival (and the assist
       * keeps the same rule, main.js steerInterceptCruise). */
      if (L < CRUISE_HANDOVER && f > 0.5) {
        /* The assist hands over here, matched, and the thrusters fly the
         * remaining gap. */
        var left = thrusterTime({ x: ux * mid, y: uy * mid, z: uz * mid }, { x: 0, y: 0, z: 0 },
                                o.accel, o.tol, o.cap).T;
        return { T: t + left, cruise: t, tail: left, lockedAt: mid, detour: !!wp };
      }
      t += (prev - r) / Math.max(1e-6, cruiseClosing(mid, au, a2, L));
      prev = r;
    }
    /* THE DROP-OUT IS NOT EXACT. The drive moves at its floor, 60 km/s,
     * and is dropped the frame the gap falls under one frame's step (main.js
     * steerInterceptCruise, closeStep), so it hands over up to a step short
     * of the aim point — a kilometre and a half at 60 fps, nine at 10 fps —
     * and the thrusters close that. It is the one real overhead the drive
     * has (it spins up at once and drops out already matched), and leaving
     * it out made cruise "faster" than thrusters at any range at all. */
    /* The step at the floor is the closing speed the law is clamped to
     * there — cruiseClosing at no gap, which is more than 60 km/s when the
     * aim point is running away (a station on a 30 km/s orbit receding along
     * the line makes it 90). Measured: Threshold Dock from 2,900 km dropped
     * out 5.7 km short at 20 fps, past the 5.3 km arrival radius, and the
     * thruster tail was 38 s of a 53 s trip. */
    var miss = (o.dropFrame || 0) * 1.5 * cruiseClosing(0, au, a2, Infinity), tail = 0;
    if (miss > o.tol) tail = thrusterTime({ x: ux * miss, y: uy * miss, z: uz * miss }, { x: 0, y: 0, z: 0 },
                                          o.accel, o.tol, o.cap).T;
    return { T: t + tail, cruise: t, tail: tail, detour: !!wp };
  }

  /* ---- the solve ----------------------------------------------------------
   * o: {
   *   ship: {pos, vel}, accel (km/s^2),
   *   targetAt(dt) -> {pos, vel, aim, aimVel}  the target dt seconds from
   *       now, with the point the ship flies to and the velocity it arrives
   *       with (a standoff off a station; a circular orbit's speed about a
   *       world),
   *   standoff, tol (arrival radius about the aim point),
   *   cruise: null, or {top, dropR, bodiesAt(dt) -> [{pos, keep}]}
   *       — null when the drive is not available, which is the caller's
   *       decision, made with the drive's own rules,
   *   cruiseMin: km of gap below which the drive is not worth spinning up,
   *   cap: km/s close-phase ceiling (optional)
   * }
   * Returns { T, pos, vel, drive, iters, converged, residual }. */
  var FIXED_ITERS = 10;
  function flown(o, T, now, b0, drive) {
    var tg = o.targetAt(T);
    var rel = { x: now.aim.x - o.ship.pos.x, y: now.aim.y - o.ship.pos.y, z: now.aim.z - o.ship.pos.z };
    if (drive === 'cruise') {
      var b1 = o.cruise.bodiesAt(T);
      var c = cruiseTime({ ship: o.ship.pos, aim: now.aim, aimVel: now.aimVel, accel: o.accel,
                           tol: o.tol, cap: o.cap, top: o.cruise.top, dropR: o.cruise.dropR,
                           skipIndex: o.cruise.skipIndex, dropFrame: o.cruise.dropFrame },
                         tg.aim, b0, b1);
      /* And the turn onto the heading first: the bubble goes where the
       * nose points, and the assist will not spin it up until the nose is
       * on the pip (main.js INTERCEPT_ALIGN). */
      var turn = o.turnTime ? o.turnTime(tg.aim) : 0;
      c.turn = turn;
      return { f: c.T + turn, tg: tg, drive: 'cruise', detail: c };
    }
    var w = { x: o.ship.vel.x - now.aimVel.x, y: o.ship.vel.y - now.aimVel.y, z: o.ship.vel.z - now.aimVel.z };
    var th = thrusterTime(rel, w, o.accel, o.tol, o.cap, o.give);
    if (th.over) return { f: Infinity, over: th.T, tg: tg, drive: 'thrusters', detail: th };
    return { f: th.T, tg: tg, drive: 'thrusters', detail: th };
  }

  /* BOTH DRIVES, AND THE FASTER ONE (Astra, 2026-11-03). The pip used to
   * pick cruise or thrusters by a distance threshold — auto-dock's 5,000 km
   * — and so at 2,900 km off Threshold Dock it said "thrusters, 17 min"
   * when the drive at its 60 km/s floor would have done it in under a
   * minute. Asked, she chose: "let the pip work out both and take whichever
   * is faster." So when the drive is allowed, each drive gets its own solve
   * — its own fixed point, because the pip moves with T and the two T's are
   * different — and the shorter one is the answer. The readout names it.
   *
   * Below `cruiseMin` the drive is not tried at all. That is not a guess at
   * the crossover (the comparison finds that); it is the floor under which
   * cruise cannot be flown honestly — see main.js INTERCEPT_CRUISE_MIN. */
  function solve(o) {
    var now = o.targetAt(0);
    var gap0 = len(now.aim.x - o.ship.pos.x, now.aim.y - o.ship.pos.y, now.aim.z - o.ship.pos.z);
    /* The floor (main.js INTERCEPT_CRUISE_MIN, twice the worst drop-out
     * miss at 60 km/s), raised for a target the drive's floor speed has to
     * outrun: twice the miss at 10 fps for THIS aim velocity. */
    var floor = o.cruiseMin || 0;
    if (o.cruise && floor > 0 && gap0 > 1e-9) {
      var ux0 = (now.aim.x - o.ship.pos.x) / gap0, uy0 = (now.aim.y - o.ship.pos.y) / gap0, uz0 = (now.aim.z - o.ship.pos.z) / gap0;
      var av = now.aimVel, au0 = av.x * ux0 + av.y * uy0 + av.z * uz0, aa0 = av.x * av.x + av.y * av.y + av.z * av.z;
      floor = Math.max(floor, 2 * 0.1 * 1.5 * cruiseClosing(0, au0, aa0, Infinity));
    }
    if (!o.cruise || !(gap0 > floor)) return solveWith(o, now, 'thrusters');
    /* Cruise first, then thrusters RACING it: the thruster model gives up
     * the moment it has taken longer than the cruise did. Without that a
     * cruise across the system paid for a thruster solve of the same
     * crossing — months of game time walked out step by step, the slowest
     * solve there is — only to throw it away. The readout then says the
     * thrusters would take "over" that. */
    var cr = solveWith(o, now, 'cruise');
    var give = isFinite(cr.T) ? cr.T : 0;
    var o2 = give ? Object.create(o) : o;
    if (give) o2.give = give;
    var th = solveWith(o2, now, 'thrusters');
    if (th.over || !(th.T < cr.T)) {
      cr.alt = { drive: 'thrusters', T: th.over ? th.over : th.T, over: !!th.over };
      return cr;
    }
    th.alt = { drive: 'cruise', T: cr.T };
    return th;
  }

  function solveWith(o, now, drive) {
    var b0 = drive === 'cruise' ? o.cruise.bodiesAt(0) : null;
    var T = 0, res = null, it = 0, converged = false;
    for (it = 0; it < FIXED_ITERS; it++) {
      res = flown(o, T, now, b0, drive);
      if (res.over) return { T: Infinity, over: res.over, drive: drive, converged: false };
      if (!isFinite(res.f)) break;
      var tolT = Math.max(0.05, 1e-3 * res.f);
      if (Math.abs(res.f - T) < tolT) { converged = true; T = res.f; break; }
      T = res.f;
    }
    /* A bracket, if the fixed point would not settle. g(T) = f(T) - T is
     * positive at 0 (any trip takes time) and negative once T is past the
     * longest the trip could take, so bisection is guaranteed a root. */
    if (!converged && res && isFinite(res.f)) {
      var lo = 0, hi = Math.max(T, res.f) * 2 + 1;
      for (var k = 0; k < 40 && flown(o, hi, now, b0, drive).f > hi; k++) hi *= 2;
      for (var j = 0; j < 40; j++) {
        var mid = 0.5 * (lo + hi);
        if (flown(o, mid, now, b0, drive).f > mid) lo = mid; else hi = mid;
        if (hi - lo < Math.max(0.05, 1e-3 * hi)) break;
      }
      T = 0.5 * (lo + hi);
      res = flown(o, T, now, b0, drive);
      converged = Math.abs(res.f - T) < Math.max(0.5, 5e-3 * T);
      it += j;
    }
    if (!res || !isFinite(res.f)) return { T: Infinity, drive: drive, converged: false };
    return {
      T: T, pos: res.tg.pos, vel: res.tg.vel, aim: res.tg.aim, drive: res.drive,
      iters: it + 1, converged: converged, residual: res.f - T, detail: res.detail
    };
  }

  var Intercept = {
    thrustLaw: thrustLaw, payThenSteer: payThenSteer,
    thrusterTime: thrusterTime, cruiseTime: cruiseTime, cruiseClosing: cruiseClosing,
    cruiseWaypoint: cruiseWaypoint,
    solve: solve,
    GAIN: GAIN, BRAKE: BRAKE, V_CAP: V_CAP, CRUISE_GAIN: CRUISE_GAIN, CRUISE_MIN: CRUISE_MIN,
    CRUISE_HANDOVER: CRUISE_HANDOVER, ARRIVE_DV: ARRIVE_DV
  };
  global.Intercept = Intercept;
  if (typeof module !== 'undefined' && module.exports) module.exports = Intercept;
})(typeof window !== 'undefined' ? window : globalThis);
