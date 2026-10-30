/* growth-points.cjs — where a port can grow, worked out from what the port
 * already knows.
 *
 *     node tools/growth-points.cjs [portId ...]      -> src/growth-points.js
 *
 * Astra, 2026-10-19: "We keep our pathing. Berths are added on to existing,
 * known paths, and computed from there." So a growth point is never a guess
 * at the hull: it is a place ON A BERTH ROUTE the converter already found
 * (src/ports.js, each berth's `via`), from which a straight neck can go out
 * through the wall into open space with room for an add-on beyond it.
 *
 * For each route segment, every so often along it, and for each of the six
 * axis directions that is not along the segment:
 *   - cast a ray out; the LAST surface it crosses is where the wall ends,
 *     and that is the growth point (`at`), facing `normal`;
 *   - the neck runs from the route point (`from`) to `at`; too long a neck
 *     means the route is buried deep in the station, and it is refused;
 *   - beyond `at`, a bundle of five parallel rays must find nothing for a
 *     module's length: the add-on needs somewhere to be;
 *   - nothing within a door's width of a berth mouth: growth never blocks
 *     a way in.
 * The point carries the biggest class whose routes use that segment, since
 * size passes outward: an add-on on an S/M-only corridor cannot hold an L
 * berth. Points closer than SPACING (same facing) collapse to one.
 *
 * Everything is in PORT units (game axes, +z up), the same frame as the
 * berths, so src/growth.js can use the points beside them directly.
 * Ground ports never grow downward.
 */
'use strict';
var fs = require('fs');
var path = require('path');

var ROOT = path.join(__dirname, '..');
global.window = global.window || global;
require(path.join(ROOT, 'src', 'ports.js'));
var Lib = global.PortLib;

/* Fractions of the port's half-span (an orbital port's half-span is 1). */
var STEP = 0.06;        // sample spacing along a route
var NECK_MAX = 0.45;    // longest neck through structure
var FREE = 0.18;        // open space needed beyond the wall (the real room is measured, roomAt)
var SIDE = 0.06;        // half-width of that open space
var MOUTH = 0.10;       // keep clear of berth mouths
var SPACING = 0.14;     // two points with one facing closer than this are one
var DIRS = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];

function sub(a, b) { return [a[0]-b[0], a[1]-b[1], a[2]-b[2]]; }
function add(a, b) { return [a[0]+b[0], a[1]+b[1], a[2]+b[2]]; }
function mul(a, s) { return [a[0]*s, a[1]*s, a[2]*s]; }
function dot(a, b) { return a[0]*b[0] + a[1]*b[1] + a[2]*b[2]; }
function cross(a, b) { return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]]; }
function len(a) { return Math.sqrt(dot(a, a)); }
function r3(v) { return Math.round(v * 1000) / 1000; }

/* ---- a uniform grid over the triangles, for rays ------------------------ */
function buildGrid(d) {
  var V = d.v, F = d.f, N = 48;
  var mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  V.forEach(function (p) { for (var a = 0; a < 3; a++) { if (p[a] < mn[a]) mn[a] = p[a]; if (p[a] > mx[a]) mx[a] = p[a]; } });
  var cs = [0,1,2].map(function (a) { return Math.max((mx[a] - mn[a]) / N, 1e-6); });
  var cells = new Map();
  function key(i, j, k) { return (i * N + j) * N + k; }
  function cell(p, a) { return Math.max(0, Math.min(N - 1, Math.floor((p - mn[a]) / cs[a]))); }
  F.forEach(function (f, t) {
    var a = V[f[0]], b = V[f[1]], c = V[f[2]];
    var lo = [0,1,2].map(function (x) { return cell(Math.min(a[x], b[x], c[x]), x); });
    var hi = [0,1,2].map(function (x) { return cell(Math.max(a[x], b[x], c[x]), x); });
    for (var i = lo[0]; i <= hi[0]; i++) for (var j = lo[1]; j <= hi[1]; j++) for (var k = lo[2]; k <= hi[2]; k++) {
      var kk = key(i, j, k), l = cells.get(kk);
      if (!l) cells.set(kk, l = []);
      l.push(t);
    }
  });
  var half = Math.max((mx[0]-mn[0]) / 2, (mx[1]-mn[1]) / 2, (mx[2]-mn[2]) / 2);
  return { V: V, F: F, N: N, mn: mn, mx: mx, cs: cs, cells: cells, key: key, cell: cell, half: half };
}
/* Every hit distance along a ray, up to maxT. Marches cell by cell at a
 * third of the smallest cell size, testing each triangle once. */
