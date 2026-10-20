/* chop-modules.cjs — cut the existing port and ship models into station
 * expansion modules.
 *
 *     node tools/chop-modules.cjs [outDir] [srcDir ...]
 *     defaults: outDir = "Claude outputs/modules", srcDirs = ref/ports update_models
 *
 * WHY: a port that grows over the years (a cracked port being rebuilt, a
 * boom system adding berths) needs parts to grow WITH, and the art already
 * exists — every port and ship is assembled from well-named parts. This
 * tool reads those names, gathers parts into functional assemblies (a berth,
 * a hangar, a tank farm, a bridge, an engine block), cuts each assembly out
 * with its transforms baked, and writes it as its own .glb, plus a catalog
 * saying what kind it is, how big, and WHERE IT WAS JOINED to the rest of
 * its parent model. Those joins are the sockets an expansion can bolt the
 * next module onto.
 *
 * HOW, in four passes:
 *   1. Units: the top-level children of the model's root (or the scene
 *      roots, if there is no single root) — each carries its subtree, so a
 *      berth deck with its doors stays one unit.
 *   2. Families: each unit's name picks a KIND from FAMILIES below (first
 *      match wins). Trim (decals, lamps, caution stripes, glass, sills) has
 *      no kind of its own and is given to the nearest real unit. Unnamed
 *      units do the same. Interior, gear, reference throats and the omitted
 *      stands are dropped, matching glb2hulls.js.
 *   3. Modules: within a kind, units whose boxes touch are one module
 *      (union-find on box overlap, slack = 1% of model span). So the two
 *      engine pods of a bulk ship come out as two engine modules, and a
 *      berth deck welded to its doors comes out as one berth.
 *   4. Sockets: wherever a module's box touches a DIFFERENT module's box,
 *      that contact is a socket: the centre of the overlap, the face normal
 *      it sits on, and the kind on the other side. Dedupe then folds
 *      identical geometry (navy/syn recolours are NOT identical — colours
 *      count — but the (1)/(2) copies and repeated berths are) and lists
 *      every source it came from.
 *
 * Output stays glTF-native (+Y up, authored units) so a module .glb can go
 * straight back through glb2hulls.js --ports. Ship modules carry the ship's
 * own units; `scaleHint` in the catalog says how a ship module compares to
 * a port's pad radius if the ship sat on that port's pad (ship length /
 * port span), which is the honest thing we can say without a declared size.
 *
 * Nothing here touches src/. It writes into outDir only.
 */
'use strict';
var fs = require('fs');
var path = require('path');
var crypto = require('crypto');

var ROOT = path.join(__dirname, '..');
var argv = process.argv.slice(2);
var OUT = argv[0] ? path.resolve(argv[0]) : path.join(ROOT, 'Claude outputs', 'modules');
var SRC = argv.length > 1 ? argv.slice(1).map(function (d) { return path.resolve(d); })
                          : [path.join(ROOT, 'ref', 'ports'), path.join(ROOT, 'update_models')];

/* ---- what to drop (kept in step with glb2hulls.js) ---------------------- */
var DROP_RE = /cockpitInterior|pilotSeat|^hall|^transferMain|^transferLift(?!Car)|Conveyor|^liguide|^liftGuide|^portInterior|^groundSaddle|^standLeg|^standShoe|^cradleArc|Throat$|^gear(Nose|Rear|Left|Right|Strut|Door|Bay)?/i;

