/* claims.js — mining claims and the drones that work them.
 *
 * Rung 2 of the mining ladder (claude/mining-and-survey.md). Agreed with
 * Astra, 2026-10-15: "drones need a claim, not a license. Stations need a
 * license." So:
 *
 *   A CLAIM is filed at any desk in the system, with the Mining Guild, on a
 *   world you have surveyed - at least a quarter of it, because the Guild
 *   files claims on ground somebody has looked at. It says whose ground it
 *   is, for a year, and can be renewed.
 *
 *   A DRONE is bought at a desk, carried, and set down by LANDING on your
 *   claim (N). It digs the richest thing the survey found under it. It is a
 *   timetable entry, not an agent: what is in its hopper is a pure function
 *   of the clock - the deposit's grade times a dig rate since it was last
 *   emptied, capped by the hopper - so nothing ticks, nothing drifts, and
 *   skipping six months gives the right answer.
 *
 *   STRIPPING is read off the system, not invented: a drone left alone is
 *   emptied by somebody else at a rate set by the system's crime score.
 *   The times it happens are fixed the moment it is set down (hashed off
 *   the drone's id), so they are the same however you get there.
 *
 *   Every tonne collected goes into G.extracted, so a fresh survey of a
 *   worked claim shows it.
 *
 * Balance (the doc's rule: a drone pays well under an active run): a rich
 * rare-metal claim fills a 30 t hopper in about three months, about 19k
 * of metal; ordinary ore, a few thousand. A milfuel run clears 30-72k.
 */
