/* upkeep.js — what other ships have in their tanks and their purses, and
 * the ones that run dry (2026-10-30).
 *
 * Astra: "how expensive would it be to track her money and fuel? Having
 * other ships in need of fuel can give us a reason to buy a rescue tender
 * for ourselves." Then: "yes."
 *
 * THE TIMETABLE IS THE TRUTH, so none of this is simulated. Every scheduled
 * ship is a pure function of t (Sim.trafficState) and so is everything
 * here: her reaction mass from where she is on her leg, her purse from how
 * many legs she has flown since she last settled with her owners, and
 * whether this leg is the one where her tank lets go. Nothing ticks,
 * nothing is saved for a ship you have never dealt with, and a system you
 * skip a month in is exactly where it would have been.
 *
 * What IS saved is what you did: mass you passed across, money that changed
 * hands, the leg you pulled her out of. That is `G.npcLedger`, keyed by
 * route id, small, and only for ships you have touched.
 *
 * A BREAKDOWN, start to finish:
 *   - early on a leg (8-22% of the way) her reaction-mass tank lets go;
 *   - she spends what is left in her lines going into orbit where she is,
 *     about the body her run is about, and coasts from there under
 *     gravity alone, tumbling slowly, calling a mayday;
 *   - the port she was bound for sends a tug, which arrives 12-48 hours
 *     later but always before her next departure; from then she is in
 *     that berth, and the timetable carries on as if nothing happened;
 *   - unless you get there first and pass her enough mass to limp in. Then
 *     she pays what she can, owes you the rest, and flies herself home.
 *   A leg too short for a drift worth the name, or one whose leak comes so
 *   low over a body that no orbit there clears it, does not break.
 *
 *   tankOf(route)                     her reaction-mass tank, tonnes
 *   needOf(route)                     what gets her home from a dry tank
 *   failure(route, sys, leg)          null, or { leg, u, at, towAt, ... }
 *   stranded(route, sys, t)           null, or { adrift, state | towed }
 *   fuelAt(route, sys, t, G)          { t, frac, tank, leaking }
 *   purseAt(route, sys, t, G)         credits aboard
 *   transfer(G, sys, t, route, hooks) your reaction mass into her tank
 *   updateCalls(G, sys, t)            her mayday on the band while adrift
 *
 * Plain IIFE on `global`, `module.exports` for the tests. */
