/* port-sites.cjs — where a ground port's city may stand.
 *
 *     node tools/port-sites.cjs            -> src/port-sites.js
 *
 * Astra, 2026-10-24: "randomize the location of the city portion and the
 * domes on those ports, without putting them on the landing apron or the
 * door to get some more variety."
 *
 * The city sites (pad-city-site, runway-city-site) carry their settlement
 * as one node, `city`: habitat and farm domes, the tubes between them, a
 * water tank, sheds, solar panels and a mast, on a slab of its own. The
 * game's copy of a model is one triangle list with no names left in it, so
 * this reads the source .glb and writes down, per model, in the game's
 * PORT units (src/ports frame, +z up):
 *
 *   city   the city's box: render.js lifts the triangles inside it out of
 *          the port and draws them wherever this port's seed puts them
 *   keep   2D boxes nothing of the city may cover: every part of the site
 *          that stands above the ground, except the ground cover itself
 *          (plates, the site apron, terrain cover) and the city
 *   land   the landing surface (the pad, or the runway) and the doors in
 *          the ground: kept clear by a wider margin
 *   strip  a runway's box, so its approach and climb-out stay clear too
 *
 * Underground parts (the deck, the hangar, the berths) are left out: the
 * city can stand over a hangar, it cannot stand in a doorway.
 */
'use strict';
var fs = require('fs');
var path = require('path');
var ROOT = path.join(__dirname, '..');
global.window = global.window || global;
require(path.join(ROOT, 'src', 'ports.js'));
var Lib = global.PortLib;

var GROUND = /^(surfacePlate\d*|surfaceApron\d*|surfaceDecal\d+|terrainCover\w*|cityApron)$/;
var LAND = /^(padOutline|padOutlineInner|transferLiftCarPad|stripBed|stripPlinth)$/;
var DOOR = /Door$|^portal$|^ramp/;
var ABOVE = 0.001;      // a part reaching higher than this (port units) stands on the site

function mat(nd) {
  if (nd.matrix) return nd.matrix.slice();
  var t = nd.translation || [0, 0, 0], r = nd.rotation || [0, 0, 0, 1], s = nd.scale || [1, 1, 1];
  var x = r[0], y = r[1], z = r[2], w = r[3];
  return [(1 - 2*(y*y + z*z)) * s[0], (2*(x*y + z*w)) * s[0], (2*(x*z - y*w)) * s[0], 0,
          (2*(x*y - z*w)) * s[1], (1 - 2*(x*x + z*z)) * s[1], (2*(y*z + x*w)) * s[1], 0,
          (2*(x*z + y*w)) * s[2], (2*(y*z - x*w)) * s[2], (1 - 2*(x*x + y*y)) * s[2], 0,
          t[0], t[1], t[2], 1];
}
function mul(a, b) {
  var o = new Array(16);
  for (var c = 0; c < 4; c++) for (var r = 0; r < 4; r++) {
    var s = 0; for (var k = 0; k < 4; k++) s += a[k*4 + r] * b[c*4 + k]; o[c*4 + r] = s;
  }
  return o;
}
function xf(m, p) { return [m[0]*p[0] + m[4]*p[1] + m[8]*p[2] + m[12], m[1]*p[0] + m[5]*p[1] + m[9]*p[2] + m[13], m[2]*p[0] + m[6]*p[1] + m[10]*p[2] + m[14]]; }
function r4(v) { return Math.round(v * 10000) / 10000; }

