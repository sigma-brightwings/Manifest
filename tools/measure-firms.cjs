/* measure-firms.cjs — where the trading houses are, and what a quarter does
 * (doctrine 6: measure before choosing a threshold; 2026-11-03).
 *
 *     node tools/measure-firms.cjs                 placement + outcomes, 20 seeds
 *     node tools/measure-firms.cjs place 30        placement only, 30 seeds
 *     node tools/measure-firms.cjs quarters 20 4   outcomes: seeds, quarters
 *     node tools/measure-firms.cjs onegood 20 4    the same, the list cut to one cheap good
 *     node tools/measure-firms.cjs depth 20 2      the market-depth alternatives, side by side
 *
 * PLACEMENT: every port of the six nearest claimed stars of each seed's
 * galaxy, through TradingFirm.firmAt — the game's own function, so this is
 * what a player will find, not a re-derivation of it.
 *
 * OUTCOMES: one Talon (the hull a career starts in), a rating-3 pilot, a
 * 20,000 cr budget, the firm's choice of goods, at the most developed
 * civilian port of each seed's home system — run for N quarters at each
 * rating 1..5 with that port's firm forced to that rating, so the five
 * ratings are measured against the same seed, the same markets and the
 * same hull. Profit per quarter is reported both in credits and as a
 * multiple of the budget the quarter started with, and every losing
 * quarter is counted.
 */
'use strict';
global.window = global;
var path = require('path');
var S = path.join(__dirname, '..', 'src') + '/';
['vec3', 'rng', 'slipspace', 'kepler', 'mining'].forEach(function (m) { require(S + m + '.js'); });
var Eco = require(S + 'economy.js'), Gen = require(S + 'generate.js'), Galaxy = require(S + 'galaxy.js');
require(S + 'sim.js');
var Combat = require(S + 'combat.js'), Crew = require(S + 'crew.js'), Fleet = require(S + 'fleet.js');
require(S + 'tradeanalyser.js');
var TF = require(S + 'tradingfirm.js');

var mode = process.argv[2] || 'all';
var SEEDS = +(process.argv[3] || 20), QUARTERS = +(process.argv[4] || 4);

function q(a, fs) {
  a = a.slice().sort(function (x, y) { return x - y; });
  return fs.map(function (f) { return a.length ? a[Math.floor(f * (a.length - 1))] : NaN; });
}
function fmt(v) { return Math.abs(v) >= 1e4 ? Math.round(v / 1000) + 'k' : (Math.round(v * 100) / 100).toString(); }

function placement(n) {
  var systems = 0, withFirm = 0, firms = 0, ports = 0, civ = 0, ratings = [0, 0, 0, 0, 0, 0], caps = [0, 0, 0, 0, 0, 0];
  for (var s = 0; s < n; s++) {
    var gal = Galaxy.build('seed' + s);
    var stars = gal.stars.filter(function (st) { return st.factionId; })
      .sort(function (a, b) { return Galaxy.distance3(a, gal.home) - Galaxy.distance3(b, gal.home); }).slice(0, 6);
    stars.forEach(function (st) {
      var sys = Gen.generateSystem(st.seed, Galaxy.systemOpts(gal, st));
      systems++;
      var here = 0;
      sys.ports.forEach(function (p) {
        if (!p.market) return;
        ports++;
        if (TF.civilian(p, sys)) civ++;
        var f = TF.firmAt(p, sys);
        if (f) { here++; firms++; ratings[f.rating]++; caps[f.capacity]++; }
      });
      if (here) withFirm++;
    });
  }
  console.log('--- placement: ' + n + ' seeds x 6 nearest claimed stars ---');
  console.log('systems ' + systems + ', ports ' + ports + ', civilian ' + civ);
  console.log('firms ' + firms + '  (' + (firms / systems).toFixed(2) + ' per system, ' +
              (100 * firms / civ).toFixed(1) + '% of civilian ports, ' + (100 * firms / ports).toFixed(1) + '% of all)');
  console.log('systems with at least one firm: ' + withFirm + '/' + systems + ' = ' + (100 * withFirm / systems).toFixed(0) + '%');
  console.log('ratings 1..5: ' + ratings.slice(1).map(function (r) { return (100 * r / firms).toFixed(0) + '%'; }).join(' / '));
  console.log('capacity 1..5 hulls: ' + caps.slice(1).map(function (r) { return (100 * r / firms).toFixed(0) + '%'; }).join(' / '));
}

