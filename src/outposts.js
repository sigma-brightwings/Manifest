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
    list(G).forEach(function (op) {
      if (op.announced || t < op.doneAt) return;
      op.announced = true; n++;
      var line = 'The outpost on ' + op.name + ' stands. Its drones are digging again, into its bins - empty them there (N).';
      if (hooks && hooks.say) hooks.say(line, 7);
      if (global.Journal && global.Journal.add) global.Journal.add(G, 'build', 'Outpost on ' + op.name + ' finished');
    });
    return n;
  }

  /* What the scanner map and the SURVEY page say about one. */
  function statusLine(G, op, t) {
    if (!standing(op, t)) return 'outpost building - stands in ' + Math.max(1, Math.ceil((op.doneAt - t) / DAY)) + ' days';
    var C = Cl(), tons = 0;
    dronesOn(G, op.key).forEach(function (d) { tons += C.hopper(G, d, t).tonnes; });
    return 'outpost standing - ' + Math.floor(tons) + ' t in the bins';
  }

  var Outposts = {
    OUTPOST_FEE: OUTPOST_FEE, OUTPOST_MIN_DRONES: OUTPOST_MIN_DRONES, OUTPOST_WORK: OUTPOST_WORK,
    OUTPOST_HOPPER: OUTPOST_HOPPER, OUTPOST_STRIP: OUTPOST_STRIP,
    list: list, onClaim: onClaim, standing: standing, standingOn: standingOn, dronesOn: dronesOn,
    daysFor: daysFor, capFor: capFor, refusal: refusal, order: order, groundPos: groundPos,
    near: near, collectAll: collectAll, tick: tick, statusLine: statusLine
  };
  global.Outposts = Outposts;
  if (typeof module !== 'undefined' && module.exports) module.exports = Outposts;
})(typeof window !== 'undefined' ? window : globalThis);
