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

  /* 2026-10-21: bigger pieces, from the station's own family */
  var famOf = function (m) { return String(m).replace(/-(navy|syn)(?=-|$)/, '').replace(/-[sml]$/, ''); };
  var size = function (s) { return Math.max.apply(null, s.mod.s); };
  var un = [], mo = [];
  plans.forEach(function (x) {
    x.p.slots.forEach(function (s) {
      if (s.builder === 'union') un.push({ s: s, fam: famOf(x.c.model) });
      if (s.builder === 'moonlighter') mo.push(s);
    });
  });
  var own = un.filter(function (u) { return u.s.mod.fam === u.fam; }).length;
  check('the Union builds from the station\'s own family', own / un.length > 0.75, own + ' of ' + un.length);
  var mean = function (l) { return l.reduce(function (a, b) { return a + b; }, 0) / (l.length || 1); };
  var mu = mean(un.map(function (u) { return size(u.s); })), mm = mean(mo.map(size));
  check('Union pieces are bigger than moonlighters\'', mu > mm * 1.2, Math.round(mu) + ' m against ' + Math.round(mm) + ' m');
})();

console.log('--- the main axis ---');
(function () {
  check('a spine\'s main axis is its length', Gr.mainAxis(GrowthPoints['spine-l']) === 1);
  var bad = 0, n = 0, ends = 0, endUnion = 0;
  plans.filter(function (x) { return x.sys === RICH && x.p.axis >= 0; }).forEach(function (x) {
    var ax = x.p.axis, by = {};
    x.p.slots.forEach(function (s) { if (s.builder === 'union') (by[s.set] = by[s.set] || []).push(s); });
    Object.keys(by).forEach(function (q) {
      var ss = by[q];
      ss.forEach(function (s) {
        n++;
        if (Math.abs(Math.abs(s.at[ax]) - Math.abs(ss[0].at[ax])) > Gr.AX_TOL * 1.001 + 1e-6) bad++;
      });
    });
    var b = GrowthPoints[x.c.model].box, c = (b.max[ax] + b.min[ax]) / 2, h = (b.max[ax] - b.min[ax]) / 2;
    x.p.slots.forEach(function (s) {
      if (s.builder !== 'union' || s.parent >= 0) return;
      endUnion++;
      if (Math.abs(s.n[ax]) > 0.5 && s.n[ax] * (s.at[ax] - c) / h > 0.5) ends++;
    });
  });
  check('a Union set stands at one station along the main axis', bad === 0, bad + ' of ' + n + ' pieces off station');
  check('the Union carries the station on at its ends', ends > 0, ends + ' of ' + endUnion + ' core pieces at the ends');
})();

console.log('--- necks ---');
(function () {
  var withNeck = 0, routeSlots = 0, bad = 0;
  plans.forEach(function (x) {
    var P = GrowthPoints[x.c.model];
    x.p.slots.forEach(function (s) {
      if (s.parent >= 0 || s.point === undefined) return;
      var q = P.points[s.point];
      if (!q || !q.from || !(q.neck > 0.005)) { if (s.neck) bad++; return; }
      routeSlots++;
      if (!s.neck) return;
      withNeck++;
      var d = Math.sqrt([0, 1, 2].reduce(function (a, i) { var v = s.neck.to[i] - s.neck.from[i]; return a + v * v; }, 0));
      if (Math.abs(d - q.neck) > 0.01 || s.neck.to !== s.at) bad++;
    });
  });
  check('a piece on a berth route has a neck from the route to it', routeSlots > 0 && withNeck === routeSlots, withNeck + ' of ' + routeSlots);
  check('the neck is the measured one, and only route pieces have one', bad === 0, bad + ' wrong');
  /* off a piece: the neck runs back into the PARENT piece's own route */
  var chained = 0, cBad = 0;
  plans.forEach(function (x) {
    x.p.slots.forEach(function (s) {
      if (s.parent < 0 || !s.neck) return;
      chained++;
      var P = x.p.slots[s.parent], b = P.box, e = 1e-6;
      var inP = [0, 1, 2].every(function (i) { return s.neck.from[i] >= b.min[i] - e && s.neck.from[i] <= b.max[i] + e; });
      if (s.neck.to !== s.at || !inP) cBad++;
    });
  });
  check('pieces on a piece\'s route have necks too', chained > 0, chained + ' chained necks');
  check('a chained neck starts inside the piece it hangs on', cBad === 0, cBad + ' wrong');
})();

