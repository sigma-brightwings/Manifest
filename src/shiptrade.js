/* shiptrade.js — buying and selling with a ship you have hailed.
 *
 * It existed before this file as two buttons on the COMMS channel: "Buy
 * from their hold" offered the first line of the manifest, six tonnes at a
 * fixed markup, and "Sell them cargo" took whatever your best line was.
 * Nobody asked who you were. A wanted pilot could buy off a navy-flagged
 * freighter, a Syndicate runner would trade with anybody in anyone's
 * space, and the faction standing that missions, fines and campaigns all
 * move could not be moved by the one kind of trade that happens face to
 * face.
 *
 * The design is Astra's, decided 2026-10-10, four answers:
 *
 *   1. STANDING RISES WITH THE SIZE OF THE DEAL, capped per day. A deal
 *      earns a point per CR_PER_STANDING credits with the hull's own flag;
 *      fractions carry over, so ten small deals count the same as one
 *      big one, and DAILY_CAP stops a fat hold from buying a faction's
 *      friendship in an afternoon.
 *   2. RIVALS RESENT IT, two ways.
 *        Law against the Syndicate — a lawful power watches you deal with
 *        an outlaw hull in its space, and the Syndicate watches you deal
 *        with a lawful one in a hold.
 *        Empire against empire — Galaxy.rivalsOf, seeded. Trading with a
 *        rival empire's hull in an empire's space costs you with the
 *        empire whose space it is.
 *      The two cannot both fire on one deal (the first needs an outlaw on
 *      one side, the second needs an empire on both), which is why they
 *      share a cap rather than stacking.
 *   3. THE RECORD GATES LAWFUL SHIPS ONLY. Wanted by a ship's own flag and
 *      a lawful hull will not open its hold to you. Outlaw hulls deal with
 *      anyone — that is most of what being an outlaw hull means. Standing
 *      moves the PRICE, never the door.
 *   4. A PROPER SCREEN. Every line in their hold and every line in yours,
 *      each with its price, its limit and — where it is refused — the
 *      reason in words.
 *
 * WHAT IS NOT A SHOP. Every price is anchored to ONE number: what the
 * good is worth at the port the ship is bound for, because that is what
 * the cargo is worth to the people carrying it. They sell to you above
 * it and buy from you below it — 1.35× and 0.82× — and standing moves
 * both by up to 12%. At the very best standing a ship still asks more
 * than its destination's own ask (1.35 × 0.88 = 1.19 against 1.045) and
 * bids less than its destination's bid (0.82 × 1.12 = 0.92 against 0.955),
 * so this is a convenience and a way to buy friends, never an arbitrage.
 *
 * ONE ANCHOR, NOT TWO, and the first draft had two. It priced what a ship
 * sells off where it LOADED and what it buys off where it is GOING — which
 * sounds like realism and is a money machine: the render test bought a
 * tonne of rare metals off a hauler for 423 and was offered 634 to sell
 * the same tonne straight back. Anything a ship carries is carried
 * because it is worth more at the far end, so two anchors put the bid
 * above the ask on exactly the goods a ship has aboard. With one anchor
 * the ask is above the bid on every line, at every standing, by
 * construction — and a test holds every line to it.
 *
 * THE FIX THAT CAME WITH IT. The old buy subtracted from `route.out` —
 * the route's TEMPLATE manifest, the one every future voyage of that line
 * reads. Buy six tonnes and every later sailing of the line carried six
 * fewer, for the rest of the session; buy it dry and the line ran empty
 * forever, then refilled on reload. What a voyage has lost is now kept
 * here, per voyage, keyed by route and cycle, and forgotten once the
 * voyage is over. The timetable stays a pure function of the seed.
 */
