/* glb2hulls.js — turn a folder of .glb ship models into src/hulls.js.
 *
 *     node tools/glb2hulls.js <folder-with-glbs> [out.js]
 *
 * The game's renderer eats one mesh format: { v: [[x,y,z]...], f: [[a,b,c]...],
 * c: [colourPerFace...] }, hand-rolled projection, painter's algorithm, no
 * GPU. So a model pipeline here is not "load glTF" — it is: walk the node
 * hierarchy, bake every transform into the vertices, keep one flat colour
 * per face from the material, normalise the whole ship to unit length on
 * the origin, and write it out as data the existing paintMesh draws with
 * zero new runtime code.
 *
 * Every model gets an ID — its filename stem — and that ID is the contract:
 * the game assigns hulls to ship classes BY ID, the viewer page labels them
 * BY ID, and re-running this tool over a bigger folder adds models without
 * renaming anything.
 *
 * Deliberately supported: positions, indices (u8/u16/u32), node TRS and
 * matrix transforms, baseColorFactor, emissiveFactor. Deliberately ignored:
 * textures, normals (the renderer computes its own), skins, animations.
 */
'use strict';
var fs = require('fs');
var path = require('path');

var srcDir = process.argv[2] || '.';
var outFile = process.argv[3] || path.join(__dirname, '..', 'src', 'hulls.js');

/* ---- tiny matrix kit (column-major 4x4, like glTF) ---------------------- */
function matIdentity() { return [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]; }
function matMul(a, b) {
  var o = new Array(16);
  for (var c = 0; c < 4; c++) for (var r = 0; r < 4; r++) {
    o[c*4+r] = a[r]*b[c*4] + a[4+r]*b[c*4+1] + a[8+r]*b[c*4+2] + a[12+r]*b[c*4+3];
  }
  return o;
}
function matFromTRS(t, q, s) {
  t = t || [0,0,0]; q = q || [0,0,0,1]; s = s || [1,1,1];
  var x=q[0], y=q[1], z=q[2], w=q[3];
  var m = [
    (1-2*(y*y+z*z))*s[0], (2*(x*y+z*w))*s[0], (2*(x*z-y*w))*s[0], 0,
    (2*(x*y-z*w))*s[1], (1-2*(x*x+z*z))*s[1], (2*(y*z+x*w))*s[1], 0,
    (2*(x*z+y*w))*s[2], (2*(y*z-x*w))*s[2], (1-2*(x*x+y*y))*s[2], 0,
    t[0], t[1], t[2], 1
  ];
  return m;
}
function matApply(m, p) {
  return [
    m[0]*p[0] + m[4]*p[1] + m[8]*p[2] + m[12],
    m[1]*p[0] + m[5]*p[1] + m[9]*p[2] + m[13],
    m[2]*p[0] + m[6]*p[1] + m[10]*p[2] + m[14]
  ];
}

/* ---- GLB container ------------------------------------------------------ */
function parseGlb(buf) {
  if (buf.toString('ascii', 0, 4) !== 'glTF') throw new Error('not a GLB');
  var jsonLen = buf.readUInt32LE(12);
  if (buf.toString('ascii', 16, 20) !== 'JSON') throw new Error('no JSON chunk');
  var json = JSON.parse(buf.toString('utf8', 20, 20 + jsonLen));
  var binStart = 20 + jsonLen;
  var bin = null;
  if (binStart < buf.length) {
    var binLen = buf.readUInt32LE(binStart);
    bin = buf.slice(binStart + 8, binStart + 8 + binLen);
  }
  return { json: json, bin: bin };
}

function accessorData(g, idx) {
  var acc = g.json.accessors[idx];
  var bv = g.json.bufferViews[acc.bufferView];
  var base = (bv.byteOffset || 0) + (acc.byteOffset || 0);
  var n = acc.count;
  var compCount = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[acc.type];
  var out = [];
  var stride, read;
  if (acc.componentType === 5126) { stride = 4; read = function (o) { return g.bin.readFloatLE(o); }; }
  else if (acc.componentType === 5125) { stride = 4; read = function (o) { return g.bin.readUInt32LE(o); }; }
  else if (acc.componentType === 5123) { stride = 2; read = function (o) { return g.bin.readUInt16LE(o); }; }
  else if (acc.componentType === 5121) { stride = 1; read = function (o) { return g.bin.readUInt8(o); }; }
  else throw new Error('componentType ' + acc.componentType);
  var byteStride = bv.byteStride || compCount * stride;
  for (var i = 0; i < n; i++) {
    var rec = [];
    for (var c = 0; c < compCount; c++) rec.push(read(base + i * byteStride + c * stride));
    out.push(compCount === 1 ? rec[0] : rec);
  }
  return out;
}

