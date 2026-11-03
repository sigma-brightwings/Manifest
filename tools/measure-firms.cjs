/* measure-firms.cjs — where the trading houses are, and what a quarter does
 * (doctrine 6: measure before choosing a threshold; 2026-11-03).
 *
 *     node tools/measure-firms.cjs                 placement + outcomes, 20 seeds
 *     node tools/measure-firms.cjs place 30        placement only, 30 seeds
 *     node tools/measure-firms.cjs quarters 20 4   outcomes: seeds, quarters
 *     node tools/measure-firms.cjs onegood 20 4    the same, the list cut to one cheap good
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

/* One career: a galaxy, its home, a Talon at the best civilian port, a
 * firm there at `rating`. Returns every quarter's history entry. */
function run(seed, rating, quarters, budget, hullId, oneGood) {
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
  var ship = { credits: budget * 10, cargo: {} };
  Combat.initShip(ship);
  var G = { t: 10 * 86400, galaxy: gal, here: home, sys: sys, ship: ship, fleet: [] };
  var hs = {}; Combat.initShip(hs); hs.hullId = hullId; hs.cargo = {}; hs.fit = {}; hs.crew = [Crew.make('Pilot', 'pilot', 3)];
  var rec = Fleet.park(G, hs, port.id, 'Measured');
  rec.portName = port.name;
  /* `oneGood`: the account restricted to the cheapest good its port
   * exports — the narrowest list a player might hand over. */
  var goods = [];
  if (oneGood) {
    var ex = port.market.order.filter(function (k) { return port.market.rows[k].exporter && TF.legalGood(k); })
      .sort(function (a, b) { return Eco.BY_ID[a].base - Eco.BY_ID[b].base; });
    if (ex.length) goods = [ex[0]];
  }
  var r = TF.engage(G, firm, port, sys, { hulls: [rec.id], budget: budget, goods: goods }, G.t);
  if (!r.ok) return null;
  /* A losing quarter would close the account and end the measurement, so
   * the run keeps a SECOND book of what each quarter did by re-opening
   * after a drop: the question is how often quarters lose, not how long
   * the first account lasts. */
  var out = [], c = r.contract, t = G.t;
  for (var k = 1; k <= quarters; k++) {
    TF.book(G, t + k * TF.QUARTER + 1);
    var h = c.history[c.history.length - 1];
    if (h && out.indexOf(h) < 0) out.push({ profit: h.profit, start: h.start, verdict: h.verdict, legs: c.legs, jumps: c.jumps || 0 });
    if (c.closing || c.closed) {
      TF.book(G, t + k * TF.QUARTER + 30 * 86400);
      if (!rec.trade) {
        var r2 = TF.engage(G, firm, sys.byId[rec.port] || port, TF._systemOf(G, rec.star) || sys,
                           { hulls: [rec.id], budget: budget, goods: goods }, t + k * TF.QUARTER + 30 * 86400);
        if (!r2.ok) break;
        c = r2.contract;
        t = t + 30 * 86400;
      } else break;
    }
  }
  return out;
}

function quarters(n, nq, oneGood) {
  console.log('--- outcomes: ' + n + ' seeds, ' + nq + ' quarters, Talon, 20,000 cr budget, rating-3 pilot' +
              (oneGood ? ', ONE GOOD (the port\'s cheapest export)' : ', the house\'s choice of goods') + ' ---');
  var budget = 20000;
  for (var r = 1; r <= 5; r++) {
    var profits = [], mult = [], losing = 0, total = 0, seedsLost = 0, t0 = Date.now();
    for (var s = 0; s < n; s++) {
      var qs = run('seed' + s, r, nq, budget, 'talon', oneGood);
      if (!qs) continue;
      var lostHere = false;
      qs.forEach(function (h) {
        total++; profits.push(h.profit); mult.push(h.profit / Math.max(1, h.start));
        if (h.profit <= 0) { losing++; lostHere = true; }
      });
      if (lostHere) seedsLost++;
    }
    var pq = q(profits, [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1]).map(fmt).join(' ');
    var mq = q(mult, [0.1, 0.5, 0.9]).map(fmt).join(' ');
    console.log('rating ' + r + ': quarter profit cr min/p10/p25/MEDIAN/p75/p90/max ' + pq +
                '  |  x of quarter-start equity p10/med/p90 ' + mq +
                '  |  losing quarters ' + losing + '/' + total + ' (' + (100 * losing / Math.max(1, total)).toFixed(1) + '%), ' +
                'seeds with one ' + seedsLost + '/' + n + '  [' + ((Date.now() - t0) / 1000).toFixed(0) + ' s]');
  }
}

if (mode === 'debug') console.log(JSON.stringify(run(process.argv[3] || 'seed0', +(process.argv[4] || 3), 3, 20000, 'talon')));
if (mode === 'all' || mode === 'place') placement(mode === 'place' ? SEEDS : 30);
if (mode === 'all' || mode === 'quarters') quarters(SEEDS, QUARTERS);
if (mode === 'all' || mode === 'onegood') quarters(SEEDS, QUARTERS, true);
