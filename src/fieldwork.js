/* fieldwork.js - work for a ship with instruments, and for a ship with
 * nothing but hours (2026-11-10).
 *
 * Astra: "I also want there to be a larger variety of missions that are
 * available to the player at a lower notoriety ... survey and prospecting,
 * scouting and sweeps, salvage and recovery, local short-hops. Short hop
 * missions need to pay at least twice as much or they aren't worth the time
 * it takes to do them."
 *
 * WHY THIS IS NOT IN missions.js. Two reasons, and the second is the real
 * one:
 *
 *   1. missions.js is fifteen hundred lines of freight, and this is not
 *      freight. Nothing here is settled by taking tonnes out of a hold.
 *
 *   2. THE BOARD IS DEALT PER PORT AND WINDOW, NOT PER CAREER. That is a
 *      deliberate property - a board a player reads and comes back to -
 *      and it is also why missions.js has, three times over, had to write
 *      down that "what you are cleared for is not in scope here". These
 *      offers DO depend on the career: on what is bolted to the hull and
 *      what you have already mapped. Rather than make the whole board
 *      career-dependent and re-deal every port in every seed, each pass
 *      here runs LAST, in its OWN stream, and adds rows. An existing board
 *      is byte-identical with this file loaded and no instruments fitted.
 *
 * So: boardAt still owns the freight and still deals it the same way, and
 * this file appends the work that needs an instrument - plus the one kind
 * of work that needs nothing at all and was simply missing.
 *
 * WHAT IS HERE
 *   - capsOf(G): the capability ledger. What this career can actually do,
 *     read once per board rather than guessed at per branch.
 *   - shortHops: in-system runs priced by the CLOCK, not the tonne. The
 *     old board paid 250 cr plus 28-55 a tonne for any haul, which for a
 *     four-tonne hop to the next moon is a fee you would decline on
 *     principle. These pay for the hours.
 *   - surveyWork: map a world to a stated coverage and bring the data
 *     back. Needs a survey scanner.
 *   - sweepWork: run the coil where they tell you and say what answered.
 *     Needs a magnetometer. A confirmed NOTHING is also an answer, and is
 *     also paid - less, because it is worth less, but paid, because a
 *     survey that only pays on a hit is an invitation to lie.
 *
 * All three are open at zero standing. That is the point of them.
 */
