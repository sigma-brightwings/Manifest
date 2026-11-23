/* streams.test.js - ships on the lanes and out past the worlds (2026-11-22).
 *
 *     node test/streams.test.js
 *
 * Astra: "We need more ships running around in general" - on the lanes,
 * and in the outer system. Her picks: lane streams AND passers-by (busy
 * lanes thick, every other lane thin), and all four outer-system trades:
 * ice haulers, prospectors, gas-giant skimmers, survey ships.
 *
 * Pinned here:
 *  - generation: lanes and workers are additive - with them off, every
 *    route, patrol and market is what it is with them on; neither is in
 *    sys.traffic, so no berth counts them;
 *  - lanes: one per pair of worlds with interplanetary trade, on its
 *    busiest route; a few busy, the rest thin; bounded;
 *  - near a ship out on a lane, lane hulls appear, exactly where their own
 *    timetable puts them, only in the open middle of a crossing, the same
 *    every time; and a ship out there is less alone than it was;
 *  - workers: all four trades turn up; each works its site (in the air, in
 *    the ring, in the field, over the moon, far out) and comes home to a
 *    port; none takes a berth;
 *  - a lane hull and a worker can be lifted like any trader, and have a
 *    captain.
 */
'use strict';
global.window = global.window || global;
['vec3', 'rng', 'kepler', 'economy', 'rings', 'generate', 'sim'].forEach(function (m) { require('../src/' + m + '.js'); });
var Combat = require('../src/combat.js');
require('../src/missions.js');
var Cap = require('../src/captains.js');
var Galaxy = require('../src/galaxy.js');
var V = global.V, Sim = global.Sim, Gen = global.Gen, Rings = global.Rings;
var AU = 1.496e8;

var pass = 0, fail = 0;
function check(n, c, d) {
  if (c) { pass++; console.log('  ok   ' + n + (d !== undefined ? '   ' + d : '')); }
  else { fail++; console.log('  FAIL  ' + n + (d !== undefined ? '   ' + d : '')); }
}
function d3(a, b) { return V.dist(a, b); }

var g = Galaxy.build('kawartha');
var stars = g.stars.filter(function (s) { return s.factionId; });
var systems = [];
for (var i = 0; i < stars.length && systems.length < 14; i++) {
  var sys = Gen.generateSystem(stars[i].seed, Galaxy.systemOpts(g, stars[i]));
  sys.starId = stars[i].id;
  if (sys.ports && sys.ports.length >= 2) systems.push({ star: stars[i], sys: sys });
}
check('systems to read', systems.length >= 12, systems.length);

/* ---- additive ------------------------------------------------------------ */
console.log('additive');
(function () {
  var s0 = systems[0], sA = s0.sys;
  var sB = Gen.generateSystem(s0.star.seed, Object.assign({}, Galaxy.systemOpts(g, s0.star), { noLanes: true, noWorkers: true }));
  var sig = function (s) {
    return JSON.stringify({
      tr: s.traffic.map(function (r) { return [r.id, r.name, r.from, r.to, Math.round(r.t0), Math.round(r.period)]; }),
      pa: s.patrols.map(function (p) { return [p.id, p.name, p.kind]; }),
      mk: s.ports.map(function (p) { return p.market ? Object.keys(p.market.rows || {}).map(function (k) { return k + ':' + Math.round((p.market.rows[k].price || 0) * 100); }).join(',') : ''; })
    });
  };
  check('with lanes and workers off, routes, patrols and markets are unchanged', sig(sA) === sig(sB));
  check('no lane hull or worker is in sys.traffic', sA.traffic.every(function (r) { return !r.stream && r.kind !== 'work'; }));
  check('and none is a berth occupant', sA.ports.every(function (p) {
    return Sim.berthOccupants(p, sA, 4e6).every(function (o) { return !o.route.stream && o.route.kind !== 'work'; });
  }));
})();

