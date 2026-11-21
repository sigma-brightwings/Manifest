/* diag-multiples.js - stars stage 3: how many systems got a second (or
 * third) sun, and proof that nothing they already had moved.
 *
 *     node tools/diag-multiples.js [systems]
 *
 * Every system is built twice, with and without opts.noMultiples, and every
 * body, port, route and patrol that exists in both is compared field by
 * field (orbits, types, air, spin, fields, factions, markets, timetables).
 * The only differences allowed are the new stars and the root becoming a
 * barycentre.
 */
'use strict';
global.window = global;
var path = require('path'), SRC = path.join(__dirname, '..', 'src');
['vec3', 'kepler', 'rng', 'economy', 'appeal', 'generate', 'galaxy'].forEach(function (f) { require(path.join(SRC, f + '.js')); });
var Gen = global.Gen, Galaxy = global.Galaxy;
var N = +process.argv[2] || 200;
var NEW = { b0a: 1, b0b: 1, b0c: 1 };
function r(x) { return typeof x === 'number' ? +x.toPrecision(12) : x; }
function bodyKey(b) {
  var o = b.orbit;
  return JSON.stringify([b.id, b.name, b.kind, b.type, r(b.mass), r(b.radius), r(b.insolation), !!b.habitable,
    o ? [o.parent, r(o.a), r(o.e), r(o.inc), r(o.lan), r(o.argp), r(o.m0), r(o.period)] : null,
    b.rotation ? [r(b.rotation.period), r(b.rotation.tilt), r(b.rotation.phase)] : null,
    b.atmosphere ? [r(b.atmosphere.rho0), r(b.atmosphere.cloud)] : null,
    b.magnetosphere ? r(b.magnetosphere.strength) : null,
    b.faction && (b.faction.id || b.faction), b.lifeNote || null, b.cultureNote || null,
    b.market ? [b.market.role, Object.keys(b.market.rows || {}).length, r(b.market.dev)] : null,
    r(b.lat), r(b.lon), b.ring ? r(b.ring.inner) : null]);
}
var g = Galaxy.build('kawartha');
var stars = g.stars.filter(function (s) { return s.factionId; }).slice(0, N);
var shapes = {}, moved = [], pushed = 0, closeSep = [], outSep = [], extraStars = 0, warm = 0, warmPorts = 0, warmAppeal = [];
stars.forEach(function (st) {
  var o = { faction: g.factionById[st.factionId], allFactions: g.factions };
  var A = Gen.generateSystem(st.seed, o);
  var o2 = { noMultiples: true }; for (var k in o) o2[k] = o[k];
  var B = Gen.generateSystem(st.seed, o2);
  var shape = A.root.kind === 'barycentre' ? (A.companion ? 'triple' : 'close') : (A.companion ? 'distant' : 'single');
  shapes[shape] = (shapes[shape] || 0) + 1;
  extraStars += A.stars.length - 1;
  if (A.root.binary) closeSep.push(A.root.binary.aBin);
  if (A.companion) outSep.push(A.companion.orbit.a / 1.495978707e8);
  var byB = {};
  B.bodies.forEach(function (b) { byB[b.id] = bodyKey(b); });
  A.bodies.forEach(function (b) {
    if (NEW[b.id] || /^b0c/.test(b.id) || b.id === 'b0') return;
    if (byB[b.id] !== bodyKey(b)) moved.push(st.name + ' ' + b.id + ' ' + b.name);
  });
  if (A.byId.b0c2) { warm++; warmPorts += A.ports.filter(function (p) { return /^b0cp/.test(p.id); }).length;
    var Ap = global.Appeal, ap = Ap.of(A, A.byId.b0c2); if (ap) warmAppeal.push(ap.score + ' ' + ap.tier + ' (' + ap.why.join(', ') + ')'); }
  /* Ports new since the companions (her moon's, and resorts, which are
   * timetabled after her) are left out of "what existed". */
  var NEWPORT = /^ps\|(b0c|b\d+rs)/;
  var tA = JSON.stringify((A.traffic || []).filter(function (x) { return !NEWPORT.test(String(x.id)); }).map(function (x) { return [x.id, x.from, x.to, r(x.period), r(x.t0), x.souls || 0]; }));
  var tB = JSON.stringify((B.traffic || []).filter(function (x) { return !NEWPORT.test(String(x.id)); }).map(function (x) { return [x.id, x.from, x.to, r(x.period), r(x.t0), x.souls || 0]; }));
  if (tA !== tB) moved.push(st.name + ' traffic');
  var pA = JSON.stringify((A.patrols || []).map(function (x) { return [x.id, x.kind, x.faction]; }));
  var pB = JSON.stringify((B.patrols || []).map(function (x) { return [x.id, x.kind, x.faction]; }));
  if (pA !== pB) moved.push(st.name + ' patrols');
  ['government', 'corruption', 'crimeScore', 'development', 'violence'].forEach(function (f) {
    if (JSON.stringify(A[f]) !== JSON.stringify(B[f])) moved.push(st.name + ' ' + f);
  });
  if ((A.belts || []).length !== (B.belts || []).length) moved.push(st.name + ' belts');
});
function q(a, f) { a = a.slice().sort(function (x, y) { return x - y; }); return a.length ? a[Math.floor(f * (a.length - 1))] : NaN; }
console.log(stars.length + ' systems: ' + JSON.stringify(shapes) + '; ' + extraStars + ' new stars');
console.log('close pairs: a_bin AU p10 ' + q(closeSep, 0.1).toFixed(3) + ' p50 ' + q(closeSep, 0.5).toFixed(3) + ' p90 ' + q(closeSep, 0.9).toFixed(3));
console.log('companions: AU p10 ' + q(outSep, 0.1).toFixed(0) + ' p50 ' + q(outSep, 0.5).toFixed(0) + ' p90 ' + q(outSep, 0.9).toFixed(0));
console.log('warm giants with a living moon: ' + warm + ', their ports ' + warmPorts);
warmAppeal.slice(0, 8).forEach(function (s) { console.log('  moon appeal ' + s); });
console.log('moved: ' + moved.length + (moved.length ? '\n  ' + moved.slice(0, 20).join('\n  ') : ''));
