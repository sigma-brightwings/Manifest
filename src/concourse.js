/* concourse.js - the station speaks (2026-11-18).
 *
 * Astra: "I want the first person stations to be more engaging", and of
 * what that means, all four of: people doing things, places to use, a
 * lived-in look, things happening. This is the first slice of the plan in
 * claude/engaging-stations-plan.md: the station telling you about itself.
 *
 * Three things, all READ off state the game already runs, the rule the
 * signage set: whatever the station shows or says is true.
 *
 *   schedule()  the departures and arrivals board, off the traffic
 *               timetable (the same closed form Sim.berthOccupants uses).
 *   paLine()    the public address: a ship's departure or arrival due
 *               now, what the market is short of, how many hands the crew
 *               hall has, and - when there is one on you here - your
 *               bounty, in port security's words.
 *   overheard() what a person says as you pass: a docked crew about their
 *               own sailing, a station hand about something this port has
 *               actually heard of you (rumours.js), or about the market.
 *
 * Pure: no state of its own, nothing written to G. main.js decides when
 * and where to say things. */
(function (global) {
  'use strict';

  var BOARD_HOURS = 24;     // how far ahead the board looks
  var DUE_SOON = 15 * 60;   // under this a departure is BOARDING, an arrival APPROACH

  /* ---- the timetable -------------------------------------------------------
   * A route runs from A (`from`) to B (`to`) and back, one period a round
   * trip: cruise out, lie at B for the layover, cruise back, lie at A for
   * the rest. So, from the route's own t0 (Sim.berthOccupants derives the
   * departures the same way):
   *   at B: arrives t0 + cruise,                departs t0 + cruise + layover
   *   at A: arrives t0 + 2 cruise + layover,    departs t0 + period
   * each plus whole periods. A ship that is in a berth NOW says AT BERTH,
   * read from berthOccupants itself, so the board and the queue cannot
   * disagree about who is in. Heavies that lie off the station (`outboard`)
   * come and go too; the board says so. */
  function nextAfter(base, period, t) {
    if (!(period > 0)) return base;
    var k = Math.ceil((t - base) / period);
    return base + k * period;
  }
  function portName(sys, id) {
    var p = sys && sys.byId ? sys.byId[id] : null;
    return p ? p.name : 'parts unknown';
  }

  function schedule(port, sys, t, opts) {
    opts = opts || {};
    var hours = opts.hours || BOARD_HOURS;
    var out = { departures: [], arrivals: [] };
    if (!port || !sys || !sys.traffic) return out;
    var Sim = global.Sim;
    var inBerth = {};
    if (Sim && Sim.berthOccupants) {
      Sim.berthOccupants(port, sys, t).forEach(function (o) { inBerth[o.route.id] = o.leavesAt; });
    }
    var horizon = t + hours * 3600;
    for (var i = 0; i < sys.traffic.length; i++) {
      var r = sys.traffic[i];
      if (r.from !== port.id && r.to !== port.id) continue;
      var atB = r.to === port.id;
      var other = portName(sys, atB ? r.from : r.to);
      var arrBase = atB ? r.t0 + r.cruise : r.t0 + 2 * r.cruise + r.layover;
      var depBase = atB ? r.t0 + r.cruise + r.layover : r.t0;
      var dep = nextAfter(depBase, r.period, t);
      var arr = nextAfter(arrBase, r.period, t);
      var here = inBerth[r.id] !== undefined;
      if (here) dep = inBerth[r.id];
      if (dep <= horizon) {
        out.departures.push({ id: r.id, name: r.name, cls: r.className || r.cls, to: other, at: dep,
                              status: r.outboard ? 'AT ANCHOR' : here ? (dep - t < DUE_SOON ? 'BOARDING' : 'AT BERTH') : 'SCHEDULED' });
      }
      /* An arrival only if she is not already here: a ship in her berth
       * has arrived, and her next arrival is a round trip away. */
      if (!here && arr <= horizon && arr < dep) {
        out.arrivals.push({ id: r.id, name: r.name, cls: r.className || r.cls, from: other, at: arr,
                            status: arr - t < DUE_SOON ? 'APPROACH' : 'EXPECTED' });
      }
    }
    out.departures.sort(function (a, b) { return a.at - b.at; });
    out.arrivals.sort(function (a, b) { return a.at - b.at; });
    return out;
  }

  /* The station clock, as the HUD writes the time of day. */
  function clock(t) {
    var d = ((t % 86400) + 86400) % 86400;
    var h = Math.floor(d / 3600), m = Math.floor((d - h * 3600) / 60);
    return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
  }
  function inWords(dt) {
    if (dt < 90) return 'now';
    if (dt < 3600) return 'in ' + Math.round(dt / 60) + ' min';
    return 'in ' + (dt / 3600).toFixed(dt < 36000 ? 1 : 0) + ' h';
  }

  /* ---- facts the port can state ------------------------------------------- */
  function marketShort(port) {
    var Eco = global.Economy, rows = port && port.market && port.market.rows, out = [];
    if (!rows) return out;
    for (var cid in rows) {
      if (!Object.prototype.hasOwnProperty.call(rows, cid)) continue;
      var r = rows[cid];
      if (!r || !(r.cons > r.prod * 1.6)) continue;
      var c = Eco && Eco.BY_ID ? Eco.BY_ID[cid] : null;
      if (c && !c.contraband) out.push(c.name);
    }
    return out.sort();
  }
  /* What the station calls your ship: her name if she has one ("the
   * Patience"), else her class ("a Talon Courier in port"), never "the a
   * ship" (the first run's PA, on an unnamed hull). */
  function shipCalled(G) {
    var s = G && G.ship;
    var nm = s && (s.shipName || s.name);   // shipName is the field captains.js reads
    if (nm) return 'the ' + nm;
    var H = global.Combat && global.Combat.HULLS, h = s && H && s.hullId ? H[s.hullId] : null;
    return h && h.name ? 'a ' + h.name + ' in port' : 'a ship in port';
  }
  /* The port's faction as the law reads it (combat.js dockRefusal keys on
   * `port.faction`; the first draft read `factionId`, which ports do not
   * carry, and so only ever fell through to the star's faction). */
  function portFaction(G, port) {
    return (port && (port.faction || port.factionId)) || (G.here && G.here.factionId) || null;
  }
  function bountyHere(G, port) {
    var fac = portFaction(G, port);
    var w = G.wanted || {};
    return fac && w[fac] > 0 ? Math.round(w[fac]) : 0;
  }

  /* ---- the public address --------------------------------------------------
   * Returns { key, text } or null. `key` lets the caller say a thing once:
   * a departure is announced once per sailing, the rest at most once per
   * visit each. `said` is that caller's record (a plain object). The order
   * is urgency: a sailing due now, an arrival on approach, then your bounty,
   * then the port's own business, so the PA is never filler. */
  function paLine(G, port, sys, t, said) {
    said = said || {};
    if (!port) return null;
    var sch = schedule(port, sys, t, { hours: 1 });
    for (var i = 0; i < sch.departures.length; i++) {
      var d = sch.departures[i], k = 'dep|' + d.id + '|' + Math.round(d.at);
      if (said[k] || d.at - t > 10 * 60 || d.status === 'AT ANCHOR') continue;
      return { key: k, text: d.name + ' for ' + d.to + ', departing ' + inWords(d.at - t) + '. Crew and passengers to your berth.' };
    }
    for (var j = 0; j < sch.arrivals.length; j++) {
      var a = sch.arrivals[j], ka = 'arr|' + a.id + '|' + Math.round(a.at);
      if (said[ka] || a.at - t > 10 * 60) continue;
      return { key: ka, text: a.name + ' from ' + a.from + ' on final approach. Berth crews stand by.' };
    }
    var owed = bountyHere(G, port);
    if (owed && !said.bounty) {
      return { key: 'bounty', text: 'Port security: be advised, ' + shipCalled(G) +
                                    ' is flagged, ' + owed.toLocaleString('en-US') + ' credits outstanding.' };
    }
    var short = marketShort(port);
    if (short.length && !said.short) {
      return { key: 'short', text: 'The market desk is buying ' + short.slice(0, 2).join(' and ').toLowerCase() +
                                   (short.length > 2 ? ', among others' : '') + '. Good prices for anyone carrying.' };
    }
    var Crew = global.Crew;
    /* The hall as npc.js stands it: for hire, less anyone you signed on. */
    var signed = {};
    (Crew && Crew.aboard && G.ship ? Crew.aboard(G.ship) : []).forEach(function (c) { signed[c.id || c.name] = 1; });
    var hands = Crew && Crew.forHire ? (Crew.forHire(port, t) || []).filter(function (c) { return !signed[c.id || c.name]; }).length : 0;
    if (hands && !said.hall) {
      return { key: 'hall', text: hands + (hands === 1 ? ' hand is' : ' hands are') + ' looking for a berth. See the steward in the crew hall.' };
    }
    /* The next sailing not already called: "departing now" and then "next
     * sailing" for the same ship would be the PA contradicting itself. */
    var called = function (id) {
      for (var k in said) if (k.indexOf('dep|' + id + '|') === 0) return true;
      return false;
    };
    var nx = schedule(port, sys, t, { hours: 12 }).departures.filter(function (x) {
      return x.status !== 'AT ANCHOR' && !called(x.id);
    })[0];
    if (nx && !said['next|' + nx.id]) {
      return { key: 'next|' + nx.id, text: 'Next sailing: ' + nx.name + ' for ' + nx.to + ' at ' + clock(nx.at) + '.' };
    }
    return null;
  }

  /* ---- overheard -------------------------------------------------------------
   * What `person` (an npc.js person) says as you pass, or null. Staff at
   * their counters do not chatter; the law does not gossip. */
  var QUIET = { clerk: 1, bartender: 1, steward: 1, security: 1, tactical: 1, customs: 1, marine: 1, enforcer: 1, heavy: 1, fixer: 1 };
  function overheard(G, port, sys, person, t) {
    if (!person || QUIET[person.role] || person.staff) return null;
    var RNG = global.RNG, h = RNG ? RNG.hashString('ovh|' + person.id) : 0;
    /* A docked ship's crew: about their own sailing, from the timetable. */
    if (person.route) {
      var sch = schedule(port, sys, t, { hours: BOARD_HOURS });
      for (var i = 0; i < sch.departures.length; i++) {
        var d = sch.departures[i];
        if (d.id !== (person.route.id || person.route)) continue;
        var lines = [
          'We are out for ' + d.to + ' ' + inWords(d.at - t) + '. Drink up.',
          'Skipper says ' + d.to + ', ' + clock(d.at) + '. Same run as always.',
          (d.at - t < DUE_SOON ? 'That is us boarding. ' : 'Plenty of time yet. ') + d.to + ' again.'
        ];
        return lines[h % lines.length];
      }
    }
    /* What this port has heard of you, in the rumour network's own words. */
    var R = global.Rumours;
    if (R && R.portHeard && R.lineFor && G.rumours && G.rumours.length) {
      var heard = R.portHeard(G, sys, port.id, t);
      if (heard.length) {
        var top = heard[h % heard.length];
        var line = R.lineFor(G, sys, { R: top.R, here: true, via: port.id }, 'ovh|' + person.id);
        if (line) return line;
      }
    }
    var short = marketShort(port);
    if (short.length) {
      var s = short[h % short.length].toLowerCase();
      var ml = ['They cannot get ' + s + ' in here for love or money.',
                'Whoever brings in ' + s + ' names their price this week.',
                'Desk was out of ' + s + ' again.'];
      return ml[(h >> 3) % ml.length];
    }
    return null;
  }

  /* ---- somebody comes up to you (2026-11-18) ---------------------------------
   * Astra: "it should be a nice surprise; not super often, more with higher
   * notoriety." So: at most one a visit, rare for a nobody, likelier the
   * more this port has heard of you.
   *
   * HOW KNOWN YOU ARE HERE is what the port has actually heard (the rumour
   * network's weighted counts at 'P:<port>', every field, good and bad),
   * plus the navy's notoriety for this empire (hunters.js, a tenth of it:
   * ten points is one loud act), plus one if there is a bounty on you here.
   * Chance a visit: 8% for nobody, +10% a point, capped at 60%.
   *
   * WHAT THEY SAY is the loudest true thing about you here, in the rumour
   * network's own line, with their reaction to it; then, from anyone
   * friendly, a tip that is also true: a port in this system short of
   * something in your hold, or short of anything at all. */
  var APPROACH_BASE = 0.08, APPROACH_PER = 0.10, APPROACH_MAX = 0.6;
  var FRIENDLY = { rescues: 1, pirateKills: 1 };
  var HOSTILE = { piracy: 1, kills: 1, lies: 1, cruelLies: 1 };
  function idKey(G) {
    var Cp = global.Captains;
    try { return Cp && Cp.identity ? Cp.identity(G).key : 'self'; } catch (e) { return 'self'; }
  }
  function empireOf(G, fac) {
    var f = G.galaxy && G.galaxy.factionById ? G.galaxy.factionById[fac] : null;
    return f && f.parentId && f.parentId !== 'outlaw' ? f.parentId : fac;
  }
  function fame(G, port, sys, t) {
    var out = { score: 0, counts: {}, top: {}, notoriety: 0, bounty: 0 };
    var R = global.Rumours;
    if (R && R.tallyAt && G.rumours) {
      var tl = R.tallyAt(G, sys, 'P:' + port.id, t, idKey(G));
      out.counts = tl.counts; out.top = tl.top;
      for (var k in tl.counts) out.score += tl.counts[k] || 0;
    }
    var fac = portFaction(G, port);
    var H = global.Hunters;
    if (H && H.notoriety && fac) out.notoriety = H.notoriety(G, empireOf(G, fac), t) || 0;
    out.score += out.notoriety / 10;
    out.bounty = bountyHere(G, port);
    if (out.bounty) out.score += 1;
    return out;
  }
  function approachChance(score) {
    return Math.min(APPROACH_MAX, APPROACH_BASE + APPROACH_PER * Math.max(0, score || 0));
  }
  /* Who detains you: the port's own law on the deck (npc.js stationScene
   * stands security, marines and customs by livery, enforcers on a
   * Syndicate deck). */
  var LAW = { security: 1, tactical: 1, customs: 1, marine: 1, officer: 1, enforcer: 1, heavy: 1 };
  function isLaw(person) { return !!person && !!LAW[person.role] && !person.away; }
  /* Who might come over: not staff, not the law, not your own crew. */
  function canApproach(person) {
    return !!person && !QUIET[person.role] && !person.staff && !person.aboard && !person.yours;
  }
  /* A true tip. Your hold first: a port in this system short of something
   * you carry. Failing that, any port here short of anything. */
  function tip(G, port, sys) {
    var Eco = global.Economy, others = (sys.ports || sys.bodies || []).filter(function (p) {
      return p && p !== port && p.market && p.market.rows;
    });
    var hold = (G.ship && G.ship.cargo) || {};
    var name = function (cid) { var c = Eco && Eco.BY_ID ? Eco.BY_ID[cid] : null; return c && !c.contraband ? c.name : null; };
    var best = null;
    others.forEach(function (p) {
      for (var cid in p.market.rows) {
        var r = p.market.rows[cid];
        if (!r || !(r.cons > r.prod * 1.6) || !name(cid)) continue;
        var mine = (hold[cid] || 0) > 0;
        /* Your hold outranks any ratio: a port that makes none of a good
         * has an unbounded one, and the first draft let that beat it. */
        var score = (mine ? 1e9 : 0) + Math.min(1e6, r.cons / Math.max(1e-6, r.prod));
        if (!best || score > best.score) best = { score: score, port: p, cid: cid, mine: mine };
      }
    });
    if (!best) return null;
    var good = name(best.cid).toLowerCase();
    return best.mine
      ? 'If that is ' + good + ' in your hold, ' + best.port.name + ' is crying out for it.'
      : best.port.name + ' cannot get enough ' + good + ' this week, if you are looking for a run.';
  }
  function approach(G, port, sys, t, who) {
    var f = fame(G, port, sys, t), R = global.Rumours;
    var RNG = global.RNG, h = RNG ? RNG.hashString('appr|' + (who && who.id) + '|' + port.id) : 0;
    /* The loudest field they have heard, good or bad. */
    var field = null, w = 0;
    for (var k in f.counts) if (f.counts[k] > w && R && R.LINES && R.LINES[k]) { w = f.counts[k]; field = k; }
    var heard = field && R && R.lineFor ? R.lineFor(G, sys, f.top[field], 'appr|' + (who && who.id)) : null;
    var lines = [], kind = 'stranger';
    if (heard && HOSTILE[field]) {
      kind = 'wary';
      lines.push(heard);
      lines.push(['I know who you are. Keep away from my ship.', 'Thought you should know people here are talking.', 'You will not find many friends on this deck.'][h % 3]);
      return { kind: kind, text: lines.join(' '), fame: f };
    }
    if (f.bounty && h % 2 === 0) {
      kind = 'warning';
      lines.push('Security have been asking after ' + shipCalled(G).replace(/ in port$/, '') + '. I did not tell them anything.');
    } else if (f.notoriety >= 10) {
      kind = 'warning';
      lines.push('The navy are on the band asking about you. Thought you would want to know.');
    } else if (heard && FRIENDLY[field]) {
      kind = 'grateful';
      lines.push(heard);
      lines.push(field === 'rescues' ? ['People here remember a thing like that.', 'Not many would have stopped.'][h % 2]
                                     : ['Fewer of them about suits me fine.', 'My run is safer for it.'][h % 2]);
    } else {
      lines.push(['You look like you know your way round a hold.', 'New in? Here is something for nothing.', 'Captain. A word, if you have a minute.'][h % 3]);
    }
    var tp = tip(G, port, sys);
    if (tp) lines.push(tp);
    if (lines.length === 1 && kind === 'stranger') return null;   // nothing true worth coming over for
    return { kind: kind, text: lines.join(' '), fame: f };
  }

  var Concourse = {
    fame: fame, approachChance: approachChance, canApproach: canApproach, approach: approach, tip: tip,
    isLaw: isLaw, portFaction: portFaction,
    APPROACH_BASE: APPROACH_BASE, APPROACH_PER: APPROACH_PER, APPROACH_MAX: APPROACH_MAX,
    schedule: schedule, paLine: paLine, overheard: overheard,
    clock: clock, inWords: inWords, marketShort: marketShort, bountyHere: bountyHere, shipCalled: shipCalled,
    BOARD_HOURS: BOARD_HOURS, DUE_SOON: DUE_SOON
  };
  global.Concourse = Concourse;
  if (typeof module !== 'undefined' && module.exports) module.exports = Concourse;
})(typeof window !== 'undefined' ? window : globalThis);
