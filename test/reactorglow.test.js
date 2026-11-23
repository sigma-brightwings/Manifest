/* reactorglow.test.js — the reactor's glass and its glow (2026-11-23).
 *
 * Astra: "a slab of glass holds the water back from flowing free, so we can
 * see the cherenkov glow, to bridge realism with 'ooh, glowy'"; then
 * "okay let's finish the reactor glow". What it holds:
 *   - from reactor control, looking through the window at the core, the
 *     only thing between you and it is glass: the bulkhead is cut, and the
 *     tank stands against it (on the Capital, Carrier, Meridian, Leviathan,
 *     the Crawler's flat and every reactor-block hull, both layouts);
 *   - the water glows brighter at full power than idle, idle than an
 *     afterglow, and near the core than at the tank's back wall;
 *   - the reactor's power: idle at a berth, up with the throttle, eased;
 *     a scram drops her at once and the afterglow fades; a restart brings
 *     her back, slower than she runs;
 *   - every vertex of every glow step is finite, every face has a colour.
 */
global.window = global.window || global;
['vec3', 'rng', 'kepler', 'economy', 'generate', 'sim'].forEach(function (m) { require('../src/' + m + '.js'); });
var Combat = require('../src/combat.js');
require('../src/crew.js'); require('../src/hulls.js');
require('../src/walk.js'); require('../src/navaldeck.js');
var SD = require('../src/shipdeck.js'); require('../src/render.js');
var R = global.Render;
var pass = 0, fail = 0;
function check(name, ok, note) {
  if (ok) pass++; else fail++;
  console.log((ok ? '  ok   ' : '  FAIL ') + name + (note ? '   ' + note : ''));
}

/* Does the segment a->b cross the triangle (p, q, r)? Möller–Trumbore. */
function crosses(a, b, p, q, r) {
  var d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  var e1 = [q[0] - p[0], q[1] - p[1], q[2] - p[2]], e2 = [r[0] - p[0], r[1] - p[1], r[2] - p[2]];
  var h = [d[1] * e2[2] - d[2] * e2[1], d[2] * e2[0] - d[0] * e2[2], d[0] * e2[1] - d[1] * e2[0]];
  var det = e1[0] * h[0] + e1[1] * h[1] + e1[2] * h[2];
  if (Math.abs(det) < 1e-12) return false;
  var f = 1 / det, s = [a[0] - p[0], a[1] - p[1], a[2] - p[2]];
  var u = f * (s[0] * h[0] + s[1] * h[1] + s[2] * h[2]);
  if (u < 0 || u > 1) return false;
  var qv = [s[1] * e1[2] - s[2] * e1[1], s[2] * e1[0] - s[0] * e1[2], s[0] * e1[1] - s[1] * e1[0]];
  var v = f * (d[0] * qv[0] + d[1] * qv[1] + d[2] * qv[2]);
  if (v < 0 || u + v > 1) return false;
  var t = f * (e2[0] * qv[0] + e2[1] * qv[1] + e2[2] * qv[2]);
  return t > 1e-6 && t < 1 - 1e-6;
}
function shipOf(id, v, extra) {
  var s = { hullId: id, bornId: 'glow|' + id + '|' + (v || ''), dryMass: Combat.HULLS[id].dryMass };
  if (v) s.blockVariant = v;
  for (var k in (extra || {})) s[k] = extra[k];
  return s;
}

console.log('--- the glass: nothing but glass between control and the core ---');
var CASES = [['capital'], ['carrier'], ['meridian'], ['leviathan'], ['crawler'],
             ['kestrel', 'A'], ['cutter', 'A'], ['longhaul', 'A'], ['tanker', 'A'], ['tanker', 'B']];
