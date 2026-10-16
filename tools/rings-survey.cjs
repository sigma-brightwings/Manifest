/* Measures what rings.js actually produces across a galaxy. Not a test:
 * the numbers it prints are what the thresholds in the test were set from. */
'use strict';
require('../src/vec3.js'); require('../src/rng.js'); require('../src/slipspace.js');
require('../src/kepler.js'); require('../src/economy.js'); require('../src/generate.js');
var Galaxy = require('../src/galaxy.js');
var R = require('../src/rings.js');
var V = global.V, AU = R.AU;
var seed = process.argv[2] || 'kawartha', N = +process.argv[3] || 60;
var g = Galaxy.build(seed);
var giants = 0, ringed = 0, grand = 0, systems = 0, inner = 0, outer = 0, fields = 0;
var widths = [], chunkCounts = [], chunkMs = [], memberMs = [], lanes = 0;
for (var i = 0; i < Math.min(N, g.stars.length); i++) {
  var st = g.stars[i], fac = g.factionById[st.factionId];
  var sys = Gen.generateSystem(st.seed, fac ? { faction: fac, allFactions: g.factions } : undefined);
  systems++;
  sys.bodies.forEach(function (b) {
    if (!R.isGiant(b)) return;
    giants++;
    if (!b.ring) return;
    ringed++; if (b.ring.grand) grand++;
    widths.push(((b.ring.inner / b.radius).toFixed(2)) + '-' + (b.ring.outer / b.radius).toFixed(2));
    lanes += b.ring.gaps.filter(function (x) { return x.kind === 'lane'; }).length;
    // chunks near a point in the densest part of the ring
    var ps = { pos: { x: 0, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 } };
    var fr = R.ringFrame(b), best = 0, bestR = 0;
    for (var r = b.ring.inner; r < b.ring.outer; r += (b.ring.outer - b.ring.inner) / 200) {
      var d = R.ringDensity(b.ring, r); if (d > best) { best = d; bestR = r; }
    }
    var pt = V.scale(fr.e1, bestR);
    var t0 = process.hrtime.bigint();
    var ch = R.ringChunksNear(b, ps, pt, 3, 1e7, 0);
    chunkMs.push(Number(process.hrtime.bigint() - t0) / 1e6);
    chunkCounts.push(ch.length);
  });
  (sys.belts || []).forEach(function (bl) {
    if (bl.id === 'belt-inner') inner++; else outer++;
    fields += bl.fields.length;
    var f = bl.fields[0]; if (!f) return;
    var c = R.fieldCenter(f, sys, 1e7), hf = R.hillFrame(c);
    var t0 = process.hrtime.bigint();
    for (var m = 0; m < f.count; m++) R.fieldMember(f, m, sys, 1e7, c, hf);
    memberMs.push(Number(process.hrtime.bigint() - t0) / 1e6);
  });
}
function med(a) { var s = a.slice().sort(function (x, y) { return x - y; }); return s[Math.floor(s.length / 2)]; }
console.log('systems', systems, 'giants', giants, 'ringed', ringed, '(' + (100 * ringed / giants).toFixed(0) + '%)', 'grand', grand, 'station lanes', lanes);
console.log('ring spans in planet radii (first 10):', widths.slice(0, 10).join('  '));
console.log('inner belts', inner, 'outer belts', outer, 'fields', fields);
console.log('chunks within 3 km of the densest point: median', med(chunkCounts), 'max', Math.max.apply(null, chunkCounts), ' lookup ms median', med(chunkMs).toFixed(3), 'max', Math.max.apply(null, chunkMs).toFixed(3));
console.log('one whole field of members, ms median', med(memberMs).toFixed(3), 'max', Math.max.apply(null, memberMs).toFixed(3));
