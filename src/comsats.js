/* comsats.js - the relay network, and your own com-sat (2026-11-20).
 *
 * Agreed with Astra (claude/orbital-infrastructure.md):
 *   - you can own a com-sat; it "keeps you updated with trade prices along
 *     the comsat's line of sight, basically, even across systems";
 *   - across systems, prices travel along a CHAIN of relays, 8 ly a hop
 *     and an hour a hop; a break puts the far side back on courier news;
 *   - a dead relay "turns a station into an island which gets its news by
 *     courier";
 *   - two layers: the public network is the stations', and your com-sat is
 *     the terminal that plugs you into it.
 *
 * SLICE 1, this file: the public relays on the rails, which ports they can
 * see (linked) and which they cannot (islands), the chain between stars,
 * buying a com-sat and putting it in orbit, and live prices along the
 * chain for a pilot who owns one. Relays do not fail yet: RTG dark dates
 * and refuelling are slice 2, islands felt in mail and rumours slice 3.
 *
 * ON THE RAILS. A system's relays are a pure function of its seed stream
 * (RNG 'relays|<star>') and the bodies it generated: three in circular
 * orbits round every world with a port. Where one is at t is a formula.
 * The generator is not touched; relays are not bodies, so nothing that
 * lists bodies, ports or traffic changes.
 *
 * THE CHAIN. A star is a node when somebody runs a network there (it is
 * claimed by a power) or one of your com-sats is in orbit there. Two nodes
 * within RELAY_LY are joined. Your com-sat reads live a star connected to
 * it - provided your ship is somewhere on the same network too, because
 * the numbers have to reach you - at HOP_H hours a hop. Anywhere else the
 * news still comes by freighter, as it always has (tradeanalyser.js).
 *
 * All numbers are Claude's but the 8 ly and the hour, which are Astra's. */
