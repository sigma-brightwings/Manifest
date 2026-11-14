/* outside.js - somebody is out on the hull (2026-11-13).
 *
 * Astra: "wants damaged ships on multi-deck vessels to stay reachable, e.g.
 * EVA repairs by an engineer; accelerating while an untethered engineer is
 * outside strands them; EVA pack has a 12-hour oxygen candle and emergency
 * transponder naming their ship; deliberately abandoning them reflects on
 * that captain (12 hours is the grace period to return); firing on a suited
 * person with transponder on is one of the heaviest crimes."
 *
 * NOT eva.js. That is the PLAYER's suit, flown with the keys, for crossing
 * to a ship you have disabled. This is somebody else out there doing a job
 * while you sit in the seat - you do not fly them, you decide whether to
 * burn while they are out, and whether to come back.
 *
 * THE ONLY IN-FLIGHT REPAIR IN THE GAME. A yard charges 9 cr a hull point
 * and has you docked; an engineer on a line charges nothing and has you
 * drifting. That is the trade, and it is why the tether question has teeth:
 *
 *   TETHERED    slower, and a burn just drags them along on the line.
 *   UNTETHERED  faster - they can reach the whole hull instead of what the
 *               line allows - and if you light the engine they are not
 *               coming with you.
 *
 * WHAT MAKES IT A MORAL MECHANIC RATHER THAN A FINE. Leaving somebody is
 * not an offence the law charges, because nobody saw it. It costs you the
 * only thing that can cost you here: hands will not sign with you. The
 * hiring hall is a village, the beacon was transmitting your ship's name
 * for twelve hours, and everybody heard it.
 *
 * Seeded nothing, drawing nothing: all of this is player-caused, lives in
 * the save, and touches no rng.
 */
