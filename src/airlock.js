/* airlock.js — your ship's way out, and the seal on it (2026-10-26).
 *
 * Astra: "create a set of stairs/ramp which can be opened from both inside
 * and outside the ship and which allows travel from inside to outside of
 * the ship", "ensure that all models have a pathway to the exterior which
 * will seal against vacuum", and "climb into them from the ramp, up and
 * into a room which seals the ramp and then perpendicular to the ramp is
 * another airlock door which opens into the main interior of the ship."
 * Asked: the two doors are NEVER open together — every trip in or out is a
 * cycle, whatever is outside — and you put a suit on in the airlock
 * wherever the air outside is not air, so you can walk out anywhere you can
 * set down.
 *
 * The room and the ramp are shipdeck.js's (plan.ramp). This is only the
 * state, on the ship so it is saved with her:
 *
 *   side    'in'  — the airlock is at the ship's pressure: the inner door
 *                   works, the ramp is up and sealed.
 *           'out' — it is at the outside's: the inner door is held shut,
 *                   the ramp (or, docked, the berth hatch) is yours.
 *   cycle   null, or { to: 'in'|'out', t, then } while it pumps; nothing
 *           else moves while it does.
 *   ramp    0 raised and sealed .. 1 down on the ground.
 *   want    where the ramp is going.
 *   hatch   docked only: the berth hatch is open (0/1).
 *
 * Pure: no rendering, no Game. main.js calls step() every frame and
 * request() when you press something; the tests call both directly. */
