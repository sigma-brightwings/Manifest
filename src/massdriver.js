/* massdriver.js - the mass driver: a coil gun, and the first weapon in the
 * game that has to obey the physics the game was built on (2026-11-02).
 *
 * Astra asked what Claude thought of "some kind of mass driver weapon";
 * the pitch was travel time and a lead pip, recoil, ammunition with mass,
 * and a different answer to shields than light has. Her one ruling:
 *
 *   "They should go through 50% of the slug's damage to the hull and 50%
 *    to the shield. Call it that there's residual static charge on the
 *    projectile after electromagnetic acceleration."
 *
 * So half of every hit is the charge the coils left on the slug, which a
 * shield catches, and half is the slug, which it does not (Combat
 * splitDamage, `split`). Everything else is Claude's first numbers, easy to
 * move — see the constants.
 *
 * WHAT IS DIFFERENT FROM EVERY LASER:
 *   - IT TRAVELS. Every laser is hitscan and only its tracer is slow. A slug
 *     leaves at SLUG_SPEED on top of your own velocity and flies; whether
 *     it hits is decided where it actually goes, against where the target
 *     actually is. So you aim at where they will be: main.js draws a lead
 *     pip on your nav target (MassDriver.lead).
 *   - IT PUSHES BACK. Every shot is momentum out of the muzzle and the same
 *     momentum into you: SLUG_T x SLUG_SPEED over your mass, straight back
 *     down the nose. A light hull feels it; a Crawler does not.
 *   - IT EATS AMMUNITION WITH MASS. Slugs ride in the hold as cargo
 *     ('slugs', SLUG_T a round) — bought at an outfitter, heavier than you
 *     think, and gone when they are gone.
 *   - IT RUNS COOL. Coils, not a beam: a little heat a shot.
 *
 * A MISSED SLUG keeps flying for SLUG_LIFE and is then gone. It is a real
 * object in that time — it can hit the next ship along the line — but it
 * is never put on an orbit. DECIDED, 2026-11-02: offered a miss that could
 * hit a station minutes later, Astra said no — "we could very quickly end
 * up with a Kessler syndrome." In the world, rounds are frangible: the
 * same charge the coils leave on them cracks a slug apart into dust once
 * it has flown its twenty seconds, which is also why no yard will sell you
 * a solid one.
 *
 * THE ONE-TICK RULE, learnt twice on 2026-11-01 (hunters, torpedoes): a
 * slug carries `at`, the time its position is for, and any gap between
 * that and the frame's t is coasted before it is tested.
 */
