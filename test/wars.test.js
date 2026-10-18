/* wars.test.js - resource wars (claude/resource-wars.md).
 *
 *     node test/wars.test.js
 *
 * What this holds:
 *   - SEED + CLOCK: the same history every time; asking for year five
 *     directly gives what stepping there does;
 *   - THE TIMESCALE agreed with Astra: scarcity felt inside a year, no war
 *     in the first year, first wars in years two to three-ish, on three seeds;
 *   - wars only on a rival; a won war moves the star on its end date, not
 *     before; a lost one does not;
 *   - THE PLAYER COUNTS: corruption you leave behind raises chaos and brings
 *     the war sooner.
 */
global.window = global.window || global;
require('../src/vec3.js');
require('../src/rng.js');
require('../src/kepler.js');
require('../src/economy.js');
require('../src/generate.js');
var Galaxy = require('../src/galaxy.js');
var W = require('../src/wars.js');
var Y = W.YEAR;

var pass = 0, fail = 0;
function check(n, c, d) {
  if (c) { pass++; console.log('  ok   ' + n + (d ? '   ' + d : '')); }
  else { fail++; console.log('  FAIL  ' + n + (d ? '   ' + d : '')); }
}

var seeds = ['kawartha', 'driftwood', 'manifest'];
seeds.forEach(function (seed) {
  console.log('--- ' + seed + ' ---');
  var gal = Galaxy.build(seed);
  var h = W.history(gal, {}, 8 * Y);
  var first = h.wars.length ? h.wars[0].t0 / Y : Infinity;
  var st1 = W.stateAt(gal, {}, 1 * Y);
  var s1 = Object.keys(st1).map(function (e) { return st1[e].scarcity; });
  check('scarcity is felt inside a year', Math.min.apply(0, s1) > 0.3, s1.map(function (x) { return x.toFixed(2); }).join(' '));
  check('no war in the first year, the first by year three and a half', first >= 1 && first <= 3.5, 'first at ' + first.toFixed(2) + ' y');
  check('several by year eight', h.wars.length >= 5, h.wars.length + ' wars');
  check('only on rivals', h.wars.every(function (w) { return gal.rivals[w.att] && gal.rivals[w.att][w.def]; }));

  W._reset();
  var h2 = W.history(gal, {}, 8 * Y);
  check('the same seed gives the same wars', JSON.stringify(h2.wars) === JSON.stringify(h.wars));
  W._reset();
  W.history(gal, {}, 2 * Y);
  var h3 = W.history(gal, {}, 8 * Y);
  check('stepping there gives what asking directly does', JSON.stringify(h3.wars) === JSON.stringify(h.wars));

  var won = h.wars.filter(function (w) { return w.won; })[0];
  if (won) {
    var before = W.ownerAt(gal, {}, won.star, won.t1 - W.MONTH / 2);
    var after = W.ownerAt(gal, {}, won.star, won.t1 + 1);
    check('a won war moves the star on its end date', before === won.def && after === won.att,
          won.starName + ': ' + before + ' -> ' + after + ' at ' + (won.t1 / Y).toFixed(2) + ' y');
    check('and it is contested while it runs', !!W.contested(gal, {}, won.star, (won.t0 + won.t1) / 2) &&
          !W.contested(gal, {}, won.star, won.t1 + 1));
  }
  var lost = h.wars.filter(function (w) { return !w.won; })[0];
  if (lost) {
    check('a lost war leaves it where it was', W.ownerAt(gal, {}, lost.star, lost.t1 + 1) === W.ownerAt(gal, {}, lost.star, lost.t0 - 1));
  }

  if (seed === 'kawartha') {
    console.log('--- the player counts ---');
    var sum = W.summaries(gal);
    /* The cleanest empire, with a criminal career in a dozen of its systems. */
    var stA = W.stateAt(gal, {}, 1.5 * Y);
    var clean = Object.keys(stA).sort(function (a, b) { return stA[a].chaos - stA[b].chaos; })[0];
    var G = { corruptionShift: {} };
    sum.list.filter(function (r) { return r.empire === clean && !r.held; }).slice(0, 25).forEach(function (r) {
      G.corruptionShift[r.id] = { v: 60, t: 1.48 * Y };
    });
    var stB = W.stateAt(gal, G, 1.5 * Y);
    check('corruption you leave raises their chaos', stB[clean].chaos > stA[clean].chaos + 0.1,
          clean + ' chaos ' + stA[clean].chaos.toFixed(2) + ' -> ' + stB[clean].chaos.toFixed(2));
    var firstOf = function (hh) { var w = hh.wars.filter(function (x) { return x.att === clean; })[0]; return w ? w.t0 : Infinity; };
    var plain = firstOf(W.history(gal, {}, 8 * Y));
    G.corruptionShift = {};
    sum.list.filter(function (r) { return r.empire === clean && !r.held; }).forEach(function (r) {
      /* Recent: the shift halves every three weeks (Combat), so only
       * crime kept up near the decision moves it. */
      G.corruptionShift[r.id] = { v: 65, t: 1.95 * Y };
    });
    var pushed = firstOf(W.history(gal, G, 8 * Y));
    check('and brings their war sooner', pushed < plain, (plain / Y).toFixed(2) + ' y -> ' + (pushed / Y).toFixed(2) + ' y');
  }
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