/* ---- families: name → module kind. First match wins. ------------------- */
var FAMILIES = [
  ['trim',       /caution|decal|stripe|accent|lamp|light|designation|glass|glazing|edgeLight|sill|rebate|groove|beacon|^billboard|bermBillboard|marker|^mark|landingMark|logo|sign|greeble|^dress|emblem|kiosk|^flood|workFlood|plinth|^iff|^strip|centreline|threshold|^screen|^patch|^win|Win\d*$|^vent|^conceal|^umbilical|^valve/i],
  ['terrain',    /^(comet(Body|Ice|Drift)|rock|mountain|ground|terrain|crater|regolith|cliff|boulder|asteroid|berm)/i],
  ['dock',       /^(berth|hangar|dock|pad|plateau|landing|launch|catapult|elevator|flightDeck|deckEdge|blastDeflector|apron|runway|bay|lBay|throat|mouth|shaftMouth|portal|lane|refuel)/i],
  ['access',     /^(lift|shaft|hoist|ram|transfer|ramp|incline|tube|tunnel|corridor|airlock|lock|sortLift|hubLift|walk)/i],
  ['command',    /^(bridge|cockpit|canopy|control|island|cab|tower|terrace|observation|gallery|gal|inst|headhouse|nav|chamberNav|cmd)/i],
  ['habitat',    /^(hab|ring|rim|shell|torus|spoke|cylinder|drum|quarters|module|dome|city|block|building|house|window|hub|joining|chamber|concourse|hall|heavyHall|sortHall|passenger|flank|side|svc|head(?!Greeble))/i],
  ['power',      /^(solar|panel|array|radiator|rad|reactor|fusion|generator|heatsink|heat)/i],
  ['storage',    /^(tank|propellant|cargo|container|silo|pod|hold|bunker|crate|sphere|volatile|fuel|util|buffer|deckCrate)/i],
  ['comms',      /^(mast|antenna|dish|aerial|relay|sensor|radar|comms?|flare)/i],
  ['propulsion', /^(engine|eng|thruster|nozzle|shroud|cShroud|rcs|exhaust|drive|nacelle)/i],
  ['industry',   /^(refin|smelter|crane|gantry|yard|farm|greenhouse|skim|scoop|pipe|furnace|stack|chimney|processor|mill|foundry|press|mining|pump|intake|repair|alphaRepair|betaRepair|junRepair)/i],
  ['defence',    /^(pds|turret|deckTurret|laser|gun|missile|cannon|battery|flak|vls|particle|roofRangefinder|rangefinder|fwdSponson|sponson|pd)/i],
  ['structure',  /^(truss|beam|strut|modStrut|spine|crossbeam|crossArm|crossGusset|gusset|pylon|brace|keel|frame|boom|outrigger|buttress|arm|support|column|girder|fin|stabilizer|collar|jamb|rib|trunk|stringer|strake|pier|deckPier|mount|post|stand)/i],
  ['hull',       /^(hull|body|core|fuselage|section|nose|bow|stern|tail|chin|forebody|fairing|plate|roof|armou?r|navyArmour|end|fwd|aft)/i]
];
/* Names often carry their model as a prefix — `cometTowerCab`,
 * `freighterShiphullMain`, `navyArmour` — so a name that matches nothing
 * as written is tried again with one, then two, leading camel words
 * dropped. Trim is tested first on the WHOLE name, unanchored, because a
 * greeble is a greeble whatever it is bolted to. */
function kindOf(name) {
  if (!name) return null;
  if (FAMILIES[0][1].test(name)) return 'trim';
  var words = name.replace(/[_\-.:]+/g, ' ').split(/(?=[A-Z])| +/).filter(Boolean);
  for (var k = 0; k < Math.min(3, words.length); k++) {
    var s = words.slice(k).join('');
    s = s.charAt(0).toLowerCase() + s.slice(1);
    s = s.replace(/^ship/i, '');
    s = s.charAt(0).toLowerCase() + s.slice(1);
    for (var i = 1; i < FAMILIES.length; i++) if (FAMILIES[i][1].test(s)) return FAMILIES[i][0];
  }
  return 'misc';
}
var SKIP_FILE_RE = /detail-kit/i;   // a greeble library, not a model: dressing, not modules
var TINY = 40;                      // a misc unit below this many tris is trim

/* ---- GLB in ------------------------------------------------------------- */
function parseGlb(buf) {
  if (buf.toString('ascii', 0, 4) !== 'glTF') throw new Error('not a GLB');
  var jsonLen = buf.readUInt32LE(12);
  var json = JSON.parse(buf.toString('utf8', 20, 20 + jsonLen));
  var binStart = 20 + jsonLen, bin = null;
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
  var cc = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[acc.type];
  var sz, rd;
  if (acc.componentType === 5126) { sz = 4; rd = function (o) { return g.bin.readFloatLE(o); }; }
  else if (acc.componentType === 5125) { sz = 4; rd = function (o) { return g.bin.readUInt32LE(o); }; }
  else if (acc.componentType === 5123) { sz = 2; rd = function (o) { return g.bin.readUInt16LE(o); }; }
  else if (acc.componentType === 5121) { sz = 1; rd = function (o) { return g.bin.readUInt8(o); }; }
  else throw new Error('componentType ' + acc.componentType);
  var stride = bv.byteStride || cc * sz, out = [];
  for (var i = 0; i < acc.count; i++) {
    if (cc === 1) { out.push(rd(base + i * stride)); continue; }
    var r = []; for (var c = 0; c < cc; c++) r.push(rd(base + i * stride + c * sz)); out.push(r);
  }
  return out;
}