(function (global) {
  'use strict';

  var DAY = 86400;
  var RELAY_LY = 8;            // Astra, 2026-11-19
  var HOP_H = 1;               // Astra, 2026-11-19
  var RELAYS_PER_WORLD = 6;    // three planes, a pair in each (see relaysFor)
  var SAT_PRICE = 85000;       // a com-sat, at a yard (Claude's number)
  var SAT_MAX = 2;             // aboard at once
  var SAT_MIN_R = 1.6;         // a launch orbit at least this many world radii out

  function V() { return global.V; }
  function Sim() { return global.Sim; }

  /* ---- the public relays ------------------------------------------------ */
  /* The worlds the PUBLIC network serves: those the system was generated
   * with ports on. Not a dig's world or a station of yours (bug hunt
   * 2026-11-21): those ports arrive mid-session, after the relays are
   * placed and cached, so a world dig on a bare rock had no relays until
   * you reloaded and then six. Cover that depends on when you last loaded
   * is no cover. Off the network until somebody puts a sat up is the
   * honest version, and a com-sat of yours does exactly that. */
  function worldsWithPorts(sys) {
    var out = [], seen = {};
    (sys.ports || []).forEach(function (p) {
      var w = p.parentBody;
      if (p.dug || p.playerStation) return;
      if (!w || seen[w.id]) return;
      if (w.kind !== 'planet' && w.kind !== 'moon') return;
      seen[w.id] = true;
      out.push(w);
    });
    return out;
  }
  function muOf(b) {
    var Vv = V();
    return b.mu || (Vv && Vv.G ? Vv.G * b.mass : 6.6743e-20 * b.mass);
  }
  function relaysFor(sys, starId) {
    if (!sys) return [];
    if (sys._relays && sys._relaysStar === starId) return sys._relays;
    var out = [], RNG = global.RNG;
    if (RNG && (sys.ports || []).some(function (p) { return !p.playerStation; })) {
      var r = new RNG('relays|' + starId);
      var fac = ((sys.ports || []).filter(function (p) { return p.faction && !p.playerStation; })[0] || {}).faction || null;
      worldsWithPorts(sys).forEach(function (w) {
        /* Three planes a third of a turn apart and tilted differently, high
         * enough to see most of the world: with own-world service (linked)
         * the first cut, one plane at 4-7 radii, left 6% of port-moments
         * islands with every relay alive - a pad flickering in and out of
         * the network through its day. */
        /* ...and the real cure is the one real constellations use: PAIRS,
         * opposite each other in each plane. From the ground one of a pair
         * is above the horizon unless both sit almost exactly on it, so a
         * pad is an island only when all three pairs do at once. Three
         * planes, two to a plane. */
        var inc = r.range(0.3, 1.1), lan = r.angle(), ph = r.angle(), k = r.range(6, 10);
        for (var i = 0; i < RELAYS_PER_WORLD; i++) {
          var a = w.radius * k, plane = Math.floor(i / 2), half = i % 2;
          out.push({
            id: 'rl-' + starId + '-' + w.id + '-' + i, star: starId, body: w.id, bodyName: w.name,
            a: a, inc: (inc + plane * 0.7) % Math.PI, lan: lan + plane * 2 * Math.PI / 3, m0: ph + plane * 2.4 + half * Math.PI,
            period: 2 * Math.PI * Math.sqrt(a * a * a / muOf(w)),
            owner: fac, public: true
          });
        }
      });
    }
    sys._relays = out; sys._relaysStar = starId;
    return out;
  }
  /* A circular orbit's position at t, round its world's position then. */
  function orbitPos(o, center, t) {
    var th = o.m0 + 2 * Math.PI * t / o.period;
    var x = o.a * Math.cos(th), y = o.a * Math.sin(th);
    var ci = Math.cos(o.inc), si = Math.sin(o.inc), cl = Math.cos(o.lan), sl = Math.sin(o.lan);
    var y1 = y * ci, z1 = y * si;
    return { x: center.x + x * cl - y1 * sl, y: center.y + x * sl + y1 * cl, z: center.z + z1 };
  }
  function relayPos(sys, rl, t) {
    var w = sys.byId[rl.body];
    if (!w) return null;
    return orbitPos(rl, Sim().bodyPosition(w, sys, t), t);
  }

  /* ---- line of sight ------------------------------------------------------
   * Q (a relay) seen from P (a port). Any world or star the segment passes
   * through blocks it. A surface port sits at the bottom of its shaft,
   * inside its own world's sphere, so its own world is a horizon test
   * instead: the relay must be above the local horizon. */
  function blocks(c, R, P, Q) {
    var dx = Q.x - P.x, dy = Q.y - P.y, dz = Q.z - P.z;
    var L2 = dx * dx + dy * dy + dz * dz;
    if (L2 <= 0) return false;
    var s = ((c.x - P.x) * dx + (c.y - P.y) * dy + (c.z - P.z) * dz) / L2;
    s = Math.max(0, Math.min(1, s));
    var ex = P.x + dx * s - c.x, ey = P.y + dy * s - c.y, ez = P.z + dz * s - c.z;
    return ex * ex + ey * ey + ez * ez < R * R * 0.998;
  }
  function sees(sys, port, Q, t, P) {
    var S = Sim(), host = port.surface ? port.parentBody : null;
    P = P || S.bodyPosition(port, sys, t);
    if (host) {
      var C = S.bodyPosition(host, sys, t);
      var nx = P.x - C.x, ny = P.y - C.y, nz = P.z - C.z;
      if ((Q.x - P.x) * nx + (Q.y - P.y) * ny + (Q.z - P.z) * nz <= 0) return false;
    }
    var occ = occluders(sys, t);
    for (var i = 0; i < occ.length; i++) {
      if (occ[i].b === host) continue;
      if (blocks(occ[i].c, occ[i].R, P, Q)) return false;
    }
    return true;
  }
  /* Every world and star that can stand in the way, placed once per t. */
  function occluders(sys, t) {
    if (sys._occ && sys._occT === t) return sys._occ;
    var S = Sim(), out = [];
    (sys.bodies || []).forEach(function (b) {
      if (!b.radius || (b.kind !== 'planet' && b.kind !== 'moon' && b.kind !== 'star')) return;
      out.push({ b: b, c: S.bodyPosition(b, sys, t), R: b.radius });
    });
    sys._occ = out; sys._occT = t;
    return out;
  }
  /* Linked: a live relay in its system can see it. An island: none can.
   * A system with no network has no islands, only silence. */
  /* A relay serves the world it orbits: the ports on it and over it. It
   * is not a dish that reaches the next planet - the first test found
   * Mirven I's port still "linked" through Mirven II's relays, 0.4 AU off,
   * while its own were dark. Your com-sat, likewise, its own world. */
  function linked(G, sys, starId, port, t) {
    var wid = port.parentBody && port.parentBody.id;
    var rl = liveRelays(G, sys, starId, t).concat(satsIn(G, starId).filter(function (s) { return satLive(s, t); }))
      .filter(function (r) { return r.body === wid; });
    if (!rl.length) return false;
    var P = Sim().bodyPosition(port, sys, t);
    for (var i = 0; i < rl.length; i++) {
      var Q = rl[i].public ? relayPos(sys, rl[i], t) : satPos(sys, rl[i], t);
      if (Q && sees(sys, port, Q, t, P)) return true;
    }
    return false;
  }
  /* Asked every frame by the COMMS list, so remembered per port for ten
   * minutes of game time: a relay that far round its orbit has moved a few
   * degrees, and the answer is about the station's news, not its aerial. */
  var ISLAND_BUCKET = 600;
  function isIsland(G, sys, starId, port, t) {
    if (!port || !port.market) return false;
    if (!relaysFor(sys, starId).length && !satsIn(G, starId).length) return false;
    var key = Math.floor(t / ISLAND_BUCKET) + '|' + satsIn(G, starId).length;
    var c = sys._islands;
    if (!c || c.key !== key) c = sys._islands = { key: key, by: {} };
    if (c.by[port.id] === undefined) c.by[port.id] = !linked(G, sys, starId, port, t);
    return c.by[port.id];
  }

  /* ---- your com-sats ------------------------------------------------------ */
  function sats(G) { return (G && G.comsats) || []; }
  function satsIn(G, starId) { return sats(G).filter(function (s) { return s.star === starId; }); }
  function satPos(sys, s, t) {
    var w = sys.byId[s.body];
    return w ? orbitPos(s, Sim().bodyPosition(w, sys, t), t) : null;
  }
  function buyRefusal(G, port) {
    if (!G.ship) return 'no ship';
    if (!port || !yardAt(port)) return 'com-sats are sold at shipyards';
    if ((G.ship.comsats || 0) >= SAT_MAX) return 'cradle full - ' + SAT_MAX + ' aboard';
    if (G.ship.credits < SAT_PRICE) return SAT_PRICE.toLocaleString('en-US') + ' cr';
    return null;
  }
  function yardAt(port) {
    var role = port && port.market && port.market.role;
    return role === 'shipyard' || role === 'highport';
  }
  function buy(G, port) {
    var why = buyRefusal(G, port);
    if (why) return { ok: false, why: why };
    G.ship.credits -= SAT_PRICE;
    G.ship.comsats = (G.ship.comsats || 0) + 1;
    return { ok: true, text: 'Com-sat crated in the cradle. ' + G.ship.comsats + ' aboard.' };
  }
  /* Launch into a circular orbit round the world you are near, at your
   * height. Refused in words: docked, landed, too low, or nothing aboard. */
  function launchWorld(G, sys, t) {
    var S = Sim(), s = G.ship;
    if (!s || !s.pos || !S.dominantBody) return null;
    var w = S.dominantBody(s.pos, sys, t);
    return w && (w.kind === 'planet' || w.kind === 'moon') ? w : null;
  }
  function launchRefusal(G, sys, t) {
    var s = G.ship;
    if (!s) return 'no ship';
    if (!(s.comsats > 0)) return 'no com-sat aboard - a shipyard sells them';
    if (s.docked || s.landed) return 'launch from orbit';
    var w = launchWorld(G, sys, t);
    if (!w) return 'get into orbit round a world first';
    var C = Sim().bodyPosition(w, sys, t), Vv = V();
    var r = Vv.dist(s.pos, C);
    if (r < w.radius * SAT_MIN_R) return 'too low - climb above ' + SAT_MIN_R + ' world radii';
    return null;
  }
  function launch(G, sys, starId, t, starName) {
    var why = launchRefusal(G, sys, t);
    if (why) return { ok: false, why: why };
    var s = G.ship, w = launchWorld(G, sys, t), Vv = V();
    var C = Sim().bodyPosition(w, sys, t);
    var rv = Vv.sub(s.pos, C), a = Vv.len(rv);
    /* The plane of the orbit you are in, from r x v; circular at your height. */
    var vrel = s.vel;
    var ws = Sim().bodyState ? Sim().bodyState(w, sys, t) : null;
    if (ws && ws.vel) vrel = Vv.sub(s.vel, ws.vel);
    var h = Vv.cross(rv, vrel), hl = Vv.len(h) || 1;
    var nz = h.z / hl, inc = Math.acos(Math.max(-1, Math.min(1, nz)));
    var lan = Math.atan2(h.x, -h.y);
    /* Where in that plane the ship is now: the phase the sat starts at. */
    var cl = Math.cos(lan), sl = Math.sin(lan), ci = Math.cos(inc), si = Math.sin(inc);
    var x = rv.x * cl + rv.y * sl, y1 = -rv.x * sl + rv.y * cl;
    /* orbitPos is Rz(lan)·Rx(inc)·(x, y, 0): undo the turn, then read y off
     * whichever of y·cos i and y·sin i is the better conditioned. */
    var y = Math.abs(ci) >= Math.abs(si) ? y1 / ci : rv.z / si;
    var period = 2 * Math.PI * Math.sqrt(a * a * a / muOf(w));
    var th = Math.atan2(y, x);
    var sat = {
      id: 'cs-' + Math.round(t) + '-' + sats(G).length, star: starId, starName: starName || null,
      body: w.id, bodyName: w.name, a: a, inc: inc, lan: lan, period: period,
      m0: th - 2 * Math.PI * t / period, at: t
    };
    (G.comsats = G.comsats || []).push(sat);
    s.comsats -= 1;
    return { ok: true, sat: sat, text: 'Com-sat away round ' + w.name + ' - your terminal into the relay network. ' +
             'Live prices along the chain while your ship is on it.' };
  }

  /* ---- RTGs: when a world's relays go dark (slice 2, 2026-11-20) ---------
   * Each world's three relays share one service cycle: the owner's tender
   * calls every P days (seeded, RTG_P_MIN to RTG_P_MAX) and loads fuel for
   * the next cycle. Most cycles it comes on time and nothing goes dark.
   * Some cycles (RTG_LATE_P, seeded per cycle) it is late by D days, and
   * the world's relays are dark from the day the fuel runs out until it
   * comes - every port there an island, and the chain through the system
   * thinner. All on the rails: cycle k's start, whether it is late and by
   * how much are hashes of star, world and k.
   *
   * THE CONTRACT. From RTG_POST days before a late cycle runs out until
   * the tender would have come, the owner posts RTG fuel to the world's
   * port (missions.js relayOffers). Delivered, that gap never happens, or
   * ends that day: G.rtgFixed[star|world|k] = the day it was fixed. The
   * only state; everything else is the seed and the clock. */
  var RTG_P_MIN = 260, RTG_P_MAX = 620;   // days between tenders
  var RTG_LATE_P = 0.22;                  // chance a tender is late
  var RTG_LATE_MIN = 12, RTG_LATE_MAX = 75;  // days late
  var RTG_POST = 30;                      // days before the dark date the contract is posted
  var RTG_LOAD_T = 4;                     // t of RTG fuel a world's tender carries
  function hash01(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); h ^= h >>> 15;
    return (h >>> 0) / 4294967296;
  }
  function cycleOf(starId, bodyId) {
    var k = starId + '|' + bodyId;
    var P = (RTG_P_MIN + (RTG_P_MAX - RTG_P_MIN) * hash01('rtg-p|' + k)) * DAY;
    return { P: P, t0: -hash01('rtg-t0|' + k) * P };
  }
  function lapse(starId, bodyId, j) {
    var k = starId + '|' + bodyId + '|' + j;
    if (hash01('rtg-late|' + k) >= RTG_LATE_P) return null;
    var c = cycleOf(starId, bodyId);
    var from = c.t0 + (j + 1) * c.P;
    var D = (RTG_LATE_MIN + (RTG_LATE_MAX - RTG_LATE_MIN) * hash01('rtg-d|' + k)) * DAY;
    return { star: starId, body: bodyId, j: j, key: k, from: from, to: from + D };
  }
  /* Dark now? The gap after cycle j, unless somebody brought the fuel. */
  function darkSpan(G, starId, bodyId, t) {
    var c = cycleOf(starId, bodyId);
    var j = Math.floor((t - c.t0) / c.P) - 1;
    var L = lapse(starId, bodyId, j);
    if (!L || t < L.from || t >= L.to) return null;
    var fixed = G && G.rtgFixed ? G.rtgFixed[L.key] : undefined;
    if (typeof fixed === 'number' && fixed <= t) return null;
    return L;
  }
  function worldDark(G, starId, bodyId, t) { return !!darkSpan(G, starId, bodyId, t); }
  /* A lapse that is posted now: running out within RTG_POST days, or out
   * and not yet fixed. One per world at most. */
  function lapsePosted(G, starId, bodyId, t) {
    var c = cycleOf(starId, bodyId);
    var jNow = Math.floor((t - c.t0) / c.P);
    for (var j = jNow - 1; j <= jNow; j++) {
      var L = lapse(starId, bodyId, j);
      if (!L) continue;
      if (G && G.rtgFixed && G.rtgFixed[L.key] !== undefined) continue;
      if (t >= L.from - RTG_POST * DAY && t < L.to) return L;
    }
    return null;
  }
  /* Fuel delivered for a lapse: it never happens, or it ends now. */
  function fixLapse(G, L, t) {
    G.rtgFixed = G.rtgFixed || {};
    if (G.rtgFixed[L.key] !== undefined) return false;
    G.rtgFixed[L.key] = Math.max(t, L.from);
    return true;
  }
  /* The relays of this system that are alive at t. */
  function liveRelays(G, sys, starId, t) {
    var dead = {};
    return relaysFor(sys, starId).filter(function (r) {
      if (dead[r.body] === undefined) dead[r.body] = worldDark(G, starId, r.body, t);
      return !dead[r.body];
    });
  }

  /* YOUR COM-SAT'S FUEL. A load lasts SAT_LIFE days from launch or the
   * last refuel; then it is dark and reads nothing until you bring a
   * tonne of RTG fuel and refuel it, in orbit round its world. */
  var SAT_LIFE = 365, SAT_FUEL_T = 1;
  function satFuelTo(s) { return typeof s.fuelTo === 'number' ? s.fuelTo : (s.at || 0) + SAT_LIFE * DAY; }
  function satLive(s, t) { return t < satFuelTo(s); }
  function liveSats(G, t) { return sats(G).filter(function (s) { return satLive(s, t); }); }
  function refuelRefusal(G, sys, starId, t) {
    var s = G.ship;
    var w = launchWorld(G, sys, t);
    var here = sats(G).filter(function (x) { return x.star === starId && w && x.body === w.id; })[0];
    if (!here) return { why: 'get into orbit round the world your com-sat is over' };
    if (s.docked || s.landed) return { why: 'refuel it from orbit', sat: here };
    var held = (s.cargo && s.cargo.rtgfuel) || 0;
    if (held < SAT_FUEL_T) return { why: 'a tonne of RTG fuel aboard - an isotope refinery sells it', sat: here };
    return { why: null, sat: here };
  }
  function refuel(G, sys, starId, t) {
    var r = refuelRefusal(G, sys, starId, t);
    if (r.why) return { ok: false, why: r.why };
    G.ship.cargo.rtgfuel -= SAT_FUEL_T;
    if (G.ship.cargo.rtgfuel <= 1e-9) delete G.ship.cargo.rtgfuel;
    if (Sim().refreshShip) Sim().refreshShip(G.ship);
    r.sat.fuelTo = t + SAT_LIFE * DAY;
    return { ok: true, text: 'Com-sat over ' + r.sat.bodyName + ' refuelled - good for ' + SAT_LIFE + ' days.' };
  }

  /* THE ISOTOPE REFINERY: a reprocessing port (it already buys the waste)
   * makes RTG fuel too. Added when the system is handed out, after its
   * traffic was built, so no route moves (Economy.addProduction, own
   * stream). Idempotent. */
  var REFINERY_T_DAY = 0.8;
  function attachRefineries(sys) {
    var Eco = global.Economy;
    if (!sys || sys._rtgRefined || !Eco || !Eco.addProduction) return 0;
    var n = 0;
    (sys.ports || []).forEach(function (p) {
      if (!p.market || p.market.role !== 'reprocessing') return;
      if (Eco.addProduction(p, 'rtgfuel', REFINERY_T_DAY)) { p.isotopeRefinery = true; n++; }
    });
    sys._rtgRefined = true;
    return n;
  }

  /* ---- the chain between stars ------------------------------------------- 
   * Astra, 2026-11-20: "a break in the relay chain turns the chain into two
   * chains which can be re-connected." Each claimed system talks to its
   * neighbours through one long-range UPLINK, on an RTG of its own: the
   * same service cycle as a world's relays, keyed 'uplink' instead of a
   * world. While it is dark the star is not a node, so the chain through
   * it splits in two - each half still works on its own - and it joins
   * again when the uplink is fuelled (a contract at the system's main
   * port, missions.js relayOffers) or when a live com-sat of yours sits in
   * that system and bridges the gap. Keyed by star, so the chain is asked
   * without generating a single system. */
  var UPLINK = 'uplink';
  function uplinkDark(G, starId, t) { return !!darkSpan(G, starId, UPLINK, t); }
  function nodeStar(G, st) {
    var t = (G && G.t) || 0;
    if (!st) return false;
    if (satsIn(G, st.id).some(function (s) { return satLive(s, t); })) return true;
    return !!st.factionId && !uplinkDark(G, st.id, t);
  }
  function neighbours(gal) {
    if (gal._relayNbr) return gal._relayNbr;
    var Gx = global.Galaxy, stars = gal.stars, nb = {};
    for (var i = 0; i < stars.length; i++) nb[stars[i].id] = [];
    for (var a = 0; a < stars.length; a++) {
      for (var b = a + 1; b < stars.length; b++) {
        if (Gx.distance3(stars[a], stars[b]) <= RELAY_LY) {
          nb[stars[a].id].push(stars[b]); nb[stars[b].id].push(stars[a]);
        }
      }
    }
    gal._relayNbr = nb;
    return nb;
  }
  /* Hops from `from` to every node reachable over nodes; {} if from is not one. */
  function hopsFrom(G, gal, from) {
    var out = {};
    if (!gal || !from || !nodeStar(G, from)) return out;
    var nb = neighbours(gal), q = [from];
    out[from.id] = 0;
    while (q.length) {
      var s = q.shift();
      (nb[s.id] || []).forEach(function (n) {
        if (out[n.id] !== undefined || !nodeStar(G, n)) return;
        out[n.id] = out[s.id] + 1;
        q.push(n);
      });
    }
    return out;
  }
  /* THE HOP LIMIT (Astra, 2026-11-20: "hop limit to enforce the
   * development of hub systems"). A relay chain carries your traffic at
   * most SAT_HOPS stars before it has to be picked up and resent by one
   * of your own com-sats - a hub. So the route from here to a far star is
   * a run of stretches, each no longer than SAT_HOPS, with one of your
   * live sats at every join, and at least one of them on the route at all.
   * One sat covers a neighbourhood; a network of them, placed in the
   * right systems, covers a region. Breadth-first over (star, hops since
   * the last hub, met a hub yet), so the hop count is the shortest legal
   * route's. Returns { starId: hops } for every star you can read. */
  var SAT_HOPS = 3;
  function reachFrom(G, gal, from, maxHops) {
    var out = {};
    if (!gal || !from || !nodeStar(G, from)) return out;
    var N = maxHops || SAT_HOPS, t = (G && G.t) || 0;
    var hub = {};
    liveSats(G, t).forEach(function (s) { hub[s.star] = true; });
    var nb = neighbours(gal), seen = {}, q = [];
    function push(st, k, met, d) {
      var key = st.id + '|' + k + '|' + (met ? 1 : 0);
      if (seen[key]) return;
      seen[key] = true;
      if (met && out[st.id] === undefined) out[st.id] = d;
      q.push({ st: st, k: k, met: met, d: d });
    }
    var h0 = !!hub[from.id];
    push(from, 0, h0, 0);
    for (var qi = 0; qi < q.length; qi++) {
      var cur = q[qi];
      if (cur.k >= N) continue;
      (nb[cur.st.id] || []).forEach(function (n) {
        if (!nodeStar(G, n)) return;
        var isHub = !!hub[n.id];
        push(n, isHub ? 0 : cur.k + 1, cur.met || isHub, cur.d + 1);
      });
    }
    return out;
  }
  /* How old a far system's prices are by the chain, in days - or null when
   * they come by freighter instead (no live com-sat, you are off its
   * network, or the far star is beyond your hubs' reach). */
  function ageDaysFor(G, gal, here, target) {
    var my = liveSats(G, (G && G.t) || 0);
    if (!my.length || !here || !target) return null;
    var r = reachFrom(G, gal, here);
    if (r[target.id] === undefined) return null;
    return r[target.id] * HOP_H / 24;
  }
  /* For a status line: what your com-sats give you, here. */
  function reachHere(G, gal, here) {
    if (!sats(G).length) return null;
    var my = liveSats(G, (G && G.t) || 0);
    if (!my.length) return { on: false, n: 0, dark: true };
    var r = reachFrom(G, gal, here);
    var n = Object.keys(r).filter(function (id) { return id !== here.id; }).length;
    if (!n && r[here.id] === undefined) return { on: false, n: 0 };
    return { on: true, n: n };
  }

  /* ---- for the RELAY panel (main.js drawRelayPage, 2026-11-20) -----------
   * Astra: a panel "which tells you which sat you're connected to, and
   * shows which links are up" - a chain of sats and links, a sat that is
   * down marked as down, and one "destroyed but expected in the chain"
   * marked as gone. */

  /* The relay (or com-sat of yours) your ship is talking to: the nearest
   * live one in this system with a clear line to you. */
  function connectedTo(G, sys, starId, pos, t) {
    if (!sys || !pos) return null;
    var best = null, bestD = Infinity, me = { surface: false };
    var cand = liveRelays(G, sys, starId, t).map(function (r) { return { r: r, Q: relayPos(sys, r, t), mine: false }; })
      .concat(satsIn(G, starId).filter(function (s) { return satLive(s, t); })
        .map(function (s) { return { r: s, Q: satPos(sys, s, t), mine: true }; }));
    cand.forEach(function (c) {
      if (!c.Q) return;
      var V0 = V(), d = V0.dist(c.Q, pos);
      if (d < bestD && sees(sys, me, c.Q, t, pos)) { best = c; bestD = d; }
    });
    if (!best) return null;
    var name = best.mine ? 'your com-sat over ' + best.r.bodyName
                         : 'relay ' + (Number(String(best.r.id).split('-').pop()) + 1) + ' over ' + best.r.bodyName;
    return { relay: best.r, mine: best.mine, dist: bestD, name: name };
  }
  /* The chain from one star to another as it is BUILT - claimed stars and
   * your sats' stars, 8 ly apart - whatever is dark today, so a break shows
   * where it is rather than the chain simply ending. [] if none. */
  function chainPath(G, gal, from, to) {
    if (!gal || !from || !to) return [];
    var nb = neighbours(gal), prev = {}, q = [from], seen = {};
    function built(st) { return !!(st.factionId || satsIn(G, st.id).length); }
    seen[from.id] = true;
    while (q.length) {
      var s = q.shift();
      if (s.id === to.id) break;
      (nb[s.id] || []).forEach(function (n) {
        if (seen[n.id] || !built(n)) return;
        seen[n.id] = true; prev[n.id] = s; q.push(n);
      });
    }
    if (!seen[to.id]) return [];
    var path = [to];
    while (path[0].id !== from.id) path.unshift(prev[path[0].id]);
    return path;
  }
  /* A link in that chain, as the panel draws it: 'up', 'down' (dark - its
   * uplink is out of fuel, or your sat there is) or 'gone' (destroyed, and
   * still expected: G.relaysGone[star], for when relays can be shot). */
  function nodeState(G, st) {
    if (G && G.relaysGone && G.relaysGone[st.id]) return 'gone';
    return nodeStar(G, st) ? 'up' : 'down';
  }

  /* ---- islands felt: the news goes by courier (slice 3, 2026-11-20) ------
   * Astra, 2026-11-19: knocking a relay out "turns a station into an
   * island which gets its news by courier." An island still trades; what
   * it loses is the wire. So what the rest of the system can see of its
   * market is what the last ship OUT of it carried - the moment she left,
   * as it stood then - and what the island sees of everyone else is what
   * the last ship IN brought. Before the island went dark its figures
   * were on the wire as normal, so they are never older than that.
   *
   * Worked out on the timetable, not simulated: every lane touching the
   * port (Rumours.netOf, the same berthing network word of you rides) has
   * its departures and arrivals in closed form. A lane to another port of
   * the same dark world carries news only to another island, so it does
   * not count. Your own ship is a courier too: the last time you were
   * docked at an island, you carried its prices out (G.portSeen, kept by
   * main.js, not saved - a reload forgets it, which errs towards older). */
  var SINCE_STEP = 3600, SINCE_MAX = 7 * DAY;
  function islandSince(G, sys, starId, port, t) {
    var L = port.parentBody && darkSpan(G, starId, port.parentBody.id, t);
    if (L) return L.from;
    /* An island by geometry alone (rare with paired relays): look back an
     * hour at a time for the last moment it was linked. */
    var key = Math.floor(t / ISLAND_BUCKET) + '|' + port.id;
    var c = sys._islandSince || (sys._islandSince = {});
    if (c[key] !== undefined) return c[key];
    var since = t - SINCE_MAX;
    for (var k = 1; k * SINCE_STEP <= SINCE_MAX; k++) {
      if (linked(G, sys, starId, port, t - k * SINCE_STEP)) { since = t - k * SINCE_STEP; break; }
    }
    if (Object.keys(c).length > 400) sys._islandSince = c = {};
    c[key] = since;
    return since;
  }
  /* The lanes that berth at a port, with the far end of each. */
  function lanesAt(sys, portId) {
    var R = global.Rumours;
    if (!R || !R.netOf) return [];
    var net = R.netOf(sys), list = net.touch[portId] || [], out = [];
    for (var i = 0; i < list.length; i++) {
      var s = net.ships[list[i]];
      if (!s || !s.sched || s.orbit || !(s.sched.period > 0)) continue;
      var other = s.ports[0] === portId ? s.ports[1] : s.ports[0];
      if (!other || other === portId) continue;
      out.push({ sched: s.sched, other: other, owner: s.owner });
    }
    return out;
  }
  /* A cycle: leave FROM at cs, at TO from cs+c to cs+c+l, back at FROM at
   * cs+2c+l (rumours.js berthTime). The latest departure from X that has
   * reached the far end by t, and the latest arrival at X by t (as the
   * time it left the far end). -Infinity if none. */
  function lastOut(sched, X, t) {
    var P = sched.period, c = sched.cruise, l = sched.layover;
    var d0 = X === sched.to ? c + l : 0;
    var j = Math.floor((t - sched.t0 - d0 - c) / P);
    return sched.t0 + j * P + d0;
  }
  function lastIn(sched, X, t) {
    var P = sched.period, c = sched.cruise, l = sched.layover;
    var a0 = X === sched.to ? c : 2 * c + l;
    var j = Math.floor((t - sched.t0 - a0) / P);
    return sched.t0 + j * P + a0 - c;
  }
  function courier(G, sys, starId, port, t, dir) {
    var best = -Infinity;
    lanesAt(sys, port.id).forEach(function (ln) {
      var o = ln.owner;
      var far = sys.byId && sys.byId[ln.other];
      if (!far || isIsland(G, sys, starId, far, t)) return;
      var at = dir === 'out' ? lastOut(ln.sched, port.id, t) : lastIn(ln.sched, port.id, t);
      if (o && o.dead && (o.diedAt == null || at >= o.diedAt)) return;
      if (at > best) best = at;
    });
    return best;
  }
  /* WHEN `port`'s figures were last true, as seen from `from` (the port
   * you are docked at) or from your ship in flight (from = null). t when
   * neither end is an island. */
  function seenAt(G, sys, starId, port, t, from) {
    if (!sys || !port || !port.market) return t;
    var at = t;
    if (from && from !== port && from.market && isIsland(G, sys, starId, from, t)) {
      at = Math.min(at, Math.max(islandSince(G, sys, starId, from, t),
                                 courier(G, sys, starId, from, t, 'in')));
    }
    if (from !== port && isIsland(G, sys, starId, port, t)) {
      var mine = G && G.portSeen && typeof G.portSeen[port.id] === 'number' ? G.portSeen[port.id] : -Infinity;
      at = Math.min(at, Math.max(islandSince(G, sys, starId, port, t),
                                 courier(G, sys, starId, port, t, 'out'), mine));
    }
    return Math.min(t, at);
  }
  /* The same, in hours old - 0 for live. */
  function newsAgeH(G, sys, starId, port, t, from) {
    return Math.max(0, (t - seenAt(G, sys, starId, port, t, from)) / 3600);
  }
  /* "7 h by courier" / "3.2 days by courier", for a screen. */
  function fmtCourier(h) {
    if (!(h > 0.05)) return 'live';
    return (h < 48 ? (h < 10 ? h.toFixed(1) : Math.round(h)) + ' h' : (h / 24).toFixed(1) + ' days') + ' old, by courier';
  }

  var Comsats = {
    islandSince: islandSince, lanesAt: lanesAt, lastOut: lastOut, lastIn: lastIn,
    courier: courier, seenAt: seenAt, newsAgeH: newsAgeH, fmtCourier: fmtCourier,
    DAY: DAY, RELAY_LY: RELAY_LY, HOP_H: HOP_H, RELAYS_PER_WORLD: RELAYS_PER_WORLD,
    SAT_PRICE: SAT_PRICE, SAT_MAX: SAT_MAX, SAT_MIN_R: SAT_MIN_R,
    relaysFor: relaysFor, relayPos: relayPos, orbitPos: orbitPos, sees: sees,
    linked: linked, isIsland: isIsland,
    sats: sats, satsIn: satsIn, satPos: satPos, yardAt: yardAt, buyRefusal: buyRefusal, buy: buy,
    launchRefusal: launchRefusal, launch: launch,
    nodeStar: nodeStar, neighbours: neighbours, hopsFrom: hopsFrom, ageDaysFor: ageDaysFor, reachHere: reachHere,
    reachFrom: reachFrom, SAT_HOPS: SAT_HOPS,
    RTG_P_MIN: RTG_P_MIN, RTG_P_MAX: RTG_P_MAX, RTG_LATE_P: RTG_LATE_P, RTG_LATE_MIN: RTG_LATE_MIN, RTG_LATE_MAX: RTG_LATE_MAX,
    RTG_POST: RTG_POST, RTG_LOAD_T: RTG_LOAD_T, SAT_LIFE: SAT_LIFE, SAT_FUEL_T: SAT_FUEL_T, REFINERY_T_DAY: REFINERY_T_DAY,
    cycleOf: cycleOf, lapse: lapse, darkSpan: darkSpan, worldDark: worldDark, lapsePosted: lapsePosted, fixLapse: fixLapse,
    liveRelays: liveRelays, satFuelTo: satFuelTo, satLive: satLive, liveSats: liveSats,
    refuelRefusal: refuelRefusal, refuel: refuel, attachRefineries: attachRefineries,
    UPLINK: UPLINK, uplinkDark: uplinkDark,
    connectedTo: connectedTo, chainPath: chainPath, nodeState: nodeState
  };
  global.Comsats = Comsats;
  if (typeof module !== 'undefined' && module.exports) module.exports = Comsats;
})(typeof window !== 'undefined' ? window : globalThis);
