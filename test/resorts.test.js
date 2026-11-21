/* resorts.test.js - worlds worth visiting, slice 3: the resort pad
 * (2026-11-20).
 *
 *     node test/resorts.test.js
 *
 * claude/worlds-people-and-infrastructure.md: "The most appealing worlds
 * get a guaranteed second ground port, off their own forked substream so no
 * existing pad moves." Pinned here:
 *  - every postcard world a ship can land on has at least two ground ports;
 *  - resorts stand only on postcard worlds, in the open air, with a name
 *    of their own, a market, dressing and routes, and ferries carrying people;
 *  - nothing that existed before moves: every body and every route is the
 *    same, field by field, with and without them;
 *  - the same seed builds the same resorts.
 */
'use strict';
global.window = global;
var path = require('path'), SRC = path.join(__dirname, '..', 'src');
['vec3', 'kepler', 'rng', 'economy', 'appeal', 'generate', 'galaxy']
  .forEach(function (f) { require(path.join(SRC, f + '.js')); });
var Gen = global.Gen, Galaxy = global.Galaxy, A = global.Appeal;

var pass = 0, fail = 0;
function check(n, c, d) {
  if (c) { pass++; console.log('  ok   ' + n + (d !== undefined ? '   ' + d : '')); }
  else { fail++; console.log('  FAIL ' + n + (d !== undefined ? '   ' + d : '')); }
}

var gal = Galaxy.build('kawartha');
var stars = gal.stars.filter(function (s) { return s.factionId; }).slice(0, 80);
var MAXG = Gen.MAX_SURFACE_G;
function plain(b) {
  var o = {};
  Object.keys(b).forEach(function (k) {
    if (k === 'children' || k === 'parentBody' || k === 'market' || typeof b[k] === 'function') return;
    o[k] = b[k];
  });
  return JSON.stringify(o);
}

var rows = stars.map(function (st) {
  var opts = Galaxy.systemOpts(gal, st);
  return { st: st, opts: opts, a: Gen.generateSystem(st.seed, opts),
           b: Gen.generateSystem(st.seed, Object.assign({}, opts, { noResorts: true })) };
});
var resorts = [];
rows.forEach(function (r) { (r.a.ports || []).forEach(function (p) { if (p.resort) resorts.push({ r: r, p: p }); }); });
console.log('     ' + resorts.length + ' resorts in ' + rows.length + ' systems: ' +
            resorts.slice(0, 6).map(function (x) { return x.p.name + ' (' + x.p.parentBody.name + ')'; }).join(', '));

console.log('--- where ---');
check('some postcard worlds get a resort', resorts.length > 0, resorts.length);
check('only on a postcard world', resorts.every(function (x) {
  var a = A.of(x.r.a, x.p.parentBody); return a && a.score >= 0.7;
}));
var short = 0, postcards = 0;
rows.forEach(function (r) {
  r.a.bodies.forEach(function (w) {
    if (w.kind !== 'planet' && w.kind !== 'moon') return;
    var a = A.of(r.a, w);
    if (!a || a.score < 0.7) return;
    if (MAXG !== undefined && Gen.surfaceGravity && Gen.surfaceGravity(w) > MAXG) return;
    postcards++;
    var ground = (w.children || []).filter(function (c) { return c.surface && !c.playerStation; });
    if (ground.length < 2) short++;
  });
});
check('every postcard world a ship can land on has two ground ports or more', short === 0,
      short + ' short of ' + postcards + ' postcard worlds');

console.log('--- what ---');
check('open air, never a buried bay', resorts.every(function (x) { return !x.p.underground; }));
check('called a resort, a spa, a retreat...', resorts.every(function (x) {
  return /(Resort|Spa|Retreat|Lodge|Springs|Terraces)$/.test(x.p.name);
}));
check('a port like any other: market, dressing, a faction', resorts.every(function (x) {
  return x.p.market && x.p.market.rows && x.p.dressing && x.p.docking !== false && !!x.p.faction;
}));
check('in the system\'s lists', resorts.every(function (x) {
  return x.r.a.byId[x.p.id] === x.p && x.r.a.ports.indexOf(x.p) >= 0 && (x.r.a.pads || []).indexOf(x.p) >= 0;
}));
var withRoutes = resorts.filter(function (x) {
  return (x.r.a.traffic || []).some(function (t) { return t.from === x.p.id || t.to === x.p.id; });
});
check('traffic calls at it', withRoutes.length === resorts.length, withRoutes.length + ' of ' + resorts.length);
var ferries = 0;
resorts.forEach(function (x) {
  (x.r.a.traffic || []).forEach(function (t) {
    if ((t.from === x.p.id || t.to === x.p.id) && t.cls === 'shuttle' && t.souls > 0) ferries++;
  });
});
check('and its ferries carry people', ferries > 0, ferries + ' ferries with seats');
/* Its ships are not yours. addPortRoutes was written for the stations you
 * found and used to stamp every route `playerPort`, which made a resort's
 * (and a world dig's, and a companion moon's) traffic count as your own
 * lines: never raided, never held at a lonely pad, never a target. */
var lateRoutes = [], notMine = true;
rows.forEach(function (r) { (r.a.traffic || []).forEach(function (t) {
  if (t.latePort || /^ps\|/.test(t.id)) { lateRoutes.push({ r: r, t: t }); if (t.playerPort) notMine = false; }
}); });
check('a resort\'s ships are not counted as yours', lateRoutes.length > 0 && notMine, lateRoutes.length + ' late routes');
var raidable = 0;
lateRoutes.forEach(function (x) {
  if (!(x.r.a.raidOdds > 0)) return;
  (x.r.a.ports || []).forEach(function (p) {
    ((p.market && p.market.inbound) || []).forEach(function (d) { if (d.route === x.t.id && d.raidP > 0) raidable++; });
  });
});
check('and they are raided at the system\'s odds, like everyone else\'s', raidable > 0, raidable + ' deliveries');

console.log('--- nothing else moves ---');
var moved = 0, compared = 0, routesMoved = 0;
rows.forEach(function (r) {
  r.b.bodies.forEach(function (x) { compared++; var y = r.a.byId[x.id]; if (!y || plain(x) !== plain(y)) moved++; });
  var have = {};
  (r.a.traffic || []).forEach(function (t) { have[JSON.stringify(t)] = 1; });
  (r.b.traffic || []).forEach(function (t) { if (!have[JSON.stringify(t)]) routesMoved++; });
});
check('every body is what it was, field by field', moved === 0, moved + ' of ' + compared);
check('every older route is what it was', routesMoved === 0, routesMoved + ' changed');
check('with noResorts there are none', rows.every(function (r) { return !(r.b.ports || []).some(function (p) { return p.resort; }); }));

console.log('--- the same twice ---');
var x0 = resorts[0];
var again = x0 ? Gen.generateSystem(x0.r.st.seed, x0.r.opts) : null;
var p2 = again ? again.byId[x0.p.id] : null;
check('the same seed, the same resort', p2 && p2.name === x0.p.name && p2.lat === x0.p.lat && p2.lon === x0.p.lon,
      p2 ? p2.name : 'none');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
