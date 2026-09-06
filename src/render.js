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
  var SHIP_LEN = 0.010;   // km — the player's hull, 10 m nose to tail

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
    tanker: 'h2_freighter-m',
    hauler: 'tug-m',
    police: 'police-m',
    merc: 'fighter-l',
    pirate: 'fighter-m',
    liner: 'liner-m',
    /* Was 'capital-m', which was wrong in a way that mattered: a navy that
     * only fields capital hulls cannot be DISPATCHED, and dispatched
     * hunters are what the notoriety work needs. The capital is now free
     * for what it is actually for — the thing you run from. */
    navy: 'navy-m',
    tender: 'tender-m'
  };

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
    LIB_CACHE[id] = mesh;
    return mesh;
  }

  function hullIds() {
    return global.HullLib ? Object.keys(global.HullLib) : [];
  }

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

  function assignHull(kind, id) {
    if (id && !(global.HullLib && global.HullLib[id])) return false;
    if (id) HULL_ASSIGN[kind] = id; else delete HULL_ASSIGN[kind];
    SHIP_MESHES = null;               // rebuilt with the new casting on next use
    return true;
  }

  var LAMP_RINGS = null;
  var DOOR_LEAVES = null;

  /* Radius of the apron slab around a shaft mouth, in pad radii. Sized so
   * the retracted door leaves end up entirely inside it — the leaves ride
   * at z 0.005..0.045 and the apron spans -0.05..0.05, so a leaf that has
   * slid past the mouth is buried in concrete and simply not visible. */
  var APRON_R = 1.35;

  /* How far a leaf slides, in pad radii. Big enough that the innermost
   * tooth clears the 0.55 mouth entirely — a door that is "open" with a
   * finger still over the hole is a door you cannot fly through. */
  var DOOR_TRAVEL = 0.74;
  var DOOR_SKIN = '#6d7683';
  var DOOR_HAZARD = '#e0a63a';
  var TOOTH_PITCH = 0.30, TOOTH_HALF = 0.072, TOOTH_REACH = 0.18;

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
    var slide = Math.max(0, Math.min(1, open || 0)) * DOOR_TRAVEL * radiusKm;
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

  /* ---- one model per kind of station ------------------------------------
   * Keyed by the port's economic role, so what a place DOES is legible from
   * orbit before you have read a single word of its market. Normalised to
   * radius 1; z is the spin axis for anything that turns. */
  var STATION_MESHES = null;
  function stationMeshes() {
    if (STATION_MESHES) return STATION_MESHES;

    // Ordinary orbital port: a wheel.
    var orbital = emptyMesh();
    merge(orbital, rimRing(12, 0.82, 0.16, 0.16), 0, 0, 0);
    merge(orbital, spokes(4, 0.12, 0.70, 0.045), 0, 0, 0);
    merge(orbital, tube(8, 0.22, 0.22, 0.26, true), 0, 0, 0);

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
      // The slab. Spans x 0..0.56, which covers the 0.55 mouth radius.
      merge(m, box(0.28, 0.60, 0.020), 0.28, 0, 0.025, 1, DOOR_SKIN);
      // A hazard stripe along the leading edge, so the seam is legible.
      merge(m, box(0.03, 0.60, 0.021), 0.05, 0, 0.026, 1, DOOR_HAZARD);
      /* Teeth, offset by half a pitch between the two leaves so they
       * interleave. Four on one leaf, three on the other. */
      for (var i = -2; i <= 2; i++) {
        var y = (i + (parity ? 0.5 : 0)) * TOOTH_PITCH;
        if (Math.abs(y) > 0.60 - TOOTH_HALF) continue;
        merge(m, box(TOOTH_REACH / 2, TOOTH_HALF, 0.020),
              -TOOTH_REACH / 2, y, 0.025, 1, DOOR_SKIN);
      }
      return m;
    }
    DOOR_LEAVES = [doorLeaf(0), doorLeaf(1)];

    var G = global.Gen || {};
    var underground = bayMesh(G.UNDERGROUND_DEPTH || 4.0);
    var bay = bayMesh(G.SHALLOW_DEPTH || 0.9);

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
      bay: bay, underground: underground
    };
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
      var pa = cam.project(a), pb = cam.project(b), pc = cam.project(c);
      if (!pa || !pb || !pc) continue;
      var col = (mesh.c && mesh.c[i]) || null;
      var lit = col && col.charAt(0) === '!';
      tris.push({
        pa: pa, pb: pb, pc: pc,
        depth: (pa.depth + pb.depth + pc.depth) / 3,
        color: lit ? col.slice(1) : (col || tint),
        shade: lit ? 1.15 : 0.26 + 0.70 * Math.max(0, V.dot(normal, sunDir))
      });
    }
    tris.sort(function (p, q) { return q.depth - p.depth; }); // far first

    ctx.save();
    ctx.strokeStyle = edge || 'rgba(10,14,22,0.55)';
    ctx.lineWidth = 0.6;
    for (var t = 0; t < tris.length; t++) {
      var tr = tris[t];
      ctx.fillStyle = shadeTint(tr.color, tr.shade);
      ctx.beginPath();
      ctx.moveTo(tr.pa.x, tr.pa.y);
      ctx.lineTo(tr.pb.x, tr.pb.y);
      ctx.lineTo(tr.pc.x, tr.pc.y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
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

  function drawHullModel(ctx, cam, frame, lengthKm, sunDir, tint, kind) {
    var mesh = shipMeshes()[kind] || shipMeshes().courier;
    if (gpuWorld() && global.GLWorld.queueMesh(cam, frame, mesh, lengthKm, sunDir)) return;
    paintMesh(ctx, cam, frame, mesh, lengthKm, sunDir, tint);
  }

  /* The player's own hull. A ship object already carries pos/fwd/up/right,
   * which is exactly the frame paintMesh wants. */
  /* The player's hull, and the only thing in the game that tracks heat —
   * so it is the only thing that carries the plasma terms. NPCs fly the
   * same shader with the glow at zero, which costs one branch that is
   * never taken. */
  function drawShipModel(ctx, cam, ship, sunDir, tint) {
    var mesh = shipMeshes().courier;
    if (gpuWorld() && global.GLWorld.queueMesh(cam, ship, mesh, SHIP_LEN, sunDir,
                                               ship.reentryGlow || 0, ship.windDir)) return;
    paintMesh(ctx, cam, ship, mesh, SHIP_LEN, sunDir, tint);
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
      // Glass: two tiers, the upper one drawn in.
      merge(mesh, tube(8, dm.rad, dm.rad * 0.88, hh * 0.5, true),
            dx, dy, hh * 0.5, 1, GLASS_TINT);
      merge(mesh, tube(8, dm.rad * 0.88, dm.rad * 0.34, hh * 0.5, true),
            dx, dy, hh * 1.5, 1, GLASS_TINT);
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

  function drawStationModel(ctx, cam, frame, radiusKm, sunDir, model, tint) {
    var mesh = stationMeshes()[model] || stationMeshes().orbital;
    if (gpuWorld() && global.GLWorld.queueMesh(cam, frame, mesh, radiusKm, sunDir)) return;
    paintMesh(ctx, cam, frame, mesh, radiusKm, sunDir, tint, 'rgba(12,20,30,0.6)');
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
  var WAKE_ARCS = 9;

  function wakeHash(str, salt) {
    var h = 2166136261 >>> 0;
    var s = str + '|' + salt;
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
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

    /* Floor the drawn radius so a distant wake is still a visible mote
     * rather than a sub-pixel nothing — the whole point of a wake is that
     * you can spot one from across a system and go and look at it. */
    var r = Math.max(3.5, size * p.scale);
    var depart = wake.kind === 'departure';
    var hot = depart ? '255,120,86' : '110,180,255';
    var cool = depart ? '255,40,60' : '60,110,255';

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    /* The bloom first, so the arcs sit inside their own glow. */
    var glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 2.1);
    glow.addColorStop(0, 'rgba(' + hot + ',' + (0.30 * strength).toFixed(3) + ')');
    glow.addColorStop(0.45, 'rgba(' + cool + ',' + (0.14 * strength).toFixed(3) + ')');
    glow.addColorStop(1, 'rgba(' + cool + ',0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r * 2.1, 0, Math.PI * 2);
    ctx.fill();

    if (r > 5) {
      ctx.lineCap = 'round';
      for (var i = 0; i < WAKE_ARCS; i++) {
        var h1 = wakeHash(wake.id, i);
        var h2 = wakeHash(wake.id, i + 40);
        var h3 = wakeHash(wake.id, i + 80);
        /* Each arc sits on its own shell and creeps round at its own rate.
         * The rates are small and irrational-ish so the whole cloud never
         * comes back into alignment and starts looking like a gear. */
        var rad = r * (0.30 + 0.72 * h1);
        var spin = (h2 - 0.5) * 0.22 + (depart ? -0.06 : 0.06);
        var a0 = h2 * Math.PI * 2 + tSec * spin;
        var span = (0.35 + 1.15 * h3) * (1 - 0.35 * strength);
        var wob = Math.sin(tSec * (0.4 + h1 * 0.7) + h3 * 6.28) * r * 0.05;

        ctx.strokeStyle = 'rgba(' + (h1 > 0.55 ? hot : cool) + ',' +
                          (strength * (0.20 + 0.55 * h3)).toFixed(3) + ')';
        ctx.lineWidth = Math.max(0.8, r * (0.030 + 0.045 * h1));
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(1, rad + wob), a0, a0 + span);
        ctx.stroke();
      }

      /* A brighter core, because the tear itself is where the energy went
       * in. Small — most of the read is the arcs around it. */
      ctx.fillStyle = 'rgba(' + hot + ',' + (0.5 * strength).toFixed(3) + ')';
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(1, r * 0.10), 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = 'rgba(' + hot + ',' + (0.75 * strength).toFixed(3) + ')';
      ctx.beginPath();
      ctx.arc(p.x, p.y, r * 0.55, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
    return p;
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
  function mfdCorners(m, grow) {
    var s = Math.sin(m.bearing), c = Math.cos(m.bearing);
    var hw = m.hw + (grow || 0), hh = m.hh + (grow || 0) * 0.4;
    var cx = s * m.r, cz = c * m.r;
    var rx = c, rz = -s;                                   // along the width
    var sl = Math.sin(m.lean), cl = Math.cos(m.lean);
    var ux = s * sl, uy = cl, uz = c * sl;                 // up the height
    function corner(sx, sy) {
      return [cx + rx * hw * sx + ux * hh * sy,
              m.y + uy * hh * sy,
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

  function canopyPoly(ship, pts) {
    var out = [];
    for (var i = 0; i < pts.length; i++) {
      out.push(localToWorld(ship, pts[i][0] * M, pts[i][1] * M, CANOPY_Z * M));
    }
    return out;
  }

  /* Screen-space outline of the forward canopy opening. */
  function aperturePath(cam, ship) {
    return clipProject(cam, canopyPoly(ship, APERTURE));
  }

  /* Every opening you can see out of, front and both sides. The hull is
   * painted as the whole screen minus all of these at once, which is what
   * lets you look left and find a window there. */
  function apertureSet(cam, ship) {
    var list = [];
    add('front', aperturePath(cam, ship));
    add('left', clipProject(cam, localPoly(ship, SIDE_WINDOW)));
    add('right', clipProject(cam, localPoly(ship, mirrorX(SIDE_WINDOW))));
    add('floor', clipProject(cam, localPoly(ship, FLOOR_WINDOW)));
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
      var bez = projQuad.apply(null, [cam, ship].concat(mfdCorners(mt, 0.022)));
      if (bez) fillPoly(ctx, bez, '#0a0f16', 'rgba(140,175,215,0.30)');

      var quad = projQuad.apply(null, [cam, ship].concat(mfdCorners(mt)));
      if (!quad) continue;

      // Unlit backing, so a panel the caller declines to fill still reads as
      // a screen that is off rather than as a hole in the dashboard.
      fillPoly(ctx, quad, '#050a0e');

      var b = polyBounds(quad);
      mfds.push({ id: mt.id, quad: quad, w: mt.w, h: mt.h });
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
  function mfdBegin(ctx, panel) {
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
    return true;
  }

  function mfdEnd(ctx) { ctx.restore(); }

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
    MFD_SLOTS: MFD_SLOTS,
    MFD_MOUNTS: MFD_MOUNTS,
    FLOOR_WINDOW: FLOOR_WINDOW,
    SLOT_S: [SLOT_S0, SLOT_S1],
    mfdCorners: mfdCorners,
    localToWorld: localToWorld,
    dashPoint: dashPoint,
    aperturePath: aperturePath,
    apertureSet: apertureSet,
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
    drawPortDressing: drawPortDressing,
    drawPortLamps: drawPortLamps,
    drawPortDoors: drawPortDoors,
    DOOR_TRAVEL: DOOR_TRAVEL,
    APRON_R: APRON_R,
    portDressingMesh: portDressingMesh,
    drawExhaust: drawExhaust,
    drawShipExhaust: drawShipExhaust,
    drawWake: drawWake,
    WAKE_ARCS: WAKE_ARCS,
    DRIVE_SPEC: DRIVE_SPEC,
    paintMesh: paintMesh,
    shipMeshes: shipMeshes,
    libHull: libHull, hullIds: hullIds, assignHull: assignHull,
    HULL_ASSIGN: HULL_ASSIGN,
    stationMeshes: stationMeshes,
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
    hullMuzzles: hullMuzzles, shipMuzzles: shipMuzzles,
    SHIP_LEN: SHIP_LEN,
    drawAttitudeLadder: drawAttitudeLadder,
    drawFlightPathMarker: drawFlightPathMarker,
    drawBankScale: drawBankScale
  };

  global.Render = Render;
  if (typeof module !== 'undefined' && module.exports) module.exports = Render;
})(typeof window !== 'undefined' ? window : globalThis);
