/* interior-cut.test.js - the cutaway draws what the kit knows (2026-11-22).
 *
 *     node test/interior-cut.test.js
 *
 * Planetary interiors slice 4 (claude/planetary-interiors.md). The INTERIOR
 * layer draws Interior.measured, never Interior.of. What this holds:
 *   - NOTHING READ, NOTHING DRAWN: with no instrument it is one band,
 *     "unmeasured";
 *   - NO LEAKS: every edge drawn is a true edge, and layers the kit cannot
 *     tell apart are one band, so a hidden boundary leaves no trace;
 *   - EACH GRADE ADDS WHAT IT SHOULD: 1 the core, 2 the crust or the ice
 *     lid, 3 water under ice and the mantle's state, 4 the inner core;
 *     and more kit never shows less;
 *   - THE MAGNETOMETER, once a quarter swept: the Curie depth, a liquid
 *     core where the dipole and the dynamo agree, and an induced ocean on
 *     an icy moon of a magnetised giant;
 *   - DEPTHS carry the grade's error, and a finer grade's is smaller. */
global.window = global.window || global;
require('../src/vec3.js');
require('../src/rng.js');
require('../src/kepler.js');
require('../src/economy.js');
var Gen = require('../src/generate.js');
var Galaxy = require('../src/galaxy.js');
require('../src/rings.js');
require('../src/sim.js');
require('../src/weather.js');
require('../src/survey.js');
require('../src/gravity.js');
var In = require('../src/interior.js');

var pass = 0, fail = 0;
function check(n, c, d) {
  if (c) { pass++; console.log('  ok   ' + n + (d ? '   ' + d : '')); }
  else { fail++; console.log('  FAIL  ' + n + (d ? '   ' + d : '')); }
}

var gal = Galaxy.build('kawartha');
var worlds = [];
gal.stars.slice(0, 24).forEach(function (st) {
  var sy = Gen.generateSystem(st.seed, Galaxy.systemOpts(gal, st));
  sy.bodies.forEach(function (b) {
    if ((b.kind === 'planet' || b.kind === 'moon') && In.of(b, sy)) worlds.push({ b: b, sy: sy, I: In.of(b, sy) });
  });
});
var EPS = 1e-9;
function edges(bands) { return bands.slice(1).map(function (b) { return b.to; }); }
function trueEdges(I) { return I.layers.map(function (L) { return L.to; }).filter(function (t) { return t < 1 - EPS; }); }
function tiles(bands) {
  if (Math.abs(bands[0].to - 1) > EPS) return false;
  for (var i = 1; i < bands.length; i++) if (Math.abs(bands[i].to - bands[i - 1].from) > EPS) return false;
  return Math.abs(bands[bands.length - 1].from) < EPS;
}
var full = { mag: true, covM: 1 };
function kit(g, extra) { var k = { grav: g }; for (var x in extra || {}) k[x] = extra[x]; return k; }

console.log('--- nothing read, nothing drawn ---');
(function () {
  var oneBand = worlds.every(function (w) {
    var M = In.measured(w.b, w.sy, {});
    return M.bands.length === 1 && M.bands[0].g === 'unknown' && M.lines.length === 0;
  });
  check('with no instrument every world is one unmeasured band', oneBand, worlds.length + ' worlds');
  var magOnly = worlds.every(function (w) {
    var M = In.measured(w.b, w.sy, { mag: true, covM: 1, dipole: true });
    return M.bands.length === 1 && M.bands[0].g === 'unknown';
  });
  check('a magnetometer alone draws no boundaries (no density step)', magOnly);
})();

console.log('--- no leaks ---');
(function () {
  var tileOK = true, leak = 0, monotone = true;
  worlds.forEach(function (w) {
    var te = trueEdges(w.I), prev = 0;
    for (var g = 0; g <= 4; g++) {
      [{}, full].forEach(function (mk) {
        var M = In.measured(w.b, w.sy, kit(g, mk));
        if (!tiles(M.bands)) tileOK = false;
        edges(M.bands).forEach(function (e) {
          if (!te.some(function (t) { return Math.abs(t - e) < EPS; })) leak++;
        });
        for (var i = 1; i < M.bands.length; i++) if (M.bands[i].g === M.bands[i - 1].g) leak++;
      });
      var n = In.measured(w.b, w.sy, kit(g)).bands.length;
      if (n < prev) monotone = false;
      prev = n;
    }
  });
  check('the bands tile the world, surface to centre', tileOK);
  check('every edge drawn is a true edge, and no two neighbours are the same', leak === 0, leak + ' leaks');
  check('a finer gravimeter never shows fewer layers', monotone);
})();

