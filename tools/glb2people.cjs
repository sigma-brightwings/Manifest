/* glb2people.cjs — Quaternius' universal humanoid (CC0) into src/people-data.js.
 *
 *     node tools/glb2people.cjs --clips <animation-library.glb> --body <name>=<file.glb>[:<mesh,mesh>] ... [--out src/people-data.js]
 *
 * Astra, 2026-10-26: "let's do the quaternius models". The people stop being
 * built out of boxes in npcmodel.js and become Quaternius' Universal Base
 * Characters on his Universal Animation Library, both CC0 (the licence text
 * ships in assets/quaternius/LICENSE.txt). This tool is the whole import:
 *
 *   SKELETON. His rig has 53 joints, 30 of them fingers. A crowd in sealed
 *   gloves doesn't need fingers, so every finger and thumb joint folds into
 *   its hand: their weights move to the hand, and 23 bones are left — few
 *   enough that a body's matrices fit the vertex shader's uniforms with room
 *   to spare (rig.js, npcgl.js).
 *
 *   BODIES. Each mesh keeps positions, normals, up to four bone weights per
 *   vertex (renumbered to the 23) and which material each triangle came
 *   from. Materials are flat colours here; the game recolours them by slot
 *   (skin, suit …) per person, so a material's NAME is what matters and its
 *   colour is only the default. Indexed, so a body is drawn with
 *   drawElements.
 *
 *   CLIPS. Every animation is resampled at 30 frames a second into each
 *   bone's local rotation (and the hips' translation — the only bone that
 *   moves rather than turns), so the runtime samples arrays and never reads
 *   glTF curves. Rotations are stored as 16-bit integers; that is a few
 *   hundredths of a degree, far under a pixel.
 *
 * Everything is written base64 into one plain script, as hulls.js is, so it
 * loads the same way under file://, game:// and node's require.
 */
'use strict';
var fs = require('fs');
var path = require('path');

/* ---- arguments -------------------------------------------------------- */
var args = process.argv.slice(2), clipsFile = null, bodies = [], outFile = path.join(__dirname, '..', 'src', 'people-data.js'), keepClips = null;
for (var ai = 0; ai < args.length; ai++) {
  if (args[ai] === '--clips') clipsFile = args[++ai];
  else if (args[ai] === '--body') { var bs = args[++ai], eq = bs.indexOf('='), rest = bs.slice(eq + 1), col = rest.lastIndexOf(':');
    var file = col > 2 ? rest.slice(0, col) : rest, meshes = col > 2 ? rest.slice(col + 1).split(',') : null;
    bodies.push({ name: bs.slice(0, eq), file: file, meshes: meshes }); }
  else if (args[ai] === '--out') outFile = args[++ai];
  else if (args[ai] === '--only') keepClips = args[++ai].split(',');
}
if (!clipsFile && !bodies.length) { console.error('usage: node tools/glb2people.cjs --clips lib.glb --body name=file.glb[:mesh,mesh] [--only Walk_Loop,Idle_Loop] [--out file]'); process.exit(1); }

/* ---- GLB --------------------------------------------------------------- */
function readGLB(file) {
  if (/\.gltf$/i.test(file)) {      // a .gltf with its buffer beside it
    var jj = JSON.parse(fs.readFileSync(file, 'utf8'));
    jj._bin = fs.readFileSync(path.join(path.dirname(file), jj.buffers[0].uri));
    return jj;
  }
  var b = fs.readFileSync(file);
  if (b.readUInt32LE(0) !== 0x46546C67) throw new Error(file + ': not a GLB');
  var jl = b.readUInt32LE(12), j = JSON.parse(b.slice(20, 20 + jl).toString('utf8'));
  var bin = null, off = 20 + jl;
  if (off < b.length) { var bl = b.readUInt32LE(off); bin = b.slice(off + 8, off + 8 + bl); }
  j._bin = bin;
  return j;
}
var CT = { 5120: [Int8Array, 1], 5121: [Uint8Array, 1], 5122: [Int16Array, 2], 5123: [Uint16Array, 2], 5125: [Uint32Array, 4], 5126: [Float32Array, 4] };
var NC = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
function accessor(j, i) {
  var a = j.accessors[i], bv = j.bufferViews[a.bufferView], T = CT[a.componentType], n = NC[a.type];
  var stride = bv.byteStride || T[1] * n, base = (bv.byteOffset || 0) + (a.byteOffset || 0);
  var out = new Float32Array(a.count * n), dv = new DataView(j._bin.buffer, j._bin.byteOffset);
  for (var k = 0; k < a.count; k++) for (var c = 0; c < n; c++) {
    var o = base + k * stride + c * T[1], v;
    switch (a.componentType) {
      case 5126: v = dv.getFloat32(o, true); break;
      case 5125: v = dv.getUint32(o, true); break;
      case 5123: v = dv.getUint16(o, true); if (a.normalized) v /= 65535; break;
      case 5122: v = dv.getInt16(o, true); if (a.normalized) v = Math.max(v / 32767, -1); break;
      case 5121: v = dv.getUint8(o); if (a.normalized) v /= 255; break;
      default: v = dv.getInt8(o); if (a.normalized) v = Math.max(v / 127, -1);
    }
    out[k * n + c] = v;
  }
  return { data: out, n: n, count: a.count };
}