/* ---- lanes ------------------------------------------------------------- */
console.log('lanes');
var allLanes = [], badTpl = [];
systems.forEach(function (x) {
  (x.sys.lanes || []).forEach(function (l) {
    allLanes.push(l);
    var tpl = Sim.laneTemplate(x.sys, l);
    if (!tpl || tpl.local) badTpl.push(x.sys.name + ' ' + l.id);
  });
});
check('lanes exist', allLanes.length >= systems.length, allLanes.length + ' lanes');
check('each runs on a real interplanetary route', !badTpl.length, badTpl.slice(0, 3).join('; '));
check('a few busy per system, the rest thin', systems.every(function (x) {
  return (x.sys.lanes || []).filter(function (l) { return l.busy; }).length <= Gen.LANE_BUSY;
}));
check('bounded', allLanes.every(function (l) { return l.n >= 2 && l.n <= 240; }),
      'max ' + Math.max.apply(null, allLanes.map(function (l) { return l.n; })));

/* Out on the lanes: ships >1e6 km from any port, before and after. */
var T = 4e6, samples = 0, aloneBefore = 0, aloneAfter = 0, mismatch = [], edge = [], shownAny = 0, sameTwice = true;
systems.forEach(function (x) {
  var s = x.sys;
  s._laneShown = null;
  var pp = s.ports.map(function (p) { return Sim.bodyPosition(p, s, T); });
  var base = Sim.trafficAll(s, T).filter(function (st) {
    return st.phase === 'cruise' && !st.route.stream && st.route.kind !== 'work' &&
           Math.min.apply(null, pp.map(function (q) { return d3(st.pos, q); })) > 1e6;
  });
  base.slice(0, 25).forEach(function (me) {
    samples++;
    s._laneShown = null; s._traffic = null;
    var before = Sim.trafficAll(s, T).filter(function (o) { return o.route !== me.route && d3(o.pos, me.pos) < 1e6; }).length;
    if (!before) aloneBefore++;
    var shown = Sim.updateLanes(s, T, me.pos, true) || [];
    var ids = shown.map(function (r) { return r.id; }).join(',');
    var again = (Sim.updateLanes(s, T, me.pos, true) || []).map(function (r) { return r.id; }).join(',');
    if (ids !== again) sameTwice = false;
    if (shown.length) shownAny++;
    var after = Sim.trafficAll(s, T).filter(function (o) { return o.route !== me.route && d3(o.pos, me.pos) < 1e6; }).length;
    if (!after) aloneAfter++;
    Sim.trafficAll(s, T).forEach(function (st) {
      if (!st.route.stream) return;
      var exact = Sim.trafficCore(st.route, s, T);
      if (d3(exact.pos, st.pos) > 1) mismatch.push(st.route.id);
      if (st.progress < Sim.LANE_EDGE - 1e-9 || st.progress > 1 - Sim.LANE_EDGE + 1e-9 || st.phase !== 'cruise') edge.push(st.route.id + ' ' + st.phase + ' ' + st.progress.toFixed(2));
      if (d3(st.pos, me.pos) > Sim.LANE_SHOW_KM * 1.01) edge.push(st.route.id + ' too far');
    });
  });
  s._laneShown = null; s._traffic = null;
});
check('lane hulls turn up near ships out on the lanes', shownAny > samples * 0.6, shownAny + ' of ' + samples);
check('each exactly where her own timetable has her', !mismatch.length, mismatch.slice(0, 3).join('; '));
check('only in the open middle of a crossing, and within range', !edge.length, edge.slice(0, 3).join('; '));
check('the same hulls every time', sameTwice);
check('a ship out on the lanes is less alone', aloneAfter < aloneBefore * 0.85,
      'alone within 1M km: ' + Math.round(100 * aloneBefore / samples) + '% -> ' + Math.round(100 * aloneAfter / samples) + '%');

