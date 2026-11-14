/* rendezvous.js - what two hulls are doing out there, and what you can do
 * about it (2026-11-12).
 *
 * The ARRANGEMENT is in the seed (generate.js attachRendezvous): two
 * hulls out of two different berths, both around some body with no dock
 * on it, holding station a few thousand kilometres apart for eight or ten
 * hours and then going home. That is permanent, because that is what an
 * arrangement is - these two outfits meet on a schedule.
 *
 * WHAT MOVES ON ANY GIVEN AFTERNOON IS NOT. That comes from the seed
 * Astra chose:
 *
 *     the galaxy  +  this system  +  this window
 *                 +  the hull that came in ahead of the window
 *
 * Her idea, and the last term is the good part: the ship that arrived
 * before this meeting is the one who set it up, so "who is behind this"
 * is a thing you can go and look at on an arrivals board rather than a
 * number the game kept to itself.
 *
 * THE ONE CHANGE I MADE TO IT, and why. She had it as the last hull in
 * before YOU. That is derivable - traffic is a closed-form function of
 * the timetable and the clock, so who came in ahead of you is already in
 * the seed - but keyed to your arrival it is a re-roll button: jump out,
 * jump back, different last ship, different cargo, shop until the hold is
 * worth stealing. It would also quietly break the thing this whole game
 * is built on, which is that the same seed is the same universe. A
 * meeting that changes because you blinked is not a fact about the world.
 *
 * So the last hull is taken at the WINDOW's opening rather than at your
 * arrival. Re-entering during the same window gives the same meeting; you
 * can still get a different one by waiting the window out, which costs
 * days. That is a price rather than a re-roll, and the hook survives
 * whole.
 */
