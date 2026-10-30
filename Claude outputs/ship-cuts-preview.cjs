// The factory-ship cut table and its preview.
//   node "Claude outputs/ship-cuts-preview.cjs" [--size m] [--seed]
// tools/ship-cuts.json holds one row per family: where the cockpit section
// ends and where the engine section begins, each as a fraction of the ship's
// length from the nose. --seed (or a missing table) fills first guesses from
// the part names; after that the table is Astra's to correct and is never
// overwritten. Writes _ship-cuts.html: every family's ship from above and
// from the side, real triangles, coloured by the piece each part lands in.
// Parts shorter than 40% of the ship go whole by their centre; longer ones
// (hull shells, keels) are cut at the planes, which is what the chopper does.
var fs = require('fs'), path = require('path');
var args = process.argv.slice(2);
var SIZE = args.indexOf('--size') >= 0 ? args[args.indexOf('--size') + 1] : 'm';
var ROOT = path.join(__dirname, '..');
var DIR = path.join(ROOT, 'ref', 'glb');
var TABLE = path.join(ROOT, 'tools', 'ship-cuts.json');
var KINDS = [
  ['cockpit', /nose|canopy|cockpit|bridge|pilot|visor|windscreen|glass|bow/i],
  ['engine', /engine|nacelle|exhaust|thruster|nozzle|propellant|reactor|drive|booster/i],
  ['wing', /wing|stabili|aileron|winglet|strake|canard|fin[LR]?$|fin[A-Z]/i]
];
function readGlb(file) {
  var buf = fs.readFileSync(file), n = buf.readUInt32LE(12);
  var j = JSON.parse(buf.toString('utf8', 20, 20 + n));
  var off = 20 + n; var binLen = buf.readUInt32LE(off);
  j._bin = buf.subarray(off + 8, off + 8 + binLen);
  return j;
}
function mat(n) {
  if (n.matrix) return n.matrix.slice();
  var t = n.translation || [0, 0, 0], r = n.rotation || [0, 0, 0, 1], s = n.scale || [1, 1, 1];
  var x = r[0], y = r[1], z = r[2], w = r[3];
  return [(1 - 2 * (y * y + z * z)) * s[0], 2 * (x * y + z * w) * s[0], 2 * (x * z - y * w) * s[0], 0,
          2 * (x * y - z * w) * s[1], (1 - 2 * (x * x + z * z)) * s[1], 2 * (y * z + x * w) * s[1], 0,
          2 * (x * z + y * w) * s[2], 2 * (y * z - x * w) * s[2], (1 - 2 * (x * x + y * y)) * s[2], 0,
          t[0], t[1], t[2], 1];
}
function mul(a, b) { var o = new Array(16); for (var c = 0; c < 4; c++) for (var r = 0; r < 4; r++) { var v = 0; for (var k = 0; k < 4; k++) v += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = v; } return o; }
function xf(m, x, y, z) { return [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]]; }
function accessor(j, i) {
  var a = j.accessors[i], bv = j.bufferViews[a.bufferView];
  var size = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type];
  var bytes = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 }[a.componentType];
  var stride = bv.byteStride || size * bytes, base = (bv.byteOffset || 0) + (a.byteOffset || 0), out = [];
  for (var k = 0; k < a.count; k++) for (var c = 0; c < size; c++) {
    var o = base + k * stride + c * bytes, b = j._bin;
    out.push(a.componentType === 5126 ? b.readFloatLE(o) : a.componentType === 5125 ? b.readUInt32LE(o)
           : a.componentType === 5123 ? b.readUInt16LE(o) : b.readUInt8(o));
  }
  return out;
}
function nameOf(j, n) { return n.name || (n.children || []).map(function (c) { return j.nodes[c].name || ''; }).join(' '); }

