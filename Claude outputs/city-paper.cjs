// Top-down sheet: each city site model, six ports each, the city where citySpot puts it.
global.window = global;
var fs = require('fs'), path = require('path');
var ROOT = path.join(__dirname, '..');
['vec3', 'kepler', 'hulls', 'ports', 'port-sites'].forEach(function (m) { require(path.join(ROOT, 'src', m + '.js')); });
var R = require(path.join(ROOT, 'src', 'render.js'));
var models = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(PortSites);
var W = 420, H = 420, S = 168;   // px per port unit; view +-1.25
function proj(p) { return [W / 2 + p[0] * S, H / 2 - p[1] * S]; }
function shade(hex, z) {
  hex = String(hex || '#888').replace(/^[!~0-9]*/, '').replace(/^#?/, '#');
  if (!/^#[0-9a-f]{6}$/i.test(hex)) hex = '#8a909a';
  var k = Math.max(0.55, Math.min(1.25, 0.75 + z * 4));
  var c = [1, 3, 5].map(function (i) { return Math.min(255, Math.round(parseInt(hex.substr(i, 2), 16) * k)); });
  return 'rgb(' + c.join(',') + ')';
}
function tris(mesh, xf) {
  var out = [];
  mesh.f.forEach(function (t, i) {
    var p = [mesh.v[t[0]], mesh.v[t[1]], mesh.v[t[2]]].map(xf);
    var z = (p[0][2] + p[1][2] + p[2][2]) / 3;
    if (z < -0.03) return;                                  // underground: not seen from above
    out.push({ z: z, d: p.map(proj).map(function (q) { return q[0].toFixed(1) + ',' + q[1].toFixed(1); }).join(' '), c: shade(mesh.c && mesh.c[i], z) });
  });
  return out;
}
var html = '<!doctype html><meta charset=utf-8><title>City sites</title><style>body{background:#0b0e14;color:#cfd6e4;font:12px system-ui;margin:10px}h3{margin:10px 0 4px;font-size:14px}.r{display:flex;gap:6px;flex-wrap:wrap}.p{background:#10151e;border:1px solid #232b3a}.p div{padding:2px 4px}</style>';
html += '<p>Top-down. Grey: the port. Red outline: pad / runway / doors kept clear. Yellow ring: the branch point. Dotted: where the art had the city. Dashed circle: CITY_REACH.</p>';
models.forEach(function (id) {
  var lib = R.libPort(id), site = PortSites[id];
  var base = tris(lib.shell, function (p) { return p; }).sort(function (a, b) { return a.z - b.z; });
  var baseSvg = base.map(function (t) { return '<polygon points="' + t.d + '" fill="' + t.c + '"/>'; }).join('');
  var landSvg = site.land.map(function (r) { var a = proj([r[0], r[3]]), b = proj([r[2], r[1]]); return '<rect x="' + a[0].toFixed(1) + '" y="' + a[1].toFixed(1) + '" width="' + (b[0] - a[0]).toFixed(1) + '" height="' + (b[1] - a[1]).toFixed(1) + '" fill="none" stroke="#ff4d4d" stroke-width="1"/>'; }).join('');
  var c = site.city, homeA = proj([c[0], c[4]]), homeB = proj([c[3], c[1]]);
  var homeSvg = '<rect x="' + homeA[0].toFixed(1) + '" y="' + homeA[1].toFixed(1) + '" width="' + (homeB[0] - homeA[0]).toFixed(1) + '" height="' + (homeB[1] - homeA[1]).toFixed(1) + '" fill="none" stroke="#9aa" stroke-dasharray="2,3"/>';
  html += '<h3>' + id + '</h3><div class=r>';
  for (var k = 0; k < 6; k++) {
    var port = { id: 'sheet' + k, surface: true, dressing: { citySeed: (k * 0.161 + 0.07) % 1 } };
    var sp = R.citySpot(id, port);
    /* exactly what drawPortCity draws: each mesh through its own chain */
    var city = [];
    R.cityDrawList(id, port).forEach(function (it) {
      city = city.concat(tris(it.mesh, function (p) { return R.cityPlace(it.chain, p); }));
    });
    city.sort(function (a, b) { return a.z - b.z; });
    var outline = '';
    if (sp.layout) {
      /* the branch point, ringed */
      var B = proj(R.cityPlace([sp], [sp.layout.branch[0], sp.layout.branch[1], 0]));
      outline = '<circle cx="' + B[0].toFixed(1) + '" cy="' + B[1].toFixed(1) + '" r="5" fill="none" stroke="#ffd23f" stroke-width="1.5"/>';
    }
    var circ = '<circle cx="' + W / 2 + '" cy="' + H / 2 + '" r="' + (R.CITY_REACH * S).toFixed(1) + '" fill="none" stroke="#445" stroke-dasharray="4,4"/>';
    html += '<div class=p><svg width=' + W + ' height=' + H + '>' + circ + baseSvg + landSvg + homeSvg +
      city.map(function (t) { return '<polygon points="' + t.d + '" fill="' + t.c + '"/>'; }).join('') + outline +
      '</svg><div>port ' + k + ': ' + Math.round(sp.rot * 180 / Math.PI) + '&deg;, at ' + sp.x.toFixed(2) + ', ' + sp.y.toFixed(2) + '</div></div>';
  }
  html += '</div>';
});
fs.writeFileSync(path.join(__dirname, 'city-sites.html'), html);
console.log('ok', models.join(' '));
