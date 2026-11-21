/* outposts.js - an outpost on a claim, built by the drones already on it
 * (2026-11-19). Mining rung 5's ground half (claude/mining-and-survey.md).
 *
 * Astra: "Outposts are constructed by mining drones." And: "Drilling teams
 * are engineers that can be ordered to work on the surface at an outpost"
 * (that is the next slice; an outpost is where they will stand). The
 * Crawler builds stations; an outpost is the thing smaller than a station
 * that the agreed design said would be built by something smaller than a
 * Crawler (claude/crawler-and-station-modules.md: "comsats and drone bases
 * are built by something smaller").
 *
 * WHAT IT IS. An unmanned base standing on one of your drones' ground, on
 * a claim with at least two of your drones on it. The Guild sells the
 * frame (OUTPOST_FEE) and the drones build it: while they build, they dig
 * nothing, so the price is partly their time. Once it stands:
 *   - every drone on the claim delivers to its bins, so each holds
 *     OUTPOST_HOPPER rather than a drone's own 30 t;
 *   - you empty the whole claim at the outpost (N beside it), rather than
 *     landing beside each drone in turn;
 *   - it is harder to strip: thieves come half as often;
 *   - and it is where a drilling team will work.
 *
 * ON THE RAILS, like the drones. An outpost is a record with the time it
 * was ordered and the time it stands; the building is a pure function of
 * the clock, so skipping a month gives the right answer and nothing ticks.
 * The drones' hoppers are re-based to the day it stands (they dig nothing
 * before), which is what makes the bigger bins exact rather than
 * retroactive.
 *
 * Saved: G.outposts.
 */