/* ---- matrices (column-major, as glTF) ----------------------------------- */
function matIdentity() { return [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]; }
function matMul(a, b) {
  var o = new Array(16);
  for (var c = 0; c < 4; c++) for (var r = 0; r < 4; r++)
    o[c*4+r] = a[r]*b[c*4] + a[4+r]*b[c*4+1] + a[8+r]*b[c*4+2] + a[12+r]*b[c*4+3];
  return o;
}
function matFromTRS(t, q, s) {
  t = t || [0,0,0]; q = q || [0,0,0,1]; s = s || [1,1,1];
  var x=q[0], y=q[1], z=q[2], w=q[3];
  return [
    (1-2*(y*y+z*z))*s[0], (2*(x*y+z*w))*s[0], (2*(x*z-y*w))*s[0], 0,
    (2*(x*y-z*w))*s[1], (1-2*(x*x+z*z))*s[1], (2*(y*z+x*w))*s[1], 0,
    (2*(x*z+y*w))*s[2], (2*(y*z-x*w))*s[2], (1-2*(x*x+y*y))*s[2], 0,
    t[0], t[1], t[2], 1];
}
function matApply(m, p) {
  return [m[0]*p[0]+m[4]*p[1]+m[8]*p[2]+m[12], m[1]*p[0]+m[5]*p[1]+m[9]*p[2]+m[13], m[2]*p[0]+m[6]*p[1]+m[10]*p[2]+m[14]];
}
function det3(m) {
  return m[0]*(m[5]*m[10]-m[9]*m[6]) - m[4]*(m[1]*m[10]-m[9]*m[2]) + m[8]*(m[1]*m[6]-m[5]*m[2]);
}

/* ---- boxes -------------------------------------------------------------- */
function box() { return { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] }; }
function grow(b, p) { for (var a = 0; a < 3; a++) { if (p[a] < b.min[a]) b.min[a] = p[a]; if (p[a] > b.max[a]) b.max[a] = p[a]; } }
function merge(b, c) { grow(b, c.min); grow(b, c.max); }
function empty(b) { return !(b.min[0] <= b.max[0]); }
function centre(b) { return [0,1,2].map(function (a) { return (b.min[a] + b.max[a]) / 2; }); }
function size(b) { return [0,1,2].map(function (a) { return b.max[a] - b.min[a]; }); }
function touch(b, c, e) {
  for (var a = 0; a < 3; a++) if (b.min[a] > c.max[a] + e || c.min[a] > b.max[a] + e) return false;
  return true;
}
function dist2(b, c) {   // squared gap between two boxes (0 if they overlap)
  var d = 0;
  for (var a = 0; a < 3; a++) {
    var g = Math.max(0, b.min[a] - c.max[a], c.min[a] - b.max[a]); d += g * g;
  }
  return d;
}

/* ---- one model → units -------------------------------------------------- */
function readModel(file) {
  var g = parseGlb(fs.readFileSync(file));
  var j = g.json;
  var scene = j.scenes[j.scene || 0];
  var roots = scene.nodes;
  var rootMat = matIdentity(), top = roots, rootName = '';
  if (roots.length === 1 && (j.nodes[roots[0]].children || []).length) {
    var r = j.nodes[roots[0]];
    rootName = r.name || '';
    rootMat = r.matrix ? r.matrix.slice() : matFromTRS(r.translation, r.rotation, r.scale);
    top = r.children;
    /* The root's own mesh, if any, is a unit too. */
    if (r.mesh !== undefined) top = [{ selfOf: roots[0] }].concat(top);
  }
  var units = [];
  top.forEach(function (entry) {
    var self = typeof entry === 'object';
    var idx = self ? entry.selfOf : entry;
    var node = j.nodes[idx];
    var name = node.name || '';
    if (DROP_RE.test(name)) return;
    var u = { name: name, kind: kindOf(name), tris: [], box: box() };   // tris: [p0,p1,p2,mat]
    function walk(i, parent, onlySelf) {
      var n = j.nodes[i];
      var nm = n.name || '';
      if (i !== idx && DROP_RE.test(nm)) return;
      var local = n.matrix ? n.matrix.slice() : matFromTRS(n.translation, n.rotation, n.scale);
      var world = (self && i === idx) ? parent : matMul(parent, local);
      if (n.mesh !== undefined) {
        var flip = det3(world) < 0;
        j.meshes[n.mesh].primitives.forEach(function (pr) {
          if (pr.mode !== undefined && pr.mode !== 4) return;
          var pos = accessorData(g, pr.attributes.POSITION).map(function (p) { return matApply(world, p); });
          var ix = pr.indices !== undefined ? accessorData(g, pr.indices) : pos.map(function (_, k) { return k; });
          for (var t = 0; t + 2 < ix.length; t += 3) {
            var a = pos[ix[t]], b = pos[ix[t + 1]], c = pos[ix[t + 2]];
            u.tris.push(flip ? [a, c, b, pr.material] : [a, b, c, pr.material]);
            grow(u.box, a); grow(u.box, b); grow(u.box, c);
          }
        });
      }
      if (onlySelf) return;
      (n.children || []).forEach(function (ch) { walk(ch, world, false); });
    }
    walk(idx, rootMat, self);
    if (u.tris.length) units.push(u);
  });
  return { g: g, rootName: rootName, units: units };
}

