/* fit-hulls.js — size every hull so her interior is inside her (2026-10-26).
 *
 *     node tools/fit-hulls.js            # writes src/hullfit.js
 *
 * Astra: "resize all ships to be large enough that you can climb into them
 * from the ramp, up and into a room which seals the ramp" and "if you have
 * to resize hulls to fit their interiors, do it."
 *
 * Every hull but the two with a conning tower was drawn 25 m long, and the
 * rooms shipdeck.js lays out for an L or XL hull run 25-60 m aft of her
 * cockpit — out through her tail into space. So, for each hull, this finds
 * the SMALLEST length at which every room of her plan, on every deck, sits
 * inside her own model, with the cockpit as far forward as it will go, and
 * records where the cockpit is in her and how far her deck stands above the
 * ground on her gear (the ramp's drop).
 *
 * "Inside" is tested the robust way for models that are not watertight: a
 * point is in the hull when there is hull both above it and below it in the
 * same vertical column. Every room is sampled on a half-metre grid at floor
 * and ceiling height; a room's corners may graze a chamfer (a 4% allowance),
 * its middle may not.
 *
 * The Capital and the Carrier keep their true lengths and their tower
 * bridges (render.js TRUE_LEN, BRIDGE); only their ramp's drop is measured.
 */
global.window = global.window || global;
var path = require('path'), fs = require('fs');
var SRC = path.join(__dirname, '..', 'src');
['vec3', 'rng', 'kepler', 'economy', 'generate', 'sim'].forEach(function (m) { require(path.join(SRC, m + '.js')); });
var Combat = require(path.join(SRC, 'combat.js'));
require(path.join(SRC, 'crew.js'));
require(path.join(SRC, 'hulls.js'));
require(path.join(SRC, 'walk.js'));
var SD = require(path.join(SRC, 'shipdeck.js'));
global.HullFit = {};            // fit from scratch: render.js must not read an old table
require(path.join(SRC, 'render.js'));
var R = global.Render;

/* ---- a column index over a unit-length mesh -------------------------- */
function columnIndex(mesh) {
  var N = 64, cells = [];
  for (var i = 0; i < N * N; i++) cells.push([]);
  var tris = [];
  mesh.f.forEach(function (f) {
    for (var k = 1; k + 1 < f.length; k++) {
      var a = mesh.v[f[0]], b = mesh.v[f[k]], c = mesh.v[f[k + 1]];
      var d = (b[2] - c[2]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[2] - c[2]);
      if (Math.abs(d) < 1e-12) continue;
      var t = { a: a, b: b, c: c, d: d };
      var id = tris.push(t) - 1;
      var x0 = Math.min(a[0], b[0], c[0]), x1 = Math.max(a[0], b[0], c[0]);
      var z0 = Math.min(a[2], b[2], c[2]), z1 = Math.max(a[2], b[2], c[2]);
      var cx0 = cell(x0), cx1 = cell(x1), cz0 = cell(z0), cz1 = cell(z1);
      for (var cx = cx0; cx <= cx1; cx++) for (var cz = cz0; cz <= cz1; cz++) cells[cz * N + cx].push(id);
    }
  });
  function cell(u) { return Math.max(0, Math.min(N - 1, Math.floor((u + 0.55) / 1.1 * N))); }
  return {
    hits: function (x, z) {
      var list = cells[cell(z) * N + cell(x)], ys = [];
      for (var i = 0; i < list.length; i++) {
        var t = tris[list[i]], a = t.a, b = t.b, c = t.c;
        var l1 = ((b[2] - c[2]) * (x - c[0]) + (c[0] - b[0]) * (z - c[2])) / t.d;
        if (l1 < 0 || l1 > 1) continue;
        var l2 = ((c[2] - a[2]) * (x - c[0]) + (a[0] - c[0]) * (z - c[2])) / t.d;
        var l3 = 1 - l1 - l2;
        if (l2 < 0 || l3 < 0) continue;
        ys.push(l1 * a[1] + l2 * b[1] + l3 * c[1]);
      }
      return ys;
    }
  };
}

/* Is the unit-space point (x, y, z) between hull above and hull below? */
function inside(ix, x, y, z) {
  var ys = ix.hits(x, z), above = false, below = false;
  for (var i = 0; i < ys.length; i++) { if (ys[i] > y) above = true; else below = true; }
  return above && below;
}