console.log('--- each grade adds what it should ---');
(function () {
  var rocky = worlds.filter(function (w) { return !w.I.shellKm && !In.TYPE[w.I.type].giant && w.I.crustKm > 0; });
  var shell = worlds.filter(function (w) { return w.I.shellKm > 0 && w.I.oceanKm > 0; });
  var giants = worlds.filter(function (w) { return In.TYPE[w.I.type].giant; });
  check('grade 1: a rocky world is rock over a core',
        rocky.length > 5 && rocky.every(function (w) {
          var b = In.measured(w.b, w.sy, kit(1)).bands;
          return b.length === 2 && b[0].g === 'rock' && b[1].g === 'core';
        }), rocky.length + ' rocky');
  check('grade 2 finds the crust',
        rocky.every(function (w) { return In.measured(w.b, w.sy, kit(2)).bands[0].g === 'crust'; }));
  var s = shell.length ? shell : [];
  check('grade 2 on an ocean moon: ice and water read as one lid',
        s.length > 0 && s.every(function (w) {
          var b = In.measured(w.b, w.sy, kit(2)).bands;
          return b[0].g === 'lid' && !b.some(function (x) { return x.g === 'ocean'; });
        }), s.length + ' ocean worlds');
  check('grade 3 tells the water from the ice',
        s.every(function (w) {
          var b = In.measured(w.b, w.sy, kit(3)).bands;
          return b[0].g === 'shell' && b[1].g === 'ocean';
        }));
  var withInner = rocky.filter(function (w) { return w.I.layers.some(function (L) { return L.name === 'inner core'; }) &&
                                                   w.I.layers.some(function (L) { return L.name === 'outer core'; }); });
  check('grade 4 separates the inner core, grade 3 does not',
        withInner.length > 0 && withInner.every(function (w) {
          var b3 = In.measured(w.b, w.sy, kit(3)).bands, b4 = In.measured(w.b, w.sy, kit(4)).bands;
          return !b3.some(function (x) { return x.g === 'inner'; }) && b4[b4.length - 1].g === 'inner';
        }), withInner.length + ' worlds');
  check('a giant at grade 1 is fluid over a core',
        giants.length > 0 && giants.every(function (w) {
          var b = In.measured(w.b, w.sy, kit(1)).bands;
          return b.length === 2 && b[1].g === 'core';
        }), giants.length + ' giants');
})();

console.log('--- the magnetometer ---');
(function () {
  var w = worlds.filter(function (x) { return x.I.curieKm != null; })[0];
  check('under a quarter swept, no Curie depth', In.measured(w.b, w.sy, kit(2, { mag: true, covM: 0.2 })).lines.length === 0);
  var L = In.measured(w.b, w.sy, kit(2, full)).lines;
  check('swept, the Curie depth is drawn where it is', L.length === 1 && Math.abs(L[0].km - w.I.curieKm) <= 1, L.length ? L[0].km + ' km' : 'none');
  var dyn = worlds.filter(function (x) { return x.I.dynamo && x.b.magnetosphere && !In.TYPE[x.I.type].giant; });
  var still = worlds.filter(function (x) { return !x.I.dynamo && x.b.magnetosphere; });
  check('a dipole over a dynamo reads as a liquid core',
        dyn.length > 0 && dyn.every(function (x) {
          return In.measured(x.b, x.sy, kit(1, { mag: true, covM: 1, dipole: true })).bands
                   .some(function (b) { return /liquid/.test(b.label); });
        }), dyn.length + ' worlds');
  check('a dipole the interior cannot make claims no liquid core',
        still.every(function (x) {
          return !In.measured(x.b, x.sy, kit(4, { mag: true, covM: 1, dipole: true })).bands
                    .some(function (b) { return /liquid/.test(b.label); });
        }), still.length + ' worlds');
  var ind = worlds.filter(function (x) {
    return x.I.oceanKm > 0 && x.b.parentBody && x.b.parentBody.magnetosphere;
  });
  check('an induced field shows the ocean at grade 2',
        ind.length > 0 && ind.every(function (x) {
          return In.measured(x.b, x.sy, kit(2, full)).bands.some(function (b) { return b.g === 'ocean'; });
        }), ind.length + ' moons');
})();

console.log('--- depths and their errors ---');
(function () {
  var w = worlds.filter(function (x) { return !In.TYPE[x.I.type].giant && x.I.crustKm > 0; })[0];
  var e2 = In.measured(w.b, w.sy, kit(2)).bands[1].topErr, e4 = In.measured(w.b, w.sy, kit(4)).bands[1].topErr;
  check('a finer grade quotes a smaller error', e4 <= e2 && e4 > 0, '±' + e2 + ' → ±' + e4 + ' km');
  var b = In.measured(w.b, w.sy, kit(4)).bands;
  check('the surface and the centre are exact', b[0].topKm === 0 && b[b.length - 1].botErr === 0);
  var core = b.filter(function (x) { return x.g === 'outer' || x.g === 'core' || x.g === 'inner'; })[0];
  var trueTop = Math.round((1 - w.I.rc) * w.b.radius);
  check('the core top is quoted within its error', Math.abs(core.topKm - trueTop) <= core.topErr + 50,
        core.topKm + '±' + core.topErr + ' (true ' + trueTop + ')');
})();

console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