/* ---- units → modules ---------------------------------------------------- */
function chop(model) {
  var units = model.units;
  var span = box(); units.forEach(function (u) { merge(span, u.box); });
  var S = Math.max.apply(null, size(span).concat([1e-9]));
  var eps = S * 0.01;

  /* Trim and unnamed parts go to the nearest real unit. */
  units.forEach(function (u) { if (u.kind === 'misc' && u.tris.length < TINY) u.kind = 'trim'; });
  var real = units.filter(function (u) { return u.kind && u.kind !== 'trim'; });
  units.forEach(function (u) {
    if (u.kind && u.kind !== 'trim') return;
    var best = null, bd = Infinity;
    real.forEach(function (r) { var d = dist2(u.box, r.box); if (d < bd) { bd = d; best = r; } });
    if (best) { best.tris = best.tris.concat(u.tris); merge(best.box, u.box); best.trim = (best.trim || 0) + 1; }
  });

  /* Same kind + touching boxes = one module (union-find). */
  var par = real.map(function (_, i) { return i; });
  function find(i) { while (par[i] !== i) { par[i] = par[par[i]]; i = par[i]; } return i; }
  for (var a = 0; a < real.length; a++) for (var b = a + 1; b < real.length; b++) {
    if (real[a].kind === real[b].kind && touch(real[a].box, real[b].box, eps)) par[find(a)] = find(b);
  }
  var groups = {};
  real.forEach(function (u, i) { var k = find(i); (groups[k] = groups[k] || []).push(u); });
  var mods = Object.keys(groups).map(function (k) {
    var us = groups[k], m = { kind: us[0].kind, parts: [], tris: [], box: box() };
    us.forEach(function (u) { m.parts.push(u.name); m.tris = m.tris.concat(u.tris); merge(m.box, u.box); });
    return m;
  });

  /* Sockets: every contact with a different module. */
  mods.forEach(function (m) {
    m.sockets = [];
    mods.forEach(function (o) {
      if (o === m || !touch(m.box, o.box, eps)) return;
      var ov = box();
      for (var ax = 0; ax < 3; ax++) {
        ov.min[ax] = Math.max(m.box.min[ax], o.box.min[ax]);
        ov.max[ax] = Math.min(m.box.max[ax], o.box.max[ax]);
      }
      var mc = centre(m.box), oc = centre(o.box), sz = size(m.box);
      /* Face normal: the axis along which the neighbour sits furthest out,
       * measured relative to this module's own half-size. */
      var bestAx = 0, bestV = -Infinity;
      for (var ax2 = 0; ax2 < 3; ax2++) {
        var v = Math.abs(oc[ax2] - mc[ax2]) / Math.max(sz[ax2] / 2, 1e-9);
        if (v > bestV) { bestV = v; bestAx = ax2; }
      }
      var nrm = [0, 0, 0]; nrm[bestAx] = oc[bestAx] >= mc[bestAx] ? 1 : -1;
      var at = [0,1,2].map(function (ax3) {
        var lo = Math.min(ov.min[ax3], ov.max[ax3]), hi = Math.max(ov.min[ax3], ov.max[ax3]);
        return (lo + hi) / 2;
      });
      at[bestAx] = nrm[bestAx] > 0 ? m.box.max[bestAx] : m.box.min[bestAx];
      m.sockets.push({ at: at, normal: nrm, to: o.kind });
    });
  });
  return { mods: mods, span: S };
}

