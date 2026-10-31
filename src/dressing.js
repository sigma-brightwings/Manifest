/* dressing.js - what is IN a station's rooms (2026-10-31).
 *
 * Astra: "the inside of stations needs more detail: there are many rooms
 * but they contain nothing." Asked what it should feel like: "a kind of
 * Firefly / Blade Runner aesthetic". So: lived in, patched, warm practical
 * light against cold blue, neon in more than one script, pipes where the
 * building's guts run. Not clean and not white.
 *
 * walk.js lays out the rooms (boxes, doors, counters); this dresses them.
 * Every room kind may have a dresser, which returns
 *
 *   quads   plates in walk.js's format ({ pts, col, bias, lit }) - drawn by
 *           both walk.js's 2D painter and its GPU mesh (meshFor)
 *   solids  [x0, z0, x1, z1] footprints you and the people walk round
 *   seats   { x, z, yaw } where a person sits (npc.js uses them)
 *   noStrip true where the room's own white ceiling strip would kill the
 *           mood (the bar is lit by its lamps)
 *
 * SEEDED, and from its own stream ('dress|seed|port|room'), so the same
 * port's bar is the same bar every visit and no other generator moves.
 * Astra's module generator replaces rooms later (walking-stations.md); a
 * room it replaces simply stops being dressed here.
 */
