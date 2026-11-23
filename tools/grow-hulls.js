/* grow-hulls.js — grow named hulls just enough for their rooms, keeping
 * where her cockpit sits in her (2026-11-23).
 *
 *     node tools/grow-hulls.js longhaul kestrel      # patches src/hullfit.js
 *     DRY=1 node tools/grow-hulls.js longhaul        # says what it would do
 *
 * Why not tools/fit-hulls.js: that refits a hull from scratch, choosing the
 * eye's place in her anew, and on 2026-11-23 it moved the L hulls' eyes
 * metres off their glass (nosecockpit.test.js). Here the hull is only made
 * bigger, uniformly, about her eye: her cockpit stays at the same place in
 * her model (`at` and `ground` scale with her length), so the nose glass
 * stays where the seat expects it. Her deck's height over the ground (the
 * ramp's drop) grows with her, and the ramp with it.
 *
 * The yardstick is the game's own: her deck as the game plans it
 * (render.js shipInterior: fitted to her hull, raised cockpit and all),
 * every room but the cockpit sampled a hand's width in from its walls,
 * floor and ceiling, all inside her (boarding3.test.js "no room stands
 * outside her skin"), for every layout she can have (the reactor block's
 * A and B, shipdeck.js BLOCK_HULLS), and nothing left out by the fit. A
 * metre at a time, from her length now. */
global.window = global.window || global;
var path = require('path'), fs = require('fs');
var SRC = path.join(__dirname, '..', 'src');
['vec3', 'rng', 'kepler', 'economy', 'generate', 'sim'].forEach(function (m) { require(path.join(SRC, m + '.js')); });
var Combat = require(path.join(SRC, 'combat.js'));
require(path.join(SRC, 'crew.js'));
require(path.join(SRC, 'hulls.js'));
require(path.join(SRC, 'walk.js'));
var SD = require(path.join(SRC, 'shipdeck.js'));
require(path.join(SRC, 'hullfit.js'));
var OLD = JSON.parse(JSON.stringify(global.HullFit));
require(path.join(SRC, 'render.js'));
var R = global.Render;

function variants(id) { return SD.BLOCK_HULLS && SD.BLOCK_HULLS[id] ? ['A', 'B'] : [null]; }
var seq = 0;
/* Every room of hers outside her, for one layout. */
function outside(id, v) {
  var shp = { hullId: id, bornId: 'grow|' + id + '|' + (seq++), dryMass: Combat.HULLS[id].dryMass, cargo: {} };
  if (v) shp.blockVariant = v;
  var dd = R.shipInterior(shp), fitr = R.hullFitter(shp), bad = [];
  if (!dd || !fitr) return ['no plan'];
  (dd.plan.decks ? Object.keys(dd.plan.decks).map(function (k) { return dd.plan.decks[k]; }) : [dd.plan]).forEach(function (dp) {
    dp.rooms.forEach(function (rm) {
      if (rm.kind === 'cockpit') return;
      var n = 0, sx = Math.max(0.1, Math.min(0.5, rm.x1 - rm.x0 - 0.2));
      for (var x = rm.x0 + 0.1; x <= rm.x1 - 0.1 + 1e-9; x += sx)
        for (var z = rm.z0 + 0.1; z <= rm.z1 - 0.1 + 1e-9; z += 0.5)
          if (!fitr.inside(x, dp.floorY + 0.1, z) || !fitr.inside(x, dp.floorY + (rm.y1 || 2.2) - 0.1, z)) n++;
      if (n) bad.push((rm.sub || rm.kind) + ' ' + n);
    });
  });
  if (dd.plan.fitted && dd.plan.fitted.omitted.length) bad.push('left out: ' + dd.plan.fitted.omitted.join(' '));
  /* The small hulls' ramps (airlock.test.js, 2026-11-03): 6.5 m or more,
   * a ramp and not a stair, unless she lowers a lift. */
  var rp = dd.plan.ramp, size = Combat.HULLS[id].size;
  if (rp && rp.mode !== 'lift' && (size === 'M' || size === 'L') && !(rp.mode === 'ramp' && rp.len >= 6.5 - 1e-9))
    bad.push('ramp ' + rp.mode + ' ' + rp.len.toFixed(2));
  return bad;
}
function q4(drop) { return Math.ceil(drop * 4 - 1e-9) / 4; }
function scaled(old, L) {
  var k = L / old.len, out = {};
  for (var key in old) out[key] = old[key];
  out.len = L;
  out.at = old.at.map(function (u) { return +(u * k).toFixed(3); });
  out.ground = +(old.ground * k).toFixed(3);
  /* drop = eye height + the deck's floor under the eye - the ground; the
   * floor under the eye is her cockpit's, which does not scale. */
  var floorRel = old.drop - old.at[1] + old.ground;
  out.drop = +(out.at[1] + floorRel - out.ground).toFixed(3);
  out.dropRoom = q4(out.drop);
  return out;
}

var ids = process.argv.slice(2), file = path.join(SRC, 'hullfit.js'), text = fs.readFileSync(file, 'utf8');
ids.forEach(function (id) {
  var old = OLD[id], found = null;
  for (var L = old.len; L <= old.len * 1.6 && !found; L += 1) {
    global.HullFit[id] = scaled(old, L);
    var all = [];
    variants(id).forEach(function (v) { outside(id, v).forEach(function (b) { all.push((v || '') + ' ' + b); }); });
    console.log('  ' + id + ' at ' + L + ' m: ' + (all.length ? all.join(', ') : 'every room inside'));
    if (!all.length) found = global.HullFit[id];
  }
  global.HullFit[id] = old;
  if (!found) { console.log(id + ': nothing up to 1.6 times her length fits'); return; }
  console.log(id + '  ' + JSON.stringify(old) + '\n  -> ' + JSON.stringify(found));
  if (found.len === old.len) { console.log('  (fits as she is: unchanged)'); return; }
  var i = text.indexOf('"' + id + '": {'), j = text.indexOf('}', i) + 1;
  var block = JSON.stringify(found, null, 1).split('\n').map(function (l, k) { return k ? '   ' + l : l; }).join('\n');
  text = text.slice(0, i) + '"' + id + '": ' + block + text.slice(j);
});
if (process.env.DRY !== '1') { fs.writeFileSync(file, text); console.log('wrote src/hullfit.js'); }