/* Every top-level part: its kind, and its triangles in model space. */
function load(file) {
  var j = readGlb(file), root = j.nodes[(j.scenes[j.scene || 0].nodes || [0])[0]];
  return (root.children || []).map(function (i) {
    var n = j.nodes[i], name = nameOf(j, n), k = KINDS.filter(function (p) { return p[1].test(name); })[0];
    var tris = [];
    (function walk(idx, M) {
      var nd = j.nodes[idx], m = mul(M, mat(nd));
      if (nd.mesh !== undefined) j.meshes[nd.mesh].primitives.forEach(function (p) {
        if (p.mode !== undefined && p.mode !== 4) return;
        var pos = accessor(j, p.attributes.POSITION), idxs = p.indices !== undefined ? accessor(j, p.indices) : null;
        var cnt = idxs ? idxs.length : pos.length / 3;
        for (var t = 0; t + 2 < cnt; t += 3) {
          var tri = [];
          for (var v = 0; v < 3; v++) { var q = idxs ? idxs[t + v] : t + v; tri.push(xf(m, pos[q * 3], pos[q * 3 + 1], pos[q * 3 + 2])); }
          tris.push(tri);
        }
      });
      (nd.children || []).forEach(function (c) { walk(c, m); });
    })(i, mat({}));
    return { name: name, kind: k ? k[0] : 'other', tris: tris };
  }).filter(function (p) { return p.tris.length; });
}
function extent(parts, ax) {
  var lo = Infinity, hi = -Infinity;
  parts.forEach(function (p) { p.tris.forEach(function (t) { t.forEach(function (v) { lo = Math.min(lo, v[ax]); hi = Math.max(hi, v[ax]); }); }); });
  return [lo, hi];
}
/* Fore is +z on every factory ship (measured: cockpit centroid ahead of the
 * engines on all 54). Fractions run from the nose: 0 at the tip, 1 at the tail. */
var AX = 2;
function frac(z, ext) { return (ext[1] - z) / (ext[1] - ext[0]); }
/* Keep the part of a polygon on one side of the plane z = z0: side 1 keeps
 * z >= z0, side -1 keeps z <= z0. Sutherland-Hodgman, one plane. */
function clip(poly, z0, side) {
  if (!isFinite(z0)) return poly;
  var out = [];
  for (var i = 0; i < poly.length; i++) {
    var a = poly[i], b = poly[(i + 1) % poly.length];
    var da = (a[AX] - z0) * side, db = (b[AX] - z0) * side;
    if (da >= 0) out.push(a);
    if ((da >= 0) !== (db >= 0)) {
      var u = da / (da - db);
      out.push([a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u]);
    }
  }
  return out;
}

function seed(parts, ext) {
  function cen(p) { var s = 0, n = 0; p.tris.forEach(function (t) { t.forEach(function (v) { s += v[AX]; n++; }); }); return s / n; }
  function len(p) { var e = extent([p], AX); return e[1] - e[0]; }
  var L = ext[1] - ext[0];
  function q(xs, f) { xs = xs.slice().sort(function (a, b) { return a - b; }); return xs.length ? xs[Math.round(f * (xs.length - 1))] : NaN; }
  var ck = parts.filter(function (p) { return p.kind === 'cockpit' && len(p) < 0.4 * L; }).map(function (p) { return frac(cen(p), ext); });
  var en = parts.filter(function (p) { return p.kind === 'engine' && len(p) < 0.4 * L; }).map(function (p) { return frac(cen(p), ext); });
  var a = q(ck, 0.9), b = q(en, 0.1);
  if (!(a > 0.05 && b < 0.97 && b - a > 0.12)) { a = 0.3; b = 0.7; }   // no clean gap: a plain third each way
  return { cockpitEnds: Math.round(a * 100) / 100, enginesStart: Math.round(b * 100) / 100, seeded: true };
}

var files = fs.readdirSync(DIR).filter(function (f) { return new RegExp('-' + SIZE + '\\.glb$').test(f); }).sort();
var table = fs.existsSync(TABLE) ? JSON.parse(fs.readFileSync(TABLE, 'utf8')) : {};
var seeding = args.indexOf('--seed') >= 0 || !fs.existsSync(TABLE);
var ships = files.map(function (f) {
  var fam = f.replace(/-[sml]\.glb$/, '');
  var parts = load(path.join(DIR, f)), ext = extent(parts, AX);
  if (seeding && !(table[fam] && table[fam].seeded === false)) table[fam] = seed(parts, ext);
  var row = table[fam] || { cockpitEnds: 0.3, enginesStart: 0.7 };
  var L = ext[1] - ext[0];
  function pieceAt(f) { return f <= row.cockpitEnds ? 0 : f >= row.enginesStart ? 2 : 1; }
  var tris = [];   // [piece, x0,y0,z0, x1,y1,z1, x2,y2,z2]
  parts.forEach(function (p) {
    var e = extent([p], AX), long = (e[1] - e[0]) >= 0.4 * L;
    var whole = p.kind === 'wing' ? 3 : long ? -1 : pieceAt(frac((e[0] + e[1]) / 2, ext));
    function emit(pc, t) { tris.push([pc].concat(t[0], t[1], t[2]).map(function (v, i) { return i ? Math.round(v * 1000) / 1000 : v; })); }
    p.tris.forEach(function (t) {
      if (whole >= 0) return emit(whole, t);
      /* A long part is SLICED at the cut planes, triangle by triangle:
       * each slab keeps the piece of the triangle that lies inside it. */
      var zc = ext[1] - row.cockpitEnds * L, ze = ext[1] - row.enginesStart * L;
      [[zc, Infinity, 0], [ze, zc, 1], [-Infinity, ze, 2]].forEach(function (slab) {
        var poly = clip(clip(t, slab[0], 1), slab[1], -1);
        for (var k = 1; k + 1 < poly.length; k++) emit(slab[2], [poly[0], poly[k], poly[k + 1]]);
      });
    });
  });
  return { fam: fam, file: f, ext: ext, row: row, tris: tris };
});
if (seeding) {
  var sorted = {}; Object.keys(table).sort().forEach(function (k) { sorted[k] = table[k]; });
  fs.writeFileSync(TABLE, JSON.stringify(sorted, null, 2) + '\n');
  console.log('seeded ' + TABLE);
}
ships.forEach(function (s) { console.log(s.fam + '\tcockpit ends ' + s.row.cockpitEnds + '\tengines start ' + s.row.enginesStart + '\t' + s.tris.length + ' tris'); });

