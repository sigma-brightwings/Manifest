/* galaxyzoom.test.js — the F6 chart's zoom and pan, as arithmetic.
 *
 *     node test/galaxyzoom.test.js
 *
 * Astra, 2026-11-03: "on the F6 tab I want to be able to zoom in and out on
 * the galaxy now that we're running so many more stars."
 *
 * The chart's transform is a handful of pure functions (Screens.chart), and
 * every part of the chart — dots, territory, the range ring, the click, the
 * edge arrows — goes through them. So the properties that would break the
 * feature quietly are checked here, on a real galaxy, without booting the
 * game: that screen and galaxy coordinates round-trip, that the wheel's
 * anchor point stays under the cursor, that a click at the closest zoom
 * picks the star under it and not its neighbour, the limits, and that the
 * labels never overprint. That the whole chart DRAWS at every zoom, culls,
 * and costs what it should is in render.test.js, which boots the game.
 */
global.window = global.window || global;
require('../src/vec3.js');
require('../src/economy.js');
require('../src/generate.js');
require('../src/sim.js');
var Galaxy = require('../src/galaxy.js');
var Screens = require('../src/screens.js');
var C = Screens.chart;

var pass = 0, fail = 0;
function check(n, c, d) {
  if (c) { pass++; console.log('  ok   ' + n + (d ? '   ' + d : '')); }
  else { fail++; console.log('  FAIL  ' + n + (d ? '   ' + d : '')); }
}

var gal = Galaxy.build('kawartha');
/* The plot as drawStarMap lays it out on a 1600 x 900 window. */
var size = 605;
var plot = { x0: 300, y0: 150, size: size, cx: 300 + size / 2, cy: 150 + size / 2,
             fit: C.fit(size, gal.radius), radius: gal.radius };

console.log('--- the transform ---');
(function () {
  var view = { z: 1, gx: 0, gy: 0 };
  var xf = C.xf(view, plot);
  check('zoom 1 is the old fixed scale', Math.abs(xf.scale - (size / 2) / (gal.radius * 1.06)) < 1e-12);
  check('and the galaxy origin sits in the middle of the plot',
        Math.abs(xf.ox - plot.cx) < 1e-9 && Math.abs(xf.oy - plot.cy) < 1e-9);

  var worst = 0;
  [[1, 0, 0], [3.7, 12, -20], [C.maxZoom(plot), -55, 40]].forEach(function (v) {
    var vw = C.clamp({ z: v[0], gx: v[1], gy: v[2] }, plot);
    var x = C.xf(vw, plot);
    gal.stars.forEach(function (s) {
      var p = C.toScreen(x, s.x, s.y);
      var g = C.toGalaxy(x, p.x, p.y);
      worst = Math.max(worst, Math.abs(g.x - s.x), Math.abs(g.y - s.y));
    });
  });
  check('screen to galaxy and back round-trips for every star at three views',
        worst < 1e-9, 'worst ' + worst.toExponential(2) + ' ly');

  var up = C.toScreen(xf, 0, 10);
  check('galaxy +y is up the screen', up.y < plot.cy);
})();

console.log('--- the wheel keeps the point under the cursor ---');
(function () {
  var view = { z: 1, gx: 0, gy: 0 };
  /* A cursor a little off-centre, over the interior of the galaxy, so the
   * clamp has room and the anchor is the only thing deciding the result. */
  var sx = plot.cx + 80, sy = plot.cy - 50;
  var under0 = C.toGalaxy(C.xf(view, plot), sx, sy);
  var drift = 0, steps = 0;
  for (var i = 0; i < 30; i++) {
    C.zoomAt(view, plot, Math.pow(1.0016, 100), sx, sy);   // one notch in, as main.js sends it
    var u = C.toGalaxy(C.xf(view, plot), sx, sy);
    drift = Math.max(drift, Math.hypot(u.x - under0.x, u.y - under0.y));
    steps++;
  }
  check('thirty notches in, the galaxy point under the cursor has not moved',
        drift < 1e-9, 'drift ' + drift.toExponential(2) + ' ly, zoom ×' + view.z.toFixed(2));
  check('and the zoom stopped at the limit', Math.abs(view.z - C.maxZoom(plot)) < 1e-9);
  var drift2 = 0;
  for (var j = 0; j < 4; j++) {
    C.zoomAt(view, plot, 1 / 1.25, sx, sy);
    var u2 = C.toGalaxy(C.xf(view, plot), sx, sy);
    drift2 = Math.max(drift2, Math.hypot(u2.x - under0.x, u2.y - under0.y));
  }
  check('zooming back out keeps it too', drift2 < 1e-9, 'drift ' + drift2.toExponential(2));
  for (var k = 0; k < 40; k++) C.zoomAt(view, plot, 1 / 1.25, sx, sy);
  check('all the way out is exactly the whole galaxy, centred',
        view.z === 1 && view.gx === 0 && view.gy === 0, JSON.stringify(view));
})();

