/* milfuel.test.js — the milfuel works.
 *
 *     node test/milfuel.test.js
 *
 * Astra, 2026-09-25: "Add Milfuel production (they take in radioactive
 * waste or isotopes and produces milfuel.) This will be a Navy refinery
 * structure, size L."
 *
 * What this pins down:
 *   - every milfuel factory takes BOTH feeds: fissiles at five to the slug,
 *     waste at ten, and is a waste sink (you can unload drums there);
 *   - every one is the large refinery building, in the navy's colours or,
 *     where the licence is the Syndicate's, in theirs;
 *   - its board says what it takes.
 */
global.window = global.window || global;
var Eco = require('../src/economy.js');
var Gen = require('../src/generate.js');
require('../src/sim.js');
require('../src/hulls.js');
require('../src/ports.js');
var Render = require('../src/render.js');
var Galaxy = require('../src/galaxy.js');
Eco = global.Economy || Eco; Gen = global.Gen || Gen; Render = global.Render || Render;
Galaxy = global.Galaxy || Galaxy;

var pass = 0, fail = 0;
function check(n, c, d) {
  if (c) { pass++; console.log('  ok   ' + n + (d ? '   ' + d : '')); }
  else { fail++; console.log('  FAIL  ' + n + (d ? '   ' + d : '')); }
}

console.log('--- the building is in the library ---');
var lib = global.PortLib || {};
check('the large navy refinery is converted', !!lib['refinery-navy-l']);
check('and so is the Syndicate one', !!lib['refinery-syn-l']);

console.log('--- every factory in the galaxy ---');
var n = 0, navy = 0, syn = 0, wrongModel = [], wrongLivery = 0, noWaste = 0, offRatio = 0,
    noSign = 0, notSink = 0, drums = [], isotopes = [];
['kawartha', 'alpha', 'beta'].forEach(function (seed) {
  var g = Galaxy.build(seed);
  g.stars.forEach(function (st) {
    var fac = g.factionById[st.factionId];
    var sys = Gen.generateSystem(st.seed, fac ? { faction: fac, allFactions: g.factions } : undefined);
    (sys.ports || []).forEach(function (p) {
      var m = p.market;
      if (!m || m.role !== 'milfuel') return;
      n++;
      var who = Eco.milfuelLicensor(sys);
      var want = (who === 'syndicate' || sys.pirateHeld) ? 'syn' : 'navy';
      if (p.livery !== want) wrongLivery++;
      if (p.livery === 'syn') syn++; else navy++;
      var model = Render.portModelFor(p);
      if (model !== 'refinery-' + p.livery + '-l') wrongModel.push(p.id + ':' + model);
      var w = m.rows.waste, f = m.rows.fissile, s = m.rows.milfuel;
      if (!w || !(m.wasteFeed > 0) || w.cons < m.wasteFeed - 1e-6) noWaste++;
      if (!w || !w.sink) notSink++;
      if (!s || !f || Math.abs(m.feed / 5 + m.wasteFeed / 10 - m.slugs) > 1e-6 ||
          Math.abs(s.prod - m.slugs) > 1e-6) offRatio++;
      if (!(p.dressing && p.dressing.signs.some(function (x) { return /WASTE & ISOTOPES/.test(x.text); }))) noSign++;
      drums.push(m.wasteFeed / 10 / m.slugs);
      isotopes.push(m.feed / 5 / m.slugs);
    });
  });
});
function mean(a) { return a.reduce(function (x, y) { return x + y; }, 0) / Math.max(1, a.length); }
console.log('  ' + n + ' factories (' + navy + ' navy, ' + syn + ' Syndicate); ' +
            (100 * mean(drums)).toFixed(0) + '% of slugs from waste, ' +
            (100 * mean(isotopes)).toFixed(0) + '% from isotopes');
check('there are factories to look at', n > 20, String(n));
check('every one takes waste as well as isotopes', noWaste === 0, noWaste + ' without');
check('and is somewhere you can unload drums', notSink === 0, notSink + ' refuse them');
check('ten of waste or five of isotopes to the slug', offRatio === 0, offRatio + ' off-ratio');
check('every one is the large refinery building', wrongModel.length === 0, wrongModel.slice(0, 5).join(', '));
check('in its licensor\'s colours', wrongLivery === 0, wrongLivery + ' wrong');
check('and its board says what it takes', noSign === 0, noSign + ' silent');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
