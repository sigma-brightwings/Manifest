/* logo.js — the Manifest wordmark and the compass rose.
 *
 * TWO PIECES OF ARTWORK, both as geometry rather than as pictures, for the
 * same reason everything else in this game is geometry: they have to be
 * right at any size, on a 1366x768 rugged laptop and on a 4K monitor, and
 * a PNG is right at exactly one.
 *
 * THE WORDMARK IS AN OUTLINE, NOT A FONT. It is "MANIFEST" set in Aldrich
 * (Matthew Desmond, SIL Open Font License), all capitals, tracked 0.10 em -
 * chosen 23 November 2026 from a sheet of sci-fi faces, as a squared,
 * stencilled, hull-lettering look. Astra's call, and explicitly provisional:
 * "we'll keep this ultimately undecided until a later date". Before it the
 * mark was Uncial Antiqua (21 October 2026, for an epic voyage, but its t
 * read as a c), and before that the Segoe Script of Astra's original card;
 * both outlines are in git history. Converted by "Claude outputs/
 * wordmark.cjs" and pasted in below - to try another face, run that on its
 * font file and paste over MARK_W and MARK; nothing else here changes.
 * That is what a logotype IS: a drawing of some letters, not a request for
 * a typeface at run time. As outlines it is identical everywhere, needs no
 * font file shipped, and scales without a soft edge.
 *
 * Coordinates are in a box MARK_W wide by 1000 tall, y down, origin at the
 * top left of the ink — so a caller asks for a width and gets a height of
 * width / MARK_ASPECT for free.
 *
 * Each subpath below is a flat run of numbers: two to start (the moveTo),
 * then an opcode and its coordinates — 1 followed by two numbers is a line,
 * 3 followed by six is a cubic. Filled even-odd, which is what puts the
 * hole in the A.
 */
