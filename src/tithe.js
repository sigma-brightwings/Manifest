/* tithe.js — the overboss's tithe (2026-10-26).
 *
 * Astra: "why don't we incorporate bribes into the system; in Syndicate
 * controlled systems, paying a tithe to the overboss or whatever is a great
 * way to show you're not Navy or Police."
 *
 * Asked, she chose:
 *   - BOTH ways to pay: the overboss's collector hails you when you arrive
 *     in a hold (pay / haggle / refuse), and a fixer in a Syndicate port's
 *     bar takes it too.
 *   - Paying buys ALL of: their patrols and their pirates leave you alone
 *     here; a little standing with the Syndicate; their ports and grey
 *     market trust you as if you stood higher with them; and better prices
 *     at their ports.
 *   - Refusing marks you SUSPECTED of being Navy or Police in that system:
 *     their patrols scan you more, and their pirates treat you as fair game
 *     (they do not back off when a patrol is near).
 *   - And the law does not hold it against you. In her words: "Even the
 *     lawful empires treat the Syndicate as better than pirates, but worse
 *     than civilians. It's well known that they tax travellers in their
 *     space, and the general advice is to pay the tithe and keep problems
 *     from following you back to your home port." So nothing here touches a
 *     lawful faction's standing or record.
 *
 * WHAT A TITHE IS GOOD FOR. One system, for a week of game time
 * (PAID_DAYS). Come back after that and the collector calls again. A
 * refusal stands for the same week, and the way out of it is to pay, late
 * and at a premium, on the channel or to a fixer.
 *
 * Pure state on G (`G.tithe`, saved). main.js asks `onArrive` when you drop
 * into a system, puts the collector on the comms list, sets `sys.tithe` for
 * Sim to read, and adjusts market rows. combat.js reads `standingBonus` at
 * the Syndicate's own doors and `suspected` at a scan. */
