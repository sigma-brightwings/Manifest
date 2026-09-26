/* merge-ports.cjs — fold a partial `glb2hulls --ports` run into src/ports.js.
 *
 *     node tools/merge-ports.cjs <partial-out-dir>
 *
 * A full conversion at ROUTE_N=256 is the better part of an hour. When only
 * a few models changed, convert those into a scratch folder and merge: the
 * index entries replace the ones of the same id, and each model's geometry
 * file (<dir>/ports/<id>.js) is copied over src/ports/<id>.js. */
'use strict';
var fs = require('fs'), path = require('path');
var ROOT = path.join(__dirname, '..');
var dir = path.resolve(process.argv[2] || '');
var MARK = 'global.PortLib = ';

function readIndex(file) {
  var text = fs.readFileSync(file, 'utf8');
  var lines = text.split('\n');
  for (var i = 0; i < lines.length; i++) {
    var at = lines[i].indexOf(MARK);
    if (at < 0) continue;
    var body = lines[i].slice(at + MARK.length).replace(/;\s*$/, '');
    return { text: text, lines: lines, i: i, prefix: lines[i].slice(0, at + MARK.length), lib: JSON.parse(body) };
  }
  throw new Error('no PortLib line in ' + file);
}

var main = readIndex(path.join(ROOT, 'src', 'ports.js'));
var part = readIndex(path.join(dir, 'ports.js'));
var ids = Object.keys(part.lib);
ids.forEach(function (id) {
  main.lib[id] = part.lib[id];
  var g = path.join(dir, 'ports', id + '.js');
  if (fs.existsSync(g)) fs.copyFileSync(g, path.join(ROOT, 'src', 'ports', id + '.js'));
});
/* Keep the index in the converter's order: sorted ids. */
var sorted = {};
Object.keys(main.lib).sort().forEach(function (k) { sorted[k] = main.lib[k]; });
main.lines[main.i] = main.prefix + JSON.stringify(sorted) + ';';
fs.writeFileSync(path.join(ROOT, 'src', 'ports.js'), main.lines.join('\n'));
console.log('merged ' + ids.length + ' model(s): ' + ids.join(', '));
