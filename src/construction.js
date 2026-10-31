/* construction.js — the Crawler and the station component crates she carries.
 *
 * Astra, 2026-10-20, in three steps:
 *   "This is the new station-constructor, called the Crawler. There's only
 *    one size ... you have to build the L size first ... otherwise you're
 *    just stitching ship hulls together."
 *   "we can actually have crawlers be the frame for L size bays, so they
 *    become the first bay in a station, and carry the station's
 *    components, for if it's to be a skimmer or a shipyard. To get the XL
 *    sized shipyards, we stitch two crawlers together."
 *   "6 to a cube for S modules and 4 for M modules, 2 for L modules and 1
 *    for XL modules which are station component crates."
 * And her answers: a Crawler that becomes a station stays one (permanent);
 * every player-buildable station type comes from a Crawler plus the right
 * crates; Crawlers can chain, more than two.
 *
 * So the Crawler IS the station's first L bay — there is no separate core.
 * Her 24 container cubes carry CRATES of station components, one size per
 * cube, or ordinary freight. A dedicated hauler still beats her at freight;
 * she carries it because she can, and each cube is drawn as what is in it.
 *
 * This file: the crate catalogue, ordering crates at a shipyard (build
 * time, like hulls), the cube packing, loading and unloading. Founding a
 * station from a loaded Crawler, and stitching, are the next slice — see
 * claude/crawler-and-station-modules.md.
 *
 * Storage keeps the names it had before crates replaced modules
 * (G.stationModules, ship.modules): nothing shipped with the old shape.
 */
