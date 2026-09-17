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
      /* THE PEOPLE STAY WITH THE SHIP. They signed on to a hull, not to a
       * pilot, and a captain who buys a second ship and walks away should
       * not find the deck he left behind stripped of its crew — that was
       * this function's first bug: `crew: []`, which quietly dismissed
       * everybody aboard the moment you kept her. A pilot left aboard is
       * also the whole precondition for giving her an order. */
      crew: (ship.crew || []).slice(),
      /* Paid up to. Null means "has not started yet" and is filled in by
       * park(), so an old save with no such field is not handed a century
       * of back rent the first time its owner docks. */
      berthTo: null,
      wagesTo: null,
      arrears: 0
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
    var rec = record(ship, portId, name);
    rec.berthTo = rec.wagesTo = G.t || 0;
    return add(G, rec);
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

  /* ---- what leaving her there costs -------------------------------------
   *
   * Astra, asked whether a parked hull should cost anything to keep: "yeah,
   * it does cost money to keep it, but it's just a modest charge every
   * week, not every day. The charge is no more than a full fuel tank of
   * that ship, or 1500 cr, whichever is less."
   *
   * So: WEEKLY, and priced off the one number in the game that already
   * scales with the size of a hull and means something to a player who has
   * ever bought fuel — what it costs to fill her. A Kestrel's forty-five
   * tonnes is a bigger berth than a Dart's twenty-seven, and the fee says
   * so without anybody writing a table of berth sizes.
   *
   * THE REFERENCE PRICE, NOT THE LOCAL ONE. Hydrogen costs what the port
   * charges, and refuelling uses exactly that — but a berth bill has to be
   * quotable for a ship six jumps away, and asking what hydrogen costs
   * there means generating a whole star system to price a clamp. The
   * commodity's base price is the same everywhere and is already the one
   * copy of that number.
   *
   * The cap bites for every hull but the Dart, which is not a mistake in
   * the arithmetic: 1500 is where Astra put the ceiling and most tanks are
   * bigger than it. */
  var BERTH_WEEK = 7 * 86400;
  var BERTH_CAP = 1500;
  function berthFee(rec) {
    var C = global.Combat, Eco = global.Economy;
    var hull = C && C.HULLS ? C.HULLS[rec.hullId] : null;
    var fuel = Eco && Eco.BY_ID ? Eco.BY_ID[Eco.FUEL_ID] : null;
    if (!hull || !fuel) return 0;
    return Math.min(BERTH_CAP, Math.round(hull.fuelCap * fuel.base));
  }

  /* Whole weeks only, remainder carried — the same reasoning as the
   * payroll: docking twice on a Tuesday is one week's rent, not two. */
  function berthDue(rec, t) {
    var from = (rec.berthTo == null) ? t : rec.berthTo;
    var weeks = Math.floor((t - from) / BERTH_WEEK);
    if (!(weeks > 0)) return { weeks: 0, cr: 0, berthTo: from };
    return { weeks: weeks, cr: berthFee(rec) * weeks,
             berthTo: from + weeks * BERTH_WEEK };
  }

  /* ---- settling up -------------------------------------------------------
   *
   * Wages and berthing, taken off their clocks. Called at a desk — docking,
   * in main.js — and returning the lines to be read out rather than saying
   * anything itself, so the whole bill can be tested without a screen.
   *
   * THE DECK UNDER YOUR HANDS IS IN THE BILL, even though it is not in the
   * list, because a payroll you could dodge by staying in the pilot's seat
   * would be a payroll nobody ever paid. Her berth is not: you are standing
   * on that clamp with the engines warm, and a port charges for storage,
   * not for visiting.
   *
   * SETTLED, NOT SIMULATED. Nothing ticks. Every clock is a "paid up to"
   * timestamp and the bill is the arithmetic between it and now — the same
   * rails doctrine the markets and the traffic run on, so the answer does
   * not depend on how many frames went past, whether the game was running
   * at 1x or 100,000x, or whether the player was in this system at all.
   * Whole days for wages, whole weeks for berthing, remainders carried.
   *
   * ORDER MATTERS AND IT IS PEOPLE FIRST. A captain who cannot cover
   * everything pays the deck under his own feet, then the decks he left
   * behind, then the harbour master. A crew that cannot be paid walks off
   * where it stands; a clamp that goes unpaid runs up arrears, and when the
   * arrears pass what the hull is worth the harbour master sells her
   * against the debt. That is the only rule here that can take a ship away,
   * and on a Talon it takes fifteen unpaid weeks to do it — which is a
   * dozen ledger lines of warning first.
   */
  function settle(G, t) {
    var Crew = global.Crew;
    var s = G.ship, lines = [];
    if (!Crew || !s) return lines;

    /* A career from before any of this — or one that has just started —
     * begins paid up rather than a decade in arrears. */
    if (s.wagesTo == null) s.wagesTo = t;

    var mine = Crew.payrollDue(Crew.aboard(s), s.wagesTo, t);
    s.wagesTo = mine.paidTo;
    if (mine.cr > 0) {
      if (s.credits >= mine.cr) {
        s.credits -= mine.cr;
        lines.push('Wages ' + mine.cr + ' cr  ·  ' + mine.days + ' d, ' +
                   Crew.aboard(s).length + ' aboard');
      } else {
        lines.push('COULD NOT MAKE PAYROLL — your crew take their kit and go');
        s.crew = [];
      }
    }

    var fleet = list(G).slice();
    for (var i = 0; i < fleet.length; i++) {
      var rec = fleet[i];
      if (rec.wagesTo == null) rec.wagesTo = t;
      if (rec.berthTo == null) rec.berthTo = t;

      var pay = Crew.payrollDue(rec.crew || [], rec.wagesTo, t);
      rec.wagesTo = pay.paidTo;
      if (pay.cr > 0) {
        if (s.credits >= pay.cr) {
          s.credits -= pay.cr;
          lines.push('Wages ' + pay.cr + ' cr  ·  ' + rec.name);
        } else {
          lines.push(rec.name + "'s crew paid themselves off and left her");
          rec.crew = [];
        }
      }

      var berth = berthDue(rec, t);
      rec.berthTo = berth.berthTo;
      var owe = (rec.arrears || 0) + berth.cr;
      if (owe <= 0) continue;
      if (s.credits >= owe) {
        s.credits -= owe;
        rec.arrears = 0;
        lines.push('Berth ' + owe + ' cr  ·  ' + rec.name + ' at ' +
                   (rec.portName || 'her clamp'));
      } else {
        rec.arrears = owe;
        var worth = resale(rec);
        if (owe > worth) {
          /* Sold against the debt, and the debt was larger than the hull,
           * so there is nothing to hand back. A sale that paid out would
           * make abandoning a ship you cannot afford a way of cashing her
           * in — which is the opposite of what a foreclosure is. */
          remove(G, rec.id);
          lines.push((rec.portName || 'The harbour') + ' sold the ' + rec.name +
                     ' against ' + owe + ' cr of unpaid berthing');
        } else {
          lines.push(rec.name + ' owes ' + owe + ' cr in berthing  ·  ' +
                     (worth - owe) + ' cr of hull left to cover it');
        }
      }
    }
    return lines;
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
    berthFee: berthFee, berthDue: berthDue, settle: settle,
    BERTH_WEEK: BERTH_WEEK, BERTH_CAP: BERTH_CAP,
    RESALE: RESALE
  };

  global.Fleet = Fleet;
  if (typeof module !== 'undefined' && module.exports) module.exports = Fleet;
})(typeof window !== 'undefined' ? window : globalThis);