(function (global) {
  'use strict';

  var DAY = 86400;
  var PAID_DAYS = 7;              // a tithe covers one system for a week
  var SUSPECT_DAYS = 7;           // and a refusal stands as long
  var SILENCE_S = 600;            // ignore the collector this long and that is your answer
  var BASE = 150;                 // cr, before the hull and the hold
  var BY_SIZE = { S: 0, M: 120, L: 300, XL: 800 };
  var CARGO_CUT = 0.03;           // of what the hold is worth at base prices
  var LATE = 1.25;                // paying after you refused
  var HAGGLE_WIN = 0.7;           // what a good haggle leaves you paying
  var HAGGLE_LOSE = 1.2;          // what a bad one adds
  var STANDING_GAIN = 2;          // with the Syndicate, per tithe paid
  var TRUST_BONUS = 15;           // standing their doors read you at, while paid
  var PRICE_EDGE = 0.05;          // 5% off what you buy, 5% on what you sell, at their ports
  var SUSPECT_SEARCH = 0.9;       // a suspected ship is searched at least this often

  function hash(s) {
    var R = global.RNG;
    if (R && R.hashString) return R.hashString(String(s)) >>> 0;
    var h = 2166136261;
    s = String(s);
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  /* A Syndicate hold: the system the overboss runs. */
  /* The Syndicate's tithe, so the Syndicate's holds: a pirate band's space
   * (heldBy 'pirate', 2026-10-31) is lawless, not taxed. */
  function held(sys) { return !!(sys && sys.pirateHeld && sys.heldBy !== 'pirate'); }

  function book(G) {
    if (!G.tithe || typeof G.tithe !== 'object') G.tithe = {};
    return G.tithe;
  }
  function entry(G, starId, make) {
    var b = book(G);
    if (!b[starId] && make) b[starId] = {};
    return b[starId] || null;
  }
  function starIdOf(G) { return G && G.here ? G.here.id : null; }

  /* The captain's log on the F5 NOTES tab (journal.js), when it is loaded.
   * Required directly under node, where the tests may not have loaded it. */
  function jot(G, kind, text) {
    var J = global.Journal;
    if (!J && typeof require !== 'undefined') { try { J = require('./journal.js'); } catch (e) { J = null; } }
    if (J && G) J.add(G, kind, text);
  }

  /* Whose collector is calling, by name. */
  function bossName(G) {
    var f = G && G.galaxy && G.galaxy.factionById && G.galaxy.factionById.outlaw;
    return (f && f.name) || 'the Syndicate';
  }

  function cargoWorth(G) {
    var Eco = global.Economy, cargo = (G.ship && G.ship.cargo) || {}, sum = 0;
    for (var cid in cargo) {
      var c = Eco && Eco.BY_ID && Eco.BY_ID[cid];
      if (c && c.base > 0 && cargo[cid] > 0) sum += c.base * cargo[cid];
    }
    return sum;
  }
  function sizeOf(G) {
    var C = global.Combat, h = C && C.HULLS && G.ship && C.HULLS[G.ship.hullId];
    return (h && h.size) || 'S';
  }

  /* What the overboss asks of this ship, today. A friend of the Syndicate
   * pays less; someone they dislike pays more. Rounded to tens, because a
   * collector does not count coppers. */
  function quote(G) {
    var st = (G.standing && G.standing.outlaw) || 0;
    var raw = BASE + (BY_SIZE[sizeOf(G)] || 0) + CARGO_CUT * cargoWorth(G);
    var mul = st >= 50 ? 0.5 : st >= 15 ? 0.8 : st <= -50 ? 1.6 : st <= -15 ? 1.25 : 1;
    return Math.max(50, Math.round(raw * mul / 10) * 10);
  }

  /* Where you stand with the overboss in this system right now:
   *   'paid'      — tithed and inside the week;
   *   'suspected' — refused, or ignored the call, inside the week;
   *   'asked'     — the collector has called and is waiting;
   *   null        — nothing between you, or not a hold. */
  function status(G, sys, t) {
    if (!held(sys)) return null;
    var e = entry(G, starIdOf(G), false);
    if (!e) return null;
    t = t || 0;
    if (e.paidUntil && t < e.paidUntil) return 'paid';
    if (e.suspectUntil && t < e.suspectUntil) return 'suspected';
    if (e.asked != null && !e.answered) return 'asked';
    return null;
  }
  function paid(G, sys, t) { return status(G, sys, t) === 'paid'; }
  function suspected(G, sys, t) { return status(G, sys, t) === 'suspected'; }

  /* The price on the table: a fresh quote, a haggled one, or the late
   * price after a refusal. */
  function owed(G, sys, t) {
    var e = entry(G, starIdOf(G), false);
    var q = e && e.quote ? e.quote : quote(G);
    if (status(G, sys, t) === 'suspected') q = Math.round(q * LATE / 10) * 10;
    return q;
  }

  /* You have dropped into a system. A hold you have not paid for this week
   * calls you. Returns the line the collector says, or null. */
  function onArrive(G, sys, t) {
    if (!held(sys) || !G.here) return null;
    var s = status(G, sys, t);
    if (s === 'paid') return { say: bossName(G) + ' collector: "Your mark is good here for another ' +
                                  Math.max(1, Math.ceil((entry(G, G.here.id).paidUntil - t) / DAY)) + ' days. Fly safe."' };
    if (s === 'suspected') return { say: bossName(G) + ' collector: "We remember you. Pay up or watch your back."  (F4 to answer)' };
    var e = entry(G, G.here.id, true);
    e.asked = t; e.answered = false; e.haggled = false; e.quote = quote(G);
    return { say: bossName(G) + ' collector: "Welcome to the overboss\'s space. Travellers tithe ' +
                  e.quote.toLocaleString() + ' cr. Pay and you will not be troubled."  (F4 to answer)', asked: true };
  }

  /* Every frame or so: an unanswered call becomes a refusal after a while. */
  function tick(G, sys, t) {
    if (!held(sys) || !G.here) return null;
    var e = entry(G, G.here.id, false);
    if (!e || e.asked == null || e.answered) return null;
    if (t - e.asked < SILENCE_S) return null;
    markRefused(G, e, t);
    return { say: bossName(G) + ' collector: "No answer. We will take that as one."' };
  }

  function markRefused(G, e, t) {
    e.answered = true; e.refused = t; e.suspectUntil = t + SUSPECT_DAYS * DAY;
    e.paidUntil = 0;
  }

  /* Pay, from the comms channel or a fixer. `how`: 'channel' | 'fixer'. */
  function pay(G, sys, t, how) {
    if (!held(sys)) return { ok: false, why: 'the overboss does not hold this system' };
    if (status(G, sys, t) === 'paid') return { ok: false, why: 'you have paid this week' };
    var cost = owed(G, sys, t);
    if (!G.ship || G.ship.credits < cost) return { ok: false, why: 'the tithe is ' + cost + ' cr — you have ' + Math.round((G.ship && G.ship.credits) || 0), cost: cost };
    var wasSuspected = status(G, sys, t) === 'suspected';
    G.ship.credits -= cost;
    var e = entry(G, G.here.id, true);
    e.answered = true; e.paid = t; e.paidUntil = t + PAID_DAYS * DAY;
    e.suspectUntil = 0; e.quote = null;
    e.times = (e.times || 0) + 1;
    G.standing = G.standing || {};
    G.standing.outlaw = Math.max(-100, Math.min(100, (G.standing.outlaw || 0) + STANDING_GAIN));
    jot(G, 'tithe', 'Paid ' + bossName(G) + '\'s tithe' + (how === 'fixer' ? ' to a fixer' : '') +
        (wasSuspected ? ', late' : '') + ': ' + cost + ' cr, good for a week here');
    var line = how === 'fixer'
      ? (wasSuspected ? 'Late, but paid. I will let them know you are not who they thought.' : 'Paid. I will see the overboss hears your name the right way.')
      : bossName(G) + ' collector: "' + (wasSuspected ? 'Better late. We will stop looking at you.' : 'Received. Nobody here will trouble you this week.') + '"';
    return { ok: true, paid: cost, say: line + '  (' + cost + ' cr)' };
  }

  /* Haggle, once per call. Seeded by the system and the day, so asking
   * again after a reload gets the same answer. */
  function haggle(G, sys, t) {
    if (!held(sys)) return { ok: false, why: 'nobody here to haggle with' };
    var s = status(G, sys, t);
    if (s === 'paid') return { ok: false, why: 'you have paid this week' };
    if (s === 'suspected') return { ok: false, why: 'they are past haggling with you' };
    var e = entry(G, G.here.id, true);
    if (!e.quote) e.quote = quote(G);
    if (e.haggled) return { ok: false, why: 'you have haggled once already' };
    e.haggled = true;
    var st = (G.standing && G.standing.outlaw) || 0;
    var chance = Math.max(0.1, Math.min(0.8, 0.4 + st / 200));
    var roll = (hash(G.here.id + ':' + Math.floor(t / DAY) + ':haggle') % 1000) / 1000;
    var name = bossName(G) + ' collector';
    if (roll < chance) {
      e.quote = Math.max(50, Math.round(e.quote * HAGGLE_WIN / 10) * 10);
      return { ok: true, won: true, quote: e.quote, say: name + ': "Fine. ' + e.quote.toLocaleString() + ', because you asked nicely. Do not make a habit of it."' };
    }
    e.quote = Math.round(e.quote * HAGGLE_LOSE / 10) * 10;
    return { ok: true, won: false, quote: e.quote, say: name + ': "Now it is ' + e.quote.toLocaleString() + '. Keep talking."' };
  }

  /* Haggling is open once per call, before you have answered it. */
  function canHaggle(G, sys, t) {
    var s = status(G, sys, t);
    if (!held(sys) || s === 'paid' || s === 'suspected') return false;
    var e = entry(G, starIdOf(G), false);
    return !(e && e.haggled);
  }

  function refuse(G, sys, t) {
    if (!held(sys)) return { ok: false, why: 'nobody here asking' };
    var s = status(G, sys, t);
    if (s === 'paid') return { ok: false, why: 'you have already paid' };
    if (s === 'suspected') return { ok: false, why: 'you have already refused' };
    var e = entry(G, G.here.id, true);
    markRefused(G, e, t);
    jot(G, 'tithe', 'Refused ' + bossName(G) + '\'s tithe. They will be watching');
    return { ok: true, say: bossName(G) + ' collector: "Only the law refuses the overboss. We will be watching you."' };
  }

  /* Read by the Syndicate's own doors (combat.js): standing with `outlaw`
   * as they see it here. */
  function standingBonus(G, sys, t) { return paid(G, sys, t) ? TRUST_BONUS : 0; }

  /* A market row, as a port the Syndicate holds quotes it to a ship that
   * has paid. Returns a new row; the port's own book is not touched. */
  function adjustRow(G, sys, port, row, t) {
    if (!row || !port || (port.faction || '') !== 'outlaw' || !paid(G, sys, t)) return row;
    var out = {};
    for (var k in row) out[k] = row[k];
    if (typeof out.buy === 'number' && out.buy > 0) out.buy = out.buy * (1 - PRICE_EDGE);
    if (typeof out.sell === 'number' && out.sell > 0) out.sell = out.sell * (1 + PRICE_EDGE);
    out.tithed = true;
    return out;
  }

  /* What the collector's channel shows next to its name. */
  function channelNote(G, sys, t) {
    var s = status(G, sys, t), e = entry(G, starIdOf(G), false);
    if (s === 'paid') return 'tithe paid — ' + Math.max(1, Math.ceil((e.paidUntil - t) / DAY)) + ' days left';
    if (s === 'suspected') return 'SUSPECTED — ' + owed(G, sys, t) + ' cr to clear it';
    return owed(G, sys, t) + ' cr asked';
  }

  var Tithe = {
    PAID_DAYS: PAID_DAYS, SUSPECT_DAYS: SUSPECT_DAYS, SILENCE_S: SILENCE_S, TRUST_BONUS: TRUST_BONUS,
    PRICE_EDGE: PRICE_EDGE, SUSPECT_SEARCH: SUSPECT_SEARCH, STANDING_GAIN: STANDING_GAIN,
    held: held, quote: quote, owed: owed, status: status, paid: paid, suspected: suspected,
    onArrive: onArrive, tick: tick, pay: pay, haggle: haggle, canHaggle: canHaggle, refuse: refuse,
    standingBonus: standingBonus, adjustRow: adjustRow, channelNote: channelNote, bossName: bossName
  };
  global.Tithe = Tithe;
  if (typeof module !== 'undefined' && module.exports) module.exports = Tithe;
})(typeof window !== 'undefined' ? window : globalThis);
