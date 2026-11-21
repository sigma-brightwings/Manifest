/* diag-resorts.js - how many resorts, where, and does anything else move?
 *     node tools/diag-resorts.js [systems=120]
 */
'use strict';
global.window = global;
var path = require('path'), SRC = path.join(__dirname, '..', 'src');
['vec3', 'kepler', 'rng', 'economy', 'appeal', 'generate', 'galaxy']
  .forEach(function (f) { require(path.join(SRC, f + '.js')); });
var Gen = global.Gen, Galaxy = global.Galaxy;
var N = +(process.argv[2] || 120);
var gal = Galaxy.build('kawartha');
var stars = gal.stars.filter(function (s) { return s.factionId; }).slice(0, N);
function plain(b) {
  var o = {};
  Object.keys(b).forEach(function (k) {
    var v = b[k];
    if (k === 'children' || k === 'parentBody' || k === 'market' || typeof v === 'function') return;
    o[k] = v;
  });
  return JSON.stringify(o);
}
var resorts = 0, sysWith = 0, moved = 0, compared = 0, routesMoved = 0, sea = 0, names = {}, onCompanion = 0;
stars.forEach(function (st) {
  var opts = Galaxy.systemOpts(gal, st);
  var a = Gen.generateSystem(st.seed, opts);
  var b = Gen.generateSystem(st.seed, Object.assign({}, opts, { noResorts: true }));
  var rs = (a.ports || []).filter(function (p) { return p.resort; });
  resorts += rs.length; if (rs.length) sysWith++;
  rs.forEach(function (p) { names[p.name] = 1; if (p.seaPlatform) sea++; if (/^b0c/.test(p.parentBody.id)) onCompanion++; });
  b.bodies.forEach(function (x) {
    compared++;
    var y = a.byId[x.id];
    if (!y || plain(x) !== plain(y)) moved++;
  });
  var ra = (a.traffic || []).map(function (r) { return JSON.stringify(r); }), have = {};
  ra.forEach(function (s) { have[s] = 1; });
  (b.traffic || []).forEach(function (r) { if (!have[JSON.stringify(r)]) routesMoved++; });
});
console.log(N + ' systems: ' + resorts + ' resorts in ' + sysWith + ' systems (' + onCompanion + ' on companion moons, ' + sea + ' as sea platforms)');
console.log('bodies compared ' + compared + ', changed or missing ' + moved + '; older routes changed ' + routesMoved);
console.log('names: ' + Object.keys(names).slice(0, 12).join(', '));
