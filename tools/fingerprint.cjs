/* Fingerprints generation, so an additive feature can PROVE it moved nothing.
 * Usage: node tools/fingerprint.cjs [systemsPerSeed]  -> one hash per seed.
 * Run before and after a change; identical lines mean identical worlds.
 * New fields (rings, belts) are deliberately outside the projection. */
'use strict';
var crypto = require('crypto');
require('../src/vec3.js'); require('../src/rng.js'); require('../src/slipspace.js');
require('../src/kepler.js'); require('../src/economy.js'); require('../src/generate.js');
var Galaxy = require('../src/galaxy.js');
var N = +process.argv[2] || 12;
var SEEDS = ['kawartha', 'beaverton', 'syndicate-test', 'driftwood', 'manifest'];
function r6(x) { return typeof x === 'number' ? +x.toPrecision(10) : x; }
function proj(sys) {
  return {
    name: sys.name, gov: sys.government && sys.government.id, crime: r6(sys.crimeScore),
    bodies: sys.bodies.map(function (b) {
      var o = b.orbit;
      return [b.id, b.name, b.kind, b.type, r6(b.mass), r6(b.radius), !!b.surface,
              r6(b.lat), r6(b.lon), r6(b.elevation),
              o ? [o.parent, r6(o.a), r6(o.e), r6(o.inc), r6(o.lan), r6(o.argp), r6(o.m0)] : null,
              b.rotation ? [r6(b.rotation.period), r6(b.rotation.tilt), r6(b.rotation.phase)] : null,
              b.faction && (b.faction.id || b.faction),
              b.market ? [b.market.role, (b.market.rows || []).length] : null];
    }),
    traffic: (sys.traffic || []).map(function (r) { return [r.id, r.from && (r.from.id || r.from), r.to && (r.to.id || r.to), r6(r.period), r6(r.cruise)]; }),
    patrols: (sys.patrols || []).map(function (p) { return [p.id, p.kind, p.faction]; })
  };
}
SEEDS.forEach(function (seed) {
  var g = Galaxy.build(seed);
  var h = crypto.createHash('sha256');
  h.update(JSON.stringify(g.stars.map(function (s) { return [s.id, s.name, s.seed, r6(s.x), r6(s.y), r6(s.z), s.factionId]; })));
  for (var i = 0; i < Math.min(N, g.stars.length); i++) {
    var st = g.stars[i];
    var fac = g.factionById ? g.factionById[st.factionId] : null;
    var sys = Gen.generateSystem(st.seed, fac ? { faction: fac, allFactions: g.factions } : undefined);
    h.update(JSON.stringify(proj(sys)));
  }
  console.log(seed + '  ' + h.digest('hex').slice(0, 24));
});
