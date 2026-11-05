/* measure-economy.cjs — what a run actually pays (doctrine 6; 2026-11-04).
 *
 *     node tools/measure-economy.cjs runs 40 64     best runs, in-system and next door, 40 seeds, 64 t hold
 *     node tools/measure-economy.cjs wear 40         how fast the best lane wears out, run after run
 *     node tools/measure-economy.cjs tutorial        Halloway's first run, 40 openings (the test's seeds)
 *     node tools/measure-economy.cjs ships 40        how many good runs each step up the yard costs
 *     node tools/measure-economy.cjs climb 40        the hard start to a Tallyman, in runs
 *     node tools/measure-economy.cjs all 40
 *
 * WHY THIS EXISTS. The 2026-11-03 sweep that started the retune priced a
 * whole 64 t hold at the top of the book — the price on the board, not
 * the price the board would show after you had taken twenty tonnes off
 * it — and found a median best run of 133k cr on a 48k outlay. That is
 * also exactly what the market terminal charged a player who pressed
 * Home: one price for the whole lot, the dent landing on the NEXT trade.
 * So this measures both, side by side:
 *
 *   BOARD   the whole lot at the quote before the trade (what the
 *           terminal used to charge);
 *   WALKED  tonne by tonne down both shelves — what the terminal charges
 *           now (Economy.lotPrice) and what the trading houses always did —
 *           with a buyer who stops at the tonne that no longer pays (a
 *           player watching the price would).
 *
 * "Return" is profit over outlay: what a run does to the money you put in.
 * Fuel for a jump is counted against a run between systems, at the home
 * port's hydrogen ask, so distance is not free.
 */
'use strict';
global.window = global;
var path = require('path');
var S = path.join(__dirname, '..', 'src') + '/';
['vec3', 'rng', 'slipspace', 'kepler', 'mining'].forEach(function (m) { require(S + m + '.js'); });
var Eco = require(S + 'economy.js'), Gen = require(S + 'generate.js'), Galaxy = require(S + 'galaxy.js');
var Sim = require(S + 'sim.js');
var Combat = require(S + 'combat.js');
/* ECO_REF, ECO_SLOPE, ECO_KMIN, ECO_NEAR, ECO_NEARREF: sweep the levers
 * (economy.js TUNE) without editing the game. Set before anything is
 * generated, because the near-supply pass runs at generation. */
[['ECO_REF', 'ref'], ['ECO_SLOPE', 'slope'], ['ECO_KMIN', 'kmin'], ['ECO_NEAR', 'nearSupply'], ['ECO_NEARREF', 'nearRef'], ['ECO_NEARHI', 'nearHi']].forEach(function (e) {
  if (process.env[e[0]] !== undefined) Eco.TUNE[e[1]] = +process.env[e[0]];
});
/* The hard start's purse, read from the one place the game keeps it
 * (generate.js SHIP_SPEC.credits) so this tool cannot measure a start the
 * game no longer issues. ECO_PURSE sweeps it. */
if (process.env.ECO_PURSE !== undefined) Gen.SHIP_SPEC.credits = +process.env.ECO_PURSE;
var PURSE = Gen.SHIP_SPEC.credits;

var mode = process.argv[2] || 'all';
var SEEDS = +(process.argv[3] || 40), HOLD = +(process.argv[4] || 64);
var T0 = 10 * 86400;
var JUMP_STARS = 3;

function q(a, f) { a = a.slice().sort(function (x, y) { return x - y; }); return a.length ? a[Math.floor(f * (a.length - 1))] : NaN; }
function k(v) { return Math.abs(v) >= 1e4 ? Math.round(v / 1000) + 'k' : String(Math.round(v)); }
function pct(v) { return Math.round(v * 100) + '%'; }

function legal(cid) {
  var c = Eco.BY_ID[cid];
  return c && !c.contraband && !c.waste && !c.milfuel && cid !== 'parcel';
}
function trades(p) { return p.market && !p.dark && p.docking !== false && !p.fleet; }

/* The lot, walked or not. Returns {cost, gain, n} for the best n <= cap,
 * stopping at the first tonne that loses money when walked. */
