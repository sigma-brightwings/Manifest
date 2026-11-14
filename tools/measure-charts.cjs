/* measure-charts.cjs - what a world's SHEET is worth, across the real
 * galaxy, before any of charts.js's numbers are trusted.
 *
 *     node tools/measure-charts.cjs            # summary
 *     node tools/measure-charts.cjs json > x   # per-world rows
 *
 * Three questions, in order:
 *   1. ORE INTEREST: how is it distributed? That sets MIND_FLOOR and
 *      MIND_RICH, i.e. which worlds the Mining Guild actually minds about.
 *      Astra's rule is that a world of zero interest costs nothing, so the
 *      floor has to sit above the barren mass of them, not through it.
 *   2. NOVELTY and REACH: does the galaxy give a real spread, or does
 *      everything come out the same? A premium nobody can feel is not a
 *      premium.
 *   3. THE PRICE at full coverage, against the assay for the same world,
 *      because the balance rule is that a survey pays well and never beats
 *      active hauling - and now there are two buyers for one flight.
 */
'use strict';
global.window = global.window || global;
['vec3', 'rng', 'kepler', 'economy', 'generate', 'sim', 'survey'].forEach(function (m) {
  require('../src/' + m + '.js');
});
var Galaxy = require('../src/galaxy.js');
var Charts = require('../src/charts.js');
var Sv = global.Survey, Gen = global.Gen;

var SEEDS = ['kawartha', 'beaverton', 'driftwood', 'manifest'];
var STARS_PER = +(process.argv[3] || 70);
var JSON_OUT = process.argv[2] === 'json';

function pct(a, p) {
  if (!a.length) return 0;
  var i = Math.min(a.length - 1, Math.max(0, Math.round((a.length - 1) * p)));
  return a[i];
}
function stats(name, a, dp) {
  var s = a.slice().sort(function (x, y) { return x - y; });
  var d = dp === undefined ? 2 : dp;
  console.log('  ' + name.padEnd(16) +
    ' n=' + String(s.length).padStart(5) +
    '  min ' + pct(s, 0).toFixed(d).padStart(9) +
    '  p25 ' + pct(s, 0.25).toFixed(d).padStart(9) +
    '  med ' + pct(s, 0.5).toFixed(d).padStart(9) +
    '  p75 ' + pct(s, 0.75).toFixed(d).padStart(9) +
    '  p95 ' + pct(s, 0.95).toFixed(d).padStart(9) +
    '  max ' + pct(s, 1).toFixed(d).padStart(9));
}

var rows = [];
SEEDS.forEach(function (seed) {
  var g = Galaxy.build(seed);
  for (var s = 0; s < g.stars.length && s < STARS_PER; s++) {
    var star = g.stars[s];
    var sys = Gen.generateSystem(star.seed, Galaxy.systemOpts(g, star));
    var nov = Charts.noveltyOf(g, star, sys);
    var fr = Charts.frontierOf(g, star);
    var reach = Charts.reachOf(g, star);
    var ctl = Galaxy.control(g, star);
    (sys.bodies || []).forEach(function (b) {
      /* A record mapped all the way round with a grade-3 instrument: the
       * best sheet and the best assay the same flight could produce. */
      var key = star.id + ':' + b.id;
      var rec = { key: key, star: star.id, cov: 1, cov2: 1, covF: 1, grade: 3,
                  soldCov: 0, soldCov2: 0, soldCovF: 0, t: 0, tMean: 0, v: 2 };
      var sheet = Charts.value(rec, sys, g, star);
      var assay = Sv.value(rec, sys, 0);
      var ore = Charts.oreInterest(b, sys);
      rows.push({
        seed: seed, star: star.id, sys: sys.name, body: b.name,
        rad: b.rad || 0, ports: (sys.ports || []).length,
        ctl: ctl, nov: nov, fr: fr, reach: reach,
        size: Charts.sizeOf(b),
        ore: ore, mind: Charts.mindFrac(b, sys), cost: Charts.guildCost(b, sys),
        sheet: sheet, assay: assay
      });
    });
  }
});

if (JSON_OUT) { console.log(JSON.stringify(rows)); process.exit(0); }

console.log('measure-charts: ' + rows.length + ' worlds over ' + SEEDS.length +
            ' seeds, ' + STARS_PER + ' stars each\n');