(function (global) {
  'use strict';

  var DAY = 86400;
  var OUTPOST_FEE = 15000;          // cr: the Guild's frame (Claude's number)
  var OUTPOST_MIN_DRONES = 2;
  var OUTPOST_WORK = 40;            // drone-days of building
  var OUTPOST_HOPPER = 90;          // t a drone holds once it feeds the bins
  var OUTPOST_STRIP = 0.5;          // thieves come this much as often

  function Cl() { return global.Claims; }
  function starOf(G) { return (G.here && G.here.id) || 'sys'; }
  function list(G) { return (G && G.outposts) || []; }

  function onClaim(G, key) {
    var l = list(G);
    for (var i = 0; i < l.length; i++) if (l[i].key === key) return l[i];
    return null;
  }
  function standing(op, t) { return !!op && t >= op.doneAt; }
  /* The finished outpost on this claim, if any. */
  function standingOn(G, key, t) {
    var op = onClaim(G, key);
    return standing(op, t) ? op : null;
  }
  function dronesOn(G, key) {
    return (G.drones || []).filter(function (d) { return d.key === key; });
  }
  function daysFor(n) { return OUTPOST_WORK / Math.max(1, n); }

  /* What a drone holds: its own 30 t, or the outpost's bins once the
   * outpost stood before the drone was last re-based. Read by
   * Claims.hopper, so the rule lives here and the hopper stays closed-form. */
  function capFor(G, d) {
    var op = onClaim(G, d.key);
    var C = Cl(), base = C ? C.HOPPER : 30;
    return op && op.doneAt <= (d.baseT || 0) ? OUTPOST_HOPPER : base;
  }

  /* Why the drone at this spot cannot start an outpost, or null. */
  function refusal(G, sys, t, droneId) {
    var C = Cl();
    if (!C) return 'no Guild here';
    var d = (G.drones || []).filter(function (x) { return x.id === droneId; })[0];
    if (!d) return 'pick one of your drones on the map';
    if (d.star !== starOf(G)) return 'that drone is in another system';
    if (!C.claimFor(G, d.key, t)) return 'the claim on ' + d.name + ' has lapsed - renew it at any desk';
    var op = onClaim(G, d.key);
    if (op) return standing(op, t) ? 'there is already an outpost on ' + d.name
                                   : 'the drones are already building one on ' + d.name;
    var n = dronesOn(G, d.key).length;
    if (n < OUTPOST_MIN_DRONES) return 'it takes ' + OUTPOST_MIN_DRONES + ' drones on the claim - there ' + (n === 1 ? 'is 1' : 'are ' + n);
    if (!G.ship || G.ship.credits < OUTPOST_FEE) return 'the frame is ' + OUTPOST_FEE.toLocaleString('en-US') + ' cr';
    return null;
  }

  /* Order it. The drones stop digging until it stands: each is settled at
   * what it holds now and re-based to the day it is done. */
  function order(G, sys, t, droneId) {
    var why = refusal(G, sys, t, droneId);
    if (why) return { ok: false, why: why };
    var C = Cl();
    var d = (G.drones || []).filter(function (x) { return x.id === droneId; })[0];
    var crew = dronesOn(G, d.key);
    var doneAt = t + daysFor(crew.length) * DAY;
    crew.forEach(function (x) {
      x.base = C.hopper(G, x, t).tonnes;
      x.baseT = doneAt;
      x.stripRate = (x.stripRate || C.stripRate(sys)) * OUTPOST_STRIP;
    });
    G.ship.credits -= OUTPOST_FEE;
    G.outposts = G.outposts || [];
    var op = { id: 'op-' + d.key + '-' + Math.round(t), key: d.key, star: d.star, body: d.body, name: d.name,
               at: { lat: d.at.lat, lon: d.at.lon, elevation: 0 }, orderedAt: t, doneAt: doneAt,
               drones: crew.length, announced: false };
    G.outposts.push(op);
    var days = Math.round(daysFor(crew.length));
    if (global.Journal && global.Journal.add) {
      global.Journal.add(G, 'build', 'Ordered an outpost on ' + d.name + ' - ' + crew.length + ' drones building, about ' + days + ' days');
    }
    return { ok: true, outpost: op,
             text: 'The Guild\'s frame is going down to ' + d.name + '. ' + crew.length + ' drones stop digging to build it - about ' +
                   days + ' days. Once it stands they each hold ' + OUTPOST_HOPPER + ' t, and you empty the claim at the outpost.' };
  }

  /* Where it stands, riding the world's spin like a pad. */
  function groundPos(sys, op, t) {
    var b = sys && sys.byId ? sys.byId[op.body] : null, Sim = global.Sim, V = global.V;
    if (!b || !Sim || !V) return null;
    return V.add(Sim.bodyState(b, sys, t).pos, Sim.surfaceOffset(b, op.at, t).pos);
  }
  function near(G, sys, t) {
    var C = Cl(), V = global.V, s = G.ship;
    if (!C || !s || !s.landed) return null;
    var star = starOf(G), l = list(G);
    for (var i = 0; i < l.length; i++) {
      var op = l[i];
      if (op.star !== star) continue;
      var p = groundPos(sys, op, t);
      if (p && V.dist(p, s.pos) <= C.NEAR_KM) return op;
    }
    return null;
  }

  /* N at a standing outpost: empty every drone on the claim, richest
   * first, until the hold is full. */
  function collectAll(G, sys, t, op) {
    var C = Cl();
    if (!standing(op, t)) {
      return { ok: false, why: 'still being built - stands in ' + Math.max(1, Math.ceil((op.doneAt - t) / DAY)) + ' days' };
    }
    var ds = dronesOn(G, op.key);
    if (!ds.length) return { ok: false, why: 'no drones on ' + op.name + ' feed it now' };
    var Eco = global.Economy;
    ds.sort(function (a, b) {
      var va = (Eco && Eco.BY_ID[a.cid] ? Eco.BY_ID[a.cid].base : 1), vb = (Eco && Eco.BY_ID[b.cid] ? Eco.BY_ID[b.cid].base : 1);
      return vb - va;
    });
    var took = {}, total = 0, left = 0, stripped = 0;
    ds.forEach(function (d) {
      var h = C.hopper(G, d, t);
      if (h.stripped) stripped++;
      var r = C.collect(G, sys, t, d);
      if (r.taken > 0) { took[d.cid] = (took[d.cid] || 0) + r.taken; total += r.taken; }
      left += Math.floor(d.base || 0);
    });
    var S = global.Survey, parts = Object.keys(took).map(function (cid) {
      return took[cid] + ' t of ' + ((S && S.NAMES[cid]) || cid).toLowerCase();
    });
    var note = stripped ? 'somebody got into ' + (stripped === 1 ? 'one drone' : stripped + ' drones') + ' while you were away; ' : '';
    return { ok: total > 0, taken: total, left: left,
             text: note + (total > 0 ? 'From the outpost on ' + op.name + ': ' + parts.join(', ') + ' aboard' +
                                       (left >= 1 ? ' - ' + Math.floor(left) + ' t still in the bins, no room' : '')
                                     : 'the bins are empty') };
  }

  /* Said once, when an outpost stands (lazy: whenever it is first asked
   * after its day, from any system). */
  function tick(G, t, hooks) {
    var n = 0;
    n += tickDig(G, t, hooks);
    /* Once the port is open your engineers wait in it: dock there (or land
     * at the old outpost) and they come aboard. */
    list(G).forEach(function (op) {
      if (!op.port || !G.ship || !G.sys || op.star !== starOf(G)) return;
      var here = G.ship.docked === op.portId || near(G, G.sys, t) === op;
      if (!here) return;
      var back = teamAboardBooks(G, op);
      if (!back.length) return;
      back.forEach(function (p) { delete p.out; delete p.outpost; });
      var ids = back.map(function (p) { return p.id; });
      op.team = (op.team || []).filter(function (m) { return ids.indexOf(m.id) < 0; });
      if (hooks && hooks.say) hooks.say(back.map(function (p) { return p.name; }).join(', ') + ' come back aboard from ' + op.portName + '.', 6);
      n++;
    });
    list(G).forEach(function (op) {
      if (op.announced || t < op.doneAt) return;
      op.announced = true; n++;
      var line = 'The outpost on ' + op.name + ' stands. Its drones are digging again, into its bins - empty them there (N).';
      if (hooks && hooks.say) hooks.say(line, 7);
      if (global.Journal && global.Journal.add) global.Journal.add(G, 'build', 'Outpost on ' + op.name + ' finished');
    });
    return n;
  }

  /* ==== DRILLING TEAMS (2026-11-19) =====================================
   * Astra: "Drilling teams are engineers that can be ordered to work on the
   * surface at an outpost." The work, agreed 2026-10-17
   * (claude/drilling-and-ground-ports.md): a team digs the outpost out into
   * a ground port of your own - a mining station (stations.js foundDug),
   * with NPC traffic from the day it opens.
   *
   * WHO. The engineers off your ship's crew, set down when you are landed at
   * a standing outpost. They stay on your books and draw their wage (crew.js
   * `out`, the same flag that keeps a hand on the hull on the roster), but
   * they are not aboard: she flies without them until you fetch them back.
   *
   * HOW FAST, on the rails. Each engineer digs DIG_PER + DIG_PER_RATING x
   * their rating a day, of DIG_WORK in all: one good engineer is about a
   * hundred days, three are about a month. The dig is a record - work done
   * by a moment and the team's rate since - re-based whenever the team
   * changes, so the day it finishes is a formula and skipping time is exact.
   *
   * WHAT IT COSTS. The dig's STORES - structural alloys for the shoring,
   * DIG_STORES tonnes over the whole dig, eaten as the work is done - the
   * engineers' wages while they dig, and a station licence: a port is a
   * station, and the government licenses stations (licence.js). The
   * Syndicate's forged blank serves, as it does for a Crawler.
   *
   * Stores are hauled, not paid for in one sum (decided 2026-11-19: Astra
   * left it to Claude). Supplying your own holdings is one of the loops she
   * asked for, and a dig that eats what you bring is the first holding
   * that needs supplying. Land with alloys in the hold and unload them, or
   * pay the Guild to bring the shortfall in at STORE_CONTRACT times the
   * going rate - convenience at a price, so hauling is the cheap way. When
   * the stores run out the dig STALLS (the team waits, and draws its
   * wage) until more come. On the rails: the record holds the stock on
   * site at its moment, and work done is capped by what that stock can
   * shore, so the stall day is a formula too. A dig from before stores
   * existed has stock null, read as unlimited: it was paid for in full. */
  var DIG_WORK = 120;
  var DIG_PER = 0.6, DIG_PER_RATING = 0.2;   // a day, per engineer
  var DIG_STORES = 40;                        // t of structural alloys over the whole dig
  var STORE_GOOD = 'alloys';
  var STORE_PER_WORK = DIG_STORES / DIG_WORK; // t per unit of work
  var STORE_CONTRACT = 3;                     // x the good's base price, delivered
  var DUG_COST = 300000;                      // what the port counts as for upkeep

  function engRate(p) { return DIG_PER + DIG_PER_RATING * (p.rating || 1); }
  function teamRate(op) {
    var r = 0;
    (op.team || []).forEach(function (p) { r += engRate(p); });
    return r;
  }
  function stockOf(d) { return d.stock == null ? Infinity : d.stock; }
  function dug(op, t) {
    var d = op.dig;
    if (!d) return 0;
    var byTeam = d.rate * Math.max(0, t - d.at) / DAY;
    var byStock = stockOf(d) / STORE_PER_WORK;
    return Math.min(DIG_WORK, d.work + Math.min(byTeam, byStock));
  }
  /* Tonnes of stores on site at t. */
  function stores(op, t) {
    var d = op.dig;
    if (!d) return 0;
    var s = stockOf(d);
    return s === Infinity ? Infinity : Math.max(0, s - (dug(op, t) - d.work) * STORE_PER_WORK);
  }
  /* Tonnes still wanted to finish, over what is on site now. */
  function storesNeeded(op, t) {
    var left = (DIG_WORK - dug(op, t)) * STORE_PER_WORK - stores(op, t);
    return left > 1e-6 ? Math.ceil(left * 100 - 1e-6) / 100 : 0;
  }
  function digDoneAt(op) {
    var d = op.dig;
    if (!d) return Infinity;
    if (d.work >= DIG_WORK) return d.at;
    if (stockOf(d) / STORE_PER_WORK < DIG_WORK - d.work - 1e-9) return Infinity;
    return d.rate > 0 ? d.at + (DIG_WORK - d.work) / d.rate * DAY : Infinity;
  }
  /* The moment the stores run out under a working team, or Infinity. */
  function stallAt(op) {
    var d = op.dig;
    if (!d || !(d.rate > 0)) return Infinity;
    var w = stockOf(d) / STORE_PER_WORK;
    if (d.work + w >= DIG_WORK - 1e-9) return Infinity;
    return d.at + w / d.rate * DAY;
  }
  function rebase(op, t) {
    op.dig = op.dig || { work: 0, at: t, rate: 0, stock: 0 };
    var s = stores(op, t);
    op.dig.work = dug(op, t);
    op.dig.stock = s === Infinity ? null : Math.round(s * 1e6) / 1e6;
    op.dig.at = t;
    op.dig.rate = teamRate(op);
  }
  function contractPrice(tonnes) {
    var E = global.Economy, g = E && E.BY_ID && E.BY_ID[STORE_GOOD];
    return Math.ceil(tonnes * (g ? g.base : 265) * STORE_CONTRACT);
  }
  function heldStores(G) { return (G.ship && G.ship.cargo && G.ship.cargo[STORE_GOOD]) || 0; }

  /* Unload the alloys in your hold into the dig's stores (landed there). */
  function unloadRefusal(G, sys, t) {
    var op = near(G, sys, t);
    if (!op) return 'land at your outpost first';
    if (!standing(op, t)) return 'the outpost is still being built';
    if (op.port) return 'the dig is done';
    if (op.dig && storesNeeded(op, t) <= 0) return 'the dig has all the stores it needs';
    if (heldStores(G) <= 0) return 'no structural alloys aboard';
    return null;
  }
  function unloadStores(G, sys, t) {
    var why = unloadRefusal(G, sys, t);
    if (why) return { ok: false, why: why };
    var op = near(G, sys, t);
    rebase(op, t);
    var qty = Math.min(heldStores(G), storesNeeded(op, t));
    qty = Math.round(qty * 100) / 100;
    G.ship.cargo[STORE_GOOD] = heldStores(G) - qty;
    if (G.ship.cargo[STORE_GOOD] <= 1e-9) delete G.ship.cargo[STORE_GOOD];
    if (global.Sim && global.Sim.refreshShip) global.Sim.refreshShip(G.ship);
    op.dig.stock = (op.dig.stock || 0) + qty;
    delete op.dig.stallSaid;
    var need = storesNeeded(op, t);
    return { ok: true, tonnes: qty, text: qty + ' t of alloys unloaded for the dig on ' + op.name + '.' +
             (need > 0 ? ' It wants ' + need + ' t more to finish.' : ' That is all it needs.') };
  }
  /* Or pay the Guild to bring the whole shortfall in. */
  function contractRefusal(G, sys, t) {
    var op = near(G, sys, t);
    if (!op) return 'land at your outpost first';
    if (!standing(op, t)) return 'the outpost is still being built';
    if (op.port) return 'the dig is done';
    var need = op.dig ? storesNeeded(op, t) : DIG_STORES;
    if (need <= 0) return 'the dig has all the stores it needs';
    if (!G.ship || G.ship.credits < contractPrice(need)) return 'the Guild wants ' + contractPrice(need).toLocaleString('en-US') + ' cr to bring ' + need + ' t in';
    return null;
  }
  function contractStores(G, sys, t) {
    var why = contractRefusal(G, sys, t);
    if (why) return { ok: false, why: why };
    var op = near(G, sys, t);
    rebase(op, t);
    var need = storesNeeded(op, t), cost = contractPrice(need);
    G.ship.credits -= cost;
    op.dig.stock = (op.dig.stock || 0) + need;
    delete op.dig.stallSaid;
    return { ok: true, tonnes: need, cost: cost,
             text: 'The Guild brings ' + need + ' t of alloys down to ' + op.name + ' for ' + cost.toLocaleString('en-US') + ' cr. The dig has all it needs.' };
  }
  /* Engineers aboard and inside her, who could go down. */
  function engineersAboard(G) {
    var Cw = global.Crew;
    var list = Cw && Cw.present ? Cw.present(G.ship) : ((G.ship && G.ship.crew) || []).filter(function (p) { return !p.out; });
    return list.filter(function (p) { return p.role === 'engineer'; });
  }
  /* Your engineers on this ship's books who are down at this outpost. */
  function teamAboardBooks(G, op) {
    return ((G.ship && G.ship.crew) || []).filter(function (p) { return p.out === 'outpost' && p.outpost === op.id; });
  }

  function postRefusal(G, sys, t) {
    var op = near(G, sys, t);
    if (!op) return 'land at your outpost first';
    if (!standing(op, t)) return 'the outpost is still being built';
    if (op.port) return 'the dig is done - ' + op.portName + ' stands there now';
    if (!engineersAboard(G).length) return 'no engineers aboard - a crew hall can sign one on';
    if (!op.dig || !op.dig.paid) {
      var L = global.Licence;
      if (L && L.needed && L.needed(sys) && !(L.rec && L.rec(G, sys)) && !((G.forgedBlanks || 0) > 0)) {
        return 'a port needs a station licence here - buy one on the police channel';
      }
    }
    return null;
  }

  /* Set every engineer aboard down at the outpost you are landed at. */
  function postTeam(G, sys, t, hooks) {
    var why = postRefusal(G, sys, t);
    if (why) return { ok: false, why: why };
    var op = near(G, sys, t), first = !op.dig || !op.dig.paid, licNote = '';
    if (first) {
      var L = global.Licence;
      var lic = L && L.forFounding ? L.forFounding(G, sys, t, hooks) : { ok: true, none: true };
      if (!lic.ok) return { ok: false, why: lic.why };
      op.licence = lic.none ? null : { fac: lic.rec.fac, forged: !!lic.rec.forged };
      if (lic.forged) licNote = ' A forged licence went in with the papers.';
    }
    rebase(op, t);
    op.dig.paid = true;
    var eng = engineersAboard(G);
    op.team = op.team || [];
    eng.forEach(function (p) {
      p.out = 'outpost'; p.outpost = op.id;
      op.team.push({ id: p.id, name: p.name, rating: p.rating });
    });
    op.dig.rate = teamRate(op);
    op.ship = (G.ship && (G.ship.shipName || G.ship.name)) || null;
    delete op.dig.stallSaid;
    var done = digDoneAt(op), days = Math.ceil((done - t) / DAY);
    var names = eng.map(function (p) { return p.name; }).join(', ');
    var stallD = stallAt(op), need = storesNeeded(op, t);
    var pace = done < Infinity
      ? 'At this pace the port is dug in about ' + days + ' days.'
      : stallD > t
        ? 'The stores on site last about ' + Math.max(1, Math.round((stallD - t) / DAY)) + ' days; the dig wants ' + need + ' t more alloys to finish.'
        : 'There are no stores on site: they wait until ' + need + ' t of structural alloys come down.';
    var line = names + ' ' + (eng.length === 1 ? 'goes' : 'go') + ' down to the outpost on ' + op.name + ' to dig. ' +
               pace + licNote;
    if (global.Journal && global.Journal.add) global.Journal.add(G, 'build', line);
    return { ok: true, text: line, days: days };
  }

  /* Fetch your engineers back aboard, at the outpost (or at the port it
   * became). The dig keeps what they did. */
  function recallRefusal(G, sys, t) {
    var op = near(G, sys, t) || dockedAtDug(G, sys);
    if (!op) return 'land at the outpost to fetch them';
    if (!teamAboardBooks(G, op).length) return 'none of this ship\'s crew are down there';
    return null;
  }
  function dockedAtDug(G, sys) {
    var s = G.ship;
    if (!s || !s.docked) return null;
    var l = list(G);
    for (var i = 0; i < l.length; i++) if (l[i].port && l[i].portId === s.docked) return l[i];
    return null;
  }
  function recallTeam(G, sys, t) {
    var why = recallRefusal(G, sys, t);
    if (why) return { ok: false, why: why };
    var op = near(G, sys, t) || dockedAtDug(G, sys);
    if (!op.port) rebase(op, t);
    var back = teamAboardBooks(G, op);
    var ids = back.map(function (p) { return p.id; });
    back.forEach(function (p) { delete p.out; delete p.outpost; });
    op.team = (op.team || []).filter(function (m) { return ids.indexOf(m.id) < 0; });
    if (!op.port && op.dig) op.dig.rate = teamRate(op);
    var line = back.map(function (p) { return p.name; }).join(', ') + ' back aboard' +
               (op.port ? '.' : '; the dig stands at ' + Math.round(dug(op, t) / DIG_WORK * 100) + '% until a team goes down again.');
    return { ok: true, text: line };
  }

  /* The dig finishing opens the port - wherever you are, on the day. */
  function tickDig(G, t, hooks) {
    var n = 0;
    list(G).forEach(function (op) {
      if (op.port || !op.dig || !op.dig.paid) return;
      /* Out of stores: said once per stall, wherever you are. */
      var st0 = stallAt(op);
      if (t >= st0 && op.dig.stallSaid !== st0) {
        op.dig.stallSaid = st0;
        /* Nothing to run out of: setting the team down already said they wait. */
        if (st0 > op.dig.at && hooks && hooks.say) hooks.say('The dig on ' + op.name + ' has run out of alloys at ' +
          Math.floor(dug(op, t) / DIG_WORK * 100) + '%. The team waits for ' + storesNeeded(op, t) + ' t more.', 9);
      }
      var at = digDoneAt(op);
      if (t < at) return;
      var S = global.Stations;
      if (!S || !S.foundDug) return;
      var st = S.foundDug(G, op, at, { cost: DUG_COST });
      op.port = st.id; op.portId = S.portId(st); op.portName = st.name;
      n++;
      var line = 'The drilling team on ' + op.name + ' is through: ' + st.name + ' is open, a mining port of yours. ' +
                 'Your engineers wait there for you to fetch them.';
      if (hooks && hooks.say) hooks.say(line, 10);
    });
    return n;
  }

  /* What the scanner map and the SURVEY page say about one. */
  function statusLine(G, op, t) {
    if (!standing(op, t)) return 'outpost building - stands in ' + Math.max(1, Math.ceil((op.doneAt - t) / DAY)) + ' days';
    if (op.port) return op.portName + ' stands here - dug out of the outpost';
    var C = Cl(), tons = 0;
    dronesOn(G, op.key).forEach(function (d) { tons += C.hopper(G, d, t).tonnes; });
    var line = 'outpost standing - ' + Math.floor(tons) + ' t in the bins';
    if (op.dig && op.dig.paid) {
      var pct = Math.floor(dug(op, t) / DIG_WORK * 100), done = digDoneAt(op), sl = stallAt(op);
      var down = op.team && op.team.length;
      line += !down ? '  ·  dig ' + pct + '%, nobody down there'
        : done < Infinity ? '  ·  ' + op.team.length + ' digging, ' + pct + '%, port in ' + Math.max(1, Math.ceil((done - t) / DAY)) + ' days'
        : t >= sl ? '  ·  dig ' + pct + '%, STALLED - no alloys on site'
        : '  ·  ' + op.team.length + ' digging, ' + pct + '%, alloys out in ' + Math.max(1, Math.ceil((sl - t) / DAY)) + ' days';
    }
    if (op.dig && stores(op, t) !== Infinity) {
      var need = storesNeeded(op, t);
      if (need > 0 || stores(op, t) > 0) line += '  ·  ' + Math.floor(stores(op, t)) + ' t stores' + (need > 0 ? ', ' + Math.ceil(need) + ' t short' : '');
    }
    return line;
  }

  var Outposts = {
    OUTPOST_FEE: OUTPOST_FEE, OUTPOST_MIN_DRONES: OUTPOST_MIN_DRONES, OUTPOST_WORK: OUTPOST_WORK,
    OUTPOST_HOPPER: OUTPOST_HOPPER, OUTPOST_STRIP: OUTPOST_STRIP,
    list: list, onClaim: onClaim, standing: standing, standingOn: standingOn, dronesOn: dronesOn,
    daysFor: daysFor, capFor: capFor, refusal: refusal, order: order, groundPos: groundPos,
    near: near, collectAll: collectAll, tick: tick, statusLine: statusLine,
    DIG_WORK: DIG_WORK, DIG_PER: DIG_PER, DIG_PER_RATING: DIG_PER_RATING, DUG_COST: DUG_COST,
    DIG_STORES: DIG_STORES, STORE_GOOD: STORE_GOOD, STORE_PER_WORK: STORE_PER_WORK, STORE_CONTRACT: STORE_CONTRACT,
    stores: stores, storesNeeded: storesNeeded, stallAt: stallAt, contractPrice: contractPrice,
    unloadRefusal: unloadRefusal, unloadStores: unloadStores, contractRefusal: contractRefusal, contractStores: contractStores,
    engRate: engRate, teamRate: teamRate, dug: dug, digDoneAt: digDoneAt, engineersAboard: engineersAboard,
    postRefusal: postRefusal, postTeam: postTeam, recallRefusal: recallRefusal, recallTeam: recallTeam,
    tickDig: tickDig, teamAboardBooks: teamAboardBooks
  };
  global.Outposts = Outposts;
  if (typeof module !== 'undefined' && module.exports) module.exports = Outposts;
})(typeof window !== 'undefined' ? window : globalThis);