function lot(A, B, cid, t, cap, walked, credits) {
  var stA = Eco.stock(A, cid, t), stB = Eco.stock(B, cid, t);
  var qa = Eco.quoteStock(A, cid, stA), qb = Eco.quoteStock(B, cid, stB);
  if (qa.buy === null || !(qa.buy > 0) || qb.sell === null) return null;
  var n = Math.min(cap, Math.floor(stA));
  if (credits !== undefined) n = Math.min(n, Math.floor(credits / qa.buy));
  if (n < 1) return null;
  if (!walked) return { cost: qa.buy * n, gain: qb.sell * n, n: n, cid: cid };
  /* Find the tonne past which it stops paying: walk both books a tonne at
   * a time (the shelf is smooth, so a tonne is fine-grained enough). */
  var cost = 0, gain = 0, best = null;
  for (var i = 0; i < n; i++) {
    var a = Eco.quoteStock(A, cid, Math.max(0, stA - i - 0.5)).buy;
    var b = Eco.quoteStock(B, cid, Math.min(B.market.rows[cid].cap, stB + i + 0.5)).sell;
    if (b - a <= 0) break;
    if (credits !== undefined && cost + a > credits) break;
    cost += a; gain += b;
    best = { cost: cost, gain: gain, n: i + 1, cid: cid };
  }
  return best;
}

function homeOf(seed) {
  var gal = Galaxy.build(seed), cache = {};
  function sysOf(st) { if (!cache[st.id]) { cache[st.id] = Gen.generateSystem(st.seed, Galaxy.systemOpts(gal, st)); cache[st.id].starId = st.id; } return cache[st.id]; }
  return { gal: gal, sys: sysOf(gal.home), sysOf: sysOf };
}

/* Every legal good, every ordered pair of trading ports. */
function bestRun(As, Bs, t, cap, walked, credits, fuelCr) {
  var best = null, bestRoi = null;
  As.forEach(function (A) {
    A.market.order.forEach(function (cid) {
      if (!legal(cid) || !A.market.rows[cid].exporter) return;
      Bs.forEach(function (B) {
        if (B === A || !B.market.rows[cid]) return;
        var r = lot(A, B, cid, t, cap, walked, credits);
        if (!r) return;
        r.profit = r.gain - r.cost - (fuelCr || 0);
        r.roi = r.profit / r.cost;
        r.from = A.name; r.to = B.name; r.A = A; r.B = B;
        if (!best || r.profit > best.profit) best = r;
        if (r.profit > 2000 && (!bestRoi || r.roi > bestRoi.roi)) bestRoi = r;
      });
    });
  });
  return best ? { best: best, bestRoi: bestRoi } : null;
}

function neighbours(h) {
  var home = h.gal.home;
  return h.gal.stars.filter(function (s) { return s.id !== home.id && s.factionId; })
    .sort(function (a, b) { return Galaxy.distance3(a, home) - Galaxy.distance3(b, home); }).slice(0, JUMP_STARS);
}

function talonFuelCr(home, ly, cid, n, t) {
  var h = Combat.HULLS.talon, cargo = {}; cargo[cid] = n;
  var fuelT = Galaxy.jumpFuel({ dryMass: h.dryMass, fuel: h.fuelCap, thrusterFuel: h.thrusterCap, cargo: cargo }, ly);
  var hp = home.market.rows.hydrogen ? Eco.quoteStock(home, 'hydrogen', Eco.stock(home, 'hydrogen', t)).buy : 55;
  return { t: fuelT, cr: fuelT * hp };
}