console.log('--- the limits ---');
(function () {
  var view = C.clamp({ z: 1e6, gx: 0, gy: 0 }, plot);
  var px = C.xf(view, plot).scale;
  check('the closest zoom is ' + C.MAX_PX_PER_LY + ' px per light year',
        Math.abs(px - C.MAX_PX_PER_LY) < 1e-9, px.toFixed(2) + ' px/ly');
  check('zoom cannot go below the whole galaxy', C.clamp({ z: 0.01, gx: 0, gy: 0 }, plot).z === 1);
  check('at the whole galaxy there is no pan at all',
        C.clamp({ z: 1, gx: 30, gy: -30 }, plot).gx === 0);

  /* Zoomed in, the view must still reach every star: the rim is where
   * the frontier is, and a pan that could not get there would make the
   * zoom a way of LOSING stars. */
  var far = gal.stars.reduce(function (a, s) { return Math.hypot(s.x, s.y) > Math.hypot(a.x, a.y) ? s : a; });
  var v2 = C.centreOn({ z: C.maxZoom(plot), gx: 0, gy: 0 }, plot, far);
  var d = C.dot(C.xf(v2, plot), far);
  check('centring on the rim star at the closest zoom puts it on the plot',
        C.inPlot(plot, d.x, d.y), far.name + ' at ' + Math.hypot(far.x, far.y).toFixed(1) + ' ly out');

  /* What "nearby stars clearly separated" means in numbers, re-measured
   * on this galaxy rather than trusted from the comment. */
  var gaps = gal.stars.map(function (a) {
    var best = 1e9;
    gal.stars.forEach(function (b) {
      if (a === b) return;
      best = Math.min(best, Math.hypot(a.x - b.x, (a.y + a.z) - (b.y + b.z)));
    });
    return best;
  }).sort(function (a, b) { return a - b; });
  var p5 = gaps[Math.floor(gaps.length * 0.05)], med = gaps[Math.floor(gaps.length / 2)];
  check('at the closest zoom a 5th-percentile pair is over 20 px apart',
        p5 * C.MAX_PX_PER_LY > 20, (p5 * C.MAX_PX_PER_LY).toFixed(0) + ' px (' + p5.toFixed(2) + ' ly)');
  check('and at the whole galaxy a median pair is under 15 px — the reason for the zoom',
        med * plot.fit < 15, (med * plot.fit).toFixed(1) + ' px at ' + plot.fit.toFixed(2) + ' px/ly');

  var bar = C.scaleBar(plot.fit), bar2 = C.scaleBar(C.MAX_PX_PER_LY);
  check('the scale bar is a round number of ly and fits, zoomed out',
        bar.px >= 40 && bar.px <= 150, bar.ly + ' ly = ' + bar.px.toFixed(0) + ' px');
  check('and zoomed in', bar2.px >= 40 && bar2.px <= 150 && bar2.ly < bar.ly,
        bar2.ly + ' ly = ' + bar2.px.toFixed(0) + ' px');
})();

