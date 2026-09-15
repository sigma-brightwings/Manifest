/* render.js — hand-rolled 3D projection onto a 2D canvas.
 *
 * No engine, no WebGL yet. A space system is mostly points, ellipses and
 * shaded discs, and canvas draws those beautifully. Writing the projection
 * ourselves also means the camera speaks the same units as the physics, so
 * there is never a hidden transform to mistrust.
 *
 * The hard problem here is not 3D, it is SCALE: a station is 2 km across and
 * its system is 6 billion km wide, a ratio of a billion to one. We solve it
 * the way every space game does — bodies below a couple of pixels are drawn
 * as markers rather than to scale, so nothing you need to see disappears.
 */
(function (global) {
  'use strict';

  var V = global.V, K = global.Kepler, RNG = global.RNG;
  var DEG = Math.PI / 180;

  function Camera() {
    this.target = V.zero();
    this.dist = 3e8;
    this.yaw = 0.6;
    this.pitch = 0.45;      // radians above the ecliptic
    this.fov = 55 * DEG;
    this.near = 1e-4;
  }

  /* THE NEAREST AIM THAT KEEPS THE EYE OFF THE FLOOR.
   *
   * An orbit camera puts its eye at target + d*dist with
   * d = (cos p cos y, cos p sin y, sin p). Its height above a floor whose
   * normal is `up`, measured from a target sitting `above` over that floor
   * and in the same units, is
   *
   *     above + dist * dot(d, up)
   *
   * and dot(d, up) = a cos p + b sin p for a = up.x cos y + up.y sin y,
   * b = up.z — which is R cos(p - phi), R = hypot(a, b), phi = atan2(b, a).
   * So the pitches that clear the floor are a single arc centred on phi,
   * the direction that climbs fastest, and clamping is moving to its
   * nearer edge. Closed form: no search, no threshold, and it lets go
   * entirely the moment the geometry allows it.
   *
   * Returns the pitch unchanged when it already clears. `above` must be at
   * least `margin` — the caller owns that, because "the target is itself
   * under the floor" is a different question with a different answer. */
  function pitchAboveFloor(yaw, pitch, dist, up, above, margin) {
    if (!(dist > 0) || !up) return pitch;
    var a = up.x * Math.cos(yaw) + up.y * Math.sin(yaw);
    var b = up.z;
    var R = Math.sqrt(a * a + b * b);
    if (!(R > 1e-9)) return pitch;
    var phi = Math.atan2(b, a);
    var need = (margin - above) / (dist * R);
    var half = Math.acos(Math.max(-1, Math.min(1, need)));
    var off = pitch - phi;
    while (off > Math.PI) off -= 2 * Math.PI;
    while (off < -Math.PI) off += 2 * Math.PI;
    if (Math.abs(off) <= half) return pitch;
    return phi + (off > 0 ? half : -half);
  }

  Camera.prototype.build = function (w, h) {
    var cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    var cy = Math.cos(this.yaw), sy = Math.sin(this.yaw);
    var d = { x: cp * cy, y: cp * sy, z: sp };     // target -> eye
    this.eye = V.addScaled(this.target, d, this.dist);
    this.f = V.scale(d, -1);                        // eye -> target
    /* The right vector comes straight from the yaw, not from a cross
     * product with world up.
     *
     * That cross product is what used to stop the camera going over the
     * top of the ship: it degenerates at the poles, and past 90° of pitch
     * it silently reverses, so the picture flips. Taking `r` from the yaw
     * alone makes it continuous everywhere — it is horizontal by
     * construction, never zero, and never changes sign — so pitch can run
     * all the way round and the view rolls over the top the way a camera
     * on a boom actually would. There is no pole to avoid any more.
     *
     * Below 90° this is exactly the vector the old code produced, so
     * nothing about the ordinary view changes. */
    this.r = { x: -sy, y: cy, z: 0 };
    this.u = V.cross(this.r, this.f);
    this.flen = (0.5 * h) / Math.tan(this.fov / 2);
    this.cx = w / 2; this.cy = h / 2;
    this.w = w; this.h = h;
  };

  /* Lock the camera to the ship's own position and attitude — the cockpit
   * view. Same eye/f/r/u/flen contract as build(), so project() and every
   * caller downstream works unchanged; only how they get set differs. A
   * tighter FOV than the exterior view reads as "looking through a canopy"
   * rather than a fisheye. */
  /* `look` is the pilot's HEAD, not the ship: a yaw and a pitch applied to
   * the camera basis while the ship's own axes stay exactly where they are.
   * That distinction is the whole feature. Turning your head left does not
   * turn the ship, so the canopy frame swings across the view, the left
   * window comes round in front of you, and the attitude ladder — which is
   * built from real world directions — slides off to the right where the
   * nose actually is. Nothing else in the engine needs to know.
   *
   * Order is yaw-then-pitch, about the ship's up and then about the already
   * yawed right, which is the order a neck works in. Doing it the other way
   * round makes the horizon roll as you look about, which reads as motion
   * sickness rather than as looking around.
   *
   * Sign convention, derived rather than guessed: right = fwd x up, so
   * Rodrigues about `up` gives f' = f cos - right sin, i.e. a POSITIVE
   * rotation looks left. We negate so that positive yaw means look right,
   * which is what every caller will assume. Positive pitch looks up. */
  Camera.prototype.buildCockpit = function (ship, w, h, look) {
    /* The seat sits forward of the ship's origin, close to the console —
     * near enough that the instruments are within reach and the canopy
     * fills the view, which is what a cockpit feels like and what being
     * parked a metre back from your own dashboard does not. Everything in
     * the interior is authored around the origin, so this one offset moves
     * the pilot rather than the furniture. */
    this.eye = V.addScaled(ship.pos, ship.fwd, EYE_FWD * M);
    var f = ship.fwd, r = ship.right, u = ship.up;
    if (look && (look.yaw || look.pitch)) {
      if (look.yaw) {
        f = V.rotateAroundAxis(f, u, -look.yaw);
        r = V.rotateAroundAxis(r, u, -look.yaw);
      }
      if (look.pitch) {
        f = V.rotateAroundAxis(f, r, look.pitch);
      }
      u = V.cross(r, f);
    }
    this.f = V.norm(f);
    this.r = V.norm(r);
    this.u = V.norm(u);
    this.look = look || { yaw: 0, pitch: 0 };
    var fov = this.cockpitFov || 68 * DEG;
    this.flen = (0.5 * h) / Math.tan(fov / 2);
    this.cx = w / 2; this.cy = h / 2;
    this.w = w; this.h = h;
  };

  /* World point -> screen. Returns null behind the camera.
   * `scale` converts a world length at that depth into pixels. */
  Camera.prototype.project = function (p) {
    var vx = p.x - this.eye.x, vy = p.y - this.eye.y, vz = p.z - this.eye.z;
    var depth = vx * this.f.x + vy * this.f.y + vz * this.f.z;
    if (depth <= this.near) return null;
    var sx = vx * this.r.x + vy * this.r.y + vz * this.r.z;
    var sy = vx * this.u.x + vy * this.u.y + vz * this.u.z;
    var k = this.flen / depth;
    return { x: this.cx + sx * k, y: this.cy - sy * k, depth: depth, scale: k };
  };

  /* Direction-only projection, for objects at effective infinity. */
  Camera.prototype.projectDir = function (d) {
    var depth = V.dot(d, this.f);
    if (depth <= 1e-6) return null;
    var k = this.flen / depth;
    return {
      x: this.cx + V.dot(d, this.r) * k,
      y: this.cy - V.dot(d, this.u) * k,
      depth: depth
    };
  };

  /* ---- background starfield ------------------------------------------ */
  /* Deterministic from the seed, so your sky is your sky. Points on a unit
   * sphere, drawn as if infinitely far away. */
  function makeStarfield(seed, count) {
    var rng = new RNG('sky|' + seed);
    var stars = [];
    for (var i = 0; i < (count || 1400); i++) {
      // Uniform on the sphere: z uniform, theta uniform.
      var z = rng.range(-1, 1);
      var th = rng.angle();
      var s = Math.sqrt(1 - z * z);
      var mag = Math.pow(rng.next(), 2.4);   // most stars faint, a few bright
      stars.push({
        d: { x: s * Math.cos(th), y: s * Math.sin(th), z: z },
        b: 0.18 + mag * 0.82,
        size: 0.6 + mag * 1.5,
        tint: rng.chance(0.12) ? (rng.chance(0.5) ? '#ffd9c0' : '#c9dcff') : '#ffffff'
      });
    }
    return stars;
  }

  function drawStarfield(ctx, cam, stars) {
    for (var i = 0; i < stars.length; i++) {
      var st = stars[i];
      var p = cam.projectDir(st.d);
      if (!p) continue;
      if (p.x < -4 || p.x > cam.w + 4 || p.y < -4 || p.y > cam.h + 4) continue;
      ctx.globalAlpha = st.b;
      ctx.fillStyle = st.tint;
      ctx.fillRect(p.x, p.y, st.size, st.size);
    }
    ctx.globalAlpha = 1;
  }

  /* ---- polylines ------------------------------------------------------ */
  /* Draw a world-space polyline, breaking it wherever it passes behind the
   * camera so we never get a stray line whipping across the screen. */
  var _tmp = { x: 0, y: 0, z: 0 };
  function strokePath(ctx, cam, pts, style, width, alpha, dash, offset) {
    ctx.save();
    ctx.strokeStyle = style;
    ctx.lineWidth = width || 1;
    ctx.globalAlpha = alpha === undefined ? 1 : alpha;
    if (dash) ctx.setLineDash(dash);
    ctx.beginPath();
    var drawing = false;
    for (var i = 0; i < pts.length; i++) {
      var q = pts[i];
      if (offset) {
        _tmp.x = q.x + offset.x; _tmp.y = q.y + offset.y; _tmp.z = q.z + offset.z;
        q = _tmp;
      }
      var p = cam.project(q);
      if (!p) { drawing = false; continue; }
      // Guard against absurd coordinates from near-plane grazing.
      if (!isFinite(p.x) || Math.abs(p.x) > 1e6 || Math.abs(p.y) > 1e6) { drawing = false; continue; }
      if (!drawing) { ctx.moveTo(p.x, p.y); drawing = true; }
      else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
    ctx.restore();
  }

  /* ---- bodies --------------------------------------------------------- */

  function shadeBody(ctx, sp, radiusPx, body, lightScreen) {
    var g;
    if (body.kind === 'star') {
      g = ctx.createRadialGradient(sp.x, sp.y, 0, sp.x, sp.y, radiusPx);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.45, body.color);
      g.addColorStop(1, body.color);
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(sp.x, sp.y, radiusPx, 0, K.TAU); ctx.fill();
      return;
    }
    // Offset the highlight toward the star to fake a terminator.
    var ox = 0, oy = 0;
    if (lightScreen) {
      var dx = lightScreen.x - sp.x, dy = lightScreen.y - sp.y;
      var l = Math.sqrt(dx * dx + dy * dy) || 1;
      ox = (dx / l) * radiusPx * 0.55;
      oy = (dy / l) * radiusPx * 0.55;
    }
    g = ctx.createRadialGradient(sp.x + ox, sp.y + oy, radiusPx * 0.05,
                                 sp.x, sp.y, radiusPx * 1.25);
    g.addColorStop(0, lighten(body.color, 0.35));
    g.addColorStop(0.5, body.color);
    g.addColorStop(1, '#05070b');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(sp.x, sp.y, radiusPx, 0, K.TAU); ctx.fill();
  }

  function lighten(hex, amt) {
    var n = parseInt(hex.slice(1), 16);
    var r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    r = Math.round(r + (255 - r) * amt);
    g = Math.round(g + (255 - g) * amt);
    b = Math.round(b + (255 - b) * amt);
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }

  /* ---- the ship's hull -------------------------------------------------
   * A hand-built low-poly dart: nose, a three-point tail, and two flat delta
   * wings for a silhouette that reads as "a ship" rather than a rock, even
   * at a few pixels across. Coordinates are LOCAL to the ship, in km, using
   * the ship's own axes: x along "right", y along "up", z along "fwd" — so
   * transforming to world space is just pos + right*x + up*y + fwd*z, using
   * whatever basis the ship's current attitude gives us. No mesh loader, no
   * engine: this is what "hand-rolled" buys us for a nine-triangle ship. */
  /* THE ONE LENGTH EVERY HULL IS DRAWN AT, and now the one number the rest
   * of the game's scale is measured against.
   *
   * It was 10 m, and 10 m was wrong by arithmetic rather than by taste. A
   * Mule Freighter carries 160 t of cargo on 80 t of hull; at ten metres its
   * bounding box holds about 71 cubic metres, which puts it at 4,100 kg per
   * cubic metre laden — denser than concrete, four times water. The Talon
   * came out at 2,700. Nothing that flies is built like that.
   *
   * 25 m puts the whole catalogue near 200 kg/m3, which is where real
   * vehicles sit: a 747 at maximum take-off is about 250, the ISS about 30.
   * The fleet was measured hull by hull rather than scaled by feel — the
   * four purchasable hulls want 24, 17, 23 and 27 metres to land there.
   *
   * Everything on a hull is a FRACTION of this (muzzles, gear, the cockpit
   * interior, the exhaust), so they all follow it and the angles a pilot
   * sees from the seat are unchanged. combat.js used to keep its own copy of
   * this number; it now asks. */
  var SHIP_LEN = 0.025;   // km — every hull, 25 m nose to tail

  /* ======================================================================
   * MESHES
   * ======================================================================
   * A small kit for building low-poly hulls, and then one hull per kind of
   * ship. Written as generators rather than vertex tables because a
   * hexagonal tanker is six lines of loop and sixty lines of coordinates,
   * and the loop is the one you can still read in a year.
   *
   * Convention: +z forward, +x right, +y up. Ships are normalised to length
   * one, spanning z from -0.5 to +0.5, and scaled at draw time. Stations
   * are normalised to radius one.
   *
   * These are deliberately crude. At the handful of pixels a ship actually
   * occupies, the only information that survives is the silhouette — long
   * and thin reads as an interceptor, short and broad reads as trouble —
   * so the meshes are built to differ in outline rather than in detail.
   */
  function emptyMesh() { return { v: [], f: [] }; }

  /* Copy `src` into `dst`, scaled and translated. Scale may be a number or
   * a per-axis triple. */
  /* `col` is optional and per-part: omit it and the part takes the ship's
   * own tint, which is how every hull built before the painted ones works
   * and how faction colour still reaches the hull. Give it a '#rrggbb' and
   * that part keeps its own colour whatever the ship is flying as — canopy
   * glass is glass on everyone's ship. Prefix it with '!' and it is
   * emissive: drawn at full brightness regardless of where the sun is,
   * which is the only honest way to paint a lit engine bell. */
  function merge(dst, src, tx, ty, tz, s, col) {
    var sx, sy, sz;
    if (s === undefined) { sx = sy = sz = 1; }
    else if (typeof s === 'number') { sx = sy = sz = s; }
    else { sx = s[0]; sy = s[1]; sz = s[2]; }
    var base = dst.v.length, i;
    for (i = 0; i < src.v.length; i++) {
      dst.v.push([src.v[i][0] * sx + tx, src.v[i][1] * sy + ty, src.v[i][2] * sz + tz]);
    }
    /* The colour array is only allocated once something asks for one, and
     * it is back-filled so it always lines up with the face list — a mesh
     * that starts plain and gains a painted part halfway through must not
     * end up colouring the wrong triangles. */
    if (col && !dst.c) {
      dst.c = [];
      while (dst.c.length < dst.f.length) dst.c.push(null);
    }
    for (i = 0; i < src.f.length; i++) {
      dst.f.push([src.f[i][0] + base, src.f[i][1] + base, src.f[i][2] + base]);
      if (dst.c) dst.c.push(src.c ? src.c[i] : (col || null));
    }
    return dst;
  }

  function box(hx, hy, hz) {
    return {
      v: [[-hx, -hy, -hz], [hx, -hy, -hz], [hx, hy, -hz], [-hx, hy, -hz],
          [-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz]],
      f: [[0, 1, 2], [0, 2, 3], [4, 6, 5], [4, 7, 6], [0, 4, 5], [0, 5, 1],
          [3, 2, 6], [3, 6, 7], [0, 3, 7], [0, 7, 4], [1, 5, 6], [1, 6, 2]]
    };
  }

  /* A prism or frustum along z. r0 is the radius at the tail, r1 at the
   * nose, so a cone, a cylinder and a wedge are all the same call. */
  function tube(seg, r0, r1, halfLen, capped) {
    var v = [], f = [], i;
    for (i = 0; i < seg; i++) {
      var a = (i / seg) * K.TAU, c = Math.cos(a), s = Math.sin(a);
      v.push([c * r0, s * r0, -halfLen]);
      v.push([c * r1, s * r1, halfLen]);
    }
    for (i = 0; i < seg; i++) {
      var a0 = i * 2, a1 = i * 2 + 1, b0 = ((i + 1) % seg) * 2, b1 = b0 + 1;
      f.push([a0, b0, b1]); f.push([a0, b1, a1]);
    }
    if (capped) {
      var c0 = v.length; v.push([0, 0, -halfLen]);
      var c1 = v.length; v.push([0, 0, halfLen]);
      for (i = 0; i < seg; i++) {
        f.push([c0, ((i + 1) % seg) * 2, i * 2]);
        f.push([c1, i * 2 + 1, ((i + 1) % seg) * 2 + 1]);
      }
    }
    return { v: v, f: f };
  }

  /* A wheel rim in the xy plane — the shape of every station anybody has
   * ever drawn, and still the clearest one. */
  function rimRing(seg, majorR, minorR, halfWidth) {
    var v = [], f = [], i;
    for (i = 0; i < seg; i++) {
      var a = (i / seg) * K.TAU, c = Math.cos(a), s = Math.sin(a);
      v.push([c * (majorR - minorR), s * (majorR - minorR), -halfWidth]);
      v.push([c * (majorR + minorR), s * (majorR + minorR), -halfWidth]);
      v.push([c * (majorR + minorR), s * (majorR + minorR), halfWidth]);
      v.push([c * (majorR - minorR), s * (majorR - minorR), halfWidth]);
    }
    for (i = 0; i < seg; i++) {
      var A = i * 4, B = ((i + 1) % seg) * 4;
      f.push([A + 1, B + 1, B + 2]); f.push([A + 1, B + 2, A + 2]);   // outer
      f.push([A + 0, A + 3, B + 3]); f.push([A + 0, B + 3, B + 0]);   // inner
      f.push([A + 3, A + 2, B + 2]); f.push([A + 3, B + 2, B + 3]);   // front
      f.push([A + 0, B + 0, B + 1]); f.push([A + 0, B + 1, A + 1]);   // back
    }
    return { v: v, f: f };
  }

  /* Spokes from a hub out to a rim, as thin boxes. */
  function spokes(count, innerR, outerR, thick) {
    var m = emptyMesh();
    for (var i = 0; i < count; i++) {
      var a = (i / count) * K.TAU;
      var mid = (innerR + outerR) / 2, half = (outerR - innerR) / 2;
      var bar = box(half, thick, thick);
      // Rotate the bar into place by hand — cheaper than a matrix for four.
      var c = Math.cos(a), s = Math.sin(a);
      var base = m.v.length, j;
      for (j = 0; j < bar.v.length; j++) {
        var x = bar.v[j][0] + mid, y = bar.v[j][1], z = bar.v[j][2];
        m.v.push([x * c - y * s, x * s + y * c, z]);
      }
      for (j = 0; j < bar.f.length; j++) {
        m.f.push([bar.f[j][0] + base, bar.f[j][1] + base, bar.f[j][2] + base]);
      }
    }
    return m;
  }

  /* ---- the trader -------------------------------------------------------
   * Translated from the Claude Design three.js source in
   * ref/trader-handoff/. Gunmetal-green stepped hull, dark panelling, a
   * mustard dorsal stripe, two faceted engine nacelles with lit bells.
   *
   * Everything is quoted in DESIGN units: the design places parts by centre
   * and full size, so `slab` takes the same numbers the source does and
   * halves them here. That way this reads as the same object rather than as
   * a pile of pre-multiplied constants nobody can check.
   */
  var TRADER_LEN = 4.285;          // design z from -1.985 (bell) to +2.30 (tip)
  var TRADER_CZ = 0.1575;          // design-space centre, z
  var TRADER_CY = 0.6325;          // design-space centre, y

  var TRADER_HULL   = null;        // takes the ship's tint: faction colour lands here
  var TRADER_PANEL  = '#4f544c';
  var TRADER_GLASS  = '#1c2620';
  var TRADER_ENGINE = '#33362f';
  var TRADER_ACCENT = '#d6c24a';
  var TRADER_GLOW   = '!#e0b23a';  // '!' = emissive; a lit bell is not lit by the sun

  function traderHull() {
    var S = 1 / TRADER_LEN;
    var m = emptyMesh();

    /* A box given as the design gives it: full size, then centre. */
    function slab(w, h, d, x, y, z, col) {
      merge(m, box(w / 2, h / 2, d / 2),
            x * S, (y - TRADER_CY) * S, (z - TRADER_CZ) * S, S, col);
    }
    /* A cylinder along z, given as radius at the tail and at the nose. */
    function drum(seg, rTail, rNose, len, x, y, z, col) {
      merge(m, tube(seg, rTail, rNose, len / 2, true),
            x * S, (y - TRADER_CY) * S, (z - TRADER_CZ) * S, S, col);
    }

    // Hull, three stepped boxy sections.
    slab(1.5, 0.9, 2.4, 0, 0.45, 0, TRADER_HULL);
    slab(1.0, 0.65, 0.9, 0, 0.42, 1.5, TRADER_HULL);
    slab(0.55, 0.4, 0.5, 0, 0.38, 2.05, TRADER_PANEL);

    // Canopy, set into the forward hull top.
    slab(0.62, 0.3, 0.68, 0, 0.85, 0.85, TRADER_GLASS);

    // Stub side fins and the rear stabiliser.
    slab(0.2, 0.45, 1.3, -0.85, 0.4, -0.35, TRADER_PANEL);
    slab(0.2, 0.45, 1.3, 0.85, 0.4, -0.35, TRADER_PANEL);
    slab(0.15, 0.6, 0.7, 0, 0.9, -0.9, TRADER_PANEL);

    // The mustard stripe down the spine — the one piece of colour on it.
    slab(1.2, 0.03, 1.9, 0, 0.916, 0.2, TRADER_ACCENT);

    // Vent greebles along both flanks.
    var gz = [0.6, -0.1, -0.7];
    for (var i = 0; i < gz.length; i++) {
      slab(0.06, 0.22, 0.3, -0.76, 0.45, gz[i], TRADER_PANEL);
      slab(0.06, 0.22, 0.3, 0.76, 0.45, gz[i], TRADER_PANEL);
    }

    /* Engines. Eight-sided on purpose: the design says low-poly and faceted,
     * and at the size a ship actually occupies more segments buy nothing. */
    for (var e = -1; e <= 1; e += 2) {
      var x = e * 0.5;
      drum(8, 0.36, 0.32, 0.9, x, 0.45, -1.5, TRADER_ENGINE);      // housing
      drum(8, 0.36, 0.36, 0.08, x, 0.45, -1.06, TRADER_PANEL);     // intake ring
      drum(8, 0.24, 0.24, 0.05, x, 0.45, -1.96, TRADER_GLOW);      // bell
    }

    // Antenna. A hair-thin mast and a bead, drawn as boxes because at this
    // scale a six-sided cylinder is the same two pixels for four times the
    // triangles.
    slab(0.04, 0.35, 0.04, 0, 1.05, -0.85, TRADER_PANEL);
    slab(0.07, 0.07, 0.07, 0, 1.23, -0.85, TRADER_ACCENT);

    return m;
  }

  /* ---- imported hulls ---------------------------------------------------
   * src/hulls.js (generated by tools/glb2hulls.js) carries every .glb ship
   * model as palette-compressed data, keyed by ID. Each ID decompresses
   * once, lazily, into the renderer's own mesh format. The ASSIGNMENT
   * table below is the design surface: which model ID flies as which ship
   * class. It is deliberately data, editable at runtime
   * (Render.assignHull('pirate', 'fighter-s')), because the person naming
   * these models is not the person who wrote this file.
   *
   * Defaults follow the model families' own names; 'capital-*' is imported
   * and waiting for a role. */
  var HULL_ASSIGN = {
    courier: 'courier-m',
    trade: 'trader-m',
    shuttle: 'shuttle-s',
    freighter: 'freighter-l',
    /* `bulk` shipped at S only, so it is a single id rather than a family.
     * It reads as a bulk hauler and the tanker was wearing a hydrogen
     * freighter, which is now free for the class named after it. */
    tanker: 'bulk-s',
    hauler: 'tug-m',
    police: 'police-m',
    /* Hired muscle, flying something that looks like hired muscle rather
     * than a generic fighter. */
    merc: 'enforcer-l',
    /* A pirate wants speed more than it wants a gun platform. */
    pirate: 'runner-m',
    liner: 'liner-m',
    /* Was 'capital-m', which was wrong in a way that mattered: a navy that
     * only fields capital hulls cannot be DISPATCHED, and dispatched
     * hunters are what the notoriety work needs. The capital is now free
     * for what it is actually for — the thing you run from. */
    navy: 'navy-m',
    tender: 'tender-m'
  };

  /* ---- the 2026-09-11 drop, and what it left unassigned -----------------
   * Five families arrived with no class to fly as, and a hull nothing
   * points at is a hull nobody ever sees. Three of them are placed above,
   * by what their names say they are — which is the only evidence this file
   * has, and the names were chosen by the person who drew them.
   *
   * DELIBERATELY UNASSIGNED, listed here so they read as waiting rather
   * than as missing:
   *
   *   enforcer_heavy-*  the one the syndicate sends. There is no class yet
   *       that means "the bad one"; the mafia/pirate split is agreed and
   *       unbuilt, and this is the hull it will want.
   *   carrier-*         big and military, but the navy already fields a
   *       cutter and the capital is still the thing you run from. A third
   *       heavy hull needs a role before it needs an assignment.
   *   capital-*         unchanged: imported, and waiting.
   *   escape_pod-*      belongs with the debris work, not with a traffic
   *       class. It is what is LEFT when a ship dies.
   *
   * ALL OF THIS IS DATA. Every assignment above is one Render.assignHull
   * call to undo, at runtime, and nothing else in the game needs to know —
   * which is the point of the table. If the carrier turns out to read as a
   * freighter, or the runner as a courier, moving it is a one-word change.
   * Look at them in hulls.html before deciding; that page lists every id in
   * the library whether or not anything flies it. */

  /* The liner and the capital now have classes of their own — a light run
   * between two settled worlds is flown as a 'liner', and a faction with
   * the industry and the order to justify one fields a 'navy' cutter. Both
   * are generation-side (see SHIP_CLASSES and buildPatrols); the only thing
   * needed here was a hull to put them in.
   *
   * 'h2_freighter' IS assigned, to tanker, above: the class already exists
   * and already hauls hydrogen, so the hull and the job already agree.
   *
   * STILL WAITING: 'escape_pod-*'. It is not a ship anybody flies anywhere
   * — it is what is LEFT when a ship dies, so it belongs with the debris
   * work rather than with a traffic class, and assigning it to something
   * that flies a timetable would be worse than leaving it unused. */

  var LIB_CACHE = {};
  function libHull(id) {
    var lib = global.HullLib;
    if (!lib || !lib[id]) return null;
    if (LIB_CACHE[id]) return LIB_CACHE[id];
    var src = lib[id];
    var mesh = { v: src.v, f: src.f, c: [] };
    for (var i = 0; i < src.ci.length; i++) mesh.c.push(src.pal[src.ci[i]]);
    /* The parts that move, hung off the hull they belong to. Each carries
     * its own small mesh plus the pivot and axis it turns about, and the
     * mesh object is BUILT ONCE here and cached with the hull for exactly
     * the reason the shard pool is fixed: gl.js caches its GPU buffers on
     * the mesh object, so a fresh object per frame would upload a vertex
     * buffer per leg per frame and never free one. */
    if (src.gear && src.gear.length) {
      mesh.gear = src.gear.map(function (p) {
        var pm = { v: p.v, f: p.f, c: [] };
        for (var k = 0; k < p.ci.length; k++) pm.c.push(p.pal[p.ci[k]]);
        return { role: p.role, pivot: p.pivot, axis: p.axis, stow: p.stow, mesh: pm };
      });
    }
    LIB_CACHE[id] = mesh;
    return mesh;
  }

  function hullIds() {
    return global.HullLib ? Object.keys(global.HullLib) : [];
  }

  /* ---- imported ports ----------------------------------------------------
   * Same shape as libHull, against global.PortLib, keyed by the port's ROLE
   * rather than by a model id — because a port's identity in this game IS
   * its role. There is no assignment table to go through: a file called
   * `refinery.glb` is what a refinery looks like.
   *
   * WHOLLY OPTIONAL. src/ports.js is generated, is not required by
   * index.html, and when it is absent every role falls back to the
   * procedural mesh it has today. That is not politeness — it is the same
   * rule the ship library follows, and it is what lets a half-modelled
   * folder be dropped in without taking the game down.
   *
   * A port model may split its geometry into a static shell, an `interior`
   * only visible from inside, and a `spin` bucket that turns; the three are
   * decompressed separately and cached, because a ring that rotates cannot
   * share a mesh object with a hub that does not. */
  var PORT_CACHE = {};

  function decompress(src) {
    var mesh = { v: src.v, f: src.f, c: [] };
    for (var i = 0; i < src.ci.length; i++) mesh.c.push(src.pal[src.ci[i]]);
    return mesh;
  }

  function libPort(role) {
    var lib = global.PortLib;
    if (!lib || !role || !lib[role]) return null;
    if (PORT_CACHE[role]) return PORT_CACHE[role];
    var src = lib[role];
    var out = {
      kind: src.kind,
      shell: decompress(src),
      interior: src.interior ? decompress(src.interior) : null,
      spin: src.spin ? decompress(src.spin) : null,
      anchors: src.anchors || null,
      geom: src.geom || null
    };
    PORT_CACHE[role] = out;
    return out;
  }

  function portIds() {
    return global.PortLib ? Object.keys(global.PortLib) : [];
  }

  /* Drop everything derived from the port library.
   *
   * In the game this is never needed: index.html loads ports.js before
   * render.js, so the library is already there the first time a station
   * mesh is asked for. It exists for the two cases that are not the game —
   * a test that installs a library after boot, and the hull viewer page,
   * which is the whole point of being able to swap models without a
   * restart. Same role assignHull plays for ships. */
  var SOLIDITY = {};
  var PORT_DOORS = {};
  function reloadPorts() {
    PORT_CACHE = {};
    POOL_CACHE = null;
    STATION_MESHES = null;
    INTERIOR_BOUNDS = {};
    PORT_DOORS = {};
    /* The occupancy grids are voxelised from those meshes, so swapping the
     * library while the game runs has to drop them too — otherwise the new
     * models are drawn and the old ones are what you collide with. */
    SOLIDITY = {};
  }

  /* ---- which model a port wears, and it is ONE rule ----------------------
   * Driven by what the place actually does, so a refinery looks like a
   * refinery from a long way out — the silhouette is the first thing you
   * learn about a port and it should be true.
   *
   * MOVED HERE FROM main.js, and the move is the point. This key now
   * decides two separate things: which mesh gets drawn, and which imported
   * model's DIMENSIONS bayGeometry reads. Those two disagreeing would draw
   * one shed and park ships in the shape of another, which is the exact
   * class of bug that keeps costing this project a day — so there is one
   * implementation and generate.js and main.js both call it.
   *
   * It lives in render.js because render.js owns the mesh library and loads
   * after generate.js, which reaches for it lazily through `global`. */
  var STATION_MODELS = {
    orbital: 'orbital', highport: 'highport', refinery: 'refinery',
    shipyard: 'shipyard', agri: 'agri', mining: 'mining',
    reprocessing: 'reprocessing'
  };

  /* What KIND of port this is, before any model is chosen. Three answers,
   * and they are the three that behave differently rather than three that
   * merely look different: a buried bay, a bay on the surface, and a thing
   * in orbit. */
  function portRole(station) {
    if (!station) return 'orbital';
    if (station.underground) return 'underground';
    /* Every surface port is a shaft now, so the flat apron model is no
     * longer what any of them look like — a shallow field gets the same
     * collar-shaft-hangar structure, just less of it. The old 'surface'
     * mesh is left in the library rather than deleted: nothing points at
     * it, and it is the one thing that would have to be rebuilt from
     * scratch if this decision is ever reversed. */
    if (station.surface) return 'bay';
    var role = station.market && station.market.role;
    return STATION_MODELS[role] || 'orbital';
  }

  /* ---- WHICH model, when a role has several ------------------------------
   * The same shape HULL_ASSIGN has for ships, and for the same reason: the
   * person naming the models is not the person who wrote this file. A role
   * maps to a LIST of model ids, and a role with one entry behaves exactly
   * as the old one-to-one table did.
   *
   * It has to be a list because the art does not divide the way the roles
   * do. There are seven orbital roles and there will be four space station
   * models; there is one surface role and there will be several cities, and
   * several buried bays. Neither of those is a mistake — a refinery and a
   * farm genuinely should not share a silhouette, and two farming worlds
   * genuinely should not be the same building twice.
   *
   * Default is `[role]`, which is the procedural mesh's own key, so a role
   * nobody has modelled keeps the mesh it has today.
   *
   * WHICH VARIANT A PORT GETS IS HASHED FROM THE PORT, not drawn. Doctrine:
   * the same seed is the same universe, so a port has to be the same
   * building every time you fly to it, across a save and a reload, forever.
   * A Math.random() here would be invisible for about twenty minutes and
   * then permanently untrustworthy. */
  var PORT_ASSIGN = {};

  /* ---- POOLS BY FILENAME, so dropping models in needs no code -----------
   * A model's name says which pool it joins. Three prefixes, matching the
   * three kinds of port that behave differently:
   *
   *     station-ring.glb   station-drum.glb    -> any orbital role
   *     city-market.glb    city-arcology.glb   -> any surface port
   *     deep-silo.glb      deep-cavern.glb     -> any buried bay
   *
   * A port then gets one of its pool, hashed from its own id. So four space
   * stations spread across all seven orbital roles, three cities across
   * every settled world, and nothing has to be assigned by hand.
   *
   * WHAT THIS TRADES AWAY, stated plainly because the code used to argue
   * the other way: pooling means a refinery and a farm can wear the same
   * hull, so you can no longer tell what a port DOES from its silhouette on
   * approach. That was a real piece of information and it is being spent on
   * variety instead. The role is still on the label and in the market, and a
   * single role can still be pinned to its own model — either by naming a
   * file exactly after it, or with assignPort — so the trade is reversible
   * one role at a time rather than all or nothing.
   *
   * Precedence, most specific first:
   *   1. an explicit assignPort for the role
   *   2. a model named exactly after the role  (`refinery.glb`)
   *   3. the role's pool by prefix             (`station-*`)
   *   4. the procedural mesh
   */
  var PORT_POOL = { underground: 'deep', bay: 'city' };

  /* ---- PATTERNS, AND SIZES, WHICH ARE NOT THE SAME KIND OF CHOICE --------
   * The station art arrives as PATTERN x SIZE: four orbital patterns —
   * cylinder, spine, ring, cradle — each in S, M and L, so twelve models
   * for the orbital roles alone, with cities and buried bays to follow.
   *
   * Those two axes must not be picked the same way, and treating them alike
   * would have been the easy mistake:
   *
   *   PATTERN is variety. Nothing about a port says whether it should be a
   *   ring or a spine, so it is hashed off the port's own id — stable
   *   forever, different between neighbours.
   *
   *   SIZE IS MEANING. STATIONS.md is explicit that size changes bay count
   *   and overall span, so it is how much traffic the place handles — and
   *   the port already knows that. Hashing it would put a six-berth hub over
   *   a mining outpost and a one-berth stub over a capital world, which is
   *   worse than having one size.
   *
   * MEASURED, because this project has shipped two thresholds that excluded
   * every case. Population per port, 15 galaxy seeds, 1,418 ports:
   *
   *              n     p25   median   p75    p90    max
   *   orbital    650   928   1712     2872   4028   5858
   *   surface    467    60    180      784   1823   4392
   *   underground 301   70    168      463   1428   4427
   *
   * The three distributions are nothing like each other — orbital ports are
   * an order of magnitude busier — so ONE set of cuts would have made two
   * thirds of orbital stations L and a fifth of surface ones. Hence a set
   * per class, placed near the 40th and 80th percentiles.
   *
   * Deliberately NOT even thirds: a biggest-size station should be a
   * landmark, and a third of everything is not a landmark. What the cuts
   * below actually produce, measured over the same 1,418 ports:
   *
   *                 S     M     L
   *   all ports    40%   38%   22%
   *   orbital      38%   40%   22%
   *   bay          42%   35%   23%
   *   underground  41%   39%   21%
   *
   * Even across all three classes, which is the thing that would have been
   * wrong with shared cuts and is the reason for measuring rather than
   * picking. */
  var PORT_SIZE_CUTS = {
    orbital: [1400, 3100],
    bay: [130, 1000],
    underground: [130, 620]
  };

  /* Which pattern belongs to which class. Explicit rather than derived from
   * the filename, because the names are meaningful and their maker chose
   * them — the same reason HULL_ASSIGN is a table and not a naming rule. */
  var PORT_PATTERNS = {
    cylinder: 'orbital', spine: 'orbital', ring: 'orbital', cradle: 'orbital'
  };

  var POOL_CACHE = null;
  var SIZE_SUFFIX = /-(s|m|l)$/i;

  /* One of three, and only three things behave differently. */
  function portClass(role) {
    return role === 'bay' ? 'bay' : (role === 'underground' ? 'underground' : 'orbital');
  }

  function portSizeFor(station, role) {
    var cuts = PORT_SIZE_CUTS[portClass(role)] || PORT_SIZE_CUTS.orbital;
    var pop = station && station.market && station.market.pop;
    /* No market to read — a fixture, or a port type that does not trade.
     * Middle, because it is the one that is never badly wrong. */
    if (!(pop > 0)) return 'm';
    return pop < cuts[0] ? 's' : (pop < cuts[1] ? 'm' : 'l');
  }

  /* The distinct pattern STEMS available for a role, size suffixes stripped.
   * Two ways a stem qualifies: it is named in PORT_PATTERNS for this class,
   * or it carries the class's prefix (`station-`, `city-`, `deep-`), which
   * is the zero-table path for art whose names nobody has declared yet.
   *
   * Sorted, because Object.keys order is whatever the generated file happens
   * to list and it must not be what decides which building a port gets —
   * the same argument that sorts the muzzles and the berths. */
  function poolFor(role) {
    if (!POOL_CACHE) POOL_CACHE = {};
    var cls = portClass(role);
    if (POOL_CACHE[cls]) return POOL_CACHE[cls];
    var lib = global.PortLib || {};
    var pre = (PORT_POOL[role] || 'station') + '-';
    var seen = {}, out = [];
    Object.keys(lib).forEach(function (id) {
      var stem = id.replace(SIZE_SUFFIX, '');
      var ok = PORT_PATTERNS[stem] === cls || stem.indexOf(pre) === 0;
      if (!ok || seen[stem]) return;
      seen[stem] = true;
      out.push(stem);
    });
    out.sort();
    POOL_CACHE[cls] = out;
    return out;
  }

  function pick(list, station, salt) {
    if (list.length === 1) return list[0];
    var key = (station && (station.id || station.name)) || salt;
    var h = RNG ? RNG.hashString('portmodel|' + key) : 0;
    return list[h % list.length];
  }

  /* A stem plus the size the port has earned, degrading gracefully: the
   * exact size, then the bare stem, then whatever size of that stem does
   * exist. A pattern modelled at M only should be used at M rather than
   * silently falling back to a procedural mesh. */
  function sizedModel(stem, size) {
    var lib = global.PortLib || {};
    if (lib[stem + '-' + size]) return stem + '-' + size;
    if (lib[stem]) return stem;
    var alt = ['m', 'l', 's'];
    for (var i = 0; i < alt.length; i++) {
      if (lib[stem + '-' + alt[i]]) return stem + '-' + alt[i];
    }
    return null;
  }

  function portModelFor(station) {
    var role = portRole(station);
    var size = portSizeFor(station, role);

    /* An explicit assignment wins, and is still size-aware: assign a role a
     * list of STEMS and each port gets the right size of the one it drew. */
    var list = PORT_ASSIGN[role];
    if (list && list.length) {
      var chosen = pick(list, station, role);
      return sizedModel(chosen, size) || chosen;
    }
    /* A file named for the role pins that role, which is how one-model-per-
     * role stays the zero-configuration path even once pools exist. */
    var byRole = sizedModel(role, size);
    if (byRole) return byRole;

    var pool = poolFor(role);
    if (pool.length) {
      var stem = pick(pool, station, role);
      return sizedModel(stem, size) || stem;
    }
    return role;
  }

  /* Point a role at one or more models. `ids` may be a string or an array;
   * null clears back to the procedural mesh. Offered as a design surface the
   * way assignHull is — the models are named by whoever made them, and this
   * is where that naming meets the game. */
  function assignPort(role, ids) {
    if (!role) return false;
    if (ids === null || ids === undefined) delete PORT_ASSIGN[role];
    else PORT_ASSIGN[role] = [].concat(ids);
    reloadPorts();
    return true;
  }

  /* NOTE ON NAMING, because there are two ways in and both are supported.
   *
   * stationMeshes folds EVERY model in the library into the mesh table under
   * its own id. So a file named after a role — `refinery.glb` — takes over
   * that role with no assignment at all, which is the zero-configuration
   * path and the right one while there is one model per role.
   *
   * PORT_ASSIGN is for when that stops being true: several cities, several
   * buried bays, four space stations against seven orbital roles. Then the
   * models get whatever names their maker gave them and this table says
   * which role reaches for which. */

  /* ---- where the guns are, from the art rather than from a guess ---------
   * glb2hulls records the `laserEmitter` node of every gun each model
   * carries — the tip of the barrel, in the same normalised frame as the
   * vertices — so this converts them into the ship's own axes in km, ready
   * to be handed to localToWorld. The courier's come out at x ±0.045,
   * y −0.081, z 0.5: a symmetric pair of CHIN guns at the nose, under the
   * console, which is where the model has always had them and nowhere near
   * where combat.js used to guess.
   *
   * Ordered left to right by the tool. Returns an empty array for a model
   * with no guns modelled — capitals and escape pods — and the caller falls
   * back to a derived offset rather than drawing from nowhere. */
  function hullMuzzles(kind) {
    var id = HULL_ASSIGN[kind] || HULL_ASSIGN.courier;
    var m = global.HullLib && global.HullLib[id];
    if (!m || !m.muzzles) return [];
    return m.muzzles.map(function (p) {
      return { r: p[0] * SHIP_LEN, u: p[1] * SHIP_LEN, f: p[2] * SHIP_LEN };
    });
  }

  /* The player flies the courier hull whatever they bought — drawShipModel
   * hard-codes it — so the muzzles have to come off the same model, or the
   * beams would leave a ship that is not the one on screen. */
  function shipMuzzles() { return hullMuzzles('courier'); }

  /* HOW BIG THIS CLASS ACTUALLY IS, in kilometres — the bounding box of the
   * model it wears, not a number in a table beside it.
   *
   * Same key and same fallback as hullMuzzles, and for the same reason: a
   * berth sized against one model while the ship wears another parks a hull
   * through a wall. `span` is what the converter has always measured and
   * nothing has ever read; it is the model's extent in the normalised frame
   * every hull is drawn in, so SHIP_LEN converts it straight to km.
   *
   * The fallback is a courier-ish box rather than zero, because "we do not
   * know how big it is" must not read as "it fits anywhere". */
  function hullSpan(kind) {
    var id = HULL_ASSIGN[kind] || HULL_ASSIGN.courier;
    var m = global.HullLib && global.HullLib[id];
    var sp = m && m.span;
    if (!sp) return { w: SHIP_LEN * 0.5, h: SHIP_LEN * 0.5, l: SHIP_LEN };
    return { w: sp[0] * SHIP_LEN, h: sp[1] * SHIP_LEN, l: sp[2] * SHIP_LEN };
  }

  /* ---- and where a tracer APPEARS to come from, from the seat ------------
   * The real chin guns are 5 m ahead of the origin and 81 cm under it, which
   * from an eye 8 cm forward subtends nine degrees below the boresight. That
   * is physically right and dramatically useless: the canopy sill is
   * twenty-one degrees down, so a tracer drawn from the true muzzle starts
   * ABOVE the sill, in clear air, and reads as a line that begins in front
   * of the ship attached to nothing.
   *
   * The reason is that reality is doing some occluding we are not: from a
   * real seat those barrels are hidden under your own nose, and the beam is
   * first seen where it clears the hull. The cockpit view draws no exterior
   * hull, so nothing hides the start and it floats.
   *
   * So the seat gets an APPARENT muzzle: same side, but low and close, so
   * the tracer comes up from beneath the console and out under the nose,
   * which is where it would appear from if the hull were in the way. Twenty-
   * seven degrees down puts it just below the sill's twenty-one. The
   * exterior view keeps the true emitters — out there you can see the guns,
   * so nothing needs faking.
   *
   * HOW FAR DOWN IS MEASURED, NOT PICKED. The first attempt used a fixed
   * twenty-seven degrees, which was chosen against one window and was wrong
   * in every other: in a short window the instrument deck covers everything
   * more than a few degrees below the boresight, so the tracer's origin sat
   * behind the panels and only the last fifth of its travel was ever seen.
   * The caller passes `drop`, the downward angle as a ratio of focal
   * lengths, worked out from deckTop() — so the tracer enters from just
   * under the deck at any window shape, and still swings correctly with the
   * head because it remains an honest point in the ship's frame.
   *
   * Metres, like everything else in this section. */
  var SEAT_MUZZLE = { r: 0.36, f: 1.45 };

  function seatMuzzle(side, drop) {
    var f = SEAT_MUZZLE.f * M;
    return { r: (side < 0 ? -1 : 1) * SEAT_MUZZLE.r * M,
             u: -f * (drop > 0 ? drop : 0.35),
             f: f };
  }

  /* ---- and how long a bolt is, at each moment of its flight --------------
   * Reported in play: the bolts were "too chunky and too slow" — fat short
   * slugs sliding down the run. The slug was the mistake. A tracer is not a
   * rigid object being carried along a line; it is a length of glowing
   * stuff, and how long it is is the whole read.
   *
   * THE LENGTH IS PHYSICAL, NOT PICKED. A pulse emitter fires a BUNCH of
   * charged particles, and a bunch debunches: the particles leave with a
   * small spread in velocity, the quick ones pull ahead of the slow ones,
   * and the packet stretches linearly with the distance it has covered.
   * That is a real property of a real particle beam, and it hands us the
   * animation instead of us having to invent one — the same method the
   * weapon tiers, the mass budget and the atmosphere model all use.
   *
   * So the packet has two numbers and both mean something:
   *
   *   BOLT_MUZZLE_LEN  how long the packet is as it clears the emitter, as
   *                    a fraction of the whole run. Short — this is the
   *                    emitter's pulse duration, not a design knob.
   *   BOLT_DISPERSION  the fractional velocity spread dv/v. It is what the
   *                    packet's length grows BY per unit of distance
   *                    travelled, which is why the streak elongates.
   *
   * The consequence worth stating: once the head arrives the head stops and
   * the TAIL KEEPS GOING, so the streak collapses into the far point rather
   * than blinking out. That collapse is the impact, and it costs nothing —
   * it falls out of running the same two ends past each other.
   *
   * Returns fractions of the muzzle-to-target run, so the caller can stay
   * in whatever space it has already projected into. */
  var BOLT_MUZZLE_LEN = 0.06;
  var BOLT_DISPERSION = 0.42;

  function boltSpan(age, cross) {
    var c = cross > 0 ? cross : 0.2;
    var p = (age > 0 ? age : 0) / c;          // 1 = the moment of arrival
    var head = p < 1 ? p : 1;
    var len = BOLT_MUZZLE_LEN + BOLT_DISPERSION * head;
    var tail = p - len;
    if (tail < 0) tail = 0;
    if (tail > head) tail = head;             // arrived and gone
    return { tail: tail, head: head, len: head - tail };
  }

  /* ---- and how WIDE it is, and where along it the samples fall -----------
   * The second half of the bolt report, and the one that took two goes.
   *
   * A tracer used to be drawn between two projected endpoints, with the width
   * running down a fixed pixel ramp — 2.4 px at the muzzle to 0.55 at the far
   * end, over a constant whose own comment said "perspective, faked cheaply".
   * Two things were wrong with that and both of them look like bad
   * perspective:
   *
   *   - EVERY shot tapered by the same 4.4x. One fired down the boresight at
   *     something 20 km ahead and one crossing the canopy broadside got
   *     identical ramps. Broadside, both ends are the same distance away and
   *     the bolt should be a ribbon of constant width.
   *   - THE TRAVEL WAS LINEAR IN PIXELS. A point moving at a constant speed
   *     down a receding ray does not cross the screen at a constant rate; it
   *     should appear to slow sharply as it goes. Sliding uniformly is what
   *     makes a thing read as painted on the glass.
   *
   * So the ribbon is sampled along the WORLD ray and each sample carries the
   * width its own depth implies. The screen line stays straight — perspective
   * maps lines to lines — so what is being sampled is only the width, which
   * varies hyperbolically, and the spacing, which is what fixes the travel.
   *
   * BOLT_R IS AN EXAGGERATION, AND SAYING SO IS THE POINT. The first attempt
   * used an honest physical radius — a particle packet a metre and a half
   * across — and the test caught what that means at this game's scale: the
   * width hits its floor at 1.8 km and never moves again, while the guns
   * reach 9 to 23 km and the encounter standoffs run from 6 to 45. Every
   * bolt would have been a flat hairline over its entire length, which is not
   * "correct perspective", it is no perspective at all with a physical
   * justification stapled to it. A real three-metre object at 20 km subtends
   * nothing and would simply be invisible.
   *
   * So the radius is chosen to put the TAPER where the fighting is, and the
   * rest of this file's honesty about tracers applies: a tracer's whole job
   * is to say that a shot happened, which is the same argument MIN_BEAM_PX
   * already makes out loud. At the default seat view — 900 px tall, 68° —
   * the focal length is 667 px, and 18 m reads as
   *
   *     capped (3.6 px) inside  3.3 km
   *     real taper              3.3 km to 24 km
   *     floored (0.5 px) beyond 24 km
   *
   * — which brackets the range every gun in the catalogue works at. What is
   * NOT faked, and what the report was about, is that the width now comes off
   * each sample's own depth, so the taper responds to where the shot is
   * actually pointed instead of being the same ramp every time.
   *
   * Kept as a world radius against `scale` rather than as a pixel curve, so
   * zooming in still widens a bolt the way it widens everything else.
   *
   * Returns null if any sample is behind the camera. A ray that straddles the
   * eye has no honest ribbon, and the caller is expected to fall back rather
   * than draw a folded one. */
  var BOLT_R = 0.018;         // km — apparent radius, see above
  var BOLT_MIN_W = 0.5;       // px
  var BOLT_MAX_W = 3.6;       // px
  var BOLT_SEGS = 4;          // samples-1; the line is straight, only w varies

  function boltRibbon(cam, origin, seg, f0, f1, wScale) {
    var n = BOLT_SEGS, out = [], i;
    var s = wScale > 0 ? wScale : 1;
    for (i = 0; i <= n; i++) {
      var f = f0 + (f1 - f0) * (i / n);
      var p = cam.project({ x: origin.x + seg.x * f,
                            y: origin.y + seg.y * f,
                            z: origin.z + seg.z * f });
      if (!p) return null;
      var w = BOLT_R * p.scale * s;
      if (w < BOLT_MIN_W) w = BOLT_MIN_W;
      else if (w > BOLT_MAX_W) w = BOLT_MAX_W;
      out.push({ x: p.x, y: p.y, w: w, depth: p.depth });
    }
    return out;
  }

  function assignHull(kind, id) {
    if (id && !(global.HullLib && global.HullLib[id])) return false;
    if (id) HULL_ASSIGN[kind] = id; else delete HULL_ASSIGN[kind];
    SHIP_MESHES = null;               // rebuilt with the new casting on next use
    /* And the shells with them, or a reassigned class would wear the old
     * hull's field — a form-fitting shield that fits the wrong ship is
     * worse than a sphere. */
    SHELL_MESHES = {};
    return true;
  }

  var LAMP_RINGS = null;
  var DOOR_LEAVES = null;

  /* Radius of the apron slab around a shaft mouth, in pad radii. Sized so
   * the retracted door leaves end up entirely inside it — the leaves ride
   * at z 0.005..0.045 and the apron spans -0.05..0.05, so a leaf that has
   * slid past the mouth is buried in concrete and simply not visible.
   *
   * The apron KEPT ITS SIZE when the shed below it shrank, and that is the
   * point rather than an oversight: a wide concrete field with a normal
   * hangar door in the middle of it is what a working port looks like, and
   * the field is most of what gives the place a sense of scale. */
  var APRON_R = 1.35;

  /* ---- the doors, in MOUTHS rather than in pad radii --------------------
   *
   * Every number below used to be written against a mouth of 0.55 pad
   * radii, which meant the doors silently stopped fitting the day that
   * constant changed — leaves hanging a quarter of a pad radius past a
   * hatch a third the size, teeth combing thin air. They are fractions of
   * whatever the mouth actually is now, read from the one table that
   * decides it, so the hatch and the thing that covers it cannot disagree.
   *
   * Travel is 1.35 mouths: enough that the innermost tooth clears the hole
   * entirely, because a door that is "open" with a finger still over the
   * opening is a door you cannot fly through. */
  function mouthR() {
    var Gen = global.Gen;
    return (Gen && Gen.bayGeometry)
      ? Gen.bayGeometry({ radius: 1, shaftDepth: 1 }).mouthR : 0.20;
  }
  var DOOR_TRAVEL_MOUTHS = 1.35;
  var DOOR_SKIN = '#6d7683';
  var DOOR_HAZARD = '#e0a63a';
  /* Of a mouth: tooth spacing, half-height, and how far a tooth reaches
   * across the centreline into the other leaf's gaps. */
  var TOOTH_PITCH_M = 0.55, TOOTH_HALF_M = 0.13, TOOTH_REACH_M = 0.33;

  /* Draw the approach lamps for a port.
   *
   * `cleared` is the player's actual docking clearance, so the ring is a
   * readout, not decoration: red means the port has not agreed to take you
   * and the doors below it are shut. Once cleared it alternates white and
   * green — a steady green would say "landed", and this is an invitation,
   * not a confirmation. */
  function drawPortLamps(ctx, cam, frame, port, radiusKm, sunDir, cleared, t) {
    if (!port || !port.surface) return;
    stationMeshes();                      // ensures LAMP_RINGS is built
    if (!LAMP_RINGS) return;
    var mesh = !cleared ? LAMP_RINGS.denied
             : (Math.floor(t * 2) % 2 ? LAMP_RINGS.strobe : LAMP_RINGS.clear);
    if (gpuWorld() && global.GLWorld.queueMesh(cam, frame, mesh, radiusKm, sunDir)) return;
    paintMesh(ctx, cam, frame, mesh, radiusKm, sunDir, '#ffcf7a');
  }

  /* Draw the shaft doors at `open` (0 shut, 1 fully retracted).
   *
   * The animation is done to the FRAME, not to the mesh: each leaf is
   * drawn with the bay's own frame slid along its local x by the travel,
   * so one static mesh per leaf covers every position between shut and
   * open. Building a mesh per frame for a slab that never changes shape
   * would be the same picture for a hundred times the work.
   *
   * Fully open the leaves are inside the apron slab and invisible, which
   * is what "recessed under the ground" has to mean when there is no
   * clipping — the concrete is simply in front of them. */
  function drawPortDoors(ctx, cam, frame, port, radiusKm, sunDir, open) {
    if (!port || !port.surface || !frame) return;
    stationMeshes();                      // ensures DOOR_LEAVES is built
    if (!DOOR_LEAVES) return;
    var slide = Math.max(0, Math.min(1, open || 0)) *
                (mouthR() * DOOR_TRAVEL_MOUTHS) * radiusKm;
    for (var i = 0; i < 2; i++) {
      var dir = i ? -1 : 1;
      var shifted = {
        pos: {
          x: frame.pos.x + frame.right.x * slide * dir,
          y: frame.pos.y + frame.right.y * slide * dir,
          z: frame.pos.z + frame.right.z * slide * dir
        },
        fwd: frame.fwd,
        /* The second leaf is the first one turned round, so its teeth run
         * the other way and its slab reaches the other side of the mouth.
         * Negating BOTH in-plane axes is a rotation, not a mirror — a
         * mirror would flip every face's winding. */
        right: i ? { x: -frame.right.x, y: -frame.right.y, z: -frame.right.z } : frame.right,
        up: i ? { x: -frame.up.x, y: -frame.up.y, z: -frame.up.z } : frame.up
      };
      var mesh = DOOR_LEAVES[i];
      if (gpuWorld() && global.GLWorld.queueMesh(cam, shifted, mesh, radiusKm, sunDir)) continue;
      paintMesh(ctx, cam, shifted, mesh, radiusKm, sunDir, DOOR_SKIN);
    }
  }

  /* ---- one hull per kind of ship --------------------------------------- */
  var SHIP_MESHES = null;
  function shipMeshes() {
    if (SHIP_MESHES) return SHIP_MESHES;
    var m;

    /* The trader. Modelled in Claude Design as a three.js scene and
     * translated here part for part — every dimension below is the design's
     * own number, in the design's own units, so the two can be diffed
     * against each other rather than eyeballed.
     *
     * Design space is the same handedness this renderer uses (+z forward,
     * +y up), but it is 4.29 units long and sits on the ground plane, so
     * TRADER_S normalises it to the unit length every hull here is drawn
     * at, and the two centres shift it onto the origin. */
    var courier = traderHull();

    // Shuttle: blunt, short-ranged, obviously not built to go far.
    var shuttle = emptyMesh();
    merge(shuttle, tube(6, 0.20, 0.13, 0.44, true), 0, 0, 0.02);
    merge(shuttle, box(0.30, 0.015, 0.09), 0, -0.06, -0.20);      // stub wings
    merge(shuttle, box(0.10, 0.10, 0.07), 0, 0, -0.47);           // engine block

    // Freighter: a bridge, a long cargo spine, and engines. The silhouette
    // that should read as "slow and full of things worth taking".
    var freighter = emptyMesh();
    merge(freighter, box(0.09, 0.09, 0.09), 0, 0.04, 0.41);       // bridge
    merge(freighter, box(0.05, 0.05, 0.16), 0, 0.01, 0.20);       // neck
    merge(freighter, box(0.26, 0.20, 0.30), 0, 0, -0.08);         // cargo
    merge(freighter, box(0.20, 0.15, 0.09), 0, 0, -0.45);         // engines

    // Tanker: one enormous pressure vessel with a cab on the front.
    var tanker = emptyMesh();
    merge(tanker, tube(8, 0.26, 0.26, 0.34, true), 0, 0, -0.08);
    merge(tanker, tube(8, 0.26, 0.10, 0.10, true), 0, 0, 0.34);   // nose taper
    merge(tanker, box(0.07, 0.07, 0.06), 0, 0.10, 0.46);          // cab
    merge(tanker, tube(6, 0.16, 0.16, 0.06, true), 0, 0, -0.47);  // engine ring

    // Waste hauler: a small tug with a shielded canister slung underneath,
    // which is exactly how you would build one and reads instantly.
    var hauler = emptyMesh();
    merge(hauler, box(0.15, 0.13, 0.26), 0, 0.10, 0.06);
    merge(hauler, tube(6, 0.15, 0.15, 0.24, true), 0, -0.17, -0.02);
    merge(hauler, box(0.11, 0.09, 0.07), 0, 0.10, -0.45);

    // Police interceptor: a needle. Nothing else about the shape matters.
    var police = emptyMesh();
    merge(police, tube(6, 0.10, 0.02, 0.50, true), 0, 0, 0);
    merge(police, box(0.03, 0.16, 0.12), -0.09, 0.04, -0.40);     // canted fins
    merge(police, box(0.03, 0.16, 0.12), 0.09, 0.04, -0.40);
    merge(police, box(0.10, 0.03, 0.10), 0, -0.07, -0.42);

    // Mercenary: armoured centre pod between two drive booms.
    var merc = emptyMesh();
    merge(merc, box(0.13, 0.12, 0.34), 0, 0, 0.02);
    merge(merc, tube(6, 0.07, 0.05, 0.40, true), -0.22, -0.02, -0.04);
    merge(merc, tube(6, 0.07, 0.05, 0.40, true), 0.22, -0.02, -0.04);
    merge(merc, box(0.24, 0.02, 0.08), 0, 0.06, 0.10);            // dorsal spine

    // Pirate: broad, angular, asymmetric, with a ram. It should look wrong.
    var pirate = emptyMesh();
    merge(pirate, box(0.24, 0.10, 0.28), 0, 0, -0.02);
    merge(pirate, tube(4, 0.10, 0.01, 0.22, true), 0, 0.01, 0.36);  // ram spike
    merge(pirate, box(0.05, 0.20, 0.14), -0.26, 0.06, -0.14);       // one big fin
    merge(pirate, box(0.04, 0.09, 0.10), 0.24, -0.03, -0.20);       // and a smaller one
    merge(pirate, box(0.16, 0.07, 0.06), 0, -0.06, -0.42);

    SHIP_MESHES = {
      courier: courier, trade: courier,
      shuttle: shuttle, freighter: freighter, tanker: tanker, hauler: hauler,
      police: police, merc: merc, pirate: pirate
    };

    /* Imported models take over any class they are assigned to; the
     * procedural hulls above remain the fallback for anything the library
     * does not cover — so the game runs identically with hulls.js absent. */
    for (var kind in HULL_ASSIGN) {
      var imported = libHull(HULL_ASSIGN[kind]);
      if (imported) SHIP_MESHES[kind] = imported;
    }
    return SHIP_MESHES;
  }

  /* ---- wreckage ----------------------------------------------------------
   * A FIXED POOL, BUILT ONCE, AND THAT IS THE WHOLE DESIGN CONSTRAINT.
   *
   * gl.js caches its GPU buffers ON THE MESH OBJECT (`mesh._gl`) — see the
   * note there about object identity being what makes the cache work. So a
   * unique mesh per shard would upload a fresh vertex buffer for every
   * fragment of every kill and never free one: a leak that grows with the
   * body count, on a machine with integrated graphics. Exactly why
   * SHIP_MESHES is memoised, and the same answer — build a handful, then
   * instance them at different scales, spins and tints. Eight shapes is
   * plenty; nobody has ever counted the pieces of an explosion.
   *
   * SEEDED, LIKE EVERYTHING ELSE. One fixed stream, not the system's, because
   * the pool is a property of the GAME rather than of any place in it — the
   * same eight shards should exist in every system of every seed, the way
   * every hull model does. What varies per kill is which of them you get and
   * how they are thrown, and THAT is hashed off the victim (see sim.js).
   *
   * Built by jittering a box's eight corners rather than by writing out
   * vertices: a hull plate torn off a ship is a flat-ish irregular quad with
   * a couple of bent edges, which is what a distorted box already is, and it
   * keeps the closed topology that the face-sorting painter needs. One
   * corner of each is pinched hard toward its neighbour, which turns the
   * cube into a wedge and stops the pool reading as eight dice. */
  var SHARD_MESHES = null;
  var SHARD_COUNT = 8;

  function shardMeshes() {
    if (SHARD_MESHES) return SHARD_MESHES;
    var rng = new RNG('debris-shards');
    var out = [];
    for (var s = 0; s < SHARD_COUNT; s++) {
      /* Plate-ish: appreciably wider than it is thick. A shard that is
       * roughly cubical tumbles into a dot and reads as a speck of dirt on
       * the canopy rather than as part of a ship. */
      var hx = rng.range(0.30, 0.50);
      var hy = rng.range(0.06, 0.16);
      var hz = rng.range(0.24, 0.55);
      var m = box(hx, hy, hz);
      for (var v = 0; v < m.v.length; v++) {
        m.v[v][0] += rng.range(-hx * 0.42, hx * 0.42);
        m.v[v][1] += rng.range(-hy * 0.55, hy * 0.55);
        m.v[v][2] += rng.range(-hz * 0.42, hz * 0.42);
      }
      /* Pinch one corner onto the far side of the plate: the torn edge. */
      var pick = rng.int(0, 7), toward = (pick + 2) % 8;
      for (var a = 0; a < 3; a++) {
        m.v[pick][a] += (m.v[toward][a] - m.v[pick][a]) * rng.range(0.55, 0.85);
      }
      out.push(m);
    }
    SHARD_MESHES = out;
    return SHARD_MESHES;
  }

  /* ---- shields -----------------------------------------------------------
   * A shield is not a sphere around the ship. It is a skin: the hull's own
   * shape, held off the plating by about the width of a medium engine bell.
   * A bubble would be simpler and would look like every other game's bubble;
   * a form-fitting shell says what this one is — a field projected FROM the
   * hull, so it has the hull's silhouette, which is also the one piece of
   * information this renderer's whole mesh design says survives at combat
   * distances.
   *
   * FIRST ATTEMPT: INFLATE THE HULL along its vertex normals — a true offset
   * surface, the hull's exact shape pushed out. It looked right and it was
   * measured and it is gone, because the imported models are not low-poly at
   * all:
   *
   *     courier    2,352 faces   1.76 ms      <- ONE shell, one frame
   *     police     2,472         2.08
   *     navy       3,112         1.92
   *     freighter  5,180         3.59
   *     tanker     6,144         4.81
   *     four shielded ships in view          12.20 ms/frame
   *
   * Against a renderer that costs about 3 ms for everything else it draws,
   * and on a machine faster than the Latitude this ships on. One tanker's
   * field cost more than the entire rest of the frame. That is not a
   * threshold to tune, it is a design that does not fit.
   *
   * WHERE IT LANDED, measured the same way:
   *
   *     any hull      196 faces   0.09-0.25 ms
   *     four shielded ships in view          0.51 ms/frame
   *
   * Twenty-four times cheaper, and about a sixth of the rest of the
   * renderer rather than four times it. Two changes got that, and the
   * second one mattered more than the face count: the resolution is now
   * fixed at 196 triangles whatever the model, AND the vertices are
   * transformed and projected ONCE each instead of once per face that uses
   * them — six times over, with three allocations each time.
   *
   * SO THE SHELL IS A ROUNDED BOX FITTED TO THE HULL, at a resolution this
   * file chooses rather than one the modeller chose. A superellipsoid —
   * |x/a|^p + |y/b|^p + |z/c|^p = 1 — with p = 4, which is a box with
   * generously rounded edges. Fitted to the hull's own half-extents plus the
   * standoff, so it still follows the ship's PROPORTIONS: an interceptor's
   * field is long and thin, a tanker's is fat. That is what "form-fitting
   * rather than a bubble" has to mean at a cost that fits, and a smooth
   * surface arguably suits a field better than a faceted one did.
   *
   * p = 4 rather than 2 is the point. A plain ellipsoid inscribed in a boxy
   * hull leaves the corners of the plating sticking out through the field;
   * at p = 4 the shell hugs a box closely enough that nothing pokes through
   * without it ballooning at the flat faces.
   *
   * HOW FAR OUT IS A REAL NUMBER. The hull is normalised to length one and
   * drawn at SHIP_LEN. A medium drive bell in these
   * models runs 0.07 to 0.10 in radius — the merc's booms are tube(6, 0.07,
   * ...) and the tanker's ring 0.16 — so a bell's width is around 0.14 and
   * the standoff is a shade under that. That is about 5% of the hull's
   * length of clear air between plating and field — a shade over a metre on
   * the courier as drawn today — which is close enough to
   * read as a skin rather than a balloon and far enough to be visibly not
   * touching. It scales with the hull, so a 240 m naval cutter carries a
   * proportionally identical field rather than the same absolute gap.
   *
   * ON THE GPU THIS WOULD ALL BE FREE. Two thousand triangles is nothing for
   * a graphics card, and a per-FRAGMENT fresnel and flare would look better
   * than the per-face version below. It is the right long-term home for this
   * and it is deliberately not done yet: gl.js has no translucent pass at
   * all — no blend state, no depth-write-off ordering, no shader for it — and
   * this file's own rule is that the 2D path stays a complete renderer in
   * its own right, so the cheap version has to exist regardless. Doing the
   * GPU pass buys back the exact hull shape; it does not remove the need for
   * what is here.
   *
   * MEMOISED PER MODEL, and that is not an optimisation. gl.js caches its
   * GPU buffers on the mesh object, so a shell generated per ship would
   * upload a vertex buffer per ship per frame and never free one — the same
   * leak the shard pool exists to avoid, on a machine with integrated
   * graphics. One shell per hull kind, for the life of the process. */
  var SHIELD_STANDOFF = 0.12;
  var SHELL_LON = 14;         // segments around
  var SHELL_LAT = 8;          // rings from pole to pole
  var SHELL_P = 4;            // superellipsoid exponent: 2 is an egg, 4 a rounded box
  var SHELL_MESHES = {};

  /* The hull's half-extents, which is what the field has to clear. */
  function halfExtents(mesh) {
    var hx = 0, hy = 0, hz = 0;
    for (var i = 0; i < mesh.v.length; i++) {
      var p = mesh.v[i];
      if (Math.abs(p[0]) > hx) hx = Math.abs(p[0]);
      if (Math.abs(p[1]) > hy) hy = Math.abs(p[1]);
      if (Math.abs(p[2]) > hz) hz = Math.abs(p[2]);
    }
    /* A floor, because a couple of the imported models are nearly flat on
     * one axis and a zero semi-axis is a degenerate surface. */
    return [Math.max(hx, 0.02), Math.max(hy, 0.02), Math.max(hz, 0.02)];
  }

  function shellMesh(kind) {
    var k = kind || 'courier';
    if (SHELL_MESHES[k]) return SHELL_MESHES[k];
    var hull = shipMeshes()[k] || shipMeshes().courier;
    var e = halfExtents(hull);
    var a = e[0] + SHIELD_STANDOFF, b = e[1] + SHIELD_STANDOFF,
        c = e[2] + SHIELD_STANDOFF;

    /* A lat/long sphere pushed onto the superellipsoid. Generating the
     * sphere first and solving for the radius along each direction keeps the
     * topology trivially correct — poles included — where the closed-form
     * superellipsoid parametrisation has to special-case them. */
    var LON = SHELL_LON, LAT = SHELL_LAT, ip = 1 / SHELL_P;
    var v = [], f = [], dirs = [], i, j;

    function push(dx, dy, dz) {
      var t = Math.pow(Math.pow(Math.abs(dx / a), SHELL_P) +
                       Math.pow(Math.abs(dy / b), SHELL_P) +
                       Math.pow(Math.abs(dz / c), SHELL_P), -ip);
      v.push([dx * t, dy * t, dz * t]);
    }

    /* Rings, poles included as single vertices so there are no slivers. */
    push(0, 0, -1);                                     // 0: aft pole
    for (j = 1; j < LAT; j++) {
      var th = Math.PI * (j / LAT);
      var sz = -Math.cos(th), sr = Math.sin(th);
      for (i = 0; i < LON; i++) {
        var ph = K.TAU * (i / LON);
        push(sr * Math.cos(ph), sr * Math.sin(ph), sz);
      }
    }
    push(0, 0, 1);                                      // last: forward pole
    var top = v.length - 1;

    function ring(j, i) { return 1 + (j - 1) * LON + (i % LON); }

    for (i = 0; i < LON; i++) f.push([0, ring(1, i + 1), ring(1, i)]);
    for (j = 1; j < LAT - 1; j++) {
      for (i = 0; i < LON; i++) {
        var A = ring(j, i), B = ring(j, i + 1);
        var C = ring(j + 1, i + 1), D = ring(j + 1, i);
        f.push([A, B, C]); f.push([A, C, D]);
      }
    }
    for (i = 0; i < LON; i++) f.push([top, ring(LAT - 1, i), ring(LAT - 1, i + 1)]);

    /* Which way each face lies from the ship's own centre, as a unit vector
     * in the hull's frame. Cached with the mesh because it never changes,
     * and it does double duty: the impact maths needs it, and it stands in
     * for the face NORMAL in the fresnel term. On a star-shaped surface like
     * this one the two are close enough that the difference is invisible in
     * a soft edge-brightness term, and using it saves a cross product and
     * two allocations per face per frame. */
    for (i = 0; i < f.length; i++) {
      var fa = v[f[i][0]], fb = v[f[i][1]], fc = v[f[i][2]];
      var cx = (fa[0] + fb[0] + fc[0]) / 3;
      var cy = (fa[1] + fb[1] + fc[1]) / 3;
      var cz = (fa[2] + fb[2] + fc[2]) / 3;
      var l = Math.sqrt(cx * cx + cy * cy + cz * cz) || 1;
      dirs.push([cx / l, cy / l, cz / l]);
    }

    SHELL_MESHES[k] = { v: v, f: f, dirs: dirs, semi: [a, b, c] };
    return SHELL_MESHES[k];
  }

  /* ---- what colour a shield is, and why it changes -----------------------
   * A shield that looks the same at full charge and at its last two points
   * is a shield you cannot read, and the number lives on a panel you are not
   * looking at during a fight. So the field itself is the gauge: it runs
   * from a cold blue-white when it is holding, through amber as it goes, to
   * a hot red when it is nearly down.
   *
   * The direction is not arbitrary. Cool-to-hot is the same language every
   * other overheating thing in this game uses — the hull temperature bar,
   * the re-entry glow, the drive plume — so it needs no explanation the
   * first time you see it: a field going red is a field working too hard.
   *
   * Returns '#rrggbb'. `frac` is charge remaining, 1 down to 0. */
  var SHIELD_STOPS = [
    [0.00, 255, 92, 74],      // nearly down — hot, and unmistakable
    [0.35, 255, 168, 74],     // going
    [0.70, 120, 226, 255],    // holding
    [1.00, 186, 244, 255]     // full — almost white
  ];

  function shieldTint(frac) {
    var f = frac < 0 ? 0 : (frac > 1 ? 1 : frac);
    var lo = SHIELD_STOPS[0], hi = SHIELD_STOPS[SHIELD_STOPS.length - 1], i;
    for (i = 0; i < SHIELD_STOPS.length - 1; i++) {
      if (f >= SHIELD_STOPS[i][0] && f <= SHIELD_STOPS[i + 1][0]) {
        lo = SHIELD_STOPS[i]; hi = SHIELD_STOPS[i + 1];
        break;
      }
    }
    var span = hi[0] - lo[0];
    var u = span > 1e-9 ? (f - lo[0]) / span : 0;
    var r = Math.round(lo[1] + (hi[1] - lo[1]) * u);
    var g = Math.round(lo[2] + (hi[2] - lo[2]) * u);
    var b = Math.round(lo[3] + (hi[3] - lo[3]) * u);
    return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
  }

  /* ---- how bright a point on the shell is, this instant -------------------
   * The impact animation, and the whole of it is one expression.
   *
   * A hit lands, the field goes bright and opaque where it was struck, and
   * that energy spreads out into the rest of the bubble and dissipates. So:
   * a bump centred on the impact whose WIDTH GROWS from a spot to the whole
   * shell while its HEIGHT DECAYS. Early it is a hard bright point; halfway
   * it is a spreading glow; at the end it is a faint even wash over
   * everything, and then nothing. Spot, spread, dissipate, in one curve —
   * no ring to tune, no per-vertex state to store, and exact at any t, which
   * is the same property the rails and the market have and for the same
   * reason.
   *
   * WORKED IN COSINE, NOT ANGLE. The caller has a dot product already; an
   * acos per face per impact per frame would be the most expensive thing
   * here and it buys nothing, because the curve is arbitrary anyway.
   * `cosd` is 1 at the impact and -1 opposite it. */
  var SHIELD_FLASH_LIFE = 0.55;   // s — a splash, not a light show
  var SHIELD_SPOT0 = 0.22;        // initial width, in units of (1 - cos)

  function shellFlare(cosd, age) {
    if (!(age >= 0) || age > SHIELD_FLASH_LIFE) return 0;
    var u = age / SHIELD_FLASH_LIFE;
    /* Width grows toward 2, which is the full (1 - cos) range — by then the
     * bump covers the entire shell and IS the dissipated glow. */
    var w = SHIELD_SPOT0 + (2.2 - SHIELD_SPOT0) * Math.pow(u, 0.55);
    var amp = Math.pow(1 - u, 1.6);
    var d = (1 - cosd) / w;
    return amp * Math.exp(-d * d);
  }

  /* ---- and the shell, drawn ----------------------------------------------
   * NOT through paintMesh, and not through the GPU layer either. paintMesh
   * paints opaque, sorted, lit triangles, which is the opposite of what a
   * field is; queueMesh has no alpha at all. So the shell is its own pass on
   * the 2D canvas over the world, exactly where the beams and the wreckage
   * already draw.
   *
   * ADDITIVE, AND THAT DOES THE WORK FOR FREE. Under 'lighter' the faces
   * that overlap along the silhouette add up, so the rim comes out bright
   * without a rim term — which is how a real field reads, because that is
   * where you are looking through the most of it. The explicit fresnel below
   * only leans into what the geometry is already doing.
   *
   * `charge` is 0..1 of shield remaining, and drives the hue through
   * shieldTint: a field going red is a field about to stop being a field.
   * `lit` is how visible the shell is at all right now — the answer to
   * "faint only when charged and recently hit" — and the caller owns it,
   * because only the caller knows how long ago the last hit was.
   *
   * `impacts` are {dir, at} in WORLD space; they are converted into the
   * hull's frame once here rather than per face, which is the difference
   * between three dot products and three hundred. */
  function drawShellField(ctx, cam, frame, lengthKm, kind, charge, lit,
                          impacts, tSec) {
    if (!(lit > 0.004)) return 0;
    var shell = shellMesh(kind);
    var col = shieldTint(charge);
    var n = parseInt(col.slice(1), 16);
    var cr = (n >> 16) & 255, cg = (n >> 8) & 255, cb = n & 255;

    /* Impact directions in the hull's own axes. The frame's basis is
     * orthonormal, so the inverse rotation is just three dots against it. */
    var loc = [], i, j;
    if (impacts) {
      for (i = 0; i < impacts.length; i++) {
        var im = impacts[i];
        var age = tSec - im.at;
        if (!(age >= 0) || age > SHIELD_FLASH_LIFE) continue;
        var d = im.dir;
        if (!d) {
          /* No direction — a warhead, or a shooter that has stopped
           * existing. Toward the camera, so the flare is at least somewhere
           * the player can see rather than arbitrarily on the far side. */
          d = V.norm(V.sub(cam.eye, frame.pos));
        }
        loc.push({
          x: V.dot(d, frame.right), y: V.dot(d, frame.up), z: V.dot(d, frame.fwd),
          age: age, power: im.shield > 0 ? 1 : 0.45
        });
      }
    }

    /* VERTICES ONCE, NOT PER FACE. Each vertex is shared by about six
     * triangles, so transforming and projecting inside the face loop did all
     * of this six times over and allocated three objects each time round.
     * Flat arrays and no allocation at all is the single biggest saving in
     * this function — bigger than dropping the face count was. */
    var nv = shell.v.length;
    var sx = new Array(nv), sy = new Array(nv), ok = new Array(nv);
    for (i = 0; i < nv; i++) {
      var p = shell.v[i];
      var wp = localToWorld(frame, p[0] * lengthKm, p[1] * lengthKm, p[2] * lengthKm);
      var pr = cam.project(wp);
      if (pr) { sx[i] = pr.x; sy[i] = pr.y; ok[i] = 1; } else { ok[i] = 0; }
    }

    /* Which way the camera lies, in the HULL's axes — once, for the whole
     * ship. The fresnel below is then a dot product against the precomputed
     * face directions, with no cross products and no allocations in the
     * loop. Treating the whole ship as having one view direction is exact at
     * any range where the ship is small against the camera distance, which
     * is every range a ship is ever drawn at. */
    var toEye = V.norm(V.sub(cam.eye, frame.pos));
    var ex = V.dot(toEye, frame.right);
    var ey = V.dot(toEye, frame.up);
    var ez = V.dot(toEye, frame.fwd);

    var drawn = 0;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (i = 0; i < shell.f.length; i++) {
      var f = shell.f[i];
      var i0 = f[0], i1 = f[1], i2 = f[2];
      if (!ok[i0] || !ok[i1] || !ok[i2]) continue;

      /* Edge-on is brighter. A field is a surface you see THROUGH, so the
       * amount of it between you and the far side is what you are looking
       * at, and that is greatest where the surface turns away. */
      var fd = shell.dirs[i];
      var facing = fd[0] * ex + fd[1] * ey + fd[2] * ez;
      if (facing < 0) facing = -facing;
      var fres = 0.16 + 0.84 * (1 - facing) * (1 - facing);

      /* And brighter still where it has just been hit. */
      var fl = 0;
      for (j = 0; j < loc.length; j++) {
        var L = loc[j];
        fl += L.power * shellFlare(fd[0] * L.x + fd[1] * L.y + fd[2] * L.z, L.age);
      }

      var alpha = lit * (0.055 * fres + 0.50 * fl);
      if (alpha < 0.004) continue;
      if (alpha > 0.92) alpha = 0.92;

      /* The flare washes toward white as it peaks — energy arriving, rather
       * than more of the same colour. */
      var wash = fl > 1 ? 1 : fl;
      var r = Math.round(cr + (255 - cr) * wash * 0.7);
      var g = Math.round(cg + (255 - cg) * wash * 0.7);
      var bl = Math.round(cb + (255 - cb) * wash * 0.7);

      ctx.fillStyle = 'rgba(' + r + ',' + g + ',' + bl + ',' + alpha.toFixed(3) + ')';
      ctx.beginPath();
      ctx.moveTo(sx[i0], sy[i0]);
      ctx.lineTo(sx[i1], sy[i1]);
      ctx.lineTo(sx[i2], sy[i2]);
      ctx.closePath();
      ctx.fill();
      drawn++;
    }
    ctx.restore();
    return drawn;
  }

  /* One shard, at whatever size and attitude the sim says. Same shape as
   * drawHullModel, and it hands off to the GPU for the same reason: the
   * fallback painter has to stay a complete renderer in its own right. */
  function drawShardModel(ctx, cam, frame, lengthKm, sunDir, tint, index) {
    var pool = shardMeshes();
    var mesh = pool[((index | 0) % pool.length + pool.length) % pool.length];
    if (gpuWorld() && global.GLWorld.queueMesh(cam, frame, mesh, lengthKm, sunDir)) return;
    paintMesh(ctx, cam, frame, mesh, lengthKm, sunDir, tint);
  }

  /* ---- one model per kind of station ------------------------------------
   * Keyed by the port's economic role, so what a place DOES is legible from
   * orbit before you have read a single word of its market. Normalised to
   * radius 1; z is the spin axis for anything that turns. */
  var STATION_MESHES = null;
  function stationMeshes() {
    if (STATION_MESHES) return STATION_MESHES;

    /* Ordinary orbital port: a wheel. The hub is sized to CONTAIN the hall
     * that Gen.stationBay describes — chamber corner at 0.328, hatch face at
     * 0.40 — because a hangar poking out through the outside of its own
     * station is the one scale error you can see from a screenshot. If that
     * table grows, this grows with it. */
    var orbital = emptyMesh();
    merge(orbital, rimRing(12, 0.82, 0.16, 0.16), 0, 0, 0);
    merge(orbital, spokes(4, 0.12, 0.70, 0.045), 0, 0, 0);
    merge(orbital, tube(8, 0.36, 0.36, 0.50, true), 0, 0, 0);

    // Highport: bigger, double-ringed, with docking arms along the axis.
    var highport = emptyMesh();
    merge(highport, rimRing(16, 0.90, 0.13, 0.13), 0, 0, 0.30);
    merge(highport, rimRing(16, 0.66, 0.10, 0.10), 0, 0, -0.32);
    merge(highport, spokes(6, 0.14, 0.80, 0.04), 0, 0, 0.30);
    merge(highport, tube(8, 0.20, 0.20, 0.62, true), 0, 0, 0);
    merge(highport, box(0.06, 0.06, 0.24), 0, 0, 0.84);

    // Refinery: tank farm on a spine.
    var refinery = emptyMesh();
    merge(refinery, tube(6, 0.10, 0.10, 0.85, true), 0, 0, 0);
    [0, 1, 2].forEach(function (i) {
      var a = (i / 3) * K.TAU;
      merge(refinery, tube(8, 0.26, 0.26, 0.34, true),
            Math.cos(a) * 0.48, Math.sin(a) * 0.48, 0.10);
    });
    merge(refinery, box(0.14, 0.14, 0.10), 0, 0, -0.80);

    // Shipyard: an open gantry. Mostly holes, which is the point.
    var shipyard = emptyMesh();
    [[-0.7, -0.7], [0.7, -0.7], [0.7, 0.7], [-0.7, 0.7]].forEach(function (c) {
      merge(shipyard, box(0.05, 0.05, 0.85), c[0], c[1], 0);
    });
    [-0.8, 0, 0.8].forEach(function (z) {
      merge(shipyard, box(0.75, 0.05, 0.05), 0, -0.7, z);
      merge(shipyard, box(0.75, 0.05, 0.05), 0, 0.7, z);
      merge(shipyard, box(0.05, 0.75, 0.05), -0.7, 0, z);
      merge(shipyard, box(0.05, 0.75, 0.05), 0.7, 0, z);
    });
    merge(shipyard, box(0.16, 0.16, 0.16), 0, 0, 0.55);

    // Agricultural co-op: an O'Neill cylinder, turning for gravity.
    var agri = emptyMesh();
    merge(agri, tube(10, 0.45, 0.45, 0.85, true), 0, 0, 0);
    merge(agri, rimRing(10, 0.52, 0.06, 0.05), 0, 0, 0.55);
    merge(agri, rimRing(10, 0.52, 0.06, 0.05), 0, 0, -0.55);
    merge(agri, box(0.08, 0.08, 0.14), 0, 0, 0.95);

    // Mining head: a captured rock with machinery bolted to it.
    var mining = emptyMesh();
    merge(mining, tube(7, 0.62, 0.48, 0.52, true), 0, 0, 0, [1, 0.78, 1]);
    merge(mining, box(0.20, 0.18, 0.16), 0.42, 0.30, 0.30);
    merge(mining, box(0.14, 0.12, 0.30), -0.40, -0.18, -0.20);
    merge(mining, tube(6, 0.07, 0.07, 0.55, true), 0, 0.42, 0.30);

    // Reprocessing plant: a shielded drum with cooling fins. Nobody has
    // spent a credit on making it look like anything else.
    var reprocessing = emptyMesh();
    merge(reprocessing, tube(8, 0.42, 0.42, 0.62, true), 0, 0, 0);
    [0, 1, 2, 3].forEach(function (i) {
      var a = (i / 4) * K.TAU + 0.4;
      merge(reprocessing, box(0.30, 0.02, 0.40),
            Math.cos(a) * 0.62, Math.sin(a) * 0.62, 0);
    });
    merge(reprocessing, tube(6, 0.16, 0.16, 0.20, true), 0, 0, 0.75);

    /* Surface starport: a pad, a control tower and a hab dome. Built flat
     * in xy and stood up by the caller, because on the ground "up" is a
     * direction the world decides, not the station. */
    var surface = emptyMesh();
    merge(surface, tube(8, 1.00, 1.00, 0.05, true), 0, 0, 0);       // apron
    merge(surface, tube(8, 0.30, 0.30, 0.10, true), 0, 0, 0.12);    // pad
    merge(surface, box(0.08, 0.08, 0.34), -0.62, 0.40, 0.34);       // tower
    merge(surface, box(0.14, 0.14, 0.09), -0.62, 0.40, 0.70);       // tower cab
    merge(surface, tube(7, 0.28, 0.16, 0.14, true), 0.55, -0.42, 0.16); // dome
    merge(surface, box(0.34, 0.10, 0.07), 0.10, 0.62, 0.10);        // sheds

    /* Underground bay: a lit collar around a hole in the ground, a shaft
     * dropping away from it, and a chamber at the bottom with a pad and a
     * couple of support pillars. Built along the same +z-is-up axis as
     * "surface" above, but where that one only ever goes positive (up off
     * the apron), this one goes negative too (down the shaft) — the caller
     * hangs it from the ENTRANCE point (elevation 0), not the bay's own
     * position, so the collar sits exactly on the visible ground and
     * everything else is drawn correctly behind/below it.
     *
     * Every instance shares this one mesh: shaft depth and width are fixed
     * multiples of pad radius (see UNDERGROUND_DEPTH/TUNNEL in generate.js)
     * specifically so one normalised model can serve every bay in the
     * galaxy, the same way "orbital" serves every wheel station. */
    /* One builder, two depths. EVERY starport is this shape now — a collar
     * standing proud of the ground, a shaft, and a hangar at the bottom —
     * and the only difference between an ordinary field and a deep bay is
     * how far down the hangar is. `tube`'s fourth argument is a HALF-length
     * and the tube is centred on its own origin, which is why the shaft is
     * built at depth/2 with half-length depth/2: that lands it spanning
     * exactly 0 down to -depth, matching where the sim berths the ship. */
    function bayMesh(depth) {
      var Gen = global.Gen;
      var g = Gen && Gen.bayGeometry
        ? Gen.bayGeometry({ radius: 1, shaftDepth: depth })
        : { depth: depth, mouthR: 0.55, throatR: 0.45,
            chamberX: 1.30, chamberY: 0.80,
            floorZ: -depth, ceilZ: -depth + 0.36, berthY: 0.60,
            standoff: 0.012, berths: 6, lift: 0.04 };
      var m = emptyMesh();
      var i, t;

      /* THE APRON. Square, and deliberately not one square: a big slab with
       * a second, offset one laid over a corner of it, so the outline has a
       * step in it and does not read as a stamped shape. Wider than the hole
       * by more than the doors are long, because the leaves retract INTO it
       * — an apron that only just cleared the collar would leave two slabs
       * lying on the ground whenever the port was open. */
      var ax = APRON_R, ay = APRON_R * 0.82, mr = g.mouthR;
      /* Four panels around the hatch, NOT one slab with the hatch painted
       * on it: the apron has a hole in it, and a solid slab is a lid. This
       * was the whole reason an open port still looked shut — the doors
       * retracted correctly and the concrete above them did not move. */
      merge(m, box(ax, (ay - mr) / 2, 0.05), 0, (ay + mr) / 2, 0);
      merge(m, box(ax, (ay - mr) / 2, 0.05), 0, -(ay + mr) / 2, 0);
      merge(m, box((ax - mr) / 2, mr, 0.05), (ax + mr) / 2, 0, 0);
      merge(m, box((ax - mr) / 2, mr, 0.05), -(ax + mr) / 2, 0, 0);
      // Two more slabs laid over the corners, so the outline has a step in
      // it and does not read as a stamped shape.
      merge(m, box(ax * 0.45, ay * 0.42, 0.052), -ax * 0.70, ay * 0.95, 0);
      merge(m, box(ax * 0.30, ay * 0.26, 0.052), ax * 0.85, -ay * 0.80, 0);

      /* THE COLLAR: four beams framing a square hatch, standing proud. */
      var cr = g.mouthR + 0.07;
      for (i = 0; i < 4; i++) {
        var sgn = i < 2 ? 1 : -1;
        if (i % 2 === 0) merge(m, box(cr, 0.07, 0.05), 0, sgn * cr, 0.03);
        else merge(m, box(0.07, cr, 0.05), sgn * cr, 0, 0.03);
      }

      /* THE SHAFT: a square duct, four walls, tapering slightly inward so
       * the descent reads as going somewhere rather than as a lift tube.
       * Built as four slabs because a duct is four walls. */
      var duct = (g.mouthR + g.throatR) / 2;
      for (i = 0; i < 4; i++) {
        var ds = i < 2 ? 1 : -1;
        if (i % 2 === 0) merge(m, box(duct, 0.03, depth / 2), 0, ds * duct, -depth / 2);
        else merge(m, box(0.03, duct, depth / 2), ds * duct, 0, -depth / 2);
      }

      /* THE SHED. Floor slab, four walls, and a ceiling made of four
       * panels around a square hole — not one lid, because a lid would
       * seal the shaft off from underneath and standing in the hangar you
       * would be looking at a ceiling where the way out should be. */
      var hx = g.chamberX, hy = g.chamberY;
      var midZ = (g.floorZ + g.ceilZ) / 2, halfH = (g.ceilZ - g.floorZ) / 2;
      merge(m, box(hx, hy, 0.04), 0, 0, g.floorZ - 0.04);              // floor
      merge(m, box(hx, 0.03, halfH), 0, hy, midZ);                     // walls
      merge(m, box(hx, 0.03, halfH), 0, -hy, midZ);
      merge(m, box(0.03, hy, halfH), hx, 0, midZ);
      merge(m, box(0.03, hy, halfH), -hx, 0, midZ);
      // Ceiling: four panels leaving a square opening for the duct.
      var op = g.throatR;
      merge(m, box(hx, (hy - op) / 2, 0.02), 0, (hy + op) / 2, g.ceilZ);
      merge(m, box(hx, (hy - op) / 2, 0.02), 0, -(hy + op) / 2, g.ceilZ);
      merge(m, box((hx - op) / 2, op, 0.02), (hx + op) / 2, 0, g.ceilZ);
      merge(m, box((hx - op) / 2, op, 0.02), -(hx + op) / 2, 0, g.ceilZ);
      // Roof trusses across the shed, so the ceiling has something in it.
      for (i = -2; i <= 2; i++) {
        if (Math.abs(i) < 1) continue;
        merge(m, box(0.035, hy, 0.035), i * hx * 0.42, 0, g.ceilZ - 0.05);
      }

      /* THE BERTHS: alcoves cut into the two long walls, each with its own
       * plate and a lit marker. Berth 0 is the large one and gets a wider
       * mouth and a deeper bay; the rest take a small or a medium without
       * caring which, exactly as asked. */
      var Gen2 = global.Gen;
      for (var bi = 0; bi < g.berths; bi++) {
        var off = Gen2 && Gen2.berthOffset
          ? Gen2.berthOffset({ radius: 1, shaftDepth: depth }, bi) : null;
        if (!off) continue;
        var big = off.large;
        var bw = big ? 0.22 : 0.15;        // along the wall
        var bd = big ? 0.20 : 0.14;        // into it
        var side = off.y > 0 ? 1 : -1;
        var wallY = side * hy;
        // The alcove itself: a recess box pushed out through the wall.
        merge(m, box(bw, bd, halfH * 0.55),
              off.x, wallY + side * bd, g.floorZ + halfH * 0.55);
        // The plate the ship stands on, proud of the floor so it reads.
        merge(m, box(bw * 0.8, bd * 0.8, 0.006), off.x, off.y, g.floorZ + 0.006);
        // Marker light over the mouth of the berth: amber for the large bay.
        merge(m, box(bw * 0.55, 0.012, 0.012), off.x, wallY, g.floorZ + 0.16, 1,
              big ? '!#ffb45c' : '!#dff0ff');
      }

      /* LAMPS. Sizes are in pad radii and a pad radius is about 150 m, so
       * 0.014 is a couple of metres — a light fitting, not a building. */
      for (i = -3; i <= 3; i++) {
        merge(m, box(0.05, 0.012, 0.008), i * hx * 0.28, hy * 0.55, g.ceilZ - 0.03,
              1, '!#bcd8ff');
        merge(m, box(0.05, 0.012, 0.008), i * hx * 0.28, -hy * 0.55, g.ceilZ - 0.03,
              1, '!#bcd8ff');
      }
      /* And a ladder of lights down two corners of the duct, so the
       * descent is lit the whole way rather than going dark between the
       * mouth and the floor. */
      for (t = 1; t <= 5; t++) {
        var lz = -depth * (t / 6);
        merge(m, box(0.02, 0.02, 0.006), duct - 0.03, duct - 0.03, lz, 1, '!#9fd8ff');
        merge(m, box(0.02, 0.02, 0.006), -(duct - 0.03), -(duct - 0.03), lz, 1, '!#9fd8ff');
      }
      return m;
    }

    /* ---- the inside of an orbital station ---------------------------------
     *
     * The sibling of bayMesh, and built from the sibling table: where a
     * starport is a shaft cut DOWN into rock, a station is a hall cut IN
     * along the hub axis. Gen.stationBay hands back the same shape of
     * object bayGeometry does with z meaning the hub axis instead of local
     * vertical (its own comment says so at length), which is exactly what
     * lets this reuse the shed's shape without a second set of numbers:
     * a square hatch, a short duct, a room, berths down the two long walls.
     *
     * ONE MESH FOR EVERY STATION, normalised to radius 1, for the reason
     * `underground` is one mesh: the table is in station radii, so a big
     * ring gets a big hall out of the same geometry scaled.
     *
     * It is the FALLBACK. Every station in the shipped library carries its
     * own modelled `interior` bucket, and drawStationInterior prefers it —
     * this is what an unmodelled station, or a build with no ports.js at
     * all, has instead. Same arrangement as the procedural shells above,
     * and for the same reason. */
    function hallMesh() {
      var Gen3 = global.Gen;
      var g = Gen3 && Gen3.stationBay
        ? Gen3.stationBay({ radius: 1 })
        : { depth: 0.20, mouthZ: 0.26, mouthR: 0.048, throatR: 0.044,
            chamberX: 0.115, chamberY: 0.085, floorZ: 0.06, ceilZ: 0.18,
            berthY: 0.068, standoff: 0.012, berths: 6, lift: 0 };
      var m = emptyMesh();
      var i;
      var hx = g.chamberX, hy = g.chamberY;
      var midZ = (g.floorZ + g.ceilZ) / 2, halfH = (g.ceilZ - g.floorZ) / 2;

      /* THE HATCH, on the hub face: four beams framing a square hole. The
       * hole is left open rather than plated over — it is the way in, and
       * the doors that close it are the model's own or none. */
      var cr = g.mouthR + 0.012;
      for (i = 0; i < 4; i++) {
        var sgn = i < 2 ? 1 : -1;
        if (i % 2 === 0) merge(m, box(cr, 0.012, 0.008), 0, sgn * cr, g.mouthZ);
        else merge(m, box(0.012, cr, 0.008), sgn * cr, 0, g.mouthZ);
      }

      /* THE DUCT between the hatch and the roof of the room. Short on
       * purpose: this is a doorway in a hull, not a descent. */
      var duct = (g.mouthR + g.throatR) / 2;
      var dLen = Math.max(0.001, g.mouthZ - g.ceilZ);
      for (i = 0; i < 4; i++) {
        var ds = i < 2 ? 1 : -1;
        if (i % 2 === 0) merge(m, box(duct, 0.004, dLen / 2), 0, ds * duct, g.ceilZ + dLen / 2);
        else merge(m, box(0.004, duct, dLen / 2), ds * duct, 0, g.ceilZ + dLen / 2);
      }

      /* THE ROOM. Deck, four walls, and a roof of four panels around the
       * opening — not one lid, for the reason the shed's is not one lid:
       * standing on the deck you would be looking at a ceiling where the
       * way out should be. */
      merge(m, box(hx, hy, 0.005), 0, 0, g.floorZ - 0.005);             // deck
      merge(m, box(hx, 0.004, halfH), 0, hy, midZ);                     // walls
      merge(m, box(hx, 0.004, halfH), 0, -hy, midZ);
      merge(m, box(0.004, hy, halfH), hx, 0, midZ);
      merge(m, box(0.004, hy, halfH), -hx, 0, midZ);
      var op = g.throatR;
      merge(m, box(hx, (hy - op) / 2, 0.003), 0, (hy + op) / 2, g.ceilZ);
      merge(m, box(hx, (hy - op) / 2, 0.003), 0, -(hy + op) / 2, g.ceilZ);
      merge(m, box((hx - op) / 2, op, 0.003), (hx + op) / 2, 0, g.ceilZ);
      merge(m, box((hx - op) / 2, op, 0.003), -(hx + op) / 2, 0, g.ceilZ);

      /* THE BERTHS, off the two long walls, read from the same berthOffset
       * every other consumer reads — so a bay drawn here is a bay a ship is
       * actually parked in. */
      for (var bi = 0; bi < g.berths; bi++) {
        /* tableBerthOffset, NOT berthOffset: this mesh is the fallback for a
         * station whose model declares no interior, and berthOffset would
         * answer from whichever model the stub port resolved to — which put
         * this room's alcoves at x = -0.65 in a room 0.26 wide. */
        var off = Gen3 && Gen3.tableBerthOffset
          ? Gen3.tableBerthOffset({ radius: 1, kind: 'station' }, bi) : null;
        if (!off) continue;
        var big = off.large;
        var bw = big ? 0.020 : 0.013;      // along the wall
        var bd = big ? 0.018 : 0.012;      // into it
        var side = off.y > 0 ? 1 : -1;
        var wallY = side * hy;
        merge(m, box(bw, bd, halfH * 0.55),
              off.x, wallY + side * bd, g.floorZ + halfH * 0.55);
        merge(m, box(bw * 0.8, bd * 0.8, 0.002), off.x, off.y, g.floorZ + 0.002);
        merge(m, box(bw * 0.55, 0.0015, 0.0015), off.x, wallY, g.floorZ + 0.03, 1,
              big ? '!#ffb45c' : '!#dff0ff');
      }

      /* LAMPS, and a station lights its own hall: there is no daylight up
       * the shaft here the way there is in a surface bay. */
      for (i = -3; i <= 3; i++) {
        merge(m, box(0.008, 0.002, 0.0012), i * hx * 0.28, hy * 0.55, g.ceilZ - 0.006,
              1, '!#bcd8ff');
        merge(m, box(0.008, 0.002, 0.0012), i * hx * 0.28, -hy * 0.55, g.ceilZ - 0.006,
              1, '!#bcd8ff');
      }
      return m;
    }

    /* ---- the shaft doors -------------------------------------------------
     *
     * Two leaves that slide apart along the bay's local x. They INTERMESH:
     * each carries a row of teeth that reach across the centreline into the
     * gaps in the other's row, so shut they read as a seam rather than a
     * butt joint, and opening them looks like something being unlocked.
     *
     * Built as two separate meshes rather than one mirrored pair, because
     * mirroring would put both tooth rows at the same y and the teeth would
     * pass through each other instead of past each other.
     *
     * They are drawn at a live offset (see drawPortDoors), which is why the
     * geometry here is the CLOSED position and the animation is a frame
     * translation — one mesh, any open fraction, no state baked in. */
    function doorLeaf(parity) {
      var m = emptyMesh();
      m.c = [];
      var MR = mouthR();
      var half = MR * 1.02;            // spans the mouth with a little lap
      var span = MR * 1.09;            // and stands proud of it across
      var pitch = MR * TOOTH_PITCH_M;
      var tHalf = MR * TOOTH_HALF_M;
      var reach = MR * TOOTH_REACH_M;
      var lift = MR * 0.045, thick = MR * 0.036;
      // The slab, covering its half of the mouth.
      merge(m, box(half / 2, span, thick), half / 2, 0, lift, 1, DOOR_SKIN);
      // A hazard stripe along the leading edge, so the seam is legible.
      merge(m, box(MR * 0.055, span, thick * 1.05), MR * 0.09, 0, lift * 1.04,
            1, DOOR_HAZARD);
      /* Teeth, offset by half a pitch between the two leaves so they
       * interleave. Four on one leaf, three on the other. */
      for (var i = -2; i <= 2; i++) {
        var y = (i + (parity ? 0.5 : 0)) * pitch;
        if (Math.abs(y) > span - tHalf) continue;
        merge(m, box(reach / 2, tHalf, thick), -reach / 2, y, lift, 1, DOOR_SKIN);
      }
      return m;
    }
    DOOR_LEAVES = [doorLeaf(0), doorLeaf(1)];

    var G = global.Gen || {};
    var underground = bayMesh(G.UNDERGROUND_DEPTH || 4.0);
    var bay = bayMesh(G.SHALLOW_DEPTH || 0.9);
    var hall = hallMesh();

    /* The approach lamps, as their own tiny mesh so the colour can answer
     * to something. Six boxes, twelve triangles each — cheap enough to
     * keep one per state rather than teaching the mesh shader about tints,
     * which would cost every hull in the game a uniform it never uses. */
    function lampRing(colour) {
      var m = emptyMesh();
      /* Along the four edges of the square hatch, not round a circle: the
       * lamps mark the opening, and the opening has corners. Three to a
       * side, with the corners left clear so the shape of the hole is what
       * you read rather than a ring of dots. */
      var edge = 0.70, step = 0.34;
      for (var i = -1; i <= 1; i++) {
        var o = i * step;
        merge(m, box(0.05, 0.03, 0.10), o, edge, 0.10, 1, '!' + colour);
        merge(m, box(0.05, 0.03, 0.10), o, -edge, 0.10, 1, '!' + colour);
        merge(m, box(0.03, 0.05, 0.10), edge, o, 0.10, 1, '!' + colour);
        merge(m, box(0.03, 0.05, 0.10), -edge, o, 0.10, 1, '!' + colour);
      }
      return m;
    }
    LAMP_RINGS = {
      denied: lampRing('#ff3b3b'),     // no clearance: the doors stay shut
      clear:  lampRing('#4dff88'),     // cleared, come ahead
      strobe: lampRing('#ffffff')      // the white half of the flash
    };

    STATION_MESHES = {
      orbital: orbital, highport: highport, refinery: refinery,
      shipyard: shipyard, agri: agri, mining: mining,
      reprocessing: reprocessing, surface: surface,
      bay: bay, underground: underground, hall: hall
    };

    /* Imported models take over any role they are supplied for; the
     * procedural ports above remain the fallback for everything the library
     * does not cover — so the game runs identically with ports.js absent.
     * Exactly the arrangement shipMeshes uses for hulls, and for the same
     * reason: a folder with three ports modelled and seven not should give
     * you three modelled ports, not a broken sky. */
    var ids = portIds();
    for (var pi = 0; pi < ids.length; pi++) {
      var got = libPort(ids[pi]);
      if (got && got.shell && got.shell.f.length) STATION_MESHES[ids[pi]] = got.shell;
    }
    return STATION_MESHES;
  }

  /* Apparent nose-to-tail length in pixels at the ship's current depth —
   * callers use this to decide whether the real model is worth drawing or
   * whether a marker dot reads better (the same billion-to-one scale problem
   * every body in this system runs into). */
  function shipScreenLength(cam, ship) {
    var sp = cam.project(ship.pos);
    if (!sp) return 0;
    return SHIP_LEN * sp.scale;
  }

  /* Any point given in a frame's own axes (x=right, y=up, z=forward), in km,
   * placed into world coordinates. The one transform the whole cockpit and
   * every hull model is built on. */
  function localToWorld(frame, x, y, z) {
    return {
      x: frame.pos.x + frame.right.x * x + frame.up.x * y + frame.fwd.x * z,
      y: frame.pos.y + frame.right.y * x + frame.up.y * y + frame.fwd.y * z,
      z: frame.pos.z + frame.right.z * x + frame.up.z * y + frame.fwd.z * z
    };
  }

  /* The same dart hull as the player's ship, at whatever size the caller
   * asks for — used to draw traffic. A 120 m freighter and a 10 m courier
   * are the same nine triangles scaled, which is honest about what this
   * renderer is and reads correctly at the handful of pixels either of them
   * ever actually occupies. */
  /* Paint a mesh through a frame at a given scale.
   *
   * NOTE ON BACKFACE CULLING, or the lack of it. The old single-hull
   * renderer culled faces pointing away from the camera, which is correct
   * for one closed convex mesh and quietly wrong for everything else — and
   * every model above is several parts bolted together, hand-authored,
   * with no guarantee that the winding is consistent between them. A
   * mis-wound triangle would vanish and leave a hole.
   *
   * So nothing is culled. Instead the normal is flipped toward the camera
   * before shading, which makes winding irrelevant, and the triangles are
   * painted far to near. That costs a little overdraw on thirty triangles
   * and removes an entire category of bug from hand-built geometry. */
  /* See gl.js setIndoors: whether the eye is inside something, for the
   * meshes queued while it is set. */
  var INDOORS = false;
  function setIndoors(on) {
    INDOORS = !!on;
    if (global.GLWorld && global.GLWorld.setIndoors) global.GLWorld.setIndoors(!!on);
  }

  function paintMesh(ctx, cam, frame, mesh, scale, sunDir, tint, edge) {
    var world = [], i;
    for (i = 0; i < mesh.v.length; i++) {
      var p = mesh.v[i];
      world.push(localToWorld(frame, p[0] * scale, p[1] * scale, p[2] * scale));
    }

    var tris = [];
    for (i = 0; i < mesh.f.length; i++) {
      var f = mesh.f[i];
      var a = world[f[0]], b = world[f[1]], c = world[f[2]];
      var normal = V.norm(V.cross(V.sub(b, a), V.sub(c, a)));
      var toCam = V.norm(V.sub(cam.eye, a));
      if (V.dot(normal, toCam) < 0) normal = V.scale(normal, -1);
      /* CLIPPED, NOT CULLED, and that is a change of kind rather than of
       * degree. This used to project the three corners and `continue` the
       * moment one of them came back null — which is what cam.project does
       * for a point behind the eye — so a wall the eye was standing inside
       * lost whole triangles and the room grew holes you could see the
       * rock through. Berthed inside a station, that is most of the room.
       *
       * clipProject already owns the near plane for the cockpit interior,
       * for exactly this reason and with exactly this failure behind it;
       * a face is a polygon and it takes one. Its survivors can be four
       * points rather than three, so the fill below walks a list.
       *
       * The GPU path reaches the same place by a different road — it
       * hands the rasterizer honest clip coordinates and lets the
       * hardware cut the triangle (see VERT_MESH in gl.js) — because that
       * is the only stage over there that can make a new vertex. Same
       * room either way, which is the standing rule for this pair. */
      var poly = clipProject(cam, [a, b, c]);
      if (!poly) continue;
      /* Sorted on the face's own depth, taken in camera space before the
       * clip rather than off the clipped corners: the clip can push a
       * corner up to the near plane, and sorting on THAT would float a
       * wall the eye is inside to the front of a mesh it is behind. */
      var da = V.dot(V.sub(a, cam.eye), cam.f),
          db = V.dot(V.sub(b, cam.eye), cam.f),
          dc = V.dot(V.sub(c, cam.eye), cam.f);
      var mat = faceMaterial((mesh.c && mesh.c[i]) || null);
      tris.push({
        poly: poly,
        depth: (Math.max(da, NEAR_CLIP) + Math.max(db, NEAR_CLIP)
              + Math.max(dc, NEAR_CLIP)) / 3,
        color: mat.color || tint,
        alpha: mat.alpha,
        /* Indoors the sun term becomes a lamp at the eye — see the same
         * branch in gl.js, which owns the reasoning. Kept in step here so a
         * machine with no WebGL sees the same room rather than a differently
         * lit one. */
        shade: mat.lit ? 1.15
             : INDOORS ? 0.10 + 0.55 * Math.abs(V.dot(normal, toCam))
             : 0.26 + 0.70 * Math.max(0, V.dot(normal, sunDir))
      });
    }
    tris.sort(function (p, q) { return q.depth - p.depth; }); // far first

    ctx.save();
    ctx.strokeStyle = edge || 'rgba(10,14,22,0.55)';
    ctx.lineWidth = 0.6;
    /* SET, not assumed. The tracking below only writes globalAlpha when it
     * changes, so it has to know what it is — and inheriting a caller's
     * half-transparent state would paint every opaque triangle in the mesh
     * at that opacity while believing it was at 1. */
    ctx.globalAlpha = 1;
    var alpha = 1;
    for (var t = 0; t < tris.length; t++) {
      var tr = tris[t];
      /* Real alpha here, a dither on the GPU. The two paths differ because
       * their constraints do: this one already sorts every triangle far to
       * near, which is exactly what blending needs and exactly what the GPU
       * pass refuses to do. Same number in, same glass out — so a dome
       * looks like itself whichever renderer drew it, which is the standing
       * rule for this pair of functions.
       *
       * Set only on change. globalAlpha is cheap but not free, and a hull
       * is a few hundred triangles of which none are glass. */
      if (tr.alpha !== alpha) { alpha = tr.alpha; ctx.globalAlpha = alpha; }
      ctx.fillStyle = shadeTint(tr.color, tr.shade);
      ctx.beginPath();
      ctx.moveTo(tr.poly[0].x, tr.poly[0].y);
      for (var q = 1; q < tr.poly.length; q++) ctx.lineTo(tr.poly[q].x, tr.poly[q].y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  /* ---- FACE MATERIALS ----------------------------------------------------
   * A mesh carries one colour string per face, and the first character or
   * two may be a material prefix:
   *
   *   '#rrggbb'    plain, lit by the sun
   *   '!#rrggbb'   emissive — flat 1.15, unlit, for anything self-lit
   *   '~h#rrggbb'  glass at opacity h/15, h a single hex digit
   *
   * The hex digit rather than a shared GLASS_ALPHA constant because the
   * value has to reach the GPU uploader too, and a constant duplicated in
   * two modules is a constant that drifts. It travels with the face.
   *
   * gl.js parses the identical two characters in uploadMesh for the GPU
   * path — deliberately duplicated rather than shared, because gl.js loads
   * without render.js and should keep doing so. Add a prefix here, add it
   * there; there are only ever going to be a handful. */
  function faceMaterial(raw) {
    if (!raw) return { color: null, lit: false, alpha: 1 };
    var c = raw.charAt(0);
    if (c === '!') return { color: raw.slice(1), lit: true, alpha: 1 };
    if (c === '~') {
      var h = parseInt(raw.charAt(1), 16);
      return {
        color: raw.slice(2),
        lit: false,
        /* A malformed digit reads as opaque. Glass that fails to be glass
         * is a cosmetic disappointment; glass that reads as alpha 0 is an
         * invisible building, which looks like the mesh failed to load. */
        alpha: (h >= 0 && h <= 15) ? h / 15 : 1
      };
    }
    return { color: raw, lit: false, alpha: 1 };
  }

  /* Shade a hull colour by a lighting factor. Accepts the '#rrggbb' the
   * generator hands out, and falls back to a neutral grey hull. */
  function shadeTint(tint, shade) {
    var r = 190, g = 205, b = 225;
    if (typeof tint === 'string' && tint.charAt(0) === '#' && tint.length === 7) {
      var n = parseInt(tint.slice(1), 16);
      r = (n >> 16) & 255; g = (n >> 8) & 255; b = n & 255;
    }
    return 'rgb(' + Math.round(Math.min(255, r * shade)) + ',' +
           Math.round(Math.min(255, g * shade)) + ',' +
           Math.round(Math.min(255, b * shade)) + ')';
  }

  /* Any other ship, at whatever size its class flies at. */
  /* The three world-space model calls below hand off to the GPU when the
   * world layer is running, and fall back to paintMesh when it is not.
   *
   * The handoff is HERE rather than inside paintMesh, even though all three
   * funnel through it, because paintMesh has other callers that must stay
   * in 2D: the holographic target in the MFD and the hull viewer page draw
   * into their own small canvases, not into the world, and redirecting
   * those to the world layer would paint them across the whole screen. */
  function gpuWorld() {
    return !!(global.GLWorld && global.GLWorld.available);
  }

  /* ---- the parts of a hull that move ------------------------------------
   * A hinged part is drawn EXACTLY like everything else in this file: a
   * mesh and a frame. There is no per-part transform in the shader and no
   * change to the mesh format's meaning — the frame is simply the ship's
   * own, moved to the part's pivot and turned about the part's own axis.
   * `drawPortDoors` already does the same thing for a sliding leaf, and the
   * port library's `spin` bucket for a turning ring; this is that pattern
   * a third time, which is why neither renderer needed touching.
   *
   * THE AUTHORED POSE IS DEPLOYED. Every hull in the library was saved
   * gear-down, so travel 1 is the model as drawn and travel 0 rotates each
   * part by its own measured `stow` angle. That is also the standing bug
   * this fixes: before the split, the legs were welded to the hull and
   * every ship flew permanently extended.
   *
   * THE DOOR LEADS. A strut that swings through a shut door is worse than
   * no animation at all, so the two roles run on staggered slices of the
   * same travel — the door is most of the way open before the leg starts
   * down, and the leg is home before the door closes behind it. One
   * number, read both ways, so retraction is the reverse of extension
   * without a second code path. */
  function gearPhase(role, travel) {
    var t = Math.max(0, Math.min(1, travel));
    var p = role === 'door' ? t / 0.45 : (t - 0.35) / 0.65;
    return Math.max(0, Math.min(1, p));
  }

  /* The ship's basis, rotated about `axis` by `ang`, with its origin moved
   * to the part's pivot. Rodrigues on each basis vector — three rotations
   * of a unit vector per part, which at six parts is nothing against a
   * frame that already costs milliseconds. */
  var gearFrame = { pos: null, fwd: null, up: null, right: null };

  function rotAxis(v, k, c, s, kd) {
    var d = k.x * v.x + k.y * v.y + k.z * v.z;
    return {
      x: v.x * c + (k.y * v.z - k.z * v.y) * s + k.x * d * kd,
      y: v.y * c + (k.z * v.x - k.x * v.z) * s + k.y * d * kd,
      z: v.z * c + (k.x * v.y - k.y * v.x) * s + k.z * d * kd
    };
  }

  function drawHullGear(ctx, cam, frame, mesh, lengthKm, sunDir, tint, travel) {
    var parts = mesh && mesh.gear;
    if (!parts || !parts.length) return;
    var R = frame.right, U = frame.up, F = frame.fwd;

    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      var ang = p.stow * (1 - gearPhase(p.role, travel));

      /* Pivot and axis are given in the hull's own axes, so both are
       * resolved against the ship's CURRENT attitude every frame rather
       * than stored as world points — the same rule the muzzles follow, and
       * for the same reason: at 5 km/s a frozen world point detaches
       * visibly within one frame. */
      var a = p.axis, q = p.pivot;
      var k = { x: R.x * a[0] + U.x * a[1] + F.x * a[2],
                y: R.y * a[0] + U.y * a[1] + F.y * a[2],
                z: R.z * a[0] + U.z * a[1] + F.z * a[2] };
      var kl = Math.hypot(k.x, k.y, k.z) || 1;
      k.x /= kl; k.y /= kl; k.z /= kl;

      var c = Math.cos(ang), s = Math.sin(ang), kd = 1 - c;
      gearFrame.pos = {
        x: frame.pos.x + (R.x * q[0] + U.x * q[1] + F.x * q[2]) * lengthKm,
        y: frame.pos.y + (R.y * q[0] + U.y * q[1] + F.y * q[2]) * lengthKm,
        z: frame.pos.z + (R.z * q[0] + U.z * q[1] + F.z * q[2]) * lengthKm
      };
      gearFrame.right = rotAxis(R, k, c, s, kd);
      gearFrame.up = rotAxis(U, k, c, s, kd);
      gearFrame.fwd = rotAxis(F, k, c, s, kd);

      if (gpuWorld() && global.GLWorld.queueMesh(cam, gearFrame, p.mesh, lengthKm, sunDir)) continue;
      paintMesh(ctx, cam, gearFrame, p.mesh, lengthKm, sunDir, tint);
    }
  }

  /* Where the gear reaches at a given travel, in the HULL's own axes — the
   * same frame `mesh.v` is in, so it can be compared against the hull
   * directly. Runs the identity basis through the same rotation the drawing
   * does, which is the point: a test that re-derived the pose would be
   * testing its own arithmetic rather than the renderer's.
   *
   * Also what the hull viewer page wants, when it grows a gear switch. */
  var HULL_R = { x: 1, y: 0, z: 0 };
  var HULL_U = { x: 0, y: 1, z: 0 };
  var HULL_F = { x: 0, y: 0, z: 1 };

  function gearBounds(mesh, travel) {
    var parts = mesh && mesh.gear;
    if (!parts || !parts.length) return null;
    var lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      var ang = p.stow * (1 - gearPhase(p.role, travel));
      var a = p.axis;
      var k = { x: a[0], y: a[1], z: a[2] };
      var c = Math.cos(ang), s = Math.sin(ang), kd = 1 - c;
      var R = rotAxis(HULL_R, k, c, s, kd);
      var U = rotAxis(HULL_U, k, c, s, kd);
      var F = rotAxis(HULL_F, k, c, s, kd);
      for (var v = 0; v < p.mesh.v.length; v++) {
        var q = p.mesh.v[v];
        var w = [p.pivot[0] + R.x * q[0] + U.x * q[1] + F.x * q[2],
                 p.pivot[1] + R.y * q[0] + U.y * q[1] + F.y * q[2],
                 p.pivot[2] + R.z * q[0] + U.z * q[1] + F.z * q[2]];
        for (var b = 0; b < 3; b++) {
          if (w[b] < lo[b]) lo[b] = w[b];
          if (w[b] > hi[b]) hi[b] = w[b];
        }
      }
    }
    return { lo: lo, hi: hi };
  }

  /* How far this ship's gear has actually travelled. `gearTravel` is what
   * sim.js eases; `gear` is the commanded state. A ship with neither — an
   * NPC, a wreck, anything the sim has not touched — reads as stowed, which
   * is what a ship in flight should look like. */
  function gearTravelOf(ship) {
    if (!ship) return 0;
    if (typeof ship.gearTravel === 'number') return ship.gearTravel;
    return ship.gear ? 1 : 0;
  }

  function drawHullModel(ctx, cam, frame, lengthKm, sunDir, tint, kind, ship) {
    var mesh = shipMeshes()[kind] || shipMeshes().courier;
    if (!(gpuWorld() && global.GLWorld.queueMesh(cam, frame, mesh, lengthKm, sunDir))) {
      paintMesh(ctx, cam, frame, mesh, lengthKm, sunDir, tint);
    }
    drawHullGear(ctx, cam, frame, mesh, lengthKm, sunDir, tint,
                 gearTravelOf(ship || frame));
  }

  /* The player's own hull. A ship object already carries pos/fwd/up/right,
   * which is exactly the frame paintMesh wants. */
  /* The player's hull, and the only thing in the game that tracks heat —
   * so it is the only thing that carries the plasma terms. NPCs fly the
   * same shader with the glow at zero, which costs one branch that is
   * never taken. */
  function drawShipModel(ctx, cam, ship, sunDir, tint) {
    var mesh = shipMeshes().courier;
    if (!(gpuWorld() && global.GLWorld.queueMesh(cam, ship, mesh, SHIP_LEN, sunDir,
                                                 ship.reentryGlow || 0, ship.windDir))) {
      paintMesh(ctx, cam, ship, mesh, SHIP_LEN, sunDir, tint);
    }
    /* The legs go on the plain queueMesh path rather than the plasma one.
     * They are the coldest thing on the ship — the last part to see air on
     * the way down and the first thing a pad touches — and giving them the
     * hull's re-entry glow would light them up before the nose. */
    drawHullGear(ctx, cam, ship, mesh, SHIP_LEN, sunDir, tint, gearTravelOf(ship));
  }

  /* ---- torch drives -----------------------------------------------------
   * A fusion torch putting out twenty metres per second squared is not a
   * tasteful blue dot; it is a column of plasma longer than the ship. Every
   * vessel in this game accelerates hard enough that the plume should be
   * the first thing you see and the last thing you lose sight of — at range
   * the hull is one pixel and the exhaust is still a streak.
   *
   * Drawn in screen space from two projected points rather than as
   * geometry: a plume has no surface, and a tapered gradient quad reads far
   * better than any number of triangles would. `dir` is the way the
   * exhaust travels, which is opposite the thrust.
   */
  function drawExhaust(ctx, cam, origin, dir, lengthKm, widthKm, throttle, color, phase) {
    if (!(throttle > 0.01)) return;

    /* Flicker. Two incommensurable frequencies so it never settles into a
     * visible beat, and a floor so the drive never appears to cut out. */
    var flick = 0.86 + 0.09 * Math.sin(phase * 27.3) + 0.05 * Math.sin(phase * 11.7);
    var len = lengthKm * (0.9 + 3.6 * throttle) * flick;
    var w0 = widthKm * (0.55 + 0.45 * throttle);
    var w1 = w0 * 0.30;

    var a = cam.project(origin);
    var b = cam.project(V.addScaled(origin, dir, len));
    if (!a || !b) return;

    var dx = b.x - a.x, dy = b.y - a.y;
    var L = Math.hypot(dx, dy);
    if (!(L > 0.4)) return;
    var nx = -dy / L, ny = dx / L;

    // Half-widths in pixels, at each end's own depth.
    var ha = Math.max(0.6, w0 * a.scale), hb = Math.max(0.3, w1 * b.scale);
    if (ha > 400) return;                 // inside the plume; do not fill the screen

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    var g = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
    g.addColorStop(0, 'rgba(255,255,255,0.92)');
    g.addColorStop(0.16, color || 'rgba(150,215,255,0.75)');
    g.addColorStop(0.55, 'rgba(90,150,255,0.28)');
    g.addColorStop(1, 'rgba(60,90,220,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(a.x + nx * ha, a.y + ny * ha);
    ctx.lineTo(b.x + nx * hb, b.y + ny * hb);
    ctx.lineTo(b.x - nx * hb, b.y - ny * hb);
    ctx.lineTo(a.x - nx * ha, a.y - ny * ha);
    ctx.closePath();
    ctx.fill();

    // A hotter, shorter core inside the envelope.
    var cxx = a.x + dx * 0.42, cyy = a.y + dy * 0.42;
    var cg = ctx.createLinearGradient(a.x, a.y, cxx, cyy);
    cg.addColorStop(0, 'rgba(255,255,255,0.95)');
    cg.addColorStop(1, 'rgba(210,240,255,0)');
    ctx.fillStyle = cg;
    ctx.beginPath();
    ctx.moveTo(a.x + nx * ha * 0.42, a.y + ny * ha * 0.42);
    ctx.lineTo(cxx, cyy);
    ctx.lineTo(a.x - nx * ha * 0.42, a.y - ny * ha * 0.42);
    ctx.closePath();
    ctx.fill();

    // Nozzle glow, so the drive still reads when the ship is a marker dot.
    var gr = Math.max(1.6, ha * 2.2);
    var ng = ctx.createRadialGradient(a.x, a.y, 0, a.x, a.y, gr);
    ng.addColorStop(0, 'rgba(255,255,255,0.55)');
    ng.addColorStop(0.4, 'rgba(150,210,255,0.22)');
    ng.addColorStop(1, 'rgba(90,150,255,0)');
    ctx.fillStyle = ng;
    ctx.beginPath();
    ctx.arc(a.x, a.y, gr, 0, K.TAU);
    ctx.fill();

    ctx.restore();
  }

  /* Where a given hull's exhaust comes out, and how big it is. Tail offset
   * is in units of hull length, measured back from the ship's centre. */
  var DRIVE_SPEC = {
    courier:   { tail: 0.44, width: 0.11, color: 'rgba(150,215,255,0.75)' },
    trade:     { tail: 0.44, width: 0.11, color: 'rgba(150,215,255,0.75)' },
    shuttle:   { tail: 0.50, width: 0.13, color: 'rgba(170,220,255,0.72)' },
    freighter: { tail: 0.52, width: 0.22, color: 'rgba(255,210,150,0.70)' },
    tanker:    { tail: 0.52, width: 0.26, color: 'rgba(255,190,140,0.68)' },
    hauler:    { tail: 0.50, width: 0.15, color: 'rgba(190,255,190,0.70)' },
    police:    { tail: 0.50, width: 0.10, color: 'rgba(150,200,255,0.85)' },
    merc:      { tail: 0.46, width: 0.16, color: 'rgba(215,175,255,0.75)' },
    pirate:    { tail: 0.46, width: 0.17, color: 'rgba(255,160,140,0.75)' }
  };

  /* Fire a ship's drive. `frame` is the hull's own basis; `thrustDir` is
   * the direction it is pushing, so the plume goes the other way. Passing
   * null for thrustDir means "straight out the back", which is what an NPC
   * on a rail is always doing. */
  function drawShipExhaust(ctx, cam, frame, lengthKm, throttle, kind, thrustDir, phase) {
    var spec = DRIVE_SPEC[kind] || DRIVE_SPEC.courier;
    var out = thrustDir ? V.scale(V.norm(thrustDir), -1) : V.scale(frame.fwd, -1);
    var tail = V.addScaled(frame.pos, frame.fwd, -spec.tail * lengthKm);
    drawExhaust(ctx, cam, tail, out, lengthKm, lengthKm * spec.width,
                throttle, spec.color, phase);
  }

  /* A station, oriented by whatever frame the caller hands us — its orbital
   * basis for an orbiting one, local vertical for a pad on the ground. */
  /* ---- what a starport looks like up close ------------------------------
   * generate.js decides WHAT is there — the boards, what they say, the town
   * around the pad, the approach lighting — and stores it on port.dressing.
   * This turns that into geometry.
   *
   * Built in the pad's own frame, where stationFrame puts +z along the
   * local vertical and x/y flat on the ground, and in units of PAD RADII,
   * so passing port.radius as the scale lands everything at the right size
   * on any world. The dressing's `u` is a bearing and `r` a distance out,
   * which is why every position below is a polar-to-cartesian.
   *
   * Cached on the port: a town is a few hundred triangles and it never
   * changes, so rebuilding it per frame would be pure waste. */

  /* An oriented box from a centre and three half-extent VECTORS. Boxes here
   * have to face things — a sign turned edge-on to the approach is not a
   * sign — so this takes axes rather than dimensions. */
  function addBox(mesh, c, ax, ay, az, color) {
    var base = mesh.v.length;
    var sx, sy, sz;
    for (sz = -1; sz <= 1; sz += 2) {
      for (sy = -1; sy <= 1; sy += 2) {
        for (sx = -1; sx <= 1; sx += 2) {
          mesh.v.push([
            c[0] + ax[0] * sx + ay[0] * sy + az[0] * sz,
            c[1] + ax[1] * sx + ay[1] * sy + az[1] * sz,
            c[2] + ax[2] * sx + ay[2] * sy + az[2] * sz
          ]);
        }
      }
    }
    // 0..7 in (sx fastest, then sy, then sz) order.
    var q = [[0,1,3,2],[4,6,7,5],[0,4,5,1],[2,3,7,6],[0,2,6,4],[1,5,7,3]];
    for (var i = 0; i < q.length; i++) {
      var f = q[i];
      mesh.f.push([base + f[0], base + f[1], base + f[2]]);
      mesh.f.push([base + f[0], base + f[2], base + f[3]]);
      mesh.c.push(color); mesh.c.push(color);
    }
  }

  var DRESS_WALL = '#5c6472';      // concrete under a strange sun
  var DRESS_POST = '#3f454f';
  var GLASS_TINT = '#9fc9d8';      // greenhouse panes, cold and a bit dirty
  var GLASS = '~9' + GLASS_TINT;   // ...and 9/15 opaque. See faceMaterial.

  function portDressingMesh(port) {
    if (port._dressMesh !== undefined) return port._dressMesh;
    var d = port.dressing;
    if (!d) { port._dressMesh = null; return null; }

    /* emptyMesh() is {v, f} only — the per-face colour array is optional in
     * this format and parts that want the ship's tint simply omit it. The
     * dressing paints every face itself, so it has to bring its own. */
    var mesh = emptyMesh();
    mesh.c = [];
    var i, u, cs, sn;

    /* The town. Each block is a slab with a band of lit windows across it —
     * the windows are what make it read as somewhere people are, and they
     * cost one extra box each. */
    for (i = 0; i < d.blocks.length; i++) {
      var b = d.blocks[i];
      cs = Math.cos(b.u); sn = Math.sin(b.u);
      var bx = cs * b.r, by = sn * b.r;
      addBox(mesh, [bx, by, b.h / 2],
             [b.w / 2, 0, 0], [0, b.d / 2, 0], [0, 0, b.h / 2], DRESS_WALL);
      if (b.windows > 0.05 && b.h > 0.12) {
        /* Slightly proud of the wall so it cannot z-fight with it, and
         * lit: '!' is the renderer's own prefix for a face that ignores
         * the sun, which is exactly what a window at night is. */
        var wc = b.warm ? '!#ffcf8a' : '!#bcd8ff';
        var band = b.h * 0.20 * Math.max(0.35, b.windows);
        addBox(mesh, [bx, by, b.h * 0.62],
               [b.w / 2 * 1.02, 0, 0], [0, b.d / 2 * 1.02, 0], [0, 0, band], wc);
      }
    }

    /* The greenhouses. A faceted glass shell with the crop showing through
     * it, on a low kerb. Drawn as two stacked rings rather than a real dome
     * because at the size these occupy on screen a hemisphere and a
     * two-tier drum are the same handful of pixels, and this one is a
     * quarter of the triangles.
     *
     * The crop is EMISSIVE. Not because a field glows, but because the
     * thing that has to survive being seen at a distance, at night, on the
     * dark side of a world, is the fact that there is something alive in
     * there — and the alternative is a grey lump. */
    var domes = d.domes || [];
    for (i = 0; i < domes.length; i++) {
      var dm = domes[i];
      cs = Math.cos(dm.u); sn = Math.sin(dm.u);
      var dx = cs * dm.r, dy = sn * dm.r, hh = dm.rad * dm.h;
      // The crop inside, drawn first and slightly smaller so the glass
      // sits over it.
      merge(mesh, tube(8, dm.rad * 0.86, dm.rad * 0.62, hh * 0.42, true),
            dx, dy, hh * 0.42, 1, '!' + dm.crop);
      /* Glass: two tiers, the upper one drawn in — and TRANSLUCENT, which
       * it had to be for any of the above to be true. The crop is drawn
       * first and smaller so that "the glass sits over it", and that is
       * precisely what went wrong: opaque glass over it meant the thing the
       * comment calls the whole point of the building was sealed inside an
       * unlit drum and never drawn. Nine-fifteenths is enough pane to read
       * as a surface and enough gap to see the green through. */
      merge(mesh, tube(8, dm.rad, dm.rad * 0.88, hh * 0.5, true),
            dx, dy, hh * 0.5, 1, GLASS);
      merge(mesh, tube(8, dm.rad * 0.88, dm.rad * 0.34, hh * 0.5, true),
            dx, dy, hh * 1.5, 1, GLASS);
      // A kerb, so it is planted on the ground rather than resting on it.
      addBox(mesh, [dx, dy, 0.006],
             [dm.rad * 1.08, 0, 0], [0, dm.rad * 1.08, 0], [0, 0, 0.006], DRESS_POST);
    }

    /* The boards. A post, and a panel turned to face the pad — the thing
     * you are looking at on the way in. */
    for (i = 0; i < d.signs.length; i++) {
      var s = d.signs[i];
      u = s.u; cs = Math.cos(u); sn = Math.sin(u);
      var px = cs * s.r, py = sn * s.r;
      var tang = [-sn, cs, 0];                 // along the board's width
      var radial = [cs, sn, 0];                // its thickness, facing in
      addBox(mesh, [px, py, s.h / 2],
             [0.012, 0, 0], [0, 0.012, 0], [0, 0, s.h / 2], DRESS_POST);
      var panelZ = s.h + s.tall / 2;
      addBox(mesh,
             [px, py, panelZ],
             [tang[0] * s.w / 2, tang[1] * s.w / 2, 0],
             [radial[0] * 0.010, radial[1] * 0.010, 0],
             [0, 0, s.tall / 2],
             s.lit ? '!' + s.ink : s.ink);
    }

    /* Approach lighting: a ring of lamps on the pad rim. Warm on the
     * ground, cold in orbit — decided by the generator, drawn here. */
    var lamp = '!' + (d.padLight || '#ffb45c');
    for (i = 0; i < 12; i++) {
      /* Math.PI * 2 rather than K.TAU on purpose: this is the only thing in
       * the mesh builder that would drag in the Kepler module, and a mesh
       * builder should be loadable on its own. */
      u = (i / 12) * Math.PI * 2;
      cs = Math.cos(u); sn = Math.sin(u);
      addBox(mesh, [cs * 1.04, sn * 1.04, 0.02],
             [0.02, 0, 0], [0, 0.02, 0], [0, 0, 0.02], lamp);
    }

    port._dressMesh = mesh;
    return mesh;
  }

  /* Drawn only for SURFACE ports: an orbital dock has no ground to build a
   * town on, and generate.js gives it no blocks. */
  function drawPortDressing(ctx, cam, frame, port, radiusKm, sunDir) {
    if (!port || !port.surface) return;
    var mesh = portDressingMesh(port);
    if (!mesh || !mesh.f.length) return;
    if (gpuWorld() && global.GLWorld.queueMesh(cam, frame, mesh, radiusKm, sunDir)) return;
    paintMesh(ctx, cam, frame, mesh, radiusKm, sunDir, DRESS_WALL);
  }

  /* ---- THE DOORS ARE PART OF THE HULL, AND THEY OPEN ---------------------
   *
   * Astra, of the Y-shaped station: "landing pulls you in through the wall
   * not into a docking bay." Measured against the raw art she is exactly
   * right — 26 of 31 points along a cradle's arrival rail are inside mesh —
   * and the mesh in question is the DOOR. Blast doors, sliding leaves and a
   * force field are all geometry in the shell, all shut, and nothing in the
   * game has ever opened them: Sim.arrivalPose has been posing `gates.apron`
   * from sealed to open across all five legs and no modelled station read
   * it.
   *
   * THE MODELS WERE BUILT FOR THIS. Every leaf ships its own travel —
   * `{"name":"berthLBlastDoorL","data":{"door":{"openX":-5.825,
   * "closedX":-1.915}}}` — and every berth names its own airlock and its
   * interlock rule. What was lost is only the SEPARATION: the converter
   * merged the leaves into one shell, so there was nothing left to move.
   *
   * They can be separated again without touching the converter, because the
   * `gates` anchors carry a bounding box per door node. A shell triangle
   * inside one of those boxes is part of that leaf. Boxes do overlap — two
   * leaves of a telescoping pair lap over each other when shut, which is
   * what a door does — so a contested triangle goes to the nearer centre,
   * and both leaves of a pair travel the same way regardless.
   *
   * THE TRAVEL IS MEASURED, NOT READ. openX/closedX are in the model's
   * ORIGINAL units and the anchors are normalised, with no reliable factor
   * between them — a door's local X is not the model's. So the distance
   * comes from the geometry instead: a leaf slides away from its berth's
   * centreline until its inner edge reaches that centreline, which is
   * exactly "until the opening is clear", and it needs no unit conversion
   * at all.
   *
   * A FORCE FIELD DOES NOT SLIDE. `fieldGate` leaves are a flat panel
   * across the mouth; they are simply not drawn once the gate is open,
   * which is also the honest answer to the note about the field rendering
   * as an opaque lit slab. */
  function extrasByName(role) {
    var raw = global.PortLib && global.PortLib[role];
    var out = {};
    var ex = raw && raw.extras;
    if (ex) for (var i = 0; i < ex.length; i++) if (ex[i] && ex[i].name) out[ex[i].name] = ex[i].data || {};
    return out;
  }

  function portDoors(role) {
    if (PORT_DOORS[role] !== undefined) return PORT_DOORS[role];
    PORT_DOORS[role] = null;
    var lib = libPort(role);
    var shell = lib && lib.shell;
    var raw = global.PortLib && global.PortLib[role];
    var A = raw && raw.anchors;
    var gates = A && A.gates, berths = A && A.berths;
    if (!shell || !shell.f || !shell.f.length || !gates || !gates.length) return null;

    var boxes = [];
    for (var gi = 0; gi < gates.length; gi++) {
      var g = gates[gi];
      if (!g || !g.min || !g.max || !g.mid) continue;
      boxes.push(g);
    }
    if (!boxes.length) return null;

    /* Each triangle to the box that contains it; ties to the nearer centre. */
    var owner = new Int16Array(shell.f.length);
    for (var i = 0; i < owner.length; i++) owner[i] = -1;
    for (i = 0; i < shell.f.length; i++) {
      var t = shell.f[i];
      var a = shell.v[t[0]], b = shell.v[t[1]], c = shell.v[t[2]];
      if (!a || !b || !c) continue;
      var px = (a[0] + b[0] + c[0]) / 3,
          py = (a[1] + b[1] + c[1]) / 3,
          pz = (a[2] + b[2] + c[2]) / 3;
      var best = -1, bestD = Infinity;
      for (var j = 0; j < boxes.length; j++) {
        var bx = boxes[j];
        if (px < bx.min[0] || px > bx.max[0] || py < bx.min[1] || py > bx.max[1] ||
            pz < bx.min[2] || pz > bx.max[2]) continue;
        var dx = px - bx.mid[0], dy = py - bx.mid[1], dz = pz - bx.mid[2];
        var d = dx * dx + dy * dy + dz * dz;
        if (d < bestD) { bestD = d; best = j; }
      }
      owner[i] = best;
    }

    /* CARRY THE COLOURS ACROSS, and this cost a station its paint.
     *
     * `decompress` expands the library's palette-index pair into `c` — one
     * colour STRING per face — and drops `ci`/`pal` on the floor. The first
     * version of this split partitioned `ci` and `pal`, which on a
     * decompressed mesh are both undefined, so every face of every station
     * came out with no material at all and paintMesh fell back to the
     * caller's tint: a near-white station colour over the whole hull.
     *
     * Which is exactly what Astra saw — "the textures I put with the models
     * aren't applied? what about all the greebles and the caution stripes?"
     * The stripes were never lost. This model paints 4,440 of its faces
     * caution yellow and they were all being painted station-white. */
    var ex = extrasByName(role);
    var leaves = [], hullF = [], hullC = [];
    for (j = 0; j < boxes.length; j++) leaves.push({ f: [], c: [] });
    for (i = 0; i < shell.f.length; i++) {
      var o = owner[i];
      var col = shell.c ? shell.c[i] : null;
      if (o < 0) { hullF.push(shell.f[i]); hullC.push(col); }
      else { leaves[o].f.push(shell.f[i]); leaves[o].c.push(col); }
    }

    var out = [];
    for (j = 0; j < boxes.length; j++) {
      if (!leaves[j].f.length) continue;
      var box = boxes[j];
      var data = ex[box.node] || {};
      var field = !!data.fieldGate;

      /* WHICH BERTH THIS LEAF BELONGS TO, and therefore what it opens away
       * from: the nearest berth anchor. Named matching would be wrong here
       * for the same reason it is wrong in berthApertures — a ring mirrors
       * its patterns and two alcoves answer to the same prefix. */
      var berth = null, bd = Infinity;
      if (berths) {
        for (var bi = 0; bi < berths.length; bi++) {
          var bb2 = berths[bi];
          if (!bb2 || !bb2.mid) continue;
          var ddx = bb2.mid[0] - box.mid[0], ddy = bb2.mid[1] - box.mid[1],
              ddz = bb2.mid[2] - box.mid[2];
          var dd = ddx * ddx + ddy * ddy + ddz * ddz;
          if (dd < bd) { bd = dd; berth = bb2; }
        }
      }

      var axis = [0, 0, 0], travel = 0;
      if (!field && berth) {
        /* The two axes across the opening are the ones the berth does not
         * open along. The leaf slides along whichever of them it is offset
         * on, away from the berth's centreline, until its inner edge
         * reaches that line. */
        var n = berth.normal || [0, 0, 0];
        var pick = -1, best2 = 0;
        for (var ax = 0; ax < 3; ax++) {
          if (Math.abs(n[ax]) > 0.5) continue;          // that is the way IN
          var off = box.mid[ax] - berth.mid[ax];
          if (Math.abs(off) > best2) { best2 = Math.abs(off); pick = ax; }
        }
        if (pick >= 0 && best2 > 1e-4) {
          var sign = (box.mid[pick] - berth.mid[pick]) > 0 ? 1 : -1;
          var inner = sign > 0 ? box.min[pick] : box.max[pick];
          travel = Math.abs(inner - berth.mid[pick]);
          axis[pick] = sign;
        }
      }

      out.push({
        node: box.node,
        mesh: { v: shell.v, f: leaves[j].f, c: leaves[j].c },
        axis: axis, travel: travel, field: field, berthMid: berth ? berth.mid : null
      });
    }

    if (!out.length) return null;
    PORT_DOORS[role] = {
      hull: { v: shell.v, f: hullF, c: hullC },
      leaves: out
    };
    return PORT_DOORS[role];
  }

  /* Move a frame by a model-space offset. The frame maps model x/y/z onto
   * right/up/fwd (see main.js stationFrame), so this is the same "translate
   * the frame, not the geometry" the shaft doors already use — one mesh,
   * any open fraction, no state baked in. */
  function shiftFrame(frame, mx, my, mz, km) {
    return {
      pos: { x: frame.pos.x + (frame.right.x * mx + frame.up.x * my + frame.fwd.x * mz) * km,
             y: frame.pos.y + (frame.right.y * mx + frame.up.y * my + frame.fwd.y * mz) * km,
             z: frame.pos.z + (frame.right.z * mx + frame.up.z * my + frame.fwd.z * mz) * km },
      fwd: frame.fwd, right: frame.right, up: frame.up
    };
  }

  /* ---- a station is a set of compartments -------------------------------
   *
   * ASTRA'S DESIGN, AND THE ART ALREADY DECLARES IT: "each section of the
   * station is meant to have a blast door so it only has to draw one
   * section around the ship at a time." Every anchor in these models
   * carries a node name prefixed by its berth — berthSM0L, berthL,
   * berthSM2R — and `extras` gives each of those an airlock: an outer set
   * of sliding doors, an inner gate, and an interlock between them.
   *
   * HOW A SOLID FINDS ITS SECTION. Three steps, and the order matters.
   *
   * 1. The mesh is split into CONNECTED SOLIDS, welded by position. These
   *    models are closed (see portTriangles) and built from separate
   *    pieces: spine-s is 1,536 of them. A solid is the smallest thing that
   *    can sensibly belong to one room, and splitting by anything coarser —
   *    a bounding box, say — puts the same triangle in three rooms at once.
   *    Measured: boxes put 36% of spine-s in more than one section.
   *
   * 2. Each solid takes the section whose anchors it OVERLAPS most. That
   *    catches the deck, the door houses, the pockets, the gate frames.
   *
   * 3. Whatever overlaps nothing joins its NEAREST section if it is within
   *    reach of it, and is station structure otherwise. This is what picks
   *    up the walls: they bound a compartment without touching any anchor.
   *    SECTION_REACH is measured rather than chosen — sweeping it, spine-s
   *    falls 27,808 -> 12,708 -> 6,928 -> 6,700 triangles at 0.6, 1.0 and
   *    1.6 berth-diagonals, so 1.0 is the knee and anything past it buys
   *    almost nothing while swallowing more of the station.
   *
   * SECTIONS ARE GEOMETRIC, NOT NAMED, and that is not pedantry: a ring
   * MIRRORS its patterns, so two alcoves on opposite sides of the hub are
   * both called berthSM0. Grouping by name alone gave ring-s two sections
   * where it has five. So the berths are taken in the same canonical order
   * generate.js sorts by, each anchor joins the nearest berth whose name it
   * prefixes, and identity is the berth INDEX. */
  var SECTION_REACH = 1.0;          // berth diagonals
  var SECTIONS = {};

  function portSections(role) {
    if (SECTIONS[role] !== undefined) return SECTIONS[role];
    SECTIONS[role] = null;
    var lib = libPort(role);
    var raw = global.PortLib && global.PortLib[role];
    var A = raw && raw.anchors;
    var mb = A && A.berths;
    if (!lib || !mb || !mb.length) return null;
    /* The hull WITHOUT its door leaves when this model has doors: the
     * leaves already move on their own and must not be drawn twice. */
    var d = portDoors(role);
    var hull = d ? d.hull : lib.shell;
    var inner = lib.interior;
    if (!hull || !hull.f) return null;

    var berths = mb.slice().sort(function (a, b) {
      return a.mid[0] - b.mid[0] || a.mid[1] - b.mid[1] || a.mid[2] - b.mid[2];
    });
    var prefix = berths.map(function (b) {
      return String(b.node || '').replace(/ThroatFloor$/, '');
    });
    var d2 = function (a, b) {
      var x = a[0] - b[0], y = a[1] - b[1], z = a[2] - b[2];
      return x * x + y * y + z * z;
    };

    /* Every anchor joins a berth: longest name prefix, nearest of those. */
    var owned = [];
    for (var s0 = 0; s0 < berths.length; s0++) owned.push([]);
    Object.keys(A).forEach(function (bk) {
      for (var i = 0; i < A[bk].length; i++) {
        var a = A[bk][i];
        if (!a.min || !a.max || !a.mid) continue;
        var best = -1, bestLen = -1, bestD = Infinity;
        for (var j = 0; j < berths.length; j++) {
          if (String(a.node || '').indexOf(prefix[j]) !== 0) continue;
          var dd = d2(a.mid, berths[j].mid);
          if (prefix[j].length > bestLen ||
              (prefix[j].length === bestLen && dd < bestD)) {
            bestLen = prefix[j].length; bestD = dd; best = j;
          }
        }
        if (best >= 0) owned[best].push(a);
      }
    });

    /* Connected solids across the hull and the interior together. Indices
     * are kept per bucket so the result can be rebuilt as drawable meshes
     * sharing the original vertex arrays. */
    /* A COUNTER, NOT Object.keys().length. The obvious spelling of "next
     * free id" walks the whole map on every vertex, which is quadratic and
     * took ten and a half seconds to section one station. */
    var idOf = {}, idNext = 0, WELD = 1e-5;
    var kf = function (p) {
      return Math.round(p[0] / WELD) + '|' + Math.round(p[1] / WELD) + '|' +
             Math.round(p[2] / WELD);
    };
    var par = {};
    function find(x) {
      while (par[x] !== undefined && par[x] !== x) x = par[x] = par[par[x]];
      return par[x] === undefined ? (par[x] = x) : x;
    }
    function uni(a, b) { a = find(a); b = find(b); if (a !== b) par[a] = b; }

    var buckets = [{ key: 'hull', mesh: hull }, { key: 'interior', mesh: inner }];
    var faceKey = [];                 // per bucket: a weld id per face
    for (var bi = 0; bi < buckets.length; bi++) {
      var m = buckets[bi].mesh, keys = [];
      if (m && m.f) {
        for (var fi = 0; fi < m.f.length; fi++) {
          var f = m.f[fi], first = -1, prev = -1;
          for (var vi = 0; vi < f.length; vi++) {
            var pt = m.v[f[vi]];
            if (!pt) continue;
            var kk0 = kf(pt), id = idOf[kk0];
            if (id === undefined) id = idOf[kk0] = idNext++;
            if (first < 0) first = id; else uni(prev, id);
            prev = id;
          }
          keys.push(first);
        }
      }
      faceKey.push(keys);
    }

    /* Per solid: a bounding box, so it can be matched against the anchors. */
    var comp = {};
    for (var b2 = 0; b2 < buckets.length; b2++) {
      var m2 = buckets[b2].mesh;
      if (!m2 || !m2.f) continue;
      for (var f2 = 0; f2 < m2.f.length; f2++) {
        var g = faceKey[b2][f2];
        if (g === undefined || g < 0) continue;
        g = find(g);
        var c = comp[g] || (comp[g] = { lo: [1e9, 1e9, 1e9], hi: [-1e9, -1e9, -1e9] });
        var face = m2.f[f2];
        for (var q = 0; q < face.length; q++) {
          var p2 = m2.v[face[q]];
          if (!p2) continue;
          for (var ax = 0; ax < 3; ax++) {
            if (p2[ax] < c.lo[ax]) c.lo[ax] = p2[ax];
            if (p2[ax] > c.hi[ax]) c.hi[ax] = p2[ax];
          }
        }
      }
    }

    function overlap(c, a) {
      var v = 1;
      for (var i = 0; i < 3; i++) {
        var lo = Math.max(c.lo[i], a.min[i]), hi = Math.min(c.hi[i], a.max[i]);
        if (hi <= lo) return 0;
        v *= (hi - lo);
      }
      return v;
    }
    Object.keys(comp).forEach(function (g) {
      var c = comp[g], best = -1, bv = 0;
      for (var i = 0; i < owned.length; i++) {
        var v = 0;
        for (var k = 0; k < owned[i].length; k++) v += overlap(c, owned[i][k]);
        if (v > bv) { bv = v; best = i; }
      }
      if (best < 0) {
        var cm = [(c.lo[0] + c.hi[0]) / 2, (c.lo[1] + c.hi[1]) / 2,
                  (c.lo[2] + c.hi[2]) / 2];
        var nb = -1, nd = Infinity;
        for (var j = 0; j < berths.length; j++) {
          var dd = d2(cm, berths[j].mid);
          if (dd < nd) { nd = dd; nb = j; }
        }
        if (nb >= 0) {
          var reach = 0;
          for (var a3 = 0; a3 < 3; a3++) {
            var e3 = berths[nb].max[a3] - berths[nb].min[a3];
            reach += e3 * e3;
          }
          if (nd < reach * SECTION_REACH * SECTION_REACH) best = nb;
        }
      }
      c.sec = best;
    });

    /* Rebuild as drawable meshes, sharing the original vertex arrays. */
    function blank(m) { return m ? { v: m.v, f: [], c: m.c ? [] : null } : null; }
    var out = [], structure = { hull: blank(hull), interior: blank(inner) };
    for (var s2 = 0; s2 < berths.length; s2++) {
      out.push({ hull: blank(hull), interior: blank(inner), mid: berths[s2].mid.slice() });
    }
    for (var b3 = 0; b3 < buckets.length; b3++) {
      var m3 = buckets[b3].mesh, kk = buckets[b3].key;
      if (!m3 || !m3.f) continue;
      for (var f3 = 0; f3 < m3.f.length; f3++) {
        var g3 = faceKey[b3][f3];
        var sec = (g3 === undefined || g3 < 0) ? -1 : comp[find(g3)].sec;
        var dst = sec < 0 ? structure[kk] : out[sec][kk];
        if (!dst) continue;
        dst.f.push(m3.f[f3]);
        if (dst.c && m3.c) dst.c.push(m3.c[f3]);
      }
    }
    /* Each section's own extent, so a point can be asked which compartment
     * it is in without walking the faces again. Taken from the geometry the
     * section ended up with rather than from the berth anchor, because the
     * anchor is a box hung over the alcove and the walls are the room. */
    for (var s3 = 0; s3 < out.length; s3++) {
      var lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9], any = false;
      ['hull', 'interior'].forEach(function (kx) {
        var mm = out[s3][kx];
        if (!mm || !mm.f) return;
        for (var ff = 0; ff < mm.f.length; ff++) {
          var fc = mm.f[ff];
          for (var vv = 0; vv < fc.length; vv++) {
            var pp = mm.v[fc[vv]];
            if (!pp) continue;
            any = true;
            for (var aa = 0; aa < 3; aa++) {
              if (pp[aa] < lo[aa]) lo[aa] = pp[aa];
              if (pp[aa] > hi[aa]) hi[aa] = pp[aa];
            }
          }
        }
      });
      out[s3].lo = any ? lo : null;
      out[s3].hi = any ? hi : null;
    }

    SECTIONS[role] = { n: berths.length, sections: out, structure: structure };
    return SECTIONS[role];
  }

  /* WHICH COMPARTMENT IS THIS POINT IN, in the model's own normalised
   * frame. Returns a section index, or -1 for the throat, the open hub and
   * everywhere else that is not a room.
   *
   * Smallest-containing-section wins. On a spine the compartments nest
   * inside the station's own extent and a "first box that contains it"
   * answer would hand back whichever one happened to be built first; the
   * smallest is the innermost, which is the room you are actually in. */
  function sectionAt(role, p) {
    var S = portSections(role);
    if (!S || !p) return -1;
    /* NEAREST BERTH WITHIN REACH — the same rule that put the walls in a
     * section in the first place, so a point and the geometry around it
     * cannot disagree about which room they are in.
     *
     * NOT a containment test against the section's bounds, which is what
     * this was first and which got two of spine-s's seven berths wrong. A
     * compartment is not a box: the boxes of neighbouring alcoves overlap,
     * and "smallest box containing the point" then hands back next door.
     * Boxes have now been the wrong tool for this three times in one day. */
    var best = -1, bestD = Infinity;
    for (var i = 0; i < S.sections.length; i++) {
      var s = S.sections[i];
      if (!s.mid) continue;
      var dx = p[0] - s.mid[0], dy = p[1] - s.mid[1], dz = p[2] - s.mid[2];
      var dd = dx * dx + dy * dy + dz * dz;
      if (dd < bestD) { bestD = dd; best = i; }
    }
    if (best < 0) return -1;
    /* Out of reach of every berth is the throat, the hub or open space. */
    var b = S.sections[best];
    if (!b.lo) return -1;
    var reach = 0;
    for (var a = 0; a < 3; a++) {
      var e = b.hi[a] - b.lo[a];
      reach += e * e;
    }
    return bestD < reach * 0.25 ? best : -1;
  }

  /* ---- THE BERTH, AT THE SIZE OF THE SHIP -------------------------------
   *
   * Astra, parked at Waypoint Dock: "where's the doors? it's just a square
   * box room with no decorations."
   *
   * Nothing was missing. The berth anchor there measured 2.16 km by 1.20
   * km by 0.91 km around a twenty-five metre hull, so the nearest wall was
   * three hundred metres away and the outer doors were a kilometre off and
   * five hundred metres below the canopy. A room reads as a box when every
   * edge of it is too far away to resolve — and halving the station (see
   * STATION_SCALE, now 2.1) only halves that.
   *
   * The rest of the gap closes at the OTHER end. This is deck furniture
   * measured off the hull rather than off the station: a marked pad the
   * ship actually sits on, four floodlight masts, clamp blocks, a berth
   * number. It is the only geometry in a station bay whose size does not
   * change when STATION_SCALE does, which is exactly why it works — it is
   * the ruler the eye needs to read the rest of the room.
   *
   * And the art's own fittings come with it. Every station model carries
   * `lamps`, `navLights` and `signs` anchors — twenty-nine, fourteen and
   * five on spine-s — and nothing in the game has ever drawn one of them.
   * Same class of find as the interior buckets. They are drawn here, lit,
   * the ones belonging to this berth.
   *
   * Built in the model's own frame so it rides with the station for free,
   * and cached per (role, berth, radius) because the pad is a fixed number
   * of METRES and therefore a different number of model units at every
   * station wearing the same model. */
  var DRESS = {};
  var DRESS_KEYS = [];
  var DRESS_MAX = 24;

  function pushBox(mesh, o, f, r, u, a, b, c, ha, hb, hc, colour) {
    var base = mesh.v.length;
    for (var i = 0; i < 8; i++) {
      var sa = (i & 1) ? ha : -ha, sb = (i & 2) ? hb : -hb, sc = (i & 4) ? hc : -hc;
      mesh.v.push([
        o[0] + f[0] * (a + sa) + r[0] * (b + sb) + u[0] * (c + sc),
        o[1] + f[1] * (a + sa) + r[1] * (b + sb) + u[1] * (c + sc),
        o[2] + f[2] * (a + sa) + r[2] * (b + sb) + u[2] * (c + sc)
      ]);
    }
    /* Corners are indexed by bit: 1 = +a, 2 = +b, 4 = +c. Written out
     * rather than generated so a wrong face is a wrong line rather than a
     * wrong loop. Winding is not load-bearing — both renderers turn the
     * normal to face the camera — so these are listed for readability. */
    var quads = [[0,1,3,2],[4,6,7,5],[0,4,5,1],[2,3,7,6],[0,2,6,4],[1,5,7,3]];
    for (var q = 0; q < quads.length; q++) {
      var Q = quads[q];
      mesh.f.push([base + Q[0], base + Q[1], base + Q[2]]);
      mesh.c.push(colour);
      mesh.f.push([base + Q[0], base + Q[2], base + Q[3]]);
      mesh.c.push(colour);
    }
  }

  function berthDressing(role, berth, radiusKm) {
    if (!(radiusKm > 0)) return null;
    var key = role + '#' + berth + '#' + radiusKm.toFixed(4);
    if (DRESS[key] !== undefined) return DRESS[key];

    var lib = libPort(role);
    var mb = lib && lib.anchors && lib.anchors.berths;
    if (!mb || !mb.length) { DRESS[key] = null; return null; }
    /* The same sort generate.js uses. A pad laid at berth 3 and a ship
     * parked in berth 5 is the grey bay again, only lit. */
    var sorted = mb.slice().sort(function (a, b) {
      return a.mid[0] - b.mid[0] || a.mid[1] - b.mid[1] || a.mid[2] - b.mid[2];
    });
    var k = ((berth % sorted.length) + sorted.length) % sorted.length;
    var bx = sorted[k];
    if (!bx || !bx.mid) { DRESS[key] = null; return null; }
    var deck = berthDeck(role, k);
    if (deck === null || deck === undefined) deck = bx.min ? bx.min[2] : bx.mid[2];

    /* Metres, into the model's normalised units. Everything below is in
     * SHIP LENGTHS, which is the whole point of the exercise. */
    var M2U = 1 / radiusKm;
    var L = SHIP_LEN * M2U;                       // one hull length
    var o = [bx.mid[0], bx.mid[1], deck];
    var f = bx.normal ? [bx.normal[0], bx.normal[1], bx.normal[2]] : [1, 0, 0];
    var fl = Math.sqrt(f[0] * f[0] + f[1] * f[1] + f[2] * f[2]) || 1;
    f = [f[0] / fl, f[1] / fl, f[2] / fl];
    var u = [0, 0, 1];
    /* r = f x u, normalised. If the berth opens straight up — no model in
     * the library does, but a hand-made one could — fall back to model x. */
    var r = [f[1] * u[2] - f[2] * u[1], f[2] * u[0] - f[0] * u[2], f[0] * u[1] - f[1] * u[0]];
    var rl = Math.sqrt(r[0] * r[0] + r[1] * r[1] + r[2] * r[2]);
    r = rl > 1e-9 ? [r[0] / rl, r[1] / rl, r[2] / rl] : [1, 0, 0];

    var m = { v: [], f: [], c: [] };
    /* LIT, WITHOUT A LIGHTING SYSTEM, and that is what the '!' is doing on
     * colours this dark.
     *
     * Indoors the shader replaces the sun with a lamp at the eye: a
     * surface reads 0.10 + 0.55*|N.V|, so anything seen at a glancing
     * angle falls to a tenth. The pilot's eye sits six metres above this
     * deck, which means the deck is ALWAYS glancing, which is why an
     * undressed bay read as a black box however much geometry was in it.
     *
     * An emissive face is flat 1.15 instead — no angle term at all. That
     * is exactly what a surface under a floodlight looks like, so the
     * stand's own plating is emissive at a DARK colour rather than plain
     * at a light one: 1.15 x #4a4f58 is a lit deck, not a glowing one.
     * Nothing in the engine had to change for it, which is the argument
     * for doing it this way rather than adding real lamps. The masts
     * themselves stay plain, so they shade with angle and read as objects
     * standing on the floor rather than as decals painted on it. */
    var PLATE = '!#4a4f58', KERB = '!#5a6070', MARK = '!#c9b44a',
        DARK = '!#23262c', POST = '#5d6673', HEAD = '!#ffe6a8',
        SIGN = '!#7ed3ff', CLAMP = '!#6e7683';

    var padA = 2.2 * L, padB = 1.4 * L, padT = 0.012 * L;   // 30 cm of plate
    /* The pad sits ON the deck, not in it: half its thickness up, plus a
     * skin, or it z-fights the plate it is bolted to at every distance. */
    var padC = padT + 0.004 * L;
    pushBox(m, o, f, r, u, 0, 0, padC, padA, padB, padT, PLATE);

    /* A KERB ROUND ALL FOUR SIDES. One rectangle the eye can find is worth
     * more than any amount of surface detail: it is what turns "floor" into
     * "the stand I am parked on", and it is the only edge in the bay near
     * enough to resolve. */
    var barC = padT * 2 + 0.006 * L;
    var kerbH = 0.05 * L, kerbW = 0.05 * L;
    pushBox(m, o, f, r, u,  padA, 0, barC + kerbH, kerbW, padB, kerbH, KERB);
    pushBox(m, o, f, r, u, -padA, 0, barC + kerbH, kerbW, padB, kerbH, KERB);
    pushBox(m, o, f, r, u, 0,  padB, barC + kerbH, padA, kerbW, kerbH, KERB);
    pushBox(m, o, f, r, u, 0, -padB, barC + kerbH, padA, kerbW, kerbH, KERB);

    /* Hazard bars along the kerbs, which is what tells you which way round
     * the stand is before you can read anything on it. */
    for (var s = -1; s <= 1; s += 2) {
      for (var j = 0; j < 9; j++) {
        pushBox(m, o, f, r, u,
                (j - 4) * (padA / 4.6), s * padB, barC + kerbH * 2.02,
                padA / 11, kerbW, kerbH * 0.35, j % 2 ? DARK : MARK);
      }
    }
    /* Two short bars across the head of the stand rather than a centreline
     * down it: from an eye six metres up, a stripe running away under the
     * hull is fifty metres of yellow wedge filling the canopy, which was
     * the first version and looked like a runway painted on the camera. */
    for (var jb = -1; jb <= 1; jb += 2) {
      pushBox(m, o, f, r, u, jb * padA * 0.62, 0, barC, padA * 0.06, padB * 0.5,
              padT * 0.35, MARK);
    }

    /* Clamp blocks under the hull, one at each quarter. Small: they are a
     * detail at the foot of the ship, not furniture to look at. */
    for (var ca = -1; ca <= 1; ca += 2) {
      for (var cb = -1; cb <= 1; cb += 2) {
        pushBox(m, o, f, r, u, ca * 0.50 * L, cb * 0.40 * L, barC + 0.022 * L,
                0.07 * L, 0.04 * L, 0.022 * L, CLAMP);
      }
    }

    /* FOUR MASTS, outside the kerb, with lit heads. They give the bay a
     * vertical scale — the one thing a floor cannot — and they are the
     * reason the far wall now has something in front of it to be far
     * behind. */
    var mastH = 0.8 * L;
    for (var ma = -1; ma <= 1; ma += 2) {
      for (var mb2 = -1; mb2 <= 1; mb2 += 2) {
        var aa = ma * (padA + 0.12 * L), bb = mb2 * (padB + 0.12 * L);
        pushBox(m, o, f, r, u, aa, bb, mastH * 0.5 + barC,
                0.028 * L, 0.028 * L, mastH * 0.5, POST);
        pushBox(m, o, f, r, u, aa, bb, mastH + barC,
                0.075 * L, 0.075 * L, 0.04 * L, HEAD);
      }
    }

    /* The berth number, on a board at the head of the stand facing the way
     * a ship comes in. It reads as "there is a system here that knows which
     * berth this is", which is most of what dressing is for. */
    var sgA = -(padA + 0.45 * L);
    pushBox(m, o, f, r, u, sgA, 0, 0.35 * L + barC, 0.025 * L, 0.025 * L, 0.35 * L, POST);
    pushBox(m, o, f, r, u, sgA, 0, 0.75 * L + barC, 0.02 * L, 0.30 * L, 0.13 * L, SIGN);
    for (var dgt = 0; dgt <= berth % 5; dgt++) {
      pushBox(m, o, f, r, u, sgA - 0.03 * L, (dgt - (berth % 5) / 2) * 0.09 * L,
              0.75 * L + barC, 0.012 * L, 0.022 * L, 0.075 * L, DARK);
    }

    /* AND THE ART'S OWN FITTINGS. Approach lamps and nav lights sit at
     * every berth in every model and have never been drawn. Taken by
     * PROXIMITY rather than by node name, for the reason berthApertures
     * gives: a ring mirrors its patterns, so two fittings on opposite
     * sides of the hub answer to the same name. */
    var reach = 0.9;                       // of the berth's own longest side
    var span = bx.min && bx.max
      ? Math.max(bx.max[0] - bx.min[0], bx.max[1] - bx.min[1], bx.max[2] - bx.min[2])
      : 0.2;
    var near = span * reach;
    ['lamps', 'navLights'].forEach(function (kind) {
      var list = (lib.anchors && lib.anchors[kind]) || [];
      for (var i = 0; i < list.length; i++) {
        var a = list[i];
        if (!a || !a.mid) continue;
        var dx = a.mid[0] - bx.mid[0], dy = a.mid[1] - bx.mid[1], dz = a.mid[2] - bx.mid[2];
        if (dx * dx + dy * dy + dz * dz > near * near) continue;
        /* The anchor's own size, floored so a fitting the converter wrote
         * as a three-metre box is still visible from a stand two hundred
         * metres away. It is a light: being a little large is how a light
         * reads at all. */
        var h = [0.02, 0.02, 0.02];
        if (a.min && a.max) {
          for (var q2 = 0; q2 < 3; q2++) {
            h[q2] = Math.max((a.max[q2] - a.min[q2]) * 0.5, 0.06 * L);
          }
        }
        var base2 = m.v.length;
        for (var c8 = 0; c8 < 8; c8++) {
          m.v.push([a.mid[0] + ((c8 & 1) ? h[0] : -h[0]),
                    a.mid[1] + ((c8 & 2) ? h[1] : -h[1]),
                    a.mid[2] + ((c8 & 4) ? h[2] : -h[2])]);
        }
        var qq = [[0,1,3,2],[4,6,7,5],[0,4,5,1],[2,3,7,6],[0,2,6,4],[1,5,7,3]];
        var col = kind === 'lamps' ? '!#ffd36b' : '!#7dffb0';
        for (var q3 = 0; q3 < qq.length; q3++) {
          m.f.push([base2 + qq[q3][0], base2 + qq[q3][1], base2 + qq[q3][2]]); m.c.push(col);
          m.f.push([base2 + qq[q3][0], base2 + qq[q3][2], base2 + qq[q3][3]]); m.c.push(col);
        }
      }
    });

    /* The stand's own footprint, in model units, recorded rather than
     * re-derived. The mesh also carries the station's approach lamps,
     * which sit where the art put them and therefore scale with the
     * station — so the mesh's bounding box is not the stand's size, and
     * anything asking that question (berths.test.js does) needs this. */
    m.padHalfA = padA;
    m.padHalfB = padB;

    DRESS[key] = m;
    DRESS_KEYS.push(key);
    /* A station's radius is a float off an rng, so this key is effectively
     * unique per station. Bounded rather than unbounded: a career visits
     * more ports than a cache should hold meshes for. */
    while (DRESS_KEYS.length > DRESS_MAX) delete DRESS[DRESS_KEYS.shift()];
    return m;
  }

  function drawStationModel(ctx, cam, frame, radiusKm, sunDir, model, tint, doors, section) {
    /* WITH THE DOORS SEPARATED when this model has any: the hull without
     * them, then each leaf at its own offset. `doors` is { open, berth }
     * — how far, and whose. Only the berth you are cleared into moves,
     * which is both cheaper and truer than a station opening every door it
     * has because one ship arrived. */
    var d = portDoors(model);
    if (d) {
      var open = doors && doors.open > 0 ? Math.min(1, doors.open) : 0;
      var mine = doors && typeof doors.berth === 'number' ? doors.berth : null;
      /* ONE COMPARTMENT AT A TIME when the caller names one. Astra's design:
       * the blast doors mean the renderer only ever has to draw the section
       * around the ship. Measured on spine-s, that is 27,808 faces down to
       * about 6,900 — and, more to the point, the room you are in stops
       * competing with six rooms you are not. `section` is null from
       * outside, where the whole hull is the point of the thing. */
      var sec = (typeof section === 'number' && section >= 0)
        ? portSections(model) : null;
      if (sec && sec.sections[section]) {
        /* THE BLAST DOOR DECIDES WHAT ELSE YOU SEE. Your own compartment
         * always; the rest of the station only once the inner gate is off
         * its seat. That is the whole of Astra's design — a shut door is an
         * opaque wall, and the concourse behind it is not drawn, not
         * because of a bounding box but because there is a door in the way.
         * It is also why the arrival's last leg means something: the gate
         * runs back and the station appears down the corridor. */
        var innerOpen = doors && doors.inner > 0.05;
        if (innerOpen) {
          paintPart(ctx, cam, frame, sec.structure.hull, radiusKm, sunDir, tint);
        }
        paintPart(ctx, cam, frame, sec.sections[section].hull, radiusKm, sunDir, tint);
        /* AND THE STAND ITSELF, when the caller named a berth. Drawn with
         * the compartment rather than with the hull because that is what it
         * belongs to: shut the blast door on this section and its deck
         * furniture goes with it. */
        if (mine !== null) {
          paintPart(ctx, cam, frame, berthDressing(model, mine, radiusKm),
                    radiusKm, sunDir, tint);
        }
      } else {
        paintPart(ctx, cam, frame, d.hull, radiusKm, sunDir, tint);
      }
      for (var i = 0; i < d.leaves.length; i++) {
        var lf = d.leaves[i];
        var f = open;
        if (mine !== null && lf.berthMid) {
          /* Whose door. Compared by POSITION rather than by index, because
           * the leaf knows which berth anchor it sits at and the caller
           * knows which berth it was given — and the only thing those two
           * share is where that berth is. */
          var want = doors.berthMid;
          if (want) {
            var dx = lf.berthMid[0] - want[0], dy = lf.berthMid[1] - want[1],
                dz = lf.berthMid[2] - want[2];
            if (dx * dx + dy * dy + dz * dz > 1e-6) f = 0;
          }
        }
        if (lf.field) {
          /* A field is not a door leaf. It is there or it is not. */
          if (f < 0.5) paintPart(ctx, cam, frame, lf.mesh, radiusKm, sunDir, tint);
          continue;
        }
        var s = lf.travel * f;
        var fr = s > 1e-9
          ? shiftFrame(frame, lf.axis[0] * s, lf.axis[1] * s, lf.axis[2] * s, radiusKm)
          : frame;
        paintPart(ctx, cam, fr, lf.mesh, radiusKm, sunDir, tint);
      }
      return;
    }
    var mesh = stationMeshes()[model] || stationMeshes().orbital;
    paintPart(ctx, cam, frame, mesh, radiusKm, sunDir, tint);
  }

  function paintPart(ctx, cam, frame, mesh, radiusKm, sunDir, tint) {
    if (!mesh || !mesh.f || !mesh.f.length) return;
    if (gpuWorld() && global.GLWorld.queueMesh(cam, frame, mesh, radiusKm, sunDir)) return;
    paintMesh(ctx, cam, frame, mesh, radiusKm, sunDir, tint, 'rgba(12,20,30,0.6)');
  }

  /* One named part of an IMPORTED port — the bucket a modeller separated
   * out. Returns false when there is nothing to draw, which is the normal
   * answer: the procedural ports have no parts, and a model that did not
   * declare a spinning ring simply has no `spin` bucket.
   *
   * Kept separate from drawStationModel rather than folded into it because
   * the two are drawn on DIFFERENT FRAMES — that is the whole reason the
   * split exists — and a function that took one frame and used two would be
   * lying about what it does. */
  function drawPortPart(ctx, cam, frame, radiusKm, sunDir, role, part, tint) {
    var lib = libPort(role);
    var mesh = lib && lib[part];
    if (!mesh || !mesh.f.length) return false;
    if (gpuWorld() && global.GLWorld.queueMesh(cam, frame, mesh, radiusKm, sunDir)) return true;
    paintMesh(ctx, cam, frame, mesh, radiusKm, sunDir, tint, 'rgba(12,20,30,0.6)');
    return true;
  }

  /* THE INSIDE OF AN ORBITAL STATION, which is the one part of a port you
   * can only see by being in it.
   *
   * The modelled interior FIRST. Every station in the shipped library
   * carries an `interior` bucket — hangar, berths, sliding doors, lit
   * fixtures — which libPort has been decompressing and caching since
   * imported ports arrived and which nothing has ever drawn. That is the
   * same class of bug PORT-MODELS.md records against the spin bucket:
   * converted, stored, and silently never rendered. Drawing it is most of
   * what this function is for; the procedural hall is what a station with
   * no model gets instead.
   *
   * SAME FRAME AS THE SHELL, and that is not an oversight. A model that
   * declares no `spin` bucket turns as one piece, and its interior is part
   * of that piece — put the room on a still frame and the hull it is
   * inside would rotate around it. When a model finally does separate its
   * ring, the hub (and this) stays on the still frame automatically,
   * because that is what the caller already passes for the shell. */
  /* The bounding box of a model's interior bucket, in its own normalised
   * units, cached per role. Cheap to compute once and the answer never
   * changes while the game is running. */
  /* ---- how far the boom can run, measured against the art ---------------
   *
   * ASTRA WAS ALMOST RIGHT, AND THE MEASUREMENT SAYS WHICH HALF. She said
   * we were flying into a space that is modelled but not cut out of the
   * station, so the camera buries in the wall. The cavity IS cut out. It
   * is simply SMALLER THAN THE BOOM. Sampling 144 directions from where a
   * hull actually parks, on a station of half a kilometre radius:
   *
   *     spine-s    berth 0   min 11 m   p25 17 m   median 32 m
   *     cradle-m   berth 1   min  1 m   p25  2 m   median 10 m
   *     ring-m     berth 0   min 10 m   p25 15 m   median 50 m
   *     cylinder-m berth 0   min 10 m   p25 15 m   median 63 m
   *
   * and of those 144 directions, 142 hit something: a berth is enclosed on
   * essentially every side, which is what a berth ought to be. So a boom of
   * any ordinary length puts the eye in the plating, every face it can see
   * is the back of a wall, and the screen fills with flat grey. That is the
   * whole of the bug. Not sort order, not winding, not the depth buffer,
   * not un-subtracted solid.
   *
   * WHY THE BOX AND THE GRID BOTH FAIL HERE, since both were tried. The
   * berth anchor is a BOX — 155 x 86 x 65 m on spine-s — and a box drawn
   * around an alcove contains the alcove's own pillars, gantries and back
   * wall, so a slab test against it happily concludes that seventy metres
   * of boom fits. The occupancy grid is a map of where a SHIP may fly, with
   * the throat deliberately carved open through solid plate, so along the
   * one axis that matters it reports room where there is metal. Neither is
   * a map of where the surfaces are. The triangles are.
   *
   * So this asks the triangles, once, and remembers. 16 yaw by 9 pitch from
   * the park point against shell, interior and spin, with a box reject
   * around the berth so the far side of the station is never tested: 72 ms
   * for the worst station in the library, cached for the life of the
   * session. The camera then costs a lookup.
   *
   * CONSERVATIVE ON PURPOSE. A lookup takes the SMALLEST of the four
   * samples bracketing the direction asked for, rather than interpolating
   * between them. Interpolation would smooth a pillar out of existence
   * exactly where the boom wants to go through it, and being a few metres
   * too close is a worse shot but a correct one, where being a few metres
   * too far is the grey screen again. */
  var BOOM_YAW = 16, BOOM_PITCH = 9;
  /* How far out to keep triangles for the test, in port radii. Comfortably
   * past the longest clear line measured in any bay (0.26 radii), so the
   * reject never hides a wall the boom could reach. */
  var BOOM_REACH = 0.5;
  var BOOM = {};

  function boomDir(iy, ip) {
    var yaw = (iy % BOOM_YAW) / BOOM_YAW * Math.PI * 2;
    var pit = (ip / (BOOM_PITCH - 1) - 0.5) * Math.PI;
    var cp = Math.cos(pit);
    return [cp * Math.cos(yaw), cp * Math.sin(yaw), Math.sin(pit)];
  }

  /* Moller-Trumbore, both-sided. Both-sided matters because the winding is
   * 50/50 from any viewpoint, inside or out — measured — so a front-face
   * test would miss half the walls in the room. */
  function boomHit(o, d, a, b, c) {
    var e1x = b[0] - a[0], e1y = b[1] - a[1], e1z = b[2] - a[2];
    var e2x = c[0] - a[0], e2y = c[1] - a[1], e2z = c[2] - a[2];
    var px = d[1] * e2z - d[2] * e2y,
        py = d[2] * e2x - d[0] * e2z,
        pz = d[0] * e2y - d[1] * e2x;
    var det = e1x * px + e1y * py + e1z * pz;
    if (det > -1e-12 && det < 1e-12) return -1;
    var inv = 1 / det;
    var tx = o[0] - a[0], ty = o[1] - a[1], tz = o[2] - a[2];
    var u = (tx * px + ty * py + tz * pz) * inv;
    if (u < -1e-6 || u > 1 + 1e-6) return -1;
    var qx = ty * e1z - tz * e1y,
        qy = tz * e1x - tx * e1z,
        qz = tx * e1y - ty * e1x;
    var v = (d[0] * qx + d[1] * qy + d[2] * qz) * inv;
    if (v < -1e-6 || u + v > 1 + 1e-6) return -1;
    var t = (e2x * qx + e2y * qy + e2z * qz) * inv;
    return t > 1e-6 ? t : -1;
  }

  /* Every triangle of every bucket that could possibly be within reach of
   * the park point, flattened once so the 144 rays share the work. */
  function boomTris(lib, o) {
    var out = [], keys = ['shell', 'interior', 'spin'];
    for (var k = 0; k < keys.length; k++) {
      /* The boom takes the shell WHOLE, doors included at their modelled
       * place. A camera should stand back from a doorway whether the leaf
       * is in it or not — the room is the room. */
      var m = lib[keys[k]];
      if (!m || !m.f) continue;
      for (var i = 0; i < m.f.length; i++) {
        var tri = m.f[i];
        for (var j = 1; j + 1 < tri.length; j++) {
          var a = m.v[tri[0]], b = m.v[tri[j]], c = m.v[tri[j + 1]];
          if (!a || !b || !c) continue;
          var far = false;
          for (var ax = 0; ax < 3; ax++) {
            var lo = Math.min(a[ax], b[ax], c[ax]);
            var hi = Math.max(a[ax], b[ax], c[ax]);
            if (lo > o[ax] + BOOM_REACH || hi < o[ax] - BOOM_REACH) { far = true; break; }
          }
          if (!far) out.push(a, b, c);
        }
      }
    }
    return out;
  }

  /* ---- where the deck actually is --------------------------------------
   *
   * A BERTH ANCHOR IS NOT A ROOM, AND READING IT AS ONE PARKED EVERY SHIP
   * IN THE GAME UNDER THE FLOOR.
   *
   * berthOffset took the anchor box's lower bound as the deck and rested a
   * hull a standoff above it. But the artist anchored these boxes with
   * their TOP at the deck and let them hang down through it into the
   * structure below — which is a perfectly ordinary way to place a volume,
   * and nothing in a bounding box says which end is which. Casting down the
   * berth's centreline from just under each box's own ceiling, across all
   * twelve modelled stations:
   *
   *     cradle   deck is 77.0-89.0 m above box.min[2]
   *     cylinder                96.5 m
   *     ring                78.5-91.5 m
   *     spine                64.0-74.5 m
   *
   * So the park point was sixty-four to ninety-six metres inside solid
   * plate, on every berth of every station in the library. That is a hull
   * in the floor, a camera orbiting a point in the floor, and a screen full
   * of the unlit back of a wall — which is what Astra has been looking at
   * and calling the interior "just as grey as the exterior". She had the
   * shape of it: we were inside geometry. It was not that the cavity had
   * never been cut; it was that we were parked below it.
   *
   * MEASURED, NOT ASSUMED, and that is the whole point — `max[2]` would be
   * right to within a couple of metres today, but it is right by
   * convention, and a station exported the other way up would put ships in
   * the ceiling with no test able to tell. The ray finds the plate the hull
   * will actually rest on. The result is sanity-checked back against the
   * box it came from, so a miss falls through to the convention rather than
   * to a number from nowhere. */
  var DECK = {};

  function berthDeck(role, i) {
    var lib = libPort(role);
    var mb = lib && lib.anchors && lib.anchors.berths;
    if (!mb || !mb.length) return null;
    var sorted = mb.slice().sort(function (a, b) {
      return a.mid[0] - b.mid[0] || a.mid[1] - b.mid[1] || a.mid[2] - b.mid[2];
    });
    var k = ((i % sorted.length) + sorted.length) % sorted.length;
    var key = role + '#' + k;
    if (DECK[key] !== undefined) return DECK[key];

    var b = sorted[k];
    if (!b || !b.mid || !b.min || !b.max) { DECK[key] = null; return null; }

    /* Start a hair under the box's own ceiling so the cast begins in the
     * open air of the alcove rather than on the lid of the box. */
    var o = [b.mid[0], b.mid[1], b.max[2] - 1e-4];
    var T = boomTris(lib, o), best = Infinity;
    for (var t = 0; t < T.length; t += 3) {
      var h = boomHit(o, [0, 0, -1], T[t], T[t + 1], T[t + 2]);
      if (h > 0 && h < best) best = h;
    }
    var z = isFinite(best) ? o[2] - best : null;
    /* A deck outside the box it belongs to is not this berth's deck. */
    if (z === null || z < b.min[2] || z > b.max[2]) z = b.max[2];
    DECK[key] = z;
    return z;
  }

  /* The table for one berth of one model, in PORT RADII, built on first
   * ask. Null when the model declares no berths — a procedural station has
   * no art to measure and falls back to its own table upstream. */
  function berthBoom(role, i) {
    var lib = libPort(role);
    var mb = lib && lib.anchors && lib.anchors.berths;
    if (!mb || !mb.length) return null;
    /* THE SAME ORDER generate.js sorts by, and it has to be: a table built
     * against berth 3 and read for berth 5 is the camera in a wall again,
     * only intermittently. */
    var sorted = mb.slice().sort(function (a, b) {
      return a.mid[0] - b.mid[0] || a.mid[1] - b.mid[1] || a.mid[2] - b.mid[2];
    });
    var k = ((i % sorted.length) + sorted.length) % sorted.length;
    var key = role + '#' + k;
    if (BOOM[key] !== undefined) return BOOM[key];

    var b = sorted[k];
    if (!b || !b.mid) { BOOM[key] = null; return null; }
    /* WHERE THE EYE ACTUALLY IS, not where the box is centred. The hull
     * rests a standoff off the deck and the camera orbits the hull, so the
     * measurement starts there or it measures the wrong room. */
    /* THE DECK, not the box floor — see berthDeck. Measuring the room from
     * a point buried in the plating answers about the plating. */
    var deck = berthDeck(role, k);
    if (deck === null) deck = b.min ? b.min[2] : b.mid[2];
    /* A NOMINAL LIFT, and it has to be nominal.
     *
     * This used to ask Gen.bayGeometry with a stub port pinned at radius 1
     * — the third time a stub port has quietly stood in for a real one in
     * this file. It was harmless while `standoff` was a pure fraction of
     * the radius, because then the answer did not depend on the radius at
     * all. It is not harmless now: the real clearance is an absolute six
     * metres measured off the tallest hull in the fleet (see
     * cappedStandoff), so it is a DIFFERENT fraction at every station
     * wearing this model, and a table cached per role cannot hold it.
     *
     * It does not need to. This table is the camera's reach, not the
     * ship's placement: it asks how much room there is around the stand,
     * and the difference between six metres and eighty off the deck is
     * nothing against a throat nine hundred metres tall. So the lift is a
     * fixed fraction stated here, the table stays cacheable per role, and
     * berths.test.js's buried threshold — which was measured against this
     * exact number — keeps meaning what it measured. */
    var BOOM_LIFT = 0.012;
    var o = [b.mid[0], b.mid[1], deck + BOOM_LIFT];

    var T = boomTris(lib, o);
    var d = new Float32Array(BOOM_YAW * BOOM_PITCH);
    for (var iy = 0; iy < BOOM_YAW; iy++) {
      for (var ip = 0; ip < BOOM_PITCH; ip++) {
        var dir = boomDir(iy, ip), best = Infinity;
        for (var t = 0; t < T.length; t += 3) {
          var h = boomHit(o, dir, T[t], T[t + 1], T[t + 2]);
          if (h > 0 && h < best) best = h;
        }
        d[iy * BOOM_PITCH + ip] = isFinite(best) ? best : BOOM_REACH * 2;
      }
    }
    BOOM[key] = { yaw: BOOM_YAW, pitch: BOOM_PITCH, d: d, origin: o };
    return BOOM[key];
  }

  /* How far the boom may run from this berth along this direction, in port
   * radii, or Infinity when there is nothing measured to say otherwise.
   * `dir` is a unit vector in the MODEL's frame: +x east, +y north, +z up,
   * the same axes stationFrame hands the renderer. */
  function boomLimit(role, i, dir) {
    var tb = berthBoom(role, i);
    if (!tb || !dir) return Infinity;
    var x = dir[0], y = dir[1], z = dir[2];
    var len = Math.sqrt(x * x + y * y + z * z);
    if (!(len > 1e-9)) return Infinity;
    x /= len; y /= len; z /= len;
    var yaw = Math.atan2(y, x);
    if (yaw < 0) yaw += Math.PI * 2;
    var fy = yaw / (Math.PI * 2) * tb.yaw;
    var fp = (Math.asin(Math.max(-1, Math.min(1, z))) / Math.PI + 0.5) * (tb.pitch - 1);
    var y0 = Math.floor(fy), p0 = Math.floor(fp);
    var best = Infinity;
    for (var a = 0; a <= 1; a++) {
      for (var c = 0; c <= 1; c++) {
        var yi = ((y0 + a) % tb.yaw + tb.yaw) % tb.yaw;
        var pi = Math.max(0, Math.min(tb.pitch - 1, p0 + c));
        var v = tb.d[yi * tb.pitch + pi];
        if (v < best) best = v;
      }
    }
    return best;
  }

  var INTERIOR_BOUNDS = {};
  function meshBounds(mesh) {
    if (!mesh || !mesh.v || !mesh.v.length) return null;
    var lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (var i = 0; i < mesh.v.length; i++) {
      for (var a = 0; a < 3; a++) {
        var x = mesh.v[i][a];
        if (x < lo[a]) lo[a] = x;
        if (x > hi[a]) hi[a] = x;
      }
    }
    return { lo: lo, hi: hi };
  }
  function interiorBounds(role) {
    if (INTERIOR_BOUNDS[role] !== undefined) return INTERIOR_BOUNDS[role];
    var lib = libPort(role);
    /* WHICHEVER MESH drawStationInterior WILL ACTUALLY DRAW — the model's
     * own interior when it has one, the procedural hall when it does not.
     * Three of the fifteen orbital models (the city ports) carry no
     * interior bucket, and measuring only the modelled ones would have
     * answered "you are not inside" at every one of them forever: the room
     * would be drawn by the fallback and gated by a box that did not exist.
     * The two have to come from the same place or they drift. */
    var out = meshBounds(lib && lib.interior) || meshBounds(stationMeshes().hall);
    INTERIOR_BOUNDS[role] = out;
    return out;
  }

  /* ---- IS THIS POINT INSIDE A STATION, AND IS IT INSIDE THE WALL? -------
   *
   * Astra: "no collision detection enabled on the interiors or exteriors of
   * stations", and her call on what to do about it — solid hull, open door.
   * You cannot fly through a station; the way in is the way in.
   *
   * WHY A GRID. A station is not a shape you can write down. A ring is
   * mostly hole, a spine is arms with gaps between them, and the useful
   * question — "is there metal here" — has no closed form. Testing the
   * model's eighteen thousand triangles every frame is out of the question
   * on the Latitude. So the model is voxelised ONCE per role into a coarse
   * occupancy grid and every later question is an array index.
   *
   * Three states, and the third is the one that does the interesting work:
   *   SOLID   — a shell or interior surface passes through this cell.
   *   OUTSIDE — open space reachable from beyond the model.
   *   INSIDE  — open space that is NOT, i.e. a room.
   * INSIDE is found by flooding from the grid's own border, so it needs no
   * definition of "inside" beyond "the outside cannot get here". That is
   * what lets a ring be mostly hole and still have a hangar.
   *
   * THE DOORS ARE CUT AFTERWARDS, and the order matters: a station with its
   * throats open really IS connected to space, so a flood that ran after the
   * carve would find the hangar from outside and call the whole interior
   * OUTSIDE. Flood first, carve second, and a throat's cells are recorded as
   * inside — which is also what makes the world go away at the right moment
   * on the way in.
   *
   * RESOLUTION is a compromise stated rather than hidden. 48 cells across
   * the model is 8.8 m at the smallest station the generator makes and 47 m
   * at the largest — finer than a hull at the small end and coarser at the
   * big one. The doors are what a coarse cell would lose, and the doors are
   * carved explicitly, so the resolution never has to find them. */
  /* ---- the triangles themselves, indexed -------------------------------
   *
   * WHY THE VOXEL GRID BELOW IS NOT ENOUGH, AND WHY THAT ONLY BECAME TRUE
   * RECENTLY. SOLID_N is 48 cells across the model, whatever size the model
   * is. At STATION_SCALE 0.35 that made a cell 9-47 m — about the length of
   * a hull, so the grid genuinely approximated the station and a point test
   * against it was a fair collision check. At 3.5 a cell is 88-466 m. The
   * ship is 25 m. A single cell is up to eighteen hull-lengths across, and
   * at that resolution the grid cannot represent a wall, a doorway or a
   * berth: everything is mush, and Astra's report was exactly right —
   * collision stopped working when the stations grew.
   *
   * RAISING THE RESOLUTION DOES NOT SAVE IT. Ship-sized cells at an 11 km
   * radius would be 896 to a side: 719 million cells, per model. A uniform
   * occupancy volume is simply the wrong structure once stations differ in
   * size by five times and dwarf the thing colliding with them.
   *
   * SO ASK THE TRIANGLES. A segment against a surface needs no volume and
   * no resolution: "did this path cross a face" is exact at any scale, and
   * it kills tunnelling for free because it tests the whole step rather
   * than the endpoint.
   *
   * A CORRECTION WORTH KEEPING, because it was asserted here in the wrong
   * form first. An earlier note in this file said these meshes are not
   * watertight, on a raw count of 36,698 edges used once against 9,113
   * shared. That count is an artefact: the models carry SPLIT VERTICES for
   * flat shading, so one seam is several unshared edges at identical
   * positions. Welded by position, spine, ring and cradle have ZERO
   * boundary edges — they are closed solids. Only cylinder (4 loops) and
   * city-port (16) have real openings, and those are the ends and mouths
   * the art means to leave open. The tests here stay both-sided anyway:
   * it costs nothing, and it is correct whether or not the next imported
   * model is closed.
   *
   * The index is a uniform grid of TRIANGLE LISTS — cheap to build, cheap to
   * query, and built once per model and cached. Queries here are always
   * local (a ship's step is metres, a camera boom a few hundred), so a
   * query gathers the cells its own bounding box touches rather than
   * walking a DDA. That is a superset of the cells the segment crosses,
   * which costs a few extra triangle tests and cannot miss one.
   *
   * The occupancy grid stays. It answers a different question — "is this
   * point in a ROOM of the station", which is about enclosure, not about
   * surfaces — and it is the right tool for that. */
  var TRI_N = 32;
  var TRIDEX = {};

  function portTriangles(role) {
    if (TRIDEX[role] !== undefined) return TRIDEX[role];
    TRIDEX[role] = null;
    var lib = libPort(role);
    if (!lib) return null;

    /* THE HULL WITHOUT ITS DOOR LEAVES. They used to be in here, baked at
     * their CLOSED position, which made a shut door solid by accident and
     * an open one solid on purpose — you could not fly through a door that
     * had run all the way back into its pocket. Leaves are tested
     * separately, at wherever they actually are this frame; see leafHit. */
    var d0 = portDoors(role);
    var tri = [], keys = ['shell', 'interior', 'spin'];
    var lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (var k = 0; k < keys.length; k++) {
      var m = (keys[k] === 'shell' && d0) ? d0.hull : lib[keys[k]];
      if (!m || !m.v || !m.f) continue;
      for (var i = 0; i < m.f.length; i++) {
        var f = m.f[i];
        for (var j = 1; j + 1 < f.length; j++) {
          var a = m.v[f[0]], b = m.v[f[j]], c = m.v[f[j + 1]];
          if (!a || !b || !c) continue;
          tri.push(a, b, c);
          for (var ax = 0; ax < 3; ax++) {
            var mn = Math.min(a[ax], b[ax], c[ax]), mx = Math.max(a[ax], b[ax], c[ax]);
            if (mn < lo[ax]) lo[ax] = mn;
            if (mx > hi[ax]) hi[ax] = mx;
          }
        }
      }
    }
    if (!tri.length) return null;

    var N = TRI_N, size = [0, 0, 0], inv = [0, 0, 0];
    for (var ax2 = 0; ax2 < 3; ax2++) {
      /* A flat model — a ring is nearly one — would divide by zero on its
       * thin axis and index every triangle into one plane of cells. */
      size[ax2] = Math.max(1e-6, hi[ax2] - lo[ax2]);
      inv[ax2] = N / size[ax2];
    }
    var bins = new Array(N * N * N);
    var clamp = function (v) { return v < 0 ? 0 : (v > N - 1 ? N - 1 : v); };
    for (var t = 0; t < tri.length; t += 3) {
      var p0 = tri[t], p1 = tri[t + 1], p2 = tri[t + 2];
      var c0 = [], c1 = [];
      for (var ax3 = 0; ax3 < 3; ax3++) {
        c0[ax3] = clamp(Math.floor((Math.min(p0[ax3], p1[ax3], p2[ax3]) - lo[ax3]) * inv[ax3]));
        c1[ax3] = clamp(Math.floor((Math.max(p0[ax3], p1[ax3], p2[ax3]) - lo[ax3]) * inv[ax3]));
      }
      for (var x = c0[0]; x <= c1[0]; x++) {
        for (var y = c0[1]; y <= c1[1]; y++) {
          for (var z = c0[2]; z <= c1[2]; z++) {
            var b2 = (x * N + y) * N + z;
            if (!bins[b2]) bins[b2] = [];
            bins[b2].push(t);
          }
        }
      }
    }
    TRIDEX[role] = { n: N, lo: lo, inv: inv, tri: tri, bins: bins, mark: 0,
                     seen: new Int32Array(tri.length / 3) };
    return TRIDEX[role];
  }

  /* ---- a door is solid where it actually is ------------------------------
   *
   * A blast door is the one part of a station that MOVES, so it is the one
   * part the baked triangle index cannot answer for. Each leaf slides along
   * its own axis by `travel * open`; testing the segment against a leaf is
   * therefore the same as testing the segment SHIFTED THE OTHER WAY against
   * the leaf where it is modelled. One subtraction, no rebuilt geometry,
   * and it costs nothing when the doors are shut because that is offset
   * zero.
   *
   * Only the leaves that could be in the way are tested: a station carries
   * 28 of them and a ship is near at most a couple. */
  /* Segment against one triangle, both-sided, returning the same
   * { t, normal } shape portSegmentHit does so a caller can compare hits
   * from the index and from a moving leaf without caring which is which.
   * `t` is the fraction along a->b, so it is directly comparable. */
  function segTri(a, b, p0, p1, p2) {
    if (!p0 || !p1 || !p2) return null;
    var dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
    var e1x = p1[0] - p0[0], e1y = p1[1] - p0[1], e1z = p1[2] - p0[2];
    var e2x = p2[0] - p0[0], e2y = p2[1] - p0[1], e2z = p2[2] - p0[2];
    var hx = dy * e2z - dz * e2y,
        hy = dz * e2x - dx * e2z,
        hz = dx * e2y - dy * e2x;
    var det = e1x * hx + e1y * hy + e1z * hz;
    if (det > -1e-12 && det < 1e-12) return null;
    var f = 1 / det;
    var sx = a[0] - p0[0], sy = a[1] - p0[1], sz = a[2] - p0[2];
    var u = (sx * hx + sy * hy + sz * hz) * f;
    if (u < -1e-6 || u > 1 + 1e-6) return null;
    var qx = sy * e1z - sz * e1y,
        qy = sz * e1x - sx * e1z,
        qz = sx * e1y - sy * e1x;
    var v = (dx * qx + dy * qy + dz * qz) * f;
    if (v < -1e-6 || u + v > 1 + 1e-6) return null;
    var t = (e2x * qx + e2y * qy + e2z * qz) * f;
    if (t < 0 || t > 1) return null;
    var nx = e1y * e2z - e1z * e2y,
        ny = e1z * e2x - e1x * e2z,
        nz = e1x * e2y - e1y * e2x;
    var nl = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
    nx /= nl; ny /= nl; nz /= nl;
    if (nx * dx + ny * dy + nz * dz > 0) { nx = -nx; ny = -ny; nz = -nz; }
    return { t: t, normal: [nx, ny, nz] };
  }

  var LEAF_BOUNDS = {};

  function leafBounds(role) {
    if (LEAF_BOUNDS[role] !== undefined) return LEAF_BOUNDS[role];
    LEAF_BOUNDS[role] = null;
    var d = portDoors(role);
    if (!d) return null;
    var out = [];
    for (var i = 0; i < d.leaves.length; i++) {
      var lf = d.leaves[i], m = lf.mesh;
      var lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
      for (var f = 0; f < m.f.length; f++) {
        var face = m.f[f];
        for (var v = 0; v < face.length; v++) {
          var p = m.v[face[v]];
          if (!p) continue;
          for (var a = 0; a < 3; a++) {
            if (p[a] < lo[a]) lo[a] = p[a];
            if (p[a] > hi[a]) hi[a] = p[a];
          }
        }
      }
      out.push({ lo: lo, hi: hi });
    }
    LEAF_BOUNDS[role] = out;
    return out;
  }

  /* `doors` is the same { open, berthMid } shape the renderer takes, so the
   * thing you collide with and the thing you see are driven by one value. */
  function leafHit(role, a, b, doors) {
    var d = portDoors(role), bounds = leafBounds(role);
    if (!d || !bounds) return null;
    var open = (doors && doors.open > 0) ? Math.min(1, doors.open) : 0;
    var want = doors && doors.berthMid;
    var best = null;
    for (var i = 0; i < d.leaves.length; i++) {
      var lf = d.leaves[i];
      /* Only the berth that was given clearance moves; every other leaf in
       * the station is shut, which is the same rule drawStationModel uses. */
      var f = open;
      if (want && lf.berthMid) {
        var dx = lf.berthMid[0] - want[0], dy = lf.berthMid[1] - want[1],
            dz = lf.berthMid[2] - want[2];
        if (dx * dx + dy * dy + dz * dz > 1e-6) f = 0;
      }
      /* A force field is there or it is not — and when it is not, it is not
       * anything you can hit. */
      if (lf.field && f >= 0.5) continue;
      var ox = lf.axis[0] * lf.travel * f,
          oy = lf.axis[1] * lf.travel * f,
          oz = lf.axis[2] * lf.travel * f;
      var a2 = [a[0] - ox, a[1] - oy, a[2] - oz];
      var b2 = [b[0] - ox, b[1] - oy, b[2] - oz];
      var bd = bounds[i];
      /* Cheap reject against the leaf's own box before any triangle work. */
      var miss = false;
      for (var ax = 0; ax < 3; ax++) {
        if (Math.min(a2[ax], b2[ax]) > bd.hi[ax] ||
            Math.max(a2[ax], b2[ax]) < bd.lo[ax]) { miss = true; break; }
      }
      if (miss) continue;
      var m = lf.mesh;
      for (var fi = 0; fi < m.f.length; fi++) {
        var face = m.f[fi];
        for (var j = 1; j + 1 < face.length; j++) {
          var h = segTri(a2, b2, m.v[face[0]], m.v[face[j]], m.v[face[j + 1]]);
          if (h && (!best || h.t < best.t)) best = h;
        }
      }
    }
    return best;
  }

  /* Moller-Trumbore, BOTH-SIDED — see the note above on watertightness. `a`
   * and `b` are in the model's normalised frame. Returns null, or
   * { t, normal } with t in [0,1] along the segment and the normal turned
   * to face back along it, which is the direction anything pushed out of
   * this surface has to go. */
  function portSegmentHit(role, a, b, doors) {
    var ix = portTriangles(role);
    if (!ix) return null;
    var N = ix.n, lo = ix.lo, inv = ix.inv, tri = ix.tri, bins = ix.bins;
    var dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
    if (dx === 0 && dy === 0 && dz === 0) return null;

    var c0 = [], c1 = [];
    for (var ax = 0; ax < 3; ax++) {
      var s0 = Math.floor((Math.min(a[ax], b[ax]) - lo[ax]) * inv[ax]);
      var s1 = Math.floor((Math.max(a[ax], b[ax]) - lo[ax]) * inv[ax]);
      /* Wholly outside the model on any axis: nothing to hit. */
      if (s1 < 0 || s0 > N - 1) return null;
      c0[ax] = s0 < 0 ? 0 : s0;
      c1[ax] = s1 > N - 1 ? N - 1 : s1;
    }

    /* One stamp per query so a triangle spanning several cells is tested
     * once, without clearing an array of 32768 bins between calls. */
    ix.mark++;
    var mark = ix.mark, seen = ix.seen;
    var best = Infinity, bn = null;
    for (var x = c0[0]; x <= c1[0]; x++) {
      for (var y = c0[1]; y <= c1[1]; y++) {
        for (var z = c0[2]; z <= c1[2]; z++) {
          var bin = bins[(x * N + y) * N + z];
          if (!bin) continue;
          for (var q = 0; q < bin.length; q++) {
            var t0 = bin[q];
            if (seen[t0 / 3] === mark) continue;
            seen[t0 / 3] = mark;
            var p0 = tri[t0], p1 = tri[t0 + 1], p2 = tri[t0 + 2];
            var e1x = p1[0] - p0[0], e1y = p1[1] - p0[1], e1z = p1[2] - p0[2];
            var e2x = p2[0] - p0[0], e2y = p2[1] - p0[1], e2z = p2[2] - p0[2];
            var hx = dy * e2z - dz * e2y,
                hy = dz * e2x - dx * e2z,
                hz = dx * e2y - dy * e2x;
            var det = e1x * hx + e1y * hy + e1z * hz;
            if (det > -1e-12 && det < 1e-12) continue;
            var f = 1 / det;
            var sx = a[0] - p0[0], sy = a[1] - p0[1], sz = a[2] - p0[2];
            var u = (sx * hx + sy * hy + sz * hz) * f;
            if (u < -1e-6 || u > 1 + 1e-6) continue;
            var qx = sy * e1z - sz * e1y,
                qy = sz * e1x - sx * e1z,
                qz = sx * e1y - sy * e1x;
            var vv = (dx * qx + dy * qy + dz * qz) * f;
            if (vv < -1e-6 || u + vv > 1 + 1e-6) continue;
            var tt = (e2x * qx + e2y * qy + e2z * qz) * f;
            if (tt < 0 || tt > 1 || tt >= best) continue;
            best = tt;
            var nx = e1y * e2z - e1z * e2y,
                ny = e1z * e2x - e1x * e2z,
                nz = e1x * e2y - e1y * e2x;
            var nl = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
            nx /= nl; ny /= nl; nz /= nl;
            /* Face it back along the segment: both-sided hits mean the
             * winding cannot be trusted to say which side we came from. */
            if (nx * dx + ny * dy + nz * dz > 0) { nx = -nx; ny = -ny; nz = -nz; }
            bn = [nx, ny, nz];
          }
        }
      }
    }
    var hull = bn ? { t: best, normal: bn } : null;
    /* AND THE DOORS, which the index cannot hold because they move. Nearest
     * of the two wins, so a leaf sliding shut in front of you stops you
     * before the wall behind it does. */
    var leaf = leafHit(role, a, b, doors);
    if (leaf && (!hull || leaf.t < hull.t)) return leaf;
    return hull;
  }

  var SOLID_N = 48;
  var SOLID_EMPTY = 0, SOLID_WALL = 1, SOLID_OUT = 2, SOLID_IN = 3, SOLID_DOOR = 4;

  function meshInto(grid, mesh, lo, inv) {
    if (!mesh || !mesh.v || !mesh.f) return;
    var V3 = mesh.v, F = mesh.f, N = SOLID_N;
    for (var fi = 0; fi < F.length; fi++) {
      var t = F[fi];
      var a = V3[t[0]], b = V3[t[1]], c = V3[t[2]];
      if (!a || !b || !c) continue;
      /* Sample density from the triangle's own size in cells, so a big
       * panel is not left with holes a ship could slip through and a rivet
       * is not sampled a thousand times. */
      var e1 = 0, e2 = 0, k;
      for (k = 0; k < 3; k++) {
        e1 = Math.max(e1, Math.abs(b[k] - a[k]) * inv[k]);
        e2 = Math.max(e2, Math.abs(c[k] - a[k]) * inv[k]);
      }
      var n = Math.max(1, Math.ceil(Math.max(e1, e2)));
      if (n > 64) n = 64;                  // a single triangle is not a budget
      for (var i = 0; i <= n; i++) {
        for (var j = 0; i + j <= n; j++) {
          var u = i / n, v = j / n;
          var gx = Math.floor(((a[0] + (b[0] - a[0]) * u + (c[0] - a[0]) * v) - lo[0]) * inv[0]);
          var gy = Math.floor(((a[1] + (b[1] - a[1]) * u + (c[1] - a[1]) * v) - lo[1]) * inv[1]);
          var gz = Math.floor(((a[2] + (b[2] - a[2]) * u + (c[2] - a[2]) * v) - lo[2]) * inv[2]);
          if (gx < 0 || gy < 0 || gz < 0 || gx >= N || gy >= N || gz >= N) continue;
          grid[(gz * N + gy) * N + gx] = SOLID_WALL;
        }
      }
    }
  }

  function portSolidity(role) {
    if (SOLIDITY[role] !== undefined) return SOLIDITY[role];
    var lib = libPort(role);
    /* Cached as null FIRST so a model with no mesh is not re-examined every
     * frame, and overwritten with the grid at the end. Forgetting that
     * second half is what made this return a grid the first time it was
     * asked and null forever afterwards — which reads exactly like the
     * feature not working, because it is not. */
    SOLIDITY[role] = null;
    var shell = lib && lib.shell;
    if (!shell || !shell.v || !shell.v.length || !shell.f || !shell.f.length) return null;

    var N = SOLID_N, i, j, a;
    var lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    function span(mesh) {
      if (!mesh || !mesh.v) return;
      for (var q = 0; q < mesh.v.length; q++) {
        for (var a = 0; a < 3; a++) {
          var x = mesh.v[q][a];
          if (x < lo[a]) lo[a] = x;
          if (x > hi[a]) hi[a] = x;
        }
      }
    }
    span(shell);
    span(lib.interior);
    if (!isFinite(lo[0])) return null;
    /* A margin of one cell all round, so the flood always has a border of
     * open space to start from even when the hull touches the bound. */
    var size = [0, 0, 0], inv = [0, 0, 0];
    for (a = 0; a < 3; a++) {
      var pad = Math.max(1e-4, (hi[a] - lo[a]) * 0.04);
      lo[a] -= pad; hi[a] += pad;
      size[a] = hi[a] - lo[a];
      inv[a] = N / size[a];
    }

    var grid = new Uint8Array(N * N * N);
    meshInto(grid, shell, lo, inv);
    meshInto(grid, lib.interior, lo, inv);

    /* FLOOD FROM THE BORDER. Everything open that space can reach is
     * outside; everything else open is a room. */
    var stack = new Int32Array(N * N * N);
    var top = 0;
    function push(x, y, z) {
      if (x < 0 || y < 0 || z < 0 || x >= N || y >= N || z >= N) return;
      var idx = (z * N + y) * N + x;
      if (grid[idx] !== SOLID_EMPTY) return;
      grid[idx] = SOLID_OUT;
      stack[top++] = idx;
    }
    for (i = 0; i < N; i++) {
      for (j = 0; j < N; j++) {
        push(i, j, 0); push(i, j, N - 1);
        push(i, 0, j); push(i, N - 1, j);
        push(0, i, j); push(N - 1, i, j);
      }
    }
    while (top > 0) {
      var idx2 = stack[--top];
      var z0 = (idx2 / (N * N)) | 0, r = idx2 - z0 * N * N;
      var y0 = (r / N) | 0, x0 = r - y0 * N;
      push(x0 + 1, y0, z0); push(x0 - 1, y0, z0);
      push(x0, y0 + 1, z0); push(x0, y0 - 1, z0);
      push(x0, y0, z0 + 1); push(x0, y0, z0 - 1);
    }
    for (i = 0; i < grid.length; i++) {
      if (grid[i] === SOLID_EMPTY) grid[i] = SOLID_IN;
    }

    SOLIDITY[role] = { n: N, lo: lo, inv: inv, size: size, grid: grid, carved: false };
    return SOLIDITY[role];
  }

  /* CUT THE DOORS. Done from sim.js rather than here, because which berths a
   * port has is a question generate.js answers and this module has no
   * business asking it twice. Marks a corridor along the berth's own normal
   * as room rather than wall, from well outside the doors to the berth and a
   * little past it.
   *
   * The corridor radius is the mouth radius the bay tables already use, so a
   * door cut here is the same size as a door drawn anywhere else. It is
   * generous at a big station — the cut is in station radii and the ship is
   * not — which can let a hull clip a doorframe it should have hit. Better
   * that than a door too narrow to fly through at the small end, where the
   * ship is largest relative to the station. */
  function carveThroat(sol, from, dir, length, radius) {
    if (!sol || !sol.grid) return;
    var N = sol.n, g = sol.grid;
    var steps = Math.max(2, Math.ceil(length * Math.max(sol.inv[0], sol.inv[1], sol.inv[2]) * 2));
    var rc = [Math.ceil(radius * sol.inv[0]), Math.ceil(radius * sol.inv[1]),
              Math.ceil(radius * sol.inv[2])];
    for (var s = 0; s <= steps; s++) {
      var d = (s / steps) * length;
      var px = from[0] + dir[0] * d, py = from[1] + dir[1] * d, pz = from[2] + dir[2] * d;
      var cx = Math.floor((px - sol.lo[0]) * sol.inv[0]);
      var cy = Math.floor((py - sol.lo[1]) * sol.inv[1]);
      var cz = Math.floor((pz - sol.lo[2]) * sol.inv[2]);
      for (var dz = -rc[2]; dz <= rc[2]; dz++) {
        for (var dy = -rc[1]; dy <= rc[1]; dy++) {
          for (var dx = -rc[0]; dx <= rc[0]; dx++) {
            var x = cx + dx, y = cy + dy, z = cz + dz;
            if (x < 0 || y < 0 || z < 0 || x >= N || y >= N || z >= N) continue;
            /* ONLY METAL IS REMOVED. A carve that wrote "room" along its
             * whole length invented rooms in open space: the corridor leads
             * in from well outside the hull, so a ship holding off the doors
             * came out as ENCLOSED and the sky went away while it was still
             * in the open. Cutting a doorway takes away the door — it does
             * not move the outside indoors, and it does not fill in the
             * hangar the corridor ends in either. */
            var at = (z * N + y) * N + x;
            if (g[at] === SOLID_WALL) g[at] = SOLID_DOOR;
          }
        }
      }
    }
    sol.carved = true;
  }

  /* What is at this point, in the model's own normalised frame?
   * 0 nothing known, 1 wall, 2 open space outside, 3 a room. */
  function solidityAt(sol, x, y, z) {
    if (!sol) return SOLID_OUT;
    var N = sol.n;
    var gx = Math.floor((x - sol.lo[0]) * sol.inv[0]);
    var gy = Math.floor((y - sol.lo[1]) * sol.inv[1]);
    var gz = Math.floor((z - sol.lo[2]) * sol.inv[2]);
    if (gx < 0 || gy < 0 || gz < 0 || gx >= N || gy >= N || gz >= N) return SOLID_OUT;
    return sol.grid[(gz * N + gy) * N + gx];
  }

  /* IS THE EYE ACTUALLY IN THAT ROOM?
   *
   * Being berthed at a station is not the same as being in its hangar. The
   * ring parks four of its five ships in alcoves out on the rim while the
   * `interior` bucket is the hall at the hub — and painting a hall you are
   * not standing in is the slab bug all over again, because paintMesh sorts
   * within one mesh and the interior would land on top of the alcove wall a
   * few metres from your face. So the room has to contain the eye.
   *
   * Generous by a tenth of the room, because a camera pressed against the
   * inside of a doorway should not make the room it is looking into blink
   * out. */
  function insideInterior(cam, frame, radiusKm, role) {
    var b = interiorBounds(role);
    if (!b || !cam || !cam.eye || !frame || !(radiusKm > 0)) return false;
    var rx = cam.eye.x - frame.pos.x,
        ry = cam.eye.y - frame.pos.y,
        rz = cam.eye.z - frame.pos.z;
    var local = [
      (rx * frame.right.x + ry * frame.right.y + rz * frame.right.z) / radiusKm,
      (rx * frame.up.x + ry * frame.up.y + rz * frame.up.z) / radiusKm,
      (rx * frame.fwd.x + ry * frame.fwd.y + rz * frame.fwd.z) / radiusKm
    ];
    /* AN INSET, NOT A SLACK — and the sign of this number is the whole
     * grey-slab bug.
     *
     * It used to grow the box by 10 per cent, on the reasoning that a
     * bounding box is approximate and being generous errs kindly. It does
     * not. The `interior` bucket is a CONCOURSE running down the spine of
     * the station, and its bounding box already reaches across the alcoves
     * on either side of it; growing that box further swallows the berths
     * whole. Measured in the running game, berthed: the eye sat at x
     * -0.247 against a hall spanning -0.219 to 0.219, i.e. OUTSIDE the
     * room — and the 10 per cent let it in by 0.017. The hall was then
     * painted last, over the deck, over the bay, over the ship.
     *
     * berths.test.js has been printing the fact all along: "0 of 48
     * modelled berths sit inside their station's own interior volume." A
     * berth is not in the hall. So the test is now strict about its edges
     * and pulls IN slightly, which costs a little of the concourse at the
     * very moment you enter it and never paints it over a room you are
     * actually in. Wrong-and-invisible beats wrong-and-covering-everything. */
    for (var a = 0; a < 3; a++) {
      var inset = (b.hi[a] - b.lo[a]) * 0.05;
      if (local[a] < b.lo[a] + inset || local[a] > b.hi[a] - inset) return false;
    }
    return true;
  }

  function drawStationInterior(ctx, cam, frame, radiusKm, sunDir, role, tint) {
    if (drawPortPart(ctx, cam, frame, radiusKm, sunDir, role, 'interior', tint)) return true;
    var mesh = stationMeshes().hall;
    if (!mesh || !mesh.f.length) return false;
    if (gpuWorld() && global.GLWorld.queueMesh(cam, frame, mesh, radiusKm, sunDir)) return true;
    paintMesh(ctx, cam, frame, mesh, radiusKm, sunDir, tint, 'rgba(12,20,30,0.6)');
    return true;
  }

  /* Does this role's model turn part of itself? The caller needs to know
   * BEFORE it picks a frame, so it cannot be answered by trying to draw. */
  function portSpins(role) {
    var lib = libPort(role);
    return !!(lib && lib.spin && lib.spin.f.length);
  }

  /* An on-screen arrow. Direction is shown as an actual arrow pointing the
   * way, never as the words "left" or "right". */
  function drawArrow(ctx, x, y, dx, dy, length, color, width, headSize) {
    var l = Math.sqrt(dx * dx + dy * dy);
    if (l < 1e-9) return;
    dx /= l; dy /= l;
    var ex = x + dx * length, ey = y + dy * length;
    headSize = headSize || 7;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = width || 1.5;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(ex - dx * headSize * 0.8, ey - dy * headSize * 0.8);
    ctx.stroke();
    // Head
    var px = -dy, py = dx;
    ctx.beginPath();
    ctx.moveTo(ex, ey);
    ctx.lineTo(ex - dx * headSize + px * headSize * 0.5, ey - dy * headSize + py * headSize * 0.5);
    ctx.lineTo(ex - dx * headSize - px * headSize * 0.5, ey - dy * headSize - py * headSize * 0.5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  /* Reference grid: concentric rings and radial spokes on a plane parallel to
   * the ecliptic, passing through whatever we are looking at. Empty space in
   * a 3D view has no depth cues whatsoever — without this you cannot tell a
   * tilted orbit from a circular one seen at an angle, and you cannot judge
   * distance at all.
   *
   * The grid is sized to the CAMERA, not to the system: it has to be a useful
   * ruler when you are 500 km off a station and when you are looking at four
   * planets at once. Ring spacing snaps to a round 1/2/5 number so the
   * on-screen scale readout is something a person can actually use. */
  function niceStep(x) {
    var exp = Math.floor(Math.log(x) / Math.LN10);
    var base = Math.pow(10, exp);
    var m = x / base;
    var mult = m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10;
    return mult * base;
  }

  function drawEclipticGrid(ctx, cam, origin, span) {
    var step = niceStep(span / 4);
    var rings = 5;
    var z = origin.z;
    ctx.save();
    for (var i = 1; i <= rings; i++) {
      var r = step * i;
      var pts = [];
      for (var a = 0; a <= 96; a++) {
        var th = (a / 96) * K.TAU;
        pts.push({ x: origin.x + r * Math.cos(th), y: origin.y + r * Math.sin(th), z: z });
      }
      strokePath(ctx, cam, pts, '#2b3a52', 1, i === rings ? 0.34 : 0.22);
    }
    for (var sp = 0; sp < 12; sp++) {
      var th2 = (sp / 12) * K.TAU;
      strokePath(ctx, cam, [
        { x: origin.x, y: origin.y, z: z },
        { x: origin.x + step * rings * Math.cos(th2),
          y: origin.y + step * rings * Math.sin(th2), z: z }
      ], '#2b3a52', 1, 0.12);
    }
    ctx.restore();
    return step;   // caller reports this as the scale
  }

  /* A vertical dropline from a body to the ecliptic plane. This is the single
   * cheapest, clearest way to show that an orbit is inclined — you see how
   * far above or below the plane the body actually is. */
  function drawDropline(ctx, cam, pos, color, planeZ, maxDrop) {
    planeZ = planeZ || 0;
    var drop = pos.z - planeZ;
    if (Math.abs(drop) < 1e-9) return;
    // A dropline longer than the view is a distraction, not a depth cue.
    if (maxDrop && Math.abs(drop) > maxDrop) return;
    strokePath(ctx, cam, [pos, { x: pos.x, y: pos.y, z: planeZ }], color, 1, 0.35, [2, 4]);
  }

  /* ---- attitude director indicator --------------------------------------
   * A true 3D pitch ladder: each rung is drawn by projecting real world
   * DIRECTIONS through the cockpit camera, not by faking rotation in screen
   * space. Rotating a direction around the local-vertical axis traces a
   * line of constant pitch (exactly like a line of latitude circles a
   * globe's pole) — so the ladder's bank and perspective fall straight out
   * of the same projection every other body in the scene uses. It is
   * automatically correct at any roll or FOV; there is no separate 2D bank
   * transform to keep in sync with the 3D one. */
  function drawAttitudeLadder(ctx, cam, ship, upRef, w, h) {
    var Sim = global.Sim;
    var att = Sim.attitudeAngles(ship, upRef);
    if (att.degenerate) {
      // Pointed within a fraction of a degree of straight up or down: the
      // "current heading" a horizon rung would center on is undefined.
      // Rather than jitter, say so plainly and skip the ladder this frame.
      ctx.save();
      ctx.font = '11px ui-monospace, monospace';
      ctx.fillStyle = '#7dfaff';
      ctx.textAlign = 'center';
      ctx.fillText(att.pitchDeg > 0 ? 'PITCH 90° — NADIR BEHIND' : 'PITCH −90° — ZENITH BEHIND',
                   w / 2, h / 2 - 30);
      ctx.textAlign = 'left';
      ctx.restore();
      return att;
    }
    var horizFwd = att.horizFwd, pitchDeg = att.pitchDeg, rollDeg = att.rollDeg;

    function toScreen(dir) {
      var p = cam.projectDir(dir);
      return p; // {x,y,depth} or null if behind the camera
    }

    ctx.save();
    ctx.font = '10px ui-monospace, monospace';

    var rungs = [-60, -50, -40, -30, -20, -10, 0, 10, 20, 30, 40, 50, 60];
    for (var i = 0; i < rungs.length; i++) {
      var p = rungs[i];
      if (Math.abs(p - pitchDeg) > 42) continue;   // keep the clutter near boresight
      var center = V.norm(V.addScaled(V.scale(horizFwd, Math.cos(p * DEG)), upRef, Math.sin(p * DEG)));

      [-1, 1].forEach(function (side) {
        var innerAz = side * 6, outerAz = side * 26;
        var pts = [];
        for (var a = 0; a <= 8; a++) {
          var az = innerAz + (outerAz - innerAz) * (a / 8);
          var d = V.rotateAroundAxis(center, upRef, az * DEG);
          var sp = toScreen(d);
          if (sp) pts.push(sp);
        }
        if (pts.length < 2) return;

        ctx.strokeStyle = p === 0 ? '#7dfaff' : '#5fe3a8';
        ctx.lineWidth = p === 0 ? 2 : 1.4;
        ctx.globalAlpha = p === 0 ? 0.95 : 0.8;
        ctx.setLineDash(p < 0 ? [5, 4] : []);
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (var k = 1; k < pts.length; k++) ctx.lineTo(pts[k].x, pts[k].y);
        ctx.stroke();

        // Outer tick + number, right at the end of the rung.
        var end = pts[pts.length - 1], prev = pts[pts.length - 2];
        var tx = end.x - prev.x, ty = end.y - prev.y;
        var tl = Math.hypot(tx, ty) || 1;
        var nx = -ty / tl, ny = tx / tl; // perpendicular to the rung, in screen space
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(end.x - nx * 5, end.y - ny * 5);
        ctx.lineTo(end.x + nx * 5, end.y + ny * 5);
        ctx.stroke();
        if (p !== 0) {
          ctx.globalAlpha = 0.9;
          ctx.fillStyle = p < 0 ? '#5fe3a8' : '#7dfaff';
          ctx.fillText(Math.abs(p), end.x + side * 7, end.y + 3);
        }
      });
    }
    ctx.restore();

    /* Boresight: where the ship's nose actually points. This used to be
     * hard-coded to the centre of the screen, which was true only while the
     * camera was welded to ship.fwd. Now that the pilot can turn their
     * head, it has to be projected like anything else — and being able to
     * look away and still see where the nose is aimed is precisely what
     * makes looking around safe to do. */
    var bore = cam.projectDir(ship.fwd);
    ctx.save();
    ctx.strokeStyle = '#ffe6a8';
    ctx.lineWidth = 1.5;
    if (bore && bore.x > -40 && bore.x < w + 40 && bore.y > -40 && bore.y < h + 40) {
      ctx.beginPath(); ctx.arc(bore.x, bore.y, 3, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(bore.x - 12, bore.y); ctx.lineTo(bore.x - 5, bore.y);
      ctx.moveTo(bore.x + 5, bore.y); ctx.lineTo(bore.x + 12, bore.y);
      ctx.stroke();
    } else {
      // Nose off the edge of vision: point back toward it rather than
      // silently omitting the one marker that says which way you are going.
      var vec = ship.fwd;
      var sx = V.dot(vec, cam.r), sy = V.dot(vec, cam.u), fz = V.dot(vec, cam.f);
      var dx = sx, dy = -sy;
      if (fz <= 0) { dx = -dx; dy = -dy; }
      var l = Math.hypot(dx, dy) || 1;
      drawArrow(ctx, w / 2 + (dx / l) * Math.min(w, h) * 0.40,
                     h / 2 + (dy / l) * Math.min(w, h) * 0.40,
                     dx / l, dy / l, 16, '#ffe6a8', 1.6, 7);
    }
    ctx.restore();

    return att;
  }

  /* ---- slipspace wakes ---------------------------------------------------
   * What a hull leaves behind when it tears a hole between stars: a cloud of
   * distorted energy and space that hangs there for hours and slowly comes
   * apart. Red and arcing where a ship went IN, blue where one came OUT.
   *
   * Drawn in SCREEN SPACE, like the exhaust plumes and for the same reason —
   * a cloud has no surface, and giving it geometry would mean lighting and
   * winding and depth-sorting a thing that is really just a smear of light.
   * The arcs are struck about a projected centre, so the effect stays
   * legible whether it is a hundred pixels across or six.
   *
   * The arcs are ARCS rather than filaments because that is the shape the
   * brief asked for and it is the right one: concentric fragments of a torn
   * circle read as something that was punched through and has not closed
   * again, where radiating spikes would read as an explosion.
   *
   * Nothing here is random per frame. Every arc's angle and radius comes
   * from a hash of the wake's own id, so a wake looks like ITSELF every time
   * you come back to it — a cloud that reshuffled each frame would sparkle
   * like static and, worse, would stop being a landmark you could recognise.
   * Time enters only as a slow, smooth writhe. */
  /* Three elements, and the combination is the point — it is what makes a
   * slipstream track mark look like nothing else in the game:
   *
   *   the CLOUD    bright in the middle, dimming out; the hole itself
   *   the LIGHTNING jagged bolts arcing across it; the energy still in it
   *   the RIM       a few torn arc fragments at the edge; where it was cut
   *
   * The rim shards were the whole effect in the first version and were far
   * too loud for it — concentric rings read as a built structure, a gate or
   * a portal, when the fiction is violence done to space. Demoted to a few
   * faint fragments at the very edge they do the opposite job: they give the
   * hole a ragged boundary, so the cloud looks like it is escaping through
   * something torn rather than simply hanging there. */
  var WAKE_ARCS = 5;
  /* Six bolts at a 28% duty cycle, which works out at roughly one and a half
   * lit at any instant. Four at 16% was the first try and it left the cloud
   * completely quiet about half the time — a hole in space that spends half
   * its life doing nothing does not read as high-energy, it reads as a smudge
   * with an occasional glitch. */
  var WAKE_BOLTS = 6;
  var WAKE_BOLT_DUTY = 0.28;

  /* SALT FIRST, AND A FINAL AVALANCHE. Both halves of that were a bug.
   *
   * This started as plain FNV-1a over `id + '|' + salt`, and every one of a
   * wake's nine arcs came out with nearly the same number: h1 between 0.73
   * and 0.77, h2 between 0.33 and 0.37. So all nine drew at the same radius,
   * the same angle and the same span, stacked precisely on top of each
   * other — and a cloud that was supposed to be nine faint filaments
   * rendered as ONE thick bright crescent flung off to the side. It looked
   * so much like a stray weapon tracer that it got reported as one.
   *
   * The cause is that appending the salt changes only the LAST byte or two,
   * and FNV's final multiply does not diffuse a late change upward into the
   * high bits — which are exactly the bits `h / 2^32` reads. Putting the
   * salt at the front gives every subsequent byte a chance to spread it, and
   * the xor-shift-multiply tail guarantees the top bits depend on all of it.
   *
   * The lesson generalises: any time a seeded value is derived by tacking an
   * index onto a shared prefix, check the SPREAD of what comes out rather
   * than trusting that a hash is a hash. */
  function wakeHash(str, salt) {
    var h = 2166136261 >>> 0;
    var s = salt + '#' + str;
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    h ^= h >>> 13;
    h = Math.imul(h, 0x5bd1e995) >>> 0;
    h ^= h >>> 15;
    return (h >>> 0) / 4294967296;
  }

  /* `size` is the wake's world radius in km; the caller decides that, since
   * it knows the scale of the system it is standing in. */
  function drawWake(ctx, cam, pos, wake, size, tSec) {
    var p = cam.project(pos);
    if (!p) return null;
    if (p.x < -240 || p.x > cam.w + 240 || p.y < -240 || p.y > cam.h + 240) return p;

    var strength = Math.max(0, Math.min(1, wake.strength));
    if (strength <= 0.004) return p;

    /* Floored AND capped, and both bounds were earned.
     *
     * The floor keeps a distant wake a visible mote instead of a sub-pixel
     * nothing — the whole point is that you can spot one from across a
     * system and go and look at it.
     *
     * The CAP is the one a playtest found. The glow is painted out to 2.1
     * times this radius, so at a close approach an uncapped wake filled the
     * entire viewport with orange haze and washed the whole game out. A
     * cloud you have flown inside should bloom, not blind — past a certain
     * screen size there is nothing more to show and a great deal to ruin. */
    /* The floor SCALES with the hull, rather than being a flat 3.5 px.
     *
     * A flat floor threw away the whole point of sizing a wake by mass: from
     * across a system every mark is sub-pixel, so every mark clamped to the
     * same dot and a bulk hauler's trail looked exactly like a packet's. The
     * one place where "which of these is worth flying to" most needs
     * answering is precisely the place you cannot yet resolve them.
     *
     * A couple of pixels of difference is enough — it is a size comparison
     * between neighbouring motes, not an absolute reading. */
    var floor = 2.2 + Math.min(3.2, size / 22000);
    var r = Math.max(floor, Math.min(Math.min(cam.w, cam.h) * 0.10, size * p.scale));
    /* FOUR colours, not two, and the split matters.
     *
     * The bloom is deep and saturated; the arcs are bright and desaturated.
     * The first version drew the arcs in the same two colours as the glow,
     * which meant that on a departure wake — where the glow is red — every
     * arc rolled onto the darker of the two became invisible against it, and
     * about half of a nine-arc cloud simply did not exist. What you saw was
     * a dim blob with one crescent hanging off it.
     *
     * Arcs have to be LIGHTER than the thing they sit inside, whatever
     * colour that thing is. */
    var depart = wake.kind === 'departure';
    var glowCore = depart ? '255,96,64' : '92,146,255';
    var glowEdge = depart ? '176,26,34' : '34,68,205';
    var boltCore = depart ? '255,242,224' : '236,248,255';  // the strike itself
    var boltHalo = depart ? '255,138,86' : '128,196,255';   // what it lights up

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    /* ---- the cloud ------------------------------------------------------
     * Brightest at the middle, dimming all the way out — a hole punched in
     * space, not a ring. Built from several overlapping radial gradients at
     * small deterministic offsets rather than one clean circle, because a
     * single centred gradient reads as a lens flare and a few lopsided ones
     * read as something with volume that got torn rather than drawn. */
    var puffs = r > 6 ? 5 : 1;
    for (var q = 0; q < puffs; q++) {
      var ph1 = wakeHash(wake.id, 'puff' + q);
      var ph2 = wakeHash(wake.id, 'puffa' + q);
      var ph3 = wakeHash(wake.id, 'puffr' + q);
      /* The first puff is dead centre and the brightest; the rest lean off
       * it. Drifting slowly, so the cloud churns without ever travelling. */
      var off = q === 0 ? 0 : r * (0.10 + 0.26 * ph3);
      var oa = ph2 * Math.PI * 2 + tSec * (0.05 + ph1 * 0.09) * (depart ? 1 : -1);
      var cx = p.x + Math.cos(oa) * off;
      var cy = p.y + Math.sin(oa) * off;
      var pr = r * (q === 0 ? 1.55 : (0.70 + 0.55 * ph1));
      var amp = strength * (q === 0 ? 0.30 : 0.13) *
                (0.75 + 0.25 * Math.sin(tSec * (0.5 + ph1) + ph2 * 6.28));

      var g = ctx.createRadialGradient(cx, cy, 0, cx, cy, pr);
      g.addColorStop(0, 'rgba(' + glowCore + ',' + amp.toFixed(3) + ')');
      g.addColorStop(0.42, 'rgba(' + glowEdge + ',' + (amp * 0.45).toFixed(3) + ')');
      g.addColorStop(1, 'rgba(' + glowEdge + ',0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, pr, 0, Math.PI * 2);
      ctx.fill();
    }

    /* ---- the lightning --------------------------------------------------
     * Jagged bolts arcing ACROSS the cloud, which is what says high-energy
     * rather than merely luminous.
     *
     * This replaced concentric arc fragments, which were the first attempt
     * and were wrong in a way worth recording: rings read as a structure —
     * a portal, a gate, something built — and the fiction here is violence
     * done to space, not machinery. A bolt that crosses the middle says
     * "punched through"; a ring around the outside says "opened neatly".
     *
     * Each bolt STROBES on its own cycle rather than being drawn every
     * frame, because lightning that is permanently on is not lightning, it
     * is wire. And the path is regenerated per STRIKE, not per frame: the
     * shape is seeded from (wake, bolt, strike index), so it holds still for
     * the fifth of a second it is visible and is a different shape next
     * time. Drawing a fresh random path every frame would flicker like
     * static and cost the determinism the rest of this file is built on. */
    if (r > 6) {
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      /* ---- the torn rim ------------------------------------------------
       * A few short arc fragments right at the boundary, creeping round at
       * their own rates. Faint on purpose: they are the edge of the wound,
       * not the subject. */
      for (var a2 = 0; a2 < WAKE_ARCS; a2++) {
        var g1 = wakeHash(wake.id, 'rim' + a2);
        var g2 = wakeHash(wake.id, 'rima' + a2);
        var g3 = wakeHash(wake.id, 'rims' + a2);
        var rad = r * (0.88 + 0.30 * g1);
        var a0 = g2 * Math.PI * 2 + tSec * ((g1 - 0.5) * 0.16 + (depart ? -0.05 : 0.05));
        var span = 0.22 + 0.62 * g3;
        ctx.strokeStyle = 'rgba(' + boltHalo + ',' +
                          (strength * (0.16 + 0.20 * g3)).toFixed(3) + ')';
        ctx.lineWidth = Math.max(0.8, r * 0.016);
        ctx.beginPath();
        ctx.arc(p.x, p.y, rad, a0, a0 + span);
        ctx.stroke();
      }

      for (var b = 0; b < WAKE_BOLTS; b++) {
        var f1 = wakeHash(wake.id, 'b' + b);
        var f2 = wakeHash(wake.id, 'ba' + b);
        var f3 = wakeHash(wake.id, 'bp' + b);

        /* Its own rhythm, and it is FAST. Period between a fifth and two
         * thirds of a second, lit for the first third of each cycle.
         *
         * It ran at 0.8-2.3 s to begin with and looked wrong for a reason
         * worth writing down: at that rate you watch each bolt appear,
         * linger and fade, which reads as something being switched on and
         * off. Real electrical discharge is faster than the eye can follow
         * individual strikes — you perceive a continuous crackle. Cutting
         * the period by four is what turns a blinking line into a cloud that
         * is alive. */
        var period = 0.22 + f1 * 0.40;
        var cyc = (tSec / period + f3) % 1;
        var lit = cyc < WAKE_BOLT_DUTY ? 1 - (cyc / WAKE_BOLT_DUTY) : 0;
        if (lit <= 0.02) continue;
        lit = lit * lit;                       // snap bright, decay fast

        var strike = Math.floor(tSec / period + f3);
        var key = b + ':' + strike;

        /* Endpoints on opposite-ish sides, so the bolt crosses the cloud
         * rather than clipping its edge. */
        var ea = wakeHash(wake.id, 'e' + key) * Math.PI * 2;
        var spread = Math.PI * (0.55 + 0.45 * wakeHash(wake.id, 'f' + key));
        var ra = r * (0.55 + 0.50 * wakeHash(wake.id, 'g' + key));
        var rb = r * (0.55 + 0.50 * wakeHash(wake.id, 'h' + key));
        var x0 = p.x + Math.cos(ea) * ra, y0 = p.y + Math.sin(ea) * ra;
        var x1 = p.x + Math.cos(ea + spread) * rb, y1 = p.y + Math.sin(ea + spread) * rb;

        var path = boltPath(wake.id, key, x0, y0, x1, y1, r * 0.38);

        /* Halo first, then the strike inside it — that is what makes a thin
         * white line look like it is lighting up the gas around it.
         *
         * THIN. These were 7.5% and 2.2% of the radius, and at close range
         * that painted a rounded-off red ROD across the cloud rather than a
         * discharge: thick enough that the jag disappeared inside the stroke
         * width and the whole thing read as a solid bar. Lightning is a
         * hairline with a glow around it — the brightness does the work, not
         * the width. */
        ctx.strokeStyle = 'rgba(' + boltHalo + ',' +
                          (strength * lit * 0.40).toFixed(3) + ')';
        ctx.lineWidth = Math.max(1.2, r * 0.030);
        strokeBolt(ctx, path);

        ctx.strokeStyle = 'rgba(' + boltCore + ',' +
                          (strength * lit * 0.95).toFixed(3) + ')';
        ctx.lineWidth = Math.max(0.7, r * 0.010);
        strokeBolt(ctx, path);
      }

      /* The tear itself: a small hard-white centre that the whole cloud is
       * pouring out of. */
      ctx.fillStyle = 'rgba(' + boltCore + ',' + (0.38 * strength).toFixed(3) + ')';
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(1, r * 0.09), 0, Math.PI * 2);
      ctx.fill();
    } else if (r > 2) {
      /* Too small to resolve structure: one mote, in the colour that says
       * which kind it is. From across a system that is all a wake needs to
       * be — something worth turning toward. */
      ctx.fillStyle = 'rgba(' + boltHalo + ',' + (0.8 * strength).toFixed(3) + ')';
      ctx.beginPath();
      ctx.arc(p.x, p.y, r * 0.6, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
    return p;
  }

  /* Midpoint displacement, four levels — the cheapest thing that looks like
   * lightning. Each subdivision pushes the midpoint sideways by a shrinking
   * amount, so the line acquires detail at every scale instead of being a
   * uniformly wiggly noodle. Seeded, so one strike holds its shape. */
  function boltPath(id, key, x0, y0, x1, y1, jag) {
    var pts = [{ x: x0, y: y0 }, { x: x1, y: y1 }];
    var amp = jag, n = 0;
    /* Five levels, not four: thirty-two segments rather than sixteen. The
     * extra level is what keeps the kinks finer than the stroke is wide, so
     * the jag survives being drawn instead of being swallowed by the line. */
    for (var level = 0; level < 5; level++) {
      var next = [pts[0]];
      for (var i = 0; i < pts.length - 1; i++) {
        var a = pts[i], c = pts[i + 1];
        var mx = (a.x + c.x) / 2, my = (a.y + c.y) / 2;
        var dx = c.x - a.x, dy = c.y - a.y;
        var len = Math.hypot(dx, dy) || 1;
        // Perpendicular, scaled by this level's amplitude.
        var d = (wakeHash(id, 'j' + key + ':' + (n++)) - 0.5) * 2 * amp;
        next.push({ x: mx + (-dy / len) * d, y: my + (dx / len) * d });
        next.push(c);
      }
      pts = next;
      amp *= 0.55;
    }
    return pts;
  }

  /* `strokeBolt`, NOT `strokePath`.
   *
   * This was called strokePath for about ten minutes and it broke the whole
   * renderer. There is already a strokePath in this file — the world-space
   * polyline helper at the top, signature (ctx, cam, pts, style, width, …) —
   * and a second top-level declaration of the same name silently wins,
   * because that is what function declarations do. Every existing caller
   * then handed its `cam` to my `pts`, and orbit lines, trajectory plots and
   * everything else drawn as a polyline threw on `pts[0].x`.
   *
   * Same trap as the orbitalBasis collision in sim.js, from the same cause:
   * a new top-level name added to a large single-scope file without grepping
   * for it first. Nothing warns. GREP FIRST. */
  function strokeBolt(ctx, pts) {
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();
  }

  /* Flight path marker: where the ship is actually GOING, as distinct from
   * where its nose is pointed (the boresight, always dead centre here).
   * They only coincide when you are burning straight prograde — everywhere
   * else, this is the one honest answer to "which way am I really moving". */
  function drawFlightPathMarker(ctx, cam, progradeDir, w, h) {
    var p = cam.projectDir(progradeDir);
    if (!p) return;
    if (p.x < 6 || p.x > w - 6 || p.y < 6 || p.y > h - 6) return;
    ctx.save();
    ctx.strokeStyle = '#ffd36b';
    ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(p.x, p.y, 6, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(p.x - 11, p.y); ctx.lineTo(p.x - 6, p.y);
    ctx.moveTo(p.x + 6, p.y); ctx.lineTo(p.x + 11, p.y);
    ctx.moveTo(p.x, p.y - 9); ctx.lineTo(p.x, p.y - 6);
    ctx.stroke();
    ctx.restore();
  }

  /* Bank scale: a small rotating arc of standard angle marks (10/20/30/45/60)
   * with a fixed pointer, same convention as a real ADI — the scale turns
   * with the ship's roll, the index stays put, so their alignment reads off
   * the bank angle directly. */
  function drawBankScale(ctx, w, h, rollDeg, cyOverride) {
    var cx = w / 2, cy = cyOverride || 92, R = 74;
    var marks = [-60, -45, -30, -20, -10, 0, 10, 20, 30, 45, 60];
    ctx.save();
    ctx.strokeStyle = 'rgba(180,205,235,0.5)';
    ctx.fillStyle = 'rgba(180,205,235,0.8)';
    ctx.lineWidth = 1.2;
    for (var i = 0; i < marks.length; i++) {
      var a = (-marks[i] + rollDeg) * DEG; // 0 = straight up
      var len = (marks[i] % 30 === 0) ? 10 : 6;
      var sx = cx + Math.sin(a) * R, sy = cy - Math.cos(a) * R;
      var ex = cx + Math.sin(a) * (R - len), ey = cy - Math.cos(a) * (R - len);
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke();
    }
    // Fixed index (points at whichever mark currently reads true bank).
    ctx.fillStyle = '#ffe6a8';
    ctx.beginPath();
    ctx.moveTo(cx, cy - R + 12); ctx.lineTo(cx - 5, cy - R); ctx.lineTo(cx + 5, cy - R);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  /* ======================================================================
   * HYPERSPACE
   * ======================================================================
   * What Frontier and First Encounters actually did, and why it worked on
   * hardware that could barely draw a planet:
   *
   *   - the whole effect is the STARFIELD, stretched. Points become
   *     streaks, streaks rush outward from a vanishing point, and your
   *     brain reads "impossible speed" without a single texture;
   *   - a tunnel of concentric rings gives the streaks something to be
   *     inside, which is what turns "fast" into "somewhere else";
   *   - the palette goes cold and wrong — cyan into indigo into violet —
   *     because that is not a colour space is;
   *   - it is short, and it is bracketed by two flashes.
   *
   * All of it is drawn from one parameterisation. Every streak and every
   * ring carries a depth u in [0,1); screen radius is maxR * u^2.4, so
   * things crawl near the middle and whip past at the edge exactly the way
   * a perspective projection would, without any perspective projection.
   * Advance u with time and the tunnel moves.
   *
   * Deliberately NOT the same code as the real starfield: this is not the
   * sky seen quickly, it is somewhere else entirely, and mixing the two
   * would tie a cosmetic effect to the renderer that has to stay honest.
   */
  var HYPER_STARS = null;
  function hyperStars() {
    if (HYPER_STARS) return HYPER_STARS;
    var rng = new RNG('hyperspace');
    HYPER_STARS = [];
    for (var i = 0; i < 460; i++) {
      HYPER_STARS.push({
        a: rng.angle(),                    // bearing from the vanishing point
        z: rng.next(),                     // starting depth
        speed: 0.55 + rng.next() * 1.05,
        width: 0.7 + rng.next() * 2.1,
        hue: rng.next(),                   // where it sits in the palette
        twist: rng.range(-1, 1)            // its own share of the spiral
      });
    }
    return HYPER_STARS;
  }

  function hyperRadius(u, maxR) { return maxR * Math.pow(u <= 0 ? 0 : u, 2.4); }

  /* Cold, wrong, and getting worse as it comes at you. White at the far
   * end, cyan through the middle, violet as it passes. */
  function hyperColor(u, hue, alpha) {
    var r, g, b;
    if (u < 0.45) {
      var k = u / 0.45;
      r = 210 - 120 * k; g = 235 - 20 * k; b = 255;
    } else {
      var j = (u - 0.45) / 0.55;
      r = 90 + 120 * j * hue; g = 215 - 150 * j; b = 255 - 40 * j;
    }
    return 'rgba(' + Math.round(r) + ',' + Math.round(g) + ',' + Math.round(b) + ',' +
           alpha.toFixed(3) + ')';
  }

  /* `hyper` is { time, intensity, flash, twist } — the caller owns the
   * state machine, this only draws a moment of it. */
  function drawHyperspace(ctx, w, h, hyper) {
    var cx = w / 2, cy = h / 2;
    var maxR = Math.hypot(w, h) * 0.62;
    var stars = hyperStars();
    var T = hyper.time;
    var I = Math.max(0, Math.min(1, hyper.intensity));
    var spin = (hyper.twist === undefined ? T * 0.22 : hyper.twist);

    ctx.save();

    /* The tube itself: a deep well, dark at the rim so the streaks have
     * somewhere to come from, and a hot core they come out of. */
    var bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, maxR);
    bg.addColorStop(0, 'rgba(180,240,255,' + (0.30 * I).toFixed(3) + ')');
    bg.addColorStop(0.10, 'rgba(70,150,235,' + (0.22 * I).toFixed(3) + ')');
    bg.addColorStop(0.45, 'rgba(24,40,110,' + (0.30 * I).toFixed(3) + ')');
    bg.addColorStop(1, 'rgba(4,6,20,' + (0.85 * I).toFixed(3) + ')');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    ctx.globalCompositeOperation = 'lighter';

    /* Rings, rushing past. Eight of them on a shared cycle, brightest at
     * the middle of their run so they fade in and out rather than popping
     * into existence at the centre. */
    ctx.lineWidth = 1.6;
    for (var k = 0; k < 8; k++) {
      var ru = (k / 8 + T * 0.34) % 1;
      var rr = hyperRadius(ru, maxR);
      if (rr < 2) continue;
      var ra = 4 * ru * (1 - ru) * 0.5 * I;
      ctx.strokeStyle = hyperColor(ru, 0.5, ra);
      ctx.beginPath();
      // Slightly elliptical and rotating, so the tunnel reads as twisting
      // rather than as a set of concentric circles.
      ctx.ellipse(cx, cy, rr, rr * (0.92 + 0.08 * Math.sin(T * 0.7 + k)), spin, 0, K.TAU);
      ctx.stroke();
    }

    /* The streaks. This is the effect; everything else is staging. */
    for (var i = 0; i < stars.length; i++) {
      var s = stars[i];
      var u = (s.z + T * s.speed * 0.30) % 1;
      var u2 = u + 0.02 + 0.16 * I * s.speed;
      if (u2 > 1) u2 = 1;
      var r0 = hyperRadius(u, maxR), r1 = hyperRadius(u2, maxR);
      if (r1 < 1.5) continue;

      // Each streak spirals a little, and more of them the deeper you are.
      var ang = s.a + spin * (1 + s.twist * 0.6) + u * 0.55 * s.twist;
      var ca = Math.cos(ang), sa = Math.sin(ang);
      var alpha = Math.min(1, 0.25 + u * 1.1) * I;

      ctx.strokeStyle = hyperColor(u, s.hue, alpha);
      ctx.lineWidth = s.width * (0.4 + u * 1.5);
      ctx.beginPath();
      ctx.moveTo(cx + ca * r0, cy + sa * r0);
      ctx.lineTo(cx + ca * r1, cy + sa * r1);
      ctx.stroke();
    }

    /* The core. A hot point you are falling into, pulsing enough to feel
     * alive but not enough to strobe. */
    var coreR = maxR * (0.05 + 0.02 * Math.sin(T * 5.1)) * I;
    if (coreR > 1) {
      var core = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR * 4);
      core.addColorStop(0, 'rgba(255,255,255,' + (0.85 * I).toFixed(3) + ')');
      core.addColorStop(0.25, 'rgba(150,225,255,' + (0.35 * I).toFixed(3) + ')');
      core.addColorStop(1, 'rgba(90,160,255,0)');
      ctx.fillStyle = core;
      ctx.fillRect(0, 0, w, h);
    }

    ctx.restore();

    /* The two flashes that bracket the whole thing: entry and exit. Drawn
     * last, over everything, because that is what a flash is. */
    if (hyper.flash > 0.001) {
      ctx.save();
      ctx.fillStyle = 'rgba(226,244,255,' + Math.min(1, hyper.flash).toFixed(3) + ')';
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }
  }

  /* Cruise: the sky smeared, with the system still visible through it.
   *
   * Different problem from hyperspace. There you are nowhere and the tunnel
   * is the whole view; here you are still IN the system and still need to
   * see where you are going, so this streaks the starfield radially about
   * the direction of travel and leaves everything else alone. Length scales
   * with speed, so the effect tells you how fast you are going without a
   * number — which is the entire reason to warp a starfield rather than
   * just print a velocity. */
  function drawCruiseWarp(ctx, cam, stars, headDir, speedFrac, w, h) {
    var f = Math.max(0, Math.min(1, speedFrac));
    if (f < 0.005) return;
    var vp = cam.projectDir(headDir);
    // Looking away from where we are going: streak from the far side.
    var behind = !vp;
    if (behind) {
      var back = cam.projectDir(V.scale(headDir, -1));
      if (!back) return;
      vp = { x: 2 * cam.cx - back.x, y: 2 * cam.cy - back.y };
    }

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    var stretch = 0.10 + 5.5 * f * f;
    for (var i = 0; i < stars.length; i++) {
      var p = cam.projectDir(stars[i].d);
      if (!p) continue;
      if (p.x < -220 || p.x > w + 220 || p.y < -220 || p.y > h + 220) continue;
      var dx = p.x - vp.x, dy = p.y - vp.y;
      var L = Math.hypot(dx, dy);
      if (L < 0.5) continue;
      var len = Math.min(L * stretch, Math.max(w, h) * 1.4);
      var ux = dx / L, uy = dy / L;
      ctx.strokeStyle = 'rgba(190,225,255,' + (stars[i].b * (0.30 + 0.55 * f)).toFixed(3) + ')';
      ctx.lineWidth = stars[i].size * (0.8 + 0.9 * f);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x + ux * len, p.y + uy * len);
      ctx.stroke();
    }

    // A faint bloom at the vanishing point, so the direction of travel has
    // somewhere to be.
    if (!behind) {
      var gr = Math.max(w, h) * (0.05 + 0.10 * f);
      var g = ctx.createRadialGradient(vp.x, vp.y, 0, vp.x, vp.y, gr);
      g.addColorStop(0, 'rgba(170,215,255,' + (0.16 * f).toFixed(3) + ')');
      g.addColorStop(1, 'rgba(120,170,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }
    ctx.restore();

    // Edge darkening, which is what sells speed more than the streaks do.
    ctx.save();
    var vig = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.28,
                                       w / 2, h / 2, Math.max(w, h) * 0.75);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(2,6,18,' + (0.55 * f).toFixed(3) + ')');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  /* ======================================================================
   * THE COCKPIT
   * ======================================================================
   * Real geometry, not a sticker. Every part of this — the canopy aperture,
   * the pillars, the dashboard, the panels set into it — is a polygon in
   * the SHIP'S OWN axes, in kilometres, pushed through exactly the same
   * projection as the planets outside. That buys three things a 2D overlay
   * cannot:
   *
   *   - the window's shape follows the field of view and the aspect ratio
   *     for free, because it is a real aperture at a real distance rather
   *     than a hand-tuned outline;
   *   - the frame occludes the world honestly, because it is drawn after
   *     the world and it is genuinely in front of it; and
   *   - when the pilot's head shifts under acceleration (see the sway in
   *     main.js) the frame parallaxes against the stars, which is the one
   *     cue that sells "you are sitting inside a thing" more than any
   *     amount of drawn detail.
   *
   * Coordinates below are written in METRES and converted once, because a
   * cockpit measured in kilometres reads as noise.
   */
  var M = 0.001;   // one metre, in km — the unit the cockpit is built in

  var CANOPY_Z = 1.20;   // metres ahead of the cockpit origin
  var EYE_FWD = 0.08;    // and the seat sits this far forward of it

  /* The window itself, as seen from inside, counter-clockwise. Chamfered
   * corners rather than a rectangle: a square hole in a hull reads as a
   * cut-out, and the angled corners are what make it read as a canopy. */
  var APERTURE = [
    [-0.92,  0.62], [ 0.92,  0.62], [ 1.22,  0.30], [ 1.22, -0.16],
    [ 0.98, -0.46], [-0.98, -0.46], [-1.22, -0.16], [-1.22,  0.30]
  ];

  /* Side windows. These exist because you can now turn your head, and a
   * cockpit you can look around inside of had better have something to look
   * at when you do. They are proper 3D quads on the side walls rather than
   * more shapes on the canopy plane, so they foreshorten correctly as you
   * turn — which is the entire point of doing this in geometry. */
  /* These run a long way aft on purpose. A short window beside the seat is
   * only in view across a narrow band of head angles, so turning to look
   * out of it lands you staring at hull instead — the geometry has to cover
   * the arc the neck can actually reach. Aft edge at z = 0.16 puts the far
   * corner about 86 degrees off the nose, which is just past where the look
   * clamp in main.js stops you. */
  var SIDE_WINDOW = [
    [-1.30,  0.34, 1.06], [-1.30,  0.42, 0.20],
    [-1.30, -0.24, 0.16], [-1.30, -0.30, 1.02]
  ];

  /* The landing window: a pane in the floor of the nose, ahead of and below
   * the seat, seen through a slot left open down the middle of the console.
   *
   * You cannot land on something you cannot see, and until now the one
   * moment where that matters most — the last hundred metres onto a pad —
   * was flown with the target hidden behind the dashboard the whole way
   * down. Helicopters and lunar modules both solved this the same way, with
   * glass in the floor, so that is what this is. The console is split
   * around it rather than the window being tucked somewhere it would never
   * be seen; the slot and the pane are one feature and neither works
   * alone. */
  var FLOOR_WINDOW = [
    [-0.26, -0.92, 1.66], [0.26, -0.92, 1.66],
    [0.30, -1.02, 1.04], [-0.30, -1.02, 1.04]
  ];

  /* Where the console is cut away for it, in dash (s) coordinates. */
  var SLOT_S0 = 0.395, SLOT_S1 = 0.605;

  function mirrorX(poly) {
    return poly.map(function (p) { return [-p[0], p[1], p[2]]; });
  }

  /* Interior surfaces, in draw order. Painted AFTER the hull and after the
   * glass, because they are physically between the pilot and the canopy —
   * which is why the dashboard correctly occludes the bottom of the HUD. */
  var INTERIOR = [
    // side consoles, running aft under the side windows
    { pts: [[-1.30, -0.30, 1.02], [-1.30, -0.24, 0.16],
            [-0.80, -0.62, 0.12], [-0.96, -0.56, 1.00]], fill: '#131a25', line: 'rgba(120,150,190,0.16)' },
    { pts: [[1.30, -0.30, 1.02], [0.96, -0.56, 1.00],
            [0.80, -0.62, 0.12], [1.30, -0.24, 0.16]], fill: '#131a25', line: 'rgba(120,150,190,0.16)' },
    // overhead panel
    { pts: [[-0.86, 0.66, 1.10], [0.86, 0.66, 1.10],
            [0.72, 0.74, 0.46], [-0.72, 0.74, 0.46]], fill: '#0f151e', line: 'rgba(120,150,190,0.12)' },
    // window surrounds, so the side glass has a frame rather than a hole
    // rear bulkhead, so turning round shows a cockpit rather than a void
    { pts: [[-1.10, 0.70, -0.52], [1.10, 0.70, -0.52],
            [1.10, -0.66, -0.44], [-1.10, -0.66, -0.44]], fill: '#111823', line: 'rgba(120,150,190,0.18)' },
    { pts: [[-0.34, 0.30, -0.50], [0.34, 0.30, -0.50],
            [0.34, -0.20, -0.48], [-0.34, -0.20, -0.48]], fill: '#0b1119', line: 'rgba(120,240,190,0.20)' }
  ];

  /* The dashboard, as a trapezoid sloping down and back from the base of
   * the window toward the pilot. Everything mounted on it is addressed in
   * (s, t) across and back, so panels can be moved without touching any
   * 3D coordinates. */
  var DASH = {
    fl: [-0.98, -0.46, 1.20], fr: [0.98, -0.46, 1.20],
    nl: [-0.74, -0.76, 0.40], nr: [0.74, -0.76, 0.40]
  };

  /* Three panels. Flight-critical symbology lives on the glass; these carry
   * the data-heavy readouts that would clutter it — which is exactly the
   * division Frontier's own cockpits drew. */
  /* Panel pixel space is 460x178 — the same flat space the console pages
   * are already written in, so a page can be handed to a physical panel or
   * to the flat band without knowing which it got. */
  /* Three screens on an arc around the pilot: one at twelve o'clock and one
   * to either side, each one TURNED TO FACE THE SEAT rather than laid flat
   * on the console.
   *
   * That distinction is the whole design. A panel lying on a dashboard that
   * recedes from an eye barely above it projects as a long thin trapezoid —
   * the page mapped onto it comes out sheared, which reads as broken rather
   * than as perspective. A panel standing up and aimed at the pilot
   * projects as very nearly a rectangle, so the instrument is legible and
   * the cockpit is still real geometry. Every mounting below is therefore a
   * bearing, a height and a lean, and the corners are derived.
   *
   * The bearings are ±24°, not the ±60° that "ten and two" would mean
   * literally. A panel's horizontal offset on screen is the focal length
   * times the tangent of its bearing, and at 34° — never mind 60° — the
   * outer panel walks off the side of an 800-pixel-wide window entirely.
   * Measured in the running game at the size the window actually was, not
   * reasoned about. 24° is as wide as the arc goes and stays in front of
   * you at any window shape worth supporting.
   *
   * The widths are set by the same arithmetic: a panel subtends
   * atan(hw / r) either side of its bearing, so three panels fit without
   * overlapping only while the outer ones' inner edges clear the centre
   * one's outer edge. 28° with these widths leaves about a degree of gap,
   * and the whole layout is angular, so it holds at every window size
   * rather than being tuned to one. */
  var MFD_MOUNTS = [
    { id: 'left',   bearing: -24 * Math.PI / 180, r: 1.12, y: -0.37, lean: 0.70, hw: 0.23, hh: 0.089, w: 460, h: 178 },
    { id: 'centre', bearing: 0,                   r: 1.06, y: -0.39, lean: 0.62, hw: 0.24, hh: 0.093, w: 460, h: 178 },
    { id: 'right',  bearing: 24 * Math.PI / 180,  r: 1.12, y: -0.37, lean: 0.70, hw: 0.23, hh: 0.089, w: 460, h: 178 },
    /* Two more on the rear bulkhead, for the same reason the side windows
     * run so far aft: you can turn all the way round now, and a cockpit
     * that rewards looking behind you with a blank wall is a cockpit that
     * teaches you not to look. These are upright and face the seat, so
     * turning round reads them the right way up. */
    { id: 'rear-left',  bearing: -145 * Math.PI / 180, r: 0.62, y: -0.02, lean: -0.14, hw: 0.30, hh: 0.116, w: 460, h: 178 },
    { id: 'rear-right', bearing: 145 * Math.PI / 180,  r: 0.62, y: -0.02, lean: -0.14, hw: 0.30, hh: 0.116, w: 460, h: 178 }
  ];

  /* Corners of a mounted panel, in cockpit metres, as
   * [topLeft, topRight, bottomRight, bottomLeft] — the order mfdBegin's
   * affine fit expects. `right` runs along the screen's own width and is
   * perpendicular to the bearing, so the panel faces the seat; `up` is
   * vertical rotated back about that same axis by `lean`, so the top of the
   * screen tips away from the pilot the way a real console does. */
  function mfdCorners(m, grow, spec) {
    var s = Math.sin(m.bearing), c = Math.cos(m.bearing);
    var hw = m.hw + (grow || 0), hh = m.hh + (grow || 0) * 0.4;
    /* The console grows with the bridge, but the SCREENS grow more slowly
     * than the room does — a bigger ship gets a wider dash, not letters you
     * can read from the airlock. Square root of the scale, so a 1.16x room
     * carries a 1.08x screen. */
    var k = spec ? spec.size : 1;
    var ks = spec ? Math.sqrt(spec.size) : 1;
    hw *= ks; hh *= ks;
    var cx = s * m.r * k, cz = c * m.r * k;
    var rx = c, rz = -s;                                   // along the width
    var sl = Math.sin(m.lean), cl = Math.cos(m.lean);
    var ux = s * sl, uy = cl, uz = c * sl;                 // up the height
    function corner(sx, sy) {
      return [cx + rx * hw * sx + ux * hh * sy,
              m.y * k + uy * hh * sy,
              cz + rz * hw * sx + uz * hh * sy];
    }
    return [corner(-1, 1), corner(1, 1), corner(1, -1), corner(-1, -1)];
  }

  /* Kept under the old name because the cockpit suite and anything else
   * that wants to know where the instruments are should not have to care
   * that they stopped being flat slots on the dash. */
  var MFD_SLOTS = MFD_MOUNTS;

  function dashPoint(s, t) {
    var fx = DASH.fl[0] + (DASH.fr[0] - DASH.fl[0]) * s;
    var fy = DASH.fl[1] + (DASH.fr[1] - DASH.fl[1]) * s;
    var fz = DASH.fl[2] + (DASH.fr[2] - DASH.fl[2]) * s;
    var nx = DASH.nl[0] + (DASH.nr[0] - DASH.nl[0]) * s;
    var ny = DASH.nl[1] + (DASH.nr[1] - DASH.nl[1]) * s;
    var nz = DASH.nl[2] + (DASH.nr[2] - DASH.nl[2]) * s;
    return [fx + (nx - fx) * t, fy + (ny - fy) * t, fz + (nz - fz) * t];
  }

  function projLocal(cam, ship, p) {
    return cam.project(localToWorld(ship, p[0] * M, p[1] * M, p[2] * M));
  }

  function projCanopy(cam, ship, xy) {
    return cam.project(localToWorld(ship, xy[0] * M, xy[1] * M, CANOPY_Z * M));
  }

  /* --- projection with near-plane clipping ------------------------------
   * The moment the pilot can turn their head, cockpit polygons routinely
   * have some corners in front of the eye and some behind it. Projecting a
   * point behind the camera does not merely give a wrong coordinate, it
   * gives one with the sign flipped, which smears a filled polygon across
   * the entire screen. So interior geometry is clipped against the near
   * plane in camera space first — Sutherland-Hodgman against a single
   * plane, about twenty lines — and only the survivors are projected.
   *
   * This is the piece of machinery that makes looking around possible at
   * all; without it the feature is a flickering mess at every angle where
   * the canopy passes the edge of vision. */
  var NEAR_CLIP = 1.2e-4;   // km — 12 cm, comfortably inside the console

  function toCameraSpace(cam, p) {
    var vx = p.x - cam.eye.x, vy = p.y - cam.eye.y, vz = p.z - cam.eye.z;
    return {
      d: vx * cam.f.x + vy * cam.f.y + vz * cam.f.z,
      r: vx * cam.r.x + vy * cam.r.y + vz * cam.r.z,
      u: vx * cam.u.x + vy * cam.u.y + vz * cam.u.z
    };
  }

  function clipProject(cam, worldPts) {
    var cs = [], i;
    for (i = 0; i < worldPts.length; i++) cs.push(toCameraSpace(cam, worldPts[i]));
    var kept = [];
    for (i = 0; i < cs.length; i++) {
      var a = cs[i], b = cs[(i + 1) % cs.length];
      var ain = a.d > NEAR_CLIP, bin = b.d > NEAR_CLIP;
      if (ain) kept.push(a);
      if (ain !== bin) {
        var t = (NEAR_CLIP - a.d) / (b.d - a.d);
        kept.push({ d: NEAR_CLIP, r: a.r + (b.r - a.r) * t, u: a.u + (b.u - a.u) * t });
      }
    }
    if (kept.length < 3) return null;
    var out = [];
    for (i = 0; i < kept.length; i++) {
      var k = cam.flen / kept[i].d;
      var x = cam.cx + kept[i].r * k, y = cam.cy - kept[i].u * k;
      // Clamp rather than hand canvas a coordinate from a grazing vertex;
      // anything this far out is off screen either way.
      out.push({ x: Math.max(-2e4, Math.min(2e4, x)), y: Math.max(-2e4, Math.min(2e4, y)) });
    }
    return out;
  }

  function localPoly(ship, pts) {
    var out = [];
    for (var i = 0; i < pts.length; i++) {
      out.push(localToWorld(ship, pts[i][0] * M, pts[i][1] * M, pts[i][2] * M));
    }
    return out;
  }

  /* Scale a local point list about the cockpit origin. The seat is at the
   * origin, so this grows the room around the pilot rather than pushing the
   * pilot into a wall. */
  function scalePts(pts, k) {
    if (!(k > 0) || Math.abs(k - 1) < 1e-9) return pts;
    var out = [];
    for (var i = 0; i < pts.length; i++) {
      out.push([pts[i][0] * k, pts[i][1] * k, pts[i][2] * k]);
    }
    return out;
  }

  function canopyPoly(ship, pts) {
    var out = [];
    for (var i = 0; i < pts.length; i++) {
      out.push(localToWorld(ship, pts[i][0] * M, pts[i][1] * M, CANOPY_Z * M));
    }
    return out;
  }

  /* ---- THE COCKPIT KIT ---------------------------------------------------
   * One set of parts, assembled differently per ship.
   *
   * Everything above this used to be a single fixed cockpit: one aperture,
   * one canopy plane at a constant 1.20 m, the same five screens, for every
   * hull in the game. A Dart interceptor and a Mule freighter sat in
   * identical rooms behind identical glass, which is the one thing a cockpit
   * view cannot afford — it is the only part of your own ship you ever
   * actually look at.
   *
   * THE BASELINE IS THE OLD COCKPIT, deliberately. Every multiplier below is
   * 1.0 for the Talon, so the Talon's bridge is the one that was tuned by
   * hand and is still exactly that. The constants above it — the side
   * windows reaching to 86 degrees, the near clip at 12 cm, the chamfered
   * corners — carry reasoning that took real work to arrive at, and throwing
   * them away to build something "properly parametric" would have thrown the
   * reasoning away with them. Other hulls deviate from a known-good room.
   *
   * THREE INPUTS, and they are deliberately different KINDS of input:
   *
   *   TYPE decides the character of the room. An interceptor wraps more
   *   glass round a tighter seat; a freighter has a heavy brow and sits you
   *   back behind more structure. That is a table, because the four hulls
   *   are named things with intent behind them.
   *
   *   SIZE scales it. Read off dryMass, which every hull has and every hull
   *   that does not exist yet will also have — so a new hull gets a sane
   *   bridge without anyone adding a row.
   *
   *   FLAIR is seeded, and is cosmetic only. It never moves a screen you
   *   have to read or a window you have to see through.
   */

  var COCKPIT_ARCH = {
    /* wrap  how far round the glass reaches
     * room  overall scale of the bridge
     * brow  how much structure sits above the glass
     * rake  fallback lean when the hull has no model to measure */
    dart:    { wrap: 1.24, room: 0.90, brow: 0.82, rake: 0.60 },
    talon:   { wrap: 1.00, room: 1.00, brow: 1.00, rake: 0.46 },
    kestrel: { wrap: 1.09, room: 1.07, brow: 1.02, rake: 0.42 },
    mule:    { wrap: 0.86, room: 1.16, brow: 1.22, rake: 0.26 }
  };
  /* Which drawn model a player hull wears, so the rake can be measured off
   * the thing you can actually see out of. */
  var COCKPIT_CLASS = { talon: 'courier', dart: 'fighter',
                        kestrel: 'trader', mule: 'freighter' };

  var FINENESS_CACHE = {};

  /* Length over width of the hull's own mesh. A long fine nose wants steeply
   * raked glass; a blunt one wants it upright. Measured from the model
   * rather than chosen, which is the whole of "make the rake match the
   * hull" — and memoised, because it walks every vertex. */
  function hullFineness(hullId) {
    if (FINENESS_CACHE[hullId] !== undefined) return FINENESS_CACHE[hullId];
    var out = null;
    var modelId = HULL_ASSIGN[COCKPIT_CLASS[hullId] || hullId];
    var mesh = modelId ? libHull(modelId) : null;
    if (mesh && mesh.v && mesh.v.length) {
      var minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
      for (var i = 0; i < mesh.v.length; i++) {
        var v = mesh.v[i];
        if (v[0] < minX) minX = v[0];
        if (v[0] > maxX) maxX = v[0];
        if (v[2] < minZ) minZ = v[2];
        if (v[2] > maxZ) maxZ = v[2];
      }
      var wdt = maxX - minX, len = maxZ - minZ;
      if (wdt > 1e-9 && len > 1e-9) out = len / wdt;
    }
    FINENESS_CACHE[hullId] = out;
    return out;
  }

  /* The identity the flair hangs off.
   *
   * `bornId` AND NOT `reg`. A registration is something the player types on
   * the yard page and changes whenever they like; hanging the shape of the
   * bridge on it would mean renaming your ship rebuilt its cockpit around
   * you. `bornId` is stamped once when the hull is bought and never touched
   * again, so the room you learned is the room you keep. */
  function cockpitSeed(ship) {
    return 'cockpit|' + (ship.hullId || 'talon') + '|' +
           (ship.bornId || ship.hullId || 'origin');
  }

  function cockpitSpec(ship) {
    if (!ship) ship = {};
    var key = cockpitSeed(ship);
    if (ship._cockpit && ship._cockpit.key === key) return ship._cockpit;

    var arch = COCKPIT_ARCH[ship.hullId] || COCKPIT_ARCH.talon;
    /* Size, from the one number every hull has. The Talon's 42 t is the
     * pivot, so it comes out at exactly 1.0 and the tuned cockpit is
     * untouched. The cube root because this is a volume becoming a length —
     * doubling a ship's mass does not double the width of its bridge. */
    var mass = (ship.dryMass > 0) ? ship.dryMass : 42;
    var size = Math.pow(mass / 42, 1 / 3);
    /* Clamped, and this is a threshold worth being explicit about: the four
     * player hulls span 30-80 t, which is 0.89 to 1.24 of this. The clamp is
     * for the hulls that do not exist yet — a 400 t hull should read as
     * roomy, not as a cathedral with the instruments out of reach. */
    size = Math.max(0.86, Math.min(1.30, size));

    var rng = new RNG(key);
    /* Flair. Small, and cosmetic only: it tips the console a degree or two
     * and decides how the frame is broken up. Nothing here moves a screen
     * you have to read or narrows a window you have to see through. */
    var flair = {
      lean: rng.range(-0.035, 0.035),
      mullion: rng.range(0.010, 0.020),
      panes: 3 + (rng.range(0, 1) < 0.45 ? 2 : 0),
      trim: rng.pick(['#1a222e', '#1b2530', '#182029'])
    };

    /* Rake, measured where possible. Fineness runs about 2 for a blunt hull
     * and 5+ for a needle; mapped onto a lean the eye reads as the glass
     * following the nose. Falls back to the archetype's own figure when the
     * hull has no model loaded, which is every hull under the test harness. */
    var fine = hullFineness(ship.hullId);
    var rake = (fine === null) ? arch.rake
      : Math.max(0.18, Math.min(0.72, 0.10 + (fine - 1.6) * 0.14));

    /* How far the whole band tips. Small on purpose: this shifts what you
     * are looking at, so a big value would aim a freighter at the floor.
     * Talon's 0.46 comes out at about 1.8 degrees, a Dart's 0.60 at 3.4 —
     * enough to feel different between hulls, not enough to fight. */
    var rakeBias = (rake - 0.42) * 0.10;

    var spec = {
      key: key,
      arch: arch, size: size, flair: flair, rake: rake, rakeBias: rakeBias,
      fineness: fine,
      /* Distance from the eye to the glass, and the arc it covers. */
      reach: CANOPY_Z * arch.room * size,
      /* The main screen keeps the span the old flat window had — its
       * corners sat at x = +-1.22 on a plane 1.20 ahead, which is 45.5
       * degrees — so the view forward is unchanged and only widens. */
      centreAngle: 0.795,
      /* And the wrap reaches past it. 1.15 rad is 66 degrees a side, so a
       * Talon can see 20 degrees further round than it could, and a Dart
       * nearly 30. This is the number that makes the change worth making. */
      halfAngle: Math.max(0.85, 1.15 * arch.wrap),
      /* Elevations, taken straight off the old flat window so the view
       * forward is unchanged: its top sat at y = 0.62 on a plane 1.20
       * ahead, which is 27.3 degrees up, and its sill at -0.46, 21 down.
       * `brow` raises or lowers the top edge from there — a freighter wears
       * more structure above the glass, an interceptor almost none. */
      topAngle: Math.atan(0.62 / (CANOPY_Z * arch.room) / arch.brow) - rakeBias,
      botAngle: -Math.atan(0.46 / (CANOPY_Z * arch.room)) - rakeBias,
      mfdScale: size
    };
    ship._cockpit = spec;
    return spec;
  }

  /* The canopy, as a ring of flat panes around the pilot rather than one
   * sheet in front of them.
   *
   * WHY FACETS AND NOT A PLANE. A single pane can only be square-on to one
   * direction, so everything you see through its edges is seen through glass
   * you are looking at obliquely — and there is nothing beyond its edge at
   * all, which is why turning your head used to find hull where a window
   * should be. An arc of panes wraps the view around you, and the strips of
   * structure BETWEEN them are not drawn: they are simply where the shell
   * does not get punched through, so the frame is a consequence of the glass
   * rather than a second thing to keep in step with it.
   *
   * The rake tilts every pane by pulling the top edge back toward the pilot,
   * which is what a windscreen following a nose actually does. */
  function canopySegments(spec) {
    /* A MAIN SCREEN WITH QUARTER-LIGHTS, not a row of equal panes.
     *
     * Dividing the arc evenly was the first attempt and it was wrong in a
     * way the suite caught immediately: the centre pane is the one the game
     * calls "the window", and splitting a 90-degree arc five ways left it
     * covering 29% of the view when it used to cover most of it. You do not
     * fly by looking through a mullion. So the centre keeps roughly the span
     * the old flat window had, and the wrap is added OUTSIDE it — which is
     * what makes this more visibility rather than the same visibility cut
     * into strips. */
    /* THE WINDSCREEN STAYS FLAT, and that is the correction that took three
     * attempts to arrive at.
     *
     * A band on a sphere has an exact angular elevation everywhere — but a
     * pinhole camera projects y/z, which for a spherical band works out as
     * tan(e)/cos(a). At the 45-degree corners that is 1.41x, so the glass
     * bows a long way off the top and bottom of the screen. The suite was
     * right to call it: the window came out spanning twice the height of the
     * view and covering 2% of it.
     *
     * That bow is not a bug in the maths, it is what a wrap-around surface
     * genuinely does through a flat projection — which is precisely why real
     * windscreens are flat glass and the wrap comes from separate panes
     * angled outboard. So the main screen is the old aperture, unchanged and
     * still carrying its hand-tuned chamfers, and the visibility is added
     * beside it. */
    var k = spec.size;
    var z = spec.reach / CANOPY_Z;        // the aperture was authored at CANOPY_Z
    var out = [];
    var main = [];
    for (var i = 0; i < APERTURE.length; i++) {
      main.push([APERTURE[i][0] * k, APERTURE[i][1] * k - spec.rakeBias * 2,
                 CANOPY_Z * z * k]);
    }
    out.push(main);

    /* The quarter-lights. Hinged off the aperture's own outer edge so they
     * cannot drift away from it, swept outboard and aft — flat panes at an
     * angle, which is what makes the frame between them read as structure
     * rather than as a seam. `wrap` decides how far round they reach. */
    var reach = 0.34 * spec.arch.wrap;
    var side = [
      [1.22 * k, 0.30 * k, CANOPY_Z * z * k],
      [(1.22 + reach) * k, (0.30 - 0.02) * k, CANOPY_Z * z * k * (1 - reach * 0.62)],
      [(1.22 + reach) * k, (-0.16 - 0.04) * k, CANOPY_Z * z * k * (1 - reach * 0.62)],
      [1.22 * k, -0.16 * k, CANOPY_Z * z * k]
    ];
    out.push(side);
    out.push(mirrorX(side));
    return out;

    /* CORNERS ARE ANGLES, NOT HEIGHTS, and getting that wrong is the second
     * mistake this function made. The first version put the top edge at a
     * constant y on a cylinder of radius r — but a corner at 45 degrees of
     * bearing sits at z = cos(45)*r, two thirds of the way in, so the same
     * height reads as a far steeper angle out at the edges than it does
     * dead ahead. The panes ran off the top and bottom of the screen and
     * the window came out covering minus 28% of the view.
     *
     * On a sphere every corner is the same distance from the eye, so an
     * elevation of 27 degrees is 27 degrees whichever way you are facing.
     * That is what a wrap-around canopy is: a band of sky at a fixed angular
     * height, not a fence at a fixed physical one.
     *
     * PURE SPHERICAL, and the rake deliberately does not touch it. Leaning
     * the glass by shifting z was the third thing tried here and it broke
     * the band in a way that is obvious in hindsight: z at the outer corners
     * is already small, so a fixed offset swung them from 45 to 50 degrees
     * off-axis and pushed the pane off the side of the screen. On a sphere
     * the horizontal angle IS the bearing and the elevation IS the
     * elevation, exactly, at every corner — which is the property that makes
     * the wrap behave, and it is not worth trading for a lean.
     *
     * So the rake moves the BAND instead, biasing both edges together (see
     * `rakeBias`): a fine-nosed hull sits you looking a little further over
     * the nose, a blunt one sits you more upright behind it. Same
     * information, read off the same model, expressed where it cannot
     * distort the geometry. */
  }

  /* How much of `rake` becomes lean. Rake runs 0.18..0.72 across the hulls;
   * at full strength that tipped the glass through 25 degrees and changed
   * its distance by 40%, which is a windscreen lying in your lap. Half of it
   * over the half-height above the eye is a lean you can see and not one you
   * have to duck under. */
  var RAKE_LEAN = 0.5;

  /* Screen-space outline of the forward canopy opening — the centre pane,
   * which is the one the glass wash and the shield flare treat as "the
   * windscreen". The full set is on `apertureSet`. */
  function aperturePath(cam, ship) {
    /* Segment 0 IS the windscreen — the quarter-lights are appended after
     * it, so this stays the main pane whatever the flair did. */
    var segs = canopySegments(cockpitSpec(ship));
    return segs.length ? clipProject(cam, localPoly(ship, segs[0]))
                       : clipProject(cam, canopyPoly(ship, APERTURE));
  }

  /* Every opening you can see out of, front and both sides. The hull is
   * painted as the whole screen minus all of these at once, which is what
   * lets you look left and find a window there. */
  function apertureSet(cam, ship) {
    var list = [];
    /* EVERY PANE, not one window. The centre keeps the id 'front' because
     * the glass wash and the canopy shield flare look for exactly that —
     * they treat it as "the windscreen" and want a single quad to sit on.
     * The rest carry their own ids and are punched out just the same, which
     * is what turns the wrap into visibility rather than decoration. */
    var spec = cockpitSpec(ship);
    var segs = canopySegments(spec);
    for (var s = 0; s < segs.length; s++) {
      add(s === 0 ? 'front' : ('front-' + s),
          clipProject(cam, localPoly(ship, segs[s])));
    }
    var side = scalePts(SIDE_WINDOW, spec.size);
    add('left', clipProject(cam, localPoly(ship, side)));
    add('right', clipProject(cam, localPoly(ship, mirrorX(side))));
    add('floor', clipProject(cam, localPoly(ship, scalePts(FLOOR_WINDOW, spec.size))));
    return list;

    /* Drop anything that clipping left entirely off screen. A window you
     * have turned away from still survives the near-plane clip as a sliver
     * projected far outside the viewport, and punching a hole out there is
     * pointless at best — at worst a vertex clamped to one edge and its
     * neighbour clamped to the other would drag the "hole" straight across
     * the middle of the view. Cheaper to notice and skip. */
    function add(id, pts) {
      if (!pts) return;
      var b = polyBounds(pts);
      if (b.maxX < -64 || b.minX > cam.w + 64 || b.maxY < -64 || b.minY > cam.h + 64) return;
      list.push({ id: id, pts: pts });
    }
  }

  function tracePath(ctx, pts) {
    ctx.moveTo(pts[0].x, pts[0].y);
    for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();
  }

  /* Fill a projected polygon with a flat shade. Used for every solid part
   * of the interior; there is no lighting model in here on purpose, because
   * a cockpit interior is lit by its own instruments, not by the star. */
  function fillPoly(ctx, pts, style, stroke) {
    if (!pts || pts.length < 3) return;
    ctx.save();
    ctx.beginPath();
    tracePath(ctx, pts);
    ctx.fillStyle = style;
    ctx.fill();
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.restore();
  }

  function projQuad(cam, ship, a, b, c, d) {
    var pa = projLocal(cam, ship, a), pb = projLocal(cam, ship, b);
    var pc = projLocal(cam, ship, c), pd = projLocal(cam, ship, d);
    if (!pa || !pb || !pc || !pd) return null;
    return [pa, pb, pc, pd];
  }

  /* The interior itself. Draw this AFTER the world and before the glass
   * symbology: it is what turns "a camera bolted to the nose" into "a seat
   * behind a window". Returns the aperture outline and the projected panel
   * quads so the caller can clip the HUD to the glass and draw instruments
   * into the panels. */
  /* The hull, and the holes in it.
   *
   * Draw order for the whole cockpit is worth stating once, because it is
   * the thing that makes it read as a place rather than a collage:
   *
   *   1. the world                     (already on the canvas)
   *   2. drawCockpitShell              hull, punched with every window
   *   3. drawGlass                     tint, reflections, glare, scratches
   *   4. the HUD, clipped to the glass
   *   5. drawCockpitInterior           dash, consoles, panels, bulkhead
   *
   * The interior goes LAST because it is physically between the pilot and
   * the canopy. That is why the dashboard correctly cuts off the bottom of
   * the attitude ladder instead of the ladder floating over the console —
   * and once you can turn your head, that ordering stops being a nicety and
   * starts being the difference between a cockpit and a mess. */
  function drawCockpitShell(ctx, cam, ship, w, h) {
    var apertures = apertureSet(cam, ship);

    /* Fill the whole screen and punch every window out of it with a single
     * even-odd fill. One operation, any number of openings, correct at any
     * head angle and any aspect ratio, with no clipping rectangle to keep
     * in sync with the geometry. */
    ctx.save();
    var grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#141a24');
    grad.addColorStop(0.55, '#0e131b');
    grad.addColorStop(1, '#080b11');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.rect(0, 0, w, h);
    for (var a = 0; a < apertures.length; a++) tracePath(ctx, apertures[a].pts);
    ctx.fill('evenodd');
    ctx.restore();

    // Inner lip on every opening — a highlight, so each window has an edge.
    ctx.save();
    for (a = 0; a < apertures.length; a++) {
      ctx.beginPath();
      tracePath(ctx, apertures[a].pts);
      ctx.strokeStyle = apertures[a].id === 'front'
        ? 'rgba(150,180,215,0.34)' : 'rgba(140,170,205,0.26)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.strokeStyle = 'rgba(10,14,20,0.9)';
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }
    ctx.restore();

    /* Corner gussets and a short centre mullion at the top of the canopy.
     * Deliberately kept out of the boresight: a strut across the middle of
     * the window would be authentic and infuriating. */
    var gl = projQuad(cam, ship,
      [-0.92, 0.62, CANOPY_Z], [-0.52, 0.62, CANOPY_Z],
      [-0.92, 0.34, CANOPY_Z], [-1.22, 0.30, CANOPY_Z]);
    var gr = projQuad(cam, ship,
      [0.92, 0.62, CANOPY_Z], [0.52, 0.62, CANOPY_Z],
      [0.92, 0.34, CANOPY_Z], [1.22, 0.30, CANOPY_Z]);
    if (gl) fillPoly(ctx, [gl[1], gl[0], gl[3], gl[2]], '#1a222e', 'rgba(140,170,205,0.18)');
    if (gr) fillPoly(ctx, [gr[1], gr[0], gr[3], gr[2]], '#1a222e', 'rgba(140,170,205,0.18)');

    var mull = projQuad(cam, ship,
      [-0.045, 0.62, CANOPY_Z], [0.045, 0.62, CANOPY_Z],
      [0.030, 0.44, CANOPY_Z], [-0.030, 0.44, CANOPY_Z]);
    if (mull) fillPoly(ctx, mull, '#1a222e', 'rgba(140,170,205,0.16)');

    var front = null;
    for (a = 0; a < apertures.length; a++) if (apertures[a].id === 'front') front = apertures[a].pts;
    return { apertures: apertures, aperture: front };
  }

  /* Everything between the pilot and the glass. */
  function drawCockpitInterior(ctx, cam, ship, w, h) {
    var i;
    var spec = cockpitSpec(ship);

    /* Side consoles, overhead panel and rear bulkhead — the things that
     * make turning your head worth doing. Clipped, because at wide head
     * angles these are exactly the polygons that straddle the eye plane. */
    for (i = 0; i < INTERIOR.length; i++) {
      var poly = clipProject(cam, localPoly(ship, INTERIOR[i].pts));
      if (poly) fillPoly(ctx, poly, INTERIOR[i].fill, INTERIOR[i].line);
    }

    /* The dashboard. Two surfaces: a dark glare shield facing the window
     * and the console proper facing the pilot, so the fold between them
     * catches a different shade and the whole thing reads as solid. */
    /* Both surfaces are drawn in two halves, left of the slot and right of
     * it, so the landing window in the floor has something to be seen
     * through. A console with a hole in it is the entire point; a console
     * drawn as one piece over the top of the hole is a window into a
     * cupboard. */
    shieldHalf(-0.98, -0.98 + SLOT_S0 * 1.96);
    shieldHalf(-0.98 + SLOT_S1 * 1.96, 0.98);

    deskHalf(0, SLOT_S0);
    deskHalf(SLOT_S1, 1);

    function shieldHalf(x0, x1) {
      var poly = clipProject(cam, localPoly(ship, [
        [x0, -0.46, 1.20], [x1, -0.46, 1.20],
        [x1 * 0.88, -0.52, 0.98], [x0 * 0.88, -0.52, 0.98]]));
      if (poly) fillPoly(ctx, poly, '#080b10');
    }

    function deskHalf(s0, s1) {
      var poly = clipProject(cam, localPoly(ship, [
        dashPoint(s0, 0.04), dashPoint(s1, 0.04),
        dashPoint(s1, 1), dashPoint(s0, 1)]));
      if (poly) fillPoly(ctx, poly, '#161d28', 'rgba(120,150,190,0.20)');
    }

    /* --- what is bolted to the console -------------------------------------
     * The panels came back. They were removed once because instruments in
     * perspective are harder to read than instruments drawn square, and that
     * is still true — which is why the flat band along the bottom keeps
     * everything it had. These are the same pages on the physical dash as
     * well: you fly looking through the window at a console that is lit and
     * doing something, and when you actually need a number you drop your
     * eyes to the band. Scenery that happens to be true beats scenery. */

    // Warning and status lamps, on the strip between the glare shield and
    // the screens. Every one of them is driven by the real ship.
    lampRow(ctx, cam, ship);

    // Screws down the fold of the glare shield: four dots, and the cheapest
    // thing in here that says "assembled" rather than "modelled".
    for (i = 0; i < 4; i++) {
      var sp = projLocal(cam, ship, dashPoint(0.09 + i * 0.273, 0.028));
      if (!sp) continue;
      ctx.fillStyle = 'rgba(150,180,215,0.30)';
      ctx.beginPath(); ctx.arc(sp.x, sp.y, 1.4, 0, K.TAU); ctx.fill();
    }

    var mfds = [], emitters = [];
    for (i = 0; i < MFD_MOUNTS.length; i++) {
      var mt = MFD_MOUNTS[i];

      /* A housing a little proud of the screen on every side, so each panel
       * is a box standing on the console rather than a rectangle painted on
       * it, and a stalk down to the dash so it is holding itself up. */
      var bez = projQuad.apply(null,
        [cam, ship].concat(mfdCorners(mt, 0.022, spec)));
      if (bez) fillPoly(ctx, bez, '#0a0f16', 'rgba(140,175,215,0.30)');

      var quad = projQuad.apply(null, [cam, ship].concat(mfdCorners(mt, 0, spec)));
      if (!quad) continue;

      // Unlit backing, so a panel the caller declines to fill still reads as
      // a screen that is off rather than as a hole in the dashboard.
      fillPoly(ctx, quad, '#050a0e');

      var b = polyBounds(quad);
      /* WORLD corners as well as screen ones. The GPU path needs the panel
       * as a thing in the world — the screen quad is the projection, and
       * projecting is exactly what we are handing to the hardware. Built
       * from the same mfdCorners the outline used, so the housing and the
       * glass cannot end up describing different rectangles. */
      var loc = mfdCorners(mt, 0, spec), world = [];
      for (var wc = 0; wc < 4; wc++) {
        world.push(localToWorld(ship, loc[wc][0] * M, loc[wc][1] * M,
                                loc[wc][2] * M));
      }
      var panel = { id: mt.id, quad: quad, w: mt.w, h: mt.h,
                    world: world, cam: cam };

      /* CUT THE GLASS OUT. #gl is beneath #view, so a panel drawn on the GPU
       * would be hidden behind the console it is mounted in unless the
       * console has a hole where the screen goes. `destination-out` clears
       * the 2D layer to transparent inside the quad, and the textured quad
       * shows through it. The housing, bezel and stalk above stay 2D: they
       * are opaque furniture and were never the thing that skewed. */
      if (mfdGpu(panel)) {
        ctx.save();
        ctx.globalCompositeOperation = 'destination-out';
        ctx.fillStyle = '#000';
        ctx.beginPath();
        tracePath(ctx, quad);
        ctx.fill();
        ctx.restore();
      }

      mfds.push(panel);
      emitters.push({ x: b.cx, y: b.cy });
    }

    /* Side-console switch blocks. These exist for one reason: turning your
     * head used to find two flat grey slabs, and now it finds something with
     * a light on it. */
    sideConsoleDetail(ctx, cam, ship, false);
    sideConsoleDetail(ctx, cam, ship, true);

    return { mfds: mfds, emitters: emitters };
  }

  /* Eight lamps across the console, on the lip just behind the screens.
   * Colour is state, not decoration — a dark lamp means that system has
   * nothing to say. */
  function lampRow(ctx, cam, ship) {
    var fuelFrac = ship.fuelCap ? ship.fuel / ship.fuelCap : 1;
    var thrFrac = ship.thrusterCap ? ship.thrusterFuel / ship.thrusterCap : 1;
    var hullHurt = ship.hullMax ? ship.hull < ship.hullMax * 0.999 : false;
    var shieldUp = ship.shieldCap ? ship.shield > ship.shieldCap * 0.05 : false;
    var OFF = '#151d26';
    var lamps = [
      ship.docked || ship.landed ? '#7dffb0' : OFF,          // clamped
      ship.docked ? '#7dffb0' : OFF,                          // umbilical
      ship.fuelOut ? '#ff6b5a' : (thrFrac < 0.15 ? '#ffb86b' : OFF),
      fuelFrac < 0.2 ? '#ffb86b' : OFF,                       // jump fuel
      hullHurt ? '#ff6b5a' : OFF,                             // hull
      shieldUp ? '#8fd8ff' : OFF,                             // shields
      OFF, OFF                                                // spare bays
    ];
    for (var i = 0; i < lamps.length; i++) {
      var s0 = 0.055 + i * 0.114;
      var q = projQuad(cam, ship,
        dashPoint(s0, 0.325), dashPoint(s0 + 0.062, 0.325),
        dashPoint(s0 + 0.062, 0.385), dashPoint(s0, 0.385));
      if (!q) continue;
      fillPoly(ctx, q, lamps[i], 'rgba(10,14,20,0.85)');
      if (lamps[i] === OFF) continue;
      // A lit lamp spills a little onto the console around it.
      var b = polyBounds(q);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      var g = ctx.createRadialGradient(b.cx, b.cy, 0, b.cx, b.cy, Math.max(b.w, b.h) * 1.6);
      g.addColorStop(0, 'rgba(255,255,255,0.10)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(b.cx - b.w * 2, b.cy - b.h * 2, b.w * 4, b.h * 4);
      ctx.restore();
    }
  }

  /* Bilinear point on any interior quad, so things can be mounted on the
   * side consoles the same way dashPoint mounts them on the dash. */
  function quadPoint(q, u, v) {
    var out = [];
    for (var k = 0; k < 3; k++) {
      var fwd = q[0][k] + (q[1][k] - q[0][k]) * u;
      var aft = q[3][k] + (q[2][k] - q[3][k]) * u;
      out.push(fwd + (aft - fwd) * v);
    }
    return out;
  }

  function sideConsoleDetail(ctx, cam, ship, right) {
    var q = INTERIOR[right ? 1 : 0].pts;
    if (right) q = [q[0], q[3], q[2], q[1]];   // same winding as the left one
    var blocks = [
      { u: 0.10, v: 0.16, du: 0.26, dv: 0.34, fill: '#0d131c', line: 'rgba(120,150,190,0.22)' },
      { u: 0.42, v: 0.20, du: 0.20, dv: 0.28, fill: '#0d131c', line: 'rgba(120,150,190,0.22)' },
      { u: 0.14, v: 0.60, du: 0.16, dv: 0.20, fill: '#123a30', line: 'rgba(120,240,190,0.30)' }
    ];
    for (var i = 0; i < blocks.length; i++) {
      var bk = blocks[i];
      var poly = clipProject(cam, localPoly(ship, [
        quadPoint(q, bk.u, bk.v), quadPoint(q, bk.u + bk.du, bk.v),
        quadPoint(q, bk.u + bk.du, bk.v + bk.dv), quadPoint(q, bk.u, bk.v + bk.dv)]));
      if (poly) fillPoly(ctx, poly, bk.fill, bk.line);
    }
  }

  /* Kept for callers that just want the lot in one go, in the right order
   * minus the glass and HUD layers. */
  function drawCockpit(ctx, cam, ship, w, h) {
    var shell = drawCockpitShell(ctx, cam, ship, w, h);
    var inner = drawCockpitInterior(ctx, cam, ship, w, h);
    return { aperture: shell.aperture, apertures: shell.apertures,
             mfds: inner.mfds, emitters: inner.emitters };
  }

  /* ---- glass ------------------------------------------------------------
   * A hole in a hull does not read as a window; it reads as a hole. What
   * makes canopy glass legible is that it is a SURFACE with the sky behind
   * it, and every cue here is about that surface being there:
   *
   *   - a faint cyan-green transmission tint, because coated glass is not
   *     colourless;
   *   - darkening toward the frame, where you are looking through more
   *     millimetres of it at a shallower angle;
   *   - the instruments reflecting off the inside of the lower glass, which
   *     is the single strongest cue and costs one gradient;
   *   - a broad diagonal sheen;
   *   - fixed scratches and dust, seeded so they are the same scratches
   *     every frame — they belong to the canopy, not to the moment; and
   *   - a bloom and a horizontal streak when the star is in the window,
   *     which is the glass scattering, not the camera.
   *
   * All of it is clipped to the openings and blended additively except the
   * tint, so it lies on the sky without hiding it. */
  var GLASS_MARKS = null;
  function glassMarks() {
    if (GLASS_MARKS) return GLASS_MARKS;
    var rng = new RNG('canopy');
    GLASS_MARKS = { scratches: [], dust: [] };
    for (var i = 0; i < 14; i++) {
      GLASS_MARKS.scratches.push({
        x: rng.range(-1, 1), y: rng.range(-1, 1),
        len: rng.range(0.06, 0.30), ang: rng.angle(),
        bow: rng.range(-0.4, 0.4), a: rng.range(0.02, 0.07)
      });
    }
    for (i = 0; i < 40; i++) {
      GLASS_MARKS.dust.push({
        x: rng.range(-1, 1), y: rng.range(-1, 1),
        r: rng.range(0.3, 1.1), a: rng.range(0.03, 0.10)
      });
    }
    return GLASS_MARKS;
  }

  function polyBounds(pts) {
    var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (var i = 0; i < pts.length; i++) {
      if (pts[i].x < minX) minX = pts[i].x;
      if (pts[i].x > maxX) maxX = pts[i].x;
      if (pts[i].y < minY) minY = pts[i].y;
      if (pts[i].y > maxY) maxY = pts[i].y;
    }
    return { minX: minX, maxX: maxX, minY: minY, maxY: maxY,
             cx: (minX + maxX) / 2, cy: (minY + maxY) / 2,
             w: maxX - minX, h: maxY - minY };
  }

  function drawGlass(ctx, apertures, w, h, opts) {
    if (!apertures || !apertures.length) return;
    opts = opts || {};
    var marks = glassMarks();

    for (var a = 0; a < apertures.length; a++) {
      var pts = apertures[a].pts;
      var b = polyBounds(pts);
      if (!(b.w > 4 && b.h > 4)) continue;
      var isFront = apertures[a].id === 'front';

      ctx.save();
      ctx.beginPath();
      tracePath(ctx, pts);
      ctx.clip();

      // Transmission tint. Source-over on purpose: real glass takes a
      // little light away, and the sky behind should sit slightly back.
      ctx.fillStyle = 'rgba(96,150,150,0.055)';
      ctx.fillRect(b.minX, b.minY, b.w, b.h);

      // Thickness: darker toward the frame, where the path length is longer.
      var vig = ctx.createRadialGradient(b.cx, b.cy, Math.min(b.w, b.h) * 0.18,
                                         b.cx, b.cy, Math.max(b.w, b.h) * 0.72);
      vig.addColorStop(0, 'rgba(6,14,18,0)');
      vig.addColorStop(1, 'rgba(6,14,18,0.42)');
      ctx.fillStyle = vig;
      ctx.fillRect(b.minX, b.minY, b.w, b.h);

      ctx.globalCompositeOperation = 'lighter';

      /* The instruments, reflected in the inside of the glass. Strongest
       * along the bottom edge where the console faces it, and the cue that
       * does most of the work of saying "there is a pane here". */
      var refl = ctx.createLinearGradient(0, b.maxY, 0, b.maxY - b.h * 0.55);
      refl.addColorStop(0, 'rgba(70,190,150,0.16)');
      refl.addColorStop(0.35, 'rgba(60,160,140,0.05)');
      refl.addColorStop(1, 'rgba(50,140,130,0)');
      ctx.fillStyle = refl;
      ctx.fillRect(b.minX, b.minY, b.w, b.h);

      // Broad diagonal sheen.
      var sheen = ctx.createLinearGradient(b.minX, b.minY, b.maxX, b.maxY);
      sheen.addColorStop(0.0, 'rgba(255,255,255,0)');
      sheen.addColorStop(0.42, 'rgba(200,225,255,0.035)');
      sheen.addColorStop(0.52, 'rgba(220,240,255,0.06)');
      sheen.addColorStop(0.62, 'rgba(200,225,255,0.03)');
      sheen.addColorStop(1.0, 'rgba(255,255,255,0)');
      ctx.fillStyle = sheen;
      ctx.fillRect(b.minX, b.minY, b.w, b.h);

      /* Glare. When the star is in this window the glass scatters it —
       * a soft bloom plus the horizontal streak a coated pane gives. This
       * is the canopy's flare, not the camera's, so it is clipped to the
       * canopy and vanishes the moment you look away from the sun. */
      if (isFront && opts.starScreen && opts.starVisible) {
        var s = opts.starScreen;
        if (s.x > b.minX - b.w && s.x < b.maxX + b.w &&
            s.y > b.minY - b.h && s.y < b.maxY + b.h) {
          var bloomR = Math.max(b.w, b.h) * 0.45;
          var bloom = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, bloomR);
          bloom.addColorStop(0, 'rgba(255,244,214,0.30)');
          bloom.addColorStop(0.25, 'rgba(255,226,170,0.10)');
          bloom.addColorStop(1, 'rgba(255,214,150,0)');
          ctx.fillStyle = bloom;
          ctx.fillRect(b.minX, b.minY, b.w, b.h);

          var streak = ctx.createLinearGradient(s.x - bloomR * 1.6, 0, s.x + bloomR * 1.6, 0);
          streak.addColorStop(0, 'rgba(255,230,180,0)');
          streak.addColorStop(0.5, 'rgba(255,238,200,0.13)');
          streak.addColorStop(1, 'rgba(255,230,180,0)');
          ctx.fillStyle = streak;
          ctx.fillRect(b.minX, s.y - 2.5, b.w, 5);
        }
      }

      /* Scratches and dust, in the aperture's own normalised space so they
       * sit on the pane and travel with it as you turn your head. */
      var i, mk;
      ctx.lineCap = 'round';
      for (i = 0; i < marks.scratches.length; i++) {
        mk = marks.scratches[i];
        var sx = b.cx + mk.x * b.w * 0.5, sy = b.cy + mk.y * b.h * 0.5;
        var L = mk.len * Math.min(b.w, b.h);
        var ex = sx + Math.cos(mk.ang) * L, ey = sy + Math.sin(mk.ang) * L;
        ctx.strokeStyle = 'rgba(220,240,255,' + mk.a.toFixed(3) + ')';
        ctx.lineWidth = 0.9;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.quadraticCurveTo((sx + ex) / 2 - Math.sin(mk.ang) * L * mk.bow,
                             (sy + ey) / 2 + Math.cos(mk.ang) * L * mk.bow, ex, ey);
        ctx.stroke();
      }
      for (i = 0; i < marks.dust.length; i++) {
        mk = marks.dust[i];
        ctx.fillStyle = 'rgba(210,230,250,' + mk.a.toFixed(3) + ')';
        ctx.beginPath();
        ctx.arc(b.cx + mk.x * b.w * 0.5, b.cy + mk.y * b.h * 0.5, mk.r, 0, K.TAU);
        ctx.fill();
      }

      ctx.restore();
    }
  }

  /* Map a flat pixel space (0,0)-(w,h) onto a projected quad and clip to it.
   * Corners arrive as [topLeft, topRight, bottomRight, bottomLeft]. Returns
   * false when the panel is degenerate or too small to be worth drawing, in
   * which case the caller must not call mfdEnd. */
  /* One offscreen surface per panel id, kept between frames. A readout is
   * redrawn every frame, so the canvas is reused and only its contents
   * change — allocating 460x178 five times a frame would be the expensive
   * part of an otherwise cheap pass. */
  var MFD_SURFACES = {};

  function mfdSurface(panel) {
    var s = MFD_SURFACES[panel.id];
    if (!s || s.canvas.width !== panel.w || s.canvas.height !== panel.h) {
      var cv = (typeof document !== 'undefined' && document.createElement)
        ? document.createElement('canvas') : null;
      if (!cv) return null;                     // headless: the 2D path serves
      cv.width = panel.w; cv.height = panel.h;
      var c2 = cv.getContext ? cv.getContext('2d') : null;
      if (!c2) return null;
      s = MFD_SURFACES[panel.id] = { canvas: cv, ctx: c2 };
    }
    return s;
  }

  /* Can this panel go through the GPU as a real quad in the world? */
  function mfdGpu(panel) {
    return !!(panel && panel.world && global.GLWorld &&
              global.GLWorld.available && global.GLWorld.panels);
  }

  /* Map a flat pixel space (0,0)-(w,h) onto the panel and return the context
   * to draw the readout into. Returns false when the panel is degenerate or
   * too small to be worth drawing, in which case the caller must not call
   * mfdEnd.
   *
   * TWO PATHS, AND THE RETURN VALUE IS WHY THIS CHANGED SHAPE. It used to
   * return a boolean and transform the caller's own context. That transform
   * is an affine built from three of the quad's four corners, and an affine
   * maps a rectangle to a PARALLELOGRAM — it cannot express perspective, and
   * the fourth corner is precisely the information it throws away. The
   * outline was clipped with all four, so the housing was a true perspective
   * quad with a parallelogram of content sliding around inside it as the
   * camera turned. Canvas 2D has no homography to fix that with.
   *
   * So when the GPU layer is up, the readout is drawn into an offscreen
   * canvas at its own natural size and handed to gl.js as a textured quad in
   * the world, where the perspective divide is what the hardware does
   * anyway. When it is not, the old affine still runs and the old skew comes
   * with it — which is worse than correct and much better than blank. */
  function mfdBegin(ctx, panel) {
    if (mfdGpu(panel)) {
      var s = mfdSurface(panel);
      if (s) {
        s.ctx.save();
        s.ctx.setTransform(1, 0, 0, 1, 0, 0);
        /* Cleared to opaque black rather than transparent: the console has a
         * hole cut in it for this, and anything the readout does not paint
         * would otherwise be open space seen through the screen. */
        s.ctx.globalCompositeOperation = 'source-over';
        s.ctx.globalAlpha = 1;
        s.ctx.fillStyle = '#050a0e';
        s.ctx.fillRect(0, 0, panel.w, panel.h);
        panel.surface = s;
        return s.ctx;
      }
    }

    var q = panel.quad;
    var area = Math.abs((q[1].x - q[0].x) * (q[3].y - q[0].y) -
                        (q[3].x - q[0].x) * (q[1].y - q[0].y));
    if (!(area > 240)) return false;

    ctx.save();
    ctx.beginPath();
    tracePath(ctx, q);
    ctx.clip();

    var a = (q[1].x - q[0].x) / panel.w, b = (q[1].y - q[0].y) / panel.w;
    var c = (q[3].x - q[0].x) / panel.h, d = (q[3].y - q[0].y) / panel.h;
    if (Math.abs(a * d - b * c) < 1e-9) { ctx.restore(); return false; }
    ctx.transform(a, b, c, d, q[0].x, q[0].y);
    panel.surface = null;
    return ctx;
  }

  /* `panel` is optional so an older two-argument call still balances the
   * save/restore; it is required to hand a panel to the GPU. */
  function mfdEnd(ctx, panel) {
    if (panel && panel.surface) {
      panel.surface.ctx.restore();
      if (global.GLWorld && global.GLWorld.queuePanel && panel.cam) {
        global.GLWorld.queuePanel(panel.cam, panel.world,
                                  panel.surface.canvas, 1);
      }
      panel.surface = null;
      return;
    }
    ctx.restore();
  }

  /* Everything drawn between these two is on the canopy glass: clipped to
   * the window, tinted, and additively blended so it glows through whatever
   * is behind it instead of sitting on top like a decal. */
  function glassBegin(ctx, aperture) {
    ctx.save();
    if (aperture) {
      ctx.beginPath();
      tracePath(ctx, aperture);
      ctx.clip();
    }
    ctx.globalCompositeOperation = 'lighter';
    ctx.shadowColor = 'rgba(120,255,205,0.55)';
    ctx.shadowBlur = 6;
  }

  function glassEnd(ctx) { ctx.restore(); }

  /* Scanlines and a faint wash across the glass, plus the light cones from
   * the emitters. This is the whole "it is being projected" illusion, and
   * it is four cheap draws. */
  function drawProjectionWash(ctx, aperture, emitters, w, h, phase) {
    if (!aperture) return;
    ctx.save();
    ctx.beginPath();
    tracePath(ctx, aperture);
    ctx.clip();
    ctx.globalCompositeOperation = 'lighter';

    for (var i = 0; i < (emitters || []).length; i++) {
      var e = emitters[i];
      var cone = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, h * 0.7);
      cone.addColorStop(0, 'rgba(90,230,180,0.13)');
      cone.addColorStop(0.35, 'rgba(70,190,160,0.045)');
      cone.addColorStop(1, 'rgba(60,170,150,0)');
      ctx.fillStyle = cone;
      ctx.fillRect(0, 0, w, h);
    }

    ctx.globalAlpha = 0.045;
    ctx.fillStyle = '#7dffcf';
    for (var y = (phase % 3); y < h; y += 3) ctx.fillRect(0, y, w, 1);
    ctx.restore();
  }

  /* A target box on the glass: a reticle around something out the window,
   * with a leader line to the edge of the frame when it is off to one side.
   * Direction is always shown as geometry, never as the word "left". */
  function drawHoloTarget(ctx, cam, worldPos, label, sub, color, w, h) {
    var p = cam.project(worldPos);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.shadowColor = color;
    ctx.shadowBlur = 5;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 1.3;
    ctx.font = '10px ui-monospace, monospace';

    if (p && p.x > 0 && p.x < w && p.y > 0 && p.y < h) {
      var s = 11;
      // Four corner brackets rather than a closed box: you can still see
      // the thing you are aiming at.
      [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(function (c) {
        ctx.beginPath();
        ctx.moveTo(p.x + c[0] * s, p.y + c[1] * s - c[1] * 5);
        ctx.lineTo(p.x + c[0] * s, p.y + c[1] * s);
        ctx.lineTo(p.x + c[0] * s - c[0] * 5, p.y + c[1] * s);
        ctx.stroke();
      });
      if (label) ctx.fillText(label, p.x + s + 5, p.y - 2);
      if (sub) {
        ctx.globalAlpha = 0.75;
        ctx.fillText(sub, p.x + s + 5, p.y + 10);
      }
    } else {
      // Off the front of the ship: point at it from the middle of the glass.
      var vec = V.sub(worldPos, cam.eye);
      var sx = V.dot(vec, cam.r), sy = V.dot(vec, cam.u), fz = V.dot(vec, cam.f);
      var dx = sx, dy = -sy;
      if (fz <= 0) { dx = -dx; dy = -dy; }   // behind: point back the other way
      var l = Math.hypot(dx, dy) || 1;
      dx /= l; dy /= l;
      var rad = Math.min(w, h) * 0.30;
      var ax = w / 2 + dx * rad, ay = h / 2 + dy * rad;
      drawArrow(ctx, ax, ay, dx, dy, 18, color, 1.6, 7);
      if (label) ctx.fillText(label, ax + dx * 24 - 18, ay + dy * 24 + 12);
    }
    ctx.restore();
  }

  var Render = {
    Camera: Camera,
    M: M,
    CANOPY_Z: CANOPY_Z,
    APERTURE: APERTURE,
    cockpitSpec: cockpitSpec, canopySegments: canopySegments,
    hullFineness: hullFineness, COCKPIT_ARCH: COCKPIT_ARCH,
    MFD_SLOTS: MFD_SLOTS,
    MFD_MOUNTS: MFD_MOUNTS,
    FLOOR_WINDOW: FLOOR_WINDOW,
    SLOT_S: [SLOT_S0, SLOT_S1],
    mfdCorners: mfdCorners,
    localToWorld: localToWorld,
    dashPoint: dashPoint,
    aperturePath: aperturePath,
    apertureSet: apertureSet,
    pitchAboveFloor: pitchAboveFloor,
    clipProject: clipProject,
    localPoly: localPoly,
    canopyPoly: canopyPoly,
    SIDE_WINDOW: SIDE_WINDOW,
    INTERIOR: INTERIOR,
    NEAR_CLIP: NEAR_CLIP,
    drawCockpit: drawCockpit,
    drawCockpitShell: drawCockpitShell,
    drawCockpitInterior: drawCockpitInterior,
    drawGlass: drawGlass,
    polyBounds: polyBounds,
    mfdBegin: mfdBegin,
    mfdEnd: mfdEnd,
    glassBegin: glassBegin,
    glassEnd: glassEnd,
    drawProjectionWash: drawProjectionWash,
    drawHyperspace: drawHyperspace,
    drawCruiseWarp: drawCruiseWarp,
    hyperStars: hyperStars,
    hyperRadius: hyperRadius,
    drawHoloTarget: drawHoloTarget,
    drawHullModel: drawHullModel,
    drawStationModel: drawStationModel,
    berthDressing: berthDressing,
    drawPortDressing: drawPortDressing,
    drawPortLamps: drawPortLamps,
    drawPortDoors: drawPortDoors,
    /* How far a leaf slides, in PAD RADII, for anything that needs to
     * reason about the animation from outside. Derived now rather than
     * stored, because the doors follow the mouth. */
    doorTravel: function () { return mouthR() * DOOR_TRAVEL_MOUTHS; },
    APRON_R: APRON_R,
    portDressingMesh: portDressingMesh,
    drawExhaust: drawExhaust,
    drawShipExhaust: drawShipExhaust,
    drawWake: drawWake,
    WAKE_ARCS: WAKE_ARCS,
    WAKE_BOLTS: WAKE_BOLTS,
    wakeHash: wakeHash,
    boltPath: boltPath,
    DRIVE_SPEC: DRIVE_SPEC,
    paintMesh: paintMesh,
    faceMaterial: faceMaterial,
    shipMeshes: shipMeshes,
    libHull: libHull,
    gearPhase: gearPhase, gearBounds: gearBounds, gearTravelOf: gearTravelOf,
    hullIds: hullIds, assignHull: assignHull,
    HULL_ASSIGN: HULL_ASSIGN,
    hullSpan: hullSpan,
    libPort: libPort, portIds: portIds, reloadPorts: reloadPorts,
    portModelFor: portModelFor, STATION_MODELS: STATION_MODELS,
    portRole: portRole, assignPort: assignPort, PORT_ASSIGN: PORT_ASSIGN,
    poolFor: poolFor, PORT_POOL: PORT_POOL,
    portClass: portClass, portSizeFor: portSizeFor,
    PORT_PATTERNS: PORT_PATTERNS, PORT_SIZE_CUTS: PORT_SIZE_CUTS,
    drawPortPart: drawPortPart, portSpins: portSpins,
    stationMeshes: stationMeshes,
    drawStationInterior: drawStationInterior,
    interiorBounds: interiorBounds,
    insideInterior: insideInterior,
    setIndoors: setIndoors,
    portSolidity: portSolidity,
    portSections: portSections,
    leafHit: leafHit,
    sectionAt: sectionAt,
    portTriangles: portTriangles,
    portSegmentHit: portSegmentHit,
    berthDeck: berthDeck,
    berthBoom: berthBoom,
    boomLimit: boomLimit,
    portDoors: portDoors,
    carveThroat: carveThroat,
    solidityAt: solidityAt,
    SOLID_WALL: SOLID_WALL,
    SOLID_OUT: SOLID_OUT,
    SOLID_IN: SOLID_IN,
    SOLID_DOOR: SOLID_DOOR,
    box: box, tube: tube, rimRing: rimRing, mergeMesh: merge,
    makeStarfield: makeStarfield,
    drawStarfield: drawStarfield,
    strokePath: strokePath,
    shadeBody: shadeBody,
    drawArrow: drawArrow,
    drawEclipticGrid: drawEclipticGrid,
    niceStep: niceStep,
    drawDropline: drawDropline,
    lighten: lighten,
    shipScreenLength: shipScreenLength,
    drawShipModel: drawShipModel,
    /* Exported for the beam renderer, which has to turn a muzzle offset in
     * the ship's own axes into a world point every frame. It is the same
     * transform the cockpit and every hull model already run on; there was
     * no reason for combat effects to grow a second copy of it. */
    localToWorld: localToWorld,
    shardMeshes: shardMeshes, drawShardModel: drawShardModel,
    SHARD_COUNT: SHARD_COUNT,
    /* The shield. `shellMesh` and `shieldTint` and `shellFlare` are exported
     * for the same reason boltRibbon is: they are the parts a test can hold
     * to account without a canvas. */
    shellMesh: shellMesh, drawShellField: drawShellField,
    shieldTint: shieldTint, shellFlare: shellFlare,
    SHIELD_STANDOFF: SHIELD_STANDOFF, SHIELD_FLASH_LIFE: SHIELD_FLASH_LIFE,
    hullMuzzles: hullMuzzles, shipMuzzles: shipMuzzles,
    seatMuzzle: seatMuzzle,
    /* Exported for the same reason seatMuzzle is: the beam renderer lives in
     * main.js but the geometry of a tracer belongs with the rest of the
     * drawing maths, where it can be tested without a canvas. */
    boltSpan: boltSpan, boltRibbon: boltRibbon,
    BOLT_MIN_W: BOLT_MIN_W, BOLT_MAX_W: BOLT_MAX_W, BOLT_SEGS: BOLT_SEGS,
    SHIP_LEN: SHIP_LEN,
    drawAttitudeLadder: drawAttitudeLadder,
    drawFlightPathMarker: drawFlightPathMarker,
    drawBankScale: drawBankScale
  };

  global.Render = Render;
  if (typeof module !== 'undefined' && module.exports) module.exports = Render;
})(typeof window !== 'undefined' ? window : globalThis);