/* Every room of a plan, with the deck floor it stands on. */
function roomsOf(p) {
  if (!p.decks) return p.rooms.filter(function (r) { return r.walk !== false; }).map(function (r) { return { r: r, fy: p.floorY }; });
  var out = [];
  Object.keys(p.decks).forEach(function (k) {
    p.decks[k].rooms.forEach(function (r) { out.push({ r: r, fy: p.decks[k].floorY }); });
  });
  /* The tramway is ridden, not walked, and is not in a deck's rooms. */
  p.rooms.forEach(function (r) { if (r.walk === false) out.push({ r: r, fy: p.deckY ? p.deckY[r.deck] : p.floorY }); });
  return out;
}

/* Sample points for a plan, in the plan's metres. Each room: a grid at
 * the floor (+5 cm) and the ceiling (-5 cm); the middle ones `core`. */
function samples(p) {
  var pts = [];
  roomsOf(p).forEach(function (o) {
    var r = o.r, h = r.y1 || 2.3;
    var nx = Math.max(2, Math.ceil((r.x1 - r.x0) / 0.5)), nz = Math.max(2, Math.ceil((r.z1 - r.z0) / 0.5));
    for (var i = 0; i <= nx; i++) for (var j = 0; j <= nz; j++) {
      var x = r.x0 + 0.05 + (r.x1 - r.x0 - 0.1) * i / nx, z = r.z0 + 0.05 + (r.z1 - r.z0 - 0.1) * j / nz;
      var edge = i === 0 || j === 0 || i === nx || j === nz;
      pts.push({ x: x, y: o.fy + 0.05, z: z, core: !edge });
      pts.push({ x: x, y: o.fy + h - 0.05, z: z, core: !edge });
    }
  });
  return pts;
}

var MIDS = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
function centres(p) {
  var c = MIDS && MIDS.get(p);
  if (c) return c;
  c = roomsOf(p).map(function (o) { return { x: (o.r.x0 + o.r.x1) / 2, y: o.fy + 1.0, z: (o.r.z0 + o.r.z1) / 2 }; });
  if (MIDS) MIDS.set(p, c);
  return c;
}
var PLANS = {};
/* A plan depends on the drop only through the ramp, so a quarter-metre of
 * drop is one plan: rounded UP, so the room is never smaller than the ramp
 * at her true height needs. The game builds the same room (`dropRoom`). */
function q4(drop) { return Math.ceil(drop * 4 - 1e-9) / 4; }
function planFor(id, drop) {
  drop = q4(drop);
  var key = id + '|' + drop;
  if (PLANS[key]) return PLANS[key];
  var h = Combat.HULLS[id];
  var ship = { hullId: id, bornId: id + '-1', dryMass: h.dryMass };
  /* Fresh every time: shipInterior caches on the cockpit spec. */
  var spec = R.cockpitSpec(ship), g = R.cockpitGeometry(spec);
  var crew = global.Crew && global.Crew.crewNeeded ? global.Crew.crewNeeded(id, true) : null;
  var libId = R.HULL_ASSIGN[h.mesh] || '';
  if (h.mesh === 'crawler') libId = 'crawler_civilian';
  return (PLANS[key] = SD.plan(g, { hullId: id, libId: libId, size: h.size, key: spec.key, crew: crew, turret: false, rampDrop: drop }));
}

/* The ramp's room and deck: the main deck on a decked hull. */
function lockFloor(p) { return p.decks ? p.decks.main.floorY : p.floorY; }