function materialColour(g, idx) {
  var m = (g.json.materials || [])[idx] || {};
  var pbr = m.pbrMetallicRoughness || {};
  var base = pbr.baseColorFactor || [0.72, 0.75, 0.8, 1];
  var em = m.emissiveFactor || [0, 0, 0];
  var lit = (em[0] + em[1] + em[2]) > 0.25;
  var c = lit ? em : base;
  function hex(v) {
    var b = Math.max(0, Math.min(255, Math.round(Math.pow(v, 1 / 2.2) * 255)));
    return ('0' + b.toString(16)).slice(-2);
  }
  return (lit ? '!#' : '#') + hex(c[0]) + hex(c[1]) + hex(c[2]);
}

/* ---- what belongs to the outside, and what belongs to the seat ----------
 * The redesigned models ship the cockpit inside the same file as the hull:
 * `cockpitInterior`, `pilotSeat` and `pilotSeatBack` sit just behind
 * `cockpitGlass` at the nose. Merging all of it into one mesh — which is
 * what this tool used to do — welds a chair inside the fuselage: invisible
 * from outside, several hundred wasted triangles, and no way to use it as
 * a cockpit.
 *
 * So geometry is sorted into two buckets by node name. The GLASS stays
 * with the exterior, because it is visible from outside, but its bounds
 * are recorded separately: that box is where the canopy is, and it is what
 * the seat view mounts its panels against. */
var INTERIOR_RE = /cockpitInterior|pilotSeat/i;
var GLASS_RE = /cockpitGlass/i;

/* ---- one model ---------------------------------------------------------- */
function convert(file) {
  var g = parseGlb(fs.readFileSync(file));
  var j = g.json;
  var ext = { v: [], f: [], c: [] };
  var inr = { v: [], f: [], c: [] };
  var glassMin = [Infinity, Infinity, Infinity];
  var glassMax = [-Infinity, -Infinity, -Infinity];
  var sawGlass = false;

  function walk(nodeIdx, parentMat, inInterior) {
    var node = j.nodes[nodeIdx];
    var local = node.matrix ? node.matrix.slice()
                            : matFromTRS(node.translation, node.rotation, node.scale);
    var world = matMul(parentMat, local);
    var name = node.name || '';
    /* Classification is INHERITED: a named parent carries unnamed children
     * with it, which is how these files are actually assembled. */
    var interior = inInterior || INTERIOR_RE.test(name);

    if (node.mesh !== undefined) {
      var mesh = j.meshes[node.mesh];
      var mname = name || mesh.name || '';
      var mine = interior || INTERIOR_RE.test(mname);
      var isGlass = GLASS_RE.test(mname);
      var into = mine ? inr : ext;
      for (var p = 0; p < mesh.primitives.length; p++) {
        var prim = mesh.primitives[p];
        if (prim.mode !== undefined && prim.mode !== 4) continue;   // triangles only
        var pos = accessorData(g, prim.attributes.POSITION);
        var base = into.v.length;
        for (var i = 0; i < pos.length; i++) {
          var w = matApply(world, pos[i]);
          into.v.push(w);
          if (isGlass) {
            sawGlass = true;
            for (var a0 = 0; a0 < 3; a0++) {
              if (w[a0] < glassMin[a0]) glassMin[a0] = w[a0];
              if (w[a0] > glassMax[a0]) glassMax[a0] = w[a0];
            }
          }
        }
        var col = materialColour(g, prim.material);
        var idx = prim.indices !== undefined
          ? accessorData(g, prim.indices)
          : pos.map(function (_, k) { return k; });
        for (var t = 0; t < idx.length; t += 3) {
          into.f.push([base + idx[t], base + idx[t + 1], base + idx[t + 2]]);
          into.c.push(col);
        }
      }
    }
    for (var ch = 0; ch < (node.children || []).length; ch++) {
      walk(node.children[ch], world, interior);
    }
  }

  var scene = j.scenes[j.scene || 0];
  for (var r = 0; r < scene.nodes.length; r++) walk(scene.nodes[r], matIdentity(), false);

  /* Normalise: centred on the origin, unit length along the LONGEST axis.
   * These assets follow the glTF convention (+Y up, front toward +Z), which
   * is the game's own convention, so no axis shuffle — but if a batch ever
   * arrives sideways, this is the one place to fix it.
   *
   * MEASURED ON THE EXTERIOR, APPLIED TO BOTH. This is the part that has to
   * be right: normalising each bucket against its own bounds would scale a
   * two-metre chair up to the length of the ship and park it at the origin.
   * One transform, derived from the hull, moves everything together and
   * keeps the seat registered to the canopy. It also means the hull's unit
   * length is unchanged from before this split existed, so nothing that was
   * tuned against the old scale moves. */
  var mins = [Infinity, Infinity, Infinity], maxs = [-Infinity, -Infinity, -Infinity];
  for (var i2 = 0; i2 < ext.v.length; i2++) for (var a = 0; a < 3; a++) {
    if (ext.v[i2][a] < mins[a]) mins[a] = ext.v[i2][a];
    if (ext.v[i2][a] > maxs[a]) maxs[a] = ext.v[i2][a];
  }
  var span = [maxs[0] - mins[0], maxs[1] - mins[1], maxs[2] - mins[2]];
  var mid = [(maxs[0] + mins[0]) / 2, (maxs[1] + mins[1]) / 2, (maxs[2] + mins[2]) / 2];
  var scale = 1 / Math.max(span[0], span[1], span[2], 1e-9);

  function place(p) {
    return [
      Math.round((p[0] - mid[0]) * scale * 1000) / 1000,
      Math.round((p[1] - mid[1]) * scale * 1000) / 1000,
      Math.round((p[2] - mid[2]) * scale * 1000) / 1000
    ];
  }
  for (var i3 = 0; i3 < ext.v.length; i3++) ext.v[i3] = place(ext.v[i3]);
  for (var i4 = 0; i4 < inr.v.length; i4++) inr.v[i4] = place(inr.v[i4]);

  /* Palette-compress the colour array: a handful of materials colour
   * hundreds of faces, and writing the hex string per face triples the
   * output size for nothing. */
  function palette(cols) {
    var pal = [], palIdx = {};
    var ci = cols.map(function (col) {
      if (palIdx[col] === undefined) { palIdx[col] = pal.length; pal.push(col); }
      return palIdx[col];
    });
    return { pal: pal, ci: ci };
  }
  var pe = palette(ext.c), pi = palette(inr.c);

  var out = {
    v: ext.v, f: ext.f, pal: pe.pal, ci: pe.ci,
    span: span.map(function (s) { return Math.round(s * scale * 1000) / 1000; })
  };
  if (inr.f.length) {
    out.interior = { v: inr.v, f: inr.f, pal: pi.pal, ci: pi.ci };
  }
  /* The canopy box, in the same normalised frame — where the glass is, and
   * therefore where a seat view looks out of and mounts its panels. */
  if (sawGlass) {
    var gmin = place(glassMin), gmax = place(glassMax);
    /* Rounded like every other coordinate here. An unrounded midpoint
     * writes 0.47050000000000003 into a generated file, which is noise in
     * the diff and bytes in the payload. */
    var r3 = function (x) { return Math.round(x * 1000) / 1000; };
    out.glass = {
      min: gmin, max: gmax,
      mid: [r3((gmin[0] + gmax[0]) / 2), r3((gmin[1] + gmax[1]) / 2),
            r3((gmin[2] + gmax[2]) / 2)]
    };
  }
  return out;
}

