/* fleet.js — the ships you own and are not sitting in.
 *
 * Until now "your ship" and "the ship" were the same object, and buying a
 * hull meant losing the one you had: buyHull traded it in and overwrote
 * every field in place. That is a perfectly good career and it is also the
 * reason there has never been anything to COMMAND. You cannot give orders
 * to a ship that stops existing the moment you stand up.
 *
 * So: a fleet is a list of ships that are somewhere. Each entry is a
 * RECORD rather than a live ship — hull, fit, hold, and the port it is
 * sitting at — because a parked ship is not being flown and does not want
 * a position, a velocity or an integrator. It is a row in a harbour
 * master's book. It becomes a live ship again when somebody climbs into
 * it, and that conversion is the only place the two shapes meet.
 *
 * THE SHIP YOU ARE FLYING IS NOT IN THE LIST. It is G.ship, as it has
 * always been, and every screen that reads G.ship carries on working. The
 * list is what is NOT under your hands, which is exactly the set the word
 * "fleet" is for and exactly the set that can be given an order.
 *
 * Nothing in here flies anything. Orders come next; this is the harbour.
 */
(function (global) {
  'use strict';

  /* What a parked ship remembers. Deliberately small: everything here is
   * either something the player chose (the hull, the fit, the name) or
   * something they paid for (the hold, the tanks). A parked ship has no
   * heat, no shield charge and no damage timer, because none of those mean
   * anything to a hull sitting on a clamp. */
  function record(ship, portId, name) {
    var C = global.Combat;
    var hull = C && C.HULLS ? C.HULLS[ship.hullId || 'talon'] : null;
    var cargo = {};
    for (var k in (ship.cargo || {})) if (ship.cargo[k] > 0) cargo[k] = ship.cargo[k];
    var fit = {};
    for (var f in (ship.fit || {})) if (ship.fit[f]) fit[f] = ship.fit[f];
    return {
      id: 'fs' + Math.round((global.Game ? global.Game.t : 0) * 1000) + '-' +
          (ship.hullId || 'talon') + '-' + Object.keys(fit).length,
      hullId: ship.hullId || 'talon',
      name: name || ship.shipName || (hull ? hull.name : 'ship'),
      reg: ship.reg || null,
      /* The birth mark travels with the hull, so a ship you come back to
       * has the bridge you learned. */
      bornId: ship.bornId || null,
      fit: fit,
      cargo: cargo,
      fuel: ship.fuel, thrusterFuel: ship.thrusterFuel,
      hullHp: ship.hullHp,
      port: portId || null,
      /* Filled in by the crew work; a ship with nobody aboard can be owned
       * but not ordered. Present now so the save format does not move
       * again when it arrives. */
      crew: []
    };
  }

  function list(G) { return (G && G.fleet) || []; }

  function add(G, rec) {
    if (!G.fleet) G.fleet = [];
    G.fleet.push(rec);
    return rec;
  }

  /* Park the ship the player is currently flying, as a record, at a port.
   * Used when they buy a new hull and keep the old one. */
  function park(G, ship, portId, name) {
    return add(G, record(ship, portId, name));
  }

  function at(G, portId) {
    return list(G).filter(function (r) { return r.port === portId; });
  }

  function byId(G, id) {
    var l = list(G);
    for (var i = 0; i < l.length; i++) if (l[i].id === id) return l[i];
    return null;
  }

  function remove(G, id) {
    if (!G.fleet) return null;
    for (var i = 0; i < G.fleet.length; i++) {
      if (G.fleet[i].id === id) return G.fleet.splice(i, 1)[0];
    }
    return null;
  }

  /* What a parked ship is worth if you sell it where it stands. The same
   * seven tenths the yard gives on a trade-in, so the two ways of getting
   * rid of a hull agree — a player who works out that one is better than
   * the other has found a bug, not a strategy. */
  var RESALE = 0.7;
  function resale(rec) {
    var C = global.Combat;
    var hull = C && C.HULLS ? C.HULLS[rec.hullId] : null;
    if (!hull) return 0;
    var v = Math.round(hull.price * RESALE);
    /* Fitted gear comes back at the same fraction, because it is part of
     * what is being sold and leaving it out would make a fitted ship worth
     * the same as a bare one. */
    for (var k in (rec.fit || {})) {
      var it = C.EQUIPMENT[rec.fit[k]];
      if (it && it.price) v += Math.round(it.price * RESALE);
    }
    return v;
  }

  /* One line for a list: what she is, where she is, what is in her. */
  function describe(rec, sys) {
    var C = global.Combat;
    var hull = C && C.HULLS ? C.HULLS[rec.hullId] : null;
    /* The name is stored on the record, not looked up, because a ship you
     * own is usually in a system you are not in — and generating a system
     * to find out what its harbour is called, for a list, would be the
     * most expensive line in the game. `sys` is consulted only as a way of
     * being right if the ship happens to be here. */
    var where = rec.portName || 'somewhere';
    if (sys && sys.byId && sys.byId[rec.port]) where = sys.byId[rec.port].name;
    if (rec.starName) where += ', ' + rec.starName;
    var tons = 0;
    for (var k in (rec.cargo || {})) tons += rec.cargo[k];
    return (hull ? hull.name : rec.hullId) + '  ·  ' + where +
           (tons > 0 ? '  ·  ' + Math.round(tons) + ' t aboard' : '  ·  empty') +
           (rec.crew && rec.crew.length ? '  ·  ' + rec.crew.length + ' crew'
                                        : '  ·  no crew');
  }

  var Fleet = {
    record: record, list: list, add: add, park: park, at: at,
    byId: byId, remove: remove, resale: resale, describe: describe,
    RESALE: RESALE
  };

  global.Fleet = Fleet;
  if (typeof module !== 'undefined' && module.exports) module.exports = Fleet;
})(typeof window !== 'undefined' ? window : globalThis);
