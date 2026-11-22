/* panels.test.js - no panel overlaps another (2026-11-22).
 *
 *     node test/panels.test.js
 *
 * Astra: "can you make a rule so no panel overlaps another, even if it
 * means moving it up (if it's moved off the 'dashboard' then it's on a
 * support, on a wall, etc." Two kinds of panel:
 *
 *   - THE SCREENS in the cockpit. cockpit.test.js holds the three dash
 *     screens apart in the cabin every ship had; this holds every screen
 *     apart in EVERY cabin (Render.cabinOf: each hull's fits A, B and C),
 *     measured independently of the rule that places them (Render.
 *     mfdLayout): projected through the real cockpit camera, with the eye
 *     moved to the fit's seat exactly as main.js moves it, in pixels.
 *   - THE BOXES over the view. A box drawn there (main.js `panel`) claims
 *     its rectangle, and the HUD's role panel is never placed under one.
 */
global.window = global.window || global;
['vec3', 'rng', 'kepler', 'economy', 'generate', 'sim'].forEach(function (m) { require('../src/' + m + '.js'); });
var Combat = require('../src/combat.js');
require('../src/crew.js');
require('../src/hulls.js');
require('../src/walk.js');
require('../src/shipdeck.js');
require('../src/render.js');
var R = global.Render, V = global.V;

var DEG = Math.PI / 180, pass = 0, fail = 0;
function check(n, c, d) {
  if (c) { pass++; console.log('  ok   ' + n + (d ? '   ' + d : '')); }
  else { fail++; console.log('  FAIL  ' + n + (d ? '   ' + d : '')); }
}
function frame() {
  var f = V.norm({ x: 0, y: 0, z: 1 }), r = V.norm(V.cross(f, { x: 0, y: 1, z: 0 }));
  return { pos: V.zero(), fwd: f, right: r, up: V.cross(r, f), vel: V.zero() };
}
/* Separating-axis gap between two screen polygons: > 0 apart, < 0 overlapping. */
function sepGap(a, b) {
  var best = -Infinity;
  [a, b].forEach(function (p) {
    for (var i = 0; i < p.length; i++) {
      var q = p[(i + 1) % p.length];
      var nx = -(q.y - p[i].y), ny = q.x - p[i].x, l = Math.hypot(nx, ny);
      if (l < 1e-9) continue; nx /= l; ny /= l;
      var a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
      a.forEach(function (v) { var d = v.x * nx + v.y * ny; a0 = Math.min(a0, d); a1 = Math.max(a1, d); });
      b.forEach(function (v) { var d = v.x * nx + v.y * ny; b0 = Math.min(b0, d); b1 = Math.max(b1, d); });
      best = Math.max(best, b0 - a1, a0 - b1);
    }
  });
  return best;
}