function runs(n, cap) {
  var rows = { board: [], walked: [], next: [], waste: [] };
  for (var s = 0; s < n; s++) {
    var h = homeOf('seed' + s), ports = h.sys.ports.filter(trades);
    var b = bestRun(ports, ports, T0, cap, false), w = bestRun(ports, ports, T0, cap, true);
    if (b) rows.board.push(b);
    if (w) {
      rows.walked.push(w);
      /* ECO_DEBUG=1.0: name every best run returning over 100%. */
      if (process.env.ECO_DEBUG && w.best.roi > +process.env.ECO_DEBUG) console.log('   over: seed' + s + ' ' + w.best.cid + ' ' + w.best.n + ' t, ' + k(w.best.cost) + ' in, ' + k(w.best.profit) + ' out, ' + w.best.from + ' -> ' + w.best.to);
    }
    /* Next door: from any home port to any port of the three nearest
     * claimed stars, walked, with the jump's hydrogen paid. */
    var bestN = null;
    neighbours(h).forEach(function (st) {
      var ly = Galaxy.distance3(st, h.gal.home), sysB = h.sysOf(st);
      var Bs = sysB.ports.filter(trades);
      ports.forEach(function (A) {
        var r = bestRun([A], Bs, T0, cap, true);
        if (!r) return;
        var f = talonFuelCr(A, ly, r.best.cid, r.best.n, T0);
        if (f.t > Combat.HULLS.talon.fuelCap) return;
        r.best.profit -= f.cr; r.best.roi = r.best.profit / r.best.cost; r.best.ly = ly;
        if (!bestN || r.best.profit > bestN.profit) bestN = r.best;
      });
    });
    if (bestN) rows.next.push(bestN);
    /* Waste: paid to load at a producer, dumped at a sink in-system. */
    var wb = null;
    ports.forEach(function (A) {
      var ra = A.market.rows.waste;
      if (!ra || ra.sink) return;
      ports.forEach(function (B) {
        var rb = B.market.rows.waste;
        if (!rb || !rb.sink) return;
        var stA = Eco.stock(A, 'waste', T0), nn = Math.min(cap, Math.floor(stA));
        if (nn < 1) return;
        var get = 0, pay = 0;
        for (var i = 0; i < nn; i++) {
          get += -Eco.quoteStock(A, 'waste', stA - i - 0.5).buy;
          pay += -Eco.quoteStock(B, 'waste', Math.min(rb.cap, Eco.stock(B, 'waste', T0) + i + 0.5)).sell;
        }
        var pr = get - pay;
        if (!wb || pr > wb.profit) wb = { profit: pr, n: nn };
      });
    });
    if (wb) rows.waste.push(wb);
  }
  function show(label, list, pick) {
    var L = list.map(pick);
    var prof = L.map(function (r) { return r.profit; }), roi = L.map(function (r) { return r.roi; }), out = L.map(function (r) { return r.cost; });
    console.log(label + '  (' + L.length + ' systems)');
    console.log('   profit p10/med/p90/max ' + [0.1, 0.5, 0.9, 1].map(function (f) { return k(q(prof, f)); }).join(' / ') +
                '   outlay med ' + k(q(out, 0.5)) +
                '   return p10/med/p90/max ' + [0.1, 0.5, 0.9, 1].map(function (f) { return pct(q(roi, f)); }).join(' / '));
    var goods = {}; L.forEach(function (r) { goods[r.cid] = (goods[r.cid] || 0) + 1; });
    console.log('   goods ' + Object.keys(goods).sort(function (a, b) { return goods[b] - goods[a]; }).map(function (g) { return g + ' ' + goods[g]; }).join(', '));
  }
  console.log('--- best run, ' + n + ' seeds, ' + cap + ' t hold, unlimited credit ---');
  show('IN-SYSTEM, priced at the BOARD (the whole lot at the pre-trade quote)', rows.board, function (r) { return r.best; });
  show('IN-SYSTEM, WALKED (tonne by tonne down the shelf)', rows.walked, function (r) { return r.best; });
  show('IN-SYSTEM, WALKED, best RETURN (any run clearing 2,000 cr)', rows.walked.filter(function (r) { return r.bestRoi; }), function (r) { return r.bestRoi; });
  show('NEXT DOOR (3 nearest claimed stars), WALKED, less jump fuel', rows.next, function (r) { return r; });
  var lys = rows.next.map(function (r) { return r.ly; });
  console.log('   jump ly med ' + q(lys, 0.5).toFixed(2));
  var ratio = [];
  for (var i = 0; i < Math.min(rows.walked.length, rows.next.length); i++) ratio.push(rows.next[i].profit / rows.walked[i].best.profit);
  console.log('   next-door best / in-system best, per seed: med ' + q(ratio, 0.5).toFixed(2) + '  p10 ' + q(ratio, 0.1).toFixed(2));
  var wp = rows.waste.map(function (r) { return r.profit; });
  console.log('WASTE run in-system (paid to load, fee to dump), ' + rows.waste.length + ' systems: profit p10/med/p90/max ' +
              [0.1, 0.5, 0.9, 1].map(function (f) { return k(q(wp, f)); }).join(' / '));
  return rows;
}

/* The best in-system lane, flown again and again: a round trip a day,
 * both legs through applyTrade, so the dent each delivery leaves is the
 * one the next run meets. */
function wear(n, cap) {
  var byRun = [[], [], [], [], [], []];
  for (var s = 0; s < n; s++) {
    var h = homeOf('seed' + s), ports = h.sys.ports.filter(trades);
    var w = bestRun(ports, ports, T0, cap, true);
    if (!w) continue;
    var A = w.best.A, B = w.best.B;
    var cid = w.best.cid, t = T0, first = null;
    for (var r = 0; r < byRun.length; r++) {
      var L = lot(A, B, cid, t, cap, true);
      var p = L ? L.gain - L.cost : 0;
      if (first === null) first = p;
      byRun[r].push(first > 0 ? p / first : 0);
      if (L) { Eco.applyTrade(A, cid, L.n, t); Eco.applyTrade(B, cid, -L.n, t + 3 * 3600); }
      t += 86400;
    }
  }
  console.log('--- lane wear: the best in-system lane, one round trip a day, ' + n + ' seeds ---');
  console.log('   run 1..6, median profit as a share of the first: ' + byRun.map(function (a) { return pct(q(a, 0.5)); }).join(' / '));
}

