/* licence.js - a licence to found a station (2026-10-31).
 *
 * Founding a station from a Crawler (construction.js) needs a licence for
 * the system it stands in. Astra chose to build the licence with the first
 * slice of founding, as claude/mining-and-survey.md has it: the system's
 * government issues it, gated on standing, and the Syndicate sells forged
 * ones that work until somebody checks.
 *
 *   WHO ISSUES IT. A system's government: its galactic owner, on the
 *   police channel. In a Syndicate hold the Syndicate IS the government,
 *   and sells it on the collector's channel. In a pirate band's space
 *   nobody issues one and nobody asks: there is no law to license you.
 *
 *   THE GATE. Standing WARM (10+) with the issuer, and the fee: a week of a
 *   mid-tier ship's price, scaled by how developed the system is.
 *
 *   A FORGED LICENCE is a blank bought in a Syndicate hold, for a third of
 *   a real one and no questions, filled in for whatever system you found
 *   in. It is checked: once when the founding starts, then weekly. The
 *   odds of a check go with how clean the system is - a corrupt one rarely
 *   looks. CAUGHT is slow and loud: a notice, and a week to pay the real
 *   fee (if your standing lets you); after that the station is seized.
 *   Seizure itself is the station's business (stations.js); this file
 *   says only that it is due.
 *
 * Saved: G.licences (by star id), G.forgedBlanks.
 */
