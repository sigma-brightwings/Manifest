/* guns.test.js - the weapons hung on a ship's hull, and the item models
 * behind them and behind the yard card's portrait (2026-11-09).
 *
 *     node test/guns.test.js
 *
 * Astra: the hardpoints "can be removed on all ships and replaced with
 * hardpoint acceptor slots, which will each accept one of the new weapon
 * models and display it on the exterior of the ship", and the new models
 * "should be displayed as they are in the description when selecting them
 * in the outfitters". Pinned:
 *  - every gun on sale has a model with a foot and at least one muzzle,
 *    and every other item on sale has a model too;
 *  - every hull model whose art had guns has a mount per muzzle, and the
 *    hull mesh no longer carries those guns;
 *  - a ship wears exactly what it has fitted: a gun's own geometry on its
 *    hardpoint, an acceptor plate on an empty one, and the shots leave the
 *    gun on that hardpoint (Combat.muzzleOf), ahead of where it bolts on;
 *  - the same loadout is the same mesh object (gl.js caches on it).
 */
global.window = global.window || global;
['vec3', 'rng', 'kepler', 'economy', 'generate', 'sim'].forEach(function (m) { require('../src/' + m + '.js'); });
var Combat = require('../src/combat.js');
require('../src/hulls.js');
require('../src/itemmodels.js');
require('../src/render.js');
var R = global.Render, M = global.ItemModels, HL = global.HullLib;

var pass = 0, fail = 0;
function check(n, c, d) {
  if (c) { pass++; console.log('  ok   ' + n + (d ? '   ' + d : '')); }
  else { fail++; console.log('  FAIL  ' + n + (d ? '   ' + d : '')); }
}

console.log('--- the models ---');
var seen = {}, guns = [], missing = [];
Object.keys(Combat.EQUIPMENT).forEach(function (k) {
  var it = Combat.EQUIPMENT[k];
  if (!it || seen[it.id]) return;
  seen[it.id] = true;
  if (!R.itemKey(it.id)) missing.push(it.id);
  if (it.kind === 'gun') guns.push(it.id);
});
check('every item of equipment has a model', !missing.length, missing.join(', '));
var bad = guns.filter(function (id) { var m = M['eq_' + id]; return !m || !m.foot || !m.muzzles || !m.muzzles.length || !m.hull; });
check('every gun has a foot, a muzzle and a hull copy', !bad.length, bad.join(', ') + ' of ' + guns.length);
var behind = guns.filter(function (id) { var m = M['eq_' + id]; return m && m.foot && m.muzzles && m.muzzles.some(function (q) { return q[2] <= m.foot[2]; }); });
check('every muzzle is ahead of its foot (+z is forward)', !behind.length, behind.join(', '));
var under = guns.filter(function (id) { var m = M['eq_' + id]; return m && m.foot && !(m.foot[1] < 0); });
check('every foot is on the underside of its gun', !under.length, under.join(', '));
Object.keys(Combat.MISSILES || {}).forEach(function (k) {
  check('consumable ' + k + ' has a model', !!R.itemKey(k) || !!R.itemKey('con_' + k));
});

console.log('--- the mounts ---');
var armed = Object.keys(HL).filter(function (k) { return HL[k].muzzles && !/^crawler/.test(k); });
var mismatch = armed.filter(function (k) { return !HL[k].mounts || HL[k].mounts.length !== HL[k].muzzles.length; });
check('every armed hull has one mount per muzzle', !mismatch.length, mismatch.join(', ') + ' of ' + armed.length);
var upside = armed.filter(function (k) { return (HL[k].mounts || []).some(function (m) { return !(m.len > 0) || m.at[2] >= m.mz[2]; }); });
check('every mount has a length and sits behind its muzzle', !upside.length, upside.join(', '));

console.log('--- a ship wears what she has fitted ---');
function ship(hullId, fit) {
  var H = Combat.HULLS[hullId];
  return { hullId: hullId, fit: fit, dryMass: H.dryMass, cargo: {} };
}
var talon = ship('talon', { hardpoint0: 'phpulse' });
var hp = R.hardpointGuns(talon);
check('hardpointGuns reads the fit in slot order', hp.length === (Combat.HULLS.talon.slots.hardpoint) && hp[0] === 'phpulse' && hp[1] === null, JSON.stringify(hp));
var m1 = R.hullPreviewMesh('talon', talon);
var bare = R.libHullBare(m1.libId);
var gun = R.itemMesh('phpulse', true);
check('her mesh is the bare hull, the gun and one acceptor', m1.f.length === bare.f.length + gun.f.length + 24,
      m1.f.length + ' vs ' + bare.f.length + ' + ' + gun.f.length + ' + 24');
check('the same loadout is the same mesh object', R.hullPreviewMesh('talon', ship('talon', { hardpoint0: 'phpulse' })) === m1);
var m2 = R.hullPreviewMesh('talon', ship('talon', { hardpoint0: 'phpulse', hardpoint1: 'massdriver' }));
check('a second gun is drawn', m2 !== m1 && m2.f.length > m1.f.length);
var mz = R.shipMuzzlesFor(talon);
check('one muzzle list per hardpoint', mz && mz.length === hp.length);
var c0 = Combat.muzzleOf(talon, 'hardpoint0');
var foot0 = (bare.mounts || [])[0];
check('the shot leaves the fitted gun, ahead of its mount',
      foot0 && Math.abs(c0.f / R.SHIP_LEN - foot0.at[2]) > 0.01 && c0.f / R.SHIP_LEN > foot0.at[2],
      JSON.stringify(c0) + ' mount z ' + (foot0 && foot0.at[2]));
console.log('--- and inside her box ---');
/* Astra: "rescale weapons so that existing collision boxes still work".
 * Every gun, on every mount of every hull, three hardpoints more than she
 * has mounts so the wrapped ones are tried too: the armed hull never
 * leaves the box hullSpan reports, which berths, clearance and collisions
 * are sized by. */
var outside = [];
Object.keys(HL).forEach(function (id) {
  var b = R.libHullBare(id);
  if (!b || !b.span) return;
  var n = (b.mounts ? b.mounts.length : 2) + 3;
  guns.forEach(function (g) {
    var load = []; for (var i = 0; i < n; i++) load.push(g);
    var am = R.armedMesh(b, load);
    for (var v = b.v.length; v < am.v.length; v++) {
      for (var a = 0; a < 3; a++) {
        if (Math.abs(am.v[v][a]) > b.span[a] / 2 + 1e-6) { outside.push(id + ':' + g); return; }
      }
    }
  });
});
check('no gun on any hull reaches outside her box', !outside.length, outside.slice(0, 8).join(', ') + (outside.length > 8 ? ' ...' : ''));
var mzOut = Object.keys(HL).filter(function (id) {
  var b = R.libHullBare(id); if (!b || !b.span || !b.mounts) return false;
  var am = R.armedMesh(b, b.mounts.map(function () { return 'massdriver'; }));
  return am._muzzles.some(function (l) { return l && l.some(function (p) { return Math.abs(p[2]) > b.span[2] / 2 + 1e-6; }); });
});
check('and no muzzle either', !mzOut.length, mzOut.join(', '));

var lib = R.libHull(m1.libId);
check('NPCs of the model fly it with a stock gun on every mount', lib.f.length > bare.f.length && lib._muzzles.length === bare.mounts.length);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
