/* intel.js - what a secret is worth, and who will pay for it (2026-11-10).
 *
 * Astra, on what finding a black site should be good for: *"Sell the
 * location. You can go there and trade. Missions key off it."* This file
 * is the first of those three.
 *
 * WHAT A FIX IS. The coil writes a found installation into `G.found`
 * (survey.js runSweep): a key, the epoch you found it, and - since this
 * file - who owns it and what sort of place it is. That record is the
 * saleable thing. You are not selling the site; you are selling the fact
 * that you know where it is, which is a different commodity with a
 * different shelf life.
 *
 * THE THREE RULES THIS IS BUILT ON
 *
 *   1. ONLY SOMEBODY WHO WANTS IT PAYS FOR IT. A fix on a navy listening
 *      post is worth a great deal to that navy's rival, something to the
 *      Syndicate, very little to a neutral, and nothing at all to the
 *      people who built it - walking into their office to tell them where
 *      their own secret is only tells them you have been out there.
 *
 *   2. IT GOES OFF. A fix is worth what it is worth today. Rotations
 *      change, rosters change, and a two-year-old position is a story
 *      rather than a target: half-life of 150 days, floored at a quarter,
 *      because the orbit itself does not move.
 *
 *   3. SELLING IT TWICE IS HOW YOU GET CAUGHT. A fix sold once is a
 *      rumour with no source. Sold again - or sold to both sides of the
 *      same rivalry - it has a shape, and the shape is you. That is the
 *      whole risk model: the first sale is nearly safe and every one
 *      after it is less so, which makes "how much do I squeeze out of
 *      this" an actual decision rather than a button.
 *
 * Nothing here spawns anything or moves anything. It reads what the coil
 * already found, prices it, and books the consequences.
 */
