/* cargokit.js — the cargo containers in a hold, one kind per kind of cargo
 * (2026-10-30).
 *
 * Astra: "let's create some different models for the different cargo
 * types." Nine containers came back from Claude Design (ref/cargo/: the
 * GLBs and cargo_specs.json); tools/cargo-kit.cjs turns the sheet into
 * src/cargokit-data.js, and this builds them into the hold's own mesh
 * format — { v, f, c }, one colour a face, '!' for a self-lit one — so they
 * draw with the rest of the deck and cost nothing extra to load.
 *
 *   kindFor(cid)                         which container a commodity ships in
 *   build(m, kind, o)                    one container into mesh m:
 *       o.x, o.y, o.z    where its floor-centre goes (metres, deck frame)
 *       o.yaw            radians about +y; 0 has its front (+z) facing +z
 *       o.scale          1 = the sheet's size (a 1 m cube, give or take)
 *       o.label          what the manifest strip says (upper-cased)
 *   HEIGHT                                the tallest kind at scale 1
 *
 * PLACARDS ARE CELLS. The sheet's placards are textures; the deck has none,
 * so each is a 16 x 16 grid of its own two colours sampled off the texture
 * (cargo-kit.cjs), drawn as one quad per run of a colour along a row. The
 * manifest strip prints the cargo's real name in a 5 x 7 pixel font, the
 * same way: "make sure that the boxes in the hold are representative of
 * what is actually in the hold."
 *
 * Plain IIFE on `global`, `module.exports` for the tests. */