console.log('--- the screens, in every cabin ---');
var ids = Object.keys(Combat.HULLS);
var dash = R.MFD_MOUNTS.filter(function (m) { return Math.abs(m.bearing) < 60 * DEG; });
var tight = [], lifted = [], unsupported = [], movedA = [], tooHigh = [], worst = Infinity, worstAt = '';
ids.forEach(function (id) {
  [0, 1, 2].forEach(function (look) {
    var s = { hullId: id, name: 'Probe', cockpitLook: look };
    var spec = R.cockpitSpec(s), L = R.mfdLayout(spec), tag = id + ' ' + 'ABC'[look];
    var sh = frame();
    [[1920, 1080], [1280, 800]].forEach(function (dim) {
      var w = dim[0], h = dim[1], cam = new R.Camera();
      cam.buildCockpit(sh, w, h, { yaw: 0, pitch: 0 });
      /* The seat, as main.js puts the eye there (THE FIT'S SEAT). */
      if (spec.cabin && spec.seat) {
        var sk = spec.size * 0.001;
        cam.eye = V.add(cam.eye, V.add(V.add(V.scale(sh.right, spec.seat.x * sk), V.scale(sh.up, spec.seat.y * sk)), V.scale(sh.fwd, spec.seat.z * sk)));
      }
      var q = dash.map(function (m) { return R.clipProject(cam, R.localPoly(sh, R.mfdCorners(m, 0.022, spec))); });
      for (var i = 0; i < q.length; i++) for (var j = i + 1; j < q.length; j++) {
        if (!q[i] || !q[j]) continue;
        var g = sepGap(q[i], q[j]), need = 8 * w / 1280;
        if (g / need < worst) { worst = g / need; worstAt = tag + ' ' + w + 'x' + h + ' ' + dash[i].id + '/' + dash[j].id + ' ' + g.toFixed(1) + ' px'; }
        if (g < need) tight.push(tag + ' ' + w + ': ' + dash[i].id + '/' + dash[j].id + ' ' + g.toFixed(1) + ' px');
      }
    });
    Object.keys(L.lift).forEach(function (k) {
      var lf = L.lift[k];
      if (!lf) return;
      lifted.push(tag + ' ' + k + ' +' + Math.round(lf * 100) + ' cm');
      var m = R.MFD_MOUNTS.filter(function (x) { return x.id === k; })[0];
      if (Math.abs(m.bearing) < 60 * DEG && !(L.support[k] > 0)) unsupported.push(tag + ' ' + k);
      if (look === 0) movedA.push(tag + ' ' + k);
      if (lf > 0.10) tooHigh.push(tag + ' ' + k + ' +' + Math.round(lf * 100) + ' cm');
    });
  });
});
check('no two dash screens closer than a strip of dash, in any hull\'s A, B or C, from its own seat',
      !tight.length, tight.slice(0, 5).join('; ') || 'tightest ' + worstAt);
check('a dash screen lifted clear stands on a support', !unsupported.length, unsupported.slice(0, 5).join('; '));
check('the cabin every ship had (fit A) is not moved', !movedA.length, movedA.slice(0, 5).join('; '));
check('and the lifts are small - a tier, not a screen in the windscreen', !tooHigh.length,
      (tooHigh.slice(0, 5).join('; ') || lifted.length + ' lifted') + '');
/* The rule's own answer agrees: every screen clear of every one placed
 * before it by MFD_CLEAR, the overhead and bulkhead screens included. */
var ruleTight = [];
ids.forEach(function (id) {
  [0, 1, 2].forEach(function (look) {
    var L = R.mfdLayout(R.cockpitSpec({ hullId: id, name: 'Probe', cockpitLook: look }));
    Object.keys(L.gaps).forEach(function (k) { if (L.gaps[k] < R.MFD_CLEAR - 1e-9) ruleTight.push(id + ' ' + 'ABC'[look] + ' ' + k + ' ' + (L.gaps[k] / DEG).toFixed(2) + 'deg'); });
  });
});
check('all six screens, overhead and bulkhead too, clear by the rule\'s own measure', !ruleTight.length, ruleTight.slice(0, 5).join('; '));

