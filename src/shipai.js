/* shipai.js - who is in the chair, as numbers a decision can use.
 *
 * Ship AI, slice 1 (claude/ship-ai-profiles.md, 2026-11-20). Astra asked for
 * "scared", "loyal", "angered", "trader", "passenger", "police", "syndicate",
 * "pirate" and "navy" profiles, modified by how corrupt the system is and
 * how corrupt that particular captain is.
 *
 * Those are two kinds of thing. The six ROLES are what a ship is; scared,
 * angered and loyal are MOODS that sit on any role (slice 2). Under both is
 * CHARACTER: the temper and values captains.js already seeds, turned here
 * into six dials in 0..1:
 *
 *   nerve       bolts at the first shot .. holds under fire
 *   greed       won't risk anything for money .. will risk anything
 *   probity     bent .. straight. The captain's OWN corruption, and it reads
 *               by role: honest or on the take (police, navy), declares or
 *               smuggles (trader), keeps a code or shoots the witnesses
 *               (pirate), keeps the Syndicate's word or skims (syndicate).
 *   discipline  does what she likes .. does what doctrine says
 *   heat        slow to anger and quick to forgive .. the reverse
 *   cohesion    breaks formation when it suits her .. holds to her flight
 *               leader. Astra: loyalty "isn't in relation to the player,
 *               but to the 'flight leader' of the group".
 *
 * THE SYSTEM PULLS PROBITY, IT DOES NOT SET IT. A bought system bends its
 * people by lambda(role) x (corruption - 40%): in a bought system over a third
 * of its cops are on the take on their own account, and the straight ones
 * are the story. Astra, on the Navy: "A few." (Measured: 4 of 43.)
 *
 * Pure: every dial is a function of (seed, captain key, system corruption),
 * worked out on demand and never saved. Every draw is a hash of its own,
 * so no generator stream moves (doctrine 2).
 */
