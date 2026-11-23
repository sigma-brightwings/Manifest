/* diag-islands.js - how old an island's news is, across many lapses. */
global.window = global.window || global;
require('../src/vec3.js'); require('../src/rng.js'); require('../src/kepler.js');
require('../src/economy.js');
var Gen = require('../src/generate.js'), Galaxy = require('../src/galaxy.js');
require('../src/rings.js'); require('../src/sim.js'); require('../src/rumours.js');
var Cs = require('../src/comsats.js');
var DAY = 86400, gal = Galaxy.build('kawartha');
var ages = [], noLane = 0, n = 0;
for (var k = 0; k < 60; k++) {
  var st = gal.stars[k]; if (!st.factionId) continue;
  var sys = Gen.generateSystem(st.seed, Galaxy.systemOpts(gal, st)); sys.starId = st.id;
  var seen = {};
  Cs.relaysFor(sys, st.id).forEach(function (rl) {
    if (seen[rl.body]) return; seen[rl.body] = 1;
    for (var d = 60; d < 1825; d += 3) {
      var L = Cs.darkSpan({}, st.id, rl.body, d * DAY);
      if (!L) continue;
      var t = L.from + 10 * DAY; if (t >= L.to) { d = Math.ceil(L.to / DAY); continue; }
      sys.ports.filter(function (p) { return p.market && p.parentBody && p.parentBody.id === rl.body; }).forEach(function (p) {
        n++;
        var lanes = Cs.lanesAt(sys, p.id);
        var useful = lanes.filter(function (ln) { var f = sys.byId[ln.other]; return f && !Cs.isIsland({}, sys, st.id, f, t); });
        if (!useful.length) noLane++;
        var a = (t - Cs.seenAt({}, sys, st.id, p, t, null)) / 3600;
        ages.push(a);
        if (n <= 12) console.log(p.name, st.name, 'lanes', lanes.length, 'to lit', useful.length,
          useful.map(function (ln) { return (ln.sched.period / 3600).toFixed(0) + 'h'; }).join(','), 'age', a.toFixed(1) + ' h');
      });
      d = Math.ceil(L.to / DAY);
    }
  });
}
ages.sort(function (a, b) { return a - b; });
console.log(n, 'island-moments,', noLane, 'with no lane to a lit port; median age', ages[ages.length >> 1].toFixed(1), 'h; 90%', ages[Math.floor(ages.length * 0.9)].toFixed(1), 'h');
