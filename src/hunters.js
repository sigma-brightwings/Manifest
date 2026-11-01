/* hunters.js - naval hunters, dispatched on notoriety (PLAN.md Phase 9,
 * the second half), 2026-11-01.
 *
 * Astra asked for "the navy hunters" off unfinished.md. PLAN.md:
 *
 *   Police are lenient. The navy is not, and the difference is what you
 *   did, not what you owe. A career smuggler accumulates bounty and gets
 *   stopped and fined. Someone who destroys three patrol cutters in a week
 *   gets hunted, and cannot buy their way out of it: they have to leave,
 *   or survive it.
 *
 * So there are two ledgers, and this file owns the second:
 *
 *              G.wanted[fac]            G.notoriety[empire]  (this file)
 *   means      money owed               recent loud acts
 *   grows on   fines, citations         REPORTED kills of their ships
 *   decays     by paying                by half every NOTORIETY_HALF_S, and
 *                                       cannot be paid off
 *   triggers   police stop, fine        naval dispatch
 *
 * Kept per EMPIRE, not per faction: a power inside an empire
 * (faction-hierarchy) has no navy of its own; the empire's navy answers for
 * all of it. Only reported kills count (Combat.report), because the navy
 * hunts what it has been told about: a kill nobody saw is a kill nobody
 * avenges.
 *
 * Hunters differ from patrols in kind (PLAN): no route, a task. They launch
 * from the empire's nearest port in the system you are in, in a pair or a
 * three, fly the navy's interceptors, open with no demand, and steer at you
 * from wherever you are. They are never put back on a rail (they have
 * none), they wait out a dock, and they are gone when you leave the
 * system, which is the way to survive them. Arriving in another system the
 * same empire holds, they come again once the word has caught up.
 *
 * Nothing here is random: who is dispatched is named off the empire, the
 * system and the dispatch count, so a reload sends the same ships.
 */
