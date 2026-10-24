// How often do the domes scatter with a network, per model, over many ports?
global.window = global;
var path = require('path'), ROOT = path.join(__dirname, '..');
['vec3', 'kepler', 'hulls', 'ports', 'port-sites'].forEach(function (m) { require(path.join(ROOT, 'src', m + '.js')); });
var R = require(path.join(ROOT, 'src', 'render.js'));
Object.keys(PortSites).forEach(function (id) {
  var parts = R.cityParts(id);
  var n = 400, net = 0, whole = 0, home = 0, sheds = {}, faces = {}, spread = 0;
  for (var i = 0; i < n; i++) {
    var sp = R.citySpot(id, { id: 'q' + i, surface: true, dressing: { citySeed: (i + 0.5) / n } });
    if (sp.home) home++; else if (sp.layout) net++; else whole++;
    if (sp.layout) {
      var f = sp.layout.face; sheds[f.s] = (sheds[f.s] || 0) + 1; faces[f.n.join(',')] = (faces[f.n.join(',')] || 0) + 1;
      var B = sp.layout.branch; spread += sp.layout.domes.reduce(function (a, d) { return Math.max(a, Math.hypot(d.c[0] - B[0], d.c[1] - B[1])); }, 0);
    }
  }
  console.log(id.padEnd(20), 'parts', parts ? 'ok (core ' + parts.core.f.length + ', domes ' + Object.keys(parts.domes).map(function (k) { return k + ':' + parts.domes[k].f.length; }).join(' ') + ', colours ' + JSON.stringify(parts.colour) + ')' : 'NONE');
  console.log(''.padEnd(20), 'network', net, ' whole', whole, ' home', home, ' sheds', JSON.stringify(sheds), ' walls', JSON.stringify(faces), ' furthest dome from branch (mean)', (spread / Math.max(1, net)).toFixed(3));
});
