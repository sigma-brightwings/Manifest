/* diag-block.js — the reactor block on the L hulls: rooms, doors, and
 * whether each room is inside her hull (render.js hullFitter). */
global.window = global.window || global;
['vec3', 'rng', 'kepler', 'economy', 'generate', 'sim'].forEach(function (m) { require('../src/' + m + '.js'); });
var Combat = require('../src/combat.js');
require('../src/crew.js'); require('../src/hulls.js');
var W = require('../src/walk.js'); require('../src/shipdeck.js'); require('../src/render.js');
var R = global.Render, W2 = global.Walk;
var only = process.argv[2];
['kestrel', 'cutter', 'longhaul', 'tanker'].forEach(function (id) {
  if (only && only !== id) return;
  ['A', 'B'].forEach(function (v) {
    var ship = { hullId: id, bornId: id + '-1', dryMass: Combat.HULLS[id].dryMass, blockVariant: v };
    var d = R.shipInterior(ship), p = d.plan;
    var fit = R.hullFitter ? R.hullFitter(ship) : null;
    console.log('== ' + id + ' ' + v + ' (plan ' + (p.block || '-') + ')  floorY ' + (p.floorY || 0).toFixed(2) + (p.raised ? '  raised ' + p.raised.rise : ''));
    p.rooms.forEach(function (r) {
      var out = 0, n = 0;
      if (fit) {
        var fy = (r.deck && p.deckY && p.deckY[r.deck] !== undefined ? p.deckY[r.deck] : p.floorY) + (r.y0 || 0);
        for (var x = r.x0 + 0.1; x <= r.x1 - 0.1; x += 0.4) for (var z = r.z0 + 0.1; z <= r.z1 - 0.1; z += 0.5) {
          [fy + 0.1, fy + (r.y1 - (r.y0 || 0)) - 0.1].forEach(function (y) { n++; if (!fit.inside(x, y, z)) out++; });
        }
      }
      console.log('  ' + r.id + ' ' + r.kind + (r.sub ? '/' + r.sub : '') + '  x ' + r.x0.toFixed(2) + '..' + r.x1.toFixed(2) +
        '  z ' + r.z0.toFixed(2) + '..' + r.z1.toFixed(2) + (fit ? '  outside ' + out + '/' + n : ''));
    });
    p.doors.forEach(function (dr) { console.log('   door ' + dr.id + ' ' + dr.a + '>' + dr.b + ' ' + dr.axis + ' wall ' + (dr.wall || []).map(function (q) { return q.toFixed(2); }).join('/') + ' at ' + (dr.axis === 'z' ? 'x ' + (dr.xc || 0).toFixed(2) : 'z ' + (+dr.zc).toFixed(2)) + (dr.arch ? ' arch' : '')); });
  });
});
