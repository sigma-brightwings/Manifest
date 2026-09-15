/* cockpit.test.js — the canopy is real geometry, so its screen footprint is
 * something we can actually check rather than eyeball.
 *
 *     node test/cockpit.test.js
 *
 * This drives the REAL render.js rather than a copy of its constants. An
 * earlier version mirrored the camera and the cockpit numbers into the
 * test, which made it a test of the copy — the two could drift apart and
 * the suite would go on passing. render.js reads its dependencies off the
 * global object rather than requiring them, so loading vec3/rng/kepler
 * first is all the setup it needs.
 */
require('../src/vec3.js');
require('../src/rng.js');
require('../src/kepler.js');
var V = global.V;
var Render = require('../src/render.js');

var DEG = Math.PI / 180;
var pass = 0, fail = 0;
function check(n, c, d) { if (c) pass++; else { fail++; console.log('  FAIL  ' + n + (d ? '   ' + d : '')); } }

/* Build the test ship the way sim.js's orthonormalize does — right is
 * fwd x up, and up is then rebuilt from that. Writing the basis out by hand
 * is how the first version of this test ended up asserting the opposite
 * handedness to the engine and then "failing" on correct code. */
function makeFrame(fwd, up) {
  var f = V.norm(fwd);
  var r = V.norm(V.cross(f, up));
  return { pos: V.zero(), fwd: f, right: r, up: V.cross(r, f) };
}
var ship = makeFrame({ x: 0, y: 0, z: 1 }, { x: 0, y: 1, z: 0 });

function polyArea(p) {
  var a = 0;
  for (var i = 0; i < p.length; i++) { var j = (i + 1) % p.length; a += p[i].x * p[j].y - p[j].x * p[i].y; }
  return a / 2;
}
function bounds(p) { return Render.polyBounds(p); }

console.log('--- looking forward ---');
[[1920, 1080], [1280, 800], [1024, 768], [3840, 2160], [900, 1600]].forEach(function (dim) {
  var w = dim[0], h = dim[1], tag = w + 'x' + h;
  var cam = new Render.Camera();
  cam.buildCockpit(ship, w, h, { yaw: 0, pitch: 0 });

  var ap = Render.aperturePath(cam, ship);
  check(tag + ': the canopy projects', !!ap && ap.every(function (p) { return isFinite(p.x) && isFinite(p.y); }));
  if (!ap) return;
  var b = bounds(ap);

  // The boresight must be inside the window, or you are flying blind.
  check(tag + ': boresight is inside the window',
        b.minX < w / 2 && b.maxX > w / 2 && b.minY < h / 2 && b.maxY > h / 2);
  check(tag + ': hull is visible above the window', b.minY > 4, 'top at y=' + b.minY.toFixed(0));
  check(tag + ': hull is visible below the window', b.maxY < h - 4, 'bottom at y=' + b.maxY.toFixed(0));
  var frac = (b.h / h) * (Math.min(b.maxX, w) - Math.max(b.minX, 0)) / w;
  check(tag + ': the window is most of the view', frac > 0.35 && frac < 0.95,
        'covers ' + (frac * 100).toFixed(0) + '%');
  check(tag + ': aperture is a simple non-degenerate polygon', Math.abs(polyArea(ap)) > 1000);

  /* Dashboard panels: on screen, below the window, big enough to read. Only
   * the three on the forward arc — the two on the rear bulkhead are behind
   * the eye when you are facing front, which is the entire point of them. */
  Render.MFD_MOUNTS.filter(function (m) { return m.id.indexOf('rear') !== 0; }).forEach(function (slot) {
    var q = Render.clipProject(cam, Render.localPoly(ship, Render.mfdCorners(slot)));
    check(tag + ' ' + slot.id + ': panel projects', !!q);
    if (!q) return;
    var area = Math.abs(polyArea(q));
    check(tag + ' ' + slot.id + ': panel is large enough to read', area > 240, 'area ' + area.toFixed(0) + 'px2');
    /* The panels stand up off the console and reach into the bottom of the
     * window on purpose — that is where a head-down display lives, and it
     * is the only way to see one at all with the eye this close to the
     * dash. What must stay true is that they are in the BOTTOM of the view:
     * below the boresight, below the middle of the glass, and never so far
     * down that they have left the screen. */
    var top = Math.min.apply(null, q.map(function (p) { return p.y; }));
    var bot = Math.max.apply(null, q.map(function (p) { return p.y; }));
    check(tag + ' ' + slot.id + ': panel sits in the lower view', top > b.cy,
          'top ' + top.toFixed(0) + ' vs window middle ' + b.cy.toFixed(0));
    check(tag + ' ' + slot.id + ': panel is not below the screen', top < h,
          'top ' + top.toFixed(0) + ' of ' + h);
    check(tag + ' ' + slot.id + ': panel does not swallow the window',
          bot - top < h * 0.42, ((bot - top) / h * 100).toFixed(0) + '% of the view');
  });
});

