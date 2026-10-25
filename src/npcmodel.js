/* npcmodel.js — the people: low-poly bodies with painted skins (2026-10-25).
 *
 * Astra, 2026-10-24: "Help me design the models for the first person view
 * mode NPCs … a model style reminiscent of the first Unreal Tournament game",
 * "every crewmember has a role, and that role should inform the design
 * language", and then, looking at them in 3D: "make the models a bit more
 * detailed … skin them all so we're not using more polygons for the same
 * effect". The design was worked out on a turntable page first (the "Manifest
 * Crew Roster" artifact) and every rule she set there is carried here:
 *
 *   - headgear and kit say what someone DOES; colour and shape language say
 *     whose side they are on (Navy square and symmetric, Syndicate long and
 *     dark with one gold accent, pirates jagged and mismatched);
 *   - civilian ships have no uniform; Navy, Syndicate and pirate ships do,
 *     and a Syndicate engineer's hard hat is always yellow or red;
 *   - anything carried is ATTACHED to something — an antenna to a bracket,
 *     a rifle to a two-point sling over the shoulder — nothing floats;
 *   - exo-frames hinge at the elbows and knees, and every body has ankles,
 *     so feet stay flat when the knees bend;
 *   - rifles are modern (pistol grip, stock) and laid out the way a gas
 *     carbine actually works: the ejection port over the magazine well, the
 *     trigger behind it, the buffer tube in line with the bore. rifleLayout()
 *     derives every part from one datum, the chamber, and checks six rules.
 *
 * WHAT THIS FILE PRODUCES is a model the GPU can draw in one call: every
 * vertex in the figure's rest pose (metres, +y up, facing +z), a texture
 * coordinate into ONE 512x512 painted skin, and the index of the bone it
 * rides on. The bones are the joints the turntable already had — hips,
 * knees, ankles, shoulders, elbows — so posing a body is eleven matrices,
 * not a rebuild. npcgl.js draws it; npc.js decides where it stands and what
 * its limbs are doing.
 *
 * THE GENERATOR WAS WRITTEN AGAINST three.js on the turntable page, and is
 * kept here close to verbatim rather than re-derived: the shapes Astra
 * approved are the shapes she gets. three.js is not part of the game, so the
 * handful of its classes the generator touched are re-implemented below with
 * the same conventions (Euler XYZ, the same vertex and UV layout for every
 * primitive). If a body ever looks different in the game from the roster
 * page, a primitive here has drifted from its three.js twin.
 *
 * Determinism: a body is a pure function of (role, name, livery). The skin's
 * noise uses its own stream off the same key, so nothing else's draws move.
 */
