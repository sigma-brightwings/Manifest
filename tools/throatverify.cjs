/* Scratch probe: prove the reference-volume path end to end.
 *
 * The station models in ref/ports were all exported BEFORE the exporter
 * stopped dropping invisible nodes, so none of them carries a `…Throat` and
 * none of them can exercise the code that prefers one. This builds a GLB
 * that does: one berth group holding a reference volume AND the five plates
 * that line it, which is exactly the shape station.js emits.
 *
 * What must come out:
 *   - ONE berth, not two (the box and its lining are one bay)
 *   - measured from the THROAT, not the panel union, because the panels
 *     line the aperture and their union is a wall thickness too big
 *   - the throat absent from the drawn mesh (it is a solid dark slab)
 *   - a second berth group still counted separately
 *
 * Untracked, like the other *verify.cjs files.
 */
var fs = require('fs');
var path = require('path');
var os = require('os');

/* ---- minimal GLB writer: boxes, optional parent groups ----------------- */
function boxMesh(cx, cy, cz, hx, hy, hz) {
  var v = [], f = [];
  for (var sz = -1; sz <= 1; sz += 2)
    for (var sy = -1; sy <= 1; sy += 2)
      for (var sx = -1; sx <= 1; sx += 2)
        v.push([cx + hx * sx, cy + hy * sy, cz + hz * sz]);
  var q = [[0,1,3],[0,3,2],[4,6,7],[4,7,5],[0,4,5],[0,5,1],
           [2,3,7],[2,7,6],[0,2,6],[0,6,4],[1,5,7],[1,7,3]];
  q.forEach(function (t) { f.push(t[0], t[1], t[2]); });
  return { v: v, f: f };
}

function writeGlb(file, nodes) {
  /* nodes: [{ name, box, children:[...] }] — children get a parent group. */
  var bin = [], accessors = [], views = [], meshes = [], gnodes = [];
  var off = 0;
  function addBox(box, name) {
    var pos = Buffer.alloc(box.v.length * 12);
    box.v.forEach(function (p, i) {
      pos.writeFloatLE(p[0], i * 12); pos.writeFloatLE(p[1], i * 12 + 4);
      pos.writeFloatLE(p[2], i * 12 + 8);
    });
    var idx = Buffer.alloc(box.f.length * 2);
    box.f.forEach(function (n, i) { idx.writeUInt16LE(n, i * 2); });
    var min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    box.v.forEach(function (p) {
      for (var a = 0; a < 3; a++) {
        if (p[a] < min[a]) min[a] = p[a];
        if (p[a] > max[a]) max[a] = p[a];
      }
    });
    views.push({ buffer: 0, byteOffset: off, byteLength: pos.length });
    bin.push(pos); off += pos.length;
    views.push({ buffer: 0, byteOffset: off, byteLength: idx.length });
    bin.push(idx); off += idx.length;
    accessors.push({ bufferView: views.length - 2, componentType: 5126,
                     count: box.v.length, type: 'VEC3', min: min, max: max });
    accessors.push({ bufferView: views.length - 1, componentType: 5123,
                     count: box.f.length, type: 'SCALAR' });
    meshes.push({ primitives: [{ attributes: { POSITION: accessors.length - 2 },
                                 indices: accessors.length - 1, material: 0 }] });
    return meshes.length - 1;
  }

  function emit(spec) {
    var kids = (spec.children || []).map(emit);
    var n = { name: spec.name };
    if (spec.box) n.mesh = addBox(spec.box, spec.name);
    if (kids.length) n.children = kids;
    gnodes.push(n);
    return gnodes.length - 1;
  }
  var roots = nodes.map(emit);

  var binBuf = Buffer.concat(bin);
  while (binBuf.length % 4) binBuf = Buffer.concat([binBuf, Buffer.from([0])]);
  var json = {
    asset: { version: '2.0' },
    scene: 0, scenes: [{ nodes: roots }],
    nodes: gnodes, meshes: meshes, accessors: accessors, bufferViews: views,
    buffers: [{ byteLength: binBuf.length }],
    materials: [{ pbrMetallicRoughness: { baseColorFactor: [0.6, 0.6, 0.6, 1] } }]
  };
  var js = Buffer.from(JSON.stringify(json), 'utf8');
  while (js.length % 4) js = Buffer.concat([js, Buffer.from(' ')]);
  var head = Buffer.alloc(12);
  head.write('glTF', 0, 'ascii');
  head.writeUInt32LE(2, 4);
  head.writeUInt32LE(12 + 8 + js.length + 8 + binBuf.length, 8);
  var jc = Buffer.alloc(8); jc.writeUInt32LE(js.length, 0); jc.write('JSON', 4, 'ascii');
  var bc = Buffer.alloc(8); bc.writeUInt32LE(binBuf.length, 0); bc.write('BIN\0', 4, 'ascii');
  fs.writeFileSync(file, Buffer.concat([head, jc, js, bc, binBuf]));
}

