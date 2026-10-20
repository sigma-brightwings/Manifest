/* growth.test.js - ports that grow (src/growth.js).
 *
 *     node test/growth.test.js
 *
 * What this holds:
 *   - SEED + CLOCK: the same plan every time; reading a moment never
 *     changes it;
 *   - ORDER picks the builder: rich and lawful is Union, middling is
 *     moonlighting, a poor Syndicate hold is scavengers;
 *   - the Union builds in mirrored sets (same module, same day) and brings
 *     a Crawler; scavengers do not;
 *   - nothing standing overlaps anything else standing;
 *   - no chain runs past CHAIN_MAX without a hub; no piece is bigger than
 *     the one it hangs on;
 *   - scavenger pieces are cut loose again, and their children with them;
 *   - a stopped Crawler (Growth.delay) pushes its job and every later one
 *     back by the same time;
 *   - the player's corruption lowers order;
 *   - a port with no growth data plans nothing, quietly.
 */
global.window = global.window || global;
require('../src/ports.js');
require('../src/growth-points.js');
require('../src/modules.js');
var Gr = require('../src/growth.js');
var Y = Gr.YEAR;

var pass = 0, fail = 0;
function check(n, c, d) {
  if (c) { pass++; console.log('  ok   ' + n + (d ? '   ' + d : '')); }
  else { fail++; console.log('  FAIL  ' + n + (d ? '   ' + d : '')); }
}

var RICH = { development: 0.75, corruption: 10, violence: 10 };
var MID = { development: 0.45, corruption: 55, violence: 35 };
var POOR = { development: 0.3, corruption: 85, violence: 60, pirateHeld: true };
function ctx(sys, model, k, liv, G) {
  return { G: G || {}, sys: sys, port: { id: 'p' + k, livery: liv || 'civ', market: { dev: sys === RICH ? 0.55 : sys === MID ? 0.25 : 0.08, role: 'orbital' } },
           starId: 's' + k, model: model, key: 'test:' + k };
}

console.log('--- order and builders ---');
check('rich and lawful builds Union', Gr.builderFor(Gr.baseOrder(RICH, ctx(RICH, 'spine-l', 1).port)) === 'union');
check('middling moonlights', Gr.builderFor(Gr.baseOrder(MID, ctx(MID, 'spine-l', 2).port)) === 'moonlighter');
check('a poor Syndicate hold is scavengers', Gr.builderFor(Gr.baseOrder(POOR, ctx(POOR, 'spine-syn-l', 3, 'syn').port)) === 'scavenger');

var models = ['spine-l', 'ring-l', 'cradle-l', 'cylinder-l', 'yard-l', 'comet-l', 'farm-l', 'refinery-l', 'pad-site-l'];
var cases = [[RICH, 'civ'], [MID, 'civ'], [POOR, 'syn']];
var k = 10, plans = [];
models.forEach(function (m) {
  cases.forEach(function (cs) {
    var mm = cs[1] === 'syn' && PortLib[m.replace(/-([sml])$/, '-syn-$1')] ? m.replace(/-([sml])$/, '-syn-$1') : m;
    var c = ctx(cs[0], mm, k++, cs[1]);
    plans.push({ c: c, p: Gr.plan(c), sys: cs[0] });
  });
});

console.log('--- seed + clock ---');
(function () {
  var c = plans[0].c, a = JSON.stringify(Gr.plan(c).slots.map(function (s) { return [s.mod.id, s.t0, s.at]; }));
  Gr._clear();
  Gr.stateAt(c, 7 * Y);
  var b = JSON.stringify(Gr.plan(c).slots.map(function (s) { return [s.mod.id, s.t0, s.at]; }));
  check('the same plan after clearing and reading a moment first', a === b);
  check('every port with growth data plans something', plans.every(function (x) { return x.p.slots.length > 0; }),
    plans.filter(function (x) { return !x.p.slots.length; }).map(function (x) { return x.c.model; }).join(' '));
})();

