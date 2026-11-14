/* audit-saves.cjs - does every piece of career state survive a reload?
 *
 *     node tools/audit-saves.cjs
 *
 * THE FAULT THIS HUNTS. A new system writes a field onto G, the save
 * writes it out, and nobody adds the line that reads it back - or the
 * reverse. Either way the suite stays green, because a unit test builds
 * its own G and never goes near save.js, and the player loses something
 * quietly on a reload rather than loudly at the time.
 *
 * So: every `G.<name> =` written anywhere in src/, against what save.js
 * stores and what it restores. Reported in three buckets, because they
 * mean different things:
 *
 *   WRITTEN, NEVER SAVED   - lost on reload. A bug unless the field is
 *                            derived, per-frame, or deliberately transient.
 *   SAVED, NEVER RESTORED  - written to the slot and dropped on load,
 *                            which is the worse half: it looks saved.
 *   RESTORED, NEVER SAVED  - reads a key the writer never writes.
 *
 * Judgement is still a human's: plenty of G fields are scratch. The tool's
 * job is to put the list in front of somebody, not to decide.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');

function read(f) { return fs.readFileSync(path.join(SRC, f), 'utf8'); }

const files = fs.readdirSync(SRC).filter(f => /\.js$/.test(f));

/* Every `G.foo =` or `G.foo ||=`-ish assignment across the source. */
const written = {};
files.forEach(function (f) {
  if (f === 'save.js') return;
  const s = read(f);
  const re = /\bG\.([a-zA-Z_][a-zA-Z0-9_]*)\s*(?:=[^=]|\|\|=)/g;
  let m;
  while ((m = re.exec(s))) {
    (written[m[1]] || (written[m[1]] = new Set())).add(f);
  }
});

const save = read('save.js');

/* The payload literal: `foo: G.foo || {}` and friends. Taken as "stored". */
const stored = new Set();
let m;
const storeRe = /^\s{4,8}([a-zA-Z_][a-zA-Z0-9_]*):\s/gm;
while ((m = storeRe.exec(save))) stored.add(m[1]);

/* What load() puts back: `G.foo = ...` inside save.js. */
const restored = new Set();
const restRe = /\bG\.([a-zA-Z_][a-zA-Z0-9_]*)\s*=/g;
while ((m = restRe.exec(save))) restored.add(m[1]);

/* Fields the game rebuilds every frame or derives - not career state.
 * Listed by hand because the distinction is a judgement, and a list that
 * is written down can be argued with. */
const TRANSIENT = new Set([
  'sys', 'here', 'galaxy', 'now', 'dt', 't0', 'frame', 'fps', 'lastFrame',
  'panel', 'viewMode', 'menu', 'title', 'showHelp', 'showCatalogue',
  'catalogue', 'scanUI', 'focus', 'lock', 'hover', 'mouse', 'keys',
  'toast', 'say', 'msg', 'msgs', 'log', 'err', 'error', 'paused',
  'cam', 'camera', 'view', 'chart', 'chartMemory', 'tutorial', 'help',
  'sweep', 'navTarget', 'route', 'plan', 'trail', 'predict', 'rendering',
  'gl', 'ctx', 'canvas', 'dom', 'audio', 'sound', 'input', 'ui',
  'enterSystem', 'hooks', 'deps', 'seedText', 'speed', 'warp', 'target'
]);

function report(title, list, note) {
  console.log('\n--- ' + title + ' (' + list.length + ') ---');
  if (note) console.log('    ' + note);
  if (!list.length) { console.log('    none'); return; }
  list.sort();
  list.forEach(function (k) {
    const where = written[k] ? Array.from(written[k]).sort().join(', ') : '-';
    console.log('  ' + k.padEnd(22) + where);
  });
}

const names = Object.keys(written).filter(k => !TRANSIENT.has(k));

const neverSaved = names.filter(k => !stored.has(k) && !restored.has(k));
const savedNotRestored = names.filter(k => stored.has(k) && !restored.has(k));
const restoredNotSaved = Array.from(restored).filter(function (k) {
  return !TRANSIENT.has(k) && !stored.has(k) && written[k];
});

console.log('audit-saves: ' + files.length + ' source files, ' +
            names.length + ' career-looking fields on G');
console.log('             ' + stored.size + ' keys in the payload, ' +
            restored.size + ' restored by load()');

report('WRITTEN, NEVER SAVED', neverSaved,
       'lost on reload unless derived or deliberately transient');
report('SAVED, NEVER RESTORED', savedNotRestored,
       'written to the slot and dropped on load - looks saved, is not');
report('RESTORED, NEVER SAVED', restoredNotSaved,
       'load() sets these from a key the payload never writes');