console.log('--- a click at the closest zoom ---');
(function () {
  var view = { z: C.maxZoom(plot), gx: 0, gy: 0 };
  var tried = 0, right = 0, misses = [];
  /* For a spread of stars: centre on each, then click EXACTLY on its dot,
   * and click a few pixels off it toward its nearest neighbour. Both must
   * still pick it — the second is the case the old overlapping hot boxes
   * got wrong. */
  for (var i = 0; i < gal.stars.length; i += 9) {
    var s = gal.stars[i];
    C.centreOn(view, plot, s);
    var xf = C.xf(view, plot);
    var d = C.dot(xf, s);
    var nb = null, nbD = 1e9;
    gal.stars.forEach(function (o) {
      if (o === s) return;
      var od = C.dot(xf, o), dd = Math.hypot(od.x - d.x, od.y - d.y);
      if (dd < nbD) { nbD = dd; nb = od; }
    });
    var off = nbD > 12 ? 4 : nbD / 3;
    var ux = (nb.x - d.x) / nbD, uy = (nb.y - d.y) / nbD;
    var hit1 = C.pick(gal.stars, xf, plot, d.x, d.y);
    var hit2 = C.pick(gal.stars, xf, plot, d.x + ux * off, d.y + uy * off);
    tried++;
    if (hit1 === s && hit2 === s) right++;
    else misses.push(s.name);
  }
  check('a click on a dot, or just off it toward its neighbour, picks that star',
        right === tried, right + ' / ' + tried + (misses.length ? ' missed ' + misses.slice(0, 3).join(', ') : ''));

  var xf2 = C.xf(view, plot);
  check('a click on empty space picks nothing',
        C.pick(gal.stars, xf2, plot, plot.x0 + 1, plot.y0 + 1) === null ||
        Math.hypot(C.dot(xf2, C.pick(gal.stars, xf2, plot, plot.x0 + 1, plot.y0 + 1)).x - plot.x0 - 1,
                   C.dot(xf2, C.pick(gal.stars, xf2, plot, plot.x0 + 1, plot.y0 + 1)).y - plot.y0 - 1) <= 12);
  check('a click off the plot picks nothing',
        C.pick(gal.stars, xf2, plot, plot.x0 - 30, plot.cy) === null);

  /* Pick only what is DRAWN: a star just past the plot edge is not a
   * target even if the pointer is within 12 px of where it would be. */
  var outside = null;
  gal.stars.forEach(function (o) {
    var od = C.dot(xf2, o);
    if (!outside && od.x > plot.x0 + size && od.x < plot.x0 + size + 8 && od.y > plot.y0 && od.y < plot.y0 + size) outside = od;
  });
  if (outside) {
    var h = C.pick(gal.stars, xf2, plot, plot.x0 + size - 1, outside.y);
    check('a star just off the edge cannot be clicked through it',
          !h || C.inPlot(plot, C.dot(xf2, h).x, C.dot(xf2, h).y));
  }
})();

console.log('--- the pan ---');
(function () {
  var view = { z: 6, gx: 0, gy: 0 };
  C.clamp(view, plot);
  var xf = C.xf(view, plot);
  var g0 = C.toGalaxy(xf, plot.cx + 40, plot.cy + 25);
  C.pan(view, plot, 40, 25);
  var p1 = C.toScreen(C.xf(view, plot), g0.x, g0.y);
  check('a drag carries the galaxy point under the pointer with it',
        Math.abs(p1.x - (plot.cx + 80)) < 1e-9 && Math.abs(p1.y - (plot.cy + 50)) < 1e-9);
  C.pan(view, plot, -1e6, 1e6);
  var lim = gal.radius * 1.06 - (size / 2) / (plot.fit * view.z);
  check('and stops where the plot would run out of galaxy',
        Math.abs(view.gx - lim) < 1e-9 && Math.abs(view.gy - lim) < 1e-9);
})();

console.log('--- the edge arrow ---');
(function () {
  var e = C.edge(plot, plot.cx + 5000, plot.cy, 12);
  check('a star far to the east gets its arrow on the east edge, pointing east',
        Math.abs(e.x - (plot.x0 + size - 12)) < 1e-9 && Math.abs(e.y - plot.cy) < 1e-9 && Math.abs(e.ang) < 1e-9);
  var e2 = C.edge(plot, plot.cx - 300, plot.cy - 3000, 12);
  check('one far up and a little west, on the top edge',
        Math.abs(e2.y - (plot.y0 + 12)) < 1e-9 && e2.x < plot.cx && e2.x > plot.x0);
})();

console.log('--- labels do not overprint ---');
(function () {
  /* Every star as a candidate at the whole-galaxy zoom, the worst case for
   * crowding: the placer must drop names rather than overlap them, and
   * must place in priority order. */
  var xf = C.xf({ z: 1, gx: 0, gy: 0 }, plot);
  var cands = gal.stars.map(function (s, i) {
    var d = C.dot(xf, s);
    return { text: s.name, x: d.x, y: d.y, r: 3, tier: i === 7 ? 0 : 5, d: Math.hypot(s.x, s.y), size: 11 };
  }).sort(function (a, b) { return a.tier - b.tier || a.d - b.d; });
  var placed = C.labels(cands, plot, 400);
  var overlaps = 0;
  for (var a = 0; a < placed.length; a++) {
    for (var b = a + 1; b < placed.length; b++) {
      var p = placed[a], q = placed[b];
      if (p.bx < q.bx + q.bw && p.bx + p.bw > q.bx && p.by < q.by + q.bh && p.by + p.bh > q.by) overlaps++;
    }
  }
  check('no two placed labels overlap', overlaps === 0, placed.length + ' placed of ' + cands.length);
  check('the selected star always gets its name', placed[0] && placed[0].c.tier === 0);
  check('and fewer than all of them fit — thinning happened', placed.length < cands.length);
  var inside = placed.every(function (pl) {
    return pl.bx >= plot.x0 && pl.by >= plot.y0 && pl.bx + pl.bw <= plot.x0 + size && pl.by + pl.bh <= plot.y0 + size;
  });
  check('and every label is on the plot', inside);
})();