/* ---- the landing window ------------------------------------------------
 * Glass in the floor is only worth having if you can actually see out of
 * it: it has to be BELOW the canopy (or it is just more canopy), it has to
 * line up with the slot cut in the console (or you are looking at the
 * underside of the dashboard), and looking down at it must be within the
 * pitch the neck is allowed. All three are geometry, so all three are
 * checkable. */
console.log('--- the landing window ---');
(function () {
  var w = 1600, h = 900;
  var cam = new Render.Camera();
  cam.buildCockpit(ship, w, h, { yaw: 0, pitch: 0 });

  var floor = Render.clipProject(cam, Render.localPoly(ship, Render.FLOOR_WINDOW));
  var ap = Render.aperturePath(cam, ship);
  check('the floor window is somewhere on screen', !!floor && !!ap);
  if (!floor || !ap) return;
  var fb = Render.polyBounds(floor), ab = Render.polyBounds(ap);
  check('it sits below the canopy, not inside it', fb.minY > ab.maxY,
        'floor top ' + fb.minY.toFixed(0) + ' vs canopy bottom ' + ab.maxY.toFixed(0));
  check('it is ahead of you, not off to one side',
        Math.abs(fb.cx - w / 2) < w * 0.05, 'centre ' + fb.cx.toFixed(0) + ' of ' + w);

  /* The slot in the console has to be at least as wide as the pane, or the
   * dashboard covers the edges of the view you cut it for. */
  var slot = Render.clipProject(cam, Render.localPoly(ship, [
    Render.dashPoint(Render.SLOT_S[0], 0.04), Render.dashPoint(Render.SLOT_S[1], 0.04),
    Render.dashPoint(Render.SLOT_S[1], 1), Render.dashPoint(Render.SLOT_S[0], 1)]));
  check('the console is cut away in front of it', !!slot);
  if (slot) {
    var sb = Render.polyBounds(slot);
    check('and the cut is wide enough to see the whole pane through',
          sb.minX <= fb.minX + 2 && sb.maxX >= fb.maxX - 2,
          'slot ' + sb.minX.toFixed(0) + '..' + sb.maxX.toFixed(0) +
          ' vs pane ' + fb.minX.toFixed(0) + '..' + fb.maxX.toFixed(0));
  }

  /* And you can look at it: the steepest corner of the pane must be inside
   * the pitch clamp, or the window exists at an angle the neck cannot
   * reach. The clamp lives in main.js; 1.15 rad is the number it uses. */
  var steepest = 0;
  Render.FLOOR_WINDOW.forEach(function (p) {
    steepest = Math.max(steepest, Math.atan2(-p[1], p[2]));
  });
  check('looking down far enough to use it is within the neck clamp', steepest < 1.15,
        (steepest / DEG).toFixed(1) + '° down');
})();