function hits(g, o, d, maxT) {
  var out = [], seen = new Set(), step = Math.min(g.cs[0], g.cs[1], g.cs[2]) / 3, lastKey = -1;
  for (var t = 0; t <= maxT + step; t += step) {
    var p = add(o, mul(d, t));
    if (p[0] < g.mn[0] || p[1] < g.mn[1] || p[2] < g.mn[2] || p[0] > g.mx[0] || p[1] > g.mx[1] || p[2] > g.mx[2]) {
      if (t > 0 && (p[0] < g.mn[0] - step || p[1] < g.mn[1] - step || p[2] < g.mn[2] - step ||
                    p[0] > g.mx[0] + step || p[1] > g.mx[1] + step || p[2] > g.mx[2] + step) &&
          dot(d, sub(p, o)) > 0 && outside(g, p, d)) break;
      continue;
    }
    var kk = g.key(g.cell(p[0], 0), g.cell(p[1], 1), g.cell(p[2], 2));
    if (kk === lastKey) continue;
    lastKey = kk;
    var l = g.cells.get(kk);
    if (!l) continue;
    for (var i = 0; i < l.length; i++) {
      var tri = l[i];
      if (seen.has(tri)) continue;
      seen.add(tri);
      var f = g.F[tri], h = rayTri(o, d, g.V[f[0]], g.V[f[1]], g.V[f[2]]);
      if (h !== null && h > 1e-6 && h <= maxT) out.push(h);
    }
  }
  return out.sort(function (a, b) { return a - b; });
}
/* Leaving the box and heading further out: nothing more to hit. */
function outside(g, p, d) {
  for (var a = 0; a < 3; a++) {
    if (p[a] < g.mn[a] && d[a] <= 0) return true;
    if (p[a] > g.mx[a] && d[a] >= 0) return true;
  }
  return false;
}
function rayTri(o, d, a, b, c) {
  var e1 = sub(b, a), e2 = sub(c, a), p = cross(d, e2), det = dot(e1, p);
  if (Math.abs(det) < 1e-12) return null;
  var inv = 1 / det, s = sub(o, a), u = dot(s, p) * inv;
  if (u < 0 || u > 1) return null;
  var q = cross(s, e1), v = dot(d, q) * inv;
  if (v < 0 || u + v > 1) return null;
  return dot(e2, q) * inv;
}

/* ---- routes into segments ----------------------------------------------- */
function routeSegments(p) {
  var B = p.anchors && p.anchors.berths || [];
  var segs = new Map();
  var E = p.entrances || [];
  B.forEach(function (b) {
    /* Orbital: `via` from the L berth it enters through. Ground sites:
     * `doorVia` from an entrance (generate.js berthDoorRoute). */
    var pts;
    if (b.via && b.via.length) {
      var head = (b.entry !== undefined && B[b.entry]) ? [B[b.entry].mid] : [];
      pts = head.concat(b.via, [b.mid]);
    } else if (b.doorVia && b.doorVia.length && typeof b.door === 'number' && E[b.door] && E[b.door].mid) {
      pts = [E[b.door].mid].concat(b.doorVia, [b.mid]);
    } else return;
    for (var i = 0; i + 1 < pts.length; i++) {
      var k = pts[i].map(r3).join(',') + '>' + pts[i + 1].map(r3).join(',');
      var s = segs.get(k);
      if (!s) segs.set(k, s = { a: pts[i], b: pts[i + 1], cls: b.cls, berths: [] });
      if (b.cls === 'L') s.cls = 'L';
      s.berths.push(b.node);
    }
  });
  return Array.from(segs.values());
}