/* ---- workers ------------------------------------------------------------ */
console.log('the outer system');
var kinds = {}, badSite = [], badHome = [], beyond3 = 0;
systems.forEach(function (x) {
  var s = x.sys;
  (s.workers || []).forEach(function (w) {
    kinds[w.work] = (kinds[w.work] || 0) + 1;
    var home = s.byId[w.from], site = s.byId[w.to];
    if (!home || !home.market || s.ports.indexOf(home) < 0) badHome.push(s.name + ' ' + w.name);
    /* Mid-layover at the site: where is she? */
    var tAt = w.t0 + w.cruise + w.layover * 0.5;
    var st = Sim.trafficState(w, s, tAt);
    var sp = Sim.bodyPosition(site, s, tAt);
    var dd = d3(st.pos, sp);
    var ok = w.work === 'skim' ? dd < site.radius * 1.1 :
             w.work === 'ring' ? (site.ring && dd > site.ring.inner * 0.9 && dd < site.ring.outer * 1.1) :
             w.work === 'field' ? dd < (site.radius || 50) * 1.01 :
             w.work === 'ice' ? dd < site.radius * 6 :
             w.work === 'survey' ? dd < site.radius * 6 : false;
    if (!ok) badSite.push(s.name + ' ' + w.name + ' (' + w.work + ') ' + Math.round(dd) + ' km off ' + site.name);
    if (d3(sp, Sim.bodyPosition(s.root, s, tAt)) > 3 * AU) beyond3++;
  });
});
['skim', 'ring', 'field', 'ice', 'survey'].forEach(function (k) {
  check('a ' + Gen.WORKER_CLASS[k].label + ' turns up', (kinds[k] || 0) > 0, kinds[k] || 0);
});
check('each works her site', !badSite.length, badSite.slice(0, 3).join('; '));
check('and comes home to a port', !badHome.length, badHome.slice(0, 3).join('; '));
check('some of them far out', beyond3 > 0, beyond3 + ' sites beyond 3 AU');
check('a field site flies with its field', systems.some(function (x) {
  return (x.sys.sites || []).some(function (st) {
    var c = Rings.fieldCenter(st.fieldRef, x.sys, T);
    return d3(Sim.bodyPosition(st, x.sys, T), c.pos) < 1;
  });
}));

/* ---- lifted like anyone ------------------------------------------------- */
console.log('lifted like anyone');
(function () {
  var x = systems.filter(function (y) { return (y.sys.workers || []).length && (y.sys.lanes || []).length; })[0];
  if (!x) { check('a system with both', false); return; }
  var s = x.sys, G = { seed: 'kawartha', galaxy: g, t: T, standing: {} };
  var wst = Sim.trafficAll(s, T).filter(function (st) { return st.route.kind === 'work'; })[0];
  var sp = Combat.liftTrader(s, wst, T);
  check('a worker lifts', !!(sp && sp.live) && wst.route.suppressed,
        sp && sp.name + ' (' + sp.className + ')');
  check('and leaves the rail while she is lifted', !Sim.trafficAll(s, T + 1).some(function (st) { return st.route === wst.route; }));
  check('she has a captain', !!Cap.profile(G, s, sp), (Cap.profile(G, s, sp) || {}).name);
  /* A lane hull, near the first lane's reference ship. */
  var lane = s.lanes[0], tpl = Sim.laneTemplate(s, lane), got = null;
  for (var k = 1; k <= lane.n && !got; k++) {
    var r = Sim.laneRoute(s, lane, k), st = Sim.trafficCore(r, s, T);
    if (st.phase === 'cruise' && st.progress > 0.2 && st.progress < 0.8) {
      var shown = Sim.updateLanes(s, T, V.add(st.pos, { x: 50, y: 0, z: 0 }), true) || [];
      if (shown.indexOf(r) >= 0) got = r;
    }
  }
  check('a lane hull, found by updateLanes', !!got, got && got.name + ' on ' + lane.id);
  if (got) {
    var lst = Sim.trafficAll(s, T).filter(function (st) { return st.route === got; })[0];
    var lsp = Combat.liftTrader(s, lst, T);
    check('lifts', !!(lsp && lsp.live) && got.suppressed);
    check('has a captain', !!Cap.profile(G, s, lsp));
    check('is the same route object next time she is asked for', Sim.laneRoute(s, lane, Number(got.id.split('.').pop())) === got);
    check('carries a share of her lane\'s trade', (got.out || []).length === (tpl.out || []).length);
  }
})();

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