(function (global) {
  'use strict';

  var DAY = 86400;
  var BASE = 60000;               // cr, at development 0.4
  var STANDING_NEED = 10;         // WARM
  var FORGED_SHARE = 0.35;        // a forgery's price, of the real thing
  var CHECK_EVERY = 7 * DAY;
  var CHECK_ODDS = 0.35;          // a check, a week, in a spotless system
  var GRACE = 7 * DAY;            // caught: a week to pay the real fee

  function starIdOf(sys) { return sys && (sys.starId || sys.id); }

  /* Who issues a licence here, or null where nobody does. */
  function issuer(sys) {
    if (!sys || sys.empty) return null;
    if (sys.heldBy === 'pirate') return null;
    if (sys.heldBy === 'syndicate') return 'outlaw';
    var f = (sys.factions || [])[0];
    return f ? f.id : null;
  }
  function needed(sys) { return !!issuer(sys); }

  function price(sys) {
    var dev = (sys && sys.development !== undefined) ? sys.development : 0.4;
    var p = BASE * (0.6 + dev);
    if (sys && sys.heldBy === 'syndicate') p *= 1.2;       // the overboss's cut
    return Math.round(p / 100) * 100;
  }
  function forgedPrice() { return Math.round(BASE * FORGED_SHARE / 100) * 100; }

  function rec(G, sys) { return (G.licences || {})[starIdOf(sys)] || null; }
  /* Licensed to found here: a licence, or nobody to ask. */
  function holds(G, sys) { return !needed(sys) || !!rec(G, sys); }

  function standingWith(G, fac) { return (G.standing && G.standing[fac]) || 0; }
  function marked(G, fac) { return !!(G.marks && G.marks[fac]); }

  function refusal(G, sys) {
    var fac = issuer(sys);
    if (!fac) return 'nobody here issues one - there is no law to license you';
    var r = rec(G, sys);
    if (r && !r.forged) return 'you already hold one here';
    if (marked(G, fac)) return 'they do not license pirates';
    if (standingWith(G, fac) < STANDING_NEED) return 'standing WARM (' + STANDING_NEED + '+) needed - you are at ' + Math.round(standingWith(G, fac));
    if ((G.ship.credits || 0) < price(sys)) return price(sys) + ' cr - you have ' + Math.round(G.ship.credits || 0);
    return null;
  }

  function say(hooks, m, s) { if (hooks && hooks.say) hooks.say(m, s || 6); }

  /* Buy the real thing, or regularise a forgery that has been caught. */
  function buy(G, sys, t, hooks) {
    var why = refusal(G, sys);
    if (why) return { ok: false, why: why };
    var p = price(sys), id = starIdOf(sys);
    G.ship.credits -= p;
    G.licences = G.licences || {};
    var old = G.licences[id];
    G.licences[id] = { fac: issuer(sys), forged: false, at: t, paid: p };
    if (old && old.forged && old.caught) say(hooks, 'Licence regularised - ' + p + ' cr. The inspector files it and forgets the rest.', 7);
    else say(hooks, 'Station licence granted for this system - ' + p + ' cr', 6);
    return { ok: true, paid: p };
  }

  /* A blank, in a Syndicate hold. */
  function forgeRefusal(G, sys) {
    if (!sys || sys.heldBy !== 'syndicate') return 'only sold in a Syndicate hold';
    if (marked(G, 'outlaw')) return 'the Syndicate does not deal with you';
    if ((G.ship.credits || 0) < forgedPrice()) return forgedPrice() + ' cr - you have ' + Math.round(G.ship.credits || 0);
    return null;
  }
  function buyForged(G, sys, t, hooks) {
    var why = forgeRefusal(G, sys);
    if (why) return { ok: false, why: why };
    G.ship.credits -= forgedPrice();
    G.forgedBlanks = (G.forgedBlanks || 0) + 1;
    say(hooks, 'A blank licence, seals and all - ' + forgedPrice() + ' cr. It reads as real until somebody checks.', 7);
    return { ok: true, paid: forgedPrice() };
  }

  /* Founding here: a real licence, nobody to ask, or a blank filled in.
   * Returns the record founding goes ahead under, or a refusal. */
  function forFounding(G, sys, t, hooks) {
    if (!needed(sys)) return { ok: true, none: true };
    var r = rec(G, sys);
    if (r) return { ok: true, rec: r };
    if ((G.forgedBlanks || 0) > 0) {
      G.forgedBlanks--;
      G.licences = G.licences || {};
      r = G.licences[starIdOf(sys)] = { fac: issuer(sys), forged: true, at: t, nextCheck: t };
      say(hooks, 'A forged licence goes in with the founding papers.', 5);
      return { ok: true, rec: r, forged: true };
    }
    return { ok: false, why: 'no licence for this system - ' + (refusal(G, sys) || 'buy one on the police channel') };
  }

  function checkOdds(G, sys) {
    var C = global.Combat;
    var corr = C && C.systemCorruption ? C.systemCorruption(G, sys) : (sys.corruption || 50);
    return CHECK_ODDS * Math.max(0.05, 1 - corr / 100);
  }

  /* The weekly look at a forgery. `roll` is a 0..1 draw, the caller's (so
   * a test can pin it); a seeded one by default. Returns 'ok', 'caught',
   * 'due' (caught, unpaid, out of time) or null when there is nothing to
   * check. */
  function tick(G, sys, t, hooks, roll) {
    var r = rec(G, sys);
    if (!r || !r.forged) return null;
    if (r.caught) {
      if (t >= r.dueBy) return 'due';
      return 'caught';
    }
    if (t < (r.nextCheck || 0)) return 'ok';
    r.nextCheck = t + CHECK_EVERY;
    var R = typeof roll === 'number' ? roll : seeded(G, sys, t);
    if (R >= checkOdds(G, sys)) return 'ok';
    r.caught = true;               // a flag, not the time: t can be 0
    r.caughtAt = t;
    r.dueBy = t + GRACE;
    var p = price(sys);
    say(hooks, 'INSPECTION - your station licence here is forged. Pay the real fee (' + p +
        ' cr) within a week, on the police channel, or the station is seized.', 12);
    if (global.Journal && global.Journal.add) global.Journal.add(G, 'law', 'Forged licence found. Real fee ' + p + ' cr due within 7 days or seizure');
    return 'caught';
  }
  function seeded(G, sys, t) {
    var RNG = global.RNG;
    if (!RNG || !RNG.hashString) return Math.random();
    return (RNG.hashString('licence|' + (G.seed || '') + '|' + starIdOf(sys) + '|' + Math.floor(t / CHECK_EVERY)) % 10000) / 10000;
  }

  var Licence = {
    DAY: DAY, BASE: BASE, STANDING_NEED: STANDING_NEED, CHECK_EVERY: CHECK_EVERY, GRACE: GRACE,
    issuer: issuer, needed: needed, price: price, forgedPrice: forgedPrice,
    rec: rec, holds: holds, refusal: refusal, buy: buy,
    forgeRefusal: forgeRefusal, buyForged: buyForged, forFounding: forFounding,
    checkOdds: checkOdds, tick: tick
  };
  global.Licence = Licence;
  if (typeof module !== 'undefined' && module.exports) module.exports = Licence;
})(typeof window !== 'undefined' ? window : globalThis);
