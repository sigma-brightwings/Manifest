/* hull-seal.test.js — the ship art's skin is closed (2026-11-03).
 *
 *     node test/hull-seal.test.js
 *
 * Astra: "can you not fix the models?" tools/glb-patch.js mended the
 * Cutter's and the Crawler's art in ref/glb. She may re-export from her own
 * tools one day, which would undo it; this is what notices. Every model in
 * src/hulls.js, as glb2hulls emitted it, through tools/hull-seal.js (the
 * same code glb2hulls warns with): a vertical ray through every column at
 * 1/400 of her length must cross her skin an even number of times.
 *
 * Every model, no exceptions: the three NPC-only models first left open
 * (navy-l, navy-s with the Cutter's blisters, police-s with an open
 * beacon) were closed by the same tool the same day.
 *
 * Also here: the patch tool's own promises - every patched file reports
 * closed (`--check`), and the art and the library agree (hulls.js is
 * what glb2hulls makes of ref/glb today).
 */
'use strict';
var path = require('path'), fs = require('fs'), cp = require('child_process');
var Seal = require('../tools/hull-seal.js');
var lib = require('../src/hulls.js');

var pass = 0, fail = 0;
function check(n, c, d) {
  if (c) { pass++; console.log('  ok   ' + n + (d ? '   ' + d : '')); }
  else { fail++; console.log('  FAIL  ' + n + (d ? '   ' + d : '')); }
}

/* Was { navy-l: 158, navy-s: 427, police-s: 199 } before they were mended:
 * kept as the place a known exception would go, empty on purpose. */
var KNOWN = {};

console.log('--- every model\'s skin is closed to a vertical ray ---');
var bad = [], known = [], open = [], nCols = 0, t0 = Date.now();
Object.keys(lib).forEach(function (id) {
  var m = lib[id], r = Seal.oddColumns(m, 1 / 400);
  nCols += r.columns;
  open.push(id + ' ' + Seal.openEdges(m));
  var want = KNOWN[id] || 0;
  if (r.odd.length !== want) bad.push(id + ' ' + r.odd.length + (want ? ' (pinned at ' + want + ')' : ''));
  else if (want) known.push(id + ' ' + want);
});
check('every model in hulls.js is crossed an even number of times in every column',
      !bad.length, bad.length ? bad.join(', ') : Object.keys(lib).length + ' models, ' + nCols + ' columns (' + ((Date.now() - t0) / 1000).toFixed(1) + ' s)');
check('no model is excused', !Object.keys(KNOWN).length && !known.length);
console.log('  note  open edges per model (informational, an engine bell\'s mouth is one): ' + open.join(', '));

console.log('--- the founded station still finds her belly doors ---');
/* glb-patch raised her closed belly doors one import cell (so her lift's
 * pit is standable) and render.js CR_DOOR moved the same cell. A founded
 * station's door leaves are cut out of her by that box: each leaf must
 * still be there, and every face of it must lie in the raised doors' band
 * - before the raise, one face of each skirt rail's inner side fell in the
 * box and slid away with the doors. */
global.window = global.window || global;
['vec3', 'rng', 'kepler', 'economy', 'generate', 'sim'].forEach(function (m) { require('../src/' + m + '.js'); });
require('../src/combat.js'); require('../src/crew.js'); require('../src/walk.js'); require('../src/shipdeck.js'); require('../src/render.js');
var Rn = global.Render, leafErr = [], leafN = [];
['civ', 'navy', 'syn'].forEach(function (liv) {
  var role = 'crawler:' + liv + ':';
  Rn.libPort(role);
  var pd = Rn.portDoors(role);
  if (!pd || !pd.leaves || pd.leaves.length !== 2) { leafErr.push(liv + ' no leaves'); return; }
  pd.leaves.forEach(function (lf, k) {
    var m = lf.mesh, lo = Infinity, hi = -Infinity;
    m.v.forEach(function (p) { lo = Math.min(lo, p[2]); hi = Math.max(hi, p[2]); });
    /* Station z is her -y: her door band, raised, is y -96.4..-93.9 of 478
     * plus the import's centre; thicker than 2.6 m of 478 is not a door. */
    if (!m.f.length) leafErr.push(liv + ' leaf ' + k + ' empty');
    else if ((hi - lo) * 478 > 2.6 + 0.5) leafErr.push(liv + ' leaf ' + k + ' spans ' + ((hi - lo) * 478).toFixed(1) + ' m: not only the door');
    leafN.push(liv + ' ' + m.f.length);
  });
});
check('a founded Crawler station still cuts both belly door leaves out of her, and nothing else', !leafErr.length, leafErr.length ? leafErr.join(', ') : leafN.join(', '));

console.log('--- the patch tool ---');
var root = path.join(__dirname, '..');
var haveArt = ['navy-l', 'navy-m', 'navy-s', 'police-s', 'crawler_civilian', 'crawler_navy', 'crawler_syndicate'].every(function (id) {
  return fs.existsSync(path.join(root, 'ref', 'glb', id + '.glb'));
});
if (!haveArt) {
  console.log('  note  ref/glb is not unpacked (node tools/pack.cjs unpack): the art checks are skipped');
} else {
  var r = cp.spawnSync(process.execPath, [path.join(root, 'tools', 'glb-patch.js'), '--check'], { encoding: 'utf8' });
  check('every part glb-patch mends is closed in the art (glb-patch --check)', r.status === 0, (r.stdout || '').trim().split('\n').join('; '));
  /* The Crawler's walk-out door is in her art, in all three liveries. */
  var doors = ['crawler_civilian', 'crawler_navy', 'crawler_syndicate'].filter(function (id) {
    var b = fs.readFileSync(path.join(root, 'ref', 'glb', id + '.glb')), jl = b.readUInt32LE(12);
    var j = JSON.parse(b.toString('utf8', 20, 20 + jl));
    return j.nodes.some(function (n) { return n.name === 'berthWalkDoorFrame'; }) && j.nodes.some(function (n) { return n.name === 'berthWalkDoorLeaf'; });
  });
  check('each Crawler livery carries her walk-out door and its open leaf as named nodes', doors.length === 3, doors.join(', '));
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exitCode = 1;