(function (global) {
  'use strict';

  var DAY = 86400;

  /* ---- the cubes -------------------------------------------------------- */
  var CUBES = 24;                                   // 2 x 2 x 6 in her truss
  var PER_CUBE = { S: 6, M: 4, L: 2, XL: 1 };       // Astra's numbers
  /* Freight in a cube that holds no crates. Game-scale tonnes, like every
   * hold in the game: 24 cubes of it is 600 t, short of a Leviathan's 900,
   * so the dedicated haulers stay the better freighters. Claude's number. */
  var TONNES_PER_CUBE = 25;
  var SIZES = ['XL', 'L', 'M', 'S'];

  /* ---- the catalogue ----------------------------------------------------
   * Claude's starting list, offered to Astra to change. `serves` names the
   * station types a crate belongs to; which crates FOUND which type is the
   * next slice's bill of crates. Build days go by size.
   *
   * PRICED LIKE MID-TIER SHIPS (Astra, 2026-10-20: "modules are like the
   * price of mid tier ships each, so building out a large size station is
   * an expensive, but often worthwhile goal"). The M hulls run 61-88k and
   * the Kestrel to the Longhaul 120-165k, so S crates sit at 60-75k, M at
   * 80-110k, L at 120-165k and the one XL, the slipway, a step above. */
  var CRATES = [
    { id: 'slipway',   size: 'XL', name: 'Slipway',          price: 200000, days: 7, serves: ['shipyard'],
      blurb: 'where hulls are built — the heart of a shipyard' },
    { id: 'skimrig',   size: 'L',  name: 'Skimmer rig',      price: 150000, days: 4, serves: ['skimmer'],
      blurb: 'scoops and tanks for a gas giant\'s upper air' },
    { id: 'refinery',  size: 'L',  name: 'Refinery line',    price: 165000, days: 4, serves: ['refinery', 'skimmer'],
      blurb: 'turns ore and hydrogen into something worth more' },
    { id: 'oreworks',  size: 'L',  name: 'Ore works',        price: 140000, days: 4, serves: ['mining'],
      blurb: 'crushers and a receiving bay for mining traffic' },
    { id: 'market',    size: 'L',  name: 'Market hall',      price: 130000, days: 4, serves: ['market'],
      blurb: 'a trade floor: the station buys and sells' },
    { id: 'habring',   size: 'L',  name: 'Hab ring',         price: 120000, days: 4, serves: ['hab'],
      blurb: 'quarters and a concourse: passengers come and go' },
    { id: 'warehouse', size: 'M',  name: 'Warehouse',        price: 80000, days: 2, serves: ['market', 'mining', 'refinery'],
      blurb: 'deep storage behind the market' },
    { id: 'repair',    size: 'M',  name: 'Repair dock',      price: 95000, days: 2, serves: ['shipyard', 'market'],
      blurb: 'hull repairs for whoever docks' },
    { id: 'reactor',   size: 'M',  name: 'Reactor pile',     price: 110000, days: 2, serves: ['*'],
      blurb: 'more power for a bigger station' },
    { id: 'quarters',  size: 'M',  name: 'Crew quarters',    price: 85000, days: 2, serves: ['*'],
      blurb: 'bunks for the people who run the place' },
    { id: 'berth',     size: 'S',  name: 'Berth clamp',      price: 60000, days: 1, serves: ['*'],
      blurb: 'one more clamp for traffic' },
    { id: 'battery',   size: 'S',  name: 'Defence battery',  price: 75000, days: 1, serves: ['*'],
      blurb: 'guns that answer when somebody shoots at the station' },
    { id: 'relay',     size: 'S',  name: 'Comms relay',      price: 62000, days: 1, serves: ['*'],
      blurb: 'prices and news arrive sooner' },
    { id: 'fuelcell',  size: 'S',  name: 'Fuel cell',        price: 65000, days: 1, serves: ['*'],
      blurb: 'a reactor that can go longer between deliveries' }
  ];
  var BY_ID = {};
  CRATES.forEach(function (c) { BY_ID[c.id] = c; });

  function isCrawler(ship) { return !!ship && ship.hullId === 'crawler'; }
  function aboard(ship) {
    return ((ship && ship.modules) || []).filter(function (a) { return BY_ID[a.crateId]; });
  }

  /* ---- packing ---------------------------------------------------------- */
  function countsOf(list) {
    var n = { S: 0, M: 0, L: 0, XL: 0 };
    for (var i = 0; i < list.length; i++) {
      var c = BY_ID[list[i].crateId || list[i]];
      if (c) n[c.size]++;
    }
    return n;
  }
  /* Cubes the crates take: one size per cube, filled to its count. */
  function crateCubes(list) {
    var n = countsOf(list), u = 0;
    for (var i = 0; i < SIZES.length; i++) u += Math.ceil(n[SIZES[i]] / PER_CUBE[SIZES[i]]);
    return u;
  }
  function freightOf(ship) {
    var Sim = global.Sim;
    if (Sim && Sim.cargoMass) return Sim.cargoMass(ship);
    var t = 0;
    for (var k in (ship && ship.cargo) || {}) t += ship.cargo[k] || 0;
    return t;
  }
  function freightCubes(ship) { return Math.ceil(freightOf(ship) / TONNES_PER_CUBE - 1e-9); }

  /* Her hold is whatever the crates leave: each free cube is a container. */
  function capFor(ship) {
    return Math.max(0, CUBES - crateCubes(aboard(ship))) * TONNES_PER_CUBE;
  }
  /* combat.js syncLegacy owns cargoCap (hull, less hab units, less crate
   * cubes); this asks it to recompute after a crate moves. */
  function applyCap(ship) {
    var C = global.Combat;
    if (C && C.syncLegacy) C.syncLegacy(ship);
    else if (isCrawler(ship)) ship.cargoCap = capFor(ship);
    return ship && ship.cargoCap;
  }

  /* Would one more crate of this kind fit, beside the freight aboard? */
  function fits(ship, crateId) {
    var c = BY_ID[crateId];
    if (!c) return false;
    var list = aboard(ship).concat([{ crateId: crateId }]);
    return crateCubes(list) + freightCubes(ship) <= CUBES;
  }

  /* What each of the 24 cubes holds, for the renderer: null (empty),
   * { kind: 'freight' }, or { kind: 'crate', size, n } with n crates in it.
   * Crates fill from the stern, biggest first; freight takes the next
   * cubes forward. Pure, so the same load always draws the same. */
  function layout(ship) {
    var out = [], i;
    for (i = 0; i < CUBES; i++) out.push(null);
    var n = countsOf(aboard(ship)), at = 0;
    for (var s = 0; s < SIZES.length; s++) {
      var z = SIZES[s], left = n[z];
      while (left > 0 && at < CUBES) {
        var k = Math.min(left, PER_CUBE[z]);
        out[at++] = { kind: 'crate', size: z, n: k };
        left -= k;
      }
    }
    var f = freightCubes(ship);
    for (i = 0; i < f && at < CUBES; i++) out[at++] = { kind: 'freight' };
    return out;
  }
  /* The showroom's Crawler: every container full, as she was drawn. */
  function fullLayout() {
    var out = [];
    for (var i = 0; i < CUBES; i++) out.push({ kind: 'freight' });
    return out;
  }

  /* ---- what a load can found (Astra agreed, 2026-10-20) -----------------
   * Every crewed station needs Crew quarters. Then one DEFINING crate sets
   * the type and one more makes it work; everything else is an upgrade.
   * A load with two defining crates founds a station that does both. The
   * XL shipyard is two stitched Crawlers, a slipway in each — stitching is
   * its own slice, so here it is listed and never satisfied by one hull. */
  var STATIONS = [
    { id: 'market',   name: 'Market station',   defining: 'market',   needs: ['warehouse'] },
    { id: 'refinery', name: 'Refinery',         defining: 'refinery', needs: ['warehouse'] },
    { id: 'skimmer',  name: 'Skimmer station',  defining: 'skimrig',  needs: ['refinery'] },
    { id: 'mining',   name: 'Mining station',   defining: 'oreworks', needs: ['warehouse'] },
    { id: 'hab',      name: 'Passenger hab',    defining: 'habring',  needs: ['berth', 'berth'] },
    { id: 'shipyard', name: 'Shipyard',         defining: 'slipway',  needs: ['repair'] },
    { id: 'shipyardXL', name: 'XL shipyard',    defining: 'slipway',  needs: ['repair'], crawlers: 2 }
  ];
  var HAB_CRATE = 'quarters';

  /* For each station type: can this list of crates found it, and if not,
   * what is missing. `list` is crate ids or records with crateId. */
  function canFound(list) {
    var have = {};
    list.forEach(function (x) { var id = x.crateId || x; have[id] = (have[id] || 0) + 1; });
    return STATIONS.map(function (st) {
      var want = {};
      [st.defining, HAB_CRATE].concat(st.needs).forEach(function (id) { want[id] = (want[id] || 0) + 1; });
      var missing = [];
      for (var id in want) {
        var short = want[id] - (have[id] || 0);
        for (var k = 0; k < short; k++) missing.push(id);
      }
      if (st.crawlers && st.crawlers > 1) missing.push('second Crawler');
      return { id: st.id, name: st.name, ok: !missing.length, missing: missing,
               defining: !!have[st.defining] };
    });
  }

  /* ---- her craft bay (Astra, 2026-10-20) --------------------------------
   * A tug is required — only tugs have grab arms, so only a tug can move
   * parts out of the crates in orbit. The standard loadout comes with every
   * Crawler; a yard changes it for the difference. Her crew flies them.
   * MORE TUGS SPEED UP THE WORK, which is what makes buying one mean
   * anything (Astra): the rates below are what founding will spend.
   *
   * THE PADS ARE THE RULE (Astra picked this, 2026-10-20, from her own
   * re-exported model): two S pads side by side by the door (`padS0`,
   * `padS1`) and one M pad further in (`padM`). An S pad takes an S craft;
   * the M pad takes one M craft OR one S craft. So the bay holds three S
   * craft, or two S and one M. (This replaced "three S slots, an M craft
   * takes two", which the model never had.)
   *
   * Rates are Claude's first numbers, in container cubes a day: a tug
   * unpacks crates in orbit; a shuttle carries them down to a surface site
   * (a surface station needs both — unpacked up top, then ferried). */
  var PADS = ['S', 'S', 'M'];
  var CRAFT = {
    tug:     { name: 'Bollard tug',   size: 'S', hull: 'bollard', price: 44000, unpack: 1.5, ferry: 0 },
    shuttle: { name: 'Wren shuttle',  size: 'S', hull: 'wren',    price: 18000, unpack: 0,   ferry: 1.0 },
    shuttleM:{ name: 'Heavy shuttle', size: 'M', hull: 'heavyshuttle', price: 60000, unpack: 0, ferry: 2.5 },
    /* Astra, 2026-10-20: "there's also an M size tug in the models we
     * currently have, and one of those unloads it a higher speed, but not
     * double." The art is tug-m (the hauler flies it). Half again an S
     * tug's rate. With the pads it earns its place on the M pad, where it
     * out-works the S tug that would otherwise sit there; priced at half
     * again an S tug, like its rate. */
    tugM:    { name: 'Heavy tug',     size: 'M', hull: 'heavytug', price: 66000, unpack: 2.25, ferry: 0 }
  };
  /* Which pad each craft sits on, or null if the list doesn't fit: M craft
   * on the M pad, S craft on the S pads first, then the M pad. */
  function padsFor(craft) {
    var free = PADS.slice(), out = [];
    var order = craft.map(function (c, i) { return i; }).sort(function (a, b) {
      return (CRAFT[craft[b]] && CRAFT[craft[b]].size === 'M') - (CRAFT[craft[a]] && CRAFT[craft[a]].size === 'M');
    });
    for (var k = 0; k < order.length; k++) {
      var c = CRAFT[craft[order[k]]];
      if (!c) return null;
      var at = c.size === 'M' ? free.indexOf('M') : (free.indexOf('S') >= 0 ? free.indexOf('S') : free.indexOf('M'));
      if (at < 0) return null;
      out[order[k]] = free[at]; free[at] = null;
    }
    return out;
  }
  function isTug(c) { return CRAFT[c] && CRAFT[c].unpack > 0; }
  /* ONLY HER OWN CRAFT, EVER (Astra, 2026-10-20): "the S size bay on the
   * crawler can only ever carry the shuttles and the tugs, that way we
   * don't have custom-ship-won't-fit problems later." The bay is sized to
   * these four and nothing else: no player ship, no fleet hull, no future
   * modular ship docks in it. Anything that ever tries to put a hull in
   * her bay asks this first. */
  function bayTakes(craftId) { return Object.prototype.hasOwnProperty.call(CRAFT, craftId); }
  var LOADOUTS = [
    { id: 'standard',  name: 'Standard',        craft: ['tug', 'tug', 'shuttle'],
      blurb: 'balanced: builds in orbit and ferries to the surface' },
    { id: 'orbital',   name: 'Orbital push',    craft: ['tug', 'tug', 'tug'],
      blurb: 'faster in orbit; nothing to ferry down' },
    { id: 'planetary', name: 'Planetary push',  craft: ['tug', 'tug', 'shuttleM'],
      blurb: 'the heavy shuttle on the M pad: much faster to the surface' },
    { id: 'heavytug',  name: 'Heavy tug',       craft: ['tug', 'shuttle', 'tugM'],
      blurb: 'the heavy tug on the M pad: faster in orbit, still ferries' },
    { id: 'heavyorbit',name: 'Heavy orbital',   craft: ['tug', 'tug', 'tugM'],
      blurb: 'fastest station building in orbit; nothing to ferry down' }
  ];
  var LOADOUT_BY_ID = {};
  LOADOUTS.forEach(function (l) { LOADOUT_BY_ID[l.id] = l; });

  function loadoutOf(ship) {
    if (!isCrawler(ship)) return null;
    return LOADOUT_BY_ID[ship && ship.craftBay] || LOADOUT_BY_ID.standard;
  }
  function craftRates(loadout) {
    var r = { unpack: 0, ferry: 0, tugs: 0 };
    (loadout ? loadout.craft : []).forEach(function (c) {
      r.unpack += CRAFT[c].unpack; r.ferry += CRAFT[c].ferry;
      if (isTug(c)) r.tugs++;
    });
    return r;
  }
  /* Days to put this load up, in orbit or on a surface, with this bay. */
  function buildDaysFor(list, loadout, surface) {
    var cubes = crateCubes(list);
    if (!cubes) return 0;
    var r = craftRates(loadout);
    if (!r.tugs) return Infinity;
    var orbit = cubes / r.unpack;
    if (!surface) return orbit;
    return r.ferry > 0 ? orbit + cubes / r.ferry : Infinity;
  }
  /* What a yard charges to change her bay: new craft at full price, craft
   * that leave at seven tenths, like any trade-in. */
  function loadoutCost(fromId, toId) {
    var a = (LOADOUT_BY_ID[fromId] || LOADOUT_BY_ID.standard).craft.slice();
    var b = (LOADOUT_BY_ID[toId] || LOADOUT_BY_ID.standard).craft.slice();
    var cost = 0;
    b.forEach(function (c) {
      var i = a.indexOf(c);
      if (i >= 0) a.splice(i, 1); else cost += CRAFT[c].price;
    });
    a.forEach(function (c) { cost -= Math.round(CRAFT[c].price * 0.7); });
    return cost;
  }
  function changeLoadout(G, toId) {
    var s = G.ship, to = LOADOUT_BY_ID[toId];
    if (!to) return { ok: false, why: 'no such loadout' };
    if (!isCrawler(s)) return { ok: false, why: 'only a Crawler has a craft bay' };
    var port = dockedPort(G);
    if (!port || !isYard(port)) return { ok: false, why: 'only a shipyard refits her craft bay' };
    var from = loadoutOf(s);
    if (from.id === to.id) return { ok: false, why: 'that is her bay already' };
    var cost = loadoutCost(from.id, to.id);
    if (cost > 0 && (s.credits || 0) < cost) return { ok: false, why: 'need ' + cost + ' cr' };
    s.credits -= cost;
    s.craftBay = to.id;
    return { ok: true, cost: cost };
  }

  /* ---- what you own ------------------------------------------------------
   * Every crate that exists: on the slip (`due` ahead), waiting at a yard,
   * or `aboard` your Crawler. Founding (next slice) adds `station`. */
  function owned(G) {
    return ((G && G.stationModules) || []).filter(function (r) { return BY_ID[r.crateId]; });
  }
  function byId(G, id) {
    var l = owned(G);
    for (var i = 0; i < l.length; i++) if (l[i].id === id) return l[i];
    return null;
  }

  /* THE L COMES FIRST. A station starts as a Crawler, so crates are only
   * built for a captain who has one: flying it, in the fleet, or on the
   * slip. Without one, crates are "just stitching ship hulls together". */
  function hasCrawler(G) {
    if (G && isCrawler(G.ship)) return true;
    var f = (G && G.fleet) || [], o = (G && G.orders) || [], i;
    for (i = 0; i < f.length; i++) if (f[i].hullId === 'crawler' && !f[i].partner) return true;
    for (i = 0; i < o.length; i++) if (o[i].hullId === 'crawler') return true;
    return false;
  }

  function dockedPort(G) {
    var s = G && G.ship;
    return (s && s.docked && G.sys && G.sys.byId) ? G.sys.byId[s.docked] || null : null;
  }
  function isYard(port) {
    var C = global.Combat;
    return !!(C && C.isShipyard && C.isShipyard(port));
  }

  function orderRefusal(G, crateId) {
    var c = BY_ID[crateId];
    if (!c) return 'no such crate';
    var port = dockedPort(G);
    if (!port || !isYard(port)) return 'only a shipyard builds station crates';
    if (!hasCrawler(G)) return 'a station starts as a Crawler — commission one first';
    if ((G.ship.credits || 0) < c.price) return 'need ' + c.price + ' cr';
    return null;
  }

  function order(G, crateId) {
    var why = orderRefusal(G, crateId);
    if (why) return { ok: false, why: why };
    var c = BY_ID[crateId], port = dockedPort(G), t = G.t || 0;
    G.ship.credits -= c.price;
    if (!G.stationModules) G.stationModules = [];
    var rec = {
      id: 'sc' + Math.round(t) + '-' + crateId + '-' + G.stationModules.length,
      crateId: crateId,
      port: port.id, portName: port.name || null,
      star: G.here ? G.here.id : null, starName: G.here ? G.here.name : null,
      placed: t, due: t + c.days * DAY, paid: c.price,
      aboard: false
    };
    G.stationModules.push(rec);
    return { ok: true, rec: rec, days: c.days };
  }

  function ready(rec, t) { return !!rec && (t || 0) >= rec.due; }

  function hereAtYard(G, rec) {
    var s = G.ship;
    return !rec.aboard && !rec.station && ready(rec, G.t) && s && s.docked === rec.port &&
           (!rec.star || !G.here || rec.star === G.here.id);
  }

  function loadRefusal(G, rec) {
    var s = G.ship;
    if (!rec) return 'no such crate';
    if (!isCrawler(s)) return 'only a Crawler carries station crates';
    if (rec.aboard) return 'already aboard';
    if (!ready(rec, G.t)) return 'still on the slip';
    if (!hereAtYard(G, rec)) return 'it is waiting at ' + (rec.portName || 'another yard') +
                                    (rec.starName ? ', ' + rec.starName : '');
    if (!fits(s, rec.crateId)) {
      var c = BY_ID[rec.crateId];
      return 'no cube free for it — ' + PER_CUBE[c.size] + ' ' + c.size + ' crates to a cube, ' +
             (crateCubes(aboard(s)) + freightCubes(s)) + ' of ' + CUBES + ' cubes in use';
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
    s.modules.push({ id: rec.id, crateId: rec.crateId });
    applyCap(s);
    return { ok: true };
  }

  /* Back onto the yard's floor — only a shipyard has the cranes. */
  function unload(G, recId) {
    var s = G.ship, rec = byId(G, recId);
    if (!rec || !rec.aboard) return { ok: false, why: 'not aboard' };
    var port = dockedPort(G);
    if (!port || !isYard(port)) return { ok: false, why: 'only a shipyard can lift a crate off' };
    rec.aboard = false;
    rec.port = port.id; rec.portName = port.name || null;
    rec.star = G.here ? G.here.id : null; rec.starName = G.here ? G.here.name : null;
    s.modules = aboard(s).filter(function (a) { return a.id !== rec.id; });
    applyCap(s);
    return { ok: true };
  }

  /* A Crawler lost is her load lost. */
  function lostWith(G, ship) {
    var gone = aboard(ship).map(function (a) { return a.id; });
    if (!gone.length) return 0;
    G.stationModules = ((G && G.stationModules) || []).filter(function (r) { return gone.indexOf(r.id) < 0; });
    ship.modules = [];
    return gone.length;
  }

  function announce(G, t) {
    var out = [];
    owned(G).forEach(function (r) {
      if (r.announced || r.station || !ready(r, t)) return;   // a founded crate is her part now
      r.announced = true;
      var c = BY_ID[r.crateId];
      out.push('Your ' + c.name.toLowerCase() + ' crate is ready at ' + (r.portName || 'the yard') +
               (r.starName ? ', ' + r.starName : '') + ' — a Crawler can load it there.');
    });
    return out;
  }

  var Construction = {
    CRATES: CRATES, BY_ID: BY_ID, SIZES: SIZES,
    CUBES: CUBES, PER_CUBE: PER_CUBE, TONNES_PER_CUBE: TONNES_PER_CUBE, DAY: DAY,
    isCrawler: isCrawler, aboard: aboard, countsOf: countsOf, crateCubes: crateCubes,
    freightCubes: freightCubes, capFor: capFor, applyCap: applyCap, fits: fits,
    layout: layout, fullLayout: fullLayout,
    owned: owned, byId: byId, hasCrawler: hasCrawler,
    orderRefusal: orderRefusal, order: order, ready: ready, hereAtYard: hereAtYard,
    loadRefusal: loadRefusal, load: load, unload: unload,
    lostWith: lostWith, announce: announce,
    STATIONS: STATIONS, HAB_CRATE: HAB_CRATE, canFound: canFound,
    CRAFT: CRAFT, PADS: PADS, padsFor: padsFor, bayTakes: bayTakes, LOADOUTS: LOADOUTS, LOADOUT_BY_ID: LOADOUT_BY_ID,
    loadoutOf: loadoutOf, craftRates: craftRates, buildDaysFor: buildDaysFor,
    loadoutCost: loadoutCost, changeLoadout: changeLoadout
  };

  global.Construction = Construction;
  if (typeof module !== 'undefined' && module.exports) module.exports = Construction;
})(typeof window !== 'undefined' ? window : globalThis);
