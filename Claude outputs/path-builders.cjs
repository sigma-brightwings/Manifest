// Docks grown, by builder, over every port model x rich/middling/poor x 4 seeds.
global.window = global;
var path = require('path'), R = path.join(__dirname, '..', 'src') + '/';
['ports', 'growth-points', 'modules'].forEach(function (m) { require(R + m + '.js'); });
var Gr = require(R + 'growth.js');
var C = [[{ development: 0.75, corruption: 10, violence: 10 }, 0.55], [{ development: 0.45, corruption: 55, violence: 35 }, 0.25],
         [{ development: 0.3, corruption: 85, violence: 60, pirateHeld: true }, 0.08]];
var by = {}, k = 8000, spine = { union: 0, sets: 0 };
Object.keys(GrowthPoints).forEach(function (m) {
  C.forEach(function (cs) {
    for (var s = 0; s < 4; s++) {
      var p = Gr.plan({ G: {}, sys: cs[0], port: { id: 'p' + k, livery: 'civ', market: { dev: cs[1], role: 'orbital' } }, starId: 's' + k, model: m, key: 'b:' + (k++) });
      p.slots.forEach(function (x) {
        var b = by[x.builder] = by[x.builder] || { pieces: 0, docks: 0, L: 0 };
        b.pieces++; if (x.mod.nb) { b.docks++; if (x.mod.cls === 'L') b.L++; }
        if (/^spine/.test(m) && x.builder === 'union' && x.mod.nb) spine.union++;
      });
    }
  });
});
console.log(JSON.stringify(by), 'union docks on spines', spine.union);
