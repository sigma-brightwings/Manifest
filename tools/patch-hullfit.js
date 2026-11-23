/* patch-hullfit.js — take only the named hulls' entries from a fresh
 * fit-hulls run into src/hullfit.js (2026-11-23).
 *
 *     node tools/patch-hullfit.js <regenerated hullfit.js> kestrel cutter ...
 *
 * Why not just run tools/fit-hulls.js: it refits every hull from scratch,
 * and a month of other changes since the table was made (cockpits, ramps)
 * would move hulls nobody asked to move. A hull whose interior changed is
 * refit on its own, here, and the diff says exactly which. */
var fs = require('fs'), path = require('path');
global.window = global;
var regenFile = path.resolve(process.argv[2]), ids = process.argv.slice(3);
require(regenFile);
var regen = JSON.parse(JSON.stringify(global.HullFit));
delete global.HullFit;
var file = path.join(__dirname, '..', 'src', 'hullfit.js');
require(file);
var old = global.HullFit;
var src = fs.readFileSync(file, 'utf8');
ids.forEach(function (id) {
  if (!regen[id] || !old[id]) { console.log(id + ': not in both tables'); return; }
  console.log(id + '  ' + JSON.stringify(old[id]) + '\n  -> ' + JSON.stringify(regen[id]));
  var i = src.indexOf('"' + id + '": {');
  var j = src.indexOf('}', i) + 1;
  var block = JSON.stringify(regen[id], null, 1).split('\n').map(function (l, k) { return k ? '   ' + l : l; }).join('\n');
  src = src.slice(0, i) + '"' + id + '": ' + block + src.slice(j);
});
fs.writeFileSync(file, src);