(function (global) {
  'use strict';

  /* ---- a seeded stream of its own (walk.js's hash and generator) -------- */
  function hash(str) {
    var h = 2166136261 >>> 0;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h >>> 0;
  }
  function stream(key) {
    var a = hash(key) || 1;
    function next() {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    return {
      next: next,
      range: function (lo, hi) { return lo + next() * (hi - lo); },
      int: function (lo, hi) { return lo + Math.floor(next() * (hi - lo + 1)); },
      pick: function (arr) { return arr[Math.floor(next() * arr.length)]; }
    };
  }

  function shade(hex, k) {
    var n = parseInt(hex.slice(1), 16);
    var r = Math.min(255, Math.round(((n >> 16) & 255) * k)),
        g = Math.min(255, Math.round(((n >> 8) & 255) * k)),
        b = Math.min(255, Math.round((n & 255) * k));
    return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
  }

  /* ---- primitives ------------------------------------------------------- */
  function Kit() {
    var q = [];
    return {
      quads: q,
      quad: function (pts, col, o) {
        o = o || {};
        q.push({ pts: pts, col: col, bias: o.bias || 0, lit: !!o.lit });
      },
      /* An axis-aligned box. Bottom face only when it floats. */
      box: function (x0, y0, z0, x1, y1, z1, col, o) {
        o = o || {};
        var lit = !!o.lit, top = o.top || shade(col, 1.15);
        this.quad([[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], top, { lit: lit || o.litTop });
        this.quad([[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0]], shade(col, 0.8), { lit: lit });
        this.quad([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], shade(col, 0.8), { lit: lit });
        this.quad([[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], shade(col, 0.9), { lit: lit });
        this.quad([[x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0]], shade(col, 0.9), { lit: lit });
        if (y0 > 0.01) this.quad([[x0, y0, z0], [x0, y0, z1], [x1, y0, z1], [x1, y0, z0]], shade(col, o.under || 0.6), { lit: lit && o.litUnder !== false });
      },
      /* An n-sided upright prism (round tables, stools, lamp shades). */
      prism: function (cx, cz, r0, r1, y0, y1, n, col, o) {
        o = o || {};
        var a, i, p0 = [], p1 = [];
        for (i = 0; i < n; i++) {
          a = (i + 0.5) / n * Math.PI * 2;
          p0.push([cx + Math.cos(a) * r0, y0, cz + Math.sin(a) * r0]);
          p1.push([cx + Math.cos(a) * r1, y1, cz + Math.sin(a) * r1]);
        }
        for (i = 0; i < n; i++) {
          var j = (i + 1) % n;
          this.quad([p0[i], p0[j], p1[j], p1[i]], shade(col, 0.75 + 0.25 * Math.abs(Math.cos((i + 0.5) / n * Math.PI * 2 - 0.6))), { lit: o.litSide });
        }
        if (!o.openTop) this.quad(p1.slice().reverse(), o.top || shade(col, 1.15), { lit: o.litTop });
        if (o.bottom) this.quad(p0, o.bottomCol || shade(col, 0.6), { lit: o.litBottom });
      }
    };
  }

  /* A wall seen from inside, as (u along it, left to right as you face it;
   * v up; d out from it into the room). */
  function wallPoint(room, side) {
    if (side === 'x0') return function (u, v, d) { return [room.x0 + d, v, room.z0 + u]; };
    if (side === 'x1') return function (u, v, d) { return [room.x1 - d, v, room.z1 - u]; };
    if (side === 'z1') return function (u, v, d) { return [room.x0 + u, v, room.z1 - d]; };
    return function (u, v, d) { return [room.x1 - u, v, room.z0 + d]; };
  }
  function wallLen(room, side) { return side === 'x0' || side === 'x1' ? room.z1 - room.z0 : room.x1 - room.x0; }
  /* A flat plate on a wall, d out from it. */
  function wallPlate(K, P, u0, v0, u1, v1, d, col, o) {
    K.quad([P(u0, v0, d), P(u1, v0, d), P(u1, v1, d), P(u0, v1, d)], col, o);
  }

  /* ---- neon ------------------------------------------------------------- *
   * A tube is a thin self-lit strip with a wider, dimmer strip just behind
   * it - the glow, faked without blending, which keeps it to the painter's
   * rules and to the GPU mesh's opaque pass. */
  function tube(K, P, a, b, d, col, w, paint) {
    w = w || 0.05;
    var du = b[0] - a[0], dv = b[1] - a[1], L = Math.hypot(du, dv) || 1;
    var nu = -dv / L, nv = du / L;
    function strip(width, off, c, bias, lit) {
      var h = width / 2;
      K.quad([P(a[0] + nu * h, a[1] + nv * h, off), P(b[0] + nu * h, b[1] + nv * h, off),
              P(b[0] - nu * h, b[1] - nv * h, off), P(a[0] - nu * h, a[1] - nv * h, off)], c, { lit: lit, bias: bias });
    }
    /* `paint`: a painted stroke (graffiti, a banner's mark) - one strip,
     * lit by the room like the wall it is on. */
    if (paint) { strip(w, d, col, -0.03, false); return; }
    strip(w * 3.2, d - 0.004, shade(col, 0.42), -0.03, true);
    strip(w, d, col, -0.05, true);
  }

  /* Uppercase, on a 4 x 6 grid. Polylines joined by spaces, strokes by |. */
  var FONT = {
    A: '0,0 0,4 2,6 4,4 4,0|0,3 4,3', B: '0,0 0,6 3,6 4,5 4,4 3,3 0,3|3,3 4,2 4,1 3,0 0,0',
    C: '4,6 0,6 0,0 4,0', D: '0,0 0,6 3,6 4,5 4,1 3,0 0,0', E: '4,6 0,6 0,0 4,0|0,3 3,3',
    F: '4,6 0,6 0,0|0,3 3,3', G: '4,5 4,6 0,6 0,0 4,0 4,3 2,3', H: '0,0 0,6|4,0 4,6|0,3 4,3',
    I: '1,6 3,6|2,6 2,0|1,0 3,0', J: '4,6 4,0 0,0 0,2', K: '0,0 0,6|4,6 0,3 4,0', L: '0,6 0,0 4,0',
    M: '0,0 0,6 2,3 4,6 4,0', N: '0,0 0,6 4,0 4,6', O: '0,0 0,6 4,6 4,0 0,0', P: '0,0 0,6 4,6 4,3 0,3',
    Q: '4,1 4,6 0,6 0,0 3,0 4,1|2,2 4,0', R: '0,0 0,6 4,6 4,3 0,3 4,0', S: '4,6 0,6 0,3 4,3 4,0 0,0',
    T: '0,6 4,6|2,6 2,0', U: '0,6 0,0 4,0 4,6', V: '0,6 2,0 4,6', W: '0,6 1,0 2,3 3,0 4,6',
    X: '0,0 4,6|0,6 4,0', Y: '0,6 2,3 4,6|2,3 2,0', Z: '0,6 4,6 0,0 4,0', "'": '2,6 2,4',
    0: '0,0 0,6 4,6 4,0 0,0|0,0 4,6', 1: '1,5 2,6 2,0|1,0 3,0', 2: '0,6 4,6 4,3 0,3 0,0 4,0',
    3: '0,6 4,6 4,0 0,0|1,3 4,3', 4: '0,6 0,3 4,3|4,6 4,0', 5: '4,6 0,6 0,3 4,3 4,0 0,0',
    6: '4,6 0,6 0,0 4,0 4,3 0,3', 7: '0,6 4,6 2,0', 8: '0,0 0,6 4,6 4,0 0,0|0,3 4,3', 9: '4,3 0,3 0,6 4,6 4,0 0,0',
    '-': '1,3 3,3',
    /* Arrows, for signs that point somewhere - Astra's rule: direction is
     * shown with arrows, not the words left and right. ^ is "ahead". */
    '<': '4,3 0,3|2,5 0,3 2,1', '>': '0,3 4,3|2,5 4,3 2,1', '^': '2,0 2,6|0,4 2,6 4,4'
  };
  function textWidth(s, h) { return s.length * h * 0.95 - h * 0.28; }
  /* `s` centred on u, its baseline at v, letters h tall. */
  function neonText(K, P, s, u, v, h, d, col) {
    var cw = h * 0.95, k = h / 6, x = u - textWidth(s, h) / 2;
    for (var i = 0; i < s.length; i++, x += cw) {
      var g = FONT[s.charAt(i)];
      if (!g) continue;
      g.split('|').forEach(function (line) {
        var pts = line.split(' ').map(function (p) { var xy = p.split(','); return [x + xy[0] * k * 0.68, v + xy[1] * k]; });
        for (var j = 0; j + 1 < pts.length; j++) tube(K, P, pts[j], pts[j + 1], d, col, h * 0.07);
      });
    }
  }
  /* A glyph in a script nobody on the deck can read either: three to five
   * strokes on a 4 x 4 grid, with a rule that every glyph has a spine. */
  function glyph(K, P, rng, u, v, s, d, col) {
    var k = s / 4, strokes = [];
    strokes.push(rng.next() < 0.5 ? [[0, 3], [4, 3]] : [[2, 4], [2, 0]]);
    var n = rng.int(2, 4);
    for (var i = 0; i < n; i++) {
      var a = [rng.int(0, 4), rng.int(0, 4)], b;
      var kind = rng.int(0, 2);
      b = kind === 0 ? [rng.int(0, 4), a[1]] : kind === 1 ? [a[0], rng.int(0, 4)] : [Math.min(4, a[0] + 2), Math.max(0, a[1] - 2)];
      if (a[0] === b[0] && a[1] === b[1]) b = [4 - a[0], a[1]];
      strokes.push([a, b]);
    }
    strokes.forEach(function (st) {
      tube(K, P, [u + st[0][0] * k, v + st[0][1] * k], [u + st[1][0] * k, v + st[1][1] * k], d, col, s * 0.06);
    });
  }

  /* ---- names ------------------------------------------------------------ */
  var BAR_ADJ = ['RUSTY', 'LUCKY', 'BLUE', 'BROKEN', 'LAST', 'SILVER', 'DRIFTING', 'COLD', 'LONG', 'RED', 'LATE', 'QUIET'];
  var BAR_NOUN = ['ANCHOR', 'STAR', 'COMET', 'LANTERN', 'HOOK', 'ORBIT', 'MULE', 'AIRLOCK', 'CRANE', 'HALO', 'TIDE', 'WAKE'];
  var BAR_ONE = ['LAST CALL', 'DRY DOCK', 'HARD BURN', 'SLOW BOAT', 'GRAVEYARD SHIFT', 'NIGHT WATCH', 'DEEP END', 'LONG HAUL'];
  var OWNERS = ['MAL', 'KAYE', 'ROOK', 'JUNE', 'BAO', 'IVO', 'NELL', 'TAM', 'OKO', 'ZED'];
  function barName(rng) {
    var r = rng.next();
    if (r < 0.45) return 'THE ' + rng.pick(BAR_ADJ) + ' ' + rng.pick(BAR_NOUN);
    if (r < 0.75) return rng.pick(BAR_ONE);
    return rng.pick(OWNERS) + "'S";
  }

  /* ---- palettes --------------------------------------------------------- */
  var NEON = ['#ff3fa4', '#3ff0ff', '#ffb43f', '#b06bff', '#ff5a3c', '#5aff9c'];
  var GLASS = ['#c9802e', '#3f8f4f', '#2f8f9a', '#a8342f', '#d9c27a', '#6b3fa0', '#9fc0c8'];
  var WOOD = ['#5a3a26', '#4a2f20', '#6b4a33', '#3e2a1e'];
  var VINYL = ['#7a1f24', '#8a2a1e', '#2a3f5a', '#5a2a4a'];
  var METAL = '#5b6068', BRASS = '#a7803a', RUST = '#6e3b24', PIPE = '#3f454c';
  var SIGN_D = 0.12;           // m out from a wall: a sign's backing plate

  /* ---- WHOSE PORT IT IS (2026-10-31) -----------------------------------
   * Astra: "stations should vary by faction". One style per livery
   * (generate.js stampLiveries), set for the whole of one apply():
   *   civ   the street as it was: warm grime, every colour of neon;
   *   navy  clean and bright: light walls, white light, cool blue and white
   *         signs, uniform grey crates, blue banners with a white chevron;
   *   syn   near-black with one gold accent (the Syndicate's own design
   *         language): gold trim round every room, oxblood vinyl, dark
   *         wood, red and gold neon, black banners with a gold sigil;
   *   pir   rust, graffiti, light fittings that have died, grime on grime.
   * The palettes above are civ's; useStyle swaps them for the call. */
  var BASE_PAL = { NEON: NEON, GLASS: GLASS, WOOD: WOOD, VINYL: VINYL, METAL: METAL, RUST: RUST, PIPE: PIPE };
  var STYLES = {
    civ:  { grime: 1, adBar: '#ff3fa4', adOut: '#3ff0ff' },
    navy: { neon: ['#7fc8ff', '#ffffff', '#5aa8ff', '#a8e0ff'], wood: ['#5a636e', '#4e5660', '#646d78'],
            vinyl: ['#2a3f5a', '#33465e', '#1f3550'], metal: '#8a939e', rust: '#5a636e', pipe: '#6e7884',
            grime: 0.15, fixture: '#f4f8ff', rib: '#8d97a3', wainscot: '#3a4656',
            crate: ['#5a6676', '#4e5a6a', '#66727f'], containers: ['#3c5a80', '#5a6676', '#2f4a6e', '#7a8692'],
            banner: { bg: '#1f3f7a', fg: '#ffffff', mark: 'chevron' }, adBar: '#7fc8ff', adOut: '#ffffff' },
    syn:  { neon: ['#ffcf4a', '#ff3a3a', '#e0a830'], wood: ['#1e1612', '#2a1c12', '#24170f'],
            vinyl: ['#4a0f14', '#2a0a0e', '#3a0c10'], metal: '#2a2c30', rust: '#3a2418', pipe: '#1e2024',
            grime: 0.6, fixture: '#ffd9a0', rib: '#141416', wainscot: '#0e0c0b',
            crate: ['#1e2024', '#2a2c30', '#3a2a1a'], containers: ['#1e2024', '#2a2c30', '#4a0f14', '#3a2a1a'],
            banner: { bg: '#0c0c0e', fg: '#c9a227', mark: 'sigil' }, trim: '#c9a227', adBar: '#ffcf4a', adOut: '#ff3a3a' },
    pir:  { neon: ['#ff5a3c', '#ff3fa4', '#5aff9c', '#ffb43f'], rust: '#7a3a1e', pipe: '#4a2e22',
            grime: 1.8, rib: '#4a2a1a', wainscot: '#2a1a12', crate: ['#5a3a22', '#4a4a3a', '#6e3b24', '#3e4640'],
            containers: ['#7a3a1e', '#5a4a2e', '#8a2a2a', '#4a4a3a'], graffiti: true, dead: 0.35,
            adBar: '#ff5a3c', adOut: '#5aff9c' }
  };
  var S = STYLES.civ;
  function useStyle(liv) {
    S = STYLES[liv] || STYLES.civ;
    NEON = S.neon || BASE_PAL.NEON; GLASS = S.glass || BASE_PAL.GLASS; WOOD = S.wood || BASE_PAL.WOOD;
    VINYL = S.vinyl || BASE_PAL.VINYL; METAL = S.metal || BASE_PAL.METAL; RUST = S.rust || BASE_PAL.RUST;
    PIPE = S.pipe || BASE_PAL.PIPE;
  }

  /* ---- shared furniture -------------------------------------------------- */
  function hangingLamp(K, x, z, ceil, low, warm) {
    K.box(x - 0.015, low + 0.22, z - 0.015, x + 0.015, ceil, z + 0.015, '#202326');
    K.prism(x, z, 0.32, 0.12, low, low + 0.24, 8, '#2a2d30', { top: '#1c1e20', bottom: true, bottomCol: warm, litBottom: true });
    K.box(x - 0.07, low - 0.06, z - 0.07, x + 0.07, low + 0.01, z + 0.07, warm, { lit: true });
  }
  function chair(K, rng, x, z, yaw) {
    var c = rng.next() < 0.35 ? RUST : rng.next() < 0.5 ? METAL : rng.pick(WOOD);
    if (rng.next() < 0.3) {          // a crate, the Firefly kind
      K.box(x - 0.24, 0, z - 0.24, x + 0.24, 0.46, z + 0.24, rng.pick(['#4d5a3a', '#5a4a2e', '#3a4a52']));
      return;
    }
    var fx = Math.sin(yaw), fz = Math.cos(yaw);
    K.box(x - 0.21, 0.42, z - 0.21, x + 0.21, 0.47, z + 0.21, c);
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (s) {
      K.box(x + s[0] * 0.17 - 0.02, 0, z + s[1] * 0.17 - 0.02, x + s[0] * 0.17 + 0.02, 0.42, z + s[1] * 0.17 + 0.02, shade(c, 0.7));
    });
    /* The back, on the side away from where the sitter faces. */
    var bx = x - fx * 0.19, bz = z - fz * 0.19, hw = 0.2;
    if (Math.abs(fx) > Math.abs(fz)) K.box(bx - 0.025, 0.47, z - hw, bx + 0.025, 0.95, z + hw, c);
    else K.box(x - hw, 0.47, bz - 0.025, x + hw, 0.95, bz + 0.025, c);
  }

  /* ---- THE BAR ----------------------------------------------------------- */
  function dressBar(plan, room, rng) {
    var K = Kit(), solids = [], seats = [];
    var x0 = room.x0, x1 = room.x1, z0 = room.z0, z1 = room.z1, H = room.y1;
    var cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    var counterIt = plan.items.filter(function (it) { return it.kind === 'bar'; })[0];
    var c = counterIt && counterIt.counter;
    var neonA = rng.pick(NEON), neonB = rng.pick(NEON.filter(function (n) { return n !== neonA; }));
    var warm = rng.pick(['#ffbf6e', '#ffcf87', '#ffad5c']);

    /* The doors into this room, so nothing is put in front of one. */
    var doors = plan.doors.filter(function (d) { return d.a === room.id || d.b === room.id; });
    function clearOfDoors(x, z, r) {
      return doors.every(function (d) {
        var dx = Math.max(d.x0 - 1.4 - r, Math.min(x, d.x1 + 1.4 + r)), dz = Math.max(d.z0 - 1.4 - r, Math.min(z, d.z1 + 1.4 + r));
        return !(dx === x && dz === z);
      });
    }

    /* Grime on the floor: darker patches, worn paths. */
    for (var g = 0; g < 7; g++) {
      var gx = rng.range(x0 + 0.5, x1 - 1.5), gz = rng.range(z0 + 0.5, z1 - 1.5), gw = rng.range(0.6, 1.6), gd = rng.range(0.5, 1.3);
      K.quad([[gx, 0.004, gz], [gx + gw, 0.004, gz], [gx + gw, 0.004, gz + gd], [gx, 0.004, gz + gd]], '#1f1813', { bias: -0.01 });
    }

    /* Wall ribs every two metres, and a dark wainscot. */
    ['x0', 'x1', 'z0', 'z1'].forEach(function (side) {
      var P = wallPoint(room, side), L = wallLen(room, side);
      wallPlate(K, P, 0, 0, L, 0.9, 0.012, S.wainscot || '#2a201a', { bias: -0.015 });
      for (var u = 1; u < L - 0.5; u += 2) {
        var a = P(u - 0.07, 0, 0), b = P(u + 0.07, H, 0.1);
        var bx0 = Math.min(a[0], b[0]), bx1 = Math.max(a[0], b[0]), bz0 = Math.min(a[2], b[2]), bz1 = Math.max(a[2], b[2]);
        var hit = doors.some(function (d) { return bx1 > d.x0 - 0.2 && bx0 < d.x1 + 0.2 && bz1 > d.z0 - 0.2 && bz0 < d.z1 + 0.2; });
        if (!hit) K.box(bx0, 0, bz0, bx1, H, bz1, S.rib || '#3b2e25');
      }
    });

    /* Pipes along the ceiling, down two walls. */
    [['z1', 0.25], ['x1', 0.3]].forEach(function (pp, k) {
      var P = wallPoint(room, pp[0]), L = wallLen(room, pp[0]);
      for (var n = 0; n < 2; n++) {
        var v = H - 0.18 - n * 0.2, d = pp[1] + n * 0.08, r = 0.06 - n * 0.015;
        var a = P(0, v - r, d - r), b = P(L, v + r, d + r);
        K.box(Math.min(a[0], b[0]), v - r, Math.min(a[2], b[2]), Math.max(a[0], b[0]), v + r, Math.max(a[2], b[2]), n ? RUST : PIPE, { under: 0.5 });
      }
    });

    if (c) {
      /* The counter's front: a lit strip at the kick, a brass rail along
       * the top, a foot rail. The counter box itself is walk.js's. */
      var front = c[2];                          // its room side faces +x
      K.box(front, 0.06, c[1], front + 0.02, 0.14, c[3], warm, { lit: true });
      K.box(c[0] - 0.05, 1.05, c[1] - 0.05, c[2] + 0.08, 1.1, c[3] + 0.05, '#2b1d14', { top: '#3a2618' });
      K.box(front + 0.18, 0.18, c[1] + 0.2, front + 0.22, 0.22, c[3] - 0.2, BRASS);

      /* The back bar: a dark mirror, three shelves, the bottles. */
      var P0 = wallPoint(room, 'x0'), u0 = c[1] - z0, u1 = c[3] - z0;
      wallPlate(K, P0, u0, 1.15, u1, 2.75, 0.02, '#1b2730', { bias: -0.02 });
      [1.2, 1.65, 2.1].forEach(function (y) {
        K.box(x0 + 0.02, y - 0.03, c[1] + 0.1, x0 + 0.32, y, c[3] - 0.1, '#2a1c12');
        for (var bz = c[1] + 0.25; bz < c[3] - 0.25; bz += rng.range(0.12, 0.26)) {
          var bh = rng.range(0.18, 0.32), bw = rng.range(0.035, 0.05), col = rng.pick(GLASS), bxx = x0 + rng.range(0.1, 0.24);
          K.box(bxx - bw, y, bz - bw, bxx + bw, y + bh, bz + bw, col, { lit: rng.next() < 0.6 });
          K.box(bxx - bw * 0.4, y + bh, bz - bw * 0.4, bxx + bw * 0.4, y + bh + 0.07, bz + bw * 0.4, shade(col, 0.6));
        }
      });
      /* A neon over the back bar. */
      tube(K, P0, [u0 + 0.3, 2.95], [u1 - 0.3, 2.95], 0.03, neonB, 0.06);

      /* Stools along the front. */
      for (var sz = c[1] + 0.6; sz < c[3] - 0.3; sz += 1.15) {
        var sx = front + 0.55;
        K.box(sx - 0.03, 0, sz - 0.03, sx + 0.03, 0.72, sz + 0.03, METAL);
        K.prism(sx, sz, 0.2, 0.2, 0.0, 0.03, 8, '#2b2f33');
        K.prism(sx, sz, 0.19, 0.2, 0.72, 0.8, 8, rng.pick(VINYL));
        seats.push({ x: sx + 0.08, z: sz, yaw: -Math.PI / 2, high: true });
      }
    }

    /* A booth along the far wall (z1), clear of the door. */
    var bLen = Math.min(4, (x1 - x0) - 5.5), bx0 = x1 - 1.0 - bLen, bxe = x1 - 1.0;
    if (bLen > 2) {
      var vin = rng.pick(VINYL);
      K.box(bx0, 0, z1 - 0.65, bxe, 0.45, z1 - 0.02, vin);
      K.box(bx0, 0.45, z1 - 0.25, bxe, 1.3, z1 - 0.02, shade(vin, 0.85));
      K.box(bx0 - 0.1, 0, z1 - 0.7, bx0, 1.35, z1 - 0.02, '#2a1c12');
      K.box(bxe, 0, z1 - 0.7, bxe + 0.1, 1.35, z1 - 0.02, '#2a1c12');
      var tz0 = z1 - 1.45, tz1 = z1 - 0.8;
      K.box(bx0 + 0.3, 0.72, tz0, bxe - 0.3, 0.77, tz1, rng.pick(WOOD));
      K.box((bx0 + bxe) / 2 - 0.06, 0, (tz0 + tz1) / 2 - 0.06, (bx0 + bxe) / 2 + 0.06, 0.72, (tz0 + tz1) / 2 + 0.06, METAL);
      /* Only the table is solid: a person slides along the bench to sit,
       * and the wall keeps everyone off its back. */
      solids.push([bx0 + 0.3, tz0, bxe - 0.3, tz1]);
      for (var s2 = bx0 + 0.6; s2 < bxe - 0.3; s2 += 1.2) seats.push({ x: s2, z: z1 - 0.45, yaw: Math.PI });
      hangingLamp(K, (bx0 + bxe) / 2, (tz0 + tz1) / 2, H, 1.75, warm);
    }

    /* Round tables in the open floor, each with its chairs and a lamp. */
    var want = rng.int(3, 4), placed = [];
    for (var tries = 0; tries < 60 && placed.length < want; tries++) {
      var tx = rng.range(x0 + (c ? c[2] - x0 + 1.9 : 1.6), x1 - 1.3), tz = rng.range(z0 + 1.3, z1 - 2.0);
      if (!clearOfDoors(tx, tz, 0.9)) continue;
      if (placed.some(function (p) { return Math.hypot(p[0] - tx, p[1] - tz) < 2.3; })) continue;
      if (bLen > 2 && tx > bx0 - 1 && tz > z1 - 2.4) continue;
      placed.push([tx, tz]);
      var top = rng.pick(WOOD);
      K.prism(tx, tz, 0.55, 0.55, 0.72, 0.77, 10, top);
      K.box(tx - 0.05, 0, tz - 0.05, tx + 0.05, 0.72, tz + 0.05, METAL);
      K.prism(tx, tz, 0.28, 0.28, 0, 0.03, 8, '#2b2f33');
      /* Something on it: a glass, a bottle, a lamp-lit ring of light. */
      K.box(tx + 0.1, 0.77, tz - 0.05, tx + 0.17, 0.9, tz + 0.02, rng.pick(GLASS), { lit: true });
      solids.push([tx - 0.55, tz - 0.55, tx + 0.55, tz + 0.55]);
      var nc = rng.int(2, 3), a0 = rng.range(0, Math.PI * 2);
      for (var k2 = 0; k2 < nc; k2++) {
        var a = a0 + k2 * Math.PI * 2 / nc, chx = tx + Math.sin(a) * 0.95, chz = tz + Math.cos(a) * 0.95;
        var yaw = Math.atan2(tx - chx, tz - chz);
        chair(K, rng, chx, chz, yaw);
        seats.push({ x: chx, z: chz, yaw: yaw });
      }
      hangingLamp(K, tx, tz, H, 1.85, warm);
    }

    /* The sign: the bar's name in neon on the wall you see coming in, and
     * a column of glyphs beside the door. */
    var name = barName(rng);
    var side = 'z0', Ps = wallPoint(room, side), Ls = wallLen(room, side);
    var h = Math.min(0.42, (Ls - 1.2) / (name.length * 0.95));
    /* Mounted proud of the wall, clear of the ribs (which stand 10 cm
     * out): on the wall itself the ribs cut through the letters. */
    wallPlate(K, Ps, Ls / 2 - textWidth(name, h) / 2 - 0.25, 2.0 - 0.2, Ls / 2 + textWidth(name, h) / 2 + 0.25, 2.0 + h + 0.2, SIGN_D, '#120d0b', { bias: -0.02 });
    neonText(K, Ps, name, Ls / 2, 2.0, h, SIGN_D + 0.015, neonA);

    var door0 = doors[0];
    if (door0) {
      var dside = door0.axis === 'x' ? (Math.abs(door0.at - x1) < 0.01 ? 'x1' : 'x0') : (Math.abs(door0.at - z1) < 0.01 ? 'z1' : 'z0');
      var Pd = wallPoint(room, dside), Ld = wallLen(room, dside);
      var dc = door0.axis === 'x' ? (dside === 'x1' ? z1 - (door0.z0 + door0.z1) / 2 : (door0.z0 + door0.z1) / 2 - z0)
                                  : (dside === 'z1' ? (door0.x0 + door0.x1) / 2 - x0 : x1 - (door0.x0 + door0.x1) / 2);
      var gu = dc + 1.6 + 0.3;
      if (gu + 0.5 > Ld - 0.3) gu = dc - 1.6 - 0.8;
      wallPlate(K, Pd, gu - 0.12, 0.9, gu + 0.62, 3.2, SIGN_D, '#0d1416', { bias: -0.02 });
      for (var gi = 0; gi < 4; gi++) glyph(K, Pd, rng, gu, 2.6 - gi * 0.55, 0.42, SIGN_D + 0.015, neonB);
    }

    return { quads: K.quads, solids: solids, seats: seats, noStrip: true, name: name };
  }

  /* ---- shared pieces for the other rooms --------------------------------- */

  /* A free-hanging plate (an overhead sign), centred on (xc, zc), facing a
   * walker looking along +z (dir 1) or -z (dir -1), or along +x / -x
   * (axis 'x'). Reads left to right as that walker sees it. */
  function planeAt(xc, zc, axis, dir) {
    if (axis === 'z') return dir > 0 ? function (u, v, d) { return [xc + u, v, zc - d]; }
                                     : function (u, v, d) { return [xc - u, v, zc + d]; };
    return dir > 0 ? function (u, v, d) { return [xc - d, v, zc - u]; }
                   : function (u, v, d) { return [xc + d, v, zc + u]; };
  }
  /* A hanging sign: dark plate, neon text, both faces when `twoSided` is
   * the text for the back. */
  function hangingSign(K, xc, zc, axis, dir, text, back, h, col, col2, ceil) {
    /* No higher than just over head height: in the six-metre concourse a
     * sign hung a metre off the ceiling was out of sight overhead. */
    var w = Math.max(textWidth(text, h), back ? textWidth(back, h) : 0) + 0.5, y0 = Math.min(ceil - 0.95, 2.75), y1 = y0 + h + 0.36;
    var P = planeAt(xc, zc, axis, dir), Q = planeAt(xc, zc, axis, -dir);
    var a = P(-w / 2, y0, 0.03), b = P(w / 2, y1, -0.03);
    K.box(Math.min(a[0], b[0]), y0, Math.min(a[2], b[2]), Math.max(a[0], b[0]), y1, Math.max(a[2], b[2]), '#111417', { under: 0.4 });
    [-w / 2 + 0.2, w / 2 - 0.2].forEach(function (u) {
      var p = P(u, 0, 0);
      K.box(p[0] - 0.012, y1, p[2] - 0.012, p[0] + 0.012, ceil, p[2] + 0.012, '#202326');
    });
    neonText(K, P, text, 0, y0 + 0.18, h, 0.045, col);
    if (back) neonText(K, Q, back, 0, y0 + 0.18, h, 0.045, col2 || col);
  }
  function crateStack(K, rng, x0, z0, x1, z1, solids, maxH) {
    var cols = S.crate || ['#4d5a3a', '#5a4a2e', '#3a4a52', '#6b5532', '#3e4640'];
    var y = 0, n = rng.int(1, maxH || 3), sx = x1 - x0, sz = z1 - z0;
    for (var k = 0; k < n; k++) {
      var sh = k ? rng.range(0.05, 0.18) : 0, h = rng.range(0.55, 0.9);
      var ax0 = x0 + sh, az0 = z0 + sh * 0.6, ax1 = x1 - sh * 0.4, az1 = z1 - sh;
      var c = rng.pick(cols);
      K.box(ax0, y, az0, ax1, y + h, az1, c);
      /* A stencil band and the battens. */
      K.box(ax0 - 0.005, y + h * 0.42, az0 - 0.005, ax1 + 0.005, y + h * 0.58, az1 + 0.005, shade(c, 0.7));
      y += h;
      if (sx < 0.8 || sz < 0.8) break;
    }
    solids.push([x0, z0, x1, z1]);
  }
  function lockers(K, rng, P, u0, u1, solids, toBox) {
    var cols = ['#3d5566', '#4a5a3e', '#5a5048', '#3f4a5a'];
    var base = rng.pick(cols);
    for (var u = u0; u + 0.5 <= u1; u += 0.52) {
      var c = rng.next() < 0.15 ? rng.pick(cols) : base;
      var a = P(u, 0, 0.02), b = P(u + 0.5, 1.9, 0.48);
      var bx0 = Math.min(a[0], b[0]), bx1 = Math.max(a[0], b[0]), bz0 = Math.min(a[2], b[2]), bz1 = Math.max(a[2], b[2]);
      K.box(bx0, 0, bz0, bx1, 1.9, bz1, c);
      /* Vents and a handle on the door. */
      for (var v = 1.55; v < 1.8; v += 0.07) wallPlate(K, P, u + 0.12, v, u + 0.38, v + 0.025, 0.485, shade(c, 0.6), { bias: -0.02 });
      wallPlate(K, P, u + 0.4, 0.95, u + 0.44, 1.15, 0.49, '#9aa0a6', { bias: -0.02 });
    }
    var A = P(u0, 0, 0), B = P(u1, 0, 0.5);
    solids.push([Math.min(A[0], B[0]), Math.min(A[2], B[2]), Math.max(A[0], B[0]), Math.max(A[2], B[2])]);
  }
  function vending(K, rng, P, u, solids, label) {
    var a = P(u, 0, 0.02), b = P(u + 0.95, 2.0, 0.8);
    var bx0 = Math.min(a[0], b[0]), bx1 = Math.max(a[0], b[0]), bz0 = Math.min(a[2], b[2]), bz1 = Math.max(a[2], b[2]);
    var body = rng.pick(['#7a2a2a', '#2a4a7a', '#2a6a5a', '#6a5a2a']);
    K.box(bx0, 0, bz0, bx1, 2.0, bz1, body);
    wallPlate(K, P, u + 0.08, 0.75, u + 0.68, 1.85, 0.805, '#cfe9ff', { lit: true, bias: -0.04 });
    for (var r = 0; r < 4; r++) for (var c2 = 0; c2 < 4; c2++) {
      wallPlate(K, P, u + 0.12 + c2 * 0.14, 0.82 + r * 0.26, u + 0.22 + c2 * 0.14, 0.98 + r * 0.26, 0.81, rng.pick(GLASS), { lit: true, bias: -0.05 });
    }
    wallPlate(K, P, u + 0.73, 1.2, u + 0.88, 1.6, 0.805, '#20262c', { bias: -0.04 });
    if (label) neonText(K, P, label, u + 0.47, 1.88, 0.09, 0.815, '#ffffff');
    solids.push([bx0, bz0, bx1, bz1]);
  }
  /* A terminal on a pedestal, its screen facing (fx, fz). */
  function terminal(K, x, z, fx, fz, col) {
    K.box(x - 0.15, 0, z - 0.15, x + 0.15, 1.0, z + 0.15, '#3a3f45');
    var sx = x + fx * 0.02, sz = z + fz * 0.02;
    var P = Math.abs(fx) > Math.abs(fz) ? planeAt(sx + fx * 0.16, sz, 'x', fx > 0 ? -1 : 1) : planeAt(sx, sz + fz * 0.16, 'z', fz > 0 ? -1 : 1);
    K.box(x - 0.24, 1.0, z - 0.24, x + 0.24, 1.42, z + 0.24, '#24282c');
    wallPlate(K, P, -0.19, 1.05, 0.19, 1.37, 0.09, col || '#3ff0ff', { lit: true, bias: -0.04 });
    for (var i = 0; i < 4; i++) wallPlate(K, P, -0.15, 1.1 + i * 0.065, -0.15 + 0.08 + (i * 37 % 5) * 0.05, 1.12 + i * 0.065, 0.095, '#0b2b33', { lit: true, bias: -0.05 });
  }
  /* An advertising panel: a glowing two-tone plate with glyphs on it. */
  function adPanel(K, rng, P, u, v, w, h, d) {
    var a = rng.pick(NEON), b = shade(rng.pick(NEON), 0.55);
    wallPlate(K, P, u - 0.06, v - 0.06, u + w + 0.06, v + h + 0.06, d, '#0b0d10', { bias: -0.02 });
    wallPlate(K, P, u, v, u + w, v + h * 0.55, d + 0.005, b, { lit: true, bias: -0.04 });
    wallPlate(K, P, u, v + h * 0.55, u + w, v + h, d + 0.005, shade(a, 0.7), { lit: true, bias: -0.04 });
    var n = Math.max(1, Math.floor(h / 0.55));
    for (var i = 0; i < n; i++) glyph(K, P, rng, u + w * 0.12, v + h - 0.5 - i * 0.55, 0.38, d + 0.02, '#ffffff');
    /* A face-sized blob of colour: the product. */
    wallPlate(K, P, u + w * 0.55, v + h * 0.15, u + w * 0.88, v + h * 0.7, d + 0.012, rng.pick(NEON), { lit: true, bias: -0.05 });
  }
  function bench(K, x0, z0, x1, z1, col, solids, seats, faceYaw) {
    K.box(x0, 0.42, z0, x1, 0.48, z1, col);
    [[x0 + 0.1, z0 + 0.05], [x1 - 0.18, z0 + 0.05]].forEach(function (p) { K.box(p[0], 0, z0 + 0.05, p[0] + 0.08, 0.42, z1 - 0.05, '#2b2f33'); });
    solids.push([x0, z0, x1, z1]);
    if (seats) {
      var along = (x1 - x0) > (z1 - z0);
      for (var s = 0.45; s < (along ? x1 - x0 : z1 - z0) - 0.3; s += 0.8) {
        seats.push(along ? { x: x0 + s, z: (z0 + z1) / 2, yaw: faceYaw } : { x: (x0 + x1) / 2, z: z0 + s, yaw: faceYaw });
      }
    }
  }
  function planter(K, rng, x, z, solids) {
    K.box(x - 0.4, 0, z - 0.4, x + 0.4, 0.55, z + 0.4, '#3a3a36');
    var g = rng.pick(['#3f6b3a', '#4f7a3a', '#5a6b32']);
    for (var i = 0; i < 5; i++) {
      var a = i / 5 * Math.PI * 2 + rng.next(), r = rng.range(0.05, 0.25), hh = rng.range(0.5, 1.2);
      K.box(x + Math.cos(a) * r - 0.06, 0.55, z + Math.sin(a) * r - 0.06, x + Math.cos(a) * r + 0.06, 0.55 + hh, z + Math.sin(a) * r + 0.06, shade(g, rng.range(0.8, 1.2)));
    }
    solids.push([x - 0.4, z - 0.4, x + 0.4, z + 0.4]);
  }
  function fixtures(K, room, cols, rows, col) {
    var y = room.y1 - 0.02, w = room.x1 - room.x0, d = room.z1 - room.z0;
    col = S.fixture || col;
    for (var i = 0; i < cols; i++) for (var j = 0; j < rows; j++) {
      var x = room.x0 + w * (i + 0.5) / cols, z = room.z0 + d * (j + 0.5) / rows;
      K.box(x - 0.9, y - 0.12, z - 0.18, x + 0.9, y, z + 0.18, '#2a2e33');
      /* In a pirate hole some of them have simply died. */
      var dead = S.dead && (((i * 31 + j * 17 + Math.round(room.x0 * 7 + room.z0 * 3)) % 100 + 100) % 100) / 100 < S.dead;
      K.quad([[x - 0.82, y - 0.125, z - 0.12], [x + 0.82, y - 0.125, z - 0.12], [x + 0.82, y - 0.125, z + 0.12], [x - 0.82, y - 0.125, z + 0.12]],
             dead ? '#2a2c2e' : col, { lit: !dead, bias: -0.05 });
    }
  }
  /* Is (x, z) within `r` of any door into `room`, or any usable item? */
  function blockedNear(plan, room, x, z, r) {
    var near = plan.doors.some(function (d) {
      if (d.a !== room.id && d.b !== room.id) return false;
      var dx = Math.max(d.x0 - r, Math.min(x, d.x1 + r)), dz = Math.max(d.z0 - r, Math.min(z, d.z1 + r));
      return dx === x && dz === z;
    });
    if (near) return true;
    return plan.items.some(function (it) {
      if (it.prop) return false;
      if (Math.hypot(it.x - x, it.z - z) < r + 0.6) return true;
      var c = it.counter;
      return c && x > c[0] - r && x < c[2] + r && z > c[1] - r && z < c[3] + r;
    });
  }
  function grime(K, rng, room, n, col) {
    n = Math.round(n * (S.grime === undefined ? 1 : S.grime));
    for (var g = 0; g < n; g++) {
      var gx = rng.range(room.x0 + 0.3, room.x1 - 1.3), gz = rng.range(room.z0 + 0.3, room.z1 - 1.3), gw = rng.range(0.5, 1.5), gd = rng.range(0.4, 1.2);
      K.quad([[gx, 0.004, gz], [gx + gw, 0.004, gz], [gx + gw, 0.004, gz + gd], [gx, 0.004, gz + gd]], col, { bias: -0.01 });
    }
  }
  function ceilingPipes(K, room, sides, H) {
    sides.forEach(function (side, k) {
      var P = wallPoint(room, side), L = wallLen(room, side);
      for (var n = 0; n < 2; n++) {
        var v = H - 0.16 - n * 0.18, d = 0.2 + n * 0.08, r = 0.055 - n * 0.012;
        var a = P(0, v, d - r), b = P(L, v, d + r);
        K.box(Math.min(a[0], b[0]), v - r, Math.min(a[2], b[2]), Math.max(a[0], b[0]), v + r, Math.max(a[2], b[2]), (n + k) % 2 ? RUST : PIPE, { under: 0.5 });
      }
    });
  }
  function sideOfDoor(room, d) {
    if (d.axis === 'x') return Math.abs(d.at - room.x0) < 0.01 ? 'x0' : 'x1';
    return Math.abs(d.at - room.z0) < 0.01 ? 'z0' : 'z1';
  }
  /* A door's centre as a distance along its wall (wallPoint's u). */
  function doorU(room, side, d) {
    var cx = (d.x0 + d.x1) / 2, cz = (d.z0 + d.z1) / 2;
    if (side === 'x0') return cz - room.z0;
    if (side === 'x1') return room.z1 - cz;
    if (side === 'z1') return cx - room.x0;
    return room.x1 - cx;
  }

  /* ---- THE CONCOURSE: the street under the station's roof --------------- */
  function dressConcourse(plan, room, rng) {
    var K = Kit(), solids = [], seats = [];
    var x0 = room.x0, x1 = room.x1, z0 = room.z0, z1 = room.z1, H = room.y1;
    var cx = (x0 + x1) / 2;
    grime(K, rng, room, 12, '#2c2925');
    fixtures(K, room, 3, 3, '#dfeaff');

    /* Pillars, holding the roof up and the ads. */
    [[x0 + 3.5, z0 + 5], [x1 - 3.5, z0 + 5], [x0 + 3.5, z1 - 5], [x1 - 3.5, z1 - 5]].forEach(function (p) {
      K.box(p[0] - 0.45, 0, p[1] - 0.45, p[0] + 0.45, H, p[1] + 0.45, '#4a443d');
      K.box(p[0] - 0.5, 0, p[1] - 0.5, p[0] + 0.5, 0.35, p[1] + 0.5, '#3a352f');
      /* A ring of light round each, at head height. */
      K.box(p[0] - 0.47, 2.6, p[1] - 0.47, p[0] + 0.47, 2.68, p[1] + 0.47, rng.pick(NEON), { lit: true });
      solids.push([p[0] - 0.5, p[1] - 0.5, p[0] + 0.5, p[1] + 0.5]);
    });

    /* The noodle stand, south-west: a counter, a canopy, red lanterns. */
    var nx0 = x0 + 2.2, nx1 = x0 + 5.2, nz0 = z0 + 1.6, nz1 = z0 + 3.2;
    if (!blockedNear(plan, room, (nx0 + nx1) / 2, (nz0 + nz1) / 2, 1.2)) {
      K.box(nx0, 0, nz0, nx1, 1.0, nz1, '#5a3a26', { top: '#3a2618' });
      K.box(nx1, 0.06, nz0, nx1 + 0.02, 0.14, nz1, '#ffb43f', { lit: true });
      K.box(nx0 - 0.3, 2.45, nz0 - 0.4, nx1 + 0.5, 2.55, nz1 + 0.4, '#7a1f24', { under: 0.5 });
      [[nx0 - 0.25, nz0 - 0.35], [nx1 + 0.45, nz0 - 0.35], [nx0 - 0.25, nz1 + 0.35], [nx1 + 0.45, nz1 + 0.35]].forEach(function (p) {
        K.box(p[0] - 0.03, 0, p[1] - 0.03, p[0] + 0.03, 2.45, p[1] + 0.03, '#2b2f33');
      });
      for (var li = 0; li < 4; li++) {
        var lz = nz0 - 0.2 + li * ((nz1 - nz0 + 0.4) / 3), lx = nx1 + 0.4;
        K.box(lx - 0.01, 2.1, lz - 0.01, lx + 0.01, 2.45, lz + 0.01, '#202326');
        K.prism(lx, lz, 0.16, 0.16, 1.82, 2.1, 8, '#ff4a3a', { litSide: true, litTop: true });
      }
      /* Steam pots and a menu board. */
      K.prism(nx0 + 0.5, nz0 + 0.8, 0.22, 0.22, 1.0, 1.25, 8, '#8a8f94');
      K.prism(nx0 + 1.1, nz0 + 0.8, 0.2, 0.2, 1.0, 1.2, 8, '#8a8f94');
      var Pm = planeAt(nx0 + 0.1, (nz0 + nz1) / 2, 'x', -1);
      solids.push([nx0, nz0, nx1, nz1]);
      for (var sz = nz0 + 0.3; sz < nz1; sz += 0.75) {
        var sx = nx1 + 0.55;
        K.box(sx - 0.03, 0, sz - 0.03, sx + 0.03, 0.7, sz + 0.03, METAL);
        K.prism(sx, sz, 0.18, 0.19, 0.7, 0.77, 8, '#7a1f24');
        seats.push({ x: sx + 0.08, z: sz, yaw: -Math.PI / 2, high: true });
      }
      var Pw = wallPoint(room, 'x0');
      wallPlate(K, Pw, nz0 - z0 - 0.2, 1.4, nz1 - z0 + 0.2, 2.3, SIGN_D, '#120d0b', { bias: -0.02 });
      for (var gi2 = 0; gi2 < 3; gi2++) glyph(K, Pw, rng, nz0 - z0 + 0.05 + gi2 * 0.55, 1.55, 0.45, SIGN_D + 0.015, '#ffb43f');
    }

    /* Benches and planters in the east half. */
    var bz = z0 + (z1 - z0) * 0.55;
    for (var bi = 0; bi < 2; bi++) {
      var bx = x1 - 7.5 + bi * 3.2;
      if (blockedNear(plan, room, bx + 1.1, bz, 0.9)) continue;
      bench(K, bx, bz - 0.25, bx + 2.2, bz + 0.25, '#5a3a26', solids, seats, Math.PI);
      planter(K, rng, bx + 2.7, bz, solids);
    }

    /* Crates in the corners that nothing uses. */
    [[x1 - 2.6, z0 + 0.4], [x0 + 0.4, z1 - 2.4]].forEach(function (c) {
      if (blockedNear(plan, room, c[0] + 1, c[1] + 1, 0.8)) return;
      crateStack(K, rng, c[0], c[1], c[0] + 1.1, c[1] + 1.1, solids, 3);
      crateStack(K, rng, c[0] + 1.2, c[1] + 0.2, c[0] + 2.1, c[1] + 1.1, solids, 2);
    });

    /* Shopfronts down the side walls: shutters, mostly down, a glyph sign
     * over each - the street's other trades, shut for the shift. */
    ['x0', 'x1'].forEach(function (side) {
      var P = wallPoint(room, side), L = wallLen(room, side);
      for (var su = 1.5; su + 3 < L - 1; su += 4.2) {
        var mid = P(su + 1.5, 0, 0.6);
        if (blockedNear(plan, room, mid[0], mid[2], 1.2)) continue;
        /* The noodle stand has this stretch of wall for its own sign. */
        if (side === 'x0' && su < nz1 - z0 + 0.5 && su + 3 > nz0 - z0 - 0.5) continue;
        var open = rng.next() < 0.3, sh = open ? rng.range(1.9, 2.3) : 0;
        wallPlate(K, P, su - 0.15, 0, su + 3.15, 2.85, 0.03, '#2a2622', { bias: -0.02 });
        wallPlate(K, P, su, sh, su + 3, 2.6, 0.045, '#4d5257', { bias: -0.03 });
        for (var rv = sh + 0.12; rv < 2.55; rv += 0.16) wallPlate(K, P, su, rv, su + 3, rv + 0.03, 0.05, '#3a3e42', { bias: -0.035 });
        if (open) wallPlate(K, P, su, 0, su + 3, sh, 0.035, '#ffcf87', { lit: true, bias: -0.04 });
        var gc = rng.pick(NEON);
        wallPlate(K, P, su + 0.4, 2.95, su + 2.6, 3.55, SIGN_D, '#0b0d10', { bias: -0.02 });
        for (var gk = 0; gk < 3; gk++) glyph(K, P, rng, su + 0.6 + gk * 0.65, 3.03, 0.42, SIGN_D + 0.015, gc);
      }
    });

    /* An information kiosk in the middle of the floor: a round pillar of
     * screens. */
    var kx = cx, kz = z0 + (z1 - z0) / 2;
    if (!blockedNear(plan, room, kx, kz, 1.0)) {
      K.prism(kx, kz, 0.7, 0.7, 0, 0.25, 8, '#2b2f33');
      K.prism(kx, kz, 0.55, 0.55, 0.25, 2.6, 8, '#24282c');
      K.prism(kx, kz, 0.58, 0.58, 0.9, 2.1, 8, '#2fb6c9', { litSide: true, openTop: true });
      K.prism(kx, kz, 0.62, 0.62, 2.6, 2.75, 8, rng.pick(NEON), { litSide: true, litTop: true });
      solids.push([kx - 0.7, kz - 0.7, kx + 0.7, kz + 0.7]);
    }

    /* Ads high on the side walls, the way a street sells to you. */
    ['x0', 'x1'].forEach(function (side) {
      var P = wallPoint(room, side), L = wallLen(room, side);
      /* Above the shopfronts' signs (which top out at 3.55 m). */
      adPanel(K, rng, P, 2.0, 3.85, 3.2, 1.8, 0.05);
      adPanel(K, rng, P, L - 5.4, 3.8, 2.2, 1.95, 0.05);
    });

    /* Over each counter, what it is, in neon. */
    var Pn = wallPoint(room, 'z1');
    plan.items.forEach(function (it) {
      if (!it.counter || (it.kind !== 'market' && it.kind !== 'yard')) return;
      var u = (it.counter[0] + it.counter[2]) / 2 - x0, word = it.kind === 'market' ? 'MARKET' : 'SHIPYARD';
      wallPlate(K, Pn, u - textWidth(word, 0.45) / 2 - 0.3, 2.3, u + textWidth(word, 0.45) / 2 + 0.3, 3.15, SIGN_D, '#0b0d10', { bias: -0.02 });
      neonText(K, Pn, word, u, 2.5, 0.45, SIGN_D + 0.015, it.kind === 'market' ? '#3ff0ff' : '#ffb43f');
      /* Terminals on the desk. */
      for (var tx = it.counter[0] + 0.8; tx < it.counter[2] - 0.5; tx += 2) {
        K.box(tx - 0.3, 1.05, it.counter[1] + 0.3, tx + 0.3, 1.45, it.counter[1] + 0.36, '#24282c');
        K.quad([[tx - 0.26, 1.09, it.counter[1] + 0.295], [tx + 0.26, 1.09, it.counter[1] + 0.295], [tx + 0.26, 1.41, it.counter[1] + 0.295], [tx - 0.26, 1.41, it.counter[1] + 0.295]], it.kind === 'market' ? '#3ff0ff' : '#ffb43f', { lit: true, bias: -0.04 });
      }
    });

    /* A departures board on the south wall, by the way back to the ships. */
    var Ps = wallPoint(room, 'z0'), Ls = wallLen(room, 'z0');
    var du = Ls / 2 + 4.5;
    wallPlate(K, Ps, du, 2.4, du + 4.2, 4.4, 0.05, '#0b0d10', { bias: -0.02 });
    for (var row = 0; row < 7; row++) {
      var vy = 4.15 - row * 0.25;
      wallPlate(K, Ps, du + 0.15, vy, du + 0.15 + rng.range(1.2, 2.2), vy + 0.12, 0.06, '#ffb43f', { lit: true, bias: -0.04 });
      wallPlate(K, Ps, du + 2.8, vy, du + 3.2 + rng.range(0, 0.6), vy + 0.12, 0.06, row % 3 ? '#5aff9c' : '#ff5a3c', { lit: true, bias: -0.04 });
    }

    /* Overhead, just inside the door from the spine: where things are. */
    var bar = plan.rooms.filter(function (r) { return r.kind === 'bar'; })[0], hall = plan.rooms.filter(function (r) { return r.kind === 'crewhall'; })[0];
    var wordL = bar ? '< BAR' : '', wordR = hall ? 'CREW >' : '';
    if (wordL) hangingSign(K, cx - 3.2, z0 + 3.2, 'z', 1, wordL, '', 0.4, '#ff3fa4', null, H);
    if (wordR) hangingSign(K, cx + 3.2, z0 + 3.2, 'z', 1, wordR, '', 0.4, '#5aff9c', null, H);
    hangingSign(K, cx, z0 + 3.2, 'z', -1, '^ BERTHS', '', 0.4, '#3ff0ff', null, H);

    ceilingPipes(K, room, ['x0', 'x1'], H);
    return { quads: K.quads, solids: solids, seats: seats, noStrip: true };
  }

  /* ---- THE CREW HALL: where hands wait for a berth ----------------------- */
  function dressCrewHall(plan, room, rng) {
    var K = Kit(), solids = [], seats = [];
    var H = room.y1;
    grime(K, rng, room, 6, '#232723');
    fixtures(K, room, 2, 2, '#f2f0d8');
    var board = plan.items.filter(function (it) { return it.kind === 'crew'; })[0];
    /* Lockers down the north wall. */
    var Pn = wallPoint(room, 'z1'), Ln = wallLen(room, 'z1');
    var u0 = 1.2, u1 = Ln - 1.2;
    if (board && board.counter[3] > room.z1 - 1.5) u1 = Math.min(u1, board.counter[0] - room.x0 - 0.8);
    lockers(K, rng, Pn, u0, u1, solids);
    /* The job board: cork, and the paper on it. */
    if (board) {
      var side = board.counter[2] >= room.x1 - 0.05 ? 'x1' : 'x0', Pb = wallPoint(room, side);
      var uc = side === 'x1' ? room.z1 - (board.counter[1] + board.counter[3]) / 2 : (board.counter[1] + board.counter[3]) / 2 - room.z0;
      wallPlate(K, Pb, uc - 2.2, 1.25, uc + 2.2, 2.65, 0.02, '#6b4a2e', { bias: -0.02 });
      for (var n = 0; n < 22; n++) {
        var pu = uc + rng.range(-2.05, 1.8), pv = rng.range(1.32, 2.4), pw = rng.range(0.18, 0.3), ph = rng.range(0.2, 0.3);
        wallPlate(K, Pb, pu, pv, pu + pw, pv + ph, 0.025 + n * 0.0004, rng.pick(['#e9e2cc', '#d9cfb0', '#f2ecd8', '#c9d8e0', '#e8c8a0']), { bias: -0.03 });
        wallPlate(K, Pb, pu + pw / 2 - 0.012, pv + ph - 0.03, pu + pw / 2 + 0.012, pv + ph - 0.006, 0.03 + n * 0.0004, '#c0302a', { bias: -0.035 });
      }
      neonText(K, Pb, 'HIRING', uc, 2.78, 0.3, 0.05, '#5aff9c');
    }
    /* Benches to wait on. */
    var bx0 = room.x0 + 2.4, bx1 = room.x1 - 2.6, mz = (room.z0 + room.z1) / 2;
    [mz - 1.15, mz + 0.9].forEach(function (z, k) {
      if (blockedNear(plan, room, (bx0 + bx1) / 2, z, 0.2)) return;
      bench(K, bx0, z - 0.2, bx1, z + 0.2, k ? '#4a5560' : '#5a3a26', solids, seats, k ? Math.PI : 0);
    });
    /* A vending machine and the coffee, south wall. */
    var Ps = wallPoint(room, 'z0'), Ls = wallLen(room, 'z0');
    vending(K, rng, Ps, 1.0, solids, 'KAFE');
    var cu = Ls - 3.0, ca = Ps(cu, 0, 0.02), cb = Ps(cu + 1.2, 0.9, 0.6);
    K.box(Math.min(ca[0], cb[0]), 0, Math.min(ca[2], cb[2]), Math.max(ca[0], cb[0]), 0.9, Math.max(ca[2], cb[2]), '#3a3f45');
    var urn = Ps(cu + 0.4, 0, 0.3);
    K.prism(urn[0], urn[2], 0.15, 0.15, 0.9, 1.35, 8, '#9aa0a6');
    K.box(urn[0] + 0.25, 0.9, urn[2] - 0.05, urn[0] + 0.35, 1.0, urn[2] + 0.05, '#e9e2cc');
    solids.push([Math.min(ca[0], cb[0]), Math.min(ca[2], cb[2]), Math.max(ca[0], cb[0]), Math.max(ca[2], cb[2])]);
    ceilingPipes(K, room, ['z0'], H);
    return { quads: K.quads, solids: solids, seats: seats, noStrip: true };
  }

  /* ---- THE SPINE: the corridor the berths open off ----------------------- */
  function dressSpine(plan, room, rng) {
    var K = Kit(), solids = [];
    var H = room.y1, L = room.z1 - room.z0;
    grime(K, rng, room, Math.round(L / 3), '#25292d');
    /* Fixtures every four metres, not one white slab the length of it. */
    fixtures(K, room, 1, Math.max(2, Math.round(L / 4)), '#cfe2ff');
    /* Hazard stripes down both edges of the floor. */
    for (var z = room.z0; z < room.z1 - 0.01; z += 0.5) {
      var col = Math.floor((z - room.z0) / 0.5) % 2 ? '#d9a521' : '#1a1c1e';
      [[room.x0 + 0.05, room.x0 + 0.25], [room.x1 - 0.25, room.x1 - 0.05]].forEach(function (s) {
        K.quad([[s[0], 0.005, z], [s[1], 0.005, z], [s[1], 0.005, z + 0.5], [s[0], 0.005, z + 0.5]], col, { bias: -0.012 });
      });
    }
    ceilingPipes(K, room, ['x0', 'x1'], H);
    /* Each berth's door: its number over it, coloured by its size. */
    var SIZE_COL = { L: '#ffb43f', M: '#3ff0ff', S: '#5aff9c' };
    plan.doors.forEach(function (d) {
      var other = d.a === room.id ? d.b : d.b === room.id ? d.a : null;
      if (!other) return;
      var br = plan.rooms.filter(function (r) { return r.id === other; })[0];
      if (!br || br.kind !== 'berth') return;
      var side = sideOfDoor(room, d), P = wallPoint(room, side), u = doorU(room, side, d);
      var txt = 'BERTH ' + (br.index + 1) + ' ' + br.size;
      var hh = 0.22, top = d.h + 0.12;
      if (top + hh + 0.15 > H) return;
      wallPlate(K, P, u - textWidth(txt, hh) / 2 - 0.15, top, u + textWidth(txt, hh) / 2 + 0.15, top + hh + 0.16, 0.05, '#0b0d10', { bias: -0.02 });
      neonText(K, P, txt, u, top + 0.08, hh, 0.065, SIZE_COL[br.size] || '#ffffff');
      /* And a red fire cabinet between doors, now and then. */
      if (rng.next() < 0.5) {
        var fu = u + (d.w / 2 + 0.9) * (rng.next() < 0.5 ? -1 : 1);
        wallPlate(K, P, fu - 0.25, 1.0, fu + 0.25, 1.7, 0.08, '#8a1f1f', { bias: -0.03 });
        wallPlate(K, P, fu - 0.2, 1.05, fu + 0.2, 1.4, 0.085, '#c9d8e0', { bias: -0.04 });
      }
    });
    /* Overhead signs, both faces: ahead to the concourse one way, ahead to
     * the big lock the other. */
    for (var sz = room.z0 + 8; sz < room.z1 - 4; sz += 14) {
      hangingSign(K, (room.x0 + room.x1) / 2, sz, 'z', 1, '^ CONCOURSE', '^ L PORT', 0.26, '#3ff0ff', '#ffb43f', H);
    }
    return { quads: K.quads, solids: solids, seats: [], noStrip: true };
  }

  /* ---- THE L PORT: the big lock, a loading floor --------------------------- */
  function dressLPort(plan, room, rng) {
    var K = Kit(), solids = [];
    var x0 = room.x0, x1 = room.x1, z0 = room.z0, z1 = room.z1, H = room.y1;
    grime(K, rng, room, 14, '#24282c');
    fixtures(K, room, 2, 3, '#e8f0ff');
    /* A yellow-hatched loading square in the middle of the floor. */
    var mx0 = x0 + 5, mx1 = x1 - 5, mz0 = z0 + 3, mz1 = z1 - 5;
    [[mx0, mz0, mx1, mz0 + 0.18], [mx0, mz1 - 0.18, mx1, mz1], [mx0, mz0, mx0 + 0.18, mz1], [mx1 - 0.18, mz0, mx1, mz1]].forEach(function (b) {
      K.quad([[b[0], 0.005, b[1]], [b[2], 0.005, b[1]], [b[2], 0.005, b[3]], [b[0], 0.005, b[3]]], '#d9a521', { bias: -0.012 });
    });
    /* Gantry: two rails high on the long walls and a bridge across. */
    ['x0', 'x1'].forEach(function (side) {
      var P = wallPoint(room, side), Lw = wallLen(room, side), a = P(0, H - 0.8, 0), b = P(Lw, H - 0.5, 0.35);
      K.box(Math.min(a[0], b[0]), H - 0.8, Math.min(a[2], b[2]), Math.max(a[0], b[0]), H - 0.5, Math.max(a[2], b[2]), '#5a5a3a', { under: 0.5 });
    });
    var gz = rng.range(z0 + 4, z1 - 6);
    K.box(x0 + 0.3, H - 1.1, gz - 0.3, x1 - 0.3, H - 0.6, gz + 0.3, '#c9a227', { under: 0.5 });
    var hx = rng.range(x0 + 6, x1 - 6);
    K.box(hx - 0.4, H - 1.6, gz - 0.4, hx + 0.4, H - 1.1, gz + 0.4, '#3a3f45');
    K.box(hx - 0.02, 2.8, gz - 0.02, hx + 0.02, H - 1.6, gz + 0.02, '#202326');
    K.box(hx - 0.25, 2.6, gz - 0.12, hx + 0.25, 2.8, gz + 0.12, '#d9a521');
    /* Crates along the walls, clear of the doors and the guards. */
    var spots = [];
    for (var z = z0 + 0.4; z < z1 - 2; z += 1.4) { spots.push([x0 + 0.3, z]); spots.push([x1 - 1.5, z]); }
    spots.forEach(function (s) {
      if (rng.next() < 0.35) return;
      if (blockedNear(plan, room, s[0] + 0.6, s[1] + 0.6, 1.4)) return;
      crateStack(K, rng, s[0], s[1], s[0] + 1.2, s[1] + 1.2, solids, 3);
    });
    /* The outer doors: hazard chevrons and two amber beacons. */
    var Ps = wallPoint(room, 'z0'), Ls = wallLen(room, 'z0');
    wallPlate(K, Ps, Ls / 2 - 5, 0, Ls / 2 + 5, 5.2, 0.03, '#2e3236', { bias: -0.02 });
    wallPlate(K, Ps, Ls / 2 - 0.04, 0, Ls / 2 + 0.04, 5.2, 0.04, '#111', { bias: -0.03 });
    for (var cv = 0; cv < 10; cv++) {
      var cu = Ls / 2 - 5 + cv;
      tube(K, Ps, [cu + 0.1, 5.3], [cu + 0.5, 5.6], 0.04, cv % 2 ? '#1a1c1e' : '#d9a521', 0.12);
    }
    [Ls / 2 - 5.6, Ls / 2 + 5.6].forEach(function (u) {
      var p = Ps(u, 5.4, 0.15);
      K.prism(p[0], p[2], 0.14, 0.14, 5.2, 5.5, 8, '#ff8a1a', { litSide: true, litTop: true });
    });
    neonText(K, Ps, 'L', Ls / 2 - 7.5, 3.0, 1.6, 0.06, '#ffb43f');
    ceilingPipes(K, room, ['z1'], H);
    return { quads: K.quads, solids: solids, seats: [], noStrip: true };
  }

  /* ---- YOUR SHIP'S HANGAR (2026-10-31) -------------------------------------
   * The berth of the ship you are flying, sized to her, with her standing
   * in it (main.js draws her; walk.js's room.hullBox is her footprint).
   * Everything here keeps a body's width clear of her and of her ramp. */
  function dressHangar(plan, room, rng) {
    var K = Kit(), solids = [];
    var H = room.y1, hb = room.hullBox, foot = room.rampFoot;
    var x0 = room.x0, x1 = room.x1, z0 = room.z0, z1 = room.z1;
    grime(K, rng, room, Math.round((x1 - x0) * (z1 - z0) / 25), '#22262a');
    fixtures(K, room, Math.max(2, Math.round((x1 - x0) / 7)), Math.max(2, Math.round((z1 - z0) / 7)), '#dfe9ff');
    /* Her stand: a yellow line round where she sits, a metre out, and a
     * hatched box at the foot of her ramp. */
    var m = 1.0, bx0 = hb[0] - m, bz0 = hb[1] - m, bx1 = hb[2] + m, bz1 = hb[3] + m;
    [[bx0, bz0, bx1, bz0 + 0.15], [bx0, bz1 - 0.15, bx1, bz1], [bx0, bz0, bx0 + 0.15, bz1], [bx1 - 0.15, bz0, bx1, bz1]].forEach(function (b) {
      K.quad([[b[0], 0.006, b[1]], [b[2], 0.006, b[1]], [b[2], 0.006, b[3]], [b[0], 0.006, b[3]]], '#d9a521', { bias: -0.012 });
    });
    if (foot) {
      for (var c = 0; c < 6; c++) {
        var cz = foot.z - 1.4 + c * 0.5;
        K.quad([[foot.x - 1.2, 0.007, cz], [foot.x + 1.2, 0.007, cz], [foot.x + 1.2, 0.007, cz + 0.22], [foot.x - 1.2, 0.007, cz + 0.22]],
               c % 2 ? '#1a1c1e' : '#d9a521', { bias: -0.013 });
      }
    }
    /* Ribs on the long walls, hazard stripes at their foot. */
    ['x0', 'x1', 'z0', 'z1'].forEach(function (side) {
      var P = wallPoint(room, side), L = wallLen(room, side);
      for (var u = 0; u < L - 0.01; u += 0.6) {
        wallPlate(K, P, u, 0, Math.min(L, u + 0.6), 0.35, 0.012, Math.floor(u / 0.6) % 2 ? '#d9a521' : '#1a1c1e', { bias: -0.015 });
      }
      for (var r = 3; r < L - 1; r += 3) {
        var a = P(r - 0.12, 0, 0), b = P(r + 0.12, H, 0.18);
        var rx0 = Math.min(a[0], b[0]), rx1 = Math.max(a[0], b[0]), rz0 = Math.min(a[2], b[2]), rz1 = Math.max(a[2], b[2]);
        if (blockedNear(plan, room, (rx0 + rx1) / 2, (rz0 + rz1) / 2, 1.2)) continue;
        K.box(rx0, 0, rz0, rx1, H, rz1, '#3a4048');
      }
    });
    ceilingPipes(K, room, ['z0', 'z1'], H);
    /* A gantry rail across, high up, the way a hangar lifts things. */
    var gz = (z0 + z1) / 2;
    K.box(x0 + 0.3, H - 0.9, gz - 0.25, x1 - 0.3, H - 0.55, gz + 0.25, '#c9a227', { under: 0.5 });
    /* Crates and a fuel bowser along the side walls, clear of her. */
    function clearOfHer(xa, za, xb, zb) { return xb < bx0 - 0.6 || xa > bx1 + 0.6 || zb < bz0 - 0.6 || za > bz1 + 0.6; }
    for (var x = x0 + 1.2; x < x1 - 2.4; x += 2.2) {
      [[z0 + 0.35, z0 + 1.45], [z1 - 1.45, z1 - 0.35]].forEach(function (zz) {
        if (rng.next() < 0.45) return;
        if (!clearOfHer(x, zz[0], x + 1.2, zz[1])) return;
        if (blockedNear(plan, room, x + 0.6, (zz[0] + zz[1]) / 2, 1.0)) return;
        crateStack(K, rng, x, zz[0], x + 1.2, zz[1], solids, 3);
      });
    }
    /* The bowser: a tank on a cart, hose coiled on top. */
    var bwx = (bx0 + bx1) / 2 + rng.range(-2, 2), bwz = bz1 + 1.4 < z1 - 1.6 ? bz1 + 1.0 : bz0 - 2.2;
    if (clearOfHer(bwx - 1.2, bwz, bwx + 1.2, bwz + 1.1) && bwz > z0 + 0.4 && bwz + 1.1 < z1 - 0.4) {
      K.box(bwx - 1.2, 0.25, bwz, bwx + 1.2, 1.25, bwz + 1.1, '#8a6a1f');
      K.box(bwx - 1.25, 0.0, bwz - 0.05, bwx + 1.25, 0.25, bwz + 1.15, '#2b2f33');
      K.prism(bwx + 0.6, bwz + 0.55, 0.32, 0.32, 1.25, 1.45, 8, '#1c1e20');
      solids.push([bwx - 1.25, bwz - 0.05, bwx + 1.25, bwz + 1.15]);
    }
    /* By the door: a terminal, and the hangar's number in neon over it. */
    var door = plan.doors.filter(function (d) { return d.a === room.id || d.b === room.id; })[0];
    if (door) {
      var ds = sideOfDoor(room, door), Pd = wallPoint(room, ds), du = doorU(room, ds, door);
      var tp = Pd(du + door.w / 2 + 0.9, 0, 0.5), fv = Pd(0, 0, 1), f0 = Pd(0, 0, 0);
      terminal(K, tp[0], tp[2], fv[0] - f0[0], fv[2] - f0[2], '#ffb43f');
      solids.push([tp[0] - 0.25, tp[2] - 0.25, tp[0] + 0.25, tp[2] + 0.25]);
      var txt = 'HANGAR ' + ((room.index || 0) + 1);
      wallPlate(K, Pd, du - textWidth(txt, 0.4) / 2 - 0.3, door.h + 0.25, du + textWidth(txt, 0.4) / 2 + 0.3, door.h + 0.95, SIGN_D, '#0b0d10', { bias: -0.02 });
      neonText(K, Pd, txt, du, door.h + 0.4, 0.4, SIGN_D + 0.015, '#ffb43f');
    }
    return { quads: K.quads, solids: solids, seats: [], noStrip: true };
  }

  /* ---- A BERTH: the room at the end of a ship's hatch ------------------ */
  function dressBerth(plan, room, rng) {
    if (room.hangar) return dressHangar(plan, room, rng);
    var K = Kit(), solids = [];
    var H = room.y1;
    grime(K, rng, room, 4, '#25292d');
    var outer = room.side < 0 ? 'x0' : 'x1', Po = wallPoint(room, outer), Lo = wallLen(room, outer);
    var hu = Lo / 2;
    /* Hatch approach: a yellow box on the floor. */
    var a = Po(hu - 1.4, 0, 0.1), b = Po(hu + 1.4, 0, 2.2);
    var fx0 = Math.min(a[0], b[0]), fx1 = Math.max(a[0], b[0]), fz0 = Math.min(a[2], b[2]), fz1 = Math.max(a[2], b[2]);
    [[fx0, fz0, fx1, fz0 + 0.1], [fx0, fz1 - 0.1, fx1, fz1], [fx0, fz0, fx0 + 0.1, fz1], [fx1 - 0.1, fz0, fx1, fz1]].forEach(function (q) {
      K.quad([[q[0], 0.005, q[1]], [q[2], 0.005, q[1]], [q[2], 0.005, q[3]], [q[0], 0.005, q[3]]], '#d9a521', { bias: -0.012 });
    });
    /* The fuel line: down the outer wall beside the hatch and into it. */
    var fu = hu + 1.9;
    var t = Po(fu, 0, 0.12), tt = Po(fu, H, 0.22);
    K.box(Math.min(t[0], tt[0]), 0.4, Math.min(t[2], tt[2]), Math.max(t[0], tt[0]), H, Math.max(t[2], tt[2]), RUST);
    var r1 = Po(fu - 0.2, 0, 0.2);
    K.prism(r1[0], r1[2], 0.28, 0.28, 0.0, 0.5, 8, '#c9a227');
    /* The berth's number, big, over the hatch. */
    var num = String((room.index || 0) + 1), ncol = room.size === 'L' ? '#ffb43f' : room.size === 'M' ? '#3ff0ff' : '#5aff9c';
    /* Over the hatch where there is headroom over its light; beside it,
     * at eye height, where there is not (an S berth is 3.4 m high). */
    if (H >= 3.9) neonText(K, Po, num, hu, 2.95, 0.6, 0.05, ncol);
    else neonText(K, Po, num, hu - 2.0, 1.3, 0.6, 0.05, ncol);
    /* Lockers down one side wall, crates in a far corner, a terminal by the
     * door. */
    var sideW = rng.next() < 0.5 ? 'z0' : 'z1', Pz = wallPoint(room, sideW), Lz = wallLen(room, sideW);
    var lu0 = outer === 'x0' ? (sideW === 'z1' ? Lz - 3.4 : 0.9) : (sideW === 'z1' ? 0.9 : Lz - 3.4);
    lockers(K, rng, Pz, lu0, lu0 + 2.5, solids);
    var other = sideW === 'z0' ? 'z1' : 'z0', Pq = wallPoint(room, other), Lq = wallLen(room, other);
    var cu = outer === 'x0' ? (other === 'z1' ? Lq - 2.2 : 0.4) : (other === 'z1' ? 0.4 : Lq - 2.2);
    var ca = Pq(cu, 0, 0.3), cb = Pq(cu + 1.6, 0, 1.4);
    var cx0 = Math.min(ca[0], cb[0]), cz0 = Math.min(ca[2], cb[2]);
    if (!blockedNear(plan, room, cx0 + 0.6, cz0 + 0.5, 1.0)) crateStack(K, rng, cx0, cz0, cx0 + 1.1, cz0 + 1.0, solids, 3);
    var door = plan.doors.filter(function (d) { return d.a === room.id || d.b === room.id; })[0];
    if (door) {
      var ds = sideOfDoor(room, door), Pd = wallPoint(room, ds), duu = doorU(room, ds, door);
      var tp = Pd(duu + door.w / 2 + 0.7, 0, 0.5), fxv = Pd(0, 0, 1), f0 = Pd(0, 0, 0);
      terminal(K, tp[0], tp[2], fxv[0] - f0[0], fxv[2] - f0[2], '#3ff0ff');
      solids.push([tp[0] - 0.25, tp[2] - 0.25, tp[0] + 0.25, tp[2] + 0.25]);
    }
    ceilingPipes(K, room, [outer], H);
    return { quads: K.quads, solids: solids, seats: [] };
  }

  /* ---- THE CARGO HALL (2026-10-31) ----------------------------------------
   * Astra: "there should be a central cargo area on the station". Between
   * the spine and the concourse: container stacks either side of a clear
   * aisle you walk up the middle of, a gantry crane over them, a forklift,
   * pallets, high-bay lamps, and the freight office's window. */
  /* Does a box (grown by m) cover anything there is to use, or its spot? */
  function overUse(plan, xa, za, xb, zb, m) {
    return plan.items.some(function (it) {
      if (it.prop) return false;
      if (it.x > xa - m && it.x < xb + m && it.z > za - m && it.z < zb + m) return true;
      var c = it.counter;
      return c && c[2] > xa - m && c[0] < xb + m && c[3] > za - m && c[1] < zb + m;
    });
  }
  function container(K, xa, ya, za, xb, zb, col) {
    var h = 2.6;
    K.box(xa, ya, za, xb, ya + h, zb, col, { top: shade(col, 1.1) });
    /* Corrugation down the long sides, a rail round the top, the doors
     * and their locking bars on the end. */
    for (var x = xa + 0.5; x < xb - 0.3; x += 1.0) {
      K.box(x - 0.04, ya + 0.1, za - 0.025, x + 0.04, ya + h - 0.1, za, shade(col, 0.8));
      K.box(x - 0.04, ya + 0.1, zb, x + 0.04, ya + h - 0.1, zb + 0.025, shade(col, 0.8));
    }
    K.box(xa - 0.02, ya + h - 0.12, za - 0.03, xb + 0.02, ya + h, zb + 0.03, shade(col, 0.65));
    [xa, xb].forEach(function (ex) {
      var o = ex === xa ? -0.02 : 0.02;
      for (var bz = za + 0.45; bz < zb - 0.3; bz += 0.5) K.box(ex + o - 0.015, ya + 0.15, bz - 0.02, ex + o + 0.015, ya + h - 0.15, bz + 0.02, '#9aa0a6');
    });
  }
  function highBay(K, x, z, H, col, dead) {
    var y = H - 2.4;
    K.box(x - 0.015, y + 0.5, z - 0.015, x + 0.015, H, z + 0.015, '#202326');
    K.prism(x, z, 0.6, 0.22, y, y + 0.5, 10, '#2a2d30', { top: '#1c1e20', bottom: true, bottomCol: dead ? '#2a2c2e' : col, litBottom: !dead });
  }
  function dressCargoHall(plan, room, rng) {
    var K = Kit(), solids = [];
    var x0 = room.x0, x1 = room.x1, z0 = room.z0, z1 = room.z1, H = room.y1, cx = (x0 + x1) / 2;
    grime(K, rng, room, 14, '#23262a');
    for (var i = 0; i < 3; i++) for (var j = 0; j < 3; j++) {
      highBay(K, x0 + (x1 - x0) * (i + 0.5) / 3, z0 + (z1 - z0) * (j + 0.5) / 3, H, S.fixture || '#e8f0ff',
              S.dead && ((i * 3 + j) * 37 % 100) / 100 < S.dead);
    }
    /* The aisle: dashed yellow lines either side of a clear way up the
     * middle, and hazard stripes along the foot of every wall. */
    [-2.6, 2.6].forEach(function (ax) {
      for (var z = z0 + 0.3; z < z1 - 0.3; z += 1.2) {
        K.quad([[cx + ax - 0.06, 0.006, z], [cx + ax + 0.06, 0.006, z], [cx + ax + 0.06, 0.006, z + 0.7], [cx + ax - 0.06, 0.006, z + 0.7]], '#d9a521', { bias: -0.012 });
      }
    });
    ['x0', 'x1', 'z0', 'z1'].forEach(function (side) {
      var P = wallPoint(room, side), L = wallLen(room, side);
      for (var u = 0; u < L - 0.01; u += 0.6) wallPlate(K, P, u, 0, Math.min(L, u + 0.6), 0.35, 0.012, Math.floor(u / 0.6) % 2 ? '#d9a521' : '#1a1c1e', { bias: -0.015 });
    });
    /* Containers in bays down both sides, some stacked two high. */
    var CL = 6, CW = 2.44, conts = S.containers || ['#b5541f', '#2f5f8a', '#8a2a2a', '#3f6b3a', '#7a6a2a', '#5a5f66'];
    [-1, 1].forEach(function (side) {
      var xa = side < 0 ? x0 + 0.6 : x1 - 0.6 - CL, xb = xa + CL;
      for (var zz = z0 + 1.2; zz + CW < z1 - 1.0; zz += CW + 0.9) {
        if (overUse(plan, xa, zz, xb, zz + CW, 1.6) || blockedNear(plan, room, (xa + xb) / 2, zz + CW / 2, 1.6)) continue;
        if (rng.next() < 0.18) continue;
        container(K, xa, 0, zz, xb, zz + CW, rng.pick(conts));
        if (rng.next() < 0.55) container(K, xa + 0.05, 2.6, zz + 0.03, xb - 0.05, zz + CW - 0.03, rng.pick(conts));
        solids.push([xa, zz, xb, zz + CW]);
      }
    });
    /* The gantry: rails high on the long walls, a bridge across, the hoist
     * and its hook. */
    [x0 + 0.3, x1 - 0.3].forEach(function (rx) { K.box(rx - 0.25, H - 1.3, z0 + 0.3, rx + 0.25, H - 0.95, z1 - 0.3, '#5a5a3a', { under: 0.5 }); });
    var gz = z0 + (z1 - z0) * rng.range(0.35, 0.65), hx = cx + rng.range(-7, 7);
    K.box(x0 + 0.3, H - 1.6, gz - 0.35, x1 - 0.3, H - 1.1, gz + 0.35, S.trim || '#c9a227', { under: 0.5 });
    K.box(hx - 0.5, H - 2.2, gz - 0.5, hx + 0.5, H - 1.6, gz + 0.5, '#3a3f45');
    K.box(hx - 0.02, 3.4, gz - 0.02, hx + 0.02, H - 2.2, gz + 0.02, '#202326');
    K.box(hx - 0.3, 3.15, gz - 0.15, hx + 0.3, 3.4, gz + 0.15, '#d9a521');
    /* A forklift, parked at the aisle's edge. */
    var fx = cx + 3.4, fz = z0 + (z1 - z0) * 0.62;
    if (!overUse(plan, fx - 0.6, fz - 1.2, fx + 0.6, fz + 1.4, 0.8)) {
      K.box(fx - 0.55, 0.25, fz - 1.1, fx + 0.55, 1.2, fz + 0.9, '#d9a521');
      K.box(fx - 0.5, 1.2, fz - 0.9, fx + 0.5, 2.1, fz + 0.2, '#2b2f33', { top: '#1c1e20' });
      [[-0.55, -0.8], [0.55, -0.8], [-0.55, 0.6], [0.55, 0.6]].forEach(function (wv) {
        K.box(fx + wv[0] - 0.08, 0, fz + wv[1] - 0.25, fx + wv[0] + 0.08, 0.5, fz + wv[1] + 0.25, '#1a1c1e');
      });
      K.box(fx - 0.45, 0.1, fz + 0.9, fx - 0.35, 2.6, fz + 1.0, '#3a3f45');
      K.box(fx + 0.35, 0.1, fz + 0.9, fx + 0.45, 2.6, fz + 1.0, '#3a3f45');
      K.box(fx - 0.4, 0.12, fz + 1.0, fx - 0.25, 0.18, fz + 2.1, '#9aa0a6');
      K.box(fx + 0.25, 0.12, fz + 1.0, fx + 0.4, 0.18, fz + 2.1, '#9aa0a6');
      solids.push([fx - 0.6, fz - 1.2, fx + 0.6, fz + 2.1]);
    }
    /* Pallets of crates at the edges of the aisle. */
    for (var pz = z0 + 2; pz < z1 - 2; pz += 3.3) {
      [-1, 1].forEach(function (s) {
        var px = s < 0 ? cx - 4.9 : cx + 3.9;
        if (rng.next() < 0.5) return;
        if (overUse(plan, px, pz, px + 1.0, pz + 1.0, 1.0) || blockedNear(plan, room, px + 0.5, pz + 0.5, 1.2)) return;
        if (solids.some(function (b) { return b[2] > px - 0.3 && b[0] < px + 1.3 && b[3] > pz - 0.3 && b[1] < pz + 1.3; })) return;
        K.box(px - 0.05, 0, pz - 0.05, px + 1.05, 0.14, pz + 1.05, '#6b4a33');
        crateStack(K, rng, px, pz, px + 1.0, pz + 1.0, solids, 2);
      });
    }
    /* The freight office: a lit window behind its counter, FREIGHT over it. */
    plan.items.forEach(function (it) {
      if (it.kind !== 'freight' || !it.counter) return;
      var c = it.counter, P = wallPoint(room, 'x1'), uc = room.z1 - (c[1] + c[3]) / 2;
      wallPlate(K, P, uc - 2.2, 0, uc + 2.2, 3.0, 0.02, '#2b2f33', { bias: -0.02 });
      wallPlate(K, P, uc - 1.8, 1.1, uc + 1.8, 2.5, 0.03, '#2f5466', { lit: true, bias: -0.04 });
      for (var mu = uc - 1.8; mu <= uc + 1.81; mu += 1.2) wallPlate(K, P, mu - 0.04, 1.1, mu + 0.04, 2.5, 0.035, '#24282c', { bias: -0.045 });
      neonText(K, P, 'FREIGHT', uc, 3.25, 0.45, SIGN_D + 0.015, S.adOut || '#3ff0ff');
      K.box(c[0] + 0.15, 1.05, (c[1] + c[3]) / 2 - 0.3, c[0] + 0.21, 1.45, (c[1] + c[3]) / 2 + 0.3, '#24282c');
    });
    hangingSign(K, cx, z0 + 3.5, 'z', 1, '^ CONCOURSE', '', 0.36, S.adOut || '#3ff0ff', null, H);
    hangingSign(K, cx, z1 - 3.5, 'z', -1, '^ BERTHS', '', 0.36, S.adOut || '#3ff0ff', null, H);
    return { quads: K.quads, solids: solids, seats: [], noStrip: true };
  }

  /* ---- ADS (2026-10-31) ---------------------------------------------------
   * Astra: "There should be advertisements on the walls for the bar and
   * outfitters". Each ad says what and which way: the bar's name and an
   * arrow, or OUTFITTERS and an arrow to the yard counter - or, at a port
   * with no yard, AT and the name of the nearest port that has one
   * (main.js opts.outfitter). The arrow is worked out from where the ad
   * hangs: left or right along its wall, toward the place, as you face it. */
  /* Lengths of a wall clear of its doors (and a margin each side). */
  function wallSpans(plan, room, side) {
    var L = wallLen(room, side), cuts = [];
    plan.doors.forEach(function (d) {
      if (d.a !== room.id && d.b !== room.id) return;
      if (sideOfDoor(room, d) !== side) return;
      var u = doorU(room, side, d);
      cuts.push([u - d.w / 2 - 0.6, u + d.w / 2 + 0.6]);
    });
    cuts.sort(function (a, b) { return a[0] - b[0]; });
    var spans = [], at = 0.5;
    cuts.forEach(function (c) { if (c[0] > at) spans.push([at, c[0]]); at = Math.max(at, c[1]); });
    if (L - 0.5 > at) spans.push([at, L - 0.5]);
    return spans;
  }
  function fontOnly(s) {
    return String(s || '').toUpperCase().split('').filter(function (ch) { return ch === ' ' || FONT[ch]; }).join('').replace(/\s+/g, ' ').trim();
  }
  var AD_W = 3.4;
  function adBoard(K, P, uc, v0, scale, depth, which, ctx) {
    var t = ctx[which], w = AD_W * scale, h = 1.3 * scale;
    var col = which === 'bar' ? (S.adBar || '#ff3fa4') : (S.adOut || '#3ff0ff');
    /* A long name loses its THE before it loses its size. */
    var line1 = which === 'bar' ? (t.name.length > 12 ? t.name.replace(/^THE /, '') : t.name) : 'OUTFITTERS';
    var line2 = which === 'bar' ? 'DRINKS' : t.line;
    /* The arrow is big, on its own at the end of the board it points
     * off, and the words keep to the rest. */
    var dir = 0, tw = w, tc = uc;
    if (t.x !== undefined) {
      var A = P(uc, 0, 0), U = P(uc + 1, 0, 0);
      dir = (t.x - A[0]) * (U[0] - A[0]) + (t.z - A[2]) * (U[2] - A[2]) >= 0 ? 1 : -1;
      tw = w - 0.55 * scale; tc = uc - dir * 0.275 * scale;
    }
    wallPlate(K, P, uc - w / 2, v0, uc + w / 2, v0 + h, depth, '#0b0d10', { bias: -0.02 });
    if (dir) neonText(K, P, dir > 0 ? '>' : '<', uc + dir * (w / 2 - 0.3 * scale), v0 + h * 0.3, h * 0.42, depth + 0.015, col);
    var fr = shade(col, 0.55), e = 0.03;
    tube(K, P, [uc - w / 2, v0], [uc + w / 2, v0], depth + 0.01, fr, e);
    tube(K, P, [uc - w / 2, v0 + h], [uc + w / 2, v0 + h], depth + 0.01, fr, e);
    tube(K, P, [uc - w / 2, v0], [uc - w / 2, v0 + h], depth + 0.01, fr, e);
    tube(K, P, [uc + w / 2, v0], [uc + w / 2, v0 + h], depth + 0.01, fr, e);
    var h1 = Math.min(0.34 * scale, (tw - 0.3) / (line1.length * 0.95));
    var h2 = Math.min(0.22 * scale, (tw - 0.3) / (line2.length * 0.95));
    neonText(K, P, line1, tc, v0 + h * 0.5, h1, depth + 0.015, col);
    neonText(K, P, line2, tc, v0 + h * 0.14, h2, depth + 0.015, '#ffffff');
  }
  var AD_WALLS = { corridor: ['x0', 'x1'], cargohall: ['x0', 'z0', 'z1'], lport: ['z1', 'x0', 'x1'], crewhall: ['x0'], berth: ['z0', 'z1'] };
  function placeAds(K, plan, room, rng, ctx) {
    var sides = AD_WALLS[room.kind];
    if (!sides || (room.kind === 'berth' && !room.hangar) || (!ctx.bar && !ctx.outfit)) return;
    /* High where the floor is lined with stacks; proud of ribs. */
    var v0 = room.kind === 'cargohall' ? 5.7 : room.hangar ? 3.2 : 1.35;
    var scale = room.kind === 'cargohall' ? 1.35 : 1;
    var depth = room.hangar ? 0.22 : SIGN_D;
    var n = rng.int(0, 1);
    sides.forEach(function (side) {
      var P = wallPoint(room, side);
      wallSpans(plan, room, side).forEach(function (sp) {
        var len = sp[1] - sp[0], w = AD_W * scale;
        if (len < w + 0.4) return;
        var count = Math.max(1, Math.floor(len / 9));
        for (var k = 0; k < count; k++) {
          if (rng.next() < 0.3) continue;
          var which = (n++ % 2 === 0) ? 'bar' : 'outfit';
          if (!ctx[which]) which = which === 'bar' ? 'outfit' : 'bar';
          adBoard(K, P, sp[0] + len * (k + 0.5) / count, v0, scale, depth, which, ctx);
        }
      });
    });
  }

  /* ---- the faction's own marks --------------------------------------------
   * Banners in the tall rooms (Navy blue with a white chevron, Syndicate
   * black with a gold diamond), the Syndicate's gold line round every
   * room, a pirate hole's graffiti. Painted, not lit. */
  function factionDetail(K, plan, room, rng) {
    var tall = room.y1 >= 4.5;
    ['x0', 'x1', 'z0', 'z1'].forEach(function (side) {
      var P = wallPoint(room, side), spans = wallSpans(plan, room, side);
      spans.forEach(function (sp) {
        if (S.trim) wallPlate(K, P, sp[0] - 0.4, 2.2, sp[1] + 0.4, 2.26, 0.025, S.trim, { bias: -0.022 });
        if (S.banner && tall && sp[1] - sp[0] > 5 && rng.next() < 0.6) {
          var bu = sp[0] + 1.2 + rng.next() * (sp[1] - sp[0] - 2.4), top = room.y1 - 0.4, bw = 1.0, bh = Math.min(2.6, room.y1 - 3.0);
          if (bh < 1.2) return;
          wallPlate(K, P, bu - bw / 2, top - bh, bu + bw / 2, top, 0.06, S.banner.bg, { bias: -0.025 });
          var m = S.banner.fg, my = top - bh * 0.42;
          if (S.banner.mark === 'chevron') {
            tube(K, P, [bu - 0.32, my - 0.18], [bu, my + 0.12], 0.07, m, 0.09, true);
            tube(K, P, [bu, my + 0.12], [bu + 0.32, my - 0.18], 0.07, m, 0.09, true);
            tube(K, P, [bu - 0.32, my - 0.42], [bu, my - 0.12], 0.07, m, 0.09, true);
            tube(K, P, [bu, my - 0.12], [bu + 0.32, my - 0.42], 0.07, m, 0.09, true);
          } else {
            tube(K, P, [bu, my + 0.32], [bu + 0.24, my], 0.07, m, 0.07, true);
            tube(K, P, [bu + 0.24, my], [bu, my - 0.32], 0.07, m, 0.07, true);
            tube(K, P, [bu, my - 0.32], [bu - 0.24, my], 0.07, m, 0.07, true);
            tube(K, P, [bu - 0.24, my], [bu, my + 0.32], 0.07, m, 0.07, true);
          }
          wallPlate(K, P, bu - bw / 2, top - bh - 0.08, bu + bw / 2, top - bh, 0.065, m, { bias: -0.03 });
        }
        if (S.graffiti && sp[1] - sp[0] > 2 && rng.next() < 0.55) {
          var gu = sp[0] + rng.next() * (sp[1] - sp[0] - 1.5), gv = rng.range(0.5, 1.6), gc = rng.pick(NEON), nst = rng.int(3, 7);
          var at = [gu, gv];
          for (var s2 = 0; s2 < nst; s2++) {
            var nx = [at[0] + rng.range(0.1, 0.4), at[1] + rng.range(-0.35, 0.35)];
            tube(K, P, at, nx, 0.03 + s2 * 0.0005, shade(gc, 0.8), 0.06, true);
            at = nx;
          }
        }
      });
    });
  }

  var DRESSERS = { bar: dressBar, concourse: dressConcourse, crewhall: dressCrewHall, corridor: dressSpine,
                   lport: dressLPort, berth: dressBerth, cargohall: dressCargoHall };

  /* Dress every room of `plan` that has a dresser. Called by walk.js's
   * layout, after the rooms, doors and counters are placed. */
  /* Where the ads point: the bar (its room's middle, its sign's name), the
   * shipyard counter if this port has one, else the port that does. */
  function adContext(plan, opts) {
    var ctx = {};
    plan.rooms.forEach(function (r) {
      if (r.kind === 'bar' && !ctx.bar) ctx.bar = { name: fontOnly(r.adName || 'BAR').slice(0, 24).trim() || 'BAR', x: (r.x0 + r.x1) / 2, z: (r.z0 + r.z1) / 2 };
    });
    plan.items.forEach(function (it) {
      if (it.kind === 'yard' && !ctx.outfit) ctx.outfit = { line: 'SHIPYARD', x: it.x, z: it.z };
    });
    if (!ctx.outfit && opts.outfitter) {
      var nm = fontOnly(opts.outfitter).slice(0, 14).trim();
      if (nm) ctx.outfit = { line: 'AT ' + nm };
    }
    return ctx;
  }

  function apply(plan, seed, opts) {
    opts = opts || {};
    useStyle(opts.livery || plan.livery);
    plan.dress = {};
    plan.seats = plan.seats || [];
    try {
      plan.rooms.forEach(function (room) {
        var fn = DRESSERS[room.kind];
        if (!fn) return;
        var d = fn(plan, room, stream('dress|' + (seed || '') + '|' + plan.portId + '|' + room.id));
        plan.dress[room.id] = d.quads;
        if (d.noStrip) room.noStrip = true;
        if (d.name) {
          room.adName = d.name;
          room.label = d.name.charAt(0) + d.name.slice(1).toLowerCase().replace(/ (\w)/g, function (m, ch) { return ' ' + ch.toUpperCase(); });
        }
        d.solids.forEach(function (b) {
          plan.items.push({ kind: 'prop', prop: true, silent: true, counter: b, x: (b[0] + b[2]) / 2, z: (b[1] + b[3]) / 2, label: '' });
        });
        d.seats.forEach(function (s) { s.room = room.id; plan.seats.push(s); });
      });
      /* Second pass, once every room is dressed and the bar is named: the
       * ads, and the faction's own marks. Their own stream, so adding them
       * left every room's first-pass dressing exactly as it was. */
      var ctx = adContext(plan, opts);
      plan.rooms.forEach(function (room) {
        if (!plan.dress[room.id]) return;
        var K = Kit(), rng = stream('ads|' + (seed || '') + '|' + plan.portId + '|' + room.id);
        if (room.kind !== 'bar') placeAds(K, plan, room, rng, ctx);
        factionDetail(K, plan, room, rng);
        if (K.quads.length) plan.dress[room.id] = plan.dress[room.id].concat(K.quads);
      });
    } finally {
      useStyle('civ');
    }
    return plan;
  }

  var Dressing = { apply: apply, barName: barName, FONT: FONT, DRESSERS: DRESSERS, STYLES: STYLES, wallSpans: wallSpans };
  global.Dressing = Dressing;
  if (typeof module !== 'undefined' && module.exports) module.exports = Dressing;
})(typeof window !== 'undefined' ? window : globalThis);
