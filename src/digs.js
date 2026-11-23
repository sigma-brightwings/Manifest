/* digs.js - the world's own drilling teams (2026-11-19).
 *
 * Astra, 2026-10-17: drilling teams work "both" for the player and for the
 * world, and "there can and should be more than one land port per world
 * sometimes". The player's side is outposts.js. This is the world's: NPC
 * teams dig new ground ports, each on its own dated schedule, and a port
 * opens on the day its dig finishes with traffic from that day.
 *
 * ON THE RAILS. A star's digs are a pure function of the system it
 * generated and a substream of its own (RNG 'digs|<star>'), never of when
 * you look. Each dig has a start and a finishing day in game time. Some
 * finished before day 0 - those are the extra ground ports a world has
 * from the start (the gentle bump agreed 2026-10-17) - some are going now,
 * and some have not begun. Skip six months and the right ports are open.
 *
 * NOTHING ELSE MOVES. The generator is not touched: no existing pad, port,
 * route or fingerprint changes. A dug port is put into its system when it
 * is open, the way a station of yours is (stations.js inject), with routes
 * of its own whose clocks start the day she opens (Gen.addPortRoutes).
 *
 * WHAT THE PLAYER CAN CHANGE. Only one thing: supplies delivered to a dig
 * (the dig missions) bring its day forward. That lives in G.digs[id], the
 * single piece of state this module saves.
 *
 * WHERE. Landable worlds only (the gravity rule comes first, as for every
 * pad), on dry ground (Weather.dryAt), and not in nobody's systems, which
 * have no ports at all. Mostly the worlds nobody lives on: a mining head's
 * second pad is the usual case. All numbers are Claude's. */
