/* measure-runner-turns.cjs — how often a Syndicate runner has a civilian
 * she would take within RUNNER_PREY_KM (2026-11-01).
 *
 *     node tools/measure-runner-turns.cjs
 *
 * aggression.js turns a runner on RUNNER_TURN_P of her legs near you, but
 * only when there is prey: a civilian in cruise within reach, unarmed or
 * no tougher than she is. This samples runners in cruise across seeds and
 * reports how often that prey is there, so the real rate is the product.
 */
'use strict';
global.window = global.window || global;
['vec3', 'rng', 'kepler', 'economy', 'generate', 'sim'].forEach(function (m) { require('../src/' + m + '.js'); });
var Combat = require('../src/combat.js');
var Galaxy = require('../src/galaxy.js');
var A = require('../src/aggression.js');
var V = global.V, Sim = global.Sim, Gen = global.Gen, Eco = global.Economy;
var H = Combat.NPC_HULL;
function hull(c) { return H[c] || 50; }
var phases = {}, okPhase = {};
var samples = 0, withPrey = 0, systems = 0, runnerSys = 0, dists = [];
['kawartha', 'alpha', 'pigeon', 'manifest', 'reverie', 'orrin'].forEach(function (seed) {
  var g = Galaxy.build(seed);
  for (var s = 0; s < g.stars.length && s < 40; s++) {
    var star = g.stars[s];
    if (!star.factionId) continue;
    var sys = Gen.generateSystem(star.seed, Galaxy.systemOpts(g, star));
    systems++;
    if (!(sys.traffic || []).some(function (r) { return r.runner; })) continue;
    runnerSys++;
    for (var k = 0; k < 24; k++) {
      var t = 1e6 + k * 37000;
      var list = Sim.trafficAll(sys, t);
      list.forEach(function (st) {
        if (!st.route || !st.route.runner || st.phase === 'moored' || st.landed || st.inside) return;
        phases[st.phase] = (phases[st.phase] || 0) + 1;
        var c = st.cls || st.route.cls;
        if (!Combat.isArmedNpc({ cls: c })) return;
        samples++;
        var nearest = Infinity, ok = false;
        list.forEach(function (o) {
          if (o === st || !o.route || o.route.runner || o.route.flag === 'outlaw' || o.phase === 'moored' || !o.pos) return;
          var d = V.dist(o.pos, st.pos);
          var oc = o.cls || o.route.cls;
          var val = (o.manifest || []).reduce(function (a, m) { var cc = Eco.BY_ID[m.cid]; return a + (cc && !cc.waste ? (m.qty || 0) * cc.base : 0); }, 0);
          if (!(val > 0)) return;
          if (Combat.isArmedNpc({ cls: oc }) && hull(oc) > hull(c)) return;
          if (d < nearest) nearest = d;
          if (d <= A.RUNNER_PREY_KM) ok = true;
        });
        if (ok) { withPrey++; okPhase[st.phase] = (okPhase[st.phase] || 0) + 1; }
        if (isFinite(nearest)) dists.push(nearest);
      });
    }
  }
});
dists.sort(function (a, b) { return a - b; });
var q = function (p) { return dists.length ? Math.round(dists[Math.floor(p * (dists.length - 1))]) : 'n/a'; };
console.log('systems', systems, 'with runners', runnerSys);
console.log('armed runners in cruise sampled', samples);
console.log('with takeable prey within ' + A.RUNNER_PREY_KM + ' km:', samples ? (100 * withPrey / samples).toFixed(1) + '%' : 'n/a');
console.log('nearest takeable prey, km: p10', q(0.1), 'median', q(0.5), 'p90', q(0.9));
console.log('so a runner leg near you turns about', samples ? (100 * A.RUNNER_TURN_P * withPrey / samples).toFixed(2) + '% of the time' : 'n/a');
console.log('by phase (sampled / with prey):', JSON.stringify(phases), JSON.stringify(okPhase));