/* ---- matrices (column-major, as glTF) ------------------------------------ */
function m4() { return [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]; }
function mul(a, b) { var o = new Array(16); for (var c = 0; c < 4; c++) for (var r = 0; r < 4; r++) o[c*4+r] = a[r]*b[c*4] + a[4+r]*b[c*4+1] + a[8+r]*b[c*4+2] + a[12+r]*b[c*4+3]; return o; }
function trs(t, q, s) {
  t = t || [0,0,0]; q = q || [0,0,0,1]; s = s || [1,1,1];
  var x=q[0], y=q[1], z=q[2], w=q[3];
  return [(1-2*(y*y+z*z))*s[0], (2*(x*y+z*w))*s[0], (2*(x*z-y*w))*s[0], 0,
          (2*(x*y-z*w))*s[1], (1-2*(x*x+z*z))*s[1], (2*(y*z+x*w))*s[1], 0,
          (2*(x*z+y*w))*s[2], (2*(y*z-x*w))*s[2], (1-2*(x*x+y*y))*s[2], 0,
          t[0], t[1], t[2], 1];
}
function nodeMat(n) { return n.matrix ? n.matrix.slice() : trs(n.translation, n.rotation, n.scale); }

/* ---- the 23 bones ------------------------------------------------------- */
var KEEP = ['root', 'DEF-hips', 'DEF-spine.001', 'DEF-spine.002', 'DEF-spine.003', 'DEF-neck', 'DEF-head',
  'DEF-shoulder.L', 'DEF-upper_arm.L', 'DEF-forearm.L', 'DEF-hand.L',
  'DEF-shoulder.R', 'DEF-upper_arm.R', 'DEF-forearm.R', 'DEF-hand.R',
  'DEF-thigh.L', 'DEF-shin.L', 'DEF-foot.L', 'DEF-toe.L', 'DEF-thigh.R', 'DEF-shin.R', 'DEF-foot.R', 'DEF-toe.R'];
var NAMES = KEEP.map(function (n) { return n.replace(/^DEF-/, ''); });
/* The same rig exported with Unreal's names (the base characters' glTF). */
var ALIAS = { 'root': ['root'], 'DEF-hips': ['pelvis'], 'DEF-spine.001': ['spine_01'], 'DEF-spine.002': ['spine_02'], 'DEF-spine.003': ['spine_03'],
  'DEF-neck': ['neck_01'], 'DEF-head': ['Head', 'head'],
  'DEF-shoulder.L': ['clavicle_l'], 'DEF-upper_arm.L': ['upperarm_l'], 'DEF-forearm.L': ['lowerarm_l'], 'DEF-hand.L': ['hand_l'],
  'DEF-shoulder.R': ['clavicle_r'], 'DEF-upper_arm.R': ['upperarm_r'], 'DEF-forearm.R': ['lowerarm_r'], 'DEF-hand.R': ['hand_r'],
  'DEF-thigh.L': ['thigh_l'], 'DEF-shin.L': ['calf_l'], 'DEF-foot.L': ['foot_l'], 'DEF-toe.L': ['ball_l'],
  'DEF-thigh.R': ['thigh_r'], 'DEF-shin.R': ['calf_r'], 'DEF-foot.R': ['foot_r'], 'DEF-toe.R': ['ball_r'] };
function keepIndex(name) {
  var k = KEEP.indexOf(name); if (k >= 0) return k;
  for (var i = 0; i < KEEP.length; i++) if (ALIAS[KEEP[i]].indexOf(name) >= 0) return i;
  return -1;
}

/* For a skin: each original joint → which of the 23 it folds into (itself,
 * or the nearest kept ancestor), and the 23's parents, rest TRS and inverse
 * bind matrices. Rest TRS comes from the nodes; the inverse bind matrices
 * from the skin, and for a kept bone they are its own. */
