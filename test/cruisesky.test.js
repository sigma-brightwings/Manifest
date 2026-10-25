/* cruisesky.test.js — the sky at cruise speed: streaks and the red-blue shift.
 *
 *     node test/cruisesky.test.js
 *
 * Astra, 2026-10-19: "I liked the old cruise animation a bit better, just,
 * we need a bit of planets covering the lines and blur them a bit so we get
 * a streak and not just a point or a line" — and the TNG-remaster starfield,
 * "where right as you pass a point of light it rapidly shifts in color."
 * Render.cruiseSky is that rule; gl.js's star shader carries it line for
 * line (node cannot run a shader), so this pins the JS.
 */
global.window = global.window || global;
require('../src/vec3.js');
require('../src/rng.js');
var Render = require('../src/render.js');

var pass = 0, fail = 0;
function check(n, c, d) {
  if (c) { pass++; console.log('  ok   ' + n + (d ? '   ' + d : '')); }
  else { fail++; console.log('  FAIL  ' + n + (d ? '   ' + d : '')); }
}
var sky = Render.cruiseSky, frac = Render.cruiseFrac;

console.log('--- the speed scale ---');
check('nothing below 0.02c', frac(0) === 0 && frac(0.019) === 0);
check('full at the drive cap, 2000c', Math.abs(frac(2000) - 1) < 1e-12 && frac(5000) === 1);
check('log in between: 6.3c sits halfway', Math.abs(frac(Math.sqrt(0.02 * 2000)) - 0.5) < 1e-9, frac(6.3).toFixed(3));

console.log('--- the colour ---');
var W = [255, 255, 255];
check('at rest a star is just white', Render.skyColour(W, sky(1, 0)).join() === '255,255,255' &&
      Render.skyColour([255, 180, 120], sky(-1, 0)).join() === '255,255,255');
var ahead = Render.skyColour(W, sky(0.9, 50)), behind = Render.skyColour(W, sky(-0.9, 50));
check('ahead is blue at speed', ahead[2] > ahead[0] + 40, ahead.join());
check('behind is red at speed', behind[0] > behind[2] + 120, behind.join());
check('ahead is brighter, behind dimmer', sky(0.9, 50).lum > 1.4 && sky(-0.9, 50).lum < 0.75,
      sky(0.9, 50).lum.toFixed(2) + ' / ' + sky(-0.9, 50).lum.toFixed(2));
/* THE FLIP IS FAST: all of it inside ±6 degrees of abeam. */
check('the flip happens within a few degrees of abeam',
      sky(0.105, 50).ahead === 1 && sky(-0.105, 50).ahead === 0 && Math.abs(sky(0, 50).ahead - 0.5) < 1e-9);
check('and the wash grows with speed', sky(-0.9, 0.05).s < sky(-0.9, 0.3).s && sky(-0.9, 0.3).s < sky(-0.9, 2).s);

console.log('--- the stars have temperatures ---');
var made = Render.makeStarfield ? Render.makeStarfield('kawartha', 1400) : null;
if (made) {
  var temps = {};
  made.forEach(function (s) { temps[Render.starTemp(s)] = true; });
  check('every star gets a temperature from its tint', Object.keys(temps).sort().join(',') === '12000,4000,6500',
        Object.keys(temps).join(','));
} else {
  check('makeStarfield is reachable', false);
}