(function (global) {
  'use strict';

  var CYCLE_S = 5.0;          // s to pump down or up, suit on or off with it
  var RAMP_S = 4.0;           // s for the ramp to go all the way
  var INNER_SHUT = 0.02;      // the inner door counts as shut below this

  function state(ship) {
    if (!ship) return null;
    var a = ship.airlock;
    if (!a || typeof a !== 'object') a = ship.airlock = {};
    if (a.side !== 'in' && a.side !== 'out') a.side = 'in';
    if (typeof a.ramp !== 'number' || !(a.ramp >= 0)) a.ramp = 0;
    if (a.ramp > 1) a.ramp = 1;
    if (typeof a.want !== 'number') a.want = a.ramp > 0.5 ? 1 : 0;
    if (typeof a.hatch !== 'number') a.hatch = 0;
    if (a.cycle && (a.cycle.to !== 'in' && a.cycle.to !== 'out')) a.cycle = null;
    if (a.side === 'in') { a.want = 0; }
    return a;
  }

  /* The outer side is shut: the ramp up and the berth hatch closed. */
  function outerShut(a) { return a.ramp <= 0 && !(a.hatch > 0); }

  /* Whether the ship is fit to fly: nothing hanging open under her. */
  function sealed(ship) {
    var a = state(ship);
    return !!a && outerShut(a) && a.want === 0;
  }

  /* Breathe it without a suit? Off the world's own spectrograph line
   * (generate.js `composition`), which says "breathable" for exactly the
   * worlds you can. */
  function breathable(body) {
    return !!(body && body.composition && /breathable/.test(body.composition) &&
              !/not breathable|unbreathable/.test(body.composition));
  }

  /* The inner door, as the door code sees it. */
  function innerDoor(plan) {
    if (!plan || !plan.doors) return null;
    for (var i = 0; i < plan.doors.length; i++) if (plan.doors[i].id === 'lock') return plan.doors[i];
    return null;
  }

  /* One frame. `ctx`: { landed, docked }. Holds the inner door shut unless
   * the room is at the ship's pressure, runs a cycle once both ends are
   * shut, moves the ramp. Returns any event worth saying out loud. */
  function step(ship, plan, dt, ctx) {
    var a = state(ship);
    if (!a) return null;
    ctx = ctx || {};
    dt = Math.max(0, dt || 0);
    var door = innerDoor(plan);
    var ev = null;
    /* BERTHED IN A HANGAR (2026-10-31). Astra, asked whether the cycle
     * rule holds in a pressurised station: "Open while docked". So while
     * she sits in her hangar (`ctx.berth`) the ramp comes down and stays
     * down, and the inner door works like any other - one walk from her
     * seat to the station deck. The rule comes back the moment she leaves:
     * the ramp comes up and the room is the ship's again. */
    if (ctx.berth) {
      if (!a.berth) { a.berth = true; a.cycle = null; a.side = 'out'; a.want = 1; a.hatch = 0; ev = 'berth'; }
      if (door) door.locked = false;
      var stepB = dt / RAMP_S;
      if (a.ramp < a.want) a.ramp = Math.min(a.want, a.ramp + stepB);
      else if (a.ramp > a.want) a.ramp = Math.max(a.want, a.ramp - stepB);
      return ev;
    }
    if (a.berth) { a.berth = false; a.side = 'in'; a.want = 0; a.hatch = 0; a.cycle = null; }
    /* Nobody opens the inner door while the room is not the ship's. */
    if (door) door.locked = !(a.side === 'in' && !a.cycle);
    var innerShut = !door || door.open <= INNER_SHUT;

    if (a.cycle) {
      /* Going in: the ramp comes up and the hatch shuts first. */
      if (a.cycle.to === 'in') { a.want = 0; a.hatch = 0; }
      if (innerShut && outerShut(a)) {
        a.cycle.t += dt;
        if (a.cycle.t >= CYCLE_S) {
          a.side = a.cycle.to;
          var then = a.cycle.then;
          a.cycle = null;
          ev = a.side === 'in' ? 'in' : 'out';
          if (a.side === 'out') {
            if (then === 'open' && ctx.landed) { a.want = 1; ev = 'lowering'; }
            else if (then === 'open' && ctx.docked) { a.hatch = 1; ev = 'hatch'; }
            /* Out in open space (2026-10-31, the spacewalk): the ramp
             * opens onto nothing, and down it is the way out in a suit. */
            else if (then === 'open' && ctx.vacuum) { a.want = 1; ev = 'vacuum'; }
          }
          if (door) door.locked = !(a.side === 'in');
        }
      }
    }
    /* The ramp goes only from the outside's side of the seal, and only
     * where there is ground under it. */
    if (a.side === 'in' || a.cycle && a.cycle.to === 'in') a.want = 0;
    if (!ctx.landed && !ctx.vacuum && a.want > 0) a.want = 0;
    if (!ctx.docked) a.hatch = 0;
    var stepR = dt / RAMP_S;
    if (a.ramp < a.want) a.ramp = Math.min(a.want, a.ramp + stepR);
    else if (a.ramp > a.want) a.ramp = Math.max(a.want, a.ramp - stepR);
    return ev;
  }

  /* Press something. `action`:
   *   'out'   — cycle out, then lower the ramp (landed) or open the hatch
   *             (docked);
   *   'in'    — raise the ramp, shut the hatch, cycle in;
   *   'lower' / 'raise' — the ramp alone, from the outside's side of the
   *             seal (the panel at its foot, or the airlock's own);
   * `ctx`: { landed, docked, flying, inLock (the walker is in the airlock) }.
   * Returns { ok, why, say } — `why` in words the game can print. */
  function request(ship, action, ctx) {
    var a = state(ship);
    ctx = ctx || {};
    if (!a) return { ok: false, why: 'no ship' };
    /* In her hangar the ramp stays down and both doors work: the lift
     * hulls' controls still raise and lower their platform. */
    if (a.berth) {
      if (action === 'raise') { a.want = 0; return { ok: true, say: 'Lift coming up' }; }
      if (action === 'lower') { a.want = 1; return { ok: true, say: 'Lift coming down' }; }
      return { ok: false, why: 'she is open to the hangar while she is berthed' };
    }
    if (a.cycle) return { ok: false, why: 'the airlock is cycling' };
    if (action === 'out') {
      if (a.side === 'out') {
        if ((ctx.landed || ctx.vacuum) && a.ramp < 1) { a.want = 1; return { ok: true, say: ctx.vacuum ? 'Ramp opening onto open space' : 'Ramp coming down' }; }
        if (ctx.docked && !a.hatch) { a.hatch = 1; return { ok: true, say: 'Hatch open' }; }
        return { ok: false, why: 'the way out is already open' };
      }
      /* `vacuum`: in open space, and the caller says a spacewalk is a thing
       * this ship's people can do (main.js lockCtx, 2026-10-31). Without
       * it, the old refusal stands. */
      if (!ctx.landed && !ctx.docked && !ctx.vacuum) return { ok: false, why: 'nothing out there but vacuum  —  set her down or dock first' };
      a.cycle = { to: 'out', t: 0, then: 'open' };
      return { ok: true, say: ctx.vacuum ? 'Cycling out  —  suit sealed, pumping down to vacuum'
                         : ctx.breathable === false ? 'Cycling out  —  suit on, pumping down' : 'Cycling out  —  equalising' };
    }
    if (action === 'in') {
      if (a.side === 'in') return { ok: false, why: 'the airlock is already sealed to the ship' };
      a.want = 0; a.hatch = 0;
      a.cycle = { to: 'in', t: 0, then: null };
      return { ok: true, say: a.ramp > 0 ? 'Ramp coming up  —  then cycling in' : 'Cycling in' };
    }
    if (action === 'lower') {
      if (a.side !== 'out') return { ok: false, why: 'the airlock is sealed to the ship  —  cycle out first' };
      if (!ctx.landed && !ctx.vacuum) return { ok: false, why: 'no ground under her to lower it onto' };
      a.want = 1;
      return { ok: true, say: ctx.vacuum ? 'Ramp opening onto open space' : 'Ramp coming down' };
    }
    if (action === 'raise') {
      if (a.ramp <= 0 && a.want === 0) return { ok: false, why: 'the ramp is already up' };
      a.want = 0;
      return { ok: true, say: 'Ramp coming up' };
    }
    return { ok: false, why: 'no such thing to do' };
  }

  /* What the airlock's controls offer right now, for the label over them. */
  function panelLabel(ship, ctx) {
    var a = state(ship);
    ctx = ctx || {};
    if (a.berth) return 'Berthed  -  open to the hangar';
    if (a.cycle) return a.cycle.to === 'out' ? 'Cycling out…' : 'Cycling in…';
    if (a.side === 'in') return ctx.landed ? 'Cycle out and lower the ramp' : ctx.docked ? 'Cycle out to the berth'
                             : ctx.vacuum ? 'Suit up and cycle out  —  open space' : 'Airlock  —  sealed';
    return a.ramp > 0 || a.hatch ? 'Close up and cycle in' : 'Cycle in';
  }

  /* For the airlock's lamp: green when the way out is open to you. */
  function lampGreen(ship) {
    var a = state(ship);
    return !!a && (a.berth || (a.side === 'out' && !a.cycle));
  }

  var Airlock = {
    CYCLE_S: CYCLE_S, RAMP_S: RAMP_S,
    state: state, step: step, request: request, sealed: sealed,
    breathable: breathable, panelLabel: panelLabel, lampGreen: lampGreen, innerDoor: innerDoor
  };
  global.Airlock = Airlock;
  if (typeof module !== 'undefined' && module.exports) module.exports = Airlock;
})(typeof window !== 'undefined' ? window : globalThis);