function skeletonOf(j, skinIx) {
  var sk = j.skins[skinIx], joints = sk.joints, N = j.nodes, parentOf = {};
  N.forEach(function (n, i) { (n.children || []).forEach(function (c) { parentOf[c] = i; }); });
  var ibmA = sk.inverseBindMatrices != null ? accessor(j, sk.inverseBindMatrices).data : null;
  var keepIx = KEEP.map(function (k, i) { var at = joints.findIndex(function (ji) { return keepIndex(N[ji].name) === i; }); if (at < 0) throw new Error('rig has no ' + k); return at; });
  var fold = joints.map(function (ji, at) {
    var node = ji;
    while (node != null) {
      var k = keepIndex(N[node].name);
      if (k >= 0) return k;
      node = parentOf[node];
    }
    throw new Error('joint ' + N[ji].name + ' has no kept ancestor');
  });
  var parent = KEEP.map(function (k, i) {
    var node = parentOf[joints[keepIx[i]]];
    while (node != null) { var p = keepIndex(N[node].name); if (p >= 0) return p; node = parentOf[node]; }
    return -1;
  });
  var rest = KEEP.map(function (k, i) { var n = N[joints[keepIx[i]]]; return { t: n.translation || [0,0,0], r: n.rotation || [0,0,0,1], s: n.scale || [1,1,1] }; });
  /* Whatever sits above the root (the armature's own node) is baked into
   * the root's rest, so the runtime's chain starts at the root. */
  var above = m4(), node = parentOf[joints[keepIx[0]]];
  var chain = [];
  while (node != null) { chain.unshift(node); node = parentOf[node]; }
  chain.forEach(function (c) { above = mul(above, nodeMat(N[c])); });
  var ibm = keepIx.map(function (at) { return ibmA ? Array.prototype.slice.call(ibmA, at * 16, at * 16 + 16) : m4(); });
  return { fold: fold, parent: parent, rest: rest, ibm: ibm, above: above };
}

/* ---- a body --------------------------------------------------------------- */
function body(spec) {
  var j = readGLB(spec.file);
  var meshNodes = j.nodes.map(function (n, i) { return { n: n, i: i }; }).filter(function (x) { return x.n.mesh != null && x.n.skin != null; });
  if (spec.meshes) meshNodes = meshNodes.filter(function (x) { return spec.meshes.indexOf(x.n.name) >= 0 || spec.meshes.indexOf(j.meshes[x.n.mesh].name) >= 0; });
  if (!meshNodes.length) throw new Error(spec.file + ': no skinned mesh' + (spec.meshes ? ' named ' + spec.meshes.join(',') : ''));
  var sk = skeletonOf(j, meshNodes[0].n.skin);
  var mats = (j.materials || []).map(function (m) {
    var p = m.pbrMetallicRoughness || {}, c = p.baseColorFactor || [1, 1, 1, 1];
    return { name: m.name || 'mat', rgb: [c[0], c[1], c[2]].map(function (v) { return Math.round(Math.pow(v, 1 / 2.2) * 255); }), tex: !!p.baseColorTexture };
  });
  var pos = [], nrm = [], jw = [], ww = [], mat = [], idx = [], parts = [];
  meshNodes.forEach(function (mn) {
    var skx = skeletonOf(j, mn.n.skin);   // each mesh may carry its own skin over the same rig
    j.meshes[mn.n.mesh].primitives.forEach(function (pr) {
      var P = accessor(j, pr.attributes.POSITION), Nn = pr.attributes.NORMAL != null ? accessor(j, pr.attributes.NORMAL) : null;
      var J = accessor(j, pr.attributes.JOINTS_0), Wt = accessor(j, pr.attributes.WEIGHTS_0);
      var base = pos.length / 3, mi = pr.material != null ? pr.material : 0;
      for (var v = 0; v < P.count; v++) {
        pos.push(P.data[v*3], P.data[v*3+1], P.data[v*3+2]);
        if (Nn) nrm.push(Nn.data[v*3], Nn.data[v*3+1], Nn.data[v*3+2]); else nrm.push(0, 1, 0);
        /* Fold the four influences into the 23, merging any that land on
         * the same bone, strongest first, renormalised. */
        var acc = {};
        for (var c = 0; c < 4; c++) { var wv = Wt.data[v*4+c]; if (wv <= 0) continue; var b = skx.fold[J.data[v*4+c]]; acc[b] = (acc[b] || 0) + wv; }
        var ks = Object.keys(acc).sort(function (a, b2) { return acc[b2] - acc[a]; }).slice(0, 4), tot = 0;
        ks.forEach(function (k) { tot += acc[k]; });
        for (c = 0; c < 4; c++) { jw.push(ks[c] != null ? +ks[c] : 0); ww.push(ks[c] != null ? acc[ks[c]] / (tot || 1) : 0); }
        mat.push(mi);
      }
      var I = pr.indices != null ? accessor(j, pr.indices).data : null, start = idx.length;
      if (I) for (var q = 0; q < I.length; q++) idx.push(base + I[q]); else for (q = 0; q < P.count; q++) idx.push(base + q);
      parts.push({ mat: mi, start: start, count: idx.length - start });
    });
  });
  var lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
  for (var k = 0; k < pos.length; k += 3) for (var c2 = 0; c2 < 3; c2++) { lo[c2] = Math.min(lo[c2], pos[k+c2]); hi[c2] = Math.max(hi[c2], pos[k+c2]); }
  return { name: spec.name, verts: pos.length / 3, tris: idx.length / 3, mats: mats, parts: parts, lo: lo, hi: hi,
           skel: { parent: sk.parent, rest: sk.rest, ibm: sk.ibm, above: sk.above },
           pos: new Float32Array(pos), nrm: new Int8Array(nrm.map(function (v) { return Math.round(v * 127); })),
           j: new Uint8Array(jw), w: new Uint8Array(ww.map(function (v) { return Math.round(v * 255); })),
           m: new Uint8Array(mat), idx: pos.length / 3 > 65535 ? new Uint32Array(idx) : new Uint16Array(idx) };
}