(function (global) {
  'use strict';

  var MARK_W = 8488, MARK_H = 1000;

  var MARK = [
    [559,1000,1,516,1000,1,143,267,1,143,1000,1,0,1000,1,0,0,1,156,0,1,537,
     753,1,918,0,1,1074,0,1,1074,1000,1,932,1000,1,932,267],
    [1774,0,1,1917,0,1,2303,1000,1,2160,1000,1,2071,770,1,1620,770,1,1531,
     1000,1,1388,1000],
    [1846,186,1,1674,627,1,2016,627],
    [2760,225,1,2760,1000,1,2617,1000,1,2617,0,1,2760,0,1,3361,775,1,3361,0,
     1,3504,0,1,3504,1000,1,3361,1000],
    [3903,0,1,4046,0,1,4046,1000,1,3903,1000],
    [4446,1000,1,4446,0,1,5174,0,1,5174,143,1,4589,143,1,4589,429,1,5089,
     429,1,5089,572,1,4589,572,1,4589,1000],
    [5517,1000,1,5517,0,1,6245,0,1,6245,143,1,5660,143,1,5660,429,1,6160,
     429,1,6160,572,1,5660,572,1,5660,857,1,6245,857,1,6245,1000],
    [7231,572,1,6745,572,3,6726,572,6707,568,6690,560,3,6672,553,6657,542,
     6644,530,3,6631,517,6621,502,6614,484,3,6606,467,6602,448,6602,429,1,
     6602,429,1,6602,143,3,6602,123,6606,105,6614,88,3,6621,70,6631,55,6644,
     42,3,6657,29,6672,19,6690,12,3,6707,4,6726,0,6745,0,1,6745,0,1,7231,0,
     3,7250,0,7269,4,7286,12,3,7304,19,7319,29,7332,42,3,7345,55,7355,70,
     7362,88,3,7370,105,7374,123,7374,143,1,7374,143,1,7374,272,1,7231,272,
     1,7231,143,1,6745,143,1,6745,429,1,7231,429,3,7250,429,7269,433,7286,
     440,3,7304,447,7319,458,7332,471,3,7345,484,7355,499,7362,516,3,7370,
     534,7374,552,7374,572,1,7374,572,1,7374,857,3,7374,877,7370,895,7362,
     912,3,7355,930,7345,945,7332,958,3,7319,971,7304,981,7286,989,3,7269,
     996,7250,1000,7231,1000,1,7231,1000,1,6731,1000,3,6712,1000,6693,996,
     6676,989,3,6659,981,6643,971,6630,958,3,6617,945,6607,930,6600,912,3,
     6592,895,6588,877,6588,857,1,6588,857,1,6588,729,1,6731,729,1,6731,857,
     1,7231,857],
    [7688,143,1,7688,0,1,8488,0,1,8488,143,1,8159,143,1,8159,1000,1,8016,
     1000,1,8016,143]
  ];

  /* Lay the wordmark into the context's current path, scaled to `width` and
   * centred on (cx, cy). Left as a path rather than painted so the caller
   * can stroke it, fill it, shadow it, or do all three over one path —
   * which is exactly what the title screen does. */
  function markPath(ctx, cx, cy, width) {
    var s = width / MARK_W;
    var ox = cx - width / 2, oy = cy - (MARK_H * s) / 2;
    ctx.beginPath();
    for (var i = 0; i < MARK.length; i++) {
      var a = MARK[i], j = 2;
      ctx.moveTo(ox + a[0] * s, oy + a[1] * s);
      while (j < a.length) {
        if (a[j] === 1) {
          ctx.lineTo(ox + a[j + 1] * s, oy + a[j + 2] * s);
          j += 3;
        } else {
          ctx.bezierCurveTo(ox + a[j + 1] * s, oy + a[j + 2] * s,
                            ox + a[j + 3] * s, oy + a[j + 4] * s,
                            ox + a[j + 5] * s, oy + a[j + 6] * s);
          j += 7;
        }
      }
      ctx.closePath();
    }
  }

  /* The card's palette, named once. */
  var INK = {
    navy:    '#232973',      // the field
    gold:    '#ffc90e',      // the four long points
    steel:   '#7092be',      // the four short ones
    pale:    '#c3c3c3',      // the lit facet of every point
    edge:    '#4f4f4f',      // the line around everything
    letter:  '#ffffff',
    halo:    '#373c7d'       // the blue rim on the letters, from the card
  };

  /* ---- the rose ----------------------------------------------------------
   *
   * Eight points, each a kite from the centre: tip at `len` along its own
   * bearing, and two shoulders at `waist` along the bearings 45 degrees
   * either side — so every point's shoulders ARE its neighbours' shoulders
   * and the whole rose closes into one sixteen-sided outline with no seams
   * to line up.
   *
   * Each kite is then split down its own axis into two facets, and this is
   * the part that makes it read as a compass rose rather than as a star:
   * the facet on the CLOCKWISE side of every point is pale and the one on
   * the counter-clockwise side is coloured, all the way round, the same
   * sense for all eight. Not lighting — a pinwheel. Shading it as if lit
   * from one direction gives a lumpy object; shading it as a pinwheel gives
   * the emblem. Measured off Astra's card, which does exactly this.
   */
  var ROSE_WAIST = 0.135;          // hub radius, as a fraction of the long points
  var ROSE_SHORT = 0.60;           // how long the intercardinal points are

  function rosePoints(cx, cy, r) {
    var out = [];
    for (var i = 0; i < 8; i++) {
      var th = i * Math.PI / 4;                       // 0 = up, clockwise
      var len = (i % 2 === 0) ? r : r * ROSE_SHORT;
      out.push({
        cardinal: i % 2 === 0,
        tip: { x: cx + Math.sin(th) * len, y: cy - Math.cos(th) * len },
        cw:  shoulder(cx, cy, th + Math.PI / 4, r * ROSE_WAIST),
        ccw: shoulder(cx, cy, th - Math.PI / 4, r * ROSE_WAIST)
      });
    }
    return out;
  }
  function shoulder(cx, cy, th, d) {
    return { x: cx + Math.sin(th) * d, y: cy - Math.cos(th) * d };
  }

  /* `glow` is what makes a FAINT rose possible without it going muddy.
   *
   * Ordinary alpha mixes toward the backdrop, and the backdrop here is a
   * saturated navy — so gold at a third opacity is not pale gold, it is
   * brown, and the emblem reads as a stain rather than as something
   * behind the title. Added instead of mixed, the same gold lands warm and
   * luminous and the whole rose reads as light coming through the card.
   * The edges go light rather than dark for the same reason, which turns
   * the outline into the seam between facets instead of a black line drawn
   * on top of them. */
  /* Added light is not mixed paint, so the three inks need different
   * weights to come out looking like the card. Gold is dark for its
   * chroma — adding it at the same strength as the near-white pale facet
   * buries it, and the rose comes out blue with tan bits. These three
   * numbers are the whole of the tuning, and they are what makes a faint
   * rose still read as gold-and-silver. */
  var GLOW_W = { pale: 0.72, gold: 1.45, steel: 0.70 };

  function drawRose(ctx, cx, cy, r, alpha, glow) {
    var pts = rosePoints(cx, cy, r);
    var a = (alpha === undefined) ? 1 : alpha;
    ctx.save();
    if (glow) ctx.globalCompositeOperation = 'lighter';
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(1, r * 0.010);
    ctx.strokeStyle = glow ? 'rgba(150,175,225,0.5)' : INK.edge;
    function weight(key) {
      ctx.globalAlpha = glow ? Math.min(1, a * GLOW_W[key]) : a;
    }
    for (var i = 0; i < pts.length; i++) {
      var p = pts[i];
      weight('pale');
      facet(ctx, cx, cy, p.cw, p.tip, INK.pale);
      weight(p.cardinal ? 'gold' : 'steel');
      facet(ctx, cx, cy, p.ccw, p.tip, p.cardinal ? INK.gold : INK.steel);
    }
    ctx.restore();
  }

  function facet(ctx, cx, cy, a, tip, fill) {
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(a.x, a.y);
    ctx.lineTo(tip.x, tip.y);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.stroke();
  }

  /* ---- the title card, shared by the boot card and the title screen -----
   *
   * Both screens draw the same sky and the same lockup from here, so the
   * boot card in index.html is the title card's first frame and the hand
   * over between them is a crossfade between two identical pictures.
   *
   * THE SKY. Deep space rather than the card's navy, so the rose reads as
   * a star to steer by and the screen reads as a space game before a word
   * of it is read. A fixed field from a constant seed, kept as fractions of
   * the screen so a resize moves the stars rather than reshuffling them. */
  var SKY_TOP = '#0b0f2c', SKY_EDGE = '#020309';
  var skyStars = null;
  function stars() {
    if (skyStars) return skyStars;
    var s = 0x6d616e69;                         // "mani"
    function r() { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }
    skyStars = [];
    for (var i = 0; i < 760; i++) {
      var c = r();
      skyStars.push({ x: r(), y: r(), r: 0.4 + r() * r() * 1.9, a: 0.12 + r() * 0.55,
                      col: c < 0.10 ? '#ffe2b0' : c < 0.28 ? '#b8c8ff' : '#dbe6ff',
                      ph: r() * Math.PI * 2, sp: 0.25 + r() * 0.6 });
    }
    return skyStars;
  }
  /* `now` in seconds twinkles it; leave it out for a still field. */
  function drawSky(ctx, w, h, now) {
    ctx.save();
    var g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.7);
    g.addColorStop(0, SKY_TOP);
    g.addColorStop(1, SKY_EDGE);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    var list = stars();
    for (var i = 0; i < list.length; i++) {
      var st = list[i];
      ctx.globalAlpha = st.a * (now === undefined ? 0.85 : 0.62 + 0.38 * Math.sin(now * st.sp + st.ph));
      ctx.fillStyle = st.col;
      ctx.beginPath();
      ctx.arc(st.x * w, st.y * h, st.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  /* THE LAYOUT. Wide screens put the lockup — wordmark over the rose, with
   * the tagline under it — in a column of its own on the left, and leave
   * the right for the menu and the captain's story under it, each in a box
   * menuW wide. Narrow or short screens stack it: a smaller lockup on top,
   * the menu centred under it, and no story, because there is no room for
   * one that would not crowd the menu. The lockup does not depend on the
   * menu's height, so the boot card can place it before the menu exists. */
  var ROSE_GLOW = 0.62;             // added light on black wants more than the navy did
  function layout(w, h, menuW) {
    var wide = w >= 1000 && h >= 560;
    var L = { wide: wide };
    if (wide) {
      L.menuX = Math.round(Math.max(w * 0.70 - menuW / 2, w * 0.5 + 16));
      L.cx = Math.round(L.menuX / 2);
      L.markW = Math.min(w * 0.36, (L.menuX - 48) * 0.92, 700);
      L.markH = L.markW / (MARK_W / MARK_H);
      L.roseR = Math.max(60, Math.min(L.markW * 0.42, (h * 0.80 - L.markH - 110) / 2));
      var block = L.markH + 24 + L.roseR * 2 + 64;
      L.markCy = Math.round((h - block) / 2 + L.markH / 2);
      L.roseCy = Math.round(L.markCy + L.markH / 2 + 24 + L.roseR);
      L.lineY = Math.round(L.roseCy + L.roseR + 30);
    } else {
      L.cx = Math.round(w / 2);
      L.markW = Math.min(w * 0.62, 520);
      L.markH = L.markW / (MARK_W / MARK_H);
      L.roseR = Math.max(40, Math.min(w * 0.16, h * 0.13));
      L.markCy = Math.round(20 + L.markH / 2);
      L.roseCy = Math.round(L.markCy + L.markH / 2 + 12 + L.roseR);
      L.lineY = Math.round(L.roseCy + L.roseR + 24);
      L.menuX = Math.round((w - menuW) / 2);
    }
    return L;
  }

  /* Wordmark over rose, in the three passes the card always used: a shadow
   * to lift the letters off the sky, the blue halo, then the letters. */
  function drawLockup(ctx, L, aRose, aMark) {
    if (aRose > 0) drawRose(ctx, L.cx, L.roseCy, L.roseR, ROSE_GLOW * aRose, true);
    if (!(aMark > 0)) return;
    ctx.save();
    ctx.globalAlpha = aMark;
    markPath(ctx, L.cx, L.markCy, L.markW);
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.9)';
    ctx.shadowBlur = Math.max(6, L.markH * 0.13);
    ctx.shadowOffsetY = Math.max(2, L.markH * 0.035);
    ctx.fillStyle = INK.letter;
    ctx.fill('evenodd');
    ctx.restore();
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(1.5, L.markH * 0.035);
    ctx.strokeStyle = INK.halo;
    ctx.stroke();
    ctx.fillStyle = INK.letter;
    ctx.fill('evenodd');
    ctx.restore();
  }

  var Logo = {
    MARK_W: MARK_W, MARK_H: MARK_H, MARK_ASPECT: MARK_W / MARK_H,
    INK: INK,
    markPath: markPath,
    drawRose: drawRose,
    rosePoints: rosePoints,
    drawSky: drawSky,
    layout: layout,
    drawLockup: drawLockup
  };

  global.Logo = Logo;
  if (typeof module !== 'undefined' && module.exports) module.exports = Logo;
})(typeof window !== 'undefined' ? window : globalThis);