var html = '<!doctype html><meta charset=utf-8><title>Factory ship cuts</title><style>body{background:#0b0f1a;color:#cfd9ee;font:13px monospace;margin:16px}' +
  '.g{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.c{background:#121828;padding:8px}.c b{color:#fff}canvas{display:block;width:100%}' +
  '.k span{padding:0 6px}</style><h3>Factory ships (' + SIZE.toUpperCase() + '), nose pointing &#8592; . Top: from above. Bottom: from the side.</h3>' +
  '<div class=k><span style="color:#4f9bff">&#9632; cockpit</span><span style="color:#b9c0cc">&#9632; mid</span><span style="color:#ff8a3d">&#9632; engine</span><span style="color:#49c27a">&#9632; wings</span>' +
  '<span>dashed lines = the cuts, labelled with their fraction of the length from the nose</span></div><div class=g id=g></div><script>var S=' + JSON.stringify(ships.map(function (s) { return { fam: s.fam, ext: s.ext, row: s.row, tris: s.tris }; })) + ';' +
  'var COL=["rgba(79,155,255,.55)","rgba(185,192,204,.45)","rgba(255,138,61,.55)","rgba(73,194,122,.6)"];' +
  'S.forEach(function(s){var d=document.createElement("div");d.className="c";d.innerHTML="<b>"+s.fam+"</b> &nbsp; cockpit ends "+s.row.cockpitEnds+" &middot; engines start "+s.row.enginesStart;' +
  'var cv=document.createElement("canvas");cv.width=640;cv.height=440;d.appendChild(cv);document.getElementById("g").appendChild(d);var x=cv.getContext("2d");' +
  'var lo=[1e9,1e9,1e9],hi=[-1e9,-1e9,-1e9];s.tris.forEach(function(t){for(var v=0;v<3;v++)for(var a=0;a<3;a++){lo[a]=Math.min(lo[a],t[1+v*3+a]);hi[a]=Math.max(hi[a],t[1+v*3+a]);}});' +
  'var L=hi[2]-lo[2],sc=600/Math.max(L,1e-6),h1=(hi[0]-lo[0])*sc,h2=(hi[1]-lo[1])*sc;var k=Math.min(1,200/Math.max(h1,h2,1));sc*=k;' +
  'function view(oy,a,cy){s.tris.forEach(function(t){x.fillStyle=COL[t[0]];x.beginPath();for(var v=0;v<3;v++){var px=20+(hi[2]-t[1+v*3+2])*sc,py=oy+(cy-t[1+v*3+a])*sc;v?x.lineTo(px,py):x.moveTo(px,py);}x.closePath();x.fill();});}' +
  'view(110,0,(hi[0]+lo[0])/2);view(330,1,(hi[1]+lo[1])/2);' +
  '[s.row.cockpitEnds,s.row.enginesStart].forEach(function(f){var px=20+f*L*sc;x.setLineDash([6,5]);x.strokeStyle="#fff";x.lineWidth=1.2;x.beginPath();x.moveTo(px,8);x.lineTo(px,432);x.stroke();x.setLineDash([]);x.fillStyle="#fff";x.font="13px monospace";x.fillText(f.toFixed(2),px+4,20);});});</script>';
fs.writeFileSync(path.join(ROOT, '_ship-cuts.html'), html);
console.log('wrote _ship-cuts.html');