console.log('--- the boxes over the view ---');
(function () {
  var w = 1920, hv = 820;
  R.setHudRoom && R.setHudRoom(null);
  R.overlayFrame(); R.overlayFrame();                      // nothing claimed
  var g0 = R.hudGeom(w, hv, hv);
  check('with nothing over the view, the role panel has a place', !!g0.role, g0.role && (g0.role.x + ',' + g0.role.y));
  /* The captain's card, right where the panel was. */
  var box = { x: g0.role.x - 40, y: g0.role.y - 20, w: R.ROLE_W + 80, h: R.ROLE_H + 60 };
  R.claimOverlay(box.x, box.y, box.w, box.h);
  R.overlayFrame();
  var g1 = R.hudGeom(w, hv, hv), r = g1.role;
  var hit = r && Math.min(r.x + R.ROLE_W, box.x + box.w) - Math.max(r.x, box.x) > 0 &&
                 Math.min(r.y + R.ROLE_H, box.y + box.h) - Math.max(r.y, box.y) > 0;
  check('a box drawn where it was: the role panel moves out from under it', !!r && !hit,
        r ? 'now ' + r.x.toFixed(0) + ',' + r.y.toFixed(0) + ' (box ' + box.x.toFixed(0) + ',' + box.y.toFixed(0) + ' ' + box.w + 'x' + box.h + ')' : 'nowhere');
  /* Boxes in all four corners: still not under any of them, if it fits. */
  var corners = [[0, 0], [w - 520, 0], [0, hv - 240], [w - 520, hv - 240]];
  corners.forEach(function (c) { R.claimOverlay(c[0], c[1], 520, 240); });
  R.overlayFrame();
  var g2 = R.hudGeom(w, hv, hv), r2 = g2.role, under = 0;
  if (r2) corners.forEach(function (c) {
    if (Math.min(r2.x + R.ROLE_W, c[0] + 520) - Math.max(r2.x, c[0]) > 0 && Math.min(r2.y + R.ROLE_H, c[1] + 240) - Math.max(r2.y, c[1]) > 0) under++;
  });
  check('four corners boxed in: the role panel finds the space between', !!r2 && under === 0, r2 ? r2.x.toFixed(0) + ',' + r2.y.toFixed(0) + ', under ' + under : 'nowhere');
  /* Claims last one frame: the next frame with no box puts it back. */
  R.overlayFrame(); R.overlayFrame();
  var g3 = R.hudGeom(w, hv, hv);
  check('and when the box goes, the panel goes back', g3.role && g3.role.x === g0.role.x && g3.role.y === g0.role.y);
})();

/* ---- the names on the glass (2026-11-22) ------------------------------- */
console.log('no name over a name');
(function () {
  var W = 1920, H = 1080, B = R.HOLO_BRACKET;
  var ov = function (a, b) { return a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0; };
  var boxOf = function (t, p) { return { x0: p.x, x1: p.x + t.tw, y0: p.top, y1: p.top + t.bh }; };
  var brk = function (t) { return { x0: t.x - B, x1: t.x + B, y0: t.y - B, y1: t.y + B }; };
  /* The screenshot: two ships 20 px apart, and a cop by the speed box. */
  var speed = { x0: 365, x1: 450, y0: 520, y1: 560 };
  var tg = [{ x: 960, y: 540, tw: 150, bh: 26 }, { x: 980, y: 545, tw: 170, bh: 26 },
            { x: 430, y: 540, tw: 160, bh: 26 }, { x: 975, y: 530, tw: 120, bh: 14 }];
  var pl = R.placeHoloLabels(tg, [speed], W, H);
  var clash = [];
  tg.forEach(function (t, i) {
    var a = boxOf(t, pl[i]);
    tg.forEach(function (u, j) {
      if (i !== j && ov(a, boxOf(u, pl[j]))) clash.push(i + '/' + j + ' names');
      if (i !== j && ov(a, brk(u))) clash.push(i + ' name on ' + j + ' box');
    });
    if (ov(a, speed)) clash.push(i + ' on the speed box');
  });
  check('four boxed ships close together: no name on a name, a box or the speed readout', !clash.length, clash.join('; '));
  check('a name that had to move is drawn with a leader', pl.some(function (p) { return p.moved; }));
  /* One ship alone keeps the old spot beside her box. */
  var one = R.placeHoloLabels([{ x: 900, y: 500, tw: 140, bh: 26 }], [], W, H)[0];
  check('alone, the name sits where it always did', one.x === 900 + 16 && one.top === 488 && !one.moved, one.x + ',' + one.top);
  /* At the right edge the name goes to the other side rather than off the glass. */
  var edge = R.placeHoloLabels([{ x: W - 40, y: 500, tw: 140, bh: 26 }], [], W, H)[0];
  check('at the edge it goes the other way, on the glass', edge.x + 140 <= W && edge.x < W - 40);
})();

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
