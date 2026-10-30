// Phase 1 groundwork: sort every top-level part of the 54 factory ships into
// module kinds by name, and list what does not sort.
//   node "Claude outputs/ship-parts-survey.cjs" [ref/glb]
var fs = require('fs'), path = require('path');
var dir = process.argv[2] || path.join(__dirname, '..', 'ref', 'glb');
var KINDS = [
  ['cockpit', /nose|canopy|cockpit|bridge|pilot|visor|windscreen|glass/i],
  ['engine', /engine|nacelle|exhaust|thruster|nozzle|propellant|reactor|drive|booster|rcs/i],
  ['wing', /wing|fin|stabili|aileron|winglet|strake|canard/i],
  ['weapon', /laser|turret|vls|gun|cannon|missile|torp|weapon|launcher|pd[A-Z0-9]|barrel/i],
  ['gear', /gear|strut|skid|leg|foot/i],
  ['hull', /hull|body|spine|keel|frame|deck|bay|hold|cargo|tank|module|section|panel|plate|rib|armou?r|truss|boom|pod|stripe|accent|brace|neck/i]
];
function parseGlb(buf) { var n = buf.readUInt32LE(12); return JSON.parse(buf.toString('utf8', 20, 20 + n)); }
var files = fs.readdirSync(dir).filter(function (f) { return /\.glb$/.test(f); }).sort();
var other = {}, rows = [];
files.forEach(function (f) {
  var j = parseGlb(fs.readFileSync(path.join(dir, f)));
  var root = j.nodes[(j.scenes[j.scene || 0].nodes || [0])[0]];
  var kids = (root.children || []).map(function (i) { return j.nodes[i]; });
  var count = { cockpit: 0, engine: 0, wing: 0, weapon: 0, gear: 0, hull: 0, other: 0 };
  kids.forEach(function (n) {
    var name = n.name || '';
    if (!name) {   // unnamed groups: classify by their children
      name = (n.children || []).map(function (c) { return j.nodes[c].name || ''; }).join(' ');
    }
    var k = KINDS.filter(function (p) { return p[1].test(name); })[0];
    if (k) count[k[0]]++;
    else { count.other++; var stem = name.replace(/\d+/g, '#').slice(0, 40); other[stem] = (other[stem] || 0) + 1; }
  });
  rows.push(f.replace('.glb', '') + '\t' + kids.length + '\t' + Object.keys(count).map(function (k) { return k + ':' + count[k]; }).join(' '));
});
console.log('ship\tparts\tkinds');
console.log(rows.join('\n'));
var o = Object.keys(other).sort(function (a, b) { return other[b] - other[a]; });
console.log('\nunsorted part names (' + o.length + ' distinct):');
console.log(o.slice(0, 60).map(function (k) { return '  ' + other[k] + '  ' + k; }).join('\n'));
