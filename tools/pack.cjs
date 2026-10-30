/* pack.cjs — the models and the station geometry are stored gzipped.
 *
 *     node tools/pack.cjs            pack:   gzip every changed working file
 *     node tools/pack.cjs unpack     unpack: write out any working file that is missing
 *     node tools/pack.cjs unpack --force   ...and overwrite ones that differ
 *     node tools/pack.cjs check      exit 1 if a working file differs from its .gz
 *
 * Astra, 2026-10-30: "can you compress the data somehow?" — "and ensure the
 * executable can unpack the compressed data". The .glb source art and the
 * generated station geometry (src/ports/*.js) are mostly runs of floats
 * that gzip by 8 to 20 times, losslessly. Stored as LFS they cost ~685 MB
 * of quota and every Pages deploy downloaded 270 MB of it; stored as .gz
 * in plain git they are ~60 MB and need no LFS at all.
 *
 * THE .gz IS THE TRACKED COPY. The plain file beside it is a working copy,
 * ignored by git, there so Blender and the tools can open it as before.
 * Edit or regenerate the plain file, then run `npm run pack`; `npm test`
 * fails while any working copy differs from what is stored, because a
 * change that never reaches its .gz is a change that is not in the repo.
 *
 * The game never needs the plain files: the .exe (electron/packed.js), the
 * dev server and the node loader in src/ports.js all read the .gz
 * directly, and the Pages deploy unpacks them on the runner.
 *
 * Deterministic: Node writes a zero mtime into the gzip header, and a .gz
 * is only rewritten when what it holds actually differs, so re-packing an
 * unchanged tree changes nothing and a newer zlib never churns history.
 */
'use strict';
var fs = require('fs'), path = require('path'), zlib = require('zlib');

var ROOT = path.resolve(__dirname, '..');
/* What is stored packed. [folder, recursive, test for the plain file]. */
var SETS = [
  ['ref', true, function (f) { return /\.glb$/i.test(f); }],
  ['new models', true, function (f) { return /\.glb$/i.test(f); }],
  ['src/ports', false, function (f) { return /\.js$/i.test(f); }]
];

function walk(dir, recursive, out) {
  var abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return out;
  fs.readdirSync(abs, { withFileTypes: true }).forEach(function (e) {
    var rel = dir + '/' + e.name;
    if (e.isDirectory()) { if (recursive) walk(rel, recursive, out); }
    else out.push(rel);
  });
  return out;
}

/* Every [plain, gz] pair, whether either side exists yet. */
function pairs() {
  var seen = {}, list = [];
  SETS.forEach(function (s) {
    walk(s[0], s[1], []).forEach(function (rel) {
      var plain = /\.gz$/i.test(rel) ? rel.slice(0, -3) : rel;
      if (!s[2](plain) || seen[plain]) return;
      seen[plain] = true;
      list.push({ plain: plain, gz: plain + '.gz' });
    });
  });
  return list.sort(function (a, b) { return a.plain < b.plain ? -1 : 1; });
}

function readGz(rel) { return zlib.gunzipSync(fs.readFileSync(path.join(ROOT, rel))); }
function has(rel) { return fs.existsSync(path.join(ROOT, rel)); }

/* WHAT WAS LAST IN SYNC. A fingerprint of every working copy as it was the
 * last time pack or unpack made it match its .gz, in .pack-state.json (not
 * tracked). It is how a working copy that is merely OLD (the repo moved on:
 * a merge, a pull, a checkout) is told from one somebody EDITED. An old one
 * is refreshed by unpack and called stale by check; an edited one is never
 * overwritten without --force, and check says to pack it. */
var STATE = path.join(ROOT, '.pack-state.json');
function loadState() { try { return JSON.parse(fs.readFileSync(STATE, 'utf8')); } catch (e) { return {}; } }
function saveState(st) { fs.writeFileSync(STATE, JSON.stringify(st)); }
function sum(buf) { return require('crypto').createHash('sha1').update(buf).digest('hex'); }

function pack(verbose) {
  var wrote = 0, same = 0, st = loadState();
  pairs().forEach(function (p) {
    if (!has(p.plain)) return;
    var raw = fs.readFileSync(path.join(ROOT, p.plain));
    st[p.plain] = sum(raw);
    if (has(p.gz) && readGz(p.gz).equals(raw)) { same++; return; }
    fs.writeFileSync(path.join(ROOT, p.gz), zlib.gzipSync(raw, { level: 9 }));
    wrote++;
    if (verbose) console.log('packed   ' + p.gz);
  });
  saveState(st);
  console.log('pack: ' + wrote + ' written, ' + same + ' already current');
}

function unpack(force) {
  var wrote = 0, kept = 0, st = loadState();
  pairs().forEach(function (p) {
    if (!has(p.gz)) return;
    var data = readGz(p.gz);
    if (has(p.plain)) {
      var raw = fs.readFileSync(path.join(ROOT, p.plain));
      if (raw.equals(data)) { st[p.plain] = sum(data); return; }
      var edited = st[p.plain] !== sum(raw);
      if (edited && !force) {
        kept++;
        console.log('kept     ' + p.plain + '  (edited since it was last unpacked: `npm run pack` stores it, `unpack --force` throws it away)');
        return;
      }
    }
    fs.writeFileSync(path.join(ROOT, p.plain), data);
    st[p.plain] = sum(data);
    wrote++;
  });
  saveState(st);
  console.log('unpack: ' + wrote + ' written' + (kept ? ', ' + kept + ' edited copies left alone' : ''));
}

/* [{plain, why, kind}] for every working copy that is not what the repo
 * holds. kind 'edited' means pack it; kind 'stale' means unpack. */
function stale() {
  var bad = [], st = loadState();
  pairs().forEach(function (p) {
    if (!has(p.plain)) return;
    if (!has(p.gz)) { bad.push({ plain: p.plain, why: 'has no .gz', kind: 'edited' }); return; }
    var held;
    try { held = readGz(p.gz); } catch (e) { bad.push({ plain: p.plain, why: 'its .gz is unreadable', kind: 'edited' }); return; }
    var raw = fs.readFileSync(path.join(ROOT, p.plain));
    if (held.equals(raw)) return;
    if (st[p.plain] && st[p.plain] === sum(raw)) bad.push({ plain: p.plain, why: 'is older than its .gz (run `npm run unpack`)', kind: 'stale' });
    else bad.push({ plain: p.plain, why: 'was edited and is not stored (run `npm run pack`)', kind: 'edited' });
  });
  return bad;
}

module.exports = { pairs: pairs, stale: stale, SETS: SETS };

if (require.main === module) {
  var mode = process.argv[2] || 'pack';
  if (mode === 'pack') pack(process.argv.indexOf('-v') > 0);
  else if (mode === 'unpack') unpack(process.argv.indexOf('--force') > 0);
  else if (mode === 'check') {
    var bad = stale();
    bad.slice(0, 20).forEach(function (b) { console.log('  ' + b.plain + ' ' + b.why); });
    if (bad.length) { console.log('pack check: ' + bad.length + ' working file(s) do not match what is stored.'); process.exit(1); }
    console.log('pack check: every working copy matches what is stored');
  } else { console.log('usage: node tools/pack.cjs [pack|unpack [--force]|check]'); process.exit(2); }
}