(function (global) {
  'use strict';

  var RNG = global.RNG;

  /* What each sort of place is worth to somebody who wants it, before
   * staleness and before who is buying. A listening post is the prize:
   * it is the one whose whole value is that nobody knows it is there. */
  var BASE = { listening: 44000, works: 32000, cache: 27000 };
  var BASE_DEFAULT = 30000;

  var HALF_LIFE_DAYS = 150;
  var STALE_FLOOR = 0.25;
  var DAY = 86400;

  /* Who is buying, as a share of what it is worth. */
  var RIVAL = 1.0;          // a rival of the people who built it
  var OUTLAW = 0.75;        // the Syndicate buys anybody's secrets
  var NEUTRAL = 0.3;        // a neutral will take it, and will not pay for it
  var RESALE = 0.3;         // the second time you sell the same fix
  var SYN_BERTH = 1.3;      // a Syndicate berth inside an empire: evidence, not just a position

  /* How likely a sale is to come back on you, and what it costs when it
   * does. The first is nearly free; the count is what bites. */
  var BURN_BASE = 0.12;
  var BURN_PER_SALE = 0.22;
  var BURN_STANDING = 18;       // what the owner takes off you
  var CROSS_STANDING = 10;      // what the first buyer takes off, if you sold both sides

  /* ---- reading the found set --------------------------------------------
   * A career that found sites before this file existed stored a bare epoch
   * and nothing else. Those are kept and listed - they are real finds -
   * but a fix with no owner on it has nobody to sell it to, and the desk
   * says so rather than pretending. */

  function fixes(G) {
    var out = [];
    var found = (G && G.found) || {};
    for (var key in found) {
      if (!Object.prototype.hasOwnProperty.call(found, key)) continue;
      var v = found[key];
      var rec = (v && typeof v === 'object')
        ? { key: key, t: v.t || 0, fac: v.fac || null, kind: v.kind || null,
            liv: v.liv || null,
            name: v.name || null, star: v.star || null, starName: v.starName || null }
        : { key: key, t: v || 0, fac: null, kind: null, name: null,
            star: String(key).split(':')[0], starName: null };
      rec.sold = soldTo(G, key);
      out.push(rec);
    }
    out.sort(function (a, b) { return b.t - a.t; });
    return out;
  }

  function soldTo(G, key) {
    var r = G && G.intel && G.intel[key];
    return (r && r.sold) ? r.sold.slice() : [];
  }

  /* The power actually behind a flag. A navy and a syndicate band both
   * sit inside an empire (faction-hierarchy), and a secret kept by the
   * navy is the empire's secret - so rivalry is asked of the parent. */
  function topOf(galaxy, facId) {
    if (!galaxy || !facId) return facId || null;
    var by = galaxy.factionById || {};
    var seen = 0, id = facId;
    while (by[id] && by[id].parentId && seen++ < 8) id = by[id].parentId;
    return id;
  }

  function isOutlaw(galaxy, facId) {
    if (facId === 'outlaw') return true;
    var f = galaxy && galaxy.factionById ? galaxy.factionById[facId] : null;
    return !!(f && f.outlaw);
  }

  /* ---- who would buy, and for how much ----------------------------------- */

  /* Why this desk will or will not take it, in words. Null means they will.
   * Every refusal here is a sentence the player can act on. */
  function refusal(G, galaxy, fix, port) {
    if (!fix) return 'nothing to sell';
    if (!port || !port.faction) return 'no desk here that buys this sort of thing';
    if (!fix.fac) return 'your log has the position but not whose it is - sweep it again';
    var mine = topOf(galaxy, port.faction), theirs = topOf(galaxy, fix.fac);
    /* THE SYNDICATE IS ONE ORGANIZATION ACROSS THE MAP, however many
     * bands fly their own colours (galaxy.js places its caches under a
     * bare 'outlaw' flag). A band will not buy a cache from you: it is
     * already theirs, and you have just told them you were out there. */
    var runBySyn = fix.liv === 'syn' || isOutlaw(galaxy, theirs);
    if (mine === theirs || (isOutlaw(galaxy, mine) && runBySyn)) {
      return 'this is theirs - telling them where it is only tells them you were out there';
    }
    var route = routeOf(G, fix.key);
    if (route === 'watch') return 'you are under contract to watch this one';
    if (route === 'walkin') return 'you are under contract to walk into this one';
    var sold = fix.sold || [];
    for (var i = 0; i < sold.length; i++) {
      if (topOf(galaxy, sold[i]) === mine) return 'you already sold this one to them';
    }
    return null;
  }

  function staleness(fix, t) {
    var days = Math.max(0, (t - (fix.t || 0)) / DAY);
    return Math.max(STALE_FLOOR, Math.pow(0.5, days / HALF_LIFE_DAYS));
  }

  function areRivals(galaxy, a, b) {
    var Gx = global.Galaxy;
    if (Gx && Gx.rivalsOf) return Gx.rivalsOf(galaxy, a, b);
    return !!(galaxy && galaxy.rivals && a && b && a !== b &&
              galaxy.rivals[a] && galaxy.rivals[a][b]);
  }

  function buyerShare(galaxy, fix, port) {
    var mine = topOf(galaxy, port.faction), theirs = topOf(galaxy, fix.fac);
    if (isOutlaw(galaxy, port.faction) || isOutlaw(galaxy, mine)) return OUTLAW;
    if (areRivals(galaxy, mine, theirs)) return RIVAL;
    return NEUTRAL;
  }

  function priceOf(G, galaxy, fix, port, t) {
    if (refusal(G, galaxy, fix, port)) return 0;
    var base = BASE[fix.kind] || BASE_DEFAULT;
    /* A berth the Syndicate runs inside somebody's space is evidence as
     * well as a position, and a flag that has been letting it happen
     * pays to have the proof in hand. */
    if (fix.liv === 'syn') base *= SYN_BERTH;
    var cr = base * buyerShare(galaxy, fix, port) * staleness(fix, t);
    if ((fix.sold || []).length) cr *= RESALE;
    /* A jitter the desk cannot be shopped out of: seeded on the fix, the
     * desk and the fortnight, so walking out and back in does not re-roll
     * the offer, and a week later it is a different number. */
    var r = new RNG('intel|' + fix.key + '|' + port.id + '|' + Math.floor(t / (14 * DAY)));
    return Math.round(cr * r.range(0.9, 1.15));
  }

  /* Everything a desk would show, for every fix a career holds. The UI
   * asks for this once and draws it; nothing here changes anything. */
  function offersAt(G, galaxy, port, t) {
    return fixes(G).map(function (fix) {
      var why = refusal(G, galaxy, fix, port);
      return { fix: fix, why: why, price: why ? 0 : priceOf(G, galaxy, fix, port, t),
               stale: staleness(fix, t), resale: (fix.sold || []).length > 0 };
    });
  }

  function best(G, galaxy, port, t) {
    var list = offersAt(G, galaxy, port, t).filter(function (o) { return o.price > 0; });
    list.sort(function (a, b) { return b.price - a.price; });
    return list[0] || null;
  }

  /* ---- selling ------------------------------------------------------------
   * The sale is the easy half. The half that matters is what it does to
   * the books afterwards. */

  function sell(G, galaxy, port, key, t, hooks) {
    var all = fixes(G), fix = null;
    for (var i = 0; i < all.length; i++) if (all[i].key === key) { fix = all[i]; break; }
    var why = refusal(G, galaxy, fix, port);
    if (why) return { ok: false, why: why };
    var cr = priceOf(G, galaxy, fix, port, t);
    if (!(cr > 0)) return { ok: false, why: 'they will not pay for this one' };

    G.ship.credits += cr;
    G.intel = G.intel || {};
    var rec = G.intel[key] || (G.intel[key] = { sold: [], t: t });
    var firstBuyer = rec.sold.length ? rec.sold[0] : null;
    rec.sold.push(port.faction);
    rec.t = t;

    /* The desk that bought it is pleased with you, in proportion to what
     * it paid - a cheap fix from a neutral buys a nod, a rival's listening
     * post buys a friend. */
    var M = global.Missions;
    var up = Math.max(2, Math.min(12, Math.round(cr / 5000)));
    if (M && M.bumpStanding) M.bumpStanding(G, port.faction, up);

    /* AND THEN THE RISK. A resale, or a sale to both sides of the same
     * rivalry, is not a roll: it has already happened to you. */
    var count = countSales(G, fix.fac);
    var certain = rec.sold.length > 1;
    var chance = Math.min(0.92, BURN_BASE + BURN_PER_SALE * (count - 1));
    var r = new RNG('burn|' + key + '|' + port.id + '|' + rec.sold.length);
    var burned = certain || r.chance(chance);

    var lines = [];
    if (burned) {
      if (M && M.bumpStanding) M.bumpStanding(G, fix.fac, -BURN_STANDING);
      lines.push(ownerName(galaxy, fix.fac) + ' knows who sold it');
      /* Selling the same position to two desks is the one that costs you
       * on BOTH sides: the first buyer paid for something nobody else was
       * supposed to have, and now somebody else has it. */
      if (firstBuyer && firstBuyer !== port.faction) {
        if (M && M.bumpStanding) M.bumpStanding(G, firstBuyer, -CROSS_STANDING);
        lines.push('and so does ' + ownerName(galaxy, firstBuyer));
      }
    }
    jot(G, (fix.name || 'An unlisted installation') + ' sold to ' +
           ownerName(galaxy, port.faction) + ' at ' + port.name + ': ' + cr + ' cr' +
           (burned ? ' - and it came back on you' : ''));
    if (hooks && hooks.say) {
      hooks.say((burned ? 'Sold - ' : 'Sold, quietly - ') + cr + ' cr' +
                (lines.length ? '. ' + lines.join(', ') + '.' : '.'), 7);
    }
    if (hooks && hooks.sound) hooks.sound(burned ? 'warn' : 'pay');
    return { ok: true, cr: cr, burned: burned, lines: lines, resale: !!firstBuyer };
  }

  /* How many fixes on this owner you have sold, ever. The count is what
   * makes the fourth sale dangerous and the first one nearly free. */
  function countSales(G, facId) {
    var n = 0, found = (G && G.found) || {}, intel = (G && G.intel) || {};
    for (var key in intel) {
      if (!Object.prototype.hasOwnProperty.call(intel, key)) continue;
      var f = found[key];
      var owner = (f && typeof f === 'object') ? f.fac : null;
      if (owner && owner === facId) n += (intel[key].sold || []).length;
    }
    return Math.max(1, n);
  }

  /* ---- the approach -------------------------------------------------------
   * Astra: "to spy for a rival empire on a secret installation for which
   * you have already obtained clearance, like being recruited on a station
   * while doing some other skullduggery shit..."
   *
   * Somebody finds you at a desk in a rival's space, because you have been
   * somewhere you should not have been and they keep track of hulls that
   * come back from the dark. What they offer is not one job but a fork,
   * and the fork is the point:
   *
   *   SELL IT       - take the money, walk away. Fastest, cheapest, and
   *                   the one that ends the story. Already above.
   *   WATCH IT      - go back, sit off it, and bring them a week of who
   *                   comes and goes. Pays about double a sale. Costs you
   *                   days, and sitting still near somebody's secret is
   *                   not free.
   *   WALK IN       - dock AT it on the clearance you already hold, and
   *                   tell them what the inside looks like. Pays most.
   *                   Needs the owner to think well enough of you to let
   *                   you through the door, which is the whole joke: you
   *                   have to be their friend to betray them properly.
   *
   * THEY ARE MUTUALLY EXCLUSIVE PER FIX, and taking one shuts the others.
   * A position you have sold is a position the buyer already has; there is
   * nothing left to watch it for. */

  var WATCH_HOURS = 60;                 // ship-hours on station to call it a watch
  var WATCH_KM = 90000;                 // how close is "sitting off it"
  /* Tuned by Astra, 2026-11-11: walking in used to pay 3.4x a sale, which
   * at the top end was a Kestrel for one job. It should pay a bit more
   * than watching, not a lot more - the prize is that you CAN do it, not
   * that it makes the rest of the game irrelevant. */
  var WATCH_MULT = 1.5;                 // of what the fix would have sold for
  var WALKIN_MULT = 2.0;
  var WALKIN_CLEARANCE = 25;            // standing with the owner that opens the door
  var INTEL_DEADLINE = 20 * 86400;

  var APPROACH_WHO = [
    'A woman who does not give a name buys your drink and knows your hull number.',
    'Somebody from the trade office asks for five minutes and is not from the trade office.',
    'A quiet man with a government haircut sits down opposite you.',
    'You are handed a chit with a berth number on it and nothing else.'
  ];

  /* What route, if any, this fix is already committed to. */
  function routeOf(G, key) {
    var r = G && G.intel && G.intel[key];
    if (r && r.route) return r.route;
    if (r && (r.sold || []).length) return 'sold';
    var list = (G && G.missions) || [];
    for (var i = 0; i < list.length; i++) {
      if ((list[i].type === 'watch' || list[i].type === 'walkin') && list[i].fixKey === key) {
        return list[i].type;
      }
    }
    return null;
  }

  /* The board pass. Appended last and in its own stream, like everything
   * else that depends on the career (fieldwork.js has the long note on
   * why the board cannot simply be dealt per career). */
  function boardAt(G, galaxy, port, sys, t, offers, ctxs) {
    if (!G || !port || !port.market || !RNG) return;
    var open = fixes(G).filter(function (f) {
      return !routeOf(G, f.key) && !refusal(G, galaxy, f, port);
    });
    if (!open.length) return;
    var win = Math.floor(t / (2 * 86400));
    var rng = new RNG('approach|' + port.id + '|' + win + '|' + (sys && sys.seed));
    if (!rng.chance(0.5)) return;
    var fix = open[rng.int(0, open.length - 1)];
    var worth = priceOf(G, galaxy, fix, port, t);
    if (!(worth > 0)) return;
    var where = fix.name || 'the installation you found';
    var who = rng.pick(APPROACH_WHO);

    offers.push({
      id: 'iw|' + port.id + '|' + win + '|w',
      type: 'watch', cid: null, tonnes: 0,
      from: port.id, fromName: port.name,
      toPortId: port.id, toName: port.name,
      faction: port.faction || null,
      fixKey: fix.key, siteId: siteIdOf(fix.key), siteName: where,
      ownerFac: fix.fac, starId: fix.star,
      hours: WATCH_HOURS,
      pay: Math.round(worth * WATCH_MULT),
      deadline: t - (t % (2 * 86400)) + INTEL_DEADLINE,
      core: 'watch ' + where + ' for a week',
      head: 'Sit off ' + where + ' and count the traffic',
      text: who + ' They do not want the position - they can buy that. They want ' +
            'to know who calls there. Hold station within ' + Math.round(WATCH_KM / 1000) +
            ',000 km of ' + where + ' for about ' + WATCH_HOURS +
            ' hours of ship time, then bring the log back here.'
    });
    ctxs.push({ fromPort: port, sys: sys });

    /* And the door, if the owner thinks well enough of you to open it. */
    var M = global.Missions;
    var st = M && M.standing ? M.standing(G, fix.fac) : 0;
    offers.push({
      id: 'iw|' + port.id + '|' + win + '|i',
      type: 'walkin', cid: null, tonnes: 0,
      from: port.id, fromName: port.name,
      toPortId: port.id, toName: port.name,
      faction: port.faction || null,
      fixKey: fix.key, siteId: siteIdOf(fix.key), siteName: where,
      ownerFac: fix.fac, starId: fix.star,
      needStanding: WALKIN_CLEARANCE,
      pay: Math.round(worth * WALKIN_MULT),
      deadline: t - (t % (2 * 86400)) + INTEL_DEADLINE,
      core: 'walk into ' + where + ' on your own clearance',
      head: 'Walk into ' + where + ' and come back out',
      text: 'The same people, with a better idea. You are welcome at ' +
            ownerName(galaxy, fix.fac) + ' berths' +
            (st >= WALKIN_CLEARANCE ? ' - they have checked' : ', or you will need to be') +
            '. Dock at ' + where + ' on that welcome, see what it is for, and tell us. ' +
            'They will let you in because they trust you. That is what we are buying.'
    });
    ctxs.push({ fromPort: port, sys: sys });

    for (var k = offers.length - 2; k < offers.length; k++) {
      var o = offers[k];
      if (!o || !o.head) continue;
      if (!o.desc) o.desc = o.text;
      o.text = o.head;
      delete o.head;
    }
  }

  /* What the row should say it costs you. Neither of these takes an ounce
   * of hold; what they take is days, and a relationship. */
  function demand(o) {
    if (!o) return null;
    if (o.type === 'watch') return Math.round((o.hours || WATCH_HOURS) / 24) + ' days on station';
    if (o.type === 'walkin') return 'clearance: ' + (o.needStanding || WALKIN_CLEARANCE) + ' with them';
    return null;
  }

  function siteIdOf(key) {
    var i = String(key).indexOf(':');
    return i >= 0 ? String(key).slice(i + 1) : String(key);
  }

  /* Signing one shuts the others for that fix. */
  function onAccept(G, m) {
    if (!G || !m || (m.type !== 'watch' && m.type !== 'walkin')) return;
    G.intel = G.intel || {};
    var rec = G.intel[m.fixKey] || (G.intel[m.fixKey] = { sold: [], t: G.t || 0 });
    rec.route = m.type;
    m.watched = 0;
    m.walked = false;
  }

  /* Why you cannot sign this one, in words. The door is the only hard
   * gate: a watch needs nothing but patience. */
  function signRefusal(G, offer) {
    if (!offer || offer.type !== 'walkin') return null;
    var M = global.Missions;
    var st = M && M.standing ? M.standing(G, offer.ownerFac) : 0;
    if (st < (offer.needStanding || WALKIN_CLEARANCE)) {
      return 'they would not let you through the door - you need ' +
             (offer.needStanding || WALKIN_CLEARANCE) + ' with them, you have ' + st;
    }
    return null;
  }

  /* ---- doing the work ---------------------------------------------------- */

  /* Station-keeping, counted in ship time so a watch is something you
   * actually spend rather than something you skip past at 10,000x and
   * call done - the warp multiplies the clock, and the clock is the job. */
  function tickWatch(G, sys, t, dt) {
    if (!G || !G.ship || !sys || !(dt > 0)) return;
    var list = G.missions || [];
    var V = global.V, Sim = global.Sim;
    if (!V || !Sim) return;
    for (var i = 0; i < list.length; i++) {
      var m = list[i];
      if (m.type !== 'watch' || (m.watched || 0) >= m.hours * 3600) continue;
      if (m.starId && G.here && m.starId !== G.here.id) continue;
      var body = sys.byId && sys.byId[m.siteId];
      if (!body) continue;
      /* Docked at it does not count: a watch is what you see from outside.
       * That is also what keeps it a different job from walking in. */
      if (G.ship.docked === m.siteId) continue;
      var pos = Sim.bodyPosition(body, sys, t);
      if (!pos || V.dist(pos, G.ship.pos) > WATCH_KM) continue;
      m.watched = (m.watched || 0) + dt;
    }
  }

  /* The door, from the inside. Docking AT the site is the whole act. */
  function onDock(G, port, t) {
    if (!G || !port) return;
    var list = G.missions || [];
    for (var i = 0; i < list.length; i++) {
      var m = list[i];
      if (m.type === 'walkin' && m.siteId === port.id) m.walked = true;
    }
  }

  function progress(G, m) {
    if (!G || !m) return null;
    if (m.type === 'watch') {
      var need = (m.hours || WATCH_HOURS) * 3600;
      var got = m.watched || 0;
      if (got >= need) return 'the log is full - take it to ' + m.toName;
      return Math.floor(got / 3600) + ' of ' + m.hours + ' hours on station off ' + m.siteName;
    }
    if (m.type === 'walkin') {
      if (m.walked) return 'you have been inside - take it to ' + m.toName;
      return 'dock at ' + m.siteName + ' on your own clearance';
    }
    return null;
  }

  /* ---- settling ----------------------------------------------------------
   * Both of these end the same way they would have ended if you had simply
   * sold the position, only louder: the people you informed on find out
   * more often, because you did more than tell somebody a number. */

  var WATCH_BURN = 0.45;
  var WALKIN_BURN = 0.7;

  function settle(G, port, sys, t, m, hooks) {
    if (!m) return false;
    if (m.type === 'watch') {
      var need = (m.hours || WATCH_HOURS) * 3600;
      if ((m.watched || 0) < need) {
        if (hooks && hooks.say) {
          hooks.say('They want a week off ' + m.siteName + ' - you have ' +
                    Math.floor((m.watched || 0) / 3600) + ' of ' + m.hours + ' hours', 5);
        }
        return false;
      }
      return payIntel(G, port, t, m, WATCH_BURN,
                      'A week of traffic off ' + m.siteName, hooks);
    }
    if (m.type === 'walkin') {
      if (!m.walked) {
        if (hooks && hooks.say) {
          hooks.say('They want it from the inside - you have not docked at ' + m.siteName, 5);
        }
        return false;
      }
      return payIntel(G, port, t, m, WALKIN_BURN,
                      'What ' + m.siteName + ' looks like from the inside', hooks);
    }
    return false;
  }

  function payIntel(G, port, t, m, burnChance, what, hooks) {
    var M = global.Missions;
    /* Through the one place a fine being worked off takes its half
     * (missions.js creditFor, 2026-11-18). */
    if (M && M.creditFor) M.creditFor(G, m, m.pay); else G.ship.credits += m.pay;
    if (M && M.bumpStanding) M.bumpStanding(G, m.faction, Math.max(4, Math.min(14, Math.round(m.pay / 6000))));
    G.intel = G.intel || {};
    var rec = G.intel[m.fixKey] || (G.intel[m.fixKey] = { sold: [], t: t });
    rec.route = m.type; rec.done = t;
    var r = new RNG('burn|' + m.fixKey + '|' + m.type + '|' + port.id);
    var burned = r.chance(burnChance);
    if (burned && M && M.bumpStanding) M.bumpStanding(G, m.ownerFac, -BURN_STANDING);
    if (global.Tutorial) global.Tutorial.note(G, 'contract', { id: m.id, pay: m.pay });
    jot(G, what + ' handed over at ' + port.name + ': ' + m.pay + ' cr' +
           (burned ? ' - and they worked out who' : ''));
    if (hooks && hooks.say) {
      hooks.say(what + ' - ' + m.pay + ' cr' +
                (burned ? '. They worked out who.' : '. Nobody asked twice.'), 7);
    }
    if (hooks && hooks.sound) hooks.sound(burned ? 'warn' : 'pay');
    return true;
  }

  function ownerName(galaxy, facId) {
    var f = galaxy && galaxy.factionById ? galaxy.factionById[facId] : null;
    return (f && f.name) || 'somebody';
  }

  function jot(G, line) {
    var J = global.Journal;
    if (!J && typeof require !== 'undefined') { try { J = require('./journal.js'); } catch (e) { J = null; } }
    if (J && J.add && G) J.add(G, 'mission', line);
  }

  var Intel = {
    fixes: fixes, offersAt: offersAt, best: best, priceOf: priceOf,
    refusal: refusal, sell: sell, staleness: staleness, topOf: topOf, isOutlaw: isOutlaw,
    countSales: countSales, soldTo: soldTo, areRivals: areRivals,
    boardAt: boardAt, onAccept: onAccept, signRefusal: signRefusal,
    tickWatch: tickWatch, onDock: onDock, progress: progress, settle: settle,
    routeOf: routeOf, siteIdOf: siteIdOf, demand: demand,
    WATCH_HOURS: WATCH_HOURS, WATCH_KM: WATCH_KM, WATCH_MULT: WATCH_MULT,
    WALKIN_MULT: WALKIN_MULT, WALKIN_CLEARANCE: WALKIN_CLEARANCE,
    BASE: BASE, RIVAL: RIVAL, OUTLAW: OUTLAW, NEUTRAL: NEUTRAL, RESALE: RESALE,
    HALF_LIFE_DAYS: HALF_LIFE_DAYS, STALE_FLOOR: STALE_FLOOR, SYN_BERTH: SYN_BERTH,
    BURN_STANDING: BURN_STANDING, CROSS_STANDING: CROSS_STANDING
  };

  global.Intel = Intel;
  if (typeof module !== 'undefined' && module.exports) module.exports = Intel;
})(typeof window !== 'undefined' ? window : globalThis);
