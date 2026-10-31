/* eva.js — the spacewalk (boarding part 3, 2026-10-31).
 *
 * Astra, asked how you cross to a ship you have disabled: "Fly the suit".
 * You step off the bottom of your ramp in open space and cross on the
 * suit's cold-gas jets, with a pack that runs out, aiming for her open
 * hatch - parked within about 150 m of her and matched to her, or it is a
 * long way. You can miss.
 *
 * What keeps a miss from being the end of the game is a SAFETY LINE off
 * your own ramp: it stops you at LINE_KM, and holding H reels you back in
 * at a walking pace with no gas at all. So running dry costs you time and
 * the crossing, never your life.
 *
 * Everything is in the world frame, in km and km/s, like every ship; the
 * suit feels the same gravity they do (the caller passes it), so a suit
 * and two ships coasting together stay together.
 *
 *   start({ pos, vel, fwd, up })          -> a suit, gas full, line on
 *   look(e, dyaw, dpitch)                 -> turns the suit (mouse)
 *   step(e, keys, dt, ctx) -> { thrust }  -> one frame
 *      keys: w s a d, ' ' (up), crouch (down), x (brake), h (reel)
 *      ctx:  { g, ref: { pos, vel }, home: { pos, vel } }
 *   relSpeed(e, ref), reach(e, point)     -> for the HUD and the hatches
 *
 * Plain IIFE on `global`, `module.exports` for the tests. */
(function (global) {
  'use strict';

  var THRUST = 0.0006;        // km/s^2: 0.6 m/s^2 from the jets
  var GAS_S = 50;             // s of jets in a full pack: 30 m/s of change
  var BRAKE = 0.0008;         // km/s^2 against your drift, X held
  var BRAKE_GAS = 0.6;        // s of pack per s of braking
  var LINE_KM = 0.3;          // the safety line, off your own ramp
  var REEL_KMS = 0.0015;      // H: 1.5 m/s back along it, no gas
  var REACH_KM = 0.004;       // a hatch within 4 m is within reach
  var BOARD_KM = 0.15;        // park within this of her to go across

  function Vx() { return global.V; }

  function start(o) {
    var v = Vx();
    var f = v.norm(o.fwd), u = v.norm(o.up);
    var r = v.norm(v.cross(f, u));
    u = v.norm(v.cross(r, f));
    return { pos: v.clone(o.pos), vel: v.clone(o.vel || { x: 0, y: 0, z: 0 }), f: f, u: u, r: r,
             gas: GAS_S, line: o.line !== false, t: 0, thrusting: false };
  }

  /* Positive yaw turns right, positive pitch up (render.js buildCockpit's
   * signs). No roll, and no clamp: there is no up out here. */
  function look(e, dyaw, dpitch) {
    var v = Vx();
    if (dyaw) e.f = v.rotateAroundAxis(e.f, e.u, -dyaw);
    e.r = v.norm(v.cross(e.f, e.u));
    if (dpitch) {
      e.f = v.rotateAroundAxis(e.f, e.r, dpitch);
      e.u = v.norm(v.cross(e.r, e.f));
    }
    e.f = v.norm(e.f);
    e.r = v.norm(v.cross(e.f, e.u));
    e.u = v.norm(v.cross(e.r, e.f));
  }

  function step(e, keys, dt, ctx) {
    var v = Vx();
    keys = keys || {}; ctx = ctx || {};
    dt = Math.max(0, dt || 0);
    e.t += dt;
    var a = { x: 0, y: 0, z: 0 }, n = 0;
    function push(dir, s) { a = v.addScaled(a, dir, s); n++; }
    if (keys.w) push(e.f, 1);
    if (keys.s) push(e.f, -1);
    if (keys.d) push(e.r, 1);
    if (keys.a) push(e.r, -1);
    if (keys[' ']) push(e.u, 1);
    if (keys.crouch) push(e.u, -1);
    e.thrusting = false;
    if (n && e.gas > 0 && v.len(a) > 1e-9) {
      a = v.scale(v.norm(a), THRUST);
      e.gas = Math.max(0, e.gas - dt);
      e.thrusting = true;
    } else a = { x: 0, y: 0, z: 0 };
    /* X: every jet at once against your drift relative to the nearest
     * ship, until you are still beside her. */
    if (keys.x && ctx.ref && e.gas > 0) {
      var rel = v.sub(e.vel, ctx.ref.vel), L = v.len(rel);
      if (L > 1e-9) {
        var dv = Math.min(L, BRAKE * dt);
        e.vel = v.sub(e.vel, v.scale(rel, dv / L));
        e.gas = Math.max(0, e.gas - dt * BRAKE_GAS);
        e.thrusting = true;
      }
    }
    if (ctx.g) a = v.add(a, ctx.g);
    e.vel = v.addScaled(e.vel, a, dt);
    /* H: the line's winch. Toward your ramp at REEL_KMS, on top of her own
     * motion, eased in so it is a pull rather than a teleport. */
    var home = e.line ? ctx.home : null;
    if (keys.h && home) {
      var to = v.sub(home.pos, e.pos), d = v.len(to);
      if (d > REACH_KM * 0.5) {
        var want = v.add(home.vel, v.scale(to, Math.min(REEL_KMS, d) / d));
        var k = Math.min(1, dt * 2);
        e.vel = v.add(e.vel, v.scale(v.sub(want, e.vel), k));
      }
    }
    e.pos = v.addScaled(e.pos, e.vel, dt);
    /* The line goes taut: no further out, and nothing more outward. */
    if (home) {
      var off = v.sub(e.pos, home.pos), dl = v.len(off);
      if (dl > LINE_KM) {
        var nrm = v.scale(off, 1 / dl);
        e.pos = v.addScaled(home.pos, nrm, LINE_KM);
        var out = v.dot(v.sub(e.vel, home.vel), nrm);
        if (out > 0) e.vel = v.sub(e.vel, v.scale(nrm, out));
      }
      /* Taut at its length, not only on the frame it fetched you up. */
      e.taut = v.dist(e.pos, home.pos) >= LINE_KM * 0.999;
    }
    return { thrust: e.thrusting };
  }

  function relSpeed(e, ref) {
    var v = Vx();
    return ref ? v.len(v.sub(e.vel, ref.vel)) : v.len(e.vel);
  }
  function reach(e, point) {
    return !!point && Vx().dist(e.pos, point) <= REACH_KM;
  }

  var Eva = {
    start: start, look: look, step: step, relSpeed: relSpeed, reach: reach,
    THRUST: THRUST, GAS_S: GAS_S, BRAKE: BRAKE, LINE_KM: LINE_KM, REEL_KMS: REEL_KMS,
    REACH_KM: REACH_KM, BOARD_KM: BOARD_KM
  };
  global.Eva = Eva;
  if (typeof module !== 'undefined' && module.exports) module.exports = Eva;
})(typeof window !== 'undefined' ? window : globalThis);