/* ---- GLB out ------------------------------------------------------------ */
function writeGlb(file, tris, materials, origin) {
  /* One primitive per source material, vertices shared per primitive only
   * by position (welded on exact float match). */
  var byMat = {};
  tris.forEach(function (t) { var k = t[3] === undefined ? -1 : t[3]; (byMat[k] = byMat[k] || []).push(t); });
  var bufs = [], views = [], accs = [], prims = [], mats = [], matMap = {}, off = 0;
  function push(buf, target) {
    var pad = (4 - (buf.length % 4)) % 4;
    views.push({ buffer: 0, byteOffset: off, byteLength: buf.length, target: target });
    bufs.push(buf); if (pad) bufs.push(Buffer.alloc(pad));
    off += buf.length + pad; return views.length - 1;
  }
  Object.keys(byMat).forEach(function (k) {
    var list = byMat[k], vmap = {}, verts = [], idx = [];
    list.forEach(function (t) {
      for (var c = 0; c < 3; c++) {
        var p = [t[c][0] - origin[0], t[c][1] - origin[1], t[c][2] - origin[2]];
        var key = p[0].toFixed(5) + ',' + p[1].toFixed(5) + ',' + p[2].toFixed(5);
        if (vmap[key] === undefined) { vmap[key] = verts.length; verts.push(p); }
        idx.push(vmap[key]);
      }
    });
    var pb = Buffer.alloc(verts.length * 12), b = box();
    verts.forEach(function (p, i) { pb.writeFloatLE(p[0], i*12); pb.writeFloatLE(p[1], i*12+4); pb.writeFloatLE(p[2], i*12+8); grow(b, p); });
    var big = verts.length > 65535;
    var ib = Buffer.alloc(idx.length * (big ? 4 : 2));
    idx.forEach(function (v, i) { if (big) ib.writeUInt32LE(v, i*4); else ib.writeUInt16LE(v, i*2); });
    var pv = push(pb, 34962), iv = push(ib, 34963);
    accs.push({ bufferView: pv, componentType: 5126, count: verts.length, type: 'VEC3', min: b.min, max: b.max });
    accs.push({ bufferView: iv, componentType: big ? 5125 : 5123, count: idx.length, type: 'SCALAR' });
    var prim = { attributes: { POSITION: accs.length - 2 }, indices: accs.length - 1, mode: 4 };
    if (+k >= 0 && materials[+k]) {
      if (matMap[k] === undefined) { matMap[k] = mats.length; mats.push(stripTextures(materials[+k])); }
      prim.material = matMap[k];
    }
    prims.push(prim);
  });
  var json = {
    asset: { version: '2.0', generator: 'Manifest chop-modules.cjs' },
    scene: 0, scenes: [{ nodes: [0] }],
    nodes: [{ name: path.basename(file, '.glb'), mesh: 0 }],
    meshes: [{ primitives: prims }],
    accessors: accs, bufferViews: views,
    buffers: [{ byteLength: off }]
  };
  if (mats.length) json.materials = mats;
  var bin = Buffer.concat(bufs);
  var js = Buffer.from(JSON.stringify(json), 'utf8');
  var jpad = (4 - (js.length % 4)) % 4;
  js = Buffer.concat([js, Buffer.alloc(jpad, 0x20)]);
  var head = Buffer.alloc(12); head.write('glTF', 0, 'ascii'); head.writeUInt32LE(2, 4);
  head.writeUInt32LE(12 + 8 + js.length + 8 + bin.length, 8);
  var jh = Buffer.alloc(8); jh.writeUInt32LE(js.length, 0); jh.write('JSON', 4, 'ascii');
  var bh = Buffer.alloc(8); bh.writeUInt32LE(bin.length, 0); bh.write('BIN\0', 4, 'ascii');
  fs.writeFileSync(file, Buffer.concat([head, jh, js, bh, bin]));
}
function stripTextures(m) {
  var c = JSON.parse(JSON.stringify(m));
  if (c.pbrMetallicRoughness) { delete c.pbrMetallicRoughness.baseColorTexture; delete c.pbrMetallicRoughness.metallicRoughnessTexture; }
  delete c.normalTexture; delete c.occlusionTexture; delete c.emissiveTexture;
  return c;
}
function hexOf(g, idx) {
  var m = ((g.json.materials || [])[idx]) || {};
  var pbr = m.pbrMetallicRoughness || {};
  var em = m.emissiveFactor || [0, 0, 0];
  var c = (em[0] + em[1] + em[2]) > 0.25 ? em : (pbr.baseColorFactor || [0.72, 0.75, 0.8, 1]);
  return '#' + c.slice(0, 3).map(function (v) {
    return ('0' + Math.max(0, Math.min(255, Math.round(Math.pow(v, 1 / 2.2) * 255))).toString(16)).slice(-2);
  }).join('');
}