(function (global) {
  'use strict';

  /* ---- the numbers --------------------------------------------------- */
  var O2_SECONDS = 12 * 3600;        // the candle. Astra's figure.
  var GRACE = O2_SECONDS;            // and so the grace period is the same
  /* Hull points an hour, before the hand's rating. A rating-3 engineer on a
   * free line mends about 11 points an hour, so a badly holed Talon is
   * most of a day's work - slow enough that a yard is still worth docking
   * for, fast enough to save a ship that cannot reach one. */
  var MEND_PER_HOUR = 5;
  var RATING_MEND = 0.45;            // + this much per point of rating
  var TETHER_MEND = 0.55;            // on the line, you reach less of her
  /* Below this the hull cannot be worked on from outside at all: she is
   * not holed any more, she is coming apart, and that is a yard job. */
  var MEND_FLOOR = 0.08;

  /* What leaving somebody costs. Not a bounty - a name. */
  var REP_DEATH = -25;               // they died out there
  var REP_SCARE = -6;                // you came back, but only just
  var REP_RECOVER = 2;               // you went back for them promptly
  var REP_MIN = -60, REP_MAX = 20;
  /* Standing with whoever's space it happened in: a beacon ran for twelve
   * hours with your name on it and then stopped. */
  var STANDING_DEATH = -12;

  var PICKUP_KM = 0.35;              // close enough to take them aboard
  var BURN_EPS = 1e-9;               // any thrust at all counts

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  /* ---- who is out ------------------------------------------------------ */
  function current(G) { return (G && G.outside) || null; }

  function engineersAboard(G) {
    var C = global.Crew, s = G && G.ship;
    if (!s) return [];
    var list = (C && C.aboard) ? C.aboard(s) : (s.crew || []);
    return list.filter(function (p) { return p && p.role === 'engineer'; });
  }

  /* Why they cannot go out, or null. The board and the button say the same
   * words, because they ask the same function. */
  function refusal(G) {
    var s = G && G.ship;
    if (!s) return 'no ship';
    if (G.outside) return 'somebody is already outside';
    if (s.docked) return 'not from a berth - she has to be in open space';
    if (s.landed) return 'not on the ground';
    if (G.hyper) return 'not in the corridor';
    if (!engineersAboard(G).length) return 'no engineer aboard';
    if (!(s.hullMax > 0)) return 'nothing to work on';
    var f = (s.hullHp || 0) / s.hullMax;
    if (f >= 0.999) return 'she is not damaged';
    if (f < MEND_FLOOR) return 'too far gone to patch from outside - she needs a yard';
    return null;
  }

  function mendRate(rec, tether) {
    var r = MEND_PER_HOUR * (1 + RATING_MEND * ((rec && rec.rating) || 1));
    return r * (tether ? TETHER_MEND : 1);
  }

  /* Send one out. `who` is a crew record, or the best engineer aboard. */
  function send(G, t, who, tether, hooks) {
    var no = refusal(G);
    if (no) return { ok: false, why: no };
    var crewList = engineersAboard(G);
    var rec = who || crewList[0];
    for (var i = 0; i < crewList.length; i++) {
      if (!who && (crewList[i].rating || 0) > (rec.rating || 0)) rec = crewList[i];
    }
    if (!rec) return { ok: false, why: 'no engineer aboard' };
    G.outside = {
      id: rec.id, name: rec.name, role: rec.role, rating: rec.rating || 1,
      t0: t, o2: O2_SECONDS, tether: tether !== false,
      mended: 0, warnedO2: false
    };
    if (hooks && hooks.say) {
      hooks.say(rec.name + ' is outside' + (G.outside.tether ? ', on the line' : ', off the line') +
                ' - ' + Math.round(mendRate(rec, G.outside.tether)) + ' hull an hour', 6);
    }
    return { ok: true, who: G.outside };
  }

  /* Clip on or unclip, from the seat. */
  function setTether(G, on, hooks) {
    var o = current(G);
    if (!o) return { ok: false, why: 'nobody is outside' };
    o.tether = !!on;
    if (hooks && hooks.say) {
      hooks.say(o.name + (on ? ' is back on the line' :
                ' has unclipped - do not burn'), on ? 4 : 6);
    }
    return { ok: true };
  }

  /* Bring them in. */
  function recall(G, t, hooks) {
    var o = current(G);
    if (!o) return { ok: false, why: 'nobody is outside' };
    var s = G.ship;
    G.outside = null;
    if (hooks && hooks.say) {
      hooks.say(o.name + ' is back aboard' +
                (o.mended > 0 ? ' - ' + Math.round(o.mended) + ' hull mended' : ''), 5);
    }
    if (s && !aboardAlready(s, o)) putAboard(s, o);
    return { ok: true, mended: o.mended };
  }

  function aboardAlready(s, o) {
    var list = s.crew || [];
    for (var i = 0; i < list.length; i++) if (list[i] && list[i].id === o.id) return true;
    return false;
  }
  function putAboard(s, o) {
    (s.crew = (s.crew || []).slice()).push(
      { id: o.id, name: o.name, role: o.role, rating: o.rating });
  }

  /* ---- the thing that strands them ------------------------------------- */
  /* Called every frame from the sim. Any thrust at all, with somebody out
   * and off the line, and they are behind you. */
  /* `opts.noPickup` suppresses the collection check at the end. A
   * slipspace transit hands its whole interval to this function at
   * once (main.js, at the tunnel swap) and nobody is taken aboard out
   * of a tunnel - but their air still runs, which is the whole point
   * of being handed the interval at all. */
  function step(G, dt, hooks, opts) {
    var o = current(G);
    var s = G && G.ship;
    if (o && s) {
      /* The burn test comes first: a ship that lights up this frame strands
       * them this frame, before any of the bookkeeping below. */
      var V = global.V;
      var thrust = V && s.thrust ? V.len(s.thrust) : 0;
      if (!o.tether && thrust > BURN_EPS) {
        strand(G, G.t, hooks);
      } else {
        var was = o.o2;
        o.o2 = Math.max(0, o.o2 - dt);
        warnAir(o, was, o.o2, hooks);
        /* Mending, while there is hull to mend and air to do it in. */
        if (o.o2 > 0 && s.hullMax > 0 && s.hullHp < s.hullMax) {
          var add = mendRate(o, o.tether) * (dt / 3600);
          var room = s.hullMax - s.hullHp;
          if (add > room) add = room;
          s.hullHp += add;
          o.mended += add;
          if (s.hullHp >= s.hullMax - 1e-9 && hooks && hooks.say) {
            hooks.say(o.name + ' has her sound again - bring them in', 6);
          }
        }
        /* Air gone, and they were never cast off: they are on the hull of a
         * ship that is right here. That is a death you watched. */
        if (o.o2 <= 0) died(G, G.t, o, hooks, true);
      }
    }
    stepAdrift(G, dt, hooks);
    /* AND PICKING THEM UP IS FLYING TO THEM, nothing more. The same rule
     * the cargo scoop uses: get close enough and it is done. There is no
     * button, because at the moment you are finally alongside somebody you
     * nearly killed, hunting for a control is the wrong thing to be doing.
     * Only with the engine cold - you do not collect a person at speed. */
    if (!(opts && opts.noPickup) &&
        !G.paused && G.ship && !G.ship.docked && !G.ship.landed) {
      var Vp = global.V;
      var moving = Vp && G.ship.thrust ? Vp.len(G.ship.thrust) : 0;
      if (moving <= BURN_EPS) {
        var near = pickupAt(G);
        if (near) recover(G, G.t, near, hooks);
      }
    }
  }

  /* Cast off. The hand keeps the ship's velocity at the moment you lit the
   * engine, which is why they fall behind rather than vanishing. */
  function strand(G, t, hooks) {
    var o = current(G), s = G.ship, V = global.V;
    if (!o || !s) return null;
    G.outside = null;
    var rec = {
      id: o.id, name: o.name, role: o.role, rating: o.rating,
      pos: V && s.pos ? V.clone(s.pos) : { x: 0, y: 0, z: 0 },
      vel: V && s.vel ? V.clone(s.vel) : { x: 0, y: 0, z: 0 },
      o2: o.o2, t0: t,
      /* The beacon. It says whose ship, which is the whole reason leaving
       * them costs anything at all. */
      beacon: true,
      shipName: s.name || (G.reg && G.reg.name) || 'your ship',
      reg: s.reg || (G.reg && G.reg.code) || null,
      sysKey: (G.here && G.here.id) || 'sys',
      mended: o.mended, dead: false, mourned: false
    };
    (G.adrift = G.adrift || []).push(rec);
    if (hooks && hooks.say) {
      hooks.say(o.name + ' IS OFF THE HULL - you burned with them unclipped. ' +
                'Beacon is up. ' + hoursWord(rec.o2) + ' of air.', 12);
    }
    if (hooks && hooks.sound) hooks.sound('alarm');
    jot(G, 'crew', o.name + ' was cast off ' + (rec.shipName ? 'from ' + rec.shipName : '') +
        ' - beacon up, ' + hoursWord(rec.o2) + ' of air');
    return rec;
  }

  /* ---- the warnings ----------------------------------------------------
   * FIRED ON THE CROSSING, NOT ON THE STATE. Under time warp a single step
   * is hours long, so "say something once the air is under an hour" never
   * says anything: the step that would have triggered it jumps from six
   * hours to dead. Every mark the step passed over fires, in order, which
   * means the warp that kills them is also the warp that tells you. */
  var AIR_MARKS = [6 * 3600, 3 * 3600, 3600, 900];

  function warnAir(o, was, now, hooks) {
    if (!hooks || !hooks.say) return;
    o.warned = o.warned || {};
    for (var i = 0; i < AIR_MARKS.length; i++) {
      var m = AIR_MARKS[i];
      if (was > m && now <= m && !o.warned[m]) {
        o.warned[m] = true;
        hooks.say(o.name + ' has ' + hoursWord(m) + ' of air left',
                  m <= 3600 ? 9 : 6);
      }
    }
  }

  function hoursWord(sec) {
    var h = sec / 3600;
    if (h >= 2) return Math.round(h) + ' hours';
    if (h >= 1) return 'an hour';
    return Math.max(1, Math.round(sec / 60)) + ' minutes';
  }

  /* Everybody drifting, every frame: the air runs out whether or not you
   * are in the same system. */
  function stepAdrift(G, dt, hooks) {
    var list = G && G.adrift;
    if (!list || !list.length) return;
    var V = global.V;
    for (var i = 0; i < list.length; i++) {
      var r = list[i];
      if (r.dead) continue;
      var wasAir = r.o2;
      r.o2 = Math.max(0, r.o2 - dt);
      /* The same crossing-based warning, and this is the case it was
       * written for: a hand on a beacon dies while you are under warp
       * somewhere else, and the only thing that can save them is the game
       * telling you before the clock runs out rather than after. */
      warnAir(r, wasAir, r.o2, hooks);
      /* They coast. No gravity here on purpose: a body on a beacon a few
       * hundred km out is a point you fly back to, not an orbit to solve. */
      if (V && r.pos && r.vel) r.pos = V.add(r.pos, V.scale(r.vel, dt));
      if (r.o2 <= 0) died(G, G.t, r, hooks, false);
    }
  }

  /* ---- coming back ----------------------------------------------------- */
  /* Everyone adrift in this system, for the nav list and the comms band. */
  function liveHere(G) {
    var here = (G && G.here && G.here.id) || 'sys';
    return ((G && G.adrift) || []).filter(function (r) {
      return !r.dead && r.sysKey === here;
    });
  }

  /* Near enough to take aboard? */
  function pickupAt(G) {
    var V = global.V, s = G && G.ship;
    if (!V || !s || !s.pos) return null;
    var list = liveHere(G);
    for (var i = 0; i < list.length; i++) {
      if (V.dist(s.pos, list[i].pos) <= PICKUP_KM) return list[i];
    }
    return null;
  }

  function recover(G, t, rec, hooks) {
    rec = rec || pickupAt(G);
    if (!rec) return { ok: false, why: 'nobody within reach' };
    var idx = (G.adrift || []).indexOf(rec);
    if (idx >= 0) G.adrift.splice(idx, 1);
    if (G.ship) putAboard(G.ship, rec);
    /* How close it was decides what it did to your name. */
    var left = rec.o2 / O2_SECONDS;
    var d = left > 0.5 ? REP_RECOVER : REP_SCARE;
    bumpRep(G, d);
    if (hooks && hooks.say) {
      hooks.say(rec.name + ' is aboard' +
                (left > 0.5 ? '.' : ' with ' + hoursWord(rec.o2) + ' to spare. They will remember that.'),
                7);
    }
    jot(G, 'crew', rec.name + ' recovered with ' + hoursWord(rec.o2) + ' of air left');
    return { ok: true, who: rec, spare: rec.o2 };
  }

  /* ---- and not coming back --------------------------------------------- */
  function died(G, t, rec, hooks, onHull) {
    if (rec.dead) return;
    rec.dead = true;
    rec.diedAt = t;
    if (G.outside && G.outside.id === rec.id) G.outside = null;
    bumpRep(G, REP_DEATH);
    /* Whoever's space it was. A beacon with your ship's name ran for twelve
     * hours and then stopped; somebody logged that. */
    var fac = factionHere(G);
    if (fac && global.Missions && global.Missions.bumpStanding) {
      global.Missions.bumpStanding(G, fac, STANDING_DEATH);
    }
    if (hooks && hooks.say) {
      hooks.say(onHull
        ? rec.name + ' is dead on the hull. The air ran out while you sat there.'
        : rec.name + "'s beacon has stopped.", 14);
    }
    if (hooks && hooks.sound) hooks.sound('alarm');
    jot(G, 'crew', rec.name + ' died ' + (onHull ? 'on the hull' : 'adrift') +
        ' - ' + (onHull ? 'the air ran out' : 'the beacon stopped') +
        '. Hands will have heard.');
  }

  function factionHere(G) {
    var sys = G && G.sys;
    if (!sys) return null;
    if (sys.faction) return sys.faction;
    var ports = sys.ports || [];
    for (var i = 0; i < ports.length; i++) if (ports[i].faction) return ports[i].faction;
    return null;
  }

  /* ---- your name among hands ------------------------------------------- */
  function rep(G) { return (G && typeof G.crewRep === 'number') ? G.crewRep : 0; }
  function bumpRep(G, d) {
    if (!G || !d) return rep(G);
    G.crewRep = clamp(rep(G) + d, REP_MIN, REP_MAX);
    return G.crewRep;
  }

  /* What your name does to a hiring hall. Read by crew.js forHire. A hand
   * who has heard about you wants more to sign, and the good ones do not
   * sign at all. */
  function hallEffect(G) {
    var r = rep(G);
    if (r >= 0) return { fewer: 0, feeMul: 1, maxRating: 5, word: null };
    var bad = -r / -REP_MIN;                      // 0..1
    return {
      fewer: Math.round(bad * 3),                 // up to three fewer berths
      feeMul: 1 + bad * 0.9,                      // up to nearly double
      maxRating: bad > 0.66 ? 2 : bad > 0.33 ? 3 : 4,
      word: bad > 0.66 ? 'They know what you did.'
          : bad > 0.33 ? 'Word about you got here first.'
          : 'They have heard something about you.'
    };
  }

  function jot(G, kind, text) {
    if (global.Journal && global.Journal.add) {
      try { global.Journal.add(G, kind, text); } catch (e) {}
    }
  }

  var Outside = {
    O2_SECONDS: O2_SECONDS, GRACE: GRACE, PICKUP_KM: PICKUP_KM,
    MEND_PER_HOUR: MEND_PER_HOUR, RATING_MEND: RATING_MEND,
    TETHER_MEND: TETHER_MEND, MEND_FLOOR: MEND_FLOOR,
    REP_DEATH: REP_DEATH, REP_SCARE: REP_SCARE, REP_RECOVER: REP_RECOVER,
    REP_MIN: REP_MIN, REP_MAX: REP_MAX, STANDING_DEATH: STANDING_DEATH,
    current: current, refusal: refusal, engineersAboard: engineersAboard,
    mendRate: mendRate, send: send, setTether: setTether, recall: recall,
    step: step, strand: strand, stepAdrift: stepAdrift,
    liveHere: liveHere, pickupAt: pickupAt, recover: recover,
    rep: rep, bumpRep: bumpRep, hallEffect: hallEffect, hoursWord: hoursWord
  };
  global.Outside = Outside;
  if (typeof module !== 'undefined' && module.exports) module.exports = Outside;
})(typeof window !== 'undefined' ? window : globalThis);