(function (global) {
  'use strict';

  var CLAIM_FEE = 1200;            // cr, per year
  var CLAIM_DAYS = 365;
  var CLAIM_MIN_COV = 0.25;        // of the world surveyed before the Guild files it
  var DRONE_PRICE = 9500;
  var DRONE_MAX = 2;               // carried at once
  var DRONE_RATE = 0.45;           // t/day per unit of grade
  var HOPPER = 30;                 // t
  var NEAR_KM = 40;                // close enough to service a drone from the ground
  var DAY = 86400;

  function Sv() { return global.Survey; }
  function keyOf(G, bodyId) { return ((G.here && G.here.id) || 'sys') + ':' + bodyId; }

  /* ---- claims ------------------------------------------------------------ */
  function claimFor(G, key, t) {
    var c = G.claims && G.claims[key];
    return (c && t <= c.until) ? c : null;
  }
  function claimable(G, sys, body, t) {
    if (!body || (body.kind !== 'planet' && body.kind !== 'moon')) return { ok: false, why: 'lock a planet or moon' };
    var key = keyOf(G, body.id);
    var rec = G.surveys && G.surveys[key];
    if (!rec || rec.cov < CLAIM_MIN_COV) {
      return { ok: false, why: 'survey at least ' + Math.round(CLAIM_MIN_COV * 100) + '% of ' + body.name + ' first' };
    }
    var live = claimFor(G, key, t);
    return { ok: true, key: key, fee: CLAIM_FEE, renew: !!live,
             why: live ? 'renew to ' + Math.round((live.until + CLAIM_DAYS * DAY - t) / DAY) + ' days' : null };
  }
  function fileClaim(G, sys, body, t) {
    var c = claimable(G, sys, body, t);
    if (!c.ok) return c;
    if (!G.ship || G.ship.credits < CLAIM_FEE) return { ok: false, why: 'the fee is ' + CLAIM_FEE + ' cr' };
    G.ship.credits -= CLAIM_FEE;
    G.claims = G.claims || {};
    var prev = claimFor(G, c.key, t);
    /* Refiling a LAPSED claim: drones there dug nothing in the gap, so
     * settle each at what it held when the old claim ran out. */
    if (!prev && G.claims[c.key]) {
      (G.drones || []).forEach(function (d) {
        if (d.key !== c.key) return;
        d.base = hopper(G, d, t).tonnes; d.baseT = t;
      });
    }
    G.claims[c.key] = { key: c.key, star: (G.here && G.here.id) || null, body: body.id, name: body.name,
                        t: prev ? prev.t : t, until: (prev ? prev.until : t) + CLAIM_DAYS * DAY };
    return { ok: true, claim: G.claims[c.key], renewed: !!prev };
  }

  /* ---- drones ------------------------------------------------------------ */
  function hash01(s) { return Sv() ? Sv().hash01(s) : 0.5; }

  /* Strips per day, off the system's crime score (0..100). */
  function stripRate(sys) {
    var c = (sys && sys.crimeScore !== undefined) ? sys.crimeScore : 40;
    var k = Math.max(0, Math.min(100, c)) / 100;
    return 0.002 + k * k * 0.03;
  }
  /* The strip times after `from`, closed form: an exponential gap per strip,
   * each drawn from the drone's own hash. The last one at or before `t`. */
  function lastStripBefore(d, t) {
    var lam = d.stripRate || 0.005;
    var s = d.t0, k = 0, last = null;
    while (k < 2000) {
      var u = Math.max(1e-9, hash01(d.id + ':strip:' + k));
      s += (-Math.log(u) / lam) * DAY;
      if (s > t) break;
      last = s; k++;
    }
    return last;
  }

  /* What is in the hopper at time t, and why. */
  function hopper(G, d, t) {
    var claim = claimFor(G, d.key, Math.min(t, d.baseT)) || (G.claims && G.claims[d.key]);
    var until = claim ? claim.until : d.baseT;
    var tEff = Math.min(t, until);
    var rate = DRONE_RATE * d.grade / DAY;
    /* A lapsed claim stops the digging, not the thieves. */
    var s = lastStripBefore(d, t), level, stripped = false;
    if (s !== null && s > d.baseT) { level = rate * Math.max(0, tEff - s); stripped = true; }
    else level = (d.base || 0) + rate * Math.max(0, tEff - d.baseT);
    return { tonnes: Math.min(HOPPER, level), cid: d.cid, stripped: stripped, strippedAt: stripped ? s : null,
             lapsed: t > until, full: level >= HOPPER };
  }

  function landedWorld(G, sys) {
    var s = G.ship;
    if (!s || !s.landed || s.crashed || !s.landedAt) return null;
    return sys.byId[s.landedAt.body] || null;
  }
  function dronesNear(G, sys, t) {
    var out = [], V = global.V, s = G.ship, Sim = global.Sim;
    (G.drones || []).forEach(function (d) {
      if (d.star !== ((G.here && G.here.id) || 'sys')) return;
      var b = sys.byId[d.body];
      if (!b || !Sim) return;
      var hs = Sim.bodyState(b, sys, t);
      /* The drone's ground point, riding the world's spin like a pad. */
      var p = V.add(hs.pos, Sim.surfaceOffset(b, d.at, t).pos);
      if (V.dist(p, s.pos) <= NEAR_KM) out.push(d);
    });
    return out;
  }

  /* N, on the ground: collect from a drone beside you, else set one down. */
  function act(G, sys, t) {
    var world = landedWorld(G, sys);
    if (!world) return { ok: false, why: 'land on your claim first' };
    var near = dronesNear(G, sys, t);
    if (near.length) return collect(G, sys, t, near[0]);
    return deploy(G, sys, t, world);
  }

  function deploy(G, sys, t, world) {
    var key = keyOf(G, world.id);
    if (!claimFor(G, key, t)) return { ok: false, why: 'no live claim on ' + world.name + ' - file one at any desk' };
    if (!(G.ship.drones > 0)) return { ok: false, why: 'no drones aboard - the desk sells them' };
    var rows = Sv().remaining(G, key, Sv().deposits(world, sys)).filter(function (r) {
      return r.cid !== 'hydrogen' && (r.tonnes > 0 || !isFinite(r.tonnes));
    });
    if (!rows.length) return { ok: false, why: 'nothing here a drone can dig' };
    var Eco = global.Economy;
    rows.sort(function (a, b) {
      var va = a.grade * (Eco && Eco.BY_ID[a.cid] ? Eco.BY_ID[a.cid].base : 1);
      var vb = b.grade * (Eco && Eco.BY_ID[b.cid] ? Eco.BY_ID[b.cid].base : 1);
      return vb - va;
    });
    var best = rows[0];
    G.drones = G.drones || [];
    var id = 'drone-' + key + '-' + Math.round(t);
    var d = { id: id, key: key, star: (G.here && G.here.id) || 'sys', body: world.id, name: world.name,
              at: { lat: G.ship.landedAt.lat, lon: G.ship.landedAt.lon, elevation: 0 },
              cid: best.cid, grade: best.grade, t0: t, baseT: t, base: 0, stripRate: stripRate(sys) };
    G.drones.push(d);
    G.ship.drones -= 1;
    return { ok: true, drone: d, text: 'Drone down on ' + world.name + ' - digging ' + best.name.toLowerCase() +
             ' (' + Sv().gradeWord(best.grade).toLowerCase() + ')' };
  }

  function collect(G, sys, t, d) {
    var h = hopper(G, d, t);
    var Sim = global.Sim;
    var room = G.ship.cargoCap - (Sim ? Sim.cargoMass(G.ship) : 0);
    var take = Math.max(0, Math.min(Math.floor(h.tonnes), Math.floor(room)));
    var note = h.stripped ? 'someone emptied it on ' + (d.name) + ' while you were away; ' : '';
    if (take > 0) {
      G.ship.cargo[d.cid] = (G.ship.cargo[d.cid] || 0) + take;
      if (Sim) Sim.refreshShip(G.ship);
      G.extracted = G.extracted || {};
      var ex = G.extracted[d.key] = G.extracted[d.key] || {};
      ex[d.cid] = (ex[d.cid] || 0) + take;
    }
    d.base = Math.max(0, h.tonnes - take);
    d.baseT = Math.min(t, (G.claims && G.claims[d.key]) ? G.claims[d.key].until : t);
    var name = Sv() ? Sv().NAMES[d.cid] : d.cid;
    return { ok: take > 0, taken: take, left: d.base,
             text: take > 0 ? note + take + ' t of ' + name.toLowerCase() + ' aboard' +
                              (d.base >= 1 ? ' - ' + Math.floor(d.base) + ' t left, no room' : '')
                            : note + (room < 1 ? 'no room in the hold' : 'hopper empty') };
  }

  /* Pick a drone back up (shift+N beside it): it comes back aboard, its
   * hopper with it if there is room. */
  function recover(G, sys, t) {
    var near = dronesNear(G, sys, t);
    if (!near.length) return { ok: false, why: 'no drone of yours here' };
    var d = near[0];
    var got = collect(G, sys, t, d);
    if (d.base >= 1) return { ok: false, why: 'empty the hopper first - ' + Math.floor(d.base) + ' t still in it' };
    G.drones = G.drones.filter(function (x) { return x !== d; });
    G.ship.drones = (G.ship.drones || 0) + 1;
    return { ok: true, text: (got.taken ? got.text + '; ' : '') + 'drone back aboard' };
  }

  function buyDrone(G) {
    if (!G.ship) return { ok: false };
    if ((G.ship.drones || 0) >= DRONE_MAX) return { ok: false, why: 'racks full - ' + DRONE_MAX + ' aboard' };
    if (G.ship.credits < DRONE_PRICE) return { ok: false, why: DRONE_PRICE + ' cr' };
    G.ship.credits -= DRONE_PRICE;
    G.ship.drones = (G.ship.drones || 0) + 1;
    return { ok: true };
  }

  var Claims = {
    CLAIM_FEE: CLAIM_FEE, CLAIM_DAYS: CLAIM_DAYS, CLAIM_MIN_COV: CLAIM_MIN_COV,
    DRONE_PRICE: DRONE_PRICE, DRONE_MAX: DRONE_MAX, DRONE_RATE: DRONE_RATE, HOPPER: HOPPER, NEAR_KM: NEAR_KM,
    claimFor: claimFor, claimable: claimable, fileClaim: fileClaim,
    stripRate: stripRate, lastStripBefore: lastStripBefore, hopper: hopper,
    dronesNear: dronesNear, landedWorld: landedWorld,
    act: act, deploy: deploy, collect: collect, recover: recover, buyDrone: buyDrone, keyOf: keyOf
  };
  global.Claims = Claims;
  if (typeof module !== 'undefined' && module.exports) module.exports = Claims;
})(typeof window !== 'undefined' ? window : globalThis);