/* ---- clips ------------------------------------------------------------------ */
var FPS = 30;
function clips(file) {
  var j = readGLB(file), N = j.nodes, out = {};
  var skinIx = 0, sk = skeletonOf(j, skinIx), joints = j.skins[skinIx].joints;
  var keepNode = KEEP.map(function (k, i) { return joints.find(function (ji) { return keepIndex(N[ji].name) === i; }); });
  (j.animations || []).forEach(function (an) {
    if (keepClips && keepClips.indexOf(an.name) < 0) return;
    var dur = 0, ch = {};
    an.channels.forEach(function (c) {
      var s = an.samplers[c.sampler], tIn = accessor(j, s.input).data, vOut = accessor(j, s.output);
      dur = Math.max(dur, tIn[tIn.length - 1]);
      (ch[c.target.node] = ch[c.target.node] || {})[c.target.path] = { t: tIn, v: vOut.data, n: vOut.n, step: s.interpolation === 'STEP' };
    });
    var frames = Math.max(2, Math.round(dur * FPS) + 1);
    var rot = new Int16Array(frames * KEEP.length * 4), hip = new Float32Array(frames * 3);
    function sample(cur, t, n) {
      var T = cur.t, i = 0;
      if (t <= T[0]) i = 0; else if (t >= T[T.length - 1]) i = T.length - 1; else { while (T[i + 1] < t) i++; }
      if (i >= T.length - 1 || cur.step || t <= T[0]) return Array.prototype.slice.call(cur.v, i * n, i * n + n);
      var u = (t - T[i]) / (T[i + 1] - T[i]), a = Array.prototype.slice.call(cur.v, i * n, i * n + n), b = Array.prototype.slice.call(cur.v, (i + 1) * n, (i + 1) * n + n);
      if (n === 4) {    // quaternion slerp (nlerp is plenty at 30 fps)
        var d = a[0]*b[0] + a[1]*b[1] + a[2]*b[2] + a[3]*b[3]; if (d < 0) b = b.map(function (x) { return -x; });
        var q = a.map(function (x, k) { return x + (b[k] - x) * u; }), l = Math.hypot(q[0], q[1], q[2], q[3]);
        return q.map(function (x) { return x / l; });
      }
      return a.map(function (x, k) { return x + (b[k] - x) * u; });
    }
    for (var f = 0; f < frames; f++) {
      var t = Math.min(dur, f / FPS);
      KEEP.forEach(function (k, bi) {
        var c = ch[keepNode[bi]] || {}, r = c.rotation ? sample(c.rotation, t, 4) : sk.rest[bi].r;
        if (r[3] < 0) r = r.map(function (x) { return -x; });
        for (var q = 0; q < 4; q++) rot[(f * KEEP.length + bi) * 4 + q] = Math.round(r[q] * 32767);
        if (bi === 1) { var tr = c.translation ? sample(c.translation, t, 3) : sk.rest[bi].t; hip[f*3] = tr[0]; hip[f*3+1] = tr[1]; hip[f*3+2] = tr[2]; }
      });
    }
    out[an.name] = { frames: frames, dur: dur, rot: rot, hip: hip };
  });
  return { clips: out, restHip: sk.rest[1].t, skel: sk };
}

