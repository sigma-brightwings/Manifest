/* interior-fit.js — how much of each hull's walkable interior is inside
 * her own skin (2026-10-31). Astra: "all ships should have interiors that
 * exist as part of the ship itself".
 *
 *     node tools/interior-fit.js [hullId]
 *
 * Each room is sampled on a grid (every 0.5 m along x and z, at floor and
 * ceiling height, a hand's width in from its walls) and each sample is
 * asked whether her hull is above and below it (Render.hullFitter, the
 * column test widestHold uses). The cockpit is left out: its canopy stands
 * proud of her skin by design. */
global.window = global.window || global;
['vec3', 'rng', 'kepler', 'economy', 'generate', 'sim'].forEach(function (m) { require('../src/' + m + '.js'); });
var Combat = require('../src/combat.js');
require('../src/crew.js'); require('../src/hulls.js'); require('../src/walk.js'); require('../src/shipdeck.js');
require('../src/render.js');
var R = global.Render, H = Combat.HULLS;
var only = process.argv[2];
var out = [];
Object.keys(H).forEach(function (id) {
  if (only && id !== only) return;
  var ship = { hullId: id, bornId: 'fit|' + id, dryMass: H[id].dryMass, cargo: {}, pos: { x: 0, y: 0, z: 0 },
               fwd: { x: 0, y: 0, z: 1 }, up: { x: 0, y: 1, z: 0 }, right: { x: -1, y: 0, z: 0 } };
  var d = R.shipInterior(ship); if (!d) return;
  var fit = R.hullFitter ? R.hullFitter(ship) : null;
  if (!fit) { out.push(id + ': no fitter'); return; }
  var plans = d.plan.decks ? Object.keys(d.plan.decks).map(function (k) { return d.plan.decks[k]; }) : [d.plan];
  var line = [], allIn = 0, all = 0;
  plans.forEach(function (p) {
    (p.rooms || []).forEach(function (r) {
      if (r.kind === 'cockpit' || r.kind === 'ramp') return;
      var n = 0, k = 0, h = (r.y1 || 2.2);
      var sx = Math.max(0.1, Math.min(0.5, r.x1 - r.x0 - 0.2));
      for (var x = r.x0 + 0.1; x <= r.x1 - 0.1 + 1e-9; x += sx) {
        for (var z = r.z0 + 0.1; z <= r.z1 - 0.1 + 1e-9; z += 0.5) {
          [p.floorY + 0.1, p.floorY + h - 0.1].forEach(function (y) { n++; if (fit.inside(x, y, z)) k++; });
        }
      }
      all += n; allIn += k;
      if (k < n) line.push(r.kind + ' ' + Math.round(100 * k / n) + '%');
    });
  });
  var f = d.plan.fitted;
  out.push(id + ' (' + H[id].mesh + '): ' + Math.round(100 * allIn / Math.max(1, all)) + '% inside' +
           (line.length ? '  out: ' + line.join(', ') : '') +
           (f && (f.omitted.length || Object.keys(f.narrowed).length) ? '  | fitted: dropped ' + (f.omitted.join(' ') || '-') +
            ', narrowed ' + (Object.keys(f.narrowed).map(function (k) { return k + ' ' + f.narrowed[k].toFixed(1); }).join(' ') || '-') : '') +
           (f && f.misfit && f.misfit.length ? '  | still out: ' + f.misfit.join(' ') : ''));
});
console.log(out.join('\n'));
