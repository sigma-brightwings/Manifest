/* diag-milsats.js - where armed defence platforms would go: how lawful and
 * developed claimed systems are, which have a navy garrison, and how many
 * sit on the border with no-man's land. Measured before any threshold. */
global.window = global.window || global;
['vec3', 'rng', 'kepler', 'economy', 'generate', 'galaxy', 'sim'].forEach(function (m) { require('../src/' + m + '.js'); });
require('../src/combat.js');
var Gen = global.Gen, Galaxy = global.Galaxy, Cb = global.Combat;
var gal = Galaxy.build('kawartha');
var N = +(process.argv[2] || 120);
var rows = [];
var claimed = gal.stars.filter(function (s) { return s.factionId; });
var empty = gal.stars.filter(function (s) { return !s.factionId; });
function emp(f) { return f && !/^(outlaw|pb)/.test(f); }
for (var i = 0; i < Math.min(N, claimed.length); i++) {
  var st = claimed[i];
  var sys = Gen.generateSystem(st.seed, Galaxy.systemOpts(gal, st));
  var nearEmpty = Infinity;
  empty.forEach(function (e) { var d = Galaxy.distance3(st, e); if (d < nearEmpty) nearEmpty = d; });
  rows.push({ id: st.id, f: st.factionId, crime: sys.crimeScore, dev: sys.development, gov: sys.government && sys.government.id,
              navy: (sys.ports || []).some(function (p) { return Cb.fleetPort(p); }), ports: (sys.ports || []).length,
              nearEmpty: nearEmpty });
}
function q(arr, p) { var a = arr.slice().sort(function (x, y) { return x - y; }); return a[Math.floor(p * (a.length - 1))]; }
var cr = rows.map(function (r) { return r.crime; }), dv = rows.map(function (r) { return r.dev; });
console.log(rows.length + ' claimed systems');
console.log('crimeScore q10/q25/q50/q75', q(cr, 0.1), q(cr, 0.25), q(cr, 0.5), q(cr, 0.75));
console.log('development q25/q50/q75/q90', q(dv, 0.25), q(dv, 0.5), q(dv, 0.75), q(dv, 0.9));
console.log('navy garrison', rows.filter(function (r) { return r.navy; }).length);
[3, 4, 5, 6, 8].forEach(function (L) {
  console.log('border (empty star within ' + L + ' ly, empire-held)', rows.filter(function (r) { return emp(r.f) && r.nearEmpty <= L; }).length);
});
var gov = {};
rows.forEach(function (r) { gov[r.gov] = (gov[r.gov] || 0) + 1; });
console.log('governments', JSON.stringify(gov));
[[20, 0.6], [25, 0.55], [30, 0.5]].forEach(function (c) {
  console.log('authority crime<=' + c[0] + ' & dev>=' + c[1] + ' or navy:',
              rows.filter(function (r) { return emp(r.f) && ((r.crime <= c[0] && r.dev >= c[1]) || r.navy); }).length);
});
