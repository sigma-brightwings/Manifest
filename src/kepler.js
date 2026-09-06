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
    var lan = nLen > 1e-9 ? wrapAngle(Math.atan2(nVec.y, nVec.x)) : 0;

    var argp = 0;
    if (nLen > 1e-9 && e > 1e-9) {
      argp = Math.acos(Math.max(-1, Math.min(1, V.dot(nVec, eVec) / (nLen * e))));
      if (eVec.z < 0) argp = TAU - argp;
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
    } else if (nLen > 1e-9) {
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
    elementsFromState: elementsFromState
  };

  global.Kepler = K;
  if (typeof module !== 'undefined' && module.exports) module.exports = K;
})(typeof window !== 'undefined' ? window : globalThis);