/* ---- the fixture ------------------------------------------------------- */
var dir = fs.mkdtempSync(path.join(os.tmpdir(), 'throat-'));
var W = 3, H = 2, D = 6, T = 0.4;          // aperture and wall thickness

/* Berth A: a reference volume plus the five plates that line it, grouped —
 * the shape station.js builds. Panels sit OUTSIDE the aperture by T. */
var berthA = {
  name: 'berthSM0A', children: [
    { name: 'berthSM0AThroat',     box: boxMesh(0, 0, -D / 2, W, H, D / 2) },
    { name: 'berthSM0AThroatFloor', box: boxMesh(0, -H - T / 2, -D / 2, W + T, T / 2, D / 2) },
    { name: 'berthSM0AThroatRoof',  box: boxMesh(0, H + T / 2, -D / 2, W + T, T / 2, D / 2) },
    { name: 'berthSM0AThroatWallL', box: boxMesh(-W - T / 2, 0, -D / 2, T / 2, H + T, D / 2) },
    { name: 'berthSM0AThroatWallR', box: boxMesh(W + T / 2, 0, -D / 2, T / 2, H + T, D / 2) },
    { name: 'berthSM0AThroatBack',  box: boxMesh(0, 0, -D - T / 2, W, H, T / 2) }
  ]
};
/* Berth B: panels only, no reference volume — every model exported before
 * the fix, and the path that must still work. */
var berthB = {
  name: 'berthSM1A', children: [
    { name: 'berthSM1AThroatFloor', box: boxMesh(20, -H - T / 2, -D / 2, W + T, T / 2, D / 2) },
    { name: 'berthSM1AThroatRoof',  box: boxMesh(20, H + T / 2, -D / 2, W + T, T / 2, D / 2) }
  ]
};
var hull = { name: 'stationHull', box: boxMesh(0, 0, 0, 30, 30, 30) };

writeGlb(path.join(dir, 'probe.glb'), [hull, berthA, berthB]);

/* ---- convert and look -------------------------------------------------- */
var cp = require('child_process');
var out = path.join(dir, 'ports.js');
cp.execFileSync(process.execPath,
  [path.join(__dirname, 'glb2hulls.js'), dir, out, '--ports'],
  { stdio: 'pipe' });

global.window = global;
require(out);
var p = global.PortLib.probe;
var berths = (p.anchors && p.anchors.berths) || [];

function ok(label, cond, detail) {
  console.log((cond ? '  ok   ' : '  FAIL ') + label + (detail ? '   ' + detail : ''));
  return cond;
}

console.log('berths found: ' + berths.length);
berths.forEach(function (b, i) {
  console.log('  #' + i + ' node=' + b.node + '  size ' +
    (b.max[0] - b.min[0]).toFixed(3) + ' x ' +
    (b.max[1] - b.min[1]).toFixed(3) + ' x ' +
    (b.max[2] - b.min[2]).toFixed(3));
});

var fail = 0;
if (!ok('one berth per group, not one per panel', berths.length === 2,
        berths.length + ' berths')) fail++;

if (berths.length === 2) {
  /* The model is normalised, so compare RATIOS rather than absolutes: the
   * throat is 2W wide, the panel union 2W + 2T. */
  var a = berths.filter(function (b) { return /berthSM0/.test(b.node); })[0];
  var b2 = berths.filter(function (b) { return /berthSM1/.test(b.node); })[0];
  if (!ok('the grouped berth is measured from its reference volume',
          a && /Throat$/.test(a.node), a ? a.node : 'missing')) fail++;
  if (a) {
    var wide = a.max[0] - a.min[0];
    var lined = (b2.max[0] - b2.min[0]);
    if (!ok('and so is narrower than the panels that line it',
            wide < lined, wide.toFixed(4) + ' vs ' + lined.toFixed(4))) fail++;
  }
  if (!ok('a berth with no reference volume still measures from its panels',
          b2 && /ThroatFloor|ThroatRoof/.test(b2.node), b2 ? b2.node : 'missing')) fail++;
}

/* And the throat must not be painted. The hull box is 12 triangles; each
 * drawn panel adds 12. With the reference volumes drawn the count jumps. */
var tris = p.f.length;
console.log('drawn triangles: ' + tris);
if (!ok('the reference volume is not in the drawn mesh',
        tris === 12 + 12 * 5 + 12 * 2, tris + ' triangles')) fail++;

fs.rmSync(dir, { recursive: true, force: true });
console.log(fail ? '\n' + fail + ' FAILED' : '\nall good');
process.exit(fail ? 1 : 0);
