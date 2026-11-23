/* diag-appeal.js - what an "appeal" score for habitable worlds has to work
 * with, measured across the kawartha galaxy before any weights are set.
 *
 *     node tools/diag-appeal.js
 */
'use strict';
global.window = global;
var path = require('path'), SRC = path.join(__dirname, '..', 'src');
['vec3', 'kepler', 'rng', 'economy', 'generate', 'galaxy'].forEach(function (f) { require(path.join(SRC, f + '.js')); });
var Gen = global.Gen, Galaxy = global.Galaxy;
var g = Galaxy.build('kawartha');
var rows = [], keys = {};
var stars = g.stars.filter(function (s) { return s.factionId; }).slice(0, 160);
stars.forEach(function (st) {
  var sys = Gen.generateSystem(st.seed, { faction: g.factionById[st.factionId], allFactions: g.factions });
  (sys.bodies || []).forEach(function (b) {
    if (!b.habitable && !(b.kind === 'moon' && b.atmosphere && b.atmosphere.rho0 > 0.3)) return;
    Object.keys(b).forEach(function (k) { keys[k] = (keys[k] || 0) + 1; });
    var parent = b.parentBody || null;
    var ports = (sys.ports || []).filter(function (p) { return p.parentBody === b || p.parent === b.id || p.body === b.id; });
    rows.push({
      sys: st.name, name: b.name, kind: b.kind, type: b.type, band: b.habitableBand,
      g: Gen.surfaceGravity ? Gen.surfaceGravity(b) : null,
      rho: b.atmosphere ? b.atmosphere.rho0 : 0, cloud: b.atmosphere ? b.atmosphere.cloud : null,
      ins: b.insolation, mag: b.magnetosphere ? b.magnetosphere.strength : 0,
      act: b.magnetosphere ? b.magnetosphere.activity : 0,
      moons: (b.children || []).length,
      giantParent: !!(parent && (parent.type === 'gasGiant' || parent.type === 'iceGiant')),
      rings: !!(b.rings || (parent && parent.rings)),
      ports: ports.length, surfacePorts: ports.filter(function (p) { return p.surface; }).length
    });
  });
});
function q(arr, f) { arr = arr.slice().sort(function (a, b) { return a - b; }); return arr[Math.floor(f * (arr.length - 1))]; }
console.log(rows.length + ' worlds with air in ' + stars.length + ' claimed systems');
console.log('fields seen: ' + Object.keys(keys).join(' '));
['g', 'rho', 'cloud', 'ins', 'mag', 'act', 'moons', 'ports', 'surfacePorts'].forEach(function (k) {
  var v = rows.map(function (r) { return r[k]; }).filter(function (x) { return typeof x === 'number'; });
  if (!v.length) return console.log(k + ': none');
  console.log((k + '        ').slice(0, 12) + 'p10 ' + q(v, 0.1).toFixed(3) + '  p50 ' + q(v, 0.5).toFixed(3) + '  p90 ' + q(v, 0.9).toFixed(3));
});
var count = function (f) { return rows.filter(f).length; };
console.log('kinds: planet ' + count(function (r) { return r.kind === 'planet'; }) + ', moon ' + count(function (r) { return r.kind === 'moon'; }));
console.log('bands: global ' + count(function (r) { return r.band === 'global'; }) + ', terminator ' + count(function (r) { return r.band === 'terminator'; }) +
            ', equator ' + count(function (r) { return r.band === 'equator'; }));
console.log('moon of a giant: ' + count(function (r) { return r.giantParent; }) + ', rings: ' + count(function (r) { return r.rings; }) +
            ', aurora (field over air): ' + count(function (r) { return r.mag > 0 && r.rho > 0.05; }));
console.log('types: ' + JSON.stringify(rows.reduce(function (m, r) { m[r.type] = (m[r.type] || 0) + 1; return m; }, {})));