(function (global) {
  'use strict';

  /* Modules by name, with the require fallback the rest of src/ uses for a
   * browser-shaped test harness (globals on `window`, not node's global).
   * Resolved at call time: sim.js calls in here and this calls back. */
  var MODS = { V: './vec3.js', Kepler: './kepler.js', RNG: './rng.js', Sim: './sim.js',
               Gen: './generate.js', Economy: './economy.js', Combat: './combat.js' };
  function mod(name) {
    if (global[name]) return global[name];
    if (typeof require !== 'undefined' && MODS[name]) {
      try { return require(MODS[name]); } catch (e) { return null; }
    }
    return null;
  }

  /* ONE LEG IN EIGHTY. A system of twenty scheduled ships flies something
   * like twenty legs a day, so that is a ship adrift somewhere in it every
   * few days — often enough that a tender has work, rare enough that a
   * lane is not a breakers' yard. Tunable here and nowhere else. */
  var BREAK_P = 1 / 80;
  /* Where the tank goes: early on the leg, while she is still near home,
   * which is when a leak shows. */
  var BREAK_U = [0.08, 0.22];
  /* How long she drifts before the tug reaches her, capped so she is in
   * her berth before the timetable has her leave it again. A run too short
   * to leave three hours of drift does not break at all. */
  var WAIT_S = [12 * 3600, 48 * 3600];
  var WAIT_MIN = 3 * 3600;
  var WAIT_SHARE = 0.8;            // of the time to her next departure, at most
  var BURN_PER_LEG = 0.4;          // of her tank, departure to arrival
  var REFUEL_SHARE = 0.1;          // of her layover, to fill back up
  var NEED_SHARE = 0.15;           // of her tank, to limp home from dry
  var NEED_MIN = 4;                // tonnes, however small she is
  var SETTLE_LEGS = 6;             // she remits to her owners this often
  var MARGIN = 0.05;               // her cut of what she carries, per leg
  var PURSE_BASE = { shuttle: 2500, hauler: 6000, freighter: 16000, tanker: 22000, liner: 30000 };

  function hash(s) { var R = mod('RNG'); return R && R.hashString ? R.hashString(s) : 0; }
  function unit(s) { return (hash(s) % 100003) / 100003; }

  /* The hull her class is flown as (combat.js), for her tank. The first
   * hull drawn as her class is the one generate.js's CLASS_HOLD measures. */
  var _hullOf = {};
  function hullOf(cls) {
    if (cls in _hullOf) return _hullOf[cls];
    var C = mod('Combat'), H = C && C.HULLS, out = null;
    if (H) for (var k in H) if (H[k].mesh === cls) { out = H[k]; break; }
    return (_hullOf[cls] = out);
  }
  /* Her tank grows with her as her hold does (generate.js holdCapacity):
   * her hull's, times the square of how much longer she is than it. */
  function tankOf(route) {
    var h = hullOf(route.cls);
    var cap = (h && h.thrusterCap) || 20;
    var Gen = mod('Gen'), row = Gen && Gen.CLASS_HOLD && Gen.CLASS_HOLD[route.cls];
    var k = row ? Math.max(1, (route.size * 1000) / row.len) : 1;
    return cap * k * k;
  }
  function needOf(route) { return Math.max(NEED_MIN, tankOf(route) * NEED_SHARE); }

  /* Which leg of her timetable t is in, and how far along. The same
   * arithmetic as Sim.trafficState's phases. */
  function legAt(route, t) {
    var period = route.period, cruise = route.cruise, lay = route.layover;
    var cycle = Math.floor((t - route.t0) / period);
    var start = route.t0 + cycle * period, ph = t - start;
    if (ph < cruise) return { leg: cycle * 2, u: ph / cruise, moored: false, tDep: start };
    if (ph < cruise + lay) return { leg: cycle * 2, u: 1, moored: true, sinceArrive: ph - cruise, tDep: start };
    var t1 = start + cruise + lay;
    if (ph < 2 * cruise + lay) return { leg: cycle * 2 + 1, u: (ph - cruise - lay) / cruise, moored: false, tDep: t1 };
    return { leg: cycle * 2 + 1, u: 1, moored: true, sinceArrive: ph - 2 * cruise - lay, tDep: t1 };
  }

  /* Breakdowns are for the scheduled runs you can see and find: the five
   * trading classes, not the feeder swarm (a dozen a dock), not the heavies
   * at anchor, not a fleet ship of yours under orders, not a one-way leg. */
  function eligible(route) {
    var Gen = mod('Gen');
    return !!(route && !route.feeder && !route.heavy && !route.oneWay && route.kind !== 'fleet' &&
              route.period > 0 && route.cruise > 0 &&
              Gen && Gen.CLASS_HOLD && Gen.CLASS_HOLD[route.cls]);
  }

  function seedOf(sys) { return String((sys && (sys.seed || sys.seedHash || sys.id)) || ''); }

  /* The roll alone, before geometry: a pure hash of (seed, route, leg). */
  function roll(route, leg, seed) {
    var key = 'upkeep|' + seed + '|' + route.id + '|' + leg;
    if (unit(key + '|roll') >= BREAK_P) return null;
    return { u: BREAK_U[0] + (BREAK_U[1] - BREAK_U[0]) * unit(key + '|u'),
             wait: WAIT_S[0] + (WAIT_S[1] - WAIT_S[0]) * unit(key + '|wait') };
  }

  /* Does this leg break, and if so when, and for how long? The roll, then
   * the two things that can veto it: no room before her next departure,
   * and a drift with no rescue in it (into the planet, or out of the
   * system's grip altogether). Cached on the route per leg, because
   * trafficState asks every frame. */
  function failure(route, sys, leg) {
    if (!eligible(route)) return null;
    var seed = seedOf(sys), c = route._fail;
    if (c && c.leg === leg && c.seed === seed) return c.bd;
    var bd = null, r = roll(route, leg, seed);
    if (r) {
      var cycle = Math.floor(leg / 2), start = route.t0 + cycle * route.period;
      var tDep = leg % 2 === 0 ? start : start + route.cruise + route.layover;
      var tFail = tDep + r.u * route.cruise;
      var legEnd = tDep + route.cruise, nextDep = legEnd + route.layover;
      var wait = Math.min(r.wait, (nextDep - tFail) * WAIT_SHARE);
      if (wait >= WAIT_MIN) {
        var drift = driftOrbit(route, sys, tFail);
        if (drift) bd = { leg: leg, u: r.u, at: tFail, towAt: tFail + wait, legEnd: legEnd,
                          outbound: leg % 2 === 0, drift: drift };
      }
    }
    route._fail = { leg: leg, seed: seed, bd: bd };
    return bd;
  }

  /* Pulled out of it, by you, on that leg (G.npcLedger, put back on the
   * route by applyLedger): the leg flies as the timetable says. */
  function rescued(route, leg) {
    return !!(route && route.rescuedLegs && route.rescuedLegs[leg]);
  }

  /* Where she coasts from the leak. NOT the rail's velocity carried on:
   * traffic flies hard, and the survey said so — at the moment of a leak
   * three ships in four are either faster than the body's escape speed or
   * on a line into it (2026-10-30, 311 legs). A crew whose tank is going
   * spends what is still in the lines on the one burn that keeps them
   * findable: into a circular orbit, where they are, in the plane they
   * were flying in. So the drift starts exactly where the timetable had
   * her and is always a story with a rescue in it. Null only for a leak
   * so low over the body that no orbit there clears it. */
  var ORBIT_FLOOR = 1.12;          // body radii — clear of the air
  function driftOrbit(route, sys, tFail) {
    var V = mod('V'), K = mod('Kepler'), S = mod('Sim');
    var parent = sys.byId && sys.byId[route.parentId];
    if (!parent || !parent.mu || !K || !S || !S.trafficCore) return null;
    var s0 = S.trafficCore(route, sys, tFail);
    var ps = S.bodyState(parent, sys, tFail);
    var rel = V.sub(s0.pos, ps.pos), relV = V.sub(s0.vel, ps.vel);
    var r = V.len(rel);
    if (!(r > (parent.radius || 0) * ORBIT_FLOOR)) return null;
    var n = V.cross(rel, relV);
    if (V.len(n) < 1e-9 * r) n = Math.abs(rel.z) < 0.9 * r ? V.cross(rel, { x: 0, y: 0, z: 1 }) : V.cross(rel, { x: 1, y: 0, z: 0 });
    var along = V.norm(V.cross(V.norm(n), rel));
    var vc = V.scale(along, Math.sqrt(parent.mu / r));
    var el = K.elementsFromState(rel, vc, parent.mu);
    if (!el || !el.closed) return null;
    return { s0: s0, parent: parent, tFail: tFail,
             el: { a: el.a, e: el.e, inc: el.inc, lan: el.lan, argp: el.argp, m0: el.m } };
  }

  function driftState(bd, sys, t) {
    var V = mod('V'), K = mod('Kepler'), S = mod('Sim');
    var d = bd.drift, dt = t - d.tFail;
    var ps = S.bodyState(d.parent, sys, t);
    var st = K.state(d.el, d.parent.mu, dt);
    var s = {};
    for (var k in d.s0) s[k] = d.s0[k];
    s.pos = V.add(ps.pos, st.pos); s.vel = V.add(ps.vel, st.vel);
    s.phase = 'adrift'; s.adrift = true; s.throttle = 0; s.braking = false; s.landing = 0;
    /* Tumbling, slowly, the way a dead hull does: a turn every half hour
     * or so about her own beam. */
    var a = dt * 0.0035, c = Math.cos(a), sn = Math.sin(a);
    var f0 = d.s0.fwd, u0 = d.s0.up;
    s.fwd = V.norm(V.add(V.scale(f0, c), V.scale(u0, sn)));
    s.up = V.norm(V.sub(V.scale(u0, c), V.scale(f0, sn)));
    s.right = V.cross(s.fwd, s.up);
    return s;
  }

  /* Is she adrift at t? Called by Sim.trafficState for every eligible
   * route; null for a ship flying (or moored) as scheduled. A breakdown on
   * a leg only touches the time from the leak to the tug, and on to the
   * end of that leg if the tug is quicker than the timetable: adrift until
   * the tug reaches her, then in the berth she was bound for until the
   * timetable has her there anyway. The tug may come after the leg's
   * scheduled end — into the layover, never past her next departure — and
   * legAt counts the layover as the leg's, so it is found either way. */
  function stranded(route, sys, t) {
    if (!eligible(route)) return null;
    var at = legAt(route, t);
    if (rescued(route, at.leg)) return null;
    var bd = failure(route, sys, at.leg);
    if (!bd || t < bd.at) return null;
    if (t < bd.towAt) return { adrift: true, leg: bd.leg, at: bd.at, towAt: bd.towAt, outbound: bd.outbound,
                               state: driftState(bd, sys, t) };
    if (t < towedUntil(route, sys, bd)) return { adrift: false, towed: true, leg: bd.leg, at: bd.at, towAt: bd.towAt, outbound: bd.outbound };
    return null;
  }

  /* TOWED IN IS DOWN (2026-11-03). Until today the tow ended at the leg's
   * scheduled end, which at a ground port is not her berthing but her
   * arrival in the holding stack (Sim.arrivalHold): so a hull the tug had
   * set on the pad lifted off it, sat in the roads, and flew the final
   * descent back onto it. Found when a towed freighter turned up two to a
   * dome at a sea platform (seaplatform.test, after stars stage 2). She now
   * stays where the tug left her until the timetable has her berthed. */
  function towedUntil(route, sys, bd) {
    var S = mod('Sim');
    var dst = sys && sys.byId ? sys.byId[bd.outbound ? route.to : route.from] : null;
    var hold = (S && S.arrivalHold && dst) ? S.arrivalHold(route, dst) : 0;
    return bd.legEnd + (hold > 0 ? hold + S.FINAL_DESCENT_S : 0);
  }

  /* The breakdown that actually happens on a leg: none if you pulled her
   * out of it. For the closed-form readers of the timetable that do not go
   * through trafficState (rumours.js berthTime): a leg that broke ends at
   * the tug, not at the timetable's arrival. */
  function breakOn(route, sys, leg) {
    if (!eligible(route) || rescued(route, leg)) return null;
    return failure(route, sys, leg);
  }

  /* Keyed by system as well as route: route ids ('r1', 'r2') are only
   * unique inside the system that generated them. */
  function ledgerKey(sys, route) { return seedOf(sys) + '|' + route.id; }
  function ledgerOf(G, sys, route) {
    return G && G.npcLedger && route ? G.npcLedger[ledgerKey(sys, route)] || null : null;
  }
  function ledgerFor(G, sys, route) {
    if (!G.npcLedger) G.npcLedger = {};
    var k = ledgerKey(sys, route);
    return G.npcLedger[k] || (G.npcLedger[k] = {});
  }

  /* Reaction mass aboard at t. Full when she leaves; a share of the tank
   * burnt by the time she arrives; filled back up early in her layover; and
   * on a leg that broke, gone from the moment the tank let go — less what
   * you have passed across since. */
  function fuelAt(route, sys, t, G) {
    var tank = tankOf(route), at = legAt(route, t), frac;
    if (at.moored) {
      var lay = route.layover || 1;
      var refill = Math.min(1, at.sinceArrive / Math.max(60, lay * REFUEL_SHARE));
      frac = (1 - BURN_PER_LEG) + BURN_PER_LEG * refill;
    } else {
      frac = 1 - BURN_PER_LEG * at.u;
    }
    var leaking = false;
    var sd = stranded(route, sys, t);
    if (sd && sd.adrift) {
      var led = ledgerOf(G, sys, route);
      var banked = led && led.fuelLeg === sd.leg ? led.fuelT || 0 : 0;
      frac = Math.min(1, banked / tank);
      leaking = true;
    } else if (sd && sd.towed) {
      frac = 0;                       // in her berth, waiting on the bowser
    }
    return { t: tank * frac, frac: frac, tank: tank, leaking: leaking };
  }

  /* Her cut of a leg: a share of what her manifests are worth at base
   * prices. An estimate, honestly one; no market is run for it. */
  function legMargin(route) {
    var E = mod('Economy'), sum = 0;
    [route.out, route.back].forEach(function (man) {
      for (var i = 0; man && i < man.length; i++) {
        var c = E && E.BY_ID ? E.BY_ID[man[i].cid] : null;
        var v = c ? c.base : 50;
        sum += (man[i].qty > 0 ? man[i].qty : 0) * Math.abs(v);
      }
    });
    return sum / 2 * MARGIN;
  }

  /* Credits aboard at t: her float, plus what she has earned since she
   * last settled with her owners, less whatever has left her since —
   * paid to you for a rescue, or taken at gunpoint. Those last only until
   * she next settles: her owners top her float back up then, which is
   * also when what she earned goes to them. So a ship robbed this week is
   * worth robbing again next month, and short of money until then. */
  function legsDoneAt(route, t) {
    var at = legAt(route, t);
    return Math.max(0, at.leg + (at.moored ? 1 : 0));
  }
  function nextSettle(legs) { return (Math.floor(legs / SETTLE_LEGS) + 1) * SETTLE_LEGS; }
  function debitsNow(led, legs) {
    var sum = 0;
    if (led && led.debits) for (var i = 0; i < led.debits.length; i++) {
      if (legs < led.debits[i].until) sum += led.debits[i].amt;
    }
    return sum;
  }
  function purseAt(route, sys, t, G) {
    var base = (PURSE_BASE[route.cls] || 4000) * (0.6 + 0.8 * unit('purse|' + seedOf(sys) + '|' + route.id));
    var legsDone = legsDoneAt(route, t);
    var earned = legMargin(route) * (legsDone % SETTLE_LEGS);
    var led = ledgerOf(G, sys, route);
    return Math.max(0, Math.round(base + earned + (led && led.cash ? led.cash : 0) - debitsNow(led, legsDone)));
  }
  /* Money leaving her purse, until her next settling. Old debits that have
   * lapsed are dropped as new ones come in, so the ledger stays small. */
  function debit(G, sys, t, route, amt) {
    if (!(amt > 0)) return;
    var led = ledgerFor(G, sys, route), legs = legsDoneAt(route, t);
    led.debits = (led.debits || []).filter(function (d) { return legs < d.until; });
    led.debits.push({ amt: Math.round(amt), until: nextSettle(legs) });
  }

  /* WHAT A GUN GETS YOU (2026-10-30). Astra: "give the option to take more
   * than a shakedown, but not everything, because that would mean they
   * have nothing to get to port." One purse, the one her screen shows, and
   * two ways into it:
   *   - the CASH BOX: what is aboard in cash, a tenth of her purse. Once
   *     a leg: emptied, it is empty until she is next in port.
   *   - her ACCOUNT: a transfer of everything above what she needs to make
   *     port — her reaction mass for the rest of a leg at hydrogen's price,
   *     and her berth. A crew will hand over the rest; they will not hand
   *     over the means of getting home.
   * Both come off the purse until she next settles with her owners. */
  var CASHBOX_SHARE = 0.1;
  var BERTH_FEE = 300;
  function floorOf(route) {
    var E = mod('Economy'), h = E && E.BY_ID ? E.BY_ID.hydrogen : null;
    return Math.round(tankOf(route) * BURN_PER_LEG * (h ? h.base : 55) + BERTH_FEE);
  }
  function cashBox(route, sys, t, G) {
    var led = ledgerOf(G, sys, route), at = legAt(route, t);
    if (led && led.cashBoxLeg === at.leg) return 0;
    return Math.round(purseAt(route, sys, t, G) * CASHBOX_SHARE);
  }
  function accountTake(route, sys, t, G) {
    return Math.max(0, purseAt(route, sys, t, G) - floorOf(route));
  }
  /* Take it: 'cash' or 'account'. Returns what changed hands. */
  function rob(G, sys, t, route, how) {
    var amt = how === 'account' ? accountTake(route, sys, t, G) : cashBox(route, sys, t, G);
    if (!(amt > 0)) return 0;
    debit(G, sys, t, route, amt);
    var led = ledgerFor(G, sys, route);
    /* The account transfer empties the cash box too: it is all one purse,
     * and what is left aboard is what she needs to make port. */
    led.cashBoxLeg = legAt(route, t).leg;
    return amt;
  }

  /* Put the saved rescues back on the routes: after a load, or on coming
   * back to a system you have touched before. Cheap; called with the calls. */
  function applyLedger(G, sys) {
    var L = G && G.npcLedger;
    if (!L || !sys || !sys.traffic) return;
    for (var i = 0; i < sys.traffic.length; i++) {
      var r = sys.traffic[i], e = L[ledgerKey(sys, r)];
      if (e && e.rescued && r.rescuedLegs !== e.rescued) r.rescuedLegs = e.rescued;
    }
  }

  var TRANSFER_KMS = 0.1;          // km/s — matched closely enough to hold a line
  var TRANSFER_RESERVE = 2;        // tonnes of your own you keep, whatever she needs
  var TRANSFER_PREMIUM = 1.5;      // over hydrogen's base, for coming out
  var CALL_OUT = 400;              // credits, for the trip
  function transferKm() { var F = global.Favours; return (F && F.MASS_RANGE) || 50; }

  /* What you could pass her right now: hydrogen in your hold first (that
   * is what a tender carries it as), then your own tank above a reserve. */
  function spareOf(ship) {
    var hold = (ship.cargo && ship.cargo.hydrogen) || 0;
    var tank = Math.max(0, (ship.thrusterFuel || 0) - TRANSFER_RESERVE);
    return { hold: hold, tank: tank, total: hold + tank };
  }

  /* YOUR REACTION MASS INTO HER TANK. Within a line's reach and matched;
   * she takes what she still needs to limp home, a little at a time if
   * that is all you have — it is banked against this leg, so a second trip
   * finishes the job. When she has enough she pays what she can from her
   * purse at a premium for the trip, owes you besides, and lights up:
   * lifted off her timetable and flown home (Combat.liftTrader, mode
   * breakoff), back on it once she is out of sight, with this leg marked
   * as one she was pulled out of. */
  /* The captain's log on the F5 NOTES tab (journal.js), when it is loaded.
   * Required directly under node, where the tests may not have loaded it. */
  function jot(G, kind, text) {
    var J = global.Journal;
    if (!J && typeof require !== 'undefined') { try { J = require('./journal.js'); } catch (e) { J = null; } }
    if (J && G) J.add(G, kind, text);
  }

  function transfer(G, sys, t, route, hooks) {
    var V = mod('V'), C = mod('Combat');
    function say(m, s) { if (hooks && hooks.say) hooks.say(m, s || 7); }
    var sd = stranded(route, sys, t);
    if (!sd || !sd.adrift) return { ok: false, why: 'she is not adrift' };
    var her = herNow(route, sys, sd), me = G.ship;
    var d = V.dist(her.pos, me.pos), rel = V.dist(her.vel, me.vel), R = transferKm();
    if (d > R) return { ok: false, why: 'come within ' + R + ' km to pass a line (' + fmtKm(d) + ')' };
    if (rel > TRANSFER_KMS) return { ok: false, why: 'match her drift first (' + Math.round(rel * 1000) + ' m/s)' };
    var led = ledgerFor(G, sys, route);
    if (led.fuelLeg !== sd.leg) { led.fuelLeg = sd.leg; led.fuelT = 0; led.owed = 0; }
    var need = needOf(route), still = Math.max(0, need - led.fuelT);
    var sp = spareOf(me);
    if (!(sp.total > 0.25)) return { ok: false, why: 'nothing to spare — your hold has no hydrogen and your tank is at its reserve' };
    var give = Math.min(still, sp.total);
    var fromHold = Math.min(give, sp.hold), fromTank = give - fromHold;
    if (fromHold > 0) {
      me.cargo.hydrogen -= fromHold;
      if (me.cargo.hydrogen <= 1e-6) delete me.cargo.hydrogen;
    }
    me.thrusterFuel = (me.thrusterFuel || 0) - fromTank;
    var S = mod('Sim');
    if (S && S.refreshShip) S.refreshShip(me);     // lighter now, as favours.js does
    led.fuelT += give;
    var E = mod('Economy'), h = E && E.BY_ID ? E.BY_ID.hydrogen : null;
    led.owed = (led.owed || 0) + give * (h ? h.base : 55) * TRANSFER_PREMIUM;
    if (hooks && hooks.ledger) hooks.ledger('Mass to the ' + route.name + ': ' + give.toFixed(1) + ' t', 'rescue');
    else jot(G, 'rescue', 'Mass to the ' + route.name + ': ' + give.toFixed(1) + ' t');
    if (led.fuelT < need - 1e-6) {
      say(route.name + ': "' + give.toFixed(1) + ' tonnes aboard — thank you. We need ' +
          (need - led.fuelT).toFixed(1) + ' more before we can make way."', 9);
      return { ok: true, tonnes: give, done: false, still: need - led.fuelT };
    }
    /* Enough. She settles up and goes. */
    var price = Math.round(led.owed + CALL_OUT);
    var purse = purseAt(route, sys, t, G), paid = Math.min(price, purse);
    debit(G, sys, t, route, paid);
    led.owed = 0;
    led.rescued = led.rescued || {};
    led.rescued[sd.leg] = true;
    route.rescuedLegs = led.rescued;
    me.credits = (me.credits || 0) + paid;
    var paidLine = 'Fuelled the ' + route.name + ' off a dead tank: paid +' + paid +
                   (paid < price ? ' of ' + price + ', she owes the rest' : '');
    if (hooks && hooks.ledger) hooks.ledger(paidLine, 'rescue');
    else jot(G, 'rescue', paidLine);
    /* She owes you, and remembers why. */
    var Cap = global.Captains, contact = { route: route, id: route.id, name: route.name };
    if (Cap) {
      if (Cap.record) Cap.record(G, sys, contact, 'rescued', t, { stakes: route.souls ? ['passengers', 'ship'] : ['cargo', 'ship'] });
      if (Cap.addDebt) Cap.addDebt(G, sys, contact, 1, t, 'you fuelled her when she was adrift');
      if (Cap.bumpRecord) Cap.bumpRecord(G, 'rescues', 1, { sys: sys, ship: contact, t: t });
    }
    var fac = sys.byId && sys.byId[route.from] ? sys.byId[route.from].faction || null : null;
    if (fac && global.Missions && global.Missions.bumpStanding) global.Missions.bumpStanding(G, fac, 8);
    /* Her call comes off the band. */
    if (G.distress) G.distress = G.distress.filter(function (c) { return c.from !== 'upkeep|' + route.id; });
    /* And she goes home — flown, from where she is, not put back on her
     * rail in front of you. */
    if (C && C.liftTrader) {
      var st = {};
      for (var k in her) st[k] = her[k];
      st.route = route;
      st.adrift = false;                       // she has mass now
      /* liftTrader hands back the spec she already has if she was lifted
       * while adrift (robbed, hailed); either way she is fuelled now. */
      var spec = C.liftTrader(sys, st, t);
      if (spec) {
        spec.adrift = false; spec.mode = 'breakoff'; spec.modeSince = 0;
        if (spec.live) spec.live.adrift = false;
      }
    }
    say(route.name + ': "That is enough to get us in. ' +
        (paid < price ? 'It is all we have aboard — ' + paid + ' cr. We owe you the rest.'
                      : paid + ' cr, and our thanks. We will not forget it.') + '"', 9);
    return { ok: true, tonnes: give, done: true, paid: paid, price: price };
  }

  function fmtKm(km) { return km >= 1000 ? Math.round(km / 1000) + 'k km' : Math.round(km) + ' km'; }

  /* Where she actually is: the coasting ship lifted off her rail if she
   * has been (robbed, hailed, fired on while adrift — Combat.liftTrader
   * and Sim.steerNpc's dead-tank coast), else her rail's drift. */
  function liftedOf(route, sys) {
    var ps = sys.patrols || [];
    for (var i = 0; i < ps.length; i++) if (ps[i].liftedFrom === route && ps[i].live && !ps[i].dead) return ps[i];
    return null;
  }
  function herNow(route, sys, sd) {
    var sp = liftedOf(route, sys);
    return sp && sp.adrift ? sp.live : sd.state;
  }

  /* HER CALL. While she is adrift she is on the distress band in her own
   * system, as a real caller: her name, her registration, where she is now
   * (the beacon follows her drift), what is wrong, and until the tug
   * reaches her. Answering is Messages.answerNpcCall, which sends this kind
   * here. Cheap enough for every frame: a walk of the scheduled routes,
   * each one a cached per-leg lookup. */
  function updateCalls(G, sys, t) {
    if (!G || !sys || !sys.traffic || G.hyper) return;
    applyLedger(G, sys);
    var S = mod('Sim'), list = (G.distress = G.distress || []);
    for (var i = 0; i < sys.traffic.length; i++) {
      var r = sys.traffic[i];
      if (!eligible(r)) continue;
      var from = 'upkeep|' + r.id, have = null;
      for (var j = 0; j < list.length; j++) if (list[j].from === from) { have = list[j]; break; }
      /* Lifted off her rail (suppressed) she is still calling if she is
       * lifted adrift — robbed, say; her beacon is where she coasts. A
       * ship lifted for any other reason is not adrift, and not calling. */
      var lifted = r.suppressed ? liftedOf(r, sys) : null;
      var sd = r.dead || (r.suppressed && !(lifted && lifted.adrift)) ? null : stranded(r, sys, t);
      if (!sd || !sd.adrift) {
        /* Gone: towed in, or flown home. */
        if (have) list.splice(list.indexOf(have), 1);
        continue;
      }
      var p = lifted && lifted.adrift ? lifted.live.pos : sd.state.pos;
      if (!have) {
        var dst = sys.byId[sd.outbound ? r.to : r.from];
        have = {
          npc: true, upkeep: true, fake: false, from: from, routeId: r.id,
          name: r.name, reg: r.reg || (S && S.regCode ? S.regCode(r.id) : null),
          cls: r.className || r.cls, kind: 'mayday', want: 'tender', mine: false,
          at: sd.at, until: sd.towAt, answeredBy: null,
          claims: { situation: { value: 'drive', label: 'out of reaction mass', neg: false },
                    cargo: r.souls ? { value: 'humanitarian', label: 'passengers', neg: false }
                                   : { value: 'ordinary', label: 'freight', neg: false } },
          text: 'Mayday, mayday, mayday. ' + r.name + '. Our reaction-mass tank has let go and we are adrift' +
                (r.souls ? ' with ' + r.souls + ' aboard' : '') + '. ' +
                (dst ? dst.name + ' is sending a tug, ' : 'A tug is coming, ') +
                Math.max(1, Math.round((sd.towAt - t) / 3600)) + ' hours out. ' +
                'Anyone with ' + Math.ceil(needOf(r)) + ' tonnes of mass to spare, we will pay.',
          pos: { x: p.x, y: p.y, z: p.z }
        };
        list.push(have);
        while (list.length > 8) list.shift();
      } else {
        if (!have.pos) have.pos = { x: 0, y: 0, z: 0 };
        have.pos.x = p.x; have.pos.y = p.y; have.pos.z = p.z;
        /* A saved call comes back without the fields Save does not keep. */
        if (!have.upkeep) { have.upkeep = true; have.npc = true; have.routeId = r.id; }
      }
    }
  }

  var Upkeep = {
    BREAK_P: BREAK_P, BREAK_U: BREAK_U, WAIT_S: WAIT_S, WAIT_MIN: WAIT_MIN, BURN_PER_LEG: BURN_PER_LEG,
    NEED_SHARE: NEED_SHARE, SETTLE_LEGS: SETTLE_LEGS, TRANSFER_KMS: TRANSFER_KMS,
    TRANSFER_RESERVE: TRANSFER_RESERVE,
    tankOf: tankOf, needOf: needOf, legAt: legAt, roll: roll, failure: failure, stranded: stranded,
    breakOn: breakOn,
    fuelAt: fuelAt, purseAt: purseAt, legMargin: legMargin, spareOf: spareOf, transfer: transfer,
    CASHBOX_SHARE: CASHBOX_SHARE, floorOf: floorOf, cashBox: cashBox, accountTake: accountTake, rob: rob,
    debit: debit,
    transferKm: transferKm, updateCalls: updateCalls, applyLedger: applyLedger, eligible: eligible,
    seedOf: seedOf, ledgerOf: ledgerOf, herNow: herNow, liftedOf: liftedOf
  };
  global.Upkeep = Upkeep;
  if (typeof module !== 'undefined' && module.exports) module.exports = Upkeep;
})(typeof window !== 'undefined' ? window : globalThis);