/* ---- geometry fingerprint for dedupe ------------------------------------ */
function shapeKey(tris, g, origin, S) {
  var q = S / 2000, lines = tris.map(function (t) {
    var col = hexOf(g, t[3]);
    var ps = [t[0], t[1], t[2]].map(function (p) {
      return [0,1,2].map(function (a) { return Math.round((p[a] - origin[a]) / q); }).join(',');
    }).sort();
    return ps.join(';') + '|' + col;
  }).sort();
  return crypto.createHash('sha1').update(lines.join('\n')).digest('hex').slice(0, 16);
}

/* Rotation- and mirror-invariant: the sorted distances of every vertex
 * from the module's centroid, at 1/200 of its size, with its colours. Ring
 * berths are the same berth turned around the hub; this says so. */
function shapeFamily(tris, g, form) {
  var n = 0, c = [0, 0, 0];
  tris.forEach(function (t) { for (var k = 0; k < 3; k++) for (var a = 0; a < 3; a++) c[a] += t[k][a]; n += 3; });
  c = c.map(function (v) { return v / n; });
  var d = [], mx = 1e-9;
  tris.forEach(function (t) { for (var k = 0; k < 3; k++) { var r = Math.hypot(t[k][0]-c[0], t[k][1]-c[1], t[k][2]-c[2]); d.push(r); if (r > mx) mx = r; } });
  d = d.map(function (r) { return Math.round(r / mx * 200); }).sort(function (a, b) { return a - b; });
  var cols = Array.from(new Set(tris.map(function (t) { return hexOf(g, t[3]); }))).sort();
  /* `form` drops colour and absolute size: the navy, Syndicate and civil
   * paint of one berth, at s/m/l, are one FORM. */
  var s = form ? tris.length + '|' + d.join(',') : tris.length + '|' + Math.round(mx * 100) + '|' + d.join(',') + '|' + cols.join(',');
  return crypto.createHash('sha1').update(s).digest('hex').slice(0, 12);
}

/* ---- run ---------------------------------------------------------------- */
function main() {
  fs.rmSync(path.join(OUT, 'glb'), { recursive: true, force: true });   // our own output only
  fs.mkdirSync(path.join(OUT, 'glb'), { recursive: true });
  var catalog = { generated: new Date().toISOString(), sources: SRC.map(function (d) { return path.relative(ROOT, d); }), modules: [] };
  var byKey = {}, preview = [], counts = {}, nFiles = 0, shapeCount = {};
  SRC.forEach(function (dir) {
    var from = /ports/i.test(dir) ? 'port' : 'ship';
    fs.readdirSync(dir).filter(function (f) { return /\.glb$/i.test(f) && !SKIP_FILE_RE.test(f); }).sort().forEach(function (f) {
      var file = path.join(dir, f);
      var model;
      try { model = readModel(file); } catch (e) { console.warn('skip ' + f + ': ' + e.message); return; }
      nFiles++;
      var ch = chop(model);
      var stem = f.replace(/\.glb$/i, '').replace(/[^A-Za-z0-9_-]+/g, '');
      ch.mods.forEach(function (m) {
        if (m.kind === 'terrain') return;          // the ground is not a module
        var c = centre(m.box);
        /* Origin: centre in x/z, BOTTOM in y — a module sits on what it is
         * bolted to, so its base is the natural pivot. */
        var origin = [c[0], m.box.min[1], c[2]];
        var key = shapeKey(m.tris, model.g, origin, ch.span);
        var src = { model: path.relative(ROOT, file).replace(/\\/g, '/'), parts: m.parts.length };
        if (byKey[key]) { byKey[key].sources.push(src); return; }
        counts[m.kind] = (counts[m.kind] || 0) + 1;
        var id = m.kind + '-' + stem + '-' + String(counts[m.kind]).padStart(3, '0');
        var sz = size(m.box);
        var entry = {
          id: id, kind: m.kind, from: from, key: key, shape: shapeFamily(m.tris, model.g), form: shapeFamily(m.tris, model.g, true),
          tris: m.tris.length,
          size: sz.map(function (v) { return +v.toFixed(3); }),
          relSize: +(Math.max.apply(null, sz) / ch.span).toFixed(3),
          parts: m.parts.slice(0, 24).concat(m.parts.length > 24 ? ['…+' + (m.parts.length - 24)] : []),
          sockets: m.sockets.map(function (s) {
            return { at: s.at.map(function (v, a) { return +(v - origin[a]).toFixed(3); }), normal: s.normal, to: s.to };
          }),
          colours: Array.from(new Set(m.tris.map(function (t) { return hexOf(model.g, t[3]); }))).slice(0, 8),
          sources: [src],
          file: 'glb/' + id + '.glb'
        };
        writeGlb(path.join(OUT, entry.file), m.tris, model.g.json.materials || [], origin);
        byKey[key] = entry;
        catalog.modules.push(entry);
        /* The contact sheet carries one mesh per SHAPE (poses share it), or
         * the page runs to tens of megabytes. */
        shapeCount[entry.form] = (shapeCount[entry.form] || 0) + 1;
        if (shapeCount[entry.form] === 1) preview.push(previewMesh(entry, m.tris, model.g, origin));
      });
      process.stdout.write('.');
    });
  });
  catalog.counts = counts;
  fs.writeFileSync(path.join(OUT, 'modules.json'), JSON.stringify(catalog, null, 1));
  preview.forEach(function (p) { p.poses = shapeCount[p.sh]; });
  writeViewer(path.join(OUT, 'index.html'), preview);
  console.log('\n' + nFiles + ' models -> ' + catalog.modules.length + ' unique modules in ' + OUT);
  Object.keys(counts).sort().forEach(function (k) { console.log('  ' + k + ': ' + counts[k]); });
}