(function (global) {
  'use strict';

  var RNG = global.RNG;

  var WINDOW = 2 * 86400;                  // must match missions.js
  function windowIndex(t) { return Math.floor(t / WINDOW); }

  /* ---- the capability ledger ---------------------------------------------
   * One pass over the career, so a board pass can ask "can she survey?"
   * without each one reaching into Combat, Survey and Claims for itself.
   * Everything here is a primitive or a count: nothing live, nothing that
   * could be written into a signed contract or a save. */

  function capsOf(G) {
    var caps = {
      survey: 0,          // instrument grade, 0-3
      mag: 0,             // magnetometer grade, 0 or up
      hold: 0,            // free tonnes
      pods: 0,            // mining pods aboard
      worlds: 0,          // worlds this career has mapped at all
      mapped: {},         // key -> coverage, for the ones it has
      claims: 0,          // ground held
      founded: 0,         // ports founded
      found: 0,           // classified installations found
      notoriety: 0
    };
    if (!G || !G.ship) return caps;
    var C = global.Combat, Sv = global.Survey;
    caps.survey = C && C.surveyLevel ? C.surveyLevel(G.ship) : 0;
    caps.mag = C && C.magLevel ? C.magLevel(G.ship) : 0;
    var Sim = global.Sim;
    caps.hold = Math.max(0, (G.ship.cargoCap || 0) -
                            (Sim && Sim.cargoMass ? Sim.cargoMass(G.ship) : cargoTonnes(G.ship)));
    caps.pods = podsAboard(G.ship);
    caps.notoriety = G.notoriety || 0;

    var surveys = G.surveys || {};
    for (var k in surveys) {
      if (!Object.prototype.hasOwnProperty.call(surveys, k)) continue;
      var rec = surveys[k];
      if (!rec) continue;
      var cov = Sv && Sv.covClass ? Sv.covClass(rec, 1) : (rec.cov || 0);
      if (cov > 0.02) { caps.worlds++; caps.mapped[rec.key || k] = cov; }
    }
    caps.claims = countOf(G.claims);
    caps.founded = countOf(G.stations) + countOf(G.foundedPorts);
    caps.found = countOf(G.found);
    return caps;
  }

  function cargoTonnes(ship) {
    var n = 0, c = ship.cargo || {};
    for (var k in c) if (Object.prototype.hasOwnProperty.call(c, k)) n += c[k] || 0;
    return n;
  }

  function podsAboard(ship) {
    /* A pod is carried as cargo under whatever the claims code calls it;
     * if that commodity does not exist in this build, nobody has one. */
    var c = ship.cargo || {};
    return (c.pod || 0) + (c.drone || 0) + (c.miningpod || 0);
  }

  function countOf(o) {
    if (!o) return 0;
    if (Array.isArray(o)) return o.length;
    var n = 0;
    for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) n++;
    return n;
  }

  /* ---- short hops --------------------------------------------------------
   * THE CLOCK, NOT THE TONNE. A hop to the next moon takes you most of a
   * day whether you are carrying four tonnes or forty, and the old board
   * priced it on the four. So: estimate the round trip, pay for the hours,
   * and then pay DOUBLE, because Astra is right that otherwise it is not
   * worth doing - and because the alternative use of those hours is a
   * market run you chose not to make.
   *
   * The multiplier is on the HOUR rate rather than bolted on at the end,
   * so a hop that is genuinely quick stays a small fee and a hop across a
   * system you misjudged still pays for the day it ate. */

  var HOP_CR_PER_HOUR = 210;        // what an hour of a small hull's time is worth
  var HOP_DOUBLE = 2.2;             // Astra's "at least twice as much"
  var HOP_FLOOR = 900;              // nobody gets out of bed for less
  var HOP_DEADLINE = 86400;         // one day. It is a local run.
  var HOP_SPEED_KM_S = 420;         // a loaded small hull, cruising, as a planner

  var HOP_WHAT = [
    { cid: 'medicine', what: 'a cold crate of medicine', why: 'and it is cold for a reason' },
    { cid: 'parts', what: 'a pallet of spares', why: 'something on the other end is stopped without them' },
    { cid: 'electronics', what: 'a sealed instrument case', why: 'it is calibrated and they would like it to stay that way' },
    { cid: 'food', what: 'fresh stores', why: 'nobody wants them a week from now' },
    { cid: 'parts', what: 'a replacement coupling', why: 'the yard cut the wrong one twice' }
  ];

  function legHours(a, b) {
    if (!a || !b || !a.pos || !b.pos) return 6;
    var V = global.V;
    var d = V ? V.len(V.sub(a.pos, b.pos)) : 0;         // km
    if (!(d > 0)) return 3;
    /* Accelerate, coast, decelerate, dock: the planner that the fee is
     * built on, not the flight model. Both ways, plus the turnaround. */
    return Math.max(2, (d / HOP_SPEED_KM_S) / 3600 * 2 + 2);
  }

  function shortHops(port, sys, t, G, caps, offers, ctxs) {
    var others = (sys.ports || []).filter(function (p) { return p !== port && p.market; });
    if (!others.length) return;
    var win = windowIndex(t);
    var rng = new RNG('hop|' + port.id + '|' + win + '|' + sys.seed);
    var Eco = global.Economy;

    var n = rng.int(1, 2);
    for (var i = 0; i < n; i++) {
      var dst = rng.pick(others);
      var spec = rng.pick(HOP_WHAT);
      /* Only a good this market actually has. A board that hands you
       * freight has to be handing you something real. */
      var cid = (Eco && Eco.BY_ID && Eco.BY_ID[spec.cid] && port.market.rows[spec.cid])
              ? spec.cid : firstStocked(port, Eco);
      if (!cid) continue;
      var tonnes = rng.int(2, 6);
      var hours = legHours(port, dst);
      var pay = Math.max(HOP_FLOOR,
                         Math.round(hours * HOP_CR_PER_HOUR * HOP_DOUBLE * rng.range(0.9, 1.25)));
      offers.push({
        id: 'hop|' + port.id + '|' + win + '|' + i,
        type: 'haul', hop: true, cid: cid, tonnes: tonnes,
        from: port.id, fromName: port.name,
        toPortId: dst.id, toName: dst.name,
        faction: port.faction || null,
        pay: pay,
        /* A day, not three. It is a short run and the fee says so. */
        deadline: t - (t % WINDOW) + HOP_DEADLINE,
        hours: Math.round(hours),
        core: tonnes + 't to ' + dst.name + ' by tomorrow',
        head: cap(spec.what) + ', ' + tonnes + ' t, over to ' + dst.name + ' by tomorrow',
        text: cap(spec.what) +
              ', ' + tonnes + ' t, over to ' + dst.name + ' - ' + spec.why +
              '. About ' + Math.round(hours) + ' hours there and back. ' +
              pay + ' cr, and they know what they are paying for.'
      });
      ctxs.push({ fromPort: port, toPort: dst, sys: sys });
    }
  }

  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function poss(name) {
    return name + (/s$/i.test(name) ? "'" : "'s");
  }

  function firstStocked(port, Eco) {
    var rows = port.market && port.market.rows;
    if (!rows || !Eco || !Eco.BY_ID) return null;
    for (var cid in rows) {
      if (!Object.prototype.hasOwnProperty.call(rows, cid)) continue;
      var it = Eco.BY_ID[cid];
      if (!it || it.contraband || it.milfuel) continue;
      if (cid === 'waste' || cid === Eco.FUEL_ID) continue;
      if (rows[cid].exporter) return cid;
    }
    return null;
  }

  /* ---- survey contracts --------------------------------------------------
   * Somebody wants a world read, and they want the reading rather than the
   * ore. The objective is coverage on a named body, measured against where
   * your own survey stood when you signed - so a world you had already
   * mapped is not a contract you can complete by docking, and a world you
   * are halfway through is credit you keep.
   *
   * Paid per point of NEW coverage against a target, which means a sloppy
   * sweep that hits the target pays the target and a thorough one does not
   * pay double. The data is still yours afterwards and still sells
   * (Survey.sell): what the client bought is a copy. */

  var SURVEY_DEADLINE = 12 * 86400;
  var SURVEY_CR_PER_POINT = 95;         // per percent of the world
  var SURVEY_FLOOR = 2600;

  var SURVEY_WHY = [
    'A consortium is deciding whether this rock is worth a claim and will not pay for an opinion.',
    'The registrar wants the ground on file before anybody else files on it.',
    'An underwriter will not quote on a world nobody has read.',
    'Somebody filed a claim here last year and the office would like to know what on.',
    'There is an argument about this world in a boardroom and they want it settled with numbers.'
  ];

  function surveyWork(port, sys, t, G, caps, offers, ctxs) {
    if (!caps.survey) return;                 // no instrument, no contract
    var Sv = global.Survey;
    if (!Sv) return;
    var win = windowIndex(t);
    var rng = new RNG('surveywork|' + port.id + '|' + win + '|' + sys.seed);

    /* A world worth reading is one whose type has deposits in the table.
     * That is the same test the survey itself uses to decide there is
     * anything under the instrument. */
    var worlds = (sys.bodies || []).filter(function (b) {
      return (b.kind === 'planet' || b.kind === 'moon') && Sv.TABLE && Sv.TABLE[b.type];
    });
    if (!worlds.length) return;

    var body = rng.pick(worlds);
    var key = ((G && G.here && G.here.id) || sys.seed) + ':' + body.id;
    var have = caps.mapped[key] || 0;
    /* Ask for ground you have NOT got. A contract you have already
     * completed is not an offer, it is a bug with a fee attached. */
    var want = Math.min(0.9, have + rng.range(0.28, 0.55));
    if (want - have < 0.15) return;

    var points = Math.round((want - have) * 100);
    offers.push({
      id: 'sv|' + port.id + '|' + win + '|0',
      type: 'survey', cid: null, tonnes: 0,
      from: port.id, fromName: port.name,
      toPortId: port.id, toName: port.name,
      faction: port.faction || null,
      surveyKey: key, bodyId: body.id, bodyName: body.name,
      covFrom: round3(have), covWant: round3(want),
      pay: Math.max(SURVEY_FLOOR, Math.round(points * SURVEY_CR_PER_POINT * rng.range(0.9, 1.3))),
      deadline: t - (t % WINDOW) + SURVEY_DEADLINE,
      core: 'survey ' + Math.round(want * 100) + '% of ' + body.name,
      head: 'Map ' + Math.round(want * 100) + ' per cent of ' + body.name,
      text: rng.pick(SURVEY_WHY) + ' Map ' + Math.round(want * 100) + ' per cent of ' +
            body.name + ' - you have ' + Math.round(have * 100) +
            ' - and bring the file back here. The data stays yours; they want a copy.'
    });
    ctxs.push({ fromPort: port, sys: sys });
  }

  function round3(v) { return Math.round(v * 1000) / 1000; }

  /* ---- sweep contracts ---------------------------------------------------
   * The coil, pointed where somebody else wants it pointed. A sweep
   * contract is scouting work: run the magnetometer out past the last
   * charted body and report what answered.
   *
   * A CONFIRMED NOTHING IS PAID. Less than a contact, but paid - because a
   * contract that only pays on a find pays you to invent one, and because
   * "we swept it and there is nothing there" is the answer a shipping line
   * actually needed. */

  var SWEEP_DEADLINE = 8 * 86400;
  var SWEEP_PAY = [3200, 7400];
  var SWEEP_NOTHING = 0.45;              // of the fee, for a clean sweep

  var SWEEP_WHY = [
    'A hull went quiet out there and the owners would like to know what it was near.',
    'Two charts disagree about this system and the office is tired of it.',
    'An insurer wants the outer system read before it writes the route.',
    'Somebody is paying freight rates through here that do not add up.',
    'The last survey of the outer system predates the war and reads like fiction.'
  ];

  function sweepWork(port, sys, t, G, caps, offers, ctxs) {
    if (!caps.mag) return;
    var win = windowIndex(t);
    var rng = new RNG('sweepwork|' + port.id + '|' + win + '|' + sys.seed);
    if (!rng.chance(0.55)) return;
    offers.push({
      id: 'sw|' + port.id + '|' + win + '|0',
      type: 'sweep', cid: null, tonnes: 0,
      from: port.id, fromName: port.name,
      toPortId: port.id, toName: port.name,
      faction: port.faction || null,
      starId: (G && G.here && G.here.id) || null,
      sweepFrom: 0,                       // filled in at accept()
      pay: Math.round(rng.range(SWEEP_PAY[0], SWEEP_PAY[1])),
      nothingPay: 0,                      // filled in below, kept explicit
      deadline: t - (t % WINDOW) + SWEEP_DEADLINE,
      core: 'coil sweep of the outer system',
      head: 'Run a coil sweep of the outer system',
      text: rng.pick(SWEEP_WHY) + ' Take the coil out past the charted bodies, ' +
            'run it, and bring the trace back. A clean sweep is an answer too and pays ' +
            Math.round(SWEEP_NOTHING * 100) + ' per cent.'
    });
    offers[offers.length - 1].nothingPay =
      Math.round(offers[offers.length - 1].pay * SWEEP_NOTHING);
    ctxs.push({ fromPort: port, sys: sys });
  }

  /* ---- prospecting -------------------------------------------------------
   * The other half of a survey: somebody who does not want the map wants
   * the proof. A prospect contract is for tonnage OFF A NAMED WORLD, which
   * means the ore has to come from ground you hold - and that is a chain
   * the game already has, four steps long and every step already built:
   * map it, file on it, drop a pod, empty the hopper.
   *
   * So the contract is checked on the CLAIM as well as the hold. Buying the
   * same tonnage off the market and docking with it does not satisfy it,
   * because what the client is paying for is the provenance. */

  var PROSPECT_DEADLINE = 16 * 86400;
  var PROSPECT_OVER = 2.4;              // of market, because they are buying the proof
  var PROSPECT_FLOOR = 3400;

  var PROSPECT_WHY = [
    'An assayer will not certify a world off a survey file alone - they want the rock.',
    'A refinery is deciding whether to build here and wants a run through its own crucible first.',
    'Somebody is selling this world to investors and needs a sample that is not the seller\'s.',
    'A smelter wants to know what this ore does to its linings before it signs for a decade of it.'
  ];

  function prospectWork(port, sys, t, G, caps, offers, ctxs) {
    if (!caps.survey) return;
    var Sv = global.Survey, Eco = global.Economy;
    if (!Sv || !Sv.deposits || !Eco) return;
    var win = windowIndex(t);
    var rng = new RNG('prospect|' + port.id + '|' + win + '|' + sys.seed);
    if (!rng.chance(0.5)) return;

    /* A world with ore worth hauling, and the ore it actually has. A
     * contract for rare metals on an iceball is a contract nobody can
     * fill, which is worse than no contract. */
    var picks = [];
    (sys.bodies || []).forEach(function (b) {
      if (b.kind !== 'planet' && b.kind !== 'moon') return;
      var rows;
      try { rows = Sv.deposits(b, sys) || []; } catch (e) { rows = []; }
      rows.forEach(function (r) {
        if (r.cid === 'hydrogen' || !(r.grade > 0.18)) return;
        picks.push({ body: b, cid: r.cid, grade: r.grade });
      });
    });
    if (!picks.length) return;
    var p = rng.pick(picks);
    var tonnes = rng.int(8, 22);
    var base = (Eco.BY_ID[p.cid] && Eco.BY_ID[p.cid].base) || 80;
    offers.push({
      id: 'pr|' + port.id + '|' + win + '|0',
      type: 'prospect', cid: p.cid, tonnes: tonnes,
      from: port.id, fromName: port.name,
      toPortId: port.id, toName: port.name,
      faction: port.faction || null,
      bodyId: p.body.id, bodyName: p.body.name,
      claimKey: ((G && G.here && G.here.id) || sys.seed) + ':' + p.body.id,
      pay: Math.max(PROSPECT_FLOOR, Math.round(tonnes * base * PROSPECT_OVER * rng.range(0.85, 1.2))),
      deadline: t - (t % WINDOW) + PROSPECT_DEADLINE,
      core: tonnes + 't of ' + ((Sv.NAMES && Sv.NAMES[p.cid]) || p.cid) + ' off ' + p.body.name,
      head: tonnes + ' t of ' + ((Sv.NAMES && Sv.NAMES[p.cid]) || p.cid) +
            ' out of ' + p.body.name + ' itself',
      text: rng.pick(PROSPECT_WHY) + ' ' + tonnes + ' tonnes of ' +
            ((Sv.NAMES && Sv.NAMES[p.cid]) || p.cid) + ' out of ' + p.body.name +
            ' itself - you will need a claim on it and a pod on the ground. ' +
            'Market tonnage bought elsewhere will not do; they will know.'
    });
    ctxs.push({ fromPort: port, sys: sys });
  }

  /* ---- recovery ----------------------------------------------------------
   * Astra asked for salvage and recovery. The game already has things
   * worth recovering and an owner to want them back: the outfits whose
   * pods sit on worlds all over the system (claims.js npcDrones), on a
   * service rota, quietly filling hoppers.
   *
   * A recovery contract is one of those outfits pulling out. They would
   * rather pay a passing hull than write the pod off, and the ONLY
   * difference from prying it loose uninvited is that this time it is
   * lawful - which is the whole mechanical content of the contract, and is
   * why claims.js asks this file before it logs a theft. */

  var RECOVER_DEADLINE = 10 * 86400;
  var RECOVER_PAY = [4200, 8800];

  var RECOVER_WHY = [
    'is winding up in this system and would rather pay a passing hull than write the pod off',
    'sold the claim and the buyer did not want the equipment',
    'lost the crew who used to service it and is not hiring more out here',
    'has had an auditor ask where it is, which is a question they would like to stop answering'
  ];

  function recoveryWork(port, sys, t, G, caps, offers, ctxs) {
    var Cl = global.Claims;
    if (!Cl || !Cl.npcDrones || !G) return;
    var win = windowIndex(t);
    var rng = new RNG('recover|' + port.id + '|' + win + '|' + sys.seed);
    if (!rng.chance(0.4)) return;
    var all;
    try { all = Cl.npcDrones(G, sys) || []; } catch (e) { return; }
    /* Still standing, and belonging to an outfit that berths here - the
     * client has to be somebody this port could plausibly have met. */
    var live = all.filter(function (d) {
      return (!Cl.npcLive || Cl.npcLive(G, d, t)) && !claimedAlready(G, d.id);
    });
    if (!live.length) return;
    var d = rng.pick(live);
    offers.push({
      id: 'rc|' + port.id + '|' + win + '|0',
      type: 'recovery', cid: null, tonnes: 0,
      from: port.id, fromName: port.name,
      toPortId: port.id, toName: port.name,
      faction: port.faction || null,
      droneId: d.id, owner: d.owner, bodyId: d.body, bodyName: d.name,
      pay: Math.round(rng.range(RECOVER_PAY[0], RECOVER_PAY[1])),
      deadline: t - (t % WINDOW) + RECOVER_DEADLINE,
      core: 'recover ' + poss(d.owner) + ' pod from ' + d.name,
      head: 'Recover ' + poss(d.owner) + ' pod from ' + d.name,
      text: d.owner + ' ' + rng.pick(RECOVER_WHY) + '. Their pod is on ' + d.name +
            '. Empty its hopper, pry it off the rock and bring it back here. ' +
            'Signed paper, so nobody is going to call it theft - and whatever is in ' +
            'the hopper when you get there is yours.'
    });
    ctxs.push({ fromPort: port, sys: sys });
  }

  function claimedAlready(G, droneId) {
    var list = (G && G.missions) || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].type === 'recovery' && list[i].droneId === droneId) return true;
    }
    return false;
  }

  /* claims.js asks this before it decides whether prying a pod loose is a
   * theft. A pod you are under contract to recover is not. */
  function lawfulPry(G, droneId) {
    var list = (G && G.missions) || [];
    for (var i = 0; i < list.length; i++) {
      var m = list[i];
      if (m.type === 'recovery' && m.droneId === droneId) { m.aboard = true; return m; }
    }
    return null;
  }

  /* ---- the board pass ---------------------------------------------------- */

  function offersAt(port, sys, galaxy, here, t, G, offers, ctxs) {
    if (!port || !port.market || !sys) return;
    var caps = capsOf(G);
    shortHops(port, sys, t, G, caps, offers, ctxs);
    surveyWork(port, sys, t, G, caps, offers, ctxs);
    sweepWork(port, sys, t, G, caps, offers, ctxs);
    prospectWork(port, sys, t, G, caps, offers, ctxs);
    recoveryWork(port, sys, t, G, caps, offers, ctxs);
    /* Missions.finish writes a long form for any offer that lacks one,
     * off a freight-shaped fact table. None of these are freight, so each
     * keeps its own words rather than being described as a cargo run. */
    for (var i = 0; i < offers.length; i++) {
      var o = offers[i];
      if (!OURS[o.type] && !o.hop) continue;
      /* THE ROW IS A HEADLINE, THE PARAGRAPH IS BEHIND THE BUTTON. Every
       * other row on this board is one scannable line with DETAILS beside
       * it; these were a paragraph each, clipped mid-word at the margin.
       * Written head-first and swapped here so each pass can read as
       * prose while it is being written. */
      if (o.head) {
        if (!o.desc) o.desc = o.text;
        o.text = o.head;
        delete o.head;
      } else if (!o.desc) { o.desc = o.text; }
    }
  }

  /* ---- signing ----------------------------------------------------------
   * What has to be written down at the moment of signing rather than read
   * at the moment of paying. For a survey that is where your coverage
   * stood; for a sweep it is how many installations you had already found,
   * so that an old find cannot be sold twice. */

  function onAccept(G, m) {
    if (!G || !m) return;
    var Sv = global.Survey;
    var star = (G.here && G.here.id) || 'sys';
    if (!m.surveyKey && m.bodyId && m.type === 'survey') m.surveyKey = star + ':' + m.bodyId;
    if (!m.claimKey && m.bodyId && m.type === 'prospect') m.claimKey = star + ':' + m.bodyId;
    /* A PORT OF YOUR OWN, counted from however many you had when you
     * agreed to put up another. Otherwise a surveyor who already owned
     * three could settle this one by docking. */
    if (m.type === 'found') {
      m.foundFrom = countOf(G.stations);
      if (!m.starId) m.starId = (G.here && G.here.id) || null;
    }
    if (m.type === 'survey' && m.surveyKey) {
      var rec = (G.surveys || {})[m.surveyKey];
      var cov = rec ? (Sv && Sv.covClass ? Sv.covClass(rec, 1) : rec.cov || 0) : 0;
      m.covFrom = round3(cov);
    }
    if (m.type === 'sweep') {
      m.sweepFrom = countOf(G.found);
      m.sweptAt = null;
    }
  }

  /* ---- what is left to do, in words -------------------------------------
   * The board and the log both want this and neither should be computing
   * it. Null for a contract this file does not own. */

  function progress(G, m) {
    if (!G || !m) return null;
    var Sv = global.Survey;
    if (m.type === 'survey') {
      var rec = (G.surveys || {})[m.surveyKey];
      var cov = rec ? (Sv && Sv.covClass ? Sv.covClass(rec, 1) : rec.cov || 0) : 0;
      if (cov + 1e-6 >= m.covWant) return 'survey complete - bring it to ' + m.toName;
      return Math.round(cov * 100) + '% of ' + m.bodyName + ', need ' +
             Math.round(m.covWant * 100) + '%';
    }
    if (m.type === 'prospect') {
      var held = Math.floor((G.ship && G.ship.cargo && G.ship.cargo[m.cid]) || 0);
      if (!heldClaim(G, m)) return 'no live claim on ' + m.bodyName + ' - file one at any desk';
      if (held >= m.tonnes) return 'take the ' + m.tonnes + ' t to ' + m.toName;
      return held + ' of ' + m.tonnes + ' t aboard';
    }
    if (m.type === 'recovery') {
      if (m.aboard) return 'take ' + poss(m.owner) + ' pod to ' + m.toName;
      return 'the pod is on ' + m.bodyName;
    }
    if (m.type === 'found') {
      if (countOf(G.stations) > (m.foundFrom || 0)) return 'founded - tell them at ' + m.toName;
      return 'found a port of your own, anywhere in this system';
    }
    if (m.type === 'sweep') {
      if (countOf(G.found) > (m.sweepFrom || 0)) return 'contact logged - take it to ' + m.toName;
      if (m.sweptAt != null) return 'clean sweep on file - take it to ' + m.toName;
      return 'run the coil past the charted bodies';
    }
    return null;
  }

  /* A sweep that found nothing is still a sweep, and the coil has to have
   * actually been run for that to be true. main.js calls this when a sweep
   * completes with no contact. */
  function noteCleanSweep(G, t) {
    var list = (G && G.missions) || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].type === 'sweep' && list[i].sweptAt == null) list[i].sweptAt = t;
    }
  }

  /* ---- settling ----------------------------------------------------------
   * Returns true if this file owns the contract and has dealt with it, so
   * that missions.js can stop looking at it. A contract that is not ready
   * returns false WITHOUT being removed, which is how the freight path
   * behaves too: docking without the goods is a message, not a failure. */

  function settle(G, port, sys, t, m, hooks) {
    if (!m) return false;
    if (m.type === 'survey') return settleSurvey(G, port, t, m, hooks);
    if (m.type === 'sweep') return settleSweep(G, port, t, m, hooks);
    if (m.type === 'prospect') return settleProspect(G, port, t, m, hooks);
    if (m.type === 'recovery') return settleRecovery(G, port, t, m, hooks);
    if (m.type === 'found') return settleFound(G, port, t, m, hooks);
    return false;
  }

  /* A PORT THAT EXISTS. Not a licence, not a plan, not a crawler parked
   * somewhere promising: Stations.found has to have returned one since
   * you agreed to put it up. */
  function settleFound(G, port, t, m, hooks) {
    if (!(countOf(G.stations) > (m.foundFrom || 0))) {
      if (hooks && hooks.say) {
        hooks.say('They want to see a port with your name on it before they pay for one', 5);
      }
      return false;
    }
    pay(G, m, m.pay, hooks, 'A port of your own, signed off at ' + port.name + ': ' + m.pay + ' cr');
    return true;
  }

  /* A live claim on the world the contract names. The provenance IS the
   * contract: without it this is a market run with a story attached. */
  function heldClaim(G, m) {
    var Cl = global.Claims;
    if (!Cl || !Cl.claimFor) return false;
    return !!Cl.claimFor(G, m.claimKey, G.t || 0);
  }

  function settleProspect(G, port, t, m, hooks) {
    var held = (G.ship.cargo && G.ship.cargo[m.cid]) || 0;
    if (!heldClaim(G, m)) {
      if (hooks && hooks.say) {
        hooks.say('Prospect contract — they want ' + m.tonnes + ' t off ' + m.bodyName +
                  ', and you hold no claim on it', 5);
      }
      return false;
    }
    if (held + 1e-9 < m.tonnes) {
      if (hooks && hooks.say) {
        hooks.say('Prospect contract needs ' + m.tonnes + ' t of ' + m.cid +
                  ' aboard — you have ' + Math.floor(held) + ' t', 5);
      }
      return false;
    }
    G.ship.cargo[m.cid] = held - m.tonnes;
    if (G.ship.cargo[m.cid] <= 1e-9) delete G.ship.cargo[m.cid];
    if (global.Sim && global.Sim.refreshShip) global.Sim.refreshShip(G.ship);
    pay(G, m, m.pay, hooks,
        m.tonnes + ' t off ' + m.bodyName + ' delivered at ' + port.name + ': ' + m.pay + ' cr');
    return true;
  }

  function settleRecovery(G, port, t, m, hooks) {
    if (!m.aboard || !(G.ship.drones > 0)) {
      if (hooks && hooks.say) {
        hooks.say("Recovery contract — " + poss(m.owner) + ' pod is still on ' + m.bodyName, 5);
      }
      return false;
    }
    /* The pod goes back to its owner, so it comes off your racks. */
    G.ship.drones = Math.max(0, (G.ship.drones || 0) - 1);
    pay(G, m, m.pay, hooks,
        poss(m.owner) + ' pod recovered from ' + m.bodyName + ' and handed over at ' +
        port.name + ': ' + m.pay + ' cr');
    return true;
  }

  function settleSurvey(G, port, t, m, hooks) {
    var Sv = global.Survey;
    var rec = (G.surveys || {})[m.surveyKey];
    var cov = rec ? (Sv && Sv.covClass ? Sv.covClass(rec, 1) : rec.cov || 0) : 0;
    if (cov + 1e-6 < m.covWant) {
      if (hooks && hooks.say) {
        hooks.say('Survey contract wants ' + Math.round(m.covWant * 100) + '% of ' +
                  m.bodyName + ' — you have ' + Math.round(cov * 100) + '%', 5);
      }
      return false;
    }
    pay(G, m, m.pay, hooks,
        'Survey of ' + m.bodyName + ' filed at ' + port.name + ': ' + m.pay + ' cr');
    return true;
  }

  function settleSweep(G, port, t, m, hooks) {
    var hit = countOf(G.found) > (m.sweepFrom || 0);
    if (!hit && m.sweptAt == null) {
      if (hooks && hooks.say) hooks.say('Sweep contract — the coil has not been run out there yet', 5);
      return false;
    }
    var cr = hit ? m.pay : (m.nothingPay || Math.round(m.pay * SWEEP_NOTHING));
    pay(G, m, cr, hooks,
        (hit ? 'Sweep contact reported at ' : 'Clean sweep reported at ') + port.name +
        ': ' + cr + ' cr');
    return true;
  }

  /* One place that pays, books the standing and writes the line, so three
   * contract types cannot drift apart on any of the three. */
  function pay(G, m, cr, hooks, line) {
    var M = global.Missions;
    /* Through the one place a fine being worked off takes its half
     * (missions.js creditFor, 2026-11-18). */
    var g = M && M.creditFor ? M.creditFor(G, m, cr) : (G.ship.credits += cr, { note: '' });
    line = line + (g.note || '');
    if (M && M.bumpStanding) M.bumpStanding(G, m.faction, STANDING_WIN[m.type] || 3);
    if (global.Tutorial) global.Tutorial.note(G, 'contract', { id: m.id, pay: cr });
    jot(G, line);
    if (hooks && hooks.say) hooks.say(line, 6);
    if (hooks && hooks.sound) hooks.sound('pay');
  }

  /* The journal, reached the way missions.js reaches it: the global when
   * there is one, the module when this is running under node. */
  function jot(G, line) {
    var J = global.Journal;
    if (!J && typeof require !== 'undefined') { try { J = require('./journal.js'); } catch (e) { J = null; } }
    if (J && J.add && G) J.add(G, 'mission', line);
  }

  var STANDING_WIN = { survey: 4, sweep: 5, prospect: 5, recovery: 4, found: 6 };
  var OURS = { survey: 1, sweep: 1, prospect: 1, recovery: 1, found: 1 };

  /* WHAT THE ROW SHOULD SAY IT COSTS YOU. The board's third column has
   * always been hold space, because every contract on it was freight.
   * A survey costs an instrument and a fortnight; say so. */
  function demand(o) {
    if (o.type === 'survey') return 'survey scanner';
    if (o.type === 'sweep') return 'magnetometer';
    if (o.type === 'recovery') return 'a free drone rack';
    if (o.type === 'prospect') return o.tonnes + 't to dig and carry';
    if (o.type === 'found') return 'a crawler and a licence';
    return null;
  }

  var Fieldwork = {
    capsOf: capsOf, offersAt: offersAt, onAccept: onAccept,
    progress: progress, settle: settle, noteCleanSweep: noteCleanSweep,
    lawfulPry: lawfulPry, heldClaim: heldClaim, demand: demand, OURS: OURS,
    PROSPECT_OVER: PROSPECT_OVER, PROSPECT_FLOOR: PROSPECT_FLOOR,
    RECOVER_PAY: RECOVER_PAY,
    legHours: legHours,
    HOP_CR_PER_HOUR: HOP_CR_PER_HOUR, HOP_DOUBLE: HOP_DOUBLE, HOP_FLOOR: HOP_FLOOR,
    SURVEY_CR_PER_POINT: SURVEY_CR_PER_POINT, SWEEP_NOTHING: SWEEP_NOTHING,
    STANDING_WIN: STANDING_WIN
  };

  global.Fieldwork = Fieldwork;
  if (typeof module !== 'undefined' && module.exports) module.exports = Fieldwork;
})(typeof window !== 'undefined' ? window : globalThis);
