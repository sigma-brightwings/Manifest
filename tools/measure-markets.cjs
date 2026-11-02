/* measure-markets.cjs — a census of every port market, for the 2026-11-02
 * market review (Astra: "all ports should have at least one major and one
 * minor import/export product. All ports import food, but some places also
 * produce food. Some commodities are absolutely required ... do a
 * meta-analysis of our current market and suggest changes").
 *
 *     node tools/measure-markets.cjs            # summary
 *     node tools/measure-markets.cjs json > x   # per-port rows for charts
 *
 * Reads the markets exactly as the game builds them (Gen.generateSystem,
 * after every post-pass), so it measures what a pilot meets, not what
 * buildPortMarket alone would make.
 */
'use strict';
global.window = global.window || global;
['vec3', 'rng', 'kepler', 'economy', 'generate', 'sim'].forEach(function (m) { require('../src/' + m + '.js'); });
var Galaxy = require('../src/galaxy.js');
var Eco = global.Economy, Gen = global.Gen;

var SEEDS = ['kawartha', 'alpha', 'pigeon', 'manifest', 'reverie', 'orrin', 'brian', 'abby'];
var STARS_PER = +(process.argv[3] || 60);
var FOOD = ['grain', 'livestock', 'fish', 'fruit'];
var REQUIRED = { fissile: 'reactor', hydrogen: 'fuel', food: 'food', ores: 'hull metal', alloys: 'hull metal' };

var ports = [], systems = [];
SEEDS.forEach(function (seed) {
  var g = Galaxy.build(seed);
  for (var s = 0; s < g.stars.length && s < STARS_PER; s++) {
    var star = g.stars[s];
    var sys = Gen.generateSystem(star.seed, Galaxy.systemOpts(g, star));
    if (!sys.ports || !sys.ports.length) continue;
    var sysRec = { seed: seed, name: sys.name, ports: [], heldBy: sys.heldBy || null };
    sys.ports.forEach(function (p) {
      var m = p.market;
      if (!m) return;
      var rows = [];
      Object.keys(m.rows).forEach(function (cid) {
        var r = m.rows[cid];
        var net = (r.prod || 0) - (r.cons || 0);
        rows.push({ cid: cid, prod: r.prod || 0, cons: r.cons || 0, net: net, ex: !!r.exporter, im: !!r.importer, local: r.local,
                    value: Math.abs(net) * Math.abs((Eco.BY_ID[cid] || {}).base || 0) });
      });
      var host = p.parentBody || {};
      var rec = { seed: seed, sys: sys.name, id: p.id, name: p.name, role: m.role, dev: m.dev, pop: m.pop,
                  host: host.type || '?', surface: !!p.surface, rows: rows };
      ports.push(rec);
      sysRec.ports.push(rec);
    });
    systems.push(sysRec);
  }
});

function pct(n, d) { return d ? (100 * n / d).toFixed(1) + '%' : '-'; }
function q(arr, f) { var a = arr.slice().sort(function (x, y) { return x - y; }); return a[Math.min(a.length - 1, Math.floor(f * a.length))]; }

if (process.argv[2] === 'json') { console.log(JSON.stringify({ ports: ports, systems: systems.map(function (s) { return { seed: s.seed, name: s.name, heldBy: s.heldBy, n: s.ports.length }; }) })); process.exit(0); }

console.log('ports ' + ports.length + ' in ' + systems.length + ' systems (' + SEEDS.length + ' seeds x ' + STARS_PER + ' stars)\n');

/* 1. Shape: how many exports and imports each port has, by tonnage and by value. */
var exN = ports.map(function (p) { return p.rows.filter(function (r) { return r.ex && r.cid !== 'waste'; }).length; });
var imN = ports.map(function (p) { return p.rows.filter(function (r) { return r.im && r.cid !== 'waste'; }).length; });
var hist = function (arr) { var h = {}; arr.forEach(function (v) { var k = v >= 8 ? '8+' : String(v); h[k] = (h[k] || 0) + 1; }); return Object.keys(h).sort().map(function (k) { return k + ':' + h[k]; }).join('  '); };
console.log('exports per port (excl. waste)  ' + hist(exN));
console.log('imports per port (excl. waste)  ' + hist(imN));
var lt2ex = exN.filter(function (n) { return n < 2; }).length, lt2im = imN.filter(function (n) { return n < 2; }).length;
var lt1ex = exN.filter(function (n) { return n < 1; }).length, lt1im = imN.filter(function (n) { return n < 1; }).length;
console.log('  ports with no export ' + pct(lt1ex, ports.length) + ', fewer than two ' + pct(lt2ex, ports.length));
console.log('  ports with no import ' + pct(lt1im, ports.length) + ', fewer than two ' + pct(lt2im, ports.length));

