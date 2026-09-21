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
      /* People riding in her berths under a contract — see
       * Missions.loadOnto. A ship you park keeps whoever was aboard. */
      passengers: ship.passengers || 0,
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

      /* A ship under way is not on anybody's clamp. Her berth clock is
       * restarted by tick() when she arrives — see the arrival rule. */
      if (rec.order) continue;

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

  /* ---- standing orders ---------------------------------------------------
   *
   * "A pilot aboard a parked ship, told where to go."
   *
   * AN ORDERED SHIP IS A TIMETABLE ENTRY, NOT AN AGENT. The whole of the
   * rest of the traffic in this game is a pure function of the clock —
   * depart here, cross, sit there — and a ship of yours under way is the
   * same thing with your name on it. So an order is a route: built with
   * the arithmetic buildTraffic uses, pushed into the same `sys.traffic`
   * list, drawn by the same renderer, heard on the same channel, and
   * counted against the same berths. She flies whether or not you are in
   * the system, at any warp, across a save and back, and arrives at the
   * instant the arithmetic says — because there is nothing to integrate
   * and therefore nothing to drift. The alternative, a little steered
   * agent per ship, would need saving, catching up after a jump, and its
   * own answer to "where is she" every time the clock skipped; a timetable
   * needs none of that.
   *
   * The one thing a trade route does that an order does not is COME BACK.
   * A route is a loop; an order is a leg. `oneWay` on the route tells
   * Sim.trafficState to hold her at the far end rather than turn her
   * round, and `tick` closes the order when the leg is done: the record's
   * port becomes the destination, the route comes out of the list, and
   * she is a parked ship again — pilot aboard, ready for the next one.
   *
   * IN-SYSTEM ONLY, for now. A leg between two ports of one star is the
   * shape every other route already has. A jump is a different object — a
   * corridor, a tank of hydrogen, two star systems — and belongs to its
   * own piece of work.
   */

  /* How long the route says she sits alongside at the far end. Not a
   * layover in the trade sense — the order closes the moment the cruise
   * ends — but trafficState needs a moored phase to hold her in, and a
   * route with a zero layover has none. */
  var ORDER_PARK = 3600;

  /* What a hired pilot flies her at, as a fraction of what the torch could
   * give. The civilian classes in SHIP_CLASSES run at a few m/s² and that
   * is the rhythm the traffic has; a Talon's torch at full stop is twenty
   * times that, and a courier of yours crossing a system in a tenth the
   * time of everything else on the scope would read as a bug. So the pilot
   * flies a timetable — and a better pilot flies a faster one, which is
   * the first thing the rating on that card has ever bought you. */
  var ORDER_THROTTLE_BASE = 0.15, ORDER_THROTTLE_PER_RATING = 0.05;

  function pilotOf(rec) {
    var Crew = global.Crew;
    return Crew ? Crew.best(rec, 'pilot') : null;
  }

  /* What she weighs as she sits: hull, gear, hold and tanks. */
  function massOf(rec) {
    var C = global.Combat;
    var hull = C && C.HULLS ? C.HULLS[rec.hullId] : null;
    var m = hull ? hull.dryMass : 40;
    for (var k in (rec.fit || {})) {
      var it = C && C.EQUIPMENT ? C.EQUIPMENT[rec.fit[k]] : null;
      if (it && it.mass) m += it.mass;
    }
    for (var c in (rec.cargo || {})) m += rec.cargo[c];
    m += (rec.fuel || 0) + (rec.thrusterFuel || 0);
    return Math.max(1, m);
  }

  /* What she can carry: the hold and the berths, read off the hull and the
   * fit the same way Combat.refit derives them for a live ship — a hab
   * unit trades hold for seats. A record has no live ship to read these
   * off, so this is the one other place the rule is written. */
  function capacityOf(rec) {
    var C = global.Combat;
    var hull = C && C.HULLS ? C.HULLS[rec.hullId] : null;
    var seats = 0, holdCost = 0;
    for (var k in (rec.fit || {})) {
      var it = C && C.EQUIPMENT ? C.EQUIPMENT[rec.fit[k]] : null;
      if (!it || it.kind !== 'hab') continue;
      seats += it.seats || 0;
      holdCost += it.hold || 0;
    }
    var used = 0;
    for (var c in (rec.cargo || {})) used += rec.cargo[c];
    return { cargoCap: Math.max(0, (hull ? hull.cargoCap : 0) - holdCost),
             holdUsed: used, seats: seats, passengers: rec.passengers || 0 };
  }

  /* km/s², to match SHIP_CLASSES — the timetable is built in those units. */
  function orderAccel(rec) {
    var C = global.Combat;
    var hull = C && C.HULLS ? C.HULLS[rec.hullId] : null;
    var kN = hull ? hull.thrustKN : 2000;
    var p = pilotOf(rec);
    var throttle = ORDER_THROTTLE_BASE + ORDER_THROTTLE_PER_RATING * (p ? p.rating : 1);
    return (kN / massOf(rec)) / 1000 * throttle;
  }

  /* Can she be sent from where she is to `destId`, and if not, why not —
   * in words, because a greyed row that will not say what is wrong is
   * indistinguishable from a bug. */
  function canOrder(G, rec, sys, destId) {
    if (!rec) return { ok: false, why: 'no such ship' };
    if (rec.order) return { ok: false, why: 'she is already under way' };
    if (!pilotOf(rec)) return { ok: false, why: 'nobody aboard can helm her' };
    if (rec.star && G && G.here && rec.star !== G.here.id) {
      return { ok: false, why: 'she is at ' + (rec.starName || 'another star') };
    }
    if (!sys || !sys.byId || !sys.byId[rec.port]) {
      return { ok: false, why: 'her clamp is not in this system' };
    }
    if (!sys.byId[destId]) return { ok: false, why: 'no such port here' };
    if (destId === rec.port) return { ok: false, why: 'she is already there' };
    if (!(rec.thrusterFuel > 0)) return { ok: false, why: 'no reaction mass in her tanks' };
    /* THE HARBOUR HOLDS A HULL IN ARREARS. The clamp is the only leverage
     * the harbour master has, and a ship that could fly off owing rent is
     * a ship nobody ever pays rent on. */
    if (rec.arrears > 0) {
      return { ok: false, why: 'the harbour will not release her — ' + rec.arrears + ' cr owed' };
    }
    return { ok: true };
  }

  /* The leg, priced the way buildTraffic prices one: a nominal distance
   * about the two ports' common parent and a constant-acceleration
   * crossing, t = 2·sqrt(d/a). The same arithmetic on purpose — a ship of
   * yours and a freighter on the same run should quote the same kind of
   * number, and trafficState's eased interpolation reproduces exactly this
   * accel/flip/decel shape. */
  /* ---- and what it burns ---------------------------------------------
   * The player's own drive spends reaction mass at thrustKN / (Isp · g0)
   * tonnes a second at full stop (Sim.fuelBurn), and hers is the same
   * drive. The question is for how long.
   *
   * NOT FOR THE WHOLE CROSSING. The timetable's flip-and-burn is the
   * SCHEDULE every ship in the sky shares — the shape the traffic arc has
   * and the time it quotes — but it is not a burn profile: priced as one,
   * a Talon's sixteen tonnes could not cover a hundred-hour leg at any
   * throttle, and the first draft of this either refused half the outer
   * ports in a big system or crawled to them over months. Nobody flies a
   * system that way, the player least of all: thrusterEndurance gives a
   * Talon seven hours of full burn, and a pilot crosses a system by
   * burning out, coasting for days, and burning in. So the leg is charged
   * as that — a burn out and a burn in, each up to ORDER_BURN_LEG at the
   * pilot's throttle, and the coast between them for nothing. A local hop
   * shorter than the two burns is charged for exactly its own length.
   *
   * What that buys: reaction mass is SPENT rather than merely checked, a
   * tank is good for a couple of dozen legs rather than one, and the
   * refusal is "needs N t, she has M" — which is the one a captain can do
   * something about, by refuelling her before she goes. */
  var ORDER_BURN_LEG = 1800;                        // s, out and again in
  var G0 = 9.80665;

  function burnRate(rec) {
    var C = global.Combat;
    var hull = C && C.HULLS ? C.HULLS[rec.hullId] : null;
    var kN = hull ? hull.thrustKN : 2000;
    var isp = (hull && hull.thrusterIsp) || 450000;
    return kN / (isp * G0);                          // t/s at full stop
  }

  function planLeg(rec, sys, destId) {
    var Gen = global.Gen;
    var A = sys.byId[rec.port], B = sys.byId[destId];
    var parent = Gen.commonParent(A, B, sys);
    var local = A.parentBody === B.parentBody;
    var ra = Gen.radiusAbout(A, parent, sys), rb = Gen.radiusAbout(B, parent, sys);
    var dist = local ? Math.max(Math.abs(ra - rb), (ra + rb) * 0.45)
                     : Math.sqrt(ra * ra + rb * rb);
    var C = global.Combat;
    var hull = C && C.HULLS ? C.HULLS[rec.hullId] : null;
    var full = ((hull ? hull.thrustKN : 2000) / massOf(rec)) / 1000;   // km/s² at the stop
    var accel = orderAccel(rec), throttle = accel / full;
    var cruise = 2 * Math.sqrt(dist / accel);
    cruise = Math.max(600, Math.min(cruise, 90 * 86400));
    var burning = Math.min(cruise, 2 * ORDER_BURN_LEG);
    var fuel = burnRate(rec) * throttle * burning;
    return { from: A.id, to: B.id, toName: B.name, parentId: parent.id,
             local: local, distance: dist, accel: accel, cruise: cruise,
             fuel: fuel, burning: burning };
  }

  /* Quote without committing — the fleet page prints the crossing time
   * beside each destination so the choice is made with a number. */
  function quote(G, rec, sys, destId) {
    var can = canOrder(G, rec, sys, destId);
    if (!can.ok) return can;
    var leg = planLeg(rec, sys, destId);
    leg.ok = leg.fuel <= (rec.thrusterFuel || 0) + 1e-9;
    if (!leg.ok) leg.why = 'needs ' + leg.fuel.toFixed(1) + ' t of reaction mass, she has ' +
                           (rec.thrusterFuel || 0).toFixed(1) + ' t';
    return leg;
  }

  function order(G, rec, sys, destId, t) {
    var can = canOrder(G, rec, sys, destId);
    if (!can.ok) return can;
    var leg = planLeg(rec, sys, destId);
    if (leg.fuel > (rec.thrusterFuel || 0) + 1e-9) {
      return { ok: false, why: 'needs ' + leg.fuel.toFixed(1) + ' t of reaction mass, she has ' +
                                (rec.thrusterFuel || 0).toFixed(1) + ' t' };
    }
    leg.t0 = t;
    /* Spent at the clamp, not along the way: the leg is a fixed arc and
     * its cost is known before she leaves. */
    rec.thrusterFuel = Math.max(0, (rec.thrusterFuel || 0) - leg.fuel);
    rec.order = leg;
    delete ROUTES[rec.id];
    syncRoutes(G, sys);
    return { ok: true, order: leg, arriveAt: t + leg.cruise };
  }

  /* Seconds until she is alongside, or 0 if she is not under way. */
  function eta(rec, t) {
    if (!rec || !rec.order) return 0;
    return Math.max(0, rec.order.t0 + rec.order.cruise - t);
  }

  /* The route object trafficState flies. Built once per order and held
   * OFF the record — legGeometry caches vectors on the route as it goes,
   * and a record is saved whole, so caching the route on it would write
   * a frame's worth of arc geometry into every save slot. Keyed by the
   * record and re-cut when the order changes. */
  var ROUTES = {};
  var ORDER_SIZE = { S: 0.045, M: 0.08, L: 0.12 };

  function routeFor(rec) {
    var o = rec.order;
    if (!o) return null;
    var cached = ROUTES[rec.id];
    if (cached && cached.t0 === o.t0 && cached.to === o.to) return cached;
    var C = global.Combat;
    var hull = C && C.HULLS ? C.HULLS[rec.hullId] : null;
    var out = [];
    for (var k in (rec.cargo || {})) if (rec.cargo[k] > 0) out.push({ cid: k, qty: rec.cargo[k] });
    var route = {
      id: 'fleet|' + rec.id,
      name: rec.name,
      reg: rec.reg || null,
      /* `fleet` is what marks her as yours to everything downstream, and
       * `owned` is the same fact for anything that wants a boolean. */
      kind: 'fleet', owned: true, fleetId: rec.id,
      /* The mesh key the renderer resolves through HULL_ASSIGN — the same
       * silhouette the yard drew when you bought her. */
      cls: (hull && hull.mesh) || 'courier',
      className: hull ? hull.name : rec.hullId,
      sizeLetter: hull && hull.size ? hull.size.toLowerCase() : 's',
      size: ORDER_SIZE[hull ? hull.size : 'S'] || ORDER_SIZE.S,
      color: '#ffd27f',
      from: o.from, to: o.to, parentId: o.parentId, local: !!o.local,
      cruise: o.cruise, layover: ORDER_PARK, period: 2 * (o.cruise + ORDER_PARK),
      t0: o.t0,
      out: out, back: [],
      /* The channel says who is aboard rather than what, when there are
       * people — see chatterFor. */
      souls: rec.passengers || 0,
      distance: o.distance,
      oneWay: true
    };
    ROUTES[rec.id] = route;
    return route;
  }

  /* Keep `sys.traffic` in step with the book: every ship of yours under
   * way in this system is on the list exactly once, and nothing of yours
   * that is not under way is on it at all. Cheap enough to run every
   * frame — it returns before allocating anything unless there is an
   * order somewhere or a fleet route to remove. */
  function syncRoutes(G, sys) {
    if (!sys || !sys.traffic) return;
    var mine = list(G), i, any = false;
    for (i = 0; i < mine.length; i++) if (mine[i].order) { any = true; break; }
    if (!any && !sys._fleetLive) return;

    var want = {};
    for (i = 0; i < mine.length; i++) {
      var rec = mine[i];
      if (!rec.order) continue;
      /* Port ids are per system — 'b7' names a different dock at every
       * star — so a record has to be from THIS star before its ids mean
       * anything here. */
      if (rec.star && G.here && rec.star !== G.here.id) continue;
      if (!sys.byId[rec.order.from] || !sys.byId[rec.order.to]) continue;
      want['fleet|' + rec.id] = rec;
    }
    for (i = sys.traffic.length - 1; i >= 0; i--) {
      var r = sys.traffic[i];
      if (r.kind !== 'fleet') continue;
      var w = want[r.id];
      if (w && r.t0 === w.order.t0 && r.to === w.order.to) delete want[r.id];
      else sys.traffic.splice(i, 1);
    }
    var live = false;
    for (var id in want) { sys.traffic.push(routeFor(want[id])); live = true; }
    for (i = 0; i < sys.traffic.length && !live; i++) if (sys.traffic[i].kind === 'fleet') live = true;
    sys._fleetLive = live;
    /* The per-frame memo was cut from the old list. */
    sys._traffic = null; sys._ships = null;
  }

  /* Once a frame, and at any desk: close the orders whose clocks have run
   * out, and keep the traffic list honest. Returns lines to be said, the
   * same contract as settle. An arrival is a timestamp comparison, so it
   * lands at the right instant whether the player was watching her come
   * in or was three systems away at ten-thousand-x. */
  function tick(G, sys, t) {
    var lines = [], mine = list(G);
    for (var i = 0; i < mine.length; i++) {
      var rec = mine[i], o = rec.order;
      if (!o) continue;
      if (t < o.t0 + o.cruise) continue;
      rec.port = o.to;
      rec.portName = o.toName;
      /* A PORT CHARGES FOR STORAGE. The days under way were not on a
       * clamp, so the berth clock restarts at the new one; the part-week
       * she left behind at the old port was never a whole week and is
       * not owed. */
      rec.berthTo = o.t0 + o.cruise;
      rec.order = null;
      delete ROUTES[rec.id];
      var p = pilotOf(rec);
      lines.push(rec.name + ' is alongside at ' + o.toName +
                 (p ? '  ·  ' + p.name + ' reports her secure' : ''));
      /* AND THE HARBOUR TAKES DELIVERY of whatever she was carrying for
       * this port — the contracts moved aboard her at the last clamp. The
       * port object is needed for its id and name, and she is in this
       * system or the route could not have been flown. */
      var M = global.Missions, port = sys && sys.byId ? sys.byId[o.to] : null;
      if (M && M.deliverByCarrier && port) {
        var got = M.deliverByCarrier(G, rec, port, t);
        for (var g = 0; g < got.length; g++) lines.push(got[g]);
      }
    }
    syncRoutes(G, sys);
    return lines;
  }

  /* WHAT SHE SAYS WHEN YOU CALL HER. An owner's hail is not a stranger's:
   * the pilot reports the leg, the hold and the people, in one line, off
   * the record — nothing here is guessed from the traffic state, because
   * the record is the truth and the traffic state is drawn from it. */
  function report(G, rec, t) {
    var p = pilotOf(rec);
    var M = global.Missions, Eco = global.Economy;
    var who = p ? p.name : 'nobody at the helm';
    var parts = [];
    if (rec.order) {
      parts.push('for ' + rec.order.toName + ', alongside in ' + fmtEta(eta(rec, t)));
    } else {
      parts.push('on the clamp at ' + (rec.portName || 'her berth'));
    }
    var tons = 0;
    for (var k in (rec.cargo || {})) tons += rec.cargo[k];
    if (tons > 0) {
      var names = Object.keys(rec.cargo).map(function (c) {
        return (Eco && Eco.BY_ID[c] ? Eco.BY_ID[c].name : c).toLowerCase();
      });
      parts.push(Math.round(tons) + ' t aboard (' + names.join(', ') + ')');
    } else parts.push('hold empty');
    if (rec.passengers > 0) parts.push(rec.passengers + ' passengers');
    var carried = M && M.carriedBy ? M.carriedBy(G, rec.id) : [];
    if (carried.length) parts.push(carried.length + ' contract' + (carried.length > 1 ? 's' : '') + ' under bond');
    parts.push('reaction mass ' + Math.round(rec.thrusterFuel || 0) + ' t');
    return rec.name + ' (' + who + '): "' + parts.join('  ·  ') + '."';
  }

  function fmtEta(s) {
    if (s < 90) return Math.max(1, Math.round(s)) + ' s';
    if (s < 5400) return Math.round(s / 60) + ' min';
    var h = s / 3600;
    return (h < 10 ? h.toFixed(1) : Math.round(h)) + ' h';
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
    if (rec.order) where = 'under way → ' + rec.order.toName;
    if (rec.starName) where += ', ' + rec.starName;
    var tons = 0;
    for (var k in (rec.cargo || {})) tons += rec.cargo[k];
    return (hull ? hull.name : rec.hullId) + '  ·  ' + where +
           (tons > 0 ? '  ·  ' + Math.round(tons) + ' t aboard' : '  ·  empty') +
           (rec.passengers > 0 ? '  ·  ' + rec.passengers + ' aboard' : '') +
           (rec.crew && rec.crew.length ? '  ·  ' + rec.crew.length + ' crew'
                                        : '  ·  no crew');
  }

  var Fleet = {
    record: record, list: list, add: add, park: park, at: at,
    byId: byId, remove: remove, resale: resale, describe: describe,
    berthFee: berthFee, berthDue: berthDue, settle: settle,
    BERTH_WEEK: BERTH_WEEK, BERTH_CAP: BERTH_CAP,
    RESALE: RESALE,
    /* standing orders */
    canOrder: canOrder, quote: quote, order: order, eta: eta,
    routeFor: routeFor, syncRoutes: syncRoutes, tick: tick,
    orderAccel: orderAccel, massOf: massOf, pilotOf: pilotOf,
    capacityOf: capacityOf, report: report,
    ORDER_PARK: ORDER_PARK, ORDER_BURN_LEG: ORDER_BURN_LEG, burnRate: burnRate,
    ORDER_THROTTLE_BASE: ORDER_THROTTLE_BASE,
    ORDER_THROTTLE_PER_RATING: ORDER_THROTTLE_PER_RATING
  };

  global.Fleet = Fleet;
  if (typeof module !== 'undefined' && module.exports) module.exports = Fleet;
})(typeof window !== 'undefined' ? window : globalThis);
