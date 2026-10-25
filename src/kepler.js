/* kepler.js — the rails.
 *
 * Every planet, moon and station is defined by six orbital elements plus the
 * gravitational parameter of its parent. Its position is a PURE FUNCTION of
 * time: state(elements, mu, t). Nothing is integrated, so nothing accumulates
 * error, and nothing can drift, decay or get flung out of the system — no
 * matter how long you leave the game running or how far you jump ahead. Visit
 * the same seed in a hundred years of game time and the clockwork reads the
 * same. That is the guarantee we designed for, and it lives in this file.
 *
 * Elements:
 *   a     semi-major axis (km)
 *   e     eccentricity (0 <= e < 1; closed orbits only, by design)
 *   inc   inclination (rad) from the ecliptic
 *   lan   longitude of ascending node, Omega (rad)
 *   argp  argument of periapsis, omega (rad)
 *   m0    mean anomaly at epoch t=0 (rad)
 */
(function (global) {
  'use strict';

  var V = global.V || require('./vec3.js');

  var TAU = Math.PI * 2;

  function wrapAngle(x) {
    x = x % TAU;
    return x < 0 ? x + TAU : x;
  }

  /* Solve Kepler's equation M = E - e*sin(E) for the eccentric anomaly E.
   * Newton-Raphson converges in a handful of iterations for e < 0.9 given a
   * decent seed; we start from Danby's cubic-ish guess and fall back to
   * bisection-safe damping for high eccentricity. */
  function solveKepler(M, e, tol, maxIter) {
    tol = tol || 1e-12;
    maxIter = maxIter || 60;
    M = wrapAngle(M);
    if (e < 1e-12) return M; // circular: E == M

    // Danby's starter.
    var E = M + 0.85 * e * Math.sign(Math.sin(M) || 1);
    for (var i = 0; i < maxIter; i++) {
      var sinE = Math.sin(E), cosE = Math.cos(E);
      var f = E - e * sinE - M;
      if (Math.abs(f) < tol) break;
      var fp = 1 - e * cosE;
      var step = f / fp;
      // Damp runaway steps near e -> 1 where fp gets small.
      if (step > 1) step = 1;
      else if (step < -1) step = -1;
      E -= step;
    }
    return E;
  }

  /* Rotate a point in the orbital (perifocal) plane into world coordinates:
   * Rz(lan) * Rx(inc) * Rz(argp). */
  function perifocalToWorld(x, y, inc, lan, argp) {
    var ca = Math.cos(argp), sa = Math.sin(argp);
    var ci = Math.cos(inc), si = Math.sin(inc);
    var cl = Math.cos(lan), sl = Math.sin(lan);

    var x1 = x * ca - y * sa;
    var y1 = x * sa + y * ca;
    // Rx(inc) — z1 is 0 before this, so it just tips y1 into z.
    var y2 = y1 * ci;
    var z2 = y1 * si;
    // Rz(lan)
    return {
      x: x1 * cl - y2 * sl,
      y: x1 * sl + y2 * cl,
      z: z2
    };
  }

  function meanMotion(a, mu) { return Math.sqrt(mu / (a * a * a)); }

  function period(a, mu) { return TAU / meanMotion(a, mu); }

  /* Position AND velocity relative to the parent, at time t seconds. */
  function state(el, mu, t) {
    var n = meanMotion(el.a, mu);
    var M = el.m0 + n * t;
    var E = solveKepler(M, el.e);

    var cosE = Math.cos(E), sinE = Math.sin(E);
    var oneMinusEcosE = 1 - el.e * cosE;
    var r = el.a * oneMinusEcosE;
    var sqrt1me2 = Math.sqrt(1 - el.e * el.e);

    // Perifocal position.
    var px = el.a * (cosE - el.e);
    var py = el.a * sqrt1me2 * sinE;

    // Perifocal velocity: d/dt of the above via dE/dt = n / (1 - e cos E).
    var factor = el.a * n / oneMinusEcosE;
    var vx = -factor * sinE;
    var vy = factor * sqrt1me2 * cosE;

    return {
      pos: perifocalToWorld(px, py, el.inc, el.lan, el.argp),
      vel: perifocalToWorld(vx, vy, el.inc, el.lan, el.argp),
      r: r,
      trueAnomaly: Math.atan2(sqrt1me2 * sinE, cosE - el.e)
    };
  }

  function position(el, mu, t) { return state(el, mu, t).pos; }

  /* Sample the closed orbit path for drawing — uniform in eccentric anomaly,
   * which naturally puts more points near periapsis where curvature is high. */
  function samplePath(el, segments) {
    segments = segments || 128;
    var pts = [];
    var sqrt1me2 = Math.sqrt(1 - el.e * el.e);
    for (var i = 0; i <= segments; i++) {
      var E = (i / segments) * TAU;
      var px = el.a * (Math.cos(E) - el.e);
      var py = el.a * sqrt1me2 * Math.sin(E);
      pts.push(perifocalToWorld(px, py, el.inc, el.lan, el.argp));
    }
    return pts;
  }

  /* The same loop, cut in two at the ship: the half-period AHEAD of it and
   * the half-period BEHIND. Astra, 2026-10-19: the orbit already travelled
   * and the orbit to be travelled should read differently, "whichever
   * reads easier". Split by TIME, not by angle — on an eccentric orbit
   * half the angle is nowhere near half the trip, and "where will I be in
   * half an orbit" is the question the line answers.
   *
   * ahead runs from the ship forward; behind runs from half a period ago
   * up to the ship, so both meet at it and each is drawn in the direction
   * of travel. Sampled evenly in eccentric anomaly within each half, like
   * samplePath, so periapsis is as smooth as it ever was. */
  function samplePathSplit(el, segments, pos) {
    segments = segments || 240;
    var e = el.e;
    var sqrt1me2 = Math.sqrt(1 - e * e);
    /* Where the ship sits on the loop, read in the SAME axes the sampler
     * draws in. Taking it from el.nu was the first version and it put the
     * join on the far side of every orbit lying flat in the system plane:
     * with no inclination there is no node line, and the true anomaly and
     * the argument of periapsis are then measured from different zeros.
     * Projecting the position onto the sampler's own P and Q cannot
     * disagree with the sampler. */
    var E0;
    if (pos) {
      var P = perifocalToWorld(1, 0, el.inc, el.lan, el.argp);
      var Q = perifocalToWorld(0, 1, el.inc, el.lan, el.argp);
      var px = pos.x * P.x + pos.y * P.y + pos.z * P.z;
      var qy = pos.x * Q.x + pos.y * Q.y + pos.z * Q.z;
      E0 = Math.atan2(qy / (el.a * sqrt1me2), px / el.a + e);
    } else {
      E0 = 2 * Math.atan2(Math.sqrt(1 - e) * Math.sin(el.nu / 2),
                          Math.sqrt(1 + e) * Math.cos(el.nu / 2));
    }
    var M0 = E0 - e * Math.sin(E0);
    var Eh = solveKepler(M0 + Math.PI, e);
    var span = wrapAngle(Eh - E0);                 // eccentric anomaly to half a period on
    if (span < 1e-9) span = Math.PI;
    function at(E) {
      return perifocalToWorld(el.a * (Math.cos(E) - e), el.a * sqrt1me2 * Math.sin(E),
                              el.inc, el.lan, el.argp);
    }
    function run(Ea, dE) {
      var n = Math.max(8, Math.round(segments * dE / TAU)), pts = [];
      for (var i = 0; i <= n; i++) pts.push(at(Ea + dE * i / n));
      return pts;
    }
    return { ahead: run(E0, span), behind: run(E0 + span, TAU - span) };
  }

  /* The inverse problem: given a state vector relative to a body, what orbit
   * am I currently on? This is the "osculating" orbit — the ellipse the ship
   * would follow if every other body vanished. It is what the HUD reports as
   * apoapsis/periapsis, and it is how the player reads their situation. */
  function elementsFromState(pos, vel, mu) {
    var r = V.len(pos);
    var v = V.len(vel);
    var h = V.cross(pos, vel);
    var hLen = V.len(h);

    var energy = (v * v) / 2 - mu / r;
    var a = -mu / (2 * energy); // negative a => hyperbolic (escaping)

    // Eccentricity vector.
    var eVec = V.sub(
      V.scale(pos, (v * v - mu / r) / mu),
      V.scale(vel, V.dot(pos, vel) / mu)
    );
    var e = V.len(eVec);

    var inc = Math.acos(Math.max(-1, Math.min(1, h.z / hLen)));

    var nVec = { x: -h.y, y: h.x, z: 0 }; // node line
    var nLen = V.len(nVec);
    /* "No node line" is RELATIVE to |h|, not an absolute 1e-9. Angular
     * momentum here runs from 1e4 to 1e10 km^2/s, so an orbit flat but for
     * rounding error had a node line made of noise, an inclination of
     * 1e-15, and an argument of periapsis whose sign came from whichever
     * way eVec.z's noise fell. */
    var hasNode = nLen > 1e-8 * hLen;
    var lan = hasNode ? wrapAngle(Math.atan2(nVec.y, nVec.x)) : 0;

    var argp = 0;
    if (hasNode && e > 1e-9) {
      argp = Math.acos(Math.max(-1, Math.min(1, V.dot(nVec, eVec) / (nLen * e))));
      if (eVec.z < 0) argp = TAU - argp;
    } else if (e > 1e-9) {
      /* FLAT ORBITS KEEP THEIR PERIAPSIS (2026-10-19). With no node line
       * this used to leave argp at 0, which threw away where periapsis
       * IS: every orbit lying in the system plane — most of them — was
       * drawn with its periapsis along +X wherever it really pointed, an
       * ellipse of the right shape rotated off the ship. Found when the
       * orbit line was split at the ship and the join missed it by
       * thousands of km. With lan = 0, argp is the longitude of
       * periapsis; Rx(inc) at 180° mirrors y, so a retrograde flat orbit
       * measures it the other way round. */
      var lonP = Math.atan2(eVec.y, eVec.x);
      argp = wrapAngle(h.z >= 0 ? lonP : -lonP);
    }

    var closed = energy < 0;

    /* Where on that orbit the body actually is, as a mean anomaly. Without
     * this the elements describe a shape and not a position, and cannot be
     * handed back to state() — which is what you want the moment something
     * has to be taken off an integrator and put on a rail.
     *
     * True anomaly first, measured from the eccentricity vector when there
     * is one. A circular orbit has no periapsis to measure from, so it is
     * measured from the ascending node instead, and an equatorial circular
     * orbit has neither, so it is measured from +X. Each fallback matches
     * the convention state() uses when it sets the same angle to zero. */
    var nu;
    if (e > 1e-9) {
      nu = Math.acos(Math.max(-1, Math.min(1, V.dot(eVec, pos) / (e * r))));
      if (V.dot(pos, vel) < 0) nu = TAU - nu;
    } else if (hasNode) {
      nu = Math.acos(Math.max(-1, Math.min(1, V.dot(nVec, pos) / (nLen * r))));
      if (pos.z < 0) nu = TAU - nu;
    } else {
      nu = Math.acos(Math.max(-1, Math.min(1, pos.x / r)));
      if (pos.y < 0) nu = TAU - nu;
    }

    var M;
    if (closed) {
      var E = 2 * Math.atan2(Math.sqrt(1 - e) * Math.sin(nu / 2),
                             Math.sqrt(1 + e) * Math.cos(nu / 2));
      M = E - e * Math.sin(E);
    } else {
      // Hyperbolic anomaly. state() cannot fly this, but reporting it is
      // still better than reporting nothing.
      var H = 2 * Math.atanh(Math.sqrt((e - 1) / (e + 1)) * Math.tan(nu / 2));
      M = e * Math.sinh(H) - H;
    }

    return {
      a: a, e: e, inc: inc, lan: lan, argp: argp,
      nu: nu,
      // Mean anomaly AT THE MOMENT THIS STATE WAS SAMPLED. state() wants
      // m0, the value at t = 0, so a caller building a rail at time t
      // subtracts meanMotion(a, mu) * t from this.
      m: closed ? wrapAngle(M) : M,
      closed: closed,
      // a*(1-e) is the periapsis radius for both ellipses and hyperbolas
      // (for e>1, a is negative and 1-e is negative, so the product is
      // positive). Apoapsis only exists on a closed orbit.
      apoapsis: closed ? a * (1 + e) : Infinity,
      periapsis: a * (1 - e),
      period: closed ? period(a, mu) : Infinity,
      speed: v,
      radius: r,
      energy: energy
    };
  }

  var K = {
    TAU: TAU,
    wrapAngle: wrapAngle,
    solveKepler: solveKepler,
    perifocalToWorld: perifocalToWorld,
    meanMotion: meanMotion,
    period: period,
    state: state,
    position: position,
    samplePath: samplePath,
    samplePathSplit: samplePathSplit,
    elementsFromState: elementsFromState
  };

  global.Kepler = K;
  if (typeof module !== 'undefined' && module.exports) module.exports = K;
})(typeof window !== 'undefined' ? window : globalThis);