console.log('--- the head turns, the ship does not ---');
(function () {
  var w = 1600, h = 900;
  var cam = new Render.Camera();

  // Sign conventions, asserted rather than assumed.
  cam.buildCockpit(ship, w, h, { yaw: 0.5, pitch: 0 });
  check('positive yaw looks right', V.dot(cam.f, ship.right) > 0.4, V.dot(cam.f, ship.right).toFixed(3));
  cam.buildCockpit(ship, w, h, { yaw: -0.5, pitch: 0 });
  check('negative yaw looks left', V.dot(cam.f, ship.right) < -0.4, V.dot(cam.f, ship.right).toFixed(3));
  cam.buildCockpit(ship, w, h, { yaw: 0, pitch: 0.5 });
  check('positive pitch looks up', V.dot(cam.f, ship.up) > 0.4, V.dot(cam.f, ship.up).toFixed(3));
  cam.buildCockpit(ship, w, h, { yaw: 0, pitch: -0.5 });
  check('negative pitch looks down', V.dot(cam.f, ship.up) < -0.4, V.dot(cam.f, ship.up).toFixed(3));

  // Looking around must never move the ship, and must never skew the basis.
  var badBasis = 0, movedShip = 0;
  var fwd0 = V.clone(ship.fwd);
  for (var y = -1.85; y <= 1.85; y += 0.11) {
    for (var p = -1.15; p <= 1.15; p += 0.3) {
      cam.buildCockpit(ship, w, h, { yaw: y, pitch: p });
      if (Math.abs(V.len(cam.f) - 1) > 1e-9 || Math.abs(V.len(cam.r) - 1) > 1e-9 ||
          Math.abs(V.len(cam.u) - 1) > 1e-9) badBasis++;
      if (Math.abs(V.dot(cam.f, cam.r)) > 1e-9 || Math.abs(V.dot(cam.f, cam.u)) > 1e-9 ||
          Math.abs(V.dot(cam.r, cam.u)) > 1e-9) badBasis++;
      if (V.dist(ship.fwd, fwd0) > 1e-12) movedShip++;
    }
  }
  check('the camera basis stays orthonormal at every head angle', badBasis === 0, badBasis + ' bad');
  check('looking around never touches the ship attitude', movedShip === 0, movedShip + ' bad');

  // Pitching straight up should not roll the horizon: the camera's right
  // vector must stay level with the ship's own right.
  cam.buildCockpit(ship, w, h, { yaw: 0, pitch: 1.1 });
  check('pitching up does not roll the view', Math.abs(V.dot(cam.r, ship.up)) < 1e-9);
})();

console.log('--- geometry survives being looked away from ---');
(function () {
  var w = 1600, h = 900;
  var cam = new Render.Camera();
  var nan = 0, huge = 0, frames = 0, sawSide = 0, sawFront = 0;

  for (var y = -1.85; y <= 1.85; y += 0.08) {
    for (var p = -1.15; p <= 1.15; p += 0.25) {
      cam.buildCockpit(ship, w, h, { yaw: y, pitch: p });
      frames++;
      var set = Render.apertureSet(cam, ship);
      for (var i = 0; i < set.length; i++) {
        if (set[i].id === 'front') sawFront++;
        if (set[i].id !== 'front') sawSide++;
        var pts = set[i].pts;
        for (var k = 0; k < pts.length; k++) {
          if (!isFinite(pts[k].x) || !isFinite(pts[k].y)) nan++;
          if (Math.abs(pts[k].x) > 2.0001e4 || Math.abs(pts[k].y) > 2.0001e4) huge++;
        }
      }
      // The interior must clip cleanly too — these are the polygons that
      // straddle the eye plane at wide angles.
      for (i = 0; i < Render.INTERIOR.length; i++) {
        var poly = Render.clipProject(cam, Render.localPoly(ship, Render.INTERIOR[i].pts));
        if (!poly) continue;
        for (k = 0; k < poly.length; k++) {
          if (!isFinite(poly[k].x) || !isFinite(poly[k].y)) nan++;
        }
      }
    }
  }
  check('no NaN vertices at any head angle', nan === 0, nan + ' bad (' + frames + ' angles)');
  check('no unclamped coordinates', huge === 0, huge + ' bad');
  check('the forward canopy is visible from most angles', sawFront > frames * 0.5,
        sawFront + ' of ' + frames);
  check('the side windows come into view when you turn', sawSide > 0, sawSide + ' sightings');

  // Turned right round to the shoulder, the windscreen must be gone from
  // the view — either dropped as off screen, or at least not overlapping it.
  cam.buildCockpit(ship, w, h, { yaw: 1.8, pitch: 0 });   // main.js clamps at 1.85
  var far = Render.apertureSet(cam, ship);
  var frontStill = far.filter(function (s) { return s.id === 'front'; })[0];
  check('looking over your shoulder loses the windscreen', !frontStill,
        frontStill ? JSON.stringify(Render.polyBounds(frontStill.pts)) : '');
  check('and leaves a side window in view',
        far.some(function (s) { return s.id !== 'front'; }), far.map(function (s) { return s.id; }).join(','));
})();