/* ROOM at a point: how far open space really goes, so growth.js can fit a
 * module to it instead of to a fixed allowance. [depth, +a, -a, +b, -b]:
 * depth outward (the least of five parallel rays a module-width apart),
 * then the clear distance to each side, measured from halfway out, along
 * the two axes that are not the normal (a before b, in x-y-z order).
 * Everything capped: ROOM_CAP of the half-span out, half that sideways. */
var ROOM_CAP = 0.8, ROOM_SIDE = 0.4;
function roomAt(g, at, dir, H) {
  var ax = dir[0] ? 0 : dir[1] ? 1 : 2, axes = [0, 1, 2].filter(function (a) { return a !== ax; });
  var depth = ROOM_CAP * H;
  var probe = [[0, 0]].concat([[1, 0], [-1, 0], [0, 1], [0, -1]]);
  probe.forEach(function (pq) {
    var o = at.slice();
    o[axes[0]] += pq[0] * 0.06 * H; o[axes[1]] += pq[1] * 0.06 * H;
    var h = hits(g, o, dir, depth);
    if (h.length) depth = Math.min(depth, h[0]);
  });
  var mid = add(at, mul(dir, Math.min(depth, 0.3 * H) / 2));
  var out = [depth];
  axes.forEach(function (a) {
    [1, -1].forEach(function (sg) {
      var e = [0, 0, 0]; e[a] = sg;
      var h = hits(g, mid, e, ROOM_SIDE * H);
      out.push(h.length ? h[0] : ROOM_SIDE * H);
    });
  });
  return out.map(r3);
}

/* SYMMETRY of the mesh itself, for the Union's mirrored sets: which of
 * the three mirrors and three half-turns carry the station onto itself
 * (named by the axes they negate). Two thousand sampled vertices; one
 * counts when 55% of them land within 4% of the half-span of a real
 * vertex - stations are symmetric in plan, not in every greeble. Read off the
 * geometry, not the growth points: the points are too ragged to agree. */
function symmetryOf(d, H) {
  var V = d.v, cell = 0.04 * H, grid = new Set();
  function k(p) { return Math.round(p[0] / cell) + ',' + Math.round(p[1] / cell) + ',' + Math.round(p[2] / cell); }
  V.forEach(function (p) { grid.add(k(p)); });
  function near(p) {
    var x = Math.round(p[0] / cell), y = Math.round(p[1] / cell), z = Math.round(p[2] / cell);
    for (var i = -1; i <= 1; i++) for (var j = -1; j <= 1; j++) for (var l = -1; l <= 1; l++)
      if (grid.has((x + i) + ',' + (y + j) + ',' + (z + l))) return true;
    return false;
  }
  var step = Math.max(1, Math.floor(V.length / 2000)), out = [];
  [['x', function (p) { return [-p[0], p[1], p[2]]; }],
   ['y', function (p) { return [p[0], -p[1], p[2]]; }],
   ['z', function (p) { return [p[0], p[1], -p[2]]; }],
   ['xy', function (p) { return [-p[0], -p[1], p[2]]; }],
   ['yz', function (p) { return [p[0], -p[1], -p[2]]; }],
   ['xz', function (p) { return [-p[0], p[1], -p[2]]; }]].forEach(function (m) {
    var n = 0, hit = 0;
    for (var i = 0; i < V.length; i += step) { n++; if (near(m[1](V[i]))) hit++; }
    if (n && hit / n >= 0.55) out.push(m[0]);
  });
  return out;
}

/* A port model: its mesh, its routes, its mouths, from src/ports. */
function pointsFor(id) {
  var p = Lib[id];
  var file = path.join(ROOT, 'src', 'ports', id + '.js');
  if (!p || !fs.existsSync(file)) return null;
  var B = p.anchors.berths || [];
  return pointsOf({
    d: require(file),
    segs: routeSegments(p),
    mouths: B.map(function (b) { return b.mid; })
      .concat((p.anchors.gates || []).map(function (q) { return q.mid; }).filter(Boolean)),
    /* Ground sites are filed as kind 'orbital' (they carry no portPad), so
     * "ground" is read off having entrances. */
    ground: p.kind === 'surface' || !!(p.entrances && p.entrances.length),
    doors: B.filter(function (b) { return !b.via && !b.doorVia && b.normal && b.mid; })
      .map(function (b) { return { mid: b.mid, normal: b.normal, cls: b.cls, node: b.node }; })
  });
}