/* ---- retargeting ---------------------------------------------------------------
 * Clips are the animation library's local rotations. A body on the same rig
 * but with its own proportions (and so its own bind rotations) takes them
 * through two constant rotations a bone:
 *     local_body = A · local_clip · B,  A = Gb(parent)⁻¹ Gc(parent),  B = Gc(bone)⁻¹ Gb(bone)
 * where G is a bone's bind rotation in model space, b the body's and c the
 * clip rig's — which is the clip's change from ITS bind pose, carried in
 * model space onto THIS body's bind pose. */
function qmul(a, b) { return [a[3]*b[0] + a[0]*b[3] + a[1]*b[2] - a[2]*b[1], a[3]*b[1] - a[0]*b[2] + a[1]*b[3] + a[2]*b[0], a[3]*b[2] + a[0]*b[1] - a[1]*b[0] + a[2]*b[3], a[3]*b[3] - a[0]*b[0] - a[1]*b[1] - a[2]*b[2]]; }
function qinv(a) { return [-a[0], -a[1], -a[2], a[3]]; }
function globalRots(parent, rest) {
  var G = [];
  for (var i = 0; i < rest.length; i++) G[i] = parent[i] < 0 ? rest[i].r.slice() : qmul(G[parent[i]], rest[i].r);
  return G;
}
var CLIPRIG = null;
function retarget(bodySkel) {
  if (!CLIPRIG) return null;
  var Gc = globalRots(CLIPRIG.parent, CLIPRIG.rest), Gb = globalRots(bodySkel.parent, bodySkel.rest), I = [0, 0, 0, 1];
  return KEEP.map(function (k, i) {
    var p = bodySkel.parent[i];
    var A = p < 0 ? I : qmul(qinv(Gb[p]), Gc[p]), B = qmul(qinv(Gc[i]), Gb[i]);
    return { a: A.map(function (x) { return +x.toFixed(6); }), b: B.map(function (x) { return +x.toFixed(6); }) };
  });
}

/* ---- write ------------------------------------------------------------------- */
function b64(ta) { return Buffer.from(ta.buffer, ta.byteOffset, ta.byteLength).toString('base64'); }
var data = { fps: FPS, bones: NAMES, bodies: {}, clips: {} };
if (clipsFile) {
  var C = clips(clipsFile);
  data.clipHip = C.restHip;
  CLIPRIG = C.skel;
  Object.keys(C.clips).forEach(function (k) { var c = C.clips[k]; data.clips[k] = { frames: c.frames, dur: +c.dur.toFixed(4), rot: b64(c.rot), hip: b64(c.hip) }; });
}
bodies.forEach(function (spec) {
  var B = body(spec);
  B.skel.retarget = retarget(B.skel);
  data.bodies[B.name] = { verts: B.verts, tris: B.tris, mats: B.mats, parts: B.parts, lo: B.lo, hi: B.hi, skel: B.skel,
    pos: b64(B.pos), nrm: b64(B.nrm), j: b64(B.j), w: b64(B.w), m: b64(B.m), idx: b64(B.idx), idx32: B.idx instanceof Uint32Array };
  console.log('body ' + B.name + ': ' + B.verts + ' verts, ' + B.tris + ' tris, mats ' + B.mats.map(function (m) { return m.name; }).join('/') + ', height ' + (B.hi[1] - B.lo[1]).toFixed(3));
});
console.log('clips: ' + Object.keys(data.clips).length);
var js = '/* people-data.js — GENERATED by tools/glb2people.cjs; do not edit by hand.\n' +
  ' * Quaternius, Universal Base Characters and Universal Animation Library, CC0 1.0\n' +
  ' * (https://quaternius.com) — see assets/quaternius/LICENSE.txt. */\n' +
  '(function (global) {\n  var PeopleData = ' + JSON.stringify(data) + ';\n' +
  '  global.PeopleData = PeopleData;\n  if (typeof module !== \'undefined\' && module.exports) module.exports = PeopleData;\n' +
  '})(typeof window !== \'undefined\' ? window : globalThis);\n';
fs.writeFileSync(outFile, js);
console.log('wrote ' + outFile + ' (' + (js.length / 1024).toFixed(0) + ' KB)');