(function (global) {
  'use strict';

  var ROLES = ['trader', 'passenger', 'police', 'navy', 'syndicate', 'pirate'];

  /* Starting points by role, before temper and values. */
  var BASE = {
    //            nerve greed probity discipline heat cohesion
    trader:    { nerve: 0.40, greed: 0.50, probity: 0.00, discipline: 0.40, heat: 0.40, cohesion: 0.40 },
    passenger: { nerve: 0.20, greed: 0.30, probity: 0.00, discipline: 0.50, heat: 0.30, cohesion: 0.45 },
    police:    { nerve: 0.60, greed: 0.25, probity: 0.00, discipline: 0.65, heat: 0.40, cohesion: 0.70 },
    navy:      { nerve: 0.80, greed: 0.10, probity: 0.00, discipline: 0.85, heat: 0.30, cohesion: 0.85 },
    syndicate: { nerve: 0.65, greed: 0.60, probity: 0.00, discipline: 0.70, heat: 0.40, cohesion: 0.85 },
    pirate:    { nerve: 0.50, greed: 0.75, probity: 0.00, discipline: 0.25, heat: 0.50, cohesion: 0.35 }
  };

  /* Probity is seeded from what she believes, then her temper. */
  var PROBITY_BY_VALUES = { lawful: 0.80, abolitionist: 0.75, profit: 0.45, pirate: 0.25 };

  var TEMPER = {
    wary:       { nerve: -0.15, greed: 0,     probity: 0,     discipline: 0,     heat: -0.05, cohesion: 0 },
    friendly:   { nerve: 0,     greed: 0,     probity: 0.04,  discipline: 0,     heat: -0.20, cohesion: 0.05 },
    mercenary:  { nerve: 0,     greed: 0.15,  probity: -0.18, discipline: -0.10, heat: 0.05,  cohesion: -0.15 },
    principled: { nerve: 0.05,  greed: -0.10, probity: 0.12,  discipline: 0.10,  heat: 0,     cohesion: 0.05 },
    gruff:      { nerve: 0.15,  greed: 0,     probity: 0,     discipline: 0.05,  heat: 0.30,  cohesion: 0 }
  };
  var VALUES_GREED = { profit: 0.15, pirate: 0.15, abolitionist: -0.10, lawful: -0.10 };

  /* How far each dial may wander on its own, per captain. */
  var WOBBLE = { nerve: 0.12, greed: 0.10, probity: 0.12, discipline: 0.08, heat: 0.10, cohesion: 0.08 };

  /* How strongly the institution bends its people toward the system's
   * corruption (design section 3). A pirate answers to nobody's institution. */
  /* Police at 1.0: measured over 385 cops in the kawartha galaxy, the
   * design's 0.5 bent only 10% of them in a bought (80) system, which is a
   * bought system in name only. At 1.0 it is 37% (and next to none at 15);
   * the lawful, principled ones are the ones left standing. The rest of a
   * bought system's rot is DOCTRINE - the force itself extorting - which is
   * slice 4, not a captain's own probity. */
  var PULL = { police: 1.0, trader: 0.35, passenger: 0.35, syndicate: 0.3, navy: 0.2, pirate: 0 };
  var PULL_PIVOT = 0.4;           // a system at 40% corruption bends nobody

  /* Below this she will take a bribe, skim, or fight dirty. A threshold for
   * the tests and the slices that follow, not a number shown to anyone:
   * Astra agreed you learn a captain from her tells, not a readout. */
  var BENT = 0.4;

  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

  /* A seeded -1..1 per captain and per question, with an avalanche tail
   * (SLIPSPACE-TODO: "a hash is not automatically a hash"). */
  function wobble(seed, key, what) {
    var s = 'shipai|' + seed + '|' + key + '|' + what, h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
    return (h >>> 0) / 4294967296 * 2 - 1;
  }

  function Cap() { return global.Captains; }

  function specOf(contact) {
    if (!contact) return null;
    return contact.spec || (contact.rail || contact.liftedFrom ? contact : null);
  }
  function routeOf(contact) {
    var spec = specOf(contact);
    if (spec) return spec.liftedFrom || null;
    return (contact && contact.route) || null;
  }

  /* The six roles, from the ship and its captain's profile.
   *   pirate     captains.js already says so (kind 'pirate', or outlaw)
   *   syndicate  flies the outlaw flag without being a raider: the heavies
   *              (police-kind, faction 'outlaw') and the Syndicate's runners
   *              (route.flag 'outlaw', the lines aggression.js never robs)
   *   passenger  liners and shuttles: lives aboard
   *   police / navy  as captains.js reads them
   *   trader     everything else that carries something */
  function roleOf(contact, p) {
    if (!contact) return 'trader';
    var spec = specOf(contact) || contact;
    var route = routeOf(contact);
    var capRole = p ? p.role : (Cap() && Cap().roleOf ? Cap().roleOf(route || spec) : null);
    if (capRole === 'pirate' || spec.kind === 'pirate') return 'pirate';
    if (spec.faction === 'outlaw' || (route && route.flag === 'outlaw') || spec.heavy) return 'syndicate';
    /* A liner is a hull class, not a route kind (generate.js shipClass), and
     * fillLinerSeats gives it its souls. A feeder shuttle carries freight. */
    var cls = (route && route.cls) || spec.cls;
    if (cls === 'liner' || (route && route.souls > 0) || spec.souls > 0) return 'passenger';
    var k = (route && route.kind) || spec.kind || contact.kind;
    if (capRole === 'police' || capRole === 'navy') return capRole;
    if (k === 'police') return 'police';
    if (k === 'navy' || k === 'capital') return 'navy';
    return 'trader';
  }

  /* The system's corruption, through the one door combat.js keeps for it
   * (bribes, holdings and decay included). 40 when nothing can say. */
  function corruptionOf(G, sys, starId) {
    var C = global.Combat;
    if (C && C.systemCorruption) return C.systemCorruption(G, sys, starId);
    return (sys && sys.corruption !== undefined) ? sys.corruption : 40;
  }

  /* The dials, from a profile and a role. Split out from dials() so the
   * tests can ask "what would this captain be in a bought system" without
   * building one. */
  function dialsFor(seed, p, role, corruption) {
    var b = BASE[role] || BASE.trader;
    var t = TEMPER[p.temper] || TEMPER.wary;
    var key = p.key || p.name || '';
    var out = { role: role };
    var names = ['nerve', 'greed', 'discipline', 'heat', 'cohesion'];
    for (var i = 0; i < names.length; i++) {
      var n = names[i];
      var v = b[n] + (t[n] || 0) + WOBBLE[n] * wobble(seed, key, n);
      if (n === 'greed') v += VALUES_GREED[p.values] || 0;
      out[n] = clamp01(v);
    }
    var seedProb = (PROBITY_BY_VALUES[p.values] !== undefined ? PROBITY_BY_VALUES[p.values] : 0.5) +
                   (t.probity || 0) + WOBBLE.probity * wobble(seed, key, 'probity');
    var c = (typeof corruption === 'number' ? corruption : 40) / 100;
    out.seedProbity = clamp01(seedProb);
    out.probity = clamp01(seedProb - (PULL[role] || 0) * (c - PULL_PIVOT));
    out.corruption = Math.round(c * 100);
    out.bent = out.probity < BENT;
    return out;
  }

  function dials(G, sys, contact, starId) {
    var C = Cap();
    if (!C || !C.profile) return null;
    var p = C.profile(G, sys, contact);
    if (!p) return null;
    var role = roleOf(contact, p);
    return dialsFor(G && G.seed, p, role, corruptionOf(G, sys, starId));
  }

  /* ==== SLICE 2: MOODS AND FLIGHTS (2026-11-22) ==========================
   * claude/ship-ai-profiles.md sections 4 and 7.
   *
   * MOODS. Every lifted ship carries two numbers in 0..1, fear and anger,
   * that events push up and time lets down. They live on the spec
   * (`sp._ai`), never in the save: a fight is a thing that happens while
   * you are there (aggression.js), and anger at YOU already outlives it in
   * captain memory (combat.js crime records 'attacked' and 'robbed').
   *
   *   fear   half-life 60 s x (1.5 - nerve): a wary captain stays scared
   *          longer. Raised by hits, robbery, a wingmate killed, losing
   *          the flight leader - and held up from below by the odds: the
   *          firepower aimed at her against her own and her flight's.
   *   anger  half-life 5 min .. 1 h by heat: quick to anger is slow to
   *          forgive. Raised by hits, robbery, a refused demand, a
   *          wingmate hit or killed.
   *
   * ANGER OVERRIDES FEAR in proportion to nerve: she is ANGERED when
   * anger x (0.5 + nerve) outweighs her fear. An angered pirate holds on
   * to half the hull a calm one would run at; a scared wingmate whose
   * fear beats her cohesion breaks formation, and an angered one does not.
   *
   * FLIGHTS. Astra: loyalty "isn't in relation to the player, but to the
   * 'flight leader' of the group". Ships of one organisation lifted near
   * each other form a flight with one leader:
   *   navy:<faction>     a faction's warships, and the tenders that ride a
   *                      capital (generate.js parentShip)
   *   police:<faction>   its cutters
   *   syndicate          the heavies and the runners, one organisation
   *   pirate:<band>      a band's ships
   *   escort:<route>     a freighter and the mercenaries hired to shadow
   *                      her run (generate.js escorting)
   * Independent traders and liners fly alone (slice 3 gives them a
   * convoy's weak flight). Your own company's ships are left for when
   * fleet ships fly with you lifted.
   *
   * The leader is chosen by rank, then hull, then a seeded seniority, and
   * keeps the job while she is in the flight (no flapping when a junior
   * edges ahead on a tie). Members:
   *   - cover a flight-mate who is hit: an attack on one is an attack on
   *     her. Every Syndicate ship in reach answers ANY Syndicate ship hit,
   *     flight or not (Astra: "all syndicate ships will have loyal for one
   *     another").
   *   - follow the leader's verb: engage what she engages, and go when she
   *     goes.
   *   - break formation when fear beats cohesion.
   * When the leader falls, the most senior captain takes the lead if she
   * has the cohesion for it; otherwise the flight SCATTERS and nobody in
   * it regroups for two minutes. Taking the leader out is how a fight
   * against a group is won.
   *
   * What a player sees: no numbers (Astra agreed you learn a captain from
   * her tells). The tells are the message line - "breaks to cover",
   * "takes the lead", "the flight scatters", "breaks formation" - and what
   * the ships do. */
  var FEAR_HALF_S = 60, ANGER_HALF_MIN_S = 300, ANGER_HALF_SPAN_S = 3300;
  var MOOD_EVENTS = {
    hit:        { fear: 0.20, anger: 0.25 },
    robbed:     { fear: 0.15, anger: 0.50 },
    refused:    { fear: 0.00, anger: 0.30 },
    mateHit:    { fear: 0.05, anger: 0.15 },
    mateKilled: { fear: 0.30, anger: 0.40 },
    leaderLost: { fear: 0.35, anger: 0.10 }
  };
  var SCARED = 0.4, ANGRY = 0.3, BREAK_MARGIN = 0.1;
  var FLIGHT_KM = 300;           // single-linkage: a ship this close to a member is in
  var FLIGHT_EVERY_S = 2;        // flights re-formed this often
  var SCATTER_S = 120;           // a scattered flight's captains fly alone this long
  var SUCCEED_COHESION = 0.5;    // the senior captain takes the lead at this or above
  var DEFEND_KM = 2000;          // a wingmate this near comes to cover a mate
  var SYNDICATE_ANSWER_KM = 3000;
  var CHASE_KM = 4;              // as aggression.js: inside every NPC gun's range
  var SAY_KM = 6000;             // as aggression.js SEE_KM
  /* Who outranks whom: a warship over the cutters, the Syndicate's heavy
   * over its runners, a hired gun over the freighter she guards. */
  var RANK = { capital: 100, navy: 80, heavy: 70, police: 50, merc: 45, pirate: 40, tender: 30, trader: 20 };

  function V3() { return global.V; }
  function aliveSp(sp) { return !!(sp && !sp.dead && sp.live && sp.live.pos); }
  function distSp(a, b) { return V3().dist(a.live.pos, b.live.pos); }
  function nameOf(sp) { var n = (sp && sp.name) || 'ship'; return /^the /i.test(n) ? n : 'the ' + n; }
  function NameOf(sp) { var n = nameOf(sp); return n.charAt(0).toUpperCase() + n.slice(1); }
  function sayNear(G, hooks, sp, m, s) {
    if (!hooks || !hooks.say || !G || !G.ship || !G.ship.pos || !aliveSp(sp)) return;
    if (V3().dist(sp.live.pos, G.ship.pos) < SAY_KM) hooks.say(m, s || 5);
  }
  function armed(sp) {
    var C = global.Combat;
    return !!(C && C.isArmedNpc ? C.isArmedNpc(sp) : sp && sp.kind !== 'trader');
  }

  /* Her mind, made the first time anything asks: dials from her captain
   * (slice 1), or, where captains.js cannot say, from her role alone. */
  function aiOf(G, sys, sp) {
    if (sp._ai) return sp._ai;
    var d = null;
    try { d = dials(G, sys, sp, sys && sys.starId); } catch (e) { d = null; }
    if (!d) d = dialsFor(G && G.seed, { key: sp.id, temper: 'wary' }, roleOf(sp), corruptionOf(G, sys, sys && sys.starId));
    sp._ai = { dials: d, fear: 0, anger: 0, at: null };
    return sp._ai;
  }
  function fearHalf(d) { return FEAR_HALF_S * (1.5 - d.nerve); }
  function angerHalf(d) { return ANGER_HALF_MIN_S + ANGER_HALF_SPAN_S * d.heat; }
  /* Let time do its work, up to t. */
  function settle(ai, t) {
    if (ai.at === null || ai.at === undefined) { ai.at = t; return ai; }
    var dt = t - ai.at;
    if (dt > 0) {
      ai.fear *= Math.pow(0.5, dt / fearHalf(ai.dials));
      ai.anger *= Math.pow(0.5, dt / angerHalf(ai.dials));
      ai.at = t;
    }
    return ai;
  }
  /* Something happened to her. A brave captain takes less fright from it,
   * a hot-tempered one more anger. `k` scales it (a graze, a broadside). */
  function feel(G, sys, sp, ev, t, k) {
    if (!sp) return null;
    var e = MOOD_EVENTS[ev];
    if (!e) return null;
    var ai = settle(aiOf(G, sys, sp), t), d = ai.dials, s = k === undefined ? 1 : k;
    ai.fear = clamp01(ai.fear + e.fear * s * (1.3 - d.nerve));
    ai.anger = clamp01(ai.anger + e.anger * s * (0.5 + d.heat));
    return ai;
  }
  /* Calm, scared or angered - anger wins when it outweighs fear by nerve. */
  function stance(ai) {
    if (!ai) return 'calm';
    var d = ai.dials;
    if (ai.anger >= ANGRY && ai.anger * (0.5 + d.nerve) >= ai.fear) return 'angered';
    if (ai.fear >= SCARED) return 'scared';
    return 'calm';
  }
  function moodOf(G, sys, sp, t) {
    if (!sp) return null;
    var ai = settle(aiOf(G, sys, sp), t);
    return { fear: ai.fear, anger: ai.anger, stance: stance(ai) };
  }
  /* Fear has beaten her cohesion, and anger is not holding her. */
  function breaks(ai) {
    return !!ai && stance(ai) !== 'angered' && ai.fear > ai.dials.cohesion + BREAK_MARGIN;
  }
  /* The hull fraction a ship gives up at: an angered one holds on to half. */
  function runHull(G, sys, sp, base, t) {
    var ai = sp && sp._ai ? settle(sp._ai, t) : null;
    return ai && stance(ai) === 'angered' ? base * 0.5 : base;
  }

  /* ---- what a ship can bring to a fight --------------------------------- */
  function powerOf(sp) {
    if (!aliveSp(sp) || sp.disabled || !armed(sp)) return 0;
    var A = global.Aggression, g = A && A.gunOf ? A.gunOf(sp) : null;
    var max = sp.hullMax || 50, hp = sp.hullHp === undefined ? max : sp.hullHp;
    return ((g && g.dmg) || 1) * Math.max(0.1, hp / max);
  }
  /* Yours, roughly: a gun as good as a pirate's, two if you carry more. */
  function playerPower(G) {
    var C = global.Combat, s = G && G.ship;
    if (!s || !C || !C.NPC_GUN) return 0;
    var n = (s.weapons || s.hardpoints || []).filter(function (w) { return !!w; }).length;
    return n ? C.NPC_GUN.dmg * Math.min(2, n) : 0;
  }
  /* Who is aimed at her right now, and with how much. */
  function threatOn(G, sys, sp, t) {
    var hostile = 0;
    (sys.patrols || []).forEach(function (o) {
      if (o === sp || !aliveSp(o) || o.disabled) return;
      if (o.target === sp || o.defendTarget === sp) hostile += powerOf(o);
    });
    if (sp.hostileToPlayer || (sp._playerHitAt !== undefined && t - sp._playerHitAt < 30)) hostile += playerPower(G);
    return hostile;
  }

  /* ---- flights ------------------------------------------------------------ */
  function orgOf(sp) {
    if (!sp) return null;
    if (sp.parentShip) return 'navy:' + (sp.faction || '');
    if (sp.kind === 'merc' && sp.escorting) return 'escort:' + sp.escorting;
    var role = roleOf(sp);
    if (role === 'syndicate') return 'syndicate';
    /* `band` is the crew (generate.js, 2026-11-22): the band in its own
     * space, otherwise the freelancers working one port. */
    if (role === 'pirate') return 'pirate:' + (sp.band || sp.faction || 'free');
    if (role === 'police') return 'police:' + (sp.faction || '');
    if (role === 'navy') return 'navy:' + (sp.faction || '');
    /* A freighter with a hired escort lifted near her flies with it. */
    if (sp.liftedFrom && sp._escorted) return 'escort:' + sp.liftedFrom.id;
    return null;
  }
  function rankOf(G, sp) {
    var r = sp.kind === 'capital' ? RANK.capital : sp.heavy ? RANK.heavy
          : sp.parentShip ? RANK.tender : RANK[sp.kind] || RANK.trader;
    var letter = sp.sizeLetter === 'l' ? 6 : sp.sizeLetter === 'm' ? 3 : 0;
    /* Seniority: a seeded half-point, so equals always sort the same way. */
    return r + letter + (sp.size || 0) * 10 + 0.5 * (wobble(G && G.seed, sp.id, 'seniority') + 1);
  }
  function flightOf(sp) { return sp && sp.flight && sp.flight.members.indexOf(sp) >= 0 ? sp.flight : null; }
  function matesOf(sp) {
    var f = flightOf(sp);
    return f ? f.members.filter(function (m) { return m !== sp && aliveSp(m); }) : [];
  }

  /* Form the flights from what is lifted, at t. */
  function formFlights(G, sys, t) {
    var all = (sys.patrols || []).filter(function (sp) {
      return aliveSp(sp) && !sp.disabled && !sp.surrendered && !(sp._scatteredAt !== undefined && t - sp._scatteredAt < SCATTER_S);
    });
    /* Escorted freighters first, so a mercenary's freighter is in her org. */
    var escorted = {};
    all.forEach(function (sp) { if (sp.kind === 'merc' && sp.escorting) escorted[sp.escorting] = true; });
    all.forEach(function (sp) { if (sp.liftedFrom) sp._escorted = !!escorted[sp.liftedFrom.id]; });
    var byOrg = {};
    all.forEach(function (sp) {
      var o = orgOf(sp);
      if (o) (byOrg[o] = byOrg[o] || []).push(sp);
    });
    var flights = [];
    (sys.patrols || []).forEach(function (sp) { if (sp.flight) sp.flight = null; });
    Object.keys(byOrg).sort().forEach(function (org) {
      var list = byOrg[org], seen = {};
      for (var i = 0; i < list.length; i++) {
        if (seen[list[i].id]) continue;
        /* Single linkage: everyone within FLIGHT_KM of anyone already in. */
        var group = [list[i]];
        seen[list[i].id] = true;
        for (var gi = 0; gi < group.length; gi++) {
          for (var j = 0; j < list.length; j++) {
            if (seen[list[j].id] || distSp(group[gi], list[j]) > FLIGHT_KM) continue;
            seen[list[j].id] = true;
            group.push(list[j]);
          }
        }
        if (group.length < 2) continue;
        /* A sitting leader keeps the job while she is still in the flight. */
        var leader = null;
        group.forEach(function (m) { if (m._leaderOf && group.indexOf(m) >= 0 && !leader) leader = m; });
        if (!leader) {
          leader = group.slice().sort(function (a, b) { return rankOf(G, b) - rankOf(G, a) || (a.id < b.id ? -1 : 1); })[0];
        }
        var ids = group.map(function (m) { return m.id; }).sort();
        var f = { id: org + '|' + ids[0], org: org, leader: leader, members: group, formedAt: t };
        group.forEach(function (m) { m.flight = f; m._leaderOf = m === leader ? f.id : null; });
        flights.push(f);
      }
    });
    sys._flights = flights;
    sys._flightsAt = t;
    return flights;
  }

  /* The leader is gone: the senior captain takes over, or it scatters. */
  function succession(G, sys, f, t, hooks) {
    var left = f.members.filter(function (m) { return aliveSp(m) && m !== f.leader && !m.disabled; });
    f.members = left;
    if (!left.length) return null;
    left.forEach(function (m) { feel(G, sys, m, 'leaderLost', t); });
    var senior = left.slice().sort(function (a, b) { return rankOf(G, b) - rankOf(G, a) || (a.id < b.id ? -1 : 1); })[0];
    var ai = settle(aiOf(G, sys, senior), t);
    if (left.length >= 2 && ai.dials.cohesion >= SUCCEED_COHESION && !breaks(ai)) {
      f.leader = senior;
      left.forEach(function (m) { m._leaderOf = m === senior ? f.id : null; });
      sayNear(G, hooks, senior, NameOf(senior) + ' takes the lead', 5);
      return senior;
    }
    /* Nobody holds it together: every captain on her own nerve. */
    left.forEach(function (m) { m.flight = null; m._leaderOf = null; m._scatteredAt = t; });
    if (left.length) sayNear(G, hooks, left[0], 'With ' + nameOf(f.leader) + ' gone, the flight scatters', 5);
    f.members = [];
    return null;
  }

  /* An armed wingmate turns on whoever hit her mate (or the leader's prey). */
  function busy(m) {
    return aliveSp(m.target) || aliveSp(m.fugitive) || m.hostileToPlayer || m.disabled || m.surrendered ||
           (m.mode === 'breakoff' && aliveSp(m.threat));
  }
  function cover(G, sys, m, foe, mate, t, hooks) {
    if (!aliveSp(foe) || foe === m || !armed(m) || busy(m)) return false;
    if (orgOf(foe) && orgOf(foe) === orgOf(m)) return false;     // never her own side
    var ai = settle(aiOf(G, sys, m), t);
    if (breaks(ai)) return false;
    m.target = foe; m.mode = 'chase'; m.standoffKm = CHASE_KM; m.defending = mate;
    if (!m._saidCover || t - m._saidCover > 60) {
      m._saidCover = t;
      sayNear(G, hooks, m, NameOf(m) + ' breaks to cover ' + nameOf(mate), 4);
    }
    return true;
  }

  /* ---- the hooks aggression.js calls ------------------------------------- */
  /* One ship hit by another. */
  function onHit(G, sys, v, by, t, hooks) {
    if (!v || v.dead) return;
    feel(G, sys, v, 'hit', t);
    var covered = [];
    matesOf(v).forEach(function (m) {
      feel(G, sys, m, 'mateHit', t);
      if (by && distSp(m, v) < DEFEND_KM && cover(G, sys, m, by, v, t, hooks)) covered.push(m);
    });
    /* The Syndicate answers its own, flight or not. */
    if (by && roleOf(v) === 'syndicate' && roleOf(by) !== 'syndicate') {
      (sys.patrols || []).forEach(function (m) {
        if (m === v || covered.indexOf(m) >= 0 || !aliveSp(m) || roleOf(m) !== 'syndicate') return;
        if (distSp(m, v) < SYNDICATE_ANSWER_KM) cover(G, sys, m, by, v, t, hooks);
      });
    }
  }
  /* You hit her. Her flight turns on you - pirates, the Syndicate and a
   * freighter's hired guns. The law's own answer to you is the crime and
   * the warrant (combat.js), so a cutter's wingmate is left to that. */
  function onPlayerHit(G, sys, v, t, hooks) {
    if (!v || v.dead) return;
    feel(G, sys, v, 'hit', t);
    v._playerHitAt = t;
    var org = orgOf(v) || '';
    var answers = org === 'syndicate' || /^pirate:/.test(org) || /^escort:/.test(org);
    var list = matesOf(v);
    if (roleOf(v) === 'syndicate') {
      (sys.patrols || []).forEach(function (m) {
        if (m !== v && list.indexOf(m) < 0 && aliveSp(m) && roleOf(m) === 'syndicate' && distSp(m, v) < SYNDICATE_ANSWER_KM) list.push(m);
      });
    }
    list.forEach(function (m) {
      feel(G, sys, m, 'mateHit', t);
      if (!answers || m.hostileToPlayer || !armed(m) || m.disabled || distSp(m, v) > DEFEND_KM) return;
      if (breaks(settle(aiOf(G, sys, m), t))) return;
      m.hostileToPlayer = true; m.mode = 'attack'; m.target = null; m.defending = v;
      if (!m._saidCover || t - m._saidCover > 60) {
        m._saidCover = t;
        sayNear(G, hooks, m, NameOf(m) + ' breaks to cover ' + nameOf(v) + ' - weapons hot', 5);
      }
    });
  }
  /* She is dead (or disabled out of it): her mates feel it, and a flight
   * that has lost its leader picks another or scatters. */
  function onKill(G, sys, dead, by, t, hooks) {
    if (!dead) return;
    var f = flightOf(dead);
    if (!f) return;
    matesOf(dead).forEach(function (m) { feel(G, sys, m, 'mateKilled', t); });
    if (f.leader === dead) succession(G, sys, f, t, hooks);
    else f.members = f.members.filter(function (m) { return m !== dead; });
  }
  function onRobbed(G, sys, v, t) { feel(G, sys, v, 'robbed', t); }
  function onRefused(G, sys, v, t) { feel(G, sys, v, 'refused', t); }

  /* ---- the frame ------------------------------------------------------------ */
  function tick(sys, G, t, hooks) {
    if (!sys || !sys.patrols || !sys.patrols.length) return;
    if (sys._flightsAt === undefined || t - sys._flightsAt >= FLIGHT_EVERY_S || t < sys._flightsAt) formFlights(G, sys, t);
    if (sys._moodsAt !== undefined && t - sys._moodsAt < 1 && t >= sys._moodsAt) return;
    sys._moodsAt = t;
    /* Fear held up by the odds, for anyone something is aimed at. */
    sys.patrols.forEach(function (sp) {
      if (!aliveSp(sp) || sp.disabled) return;
      var foe = threatOn(G, sys, sp, t);
      if (!(foe > 0) && !sp._ai) return;
      var ai = settle(aiOf(G, sys, sp), t);
      if (foe > 0) {
        var own = powerOf(sp);
        matesOf(sp).forEach(function (m) { if (distSp(m, sp) < DEFEND_KM) own += powerOf(m); });
        var odds = foe / (foe + own);
        ai.fear = Math.max(ai.fear, clamp01(odds * (1.2 - ai.dials.nerve)));
      }
    });
    (sys._flights || []).forEach(function (f) {
      var L = f.leader;
      if (!aliveSp(L)) { succession(G, sys, f, t, hooks); return; }
      matesOf(L).forEach(function (m) {
        if (m.disabled || m.surrendered) return;
        var ai = settle(aiOf(G, sys, m), t);
        /* Fear beats cohesion: she leaves the flight and runs. */
        if (breaks(ai)) {
          var foe = aliveSp(m.target) ? m.target : aliveSp(m.defendTarget) ? m.defendTarget : (aliveSp(L.target) ? L.target : null);
          m.target = null; m.defendTarget = null; m.mode = 'breakoff'; m.threat = foe;
          m.flight = null; m._leaderOf = null; m._scatteredAt = t;
          f.members = f.members.filter(function (x) { return x !== m; });
          sayNear(G, hooks, m, NameOf(m) + ' breaks formation and runs', 4);
          return;
        }
        /* A mate with a fight of her own, or no gun, keeps to it. */
        if (busy(m) || !armed(m)) return;
        /* The leader engages: so does she. A band's leader calling on a
         * freighter to heave to is a robbery, not a fight - the band
         * stands off unless the freighter fights back, so one hold is
         * never stripped twice. */
        var robbing = /^pirate:/.test(f.org) && aliveSp(L.target) && !L.target.refused;
        if (aliveSp(L.target) && !robbing && (L.mode === 'chase' || L.mode === 'attack') && orgOf(L.target) !== f.org) {
          m.target = L.target; m.mode = 'chase'; m.standoffKm = CHASE_KM; m.defending = null;
          return;
        }
        if (L.hostileToPlayer && !m.hostileToPlayer && (f.org === 'syndicate' || /^pirate:/.test(f.org) || /^escort:/.test(f.org) ||
            /^(police|navy):/.test(f.org) && L.onSight)) {
          m.hostileToPlayer = true; m.mode = 'attack'; m.target = null;
          return;
        }
        /* The leader withdraws: the flight goes with her. */
        if (L.mode === 'breakoff' && aliveSp(L.threat) && !L.target) {
          m.mode = 'breakoff'; m.threat = L.threat;
        }
      });
    });
  }

  /* ==== SLICE 3: WHAT A CIVILIAN DOES (2026-11-22) ========================
   * claude/ship-ai-profiles.md section 5 (Trader, Passenger) and the
   * Scared options of section 4. A freighter or a liner with somebody on
   * her chooses one of five things:
   *
   *   comply     heave to and give up what is asked (the pirate strips 60%)
   *   dump       jettison part of the hold as canisters and run - the pirate
   *              stops to scoop them (aggression.js dumpCargo); you can too
   *   flee       run for it, and call for help (the mayday goes out anyway)
   *   fight      turn on her attacker - armed ships only
   *   surrender  cut her drive and strike (under fire only)
   *
   * Each is scored from the role's base, the captain's dials, her mood and
   * the situation, and the best one wins:
   *
   *   score = base[role][verb] x dials x mood x situation  (+ a seeded hair
   *           so the same meeting always breaks a tie the same way)
   *
   * Situation is what she can see: whether she carries a gun, the odds
   * (her firepower and her escort's against the attacker's), whether she
   * can outrun him (her acceleration against his), whether the law is in
   * sight, how holed she is, and whether she has a hold worth dumping.
   *
   * CORNERED: frightened, unable to outrun him and armed, the fight score
   * is lifted by half again - the one place fear makes a ship fight.
   *
   * A liner never fights (lives aboard outweigh the hold), flees and calls
   * for help early, and strikes sooner than anyone (surrender base 0.9).
   * A greedy trader would rather dump a third than hand over three fifths,
   * and would rather gamble on running than either.
   *
   * Under fire the choice is sticky for HOLD_S: a captain does not change
   * her mind on every hit unless a new answer beats hers by a quarter. */
  var CIVIL_BASE = {
    //                     comply dump  flee  fight surrender
    trader:    { demand: { comply: 0.45, dump: 0.40, flee: 0.35, fight: 0.30, surrender: 0 },
                 hit:    { comply: 0,    dump: 0.30, flee: 0.50, fight: 0.35, surrender: 0.25 } },
    passenger: { demand: { comply: 0.60, dump: 0.15, flee: 0.50, fight: 0,    surrender: 0 },
                 hit:    { comply: 0,    dump: 0.10, flee: 0.70, fight: 0,    surrender: 0.90 } }
  };
  var CORNERED_FEAR = 0.6, CORNERED_LIFT = 1.6, HOLD_S = 8, STICKY = 1.25;
  var DUMP_TAKE = 0.35;            // of each of her first two lines, as canisters
  var VERBS = ['comply', 'dump', 'flee', 'fight', 'surrender'];

  function civilRole(sp) {
    var r = roleOf(sp);
    return r === 'passenger' ? 'passenger' : r === 'trader' ? 'trader' : null;
  }
  function hasCargo(sp) {
    return (sp.manifest || []).some(function (m) { return (m.qty || m.tonnes || 0) > 0; });
  }
  /* What she can see. `foe` is a spec, or null for you. */
  function situation(G, sys, v, foe, t) {
    var own = powerOf(v);
    matesOf(v).forEach(function (m) { if (distSp(m, v) < DEFEND_KM) own += powerOf(m); });
    var enemy = foe ? powerOf(foe) : playerPower(G);
    var mine = v.accel || (v.live && v.live.accel) || 0;
    /* You: a hull built to fly, against a hull built to carry. */
    var theirs = foe ? (foe.accel || 0) : Infinity;
    var Sm = global.Sim, pos = v.live && v.live.pos;
    var law = !!(Sm && Sm.policeNearby && pos && Sm.policeNearby(sys, t, pos)) && !(foe && foe.kind === 'police');
    var max = v.hullMax || 50, hp = v.hullHp === undefined ? max : v.hullHp;
    return {
      armed: armed(v), own: own, enemy: enemy,
      odds: own + enemy > 0 ? own / (own + enemy) : 0.5,
      outrun: mine > theirs * 1.05,
      law: law, hull: Math.max(0, Math.min(1, hp / max)), cargo: hasCargo(v)
    };
  }
  /* Every verb's score for her, now. `why` is 'demand' (heave to) or 'hit'. */
  function civilScores(G, sys, v, foe, why, t) {
    var role = civilRole(v);
    if (!role) return null;
    var ai = settle(aiOf(G, sys, v), t), d = ai.dials, b = CIVIL_BASE[role][why] || CIVIL_BASE[role].hit;
    var s = situation(G, sys, v, foe, t), fear = ai.fear, angered = stance(ai) === 'angered';
    var cornered = fear >= CORNERED_FEAR && !s.outrun && s.armed;
    var sc = {};
    sc.comply = b.comply * (0.6 + fear) * (1.2 - 0.6 * d.greed) * (s.armed ? 0.8 : 1.2) * (s.law ? 0.7 : 1);
    sc.dump = s.cargo ? b.dump * (0.7 + 0.5 * fear) * (0.7 + 0.6 * d.greed) * (s.outrun ? 1.3 : 0.9) : 0;
    /* A dump buys off a robber, not you - you are asking her to strike. */
    if (!foe) sc.dump = 0;
    sc.flee = b.flee * (s.outrun ? 1.5 : 0.5) * (0.5 + fear) * (s.law ? 1.6 : 1) * (0.6 + 0.6 * d.greed) * (0.5 + 0.5 * s.hull);
    sc.fight = s.armed ? b.fight * (2 * s.odds) * (0.4 + d.nerve) * (angered ? 1.5 : 1) * (0.6 + 0.4 * d.greed) * (0.4 + 0.6 * s.hull) : 0;
    if (cornered) sc.fight *= CORNERED_LIFT;
    sc.surrender = b.surrender * (1 - s.hull) * 2 * (0.4 + fear) * (1.2 - d.nerve) * (angered ? 0.5 : 1);
    /* A seeded hair, so ties break the same way every time. */
    var key = v.id + '|' + (foe ? foe.id : 'you') + '|' + why;
    VERBS.forEach(function (k) { if (sc[k] > 0) sc[k] += 0.02 * (wobble(G && G.seed, key, k) + 1); });
    return { role: role, scores: sc, situation: s, cornered: cornered, fear: fear, angered: angered };
  }
  /* The best answer, sticky under fire. */
  function choose(G, sys, v, foe, why, t) {
    var r = civilScores(G, sys, v, foe, why, t);
    if (!r) return null;
    var best = null;
    VERBS.forEach(function (k) { if (r.scores[k] > 0 && (!best || r.scores[k] > r.scores[best])) best = k; });
    if (!best) best = 'flee';
    var prev = v._choice;
    if (why === 'hit' && prev && prev.why === 'hit' && t - prev.at < HOLD_S && prev.verb !== best &&
        !(r.scores[best] > STICKY * (r.scores[prev.verb] || 0))) best = prev.verb;
    v._choice = { verb: best, why: why, at: prev && prev.verb === best && prev.why === why ? prev.at : t, scores: r.scores,
                  cornered: r.cornered };
    return { verb: best, scores: r.scores, situation: r.situation, cornered: r.cornered };
  }
  /* For combat.js: how much more (or less) likely she is to strike to you
   * than the old table says - frightened more, angered less. A calm crew
   * is exactly the old table (1), so asking a ship nobody has fired on
   * is no harder than it was. */
  function strikeFactor(G, sys, v, t) {
    if (!civilRole(v)) return 1;
    var ai = settle(aiOf(G, sys, v), t);
    return (1 + 0.6 * ai.fear) * (stance(ai) === 'angered' ? 0.6 : 1);
  }

  /* ==== OPPORTUNISTS (2026-11-22) ========================================
   * Astra: "is there a way for a non-pirate NPC to turn pirate if a juicy
   * enough target passes?" - armed traders and Syndicate runners, she
   * chose, and afterwards the trader goes back to her lane, marked.
   *
   * Who can be tempted. A trader only if she is BENT (probity under 0.4)
   * and greedy (0.5 or more): an honest captain does not, however rich the
   * hull beside her. How hard she is tempted rises as her probity falls
   * below the bent line, so a barely-bent captain needs a fortune and a
   * rotten one needs only a chance. A runner already flies for the mob;
   * her probity only tempers her greed.
   *
   * What makes a prize juicy. Not its price in the abstract: what it is
   * worth against what she is risking, her own hold (with a floor, so an
   * empty hull is not tempted by a sack of grain). Read on a log scale,
   * because holds run from nothing to seven figures (measured across 20
   * kawartha systems: median 1.8 k, 90th centile 76 k, 99th 695 k): five
   * times her own is the start of interest, fifty times is all of it.
   * Under JUICY_MIN credits nothing is juicy.
   *
   * Then how soft it is (an unarmed hull 1, an armed one she can still
   * take 0.5, one tougher than her is never chosen), and whether the law
   * is watching - a trader never turns under a cop's eye; a runner, whose
   * papers are paid for, only rarely. The result is in 0..1; aggression.js
   * rolls it against a seeded bar once per leg. */
  var JUICY_MIN = 20000;          // credits: below this, no hold is worth turning for
  var OWN_FLOOR = 5000;           // her own stake never counts for less than this
  var TEMPT_GREED = 0.5;          // a trader under this greed does not turn
  /* Juice ramps from five times her own stake (log 0.7) to fifty (1.7).
   * Tried first at ten to a hundred: a 100 k hold tempted a bent captain
   * 6% a leg and a 30 k one never, which is a mechanic nobody would meet. */
  var JUICE_FROM = 0.7, JUICE_SPAN = 1.0;
  function tempted(d, runner) {
    if (!d) return 0;
    if (runner) return d.greed * (0.6 + 0.4 * (1 - d.probity));
    if (d.probity >= BENT || d.greed < TEMPT_GREED) return 0;
    return d.greed * (1 - d.probity / BENT);
  }
  function juice(prize, own) {
    if (!(prize >= JUICY_MIN)) return 0;
    var r = Math.log(prize / Math.max(OWN_FLOOR, own || 0)) / Math.LN10;   // decades richer
    return Math.max(0, Math.min(1, (r - JUICE_FROM) / JUICE_SPAN));
  }
  function temptation(d, ctx) {
    var a = tempted(d, ctx && ctx.runner);
    if (!(a > 0)) return 0;
    var j = juice(ctx.prize, ctx.own);
    if (!(j > 0)) return 0;
    var soft = ctx.soft === undefined ? 1 : ctx.soft;
    var law = ctx.law ? (ctx.runner ? 0.3 : 0) : 1;
    return Math.max(0, Math.min(1, a * j * soft * law));
  }

  var ShipAI = {
    /* opportunists */
    JUICY_MIN: JUICY_MIN, OWN_FLOOR: OWN_FLOOR, TEMPT_GREED: TEMPT_GREED,
    tempted: tempted, juice: juice, temptation: temptation,
    /* slice 3 */
    CIVIL_BASE: CIVIL_BASE, CORNERED_FEAR: CORNERED_FEAR, CORNERED_LIFT: CORNERED_LIFT, HOLD_S: HOLD_S,
    STICKY: STICKY, DUMP_TAKE: DUMP_TAKE, VERBS: VERBS,
    civilRole: civilRole, situation: situation, civilScores: civilScores, choose: choose, strikeFactor: strikeFactor,
    ROLES: ROLES, BASE: BASE, TEMPER: TEMPER, PULL: PULL, PULL_PIVOT: PULL_PIVOT,
    PROBITY_BY_VALUES: PROBITY_BY_VALUES, BENT: BENT,
    roleOf: roleOf, dials: dials, dialsFor: dialsFor, corruptionOf: corruptionOf,
    /* slice 2 */
    MOOD_EVENTS: MOOD_EVENTS, FEAR_HALF_S: FEAR_HALF_S, ANGER_HALF_MIN_S: ANGER_HALF_MIN_S,
    ANGER_HALF_SPAN_S: ANGER_HALF_SPAN_S, SCARED: SCARED, ANGRY: ANGRY, BREAK_MARGIN: BREAK_MARGIN,
    FLIGHT_KM: FLIGHT_KM, FLIGHT_EVERY_S: FLIGHT_EVERY_S, SCATTER_S: SCATTER_S,
    SUCCEED_COHESION: SUCCEED_COHESION, DEFEND_KM: DEFEND_KM, SYNDICATE_ANSWER_KM: SYNDICATE_ANSWER_KM, RANK: RANK,
    aiOf: aiOf, feel: feel, settle: settle, stance: stance, moodOf: moodOf, breaks: breaks, runHull: runHull,
    fearHalf: fearHalf, angerHalf: angerHalf, powerOf: powerOf, threatOn: threatOn,
    orgOf: orgOf, rankOf: rankOf, flightOf: flightOf, matesOf: matesOf, formFlights: formFlights,
    succession: succession, onHit: onHit, onPlayerHit: onPlayerHit, onKill: onKill,
    onRobbed: onRobbed, onRefused: onRefused, tick: tick
  };
  global.ShipAI = ShipAI;
  if (typeof module !== 'undefined' && module.exports) module.exports = ShipAI;
})(typeof window !== 'undefined' ? window : globalThis);