/* Major/minor: the largest export by value, and how lopsided the top two are. */
var lopsided = 0, weakMajor = 0;
ports.forEach(function (p) {
  var ex = p.rows.filter(function (r) { return r.ex && r.cid !== 'waste'; }).sort(function (a, b) { return b.value - a.value; });
  if (ex.length >= 2 && ex[1].value < ex[0].value * 0.05) lopsided++;
});
console.log('  ports whose second export is <5% of the first by value ' + pct(lopsided, ports.length));

/* Strength: a MAJOR export is one priced well under base (local <= 0.80),
 * a MAJOR import well over (local >= 1.20); minor is any other flagged row. */
var noMajEx = 0, noMajIm = 0, noMinEx = 0, noMinIm = 0, topShare = [], nMajEx = [], nMajIm = [];
ports.forEach(function (p) {
  var ex = p.rows.filter(function (r) { return r.ex && r.cid !== 'waste'; });
  var im = p.rows.filter(function (r) { return r.im && r.cid !== 'waste'; });
  var mex = ex.filter(function (r) { return r.local <= 0.80; }), mim = im.filter(function (r) { return r.local >= 1.20; });
  nMajEx.push(mex.length); nMajIm.push(mim.length);
  if (!mex.length) noMajEx++;
  if (!mim.length) noMajIm++;
  if (ex.length - mex.length < 1 && ex.length < 2) noMinEx++;
  if (im.length - mim.length < 1 && im.length < 2) noMinIm++;
  var tot = ex.reduce(function (a, r) { return a + r.value; }, 0);
  var top = ex.reduce(function (a, r) { return Math.max(a, r.value); }, 0);
  if (tot > 0) topShare.push(top / tot);
});
console.log('  no MAJOR export (local <= 0.80) ' + pct(noMajEx, ports.length) + ', no MAJOR import (local >= 1.20) ' + pct(noMajIm, ports.length));
console.log('  major exports per port ' + hist(nMajEx) + '\n  major imports per port ' + hist(nMajIm));
console.log('  top export\'s share of export value: median ' + (100 * q(topShare, 0.5)).toFixed(0) + '%, p10 ' + (100 * q(topShare, 0.1)).toFixed(0) + '%');

/* 2. Per role. */
console.log('\nby role: n, median exports/imports, top exports, top imports');
var roles = {};
ports.forEach(function (p) { (roles[p.role] = roles[p.role] || []).push(p); });
Object.keys(roles).sort().forEach(function (rid) {
  var list = roles[rid], exc = {}, imc = {};
  list.forEach(function (p) {
    p.rows.forEach(function (r) {
      if (r.cid === 'waste') return;
      if (r.ex) exc[r.cid] = (exc[r.cid] || 0) + 1;
      if (r.im) imc[r.cid] = (imc[r.cid] || 0) + 1;
    });
  });
  var top = function (c) { return Object.keys(c).sort(function (a, b) { return c[b] - c[a]; }).slice(0, 6).map(function (k) { return k + ' ' + Math.round(100 * c[k] / list.length) + '%'; }).join(', '); };
  var exs = list.map(function (p) { return p.rows.filter(function (r) { return r.ex && r.cid !== 'waste'; }).length; });
  var ims = list.map(function (p) { return p.rows.filter(function (r) { return r.im && r.cid !== 'waste'; }).length; });
  console.log('  ' + rid + ' (' + list.length + ', ' + pct(list.length, ports.length) + ')  ex ' + q(exs, 0.5) + ' / im ' + q(ims, 0.5));
  console.log('     exports: ' + top(exc));
  console.log('     imports: ' + top(imc));
});

/* 3. Food. */
console.log('\nfood (grain, livestock, fish, fruit)');
var foodEx = 0, foodIm = 0, foodNeither = 0, foodNoCons = 0, foodBoth = 0;
ports.forEach(function (p) {
  var f = p.rows.filter(function (r) { return FOOD.indexOf(r.cid) >= 0; });
  var ex = f.some(function (r) { return r.ex; }), im = f.some(function (r) { return r.im; });
  var cons = f.reduce(function (a, r) { return a + r.cons; }, 0);
  if (!(cons > 0)) foodNoCons++;
  if (ex && im) foodBoth++; else if (ex) foodEx++; else if (im) foodIm++; else foodNeither++;
});
console.log('  imports food only ' + pct(foodIm, ports.length) + ', exports only ' + pct(foodEx, ports.length) +
            ', both ' + pct(foodBoth, ports.length) + ', neither ' + pct(foodNeither, ports.length) +
            ', eats nothing at all ' + pct(foodNoCons, ports.length));
var foodKinds = {};
ports.forEach(function (p) { p.rows.forEach(function (r) { if (FOOD.indexOf(r.cid) >= 0 && r.cons > 0) foodKinds[r.cid] = (foodKinds[r.cid] || 0) + 1; }); });
console.log('  ports consuming each: ' + Object.keys(foodKinds).map(function (k) { return k + ' ' + pct(foodKinds[k], ports.length); }).join(', '));