/* A light mesh for the contact sheet: decimated to ≤ 1500 tris by keeping
 * the largest faces, unit-scaled, 2 decimals. */
function previewMesh(entry, tris, g, origin) {
  var sz = Math.max.apply(null, entry.size.concat([1e-9]));
  var list = tris.map(function (t) {
    var e1 = [0,1,2].map(function (a) { return t[1][a] - t[0][a]; });
    var e2 = [0,1,2].map(function (a) { return t[2][a] - t[0][a]; });
    var cx = e1[1]*e2[2]-e1[2]*e2[1], cy = e1[2]*e2[0]-e1[0]*e2[2], cz = e1[0]*e2[1]-e1[1]*e2[0];
    return { t: t, area: cx*cx + cy*cy + cz*cz };
  });
  if (list.length > 400) list.sort(function (a, b) { return b.area - a.area; }), list = list.slice(0, 400);
  var cols = [], ci = {};
  var f = list.map(function (o) {
    var h = hexOf(g, o.t[3]);
    if (ci[h] === undefined) { ci[h] = cols.length; cols.push(h); }
    return [o.t[0], o.t[1], o.t[2]].map(function (p) {
      return [0,1,2].map(function (a) { return Math.round((p[a] - origin[a]) / sz * 100); });
    }).concat([ci[h]]);
  });
  return { id: entry.id, kind: entry.kind, from: entry.from, sh: entry.form, n: entry.sources.length, s: entry.sockets.length, c: cols, f: f,
           k: entry.sockets.map(function (s) { return s.at.map(function (v) { return Math.round(v / sz * 100); }).concat([s.to]); }) };
}