(function (global) {
  'use strict';

  var PI = Math.PI, S = 512;

  /* ======================================================================
   * A SMALL THREE.JS, enough for the generator
   * ====================================================================== */

  function V3(x, y, z) { this.x = x || 0; this.y = y || 0; this.z = z || 0; }
  V3.prototype.set = function (x, y, z) { this.x = x; this.y = y; this.z = z; return this; };
  V3.prototype.setScalar = function (s) { this.x = this.y = this.z = s; return this; };
  V3.prototype.copy = function (v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; };
  V3.prototype.clone = function () { return new V3(this.x, this.y, this.z); };
  V3.prototype.add = function (v) { this.x += v.x; this.y += v.y; this.z += v.z; return this; };
  V3.prototype.sub = function (v) { this.x -= v.x; this.y -= v.y; this.z -= v.z; return this; };
  V3.prototype.multiplyScalar = function (s) { this.x *= s; this.y *= s; this.z *= s; return this; };
  V3.prototype.length = function () { return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z); };
  V3.prototype.normalize = function () { var l = this.length() || 1; return this.multiplyScalar(1 / l); };
  function V2(x, y) { this.x = x; this.y = y; }

  /* Column-major 4x4, as three.js and WebGL keep them. */
  function m4() { return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]; }
  function m4mul(a, b) {
    var o = new Array(16);
    for (var c = 0; c < 4; c++) for (var r = 0; r < 4; r++) {
      o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    }
    return o;
  }
  function m4inv(m) {
    /* Rigid-plus-scale matrices only (no shear by construction here), but a
     * general inverse costs nothing at build time and cannot be wrong. */
    var a = m, inv = new Array(16);
    inv[0] = a[5] * a[10] * a[15] - a[5] * a[11] * a[14] - a[9] * a[6] * a[15] + a[9] * a[7] * a[14] + a[13] * a[6] * a[11] - a[13] * a[7] * a[10];
    inv[4] = -a[4] * a[10] * a[15] + a[4] * a[11] * a[14] + a[8] * a[6] * a[15] - a[8] * a[7] * a[14] - a[12] * a[6] * a[11] + a[12] * a[7] * a[10];
    inv[8] = a[4] * a[9] * a[15] - a[4] * a[11] * a[13] - a[8] * a[5] * a[15] + a[8] * a[7] * a[13] + a[12] * a[5] * a[11] - a[12] * a[7] * a[9];
    inv[12] = -a[4] * a[9] * a[14] + a[4] * a[10] * a[13] + a[8] * a[5] * a[14] - a[8] * a[6] * a[13] - a[12] * a[5] * a[10] + a[12] * a[6] * a[9];
    inv[1] = -a[1] * a[10] * a[15] + a[1] * a[11] * a[14] + a[9] * a[2] * a[15] - a[9] * a[3] * a[14] - a[13] * a[2] * a[11] + a[13] * a[3] * a[10];
    inv[5] = a[0] * a[10] * a[15] - a[0] * a[11] * a[14] - a[8] * a[2] * a[15] + a[8] * a[3] * a[14] + a[12] * a[2] * a[11] - a[12] * a[3] * a[10];
    inv[9] = -a[0] * a[9] * a[15] + a[0] * a[11] * a[13] + a[8] * a[1] * a[15] - a[8] * a[3] * a[13] - a[12] * a[1] * a[11] + a[12] * a[3] * a[9];
    inv[13] = a[0] * a[9] * a[14] - a[0] * a[10] * a[13] - a[8] * a[1] * a[14] + a[8] * a[2] * a[13] + a[12] * a[1] * a[10] - a[12] * a[2] * a[9];
    inv[2] = a[1] * a[6] * a[15] - a[1] * a[7] * a[14] - a[5] * a[2] * a[15] + a[5] * a[3] * a[14] + a[13] * a[2] * a[7] - a[13] * a[3] * a[6];
    inv[6] = -a[0] * a[6] * a[15] + a[0] * a[7] * a[14] + a[4] * a[2] * a[15] - a[4] * a[3] * a[14] - a[12] * a[2] * a[7] + a[12] * a[3] * a[6];
    inv[10] = a[0] * a[5] * a[15] - a[0] * a[7] * a[13] - a[4] * a[1] * a[15] + a[4] * a[3] * a[13] + a[12] * a[1] * a[7] - a[12] * a[3] * a[5];
    inv[14] = -a[0] * a[5] * a[14] + a[0] * a[6] * a[13] + a[4] * a[1] * a[14] - a[4] * a[2] * a[13] - a[12] * a[1] * a[6] + a[12] * a[2] * a[5];
    inv[3] = -a[1] * a[6] * a[11] + a[1] * a[7] * a[10] + a[5] * a[2] * a[11] - a[5] * a[3] * a[10] - a[9] * a[2] * a[7] + a[9] * a[3] * a[6];
    inv[7] = a[0] * a[6] * a[11] - a[0] * a[7] * a[10] - a[4] * a[2] * a[11] + a[4] * a[3] * a[10] + a[8] * a[2] * a[7] - a[8] * a[3] * a[6];
    inv[11] = -a[0] * a[5] * a[11] + a[0] * a[7] * a[9] + a[4] * a[1] * a[11] - a[4] * a[3] * a[9] - a[8] * a[1] * a[7] + a[8] * a[3] * a[5];
    inv[15] = a[0] * a[5] * a[10] - a[0] * a[6] * a[9] - a[4] * a[1] * a[10] + a[4] * a[2] * a[9] + a[8] * a[1] * a[6] - a[8] * a[2] * a[5];
    var det = a[0] * inv[0] + a[1] * inv[4] + a[2] * inv[8] + a[3] * inv[12];
    det = det ? 1 / det : 0;
    for (var i = 0; i < 16; i++) inv[i] *= det;
    return inv;
  }
  function m4apply(m, x, y, z) {
    return [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]];
  }
  function m4rotX(a) { var c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]; }
  function m4rotY(a) { var c = Math.cos(a), s = Math.sin(a); return [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]; }
  function m4trans(x, y, z) { return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1]; }

  function Quat() { this.x = 0; this.y = 0; this.z = 0; this.w = 1; this._set = false; }
  Quat.prototype.copy = function (q) { this.x = q.x; this.y = q.y; this.z = q.z; this.w = q.w; this._set = true; return this; };
  Quat.prototype.norm = function () {
    var l = Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z + this.w * this.w) || 1;
    this.x /= l; this.y /= l; this.z /= l; this.w /= l; return this;
  };
  Quat.prototype.setFromUnitVectors = function (a, b) {
    var r = a.x * b.x + a.y * b.y + a.z * b.z + 1;
    if (r < 1e-8) {
      r = 0;
      if (Math.abs(a.x) > Math.abs(a.z)) { this.x = -a.y; this.y = a.x; this.z = 0; this.w = r; }
      else { this.x = 0; this.y = -a.z; this.z = a.y; this.w = r; }
    } else {
      this.x = a.y * b.z - a.z * b.y; this.y = a.z * b.x - a.x * b.z; this.z = a.x * b.y - a.y * b.x; this.w = r;
    }
    this._set = true;
    return this.norm();
  };
  Quat.prototype.setFromAxisAngle = function (ax, ang) {
    var s = Math.sin(ang / 2);
    this.x = ax.x * s; this.y = ax.y * s; this.z = ax.z * s; this.w = Math.cos(ang / 2); this._set = true;
    return this;
  };
  Quat.prototype.setFromRotationMatrix = function (mm) {
    var te = mm.e, m11 = te[0], m12 = te[4], m13 = te[8], m21 = te[1], m22 = te[5], m23 = te[9],
        m31 = te[2], m32 = te[6], m33 = te[10], tr = m11 + m22 + m33, s;
    if (tr > 0) { s = 0.5 / Math.sqrt(tr + 1); this.w = 0.25 / s; this.x = (m32 - m23) * s; this.y = (m13 - m31) * s; this.z = (m21 - m12) * s; }
    else if (m11 > m22 && m11 > m33) { s = 2 * Math.sqrt(1 + m11 - m22 - m33); this.w = (m32 - m23) / s; this.x = 0.25 * s; this.y = (m12 + m21) / s; this.z = (m13 + m31) / s; }
    else if (m22 > m33) { s = 2 * Math.sqrt(1 + m22 - m11 - m33); this.w = (m13 - m31) / s; this.x = (m12 + m21) / s; this.y = 0.25 * s; this.z = (m23 + m32) / s; }
    else { s = 2 * Math.sqrt(1 + m33 - m11 - m22); this.w = (m21 - m12) / s; this.x = (m13 + m31) / s; this.y = (m23 + m32) / s; this.z = 0.25 * s; }
    this._set = true;
    return this;
  };
  /* this = q * this */
  Quat.prototype.premultiply = function (q) {
    var ax = q.x, ay = q.y, az = q.z, aw = q.w, bx = this.x, by = this.y, bz = this.z, bw = this.w;
    this.x = ax * bw + aw * bx + ay * bz - az * by;
    this.y = ay * bw + aw * by + az * bx - ax * bz;
    this.z = az * bw + aw * bz + ax * by - ay * bx;
    this.w = aw * bw - ax * bx - ay * by - az * bz;
    this._set = true;
    return this;
  };
  function M4() { this.e = m4(); }
  M4.prototype.makeBasis = function (x, y, z) {
    this.e = [x.x, x.y, x.z, 0, y.x, y.y, y.z, 0, z.x, z.y, z.z, 0, 0, 0, 0, 1];
    return this;
  };

  /* A scene node: position, Euler XYZ rotation (or a quaternion once one
   * is set), scale, children. Meshes are nodes carrying a geometry. */
  function Node(geo) {
    this.position = new V3(); this.rotation = { x: 0, y: 0, z: 0 }; this.scale = new V3(1, 1, 1);
    this.quaternion = new Quat(); this.children = []; this.parent = null; this.userData = {};
    this.geo = geo || null; this.emis = 0;
  }
  Node.prototype.add = function (c) { c.parent = this; this.children.push(c); return this; };
  function localMatrix(n) {
    var r;
    if (n.quaternion._set) {
      var q = n.quaternion, x = q.x, y = q.y, z = q.z, w = q.w;
      r = [1 - 2 * (y * y + z * z), 2 * (x * y + z * w), 2 * (x * z - y * w), 0,
           2 * (x * y - z * w), 1 - 2 * (x * x + z * z), 2 * (y * z + x * w), 0,
           2 * (x * z + y * w), 2 * (y * z - x * w), 1 - 2 * (x * x + y * y), 0, 0, 0, 0, 1];
    } else {
      /* three.js makeRotationFromEuler, order XYZ. */
      var a = Math.cos(n.rotation.x), b = Math.sin(n.rotation.x), c = Math.cos(n.rotation.y), d = Math.sin(n.rotation.y),
          e = Math.cos(n.rotation.z), f = Math.sin(n.rotation.z);
      var ae = a * e, af = a * f, be = b * e, bf = b * f;
      r = [c * e, af + be * d, bf - ae * d, 0, -c * f, ae - bf * d, be + af * d, 0, d, -b * c, a * c, 0, 0, 0, 0, 1];
    }
    var s = n.scale;
    return [r[0] * s.x, r[1] * s.x, r[2] * s.x, 0, r[4] * s.y, r[5] * s.y, r[6] * s.y, 0,
            r[8] * s.z, r[9] * s.z, r[10] * s.z, 0, n.position.x, n.position.y, n.position.z, 1];
  }

  /* ---- primitives, laid out vertex-for-vertex as three.js lays them ---- */
  function Attr(arr, size) { this.array = arr; this.itemSize = size; this.count = arr.length / size; }
  Attr.prototype.getX = function (i) { return this.array[i * this.itemSize]; };
  Attr.prototype.getY = function (i) { return this.array[i * this.itemSize + 1]; };
  Attr.prototype.getZ = function (i) { return this.array[i * this.itemSize + 2]; };
  Attr.prototype.setX = function (i, v) { this.array[i * this.itemSize] = v; };
  Attr.prototype.setY = function (i, v) { this.array[i * this.itemSize + 1] = v; };
  Attr.prototype.setXY = function (i, x, y) { this.array[i * this.itemSize] = x; this.array[i * this.itemSize + 1] = y; };
  Attr.prototype.setXYZ = function (i, x, y, z) { var o = i * this.itemSize; this.array[o] = x; this.array[o + 1] = y; this.array[o + 2] = z; };
  /* Every geometry here is expanded to plain triangles, three vertices
   * each, which is what the GPU path draws anyway (flat shading). */
  function Geo(pos, uv, idx) {
    var P = [], U = [];
    if (idx) {
      for (var i = 0; i < idx.length; i++) {
        var k = idx[i];
        P.push(pos[k * 3], pos[k * 3 + 1], pos[k * 3 + 2]);
        U.push(uv[k * 2], uv[k * 2 + 1]);
      }
    } else { P = pos; U = uv; }
    this.attributes = { position: new Attr(P, 3), uv: new Attr(U, 2) };
  }
  Geo.prototype.computeVertexNormals = function () {};

  function BoxGeometry(w, h, d) {
    var pos = [], uv = [], idx = [];
    function plane(u, v, wi, udir, vdir, width, height, depth) {
      var base = pos.length / 3;
      for (var iy = 0; iy < 2; iy++) for (var ix = 0; ix < 2; ix++) {
        var vec = { x: 0, y: 0, z: 0 };
        vec[u] = (ix * width - width / 2) * udir;
        vec[v] = (iy * height - height / 2) * vdir;
        vec[wi] = depth / 2;
        pos.push(vec.x, vec.y, vec.z);
        uv.push(ix, 1 - iy);
      }
      var a = base, b = base + 2, c = base + 3, dd = base + 1;
      idx.push(a, b, dd, b, c, dd);
    }
    plane('z', 'y', 'x', -1, -1, d, h, w);
    plane('z', 'y', 'x', 1, -1, d, h, -w);
    plane('x', 'z', 'y', 1, 1, w, d, h);
    plane('x', 'z', 'y', 1, -1, w, d, -h);
    plane('x', 'y', 'z', 1, -1, w, h, d);
    plane('x', 'y', 'z', -1, -1, w, h, -d);
    return new Geo(pos, uv, idx);
  }

  function CylinderGeometry(rt, rb, h, rs, hs, open, t0, tl) {
    rs = rs || 32; hs = hs || 1; t0 = t0 || 0; tl = (tl === undefined) ? PI * 2 : tl;
    var pos = [], uv = [], idx = [], grid = [];
    for (var y = 0; y <= hs; y++) {
      var row = [], v = y / hs, rad = v * (rb - rt) + rt;
      for (var x = 0; x <= rs; x++) {
        var u = x / rs, th = u * tl + t0;
        pos.push(rad * Math.sin(th), -v * h + h / 2, rad * Math.cos(th));
        uv.push(u, 1 - v);
        row.push(pos.length / 3 - 1);
      }
      grid.push(row);
    }
    for (x = 0; x < rs; x++) for (y = 0; y < hs; y++) {
      var a = grid[y][x], b = grid[y + 1][x], c = grid[y + 1][x + 1], d = grid[y][x + 1];
      idx.push(a, b, d, b, c, d);
    }
    function cap(top) {
      var r = top ? rt : rb, sign = top ? 1 : -1;
      if (!(r > 0)) return;
      var c0 = pos.length / 3;
      for (var i = 1; i <= rs; i++) { pos.push(0, h / 2 * sign, 0); uv.push(0.5, 0.5); }
      var e0 = pos.length / 3;
      for (i = 0; i <= rs; i++) {
        var th = i / rs * tl + t0, ct = Math.cos(th), st = Math.sin(th);
        pos.push(r * st, h / 2 * sign, r * ct);
        uv.push(ct * 0.5 + 0.5, st * 0.5 * sign + 0.5);
      }
      for (i = 0; i < rs; i++) {
        if (top) idx.push(e0 + i, e0 + i + 1, c0 + i);
        else idx.push(e0 + i + 1, e0 + i, c0 + i);
      }
    }
    if (!open) { cap(true); cap(false); }
    return new Geo(pos, uv, idx);
  }
  function ConeGeometry(r, h, rs) { return CylinderGeometry(0, r, h, rs, 1, false, 0, PI * 2); }

  function SphereGeometry(r, ws, hs, p0, pl, t0, tl) {
    ws = Math.max(3, ws || 32); hs = Math.max(2, hs || 16);
    p0 = p0 || 0; pl = pl === undefined ? PI * 2 : pl; t0 = t0 || 0; tl = tl === undefined ? PI : tl;
    var tEnd = Math.min(t0 + tl, PI), pos = [], uv = [], idx = [], grid = [];
    for (var iy = 0; iy <= hs; iy++) {
      var row = [], v = iy / hs;
      for (var ix = 0; ix <= ws; ix++) {
        var u = ix / ws;
        pos.push(-r * Math.cos(p0 + u * pl) * Math.sin(t0 + v * tl), r * Math.cos(t0 + v * tl),
                 r * Math.sin(p0 + u * pl) * Math.sin(t0 + v * tl));
        uv.push(u, 1 - v);
        row.push(pos.length / 3 - 1);
      }
      grid.push(row);
    }
    for (iy = 0; iy < hs; iy++) for (ix = 0; ix < ws; ix++) {
      var a = grid[iy][ix + 1], b = grid[iy][ix], c = grid[iy + 1][ix], d = grid[iy + 1][ix + 1];
      if (iy !== 0 || t0 > 0) idx.push(a, b, d);
      if (iy !== hs - 1 || tEnd < PI) idx.push(b, c, d);
    }
    return new Geo(pos, uv, idx);
  }

  function polyhedron(verts, ind, r, detail) {
    var pos = [];
    function lerp(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
    for (var f = 0; f < ind.length; f += 3) {
      var A = verts.slice(ind[f] * 3, ind[f] * 3 + 3), B = verts.slice(ind[f + 1] * 3, ind[f + 1] * 3 + 3),
          C = verts.slice(ind[f + 2] * 3, ind[f + 2] * 3 + 3), cols = detail + 1, v = [];
      for (var i = 0; i <= cols; i++) {
        v[i] = [];
        var aj = lerp(A, C, i / cols), bj = lerp(B, C, i / cols), rows = cols - i;
        for (var j = 0; j <= rows; j++) v[i][j] = (j === 0 && i === cols) ? aj : lerp(aj, bj, rows ? j / rows : 0);
      }
      for (i = 0; i < cols; i++) for (j = 0; j < 2 * (cols - i) - 1; j++) {
        var k = Math.floor(j / 2);
        var tri = j % 2 === 0 ? [v[i][k + 1], v[i + 1][k], v[i][k]] : [v[i][k + 1], v[i + 1][k + 1], v[i + 1][k]];
        tri.forEach(function (p) { pos.push(p[0], p[1], p[2]); });
      }
    }
    var uv = [];
    for (i = 0; i < pos.length; i += 3) {
      var l = Math.sqrt(pos[i] * pos[i] + pos[i + 1] * pos[i + 1] + pos[i + 2] * pos[i + 2]) || 1;
      pos[i] *= r / l; pos[i + 1] *= r / l; pos[i + 2] *= r / l;
      var az = Math.atan2(pos[i + 2], -pos[i]), inc = Math.atan2(-pos[i + 1], Math.sqrt(pos[i] * pos[i] + pos[i + 2] * pos[i + 2]));
      uv.push(az / 2 / PI + 0.5, inc / PI + 0.5);
    }
    return new Geo(pos, uv, null);
  }
  var ICO_T = (1 + Math.sqrt(5)) / 2;
  var ICO_V = [-1, ICO_T, 0, 1, ICO_T, 0, -1, -ICO_T, 0, 1, -ICO_T, 0, 0, -1, ICO_T, 0, 1, ICO_T, 0, -1, -ICO_T, 0, 1, -ICO_T,
               ICO_T, 0, -1, ICO_T, 0, 1, -ICO_T, 0, -1, -ICO_T, 0, 1];
  var ICO_I = [0, 11, 5, 0, 5, 1, 0, 1, 7, 0, 7, 10, 0, 10, 11, 1, 5, 9, 5, 11, 4, 11, 10, 2, 10, 7, 6, 7, 1, 8,
               3, 9, 4, 3, 4, 2, 3, 2, 6, 3, 6, 8, 3, 8, 9, 4, 9, 5, 2, 4, 11, 6, 2, 10, 8, 6, 7, 9, 8, 1];
  function IcosahedronGeometry(r, detail) { return polyhedron(ICO_V, ICO_I, r || 1, detail || 0); }
  function OctahedronGeometry(r) {
    return polyhedron([1, 0, 0, -1, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 1, 0, 0, -1],
                      [0, 2, 4, 0, 4, 3, 0, 3, 5, 0, 5, 2, 1, 2, 5, 1, 5, 3, 1, 3, 4, 1, 4, 2], r || 1, 0);
  }

  function TorusGeometry(R, t, rs, ts, arc) {
    rs = rs || 12; ts = ts || 48; arc = arc || PI * 2;
    var pos = [], uv = [], idx = [];
    for (var j = 0; j <= rs; j++) for (var i = 0; i <= ts; i++) {
      var u = i / ts * arc, v = j / rs * PI * 2;
      pos.push((R + t * Math.cos(v)) * Math.cos(u), (R + t * Math.cos(v)) * Math.sin(u), t * Math.sin(v));
      uv.push(i / ts, j / rs);
    }
    for (j = 1; j <= rs; j++) for (i = 1; i <= ts; i++) {
      var a = (ts + 1) * j + i - 1, b = (ts + 1) * (j - 1) + i - 1, c = (ts + 1) * (j - 1) + i, d = (ts + 1) * j + i;
      idx.push(a, b, d, b, c, d);
    }
    return new Geo(pos, uv, idx);
  }

  function LatheGeometry(points, segs, p0, pl) {
    segs = segs || 12; p0 = p0 || 0; pl = pl === undefined ? PI * 2 : pl;
    var pos = [], uv = [], idx = [], n = points.length;
    for (var i = 0; i <= segs; i++) {
      var ph = p0 + i / segs * pl, s = Math.sin(ph), c = Math.cos(ph);
      for (var j = 0; j < n; j++) {
        pos.push(points[j].x * s, points[j].y, points[j].x * c);
        uv.push(i / segs, j / (n - 1));
      }
    }
    for (i = 0; i < segs; i++) for (j = 0; j < n - 1; j++) {
      var base = j + i * n, a = base, b = base + n, cc = base + n + 1, d = base + 1;
      idx.push(a, b, d, cc, d, b);
    }
    return new Geo(pos, uv, idx);
  }

  var THREE = {
    Group: Node, Object3D: Node, Mesh: Node, Vector3: V3, Vector2: V2, Quaternion: Quat, Matrix4: M4,
    BoxGeometry: BoxGeometry, CylinderGeometry: CylinderGeometry, ConeGeometry: ConeGeometry,
    SphereGeometry: SphereGeometry, IcosahedronGeometry: IcosahedronGeometry,
    OctahedronGeometry: OctahedronGeometry, TorusGeometry: TorusGeometry, LatheGeometry: LatheGeometry
  };

  /* A 2D context that does nothing, for building bodies where there is no
   * canvas (the tests, under node): the geometry and the stream of draws
   * are identical, only nothing is painted. */
  var NOOP = function () {};
  var STUB_CTX = (typeof Proxy !== 'undefined') ? new Proxy({}, {
    get: function (t, k) {
      if (k === 'createLinearGradient') return function () { return { addColorStop: NOOP }; };
      return NOOP;
    },
    set: function () { return true; }
  }) : null;

  /* ======================================================================
   * THE GENERATOR, as approved on the turntable page
   * ====================================================================== */

  /* ---------- colour + seed utilities ---------- */
  function hash(s){let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0;}
  function rng(seed){let a=seed;return function(){a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
  const pick=(r,a)=>a[Math.floor(r()*a.length)];
  function shade(hex,k){const n=parseInt(hex.slice(1),16),ch=[n>>16,n>>8&255,n&255].map(v=>Math.max(0,Math.min(255,Math.round(k<1?v*k:v+(255-v)*(k-1)))));return '#'+ch.map(v=>v.toString(16).padStart(2,'0')).join('');}

  const SKIN=['#F1C9A5','#E3B98F','#C9A27E','#A97C56','#8D5A3B','#6B4226','#4A2E1C'];
  const HAIR=['#1e1a17','#3b2a1e','#5a3d24','#8a6a3a','#b8a07a','#7a7a76','#2a2a2a','#6b2f1a'];
  const STYLES=['short','short','buzz','long','slick','bald'];
  const HATS=['#F2F1EC','#97C459','#5DCAA5','#7F77DD','#ED93B1','#85B7EB','#D3D1C7'];
  const G={navy:'#185FA5',navyD:'#0C447C',white:'#EEEDE6',vblue:'#9CCBF5',gold:'#EF9F27',syn:'#272726',synL:'#3a3936',rust:'#993C1D',rustD:'#712B13',red:'#E24B4A',pGlow:'#FF6A3D',steel:'#8b8a84',steelD:'#5F5E5A',tealG:'#5DCAA5'};

  /* ---------- the skin atlas: one 512x512 painted texture per character ---------- */
  const REG={torso:[0,0,256,160],head:[256,0,128,128],pelvis:[384,0,128,48],helm:[384,48,128,80],hat:[256,128,256,32],
    thighL:[0,160,64,96],thighR:[64,160,64,96],shinL:[128,160,64,96],shinR:[192,160,64,96],
    upL:[256,160,64,96],upR:[320,160,64,96],foL:[384,160,64,96],foR:[448,160,64,96],
    bootL:[0,256,64,48],bootR:[64,256,64,48],handL:[0,304,48,48],handR:[48,304,48,48],coat:[128,256,256,96],pad:[384,256,128,48],misc:[384,304,128,48]};
  function painter(c,rc,r){const [X,Y,W,H]=rc;
    const clip=f=>{c.save();c.beginPath();c.rect(X,Y,W,H);c.clip();f();c.restore();};
    const path=pts=>{c.beginPath();pts.forEach((p,i)=>i?c.lineTo(X+p[0]*W,Y+p[1]*H):c.moveTo(X+p[0]*W,Y+p[1]*H));};
    const P={W,H,
      fill(col){c.fillStyle=col;c.fillRect(X,Y,W,H);return P;},
      r(fx,fy,fw,fh,col){clip(()=>{c.fillStyle=col;c.fillRect(X+fx*W,Y+fy*H,fw*W,fh*H);});return P;},
      ln(pts,col,lw,dash){clip(()=>{c.strokeStyle=col;c.lineWidth=lw||1;c.setLineDash(dash||[]);path(pts);c.stroke();});return P;},
      poly(pts,col){clip(()=>{c.fillStyle=col;path(pts);c.closePath();c.fill();});return P;},
      dot(fx,fy,rad,col){clip(()=>{c.fillStyle=col;c.beginPath();c.arc(X+fx*W,Y+fy*H,rad,0,PI*2);c.fill();});return P;},
      txt(s,fx,fy,px,col){clip(()=>{c.fillStyle=col;c.font=`bold ${px}px monospace`;c.textAlign='center';c.textBaseline='middle';c.fillText(s,X+fx*W,Y+fy*H);});return P;},
      draw(fn){clip(()=>fn(c,X,Y,W,H));return P;},
      noise(a){for(let i=0;i<W*H/7;i++){c.fillStyle=r()<.5?`rgba(255,255,255,${a})`:`rgba(0,0,0,${a*1.4})`;c.fillRect(X+(r()*W|0),Y+(r()*H|0),1,1);}return P;},
      wrap(k){k=k||.3;clip(()=>{const g=c.createLinearGradient(X,0,X+W,0);g.addColorStop(0,`rgba(0,0,0,${k})`);g.addColorStop(.5,'rgba(255,255,255,.07)');g.addColorStop(1,`rgba(0,0,0,${k})`);c.fillStyle=g;c.fillRect(X,Y,W,H);});return P;},
      vgrad(a){clip(()=>{const g=c.createLinearGradient(0,Y,0,Y+H);g.addColorStop(0,`rgba(255,255,255,${a})`);g.addColorStop(1,`rgba(0,0,0,${a*1.6})`);c.fillStyle=g;c.fillRect(X,Y,W,H);});return P;},
      cloth(col){return P.fill(col).noise(.05).wrap().vgrad(.06);},
      seam(fx,col){return P.ln([[fx,0],[fx,1]],col||'rgba(0,0,0,.35)',1);},
      stitch(fx,fy,fw,fh){return P.ln([[fx,fy],[fx+fw,fy],[fx+fw,fy+fh],[fx,fy+fh],[fx,fy]],'rgba(240,230,210,.55)',1,[2,2]);},
      patch(fx,fy,fw,fh,col){P.r(fx,fy,fw,fh,col);return P.stitch(fx,fy,fw,fh);}};
    return P;}
  function mapUV(g,rc){const uv=g.attributes.uv,[px,py,pw,ph]=rc,i0=.75;
    for(let i=0;i<uv.count;i++){const u=uv.getX(i),v=uv.getY(i);uv.setXY(i,(px+i0+u*(pw-2*i0))/S,1-(py+i0+(1-v)*(ph-2*i0))/S);}uv.needsUpdate=true;}
  function place(m,x,y,z,o){m.position.set(x||0,y||0,z||0);o=o||{};if(o.rx)m.rotation.x=o.rx;if(o.ry)m.rotation.y=o.ry;if(o.rz)m.rotation.z=o.rz;if(o.s)m.scale.set(o.s[0],o.s[1],o.s[2]);return m;}
  /* ---------- geometry ---------- */
  const cylR=(a,b,h,n,open)=>{n=n||6;return new THREE.CylinderGeometry(a,b,h,n,1,!!open,PI+PI/n,PI*2);};
  const box=(w,h,d)=>new THREE.BoxGeometry(w,h,d);
  const ico=(r,d)=>new THREE.IcosahedronGeometry(r,d===undefined?1:d);
  const dome=(r,w,h)=>new THREE.SphereGeometry(r,w||10,h||3,0,PI*2,0,PI/2);
  const cone=(r,h,n)=>new THREE.ConeGeometry(r,h,n||4);
  const TORSO=[[.155,-.23],[.15,-.13],[.168,0],[.2,.1],[.21,.165],[.17,.215],[.075,.245]];
  function lathe(pts,n,B){return new THREE.LatheGeometry(pts.map(p=>new THREE.Vector2(p[0]*B,p[1])),n,PI+PI/n,PI*2);}
  function headGeo(){const g=new THREE.IcosahedronGeometry(1,1),p=g.attributes.position,uv=g.attributes.uv;
    for(let i=0;i<p.count;i++){const x=p.getX(i),y=p.getY(i),z=p.getZ(i);uv.setXY(i,.5+Math.atan2(x,z)/(2*PI),.5+Math.asin(Math.max(-1,Math.min(1,y)))/PI);}
    for(let t=0;t<p.count;t+=3){const us=[0,1,2].map(k=>uv.getX(t+k));if(Math.max(...us)-Math.min(...us)>.5)for(let k=0;k<3;k++)if(us[k]<.5)uv.setX(t+k,.999);}
    for(let i=0;i<p.count;i++){let x=p.getX(i),y=p.getY(i),z=p.getZ(i);if(y<-.15){x*=1-(-.15-y)*.42;}if(y<-.3&&z>.3)z*=1.06;p.setXYZ(i,x*.098,y*.119,z*.104);}
    g.computeVertexNormals();return g;}
  function skirtGeo(r0,r1,h,n,torn){const g=cylR(r0,r1,h,n,true);
    if(torn){const p=g.attributes.position;for(let i=0;i<p.count;i++)if(p.getY(i)<-h/2+1e-3){const k=Math.abs(Math.sin(p.getX(i)*91.7+p.getZ(i)*47.3)*43758.5)%1;p.setY(i,p.getY(i)+k*.14);}g.computeVertexNormals();}
    return g;}
  function grp(p,x,y,z,o){const g=new THREE.Group();p.add(place(g,x,y,z,o));return g;}
  const _v=new THREE.Vector3(),_up=new THREE.Vector3(0,1,0);
  function setRod(m,A,B){_v.copy(B).sub(A);const L=_v.length();m.position.copy(A).add(B).multiplyScalar(.5);m.quaternion.setFromUnitVectors(_up,_v.normalize());m.scale.set(1,L,1);}
  function anchor(p,x,y,z){const o=new THREE.Object3D();o.position.set(x,y,z);p.add(o);return o;}
  /* A strap is recorded here and built in finalize(), ring by ring on the bones it joins. */
  function strap(K,g,a0,a1,via,r,col){const s={g,a0,a1,via:via.map(p=>new THREE.Vector3(p[0],p[1],p[2])),r,col};K.straps.push(s);return s;}
  /* Rifle generator. Everything hangs off one datum: the chamber, on the bore axis (z forward, y up, +x = ejection side).
     Rules from how a gas-operated carbine actually works:
     1 the magazine feeds straight up into the bolt path, so the mag well sits directly under the bolt face, just behind the chamber
     2 the ejection port opens over that same stretch of the bolt path, on the right side, so it lines up with the mag well
     3 the trigger sits right behind the mag well, the pistol grip right behind the trigger
     4 the buffer tube and stock run straight back in line with the bore (that is where the bolt carrier recoils to)
     5 the charging handle is at the top rear of the upper; forward assist and brass deflector are on the right, behind the port
     6 the gas block sits on the barrel under the handguard; the top rail runs unbroken from the upper onto the handguard */
  function rifleLayout(){const L={chamber:0,bore:0};
    L.mag={z0:L.chamber-.072,z1:L.chamber-.004};L.mag.zc=(L.mag.z0+L.mag.z1)/2;
    L.port={zc:L.mag.zc,len:L.mag.z1-L.mag.z0-.008};
    L.trigger={zc:L.mag.z0-.016};L.guard={z0:L.mag.z0,z1:L.trigger.zc-.03};
    L.grip={zc:L.guard.z1-.022,yc:-.088};
    L.upper={z0:L.chamber-.205,z1:L.chamber+.022};L.lower={z0:L.grip.zc-.035,z1:L.upper.z1};
    L.assist={zc:L.mag.z0-.026};L.deflector={zc:L.mag.z0-.008};L.charge={zc:L.upper.z0+.02};
    L.tube={z0:L.upper.z0,z1:L.upper.z0-.22,y:L.bore};L.stock={z1:L.tube.z1-.012};
    L.hand={z0:L.upper.z1,z1:L.upper.z1+.27};L.gas={zc:L.chamber+.18};L.barrel={z1:L.hand.z1+.07};L.rail={z0:L.upper.z0+.03,z1:L.hand.z1};
    L.optic={z0:L.mag.zc-.085,z1:L.mag.zc+.04};
    L.rules=[
      ['Ejection port lines up over the magazine well',Math.abs(L.port.zc-L.mag.zc)<.002],
      ['Mag well sits under the bolt face, just behind the chamber',L.mag.z1<=L.chamber&&L.mag.z1>L.chamber-.02],
      ['Trigger behind the mag well, grip behind the trigger',L.trigger.zc<L.mag.z0&&L.grip.zc<L.trigger.zc],
      ['Buffer tube and stock in line with the bore',L.tube.y===L.bore],
      ['Charging handle at the rear of the upper',L.charge.zc<L.assist.zc],
      ['Gas block under the handguard',L.gas.zc>L.hand.z0&&L.gas.zc<L.hand.z1]];
    return L;}
  const RL=rifleLayout();
  function rifle(K,parent,glow,at){
    const R=new THREE.Group();parent.add(R);
    if(at.q)R.quaternion.copy(at.q);R.position.set(at.x||0,at.y||0,at.z||0);
    const I=new THREE.Group();R.add(I);const L=RL;I.position.set(0,-L.grip.yc,-L.grip.zc);
    const bk='#26292b',md='#33373a',lt='#4a4e51',rb='#151515',X=(g,c,x,y,z,o)=>K.m(I,g,c,x,y,z,o),zr={rx:PI/2},span=(a,b)=>[Math.abs(a-b),(a+b)/2];
    let [l,c]=span(L.upper.z0,L.upper.z1);X(box(.044,.05,l),md,0,.007,c);
    [l,c]=span(L.lower.z0,L.lower.z1);X(box(.038,.034,l),bk,0,-.035,c);
    X(box(.004,.017,L.port.len),rb,.0225,.006,L.port.zc);X(box(.003,.004,L.port.len+.006),lt,.0235,-.005,L.port.zc);
    X(box(.008,.016,.014),lt,.026,.006,L.deflector.zc);X(cylR(.007,.007,.016,8),lt,.026,.016,L.assist.zc,{rz:PI/2});
    X(box(.05,.01,.018),lt,0,.036,L.charge.zc);X(box(.016,.01,.03),bk,0,.034,L.charge.zc+.015);
    [l,c]=span(L.mag.z0,L.mag.z1);X(box(.034,.03,l+.008),bk,0,-.066,c);
    X(box(.026,.07,l-.006),md,0,-.115,c+.002,{rx:-.08});X(box(.026,.06,l-.008),md,0,-.176,c+.012,{rx:-.26});X(box(.03,.012,l-.004),rb,0,-.208,c+.022,{rx:-.26});
    X(box(.008,.008,.008),lt,.02,-.04,L.mag.z0-.004);X(box(.004,.014,.01),lt,-.02,-.026,L.mag.z0+.006);X(box(.004,.008,.014),lt,-.02,-.035,L.trigger.zc-.02);
    [l,c]=span(L.guard.z0,L.guard.z1);X(box(.008,.006,l),bk,0,-.083,c);X(box(.006,.022,.007),bk,0,-.072,L.guard.z1);
    X(box(.004,.022,.008),lt,0,-.062,L.trigger.zc,{rx:-.2});
    X(box(.032,.088,.038),bk,0,L.grip.yc,L.grip.zc,{rx:.3});X(box(.034,.012,.04),bk,0,L.grip.yc-.044,L.grip.zc-.014,{rx:.3});
    [l,c]=span(L.tube.z0,L.tube.z1);X(cylR(.015,.015,l,8),md,0,L.tube.y,c,zr);X(cylR(.019,.019,.012,8),lt,0,L.tube.y,L.tube.z0-.006,zr);
    X(box(.038,.07,.12),bk,0,L.tube.y-.012,L.stock.z1+.06);X(box(.03,.024,.09),md,0,L.tube.y+.034,L.stock.z1+.055);X(box(.042,.098,.018),rb,0,L.tube.y-.015,L.stock.z1-.009);
    [l,c]=span(L.hand.z0,L.hand.z1);X(cylR(.029,.029,l,8),md,0,L.bore,c,zr);for(const sx of [-1,1])for(let i=0;i<4;i++)X(box(.004,.012,.03),rb,sx*.028,L.bore,L.hand.z0+.05+i*.055);
    X(box(.012,.01,l-.04),bk,0,L.bore-.031,c+.01);
    [l,c]=span(L.hand.z1,L.barrel.z1);X(cylR(.009,.009,l,8),bk,0,L.bore,c,zr);X(cylR(.015,.013,.055,8),md,0,L.bore,L.barrel.z1+.025,zr);for(const sx of [-1,1])X(box(.004,.01,.025),rb,sx*.014,L.bore,L.barrel.z1+.025);
    [l,c]=span(L.rail.z0,L.rail.z1);X(box(.022,.01,l),bk,0,.037,c);for(let z=L.rail.z0+.01;z<L.rail.z1;z+=.035)X(box(.026,.006,.012),bk,0,.043,z);
    [l,c]=span(L.optic.z0,L.optic.z1);X(box(.03,.012,l-.04),bk,0,.048,c);X(box(.04,.042,l),md,0,.074,c);X(box(.042,.008,l-.02),bk,0,.097,c);
    X(cylR(.023,.021,.025,8),bk,0,.074,L.optic.z1+.012,zr);X(cylR(.017,.019,.02,8),bk,0,.074,L.optic.z0-.01,zr);
    K.g(I,box(.03,.03,.004),glow,0,.074,L.optic.z1+.025);K.g(I,box(.022,.022,.004),glow,0,.074,L.optic.z0-.021);K.g(I,box(.003,.006,l*.6),glow,.0205,.086,c);
    X(box(.012,.014,.014),rb,.025,.066,c-.03);
    X(cylR(.015,.012,.07,6),bk,0,L.bore-.07,L.hand.z0+.19);
    X(box(.012,.024,.018),lt,.034,L.bore-.01,L.hand.z1-.02);X(box(.012,.024,.018),lt,-.024,L.tube.y-.01,L.stock.z1+.04);
    const a=(x,y,z)=>{const o=new THREE.Object3D();o.position.set(x,y,z);I.add(o);return o;};
    return{g:R,front:a(.04,L.bore-.01,L.hand.z1-.02),rear:a(-.03,L.tube.y-.01,L.stock.z1+.04),port:a(.032,.066,c-.03)};}
  function rod(K,p,a,b,r,col){const A=new THREE.Vector3(a[0],a[1],a[2]),B=new THREE.Vector3(b[0],b[1],b[2]),d=B.clone().sub(A),m=K.m(p,cylR(r,r,d.length(),5),col);m.position.copy(A).add(B).multiplyScalar(.5);m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize());return m;}

  /* ---------- painted parts ---------- */
  function face(K,s){const H=K.p('head'),sk=s.skin;H.fill(sk).noise(.04).wrap(.22);
    const d=shade(sk,.62),m=shade(sk,.82);
    H.r(.23,.43,.04,.13,m).r(.73,.43,.04,.13,m);
    H.r(.405,.435,.06,.03,'#e7e2d6').r(.535,.435,.06,.03,'#e7e2d6');
    H.r(.425,.43,.027,.038,'#1a1612').r(.548,.43,.027,.038,'#1a1612');
    const brow=s.hair==='none'?d:shade(s.hair||'#2a2420',1.05);H.r(.395,.405,.075,.018,brow).r(.53,.405,.075,.018,brow);
    H.r(.492,.47,.016,.085,m).r(.47,.548,.06,.014,d);
    H.r(.45,.635,.1,.016,shade(sk,.55)).r(.46,.652,.08,.01,shade(sk,1.08));
    if(s.facial==='stubble')H.r(.38,.6,.24,.17,'rgba(30,24,20,.22)');
    if(s.facial==='beard')H.poly([[.36,.58],[.64,.58],[.62,.74],[.5,.82],[.38,.74]],shade(s.hair,1)).r(.45,.63,.1,.016,shade(sk,.55));
    const hc=s.hair,st=s.style;if(!hc||st==='bald'){H.r(0,0,1,.18,shade(sk,.94));return H;}
    if(st==='buzz'){H.r(0,0,1,.3,hc+'b0').r(0,.3,.2,.25,hc+'b0').r(.8,.3,.2,.25,hc+'b0');}
    else if(st==='mohawk'){H.r(0,0,1,.3,'rgba(30,24,20,.25)').r(.43,0,.14,.36,hc);}
    else{H.r(0,0,1,.31,hc).r(0,.31,.22,st==='long'?.55:.26,hc).r(.78,.31,.22,st==='long'?.55:.26,hc);
      H.ln([[.3,.31],[.5,.27],[.7,.31]],shade(hc,.7),2);
      if(st==='slick')H.ln([[.42,.02],[.42,.3]],shade(hc,1.4),1).ln([[.3,.08],[.7,.06]],shade(hc,1.25),1);}
    return H;}
  function limb(P,col,skin){if(col===skin){P.fill(col).noise(.03).wrap(.24);}else{P.cloth(col).seam(.02).seam(.98);}return P;}
  function bootP(P,col){P.fill(col).noise(.06).vgrad(.1).r(0,.78,1,.22,shade(col,.55)).ln([[0,.78],[1,.78]],'rgba(255,255,255,.15)',1);for(let i=0;i<4;i++)P.r(.38,.15+i*.13,.24,.03,shade(col,.7));return P;}
  function handP(P,col,bare){P.fill(col).noise(.04).vgrad(.1);for(let i=0;i<3;i++)P.ln([[.28+i*.22,.62],[.28+i*.22,.95]],shade(col,.72),1);if(!bare)P.r(0,0,1,.2,shade(col,.75));return P;}
  function emblem(P,fx,fy,k,s){P.draw((c,X,Y,W,H)=>{const x=X+fx*W,y=Y+fy*H;
    if(k==='navy'){c.fillStyle=G.navy;c.fillRect(x-s,y-s,2*s,2*s);c.fillStyle=G.white;c.beginPath();for(let i=0;i<8;i++){const a=i*PI/4-PI/2,rr=i%2?s*.32:s*.85;c.lineTo(x+Math.cos(a)*rr,y+Math.sin(a)*rr);}c.fill();}
    else if(k==='syn'){c.strokeStyle=G.gold;c.lineWidth=Math.max(1.2,s*.28);c.beginPath();c.arc(x,y,s*.72,0,PI*2);c.stroke();c.fillStyle=G.gold;c.fillRect(x-s*.12,y-s*.72,s*.24,s*1.44);}
    else if(k==='pir'){c.strokeStyle=G.red;c.lineWidth=Math.max(1.5,s*.32);c.beginPath();c.moveTo(x-s,y-s);c.lineTo(x+s,y+s);c.moveTo(x+s,y-s);c.lineTo(x-s,y+s);c.stroke();}});}

  /* ---------- base humanoid ---------- */
  function body(K,s){
    const g=new THREE.Group(),B=s.bulk||1,legC={L:s.legL||s.pants,R:s.legR||s.pants},arms={},upper={},legs={},J={};
    K.p('torso').cloth(s.shirt);K.p('pelvis').cloth(s.pants);face(K,s);
    K.m(g,cylR(.17*B,.15*B,.14,8),'pelvis',0,.94,0,{s:[1,1,.7]});
    K.m(g,lathe(TORSO,8,B),'torso',0,1.23,0,{s:[1,1,.62]});
    K.m(g,cylR(.05,.056,.08),s.skin,0,1.49,0);
    K.m(g,headGeo(),'head',0,1.61,0);
    if(!s.helmet)K.m(g,box(.022,.034,.03),s.skin,0,1.598,.104);
    for(const sd of [-1,1]){const k=sd<0?'L':'R',sc=s['sleeve'+k]||s.shirt,fc=s['fore'+k]||sc,hc=s['hand'+k]||s.gloves||s.skin,bc=s['boot'+k]||s.boots;
      K.p('thigh'+k).cloth(legC[k]).seam(.02);K.p('shin'+k).cloth(legC[k]).seam(.02);
      limb(K.p('up'+k),sc,s.skin);limb(K.p('fo'+k),fc,s.skin);bootP(K.p('boot'+k),bc);handP(K.p('hand'+k),hc,hc===s.skin);
      const lx=sd*.09*B,hip=grp(g,lx,.91,0),hipI=grp(hip,-lx,-.91,0),knee=grp(hipI,lx,.49,0),kneeI=grp(knee,-lx,-.49,0);
      legs[k]={hip:hipI,knee:kneeI};J['hip'+k]=hip;J['knee'+k]=knee;
      K.m(hipI,cylR(.086*B,.07*B,.42),'thigh'+k,lx,.7,0);
      K.m(kneeI,ico(.066*B,0),legC[k],lx,.49,0);
      K.m(kneeI,cylR(.067*B,.054*B,.42),'shin'+k,lx,.29,0);
      const ank=grp(kneeI,lx,.09,0),ankI=grp(ank,-lx,-.09,0);J['ankle'+k]=ank;legs[k].ankle=ankI;
      K.m(kneeI,ico(.052*B,0),bc,lx,.09,0);
      K.m(ankI,box(.12*B,.1,.26),'boot'+k,lx,.06,.035);K.m(ankI,box(.126*B,.022,.27),'#1b1b1b',lx,.011,.035);
      const u=grp(g,sd*.25*B,1.42,0,{rz:sd*.09});upper[k]=u;
      K.m(u,ico(.07*B,0),sc,0,-.01,0);
      K.m(u,cylR(.058*B,.05*B,.3),'up'+k,0,-.15,0);
      const el=grp(u,0,-.3,0),a=grp(el,0,.3,0);arms[k]=a;J['elbow'+k]=el;
      K.m(a,ico(.05*B,0),fc,0,-.3,0);
      K.m(a,cylR(.05*B,.042*B,.27),'fo'+k,0,-.43,0);
      K.m(a,box(.075,.1,.06),'hand'+k,0,-.61,0);K.m(a,box(.024,.05,.026),hc,-sd*.026,-.596,.038);}
    return {g,arms,upper,legs,J,B};}

  /* ---------- ship crew liveries ---------- */
  const LIVS={civ:'Civilian',navy:'Navy',syn:'Syndicate',pir:'Pirate'};
  let crewLiv='civ';
  function outfit(liv,r){
    if(liv==='navy')return{shirt:'#1d5a96',pants:G.navyD,trim:G.white,acc:G.white,glow:G.vblue,boots:'#1c2732',gloves:G.navyD,hat:G.white,helm:G.white,emb:'navy',harness:G.white};
    if(liv==='syn')return{shirt:'#3d3c39',pants:'#2b2a28',trim:G.gold,acc:G.gold,glow:G.gold,boots:'#1a1a19',gloves:'#1f1f1e',hat:pick(r,['#F2C230','#C8302A']),helm:'#2f2e2c',emb:'syn',harness:G.gold};
    if(liv==='pir')return{shirt:pick(r,['#993C1D','#6b4a32','#5F5E5A','#7a3b22']),pants:pick(r,['#444441','#5a4a3a','#3b3734']),alt:pick(r,['#185FA5','#6b7780','#8a6a3a','#5F5E5A']),trim:null,acc:'#8a5a3a',glow:G.pGlow,boots:pick(r,['#2b2724','#633806']),gloves:'#3a2a20',hat:pick(r,['#8a6a4a','#7d7c76','#9a4b2a']),helm:'#6e5a48',emb:'pir',worn:true,harness:'#7a4a2a'};
    return{shirt:pick(r,['#6B7780','#7a6e5d','#5d6b4f','#4f6470','#806a7a','#8c7f63','#56707a']),pants:pick(r,['#3e4a52','#4a4136','#3d4434','#56524a','#2f3a40']),trim:null,acc:pick(r,['#5DCAA5','#85B7EB','#B8D23C','#ED93B1','#AFA9EC']),glow:G.tealG,boots:pick(r,['#2b2f31','#4a3526','#3a3a3a']),gloves:'#3a3d3f',hat:pick(r,HATS),helm:'#D3D1C7',emb:null,harness:'#B8D23C'};}
  function crewBody(K,c,extra){const o=c.o,s=Object.assign({shirt:o.shirt,pants:o.pants,boots:o.boots,gloves:o.gloves,skin:c.skin,hair:c.hair,style:c.style,facial:c.facial},extra||{});
    if(o.worn){if(c.flip<0)s.sleeveL=o.alt;else s.sleeveR=o.alt;s[c.flip<0?'legR':'legL']=shade(s.pants,1.2);}
    const b=body(K,s),T=K.p('torso');
    T.ln([[.5,.08],[.5,.75]],'rgba(0,0,0,.45)',1.5).r(.494,.08,.012,.04,'#B4B2A9');
    if(o.trim){T.r(0,0,1,.07,o.trim);['L','R'].forEach(k=>K.p('fo'+k).r(0,.86,1,.06,o.trim));
      K.p('thighL').r(.145,0,.05,1,o.trim);K.p('shinL').r(.145,0,.05,1,o.trim);K.p('thighR').r(.645,0,.05,1,o.trim);K.p('shinR').r(.645,0,.05,1,o.trim);}
    if(o.emb){emblem(K.p('upL'),.25,.3,o.emb,7);emblem(T,.42,.33,o.emb,5);}
    if(o.emb!=='pir'){T.r(.53,.27,.1,.04,shade(o.shirt,1.3)).r(.545,.284,.07,.012,'rgba(0,0,0,.5)');}
    if(o.worn){const r=K.r;for(let i=0;i<4;i++){const P=K.p(['torso','thighL','thighR','upR','shinL'][Math.floor(r()*5)]);P.patch(.15+r()*.6,.15+r()*.6,.1+r()*.12,.1+r()*.14,shade(o.shirt,.7+r()*.6));}
      T.ln([[.3,.86],[.36,.96],[.42,.86],[.48,.97]],'rgba(0,0,0,.45)',1);}
    return b;}

  /* ---------- roster ---------- */
  const FAC={crew:{name:'Ship crew',col:'--crew'},pirate:{name:'Pirates',col:'--pirate'},syn:{name:'Syndicate',col:'--syn'},navy:{name:'Navy',col:'--navy'}};
  const R=[
  {key:'pilot',fac:'crew',role:'Pilot',room:'Cockpit',name:'Ines Varga',notes:['Rounded flight helmet with a wraparound visor','Harness straps and leg loops are painted, not modelled','One-piece flight suit in the ship\'s livery'],
   build(K,r,c){const o=c.o,b=crewBody(K,c,{pants:o.shirt,gloves:'#3a3a38'}),g=b.g,T=K.p('torso'),Hn=o.harness;
    T.ln([[.36,.04],[.6,.74]],Hn,6).ln([[.64,.04],[.4,.74]],Hn,6).r(.47,.34,.06,.1,'#B4B2A9').r(.485,.36,.03,.06,'#5F5E5A');
    ['L','R'].forEach(k=>{K.p('thigh'+k).r(0,.06,1,.08,Hn).r(.38,.8,.24,.2,'#3a3a38');K.p('shin'+k).r(.38,0,.24,.16,'#3a3a38');});
    K.m(g,ico(.135),o.helm,0,1.625,0);
    K.g(g,new THREE.CylinderGeometry(.139,.139,.055,12,1,true,-1,2),o.glow==='#5DCAA5'?'#5DB0F0':o.glow,0,1.628,0,{ds:1});
    K.m(g,cylR(.09,.1,.04,8),o.acc,0,1.5,0);K.m(g,box(.07,.1,.05),shade(o.shirt,.75),.13,.72,.05);
    return b;}},
  {key:'engineer',fac:'crew',role:'Engineer',room:'Engine room',name:'Tobiah Rusk',notes:['Hard hat: seeded on civilian ships, yellow or red on Syndicate ships','Reflective bands and knee pads painted on','Toolbelt with pouches, wrench in hand'],
   build(K,r,c){const o=c.o,b=crewBody(K,c,{gloves:'#7a5236'}),g=b.g,band=o.trim||'#d8d8d0';
    const Ht=K.p('hat').fill(o.hat).noise(.05).vgrad(.12).r(0,.82,1,.18,shade(o.hat,.75));
    if(c.liv==='navy')Ht.r(0,.45,1,.18,G.navy);
    if(c.liv==='syn')Ht.txt(String(10+Math.floor(r()*89)),.25,.5,13,'#1a1a19');
    if(c.liv==='civ')Ht.r(.2,.35,.1,.3,shade(o.hat,.8)).r(.7,.35,.1,.3,shade(o.hat,.8));
    if(o.worn)for(let i=0;i<9;i++)Ht.dot(r(),.2+r()*.6,1+r()*2,'rgba(0,0,0,.35)');
    K.m(g,dome(.13,10,3),'hat',0,1.655,0);K.m(g,cylR(.165,.165,.016,10),shade(o.hat,.9),0,1.66,0);K.m(g,box(.03,.03,.24),o.hat,0,1.775,0);
    ['L','R'].forEach(k=>{K.p('fo'+k).r(0,.4,1,.1,band).r(0,.43,1,.03,o.trim?shade(band,.8):'#B8D23C');K.p('shin'+k).r(0,.5,1,.08,band);
      K.p('thigh'+k).r(.38,.8,.24,.2,'#454a3a');K.p('shin'+k).r(.38,0,.24,.18,'#454a3a');});
    K.m(g,cylR(.18,.18,.07,8),'#633806',0,.9,0,{s:[1,1,.76]});
    [[-.17,.06],[.17,.06],[0,.135]].forEach(p=>K.m(g,box(.07,.09,.05),'#854F0B',p[0],.87,p[1]));
    const a=b.arms.R;K.m(a,box(.026,.3,.022),'#B4B2A9',0,-.74,.03);K.m(a,new THREE.TorusGeometry(.035,.012,3,6),'#B4B2A9',0,-.9,.03);
    return b;}},
  {key:'gunner',fac:'crew',role:'Gunner',room:'Turret room',name:'Pell Achterberg',notes:['Quilted padded vest painted over the suit','Headset with boom mic, red targeting eyepiece','Flak collar against spall'],
   build(K,r,c){const o=c.o,b=crewBody(K,c,{gloves:'#3a3d3f'}),g=b.g,T=K.p('torso'),v=shade(o.shirt,.72);
    T.r(.22,.1,.56,.66,v);for(let i=0;i<7;i++){T.ln([[.22+i*.09,.1],[.22+i*.09-.12,.76]],'rgba(0,0,0,.35)',1).ln([[.22+i*.09,.1],[.22+i*.09+.12,.76]],'rgba(0,0,0,.35)',1);}
    T.ln([[.5,.1],[.5,.76]],'rgba(0,0,0,.6)',2);
    K.m(g,cylR(.2,.25,.09,8),G.steelD,0,1.45,0,{s:[1,1,.72]});
    rod(K,g,[-.115,1.61,0],[-.075,1.715,0],.01,'#3a3d3f');rod(K,g,[-.075,1.715,0],[.075,1.715,0],.01,'#3a3d3f');rod(K,g,[.075,1.715,0],[.115,1.61,0],.01,'#3a3d3f');
    for(const sd of [-1,1])K.m(g,cylR(.045,.045,.04,8),'#3a3d3f',sd*.105,1.61,0,{rz:PI/2});
    rod(K,g,[-.12,1.6,.015],[-.035,1.555,.1],.007,'#3a3d3f');K.m(g,box(.02,.015,.015),'#2b2b2a',-.035,1.555,.103);
    K.g(g,cylR(.026,.026,.04,6),G.red,.04,1.626,.112,{rx:PI/2});
    return b;}},
  {key:'security',fac:'crew',role:'Security',room:'Mess, corridors, berths',name:'Dana Mbeki',notes:['Everyday duty: breaking up crew fights, escorting, watching the brig','Stun baton in hand; sidearm stays holstered unless it is needed','Peaked duty cap, shoulder radio, vest stencilled SECURITY'],
   build(K,r,c){const o=c.o,b=crewBody(K,c,{gloves:'#3a3d3f'}),g=b.g,T=K.p('torso'),vest=shade(o.shirt,.62);
    T.r(.26,.12,.48,.52,vest).ln([[.5,.12],[.5,.64]],'rgba(0,0,0,.45)',1).r(.27,.28,.2,.06,'rgba(240,240,230,.85)').txt('SECURITY',.37,.31,7,vest).r(0,.36,.22,.07,'rgba(240,240,230,.75)').txt('SECURITY',.11,.395,7,vest);
    if(o.emb)emblem(T,.62,.24,o.emb,6);
    K.p('upL').r(0,.3,1,.14,o.acc);
    const capC=shade(o.shirt,.8);
    K.p('hat').fill(capC).noise(.05).vgrad(.1).r(0,.55,1,.2,o.acc).txt('SEC',.25,.3,10,'rgba(240,240,230,.85)');
    K.m(g,cylR(.112,.108,.07,10),'hat',0,1.685,0);K.m(g,dome(.112,10,2),capC,0,1.72,0,{s:[1,.5,1]});
    K.m(g,box(.16,.012,.08),'#1b1b1b',0,1.66,.115,{rx:-.25});
    K.m(g,box(.04,.06,.03),'#2b2f31',-.13,1.42,.1);K.m(g,box(.008,.05,.008),'#2b2f31',-.14,1.475,.1);K.g(g,box(.012,.008,.006),o.glow,-.12,1.43,.116);
    const Lh=b.legs.R.hip;K.m(Lh,box(.06,.16,.08),'#2b2f31',.17,.73,0);K.m(Lh,box(.1,.025,.09),'#2b2f31',.13,.8,0);
    K.m(Lh,box(.032,.075,.04),'#26292b',.17,.84,-.005,{rx:-.15});
    const a=b.arms.R;K.m(a,cylR(.018,.016,.36,6),'#2b2b2a',0,-.62,.13,{rx:PI/2-.35});K.m(a,cylR(.022,.022,.03,6),'#5F5E5A',0,-.63,.05,{rx:PI/2-.35});
    K.g(a,cylR(.017,.017,.035,6),o.glow,0,-.56,.3,{rx:PI/2-.35});
    return b;}},
  {key:'tactical',fac:'crew',role:'Tactical',room:'Airlocks and boarding',name:'Ruslan Okonkwo',notes:['Boarding response: called up when someone tries to cut in','Slab helmet with a glowing visor bar, chest plate and pauldrons','Compact carbine at the ready; two-point sling from the handguard and stock over the shoulder','Smart optic cabled to the helmet HUD, lens glowing in the ship colour'],
   build(K,r,c){const o=c.o,b=crewBody(K,c,{gloves:'#3a3d3f',helmet:true}),g=b.g,T=K.p('torso'),pl=shade(o.helm===G.white?G.navyD:'#3a3f42',1.1);
    T.r(.3,.14,.4,.46,pl).ln([[.3,.14],[.7,.14]],'rgba(255,255,255,.25)',1).ln([[.3,.6],[.7,.6]],'rgba(0,0,0,.5)',2).ln([[.5,.14],[.5,.6]],'rgba(0,0,0,.35)',1);
    for(let i=0;i<3;i++)T.r(.33+i*.12,.42,.09,.15,shade(pl,.8)).ln([[.33+i*.12,.42],[.42+i*.12,.42]],'rgba(255,255,255,.2)',1);
    if(o.emb)emblem(T,.5,.26,o.emb,7);
    K.p('upL').r(0,.3,1,.14,o.acc);
    K.p('helm').fill('#3a3f42').noise(.05).wrap(.3).r(0,.85,1,.15,'#2a2e30').ln([[0,.3],[1,.3]],'rgba(0,0,0,.4)',1).txt('TAC',.15,.55,10,o.acc);
    K.m(g,cylR(.132,.125,.24,8),'helm',0,1.625,0,{s:[1,1,.97]});K.m(g,dome(.13,8,2),'#3a3f42',0,1.745,0,{s:[1,.35,.97]});
    K.g(g,box(.2,.032,.02),o.glow,0,1.632,.124);
    for(const sd of [-1,1])K.m(g,dome(.1,6,2),'#3a3f42',sd*.27,1.44,0,{s:[1.15,.8,1.15]});
    for(const sd of [-1,1])K.m(b.legs[sd<0?'L':'R'].knee,box(.09,.1,.04),'#3a3f42',sd*.09,.5,.07);
    const Lh=b.legs.R.hip;K.m(Lh,box(.06,.16,.08),'#2b2f31',.17,.73,0);K.m(Lh,box(.1,.025,.09),'#2b2f31',.13,.8,0);K.m(Lh,box(.032,.075,.04),'#26292b',.17,.84,-.005,{rx:-.15});
    const rf=rifle(K,b.arms.R,o.glow,{x:0,y:-.64,z:.02});
    b.slings=[strap(K,g,rf.front,rf.rear,[[.15,1.3,.16],[.19,1.47,.11],[.22,1.535,0],[.19,1.47,-.11],[.15,1.25,-.15]],.008,'#2b2f31'),
      strap(K,g,rf.port,anchor(g,.125,1.585,-.03),[[.3,1.0,.06],[.29,1.3,.03],[.2,1.48,-.04]],.005,'#151515')];
    K.m(g,box(.02,.03,.03),'#151515',.125,1.585,-.03);
    return b;}},
  {key:'medic',fac:'crew',role:'Medic',room:'Medbay',name:'Yusuf Halloran',notes:['Caduceus (the staff of Hermes) on a green disc, not a red cross','White sleeves, sash strap and headband all painted','Head lamp and satchel modelled'],
   build(K,r,c){const o=c.o,wh='#E3E1DA',b=crewBody(K,c,{sleeveL:wh,sleeveR:wh,gloves:'#D3D1C7'}),g=b.g,T=K.p('torso');
    const cad=(P,fx,fy,s,sx)=>P.draw((cx,X0,Y,W,H)=>{const x=0,y=Y+fy*H,wh='#F1EFE8';cx.save();cx.translate(X0+fx*W,0);cx.scale(sx,1);
      cx.fillStyle=wh;cx.beginPath();cx.arc(x,y,s+1.5,0,PI*2);cx.fill();cx.fillStyle='#639922';cx.beginPath();cx.arc(x,y,s,0,PI*2);cx.fill();
      const top=y-s*.72,bot=y+s*.78,lw=Math.max(1,s*.09);cx.strokeStyle=wh;cx.fillStyle=wh;cx.lineCap='round';
      cx.lineWidth=lw;cx.beginPath();cx.moveTo(x,top);cx.lineTo(x,bot);cx.stroke();cx.beginPath();cx.arc(x,top-lw*.6,lw*1.1,0,PI*2);cx.fill();
      for(const sd of [-1,1]){cx.beginPath();cx.moveTo(x,top+lw);cx.quadraticCurveTo(x+sd*s*.5,top-s*.12,x+sd*s*.7,top+s*.02);cx.quadraticCurveTo(x+sd*s*.38,top+s*.08,x+sd*s*.22,top+s*.22);cx.closePath();cx.fill();}
      for(const sd of [-1,1]){cx.lineWidth=lw*.85;cx.beginPath();const y0=top+s*.32,y1=bot-s*.05;for(let i=0;i<=24;i++){const t=i/24,yy=y0+(y1-y0)*t,amp=s*.32*(1-t*.45);cx[i?'lineTo':'moveTo'](x+sd*amp*Math.sin(t*PI*3),yy);}cx.stroke();
        cx.beginPath();cx.arc(x+sd*s*.16,y0-s*.04,lw*.9,0,PI*2);cx.fill();}cx.restore();});
    cad(T,.4,.34,22,.55);cad(K.p('upR'),.75,.3,14,.6);
    T.ln([[.64,.02],[.36,.86]],'#C9C6BC',5);
    K.p('head').r(0,.27,1,.06,wh);
    K.g(g,box(.05,.035,.03),'#FAC775',0,1.672,.106);
    K.m(g,box(.14,.14,.07),'#C9C6BC',-.21,.9,.05);
    return b;}},
  {key:'loadmaster',fac:'crew',role:'Loadmaster',room:'Cargo bay',name:'Grit Solberg',notes:['Exo-frame hinged at the elbows and knees, clamped on with cuffs','Oversized power gloves','Hazard chevrons painted on the back; radio mast on the frame'],
   build(K,r,c){const o=c.o,b=crewBody(K,c),g=b.g,T=K.p('torso'),hz=o.trim||'#B8D23C';
    for(let i=0;i<6;i++)T.poly([[i*.04,.3],[i*.04+.02,.3],[i*.04+.06,.6],[i*.04+.04,.6]],i%2?'#1b1b1b':hz);
    for(let i=0;i<6;i++)T.poly([[1-i*.04,.3],[1-i*.04-.02,.3],[1-i*.04-.06,.6],[1-i*.04-.04,.6]],i%2?'#1b1b1b':hz);
    K.m(g,dome(.116,8,2),o.acc,0,1.648,0);K.m(g,box(.12,.012,.08),o.acc,0,1.655,.12);
    K.m(g,box(.62,.045,.06),'#9a9891',0,1.47,-.02);K.m(g,box(.045,.56,.045),'#9a9891',0,1.2,-.13);
    K.m(g,box(.04,.03,.04),'#5F5E5A',.2,1.507,-.02);rod(K,g,[.2,1.52,-.02],[.2,1.82,-.02],.008,'#9a9891');K.g(g,box(.025,.025,.025),o.glow,.2,1.83,-.02);
    for(const sd of [-1,1]){const k=sd<0?'L':'R',Lg=b.legs[k],U=b.upper[k],a=b.arms[k],fr='#9a9891',cu='#444441',hg='#5F5E5A';
      K.m(Lg.hip,cylR(.013,.013,.41,4),fr,sd*.175,.7,0);K.m(Lg.hip,cylR(.1,.1,.03,8),cu,sd*.09,.75,0);
      K.m(Lg.knee,cylR(.013,.013,.39,4),fr,sd*.175,.29,0);K.m(Lg.knee,cylR(.1,.1,.03,8),cu,sd*.09,.3,0);
      K.m(Lg.knee,cylR(.034,.034,.03,8),hg,sd*.186,.49,0,{rz:PI/2});
      K.m(U,cylR(.011,.011,.27,4),fr,sd*.066,-.155,0);K.m(U,cylR(.077,.077,.025,8),cu,0,-.15,0);
      K.m(a,cylR(.011,.011,.25,4),fr,sd*.066,-.43,0);K.m(a,cylR(.077,.077,.025,8),cu,0,-.43,0);
      K.m(a,cylR(.026,.026,.026,8),hg,sd*.078,-.3,0,{rz:PI/2});
      K.m(a,box(.115,.14,.1),shade(hz,.9),0,-.62,0);K.m(a,cylR(.062,.062,.05,6),'#444441',0,-.53,0);}
    return b;}},
  {key:'raider',fac:'pirate',role:'Raider',room:'Boarding party',name:'Scab',notes:['One bare tattooed arm, one stolen navy pauldron (side is seeded)','Patches and stitching painted; red bandana painted on the face','Orange goggles glow first in a dark corridor'],
   build(K,r,c){const f=c.flip,bareL=f<0;
    const b=body(K,{shirt:G.rust,pants:'#5F5E5A',legL:bareL?'#5F5E5A':'#444441',legR:bareL?'#444441':'#5F5E5A',sleeveL:bareL?c.skin:G.rust,sleeveR:bareL?G.rust:c.skin,boots:'#2b2724',bootL:bareL?'#2b2724':'#633806',bootR:bareL?'#633806':'#2b2724',skin:c.skin,hair:c.hair,style:'mohawk'}),g=b.g,T=K.p('torso');
    T.patch(.3,.2,.14,.16,'#6b4a32').patch(.58,.45,.12,.12,'#5F5E5A').ln([[.42,.6],[.5,.7],[.44,.8]],'rgba(0,0,0,.5)',1);
    emblem(T,.15,.3,'pir',5);
    ['up','fo'].forEach(p=>{const P=K.p(p+(bareL?'L':'R')),tc='rgba(20,60,70,.75)';P.ln([[.3,.1],[.6,.3],[.35,.5],[.65,.75]],tc,2).ln([[.45,.05],[.45,.9]],tc,1);});
    K.p('thigh'+(bareL?'R':'L')).patch(.35,.3,.3,.25,'#6b4a32');
    K.p('head').poly([[.3,.53],[.7,.53],[.62,.72],[.5,.86],[.38,.72]],G.red).ln([[.36,.6],[.64,.6]],shade(G.red,.7),1);
    for(let i=0;i<8;i++){const a=i/8*PI*2+.2;K.m(g,cone(.042,.12,3),G.rust,Math.sin(a)*.165,.96,Math.cos(a)*.11,{rx:PI});}
    K.m(g,box(.15,.07,.15),G.navy,-f*.29,1.46,0,{rz:-f*.3});
    for(let i=0;i<4;i++)K.m(g,cone(.02,.07+i%2*.02,3),c.hair,0,1.75,-.07+i*.045);
    for(const sd of [-1,1])K.g(g,cylR(.028,.028,.03,6),G.pGlow,sd*.04,1.668,.1,{rx:PI/2});
    K.m(g,new THREE.TorusGeometry(.105,.01,3,10),'#1e1a17',0,1.668,0,{rx:PI/2});
    const a=b.arms[bareL?'L':'R'];K.m(a,box(.022,.44,.055),'#B4B2A9',0,-.86,.03);K.m(a,box(.03,.1,.04),'#3a2a20',0,-.62,.03);
    return b;}},
  {key:'captain',fac:'pirate',role:'Captain',room:'Someone else\'s bridge',name:'Mother Corrow',notes:['Long torn coat, patched and stitched in the skin','Prosthetic arm with painted panel lines and rivets','Trophy plates stacked on one shoulder, one red eye'],
   build(K,r,c){const f=c.flip,metL=f<0,mk=metL?'L':'R';
    const b=body(K,{shirt:G.rustD,pants:'#3b3734',boots:'#1f1d1b',['sleeve'+mk]:G.steel,['hand'+mk]:G.steelD,skin:c.skin,hair:c.hair,style:'long',facial:'beard'}),g=b.g,T=K.p('torso');
    T.ln([[.66,.02],[.34,.9]],G.red,7).patch(.25,.55,.12,.14,'#5a2a14');
    ['up','fo'].forEach(p=>{const P=K.p(p+mk).fill(G.steel).noise(.05).wrap(.35);P.ln([[0,.33],[1,.33]],'rgba(0,0,0,.5)',1).ln([[0,.66],[1,.66]],'rgba(0,0,0,.5)',1);for(let i=0;i<6;i++)P.dot(i/6+.08,.33,1.2,'#d0cfc8').dot(i/6+.08,.66,1.2,'#d0cfc8');});
    const Co=K.p('coat').cloth(G.rustD);Co.ln([[.5,0],[.5,1]],'rgba(0,0,0,.6)',2);for(let i=0;i<5;i++)Co.patch(r()*.9,.1+r()*.6,.06+r()*.06,.12+r()*.12,shade(G.rustD,.7+r()*.5));
    K.m(g,skirtGeo(.17,.31,.66,7,true),'coat',0,.63,0,{ds:1});
    for(const sd of [-1,1])K.m(b.legs[sd<0?'L':'R'].knee,cylR(.072,.072,.22,6),'#1f1d1b',sd*.09,.18,0);
    const sx=-f*.29;[[G.steelD,0],[G.navy,.05],['#B05535',.1]].forEach((p,i)=>K.m(g,box(.17-i*.02,.035,.16-i*.02),p[0],sx,1.45+p[1],0,{rz:-f*(.25+i*.12)}));
    K.m(g,cone(.125,.27,5),G.steel,0,1.79,0);K.m(g,cylR(.135,.135,.025,8),G.steelD,0,1.665,0);
    K.g(g,box(.04,.022,.01),G.red,.036,1.626,.108);
    return b;}},
  {key:'enforcer',fac:'syn',role:'Enforcer',room:'Port concourse',name:'Mr. Lisle',notes:['Knee-length coat with painted lapels and buttons','Gold cap band is the only colour on them','Half-mask painted on the face; baton in hand'],
   build(K,r,c){const b=body(K,{shirt:G.syn,pants:'#323130',boots:'#1a1a19',gloves:'#1a1a19',skin:c.skin,hair:c.hair,style:'buzz'}),g=b.g,T=K.p('torso');
    T.poly([[.42,0],[.5,.5],[.38,.3]],'#1a1a19').poly([[.58,0],[.5,.5],[.62,.3]],'#1a1a19');for(let i=0;i<3;i++)T.dot(.53,.55+i*.12,1.6,'#4a4946');
    K.p('head').r(.33,.56,.34,.24,'#1a1a19').ln([[.34,.67],[.66,.67]],'#2f2e2c',1);
    const Co=K.p('coat').cloth(G.syn);Co.ln([[.5,0],[.5,1]],'rgba(0,0,0,.7)',2).ln([[0,.15],[1,.15]],'rgba(0,0,0,.3)',1);
    K.m(g,skirtGeo(.165,.255,.5,8),'coat',0,.69,0,{ds:1});
    K.m(g,cylR(.085,.125,.14,8,true),G.syn,0,1.515,0,{ds:1});
    K.p('helm').fill(G.syn).noise(.04).wrap(.3).r(0,.68,1,.24,G.gold).r(0,.74,1,.04,shade(G.gold,.7));
    K.m(g,cylR(.112,.112,.075,8),'helm',0,1.69,0);K.m(g,box(.13,.012,.075),G.syn,0,1.66,.1);
    K.m(b.arms.R,cylR(.016,.016,.36,6),G.steelD,0,-.74,.05,{rx:.35});
    return b;}},
  {key:'heavy',fac:'syn',role:'Heavy',room:'Wherever the hull docks',name:'Bruno Kasza',notes:['Bulked frame to pair with the enforcer_heavy hull','Armour plating painted; riot shield with stencilling and scuffs','Gold visor slit'],
   build(K,r,c){const b=body(K,{shirt:G.syn,pants:'#3b3a37',boots:'#1a1a19',gloves:G.synL,skin:c.skin,hair:c.hair,style:'buzz',bulk:1.28,helmet:true}),g=b.g,T=K.p('torso');
    T.r(.26,.12,.48,.5,G.synL).ln([[.26,.36],[.74,.36]],'rgba(0,0,0,.5)',2).ln([[.26,.12],[.74,.12]],'rgba(255,255,255,.18)',1);for(let i=0;i<6;i++)T.ln([[.3+r()*.4,.15+r()*.4],[.32+r()*.4,.17+r()*.4]],'rgba(255,255,255,.18)',1);
    ['thighL','thighR'].forEach(k=>K.p(k).r(.3,.1,.4,.6,G.synL));
    for(const sd of [-1,1])K.m(g,box(.21,.12,.21),G.synL,sd*.35,1.47,0,{rz:sd*-.15});
    K.p('helm').fill(G.synL).noise(.05).wrap(.3).ln([[0,.25],[1,.25]],'rgba(0,0,0,.4)',1);
    K.m(g,cylR(.137,.13,.25,8),'helm',0,1.625,0);K.m(g,dome(.136,8,2),G.synL,0,1.75,0,{s:[1,.35,1]});
    K.g(g,box(.16,.018,.02),G.gold,0,1.636,.13);
    const Sh=K.p('coat').fill('#55544f').noise(.07).vgrad(.08).r(0,.26,1,.07,G.gold).r(.3,.42,.4,.1,'#2b2b2a').txt('R-0'+(1+Math.floor(r()*9)),.5,.75,14,'rgba(0,0,0,.55)');
    for(let i=0;i<10;i++)Sh.ln([[r(),r()],[r(),r()]],'rgba(255,255,255,.12)',1);
    b.hold={L:1};const sg=grp(g,-.35,1.0,.17,{ry:-.35});K.m(sg,box(.44,.78,.035),'coat');rod(K,g,[-.37,.82,.02],[-.36,.85,.15],.014,'#2b2b2a');K.m(g,box(.03,.12,.03),'#2b2b2a',-.36,.85,.15);
    return b;}},
  {key:'fixer',fac:'syn',role:'Fixer',room:'A quiet booth',name:'Celeste Aumont',notes:['No armour, face showing: talk, don\'t shoot','Suit, shirt and gold tie all painted on','Datapad for quoting the price of silence'],
   build(K,r,c){const b=body(K,{shirt:G.syn,pants:G.syn,boots:'#412402',skin:c.skin,hair:c.hair,style:'slick',bulk:.94}),g=b.g,T=K.p('torso');
    T.poly([[.42,0],[.58,0],[.5,.45]],G.white).poly([[.485,.08],[.515,.08],[.525,.52],[.5,.58],[.475,.52]],G.gold);
    T.poly([[.4,0],[.5,.5],[.36,.32]],'#1a1a19').poly([[.6,0],[.5,.5],[.64,.32]],'#1a1a19').r(.33,.28,.06,.03,G.white);
    K.p('pelvis').r(0,0,1,.18,'#1a1a19');
    K.g(b.arms.R,box(.09,.13,.012),G.tealG,0,-.63,.065,{rx:-.5});
    return b;}},
  {key:'marine',fac:'navy',role:'Marine',room:'Boarding and inspection',name:'Pvt. Okafor',notes:['Chest rig with three spare rifle magazines in open-top pouches, radio and admin pouch','Square pauldrons with white trim','Rifle across the chest on a two-point sling; smart optic cabled up to the helmet HUD','T-visor helmet; chevron and plate seams painted'],
   build(K,r,c){const b=body(K,{shirt:G.navy,pants:G.navyD,boots:'#1c2732',gloves:G.navyD,skin:c.skin,helmet:true}),g=b.g,T=K.p('torso');
    T.r(.3,.14,.4,.48,G.navyD).ln([[.3,.14],[.7,.14]],'rgba(255,255,255,.25)',1).ln([[.5,.14],[.5,.62]],'rgba(0,0,0,.4)',1);
    T.ln([[.44,.3],[.5,.38],[.56,.3]],G.white,3).ln([[.44,.36],[.5,.44],[.56,.36]],G.white,3);emblem(K.p('upL'),.25,.3,'navy',7);
    ['thighL','thighR','shinL','shinR'].forEach(k=>K.p(k).r(.34,.2,.32,.5,shade(G.navyD,.9)));
    K.p('pad').fill(G.navyD).noise(.05).vgrad(.1).r(0,.72,1,.16,G.white);
    for(const sd of [-1,1])K.m(g,box(.15,.11,.15),'pad',sd*.29,1.45,0);
    K.p('helm').fill(G.navyD).noise(.04).wrap(.3).r(0,.88,1,.08,G.white).txt(String(100+Math.floor(r()*899)),.0,.5,10,'rgba(238,237,230,.7)');
    K.m(g,cylR(.132,.126,.25,8),'helm',0,1.625,0);K.m(g,dome(.131,8,2),G.navyD,0,1.75,0,{s:[1,.3,1]});
    K.g(g,box(.18,.03,.02),G.vblue,0,1.645,.125);K.g(g,box(.034,.09,.02),G.vblue,0,1.6,.125);
    const rig='#2a3542',rigD='#1f2832',mz='#33373a';
    K.m(g,box(.3,.15,.03),rig,0,1.11,.122);for(let i=0;i<4;i++)K.m(g,box(.29,.006,.004),rigD,0,1.06+i*.03,.138);
    [-.085,0,.085].forEach(x=>{K.m(g,box(.064,.095,.036),rig,x,1.105,.152);K.m(g,box(.062,.008,.038),rigD,x,1.15,.152);
      K.m(g,box(.026,.032,.03),mz,x,1.168,.152,{rx:-.08});K.m(g,box(.028,.006,.032),'#151515',x,1.186,.152,{rx:-.08});
      K.m(g,box(.005,.03,.038),'#151515',x,1.16,.152);});
    K.m(g,box(.07,.05,.02),rig,.11,1.215,.135);K.m(g,box(.05,.04,.03),'#151515',-.105,1.215,.135);K.g(g,box(.006,.006,.004),G.vblue,-.095,1.225,.151);
    for(const sd of [-1,1]){rod(K,g,[sd*.12,1.18,.13],[sd*.125,1.44,.1],.011,rig);rod(K,g,[sd*.125,1.44,.1],[sd*.13,1.48,0],.011,rig);rod(K,g,[sd*.13,1.48,0],[sd*.12,1.42,-.115],.011,rig);rod(K,g,[sd*.12,1.42,-.115],[sd*.1,1.12,-.12],.011,rig);}
    K.m(g,cylR(.178,.168,.035,8),rig,0,1.05,0,{s:[1,1,.68]});
    const mq=new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(0,0,1),new THREE.Vector3(0,1,0),new THREE.Vector3(-1,0,0)));
    mq.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),.5));
    const rf=rifle(K,g,G.vblue,{q:mq,x:.02,y:1.14,z:.235});
    b.slings=[strap(K,g,rf.front,rf.rear,[[-.2,1.3,.15],[-.2,1.47,.11],[-.22,1.535,0],[-.18,1.45,-.14],[.12,1.3,-.16],[.23,1.28,-.02]],.009,'#1c2732'),
      strap(K,g,rf.port,anchor(g,.125,1.585,-.03),[[.07,1.4,.19],[.15,1.48,.1]],.005,'#151515')];
    K.m(g,box(.02,.03,.03),'#151515',.125,1.585,-.03);
    return b;}},
  {key:'officer',fac:'navy',role:'Officer',room:'Customs and command',name:'Lt. Imre Vass',notes:['White belt, placket, cuffs and trouser stripes painted','Beret, so the outline never matches a Syndicate cap','Rank pips on the collar'],
   build(K,r,c){const b=body(K,{shirt:G.navy,pants:G.navyD,boots:'#161616',skin:c.skin,hair:c.hair,style:'short'}),g=b.g,T=K.p('torso');
    T.r(.49,.06,.02,.8,G.white).r(0,0,1,.06,G.navyD);for(let i=0;i<3;i++)T.dot(.4+i*.035,.03,1.5,G.gold);
    K.p('pelvis').r(0,0,1,.4,G.white).r(.47,0,.06,.4,'#B4B2A9');
    K.p('thighL').r(.145,0,.05,1,G.white);K.p('shinL').r(.145,0,.05,1,G.white);K.p('thighR').r(.645,0,.05,1,G.white);K.p('shinR').r(.645,0,.05,1,G.white);
    ['L','R'].forEach(k=>K.p('fo'+k).r(0,.8,1,.1,G.white));
    for(const sd of [-1,1])K.m(g,box(.12,.025,.1),G.white,sd*.21,1.455,0);
    K.m(g,ico(.12),G.navyD,.015,1.715,0,{s:[1.12,.36,1.07],rz:-.2});K.m(g,box(.025,.03,.01),G.white,-.065,1.715,.105);
    return b;}}
  ];
  const byKey={};R.forEach(x=>byKey[x.key]=x);

  /* ======================================================================
   * THE SKIN KIT: one atlas per body, painted where there is a canvas
   * ====================================================================== */
  function Kit(seed) {
    var cv = null, x = null;
    if (typeof document !== 'undefined' && document.createElement) {
      try { cv = document.createElement('canvas'); cv.width = cv.height = S; x = cv.getContext('2d'); } catch (e) { cv = null; x = null; }
    }
    if (!x) { cv = null; x = STUB_CTX; }
    var r = rng(seed ^ 0x9e3779b9);
    x.fillStyle = '#0b0d0e'; x.fillRect(0, 0, S, S);
    var sw = {}, flat = {}, n = 0;
    function slot() { var cx = (n % 32) * 16, cy = 352 + Math.floor(n / 32) * 16; n++; return [cx, cy]; }
    var K = {
      cv: cv, r: r, straps: [], meshes: [],
      p: function (name) { return painter(x, REG[name], r); },
      /* A bevelled swatch: a flat colour with a light top-left and a dark
       * bottom-right edge, so a small box still reads as a solid. */
      sw: function (c) {
        if (!sw[c]) {
          var s = slot(), cx = s[0], cy = s[1];
          x.fillStyle = c; x.fillRect(cx, cy, 16, 16);
          x.fillStyle = shade(c, 1.16); x.fillRect(cx, cy, 16, 2); x.fillRect(cx, cy, 2, 16);
          x.fillStyle = shade(c, 0.68); x.fillRect(cx, cy + 14, 16, 2); x.fillRect(cx + 14, cy, 2, 16);
          sw[c] = [cx, cy, 16, 16];
        }
        return sw[c];
      },
      /* A plain swatch for the self-lit parts — a lamp is one colour. */
      flat: function (c) {
        if (!flat[c]) { var s = slot(); x.fillStyle = c; x.fillRect(s[0], s[1], 16, 16); flat[c] = [s[0], s[1], 16, 16]; }
        return flat[c];
      },
      m: function (p, geo, src, X, Y, Z, o) {
        mapUV(geo, REG[src] || K.sw(src));
        var m = new Node(geo);
        p.add(place(m, X, Y, Z, o));
        return m;
      },
      g: function (p, geo, c, X, Y, Z, o) {
        mapUV(geo, K.flat(c));
        var m = new Node(geo);
        m.emis = 1;
        p.add(place(m, X, Y, Z, o));
        return m;
      },
      done: function () {}
    };
    return K;
  }

  /* ---- the model, flattened to what the GPU draws ------------------------
   * BONES. The joints the generator already makes (body() returns them as
   * J, plus the two upper arms) become the skeleton. Every mesh rides the
   * nearest joint above it, so a wrench in a hand bends with the elbow and a
   * boot turns with the ankle, exactly as they did on the turntable.
   *
   * STRAPS are the one thing that is not rigid: a sling runs from a swivel
   * on the gun (which moves with the hand) round the shoulder (which does
   * not) and back to the stock. Each strap segment is a thin tube whose two
   * end rings ride the bones of the two points it joins, so it stretches
   * with the arm — the same thing updStrap did on the turntable, with no
   * per-frame rebuild. */
  var BONES = ['root', 'hipL', 'kneeL', 'ankleL', 'hipR', 'kneeR', 'ankleR', 'shL', 'elbowL', 'shR', 'elbowR'];

  function finalize(K, b, rootNode) {
    var boneNode = { root: b.g, shL: b.upper.L, shR: b.upper.R };
    ['L', 'R'].forEach(function (k) {
      boneNode['hip' + k] = b.J['hip' + k]; boneNode['knee' + k] = b.J['knee' + k];
      boneNode['ankle' + k] = b.J['ankle' + k]; boneNode['elbow' + k] = b.J['elbow' + k];
    });
    var idOf = new Map();
    BONES.forEach(function (n, i) { idOf.set(boneNode[n], i); });
    /* World matrices in the rest pose. */
    var world = new Map();
    (function walk(n, parentW) {
      var w = m4mul(parentW, localMatrix(n));
      world.set(n, w);
      n.children.forEach(function (c) { walk(c, w); });
    })(rootNode, m4());
    function boneOf(n) {
      for (var p = n; p; p = p.parent) if (idOf.has(p)) return idOf.get(p);
      return 0;
    }
    var pos = [], uv = [], bone = [], emis = [];
    function emit(n) {
      if (n.geo) {
        var W = world.get(n), P = n.geo.attributes.position, U = n.geo.attributes.uv, bi = boneOf(n.parent);
        for (var i = 0; i < P.count; i++) {
          var q = m4apply(W, P.getX(i), P.getY(i), P.getZ(i));
          pos.push(q[0], q[1], q[2]); uv.push(U.getX(i), U.getY(i)); bone.push(bi); emis.push(n.emis);
        }
      }
      n.children.forEach(emit);
    }
    emit(rootNode);
    /* The straps, built at rest between their points and skinned per ring. */
    K.straps.forEach(function (s) {
      var gW = world.get(s.g), w0 = world.get(s.a0), w1 = world.get(s.a1);
      var pts = [[w0[12], w0[13], w0[14]]].concat(s.via.map(function (v) { return m4apply(gW, v.x, v.y, v.z); }), [[w1[12], w1[13], w1[14]]]);
      var bones = [boneOf(s.a0)].concat(s.via.map(function () { return boneOf(s.g); }), [boneOf(s.a1)]);
      for (var i = 0; i + 1 < pts.length; i++) {
        var A = new V3(pts[i][0], pts[i][1], pts[i][2]), B = new V3(pts[i + 1][0], pts[i + 1][1], pts[i + 1][2]);
        var d = B.clone().sub(A), L = d.length();
        var g = cylR(s.r, s.r, 1, 5); mapUV(g, K.sw(s.col));
        var seg = new Node(g);
        seg.position.copy(A).add(B).multiplyScalar(0.5);
        seg.quaternion.setFromUnitVectors(new V3(0, 1, 0), d.normalize());
        seg.scale.set(1, L, 1);
        var W = localMatrix(seg), P = g.attributes.position, U = g.attributes.uv;
        for (var k = 0; k < P.count; k++) {
          var q = m4apply(W, P.getX(k), P.getY(k), P.getZ(k));
          pos.push(q[0], q[1], q[2]); uv.push(U.getX(k), U.getY(k));
          bone.push(P.getY(k) < 0 ? bones[i] : bones[i + 1]); emis.push(0);
        }
      }
    });
    /* The skeleton: each bone's rest matrix, and its rest matrix relative
     * to the bone above it, which is what a pose rotates about. */
    var restW = BONES.map(function (n) { return world.get(boneNode[n]); });
    var parent = BONES.map(function (n) {
      if (n === 'root') return -1;
      for (var p = boneNode[n].parent; p; p = p.parent) if (idOf.has(p)) return idOf.get(p);
      return 0;
    });
    var rel = BONES.map(function (n, i) { return parent[i] < 0 ? restW[i] : m4mul(m4inv(restW[parent[i]]), restW[i]); });
    return {
      pos: new Float32Array(pos), uv: new Float32Array(uv), bone: new Float32Array(bone), emis: new Float32Array(emis),
      count: pos.length / 3, tris: pos.length / 9,
      bones: { names: BONES, parent: parent, rel: rel, restInv: restW.map(m4inv) }
    };
  }

  /* ---- the people there are ------------------------------------------- */
  var ROLES = R.map(function (x) { return { key: x.key, fac: x.fac, role: x.role, room: x.room, notes: x.notes.slice() }; });
  var LIVERIES = Object.keys(LIVS);

  /* One body, built once and cached by its key. `liv` only matters to the
   * ship-crew roles; the faction roles carry their own colours. */
  var CACHE = {};
  function build(key, name, liv) {
    var ch = byKey[key];
    if (!ch) return null;
    liv = LIVS[liv] ? liv : 'civ';
    var cacheKey = key + '|' + name + '|' + (ch.fac === 'crew' ? liv : '');
    if (CACHE[cacheKey]) return CACHE[cacheKey];
    var pr = rng(hash(name + '|' + key));
    var c = { skin: pick(pr, SKIN), hair: pick(pr, HAIR), style: pick(pr, STYLES), facial: pr() < .3 ? 'stubble' : null,
              h: .96 + pr() * .08, flip: pr() < .5 ? -1 : 1, liv: liv };
    if (ch.fac === 'crew') c.o = outfit(liv, rng(hash(name + '|' + key + '|' + liv)));
    var K = Kit(hash(key + name)), b = ch.build(K, pr, c);
    b.g.scale.setScalar(c.h * (key === 'heavy' ? 1.06 : 1));
    var root = new Node();
    root.add(b.g);
    var m = finalize(K, b, root);
    m.key = key; m.name = name; m.liv = liv; m.fac = ch.fac; m.role = ch.role;
    m.canvas = K.cv; m.hold = b.hold || {}; m.height = 1.78 * c.h * (key === 'heavy' ? 1.06 : 1);
    m.look = c;
    CACHE[cacheKey] = m;
    return m;
  }

  /* ---- posing -----------------------------------------------------------
   * `p` is { x, y, z, yaw, sink, and a rotation in radians for any of the
   * joints: hipL/R, kneeL/R, ankleL/R, shL/R, elbowL/R }. Every joint is
   * positive in flexion: a hip brings the thigh forward, a knee bends, an
   * ankle lifts the toes, a shoulder swings the arm forward and an elbow
   * raises the forearm. So a squat with flat feet is hip k/2, knee k,
   * ankle k/2 — the turntable's ∠ button. Yaw turns the body so it faces (sin yaw, 0, cos yaw), which is
   * walk.js's convention for the player. Writes one 4x4 per bone into `out`
   * (column-major, the GPU's layout): the matrix that carries a vertex from
   * the rest pose to this pose, in the figure's place in the room. */
  var JOINT_SIGN = { hipL: -1, hipR: -1, kneeL: 1, kneeR: 1, ankleL: -1, ankleR: -1, shL: -1, shR: -1, elbowL: -1, elbowR: -1 };
  function skin(model, p, out) {
    var B = model.bones, n = B.names.length, W = new Array(n);
    out = out || new Float32Array(16 * n);
    var place = m4mul(m4mul(m4trans(p.x || 0, (p.y || 0) - (p.sink || 0), p.z || 0), m4rotY(p.yaw || 0)), m4rotX(p.lean || 0));
    for (var i = 0; i < n; i++) {
      var name = B.names[i], a = p[name] || 0;
      if (a && model.hold && model.hold[name.slice(-1)] && name.indexOf('elbow') === 0) a = 0;
      var local = B.parent[i] < 0 ? m4mul(place, B.rel[i]) : m4mul(W[B.parent[i]], B.rel[i]);
      W[i] = a ? m4mul(local, m4rotX(a * JOINT_SIGN[name])) : local;
      var S = m4mul(W[i], B.restInv[i]);
      for (var k = 0; k < 16; k++) out[i * 16 + k] = S[k];
    }
    return out;
  }

  /* Where a vertex of the model is under a pose — for the tests, and for
   * the 2D fallback, which has no vertex shader to do it. */
  function posed(model, mats, i) {
    var b = model.bone[i] | 0, o = b * 16, x = model.pos[i * 3], y = model.pos[i * 3 + 1], z = model.pos[i * 3 + 2];
    return [mats[o] * x + mats[o + 4] * y + mats[o + 8] * z + mats[o + 12],
            mats[o + 1] * x + mats[o + 5] * y + mats[o + 9] * z + mats[o + 13],
            mats[o + 2] * x + mats[o + 6] * y + mats[o + 10] * z + mats[o + 14]];
  }

  /* A colour per triangle, read off the painted skin at the triangle's
   * middle: the 2D fallback's paint. Cached on the model. Empty where there
   * is no canvas to read. */
  function faceColours(model) {
    if (model._faces) return model._faces;
    var out = [];
    var data = null;
    try { if (model.canvas) data = model.canvas.getContext('2d').getImageData(0, 0, S, S).data; } catch (e) { data = null; }
    for (var t = 0; t < model.tris; t++) {
      var u = 0, v = 0;
      for (var k = 0; k < 3; k++) { u += model.uv[(t * 3 + k) * 2]; v += model.uv[(t * 3 + k) * 2 + 1]; }
      u /= 3; v /= 3;
      if (!data) { out.push('#8a8f94'); continue; }
      var px = Math.max(0, Math.min(S - 1, Math.floor(u * S))), py = Math.max(0, Math.min(S - 1, Math.floor((1 - v) * S)));
      var o = (py * S + px) * 4;
      out.push('rgb(' + data[o] + ',' + data[o + 1] + ',' + data[o + 2] + ')');
    }
    model._faces = out;
    return out;
  }

  var NpcModel = {
    ROLES: ROLES, LIVERIES: LIVERIES, BONES: BONES, ATLAS: S,
    build: build, skin: skin, posed: posed, faceColours: faceColours,
    rifleRules: function () { return RL.rules.map(function (r) { return { rule: r[0], ok: !!r[1] }; }); },
    hash: hash
  };

  global.NpcModel = NpcModel;
  if (typeof module !== 'undefined' && module.exports) module.exports = NpcModel;
})(typeof window !== 'undefined' ? window : globalThis);
