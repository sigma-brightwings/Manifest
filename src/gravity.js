/* gravity.js - weighing a world from the inside (2026-11-12).
 *
 * Astra: "the spectrographic scanner should map the gravity well too; please
 * model this as an XY / YZ / ZX selectable planar slice through the center of
 * the planet. Only works with the second level of multispectral scanner.
 * Regions of higher gravity would correspond to minerals that aren't
 * detectable by your level 2 scanner as well as just the planet's mass."
 * Then: "the gravimeter fitting; but we're going with 4 tiers of gravimeter,
 * and what is affected is the resolution."
 *
 * WHY THIS INSTRUMENT EXISTS. Every other survey tool reads the surface. A
 * spectrometer sees reflected light, a gamma spectrometer sees what the top
 * few metres are shouting, a deep array sees traces in the same few metres.
 * None of them can see through rock. Gravity does not care about rock: the
 * field at a point is the whole of the mass under it, however deep. So the
 * gravimeter is the only thing in the game that finds ore nobody can see -
 * and the only thing that will tell you the ore is forty kilometres down and
 * nobody is ever getting it.
 *
 * THE FIELD, HONESTLY. Inside a planet g does NOT keep rising - only the mass
 * enclosed below you pulls, so g falls to zero at the centre. With a dense
 * core it peaks at the core-mantle boundary and falls both ways (Earth's own
 * peak is about 10.7 m/s^2, down there, against 9.8 at the surface). That
 * shape is the picture, and it is the reason a slice through the middle is
 * worth looking at rather than a map of the surface.
 *
 *   Two layers, seeded per world, normalised so the profile integrates to the
 *   mass the body already has - the slice can never disagree with the orbit
 *   it is flying. With x = r/R, rc the core's radius fraction and kc its
 *   density contrast:
 *
 *       D    = kc*rc^3 + 1 - rc^3                    (so f(1) = 1)
 *       f(x) = kc*x^3 / D                            x <= rc
 *       f(x) = (kc*rc^3 + x^3 - rc^3) / D            x >  rc
 *       g(x) = mu * f(x) / (x*R)^2                   and g(0) = 0
 *
 * ANOMALIES. A dense body is excess mass over the mantle it sits in, pulling
 * toward itself: dg = G*dm / s^2, softened inside its own radius so the
 * middle of a lump is not a pole. Its excess as a fraction of the world's
 * mass is w * rad^3 / D, which lands a big ore body at a few percent of
 * surface gravity right over it - small, local, and exactly what a surveyor
 * on this planet looks for.
 *
 * WHAT THE TIER BUYS. Resolution, not range. Every tier sees the same world;
 * a coarse one smears it. Grade 1 tells you a hemisphere is heavy. Grade 4
 * separates two bodies lying together and reads one that is dense for its
 * size, which is the signature of the rare metals.
 *
 * SEED DATA, DRAWING NOTHING. Hashes of star, body and purpose, like the rest
 * of survey.js. Asking a world its field touches no rng, so generation is
 * byte-identical whether or not anybody ever fits a gravimeter. */