(function (global) {
  'use strict';

  var DAY = 86400;
  /* Measured over 60 stars of 'kawartha' (2026-11-19): at 0.18/0.07 an
   * inhabited system had about three digs over the five years and 0.7
   * extra ports on day 0 - not gentle. Halved: about 1.5 and 0.35. */
  var CH_BARE = 0.09;        // a world nobody lives on gets a dig
  var CH_LIVED = 0.035;      // a habitable one, less often - it has its pads
  var START_MIN = -560, START_MAX = 1500;   // days, against game time 0
  var DUR_MIN = 70, DUR_MAX = 220;          // days a dig takes
  var SUPPLY_DAYS = 6;       // days brought forward per tonne-batch delivered (see supply)

  function Gen() { return global.Gen; }
  function hash(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  /* Can a pad go here at all? */
  function landable(b) {
    var g = Gen();
    if (!b || (b.kind !== 'planet' && b.kind !== 'moon')) return false;
    if (b.type === 'gasGiant' || b.type === 'iceGiant') return false;
    return !(g && g.surfaceGravity && g.MAX_SURFACE_G) || g.surfaceGravity(b) <= g.MAX_SURFACE_G;
  }
  function dryHere(b, lat, lon) {
    var W = global.Weather;
    if (!W || !W.dryAt || !W.padDir) return true;
    try { return W.dryAt(b, W.padDir(b, lat, lon)); } catch (e) { return true; }
  }
  function hasPorts(sys) { return !!(sys && sys.ports && sys.ports.some(function (p) { return !p.playerStation && !p.dug; })); }

  /* Every dig this star will ever have, cached on the system. */
  function planFor(sys, starId) {
    if (!sys) return [];
    if (sys._digs && sys._digsStar === starId) return sys._digs;
    var out = [], RNG = global.RNG;
    if (RNG && hasPorts(sys)) {
      var r = new RNG('digs|' + starId);
      (sys.bodies || []).forEach(function (b) {
        if (!landable(b)) return;
        /* Every world draws the same number of times whatever it gets, so
         * one world's luck never moves the next one's. */
        var roll = r.next(), lat = r.range(-1.2, 1.2), lon = r.angle(),
            start = r.range(START_MIN, START_MAX), dur = r.range(DUR_MIN, DUR_MAX), crew = 2 + Math.floor(r.next() * 3);
        var lived = b.kind === 'planet' && b.habitable;
        if (roll >= (lived ? CH_LIVED : CH_BARE)) return;
        /* Dry ground: try a few spots off the first, on their own hash. */
        var ok = dryHere(b, lat, lon);
        for (var k = 1; !ok && k < 10; k++) {
          var h = hash(starId + '|' + b.id + '|' + k);
          lat = ((h % 1000) / 1000 - 0.5) * 2.4;
          lon = ((h >>> 10) % 6283) / 1000;
          ok = dryHere(b, lat, lon);
        }
        if (!ok) return;
        var faction = null;
        var near = (b.children || []).filter(function (c) { return c.docking && c.faction; })[0] ||
                   (sys.ports || []).filter(function (p) { return p.faction && !p.playerStation; })[0];
        if (near) faction = near.faction;
        out.push({
          id: 'dg-' + starId + '-' + b.id,
          star: starId, body: b.id, bodyName: b.name,
          lat: lat, lon: lon, crew: crew,
          startAt: start * DAY, doneAt0: (start + dur) * DAY,
          mining: !lived, faction: faction
        });
      });
    }
    sys._digs = out; sys._digsStar = starId;
    return out;
  }

  function stateOf(G, dig) { return (G && G.digs && G.digs[dig.id]) || null; }
  /* The day it opens: its schedule, brought forward by what was delivered. */
  function doneAt(G, dig) {
    var s = stateOf(G, dig);
    return s && typeof s.doneAt === 'number' ? s.doneAt : dig.doneAt0;
  }
  function isOpen(G, dig, t) { return t >= doneAt(G, dig); }
  function isDigging(G, dig, t) { return t >= dig.startAt && t < doneAt(G, dig); }
  function progress(G, dig, t) {
    var a = dig.startAt, b = doneAt(G, dig);
    return Math.max(0, Math.min(1, (t - a) / Math.max(1, b - a)));
  }
  function portIdOf(dig) { return dig.id; }

  /* The port she is, attached to her system. Same machinery as a station
   * of yours (stations.js makePort): a pad off makeSurfacePort, a market,
   * dressing, and routes of her own from her opening day. */
  function makePort(G, sys, dig) {
    var g = Gen(), Eco = global.Economy, RNG = global.RNG;
    var host = sys.byId[dig.body];
    if (!g || !g.makeSurfacePort || !g.attachPort || !host || !RNG) return null;
    var port = g.makeSurfacePort(host, new RNG('dig-pad|' + dig.id), 0, new RNG('dig-ug|' + dig.id), false);
    port.id = portIdOf(dig);
    port.lat = dig.lat; port.lon = dig.lon;
    port.dug = true;
    port.digId = dig.id;
    port.siteKey = dig.id;
    if (dig.mining) port.forceRole = 'mining';
    port.faction = dig.faction;
    g.attachPort(sys, host, port);
    if (Eco && Eco.buildPortMarket) {
      Eco.buildPortMarket(port, host, sys, new RNG('dig-market|' + dig.id));
      if (Eco.signature) Eco.signature(port.market.rows);
    }
    if (g.dressPort) g.dressPort(sys, port, new RNG('dig-dress|' + dig.id));
    port.livery = 'civ';
    if (g.addPortRoutes) g.addPortRoutes(sys, port, new RNG('dig-traffic|' + dig.id), doneAt(G, dig));
    return port;
  }

  /* Put every dig of this star that is open by now into its system.
   * Idempotent; called whenever main.js hands a system out, and each frame
   * in it (update), so one opening while you watch appears on the day. */
  function inject(G, sys, starId) {
    if (!sys || !sys.byId) return 0;
    var t = (G && G.t) || 0, n = 0;
    planFor(sys, starId).forEach(function (dig) {
      if (!isOpen(G, dig, t) || sys.byId[portIdOf(dig)]) return;
      if (makePort(G, sys, dig)) n++;
    });
    return n;
  }

  /* Each frame in a system: open what is due, and say so if you are here
   * on the day (a port that opened years ago is just there). */
  function update(G, sys, starId, t, hooks) {
    var said = [];
    planFor(sys, starId).forEach(function (dig) {
      if (!isOpen(G, dig, t) || sys.byId[portIdOf(dig)]) return;
      var port = makePort(G, sys, dig);
      if (!port) return;
      if (t - doneAt(G, dig) < 2 * DAY) {
        var line = 'A drilling team is through on ' + dig.bodyName + ': ' + port.name + ' opens today.';
        said.push(line);
        if (hooks && hooks.say) hooks.say(line, 9);
        if (global.Journal && global.Journal.add) global.Journal.add(G, 'news', line);
      }
    });
    return said;
  }

  /* Digs going on now in this system, for the scanner and the missions. */
  function active(G, sys, starId, t) {
    return planFor(sys, starId).filter(function (d) { return isDigging(G, d, t); });
  }
  /* Digs anywhere in the systems already built, for the mission board. */
  function activeNear(G, t) {
    var out = [];
    var cache = (G && G.systemCache) || {};
    Object.keys(cache).forEach(function (sid) {
      var sys = cache[sid];
      if (sys) active(G, sys, sid, t).forEach(function (d) { out.push(d); });
    });
    return out;
  }

  /* Supplies delivered bring the day forward: SUPPLY_DAYS for each batch,
   * never before the day of delivery and never before half the dig is
   * done (the hole is still a hole). The one thing a player changes. */
  function supply(G, dig, t, batches) {
    G.digs = G.digs || {};
    var s = G.digs[dig.id] || (G.digs[dig.id] = {});
    var cur = doneAt(G, dig);
    if (t >= cur) return cur;
    var floor = Math.max(t, dig.startAt + 0.5 * (dig.doneAt0 - dig.startAt));
    s.doneAt = Math.max(floor, cur - (batches || 1) * SUPPLY_DAYS * DAY);
    s.supplied = (s.supplied || 0) + (batches || 1);
    return s.doneAt;
  }

  function statusLine(G, dig, t) {
    if (isOpen(G, dig, t)) return 'dug out - a port stands here';
    if (t < dig.startAt) return 'a dig is planned here';
    return dig.crew + ' drillers at work, ' + Math.floor(progress(G, dig, t) * 100) + '%, opens in ' +
           Math.max(1, Math.ceil((doneAt(G, dig) - t) / DAY)) + ' days';
  }

  var Digs = {
    DAY: DAY, CH_BARE: CH_BARE, CH_LIVED: CH_LIVED, START_MIN: START_MIN, START_MAX: START_MAX,
    DUR_MIN: DUR_MIN, DUR_MAX: DUR_MAX, SUPPLY_DAYS: SUPPLY_DAYS,
    landable: landable, planFor: planFor, doneAt: doneAt, isOpen: isOpen, isDigging: isDigging,
    progress: progress, portIdOf: portIdOf, makePort: makePort, inject: inject, update: update,
    active: active, activeNear: activeNear, supply: supply, statusLine: statusLine
  };
  global.Digs = Digs;
  if (typeof module !== 'undefined' && module.exports) module.exports = Digs;
})(typeof window !== 'undefined' ? window : globalThis);