/* ---- the whole folder --------------------------------------------------- */
var files = fs.readdirSync(srcDir).filter(function (f2) { return /\.glb$/i.test(f2); }).sort();
if (!files.length) { console.error('no .glb files in ' + srcDir); process.exit(1); }

var lib = {};
for (var fi = 0; fi < files.length; fi++) {
  var id = files[fi].replace(/\.glb$/i, '');
  var m = convert(path.join(srcDir, files[fi]));
  lib[id] = m;
  console.log(id + ': ' + m.v.length + ' verts, ' + m.f.length + ' tris, ' +
              m.pal.length + ' colours, span ' + m.span.join(' x ') +
              (m.interior ? '   + interior ' + m.interior.f.length + ' tris'
                          : '   NO INTERIOR') +
              (m.glass ? '   glass@' + m.glass.mid.join(',') : '   no glass'));
}
/* Loud, because a model that arrives without an interior is not an error —
 * it is an older export, and the only way to notice is to be told. */
var noInterior = Object.keys(lib).filter(function (k) { return !lib[k].interior; });
if (noInterior.length) {
  console.log('\n' + noInterior.length + ' model(s) have NO cockpit interior:');
  console.log('  ' + noInterior.join(', '));
}

var header = [
  '/* hulls.js — GENERATED by tools/glb2hulls.js. Do not edit by hand.',
  ' *',
  ' * Ship models imported from .glb files, one entry per model, keyed by ID',
  ' * (the source filename). Vertices are unit-length, origin-centred, +z',
  ' * forward, +y up; colours are a per-model palette indexed per face, with',
  ' * the emissive-marker convention render.js already uses (a leading ! means',
  ' * full-bright). render.js decompresses these into its own mesh format at',
  ' * load. To add models: drop .glb files in a folder and re-run the tool.',
  ' */',
  '(function (global) {',
  "  'use strict';",
  '  global.HullLib = '
].join('\n');

fs.writeFileSync(outFile,
  header + JSON.stringify(lib) + ';\n' +
  "  if (typeof module !== 'undefined' && module.exports) module.exports = global.HullLib;\n" +
  "})(typeof window !== 'undefined' ? window : globalThis);\n");
console.log('\nwrote ' + outFile + ' (' + Math.round(fs.statSync(outFile).size / 1024) + ' KB, ' +
            files.length + ' models)');