console.log('--- the way in ---');
(function () {
  /* Astra, 2026-10-24: "ensure that all constructed stations have a path
   * for ships to enter from the primary L size berth and be taken through
   * to their docking bay somewhere inside the stations".
   * Worked out here from the port data itself, not from growth.js's own
   * bookkeeping: the PRIMARY entrance is the L berth (a ground site's
   * entrance) that most of the core's berth routes come in through. */
  function primaryOf(m) {
    var L = PortLib[m], B = L.anchors.berths || [], cnt = {};
    B.forEach(function (b) {
      var e = b.doorVia ? 'E' + b.door
        : b.entry !== undefined ? String(b.entry)
        : b.exitVia ? String(B.findIndex(function (x) { return x.node === b.exitVia; })) : null;
      if (e !== null && e !== '-1') cnt[e] = (cnt[e] || 0) + 1;
    });
    var best = Object.keys(cnt).sort(function (a, b) { return cnt[b] - cnt[a]; })[0];
    if (best === undefined) return null;
    var mouth = best[0] === 'E' ? L.entrances[+best.slice(1)] : B[+best];
    var enters = {};
    B.forEach(function (b) {
      var e = b.doorVia ? 'E' + b.door
        : b.entry !== undefined ? String(b.entry)
        : b.exitVia ? String(B.findIndex(function (x) { return x.node === b.exitVia; })) : null;
      if (e === best) enters[b.node] = true;
    });
    return { mouth: mouth, enters: enters };
  }
  var big = function (c) { return c === 'L'; };
  var fits = function (need, have) { return !!have && (!big(need) || big(have)); };
  var bays = 0, reached = 0, why = {}, lane = 0, laneN = 0, cover = 0;
  plans.forEach(function (x) {
    var m = x.c.model, P = primaryOf(m), G = GrowthPoints[m], H = G.half || 1;
    x.p.slots.forEach(function (s) {
      if (!s.mod.nb) return;
      bays++;
      var need = s.mod.cls || 'SM', cur = s, ok = true, r = '';
      for (var hop = 0; hop < 12 && ok; hop++) {
        var md = cur.mod;
        if (md.nb && md.ob) { ok = false; r = 'a bay open only to space'; break; }
        if (!fits(need, md.in)) { ok = false; r = md.in ? 'doorway too small' : 'no inside doorway'; break; }
        if (cur.parent < 0) {
          var q = G.points[cur.point];
          if (!P || !q || q.hull || q.door) { ok = false; r = 'on the core\'s hull or a door'; break; }
          if (!P.enters[q.via]) { ok = false; r = 'on a route from another entrance'; break; }
          if (!fits(need, q.cls)) { ok = false; r = 'on a route too small'; break; }
          break;
        }
        if (cur.via !== 'r' && cur.via !== 'x') { ok = false; r = 'off a piece\'s hull or door'; break; }
        cur = x.p.slots[cur.parent];
      }
      if (ok) reached++; else why[r] = (why[r] || 0) + 1;
    });
    /* the primary's approach: nothing standing in front of its mouth, and
     * nothing built over it */
    if (!P) return;
    var mo = P.mouth, n = mo.normal, a = Math.abs(n[0]) > 0.5 ? 0 : Math.abs(n[1]) > 0.5 ? 1 : 2;
    var w = 45 / (PortLib[m].metresPerUnit || 100);
    x.p.slots.forEach(function (s) {
      if (s.parent < 0 && G.points[s.point] && G.points[s.point].door && G.points[s.point].via === mo.node) cover++;
      laneN++;
      var b = s.box, hit = true;
      for (var i = 0; i < 3; i++) {
        if (i === a) {
          var lo = n[a] > 0 ? mo.mid[a] : mo.mid[a] - 1.5 * H, hi = n[a] > 0 ? mo.mid[a] + 1.5 * H : mo.mid[a];
          if (b.max[i] <= lo || b.min[i] >= hi) hit = false;
        } else {
          var hw = Math.max(w, (mo.max && mo.min) ? (mo.max[i] - mo.min[i]) / 2 : 0);
          if (b.max[i] <= mo.mid[i] - hw || b.min[i] >= mo.mid[i] + hw) hit = false;
        }
      }
      if (hit) lane++;
    });
  });
  check('every grown docking bay is reached from the primary L berth, inside', bays > 0 && reached === bays,
    reached + ' of ' + bays + (Object.keys(why).length ? '; ' + JSON.stringify(why) : ''));
  check('nothing stands in the primary L berth\'s approach', lane === 0, lane + ' of ' + laneN + ' pieces');
  check('nothing is built over the primary L berth\'s mouth', cover === 0, cover + ' pieces');
  check('stations still grow docking bays', bays >= plans.length / 2, bays + ' bays in ' + plans.length + ' plans');
})();

