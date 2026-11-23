/* diag-stars3.js - before building binaries and warm giants, what room do
 * existing systems leave for them without moving a planet?
 *   - close pair: the innermost planet's a, against 1.15 x a_crit(a_bin)
 *     for a pair with P_bin >= 7 d (the circumbinary floor);
 *   - distant companion: the outermost planet's a, which sets how far out
 *     a second sun must be to cut nothing;
 *   - a giant in the warm zone: gaps between neighbours, near the zone, wide
 *     enough to hold a Jupiter with ~10 mutual Hill radii either side.
 *
 *     node tools/diag-stars3.js
 */
'use strict';
global.window = global;
var path = require('path'), SRC = path.join(__dirname, '..', 'src');
['vec3', 'kepler', 'rng', 'economy', 'generate', 'galaxy'].forEach(function (f) { require(path.join(SRC, f + '.js')); });
var Gen = global.Gen, Galaxy = global.Galaxy;
var AU = 1.495978707e8, MSUN = 1.989e30, MJUP = 1.898e27, MEARTH = 5.972e24;
var g = Galaxy.build('kawartha');
var stars = g.stars.filter(function (s) { return s.factionId; }).slice(0, 200);
var rows = [];
stars.forEach(function (st) {
  var sys = Gen.generateSystem(st.seed, { faction: g.factionById[st.factionId], allFactions: g.factions });
  var root = sys.root, M = root.mass / MSUN;
  var planets = (root.children || []).filter(function (b) { return b.kind === 'planet'; })
    .sort(function (a, b) { return a.orbit.a - b.orbit.a; });
  if (!planets.length) return;
  var inner = planets[0].orbit.a / AU, outer = planets[planets.length - 1].orbit.a / AU;
  /* P_bin = 7 d for the whole mass M: a = (M P^2)^(1/3) AU with P in years. */
  var a7 = Math.cbrt(M * Math.pow(7 / 365.25, 2));
  var aCrit = 2.4 * a7;                    // e 0, mu 0.5: Holman-Wiegert 2.39
  var closeOk = inner >= 1.15 * aCrit;
  /* Gaps where a Jupiter fits: mutual Hill radius RH = ((m1+m2)/3M)^(1/3) (a1+a2)/2. */
  var gaps = [];
  for (var i = 0; i + 1 < planets.length; i++) {
    var p = planets[i], q = planets[i + 1];
    var a1 = p.orbit.a / AU, a2 = q.orbit.a / AU;
    var mid = Math.sqrt(a1 * a2);
    var rh1 = Math.cbrt((p.mass + MJUP) / (3 * root.mass)) * (a1 + mid) / 2;
    var rh2 = Math.cbrt((q.mass + MJUP) / (3 * root.mass)) * (mid + a2) / 2;
    var ok = (mid - a1) >= 9 * rh1 && (a2 - mid) >= 9 * rh2;
    var S = root.luminosity / (mid * mid);
    if (ok) gaps.push({ mid: mid, S: S });
  }
  var warmGap = gaps.filter(function (x) { return x.S >= 0.55 && x.S <= 1.6; })[0] || null;
  var outerGap = (function () {
    var last = planets[planets.length - 1], a = last.orbit.a / AU;
    /* past the last planet: 9 mutual Hill radii outward */
    var rh = Math.cbrt((last.mass + MJUP) / (3 * root.mass)) * a;
    var at = a + 10 * rh;
    return { at: at, S: root.luminosity / (at * at) };
  })();
  rows.push({ name: st.name, cls: root.type, M: M, L: root.luminosity, inner: inner, outer: outer,
              a7: a7, closeOk: closeOk, warmGap: warmGap, outerWarm: outerGap.S >= 0.55 });
});
function q(arr, f) { arr = arr.slice().sort(function (a, b) { return a - b; }); return arr[Math.floor(f * (arr.length - 1))]; }
console.log(rows.length + ' systems');
console.log('innermost planet AU  p10 ' + q(rows.map(function (r) { return r.inner; }), 0.1).toFixed(3) +
            '  p50 ' + q(rows.map(function (r) { return r.inner; }), 0.5).toFixed(3));
console.log('a_bin at 7 d (AU)    p50 ' + q(rows.map(function (r) { return r.a7; }), 0.5).toFixed(4));
console.log('close pair fits without moving a planet: ' + rows.filter(function (r) { return r.closeOk; }).length);
console.log('outermost planet AU  p50 ' + q(rows.map(function (r) { return r.outer; }), 0.5).toFixed(1) +
            '  p90 ' + q(rows.map(function (r) { return r.outer; }), 0.9).toFixed(1) +
            '  max ' + q(rows.map(function (r) { return r.outer; }), 1).toFixed(1));
console.log('a gap in the warm zone that holds a Jupiter: ' + rows.filter(function (r) { return r.warmGap; }).length);
console.log('...or warm room past the last planet: ' + rows.filter(function (r) { return r.outerWarm; }).length);
var byCls = {};
rows.forEach(function (r) { var c = r.cls.charAt(0); byCls[c] = byCls[c] || [0, 0, 0]; byCls[c][0]++; if (r.closeOk) byCls[c][1]++; if (r.warmGap) byCls[c][2]++; });
console.log('by class [systems, close fits, warm gap]: ' + JSON.stringify(byCls));