console.log('1. ORE INTEREST - what the Guild would mind about');
stats('ore interest', rows.map(function (r) { return r.ore; }), 0);
var zero = rows.filter(function (r) { return r.ore <= Charts.MIND_FLOOR; }).length;
var full = rows.filter(function (r) { return r.mind >= 0.999; }).length;
console.log('  nobody minds (<= MIND_FLOOR ' + Charts.MIND_FLOOR + '): ' +
            zero + ' of ' + rows.length + '  (' + (100 * zero / rows.length).toFixed(0) + '%)');
console.log('  minded in full (>= MIND_RICH ' + Charts.MIND_RICH + '): ' +
            full + '  (' + (100 * full / rows.length).toFixed(0) + '%)');
var byCost = {};
rows.forEach(function (r) { byCost[r.cost] = (byCost[r.cost] || 0) + 1; });
console.log('  standing cost to publish: ' + Object.keys(byCost).sort().map(function (k) {
  return '-' + k + ': ' + byCost[k];
}).join('   '));

console.log('\n2. NOVELTY AND REACH - does the galaxy give a spread?');
stats('control', rows.map(function (r) { return r.ctl; }), 3);
stats('novelty', rows.map(function (r) { return r.nov; }), 3);
stats('frontier', rows.map(function (r) { return r.fr; }), 3);
stats('reach', rows.map(function (r) { return r.reach; }), 3);
stats('size', rows.map(function (r) { return r.size; }), 3);

console.log('\n3. THE PRICE, fully mapped with a grade-3 instrument');
stats('sheet (cr)', rows.map(function (r) { return r.sheet; }), 0);
stats('assay (cr)', rows.map(function (r) { return r.assay; }), 0);
var both = rows.map(function (r) { return r.sheet + r.assay; });
stats('both (cr)', both, 0);
var ratio = rows.filter(function (r) { return r.assay > 0; })
                .map(function (r) { return r.sheet / r.assay; });
stats('sheet/assay', ratio, 2);

/* The two cases the design turns on. */
function best(list, n, label) {
  console.log('\n  ' + label);
  list.slice(0, n).forEach(function (r) {
    console.log('    ' + (r.sys + ' ' + r.body).padEnd(30) +
      ' sheet ' + String(r.sheet).padStart(6) +
      '  assay ' + String(r.assay).padStart(6) +
      '  ore ' + String(Math.round(r.ore)).padStart(6) +
      '  guild -' + r.cost +
      '  ctl ' + r.ctl.toFixed(2) + '  fr ' + r.fr.toFixed(2) +
      '  ports ' + r.ports);
  });
}
best(rows.filter(function (r) { return r.cost === 0; })
         .sort(function (a, b) { return b.sheet - a.sheet; }), 6,
     'BARREN AND WORTH CHARTING (the hole this fills: assay near zero, nobody minds)');
best(rows.filter(function (r) { return r.cost >= Charts.MIND_MAX; })
         .sort(function (a, b) { return b.sheet - a.sheet; }), 6,
     'RICH AND QUIET (publishing these is the actual decision)');
best(rows.slice().sort(function (a, b) { return a.sheet - b.sheet; }), 4,
     'WORTH LEAST AS A SHEET (everybody already has it)');

/* The feature's own measure: on how many worlds is the SHEET the bigger
 * half of the flight? Those are the worlds the old game paid nothing much
 * for. */
var chartLed = rows.filter(function (r) { return r.sheet > r.assay; }).length;
var chartOnly = rows.filter(function (r) { return r.assay < 800 && r.sheet >= 1500; }).length;
console.log('\n  worlds where the sheet pays more than the assay: ' + chartLed +
            ' of ' + rows.length + '  (' + (100 * chartLed / rows.length).toFixed(0) + '%)');
console.log('  worlds with nothing worth digging that still pay to chart: ' + chartOnly +
            '  (' + (100 * chartOnly / rows.length).toFixed(0) + '%)');
var sysTot = {};
rows.forEach(function (r) {
  var k = r.seed + '|' + r.star;
  sysTot[k] = (sysTot[k] || 0) + r.sheet;
});
var tots = Object.keys(sysTot).map(function (k) { return sysTot[k]; });
console.log('');
stats('whole system', tots, 0);
console.log('  (every world in one system charted all the way round - the most' +
            ' charting one system can pay)');
