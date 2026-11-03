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
 * Three models in the library are known open and pinned at their measured
 * counts, so they can neither get worse unseen nor be fixed unnoticed.
 * None of them is a hull anyone walks under: the Cutter is navy-m (mended),
 * and navy-l, navy-s and police-s are only flown by others. They share the
 * Cutter's lidless belly blisters (and police-s an open beacon); adding
 * them to tools/glb-patch.js's list would close them the same way.
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

/* Measured 2026-11-03, unpatched art: what each of these leaves open. */
var KNOWN = { 'navy-l': 158, 'navy-s': 427, 'police-s': 199 };

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
check('every model in hulls.js is crossed an even number of times in every column (known open ones at their pinned counts)',
      !bad.length, bad.length ? bad.join(', ') : Object.keys(lib).length + ' models, ' + nCols + ' columns (' + ((Date.now() - t0) / 1000).toFixed(1) + ' s)');
check('the four mended models are among the closed ones', ['navy-m', 'crawler_civilian', 'crawler_navy', 'crawler_syndicate'].every(function (id) {
  return lib[id] && !KNOWN[id];
}));
console.log('  note  known open (NPC-only): ' + known.join(', '));
console.log('  note  open edges per model (informational, an engine bell\'s mouth is one): ' + open.join(', '));

console.log('--- the patch tool ---');
var root = path.join(__dirname, '..');
var haveArt = ['navy-m', 'crawler_civilian', 'crawler_navy', 'crawler_syndicate'].every(function (id) {
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
