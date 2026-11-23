/* hull-envelope.js — the inside of each large hull, slice by slice (2026-11-23).
 * For the multi-deck layouts (claude/naval-decks.md): where along her there
 * is room, how high it runs, and how wide, in the deck plan's metres
 * (cockpit frame: x starboard, y up, z forward; the seated eye at 0).
 *
 *     node tools/hull-envelope.js [hullId] [--json]
 *
 * Per 2 m slice of z: the run of y at x = 0 that is inside her (lowest to
 * highest), and her half-width at the middle of that run. */
global.window = global.window || global;
['vec3', 'rng', 'kepler', 'economy', 'generate', 'sim'].forEach(function (m) { require('../src/' + m + '.js'); });
var Combat = require('../src/combat.js');
require('../src/crew.js'); require('../src/hulls.js'); require('../src/walk.js'); require('../src/shipdeck.js');
require('../src/render.js');
var R = global.Render, H = Combat.HULLS;
var args = process.argv.slice(2), json = args.indexOf('--json') >= 0;
var only = args.filter(function (a) { return a[0] !== '-'; })[0];
var BIG = { kestrel: 1, cutter: 1, longhaul: 1, tanker: 1, meridian: 1, leviathan: 1, crawler: 1, capital: 1, carrier: 1 };
var res = {};
Object.keys(H).forEach(function (id) {
  if (only ? id !== only : !BIG[id]) return;
  var ship = { hullId: id, bornId: 'env|' + id, dryMass: H[id].dryMass, cargo: {}, pos: { x: 0, y: 0, z: 0 },
               fwd: { x: 0, y: 0, z: 1 }, up: { x: 0, y: 1, z: 0 }, right: { x: -1, y: 0, z: 0 } };
  var fit = R.hullFitter(ship);
  if (!fit) { res[id] = null; return; }
  var Lm = R.hullLength(ship) * 1000, at = R.cockpitAt ? (R.cockpitAt(ship) || [0, 0, 0]) : [0, 0, 0];
  var span = Lm * 0.55, slices = [];
  var dz = Lm > 150 ? 4 : 2, dy = Lm > 150 ? 1 : 0.5;
  for (var z = -at[2] - span; z <= -at[2] + span; z += dz) {
    var lo = null, hi = null;
    for (var y = -at[1] - span * 0.6; y <= -at[1] + span * 0.6; y += dy) {
      if (fit.inside(-at[0], y, z)) { if (lo === null) lo = y; hi = y; }
    }
    if (lo === null) continue;
    var ym = (lo + hi) / 2, hw = 0;
    for (var x = 0; x <= span; x += dy) {
      if (fit.inside(-at[0] + x, ym, z) && fit.inside(-at[0] - x, ym, z)) hw = x; else if (x > hw + 2 * dy) break;
    }
    slices.push({ z: +z.toFixed(1), y0: +lo.toFixed(1), y1: +hi.toFixed(1), hw: +hw.toFixed(1) });
  }
  res[id] = { len: Lm, at: at, centreX: -at[0], slices: slices };
});
if (json) { console.log(JSON.stringify(res)); return; }
Object.keys(res).forEach(function (id) {
  var r = res[id];
  if (!r) { console.log(id + ': no fitter'); return; }
  var s = r.slices;
  console.log(id + '  len ' + r.len + ' m  centreline x ' + r.centreX.toFixed(1) + '  z ' + s[0].z + '..' + s[s.length - 1].z);
  var step = Math.max(1, Math.floor(s.length / 14));
  for (var i = 0; i < s.length; i += step) console.log('   z ' + s[i].z + '  y ' + s[i].y0 + '..' + s[i].y1 + '  hw ' + s[i].hw);
});
