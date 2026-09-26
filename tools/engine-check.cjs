// engine-check.cjs - compare a fresh hulls conversion with src/hulls.js and list engines.
//   node tools/engine-check.cjs <fresh-hulls.js>
var fs = require('fs'), path = require('path');
function load(f) { var g = {}; new Function('window', 'self', 'global', fs.readFileSync(f, 'utf8'))(g, g, g); return g.HullLib; }
var cur = load(path.join(__dirname, '..', 'src', 'hulls.js'));
var fresh = load(process.argv[2]);
var diff = 0;
Object.keys(fresh).forEach(function (k) {
  var a = cur[k], b = Object.assign({}, fresh[k]); var e = b.engines; delete b.engines;
  var same = a && JSON.stringify(a) === JSON.stringify(b);
  if (!same) diff++;
  console.log(k.padEnd(20), (same ? 'same' : 'DIFF').padEnd(5), e ? e.length : 0,
    e ? e.map(function (q) { return q.join(','); }).join(' | ') : '');
});
Object.keys(cur).forEach(function (k) { if (!fresh[k]) { console.log('MISSING', k); diff++; } });
console.log('models differing apart from engines:', diff);