var blocked = [], seen = 0, glowOk = [], finite = [];
CASES.forEach(function (cs) {
  var d = R.shipInterior(shipOf(cs[0], cs[1])), p = d.plan;
  var rxs = (p.naval && p.naval.reactors) || [];
  if (!rxs.length) { blocked.push(cs.join('') + ': no reactor'); return; }
  var room = d.meshes.room;
  rxs.forEach(function (rx) {
    var T = SD.reactorTank(p, rx), w = rx.window;
    if (!T) { blocked.push(cs.join('') + ': no tank'); return; }
    seen++;
    var eye = [(w.x0 + w.x1) / 2, (w.y0 + w.y1) / 2, T.zc + 0.8];
    var core = [T.core.x, T.core.y, T.core.z];
    var hit = 0;
    room.f.forEach(function (f, i) {
      var col = String(room.c[i] || '');
      if (col.charAt(0) === '~') return;            // the glass
      if (crosses(eye, core, room.v[f[0]], room.v[f[1]], room.v[f[2]])) hit++;
    });
    if (hit) blocked.push(cs.join('') + ' ' + rx.id + ': ' + hit + ' faces');
  });
  /* The glow at three powers. */
  var bright = function (lv) {
    var g = SD.reactorGlowMesh(p, lv), mx = 0;
    g.vcol.forEach(function (c) { mx = Math.max(mx, c[0] + c[1] + c[2]); });
    if (!g.v.every(function (v) { return v.every(isFinite); }) || g.c.length !== g.f.length || g.vcol.length !== g.v.length) finite.push(cs.join('') + ' ' + lv);
    return mx;
  };
  var b0 = bright(0.05), b1 = bright(0.3), b2 = bright(1);
  if (!(b2 > b1 && b1 > b0)) glowOk.push(cs.join('') + ' ' + [b0, b1, b2].map(function (x) { return x.toFixed(2); }).join('<'));
});
check('every reactor\'s window looks at her core through nothing but glass', !blocked.length && seen >= 10,
      seen + ' reactors; ' + blocked.slice(0, 4).join('; '));
check('the water glows brighter at full power than idle, and idle than an afterglow', !glowOk.length, glowOk.join(', '));
check('every step of the glow is whole: finite, coloured, a colour per vertex', !finite.length, finite.join(', '));

(function () {
  var p = R.shipInterior(shipOf('capital')).plan, rx = p.naval.reactors[0], T = SD.reactorTank(p, rx);
  var g = SD.reactorGlowMesh(p, 1), near = 0, far = 0;
  g.v.forEach(function (v, i) {
    var c = g.vcol[i], b = c[0] + c[1] + c[2];
    if (Math.abs(v[2] - (T.z0 + 0.05)) < 1e-6) {            // the tank's back wall
      /* Measured off the core's own edges: behind it, and out at the
       * tank's corners, 35 cm and more clear of it. */
      var dx = Math.abs(v[0] - T.core.x) - T.core.hx, dy = Math.abs(v[1] - T.core.y) - T.core.hy;
      if (dx < 0 && dy < 0) near = Math.max(near, b);
      if (dx > 0.35 && dy > 0.35) far = Math.max(far, b);
    }
  });
  check('on the tank\'s back wall, brightest behind the core and dimmer away from it', near > far && far > 0, near.toFixed(2) + ' > ' + far.toFixed(2));
  check('the tank stands against the bulkhead, across the window', T.zb === p.rooms.filter(function (r) { return r.id === rx.room; })[0].z1 &&
        T.x0 <= rx.window.x0 && T.x1 >= rx.window.x1 && T.y1 > rx.window.y1);
})();

console.log('--- the reactor\'s power ---');
var s = { docked: 'port-1', throttle: 0 };
check('at a berth she ticks over on her hotel load', Math.abs(SD.reactorPower(s, 0) - 0.2) < 1e-9);
s.docked = null; s.throttle = 1;
var p1 = SD.reactorPower(s, 1), p30 = SD.reactorPower(s, 30);
check('under way at full throttle she comes up, and not at once', p1 > 0.2 && p1 < 0.6 && p30 > 0.99, p1.toFixed(2) + ', ' + p30.toFixed(3));
SD.scramReactor(s, 40);
var a0 = SD.reactorPower(s, 40), a10m = SD.reactorPower(s, 40 + 600), a1h = SD.reactorPower(s, 40 + 3600);
check('a scram drops her at once to her afterglow', a0 < 0.08 && a0 > 0.05, a0.toFixed(3));
check('and the afterglow fades, to a faint glow and no lower', a10m < a0 && a1h < a10m && a1h >= 0.015, a10m.toFixed(3) + ', ' + a1h.toFixed(3));
SD.restartReactor(s, 4000);
var r5 = SD.reactorPower(s, 4005), r120 = SD.reactorPower(s, 4120);
check('restarted, she comes back up slower than she runs', r5 > a1h && r5 < 0.4 && r120 > 0.95, r5.toFixed(2) + ', ' + r120.toFixed(2));
s.throttle = 0;
var down = SD.reactorPower(s, 4122);
check('throttled back, the rods go in faster than they come out', down < 0.6, down.toFixed(2));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