/* ANY MESH (Astra, 2026-10-20: "growth points should exist for all
 * station types, not just the existing ones, so that custom stations can
 * be built"). A port core and a chopped module go through the same
 * function: {d: {v, f}, segs: route segments, mouths: points to keep
 * clear, ground, doors: berths with their own outer door}. A built
 * station's points are then the free points of every piece in it. */
function pointsOf(inp) {
  var d = inp.d, g = buildGrid(d), H = g.half;
  var segs = inp.segs || [], mouths = inp.mouths || [], ground = !!inp.ground;
  var found = [];
  segs.forEach(function (s) {
    var ab = sub(s.b, s.a), L = len(ab);
    if (L < 1e-9) return;
    var u = mul(ab, 1 / L);
    var n = Math.max(1, Math.floor(L / (STEP * H)));
    for (var i = 0; i <= n; i++) {
      var o = add(s.a, mul(ab, i / n));
      DIRS.forEach(function (dir) {
        if (Math.abs(dot(dir, u)) > 0.7) return;           // not along the corridor
        if (ground && dir[2] < 0) return;                   // never into the ground
        var hs = hits(g, o, dir, NECK_MAX * H + FREE * H * 2);
        var wall = hs.filter(function (t) { return t <= NECK_MAX * H; });
        var tE = wall.length ? wall[wall.length - 1] : 0;
        /* open space beyond the wall: the centre ray and four offsets */
        if (hs.some(function (t) { return t > tE + 1e-4 && t < tE + FREE * H; })) return;
        var side = Math.abs(dir[0]) ? [[0,1,0],[0,0,1]] : Math.abs(dir[1]) ? [[1,0,0],[0,0,1]] : [[1,0,0],[0,1,0]];
        var at = add(o, mul(dir, tE + 1e-3));
        for (var sI = 0; sI < 2; sI++) for (var sg = -1; sg <= 1; sg += 2) {
          var oo = add(at, mul(side[sI], sg * SIDE * H));
          if (hits(g, oo, dir, FREE * H).length) return;
        }
        if (mouths.some(function (m) { return len(sub(m, at)) < MOUTH * H; })) return;
        found.push({ at: at, normal: dir, from: o, neck: tE, cls: s.cls, berths: s.berths });
      });
    }
  });
  /* DOOR points (Astra, 2026-10-19: "outer doors can then become the doors
   * between the inside and outside of the NEXT add-on"). A berth reached
   * straight from space can have an add-on built over its mouth; the berth
   * is then reached through the add-on, so only a pass-through module may
   * go there, at least as big as the berth. Only where the space outside
   * the mouth is open, as for any other point. */
  var doors = [];
  (inp.doors || []).forEach(function (b) {
    var dir = b.normal;
    if (ground && dir[2] < -0.5) return;
    var at = add(b.mid, mul(dir, 0.01 * H));
    if (hits(g, at, dir, FREE * H).length) return;
    doors.push({ at: at, normal: dir, from: b.mid, neck: 0, cls: b.cls, berths: [b.node], door: true });
  });
  /* collapse near neighbours with the same facing; prefer the shorter neck */
  found.sort(function (a, b) { return a.neck - b.neck; });
  var kept = [];
  found.forEach(function (c) {
    if (kept.some(function (k) { return dot(k.normal, c.normal) > 0.99 && len(sub(k.at, c.at)) < SPACING * H; })) return;
    kept.push(c);
  });
  /* HULL points: for add-ons with no berth in them (tanks, radiators,
   * masts, habitat blocks) a route does not matter, only somewhere to
   * stand. Rays come in from outside on a 7x7 grid per face (3x3 on a module); the first
   * surface met, with clear space around it, is a point. This is also
   * what lets the farms and the comet, which have no modelled berths at
   * all, grow anything. */
  var hull = [];
  DIRS.forEach(function (dir) {
    if (ground && dir[2] < 0) return;
    var ax = dir[0] ? 0 : dir[1] ? 1 : 2, o1 = (ax + 1) % 3, o2 = (ax + 2) % 3;
    var NG = inp.hullGrid || 7;
    for (var i = 1; i <= NG; i++) for (var j = 1; j <= NG; j++) {
      var o = [0, 0, 0];
      o[ax] = dir[ax] > 0 ? g.mx[ax] + 0.05 * H : g.mn[ax] - 0.05 * H;
      o[o1] = g.mn[o1] + (g.mx[o1] - g.mn[o1]) * i / (NG + 1);
      o[o2] = g.mn[o2] + (g.mx[o2] - g.mn[o2]) * j / (NG + 1);
      var back = mul(dir, -1);
      var hs = hits(g, o, back, (g.mx[ax] - g.mn[ax]) + 0.1 * H);
      if (!hs.length) continue;
      var at = add(o, mul(back, hs[0] - 1e-3));
      var e1 = [0, 0, 0], e2 = [0, 0, 0]; e1[o1] = 1; e2[o2] = 1;
      var ok = true;
      for (var s1 = -1; s1 <= 1 && ok; s1 += 2) for (var s2 = 0; s2 < 2 && ok; s2++) {
        var oo = add(at, mul(s2 ? e2 : e1, s1 * SIDE * H));
        if (hits(g, oo, dir, FREE * H).length) ok = false;
      }
      if (!ok || mouths.some(function (m) { return len(sub(m, at)) < MOUTH * H; })) continue;
      if (hull.some(function (k) { return dot(k.normal, dir) > 0.99 && len(sub(k.at, at)) < SPACING * H; })) continue;
      hull.push({ at: at, normal: dir, from: at, neck: 0, cls: null, berths: [null], hull: true });
    }
  });
  kept = kept.concat(doors, hull);
  return {
    half: r3(H),
    box: { min: g.mn.map(r3), max: g.mx.map(r3) },
    ground: ground,
    sym: symmetryOf(d, H),
    points: kept.map(function (c, i) {
      var o = { i: i, at: c.at.map(r3), normal: c.normal, from: c.from.map(r3), neck: r3(c.neck), cls: c.cls,
                via: c.berths[0] };
      if (c.door) o.door = true;
      o.room = roomAt(g, c.at, c.normal, H);
      if (c.hull) { o.hull = true; delete o.from; delete o.neck; delete o.via; delete o.cls; }
      return o;
    })
  };
}

