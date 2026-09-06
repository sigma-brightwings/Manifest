/* arcs.js — faction campaigns: authored arc skeletons, procedurally cast.
 *
 * A handful of hand-written story shapes, each a short escalating sequence
 * of contract types (haul, courier, disposal, and the new black-market
 * run). The galaxy assigns one to every faction the moment it is built — a
 * pure function of the galaxy seed, exactly like the faction's name and
 * color (see `arcSeed` in galaxy.js). Casting a CHAPTER onto the actual
 * universe happens only when it is needed:
 *
 *   - the hook (chapter zero) is rolled onto a faction's own ports the same
 *     way an ordinary contract is, with its own rng draw so it never
 *     disturbs missions.js's sequence;
 *   - every later chapter is generated the moment the previous one settles,
 *     cast against the real port you just delivered at, using the same
 *     procedural building blocks the ordinary board uses.
 *
 * The chain rides missions.js's existing contract machinery rather than
 * duplicating it: a campaign chapter is a normal entry in G.missions (same
 * deadline, same fine on failure, same pay-on-delivery), just tagged
 * `campaign: true` with a `factionId`/`arcId`/`step` so missions.js knows to
 * call back in here when one settles.
 */
(function (global) {
  'use strict';

  var RNG = global.RNG;

  var WINDOW = 2 * 86400;
  var HAUL_DEADLINE = 4 * 86400;
  var COURIER_DEADLINE = 10 * 86400;
  var STEP_COOLDOWN = 12 * 86400;    // after a chain finishes, before it offers again
  var FAIL_COOLDOWN = 6 * 86400;     // after a chain breaks, before it offers again
  var HOOK_CHANCE = 0.55;            // per port, per board window
  var CAMPAIGN_STANDING_WIN = 6;     // on top of the ordinary per-chapter standing gain
  var CAMPAIGN_PAY_MUL = [1.0, 1.35, 1.8, 2.4];

  /* Three shapes. Deliberately faction-neutral wording — which faction is
   * running which shape is the seed's business, not the author's. */
  var ARC_TEMPLATES = [
    {
      id: 'proving-ground', steps: ['haul', 'disposal', 'haul'],
      hook: 'They want to see if you can be trusted with real freight',
      finalText: 'One last run, the big one — deliver and you are one of theirs',
      completeCredits: 6000, completeStanding: 25
    },
    {
      id: 'shadow-run', steps: ['haul', 'smuggle', 'smuggle'],
      hook: 'A courier who does not ask questions is worth keeping around',
      finalText: 'The big run — everything they could not move any other way',
      completeCredits: 9000, completeStanding: 20
    },
    {
      id: 'long-haul', steps: ['courier', 'haul', 'courier'],
      hook: 'A name they can put on a manifest across the border',
      finalText: 'Carry their word to the far system, and back into their good books',
      completeCredits: 8000, completeStanding: 22
    }
  ];
  var ARC_BY_ID = {};
  ARC_TEMPLATES.forEach(function (t) { ARC_BY_ID[t.id] = t; });

  /* Which shape a faction runs — a pure function of the faction's own
   * `arcSeed` (itself a pure function of the galaxy seed), memoized on the
   * faction object for the life of this galaxy build. */
  function arcForFaction(fac) {
    if (!fac) return null;
    if (fac._arcTpl) return fac._arcTpl;
    var r = new RNG(fac.arcSeed || ('arc|' + fac.id));
    fac._arcTpl = ARC_TEMPLATES[r.int(0, ARC_TEMPLATES.length - 1)];
    return fac._arcTpl;
  }

  function windowIndex(t) { return Math.floor(t / WINDOW); }

  function basePay(offer) {
    if (offer.type === 'courier') return 2200;
    if (offer.type === 'disposal') return offer.tonnes * 75;
    if (offer.type === 'smuggle') return offer.tonnes * 140;
    return offer.tonnes * 40;
  }

  function deadlineFor(offer, t) {
    return t - (t % WINDOW) + (offer.type === 'courier' ? COURIER_DEADLINE : HAUL_DEADLINE);
  }

  /* One concrete offer for an abstract step type, cast against whatever is
   * actually at this port right now — the same primitives the ordinary
   * board uses, on their own rng draw. Falls back to a legal haul when the
   * system cannot support the requested flavour (no black market, no
   * neighbouring star to courier to) rather than breaking the chain. */
  function castStep(type, port, sys, galaxy, here, rng, t) {
    var Eco = global.Economy;
    if (type === 'smuggle') {
      if (!port.market || !port.market.blackMarket) {
        return castStep('haul', port, sys, galaxy, here, rng, t);
      }
      var goodsBM = Object.keys(port.market.rows).filter(function (cid) {
        return Eco.BY_ID[cid] && Eco.BY_ID[cid].contraband;
      });
      var destsBM = (sys.ports || []).filter(function (p) { return p !== port && p.market; });
      if (!goodsBM.length || !destsBM.length) {
        return castStep('haul', port, sys, galaxy, here, rng, t);
      }
      var cidBM = rng.pick(goodsBM), tonnesBM = rng.int(6, 16), destBM = rng.pick(destsBM);
      return {
        type: 'smuggle', cid: cidBM, tonnes: tonnesBM,
        from: port.id, fromName: port.name, toPortId: destBM.id, toName: destBM.name,
        text: tonnesBM + 't of ' + Eco.BY_ID[cidBM].name + ' — off the books, to ' + destBM.name
      };
    }
    if (type === 'courier') {
      if (!galaxy || !here) return null;
      var near = galaxy.stars.filter(function (s) {
        if (s === here) return false;
        var d = global.Galaxy.distance3(here, s);
        return d > 0 && d < 9;
      });
      if (!near.length) return null;
      var star = rng.pick(near);
      return {
        type: 'courier', cid: 'parcel', tonnes: 1,
        from: port.id, fromName: port.name, toStarId: star.id, toName: star.name + ' system',
        text: 'sealed parcel to the ' + star.name + ' system'
      };
    }
    if (type === 'disposal') {
      var takers = (sys.ports || []).filter(function (p) {
        if (!p.market || p === port) return false;
        var q = Eco.price(p, 'waste', t);
        return q && q.sell !== null && q.sell >= 0;
      });
      if (!takers.length) return null;
      var tk = rng.pick(takers), wt = rng.int(8, 18);
      return {
        type: 'disposal', cid: 'waste', tonnes: wt,
        from: port.id, fromName: port.name, toPortId: tk.id, toName: tk.name,
        text: wt + 't reactor waste to ' + tk.name
      };
    }
    // 'haul'
    if (!port.market) return null;
    var others = (sys.ports || []).filter(function (p) { return p !== port && p.market; });
    var goods = Object.keys(port.market.rows).filter(function (cid) {
      return cid !== 'waste' && cid !== Eco.FUEL_ID && !Eco.BY_ID[cid].contraband &&
             port.market.rows[cid].exporter;
    });
    if (!others.length || !goods.length) return null;
    var dst = rng.pick(others), cid = rng.pick(goods), tonnes = rng.int(6, 18);
    return {
      type: 'haul', cid: cid, tonnes: tonnes,
      from: port.id, fromName: port.name, toPortId: dst.id, toName: dst.name,
      text: tonnes + 't ' + Eco.BY_ID[cid].name + ' to ' + dst.name
    };
  }

  /* Chapter zero. Offered like an ordinary contract — a pure function of
   * (port, window) — except it is also gated on the player not already
   * running (or cooling down from) this faction's chain. */
  function campaignBoardAt(G, port, sys, galaxy, here, t) {
    if (!port || !port.market || !port.faction || !galaxy || !galaxy.factionById) return [];
    var fac = galaxy.factionById[port.faction];
    if (!fac) return [];
    var tpl = arcForFaction(fac);
    if (!tpl) return [];
    G.campaigns = G.campaigns || {};
    var progress = G.campaigns[fac.id];
    if (progress && progress.status === 'active') return [];
    if (progress && progress.cooldownUntil && t < progress.cooldownUntil) return [];

    var win = windowIndex(t);
    var rng = new RNG('arc-hook|' + fac.id + '|' + port.id + '|' + win);
    if (!rng.chance(HOOK_CHANCE)) return [];
    var offer = castStep(tpl.steps[0], port, sys, galaxy, here, rng, t);
    if (!offer) return [];

    var pay = Math.round(basePay(offer) * CAMPAIGN_PAY_MUL[0]);
    return [{
      id: 'arc|' + fac.id + '|' + tpl.id + '|0|' + win,
      type: offer.type, cid: offer.cid, tonnes: offer.tonnes,
      fromName: offer.fromName, toPortId: offer.toPortId || null,
      toStarId: offer.toStarId || null, toName: offer.toName,
      faction: fac.id, pay: pay, deadline: deadlineFor(offer, t),
      text: tpl.hook + ' — ' + offer.text,
      campaign: true, factionId: fac.id, arcId: tpl.id, step: 0
    }];
  }

  /* Called by missions.js the instant a campaign chapter is delivered.
   * Either casts the next chapter right there at the port you just landed
   * at, or — on the last step — pays out the chain's real reward. */
  function onStepComplete(G, m, port, sys, t, hooks) {
    var progress = (G.campaigns = G.campaigns || {})[m.factionId];
    if (!progress) return;
    var tpl = ARC_BY_ID[m.arcId];
    if (!tpl) return;

    if (global.Missions) global.Missions.bumpStanding(G, m.factionId, CAMPAIGN_STANDING_WIN);
    var facName = (G.galaxy && G.galaxy.factionById && G.galaxy.factionById[m.factionId]) ?
                  G.galaxy.factionById[m.factionId].name : 'The faction';

    var nextIdx = m.step + 1;
    if (nextIdx >= tpl.steps.length) {
      G.ship.credits += tpl.completeCredits;
      if (global.Missions) global.Missions.bumpStanding(G, m.factionId, tpl.completeStanding);
      progress.status = 'completed';
      progress.cooldownUntil = t + STEP_COOLDOWN;
      if (hooks && hooks.say) {
        hooks.say(facName + ': ' + tpl.finalText + ' — ' + tpl.completeCredits + ' cr', 7);
      }
      if (hooks && hooks.sound) hooks.sound('pay');
      return;
    }

    var win = windowIndex(t);
    var rng = new RNG('arc|' + m.factionId + '|' + tpl.id + '|' + nextIdx + '|' + win + '|' + port.id);
    var offer = castStep(tpl.steps[nextIdx], port, sys, G.galaxy, G.here, rng, t);
    if (!offer) {
      // Nowhere to send the next chapter from here. Leave the chain open —
      // the player can pick up a fresh hook at any of this faction's ports.
      progress.status = 'stalled';
      return;
    }

    var pay = Math.round(basePay(offer) *
      (CAMPAIGN_PAY_MUL[nextIdx] || CAMPAIGN_PAY_MUL[CAMPAIGN_PAY_MUL.length - 1]));
    /* An ordinary accept() loads the freight the moment you sign — the next
     * chapter of a chain is handed to you the same way, right there at the
     * dock you just delivered at, rather than leaving you to go buy your
     * own contract's cargo. Only if the hold cannot physically take it does
     * the chapter arrive as freight you have to source yourself. */
    var Sim = global.Sim;
    var free = Sim ? G.ship.cargoCap - Sim.cargoMass(G.ship) : offer.tonnes;
    if (Sim && free >= offer.tonnes) {
      G.ship.cargo[offer.cid] = (G.ship.cargo[offer.cid] || 0) + offer.tonnes;
      Sim.refreshShip(G.ship);
    }
    (G.missions = G.missions || []).push({
      id: 'arc|' + m.factionId + '|' + tpl.id + '|' + nextIdx + '|' + win,
      type: offer.type, cid: offer.cid, tonnes: offer.tonnes,
      fromName: offer.fromName, toPortId: offer.toPortId || null,
      toStarId: offer.toStarId || null, toName: offer.toName,
      faction: m.factionId, pay: pay, deadline: deadlineFor(offer, t), text: offer.text,
      campaign: true, factionId: m.factionId, arcId: tpl.id, step: nextIdx
    });
    progress.step = nextIdx;
    if (hooks && hooks.say) hooks.say(facName + ': next chapter — ' + offer.text, 6);
    if (hooks && hooks.sound) hooks.sound('click');
  }

  /* Called by missions.js the instant a campaign chapter blows its
   * deadline. The chain breaks rather than silently vanishing — it can be
   * picked back up, from the top, once the cooldown passes. */
  function onStepFailed(G, m, t, hooks) {
    var progress = (G.campaigns = G.campaigns || {})[m.factionId];
    if (!progress) return;
    progress.status = 'failed';
    progress.cooldownUntil = t + FAIL_COOLDOWN;
    if (hooks && hooks.say) {
      hooks.say('The chain with ' +
        ((G.galaxy && G.galaxy.factionById && G.galaxy.factionById[m.factionId]) ?
          G.galaxy.factionById[m.factionId].name : 'them') +
        ' breaks — they will not offer again for a while', 6);
    }
  }

  var Arcs = {
    ARC_TEMPLATES: ARC_TEMPLATES,
    ARC_BY_ID: ARC_BY_ID,
    arcForFaction: arcForFaction,
    campaignBoardAt: campaignBoardAt,
    onStepComplete: onStepComplete,
    onStepFailed: onStepFailed
  };

  global.Arcs = Arcs;
  if (typeof module !== 'undefined' && module.exports) module.exports = Arcs;
})(typeof window !== 'undefined' ? window : globalThis);