console.log('--- near-plane clipping ---');
(function () {
  var cam = new Render.Camera();
  cam.buildCockpit(ship, 1600, 900, { yaw: 0, pitch: 0 });

  // A quad straddling the eye plane must come back clipped, not inverted.
  var straddle = Render.localPoly(ship, [
    [-1, 0, 1.0], [1, 0, 1.0], [1, 0, -1.0], [-1, 0, -1.0]]);
  var clipped = Render.clipProject(cam, straddle);
  check('a straddling polygon clips rather than inverting', !!clipped && clipped.length >= 3,
        clipped ? clipped.length + ' vertices' : 'null');
  if (clipped) {
    var ok = clipped.every(function (p) { return isFinite(p.x) && isFinite(p.y); });
    check('and every surviving vertex is finite', ok);
  }

  // Entirely behind the eye: nothing at all, rather than a mirror image.
  var behind = Render.localPoly(ship, [
    [-1, 0, -1.0], [1, 0, -1.0], [1, 0, -2.0], [-1, 0, -2.0]]);
  check('a polygon wholly behind the eye is dropped', Render.clipProject(cam, behind) === null);
})();

console.log('--- glass ---');
(function () {
  // A stub context, only enough for drawGlass to run against.
  var calls = 0;
  function noop() { calls++; }
  var ctx = {
    save: noop, restore: noop, beginPath: noop, closePath: noop, moveTo: noop,
    lineTo: noop, quadraticCurveTo: noop, arc: noop, clip: noop, fill: noop,
    stroke: noop, fillRect: noop, ellipse: noop,
    createLinearGradient: function () { return { addColorStop: noop }; },
    createRadialGradient: function () { return { addColorStop: noop }; }
  };
  var cam = new Render.Camera();
  cam.buildCockpit(ship, 1600, 900, { yaw: 0, pitch: 0 });
  var set = Render.apertureSet(cam, ship);

  var threw = null;
  try {
    Render.drawGlass(ctx, set, 1600, 900, {});
    Render.drawGlass(ctx, set, 1600, 900, { starScreen: { x: 800, y: 400 }, starVisible: true });
    Render.drawGlass(ctx, [], 1600, 900, {});
    Render.drawGlass(ctx, null, 1600, 900, {});
  } catch (e) { threw = e; }
  check('glass renders with and without a star in the window', !threw, threw && threw.message);
  check('glass actually drew something', calls > 20, calls + ' calls');

  /* The scratches belong to the canopy, not to the frame: they must be the
   * same marks every time or the window looks like it is being sandblasted
   * continuously. */
  var before = calls;
  Render.drawGlass(ctx, set, 1600, 900, {});
  var a = calls - before;
  before = calls;
  Render.drawGlass(ctx, set, 1600, 900, {});
  check('the same canopy draws the same marks every frame', calls - before === a);
})();