function main() {
  var ids = process.argv.slice(2);
  if (!ids.length) ids = Object.keys(Lib);
  var outFile = path.join(ROOT, 'src', 'growth-points.js');
  var old = {};
  if (fs.existsSync(outFile)) { global.GrowthPoints = undefined; require(outFile); old = global.GrowthPoints || {}; }
  var out = Object.assign({}, old);
  ids.forEach(function (id) {
    var t0 = Date.now(), r = pointsFor(id);
    if (!r) return;
    out[id] = r;
    var L = r.points.filter(function (q) { return q.cls === 'L'; }).length;
    console.log(id + ': ' + r.points.length + ' points (' + L + ' L) ' + (Date.now() - t0) + ' ms');
  });
  var keys = Object.keys(out).sort(), sorted = {};
  keys.forEach(function (k) { sorted[k] = out[k]; });
  fs.writeFileSync(outFile,
    '/* GENERATED by tools/growth-points.cjs from src/ports.js and src/ports/*.js.\n' +
    ' * Where each port can grow: points on its known berth routes, facing open\n' +
    ' * space, with the biggest class the route carries. Port units. */\n' +
    '(function (g) { g.GrowthPoints = ' + JSON.stringify(sorted) + ';\n' +
    '  if (typeof module !== "undefined" && module.exports) module.exports = g.GrowthPoints;\n' +
    '})(typeof window !== "undefined" ? window : globalThis);\n');
  console.log('-> ' + path.relative(ROOT, outFile) + ' (' + keys.length + ' ports)');
}
if (require.main === module) main();
module.exports = { pointsFor: pointsFor, pointsOf: pointsOf };
