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

  var ShipAI = {
    ROLES: ROLES, BASE: BASE, TEMPER: TEMPER, PULL: PULL, PULL_PIVOT: PULL_PIVOT,
    PROBITY_BY_VALUES: PROBITY_BY_VALUES, BENT: BENT,
    roleOf: roleOf, dials: dials, dialsFor: dialsFor, corruptionOf: corruptionOf
  };
  global.ShipAI = ShipAI;
  if (typeof module !== 'undefined' && module.exports) module.exports = ShipAI;
})(typeof window !== 'undefined' ? window : globalThis);
