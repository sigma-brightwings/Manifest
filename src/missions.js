/* missions.js — contracts, deadlines, and what the factions think of you.
 *
 * A mission board is a pure function of (port, time window), the same trick
 * the whole universe runs on: the offers at Halden Dock this week are the
 * offers at Halden Dock this week, whether you looked yesterday or not, and
 * two visits in the same window see the same board. Accepting one copies it
 * into the player's contract list, which is real mutable state — the board
 * is procedural, your obligations are yours.
 *
 * Three shapes of work, all of them the game's existing systems wearing a
 * pay grade:
 *
 *   HAUL     freight is loaded aboard; deliver it to a named port in this
 *            system by the deadline.
 *   COURIER  a sealed parcel to another STAR — any port there counts. Pays
 *            like it sounds, because the deadline includes a jump.
 *   DISPOSAL reactor waste nobody wants, to a port that can take it. The
 *            dirty-work premium on top of the waste economy that exists.
 *
 * Failure is real: miss a deadline and the contract fails on its own — the
 * fine comes out of your account and the faction remembers. The cargo stays
 * in your hold, because it is physically there and the universe does not
 * repossess by magic; selling a failed contract's freight is between you
 * and your standing.
 */
(function (global) {
  'use strict';

  var RNG = global.RNG, V = global.V;

  var WINDOW = 2 * 86400;          // seconds per board refresh
  var HAUL_DEADLINE = 3 * 86400;
  var COURIER_DEADLINE = 10 * 86400;
  var STANDING_WIN = { haul: 3, courier: 5, disposal: 4 };
  var STANDING_LOSS = 7;
  var FINE_FRACTION = 0.5;

  /* The courier parcel is a commodity the market has never heard of: it can
   * sit in the hold and be jettisoned like anything else, but no port lists
   * it, so it cannot be sold — only delivered or thrown away. */
  function registerParcel() {
    var Eco = global.Economy;
    if (Eco && !Eco.BY_ID.parcel) {
      Eco.BY_ID.parcel = { id: 'parcel', name: 'Sealed courier parcel', base: 0, tier: 0 };
    }
  }

  function windowIndex(t) { return Math.floor(t / WINDOW); }

  /* Ports in this system that will take waste — the disposal mission needs
   * a legal destination before it can be offered. */
  function wasteTakers(sys, t) {
    var Eco = global.Economy;
    var out = [];
    for (var i = 0; i < (sys.ports || []).length; i++) {
      var p = sys.ports[i];
      if (!p.market) continue;
      var q = Eco.price(p, 'waste', t);
      if (q && q.sell !== null && q.sell >= 0) out.push(p);
    }
    return out;
  }

  /* ---- what the board says ----------------------------------------------
   * Two fields, and the split is the whole discipline:
   *
   *   text  the one line on the board. WHAT the job is. Terse, factual,
   *         capped at TEXT_MAX so a board stays scannable however baroque
   *         later mission types become.
   *   desc  WHO is asking and WHY, read on demand behind a button.
   *
   * The long half is assembled from a pool of fragments joined by rules,
   * and there is exactly one rule that keeps it from producing nonsense:
   *
   *     THE GRAMMAR MAY ONLY COMBINE FRAGMENTS THAT DESCRIBE STATE THE
   *     MISSION ACTUALLY HAS.
   *
   * Every slot is either a real value off the offer — the destination, the
   * commodity, the tonnage, the fee — or connective tissue from a pool
   * where every entry is true of every mission of that type. So the worst
   * case is a sentence that reads a little oddly. A sentence that describes
   * a job the player cannot do is structurally impossible, which is the
   * only failure that would actually matter.
   *
   * Fragments are drawn from the offer's OWN seeded stream, never from the
   * board's rng: a board must read the same when you come back to it, and
   * this must not consume a draw that offer generation was relying on. */
  var TEXT_MAX = 240;

  var CLIENT = {
    haul: ['A factor', 'A shipping agent', 'A warehouse clerk',
           'A consortium buyer', 'A dock supervisor'],
    courier: ['A quiet man', 'A legal office', 'A shipping agent',
              'Someone who did not give a name', 'A station registrar'],
    disposal: ['The reactor supervisor', 'A waste contractor',
               'The site foreman', 'An environmental officer']
  };
  var TONE = {
    haul: ['Standard terms.', 'Nothing unusual about it.',
           'Paid on delivery, as always.', 'Routine work, honestly priced.'],
    courier: ['No questions, and none expected.', 'Sealed, and it stays sealed.',
              'Discretion is most of the fee.', 'Hand it over intact and that is that.'],
    disposal: ['Licensed disposal only.', 'The paperwork follows the cargo.',
               'Do not be clever about where it ends up.',
               'Somebody checks. Somebody always checks.']
  };
  var PRESSURE = ['They are not in a hurry, but the board clears at the deadline.',
                  'Sooner is better than later.',
                  'The deadline is real; the fine for missing it is realer.',
                  'They have asked twice already.'];

  /* Fragments joined with a real fact between them. */
  function describe(offer) {
    var r = new RNG('desc|' + offer.id);
    var who = r.pick(CLIENT[offer.type] || CLIENT.haul);
    var tone = r.pick(TONE[offer.type] || TONE.haul);
    var push = r.pick(PRESSURE);
    var what;

    if (offer.type === 'courier') {
      what = who + ' at ' + offer.fromName + ' wants a sealed parcel carried to the ' +
             offer.toName + '. ' + tone;
    } else if (offer.type === 'disposal') {
      what = who + ' at ' + offer.fromName + ' has ' + offer.tonnes +
             ' tonnes of reactor waste to move to ' + offer.toName +
             ', and is paying to make it somebody else’s problem. ' + tone;
    } else {
      var name = (global.Economy.BY_ID[offer.cid] || {}).name || offer.cid;
      what = who + ' at ' + offer.fromName + ' has ' + offer.tonnes + ' tonnes of ' +
             name.toLowerCase() + ' bound for ' + offer.toName +
             ' and no hull to put it in. ' + tone;
    }
    return what + ' ' + push + '  Fee ' + offer.pay + ' cr on arrival.';
  }

  /* Applied to every offer as it is built, so no mission type can ship
   * without both fields or with a headline that runs off the board. */
  function finish(offer) {
    if (offer.text && offer.text.length > TEXT_MAX) {
      offer.text = offer.text.slice(0, TEXT_MAX - 1) + '…';
    }
    if (!offer.desc) offer.desc = describe(offer);
    return offer;
  }

  /* The board. Deterministic in (port, window); the accepted/done sets are
   * the only thing that makes two lookups differ, and they are the
   * player's doing. */
  function boardAt(port, sys, galaxy, here, t) {
    if (!port || !port.market) return [];
    var Eco = global.Economy;
    var win = windowIndex(t);
    var rng = new RNG('missions|' + port.id + '|' + win + '|' + sys.seed);
    var offers = [];
    var others = (sys.ports || []).filter(function (p) { return p !== port && p.market; });
    var takers = wasteTakers(sys, t);

    var n = rng.int(3, 6);
    for (var i = 0; i < n; i++) {
      var id = 'm|' + port.id + '|' + win + '|' + i;
      var roll = rng.next();

      if (roll < 0.5 && others.length) {
        // HAUL: real freight to a real port, priced by tonnage and haste.
        var dst = rng.pick(others);
        var goods = Object.keys(port.market.rows).filter(function (cid) {
          return cid !== 'waste' && cid !== Eco.FUEL_ID && !Eco.BY_ID[cid].contraband &&
                 port.market.rows[cid].exporter;
        });
        if (!goods.length) goods = ['grain'];
        var cid = rng.pick(goods);
        var tonnes = rng.int(4, 18);
        offers.push({
          id: id, type: 'haul', cid: cid, tonnes: tonnes,
          from: port.id, fromName: port.name,
          toPortId: dst.id, toName: dst.name,
          faction: port.faction || null,
          pay: Math.round(tonnes * rng.range(28, 55) + 250),
          deadline: t - (t % WINDOW) + HAUL_DEADLINE,
          text: tonnes + 't ' + (Eco.BY_ID[cid] ? Eco.BY_ID[cid].name : cid) +
                ' to ' + dst.name
        });
      } else if (roll < 0.78 && galaxy) {
        // COURIER: a parcel to a neighbouring star. Any port there counts.
        var near = galaxy.stars.filter(function (s) {
          if (s === here) return false;
          var d = global.Galaxy.distance3(here, s);
          return d > 0 && d < 9;
        });
        if (!near.length) { i--; n--; continue; }
        var star = rng.pick(near);
        offers.push({
          id: id, type: 'courier', cid: 'parcel', tonnes: 1,
          from: port.id, fromName: port.name,
          toStarId: star.id, toName: star.name + ' system',
          faction: port.faction || null,
          pay: Math.round(rng.range(1800, 4800)),
          deadline: t - (t % WINDOW) + COURIER_DEADLINE,
          text: 'sealed parcel to the ' + star.name + ' system'
        });
      } else if (takers.length) {
        // DISPOSAL: their waste, your problem, everyone's premium.
        var tk = rng.pick(takers.filter(function (p) { return p !== port; }));
        if (!tk) continue;
        var wt = rng.int(6, 16);
        offers.push({
          id: id, type: 'disposal', cid: 'waste', tonnes: wt,
          from: port.id, fromName: port.name,
          toPortId: tk.id, toName: tk.name,
          faction: port.faction || null,
          pay: Math.round(wt * rng.range(60, 95)),
          deadline: t - (t % WINDOW) + HAUL_DEADLINE,
          text: wt + 't reactor waste to ' + tk.name
        });
      }
    }

    /* Every offer gets its headline capped and its long form written, in
     * one place — so a mission type added later cannot ship without both,
     * and nobody has to remember to call this per branch above. */
    for (var f = 0; f < offers.length; f++) finish(offers[f]);

    // Whatever the player has already taken or finished this window is gone.
    var taken = {};
    return offers.filter(function (o) { return !taken[o.id]; });
  }

  function alreadyHave(G, offerId) {
    var list = G.missions || [];
    for (var i = 0; i < list.length; i++) if (list[i].id === offerId) return true;
    return (G.doneMissions || {})[offerId];
  }

  function accept(G, offer, hooks) {
    var Sim = global.Sim;
    if (alreadyHave(G, offer.id)) return { ok: false, why: 'already taken' };
    var free = G.ship.cargoCap - Sim.cargoMass(G.ship);
    if (offer.tonnes > free) {
      return { ok: false, why: 'need ' + offer.tonnes + 't of hold space' };
    }
    G.ship.cargo[offer.cid] = (G.ship.cargo[offer.cid] || 0) + offer.tonnes;
    Sim.refreshShip(G.ship);
    (G.missions = G.missions || []).push({
      id: offer.id, type: offer.type, cid: offer.cid, tonnes: offer.tonnes,
      fromName: offer.fromName, toPortId: offer.toPortId || null,
      toStarId: offer.toStarId || null, toName: offer.toName,
      faction: offer.faction, pay: offer.pay, deadline: offer.deadline,
      text: offer.text,
      /* Carried, not regenerated. A contract you signed a week ago has to
       * still say what it said when you signed it. */
      desc: offer.desc || null,
      campaign: offer.campaign || false, factionId: offer.factionId,
      arcId: offer.arcId, step: offer.step
    });
    /* A campaign hook (chapter zero of a faction's chain) also opens the
     * chain's own progress record — everything after this rides on it. */
    if (offer.campaign) {
      G.campaigns = G.campaigns || {};
      G.campaigns[offer.factionId] = { arcId: offer.arcId, step: offer.step, status: 'active' };
    }
    if (hooks && hooks.say) hooks.say('Contract signed: ' + offer.text, 4);
    if (hooks && hooks.sound) hooks.sound('click');
    return { ok: true };
  }

  /* Called every dock. Completion needs the destination AND the freight —
   * a courier who sold the parcel arrives with nothing to hand over and the
   * contract just sits there until the deadline does its work. */
  function completeAtDock(G, port, sys, t, hooks) {
    var Sim = global.Sim;
    var list = G.missions || [];
    for (var i = list.length - 1; i >= 0; i--) {
      var m = list[i];
      var here = (m.toPortId && m.toPortId === port.id) ||
                 (m.toStarId && G.here && m.toStarId === G.here.id);
      if (!here) continue;
      var held = G.ship.cargo[m.cid] || 0;
      if (held + 1e-9 < m.tonnes) {
        if (hooks && hooks.say) {
          hooks.say('Contract needs ' + m.tonnes + 't of ' + m.cid +
                    ' aboard — you have ' + held.toFixed(0) + 't', 5);
        }
        continue;
      }
      G.ship.cargo[m.cid] = held - m.tonnes;
      if (G.ship.cargo[m.cid] <= 1e-9) delete G.ship.cargo[m.cid];
      Sim.refreshShip(G.ship);
      G.ship.credits += m.pay;
      bumpStanding(G, m.faction, STANDING_WIN[m.type] || 3);
      (G.doneMissions = G.doneMissions || {})[m.id] = true;
      list.splice(i, 1);
      if (hooks && hooks.say) hooks.say('Contract complete — ' + m.pay + ' cr', 5);
      if (hooks && hooks.sound) hooks.sound('pay');
      /* A campaign chapter settling is what casts the next one — see
       * arcs.js. Ordinary contracts have no `campaign` flag and this is a
       * no-op for them. */
      if (m.campaign && global.Arcs) global.Arcs.onStepComplete(G, m, port, sys, t, hooks);
    }
  }

  function update(G, t, hooks) {
    var list = G.missions || [];
    for (var i = list.length - 1; i >= 0; i--) {
      var m = list[i];
      if (t <= m.deadline) continue;
      var fine = Math.round(m.pay * FINE_FRACTION);
      G.ship.credits = Math.max(0, G.ship.credits - fine);
      bumpStanding(G, m.faction, -STANDING_LOSS);
      (G.doneMissions = G.doneMissions || {})[m.id] = true;
      list.splice(i, 1);
      if (hooks && hooks.say) {
        hooks.say('CONTRACT FAILED: ' + m.text + ' — fined ' + fine + ' cr', 7);
      }
      if (hooks && hooks.sound) hooks.sound('warn');
      if (m.campaign && global.Arcs) global.Arcs.onStepFailed(G, m, t, hooks);
    }
  }

  /* ---- standing ---------------------------------------------------------
   * One number per faction, clamped, moved by outcomes and by crime (the
   * combat module calls bumpStanding too). It is reputation, not law — the
   * law is the bounty ledger next door. */
  function standing(G, fac) { return (G.standing || {})[fac] || 0; }

  function bumpStanding(G, fac, delta) {
    if (!fac) return;
    G.standing = G.standing || {};
    G.standing[fac] = Math.max(-100, Math.min(100, (G.standing[fac] || 0) + delta));
  }

  function standingLabel(v) {
    return v <= -40 ? 'HOSTILE' : v <= -10 ? 'cold'
         : v < 10 ? 'neutral' : v < 40 ? 'warm' : 'ALLIED';
  }

  registerParcel();

  var Missions = {
    WINDOW: WINDOW,
    boardAt: boardAt, accept: accept,
    completeAtDock: completeAtDock, update: update,
    standing: standing, bumpStanding: bumpStanding, standingLabel: standingLabel,
    alreadyHave: alreadyHave,
    TEXT_MAX: TEXT_MAX, describe: describe, finish: finish
  };

  global.Missions = Missions;
  if (typeof module !== 'undefined' && module.exports) module.exports = Missions;
})(typeof window !== 'undefined' ? window : globalThis);
