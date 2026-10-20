/* construction.js — station modules and the Crawler that carries them.
 *
 * Astra, 2026-10-20: "This is the new station-constructor, called the
 * Crawler. There's only one size, and it ships one L size module or two M
 * size modules or up to three S size modules, but you have to build the L
 * size first, to start hauling more freight in, otherwise you're just
 * stitching ship hulls together."
 *
 * Her answers, the same night:
 *   - A station starts as an L CORE; M and S modules bolt onto it and each
 *     adds a function. This replaces the old "grow S → M → L".
 *   - A Crawler is bought (commissioned at a shipyard) or hired.
 *   - Modules are BUILT AT A SHIPYARD, with build time, and the Crawler
 *     loads them there and hauls them to the site.
 *
 * This file is slice 1: the catalogue, ordering a module at a yard, the
 * yard holding it when it is done, and loading/unloading a Crawler under
 * the load rule. Founding a station from a core (slice 2) and hiring an NPC
 * Crawler (slice 3) come later — see claude/crawler-and-station-modules.md.
 *
 * Everything here is timestamp arithmetic on G, like the hull orders in
 * combat.js: nothing ticks, and skipping a month gives the right answer.
 */
(function (global) {
  'use strict';

  var DAY = 86400;

  /* ---- the load rule ------------------------------------------------------
   * One L, or two M, or up to three S. Written as weights in a bay of six
   * (L 6, M 3, S 2) because that is the one arithmetic all three of her
   * numbers agree with. It also lets one M and one S ride together (5 of
   * 6) — not something she said either way; flagged in the design doc. */
  var BAY = 6;
  var WEIGHT = { L: 6, M: 3, S: 2 };

  /* ---- the catalogue ------------------------------------------------------
   * Claude's starting list, offered to Astra to change. The core's look is
   * one of the four orbital patterns that already exist as station art;
   * every M and S module is a FUNCTION rather than new geometry, which is
   * what "within a stage, upgrades are functions" meant on the old plan. */
  var MODULES = [
    { id: 'core', size: 'L', name: 'Station core', price: 240000, days: 6,
      blurb: 'berths, cargo handling and the reactor — every station starts here',
      core: true },
    { id: 'market', size: 'M', name: 'Market hall', price: 90000, days: 3,
      blurb: 'a trade floor: the station buys and sells' },
    { id: 'refinery', size: 'M', name: 'Refinery line', price: 110000, days: 3,
      blurb: 'turns ore and hydrogen into something worth more' },
    { id: 'hab', size: 'M', name: 'Hab ring', price: 80000, days: 3,
      blurb: 'quarters and a concourse: passengers come and go' },
    { id: 'repair', size: 'M', name: 'Repair dock', price: 70000, days: 3,
      blurb: 'hull repairs for whoever docks' },
    { id: 'warehouse', size: 'M', name: 'Warehouse', price: 50000, days: 3,
      blurb: 'deep storage behind the market' },
    { id: 'berth', size: 'S', name: 'Extra berth', price: 30000, days: 1,
      blurb: 'one more clamp for traffic' },
    { id: 'battery', size: 'S', name: 'Defence battery', price: 45000, days: 1,
      blurb: 'guns that answer when somebody shoots at the station' },
    { id: 'relay', size: 'S', name: 'Comms relay', price: 20000, days: 1,
      blurb: 'prices and news arrive sooner' },
    { id: 'fuelstore', size: 'S', name: 'Fuel store', price: 25000, days: 1,
      blurb: 'a reactor that can go longer between deliveries' }
  ];
  var BY_ID = {};
  MODULES.forEach(function (m) { BY_ID[m.id] = m; });

  /* The core's pattern: the four orbital shapes in the station art. */
  var PATTERNS = ['cylinder', 'spine', 'ring', 'cradle'];

  function isCrawler(ship) { return !!ship && ship.hullId === 'crawler'; }

  function aboard(ship) { return (ship && ship.modules) || []; }

  function loadUsed(list) {
    var u = 0;
    for (var i = 0; i < list.length; i++) {
      var m = BY_ID[list[i].moduleId];
      u += m ? WEIGHT[m.size] : 0;
    }
    return u;
  }

  /* Does one more module of this size fit on top of what is aboard? */
  function fits(ship, moduleId) {
    var m = BY_ID[moduleId];
    if (!m) return false;
    return loadUsed(aboard(ship)) + WEIGHT[m.size] <= BAY;
  }

  /* ---- what you own ------------------------------------------------------
   * One list for every module that exists: on the slip (`due` in the
   * future), waiting at a yard (`at`), or aboard your Crawler (`aboard`).
   * Installed modules (slice 2) will carry `station` instead. */
  function owned(G) { return (G && G.stationModules) || []; }

  function hasCore(G) {
    return owned(G).some(function (r) { return r.moduleId === 'core'; });
  }

  function dockedPort(G) {
    var s = G && G.ship;
    return (s && s.docked && G.sys && G.sys.byId) ? G.sys.byId[s.docked] || null : null;
  }

  function isYard(port) {
    var C = global.Combat;
    return !!(C && C.isShipyard && C.isShipyard(port));
  }

  /* Why this yard will not take this order, or null. THE CORE COMES FIRST:
   * an M or S module with no core to bolt it to is "just stitching ship
   * hulls together", so a career that owns no core cannot order one. */
  function orderRefusal(G, moduleId) {
    var m = BY_ID[moduleId];
    if (!m) return 'no such module';
    var port = dockedPort(G);
    if (!port || !isYard(port)) return 'only a shipyard builds station modules';
    if (!m.core && !hasCore(G)) return 'a station starts as an L core — order the core first';
    if ((G.ship.credits || 0) < m.price) return 'need ' + m.price + ' cr';
    return null;
  }

  function order(G, moduleId, opts) {
    var why = orderRefusal(G, moduleId);
    if (why) return { ok: false, why: why };
    var m = BY_ID[moduleId], port = dockedPort(G), t = G.t || 0;
    var pattern = m.core ? ((opts && PATTERNS.indexOf(opts.pattern) >= 0) ? opts.pattern : PATTERNS[0]) : null;
    G.ship.credits -= m.price;
    if (!G.stationModules) G.stationModules = [];
    var rec = {
      id: 'sm' + Math.round(t) + '-' + moduleId + '-' + G.stationModules.length,
      moduleId: moduleId, pattern: pattern,
      port: port.id, portName: port.name || null,
      star: G.here ? G.here.id : null, starName: G.here ? G.here.name : null,
      placed: t, due: t + m.days * DAY, paid: m.price,
      aboard: false
    };
    G.stationModules.push(rec);
    return { ok: true, rec: rec, days: m.days };
  }

  function ready(rec, t) { return !!rec && (t || 0) >= rec.due; }

  /* Is this module waiting at the yard the player is docked at? */
  function hereAtYard(G, rec) {
    var s = G.ship;
    return !rec.aboard && !rec.station && ready(rec, G.t) && s && s.docked === rec.port &&
           (!rec.star || !G.here || rec.star === G.here.id);
  }

  function loadRefusal(G, rec) {
    var s = G.ship;
    if (!rec) return 'no such module';
    if (!isCrawler(s)) return 'only a Crawler carries station modules';
    if (rec.aboard) return 'already aboard';
    if (!ready(rec, G.t)) return 'still on the slip';
    if (!hereAtYard(G, rec)) return 'it is waiting at ' + (rec.portName || 'another yard') +
                                    (rec.starName ? ', ' + rec.starName : '');
    if (!fits(s, rec.moduleId)) {
      return 'no room in the bay — one L, or two M, or three S (' +
             loadUsed(aboard(s)) + ' of ' + BAY + ' used)';
    }
    return null;
  }

  function load(G, recId) {
    var rec = byId(G, recId);
    var why = loadRefusal(G, rec);
    if (why) return { ok: false, why: why };
    var s = G.ship;
    if (!s.modules) s.modules = [];
    rec.aboard = true;
    s.modules.push({ id: rec.id, moduleId: rec.moduleId });
    return { ok: true };
  }

  /* Back onto the yard's floor — only at a shipyard, which is the only
   * place with the cranes to take it. */
  function unload(G, recId) {
    var s = G.ship, rec = byId(G, recId);
    if (!rec || !rec.aboard) return { ok: false, why: 'not aboard' };
    var port = dockedPort(G);
    if (!port || !isYard(port)) return { ok: false, why: 'only a shipyard can lift a module off' };
    rec.aboard = false;
    rec.port = port.id; rec.portName = port.name || null;
    rec.star = G.here ? G.here.id : null; rec.starName = G.here ? G.here.name : null;
    s.modules = aboard(s).filter(function (a) { return a.id !== rec.id; });
    return { ok: true };
  }

  function byId(G, id) {
    var l = owned(G);
    for (var i = 0; i < l.length; i++) if (l[i].id === id) return l[i];
    return null;
  }

  /* A Crawler blown up with modules aboard loses them: they were in the
   * hull. Called from the death path with the ship about to be stripped. */
  function lostWith(G, ship) {
    var gone = aboard(ship).map(function (a) { return a.id; });
    if (!gone.length) return 0;
    G.stationModules = owned(G).filter(function (r) { return gone.indexOf(r.id) < 0; });
    ship.modules = [];
    return gone.length;
  }

  /* The hand-over lines, once each, when a module comes off the slip. */
  function announce(G, t) {
    var out = [];
    owned(G).forEach(function (r) {
      if (r.announced || !ready(r, t)) return;
      r.announced = true;
      var m = BY_ID[r.moduleId] || { name: r.moduleId };
      out.push('Your ' + m.name.toLowerCase() + (r.pattern ? ' (' + r.pattern + ')' : '') +
               ' is ready at ' + (r.portName || 'the yard') +
               (r.starName ? ', ' + r.starName : '') + ' — a Crawler can load it there.');
    });
    return out;
  }

  var Construction = {
    MODULES: MODULES, BY_ID: BY_ID, PATTERNS: PATTERNS,
    BAY: BAY, WEIGHT: WEIGHT, DAY: DAY,
    isCrawler: isCrawler, aboard: aboard, loadUsed: loadUsed, fits: fits,
    owned: owned, hasCore: hasCore, byId: byId,
    orderRefusal: orderRefusal, order: order, ready: ready, hereAtYard: hereAtYard,
    loadRefusal: loadRefusal, load: load, unload: unload,
    lostWith: lostWith, announce: announce
  };

  global.Construction = Construction;
  if (typeof module !== 'undefined' && module.exports) module.exports = Construction;
})(typeof window !== 'undefined' ? window : globalThis);
