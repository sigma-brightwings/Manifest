/* diag-appeal2.js - the appeal score (src/appeal.js) across a real galaxy:
 * the spread, the tiers, and the best and worst worlds with their reasons.
 *
 *     node tools/diag-appeal2.js
 */
'use strict';
global.window = global;
var path = require('path'), SRC = path.join(__dirname, '..', 'src');
['vec3', 'kepler', 'rng', 'economy', 'generate', 'galaxy', 'appeal'].forEach(function (f) { require(path.join(SRC, f + '.js')); });
var Gen = global.Gen, Galaxy = global.Galaxy, A = global.Appeal;
var g = Galaxy.build('kawartha');
var rows = [];
g.stars.filter(function (s) { return s.factionId; }).slice(0, 160).forEach(function (st) {
  var sys = Gen.generateSystem(st.seed, { faction: g.factionById[st.factionId], allFactions: g.factions });
  sys.bodies.forEach(function (b) {
    var a = A.of(sys, b);
    if (!a) return;
    var ports = (sys.ports || []).filter(function (p) { return p.parentBody === b; }).length;
    rows.push({ name: st.name + ' / ' + b.name, kind: b.kind, hab: !!b.habitable, a: a, ports: ports });
  });
});
var sc = rows.map(function (r) { return r.a.score; }).sort(function (x, y) { return x - y; });
function q(f) { return sc[Math.floor(f * (sc.length - 1))].toFixed(3); }
console.log(rows.length + ' worlds with air; habitable ' + rows.filter(function (r) { return r.hab; }).length);
console.log('score p10 ' + q(0.1) + '  p25 ' + q(0.25) + '  p50 ' + q(0.5) + '  p75 ' + q(0.75) + '  p90 ' + q(0.9) + '  max ' + q(1));
var tiers = {};
rows.forEach(function (r) { tiers[r.a.tier] = (tiers[r.a.tier] || 0) + 1; });
console.log('tiers ' + JSON.stringify(tiers));
var habT = {};
rows.filter(function (r) { return r.hab; }).forEach(function (r) { habT[r.a.tier] = (habT[r.a.tier] || 0) + 1; });
console.log('habitable tiers ' + JSON.stringify(habT));
var wp = rows.filter(function (r) { return r.ports > 0; });
console.log('with ports: ' + wp.length + ', mean appeal ' + (wp.reduce(function (s, r) { return s + r.a.score; }, 0) / wp.length).toFixed(3));
rows.sort(function (x, y) { return y.a.score - x.a.score; });
console.log('\nbest:');
rows.slice(0, 10).forEach(function (r) {
  console.log('  ' + r.a.score.toFixed(2) + '  ' + r.name + ' (' + r.kind + ', g ' + r.a.gravity.toFixed(1) + ')  ' + r.a.why.join(', '));
});
console.log('\nmedian habitable:');
var hab = rows.filter(function (r) { return r.hab; });
hab.slice(Math.floor(hab.length / 2), Math.floor(hab.length / 2) + 4).forEach(function (r) {
  console.log('  ' + r.a.score.toFixed(2) + '  ' + r.name + '  ' + r.a.why.join(', '));
});
console.log('\nmoons with a giant overhead:');
rows.filter(function (r) { return r.a.why.some(function (w) { return /giant/.test(w); }); }).slice(0, 8).forEach(function (r) {
  console.log('  ' + r.a.score.toFixed(2) + '  ' + r.name + ' (ports ' + r.ports + ')  ' + r.a.why.join(', '));
});
console.log('\nworst habitable:');
hab.slice(-4).forEach(function (r) { console.log('  ' + r.a.score.toFixed(2) + '  ' + r.name + '  ' + r.a.why.join(', ')); });