console.log('--- the near plane sits inside the console ---');
(function () {
  var cam = new Render.Camera();
  cam.buildCockpit(ship, 1600, 900, { yaw: 0, pitch: 0 });
  var deepest = Infinity;
  var near = Render.localPoly(ship, [Render.dashPoint(0, 1), Render.dashPoint(1, 1)]);
  for (var i = 0; i < near.length; i++) {
    var p = cam.project(near[i]);
    if (p) deepest = Math.min(deepest, p.depth);
  }
  check('the nearest cockpit surface is in front of the clip plane',
        deepest > Render.NEAR_CLIP * 1.5,
        deepest.toExponential(2) + ' km vs clip ' + Render.NEAR_CLIP.toExponential(2));
})();

/* The bug this catches, in one sentence: a beam drawn from ship.pos starts
 * EIGHT CENTIMETRES BEHIND the pilot's eye, and projecting a point at a
 * depth of about zero divides by about zero — so the origin flew off toward
 * infinity and the beam swept in sideways across the canopy instead of
 * running down the nose. Nothing in the suite could see it, because the
 * tests are blind to layout and this one was reported by looking at it.
 *
 * It is checkable, though, and this is the check: every muzzle must project
 * in FRONT of the near plane, from the seat, with the head turned or not. */
console.log('--- the guns are in front of the pilot ---');
(function () {
  var Combat = require('../src/combat.js');
  var looks = [{ yaw: 0, pitch: 0 },
               { yaw: 0.8, pitch: 0 },       // head hard right
               { yaw: -0.8, pitch: 0 },
               { yaw: 0, pitch: 0.5 }];      // and up

  var keys = Combat.slotKeys(ship).filter(function (k) {
    return Combat.slotType(k) === 'hardpoint';
  });
  check('the hull has hardpoints to hang guns on', keys.length >= 2, keys.join(','));

  looks.forEach(function (look) {
    var cam = new Render.Camera();
    cam.buildCockpit(ship, 1600, 900, look);
    var tag = 'yaw ' + look.yaw + ' pitch ' + look.pitch;
    keys.forEach(function (k, n) {
      var world = Combat.muzzleWorld(ship, Combat.muzzleOf(ship, k));
      var p = cam.project(world);
      check(tag + ': muzzle ' + n + ' is in front of the eye', !!p,
            'projected null — behind the camera');
      if (p) {
        check(tag + ': muzzle ' + n + ' is clear of the near plane',
              p.depth > Render.NEAR_CLIP * 1.5,
              p.depth.toExponential(2) + ' km vs clip ' + Render.NEAR_CLIP.toExponential(2));
        /* The real symptom was a coordinate in the tens of thousands, from
         * flen divided by a depth of nothing. Anything on the canvas at all
         * would have been fine; this is the assertion that would have
         * failed. */
        check(tag + ': muzzle ' + n + ' projects somewhere on the canvas',
              Math.abs(p.x) < 20000 && Math.abs(p.y) < 20000,
              p.x.toFixed(0) + ',' + p.y.toFixed(0));
      }
    });
  });

  /* And the muzzles are actually apart, so a group firing together draws
   * lines that converge instead of one line several times over. */
  var a = Combat.muzzleOf(ship, keys[0]), b = Combat.muzzleOf(ship, keys[1]);
  check('two hardpoints are on opposite sides of the axis', a.r * b.r < 0,
        a.r.toFixed(5) + ' vs ' + b.r.toFixed(5));
  check('and the muzzles sit forward of the seat', a.f > 0 && b.f > 0);

  /* Documenting the original defect so nobody reintroduces it: the ship's
   * own origin is NOT a place you can draw from in the cockpit. */
  var camF = new Render.Camera();
  camF.buildCockpit(ship, 1600, 900, { yaw: 0, pitch: 0 });
  check('the ship origin itself is behind the eye — which is why beams moved',
        camF.project(ship.pos) === null);
})();

