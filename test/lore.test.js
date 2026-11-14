/* lore.test.js - the wiki half of the catalogue.
 *
 *     node test/lore.test.js
 *
 * What this holds:
 *   - THE GATE, which is the only part of the page that can do harm.
 *     Astra's rule: types always, specifics once met. The game SELLS
 *     slipspace charts, so a wiki that handed out this seed's roster to a
 *     new career would be undercutting the thing the chart seller holds.
 *   - That the three new groups read the LIVE tables, like the rest of
 *     the catalogue, rather than keeping copies that rot.
 *   - That a port pattern reports what it IS without pretending to draw
 *     it. The first cut drew a berth plan off the model's anchors; Astra
 *     scrapped the layouts, and the counts are what remain.
 *   - That nothing here can move the galaxy: it is a reference page.
 */
global.window = global.window || global;
require('../src/vec3.js');
require('../src/rng.js');
require('../src/kepler.js');
require('../src/economy.js');
var Gen = require('../src/generate.js');
require('../src/sim.js');
require('../src/ports.js');
var Galaxy = require('../src/galaxy.js');
var L = require('../src/lore.js');

var pass = 0, fail = 0;
function check(n, c, d) {
  if (c) { pass++; console.log('  ok   ' + n + (d ? '   ' + d : '')); }
  else { fail++; console.log('  FAIL  ' + n + (d ? '   ' + d : '')); }
}

var gal = Galaxy.build('kawartha');
function career(opts) {
  var G = { galaxy: gal, charted: {}, visited: {}, standing: {} };
  if (opts && opts.charted) opts.charted.forEach(function (id) { G.charted[id] = 1; });
  if (opts && opts.visited) opts.visited.forEach(function (id) { G.visited[id] = 1; });
  if (opts && opts.standing) G.standing = opts.standing;
  return G;
}

console.log('lore.test.js - the wiki\n');
console.log('--- 1. THE GATE: types always, specifics once met ---');

var fresh = career();
check('a brand-new career knows none of this seed’s powers',
      L.knownFactions(fresh, gal).length === 0,
      '0 of ' + gal.factions.length);
check('but can still read what a power IS',
      L.factionKinds().length === 4,
      L.factionKinds().map(function (k) { return k.name; }).join(', '));
check('and every world type, star class and government',
      L.types().length === Object.keys(Gen.PLANET_TYPES).length +
                           Gen.STAR_CLASSES.length + Gen.GOVERNMENTS.length,
      L.types().length + ' entries, ungated');
check('and every port pattern', L.portPatterns().length > 10,
      L.portPatterns().length + ' patterns');

var home = gal.stars[0];
var one = career({ visited: [home.id] });
check('visiting a system introduces whoever holds it',
      home.factionId
        ? L.knownFactions(one, gal).length === 1
        : L.knownFactions(one, gal).length === 0,
      home.factionId ? 'held by ' + home.factionId : 'home is unclaimed');

/* Charting is what the chart seller sells, so it must count. */
var many = career();
var reach = gal.stars.slice(0, 80);
reach.forEach(function (s) { many.charted[s.id] = 1; });
var knownMany = L.knownFactions(many, gal);
check('charting fills the roster in behind the purchase',
      knownMany.length > 1 && knownMany.length < gal.factions.length,
      knownMany.length + ' of ' + gal.factions.length + ' from 80 charted stars');
check('and never more than the galaxy holds',
      knownMany.length <= gal.factions.length);

check('standing alone is an introduction',
      (function () {
        var G = career({ standing: { outlaw: -20 } });
        var k = L.knownFactions(G, gal);
        return k.length === 1 && k[0].id === 'outlaw';
      })(), 'somebody who has dealt with you has met you');

check('a career that has been nowhere sees no capital names',
      (function () {
        var fs = L.factions(fresh, gal);
        return fs.length === 0;
      })());

check('a known faction still hides the capital you have not charted',
      (function () {
        var G = career({ standing: { outlaw: -20 } });
        var f = L.factions(G, gal)[0];
        if (!f) return false;
        var cap = f.specs.filter(function (s) { return s[0] === 'Capital'; })[0];
        return !cap || /not on your charts/.test(cap[1]);
      })(), 'meeting them is not the same as knowing where they live');

check('with no career at all everything is known',
      L.knownFactions(null, gal).length === gal.factions.length,
      'a tool or a test has no player to spoil');

console.log('\n--- 2. read from the live tables ---');
check('a world type carries the generator’s own density and albedo',
      (function () {
        var t = L.worldTypes().filter(function (e) { return e.id === 'world-terran'; })[0];
        var src = Gen.PLANET_TYPES.terran;
        var d = t.specs.filter(function (s) { return s[0] === 'Density'; })[0];
        return d && d[1].indexOf(String(src.density)) === 0 && t.swatch === src.color;
      })());
check('a world with no air says so rather than inventing some',
      (function () {
        var t = L.worldTypes().filter(function (e) { return e.id === 'world-rocky'; })[0];
        return t.specs.some(function (s) { return /vacuum/.test(String(s[1])); });
      })(), 'Gen.ATMOSPHERES.rocky is null, and null means airless');
check('a government carries both axes, not one',
      (function () {
        var g = L.governments()[0];
        var has = {};
        g.specs.forEach(function (s) { has[s[0]] = 1; });
        return has.Violence && has.Corruption;
      })());
check('every government in the table is on the page',
      L.governments().length === Gen.GOVERNMENTS.length);
check('every world type is on the page',
      L.worldTypes().length === Object.keys(Gen.PLANET_TYPES).length);
check('every star class is on the page, with how common it is',
      L.starClasses().length === Gen.STAR_CLASSES.length &&
      L.starClasses().every(function (c) {
        return c.specs.some(function (s) { return s[0] === 'How common'; });
      }));