(function (global) {
  'use strict';

  var V = global.V;

  /* ---- prices ----------------------------------------------------------- */
  var BUY_MARKUP = 1.35;            // what a hull charges over its source port's mid
  var SELL_DISCOUNT = 0.82;         // what it pays against its destination's mid
  var STANDING_SWING = 0.12;        // the whole price effect of -100 → +100

  /* ---- standing --------------------------------------------------------- */
  /* Measured against what a contract pays in standing for what it pays in
   * credits: a haul is +3 on a purse of a few thousand. So a point per
   * 2,500 cr of goods puts an ordinary deal — a few tonnes of something
   * mid-priced — at a fraction of a contract, and a full hold of
   * electronics at about one. */
  var CR_PER_STANDING = 2500;
  /* One contract's worth a day, per faction, each way. The cap is what
   * makes this a way of keeping a faction sweet rather than a way of
   * buying it. */
  var DAILY_CAP = 4;
  var DAY = 86400;

  /* ---- room ------------------------------------------------------------- */
  /* What a hull has spare for YOUR goods on one voyage. Not derived from
   * the manifest: a sampled 86,000 legs run from empty to 3,141 t with a
   * median of 6, so "room left" read off the load would have a bulker
   * refusing a crate and an empty shuttle taking a hundred tonnes. This is
   * the hull's own answer instead — a freighter has a corner, a bulker has
   * a hold. A waste hauler was 0 at first ("nothing clean to put it in")
   * until the render test met one running rare metals out and waste back:
   * `classifyRoute` calls a route a hauler if EITHER direction is waste,
   * so its outbound hold is as clean as anyone's. */
  var SPARE_ROOM = { shuttle: 6, freighter: 40, tanker: 12, hauler: 10,
                     liner: 8, bulk: 120 };
  var DEFAULT_ROOM = 20;
  /* How long a voyage's ledger outlives an unknown voyage — a contact with
   * no timetable (a lane hauler, a drop-out) has no "end of trip" to read,
   * and a week is longer than anyone sits beside one. */
  var LOOSE_LEG = 7 * DAY;

  function Eco() { return global.Economy; }
  function Combat() { return global.Combat; }
  function Missions() { return global.Missions; }

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  /* ---- who is who -------------------------------------------------------- */

  function factionById(G, sys, id) {
    if (!id) return null;
    return (G.galaxy && G.galaxy.factionById && G.galaxy.factionById[id]) ||
           (sys && sys.factionById && sys.factionById[id]) || null;
  }

  /* The flag a hull flies. Patrol-shaped contacts carry it; trade ships
   * fly their home port's — the `from` end of the route, whichever way
   * the ship is currently heading, because a ship is registered where it
   * is based, not wherever it happens to be bound. */
  function flagOf(G, sys, contact) {
    if (!contact) return null;
    /* A Syndicate runner (generate.js buildRunners) carries its real flag
     * on the route, ahead of the home port it is pretending to sail for. */
    var id = contact.faction || (contact.route && contact.route.flag) || null;
    if (!id && contact.route && contact.route.from && sys && sys.byId) {
      var home = sys.byId[contact.route.from];
      if (home) id = home.faction || null;
    }
    var fac = factionById(G, sys, id);
    return {
      id: id,
      name: fac ? fac.name : (id === 'outlaw' ? 'the Syndicate' : id ? id : 'no flag'),
      outlaw: id === 'outlaw' || !!(fac && fac.outlaw) || !!contact.outlaw,
      empire: empireOf(G, sys, id)
    };
  }

  /* Whose space this is: the owner of the star you are at. Deep space has
   * no owner — `enterInterstellar` makes G.here a synthetic star with no
   * faction — and so carries no rival penalty at all, which is the
   * corridor's existing rule (no witnesses) arriving here for free. */
  function spaceOf(G, sys) {
    var id = G.here && G.here.factionId;
    if (!id) return null;
    var fac = factionById(G, sys, id);
    if (!fac) return null;
    return { id: id, name: fac.name, outlaw: !!fac.outlaw, empire: empireOf(G, sys, id) };
  }

  /* The empire a power answers to: itself if it is one, its parent if it
   * operates inside one. Outlaws answer to nobody's diplomacy — their
   * quarrel is with the law, and that is the other rule. */
  function empireOf(G, sys, id) {
    var fac = factionById(G, sys, id);
    if (!fac || fac.outlaw || id === 'outlaw') return null;
    return fac.parentId || fac.id;
  }

  function standingWith(G, id) {
    var M = Missions();
    return (M && id) ? M.standing(G, id) : 0;
  }

  /* ---- the voyage -------------------------------------------------------- */

  /* Which voyage this contact is on, and when that voyage is over. The
   * arithmetic is Sim.trafficState's own: cycle from t0 and period, out
   * then layover then back then layover. A voyage runs from its departure
   * through the layover at the far end, which is when the hold is
   * unloaded and anything you bought out of it stops mattering. */
  function legOf(G, sys, contact, t) {
    var r = contact.route;
    var where = (G.here && G.here.id) || (sys && sys.name) || '';
    if (r && r.period > 0 && r.t0 !== undefined && r.cruise !== undefined) {
      var cycle = r.oneWay ? 0 : Math.floor((t - r.t0) / r.period);
      var start = r.t0 + cycle * r.period;
      var out = contact.outbound !== false;
      var legStart = out ? start : start + r.cruise + (r.layover || 0);
      return { key: where + '|' + r.id + '|' + cycle + (out ? 'o' : 'b'),
               until: legStart + r.cruise + (r.layover || 0) };
    }
    return { key: where + '|c|' + (contact.id || (r && r.id) || contact.name),
             until: t + LOOSE_LEG };
  }

  function book(G) {
    if (!G.shipTrade) G.shipTrade = { legs: {}, standing: {} };
    if (!G.shipTrade.legs) G.shipTrade.legs = {};
    if (!G.shipTrade.standing) G.shipTrade.standing = {};
    return G.shipTrade;
  }

  /* Read without writing: drawing the screen must not create ledger
   * entries, or merely LOOKING at a ship would grow the save. */
  function legRecord(G, leg) {
    var b = G.shipTrade && G.shipTrade.legs;
    return (b && b[leg.key]) || null;
  }

  function legRecordForWrite(G, leg) {
    var b = book(G).legs;
    if (!b[leg.key]) b[leg.key] = { until: leg.until, took: {}, sold: 0 };
    return b[leg.key];
  }

  /* Forget voyages that are over. Called on a deal, not per frame. */
  function prune(G, t) {
    var b = G.shipTrade && G.shipTrade.legs;
    if (!b) return;
    for (var k in b) if (!(b[k].until >= t)) delete b[k];
  }

  /* ---- the door ---------------------------------------------------------- */

  /* Null when this hull will talk trade with you; otherwise the reason, in
   * words a pilot can act on. Every refusal names its fix where one
   * exists. */
  function refusal(G, sys, contact) {
    var C = Combat();
    if (!contact || !contact.pos) return 'No channel open.';
    if (contact.hostile) return contact.name + ' is not answering.';
    if (contact.cls === 'capital' || contact.kind === 'capital') {
      return 'A warship is not a shop.';
    }
    var range = V.dist(contact.pos, G.ship.pos);
    var reach = C ? C.HAIL_RANGE_KM : 120;
    if (range > reach) return 'Out of transmitter range — close to under ' + reach + ' km.';

    var flag = flagOf(G, sys, contact);
    if (flag && flag.id && !flag.outlaw && C && C.wantedHere(G, flag.id)) {
      /* Two ways to be wanted (see Combat.wantedHere), and the refusal has
       * to name the one that applies. The first draft only knew the bounty
       * and told a fugitive they were "wanted (0 cr)" — a refusal that
       * contradicts itself is worse than none. */
      if (G.fugitive && G.fugitive.faction === flag.id) {
        return 'A fugitive from ' + flag.name + ' — you arrived without clearance. ' +
               'Their hulls will not deal with you until it is settled.';
      }
      var owed = Math.round((G.wanted || {})[flag.id] || 0);
      return 'Wanted by ' + flag.name + ' (' + owed.toLocaleString('en-US') +
             ' cr). A ' + flag.name + ' hull will not deal with you until it is settled.';
    }
    return null;
  }

  /* ---- the board --------------------------------------------------------- */

  function priceFactor(G, flag) {
    return clamp(standingWith(G, flag && flag.id), -100, 100) / 100 * STANDING_SWING;
  }

  function portMid(port, cid, t) {
    var E = Eco();
    if (!port || !port.market || !port.market.rows || !port.market.rows[cid]) return null;
    var p = E.price(port, cid, t);
    return (p && p.mid > 0) ? p.mid : null;
  }

  function heldOf(G, cid) { return (G.ship.cargo && G.ship.cargo[cid]) || 0; }

  function holdFree(G) {
    var S = global.Sim;
    return Math.max(0, (G.ship.cargoCap || 0) - (S ? S.cargoMass(G.ship) : 0));
  }

  /* Everything this hull will trade, both ways, with a price or a reason
   * on every line. One function feeds both the screen and the deal, so
   * the price you were shown is the price you pay. */
  function board(G, sys, t, contact) {
    var E = Eco(), M = Missions();
    var out = { refusal: refusal(G, sys, contact), rows: [], flag: null, space: null,
                room: 0, roomCap: 0, swing: 0, standing: 0, label: 'neutral',
                consequence: null };
    if (!contact || !E) return out;

    var flag = flagOf(G, sys, contact);
    var leg = legOf(G, sys, contact, t);
    var rec = legRecord(G, leg);
    var k = priceFactor(G, flag);
    var st = standingWith(G, flag.id);
    var cls = contact.cls || (contact.route && contact.route.cls) || null;
    var cap = SPARE_ROOM[cls] !== undefined ? SPARE_ROOM[cls] : DEFAULT_ROOM;

    out.flag = flag;
    out.space = spaceOf(G, sys);
    out.swing = k;
    out.standing = st;
    out.label = M ? M.standingLabel(st) : 'neutral';
    out.roomCap = cap;
    out.room = Math.max(0, cap - ((rec && rec.sold) || 0));
    out.consequence = consequence(G, sys, flag);

    var byCid = {}, order = [];
    function rowFor(cid) {
      if (!byCid[cid]) {
        var com = E.BY_ID[cid];
        byCid[cid] = { cid: cid, name: com ? com.name : cid,
                       theirs: 0, buyEach: null, buyWhy: null,
                       yours: 0, held: 0, sellEach: null, sellWhy: null };
        order.push(cid);
      }
      return byCid[cid];
    }

    /* What they have. */
    var man = contact.manifest || [];
    for (var i = 0; i < man.length; i++) {
      var cid = man[i].cid;
      var com = E.BY_ID[cid];
      if (!com) continue;
      var aboard = (man[i].qty !== undefined ? man[i].qty : man[i].tonnes) || 0;
      var left = Math.max(0, Math.floor(aboard - ((rec && rec.took[cid]) || 0)));
      if (aboard <= 0) continue;
      var r = rowFor(cid);
      r.theirs = left;
      if (com.base <= 0) { r.buyWhy = 'nobody sells you waste'; continue; }
      if (left < 1) { r.buyWhy = 'sold out this trip'; continue; }
      /* The destination's value, then — only if it does not trade the
       * good — the source's, then the catalogue. See the header for why
       * this is the same anchor as the bid below. */
      var mid = portMid(contact.to, cid, t) || portMid(contact.from, cid, t) || com.base;
      r.buyEach = Math.max(1, Math.round(mid * BUY_MARKUP * (1 - k)));
    }

    /* What you have. */
    var dst = contact.to;
    for (var c2 in (G.ship.cargo || {})) {
      var held = heldOf(G, c2);
      if (held <= 0) continue;
      var com2 = E.BY_ID[c2];
      if (!com2) continue;
      var r2 = rowFor(c2);
      r2.held = held;
      r2.yours = M ? M.sellableTonnes(G, c2, held) : held;
      if (com2.base <= 0) { r2.sellWhy = 'find a reprocessing plant'; continue; }
      if (com2.contraband && !flag.outlaw) {
        r2.sellWhy = 'not through a customs scan';
        continue;
      }
      if (r2.yours < 1) { r2.sellWhy = 'freight under contract'; continue; }
      var mid2 = portMid(dst, c2, t);
      if (mid2 === null) {
        /* A ship buys what it can sell on. If its destination does not
         * trade the good at all, there is no price to anchor to and no
         * buyer at the other end — so it is a refusal, not a guess.
         * Contraband in an outlaw hold is the exception: the Syndicate's
         * buyer is never the port on the manifest. */
        if (com2.contraband || !dst || !dst.market) mid2 = com2.base;
        else { r2.sellWhy = 'no buyer for it at ' + dst.name; continue; }
      }
      r2.sellEach = Math.max(1, Math.round(mid2 * SELL_DISCOUNT * (1 + k)));
    }

    for (var o = 0; o < order.length; o++) out.rows.push(byCid[order[o]]);
    return out;
  }

  /* ---- standing ---------------------------------------------------------- */

  /* Who will hear about a deal with this hull, here. Returned before any
   * deal is made, so the screen can say it up front — finding out after
   * the fact that a trade cost you a friend is the sort of thing a player
   * reads as the game cheating. */
  function consequence(G, sys, flag) {
    var res = { gain: null, loss: null };
    if (!flag || !flag.id) return res;
    res.gain = { id: flag.id, name: flag.name };

    var space = spaceOf(G, sys);
    if (!space || space.id === flag.id) return res;

    if (space.outlaw !== flag.outlaw) {
      res.loss = {
        id: space.id, name: space.name,
        why: space.outlaw ? 'dealing with a lawful hull in a Syndicate hold'
                          : 'dealing with an outlaw hull in their space'
      };
      return res;
    }
    var G2 = global.Galaxy;
    if (flag.empire && space.empire && G2 &&
        G2.rivalsOf(G.galaxy, flag.empire, space.empire)) {
      var emp = factionById(G, sys, space.empire);
      var rival = factionById(G, sys, flag.empire);
      res.loss = {
        id: space.empire, name: emp ? emp.name : space.empire,
        why: 'trading with a ' + (rival ? rival.name : 'rival') + ' hull in their space'
      };
    }
    return res;
  }

  /* Move standing by a deal's worth, through the fractional carry and the
   * daily cap. Returns the whole points actually applied, which may be
   * zero — a small deal fills the bucket without tipping it. */
  function accrue(G, t, id, points, sign) {
    var M = Missions();
    if (!M || !id || !(points > 0)) return 0;
    var day = Math.floor(t / DAY);
    var tally = book(G).standing;
    var rec = tally[id];
    if (!rec || rec.day !== day) {
      rec = tally[id] = { day: day, up: 0, down: 0,
                          fracUp: rec ? rec.fracUp || 0 : 0,
                          fracDown: rec ? rec.fracDown || 0 : 0 };
    }
    var fracKey = sign > 0 ? 'fracUp' : 'fracDown';
    var usedKey = sign > 0 ? 'up' : 'down';
    var room = DAILY_CAP - rec[usedKey];
    if (room <= 0) return 0;
    var total = (rec[fracKey] || 0) + points;
    var whole = Math.min(room, Math.floor(total));
    /* At the cap the carry is dropped, not banked — otherwise a huge deal
     * today pays tomorrow's standing too, and the cap is only a delay. */
    rec[fracKey] = whole === room ? 0 : total - whole;
    rec[usedKey] += whole;
    if (whole > 0) M.bumpStanding(G, id, sign * whole);
    return whole;
  }

  /* ---- the deal ---------------------------------------------------------- */

  /* Positive tonnes: you buy. Negative: you sell. Clamped to what is
   * possible rather than refused for asking too much — the same contract
   * as the port market, where Home means "as much as I can". Returns
   * { ok, qty, each, total, standing:[…], text } or { ok:false, text }. */
  function deal(G, sys, t, contact, cid, tonnes, hooks) {
    function talk(msg, secs) { if (hooks && hooks.say) hooks.say(msg, secs || 5); }
    function no(text) { talk(text, 5); return { ok: false, text: text }; }

    if (!tonnes) return { ok: false, text: '' };
    var b = board(G, sys, t, contact);
    if (b.refusal) return no(b.refusal);
    var row = null;
    for (var i = 0; i < b.rows.length; i++) if (b.rows[i].cid === cid) { row = b.rows[i]; break; }
    if (!row) {
      var nm = (Eco().BY_ID[cid] && Eco().BY_ID[cid].name.toLowerCase()) || 'that';
      return no(tonnes < 0 ? 'You have no ' + nm + ' aboard.'
                           : contact.name + ' is not carrying ' + nm + '.');
    }

    var s = G.ship;
    var leg = legOf(G, sys, contact, t);
    var qty, each, total, text;

    if (tonnes > 0) {
      if (row.buyEach === null && !row.theirs && !row.buyWhy) {
        return no(contact.name + ' is not carrying ' + row.name.toLowerCase() + '.');
      }
      if (row.buyEach === null) return no(contact.name + ': "Not for sale — ' + (row.buyWhy || 'no') + '."');
      each = row.buyEach;
      var byCredits = Math.floor(s.credits / each);
      qty = Math.min(tonnes, row.theirs, Math.floor(holdFree(G)), byCredits);
      if (qty < 1) {
        return no(holdFree(G) < 1 ? 'Hold full.'
                : byCredits < 1 ? contact.name + ': "' + each + ' cr a tonne. Come back with the money."'
                : contact.name + ': "That is all of it."');
      }
      total = qty * each;
      s.credits -= total;
      s.cargo = s.cargo || {};
      s.cargo[cid] = (s.cargo[cid] || 0) + qty;
      var rec = legRecordForWrite(G, leg);
      rec.took[cid] = (rec.took[cid] || 0) + qty;
      text = contact.name + ' transfers ' + qty + ' t of ' + row.name.toLowerCase() +
             ' for ' + total.toLocaleString('en-US') + ' cr.';
    } else {
      if (!row.held) return no('You have no ' + row.name.toLowerCase() + ' aboard.');
      if (row.sellEach === null) {
        if (row.sellWhy === 'freight under contract' && Missions()) {
          var bond = Missions().bondHolder(G, cid);
          return no((bond ? bond.tonnes + ' t of ' + row.name.toLowerCase() + ' is freight for ' +
                            (bond.toName || 'a contract') : 'That cargo is under contract') +
                    ' — not yours to sell.');
        }
        return no(contact.name + ': "We will not take it — ' + (row.sellWhy || 'no') + '."');
      }
      each = row.sellEach;
      qty = Math.min(-tonnes, Math.floor(row.yours), b.room);
      if (qty < 1) {
        return no(b.room < 1 ? contact.name + ': "No room left this trip."'
                             : 'Nothing to sell.');
      }
      total = qty * each;
      s.cargo[cid] = Math.max(0, (s.cargo[cid] || 0) - qty);
      if (!s.cargo[cid]) delete s.cargo[cid];
      s.credits += total;
      legRecordForWrite(G, leg).sold += qty;
      text = contact.name + ' takes ' + qty + ' t of ' + row.name.toLowerCase() +
             ' for ' + total.toLocaleString('en-US') + ' cr.';
    }
    if (global.Sim && global.Sim.refreshShip) global.Sim.refreshShip(s);
    prune(G, t);

    /* Standing, after the goods have moved — a deal is what earns it. */
    var points = total / CR_PER_STANDING;
    var moved = [];
    var con = b.consequence;
    if (con.gain) {
      var up = accrue(G, t, con.gain.id, points, +1);
      if (up) moved.push({ id: con.gain.id, name: con.gain.name, delta: up });
    }
    if (con.loss) {
      var down = accrue(G, t, con.loss.id, points, -1);
      if (down) moved.push({ id: con.loss.id, name: con.loss.name, delta: -down, why: con.loss.why });
    }
    var M = Missions();
    for (var mv = 0; mv < moved.length; mv++) {
      text += '  ' + moved[mv].name + ' ' + (moved[mv].delta > 0 ? '+' : '') + moved[mv].delta +
              (M ? ' (' + M.standingLabel(M.standing(G, moved[mv].id)) + ')' : '');
    }
    talk(text, 7);
    return { ok: true, qty: qty, each: each, total: total, cid: cid,
             bought: tonnes > 0 ? cid : null, sold: tonnes < 0 ? cid : null,
             standing: moved, text: text };
  }

  /* Most you could buy of a row right now, for the Home key and the
   * screen's "max" column. */
  function maxBuy(G, row) {
    if (!row || row.buyEach === null) return 0;
    return Math.max(0, Math.min(row.theirs, Math.floor(holdFree(G)),
                                Math.floor(G.ship.credits / row.buyEach)));
  }

  var ShipTrade = {
    BUY_MARKUP: BUY_MARKUP, SELL_DISCOUNT: SELL_DISCOUNT,
    STANDING_SWING: STANDING_SWING, CR_PER_STANDING: CR_PER_STANDING,
    DAILY_CAP: DAILY_CAP, SPARE_ROOM: SPARE_ROOM, DEFAULT_ROOM: DEFAULT_ROOM,
    flagOf: flagOf, spaceOf: spaceOf, legOf: legOf,
    refusal: refusal, board: board, consequence: consequence,
    deal: deal, maxBuy: maxBuy, prune: prune
  };

  global.ShipTrade = ShipTrade;
  if (typeof module !== 'undefined' && module.exports) module.exports = ShipTrade;
})(typeof window !== 'undefined' ? window : globalThis);