/* 4. The essentials. Is the need visible as an import, and is there a source in the system? */
console.log('\nessentials: consumed / flagged as an import / system has a seller');
['fissile', 'hydrogen', 'ores', 'alloys', 'water'].forEach(function (cid) {
  var cons = 0, im = 0;
  ports.forEach(function (p) { var r = p.rows.filter(function (x) { return x.cid === cid; })[0]; if (r && r.cons > 0) cons++; if (r && r.im) im++; });
  var sysSrc = systems.filter(function (s) { return s.ports.some(function (p) { return p.rows.some(function (r) { return r.cid === cid && r.ex; }); }); }).length;
  console.log('  ' + cid + '  consumed at ' + pct(cons, ports.length) + ', an import at ' + pct(im, ports.length) +
              ', systems with a seller ' + pct(sysSrc, systems.length));
});
var foodSrc = systems.filter(function (s) { return s.ports.some(function (p) { return p.rows.some(function (r) { return FOOD.indexOf(r.cid) >= 0 && r.ex; }); }); }).length;
console.log('  food  systems with a seller ' + pct(foodSrc, systems.length));

/* The reactor's share of a port's fissile demand: is it big enough to read as an import? */
var reactorShare = [];
ports.forEach(function (p) { var r = p.rows.filter(function (x) { return x.cid === 'fissile'; })[0]; if (r && r.cons > 0) reactorShare.push(r.cons); });
console.log('  fissile demand per port (t/day) median ' + q(reactorShare, 0.5).toFixed(2) + ', p90 ' + q(reactorShare, 0.9).toFixed(2));

/* Shipyards and hull metal. */
var yards = roles.shipyard || [];
var yardAl = yards.filter(function (p) { return p.rows.some(function (r) { return (r.cid === 'alloys' || r.cid === 'ores') && r.im; }); }).length;
var yardAlEx = yards.filter(function (p) { return p.rows.some(function (r) { return r.cid === 'alloys' && r.ex; }); }).length;
console.log('  shipyards importing ores or alloys ' + pct(yardAl, yards.length) + ', EXPORTING alloys ' + pct(yardAlEx, yards.length));

/* 5. Commodities nobody trades, or everybody exports. */
console.log('\nper commodity: ports stocking, exporting, importing');
Object.keys(Eco.BY_ID).forEach(function (cid) {
  var st = 0, ex = 0, im = 0;
  ports.forEach(function (p) { var r = p.rows.filter(function (x) { return x.cid === cid; })[0]; if (r) { st++; if (r.ex) ex++; if (r.im) im++; } });
  if (!st) { console.log('  ' + cid + '  (nowhere)'); return; }
  console.log('  ' + (cid + '          ').slice(0, 10) + ' stocked ' + pct(st, ports.length) + '  ex ' + pct(ex, ports.length) + '  im ' + pct(im, ports.length) +
              (im && ex ? '  ratio ex:im ' + (ex / im).toFixed(2) : ''));
});

/* 6. Systems that are self-contained: no good leaves because every port makes the same things. */
var monotone = systems.filter(function (s) {
  if (s.ports.length < 2) return false;
  var need = {}, have = {};
  s.ports.forEach(function (p) { p.rows.forEach(function (r) { if (r.im) need[r.cid] = 1; if (r.ex) have[r.cid] = 1; }); });
  return !Object.keys(need).some(function (c) { return have[c]; });
}).length;
console.log('\nmulti-port systems with no internal trade (no import met by a neighbour) ' + pct(monotone, systems.filter(function (s) { return s.ports.length >= 2; }).length));

/* 7. Inside one system: for each good, the best margin a pilot could find,
 * at the structural price (base x local, fill ignored) — the shape of the
 * routes, not a quote. */
console.log('\nbest in-system margin per tonne, where both a seller and a buyer exist (median over systems)');
var margins = {};
systems.forEach(function (s) {
  var by = {};
  s.ports.forEach(function (p) { p.rows.forEach(function (r) { (by[r.cid] = by[r.cid] || []).push(r); }); });
  Object.keys(by).forEach(function (cid) {
    var base = (Eco.BY_ID[cid] || {}).base || 0;
    if (base <= 0) return;
    var sellers = by[cid].filter(function (r) { return r.ex || cid === 'hydrogen'; });
    if (!sellers.length) return;
    var lo = Math.min.apply(null, sellers.map(function (r) { return r.local; }));
    var hi = Math.max.apply(null, by[cid].map(function (r) { return r.local; }));
    (margins[cid] = margins[cid] || []).push(base * (hi - lo));
  });
});
Object.keys(margins).sort(function (a, b) { return q(margins[b], 0.5) - q(margins[a], 0.5); }).forEach(function (cid) {
  console.log('  ' + (cid + '          ').slice(0, 10) + ' ' + Math.round(q(margins[cid], 0.5)) + ' cr/t  (in ' + pct(margins[cid].length, systems.length) + ' of systems)');
});
