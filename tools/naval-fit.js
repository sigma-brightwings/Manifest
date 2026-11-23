/* Which naval rooms leave her skin, and where (2026-11-23). */
global.window = global.window || global;
['vec3', 'rng', 'kepler', 'economy', 'generate', 'sim'].forEach(function (m) { require('../src/' + m + '.js'); });
var Combat = require('../src/combat.js');
require('../src/crew.js'); require('../src/hulls.js');
require('../src/walk.js'); require('../src/shipdeck.js'); require('../src/render.js');
var R = global.Render;
(process.argv[2] ? [process.argv[2]] : ['capital', 'carrier', 'meridian', 'leviathan']).forEach(function (id) {
  var h = Combat.HULLS[id], s = { hullId: id, bornId: id + '-1', dryMass: h.dryMass };
  var p = R.shipInterior(s).plan, fit = R.hullFitter(s);
  var bad = [];
  p.rooms.forEach(function (r) {
    if (r.kind !== 'naval') return;
    var fy = p.deckY[r.deck], n = 0, k = 0, worst = [];
    for (var x = r.x0 + 0.1; x <= r.x1 - 0.1 + 1e-9; x += Math.max(0.1, (r.x1 - r.x0 - 0.2) / 4)) {
      for (var z = r.z0 + 0.1; z <= r.z1 - 0.1 + 1e-9; z += Math.max(0.1, (r.z1 - r.z0 - 0.2) / 6)) {
        [fy + 0.1, fy + r.y1 - 0.1].forEach(function (y) { n++; if (fit.inside(x, y, z)) k++; else if (worst.length < 2) worst.push([x.toFixed(1), y.toFixed(1), z.toFixed(1)].join(',')); });
      }
    }
    if (k < n) bad.push(r.sub + ' ' + r.deck + ' ' + Math.round(100 * k / n) + '% [' + worst.join(' ') + ']');
  });
  console.log(id + ': ' + (bad.length ? bad.length + ' out\n  ' + bad.join('\n  ') : 'all inside'));
  console.log('  decks ' + p.deckAll.map(function (d) { return d + ' ' + p.deckY[d].toFixed(1); }).join(', '));
});