(function (global) {
  'use strict';

  var RNG = global.RNG, V = global.V;

  /* How close you have to be for any of this to be your business. */
  var SCENE_KM = 40000;
  /* And how close to actually deal, which is the ship-to-ship range. */
  var DEAL_KM = 8000;

  /* What they move, and how often it is the sort of thing nobody files.
   * A quiet transfer is not always a crime - a berth fee skipped is as
   * good a reason as a customs scan skipped - and the honest version has
   * both, or every meeting is the same meeting. */
  var CLEAN = ['parts', 'electronics', 'medicine', 'textiles', 'chemicals', 'metals'];
  var GREY_SHARE = 0.45;         // of meetings, where the system supports it

  /* Under the counter: they are not paying list, and neither are you. */
  var DEAL_DISCOUNT = [0.55, 0.78];

  function pairOf(sys) { return (sys && sys.rendezvous) || null; }

  function hullsOf(sys) {
    var rv = pairOf(sys);
    if (!rv || !sys.patrols) return null;
    var a = null, b = null;
    for (var i = 0; i < sys.patrols.length; i++) {
      if (sys.patrols[i].id === rv.a) a = sys.patrols[i];
      else if (sys.patrols[i].id === rv.b) b = sys.patrols[i];
    }
    return (a && b) ? { a: a, b: b } : null;
  }

  /* Which meeting this is. Window n opens when they are both alongside;
   * the arithmetic is the route's, not a second copy of it. */
  function windowIndex(sys, t) {
    var rv = pairOf(sys);
    if (!rv) return null;
    return Math.floor((t - rv.t0) / rv.period);
  }
  function windowStart(sys, n) {
    var rv = pairOf(sys);
    return rv ? rv.t0 + n * rv.period : 0;
  }

  /* Are they there now? Asked of the hulls rather than of the clock,
   * because the hulls are the truth and a second copy of the timetable
   * is a second thing to be wrong. */
  function onNow(sys, t, G) {
    /* Informed on, and lying low: the hulls still fly their route - a
     * rail is a rail - but there is nothing moving between them. */
    if (G && blownUntil(G, sys) > t) return false;
    var h = hullsOf(sys), Sim = global.Sim;
    if (!h || !Sim || !Sim.trafficState) return false;
    var sa = Sim.trafficState(h.a.rail.route, sys, t);
    var sb = Sim.trafficState(h.b.rail.route, sys, t);
    return !!(sa && sb && atMeet(sa, sys) && atMeet(sb, sys));
  }

  /* Alongside, out there - not alongside at home. */
  function atMeet(st, sys) {
    var rv = pairOf(sys);
    if (!st || st.phase !== 'moored' || !rv) return false;
    var dst = st.to;
    return !!(dst && (dst.id === rv.at || dst === rv.at));
  }

  /* ---- THE LAST HULL IN -----------------------------------------------
   * Astra's term. Every route in the system has arrivals on a period; the
   * most recent one at or before the window's opening is the ship that
   * came in ahead of this meeting. Closed form, like everything else: no
   * history is kept and none is needed.
   *
   * Deliberately ignores the two hulls of the meeting itself. They did
   * not set it up for themselves. */
  function lastArrival(sys, at) {
    var rv = pairOf(sys);
    var best = null, bestT = -Infinity;
    var lists = [sys.traffic || [], []];
    var named = {};
    var pats = sys.patrols || [];
    for (var pi = 0; pi < pats.length; pi++) {
      var sp = pats[pi];
      if (!sp.rail || sp.rail.type !== 'route') continue;
      lists[1].push(sp.rail.route);
      if (sp.name) named[sp.rail.route.id] = sp.name;
    }
    for (var li = 0; li < lists.length; li++) {
      var L = lists[li];
      for (var i = 0; i < L.length; i++) {
        var r = L[i];
        if (!r || !(r.period > 0) || !(r.cruise >= 0)) continue;
        if (rv && (r.id === rv.a || r.id === rv.b)) continue;
        /* Her arrivals at the far end: t0 + cruise, every period. */
        var first = r.t0 + r.cruise;
        var n = Math.floor((at - first) / r.period);
        if (n < 0) continue;
        var when = first + n * r.period;
        if (when > bestT || (when === bestT && best && String(r.id) > String(best.id))) {
          bestT = when; best = r;
        }
      }
    }
    return best
      ? { id: best.id, name: best.name || named[best.id] || best.className || best.id, at: bestT }
      : null;
  }

  /* ---- WHAT IS IN THE HOLD -------------------------------------------- */

  function dealAt(G, sys, t) {
    var rv = pairOf(sys);
    if (!rv) return null;
    var n = windowIndex(sys, t);
    if (n === null || n < 0) return null;
    var open = windowStart(sys, n);
    var who = lastArrival(sys, open);
    var Eco = global.Economy;

    var r = new RNG('rendezvous|' + ((G && G.seed) || 'seed') + '|' + sys.seed +
                    '|' + n + '|' + (who ? who.id : 'nobody'));

    /* Not every meeting is worth anybody's afternoon. */
    if (r.chance(0.18)) {
      return { n: n, open: open, who: who, quiet: true,
                cid: null, tonnes: 0, contraband: false };
    }

    /* Contraband where the system would look the other way, and a berth
     * fee dodged where it would not. */
    var C = global.Combat;
    var crime = C && C.systemCorruption ? C.systemCorruption(G, sys)
              : (sys.corruption !== undefined ? sys.corruption
                 : (sys.crime !== undefined ? sys.crime : 0));
    var dirty = [];
    var tbl = (Eco && (Eco.CONTRABAND || Eco.COMMODITIES)) || [];
    for (var i = 0; i < tbl.length; i++) {
      var it = tbl[i];
      if (it && it.contraband && !it.milfuel) dirty.push(it.id);
    }
    if (!dirty.length && Eco && Eco.BY_ID) {
      for (var k in Eco.BY_ID) {
        if (!Object.prototype.hasOwnProperty.call(Eco.BY_ID, k)) continue;
        if (Eco.BY_ID[k].contraband && !Eco.BY_ID[k].milfuel) dirty.push(k);
      }
      dirty.sort();
    }
    var grey = dirty.length && crime >= 40 && r.chance(GREY_SHARE);
    var pool = grey ? dirty : CLEAN.filter(function (c) { return !Eco || !Eco.BY_ID || Eco.BY_ID[c]; });
    if (!pool.length) pool = ['parts'];
    var cid = r.pick(pool);
    var tonnes = r.int(18, 60);
    var base = (Eco && Eco.BY_ID && Eco.BY_ID[cid]) ? Eco.BY_ID[cid].base : 90;
    return {
      n: n, open: open, who: who, quiet: false,
      cid: cid, tonnes: tonnes, contraband: !!grey,
      /* What they will let it go for, per tonne. */
      ask: Math.round(base * r.range(DEAL_DISCOUNT[0], DEAL_DISCOUNT[1]))
    };
  }

  /* Everything about the meeting happening right now, or null. The one
   * call the UI makes. */
  function live(G, sys, t) {
    if (!onNow(sys, t, G)) return null;
    var h = hullsOf(sys), rv = pairOf(sys), Sim = global.Sim;
    if (!h) return null;
    var sa = Sim.trafficState(h.a.rail.route, sys, t);
    var sb = Sim.trafficState(h.b.rail.route, sys, t);
    if (!sa || !sb) return null;
    var deal = dealAt(G, sys, t);
    var mid = { x: (sa.pos.x + sb.pos.x) / 2,
                y: (sa.pos.y + sb.pos.y) / 2,
                z: (sa.pos.z + sb.pos.z) / 2 };
    return {
      rv: rv, deal: deal, pos: mid,
      a: { spec: h.a, state: sa }, b: { spec: h.b, state: sb },
      apart: V ? V.dist(sa.pos, sb.pos) : 0,
      range: (G && G.ship && G.ship.pos && V) ? V.dist(mid, G.ship.pos) : Infinity,
      atName: rv.atName
    };
  }

  /* Called every frame by main.js. Puts a meeting in progress on the open
   * band the first time it is noticed, and takes it off when they leave -
   * so a meeting you were too far away to reach is still something you
   * knew about and missed, which is the point of a band. */
  function watch(G, sys, t, hooks) {
    var B = global.Band;
    if (!B || !G) return;
    var m = live(G, sys, t);
    var h = hullsOf(sys);
    if (!h) return;
    var as = { id: h.a.id, name: h.a.name, faction: h.a.faction,
               live: { pos: m ? m.pos : null } };
    if (!m) {
      if (G._rvOn) { B.close(G, t, 'trade', as, 'over'); G._rvOn = false; }
      return;
    }
    if (!G._rvOn) {
      G._rvOn = true;
      var before = (G.band || []).length;
      var id = B.open(G, sys, t, 'trade', as,
                      { id: h.b.id, name: h.b.name });
      var e = null, all = G.band || [];
      for (var i = 0; i < all.length; i++) if (all[i].id === id) e = all[i];
      if (e && all.length > before && hooks && hooks.say) hooks.say(B.hail(G, e), 6);
    } else {
      B.touch(G, t, 'trade', as);
    }
  }

  function atScene(G, sys, t) {
    var m = live(G, sys, t);
    return (m && m.range <= SCENE_KM) ? m : null;
  }

  /* ---- WHAT YOU CAN DO ABOUT IT ------------------------------------------
   * Astra: come across it and "attempt to render aid or even pirate their
   * ship". Three things, and the third is the one that makes the feature:
   * buying into it and taking it are both things you already do to a
   * single hull, and informing on somebody is a verb this game has not
   * had.
   *
   * And a fourth that needed no code at all: watch, and do nothing, which
   * is what anybody does the first time.
   */

  var ROB_STANDING = 14;         // off each flag whose hull you took it from
  var TELL_STANDING = 6;         // on with the flag you told
  var TELL_CUT = 0.35;           // of the cargo's list, as a finder's fee
  var BLOWN_WINDOWS = 4;         // meetings they skip after being informed on

  /* Blown here, and for how long. They are not caught - they are warned,
   * which is what being informed on actually does to an arrangement. */
  function blownUntil(G, sys) {
    var b = G && G.rvBlown && G.rvBlown[starOf(G)];
    return b || 0;
  }
  function starOf(G) { return (G && G.here && G.here.id) || 'sys'; }

  function refusal(G, sys, t) {
    var m = atScene(G, sys, t);
    if (!m) return 'nothing alongside out here';
    if (m.range > DEAL_KM) {
      return 'close to within ' + Math.round(DEAL_KM / 1000) + ',000 km to talk to them';
    }
    if (!m.deal || m.deal.quiet) return 'whatever this is, it is not cargo';
    return null;
  }

  /* BUY IN. No paperwork, no berth fee, and a price that reflects both. */
  function buy(G, sys, t, hooks) {
    var why = refusal(G, sys, t);
    if (why) return { ok: false, why: why };
    var m = atScene(G, sys, t), d = m.deal, Sim = global.Sim;
    var free = G.ship.cargoCap - (Sim && Sim.cargoMass ? Sim.cargoMass(G.ship) : 0);
    var take = Math.min(d.tonnes, Math.floor(free));
    if (take < 1) return { ok: false, why: 'no room in the hold' };
    var cost = take * d.ask;
    if ((G.ship.credits || 0) < cost) {
      return { ok: false, why: take + ' t is ' + cost + ' cr and you have ' + Math.round(G.ship.credits || 0) };
    }
    G.ship.credits -= cost;
    G.ship.cargo[d.cid] = (G.ship.cargo[d.cid] || 0) + take;
    if (Sim && Sim.refreshShip) Sim.refreshShip(G.ship);
    mark(G, sys, t, 'bought');
    var nm = goodName(d.cid);
    jot(G, take + ' t of ' + nm + ' bought off a hull at ' + m.atName +
           ', ' + cost + ' cr, no paperwork');
    if (hooks && hooks.say) {
      hooks.say('Transferred - ' + take + ' t of ' + nm + ' for ' + cost + ' cr. ' +
                'Nobody writes anything down.', 7);
    }
    if (hooks && hooks.sound) hooks.sound('pay');
    return { ok: true, tonnes: take, cost: cost, cid: d.cid, contraband: d.contraband };
  }

  /* TAKE IT. Two light freighters, matched, a long way from anybody - the
   * best moment there will ever be to rob somebody, which is exactly why
   * they did not want to be found. It costs you with both flags, and the
   * hold is hot. */
  function rob(G, sys, t, hooks) {
    var why = refusal(G, sys, t);
    if (why) return { ok: false, why: why };
    var m = atScene(G, sys, t), d = m.deal, Sim = global.Sim;
    var C = global.Combat;
    var armed = hasGun(G.ship);
    if (!armed) return { ok: false, why: 'they can see you have nothing to threaten them with' };
    var free = G.ship.cargoCap - (Sim && Sim.cargoMass ? Sim.cargoMass(G.ship) : 0);
    var take = Math.min(d.tonnes, Math.floor(free));
    if (take < 1) return { ok: false, why: 'no room in the hold' };

    G.ship.cargo[d.cid] = (G.ship.cargo[d.cid] || 0) + take;
    if (Sim && Sim.refreshShip) Sim.refreshShip(G.ship);
    /* Hot, the way a pried drone is hot (claims.js): it is not yours and
     * the people it belongs to know what it is. */
    var Cl = global.Claims;
    if (Cl && Cl.addHot) Cl.addHot(G, d.cid, take);

    var M = global.Missions;
    var flags = {};
    if (m.a.spec.faction) flags[m.a.spec.faction] = true;
    if (m.b.spec.faction) flags[m.b.spec.faction] = true;
    for (var f in flags) {
      if (Object.prototype.hasOwnProperty.call(flags, f) && M && M.bumpStanding) {
        M.bumpStanding(G, f, -ROB_STANDING);
      }
    }
    mark(G, sys, t, 'robbed');
    blow(G, sys, t);
    var nm2 = goodName(d.cid);
    jot(G, take + ' t of ' + nm2 + ' taken off a quiet transfer at ' + m.atName);
    if (hooks && hooks.say) {
      hooks.say('They hand it over - ' + take + ' t of ' + nm2 +
                '. Neither of them was ever going to shoot, and both of them know who you are.', 8);
    }
    if (hooks && hooks.sound) hooks.sound('warn');
    return { ok: true, tonnes: take, cid: d.cid, flags: Object.keys(flags) };
  }

  /* TELL SOMEBODY. The new verb. You are not taking anything and you are
   * not buying anything; you are selling the fact that this happens, to
   * the flag that would like it to stop. */
  function tell(G, sys, t, hooks) {
    var why = refusal(G, sys, t);
    if (why) return { ok: false, why: why };
    var m = atScene(G, sys, t), d = m.deal;
    /* Whose law. A flag flying over this system that is NOT one of the
     * two doing the meeting - informing on somebody to their own employer
     * is not informing, it is gossip. */
    var mine = {};
    if (m.a.spec.faction) mine[m.a.spec.faction] = true;
    if (m.b.spec.faction) mine[m.b.spec.faction] = true;
    var law = (sys.factions || []).filter(function (f) {
      return f && !f.outlaw && !mine[f.id];
    })[0] || (sys.factions || []).filter(function (f) { return f && !f.outlaw; })[0];
    if (!law) return { ok: false, why: 'no law out here to tell' };

    var Eco = global.Economy;
    var base = (Eco && Eco.BY_ID && Eco.BY_ID[d.cid]) ? Eco.BY_ID[d.cid].base : 90;
    var fee = Math.round(d.tonnes * base * TELL_CUT * (d.contraband ? 2.2 : 1));
    G.ship.credits += fee;
    var M = global.Missions;
    if (M && M.bumpStanding) {
      M.bumpStanding(G, law.id, TELL_STANDING + (d.contraband ? 4 : 0));
      /* And the two of them work out soon enough who was alongside. */
      for (var f2 in mine) {
        if (Object.prototype.hasOwnProperty.call(mine, f2)) M.bumpStanding(G, f2, -8);
      }
    }
    mark(G, sys, t, 'told');
    blow(G, sys, t);
    jot(G, 'Told ' + law.name + ' about a transfer at ' + m.atName + ': ' + fee + ' cr');
    if (hooks && hooks.say) {
      hooks.say(law.name + ' thanks you for the position - ' + fee + ' cr. ' +
                'The two of them will not be back here for a while.', 8);
    }
    if (hooks && hooks.sound) hooks.sound('pay');
    return { ok: true, fee: fee, law: law.id };
  }

  /* They skip the next few meetings. Warned, not caught. */
  function blow(G, sys, t) {
    var rv = pairOf(sys);
    if (!rv) return;
    G.rvBlown = G.rvBlown || {};
    G.rvBlown[starOf(G)] = t + BLOWN_WINDOWS * rv.period;
  }

  /* What you did at this one, so the game does not offer it twice. */
  function mark(G, sys, t, how) {
    var n = windowIndex(sys, t);
    G.rvDone = G.rvDone || {};
    G.rvDone[starOf(G) + '|' + n] = how;
  }
  function doneAt(G, sys, t) {
    var n = windowIndex(sys, t);
    return (G && G.rvDone && G.rvDone[starOf(G) + '|' + n]) || null;
  }

  function hasGun(ship) {
    var C = global.Combat;
    var fit = (ship && ship.fit) || {};
    for (var k in fit) {
      if (!Object.prototype.hasOwnProperty.call(fit, k)) continue;
      var id = fit[k];
      if (C && C.GUNS && C.GUNS[id]) return true;
      if (C && C.EQUIPMENT && C.EQUIPMENT[id] && C.EQUIPMENT[id].kind === 'gun') return true;
    }
    return !!(ship && ship.guns && ship.guns.length);
  }

  function goodName(cid) {
    var Eco = global.Economy;
    return (Eco && Eco.BY_ID && Eco.BY_ID[cid] && Eco.BY_ID[cid].name) || cid;
  }

  function jot(G, line) {
    var J = global.Journal;
    if (!J && typeof require !== 'undefined') { try { J = require('./journal.js'); } catch (e) { J = null; } }
    if (J && J.add && G) J.add(G, 'mission', line);
  }

  var Rendezvous = {
    SCENE_KM: SCENE_KM, DEAL_KM: DEAL_KM, GREY_SHARE: GREY_SHARE,
    DEAL_DISCOUNT: DEAL_DISCOUNT, CLEAN: CLEAN,
    ROB_STANDING: ROB_STANDING, TELL_STANDING: TELL_STANDING,
    TELL_CUT: TELL_CUT, BLOWN_WINDOWS: BLOWN_WINDOWS,
    pairOf: pairOf, hullsOf: hullsOf, windowIndex: windowIndex,
    windowStart: windowStart, onNow: onNow, lastArrival: lastArrival,
    dealAt: dealAt, live: live, atScene: atScene, atMeet: atMeet, hasGun: hasGun,
    refusal: refusal, buy: buy, rob: rob, tell: tell, watch: watch,
    doneAt: doneAt, blownUntil: blownUntil
  };

  global.Rendezvous = Rendezvous;
  if (typeof module !== 'undefined' && module.exports) module.exports = Rendezvous;
})(typeof window !== 'undefined' ? window : globalThis);