function writeViewer(file, data) {
  var html = '<!doctype html><meta charset="utf-8"><title>Station modules</title>\n' +
'<style>body{background:#0b0e14;color:#cfd6e4;font:13px system-ui;margin:16px}h1{font-size:18px}' +
'#bar{position:sticky;top:0;background:#0b0e14;padding:8px 0;z-index:2}button{background:#1b2230;color:#cfd6e4;border:1px solid #2c3648;border-radius:4px;margin:2px;padding:4px 8px;cursor:pointer}' +
'button.on{background:#3a5a8c}#grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px}' +
'.c{background:#121722;border:1px solid #232b3a;border-radius:6px;padding:6px}.c canvas{width:100%;height:auto;display:block}.c b{font-size:11px;word-break:break-all}.c i{color:#8aa0c0;font-style:normal;font-size:11px}</style>\n' +
'<h1>Station modules <span id=n></span></h1><div id=bar></div><div id=grid></div>\n' +
'<script>var D=' + JSON.stringify(data) + ';\n' +
'var kinds=["all"].concat(Array.from(new Set(D.map(function(d){return d.kind}))).sort()),cur="all",yaw=0.7;\n' +
'var bar=document.getElementById("bar");kinds.forEach(function(k){var b=document.createElement("button");b.textContent=k+" ("+(k=="all"?D.length:D.filter(function(d){return d.kind==k}).length)+")";b.onclick=function(){cur=k;[].forEach.call(bar.children,function(x){x.className=""});b.className="on";draw()};bar.appendChild(b)});bar.firstChild.className="on";\n' +
'function rot(p){var c=Math.cos(yaw),s=Math.sin(yaw),x=p[0]*c-p[2]*s,z=p[0]*s+p[2]*c,y=p[1];var e=0.5,ce=Math.cos(e),se=Math.sin(e);return[x,y*ce-z*se,y*se+z*ce]}\n' +
'function shade(h,k){var r=parseInt(h.substr(1,2),16),g=parseInt(h.substr(3,2),16),b=parseInt(h.substr(5,2),16);return"rgb("+Math.round(r*k)+","+Math.round(g*k)+","+Math.round(b*k)+")"}\n' +
'function paint(cv,d){var x=cv.getContext("2d"),W=cv.width,H=cv.height;x.fillStyle="#0e131c";x.fillRect(0,0,W,H);var fs=d.f.map(function(f){var a=rot(f[0]),b=rot(f[1]),c=rot(f[2]);return{a:a,b:b,c:c,z:(a[2]+b[2]+c[2])/3,col:d.c[f[3]]}});\n' +
' var mn=[1e9,1e9],mx=[-1e9,-1e9];fs.forEach(function(o){[o.a,o.b,o.c].forEach(function(p){mn[0]=Math.min(mn[0],p[0]);mn[1]=Math.min(mn[1],p[1]);mx[0]=Math.max(mx[0],p[0]);mx[1]=Math.max(mx[1],p[1])})});\n' +
' var sc=0.85*Math.min(W/(mx[0]-mn[0]||1),H/(mx[1]-mn[1]||1)),ox=W/2-sc*(mn[0]+mx[0])/2,oy=H/2+sc*(mn[1]+mx[1])/2;function P(p){return[ox+sc*p[0],oy-sc*p[1]]}\n' +
' fs.sort(function(a,b){return b.z-a.z});fs.forEach(function(o){var u=[o.b[0]-o.a[0],o.b[1]-o.a[1],o.b[2]-o.a[2]],v=[o.c[0]-o.a[0],o.c[1]-o.a[1],o.c[2]-o.a[2]];var n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];var l=Math.hypot(n[0],n[1],n[2])||1;var k=0.35+0.65*Math.abs((n[0]*0.4+n[1]*0.7-n[2]*0.6)/l);\n' +
'  var A=P(o.a),B=P(o.b),C=P(o.c);x.beginPath();x.moveTo(A[0],A[1]);x.lineTo(B[0],B[1]);x.lineTo(C[0],C[1]);x.closePath();x.fillStyle=shade(o.col,k);x.fill();x.strokeStyle=x.fillStyle;x.lineWidth=0.5;x.stroke()});\n' +
' d.k.forEach(function(s){var p=P(rot(s));x.fillStyle="#ff4fa3";x.beginPath();x.arc(p[0],p[1],3,0,7);x.fill()})}\n' +
'var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting&&!e.target._done){e.target._done=1;paint(e.target,e.target._d)}})},{rootMargin:"300px"});\n' +
'function draw(){var g=document.getElementById("grid");g.innerHTML="";var L=D.filter(function(d){return cur=="all"||d.kind==cur});document.getElementById("n").textContent="— "+L.length+" shown";\n' +
' L.forEach(function(d){var c=document.createElement("div");c.className="c";var cv=document.createElement("canvas");cv.width=320;cv.height=220;c.appendChild(cv);c.insertAdjacentHTML("beforeend","<b>"+d.id+"</b><br><i>"+d.kind+" · "+d.from+" · "+d.f.length+" tris · "+d.s+" sockets · in "+d.n+" model(s)"+(d.poses>1?" · "+d.poses+" copies (pose/paint/size)":"")+"</i>");g.appendChild(c);io.observe(cv);cv._d=d;\n' +
'  cv.onmousemove=function(e){yaw=(e.offsetX/cv.clientWidth)*6.28;paint(cv,d)};cv.onmouseleave=function(){yaw=0.7;paint(cv,d)}})}draw();</script>\n';
  fs.writeFileSync(file, html);
}

if (require.main === module) main();
module.exports = { kindOf: kindOf, readModel: readModel, chop: chop, FAMILIES: FAMILIES };
