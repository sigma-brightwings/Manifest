// Merge one size's cuts (as the editor's table box prints them) into
// tools/ship-cuts.json, keeping notes and the other sizes.
//   node "Claude outputs/merge-cuts.cjs" s "Claude outputs/cuts-s.json"
var fs = require('fs'), path = require('path');
var size = process.argv[2], src = process.argv[3];
var file = path.join(__dirname, '..', 'tools', 'ship-cuts.json');
var t = JSON.parse(fs.readFileSync(file, 'utf8'));
var add = JSON.parse(fs.readFileSync(src, 'utf8'));
Object.keys(add).forEach(function (k) { t[k] = t[k] || {}; t[k][size] = add[k]; });
function arr(a) { return '[' + a.join(', ') + ']'; }
function row(r) { return '{ "z": ' + arr(r.z) + ', "y": ' + arr(r.y) + ', "x": ' + arr(r.x) + ' }'; }
var fams = Object.keys(t).filter(function (k) { return k[0] !== '_'; }).sort();
var out = '{\n "_about": ' + JSON.stringify(t._about) + ',\n' + fams.map(function (k) {
  var e = t[k], lines = [];
  if (e.note) lines.push('  "note": ' + JSON.stringify(e.note));
  ['s', 'm', 'l'].forEach(function (z) { if (e[z]) lines.push('  "' + z + '": ' + row(e[z])); });
  return ' "' + k + '": {\n' + lines.join(',\n') + '\n }';
}).join(',\n') + '\n}\n';
JSON.parse(out);
fs.writeFileSync(file, out);
console.log(fams.length + ' families; with all of S, M and L: ' + fams.filter(function (k) { return t[k].s && t[k].m && t[k].l; }).length);