/* Halloway's first run, on the tutorial test's own forty openings. */
function tutorial() {
  var T = require(S + 'tutorial.js');
  var seeds = ['kawartha'];
  for (var s = 0; s < 39; s++) seeds.push('tut-' + s);
  var board = [], walked = [], outlay = [], goods = {};
  seeds.forEach(function (sd) {
    var galaxy = Galaxy.build(sd), star = galaxy.home;
    var sys = Gen.generateSystem(star.seed, Galaxy.systemOpts(galaxy, star));
    var host = null;
    sys.bodies.forEach(function (b) { if (b.kind === 'station' && !b.surface && !host) host = b.parentBody; });
    if (!host) return;
    var station = host.children.filter(function (c) { return c.kind === 'station' && !c.surface && c.orbit; })[0];
    var port = sys.ports.filter(function (p) { return p.surface && p.parentBody === host && p.market; })[0] || station;
    if (!port) return;
    var p = T.plan(sys, port, 0, PURSE, 64);
    if (!p.cid) return;
    var nn = Math.min(64, Math.floor(PURSE / p.buy), Math.floor(Eco.stock(port, p.cid, 0)));
    board.push((p.sell - p.buy) * nn);
    goods[p.cid] = (goods[p.cid] || 0) + 1;
    var L = lot(port, p.dest, p.cid, 0, 64, true, PURSE);
    walked.push(L ? L.gain - L.cost : 0);
    outlay.push(L ? L.cost : 0);
  });
  console.log('--- Halloway\'s first run, ' + board.length + ' openings, ' + PURSE + ' cr Talon ---');
  console.log('   board (as tutorial.test prints it)  min/med/max ' + k(q(board, 0)) + ' / ' + k(q(board, 0.5)) + ' / ' + k(q(board, 1)));
  console.log('   walked (what the terminal charges)  min/p10/med/p90/max ' + [0, 0.1, 0.5, 0.9, 1].map(function (f) { return k(q(walked, f)); }).join(' / ') +
              '   outlay med ' + k(q(outlay, 0.5)));
  console.log('   goods ' + Object.keys(goods).sort(function (a, b) { return goods[b] - goods[a]; }).map(function (g) { return g + ' ' + goods[g] + ' (' + Eco.BY_ID[g].base + ')'; }).join(', '));
}

/* What a step up costs in runs: the next hull's yard price, less the
 * trade-in of the one you arrive in, over the median best in-system
 * walked run at the hold you are flying. The ladder a trader climbs. */
/* A MIXED HOLD between A and B: every good's own walked lot, best per
 * tonne first, until the hold is full. A big hull does not carry one good
 * — a single lane walks its shelf flat long before 320 t — so measuring
 * her on one would say a Longhaul earns what a Mule does. */
function mixedRun(A, B, t, cap) {
  var lots = [];
  A.market.order.forEach(function (cid) {
    if (!legal(cid) || !A.market.rows[cid].exporter || !B.market.rows[cid]) return;
    var r = lot(A, B, cid, t, cap, true);
    if (r && r.gain > r.cost) lots.push(r);
  });
  lots.sort(function (x, y) { return (y.gain - y.cost) / y.n - (x.gain - x.cost) / x.n; });
  var room = cap, cost = 0, gain = 0, load = {};
  for (var i = 0; i < lots.length && room > 0; i++) {
    var f = Math.min(1, room / lots[i].n);
    cost += lots[i].cost * f; gain += lots[i].gain * f; room -= lots[i].n * f; load[lots[i].cid] = lots[i].n * f;
  }
  return { cost: cost, gain: gain, profit: gain - cost, load: load, tonnes: cap - room };
}
function fuelFor(hullId, home, ly, load, t) {
  var h = Combat.HULLS[hullId];
  var fuelT = Galaxy.jumpFuel({ dryMass: h.dryMass, fuel: h.fuelCap, thrusterFuel: h.thrusterCap, cargo: load }, ly);
  var hp = home.market.rows.hydrogen ? Eco.quoteStock(home, 'hydrogen', Eco.stock(home, 'hydrogen', t)).buy : 55;
  return { t: fuelT, cr: fuelT * hp, ok: fuelT <= h.fuelCap };
}
/* A GOOD RUN for a hull: the better of the best mixed hold inside the home
 * system and the best one to a port of the three nearest claimed stars her
 * tank reaches laden, jump hydrogen paid. */
