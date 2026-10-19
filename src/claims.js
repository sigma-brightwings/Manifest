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
    /* Somebody else's, beside you: that is theft, and N does it. */
    var theirs = npcNear(G, sys, t);
    if (theirs.length) return steal(G, sys, t, theirs[0]);
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
    /* A stolen drone set down on your own claim is yours now. */
    if (G.ship.hotDrones > 0) G.ship.hotDrones -= 1;
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
    if (!near.length) {
      var theirs = npcNear(G, sys, t);
      if (theirs.length) return pry(G, sys, t, theirs[0]);
      return { ok: false, why: 'no drone here' };
    }
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


  /* ==== OTHER PROSPECTORS (2026-10-18) ===================================
   * Astra: "we should be able to steal from other pilots' mining drones."
   * Answers: take the HOPPER or the DRONE ITSELF; stolen ore is HOT - a
   * scan finds it, Guild halls refuse it, a fence buys it - and the owner
   * reports the theft when they next come round to empty the drone.
   *
   * Their drones are the player's drones with someone else's name on them:
   * timetable records, nothing ticks. They are DERIVED, not generated:
   * hashed off the star's id and each world's id, read lazily and cached
   * per star, so nothing in generate.js changes and no seed fingerprint
   * moves. An owner empties each drone every PERIOD days at a hashed phase;
   * what is in the hopper is the dig since the later of that service and
   * the last time YOU emptied it (G.npcDrones[id] = { baseT, base, gone }).
   */
  var NPC_OWNERS_A = ['Ibarra', 'Halloran', 'Okonkwo', 'Lindqvist', 'Castellan', 'Sato', 'Petrov',
                      'Vashti', 'Brandt', 'Mbeki', 'Quist', 'Delacroix', 'Ferro', 'Amundsen'];
  var NPC_OWNERS_B = ['Ore Co.', 'Prospecting', '& Daughters', 'Mineral Rights', 'Diggings',
                      'Claim & Survey', 'Extraction', 'Brothers'];
  var NPC_PERIOD_MIN = 18, NPC_PERIOD_SPAN = 34;   // days between an owner's visits
  var THEFT_BOUNTY = 900;                          // cr, plus a share of what was taken
  var THEFT_VALUE_SHARE = 0.5;
  var FENCE_ORE = 0.6, FENCE_ORE_SYND = 0.85;      // of the market's sell price
  var FENCE_DRONE = 0.4, FENCE_DRONE_SYND = 0.55;  // of DRONE_PRICE

  var npcCache = {};
  function poss(name) { return /s$/.test(name) ? name + "'" : name + "'s"; }
  function starOf(G) { return (G.here && G.here.id) || 'sys'; }

  function npcDrones(G, sys) {
    var star = starOf(G);
    if (npcCache[star] && npcCache[star].sys === sys) return npcCache[star].list;
    var list = [], S = Sv();
    var ports = (sys && sys.ports) || [];
    if (S && S.deposits && ports.length) {
      (sys.bodies || []).forEach(function (b) {
        if (b.kind !== 'planet' && b.kind !== 'moon') return;
        var rows;
        try { rows = S.deposits(b, sys) || []; } catch (e) { rows = []; }
        rows = rows.filter(function (r) { return r.cid !== 'hydrogen' && r.grade > 0; });
        if (!rows.length) return;
        rows.sort(function (a, c) { return c.grade - a.grade; });
        var h = function (s) { return S.hash01(star + ':pros:' + b.id + ':' + s); };
        var chance = (0.04 + 0.18 * Math.min(1, rows[0].grade)) * (b.habitable ? 0.5 : 1);
        if (h('claim') >= chance) return;
        var owner = NPC_OWNERS_A[Math.floor(h('a') * NPC_OWNERS_A.length)] + ' ' +
                    NPC_OWNERS_B[Math.floor(h('b') * NPC_OWNERS_B.length)];
        var home = ports[Math.floor(h('port') * ports.length)];
        var fac = (home && home.faction) || 'civil';
        var n = 1 + Math.floor(h('n') * 3);
        for (var k = 0; k < n; k++) {
          var pick = rows[(rows.length > 1 && h('pick' + k) < 0.35) ? 1 : 0];
          list.push({
            id: 'npc-' + star + '-' + b.id + '-' + k, npc: true, owner: owner, fac: fac,
            home: home ? home.name : null,
            key: star + ':' + b.id, star: star, body: b.id, name: b.name,
            /* Radians, like every ground point (Sim.surfaceOffset): within 60 deg of the equator. */
            at: { lat: (h('lat' + k) - 0.5) * 2.0944, lon: (h('lon' + k) - 0.5) * 2 * Math.PI, elevation: 0 },
            cid: pick.cid, grade: pick.grade,
            period: (NPC_PERIOD_MIN + h('per' + k) * NPC_PERIOD_SPAN) * DAY,
            phase: h('ph' + k)
          });
        }
      });
    }
    npcCache[star] = { sys: sys, list: list };
    return list;
  }
  function npcState(G, d) { return (G.npcDrones && G.npcDrones[d.id]) || null; }
  function npcLive(G, d, t) { var s = npcState(G, d); return !(s && s.gone !== undefined && s.gone <= t); }
  /* The owner's last visit at or before t. */
  function npcLastService(d, t) {
    var off = d.phase * d.period;
    return Math.floor((t - off) / d.period) * d.period + off;
  }
  function npcNextService(d, t) { return npcLastService(d, t) + d.period; }
  function npcHopper(G, d, t) {
    var rate = DRONE_RATE * d.grade / DAY;
    var svc = npcLastService(d, t), st = npcState(G, d), level;
    if (st && st.baseT > svc) level = (st.base || 0) + rate * (t - st.baseT);
    else level = rate * (t - svc);
    return { tonnes: Math.max(0, Math.min(HOPPER, level)), cid: d.cid, full: level >= HOPPER };
  }
  function npcOn(G, sys, key, t) {
    return npcDrones(G, sys).filter(function (d) { return d.key === key && npcLive(G, d, t); });
  }
  /* The ground point, riding the world's spin like a pad. */
  function groundPos(sys, d, t) {
    var b = sys.byId[d.body], Sim = global.Sim, V = global.V;
    if (!b || !Sim) return null;
    return V.add(Sim.bodyState(b, sys, t).pos, Sim.surfaceOffset(b, d.at, t).pos);
  }
  function npcNear(G, sys, t) {
    var s = G.ship, V = global.V, out = [];
    npcDrones(G, sys).forEach(function (d) {
      if (!npcLive(G, d, t)) return;
      var p = groundPos(sys, d, t);
      if (p && V.dist(p, s.pos) <= NEAR_KM) out.push(d);
    });
    return out;
  }

  /* ---- hot goods --------------------------------------------------------- */
  function hotOf(G, cid) {
    var s = G.ship, h = s && s.hot;
    if (!h || !(h[cid] > 0)) return 0;
    var held = (s.cargo && s.cargo[cid]) || 0;
    if (h[cid] > held) { h[cid] = held; if (!(held > 0)) delete h[cid]; }
    return h[cid] || 0;
  }
  function addHot(G, cid, t) {
    G.ship.hot = G.ship.hot || {};
    G.ship.hot[cid] = (G.ship.hot[cid] || 0) + t;
  }
  /* Selling: take the hot tonnes off the tag as they go. */
  function spendHot(G, cid, t) {
    var h = hotOf(G, cid);
    if (h > 0) { G.ship.hot[cid] = Math.max(0, h - t); if (!G.ship.hot[cid]) delete G.ship.hot[cid]; }
  }
  /* Who will take it: a back room that is not a Guild hall. */
  function isFence(port) {
    var m = port && port.market;
    return !!(m && m.blackMarket && (m.role || m.roleId) !== 'mining');
  }
  /* Where it goes: every system has one (generate.js, a fence in every
   * system). Named, because a back room is not on any board. */
  function fenceIn(sys) {
    var ps = (sys && sys.ports) || [];
    for (var i = 0; i < ps.length; i++) if (isFence(ps[i])) return ps[i];
    return null;
  }
  function fenceOreMult(sys) { return sys && sys.pirateHeld ? FENCE_ORE_SYND : FENCE_ORE; }
  function fenceDronePrice(sys) {
    return Math.round(DRONE_PRICE * (sys && sys.pirateHeld ? FENCE_DRONE_SYND : FENCE_DRONE));
  }

  function logTheft(G, sys, d, t, what, value) {
    G.thefts = G.thefts || [];
    var S = Sv();
    var lag = (0.3 + (S ? S.hash01(d.id + ':rep:' + Math.round(t)) : 0.5) * 1.7) * DAY;
    G.thefts.push({ id: d.id, owner: d.owner, fac: d.fac, star: d.star, world: d.name, what: what,
                    anon: !!(G.ship && G.ship.silent),
                    t: t, value: Math.round(value), reportAt: npcNextService(d, t) + lag, reported: false });
  }
  /* The owner comes round, finds it, and calls it in. Lazy, like the rest. */
  function tickThefts(G, t, hooks) {
    var list = G.thefts;
    if (!list || !list.length) return 0;
    var n = 0;
    for (var i = 0; i < list.length; i++) {
      var f = list[i];
      if (f.reported || t < f.reportAt) continue;
      f.reported = true; n++;
      /* Taken while running silent: nobody knows whose ship it was. */
      if (f.anon) {
        if (hooks && hooks.say) hooks.say(f.owner + ' found their ' + (f.what === 'drone' ? 'drone gone' : 'hopper empty') +
                                          ' on ' + f.world + ' - reported, but nobody logged the ship', 6);
        continue;
      }
      var b = THEFT_BOUNTY + Math.round(f.value * THEFT_VALUE_SHARE);
      G.wanted = G.wanted || {};
      G.wanted[f.fac] = (G.wanted[f.fac] || 0) + b;
      if (hooks && hooks.say) {
        hooks.say(f.owner + ' found their ' + (f.what === 'drone' ? 'drone gone' : 'hopper empty') +
                  ' on ' + f.world + ' - THEFT REPORTED, bounty now ' + Math.round(G.wanted[f.fac]) + ' cr', 7);
      }
      if (hooks && hooks.sound) hooks.sound('warn');
    }
    /* Keep the last few reported ones for the record; drop the rest. */
    if (list.length > 40) G.thefts = list.filter(function (f) { return !f.reported; }).concat(
      list.filter(function (f) { return f.reported; }).slice(-20));
    return n;
  }

  /* N beside someone else's drone: empty its hopper into your hold. */
  function steal(G, sys, t, d) {
    var h = npcHopper(G, d, t);
    var Sim = global.Sim;
    var room = G.ship.cargoCap - (Sim ? Sim.cargoMass(G.ship) : 0);
    var take = Math.max(0, Math.min(Math.floor(h.tonnes), Math.floor(room)));
    var name = (Sv() && Sv().NAMES[d.cid]) || d.cid;
    if (take <= 0) {
      return { ok: false, why: room < 1 ? 'no room in the hold' : poss(d.owner) + ' hopper is empty' };
    }
    G.ship.cargo[d.cid] = (G.ship.cargo[d.cid] || 0) + take;
    addHot(G, d.cid, take);
    if (Sim) Sim.refreshShip(G.ship);
    G.npcDrones = G.npcDrones || {};
    var st = G.npcDrones[d.id] = G.npcDrones[d.id] || {};
    st.base = Math.max(0, h.tonnes - take); st.baseT = t;
    var Eco = global.Economy, base = (Eco && Eco.BY_ID[d.cid]) ? Eco.BY_ID[d.cid].base : 50;
    logTheft(G, sys, d, t, 'hopper', take * base);
    var fz = fenceIn(sys);
    return { ok: true, taken: take, text: take + ' t of ' + name.toLowerCase() + ' out of ' + poss(d.owner) +
             ' drone - HOT: ' + (fz ? 'the back room at ' + fz.name + ' will take it' : 'a fence will take it') +
             ', the Guild will not' };
  }
  /* SHIFT+N beside it: pry the drone loose. Hopper first, same as yours. */
  function pry(G, sys, t, d) {
    var h = npcHopper(G, d, t);
    if (h.tonnes >= 1) return { ok: false, why: 'empty its hopper first (N) - ' + Math.floor(h.tonnes) + ' t in it' };
    if ((G.ship.drones || 0) >= DRONE_MAX) return { ok: false, why: 'racks full - ' + DRONE_MAX + ' aboard' };
    G.npcDrones = G.npcDrones || {};
    var st = G.npcDrones[d.id] = G.npcDrones[d.id] || {};
    st.gone = t;
    G.ship.drones = (G.ship.drones || 0) + 1;
    G.ship.hotDrones = (G.ship.hotDrones || 0) + 1;
    logTheft(G, sys, d, t, 'drone', DRONE_PRICE);
    return { ok: true, text: poss(d.owner) + " drone pried loose and racked - HOT until it is set down or fenced" };
  }
  /* A fence buys a stolen drone. */
  function fenceDrone(G, sys, port) {
    if (!isFence(port)) return { ok: false, why: 'no fence here' };
    if (!(G.ship.hotDrones > 0)) return { ok: false, why: 'no stolen drone aboard' };
    var p = fenceDronePrice(sys);
    G.ship.hotDrones -= 1; G.ship.drones = Math.max(0, (G.ship.drones || 0) - 1);
    G.ship.credits += p;
    return { ok: true, paid: p };
  }

  var Claims = {
    CLAIM_FEE: CLAIM_FEE, CLAIM_DAYS: CLAIM_DAYS, CLAIM_MIN_COV: CLAIM_MIN_COV,
    DRONE_PRICE: DRONE_PRICE, DRONE_MAX: DRONE_MAX, DRONE_RATE: DRONE_RATE, HOPPER: HOPPER, NEAR_KM: NEAR_KM,
    claimFor: claimFor, claimable: claimable, fileClaim: fileClaim,
    stripRate: stripRate, lastStripBefore: lastStripBefore, hopper: hopper,
    dronesNear: dronesNear, landedWorld: landedWorld,
    act: act, deploy: deploy, collect: collect, recover: recover, buyDrone: buyDrone, keyOf: keyOf,
    npcDrones: npcDrones, npcOn: npcOn, npcNear: npcNear, npcHopper: npcHopper, npcLive: npcLive,
    npcLastService: npcLastService, npcNextService: npcNextService, groundPos: groundPos,
    steal: steal, pry: pry, fenceDrone: fenceDrone, tickThefts: tickThefts,
    hotOf: hotOf, addHot: addHot, spendHot: spendHot, isFence: isFence,
    fenceOreMult: fenceOreMult, fenceIn: fenceIn, fenceDronePrice: fenceDronePrice,
    THEFT_BOUNTY: THEFT_BOUNTY, FENCE_ORE: FENCE_ORE, FENCE_ORE_SYND: FENCE_ORE_SYND
  };
  global.Claims = Claims;
  if (typeof module !== 'undefined' && module.exports) module.exports = Claims;
})(typeof window !== 'undefined' ? window : globalThis);