/* One career: a galaxy, its home, a hull at the best civilian port, a
 * house there at `rating`. `opt`: { oneGood, hand, tune }.
 *
 * EVERY QUARTER IS ITS OWN ACCOUNT, opened with the same budget at the
 * instant the last one closed and closed at its review: so a quarter's
 * profit is what a quarter does to `budget`, not to whatever an account
 * that compounded for a year had grown to (the first version measured the
 * compounded ones, and a quarter-4 figure on a 4M account said nothing
 * about the house). The hull, her port and the markets — and the house's
 * own footprint — carry on from quarter to quarter, as they would. */
function run(seed, rating, quarters, budget, hullId, opt) {
  opt = opt || {};
  var gal = Galaxy.build(seed), home = gal.home, cache = {};
  Fleet.systemFor = function (st) {
    if (!cache[st.id]) { cache[st.id] = Gen.generateSystem(st.seed, Galaxy.systemOpts(gal, st)); cache[st.id].starId = st.id; }
    return cache[st.id];
  };
  var sys = Fleet.systemFor(home);
  var port = sys.ports.filter(function (p) { return TF.civilian(p, sys); })
    .sort(function (a, b) { return b.market.dev - a.market.dev || (a.id < b.id ? -1 : 1); })[0];
  if (!port) return null;
  var firm = TF.statsFor('measure|' + seed, port);
  firm.rating = rating; firm.minAccount = 0; firm.capacity = 5;
  firm.commission = TF.COMMISSION[rating];
  var ship = { credits: budget * 100, cargo: {} };
  Combat.initShip(ship);
  ship.credits = budget * 100;
  var G = { t: 10 * 86400, galaxy: gal, here: home, sys: sys, ship: ship, fleet: [] };
  var hs = {}; Combat.initShip(hs); hs.hullId = hullId; hs.cargo = {}; hs.fit = {}; hs.crew = [Crew.make('Pilot', 'pilot', 3)];
  var rec = Fleet.park(G, hs, port.id, 'Measured');
  rec.portName = port.name;
  /* `oneGood`: the account restricted to the cheapest good its port
   * exports — the narrowest list a player might hand over. */
  var goods = [];
  if (opt.oneGood) {
    var ex = port.market.order.filter(function (k) { return port.market.rows[k].exporter && TF.legalGood(k); })
      .sort(function (a, b) { return Eco.BY_ID[a].base - Eco.BY_ID[b].base; });
    if (ex.length) goods = [ex[0]];
  }
  var out = [], t = G.t, trace = [];
  for (var k = 1; k <= quarters; k++) {
    /* The house opens the next account wherever she ended the last. */
    if (rec.star && rec.star !== G.here.id) {
      G.here = gal.stars.filter(function (x) { return x.id === rec.star; })[0];
      G.sys = Fleet.systemFor(G.here);
    }
    var at = G.sys;
    var r = TF.engage(G, firm, at.byId[rec.port] || port, at, { hulls: [rec.id], budget: budget, goods: goods }, t);
    if (!r.ok) { if (process.env.DEBUG) console.log('reopen refused: ' + r.why); break; }
    var c = r.contract;
    c.traceRuns = trace;
    if (opt.hand) { c.hand = opt.hand; c.commission = 0; }
    TF.book(G, t + TF.QUARTER);
    var h = c.history[0];
    if (h) out.push({ profit: h.profit, start: h.start, verdict: h.verdict, runs: h.runs, jumps: c.jumps || 0 });
    if (!c.closed && !c.closing) TF.close(G, c, t + TF.QUARTER);
    var tt = t + TF.QUARTER;
    while (!c.closed && tt < t + TF.QUARTER + 40 * 86400) { tt += 6 * 3600; TF.book(G, tt); }
    /* An account that ran dry closes before its review: its quarter is the
     * whole budget gone, less what was remitted. */
    if (!h) out.push({ profit: Math.round((c.withdrawn || 0) - budget), start: budget, verdict: 'empty', runs: c.legs || 0, jumps: c.jumps || 0 });
    t = c.closedAt || tt;
  }
  out.trace = trace;
  return out;
}