function goodRun(h, hullId) {
  var cap = Combat.HULLS[hullId].cargoCap, ports = h.sys.ports.filter(trades), best = 0, bestN = 0;
  ports.forEach(function (A) { ports.forEach(function (B) { if (A !== B) best = Math.max(best, mixedRun(A, B, T0, cap).profit); }); });
  neighbours(h).forEach(function (st) {
    var ly = Galaxy.distance3(st, h.gal.home), Bs = h.sysOf(st).ports.filter(trades);
    ports.forEach(function (A) {
      Bs.forEach(function (B) {
        var r = mixedRun(A, B, T0, cap);
        if (!(r.profit > 0)) return;
        var f = fuelFor(hullId, A, ly, r.load, T0);
        if (f.ok) bestN = Math.max(bestN, r.profit - f.cr);
      });
    });
  });
  return { local: best, next: bestN, run: Math.max(best, bestN) };
}

var LADDER = ['talon', 'trader', 'mule', 'longhaul', 'leviathan'];
var SIDE = ['dart', 'bollard', 'sump', 'fighter', 'kestrel', 'tanker', 'crawler', 'meridian', 'cutter'];
function ships(n) {
  var med = {}, local = {}, next = {}, hs = [];
  for (var s = 0; s < n; s++) hs.push(homeOf('seed' + s));
  LADDER.concat(SIDE).forEach(function (id) {
    var p = [], pl = [], pn = [];
    hs.forEach(function (h) { var g = goodRun(h, id); p.push(g.run); pl.push(g.local); pn.push(g.next); });
    med[id] = q(p, 0.5); local[id] = q(pl, 0.5); next[id] = q(pn, 0.5);
  });
  console.log('--- the yard in runs: median GOOD run (best mixed hold, in-system or next door), ' + n + ' seeds ---');
  LADDER.concat(SIDE).forEach(function (id, i) {
    var H = Combat.HULLS[id];
    var line = '   ' + id + ' (' + H.cargoCap + ' t) yard ' + k(Combat.buyPrice(id)) + ', run ' + k(med[id]) +
               ' (in-system ' + k(local[id]) + ', next door ' + k(next[id]) + ')';
    if (i > 0 && i < LADDER.length) {
      var prev = LADDER[i - 1], cost = Combat.buyPrice(id) - Math.round(Combat.HULLS[prev].price * 0.7);
      line += '\n      step from ' + prev + ': ' + k(cost) + ' net of trade-in = ' + (cost / med[prev]).toFixed(1) + ' good runs of a ' + prev;
    }
    if (i >= LADDER.length) line += '   = ' + (Combat.buyPrice(id) / med.talon).toFixed(1) + ' Talon runs from scratch';
    console.log(line);
  });
}

/* THE HARD START, CLIMBED: the hard start's purse and a Talon, the best walked run the
 * money covers each day (in-system), every trade pressed into both
 * markets so the lanes wear as they would, until the purse buys the
 * Tallyman at the yard less the Talon's trade-in. Counts runs. */
function climb(n) {
  var need = Combat.buyPrice('trader') - Math.round(Combat.HULLS.talon.price * 0.7), out = [], stuck = 0;
  for (var s = 0; s < n; s++) {
    var h = homeOf('seed' + s), ports = h.sys.ports.filter(trades), cr = PURSE, t = T0, runsN = 0;
    while (cr < need && runsN < 80) {
      var w = bestRun(ports, ports, t, 64, true, cr);
      runsN++;
      if (w && w.best.profit > 0) {
        Eco.applyTrade(w.best.A, w.best.cid, w.best.n, t);
        Eco.applyTrade(w.best.B, w.best.cid, -w.best.n, t + 3 * 3600);
        cr += w.best.profit;
      }
      t += 86400 / 2;
    }
    if (cr >= need) out.push(runsN); else stuck++;
  }
  console.log('--- the hard start to a Tallyman (' + k(need) + ' cr net of the Talon), two runs a day, in-system, ' + n + ' seeds ---');
  console.log('   runs p10/med/p90 ' + q(out, 0.1) + ' / ' + q(out, 0.5) + ' / ' + q(out, 0.9) + (stuck ? '   not there in 80: ' + stuck : ''));
}

if (mode === 'climb' || mode === 'all') climb(SEEDS);
if (mode === 'runs' || mode === 'all') runs(SEEDS, HOLD);
if (mode === 'wear' || mode === 'all') wear(SEEDS, HOLD);
if (mode === 'tutorial' || mode === 'all') tutorial();
if (mode === 'ships' || mode === 'all') ships(SEEDS);