console.log('--- the streaks ---');
(function () {
  function camLooking(f, u) {
    var r = { x: f.y * u.z - f.z * u.y, y: f.z * u.x - f.x * u.z, z: f.x * u.y - f.y * u.x };
    var c = { r: r, u: u, f: f, flen: 600, cx: 400, cy: 300 };
    c.projectDir = function (d) {
      var depth = d.x * f.x + d.y * f.y + d.z * f.z;
      if (depth <= 1e-6) return null;
      var k = 600 / depth;
      return { x: 400 + (d.x * r.x + d.y * r.y + d.z * r.z) * k, y: 300 - (d.x * u.x + d.y * u.y + d.z * u.z) * k, depth: depth };
    };
    return c;
  }
  function norm(v) { var l = Math.hypot(v.x, v.y, v.z); return { x: v.x / l, y: v.y / l, z: v.z / l }; }
  function seg(cam, st, head, beta, hist) {
    var t = Render.cruiseTrails(cam, [st], head, 800, 600, beta, hist || []);
    return t.segs.length ? { ax: t.segs[0], ay: t.segs[1], bx: t.segs[2], by: t.segs[3], w: t.segs[8],
                             len: Math.hypot(t.segs[2] - t.segs[0], t.segs[3] - t.segs[1]) } : null;
  }
  var fwd = { x: 1, y: 0, z: 0 }, up = { x: 0, y: 0, z: 1 };
  var cam = camLooking(fwd, up);
  var S = function (d) { return { d: norm(d), b: 1, size: 1, tint: '#ffffff' }; };
  var dead = S(fwd), near = S({ x: 1, y: 0.15, z: 0 }), far = S({ x: 1, y: 0.6, z: 0.3 });

  check('a star dead ahead does not streak', !seg(cam, dead, fwd, 50));
  var a = seg(cam, near, fwd, 50), b = seg(cam, far, fwd, 50);
  check('streaks grow away from the heading', a && b && b.len > a.len, a && b ? a.len.toFixed(1) + ' < ' + b.len.toFixed(1) + ' px' : 'none');
  /* Radial, the old look: the tail points back toward the vanishing point. */
  var p = cam.projectDir(far.d);
  var tx = b.bx - b.ax, ty = b.by - b.ay, vx = 400 - p.x, vy = 300 - p.y;
  check('steady: the tail points back at the vanishing point (radial)',
        (tx * vx + ty * vy) / (Math.hypot(tx, ty) * Math.hypot(vx, vy)) > 0.99);
  check('and it starts AT the star', Math.abs(b.ax - p.x) < 1e-9 && Math.abs(b.ay - p.y) < 1e-9);
  var slow = seg(cam, far, fwd, 0.1), fast = seg(cam, far, fwd, 1000);
  check('faster is longer and wider', slow && fast && fast.len > slow.len * 3 && fast.w > slow.w,
        (slow ? slow.len.toFixed(1) : '-') + ' -> ' + (fast ? fast.len.toFixed(1) : '-') + ' px');
  check('no streak is longer than half the screen and a bit', fast.len <= 800 * 0.55 + 1e-9);

  /* Looking BACK: the stars converge on the point astern, and are red. */
  var back = camLooking({ x: -1, y: 0, z: 0 }, up);
  var rear = S({ x: -1, y: 0.3, z: 0.1 });
  var rs = seg(back, rear, fwd, 50), rp = back.projectDir(rear.d);
  check('looking astern, the tail points AWAY from the point behind',
        rs && ((rs.bx - rs.ax) * (rp.x - 400) + (rs.by - rs.ay) * (rp.y - 300)) > 0);
  var rt = Render.cruiseTrails(back, [rear], fwd, 800, 600, 50, []);
  check('and those streaks are red', rt.segs[4] > rt.segs[6] + 100, rt.segs.slice(4, 7).join());

  /* A turn: the camera and heading 6 degrees to the left a moment ago. A
   * star above the heading would streak vertically when steady; a yaw adds
   * a sideways component, so the trail swings with the turn. */
  var ang = 6 * Math.PI / 180;
  var oldF = { x: Math.cos(ang), y: Math.sin(ang), z: 0 };
  var oldCam = camLooking(oldF, up);
  var hist = [{ r: oldCam.r, u: up, f: oldF, flen: 600, cx: 400, cy: 300, head: oldF, beta: 50 }];
  var above = S({ x: 1, y: 0, z: 0.15 });
  var st0 = seg(cam, above, fwd, 50), st1 = seg(cam, above, fwd, 50, hist);
  check('turning: the trail swings sideways with the turn',
        st0 && st1 && Math.abs(st0.bx - st0.ax) < 1e-6 && Math.abs(st1.bx - st1.ax) > 20,
        st1 ? 'sideways ' + (st1.bx - st1.ax).toFixed(1) + ' px' : 'none');

  /* BEHIND THE PLANETS: with a world layer the streaks go to it; the
   * overlay gets only the edge darkening, never a stroke. */
  var strokes = 0, handed = null;
  var ctx = { save: function () {}, restore: function () {}, beginPath: function () {},
    moveTo: function () {}, lineTo: function () {}, stroke: function () { strokes++; },
    fillRect: function () {},
    createRadialGradient: function () { return { addColorStop: function () {} }; } };
  global.GLWorld = { drawTrails: function (segs) { handed = segs.slice(); return true; } };
  Render.drawCruiseWarp(ctx, cam, [near, far], fwd, 1, 800, 600, 50, true, []);
  delete global.GLWorld;
  check('with a world layer the streaks go behind the planets, none on the overlay',
        strokes === 0 && handed && handed.length === 18, strokes + ' strokes, ' + (handed ? handed.length / 9 : 0) + ' segments');
  strokes = 0;
  Render.drawCruiseWarp(ctx, cam, [near, far], fwd, 1, 800, 600, 50, false, []);
  check('without one they fall back to the overlay, soft-edged (two passes)', strokes === 4, strokes + ' strokes');
  strokes = 0;
  Render.drawCruiseWarp(ctx, cam, [near, far], fwd, 1, 800, 600, 0.01, false, []);
  check('below 0.02c nothing is drawn', strokes === 0);
})();

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
