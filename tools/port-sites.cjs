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
  return {
    city: [r4(c.min[0]), r4(c.min[1]), r4(c.min[2]), r4(c.max[0]), r4(c.max[1]), r4(c.max[2])],
    keep: keep, land: land, strip: strip
  };
}

var out = {};
Object.keys(Lib).sort().forEach(function (id) {
  if (!/city-site/.test(id)) return;
  var s = site(id);
  if (!s) { console.log(id + ': no city node'); return; }
  out[id] = s;
  console.log(id + ': city ' + s.city.join(' ') + '  keep ' + s.keep.length + '  land/doors ' + s.land.length + (s.strip ? '  strip' : ''));
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