(function (global) {
  'use strict';

  function data() {
    if (global.CargoKitData) return global.CargoKitData;
    if (typeof require !== 'undefined') {
      try { return require('./cargokit-data.js'); } catch (e) { return null; }
    }
    return null;
  }

  /* WHAT SHIPS IN WHAT. Every commodity in economy.js, by how it would
   * travel: dry goods crated, loose bulk in a hopper, cold gas in a tank,
   * liquids in a tote, the perishable chilled, the living penned, the
   * hot shielded, the precious locked, the timber strapped. Anything not
   * listed (a commodity added later) ships as freight. */
  var KIND_OF = {
    textiles: 'freight', alloys: 'freight', farmmach: 'freight', robotics: 'freight',
    ores: 'bulk', rare: 'bulk', grain: 'bulk',
    hydrogen: 'cryo', milfuel: 'cryo',
    water: 'tote', chemicals: 'tote', wine: 'tote',
    fish: 'reefer', fruit: 'reefer', medical: 'reefer', genetech: 'reefer',
    livestock: 'livestock',
    waste: 'cask', fissile: 'cask',
    computers: 'secure', aicores: 'secure', luxuries: 'secure', fusion: 'secure',
    timber: 'lumber'
  };
  function kindFor(cid) { return KIND_OF[cid] || 'freight'; }

  var HAZARD = ['#f4c21a', '#141414'];     // the ramps' stripes (render.js), the cask's band
  var EDGE = '#141619';                     // a placard's rim

  /* ---- placing ----------------------------------------------------------- */
  /* The container's frame -> the deck: its scale, its yaw, then where it
   * stands. A part's own tilt is applied before this, about the part's
   * centre (tiltX: the sheet only ever tilts a placard about x). */
  function placer(o) {
    var c = Math.cos(o.yaw || 0), s = Math.sin(o.yaw || 0), k = o.scale || 1;
    return function (p) {
      var x = p[0] * k, y = p[1] * k, z = p[2] * k;
      return [o.x + x * c + z * s, o.y + y, o.z - x * s + z * c];
    };
  }
  function tiltX(a) {
    if (!a) return null;
    var c = Math.cos(a), s = Math.sin(a);
    return function (p) { return [p[0], p[1] * c - p[2] * s, p[1] * s + p[2] * c]; };
  }

  function tri(m, a, b, c, col) {
    var n = m.v.length;
    m.v.push(a, b, c);
    m.f.push([n, n + 1, n + 2]);
    m.c.push(col);
  }
  function quad(m, P, a, b, c, d, col) { tri(m, P(a), P(b), P(c), col); tri(m, P(a), P(c), P(d), col); }

  /* Local point = centre + R(offset). */
  function local(centre, R) {
    return function (off) {
      var q = R ? R(off) : off;
      return [centre[0] + q[0], centre[1] + q[1], centre[2] + q[2]];
    };
  }

  function boxPart(m, P, ctr, R, sz, col) {
    var hx = sz[0] / 2, hy = sz[1] / 2, hz = sz[2] / 2, L = local(ctr, R);
    var p = [L([-hx, -hy, -hz]), L([hx, -hy, -hz]), L([hx, hy, -hz]), L([-hx, hy, -hz]),
             L([-hx, -hy, hz]), L([hx, -hy, hz]), L([hx, hy, hz]), L([-hx, hy, hz])];
    quad(m, P, p[0], p[1], p[2], p[3], col); quad(m, P, p[4], p[5], p[6], p[7], col);
    quad(m, P, p[0], p[1], p[5], p[4], col); quad(m, P, p[3], p[2], p[6], p[7], col);
    quad(m, P, p[0], p[3], p[7], p[4], col); quad(m, P, p[1], p[2], p[6], p[5], col);
  }

  /* A cylinder (or a cone's frustum) of `seg` sides about local y, then
   * turned onto x or z when the sheet says so. Radii top and bottom, as
   * three.js's CylinderGeometry takes them. `cols(i)` colours side i, which
   * is how the cask's hazard band gets its stripes. */
  function axisTurn(axis) {
    if (axis === 'x') return function (p) { return [p[1], -p[0], p[2]]; };
    if (axis === 'z') return function (p) { return [p[0], -p[2], p[1]]; };
    return null;
  }
  function cylPart(m, P, ctr, R, rTop, rBot, h, seg, axis, cols, capCol, phase) {
    var A = axisTurn(axis), L = local(ctr, function (q) { q = A ? A(q) : q; return R ? R(q) : q; });
    var top = [], bot = [], hy = h / 2;
    for (var i = 0; i < seg; i++) {
      var a = (i / seg) * Math.PI * 2 + (phase || 0);
      top.push(L([Math.sin(a) * rTop, hy, Math.cos(a) * rTop]));
      bot.push(L([Math.sin(a) * rBot, -hy, Math.cos(a) * rBot]));
    }
    var ct = L([0, hy, 0]), cb = L([0, -hy, 0]);
    for (i = 0; i < seg; i++) {
      var j = (i + 1) % seg, col = cols(i);
      quad(m, P, bot[i], bot[j], top[j], top[i], col);
      tri(m, P(ct), P(top[i]), P(top[j]), capCol || col);
      tri(m, P(cb), P(bot[j]), P(bot[i]), capCol || col);
    }
  }

  /* ---- placards ----------------------------------------------------------
   * A face's frame: where its centre sits (on the outer face of the decal's
   * slab, a hair proud), and its two in-plane axes as you read it. */
  /* WHICH WAY IS "RIGHT" ON A FACE. The deck's frame is left-handed as the
   * game draws it: walking, your right is up × forward (walk.js: facing +z,
   * right is +x). So a reader facing a face, forward = −normal, has their
   * right along normal × up — the other way from the right-handed
   * convention the sheet (three.js) was drawn in. The first cut used the
   * sheet's axes and every word and pictogram in the game came out
   * mirrored: "HYDROGEN FUEL" read backwards (Astra, 2026-10-30). A
   * container's yaw is a proper rotation, so getting this right once gets
   * it right on both walls of the hold and on every face: front (z+), side
   * (x+) and lid (y+, read standing at the front). test/boarding.test.js
   * checks every face, on both walls, against the walker's own right. */
  var PROUD = 0.002;
  function faceFrame(face, sz) {
    if (face === 'x+') return { n: [sz[0] / 2 + PROUD, 0, 0], u: [0, 0, 1], v: [0, 1, 0], w: sz[2], h: sz[1] };
    if (face === 'y+') return { n: [0, sz[1] / 2 + PROUD, 0], u: [-1, 0, 0], v: [0, 0, -1], w: sz[0], h: sz[2] };
    return { n: [0, 0, sz[2] / 2 + PROUD], u: [-1, 0, 0], v: [0, 1, 0], w: sz[0], h: sz[1] };
  }
  /* A rectangle on a face: u0..u1, v0..v1 as fractions across it, v from
   * the top. */
  function faceRect(m, P, L, F, u0, u1, v0, v1, col) {
    function at(u, v) {
      var su = (u - 0.5) * F.w, sv = (0.5 - v) * F.h;
      return L([F.n[0] + F.u[0] * su + F.v[0] * sv, F.n[1] + F.u[1] * su + F.v[1] * sv, F.n[2] + F.u[2] * su + F.v[2] * sv]);
    }
    quad(m, P, at(u0, v0), at(u1, v0), at(u1, v1), at(u0, v1), col);
  }
  /* A grid of cells as runs along each row: one quad a run. */
  function cellsOnFace(m, P, L, F, rows, colOf, u0, u1, v0, v1) {
    var nr = rows.length, nc = rows[0].length;
    for (var r = 0; r < nr; r++) {
      var row = rows[r], start = 0;
      for (var x = 1; x <= nc; x++) {
        if (x < nc && row.charAt(x) === row.charAt(start)) continue;
        var ch = row.charAt(start), col = colOf(ch);
        if (col) {
          faceRect(m, P, L, F, u0 + (u1 - u0) * start / nc, u0 + (u1 - u0) * x / nc,
                   v0 + (v1 - v0) * r / nr, v0 + (v1 - v0) * (r + 1) / nr, col);
        }
        start = x;
      }
    }
  }

  function placard(m, P, part, ctr, R, D) {
    var rows = D.pictos[part.picto];
    var F = faceFrame(part.face, part.s), L = local(ctr, R);
    if (!rows) { faceRect(m, P, L, F, 0, 1, 0, 1, part.bg); return; }
    cellsOnFace(m, P, L, F, rows, function (ch) {
      return ch === 'f' ? part.fg : ch === 'b' ? part.bg : null;
    }, 0, 1, 0, 1);
    /* A square placard has a rim behind it, the way the sheet's slab has
     * placard_edge on its sides; a diamond or disc stands on its own. */
    if (rows[0].indexOf('.') < 0) {
      var back = { n: [F.n[0] * 0.2, F.n[1] * 0.2, F.n[2] * 0.2], u: F.u, v: F.v, w: F.w * 1.06, h: F.h * 1.06 };
      faceRect(m, P, L, back, 0, 1, 0, 1, EDGE);
    }
  }

  /* The top of the cask's disc: the trefoil on the lid, as cells clipped by
   * the grid's own '.' to a circle. */
  function discPart(m, P, part, ctr, R, D) {
    var r = part.s[0], t = part.s[1];
    cylPart(m, P, ctr, R, r, r, t, part.seg || 16, null, function () { return part.bg; }, part.bg);
    var sz = [r * 2, t, r * 2];
    placard(m, P, { picto: part.picto, face: 'y+', s: sz, bg: part.bg, fg: part.fg }, ctr, R, D);
  }

  /* ---- the manifest strip ------------------------------------------------ */
  /* 5 x 7, a row a number, the high bit on the left. Enough for every
   * commodity's name; anything else is a space. */
  var FONT = {
    A: [14, 17, 17, 31, 17, 17, 17], B: [30, 17, 17, 30, 17, 17, 30], C: [14, 17, 16, 16, 16, 17, 14],
    D: [30, 17, 17, 17, 17, 17, 30], E: [31, 16, 16, 30, 16, 16, 31], F: [31, 16, 16, 30, 16, 16, 16],
    G: [14, 17, 16, 23, 17, 17, 15], H: [17, 17, 17, 31, 17, 17, 17], I: [14, 4, 4, 4, 4, 4, 14],
    J: [7, 2, 2, 2, 2, 18, 12], K: [17, 18, 20, 24, 20, 18, 17], L: [16, 16, 16, 16, 16, 16, 31],
    M: [17, 27, 21, 21, 17, 17, 17], N: [17, 17, 25, 21, 19, 17, 17], O: [14, 17, 17, 17, 17, 17, 14],
    P: [30, 17, 17, 30, 16, 16, 16], Q: [14, 17, 17, 17, 21, 18, 13], R: [30, 17, 17, 30, 20, 18, 17],
    S: [15, 16, 16, 14, 1, 1, 30], T: [31, 4, 4, 4, 4, 4, 4], U: [17, 17, 17, 17, 17, 17, 14],
    V: [17, 17, 17, 17, 17, 10, 4], W: [17, 17, 17, 21, 21, 21, 10], X: [17, 17, 10, 4, 10, 17, 17],
    Y: [17, 17, 10, 4, 4, 4, 4], Z: [31, 1, 2, 4, 8, 16, 31],
    0: [14, 17, 19, 21, 25, 17, 14], 1: [4, 12, 4, 4, 4, 4, 14], 2: [14, 17, 1, 2, 4, 8, 31],
    3: [31, 2, 4, 2, 1, 17, 14], 4: [2, 6, 10, 18, 31, 2, 2], 5: [31, 16, 30, 1, 1, 17, 14],
    6: [6, 8, 16, 30, 17, 17, 14], 7: [31, 1, 2, 4, 8, 8, 8], 8: [14, 17, 17, 14, 17, 17, 14],
    9: [14, 17, 17, 15, 1, 2, 12], '-': [0, 0, 0, 31, 0, 0, 0], '.': [0, 0, 0, 0, 0, 12, 12]
  };
  /* The text as rows of '#' and ' ', one glyph column a cell, a blank
   * column between glyphs. */
  function textRows(s) {
    s = String(s || '').toUpperCase();
    var rows = ['', '', '', '', '', '', ''];
    for (var i = 0; i < s.length; i++) {
      var g = FONT[s.charAt(i)] || [0, 0, 0, 0, 0, 0, 0];
      for (var r = 0; r < 7; r++) {
        for (var b = 4; b >= 0; b--) rows[r] += (g[r] >> b) & 1 ? '#' : ' ';
        if (i < s.length - 1) rows[r] += ' ';
      }
    }
    return rows;
  }

  function manifestStrip(m, P, part, ctr, R, label) {
    var F = faceFrame(part.face, part.s), L = local(ctr, R);
    var SW = 0.12;                                  // the stripe, as a share of the width
    faceRect(m, P, L, F, 0, SW, 0, 1, part.stripe || part.fg);
    faceRect(m, P, L, F, SW, 1, 0, 1, part.bg);
    var rows = textRows(label);
    if (!rows[0].length) return;
    /* As big as fits: 70% of the strip's height, or the width after the
     * stripe and a margin, whichever runs out first. */
    var cols = rows[0].length;
    var cell = Math.min((F.h * 0.7) / 7, (F.w * (1 - SW) - F.w * 0.08) / cols);
    var uw = (cell * cols) / F.w, vh = (cell * 7) / F.h;
    var u0 = SW + 0.04, v0 = (1 - vh) / 2;
    var T = { n: [F.n[0] + Math.sign(F.n[0]) * 0.001, F.n[1] + Math.sign(F.n[1]) * 0.001, F.n[2] + Math.sign(F.n[2]) * 0.001],
              u: F.u, v: F.v, w: F.w, h: F.h };
    cellsOnFace(m, P, L, T, rows, function (ch) { return ch === '#' ? part.fg : null; }, u0, u0 + uw, v0, v0 + vh);
  }

  /* ---- one container ------------------------------------------------------ */
  function build(m, kind, o) {
    var D = data();
    var K = D && (D.kinds[kind] || D.kinds.freight);
    if (!K) return false;
    var P = placer(o || {});
    for (var i = 0; i < K.parts.length; i++) {
      var part = K.parts[i], R = part.rot ? tiltX(part.rot[0]) : null;
      for (var j = 0; j < part.at.length; j++) {
        var ctr = part.at[j];
        if (part.t === 'box') boxPart(m, P, ctr, R, part.s, part.c);
        else if (part.t === 'cyl') {
          var seg = part.seg || 12;
          var cols = part.hazard ? function (k) { return HAZARD[k % 2]; } : (function (c) { return function () { return c; }; })(part.c);
          cylPart(m, P, ctr, R, part.s[0], part.s[1], part.s[2], seg, part.axis, cols, part.hazard ? HAZARD[1] : null);
        } else if (part.t === 'frustum') {
          /* Square: the sheet's hopper is a four-sided cylinder turned 45
           * degrees. Widths across the flats, top then bottom, then height. */
          cylPart(m, P, ctr, R, part.s[0] / Math.SQRT2, part.s[1] / Math.SQRT2, part.s[2], 4, null,
                  (function (c) { return function () { return c; }; })(part.c), null, Math.PI / 4);
        } else if (part.t === 'disc') discPart(m, P, part, ctr, R, D);
        else if (part.t === 'placard') placard(m, P, part, ctr, R, D);
        else if (part.t === 'manifest') manifestStrip(m, P, part, ctr, R, (o && o.label) || '');
      }
    }
    return true;
  }

  /* The tallest kind, so a stack can be spaced without measuring. */
  function height() {
    var D = data(), top = 0;
    if (!D) return 1;
    for (var k in D.kinds) {
      D.kinds[k].parts.forEach(function (p) {
        p.at.forEach(function (a) {
          var h = p.t === 'cyl' && p.axis !== 'x' && p.axis !== 'z' ? p.s[2] / 2
                : p.t === 'cyl' ? Math.max(p.s[0], p.s[1]) : p.t === 'frustum' ? p.s[2] / 2
                : p.t === 'disc' ? p.s[1] / 2 : p.s[1] / 2;
          top = Math.max(top, a[1] + h);
        });
      });
    }
    return top;
  }

  var CargoKit = {
    KIND_OF: KIND_OF, kindFor: kindFor, build: build, textRows: textRows,
    faceFrame: faceFrame, placer: placer,
    kinds: function () { var D = data(); return D ? D.order.slice() : []; },
    get HEIGHT() { return height(); }
  };
  global.CargoKit = CargoKit;
  if (typeof module !== 'undefined' && module.exports) module.exports = CargoKit;
})(typeof window !== 'undefined' ? window : globalThis);
