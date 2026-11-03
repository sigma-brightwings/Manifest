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
    /* THE FRAME THE BOOM IS MEASURED IN (2026-11-02). Null is the star
     * system's own axes, which is right in space and was right everywhere
     * until the camera could be pulled out of a hangar dug into a planet.
     * There, a pitch against the ecliptic says nothing about the ground:
     * Ashford Undercroft's vertical is wherever the planet's spin has put
     * it, so "above the ship" could be sideways into the rock, the horizon
     * stood on end across the screen, and Astra's zoom-out sheet was a
     * hangar floating in black space with stars underneath it. With a
     * frame { east, north, up } set, yaw is round the LOCAL vertical and
     * pitch is above the LOCAL horizon, and the picture's right-hand axis
     * is level with the ground. main.js sets it at ground ports (see
     * syncCameraFrame) and clears it everywhere else. */
    this.frame = null;
  }

  /* Target -> eye unit vector for a yaw and pitch, in `frame` when there is
   * one. Every place that rebuilds the eye from G.cam asks this, so the
   * clamps and the picture cannot disagree about where the eye is — which
   * is exactly the disagreement a second copy of the formula would buy. */
  function camDir(yaw, pitch, frame) {
    var cp = Math.cos(pitch), sp = Math.sin(pitch);
    var cy = Math.cos(yaw), sy = Math.sin(yaw);
    if (!frame) return { x: cp * cy, y: cp * sy, z: sp };
    var e = frame.east, n = frame.north, u = frame.up;
    return { x: cp * cy * e.x + cp * sy * n.x + sp * u.x,
             y: cp * cy * e.y + cp * sy * n.y + sp * u.y,
             z: cp * cy * e.z + cp * sy * n.z + sp * u.z };
  }
  function camEye(cam) {
    return V.addScaled(cam.target, camDir(cam.yaw, cam.pitch, cam.frame), cam.dist);
  }
  /* A world direction as the yaw and pitch that point the boom along it in
   * `frame` — for handing the camera from one frame to another without the
   * picture jumping. */
  function camAngles(d, frame) {
    var x = frame ? V.dot(d, frame.east) : d.x;
    var y = frame ? V.dot(d, frame.north) : d.y;
    var z = frame ? V.dot(d, frame.up) : d.z;
    var l = Math.sqrt(x * x + y * y + z * z) || 1;
    return { yaw: Math.atan2(y, x), pitch: Math.asin(Math.max(-1, Math.min(1, z / l))) };
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
  /* `frame`, when given, is the camera's own (Camera.frame): the floor's
   * normal is re-expressed in it and the same arc falls out. */
  function pitchAboveFloor(yaw, pitch, dist, up, above, margin, frame) {
    if (!(dist > 0) || !up) return pitch;
    if (frame) up = { x: V.dot(up, frame.east), y: V.dot(up, frame.north),
                      z: V.dot(up, frame.up) };
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
    var cy = Math.cos(this.yaw), sy = Math.sin(this.yaw);
    var d = camDir(this.yaw, this.pitch, this.frame);   // target -> eye
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
    /* In a ground frame the same thing, level with the GROUND: the horizon
     * stays a horizon instead of a diagonal through the shot. */
    var F = this.frame;
    this.r = F ? V.add(V.scale(F.east, -sy), V.scale(F.north, cy))
               : { x: -sy, y: cy, z: 0 };
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

  /* ON FOOT IN YOUR OWN SHIP (2026-10-24): the eye of someone standing in
   * it. `w` is walk.js's walker — x to starboard and z forward in metres,
   * yaw and pitch as walk.js turns them — and `floorY` is the deck in the
   * cockpit's own metres (shipdeck.js), so the eye is a standing height
   * above it. The same projection as the seat, so the room, the screens
   * and the world through the glass all line up exactly as they do there. */
  Camera.prototype.buildWalker = function (ship, w, floorY, wpx, hpx) {
    /* Crouched or standing: the walker's own eye height (walk.js eyeOf). */
    var eyeH = (global.Walk && global.Walk.eyeOf) ? global.Walk.eyeOf(w) : ((global.Walk && global.Walk.EYE) || 1.65);
    this.eye = localToWorld(ship, w.x * M, (floorY + eyeH) * M, w.z * M);
    var cp = Math.cos(w.pitch), sp = Math.sin(w.pitch);
    var sy = Math.sin(w.yaw), cy = Math.cos(w.yaw);
    var R = ship.right, U = ship.up, F = ship.fwd;
    function comb(a, b, c) {
      return { x: R.x * a + U.x * b + F.x * c, y: R.y * a + U.y * b + F.y * c, z: R.z * a + U.z * b + F.z * c };
    }
    this.f = V.norm(comb(sy * cp, sp, cy * cp));
    this.r = V.norm(comb(cy, 0, -sy));
    this.u = V.norm(V.cross(this.r, this.f));
    this.look = { yaw: 0, pitch: 0 };
    var fov = this.cockpitFov || 68 * DEG;
    this.flen = (0.5 * hpx) / Math.tan(fov / 2);
    this.cx = wpx / 2; this.cy = hpx / 2;
    this.w = wpx; this.h = hpx;
  };

  /* IN A SUIT (eva.js, 2026-10-31): an eye and a frame, no ship to hang
   * them off. The seat's field of view, and the camera's own 10 cm near
   * plane, since the nearest thing to a visor is a hull you are about to
   * touch. */
  Camera.prototype.buildFree = function (eye, f, u, wpx, hpx) {
    this.eye = V.clone(eye);
    this.f = V.norm(f);
    this.r = V.norm(V.cross(this.f, u));
    this.u = V.norm(V.cross(this.r, this.f));
    this.look = { yaw: 0, pitch: 0 };
    var fov = this.cockpitFov || 68 * DEG;
    this.flen = (0.5 * hpx) / Math.tan(fov / 2);
    this.cx = wpx / 2; this.cy = hpx / 2;
    this.w = wpx; this.h = hpx;
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

  /* ---- EXCEPT THE TWO WITH A CONNING TOWER (2026-10-25) ------------------
   * Astra: "Let's fit the cockpits to the Carrier and Capital class ships to
   * align with where the conning tower is on the model, and the rest of the
   * ship should be visible since the tower has a 360 degree window views."
   * At 25 m the Capital's observation gallery is 33 cm tall and the
   * Carrier's island cab 75 cm — nobody stands in either. Asked, she chose
   * TRUE SIZE IN THE WORLD, the Capital at 250 m and the Carrier at 300 m:
   * drawn, docked and fought at that length everywhere, and every other
   * hull keeps SHIP_LEN. (The traffic classes already carried their own
   * sizes — a naval cutter is 240 m, the NPC capital ship 520 m; this is
   * the hull YOU fly.) */
  var TRUE_LEN = { capital: 0.250, carrier: 0.300 };
  /* ---- AND NOW EVERY HULL HAS A SIZE OF HER OWN (2026-10-26) --------------
   * Astra: "resize all ships to be large enough that you can climb into
   * them from the ramp, up and into a room which seals the ramp", and "if
   * you have to resize hulls to fit their interiors, do it." At 25 m the
   * rooms of an L or XL hull ran out through her tail. tools/fit-hulls.js
   * found, for each, the smallest length at which every room aboard is
   * inside her model (src/hullfit.js); she is drawn, docked and berthed at
   * that length from now on, through the same TRUE_LEN every caller already
   * reads. The two tower hulls keep theirs. */
  (function () {
    /* Headless (the tests, the tools), the table is a file beside this
     * one; in the page it is a script tag before it. */
    if (!global.HullFit && typeof require === 'function') {
      try { require('./hullfit.js'); } catch (e) { /* not generated yet: every hull at SHIP_LEN */ }
    }
    var F = global.HullFit || {};
    for (var id in F) if (F[id] && F[id].len && !F[id].tower) TRUE_LEN[id] = F[id].len / 1000;
  })();
  /* EACH SHIP HER OWN SIZE (2026-10-29). Ships in space are drawn at their
   * route's size (generate.js), 1.4 to 4.5 times the hull's fitted length,
   * so a 97 m waste hauler was a 31 m ship once you were aboard. Astra:
   * "we'll increase the ship size so that the hull interior makes sense",
   * and, asked, each ship her own size. So a ship object may carry
   * `lengthKm` (main.js sets it on a ship you board, to the length she is
   * drawn at): her length is that, her fit is the hull's scaled up to it
   * (the cockpit at the same point of her model), and her hold is
   * stretched aft to fill the extra (shipInterior). Hulls you fly carry no
   * `lengthKm` and are exactly as they were. */
  /* HALF A METRE HIGHER ON HER GEAR (2026-11-03). Astra, walking under her
   * Talon in her hangar: the ship should sit about half a metre higher on
   * her landing gear. Measured that day: the Talon's keel fin came down to
   * 5 cm off the floor her gear stood on, and over most of her belly a
   * standing head had 10-20 cm to spare.
   *
   * hullfit.js is GENERATED (tools/fit-hulls.js) from the gear as it is
   * modelled, and regenerating it re-runs the length search for every
   * hull, so the lift is not baked into the table: it is added here, the
   * one door every consumer of `ground` and `drop` comes through - the
   * landed stance (main.js settleLanded), the ground beside her
   * (outsidePlan), her hangar's floor (main.js hangarSpec), the ramp's drop
   * (shipInterior) - and the legs are drawn that much longer to meet it
   * (gearExtend). Only a hull that HAS gear is lifted: one with none
   * (Mule, Long Haul, Cutter, Meridian, Leviathan, Capital, Crawler) sits
   * on her belly, and half a metre under that would be air. The fit tool
   * keeps measuring the modelled legs, so a regenerated table does not
   * count the lift twice. */
  var GEAR_LIFT = 0.5;                     // m
  var LIFTED = {};
  function q4m(drop) { return Math.ceil(drop * 4 - 1e-9) / 4; }   // fit-hulls' quarter-metre room rounding
  function liftedFit(id, f) {
    if (LIFTED[id] && LIFTED[id].base === f) return LIFTED[id].fit;
    var mesh = null;
    try { mesh = hullPreviewMesh(id, null); } catch (e) { mesh = null; }
    var geared = !!(mesh && mesh.gear && mesh.gear.some(function (p) { return p.role !== 'door'; }));
    var out = f;
    if (geared && typeof f.ground === 'number') {
      out = {};
      for (var k in f) out[k] = f[k];
      out.ground = f.ground - GEAR_LIFT;
      if (typeof f.drop === 'number') { out.drop = f.drop + GEAR_LIFT; out.dropRoom = q4m(out.drop); }
      out.gearLift = GEAR_LIFT;
      /* How far her legs must reach past where they are modelled to stand
       * on that ground, in metres at her fitted length. Not simply the
       * lift: the table is a measure from the day it was generated, and
       * the legs have been re-rigged since (the fold, 2026-10-21; the tuck,
       * 2026-10-29) - measured 2026-11-03, the Talon's modelled feet stood
       * 0.20 m below the floor the table stood her on, the Tanker's 0.56
       * m, the Trader's 0.03 m above it. So the legs telescope (or, by a
       * few centimetres on the Tanker, close) to exactly the floor. */
      var gb = gearBounds(mesh, 1);
      out.gearExt = gb && isFinite(gb.lo[1]) ? gb.lo[1] * f.len - out.ground : GEAR_LIFT;
    }
    LIFTED[id] = { base: f, fit: out };
    return out;
  }
  function hullFit(x) {
    var id = typeof x === 'string' ? x : (x && x.hullId);
    var F = global.HullFit;
    var f = (id && F && F[id] && F[id].len) ? liftedFit(id, F[id]) : null;
    if (!f || typeof x !== 'object' || !(x.lengthKm > 0) || x.lengthKm * 1000 <= f.len + 1e-6) return f;
    var k = x.lengthKm * 1000 / f.len;
    if (x._fitScaled && x._fitScaled.k === k && x._fitScaled.base === f) return x._fitScaled.fit;
    var s = {};
    for (var key in f) s[key] = f[key];
    s.len = f.len * k;
    if (f.at) s.at = [f.at[0] * k, f.at[1] * k, f.at[2] * k];
    if (typeof f.ground === 'number') s.ground = f.ground * k;
    /* Her legs grow with her, so the lift does too (gearExtend reads it). */
    if (f.gearLift) s.gearLift = f.gearLift * k;
    if (f.gearExt) s.gearExt = f.gearExt * k;
    s.scale = k;
    try { Object.defineProperty(x, '_fitScaled', { value: { k: k, base: f, fit: s }, writable: true, configurable: true, enumerable: false }); }
    catch (e) { /* a frozen object: unscaled caching is fine */ }
    return s;
  }
  function hullLength(x) {
    if (x && typeof x === 'object' && x.lengthKm > 0) {
      var base = TRUE_LEN[x.hullId] || SHIP_LEN;
      return Math.max(base, x.lengthKm);
    }
    var id = typeof x === 'string' ? x : (x && x.hullId);
    return (id && TRUE_LEN[id]) || SHIP_LEN;
  }

  /* ---- THE BRIDGE IN THE TOWER --------------------------------------------
   * Where the cockpit sits on those two: `at` is the cockpit's origin (the
   * seated eye, see Camera.buildCockpit) in the ship's own metres — x to
   * starboard, y up, z forward — placed in the Capital's observation
   * gallery (its window band 36.3–39.5 m up, the glass ahead of the helm at
   * its forward face) and in the Carrier's island cab (glass 18.9–24.3 m up,
   * the cab's forward face). `cut` is the part of the model the bridge
   * replaces, in the hull's unit-length frame: from inside, the gallery or
   * cab's own walls and roof are left out of the outside hull so the room
   * and its glass are what you see — its floor stays, a platform round the
   * bridge's glass a little below the sill — and everything else of her — decks,
   * terraces, mast, the flight deck — is the view. Measured off the models
   * (capital-l observationGallery, carrier-l bridgeCab). */
  var BRIDGE = {
    capital: { at: [44.25, 37.9, 60.8],  cut: [0.125, 0.1395, 0.143, 0.230, 0.168, 0.258] },
    carrier: { at: [29.4, 20.5, 40.66],  cut: [0.057, 0.0575, 0.012, 0.139, 0.093, 0.155] }
  };
  function bridgeSpec(x) {
    var id = typeof x === 'string' ? x : (x && x.hullId);
    return (id && BRIDGE[id]) || null;
  }
  /* The frame the cockpit and every room aboard are drawn in: the ship
   * itself for every hull whose cockpit is at its origin, and for a tower
   * hull a stand-in that reads her live attitude through to the ship and
   * has its own position up in the tower. One per ship, kept (WeakMap, so
   * it never rides along into a save), and the cockpit's cached spec is
   * shared with the ship so the rooms, their doors and the lift are the
   * same objects whichever frame asked for them. */
  var BRIDGE_FRAMES = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
  /* Where the cockpit is in her, in her own metres: up the tower on the
   * two that have one, and on every other hull wherever fit-hulls put it
   * so her rooms are inside her (2026-10-26: it used to be her centre). */
  /* RAISED (shipdeck.js, 2026-11-02): fit-hulls' `at` is the eye the deck
   * was planned round; a cockpit up in her nose block has its eye `rise` up
   * and `fwd` forward of that, and every room aft of it is planned that much
   * further aft and down, so the deck is where it was in her. One array per
   * fit, kept: callers hold on to it. */
  var RAISED_AT = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
  /* Her raise, at her size. A ship drawn longer than her fitted hull
   * (hullFit `scale`) has her cockpit at the same point of her model, so
   * the eye's move scales with her and the stair is re-cut for the new
   * rise (treads no taller than the fitter's). One per fit, kept. */
  function raiseOf(ship, f) {
    var SD = global.ShipDeck, rz = SD && SD.raisedCockpit ? SD.raisedCockpit(ship && (ship.hullId || ship)) : null;
    var k = f && f.scale > 1 ? f.scale : 1;
    if (!rz || k === 1 || !RAISED_AT) return rz;
    var e = RAISED_AT.get(f);
    if (e && e.base === rz && e.scaled) return e.scaled;
    var rise = rz.rise * k, n = Math.abs(rise) < 0.05 ? 0 : Math.ceil(Math.abs(rise) / 0.22 - 1e-9);
    var sc = { rise: n ? rise : 0, fwd: rz.fwd * k, treads: n, run: n ? (n + 1) * 0.25 : 0 };
    RAISED_AT.set(f, { base: rz, scaled: sc, a: null });
    return sc;
  }
  function cockpitAt(ship) {
    var b = bridgeSpec(ship);
    if (b) return b.at;
    var f = hullFit(ship);
    if (!(f && f.at && (f.at[0] || f.at[1] || f.at[2]))) return null;
    var rz = raiseOf(ship, f);
    if (!rz || !RAISED_AT) return f.at;
    /* Keyed on the raise too, so tools/fit-raised.js can try one after
     * another on the same hull. */
    var e = RAISED_AT.get(f);
    if (!e || (e.rz !== rz && e.scaled !== rz)) { e = { rz: rz, a: null }; RAISED_AT.set(f, e); }
    if (!e.a) e.a = [f.at[0], f.at[1] + rz.rise, f.at[2] + rz.fwd];
    return e.a;
  }
  function bridgeFrame(ship) {
    var at = ship && cockpitAt(ship);
    if (!at || !BRIDGE_FRAMES || !ship.pos || !ship.fwd) return ship;
    var p = BRIDGE_FRAMES.get(ship);
    if (!p) {
      p = Object.create(ship);
      Object.defineProperty(p, '_cockpit', {
        get: function () { return ship._cockpit; },
        set: function (v) { ship._cockpit = v; },
        enumerable: false, configurable: true
      });
      p._base = ship;
      BRIDGE_FRAMES.set(ship, p);
    }
    p.pos = localToWorld(ship, at[0] * 0.001, at[1] * 0.001, at[2] * 0.001);
    return p;
  }
  /* The hull with the bridge's own shell taken out: every triangle whose
   * centre falls inside the cut box goes. A new mesh object, built once per
   * library mesh — gl.js caches its buffers on the object. */
  var BRIDGE_CUT_CACHE = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
  function bridgeCutMesh(mesh, ship) {
    var b = bridgeSpec(ship);
    if (!b || !mesh || !mesh.v || !mesh.f || !BRIDGE_CUT_CACHE) return mesh;
    var hit = BRIDGE_CUT_CACHE.get(mesh);
    if (hit) return hit;
    var c = b.cut, m = {}, k;
    for (k in mesh) if (k.charAt(0) !== '_') m[k] = mesh[k];
    m.f = []; m.c = mesh.c ? [] : null;
    for (var i = 0; i < mesh.f.length; i++) {
      var f = mesh.f[i], cx = 0, cy = 0, cz = 0;
      for (var j = 0; j < f.length; j++) {
        var v = mesh.v[f[j]];
        cx += v[0]; cy += v[1]; cz += v[2];
      }
      cx /= f.length; cy /= f.length; cz /= f.length;
      if (cx > c[0] && cx < c[3] && cy > c[1] && cy < c[4] && cz > c[2] && cz < c[5]) continue;
      m.f.push(f);
      if (m.c) m.c.push(mesh.c[i]);
    }
    BRIDGE_CUT_CACHE.set(mesh, m);
    return m;
  }

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
    /* THE SYNDICATE'S OWN, 2026-09-24. Astra: "give the syndicate all ships
     * with the addition of enforcer-* and enforcer_heavy-*. Syndicate is
     * mafia. Pirates are like their disposable muscle."
     *
     * These are HULL keys, not ship classes. Nothing flies as `enforcer`:
     * a Syndicate enforcer is a `police`-kind patrol under the outlaw flag
     * (the mob's enforcement wing, which already carries SYNDICATE_GUN) and
     * it names this key as its `hullClass`. Keeping the kind means every
     * rule written for a patrol — who answers a distress call, who spoils a
     * robbery, who scans your hold for the waste the Syndicate bans — keeps
     * applying without a second copy. The hull is the only thing that
     * changes, so the hull is the only thing that is keyed differently.
     *
     * `merc` above also flies the enforcer family (L), and that is left
     * alone on purpose: per the three-lights livery scheme the paint says
     * nothing about who a ship answers to — light 3 does. Hired muscle and
     * the mob's own muscle buying the same hull from the same yard is
     * exactly what you would expect. */
    enforcer: 'enforcer-m',
    enforcer_heavy: 'enforcer_heavy-m',
    liner: 'liner-m',
    /* THE BULK CARRIER IS A FREIGHTER, NOT A WARSHIP. This briefly flew as
     * carrier-l, which was wrong by a day: Astra — "the navy runs the
     * carrier, and then there are those carrier shipstations, they're
     * basically floating cities." So the carrier family belongs to the
     * fleet, and the merchant heavy gets the hull whose name says what it
     * is. h2_freighter is the biggest civilian silhouette left. */
    bulk: 'h2_freighter-l',
    /* THE TWO THE NAVY RUNS. The cutter above is what gets dispatched; this
     * is what does not have to be. A capital is the thing you run from, and
     * a carrier is a place — see the `carrier` PORT role in economy.js,
     * which is a fleet carrier parked in orbit with a city aboard it. */
    capital: 'capital-l',
    carrier: 'carrier-l',
    /* Was 'capital-m', which was wrong in a way that mattered: a navy that
     * only fields capital hulls cannot be DISPATCHED, and dispatched
     * hunters are what the notoriety work needs. The capital is now free
     * for what it is actually for — the thing you run from. */
    navy: 'navy-m',
    tender: 'tender-m',
    /* The port tug. `hauler` also flies a tug hull and that is a real
     * tension worth naming rather than quietly resolving: a waste hauler
     * crossing a system is not "only ever found around spaceports and
     * shipyards". Left alone deliberately — reassigning the waste class is
     * a separate decision about a separate ship, and churning it here to
     * tidy up a comment would be the wrong reason. */
    tug: 'tug-s',
    /* THE CRAWLER, the station constructor (2026-10-20). One size, three
     * liveries, matching the station art's civilian / -navy / -syn sets.
     * `crawler` is what a player's commissioned one wears; the other two
     * are hull keys for the navy's and the Syndicate's own when they fly. */
    crawler: 'crawler_civilian',
    crawler_navy: 'crawler_navy',
    crawler_syndicate: 'crawler_syndicate',
    /* THE REST OF THE SKY MADE FLYABLE (2026-10-20). The heavy tug and
     * heavy shuttle are the Crawler's bay craft and wear the M members of
     * the families their small sisters wear. NOTE the Sump waste hauler
     * (`hauler`, above) also wears tug-m, so the Hawser and the Sump share
     * a silhouette until the Sump is given a model of its own.
     *
     * The fighter's key is `lance`, not `fighter`, on purpose: the Dart's
     * cockpit names `fighter` in COCKPIT_CLASS and has always fallen back
     * to its archetype rake because that key was empty. Filling it would
     * have quietly re-raked the Dart's glass. */
    tug_heavy: 'tug-m',
    shuttle_heavy: 'shuttle-m',
    lance: 'fighter-s'
  };

  /* A ship may carry its OWN size letter, and when it does it wins.
   *
   * Everywhere else a size is a fact about a class — `HULL_ASSIGN` names
   * one hull per class and `Combat.hullSize` reads the letter off it. A
   * capital's tender breaks that on purpose: the tender is sized to the
   * warship that launched it, so two tenders in the same galaxy are
   * different hulls for a reason that belongs to neither of them.
   *
   * Written as a general override rather than a tender special case, since
   * the moment one ship's size is a fact about another there will be a
   * second. */
  function hullIdForSpec(spec) {
    var base = HULL_ASSIGN[spec && (spec.cls || spec.kind)] || null;
    if (!base || !spec || !spec.sizeLetter) return base;
    var swapped = base.replace(/-(s|m|l)$/, '-' + spec.sizeLetter);
    return (global.HullLib && global.HullLib[swapped]) ? swapped : base;
  }

  /* ---- the 2026-09-11 drop, and what it left unassigned -----------------
   * Five families arrived with no class to fly as, and a hull nothing
   * points at is a hull nobody ever sees. Three of them are placed above,
   * by what their names say they are — which is the only evidence this file
   * has, and the names were chosen by the person who drew them.
   *
   * DELIBERATELY UNASSIGNED, listed here so they read as waiting rather
   * than as missing:
   *
   *   enforcer_heavy-*  ASSIGNED 2026-09-24, as a hull key rather than a
   *       class: the Syndicate's heavy (see HULL_ASSIGN.enforcer_heavy and
   *       buildSyndicateHeavies in generate.js). Left listed here so the
   *       history of why it waited stays next to the others still waiting.
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
        return { role: p.role, pivot: p.pivot, axis: p.axis, stow: p.stow,
                 lift: p.lift || null, hinge: p.hinge || null, swing: p.swing || 0, mesh: pm };
      });
    }
    /* One entry per engineGlow node in the model, so a three-engine hull
     * draws three plumes. nozzlesOf prefers these over its rear-face guess. */
    if (src.engines && src.engines.length) {
      mesh.engines = src.engines.map(function (e) {
        return { x: e[0], y: e[1], z: e[2], r: e[3] };
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

  /* ---- A FOUNDED STATION IS HER CRAWLER (2026-10-31) ---------------------
   * Astra chose it: "Draw her as the Crawler with her crates in the cubes,
   * and dock in her belly hangar." Her model is the Crawler's own art,
   * with her crates in her cubes (crawlerLoaded), laid into a station's
   * frame so that her belly hangar IS the station's bay:
   *
   *   ship (x, y, z)  ->  station (z - HX, -x, -y + HZ)
   *
   * a proper rotation (no mirror, windings kept): her length along the
   * station's x, her beam along y, and her belly - where the hangar door
   * is - facing +z, the way every station's bay faces. HX centres her
   * hangar on the bay's axis; HZ puts the outer face of her belly door at
   * the bay's mouth (Gen SBAY_MOUTH_Z, 0.40). One station unit is her
   * length, 478 m, so the port's radius is 0.478 km.
   *
   * Measured off ref/crawler-src/crawler_allLiveries_14of24.glb, in metres
   * (divide by 478 for model units): berthHangar x +-58, y -94..-57, z
   * -57..143; padL on its ceiling at y -59.3; the two belly leaves
   * (berthDoorPort/Starboard_leaf) at y -96.8..-94.4, x -29..29, z
   * -51..137, sliding apart to port and starboard.
   *
   * The leaves are cut out of her hull here by where their faces lie and
   * drawn as the bay's doors (PORT_DOORS), so the door that opens for you
   * is her own. The bay's numbers (`geom`) are her hangar's, so a ship is
   * flown in through her belly and parked on her ceiling pad: up, in the
   * station's frame, is out of her belly. */
  var CR_LEN_M = 478;
  var CR_HX = 43 / CR_LEN_M;                 // her hangar's centre, along her length
  var CR_HZ = 0.40 - 96.8 / CR_LEN_M;        // her door's outer face to the mouth
  /* RAISED ONE CELL WITH HER DOORS (2026-11-03). tools/glb-patch.js lifts
   * both belly door groups 0.478 m in her art - one import cell, so their
   * rounded faces move exactly one cell - and a walker stands upright in
   * the pit her lift lowers into. The box that finds them by face centroid
   * moves the same cell and finds exactly the faces it found before
   * (test/hull-seal.test.js counts them). Left where they were, on
   * purpose: CR_HZ and geom.ceilZ, which place her door's faces at the
   * bay's mouth and ceiling. Moving those moves the whole founded station
   * by half a metre for nothing a player could see, and the mouth was
   * already "a hair inside" her door; the ceiling now reads 0.48 m low,
   * which is
   * the safe side. */
  var CR_DOOR_LIFT = 0.478;
  var CR_DOOR = { y0: (-96.9 + CR_DOOR_LIFT) / CR_LEN_M, y1: (-94.3 + CR_DOOR_LIFT) / CR_LEN_M, x: 29.2 / CR_LEN_M,
                  z0: -51.2 / CR_LEN_M, z1: 137.2 / CR_LEN_M };
  var CR_PORT = {};
  function crawlerPortKey(station) {
    var liv = station.crawlerLivery === 'syn' || station.crawlerLivery === 'navy' ? station.crawlerLivery : 'civ';
    return 'crawler:' + liv + ':' + (station.crawlerCrates || []).slice().sort().join(',') +
      ((station.crawlerCount || 1) > 1 ? ':x' + station.crawlerCount : '');
  }
  function crToStation(q) {
    return [q[2] - CR_HX, -q[0], -q[1] + CR_HZ];
  }
  function crawlerPortLib(role) {
    if (CR_PORT[role] !== undefined) return CR_PORT[role];
    CR_PORT[role] = null;
    var parts = role.split(':');
    var liv = parts[1], crates = parts[2] ? parts[2].split(',') : [];
    var count = parts[3] && parts[3].charAt(0) === 'x' ? Math.max(1, parseInt(parts[3].slice(1), 10) || 1) : 1;
    var cid = liv === 'syn' ? HULL_ASSIGN.crawler_syndicate : liv === 'navy' ? HULL_ASSIGN.crawler_navy : HULL_ASSIGN.crawler;
    var base = libHull(cid) || libHull(HULL_ASSIGN.crawler);
    if (!base || !base.v) return null;
    var full = crawlerLoaded(cid, base, { hullId: 'crawler', cargo: {},
                                         modules: crates.map(function (id) { return { crateId: id }; }) }) || base;
    var hull = { v: [], f: [], c: [] }, leaves = [{ v: [], f: [], c: [] }, { v: [], f: [], c: [] }];
    var mapV = [hull, leaves[0], leaves[1]].map(function () { return {}; });
    function put(dst, k, vi) {
      var m = mapV[k];
      if (m[vi] === undefined) { m[vi] = dst.v.length; dst.v.push(crToStation(full.v[vi])); }
      return m[vi];
    }
    for (var fi = 0; fi < full.f.length; fi++) {
      var f = full.f[fi], a = full.v[f[0]], b = full.v[f[1]], c = full.v[f[2]];
      var cx = (a[0] + b[0] + c[0]) / 3, cy = (a[1] + b[1] + c[1]) / 3, cz = (a[2] + b[2] + c[2]) / 3;
      var door = cy >= CR_DOOR.y0 && cy <= CR_DOOR.y1 && Math.abs(cx) <= CR_DOOR.x &&
                 cz >= CR_DOOR.z0 && cz <= CR_DOOR.z1;
      /* The port leaf is the one at +x (she slides it further to port). */
      var k = door ? (cx > 0 ? 1 : 2) : 0;
      var dst = k ? leaves[k - 1] : hull;
      dst.f.push([put(dst, k, f[0]), put(dst, k, f[1]), put(dst, k, f[2])]);
      dst.c.push(full.c ? full.c[fi] : '#9a9a94');
    }
    /* STITCHED CRAWLERS (an XL shipyard, and chains of more): each one
     * more is her frame again, alongside along her flank links - her beam
     * (153 m) and a 10 m gap apart, alternately to either side - her own
     * belly doors left shut. The first Crawler's hangar stays the bay. */
    for (var sc = 1; sc < count; sc++) {
      var side = sc % 2 ? 1 : -1, off = Math.ceil(sc / 2) * (163 / CR_LEN_M) * side;
      var b0 = hull.v.length;
      for (var vi2 = 0; vi2 < full.v.length; vi2++) {
        var q2 = crToStation(full.v[vi2]);
        hull.v.push([q2[0], q2[1] + off, q2[2]]);
      }
      for (var fi2 = 0; fi2 < full.f.length; fi2++) {
        var f2 = full.f[fi2];
        hull.f.push([f2[0] + b0, f2[1] + b0, f2[2] + b0]);
        hull.c.push(full.c ? full.c[fi2] : '#9a9a94');
      }
    }
    /* Each leaf slides its own width: port leaf to the station's -y, the
     * starboard one to +y (ship x maps to station -y). */
    var travel = 30 / CR_LEN_M;
    PORT_DOORS[role] = {
      hull: hull,
      leaves: [
        { mesh: leaves[0], axis: [0, -1, 0], travel: travel, berthMid: null },
        { mesh: leaves[1], axis: [0, 1, 0], travel: travel, berthMid: null }
      ]
    };
    var hz = function (yM) { return -yM / CR_LEN_M + CR_HZ; };
    CR_PORT[role] = {
      kind: 'crawler',
      shell: hull,
      solidShell: hull,                       // the door is open to collision: you are cleared through it
      movers: null, city: null, interior: null, spin: null,
      anchors: null,
      geom: {
        mouthR: 28 / CR_LEN_M,                // her door, a hair inside its 58 m
        throatR: 28 / CR_LEN_M,
        chamberX: 100 / CR_LEN_M,             // her hangar, 200 x 116 m, less a wall
        chamberY: 58 / CR_LEN_M,
        floorZ: hz(-59.3),                    // her ceiling pad: the deck you park on
        ceilZ: hz(-94.4),                     // and her door's inner face above it
        berthY: 29 / CR_LEN_M,                // two rows down her length
        /* Six on her pad, and one more for every berth clamp she carries. */
        berths: 6 + crates.filter(function (id) { return id === 'berth'; }).length
      },
      entrances: null, carriers: null
    };
    return CR_PORT[role];
  }
  var CRAWLER_PORT_RADIUS_KM = CR_LEN_M / 1000;

  function decompress(src) {
    var mesh = { v: src.v, f: src.f, c: [] };
    for (var i = 0; i < src.ci.length; i++) mesh.c.push(src.pal[src.ci[i]]);
    return mesh;
  }

  function libPort(role) {
    if (role && role.charAt(0) === 'c' && role.indexOf('crawler:') === 0) return crawlerPortLib(role);
    var lib = global.PortLib;
    if (!lib || !role || !lib[role]) return null;
    if (PORT_CACHE[role]) return PORT_CACHE[role];
    var src = lib[role];
    /* LAZY GEOMETRY (2026-09-22). ports.js is now an index: anchors, geom
     * and extras for every model, and `lazy: true` until the triangles are
     * fetched from src/ports/<id>.js. Asking for the model is what fetches
     * it. In node and wherever a synchronous read is allowed the answer is
     * immediate; otherwise this returns null — the procedural mesh draws —
     * until PortGeo's onload fires portGeometryArrived below. */
    if (src.lazy) {
      if (!global.PortGeo || !global.PortGeo.load(role)) return null;
      src = lib[role];
    }
    var whole = decompress(src);
    /* A car the converter also exports as a moving PART (the ring's lift
     * platform: src.cars, 2026-10-17) is drawn and ridden that way - see
     * portDoors - so it is not lifted out a second time as a mover. */
    var carNodes = null;
    (src.cars || []).forEach(function (cr) { (carNodes = carNodes || {})[cr.node] = true; });
    var split = splitMovers(whole, src.movers, carNodes);
    /* THE CITY OF A CITY SITE IS LIFTED OUT TOO (2026-10-24), and drawn by
     * drawPortCity wherever this port's seed puts it. Out of the solid
     * shell as well: it is not where the art left it any more. */
    var site = citySite(role);
    var cityCut = site ? splitCity(split ? split.shell : whole, site.city) : null;
    if (cityCut) {
      if (split) split.shell = cityCut.shell; else split = { shell: cityCut.shell, movers: null };
      whole = splitCity(whole, site.city).shell;
    }
    var out = {
      kind: src.kind,
      /* The hull WITHOUT its cars: every drawing path reads `shell`, so the
       * cars are drawn once, by drawMovers, where their riders are. */
      shell: split ? split.shell : whole,
      /* ...and WITH them, for collision, which still sees each car where
       * the art left it. */
      solidShell: whole,
      movers: split ? split.movers : null,
      city: cityCut ? cityCut.city : null,
      interior: src.interior ? decompress(src.interior) : null,
      spin: src.spin ? decompress(src.spin) : null,
      anchors: src.anchors || null,
      geom: src.geom || null,
      /* The ground sites' entrances and the cargo-elevator volumes
       * (2026-09-24), carried through as the converter wrote them. */
      entrances: src.entrances || null,
      carriers: src.carriers || null
    };
    gateFacesToShell(out, src);
    out.sheetsThickened = 0;
    /* The stations only (G is a report about them): a ground site's city
     * and street are split by face count (city-sites.test), and its bay
     * is under rock. */
    if (src.kind === 'orbital' && !src.entrances && !/-site-[sml]$/.test(role)) ['shell', 'interior'].forEach(function (k) {
      var got = thickenSheets(out[k]);
      if (got) { out[k] = got; out.sheetsThickened += got.thickened; }
    });
    PORT_CACHE[role] = out;
    return out;
  }

  /* ---- SURFACES MORE THAN A PIXEL THICK (2026-11-03) ---------------------
   *
   * Astra: "can you ensure that the surfaces are more than 1px thick?"
   *
   * Some of the art's walls and floors are single sheets: a connected piece
   * of the mesh flat to within 1e-5 of a radius on one axis. Measured on the
   * Mirven models, 30-440 such pieces per station, almost all of them decals,
   * marks and caution strips laid on a surface (well under a hundredth of a
   * radius across, and meant to be flat); but 16-32 per station are panels
   * a hundredth of a radius or more across — a wall, a floor, a bulkhead —
   * and seen edge-on, or cut by the cutaway, a sheet is a line one pixel
   * wide or nothing at all.
   *
   * So each of those becomes a slab SHEET_SLAB thick: its faces copied that
   * far along the flat axis and the open edges walled, both sides painted
   * as the sheet was. A floor is thickened DOWN (its top stays the deck a
   * hull stands on); a wall away from the model's middle, so a room keeps
   * its size. 0.0008 of a radius is a metre at Threshold Dock and 4 m at
   * Halden Dock: several pixels at any cutaway distance, and inside the
   * plating either way. Returns the new mesh with `thickened`, or null. */
  var SHEET_FLAT = 1e-5, SHEET_MIN_ACROSS = 0.01, SHEET_SLAB = 0.0008, SHEET_MESH_MIN = 100;
  function thickenSheets(m) {
    /* A mesh of a handful of faces is a fixture or a fragment, not a
     * station's walls (render.test's one-triangle bay). */
    if (!m || !m.f || m.f.length < SHEET_MESH_MIN) return null;
    var par = {}, idOf = {}, nid = 0;
    function find(x) { while (par[x] !== undefined && par[x] !== x) x = par[x] = par[par[x]]; return par[x] === undefined ? (par[x] = x) : x; }
    function key(p) { return Math.round(p[0] * 1e5) + '|' + Math.round(p[1] * 1e5) + '|' + Math.round(p[2] * 1e5); }
    var fk = new Array(m.f.length);
    for (var i = 0; i < m.f.length; i++) {
      var f = m.f[i], first = -1;
      for (var k = 0; k < f.length; k++) {
        var p = m.v[f[k]];
        if (!p) continue;
        var q = key(p), id = idOf[q];
        if (id === undefined) id = idOf[q] = nid++;
        if (first < 0) first = id; else { var a = find(first), b = find(id); if (a !== b) par[a] = b; }
      }
      fk[i] = first;
    }
    var C = {};
    for (i = 0; i < m.f.length; i++) {
      if (fk[i] < 0) continue;
      var g = find(fk[i]), c = C[g] || (C[g] = { lo: [Infinity, Infinity, Infinity], hi: [-Infinity, -Infinity, -Infinity], faces: [] });
      c.faces.push(i);
      for (k = 0; k < m.f[i].length; k++) {
        var v = m.v[m.f[i][k]];
        for (var ax = 0; ax < 3; ax++) { if (v[ax] < c.lo[ax]) c.lo[ax] = v[ax]; if (v[ax] > c.hi[ax]) c.hi[ax] = v[ax]; }
      }
    }
    var v2 = null, f2 = null, c2 = null, oi2 = null, count = 0;
    Object.keys(C).forEach(function (gk) {
      var c = C[gk], ext = [c.hi[0] - c.lo[0], c.hi[1] - c.lo[1], c.hi[2] - c.lo[2]];
      var flat = -1;
      for (var a2 = 0; a2 < 3; a2++) if (ext[a2] < SHEET_FLAT) flat = a2;
      if (flat < 0) return;
      var across = Math.max(ext[(flat + 1) % 3], ext[(flat + 2) % 3]);
      if (across < SHEET_MIN_ACROSS) return;
      if (!v2) { v2 = m.v.slice(); f2 = m.f.slice(); c2 = m.c ? m.c.slice() : null; oi2 = m.oi ? m.oi.slice() : null; }
      var level = (c.lo[flat] + c.hi[flat]) / 2;
      var dir = flat === 2 ? -1 : (level >= 0 ? 1 : -1);
      var off = [0, 0, 0]; off[flat] = dir * SHEET_SLAB;
      var copy = {}, edges = {};
      c.faces.forEach(function (fi) {
        var face = m.f[fi], nf = [];
        for (var k3 = 0; k3 < face.length; k3++) {
          var vi = face[k3];
          if (copy[vi] === undefined) {
            var pv = m.v[vi];
            copy[vi] = v2.length;
            v2.push([pv[0] + off[0], pv[1] + off[1], pv[2] + off[2]]);
          }
          nf.push(copy[vi]);
          var va = face[k3], vb = face[(k3 + 1) % face.length];
          var ek = va < vb ? va + ',' + vb : vb + ',' + va;
          edges[ek] = (edges[ek] || 0) + 1;
        }
        f2.push(nf.slice().reverse());
        if (c2) c2.push(m.c[fi]);
        if (oi2) oi2.push(-1);
      });
      /* The open edges (used by one face of the sheet) get a wall. */
      var col = m.c ? m.c[c.faces[0]] : null;
      Object.keys(edges).forEach(function (ek) {
        if (edges[ek] !== 1) return;
        var ab = ek.split(','), va2 = +ab[0], vb2 = +ab[1];
        var ca = copy[va2], cb = copy[vb2];
        if (ca === undefined || cb === undefined) return;
        f2.push([va2, vb2, cb]); f2.push([va2, cb, ca]);
        if (c2) { c2.push(col); c2.push(col); }
        if (oi2) { oi2.push(-1); oi2.push(-1); }
      });
      count++;
    });
    if (!count) return null;
    var out = { v: v2, f: f2, c: m.c ? c2 : m.c };
    if (oi2) out.oi = oi2;
    out.thickened = count;
    return out;
  }

  /* THE YARDS' DOORS ARE IN THE WRONG BUCKET (2026-11-03). yard-s, yard-m
   * and yard-l carry their PortalLeaf groups in the converter's INTERIOR
   * bucket, and portDoors splits leaves out of the SHELL only: so a yard's
   * doors stayed welded into the interior mesh, drawn shut and solid to the
   * collision, and every arrival flew through them (berths.test had to leave
   * the yards out of its approach sweep for it). The other models put their
   * leaves in the shell.
   *
   * So where the shell has no face in any gate box and the interior does,
   * those interior faces are the leaves: moved into the shell (their
   * vertices appended, `oi` -1 so no part run claims them) before anything
   * reads either bucket. portDoors then finds them where it finds every
   * other model's, and the interior no longer holds a door. A model whose
   * leaves are in the shell is untouched. */
  /* The anchors are written to three decimals, and a leaf drawn as a sheet
   * (yard-m's inner leaves: 0.000 thick) gets a box of no depth that its own
   * faces' centres miss by the rounding. Half a rounding step and a little. */
  var GATE_BOX_PAD = 0.0008;
  /* Padded only on an axis the box has no depth on: a box with depth is
   * tested exactly as it always was, so no model's leaves change but the
   * ones drawn as sheets (G, 2026-11-03: they get thickness elsewhere). */
  function inGateBox(b, x, y, z) {
    if (!b || !b.min || !b.max) return false;
    var p = [x, y, z];
    for (var a = 0; a < 3; a++) {
      var e = (b.max[a] - b.min[a]) < GATE_BOX_PAD * 2 ? GATE_BOX_PAD : 0;
      if (p[a] < b.min[a] - e || p[a] > b.max[a] + e) return false;
    }
    return true;
  }
  function gateFacesToShell(out, src) {
    var gates = src.anchors && src.anchors.gates;
    var sh = out.shell, inn = out.interior;
    if (!gates || !gates.length || !sh || !inn || !inn.f || !inn.f.length) return;
    function inGate(m, face) {
      var x = 0, y = 0, z = 0, n = 0;
      for (var k = 0; k < face.length; k++) {
        var v = m.v[face[k]];
        if (!v) return false;
        x += v[0]; y += v[1]; z += v[2]; n++;
      }
      x /= n; y /= n; z /= n;
      for (var g = 0; g < gates.length; g++) {
        if (inGateBox(gates[g], x, y, z)) return true;
      }
      return false;
    }
    for (var i = 0; i < sh.f.length; i++) if (inGate(sh, sh.f[i])) return;
    var keepF = [], keepC = [], movedF = [], movedC = [];
    for (i = 0; i < inn.f.length; i++) {
      if (inGate(inn, inn.f[i])) { movedF.push(inn.f[i]); movedC.push(inn.c ? inn.c[i] : null); }
      else { keepF.push(inn.f[i]); keepC.push(inn.c ? inn.c[i] : null); }
    }
    if (!movedF.length) return;
    var base = sh.v.length, v2 = sh.v.slice(), remap = {};
    var f2 = sh.f.slice(), c2 = sh.c ? sh.c.slice() : null;
    var oi2 = sh.oi ? sh.oi.slice() : null;
    if (!oi2) { oi2 = []; for (i = 0; i < sh.f.length; i++) oi2.push(i); }
    for (i = 0; i < movedF.length; i++) {
      var face = movedF[i], nf = [];
      for (var k = 0; k < face.length; k++) {
        var vi = face[k];
        if (remap[vi] === undefined) { remap[vi] = v2.length; v2.push(inn.v[vi]); }
        nf.push(remap[vi]);
      }
      f2.push(nf);
      if (c2) c2.push(movedC[i]);
      oi2.push(-1);
    }
    out.shell = { v: v2, f: f2, c: c2, oi: oi2 };
    out.interior = { v: inn.v, f: keepF, c: inn.c ? keepC : inn.c };
    out.gateFacesMoved = movedF.length;
    void base;
  }

  /* ---- MOVERS: the floors that carry a hull (2026-10-16) -----------------
   *
   * Astra: "the elevator pads are invisible inside the stations", and "we
   * need to give the two things different classifications. Openables are
   * one thing, then there are moving surfaces-with-collision."
   *
   * The converter now exports each declared car (glb2hulls: movers) with
   * its box, the unit axis it runs on and how far along it each way it can
   * go from where the art left it. The car's triangles are lifted out of
   * the hull here, by box, the way door leaves are, and drawn by drawMovers
   * at the pose that puts the car under whatever is riding it.
   *
   * Without this a small hull rode a lift whose car stayed parked at the
   * top: the route went down the shaft, the floor did not, and the ship sank
   * through an empty shaft with nothing under it - an "invisible pad". */
  /* `oi` on the shell it returns is each face's index in the shell it was
   * given (or in that shell's own `oi`), so the converter's part runs —
   * indices into the WHOLE shell — still find their faces after a split. */
  function splitMovers(shell, movers, skipNodes) {
    if (!shell || !shell.f || !shell.f.length || !movers || !movers.length) return null;
    var boxes = [];
    for (var m = 0; m < movers.length; m++) {
      var b = movers[m];
      if (!b || !b.min || !b.max) continue;
      if (skipNodes && b.node && skipNodes[b.node]) continue;
      var e = [(b.max[0] - b.min[0]) * 0.02 + 1e-4, (b.max[1] - b.min[1]) * 0.02 + 1e-4,
               (b.max[2] - b.min[2]) * 0.02 + 1e-4];
      boxes.push({ src: b, lo: [b.min[0] - e[0], b.min[1] - e[1], b.min[2] - e[2]],
                   hi: [b.max[0] + e[0], b.max[1] + e[1], b.max[2] + e[2]], f: [], c: [] });
    }
    if (!boxes.length) return null;
    var hullF = [], hullC = [], hullO = [], taken = 0;
    for (var i = 0; i < shell.f.length; i++) {
      var t = shell.f[i], a = shell.v[t[0]], bb = shell.v[t[1]], c = shell.v[t[2]];
      var col = shell.c ? shell.c[i] : null, own = null;
      if (a && bb && c) {
        var px = (a[0] + bb[0] + c[0]) / 3, py = (a[1] + bb[1] + c[1]) / 3, pz = (a[2] + bb[2] + c[2]) / 3;
        for (var k = 0; k < boxes.length && !own; k++) {
          var x = boxes[k];
          if (px >= x.lo[0] && px <= x.hi[0] && py >= x.lo[1] && py <= x.hi[1] &&
              pz >= x.lo[2] && pz <= x.hi[2]) own = x;
        }
      }
      if (own) { own.f.push(t); own.c.push(col); taken++; }
      else { hullF.push(t); hullC.push(col); hullO.push(shell.oi ? shell.oi[i] : i); }
    }
    if (!taken) return null;
    var out = [];
    for (k = 0; k < boxes.length; k++) {
      var s = boxes[k].src;
      if (!boxes[k].f.length) continue;
      var mmesh = { v: shell.v, f: boxes[k].f, c: shell.c ? boxes[k].c : null };
      out.push({ node: s.node, min: s.min, max: s.max, mid: s.mid, axis: s.axis || null,
                 range: s.range || [0, 0], serves: s.serves || null,
                 deck: moverDeck(mmesh, s), mesh: mmesh });
    }
    return { shell: { v: shell.v, f: hullF, c: shell.c ? hullC : shell.c, oi: hullO }, movers: out };
  }

  /* THE CAR'S DECK, NOT ITS BOX (2026-11-03). Astra, of the 45-degree lift
   * at Halden Dock: "ship sits on top of the shaft for the 45 degree
   * elevator instead of at the base of the shaft to sit on the elevator".
   * Everything that stood a hull on a car stood it on the car's BOX top
   * (`max[2]`), which is the car's deck only for a car that runs straight
   * up and down. A car on an incline is boxed round its whole tilted
   * length: armBoreBCar's box tops out 0.026 radii over its deck, 127 m at
   * Halden Dock, and the hull rode that far above the car — out through the
   * crown of the bore. The deck is the highest surface of the car's own
   * mesh straight down its middle; the box top where the mesh has none. */
  function moverDeck(mesh, mv) {
    if (!mesh || !mesh.f || !mv || !mv.mid) return mv && mv.max ? mv.max[2] : 0;
    var x = mv.mid[0], y = mv.mid[1], best = -Infinity;
    for (var i = 0; i < mesh.f.length; i++) {
      var t = mesh.f[i];
      for (var j = 1; j + 1 < t.length; j++) {
        var a = mesh.v[t[0]], b = mesh.v[t[j]], c = mesh.v[t[j + 1]];
        if (!a || !b || !c) continue;
        var d0 = (b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]);
        if (Math.abs(d0) < 1e-14) continue;
        var u = ((x - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (y - a[1])) / d0;
        var v = ((b[0] - a[0]) * (y - a[1]) - (x - a[0]) * (b[1] - a[1])) / d0;
        if (u < 0 || v < 0 || u + v > 1) continue;
        var z = a[2] + u * (b[2] - a[2]) + v * (c[2] - a[2]);
        if (z > best) best = z;
      }
    }
    return isFinite(best) ? best : mv.max[2];
  }

  /* ---- THE CITY ON A CITY SITE STANDS SOMEWHERE OF ITS OWN (2026-10-24) --
   *
   * Astra: "randomize the location of the city portion and the domes on
   * those ports, without putting them on the landing apron or the door to
   * get some more variety."
   *
   * pad-city-site and runway-city-site carry their settlement as one node
   * in the art - three habitat domes, two greenhouse domes, the tubes
   * between them, a tank, sheds, solar panels and a mast, on a slab of
   * its own - and every port drawn from the same model had it in the same
   * corner. tools/port-sites.cjs reads the .glb (the game's copy has no
   * names left in it) and writes src/port-sites.js: the city's box, and
   * boxes for everything on the site it must keep clear of.
   *
   * ONE PIECE. The domes are not interchangeable: they are three sizes,
   * and each dome's vestibule faces the tube that reaches it, so a dome
   * moved on its own leaves a tube running into a blank wall. The city
   * moves and turns as a whole, and the domes go with it.
   *
   * The triangles are lifted out of the hull by box, the way the cars
   * are; the art keeps the plate the city stands on just below the
   * city's own slab, so the cut is exact (render.test.js counts it
   * against the art: 1,772 triangles on every one of the six models). */
  /* (Not portSite: that name is taken further down, by the role -> site
   * kind lookup, and the later declaration wins.) */
  function citySite(role) {
    var S = global.PortSites;
    return (S && role && S[role]) || null;
  }

  function inBox(p, lo, hi) {
    return p[0] >= lo[0] && p[0] <= hi[0] && p[1] >= lo[1] && p[1] <= hi[1] && p[2] >= lo[2] && p[2] <= hi[2];
  }
  function splitCity(shell, box) {
    if (!shell || !shell.f || !shell.f.length || !box) return null;
    var ex = (box[3] - box[0]) * 0.01, ey = (box[4] - box[1]) * 0.01;
    var lo = [box[0] - ex, box[1] - ey, box[2] - 1e-4], hi = [box[3] + ex, box[4] + ey, box[5] + 1e-3];
    var keepF = [], keepC = [], keepO = [], cityF = [], cityC = [];
    for (var i = 0; i < shell.f.length; i++) {
      var t = shell.f[i], a = shell.v[t[0]], b = shell.v[t[1]], c = shell.v[t[2]];
      var col = shell.c ? shell.c[i] : null, mine = false;
      /* EVERY CORNER inside, not the centre. The site plate is a few huge
       * triangles running the length of the site, and one of them has its
       * centre under the city: by centre it went with the city and left a
       * hole in the ground behind it (measured: 1,773 cut against 1,772 in
       * the art, on all six models). Nothing of the city reaches outside
       * its own box, so the corner test takes exactly the city. */
      if (a && b && c) mine = inBox(a, lo, hi) && inBox(b, lo, hi) && inBox(c, lo, hi);
      if (mine) { cityF.push(t); cityC.push(col); }
      else { keepF.push(t); keepC.push(col); keepO.push(shell.oi ? shell.oi[i] : i); }
    }
    if (!cityF.length) return null;
    return { shell: { v: shell.v, f: keepF, c: shell.c ? keepC : shell.c, oi: keepO },
             city: { v: shell.v, f: cityF, c: shell.c ? cityC : shell.c } };
  }

  /* WHERE IT GOES. All in port units, the site's own frame, +z up.
   *
   *   - clear of everything standing on the site by CITY_MARGIN, and of
   *     the pad, the runway and the doors by LAND_MARGIN, which is wider:
   *     a ship has to come down on one and taxi through the other;
   *   - clear of the RUNWAY'S LINE for STRIP_REACH beyond either end, so
   *     nothing stands under the approach or the climb-out;
   *   - inside CITY_REACH of the centre, every corner of it. The town
   *     dressing (generate.js portBlocks, portDomes) starts at 1.15 and the
   *     signs and the control cabinet stand further out still, so the two
   *     settlements never stand in each other;
   *   - and no further than CITY_NEAR from something of the port, so it
   *     reads as the port's own town and not a camp in the next valley.
   *
   * Any heading. The seed (generate.js dressing.citySeed) drives a small
   * generator, and the first of CITY_TRIES candidates that fits is the
   * answer; if none does, the art's own corner, which fits by design.
   * Cached on the port: a place does not move between visits. */
  var CITY_MARGIN = 0.03, LAND_MARGIN = 0.10, STRIP_REACH = 2.0;
  var CITY_REACH = 1.12, CITY_NEAR = 0.20, CITY_TRIES = 160;

  function cityBlocks(site) {
    var out = [], i, r;
    for (i = 0; i < site.keep.length; i++) {
      r = site.keep[i];
      out.push([r[0] - CITY_MARGIN, r[1] - CITY_MARGIN, r[2] + CITY_MARGIN, r[3] + CITY_MARGIN]);
    }
    for (i = 0; i < site.land.length; i++) {
      r = site.land[i];
      out.push([r[0] - LAND_MARGIN, r[1] - LAND_MARGIN, r[2] + LAND_MARGIN, r[3] + LAND_MARGIN]);
    }
    if (site.strip) {
      r = site.strip;
      /* along its long side, out past both ends */
      if (r[3] - r[1] >= r[2] - r[0]) out.push([r[0] - LAND_MARGIN, r[1] - STRIP_REACH, r[2] + LAND_MARGIN, r[3] + STRIP_REACH]);
      else out.push([r[0] - STRIP_REACH, r[1] - LAND_MARGIN, r[2] + STRIP_REACH, r[3] + LAND_MARGIN]);
    }
    return out;
  }
  function boxGap(a, b) {        // distance between two 2D boxes, 0 if they touch
    var dx = Math.max(0, a[0] - b[2], b[0] - a[2]), dy = Math.max(0, a[1] - b[3], b[1] - a[3]);
    return Math.sqrt(dx * dx + dy * dy);
  }
  /* mulberry32: small, seedable, and the same numbers in every browser */
  function seeded(s) {
    var a = (Math.floor(s * 4294967296) >>> 0) || 0x9e3779b9;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  /* ---- THE CITY IN PARTS, AND THE TUBES BETWEEN THEM (2026-10-24) --------
   *
   * Astra: "ensure that the domes always have tubes that connect to a
   * branch point, a thicker tube, which goes directly into one of the
   * faces of one of the city buildings", and each dome on a spot of its
   * own.
   *
   * So the city is drawn in parts. The CORE - the slab, the tank, the two
   * sheds, the solar panels, the mast - moves and turns as one piece, as
   * before. Each DOME stands on its own spot, turned so its porch door
   * faces the BRANCH POINT, a drum on the ground. A THIN TUBE runs from
   * every dome's door to the drum, and one TRUNK, wider and taller, runs
   * from the drum straight into the middle of one wall of one shed. The
   * art's own four tubes, which joined the domes in the art's layout, are
   * not drawn when the domes move.
   *
   * THE SIZES COME FROM THE ART, not from a guess. A thin tube is square,
   * a shade bigger than a dome's door so it closes over it; the trunk is
   * up to twice as wide and a little taller, but never wider than 85% of
   * the wall it enters or taller than 92% of it - it goes INTO the wall,
   * under the eave, which is why it cannot simply be the art's tube made
   * fatter: the art's tube is taller than a shed. Tubes and the drum run a
   * little below the ground, so they sit flush whether they cross the
   * slab or the bare site.
   *
   * THE LAYOUT IS SEEDED, in the city's own frame, and checked before it
   * is used: the trunk leaves its wall through clear ground; every dome
   * stands clear of the slab's buildings, the other domes, the trunk and
   * every other tube; every thin tube is a straight line from its door to
   * the drum that crosses nothing. Then the whole of it - core, drum,
   * trunk, tubes and domes, piece by piece - is placed on the site the way
   * the city alone was (citySpot). A layout that cannot be placed is
   * thrown away and another drawn; if none can, the city goes whole, in
   * the art's own layout, with the art's own tubes. */
  var CITY_LAYOUTS = 6, DOME_TRIES = 80, DOME_FAN = 2.6;   // radians either side of the trunk's line
  var CITY_PARTS = {};

  /* The city's triangles, sliced by the run list tools/port-sites.cjs
   * read off the art (the converter keeps the art's order). Null when the
   * counts do not add up - the art changed under the data - and then the
   * city is drawn whole. */
  function cityParts(role) {
    if (CITY_PARTS[role] !== undefined) return CITY_PARTS[role];
    CITY_PARTS[role] = null;
    var site = citySite(role), lib = libPort(role);
    if (!site || !site.runs || !site.domes || !site.sheds || !site.tube || !lib || !lib.city) return null;
    var city = lib.city, total = 0, i;
    for (i = 0; i < site.runs.length; i++) total += site.runs[i][1];
    if (total !== city.f.length) return null;
    var parts = { core: null, domes: {}, colour: {} }, at = 0;
    function take(n) { return { v: city.v, f: city.f.slice(at, at + n), c: city.c ? city.c.slice(at, at + n) : null }; }
    function add(dst, m) {
      if (!dst) return m;
      dst.f = dst.f.concat(m.f);
      if (dst.c) dst.c = dst.c.concat(m.c);
      return dst;
    }
    for (i = 0; i < site.runs.length; i++) {
      var k = site.runs[i][0], n = site.runs[i][1], m = take(n);
      if (k === 'core') parts.core = add(parts.core, m);
      else if (k.charAt(0) === 'd') parts.domes[k] = add(parts.domes[k], m);
      else if (!parts.colour[k] && m.c && m.c.length) parts.colour[k] = m.c[0];
      at += n;
    }
    CITY_PARTS[role] = parts;
    return parts;
  }

  function citySizes(site) {
    var d0 = site.domes[0], door = d0.mouth[3] - d0.mouth[2];
    var sh = site.sheds[0], wall = sh[5] - sh[2];
    var thin = Math.min(site.tube.w, door * 1.15);
    return {
      thin: thin,                                   // square, a shade over the door
      trunkH: Math.min(wall * 0.92, thin * 1.35),   // under the eave
      wall: wall,
      roof: site.tube.roof || thin * 0.12,
      unit: site.tube.len || thin * 2.5,            // the art's tube length: the city's own yardstick
      ground: site.ground,
      sink: thin * 0.5,
      margin: thin * 0.5
    };
  }

  /* 2D helpers for the layout */
  function distPtSeg(px, py, ax, ay, bx, by) {
    var dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    var t = l2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2)) : 0;
    return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
  }
  function distPtBox(px, py, b) {
    var dx = Math.max(b[0] - px, 0, px - b[2]), dy = Math.max(b[1] - py, 0, py - b[3]);
    return Math.hypot(dx, dy);
  }
  /* does segment A-B pass through box b grown by pad (Liang-Barsky) */
  function segHitsBox(ax, ay, bx, by, b, pad) {
    var x0 = b[0] - pad, y0 = b[1] - pad, x1 = b[2] + pad, y1 = b[3] + pad;
    var t0 = 0, t1 = 1, dx = bx - ax, dy = by - ay;
    var p = [-dx, dx, -dy, dy], q = [ax - x0, x1 - ax, ay - y0, y1 - ay];
    for (var i = 0; i < 4; i++) {
      if (p[i] === 0) { if (q[i] < 0) return false; continue; }
      var r = q[i] / p[i];
      if (p[i] < 0) { if (r > t1) return false; if (r > t0) t0 = r; }
      else { if (r < t0) return false; if (r < t1) t1 = r; }
    }
    return t0 <= t1;
  }

  /* One layout, in the city's own (art) frame. Null if this draw of the
   * dice cannot be made to work. */
  function cityLayout(site, rnd) {
    var S = citySizes(site), stands = site.stands || [];
    /* the four walls of each shed, in a seeded order */
    var faces = [];
    site.sheds.forEach(function (b, si) {
      var cx = (b[0] + b[3]) / 2, cy = (b[1] + b[4]) / 2;
      faces.push({ s: si, n: [1, 0], at: [b[3], cy], w: b[4] - b[1] },
                 { s: si, n: [-1, 0], at: [b[0], cy], w: b[4] - b[1] },
                 { s: si, n: [0, 1], at: [cx, b[4]], w: b[3] - b[0] },
                 { s: si, n: [0, -1], at: [cx, b[1]], w: b[3] - b[0] });
    });
    for (var i = faces.length - 1; i > 0; i--) { var j = Math.floor(rnd() * (i + 1)), tmp = faces[i]; faces[i] = faces[j]; faces[j] = tmp; }
    var domes = site.domes.slice().sort(function (a, b) { return b.r - a.r; });
    for (var fi = 0; fi < faces.length; fi++) {
      var F = faces[fi], n = F.n;
      var tw = Math.min(F.w * 0.85, S.thin * 2);
      var hubR = tw * 0.75;
      var Lt = S.unit * (1.0 + rnd() * 1.2);
      var B = [F.at[0] + n[0] * Lt, F.at[1] + n[1] * Lt];
      var own = site.sheds[F.s];
      /* the trunk leaves through clear ground: nothing but its own shed */
      var others = stands.filter(function (b) {
        return !(b[0] <= own[3] + 1e-4 && b[2] >= own[0] - 1e-4 && b[1] <= own[4] + 1e-4 && b[3] >= own[1] - 1e-4);
      });
      var ex = [F.at[0] + n[0] * 1e-4, F.at[1] + n[1] * 1e-4];
      if (others.some(function (b) { return segHitsBox(ex[0], ex[1], B[0], B[1], b, tw / 2 + S.margin) || distPtBox(B[0], B[1], b) < hubR + S.margin; })) continue;
      var placed = [], ok = true;
      var base = Math.atan2(n[1], n[0]);
      for (var di = 0; di < domes.length && ok; di++) {
        var d = domes[di];
        var mo = [d.mouth[0] - d.c[0], d.mouth[1] - d.c[1]], mOff = Math.hypot(mo[0], mo[1]);
        var reach = Math.max(d.r * 1.08, mOff + S.thin * 0.6);
        var got = null;
        for (var k = 0; k < DOME_TRIES && !got; k++) {
          /* A FAN ROUND THE DRUM, nearly all the way: five domes this size
           * at this distance take about 80 degrees each, so a half-plane
           * fan (the first try) refused every layout. The trunk's own side
           * is kept clear by the checks below, not by the fan. A dome that
           * keeps failing goes further out. */
          var a = base + (rnd() * 2 - 1) * DOME_FAN;
          var u = [Math.cos(a), Math.sin(a)];
          var g = S.unit * (0.35 + rnd() * (1.0 + k / 15));
          var D = hubR + g + mOff;
          var C = [B[0] + u[0] * D, B[1] + u[1] * D];
          var M = [C[0] - u[0] * mOff, C[1] - u[1] * mOff];
          var bad = false;
          /* the dome, clear of the slab's buildings (its own shed too), the
           * trunk, and the domes and tubes already down */
          for (var q = 0; q < stands.length && !bad; q++) if (distPtBox(C[0], C[1], stands[q]) < reach + S.margin) bad = true;
          if (!bad && distPtSeg(C[0], C[1], F.at[0], F.at[1], B[0], B[1]) < reach + tw / 2 + S.margin) bad = true;
          for (q = 0; q < placed.length && !bad; q++) {
            var P = placed[q];
            if (Math.hypot(C[0] - P.c[0], C[1] - P.c[1]) < reach + P.reach + S.margin) bad = true;
            else if (distPtSeg(C[0], C[1], B[0], B[1], P.m[0], P.m[1]) < reach + S.thin / 2 + S.margin) bad = true;
            /* and its tube, clear of the domes already down */
            else if (distPtSeg(P.c[0], P.c[1], B[0], B[1], M[0], M[1]) < P.reach + S.thin / 2 + S.margin) bad = true;
          }
          /* its tube crosses no building */
          for (q = 0; q < stands.length && !bad; q++) if (segHitsBox(B[0], B[1], M[0], M[1], stands[q], S.thin / 2 + S.margin)) bad = true;
          if (bad) continue;
          var rot = Math.atan2(-u[1], -u[0]) - Math.atan2(mo[1], mo[0]);
          got = { k: d.k, c: C, art: d.c, rot: rot, m: M, u: u, reach: reach };
        }
        if (got) placed.push(got); else ok = false;
      }
      if (!ok) continue;
      /* the pieces, as 2D boxes in the city frame, for placing on the site */
      var pieces = [[site.core[0], site.core[1], site.core[3], site.core[4]],
                    [B[0] - hubR, B[1] - hubR, B[0] + hubR, B[1] + hubR]];
      function seg(A, Bq, w) { pieces.push([Math.min(A[0], Bq[0]) - w, Math.min(A[1], Bq[1]) - w, Math.max(A[0], Bq[0]) + w, Math.max(A[1], Bq[1]) + w]); }
      seg(F.at, B, tw / 2);
      placed.forEach(function (P) {
        seg(B, P.m, S.thin / 2);
        pieces.push([P.c[0] - P.reach, P.c[1] - P.reach, P.c[0] + P.reach, P.c[1] + P.reach]);
      });
      return { sizes: S, face: F, trunkW: tw, hubR: hubR, branch: B, domes: placed, pieces: pieces };
    }
    return null;
  }

  /* SQUARE TO THE SITE. Astra: "the building that the domes connect to
   * must be at a right angle to the other structures' walls; humans don't
   * just put dotted lines on the ground to denote a square and then put a
   * big four sided building at an angle to the lines." The slab and its
   * sheds turn only in quarter turns, so every wall runs with the pad's,
   * the plates' and the markings'. The domes are round and keep any
   * heading; the tubes run where the domes are. */
  function squareTurn(rnd) { return Math.floor(rnd() * 4) * (Math.PI / 2); }

  /* Every piece, turned and slid, clear of the site and close to it. */
  function piecesFit(pieces, rot, x, y, cx, cy, blocks, near) {
    var cs = Math.cos(rot), sn = Math.sin(rot), close = false;
    for (var i = 0; i < pieces.length; i++) {
      var p = pieces[i], lo = [Infinity, Infinity], hi = [-Infinity, -Infinity];
      var cr = [[p[0], p[1]], [p[2], p[1]], [p[0], p[3]], [p[2], p[3]]];
      for (var k = 0; k < 4; k++) {
        var dx = cr[k][0] - cx, dy = cr[k][1] - cy;
        var X = cs * dx - sn * dy + x, Y = sn * dx + cs * dy + y;
        if (Math.hypot(X, Y) > CITY_REACH) return false;
        lo[0] = Math.min(lo[0], X); lo[1] = Math.min(lo[1], Y); hi[0] = Math.max(hi[0], X); hi[1] = Math.max(hi[1], Y);
      }
      var f = [lo[0], lo[1], hi[0], hi[1]];
      for (var j = 0; j < blocks.length; j++) {
        var b = blocks[j];
        if (f[0] < b[2] && f[2] > b[0] && f[1] < b[3] && f[3] > b[1]) return false;
      }
      for (j = 0; j < near.length && !close; j++) if (boxGap(f, near[j]) <= CITY_NEAR) close = true;
    }
    return close;
  }

  /* -> { rot, x, y, cx, cy, layout }: a point p of the city's frame goes
   * to R(rot) (p - c) + (x, y); `layout` places the domes and the tubes
   * inside that frame (null: the city as the art drew it). Null when this
   * port has no city to move. */
  function citySpot(role, port) {
    var site = citySite(role);
    if (!site || !port) return null;
    var memo = port._citySpot || (port._citySpot = {});
    if (memo[role] !== undefined) return memo[role];
    var c = site.city, cx = (c[0] + c[3]) / 2, cy = (c[1] + c[4]) / 2;
    var home = { rot: 0, x: cx, y: cy, cx: cx, cy: cy, home: true, layout: null };
    var seed = port.dressing && typeof port.dressing.citySeed === 'number'
      ? port.dressing.citySeed : null;
    if (seed === null) {
      /* A port built without dressing (a fixture, an old save): a seed from
       * its name, so it still has a place of its own and keeps it. */
      var s = String(port.id || '') + '|' + String(port.name || ''), h = 2166136261;
      for (var q = 0; q < s.length; q++) { h ^= s.charCodeAt(q); h = Math.imul(h, 16777619) >>> 0; }
      seed = h / 4294967296;
    }
    var rnd = seeded(seed), blocks = cityBlocks(site);
    var near = site.keep.concat(site.land);
    var spot = null, t;
    var canSplit = !!cityParts(role);
    for (var at = 0; at < CITY_LAYOUTS && !spot && canSplit; at++) {
      var lay = cityLayout(site, rnd);
      if (!lay) continue;
      var pcx = (site.core[0] + site.core[3]) / 2, pcy = (site.core[1] + site.core[4]) / 2;
      for (t = 0; t < CITY_TRIES && !spot; t++) {
        var rot = squareTurn(rnd);
        var r = Math.sqrt(rnd()) * CITY_REACH, a = rnd() * Math.PI * 2;
        var x = Math.cos(a) * r, y = Math.sin(a) * r;
        if (piecesFit(lay.pieces, rot, x, y, pcx, pcy, blocks, near)) spot = { rot: rot, x: x, y: y, cx: pcx, cy: pcy, home: false, layout: lay };
      }
    }
    /* none would go: the city whole, as the art laid it out */
    var whole = [[c[0], c[1], c[3], c[4]]];
    for (t = 0; t < CITY_TRIES && !spot; t++) {
      var rot2 = squareTurn(rnd);
      var r2 = Math.sqrt(rnd()) * CITY_REACH, a2 = rnd() * Math.PI * 2;
      var x2 = Math.cos(a2) * r2, y2 = Math.sin(a2) * r2;
      if (piecesFit(whole, rot2, x2, y2, cx, cy, blocks, near)) spot = { rot: rot2, x: x2, y: y2, cx: cx, cy: cy, home: false, layout: null };
    }
    memo[role] = spot || home;
    return memo[role];
  }

  /* The tubes, the drum and the trunk, as one mesh in the city's frame. */
  function cityNetwork(lay, parts) {
    var S = lay.sizes, mesh = { v: [], f: [], c: [] };
    var body = parts.colour.tube || '#8a909a', roof = parts.colour.roof || body, win = parts.colour.port || '!#ffcf8a';
    var z0 = S.ground;
    function run(A, B, w, h) {
      var dx = B[0] - A[0], dy = B[1] - A[1], L = Math.hypot(dx, dy);
      if (L < 1e-6) return;
      var u = [dx / L, dy / L], p = [-u[1], u[0]];
      var mx = (A[0] + B[0]) / 2, my = (A[1] + B[1]) / 2;
      var hz = (h + S.sink) / 2;
      addBox(mesh, [mx, my, z0 - S.sink + hz], [u[0] * L / 2, u[1] * L / 2, 0], [p[0] * w / 2, p[1] * w / 2, 0], [0, 0, hz], body);
      addBox(mesh, [mx, my, z0 + h + S.roof / 2], [u[0] * L / 2, u[1] * L / 2, 0], [p[0] * w * 0.56, p[1] * w * 0.56, 0], [0, 0, S.roof / 2], roof);
      /* lit ports down both sides, as the art's tubes have */
      var nw = Math.max(1, Math.floor(L / (S.unit / 3)));
      for (var i = 0; i < nw; i++) {
        var t = (i + 0.5) / nw;
        for (var sd = -1; sd <= 1; sd += 2) {
          addBox(mesh, [A[0] + dx * t + p[0] * sd * w * 0.51, A[1] + dy * t + p[1] * sd * w * 0.51, z0 + h * 0.62],
                 [u[0] * w * 0.14, u[1] * w * 0.14, 0], [p[0] * w * 0.02, p[1] * w * 0.02, 0], [0, 0, h * 0.1], win);
        }
      }
    }
    var F = lay.face, B = lay.branch, n = F.n;
    /* the trunk: into the wall, by a little, so it reads as going in */
    run([F.at[0] - n[0] * S.thin * 0.15, F.at[1] - n[1] * S.thin * 0.15], B, lay.trunkW, S.trunkH);
    /* each dome's tube, closing over its door */
    lay.domes.forEach(function (d) {
      run(B, [d.m[0] + d.u[0] * S.thin * 0.15, d.m[1] + d.u[1] * S.thin * 0.15], S.thin, S.thin);
    });
    /* the branch point: a drum a little taller than the trunk, capped */
    var hubH = S.trunkH * 1.2, hh = (hubH + S.sink) / 2;
    merge(mesh, tube(10, lay.hubR, lay.hubR, hh, true), B[0], B[1], z0 - S.sink + hh, 1, body);
    merge(mesh, tube(10, lay.hubR * 1.06, lay.hubR * 0.7, S.roof, true), B[0], B[1], z0 + hubH + S.roof, 1, roof);
    return mesh;
  }

  /* What is drawn for a city, and where: each mesh with the placements
   * that carry it from its own frame onto the site, innermost last. Used
   * by drawPortCity and by the tests, so the two cannot disagree. */
  function cityDrawList(role, port) {
    var lib = libPort(role);
    if (!lib || !lib.city || !lib.city.f.length) return [];
    var sp = citySpot(role, port);
    if (!sp) return [{ mesh: lib.city, chain: [] }];
    var parts = sp.layout ? cityParts(role) : null;
    if (!parts) return [{ mesh: lib.city, chain: [sp] }];
    var lay = sp.layout;
    var out = [{ mesh: parts.core, chain: [sp] },
               { mesh: lay.net || (lay.net = cityNetwork(lay, parts)), chain: [sp] }];
    lay.domes.forEach(function (d) {
      out.push({ mesh: parts.domes[d.k], chain: [sp, { rot: d.rot, x: d.c[0], y: d.c[1], cx: d.art[0], cy: d.art[1] }] });
    });
    return out;
  }
  /* a point of a mesh, through its chain, into the site frame */
  function cityPlace(chain, p) {
    var q = [p[0], p[1], p[2]];
    for (var i = chain.length - 1; i >= 0; i--) {
      var s = chain[i], cs = Math.cos(s.rot), sn = Math.sin(s.rot), dx = q[0] - s.cx, dy = q[1] - s.cy;
      q = [cs * dx - sn * dy + s.x, sn * dx + cs * dy + s.y, q[2]];
    }
    return q;
  }

  /* The frame that draws the city where citySpot put it: turned about the
   * site's up axis and slid. A rotation about +z keeps the frame right-
   * handed, so no face turns inside out. */
  function cityFrame(frame, sp, km) {
    var cs = Math.cos(sp.rot), sn = Math.sin(sp.rot);
    var R = frame.right, U = frame.up;
    var right = { x: R.x * cs + U.x * sn, y: R.y * cs + U.y * sn, z: R.z * cs + U.z * sn };
    var up = { x: -R.x * sn + U.x * cs, y: -R.y * sn + U.y * cs, z: -R.z * sn + U.z * cs };
    var ox = R.x * sp.x + U.x * sp.y - right.x * sp.cx - up.x * sp.cy;
    var oy = R.y * sp.x + U.y * sp.y - right.y * sp.cx - up.y * sp.cy;
    var oz = R.z * sp.x + U.z * sp.y - right.z * sp.cx - up.z * sp.cy;
    return { pos: { x: frame.pos.x + ox * km, y: frame.pos.y + oy * km, z: frame.pos.z + oz * km },
             right: right, up: up, fwd: frame.fwd };
  }

  /* Drawn by main.js beside drawStationModel, from outside: the city is on
   * the surface, and from a berth or the hangar below it is not in view. */
  function drawPortCity(ctx, cam, frame, port, radiusKm, sunDir, role, tint) {
    if (!port || !port.surface || !frame) return false;
    var list = cityDrawList(role, port);
    if (!list.length) return false;
    for (var i = 0; i < list.length; i++) {
      var fr = frame;
      for (var k = 0; k < list[i].chain.length; k++) fr = cityFrame(fr, list[i].chain[k], radiusKm);
      paintPart(ctx, cam, fr, list[i].mesh, radiusKm, sunDir, tint);
    }
    return true;
  }

  /* Who is riding. main.js hands over the world positions of the hulls
   * that might be on a car this frame (the player's, at least), each with
   * how far its keel sits below its centre, in km. */
  var MOVER_RIDERS = [];
  function setMoverRiders(list) { MOVER_RIDERS = list || []; }

  /* Where along its run a car should be: under the first rider found inside
   * its ride, else where the art left it. In model units along `axis`. */
  function moverPose(mv, frame, radiusKm) {
    if (!mv.axis || !(mv.range[1] - mv.range[0] > 1e-6)) return 0;
    var ax = mv.axis, mid = mv.mid;
    var hx = (mv.max[0] - mv.min[0]) / 2, hy = (mv.max[1] - mv.min[1]) / 2, hz = (mv.max[2] - mv.min[2]) / 2;
    var halfAlong = Math.abs(ax[0]) * hx + Math.abs(ax[1]) * hy + Math.abs(ax[2]) * hz;
    var reach = Math.max(hx, hy, hz) * 1.6;
    for (var i = 0; i < MOVER_RIDERS.length; i++) {
      var r = MOVER_RIDERS[i];
      if (!r || !r.pos) continue;
      var dx = r.pos.x - frame.pos.x, dy = r.pos.y - frame.pos.y, dz = r.pos.z - frame.pos.z;
      var p = [(dx * frame.right.x + dy * frame.right.y + dz * frame.right.z) / radiusKm,
               (dx * frame.up.x + dy * frame.up.y + dz * frame.up.z) / radiusKm,
               (dx * frame.fwd.x + dy * frame.fwd.y + dz * frame.fwd.z) / radiusKm];
      var q = [p[0] - mid[0], p[1] - mid[1], p[2] - mid[2]];
      var along = q[0] * ax[0] + q[1] * ax[1] + q[2] * ax[2];
      var lat = [q[0] - ax[0] * along, q[1] - ax[1] * along, q[2] - ax[2] * along];
      var latD = Math.sqrt(lat[0] * lat[0] + lat[1] * lat[1] + lat[2] * lat[2]);
      if (along < mv.range[0] - halfAlong - reach || along > mv.range[1] + halfAlong + reach) continue;
      if (latD > reach) continue;
      /* The car's TOP under the keel. Model +z is up in every port frame,
       * and a car keeps level, so on anything steeper than a gentle ramp
       * the pose is solved on z; on the flat it follows along the run. */
      var keel = (r.keelKm || 0) / radiusKm, s;
      var top = typeof mv.deck === 'number' ? mv.deck : mv.max[2];
      if (Math.abs(ax[2]) > 0.3) s = (p[2] - keel - top) / ax[2];
      else s = along;
      return Math.max(mv.range[0], Math.min(mv.range[1], s));
    }
    return 0;
  }

  function drawMovers(ctx, cam, frame, radiusKm, sunDir, model, tint) {
    var lib = libPort(model);
    var list = lib && lib.movers;
    if (!list || !list.length) return;
    for (var i = 0; i < list.length; i++) {
      var mv = list[i];
      var s = moverPose(mv, frame, radiusKm);
      var fr = (s && mv.axis) ? shiftFrame(frame, mv.axis[0] * s, mv.axis[1] * s, mv.axis[2] * s, radiusKm) : frame;
      paintPart(ctx, cam, fr, mv.mesh, radiusKm, sunDir, tint);
    }
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

  /* ONE MODEL'S GEOMETRY ARRIVED LATE (the async path of PortGeo), so every
   * cache that remembered "no model here" for it must forget. Keyed caches
   * in this file spell their keys as the model id, or the id followed by a
   * separator and a qualifier — so an id is matched exactly or up to a
   * character that cannot be part of an id, and `ring-m` never clears
   * `ring-classic-m`. The whole-library tables (the mesh table, the pools)
   * are cheap to rebuild and are simply dropped. */
  function portGeometryArrived(id) {
    var own = function (key) {
      if (key === id) return true;
      if (key.indexOf(id) !== 0) return false;
      return !/[a-z0-9-]/i.test(key.charAt(id.length));
    };
    [PORT_CACHE, SOLIDITY, PORT_DOORS, INTERIOR_BOUNDS, CUT_COUNT, OPEN_BUCKET,
     SECTIONS, DRESS, ADSET, BOOM, DECK, TRIDEX, LEAF_BOUNDS, SHELL_MESHES].forEach(function (c) {
      if (!c) return;
      Object.keys(c).forEach(function (k) { if (own(k)) delete c[k]; });
    });
    STATION_MESHES = null;
    if (global.Gen && global.Gen.forgetPortModel) global.Gen.forgetPortModel(id);
  }
  if (global.PortGeo && global.PortGeo.onload) global.PortGeo.onload(portGeometryArrived);

  /* Fetch every model a system's ports will wear, up front. Called when a
   * system is entered, so the reads happen while the jump tunnel is still
   * on screen rather than as each station first comes into view. */
  function prefetchPorts(sys) {
    if (!global.PortGeo || !sys || !sys.ports) return 0;
    var want = {};
    sys.ports.forEach(function (p) { var id = portModelFor(p); if (id) want[id] = true; });
    var ids = Object.keys(want).filter(function (id) { return global.PortLib && global.PortLib[id]; });
    global.PortGeo.prefetch(ids);
    return ids.length;
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
    reprocessing: 'reprocessing', milfuel: 'milfuel',
    /* A fleet carrier is not architecture, it is a SHIP that stopped — so
     * the mesh under this key is the carrier hull out of the SHIP library,
     * folded in by stationMeshes, with a procedural carrier as the
     * fallback. The key is the role's own name like every other row; what
     * is unusual is only where the art comes from. */
    carrier: 'carrier'
  };

  /* What KIND of port this is, before any model is chosen. Three answers,
   * and they are the three that behave differently rather than three that
   * merely look different: a buried bay, a bay on the surface, and a thing
   * in orbit. */
  function portRole(station) {
    if (!station) return 'orbital';
    /* A station you founded in orbit IS her Crawler (stations.js). */
    if (station.playerStation && !station.surface) return 'crawler';
    /* A sea platform (2026-11-02): pads under domes, a hub, tubes - its
     * own procedural mesh, and its own bay table (Gen.seaBay), keyed here
     * so the mesh and the berths cannot come from two different answers.
     * First, because a platform is never a shaft whatever was rolled. */
    if (station.seaPlatform) return 'seaplatform';
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

  /* One of three, and only three things behave differently. A farm and a
   * runway port are both a building on the ground, so they size as a bay. */
  function portClass(role) {
    if (role === 'bay' || role === 'farm' || role === 'seaplatform' || String(role).indexOf('runway-') === 0) return 'bay';
    return role === 'underground' ? 'underground' : 'orbital';
  }

  /* ---- THE 22-09 SET: patterns per role, and three liveries ---------------
   * Astra, 2026-09-22: skimmer stations and hydrogen refineries in orbit of
   * the gas giants; farms on the ground; runway ports on ice worlds; and
   * everything in civilian, navy and Syndicate dress.
   *
   * A table rather than a naming rule, the same as PORT_PATTERNS, because
   * the art does not divide the way the prefixes do: a refinery role wants
   * two kinds of building, the ordinary orbital roles want eight, and the
   * shipyard wants the yards and nothing else. A stem is named by its
   * CIVILIAN id; the livery is a suffix on it (`ring-classic-navy-m`).
   *
   * Only stems actually present in the library count, so a fixture library
   * in a test, or a folder with half the art, falls straight through to the
   * older rules below exactly as before. `spine-v2` is deliberately absent:
   * its berths are a new door dialect the converter does not read yet, and
   * a station you cannot berth at is not one to hand out. */
  /* The new designs only. The -classic stations are not in the library any
   * more (Astra, 24-09: "use the navy and syndicate pre-existing stations
   * as a template for the skins, but don't use them in game as a place you
   * land") — they live in ref/port-art/livery-templates, and
   * tools/skin-liveries.cjs dresses these four in their navy and Syndicate
   * colours as <pattern>-navy-* and <pattern>-syn-*. */
  var ORBITAL_PATTERNS = ['cylinder', 'spine', 'ring', 'cradle'];
  var ROLE_PATTERNS = {
    orbital: ORBITAL_PATTERNS, highport: ORBITAL_PATTERNS, agri: ORBITAL_PATTERNS,
    mining: ORBITAL_PATTERNS, reprocessing: ORBITAL_PATTERNS, milfuel: ORBITAL_PATTERNS,
    refinery: ['refinery', 'skimmer'],
    'plant-skimmer': ['skimmer'], 'plant-refinery': ['refinery'],
    shipyard: ['yard'],
    /* THE GROUND SITES (Astra, 24-09: "Pad and Mountain and Mountain pad
     * and city are all ground stations ... the bays live underground").
     * They replace the old city-port, which is retired. */
    bay: ['pad-site', 'mountain-site', 'runway-site', 'pad-city-site', 'runway-city-site'],
    farm: ['farm'],
    /* The hooks for the runway ports being made now. Until a runway-*-<size>
     * file is in ref/ports these match nothing and the city port stands in. */
    'runway-refi': ['runway-refi'], 'runway-indu': ['runway-indu'], 'runway-pass': ['runway-pass'],
    /* Comet outposts: a hangar cut into ice, so only where the rock is ice. */
    underground: ['comet']
  };
  var LIVERY_SUFFIX = { civ: '', navy: '-navy', syn: '-syn' };
  var ICY_HOSTS = { iceball: true, tundra: true };

  /* MODELS IN THE LIBRARY THAT ARE NOT HANDED OUT, and why. Converted, so
   * the viewer and the tests can see them, but no port wears one until the
   * art is fixed: berths.test measures every model a port can be given, and
   * these are the ones it caught on 2026-09-22. A size held back falls to
   * the next size of the same building; a whole stem held back is simply
   * not in the draw. Remove a line when its art is re-exported and passes. */
  var PORT_HELD_BACK = {};

  function stemPresent(stem) {
    var lib = global.PortLib || {};
    return ['', '-s', '-m', '-l'].some(function (z) {
      return !!lib[stem + z] && !PORT_HELD_BACK[stem + z];
    });
  }

  /* sizedModel, skipping what is held back. */
  function usableModel(stem, size) {
    var lib = global.PortLib || {};
    var order = [size, 'm', 'l', 's'];
    for (var i = 0; i < order.length; i++) {
      var id = stem + '-' + order[i];
      if (lib[id] && !PORT_HELD_BACK[id]) return id;
    }
    return (lib[stem] && !PORT_HELD_BACK[stem]) ? stem : null;
  }

  /* Which livery this port's building wears. The crop decides a farm's
   * (gold buds are the Syndicate's, whoever holds the sky); everything else
   * reads the livery generate.js stamped. */
  function portLivery(station) {
    if (station && station.crop === 'gold') return 'syn';
    var l = station && station.livery;
    if (station && station.crop === 'grape' && l === 'syn') return 'civ';
    return LIVERY_SUFFIX[l] !== undefined ? l : 'civ';
  }

  /* What kind of site this is, for the table above — finer than portRole,
   * which stays the three-way answer everything else keys on. */
  function portSite(station, role) {
    if (role === 'bay' && station && station.siteKind) return station.siteKind;
    /* Over a giant the plant is stamped (generate.js stampLiveries), not
     * hashed here: the economy reads the same answer, so a skimmer's market
     * is hydrogen and its building is a skimmer. */
    if (role === 'refinery' && station && station.plant) return 'plant-' + station.plant;
    /* A milfuel factory promoted out of a giant's refinery is still that
     * refinery — pressing slugs is what the navy and Syndicate ones do. */
    var host = station && station.parentBody;
    if (role === 'milfuel' && host && (host.type === 'gasGiant' || host.type === 'iceGiant')) return 'plant-refinery';
    return role;
  }

  function patternModelFor(station, role, size, plain) {
    var site = plain ? role : portSite(station, role);
    var stems = ROLE_PATTERNS[site];
    if (site === 'underground') {
      var host = station && station.parentBody;
      if (!host || !ICY_HOSTS[host.type]) stems = null;
    }
    var civ = (stems || []).filter(stemPresent);
    /* The ice-world runway ports, until their own art is in: the ground
     * runway sites are the same kind of building, so they stand in before
     * the rest of the ground pool does. */
    if (!civ.length && String(site).indexOf('runway-') === 0) {
      civ = ['runway-site', 'runway-city-site'].filter(stemPresent);
    }
    if (!civ.length) {
      /* A site whose art is not in yet (the runways) stands in with the
       * ordinary ground port rather than the procedural one. */
      if (site !== role) return patternModelFor(station, role, size, true);
      return null;
    }
    var suf = LIVERY_SUFFIX[portLivery(station)];
    var dressed = suf ? civ.filter(function (s) { return stemPresent(s + suf); }) : [];
    var list = dressed.length ? dressed : civ;
    var stem = pick(list, station, site) + (dressed.length ? suf : '');
    return usableModel(stem, size) || stem;
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

    /* A FLEET CARRIER IS NOT IN THE POOL, and this is the one role that has
     * to say so. The pool exists because a refinery and a farm can share a
     * hull without anybody minding — they are all buildings. A carrier is a
     * warship the navy parked, and letting it draw `cradle-l` out of the
     * station pool (which is exactly what happened the first time) puts a
     * civilian shed where the fleet is supposed to be. Its art comes from
     * the SHIP library, folded into the mesh table by stationMeshes, so the
     * answer here is simply its own name. */
    if (role === 'carrier') return role;
    /* HER OWN CRAWLER, with her crates in her cubes: one model per livery
     * and load, built by crawlerPortLib. */
    if (role === 'crawler') return crawlerPortKey(station);

    /* THE MILFUEL FACTORY IS ONE BUILDING (Astra, 2026-09-25: "This will
     * be a Navy refinery structure, size L."). Not pooled, not sized by
     * population: every factory is the large navy refinery, because what
     * the building says on approach — the navy presses its drive fuel here
     * — is the information, and a factory that drew a cradle out of the
     * pool said nothing. In a Syndicate hold, where the licence is theirs,
     * the same structure in their colours; the navy's paint on a mob
     * factory would be a lie the lights then have to correct.
     *
     * Only when the art is in the library, so a fixture library or a bare
     * run falls through to the rules below exactly as before. */
    if (role === 'milfuel') {
      var mf = usableModel(portLivery(station) === 'syn' ? 'refinery-syn' : 'refinery-navy', 'l') ||
               usableModel('refinery-navy', 'l');
      if (mf) return mf;
    }

    /* An explicit assignment wins, and is still size-aware: assign a role a
     * list of STEMS and each port gets the right size of the one it drew. */
    var list = PORT_ASSIGN[role];
    if (list && list.length) {
      var chosen = pick(list, station, role);
      return sizedModel(chosen, size) || chosen;
    }
    /* The 22-09 pattern table, livery-aware. Null when none of its art is
     * in the library, and then the older rules below decide as they did. */
    var patterned = patternModelFor(station, role, size);
    if (patterned) return patterned;

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
  /* How far the stand's lift puts its plating above the cast deck, as a
   * fraction of a hull height — see berthDressing for why it is lifted at
   * all. Module-level because the generator has to agree with it: a stand
   * raised here and a hull parked by the old number is a ship standing IN
   * its own pad, which is exactly what Astra saw. */
  var STAND_LIFT = 0.66;

  /* THE TOP OF THE STAND, in km above the cast deck: the lift plus the
   * plate (padC + padT in berthDressing, in hull lengths). Gen.berthOffset
   * adds this, so the hull rests on the pad rather than in it. */
  function standTopKm() {
    var h = hullSpan('courier');
    var lift = STAND_LIFT * ((h && h.h) || 0);
    return lift + (0.012 + 0.004 + 0.012) * SHIP_LEN;
  }

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

  /* `maxW` (2026-11-01): a BEAM may be fatter up close than a bolt. Astra
   * asked for "a thicker, glowing beam", and the 3.6 px cap is what kept
   * every variety the same hairline at the ranges you actually see them. A
   * bolt keeps the old cap; the caller raises it for a beam only. */
  function boltRibbon(cam, origin, seg, f0, f1, wScale, maxW) {
    var n = BOLT_SEGS, out = [], i;
    var s = wScale > 0 ? wScale : 1;
    var cap = maxW > 0 ? maxW : BOLT_MAX_W;
    for (i = 0; i <= n; i++) {
      var f = f0 + (f1 - f0) * (i / n);
      var p = cam.project({ x: origin.x + seg.x * f,
                            y: origin.y + seg.y * f,
                            z: origin.z + seg.z * f });
      if (!p) return null;
      var w = BOLT_R * p.scale * s;
      if (w < BOLT_MIN_W) w = BOLT_MIN_W;
      else if (w > cap) w = cap;
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
  /* Top of the procedural port's collar beams, pad radii: the beams are
   * box(.., .., 0.05) centred at z 0.03 in the `surface` mesh. */
  var LAMP_COLLAR_Z = 0.08;

  /* Which lamp set stands on this port's street: the collar set on the
   * procedural port, the street set on a modelled one (PortLib supplies
   * the role), since the model brings its own ground at z = 0. */
  function portStreetIsModelled(port) {
    var model = portModelFor(port);
    var lib = global.PortLib;
    return !!(lib && model && lib[model]);
  }
  function lampSetFor(port) {
    if (!LAMP_RINGS) return null;
    return portStreetIsModelled(port) ? LAMP_RINGS.street : LAMP_RINGS;
  }
  /* The procedural apron slab is box(.., .., 0.05) about z = 0. */
  var APRON_TOP = 0.05;
  var PAD_LAMP_HALF_M = 1.2;          // pad-rim lamp housing, half a side, metres

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
    var set = lampSetFor(port);
    var mesh = !cleared ? set.denied
             : (Math.floor(t * 2) % 2 ? set.strobe : set.clear);
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
    /* 'hull:<id>' fits the field to the hull you are actually flying. The
     * player's shell was fitted to the courier because drawShipModel used
     * to draw the courier; it draws the bought hull now, and a Mule inside
     * a courier-shaped bubble has its ends poking out through the field. */
    var hull = k.indexOf('hull:') === 0
      ? hullPreviewMesh(k.slice(5))
      : (shipMeshes()[k] || shipMeshes().courier);
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
   * looking at during a fight. So the field itself is the gauge.
   *
   * Returns '#rrggbb'. `frac` is charge remaining, 1 down to 0. */
  /* ASTRA'S RAMP (2026-09-18): shimmering blue when the field is full,
   * a DULL orange when it is empty, and every charge in between is the
   * gradient between those two — not a ladder of hand-placed stops. It
   * replaced a white → cyan → amber → hot-red run whose empty end shouted;
   * an exhausted field should look spent, not alarmed.
   *
   * Mixed in OKLCh — lightness, chroma, hue — rather than RGB or plain
   * OKLab. Blue and orange are near opposites, so a straight mix of either
   * kind cancels to a mud-grey at half charge (measured: it did, on
   * screen). Walking the HUE instead keeps the colour saturated all the
   * way, and the short way round from blue to orange runs through violet
   * and rose — so a half-spent field is a clearly-coloured midpoint, the
   * lightness and chroma fall steadily toward the dull end, and every step
   * is visibly a step. */
  var SHIELD_FULL = [70, 165, 255];     // bright electric blue
  var SHIELD_EMPTY = [168, 96, 42];     // dull, tired orange

  function srgbToLin(c) {
    c /= 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }
  function linToSrgb(c) {
    c = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
    return Math.max(0, Math.min(255, Math.round(c * 255)));
  }
  function toOklch(rgb) {
    var r = srgbToLin(rgb[0]), g = srgbToLin(rgb[1]), b = srgbToLin(rgb[2]);
    var l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    var m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    var q = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    var L = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * q;
    var A = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * q;
    var B = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * q;
    return [L, Math.hypot(A, B), Math.atan2(B, A)];
  }
  function fromOklch(c) {
    var A = c[1] * Math.cos(c[2]), B = c[1] * Math.sin(c[2]);
    var l = Math.pow(c[0] + 0.3963377774 * A + 0.2158037573 * B, 3);
    var m = Math.pow(c[0] - 0.1055613458 * A - 0.0638541728 * B, 3);
    var q = Math.pow(c[0] - 0.0894841775 * A - 1.2914855480 * B, 3);
    return [linToSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * q),
            linToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * q),
            linToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * q)];
  }
  var SHIELD_FULL_LCH = toOklch(SHIELD_FULL), SHIELD_EMPTY_LCH = toOklch(SHIELD_EMPTY);
  /* The hue step, taken the short way round the circle. */
  var SHIELD_DH = (function () {
    var d = SHIELD_FULL_LCH[2] - SHIELD_EMPTY_LCH[2];
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    return d;
  })();

  function shieldTint(frac) {
    var f = frac < 0 ? 0 : (frac > 1 ? 1 : frac);
    if (!(f >= 0)) f = 0;                       // NaN reads as empty, not as black
    var e = SHIELD_EMPTY_LCH, u = SHIELD_FULL_LCH;
    var c = fromOklch([e[0] + (u[0] - e[0]) * f,
                       e[1] + (u[1] - e[1]) * f,
                       e[2] + SHIELD_DH * f]);
    return '#' + ((1 << 24) | (c[0] << 16) | (c[1] << 8) | c[2]).toString(16).slice(1);
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
  /* 0.9 s, up from 0.55. At 0.55 the shimmer had barely started before
   * it was over, and a hit the field absorbed read as a blink you could
   * miss — Astra's report was that it was not visibly there at all. */
  var SHIELD_FLASH_LIFE = 0.9;    // s — long enough to see the shimmer
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
    var chg = charge > 1 ? 1 : (charge > 0 ? charge : 0);
    var dull = 0.6 + 0.4 * chg;              // a spent field is a dimmer field
    tSec = tSec || 0;
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

      /* THE SHIMMER. Two travelling ripples across the face directions,
       * at speeds that never line up, so the field crawls with light while
       * it is taking the hit instead of flashing as one flat sheet. It is
       * scaled by CHARGE: a full field shimmers hard, a spent one barely
       * moves — the dullness at the orange end is motion as well as hue. */
      var ripple = Math.sin(fd[0] * 11.0 + fd[1] * 7.0 - tSec * 9.3) *
                   Math.sin(fd[2] * 9.0 - fd[1] * 5.0 + tSec * 6.1);
      var shimmer = 1 + ripple * (0.15 + 0.55 * chg);

      var alpha = lit * (0.055 * fres + 0.50 * fl * shimmer) * dull;
      if (alpha < 0.004) continue;
      if (alpha > 0.92) alpha = 0.92;

      /* The flare washes toward white as it peaks — energy arriving, rather
       * than more of the same colour. Only a healthy field does that; an
       * empty one just glows its tired orange. */
      var wash = fl > 1 ? 1 : fl;
      wash *= 0.7 * chg;
      var r = Math.round(cr + (255 - cr) * wash);
      var g = Math.round(cg + (255 - cg) * wash);
      var bl = Math.round(cb + (255 - cb) * wash);

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
  /* ---- THE SEA PLATFORM (2026-11-02) --------------------------------------
   *
   * Astra: "a floating oil rig style of port ... pads that have protected
   * domes open and close to protect ships and their cargo from the waves,
   * and a central bar, connected by covered tubes."
   *
   * Everything here is read off Gen.seaLayout, in KILOMETRES in the port
   * frame (x east, y north, z up off the sea), and drawn at scale 1. The
   * berths, the camera's dome room and the walk are read off the same
   * table, so the pad a hull stands on is the pad that is drawn.
   *
   * SEMI-SUBMERSIBLE, AND STILL. Every structure stands on square columns
   * that go down through the water line onto pontoons awash at it (see
   * SEA_PONTOON_Z; the sea, which is the planet's own sphere, hides
   * everything under it), with
   * the deck SEA_DECK_KM up. Nothing here moves with the swell, and that
   * is deliberate: a semi-sub is stable by design, and a pad that bobbed
   * would put every berth and rail at the mercy of the sea state. Only the
   * domes move, and only when a ship is coming or going.
   *
   * SQUARE WHERE IT CAN BE (Astra does not want round ports): decks,
   * columns, the hub's blocks and the derrick are boxes. The domes and the
   * tubes are round because she asked for domes and tubes.
   *
   * THE DOMES ARE PETALS, not a clamshell. Eight segments of a flattened
   * dome, each hinged at the top of the pad's drum wall, swing up and out
   * to stand open like a flower and fold back down to seal. Petals because
   * opening reads from any side (a clamshell seen edge-on looks shut while
   * it is open), because each leaf is an eighth of the weight and swings
   * an eighth of the arc - so it can open over the drum without sweeping
   * the deck where the ship is, or the tube's doorway - and because a
   * shut petal dome reads as a shell against the weather, which is the
   * point of it. The petals are drawn separately (drawSeaDomes), one
   * frame each, because a petal's pose is a rotation about its hinge and
   * the shared mesh pipeline only moves whole meshes. */
  var SEA_MESH_SCALE = 1;          // the meshes below are in km
  var SEA_DRUM_KM = 0.006;         // the ring wall the petals hinge on
  var SEA_PETALS = 8;
  var SEA_PETAL_OPEN = 100 * Math.PI / 180;   // swung up and out, past vertical
  var SEA_TUBE_R = 0.0045;         // the covered walkway's radius
  var SEA_COL_DOWN = 0.030;        // how far the columns go below the water
  /* PONTOON-STABILISED (Astra, 2026-11-02: "water has a floating,
   * pontoon-stabilized port"). The columns stand on pontoons, and the
   * pontoons are what hold the rig still: their buoyancy sits low, under
   * the wave base where the swell barely moves the water, and the columns
   * that pierce the surface are thin, so a passing crest changes the lift
   * very little - which is why a semi-submersible does not bob and why
   * this one is drawn bolted still. They are drawn AWASH, their decks a
   * metre over the calm water line, so the swell (gl.js SEA_GLSL) washes
   * over them and uncovers them, and you can see what the columns stand
   * on. Rust-dark, like any hull at its water line. */
  var SEA_PONTOON_Z = -0.0032, SEA_PONTOON_HZ = 0.0040;   // centre and half-height, km: top 0.8 m up

  /* `src` placed with its x, y, z axes along `ax`, `ay`, `az` (unit
   * triples) and its origin at t. The one transform the rig needs that
   * merge does not do: rotating a part about the vertical, or laying a
   * tube along a bearing. */
  function mergeAxes(dst, src, t, ax, ay, az, col) {
    var base = dst.v.length, i;
    for (i = 0; i < src.v.length; i++) {
      var p = src.v[i];
      dst.v.push([t[0] + ax[0] * p[0] + ay[0] * p[1] + az[0] * p[2],
                  t[1] + ax[1] * p[0] + ay[1] * p[1] + az[1] * p[2],
                  t[2] + ax[2] * p[0] + ay[2] * p[1] + az[2] * p[2]]);
    }
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
  /* A part turned `a` radians about the vertical, then placed. */
  function mergeTurned(dst, src, x, y, z, a, col) {
    var c = Math.cos(a), s = Math.sin(a);
    return mergeAxes(dst, src, [x, y, z], [c, s, 0], [-s, c, 0], [0, 0, 1], col);
  }

  var SEA_PLATFORM_MESH = null;
  /* Everything of the rig that stands in the water - columns and trestles,
   * [x, y, half-width] in km - for the sea's foam (gl.js SEA_GLSL). Filled
   * by the mesh builder, so the foam is round what is drawn. */
  var SEA_POST_LIST = [];
  function seaPosts() { seaPlatformMesh(); return SEA_POST_LIST; }
  function seaPlatformMesh() {
    if (SEA_PLATFORM_MESH) return SEA_PLATFORM_MESH;
    var Gen = global.Gen;
    var L = Gen && Gen.seaLayout ? Gen.seaLayout() : null;
    var m = emptyMesh();
    if (!L) return (SEA_PLATFORM_MESH = m);
    var D = L.deck, H = L.hub;
    var PONTOON = '#3c2f2a';
    var STEEL = '#8d969e', DARK = '#4a5158', RUST = '#a5603a', DECK = '#5d646b',
        PAINT = '#d9b23a', WHITE = '#dfe6ea';
    /* A square column from under the water to the underside of a deck. */
    function column(x, y, half, a) {
      SEA_POST_LIST.push([x, y, half]);
      var top = D - 0.003, bot = -SEA_COL_DOWN, hz = (top - bot) / 2;
      mergeTurned(m, box(half, half, hz), x, y, bot + hz, a || 0, STEEL);
      /* The splash zone: a dark band where the water line crosses it, the
       * way a real column's anti-fouling and rust read from a distance. */
      mergeTurned(m, box(half * 1.04, half * 1.04, 0.0025), x, y, 0.0005, a || 0, RUST);
    }

    /* THE HUB: four columns on a ring pontoon, a deck, and the bar's block
     * on it - two storeys of windows, a lit band, the derrick and a crane
     * so it reads as a rig from two kilometres. */
    var hc = H * 0.66;
    [[1, 1], [-1, 1], [-1, -1], [1, -1]].forEach(function (q) { column(q[0] * hc, q[1] * hc, 0.0085); });
    /* The hub's pontoons, a square ring of them under the columns. */
    merge(m, box(H * 0.82, 0.007, SEA_PONTOON_HZ), 0, hc, SEA_PONTOON_Z, 1, PONTOON);
    merge(m, box(H * 0.82, 0.007, SEA_PONTOON_HZ), 0, -hc, SEA_PONTOON_Z, 1, PONTOON);
    merge(m, box(0.007, H * 0.82, SEA_PONTOON_HZ), hc, 0, SEA_PONTOON_Z, 1, PONTOON);
    merge(m, box(0.007, H * 0.82, SEA_PONTOON_HZ), -hc, 0, SEA_PONTOON_Z, 1, PONTOON);
    merge(m, box(H, H, 0.003), 0, 0, D - 0.003, 1, DECK);                 // deck
    merge(m, box(H * 1.01, H * 1.01, 0.0012), 0, 0, D - 0.0062, 1, DARK);  // deck's edge girder
    merge(m, box(H * 0.74, H * 0.66, 0.0075), 0, 0, D + 0.0075, 1, WHITE); // the bar, lower storey
    merge(m, box(H * 0.745, H * 0.665, 0.0012), 0, 0, D + 0.0082, 1, '!#ffd28f'); // lit windows
    merge(m, box(H * 0.50, H * 0.46, 0.006), -H * 0.08, 0, D + 0.021, 1, STEEL);  // upper storey
    merge(m, box(H * 0.505, H * 0.465, 0.0010), -H * 0.08, 0, D + 0.0215, 1, '!#bfe2ff');
    merge(m, box(H * 0.22, H * 0.22, 0.0008), -H * 0.08, 0, D + 0.0278, 1, PAINT); // helideck mark
    /* A sign-like lit name band on the north face, toward the large pad. */
    merge(m, box(H * 0.42, 0.0006, 0.0018), 0, H * 0.665, D + 0.0115, 1, '!#7fe9ff');
    /* The derrick: four legs leaning in, three girdles. */
    var dx = H * 0.62, dy = -H * 0.58, dh = 0.060;
    for (var leg = 0; leg < 4; leg++) {
      var lx = (leg & 1 ? 1 : -1) * 0.006, ly = (leg & 2 ? 1 : -1) * 0.006;
      merge(m, box(0.0008, 0.0008, dh / 2), dx + lx, dy + ly, D + dh / 2, 1, PAINT);
    }
    [0.2, 0.5, 0.8].forEach(function (f) {
      merge(m, box(0.0066, 0.0066, 0.0006), dx, dy, D + dh * f, 1, PAINT);
    });
    merge(m, box(0.0012, 0.0012, 0.0012), dx, dy, D + dh + 0.001, 1, '!#ff4a3a'); // air light
    /* The crane on the opposite corner, boom out over the water. */
    merge(m, box(0.003, 0.003, 0.008), -H * 0.70, H * 0.62, D + 0.008, 1, PAINT);
    mergeAxes(m, box(0.028, 0.0012, 0.0012), [-H * 0.70 - 0.020, H * 0.62 + 0.012, D + 0.022],
              [-0.82, 0.40, 0.41], [0.44, 0.9, 0], [-0.37, 0.18, 0.91], PAINT);
    /* Deck lights at the hub's corners. */
    [[1, 1], [-1, 1], [-1, -1], [1, -1]].forEach(function (q) {
      merge(m, box(0.0012, 0.0012, 0.0012), q[0] * H * 0.96, q[1] * H * 0.96, D + 0.0012, 1, '!#fff2c8');
    });

    /* THE PADS, each its own semi-sub, and the tube to each. */
    L.pads.forEach(function (p) {
      var a = p.a, R = p.dome, c = Math.cos(a), s = Math.sin(a);
      var half = R * 1.10;
      var pc = half * 0.72;
      /* Columns under the pad's corners, turned to face the hub. */
      [[1, 1], [-1, 1], [-1, -1], [1, -1]].forEach(function (q) {
        var ux = q[0] * pc, uy = q[1] * pc;
        column(p.x + ux * c - uy * s, p.y + ux * s + uy * c, R * 0.13, a);
      });
      /* Two pontoons under each pad, along its columns, awash. */
      [-1, 1].forEach(function (sd) {
        var ox = -s * sd * pc, oy = c * sd * pc;
        mergeTurned(m, box(half * 0.92, R * 0.14, SEA_PONTOON_HZ), p.x + ox, p.y + oy, SEA_PONTOON_Z, a, PONTOON);
      });
      mergeTurned(m, box(half, half, 0.003), p.x, p.y, D - 0.003, a, DECK);         // the pad's deck
      mergeTurned(m, box(half * 1.01, half * 1.01, 0.0012), p.x, p.y, D - 0.0062, a, DARK);
      /* The drum the petals hinge on: a ring wall round the landing circle,
       * with the tube's doorway in it facing the hub. */
      merge(m, tube(32, R, R, SEA_DRUM_KM / 2, false), p.x, p.y, D + SEA_DRUM_KM / 2, 1, STEEL);
      merge(m, tube(32, R * 1.02, R * 1.02, 0.0008, false), p.x, p.y, D + SEA_DRUM_KM, 1, PAINT); // hinge rail
      /* The landing circle: a ring of lamps, amber on the large pad, and a
       * painted cross to land on. */
      var lamps = 16, lr = R * 0.62, lc = p.large ? '!#ffb45c' : '!#9fe3ff';
      for (var li = 0; li < lamps; li++) {
        var la = li / lamps * Math.PI * 2;
        merge(m, box(0.0011, 0.0011, 0.0005), p.x + Math.cos(la) * lr, p.y + Math.sin(la) * lr, D + 0.0005, 1, lc);
      }
      mergeTurned(m, box(R * 0.42, R * 0.05, 0.0003), p.x, p.y, D + 0.0003, a, PAINT);
      mergeTurned(m, box(R * 0.05, R * 0.42, 0.0003), p.x, p.y, D + 0.0003, a, PAINT);

      /* THE TUBE: from the hub's wall to the drum, a covered walkway on two
       * trestles standing in the sea, with a lit window strip down each
       * side so it reads at night. */
      var start = H, end = p.ring - R * 0.98, len = end - start, mid = (start + end) / 2;
      var tz = D + SEA_TUBE_R + 0.0006;
      var dir = [c, s, 0], side = [-s, c, 0], upv = [0, 0, 1];
      mergeAxes(m, tube(12, SEA_TUBE_R, SEA_TUBE_R, len / 2, false), [c * mid, s * mid, tz],
                side, upv, dir, '#c4ccd2');
      /* Two window strips, one down each flank: thin, so the tube reads as
       * a tube with lights in it rather than as a lit bar. */
      [-1, 1].forEach(function (sd) {
        mergeAxes(m, box(0.0004, 0.0007, len / 2 * 0.96),
                  [c * mid + side[0] * sd * SEA_TUBE_R * 0.98, s * mid + side[1] * sd * SEA_TUBE_R * 0.98, tz + 0.0012],
                  side, upv, dir, '!#d9b27a');
      });
      /* Its floor deck, the girder it rides on and the trestles. */
      mergeAxes(m, box(SEA_TUBE_R * 1.2, 0.0012, len / 2), [c * mid, s * mid, D - 0.0006],
                side, upv, dir, DARK);
      [0.33, 0.67].forEach(function (f) {
        var r0 = start + len * f, top = D - 0.0012, bot = -SEA_COL_DOWN, hz = (top - bot) / 2;
        mergeTurned(m, box(0.0022, SEA_TUBE_R * 0.9, hz), c * r0, s * r0, bot + hz, a, STEEL);
        SEA_POST_LIST.push([c * r0, s * r0, SEA_TUBE_R * 0.7]);
        mergeTurned(m, box(0.0024, SEA_TUBE_R, 0.0022), c * r0, s * r0, 0.0005, a, RUST);
      });
      /* Collars where it meets the hub and the drum. */
      [start + 0.001, end - 0.001].forEach(function (r0) {
        mergeAxes(m, tube(12, SEA_TUBE_R * 1.25, SEA_TUBE_R * 1.25, 0.0012, false), [c * r0, s * r0, tz],
                  side, upv, dir, PAINT);
      });
    });
    return (SEA_PLATFORM_MESH = m);
  }

  /* ONE PETAL, in its hinge's frame: x along the hinge (the drum's
   * tangent), y radially OUT, z up; the hinge line through the origin.
   * Closed, it is an eighth of a flattened dome of radius R and rise h
   * standing on the drum: its base on the circle of radius R round the pad
   * centre at (0, -R, 0), its tip at the crown. Two skins a metre apart so
   * it has an inside, painted, and a thin lit seam along its edges. */
  var SEA_PETAL_CACHE = {};
  /* THE PETALS' PAINT (2026-11-02, second round). In full sun the domes
   * read nearly white and flat: the skin was #cfd6db, 0.81 of white, and
   * under the sun plus the sky fill that is past 1 - clipped, every facet
   * the same white. Now the plate is a mid grey-blue (#8c969e, about 0.58)
   * so a sunlit face lands in range - the sky fill (gl.js uSkyFill) adds
   * about a third again on every side - and every plate differs a little:
   * each row of the leaf is a separate sheet (a few per cent lighter or
   * darker by a fixed pattern, never Math.random - the same dome every
   * time), the seams down a leaf's edges are darker, and the odd leaves
   * (`odd`) are a shade off the even ones, the way panels from different
   * batches weather. With the faceted normals and the highlight the
   * domes ask for (GL.setSheen, drawSeaDomes), the curve shows. */
  function petalShade(hex, f) {
    var n = parseInt(hex.slice(1), 16);
    var c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(function (v) { return Math.max(0, Math.min(255, Math.round(v * f))); });
    return '#' + c.map(function (v) { return ('0' + v.toString(16)).slice(-2); }).join('');
  }
  function seaPetalMesh(R, h, odd) {
    var key = R.toFixed(5) + '|' + h.toFixed(5) + (odd ? '|b' : '');
    if (SEA_PETAL_CACHE[key]) return SEA_PETAL_CACHE[key];
    var m = emptyMesh();
    var NA = 7, NU = 4, half = Math.PI / SEA_PETALS;
    function pt(alpha, phi, inset) {
      /* alpha 0 at the crown, pi/2 at the rim; phi the azimuth off this
       * petal's centre line. The petal's own base point is (0, 0, 0). */
      var rr = (R - inset) * Math.sin(alpha), zz = (h - inset) * Math.cos(alpha);
      return [rr * Math.sin(phi), rr * Math.cos(phi) - R, zz];
    }
    /* Outer skin, inner skin; the seams between petals a shade darker so
     * the dome reads as eight leaves even shut, and a hazard band round
     * the foot where the leaves meet the drum. Colour per face, no extra
     * geometry. */
    var leaf = odd ? 0.95 : 1;
    var ROWS = [1.00, 0.95, 1.04, 0.97, 1.02, 0.94, 1.0];
    [[0, '#8c969e', '#6c747b', '#d9b23a'], [0.0012, '#59626a', '#4a5158', '#59626a']].forEach(function (skin, inner) {
      var base = m.v.length;
      for (var i = 0; i <= NA; i++) {
        for (var j = 0; j <= NU; j++) {
          m.v.push(pt(i / NA * Math.PI / 2, -half + 2 * half * j / NU, skin[0]));
        }
      }
      if (!m.c) m.c = [];
      for (i = 0; i < NA; i++) {
        for (j = 0; j < NU; j++) {
          var a0 = base + i * (NU + 1) + j, a1 = a0 + 1, b0 = a0 + NU + 1, b1 = b0 + 1;
          var col = i === NA - 1 ? skin[3] : (j === 0 || j === NU - 1) ? skin[2] : skin[1];
          if (!inner && i !== NA - 1) col = petalShade(col, leaf * ROWS[i] * (j === 2 ? 1.03 : 1));
          m.f.push([a0, b0, b1]); m.c.push(col);
          m.f.push([a0, b1, a1]); m.c.push(col);
        }
      }
    });
    var tipBase = pt(Math.PI / 2 * 0.92, 0, -0.0005);
    merge(m, box(0.0009, 0.0009, 0.0009), tipBase[0], tipBase[1], tipBase[2], 1, '!#ffcf6a');
    /* The hinge sits on the drum, so the petal is lifted onto it; z here
     * is measured from the top of the drum. */
    SEA_PETAL_CACHE[key] = m;
    return m;
  }

  /* Every dome on the platform, posed. `domes[k]` is pad k's openness, 0
   * shut to 1 open (Sim.domeState decides it; main.js eases it). `frame`
   * is the platform's own: origin on the sea at the port, right east, up
   * north, fwd up - the same frame the rig mesh is drawn in. */
  function drawSeaDomes(ctx, cam, frame, sunDir, tint, domes) {
    var Gen = global.Gen;
    var L = Gen && Gen.seaLayout ? Gen.seaLayout() : null;
    if (!L) return;
    var E = frame.right, N = frame.up, U = frame.fwd;
    /* The petals' highlight (gl.js uSheen): painted sheet. */
    if (global.GLWorld && global.GLWorld.setSheen) global.GLWorld.setSheen(0.22);
    for (var k = 0; k < L.pads.length; k++) {
      var p = L.pads[k];
      var open = Math.max(0, Math.min(1, (domes && domes[k]) || 0));
      /* Eased so the leaves start and stop gently, as a hydraulic ram does. */
      var th = SEA_PETAL_OPEN * (open * open * (3 - 2 * open));
      var ct = Math.cos(th), st = Math.sin(th);
      var cx = p.x, cy = p.y, cz = L.deck + SEA_DRUM_KM;
      for (var i = 0; i < SEA_PETALS; i++) {
        var az = (i + 0.5) / SEA_PETALS * Math.PI * 2;
        var ox = Math.cos(az), oy = Math.sin(az);
        /* Radial out, the hinge's tangent, and up, in the world. */
        var rad = V.add(V.scale(E, ox), V.scale(N, oy));
        var tan = V.add(V.scale(E, -oy), V.scale(N, ox));
        var hinge = { x: frame.pos.x + (E.x * (cx + ox * p.dome) + N.x * (cy + oy * p.dome) + U.x * cz) * SEA_MESH_SCALE,
                      y: frame.pos.y + (E.y * (cx + ox * p.dome) + N.y * (cy + oy * p.dome) + U.y * cz) * SEA_MESH_SCALE,
                      z: frame.pos.z + (E.z * (cx + ox * p.dome) + N.z * (cy + oy * p.dome) + U.z * cz) * SEA_MESH_SCALE };
        /* Swung about the hinge: the petal's y (radially out) and z (up)
         * turn together, z toward out. See the note above seaPetalMesh. */
        var fy = V.add(V.scale(rad, ct), V.scale(U, -st));
        var fz = V.add(V.scale(rad, st), V.scale(U, ct));
        var fr = { pos: hinge, right: tan, up: fy, fwd: fz };
        paintPart(ctx, cam, fr, seaPetalMesh(p.dome, p.rise, i & 1), SEA_MESH_SCALE, sunDir, tint);
      }
    }
    if (global.GLWorld && global.GLWorld.setSheen) global.GLWorld.setSheen(0);
  }

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

    /* FLEET CARRIER: a ship that stopped, and a city that grew on it.
     * Astra: "the navy runs the carrier, and then there are those carrier
     * shipstations, they're basically floating cities."
     *
     * So the silhouette is a hull rather than a structure — long, flat, and
     * far bigger than anything else in the sky — with an island up one side
     * and a lit flight deck running the length of it. The lights are
     * emissive because a deck is lit whichever way it happens to be facing,
     * which is the same trick the bay floors use.
     *
     * THIS IS THE FALLBACK. stationMeshes prefers the imported carrier hull
     * out of the SHIP library when the art is present — the one role whose
     * model comes from the other library, because a carrier is not
     * architecture. */
    var carrier = emptyMesh();
    merge(carrier, box(0.86, 0.26, 0.15), 0, 0, 0);                 // hull
    merge(carrier, box(0.90, 0.30, 0.02), 0, 0, 0.16);              // flight deck
    merge(carrier, box(0.86, 0.02, 0.006), 0, 0, 0.181, undefined, '!#c8d8e8');
    merge(carrier, box(0.10, 0.12, 0.16), 0.30, 0.20, 0.24);        // island
    merge(carrier, tube(6, 0.02, 0.02, 0.16, true), 0.30, 0.20, 0.48);
    [-0.5, -0.1, 0.3].forEach(function (x) {
      merge(carrier, box(0.05, 0.30, 0.07), x, 0, -0.19);           // hangar sponsons
    });
    merge(carrier, tube(8, 0.10, 0.07, 0.12, true), -0.90, 0, 0);   // drives
    merge(carrier, tube(8, 0.06, 0.05, 0.06, true), -1.00, 0, 0, undefined, '!#7ea8ff');
    [0.20, -0.20].forEach(function (y) {
      merge(carrier, box(0.42, 0.015, 0.012), 0.05, y, 0.175, undefined, '!#ffd36b');
    });

    /* MILFUEL FACTORY: a press, not a plant. Astra asked for these as a
     * station type of their own, and the silhouette says what the economy
     * says — fissiles go in, slugs come out. A heavy shielded core with a
     * cask carousel around it (four of them, because the casks are what a
     * factory is FOR and one would read as an antenna), a press gantry down
     * one side, and a hazard band you can see before you can see anything
     * else.
     *
     * The band is emissive rather than lit, which is the trick this file
     * uses everywhere for a light source it does not want to model: a flat
     * 1.15 multiplier at a dark amber reads as a floodlit stripe from any
     * angle and costs nothing.
     *
     * Deliberately taller than it is wide, so it does not read as another
     * reprocessing drum at approach range — they are next-door industries
     * and the whole point of the role is that you can tell which one you
     * are flying to. */
    var milfuel = emptyMesh();
    merge(milfuel, tube(8, 0.34, 0.34, 0.74, true), 0, 0, 0);          // core
    merge(milfuel, rimRing(8, 0.40, 0.05, 0.05), 0, 0, 0.30, undefined, '!#7a5a1e');
    merge(milfuel, rimRing(8, 0.40, 0.05, 0.05), 0, 0, -0.30, undefined, '!#7a5a1e');
    [0, 1, 2, 3].forEach(function (i) {
      var a = (i / 4) * K.TAU + 0.78;
      merge(milfuel, tube(6, 0.12, 0.12, 0.30, true),
            Math.cos(a) * 0.56, Math.sin(a) * 0.56, -0.16);           // casks
      merge(milfuel, box(0.05, 0.05, 0.04),
            Math.cos(a) * 0.56, Math.sin(a) * 0.56, 0.18);            // cask cap
    });
    merge(milfuel, box(0.10, 0.44, 0.08), 0.46, 0, 0.52);             // press gantry
    merge(milfuel, box(0.09, 0.09, 0.22), 0.46, 0, 0.74);             // ram
    merge(milfuel, tube(6, 0.14, 0.14, 0.18, true), 0, 0, 0.88);      // stack

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
    function lampRing(colour, baseZ) {
      var m = emptyMesh();
      /* Along the four edges of the square hatch, not round a circle: the
       * lamps mark the opening, and the opening has corners. Three to a
       * side, with the corners left clear so the shape of the hole is what
       * you read rather than a ring of dots.
       *
       * IN MOUTHS, NOT PAD RADII (2026-11-02) — the same conversion the
       * doors had (see DOOR_TRAVEL_MOUTHS) and this ring missed. It was
       * written as `edge 0.70, step 0.34` and boxes 0.10 x 0.06 x 0.20 pad
       * radii against a mouth of about 0.55, when the lamps really did sit
       * on the hatch's edge. The mouth shrank to 0.20 and the ring did not:
       * at Downwell Starport (pad radius 227 m) it stood 160 m out from a
       * 45 m hatch, over the town, as twelve glowing red pillars 23 m wide
       * and 45 m tall. Through the orange haze and the glow pass that is
       * exactly what Astra's sheet showed — salmon-pink slabs with a pale
       * outline, building-sized, hanging over the rooftops at the angle the
       * wide lens gave them. Nobody could say what they were because nothing
       * about them still looked like a lamp.
       *
       * Now: on the collar, a fifth of a mouth outside the hatch, and the
       * size of a runway light housing — about 4 x 2.5 x 3 m at Downwell.
       * They still read from a distance because they are '!' faces and the
       * glow pass blooms them; that, not their size, is how a lamp is seen
       * from far off. */
      var MR = mouthR();
      var edge = MR * 1.18, step = MR * 0.62;
      var hl = MR * 0.045, hw = MR * 0.028, hz = MR * 0.032;
      var z = baseZ + hz;
      for (var i = -1; i <= 1; i++) {
        var o = i * step;
        merge(m, box(hl, hw, hz), o, edge, z, 1, '!' + colour);
        merge(m, box(hl, hw, hz), o, -edge, z, 1, '!' + colour);
        merge(m, box(hw, hl, hz), edge, o, z, 1, '!' + colour);
        merge(m, box(hw, hl, hz), -edge, o, z, 1, '!' + colour);
      }
      return m;
    }
    /* Two sets, by what the lamps stand on. The procedural surface port
     * has a raised apron whose collar tops out at 0.08 pad radii (see the
     * collar beams in the `surface` mesh); a modelled port's street IS the
     * frame's z = 0 (generate.js: "a shaft's mouth IS the frame origin").
     * One height for both either buries the lamps in the procedural apron
     * or stands them 18 m in the air over a modelled street. */
    function lampSet(baseZ) {
      return {
        denied: lampRing('#ff3b3b', baseZ),     // no clearance: the doors stay shut
        clear:  lampRing('#4dff88', baseZ),     // cleared, come ahead
        strobe: lampRing('#ffffff', baseZ)      // the white half of the flash
      };
    }
    LAMP_RINGS = lampSet(LAMP_COLLAR_Z);
    LAMP_RINGS.street = lampSet(0);

    STATION_MESHES = {
      orbital: orbital, highport: highport, refinery: refinery,
      shipyard: shipyard, agri: agri, mining: mining,
      reprocessing: reprocessing, milfuel: milfuel, carrier: carrier,
      surface: surface,
      bay: bay, underground: underground, hall: hall,
      /* In KILOMETRES, not pad radii - see seaPlatformMesh. Drawn at scale
       * 1 (SEA_MESH_SCALE) by whoever draws it. */
      seaplatform: seaPlatformMesh()
    };

    /* Imported models take over any role they are supplied for; the
     * procedural ports above remain the fallback for everything the library
     * does not cover — so the game runs identically with ports.js absent.
     * Exactly the arrangement shipMeshes uses for hulls, and for the same
     * reason: a folder with three ports modelled and seven not should give
     * you three modelled ports, not a broken sky. */
    /* ONLY MODELS WHOSE GEOMETRY IS ALREADY HERE. Folding every id in, as
     * this used to, would now fetch all hundred-odd models on the first
     * frame — the very load lazy geometry exists to avoid. A model that
     * arrives later is folded in by portGeometryArrived, and until then
     * drawStationModel asks for it by name, which is what fetches it. */
    var ids = portIds();
    for (var pi = 0; pi < ids.length; pi++) {
      var rawP = global.PortLib[ids[pi]];
      if (rawP && rawP.lazy) continue;
      var got = libPort(ids[pi]);
      if (got && got.shell && got.shell.f.length) STATION_MESHES[ids[pi]] = got.shell;
    }

    /* AND ONE ROLE TAKES ITS ART FROM THE SHIP LIBRARY. A fleet carrier is
     * a hull that stopped moving, so the model that should draw it is the
     * carrier in HullLib rather than anything in the port library — which
     * has no carrier in it and never will, because it is a library of
     * buildings. Falls through to the procedural hull above when the ship
     * art is absent, exactly as every other role falls through. */
    var carrierHull = libHull(HULL_ASSIGN.carrier || 'carrier-l');
    if (carrierHull && carrierHull.f && carrierHull.f.length) {
      /* LAID DOWN, because the two libraries disagree about which way is
       * along. A ship is modelled nose along +z and a station is modelled
       * with +z UP out of its own deck, so folding the hull in unrotated
       * stood a nine-hundred-metre carrier on its tail like a monument.
       * One rotation about x — (x, y, z) -> (x, z, -y) — puts the keel in
       * the station's own plane and the flight deck facing up out of it.
       *
       * The vertices are copied rather than rotated in place: libHull
       * caches that mesh and the ship drawing it wants its own axes back. */
      var laid = { v: [], f: carrierHull.f, c: carrierHull.c };
      for (var vi = 0; vi < carrierHull.v.length; vi++) {
        var q = carrierHull.v[vi];
        laid.v.push([q[0], q[2], -q[1]]);
      }
      STATION_MESHES.carrier = laid;
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
    return hullLength(ship) * sp.scale;
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
    /* A number above 1 is a brighter indoors (gl.js); anything else is a
     * plain on or off, as it always was. */
    if (global.GLWorld && global.GLWorld.setIndoors) {
      global.GLWorld.setIndoors(typeof on === 'number' && on > 0 ? on : !!on);
    }
  }

  /* See gl.js setCutaway. The 2D painter cannot cut a hole in a wall —
   * it has no per-pixel stage to do it in — which is why main.js only asks
   * for a cutaway when the GPU layer is live and keeps the old boom clamp
   * otherwise. */
  var CUT_NOW = null;
  function setCutaway(cut) {
    CUT_NOW = cut || null;
    if (global.GLWorld && global.GLWorld.setCutaway) global.GLWorld.setCutaway(cut || null);
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
        color: PAINT_NOW && !mat.lit ? paintFace(mat.color || tint) : (mat.color || tint),
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

  /* ---- CONTRAILS ---------------------------------------------------------
   * Astra asked for missile contrails and "ship contrails in atmo", and the
   * two are the same drawing with different numbers, so there is one of it.
   *
   * A contrail is a list of world points with the time each was laid, drawn
   * as a ribbon that WIDENS and FADES toward the tail: the physical thing
   * is a line of condensation spreading and thinning behind the hull, and
   * both of those read as the same shape on screen. Drawn in screen space
   * off projected points rather than as geometry, for the same reason the
   * tracers are: it is a two-dimensional effect that happens to be in a
   * three-dimensional place, and a mesh for it would be a mesh that always
   * faces the camera.
   *
   * PUFFY RATHER THAN SMOOTH. A trail of even width reads as a wire. The
   * wobble is a deterministic function of the point's own index, not a
   * random draw per frame — a trail that shimmered would be worse than a
   * wire, and this way the same puff is the same puff every frame it is
   * alive for.
   *
   * The caller owns the points. This only knows how to paint them, which is
   * what lets one function serve a missile's motor smoke and a freighter's
   * wake through a stratosphere.
   */
  function drawContrail(ctx, cam, pts, now, opts) {
    if (!pts || pts.length < 2 || !cam) return;
    opts = opts || {};
    var life = opts.life || 8;
    var w0 = opts.width === undefined ? 0.7 : opts.width;   // px at unit scale
    var spread = opts.spread === undefined ? 3.2 : opts.spread;
    var alpha = opts.alpha === undefined ? 0.5 : opts.alpha;
    var col = opts.color || '255,255,255';

    var proj = [], i;
    for (i = 0; i < pts.length; i++) {
      var sp = cam.project(pts[i].p);
      if (!sp) { proj.push(null); continue; }
      var age = (now - pts[i].t) / life;
      if (age < 0) age = 0;
      if (age > 1) { proj.push(null); continue; }
      /* Width grows with age (it is spreading) and with distance in the
       * usual projected way; the wobble is the puff. */
      var wob = 0.75 + 0.5 * Math.abs(Math.sin(i * 2.399963));
      var w = (w0 + spread * age) * wob * (sp.scale ? Math.min(6, Math.max(0.35, sp.scale)) : 1);
      proj.push({ x: sp.x, y: sp.y, w: w, a: (1 - age) * (1 - age) * alpha });
    }

    /* One quad per segment, rather than one polygon for the whole ribbon:
     * a trail can pass behind the camera in the middle and come back, and a
     * single polygon across that gap paints a triangle across the sky. */
    ctx.save();
    for (i = 1; i < proj.length; i++) {
      var a = proj[i - 1], b = proj[i];
      if (!a || !b) continue;
      var dx = b.x - a.x, dy = b.y - a.y;
      var L = Math.sqrt(dx * dx + dy * dy);
      if (!(L > 0.01) || L > 4000) continue;
      var nx = -dy / L, ny = dx / L;
      ctx.fillStyle = 'rgba(' + col + ',' + ((a.a + b.a) * 0.5).toFixed(3) + ')';
      ctx.beginPath();
      ctx.moveTo(a.x + nx * a.w, a.y + ny * a.w);
      ctx.lineTo(b.x + nx * b.w, b.y + ny * b.w);
      ctx.lineTo(b.x - nx * b.w, b.y - ny * b.w);
      ctx.lineTo(a.x - nx * a.w, a.y - ny * a.w);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  /* ---- FACTION ACCENTS ON A STATION --------------------------------------
   *
   * Astra: "the Syndicate stations should have red accents on them, like the
   * syndicate ships do." Generalised to every power rather than special-
   * cased to the Syndicate, because the same question is about to be asked
   * of the chart: if a border is drawn in a faction's colour, the docks
   * inside it should be wearing it too.
   *
   * WHAT GETS REPAINTED IS FOUND BY COLOUR, NOT BY NAME. Every station in
   * the library — imported and procedural — trims itself in the same two
   * golds (#d7be3d and #d5c14b, 51 faces of the shipped models between
   * them), and a rule that listed those two hexes would be wrong the day a
   * modeller picks a third. So a face is trim if it is gold-ish: hue in the
   * amber band, saturated enough to be a decision rather than a dirty
   * grey, and dark enough not to be a light source.
   *
   * THAT LAST CLAUSE IS LOAD-BEARING. #f2e3a7 is the cream the bay floors
   * are floodlit with — same hue family, 24 faces, and repainting it would
   * turn the inside of every Syndicate hangar red. Lightness is what tells
   * a painted stripe from a lit surface, so the cut is on lightness.
   *
   * The swap keeps the face's own LIGHTNESS and takes the faction's hue and
   * saturation, so a trim that was shaded dark stays dark and the model
   * keeps whatever depth the modeller painted into it. Emissive faces keep
   * their '!' — a lit sign in faction colours is still a lit sign — and
   * glass is left alone entirely, because a red window is a different
   * decision from a red stripe and nobody asked for one. */
  var ACCENT_HUE_LO = 35, ACCENT_HUE_HI = 62;
  var ACCENT_MIN_SAT = 0.45;
  var ACCENT_MAX_LIGHT = 0.62;

  var accentColor = null;
  var ACCENT_CACHE = (typeof Map === 'function') ? new Map() : null;

  /* Set around one station's meshes and cleared after — exactly the shape
   * setIndoors has, and for exactly the same reason: every paint path a
   * station goes through would otherwise have to carry the argument, and
   * the one that forgot would be a dock in the wrong colours. */
  /* ---- AND THE SYNDICATE GETS A REPAINT, NOT A TINT ----------------------
   * Astra: "create a copy of each station type and add red and black trim
   * to it... these will be Syndicate controlled ports. It will be very easy
   * to tell if it's Syndicate."
   *
   * The accent wash above was generalised deliberately — every power's dock
   * wears that power's colour — and it is the right rule for the twelve
   * legitimate flags, where the point is that a dock belongs to somebody.
   * It is the wrong rule for the Syndicate, where the point is that you
   * KNOW. A hue rotation at the modeller's own tenth-saturation reads as
   * "faintly warm plating" from a kilometre out, which is exactly what
   * Astra is saying it must not be.
   *
   * So the outlaw skin is a second mapping rather than a stronger
   * coefficient, and the two halves pull opposite ways, which is what makes
   * it legible: the PLATING IS CRUSHED TO BLACK — the modeller's three
   * tones keep their order and their relative depth, but the whole range is
   * compressed into the bottom fifth, so the hull stops being a light
   * surface at all. And the TRIM IS TURNED UP — full saturation, held in
   * the band where red reads as red rather than as maroon or pink. Black
   * hull, red stripes, and nothing else in the game looks like it.
   *
   * It is a repaint and not a new model, and that is the honest version of
   * "a copy of each station type": the geometry of a Syndicate dock is the
   * same geometry, because the Syndicate took the dock rather than building
   * one. What changed is who painted it. */
  var OUTLAW_PLATE_LIGHT = 0.18;     // of the modeller's own lightness
  var OUTLAW_PLATE_FLOOR = 0.055;
  var OUTLAW_PLATE_SAT = 0.22;
  var OUTLAW_TRIM_SAT = 0.85;
  var OUTLAW_TRIM_LO = 0.34, OUTLAW_TRIM_HI = 0.56;

  /* ---- AND THE FLEET GETS ONE TOO ---------------------------------------
   * Astra, of the Syndicate livery: "add the Navy and Syndicate to each."
   *
   * Three liveries rather than two, and the third is the one that makes the
   * other two legible. A galaxy where Syndicate docks are unmistakable and
   * everything else is the same wash has only told you about one kind of
   * place; with a fleet livery as well, a dock on approach is one of three
   * obviously different objects before you can read a word on it.
   *
   * IT IS THE SYNDICATE'S SKIN PHOTOGRAPHED IN NEGATIVE, and deliberately.
   * The Syndicate crushes its plating to black and turns its trim all the
   * way UP: bright on dark, paint that shouts off a hull that has gone
   * quiet. The fleet does the exact opposite — it bleaches its plating
   * toward white and drives its trim DOWN into a deep, saturated band, so
   * the livery reads as dark on pale. Same two levers, opposite directions,
   * and the result is that the two powers cannot be confused at any
   * distance or in any light, which is the whole requirement.
   *
   * The trim still takes the OWNER's hue rather than a fixed navy blue.
   * Twelve powers each have a fleet, and "whose dock is this" is a question
   * the chart already answers in colour — the livery says a warship keeps
   * this place, and the hue says whose warship. */
  var FLEET_PLATE_LIGHT = 0.30;      // of the modeller's own lightness
  var FLEET_PLATE_FLOOR = 0.60;
  var FLEET_PLATE_SAT = 0.10;
  var FLEET_TRIM_SAT = 0.72;
  var FLEET_TRIM_LO = 0.16, FLEET_TRIM_HI = 0.32;

  var accentSkin = null;             // null | 'outlaw' | 'fleet'

  function setAccent(c, skin) {
    accentColor = (typeof c === 'string' && c.charAt(0) === '#' && c.length === 7)
      ? c.toLowerCase() : null;
    /* `true` still means the Syndicate. The second argument was a boolean
     * for exactly one release and callers outside this file said what they
     * meant rather than which skin, so both spellings are honoured rather
     * than leaving a caller silently painting the wrong flag. */
    var want = (skin === true) ? 'outlaw' : skin;
    accentSkin = (accentColor && (want === 'outlaw' || want === 'fleet')) ? want : null;
  }

  /* The cache is keyed on the SKIN, not on the colour, or a Syndicate dock,
   * a fleet carrier and an ordinary dock of the same power would share a
   * mesh. */
  function accentKey() {
    return accentSkin ? accentColor + '#' + accentSkin : accentColor;
  }

  function rgbOf(hex) {
    var n = parseInt(hex.slice(1), 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }

  function toHsl(hex) {
    var c = rgbOf(hex), r = c[0], g = c[1], b = c[2];
    var mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    var l = (mx + mn) / 2, h = 0, sat = 0;
    if (d > 1e-9) {
      sat = d / (1 - Math.abs(2 * l - 1));
      if (mx === r) h = 60 * (((g - b) / d) % 6);
      else if (mx === g) h = 60 * ((b - r) / d + 2);
      else h = 60 * ((r - g) / d + 4);
      if (h < 0) h += 360;
    }
    return [h, sat, l];
  }

  function fromHsl(h, sat, l) {
    var c = (1 - Math.abs(2 * l - 1)) * sat;
    var x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    var m = l - c / 2, r = 0, g = 0, b = 0;
    if (h < 60) { r = c; g = x; }
    else if (h < 120) { r = x; g = c; }
    else if (h < 180) { g = c; b = x; }
    else if (h < 240) { g = x; b = c; }
    else if (h < 300) { r = x; b = c; }
    else { r = c; b = x; }
    function hx(v) {
      var n = Math.max(0, Math.min(255, Math.round((v + m) * 255))).toString(16);
      return n.length < 2 ? '0' + n : n;
    }
    return '#' + hx(r) + hx(g) + hx(b);
  }

  /* AND A WASH OVER THE PLATING, because the trim alone does not read.
   *
   * Measured on spine-s before deciding: the two golds are 0.71% of the
   * exterior area. Swapping them is correct and nearly invisible from a
   * kilometre out, which fails the thing Astra actually asked for — being
   * able to tell whose dock you are approaching.
   *
   * The plating is 95% of it and it is not grey, it is a cool blue-grey:
   * #8993a1, #5d6673 and #3c434e all sit around hue 215 at about a tenth
   * saturation. So the art ALREADY has a livery hue; it is simply the same
   * one everywhere. Turning that hue to the owner's and leaving the
   * saturation where the modeller put it repaints the station in the
   * faction's colour without repainting the modelling — the shading, the
   * panel breaks and the contrast between the three tones all survive,
   * because none of them was ever about hue.
   *
   * Bounded hard on both ends: a near-black is left alone (it is a shadow
   * gap, and hue is meaningless down there) and anything already saturated
   * is left alone (that is paint, and paint is the trim rule's business). */
  var WASH_MAX_SAT = 0.22;
  var WASH_MIN_LIGHT = 0.12, WASH_MAX_LIGHT = 0.80;
  var WASH_FLOOR_SAT = 0.20;

  /* Is this face colour the trim, and what does it become? Returns null for
   * everything it does not touch, which is almost everything. */
  function accentSwap(col, to, skin) {
    if (typeof col !== 'string' || !col) return null;
    var pre = '';
    if (col.charAt(0) === '!') { pre = '!'; col = col.slice(1); }
    if (col.charAt(0) !== '#' || col.length !== 7) return null;   // glass, names
    var hsl = toHsl(col);
    if (skin === true) skin = 'outlaw';

    if (skin === 'fleet') {
      var wantF = toHsl(to);
      if (hsl[1] <= WASH_MAX_SAT && hsl[2] >= WASH_MIN_LIGHT && hsl[2] <= WASH_MAX_LIGHT) {
        /* Plating bleached toward white, with the modeller's three tones
         * keeping their order — the same linear compression the Syndicate
         * skin uses, run up instead of down. A fleet hull is painted to be
         * SEEN, which is the opposite of what a Syndicate hull is for.
         *
         * Emissive plating is left alone here too: the floodlit deck is
         * emissive plating, and bleaching it would blow the inside of every
         * naval hangar out to a white sheet. */
        if (pre === '!') return null;
        return fromHsl(wantF[0], FLEET_PLATE_SAT,
                       FLEET_PLATE_FLOOR + hsl[2] * FLEET_PLATE_LIGHT);
      }
      if (hsl[0] < ACCENT_HUE_LO || hsl[0] > ACCENT_HUE_HI) return null;
      if (hsl[1] < ACCENT_MIN_SAT || hsl[2] > ACCENT_MAX_LIGHT) return null;
      /* Trim driven DOWN into a deep saturated band, so it reads as dark on
       * pale. Held inside the band for the mirror of the Syndicate's
       * reason: a stripe the modeller painted bright would otherwise come
       * out pale on a pale hull and vanish. */
      return pre + fromHsl(wantF[0], Math.max(hsl[1], FLEET_TRIM_SAT),
                           Math.max(FLEET_TRIM_LO, Math.min(FLEET_TRIM_HI, hsl[2])));
    }

    if (skin === 'outlaw') {
      var want0 = toHsl(to);
      if (hsl[1] <= WASH_MAX_SAT && hsl[2] >= WASH_MIN_LIGHT && hsl[2] <= WASH_MAX_LIGHT) {
        /* Plating to black. The order of the modeller's tones survives
         * because the compression is linear in their own lightness — the
         * panel breaks are still there, they are simply all dark now.
         *
         * EMISSIVE PLATING IS LEFT ALONE, and that clause is doing real
         * work: the bay's floodlit deck is emissive plating, and crushing
         * it would turn a lit hangar into an unlit one. The Syndicate
         * paints its hull, not its lamps. */
        if (pre === '!') return null;
        return fromHsl(want0[0], OUTLAW_PLATE_SAT,
                       OUTLAW_PLATE_FLOOR + hsl[2] * OUTLAW_PLATE_LIGHT);
      }
      if (hsl[0] < ACCENT_HUE_LO || hsl[0] > ACCENT_HUE_HI) return null;
      if (hsl[1] < ACCENT_MIN_SAT || hsl[2] > ACCENT_MAX_LIGHT) return null;
      /* Trim turned all the way up, and held inside the band where red
       * still reads as red — a stripe the modeller shaded very dark would
       * otherwise come out maroon against a black hull and disappear,
       * which is the one outcome this whole skin exists to prevent. */
      return pre + fromHsl(want0[0], Math.max(hsl[1], OUTLAW_TRIM_SAT),
                           Math.max(OUTLAW_TRIM_LO, Math.min(OUTLAW_TRIM_HI, hsl[2])));
    }
    if (hsl[1] <= WASH_MAX_SAT && hsl[2] >= WASH_MIN_LIGHT && hsl[2] <= WASH_MAX_LIGHT) {
      /* Plating. Emissive plating stays emissive — a lit panel is a lamp,
       * and this is a paint job. */
      return pre + fromHsl(toHsl(to)[0], Math.max(hsl[1], WASH_FLOOR_SAT), hsl[2]);
    }
    /* ---- AND THE ORDINARY WASH LEAVES THE GOLD ALONE ----------------------
     * Astra, twice, with a screenshot the second time: "yellow caution
     * stripes are still coming through as purple."
     *
     * The first fix exempted the STAND — deck furniture this file builds —
     * and it was not enough, because the hazard striping she is looking at
     * is the ART'S OWN. Measured: cradle-l carries 1,716 faces of #d7be3d
     * and 468 of #d5c14b, and the same two golds are BOTH the hazard
     * markings and the trim. There is no colour rule that separates them,
     * because they are one colour used for two jobs.
     *
     * So the question stops being which faces and becomes which JOB the
     * ordinary wash is doing. Its job is "whose dock is this", and the
     * plating already answers that: it is ninety-five per cent of what you
     * can see and the wash turns all of it. The trim swap was measured at
     * 0.71% of exterior area when it landed — it was never carrying the
     * recognition, and the price of it is the one colour in a bay that is
     * supposed to mean HAZARD rather than FLAG.
     *
     * The two SKINS still repaint it, and that is not an inconsistency. A
     * Syndicate dock and a fleet carrier have to be identifiable at a
     * kilometre against eleven other powers, which is a different and much
     * harder job than "this one is Mirul's"; they need every face they can
     * get, and red-on-black is what Astra asked for by name. An ordinary
     * power does not need it and was paying for it in yellow. */
    if (!skin) return null;
    if (hsl[0] < ACCENT_HUE_LO || hsl[0] > ACCENT_HUE_HI) return null;
    if (hsl[1] < ACCENT_MIN_SAT || hsl[2] > ACCENT_MAX_LIGHT) return null;
    /* HUE FROM THE FACTION, SATURATION AND LIGHTNESS FROM THE FACE. The
     * first version took the faction's saturation too and came out as
     * pillarbox red on a hull the modeller had painted in muted gold — a
     * stripe that looked like a bug rather than like livery. Rotating the
     * hue alone keeps whatever restraint the art had and still reads as
     * unmistakably that power's colour. */
    var want = toHsl(to);
    return pre + fromHsl(want[0], hsl[1], hsl[2]);
  }

  /* An accented COPY of a mesh, sharing its vertices. Cached per mesh per
   * colour: the station meshes are themselves cached per role and the door
   * leaves per model, so the number of copies is bounded by roles times
   * powers rather than by anything that grows with play. Sharing `v` is
   * what makes that cheap — only the colour array is new.
   *
   * A mesh with no trim in it is memoised as itself, so a station whose art
   * has no gold in it costs one scan ever and then nothing. */
  function accented(mesh) {
    if (!accentColor || !mesh || !mesh.c || !ACCENT_CACHE) return mesh;
    /* SOME GEOMETRY IS NOT LIVERY.
     *
     * Astra, parked in a bay: "the screencaps you show me have yellow
     * caution stripes on the floor: all I'm seeing is purple stuff."
     * Measured against a violet power, every colour on the stand swaps —
     * the deck plate, the kerbs, the clamps, and the hazard gold at
     * #c9b44a straight to #824ac9. The stand came out the same hue as the
     * room it stands in, which is precisely the thing it exists not to be.
     *
     * The accent rule is right about the STATION: trim and plating in the
     * owner's colours is how you tell whose dock you are closing on from a
     * kilometre out. It is wrong about DECK FURNITURE, and the distinction
     * is the one this file already draws elsewhere — the stand is the only
     * geometry in a bay whose size is measured in metres off the hull
     * rather than in station radii. It is a ruler, not a flag. Hazard
     * markings are yellow in every navy for the same reason, and a bay
     * whose one high-contrast edge has been repainted to match the wall
     * behind it is the grey box room again, in colour.
     *
     * So the opt-out is per MESH rather than per colour, because no colour
     * rule can separate the stand's gold from the hull's: they are the
     * same gold on purpose. What differs is what the object IS. */
    if (mesh.noAccent) return mesh;
    var byColor = ACCENT_CACHE.get(mesh);
    if (!byColor) { byColor = {}; ACCENT_CACHE.set(mesh, byColor); }
    var hit = byColor[accentKey()];
    if (hit) return hit;

    var c = new Array(mesh.c.length), touched = 0;
    for (var i = 0; i < mesh.c.length; i++) {
      var swap = accentSwap(mesh.c[i], accentColor, accentSkin);
      if (swap) { c[i] = swap; touched++; } else c[i] = mesh.c[i];
    }
    if (!touched) { byColor[accentKey()] = mesh; return mesh; }

    var out = { v: mesh.v, f: mesh.f, c: c };
    /* Anything else the mesh carries is geometry, and geometry is shared —
     * copy the fields the rest of the file reads off a station mesh rather
     * than dropping them and making the accented copy subtly less useful
     * than the original. */
    if (mesh.padHalfA !== undefined) out.padHalfA = mesh.padHalfA;
    if (mesh.padHalfB !== undefined) out.padHalfB = mesh.padHalfB;
    if (mesh.padLift !== undefined) out.padLift = mesh.padLift;
    if (mesh.deckZ !== undefined) out.deckZ = mesh.deckZ;
    if (mesh.adBoards !== undefined) out.adBoards = mesh.adBoards;
    if (mesh.adFrame !== undefined) out.adFrame = mesh.adFrame;
    byColor[accentKey()] = out;
    return out;
  }

  /* ---- A SHIPYARD'S PAINT (2026-10-19) -----------------------------------
   * The colours chosen on a shipyard's order sheet (Combat.PAINTS): a hull
   * colour and a trim. The models carry their own per-face colours, so a
   * paint job is a remap rather than a flat fill — every face keeps its own
   * brightness, the darker plates take the hull colour and the light ones
   * the trim, and the self-lit faces (windows, nav lamps) are never painted
   * over. The same rule as FRAG_MESH's uPaint, so a hull looks like itself
   * whichever renderer draws it. Set around one draw by the caller and
   * cleared after; null is yard grey. */
  var PAINT_NOW = null;
  var PAINT_SPLIT = 0.62, PAINT_MIX = 0.72;
  function hexRGB(hex) {
    if (typeof hex !== 'string' || hex.charAt(0) !== '#' || hex.length !== 7) return null;
    var n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function paintRGB(paint) {
    if (!paint) return null;
    var p = hexRGB(paint.p), t = hexRGB(paint.t);
    if (!p && !t) return null;
    return { p: p, t: t };
  }
  function paintFace(base) {
    var b = hexRGB(base) || [190, 205, 225];
    var l = (0.299 * b[0] + 0.587 * b[1] + 0.114 * b[2]) / 255;
    var c = l > PAINT_SPLIT ? (PAINT_NOW.t || PAINT_NOW.p) : (PAINT_NOW.p || PAINT_NOW.t);
    if (!c) return base;
    var k = 0.55 + 0.9 * l, out = [];
    for (var i = 0; i < 3; i++) {
      var target = Math.min(255, c[i] * k);
      out.push(Math.round(b[i] + (target - b[i]) * PAINT_MIX));
    }
    return '#' + ((1 << 24) | (out[0] << 16) | (out[1] << 8) | out[2]).toString(16).slice(1);
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
    var p = role === 'door' ? t / 0.45 : (t - 0.5) / 0.5;
    return Math.max(0, Math.min(1, p));
  }

  /* FOLD, THEN LIFT (Astra, 2026-10-21). A leg is two parts now: the upper
   * `strut` hangs from the hinge and the lower `shin` hangs from the knee.
   * Going up, the shin folds back alongside the strut over the first half
   * of the leg's travel, and then the folded pair pulls straight up into
   * the hull by `lift` over the second half — after which the door, whose
   * slice of the travel begins only once the leg is home, closes behind
   * it. Coming down is the same thing read backwards. Each half eases in
   * and out, so a leg pauses for a beat at the fold rather than snapping.
   * A part with no `lift` (an older converted hull) turns by `stow` over
   * the leg's whole travel, as every leg used to.
   *
   * A leg with no room to pull up inside (the runner's wing legs, under a
   * wing too thin to hold them) carries `swing` and `hinge` instead: its
   * second half swings the folded pair flat about the hinge. Both turns are
   * about the same axis, so the part's frame simply turns by the sum, and
   * its pivot is carried round the hinge by the swing.
   *
   * Returned: `ang` the part's total turn, `piv` where its pivot is now. */
  function ease(x) { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); }
  function gearPose(p, travel) {
    if (p.role === 'door') return { ang: p.stow * (1 - gearPhase('door', travel)), piv: p.pivot };
    var u = 1 - gearPhase(p.role, travel);
    if (!p.lift) return { ang: p.stow * u, piv: p.pivot };
    var second = ease((u - 0.5) / 0.5), ang = p.stow * ease(u / 0.5), piv = p.pivot;
    if (p.swing && p.hinge) {
      var sw = p.swing * second, h = p.hinge;
      var r = rotVec([piv[0] - h[0], piv[1] - h[1], piv[2] - h[2]], p.axis, sw);
      return { ang: ang + sw, piv: [h[0] + r[0], h[1] + r[1], h[2] + r[2]] };
    }
    var l = p.lift;
    return { ang: ang, piv: [piv[0] + l[0] * second, piv[1] + l[1] * second, piv[2] + l[2] * second] };
  }
  function rotVec(v, k, a) {
    var c = Math.cos(a), s = Math.sin(a), d = k[0] * v[0] + k[1] * v[1] + k[2] * v[2];
    return [v[0] * c + (k[1] * v[2] - k[2] * v[1]) * s + k[0] * d * (1 - c),
            v[1] * c + (k[2] * v[0] - k[0] * v[2]) * s + k[1] * d * (1 - c),
            v[2] * c + (k[0] * v[1] - k[1] * v[0]) * s + k[2] * d * (1 - c)];
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

  /* TUCKED BEHIND ITS DOORS (2026-10-29). Astra, flying a Talon: "there's
   * something wrong with the landing gear doors". Measured across every
   * rigged hull: the doors close flush with the skin (within a centimetre
   * or two), but the converter's strut `stow` angle leaves every leg 0.2 to
   * 0.6 m short of folding away — on the Talon the main legs hang 0.30 m
   * below the belly with the gear up, straight through their own shut
   * doors, which is the striped lump you see on her underside in flight.
   *
   * So the stow angle is corrected here, once per mesh, from the hull
   * itself: the skin over the bay is the lowest hull face over the leg's
   * footprint (deployed or stowed), and the leg turns further the SAME way
   * until it is above that, or — if no angle that way clears it — the
   * least it can be turned the other way round that does. Doors are left
   * as the converter measured them; they already close flush. Measured,
   * not tuned: the result depends only on the model. */
  var TUCK_EPS = 0.0004;                 // model units (~1 cm on a 25 m hull)
  function partLowest(p, ang) {
    var a = p.axis, k = { x: a[0], y: a[1], z: a[2] };
    var kl = Math.hypot(k.x, k.y, k.z) || 1; k.x /= kl; k.y /= kl; k.z /= kl;
    var c = Math.cos(ang), s = Math.sin(ang), kd = 1 - c;
    var Rv = rotAxis(HULL_R, k, c, s, kd), Uv = rotAxis(HULL_U, k, c, s, kd), Fv = rotAxis(HULL_F, k, c, s, kd);
    var lo = Infinity, x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (var v = 0; v < p.mesh.v.length; v++) {
      var q = p.mesh.v[v];
      var wx = p.pivot[0] + Rv.x * q[0] + Uv.x * q[1] + Fv.x * q[2];
      var wy = p.pivot[1] + Rv.y * q[0] + Uv.y * q[1] + Fv.y * q[2];
      var wz = p.pivot[2] + Rv.z * q[0] + Uv.z * q[1] + Fv.z * q[2];
      if (wy < lo) lo = wy;
      if (wx < x0) x0 = wx; if (wx > x1) x1 = wx; if (wz < z0) z0 = wz; if (wz > z1) z1 = wz;
    }
    return { lo: lo, x0: x0, x1: x1, z0: z0, z1: z1 };
  }
  function tuckGear(mesh) {
    if (!mesh || !mesh.gear || mesh._tucked) return;
    mesh._tucked = true;
    for (var i = 0; i < mesh.gear.length; i++) {
      var p = mesh.gear[i];
      if (p.role !== 'strut' || !p.mesh || !p.mesh.v || !(Math.abs(p.stow) > 0.2)) continue;
      /* How far the leg hangs below the skin at angle `ang`: the skin is
       * taken over the ground the leg covers deployed AND at that angle,
       * since a leg that swings forward folds under a different bit of
       * belly. Positive means it hangs out. */
      var d0 = partLowest(p, 0);
      var hang = function (ang) {
        var s = partLowest(p, ang);
        var bx0 = Math.min(d0.x0, s.x0), bx1 = Math.max(d0.x1, s.x1);
        var bz0 = Math.min(d0.z0, s.z0), bz1 = Math.max(d0.z1, s.z1);
        var skin = Infinity;
        for (var f = 0; f < mesh.f.length; f++) {
          var face = mesh.f[f], cx = 0, cy = 0, cz = 0;
          for (var j = 0; j < face.length; j++) { var vv = mesh.v[face[j]]; cx += vv[0]; cy += vv[1]; cz += vv[2]; }
          cx /= face.length; cy /= face.length; cz /= face.length;
          if (cx >= bx0 && cx <= bx1 && cz >= bz0 && cz <= bz1 && cy < skin) skin = cy;
        }
        return isFinite(skin) ? skin - s.lo : -Infinity;
      };
      if (hang(p.stow) <= TUCK_EPS) continue;
      /* The same way round first, then the other; failing both, whichever
       * angle leaves the least of it showing. */
      var sign = p.stow < 0 ? -1 : 1, step = Math.PI / 180, found = null, best = p.stow, bestH = hang(p.stow), a, h;
      for (a = Math.abs(p.stow); a <= Math.PI + 1e-9 && found === null; a += step) {
        h = hang(sign * a); if (h <= TUCK_EPS) found = sign * a; else if (h < bestH) { bestH = h; best = sign * a; }
      }
      for (a = step; a <= Math.PI + 1e-9 && found === null; a += step) {
        h = hang(-sign * a); if (h <= TUCK_EPS) found = -sign * a; else if (h < bestH) { bestH = h; best = -sign * a; }
      }
      p.stowMeasured = p.stow; p.stow = found !== null ? found : best;
    }
  }

  /* THE LEGS REACH THE LIFTED GROUND (2026-11-03). hullFit stands a geared
   * hull GEAR_LIFT higher than her legs as modelled; drawn as modelled,
   * they would stop half a metre short of the floor she is standing on. So
   * each leg telescopes the difference over the last half of its travel,
   * as an oleo strut does: an upper `strut` is stretched along her up axis
   * about its own hinge until its foot is `ext` lower, and a lower `shin`
   * is carried down the same `ext`, so the knee stays a knee. `extU` is
   * the reach in model units (her length is one): hullFit's `gearExt`,
   * which is the lift plus whatever the modelled feet were already off
   * the table's ground. Returned: how much to stretch (k - 1, along up,
   * about the pivot) and how far to drop. */
  function gearExtend(p, travel, extU) {
    if (!extU || p.role === 'door') return null;
    var e = extU * gearPhase(p.role, travel);
    if (!e) return null;
    if (p.role === 'shin') return { stretch: 0, drop: e };
    if (p._hang === undefined) {
      var lo = partLowest(p, 0).lo;
      p._hang = isFinite(lo) ? p.pivot[1] - lo : 0;
    }
    return p._hang > Math.abs(e) + 1e-6 ? { stretch: e / p._hang, drop: 0 } : { stretch: 0, drop: e };
  }
  /* One basis vector stretched by `k1` (k - 1) along `U`. */
  function stretchAlong(v, U, k1) {
    var d = (v.x * U.x + v.y * U.y + v.z * U.z) * k1;
    return { x: v.x + U.x * d, y: v.y + U.y * d, z: v.z + U.z * d };
  }
  function gearLiftU(frame, lengthKm) {
    var f = frame && frame.hullId ? hullFit(frame) : null;
    return f && f.gearExt && lengthKm > 0 ? f.gearExt / (lengthKm * 1000) : 0;
  }
  function drawHullGear(ctx, cam, frame, mesh, lengthKm, sunDir, tint, travel) {
    var parts = mesh && mesh.gear;
    if (!parts || !parts.length) return;
    tuckGear(mesh);
    var R = frame.right, U = frame.up, F = frame.fwd, extU = gearLiftU(frame, lengthKm);

    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      var pose = gearPose(p, travel), ang = pose.ang, q = pose.piv;

      /* Pivot and axis are given in the hull's own axes, so both are
       * resolved against the ship's CURRENT attitude every frame rather
       * than stored as world points — the same rule the muzzles follow, and
       * for the same reason: at 5 km/s a frozen world point detaches
       * visibly within one frame. */
      var a = p.axis;
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
      var ex = gearExtend(p, travel, extU);
      if (ex) {
        if (ex.stretch) {
          gearFrame.right = stretchAlong(gearFrame.right, U, ex.stretch);
          gearFrame.up = stretchAlong(gearFrame.up, U, ex.stretch);
          gearFrame.fwd = stretchAlong(gearFrame.fwd, U, ex.stretch);
        }
        if (ex.drop) gearFrame.pos = V.addScaled(gearFrame.pos, U, -ex.drop * lengthKm);
      }

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

  /* `extU` (optional, model units): the legs telescoped as drawHullGear
   * draws them for a lifted hull (gearExtend). Without it, the legs as
   * modelled - what tools/fit-hulls.js measures `ground` from. */
  function gearBounds(mesh, travel, extU) {
    var parts = mesh && mesh.gear;
    if (!parts || !parts.length) return null;
    tuckGear(mesh);
    var lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    var pts = gearPoints(mesh, travel, extU);
    for (var j = 0; j < pts.length; j++) {
      for (var b = 0; b < 3; b++) {
        if (pts[j][b] < lo[b]) lo[b] = pts[j][b];
        if (pts[j][b] > hi[b]) hi[b] = pts[j][b];
      }
    }
    return { lo: lo, hi: hi };
  }
  /* Every part's mesh posed as it is drawn, in her model frame: one
   * { v, f } per part. What gearBounds measures and what the walker's
   * clearance under her (outsidePlan) rasterises - her legs are solid. */
  function gearPoints(mesh, travel, extU) {
    var out = [];
    gearMeshes(mesh, travel, extU).forEach(function (m) { for (var i = 0; i < m.v.length; i++) out.push(m.v[i]); });
    return out;
  }
  function gearMeshes(mesh, travel, extU) {
    var parts = mesh && mesh.gear, out = [];
    if (!parts || !parts.length) return out;
    tuckGear(mesh);
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      var pose = gearPose(p, travel), ang = pose.ang, piv = pose.piv;
      var a = p.axis;
      var k = { x: a[0], y: a[1], z: a[2] };
      var c = Math.cos(ang), s = Math.sin(ang), kd = 1 - c;
      var R = rotAxis(HULL_R, k, c, s, kd);
      var U = rotAxis(HULL_U, k, c, s, kd);
      var F = rotAxis(HULL_F, k, c, s, kd);
      var ex = gearExtend(p, travel, extU), st = ex ? ex.stretch : 0, dr = ex ? ex.drop : 0;
      var vs = [];
      for (var v = 0; v < p.mesh.v.length; v++) {
        var q = p.mesh.v[v];
        var w = [piv[0] + R.x * q[0] + U.x * q[1] + F.x * q[2],
                 piv[1] + R.y * q[0] + U.y * q[1] + F.y * q[2],
                 piv[2] + R.z * q[0] + U.z * q[1] + F.z * q[2]];
        if (st) w[1] = piv[1] + (w[1] - piv[1]) * (1 + st);
        w[1] -= dr;
        vs.push(w);
      }
      out.push({ v: vs, f: p.mesh.f || [] });
    }
    return out;
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
    /* Almost every ship wears its class's hull, which `shipMeshes()` has
     * memoised once. A ship carrying its OWN size letter is the exception
     * and gets looked up directly — `frame` is the live state, which
     * `decorate` copies the spec's fields onto, so a capital's tender
     * arrives here already knowing which hull it should be wearing.
     *
     * Deliberately not routed through SHIP_MESHES: that cache is keyed by
     * class, and writing a per-ship hull into it would make whichever
     * tender drew first decide what every other tender looks like. */
    var mesh = null;
    var letter = (frame && frame.sizeLetter) || (ship && ship.sizeLetter);
    if (letter) {
      var swapped = hullIdForSpec({ cls: kind, sizeLetter: letter });
      if (swapped) mesh = libHull(swapped);
    }
    mesh = mesh || shipMeshes()[kind] || shipMeshes().courier;
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
  function drawShipModel(ctx, cam, ship, sunDir, tint, opts) {
    /* ---- YOU FLY THE SHIP YOU BOUGHT --------------------------------------
     * Astra: "make it so that in flight your ship is the one you are
     * flying, and that it loads THAT model instead of the courier."
     *
     * It drew the courier hull whatever was in the hangar, which was
     * defensible while the yard sold four rows of numbers and became
     * indefensible the moment the showroom started turning a Mule in front
     * of you: the one place your ship looked like your ship was the place
     * you were deciding whether to buy it.
     *
     * The mapping already existed and was being used by the showroom —
     * every hull names a mesh KIND and HULL_ASSIGN turns a kind into a
     * library model — so this is one lookup rather than a new table, and
     * hullPreviewMesh falls back to the procedural courier for anything
     * the library does not carry. The library hulls are normalised to unit
     * length exactly as the procedural one is, so SHIP_LEN still scales
     * them and nothing about the size of you on screen changes except
     * which silhouette it is. */
    /* The ship passed along so a Crawler draws what is in her cubes. */
    var mesh = hullPreviewMesh((ship && ship.hullId) || 'talon', ship);
    /* Her shipyard paint, if she has any — see PAINT_NOW. A crash tint
     * (the caller's red) wins over paint: that is a warning, not a look. */
    var pr = tint ? null : paintRGB(ship && ship.paint);
    var L = hullLength(ship);
    /* From your own conning tower (shipdeck.js, 2026-10-25) the gallery or
     * cab you are standing in is left out, or its walls would be all you
     * saw. */
    if (opts && opts.fromBridge) mesh = bridgeCutMesh(mesh, ship);
    /* HER WINDOWS, FROM OUTSIDE (2026-10-31). Astra: see-through windows
     * on other ships. The skin over her cockpit is taken off (her tower's
     * cut box on a towered hull, the cockpit's own box on the rest), and her
     * rooms are drawn where they are inside her, with her glass over them
     * as glass — so what you see through her canopy is her cockpit, and up
     * an open ramp her airlock, in the place they are walked. */
    var win = (opts && opts.windows && !opts.fromBridge && gpuWorld() && ship && ship.hullId) ? shipInterior(ship) : null;
    var well = null;
    if (win) {
      if (bridgeSpec(ship)) mesh = bridgeCutMesh(mesh, ship);
      else if ((well = windowWell(mesh, ship, win))) mesh = well.opaque;
    }
    /* HER RAMP (2026-10-26): the bay it lies in is cut through her belly,
     * and the ramp, its bay's walls and the airlock over it are drawn in
     * her frame at however far down it is. Only your own ship carries an
     * airlock state, so nobody else's belly is opened. */
    var ramp = (ship && ship.airlock && ship.hullId && !(opts && opts.fromBridge)) ? rampExterior(ship, mesh, L) : null;
    if (ramp) {
      mesh = ramp.hull;
      /* With her rooms drawn in place (windows), the airlock box the bay
       * carries is the room's own airlock a second time: left out, or the
       * two fight for the same pixels as the double ramp did. */
      var parts = win ? [ramp.ramp] : [ramp.bay, ramp.ramp];
      for (var rpi = 0; rpi < parts.length; rpi++) {
        if (!parts[rpi] || !parts[rpi].f.length) continue;
        if (!(gpuWorld() && global.GLWorld.queueMesh(cam, ship, parts[rpi], L, sunDir, 0, null))) {
          paintMesh(ctx, cam, ship, parts[rpi], L, sunDir, tint);
        }
      }
    }
    /* One cut box per mesh: her canopy well when looking in at her
     * windows, otherwise her airlock (rampExterior's lockBox) when her
     * ramp is out - the one you can look up into. */
    var cutBox = well ? wellBox(ship, well) : (ramp && ramp.lockBox && gpuWorld()) ? wellBox(ship, { well: ramp.lockBox }) : null;
    if (cutBox) global.GLWorld.setCutaway({ box: cutBox });
    if (!(gpuWorld() && global.GLWorld.queueMesh(cam, ship, mesh, L, sunDir,
                                                 ship.reentryGlow || 0, ship.windDir,
                                                 undefined, pr))) {
      PAINT_NOW = pr;
      try { paintMesh(ctx, cam, ship, mesh, L, sunDir, tint); }
      finally { PAINT_NOW = null; }
    }
    if (cutBox) global.GLWorld.setCutaway(CUT_NOW);
    if (well) {
      if (well.glass.f.length) global.GLWorld.queueMesh(cam, ship, well.glass, L, sunDir, 0, null, HULL_GLASS_ALPHA);
    }
    /* The legs go on the plain queueMesh path rather than the plasma one.
     * They are the coldest thing on the ship — the last part to see air on
     * the way down and the first thing a pad touches — and giving them the
     * hull's re-entry glow would light them up before the nose. */
    drawHullGear(ctx, cam, ship, mesh, L, sunDir, tint, gearTravelOf(ship));
    if (win) queueRoomsInPlace(cam, ship, win, sunDir);
  }

  /* HER CANOPY WELL. A hull model's glass is a dark panel on her skin, and
   * on most hulls it stands a metre or more ahead of (and above) the
   * cockpit room her crew actually sit in. So what is taken off is not the
   * skin over the room but the WELL between the two: a box from the room's
   * front wall out to the far side of her glass, as wide and as tall as
   * either, cut per pixel in the shader (a per-face cut either left her big
   * forward plates standing or tore holes the size of them). Her glass
   * faces near the cockpit come out of the hull and are drawn as glass;
   * through them, the well, and through the room's own front panes, her
   * cockpit. Glass is the library's canopy colour and the trader's. */
  var HULL_GLASS = { '#222a25': 1, '#1c2620': 1 };
  var HULL_GLASS_ALPHA = 0.32;
  var WELL_CACHE = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
  function windowWell(mesh, ship, d) {
    var ck = d && d.plan && d.plan.rooms.filter(function (r) { return r.kind === 'cockpit'; })[0];
    if (!ck || !mesh || !mesh.f || !mesh.c || !WELL_CACHE) return null;
    var Lm = hullLength(ship) * 1000, at = cockpitAt(ship) || [0, 0, 0];
    var key = ship.hullId + '|' + Lm.toFixed(2);
    var per = WELL_CACHE.get(mesh);
    if (!per) { per = {}; WELL_CACHE.set(mesh, per); }
    if (per[key]) return per[key];
    var fy = d.plan.floorY;
    var rx0 = at[0] + ck.x0, rx1 = at[0] + ck.x1, cx = (rx0 + rx1) / 2, rhw = (rx1 - rx0) / 2;
    /* A room's `y0`/`y1` are over the deck's floor: a raised cockpit
     * (shipdeck.js RAISED) stands on its own floor `y0` up. */
    var ry0 = at[1] + fy + (ck.y0 || 0), ry1 = at[1] + fy + (ck.y1 || 2.4), rz0 = at[2] + ck.z0, rz1 = at[2] + ck.z1;
    var opaque = { v: mesh.v, f: [], c: [] }, glass = { v: mesh.v, f: [], c: [] }, k;
    for (k in mesh) if (k.charAt(0) !== '_' && !(k in opaque)) opaque[k] = glass[k] = mesh[k];
    var g = null;
    for (var i = 0; i < mesh.f.length; i++) {
      var f = mesh.f[i], col = mesh.c[i];
      var x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9, z0 = 1e9, z1 = -1e9;
      for (var j = 0; j < f.length; j++) {
        var v = mesh.v[f[j]], x = v[0] * Lm, y = v[1] * Lm, z = v[2] * Lm;
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        if (z < z0) z0 = z; if (z > z1) z1 = z;
      }
      var near = HULL_GLASS[col] && (x0 + x1) / 2 - cx < rhw + 3 && cx - (x0 + x1) / 2 < rhw + 3 &&
                 (z0 + z1) / 2 > rz0 - 1 && (z0 + z1) / 2 < rz1 + 8 &&
                 (y0 + y1) / 2 > ry0 - 1 && (y0 + y1) / 2 < ry1 + 3;
      if (!near) { opaque.f.push(f); opaque.c.push(col); continue; }
      glass.f.push(f); glass.c.push(col);
      if (!g) g = { x0: x0, x1: x1, y0: y0, y1: y1, z0: z0, z1: z1 };
      else {
        g.x0 = Math.min(g.x0, x0); g.x1 = Math.max(g.x1, x1); g.y0 = Math.min(g.y0, y0);
        g.y1 = Math.max(g.y1, y1); g.z0 = Math.min(g.z0, z0); g.z1 = Math.max(g.z1, z1);
      }
    }
    /* No glass near her cockpit: the well is the half-metre of skin ahead
     * of the room's front wall, where its panes look out. */
    var w = g ? {
      cx: cx, hw: Math.max(rhw, Math.max(g.x1 - cx, cx - g.x0)) + 0.1,
      z0: Math.min(rz1 - 0.2, g.z0 - 0.1), z1: g.z1 + 0.15,
      y0: ry0 + 0.1, y1: Math.max(ry1, g.y1) + 0.15
    } : { cx: cx, hw: rhw + 0.1, z0: rz1 - 0.2, z1: rz1 + 0.6, y0: ry0 + 0.1, y1: ry1 + 0.1 };
    per[key] = { opaque: opaque, glass: glass, well: w };
    return per[key];
  }
  /* The well as gl.js's cut box, in km off her frame. */
  function wellBox(ship, well) {
    var w = well.well;
    return { origin: localToWorld(ship, w.cx * 0.001, 0, 0), a: ship.fwd, b: ship.right, u: ship.up,
             aMin: w.z0 * 0.001, aMax: w.z1 * 0.001, bHalf: w.hw * 0.001,
             zMin: w.y0 * 0.001, zMax: w.y1 * 0.001 };
  }

  /* Her rooms in her (the whole deck, indoors-lit, in her cockpit's frame)
   * and her panes over them as tinted glass. */
  var WINDOW_ALPHA = 0.3;
  /* BRIGHTER THAN A ROOM YOU STAND IN (2026-11-01, Astra's choice from
   * unfinished.md). Lit the same as a station room, her cabin read as a
   * dark well from outside: right for the eye of someone inside, wrong
   * for a lit window seen across space, where the cabin is the bright
   * thing and everything round it is dark. The indoor lamp, times this. */
  var CABIN_SEEN_GLOW = 1.8;
  function queueRoomsInPlace(cam, ship, d, sunDir) {
    var G2 = global.GLWorld;
    if (!G2 || !G2.queueMesh || !d.meshes || !d.meshes.room) return;
    var F = bridgeFrame(ship);
    setIndoors(CABIN_SEEN_GLOW);
    G2.queueMesh(cam, F, d.meshes.room, M, F.up, 0);
    if (d.meshes.fittings) G2.queueMesh(cam, F, d.meshes.fittings, M, F.up, 0);
    setIndoors(false);
    if (d.meshes.portals) G2.queueMesh(cam, F, d.meshes.portals, M, sunDir, 0, null, WINDOW_ALPHA);
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

  /* ---- where the engines actually are ------------------------------------
   * THE PLUME USED TO COME FROM A POINT, not from an engine: one plume on
   * the centreline, 0.44 hull-lengths back, sized from a table written for
   * the procedural courier. The imported hulls have their bells elsewhere
   * — the Talon carries two, either side of that centreline, and the
   * plume's width straddled the gap between them — so the fire came out of
   * the inboard SIDES of the engines instead of out of them (Astra,
   * 2026-09-18: "the thrust sometimes comes out the side of the ship's
   * engine").
   *
   * So the nozzles are read off the mesh: every vertex within a few
   * hundredths of the rearmost point, bucketed on a fine grid, and each
   * connected clump is an exit. Measured on the four player hulls: Talon
   * two bells at x = ±0.063, Dart two at ±0.075, Kestrel two at ±0.057,
   * Mule one wide flat stern. A ring inside a larger ring (a bell's inner
   * lip) is the same nozzle, and slivers are trim, not engines. Cached on
   * the mesh, so this is paid once per hull model, ever. */
  var NOZZLE_DEPTH = 0.04, NOZZLE_CELL = 0.012;

  function nozzlesOf(mesh) {
    if (!mesh || !mesh.v || !mesh.v.length) return null;
    if (mesh._nozzles !== undefined) return mesh._nozzles;
    /* A model that names its engines is taken at its word: one plume per
     * engineGlow, wherever it sits (a runner's outboard pods are well
     * forward of the stern, which the rear-face scan below never sees). */
    if (mesh.engines && mesh.engines.length) {
      mesh._nozzles = mesh.engines.map(function (e) {
        return { x: e.x, y: e.y, z: e.z, r: Math.max(0.006, e.r) };
      });
      return mesh._nozzles;
    }
    var zmin = Infinity, i;
    for (i = 0; i < mesh.v.length; i++) if (mesh.v[i][2] < zmin) zmin = mesh.v[i][2];
    var map = {}, keys = [];
    for (i = 0; i < mesh.v.length; i++) {
      var p = mesh.v[i];
      if (p[2] > zmin + NOZZLE_DEPTH) continue;
      var k = Math.round(p[0] / NOZZLE_CELL) + ',' + Math.round(p[1] / NOZZLE_CELL);
      if (!map[k]) { map[k] = []; keys.push(k); }
      map[k].push(p);
    }
    var seen = {}, clumps = [];
    keys.forEach(function (k0) {
      if (seen[k0]) return;
      seen[k0] = 1;
      var stack = [k0], n = 0, x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      while (stack.length) {
        var c = stack.pop(), pts = map[c];
        for (var j = 0; j < pts.length; j++) {
          var q = pts[j]; n++;
          if (q[0] < x0) x0 = q[0]; if (q[0] > x1) x1 = q[0];
          if (q[1] < y0) y0 = q[1]; if (q[1] > y1) y1 = q[1];
        }
        var ij = c.split(',');
        var ci = +ij[0], cj = +ij[1];
        for (var dx = -1; dx <= 1; dx++) for (var dy = -1; dy <= 1; dy++) {
          var nk = (ci + dx) + ',' + (cj + dy);
          if (map[nk] && !seen[nk]) { seen[nk] = 1; stack.push(nk); }
        }
      }
      clumps.push({ n: n, x0: x0, x1: x1, y0: y0, y1: y1 });
    });
    var most = 0;
    clumps.forEach(function (c) { if (c.n > most) most = c.n; });
    var out = [];
    clumps.forEach(function (c) {
      if (c.n < most * 0.15) return;
      var cx = (c.x0 + c.x1) / 2, cy = (c.y0 + c.y1) / 2;
      var inside = clumps.some(function (o) {
        return o !== c && o.n > c.n && cx >= o.x0 && cx <= o.x1 && cy >= o.y0 && cy <= o.y1;
      });
      if (inside) return;
      var w = c.x1 - c.x0, h = c.y1 - c.y0;
      out.push({ x: cx, y: cy, z: zmin, r: Math.max(0.012, Math.min(w, h) / 2 * 0.85) });
    });
    mesh._nozzles = (out.length && out.length <= 6) ? out : null;
    return mesh._nozzles;
  }

  /* The mesh a ship is drawn with — the same choice drawHullModel makes,
   * so the plume and the hull can never disagree about which model it is. */
  function meshForShip(frame, kind) {
    var letter = frame && frame.sizeLetter;
    if (letter) {
      var swapped = hullIdForSpec({ cls: kind, sizeLetter: letter });
      if (swapped) { var m = libHull(swapped); if (m) return m; }
    }
    return shipMeshes()[kind] || shipMeshes().courier;
  }

  /* Fire a ship's drive. `frame` is the hull's own basis; `thrustDir` is
   * the direction it is pushing (null = straight ahead, an NPC on a rail).
   *
   * THE MAIN DRIVE ONLY EVER FIRES OUT OF ITS BELLS, straight back along
   * the hull. It used to be pointed opposite the full thrust vector, on the
   * argument that translation and attitude are separate here — true, and
   * it is why a sideways push is legal — but a bolted-on engine cannot
   * swivel ninety degrees, and a plume leaving a bell sideways is exactly
   * the thing that looks wrong. So thrust is split: the part along the
   * nose lights the drive, and whatever is left over (sideways, or
   * backwards) is shown as RCS puffs from the hull on the side it pushes
   * away from — which is what a ship that translates without turning is
   * actually doing. `mesh` is the model on screen; omitted, it is the
   * class hull. */
  function drawShipExhaust(ctx, cam, frame, lengthKm, throttle, kind, thrustDir, phase, mesh) {
    var spec = DRIVE_SPEC[kind] || DRIVE_SPEC.courier;
    var aft = V.scale(frame.fwd, -1);
    var main = throttle, lat = null, latAmt = 0, retro = 0;
    if (thrustDir) {
      var t = V.norm(thrustDir);
      var along = V.dot(t, frame.fwd);
      main = throttle * Math.max(0, along);
      var side = V.sub(t, V.scale(frame.fwd, along));
      var sl = V.len(side);
      if (sl > 1e-6) { lat = V.scale(side, 1 / sl); latAmt = throttle * sl; }
      if (along < 0) retro = throttle * -along;
    }

    var noz = nozzlesOf(mesh || meshForShip(frame, kind));
    if (noz) {
      for (var i = 0; i < noz.length; i++) {
        var n = noz[i];
        var origin = localToWorld(frame, n.x * lengthKm, n.y * lengthKm, n.z * lengthKm);
        drawExhaust(ctx, cam, origin, aft, lengthKm, n.r * lengthKm,
                    main, spec.color, phase + i * 0.23);
      }
    } else {
      drawExhaust(ctx, cam, V.addScaled(frame.pos, frame.fwd, -spec.tail * lengthKm), aft,
                  lengthKm, lengthKm * spec.width, main, spec.color, phase);
    }

    if (latAmt > 0.05 || retro > 0.05) {
      var ext = halfExtents(mesh || meshForShip(frame, kind));
      if (latAmt > 0.05) {
        /* Out of the hull on the far side from the push, fore and aft of
         * the middle, like a pair of thruster quads. The component along
         * right and up picks the hull's width or height at that side. */
        var out = V.scale(lat, -1);
        var lr = V.dot(out, frame.right), lu = V.dot(out, frame.up);
        var reach = Math.hypot(lr * ext[0], lu * ext[1]) || ext[0];
        [0.28, -0.28].forEach(function (zf, k) {
          var o = V.addScaled(V.addScaled(frame.pos, frame.fwd, zf * lengthKm), out, reach * lengthKm);
          drawRcs(ctx, cam, o, out, lengthKm, latAmt, phase + k * 0.5);
        });
      }
      if (retro > 0.05) {
        var nose = V.addScaled(frame.pos, frame.fwd, ext[2] * lengthKm * 0.92);
        [1, -1].forEach(function (sgn, k) {
          var o = V.addScaled(nose, frame.right, sgn * ext[0] * 0.5 * lengthKm);
          drawRcs(ctx, cam, o, frame.fwd, lengthKm, retro, phase + 0.3 + k * 0.5);
        });
      }
    }
  }

  /* A reaction-control puff: short, narrow, cold white-blue — a jet of
   * gas, not a torch, so it can never be mistaken for the main drive. */
  function drawRcs(ctx, cam, origin, dir, lengthKm, amount, phase) {
    var a = Math.min(1, amount);
    var flick = 0.8 + 0.2 * Math.sin(phase * 41.3);
    drawExhaust(ctx, cam, origin, dir, lengthKm * 0.022 * (0.6 + a) * flick,
                lengthKm * 0.018, Math.min(1, 0.4 + a), 'rgba(225,240,255,0.7)', phase);
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

  /* ---- THE BOARDS, ON BUILDINGS, IN LETTERS (2026-11-02) -----------------
   *
   * What the generator calls a sign used to be drawn as a coloured slab on
   * a 5 m post: no lettering at all, sized off pad radii (`s.w` 0.10-0.26,
   * so 25-60 m across), standing on its own out among the town. Lit, and
   * bloomed by the glow pass, it was a bright yellow or pink square in the
   * air with nothing under it that you could see — the smaller of the two
   * unexplained shapes on Astra's Downwell sheet. A sign that says nothing
   * and belongs to nothing is not a sign.
   *
   * So a board is now built from what it SAYS: the text in Dressing.FONT's
   * stroke letters, lit, on a dark backing panel, sized in METRES so the
   * letters are a few metres tall at any pad radius, and mounted on one of
   * the town's own blocks — on its roof, facing the pad, or (a second board
   * on the same block) across the wall that faces the pad. Every placement
   * is read off the dressing the generator already made — the sign's own
   * bearing picks the nearest block — so nothing new is drawn from any
   * stream and every port keeps the boards it had, in the places it had
   * them, saying what they said.
   *
   * Returned as plain records so the suite can check the sizes and that
   * each board stands on a building (test/render.test.js); the mesh is
   * built from exactly these. Units are pad radii, like the rest of the
   * dressing mesh. */
  var SIGN_LETTER_M = [1.6, 4.5];     // letter height range, metres
  var SIGN_LINE_CHARS = 14;           // wrap boards longer than this
  var SIGN_MAX_TALL_M = 14;           // a board's whole height, at most
  var SIGN_BACK = '#1d2128';          // backing panel: unlit, dark
  var SIGN_POST = '#3f454f';

  /* The words as lines the font can draw. The em dash every role board
   * carries ("REPROCESSING — WASTE ACCEPTED") is a line break, which is how
   * a two-part board is actually laid out; '&' is spelled out because the
   * font has no ampersand; anything else the font cannot draw is dropped
   * rather than left as a gap. */
  function signLines(text) {
    var F = (global.Dressing && global.Dressing.FONT) || null;
    var parts = String(text || '').toUpperCase().replace(/&/g, 'AND').split(/\s*[—–]\s*/);
    var lines = [];
    for (var p = 0; p < parts.length; p++) {
      var words = parts[p].split(/\s+/), line = '';
      for (var w = 0; w < words.length; w++) {
        var word = words[w].split('').filter(function (ch) { return !F || F[ch]; }).join('');
        if (!word) continue;
        if (line && (line.length + 1 + word.length) > SIGN_LINE_CHARS) { lines.push(line); line = word; }
        else line = line ? line + ' ' + word : word;
      }
      if (line) lines.push(line);
    }
    return lines.length ? lines : ['-'];
  }
  /* Width of a line in letter-heights — Dressing's own textWidth. */
  function signLineW(s) { return s.length * 0.95 - 0.28; }

  function portSignBoards(port) {
    var d = port && port.dressing;
    if (!d || !d.signs || !d.signs.length) return [];
    if (port._signBoards) return port._signBoards;
    var mPerPad = (port.radius || 0.25) * 1000;      // metres in one pad radius
    var blocks = d.blocks || [];
    var uses = blocks.map(function () { return 0; });
    var out = [];
    for (var i = 0; i < d.signs.length; i++) {
      var s = d.signs[i];
      var sx = Math.cos(s.u) * s.r, sy = Math.sin(s.u) * s.r;
      /* The nearest block to where the generator put the board, with an
       * already-used block a long way down the list: two boards on one
       * building is fine, but four on one and none on the rest is not a
       * town, it is a hoarding. */
      var bi = -1, best = Infinity;
      for (var j = 0; j < blocks.length; j++) {
        var bc = blocks[j];
        var dd = Math.hypot(Math.cos(bc.u) * bc.r - sx, Math.sin(bc.u) * bc.r - sy) + uses[j] * 4;
        if (dd < best) { best = dd; bi = j; }
      }
      var lines = signLines(s.text);
      var wUnits = 0;
      for (var l = 0; l < lines.length; l++) wUnits = Math.max(wUnits, signLineW(lines[l]));
      var rec = { text: s.text, lines: lines, ink: s.ink, lit: !!s.lit, block: bi };
      var b = bi >= 0 ? blocks[bi] : null;
      var bx = b ? Math.cos(b.u) * b.r : sx, by = b ? Math.sin(b.u) * b.r : sy;
      var mount = b ? (uses[bi] === 1 ? 'wall' : 'roof') : 'post';
      if (b && uses[bi] >= 2) mount = 'roof';     // and stacked, below
      /* Facing: a roof board faces the pad, squarely; a wall board lies on
       * whichever of the block's four walls looks most toward the pad —
       * the blocks are axis-aligned boxes, so that is ±x or ±y. */
      var nx, ny, spanPad;
      if (mount === 'wall') {
        var toPad = [-bx, -by];
        if (Math.abs(toPad[0]) >= Math.abs(toPad[1])) { nx = toPad[0] < 0 ? -1 : 1; ny = 0; spanPad = b.d; }
        else { nx = 0; ny = toPad[1] < 0 ? -1 : 1; spanPad = b.w; }
      } else {
        var rl = Math.hypot(bx, by) || 1;
        nx = -bx / rl; ny = -by / rl;
        spanPad = b ? Math.max(b.w, b.d) : 0.08;
      }
      /* Letter height: what fits the building, held between a size you can
       * read from the pad and one that is still a sign rather than a
       * hoarding. A board may overhang its roof a little — they do. */
      var fitM = (spanPad * mPerPad * 1.35) / Math.max(1, wUnits + 0.8);
      /* And a four-line board at the tallest letters would stand 18 m:
       * past a hoarding. Its letters give way to the height first. */
      var tallFit = SIGN_MAX_TALL_M / (lines.length * 1.45 + 0.35);
      var H = Math.max(SIGN_LETTER_M[0], Math.min(SIGN_LETTER_M[1], fitM, tallFit)) / mPerPad;
      var W = (wUnits + 0.8) * H, T = (lines.length * 1.45 + 0.35) * H;
      var cx, cy, cz;
      if (mount === 'wall') {
        var off = (nx !== 0 ? b.w : b.d) / 2;
        cx = bx + nx * (off + 0.0015); cy = by + ny * (off + 0.0015);
        /* Under the parapet, and never below the ground on a low shed. */
        cz = Math.max(T / 2 + 0.002, b.h - T / 2 - 0.15 * H);
      } else if (mount === 'roof') {
        var stack = b ? Math.max(0, uses[bi] - 1) : 0;
        cx = bx; cy = by;
        cz = (b ? b.h : 0) + 0.6 * H + T / 2 + stack * (T + 0.6 * H);
      } else {
        cx = sx; cy = sy; cz = 0.6 * H + T / 2 + 6 / mPerPad;
      }
      if (b) uses[bi]++;
      rec.mount = mount;
      rec.c = [cx, cy, cz];
      rec.n = [nx, ny, 0];                 // the face you read, outward
      rec.w = W; rec.t = T; rec.letter = H;
      rec.base = cz - T / 2;               // bottom edge of the panel
      rec.stand = mount === 'wall' ? null : (b && mount === 'roof' ? b.h : 0);
      rec.wM = W * mPerPad; rec.tM = T * mPerPad; rec.letterM = H * mPerPad;
      out.push(rec);
    }
    port._signBoards = out;
    return out;
  }

  /* One board into the dressing mesh: legs (unless it is on a wall), the
   * dark panel, and the letters a hair proud of it. Text runs along the
   * reader's right, so it reads forwards from the pad and is hidden behind
   * the panel from the back, as a real board is. The pad frame (x east,
   * y north, z up, as stationFrame hands it over) is LEFT-handed in the
   * world — Sim.groundBasis gives east x north = -up, measured — so the
   * reader's right for a face whose outward normal is n is (n.y, -n.x),
   * not the (-n.y, n.x) a right-handed frame would give. The first build
   * used the latter and every board in the game came out mirror-written;
   * the screenshot caught it, and render.test.js now checks the sign
   * against the basis itself ("boards read forwards"). */
  function signRight(n) { return [n[1], -n[0], 0]; }
  function addSignBoard(mesh, rec) {
    var F = (global.Dressing && global.Dressing.FONT) || null;
    var n = rec.n, rt = signRight(n);
    var c = rec.c, W = rec.w, T = rec.t, H = rec.letter;
    var thick = Math.max(0.0012, H * 0.08);
    if (rec.mount !== 'wall') {
      var legH = (rec.base - rec.stand) / 2;
      if (legH > 0) {
        for (var k = -1; k <= 1; k += 2) {
          addBox(mesh, [c[0] + rt[0] * k * W * 0.36 - n[0] * thick * 2, c[1] + rt[1] * k * W * 0.36 - n[1] * thick * 2, rec.stand + legH],
                 [H * 0.07, 0, 0], [0, H * 0.07, 0], [0, 0, legH], SIGN_POST);
        }
      }
    }
    addBox(mesh, c, [rt[0] * W / 2, rt[1] * W / 2, 0], [n[0] * thick, n[1] * thick, 0], [0, 0, T / 2], SIGN_BACK);
    var col = rec.lit ? '!' + rec.ink : rec.ink;
    if (!F) {
      /* No font loaded (a page without dressing.js): a lit band, which is
       * at least the right size and in the right place. */
      addBox(mesh, [c[0] + n[0] * thick * 1.6, c[1] + n[1] * thick * 1.6, c[2]],
             [rt[0] * W * 0.42, rt[1] * W * 0.42, 0], [n[0] * thick * 0.5, n[1] * thick * 0.5, 0], [0, 0, T * 0.3], col);
      return;
    }
    var stroke = H * 0.065, face = thick * 1.5;
    var top = c[2] + T / 2 - 0.25 * H;
    for (var li = 0; li < rec.lines.length; li++) {
      var line = rec.lines[li];
      var v0 = top - (li + 1) * 1.45 * H + 0.45 * H;      // baseline
      var x = -signLineW(line) * H / 2;
      var k6 = H / 6;
      for (var ci = 0; ci < line.length; ci++, x += H * 0.95) {
        var g = F[line.charAt(ci)];
        if (!g) continue;
        var polys = g.split('|');
        for (var pi = 0; pi < polys.length; pi++) {
          var pts = polys[pi].split(' ').map(function (p) {
            var xy = p.split(',');
            return [x + xy[0] * k6 * 0.68, v0 + xy[1] * k6];
          });
          for (var q = 0; q + 1 < pts.length; q++) {
            var a = pts[q], bq = pts[q + 1];
            var du = bq[0] - a[0], dv = bq[1] - a[1], L = Math.hypot(du, dv);
            if (L < 1e-9) continue;
            var mu = (a[0] + bq[0]) / 2, mv = (a[1] + bq[1]) / 2;
            var hu = du / L * (L / 2 + stroke / 2), hv = dv / L * (L / 2 + stroke / 2);
            var pu = -dv / L * stroke / 2, pv = du / L * stroke / 2;
            addBox(mesh,
                   [c[0] + rt[0] * mu + n[0] * face, c[1] + rt[1] * mu + n[1] * face, mv],
                   [rt[0] * hu, rt[1] * hu, hv],
                   [rt[0] * pu, rt[1] * pu, pv],
                   [n[0] * thick * 0.45, n[1] * thick * 0.45, 0], col);
          }
        }
      }
    }
  }

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

    /* The boards: on the town's buildings, lettered. See portSignBoards. */
    var boards = portSignBoards(port);
    for (i = 0; i < boards.length; i++) addSignBoard(mesh, boards[i]);

    /* Approach lighting: a ring of lamps on the pad rim. Warm on the
     * ground, cold in orbit — decided by the generator, drawn here. */
    /* SIZED AS LAMPS, IN METRES (2026-11-02). These were 0.04 pad radii a
     * side — a 9 m glowing cube at Downwell — and with the glow pass round
     * each one the ring read from the street as a dozen bright yellow
     * squares hanging in the sky: the other half of the mystery on Astra's
     * sheet (the pink slabs were the hatch lamps, drawPortLamps). Over the
     * flat ground of the time there was nothing to say they were standing
     * on anything. A runway edge light is a housing a couple of metres
     * across; the bloom, not the box, is what carries it at a distance.
     *
     * And stood on the right street: the procedural port's apron is a slab
     * whose top is 0.05 pad radii up, which the old 0..0.04 box was buried
     * in; a modelled port's street is z = 0. */
    var lamp = '!' + (d.padLight || '#ffb45c');
    var lampHalf = PAD_LAMP_HALF_M / ((port.radius || 0.25) * 1000);
    var lampZ = (portStreetIsModelled(port) ? 0 : APRON_TOP) + lampHalf;
    for (i = 0; i < 12; i++) {
      /* Math.PI * 2 rather than K.TAU on purpose: this is the only thing in
       * the mesh builder that would drag in the Kepler module, and a mesh
       * builder should be loadable on its own. */
      u = (i / 12) * Math.PI * 2;
      cs = Math.cos(u); sn = Math.sin(u);
      addBox(mesh, [cs * 1.04, sn * 1.04, lampZ],
             [lampHalf, 0, 0], [0, lampHalf, 0], [0, 0, lampHalf], lamp);
    }

    port._dressMesh = mesh;
    return mesh;
  }

  /* ---- STATION LIGHTS: beacons, and a way in you can see from far out ---
   *
   * An orbital dock had no dressing at all — no ground to put a town on —
   * so from outside it was whatever lamps its modeller happened to light,
   * which for most of the library is almost none: a grey block in the dark.
   * This is the orbital counterpart of the pad lamps, and it is built for
   * the glow pass (gl.js POST) to pick up: every lamp is a '!' face.
   *
   * TWO KINDS, both in the FE2/FFE register — small flat lit shapes, read
   * by their pattern rather than by detail:
   *
   *   BEACONS at the extremities. White double-flash strobes at both ends of
   *   the longest axis, a red and a green steady lamp at the ends of the
   *   next one (so which way round a station is reads from a distance), and
   *   a slow red anti-collision lamp on top.
   *
   *   APPROACH STRINGS, two rows of amber lamps per berth edging the clear
   *   line in from open space — the same line Gen.berthApertures measures
   *   for the arrival rail, so the lamps can never lead you into a wall the
   *   rail would not. When you are cleared for a berth, a white "rabbit"
   *   runs down YOUR berth's rows toward the door.
   *
   * COST, against Astra's "don't overstress the 4 GB": every piece is built
   * once per MODEL (a lamp layout is a fact about the art, like the entry
   * lines it reads) and blinking is choosing which prebuilt piece to queue
   * this frame, never rebuilding. A station's whole kit is a few hundred
   * triangles; a frame queues at most four of its pieces. */
  var LIGHT_KITS = {};
  var LAMP_BEACON_FAR = 0.016;      // station radii, half-size of a beacon box
  var LAMP_STRING_FAR = 0.0075;     // ...and of an approach lamp
  /* Up close a lamp is a lamp-sized thing. The far sizes are chosen to be
   * read from tens of kilometres — 64 m boxes on a 4 km station — and with
   * the cutaway putting the camera right beside the hull, the beacons
   * filled the corner of the screen as great glowing yellow blocks. So
   * inside a few station radii the kit is swapped for one whose beacons
   * are a few metres across. Two sizes rather than a continuous scale:
   * each size is a cached mesh, and a scale that moved with the camera
   * would rebuild the kit every frame of a zoom. */
  var LAMP_NEAR_KM = 0.004;         // half-size of a beacon up close
  var LAMP_NEAR_RANGE = 2.5;        // station radii from the centre
  var STRING_STEP = 0.07;           // spacing along the approach
  var STRING_HALF = 0.05;           // each row's offset from the centreline
  var CHASE_PHASES = 4;

  function lampBox(mesh, p, half, color) {
    addBox(mesh, p, [half, 0, 0], [0, half, 0], [0, 0, half], color);
  }

  /* `scale` shrinks every lamp about its own centre (see drawStationLights
   * for why there are two sizes); the kit is cached per model and size. */
  function stationLightKit(port, model, scale) {
    scale = scale || 1;
    var kitKey = model + '|' + scale.toFixed(4);
    var kit = LIGHT_KITS[kitKey];
    var LAMP_BEACON = LAMP_BEACON_FAR * scale, LAMP_STRING = LAMP_STRING_FAR * scale;
    if (kit) return kit;
    var hull = stationMeshes()[model];
    if (!hull) { var lp = libPort(model); hull = lp && lp.shell; }
    if (!hull || !hull.v || !hull.v.length) return null;   // not loaded yet: ask again next frame

    /* The extremities, measured off the hull itself. */
    var lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    var loV = [null, null, null], hiV = [null, null, null];
    for (var i = 0; i < hull.v.length; i++) {
      var v = hull.v[i];
      for (var a = 0; a < 3; a++) {
        if (v[a] < lo[a]) { lo[a] = v[a]; loV[a] = v; }
        if (v[a] > hi[a]) { hi[a] = v[a]; hiV[a] = v; }
      }
    }
    var span = [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]];
    var axes = [0, 1, 2].sort(function (p, q) { return span[q] - span[p]; });
    function proud(v, a, sign) {
      var p = v.slice();
      p[a] += sign * LAMP_BEACON * 1.5;     // stood just off the hull, never inside it
      return p;
    }
    var strobe = emptyMesh(); strobe.c = [];
    var steady = emptyMesh(); steady.c = [];
    var topLamp = emptyMesh(); topLamp.c = [];
    var long = axes[0], side = axes[1];
    lampBox(strobe, proud(loV[long], long, -1), LAMP_BEACON, '!#fff6dc');
    lampBox(strobe, proud(hiV[long], long, 1), LAMP_BEACON, '!#fff6dc');
    lampBox(steady, proud(loV[side], side, -1), LAMP_BEACON, '!#ff3b30');
    lampBox(steady, proud(hiV[side], side, 1), LAMP_BEACON, '!#38ff6a');
    /* "Top" is the model's +z — the axis stations are stood up along. */
    lampBox(topLamp, proud(hiV[2], 2, 1), LAMP_BEACON * 0.8, '!#ff2a1f');

    /* The approach strings, per berth. */
    var strings = emptyMesh(); strings.c = [];
    var chase = [];
    var Gen = global.Gen;
    var berths = (Gen && Gen.modelledBerths) ? Gen.modelledBerths(port) : null;
    var n = berths ? berths.length : 0;
    for (var b = 0; b < n; b++) {
      var ap = Gen.berthApertures(port, b);
      chase[b] = null;
      if (!ap || !ap.reachable || !ap.entry) continue;
      /* The door and the line in from Sim.berthDoor — the one the arrival
       * rail flies (2026-11-03: "ship is not aligned with the navigation
       * landing lights"). */
      var bdr = (global.Sim && global.Sim.berthDoor) ? global.Sim.berthDoor(port, b) : null;
      var door = bdr ? bdr.door
               : [ap.mid[0] + ap.normal[0] * (ap.gate || 0),
                  ap.mid[1] + ap.normal[1] * (ap.gate || 0),
                  ap.mid[2] + ap.normal[2] * (ap.gate || 0)];
      var e = bdr ? bdr.entry : ap.entry;
      /* Across the corridor: any axis not along it, made perpendicular. */
      var ref = Math.abs(e[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
      var x = [e[1] * ref[2] - e[2] * ref[1], e[2] * ref[0] - e[0] * ref[2], e[0] * ref[1] - e[1] * ref[0]];
      var xl = Math.sqrt(x[0] * x[0] + x[1] * x[1] + x[2] * x[2]) || 1;
      x = [x[0] / xl, x[1] / xl, x[2] / xl];
      /* From just outside the doors to a little past where the hull ends —
       * far enough out to be seen before you commit to the line. */
      var reach = Math.min(1.6, Math.max(0.7, (ap.exit || 0.4) + 0.55));
      var count = Math.max(4, Math.floor(reach / STRING_STEP));
      var phases = [];
      for (var ph = 0; ph < CHASE_PHASES; ph++) { phases[ph] = emptyMesh(); phases[ph].c = []; }
      for (var j = 0; j < count; j++) {
        var d = 0.06 + j * STRING_STEP;
        for (var sgn = -1; sgn <= 1; sgn += 2) {
          var p = [door[0] + e[0] * d + x[0] * STRING_HALF * sgn,
                   door[1] + e[1] * d + x[1] * STRING_HALF * sgn,
                   door[2] + e[2] * d + x[2] * STRING_HALF * sgn];
          lampBox(strings, p, LAMP_STRING, '!#d98a2b');
          lampBox(phases[j % CHASE_PHASES], p, LAMP_STRING * 1.25, '!#ffffff');
        }
      }
      chase[b] = phases;
    }
    kit = LIGHT_KITS[kitKey] = { strobe: strobe, steady: steady, top: topLamp,
                                strings: strings, chase: chase };
    return kit;
  }

  /* `t` is WALL CLOCK seconds, for the same reason as the pad lamps: a lamp
   * on a timer is not something the simulation drives, and sim time would
   * turn the flashing into a blur under time warp. `chaseBerth` is the berth
   * you are cleared for at THIS station, or null. */
  function drawStationLights(ctx, cam, frame, port, model, radiusKm, sunDir, t, chaseBerth) {
    var near = cam && cam.eye && frame && frame.pos &&
               V.dist(cam.eye, frame.pos) < radiusKm * LAMP_NEAR_RANGE;
    var scale = near ? Math.min(1, LAMP_NEAR_KM / (LAMP_BEACON_FAR * radiusKm)) : 1;
    var kit = stationLightKit(port, model, scale);
    if (!kit) return;
    var draw = function (m) {
      if (!m || !m.f.length) return;
      if (gpuWorld() && global.GLWorld.queueMesh(cam, frame, m, radiusKm, sunDir)) return;
      paintMesh(ctx, cam, frame, m, radiusKm, sunDir, '#ffffff');
    };
    draw(kit.steady);
    draw(kit.strings);
    var s = t % 1.6;                                  // strobe: a double flash
    if (s < 0.07 || (s > 0.2 && s < 0.27)) draw(kit.strobe);
    if ((t % 1.3) < 0.55) draw(kit.top);              // anti-collision: slow
    if (typeof chaseBerth === 'number' && kit.chase[chaseBerth]) {
      /* The rabbit runs INWARD: lamp index grows outward, so the lit phase
       * steps down as time goes on. Eight steps a second. */
      var step = Math.floor(t * 8) % CHASE_PHASES;
      draw(kit.chase[chaseBerth][(CHASE_PHASES - step) % CHASE_PHASES]);
    }
  }

  /* ---- BUSY SPACE: the small craft that live round a dock ----------------
   *
   * One of the four things Astra picked for the space near a station once
   * the RX 540 arrived: "busy space". A dock with nothing moving round it
   * reads as a model on a stand. So each one keeps a handful of small craft
   * of its own — shuttles working the approach lanes, in to the doors and
   * out again, and work drones circling the hull on tilted loops.
   *
   * ON RAILS, BY CONSTRUCTION. Every craft's position is a closed-form
   * function of sim time, like the traffic and the patrols (doctrine 3):
   * nothing is integrated, nothing is saved, and a dock you come back to
   * after an hour has its shuttles where an hour of flying would have put
   * them. SEEDED FROM THE PORT'S OWN IDENTITY in a string of its own
   * ('tenders|...'), so it consumes no draw anything else relies on
   * (doctrine 2) and the same dock has the same craft every visit.
   *
   * VISUAL ONLY, and near tier only (main.js stationTier) — the same terms
   * as the outworks. They are not contacts: you cannot hail, target or hit
   * them, and they do not occupy berths. They keep to the approach lines
   * the lamps already mark and to loops outside the hull, which is where
   * a pilot expects to find small craft and nowhere else. */
  var TENDER_CACHE = {};
  var TENDER_MESH = {};

  function tenderMesh(kind) {
    if (TENDER_MESH[kind]) return TENDER_MESH[kind];
    var m = emptyMesh(); m.c = [];
    if (kind === 'drone') {
      /* A pod with two outrigger thrusters: unit size, +z forward. */
      addBox(m, [0, 0, 0], [0.28, 0, 0], [0, 0.22, 0], [0, 0, 0.42], '#c9a440');
      addBox(m, [0.42, 0, -0.1], [0.12, 0, 0], [0, 0.1, 0], [0, 0, 0.22], '#5d6168');
      addBox(m, [-0.42, 0, -0.1], [0.12, 0, 0], [0, 0.1, 0], [0, 0, 0.22], '#5d6168');
      addBox(m, [0, 0.24, 0.1], [0.06, 0, 0], [0, 0.04, 0], [0, 0, 0.06], '!#ffb347');
      addBox(m, [0.42, 0, -0.34], [0.07, 0, 0], [0, 0.06, 0], [0, 0, 0.03], '!#7ed3ff');
      addBox(m, [-0.42, 0, -0.34], [0.07, 0, 0], [0, 0.06, 0], [0, 0, 0.03], '!#7ed3ff');
    } else {
      /* A boxy shuttle: hull, cab, engine block, nav lamps port and
       * starboard, a white tail lamp. */
      addBox(m, [0, 0, 0], [0.22, 0, 0], [0, 0.16, 0], [0, 0, 0.5], '#aab2bd');
      addBox(m, [0, 0.12, 0.34], [0.16, 0, 0], [0, 0.07, 0], [0, 0, 0.14], '#2b3440');
      addBox(m, [0, 0, -0.52], [0.18, 0, 0], [0, 0.12, 0], [0, 0, 0.06], '#4a515c');
      addBox(m, [0, 0, -0.6], [0.12, 0, 0], [0, 0.08, 0], [0, 0, 0.02], '!#ff9a3c');
      addBox(m, [-0.24, 0, 0.1], [0.03, 0, 0], [0, 0.03, 0], [0, 0, 0.03], '!#ff3b30');
      addBox(m, [0.24, 0, 0.1], [0.03, 0, 0], [0, 0.03, 0], [0, 0, 0.03], '!#38ff6a');
      addBox(m, [0, 0.17, -0.45], [0.03, 0, 0], [0, 0.03, 0], [0, 0, 0.03], '!#fff6dc');
    }
    TENDER_MESH[kind] = m;
    return m;
  }

  /* The schedule for one dock: paths in the model's own units (station
   * radii), craft sizes in km — a shuttle is a shuttle at any dock. */
  function stationTenders(port, model) {
    var key = (port.id || port.name) + '|' + model;
    if (TENDER_CACHE[key] !== undefined) return TENDER_CACHE[key];
    var Gen = global.Gen;
    var rng = new RNG('tenders|' + port.name + '|' + port.id + '|' + model);
    var list = [];
    /* Shuttles on the lanes the lamps mark. */
    var berths = (Gen && Gen.modelledBerths) ? Gen.modelledBerths(port) : null;
    var lanes = [];
    for (var b = 0; berths && b < berths.length; b++) {
      var ap = Gen.berthApertures(port, b);
      if (!ap || !ap.reachable || !ap.entry) continue;
      var door = [ap.mid[0] + ap.normal[0] * (ap.gate || 0),
                  ap.mid[1] + ap.normal[1] * (ap.gate || 0),
                  ap.mid[2] + ap.normal[2] * (ap.gate || 0)];
      lanes.push({ door: door, e: ap.entry,
                   reach: Math.min(2.2, Math.max(1.0, (ap.exit || 0.4) + 1.1)) });
    }
    var nLane = Math.min(lanes.length, rng.int(1, 3));
    for (var i = 0; i < nLane; i++) {
      var ln = lanes[rng.int(0, lanes.length - 1)];
      list.push({ kind: 'shuttle', lane: ln,
                  period: rng.range(70, 120), phase: rng.next(),
                  size: rng.range(0.015, 0.022),          // km — a work shuttle
                  offset: rng.range(-0.04, 0.04) });
    }
    /* Drones on tilted loops round the hull. */
    var nDrone = rng.int(2, 4);
    for (var d = 0; d < nDrone; d++) {
      var tilt = rng.range(-0.9, 0.9), node = rng.angle();
      list.push({ kind: 'drone', radius: rng.range(1.15, 1.55),
                  period: rng.range(160, 320) * (rng.chance(0.5) ? 1 : -1),
                  phase: rng.next(), tilt: tilt, node: node,
                  size: rng.range(0.005, 0.008) });      // km
    }
    TENDER_CACHE[key] = list;
    return list;
  }

  /* Where a craft is at time t and which way it points, model units. */
  function tenderPose(c, t) {
    if (c.kind === 'shuttle') {
      /* In, hold at the doors, out, hold off the end of the lane. Eased at
       * both ends so it decelerates into the hold rather than stopping
       * dead — the one thing that makes a small craft read as flown. */
      var u = ((t / c.period + c.phase) % 1 + 1) % 1;
      var ease = function (x) { return x * x * (3 - 2 * x); };
      var k, inbound;
      if (u < 0.42) { k = 1 - ease(u / 0.42); inbound = true; }
      else if (u < 0.5) { k = 0; inbound = true; }
      else if (u < 0.92) { k = ease((u - 0.5) / 0.42); inbound = false; }
      else { k = 1; inbound = false; }
      var ln = c.lane, e = ln.e;
      var dist = 0.12 + k * ln.reach;
      var side = Math.abs(e[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
      var x = [e[1] * side[2] - e[2] * side[1], e[2] * side[0] - e[0] * side[2],
               e[0] * side[1] - e[1] * side[0]];
      var xl = Math.sqrt(x[0] * x[0] + x[1] * x[1] + x[2] * x[2]) || 1;
      var p = [ln.door[0] + e[0] * dist + x[0] / xl * c.offset,
               ln.door[1] + e[1] * dist + x[1] / xl * c.offset,
               ln.door[2] + e[2] * dist + x[2] / xl * c.offset];
      /* Nose to the door on the way in, nose out on the way out. */
      var f = inbound ? [-e[0], -e[1], -e[2]] : [e[0], e[1], e[2]];
      return { p: p, f: f, burn: (u < 0.42 || (u > 0.5 && u < 0.92)) };
    }
    var a = (t / c.period + c.phase) * Math.PI * 2;
    var ca = Math.cos(a), sa = Math.sin(a);
    var cn = Math.cos(c.node), sn = Math.sin(c.node);
    var ct = Math.cos(c.tilt), st = Math.sin(c.tilt);
    /* A circle in the x-y plane, tilted about x, then turned about z. */
    var lx = ca, ly = sa * ct, lz = sa * st;
    var p2 = [c.radius * (lx * cn - ly * sn), c.radius * (lx * sn + ly * cn), c.radius * lz];
    var dx = -sa, dy = ca * ct, dz = ca * st;
    var dir = c.period > 0 ? 1 : -1;
    var f2 = [dir * (dx * cn - dy * sn), dir * (dx * sn + dy * cn), dir * dz];
    return { p: p2, f: f2, burn: true };
  }

  function drawStationTraffic(ctx, cam, frame, port, model, radiusKm, sunDir, t) {
    if (!gpuWorld()) return;                 // a 2D canvas has enough to draw
    var list = stationTenders(port, model);
    if (!list || !list.length) return;
    for (var i = 0; i < list.length; i++) {
      var c = list[i], pose = tenderPose(c, t);
      var w = localToWorld(frame, pose.p[0] * radiusKm, pose.p[1] * radiusKm,
                           pose.p[2] * radiusKm);
      var fw = { x: frame.right.x * pose.f[0] + frame.up.x * pose.f[1] + frame.fwd.x * pose.f[2],
                 y: frame.right.y * pose.f[0] + frame.up.y * pose.f[1] + frame.fwd.y * pose.f[2],
                 z: frame.right.z * pose.f[0] + frame.up.z * pose.f[1] + frame.fwd.z * pose.f[2] };
      fw = V.norm(fw);
      var upRef = Math.abs(V.dot(fw, frame.fwd)) < 0.95 ? frame.fwd : frame.right;
      var right = V.norm(V.cross(upRef, fw));
      var up = V.cross(fw, right);
      var cf = { pos: w, right: right, up: up, fwd: fw };
      global.GLWorld.queueMesh(cam, cf, tenderMesh(c.kind), c.size, sunDir);
    }
  }

  /* ---- OUTWORKS: the structures round a dock --------------------------
   *
   * Astra: "the station right now looks nice, but we can have more — just
   * other geometry." So a dock grows a few outbuildings: tank farms, cargo
   * stacks, solar wings, comms masts, shipyard scaffolds, greenhouse rings,
   * chosen by what the port DOES (a mining head stacks ore cans, a
   * refinery keeps tanks, a yard has frames with work in them), each
   * tethered back to the hull by a truss and carrying red obstruction
   * lamps for the glow pass.
   *
   * A PURE FUNCTION OF THE PORT, decided here rather than in generate.js,
   * for one reason: placement has to avoid every berth's way in, and the
   * way in is measured off the model (Gen.berthApertures), which is loaded
   * lazily and does not exist at generation time. So the layout is seeded
   * from the port's own identity — same port, same outworks, every visit,
   * every save — and needs no new save field and no generator change.
   *
   * KEPT OUT OF EVERY APPROACH. A candidate spot is thrown away if it sits
   * within 40 degrees of any berth's entry line as seen from that berth's
   * door, or too close to the door itself. The approach lamps run down
   * those same lines, so nothing built here can stand in a corridor the
   * lamps tell you to fly.
   *
   * Only for the NEAR tier (main.js stationTier): a dock across the system
   * costs nothing for having a yard. Visual only — like the hulls, nothing
   * here collides. */
  var OUTWORK_MENU = {
    mining:       ['stack', 'stack', 'stack', 'tanks', 'mast'],
    reprocessing: ['tanks', 'tanks', 'tanks', 'mast', 'stack'],
    milfuel:      ['tanks', 'tanks', 'tanks', 'mast'],
    shipyard:     ['scaffold', 'scaffold', 'scaffold', 'stack', 'solar'],
    agri:         ['green', 'green', 'green', 'solar'],
    highport:     ['solar', 'solar', 'mast', 'mast', 'green'],
    orbital:      ['solar', 'mast', 'stack', 'tanks']
  };
  var CAN_COLOURS = ['#c8642e', '#2f6ca8', '#8a8f96', '#b89b3a', '#5d7f4a', '#9a4646'];
  var OUT_PLATE = '#8d949f', OUT_TRUSS = '#5b626d', OBSTRUCTION = '!#ff3326';

  /* merge() with an orientation: each source vertex v lands at
   * o + ax*v.x + ay*v.y + az*v.z. The outworks face outward from the hub,
   * which no axis-aligned merge can say. */
  function mergeAxes(dst, src, o, ax, ay, az, col) {
    var base = dst.v.length, i;
    for (i = 0; i < src.v.length; i++) {
      var v = src.v[i];
      dst.v.push([o[0] + ax[0] * v[0] + ay[0] * v[1] + az[0] * v[2],
                  o[1] + ax[1] * v[0] + ay[1] * v[1] + az[1] * v[2],
                  o[2] + ax[2] * v[0] + ay[2] * v[1] + az[2] * v[2]]);
    }
    if (!dst.c) { dst.c = []; while (dst.c.length < dst.f.length) dst.c.push(null); }
    for (i = 0; i < src.f.length; i++) {
      dst.f.push([src.f[i][0] + base, src.f[i][1] + base, src.f[i][2] + base]);
      dst.c.push(src.c ? src.c[i] : (col || null));
    }
  }

  function vlen(a) { return Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]); }
  function vnorm(a) { var l = vlen(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
  function vcross(a, b) {
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  }

  /* One outwork, built in its own frame: +z points away from the hub. */
  function outworkPart(kind, rng) {
    var m = emptyMesh(); m.c = [];
    var lamp = function (x, y, z) { lampBox(m, [x, y, z], 0.006, OBSTRUCTION); };
    var i, j, k;
    if (kind === 'tanks') {
      var n = 3 + rng.int(0, 2), gap = 0.085;
      var x0 = -(n - 1) * gap / 2;
      merge(m, box((n - 1) * gap / 2 + 0.05, 0.012, 0.012), 0, 0, -0.07, 1, OUT_TRUSS);
      for (i = 0; i < n; i++) {
        merge(m, tube(10, 0.034, 0.034, 0.065, true), x0 + i * gap, 0, 0, 1,
              rng.chance(0.3) ? '#9aa6b4' : '#c8bfae');
      }
      lamp(x0 - 0.05, 0, 0.07); lamp(-x0 + 0.05, 0, 0.07);
    } else if (kind === 'stack') {
      var nx = 3 + rng.int(0, 2), ny = 2 + rng.int(0, 1), nz = 2 + rng.int(0, 2), c = 0.026;
      merge(m, box(nx * c + 0.01, ny * c + 0.01, 0.006), 0, 0, -0.006, 1, OUT_PLATE);
      for (i = 0; i < nx; i++) for (j = 0; j < ny; j++) for (k = 0; k < nz; k++) {
        if (k > 0 && rng.chance(0.18)) continue;              // gaps where cans have gone
        merge(m, box(c * 0.92, c * 0.45, c * 0.42),
              (i - (nx - 1) / 2) * c * 2, (j - (ny - 1) / 2) * c * 1.05, k * c * 0.9 + c * 0.45,
              1, rng.pick(CAN_COLOURS));
      }
      lamp(nx * c + 0.01, ny * c, 0.01); lamp(-nx * c - 0.01, -ny * c, 0.01);
    } else if (kind === 'solar') {
      var span = 0.28 + rng.range(0, 0.12);
      merge(m, box(span, 0.008, 0.008), 0, 0, 0, 1, OUT_TRUSS);
      for (var sd = -1; sd <= 1; sd += 2) {
        merge(m, box(span * 0.42, 0.075, 0.003), sd * span * 0.52, 0, 0, 1, '#1f3561');
        merge(m, box(span * 0.43, 0.004, 0.004), sd * span * 0.52, 0.077, 0, 1, OUT_PLATE);
        merge(m, box(span * 0.43, 0.004, 0.004), sd * span * 0.52, -0.077, 0, 1, OUT_PLATE);
        lamp(sd * (span * 0.95 + 0.01), 0, 0.006);
      }
    } else if (kind === 'mast') {
      var h = 0.18 + rng.range(0, 0.1);
      merge(m, box(0.007, 0.007, h / 2), 0, 0, h / 2, 1, OUT_TRUSS);
      merge(m, tube(12, 0.09, 0.012, 0.018, true), 0, 0, h * 0.72, 1, '#d9d6cf');
      merge(m, box(0.035, 0.035, 0.01), 0, 0, 0.01, 1, OUT_PLATE);
      lamp(0, 0, h + 0.008);
    } else if (kind === 'scaffold') {
      var hx = 0.1 + rng.range(0, 0.05), hy = 0.06, hz = 0.07, b = 0.0045;
      for (var a = -1; a <= 1; a += 2) for (var bb = -1; bb <= 1; bb += 2) {
        merge(m, box(hx, b, b), 0, a * hy, bb * hz, 1, '#b9a24c');
        merge(m, box(b, hy, b), a * hx, 0, bb * hz, 1, '#b9a24c');
        merge(m, box(b, b, hz), a * hx, bb * hy, 0, 1, '#b9a24c');
      }
      /* Work in the frame: a hull half built, plates missing. */
      merge(m, box(hx * 0.62, hy * 0.45, hz * 0.4), -hx * 0.1, 0, 0, 1, '#6f7783');
      merge(m, box(hx * 0.3, hy * 0.35, hz * 0.32), hx * 0.55, 0, 0, 1, '#7c8591');
      lampBox(m, [hx, hy, hz], 0.006, '!#ffb347'); lampBox(m, [-hx, -hy, hz], 0.006, '!#ffb347');
      lamp(hx, -hy, -hz); lamp(-hx, hy, -hz);
    } else {                                   // 'green': a greenhouse ring
      var R = 0.11 + rng.range(0, 0.04);
      merge(m, rimRing(16, R, 0.022, 0.022), 0, 0, 0, 1, '~9#9fc9d8');
      merge(m, rimRing(16, R, 0.016, 0.016), 0, 0, 0, 1, '!#7fd36b');
      merge(m, spokes(4, 0.015, R, 0.006), 0, 0, 0, 1, OUT_TRUSS);
      lamp(R + 0.03, 0, 0); lamp(-R - 0.03, 0, 0);
    }
    return m;
  }

  /* The outermost crossing of the ray from the model's centre along unit
   * `dir` with any of its faces (Moller-Trumbore), in model units; 0 when
   * the ray crosses none. Once per outwork try, and the result is cached
   * with the outworks, so the cost is paid once per port. */
  function hullReach(hull, dir) {
    var best = 0, f = hull.f, v = hull.v;
    for (var i = 0; i < f.length; i++) {
      var a = v[f[i][0]], b = v[f[i][1]], c = v[f[i][2]];
      var e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      var pv = vcross(dir, e2);
      var det = e1[0] * pv[0] + e1[1] * pv[1] + e1[2] * pv[2];
      if (Math.abs(det) < 1e-12) continue;
      var inv = 1 / det, tv = [-a[0], -a[1], -a[2]];
      var u = (tv[0] * pv[0] + tv[1] * pv[1] + tv[2] * pv[2]) * inv;
      if (u < 0 || u > 1) continue;
      var qv = vcross(tv, e1);
      var w = (dir[0] * qv[0] + dir[1] * qv[1] + dir[2] * qv[2]) * inv;
      if (w < 0 || u + w > 1) continue;
      var t = (e2[0] * qv[0] + e2[1] * qv[1] + e2[2] * qv[2]) * inv;
      if (t > best) best = t;
    }
    return best;
  }

  function stationOutworks(port, model) {
    var key = model + '|' + port.id;
    if (port._outworks && port._outworks.key === key) return port._outworks.mesh;
    var hull = stationMeshes()[model];
    if (!hull) { var lp = libPort(model); hull = lp && lp.shell; }
    if (!hull || !hull.v || !hull.v.length) return null;   // not loaded yet
    if (!RNG) return null;

    var R = 0;
    for (var i = 0; i < hull.v.length; i++) R = Math.max(R, vlen(hull.v[i]));

    /* Every berth's way in, as (door, direction) pairs to keep clear of. */
    var keepOut = [];
    var Gen = global.Gen;
    var nb = (Gen && Gen.modelledBerths && Gen.modelledBerths(port)) || [];
    for (var b = 0; b < nb.length; b++) {
      var ap = Gen.berthApertures(port, b);
      if (!ap || !ap.mid) continue;
      var dir = ap.entry || ap.normal;
      keepOut.push({ door: [ap.mid[0] + ap.normal[0] * (ap.gate || 0),
                            ap.mid[1] + ap.normal[1] * (ap.gate || 0),
                            ap.mid[2] + ap.normal[2] * (ap.gate || 0)], dir: vnorm(dir) });
    }
    function clear(p) {
      for (var k = 0; k < keepOut.length; k++) {
        var ko = keepOut[k];
        var d = [p[0] - ko.door[0], p[1] - ko.door[1], p[2] - ko.door[2]];
        var dl = vlen(d);
        if (dl < 0.45) return false;
        if ((d[0] * ko.dir[0] + d[1] * ko.dir[1] + d[2] * ko.dir[2]) / dl > 0.766) return false;   // cos 40°
      }
      return true;
    }

    var rng = new RNG('outworks|' + port.name + '|' + port.id + '|' + model);
    var role = (port.market && port.market.role) || 'orbital';
    var menu = OUTWORK_MENU[role] || OUTWORK_MENU.orbital;
    var want = 2 + rng.int(0, 2);
    var mesh = emptyMesh(); mesh.c = [];
    var placed = [], ties = [];
    for (var tries = 0; tries < 60 && placed.length < want; tries++) {
      /* A direction on the sphere, then a distance just off the hull. */
      var zz = rng.range(-0.8, 0.8), th = rng.range(0, Math.PI * 2), rr = Math.sqrt(1 - zz * zz);
      var out = [rr * Math.cos(th), rr * Math.sin(th), zz];
      /* HOW FAR THE HULL REACHES THIS WAY, not how far its furthest
       * corner reaches any way. Astra, 2026-11-03, a tank farm hanging in
       * space on two trusses that stopped short of everything: "what is
       * this floating in space unconnected to anything?" The distance and
       * the tether were both measured off R, the radius of the model's
       * furthest vertex — right for a round hub, and wrong by most of the
       * station for a long one: off the flank of a spine or a yard the
       * hull is a fraction of R away, so the outwork stood out at 1.2-1.5
       * R and its truss ended at 0.92 R, in empty space. So ask the mesh:
       * the outermost face the ray from the centre crosses in this
       * direction (`hullReach`), and stand off THAT. A direction that
       * crosses no face (a gap between arms) has nothing to tie to and is
       * skipped. The same draws in the same order, so each port keeps the
       * kinds it had; only where they stand changes. */
      var stand = rng.range(1.18, 1.55);
      var reach = hullReach(hull, out);
      if (!(reach > 0)) continue;
      var dist = reach * stand + 0.12;
      var p = [out[0] * dist, out[1] * dist, out[2] * dist];
      if (!clear(p)) continue;
      var crowded = false;
      for (var q = 0; q < placed.length; q++) {
        var dq = [p[0] - placed[q][0], p[1] - placed[q][1], p[2] - placed[q][2]];
        if (vlen(dq) < 0.5) { crowded = true; break; }
      }
      if (crowded) continue;
      placed.push(p);
      ties.push({ dir: out, dist: dist, reach: reach, inner: reach * 0.97 - 0.04, R: R });
      var az = vnorm(out);
      var ref = Math.abs(az[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
      var ax = vnorm(vcross(ref, az)), ay = vcross(az, ax);
      mergeAxes(mesh, outworkPart(rng.pick(menu), rng), p, ax, ay, az);
      /* The tether: a truss from the outwork back to just inside the
       * hull's outer reach, so it reads as attached rather than parked. */
      var tl = (dist - reach * 0.97) / 2;
      mergeAxes(mesh, box(0.006, 0.006, tl),
                [out[0] * (dist - tl - 0.04), out[1] * (dist - tl - 0.04), out[2] * (dist - tl - 0.04)],
                ax, ay, az, OUT_TRUSS);
    }
    port._outworks = { key: key, mesh: mesh, ties: ties };
    return mesh;
  }

  function drawStationOutworks(ctx, cam, frame, port, model, radiusKm, sunDir) {
    var mesh = stationOutworks(port, model);
    if (!mesh || !mesh.f.length) return;
    mesh = accented(mesh);
    if (gpuWorld() && global.GLWorld.queueMesh(cam, frame, mesh, radiusKm, sunDir)) return;
    paintMesh(ctx, cam, frame, mesh, radiusKm, sunDir, OUT_PLATE);
  }

  /* ---- THE CUT FACE: what the beam went through ------------------------
   *
   * Astra: "make the cut look like it's slicing through sections of cable
   * and panels as well, so it looks like a laser literally CUT AWAY the
   * station bit that you're looking through" — "use greeblies and
   * scaffolding for that effect".
   *
   * The shader opens the hole; this furnishes its edge. A station's plates
   * are a skin with nothing behind them, so a clean cut through one is a
   * paper-thin line, and that is what makes it read as a rendering trick
   * rather than as metal that was there and has been burnt away. What sells
   * a cutaway drawing is the INSIDE of the wall: layered plate, cable runs
   * sheared off, the frame the plating hung on.
   *
   * WHERE THE EDGE IS, found rather than guessed. The cut's boundary is the
   * cone's surface, so CUT_RAYS lines are run down that surface from the
   * eye's end to the ship's, and every station triangle one of them
   * crosses is a place the beam went through a wall. That is where a site
   * goes. A line that crosses a plate nearly edge-on — a floor running
   * along the line of sight — is skipped, for the same reason the shader
   * skips its band there: the cut runs ALONG that surface, not through it,
   * and stubs sticking out of it would line the floor like a runway.
   *
   * ONLY ON THE GPU. The geometry is ordinary boxes, but the hole they sit
   * round only exists in the fragment shader; on the 2D renderer there is
   * no hole and these would be cables hanging in a wall.
   *
   * COST. The triangle list is flattened once per model. A rebuild is
   * CUT_RAYS segment casts against the triangles inside the cone's box, and
   * happens only when the cone has moved by more than CUT_REBUILD of its own
   * length — so zooming rebuilds a few times a second and a parked camera
   * never does. The old mesh's buffers are handed back to the card on every
   * rebuild (GL.releaseMesh), so a long zoom does not leak video memory. */
  var CUT_RAYS = 48;
  /* Where along the cone the edge starts being furnished. The eye's end of
   * the cut is beside or behind the lens: a site there is either off the
   * screen or a glowing block the size of the screen (measured — the first
   * pass filled a corner with them). Starting a third of the way down also
   * shrinks the box the triangles are filtered against, which is most of
   * the rebuild's cost. */
  var CUT_FROM = 0.5;
  var CUT_PER_RAY = 6;         // walls one line may cross before we stop caring
  var CUT_MAX_SITES = 200;
  var CUT_FAR = 3;             // station radii, eye to ship
  var CUT_REBUILD = 0.015;     // of the eye-to-ship distance
  var CUT_TRIS = {};
  var CUT_LAST = { key: null, mesh: null };

  var CUT_PLATE = ['#6b7480', '#4a515c', '#8a929c', '#5d6168'];
  var CUT_CABLE = ['#c0392b', '#e2b714', '#2e6fd8', '#2c9e4b', '#1c1c1c', '#d07a2a'];
  var CUT_FRAME = '#9aa1a8';
  var CUT_HOT = '!#ff7a1a';    // the lip, still glowing
  var CUT_CORE = '!#ffb347';   // a severed conductor's end

  function cutTris(model) {
    if (CUT_TRIS[model]) return CUT_TRIS[model];
    var lib = libPort(model);
    if (!lib) return null;                 // procedural, or not loaded yet: ask again
    var P = [], N = [], keys = ['shell', 'interior', 'spin'];
    for (var k = 0; k < keys.length; k++) {
      var m = lib[keys[k]];
      if (!m || !m.f || !m.v) continue;
      for (var i = 0; i < m.f.length; i++) {
        var tri = m.f[i];
        for (var j = 1; j + 1 < tri.length; j++) {
          var a = m.v[tri[0]], b = m.v[tri[j]], c = m.v[tri[j + 1]];
          if (!a || !b || !c) continue;
          var ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
          var wx = c[0] - a[0], wy = c[1] - a[1], wz = c[2] - a[2];
          var nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
          var nl = Math.sqrt(nx * nx + ny * ny + nz * nz);
          if (!(nl > 1e-14)) continue;
          P.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
          N.push(nx / nl, ny / nl, nz / nl);
        }
      }
    }
    if (!N.length) return null;
    CUT_TRIS[model] = { p: new Float32Array(P), n: new Float32Array(N), count: N.length / 3 };
    return CUT_TRIS[model];
  }

  /* Where along o + d*t, 0 < t < 1, the segment meets triangle `i`, or -1.
   * Möller–Trumbore, both faces — the art's winding is not to be trusted. */
  function cutHit(T, i, o, d) {
    var p = T.p, b = i * 9;
    var ax = p[b], ay = p[b + 1], az = p[b + 2];
    var e1x = p[b + 3] - ax, e1y = p[b + 4] - ay, e1z = p[b + 5] - az;
    var e2x = p[b + 6] - ax, e2y = p[b + 7] - ay, e2z = p[b + 8] - az;
    var px = d[1] * e2z - d[2] * e2y, py = d[2] * e2x - d[0] * e2z, pz = d[0] * e2y - d[1] * e2x;
    var det = e1x * px + e1y * py + e1z * pz;
    if (Math.abs(det) < 1e-18) return -1;
    var inv = 1 / det;
    var tx = o[0] - ax, ty = o[1] - ay, tz = o[2] - az;
    var u = (tx * px + ty * py + tz * pz) * inv;
    if (u < 0 || u > 1) return -1;
    var qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x;
    var v = (d[0] * qx + d[1] * qy + d[2] * qz) * inv;
    if (v < 0 || u + v > 1) return -1;
    var t = (e2x * qx + e2y * qy + e2z * qz) * inv;
    return (t > 0 && t < 1) ? t : -1;
  }

  function v3add(a, b, k) { return [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k]; }
  function v3sc(a, k) { return [a[0] * k, a[1] * k, a[2] * k]; }
  function v3dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function v3cross(a, b) {
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  }
  function v3norm(a) {
    var l = Math.sqrt(v3dot(a, a));
    return l > 1e-14 ? [a[0] / l, a[1] / l, a[2] / l] : null;
  }

  /* One place the beam went through a wall. P is on the wall, n is the
   * wall's normal, e runs along the cut, inw points into the hole, s is
   * the site's scale and halfE half its share of the cut's length. */
  function cutSite(mesh, P, n, e, inw, s, halfE, rng, scaffold) {
    var i;
    /* The lip: a strip of plate still glowing where the beam left it. */
    addBox(mesh, v3add(P, inw, 0.08 * s), v3sc(e, halfE), v3sc(n, 0.14 * s),
           v3sc(inw, 0.08 * s), CUT_HOT);
    /* The wall in section: two or three skins of plate, each sheared at a
     * different depth, so the edge is ragged instead of ruled. */
    var layers = rng.int(2, 3);
    for (i = 0; i < layers; i++) {
      var off = (i - (layers - 1) / 2) * 0.45 * s;
      var out = rng.range(0.2, 1.1) * s;
      var w = halfE * rng.range(0.5, 1.0);
      var base = v3add(v3add(P, n, off), e, rng.range(-0.3, 0.3) * halfE);
      addBox(mesh, v3add(base, inw, out * 0.5), v3sc(e, w), v3sc(n, 0.07 * s),
             v3sc(inw, out * 0.5), rng.pick(CUT_PLATE));
      addBox(mesh, v3add(base, inw, out), v3sc(e, w), v3sc(n, 0.075 * s),
             v3sc(inw, 0.04 * s), CUT_HOT);
    }
    /* Cable runs, cut off where they crossed the beam: insulation in the
     * colours a loom actually comes in, and a hot copper end on each. */
    var nc = rng.int(2, 5);
    for (i = 0; i < nc; i++) {
      var at = v3add(v3add(P, e, rng.range(-0.8, 0.8) * halfE), n, rng.range(-0.5, 0.5) * s);
      var dir = v3norm(v3add(v3add(inw, e, rng.range(-0.35, 0.35)), n, rng.range(-0.35, 0.35)));
      if (!dir) continue;
      var side = v3norm(v3cross(dir, n)) || e;
      var side2 = v3cross(dir, side);
      var len = rng.range(0.5, 2.4) * s, th = rng.range(0.05, 0.11) * s;
      addBox(mesh, v3add(at, dir, len * 0.5), v3sc(dir, len * 0.5), v3sc(side, th),
             v3sc(side2, th), rng.pick(CUT_CABLE));
      addBox(mesh, v3add(at, dir, len), v3sc(dir, th * 0.6), v3sc(side, th * 0.8),
             v3sc(side2, th * 0.8), CUT_CORE);
    }
    /* And every so often the frame the plating hung on: two rails along the
     * cut, standing proud of the lip on struts, with a brace across. */
    if (scaffold) {
      var reach = rng.range(0.9, 1.6) * s, bar = 0.06 * s;
      for (var sd = -1; sd <= 1; sd += 2) {
        addBox(mesh, v3add(v3add(P, n, sd * 0.6 * s), inw, reach), v3sc(e, halfE),
               v3sc(n, bar), v3sc(inw, bar), CUT_FRAME);
        for (var qq = -1; qq <= 1; qq += 2) {
          addBox(mesh, v3add(v3add(v3add(P, e, qq * halfE * 0.8), n, sd * 0.6 * s), inw, reach * 0.5),
                 v3sc(e, bar), v3sc(n, bar), v3sc(inw, reach * 0.5), CUT_FRAME);
        }
      }
      var diag = v3norm(v3add(v3sc(e, halfE * 1.6), n, 1.2 * s));
      if (diag) {
        var dl = Math.sqrt(halfE * halfE * 2.56 + 1.44 * s * s) * 0.5;
        addBox(mesh, v3add(P, inw, reach), v3sc(diag, dl),
               v3sc(inw, bar), v3sc(v3norm(v3cross(diag, inw)) || n, bar), CUT_FRAME);
      }
    }
  }

  /* The greeble mesh for a cut, in MODEL units. S and E are the ship and
   * the eye, rS and rE the cone's radius at each, `metre` one metre. */
  function cutGreebleMesh(model, S, E, rS, rE, metre) {
    var A = [S[0] - E[0], S[1] - E[1], S[2] - E[2]];
    var L = Math.sqrt(v3dot(A, A));
    if (!(L > 1e-9)) return null;
    var q = Math.max(L * CUT_REBUILD, metre * 2);
    var key = [model, Math.round(E[0] / q), Math.round(E[1] / q), Math.round(E[2] / q),
               Math.round(S[0] / q), Math.round(S[1] / q), Math.round(S[2] / q),
               Math.round(rE / q), Math.round(L / q)].join('|');
    if (CUT_LAST.key === key) return CUT_LAST.mesh;
    /* NOTHING TO FURNISH FROM FAR AWAY. Past a few station radii the cut
     * edge is a few pixels across, and the cone is wide enough to take in
     * the whole station — measured on the RX 540, a rebuild out there cast
     * against every triangle in the model and took 277 ms. The hole is
     * still cut; it just stops being dressed. */
    if (L > CUT_FAR) return null;
    var T = cutTris(model);
    if (!T) return null;
    var clock = (typeof performance !== 'undefined') ? performance : Date;
    var t0 = clock.now();

    /* Furnish only from CUT_FROM down to the ship: move the start there. */
    E = v3add(E, A, CUT_FROM);
    rE = rE + (rS - rE) * CUT_FROM;
    A = [S[0] - E[0], S[1] - E[1], S[2] - E[2]];
    L = Math.sqrt(v3dot(A, A));
    var ax = v3sc(A, 1 / L);
    var a = v3norm(Math.abs(ax[0]) < 0.9 ? v3cross(ax, [1, 0, 0]) : v3cross(ax, [0, 1, 0]));
    var b = v3cross(ax, a);

    /* Only the triangles inside the cone's box are worth casting against. */
    var lo = [], hi = [], k, i;
    for (k = 0; k < 3; k++) {
      lo[k] = Math.min(E[k] - rE, S[k] - rS);
      hi[k] = Math.max(E[k] + rE, S[k] + rS);
    }
    var cand = [];
    for (i = 0; i < T.count; i++) {
      var o9 = i * 9, out = false;
      for (k = 0; k < 3; k++) {
        var p0 = T.p[o9 + k], p1 = T.p[o9 + 3 + k], p2 = T.p[o9 + 6 + k];
        if (Math.max(p0, p1, p2) < lo[k] || Math.min(p0, p1, p2) > hi[k]) { out = true; break; }
      }
      if (!out) cand.push(i);
    }

    var mesh = emptyMesh(); mesh.c = [];
    var sites = 0;
    for (var r = 0; r < CUT_RAYS && sites < CUT_MAX_SITES; r++) {
      var th = (r + 0.5) / CUT_RAYS * Math.PI * 2;
      var u = v3add(v3sc(a, Math.cos(th)), b, Math.sin(th));
      var o = v3add(E, u, rE);
      var d = v3add(v3sub3(S, o), u, rS);
      var hits = [];
      for (var c = 0; c < cand.length; c++) {
        var t = cutHit(T, cand[c], o, d);
        if (t > 0) hits.push([t, cand[c]]);
      }
      /* Nearest the ship first: that end of the cut is what is framed
       * round the hull, and the eye's end is mostly off the screen. */
      hits.sort(function (x, y) { return y[0] - x[0]; });
      for (var h = 0; h < hits.length && h < CUT_PER_RAY && sites < CUT_MAX_SITES; h++) {
        var tt = hits[h][0], ti = hits[h][1];
        var n = [T.n[ti * 3], T.n[ti * 3 + 1], T.n[ti * 3 + 2]];
        if (Math.abs(v3dot(n, u)) > 0.8) continue;          // the cut runs along it
        var e = v3norm(v3cross(n, u));
        if (!e) continue;
        var rLocal = rE + (rS - rE) * tt;
        var s = Math.max(metre * 1.5, Math.min(metre * 18, rLocal * 0.08));
        var halfE = Math.min(Math.PI * rLocal / CUT_RAYS, s * 6);
        var rng = new RNG('cut|' + model + '|' + r + '|' + h);
        cutSite(mesh, v3add(o, d, tt), n, e, v3sc(u, -1), s, halfE, rng, r % 3 === 0);
        sites++;
      }
    }
    if (CUT_LAST.mesh && global.GLWorld && global.GLWorld.releaseMesh) {
      global.GLWorld.releaseMesh(CUT_LAST.mesh);
    }
    CUT_LAST = { key: key, mesh: mesh, sites: sites, cand: cand.length,
                 ms: clock.now() - t0, faces: mesh.f.length };
    return mesh;
  }
  function v3sub3(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }

  /* `cut` is { pos, eye (world km), rShip, rEye (km) } — the same cone the
   * shader is cutting with this frame. */
  function drawCutGreebles(ctx, cam, frame, model, radiusKm, sunDir, cut) {
    if (!cut || !gpuWorld() || !(radiusKm > 0)) return;
    function local(p) {
      var rx = p.x - frame.pos.x, ry = p.y - frame.pos.y, rz = p.z - frame.pos.z;
      return [(rx * frame.right.x + ry * frame.right.y + rz * frame.right.z) / radiusKm,
              (rx * frame.up.x + ry * frame.up.y + rz * frame.up.z) / radiusKm,
              (rx * frame.fwd.x + ry * frame.fwd.y + rz * frame.fwd.z) / radiusKm];
    }
    var mesh = cutGreebleMesh(model, local(cut.pos), local(cut.eye),
                              cut.rShip / radiusKm, cut.rEye / radiusKm, 0.001 / radiusKm);
    if (mesh && mesh.f.length) global.GLWorld.queueMesh(cam, frame, mesh, radiusKm, sunDir);
  }

  /* ---- THE GROUND-PORT SECTION'S WALLS ------------------------------------
   *
   * main.js's groundConeFor decides the cone; the shaders take out what is
   * inside it; this draws what a cut through the ground would actually
   * show. The planet is an analytic sphere and the town is a few boxes —
   * there is no ground under the street to reveal, so the cut faces are
   * built here.
   *
   * THE PIT WALL IS THE CONE'S OWN SURFACE (2026-11-02, second round). The
   * first version was a box — two sides, a back and a floor — and from
   * the air it read as a trench with a grey disc of open hole beside it.
   * Astra wanted the walls "along the cone drawn from the center of the
   * radial camera out to the edge of the screen", which is what a cone
   * round the line from the eye to her looks like from the eye: its
   * surface runs from the ship at the middle of the picture out past every
   * edge. So the wall is that surface, wherever it is in the ground —
   * clipped at the street, and left out where the cone runs through open
   * air in the bay (the room and the shaft, from the same table the port's
   * mesh is built from) so it is never painted across a room you should
   * see into. Its far end, just past her, is capped, so a ray that goes
   * down the cone and past her meets rock rather than open sky.
   *
   * IN LAYERS, top down, because that is the whole of what makes a section
   * read as one: road, paving, the street's concrete slab, a services
   * course, fill, and then rock in beds that thicken with depth. The bed
   * boundaries are cut across the cone as horizontal planes, so the strata
   * run level round the pit whichever way the cone leans. Thicknesses are
   * in metres, so a big port and a small one cut through the same street.
   * Flat colours, no lamp, no glow — this is a drawing of the ground, not
   * a light in it. (The box had pipe ends in its services course; a cone's
   * wall is curved and they are left out.) */
  /* THE NUMBERS NOW LIVE IN THE SHADER (fourth round): the bands above —
   * road 0.35 m, paving 0.25, slab 1.2, services 1.6, fill 3.0 — and the
   * beds below them, 5 m thickening by 1.22 a bed to at most 60 m, are
   * FRAG_WALL's table in gl.js, folded 22 m on a 140 m wavelength and
   * eased in over the first 40 m. Only what the CPU still needs is here. */
  var SECTION_DIP = 0.09;              // the beds' tilt, rise per run (about 5 degrees)
  var SECTION_BOWL_KM = 2.5;           // the least radius of the rock round the pit

  /* A small deterministic hash of the port's id, for the beds' tilt and
   * undulation: the same port shows the same rock every visit (doctrine 1),
   * and nothing here draws from any generator stream (doctrine 2). */
  function sectionHash(str, k) {
    var h = 2166136261 ^ k;
    str = String(str);
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return ((h >>> 0) % 100000) / 100000;
  }
  /* A rock colour nudged per bed, warmer or cooler, lighter or darker. */
  function bedColour(hex, seed, k) {
    var n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    var light = 0.86 + 0.28 * sectionHash(seed, 101 + k * 7);
    var warm = (sectionHash(seed, 211 + k * 13) - 0.5) * 18;
    var c = function (x) { return Math.max(0, Math.min(255, Math.round(x))); };
    return '#' + ((1 << 24) | (c(r * light + warm) << 16) | (c(g * light) << 8) | c(b * light - warm)).toString(16).slice(1);
  }

  /* THE THIRD ROUND (2026-11-02). Level beds on a cone, seen down the
   * cone's own axis, are concentric rings round her — and with the 48
   * facets lit one by one, a cartoon tunnel: rings and spokes. Astra and
   * the coordinator both read it as a vortex. So the wall shaded smoothly,
   * its beds dipped and folded per port with each bed's colour nudged, the
   * cone stopped growing where main.js caps it (sc.rCap), and the black cap
   * past her gave way to a bowl of rock.
   *
   * THE FOURTH ROUND, the same day: none of that is built here any more.
   * Built in JS, the wall was ~10,000 quads remade whenever the eye moved
   * — 7 to 22 ms a frame while orbiting, measured — on a CPU the trajectory
   * predictor already spends. The wall is now one unit grid uploaded once,
   * placed by GLWorld's wall shader from the uniforms sectionWall works
   * out below (a few vector products a frame), with the street, the bay's
   * air and the beds all decided per fragment there. What is left here is
   * the bowl, which only moves when she does or the boom changes size by
   * a quarter, and so is rebuilt almost never. */
  var SECTION_BOWL_LAST = { key: null, mesh: null };

  /* The wall's uniforms, for GLWorld.queueGroundWall. World km, unit
   * vectors; see the long note over that function for each field. */
  function sectionWall(sc, sunDir) {
    var ship = sc.shipW, eye = sc.eyeW;
    if (!ship || !eye) return null;
    var ax = V.sub(ship, eye), L = V.len(ax);
    if (!(L > 1e-9)) return null;
    ax = V.scale(ax, 1 / L);
    var h = Math.abs(V.dot(ax, sc.up)) < 0.9 ? sc.up : sc.east;
    var p1 = V.norm(V.cross(ax, h)), p2 = V.cross(ax, p1);
    var dipA = sectionHash(sc.seed, 1) * Math.PI * 2;
    return {
      ship: ship, entrance: sc.entrance, east: sc.east, north: sc.north, up: sc.up,
      p1: p1, p2: p2, rShip: sc.rShip * sc.r, rEye: sc.rEye * sc.r,
      cap: sc.rCap > 0 ? sc.rCap * sc.r : 0, r: sc.r,
      room: sc.room, lift: sc.lift || 0, duct: sc.duct,
      shipXY: [sc.ship[0] * sc.r * 1000, sc.ship[1] * sc.r * 1000],
      seed: sectionHash(sc.seed, 0) * 1000,
      dip: [Math.cos(dipA) * SECTION_DIP, Math.sin(dipA) * SECTION_DIP],
      ph: [sectionHash(sc.seed, 2) * 6.283, sectionHash(sc.seed, 3) * 6.283, sectionHash(sc.seed, 4) * 6.283],
      sun: sunDir || { x: 0, y: 0, z: 1 },
      planet: sc.planetW ? { pos: sc.planetW, radius: sc.planetKm } : null,
      rim: sc.rim || 0
    };
  }

  /* The bowl of rock the pit is set in: a hemisphere under the street,
   * centred under her, normals inward, sunk with the planet's curve (a bowl
   * whose rim sat on the flat street plane stood out of the ground
   * kilometres off as a dark ring round the horizon, 8 km out over
   * Ashford). Anything that misses the wall, the room and the shaft meets
   * rock rather than the sky; up stays open. Its radius is the eye's whole
   * reach and then some, in steps of a quarter, so a wheel of the zoom
   * rebuilds it only now and then. */
  function sectionBowl(sc) {
    var m = 0.001 / sc.r, S = sc.ship;
    var L = Math.sqrt(Math.pow(S[0] - sc.eye[0], 2) + Math.pow(S[1] - sc.eye[1], 2) + Math.pow(S[2] - sc.eye[2], 2));
    var want = Math.max(SECTION_BOWL_KM, (L * sc.r) * 1.6 + 0.4);
    var Rkm = SECTION_BOWL_KM * Math.pow(1.25, Math.ceil(Math.log(want / SECTION_BOWL_KM) / Math.log(1.25)));
    var key = [S[0], S[1], S[2]].map(function (v) { return Math.round(v / 0.002); }).join('|') +
              '|' + Rkm.toFixed(3) + '|' + sc.r + '|' + sc.seed;
    if (SECTION_BOWL_LAST.key === key) return SECTION_BOWL_LAST.mesh;
    var Rb = Rkm / sc.r, lat = 12, lon = 48, rows = [], col = bedColour('#555048', sc.seed, 99);
    var mesh = { v: [], f: [], c: [], vn: [], noAccent: true };
    for (var la = 0; la <= lat; la++) {
      var ph = la / lat * Math.PI / 2, cph = Math.cos(ph), sph = Math.sin(ph), row = [];
      for (var lo = 0; lo < lon; lo++) {
        var tl = lo / lon * Math.PI * 2, dir = [cph * Math.cos(tl), cph * Math.sin(tl), -sph];
        var sag = (cph * Rb) * (cph * Rb) / (2 * (sc.planetR || 1e9)) * 1.1 + 2 * m;
        row.push({ p: [S[0] + dir[0] * Rb, S[1] + dir[1] * Rb, -sph * Rb - sag], n: [-dir[0], -dir[1], -dir[2]] });
      }
      rows.push(row);
    }
    for (la = 0; la < lat; la++) {
      for (lo = 0; lo < lon; lo++) {
        var a = rows[la][lo], b = rows[la + 1][lo], c = rows[la + 1][(lo + 1) % lon], d = rows[la][(lo + 1) % lon];
        var o = mesh.v.length;
        mesh.v.push(a.p, b.p, c.p, d.p); mesh.vn.push(a.n, b.n, c.n, d.n);
        mesh.f.push([o, o + 1, o + 2], [o, o + 2, o + 3]); mesh.c.push(col, col);
      }
    }
    if (SECTION_BOWL_LAST.mesh && global.GLWorld && global.GLWorld.releaseMesh) {
      global.GLWorld.releaseMesh(SECTION_BOWL_LAST.mesh);
    }
    SECTION_BOWL_LAST = { key: key, mesh: mesh };
    return mesh;
  }

  /* `sc` is G.cutaway.section from main.js's groundConeFor: the ground
   * frame (east, north, up) and the street at the shaft mouth. */
  function drawGroundSection(ctx, cam, sc, sunDir) {
    if (!sc || !gpuWorld()) return;
    var bowl = sectionBowl(sc);
    var frame = { pos: sc.entrance, right: sc.east, up: sc.north, fwd: sc.up };
    if (bowl && bowl.f.length) global.GLWorld.queueMesh(cam, frame, bowl, sc.r, sunDir);
    if (global.GLWorld.queueGroundWall) global.GLWorld.queueGroundWall(cam, sectionWall(sc, sunDir));
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
  /* A force-field panel, rebuilt as two sliding door leaves (2026-10-20).
   * Measured in the berth's own frame (berthBasis): the panel's extent
   * across the opening on both axes and through it. The leaves split the
   * WIDER axis, so a wide bay gets doors that part sideways and a tall one
   * doors that part top and bottom — and each travels its own width. */
  var FIELD_DOOR_BODY = '#5b6068';
  var FIELD_DOOR_STRIPE = '#d9a521';
  var FIELD_DOOR_MIN_THICK = 0.003;      // station radii; a field was a plane
  function fieldToDoors(verts, faces, box, berth) {
    var n0 = berth.normal, nl = Math.sqrt(dot3(n0, n0)) || 1;
    var n = [n0[0] / nl, n0[1] / nl, n0[2] / nl];
    var B = berthBasis(n0), m = berth.mid;
    var lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (var fi = 0; fi < faces.length; fi++) {
      for (var k = 0; k < faces[fi].length; k++) {
        var p = verts[faces[fi][k]];
        var d = [p[0] - m[0], p[1] - m[1], p[2] - m[2]];
        var c = [dot3(d, B[0]), dot3(d, B[1]), dot3(d, n)];
        for (var a = 0; a < 3; a++) { if (c[a] < lo[a]) lo[a] = c[a]; if (c[a] > hi[a]) hi[a] = c[a]; }
      }
    }
    if (!isFinite(lo[0])) return [];
    /* THE PANEL'S OWN PLANE. A field across a berth's mouth is thin along
     * the berth normal; a hall gate inside the station (the big skimmers'
     * `hallGateForceField`) can stand at right angles to it. So the thin
     * axis of the three is the panel's normal, the wider of the other two
     * is the one the leaves part along, and a panel that is not across its
     * berth's mouth is an internal door — it opens with the station, not
     * with one berth's clearance, the same as the cradle's liftWell gate. */
    var axes = [B[0], B[1], n];
    var ext = [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]];
    var thin = ext[0] <= ext[1] ? (ext[0] <= ext[2] ? 0 : 2) : (ext[1] <= ext[2] ? 1 : 2);
    var inPlane = [0, 1, 2].filter(function (q) { return q !== thin; });
    var split = ext[inPlane[0]] >= ext[inPlane[1]] ? inPlane[0] : inPlane[1];
    var keep = split === inPlane[0] ? inPlane[1] : inPlane[0];
    var mouth = thin === 2;
    var midS = (lo[split] + hi[split]) / 2;
    var wMid = (lo[thin] + hi[thin]) / 2;
    var thick = Math.max(ext[thin], FIELD_DOOR_MIN_THICK);
    function toWorld(s, t, w) {
      var u = [0, 0, 0];
      u[split] = s; u[keep] = t; u[thin] = w;
      return [m[0] + axes[0][0] * u[0] + axes[1][0] * u[1] + axes[2][0] * u[2],
              m[1] + axes[0][1] * u[0] + axes[1][1] * u[1] + axes[2][1] * u[2],
              m[2] + axes[0][2] * u[0] + axes[1][2] * u[1] + axes[2][2] * u[2]];
    }
    function slab(mesh, s0, s1, t0, t1, w0, w1, col) {
      var base = mesh.v.length;
      var corners = [[s0, t0, w0], [s1, t0, w0], [s1, t1, w0], [s0, t1, w0],
                     [s0, t0, w1], [s1, t0, w1], [s1, t1, w1], [s0, t1, w1]];
      corners.forEach(function (q) { mesh.v.push(toWorld(q[0], q[1], q[2])); });
      [[0, 1, 2], [0, 2, 3], [4, 6, 5], [4, 7, 6], [0, 4, 5], [0, 5, 1],
       [3, 2, 6], [3, 6, 7], [0, 3, 7], [0, 7, 4], [1, 5, 6], [1, 6, 2]].forEach(function (f) {
        mesh.f.push([f[0] + base, f[1] + base, f[2] + base]);
        mesh.c.push(col);
      });
    }
    var out = [];
    var w0 = wMid - thick / 2, w1 = wMid + thick / 2;
    var seam = Math.min(0.06 * (hi[split] - lo[split]) / 2, 0.004);
    [[lo[split], midS, -1, 'L'], [midS, hi[split], 1, 'R']].forEach(function (h) {
      var mesh = { v: [], f: [], c: [] };
      slab(mesh, h[0], h[1], lo[keep], hi[keep], w0, w1, FIELD_DOOR_BODY);
      /* A hazard stripe down the meeting edge, so the seam reads as a door. */
      var e0 = h[2] < 0 ? h[1] - seam : h[0], e1 = h[2] < 0 ? h[1] : h[0] + seam;
      slab(mesh, e0, e1, lo[keep], hi[keep], w0 - thick * 0.15, w1 + thick * 0.15, FIELD_DOOR_STRIPE);
      var dir = axes[split];
      var lmin = [Infinity, Infinity, Infinity], lmax = [-Infinity, -Infinity, -Infinity];
      mesh.v.forEach(function (q) {
        for (var a2 = 0; a2 < 3; a2++) { if (q[a2] < lmin[a2]) lmin[a2] = q[a2]; if (q[a2] > lmax[a2]) lmax[a2] = q[a2]; }
      });
      out.push({
        node: box.node + '#' + h[3],
        mesh: mesh,
        box: { node: box.node + '#' + h[3], min: lmin, max: lmax,
               mid: [(lmin[0] + lmax[0]) / 2, (lmin[1] + lmax[1]) / 2, (lmin[2] + lmax[2]) / 2] },
        axis: [dir[0] * h[2], dir[1] * h[2], dir[2] * h[2]],
        travel: h[1] - h[0],
        field: false, generated: true,
        berthMid: mouth ? berth.mid : null
      });
    });
    return out;
  }

  function extrasByName(role) {
    var raw = global.PortLib && global.PortLib[role];
    var out = {};
    var ex = raw && raw.extras;
    if (ex) for (var i = 0; i < ex.length; i++) if (ex[i] && ex[i].name) out[ex[i].name] = ex[i].data || {};
    return out;
  }

  /* How many faces the aperture cut removed, per role. Read by
   * berths.test.js: a cut that quietly stops finding anything is a
   * sealed station that still passes every other check. */
  var CUT_COUNT = {};
  var OPEN_BUCKET = {};
  var APERTURE_SLAB = 0.08;          // port radii either side of the leaf plane
  var SHELL_CUT_INSET = 0.88;        // of the clear opening — see corridorBox

  /* ---- A BERTH'S OWN FRAME ------------------------------------------------
   * The two axes across a doorway, for a berth facing `n`.
   *
   * This used to be implicit: every berth in the library faced along a
   * world axis, so "across the opening" meant "the other two world axes"
   * and everything here worked component-wise. The 2026-09-21 cylinder
   * broke that — its bays ring the bore at every bearing, so twelve berths
   * face twelve directions and none of them is an axis. Measured: all
   * eighteen of its leaves reported "does not move", because the slide
   * picked among world axes that were no longer across the door.
   *
   * CHOSEN SO AN AXIS-ALIGNED BERTH GETS WORLD AXES BACK EXACTLY. The first
   * axis is the world axis least aligned with n, with n taken out of it;
   * for n = ±x that is y untouched, and the second is n × e1 = ±z. So every
   * berth the old component-wise code handled is handled here with the
   * same numbers, and the new ones get a real frame. */
  function berthBasis(n0) {
    /* The stored normal is rounded to three places, so it is a shade off
     * unit length; normalise it or e2 inherits the error. */
    var nl = Math.sqrt(n0[0] * n0[0] + n0[1] * n0[1] + n0[2] * n0[2]) || 1;
    var n = [n0[0] / nl, n0[1] / nl, n0[2] / nl];
    var ax = [Math.abs(n[0]), Math.abs(n[1]), Math.abs(n[2])];
    var k = ax[0] <= ax[1] ? (ax[0] <= ax[2] ? 0 : 2) : (ax[1] <= ax[2] ? 1 : 2);
    var w = [0, 0, 0]; w[k] = 1;
    var d = n[k];
    var e1 = [w[0] - n[0] * d, w[1] - n[1] * d, w[2] - n[2] * d];
    var l1 = Math.sqrt(e1[0] * e1[0] + e1[1] * e1[1] + e1[2] * e1[2]) || 1;
    e1 = [e1[0] / l1, e1[1] / l1, e1[2] / l1];
    var e2 = [n[1] * e1[2] - n[2] * e1[1], n[2] * e1[0] - n[0] * e1[2], n[0] * e1[1] - n[1] * e1[0]];
    /* Tidy the exact zeros back to zero, so an axis-aligned frame compares
     * equal to the world axis it is and prints without -0 noise. */
    for (var i = 0; i < 3; i++) {
      if (Math.abs(e1[i]) < 1e-12) e1[i] = 0;
      if (Math.abs(e2[i]) < 1e-12) e2[i] = 0;
    }
    return [e1, e2];
  }
  function dot3(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }

  /* Is this point inside one of the doorways? Measured in the berth's own
   * frame, so a doorway at any bearing is a doorway. */
  function inAperture(apertures, x, y, z) {
    for (var i = 0; i < apertures.length; i++) {
      var apr = apertures[i], n = apr.normal;
      var d = [x - apr.mid[0], y - apr.mid[1], z - apr.mid[2]];
      if (Math.abs(dot3(d, n) - apr.along) > APERTURE_SLAB) continue;
      var B = apr.basis, H = apr.hb;
      if (Math.abs(dot3(d, B[0])) > H[0] || Math.abs(dot3(d, B[1])) > H[1]) continue;
      return true;
    }
    return false;
  }

  /* ---- and a hole has to be a hole for a TRIANGLE, not for its centre ----
   *
   * The cut above asks whether a face's CENTRE is in the doorway, which is
   * the right question for a wall tessellated finer than the opening and
   * the wrong one for a slab. Measured: twelve of the forty-eight modelled
   * berths — all three cradles and the one spine berth that faces along
   * -y — were still sealed after the doorway was cut, and the blocker was
   * not the doorway at all. It was a single enormous interior face in
   * plating grey lying across the alcove twenty-five to fifty-five metres
   * out, a QUARTER of the way to the door, with every one of its vertices
   * outside the opening's cross-section. Its centre was nowhere near the
   * hole, so the centre test kept it; the ship flew into it anyway.
   *
   * That is the same class of bug as the original "the aperture was never
   * cut", one level down, and it needed the honest test rather than a
   * bigger slab: does this TRIANGLE touch the corridor. Separating-axis,
   * thirteen axes, against a box that runs from the parked hull's nose out
   * to the door plane — so a face is removed when a ship would hit it on
   * the way out and not otherwise. Across the whole library it removes 36
   * more faces of 53,820 and opens the last twelve berths. Thirty-six
   * faces is the measure of how little was actually wrong and how
   * completely it stopped you.
   *
   * The corridor is an axis-aligned box because every berth normal in this
   * library is axis-aligned — the same assumption inAperture already
   * states, and a constructed basis would only be a second way to get the
   * same number wrong. */
  /* TWO DEPTHS, AND THE DIFFERENCE MATTERS.
   *
   * For the INTERIOR the box runs the whole way — from the parked hull out
   * to the door — because that bucket is fittings and partitions and
   * anything of it standing in the bay is standing in the ship's way. It
   * costs nine faces on a cradle and three on a spine, which is the whole
   * of the twelve-berth bug.
   *
   * For the SHELL it is the door slab only. The shell is also what the bay
   * is MADE of: its floor, its side walls and its ceiling all sit inside
   * that same cross-section, and a full-depth cut there deleted five
   * thousand faces a model and took the room away to open the door. The
   * berth would have been flyable and no longer a place. */
  /* An ORIENTED box now, in the berth's own frame (see berthBasis): H is
   * the half-extent along e1, e2 and the normal, B those three axes. For
   * an axis-aligned berth B is three world axes and this is the box it
   * always was. */
  function corridorBox(ap, full) {
    var n = ap.normal, B = [ap.basis[0], ap.basis[1], n];
    var depth, hn;
    if (full) {
      var L = ap.along + APERTURE_SLAB;
      depth = L / 2; hn = L / 2;
    } else {
      depth = ap.along; hn = APERTURE_SLAB;
    }
    var C = [ap.mid[0] + n[0] * depth, ap.mid[1] + n[1] * depth, ap.mid[2] + n[2] * depth];
    /* A SHADE INSIDE THE CLEAR OPENING on the shell, and measured rather
     * than picked: at the full width the triangle test also takes every
     * jamb face that leans into the doorway and the cut runs to 24,500
     * faces; at 0.88 it is 15,200 and all forty-eight berths are still
     * open. The difference is the door FRAME, which is not in anybody's
     * way — the opening is hundreds of metres and the ship is twenty-five. */
    var k = full ? 1 : SHELL_CUT_INSET;
    return { C: C, H: [ap.hb[0] * k, ap.hb[1] * k, hn], B: B };
  }

  function corridorBoxes(apertures, full) {
    var out = [];
    for (var i = 0; i < apertures.length; i++) out.push(corridorBox(apertures[i], full));
    return out;
  }

  /* Triangle against an axis-aligned box, by separating axis. Nine
   * edge-cross-axis tests, three box axes, one triangle normal. */
  function triBox(a, b, c, C, H, B) {
    var v0 = [a[0] - C[0], a[1] - C[1], a[2] - C[2]];
    var v1 = [b[0] - C[0], b[1] - C[1], b[2] - C[2]];
    var v2 = [c[0] - C[0], c[1] - C[1], c[2] - C[2]];
    /* Into the box's own frame, where it IS axis-aligned. */
    if (B) {
      v0 = [dot3(v0, B[0]), dot3(v0, B[1]), dot3(v0, B[2])];
      v1 = [dot3(v1, B[0]), dot3(v1, B[1]), dot3(v1, B[2])];
      v2 = [dot3(v2, B[0]), dot3(v2, B[1]), dot3(v2, B[2])];
    }
    var e = [[v1[0] - v0[0], v1[1] - v0[1], v1[2] - v0[2]],
             [v2[0] - v1[0], v2[1] - v1[1], v2[2] - v1[2]],
             [v0[0] - v2[0], v0[1] - v2[1], v0[2] - v2[2]]];
    for (var i = 0; i < 3; i++) {
      for (var j = 0; j < 3; j++) {
        var ax = [0, 0, 0]; ax[j] = 1;
        var A = [ax[1] * e[i][2] - ax[2] * e[i][1],
                 ax[2] * e[i][0] - ax[0] * e[i][2],
                 ax[0] * e[i][1] - ax[1] * e[i][0]];
        var p0 = A[0] * v0[0] + A[1] * v0[1] + A[2] * v0[2];
        var p1 = A[0] * v1[0] + A[1] * v1[1] + A[2] * v1[2];
        var p2 = A[0] * v2[0] + A[1] * v2[1] + A[2] * v2[2];
        var r = H[0] * Math.abs(A[0]) + H[1] * Math.abs(A[1]) + H[2] * Math.abs(A[2]);
        if (Math.min(p0, p1, p2) > r || Math.max(p0, p1, p2) < -r) return false;
      }
    }
    for (var k = 0; k < 3; k++) {
      if (Math.min(v0[k], v1[k], v2[k]) > H[k]) return false;
      if (Math.max(v0[k], v1[k], v2[k]) < -H[k]) return false;
    }
    var nrm = [e[0][1] * e[1][2] - e[0][2] * e[1][1],
               e[0][2] * e[1][0] - e[0][0] * e[1][2],
               e[0][0] * e[1][1] - e[0][1] * e[1][0]];
    var dd = nrm[0] * v0[0] + nrm[1] * v0[1] + nrm[2] * v0[2];
    var rr = H[0] * Math.abs(nrm[0]) + H[1] * Math.abs(nrm[1]) + H[2] * Math.abs(nrm[2]);
    return Math.abs(dd) <= rr;
  }

  /* Does any triangle of this face cross any of the corridors? */
  function inCorridor(boxes, verts, face) {
    for (var j = 1; j + 1 < face.length; j++) {
      var a = verts[face[0]], b = verts[face[j]], c = verts[face[j + 1]];
      if (!a || !b || !c) continue;
      for (var i = 0; i < boxes.length; i++) {
        if (triBox(a, b, c, boxes[i].C, boxes[i].H, boxes[i].B)) return true;
      }
    }
    return false;
  }

  /* THE SHELL IS NOT THE ONLY THING IN THE WAY.
   *
   * Cutting the doorway out of the hull opened the ordinary berths and
   * left the cradle, the cylinder and every large berth exactly as sealed
   * as before — and the prism had nothing left in it. The blocker was the
   * INTERIOR bucket, which portTriangles puts into the same collision
   * index and which has its own walls across the same opening. A hole has
   * to be a hole in every bucket that claims that space, or it is a hole
   * in one of three lists.
   *
   * The shell goes through portDoors instead, because there the door
   * leaves have to be lifted out BEFORE the cut — they live inside the
   * opening by definition, and cutting first would delete the doors along
   * with the wall. */
  function openBucket(role, key) {
    var ck = role + '#' + key;
    if (OPEN_BUCKET[ck] !== undefined) return OPEN_BUCKET[ck];
    return drainJob(openBucketJob(role, key));
  }
  /* In slices for Sim.warmTransfers (the triangle index asks for it). Not
   * stored until it is finished, so a sync caller meanwhile builds its own. */
  function* openBucketJob(role, key) {
    var ck = role + '#' + key;
    if (OPEN_BUCKET[ck] !== undefined) return OPEN_BUCKET[ck];
    var lib = libPort(role);
    var mesh = lib && lib[key];
    var d = portDoors(role);
    var apertures = d && d.apertures;
    if (!mesh || !mesh.f || !mesh.f.length || !apertures || !apertures.length) {
      OPEN_BUCKET[ck] = mesh || null;
      return OPEN_BUCKET[ck];
    }
    var f = [], c = [], cut = 0;
    var cboxes = corridorBoxes(apertures, true);
    yield 0;
    for (var i = 0; i < mesh.f.length; i++) {
      if ((i & 1023) === 1023) yield 0;
      var face = mesh.f[i], x = 0, y = 0, z = 0;
      for (var k = 0; k < face.length; k++) {
        var v = mesh.v[face[k]]; x += v[0]; y += v[1]; z += v[2];
      }
      if (inAperture(apertures, x / face.length, y / face.length, z / face.length) ||
          inCorridor(cboxes, mesh.v, face)) {
        cut++; continue;
      }
      f.push(face);
      if (mesh.c) c.push(mesh.c[i]);
    }
    if (OPEN_BUCKET[ck] !== undefined) return OPEN_BUCKET[ck];   // built meanwhile
    if (!cut) { OPEN_BUCKET[ck] = mesh; return mesh; }
    CUT_COUNT[role] = (CUT_COUNT[role] || 0) + cut;
    OPEN_BUCKET[ck] = { v: mesh.v, f: f, c: mesh.c ? c : mesh.c };
    return OPEN_BUCKET[ck];
  }

  /* Has the renderer already built this model's library and doors? Asked by
   * Sim.warmTransfers, which routes only stations that are this far along,
   * so that warming the routes never pays the model's own build as well. */
  function portReady(role) {
    return !!(role && PORT_CACHE[role] && PORT_DOORS[role] !== undefined);
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
        if (!inGateBox(bx, px, py, pz)) continue;
        var dx = px - bx.mid[0], dy = py - bx.mid[1], dz = pz - bx.mid[2];
        var d = dx * dx + dy * dy + dz * dz;
        if (d < bestD) { bestD = d; best = j; }
      }
      owner[i] = best;
    }

    /* PARTS THAT MOVE ON THEIR OWN (2026-10-17): lift cars, and the hatch
     * a car parks under. Claimed by the converter face by face, not by a
     * box, because the ring's platform sits flush in its hatch — same
     * footprint, same few metres of height — and a box round either takes
     * the other with it. Claimed FIRST, so no door leaf and no hull keeps a
     * face that belongs to a car. Shell bucket only: that is where every
     * one the library declares lives, and the other buckets are drawn by
     * other code that never moves anything. */
    /* The runs index the WHOLE shell as converted; the shell here may have
     * had movers or a city lifted out of it, and its `oi` says where each
     * face it kept sat in the whole one (merge, 2026-10-25). */
    var partFaces = [];
    var declared = (raw && raw.parts) || [];
    var partOf = {}, anyPart = false;
    for (var pi = 0; pi < declared.length; pi++) {
      var pt = declared[pi];
      if (!pt || pt.bucket !== 'shell' || !pt.r) continue;
      for (var ri = 0; ri < pt.r.length; ri++) {
        for (var fo = pt.r[ri][0]; fo < pt.r[ri][1]; fo++) {
          if (partOf[fo] === undefined) { partOf[fo] = pi; anyPart = true; }
        }
      }
    }
    if (anyPart) {
      var byPart = {};
      for (var fx = 0; fx < shell.f.length; fx++) {
        var orig = shell.oi ? shell.oi[fx] : fx;
        var pw = partOf[orig];
        if (pw === undefined) continue;
        owner[fx] = -2;
        var bp = byPart[pw] || (byPart[pw] = { part: declared[pw], f: [], c: [] });
        bp.f.push(shell.f[fx]);
        bp.c.push(shell.c ? shell.c[fx] : null);
      }
      for (pi = 0; pi < declared.length; pi++) if (byPart[pi]) partFaces.push(byPart[pi]);
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
      if (o === -2) continue;                 // a car's or a hatch's; see above
      if (o < 0) { hullF.push(shell.f[i]); hullC.push(col); }
      else { leaves[o].f.push(shell.f[i]); leaves[o].c.push(col); }
    }

    var out = [];
    for (j = 0; j < boxes.length; j++) {
      if (!leaves[j].f.length) continue;
      var box = boxes[j];
      var data = ex[box.node] || {};
      /* The older exports tag a field panel in its extras; the newer ones
       * only name it, and tag the BERTH instead (`berthKind: 'field'`). The
       * name is the one thing both agree on. */
      /* A yard garage's slats roll up out of sight (24-09): nothing here
       * animates a roll, so like a field a slat is there while the door is
       * shut and gone once it opens, rather than sliding through the frame. */
      var field = !!data.fieldGate || /ForceField$|Slat\d+$/i.test(box.node || '');

      /* WHICH BERTH THIS LEAF BELONGS TO, and therefore what it opens away
       * from: the nearest berth anchor. Named matching would be wrong here
       * for the same reason it is wrong in berthApertures — a ring mirrors
       * its patterns and two alcoves answer to the same prefix. */
      var berth = null, bd = Infinity;
      /* BY NAME FIRST, WHEN THE NAME IS A PROMISE. A leaf group is called
       * `leafGroup_<berth>_<side>`, which names its berth outright — and it
       * has to be used, because nearest-centre is wrong for the cylinder:
       * its bays ring the bore a few degrees apart and an open leaf sits
       * nearer the NEXT bay's centre than its own. Measured, 36 of its 60
       * leaves were given to a neighbour and slid across that neighbour's
       * doorway. The warning above about mirrored rings still stands, so
       * the name only narrows the candidates; the nearest of those wins. */
      var tagM = /^leafGroup_(.+)_[A-Z]$/.exec(box.node || '');
      var named = null;
      if (tagM && berths) {
        named = berths.filter(function (b) {
          return b && b.node && b.node.indexOf(tagM[1]) === 0 &&
                 /^(Throat(Floor|Roof|WallL|WallR|Back)?)?$/.test(b.node.slice(tagM[1].length));
        });
        if (!named.length) named = null;
      }
      /* A NAME THAT IS NOT A BERTH'S is not a berth's door. The 2026-09-21
       * cradle has `leafGroup_liftWell_<side>`, the gate between its silo
       * and the lift that takes cargo down (dockSequence: "liftWell gate
       * opens"). Given to the nearest berth, which was tube L, those two
       * leaves put that tube's doorway a hundred metres inside the station
       * and left the tube's real mouth shut. An internal door slides apart
       * from its own partner instead; see `internal` below. */
      var internal = !!(tagM && berths && !named);
      var cands = internal ? null : (named || berths);
      if (cands) {
        for (var bi = 0; bi < cands.length; bi++) {
          var bb2 = cands[bi];
          if (!bb2 || !bb2.mid) continue;
          var ddx = bb2.mid[0] - box.mid[0], ddy = bb2.mid[1] - box.mid[1],
              ddz = bb2.mid[2] - box.mid[2];
          var dd = ddx * ddx + ddy * ddy + ddz * ddz;
          if (dd < bd) { bd = dd; berth = bb2; }
        }
      }

      /* NO FORCE FIELDS (Astra, 2026-10-20: "air locks to keep stations
       * pressurized (let's get rid of the force fields)"). A field panel
       * across a berth's mouth becomes a pair of sliding doors cut to the
       * panel's own extent: split down the long side of the opening, each
       * leaf parting by its own width until the opening is clear. They are
       * ordinary leaves from here on — drawn sliding, hit where they stand,
       * and cycled by the airlock the berth already declares. Roll-up
       * garage slats are not fields and keep their there-or-not rule. */
      if (field && /ForceField$/i.test(box.node || '') && berth && berth.normal) {
        var gen = fieldToDoors(shell.v, leaves[j].f, box, berth);
        if (gen.length) { for (var gq = 0; gq < gen.length; gq++) out.push(gen[gq]); continue; }
      }

      var axis = [0, 0, 0], travel = 0;
      if (internal && !field) {
        /* Away from the middle of the pair: the other leaves carrying the
         * same tag. One leaf alone has nothing to part from and stays put. */
        var pm = [0, 0, 0], pn = 0;
        for (var pj = 0; pj < boxes.length; pj++) {
          var tq = /^leafGroup_(.+)_[A-Z]$/.exec(boxes[pj].node || '');
          if (tq && tq[1] === tagM[1] && boxes[pj].mid) {
            pm[0] += boxes[pj].mid[0]; pm[1] += boxes[pj].mid[1]; pm[2] += boxes[pj].mid[2]; pn++;
          }
        }
        if (pn > 1) {
          var ofs = [box.mid[0] - pm[0] / pn, box.mid[1] - pm[1] / pn, box.mid[2] - pm[2] / pn];
          var ol = Math.sqrt(dot3(ofs, ofs));
          if (ol > 1e-6) {
            axis = [ofs[0] / ol, ofs[1] / ol, ofs[2] / ol];
            travel = (typeof box.travel === 'number' && box.travel > 0) ? box.travel : ol;
          }
        }
      }
      if (!field && !internal && berth && berth.normal) {
        /* The two axes across the opening are the berth's own (berthBasis).
         * The leaf slides along whichever of them it is offset on, away
         * from the berth's centreline, until its inner edge reaches that
         * line — the inner edge being the leaf's nearest point to the line,
         * measured over its own vertices so a leaf at a bearing measures
         * the same as one on an axis. */
        var bb = berthBasis(berth.normal);
        var off0 = [box.mid[0] - berth.mid[0], box.mid[1] - berth.mid[1], box.mid[2] - berth.mid[2]];
        var c0 = dot3(off0, bb[0]), c1 = dot3(off0, bb[1]);
        var useE = Math.abs(c0) >= Math.abs(c1) ? 0 : 1;
        var cOff = useE === 0 ? c0 : c1;
        if (Math.abs(cOff) > 1e-4) {
          var sgn = cOff > 0 ? 1 : -1;
          var e = bb[useE];
          axis = [e[0] * sgn, e[1] * sgn, e[2] * sgn];
          var innerD = Infinity, lv = leaves[j].f;
          for (var fq = 0; fq < lv.length; fq++) {
            for (var fk = 0; fk < lv[fq].length; fk++) {
              var pv = shell.v[lv[fq][fk]];
              var dq = (pv[0] - berth.mid[0]) * axis[0] + (pv[1] - berth.mid[1]) * axis[1] +
                       (pv[2] - berth.mid[2]) * axis[2];
              if (dq < innerD) innerD = dq;
            }
          }
          travel = isFinite(innerD) ? Math.abs(innerD) : 0;
          /* THE ART'S OWN TRAVEL WINS when it declares one. The newer station
           * builder writes each leaf's travel into its group (`doorLeaf`),
           * and its lap doors do not sit where the measurement above
           * assumes: stowed, a lapped leaf still overhangs the opening by
           * its lap, so inner-edge-to-centreline reads short — measured,
           * the cylinder's leaves moved 0.031 radii where the builder moves
           * them 0.036, and an open door still covered a strip of doorway. */
          if (typeof box.travel === 'number' && box.travel > 0) travel = box.travel;
          /* Exact zeros stay zero: an axis-aligned slide is one component. */
          for (var az = 0; az < 3; az++) if (Math.abs(axis[az]) < 1e-12) axis[az] = 0;
        }
      }

      out.push({
        node: box.node,
        mesh: { v: shell.v, f: leaves[j].f, c: leaves[j].c },
        /* Kept for the bay lettering below, which has to know which leaf a
         * given corner of the doorway belongs to. */
        box: box,
        axis: axis, travel: travel, field: field, berthMid: berth ? berth.mid : null
      });
    }

    /* The parts, as leaves of two new kinds. A CAR slides along its own
     * travel (`d`, top to bottom), driven by the arrival's `car.f` rather
     * than by any door. A HATCH is there while its berth's inner gate is
     * shut and gone once it opens — the art says it is a hatch and nothing
     * about how one moves, so it is drawn the way a field and a roll-up
     * slat already are. Its berth is the nearest one, as for any leaf. */
    var carDefs = (raw && raw.cars) || [];
    for (var pq = 0; pq < partFaces.length; pq++) {
      var P = partFaces[pq], node = P.part.node;
      var leaf = { node: node, mesh: { v: shell.v, f: P.f, c: P.c },
                   box: null, axis: [0, 0, 0], travel: 0, field: false, berthMid: null };
      if (P.part.kind === 'car') {
        var cd = null;
        for (var cq = 0; cq < carDefs.length; cq++) if (carDefs[cq].node === node) cd = carDefs[cq];
        if (!cd || !cd.d) continue;
        var dl = Math.sqrt(dot3(cd.d, cd.d));
        if (!(dl > 1e-9)) continue;
        leaf.car = true;
        leaf.axis = [cd.d[0] / dl, cd.d[1] / dl, cd.d[2] / dl];
        leaf.travel = dl;
      } else if (P.part.kind === 'hatch') {
        leaf.hatch = true;
        var hm = P.part.mid, hbd = Infinity;
        for (var hb = 0; berths && hb < berths.length; hb++) {
          var bh = berths[hb];
          if (!bh || !bh.mid || !hm) continue;
          var e0 = bh.mid[0] - hm[0], e1 = bh.mid[1] - hm[1], e2 = bh.mid[2] - hm[2];
          var ed = e0 * e0 + e1 * e1 + e2 * e2;
          if (ed < hbd) { hbd = ed; leaf.berthMid = bh.mid; }
        }
      } else continue;
      out.push(leaf);
    }

    if (!out.length) return null;
    var fitted = fitCarRuns(shell, hullF, out, carDefs);
    carDefs = fitted.defs;
    hullF = carShafts(shell, hullF, hullC, out, carDefs);
    hullC = hullF.c; hullF = hullF.f;
    /* ---- AND THE DOORWAY IS A HOLE ------------------------------------
     *
     * Astra, parked: "How about the transfer halls between the bay and the
     * doors to the outside? Currently it's 4 walls and no doors."
     *
     * She was describing something real and it was not a rendering bug.
     * Measured from the stand at Waypoint Dock: 81 rays fired out across
     * the whole cross-section of the berth, not one of them reaches open
     * space — every single one stops at about 700 m, and opening the doors
     * changes nothing because what they hit is not a door. 495 faces of
     * HULL sit across the opening. Swept over the library it is universal:
     * 48 of 48 modelled berths cannot see their own doorway from where the
     * ship parks.
     *
     * The aperture was never cut. The leaves slide, and the VOXEL GRID is
     * carved so the simulation believes there is a corridor — see
     * stationSolidity, whose note already says the carve "is the only
     * thing that currently says a doorway is a doorway" — but the wall
     * itself has no hole in it. A working door mechanism mounted on the
     * inside of a sealed box. It is also why a ship flown out of a berth
     * stops dead a few hundred metres short of the doors, which had been
     * blamed on the doors being shut.
     *
     * So cut it here, at the one place every consumer already reads
     * through: portSections takes d.hull, portTriangles takes d.hull, and
     * the renderer and the collision both come through those. Cut it in
     * the art and this code does nothing; cut it here and the art does not
     * have to be reopened, which is the trade Astra asked for.
     *
     * THE OPENING IS THE ART'S OWN, not a number chosen here. `travel` is
     * already the distance from a leaf's inner edge to the berth's
     * centreline — that is what makes a leaf close — so twice it IS the
     * clear width, and the leaves' own z extent is the clear height. The
     * depth of the slab is the only fitted number: the wall measured 288 m
     * inboard of the leaf plane and 102 m outboard, so ±0.08 radii covers
     * it with room, and the cross-section limits keep the cut inside the
     * opening however deep it reaches. Surround, jambs and the rest of the
     * bulkhead are outside that cross-section and survive untouched. */
    var apertures = [];
    if (berths) {
      for (var ab = 0; ab < berths.length; ab++) {
        var bth = berths[ab];
        if (!bth || !bth.mid || !bth.normal) continue;
        var nrm = bth.normal;
        /* BOTH AXES ACROSS THE OPENING, not "sideways and full height".
         * The first version assumed a leaf always slides horizontally and
         * took the whole z extent as clear, which opened the ordinary
         * berths and left every large one and every cradle and cylinder
         * sealed — those doors part vertically. Each perpendicular axis
         * gets the same rule: a leaf that slides on it gives the clear
         * half-extent as its own `travel`, and an axis nothing slides on
         * takes the leaves' own reach. */
        var basis = berthBasis(nrm);
        var half = [0, 0], reach = [0, 0], slid = [false, false];
        var alongSum = 0, mine = 0;
        for (var li = 0; li < out.length; li++) {
          var lf2 = out[li];
          /* A car or a hatch is no part of a doorway's leaves: counting the
           * ring's floor hatch here would reshape the heavy bay's opening. */
          if (lf2.field || lf2.car || lf2.hatch || lf2.inner || !lf2.berthMid) continue;
          if (lf2.berthMid[0] !== bth.mid[0] || lf2.berthMid[1] !== bth.mid[1] ||
              lf2.berthMid[2] !== bth.mid[2]) continue;
          mine++;
          for (var sx = 0; sx < 2; sx++) {
            if (lf2.travel > 0 && Math.abs(dot3(lf2.axis, basis[sx])) > 0.9) {
              slid[sx] = true;
              if (lf2.travel > half[sx]) half[sx] = lf2.travel;
            }
          }
          var seen = {};
          for (var fi = 0; fi < lf2.mesh.f.length; fi++) {
            for (var ki = 0; ki < lf2.mesh.f[fi].length; ki++) seen[lf2.mesh.f[fi][ki]] = 1;
          }
          var aSum = 0, aN = 0;
          for (var vk in seen) {
            var vv = shell.v[vk];
            var dv3 = [vv[0] - bth.mid[0], vv[1] - bth.mid[1], vv[2] - bth.mid[2]];
            for (var rx = 0; rx < 2; rx++) {
              var off3 = Math.abs(dot3(dv3, basis[rx]));
              if (off3 > reach[rx]) reach[rx] = off3;
            }
            aSum += dot3(dv3, nrm);
            aN++;
          }
          if (aN) alongSum += aSum / aN;
        }
        if (!mine) continue;
        var hb = [], ok = true;
        for (var px = 0; px < 2; px++) {
          var h3 = slid[px] ? half[px] : reach[px];
          if (!(h3 > 0)) ok = false;
          hb.push(h3);
        }
        if (!ok) continue;
        /* `half` is the old world-axis view of the same numbers, kept for
         * the readers written against it (the bay lettering reads its z).
         * Exact for an axis-aligned berth; for one at a bearing each world
         * axis gets whichever frame axis lies along it, or null. */
        var halfW = [null, null, null];
        for (var wx = 0; wx < 3; wx++) {
          if (Math.abs(nrm[wx]) > 0.5) continue;
          for (var bx2 = 0; bx2 < 2; bx2++) if (Math.abs(basis[bx2][wx]) > 0.9) halfW[wx] = hb[bx2];
        }
        apertures.push({
          mid: bth.mid.slice(), normal: nrm.slice(),
          along: alongSum / mine,
          basis: basis, hb: hb,
          half: halfW
        });
      }
    }

    if (apertures.length) {
      var keepF = [], keepC = [], cut = 0;
      var shellBoxes = corridorBoxes(apertures, false);
      for (var hf = 0; hf < hullF.length; hf++) {
        var face = hullF[hf];
        var cx = 0, cy = 0, cz = 0;
        for (var cfi = 0; cfi < face.length; cfi++) {
          var cv = shell.v[face[cfi]]; cx += cv[0]; cy += cv[1]; cz += cv[2];
        }
        cx /= face.length; cy /= face.length; cz /= face.length;
        if (inAperture(apertures, cx, cy, cz) ||
            inCorridor(shellBoxes, shell.v, face)) { cut++; continue; }
        keepF.push(face);
        keepC.push(hullC[hf]);
      }
      if (cut) { hullF = keepF; hullC = keepC; }
      CUT_COUNT[role] = cut;
    }

    letterTheBays(shell, out, apertures, berths);
    innerGateLeaves(raw, out, berths);

    PORT_DOORS[role] = {
      hull: { v: shell.v, f: hullF, c: hullC },
      leaves: out,
      apertures: apertures,
      /* The cars' runs as fitted to their decks (fitCarRuns), and why any
       * was left alone. */
      cars: carDefs, carFit: fitted.report
    };
    return PORT_DOORS[role];
  }

  /* ---- THE SHAFT A CAR RUNS IN, FLUSH AT BOTH ENDS (2026-11-03) ---------
   *
   * Astra, of the lifts: "why is the shaft protruding from the wall at the
   * top and bottom of the shaft? It should be cut flush with the wall", and
   * "the bottom of that shaft needs to be flush with the floor, so the
   * elevator comes down and locks into the floor", and "when the elevator
   * is not there, there should be a blast door covering the shaft".
   *
   * Measured on the ring's heavy-bay lift (the one car every routed ring
   * arrival rides): its far end of travel is flush with the spoke deck the
   * hull rolls out onto, to the hundredth of a metre — but the shaft goes on
   * below it, a pit 0.08 radii deeper (350 m at Waypoint Dock) that the car
   * never reaches; and at the top, the deck plate under the parked car is
   * whole, so the car was drawn sinking through the floor it starts in, and
   * the hull with it (every ring route measured "through a surface" on the
   * lift leg, just under the start).
   *
   * So for every car the art declares:
   *   - the plating that crosses its run is cut: faces inside the car's own
   *     footprint, between the two ends of its travel, that face up or down;
   *   - past the far end of a run downward, the pit is cut away and capped
   *     with a floor at the car's own underside, so the car comes down and
   *     locks into it, flush with the deck beside it;
   *   - and the hatch the art put over the shaft (the ring's) is shut while
   *     the car is away and gone while it is home (partState): the car is
   *     the floor when it is there, and the hatch is when it is not.
   * Returns { f, c }, the hull's faces with the cut made. */
  var SHAFT_INSET = 0.03;              // of the car's footprint, so the shaft walls stay
  var SHAFT_CAP = 0.003;               // radii: the new pit floor's own thickness

  /* ---- EVERY CAR'S RUN ENDS ON A DECK (2026-11-03) ----------------------
   *
   * The ring's lift ran deck to deck; the skimmer's sort lift and the
   * spine's hub lift did not. The art's `motion` stops each of them in
   * mid-air: the sort lift's car rises 34 m up its guides and stops 0.115
   * radii (18 m at skimmer-m) under the sort hall's roof, the hub lift's
   * 22 m up from the hub floor and 0.09 radii under the hub's crown — a
   * platform hanging at the top of a frame, going nowhere. And both cars
   * stand ON their floor, a car's thickness proud of it, where the ring's
   * sits IN its deck.
   *
   * So each declared car's run is refitted to the decks beside its shaft,
   * measured, not assumed: four columns just outside the car's footprint,
   * the horizontal surfaces in each. The LOWER end's car top is put level
   * with the deck it stands in (the surface nearest it), and the UPPER
   * end's level with the TOP of the first plate above the run — the deck
   * over the shaft, which the car rises into and becomes the floor of.
   * Both are the median of the columns that found one, and a change is
   * taken only if it is small against the run (the plate has to be there
   * on at least two sides). The ring's run already ends on both decks, and
   * is unchanged by this to a hundred-thousandth.
   *
   * carShafts then cuts both decks across the run, caps the lower end at
   * the car's underside, and a hatch is built into the upper deck's
   * aperture wherever the art has none, shut while the car is away from
   * that end (`hatchEnd`, see partState). Returns fitted COPIES of the
   * car definitions: PortLib's own are never written. */
  var CAR_FIT_MAX = 0.2;               // radii: the most a run end may move
  function fitCarRuns(shell, hullF, out, carDefs) {
    var defs = [], report = [];
    /* Horizontal faces only, with their boxes, once. */
    var flat = [];
    for (var f = 0; f < hullF.length; f++) {
      var fc = hullF[f];
      if (fc.length < 3) continue;
      var a = shell.v[fc[0]], b = shell.v[fc[1]], c = shell.v[fc[2]];
      var e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      var nx = e1[1] * e2[2] - e1[2] * e2[1], ny = e1[2] * e2[0] - e1[0] * e2[2], nz = e1[0] * e2[1] - e1[1] * e2[0];
      var nl = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
      if (Math.abs(nz / nl) < 0.9) continue;
      flat.push(fc);
    }
    function column(x, y) {
      var zs = [];
      for (var q = 0; q < flat.length; q++) {
        var t = flat[q];
        for (var j = 1; j + 1 < t.length; j++) {
          var A = shell.v[t[0]], B = shell.v[t[j]], C = shell.v[t[j + 1]];
          if (Math.max(A[0], B[0], C[0]) < x || Math.min(A[0], B[0], C[0]) > x ||
              Math.max(A[1], B[1], C[1]) < y || Math.min(A[1], B[1], C[1]) > y) continue;
          var d0 = (B[0] - A[0]) * (C[1] - A[1]) - (C[0] - A[0]) * (B[1] - A[1]);
          if (Math.abs(d0) < 1e-14) continue;
          var u = ((x - A[0]) * (C[1] - A[1]) - (C[0] - A[0]) * (y - A[1])) / d0;
          var v = ((B[0] - A[0]) * (y - A[1]) - (x - A[0]) * (B[1] - A[1])) / d0;
          if (u < 0 || v < 0 || u + v > 1) continue;
          zs.push(A[2] + u * (B[2] - A[2]) + v * (C[2] - A[2]));
        }
      }
      return zs.sort(function (p, q) { return p - q; });
    }
    function median(list) {
      if (list.length < 2) return null;
      list.sort(function (p, q) { return p - q; });
      return list[(list.length - 1) >> 1];
    }
    for (var i = 0; i < carDefs.length; i++) {
      var cd = carDefs[i];
      var cp = { node: cd.node, key: cd.key, min: cd.min && cd.min.slice(), max: cd.max && cd.max.slice(),
                 mid: cd.mid && cd.mid.slice(), d: cd.d && cd.d.slice() };
      defs.push(cp);
      if (!cp.min || !cp.max || !cp.d || Math.abs(cp.d[0]) + Math.abs(cp.d[1]) > 1e-9 || !cp.d[2]) continue;
      /* A car the art already gave a hatch is a run the art fitted (the
       * ring's: ridden by every routed ring arrival, its stops measured and
       * held by Sim.liftRide). Left exactly as drawn. Measured, its top
       * sits 0.002-0.003 radii under the top of the deck plate it rests in
       * - inside the plate, not proud of it. */
      var artHatch = false;
      for (var hq = 0; hq < out.length; hq++) {
        var hl0 = out[hq];
        if (!hl0.hatch || !hl0.mesh) continue;
        var hx0 = 0, hy0 = 0, hn0 = 0;
        hl0.mesh.f.forEach(function (face) { face.forEach(function (k) { var v = hl0.mesh.v[k]; if (v) { hx0 += v[0]; hy0 += v[1]; hn0++; } }); });
        if (hn0 && hx0 / hn0 >= cp.min[0] && hx0 / hn0 <= cp.max[0] && hy0 / hn0 >= cp.min[1] && hy0 / hn0 <= cp.max[1]) artHatch = true;
      }
      if (artHatch) { report.push(cd.node + ' as the art has it (its own hatch)'); continue; }
      var w = cp.max[0] - cp.min[0], h = cp.max[1] - cp.min[1], cx = (cp.min[0] + cp.max[0]) / 2,
          cy = (cp.min[1] + cp.max[1]) / 2, thick = cp.max[2] - cp.min[2], run = Math.abs(cp.d[2]);
      var cols = [[cp.min[0] - w * 0.15, cy], [cp.max[0] + w * 0.15, cy], [cx, cp.min[1] - h * 0.15], [cx, cp.max[1] + h * 0.15]]
        .map(function (pt) { return column(pt[0], pt[1]); });
      var restTop = cp.max[2], farTop = cp.max[2] + cp.d[2];
      var up = cp.d[2] > 0, lowTop = up ? restTop : farTop, highTop = up ? farTop : restTop;
      /* The lower end: the surface nearest the car's top. */
      var lows = [], highs = [], plate = [];
      cols.forEach(function (zs) {
        var best = null;
        zs.forEach(function (z) { if (Math.abs(z - lowTop) < Math.max(0.01, thick * 3) && (best === null || Math.abs(z - lowTop) < Math.abs(best - lowTop))) best = z; });
        if (best !== null) lows.push(best);
        /* The upper end: the first plate above the top of the run (or AT
         * it, within a car's thickness), and that plate's top. */
        for (var k = 0; k < zs.length; k++) {
          if (zs[k] < highTop - Math.max(1e-4, thick * 0.5)) continue;
          if (zs[k] - highTop > CAR_FIT_MAX) break;
          var top = zs[k];
          for (var k2 = k + 1; k2 < zs.length && zs[k2] - zs[k] < 0.008; k2++) top = zs[k2];
          highs.push(top); plate.push(top - zs[k]);
          break;
        }
      });
      var lowDeck = median(lows), highDeck = median(highs), plateT = median(plate);
      if (lowDeck === null || highDeck === null || !(highDeck > lowDeck)) {
        report.push(cd.node + ' left as it is (no deck on two sides of both ends)');
        continue;
      }
      var shift = (up ? lowDeck : highDeck) - restTop;          // the rest pose moves by this
      var newD = (up ? highDeck : lowDeck) - (restTop + shift);
      if (Math.abs(shift) > CAR_FIT_MAX || Math.abs(newD - cp.d[2]) > CAR_FIT_MAX || newD * cp.d[2] <= 0) {
        report.push(cd.node + ' left as it is (the decks are too far from its run)');
        continue;
      }
      cp.min[2] += shift; cp.max[2] += shift; cp.mid[2] += shift; cp.d[2] = newD;
      cp.restShift = shift; cp.upperDeck = highDeck; cp.plate = Math.max(plateT || 0, 0.0015);
      cp.hatchEnd = up ? 1 : 0;
      report.push(cd.node + ' rest ' + (shift >= 0 ? '+' : '') + shift.toFixed(4) + ', run ' + cd.d[2].toFixed(4) + ' -> ' + newD.toFixed(4));
      /* The car's own leaf: its travel, and its rest pose moved by `shift`
       * into vertices of its own (a leaf's array is the whole shell's). */
      for (var o = 0; o < out.length; o++) {
        var lf = out[o];
        if (!lf.car || lf.node !== cd.node) continue;
        lf.axis = [0, 0, newD > 0 ? 1 : -1];
        lf.travel = Math.abs(newD);
        if (Math.abs(shift) > 1e-9) {
          var nv = [], map = {};
          lf.mesh.f = lf.mesh.f.map(function (face) {
            return face.map(function (k) {
              if (map[k] === undefined) { var p = shell.v[k]; map[k] = nv.length; nv.push([p[0], p[1], p[2] + shift]); }
              return map[k];
            });
          });
          lf.mesh.v = nv;
        }
      }
    }
    return { defs: defs, report: report };
  }

  /* A flat convex polygon minus an axis-aligned rectangle, as up to four
   * convex pieces: the plane outside the rectangle is the strips x < x0 and
   * x > x1, and between them y < y0 and y > y1. Each is a clip by two or
   * three half-planes (Sutherland-Hodgman); z is carried by interpolation. */
  function clipHalf(poly, ax, k, keepBelow) {
    var outp = [];
    for (var i = 0; i < poly.length; i++) {
      var A = poly[i], B = poly[(i + 1) % poly.length];
      var ia = keepBelow ? A[ax] <= k : A[ax] >= k, ib = keepBelow ? B[ax] <= k : B[ax] >= k;
      if (ia) outp.push(A);
      if (ia !== ib) {
        var t = (k - A[ax]) / (B[ax] - A[ax]);
        outp.push([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t]);
      }
    }
    return outp;
  }
  function outsideRect(poly, x0, x1, y0, y1) {
    var pieces = [clipHalf(poly, 0, x0, true), clipHalf(poly, 0, x1, false)];
    var mid = clipHalf(clipHalf(poly, 0, x0, false), 0, x1, true);
    pieces.push(clipHalf(mid, 1, y0, true), clipHalf(mid, 1, y1, false));
    return pieces.filter(function (pc) {
      if (pc.length < 3) return false;
      var ar = 0;
      for (var i = 1; i + 1 < pc.length; i++) {
        ar += Math.abs((pc[i][0] - pc[0][0]) * (pc[i + 1][1] - pc[0][1]) - (pc[i + 1][0] - pc[0][0]) * (pc[i][1] - pc[0][1]));
      }
      return ar > 1e-12;
    });
  }

  function carShafts(shell, hullF, hullC, out, carDefs) {
    var cars = [];
    for (var i = 0; i < out.length; i++) {
      var lf = out[i];
      if (!lf.car) continue;
      var cd = null;
      for (var q = 0; q < carDefs.length; q++) if (carDefs[q].node === lf.node) cd = carDefs[q];
      if (cd && cd.min && cd.max && cd.d) cars.push({ lf: lf, cd: cd });
    }
    if (!cars.length) return { f: hullF, c: hullC };
    var keepF = [], keepC = [];
    var shafts = cars.map(function (k) {
      var c = k.cd, ix = (c.max[0] - c.min[0]) * SHAFT_INSET, iy = (c.max[1] - c.min[1]) * SHAFT_INSET;
      var restTop = c.max[2], restBot = c.min[2], farTop = c.max[2] + c.d[2], farBot = c.min[2] + c.d[2];
      return { c: c, x0: c.min[0] + ix, x1: c.max[0] - ix, y0: c.min[1] + iy, y1: c.max[1] - iy,
               lo: Math.min(restBot, farBot), hi: Math.max(restTop, farTop),
               down: c.d[2] < 0, farBot: farBot, pitLo: Infinity };
    });
    /* The pit's bottom: the lowest face in the footprint within a run's
     * length under the far end. */
    for (var f = 0; f < hullF.length; f++) {
      var face = hullF[f], cx = 0, cy = 0, cz = 0;
      for (var k2 = 0; k2 < face.length; k2++) { var v = shell.v[face[k2]]; cx += v[0]; cy += v[1]; cz += v[2]; }
      cx /= face.length; cy /= face.length; cz /= face.length;
      for (var sI = 0; sI < shafts.length; sI++) {
        var S = shafts[sI];
        if (!S.down || cx < S.x0 || cx > S.x1 || cy < S.y0 || cy > S.y1) continue;
        if (cz < S.farBot && cz > S.farBot - (S.hi - S.lo) * 0.5 && cz < S.pitLo) S.pitLo = cz;
      }
    }
    for (f = 0; f < hullF.length; f++) {
      var fc = hullF[f], a = shell.v[fc[0]], b = shell.v[fc[1]], c3 = shell.v[fc[2]];
      var px = (a[0] + b[0] + c3[0]) / 3, py = (a[1] + b[1] + c3[1]) / 3, pz = (a[2] + b[2] + c3[2]) / 3;
      var e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [c3[0] - a[0], c3[1] - a[1], c3[2] - a[2]];
      var nx = e1[1] * e2[2] - e1[2] * e2[1], ny = e1[2] * e2[0] - e1[0] * e2[2], nz = e1[0] * e2[1] - e1[1] * e2[0];
      var nl = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
      var flat = Math.abs(nz / nl) > 0.7, cut = false;
      for (var s2 = 0; s2 < shafts.length && !cut; s2++) {
        var T = shafts[s2];
        if (px < T.x0 || px > T.x1 || py < T.y0 || py > T.y1) {
          /* Past the far end of a run downward, the shaft's own walls go
           * too, down to the pit: the footprint without the inset. */
          if (!T.down || !isFinite(T.pitLo)) continue;
          var c0 = T.c;
          if (px < c0.min[0] - (c0.max[0] - c0.min[0]) * 0.06 || px > c0.max[0] + (c0.max[0] - c0.min[0]) * 0.06 ||
              py < c0.min[1] - (c0.max[1] - c0.min[1]) * 0.06 || py > c0.max[1] + (c0.max[1] - c0.min[1]) * 0.06) continue;
          if (pz < T.farBot - 1e-4 && pz > T.pitLo - SHAFT_CAP * 2) cut = true;
          continue;
        }
        if (flat && pz > T.lo - 0.002 && pz < T.hi + 0.002) cut = true;          // plating across the run
        if (cut) break;
        if (T.down && isFinite(T.pitLo) && pz < T.farBot - 1e-4 && pz > T.pitLo - SHAFT_CAP * 2) cut = true;
      }
      if (cut) continue;
      /* A DECK DRAWN AS ONE BIG PLATE (the sort hall's floor and roof, the
       * hub's floor and crown: one quad from wall to wall) has its middle
       * out of the shaft, so the centroid test above keeps it whole and the
       * car runs through it. Such a face is cut round the shaft instead:
       * what lies outside the footprint is kept, as new triangles on new
       * vertices (appended: the vertex array is shared with every leaf). */
      if (flat) {
        var hole = null;
        for (var s4 = 0; s4 < shafts.length && !hole; s4++) {
          var W = shafts[s4];
          if (pz < W.lo - 0.002 || pz > W.hi + 0.002) continue;
          var bx0 = Infinity, bx1 = -Infinity, by0 = Infinity, by1 = -Infinity;
          for (var kq = 0; kq < fc.length; kq++) {
            var vq = shell.v[fc[kq]];
            bx0 = Math.min(bx0, vq[0]); bx1 = Math.max(bx1, vq[0]); by0 = Math.min(by0, vq[1]); by1 = Math.max(by1, vq[1]);
          }
          if (bx1 > W.x0 && bx0 < W.x1 && by1 > W.y0 && by0 < W.y1) hole = W;
        }
        if (hole) {
          var poly = fc.map(function (k) { return shell.v[k]; });
          outsideRect(poly, hole.x0, hole.x1, hole.y0, hole.y1).forEach(function (pc) {
            if (pc.length < 3) return;
            var base = shell.v.length;
            pc.forEach(function (pt) { shell.v.push(pt); });
            for (var tk = 1; tk + 1 < pc.length; tk++) { keepF.push([base, base + tk, base + tk + 1]); keepC.push(hullC[f]); }
          });
          continue;
        }
      }
      keepF.push(fc); keepC.push(hullC[f]);
    }
    /* The new floor under a run downward: a slab at the car's own
     * underside, the shaft's footprint, SHAFT_CAP thick. And under a run
     * UPWARD, at the car's underside at rest: the deck it stands in is cut
     * across the run (plating above), so without a cap the hole would go
     * on down through the deck (the sort lift, the hub lift). */
    shafts.forEach(function (S) {
      if (S.down ? !isFinite(S.pitLo) : !(S.c.restShift !== undefined)) return;
      var c = S.c, m = { v: [], f: [], c: [] };
      var o = [(c.min[0] + c.max[0]) / 2, (c.min[1] + c.max[1]) / 2, (S.down ? S.farBot : c.min[2]) - SHAFT_CAP / 2];
      pushBox(m, o, [0, 0, 1], [1, 0, 0], [0, 1, 0], 0, 0, 0, SHAFT_CAP / 2,
              (c.max[0] - c.min[0]) * 0.53, (c.max[1] - c.min[1]) * 0.53, '#3b434d');
      out.push({ node: c.node + 'PitFloor', mesh: m, box: null, axis: [0, 0, 0], travel: 0,
                 field: false, berthMid: null, built: true, fixed: true });
    });
    /* Which hatch covers which car's shaft: by footprint. */
    for (var h = 0; h < out.length; h++) {
      var hl = out[h];
      if (!hl.hatch) continue;
      /* Over its own faces: a leaf's vertex array is the whole shell's. */
      var hx = 0, hy = 0, hn = 0;
      for (var hf2 = 0; hf2 < hl.mesh.f.length; hf2++) {
        for (var hk = 0; hk < hl.mesh.f[hf2].length; hk++) {
          var hv = hl.mesh.v[hl.mesh.f[hf2][hk]];
          if (hv) { hx += hv[0]; hy += hv[1]; hn++; }
        }
      }
      if (!hn) continue;
      hx /= hn; hy /= hn;
      for (var s3 = 0; s3 < shafts.length; s3++) {
        var U = shafts[s3].c;
        if (hx >= U.min[0] && hx <= U.max[0] && hy >= U.min[1] && hy <= U.max[1]) hl.overCar = U.node;
      }
    }
    /* A hatch in the upper deck where the art drew none (fitCarRuns): the
     * aperture's footprint, the plate's thickness, its top flush with the
     * deck, shut while the car is away from that end. */
    shafts.forEach(function (S) {
      var c = S.c;
      if (typeof c.upperDeck !== 'number') return;
      for (var q = 0; q < out.length; q++) if (out[q].hatch && out[q].overCar === c.node) return;
      var m = { v: [], f: [], c: [] }, th = c.plate;
      var o = [(c.min[0] + c.max[0]) / 2, (c.min[1] + c.max[1]) / 2, c.upperDeck - th / 2];
      pushBox(m, o, [0, 0, 1], [1, 0, 0], [0, 1, 0], 0, 0, 0, th / 2,
              (c.max[0] - c.min[0]) * 0.5, (c.max[1] - c.min[1]) * 0.5, '#4a525c');
      /* Caution bands across it, so a shut hatch reads as a hatch. */
      for (var bnd = -2; bnd <= 2; bnd += 2) {
        pushBox(m, [o[0], o[1] + (c.max[1] - c.min[1]) * 0.2 * bnd, o[2]], [0, 0, 1], [1, 0, 0], [0, 1, 0], 0, 0, 0,
                th * 0.52, (c.max[0] - c.min[0]) * 0.46, (c.max[1] - c.min[1]) * 0.04, '#d9a92a');
      }
      out.push({ node: c.node + 'Hatch', mesh: m, box: null, axis: [0, 0, 0], travel: 0, field: false,
                 berthMid: null, built: true, hatch: true, overCar: c.node, hatchEnd: c.hatchEnd });
    });
    return { f: keepF, c: keepC };
  }

  /* ---- THE BLAST DOORS BETWEEN THE BERTHS AND THE STATION (2026-11-03) ---
   *
   * Astra: "What happened to having those interleaved blast doors inside,
   * separating the berths from the rest of the station interior?"
   *
   * They went with the art. The retired spine-m (ref/ports-retired) had SM
   * sliding doors with DoorInterlock teeth and an InnerGate leaf per berth;
   * the station set that replaced it on 2026-09-25 (33fbda9) kept every
   * inner gate's FRAME — jambs, sill, lintel, the caution strip — and no
   * leaf. So the airlock that every arrival cycles (`settle`, `admit`) and
   * that Sim.stationDoorState runs has been opening and shutting a doorway
   * with nothing in it, and drawStationModel's "the gate runs back and the
   * station appears down the corridor" was a gate nobody could see.
   *
   * So where a berth's inner gate is a frame with no leaf in it, a pair of
   * leaves is built into the frame here: slabs that meet in the middle on
   * interleaved teeth, the way the retired spine's did, and part sideways
   * into the jambs by their own width and a tooth. They are ordinary leaves
   * from here on, flagged `inner`, and run on `doors.inner` — the same
   * number the airlock has always set — rather than on the outer doors'
   * `open`. Drawn (both renderers: they are meshes like any leaf), hit
   * where they stand (leafHit), and left out of the aperture cut and the
   * bay lettering, which are about the outer doors.
   *
   * THICKNESS. A leaf is as deep as its frame along the berth's normal,
   * never less than INNER_LEAF_MIN of a radius (2.6 m at Threshold Dock,
   * 10 m at Halden Dock): the frames themselves were modelled as 1-3 m
   * sheets, and a door has to read as a slab, not a 1 px line (G). */
  var INNER_LEAF_MIN = 0.002;          // of a port radius
  var INNER_TEETH = 7;                 // bands down the meeting edge
  var INNER_SLAB = '#56606c', INNER_TOOTH = '#d9a92a', INNER_SEAM = '#1d2126';

  function interleavedPair(o, n, a, u, halfA, halfU, thick, kind) {
    var td = halfA * 0.1, over = halfA * 0.04, ht = thick / 2;
    var band = (2 * halfU) / INNER_TEETH;
    var L = { v: [], f: [], c: [] }, R = { v: [], f: [], c: [] };
    /* The slab from the jamb (and a little into it) to the tooth line. */
    var sw = (halfA + over - td) / 2;
    pushBox(L, o, n, a, u, 0, -(td + sw), 0, ht, sw, halfU, INNER_SLAB);
    pushBox(R, o, n, a, u, 0, (td + sw), 0, ht, sw, halfU, INNER_SLAB);
    /* A dark seam on each face a little in from the tooth line, so the
     * meeting edge reads from across a bay. */
    pushBox(L, o, n, a, u, 0, -td - halfA * 0.02, 0, ht * 1.08, halfA * 0.01, halfU * 0.98, INNER_SEAM);
    pushBox(R, o, n, a, u, 0, td + halfA * 0.02, 0, ht * 1.08, halfA * 0.01, halfU * 0.98, INNER_SEAM);
    /* The teeth: even bands on the left leaf, odd on the right, each the
     * full overlap across the centreline, so shut they interleave. */
    for (var k = 0; k < INNER_TEETH; k++) {
      var cu = -halfU + band * (k + 0.5);
      pushBox(k % 2 ? R : L, o, n, a, u, 0, 0, cu, ht * 0.96, td, band / 2 * 0.98, INNER_TOOTH);
    }
    var travel = halfA + td + over;
    return [
      { mesh: L, axis: [-a[0], -a[1], -a[2]], travel: travel },
      { mesh: R, axis: a.slice(), travel: travel }
    ];
  }

  function innerGateLeaves(raw, out, berths) {
    var ig = raw && raw.anchors && raw.anchors.innerGates;
    if (!ig || !ig.length || !berths) return;
    var frames = {};
    for (var i = 0; i < ig.length; i++) {
      var g = ig[i], m = /^(.*)InnerGate(JambL|JambR|Sill|Lintel)$/.exec(g.node || '');
      if (!m || !g.min || !g.max) continue;
      (frames[m[1]] = frames[m[1]] || {})[m[2]] = g;
    }
    Object.keys(frames).forEach(function (pre) {
      var F = frames[pre];
      if (!F.JambL || !F.JambR || !F.Sill || !F.Lintel) return;
      var nrm = F.Sill.normal || F.JambL.normal;
      if (!nrm) return;
      /* The opening: between the jambs' inner faces across, between the
       * sill's top and the lintel's underside, at the frame's own depth. */
      var nAx = Math.abs(nrm[0]) > 0.5 ? 0 : Math.abs(nrm[1]) > 0.5 ? 1 : 2;
      var aAx = -1;
      for (var q = 0; q < 3; q++) {
        if (q === nAx || q === 2) continue;
        aAx = q;
      }
      if (aAx < 0 || nAx === 2) return;               // a gate in a floor or roof: not this shape
      var jl = F.JambL, jr = F.JambR;
      var lo = Math.min(jl.max[aAx], jr.max[aAx]), hi = Math.max(jl.min[aAx], jr.min[aAx]);
      if (jl.mid && jr.mid) {
        var left = jl.mid[aAx] < jr.mid[aAx] ? jl : jr, right = left === jl ? jr : jl;
        lo = left.max[aAx]; hi = right.min[aAx];
      }
      var zLo = F.Sill.max[2], zHi = F.Lintel.min[2];
      if (!(hi - lo > 1e-4) || !(zHi - zLo > 1e-4)) return;
      var dLo = Math.min(jl.min[nAx], jr.min[nAx], F.Sill.min[nAx], F.Lintel.min[nAx]);
      var dHi = Math.max(jl.max[nAx], jr.max[nAx], F.Sill.max[nAx], F.Lintel.max[nAx]);
      var c = [0, 0, 0];
      c[aAx] = (lo + hi) / 2; c[2] = (zLo + zHi) / 2; c[nAx] = (dLo + dHi) / 2;
      /* Already has a leaf (the cradle's SM blast doors): leave it be. */
      for (var k = 0; k < out.length; k++) {
        var lf = out[k], bx = lf.box;
        if (!bx || !bx.mid || lf.car || lf.hatch) continue;
        if (Math.abs(bx.mid[aAx] - c[aAx]) < (hi - lo) / 2 && Math.abs(bx.mid[2] - c[2]) < (zHi - zLo) / 2 &&
            Math.abs(bx.mid[nAx] - c[nAx]) < Math.max(0.02, (dHi - dLo) * 4)) return;
      }
      /* Whose: the berth whose node carries the same prefix, nearest. */
      var berth = null, bd = Infinity;
      for (var b = 0; b < berths.length; b++) {
        var bb = berths[b];
        if (!bb || !bb.mid || String(bb.node || '').indexOf(pre) !== 0) continue;
        if (!/^(Throat(Floor|Roof|WallL|WallR|Back)?)?$/.test(String(bb.node).slice(pre.length))) continue;
        var dd = Math.pow(bb.mid[0] - c[0], 2) + Math.pow(bb.mid[1] - c[1], 2) + Math.pow(bb.mid[2] - c[2], 2);
        if (dd < bd) { bd = dd; berth = bb; }
      }
      if (!berth) return;
      var nv = [0, 0, 0]; nv[nAx] = 1;
      var av = [0, 0, 0]; av[aAx] = 1;
      var thick = Math.max(INNER_LEAF_MIN, dHi - dLo);
      var pair = interleavedPair(c, nv, av, [0, 0, 1], (hi - lo) / 2, (zHi - zLo) / 2, thick);
      for (var p = 0; p < pair.length; p++) {
        out.push({ node: pre + 'InnerGateLeaf' + (p ? 'R' : 'L'), mesh: pair[p].mesh, box: null,
                   axis: pair[p].axis, travel: pair[p].travel, field: false,
                   berthMid: berth.mid, inner: true, built: true });
      }
    });
  }

  /* ---- BAY 4 -------------------------------------------------------------
   * Astra: "add the number for each berth on the doors for that berth. The
   * number should be high right and low left it says BAY, with each berth
   * having its number on it."
   *
   * ON THE LEAVES, not on the bulkhead beside them, which is the harder of
   * the two and the one she asked for. A leaf is a slab of the shell lifted
   * out before the doorway was cut, and it is drawn at wherever it has slid
   * to this frame — so lettering welded to the leaf travels with the door
   * and a legend painted across a pair of them parts down the middle when
   * they open, which is exactly what a painted door does.
   *
   * Each piece of the legend is given to the leaf whose CLOSED footprint
   * contains it, so a doorway that parts sideways gets BAY on one leaf and
   * the number on the other, and one that parts vertically gets them on the
   * halves they actually sit in. A piece over no leaf is dropped rather
   * than floated in the opening.
   *
   * Sized off the DOORWAY rather than off the hull, unlike the deck
   * furniture: a bay number is part of the station's art and should be the
   * same fraction of its own door at every station wearing this model. The
   * numerals come out around a fifth of the door's height, which is what
   * you can read on approach.
   *
   * The berth is numbered from ONE. Bays are, and the stand's own board
   * says the same number — the two would otherwise be arguing about what
   * this berth is called. */
  var BAY_LEGEND = '!#7ed3ff';       // the word
  var BAY_NUMERAL = '!#ffe6a8';      // the number

  function letterTheBays(shell, leaves, apertures, berths) {
    if (!apertures || !apertures.length || !leaves || !leaves.length) return;
    /* The same sort everything else reads berths in, so the number on the
     * door is the number the dressing, the boom table and generate.js all
     * agree this berth is. */
    var sorted = berths.slice().sort(function (a, b) {
      return a.mid[0] - b.mid[0] || a.mid[1] - b.mid[1] || a.mid[2] - b.mid[2];
    });

    for (var ai = 0; ai < apertures.length; ai++) {
      var ap = apertures[ai], n = ap.normal;
      /* A door at a BEARING — the cylinder's bays ring its bore, so most of
       * them lean well off the horizontal — is still a wall, and its "up"
       * is the station's own long axis, which berthBasis hands back as e1.
       *
       * AND A HATCH IS PAINTED LIKE A PAD (2026-09-25). This used to skip a
       * true floor hatch — no wall to write on — which was harmless until
       * the new ring: its only doors ARE the heavy bay's roof hatch (its
       * small bays are curtains), so every ring in the library went
       * unlettered. A hatch is read from above on the way down, the way a
       * helipad is, so it takes the same treatment as a tilted door: its
       * frame's own first axis is "up" on the paint. */
      var tilted = Math.abs(n[2]) > 0.5;
      var idx = -1;
      for (var bi = 0; bi < sorted.length; bi++) {
        var bm = sorted[bi].mid;
        if (bm[0] === ap.mid[0] && bm[1] === ap.mid[1] && bm[2] === ap.mid[2]) { idx = bi; break; }
      }
      if (idx < 0) continue;

      var u = tilted && ap.basis ? ap.basis[0] : [0, 0, 1];
      var r = [n[1] * u[2] - n[2] * u[1], n[2] * u[0] - n[0] * u[2], n[0] * u[1] - n[1] * u[0]];
      var rl = Math.sqrt(r[0] * r[0] + r[1] * r[1] + r[2] * r[2]);
      if (!(rl > 1e-9)) continue;
      r = [r[0] / rl, r[1] / rl, r[2] / rl];

      /* Every leaf of THIS berth, measured in the doorway's own frame. */
      var mine = [];
      for (var li = 0; li < leaves.length; li++) {
        var lf = leaves[li];
        if (lf.field || !lf.box || !lf.box.min || !lf.box.max || !lf.berthMid) continue;
        if (lf.berthMid[0] !== ap.mid[0] || lf.berthMid[1] !== ap.mid[1] ||
            lf.berthMid[2] !== ap.mid[2]) continue;
        var bm2 = [(lf.box.min[0] + lf.box.max[0]) / 2,
                   (lf.box.min[1] + lf.box.max[1]) / 2,
                   (lf.box.min[2] + lf.box.max[2]) / 2];
        var dv = [bm2[0] - ap.mid[0], bm2[1] - ap.mid[1], bm2[2] - ap.mid[2]];
        /* Half-extents of the leaf itself along r and u, which is what
         * bounds the lettering: a legend has to fit on the door it is
         * painted on, not on the opening the door covers. Taken off the
         * leaf's own vertices, so a leaf at a bearing measures true. */
        var rLo = Infinity, rHi = -Infinity, uLo = Infinity, uHi = -Infinity;
        var lfF = lf.mesh.f, lfV = lf.mesh.v;
        for (var qf = 0; qf < lfF.length; qf++) {
          for (var qk = 0; qk < lfF[qf].length; qk++) {
            var qv = lfV[lfF[qf][qk]];
            var qr = qv[0] * r[0] + qv[1] * r[1] + qv[2] * r[2];
            var qu = qv[0] * u[0] + qv[1] * u[1] + qv[2] * u[2];
            if (qr < rLo) rLo = qr; if (qr > rHi) rHi = qr;
            if (qu < uLo) uLo = qu; if (qu > uHi) uHi = qu;
          }
        }
        mine.push({
          leaf: lf,
          a: dv[0] * n[0] + dv[1] * n[1] + dv[2] * n[2],
          r: dv[0] * r[0] + dv[1] * r[1] + dv[2] * r[2],
          u: dv[0] * u[0] + dv[1] * u[1] + dv[2] * u[2],
          hr: isFinite(rLo) ? (rHi - rLo) / 2 : 0,
          hu: isFinite(uLo) ? (uHi - uLo) / 2 : 0
        });
      }
      if (!mine.length) continue;

      /* THE INNER LAYER ONLY. A doorway that carries a blast door behind an
       * outer one has two leaves in the same place; the legend belongs on
       * the one you are looking at from the bay. */
      var near = mine[0].a;
      for (var mi = 1; mi < mine.length; mi++) if (Math.abs(mine[mi].a) < Math.abs(near)) near = mine[mi].a;
      var face = mine.filter(function (m) { return Math.abs(m.a - near) < 0.02; });
      if (!face.length) face = mine;

      /* Low left, and high right — Astra's layout. With a door that parts
       * down the middle those are two different leaves, so the legend
       * splits when the doors open, which is what a painted door does. */
      var left = face[0], right = face[0];
      for (var fi = 1; fi < face.length; fi++) {
        if (face[fi].r < left.r) left = face[fi];
        if (face[fi].r > right.r) right = face[fi];
      }

      var halfU = (tilted ? ap.hb[0] : ap.half[2]) || left.hu;
      var num = String(idx + 1);
      var cellN = Math.min(halfU * 0.09, right.hu * 0.28);
      var cellW = Math.min(halfU * 0.05, left.hu * 0.16);
      if (!(cellN > 0) || !(cellW > 0)) continue;

      /* Written on the leaf's own face, a skin proud of it so it does not
       * z-fight the door it is painted on. */
      writeOnLeaf(left, n, r, u, ap, 'BAY', cellW, BAY_LEGEND, -1, -1);
      writeOnLeaf(right, n, r, u, ap, num, cellN, BAY_NUMERAL, 1, 1);
    }
  }

  /* One legend on one leaf, pinned to a corner of it. `sr`/`su` are -1 for
   * the low/left edge and +1 for the high/right one. */
  function writeOnLeaf(m, n, r, u, ap, text, cell, colour, sr, su) {
    if (!m || !(cell > 0)) return;
    var w = glyphWidth(text, cell), h = GLYPH_H * cell;
    var inset = 0.14;
    var b = sr < 0 ? m.r - m.hr * (1 - inset)
                   : m.r + m.hr * (1 - inset) - w;
    var c = su < 0 ? m.u - m.hu * (1 - inset)
                   : m.u + m.hu * (1 - inset) - h;
    /* Proud of the leaf's own face, on the side the bay is. */
    var depth = m.a - Math.sign(m.a || 1) * (cell * 0.5);
    pushText(m.leaf.mesh, ap.mid, n, r, u, depth, b, c, text, cell, colour);
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
      /* The berth anchor's own box rides along: it is the ROOM, and roomAt
       * asks it (2026-11-03). Measured over every orbital model, 98-100% of
       * the hull faces inside a berth's box are that berth's section. */
      out.push({ hull: blank(hull), interior: blank(inner), mid: berths[s2].mid.slice(),
                 box: { min: berths[s2].min.slice(), max: berths[s2].max.slice() } });
    }
    for (var b3 = 0; b3 < buckets.length; b3++) {
      var m3 = buckets[b3].mesh, kk = buckets[b3].key;
      if (!m3 || !m3.f) continue;
      for (var f3 = 0; f3 < m3.f.length; f3++) {
        var g3 = faceKey[b3][f3];
        var c3 = (g3 === undefined || g3 < 0) ? null : comp[find(g3)];
        var sec = c3 ? c3.sec : -1;
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

  /* IN A ROOM, NOT MERELY NEAR ONE (2026-11-03). Astra, mid-transfer at
   * Halden Dock: "station interiors in transitory spaces isn't drawn", and
   * "shaft walls are not drawn during transit for the angled shafts". Her
   * screenshot was a floor slab and two loose leaves against black: the
   * cars (drawn first, always), and the room's own leaves, and nothing else.
   *
   * sectionAt answers "the nearest berth within a berth's diagonal", which
   * is right for a hull parked in a bay and wrong for one riding a bore or
   * crossing a hall between two of them: the bore is within reach of a bay,
   * the bay's section was drawn, and with the inner gate shut behind her the
   * renderer drew that bay ALONE. A section is a room (98-100% of the faces
   * inside a berth's box are its section's, every orbital model measured),
   * so a hull is in it only when it is inside that box. Everything else a
   * transit crosses — the bores, the halls, the transfer decks — belongs to
   * the structure, and the structure is only drawn with the whole hull.
   *
   * `pad` widens the box by that fraction of its own size on each axis, so
   * a hull whose centre is on the stand at a box's edge still counts. */
  function roomAt(role, p, pad) {
    var S = portSections(role);
    if (!S || !p) return -1;
    var k = typeof pad === 'number' ? pad : 0.05;
    /* Neighbouring alcoves' boxes can overlap (see sectionAt), so of the
     * boxes that hold the point, the one whose berth is nearest. */
    var best = -1, bestD = Infinity;
    for (var i = 0; i < S.sections.length; i++) {
      var sc = S.sections[i], bx = sc.box;
      if (!bx) continue;
      var inside = true;
      for (var a = 0; a < 3 && inside; a++) {
        var w = (bx.max[a] - bx.min[a]) * k;
        if (p[a] < bx.min[a] - w || p[a] > bx.max[a] + w) inside = false;
      }
      if (!inside) continue;
      var dx = p[0] - sc.mid[0], dy = p[1] - sc.mid[1], dz = p[2] - sc.mid[2];
      var dd = dx * dx + dy * dy + dz * dz;
      if (dd < bestD) { bestD = dd; best = i; }
    }
    return best;
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

  /* ---- letters, out of boxes ---------------------------------------------
   * A bay needs a NUMBER on it and the renderer had no way to write one.
   * The stand's own board has been carrying a tally of little dashes since
   * it was built — berth 3 drew four marks — which is a count rather than
   * a name, and nobody reads a tally at two hundred metres.
   *
   * So: a 3x5 block font, one box per lit pixel, in the same pushBox the
   * rest of the deck furniture is made of. Three columns is the narrowest
   * grid that still gives every digit its own unmistakable shape, and the
   * only letters this file will ever need are B, A and Y.
   *
   * Bit 0 is the top-left pixel and bits run along each row, so a glyph
   * reads in source the way it reads on the wall. */
  var GLYPHS = {
    '0': '111101101101111', '1': '010110010010111', '2': '111001111100111',
    '3': '111001111001111', '4': '101101111001001', '5': '111100111001111',
    '6': '111100111101111', '7': '111001001001001', '8': '111101111101111',
    '9': '111101111001111',
    'A': '111101111101101', 'B': '110101110101110', 'C': '111100100100111',
    'D': '110101101101110', 'E': '111100110100111', 'F': '111100110100100',
    'G': '111100101101111', 'H': '101101111101101', 'I': '111010010010111',
    'J': '001001001101111', 'K': '101101110101101', 'L': '100100100100111',
    'M': '101111111101101', 'N': '101111111111101', 'O': '111101101101111',
    'P': '111101111100100', 'Q': '111101101111011', 'R': '111101110101101',
    'S': '111100111001111', 'T': '111010010010010', 'U': '101101101101111',
    'V': '101101101101010', 'W': '101101111111101', 'X': '101101010101101',
    'Y': '101101010010010', 'Z': '111001010100111',
    '-': '000000111000000', '.': '000000000000010', '!': '010010010000010',
    ' ': '000000000000000'
  };
  var GLYPH_W = 3, GLYPH_H = 5;

  /* Write `text` in the (f, r, u) frame with its LOWER-LEFT corner at
   * (a, b, c). `cell` is one pixel, in the same units as the offsets.
   * Returns the width written, so a caller can centre or right-align by
   * measuring first. */
  function glyphWidth(text, cell) {
    return text.length ? (text.length * (GLYPH_W + 1) - 1) * cell : 0;
  }

  function pushText(mesh, o, f, r, u, a, b, c, text, cell, colour) {
    var h = cell * 0.5;
    for (var i = 0; i < text.length; i++) {
      var bits = GLYPHS[text.charAt(i)];
      if (!bits) continue;
      var bx = b + i * (GLYPH_W + 1) * cell;
      for (var row = 0; row < GLYPH_H; row++) {
        for (var col = 0; col < GLYPH_W; col++) {
          if (bits.charAt(row * GLYPH_W + col) !== '1') continue;
          /* Row 0 is the TOP of the glyph, so it lands highest. */
          pushBox(mesh, o, f, r, u,
                  a,
                  bx + col * cell + h,
                  c + (GLYPH_H - 1 - row) * cell + h,
                  cell * 0.18, h, h, colour);
        }
      }
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

    /* THE STAND SITS ON THE FLOOR, NOT IN IT.
     *
     * `deck` is where a ray cast straight down the alcove first hits
     * structure, which is the top of the STRUCTURE — and the bay's visible
     * floor is the plating laid over it. Drawing the stand at the cast
     * depth therefore buried it: from the seat the pad read as a rectangle
     * sunk in the deck with a ship floating over the hole, which is the
     * clipping Astra photographed at Waypoint Dock.
     *
     * The lift is measured off the HULL rather than off the station, like
     * every other number in this function, and for the same reason: the
     * stand is the ruler the eye reads the room with, so it has to be
     * sized in the one object whose size the player already knows. Two
     * thirds of a hull height is where the plating lands relative to the
     * structure under it. Written as the span times the fraction rather
     * than as a number, because a constant scaled by another constant is a
     * bug wearing a disguise. */
    var lift = STAND_LIFT * hullSpan('courier').h * M2U;
    var o = [bx.mid[0], bx.mid[1], deck + lift];
    var f = bx.normal ? [bx.normal[0], bx.normal[1], bx.normal[2]] : [1, 0, 0];
    var fl = Math.sqrt(f[0] * f[0] + f[1] * f[1] + f[2] * f[2]) || 1;
    f = [f[0] / fl, f[1] / fl, f[2] / fl];
    var u = [0, 0, 1];
    /* r = f x u, normalised. If the berth opens straight up — no model in
     * the library does, but a hand-made one could — fall back to model x. */
    var r = [f[1] * u[2] - f[2] * u[1], f[2] * u[0] - f[0] * u[2], f[0] * u[1] - f[1] * u[0]];
    var rl = Math.sqrt(r[0] * r[0] + r[1] * r[1] + r[2] * r[2]);
    r = rl > 1e-9 ? [r[0] / rl, r[1] / rl, r[2] / rl] : [1, 0, 0];

    /* The dressing origin sits ON the stand, so the deck is here; the berth
     * box's own centre is `lift` plus the cast depth below it, which is
     * what the room's furniture is measured from. */
    var deckRel = 0;

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
     * berth this is", which is most of what dressing is for.
     *
     * It says the NUMBER now rather than a tally of dashes. The tally was
     * honest about the count and useless as a name — you cannot read four
     * marks as "bay four" at two hundred metres, and the bay signs on the
     * bulkhead (below) say it in numerals, so the two would have disagreed
     * about what this berth is called. */
    var bayNo = String(berth + 1);
    var sgA = -(padA + 0.45 * L);
    pushBox(m, o, f, r, u, sgA, 0, 0.35 * L + barC, 0.025 * L, 0.025 * L, 0.35 * L, POST);
    pushBox(m, o, f, r, u, sgA, 0, 0.75 * L + barC, 0.02 * L, 0.30 * L, 0.13 * L, SIGN);
    var boardCell = 0.035 * L;
    pushText(m, o, f, r, u, sgA - 0.03 * L,
             -glyphWidth(bayNo, boardCell) / 2,
             0.75 * L + barC - GLYPH_H * boardCell / 2,
             bayNo, boardCell, DARK);

    /* ---- the bay is somewhere people work ---------------------------------
     * Astra: "we need more colored things, concourses, elevator shafts,
     * etc..."
     *
     * The stand fixed the SCALE of the room — it gave the eye something
     * hull-sized to read the distances against. What it did not fix is that
     * the room reads as empty: a floodlit floor in a grey box, with nothing
     * in it that implies anybody is on the other side of the wall.
     *
     * So: a concourse gallery along the back of the bay with lit windows
     * in it, and a lift shaft at each end of that gallery with its car
     * lights banded up it. Both are emissive at real colours rather than
     * plain at bright ones, for the same reason the deck plating is — the
     * indoor shader reads 0.10 + 0.55*|N.V| and a window seen at a glancing
     * angle would otherwise be a dark rectangle in a dark wall.
     *
     * Sized off the BERTH BOX rather than off the hull: this is the room,
     * and the room is as big as the art made it. The stand stays the ruler;
     * these are what the ruler is measuring. */
    var boxR = 0, boxU = 0, boxA = 0;
    if (bx.min && bx.max) {
      var exX = (bx.max[0] - bx.min[0]) / 2, exY = (bx.max[1] - bx.min[1]) / 2;
      boxU = (bx.max[2] - bx.min[2]) / 2;
      boxR = Math.abs(f[0]) > 0.5 ? exY : exX;
      boxA = Math.abs(f[0]) > 0.5 ? exX : exY;
    }
    if (boxR > 0 && boxU > 0 && boxA > 0) {
      var back = -boxA * 0.94;                      // the wall behind the stand
      var gallH = Math.min(boxU * 0.22, 1.1 * L);
      var gallC = deckRel + gallH * 0.5 + 0.9 * L;  // above head height off the deck
      var GLASS = '!#9fd8ff', FRAME = '!#39414c', SHAFT = '!#2b3agg';
      SHAFT = '!#2b3a4a';
      var CAR = '!#ffd36b';

      /* The gallery: a recessed band with a lit face, and windows punched
       * along it. The band is dark and the windows are not, which is what
       * makes it read as looking INTO somewhere. */
      pushBox(m, o, f, r, u, back, 0, gallC, 0.10 * L, boxR * 0.72, gallH * 0.5, FRAME);
      var winN = 9, winW = (boxR * 1.30) / (winN * 2.1);
      for (var wi = 0; wi < winN; wi++) {
        var wb = (wi - (winN - 1) / 2) * (boxR * 1.30 / winN);
        /* Not every window is lit. A row of identical bright rectangles
         * reads as a texture; a row with three dark ones reads as a
         * building with people in it who are not all in tonight. */
        var litW = ((berth * 7 + wi * 5) % 4) !== 0;
        pushBox(m, o, f, r, u, back + 0.06 * L, wb, gallC,
                0.035 * L, winW, gallH * 0.30, litW ? GLASS : '!#1b222b');
      }

      /* Two lift shafts, one at each end of the gallery, running from the
       * deck to the roof of the bay. The car is a lit band at a height that
       * differs per shaft and per berth, so no two bays look stamped from
       * the same sheet. */
      for (var sh = -1; sh <= 1; sh += 2) {
        var sb = sh * boxR * 0.80;
        var shaftTop = deckRel + boxU * 1.35;
        var shaftMid = (deckRel + shaftTop) / 2;
        pushBox(m, o, f, r, u, back + 0.02 * L, sb, shaftMid,
                0.09 * L, 0.34 * L, (shaftTop - deckRel) / 2, SHAFT);
        /* Guide lights up the shaft. */
        var rungs = 7;
        for (var rg = 0; rg < rungs; rg++) {
          pushBox(m, o, f, r, u, back + 0.08 * L, sb,
                  deckRel + (rg + 0.5) * (shaftTop - deckRel) / rungs,
                  0.03 * L, 0.30 * L, 0.035 * L, '!#4c6b86');
        }
        var carAt = ((berth * 3 + (sh > 0 ? 2 : 5)) % rungs + 0.5) / rungs;
        pushBox(m, o, f, r, u, back + 0.09 * L, sb,
                deckRel + carAt * (shaftTop - deckRel),
                0.03 * L, 0.30 * L, 0.11 * L, CAR);
      }

      /* And the boards the ads play on — the FRAMES only. What is on them
       * changes, so it is built separately and drawn on top; see berthAds.
       * The positions are recorded on the mesh rather than recomputed
       * there, because two functions deriving the same rectangle from the
       * same box is two chances to put the poster next to the hoarding. */
      var boardHW = boxR * 0.30, boardHH = Math.min(boxU * 0.16, 0.8 * L);
      var boardC = gallC + gallH * 0.5 + boardHH + 1.1 * L;
      var boards = [];
      for (var sd = -1; sd <= 1; sd += 2) {
        boards.push({ a: back + 0.07 * L, b: sd * boxR * 0.44, c: boardC,
                      hw: boardHW, hh: boardHH });
      }
      for (var adi = 0; adi < boards.length; adi++) {
        pushBox(m, o, f, r, u, boards[adi].a, boards[adi].b, boards[adi].c,
                0.05 * L, boards[adi].hw + 0.06 * L, boards[adi].hh + 0.06 * L, FRAME);
      }
      m.adBoards = boards;
      m.adFrame = { o: o, f: f, r: r, u: u, L: L };
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
    /* How far the stand was lifted off the cast deck, and what it was lifted
     * from — recorded so the suite can check the stand is standing on the
     * floor rather than re-deriving the cast and agreeing with itself. */
    m.padLift = lift;
    m.deckZ = deck;
    /* Not livery — see accented(). The stand keeps its floodlit grey and
     * its yellow hazard bars at a dock of any colour. */
    m.noAccent = true;

    DRESS[key] = m;
    DRESS_KEYS.push(key);
    /* A station's radius is a float off an rng, so this key is effectively
     * unique per station. Bounded rather than unbounded: a career visits
     * more ports than a cache should hold meshes for. */
    while (DRESS_KEYS.length > DRESS_MAX) delete DRESS[DRESS_KEYS.shift()];
    return m;
  }

  /* ---- what is playing in the bay ----------------------------------------
   * Astra: "put some advertisement signs on the inside of the berth, which
   * scroll through ads for different things."
   *
   * A hoarding that never changes is scenery; one that turns over is a
   * place. So the boards are built once with the rest of the furniture and
   * their CONTENT is a separate little mesh, cached per slot, swapped on a
   * timer — a slideshow rather than a scroll, and deliberately: text
   * sliding across a board a hundred metres away at the frame rate is an
   * unreadable smear, and the thing a player actually does with a hoarding
   * is glance at it twice.
   *
   * The copy is the game's own economy talking to itself: the things
   * advertised are things you can buy, fly, or be fined for, so the boards
   * are worth reading once even though nothing clicks. Which berth sees
   * which line is hashed off the berth, so two bays in the same station are
   * not running the same campaign.
   *
   * Wall clock, not sim time. A hoarding is a light on a timer in the
   * world; feeding it the simulation would make the ads race during a time
   * warp, which is the same mistake the approach lamps do not make. */
  var ADS = [
    'LODESTAR LINES', 'BERTHS THAT FIT', 'HALDEN ALLOYS', 'FLY RESTED',
    'SLIPSPACE CHARTS', 'DECLARE YOUR HOLD', 'TORCH REBUILDS', 'CLEAN WATER',
    'FENWICK GRAIN', 'HULL WORK WHILE YOU WAIT', 'SEE A MEDIC', 'ORE FUTURES',
    'REACTOR SERVICE', 'NO LOOSE CARGO', 'WARM BUNKS AFT', 'MIND THE DOORS'
  ];
  var AD_SECONDS = 7;
  var AD_INK = '!#ffd36b', AD_INK2 = '!#7ed3ff';
  var ADSET = {};
  var ADSET_KEYS = [];
  var ADSET_MAX = 24;

  /* Which line is on which board right now. One place, so the mesh that is
   * built and the mesh that is cached are keyed by the same answer. */
  function adSlot(nowSeconds) {
    return Math.floor((nowSeconds || 0) / AD_SECONDS);
  }

  function berthAds(role, berth, radiusKm, slot) {
    var dress = berthDressing(role, berth, radiusKm);
    if (!dress || !dress.adBoards || !dress.adFrame) return null;
    var key = role + '#' + berth + '#' + radiusKm.toFixed(4) + '#' + slot;
    if (ADSET[key] !== undefined) return ADSET[key];

    var fr = dress.adFrame, boards = dress.adBoards;
    var m = { v: [], f: [], c: [], noAccent: true };
    for (var i = 0; i < boards.length; i++) {
      var bd = boards[i];
      var pick = ADS[(((berth * 5 + i * 3 + slot) % ADS.length) + ADS.length) % ADS.length];
      /* Sized to FIT the board rather than to a fixed height: the boards
       * are a fraction of a berth box and the berth boxes differ by a
       * factor of three across the library, so a fixed cell would overrun
       * the small ones and swim in the large. */
      var cell = Math.min(bd.hh * 2 / (GLYPH_H + 1),
                          bd.hw * 1.85 / Math.max(1, pick.length * (GLYPH_W + 1)));
      if (!(cell > 0)) continue;
      var w = glyphWidth(pick, cell), h = GLYPH_H * cell;
      pushText(m, fr.o, fr.f, fr.r, fr.u,
               bd.a + 0.03 * fr.L, bd.b - w / 2, bd.c - h / 2,
               pick, cell, (i % 2) ? AD_INK2 : AD_INK);
    }
    if (!m.f.length) { ADSET[key] = null; return null; }
    ADSET[key] = m;
    ADSET_KEYS.push(key);
    while (ADSET_KEYS.length > ADSET_MAX) delete ADSET[ADSET_KEYS.shift()];
    return m;
  }

  /* WHERE A CAR OR A HATCH IS, from the same `doors` value everything else
   * reads, so the car you see and the car you hit are one number.
   *
   * A car: `doors.car` is `{ node, f }`, carried from the arrival pose —
   * 0 at the top of its travel, 1 at the bottom. Any other car, and any
   * car when no arrival is riding it, is at rest where it was modelled.
   *
   * A hatch: hidden while ITS berth's inner gate is open (more than half),
   * matched by position the way every leaf is matched to its berth. */
  /* The car has cleared its own deck's thickness by about 2% of a run. */
  var HATCH_SHUT_AT = 0.02;

  function sameMid(a, b) {
    var dx = a[0] - b[0], dy = a[1] - b[1], dz = a[2] - b[2];
    return dx * dx + dy * dy + dz * dz <= 1e-6;
  }

  /* How far an inner gate's leaf has run back: the airlock's inner number
   * at the berth it is cycling, the far bay's on a routed arrival, shut
   * everywhere else. */
  function innerLeafOpen(lf, doors) {
    if (!doors || !lf.berthMid) return 0;
    if (doors.inner > 0 && doors.berthMid && sameMid(lf.berthMid, doors.berthMid)) return Math.min(1, doors.inner);
    if (doors.innerTo > 0 && doors.innerToMid && sameMid(lf.berthMid, doors.innerToMid)) return Math.min(1, doors.innerTo);
    return 0;
  }

  function partState(lf, doors) {
    if (lf.car) {
      var c = doors && doors.car;
      var f = (c && c.node === lf.node && c.f > 0) ? Math.min(1, c.f) : 0;
      return { f: f, hidden: false };
    }
    if (lf.hatch && lf.overCar) {
      /* A hatch over a car's shaft (carShafts): gone while the car is home
       * in it, shut once the car has left. The same `car.f` the car is
       * drawn at, so the two are driven by one number and a car can never
       * come up through a shut hatch. Closed-form, by the rail's legs. */
      /* `hatchEnd`: which end of the run the hatch is at, 0 the car's rest
       * (the ring's, in the deck it starts in) or 1 the far end (a lift
       * whose upper deck is where it goes to). */
      var cc = doors && doors.car;
      var at = (cc && cc.node === lf.overCar) ? Math.max(0, Math.min(1, cc.f)) : 0;
      var away = Math.abs(at - (lf.hatchEnd || 0));
      return { f: 0, hidden: !(away > HATCH_SHUT_AT) };
    }
    if (lf.hatch) {
      var openHere = false;
      if (doors && doors.inner > 0.5 && doors.berthMid && lf.berthMid) {
        var dx = lf.berthMid[0] - doors.berthMid[0], dy = lf.berthMid[1] - doors.berthMid[1],
            dz = lf.berthMid[2] - doors.berthMid[2];
        openHere = dx * dx + dy * dy + dz * dz <= 1e-6;
      }
      return { f: 0, hidden: openHere };
    }
    return { f: 0, hidden: false };
  }

  function drawStationModel(ctx, cam, frame, radiusKm, sunDir, model, tint, doors, section) {
    /* The cars first, whichever way the hull is drawn below: they are not
     * part of any compartment's hull, and a floor that vanished with its
     * section door would be the same invisible pad again. */
    drawMovers(ctx, cam, frame, radiusKm, sunDir, model, tint);
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
          /* And whatever is on the hoardings this minute. */
          var nowS = (typeof performance !== 'undefined' ? performance.now() : 0) / 1000;
          paintPart(ctx, cam, frame, berthAds(model, mine, radiusKm, adSlot(nowS)),
                    radiusKm, sunDir, tint);
        }
      } else {
        paintPart(ctx, cam, frame, d.hull, radiusKm, sunDir, tint);
        /* THE STAND GOES WITH THE SHIP, inside or out. It used to be drawn
         * only with the compartment, which was every view there was of a
         * berth — until the cutaway let you see one through the hull from
         * outside, and the hull, parked on a pad that was not being drawn,
         * hung six metres over a bare deck. */
        if (mine !== null) {
          paintPart(ctx, cam, frame, berthDressing(model, mine, radiusKm),
                    radiusKm, sunDir, tint);
        }
      }
      for (var i = 0; i < d.leaves.length; i++) {
        var lf = d.leaves[i];
        /* A lift car is wherever the arrival riding it says (partState). */
        if (lf.car || lf.hatch) {
          var ps = partState(lf, doors);
          if (ps.hidden) continue;
          var cs = lf.travel * ps.f;
          paintPart(ctx, cam, cs > 1e-9
            ? shiftFrame(frame, lf.axis[0] * cs, lf.axis[1] * cs, lf.axis[2] * cs, radiusKm)
            : frame, lf.mesh, radiusKm, sunDir, tint);
          continue;
        }
        var f = open;
        /* An inner gate's leaves run on the airlock's inner number, and only
         * at the berth it belongs to (innerGateLeaves). */
        if (lf.inner) f = innerLeafOpen(lf, doors);
        else if (mine !== null && lf.berthMid) {
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
    var meshes = stationMeshes();
    var mesh = meshes[model];
    if (!mesh) {
      /* Not folded in yet: ask for it (that fetches it), and draw what the
       * library has meanwhile. */
      var lp = libPort(model);
      if (lp && lp.shell && lp.shell.f.length) mesh = meshes[model] = lp.shell;
    }
    paintPart(ctx, cam, frame, mesh || meshes.orbital, radiusKm, sunDir, tint);
  }

  function paintPart(ctx, cam, frame, mesh, radiusKm, sunDir, tint) {
    if (!mesh || !mesh.f || !mesh.f.length) return;
    mesh = accented(mesh);
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
    mesh = accented(mesh);
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
  function boomTris(lib, o) { return drainJob(boomTrisJob(lib, o)); }
  function* boomTrisJob(lib, o) {
    var out = [], keys = ['shell', 'interior', 'spin'], work = 0;
    for (var k = 0; k < keys.length; k++) {
      /* The boom takes the shell WHOLE, doors included at their modelled
       * place. A camera should stand back from a doorway whether the leaf
       * is in it or not — the room is the room. */
      var m = lib[keys[k]];
      if (!m || !m.f) continue;
      for (var i = 0; i < m.f.length; i++) {
        if (++work > 15000) { work = 0; yield 0; }
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

  /* Clear height, in port radii, below which a surface cannot be the floor
   * a hull stands on: about 38 m at the smallest station, three and a half
   * times the tallest hull (11 m), so a header or a plate's underside
   * (0.009–0.013 measured) is never mistaken for it and a real bay is. */
  var DECK_MIN_ROOM = 0.03;
  /* How far under its anchor box a berth's floor may lie and still be its
   * floor: 3% of the box's height, or 0.004 radii (a floor plate's
   * thickness, the same tolerance the gate leaves are matched with). The
   * cradle's heavy throat is 0.18 radii tall and its floor is 0.0011 under
   * the box; nothing else in the library is further out than that. */
  var DECK_UNDER_BOX = 0.03, DECK_UNDER_PLATE = 0.004;

  /* Run in slices by Sim.warmTransfers (2026-11-03): 162 casts down and up
   * a big model's triangles is 40-170 ms for one berth, paid in the frame
   * that first asked where the berth's deck is. berthDeck drains it at once. */
  function berthDeck(role, i) {
    var job = berthDeckJob(role, i);
    return drainJob(job);
  }
  function berthDeckReady(role, i) {
    var lib = libPort(role), mb = lib && lib.anchors && lib.anchors.berths;
    if (!mb || !mb.length) return true;
    var k = ((i % mb.length) + mb.length) % mb.length;
    return DECK[role + '#' + k] !== undefined;
  }
  function* berthDeckJob(role, i) {
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
    var T = yield* boomTrisJob(lib, o);
    yield 0;
    /* NINE CASTS, NOT ONE, and the MEDIAN of what they hit (24-09). The
     * centreline alone fell through the hole a lift platform leaves in the
     * ring's decks and read the plate under it as the floor, which parked
     * every ring hull 0.009 radii inside the real one. A median ignores a
     * hole in the middle and a ledge at the edge alike. */
    /* AND THE FLOOR IS THE SURFACE WITH THE ROOM ABOVE IT. The art hangs
     * its berth boxes both ways — the ring's with their top AT the deck (a
     * cast from just under the top starts inside the floor plate and finds
     * its underside), the cradle's with their top at the ceiling (the first
     * thing under the top is a header 0.013 below it). So each column is
     * cast down from several heights, every surface found is a candidate,
     * and the candidate with the most clear height above it is the deck. */
    var hx = (b.max[0] - b.min[0]) * 0.25, hy = (b.max[1] - b.min[1]) * 0.25;
    /* A ROOF IS NOT A FLOOR (2026-09-25). "Most room above" counts open
     * space as room, so a bay at the TOP of a station — the new spine's
     * upper curtain bays, whose box is the doorway frame — scored its own
     * lintel as the deck: nothing above a lintel on the station's crown
     * but vacuum. Every spine parked those hulls on the roof of the door
     * (spine-m by 0.001 radii outside its box, s and l exactly on the box
     * top). So a surface in the LOWER part of the box with most of the
     * box's height clear above it is the floor, and wins; only where the
     * box has no such surface — the ring's, which hang below their deck,
     * all plate inside — does the old most-room rule decide. */
    var boxH = b.max[2] - b.min[2];
    var underTol = Math.max(DECK_UNDER_PLATE, boxH * DECK_UNDER_BOX);
    var hits = [], floors = [];
    var TOP = b.max[2] + 0.002, STEPS = 8;
    /* A DOOR IS NOT A FLOOR EITHER (2026-11-03). The ring's heavy bay opens
     * UPWARD: its box is the hall inside the hub, floor to roof, and its
     * outer doors are hatch leaves lying flat in that roof. The first thing
     * under the box's top is therefore the shut hatch, with vacuum above
     * it — and "most room above" scores vacuum as room, so every ring
     * parked its heavy hulls ON THE ROOF, on the closed doors, a stand's
     * height above the hub, outdoors. berths.test.js caught it only at a
     * 1.57 km ring: at a bigger one the hull's centre (14 m up) fell inside
     * the carved hatch cell of the occupancy grid and read as indoors by
     * voxel accident. A surface lying in one of the model's own outer gate
     * leaves is a door, and a door is shut on a hull, not stood on.
     *
     * ONLY WHERE THE BAY OPENS UPWARD. A hull stands on top of a surface
     * (+z), so a leaf under it is outside the bay only if the bay opens
     * toward +z. The yard-syn bays that open DOWNWARD lie on their doors
     * from the inside, which is a trapdoor floor and correct — measured, the
     * rule without this guard moved those hulls up to their own ceilings. */
    var opensUp = !!(b.normal && b.normal[2] > 0.5);
    var leaves = (opensUp && lib.anchors && lib.anchors.gates) || [];
    var LEAF_TOL = 0.004;
    function onLeaf(x, y, z) {
      for (var li = 0; li < leaves.length; li++) {
        var lf = leaves[li];
        if (!lf || !lf.min || !lf.max) continue;
        if (x >= lf.min[0] - LEAF_TOL && x <= lf.max[0] + LEAF_TOL &&
            y >= lf.min[1] - LEAF_TOL && y <= lf.max[1] + LEAF_TOL &&
            z >= lf.min[2] - LEAF_TOL && z <= lf.max[2] + LEAF_TOL) return true;
      }
      return false;
    }
    function castZ(p, dz) {
      var best = Infinity;
      for (var t = 0; t < T.length; t += 3) {
        var h = boomHit(p, [0, 0, dz], T[t], T[t + 1], T[t + 2]);
        if (h > 0 && h < best) best = h;
      }
      return best;
    }
    for (var sx = -1; sx <= 1; sx++) {
      for (var sy = -1; sy <= 1; sy++) {
        var cx = o[0] + sx * hx, cy = o[1] + sy * hy;
        var pick = null, room = -1, seen = {};
        var floorPick = null, floorRoom = -1;
        for (var st = 0; st <= STEPS; st++) {
          var sz = TOP - (TOP - b.min[2]) * st / STEPS;
          yield 0;
          var dn = castZ([cx, cy, sz], -1);
          if (!isFinite(dn)) continue;
          var zc = sz - dn;
          /* A deck outside the box it belongs to is not this berth's deck —
           * but a deck a hair UNDER the box is. The cradle's heavy throat
           * (berthLAlphaThroatFloor) is anchored with its bottom 1.2 m above
           * its own floor plate, so the floor fell outside the box, every
           * candidate left was the lintel, and the hull was parked on the
           * roof of its own doorway — Astra at Mirven: "the ship is sitting
           * at the top of the inside of the bay rather than at the base of
           * it" (2026-11-03). DECK_UNDER_BOX of the box's height, or a
           * plate's thickness, whichever is more. */
          if (zc < b.min[2] - underTol || zc > TOP) continue;
          if (onLeaf(cx, cy, zc)) continue;
          var kz = zc.toFixed(5);
          if (seen[kz]) continue;
          seen[kz] = true;
          yield 0;
          var up = castZ([cx, cy, zc + 1e-4], 1);
          if (!isFinite(up)) up = 1;
          if (up > room + 1e-6) { room = up; pick = zc; }
          if (zc <= b.max[2] - boxH * 0.25 && up >= boxH * 0.6 && up > floorRoom + 1e-6) {
            floorRoom = up; floorPick = zc;
          }
        }
        if (floorPick !== null) { pick = floorPick; floors.push(floorPick); }
        if (pick !== null) hits.push(pick);
      }
    }
    hits.sort(function (p, q) { return p - q; });
    var zRoom = hits.length ? hits[Math.floor(hits.length / 2)] : null;
    /* THE ORIGINAL READING WINS WHERE IT WAS RIGHT: the first surface under
     * the box's top along the centreline, as it has always been — unless
     * there is no room above it for a hull (DECK_MIN_ROOM), which is the
     * signature of having read the underside of a plate or a header. */
    var first = castZ(o, -1);
    var z = isFinite(first) ? o[2] - first : null;
    if (z === null || z < b.min[2] || z > b.max[2]) z = b.max[2];
    var upOld = castZ([o[0], o[1], z + 1e-4], 1);
    if (zRoom !== null && !(upOld >= DECK_MIN_ROOM)) z = zRoom;
    else if (zRoom !== null && onLeaf(o[0], o[1], z)) {
      /* Off the shut doors — but only onto something that is itself a
       * deck. At yard-syn-m and -l the scan's median lands on a ledge a few
       * metres under the leaves (0.008 radii of room); a hull is no better
       * off wedged there than on the roof, so those keep the old reading
       * until someone looks at that art. Measured 2026-11-03: every ring's
       * heavy bay moves to its hall floor (0.36 radii of room) and
       * yard-syn-s's upward bay to its throat floor (0.073); nothing else
       * in the library moves. */
      var upRoom = castZ([o[0], o[1], zRoom + 1e-4], 1);
      if (upRoom >= DECK_MIN_ROOM) z = zRoom;
    }
    /* AND A LINTEL IS NOT A FLOOR (2026-11-03). The original reading — the
     * first surface under the box's top — is right for a box that hangs
     * below its deck (the ring's: plate inside, the deck at its top). It is
     * wrong for a box that IS the throat, floor to lintel: there the first
     * surface under the top is the lintel's own upper face, the open room
     * over a doorway counts as "room above", and the hull was parked on top
     * of the doorway. That is the cradle's heavy throat at Mirven, and
     * Astra's "sitting at the top of the inside of the bay rather than at
     * the base of it". So where most of the columns found a FLOOR — low in
     * the box with most of the box clear over it (floorPick above) — and it
     * is under the reading, the floor wins. A box that hangs below its deck
     * has no such floor (it is plate inside), so the ring keeps its reading. */
    /* Only a reading AT the top of the box (its top tenth) is a lintel's:
     * the civil yards' cradles stand in the middle of boxes seven hundred
     * metres tall, open to space over them, and are not doorways. */
    if (floors.length * 2 > hits.length && z >= b.max[2] - boxH * 0.1) {
      floors.sort(function (p, q) { return p - q; });
      var zFloor = floors[Math.floor(floors.length / 2)];
      if (zFloor < z - DECK_MIN_ROOM * 0.5) z = zFloor;
    }
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

  /* Built in slices too (Sim.warmTransfers, 2026-11-03): 30-150 ms for a
   * big model, which the warm-up must not pay in one frame. portTriangles
   * drains the same job at once; a job half-done by the warm-up is simply
   * finished. */
  var TRI_JOBS = {};
  function portTriangles(role) {
    if (TRIDEX[role] !== undefined) return TRIDEX[role];
    return drainJob(TRI_JOBS[role] || (TRI_JOBS[role] = trianglesJob(role)));
  }
  function* trianglesJob(role) {
    if (TRIDEX[role] !== undefined) return TRIDEX[role];
    var lib = libPort(role);
    if (!lib) { TRIDEX[role] = null; delete TRI_JOBS[role]; return null; }
    var work = 0;

    /* THE HULL WITHOUT ITS DOOR LEAVES. They used to be in here, baked at
     * their CLOSED position, which made a shut door solid by accident and
     * an open one solid on purpose — you could not fly through a door that
     * had run all the way back into its pocket. Leaves are tested
     * separately, at wherever they actually are this frame; see leafHit. */
    var d0 = portDoors(role);
    var tri = [], keys = ['shell', 'interior', 'spin'];
    var lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    var runs = [];                       // which bucket each run of tri is (a sweep's question)
    for (var k = 0; k < keys.length; k++) {
      var m = (keys[k] === 'shell' && d0) ? d0.hull : (yield* openBucketJob(role, keys[k]));
      if (!m || !m.v || !m.f) continue;
      runs.push({ key: keys[k], from: tri.length });
      yield 0;
      for (var i = 0; i < m.f.length; i++) {
        if (++work > 3000) { work = 0; yield 0; }
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
    if (!tri.length) { TRIDEX[role] = null; delete TRI_JOBS[role]; return null; }
    yield 0;

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
      /* Counted in bins touched: one big plate can sit in thousands. */
      work += 4 + (c1[0] - c0[0] + 1) * (c1[1] - c0[1] + 1) * (c1[2] - c0[2] + 1);
      if (work > 6000) { work = 0; yield 0; }
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
    TRIDEX[role] = { n: N, lo: lo, inv: inv, tri: tri, bins: bins, mark: 0, runs: runs,
                     seen: new Int32Array(tri.length / 3) };
    delete TRI_JOBS[role];
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
      if (lf.inner) {
        /* A blast door between a berth and the station: shut unless this is
         * the berth whose airlock is cycling, then as far as its inner gate
         * is (innerGateLeaves). Not part of any one doorway's question -
         * except a route's (`routeInner`, routeDoors): the bays a transfer
         * does not belong to keep theirs shut, and it must go round. */
        if (doors && doors.onlyMine && !doors.routeInner) continue;
        f = innerLeafOpen(lf, doors);
      } else if (lf.car || lf.hatch) {
        /* Neither is a door leaf, so a question about one doorway leaves
         * them out; otherwise they collide where they are drawn — the same
         * partState the renderer reads. (Both were solid hull before they
         * were split out, so a shut hatch and a car at rest still are.) */
        if (doors && doors.onlyMine) continue;
        var ps = partState(lf, doors);
        if (ps.hidden) continue;
        f = ps.f;
      } else if (want && lf.berthMid) {
        var dx = lf.berthMid[0] - want[0], dy = lf.berthMid[1] - want[1],
            dz = lf.berthMid[2] - want[2];
        if (dx * dx + dy * dy + dz * dz > 1e-6) {
          /* `onlyMine` asks about ONE door: the other berths' leaves are
           * left out entirely. For a question like "is this doorway open",
           * where a neighbour's stowed leaf standing beside it is not the
           * answer being asked for. */
          if (doors.onlyMine) continue;
          f = 0;
        }
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
          /* Which part was hit, for a sweep that has to say what is in the
           * way (a car, a hatch, a neighbour's leaf) and not just that
           * something is. */
          if (h && (!best || h.t < best.t)) { best = h; best.part = lf.node; }
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
    var best = Infinity, bn = null, bt = -1;
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
            best = tt; bt = t0;
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
    /* `tri`: which triangle (an index into ix.tri), so a sweep can name the
     * bucket and the place it hit rather than only that something is there. */
    var hull = bn ? { t: best, normal: bn, tri: bt } : null;
    /* AND THE DOORS, which the index cannot hold because they move. Nearest
     * of the two wins, so a leaf sliding shut in front of you stops you
     * before the wall behind it does. */
    var leaf = leafHit(role, a, b, doors);
    if (leaf && (!hull || leaf.t < hull.t)) return leaf;
    return hull;
  }

  /* ---- A ROUTE THROUGH OPEN SPACE ONLY (2026-11-03) ----------------------
   *
   * Astra, of a transfer at Halden Dock: "phased through the wall". The
   * corners an S/M route rides between were found by glb2hulls on its
   * 128-cell route grid and then string-pulled by line of sight on that
   * same grid — and the grid lets a route cross a CARRIER's volume "deck
   * plating and all", and is 80 m a cell at a 5 km station. So a pulled
   * corner-to-corner line could run four kilometres straight through the
   * cylinder's structure (cylinder-m b0, the second corner to the third),
   * and measured over every orbital model with the hull's own half-extents,
   * 85 of 131 berths had the transfer or lift leg through a surface.
   *
   * So each leg between two FIXED points (a stand, a car stop) is asked
   * against the triangles, with the hull's cross-section: a line down the
   * middle and one at each side and above and below, as berths.test sweeps
   * it. A leg that is clear is kept exactly. A leg that is not is routed
   * again, here, on a grid fitted to that leg and to the hull — a cell is
   * three quarters of her half-width — over the triangles the collision
   * uses, every surface grown by her half-extent, then pulled taut again
   * by the exact test rather than by the grid. Doors do not block a route
   * (they open for her) and nor do cars or hatches, which is how the art's
   * own route was found.
   *
   * `pts` are [x, y, z] in the model's normalised frame; `half` is { w, h },
   * the hull's half-width and half-height in the same units. Returns the
   * new polyline, ends unchanged, and `.blocked`, the number of legs that
   * could not be cleared (kept as they were). */
  var ROUTE_DOORS = { open: 1, inner: 1, onlyMine: true, berthMid: [9, 9, 9] };
  /* A transfer's doors (2026-11-03): every outer door, car and hatch out of
   * the question as before, and the blast doors of the two bays it runs
   * between open - every OTHER bay's shut, which is how the airlock poses
   * them on the way through. A route through a third bay's hall used to be
   * found through its blast door (cradle-s, once its hoist bore was whole
   * again: the leg from berthLBeta's side ran through its shut inner gate). */
  function routeDoors(entryMid, destMid) {
    if (!entryMid && !destMid) return ROUTE_DOORS;
    return { open: 1, inner: 1, onlyMine: true, routeInner: true, berthMid: entryMid || [9, 9, 9],
             innerTo: 1, innerToMid: destMid || null };
  }
  var ROUTE_CELLS = 6e5;               // the most cells one leg's grid may have

  function routeOffsets(a, b, half) {
    var d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    var L = Math.sqrt(dot3(d, d));
    if (!(L > 1e-12)) return [[0, 0, 0]];
    d = [d[0] / L, d[1] / L, d[2] / L];
    /* Across: level and square to the leg. Up: the third axis. A leg
     * straight up a shaft takes x for across. */
    var r = [d[1], -d[0], 0], rl = Math.sqrt(r[0] * r[0] + r[1] * r[1]);
    r = rl > 1e-6 ? [r[0] / rl, r[1] / rl, 0] : [1, 0, 0];
    var u = [d[1] * r[2] - d[2] * r[1], d[2] * r[0] - d[0] * r[2], d[0] * r[1] - d[1] * r[0]];
    var w = half.w * 0.9, h = half.h * 0.9;
    return [[0, 0, 0],
            [r[0] * w, r[1] * w, r[2] * w], [-r[0] * w, -r[1] * w, -r[2] * w],
            [u[0] * h, u[1] * h, u[2] * h], [-u[0] * h * 0.6, -u[1] * h * 0.6, -u[2] * h * 0.6]];
  }

  function routeLegClear(role, a, b, half, doors) {
    var offs = routeOffsets(a, b, half);
    for (var i = 0; i < offs.length; i++) {
      var o = offs[i];
      if (portSegmentHit(role, [a[0] + o[0], a[1] + o[1], a[2] + o[2]],
                         [b[0] + o[0], b[1] + o[1], b[2] + o[2]], doors || ROUTE_DOORS)) return false;
    }
    return true;
  }

  /* IN SLICES (2026-11-03). A leg's grid search is 0.3-2 s at a big station
   * (measured in node: cylinder-s at 5.99 km, 2.1 s of routeLeg over four
   * berths), which was paid in one frame the first time a hull was routed to
   * a berth. So the search is a generator that yields every ROUTE_SLICE units
   * of work: clearRoute drains it at once as before, and Sim.warmTransfers
   * drains it a few milliseconds a frame after system entry. Same answer
   * either way - nothing here depends on when it is run. */
  var ROUTE_SLICE = 6000;
  function drainJob(gen) {
    var r;
    do { r = gen.next(); } while (!r.done);
    return r.value;
  }
  function routeLeg(role, a, b, half, grow, tight, doors) { return drainJob(routeLegJob(role, a, b, half, grow, tight, doors)); }
  function* routeLegJob(role, a, b, half, grow, tight, doors) {
    var ix = portTriangles(role);
    if (!ix) return null;
    var work = 0;
    var span = Math.max(half.w, half.h);
    var len = Math.sqrt(Math.pow(b[0] - a[0], 2) + Math.pow(b[1] - a[1], 2) + Math.pow(b[2] - a[2], 2));
    var margin = Math.max(span * 12, len * (grow || 0.35));
    var lo = [], hi = [];
    for (var ax = 0; ax < 3; ax++) {
      lo[ax] = Math.min(a[ax], b[ax]) - margin;
      hi[ax] = Math.max(a[ax], b[ax]) + margin;
    }
    /* Three quarters of her half-width, unless the box would hold more than
     * ROUTE_CELLS cells — a long leg at a big station is coarser, and the
     * exact pull below is what says whether the result is clear. */
    var vol = (hi[0] - lo[0]) * (hi[1] - lo[1]) * (hi[2] - lo[2]);
    var cell = Math.max(half.w * 0.75, Math.cbrt(vol / ROUTE_CELLS));
    var n = [], inv = 1 / cell;
    for (ax = 0; ax < 3; ax++) n[ax] = Math.max(2, Math.ceil((hi[ax] - lo[ax]) * inv));
    var NX = n[0], NY = n[1], NZ = n[2], NXY = NX * NY, NN = NXY * NZ;
    var wall = new Uint8Array(NN);
    function at(x, y, z) { return (z * NY + y) * NX + x; }

    /* The surfaces, from the collision's own triangle bins over this box. */
    var tri = ix.tri, TN = ix.n;
    var b0 = [], b1 = [];
    for (ax = 0; ax < 3; ax++) {
      b0[ax] = Math.max(0, Math.floor((lo[ax] - ix.lo[ax]) * ix.inv[ax]));
      b1[ax] = Math.min(TN - 1, Math.floor((hi[ax] - ix.lo[ax]) * ix.inv[ax]));
    }
    ix.mark++;
    var mark = ix.mark;
    for (var bx = b0[0]; bx <= b1[0]; bx++) for (var by = b0[1]; by <= b1[1]; by++) for (var bz = b0[2]; bz <= b1[2]; bz++) {
      var bin = ix.bins[(bx * TN + by) * TN + bz];
      if (!bin) continue;
      for (var q = 0; q < bin.length; q++) {
        var t0 = bin[q];
        if (ix.seen[t0 / 3] === mark) continue;
        ix.seen[t0 / 3] = mark;
        var p0 = tri[t0], p1 = tri[t0 + 1], p2 = tri[t0 + 2];
        var e = 0;
        for (var k = 0; k < 3; k++) {
          e = Math.max(e, Math.abs(p1[k] - p0[k]), Math.abs(p2[k] - p0[k]), Math.abs(p2[k] - p1[k]));
        }
        var ns = Math.min(512, Math.max(1, Math.ceil(e * inv * 2)));
        work += ns * ns / 2 + 8;
        if (work > ROUTE_SLICE) { work = 0; yield 0; }
        for (var i = 0; i <= ns; i++) {
          for (var j = 0; i + j <= ns; j++) {
            var u = i / ns, v = j / ns;
            var gx = Math.floor((p0[0] + (p1[0] - p0[0]) * u + (p2[0] - p0[0]) * v - lo[0]) * inv);
            var gy = Math.floor((p0[1] + (p1[1] - p0[1]) * u + (p2[1] - p0[1]) * v - lo[1]) * inv);
            var gz = Math.floor((p0[2] + (p1[2] - p0[2]) * u + (p2[2] - p0[2]) * v - lo[2]) * inv);
            if (gx < 0 || gy < 0 || gz < 0 || gx >= NX || gy >= NY || gz >= NZ) continue;
            wall[at(gx, gy, gz)] = 1;
          }
        }
      }
    }

    /* And the shut blast doors of other bays, when the route is asked with
     * them (routeDoors): walls like any other. */
    var dd = doors && doors.routeInner ? portDoors(role) : null;
    for (var li = 0; dd && li < dd.leaves.length; li++) {
      var lfr = dd.leaves[li];
      if (!lfr.inner || innerLeafOpen(lfr, doors) >= 0.5) continue;
      var lm = lfr.mesh;
      for (var lfi = 0; lfi < lm.f.length; lfi++) {
        var lface = lm.f[lfi];
        for (var lj = 1; lj + 1 < lface.length; lj++) {
          var q0 = lm.v[lface[0]], q1 = lm.v[lface[lj]], q2 = lm.v[lface[lj + 1]];
          var le = 0;
          for (var lk = 0; lk < 3; lk++) le = Math.max(le, Math.abs(q1[lk] - q0[lk]), Math.abs(q2[lk] - q0[lk]), Math.abs(q2[lk] - q1[lk]));
          var lns = Math.min(512, Math.max(1, Math.ceil(le * inv * 2)));
          for (var li2 = 0; li2 <= lns; li2++) for (var lj2 = 0; li2 + lj2 <= lns; lj2++) {
            var lu = li2 / lns, lv = lj2 / lns;
            var lx = Math.floor((q0[0] + (q1[0] - q0[0]) * lu + (q2[0] - q0[0]) * lv - lo[0]) * inv);
            var ly = Math.floor((q0[1] + (q1[1] - q0[1]) * lu + (q2[1] - q0[1]) * lv - lo[1]) * inv);
            var lz = Math.floor((q0[2] + (q1[2] - q0[2]) * lu + (q2[2] - q0[2]) * lv - lo[2]) * inv);
            if (lx >= 0 && ly >= 0 && lz >= 0 && lx < NX && ly < NY && lz < NZ) wall[at(lx, ly, lz)] = 1;
          }
        }
      }
      yield 0;
    }

    /* Grown by her half-extent: steps to the nearest surface, out to `grow`. */
    var reach = tight ? 0 : Math.max(1, Math.ceil(span * inv));
    var dist = new Uint8Array(NN).fill(255), qu = new Int32Array(NN), qh = 0, qt = 0;
    for (var w0 = 0; w0 < NN; w0++) if (wall[w0]) { dist[w0] = 0; qu[qt++] = w0; }
    work += NN / 8;
    while (qh < qt) {
      if (++work > ROUTE_SLICE) { work = 0; yield 0; }
      var c = qu[qh++], dn = dist[c] + 1;
      if (dn > reach + 3) continue;
      var cz = (c / NXY) | 0, cr = c - cz * NXY, cy = (cr / NX) | 0, cx = cr - cy * NX;
      if (cx > 0 && dist[c - 1] > dn) { dist[c - 1] = dn; qu[qt++] = c - 1; }
      if (cx < NX - 1 && dist[c + 1] > dn) { dist[c + 1] = dn; qu[qt++] = c + 1; }
      if (cy > 0 && dist[c - NX] > dn) { dist[c - NX] = dn; qu[qt++] = c - NX; }
      if (cy < NY - 1 && dist[c + NX] > dn) { dist[c + NX] = dn; qu[qt++] = c + NX; }
      if (cz > 0 && dist[c - NXY] > dn) { dist[c - NXY] = dn; qu[qt++] = c - NXY; }
      if (cz < NZ - 1 && dist[c + NXY] > dn) { dist[c + NXY] = dn; qu[qt++] = c + NXY; }
    }
    function cellOf(p) {
      return [Math.max(0, Math.min(NX - 1, Math.floor((p[0] - lo[0]) * inv))),
              Math.max(0, Math.min(NY - 1, Math.floor((p[1] - lo[1]) * inv))),
              Math.max(0, Math.min(NZ - 1, Math.floor((p[2] - lo[2]) * inv)))];
    }
    var ca = cellOf(a), cb = cellOf(b);
    var sq = at(ca[0], ca[1], ca[2]), gq = at(cb[0], cb[1], cb[2]);
    /* The two ends are where the art put her (a stand, a car's stop) and
     * stand a standoff off a floor, inside the grown margin by design: the
     * cells round each end are hers. */
    var endR = reach + 1;
    function passable(q, x, y, z) {
      if (dist[q] > reach && !wall[q]) return true;
      if (wall[q]) return false;
      return (Math.abs(x - ca[0]) <= endR && Math.abs(y - ca[1]) <= endR && Math.abs(z - ca[2]) <= endR) ||
             (Math.abs(x - cb[0]) <= endR && Math.abs(y - cb[1]) <= endR && Math.abs(z - cb[2]) <= endR);
    }

    /* A*, 26 neighbours, a binary heap. A cell near a surface costs a
     * little more, so the route keeps to the middle of a passage. */
    var g = new Float32Array(NN).fill(Infinity), from = new Int32Array(NN).fill(-1);
    var closed = new Uint8Array(NN);
    var heap = [], hf = [];
    function push(qq, f) {
      heap.push(qq); hf.push(f);
      var i2 = heap.length - 1;
      while (i2 > 0) {
        var p = (i2 - 1) >> 1;
        if (hf[p] <= hf[i2]) break;
        var tq = heap[p]; heap[p] = heap[i2]; heap[i2] = tq;
        var tf = hf[p]; hf[p] = hf[i2]; hf[i2] = tf;
        i2 = p;
      }
    }
    function pop() {
      var top = heap[0], last = heap.pop(), lf = hf.pop();
      if (heap.length) {
        heap[0] = last; hf[0] = lf;
        var i3 = 0;
        for (;;) {
          var l = i3 * 2 + 1, r2 = l + 1, m = i3;
          if (l < heap.length && hf[l] < hf[m]) m = l;
          if (r2 < heap.length && hf[r2] < hf[m]) m = r2;
          if (m === i3) break;
          var tq2 = heap[m]; heap[m] = heap[i3]; heap[i3] = tq2;
          var tf2 = hf[m]; hf[m] = hf[i3]; hf[i3] = tf2;
          i3 = m;
        }
      }
      return top;
    }
    function hcost(x, y, z) {
      return Math.sqrt((x - cb[0]) * (x - cb[0]) + (y - cb[1]) * (y - cb[1]) + (z - cb[2]) * (z - cb[2]));
    }
    g[sq] = 0;
    push(sq, hcost(ca[0], ca[1], ca[2]));
    var found = false, steps = 0;
    while (heap.length && steps < ROUTE_CELLS) {
      if ((work += 30) > ROUTE_SLICE) { work = 0; yield 0; }
      var cq = pop();
      if (closed[cq]) continue;
      closed[cq] = 1; steps++;
      if (cq === gq) { found = true; break; }
      var z3 = (cq / NXY) | 0, r3 = cq - z3 * NXY, y3 = (r3 / NX) | 0, x3 = r3 - y3 * NX;
      for (var dz = -1; dz <= 1; dz++) for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) {
        if (!dx && !dy && !dz) continue;
        var nx = x3 + dx, ny = y3 + dy, nz = z3 + dz;
        if (nx < 0 || ny < 0 || nz < 0 || nx >= NX || ny >= NY || nz >= NZ) continue;
        var nq = at(nx, ny, nz);
        if (closed[nq] || !passable(nq, nx, ny, nz)) continue;
        var step = Math.sqrt(dx * dx + dy * dy + dz * dz);
        var near = dist[nq] <= reach + 3 ? (reach + 4 - dist[nq]) * 0.3 : 0;
        var ng = g[cq] + step + near;
        if (ng < g[nq]) { g[nq] = ng; from[nq] = cq; push(nq, ng + hcost(nx, ny, nz)); }
      }
    }
    if (!found) return null;
    var cells = [];
    for (var cc = gq; cc >= 0; cc = from[cc]) cells.push(cc);
    cells.reverse();
    var pts = cells.map(function (q3) {
      var z4 = (q3 / NXY) | 0, r4 = q3 - z4 * NXY, y4 = (r4 / NX) | 0, x4 = r4 - y4 * NX;
      return [lo[0] + (x4 + 0.5) * cell, lo[1] + (y4 + 0.5) * cell, lo[2] + (z4 + 0.5) * cell];
    });
    pts[0] = a.slice(); pts[pts.length - 1] = b.slice();
    /* Pulled taut by the EXACT test, so a corner is dropped only where the
     * hull's whole cross-section clears the triangles between its
     * neighbours. Binary search on the furthest visible cell keeps it to a
     * few dozen tests a leg. */
    var outp = [pts[0]], i5 = 0;
    while (i5 < pts.length - 1) {
      var loI = i5 + 1, hiI = pts.length - 1, bestI = i5 + 1;
      if (routeLegClear(role, pts[i5], pts[hiI], half, doors)) bestI = hiI;
      else {
        while (loI <= hiI) {
          yield 0;
          var mid = (loI + hiI) >> 1;
          if (routeLegClear(role, pts[i5], pts[mid], half, doors)) { bestI = mid; loI = mid + 1; }
          else hiI = mid - 1;
        }
      }
      outp.push(pts[bestI]);
      i5 = bestI;
      yield 0;
    }
    return outp;
  }

  /* THE CHEAP WAY ROUND FIRST: a corner cut by the converter's pull is
   * usually a diagonal across the corner of a doorway or a deck edge, and
   * the way round it is one of the six axis-ordered dog-legs between the
   * two ends (along x then y then z, and the other five orders), or that
   * again on either half. Tried shortest first, each judged exactly. */
  function* dogLegJob(role, a, b, half, depth, doors) {
    var orders = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
    var tries = [];
    for (var o = 0; o < orders.length; o++) {
      var c1 = a.slice(), c2;
      c1[orders[o][0]] = b[orders[o][0]];
      c2 = c1.slice();
      c2[orders[o][1]] = b[orders[o][1]];
      var pts = [a, c1, c2, b].filter(function (p, i, arr) {
        return i === 0 || Math.abs(p[0] - arr[i - 1][0]) + Math.abs(p[1] - arr[i - 1][1]) +
                          Math.abs(p[2] - arr[i - 1][2]) > 1e-9;
      });
      tries.push(pts);
    }
    for (var t = 0; t < tries.length; t++) {
      var ok = true;
      for (var k = 1; k < tries[t].length && ok; k++) {
        ok = routeLegClear(role, tries[t][k - 1], tries[t][k], half, doors);
        yield 0;
      }
      if (ok) return tries[t];
    }
    if (depth > 0) {
      /* Halve it, at the level of either end, and try each half. */
      var mids = [[(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, a[2]], [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, b[2]],
                  [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]];
      for (var m = 0; m < mids.length; m++) {
        var h1 = routeLegClear(role, a, mids[m], half, doors) ? [a, mids[m]] : (yield* dogLegJob(role, a, mids[m], half, depth - 1, doors));
        yield 0;
        if (!h1) continue;
        var h2 = routeLegClear(role, mids[m], b, half, doors) ? [mids[m], b] : (yield* dogLegJob(role, mids[m], b, half, depth - 1, doors));
        yield 0;
        if (h2) return h1.concat(h2.slice(1));
      }
    }
    return null;
  }

  function clearRoute(role, pts, half, doors) { return drainJob(clearRouteJob(role, pts, half, doors)); }
  function* clearRouteJob(role, pts, half, doors) {
    if (!pts || pts.length < 2 || !half) return pts;
    var out = [pts[0]], blocked = 0;
    for (var i = 1; i < pts.length; i++) {
      var a = pts[i - 1], b = pts[i];
      yield 0;
      if (routeLegClear(role, a, b, half, doors)) { out.push(b); continue; }
      /* Her clearance first; failing that a wider box; failing that the
       * bare surfaces, with the exact pull still the judge. */
      var leg = yield* dogLegJob(role, a, b, half, 1, doors);
      yield 0;
      if (!leg) leg = yield* routeLegJob(role, a, b, half, 0.35, false, doors);
      if (leg) {
        for (var c = 1; c < leg.length; c++) {
          yield 0;
          if (!routeLegClear(role, leg[c - 1], leg[c], half, doors)) { leg = null; break; }
        }
      }
      if (!leg) { blocked++; out.push(b); continue; }
      for (var k = 1; k < leg.length; k++) out.push(leg[k]);
    }
    out.blocked = blocked;
    return out;
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
    /* The whole hull, cars included at their rest poses: lifting the cars
     * out for drawing must not open holes in what a hull collides with. */
    var shell = lib && (lib.solidShell || lib.shell);
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
    if (role && role.indexOf('crawler:') === 0) return false;     // her hangar is in her hull
    if (drawPortPart(ctx, cam, frame, radiusKm, sunDir, role, 'interior', tint)) return true;
    var mesh = accented(stationMeshes().hall);
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

  /* ======================================================================
   * TEARS ON THE GPU: LENS, VEIL AND LIGHTNING (2026-10-21)
   * ======================================================================
   * Astra signed off a mockup and asked for it in the game, arrival and
   * departure both. On the world layer a wake is now drawn by gl.js
   * (GL.setTears for the lens, GL.queueTear for the cloud, veil and lips,
   * GL.queueBolts for the lightning, which is its own shader); drawWake
   * below stays as the complete 2D fallback. This block is the arithmetic
   * both sides share, in plain JS so node can test it.
   *
   * Lore, in Astra's words, which is why nothing here radiates forward or
   * carries particles: "we're not creating a bubble of superluminal space
   * which carries particles, we're tearing space a new arsehole and
   * punching our ship into the dimension which holds up 4D spacetime,
   * beneath physics itself. Nobody knows why." */

  /* The point-mass lens. A source at angle beta from the lens, with
   * Einstein angle E, is seen at two places on the line through the lens:
   * `plus` on its own side (brighter) and `minus` on the far side (negative
   * = across the lens). mu are the magnifications. VERT_STARS in gl.js is
   * this, line for line. */
  function lensImages(beta, E) {
    var root = Math.sqrt(beta * beta + 4 * E * E);
    var u = beta / E;
    var m = (u * u + 2) / (2 * u * Math.sqrt(u * u + 4));
    return { plus: 0.5 * (beta + root), minus: 0.5 * (beta - root),
             muPlus: m + 0.5, muMinus: m - 0.5 };
  }
  /* And backwards, for a view ray (planets): where did light seen at
   * theta come from? */
  function lensSource(theta, E) { return theta - E * E / theta; }

  /* Where a tear is on screen and how big each part of it is, in pixels.
   * The cloud's radius `r` follows drawWake exactly — same floor, same cap —
   * so a wake is the same size on both renderers; the Einstein radius is
   * tied to it (the glow reaches 1/e at about r), so the lens shrinks with
   * the cloud as the wake decays. `pole` is the system's up: the slit runs
   * along it on screen. TEAR_LENS_GAIN scales only the bending (thetaE),
   * not the cloud or slit, so lens strength is tuned apart from size. */
  var TEAR_E_PER_R = 1 / 2.4;
  var TEAR_LENS_GAIN = 1.55;
  function tearScreen(cam, pos, wake, size, deep, pole) {
    var p = cam.project(pos);
    if (!p) return null;
    if (p.x < -400 || p.x > cam.w + 400 || p.y < -400 || p.y > cam.h + 400) return null;
    deep = Math.max(0, Math.min(1, deep || 0));
    var floor = 2.2 + Math.min(3.2, size / 22000);
    var r = Math.max(floor, Math.min(Math.min(cam.w, cam.h) * 0.10, size * p.scale));
    r *= 1 + 0.6 * deep;
    var open = wake.decay !== undefined ? wake.decay
      : Math.max(0, 1 - (wake.age || 0) / (wake.life || 57600));
    var glow = wake.glow !== undefined ? wake.glow : wake.strength;
    glow = Math.max(0, Math.min(1.4, (glow || 0) * (1 + 0.8 * deep)));
    var E = r * TEAR_E_PER_R;
    var H = E * 1.5 + 4, W = (E * 0.40 + 1.5) * open;
    /* The slit's direction on screen: the pole, projected at the tear. */
    var along = [0, -1];
    if (pole) {
      var q = cam.project({ x: pos.x + pole.x * size, y: pos.y + pole.y * size, z: pos.z + pole.z * size });
      if (q) {
        var ax = q.x - p.x, ay = q.y - p.y, al = Math.sqrt(ax * ax + ay * ay);
        if (al > 1e-6) along = [ax / al, ay / al];
      }
    }
    var dx = pos.x - cam.eye.x, dy = pos.y - cam.eye.y, dz = pos.z - cam.eye.z;
    var dl = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    return {
      x: p.x, y: p.y, depth: p.depth, r: r, E: E, W: W, H: H,
      roll: [along[1], -along[0]],            // the across-the-slit axis
      arrival: wake.kind === 'arrival', open: open, glow: glow,
      thetaE: E * TEAR_LENS_GAIN / cam.flen,
      dist: dl,                               // km: only what is beyond this bends
      dir: { x: dx / dl, y: dy / dl, z: dz / dl }
    };
  }

  /* ---- the lightning ----------------------------------------------------
   * Astra: "more like lightning, forked, and coming from the churning
   * cloud", "the energy should cross the dark space, not align with it",
   * and for an arrival "very large, angry bolts of plasma discharge jumping
   * the gap". A bolt is built once, in units of the slit's half-height,
   * x across the rip and y along it: a jagged main channel from the cloud
   * on one side to the cloud on the other, plus forks. It re-flashes down
   * the same channel two to four times, like a real stroke, and dies.
   * Visual only, so Math.random is fine — nothing about a system depends
   * on where a spark went. `rnd` can be passed in for a test. */
  function jagLine(a, b, rough, depth, rnd) {
    var pts = [a, b];
    for (var lvl = 0; lvl < depth; lvl++) {
      var nx = [pts[0]];
      for (var i = 0; i < pts.length - 1; i++) {
        var p = pts[i], q = pts[i + 1];
        var dx = q[0] - p[0], dy = q[1] - p[1], L = Math.sqrt(dx * dx + dy * dy) || 1e-9;
        var off = (rnd() - 0.5) * L * rough;
        nx.push([(p[0] + q[0]) / 2 - dy / L * off, (p[1] + q[1]) / 2 + dx / L * off], q);
      }
      pts = nx;
    }
    return pts;
  }
  function makeBolt(Wn, arrival, rnd) {
    rnd = rnd || Math.random;
    var side = rnd() < 0.5 ? -1 : 1;
    var y0 = rnd() * 1.5 - 0.75;
    var reachA = arrival ? 3.2 + rnd() * 2.2 : 1.5 + rnd() * 1.2;
    var reachB = arrival ? 3.2 + rnd() * 2.2 : 1.5 + rnd() * 1.2;
    var a = [-side * Wn * reachA, y0];
    var b = [side * Wn * reachB, y0 + (rnd() - 0.5) * (arrival ? 0.8 : 0.45)];
    var main = jagLine(a, b, arrival ? 0.75 : 0.55, arrival ? 6 : 5, rnd);
    var branches = [{ pts: main, core: arrival ? 2.6 : 1.5, halo: arrival ? 9 : 7, k: 1 }];
    var nf = arrival ? 2 + Math.floor(rnd() * 3)
                     : 1 + (rnd() < 0.6 ? 1 : 0) + (rnd() < 0.25 ? 1 : 0);
    var span = Math.sqrt((b[0] - a[0]) * (b[0] - a[0]) + (b[1] - a[1]) * (b[1] - a[1]));
    for (var f = 0; f < nf; f++) {
      var i0 = Math.floor(main.length * (0.2 + rnd() * 0.6));
      var o = main[i0], nxt = main[Math.min(main.length - 1, i0 + 3)];
      var dx = nxt[0] - o[0], dy = nxt[1] - o[1], L = Math.sqrt(dx * dx + dy * dy) || 1e-9;
      var ang = (rnd() < 0.5 ? -1 : 1) * (0.35 + rnd() * 0.6);
      var c = Math.cos(ang), s = Math.sin(ang);
      var len = span * (0.2 + rnd() * 0.35);
      var ex = [o[0] + (dx * c - dy * s) / L * len, o[1] + (dx * s + dy * c) / L * len];
      branches.push({ pts: jagLine(o, ex, arrival ? 0.75 : 0.6, arrival ? 5 : 4, rnd),
                      core: arrival ? 1.7 : 1.0, halo: arrival ? 6 : 4.5, k: arrival ? 0.8 : 0.65 });
    }
    var flashes = [], t = 0, n = 2 + Math.floor(rnd() * 3);
    for (var j = 0; j < n; j++) { flashes.push([t, 0.035 + rnd() * 0.04]); t += 0.05 + rnd() * 0.08; }
    return { branches: branches, flashes: flashes, life: t + 0.05, age: 0 };
  }
  function boltLevel(bt) {
    var v = 0;
    for (var j = 0; j < bt.flashes.length; j++) {
      var f = bt.flashes[j], u = (bt.age - f[0]) / f[1];
      if (u >= 0 && u < 1) v = Math.max(v, (1 - u) * (j === 0 ? 1 : 0.75));
    }
    return Math.max(v, 0.12 * Math.max(0, 1 - bt.age / bt.life));
  }

  /* The live strikes on each tear, keyed by the caller (a wake id, or
   * 'slip-exit'). Wall clock, not sim time: lightning is something your
   * eye sees, and time warp should not turn it into a strobe. Returns the
   * strokes as screen-pixel polylines, ready for GL.queueBolts or
   * drawBolts2D. `t` is a tearScreen result (or anything with the same
   * x, y, W, H, roll, arrival, open, glow). */
  var TEAR_BOLTS = {}, TEAR_BOLT_SWEEP = 0;
  function tearBolts(key, now, t) {
    var st = TEAR_BOLTS[key];
    if (!st) st = TEAR_BOLTS[key] = { bolts: [], last: now };
    var dt = Math.max(0, Math.min(0.1, now - st.last));
    st.last = now;
    if (now - TEAR_BOLT_SWEEP > 2) {
      TEAR_BOLT_SWEEP = now;
      for (var k in TEAR_BOLTS) if (now - TEAR_BOLTS[k].last > 3) delete TEAR_BOLTS[k];
    }
    var arr = !!t.arrival;
    /* No lightning on a mote: below about ten pixels it would be noise. */
    var live = t.glow > 0.02 && t.open > 0.03 && t.H >= 10;
    if (live && st.bolts.length < (arr ? 4 : 3) && Math.random() < dt * (arr ? 11 : 7) * t.open) {
      st.bolts.push(makeBolt(Math.max(0.05, t.W / t.H), arr));
    }
    for (var i = st.bolts.length - 1; i >= 0; i--) {
      st.bolts[i].age += dt;
      if (st.bolts[i].age > st.bolts[i].life) st.bolts.splice(i, 1);
    }
    if (!live || !st.bolts.length) return [];
    var H = t.H, rx = t.roll[0], ry = t.roll[1], ux = -ry, uy = rx;
    /* Widths were tuned on a slit about 56 px tall. */
    var wsc = Math.max(0.4, Math.min(2, H / 56)) * (0.55 + 0.45 * t.open);
    var out = [];
    for (var b = 0; b < st.bolts.length; b++) {
      var bt = st.bolts[b];
      var lvl = boltLevel(bt) * t.open * Math.min(1.2, t.glow + 0.3) * (arr ? 1.5 : 1.6);
      if (lvl <= 0.003) continue;
      for (var j = 0; j < bt.branches.length; j++) {
        var br = bt.branches[j], pts = new Array(br.pts.length);
        for (var m = 0; m < br.pts.length; m++) {
          var lx = br.pts[m][0] * H, ly = br.pts[m][1] * H;
          pts[m] = [t.x + lx * rx + ly * ux, t.y + lx * ry + ly * uy];
        }
        out.push({ pts: pts, core: br.core * wsc, halo: br.halo * wsc, I: lvl * br.k });
      }
    }
    return out;
  }
  var BOLT_TINT_DEPART = [1.0, 0.55, 0.32], BOLT_TINT_ARRIVE = [0.45, 0.65, 1.0];

  /* The same strokes on a 2D canvas: the fallback renderer, and inside the
   * slipspace tunnel, which is drawn in 2D over the world layer. */
  function drawBolts2D(ctx, polys, tint) {
    if (!polys || !polys.length) return;
    var tc = Math.round(tint[0] * 255) + ',' + Math.round(tint[1] * 255) + ',' + Math.round(tint[2] * 255);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    for (var pass = 0; pass < 3; pass++) {
      for (var i = 0; i < polys.length; i++) {
        var p = polys[i], a = Math.min(1, p.I);
        ctx.strokeStyle = pass === 0 ? 'rgba(' + tc + ',' + (0.10 * a).toFixed(3) + ')'
                        : pass === 1 ? 'rgba(' + tc + ',' + (0.35 * a).toFixed(3) + ')'
                        : 'rgba(255,248,240,' + (0.95 * a).toFixed(3) + ')';
        ctx.lineWidth = pass === 0 ? p.halo * 2.2 : pass === 1 ? p.halo * 0.8 : Math.max(1, p.core * 1.2);
        ctx.beginPath();
        ctx.moveTo(p.pts[0][0], p.pts[0][1]);
        for (var k = 1; k < p.pts.length; k++) ctx.lineTo(p.pts[k][0], p.pts[k][1]);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  /* `size` is the wake's world radius in km; the caller decides that, since
   * it knows the scale of the system it is standing in. */
  function drawWake(ctx, cam, pos, wake, size, tSec, deep) {
    var p = cam.project(pos);
    if (!p) return null;
    if (p.x < -240 || p.x > cam.w + 240 || p.y < -240 || p.y > cam.h + 240) return p;

    // The eye's curve, not the scanner's (Slip.makeWake `glow`).
    var strength = Math.max(0, Math.min(1, wake.glow !== undefined ? wake.glow : wake.strength));
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

    /* SEEN FROM THE BOTTOM OF A WELL (2026-10-19). Astra: "From the
     * surface of a planet it would be even more pronounced, like a cross
     * between a black hole redshift but in higher speed." `deep` is how far
     * down a world's gravity well the viewer is — 1 on the ground, 0 three
     * radii up (main.js) — and it pushes a departure's colours down toward
     * a deep, dark red and swells it, and an arrival's toward violet. A
     * stylised exaggeration rather than a calculation; strictly, light
     * falling into a well arrives blueshifted, and it is the receding
     * hull's speed that reddens a departure. */
    deep = Math.max(0, Math.min(1, deep || 0));
    if (deep > 0) {
      var mixC = function (a, b, k) {
        a = a.split(','); b = b.split(',');
        return a.map(function (x, i) { return Math.round(+x + (+b[i] - +x) * k); }).join(',');
      };
      glowCore = mixC(glowCore, depart ? '214,26,12' : '150,70,255', deep);
      glowEdge = mixC(glowEdge, depart ? '110,4,8' : '64,10,170', deep);
      boltHalo = mixC(boltHalo, depart ? '255,64,32' : '176,120,255', deep);
      strength = Math.min(1, strength * (1 + 0.8 * deep));
      r *= 1 + 0.6 * deep;
    }

    /* THE TEAR ITSELF, while it is fresh. A wake is what is left of the
     * rip a hull made (see THE RIFT, below): the rip stays visible in the
     * middle of its cloud for the wake's whole life, closing on the same
     * half-life as the cloud (Slip.wakeDecay) — red where a ship left,
     * blue where one came through. Was a quarter of an hour; Astra wanted
     * hours, decaying like an isotope (2026-10-20). */
    var open = wake.decay !== undefined ? wake.decay
      : (wake.age !== undefined && wake.age < 900 ? 1 - wake.age / 900 : 0);
    if (open > 0.01) {
      var rH = Math.max(4, r * 1.1) * (0.35 + 0.65 * open);
      drawRift(ctx, p.x, p.y, rH, rH * 0.18 * open + 1, depart ? RIFT_RED : RIFT_BLUE,
               Math.min(1, 0.4 + strength) * open, tSec);
    }

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
  /* AND ITS OPPOSITE (2026-10-19). Astra: "we need a way to know if the
   * ship is facing into or out of the direction of travel that's easier to
   * find". The prograde marker alone could not say it: turn your tail to
   * your motion — the braking attitude, the one you most need to confirm —
   * and the marker was behind you and simply not drawn. So:
   *
   *   - the RETROGRADE marker (circle with a cross, as on every navball)
   *     is on the glass whenever it is in front of you;
   *   - when prograde is off the glass, an arrow at the edge points to it,
   *     so it is never just missing;
   *   - both carry the dark halo, so they hold up over a lit planet.
   *
   * The words — PROGRADE / RETROGRADE and the angle — are drawFacingCue,
   * under the ladder; this is the picture. */
  var VEL_INK = '#ffd36b';
  function velMarkerOnGlass(p, w, h) {
    return p && p.x > 14 && p.x < w - 14 && p.y > 14 && p.y < h - 14;
  }
  function drawFlightPathMarker(ctx, cam, progradeDir, w, h) {
    if (!progradeDir) return;
    var p = cam.projectDir(progradeDir);
    var r = cam.projectDir(V.scale(progradeDir, -1));
    inkBegin(ctx);
    if (velMarkerOnGlass(p, w, h)) {
      ctx.beginPath(); ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
      ctx.strokeStyle = INK_HALO; ctx.lineWidth = 4.4; ctx.stroke();
      ctx.strokeStyle = VEL_INK; ctx.lineWidth = 1.6; ctx.stroke();
      inkSeg(ctx, p.x - 12, p.y, p.x - 6, p.y, VEL_INK, 1.6, 1);
      inkSeg(ctx, p.x + 6, p.y, p.x + 12, p.y, VEL_INK, 1.6, 1);
      inkSeg(ctx, p.x, p.y - 10, p.x, p.y - 6, VEL_INK, 1.6, 1);
    } else {
      /* Off the glass: an arrow at the edge pointing the way to turn your
       * head to find prograde. Taken from the camera's own axes rather than
       * from a projection, so a prograde behind you and to the right is
       * still "turn right" with no sign to flip. Not drawn when retrograde
       * is on the glass: then you can see which way you are going. */
      var d = { x: V.dot(progradeDir, cam.r), y: -V.dot(progradeDir, cam.u) };
      var dl = Math.hypot(d.x, d.y);
      if (dl > 1e-9 && !velMarkerOnGlass(r, w, h)) {
        d.x /= dl; d.y /= dl;
        var R = Math.min(w, h) * 0.36;
        var ax = w / 2 + d.x * R, ay = h / 2 + d.y * R;
        drawArrow(ctx, ax - d.x * 8, ay - d.y * 8, d.x, d.y, 18, VEL_INK, 2, 8);
        ctx.textAlign = 'center';
        inkText(ctx, 'PRO', ax - d.x * 22, ay - d.y * 22 + 4, 'bold 10px ui-monospace, monospace', VEL_INK, 0.9);
      }
    }
    if (velMarkerOnGlass(r, w, h)) {
      ctx.beginPath(); ctx.arc(r.x, r.y, 7, 0, Math.PI * 2);
      ctx.strokeStyle = INK_HALO; ctx.lineWidth = 4.4; ctx.stroke();
      ctx.strokeStyle = VEL_INK; ctx.lineWidth = 1.6; ctx.stroke();
      var k = 4.9;
      inkSeg(ctx, r.x - k, r.y - k, r.x + k, r.y + k, VEL_INK, 1.6, 1);
      inkSeg(ctx, r.x - k, r.y + k, r.x + k, r.y - k, VEL_INK, 1.6, 1);
      inkSeg(ctx, r.x - 13, r.y, r.x - 7, r.y, VEL_INK, 1.6, 1);
      inkSeg(ctx, r.x + 7, r.y, r.x + 13, r.y, VEL_INK, 1.6, 1);
      inkSeg(ctx, r.x, r.y + 7, r.x, r.y + 11, VEL_INK, 1.6, 1);
    }
    ctx.restore();
  }

  /* The nose against the direction of travel, as words and a number:
   * which way you are facing, and how far off it you are. The angle is
   * measured from whichever of prograde and retrograde is nearer, because
   * that is the one you are trying to hold. Pure, so it is testable. */
  var FACING_LOCK = 10;                 // degrees: "on" prograde/retrograde
  function facingInfo(fwd, prograde, speedKms) {
    if (!prograde || !(speedKms > 0.001)) return { mode: 'still', deg: 0 };
    var c = Math.max(-1, Math.min(1, V.dot(fwd, prograde)));
    var off = Math.acos(c) * 180 / Math.PI;      // 0 = nose on prograde
    if (off <= 90) return { mode: 'pro', deg: off, locked: off <= FACING_LOCK };
    return { mode: 'retro', deg: 180 - off, locked: 180 - off <= FACING_LOCK };
  }

  /* Under the ladder, centred, where the eye already is: the symbol of the
   * marker you are nearer, and the words. Bright and boxed when you are on
   * it; plain when you are not; nothing to say when you are not moving. */
  function drawFacingCue(ctx, w, h, info, y) {
    if (!info) return;
    var cx = w / 2;
    inkBegin(ctx);
    ctx.textAlign = 'left';
    var label, col;
    if (info.mode === 'still') { label = 'NOT MOVING'; col = 'rgba(180,205,235,0.8)'; }
    else {
      label = (info.mode === 'pro' ? 'PROGRADE ' : 'RETROGRADE ') +
              (info.locked && info.deg < 0.5 ? '' : Math.round(info.deg) + '° OFF');
      col = info.locked ? VEL_INK : '#cfe8ff';
    }
    var font = 'bold 13px ui-monospace, monospace';
    ctx.font = font;
    var tw = ctx.measureText(label).width;
    var iconW = info.mode === 'still' ? 0 : 26;
    var x0 = cx - (tw + iconW) / 2;
    if (info.locked) {
      ctx.globalAlpha = 1;
      ctx.fillStyle = 'rgba(0,14,10,0.55)';
      ctx.fillRect(x0 - 8, y - 15, tw + iconW + 16, 22);
      ctx.strokeStyle = VEL_INK; ctx.lineWidth = 1.4;
      ctx.strokeRect(x0 - 7.5, y - 14.5, tw + iconW + 15, 21);
    }
    if (iconW) {
      var ix = x0 + 9, iy = y - 4;
      ctx.beginPath(); ctx.arc(ix, iy, 5, 0, Math.PI * 2);
      ctx.strokeStyle = INK_HALO; ctx.lineWidth = 4; ctx.globalAlpha = 1; ctx.stroke();
      ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.stroke();
      if (info.mode === 'pro') {
        inkSeg(ctx, ix - 10, iy, ix - 5, iy, col, 1.5, 1);
        inkSeg(ctx, ix + 5, iy, ix + 10, iy, col, 1.5, 1);
        inkSeg(ctx, ix, iy - 9, ix, iy - 5, col, 1.5, 1);
      } else {
        inkSeg(ctx, ix - 3.5, iy - 3.5, ix + 3.5, iy + 3.5, col, 1.5, 1);
        inkSeg(ctx, ix - 3.5, iy + 3.5, ix + 3.5, iy - 3.5, col, 1.5, 1);
      }
    }
    inkText(ctx, label, x0 + iconW, y + 1, font, col, 1);
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

  /* Heading tape: the strip across the top of a fighter HUD. The scale
   * slides, the index caret stays put, and the boxed number under it is the
   * heading to the degree. North is the reference body's own pole (see
   * Sim.headingAngles), so N/E/S/W are true directions on whatever world
   * has you, and the REF tag at the end of the strip says which world that
   * is — the frame changes when the dominant body does, and a compass that
   * silently swapped its north would be worse than none.
   *
   * hd     — Sim.headingAngles result
   * opts   — { cy: line y, ref: body name, bugColor }
   *
   * Drawn with a dark halo under every stroke and glyph, in source-over,
   * rather than the glass's additive glow: additive light cannot get darker
   * than what is behind it, which is why the old symbology vanished against
   * a sunlit planet. This is what real HUDs fight with brightness; we can
   * fight it with contrast. Returns the bottom y it used. */
  /* HUD ink: every stroke and glyph twice, a wide dark halo then the
   * colour, in source-over. Shared by the heading tape and the air-data
   * boxes so the glass reads as one instrument, and so whatever finally
   * replaces the glass's additive glow has one place to start from. */
  var INK_HALO = 'rgba(0,14,10,0.62)';
  function inkSeg(ctx, x0, y0, x1, y1, col, lw, alpha) {
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = INK_HALO; ctx.lineWidth = lw + 3;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    ctx.strokeStyle = col; ctx.lineWidth = lw;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
  }
  function inkText(ctx, s, x, y, font, col, alpha) {
    ctx.globalAlpha = alpha;
    ctx.font = font;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = INK_HALO; ctx.lineWidth = 3.5;
    ctx.strokeText(s, x, y);
    ctx.fillStyle = col;
    ctx.fillText(s, x, y);
  }
  function inkPoly(ctx, pts, col, fill, alpha) {
    ctx.globalAlpha = alpha;
    ctx.beginPath(); ctx.moveTo(pts[0], pts[1]);
    for (var i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
    ctx.closePath();
    ctx.strokeStyle = INK_HALO; ctx.lineWidth = 4; ctx.stroke();
    if (fill) { ctx.fillStyle = col; ctx.fill(); }
    else { ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.stroke(); }
  }
  function inkBegin(ctx) {
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.shadowBlur = 0; ctx.shadowColor = 'transparent';
    ctx.lineCap = 'butt';
  }

  /* Air-data boxes: speed on the left, altitude on the right, at horizon
   * height either side of the ladder, as on every fighter HUD since the
   * seventies. Boxes, not tapes (the F-35 call): our speeds run from
   * millimetres a second to multiples of c, and a tape over that range is
   * either useless at one end or a blur at the other. Pilots read the box.
   *
   * d = {
   *   speed: { value, unit },          the box, and its unit under it
   *   g, peak:  numbers or null        felt G and the peak held since launch
   *   alt:   { value, unit } | null    null when nothing is close enough
   *   vs:    { dir: +1|-1|0, text }    vertical speed, arrow + magnitude
   *   air:   { text, inside } | null   the atmosphere line under altitude
   *   cy                                box centre y
   * }
   * The speed box is right-aligned to its anchor and the altitude box
   * left-aligned to its, so both grow away from the centre and never into
   * the ladder. Returns { left, right } x extents for anything placed
   * beside them. */
  function drawAirData(ctx, w, h, d) {
    var GREEN = '#6ef0c0';
    var cx = w / 2, cy = d.cy || h / 2;
    var off = Math.max(190, Math.min(w * 0.27, 420));
    var BH = 26, FONT = 'bold 18px ui-monospace, monospace';
    var SMALL = '12px ui-monospace, monospace';
    inkBegin(ctx);

    function box(xAnchor, side, v) {
      ctx.font = FONT;
      var tw = ctx.measureText(v.value).width;
      var bw = Math.max(70, tw + 18);
      var x0 = side < 0 ? xAnchor - bw : xAnchor;
      ctx.globalAlpha = 1;
      ctx.fillStyle = 'rgba(0,14,10,0.55)';
      ctx.fillRect(x0, cy - BH / 2, bw, BH);
      ctx.strokeStyle = GREEN; ctx.lineWidth = 1.5;
      ctx.strokeRect(x0 + 0.5, cy - BH / 2 + 0.5, bw - 1, BH - 1);
      ctx.textAlign = 'center';
      inkText(ctx, v.value, x0 + bw / 2, cy + 6, FONT, GREEN, 1);
      ctx.textAlign = side < 0 ? 'right' : 'left';
      var ux = side < 0 ? x0 + bw : x0;
      if (v.unit) inkText(ctx, v.unit, ux, cy + BH / 2 + 14, '11px ui-monospace, monospace', GREEN, 0.8);
      return { x0: x0, x1: x0 + bw, textX: ux };
    }
    function line(x, row, s, col, align) {
      ctx.textAlign = align;
      inkText(ctx, s, x, cy + BH / 2 + 14 + row * 16, SMALL, col || GREEN, 0.95);
    }

    // Speed, and the G meter under it where a fighter keeps it.
    var L = box(cx - off, -1, d.speed);
    if (d.g !== null && d.g !== undefined) {
      line(L.textX, 1, 'G ' + fmtG(d.g), null, 'right');
      line(L.textX, 2, 'PK ' + (d.peak === null || d.peak === undefined ? '--' : fmtG(d.peak)), null, 'right');
    }

    // Altitude, vertical speed, and the air.
    var R = null;
    if (d.alt) {
      R = box(cx + off, 1, d.alt);
      var row = 1;
      if (d.vs) {
        var x = R.textX;
        line(x + 30, row, d.vs.text, null, 'left');
        inkText(ctx, 'VS', x, cy + BH / 2 + 14 + row * 16, SMALL, GREEN, 0.95);
        // The direction as an arrow, not a sign: up the glass is up.
        if (d.vs.dir) {
          var ay = cy + BH / 2 + 10 + row * 16, ax = x + 22;
          inkPoly(ctx, d.vs.dir > 0
            ? [ax - 5, ay + 3, ax + 5, ay + 3, ax, ay - 6]
            : [ax - 5, ay - 6, ax + 5, ay - 6, ax, ay + 3], GREEN, true, 0.95);
        }
        row++;
      }
      if (d.air) line(R.textX, row, d.air.text, d.air.inside ? '#ffe6a8' : null, 'left');
    }
    ctx.restore();
    return { left: L.x0, right: R ? R.x1 : cx + off };
  }
  function fmtG(g) {
    var a = Math.abs(g);
    return a < 10 ? g.toFixed(1) : Math.round(g).toString();
  }

  /* What goes in the boxes. The number is sized to be read at a glance and
   * the unit is printed under it, because the unit changes with the regime
   * (m/s on approach, km/s in orbit, c in cruise) and a bare number that
   * silently changed units would be the worst instrument on the glass. */
  function sep(n) { return Math.round(n).toLocaleString('en-US'); }
  function airSpeedReadout(kms, cruising) {
    var b = kms / C_KMS;
    if (cruising && b >= 0.001) return { value: b.toFixed(b < 1 ? 3 : b < 10 ? 2 : 1), unit: 'c' };
    var a = Math.abs(kms);
    if (a < 1) { var ms = kms * 1000; return { value: Math.abs(ms) < 10 ? ms.toFixed(1) : sep(ms), unit: 'M/S' }; }
    if (a < 1000) return { value: kms.toFixed(a < 10 ? 2 : a < 100 ? 1 : 0), unit: 'KM/S' };
    return { value: sep(kms), unit: 'KM/S' };
  }
  function altitudeReadout(km) {
    var a = Math.abs(km);
    if (a < 10) return { value: sep(km * 1000), unit: 'M' };
    if (a < 1000) return { value: km.toFixed(1), unit: 'KM' };
    if (a < 1e6) return { value: sep(km), unit: 'KM' };
    return { value: (km / 1e6).toFixed(2), unit: 'MKM' };
  }
  function vsReadout(kms) {
    var a = Math.abs(kms);
    var text = a < 0.1 ? (a * 1000).toFixed(1) + ' m/s'
             : a < 1 ? Math.round(a * 1000) + ' m/s'
             : a.toFixed(2) + ' km/s';
    return { dir: a < 1e-4 ? 0 : kms > 0 ? 1 : -1, text: text };
  }
  /* The air under you, for the line beneath altitude. Inside it, density in
   * kg/m³ — the number a scoop will care about — in amber, because being in
   * air is a state with consequences. Above it, how far down the top is.
   * A world with no air gets no line at all. */
  function airReadout(body, altKm, rho) {
    var at = body && body.atmosphere;
    if (!at) return null;
    if (altKm < at.top) {
      var r = rho >= 0.01 ? rho.toPrecision(2) : rho.toExponential(1);
      return { text: 'ρ ' + r + ' kg/m³', inside: true };
    }
    var dk = altKm - at.top;
    return { text: 'AIR ▼ ' + (dk < 1000 ? dk.toFixed(0) : sep(dk)) + ' km', inside: false };
  }

  var TAPE_SPAN = 25;                 // degrees either side of the index
  var CARDINAL = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' };
  var INTERCARD = { 45: 'NE', 135: 'SE', 225: 'SW', 315: 'NW' };
  function drawHeadingTape(ctx, w, h, hd, opts) {
    opts = opts || {};
    var cx = w / 2, T = opts.cy || 60;
    var half = Math.min(170, w * 0.18);
    var ppd = half / TAPE_SPAN;
    var GREEN = '#6ef0c0', HALO = 'rgba(0,14,10,0.62)';
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.shadowBlur = 0; ctx.shadowColor = 'transparent';
    ctx.lineCap = 'butt';
    ctx.textAlign = 'center';

    function seg(x0, y0, x1, y1, col, lw, alpha) { inkSeg(ctx, x0, y0, x1, y1, col, lw, alpha); }
    function text(s, x, y, font, col, alpha) { inkText(ctx, s, x, y, font, col, alpha); }
    function poly(pts, col, fill, alpha) { inkPoly(ctx, pts, col, fill, alpha); }

    // No north to have: say where you are instead of spinning the scale.
    if (hd.noNorth) {
      text((hd.atPole === 'N' ? 'NORTH' : 'SOUTH') + ' POLE · NO HEADING',
           cx, T, 'bold 12px ui-monospace, monospace', GREEN, 0.9);
      ctx.restore();
      return T + 6;
    }

    var hdg = hd.hdgDeg;
    /* Nose straight up or down: there is no heading, so there is no scale
     * to slide. A frozen strip reading 000 would be a lie with a caret on
     * it; the box says --- and the strip stays dark. */
    if (!hd.degenerate) {
    seg(cx - half, T, cx + half, T, GREEN, 1.4, 0.85);
    var first = Math.ceil((hdg - TAPE_SPAN) / 5) * 5;
    for (var a = first; a <= hdg + TAPE_SPAN + 1e-9; a += 5) {
      var x = cx + (a - hdg) * ppd;
      var edge = Math.abs(a - hdg) / TAPE_SPAN;           // 0 centre .. 1 end
      var fade = edge > 0.75 ? 1 - (edge - 0.75) / 0.25 * 0.7 : 1;
      var deg = ((a % 360) + 360) % 360;
      var major = deg % 10 === 0;
      seg(x, T, x, T - (major ? 10 : 5), GREEN, major ? 1.6 : 1.2, 0.85 * fade);
      if (CARDINAL[deg] !== undefined) {
        text(CARDINAL[deg], x, T - 15, 'bold 15px ui-monospace, monospace',
             deg === 0 ? '#ffe6a8' : GREEN, fade);
      } else if (INTERCARD[deg] !== undefined) {
        /* A row of their own, above the numbers: at 45° they land between
         * two labels five degrees away, which on a narrow window is about
         * the width of a label. */
        seg(x, T - 12, x, T - 18, GREEN, 1, 0.6 * fade);
        text(INTERCARD[deg], x, T - 21, 'bold 11px ui-monospace, monospace', GREEN, 0.85 * fade);
      } else if (major) {
        var lab = deg < 10 ? '00' + deg : deg < 100 ? '0' + deg : '' + deg;
        text(lab, x, T - 14, '12px ui-monospace, monospace', GREEN, 0.9 * fade);
      }
    }

    // Steering bug: bearing to the nav lock. Off the strip it parks at the
    // end that is the shorter way round, as an arrow pointing past it.
    if (hd.bugDeg !== null && hd.bugDeg !== undefined) {
      var col = opts.bugColor || '#ffd36b';
      var d = ((hd.bugDeg - hdg + 540) % 360) - 180;
      if (Math.abs(d) <= TAPE_SPAN) {
        var bx = cx + d * ppd;
        poly([bx - 6, T + 9, bx + 6, T + 9, bx, T + 2], col, false, 0.95);
      } else {
        var s = d > 0 ? 1 : -1, ex = cx + s * (half + 8);
        poly([ex, T - 5, ex, T + 5, ex + s * 9, T], col, true, 0.95);
      }
    }
    }

    // Fixed index and the boxed readout under it.
    poly([cx, T + 1, cx - 5, T + 9, cx + 5, T + 9], '#ffe6a8', true, 1);
    var bw = 46, bh = 19, by = T + 12;
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(0,14,10,0.55)';
    ctx.fillRect(cx - bw / 2, by, bw, bh);
    ctx.strokeStyle = GREEN; ctx.lineWidth = 1.4;
    ctx.strokeRect(cx - bw / 2 + 0.5, by + 0.5, bw - 1, bh - 1);
    var shown = hd.degenerate ? '---' : (function (v) {
      var r = Math.round(v) % 360;
      return r < 10 ? '00' + r : r < 100 ? '0' + r : '' + r;
    })(hdg);
    text(shown, cx, by + 14, 'bold 14px ui-monospace, monospace', GREEN, 1);

    if (opts.ref) {
      ctx.textAlign = 'left';
      text('REF ' + opts.ref, cx + half + 22, T + 4, '11px ui-monospace, monospace', GREEN, 0.75);
    }
    ctx.restore();
    return by + bh;
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

  /* ---- THE RIFT (2026-10-19) ---------------------------------------------
   * Astra picked it over a lensing bubble and a tidied tunnel: a jump
   * tears a RED rift ahead of you and you fly into it; inside is dark,
   * with filaments streaming past; you come out through a BLUE one. Red
   * where a hull leaves and blue where it arrives is the wakes' own code
   * (slipspace.js), so what you see other ships leave behind is visibly
   * the same tear you went through. And the TNG rule from the cruise sky
   * holds in here too — "stuff you've left behind should appear red from
   * your perspective": a filament coming at you is blue-violet, and flips
   * red as it goes past your shoulder.
   *
   * The tear is one seeded shape, the same every jump, drawn at any size:
   * a jagged spine top to bottom, a lens-shaped opening along it that is
   * widest in the middle, and its edges shimmering. Opening it is just
   * growing H (half height) and W (half width) — and W keeps growing until
   * the rift is wider than the screen, which is the moment you are in it.
   *
   * `hyper` is { time, intensity, flash, phase, u } — u is how far through
   * the phase (main.js owns the state machine). `overlay` is true while
   * the real world is drawn underneath: as the rift opens in the charge,
   * and as the blue wash fades after you emerge. */
  var RIFT_SHAPE = null;
  function riftShape() {
    if (RIFT_SHAPE) return RIFT_SHAPE;
    var rng = new RNG('slipspace-rift');
    var pts = [], x = 0, N = 30;
    for (var i = 0; i <= N; i++) {
      var s = i / N;                                  // 0 top .. 1 bottom
      x += rng.range(-1, 1) * 0.10;
      x *= 0.86;                                      // keep the spine near the middle
      pts.push({ s: s, x: x, wl: rng.range(0.55, 1.25), wr: rng.range(0.55, 1.25), ph: rng.angle() });
    }
    RIFT_SHAPE = pts;
    return pts;
  }

  /* The opening as a closed path: down the left lip, back up the right. */
  function riftPath(ctx, cx, cy, H, W, t) {
    var pts = riftShape(), i, p, y, hw, j;
    ctx.beginPath();
    for (i = 0; i < pts.length; i++) {
      p = pts[i]; y = cy + (p.s * 2 - 1) * H;
      hw = W * Math.sin(Math.PI * p.s) * p.wl * (1 + 0.10 * Math.sin(t * 7 + p.ph));
      j = cx + p.x * H * 0.35 - hw;
      if (i) ctx.lineTo(j, y); else ctx.moveTo(j, y);
    }
    for (i = pts.length - 1; i >= 0; i--) {
      p = pts[i]; y = cy + (p.s * 2 - 1) * H;
      hw = W * Math.sin(Math.PI * p.s) * p.wr * (1 + 0.10 * Math.sin(t * 6 + p.ph * 1.7));
      ctx.lineTo(cx + p.x * H * 0.35 + hw, y);
    }
    ctx.closePath();
  }

  var RIFT_RED = { edge: [255, 72, 46], hot: [255, 196, 160], core: [10, 2, 6] };
  var RIFT_BLUE = { edge: [96, 160, 255], hot: [214, 236, 255], core: [2, 4, 14] };
  function rgba(c, a) { return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + Math.max(0, Math.min(1, a)).toFixed(3) + ')'; }

  function drawRift(ctx, cx, cy, H, W, pal, alpha, t) {
    if (H < 1 || alpha <= 0.002) return;
    /* The space around it bends: a glow, and rings of distortion. */
    var gr = ctx.createRadialGradient(cx, cy, 0, cx, cy, H * 1.5);
    gr.addColorStop(0, rgba(pal.edge, 0.30 * alpha));
    gr.addColorStop(1, rgba(pal.edge, 0));
    ctx.fillStyle = gr;
    ctx.fillRect(cx - H * 1.5, cy - H * 1.5, H * 3, H * 3);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (var k = 0; k < 3; k++) {
      var ph = (t * 0.6 + k / 3) % 1;
      ctx.strokeStyle = rgba(pal.edge, 0.12 * alpha * (1 - ph));
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(cx, cy, W * 2 + H * 0.5 * ph + 4, H * (1.05 + 0.4 * ph), 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
    /* The inside of the tear: not space. */
    riftPath(ctx, cx, cy, H, W, t);
    ctx.fillStyle = rgba(pal.core, 0.92 * alpha);
    ctx.fill();
    /* The lips, burning: wide and faint, then hot and narrow. */
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineJoin = 'round';
    var passes = [[14, 0.12, pal.edge], [6, 0.35, pal.edge], [2, 0.9, pal.hot]];
    for (var q = 0; q < passes.length; q++) {
      riftPath(ctx, cx, cy, H, W, t);
      ctx.strokeStyle = rgba(passes[q][2], passes[q][1] * alpha);
      ctx.lineWidth = passes[q][0];
      ctx.stroke();
    }
    ctx.restore();
  }

  /* THE JUMP'S OWN TEAR, WITH THE WAKE'S CLOUD IN IT (2026-10-21).
   * Astra: "work those clouds into what we see as we reach our slipspace
   * destination." When the world layer can draw a tear, the rift you jump
   * through is the same thing a wake is: the opening is cut out of the 2D
   * picture and gl.js draws the veil through the hole — dark and smouldering
   * going in, lit from inside coming out — while the lips and the lightning
   * are drawn here on top, so the tunnel walls cannot hide them. main.js
   * queues the GPU half off `hyper.gpuTear`. */
  function hyperNow() {
    return (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now()) / 1000;
  }
  function drawTearRift(ctx, cx, cy, H, W, alpha, t, hyper, arrival) {
    if (H < 1 || alpha <= 0.002) return;
    var pal = arrival ? RIFT_BLUE : RIFT_RED;
    var gr = ctx.createRadialGradient(cx, cy, 0, cx, cy, H * 1.6);
    gr.addColorStop(0, rgba(pal.edge, (arrival ? 0.45 : 0.32) * alpha));
    gr.addColorStop(1, rgba(pal.edge, 0));
    ctx.fillStyle = gr;
    ctx.fillRect(cx - H * 1.6, cy - H * 1.6, H * 3.2, H * 3.2);
    /* The opening: not painted, cut. Whatever the world layer draws there
     * is what you see through the tear. */
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    riftPath(ctx, cx, cy, H, W, t);
    ctx.fillStyle = 'rgba(0,0,0,' + Math.min(1, alpha * 1.2).toFixed(3) + ')';
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineJoin = 'round';
    var passes = [[16, 0.14, pal.edge], [6, 0.40, pal.edge], [2, 0.95, pal.hot]];
    for (var q = 0; q < passes.length; q++) {
      riftPath(ctx, cx, cy, H, W, t);
      ctx.strokeStyle = rgba(passes[q][2], passes[q][1] * alpha);
      ctx.lineWidth = passes[q][0];
      ctx.stroke();
    }
    ctx.restore();
    /* The GPU's veil a little wider than the cut, so its billowing edge is
     * what meets the lips rather than a hard line. */
    var tear = { x: cx, y: cy, H: H, W: W * 1.3, E: H / 1.5, roll: [1, 0],
                 arrival: arrival, open: 1, glow: Math.min(1, alpha) };
    hyper.gpuTear = tear;
    drawBolts2D(ctx, tearBolts(arrival ? 'slip-exit' : 'slip-entry', hyperNow(),
                               { x: cx, y: cy, W: W, H: H, roll: [1, 0], arrival: arrival,
                                 open: 1, glow: Math.min(1, alpha) }),
                arrival ? BOLT_TINT_ARRIVE : BOLT_TINT_DEPART);
  }

  /* LIGHTNING THAT CLINGS TO THE TUNNEL WALLS (2026-10-21).
   * Astra: "we need to make the lightning stick to the inside walls of the
   * tunnel." Each strike lives on the wall: its main channel crawls round
   * the inside of the tube at one depth, riding toward you with the ragged
   * wall rings (the same 0.22 a second they move at), and its forks reach
   * along the tube toward the neighbouring ring. Coloured like the walls
   * themselves — blue-violet ahead, red once it is beside you — and drawn
   * bigger the nearer it is. Built once per strike, in tunnel coordinates
   * (angle round the tube, depth u), so it stays stuck to the wall as the
   * tube spins and streams past. Visual only: Math.random. */
  var TUNNEL_BOLTS = { list: [], last: null };
  function makeWallBolt(T) {
    var rnd = Math.random;
    /* On the nearer walls, where the tube is wide enough for a strike to
     * read: deep in the tube it is a few pixels across. */
    var u0 = 0.45 + rnd() * 0.45, a0 = rnd() * Math.PI * 2;
    var span = (0.5 + rnd() * 1.1) * (rnd() < 0.5 ? -1 : 1);
    var N = 22, main = [];
    var du = 0, dr = 0;
    for (var i = 0; i <= N; i++) {
      du += (rnd() - 0.5) * 0.012; du *= 0.85;      // wanders a little in depth
      dr = (rnd() - 0.5) * 0.06;                    // and hugs the wall, ragged
      main.push({ a: a0 + span * i / N, du: du, dr: dr });
    }
    var forks = [], nf = 1 + Math.floor(rnd() * 3);
    for (var f = 0; f < nf; f++) {
      var at = main[2 + Math.floor(rnd() * (N - 4))], fp = [], fu = 0, fa = 0;
      var dir = rnd() < 0.5 ? -1 : 1, len = 0.04 + rnd() * 0.08;
      for (var k = 0; k <= 10; k++) {
        fu = dir * len * k / 10; fa += (rnd() - 0.5) * 0.08;
        fp.push({ a: at.a + fa, du: at.du + fu, dr: (rnd() - 0.5) * 0.06 });
      }
      forks.push(fp);
    }
    /* Clinging, not striking: it crawls on the wall for half a second to a
     * second, re-flashing as it goes, and never drops below a glow you can
     * see against the tunnel until it dies (wallBoltLevel). */
    var flashes = [], t = 0, n = 3 + Math.floor(rnd() * 4);
    for (var j = 0; j < n; j++) { flashes.push([t, 0.05 + rnd() * 0.06]); t += 0.10 + rnd() * 0.16; }
    return { T0: T, u0: u0, main: main, forks: forks, flashes: flashes, life: t + 0.1, age: 0 };
  }
  function wallBoltLevel(bt) {
    var fade = Math.max(0, 1 - bt.age / bt.life);
    var flick = 0.75 + 0.25 * Math.sin(bt.age * 61 + bt.u0 * 40);
    return Math.max(boltLevel(bt), 0.45 * Math.sqrt(fade) * flick);
  }
  function drawTunnelWallBolts(ctx, cx, cy, maxR, T, I) {
    var st = TUNNEL_BOLTS;
    var dt = st.last === null ? 0 : Math.max(0, Math.min(0.1, T - st.last));
    if (st.last !== null && T < st.last) st.list.length = 0;    // a new jump
    st.last = T;
    if (st.list.length < 5 && Math.random() < dt * 5) st.list.push(makeWallBolt(T));
    var spin = T * 0.10;
    for (var b = st.list.length - 1; b >= 0; b--) {
      var bt = st.list[b];
      bt.age += dt;
      var u = bt.u0 + (T - bt.T0) * 0.22;
      if (bt.age > bt.life || u > 1.05) { st.list.splice(b, 1); continue; }
      var lvl = wallBoltLevel(bt) * I;
      if (lvl <= 0.003) continue;
      var place = function (p) {
        var r = hyperRadius(u + p.du, maxR) * (1 + p.dr), an = p.a + spin;
        return [cx + Math.cos(an) * r, cy + Math.sin(an) * r];
      };
      var near = Math.max(0.25, Math.min(1.6, u * 1.6));
      /* Heavier than a wake's strokes: the tunnel behind them is busy. */
      var polys = [{ pts: bt.main.map(place), core: 2.4 * near, halo: 11 * near, I: lvl * 1.4 }];
      for (var f = 0; f < bt.forks.length; f++) {
        polys.push({ pts: bt.forks[f].map(place), core: 1.6 * near, halo: 7 * near, I: lvl });
      }
      /* The walls' own colours: ahead blue-violet, past red. */
      var ah = smooth01((0.68 - u) / 0.14);
      var tint = [BOLT_TINT_DEPART[0] + (BOLT_TINT_ARRIVE[0] - BOLT_TINT_DEPART[0]) * ah,
                  BOLT_TINT_DEPART[1] + (BOLT_TINT_ARRIVE[1] - BOLT_TINT_DEPART[1]) * ah,
                  BOLT_TINT_DEPART[2] + (BOLT_TINT_ARRIVE[2] - BOLT_TINT_DEPART[2]) * ah];
      drawBolts2D(ctx, polys, tint);
    }
  }

  /* A filament's colour at depth u: blue-violet coming at you, flipping
   * red as it passes (u past ~0.6, where it is beside you on screen). */
  function riftFilament(u, hue, alpha) {
    var ah = smooth01((0.68 - u) / 0.14);            // 1 ahead, 0 passed
    var r = 255 + (130 + 60 * hue - 255) * ah;
    var g = 70 + (140 - 70) * ah;
    var b = 50 + (255 - 50) * ah;
    return 'rgba(' + Math.round(r) + ',' + Math.round(g) + ',' + Math.round(b) + ',' + alpha.toFixed(3) + ')';
  }

  function drawHyperspace(ctx, w, h, hyper, overlay) {
    var cx = w / 2, cy = h / 2;
    var maxR = Math.hypot(w, h) * 0.62;
    var T = hyper.time || 0;
    var I = Math.max(0, Math.min(1, hyper.intensity || 0));
    var phase = hyper.phase || 'tunnel';
    var u = Math.max(0, Math.min(1, hyper.u === undefined ? 0.5 : hyper.u));
    var S = Math.min(w, h);

    ctx.save();
    if (phase === 'charge') {
      /* THE TEAR OPENS, in the real sky ahead. Drawn as an overlay on the
       * world. A sliver first, lengthening; then it gapes, and in the last
       * fifth it is wider than the screen — you are going in. */
      var o = smooth01(u / 0.55);
      var H = S * 0.46 * o;
      /* Opens on the nose (main.js passes where it projects), drifting to
       * the middle as it swallows the view. */
      if (hyper.cx !== undefined) {
        var gulp = smooth01((u - 0.6) / 0.4);
        cx = hyper.cx + (cx - hyper.cx) * gulp;
        cy = hyper.cy + (cy - hyper.cy) * gulp;
      }
      var Wd = S * (0.006 + 0.07 * smooth01(u));
      if (u > 0.78) {
        var gape = Math.pow((u - 0.78) / 0.22, 2.2);
        Wd += S * 3.2 * gape;
        H *= 1 + 1.6 * gape;
      }
      /* The world reddens around it as it widens. */
      ctx.fillStyle = 'rgba(70,6,4,' + (0.35 * smooth01((u - 0.5) / 0.5)).toFixed(3) + ')';
      ctx.fillRect(0, 0, w, h);
      if (hyper.gpuTears) drawTearRift(ctx, cx, cy, H, Wd, 0.25 + 0.75 * o, T, hyper, false);
      else drawRift(ctx, cx, cy, H, Wd, RIFT_RED, 0.25 + 0.75 * o, T);
    } else if (phase === 'tunnel' || (phase === 'exit' && !overlay)) {
      /* INSIDE. Not space: dark wine at the walls, a violet depth ahead. */
      var bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, maxR);
      bg.addColorStop(0, 'rgb(34,18,66)');
      bg.addColorStop(0.35, 'rgb(14,6,30)');
      bg.addColorStop(0.8, 'rgb(22,3,8)');
      bg.addColorStop(1, 'rgb(46,5,8)');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'lighter';
      var stars = hyperStars(), spin = T * 0.10;
      /* The walls: ragged rings of the tear itself, sliding past. */
      var pts = riftShape();
      for (var k = 0; k < 6; k++) {
        var ru = (k / 6 + T * 0.22) % 1;
        var rr = hyperRadius(ru, maxR);
        if (rr < 3) continue;
        ctx.strokeStyle = riftFilament(ru, 0.5, 4 * ru * (1 - ru) * 0.30 * I);
        ctx.lineWidth = 1 + 3 * ru;
        ctx.beginPath();
        for (var a = 0; a <= 30; a++) {
          var p = pts[a % pts.length], th = a / 30 * Math.PI * 2 + spin + k;
          var jag = 1 + p.x * 0.9 + 0.04 * Math.sin(T * 5 + p.ph);
          var X = cx + Math.cos(th) * rr * jag, Y = cy + Math.sin(th) * rr * jag;
          if (a) ctx.lineTo(X, Y); else ctx.moveTo(X, Y);
        }
        ctx.stroke();
      }
      /* Lightning ON the walls (2026-10-21) — see tunnelWallBolts. */
      drawTunnelWallBolts(ctx, cx, cy, maxR, T, I);
      ctx.globalCompositeOperation = 'lighter';
      /* The filaments, streaming past: soft, two passes each. */
      ctx.lineCap = 'round';
      for (var i = 0; i < stars.length; i++) {
        var s = stars[i];
        var fu = (s.z + T * s.speed * 0.26) % 1;
        var fu2 = Math.min(1, fu + 0.03 + 0.14 * s.speed);
        var r0 = hyperRadius(fu, maxR), r1 = hyperRadius(fu2, maxR);
        if (r1 < 1.5) continue;
        var an = s.a + spin * (1 + s.twist * 0.5) + fu * 0.45 * s.twist;
        var ca = Math.cos(an), sa = Math.sin(an);
        var al = Math.min(1, 0.2 + fu * 1.1) * I;
        for (var pass = 0; pass < 2; pass++) {
          ctx.strokeStyle = riftFilament(fu, s.hue, al * (pass ? 0.75 : 0.18));
          ctx.lineWidth = s.width * (0.4 + fu * 1.4) * (pass ? 1 : 3);
          ctx.beginPath();
          ctx.moveTo(cx + ca * r0, cy + sa * r0);
          ctx.lineTo(cx + ca * r1, cy + sa * r1);
          ctx.stroke();
        }
      }
      ctx.globalCompositeOperation = 'source-over';
      /* THE WAY OUT: blue, growing at the far end through the last of the
       * tunnel, and gaping through the first third of the exit. */
      var ex = phase === 'tunnel' ? smooth01((u - 0.8) / 0.2) * 0.25
             : 0.25 + 0.75 * Math.min(1, u / 0.3);
      if (ex > 0) {
        var eH = S * (0.04 + 0.42 * ex);
        var eW = S * 0.05 * ex + (ex > 0.7 ? S * 3.2 * Math.pow((ex - 0.7) / 0.3, 2.2) : 0);
        if (hyper.gpuTears) drawTearRift(ctx, cx, cy, eH, eW, Math.min(1, ex * 3), T, hyper, true);
        else drawRift(ctx, cx, cy, eH, eW, RIFT_BLUE, Math.min(1, ex * 3), T);
      }
    } else {
      /* OUT, with the real sky back underneath: a blue wash dying away
       * from the edges in, and nothing else. */
      var fade = I * (1 - smooth01((u - 0.3) / 0.7));
      if (fade > 0.002) {
        var vg = ctx.createRadialGradient(cx, cy, S * 0.2, cx, cy, maxR);
        vg.addColorStop(0, 'rgba(120,170,255,0)');
        vg.addColorStop(1, 'rgba(120,170,255,' + (0.45 * fade).toFixed(3) + ')');
        ctx.fillStyle = vg;
        ctx.fillRect(0, 0, w, h);
      }
    }
    ctx.restore();

    /* The flashes: red-white going in, blue-white coming out. */
    if (hyper.flash > 0.001) {
      ctx.save();
      ctx.fillStyle = (phase === 'exit' ? 'rgba(214,232,255,' : 'rgba(255,214,196,') +
                      Math.min(1, hyper.flash).toFixed(3) + ')';
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }
  }

  /* ======================================================================
   * THE SKY AT SPEED — STREAKS AND THE RED-BLUE SHIFT (2026-10-19)
   * ======================================================================
   * Third version, and the one Astra asked for by pointing at a thing she
   * had seen: "in Star Trek TNG, in some of the remastered scenes, there's
   * this red-blue starfield, where right as you pass a point of light it
   * rapidly shifts in color." With it: "I liked the old cruise animation a
   * bit better, just, we need a bit of planets covering the lines and blur
   * them a bit so we get a streak and not just a point or a line."
   *
   * So, what each earlier version contributed and what it gave up:
   *   - the FIRST (the radial streaks of 2026-09) is the shape: every star
   *     smeared along the way it is moving across the sky, longest abeam,
   *     none dead ahead. Back, and now drawn by the world layer, behind
   *     the planets, as soft blurred quads rather than hard lines.
   *   - the SECOND (2026-10-17's relativistic sky) contributed a true thing
   *     about light — ahead is blue, behind is red — and an untrue-looking
   *     thing about the screen: aberration crowding every star into a ring
   *     and a black rear sky above 1.5c. The colour stays and the rest goes.
   *     Stars sit where they are; only their colour and their smear move.
   *   - its trails-follow-the-turn idea stays too, folded in: in a turn the
   *     streak picks up where the star WAS on screen a moment ago, so a
   *     yaw still swings them rather than leaving them aimed at the nose.
   *
   * The colour is the TNG rule, not a blackbody formula: a star in the
   * forward half is washed blue-white and a little brighter, one in the
   * rear half red and a little dimmer, and the change happens in a narrow
   * band either side of abeam — ±6° — so a star you watch go past flicks
   * from one to the other as it crosses your shoulder. How hard the wash
   * is, and how long the smear, both ride one number: `cruiseFrac`, where
   * the speed sits between 0.02c and the drive's 2000c on a log scale.
   *
   * Pure functions, exported, and gl.js's star shader carries cruiseSky
   * line for line (node cannot run a shader; test/cruisesky.test.js pins
   * this one). */
  var C_KMS = 299792.458;
  var CRUISE_SKY_BETA = 0.02;      // below this the ordinary sky is drawn instead
  var CRUISE_TOP_BETA = 2000;      // the drive's cap (main.js CRUISE_MAX), in c
  var SHIFT_FULL_AT = 0.35;        // cruiseFrac at which the colour wash is complete (~1c)
  var ABEAM_BAND = 0.10;           // |cos| either side of abeam the flip happens over
  var SKY_BLUE = [178, 212, 255];
  var SKY_RED = [255, 84, 58];

  /* 0 at 0.02c, 1 at the cap, log in between. */
  function cruiseFrac(beta) {
    if (!(beta >= CRUISE_SKY_BETA)) return 0;
    var f = Math.log(beta / CRUISE_SKY_BETA) / Math.log(CRUISE_TOP_BETA / CRUISE_SKY_BETA);
    return Math.max(0, Math.min(1, f));
  }
  function smooth01(x) { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); }

  /* For a star at cos `ct` from the heading, at `beta`:
   *   f     the speed fraction above;
   *   s     how strong the colour wash is (0..1);
   *   ahead 1 in the forward half, 0 in the rear, the narrow flip between;
   *   lum   brightness multiplier. */
  function cruiseSky(ct, beta) {
    var f = cruiseFrac(beta);
    var s = smooth01(f / SHIFT_FULL_AT);
    var ahead = smooth01((ct + ABEAM_BAND) / (2 * ABEAM_BAND));
    return { f: f, s: s, ahead: ahead, lum: 1 + s * (0.6 * ahead - 0.35 * (1 - ahead)) };
  }

  /* The star's own colour washed toward blue or red by `sky`. 0-255.
   * The star's own colour fades in with the wash too, so nothing jumps at
   * the 0.02c line: the ordinary sky is white. */
  function skyColour(base, sky) {
    var a = sky.ahead, k = sky.s * 0.8, out = [];
    for (var i = 0; i < 3; i++) {
      var own = 255 + (base[i] - 255) * sky.s;
      var tint = SKY_RED[i] + (SKY_BLUE[i] - SKY_RED[i]) * a;
      out.push(Math.round(own + (tint - own) * k));
    }
    return out;
  }

  /* A star's own temperature, from the tint the sky was seeded with — no
   * new random draws, so every seed keeps the sky it has. */
  function starTemp(st) {
    if (st.T) return st.T;
    st.T = st.tint === '#ffd9c0' ? 4000 : (st.tint === '#c9dcff' ? 12000 : 6500);
    return st.T;
  }

  /* Blackbody colour, Tanner Helland's fit, 1000-40000 K. Cached by 100 K
   * step: the sky asks for a few hundred distinct values a frame at most. */
  var K2RGB = {};
  function k2rgb(T) {
    var key = Math.round(Math.max(1000, Math.min(40000, T)) / 100);
    if (K2RGB[key]) return K2RGB[key];
    var t = key, r, g, b;
    if (t <= 66) {
      r = 255; g = 99.47 * Math.log(t) - 161.12;
      b = t <= 19 ? 0 : 138.52 * Math.log(t - 10) - 305.04;
    } else {
      r = 329.7 * Math.pow(t - 60, -0.1332); g = 288.12 * Math.pow(t - 60, -0.0755); b = 255;
    }
    var c = function (x) { return Math.max(0, Math.min(255, x | 0)); };
    return (K2RGB[key] = c(r) + ',' + c(g) + ',' + c(b));
  }

  /* Camera.projectDir, for a camera remembered as plain numbers. */
  function projectWith(c, d) {
    var depth = d.x * c.f.x + d.y * c.f.y + d.z * c.f.z;
    if (depth <= 1e-6) return null;
    var k = c.flen / depth;
    return { x: c.cx + (d.x * c.r.x + d.y * c.r.y + d.z * c.r.z) * k,
             y: c.cy - (d.x * c.u.x + d.y * c.u.y + d.z * c.u.z) * k };
  }

  /* THE STREAKS, as geometry: a flat list, nine numbers a segment (ax, ay
   * at the STAR, bx, by at the tail, in screen px; r, g, b 0-255; alpha;
   * width px), and the stars' own dots as a second list (x, y, r, g, b,
   * alpha, size). The world layer draws the segments behind the planets
   * with a soft cross-section and a tail that fades (GLWorld.drawTrails);
   * a 2D overlay would put them across every planet's face, which Astra
   * ruled out — "that breaks the immersion."
   *
   * WHERE THE TAIL POINTS. A ship flying along `head` sees every star
   * slide away from the heading toward the point behind it, fastest
   * abeam. So the tail runs to where the star sat a little earlier — its
   * direction swung back toward the heading by STREAK_REACH(f) radians'
   * worth — which is radial about the vanishing point when you look ahead,
   * converging on the anti-point when you look back, and longest beside
   * you, all from one rule and wherever the camera is. A turn adds where
   * the star was on screen at the oldest remembered frame (`trail`, see
   * main.js), so the streaks swing through a yaw. */
  var STREAK_REACH_MIN = 0.015;    // radians of sky a streak spans at the slowest
  var STREAK_REACH_MAX = 0.60;     // ... and at the cap
  var STREAK_MAX_SCREEN = 0.55;    // longest streak, as a fraction of the larger screen side

  function cruiseTrails(cam, stars, headDir, w, h, beta, trail) {
    var segs = [], dots = [];
    var f = cruiseFrac(beta || 0);
    if (!f) return { segs: segs, dots: dots };
    var reach = STREAK_REACH_MIN + (STREAK_REACH_MAX - STREAK_REACH_MIN) * f * f;
    var maxLen = Math.max(w, h) * STREAK_MAX_SCREEN;
    var oldest = trail && trail.length ? trail[trail.length - 1] : null;
    var hx = headDir.x, hy = headDir.y, hz = headDir.z;
    for (var i = 0; i < stars.length; i++) {
      var st = stars[i], d = st.d;
      var p = cam.projectDir(d);
      if (!p || p.x < -60 || p.x > w + 60 || p.y < -60 || p.y > h + 60) continue;
      var ct = d.x * hx + d.y * hy + d.z * hz;
      var sky = cruiseSky(ct, beta);
      var bright = st.b * sky.lum;
      if (bright < 0.03) continue;
      var base = k2rgb(starTemp(st)).split(',').map(Number);
      var rgb = skyColour(base, sky);
      var a0 = Math.min(1, bright);

      /* Where it was: the direction swung toward the heading. */
      var px = d.x + hx * reach, py = d.y + hy * reach, pz = d.z + hz * reach;
      var pl = Math.sqrt(px * px + py * py + pz * pz);
      var tx = 0, ty = 0;
      if (pl > 1e-9) {
        var q = cam.projectDir({ x: px / pl, y: py / pl, z: pz / pl });
        if (q) { tx = q.x - p.x; ty = q.y - p.y; }
      }
      if (oldest) {
        var hp = projectWith(oldest, d);
        if (hp) { tx += hp.x - p.x; ty += hp.y - p.y; }
      }
      var L = Math.sqrt(tx * tx + ty * ty);
      if (L > maxLen) { tx *= maxLen / L; ty *= maxLen / L; L = maxLen; }
      var width = st.size * (1.1 + 1.6 * f);
      if (L >= 0.6) segs.push(p.x, p.y, p.x + tx, p.y + ty, rgb[0], rgb[1], rgb[2], a0 * 0.85, width);
      dots.push(p.x, p.y, rgb[0], rgb[1], rgb[2], a0, st.size * (1 + 0.5 * sky.s));
    }
    return { segs: segs, dots: dots };
  }

  /* `gpuSky`: the world layer drew the stars (in their shifted colours) in
   * its own pass and draws the streaks too, straight after them and so
   * behind every planet. The overlay only darkens the screen's edges, the
   * old version's "what sells speed more than the streaks do", which is a
   * wash over everything and so is right where it is. Without a world
   * layer the streaks and dots fall back to this overlay. */
  function drawCruiseWarp(ctx, cam, stars, headDir, speedFrac, w, h, beta, gpuSky, trail) {
    var f = cruiseFrac(beta || 0);
    if (!f) return;
    var tr = cruiseTrails(cam, stars, headDir, w, h, beta, trail);
    var GLW = global.GLWorld;
    var onGpu = gpuSky && GLW && GLW.drawTrails && (GLW.drawTrails(tr.segs) || !tr.segs.length);
    ctx.save();
    if (!onGpu) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      var sg = tr.segs;
      for (var i = 0; i < sg.length; i += 9) {
        /* Two passes, wide and faint then narrow, for a soft edge on a
         * canvas that has no blur of its own. */
        for (var pass = 0; pass < 2; pass++) {
          ctx.strokeStyle = 'rgba(' + sg[i + 4] + ',' + sg[i + 5] + ',' + sg[i + 6] + ',' +
                            (sg[i + 7] * (pass ? 0.7 : 0.25)).toFixed(3) + ')';
          ctx.lineWidth = sg[i + 8] * (pass ? 1 : 2.6);
          ctx.beginPath();
          ctx.moveTo(sg[i], sg[i + 1]);
          ctx.lineTo(sg[i + 2], sg[i + 3]);
          ctx.stroke();
        }
      }
      if (!gpuSky) {
        var dt = tr.dots;
        for (var j = 0; j < dt.length; j += 7) {
          var sz = dt[j + 6];
          ctx.fillStyle = 'rgba(' + dt[j + 2] + ',' + dt[j + 3] + ',' + dt[j + 4] + ',' + dt[j + 5].toFixed(3) + ')';
          ctx.fillRect(dt[j] - sz / 2, dt[j + 1] - sz / 2, sz, sz);
        }
      }
      ctx.globalCompositeOperation = 'source-over';
    }
    if (ctx.createRadialGradient) {
      var vig = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.30,
                                         w / 2, h / 2, Math.max(w, h) * 0.75);
      vig.addColorStop(0, 'rgba(0,0,0,0)');
      vig.addColorStop(1, 'rgba(2,6,18,' + (0.40 * f).toFixed(3) + ')');
      ctx.fillStyle = vig;
      ctx.fillRect(0, 0, w, h);
    }
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
  /* TALLER SINCE 2026-11-01 (Astra, choosing from unfinished.md: "the
   * windscreen could go taller"). The top edge rose from 0.62 to 0.70 and
   * the upper chamfers from 0.30 to 0.38; the sill and lower chamfers did
   * not move, because the dash, the HUD's floor and the landing window all
   * hang off them.
   *
   * WHY 0.70 AND NOT MORE. The cockpit camera's view runs out just above
   * 0.72 dead ahead. Measured on screen at the default look, the strip of
   * frame above the glass was 9.5% of the height at 0.62; 6.8% at 0.66;
   * 4.2% at 0.70; 2.9% at 0.72; and at 0.76 the glass ran off the top of
   * the screen, which is what cockpit.test's "hull is visible above the
   * window" exists to stop: with no frame overhead you stop reading as
   * sat in a ship. 0.70 halves the strip and keeps it. */
  var APERTURE = [
    [-0.92,  0.70], [ 0.92,  0.70], [ 1.22,  0.38], [ 1.22, -0.16],
    [ 0.98, -0.46], [-0.98, -0.46], [-1.22, -0.16], [-1.22,  0.38]
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

  /* A frame bar across a four-cornered pane, from edge 0->1 to edge 3->2
   * at fraction f along both, `w` wide, lying 5 mm inside the glass on the
   * seat's side (2026-10-31, the per-ship canopy bars). */
  var BAR_EYE = [0, 0, 0.08];
  function barQuad(pane, f, w) {
    if (!pane || pane.length !== 4) return null;
    var p0 = pane[0], p1 = pane[1], p2 = pane[2], p3 = pane[3];
    function lerp(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
    function sub3(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
    function unit3(a) { var l = Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
    var e0 = unit3(sub3(p1, p0)), e1 = unit3(sub3(p2, p3));
    var u = sub3(p1, p0), v = sub3(p3, p0);
    var n = unit3([u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]);
    var toEye = sub3(BAR_EYE, p0);
    if (n[0] * toEye[0] + n[1] * toEye[1] + n[2] * toEye[2] < 0) n = [-n[0], -n[1], -n[2]];
    var a = lerp(p0, p1, f), b = lerp(p3, p2, f), h = w / 2, d = 0.005;
    function at(p, e, s) { return [p[0] + e[0] * h * s + n[0] * d, p[1] + e[1] * h * s + n[1] * d, p[2] + e[2] * h * s + n[2] * d]; }
    return [at(a, e0, -1), at(a, e0, 1), at(b, e1, 1), at(b, e1, -1)];
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
   * The bearings are ±28°, not the ±60° that "ten and two" would mean
   * literally. A panel's horizontal offset on screen is the focal length
   * times the tangent of its bearing, and at 34° — never mind 60° — the
   * outer panel walks off the side of an 800-pixel-wide window entirely.
   * Measured in the running game at the size the window actually was, not
   * reasoned about. (It was ±24° until the overlap below was measured.)
   *
   * The widths are set by the same arithmetic: a panel subtends
   * atan(hw / r) either side of its bearing, so three panels fit without
   * overlapping only while the outer ones' inner edges clear the centre
   * one's outer edge.
   *
   * MEASURED, 2026-10-19, because the version of this paragraph that said
   * "28° leaves about a degree of gap" was written over mounts at 24°, and
   * the housings — 22 mm proud of the glass on every side — were never in
   * the sum. Projected through the real cockpit camera, neighbouring
   * housings overlapped by 43 to 138 px at every window size the suite
   * knows (Astra: "panels overlap. This is a problem."). Now ±28° with the
   * screens 6% smaller: worst case (a 1920 window, the smallest hull) the
   * housings clear by ~20 px at 1280-equivalent, and the arc still sits
   * 60 px inside the edges of a 1280x800 window. The cockpit suite checks
   * the gap between neighbours directly now, so this cannot drift again
   * without failing. */
  var MFD_MOUNTS = [
    { id: 'left',   bearing: -28 * Math.PI / 180, r: 1.12, y: -0.37, lean: 0.70, hw: 0.216, hh: 0.084, w: 460, h: 178 },
    { id: 'centre', bearing: 0,                   r: 1.06, y: -0.39, lean: 0.62, hw: 0.226, hh: 0.087, w: 460, h: 178 },
    { id: 'right',  bearing: 28 * Math.PI / 180,  r: 1.12, y: -0.37, lean: 0.70, hw: 0.216, hh: 0.084, w: 460, h: 178 },
    /* Two more on the rear bulkhead, for the same reason the side windows
     * run so far aft: you can turn all the way round now, and a cockpit
     * that rewards looking behind you with a blank wall is a cockpit that
     * teaches you not to look. These are upright and face the seat, so
     * turning round reads them the right way up. */
    /* MOVED 2026-10-24 with the bulkhead, which went from half a metre
     * behind the eye to 1.3 m so there is a door to walk through (see
     * cockpitGeometry). Each screen now sits either side of that door —
     * 0.84 m outboard, 0.24 m proud of the wall — still turned to face the
     * seat, and a third bigger so it subtends about what it did from its
     * old place: 16 degrees of half-width instead of 26, because a screen
     * the size of a door would not be a screen. */
    { id: 'rear-left',  bearing: -141.6 * Math.PI / 180, r: 1.352, y: 0.02, lean: -0.10, hw: 0.36, hh: 0.139, w: 460, h: 178 },
    { id: 'rear-right', bearing: 141.6 * Math.PI / 180,  r: 1.352, y: 0.02, lean: -0.10, hw: 0.36, hh: 0.139, w: 460, h: 178 },
    /* THE OVERHEAD, at the pilot's 3 o'clock and angled down at them.
     * Astra specified it to the degree — "a monitor up and to the right at
     * the player's 3 o'clock, angled 45 degrees facing down" — and it is
     * the one mount that is neither dash nor bulkhead: it hangs above the
     * shoulder, which is where a channel you monitor rather than fly by
     * belongs.
     *
     * 88 degrees rather than 90, and that is not fussiness about the
     * bearing: the PANELS tab splits forward screens from aft ones on
     * `abs(bearing) < PI/2`, and a mount sitting exactly on the beam falls
     * through to the back row and draws itself behind the seat in the
     * layout. Two degrees inside the line puts it where the eye expects
     * without the layout code needing to learn about a third case.
     *
     * The negative lean is the "facing down" half: everything on the dash
     * leans its top AWAY from the pilot because it sits below the eye, and
     * this one leans the other way because it does not. */
    { id: 'overhead', bearing: 88 * Math.PI / 180, r: 1.05, y: 0.34,
      lean: -45 * Math.PI / 180, hw: 0.22, hh: 0.086, w: 460, h: 178 }
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
    /* ...and only ever slower UPWARD. Below the reference ship the square
     * root runs the wrong way: a 0.86x room got 0.93x screens, wider than
     * the room had space for, and on the smallest hulls the three dash
     * screens overlapped by most of a bezel. A small cockpit shrinks its
     * screens with it. */
    var ks = spec ? (spec.size < 1 ? spec.size : Math.sqrt(spec.size)) : 1;
    hw *= ks; hh *= ks;
    /* INSIDE THE GLASS (2026-10-24). On the smallest hulls the dash screens
     * stood further out than the windscreen — a Dart's centre screen 0.94 m
     * ahead of the eye, its glass 0.86 m. Flat-painted, nobody could tell;
     * with the room drawn in depth, the windscreen hides whatever is past
     * it. So a forward screen that would stand closer than 14 cm to the
     * glass is drawn in toward the eye, the whole mount scaled about it —
     * position, height and size alike — so from the seat it subtends
     * exactly what it did and only its distance changes. At the Talon the
     * centre screen is exactly at that line, so nothing there moves. */
    var f = 1;
    if (spec && spec.reach && Math.abs(m.bearing) < Math.PI / 2) {
      var zmax = spec.reach * k - 0.14, cz0 = c * m.r * k;
      if (cz0 > zmax && cz0 > 1e-6) f = Math.max(0.5, zmax / cz0);
    }
    hw *= f; hh *= f;
    var cx = s * m.r * k * f, cz = c * m.r * k * f;
    /* The rear screens stand off the bulkhead, which on a raised cockpit
     * (shipdeck.js RAISED) is at the foot of the stair behind the seat:
     * there with it, rather than hanging over the top step. */
    if (spec && spec.raised && Math.abs(m.bearing) > Math.PI / 2) cz -= spec.raised.run;
    var rx = c, rz = -s;                                   // along the width
    var sl = Math.sin(m.lean), cl = Math.cos(m.lean);
    var ux = s * sl, uy = cl, uz = c * sl;                 // up the height
    function corner(sx, sy) {
      return [cx + rx * hw * sx + ux * hh * sy,
              m.y * k * f + uy * hh * sy,
              cz + rz * hw * sx + uz * hh * sy];
    }
    return [corner(-1, 1), corner(1, 1), corner(1, -1), corner(-1, -1)];
  }

  /* Kept under the old name because the cockpit suite and anything else
   * that wants to know where the instruments are should not have to care
   * that they stopped being flat slots on the dash. */
  var MFD_SLOTS = MFD_MOUNTS;

  /* With a spec, the dash fitted to that ship's glass (cockpitGeometry);
   * without one, the Talon's, which is what the suite measures against. */
  function dashPoint(s, t, spec) {
    if (spec) return dashLerp(cockpitGeometry(spec).dash, s, t);
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
    mule:    { wrap: 0.86, room: 1.16, brow: 1.22, rake: 0.26 },
    /* The hulls added 2026-10-19, each read as the nearest of the four in
     * character: a shuttle is a small courier, a tug and a hauler are
     * working freighters, the big merchants sit you further back still,
     * and the warships wrap the glass like the interceptor they outgrew. */
    wren:      { wrap: 1.04, room: 0.94, brow: 0.92, rake: 0.50 },
    bollard:   { wrap: 0.92, room: 1.02, brow: 1.18, rake: 0.30 },
    samaritan: { wrap: 0.98, room: 1.08, brow: 1.08, rake: 0.36 },
    sump:      { wrap: 0.86, room: 1.14, brow: 1.24, rake: 0.26 },
    longhaul:  { wrap: 0.84, room: 1.20, brow: 1.26, rake: 0.24 },
    tanker:    { wrap: 0.84, room: 1.20, brow: 1.28, rake: 0.24 },
    cutter:    { wrap: 1.16, room: 1.04, brow: 0.94, rake: 0.52 },
    meridian:  { wrap: 0.90, room: 1.22, brow: 1.18, rake: 0.30 },
    leviathan: { wrap: 0.82, room: 1.24, brow: 1.30, rake: 0.22 },
    crawler:   { wrap: 0.80, room: 1.26, brow: 1.34, rake: 0.20 },
    capital:   { wrap: 1.06, room: 1.24, brow: 1.20, rake: 0.34 },
    /* The hulls made flyable 2026-10-20, read the same way. The heavy tug
     * sits like the Bollard but in a bigger room, and also gets the grab
     * arms drawn past the glass (drawGrabArms); the runner and the fighter
     * wrap the glass hardest of anything, because what they do is look for
     * the next target; the carrier's bridge is the biggest room in the
     * game, set furthest back behind the most structure. */
    heavytug:      { wrap: 0.94, room: 1.06, brow: 1.16, rake: 0.30 },
    heavyshuttle:  { wrap: 1.02, room: 1.04, brow: 0.98, rake: 0.44 },
    trader:        { wrap: 0.92, room: 1.06, brow: 1.08, rake: 0.36 },
    runner:        { wrap: 1.20, room: 0.94, brow: 0.86, rake: 0.58 },
    enforcer:      { wrap: 1.14, room: 0.98, brow: 0.92, rake: 0.54 },
    enforcerheavy: { wrap: 1.04, room: 1.04, brow: 1.14, rake: 0.46 },
    fighter:       { wrap: 1.30, room: 0.86, brow: 0.78, rake: 0.64 },
    carrier:       { wrap: 0.80, room: 1.30, brow: 1.36, rake: 0.20 }
  };
  /* Which drawn model a player hull wears, so the rake can be measured off
   * the thing you can actually see out of. */
  var COCKPIT_CLASS = { talon: 'courier', dart: 'fighter',
                        kestrel: 'trader', mule: 'freighter' };

  /* ---- THE GLASS, BY ROLE AND BY HULL (2026-10-31) -------------------------
   * Astra: "I want the canopy glass in the ships to give a better view to
   * either side, as well as above and below, while also being unique to
   * every ship." Asked, she chose glass BY ROLE (fighters near a bubble,
   * couriers generous wraparound, freighters more frame but still roof and
   * lower glass) and unique BOTH ways: each hull type its own layout, each
   * individual ship its own frame bars within it.
   *
   * Three families, in the Talon's metres (scaled per hull like the rest of
   * the room):
   *   q      the quarter-lights' heights at the hinge (hTop, hBot) and the
   *          outer edge (oTop, oBot); `reach` multiplies how far round
   *   side   the side windows' top (fore and aft) and how far aft they run
   *   roof   glass in the ceiling either side of a spine that carries the
   *          overhead panel: spine half-width, outer edge (fraction of the
   *          side wall), and how far aft (z0)
   *   floor  the landing window's half-width and how much further forward
   *          it reaches; the console slot widens to match
   * The windscreen itself is NOT changed: it carries the HUD and its
   * proportions are what the cockpit suite holds the forward view to.
   *
   * PER HULL: each family's numbers are moved within a band by a stream
   * seeded on the hull id alone, plus three choices of shape — so every
   * Talon has the Talon's glass and no other hull has quite that glass.
   * PER SHIP: the frame bars across the roof, side and quarter panes come
   * from the ship's own cockpit seed (bornId), in cockpitSpec's flair. */
  var CANOPY_FAMILY = {
    bubble: { q: { hTop: 0.66, hBot: -0.42, oTop: 0.60, oBot: -0.40 }, reach: 1.30,
              side: { top: 0.80, aft: -0.75 }, roof: { spine: 0.20, out: 0.94, z0: -0.75 },
              floor: { hw: 0.40, fwd: 0.30, aft: 0.58 } },
    wrap:   { q: { hTop: 0.50, hBot: -0.30, oTop: 0.44, oBot: -0.30 }, reach: 1.12,
              side: { top: 0.66, aft: -0.20 }, roof: { spine: 0.34, out: 0.86, z0: -0.15 },
              floor: { hw: 0.33, fwd: 0.18, aft: 0.72 } },
    framed: { q: { hTop: 0.40, hBot: -0.22, oTop: 0.34, oBot: -0.22 }, reach: 1.00,
              side: { top: 0.54, aft: 0.10 }, roof: { spine: 0.46, out: 0.78, z0: 0.18 },
              floor: { hw: 0.29, fwd: 0.08, aft: 0.86 } }
  };
  var CANOPY_OF = {
    dart: 'bubble', fighter: 'bubble', runner: 'bubble', cutter: 'bubble', enforcer: 'bubble',
    talon: 'wrap', wren: 'wrap', kestrel: 'wrap', heavyshuttle: 'wrap', samaritan: 'wrap',
    trader: 'wrap', enforcerheavy: 'wrap', capital: 'wrap',
    mule: 'framed', bollard: 'framed', sump: 'framed', longhaul: 'framed', tanker: 'framed',
    meridian: 'framed', leviathan: 'framed', crawler: 'framed', heavytug: 'framed', carrier: 'framed'
  };
  var CANOPY_STYLE_CACHE = {};
  function canopyStyle(hullId, arch) {
    var id = hullId || 'talon';
    if (CANOPY_STYLE_CACHE[id]) return CANOPY_STYLE_CACHE[id];
    var fam = CANOPY_OF[id] ||
      (arch && arch.wrap >= 1.12 ? 'bubble' : arch && arch.wrap <= 0.92 ? 'framed' : 'wrap');
    var b = CANOPY_FAMILY[fam], r = new RNG('canopy-style|' + id);
    var j = function (v, d) { return v + r.range(-d, d); };
    var q = { hTop: j(b.q.hTop, 0.06), hBot: j(b.q.hBot, 0.05) };
    var swept = r.range(0, 1) < 0.5;
    q.oTop = swept ? q.hTop - r.range(0.06, 0.14) : j(b.q.oTop, 0.04);
    q.oBot = j(b.q.oBot, 0.05);
    var top = j(b.side.top, 0.07), shape = r.pick(['level', 'taper', 'rise']);
    var st = {
      family: fam,
      q: q, reach: j(b.reach, 0.08),
      side: { topF: shape === 'rise' ? top - 0.12 : top, topA: shape === 'taper' ? top - 0.14 : top,
              aft: j(b.side.aft, 0.15), shape: shape },
      roof: { spine: Math.max(0.16, j(b.roof.spine, 0.06)), out: Math.min(0.96, j(b.roof.out, 0.05)),
              z0: j(b.roof.z0, 0.15), trap: r.range(0, 1) < 0.5 ? r.range(0.08, 0.22) : 0 },
      floor: { hw: j(b.floor.hw, 0.03), fwd: Math.max(0, j(b.floor.fwd, 0.06)), aft: j(b.floor.aft, 0.05) }
    };
    /* The console slot is cut to see the whole landing window through. */
    /* The nearer its aft edge comes, the wider it looks from the seat. */
    st.slot = Math.max(0.105, st.floor.hw * (0.40 + (1.04 - st.floor.aft) * 0.30));
    CANOPY_STYLE_CACHE[id] = st;
    return st;
  }
  /* Frame bars across a pane, for one ship: their positions keep clear of
   * the pane's middle (the eye goes there first, and the cockpit suite
   * aims at it), and their count and width are the ship's own. */
  function canopyBars(rng) {
    function set(max) {
      var n = Math.floor(rng.range(0, max + 0.999)), out = [];
      if (n === 1) out.push(rng.range(0, 1) < 0.5 ? rng.range(0.28, 0.40) : rng.range(0.60, 0.72));
      else if (n >= 2) out.push(rng.range(0.26, 0.40), rng.range(0.60, 0.74));
      return out;
    }
    return { w: rng.range(0.030, 0.055), side: set(2), roof: set(2), quarter: set(1) };
  }

  var FINENESS_CACHE = {};

  /* Length over width of the hull's own mesh. A long fine nose wants steeply
   * raked glass; a blunt one wants it upright. Measured from the model
   * rather than chosen, which is the whole of "make the rake match the
   * hull" — and memoised, because it walks every vertex. */
  /* ---- the ship on the showroom floor ------------------------------------
   * Astra: "when buying ships, the selected ship model should be displayed
   * and it should rotate."
   *
   * WHICH MESH. The player's four hulls each name a mesh KIND already —
   * courier, police, merc, freighter — and HULL_ASSIGN turns a kind into a
   * library model. So a Talon is a courier-m, a Dart is a police-m, a
   * Kestrel is an enforcer-l and a Mule is a freighter-l, and the yard can
   * show four genuinely different ships without a single new table.
   *
   * That is also worth saying out loud because of what it exposes: in
   * FLIGHT the player is drawn as the courier hull whatever they bought
   * (see drawShipModel). The showroom is currently the only place in the
   * game where your Mule looks like a Mule. Fixing the flight view is its
   * own job and a bigger one; this at least stops the yard selling you a
   * silhouette it does not have.
   *
   * THE PANEL IS ITS OWN LITTLE WORLD. A camera built against the panel's
   * width and height projects to a viewport of that size with the origin at
   * its centre, so translating the context to the panel's corner puts the
   * ship exactly where it belongs, and clipping keeps a long hull from
   * spilling over the text beside it. The mesh is drawn at unit length
   * around the origin, so "how far back to stand" is a function of the
   * model's own extent rather than a number per hull. */
  function hullPreviewMesh(hullId, ship) {
    var h = global.Combat && global.Combat.HULLS && global.Combat.HULLS[hullId];
    var kind = (h && h.mesh) || 'courier';
    if (kind === 'crawler') {
      /* A player's Crawler in a navy's or the Syndicate's colours wears
       * that livery's model (2026-10-24, Combat.liveryRefusal). */
      var cid = crawlerLibId(ship);
      return crawlerLoaded(cid, libHull(cid) || libHull(HULL_ASSIGN.crawler) || shipMeshes().courier, ship);
    }
    var base = libHull(HULL_ASSIGN[kind] || HULL_ASSIGN.courier) || shipMeshes().courier;
    return base;
  }

  function crawlerLibId(ship) {
    var liv = ship && ship.livery;
    return liv === 'syn' ? HULL_ASSIGN.crawler_syndicate
         : liv === 'navy' ? HULL_ASSIGN.crawler_navy : HULL_ASSIGN.crawler;
  }

  /* ---- the Crawler's cubes (2026-10-20) ----------------------------------
   * Astra: "it can [carry freight], but we have dedicated cargo haulers for
   * that ... I want to see both in game." The frame in hulls.js is
   * imported WITHOUT its 24 containers (ref/crawler-src keeps the full
   * models); each cube is drawn here as what it holds — her own container
   * for freight, crates for station components (6 S, 4 M, 2 L or 1 XL to a
   * cube, construction.js), or nothing.
   *
   * Cube centres and size are in the hull's normalised frame, measured
   * with the importer's own transform: vertex bounds of the frame, centred
   * (mid y -1.72 m, z +0.20 m), 478.0 m to the unit.
   *
   * RE-MEASURED 2026-10-20 for Astra's re-export (bottom L berth, stern
   * craft bay; ref/crawler-src/crawler_allLiveries_14of24.glb). That file
   * draws 14 of the 24 cubes, so all 24 centres come from the generator's
   * own cube list it carried in its extras, and the 14 drawn ones agree with
   * them to the decimetre. The container colours are the models' own, cube
   * by cube, per livery. */
  var CRAWLER_CUBE = 0.0837;           // 40 m
  var CRAWLER_BAND_UP = 0.023;         // 11 m above the cube's centre
  var CRAWLER_BAND_HALF = 0.0052;      // 5 m deep
  var CRAWLER_CUBES = [
    [0.0481, 0.035, -0.151], [-0.0481, 0.035, -0.151], [0.0481, -0.0613, -0.151], [-0.0481, -0.0613, -0.151],
    [0.0481, 0.035, -0.0548], [-0.0481, 0.035, -0.0548], [0.0481, -0.0613, -0.0548], [-0.0481, -0.0613, -0.0548],
    [0.0481, 0.035, 0.0414], [-0.0481, 0.035, 0.0414], [0.0481, -0.0613, 0.0414], [-0.0481, -0.0613, 0.0414],
    [0.0481, 0.035, 0.1377], [-0.0481, 0.035, 0.1377], [0.0481, -0.0613, 0.1377], [-0.0481, -0.0613, 0.1377],
    [0.0481, 0.035, 0.2339], [-0.0481, 0.035, 0.2339], [0.0481, -0.0613, 0.2339], [-0.0481, -0.0613, 0.2339],
    [0.0481, 0.035, 0.3301], [-0.0481, 0.035, 0.3301], [0.0481, -0.0613, 0.3301], [-0.0481, -0.0613, 0.3301]
  ];
  /* [body, band] per cube, as the models paint them. */
  var CRAWLER_FREIGHT = {
    crawler_civilian: ['#b5af9e', '#b5af9e', '#9e9f99', '#d5cfbf', '#b5af9e', '#b5af9e', '#b5af9e', '#9e9f99',
                       '#d5cfbf', '#b5af9e', '#b5af9e', '#b5af9e', '#b5af9e', '#9e9f99', '#d5cfbf', '#d5cfbf',
                       '#9e9f99', '#d5cfbf', '#9e9f99', '#b5af9e', '#9e9f99', '#9e9f99', '#b5af9e', '#d5cfbf']
                      .map(function (b) { return [b, '#5e5f5a']; }),
    crawler_navy: Array.apply(null, Array(24)).map(function () { return ['#69717a', '#32373d']; }),
    crawler_syndicate: [['#792220', '#a72e29'], ['#792220', '#792220'], ['#6a2825', '#5d5f63'], ['#792220', '#792220'],
                        ['#6a2825', '#1c1c1d'], ['#393b3d', '#a72e29'], ['#7c7e82', '#792220'], ['#7c7e82', '#5d5f63'],
                        ['#5d5f63', '#792220'], ['#4b4d51', '#5d5f63'], ['#5d5f63', '#a72e29'], ['#792220', '#a72e29'],
                        ['#6a2825', '#792220'], ['#393b3d', '#792220'], ['#5d5f63', '#a72e29'], ['#7c7e82', '#1c1c1d'],
                        ['#5d5f63', '#1c1c1d'], ['#4b4d51', '#a72e29'], ['#5d5f63', '#5d5f63'], ['#792220', '#a72e29'],
                        ['#5d5f63', '#5d5f63'], ['#4b4d51', '#792220'], ['#393b3d', '#a72e29'], ['#4b4d51', '#1c1c1d']]
  };
  /* Station crates: the clamp yellow of the frame's own hazard paint, so a
   * Crawler carrying a station reads as one from across a system. */
  var CRATE_COL = { crawler_civilian: '#e7b327', crawler_navy: '#c9ced4', crawler_syndicate: '#a72e29' };
  var CRATE_STRAP = '#1d1f24';
  /* How a cube is divided for n crates of a size: [x, y, z] counts. */
  var CRATE_GRID = { XL: [1, 1, 1], L: [1, 1, 2], M: [2, 1, 2], S: [2, 1, 3] };
  var CRAWLER_CACHE = {};

  function crawlerLoaded(libId, base, ship) {
    var Cn = global.Construction;
    if (!base || !base.v || !Cn) return base;
    var lay = ship ? Cn.layout(ship) : Cn.fullLayout();
    var key = libId + '|' + lay.map(function (c) {
      return !c ? '-' : c.kind === 'freight' ? 'f' : c.size + c.n;
    }).join('');
    if (CRAWLER_CACHE[key]) return CRAWLER_CACHE[key];
    /* A new object, never the cached library mesh: gl.js caches GPU
     * buffers on the mesh object, and the frame is shared by every load. */
    var m = {};
    /* Everything but the per-object caches (`_gl` buffers, `_nozzles`),
     * which belong to the frame mesh and would draw it without the cubes. */
    for (var p in base) if (p.charAt(0) !== '_') m[p] = base[p];
    m.v = base.v.slice(); m.f = base.f.slice();
    m.c = base.c ? base.c.slice() : null;
    var h = CRAWLER_CUBE / 2;
    var freight = CRAWLER_FREIGHT[libId] || CRAWLER_FREIGHT.crawler_civilian;
    var crateCol = CRATE_COL[libId] || CRATE_COL.crawler_civilian;
    for (var i = 0; i < lay.length; i++) {
      var cell = lay[i], at = CRAWLER_CUBES[i];
      if (!cell) continue;
      if (cell.kind === 'freight') {
        merge(m, box(h, h, h), at[0], at[1], at[2], 1, freight[i][0]);
        /* The band: 8.5–13.5 m above the cube's centre, a hair proud of the sides. */
        merge(m, box(h * 1.015, CRAWLER_BAND_HALF, h * 1.015), at[0], at[1] + CRAWLER_BAND_UP, at[2], 1, freight[i][1]);
        continue;
      }
      var g = CRATE_GRID[cell.size] || [1, 1, 1];
      var cw = CRAWLER_CUBE / g[0], cd = CRAWLER_CUBE / g[2];
      var gap = 0.0016;                // a couple of metres between crates
      for (var k = 0; k < cell.n; k++) {
        var gx = k % g[0], gz = Math.floor(k / g[0]) % g[2];
        var cx = at[0] - h + cw * (gx + 0.5), cz = at[2] - h + cd * (gz + 0.5);
        merge(m, box(cw / 2 - gap, h - gap, cd / 2 - gap), cx, at[1], cz, 1, crateCol);
        merge(m, box(cw / 2 - gap * 0.6, 0.004, cd / 2 - gap * 0.6), cx, at[1] + h * 0.55, cz, 1, CRATE_STRAP);
      }
    }
    CRAWLER_CACHE[key] = m;
    return m;
  }

  /* Half the model's largest extent, so a long freighter stands further off
   * than a courier and both fill the same fraction of the frame. */
  function meshReach(mesh) {
    if (!mesh || !mesh.v || !mesh.v.length) return 0.5;
    var lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (var i = 0; i < mesh.v.length; i++) {
      for (var a = 0; a < 3; a++) {
        var v = mesh.v[i][a];
        if (v < lo[a]) lo[a] = v;
        if (v > hi[a]) hi[a] = v;
      }
    }
    var span = Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]);
    return span > 1e-6 ? span * 0.5 : 0.5;
  }

  var PORTRAIT_FILL = 2.35;          // how far back to stand, in model reaches

  function drawHullPortrait(ctx, x, y, w, h, hullId, spin, tint, paint) {
    if (!(w > 8) || !(h > 8)) return false;
    var mesh = hullPreviewMesh(hullId);
    if (!mesh || !mesh.f || !mesh.f.length) return false;

    var cam = new Camera();
    cam.target = V.zero();
    cam.yaw = spin || 0;
    /* Looking slightly DOWN on it, which is how anybody photographs a ship
     * they are trying to sell: a level shot of a hull whose interesting
     * shape is its planform reads as a line. */
    cam.pitch = 0.30;
    cam.dist = meshReach(mesh) * PORTRAIT_FILL;
    cam.near = cam.dist * 1e-3;
    cam.build(w, h);

    /* A key light from over the viewer's shoulder, turning with the model
     * rather than fixed in the world — a showroom light, not a sun. The
     * hull would otherwise swing through its own shadow twice a turn and
     * spend half the rotation unreadable. */
    var sunDir = V.norm({ x: Math.cos(cam.yaw + 0.9), y: Math.sin(cam.yaw + 0.9), z: 0.55 });
    var frame = {
      pos: V.zero(),
      right: { x: 1, y: 0, z: 0 },
      up: { x: 0, y: 0, z: 1 },
      /* The model's +z is its nose and the world's +y is what the camera
       * looks along at yaw 0, so the hull faces across the frame rather
       * than at the viewer. A ship photographed nose-on is a circle. */
      fwd: { x: 0, y: 1, z: 0 }
    };

    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.translate(x, y);
    /* The order sheet's paint, so the ship on the card is the ship you are
     * about to commission (see PAINT_NOW). */
    PAINT_NOW = paintRGB(paint);
    try { paintMesh(ctx, cam, frame, mesh, 1, sunDir, tint || '#b9c6d8'); }
    finally { PAINT_NOW = null; }
    ctx.restore();
    return true;
  }

  function hullFineness(hullId) {
    if (FINENESS_CACHE[hullId] !== undefined) return FINENESS_CACHE[hullId];
    var out = null;
    /* The four original hulls keep their entries; every hull added since
     * names its traffic class as `mesh`, and the class is its model. */
    var HL = global.Combat && global.Combat.HULLS;
    var modelId = HULL_ASSIGN[COCKPIT_CLASS[hullId] ||
                              (HL && HL[hullId] && HL[hullId].mesh) || hullId];
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

  /* The stair of a raised cockpit (shipdeck.js RAISED) when it is right
   * behind the helm, so the bulkhead and its rear screens stand at its
   * foot. Not on a hull with a bridge deck: there the helm keeps its own
   * bulkhead, arch and screens, and the stair is aft of the bridge deck
   * (measured: moved with it, a Kestrel's rear screens stood a metre
   * behind that bulkhead, blank). Her raise at her size (raiseOf). */
  function stairBehindHelm(ship) {
    var SD = global.ShipDeck;
    if (!SD || !SD.raisedCockpit || !ship || !SD.raisedCockpit(ship.hullId)) return null;
    var HL = global.Combat && global.Combat.HULLS, hull = HL && HL[ship.hullId];
    if (hull && hull.size !== 'S' && SD.stationRoles && global.Crew && global.Crew.crewNeeded &&
        SD.stationRoles(global.Crew.crewNeeded(ship.hullId, true)).length) return null;
    return raiseOf(ship, hullFit(ship));
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
    /* Drawn after the old flair, so every ship keeps the lean and trim it
     * already had (2026-10-31). */
    flair.bars = canopyBars(rng);
    var canopy = canopyStyle(ship.hullId, arch);

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
      canopy: canopy, slot: [0.5 - canopy.slot, 0.5 + canopy.slot],
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
      mfdScale: size,
      /* A cockpit up in her nose, a stair aft of it down to the deck
       * (shipdeck.js RAISED): its bulkhead and the rear screens on it are
       * at the stair's foot, not where the seat's old bulkhead was. */
      raised: stairBehindHelm(ship)
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
    /* Taller and further round since 2026-10-31, by the hull's own canopy
     * style (canopyStyle): up toward the ceiling and down past the sill,
     * which is most of the "above and below" to either side. Kept inside
     * the room's floor and ceiling, which cockpitGeometry derives the same
     * way. */
    var cs = spec.canopy || canopyStyle('talon');
    var reach = 0.34 * spec.arch.wrap * cs.reach;
    var hiY = Math.max(0.80 * k, -1.10 * k + HEADROOM) - 0.07, loY = -1.10 * k + 0.15;
    var cy = function (v) { return Math.max(loY, Math.min(hiY, v * k)); };
    var side = [
      [1.22 * k, cy(cs.q.hTop), CANOPY_Z * z * k],
      [(1.22 + reach) * k, cy(cs.q.oTop), CANOPY_Z * z * k * (1 - reach * 0.62)],
      [(1.22 + reach) * k, cy(cs.q.oBot), CANOPY_Z * z * k * (1 - reach * 0.62)],
      [1.22 * k, cy(cs.q.hBot), CANOPY_Z * z * k]
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
    /* Side, floor and roof glass from the room's own geometry, which shapes
     * them by hull (canopyStyle, 2026-10-31). */
    var g = cockpitGeometry(spec);
    add('left', clipProject(cam, localPoly(ship, g.sides[0])));
    add('right', clipProject(cam, localPoly(ship, g.sides[1])));
    add('floor', clipProject(cam, localPoly(ship, g.floorWin)));
    add('roof-right', clipProject(cam, localPoly(ship, g.roofs[0])));
    add('roof-left', clipProject(cam, localPoly(ship, g.roofs[1])));
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

  /* ---- THE ROOM AROUND THE GLASS (2026-10-24) -----------------------------
   * Astra: "We need to have a modeled interior for every ship that doesn't
   * have one, specifically the cockpit. There needs to be doors that slide
   * into the structure of the ship to open the way from the cockpit into
   * the rest of the ship." See claude/ship-interiors.md.
   *
   * Everything about the cockpit's shape, in one place and in the cockpit's
   * own metres, for one ship's spec: the panes, the walls just outside
   * them, the dash, the consoles, the overhead, the bulkhead and its door.
   * shipdeck.js builds the walkable plan and the GPU room from it; the 2D
   * interior and the greebles mount on the same surfaces.
   *
   * THE SCALING FIX. Before this, the glass and the screens grew with
   * spec.size but the consoles, overhead, bulkhead and dash were fixed at
   * the Talon's size — so on a Mule the side windows sat outside its own
   * consoles and the dash ended well short of the windscreen. Now the whole
   * room scales with the glass, and the dash runs from its near edge to the
   * windscreen's sill whatever the hull. At the Talon (size 1, room 1)
   * every number below is the old one to the millimetre, bar the bulkhead.
   *
   * THE BULKHEAD MOVED AFT, from half a metre behind the eye to 1.3 m, so
   * there is somewhere to stand when you get out of the seat and a door to
   * walk through. Never nearer than that on a small hull: a Dart's bay is
   * the Talon's bay, because the person standing in it is the same size.
   * The two rear screens moved outboard of the door with it. */
  var BULK_Z = -1.30, FLOOR_Y = -1.10, HEADROOM = 2.05;
  /* The roof glass hangs this far under the ceiling it is cut through,
   * the same gap shipdeck.js leaves between every other pane and its wall. */
  var EPS_GLASS = 0.012;
  var FOOT_HW = 0.32, DASH_NEAR_Z = 0.40, CONSOLE_X = 0.80, CONSOLE_Z0 = 0.12;

  function cockpitGeometry(spec) {
    if (!spec) spec = cockpitSpec({});
    if (spec._geom) return spec._geom;
    var k = spec.size || 1;
    var segs = canopySegments(spec);
    var main = segs[0], qR = segs[1], qL = segs[2];
    var frontZ = main[0][2];
    var sillY = Infinity;
    for (var i = 0; i < main.length; i++) sillY = Math.min(sillY, main[i][1]);
    var hingeX = 1.22 * k;
    var sideX = 1.30 * k + 0.012;
    /* THE ROOM'S EDGE, in plan, from the windscreen round to the bulkhead:
     * the quarter-light's whole width from the hinge to its outer edge Q,
     * then a short wall from Q straight back toward the seat until it
     * reaches the side wall at R, then the side wall aft.
     *
     * Q-to-R runs along the line of sight from the seat, so from the seat it
     * is seen edge-on and can never stand in front of any glass. The first
     * version cut across from where the quarter-light's line met the side
     * wall, and on every hull bigger than a Talon (whose windscreen moves
     * out faster than its side windows do) that put solid wall in front of
     * the outer half of each quarter-light. */
    var qx = qR[1][0], qz = qR[1][2];
    var meetZ = qx > sideX + 1e-6 ? qz * sideX / qx : qz;
    var floorY = FLOOR_Y * k;
    var ceilY = Math.max(0.80 * k, floorY + HEADROOM);
    var bulkZ = BULK_Z * Math.max(1, k);
    /* THE GLASS BY HULL (2026-10-31, canopyStyle). The side windows reach
     * up toward the ceiling and further aft; the sill stays on the top of
     * the side console, which is in the way of anything lower. */
    var cs = spec.canopy || canopyStyle('talon');
    var topMax = ceilY - 0.07;
    var sAft = Math.max(bulkZ + 0.35, cs.side.aft * k);
    /* Its forward edge is where the side wall turns in toward the
     * quarter-light (meetZ): a pane forward of that would stand in the air
     * inside the room, and as tall as these are now it would cut sky into
     * the frame round the quarter-light behind it. From the seat the turn
     * is edge-on, so side window and quarter-light read as one wrap. */
    var sFwd = Math.min(1.06 * k, meetZ - 0.01);
    var sideL = [
      [-1.30 * k, Math.min(topMax, cs.side.topF * k), sFwd],
      [-1.30 * k, Math.min(topMax, cs.side.topA * k), sAft + 0.04 * k],
      [-1.30 * k, -0.24 * k, sAft],
      [-1.30 * k, -0.29 * k, sFwd - 0.04 * k]
    ];
    var sideR = mirrorX(sideL);
    /* The landing window: wider, further forward, and back under the desk
     * toward your feet - all of the footwell you can see down through the
     * console slot - on the same slope. */
    var fwx = cs.floor.hw / 0.28, fwd = cs.floor.fwd, aftZ = Math.max(0.52, cs.floor.aft || 1.04);
    var floorWin = FLOOR_WINDOW.map(function (p) {
      var dz = p[2] > 1.3 ? fwd : aftZ - p[2];
      return [p[0] * fwx * k, (p[1] + dz * 0.161) * k, (p[2] + dz) * k];
    });
    var footZ = 0;
    for (i = 0; i < floorWin.length; i++) footZ = Math.max(footZ, floorWin[i][2]);
    footZ = Math.max(footZ + 0.06, frontZ + 0.05);
    var floorHalf = 0;
    for (i = 0; i < floorWin.length; i++) floorHalf = Math.max(floorHalf, Math.abs(floorWin[i][0]));
    var footHW = Math.max(FOOT_HW * k, floorHalf + 0.04 * k);
    var slot = spec.slot || [SLOT_S0, SLOT_S1];

    /* The dash: near edge where it always was (scaled), far edge on the
     * windscreen's sill. */
    var dash = {
      fl: [DASH.fl[0] * k, sillY, frontZ], fr: [DASH.fr[0] * k, sillY, frontZ],
      nl: [DASH.nl[0] * k, DASH.nl[1] * k, DASH.nl[2] * k],
      nr: [DASH.nr[0] * k, DASH.nr[1] * k, DASH.nr[2] * k]
    };
    var dashNearZ = dash.nl[2];
    var deskY = function (z) {
      var u = (z - dash.nl[2]) / ((dash.fl[2] - dash.nl[2]) || 1);
      return dash.nl[1] + (dash.fl[1] - dash.nl[1]) * u;
    };
    var dp = function (s, tt) { return dashLerp(dash, s, tt); };
    var dashFaces = [];
    /* Glare shield and desk, each in two halves round the floor-window
     * slot, exactly the four surfaces the 2D interior always filled. */
    [[-0.98, -0.98 + slot[0] * 1.96], [-0.98 + slot[1] * 1.96, 0.98]].forEach(function (h) {
      var x0 = h[0] * k, x1 = h[1] * k;
      dashFaces.push({ tone: 'glare', pts: [[x0, sillY, frontZ], [x1, sillY, frontZ],
        [x1 * 0.88, sillY - 0.06 * k, frontZ - 0.22 * k], [x0 * 0.88, sillY - 0.06 * k, frontZ - 0.22 * k]] });
    });
    [[0, slot[0]], [slot[1], 1]].forEach(function (h) {
      dashFaces.push({ tone: 'console', desk: true,
                       pts: [dp(h[0], 0.04), dp(h[1], 0.04), dp(h[1], 1), dp(h[0], 1)] });
    });

    /* Across and up with the hull's size; fore and aft with the windscreen's
     * actual distance, which grows faster (reach is room x size, and the
     * glass sits at reach x size) — a Dart's glass is 0.86 m out and a
     * Mule's 2.14 m, so consoles and overhead sized off `k` alone ran
     * through the Dart's windscreen and stopped short of the Mule's. */
    var kz = frontZ / CANOPY_Z;
    function sc(pts) { return pts.map(function (p) { return [p[0] * k, p[1] * k, p[2] * kz]; }); }
    var cl = sc(INTERIOR[0].pts), cr = sc(INTERIOR[1].pts);
    var consoles = [
      { side: -1, top: cl, inner: [cl[2], cl[3]], end: [cl[1], cl[2]], front: [cl[0], cl[3]] },
      { side: 1, top: cr, inner: [cr[2], cr[1]], end: [cr[3], cr[2]], front: [cr[0], cr[1]] }
    ];
    /* THE ROOF GLASS (2026-10-31): a pane either side of a spine down the
     * middle of the ceiling, from the side wall's turn (meetZ) aft as far
     * as the hull's style takes it. The overhead panel narrows to that
     * spine and stops where the roof glass starts forward, so it never
     * hangs across the top of the windscreen. */
    var spineX = cs.roof.spine * k, roofZ1 = meetZ - 0.04;
    var roofZ0 = Math.min(roofZ1 - 0.4, Math.max(bulkZ + 0.30, cs.roof.z0 * kz));
    var roofXi = spineX + 0.05 * k, roofXo = Math.max(roofXi + 0.25, cs.roof.out * sideX - 0.06);
    var trap = (cs.roof.trap || 0) * k, roofY = ceilY - EPS_GLASS;
    var roofR = [[roofXi, roofY, roofZ1], [roofXi, roofY, roofZ0],
                 [roofXo, roofY, roofZ0 + trap], [roofXo, roofY, roofZ1 - trap * 0.5]];
    var roofs = [roofR, mirrorX(roofR)];
    var ohs = cs.roof.spine / 0.86;
    var overhead = sc(INTERIOR[2].pts).map(function (p) {
      return [p[0] * ohs, p[1], Math.min(p[2], Math.max(roofZ1 + 0.02, 0.46 * kz + 0.12))];
    });

    /* FRAME BARS, this ship's own (cockpitSpec flair.bars): vertical bars
     * across the side windows, bars across the roof panes, and maybe one
     * across each quarter-light. Each lies a few millimetres inside its
     * pane, toward the seat. */
    var fb = (spec.flair && spec.flair.bars) || { w: 0.04, side: [], roof: [], quarter: [] };
    var bars = [];
    function barsOn(pane, fs) {
      fs.forEach(function (f) { var q = barQuad(pane, f, fb.w * k); if (q) bars.push(q); });
    }
    barsOn(sideL, fb.side); barsOn(sideR, fb.side);
    roofs.forEach(function (r) { barsOn(r, fb.roof); });
    barsOn(qR, fb.quarter); barsOn(qL, fb.quarter);
    /* Raised (shipdeck.js RAISED): the bulkhead is the one at the foot of
     * the stair, `run` further aft, down on the deck `rise` below. */
    var rzd = spec.raised, bz = bulkZ - (rzd ? rzd.run : 0), bfy = floorY - (rzd ? rzd.rise : 0);
    var bulkhead = [[-sideX, ceilY, bz + 0.002], [sideX, ceilY, bz + 0.002],
                    [sideX, bfy, bz + 0.002], [-sideX, bfy, bz + 0.002]];

    var g = {
      k: k, frontZ: frontZ, sillY: sillY, hingeX: hingeX, sideX: sideX, meetZ: meetZ,
      quarterOuter: [Math.max(qx, sideX), qz],
      floorY: floorY, ceilY: ceilY, bulkZ: bulkZ, bulkFloorY: bfy, footHW: footHW, footZ: footZ,
      main: main, quarters: [qR, qL], sides: [sideL, sideR], floorWin: floorWin,
      roofs: roofs, roofZ0: roofZ0, roofZ1: roofZ1, spineX: spineX, bars: bars, slot: slot,
      /* Order matters: the suites index main, quarters, sides and floor
       * as 0..5; the roof panes come after. */
      windows: [main, qR, qL, sideL, sideR, floorWin, roofs[0], roofs[1]],
      dash: dash, dashNearZ: dashNearZ, dashHW: 0.98 * k, deskY: deskY, dashFaces: dashFaces,
      consoles: consoles, consoleX: CONSOLE_X * k, consoleZ0: CONSOLE_Z0 * kz,
      overhead: overhead, overheadZ0: 0.46 * kz, bulkhead: bulkhead, kz: kz,
      doorHW: global.ShipDeck ? global.ShipDeck.DOOR_HW : 0.45,
      doorH: global.ShipDeck ? global.ShipDeck.DOOR_H : 2.0
    };
    g.bulkRegions = bulkheadRegions(g, spec);
    spec._geom = g;
    return g;
  }

  function dashLerp(d, s, t) {
    var out = [];
    for (var a = 0; a < 3; a++) {
      var f = d.fl[a] + (d.fr[a] - d.fl[a]) * s;
      var n = d.nl[a] + (d.nr[a] - d.nl[a]) * s;
      out.push(f + (n - f) * t);
    }
    return out;
  }

  /* Free space on the bulkhead for greebles, in its (u, v) — u across from
   * port, v down from the ceiling: either side of the door, round the rear
   * screens, clear of the kick plate. Worked out from the real door and
   * the real screens so neither can be greebled over whatever size the
   * room is. */
  function bulkheadRegions(g, spec) {
    var bfl = g.bulkFloorY !== undefined ? g.bulkFloorY : g.floorY;
    var W = 2 * g.sideX, Hh = g.ceilY - bfl;
    var uOf = function (x) { return (x + g.sideX) / W; };
    var vOf = function (y) { return (g.ceilY - y) / Hh; };
    var door0 = uOf(-g.doorHW - 0.08), door1 = uOf(g.doorHW + 0.08);
    var out = [];
    MFD_MOUNTS.forEach(function (m) {
      if (Math.abs(m.bearing) < Math.PI / 2) return;
      var c = mfdCorners(m, 0.03, spec);
      var xs = c.map(function (p) { return p[0]; }), ys = c.map(function (p) { return p[1]; });
      var u0 = uOf(Math.min.apply(null, xs)), u1 = uOf(Math.max.apply(null, xs));
      var v0 = vOf(Math.max.apply(null, ys)), v1 = vOf(Math.min.apply(null, ys));
      var left = u1 < 0.5;
      var c0 = left ? 0.02 : door1 + 0.01, c1 = left ? door0 - 0.01 : 0.98;
      if (c1 - c0 < 0.02) return;
      if (v0 - 0.06 > 0.04) out.push([c0, 0.04, c1, v0 - 0.02]);
      out.push([c0, v1 + 0.02, c1, Math.min(0.80, v1 + 0.30)]);
      if (u0 - 0.01 - c0 > 0.02) out.push([c0, v0, u0 - 0.01, v1]);
      if (c1 - (u1 + 0.01) > 0.02) out.push([u1 + 0.01, v0, c1, v1]);
    });
    return out;
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
  function drawCockpitShell(ctx, cam, ship, w, h, opts) {
    drawGrabArms(ctx, cam, ship);       // outside the glass: behind the shell
    var apertures = apertureSet(cam, ship);
    var a;

    /* Fill the whole screen and punch every window out of it with a single
     * even-odd fill. One operation, any number of openings, correct at any
     * head angle and any aspect ratio, with no clipping rectangle to keep
     * in sync with the geometry.
     *
     * WITH THE GPU ROOM (2026-10-24) the same fill ERASES instead: the room
     * is on the world layer under this canvas, and everything this canvas
     * already holds outside the glass — a 2D tunnel, a label, a wake —
     * is outside the ship and has to go, exactly as the painted hull used
     * to cover it. Through the glass, nothing changes. */
    var gpu = cockpitGpu() && queueCockpitRoom(cam, ship, opts);
    ctx.save();
    if (gpu) {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = '#000';
    } else {
      var grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, '#141a24');
      grad.addColorStop(0.55, '#0e131b');
      grad.addColorStop(1, '#080b11');
      ctx.fillStyle = grad;
    }
    ctx.beginPath();
    ctx.rect(0, 0, w, h);
    for (a = 0; a < apertures.length; a++) tracePath(ctx, apertures[a].pts);
    ctx.fill('evenodd');
    /* Walking aft of the bridge door, the windows are only seen through the
     * doorway (`opts.clip`, on screen), so everything outside it goes too —
     * all of it, with the door shut. */
    if (gpu && opts && opts.clip) {
      ctx.beginPath();
      ctx.rect(0, 0, w, h);
      if (opts.clip.length) tracePath(ctx, opts.clip);
      ctx.fill('evenodd');
    }
    ctx.restore();

    /* On foot the window furniture below is drawn by the room itself; these
     * flat strokes have no depth and would show through the walls. */
    if (gpu && opts && opts.walking) {
      var fr = null;
      for (a = 0; a < apertures.length; a++) if (apertures[a].id === 'front') fr = apertures[a].pts;
      return { apertures: apertures, aperture: fr, gpu: true };
    }

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

    /* This ship's frame bars across its panes (cockpitGeometry `bars`).
     * With the GPU room they are part of the room and depth-tested there. */
    if (!gpu) {
      var bspec = cockpitSpec(ship), bgeo = cockpitGeometry(bspec);
      for (a = 0; a < bgeo.bars.length; a++) {
        var bp = clipProject(cam, localPoly(ship, bgeo.bars[a]));
        if (bp) fillPoly(ctx, bp, barColour(ship), 'rgba(140,170,205,0.16)');
      }
    }

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
    return { apertures: apertures, aperture: front, gpu: !!gpu };
  }

  /* Everything between the pilot and the glass. */
  function drawCockpitInterior(ctx, cam, ship, w, h, opts) {
    var i, poly;
    opts = opts || {};
    var spec = cockpitSpec(ship);
    var geo = cockpitGeometry(spec);
    /* Consumed: the room was queued for this camera by this frame's shell. */
    var gpu = cockpitGpu() && ROOM_QUEUED.ship === ship && ROOM_QUEUED.cam === cam;
    ROOM_QUEUED.ship = ROOM_QUEUED.cam = null;

    /* WALKING, OUT OF THE ROOM: everything on this canvas below is inside
     * the cockpit, and from the passage the cockpit is only ever seen
     * through its door — so the whole layer is clipped to the doorway. */
    ctx.save();
    if (opts.clip) {
      ctx.beginPath();
      if (opts.clip.length) tracePath(ctx, opts.clip); else ctx.rect(0, 0, 0, 0);
      ctx.clip();
    }

    /* Side consoles, overhead panel and rear bulkhead — the things that
     * make turning your head worth doing. Clipped, because at wide head
     * angles these are exactly the polygons that straddle the eye plane.
     *
     * The same surfaces either way, from cockpitGeometry. WITHOUT the GPU
     * room they are filled here, flat, as they always were — the dash in
     * two halves round the floor-window slot, glare shield and desk. WITH
     * it they are the room's, lit on the world layer, and what is left to
     * do here is the old painter's trick the other way round: the HUD on
     * the glass was drawn before this, and wherever a slab of the room is
     * in front of the glass the HUD has to go, or the attitude ladder would
     * float over the console. So the same polygons ERASE. */
    var slabs = [];
    geo.consoles.forEach(function (c) { slabs.push({ pts: c.top, fill: '#131a25', line: 'rgba(120,150,190,0.16)' }); });
    slabs.push({ pts: geo.overhead, fill: '#0f151e', line: 'rgba(120,150,190,0.12)' });
    geo.dashFaces.forEach(function (f) {
      slabs.push({ pts: f.pts, fill: f.desk ? '#161d28' : '#080b10', line: f.desk ? 'rgba(120,150,190,0.20)' : null });
    });
    if (gpu) {
      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';
      for (i = 0; i < slabs.length; i++) {
        poly = clipProject(cam, localPoly(ship, slabs[i].pts));
        if (poly) fillPoly(ctx, poly, '#000');
      }
      ctx.restore();
    } else {
      /* The bulkhead first, with the door in it, then the rest. The door is
       * drawn shut: without the GPU room there is no walking aft to open
       * it for, and a painted gap would be a window into nothing. */
      drawBulkhead2D(ctx, cam, ship, geo);
      for (i = 0; i < slabs.length; i++) {
        poly = clipProject(cam, localPoly(ship, slabs[i].pts));
        if (poly) fillPoly(ctx, poly, slabs[i].fill, slabs[i].line);
      }
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
    lampRow(ctx, cam, ship, spec);

    // Screws down the fold of the glare shield: four dots, and the cheapest
    // thing in here that says "assembled" rather than "modelled".
    for (i = 0; i < 4; i++) {
      var sp = projLocal(cam, ship, dashPoint(0.09 + i * 0.273, 0.028, spec));
      if (!sp) continue;
      ctx.fillStyle = 'rgba(150,180,215,0.30)';
      ctx.beginPath(); ctx.arc(sp.x, sp.y, 1.4, 0, K.TAU); ctx.fill();
    }

    /* Greebles and accent light, BEFORE the screens: every screen stands in
     * front of the slab behind it, so it must also be painted after what is
     * bolted to that slab. */
    drawAccentStrips(ctx, cam, ship, spec);
    drawGreebles(ctx, cam, ship, spec, w, h);
    drawCapacitorBank(ctx, cam, ship);

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

    /* THE BRIDGE DECK'S SCREENS (2026-10-25). On a conning-tower bridge
     * each crew station carries a live MFD (ShipDeck.stationScreen), drawn
     * on the world layer like the helm's and depth-tested there, so a wall
     * or a console hides it. Only when they can be seen — walking the
     * bridge deck, or turned round in the seat — since each is a readout
     * redrawn on its own clock. GPU only: the bridge deck is a GPU room. */
    var SDk = global.ShipDeck, showSt = opts.walking || Math.abs((cam.look && cam.look.yaw) || 0) > 0.9;
    if (showSt && SDk && SDk.stationScreen && global.GLWorld && global.GLWorld.available) {
      var dk = shipInterior(ship);
      if (dk && dk.plan.tower) {
        var px = SDk.STATION_SCREEN_PX;
        dk.plan.stations.forEach(function (st, si) {
          if (st.cockpit) return;
          var cs = SDk.stationScreen(st, dk.geom.sideX, dk.geom.floorY);
          var wc2 = cs.map(function (q) { return localToWorld(ship, q[0] * M, q[1] * M, q[2] * M); });
          var sp = { id: 'station-' + si, role: st.role, n: st.n, w: px[0], h: px[1], world: wc2, cam: cam, station: true };
          if (mfdGpu(sp)) mfds.push(sp);
        });
      }
    }

    /* Side-console switch blocks used to be drawn here (sideConsoleDetail):
     * three flat blocks a console, so turning your head found something with
     * a light on it. The greebles above cover the whole console now, so
     * those placeholders are retired rather than drawn under them. */

    ctx.restore();
    return { mfds: mfds, emitters: emitters, gpu: gpu };
  }

  /* The bulkhead on the 2D path: the wall either side of the door and over
   * it, and the door itself, shut, with its two leaves and the hazard edge
   * where they meet. */
  function drawBulkhead2D(ctx, cam, ship, g) {
    var z = g.bulkZ + 0.002, dw = g.doorHW, top = g.floorY + g.doorH;
    var pieces = [
      { pts: [[-g.sideX, g.ceilY, z], [-dw, g.ceilY, z], [-dw, g.floorY, z], [-g.sideX, g.floorY, z]], fill: '#111823' },
      { pts: [[dw, g.ceilY, z], [g.sideX, g.ceilY, z], [g.sideX, g.floorY, z], [dw, g.floorY, z]], fill: '#111823' },
      { pts: [[-dw, g.ceilY, z], [dw, g.ceilY, z], [dw, top, z], [-dw, top, z]], fill: '#111823' },
      { pts: [[-dw, top, z - 0.06], [0, top, z - 0.06], [0, g.floorY, z - 0.06], [-dw, g.floorY, z - 0.06]], fill: '#1a2330' },
      { pts: [[0, top, z - 0.06], [dw, top, z - 0.06], [dw, g.floorY, z - 0.06], [0, g.floorY, z - 0.06]], fill: '#1a2330' },
      { pts: [[-0.03, top - 0.05, z - 0.058], [0.03, top - 0.05, z - 0.058],
              [0.03, g.floorY + 0.05, z - 0.058], [-0.03, g.floorY + 0.05, z - 0.058]], fill: '#a8781f' }
    ];
    for (var i = 0; i < pieces.length; i++) {
      var poly = clipProject(cam, localPoly(ship, pieces[i].pts));
      if (poly) fillPoly(ctx, poly, pieces[i].fill, 'rgba(120,150,190,0.18)');
    }
  }

  /* Eight lamps across the console, on the lip just behind the screens.
   * Colour is state, not decoration — a dark lamp means that system has
   * nothing to say. */
  function lampRow(ctx, cam, ship, spec) {
    var fuelFrac = ship.fuelCap ? ship.fuel / ship.fuelCap : 1;
    var thrFrac = ship.thrusterCap ? ship.thrusterFuel / ship.thrusterCap : 1;
    var hullHurt = ship.hullMax ? ship.hull < ship.hullMax * 0.999 : false;
    var shieldUp = ship.shieldCap ? ship.shield > ship.shieldCap * 0.05 : false;
    var OFF = '#151d26';
    /* MASTER CAUTION took the first spare bay (2026-10-15). It was a greeble
     * on the dash first, and measured from the seat that put it off the
     * bottom-left of the screen — a caution light you cannot see is not one.
     * The lamp row is where the eye already goes. It flashes on the wall
     * clock whenever any lamp to its left is amber or red. */
    var cautionNow = !!ship.fuelOut || thrFrac < 0.15 || fuelFrac < 0.2 || hullHurt;
    var tNow = (global.performance && global.performance.now) ? global.performance.now() / 1000 : 0;
    var lamps = [
      ship.docked || ship.landed ? '#7dffb0' : OFF,          // clamped
      ship.docked ? '#7dffb0' : OFF,                          // umbilical
      ship.fuelOut ? '#ff6b5a' : (thrFrac < 0.15 ? '#ffb86b' : OFF),
      fuelFrac < 0.2 ? '#ffb86b' : OFF,                       // jump fuel
      hullHurt ? '#ff6b5a' : OFF,                             // hull
      shieldUp ? '#8fd8ff' : OFF,                             // shields
      cautionNow && (tNow * 1.5) % 1 < 0.55 ? '#ffb347' : OFF, // master caution
      OFF                                                     // spare bay
    ];
    for (var i = 0; i < lamps.length; i++) {
      var s0 = 0.055 + i * 0.114;
      var q = projQuad(cam, ship,
        dashPoint(s0, 0.325, spec), dashPoint(s0 + 0.062, 0.325, spec),
        dashPoint(s0 + 0.062, 0.385, spec), dashPoint(s0, 0.385, spec));
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

  /* ---- GREEBLES: the cockpit as a place that is switched on (2026-10-15) ---
   *
   * Astra: "can we add some greebles that light up and some other shit to
   * the interior of the cockpit". The room was a handful of flat dark slabs
   * with eight lamps on them, and a per-hull cockpit that only changed the
   * glass — so a Dart and a Mule were the same empty room with different
   * windows.
   *
   * WHAT THIS IS. A kit of small mounted things — switch banks, back-lit
   * button grids, LED bars, vents, little readouts, plates with seams and
   * screws — laid out once per ship and drawn as flat quads on the surfaces
   * that already exist. Three rules:
   *
   *   1. LIGHT MEANS SOMETHING WHERE IT CAN. The LED bars that can be bound
   *      to the ship ARE bound: throttle, jump fuel, reaction mass, hull,
   *      shields. Master caution flashes when a lamp on the dash would. The
   *      rest blink and chase on their own clocks, because a real panel has
   *      plenty of lights nobody is watching.
   *   2. EACH HULL HAS A CHARACTER, from the same table cockpitSpec reads:
   *      a Dart is sparse and military, red and amber; a Mule is dense and
   *      utilitarian, green and amber. Layout is seeded off cockpitSeed —
   *      bornId, not the registration — so the panel you learned is the
   *      panel you keep, and two Mules are not wired identically.
   *   3. NO BLUR. The glow under a lit block is ONE additive gradient per
   *      block, not a shadow per LED. shadowBlur on this canvas is what cost
   *      the cockpit half its frame rate (see GLASS_GLOW above); this must
   *      not be the next thing that does.
   *
   * Machines run on the WALL CLOCK, like the doors: a status light blinks
   * at the same rate at 10,000x warp as at 1x. */

  var GREEBLE_HULLS = {
    /* pal: LED colours, the first most common. metal: the plate colour.
     * density: share of free panel space that gets a block. */
    dart:    { pal: ['#ff5a4a', '#ffb347', '#ffd27a', '#7dffb0'], accent: '#ff7a52',
               metal: '#1b2029', density: 0.62, guards: true },
    talon:   { pal: ['#7dffb0', '#8fd8ff', '#ffd27a', '#ff6b5a'], accent: '#7fe6c8',
               metal: '#18202b', density: 0.80 },
    kestrel: { pal: ['#8fd8ff', '#e8eef7', '#ffb347', '#7dffb0'], accent: '#9fc4ff',
               metal: '#19212d', density: 0.86 },
    mule:    { pal: ['#7dffb0', '#ffb347', '#ffd27a', '#8fd8ff'], accent: '#b8e07a',
               metal: '#1c2229', density: 0.96 },
    /* THE SYNDICATE'S OWN (2026-10-24). Astra: "the syndicate ships need to
     * have the dark grey and red motif on the interior too." Plate in the
     * hull art's own greys, the accent strip in its red, and the lights red
     * and amber with the one green kept for the bars that have to read as
     * "fine". The enforcers guard their switches like the Dart; a runner
     * does not bother. */
    /* `plate`, `screw` and `lever` replace the civilian blue-black under the
     * fittings with the same neutral greys, so a Syndicate panel is grey
     * metal with red light on it rather than navy metal with red light. */
    runner:        { pal: ['#ff4a3d', '#ffb347', '#ff7a52', '#7dffb0'], accent: '#c8362f',
                     metal: '#232325', density: 0.70,
                     plate: '#111112', screw: '#4b4d51', lever: '#393b3d' },
    enforcer:      { pal: ['#ff4a3d', '#ff7a52', '#ffb347', '#7dffb0'], accent: '#a72e29',
                     metal: '#26272a', density: 0.78, guards: true,
                     plate: '#111112', screw: '#4b4d51', lever: '#393b3d' },
    enforcerheavy: { pal: ['#ff4a3d', '#ffb347', '#ff7a52', '#7dffb0'], accent: '#a72e29',
                     metal: '#2b2c2e', density: 0.90, guards: true,
                     plate: '#111112', screw: '#4b4d51', lever: '#393b3d' }
  };

  /* Whose fittings: the hull's own, except a Crawler in the Syndicate's
   * colours, which is fitted out like their heavy (2026-10-24). */
  function greebleStyle(ship) {
    if (ship && ship.livery === 'syn') return GREEBLE_HULLS.enforcerheavy;
    return GREEBLE_HULLS[ship && ship.hullId] || GREEBLE_HULLS.talon;
  }

  /* Free space on each surface, in that surface's own (u, v), chosen to stay
   * clear of what is already mounted: the rear screens and the hatch panel
   * on the bulkhead, the floor-window slot and the lamp row on the dash. */
  /* The side consoles are given over whole: their three old flat blocks
   * (sideConsoleDetail) were the placeholder this replaces, and leaving them
   * in made half of every console a blank slab beside the new fittings. */
  var GREEBLE_REGIONS = [
    { surf: 'sideL', rects: [[0.05, 0.08, 0.95, 0.92]] },
    { surf: 'sideR', rects: [[0.05, 0.08, 0.95, 0.92]] },
    { surf: 'overhead', rects: [[0.06, 0.10, 0.94, 0.90]] },
    { surf: 'bulkhead', rects: [[0.03, 0.05, 0.97, 0.24], [0.03, 0.72, 0.97, 0.95],
                                [0.02, 0.30, 0.17, 0.68], [0.83, 0.30, 0.98, 0.68]] },
    { surf: 'dash', rects: [[0.03, 0.46, 0.36, 0.95], [0.64, 0.46, 0.97, 0.95]] }
  ];

  /* A surface as a function of (u, v), so a block can be laid out once in
   * flat coordinates and land on whichever slab it was given. Exactly ON
   * the slab: the interior is painted in order on the 2D canvas, so a block
   * drawn after its surface is in front of it with no depth to fight. */
  /* The surfaces are the room's own (cockpitGeometry), so a greeble lands on
   * the slab the GPU draws, scaled with the hull. Without a spec, the
   * Talon's, as before. */
  function greebleSurface(name, spec) {
    var q, g = spec ? cockpitGeometry(spec) : null;
    if (name === 'dash') return function (u, v) { return dashPoint(u, v, spec); };
    if (name === 'sideL') q = g ? g.consoles[0].top : INTERIOR[0].pts;
    else if (name === 'sideR') { q = g ? g.consoles[1].top : INTERIOR[1].pts; q = [q[0], q[3], q[2], q[1]]; }
    else if (name === 'overhead') q = g ? g.overhead : INTERIOR[2].pts;
    else q = g ? g.bulkhead : INTERIOR[3].pts;
    return function (u, v) { return quadPoint(q, u, v); };
  }

  /* The regions for one ship: the fixed ones, with the bulkhead's worked
   * out round that ship's door and rear screens. */
  function greebleRegions(spec) {
    var g = cockpitGeometry(spec);
    return GREEBLE_REGIONS.map(function (r) {
      return r.surf === 'bulkhead' ? { surf: 'bulkhead', rects: g.bulkRegions } : r;
    });
  }

  /* Split a free rect into blocks, the way panel space gets carved up on a
   * real console: cut along the long side, keep cutting until a piece is
   * about the size of one fitting.
   *
   * IN METRES, not in (u, v). The first version cut in surface units, and
   * the surfaces are wildly different sizes — the overhead is 1.7 m across,
   * a console strip a fraction of that — so the same rule made fiddly
   * fittings on one slab and 30 cm LED pips on another. Seen in play.
   * `lu`/`lv` are the surface's size in metres along u and v. */
  var BLOCK_MAX_W = 0.30, BLOCK_MAX_H = 0.22;     // m
  function splitRect(r, rng, out, depth, lu, lv) {
    var du = (r[2] - r[0]) * lu, dv = (r[3] - r[1]) * lv;
    if (depth > 7 || (du < BLOCK_MAX_W && dv < BLOCK_MAX_H)) { out.push(r); return; }
    var k = rng.range(0.35, 0.65);
    if (du / BLOCK_MAX_W >= dv / BLOCK_MAX_H) {
      var um = r[0] + (r[2] - r[0]) * k;
      splitRect([r[0], r[1], um, r[3]], rng, out, depth + 1, lu, lv);
      splitRect([um, r[1], r[2], r[3]], rng, out, depth + 1, lu, lv);
    } else {
      var vm = r[1] + (r[3] - r[1]) * k;
      splitRect([r[0], r[1], r[2], vm], rng, out, depth + 1, lu, lv);
      splitRect([r[0], vm, r[2], r[3]], rng, out, depth + 1, lu, lv);
    }
  }

  function dist3(a, b) {
    return Math.sqrt((a[0] - b[0]) * (a[0] - b[0]) + (a[1] - b[1]) * (a[1] - b[1]) +
                     (a[2] - b[2]) * (a[2] - b[2]));
  }

  var BIND_SOURCES = ['throttle', 'fuel', 'mass', 'hull', 'shield'];

  /* The layout: a flat list of quads, each with how to colour it. Built once
   * per cockpit key and cached on the spec, so the per-frame cost is
   * projecting and filling, nothing else. */
  function greebleLayout(ship, spec) {
    var style = greebleStyle(ship);
    /* Rebuilt if a repaint changed whose colours she wears; the same seed,
     * so the fittings stay where they were and only their colours change. */
    if (spec._greebles && spec._greebles.style === style) return spec._greebles;
    var rng = new RNG(spec.key + '|greebles');
    var items = [], blocks = [], binds = 0, caution = false;

    function pal() {
      var p = style.pal, x = rng.range(0, 1);
      return x < 0.55 ? p[0] : x < 0.75 ? p[1] : x < 0.9 ? p[2] : p[3];
    }

    var REGIONS = greebleRegions(spec);
    for (var g = 0; g < REGIONS.length; g++) {
      var reg = REGIONS[g], at = greebleSurface(reg.surf, spec);
      /* The slab's size in metres, averaged across its two opposite edges. */
      var lu = (dist3(at(0, 0), at(1, 0)) + dist3(at(0, 1), at(1, 1))) / 2;
      var lv = (dist3(at(0, 0), at(0, 1)) + dist3(at(1, 0), at(1, 1))) / 2;
      var pieces = [];
      for (var r = 0; r < reg.rects.length; r++) splitRect(reg.rects[r], rng, pieces, 0, lu, lv);
      for (var p = 0; p < pieces.length; p++) {
        var pc = pieces[p];
        /* Inset by a centimetre, so neighbouring blocks have a seam. */
        var iu = 0.010 / lu, iv = 0.010 / lv;
        var b = [pc[0] + iu, pc[1] + iv, pc[2] - iu, pc[3] - iv];
        var bw = b[2] - b[0], bh = b[3] - b[1];
        /* And the same block in metres, which is what every count below is
         * decided in. */
        var mw = bw * lu, mh = bh * lv;
        if (mw < 0.04 || mh < 0.03) continue;
        /* `rad` is the block's half-diagonal in metres — what the per-frame
         * cull tests against, so a block wholly off screen costs one point
         * projected, not every quad in it. */
        var cen = at((b[0] + b[2]) / 2, (b[1] + b[3]) / 2);
        var block = { lit: [], items: [], centre: cen,
                      rad: Math.max(dist3(cen, at(b[0], b[1])), dist3(cen, at(b[2], b[3])),
                                    dist3(cen, at(b[2], b[1])), dist3(cen, at(b[0], b[3]))),
                      colour: style.accent };
        blocks.push(block);

        /* In block-local (a, b) in [0,1]^2. */
        var quad = function (a0, b0, a1, b1) {
          return [at(b[0] + bw * a0, b[1] + bh * b0), at(b[0] + bw * a1, b[1] + bh * b0),
                  at(b[0] + bw * a1, b[1] + bh * b1), at(b[0] + bw * a0, b[1] + bh * b1)];
        };
        /* Layer 0 is the block's own back plate; everything bolted to it is
         * layer 1. The draw batches by colour within a layer, so this is
         * what keeps a back plate from being painted over its own LEDs. */
        var add = function (it, layer) {
          it.layer = layer || 1;
          items.push(it); block.items.push(it);
          if (it.led) block.lit.push(it);
        };

        if (rng.range(0, 1) > style.density) {
          /* Bare plate: a seam and four screws. Texture, not light. */
          add({ pts: quad(0, 0, 1, 1), fill: style.metal, line: 'rgba(120,150,190,0.16)' }, 0);
          /* Screws a centimetre across, wherever the plate's corners are. */
          var su = 0.006 / mw, sv = 0.006 / mh, mu = 0.018 / mw, mv = 0.018 / mh;
          var sc = [[mu, mv], [1 - mu, mv], [1 - mu, 1 - mv], [mu, 1 - mv]];
          for (var s = 0; s < 4; s++) {
            add({ pts: quad(sc[s][0] - su, sc[s][1] - sv, sc[s][0] + su, sc[s][1] + sv),
                  fill: style.screw || '#3a4656' });
          }
          continue;
        }

        add({ pts: quad(0, 0, 1, 1), fill: style.plate || '#0b1016', line: 'rgba(130,160,200,0.24)' }, 0);
        var aspect = mw / mh;
        var pick = rng.range(0, 1);
        var kind = aspect > 2.2 ? (pick < 0.55 ? 'ledbar' : pick < 0.8 ? 'readout' : 'vent')
                 : aspect < 0.6 ? (pick < 0.6 ? 'switches' : 'vent')
                 : (pick < 0.40 ? 'switches' : pick < 0.72 ? 'buttons' : pick < 0.86 ? 'readout' : 'ledbar');
        /* The first big-enough block on the dash repeats master caution —
         * the lamp itself is in lampRow, where it can be seen; this is the
         * one by your knee, for when you are looking down at the desk. */
        if (!caution && reg.surf === 'dash' && mw > 0.08) { kind = 'caution'; caution = true; }
        block.kind = kind;

        if (kind === 'switches') {
          /* Rows of toggles on a 5.5 x 7 cm pitch: a 1.6 x 2.6 cm lever with
           * a 1.2 x 0.8 cm LED under it. Sized in metres, then turned into
           * fractions of this block — the first version sized them as
           * fractions and grew 7 cm tiles on a tall block. */
          var n = Math.max(2, Math.min(10, Math.floor(mw / 0.055)));
          var rowsS = Math.max(1, Math.min(3, Math.floor(mh / 0.07)));
          var fw = 1 / n, fh = 1 / rowsS;
          var lw = Math.min(0.8 * fw, 0.016 / mw) / 2, lh = Math.min(0.45 * fh, 0.026 / mh);
          var ew = Math.min(0.8 * fw, 0.012 / mw) / 2, eh = Math.min(0.2 * fh, 0.008 / mh);
          for (var rs = 0; rs < rowsS; rs++) {
            for (var i = 0; i < n; i++) {
              var xc = (i + 0.5) * fw, yt = rs * fh + fh * 0.18;
              add({ pts: quad(xc - lw, yt, xc + lw, yt + lh), fill: style.lever || '#2b3542', line: 'rgba(0,0,0,0.6)' });
              if (style.guards && rng.chance(0.25)) {
                add({ pts: quad(xc - lw * 1.6, yt - fh * 0.06, xc + lw * 1.6, yt), fill: '#7a2a24' });
              }
              var ly = yt + lh + fh * 0.12;
              add({ pts: quad(xc - ew, ly, xc + ew, ly + eh), led: true, on: pal(),
                    mode: rng.chance(0.55) ? 'steady' : rng.chance(0.5) ? 'blink' : 'off',
                    period: rng.range(0.8, 3.2), phase: rng.range(0, 10), duty: rng.range(0.3, 0.7) });
            }
          }
        } else if (kind === 'buttons') {
          /* About 4 cm a button, which is the size a gloved finger wants. */
          var cols = Math.max(2, Math.min(7, Math.round(mw / 0.042)));
          var rows = Math.max(1, Math.min(5, Math.round(mh / 0.042)));
          var bcol = pal();
          for (var by = 0; by < rows; by++) {
            for (var bx = 0; bx < cols; bx++) {
              add({ pts: quad((bx + 0.15) / cols, (by + 0.15) / rows, (bx + 0.85) / cols, (by + 0.85) / rows),
                    led: true, on: rng.chance(0.2) ? pal() : bcol, dim: 0.22,
                    mode: rng.chance(0.3) ? 'steady' : rng.chance(0.15) ? 'blink' : 'dim',
                    period: rng.range(1.5, 4), phase: rng.range(0, 10), duty: 0.5 });
            }
          }
        } else if (kind === 'ledbar' || kind === 'readout') {
          var lines = kind === 'readout' ? Math.max(2, Math.min(5, Math.round(mh / 0.035))) : 1;
          for (var ln = 0; ln < lines; ln++) {
            var pips = Math.max(6, Math.min(20, Math.round(mw / 0.035)));
            /* Bind it to the ship if there is anything left to bind. */
            var bind = (kind === 'ledbar' && binds < BIND_SOURCES.length) ? BIND_SOURCES[binds++] : null;
            var lc = bind ? null : pal();
            var y0 = (ln + 0.25) / lines, y1 = (ln + 0.75) / lines;
            for (var k = 0; k < pips; k++) {
              add({ pts: quad((k + 0.12) / pips, y0, (k + 0.88) / pips, y1), led: true,
                    on: lc, bind: bind, index: k, count: pips,
                    mode: bind ? 'level' : (kind === 'readout' ? 'activity' : (rng.chance(0.5) ? 'chase' : 'activity')),
                    period: rng.range(0.12, 0.4), phase: rng.range(0, 10) });
            }
          }
        } else if (kind === 'vent') {
          var slits = Math.max(3, Math.min(12, Math.round((aspect > 1 ? mh : mw) / 0.018)));
          for (var v = 0; v < slits; v++) {
            var t0 = (v + 0.25) / slits, t1 = (v + 0.6) / slits;
            add({ pts: aspect > 1 ? quad(0.08, t0, 0.92, t1) : quad(t0, 0.08, t1, 0.92), fill: '#05080c' });
          }
        } else if (kind === 'caution') {
          add({ pts: quad(0.18, 0.2, 0.82, 0.8), led: true, on: '#ffb347', mode: 'caution', dim: 0.10 });
        }
      }
    }
    spec._greebles = { items: items, blocks: blocks, style: style };
    return spec._greebles;
  }

  /* What the bound bars read, 0..1. */
  function greebleReadings(ship) {
    function frac(a, b) { return (b > 0) ? Math.max(0, Math.min(1, a / b)) : 0; }
    var thr = ship.throttle;
    if (!(thr >= 0)) {
      var t = ship.thrust || {};
      thr = Math.min(1, Math.sqrt((t.x || 0) * (t.x || 0) + (t.y || 0) * (t.y || 0) + (t.z || 0) * (t.z || 0)));
    }
    var fuel = frac(ship.fuel, ship.fuelCap), mass = frac(ship.thrusterFuel, ship.thrusterCap);
    var hull = frac(ship.hull, ship.hullMax), shield = frac(ship.shield, ship.shieldCap);
    return {
      throttle: thr || 0, fuel: fuel, mass: mass, hull: hull, shield: shield,
      /* The same conditions that light the dash lamps amber or red. */
      caution: !!ship.fuelOut || mass < 0.15 || fuel < 0.2 ||
               (ship.hullMax ? ship.hull < ship.hullMax * 0.999 : false)
    };
  }

  function hexA(hex, a) {
    var n = parseInt(String(hex).slice(1), 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }
  function gHash(a, b) { var x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return x - Math.floor(x); }

  /* Colour of one LED this frame, or null for dark. */
  function ledColour(it, now, read) {
    var on = it.on, t = now + (it.phase || 0);
    switch (it.mode) {
      case 'steady': return on;
      case 'off': return null;
      case 'dim': return hexA(on, it.dim || 0.2);
      case 'blink': return ((t / it.period) % 1) < it.duty ? on : hexA(on, it.dim || 0.08);
      case 'chase': {
        var head = Math.floor(t / it.period) % it.count;
        var d = (it.index - head + it.count) % it.count;
        return d < 2 ? on : hexA(on, 0.07);
      }
      case 'activity':
        return gHash(it.index + it.phase * 13, Math.floor(t / it.period)) < 0.45 ? on : hexA(on, 0.06);
      case 'level': {
        var f = read[it.bind] || 0;
        var lit = it.index < Math.round(f * it.count);
        /* Throttle reads cyan; the rest go green, amber, red as they fall. */
        var c = it.bind === 'throttle' ? '#8fd8ff'
              : f > 0.5 ? '#7dffb0' : f > 0.2 ? '#ffb347' : '#ff5a4a';
        return lit ? c : hexA(c, 0.07);
      }
      case 'caution':
        return (read.caution && (now * 1.5) % 1 < 0.55) ? on : hexA(on, it.dim);
    }
    return on;
  }

  /* The off-state colour of a lamp face. A dark LED is still a bit of
   * coloured plastic, not a hole. */
  var LED_OFF = '#141b24';

  /* THE COST, measured before this was written the way it is. Drawn the
   * obvious way — every quad through localPoly and clipProject and its own
   * fill — a Mule's ~1,100 pieces cost 1.8–4.6 ms a frame on the i5, and
   * took a whole frame to 10 ms looking behind the seat. Three things fix it:
   *
   *   - CULL BY BLOCK. One projected point and a radius decides whether a
   *     whole fitting is on screen. Most of the room never is.
   *   - PROJECT BY HAND. The ship-to-camera transform is one 3x3 and an
   *     offset per frame; a corner is nine multiply-adds and no objects.
   *     Anything straddling the eye plane falls back to clipProject.
   *   - ONE FILL PER COLOUR. Quads are gathered by colour into one path
   *     each, two layers deep (back plates, then what is on them), so a
   *     frame costs a few dozen fills however many LEDs are lit. */
  function drawGreebles(ctx, cam, ship, spec, w, h) {
    var lay = greebleLayout(ship, spec);
    var now = (global.performance && global.performance.now) ? global.performance.now() / 1000 : 0;
    var read = greebleReadings(ship);

    /* The frame's transform, metres in ship axes -> camera space in km. */
    var ex = ship.pos.x - cam.eye.x, ey = ship.pos.y - cam.eye.y, ez = ship.pos.z - cam.eye.z;
    var oR = ex * cam.r.x + ey * cam.r.y + ez * cam.r.z;
    var oU = ex * cam.u.x + ey * cam.u.y + ez * cam.u.z;
    var oD = ex * cam.f.x + ey * cam.f.y + ez * cam.f.z;
    function ax(v) {
      return [(v.x * cam.r.x + v.y * cam.r.y + v.z * cam.r.z) * M,
              (v.x * cam.u.x + v.y * cam.u.y + v.z * cam.u.z) * M,
              (v.x * cam.f.x + v.y * cam.f.y + v.z * cam.f.z) * M];
    }
    var X = ax(ship.right), Y = ax(ship.up), Z = ax(ship.fwd);
    var flen = cam.flen, cx = cam.cx, cy = cam.cy;
    var W = w || cx * 2, H = h || cy * 2;

    function project(pts) {
      var out = [];
      for (var k = 0; k < pts.length; k++) {
        var p = pts[k];
        var d = oD + X[2] * p[0] + Y[2] * p[1] + Z[2] * p[2];
        if (d <= NEAR_CLIP) return clipProject(cam, localPoly(ship, pts));
        var r = oR + X[0] * p[0] + Y[0] * p[1] + Z[0] * p[2];
        var u = oU + X[1] * p[0] + Y[1] * p[1] + Z[1] * p[2];
        out.push({ x: cx + r * flen / d, y: cy - u * flen / d });
      }
      return out;
    }

    var fills = [{}, {}], strokes = {}, visible = [];
    for (var i = 0; i < lay.blocks.length; i++) {
      var bk = lay.blocks[i], c0 = bk.centre;
      var bd = oD + X[2] * c0[0] + Y[2] * c0[1] + Z[2] * c0[2];
      var br = bk.rad * M;
      if (bd < -br) continue;                                  // behind the eye
      if (bd > br) {
        var sx = cx + (oR + X[0] * c0[0] + Y[0] * c0[1] + Z[0] * c0[2]) * flen / bd;
        var sy = cy - (oU + X[1] * c0[0] + Y[1] * c0[1] + Z[1] * c0[2]) * flen / bd;
        var rp = br * flen / bd;
        if (sx + rp < 0 || sx - rp > W || sy + rp < 0 || sy - rp > H) continue;
        bk._sx = sx; bk._sy = sy; bk._rp = rp;
      } else {
        bk._sx = null;
      }
      visible.push(bk);
      for (var j = 0; j < bk.items.length; j++) {
        var it = bk.items[j];
        var poly = project(it.pts);
        if (!poly) { it._lit = null; continue; }
        var fill = it.fill;
        if (it.led) { it._lit = ledColour(it, now, read); fill = it._lit || LED_OFF; }
        var layer = fills[it.layer === 0 ? 0 : 1];
        (layer[fill] = layer[fill] || []).push(poly);
        if (it.line) (strokes[it.line] = strokes[it.line] || []).push(poly);
      }
    }

    ctx.save();
    var col, list, q;
    /* Back plates, their seams, then everything mounted on them. */
    for (col in fills[0]) {
      list = fills[0][col]; ctx.beginPath();
      for (q = 0; q < list.length; q++) tracePath(ctx, list[q]);
      ctx.fillStyle = col; ctx.fill();
    }
    ctx.lineWidth = 1;
    for (col in strokes) {
      list = strokes[col]; ctx.beginPath();
      for (q = 0; q < list.length; q++) tracePath(ctx, list[q]);
      ctx.strokeStyle = col; ctx.stroke();
    }
    for (col in fills[1]) {
      list = fills[1][col]; ctx.beginPath();
      for (q = 0; q < list.length; q++) tracePath(ctx, list[q]);
      ctx.fillStyle = col; ctx.fill();
    }

    /* The spill: one additive gradient per VISIBLE block, scaled by how much
     * of it is lit this frame. */
    ctx.globalCompositeOperation = 'lighter';
    for (i = 0; i < visible.length; i++) {
      var vb = visible[i];
      if (!vb.lit.length || vb._sx === null) continue;
      var litN = 0, colour = null;
      for (var l = 0; l < vb.lit.length; l++) {
        var cl = vb.lit[l]._lit;
        if (cl && cl.charAt(0) === '#') { litN++; colour = colour || cl; }
      }
      if (!litN) continue;
      var rad = Math.max(14, Math.min(160, vb._rp * 1.5));
      var a = Math.min(0.16, 0.04 + 0.12 * litN / vb.lit.length);
      var gr = ctx.createRadialGradient(vb._sx, vb._sy, 0, vb._sx, vb._sy, rad);
      gr.addColorStop(0, hexA(colour, a));
      gr.addColorStop(1, hexA(colour, 0));
      ctx.fillStyle = gr;
      ctx.fillRect(vb._sx - rad, vb._sy - rad, rad * 2, rad * 2);
    }
    ctx.restore();
  }

  /* An accent strip along the fold of the glare shield, in the hull's own
   * colour, split around the floor-window slot. The one bit of the new
   * lighting you can see looking straight ahead. */
  function drawAccentStrips(ctx, cam, ship, spec) {
    var style = greebleStyle(ship);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    var sl = (spec && spec.slot) || [SLOT_S0, SLOT_S1];
    var spans = [[0.02, sl[0] - 0.01], [sl[1] + 0.01, 0.98]];
    for (var s = 0; s < spans.length; s++) {
      var a = projLocal(cam, ship, dashPoint(spans[s][0], 0.045, spec));
      var b = projLocal(cam, ship, dashPoint(spans[s][1], 0.045, spec));
      if (!a || !b) continue;
      ctx.strokeStyle = hexA(style.accent, 0.18);
      ctx.lineWidth = 6;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      ctx.strokeStyle = hexA(style.accent, 0.75);
      ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
    /* And down the edges of the floor window, so the slot is a lit opening
     * rather than a gap. */
    for (var e = 0; e < 2; e++) {
      var s0 = e ? sl[1] : sl[0];
      var p0 = projLocal(cam, ship, dashPoint(s0, 0.08, spec));
      var p1 = projLocal(cam, ship, dashPoint(s0, 0.95, spec));
      if (!p0 || !p1) continue;
      ctx.strokeStyle = hexA(style.accent, 0.5);
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.stroke();
    }
    ctx.restore();
  }

  /* THE MINING LASER CANNON'S CAPACITOR BANK (2026-10-18, Astra: "the
   * mount and capacitors for it glow red, then fade"). Three cans bolted to
   * the right of the dash, out by the knee, only when a cannon is fitted
   * (ship.capGlow, set by main.js from Combat.cannonGlow). Cold they are
   * dark metal; the instant the cannon fires they go orange-red and cool
   * through a dull red to nothing over its three seconds, with the glow
   * spilling onto the panel round them. */
  var CAP_BANK = { s0: 0.855, s1: 0.965, t0: 0.50, t1: 0.66 };
  function drawCapacitorBank(ctx, cam, ship) {
    var cg = ship && ship.capGlow;
    if (!cg || !cg.fitted) return;
    var k = Math.max(0, Math.min(1, cg.k || 0));
    var cans = 3, ds = (CAP_BANK.s1 - CAP_BANK.s0) / cans;
    ctx.save();
    var centres = [];
    for (var i = 0; i < cans; i++) {
      var s0 = CAP_BANK.s0 + ds * (i + 0.14), s1 = CAP_BANK.s0 + ds * (i + 0.86);
      var pts = [dashPoint(s0, CAP_BANK.t0), dashPoint(s1, CAP_BANK.t0),
                 dashPoint(s1, CAP_BANK.t1), dashPoint(s0, CAP_BANK.t1)];
      var poly = clipProject(cam, localPoly(ship, pts));
      if (!poly || poly.length < 3) continue;
      /* The can, then its band of heat, then a strap across it. */
      ctx.fillStyle = '#262c33';
      ctx.beginPath(); tracePath(ctx, poly); ctx.fill();
      if (k > 0.01) {
        ctx.fillStyle = 'rgba(255,' + Math.round(40 + 120 * k) + ',' + Math.round(20 + 30 * k) + ',' +
                        (0.25 + 0.7 * k).toFixed(3) + ')';
        ctx.beginPath(); tracePath(ctx, poly); ctx.fill();
      }
      ctx.strokeStyle = 'rgba(140,160,190,0.35)';
      ctx.lineWidth = 1;
      ctx.beginPath(); tracePath(ctx, poly); ctx.stroke();
      var cx = 0, cy = 0;
      for (var p = 0; p < poly.length; p++) { cx += poly[p].x; cy += poly[p].y; }
      centres.push({ x: cx / poly.length, y: cy / poly.length,
                     r: Math.abs(poly[1].x - poly[0].x) + Math.abs(poly[2].y - poly[1].y) });
    }
    if (k > 0.01) {
      ctx.globalCompositeOperation = 'lighter';
      for (var c = 0; c < centres.length; c++) {
        var ce = centres[c], rad = Math.max(10, ce.r * 1.3);
        var gr = ctx.createRadialGradient(ce.x, ce.y, 0, ce.x, ce.y, rad);
        gr.addColorStop(0, 'rgba(255,70,40,' + (0.35 * k).toFixed(3) + ')');
        gr.addColorStop(1, 'rgba(255,40,20,0)');
        ctx.fillStyle = gr;
        ctx.fillRect(ce.x - rad, ce.y - rad, rad * 2, rad * 2);
      }
    }
    ctx.restore();
  }

  /* ---- a tug's grab arms, seen from the seat (2026-10-20) ----------------
   * Astra: "creating a custom cockpit that shows the grab arms on the tugs".
   *
   * The tug models carry two grab arms (grabberArm0L/R) mounted outboard of
   * the canopy and reaching well past the nose — in tug-s they run from
   * just behind the seat to 1.5 hull-units ahead of it, either side of the
   * glass, with the jaws at the tips. So from the seat they are two booms
   * running away from you along the lower corners of the windscreen, the
   * caution-striped forearms angling in, and the jaws ahead where whatever
   * you are towing sits.
   *
   * Drawn in the cockpit's own metres (eye at the origin, glass 1.2 m
   * ahead), measured off the model at about three metres to its unit, and
   * scaled with the room so a heavy tug's bigger bridge keeps them in the
   * same place relative to the glass. Drawn first thing in
   * drawCockpitShell: the parts behind the frame are hidden by it, and
   * what shows is what the windows show. The jaws stand open; there is no
   * player tow yet for them to close on (`ship.tow` is the OTHER way round
   * — you being towed). */
  var ARM_STEEL = '#4a5058', ARM_DARK = '#2c3036', ARM_CAUTION = '#d9a521', ARM_STRIPE = '#1d1f24';

  function drawGrabArms(ctx, cam, ship) {
    var HL = global.Combat && global.Combat.HULLS;
    var hull = HL && HL[ship && ship.hullId];
    if (!hull || !hull.grabArms) return;
    var spec = cockpitSpec(ship);
    var k = spec.arch.room * spec.size;
    /* The jaws close as the pilot closes them (arms.js, 2026-10-31). */
    var jaw = Math.max(0, Math.min(1, (ship.arms && ship.arms.jaw) || 0));
    var faces = [];

    /* A beam from a to b, with half-thickness hx (sideways) and hy (up),
     * as its four long faces and two ends. */
    function beam(a, b, hx, hy, col) {
      var c = [];
      [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(function (s) {
        c.push([a[0] + s[0] * hx, a[1] + s[1] * hy, a[2]]);
      });
      [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(function (s) {
        c.push([b[0] + s[0] * hx, b[1] + s[1] * hy, b[2]]);
      });
      var quads = [[0, 1, 5, 4, 0.70], [3, 2, 6, 7, 1.00], [0, 3, 7, 4, 0.82],
                   [1, 2, 6, 5, 0.82], [0, 1, 2, 3, 0.60], [4, 5, 6, 7, 0.60]];
      quads.forEach(function (q) {
        var pts = [c[q[0]], c[q[1]], c[q[2]], c[q[3]]].map(function (p) {
          return [p[0] * k, p[1] * k, p[2] * k];
        });
        var mid = [0, 0, 0];
        pts.forEach(function (p) { mid[0] += p[0] / 4; mid[1] += p[1] / 4; mid[2] += p[2] / 4; });
        faces.push({ pts: pts, d: mid[0] * mid[0] + mid[1] * mid[1] + mid[2] * mid[2],
                     col: shade(col, q[4]) });
      });
    }

    [-1, 1].forEach(function (side) {
      /* Below the eye and outboard of the glass, so you look DOWN along
       * them and see their length rather than their ends. */
      var x0 = 2.10 * side, x1 = 1.55 * side, xj = 1.15 * side;
      var y0 = -0.62, y1 = -0.72;
      beam([x0, y0, 0.6], [x0, y0, 1.6], 0.34, 0.30, ARM_DARK);                    // shoulder
      beam([x0, y0, 1.6], [x0, y0, 4.0], 0.18, 0.16, ARM_STEEL);                   // upper arm
      beam([x0, y0, 3.9], [x0, y1, 4.3], 0.24, 0.22, ARM_DARK);                    // knuckle
      beam([x0, y1, 4.3], [x1, y1, 7.0], 0.14, 0.13, ARM_CAUTION);                 // forearm
      for (var st = 0; st < 4; st++) {                                              // its stripes
        var z = 4.7 + st * 0.55;
        var xs = x0 + (x1 - x0) * (z - 4.3) / 2.7;
        beam([xs, y1, z], [xs + (x1 - x0) * 0.08, y1, z + 0.22], 0.145, 0.135, ARM_STRIPE);
      }
      /* The jaws: two prongs from the wrist, reaching in toward the line
       * of flight, open while she waits. */
      var gap = 0.28 - 0.23 * jaw;
      beam([x1, y1, 7.0], [xj, y1 + gap, 8.3], 0.06, 0.06, ARM_STEEL);
      beam([x1, y1, 7.0], [xj, y1 - gap, 8.3], 0.06, 0.06, ARM_STEEL);
    });

    faces.sort(function (a, b) { return b.d - a.d; });     // far to near
    for (var i = 0; i < faces.length; i++) {
      var poly = clipProject(cam, localPoly(ship, faces[i].pts));
      if (poly) fillPoly(ctx, poly, faces[i].col, 'rgba(0,0,0,0.35)');
    }
  }

  /* WHERE THE JAWS MEET, in the world (arms.js, 2026-10-31): the point
   * between the two jaw tips, in the same cockpit metres drawGrabArms
   * draws them in. `ship` is the cockpit's frame (eye at its pos), as
   * drawCockpitShell is given. Null on a hull without arms. */
  var ARM_GRIP = [0, -0.72, 8.3];
  function armGrip(ship) {
    var HL = global.Combat && global.Combat.HULLS;
    var hull = HL && HL[ship && ship.hullId];
    if (!hull || !hull.grabArms || !ship.pos || !ship.fwd) return null;
    var spec = cockpitSpec(ship), k = spec.arch.room * spec.size;
    return localToWorld(ship, ARM_GRIP[0] * k * M, ARM_GRIP[1] * k * M, ARM_GRIP[2] * k * M);
  }

  /* THE ARM CAMERA (Astra, 2026-10-31: "the [tug's] cockpit should have a
   * vidscreen to operate those grab arms"). A camera on the arms' cross-
   * member, a few metres behind and above the jaws, looking past them:
   * what you are about to take hold of, at the scale you take hold of it.
   * Painted in 2D into its own screen, with its own camera, because the
   * world layer draws one view. `info` is Arms.view: the target, how far,
   * how fast, whether it is in reach, and what the jaws hold. */
  function drawArmCam(ctx, cam, ship, rect, info) {
    var grip = armGrip(ship);
    if (!grip || !rect) return;
    var x = rect.x, y = rect.y, w = rect.w, h = rect.h;
    ctx.save();
    ctx.fillStyle = '#071014';
    ctx.fillRect(x, y, w, h);
    ctx.beginPath(); ctx.rect(x + 2, y + 2, w - 4, h - 4); ctx.clip();
    var c2 = Object.create(Camera.prototype);
    c2.cockpitFov = 50 * DEG;
    var eye = V.addScaled(V.addScaled(grip, ship.fwd, -0.006), ship.up, 0.0025);
    var look = V.addScaled(grip, ship.fwd, 0.010);
    c2.buildFree(eye, V.sub(look, eye), ship.up, w, h);
    c2.cx += x; c2.cy += y;
    c2.near = 0.0005;
    var sun = ship.up;
    /* What is out there: her, a canister, whatever is near the jaws. */
    (info && info.near || []).forEach(function (o) {
      if (o.kind === 'canister' || o.kind === 'crate') {
        var p = c2.project(o.pos);
        if (!p) return;
        /* A station crate (stations.js) is a bigger box than a canister. */
        var s = Math.max(3, (o.kind === 'crate' ? 0.012 : 0.004) * p.scale);
        ctx.fillStyle = o.held ? '#ffd36b' : '#c9a86a';
        ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
        ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.strokeRect(p.x - s / 2, p.y - s / 2, s, s);
      } else if (o.kind === 'ship' && o.state && o.state.pos) {
        try {
          var mesh = hullPreviewMesh(o.state.hullId || 'talon', o.state);
          paintMesh(ctx, c2, o.state, mesh, hullLength(o.state), sun, null);
        } catch (e) { /* nothing drawn is better than a broken screen */ }
      }
    });
    /* The jaws, from just behind them: two prongs reaching in, closing. */
    var jaw = (info && info.jaw) || 0;
    [-1, 1].forEach(function (side) {
      var gap = 0.0016 * (1 - jaw * 0.8);
      var a = V.addScaled(V.addScaled(grip, ship.right, side * 0.0030), ship.fwd, -0.0015);
      var b = V.addScaled(V.addScaled(grip, ship.right, side * gap), ship.fwd, 0.0006);
      var pa = c2.project(a), pb = c2.project(b);
      if (!pa || !pb) return;
      ctx.strokeStyle = '#d9a521'; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y); ctx.stroke();
    });
    /* The reticle: where the jaws close. */
    var pg = c2.project(grip);
    if (pg) {
      ctx.strokeStyle = info && info.inReach ? '#7dffb0' : 'rgba(150,220,255,0.55)';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(pg.x, pg.y, 9, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(pg.x - 16, pg.y); ctx.lineTo(pg.x - 11, pg.y);
      ctx.moveTo(pg.x + 11, pg.y); ctx.lineTo(pg.x + 16, pg.y); ctx.stroke();
    }
    ctx.restore();
    /* The frame and the readout, outside the clip. */
    ctx.save();
    ctx.strokeStyle = '#3b5560'; ctx.lineWidth = 2; ctx.strokeRect(x, y, w, h);
    /* Bands behind the lettering, so a canister filling the lens does not
     * swallow the readout. */
    ctx.fillStyle = 'rgba(7,16,20,0.82)';
    ctx.fillRect(x + 2, y + 2, w - 4, 20);
    ctx.fillRect(x + 2, y + h - 36, w - 4, 34);
    ctx.font = 'bold 11px ui-monospace, monospace';
    ctx.fillStyle = '#9fd8e8';
    ctx.fillText('ARM CAM', x + 8, y + 15);
    ctx.textAlign = 'right';
    ctx.fillText(jaw > 0.95 ? 'JAWS SHUT' : jaw < 0.05 ? 'JAWS OPEN' : 'JAWS MOVING', x + w - 8, y + 15);
    ctx.textAlign = 'left';
    var line1 = !info ? '' : info.held ? 'HOLDING ' + info.held
              : info.target ? info.target + '  ' + info.dist + ' m  ' + info.rel + ' m/s' : 'nothing in reach';
    var line2 = !info ? '' : info.note || (info.held ? 'G  let go' : info.inReach ? 'G  close the jaws' : '');
    ctx.fillStyle = info && (info.held || info.inReach) ? '#7dffb0' : '#9fd8e8';
    ctx.fillText(line1, x + 8, y + h - 22);
    ctx.fillStyle = '#7e93b3';
    ctx.fillText(line2, x + 8, y + h - 8);
    ctx.restore();
  }

  /* THE ARM-TIP CAMERA (Astra, 2026-10-31: "the tugs need a fwd camera on
   * the end of one of the arms, and a screen in the cockpit for when
   * there's a crate in the arms"). A crate in the jaws fills the arm
   * camera, and most of the windscreen with it. This one rides on the end
   * of the starboard arm, just outboard of the crate's flank, looking
   * straight ahead past it: her - the Crawler whose frame the crate is
   * going to - with brackets round her.
   * `info` is Arms.view; `info.frame` says where she is and how far. When
   * she is off the screen an arrow on its edge points the way. */
  var TIP_HALF_KM = { S: 0.004, M: 0.006, L: 0.009, XL: 0.013 };
  var TIP_CRATE = null;
  function drawTipCam(ctx, cam, ship, rect, info) {
    var grip = armGrip(ship);
    if (!grip || !rect || !info) return;
    var x = rect.x, y = rect.y, w = rect.w, h = rect.h;
    var half = TIP_HALF_KM[info.crateSize] || 0.006;
    ctx.save();
    ctx.fillStyle = '#071014';
    ctx.fillRect(x, y, w, h);
    ctx.beginPath(); ctx.rect(x + 2, y + 2, w - 4, h - 4); ctx.clip();
    var c2 = Object.create(Camera.prototype);
    c2.cockpitFov = 55 * DEG;
    /* Just outboard of the crate's starboard face, a little behind its
     * front edge, so the crate's flank runs down the left of the picture. */
    var eye = V.addScaled(V.addScaled(grip, ship.right, half + 0.0012), ship.fwd, half * 1.2 - 0.0015);
    c2.buildFree(eye, ship.fwd, ship.up, w, h);
    c2.cx += x; c2.cy += y;
    c2.near = 0.0003;
    var sun = ship.up;
    var fr = info.frame;
    if (fr && fr.crawler) {
      try {
        var cm = hullPreviewMesh('crawler', fr.crawler);
        paintMesh(ctx, c2, fr.crawler, cm, hullLength(fr.crawler), sun, null);
      } catch (e) { /* nothing drawn is better than a broken screen */ }
    }
    /* The crate in the jaws, down the left of the picture. */
    if (!TIP_CRATE) TIP_CRATE = box(1, 0.8, 1.2);
    try {
      paintMesh(ctx, c2, { pos: grip, fwd: ship.fwd, up: ship.up, right: ship.right }, TIP_CRATE, half, sun, '#c99b3e');
    } catch (e) { /* fine */ }
    /* Her frame: brackets on her, or an arrow on the edge pointing the way. */
    if (fr && fr.crawler) {
      var col = fr.inside ? '#7dffb0' : '#ffd36b';
      var toHer = V.sub(fr.crawler.pos, eye);
      var p = V.dot(toHer, ship.fwd) > 0 ? c2.project(fr.crawler.pos) : null;
      var onScreen = p && p.x > x + 14 && p.x < x + w - 14 && p.y > y + 26 && p.y < y + h - 40;
      ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 2;
      if (onScreen) {
        /* Round her, however near: her length on the screen, or 14 px. */
        var r = Math.max(14, Math.min(w * 0.4, hullLength(fr.crawler) * p.scale * 0.55));
        [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(function (c) {
          ctx.beginPath();
          ctx.moveTo(p.x + c[0] * r, p.y + c[1] * (r - 6));
          ctx.lineTo(p.x + c[0] * r, p.y + c[1] * r);
          ctx.lineTo(p.x + c[0] * (r - 6), p.y + c[1] * r);
          ctx.stroke();
        });
      } else {
        var to = V.sub(fr.crawler.pos, eye);
        var ang = Math.atan2(-V.dot(to, ship.up), V.dot(to, ship.right));
        /* Inside the picture, clear of both lettering bands. */
        var top = y + 34, bot = y + h - 48;
        var cx = x + w / 2, cy = (top + bot) / 2;
        var ex = cx + Math.cos(ang) * (w / 2 - 22), ey = cy + Math.sin(ang) * ((bot - top) / 2);
        ctx.save();
        ctx.translate(ex, ey); ctx.rotate(ang);
        ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(-6, -8); ctx.lineTo(-6, 8); ctx.closePath(); ctx.fill();
        ctx.restore();
      }
    }
    ctx.restore();
    ctx.save();
    ctx.strokeStyle = '#3b5560'; ctx.lineWidth = 2; ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = 'rgba(7,16,20,0.82)';
    ctx.fillRect(x + 2, y + 2, w - 4, 20);
    ctx.fillRect(x + 2, y + h - 36, w - 4, 34);
    ctx.font = 'bold 11px ui-monospace, monospace';
    ctx.fillStyle = '#9fd8e8';
    ctx.fillText('ARM TIP CAM', x + 8, y + 15);
    ctx.textAlign = 'right';
    ctx.fillText('HOLDING', x + w - 8, y + 15);
    ctx.textAlign = 'left';
    var l1 = !fr ? 'no frame to take it to' : fr.inside ? 'AT HER FRAME - it goes in'
           : 'her frame  ' + fr.dist + ' m  closing ' + fr.closing + ' m/s';
    ctx.fillStyle = fr && fr.inside ? '#7dffb0' : '#ffd36b';
    ctx.fillText(l1, x + 8, y + h - 22);
    ctx.fillStyle = '#7e93b3';
    ctx.fillText(fr ? fr.name + '  -  G  let go' : 'G  let go', x + 8, y + h - 8);
    ctx.restore();
  }

  /* THE CANOPY BARS IN HER LIVERY (2026-11-01, Astra's choice from
   * unfinished.md). They were the cockpit's trim, one of three near-blacks.
   * Now they are the trim you chose at the yard (paint.t), a touch darker
   * so a frame reads as painted metal and not as a lamp; with no paint, the
   * hull's own accent (greebleStyle, the colour of the dash strip), well
   * darkened. Used by both the GPU room (shipdeck.js) and the 2D painter. */
  function hexShade(hex, f) {
    var n = parseInt(hex.slice(1), 16);
    var r = Math.round(((n >> 16) & 255) * f), g = Math.round(((n >> 8) & 255) * f), b = Math.round((n & 255) * f);
    return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
  }
  function barColour(ship) {
    var t = ship && ship.paint && ship.paint.t;
    if (typeof t === 'string' && /^#[0-9a-f]{6}$/i.test(t)) return hexShade(t, 0.8);
    return hexShade(greebleStyle(ship).accent, 0.5);
  }

  function shade(hex, f) {
    var n = parseInt(hex.slice(1), 16);
    var r = Math.round(((n >> 16) & 255) * f), g = Math.round(((n >> 8) & 255) * f), b = Math.round((n & 255) * f);
    return 'rgb(' + r + ',' + g + ',' + b + ')';
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

  /* HOW OFTEN A SCREEN IS ACTUALLY REPAINTED.
   *
   * Every cockpit frame used to clear three to five offscreen canvases,
   * redraw a full instrument page into each, and hand every one of them to
   * the GPU as a fresh texture — sixty times a second, for readouts that
   * change a dozen times a second at their liveliest and are, by design,
   * too foreshortened to read anyway (the flat band along the bottom is
   * where the numbers live). That was the whole of why first person was
   * the slow view: nothing else in the game repaints a canvas and uploads
   * it per frame, and it happens in no other view.
   *
   * Twelve hertz, staggered per screen so they do not all fall due on the
   * same frame. The panels are the thing being throttled, not the frame —
   * the world, the glass, the ladder and the band all still run at full
   * rate, so the ship does not feel any slower to fly. A screen is at
   * worst 83 ms stale, which is under the reaction time of the pilot
   * reading it.
   *
   * MFD_HZ = 0 disables the throttle entirely, which is the one-line way
   * to prove that the throttle is what a measurement is measuring. */
  var MFD_HZ = 12;
  var MFD_CLOCKS = {};

  function mfdNow(nowMs) {
    if (typeof nowMs === 'number') return nowMs;
    if (typeof performance !== 'undefined' && performance.now) return performance.now();
    return Date.now();
  }

  /* Should this panel's readout be redrawn this frame? False means the
   * caller should hand the previous picture straight back to the GPU with
   * mfdReuse rather than skipping the panel, which would blank it. */
  function mfdDue(panel, nowMs) {
    if (!panel || !MFD_HZ) return true;
    /* The 2D path draws into the frame's own context, so there is no
     * previous picture to reuse: it has to be redrawn or it is not there. */
    if (!mfdGpu(panel)) return true;
    var s = MFD_SURFACES[panel.id];
    if (!s || s.canvas.width !== panel.w || s.canvas.height !== panel.h) return true;
    var now = mfdNow(nowMs), period = 1000 / MFD_HZ;
    var last = MFD_CLOCKS[panel.id];
    if (last === undefined) {
      /* Spread the first due time across the period by the panel's own
       * name, so five screens installed on the same frame do not then
       * refresh together forever after. */
      var spread = RNG ? (RNG.hashString('mfd|' + panel.id) % 1000) / 1000 : 0;
      MFD_CLOCKS[panel.id] = now - spread * period;
      return true;
    }
    if (now - last >= period) { MFD_CLOCKS[panel.id] = now; return true; }
    return false;
  }

  /* Re-queue the picture this screen already has. */
  function mfdReuse(panel) {
    if (!panel) return false;
    var s = MFD_SURFACES[panel.id];
    if (!s || !mfdGpu(panel) || !panel.cam) return false;
    global.GLWorld.queuePanel(panel.cam, panel.world, s.canvas, 1, false);
    return true;
  }

  /* ---- the inside of your own ship, on the GPU (2026-10-24) --------------
   * One per cockpit key (hull + bornId), built from cockpitGeometry by
   * shipdeck.js and cached on the spec beside everything else about that
   * cockpit: the walkable plan and the meshes the world layer draws. */
  var COCKPIT_ROOM_ON = true;
  var ROOM_QUEUED = { ship: null, cam: null };

  function cockpitGpu() {
    return !!(COCKPIT_ROOM_ON && global.ShipDeck && global.GLWorld &&
              global.GLWorld.available && global.GLWorld.queueCockpit);
  }

  function shipInterior(ship) {
    var SD = global.ShipDeck;
    if (!SD || !ship) return null;
    var spec = cockpitSpec(ship);
    var HL = global.Combat && global.Combat.HULLS;
    var hull = HL && HL[ship.hullId];
    /* The library model this hull wears, so a Crawler in Syndicate colours
     * is known by its livery (Combat.liveryRefusal) and not only by a hull
     * key. A repaint changes it, so the room is rebuilt when it does. */
    var libId = hull && hull.mesh === 'crawler' ? crawlerLibId(ship) : ((hull && HULL_ASSIGN[hull.mesh]) || '');
    /* A fitted turret puts a turret position aboard (shipdeck.js, 2026-10-25),
     * so fitting or pulling one rebuilds the room, as a repaint does. */
    var tur = !!ship.turret;
    /* What is in her hold (2026-10-28): the crates are stacked from it, so
     * the room is rebuilt when it changes — in tenths of a hold and by which
     * goods, not every tonne, so scooping a canister does not rebuild a
     * ship's worth of meshes. */
    var load = holdLoad(ship, hull);
    /* Her canopy bars are her livery's colour, so a repaint rebuilds the
     * room too (barColour). */
    var bars = barColour(ship);
    if (spec._deck && spec._deck.libId === libId && spec._deck.turret === tur &&
        spec._deck.loadKey === load.key && spec._deck.bars === bars) return spec._deck;
    var g = cockpitGeometry(spec);
    /* Who works her, with you at the helm (crew.js), off the hull's own
     * default outfit so a refit does not move the furniture. */
    var crew = global.Crew && global.Crew.crewNeeded ? global.Crew.crewNeeded(ship.hullId, true) : null;
    /* How far her airlock deck stands above the ground on her gear: the
     * ramp's drop (hullfit.js). */
    var fit = hullFit(ship), capScale = 1;
    var popts = { hullId: ship.hullId, libId: libId, size: hull && hull.size, key: spec.key, crew: crew, turret: tur,
                  rampDrop: fit && (fit.dropRoom || fit.drop), rampReach: fit && fit.drop,
                  load: load.load,
                  /* Her cockpit up in her nose block (shipdeck.js RAISED). */
                  raised: raiseOf(ship, hullFit(ship)),
                  /* Every room inside her own hull (shipdeck.js planFitted). */
                  fit: hullFitter(ship) };
    var plan = (SD.planFitted || SD.plan)(g, popts);
    /* A LONGER RAMP NEVER COSTS HER A ROOM (2026-11-03). The ramp lies in
     * her airlock's floor, so the 22° ramp makes the airlock that much
     * longer, and on the Enforcer that pushed her cargo bay out of her hull
     * altogether (boarding3.test.js: "fitting them took nothing away from
     * any hull today"). So the plan at the old 30° cut is the yardstick: if
     * the longer ramp's plan is missing any room that one has, the ramp is
     * shortened a quarter metre at a time until it is not - as long as her
     * hull allows, never shorter than it was. */
    var cutWant = null;
    if (plan.ramp && plan.ramp.mode === 'ramp' && SD.RAMP_CUT_SLOPE && plan.ramp.drop > 0) {
      var cutLen = plan.ramp.drop / Math.sin(SD.RAMP_CUT_SLOPE);
      var kindsOf = function (pl) { var k = {}; pl.rooms.forEach(function (r) { k[r.kind] = (k[r.kind] || 0) + 1; }); return k; };
      var lacks = function (pl, want) { for (var kk in want) if ((kindsOf(pl)[kk] || 0) < want[kk]) return true; return false; };
      if (plan.ramp.len > cutLen + 0.05) {
        var cutOpts = Object.create(popts); cutOpts.rampMax = cutLen;
        var want = kindsOf((SD.planFitted || SD.plan)(g, cutOpts));
        for (var rl = plan.ramp.len - 0.25; lacks(plan, want) && rl > cutLen - 1e-9; rl -= 0.25) {
          popts.rampMax = Math.max(cutLen, rl);
          plan = (SD.planFitted || SD.plan)(g, popts);
        }
        cutWant = want;
      }
    }
    /* HER RAMP STOPS SHORT OF HER LEGS (2026-11-03). Lengthened to 22°
     * (shipdeck.js RAMP_SLOPE), the Kestrel's and the Bollard's ramps ran
     * through a main gear leg standing aft of the old foot. So where one of
     * her legs (as drawn, telescoped to the lifted ground) stands in the
     * ramp's path - across its width and a body either side, below the
     * deck - the ramp is cut back to end a stride short of it and planned
     * again: steeper on those two, and a stair if that is what it takes.
     * Twice at most, since the room can move the hinge. */
    for (var rpass = 0; rpass < 2 && plan.ramp && plan.ramp.mode !== 'lift' && fit && fit.drop > 0; rpass++) {
      var lim = rampLegLimit(ship, plan, fit);
      if (!(lim > 0) || lim >= plan.ramp.len - 0.05) break;
      popts.rampMax = (popts.rampMax ? Math.min(popts.rampMax, lim) : lim);
      plan = (SD.planFitted || SD.plan)(g, popts);
    }
    /* What the old cut left her, kept on the plan so airlock.test.js can
     * hold the longer ramp to it. */
    if (cutWant) plan.cutRooms = cutWant;
    /* A ship bigger than her hull's fitted length (hullFit, `lengthKm`):
     * the same rooms, the cockpit at the same point of her model, and her
     * hold (or, with none, her passage) run on aft by however much further
     * her stern now is — the aft end of the plan scaled with her, less a
     * metre for the bulkhead. Planned twice; the plan takes no draw for
     * `stretch`, so the rest of her is the same ship. */
    if (fit && fit.scale > 1.01) {
      var aftR = SD.roomByKind(plan, 'cargo') || SD.roomByKind(plan, 'passage');
      /* From the deck's eye, not a raised cockpit's (shipdeck.js RAISED):
       * the deck is planned `fwd` further aft of that. */
      var aftZ = aftR ? aftR.z0 + (popts.raised ? popts.raised.fwd : 0) : 0;
      var stretch = aftZ < 0 ? Math.max(0, -aftZ * (fit.scale - 1) - 1.0) : 0;
      var base0 = SD.roomByKind(plan, 'cargo');
      if (stretch > 0.5) {
        popts.stretch = stretch;
        plan = (SD.planFitted || SD.plan)(g, popts);
      }
      /* AND WIDENED (2026-10-29, Astra: "widen the hold"). As wide as her
       * own hull is, all the way down the bay, at floor and at ceiling, a
       * metre clear of her skin each side — measured against her model the
       * way tools/fit-hulls.js measures every room (hull above and below
       * the point), never wider than her beam has grown. Then her hold's
       * capacity grows with its floor, so a crate holds what it held on the
       * fitted hull and the stacks say what is really in her. */
      var cg = SD.roomByKind(plan, 'cargo');
      if (cg && base0) {
        var hw0 = (cg.x1 - cg.x0) / 2, hw = widestHold(ship, plan, cg, hw0, hw0 * fit.scale);
        if (hw > hw0 + 0.3) {
          popts.cargoHW = hw;
          plan = (SD.planFitted || SD.plan)(g, popts);
          cg = SD.roomByKind(plan, 'cargo');
        }
        /* Her capacity is the one the timetable sized her by (generate.js
         * holdCapacity: her hull's, times the square of how much longer
         * she is), so the crates fill her to the half the trade put in her. */
        if (fit.scale > 1.01) {
          capScale = fit.scale * fit.scale;
          var load2 = holdLoad(ship, hull, capScale);
          popts.load = load2.load;
          plan = (SD.planFitted || SD.plan)(g, popts);
        }
      }
    }
    plan.barColour = bars;
    spec._deck = { spec: spec, geom: g, plan: plan, meshes: SD.meshes(g, plan), libId: libId, turret: tur, loadKey: load.key,
                   bars: bars,
                   /* What her hold takes, at the size it is drawn (her screens read it). */
                   holdCap: (ship.cargoCap || (hull && hull.cargoCap) || 0) * capScale };
    return spec._deck;
  }
  /* The widest half-width (m) a hold at `cg` can have inside her model,
   * between `lo` and `hi`, in quarter-metre steps down from `hi`. */
  var HULL_COLS = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
  function hullColumns(mesh) {
    var ix = HULL_COLS && HULL_COLS.get(mesh);
    if (ix) return ix;
    var N = 64, cells = [], tris = [];
    for (var i = 0; i < N * N; i++) cells.push([]);
    var cell = function (u) { return Math.max(0, Math.min(N - 1, Math.floor((u + 0.55) / 1.1 * N))); };
    mesh.f.forEach(function (f) {
      for (var k = 1; k + 1 < f.length; k++) {
        var a = mesh.v[f[0]], b = mesh.v[f[k]], c = mesh.v[f[k + 1]];
        var d = (b[2] - c[2]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[2] - c[2]);
        if (Math.abs(d) < 1e-12) continue;
        var id = tris.push({ a: a, b: b, c: c, d: d }) - 1;
        var cx0 = cell(Math.min(a[0], b[0], c[0])), cx1 = cell(Math.max(a[0], b[0], c[0]));
        var cz0 = cell(Math.min(a[2], b[2], c[2])), cz1 = cell(Math.max(a[2], b[2], c[2]));
        for (var cx = cx0; cx <= cx1; cx++) for (var cz = cz0; cz <= cz1; cz++) cells[cz * N + cx].push(id);
      }
    });
    ix = {
      inside: function (x, y, z) {
        var list = cells[cell(z) * N + cell(x)], above = false, below = false;
        for (var i = 0; i < list.length; i++) {
          var t = tris[list[i]], a = t.a, b = t.b, c = t.c;
          var l1 = ((b[2] - c[2]) * (x - c[0]) + (c[0] - b[0]) * (z - c[2])) / t.d;
          if (l1 < 0 || l1 > 1) continue;
          var l2 = ((c[2] - a[2]) * (x - c[0]) + (a[0] - c[0]) * (z - c[2])) / t.d, l3 = 1 - l1 - l2;
          if (l2 < 0 || l3 < 0) continue;
          if (l1 * a[1] + l2 * b[1] + l3 * c[1] > y) above = true; else below = true;
          if (above && below) return true;
        }
        return false;
      }
    };
    if (HULL_COLS) HULL_COLS.set(mesh, ix);
    return ix;
  }
  /* ---- HER ROOMS INSIDE HER (2026-10-31) ----------------------------------
   * Astra: "all ships should have interiors that exist as part of the ship
   * itself", and they "should follow the rules of making physical sense".
   * Measured that day, only four hulls of twenty-three held every room
   * inside their skin. This is the question the deck planner asks of her
   * hull (shipdeck.js planFitted): is this point, in the plan's metres,
   * inside her — her hull both above and below it, the column test
   * widestHold already uses. */
  function hullFitter(ship) {
    var mesh = ship && ship.hullId ? hullPreviewMesh(ship.hullId, ship) : null;
    if (!mesh || !mesh.f) return null;
    var ix = hullColumns(mesh), Lm = hullLength(ship) * 1000, at = cockpitAt(ship) || [0, 0, 0];
    var one = function (x, y, z) { return ix.inside((at[0] + x) / Lm, (at[1] + y) / Lm, (at[2] + z) / Lm); };
    return {
      /* A point that lands exactly on a seam between two of her panels
       * falls through both (measured: whole rows of a Mule's quarters and
       * a Kestrel's hold "outside" at one z), and some hulls are built of
       * sections with a slot of daylight between them across the whole
       * belly (a Cutter's, a hand's width, at one frame). Asked again a few
       * centimetres off, and a quarter-metre fore and aft: a seam or a slot
       * narrower than half a metre is part of her, an opening any wider is
       * not. */
      inside: function (x, y, z) {
        return one(x, y, z) || one(x + 0.031, y, z + 0.037) || one(x - 0.029, y, z - 0.033) ||
               one(x, y, z + 0.25) || one(x, y, z - 0.25);
      }
    };
  }
  function widestHold(ship, plan, cg, lo, hi) {
    var mesh = hullPreviewMesh(ship.hullId, ship);
    if (!mesh || !mesh.f) return lo;
    var ix = hullColumns(mesh), Lm = hullLength(ship) * 1000, at = cockpitAt(ship) || [0, 0, 0];
    var fy = plan.decks ? plan.decks.main.floorY : plan.floorY, h = cg.y1 || 3;
    var xc = (cg.x0 + cg.x1) / 2, CLEAR = 1.0;
    var fits = function (w) {
      for (var z = cg.z0 + 0.1; z <= cg.z1 - 0.1; z += 1.0) {
        for (var s = -1; s <= 1; s += 2) {
          var x = xc + s * (w + CLEAR);
          if (!ix.inside((at[0] + x) / Lm, (at[1] + fy + 0.05) / Lm, (at[2] + z) / Lm)) return false;
          if (!ix.inside((at[0] + x) / Lm, (at[1] + fy + h - 0.05) / Lm, (at[2] + z) / Lm)) return false;
        }
      }
      return true;
    };
    for (var w = hi; w > lo; w -= 0.25) if (fits(w)) return w;
    return lo;
  }
  /* A ship's hold as the deck plan wants it: how full, and of what, biggest
   * line first. Your ship's `cargo` is { cid: t }; a ship you are aboard
   * carries the same, set from her manifest when you board (main.js).
   * `capScale` (a hold widened and lengthened past her hull's: shipInterior)
   * grows her capacity with her floor. `cap` goes with it, so each crate
   * can say how many tonnes it is. */
  function holdLoad(ship, hull, capScale) {
    var cap = (ship.cargoCap || (hull && hull.cargoCap) || 0) * (capScale || 1), lines = [], tot = 0;
    for (var cid in (ship.cargo || {})) {
      var t = ship.cargo[cid] || 0;
      if (t > 0) { lines.push({ cid: cid, t: t }); tot += t; }
    }
    lines.sort(function (a, b) { return b.t - a.t || (a.cid < b.cid ? -1 : 1); });
    var fill = cap > 0 ? Math.min(1, tot / cap) : 0;
    var key = Math.round(fill * 10) + '|' + lines.slice(0, 4).map(function (l) { return l.cid; }).join(',');
    return { key: key, load: cap > 0 ? { fill: fill, lines: lines, cap: cap, total: tot } : null };
  }

  /* ---- THE RAMP, FROM OUTSIDE (2026-10-26) --------------------------------
   * Her rooms are in her cockpit's frame (cockpitAt), in metres; her model
   * is unit length about her centre. So a point of the plan is (at + p) / L
   * in the model. The bay is the ramp's well carried down through her: her
   * own skin under it is cut away (every triangle whose middle is in the
   * well's footprint and below the deck), the bay's four walls go from the
   * lowest of that skin up to the deck, and the airlock above is a box with
   * a ceiling, so an open ramp shows a room at the top of it and not the
   * inside of a model. The ramp itself is shipdeck's, in the same units. */
  var RAMP_CUT = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
  function rampExterior(ship, mesh, Lkm) {
    var SD = global.ShipDeck, d = shipInterior(ship);
    var at = cockpitAt(ship) || [0, 0, 0];
    if (!SD || !d || !d.plan.ramp || !mesh || !mesh.v || !RAMP_CUT) return null;
    var p = d.plan, rp = p.ramp, Lm = Lkm * 1000;
    var fy = p.decks ? p.decks.main.floorY : p.floorY;
    var lockR = SD.roomByKind(p, 'airlock');
    var U = function (x, y, z) { return [(at[0] + x) / Lm, (at[1] + y) / Lm, (at[2] + z) / Lm]; };
    var per = RAMP_CUT.get(mesh);
    if (!per) { per = {}; RAMP_CUT.set(mesh, per); }
    var key = ship.hullId + '|' + Lm;
    var c = per[key];
    if (!c) {
      var a = U(rp.x0, fy, rp.foot), b = U(rp.x1, fy, rp.hinge);
      var x0 = Math.min(a[0], b[0]), x1 = Math.max(a[0], b[0]), z0 = Math.min(a[2], b[2]), z1 = Math.max(a[2], b[2]);
      var yTop = a[1], hull = {}, k, low = yTop, skinVotes = {};
      for (k in mesh) if (k.charAt(0) !== '_') hull[k] = mesh[k];
      hull.f = []; hull.c = mesh.c ? [] : null;
      /* CUT EXACTLY (2026-10-31). The well used to drop only the faces
       * whose MIDDLE was over it, so a big panel straddling the opening
       * stayed whole across it - and walking her ramp in her hangar, Astra:
       * "the ship hull needs to be cut away where the ramp is, because
       * otherwise we're phasing through the hull". Now every face that
       * reaches over the well is clipped at its four edges: what lies
       * outside them is kept (as new polygons), what lies inside and below
       * the deck goes. */
      hull.v = mesh.v.slice();
      function split(P, ax, val) {
        var lo = [], hi = [];
        for (var s = 0; s < P.length; s++) {
          var A = P[s], B = P[(s + 1) % P.length], da = A[ax] - val, db = B[ax] - val;
          if (da <= 0) lo.push(A);
          if (da >= 0) hi.push(A);
          if ((da < 0 && db > 0) || (da > 0 && db < 0)) {
            var tt = da / (da - db), X = [A[0] + (B[0] - A[0]) * tt, A[1] + (B[1] - A[1]) * tt, A[2] + (B[2] - A[2]) * tt];
            lo.push(X); hi.push(X);
          }
        }
        return { lo: lo.length >= 3 ? lo : null, hi: hi.length >= 3 ? hi : null };
      }
      function keepPoly(P, i) {
        var n0 = hull.v.length;
        P.forEach(function (q) { hull.v.push(q); });
        var idx = [];
        for (var s = 0; s < P.length; s++) idx.push(n0 + s);
        hull.f.push(idx);
        if (mesh.c) hull.c.push(mesh.c[i]);
      }
      for (var i = 0; i < mesh.f.length; i++) {
        var f = mesh.f[i], bx0 = Infinity, bx1 = -Infinity, bz0 = Infinity, bz1 = -Infinity, by0 = Infinity;
        for (var j = 0; j < f.length; j++) {
          var v = mesh.v[f[j]];
          bx0 = Math.min(bx0, v[0]); bx1 = Math.max(bx1, v[0]); bz0 = Math.min(bz0, v[2]); bz1 = Math.max(bz1, v[2]); by0 = Math.min(by0, v[1]);
        }
        /* Nowhere near the well, or wholly above the deck: as it was. */
        if (bx1 <= x0 || bx0 >= x1 || bz1 <= z0 || bz0 >= z1 || by0 >= yTop) {
          hull.f.push(f);
          if (mesh.c) hull.c.push(mesh.c[i]);
          continue;
        }
        var rest = f.map(function (ix) { return mesh.v[ix]; }), sp;
        sp = split(rest, 0, x0); if (sp.lo) keepPoly(sp.lo, i); rest = sp.hi;
        if (rest) { sp = split(rest, 0, x1); if (sp.hi) keepPoly(sp.hi, i); rest = sp.lo; }
        if (rest) { sp = split(rest, 2, z0); if (sp.lo) keepPoly(sp.lo, i); rest = sp.hi; }
        if (rest) { sp = split(rest, 2, z1); if (sp.hi) keepPoly(sp.hi, i); rest = sp.lo; }
        if (!rest) continue;
        /* The piece over the well: gone if it is below the deck. */
        /* Cut at the deck too (2026-10-31): a sloping plate whose middle
         * was above the deck was kept whole, and its low edge hung down
         * into the well - the slab you walked up into on her ramp (Astra:
         * "ship detail flashes on screen"). What is above the deck stays;
         * what is below it goes. */
        var sy = split(rest, 1, yTop);
        if (sy.hi) keepPoly(sy.hi, i);
        if (!sy.lo) continue;
        rest = sy.lo;
        rest.forEach(function (q) { low = Math.min(low, q[1]); });
        /* What colour her skin was where the well is cut, so the doors
         * that close it are painted to match. */
        if (mesh.c && typeof mesh.c[i] === 'string') skinVotes[mesh.c[i]] = (skinVotes[mesh.c[i]] || 0) + 1;
      }
      /* The bay: walls from her lowest cut skin to the deck, and the
       * airlock's box over it. In the plan's metres, then to the model. */
      var pal = p.palette || {}, bay = { v: [], f: [], c: [] };
      var lowM = low * Lm - at[1] - 0.05;
      function q4(A, B, C, D, col) {
        var n = bay.v.length;
        [A, B, C, D].forEach(function (P) { bay.v.push(U(P[0], P[1], P[2])); });
        bay.f.push([n, n + 1, n + 2]); bay.c.push(col);
        bay.f.push([n, n + 2, n + 3]); bay.c.push(col);
      }
      var wc = pal.lockWall || '#2e3640', top = fy + 2.3;
      q4([rp.x0, lowM, rp.foot], [rp.x1, lowM, rp.foot], [rp.x1, fy, rp.foot], [rp.x0, fy, rp.foot], wc);
      q4([rp.x0, lowM, rp.hinge], [rp.x1, lowM, rp.hinge], [rp.x1, fy, rp.hinge], [rp.x0, fy, rp.hinge], wc);
      q4([rp.x0, lowM, rp.foot], [rp.x0, lowM, rp.hinge], [rp.x0, fy, rp.hinge], [rp.x0, fy, rp.foot], wc);
      q4([rp.x1, lowM, rp.foot], [rp.x1, lowM, rp.hinge], [rp.x1, fy, rp.hinge], [rp.x1, fy, rp.foot], wc);
      if (lockR) {
        var r = lockR;
        q4([r.x0, top, r.z0], [r.x1, top, r.z0], [r.x1, top, r.z1], [r.x0, top, r.z1], pal.ceil || '#1f242b');
        q4([r.x0, fy, r.z0], [r.x1, fy, r.z0], [r.x1, top, r.z0], [r.x0, top, r.z0], wc);
        q4([r.x0, fy, r.z1], [r.x1, fy, r.z1], [r.x1, top, r.z1], [r.x0, top, r.z1], wc);
        q4([r.x0, fy, r.z0], [r.x0, fy, r.z1], [r.x0, top, r.z1], [r.x0, top, r.z0], wc);
        q4([r.x1, fy, r.z0], [r.x1, fy, r.z1], [r.x1, top, r.z1], [r.x1, top, r.z0], wc);
        /* The floor round the well, so the landing is there to look up at. */
        q4([r.x0, fy, rp.hinge], [r.x1, fy, rp.hinge], [r.x1, fy, r.z1], [r.x0, fy, r.z1], pal.passFloor || '#20262f');
        q4([r.x0, fy, r.z0], [r.x1, fy, r.z0], [r.x1, fy, rp.foot], [r.x0, fy, rp.foot], pal.passFloor || '#20262f');
        q4([r.x0, fy, rp.foot], [rp.x0, fy, rp.foot], [rp.x0, fy, rp.hinge], [r.x0, fy, rp.hinge], pal.passFloor || '#20262f');
        q4([rp.x1, fy, rp.foot], [r.x1, fy, rp.foot], [r.x1, fy, rp.hinge], [rp.x1, fy, rp.hinge], pal.passFloor || '#20262f');
        q4([r.x0 + 0.9, top - 0.01, r.z0 + 0.3], [r.x0 + 1.1, top - 0.01, r.z0 + 0.3],
           [r.x0 + 1.1, top - 0.01, r.z1 - 0.3], [r.x0 + 0.9, top - 0.01, r.z1 - 0.3], pal.light || '!#d8ecff');
      }
      var skinCol = null, skinN = 0;
      for (var sc in skinVotes) if (skinVotes[sc] > skinN) { skinN = skinVotes[sc]; skinCol = sc; }
      /* HER AIRLOCK IS EMPTY OF HULL (2026-10-31). Astra: "when traversing
       * the ramp, ship detail flashes on screen". The library model has
       * plating and greebles of its own standing where her airlock room is,
       * and from her ramp you look straight up into that room - so a slab
       * of sunlit skin swung across the view at every step. The room's box
       * (a few cm proud all round) is cut out of her hull per pixel when
       * she is drawn; see drawShipModel. */
      /* The well's own footprint is in it too: where the well runs out
       * past the room's end, her deck plating at deck height lay across
       * the top of the ramp, a slab you walked up into. */
      var lzf = Math.min(rp.foot, rp.hinge), lzh = Math.max(rp.foot, rp.hinge);
      var lockBox = lockR ? {
        cx: at[0] + (lockR.x0 + lockR.x1) / 2,
        hw: Math.max((lockR.x1 - lockR.x0) / 2, Math.max(rp.x1 - (lockR.x0 + lockR.x1) / 2, (lockR.x0 + lockR.x1) / 2 - rp.x0)) + 0.03,
        z0: at[2] + Math.min(lockR.z0, lzf) - 0.03, z1: at[2] + Math.max(lockR.z1, lzh) + 0.03,
        y0: at[1] + fy - 0.03, y1: at[1] + top + 0.03
      } : null;
      c = per[key] = { hull: hull, bay: bay, ramps: {}, lowM: lowM, skin: skinCol, lockBox: lockBox };
    }
    /* The ramp at a twentieth of its travel at a time. */
    var t = Math.round(Math.max(0, Math.min(1, ship.airlock.ramp || 0)) * 20) / 20;
    var rm = c.ramps[t];
    if (!rm) {
      var m = SD.rampMesh(p.palette || {}, rp, fy, t);
      var mv = m.v.slice(), mf = m.f.slice(), mc = m.c.slice();
      /* HER BELLY DOORS (2026-10-29). The ramp stows at deck height, above
       * her skin, so shut it left an open dark well under her — Astra, on
       * a Talon: "I don't see where there could be a ramp". Two leaves
       * close the well flush with the skin, framed in hazard stripe so the
       * way in reads from outside; they slide back into the bay sides in
       * the first part of the travel, before the ramp starts to show. */
      var yd = c.lowM + 0.04, open = Math.min(1, t / 0.15), halfW = (rp.x1 - rp.x0) / 2;
      var zf = Math.min(rp.foot, rp.hinge), zh = Math.max(rp.foot, rp.hinge);
      var quad = function (A, B, C, D, col) {
        var n = mv.length; mv.push(A, B, C, D);
        mf.push([n, n + 1, n + 2], [n, n + 2, n + 3]); mc.push(col, col);
      };
      var leaf = c.skin || '#5d6670', seam = '#1b1f24';
      if (open < 1) {
        var wL = halfW * (1 - open);
        quad([rp.x0, yd, zf], [rp.x0 + wL - 0.02, yd, zf], [rp.x0 + wL - 0.02, yd, zh], [rp.x0, yd, zh], leaf);
        quad([rp.x1 - wL + 0.02, yd, zf], [rp.x1, yd, zf], [rp.x1, yd, zh], [rp.x1 - wL + 0.02, yd, zh], leaf);
        if (open === 0) quad([rp.x0 + halfW - 0.02, yd + 0.005, zf], [rp.x0 + halfW + 0.02, yd + 0.005, zf],
                             [rp.x0 + halfW + 0.02, yd + 0.005, zh], [rp.x0 + halfW - 0.02, yd + 0.005, zh], seam);
      }
      /* HAZARD STRIPES round the mouth, always (Astra, 2026-10-29: "we
       * need to put hazard stripes around the ramp ... around all ramps
       * like it"). A band a quarter-metre wide, yellow and black at 45°,
       * on every hull's ramp: this is the one place on her belly that
       * moves under someone's feet. Each stripe is a parallelogram along
       * the band, clipped to it, so the corners stay square. */
      var b = 0.24, yt = yd - 0.01, SW = 0.2;
      var YEL = '#f4c21a', BLK = '#141414';
      /* One straight run of band from (u0) to (u1) along an axis, across
       * from (w0) to (w1). `put(u, w)` maps it to the plan's x/z. */
      var band = function (u0, u1, w0, w1, put) {
        var bw = w1 - w0, n = Math.ceil((u1 - u0 + bw) / SW);
        for (var si = 0; si < n; si++) {
          var a0 = u0 - bw + si * SW, a1 = a0 + SW;
          var cl = function (u) { return Math.max(u0, Math.min(u1, u)); };
          quad(put(cl(a0), w0), put(cl(a1), w0), put(cl(a1 + bw), w1), put(cl(a0 + bw), w1), si % 2 ? BLK : YEL);
        }
      };
      var PX = function (u, w) { return [u, yt, w]; }, PZ = function (u, w) { return [w, yt, u]; };
      band(rp.x0 - b, rp.x1 + b, zf - b, zf, PX);
      band(rp.x0 - b, rp.x1 + b, zh, zh + b, PX);
      band(zf, zh, rp.x0 - b, rp.x0, PZ);
      band(zf, zh, rp.x1, rp.x1 + b, PZ);
      rm = c.ramps[t] = { v: mv.map(function (v) { return U(v[0], v[1], v[2]); }), f: mf, c: mc };
    }
    return { hull: c.hull, bay: c.bay, ramp: rm, lowM: c.lowM, lockBox: c.lockBox };
  }

  /* ---- WHERE HER HATCH IS, FROM OUTSIDE (2026-10-29) ---------------------
   * For two ships meeting in space (boarding.js): the middle of her ramp's
   * mouth, on her belly skin, and the box her hull fills, both in MODEL
   * units (her length is 1; multiply by the length she is drawn at for
   * km). Model axes are her right, up and fore. Null for a hull with no
   * ramp. Cached on her interior, which is cached per hull. */
  function hatchModel(ship) {
    var d = shipInterior(ship);
    if (!d || !d.plan || !d.plan.ramp) return null;
    if (d._hatch) return d._hatch;
    var mesh = hullPreviewMesh(ship.hullId, ship);
    if (!mesh || !mesh.v) return null;
    var L = hullLength(ship), Lm = L * 1000, at = cockpitAt(ship) || [0, 0, 0], rp = d.plan.ramp;
    var ext = rampExterior(Object.create(ship, { airlock: { value: { ramp: 0 } } }), mesh, L);
    var fy = d.plan.decks ? d.plan.decks.main.floorY : d.plan.floorY;
    var skinY = ext ? ext.lowM + 0.05 : fy;
    var lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (var i = 0; i < mesh.v.length; i++) {
      for (var k = 0; k < 3; k++) { var q = mesh.v[i][k]; if (q < lo[k]) lo[k] = q; if (q > hi[k]) hi[k] = q; }
    }
    d._hatch = {
      hatch: [(at[0] + (rp.x0 + rp.x1) / 2) / Lm, (at[1] + skinY) / Lm, (at[2] + (rp.foot + rp.hinge) / 2) / Lm],
      lo: lo, hi: hi, lengthKm: L
    };
    return d._hatch;
  }

  /* ---- A HULL IS SOLID (2026-10-31) ---------------------------------------
   * Astra, watching the first spacewalk: "There needs to be collision
   * detection with ships and station walls, so we aren't flying through the
   * hull of a ship like I just saw." Stations already stop you
   * (sim.js checkStationImpact, against their triangles); ships did not.
   *
   * The test is the station's, on the hull you see: a step's PATH against
   * her triangles (so nothing tunnels between two frames), as a bundle of
   * five parallel segments at the mover's own half-width (so a body has a
   * body), in her model frame where her length is one. The mesh is the one
   * she is drawn with — a hull with a ramp is tested with her ramp's well
   * cut out of it exactly as it is drawn, so you can climb up into her
   * airlock and cannot climb through anything else.
   *
   *   hullSegmentHit(ship, a, b, radKm) -> null | { t, normal }   (world)
   *   hullSolidOf(ship) -> { mesh, L }                             (km)  */
  var HULL_COLL = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
  function hullSolidOf(ship) {
    if (!ship) return null;
    var mesh = null, L = 0;
    if (ship.hullId) {
      mesh = hullPreviewMesh(ship.hullId, ship);
      L = hullLength(ship);
      if (mesh && ship.airlock && shipInterior(ship) && shipInterior(ship).plan.ramp) {
        var ext = null;
        try { ext = rampExterior(Object.create(ship, { airlock: { value: { ramp: 1 } } }), mesh, L); } catch (e) { ext = null; }
        if (ext && ext.hull) mesh = ext.hull;
      }
    } else {
      var kind = ship.hullClass || ship.cls, letter = ship.sizeLetter;
      if (letter) { var sw = hullIdForSpec({ cls: kind, sizeLetter: letter }); if (sw) mesh = libHull(sw); }
      mesh = mesh || shipMeshes()[kind] || shipMeshes().courier;
      L = ship.size || ship.lengthKm || 0;
    }
    return mesh && mesh.v && mesh.f && L > 0 ? { mesh: mesh, L: L } : null;
  }
  /* The mesh as flat triangles (polygons fanned) and the radius of the
   * sphere round it, once per mesh. */
  function hullTris(mesh) {
    var c = HULL_COLL && HULL_COLL.get(mesh);
    if (c) return c;
    var tri = [], R = 0;
    for (var i = 0; i < mesh.f.length; i++) {
      var f = mesh.f[i];
      for (var k = 1; k + 1 < f.length; k++) tri.push(mesh.v[f[0]], mesh.v[f[k]], mesh.v[f[k + 1]]);
    }
    for (var j = 0; j < mesh.v.length; j++) {
      var p = mesh.v[j], r = Math.sqrt(p[0] * p[0] + p[1] * p[1] + p[2] * p[2]);
      if (r > R) R = r;
    }
    c = { tri: tri, R: R };
    if (HULL_COLL) HULL_COLL.set(mesh, c);
    return c;
  }
  /* One segment against the triangles: the first crossing, or null. */
  function trisSegment(c, a, b) {
    var dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
    if (dx === 0 && dy === 0 && dz === 0) return null;
    var tri = c.tri, best = Infinity, bn = null;
    for (var t0 = 0; t0 < tri.length; t0 += 3) {
      var p0 = tri[t0], p1 = tri[t0 + 1], p2 = tri[t0 + 2];
      var e1x = p1[0] - p0[0], e1y = p1[1] - p0[1], e1z = p1[2] - p0[2];
      var e2x = p2[0] - p0[0], e2y = p2[1] - p0[1], e2z = p2[2] - p0[2];
      var hx = dy * e2z - dz * e2y, hy = dz * e2x - dx * e2z, hz = dx * e2y - dy * e2x;
      var det = e1x * hx + e1y * hy + e1z * hz;
      if (det > -1e-14 && det < 1e-14) continue;
      var f = 1 / det, sx = a[0] - p0[0], sy = a[1] - p0[1], sz = a[2] - p0[2];
      var u = (sx * hx + sy * hy + sz * hz) * f;
      if (u < 0 || u > 1) continue;
      var qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x;
      var v = (dx * qx + dy * qy + dz * qz) * f;
      if (v < 0 || u + v > 1) continue;
      var t = (e2x * qx + e2y * qy + e2z * qz) * f;
      if (t < 0 || t > 1 || t >= best) continue;
      best = t;
      bn = [e1y * e2z - e1z * e2y, e1z * e2x - e1x * e2z, e1x * e2y - e1y * e2x];
    }
    return bn ? { t: best, n: bn } : null;
  }
  function hullSegmentHit(ship, a, b, radKm) {
    var hs = hullSolidOf(ship);
    if (!hs || !ship.pos || !ship.fwd || !ship.up || !ship.right) return null;
    var L = hs.L, c = hullTris(hs.mesh);
    var toM = function (w) {
      var rx = w.x - ship.pos.x, ry = w.y - ship.pos.y, rz = w.z - ship.pos.z;
      return [(rx * ship.right.x + ry * ship.right.y + rz * ship.right.z) / L,
              (rx * ship.up.x + ry * ship.up.y + rz * ship.up.z) / L,
              (rx * ship.fwd.x + ry * ship.fwd.y + rz * ship.fwd.z) / L];
    };
    var A = toM(a), B = toM(b), rr = (radKm || 0) / L;
    /* Nowhere near her: the segment's closest approach to her middle is
     * outside the sphere round her. */
    var dx = B[0] - A[0], dy = B[1] - A[1], dz = B[2] - A[2], dd = dx * dx + dy * dy + dz * dz;
    var s = dd > 0 ? Math.max(0, Math.min(1, -(A[0] * dx + A[1] * dy + A[2] * dz) / dd)) : 0;
    var cx = A[0] + dx * s, cy = A[1] + dy * s, cz = A[2] + dz * s;
    if (Math.sqrt(cx * cx + cy * cy + cz * cz) > c.R + rr) return null;
    var best = trisSegment(c, A, B);
    var Ld = Math.sqrt(dd);
    if (rr > 0 && Ld > 1e-12) {
      var ux = 0, uy = 1, uz = 0;
      if (Math.abs(dy / Ld) > 0.9) { ux = 1; uy = 0; }
      var d1 = (ux * dx + uy * dy + uz * dz) / Ld;
      ux -= dx / Ld * d1; uy -= dy / Ld * d1; uz -= dz / Ld * d1;
      var ul = Math.sqrt(ux * ux + uy * uy + uz * uz) || 1;
      ux /= ul; uy /= ul; uz /= ul;
      var vx = (dy * uz - dz * uy) / Ld, vy = (dz * ux - dx * uz) / Ld, vz = (dx * uy - dy * ux) / Ld;
      [[ux, uy, uz], [-ux, -uy, -uz], [vx, vy, vz], [-vx, -vy, -vz]].forEach(function (o) {
        var h = trisSegment(c, [A[0] + o[0] * rr, A[1] + o[1] * rr, A[2] + o[2] * rr],
                               [B[0] + o[0] * rr, B[1] + o[1] * rr, B[2] + o[2] * rr]);
        if (h && (!best || h.t < best.t)) best = h;
      });
    }
    if (!best) return null;
    /* The face's normal in the world, turned to face the way you came. */
    var n = best.n;
    var nw = V.norm(V.add(V.add(V.scale(ship.right, n[0]), V.scale(ship.up, n[1])), V.scale(ship.fwd, n[2])));
    if (V.dot(nw, V.sub(b, a)) > 0) nw = V.scale(nw, -1);
    return { t: best.t, normal: nw };
  }

  /* ---- ON THE GROUND BESIDE HER (2026-10-26) ------------------------------
   * The walk.js plan for standing outside your ship once the ramp is down:
   * in her cockpit's frame like her rooms (so one walker crosses from one
   * to the other without a seam), its floor the ground her gear stands on.
   * Two rooms: the ramp, first so it is found first, and a wide square of
   * ground round her. Her belly is the ceiling over part of it: `clearAt`
   * is how much headroom she leaves at a spot (her lowest skin over it,
   * the ramp's bay cut out), and where it is less than a crouch you
   * cannot go. A post at the ramp's foot works it from out here. */
  /* WHAT A HEAD NEEDS UNDER HER (2026-11-03). Astra, in her hangar at the
   * foot of her Talon's ramp: "interior of ship visible, no collision on
   * underside so we're clipping through the bottom". Three things let her:
   *
   *   - the clearance was sampled at each half-metre cell's MIDDLE only,
   *     so a keel fin narrower than a cell (the Talon's, 5 cm off the floor)
   *     was invisible from every cell beside it, and walking along it your
   *     shoulders and head went through it - measured: 456 of 6,974
   *     standable spots under a Talon had her skin inside the head's reach,
   *     the worst 1.8 m inside;
   *   - only the walker's centre was asked, not the 0.3 m round it that the
   *     walls of a room keep (walk.js RADIUS), and the eye has a near plane
   *     10 cm out whose corners reach 17 cm (gl.js; 68° at 16:9);
   *   - a head under 1.4 m of her was squashed down to a crawl at 0.4 m
   *     rather than stopped, so a belly 0.6 m up was "walkable".
   *
   * So the field is now exact and conservative: each triangle of her, as
   * she is DRAWN (the ramp's well cut, the airlock box cut per pixel by the
   * shader, the bay's walls, and her legs telescoped to the lifted ground -
   * gearMeshes), is clipped to every cell it crosses and the cell keeps the
   * lowest point of what is left, so nothing slips between samples. The
   * question is asked over the whole disc a walker fills (clearAt), and the
   * rules are two heads, each an eye plus HEAD_MARGIN: under STAND_CLEAR
   * you are made to crouch, and under CROUCH_CLEAR she is SOLID - you cannot
   * go. (A first pass kept the old squash as a third, crawling, head at
   * 0.6 m; dropped the same day: the walker has no crawl, and an eye 0.4 m
   * off the floor under a belly is the clipping she reported, held a few
   * centimetres further off.) Inside the ramp's corridor the ramp's own
   * rule holds instead (headroom over its face), and the eye is held under
   * her skin wherever you are (main.js bellyHead), so it never ends up
   * inside her while a crouch eases down. */
  var HEAD_R = 0.3;                        // m: the walker's own radius (walk.js RADIUS)
  var HEAD_MARGIN = 0.18;                  // m over the eye: the near plane's corners, and skin
  var STAND_CLEAR = 1.65 + HEAD_MARGIN;    // m: walk.js EYE, standing
  /* A crouched eye is 1.10 m (walk.js CROUCH_EYE) and the posed body's is
   * 1.16 (selfFigure); the larger, so the body's own head clears too. */
  var CROUCH_CLEAR = 1.16 + HEAD_MARGIN;
  /* Below a crouched head she is solid. Kept under its old export name
   * (it was 0.6 m, "nobody gets under her - not even on hands and knees"). */
  var OUTSIDE_CROUCH = CROUCH_CLEAR;
  /* The ramp's rails: no stepping off its side once it is more than a
   * kerb above the floor, and the walker's middle kept a body's width in
   * from them (or its head is in the bay's wall). */
  var RAMP_STEP = 0.35;
  /* Sutherland-Hodgman against one axis-aligned plane: the part of P with
   * P[ax] <= val (keepLo) or >= val. */
  function clipAx(P, ax, val, keepLo) {
    var out = [];
    for (var s = 0; s < P.length; s++) {
      var A = P[s], B = P[(s + 1) % P.length];
      var da = keepLo ? val - A[ax] : A[ax] - val, db = keepLo ? val - B[ax] : B[ax] - val;
      if (da >= 0) out.push(A);
      if ((da > 0 && db < 0) || (da < 0 && db > 0)) {
        var t = da / (da - db);
        out.push([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t]);
      }
    }
    return out;
  }
  function minY(P) { var m = Infinity; for (var i = 0; i < P.length; i++) if (P[i][1] < m) m = P[i][1]; return m; }
  /* The lowest point of polygon P that is drawn: the part inside `box`
   * (x0,x1,z0,z1,y0,y1, the shader's airlock cut) is not. */
  function minYOutsideBox(P, box) {
    if (!box) return minY(P);
    var m = Infinity, rest = P, piece;
    piece = clipAx(rest, 0, box.x0, true); if (piece.length >= 3) m = Math.min(m, minY(piece));
    rest = clipAx(rest, 0, box.x0, false); if (rest.length < 3) return m;
    piece = clipAx(rest, 0, box.x1, false); if (piece.length >= 3) m = Math.min(m, minY(piece));
    rest = clipAx(rest, 0, box.x1, true); if (rest.length < 3) return m;
    piece = clipAx(rest, 2, box.z0, true); if (piece.length >= 3) m = Math.min(m, minY(piece));
    rest = clipAx(rest, 2, box.z0, false); if (rest.length < 3) return m;
    piece = clipAx(rest, 2, box.z1, false); if (piece.length >= 3) m = Math.min(m, minY(piece));
    rest = clipAx(rest, 2, box.z1, true); if (rest.length < 3) return m;
    piece = clipAx(rest, 1, box.y0, true); if (piece.length >= 3) m = Math.min(m, minY(piece));
    piece = clipAx(rest, 1, box.y1, false); if (piece.length >= 3) m = Math.min(m, minY(piece));
    return m;
  }
  /* Her underside as a field of clearances over the floor, in the plan's
   * metres: { cx0, cz0, n, step, low } with low[j*n+i] the lowest drawn
   * point of her over cell (i, j), above the floor (Infinity: nothing of
   * hers over it). `parts` are { v, f, box? } meshes already in plan
   * metres with y above the floor. */
  /* `floorOf(i, j)` (optional): a height under which nothing counts for
   * cell (i, j) - over her ramp, what is under the walking face is under
   * your feet, not over your head (the bay's end wall below her airlock's
   * floor, at the ramp's top). Those cells get a second answer in `above`;
   * every other cell's `above` is its `low`. */
  function clearanceField(parts, cx0, cz0, n, STEP, floorOf) {
    var low = new Float32Array(n * n), above = floorOf ? new Float32Array(n * n) : low;
    for (var i = 0; i < low.length; i++) { low[i] = Infinity; above[i] = Infinity; }
    var tris = 0;
    parts.forEach(function (pt) {
      var V3 = pt.v;
      for (var fi = 0; fi < pt.f.length; fi++) {
        var fc = pt.f[fi];
        for (var k = 1; k + 1 < fc.length; k++) {
          var T = [V3[fc[0]], V3[fc[k]], V3[fc[k + 1]]];
          tris++;
          var x0 = Math.min(T[0][0], T[1][0], T[2][0]), x1 = Math.max(T[0][0], T[1][0], T[2][0]);
          var z0 = Math.min(T[0][2], T[1][2], T[2][2]), z1 = Math.max(T[0][2], T[1][2], T[2][2]);
          var ia = Math.max(0, Math.floor((x0 - cx0) / STEP)), ib = Math.min(n - 1, Math.floor((x1 - cx0) / STEP));
          var ja = Math.max(0, Math.floor((z0 - cz0) / STEP)), jb = Math.min(n - 1, Math.floor((z1 - cz0) / STEP));
          if (ia > ib || ja > jb) continue;
          var tMin = minY(T), box = pt.box;
          for (var ii = ia; ii <= ib; ii++) {
            var gx0 = cx0 + ii * STEP, gx1 = gx0 + STEP;
            var strip = clipAx(clipAx(T, 0, gx0, false), 0, gx1, true);
            if (strip.length < 3) continue;
            for (var jj = ja; jj <= jb; jj++) {
              var o = jj * n + ii, cut = floorOf ? floorOf(ii, jj) : null;
              /* Already lower than anything this triangle can give: no
               * point clipping it (the common case, under her belly). */
              if (!box && low[o] <= tMin && (cut === null || above[o] <= tMin)) continue;
              var gz0 = cz0 + jj * STEP;
              var P = clipAx(clipAx(strip, 2, gz0, false), 2, gz0 + STEP, true);
              if (P.length < 3) continue;
              var y = minYOutsideBox(P, box);
              if (y < low[o]) low[o] = y;
              if (cut === null) { if (y < above[o]) above[o] = y; continue; }
              var up = clipAx(P, 1, cut, false);
              if (up.length < 3) continue;
              var ya = minYOutsideBox(up, box);
              if (ya < above[o]) above[o] = ya;
            }
          }
        }
      }
    });
    return { cx0: cx0, cz0: cz0, n: n, step: STEP, low: low, above: above, tris: tris };
  }
  /* The longest ramp, hinged where `plan` hinges it, that no leg of hers
   * stands in: null when none is in its way. A leg is in the way where it
   * crosses the ramp's own width inside the body-high slab over the ramp's
   * face (a hand under it to two metres over it), or where you step off
   * its foot. Her legs as they stand on the lifted ground (gearMeshes at
   * full travel). Tried from the plan's length down by quarter metres. */
  function rampLegLimit(ship, plan, fit) {
    var rp = plan.ramp, mesh = ship && ship.hullId ? hullPreviewMesh(ship.hullId, ship) : null;
    if (!rp || !mesh || !mesh.gear || !(fit.drop > 0)) return null;
    var at = cockpitAt(ship) || [0, 0, 0], Lm = hullLength(ship) * 1000;
    var gyR = fit.ground - at[1], drop = fit.drop, legs = [];
    /* Each part as the box of it that is over the ramp's width: a strut
     * runs from the floor to her belly, and its two ends can both be
     * outside the slab while the strut goes straight through it. */
    gearMeshes(mesh, 1, (fit.gearExt || 0) / Lm).forEach(function (m) {
      var b = null;
      m.v.forEach(function (v) {
        var x = v[0] * Lm - at[0], y = v[1] * Lm - at[1] - gyR, z = v[2] * Lm - at[2];
        if (x < rp.x0 || x > rp.x1 || z > rp.hinge) return;
        if (!b) b = { y0: y, y1: y, z0: z, z1: z };
        b.y0 = Math.min(b.y0, y); b.y1 = Math.max(b.y1, y); b.z0 = Math.min(b.z0, z); b.z1 = Math.max(b.z1, z);
      });
      if (b) legs.push(b);
    });
    if (!legs.length) return null;
    var hits = function (len) {
      if (len <= drop) return true;
      var run = Math.sqrt(len * len - drop * drop), foot = rp.hinge - run;
      var face = function (z) { return z < foot ? 0 : drop * (z - foot) / run; };
      for (var i = 0; i < legs.length; i++) {
        var b = legs[i];
        if (b.z1 < foot - 0.8) continue;
        /* Over the face, not under it: the Kestrel's open gear door hangs
         * just under her ramp's edge (its top 2.20 m, the face over it
         * 2.21), which is the ramp passing over it, not into it. */
        if (b.y1 > face(b.z0) && b.y0 < face(b.z1) + 2.0) return true;
      }
      return false;
    };
    if (!hits(rp.len)) return null;
    for (var len = rp.len - 0.25; len > drop; len -= 0.25) if (!hits(len)) return len;
    return 0.01;
  }
  function outsidePlan(ship) {
    var d = shipInterior(ship), SD = global.ShipDeck, f = hullFit(ship);
    if (!d || !d.plan.ramp || !SD || !f) return null;
    if (d.outside) return d.outside;
    var t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    var at = cockpitAt(ship) || [0, 0, 0], rp = d.plan.ramp;
    var L = hullLength(ship), Lm = L * 1000;
    var gy = f.ground - at[1];                     // the ground, in the room's metres
    var fy = d.plan.decks ? d.plan.decks.main.floorY : d.plan.floorY;
    var mesh = hullPreviewMesh(ship.hullId, ship);
    var ext = rampExterior(Object.create(ship, { airlock: { value: { ramp: 1 } } }), mesh, L);
    var hull = ext ? ext.hull : mesh;
    /* Model units to the plan's metres, y above the floor. */
    var toPlan = function (v) { return [v[0] * Lm - at[0], v[1] * Lm - at[1] - gy, v[2] * Lm - at[2]]; };
    var lb = ext && ext.lockBox, box = lb ? { x0: lb.cx - lb.hw - at[0], x1: lb.cx + lb.hw - at[0], z0: lb.z0 - at[2], z1: lb.z1 - at[2],
                                              y0: lb.y0 - at[1] - gy, y1: lb.y1 - at[1] - gy } : null;
    var parts = [{ v: hull.v.map(toPlan), f: hull.f, box: box }];
    if (ext && ext.bay && ext.bay.f.length) parts.push({ v: ext.bay.v.map(toPlan), f: ext.bay.f });
    gearMeshes(mesh, 1, (f.gearExt || 0) / Lm).forEach(function (m) { parts.push({ v: m.v.map(toPlan), f: m.f }); });
    /* A quarter-metre cell on a hull you can walk round in a minute; half a
     * metre under the big ones, where the field is 400 cells a side. */
    var STEP = Lm > 60 ? 0.5 : 0.25, half = Lm * 0.6 + 2;
    var cx0 = -at[0] - half, cz0 = -at[2] - half, n = Math.ceil(half * 2 / STEP);
    var run = rp.mode === 'lift' ? 0 : rp.len * Math.cos(rp.angle);
    var footZ = rp.hinge - (rp.mode === 'lift' ? rp.len : run);
    /* Her ramp's walking face over a point, above the floor (0 off it). */
    function rampSurface(z) {
      var fz = SD.rampFloor(rp, fy, 1, (rp.x0 + rp.x1) / 2, Math.min(z, rp.hinge));
      return fz === null ? 0 : Math.max(0, fz - gy);
    }
    /* Over the ramp and a head's width either side of it, what is below
     * the face, or less than a kerb above it, is underfoot or beside you,
     * not overhead: at her ramp's top the landing's own floor is level with
     * it, and the bay's end wall hangs below that. The highest the face is
     * across the cell, so nothing a stride up the ramp is missed. */
    var floorOf = function (ii, jj) {
      var gx0 = cx0 + ii * STEP, gz0 = cz0 + jj * STEP;
      if (gx0 + STEP < rp.x0 - HEAD_R || gx0 > rp.x1 + HEAD_R || gz0 + STEP < footZ - 0.3 || gz0 > rp.hinge + HEAD_R) return null;
      return Math.max(rampSurface(gz0), rampSurface(gz0 + STEP)) + RAMP_STEP;
    };
    var field = clearanceField(parts, cx0, cz0, n, STEP, floorOf), low = field.low, above = field.above;
    /* Her skin over one point: the cell it is in. */
    function skinAt(x, z) {
      var ii = Math.floor((x - cx0) / STEP), jj = Math.floor((z - cz0) / STEP);
      if (ii < 0 || jj < 0 || ii >= n || jj >= n) return Infinity;
      return low[jj * n + ii];
    }
    /* Her lowest skin over the disc a walker at (x, z) fills: every cell
     * that disc reaches into. Infinity: nothing of hers over any of it. */
    function clearAt(x, z, r, arr) {
      r = r === undefined ? HEAD_R : r;
      var low = arr || field.low;
      var ia = Math.floor((x - r - cx0) / STEP), ib = Math.floor((x + r - cx0) / STEP);
      var ja = Math.floor((z - r - cz0) / STEP), jb = Math.floor((z + r - cz0) / STEP);
      var m = Infinity;
      for (var ii = Math.max(0, ia); ii <= Math.min(n - 1, ib); ii++) {
        var gx = Math.max(cx0 + ii * STEP, Math.min(x, cx0 + (ii + 1) * STEP)) - x;
        for (var jj = Math.max(0, ja); jj <= Math.min(n - 1, jb); jj++) {
          var gz = Math.max(cz0 + jj * STEP, Math.min(z, cz0 + (jj + 1) * STEP)) - z;
          if (gx * gx + gz * gz > r * r) continue;
          var v = low[jj * n + ii];
          if (v < m) m = v;
        }
      }
      return m;
    }
    var reach = Math.max(70, Lm * 1.4);
    var rooms = [
      { id: 'ramp', kind: 'ramp', x0: rp.x0, x1: rp.x1, z0: footZ - 0.3, z1: rp.hinge, y0: 0, y1: 3, label: 'Ramp' },
      { id: 'ground', kind: 'ground', x0: -at[0] - reach, x1: -at[0] + reach, z0: -at[2] - reach, z1: -at[2] + reach,
        y0: 0, y1: 50, label: (ship.landedOn && ship.landedOn.name) || 'Outside' }
    ];
    var post = { kind: 'rampctl', x: rp.x1 + 0.7, z: footZ - 0.6, label: 'Ramp controls',
                 counter: [rp.x1 + 0.55, footZ - 0.75, rp.x1 + 0.85, footZ - 0.45] };
    var items = [post];
    /* A lift is ridden: its own control on the platform, to take you up. */
    if (rp.mode === 'lift') items.push({ kind: 'rampctl', x: rp.xc, z: rp.hinge - 0.4, label: 'Lift controls' });
    var rampW = rp.x1 - rp.x0, rail = Math.min(HEAD_R, rampW * 0.25);
    function onRampAt(x, z) { return x >= rp.x0 && x <= rp.x1 && z >= footZ - 0.3 && z <= rp.hinge; }
    /* How much head room a walker standing at (x, z) has: her skin over
     * the disc they fill, less what they are standing on. */
    function headroom(x, z) {
      return onRampAt(x, z) ? clearAt(x, z, HEAD_R, above) - rampSurface(z) : clearAt(x, z);
    }
    /* THE WAY OUT FROM A LIFT'S PIT (2026-11-03). The Crawler's lift comes
     * down into a pit closed fore and aft by her skirt's cross-members,
     * 0.66 m off the ground, and her model had no door in them: with her
     * hull solid under a crouched head the walk-out test found her the
     * only hull trapped. For a day this plan carried a "lift lane", a strip
     * straight out from the platform where you ducked under the member to
     * an eye 0.42 m off the floor - a model problem worked round in code.
     * The model is mended now (tools/glb-patch.js cuts a framed 2.30 x
     * 2.13 m door through her fore cross-member on the lift's line), so
     * the lane is gone and a lift is walked off like anything else: the
     * same crouch rule everywhere, and no exception to it. */
    var plan = {
      kind: 'outside', outside: true, rooms: rooms, doors: [], items: items,
      spawn: { x: (rp.x0 + rp.x1) / 2, z: footZ - 1.2, yaw: Math.PI }, floorY: gy,
      ramp: rp, ship: d.plan, clearAt: clearAt, skinAt: skinAt, headroom: headroom, rampSurface: rampSurface,
      footZ: footZ, field: field,
      HEAD_MARGIN: HEAD_MARGIN, STAND_CLEAR: STAND_CLEAR, CROUCH_CLEAR: CROUCH_CLEAR,
      blocked: function (x, z) {
        var t = (ship.airlock && ship.airlock.ramp) || 0;
        var inSpan = z >= footZ - 0.3 && z <= rp.hinge;
        /* Her rails: once the ramp is a step above the floor, nobody comes
         * on or off it over the side, and nobody walks its edge with their
         * head in the bay's wall. */
        if (inSpan && t >= 0.999 && rampSurface(z) > RAMP_STEP &&
            ((x > rp.x0 - HEAD_R && x < rp.x0 + rail) || (x > rp.x1 - rail && x < rp.x1 + HEAD_R))) return true;
        /* The ramp is somewhere to stand only when it is all the way down;
         * on it, the bay overhead is open up into her airlock, and a head
         * that would not clear is stopped like anywhere else. */
        if (onRampAt(x, z)) return t < 0.999 || headroom(x, z) < CROUCH_CLEAR;   // nobody crawls up a ramp
        return clearAt(x, z) < CROUCH_CLEAR;
      }
    };
    var t1 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    field.ms = t1 - t0;
    d.outside = plan;
    return plan;
  }

  /* HER MEASURE FOR HER HANGAR (main.js, moved here 2026-11-03 so the
   * tests build the hangar the game builds): in her cockpit's metres, hull
   * box, the ramp's foot, the floor her gear stands on (the LIFTED ground,
   * hullFit) and how tall she is above it. `origin` is where her position
   * is, in the same metres (walk.js placeShip centres a sea pad's plan on
   * it, so the plan stands on the rig). */
  /* Through the exported object, not the closures: render.test.js stands
   * stubs in for Render.outsidePlan/shipInterior/hatchModel to put a ramp
   * on a hull that has none, and the copy of this in main.js it replaced
   * asked through Render.*, so a closure here would quietly ignore them
   * (the deck-hangar zoom test, 2026-11-03). */
  function hangarSpec(ship) {
    var X = global.Render || {};
    var d = (X.shipInterior || shipInterior)(ship), op = (X.outsidePlan || outsidePlan)(ship), hm = (X.hatchModel || hatchModel)(ship);
    if (!d || !d.plan.ramp || !op || !hm) return null;
    var at = (X.cockpitAt || cockpitAt)(ship) || [0, 0, 0], Lm = (X.hullLength || hullLength)(ship) * 1000, rp = d.plan.ramp;
    var hx0 = hm.lo[0] * Lm - at[0], hx1 = hm.hi[0] * Lm - at[0];
    var hz0 = hm.lo[2] * Lm - at[2], hz1 = hm.hi[2] * Lm - at[2], top = hm.hi[1] * Lm - at[1];
    var foot = { x: (rp.x0 + rp.x1) / 2, z: op.footZ };
    return { box: [Math.min(hx0, foot.x - 1.5), Math.min(hz0, foot.z - 2.5), Math.max(hx1, foot.x + 1.5), hz1],
             hull: [hx0, hz0, hx1, hz1], height: top - op.floorY, foot: foot, gy: op.floorY,
             origin: { x: -at[0], z: -at[2] } };
  }

  /* A patch of ground under her, so there is something to stand on even
   * where the world's own surface is drawn coarse: a disc of her world's
   * colour, in her frame, at her gear's foot. Unit length, like her. */
  var GROUND_TINT = { terran: '#4f6a3a', ocean: '#3e5f45', desert: '#a8865a', tundra: '#8e9a9a',
                      rocky: '#6d655c', iceball: '#c9d6de', molten: '#4a2a22' };
  function groundPatch(ship) {
    var f = hullFit(ship);
    if (!f) return null;
    var body = ship.landedOn, type = body && (body.type || body.worldType);
    var key = (type || 'rocky') + '|' + f.ground;
    ship._groundPatch = ship._groundPatch || {};
    if (ship._groundPatch[key]) return ship._groundPatch[key];
    /* Out to a few kilometres — near enough the horizon from a standing
     * eye that the world's own coarse surface is never what you stand on. */
    var Lm = hullLength(ship) * 1000, R0 = 3000 / Lm, y = (f.ground - 0.02) / Lm;
    var col = GROUND_TINT[type] || GROUND_TINT.rocky, m = { v: [[0, y, 0]], f: [], c: [] };
    var N = 32;
    for (var i = 0; i < N; i++) {
      var t = i / N * Math.PI * 2;
      m.v.push([Math.cos(t) * R0, y, Math.sin(t) * R0]);
    }
    for (i = 0; i < N; i++) { m.f.push([0, 1 + (i + 1) % N, 1 + i]); m.c.push(col); }
    ship._groundPatch[key] = m;
    return m;
  }

  /* YOUR CRAFT IN THE HANGAR (Carrier, 2026-10-25). Astra chose "your
   * parked craft": the small ships of your fleet berthed at the port she
   * is docked at stand on her pads, in their own models, at their own
   * length. Up to one per pad; the rest are elsewhere in the bay, as far as
   * anybody can see. */
  var CRAFT_LEN = 16;          // m, an S hull nose to tail
  function hangarCraft(ship, plan) {
    var G = global.Game, out = [];
    if (!G || !G.fleet || !ship.docked) return out;
    var HL = global.Combat && global.Combat.HULLS;
    var here = G.fleet.filter(function (r) {
      var h = HL && HL[r.hullId];
      return r.port === ship.docked && h && h.size === 'S';
    });
    here.slice(0, plan.hangarPads.length).forEach(function (r, i) {
      var h = HL[r.hullId], lib = libHull(HULL_ASSIGN[h.mesh] || HULL_ASSIGN.courier);
      if (!lib) return;
      if (!lib._hangar) {
        /* Unit-length model to metres, and stood on its gear: lifted so
         * its lowest point is on the deck. */
        var minY = Infinity;
        lib.v.forEach(function (v) { if (v[1] < minY) minY = v[1]; });
        lib._hangar = { v: lib.v.map(function (v) { return [v[0] * CRAFT_LEN, (v[1] - minY) * CRAFT_LEN, v[2] * CRAFT_LEN]; }),
                        f: lib.f, c: lib.c };
      }
      var pd = plan.hangarPads[i];
      out.push({ mesh: lib._hangar, off: [pd.x, plan.deckY.hangar, pd.z] });
    });
    return out;
  }

  /* Queue the room for this frame. `opts.seat` draws the pilot's seat —
   * only while you are out of it; seated, you are where it is, and its
   * back would stand between you and the rear screens. Door leaves are
   * moved by however far each door's `open` has eased (shipdeck.js). */
  function queueCockpitRoom(cam, ship, opts) {
    opts = opts || {};
    var d = shipInterior(ship), SD = global.ShipDeck;
    if (!d) return false;
    var frame = { pos: ship.pos, right: ship.right, up: ship.up, fwd: ship.fwd };
    var parts = [];
    d.plan.doors.forEach(function (door) {
      var lv = d.meshes.leaves[door.id];
      if (!lv) return;
      var tr = SD.leafTravel(door.open);
      /* Across the ship for a fore-and-aft wall; fore and aft for a door
       * in a side wall (the quarters'). */
      /* `yOff` is the door's deck below the bridge (shipdeck.js decks). */
      var dy = door.yOff || 0;
      if (door.axis === 'x') parts.push({ mesh: lv[0], off: [0, dy, -tr] }, { mesh: lv[1], off: [0, dy, tr] });
      else parts.push({ mesh: lv[0], off: [-tr, dy, 0] }, { mesh: lv[1], off: [tr, dy, 0] });
    });
    /* The airlock's lamp: green when the airlock is at the outside's
     * pressure and the way out is yours (airlock.js). Its ramp, at however
     * far down it is, in the same metres as the room. */
    var AL = global.Airlock, base = ship._base || ship;
    parts.push({ mesh: (AL && base.airlock ? AL.lampGreen(base) : false) ? d.meshes.lampOk : d.meshes.lampNo });
    /* Not from outside her (noPortals): there her exterior model draws the
     * ramp, and drawing it a second time here, in the room's metres, put
     * two copies of every rail in the same place - the shimmer Astra saw
     * on the ramp (2026-10-31). */
    if (d.plan.ramp && SD.rampMesh && !opts.noPortals) {
      var rt = Math.round(Math.max(0, Math.min(1, (base.airlock && base.airlock.ramp) || 0)) * 20) / 20;
      d.rampMeshes = d.rampMeshes || {};
      if (!d.rampMeshes[rt]) {
        var rfy = d.plan.decks ? d.plan.decks.main.floorY : d.plan.floorY;
        d.rampMeshes[rt] = SD.rampMesh(d.plan.palette || {}, d.plan.ramp, rfy, rt);
      }
      parts.push({ mesh: d.rampMeshes[rt] });
    }
    /* A decked hull's lift car and tram, where main.js last put them
     * (`plan.live`), and your small craft parked in a Carrier's hangar. */
    if (d.meshes.car) {
      var live = d.plan.live || {};
      var carY = live.carY !== undefined ? live.carY : d.plan.deckY.bridge;
      parts.push({ mesh: d.meshes.car.body, off: [0, carY, 0] });
      if (live.moving) parts.push({ mesh: d.meshes.car.doors, off: [0, carY, 0] });
      var tz = live.tramZ !== undefined ? live.tramZ : d.plan.tram.a;
      parts.push({ mesh: d.meshes.tram, off: [0, d.plan.deckY.junction, tz] });
      if (d.plan.hangarPads) hangarCraft(ship, d.plan).forEach(function (pc) { parts.push(pc); });
    }
    if (opts.seat) parts.push({ mesh: d.meshes.seat });
    /* An S cockpit's second seat and medical kit (shipdeck.js, 2026-10-25):
     * always there, seated or not. */
    if (d.meshes.fittings) parts.push({ mesh: d.meshes.fittings });
    /* From outside her (2026-10-26) there is no glass to see the world
     * through, only her own skin, so the panes are not drawn. */
    var ok = global.GLWorld.queueCockpit(cam, frame, opts.noPortals ? null : d.meshes.portals, d.meshes.room, parts, M);
    if (ok) { ROOM_QUEUED.ship = ship; ROOM_QUEUED.cam = cam; }
    return ok;
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
  /* THE GLOW IS THE EXPENSIVE PART OF THE GLASS. shadowBlur is recorded in
   * microseconds and rasterised later on the GPU, once per stroke — and with
   * the horizon in view the attitude ladder is a dozen long strokes across
   * the whole canopy. Measured 2026-10-15 on the Intel UHD 620: 31.6 fps
   * level, 56.4 with the blur off, and 60 looking straight down (where the
   * ladder folds away, which is why that view never showed it). A discrete
   * card pays a fraction of that, so the main.js option decides, and Auto
   * keeps the glow wherever the adapter is not integrated graphics. */
  var GLASS_GLOW = true;
  function setGlassGlow(on) { GLASS_GLOW = !!on; }

  /* ...AND THE LADDER IS WHERE NEARLY ALL OF IT WENT. Measured 2026-10-16
   * on the RX 540, inside Taolmai VII's ring at 1920 px: 22 fps with the
   * glow everywhere, 51 with it off, and 50 with it on everywhere EXCEPT
   * the attitude ladder and the bank scale (34 for the ladder alone). So
   * "a discrete card pays a fraction" above was wrong - it pays the same,
   * because the cost is long strokes, not the adapter. Those two are drawn
   * sharp; at canopy scale the halo on a thin dashed rung was invisible
   * anyway, and the text, reticles and target boxes keep theirs. */
  function unblurred(fn) {
    return function (ctx) {
      var b = ctx.shadowBlur;
      ctx.shadowBlur = 0;
      try { return fn.apply(this, arguments); } finally { ctx.shadowBlur = b; }
    };
  }

  function glassBegin(ctx, aperture) {
    ctx.save();
    if (aperture) {
      ctx.beginPath();
      tracePath(ctx, aperture);
      ctx.clip();
    }
    ctx.globalCompositeOperation = 'lighter';
    if (GLASS_GLOW) {
      ctx.shadowColor = 'rgba(120,255,205,0.55)';
      ctx.shadowBlur = 6;
    }
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
    if (GLASS_GLOW) {
      ctx.shadowColor = color;
      ctx.shadowBlur = 5;
    }
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

  /* ---- RE-ENTRY PLASMA, around the ship ----------------------------------
   * The hull shader already burns the windward faces (gl.js, uGlow), and
   * that on its own did not read: a tint on a few triangles is invisible
   * from any distance, missing entirely on the 2D fallback, and — since
   * the heat lives on the faces meeting the air — mostly on the side of
   * the ship facing away from a chase camera. What a re-entry LOOKS like
   * is a sheath of gas around the ship and a wake of it streaming off the
   * back, and that is what this draws.
   *
   * Screen space, additive, like the plumes and the shield: it is light,
   * it has no surface. Three layers, all driven by the two numbers the
   * flight model already publishes — ship.reentryGlow (0..1, from the
   * Sutton-Graves flux) and ship.windDir (which way the ship is moving
   * through the air):
   *
   *   SHEATH — a glow wrapped round the hull, pushed toward the bow.
   *   BOW    — the hot, whiter cap where the shock stands off the nose.
   *   WAKE   — a tapering tail streaming back along the flow, with
   *            flickering streamers so it moves like gas, not a decal.
   *
   * The colour runs the same way the hull glow does — dull red at a
   * touch, orange, whitening as it becomes dangerous — so the hull and
   * its sheath always agree about how bad it is. */
  function plasmaRGB(g, k) {
    var t = Math.max(0, Math.min(1, g * (k || 1)));
    var r = 255;
    var gg = Math.round(48 + 170 * Math.pow(t, 1.3));
    var b = Math.round(14 + 150 * Math.pow(t, 2.6));
    return r + ',' + gg + ',' + b;
  }

  /* How much of the effect to show at all. The flux-derived glow starts
   * tiny and the first hint of air should still be SEEN — a ship grazing
   * the top of an atmosphere is exactly when a pilot wants telling — so the
   * visibility ramps in fast and the heat then drives size and colour. */
  function plasmaVis(g) { return Math.min(1, Math.max(0, (g - 0.02) / 0.16)); }

  function drawReentryPlasma(ctx, cam, frame, lengthKm, glow, wind, tSec) {
    if (!(glow > 0.02) || !wind) return false;
    var c = cam.project(frame.pos);
    if (!c) return false;
    var vis = plasmaVis(glow);
    var lenPx = lengthKm * c.scale;
    var R = Math.max(7, lenPx * 0.55);
    if (R > 2400) return false;                   // the eye is inside it
    var bowW = cam.project(V.addScaled(frame.pos, wind, lengthKm * 0.5));
    var tailW = cam.project(V.addScaled(frame.pos, wind, -lengthKm * (0.8 + 1.8 * glow)));
    var flick = 0.86 + 0.09 * Math.sin(tSec * 31.7) + 0.05 * Math.sin(tSec * 13.3);
    var col = plasmaRGB(glow), hot = plasmaRGB(glow, 1.7);
    var bx = bowW ? bowW.x : c.x, by = bowW ? bowW.y : c.y;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    /* WAKE: a comet tail of soft blobs shrinking back along the flow.
     * Blobs, not a polygon: a filled wedge with hard sides read as a cone
     * of light — a searchlight — where gas should fray at the edges. The
     * wake stays orange even when the bow is white-hot; only the shock
     * itself is that hot. */
    var wake = plasmaRGB(glow * 0.6);
    if (tailW) {
      var dx = tailW.x - bx, dy = tailW.y - by;
      var L = Math.hypot(dx, dy);
      if (L > 1) {
        var nx = -dy / L, ny = dx / L;
        var w0 = R * (0.55 + 0.25 * glow);
        var K = 9;
        for (var k = 0; k < K; k++) {
          var t = (k + 0.5) / K;
          var wob = Math.sin(tSec * (9 + k * 1.7) + k * 1.9) * 0.08 * w0;
          var px = bx + dx * t + nx * wob, py = by + dy * t + ny * wob;
          var pr = w0 * (1.05 - 0.75 * t);
          var pa = 0.34 * vis * flick * Math.pow(1 - t, 1.2);
          var pg = ctx.createRadialGradient(px, py, 0, px, py, pr);
          pg.addColorStop(0, 'rgba(' + wake + ',' + pa.toFixed(3) + ')');
          pg.addColorStop(1, 'rgba(' + wake + ',0)');
          ctx.fillStyle = pg;
          ctx.beginPath(); ctx.arc(px, py, pr, 0, Math.PI * 2); ctx.fill();
        }

        /* Streamers: a few thin ribbons peeling off the hull edges and
         * curling as they go, each on its own flicker. One stroke style
         * for the lot. */
        var n = Math.round(2 + 5 * glow);
        ctx.lineCap = 'round';
        ctx.lineWidth = Math.max(1, R * 0.028);
        ctx.strokeStyle = 'rgba(' + col + ',' + (0.30 * vis).toFixed(3) + ')';
        ctx.beginPath();
        for (var i = 0; i < n; i++) {
          var side = n > 1 ? (i / (n - 1)) * 2 - 1 : 0;
          var ph = tSec * (6 + i * 1.37) + i * 2.3;
          var reach = 0.30 + 0.40 * (0.5 + 0.5 * Math.sin(ph * 0.61 + i));
          var curl = (Math.sin(ph) * 0.35 + 0.25) * w0;
          var sx0 = c.x + nx * w0 * side * 0.7, sy0 = c.y + ny * w0 * side * 0.7;
          var ex = bx + dx * reach + nx * w0 * side * 0.3;
          var ey = by + dy * reach + ny * w0 * side * 0.3;
          ctx.moveTo(sx0, sy0);
          ctx.quadraticCurveTo((sx0 + ex) / 2 + nx * curl * side, (sy0 + ey) / 2 + ny * curl * side, ex, ey);
        }
        ctx.stroke();
      }
    }

    // SHEATH: wrapped round the hull, leaning toward the bow.
    var sx = (c.x * 2 + bx) / 3, sy = (c.y * 2 + by) / 3;
    var SR = R * (1.05 + 0.35 * glow);
    var sg = ctx.createRadialGradient(sx, sy, SR * 0.2, sx, sy, SR);
    sg.addColorStop(0, 'rgba(' + col + ',' + (0.42 * vis * flick).toFixed(3) + ')');
    sg.addColorStop(0.65, 'rgba(' + col + ',' + (0.16 * vis * flick).toFixed(3) + ')');
    sg.addColorStop(1, 'rgba(' + col + ',0)');
    ctx.fillStyle = sg;
    ctx.beginPath(); ctx.arc(sx, sy, SR, 0, Math.PI * 2); ctx.fill();

    // BOW: the shock cap standing off the nose — the hottest thing here.
    if (bowW) {
      var BR = R * (0.35 + 0.30 * glow);
      var bg = ctx.createRadialGradient(bx, by, 0, bx, by, BR);
      bg.addColorStop(0, 'rgba(' + hot + ',' + Math.min(0.9, 0.9 * vis * flick).toFixed(3) + ')');
      bg.addColorStop(0.45, 'rgba(' + col + ',' + (0.40 * vis).toFixed(3) + ')');
      bg.addColorStop(1, 'rgba(' + col + ',0)');
      ctx.fillStyle = bg;
      ctx.beginPath(); ctx.arc(bx, by, BR, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    return true;
  }

  var Render = {
    Camera: Camera,
    M: M,
    CANOPY_Z: CANOPY_Z,
    APERTURE: APERTURE,
    cockpitSpec: cockpitSpec, canopySegments: canopySegments,
    cockpitGeometry: cockpitGeometry, shipInterior: shipInterior,
    queueCockpitRoom: queueCockpitRoom, cockpitGpu: cockpitGpu,
    greebleRegions: greebleRegions, greebleSurface: greebleSurface,
    /* A switch for comparing the GPU room with the 2D cockpit it replaced. */
    setCockpitRoom: function (on) { COCKPIT_ROOM_ON = !!on; },
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
    camDir: camDir,
    camEye: camEye,
    camAngles: camAngles,
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
    mfdBegin: mfdBegin, mfdDue: mfdDue, mfdReuse: mfdReuse,
    mfdEnd: mfdEnd,
    glassBegin: glassBegin,
    setGlassGlow: setGlassGlow,
    greebleLayout: greebleLayout,
    greebleReadings: greebleReadings,
    GREEBLE_HULLS: GREEBLE_HULLS,
    glassEnd: glassEnd,
    drawProjectionWash: drawProjectionWash,
    drawHyperspace: drawHyperspace,
    drawCruiseWarp: drawCruiseWarp,
    cruiseSky: cruiseSky, starTemp: starTemp, cruiseTrails: cruiseTrails,
    cruiseFrac: cruiseFrac, skyColour: skyColour,
    CRUISE_SKY_BETA: CRUISE_SKY_BETA, CRUISE_TOP_BETA: CRUISE_TOP_BETA, C_KMS: C_KMS,
    hyperStars: hyperStars,
    hyperRadius: hyperRadius,
    drawHoloTarget: drawHoloTarget,
    drawHullModel: drawHullModel,
    drawStationModel: drawStationModel,
    drawSeaDomes: drawSeaDomes, seaPlatformMesh: seaPlatformMesh, seaPetalMesh: seaPetalMesh, seaPosts: seaPosts,
    SEA_DRUM_KM: SEA_DRUM_KM, SEA_PETALS: SEA_PETALS, SEA_PETAL_OPEN: SEA_PETAL_OPEN, SEA_MESH_SCALE: SEA_MESH_SCALE,
    berthDressing: berthDressing, berthAds: berthAds, adSlot: adSlot,
    ADS: ADS, AD_SECONDS: AD_SECONDS,
    drawPortDressing: drawPortDressing,
    drawStationLights: drawStationLights,
    drawStationOutworks: drawStationOutworks,
    stationOutworks: stationOutworks, hullReach: hullReach,
    drawPortLamps: drawPortLamps,
    drawPortDoors: drawPortDoors,
    /* How far a leaf slides, in PAD RADII, for anything that needs to
     * reason about the animation from outside. Derived now rather than
     * stored, because the doors follow the mouth. */
    doorTravel: function () { return mouthR() * DOOR_TRAVEL_MOUTHS; },
    APRON_R: APRON_R,
    portDressingMesh: portDressingMesh,
    portSignBoards: portSignBoards, signLines: signLines, signRight: signRight,
    lampSetFor: lampSetFor,
    drawExhaust: drawExhaust,
    drawShipExhaust: drawShipExhaust, nozzlesOf: nozzlesOf,
    drawWake: drawWake,
    lensImages: lensImages,
    lensSource: lensSource,
    tearScreen: tearScreen,
    makeBolt: makeBolt,
    boltLevel: boltLevel,
    tearBolts: tearBolts,
    drawBolts2D: drawBolts2D,
    BOLT_TINT_DEPART: BOLT_TINT_DEPART,
    BOLT_TINT_ARRIVE: BOLT_TINT_ARRIVE,
    WAKE_ARCS: WAKE_ARCS,
    WAKE_BOLTS: WAKE_BOLTS,
    wakeHash: wakeHash,
    boltPath: boltPath,
    DRIVE_SPEC: DRIVE_SPEC,
    paintMesh: paintMesh,
    armGrip: armGrip, drawArmCam: drawArmCam, drawTipCam: drawTipCam,
    barColour: barColour,
    crawlerPortKey: crawlerPortKey, crawlerPortLib: crawlerPortLib, CRAWLER_PORT_RADIUS_KM: CRAWLER_PORT_RADIUS_KM,
    drawHullPortrait: drawHullPortrait, hullPreviewMesh: hullPreviewMesh,
    faceMaterial: faceMaterial,
    shipMeshes: shipMeshes,
    libHull: libHull,
    gearPhase: gearPhase, gearPose: gearPose, gearBounds: gearBounds, gearMeshes: gearMeshes, gearExtend: gearExtend, GEAR_LIFT: GEAR_LIFT, gearTravelOf: gearTravelOf,
    hullIds: hullIds, assignHull: assignHull,
    HULL_ASSIGN: HULL_ASSIGN,
    hullSpan: hullSpan,
    libPort: libPort, portIds: portIds, reloadPorts: reloadPorts,
    portModelFor: portModelFor, STATION_MODELS: STATION_MODELS,
    portRole: portRole, assignPort: assignPort, PORT_ASSIGN: PORT_ASSIGN,
    portLivery: portLivery, ROLE_PATTERNS: ROLE_PATTERNS, PORT_HELD_BACK: PORT_HELD_BACK,
    prefetchPorts: prefetchPorts, portGeometryArrived: portGeometryArrived,
    setMoverRiders: setMoverRiders, moverPose: moverPose, splitMovers: splitMovers,
    drawPortCity: drawPortCity, citySpot: citySpot, cityFrame: cityFrame, splitCity: splitCity,
    citySite: citySite, cityBlocks: cityBlocks, cityParts: cityParts, cityLayout: cityLayout,
    cityDrawList: cityDrawList, cityPlace: cityPlace, citySizes: citySizes,
    _distPtSeg: distPtSeg, _distPtBox: distPtBox, _segHitsBox: segHitsBox,
    CITY_REACH: CITY_REACH, CITY_NEAR: CITY_NEAR,
    poolFor: poolFor, PORT_POOL: PORT_POOL,
    portClass: portClass, portSizeFor: portSizeFor,
    PORT_PATTERNS: PORT_PATTERNS, PORT_SIZE_CUTS: PORT_SIZE_CUTS,
    drawPortPart: drawPortPart, portSpins: portSpins,
    stationMeshes: stationMeshes,
    drawStationInterior: drawStationInterior,
    interiorBounds: interiorBounds,
    insideInterior: insideInterior,
    setIndoors: setIndoors,
    setCutaway: setCutaway,
    standTopKm: standTopKm,
    drawCutGreebles: drawCutGreebles,
    drawGroundSection: drawGroundSection,
    sectionWall: sectionWall,
    sectionBowl: sectionBowl,
    drawStationTraffic: drawStationTraffic,
    stationTenders: stationTenders,
    cutGreebleMesh: cutGreebleMesh,
    /* What the last rebuild cost and made — for profiling, not for play. */
    cutStats: function () {
      return { sites: CUT_LAST.sites, cand: CUT_LAST.cand, ms: CUT_LAST.ms,
               faces: CUT_LAST.faces };
    },
    setAccent: setAccent, accented: accented, accentSwap: accentSwap,
    drawContrail: drawContrail,
    portSolidity: portSolidity,
    clearRouteJob: clearRouteJob, routeDoors: routeDoors, portReady: portReady, berthDeckJob: berthDeckJob, berthDeckReady: berthDeckReady, trianglesJob: function (role) {
      return TRIDEX[role] !== undefined ? null : (TRI_JOBS[role] || (TRI_JOBS[role] = trianglesJob(role)));
    },
    portSections: portSections,
    leafHit: leafHit,
    sectionAt: sectionAt,
    roomAt: roomAt,
    partState: partState,
    portTriangles: portTriangles,
    portSegmentHit: portSegmentHit,
    clearRoute: clearRoute,
    routeLegClear: routeLegClear,
    berthDeck: berthDeck,
    berthBoom: berthBoom,
    boomLimit: boomLimit,
    portDoors: portDoors,
    openBucket: openBucket,
    apertureCutCount: function (role) { portDoors(role); return CUT_COUNT[role] || 0; },
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
    drawReentryPlasma: drawReentryPlasma, plasmaRGB: plasmaRGB, plasmaVis: plasmaVis,
    SHIELD_STANDOFF: SHIELD_STANDOFF, SHIELD_FLASH_LIFE: SHIELD_FLASH_LIFE,
    hullMuzzles: hullMuzzles, shipMuzzles: shipMuzzles,
    seatMuzzle: seatMuzzle,
    /* Exported for the same reason seatMuzzle is: the beam renderer lives in
     * main.js but the geometry of a tracer belongs with the rest of the
     * drawing maths, where it can be tested without a canvas. */
    boltSpan: boltSpan, boltRibbon: boltRibbon,
    BOLT_MIN_W: BOLT_MIN_W, BOLT_MAX_W: BOLT_MAX_W, BOLT_SEGS: BOLT_SEGS,
    SHIP_LEN: SHIP_LEN, TRUE_LEN: TRUE_LEN, hullLength: hullLength,
    BRIDGE: BRIDGE, bridgeSpec: bridgeSpec, bridgeFrame: bridgeFrame, bridgeCutMesh: bridgeCutMesh,
    hullFit: hullFit, cockpitAt: cockpitAt, rampExterior: rampExterior, hatchModel: hatchModel, hullSegmentHit: hullSegmentHit, hullSolidOf: hullSolidOf, hullFitter: hullFitter, outsidePlan: outsidePlan, hangarSpec: hangarSpec, groundPatch: groundPatch,
    OUTSIDE_CROUCH: OUTSIDE_CROUCH,
    drawAttitudeLadder: unblurred(drawAttitudeLadder),
    drawFlightPathMarker: drawFlightPathMarker,
    drawBankScale: unblurred(drawBankScale),
    drawHeadingTape: drawHeadingTape,
    drawAirData: drawAirData,
    facingInfo: facingInfo, drawFacingCue: drawFacingCue,
    airSpeedReadout: airSpeedReadout, altitudeReadout: altitudeReadout,
    vsReadout: vsReadout, airReadout: airReadout
  };

  global.Render = Render;
  if (typeof module !== 'undefined' && module.exports) module.exports = Render;
})(typeof window !== 'undefined' ? window : globalThis);