function fitOne(id) {
  var h = Combat.HULLS[id];
  var ship = { hullId: id, bornId: id + '-1', dryMass: h.dryMass };
  var mesh = R.hullPreviewMesh(id, ship);
  var ix = columnIndex(mesh);
  var minY = Infinity, maxZ = -Infinity;
  mesh.v.forEach(function (v) { if (v[1] < minY) minY = v[1]; if (v[2] > maxZ) maxZ = v[2]; });
  var gb = R.gearBounds ? R.gearBounds(mesh, 1) : null;
  var groundU = gb && gb.lo ? Math.min(minY, gb.lo[1]) : minY;

  var tower = R.BRIDGE && R.BRIDGE[id];
  if (tower) {
    /* Kept as they are: their length, their bridge up the tower. */
    var Lt = R.hullLength(id) * 1000, at = tower.at;
    var p0 = planFor(id, 3);
    var drop = at[1] + lockFloor(p0) - groundU * Lt;
    return { id: id, len: Lt, at: at.slice(), ground: groundU * Lt, drop: drop, dropRoom: q4(drop), tower: true };
  }

  var L0 = 25, best = null;
  for (var L = L0; L <= 260 && !best; L += (L < 60 ? 1 : 4)) {
    /* Where the eye can be: on the centreline, from the nose aft, at any
     * height her section allows. */
    var noseM = maxZ * L;
    /* On the centreline first; a twin-hulled model (the tanker's two pods)
     * carries her rooms in one of her hulls instead. */
    for (var xi = 0; xi < XS.length && !best; xi++) {
    var ex = XS[xi] * L;
    for (var dz = 1.6; dz < L * 0.5 && !best; dz += 0.5) {
      var ez = noseM - dz;
      var col = ix.hits(ex / L, ez / L).sort(function (a, b) { return a - b; });
      if (col.length < 2) continue;
      var lo = col[0] * L, hi = col[col.length - 1] * L;
      var drop = 3, p = null, pts = null;
      /* The eye from low in her to high, the deck as near her belly as
       * it will go so the ramp is short. */
      for (var ey = lo + 1.5; ey <= hi - 0.6 && !best; ey += 0.25) {
        for (var it = 0; it < 2; it++) {
          p = planFor(id, drop);
          drop = Math.max(0.3, ey + lockFloor(p) - groundU * L);
        }
        /* The room the game will build for that drop. */
        p = planFor(id, drop);
        /* The middle of every room first: most candidates fail on one of
         * those, and they are a handful of points rather than thousands. */
        var mids = centres(p), cheap = true;
        for (var mi = 0; mi < mids.length; mi++) {
          if (!inside(ix, (ex + mids[mi].x) / L, (ey + mids[mi].y) / L, (ez + mids[mi].z) / L)) { cheap = false; break; }
        }
        if (!cheap) continue;
        pts = samples(p);
        var bad = 0, coreBad = 0;
        for (var k = 0; k < pts.length; k++) {
          var q = pts[k];
          if (!inside(ix, (ex + q.x) / L, (ey + q.y) / L, (ez + q.z) / L)) { bad++; if (q.core) { coreBad++; break; } }
        }
        if (!coreBad && bad <= pts.length * 0.04) {
          best = { id: id, len: L, at: [+ex.toFixed(3), +ey.toFixed(3), +ez.toFixed(3)], ground: +(groundU * L).toFixed(3),
                   drop: +drop.toFixed(3), dropRoom: q4(drop), mode: p.ramp.mode, rampLen: +p.ramp.len.toFixed(2), miss: bad + '/' + pts.length };
        }
      }
    }
    }
  }
  return best || { id: id, len: null };
}

var XS = [0, 0.2, -0.2, 0.12, -0.12, 0.25, -0.25];
var out = {}, ids = Object.keys(Combat.HULLS);
var only = process.argv[2];
ids.forEach(function (id) {
  if (only && id !== only) return;
  var t0 = Date.now(), f = fitOne(id);
  out[id] = f;
  console.log(id, JSON.stringify(f), (Date.now() - t0) + ' ms');
});
if (!only) {
  var body = '/* hullfit.js — GENERATED by tools/fit-hulls.js (2026-10-26). Do not edit by hand:\n' +
    ' * rerun the tool when a hull\'s model or her interior changes.\n' +
    ' *\n' +
    ' * Per hull: `len` her length in metres, chosen as the smallest at which every\n' +
    ' * room aboard is inside her model; `at` where the cockpit (the seated eye) is\n' +
    ' * in her, in metres from her centre (x starboard, y up, z forward); `ground`\n' +
    ' * how far below her centre the ground is with her gear down; `drop` her\n' +
    ' * airlock deck\'s height above that ground — the ramp\'s drop. */\n' +
    '(function (global) {\n  global.HullFit = ' + JSON.stringify(out, null, 1).replace(/\n/g, '\n  ') + ';\n' +
    '})(typeof window !== \'undefined\' ? window : globalThis);\n';
  fs.writeFileSync(path.join(SRC, 'hullfit.js'), body);
  console.log('wrote src/hullfit.js');
}