(function (global) {
  'use strict';

  var Survey = null, V = null;
  function deps() {
    if (!Survey) Survey = global.Survey;
    if (!V) V = global.V;
    return !!Survey;
  }

  /* ---- WHAT EACH TIER CAN RESOLVE ---------------------------------------
   *   n     samples across the diameter - the picture's own grain;
   *   blur  how far a reading is smeared, in radius fractions. This is the
   *         instrument's resolving length: two bodies closer than about
   *         this come apart only on a finer rung;
   *   mgal  the faintest anomaly it reports at all, in MILLIGALS: an
   *         absolute sensitivity, so a tier means the same thing over a
   *         moon and over a world nine thousand kilometres across. A coarse
   *         rung simply misses the faint ones rather than showing them
   *         badly;
   *   depth null nothing, 'band' names shallow/mid/deep, 'exact' gives the
   *         figure;
   *   dense true reads mass against volume, so a body denser than its size
   *         warrants is flagged - the rare-metal tell. */
  var MGAL = 1e5;                    // m/s^2 -> mGal
  /* THRESHOLDS MEASURED, NOT GUESSED. 2,107 mass sources over 403 worlds of
   * the kawartha seed (Claude outputs/fit-mgal.cjs, 2026-11-12): the
   * anomaly a source puts at the surface above it runs p05 24, p25 155,
   * median 294, p75 489, p95 895 mGal. World size barely enters it, which
   * is the point of an absolute scale - a small moon reads median 288, a
   * world past 6,000 km reads 227.
   *
   * The rungs are set at quartiles of that spread, so each one roughly
   * doubles what you can see. What it buys you where it matters: of the
   * deep-band bodies - the ones no spectrometer will ever name - a grade 1
   * finds almost none and a grade 4 finds most. That is the 58,000 cr. */
  var RES = {
    1: { n: 24, blur: 0.200, mgal: 450, depth: null,    dense: false },
    2: { n: 40, blur: 0.110, mgal: 220, depth: 'band',  dense: false },
    3: { n: 64, blur: 0.055, mgal: 70,  depth: 'exact', dense: false },
    4: { n: 96, blur: 0.030, mgal: 12,  depth: 'exact', dense: true }
  };
  var PLANES = ['xy', 'yz', 'zx'];
  var PLANE_NAME = { xy: 'XY - equatorial', yz: 'YZ - through the poles', zx: 'ZX - through the poles' };
  /* The two axes each plane is drawn in, and the one it throws away. */
  var PLANE_AXES = { xy: [0, 1, 2], yz: [1, 2, 0], zx: [2, 0, 1] };

  var PROFILE_CACHE = new WeakMap();

  function h01(tag) { return Survey.hash01(tag); }

  function tagOf(body, sys) {
    var star = sys && sys.star ? sys.star.id : (sys && sys.root && sys.root.id) || '';
    return (sys && (sys.seedTag || sys.name) || star) + '|' + (body ? body.id : '') + '|';
  }

  function muOf(body) {
    if (!body) return 0;
    if (body.mu !== undefined && body.mu > 0) return body.mu;
    var G = V && V.G ? V.G : 6.674e-20;        // km^3 / (kg s^2)
    return G * (body.mass || 0);
  }

  /* The world's own two-layer profile. Cached on the body. */
  function profileOf(body, sys) {
    if (!deps() || !body) return null;
    if (body.kind !== 'planet' && body.kind !== 'moon') return null;
    var hit = PROFILE_CACHE.get(body);
    if (hit) return hit;
    var tag = tagOf(body, sys) + 'grav:';
    /* A rocky world differentiates harder than an ice one, and a molten one
     * is still doing it. Nothing here is free to contradict the body's mass:
     * rc and kc only say how that mass is ARRANGED. */
    var t = (body.ptype || body.type || '') + '';
    var ironish = /molten|metal|rock|terr|desert|ocean/i.test(t);
    /* Bracketing Earth rather than sitting under it: rc 0.42-0.62 and kc
     * 2.1-3.5 on a rocky world, less on an undifferentiated ball of ice. */
    var rc = 0.38 + 0.18 * h01(tag + 'rc') + (ironish ? 0.06 : 0);
    var kc = 1.90 + 1.25 * h01(tag + 'kc') + (ironish ? 0.35 : 0);
    var rc3 = rc * rc * rc;
    var D = kc * rc3 + 1 - rc3;
    var out = { rc: rc, kc: kc, D: D, R: body.radius || 1, mu: muOf(body),
                gSurf: (body.radius > 0 ? muOf(body) / (body.radius * body.radius) : 0) * 1000 };
    PROFILE_CACHE.set(body, out);
    return out;
  }

  /* Fraction of the world's mass inside radius fraction x. */
  function massFrac(p, x) {
    if (!(x > 0)) return 0;
    if (x >= 1) return 1;
    var x3 = x * x * x, rc3 = p.rc * p.rc * p.rc;
    return (x <= p.rc ? p.kc * x3 : p.kc * rc3 + x3 - rc3) / p.D;
  }

  /* The smooth field, m/s^2, at radius fraction x. g(0) = 0. */
  function gSmooth(p, x) {
    if (!(x > 1e-6)) return 0;
    var r = x * p.R;
    return (p.mu * massFrac(p, x) / (r * r)) * 1000;
  }

  /* Where the smooth field peaks, and how hard - the core-mantle boundary on
   * a differentiated world, the surface on an even one. */
  function peakOf(p) {
    var bx = 1, bg = gSmooth(p, 1);
    for (var i = 1; i <= 64; i++) {
      var x = i / 64, g = gSmooth(p, x);
      if (g > bg) { bg = g; bx = x; }
    }
    return { x: bx, g: bg };
  }

  /* ---- EVERY MASS THE INSTRUMENT COULD SEE -------------------------------
   * The provinces that outcrop (so a spectrometer can also see them) and the
   * buried bodies that nothing else can. One list, each marked with what it
   * is and whether the player's own survey kit already explains it. */
  function sourcesOf(body, sys) {
    if (!deps()) return [];
    var m = Survey.groundMap(body, sys);
    if (!m) return [];
    var out = [];
    (m.provinces || []).forEach(function (pr, i) {
      out.push({ id: 'prov' + i, kind: 'province', c: pr.c, d: pr.d, band: pr.band,
                 reach: pr.reach, radKm: pr.radKm, zKm: pr.zKm, cover: pr.cover,
                 w: 0.55 * pr.w, share: pr.share, surface: true });
    });
    (m.hotspots || []).forEach(function (h, i) {
      out.push({ id: 'hot' + i, kind: 'fissile', c: h.c, d: h.d, band: h.band,
                 reach: h.reach, radKm: h.radKm, zKm: h.zKm, cover: h.cover,
                 w: 0.30 * h.w, share: 0, surface: true });
    });
    (m.deep || []).forEach(function (b, i) {
      out.push({ id: 'deep' + i, kind: 'buried', c: b.c, d: b.d, band: b.band,
                 reach: b.reach, radKm: b.radKm, zKm: b.zKm, cover: b.cover,
                 w: b.w, share: b.share, surface: false });
    });
    return out;
  }

  /* Excess mass as a fraction of the world's, and the body's centre in km.
   * A lump of radius a and density excess w*rho_mantle massing
   *     dm/M = w * (a/R)^3 / D
   * because rho_mantle/rho_mean is exactly 1/D. */
  function prep(p, src) {
    var a = src.radKm / p.R;
    var dm = src.w * a * a * a / p.D;
    var r = p.R - src.zKm;                       // centre's distance from the middle
    if (r < 0) r = 0;
    return { src: src, dm: dm, rad: src.radKm, z: src.zKm,
             pos: [src.c[0] * r, src.c[1] * r, src.c[2] * r] };
  }

  /* What the instrument reads over it, from outside: the anomaly at the
   * surface directly above, in mGal. This is the whole of why depth costs
   * you - it falls off as 1/z^2 and nothing recovers it. */
  function surfaceSignal(p, b) {
    var z = Math.max(b.z, b.rad);
    return (p.mu * b.dm / (z * z)) * 1000 * MGAL;
  }

  /* The anomaly a prepared body adds at a point, m/s^2 (always positive:
   * excess mass pulls, and what a map wants is the magnitude). */
  function anomAt(p, b, q) {
    var dx = q[0] - b.pos[0], dy = q[1] - b.pos[1], dz = q[2] - b.pos[2];
    var s2 = dx * dx + dy * dy + dz * dz, soft = b.rad * b.rad;
    if (s2 < soft) s2 = soft;
    return (p.mu * b.dm / s2) * 1000;
  }

  /* ---- THE SLICE ---------------------------------------------------------
   * A square n x n grid over [-R, R] on one principal plane through the
   * centre, in the world's own fixed frame - a geological map does not spin.
   * Cells outside the sphere are left NaN so the caller can draw the limb.
   *
   *   g      total field, m/s^2
   *   anom   the part that is not the smooth profile - the ore signal
   *   lvl    the tier reading it; blurs the anomaly to that resolution
   */
  function slice(body, sys, plane, lvl) {
    if (!deps()) return null;
    var p = profileOf(body, sys);
    if (!p) return null;
    var res = RES[Math.max(1, Math.min(4, lvl || 1))];
    var ax = PLANE_AXES[plane] || PLANE_AXES.xy;
    var n = res.n, R = p.R;
    var g = new Float64Array(n * n), an = new Float64Array(n * n);
    for (var i = 0; i < n * n; i++) { g[i] = NaN; an[i] = NaN; }

    var bodies = sourcesOf(body, sys).map(function (s) { return prep(p, s); });
    /* Smearing is done on the field, not on the sources: that is what a real
     * instrument does to a real world, and it means two bodies merge exactly
     * when the resolving length says they should. A Gaussian of sigma
     * blur*R, as a separable pass over the grid. */
    var cell = 2 * R / n;
    var sigma = res.blur * R / cell;             // in cells
    var anMax = 0;

    for (var iy = 0; iy < n; iy++) {
      for (var ix = 0; ix < n; ix++) {
        var u = (ix + 0.5) / n * 2 - 1, v = (iy + 0.5) / n * 2 - 1;
        var rr = Math.sqrt(u * u + v * v);
        if (rr > 1) continue;                     // outside the world
        var q = [0, 0, 0];
        q[ax[0]] = u * R; q[ax[1]] = v * R; q[ax[2]] = 0;
        var k = iy * n + ix;
        var gs = gSmooth(p, rr);
        var a = 0;
        for (var b = 0; b < bodies.length; b++) a += anomAt(p, bodies[b], q);
        g[k] = gs; an[k] = a;
        if (a > anMax) anMax = a;
      }
    }
    if (sigma > 0.4) blur2(an, n, sigma);
    /* The total the instrument actually shows is the smooth well plus what
     * it could resolve of the anomaly. */
    var gMax = 0, gMin = Infinity;
    for (var t = 0; t < n * n; t++) {
      if (isNaN(g[t])) continue;
      g[t] += an[t];
      if (g[t] > gMax) gMax = g[t];
      if (g[t] < gMin) gMin = g[t];
    }

    return { plane: plane, planeName: PLANE_NAME[plane] || plane, n: n, R: R,
             axes: ax, g: g, anom: an, gMax: gMax, gMin: gMin === Infinity ? 0 : gMin,
             anomMax: anMax, lvl: lvl, res: res, gSurf: p.gSurf, peak: peakOf(p),
             core: p.rc };
  }

  /* Separable Gaussian, NaN-aware: the limb must not bleed into the disc. */
  function blur2(a, n, sigma) {
    var rad = Math.max(1, Math.ceil(sigma * 2.5));
    var k = new Float64Array(2 * rad + 1), sum = 0;
    for (var i = -rad; i <= rad; i++) {
      var w = Math.exp(-(i * i) / (2 * sigma * sigma));
      k[i + rad] = w; sum += w;
    }
    for (i = 0; i < k.length; i++) k[i] /= sum;
    var tmp = new Float64Array(n * n);
    /* `rows` true: smear along x within each row. False: along y. */
    var pass = function (src, dst, rows) {
      for (var o = 0; o < n; o++) {
        for (var j = 0; j < n; j++) {
          var at = rows ? o * n + j : j * n + o;
          if (isNaN(src[at])) { dst[at] = NaN; continue; }
          var acc = 0, wsum = 0;
          for (var m = -rad; m <= rad; m++) {
            var jj = j + m;
            if (jj < 0 || jj >= n) continue;
            var ai = rows ? o * n + jj : jj * n + o;
            if (isNaN(src[ai])) continue;
            acc += src[ai] * k[m + rad]; wsum += k[m + rad];
          }
          dst[at] = wsum > 0 ? acc / wsum : src[at];
        }
      }
    };
    pass(a, tmp, true);
    pass(tmp, a, false);
  }

  /* ---- WHAT THE PAGE LISTS ----------------------------------------------
   * The bodies this tier can actually pick out, strongest first. Ones lying
   * closer together than the resolving length are reported as one contact,
   * because that is all the instrument can honestly say. `explained` is true
   * when the survey kit aboard already accounts for the mass - so an
   * UNEXPLAINED contact is the interesting one: something heavy that no
   * spectrometer you own can name. */
  function contacts(body, sys, lvl, surveyLvl) {
    if (!deps()) return [];
    var p = profileOf(body, sys);
    if (!p) return [];
    var res = RES[Math.max(1, Math.min(4, lvl || 1))];
    var srcs = sourcesOf(body, sys).map(function (s) { return prep(p, s); });
    if (!srcs.length) return [];
    /* What it reads from above: depth is the enemy, as it should be. */
    srcs.forEach(function (b) { b.sig = surfaceSignal(p, b); });
    var top = 0;
    srcs.forEach(function (b) { if (b.sig > top) top = b.sig; });
    var seen = srcs.filter(function (b) { return b.sig >= res.mgal; })
                   .sort(function (a, b) { return b.sig - a.sig; });
    /* Merge what it cannot separate. */
    var sep = res.blur * p.R, out = [];
    seen.forEach(function (b) {
      for (var i = 0; i < out.length; i++) {
        var o = out[i];
        var dx = o.pos[0] - b.pos[0], dy = o.pos[1] - b.pos[1], dz = o.pos[2] - b.pos[2];
        if (Math.sqrt(dx * dx + dy * dy + dz * dz) < sep) { o.merged++; return; }
      }
      out.push({ pos: b.pos, src: b.src, sig: b.sig, merged: 1, dm: b.dm, rad: b.rad });
    });
    var sl = surveyLvl || 0;
    return out.map(function (o) {
      var s = o.src;
      /* Can anything else aboard see this? Only if it outcrops AND the kit
       * reads its class: ores at grade 1, fissiles at 2, the rare metals at
       * 3. A buried body is never explained, at any grade. */
      var cls = s.kind === 'fissile' ? 2 : (s.share > 0.5 ? 3 : 1);
      var explained = !!s.surface && sl >= cls;
      return {
        id: s.id, kind: s.kind, band: s.band, reach: s.reach,
        lat: Math.asin(Math.max(-1, Math.min(1, s.c[2]))),
        lon: Math.atan2(s.c[1], s.c[0]),
        /* Depth is what the tier can tell you about it. 'cover' is what a
         * drill would have to get through; zKm is to the body's centre. */
        depth: res.depth === 'exact' ? s.d : null,
        depthKm: res.depth === 'exact' ? Math.round(s.cover * 10) / 10 : null,
        radKm: res.depth === 'exact' ? Math.round(s.radKm) : null,
        depthBand: res.depth ? s.band : null,
        merged: o.merged, strength: top > 0 ? o.sig / top : 0, mgal: o.sig,
        /* Mass against volume. Flagged only by the rung that can read it. */
        dense: res.dense ? s.share > 0.55 : null,
        explained: explained
      };
    });
  }

  /* One line for a contact, written from what the tier knows and no more. */
  function describe(c) {
    var where = (c.lat >= 0 ? 'N' : 'S') + Math.round(Math.abs(c.lat) * 180 / Math.PI) +
                ' ' + (c.lon >= 0 ? 'E' : 'W') + Math.round(Math.abs(c.lon) * 180 / Math.PI);
    var bits = [];
    bits.push((c.mgal >= 10 ? Math.round(c.mgal) : c.mgal.toFixed(1)) + ' mGal');
    if (c.merged > 1) bits.push(c.merged + ' sources, unresolved');
    if (c.depthKm != null) bits.push(c.depthKm + ' km down, ' + c.radKm + ' km across');
    else if (c.depthBand) bits.push(c.depthBand === 'shallow' ? 'near the surface'
                                  : c.depthBand === 'mid' ? 'deep' : 'very deep');
    if (c.dense) bits.push('dense for its size');
    if (!c.explained) bits.push('unexplained');
    return where + (bits.length ? ' - ' + bits.join(', ') : '');
  }

  /* How far a contact lies off the plane being looked at, in radius
   * fractions: the display dims what the slice is not really cutting. */
  function offPlane(c, plane) {
    var ax = PLANE_AXES[plane] || PLANE_AXES.xy;
    var v = [Math.cos(c.lat) * Math.cos(c.lon), Math.cos(c.lat) * Math.sin(c.lon), Math.sin(c.lat)];
    return Math.abs(v[ax[2]]);
  }

  var Gravity = {
    MGAL: MGAL, RES: RES, PLANES: PLANES, PLANE_NAME: PLANE_NAME, PLANE_AXES: PLANE_AXES,
    profileOf: profileOf, massFrac: massFrac, gSmooth: gSmooth, peakOf: peakOf,
    sourcesOf: sourcesOf, slice: slice, contacts: contacts, describe: describe,
    surfaceSignal: surfaceSignal, offPlane: offPlane, muOf: muOf
  };
  global.Gravity = Gravity;
  if (typeof module !== 'undefined' && module.exports) module.exports = Gravity;
})(typeof window !== 'undefined' ? window : globalThis);