console.log('--- the two names that are always shown pick a clear side ---');
(function () {
  /* 2026-11-03, seen on F6 at the whole-galaxy zoom: "Mirven" and
   * "Rhoameor" in the crowded middle, the two names that may not be
   * dropped, were placed ignoring every dot, and landed on their
   * neighbours. With every star's dot in as a blocked box, as drawStarMap
   * passes them, the forced names must find a side that covers no dot
   * when one exists within reach — and still overlap no other name. */
  var xf = C.xf({ z: 1, gx: 0, gy: 0 }, plot);
  var dots = gal.stars.map(function (s) {
    var d = C.dot(xf, s);
    return { bx: d.x - 4, by: d.y - 4, bw: 8, bh: 8, dot: true };
  });
  /* The two stars nearest the middle as selected and here: the densest
   * place on the chart. At this zoom only those tiers are named
   * (CHART_TIER_PX), so they are the only candidates, as in the game. */
  var mid = gal.stars.slice().sort(function (a, b) { return Math.hypot(a.x, a.y) - Math.hypot(b.x, b.y); });
  var cands = mid.slice(0, 2).map(function (s, i) {
    var d = C.dot(xf, s);
    return { text: s.name, x: d.x, y: d.y, r: i < 2 ? 7 : 3, tier: i === 0 ? 0 : i === 1 ? 1 : 3, d: i, size: i < 2 ? 12 : 11 };
  });
  var placed = C.labels(cands, plot, 80, dots);
  var forced = placed.filter(function (pl) { return pl.c.tier <= 1; });
  check('both always-shown names are placed', forced.length === 2, forced.map(function (f) { return f.c.text; }).join(', '));
  var under = forced.map(function (pl) {
    return dots.filter(function (q) { return pl.bx < q.bx + q.bw && pl.bx + pl.bw > q.bx && pl.by < q.by + q.bh && pl.by + pl.bh > q.by; }).length;
  });
  check('and neither sits on another star\'s dot', under.every(function (n) { return n === 0; }), 'dots under: ' + under.join(', '));
  var overlaps = 0;
  for (var a = 0; a < placed.length; a++) for (var b = a + 1; b < placed.length; b++) {
    var p = placed[a], q = placed[b];
    if (p.bx < q.bx + q.bw && p.bx + p.bw > q.bx && p.by < q.by + q.bh && p.by + p.bh > q.by) overlaps++;
  }
  check('and no two names overlap', overlaps === 0);

  /* The border: a field split down the middle of a forced name's first
   * spot. With the edge cost, it goes to a side clear of the line. */
  var f = { nc: 40, nr: 40, x0: -160, y0: -160, owner: [] };
  for (var k = 0; k < 1600; k++) f.owner.push((k % 40) < 22 ? 'a' : 'b');   // a border at x = +16 px
  var xf0 = { ox: 400, oy: 400, scale: 1 };
  var cost = C.edgeCost(f, xf0);
  var one = [{ text: 'Rhoameor', x: 400, y: 400, r: 5, tier: 1, d: 0, size: 12 }];
  /* Dots block both beside-spots, so the name is forced. */
  var block = [{ bx: 412, by: 390, bw: 10, bh: 20, dot: true }, { bx: 370, by: 390, bw: 10, bh: 20, dot: true },
               { bx: 380, by: 375, bw: 40, bh: 10, dot: true }, { bx: 380, by: 412, bw: 40, bh: 10, dot: true }];
  var withCost = C.labels(one, { x0: 0, y0: 0, size: 800 }, 1, block, cost)[0];
  check('a forced name keeps off a territory border when it can',
        withCost && cost(withCost.bx, withCost.by, withCost.bw, withCost.bh) === 0,
        withCost ? 'box x ' + withCost.bx.toFixed(0) + '..' + (withCost.bx + withCost.bw).toFixed(0) : 'none');
})();

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