(function (global) {
  'use strict';
  var V = global.V;

  /* Loud acts, in notoriety points, by the charge Combat.report books. A
   * patrol cutter is 25, so three in a week (PLAN's example) is past HUNT_AT
   * even after the decay; one ordinary killing is not. */
  var LOUD = { kill: 12, killPolice: 25, killNavy: 40, killLiner: 30, killTender: 30 };
  var HUNT_AT = 60;                    // a pair is dispatched at this
  var HUNT_THREE = 120;                // and three at this
  var NOTORIETY_HALF_S = 3 * 86400;    // halves every three days
  var NOTORIETY_FLOOR = 1;             // below this it is forgotten
  var DISPATCH_DELAY_S = 1800;         // the word reaches the navy half an hour after you arrive
  var REDISPATCH_S = 6 * 3600;         // after a hunt ends, this long before the next
  var LAUNCH_KM = 30;                  // they launch this far off their port
  var HUNTER_ACCEL = 0.034;            // a little better than a police interceptor (0.0315)
  var HUNTER_SIZE = 0.08;

  var NAMES = ['Relentless', 'Vigil', 'Warden', 'Sentence', 'Reckoning', 'Lodestar',
               'Inquest', 'Adjudicator', 'Tenacious', 'Bulwark', 'Remit', 'Verdict'];

  function C() { return global.Combat; }
  function A() { return global.Aggression; }
  function hash01(s) {
    if (A() && A().hash01) return A().hash01(s);
    var h = 2166136261 >>> 0;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return (h >>> 0) / 4294967296;
  }
  function factionOf(G, sys, id) {
    var g = G && G.galaxy;
    return (g && g.factionById && g.factionById[id]) || (sys && sys.factionById && sys.factionById[id]) || null;
  }
  function empireOf(G, sys, id) {
    if (A() && A().empireOf) return A().empireOf(G, sys, id);
    var f = factionOf(G, sys, id), guard = 0;
    while (f && f.parentId && guard++ < 6) f = factionOf(G, sys, f.parentId);
    return f ? f.id : id || null;
  }
  function facName(G, sys, id) { var f = factionOf(G, sys, id); return (f && f.name) || id || 'them'; }

  /* ---- the ledger --------------------------------------------------------
   * Stored as { v, at }: a value and the time it was last written, decayed
   * on read. A pure function of t, so a time warp or a reload decays it
   * exactly as living through the days would. */
  function book(G) { if (!G.notoriety) G.notoriety = {}; return G.notoriety; }
  function notoriety(G, emp, t) {
    var e = G && G.notoriety && G.notoriety[emp];
    if (!e) return 0;
    var v = e.v * Math.pow(0.5, Math.max(0, (t - e.at)) / NOTORIETY_HALF_S);
    return v < NOTORIETY_FLOOR ? 0 : v;
  }
  function addNotoriety(G, emp, pts, t) {
    if (!emp || !(pts > 0)) return 0;
    var now = notoriety(G, emp, t);
    book(G)[emp] = { v: now + pts, at: t };
    return now + pts;
  }

  /* Combat.report has just booked a charge against `fac`. Loud ones count. */
  function onReport(G, kind, fac, t, hooks) {
    var pts = LOUD[kind];
    if (!pts || !fac || fac === 'civil') return;
    var sys = G.sys;
    var emp = empireOf(G, sys, fac);
    var f = factionOf(G, sys, emp);
    if (!f || f.outlaw) return;                 // the Syndicate has no navy to send
    var before = notoriety(G, emp, t);
    var after = addNotoriety(G, emp, pts, t);
    if (before < HUNT_AT && after >= HUNT_AT && hooks && hooks.say) {
      hooks.say('The ' + facName(G, sys, emp) + ' navy has your name. Their space is no longer safe for you.', 8);
    }
  }

  /* ---- who is here to send ----------------------------------------------- */
  /* An empire's ports in this system, nearest first to `pos`. */
  function empirePorts(G, sys, emp, pos, t) {
    var Sm = global.Sim, out = [];
    (sys.ports || []).forEach(function (p) {
      if (!p.faction || p.dark || p.playerStation) return;
      if (empireOf(G, sys, p.faction) !== emp) return;
      var pp = Sm.bodyPosition(p, sys, t);
      out.push({ port: p, pos: pp, d: pos ? V.dist(pp, pos) : 0 });
    });
    out.sort(function (a, b) { return a.d - b.d; });
    return out;
  }

  function state(sys) { if (!sys._hunts) sys._hunts = {}; return sys._hunts; }
  function huntersOf(sys, emp) {
    return (sys.patrols || []).filter(function (sp) { return sp.hunter && sp.hunterOf === emp && !sp.dead; });
  }

  function dispatch(sys, G, emp, t, hooks) {
    var Sm = global.Sim, ship = G.ship;
    var ports = empirePorts(G, sys, emp, ship.pos, t);
    if (!ports.length) return [];
    var from = ports[0];
    var st = state(sys)[emp];
    st.count = (st.count || 0) + 1;
    var n = notoriety(G, emp, t) >= HUNT_THREE ? 3 : 2;
    var vel = Sm.bodyVelocity ? Sm.bodyVelocity(from.port, sys, t) : { x: 0, y: 0, z: 0 };
    var toYou = V.norm(V.sub(ship.pos, from.pos));
    if (!(V.len(toYou) > 0)) toYou = { x: 1, y: 0, z: 0 };
    var side = Math.abs(toYou.z) < 0.9 ? V.norm(V.cross(toYou, { x: 0, y: 0, z: 1 })) : { x: 1, y: 0, z: 0 };
    var up = V.norm(V.cross(side, toYou));
    var out = [];
    var used = {};
    for (var i = 0; i < n; i++) {
      var key = 'hunt|' + emp + '|' + (sys.seed || sys.name || '') + '|' + st.count + '|' + i;
      var ni = Math.floor(hash01(key) * NAMES.length);
      while (used[ni]) ni = (ni + 1) % NAMES.length;
      used[ni] = true;
      var off = V.add(V.scale(toYou, LAUNCH_KM), V.scale(side, (i - (n - 1) / 2) * 6));
      var pos = V.add(from.pos, off);
      var spec = {
        id: 'hunter-' + emp + '-' + st.count + '-' + i,
        kind: 'navy', cls: 'navy', faction: from.port.faction,
        name: 'FNS ' + NAMES[ni], className: 'naval interceptor',
        color: (factionOf(G, sys, emp) || {}).color || '#b8c6d8',
        size: HUNTER_SIZE, accel: HUNTER_ACCEL,
        hunter: true, hunterOf: emp, hostileToPlayer: true, onSight: true,
        mode: 'attack', modeSince: 0,
        rail: { type: 'lifted' },
        live: { pos: pos, vel: V.clone(vel || { x: 0, y: 0, z: 0 }), fwd: toYou, up: up, right: side }
      };
      spec.live.spec = spec; spec.live.kind = 'navy'; spec.live.id = spec.id;
      spec.live.name = spec.name; spec.live.cls = 'navy'; spec.live.className = spec.className;
      spec.live.size = spec.size; spec.live.color = spec.color; spec.live.faction = spec.faction;
      if (C() && C().npcHull) C().npcHull(spec);
      sys.patrols.push(spec);
      out.push(spec);
    }
    sys._ships = null;
    st.active = true;
    if (hooks && hooks.say) {
      hooks.say(out.map(function (s) { return s.name; }).join(', ') + ' launched from ' + from.port.name +
                ' - ' + facName(G, sys, emp) + ' naval interceptors, hunting you. They will not ask.', 9);
    }
    if (hooks && hooks.sound) hooks.sound('warn');
    if (global.Journal && global.Journal.add) {
      global.Journal.add(G, 'law', facName(G, sys, emp) + ' navy dispatched ' + out.length + ' hunters from ' + from.port.name);
    }
    return out;
  }

  /* ---- the frame -------------------------------------------------------- */
  function update(sys, G, t, hooks) {
    if (!sys || !G || !G.ship || !sys.patrols) return;
    var ship = G.ship;
    /* A hunter with no live body is one whose hunt ended (you left the
     * system and everything went back to sleep). She has no rail to go
     * back to, so she goes. */
    for (var i = sys.patrols.length - 1; i >= 0; i--) {
      var sp = sys.patrols[i];
      if (sp.hunter && (!sp.live || sp.dead)) { sys.patrols.splice(i, 1); sys._ships = null; }
    }
    var hs = state(sys);
    for (var emp in hs) {
      if (hs[emp].active && !huntersOf(sys, emp).length) {
        hs[emp].active = false;
        hs[emp].dueAt = t + REDISPATCH_S;
      }
    }
    var emps = {};
    (sys.ports || []).forEach(function (p) { if (p.faction) emps[empireOf(G, sys, p.faction)] = true; });
    for (var e in emps) {
      var f = factionOf(G, sys, e);
      if (!f || f.outlaw) continue;
      if (notoriety(G, e, t) < HUNT_AT) { if (hs[e]) hs[e].dueAt = undefined; continue; }
      var s = hs[e] || (hs[e] = {});
      if (s.active) continue;
      if (s.dueAt === undefined) { s.dueAt = t + DISPATCH_DELAY_S; continue; }
      if (t < s.dueAt) continue;
      if (ship.docked || ship.landed) continue;        // they wait for you to come out
      dispatch(sys, G, e, t, hooks);
    }
  }

  /* Hunters are never slept for range and never put back on a rail; the
   * encounter loop asks this (Sim.updateEncounters). */
  function keepAwake(spec) { return !!(spec && spec.hunter); }

  var Hunters = {
    LOUD: LOUD, HUNT_AT: HUNT_AT, HUNT_THREE: HUNT_THREE, NOTORIETY_HALF_S: NOTORIETY_HALF_S,
    DISPATCH_DELAY_S: DISPATCH_DELAY_S, REDISPATCH_S: REDISPATCH_S, HUNTER_ACCEL: HUNTER_ACCEL,
    notoriety: notoriety, addNotoriety: addNotoriety, onReport: onReport,
    empirePorts: empirePorts, dispatch: dispatch, update: update, keepAwake: keepAwake,
    huntersOf: huntersOf
  };
  global.Hunters = Hunters;
  if (typeof module !== 'undefined' && module.exports) module.exports = Hunters;
})(typeof window !== 'undefined' ? window : globalThis);
