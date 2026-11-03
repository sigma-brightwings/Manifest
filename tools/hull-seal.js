/* hull-seal.js — is a hull's skin closed? (2026-11-03)
 *
 * Shared by tools/glb2hulls.js (which warns as it imports) and the tests
 * (test/hull-seal.test.js over the library, test/airlock.test.js over the
 * hulls as the game draws them), so the importer and the test ask the same
 * question the same way.
 *
 * Two measures, on a mesh { v: [[x,y,z]...], f: [[a,b,c]...] }:
 *
 *   openEdges  - edges with an odd number of faces, corners welded by
 *                position. INFORMATIONAL: every model in the library has
 *                some (an engine bell's mouth, an upright decal) and most
 *                are harmless, so this is reported, not failed on.
 *   oddColumns - vertical rays (the way a walker under her looks, and the
 *                way the hangar's clearance field reads her) through a grid
 *                of columns, each crossing counted. A closed skin is crossed
 *                an even number of times by any ray; an odd column is a hole
 *                or a lone sheet the ray found. THIS is the one that fails:
 *                it was the measure that found the Cutter's lidless blisters
 *                and the Crawler's open frame, and it reads 0 on every hull
 *                tools/glb-patch.js has mended.
 *
 * The grid is offset by irrational-looking fractions of a cell so a column
 * does not run exactly down a seam between two triangles, where a crossing
 * would be counted twice or not at all; no de-duplication of crossings,
 * because two coincident faces (a sheet and its back) are two crossings,
 * and that is the point.
 */
'use strict';
(function (root) {
  var OX = 0.3173, OZ = 0.4419;

  function openEdges(mesh) {
    var key = mesh.v.map(function (p) { return p[0] + ',' + p[1] + ',' + p[2]; }), E = {};
    mesh.f.forEach(function (fc) {
      for (var k = 0; k < fc.length; k++) {
        var a = key[fc[k]], b = key[fc[(k + 1) % fc.length]];
        if (a === b) continue;
        var kk = a < b ? a + '|' + b : b + '|' + a;
        E[kk] = (E[kk] || 0) + 1;
      }
    });
    var n = 0;
    for (var e in E) if (E[e] % 2) n++;
    return n;
  }

  /* `step` in the mesh's own units. `xf` (optional) maps a vertex to the
   * frame the columns are laid in (e.g. plan metres). `faceTag` (optional,
   * per face) names where a face came from: the result then says which
   * tags are crossed an odd number of times in odd columns. */
  function oddColumns(mesh, step, xf, faceTag) {
    var V = xf ? mesh.v.map(xf) : mesh.v, cols = {}, G = step;
    for (var fi = 0; fi < mesh.f.length; fi++) {
      var fc = mesh.f[fi];
      for (var k = 1; k + 1 < fc.length; k++) {
        var A = V[fc[0]], B = V[fc[k]], C = V[fc[k + 1]];
        var d = (B[2] - C[2]) * (A[0] - C[0]) + (C[0] - B[0]) * (A[2] - C[2]);
        if (Math.abs(d) < 1e-14) continue;          // upright: no vertical ray crosses it
        var x0 = Math.min(A[0], B[0], C[0]), x1 = Math.max(A[0], B[0], C[0]);
        var z0 = Math.min(A[2], B[2], C[2]), z1 = Math.max(A[2], B[2], C[2]);
        for (var i = Math.ceil(x0 / G - OX); i <= Math.floor(x1 / G - OX); i++) {
          for (var j = Math.ceil(z0 / G - OZ); j <= Math.floor(z1 / G - OZ); j++) {
            var x = (i + OX) * G, z = (j + OZ) * G;
            var l1 = ((B[2] - C[2]) * (x - C[0]) + (C[0] - B[0]) * (z - C[2])) / d;
            var l2 = ((C[2] - A[2]) * (x - C[0]) + (A[0] - C[0]) * (z - C[2])) / d;
            if (l1 < 0 || l2 < 0 || 1 - l1 - l2 < 0) continue;
            var key = i + ',' + j, c = cols[key] || (cols[key] = { n: 0, y: Infinity, tags: faceTag ? {} : null });
            c.n++;
            var y = l1 * A[1] + l2 * B[1] + (1 - l1 - l2) * C[1];
            if (y < c.y) c.y = y;
            if (faceTag) { var t = faceTag[fi]; c.tags[t] = (c.tags[t] || 0) + 1; }
          }
        }
      }
    }
    var odd = [], by = {}, total = 0;
    for (var kc in cols) {
      total++;
      var col = cols[kc];
      if (!(col.n % 2)) continue;
      var ij = kc.split(',');
      odd.push({ x: (+ij[0] + OX) * G, z: (+ij[1] + OZ) * G, low: col.y });
      if (col.tags) for (var tg in col.tags) if (col.tags[tg] % 2) by[tg] = (by[tg] || 0) + 1;
    }
    return { odd: odd, columns: total, by: by };
  }

  var api = { openEdges: openEdges, oddColumns: oddColumns };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.HullSeal = api;
})(typeof window !== 'undefined' ? window : globalThis);