console.log('--- the Union ---');
(function () {
  var rich = plans.filter(function (x) { return x.sys === RICH; });
  var sets = 0, mirrored = 0, crawlers = 0, okSets = true;
  rich.forEach(function (x) {
    var by = {};
    x.p.slots.forEach(function (s) { (by[s.set] = by[s.set] || []).push(s); });
    Object.keys(by).forEach(function (q) {
      var ss = by[q]; sets++;
      if (ss.length > 1) mirrored++;
      if (!ss.every(function (s) { return s.mod.id === ss[0].mod.id && s.t0 === ss[0].t0 && s.builder === 'union'; })) okSets = false;
    });
    crawlers += x.p.crawlers.length;
  });
  check('a Union set is one module, one day', okSets);
  check('most Union jobs are mirrored sets', mirrored / sets > 0.5, mirrored + ' of ' + sets);
  check('Union jobs bring Crawlers', crawlers > 0, crawlers + ' Crawlers');
  check('scavengers bring none', plans.filter(function (x) { return x.sys === POOR; }).every(function (x) {
    return x.p.slots.filter(function (s) { return s.builder === 'union'; }).length || !x.p.crawlers.length; }));
})();

console.log('--- standing pieces ---');
(function () {
  var bad = 0, chain = 0, bigger = 0, n = 0;
  plans.forEach(function (x) {
    [0, 5 * Y, 15 * Y, 30 * Y].forEach(function (t) {
      var st = Gr.stateAt(x.c, t).slots.map(function (q) { return q.slot; });
      for (var i = 0; i < st.length; i++) for (var j = i + 1; j < st.length; j++) {
        n++;
        if (Gr.overlap(st[i].box, st[j].box, 0.02)) bad++;
      }
    });
    x.p.slots.forEach(function (s) {
      if (s.depth > Gr.CHAIN_MAX) chain++;
      if (s.parent >= 0) {
        var P = x.p.slots[s.parent];
        if (Math.max.apply(null, s.mod.s) > Math.max.apply(null, P.mod.s) * Gr.CHILD_SHRINK * 1.001 && !s.hub) bigger++;
      }
    });
  });
  check('nothing standing overlaps', bad === 0, bad + ' of ' + n + ' pairs');
  check('no chain past the limit', chain === 0);
  check('no piece bigger than what it hangs on', bigger === 0, bigger + ' found');
})();

console.log('--- scavengers cut loose ---');
(function () {
  var poor = plans.filter(function (x) { return x.sys === POOR; });
  var stripped = 0, orphans = 0;
  poor.forEach(function (x) {
    x.p.slots.forEach(function (s) {
      if (isFinite(s.strip)) stripped++;
      if (s.parent >= 0 && s.strip > x.p.slots[s.parent].strip) orphans++;
    });
  });
  check('scavenger pieces are cut loose again', stripped > 0, stripped + ' pieces');
  check('a child goes when its parent does', orphans === 0);
  var deep = poor.some(function (x) { return x.p.slots.some(function (s) { return s.depth >= 2; }); });
  check('wreckholds chain', deep);
})();

console.log('--- the player ---');
(function () {
  var x = plans.filter(function (q) { return q.sys === RICH; })[0];
  var c0 = ctx(RICH, x.c.model, 900);
  var p0 = Gr.plan(c0), s = p0.slots.filter(function (q) { return q.builder === 'union' && q.t0 > 0; })[0];
  if (!s) { check('a future Union job to delay', false); return; }
  var G = {};
  Gr.delay(G, c0.key, s.id, 200 * Gr.DAY);
  var c1 = ctx(RICH, x.c.model, 900, 'civ', G);
  var p1 = Gr.plan(c1);
  var okLater = p1.slots.every(function (q) { return q.id < s.id ? q.t0 === p0.slots[q.id].t0 : Math.abs(q.t0 - p0.slots[q.id].t0 - 200 * Gr.DAY) < 1; });
  check('a stopped Crawler pushes its job and every later one back', okLater);
  var cr = p1.crawlers.filter(function (c) { return c.slots.indexOf(s.id) >= 0; })[0];
  check('and the Crawler comes later too', cr && Math.abs(cr.arrive - (p1.slots[s.id].t0 - 25 * Gr.DAY)) < 1);
  var Gc = { corruptionShift: { s901: { v: 60, t: 0 } } };
  var a = Gr.orderAt(ctx(RICH, 'spine-l', 901), 1 * Gr.DAY), b = Gr.orderAt(ctx(RICH, 'spine-l', 901, 'civ', Gc), 1 * Gr.DAY);
  check('your corruption lowers order', b < a, a.toFixed(2) + ' > ' + b.toFixed(2));
})();

console.log('--- no data ---');
(function () {
  var p = Gr.plan(ctx(RICH, 'no-such-model', 999));
  check('an unknown model plans nothing, without throwing', p.slots.length === 0 && p.crawlers.length === 0);
})();

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