function site(id) {
  var lib = Lib[id], mpu = lib.metresPerUnit, org = lib.origin || [0, 0, 0];
  var file = path.join(ROOT, 'ref', 'ports', id + '.glb');
  if (!fs.existsSync(file)) return null;
  var buf = fs.readFileSync(file);
  var J = JSON.parse(buf.slice(20, 20 + buf.readUInt32LE(12)).toString('utf8'));
  function toPort(g) { return [(g[0] - org[0]) / mpu, (-g[2] - org[1]) / mpu, (g[1] - org[2]) / mpu]; }
  /* boxes of every node, and who its parent is */
  var boxes = {}, parent = {};
  function walk(i, M, par) {
    var nd = J.nodes[i], W = mul(M, mat(nd)), box = null;
    parent[i] = par;
    function grow(p) { if (!box) box = { min: p.slice(), max: p.slice() }; for (var a = 0; a < 3; a++) { if (p[a] < box.min[a]) box.min[a] = p[a]; if (p[a] > box.max[a]) box.max[a] = p[a]; } }
    if (nd.mesh !== undefined) J.meshes[nd.mesh].primitives.forEach(function (pr) {
      var A = J.accessors[pr.attributes.POSITION], mn = A.min, mx = A.max;
      for (var c = 0; c < 8; c++) grow(toPort(xf(W, [c & 1 ? mx[0] : mn[0], c & 2 ? mx[1] : mn[1], c & 4 ? mx[2] : mn[2]])));
    });
    (nd.children || []).forEach(function (ch) { var b = walk(ch, W, i); if (b) { grow(b.min); grow(b.max); } });
    if (box) boxes[i] = box;
    return box;
  }
  var I = [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];
  var roots = J.scenes[J.scene || 0].nodes;
  roots.forEach(function (r) { walk(r, I, -1); });
  var cityIdx = -1;
  J.nodes.forEach(function (nd, i) { if (nd.name === 'city') cityIdx = i; });
  if (cityIdx < 0 || !boxes[cityIdx]) return null;
  /* the site's top level: the children of the node that holds the city */
  var top = J.nodes[parent[cityIdx]] ? J.nodes[parent[cityIdx]].children : roots;
  /* THE GROUND IS NOT AT ZERO in every size: the s, m and l models put the
   * site plate at different heights. Its top is the ground here. */
  var groundZ = -Infinity;
  top.forEach(function (i) {
    var nm = J.nodes[i].name || '';
    if (boxes[i] && /^(surfacePlate|surfaceApron|stripBed)$/.test(nm)) groundZ = Math.max(groundZ, boxes[i].max[2]);
  });
  if (!isFinite(groundZ)) groundZ = 0;
  var keep = [], land = [], strip = null;
  top.forEach(function (i) {
    var nd = J.nodes[i], b = boxes[i], name = nd.name || '';
    if (!b || i === cityIdx || GROUND.test(name)) return;
    var r = [r4(b.min[0]), r4(b.min[1]), r4(b.max[0]), r4(b.max[1])];
    /* the landing surface and the doors are kept clear however flat they
     * lie - a pad marking is level with the ground and still a pad */
    if (LAND.test(name) || DOOR.test(name)) { land.push(r); if (name === 'stripBed') strip = r; return; }
    if (b.max[2] <= groundZ + ABOVE) return;
    keep.push(r);
  });
  /* the unnamed groups (#n) are caution chips and the like, which belong
   * to whatever they stand beside: keep them as ordinary keep-outs, they
   * were already pushed above */
  var c = boxes[cityIdx];
  var out = {
    city: [r4(c.min[0]), r4(c.min[1]), r4(c.min[2]), r4(c.max[0]), r4(c.max[1]), r4(c.max[2])],
    keep: keep, land: land, strip: strip
  };
  /* ---- THE CITY'S PARTS (2026-10-24, second pass) ------------------------
   * Astra: the domes should "always have tubes that connect to a branch
   * point, a thicker tube, which goes directly into one of the faces of one
   * of the city buildings", and each dome stands on its own.
   *
   * The converter keeps the art's node order, so the city is one run of
   * triangles at the end of the model, leaf by leaf (checked on all six:
   * every leaf's slice lies inside that leaf's own box). So the parts are
   * written as a RUN LIST - [kind, triangles] in order - and render.js
   * slices them exactly, with no box test to get wrong where a tube runs
   * into a dome's porch:
   *   core       the slab, the tank, the sheds, the panels, the mast
   *   d<n>       one dome: shell, ring, porch, door, ports, crown, beds
   *   tube/roof/port   the art's own tubes, dropped when the domes move
   * and beside it what the network needs: each dome's centre, radius and
   * mouth (its porch door), the sheds as boxes (their faces are what a
   * trunk goes into), and the tube's section, measured off the art. */
  var leaves = [];
  (function list(i) {
    var nd = J.nodes[i];
    if (nd.mesh !== undefined) {
      var t = 0;
      J.meshes[nd.mesh].primitives.forEach(function (pr) {
        t += (pr.indices !== undefined ? J.accessors[pr.indices].count : J.accessors[pr.attributes.POSITION].count) / 3;
      });
      leaves.push({ i: i, name: nd.name || '', n: t, box: boxes[i] });
    }
    (nd.children || []).forEach(list);
  })(cityIdx);
  function kindOf(name) {
    var m = /^city(?:hab|agri)(\d+)/.exec(name);
    if (m) return 'd' + m[1];
    if (/^cityTubeRoof/.test(name)) return 'roof';
    if (/^cityTubePort/.test(name)) return 'port';
    if (/^cityTube\d/.test(name)) return 'tube';
    return 'core';
  }
  var runs = [];
  leaves.forEach(function (L) {
    var k = kindOf(L.name);
    if (runs.length && runs[runs.length - 1][0] === k) runs[runs.length - 1][1] += L.n;
    else runs.push([k, L.n]);
  });
  function grow(b, x) {
    if (!x) return b;
    if (!b) return { min: x.min.slice(), max: x.max.slice() };
    for (var a = 0; a < 3; a++) { b.min[a] = Math.min(b.min[a], x.min[a]); b.max[a] = Math.max(b.max[a], x.max[a]); }
    return b;
  }
  var domes = {}, core = null, sheds = {}, groundC = Infinity, stands = {};
  leaves.forEach(function (L) {
    var k = kindOf(L.name);
    if (k === 'core') core = grow(core, L.box);
    if (L.name === 'cityApron') groundC = L.box.max[2];
    /* the shed's WALLS, not its roof: a trunk goes into a wall, and the
     * eave is what it must stay under */
    var s = /^cityUtility(\d+)$/.exec(L.name);
    if (s) sheds[s[1]] = grow(sheds[s[1]], L.box);
    /* what stands on the slab, grouped by what it is: a tube or a dome
     * must go round these */
    if (k === 'core' && !/Apron|Decal/.test(L.name)) {
      var g = L.name.replace(/^city/, '').replace(/(Roof|Band|Leg|Beacon)?\d*$/, '').replace(/Roof$/, '') +
              (/^city(Utility|SolarPanel|SolarLeg)/.test(L.name) ? (/(\d+)$/.exec(L.name) || ['', ''])[1] : '');
      stands[g] = grow(stands[g], L.box);
    }
    if (k[0] === 'd') {
      var d = domes[k] || (domes[k] = { box: null, ring: null, door: null });
      d.box = grow(d.box, L.box);
      if (/Ring$/.test(L.name)) d.ring = L.box;
      if (/VestibuleDoor$/.test(L.name)) d.door = L.box;
    }
  });
  var dl = Object.keys(domes).sort().map(function (k) {
    var d = domes[k], rb = d.ring || d.box;
    var cx = (rb.min[0] + rb.max[0]) / 2, cy = (rb.min[1] + rb.max[1]) / 2;
    var r = Math.max(rb.max[0] - rb.min[0], rb.max[1] - rb.min[1]) / 2;
    var db = d.door;
    return { k: k, c: [r4(cx), r4(cy)], r: r4(r),
             /* everything of the dome, porch included, lies inside this */
             reach: r4(Math.max(Math.abs(d.box.min[0] - cx), Math.abs(d.box.max[0] - cx), Math.abs(d.box.min[1] - cy), Math.abs(d.box.max[1] - cy)) * Math.SQRT2),
             mouth: [r4((db.min[0] + db.max[0]) / 2), r4((db.min[1] + db.max[1]) / 2), r4(db.min[2]), r4(db.max[2])] };
  });
  /* the tube's section: its node's own axes, scaled */
  var tubeLeaf = leaves.filter(function (L) { return /^cityTube\d$/.test(L.name); })[0];
  var section = null;
  if (tubeLeaf) {
    var nd = J.nodes[tubeLeaf.i], A = J.accessors[J.meshes[nd.mesh].primitives[0].attributes.POSITION];
    var Wm = (function world(i) { var m = mat(J.nodes[i]); var p = parent[i]; while (p !== undefined && p >= 0) { m = mul(mat(J.nodes[p]), m); p = parent[p]; } return m; })(tubeLeaf.i);
    var ext = [0, 1, 2].map(function (a) {
      var e = [0, 0, 0]; e[a] = A.max[a] - A.min[a];
      var o = xf(Wm, [0, 0, 0]), q = xf(Wm, e);
      return Math.hypot(q[0] - o[0], q[1] - o[1], q[2] - o[2]) / mpu;
    }).sort(function (a, b) { return a - b; });
    var roofLeaf = leaves.filter(function (L) { return /^cityTubeRoof\d$/.test(L.name); })[0];
    section = { w: r4(ext[1]), h: r4(tubeLeaf.box.max[2] - tubeLeaf.box.min[2]), z0: r4(tubeLeaf.box.min[2]),
                roof: roofLeaf ? r4(roofLeaf.box.max[2] - roofLeaf.box.min[2]) : 0, len: r4(ext[2]) };
  }
  out.runs = runs;
  out.core = [r4(core.min[0]), r4(core.min[1]), r4(core.min[2]), r4(core.max[0]), r4(core.max[1]), r4(core.max[2])];
  out.ground = r4(isFinite(groundC) ? groundC : c.min[2]);
  out.domes = dl;
  out.sheds = Object.keys(sheds).sort().map(function (k) { var b = sheds[k]; return [r4(b.min[0]), r4(b.min[1]), r4(b.min[2]), r4(b.max[0]), r4(b.max[1]), r4(b.max[2])]; });
  out.tube = section;
  out.stands = Object.keys(stands).sort().map(function (k) { var b = stands[k]; return [r4(b.min[0]), r4(b.min[1]), r4(b.max[0]), r4(b.max[1])]; });
  return out;
}

