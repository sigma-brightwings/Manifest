/* wars.js - resource wars between the empires (claude/resource-wars.md).
 *
 * Astra, 2026-10-18: "if there's a finite amount of resources in the game,
 * that means factions WILL go to war against each other in mid to late
 * game." Decided with her the same day:
 *
 *   WORLDS ONLY run out, and "finite" is a WORKABLE RESERVE: the survey's
 *   tonnage is the whole crust (~2e10 t a system against ~1,100 t/day of
 *   industry - nothing physically runs out), and each system also has a
 *   cheap-to-dig reserve that its industry draws down on the clock.
 *   SCARCITY is felt inside a game year; first WARS in years two to three.
 *
 *   A WAR STARTS FROM SCARCITY x CHAOS. Chaos is "how many of their systems
 *   are letting criminals go unpunished just for the access to the
 *   resources": the share of an empire's systems where the law has been
 *   bought (corruption at the 'bought' line, 60, Combat.corruptionLabel) or
 *   that the Syndicate holds. Scarcity pushes systems over the line - a
 *   short empire tolerates whoever brings it ore - and so does the player,
 *   through the same corruption shift bribes already leave.
 *
 * SEED + CLOCK. Nothing ticks: the history is stepped month by month from
 * t = 0 whenever it is asked for and cached, and it is the same history
 * every time for the same seed and the same player. The only player input
 * is G.corruptionShift, so the cache key carries it.
 *
 * The empires are the majors (no parentId); powers and the Syndicate count
 * toward the empire they operate inside (faction-hierarchy). Wars are only
 * declared on a rival (galaxy.rivals).
 */