(function (global) {
  'use strict';
  var V = global.V;

  var SLUG_SPEED = 8;          // km/s off the rail, on top of the ship's own velocity
  var SLUG_T = 0.025;          // tonnes a round: forty to the tonne
  var SLUG_LIFE = 20;          // s, then it is out of the fight (160 km down range)
  var SLUG_HIT_MIN = 0.04;     // km - the least a hull is wide to a slug
  var MAX_SLUGS = 80;          // in flight at once, oldest dropped
  var DRY_SAY_S = 4;           // how often "no slugs" is said while you hold the trigger

  function Sim() { return global.Sim; }
  function C() { return global.Combat; }

  /* Registered the way the courier parcel is: into the economy's table so
   * the hold can carry it, but in no market's rows — slugs are bought at an
   * outfitter, not traded. */
  function register() {
    var Eco = global.Economy;
    if (Eco && Eco.BY_ID && !Eco.BY_ID.slugs) {
      Eco.BY_ID.slugs = { id: 'slugs', name: 'Driver slugs', base: 0, tier: 0, ammo: true };
    }
  }
  register();

  function roundsAboard(ship) {
    var t = (ship && ship.cargo && ship.cargo.slugs) || 0;
    return Math.floor(t / SLUG_T + 1e-6);
  }

  function list(sys) { return sys.slugs || (sys.slugs = []); }

  /* One round. Called by Combat.fireOne in place of the laser's hitscan.
   * Returns the slug, or null with the reason said. */
  function fire(sys, G, t, gun, muzzle, hooks) {
    var s = G.ship;
    if (roundsAboard(s) < 1) {
      if (hooks && hooks.say && t >= (G.dryAt || -Infinity) + DRY_SAY_S) {
        G.dryAt = t;
        hooks.say(gun.name + ' dry — no slugs aboard. An outfitter sells them by the tonne.', 4);
      }
      if (hooks && hooks.sound) hooks.sound('click');
      return null;
    }
    s.cargo.slugs = Math.max(0, s.cargo.slugs - SLUG_T);
    if (s.cargo.slugs < 1e-6) delete s.cargo.slugs;
    var speed = gun.speed || SLUG_SPEED;
    var slug = {
      pos: V.clone(muzzle), vel: V.addScaled(s.vel, s.fwd, speed),
      at: t, born: t, dies: t + SLUG_LIFE,
      dmg: gun.dmg, gun: gun, fromPlayer: true, from: V.clone(s.pos),
      color: gun.color || '#e8f0ff',
      bornS: (typeof performance !== 'undefined' ? performance.now() : 0) / 1000
    };
    var L = list(sys);
    L.push(slug);
    while (L.length > MAX_SLUGS) L.shift();
    /* Newton's third law, straight back down the nose. */
    var m = s.mass > 0 ? s.mass : 50;
    s.vel = V.addScaled(s.vel, s.fwd, -(SLUG_T * speed) / m);
    if (hooks && hooks.sound) hooks.sound('massdriver');
    return slug;
  }

  /* Closest approach of the relative path over the next dt: the time and
   * the miss distance. Same idea as the torpedo's fuse. */
  function closest(a, va, b, vb, dt) {
    var rel = V.sub(a, b), rv = V.sub(va, vb);
    var vv = V.dot(rv, rv);
    var s = vv > 1e-18 ? Math.max(0, Math.min(dt, -V.dot(rel, rv) / vv)) : 0;
    return { s: s, d: V.len(V.addScaled(rel, rv, s)) };
  }

  function hitRadius(st) {
    var sz = (st && (st.size || (st.spec && st.spec.size))) || 0;
    return Math.max(SLUG_HIT_MIN, sz * 0.6);
  }

  function update(sys, G, t, dt, hooks) {
    var L = sys && sys.slugs;
    if (!L || !L.length || !(dt > 0)) return;
    var Sm = Sim(), Cb = C();
    var ships = Sm && Sm.shipsAll ? Sm.shipsAll(sys, t) : [];
    var keep = [];
    for (var i = 0; i < L.length; i++) {
      var sl = L[i];
      if (t >= sl.dies) continue;
      if (sl.at !== undefined && t > sl.at && t - sl.at < 5) sl.pos = V.addScaled(sl.pos, sl.vel, t - sl.at);
      var reach = V.len(V.sub(sl.vel, G.ship.vel)) * dt + 1;
      var best = null, bestS = Infinity;
      for (var k = 0; k < ships.length; k++) {
        var st = ships[k];
        if (!st || !st.pos || (st.route && st.route.suppressed && !st.spec)) continue;
        if (V.dist(st.pos, sl.pos) > reach + 0.5) continue;
        var c = closest(sl.pos, sl.vel, st.pos, st.vel || G.ship.vel, dt);
        if (c.d < hitRadius(st) && c.s < bestS) { bestS = c.s; best = st; }
      }
      if (best) {
        var spec = best.spec || (Cb.liftTrader ? Cb.liftTrader(sys, best, t) : null);
        var at = V.addScaled(sl.pos, sl.vel, bestS);
        if (spec && Cb.damageNpc) Cb.damageNpc(sys, G, spec, sl.dmg, t, hooks, sl.gun, sl.from);
        (G.explosions = G.explosions || []).push({
          pos: at, size: 0.05, life: 380, at: (typeof performance !== 'undefined' ? performance.now() : 0),
          vel: V.clone(best.vel || sl.vel), t: t, spark: true
        });
        continue;
      }
      if (Sm && Sm.acceleration) sl.vel = V.addScaled(sl.vel, Sm.acceleration(sl.pos, sys, t), dt);
      sl.pos = V.addScaled(sl.pos, sl.vel, dt);
      sl.at = t + dt;
      keep.push(sl);
    }
    sys.slugs = keep;
  }

  /* Where to point so a slug fired now meets a target moving at a steady
   * velocity: the root of |r + v t| = speed t, in your own frame (the slug
   * inherits your velocity). Returns { point, t } in world space, or null
   * when there is no intercept (they are outrunning the slug). */
  function lead(shipPos, shipVel, tgtPos, tgtVel, speed) {
    speed = speed || SLUG_SPEED;
    var r = V.sub(tgtPos, shipPos), v = V.sub(tgtVel || shipVel, shipVel);
    var a = V.dot(v, v) - speed * speed, b = 2 * V.dot(r, v), c = V.dot(r, r);
    var tt;
    if (Math.abs(a) < 1e-12) { if (Math.abs(b) < 1e-12) return null; tt = -c / b; }
    else {
      var disc = b * b - 4 * a * c;
      if (disc < 0) return null;
      var sq = Math.sqrt(disc), t1 = (-b - sq) / (2 * a), t2 = (-b + sq) / (2 * a);
      tt = Math.min(t1, t2) > 0 ? Math.min(t1, t2) : Math.max(t1, t2);
    }
    if (!(tt > 0)) return null;
    return { point: V.add(shipPos, V.addScaled(r, v, tt)), t: tt };
  }

  /* SLUGS AT THE OUTFITTER, a tonne at a time: forty rounds. A refusal
   * says which of the three things stopped it. */
  var SLUG_PRICE_T = 480;      // cr a tonne, twelve a round
  function hasDriver(ship) {
    var Cb = C();
    var list = Cb && Cb.fittedList ? Cb.fittedList(ship) : [];
    for (var i = 0; i < list.length; i++) if (list[i].item && list[i].item.kinetic) return true;
    return false;
  }
  function buySlugs(G, tonnes) {
    var s = G.ship, Sm = Sim();
    tonnes = tonnes || 1;
    if (!hasDriver(s)) return { ok: false, why: 'no mass driver fitted to feed' };
    var free = (s.cargoCap || 0) - (Sm && Sm.cargoMass ? Sm.cargoMass(s) : 0);
    if (free < tonnes - 1e-9) return { ok: false, why: 'no room in the hold for ' + tonnes + ' t' };
    var cost = Math.round(SLUG_PRICE_T * tonnes);
    if ((s.credits || 0) < cost) return { ok: false, why: 'not enough credits (' + cost + ' cr)' };
    s.credits -= cost;
    s.cargo = s.cargo || {};
    s.cargo.slugs = (s.cargo.slugs || 0) + tonnes;
    if (Sm && Sm.refreshShip) Sm.refreshShip(s);
    return { ok: true, cost: cost, rounds: roundsAboard(s) };
  }

  var MassDriver = {
    SLUG_SPEED: SLUG_SPEED, SLUG_T: SLUG_T, SLUG_LIFE: SLUG_LIFE,
    SLUG_PRICE_T: SLUG_PRICE_T,
    fire: fire, update: update, lead: lead, roundsAboard: roundsAboard, register: register,
    hasDriver: hasDriver, buySlugs: buySlugs
  };
  global.MassDriver = MassDriver;
  if (typeof module !== 'undefined' && module.exports) module.exports = MassDriver;
})(typeof window !== 'undefined' ? window : globalThis);