var out = {};
Object.keys(Lib).sort().forEach(function (id) {
  if (!/city-site/.test(id)) return;
  var s = site(id);
  if (!s) { console.log(id + ': no city node'); return; }
  out[id] = s;
  console.log(id + ': city ' + s.city.join(' ') + '  keep ' + s.keep.length + '  land/doors ' + s.land.length + (s.strip ? '  strip' : '') +
    '\n    runs ' + s.runs.map(function (r) { return r[0] + ':' + r[1]; }).join(' ') +
    '\n    domes ' + s.domes.map(function (d) { return d.k + ' r' + d.r + ' reach' + d.reach; }).join(', ') + '  sheds ' + s.sheds.length +
    '  tube ' + JSON.stringify(s.tube) + '  ground ' + s.ground);
});
var file = path.join(ROOT, 'src', 'port-sites.js');
fs.writeFileSync(file,
  '/* GENERATED by tools/port-sites.cjs from ref/ports/*.glb: where a city\n' +
  ' * site\'s settlement stands and what it must keep clear of, in port units.\n' +
  ' * city [x0 y0 z0 x1 y1 z1]; keep / land / strip [x0 y0 x1 y1]. */\n' +
  '(function (g) { g.PortSites = ' + JSON.stringify(out) + ';\n' +
  '  if (typeof module !== "undefined" && module.exports) module.exports = g.PortSites;\n' +
  '})(typeof window !== "undefined" ? window : globalThis);\n');
console.log('-> ' + path.relative(ROOT, file) + ' (' + Math.round(fs.statSync(file).size / 1024) + ' KB)');