console.log('--- the eye never goes under the floor ---');
(function () {
  /* Astra, in the exterior view at a berth: "we're under the deck."
   *
   * Two things had to be true at once for that to surface. berthRoom used
   * to hand the camera clamp the anchor box, whose floor is a hundred
   * metres inside the plating (fixed in sim.js, swept in berths.test.js);
   * and the hull floated eighty metres up on a standoff that scaled with
   * the station, so a short boom pitched down spent its length in open
   * air. Park the ship properly on its deck, six metres up, and ANY
   * downward pitch is through the floor on the first metre of boom.
   *
   * The fix is a clamp on the AIM rather than on the length, because
   * shortening the boom to keep the eye up is the failure the hangar clamp
   * already exists to prevent — the camera welded to the hull, plating
   * filling the screen. Render.pitchAboveFloor is that clamp, and it is
   * pure geometry, so it is swept here rather than sampled at one angle in
   * a running game: a clamp on an angle is exactly the kind of thing that
   * works dead ahead and fails at three o'clock.
   *
   * `up` is the BAY's, not the world's — a station's model +z is its orbit
   * normal — so the sweep runs several of them, including the two that
   * break a naive implementation: straight world up, where phi is a right
   * angle, and one lying in the yaw plane, where it is zero. */
  var UPS = [
    { x: 0, y: 0, z: 1 },                      // world up: phi = +90 degrees
    { x: 1, y: 0, z: 0 },                      // in the yaw plane: phi = 0
    { x: 0, y: 1, z: 0 },
    V.norm({ x: 0.3, y: -0.6, z: 0.74 }),
    V.norm({ x: -0.8, y: 0.1, z: -0.59 })      // a bay hanging upside down
  ];
  var above = 0.0064, margin = 0.002;          // km: six metres up, two of air
  var sampled = 0, under = 0, moved = 0, needless = 0, worst = Infinity;
  UPS.forEach(function (up) {
    for (var dist = 0.004; dist < 2; dist *= 3.1) {
      for (var yaw = 0; yaw < 6.28; yaw += 0.41) {
        for (var pitch = -1.55; pitch < 1.56; pitch += 0.13) {
          sampled++;
          var out = Render.pitchAboveFloor(yaw, pitch, dist, up, above, margin);
          var cp = Math.cos(out), sp = Math.sin(out);
          var d = { x: cp * Math.cos(yaw), y: cp * Math.sin(yaw), z: sp };
          var h = above + dist * V.dot(d, up);
          if (h < worst) worst = h;
          /* A hair of slack for the float: the clamp lands the eye exactly
           * on the margin, which is where equality lives. */
          if (h < margin - 1e-9) under++;

          /* And it only moves when it has to. A camera that quietly
           * re-aims itself on an angle that was already fine is a camera
           * fighting the player's hand. */
          var cp0 = Math.cos(pitch), sp0 = Math.sin(pitch);
          var d0 = { x: cp0 * Math.cos(yaw), y: cp0 * Math.sin(yaw), z: sp0 };
          var h0 = above + dist * V.dot(d0, up);
          if (out !== pitch) moved++;
          if (h0 >= margin && out !== pitch) needless++;
        }
      }
    }
  });
  console.log('  ' + sampled + ' aims across five floor normals; ' + moved +
              ' needed moving, lowest eye ' + (worst * 1000).toFixed(2) + ' m');
  check('no aim leaves the eye under the floor', under === 0,
        under + ' of ' + sampled);
  check('and an aim that already cleared is left alone', needless === 0,
        needless + ' moved for nothing');
  check('the sweep actually exercised the clamp', moved > sampled * 0.05,
        moved + ' of ' + sampled + ' clamped');

  /* A boom short enough that even straight down clears the floor is not
   * clamped at all, which is the degenerate case the acos bound has to
   * get right rather than special-case. */
  var tiny = Render.pitchAboveFloor(0.9, -1.5, 0.0005, { x: 0, y: 0, z: 1 },
                                    above, margin);
  check('a boom shorter than the clearance is never re-aimed', tiny === -1.5,
        String(tiny));
  /* And a zero-length boom cannot be, either — there is no eye to move. */
  check('nor is a boom of no length', Render.pitchAboveFloor(1, -1, 0,
        { x: 0, y: 0, z: 1 }, above, margin) === -1);
})();

console.log('');
console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