(function (global) {
  'use strict';

  var DAY = 86400, YEAR = 365 * DAY, MONTH = YEAR / 12;
  var TAU_BASE = 2.0 * YEAR;      // scarcity 1 - e^-t/tau: ~0.39 at a year, ~0.63 at two
  var DRIFT = 25;                 // corruption points a fully dry system drifts toward the line
  var LINE = 60;                  // 'bought' (Combat.corruptionLabel)
  var CHAOS_K = 0.2;              // pressure = scarcity x (CHAOS_K + chaos)
  var PRESSURE_WAR = 0.55;        // tuned for first wars in years 2-3 (wars.test measures it)
  var WAR_MIN_M = 2, WAR_SPAN_M = 5;   // a war lasts 2-6 months
  var COOLDOWN_M = 12;            // an aggressor rests a year after a war
  var REACH_LY = 30;              // a target must be this close to the aggressor's territory
  var ATTACK_EDGE = 1.2;
  var MAX_YEARS = 40;

  function hash01(s) {
    var h = 2166136261 >>> 0;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995) >>> 0; h ^= h >>> 15;
    return (h >>> 0) / 4294967296;
  }

  /* ---- the galaxy, summarised once --------------------------------------
   * One generation pass over every star (about 2.7 ms each), keeping only
   * what the model reads. Not G.systemCache: two hundred whole systems
   * held for a handful of numbers would be the wrong trade. */
  var ORE = ['ores', 'rare', 'fissile'];
  var sumCache = {};
  function empireOf(gal, facId) {
    var f = gal.factionById && gal.factionById[facId], guard = 0;
    while (f && f.parentId && guard++ < 6) f = gal.factionById[f.parentId];
    return f ? f.id : null;
  }
  function summaries(gal, genOverride) {
    var key = gal.seed;
    if (sumCache[key]) return sumCache[key];
    var Gen = genOverride || global.Gen;
    var out = [], byId = {}, oreAll = [];
    gal.stars.forEach(function (st) {
      var fac = gal.factionById ? gal.factionById[st.factionId] : null;
      /* nobody's star (2026-10-24): empty, nothing to fight over yet */
      var s = Gen.generateSystem(st.seed, fac ? { faction: fac, allFactions: gal.factions } : { empty: true, allFactions: gal.factions });
      var ore = 0;
      (s.ports || []).forEach(function (p) {
        var rows = p.market && p.market.rows;
        if (!rows) return;
        ORE.forEach(function (cid) { if (rows[cid]) ore += rows[cid].prod || 0; });
      });
      var rec = { id: st.id, x: st.x, y: st.y, z: st.z, name: st.name, fac: st.factionId,
                  empire: empireOf(gal, st.factionId),
                  corr: s.corruption !== undefined ? s.corruption : 40,
                  held: !!s.pirateHeld, ore: ore };
      out.push(rec); byId[st.id] = rec;
      if (ore > 0) oreAll.push(ore);
    });
    oreAll.sort(function (a, b) { return a - b; });
    var med = oreAll.length ? oreAll[oreAll.length >> 1] : 1;
    out.forEach(function (r) {
      /* Busier industry draws its reserve down faster; a hashed spread so
       * neighbours do not run dry on the same day. */
      var busy = r.ore > 0 ? Math.pow(med / r.ore, 0.3) : 2;
      r.tau = TAU_BASE * (0.75 + 0.55 * hash01(gal.seed + '|tau|' + r.id)) * busy;
    });
    sumCache[key] = { list: out, byId: byId, empires: (gal.factions || []).filter(function (f) {
      return !f.parentId && !f.outlaw; }).map(function (f) { return f.id; }) };
    return sumCache[key];
  }

  function scarcityOf(r, t) { return t <= 0 ? 0 : 1 - Math.exp(-t / r.tau); }

  /* The player's corruption shift at time t, reconstructed from the one
   * record bribes keep ({v, t}: nothing before it, halving after). */
  var HALF = 21 * DAY;   // Combat CORRUPTION_HALFLIFE
  function shiftAt(G, id, t) {
    var e = G && G.corruptionShift && G.corruptionShift[id];
    if (!e || !e.v || t < (e.t || 0)) return 0;
    return e.v * Math.pow(0.5, (t - (e.t || 0)) / HALF);
  }
  function tolerance(G, r, t) { return r.corr + DRIFT * scarcityOf(r, t) + shiftAt(G, r.id, t); }
  function tolerating(G, r, t) { return r.held || tolerance(G, r, t) >= LINE; }

  /* ---- the history -------------------------------------------------------- */
  var histCache = {};
  function shiftKey(G) {
    var cs = (G && G.corruptionShift) || {}, ks = Object.keys(cs).sort(), s = '';
    ks.forEach(function (k) { if (cs[k] && cs[k].v > 0.5) s += k + ':' + Math.round(cs[k].v) + '@' + Math.round((cs[k].t || 0) / DAY) + ';'; });
    return s;
  }

  function empireStats(sum, owner, G, t) {
    var st = {};
    sum.empires.forEach(function (e) { st[e] = { n: 0, w: 0, sw: 0, tol: 0 }; });
    sum.list.forEach(function (r) {
      var e = owner[r.id];
      if (!st[e]) return;
      var x = st[e], w = Math.max(1, r.ore);
      x.n++; x.w += w; x.sw += w * scarcityOf(r, t);
      if (tolerating(G, r, t)) x.tol++;
    });
    Object.keys(st).forEach(function (e) {
      var x = st[e];
      x.scarcity = x.w ? x.sw / x.w : 0;
      x.chaos = x.n ? x.tol / x.n : 0;
      x.pressure = x.scarcity * (CHAOS_K + x.chaos);
    });
    return st;
  }

  function dist(a, b) { var dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z; return Math.sqrt(dx * dx + dy * dy + dz * dz); }

  function pickTarget(gal, sum, owner, att, def, t) {
    var mine = sum.list.filter(function (r) { return owner[r.id] === att; });
    var best = null, bestScore = -1;
    sum.list.forEach(function (r) {
      if (owner[r.id] !== def || r.held) return;
      var d = Infinity;
      for (var i = 0; i < mine.length; i++) d = Math.min(d, dist(r, mine[i]));
      if (d > REACH_LY) return;
      var score = (1 - scarcityOf(r, t)) * Math.max(1, r.ore) / (1 + d / 20);
      if (score > bestScore) { bestScore = score; best = r; }
    });
    return best;
  }

  /* Stepped from month 0 to the month containing t. Returns
   * { wars: [{att, def, star, starName, t0, t1, won, ...}], owner: {id: empire} }. */
  function history(gal, G, t, genOverride) {
    var sum = summaries(gal, genOverride);
    var months = Math.max(0, Math.min(MAX_YEARS * 12, Math.floor((t || 0) / MONTH)));
    var key = gal.seed + '|' + shiftKey(G);
    var h = histCache[key];
    if (h && h.months >= months) return h;
    h = { months: 0, wars: [], owner: {}, rest: {}, stats: [] };
    sum.list.forEach(function (r) { h.owner[r.id] = r.empire; });
    var rivals = gal.rivals || {};
    for (var m = 1; m <= Math.max(months, 1); m++) {
      var tm = m * MONTH;
      /* Wars that end this month. */
      h.wars.forEach(function (w) {
        if (w.done || tm < w.t1) return;
        w.done = true;
        if (w.won) h.owner[w.star] = w.att;
        h.rest[w.att] = w.t1 + COOLDOWN_M * MONTH;
      });
      var st = empireStats(sum, h.owner, G, tm);
      if (m % 3 === 0) h.stats.push({ t: tm, s: st });
      var atWar = {};
      h.wars.forEach(function (w) { if (!w.done) atWar[w.att] = true; });
      sum.empires.forEach(function (att) {
        var a = st[att];
        if (atWar[att] || (h.rest[att] || 0) > tm || a.pressure < PRESSURE_WAR) return;
        /* On the rival whose border holds the richest ore it can reach. */
        var best = null;
        sum.empires.forEach(function (def) {
          if (def === att || !(rivals[att] && rivals[att][def])) return;
          var tg = pickTarget(gal, sum, h.owner, att, def, tm);
          if (tg && (!best || (1 - scarcityOf(tg, tm)) * tg.ore > (1 - scarcityOf(best.tg, tm)) * best.tg.ore)) best = { def: def, tg: tg };
        });
        if (!best) return;
        var d = st[best.def];
        var sa = a.n * (1 - a.chaos) * ATTACK_EDGE, sd = d.n * (1 - d.chaos);
        var p = sa / Math.max(1e-6, sa + sd);
        var id = att + '>' + best.tg.id + '@' + m;
        var len = WAR_MIN_M + Math.floor(hash01(gal.seed + '|len|' + id) * WAR_SPAN_M);
        h.wars.push({ id: id, att: att, def: best.def, star: best.tg.id, starName: best.tg.name,
                      t0: tm, t1: tm + len * MONTH, odds: p, won: hash01(gal.seed + '|win|' + id) < p,
                      pressure: a.pressure, chaos: a.chaos, scarcity: a.scarcity });
        atWar[att] = true;
      });
    }
    h.months = Math.max(months, 1);
    histCache[key] = h;
    return h;
  }

  /* ---- what the rest of the game asks ------------------------------------- */
  /* Who holds a star at time t (an empire id), and the war over it if any. */
  function ownerAt(gal, G, starId, t) {
    var h = history(gal, G, t), sum = summaries(gal);
    var r = sum.byId[starId];
    var own = r ? r.empire : null;
    h.wars.forEach(function (w) { if (w.star === starId && w.won && w.t1 <= t) own = w.att; });
    return own;
  }
  function warsAt(gal, G, t) {
    return history(gal, G, t).wars.filter(function (w) { return w.t0 <= t && t < w.t1; });
  }
  function contested(gal, G, starId, t) {
    var ws = warsAt(gal, G, t);
    for (var i = 0; i < ws.length; i++) if (ws[i].star === starId) return ws[i];
    return null;
  }
  function stateAt(gal, G, t) {
    var sum = summaries(gal), h = history(gal, G, t);
    var owner = {};
    sum.list.forEach(function (r) { owner[r.id] = r.empire; });
    h.wars.forEach(function (w) { if (w.won && w.t1 <= t) owner[w.star] = w.att; });
    return empireStats(sum, owner, G, t);
  }
  function systemScarcity(gal, starId, t) {
    var r = summaries(gal).byId[starId];
    return r ? scarcityOf(r, t) : 0;
  }

  var Wars = {
    YEAR: YEAR, MONTH: MONTH, LINE: LINE, PRESSURE_WAR: PRESSURE_WAR,
    summaries: summaries, empireOf: empireOf, history: history, ownerAt: ownerAt, warsAt: warsAt,
    contested: contested, stateAt: stateAt, systemScarcity: systemScarcity, scarcityOf: scarcityOf,
    tolerance: tolerance,
    _reset: function () { sumCache = {}; histCache = {}; }
  };
  global.Wars = Wars;
  if (typeof module !== 'undefined' && module.exports) module.exports = Wars;
})(typeof window !== 'undefined' ? window : globalThis);