function stats(label, qs) {
  var profits = qs.map(function (h) { return h.profit; });
  var losing = qs.filter(function (h) { return h.profit <= 0 && h.runs > 0; }).length;
  var idle = qs.filter(function (h) { return h.runs === 0; }).length;
  var pq = q(profits, [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1]).map(fmt).join(' ');
  console.log(label + ': quarter profit cr min/p10/p25/MEDIAN/p75/p90/max ' + pq +
              '  |  real losses ' + losing + '/' + qs.length + ' (' + (100 * losing / Math.max(1, qs.length)).toFixed(1) + '%)' +
              '  |  idle ' + idle + '/' + qs.length);
  return q(profits, [0.5])[0];
}

/* How fast a lane flattens: a run "repeats" when the same good went from
 * the same port to the same port inside the last 14 days. The ratio is a
 * repeat's mean net over a fresh run's. */
function lanes(trace) {
  var fresh = [], again = [], last = {};
  trace.forEach(function (r) {
    var key = r[1] + '>' + r[2] + ':' + r[3];
    if (last[key] != null && r[0] - last[key] < 14 * 86400) again.push(r[4]); else fresh.push(r[4]);
    last[key] = r[0];
  });
  function mean(a) { return a.reduce(function (x, y) { return x + y; }, 0) / Math.max(1, a.length); }
  return { n: trace.length, repeatShare: again.length / Math.max(1, trace.length), fresh: mean(fresh), again: mean(again) };
}

var BUDGET = 50000;
function quarters(n, nq, oneGood) {
  console.log('--- outcomes: ' + n + ' seeds, ' + nq + ' quarters each opened afresh on ' + BUDGET.toLocaleString('en-US') +
              ' cr, Talon, rating-3 pilot' +
              (oneGood ? ', ONE GOOD (the port\'s cheapest export)' : ', the house\'s choice of goods') + ' ---');
  var hand = [];
  for (var s0 = 0; s0 < n; s0++) { var hq = run('seed' + s0, 3, nq, BUDGET, 'talon', { oneGood: oneGood, hand: { speed: HAND_SPEED } }); if (hq) hand = hand.concat(hq); }
  var base = stats('HAND-FLOWN baseline', hand);
  for (var r = 1; r <= 5; r++) {
    var all = [];
    for (var s = 0; s < n; s++) { var qs = run('seed' + s, r, nq, BUDGET, 'talon', { oneGood: oneGood }); if (qs) all = all.concat(qs); }
    var med = stats('rating ' + r, all);
    console.log('         median / hand-flown median = ' + (med / Math.max(1, base)).toFixed(2));
  }
}

/* The hand-flown baseline's in-system pace: a captain on the cruise drive
 * crosses a system in minutes, not the days a hired pilot's torch timetable
 * takes; 20x the timetable's speed puts a cross-system run at a few hours,
 * which with an hour or two at each clamp is a run every few hours, flown
 * end to end for the whole quarter — the most a hand on that hull could
 * make, limited by how fast the markets she drains refill. */
var HAND_SPEED = 20;

