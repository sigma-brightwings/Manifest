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
    if (offer.type === 'sabotage') return 5000;
    if (offer.infiltrate) return 3200;
    /* The surveyor's rungs (POWER_ARCS.guild). Priced on what the work
     * costs you rather than what it weighs: a world read the whole way
     * round is days of orbits, and a port is a crawler. */
    if (offer.type === 'survey') return Math.round(4200 + 9000 * (offer.covWant || 0.5));
    if (offer.type === 'found') return 26000;
    if (offer.type === 'sweep') return 5200;
    if (offer.supply) return Math.round(3600 + offer.tonnes * 520);
    if (offer.type === 'prospect') return Math.round(3200 + offer.tonnes * 420);
    if (offer.type === 'recovery') return 5600;
    return offer.tonnes * 40;
  }

  var FIELD_DEADLINE = 18 * 86400;        // a world read, a claim filed, a port built
  /* A degraded supply chapter is still a supply chapter. */
  function supplyMark(offer) {
    if (offer) offer.supply = true;
    return offer;
  }

  function deadlineFor(offer, t) {
    var span = offer.type === 'courier' ? COURIER_DEADLINE
             : (offer.type === 'survey' || offer.type === 'prospect' ||
                offer.type === 'found' || offer.type === 'sweep' ||
                offer.type === 'recovery') ? FIELD_DEADLINE
             : HAUL_DEADLINE;
    return t - (t % WINDOW) + span;
  }

  /* One concrete offer for an abstract step type, cast against whatever is
   * actually at this port right now — the same primitives the ordinary
   * board uses, on their own rng draw. Falls back to a legal haul when the
   * system cannot support the requested flavour (no black market, no
   * neighbouring star to courier to) rather than breaking the chain. */
  function castStep(type, port, sys, galaxy, here, rng, t, opts) {
    /* The career, for the one chapter that has to look at it. Optional
     * everywhere else, which is why it rides in opts rather than the
     * signature every other caller would have to learn. */
    var G0 = (opts && opts.G) || null;
    var Eco = global.Economy;

    /* ---- THE SURVEYOR'S CHAPTERS (2026-11-11) ---------------------------
     * Five rungs of the mining ladder, cast as contracts the rest of the
     * game already knows how to settle: the first two are fieldwork.js's
     * survey and prospect objectives, the third is a new one it settles
     * too, the fourth is an ordinary haul to a port you own, and the last
     * is a survey of ground that happens to have somebody's secret
     * sitting on it.
     *
     * Every one degrades, like the sequels' chapters do: a story that
     * cannot be cast here must not stop, so each falls back to a haul and
     * the words carry it. */
    if (type === 'gsurvey' || type === 'gdark') {
      var Sv = global.Survey;
      if (!Sv || !Sv.TABLE) return null;
      var worldsG = (sys.bodies || []).filter(function (b) {
        return (b.kind === 'planet' || b.kind === 'moon') && Sv.TABLE[b.type];
      });
      if (!worldsG.length) return null;
      var bodyG = null;
      if (type === 'gdark') {
        /* The ground under something nobody lists. If this system has no
         * such thing, the chapter is still the chapter - the Guild wants
         * a world read that nobody has read, and the furthest one out
         * will do. */
        var hidden = (sys.ports || []).filter(function (p) { return p.classified; });
        for (var hi = 0; hi < hidden.length && !bodyG; hi++) {
          var hostH = hidden[hi].orbit && sys.byId ? sys.byId[hidden[hi].orbit.parent] : null;
          if (hostH && Sv.TABLE[hostH.type]) bodyG = hostH;
        }
        if (!bodyG) bodyG = worldsG[worldsG.length - 1];
      } else {
        bodyG = rng.pick(worldsG);
      }
      var wantG = type === 'gdark' ? 0.8 : 0.65;
      return {
        type: 'survey', cid: null, tonnes: 0,
        from: port.id, fromName: port.name, toPortId: port.id, toName: port.name,
        surveyKey: null, bodyId: bodyG.id, bodyName: bodyG.name,
        covFrom: 0, covWant: wantG, dark: type === 'gdark',
        text: Math.round(wantG * 100) + ' per cent of ' + bodyG.name +
              (type === 'gdark' ? ', whoever else is standing on it' : ', the whole way round')
      };
    }
    if (type === 'gprospect') {
      var SvP = global.Survey;
      if (!SvP || !SvP.deposits) return null;
      var picksG = [];
      (sys.bodies || []).forEach(function (b) {
        if (b.kind !== 'planet' && b.kind !== 'moon') return;
        var rowsG;
        try { rowsG = SvP.deposits(b, sys) || []; } catch (e) { rowsG = []; }
        rowsG.forEach(function (r) {
          if (r.cid !== 'hydrogen' && r.grade > 0.18) picksG.push({ body: b, cid: r.cid });
        });
      });
      if (!picksG.length) return null;
      var pg = rng.pick(picksG), tg = rng.int(10, 20);
      return {
        type: 'prospect', cid: pg.cid, tonnes: tg,
        from: port.id, fromName: port.name, toPortId: port.id, toName: port.name,
        claimKey: null, bodyId: pg.body.id, bodyName: pg.body.name,
        text: tg + ' t of ' + ((SvP.NAMES && SvP.NAMES[pg.cid]) || pg.cid) +
              ' out of ' + pg.body.name + ' itself'
      };
    }
    if (type === 'gfound') {
      return {
        type: 'found', cid: null, tonnes: 0,
        from: port.id, fromName: port.name, toPortId: port.id, toName: port.name,
        starId: here ? here.id : null,
        text: 'a port of your own, anywhere in this system'
      };
    }
    if (type === 'gsupply') {
      /* To the port the player founded, if there is one here; otherwise an
       * ordinary run, because the chapter must not stall. */
      var St = global.Stations;
      var mine = null;
      if (St && St.list && St.portId) {
        var own = St.list(G0).filter(function (x) { return !x.seized; });
        for (var oi = 0; oi < own.length && !mine; oi++) {
          var pp = sys.byId && sys.byId[St.portId(own[oi])];
          if (pp) mine = pp;
        }
      }
      if (!mine) return supplyMark(castStep('haul', port, sys, galaxy, here, rng, t));
      var goodsG = Object.keys(port.market.rows || {}).filter(function (cid) {
        return cid !== 'waste' && cid !== Eco.FUEL_ID && Eco.BY_ID[cid] &&
               !Eco.BY_ID[cid].contraband && port.market.rows[cid].exporter;
      });
      if (!goodsG.length) return supplyMark(castStep('haul', port, sys, galaxy, here, rng, t));
      var cidG = rng.pick(goodsG), tnG = rng.int(10, 22);
      return {
        type: 'haul', supply: true, cid: cidG, tonnes: tnG,
        from: port.id, fromName: port.name, toPortId: mine.id, toName: mine.name,
        text: tnG + 't ' + Eco.BY_ID[cidG].name + ' to ' + mine.name + ', which is yours'
      };
    }

    /* THE SEQUELS' CHAPTER KINDS (see POWER_ARCS.navy2). Each degrades to an
     * ordinary courier or haul where this system cannot support it, so the
     * story still happens. */
    if (type === 'infiltrate' || type === 'recover') {
      if (!galaxy || !here) return null;
      var want = opts && opts.target;
      var nearI = galaxy.stars.filter(function (s) {
        if (s === here || !s.factionId) return false;   // a port to dock at (2026-10-24)
        var d = global.Galaxy.distance3(here, s);
        return d > 0 && d < 14;
      });
      if (!nearI.length) return null;
      var hostile = nearI.filter(function (s) {
        return want === 'syndicate' ? s.factionId === 'outlaw'
             : want === 'lawful' ? (s.factionId !== 'outlaw') : false;
      });
      var starI = rng.pick(hostile.length && type === 'infiltrate' ? hostile : nearI);
      return {
        type: 'courier', cid: 'parcel', tonnes: 1, infiltrate: type === 'infiltrate',
        from: port.id, fromName: port.name, toStarId: starI.id, toName: starI.name + ' system',
        toStar: starI,
        text: type === 'infiltrate' ? 'into the ' + starI.name + ' system and docked, unsearched'
                                    : 'recover the prototype from the wreck in the ' + starI.name + ' system'
      };
    }
    if (type === 'sabotage') {
      var wantS = opts && opts.target;
      var portsS = (sys.ports || []).filter(function (p) { return p !== port && p.market; });
      if (!portsS.length) return null;
      var pref = portsS.filter(function (p) {
        return wantS === 'syndicate' ? (p.faction === 'outlaw' || (p.market && p.market.blackMarket))
             : wantS === 'lawful' ? p.faction !== 'outlaw' : false;
      });
      var tgtS = rng.pick(pref.length ? pref : portsS);
      return {
        type: 'sabotage', cid: null, tonnes: 0,
        from: port.id, fromName: port.name, toPortId: tgtS.id, toName: tgtS.name,
        text: 'hole ' + tgtS.name + ' with a rock torpedo'
      };
    }
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
        if (s === here || !s.factionId) return false;   // a port to deliver to (2026-10-24)
        var d = global.Galaxy.distance3(here, s);
        return d > 0 && d < 9;
      });
      if (!near.length) return null;
      var star = rng.pick(near);
      return {
        type: 'courier', cid: 'parcel', tonnes: 1,
        from: port.id, fromName: port.name, toStarId: star.id, toName: star.name + ' system',
        /* The star OBJECT, kept only long enough for `dress` to hand it to
         * the prose generator. It is never copied onto a signed contract —
         * a live galaxy reference has no business in a save. */
        toStar: star,
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

  /* Every chapter goes through missions.js's own finisher, so a campaign
   * contract carries the same long form an ordinary one does. Without this
   * a chapter had `text` and no `desc` at all, and the DETAILS button — on
   * the board and now on a signed contract — had nothing to open on the one
   * kind of work that most deserves an explanation.
   *
   * `finish` leaves an existing `text` alone, which is exactly what a hook
   * prefix needs, and writes only the missing `desc`. */
  function dress(entry, port, sys, here, toStar) {
    var M = global.Missions;
    if (!M || !M.finish) return entry;
    var toPort = null;
    if (entry.toPortId) {
      var ps = (sys && sys.ports) || [];
      for (var i = 0; i < ps.length; i++) {
        if (ps[i].id === entry.toPortId) { toPort = ps[i]; break; }
      }
    }
    return M.finish(entry, {
      fromPort: port, toPort: toPort, sys: sys, here: here, toStar: toStar || null
    });
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
    return [dress({
      id: 'arc|' + fac.id + '|' + tpl.id + '|0|' + win,
      type: offer.type, cid: offer.cid, tonnes: offer.tonnes,
      fromName: offer.fromName, toPortId: offer.toPortId || null,
      toStarId: offer.toStarId || null, toName: offer.toName,
      faction: fac.id, pay: pay, deadline: deadlineFor(offer, t),
      text: tpl.hook + ' — ' + offer.text,
      campaign: true, factionId: fac.id, arcId: tpl.id, step: 0
    }, port, sys, here, offer.toStar)];
  }

  /* Called by missions.js the instant a campaign chapter is delivered.
   * Either casts the next chapter right there at the port you just landed
   * at, or — on the last step — pays out the chain's real reward. */
  function onStepComplete(G, m, port, sys, t, hooks) {
    /* An authored power chain is read from a script rather than cast from
     * a template, so it settles down its own path. Same entry point,
     * because missions.js should not have to know there are two kinds. */
    if (m.power) return onPowerStepComplete(G, m, port, sys, t, hooks);
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
    (G.missions = G.missions || []).push(dress({
      id: 'arc|' + m.factionId + '|' + tpl.id + '|' + nextIdx + '|' + win,
      type: offer.type, cid: offer.cid, tonnes: offer.tonnes,
      fromName: offer.fromName, toPortId: offer.toPortId || null,
      toStarId: offer.toStarId || null, toName: offer.toName,
      faction: m.factionId, pay: pay, deadline: deadlineFor(offer, t), text: offer.text,
      campaign: true, factionId: m.factionId, arcId: tpl.id, step: nextIdx
    }, port, sys, G.here, offer.toStar));
    progress.step = nextIdx;
    if (hooks && hooks.say) hooks.say(facName + ': next chapter — ' + offer.text, 6);
    if (hooks && hooks.sound) hooks.sound('click');
  }

  /* Called by missions.js the instant a campaign chapter blows its
   * deadline. The chain breaks rather than silently vanishing — it can be
   * picked back up, from the top, once the cooldown passes. */
  function onStepFailed(G, m, t, hooks) {
    if (m.power) {
      var pk = m.powerKey || m.power;
      var pp = (G.powers = G.powers || {})[pk];
      /* One of the contact's two contracts lapsing is not the chain failing
       * while the other is still open. */
      if (m.choiceGroup && (G.missions || []).some(function (o) { return o !== m && o.choiceGroup === m.choiceGroup && !o.choiceVoid && t <= o.deadline; })) return;
      if (m.choiceVoid) return;
      if (pp && pp.status === 'failed' && pp.failedAt === t) return;
      if (pp) { pp.status = 'failed'; pp.cooldownUntil = t + FAIL_COOLDOWN; pp.failedAt = t; }
      if (hooks && hooks.say) {
        hooks.say((m.blownBy ? 'Searched by ' + m.blownBy + ' - the run is blown. ' : '') + 'You have dropped ' + (POWER_ARCS[pk] || {}).name +
                  '. They will let you start again, eventually.', 7);
      }
      return;
    }
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

  /* ======================================================================
   * THE TWO POWERS, AND THE CHOICE BETWEEN THEM
   * ======================================================================
   *
   * Astra: "The Navy campaign should have a fairly in-depth story", and
   * "anything you do for the military power in the region, also do for
   * Syndicate, since they're basically the alternative."
   *
   * Everything above this line is a faction-neutral SHAPE — three steps
   * cast against whatever is at the port, with the flavour decided by the
   * seed. That is the right machinery for twelve powers whose difference
   * is which flag they fly, and the wrong machinery for these two, whose
   * difference is what they think a person is for.
   *
   * So these are AUTHORED. Five chapters each, written rather than cast,
   * with their own progress record, their own gate, and their own reward.
   * The objectives underneath them are still real contracts cast by
   * castStep against real ports — the story is the frame, not a substitute
   * for the work — but the order, the words and the consequences are
   * fixed, because a story that is different every time is not a story.
   *
   * THE TWO ARE THE SAME CHAIN SEEN FROM OPPOSITE ENDS, deliberately.
   * Both are about the same leak: military fuel is going somewhere it
   * should not, and both chains are the story of who finds out. The navy
   * is trying to close it. The Syndicate is the reason it is open. The
   * player is the one carrying the boxes either way, which is the whole
   * argument this game makes about trade.
   *
   * AND AT CHAPTER THREE YOU CHOOSE. Taking the third chapter of either
   * chain puts your name on something — a fleet roll or a slate — and the
   * other chain closes for good. Not a difficulty gate and not a morality
   * meter: the two powers simply stop being able to use somebody the other
   * one has. The warning is given when chapter two is handed over, in
   * words, because a point of no return the player did not see coming is a
   * bug rather than a decision. */
  var POINT_OF_NO_RETURN = 2;        // chapter index, zero-based
  var POWER_STANDING_WIN = 8;        // per chapter, on top of the ordinary gain

  var POWER_ARCS = {

    /* ===================================================================
     * THE SURVEYOR'S CHAIN (2026-11-11). The third power chain, and the
     * only one that is not a side.
     *
     * Astra chose this: the Guild "locks nothing" - it is a trade body,
     * not a faction. It buys surveys from everybody at every desk, it
     * holds no space, and it does not care whose roll your name is on. So
     * it sets no allegiance and is barred by none: you can run it beside
     * the navy's chain or the Syndicate's, and the chapter-three fork
     * that shuts those two does not exist here.
     *
     * WHAT IT IS ABOUT. The other two chains are about a leak. This one
     * is about the mining ladder the game already has - survey, claim,
     * extract, found, supply - run end to end by somebody who is being
     * watched while they do it, and then asked for one thing more than
     * the ladder covers. Every chapter is a rung you could already
     * climb; what the chain adds is a reason and a witness.
     *
     *   survey   - read a world properly, not for ore but for the file
     *   prospect - and then prove the file by bringing the rock back
     *   found    - put a port where your own numbers say it should go
     *   supply   - and keep it alive, which is the part nobody films
     *   dark     - and now map the one somebody else is standing on
     *
     * THE GATE IS SURVEY STANDING, which did not exist until today: the
     * Guild now keeps a ledger, one point per fifteen thousand credits
     * of data (Survey.guildCredit). You cannot talk your way into this
     * chain, and you cannot shoot your way in. You have to have done the
     * work. */
    guild: {
      id: 'the-long-read', power: 'guild', key: 'guild', neutral: true,
      name: 'The Long Read', gate: 20,
      hook: 'A Guild assayer has been reading your files and would like a word',
      reward: { id: 'shieldsurvey', credits: 40000, standing: 25 },
      rewardText: 'A shielded deep array, Guild issue, in a housing that does not answer a coil. ' +
                  'Grade four: a third more ground per pass than anything sold, and quiet while it works.',
      steps: [
        { type: 'gsurvey', payMul: 1.2,
          title: 'A Proper Reading',
          text: 'Everyone sells the Guild scraps. The assayer wants one world read the ' +
                'whole way round - not the half you could be bothered with on the way ' +
                'past. Map it, and bring the file in yourself.' },
        { type: 'gprospect', payMul: 1.5,
          title: 'The Rock Itself',
          text: 'A file is a claim about a world. The Guild has been burned by files. ' +
                'Hold the ground, put a pod on it, and bring back what it actually ' +
                'brings up - bought tonnage will not do, and they will know.' },
        { type: 'gfound', payMul: 1.9,
          title: 'Where You Said It Should Be',
          text: 'Now put something there. Anywhere in this system, orbital or on the ' +
                'ground - the Guild is not choosing the spot, that is the entire test. ' +
                'They want to see whether a surveyor backs their own numbers with money.' },
        { type: 'gsupply', payMul: 2.2,
          title: 'The Part Nobody Films',
          text: 'Founding one is a photograph. Keeping it is a job. Run it the cargo ' +
                'it cannot make for itself and do it before the crews start asking ' +
                'whether anybody meant this.' },
        { type: 'gdark', payMul: 2.8,
          title: 'Somebody Else\'s Ground',
          text: 'Last thing, and it is not a Guild thing. There is an installation ' +
                'nobody lists, sitting on ground the Guild has never been allowed to ' +
                'read. Read it. They are not asking what the installation is - they ' +
                'are asking what is underneath it, and they would like that on file ' +
                'before anyone else thinks to want it.' }
      ]
    },


    /* ===================================================================
     * THE SEQUELS, AND WHAT THEY ARE FOR (Astra, 2026-10-19): the quiet
     * jammer is "hard to come by, probably at the end of [its] own quest
     * line - if you want to do a sabotage mission, you got to be able to
     * get in and out without being detected or identified." Either path:
     * the navy's intelligence people or the Syndicate, whichever side you
     * signed for in the first chain, and only once that chain is done.
     *
     * Four kinds of chapter, all four of which she picked:
     *   infiltrate - into a hostile system and docked without being
     *                searched; a search blows the run;
     *   recover    - the hardware itself, from where it was lost;
     *   contact    - somebody who knows too much: deliver them, or let
     *                them run. Two contracts, the first one settled wins;
     *   sabotage   - hole a station with a rock torpedo. Done silent, the
     *                strike carries no name.
     * The reward is the shroud suite (Combat, silent running). */
    navy2: {
      id: 'grey-ledger', power: 'navy', key: 'navy2', sequel: true, name: 'The Grey Ledger',
      gate: 40,
      hook: 'Fleet intelligence has a use for somebody already on the roll',
      reward: { id: 'shroud', credits: 36000, standing: 30 },
      rewardText: 'The shroud suite, fitted in a closed bay and never written down. ' +
                  'SHIFT+X runs silent: no transponder, no ID, and the heat builds until you stop.',
      steps: [
        { type: 'infiltrate', payMul: 1.6, target: 'syndicate',
          title: 'Lights Out',
          text: 'Into Syndicate space and docked, without being searched. If anyone ' +
                'looks in your hold, the run is over and the ledger closes on you.' },
        { type: 'recover', payMul: 1.9,
          title: 'Salvage Rights',
          text: 'A fleet courier went dark eleven months ago carrying a prototype. ' +
                'The wreck is where the last log put it. Bring back what is left of the suite.' },
        { type: 'contact', payMul: 2.2,
          title: 'The Quiet Man, Again',
          text: 'The man the Syndicate moved knows what the suite is. Deliver him and ' +
                'his case to the fleet - or put him somewhere nobody will look, and say you lost him.' },
        { type: 'sabotage', payMul: 2.6, target: 'syndicate',
          title: 'A Hole in the Ledger',
          text: 'A Syndicate port is keeping the arrangement\'s books. A rock torpedo ' +
                'closes it for a season. Do it unseen and nobody knows whose war this is. ' +
                'The Guild sells the torpedoes; the fleet does not.' },
        { type: 'infiltrate', payMul: 3.0, target: 'syndicate',
          title: 'Home Unseen',
          text: 'The suite\'s test logs come out the way you went in: unscanned.' }
      ]
    },
    syndicate2: {
      id: 'blackout', power: 'syndicate', key: 'syndicate2', sequel: true, name: 'Blackout',
      gate: 30,
      hook: 'The arrangement wants somebody who can go where the navy is looking',
      reward: { id: 'shroud', credits: 40000, standing: 25 },
      rewardText: 'The shroud suite - the navy\'s own prototype, and now yours. ' +
                  'SHIFT+X runs silent: no transponder, no ID, and the heat builds until you stop.',
      steps: [
        { type: 'infiltrate', payMul: 1.6, target: 'lawful',
          title: 'Under the Lamp',
          text: 'Into a system the law watches and docked, without being searched. ' +
                'A search means the run is blown and so, for a while, are you.' },
        { type: 'recover', payMul: 1.9,
          title: 'Somebody Else\'s Prototype',
          text: 'The navy lost a courier and a prototype eleven months ago. The ' +
                'arrangement knows where. Get there before the fleet does.' },
        { type: 'contact', payMul: 2.2,
          title: 'The Quartermaster',
          text: 'The quartermaster who started all of this will talk to anybody now. ' +
                'The arrangement wants him delivered. You could also tell him to run.' },
        { type: 'sabotage', payMul: 2.6, target: 'lawful',
          title: 'Lights Out at the Yard',
          text: 'A lawful port that has been asking questions. A rock torpedo closes it ' +
                'for a season. Do it unseen and the questions have nobody to land on. ' +
                'The Syndicate sells the charges.' },
        { type: 'infiltrate', payMul: 3.0, target: 'lawful',
          title: 'Back Through the Door',
          text: 'Out through the same door you came in by. Nobody looks in your hold.' }
      ]
    },
    navy: {
      id: 'powder-chain', power: 'navy', key: 'navy', name: 'The Powder Chain',
      /* Not a high bar. The navy's problem in this story is that it needs
       * somebody who is not already inside it. */
      gate: 15,
      hook: 'A quartermaster has been watching your manifests',
      reward: { id: 'transponder', credits: 24000, standing: 30 },
      rewardText: 'A restricted-space transponder, issued rather than sold — ' +
                  'the navy does not sell these, and now it does not have to.',
      steps: [
        { type: 'haul', payMul: 1.0,
          title: 'Manifest and Muster',
          text: 'Ordinary freight on an ordinary schedule. Nobody is testing ' +
                'your flying — they are testing whether the tonnage you land ' +
                'is the tonnage you lifted.' },
        { type: 'courier', payMul: 1.4,
          title: 'The Quiet Berth',
          text: 'A sealed case to the next system, hand to hand, no copy in ' +
                'the log. The quartermaster mentions, not quite in passing, ' +
                'that a licensed plant has been returning less than it takes ' +
                'in for eleven months.' },
        { type: 'haul', payMul: 1.9, licensed: true,
          title: 'Books and Bodies',
          text: 'Naval materiel, in your hold, under your name. Signing for ' +
                'it puts you on a fleet roll — and a roll is a list other ' +
                'people can read.' },
        { type: 'disposal', payMul: 2.2,
          title: 'The Skimmer',
          text: 'The shortfall was not an accounting error. Somebody has been ' +
                'pressing slugs off the books and selling them to people who ' +
                'do not ask for paperwork. You are moving what is left of the ' +
                'evidence before it is tidied away.' },
        { type: 'courier', payMul: 2.8,
          title: 'Powder and Paper',
          text: 'Carry the case to a yard that builds warships and will not ' +
                'be embarrassed by what is in it. After this you can go where ' +
                'the navy goes.' }
      ]
    },
    syndicate: {
      id: 'long-arrangement', power: 'syndicate', key: 'syndicate', name: 'The Long Arrangement',
      gate: 10,
      hook: 'Somebody wants a favour done and will not say by whom',
      reward: { id: 'forgedtransponder', credits: 30000, standing: 25 },
      rewardText: 'A transponder that answers the challenge. It is not yours ' +
                  'and it was not issued, which is the whole of what is wrong ' +
                  'with it.',
      steps: [
        { type: 'haul', payMul: 1.1,
          title: 'A Favour, Not a Job',
          text: 'Carry this, do not open it, do not ask. It pays like freight ' +
                'and it is not freight, and everybody involved knows both ' +
                'halves of that sentence.' },
        { type: 'smuggle', payMul: 1.5,
          title: 'Weight and Measure',
          text: 'Now you know what the favour was. The arrangement has been ' +
                'running for eleven months and the only new thing in it is ' +
                'you.' },
        { type: 'smuggle', payMul: 2.0, hot: true,
          title: 'The Name on the Slate',
          text: 'A consignment the navy is already looking for. Taking it ' +
                'writes your name on a slate that does not get wiped — and ' +
                'the people who keep that slate look after their own.' },
        { type: 'haul', payMul: 2.3,
          title: 'The Quiet Man',
          text: 'Somebody inside has been talking to a quartermaster. You are ' +
                'not being asked to do anything to him. You are being asked ' +
                'to move him, quickly, and not to look at the manifest.' },
        { type: 'courier', payMul: 2.9,
          title: 'A Door That Opens',
          text: 'One run to a system nobody is supposed to be able to reach, ' +
                'and the arrangement makes you a way in.' }
      ]
    }
  };

  /* Which power's chain, if any, this dock can offer. The navy's is the
   * fleet's own board — a carrier, which is the one place in the game that
   * already refuses to be an ordinary port. The Syndicate's is anywhere
   * their own flag flies or anywhere corrupt enough that the difference
   * has stopped mattering. */
  function powerAt(G, port, sys) {
    var C = global.Combat;
    if (C && C.fleetPort && C.fleetPort(port)) return 'navy';
    if (port && port.faction === 'outlaw') return 'syndicate';
    if (C && C.systemCorruption && sys) {
      if (C.systemCorruption(G, sys) >= 62) return 'syndicate';
    }
    /* AND OTHERWISE THE GUILD, which is at every desk because it buys
     * from every desk. It is the fallback rather than a competitor: a
     * fleet carrier is the navy's dock and a corrupt system is the
     * Syndicate's, and the Guild is simply everywhere those are not. */
    if (port && port.market) return 'guild';
    return null;
  }

  /* WHOSE GOOD BOOKS, and it has to be asked of the PORT rather than of the
   * word "navy". There is no navy faction in this galaxy — there are twelve
   * powers, each with its own fleet and its own ledger, and a carrier
   * belongs to one of them. Reading a literal 'navy' standing found zero
   * every time and the chain never offered itself once, which is the kind
   * of bug that looks like a design decision from the outside. */
  function powerStanding(G, power, port) {
    var M = global.Missions;
    if (!M) return 0;
    return M.standing(G, powerFaction(power, port));
  }

  /* The faction a chapter is booked against — the navy's chain pays and
   * costs standing with the local flag, the Syndicate's with the outlaws,
   * because those are the two ledgers the rest of the game already keeps. */
  function powerFaction(power, port) {
    /* The Guild keeps its own books and no flag's. That is the whole
     * difference between a trade body and a side. */
    if (power === 'guild') return 'guild';
    return power === 'syndicate' ? 'outlaw' : (port && port.faction) || 'navy';
  }

  /* Has the player already shut this door by walking through the other
   * one? `allegiance` is set exactly once, when a third chapter is taken,
   * and nothing clears it. */
  function powerBarred(G, power) {
    /* Astra, 2026-11-11: the Guild "locks nothing". It will work with a
     * fleet pilot and it will work with somebody on a slate, because it
     * is buying numbers rather than loyalty - so an allegiance neither
     * opens nor shuts this door. */
    if (power === 'guild') return false;
    return !!(G && G.allegiance && G.allegiance !== power);
  }

  function powerBoardAt(G, port, sys, galaxy, here, t) {
    var power = powerAt(G, port, sys);
    if (!power) return [];
    var arc = POWER_ARCS[power];
    G.powers = G.powers || {};
    /* The first chain done, the second is what this dock offers. */
    if (G.powers[power] && G.powers[power].status === 'completed' && POWER_ARCS[power + '2']) arc = POWER_ARCS[power + '2'];
    if (!arc || powerBarred(G, power)) return [];
    if (powerStanding(G, power, port) < arc.gate) return [];

    var progress = G.powers[arc.key || power];
    if (progress && (progress.status === 'active' || progress.status === 'completed')) return [];
    if (progress && progress.cooldownUntil && t < progress.cooldownUntil) return [];

    var win = windowIndex(t);
    var rng = new RNG('power|' + arc.id + '|' + port.id + '|' + win);
    var step = arc.steps[0];
    var offer = castStep(step.type, port, sys, galaxy, here, rng, t, { target: step.target, G: G });
    if (!offer) offer = castStep('haul', port, sys, galaxy, here, rng, t);
    if (!offer) return [];

    return [dress(powerEntry(arc, 0, offer, port, t), port, sys, here, offer.toStar)];
  }

  function powerEntry(arc, idx, offer, port, t) {
    var step = arc.steps[idx];
    return {
      id: 'pw|' + arc.id + '|' + idx + '|' + windowIndex(t),
      type: offer.type, cid: offer.cid, tonnes: offer.tonnes,
      fromName: offer.fromName, toPortId: offer.toPortId || null,
      toStarId: offer.toStarId || null, toName: offer.toName,
      faction: powerFaction(arc.power, port),
      pay: Math.round(basePay(offer) * step.payMul),
      deadline: deadlineFor(offer, t),
      text: arc.name + ' — ' + step.title + ': ' + offer.text,
      desc: step.text,
      campaign: true, power: arc.power, powerKey: arc.key || arc.power, arcId: arc.id, factionId: powerFaction(arc.power, port),
      step: idx, infiltrate: !!offer.infiltrate,
      /* THE SURVEYOR'S CHAPTERS are settled on coverage, on provenance or
       * on a port existing, not on a hold (fieldwork.js). The fields
       * those settlements read have to survive the cast. */
      surveyKey: offer.surveyKey || null, claimKey: offer.claimKey || null,
      bodyId: offer.bodyId || null, bodyName: offer.bodyName || null,
      covFrom: offer.covFrom, covWant: offer.covWant, dark: !!offer.dark,
      supply: !!offer.supply,
      starId: offer.starId || null
    };
  }

  /* The chain's own completion path. Same shape as onStepComplete above and
   * deliberately a separate function: the generic one casts its next
   * chapter from a template the seed chose, and this one is reading a
   * script. */
  function onPowerStepComplete(G, m, port, sys, t, hooks) {
    var arc = null;
    for (var k in POWER_ARCS) if (POWER_ARCS[k].id === m.arcId) arc = POWER_ARCS[k];
    if (!arc) return;
    var pkey = arc.key || arc.power;
    var progress = (G.powers = G.powers || {})[pkey] ||
                   (G.powers[pkey] = { arcId: arc.id, step: m.step, status: 'active' });
    /* THE CONTACT, settled: whichever of the two contracts landed first
     * is the choice; the other one is void (Missions drops it). Letting
     * him run costs you with the people who wanted him. */
    if (m.choiceGroup) {
      (G.missions || []).forEach(function (o) { if (o !== m && o.choiceGroup === m.choiceGroup) o.choiceVoid = true; });
      progress.contact = m.choice;
      if (m.choice === 'run' && global.Missions) {
        global.Missions.bumpStanding(G, powerFaction(arc.power, port), -12);
        if (hooks && hooks.say) hooks.say('He is gone, and you say you lost him. Nobody believes you; nobody can prove otherwise.', 7);
      }
    }

    if (global.Missions) {
      global.Missions.bumpStanding(G, powerFaction(arc.power, port), POWER_STANDING_WIN);
    }

    var nextIdx = m.step + 1;
    if (nextIdx >= arc.steps.length) {
      progress.status = 'completed';
      progress.step = m.step;
      G.ship.credits += arc.reward.credits;
      if (global.Missions) {
        global.Missions.bumpStanding(G, powerFaction(arc.power, port), arc.reward.standing);
      }
      grantReward(G, arc, hooks);
      if (hooks && hooks.sound) hooks.sound('pay');
      return;
    }

    /* THE POINT OF NO RETURN, and it is the ACT of taking the chapter
     * rather than delivering it — you are choosing when you sign, not when
     * you arrive. Nothing clears it afterwards. */
    if (nextIdx === POINT_OF_NO_RETURN && !G.allegiance && !arc.sequel && !arc.neutral) {
      G.allegiance = arc.power;
      var other = arc.power === 'navy' ? POWER_ARCS.syndicate : POWER_ARCS.navy;
      G.powers[other.power] = { arcId: other.id, step: 0, status: 'barred' };
      if (hooks && hooks.say) {
        hooks.say(arc.power === 'navy'
          ? 'You are on a fleet roll now. The other arrangement is closed to you.'
          : 'Your name is on the slate. The navy will not be asking again.', 8);
      }
      if (hooks && hooks.sound) hooks.sound('warn');
    }

    var win = windowIndex(t);
    var rng = new RNG('power|' + arc.id + '|' + nextIdx + '|' + win + '|' + port.id);
    var nstep = arc.steps[nextIdx];
    if (nstep.type === 'contact') return castContact(G, arc, nextIdx, port, sys, t, rng, progress, hooks);
    var offer = castStep(nstep.type, port, sys, G.galaxy, G.here, rng, t, { target: nstep.target, G: G });
    /* AN AUTHORED CHAIN MUST NOT STALL. The generic arcs above can afford
     * to — they are a shape, and a shape that cannot be cast here can be
     * picked up at the next port of the same flag. A story cannot: it
     * stops at chapter three and the player is left holding a plot.
     *
     * Measured, which is why this is here at all: running the navy chain
     * end to end in kawartha died at 'The Skimmer' because the carrier's
     * system had no reprocessing plant to cast a disposal against. So the
     * flavour degrades and the chapter still happens — the words are the
     * story, and the cargo is only ever what the words are carried in. */
    if (!offer) offer = castStep('haul', port, sys, G.galaxy, G.here, rng, t);
    if (!offer) { progress.status = 'stalled'; return; }

    var Sim = global.Sim;
    var free = Sim ? G.ship.cargoCap - Sim.cargoMass(G.ship) : offer.tonnes;
    if (Sim && offer.cid && free >= offer.tonnes) {
      G.ship.cargo[offer.cid] = (G.ship.cargo[offer.cid] || 0) + offer.tonnes;
      Sim.refreshShip(G.ship);
    }
    var entry = dress(powerEntry(arc, nextIdx, offer, port, t), port, sys, G.here, offer.toStar);
    (G.missions = G.missions || []).push(entry);
    if (global.Fieldwork && global.Fieldwork.onAccept) global.Fieldwork.onAccept(G, entry);
    progress.step = nextIdx;
    progress.status = 'active';

    if (hooks && hooks.say) {
      /* THE WARNING, one chapter early. A point of no return the player did
       * not see coming is a bug rather than a decision. */
      if (nextIdx === POINT_OF_NO_RETURN - 1 && !arc.neutral && !arc.sequel) {
        hooks.say(arc.steps[nextIdx].title + ' — and the one after it decides ' +
                  'which side of this you are on.', 8);
      } else {
        hooks.say(arc.name + ' — ' + arc.steps[nextIdx].title, 6);
      }
    }
    if (hooks && hooks.sound) hooks.sound('click');
  }

  /* THE CONTACT: two contracts for one chapter. Deliver him to the people
   * who want him (full pay), or drop him somewhere nobody will look (less,
   * and it costs standing). One parcel - his case - and whichever contract
   * settles first decides. */
  function castContact(G, arc, idx, port, sys, t, rng, progress, hooks) {
    var a = castStep('courier', port, sys, G.galaxy, G.here, rng, t);
    var b = castStep('courier', port, sys, G.galaxy, G.here, rng, t);
    for (var tries = 0; a && b && b.toStarId === a.toStarId && tries < 6; tries++) b = castStep('courier', port, sys, G.galaxy, G.here, rng, t);
    if (!a) a = castStep('haul', port, sys, G.galaxy, G.here, rng, t);
    if (!a) { progress.status = 'stalled'; return; }
    var group = arc.key + '|contact|' + windowIndex(t);
    var ea = dress(powerEntry(arc, idx, a, port, t), port, sys, G.here, a.toStar);
    ea.id += '|deliver'; ea.choiceGroup = group; ea.choice = 'deliver';
    ea.text = arc.name + ' - ' + arc.steps[idx].title + ': deliver him to ' + a.toName;
    var list = (G.missions = G.missions || []);
    list.push(ea);
    if (b && b.toStarId !== a.toStarId) {
      var eb = dress(powerEntry(arc, idx, b, port, t), port, sys, G.here, b.toStar);
      eb.id += '|run'; eb.choiceGroup = group; eb.choice = 'run';
      eb.pay = Math.round(eb.pay * 0.4);
      eb.text = arc.name + ' - ' + arc.steps[idx].title + ': OR let him run - drop him in ' + b.toName;
      list.push(eb);
    }
    var Sim = global.Sim;
    var free = Sim ? G.ship.cargoCap - Sim.cargoMass(G.ship) : 1;
    if (Sim && a.cid && free >= a.tonnes) { G.ship.cargo[a.cid] = (G.ship.cargo[a.cid] || 0) + a.tonnes; Sim.refreshShip(G.ship); }
    progress.step = idx; progress.status = 'active';
    if (hooks && hooks.say) hooks.say(arc.name + ' - ' + arc.steps[idx].title + '. Two contracts on your board: deliver him, or let him run. The first one you settle is your answer.', 9);
    if (hooks && hooks.sound) hooks.sound('click');
  }

  /* The chain's real reward is a FITTING rather than a number, which is the
   * point of running it: standing can be earned by anybody with a hold and
   * a decade, and this cannot be bought at all. If there is no internal
   * slot free it is held for you rather than lost — a reward that
   * evaporates because your ship was full is a reward nobody trusts. */
  function grantReward(G, arc, hooks) {
    var C = global.Combat;
    var id = arc.reward.id;
    var done = false;
    if (C && C.canFit) {
      var slot = C.canFit(G.ship, id);
      if (slot && slot.ok) {
        G.ship.fit[slot.key] = id;
        if (C.syncLegacy) C.syncLegacy(G.ship);
        done = true;
      }
    }
    if (!done) {
      G.owed = G.owed || [];
      if (G.owed.indexOf(id) < 0) G.owed.push(id);
    }
    if (hooks && hooks.say) {
      hooks.say(arc.name + ' ends. ' + arc.rewardText +
                (done ? '' : ' It is waiting for you at the yard — no slot free.'), 9);
    }
  }

  /* AND THE COUNTER IT IS HELD AT. `G.owed` was written by grantReward and
   * read by nobody: a player who finished a five-chapter campaign with a
   * full ship was told the fitting was "waiting for you at the yard" and
   * then could never collect it, which is worse than losing it outright —
   * the game had promised. This is the collection. It lives here rather
   * than in combat.js because the debt is the arc's, not the ship's.
   *
   * Nothing expires and nothing is consumed on a failed attempt: sell the
   * shield generator, come back, and it is still on the shelf. */
  function owedAt(G) {
    return ((G && G.owed) || []).slice();
  }

  function claimOwed(G, id) {
    var C = global.Combat;
    var list = (G && G.owed) || [];
    var i = list.indexOf(id);
    if (i < 0) return { ok: false, why: 'nothing of that name is held for you' };
    if (!C || !C.canFit) return { ok: false, why: 'no fitter on duty' };
    var slot = C.canFit(G.ship, id);
    if (!slot || !slot.ok) return { ok: false, why: (slot && slot.why) || 'no slot free' };
    G.ship.fit[slot.key] = id;
    if (C.syncLegacy) C.syncLegacy(G.ship);
    list.splice(i, 1);
    return { ok: true, slot: slot.key };
  }

  var Arcs = {
    POWER_ARCS: POWER_ARCS,
    owedAt: owedAt,
    claimOwed: claimOwed,
    POINT_OF_NO_RETURN: POINT_OF_NO_RETURN,
    powerBoardAt: powerBoardAt,
    powerAt: powerAt,
    powerBarred: powerBarred,
    onPowerStepComplete: onPowerStepComplete,
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