console.log('--- variety ---');
(function () {
  /* 2026-10-21: with only "the biggest that fits", a rich spine built one
   * 139 m access trunk in every set. Families with few big pieces (pad
   * sites, farms) are narrow whatever the Union does, so the spine is the
   * case that shows whether the Union is choosing. */
  var fs = [0, 1, 2, 3, 4].map(function (i) {
    var seen = {}, by = {};
    Gr.plan(ctx(RICH, 'spine-l', 700 + i)).slots.forEach(function (s) {
      if (s.builder === 'union' && !by[s.set]) { by[s.set] = 1; seen[s.mod.f || s.mod.id] = 1; }
    });
    return Object.keys(seen).length;
  });
  check('a rich spine builds several forms, not one block over and over', fs.every(function (n) { return n >= 3; }),
    'forms per port: ' + fs.join(' '));
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

console.log('--- time ---');
(function () {
  /* Astra, 2026-10-24: "I don't think it'd take literal decades to finish
   * one of these things" - "I meant the whole station". */
  var D = Gr.DAY, longest = 0, lateBuilt = 0, uMax = 0, before = 0, during = 0, after = 0, n = 0;
  var all = plans.slice();
  for (var i = 0; i < 60; i++) all.push({ c: ctx(i % 3 === 0 ? RICH : i % 3 === 1 ? MID : POOR, 'spine-l', 1200 + i) });
  all.forEach(function (x) {
    var p = Gr.plan(x.c);
    if (!p.slots.length) return;
    n++;
    var b = p.buildout, w = b.t1 - b.t0;
    if (w > longest) longest = w;
    /* after its build-out a station is finished: only scavengers still weld */
    p.slots.forEach(function (s) {
      if (s.t0 > b.t1 && s.builder !== 'scavenger') lateBuilt++;
      if (s.builder === 'union') uMax = Math.max(uMax, s.t1 - s.t0);
    });
    if (b.t1 <= 0) before++; else if (b.t0 <= 0) during++; else after++;
  });
  check('a whole station is built out in three years at most', longest <= 3 * Gr.YEAR + 1, (longest / Gr.YEAR).toFixed(2) + ' years, longest');
  check('after its build-out only scavengers still build', lateBuilt === 0, lateBuilt + ' late pieces');
  check('a Union piece takes three weeks at most on site', uMax <= 21 * D + 1, (uMax / D).toFixed(1) + ' days, longest');
  check('most ports are finished when the game starts, some are building, some begin later',
    before > during && during > 0 && after > 0, before + ' finished, ' + during + ' building, ' + after + ' later, of ' + n);
})();

console.log('--- the player ---');
(function () {
  var x = plans.filter(function (q) { return q.sys === RICH; })[0];
  /* most ports were built out before the game; find one still to come */
  var c0, p0, s, kk;
  for (kk = 900; kk < 1000 && !s; kk++) {
    c0 = ctx(RICH, x.c.model, kk);
    p0 = Gr.plan(c0);
    s = p0.slots.filter(function (q) { return q.builder === 'union' && q.t0 > 0; })[0];
  }
  kk--;
  if (!s) { check('a future Union job to delay', false); return; }
  var G = {};
  Gr.delay(G, c0.key, s.id, 200 * Gr.DAY);
  var c1 = ctx(RICH, x.c.model, kk, 'civ', G);
  var p1 = Gr.plan(c1);
  var okLater = p1.slots.every(function (q) { return q.id < s.id ? q.t0 === p0.slots[q.id].t0 : Math.abs(q.t0 - p0.slots[q.id].t0 - 200 * Gr.DAY) < 1; });
  check('a stopped Crawler pushes its job and every later one back', okLater);
  var cr = p1.crawlers.filter(function (c) { return c.slots.indexOf(s.id) >= 0; })[0];
  var cr0 = p0.crawlers.filter(function (c) { return c.slots.indexOf(s.id) >= 0; })[0];
  check('and the Crawler comes later too', cr && cr0 && Math.abs(cr.arrive - cr0.arrive - 200 * Gr.DAY) < 1 && cr.arrive < p1.slots[s.id].t0);
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