function depth(n, nq) {
  console.log('--- market depth: rating 4, ' + n + ' seeds, ' + nq + ' quarters on ' + BUDGET.toLocaleString('en-US') + ', the house\'s choice ---');
  var DAY = 86400;
  [{ footHalfLife: 4 * DAY, depthMul: 1, name: 'costs only (4 d, x1)' },
   { footHalfLife: 4 * DAY, depthMul: 2, name: 'deeper dent (4 d, x2)' },
   { footHalfLife: 4 * DAY, depthMul: 3, name: 'deeper dent (4 d, x3)' },
   { footHalfLife: 16 * DAY, depthMul: 1, name: 'slower memory (16 d, x1)' },
   { footHalfLife: 32 * DAY, depthMul: 1, name: 'slower memory (32 d, x1)' }].forEach(function (v) {
    var keep = { hl: TF.TUNE.footHalfLife, m: TF.TUNE.depthMul };
    TF.TUNE.footHalfLife = v.footHalfLife; TF.TUNE.depthMul = v.depthMul;
    var all = [], tr = [];
    for (var s = 0; s < n; s++) { var qs = run('seed' + s, 4, nq, BUDGET, 'talon', {}); if (qs) { all = all.concat(qs); tr = tr.concat(qs.trace); } }
    var L = lanes(tr);
    stats(v.name, all);
    console.log('         runs ' + L.n + ', repeating a lane inside 14 d ' + (100 * L.repeatShare).toFixed(0) + '%, fresh run ' +
                fmt(L.fresh) + ' cr vs repeat ' + fmt(L.again) + ' cr (' + (L.again / Math.max(1, L.fresh)).toFixed(2) + 'x)');
    TF.TUNE.footHalfLife = keep.hl; TF.TUNE.depthMul = keep.m;
  });
}

if (mode === 'debug') console.log(JSON.stringify(run(process.argv[3] || 'seed0', +(process.argv[4] || 3), 3, BUDGET, 'talon')));
if (mode === 'depth') depth(SEEDS, QUARTERS);
/* sweep: env MULS="1,3,6" HLS="16" RATINGS="1,4" — every combination, for
 * choosing the depth. */
if (mode === 'sweep') {
  (process.env.HLS || '16').split(',').forEach(function (hlD) {
    (process.env.MULS || '1').split(',').forEach(function (m) {
      TF.TUNE.footHalfLife = +hlD * 86400; TF.TUNE.depthMul = +m;
      (process.env.RATINGS || '1,4').split(',').forEach(function (r) {
        var all = [], tr = [];
        for (var s1 = 0; s1 < SEEDS; s1++) { var qq = run('seed' + s1, +r, QUARTERS, BUDGET, 'talon', { oneGood: !!process.env.ONEGOOD }); if (qq) { all = all.concat(qq); tr = tr.concat(qq.trace); } }
        var L = lanes(tr);
        stats('hl ' + hlD + ' d, x' + m + ', rating ' + r, all);
        console.log('         runs/quarter ' + (L.n / Math.max(1, all.length)).toFixed(0) + ', fresh ' + fmt(L.fresh) + ' repeat ' + fmt(L.again) + ' (' + (100 * L.repeatShare).toFixed(0) + '% repeats)');
      });
    });
  });
}
if (mode === 'hand') {
  var hh = [], tr0 = [];
  for (var hs0 = 0; hs0 < SEEDS; hs0++) { var hq0 = run('seed' + hs0, 3, QUARTERS, BUDGET, 'talon', { hand: { speed: HAND_SPEED } }); if (hq0) { hh = hh.concat(hq0); tr0 = tr0.concat(hq0.trace); } }
  stats('HAND-FLOWN baseline', hh);
  var LH = lanes(tr0);
  console.log('         runs ' + LH.n + ' (' + (LH.n / Math.max(1, hh.length)).toFixed(0) + ' a quarter), fresh ' + fmt(LH.fresh) + ' vs repeat ' + fmt(LH.again));
}
if (mode === 'all' || mode === 'place') placement(mode === 'place' ? SEEDS : 30);
if (mode === 'all' || mode === 'quarters') quarters(SEEDS, QUARTERS);
if (mode === 'all' || mode === 'onegood') quarters(SEEDS, QUARTERS, true);