check('each one has copy written for it',
      L.types().every(function (e) { return e.prose && e.prose.length > 40; }),
      'a density and an albedo do not tell a pilot whether he can land');

console.log('\n--- 3. ports: fourteen patterns off the real library ---');
check('the library key splits into pattern, livery and size',
      (function () {
        var a = L.splitPortId('cylinder-navy-l');
        var b = L.splitPortId('runway-city-site-m');
        return a && a.pattern === 'cylinder' && a.livery === 'navy' && a.size === 'l' &&
               b && b.pattern === 'runway-city-site' && b.livery === '' && b.size === 'm';
      })(), 'the pattern may carry hyphens, so the tail is read off the end');
check('every PortLib entry belongs to a pattern',
      (function () {
        var keys = Object.keys(global.PortLib || {});
        return keys.length > 0 && keys.every(function (k) { return !!L.splitPortId(k); });
      })(), Object.keys(global.PortLib || {}).length + ' keys');
check('ground sites are told from orbital ones',
      (function () {
        var ps = L.portPatterns();
        var g = ps.filter(function (p) { return p.ground; });
        var o = ps.filter(function (p) { return !p.ground; });
        return g.length > 0 && o.length > 0;
      })());
check('a pattern with no berths says so in words',
      (function () {
        var farm = L.portPatterns().filter(function (p) { return p.id === 'port-farm'; })[0];
        return farm && farm.specs.some(function (s) {
          return /not a port you dock at/.test(String(s[1]));
        });
      })());
check('the berth COUNTS survived the layouts being scrapped',
      (function () {
        var yard = L.portPatterns().filter(function (p) { return p.id === 'port-yard'; })[0];
        return yard && yard.berths === 10 &&
               yard.specs.some(function (s) { return /large/.test(String(s[1])); });
      })(), 'how many, and how many take a large hull');
check('and no pattern carries a layout any more',
      L.portPatterns().every(function (p) { return p.plan === undefined; }),
      'scrapped 2026-11-13; berthPlan went with it');
check('a pattern still says how big it is',
      L.portPatterns().every(function (p) {
        return p.specs.some(function (s) { return s[0] === 'Across'; });
      }), 'metresPerUnit still earns its place');

console.log('\n--- 5. it is a reference page, not a part of the world ---');
check('lore.js draws nothing from the seed',
      (function () {
        var src = require('fs').readFileSync(__dirname + '/../src/lore.js', 'utf8');
        return !/new RNG|Math\.random|\.next\(\)/.test(src);
      })());
check('and writes nothing to the career',
      (function () {
        var src = require('fs').readFileSync(__dirname + '/../src/lore.js', 'utf8');
        return !/\bG\.[a-zA-Z]+\s*=/.test(src);
      })(), 'reading the wiki cannot change a save');
check('the same seed describes the same galaxy twice',
      (function () {
        var g2 = Galaxy.build('kawartha');
        var a = L.factions(null, gal).map(function (f) { return f.name; }).join('|');
        var b = L.factions(null, g2).map(function (f) { return f.name; }).join('|');
        return a === b && a.length > 0;
      })());
check('a galaxy-less call is refused rather than throwing',
      L.factions(null, null).length === 0 && L.knownFactions(null, null).length === 0);

console.log('\n--- 6. the page hangs together ---');
var gs = L.groups(many, gal);
check('three groups, in reading order',
      gs.length === 3 && gs[0].id === 'factions' && gs[1].id === 'ports' && gs[2].id === 'types',
      gs.map(function (g) { return g.label; }).join(' '));
check('every entry has a name, a kind and copy',
      L.all(null, gal).every(function (e) {
        return e.name && e.kind && typeof e.prose === 'string';
      }));
check('no entry claims a price',
      L.all(null, gal).every(function (e) { return typeof e.price !== 'number'; }),
      'nothing on these three tabs is for sale');
check('a faction links to what its kind is, and the link resolves',
      (function () {
        var f = L.factions(null, gal)[0];
        return f && f.links && f.links.length >= 1 &&
               L.find(null, f.links[0].id, gal) !== null;
      })());
check('a minor power links to the empire it operates inside',
      (function () {
        var fs2 = L.factions(null, gal).filter(function (f) {
          return f.kind === 'minor power';
        });
        if (!fs2.length) return false;
        return fs2.every(function (f) {
          return f.links.length === 2 && /^fac-/.test(f.links[1].id) &&
                 L.find(null, f.links[1].id, gal) !== null;
        });
      })());
check('but never to a power the career has not met',
      (function () {
        /* Standing with a minor power alone: you know THEM, not their host,
         * so the host link must not appear - that would be the gate leaking
         * through the back door. */
        var minor = gal.factions.filter(function (f) {
          return f.parentId && !f.outlaw;
        })[0];
        if (!minor) return true;
        var G = career({ standing: {} });
        G.standing[minor.id] = 10;
        var e = L.factions(G, gal).filter(function (x) { return x.id === 'fac-' + minor.id; })[0];
        if (!e) return false;
        return e.links.every(function (l) { return !/^fac-/.test(l.id); });
      })());
check('every link on the page points at something on the page',
      (function () {
        var G = career();
        gal.stars.forEach(function (st) { G.charted[st.id] = 1; });
        var items = L.all(G, gal);
        var ids = {};
        items.forEach(function (e) { ids[e.id] = 1; });
        return items.every(function (e) {
          return (e.links || []).every(function (l) { return ids[l.id]; });
        });
      })(), 'with the whole galaxy charted, no link dangles');
check('find() reaches every entry it lists',
      L.all(null, gal).every(function (e) { return L.find(null, e.id, gal) !== null; }));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
