/* weather.test.js — the sky a port reports, and the sky it is drawn with.
 *
 *     node test/weather.test.js
 *
 * gl.js paints a world's weather in a fragment shader and weather.js
 * evaluates the same field on the CPU so a port can say what it is like
 * down there. The functions have to exist twice, in two languages; the
 * NUMBERS must not. Most of this file is about that.
 */
global.window = global;
var Eco = require('../src/economy.js');
var Gen = require('../src/generate.js');
var Sim = require('../src/sim.js');
var W = require('../src/weather.js');
var GL = require('../src/gl.js');

var pass = 0, fail = 0;
function check(n, c, d) { if (c) pass++; else { fail++; console.log('  FAIL  ' + n + (d ? '   ' + d : '')); } }

console.log('--- one copy of every number ---');
(function () {
  var src = GL.planetShaderSource();
  check('the planet shader was built', src.length > 2000, src.length + ' chars');
  check('and no placeholder survived it', !/@[A-Z0-9_]+@/.test(src),
        (src.match(/@[A-Z0-9_]+@/g) || []).join(','));
  /* Every tunable weather.js owns has to be the number the picture uses.
   * Hand-edit one in the shader and the literal stops matching. */
  var missing = [];
  Object.keys(W.K).forEach(function (k) {
    if (src.indexOf(W.K[k].toFixed(5)) < 0) missing.push(k + '=' + W.K[k]);
  });
  check('every weather constant in the picture came from weather.js',
        missing.length === 0, missing.join(', '));
})();

console.log('--- the field, ported faithfully ---');
(function () {
  /* The thresholds were chosen against this distribution, measured on the
   * shader's arithmetic. If the JS port drifts from it the numbers stop
   * meaning what they were picked to mean — so the distribution is the
   * thing to pin, not the implementation. */
  var vals = [];
  for (var s = 0; s < 30; s++) {
    var seed = s * 1.7 * 37.13;
    for (var i = 0; i < 4000; i++) {
      var u = (i * 2654435761 % 100000) / 50000 - 1;
      var th = (i * 40503 % 100000) / 100000 * Math.PI * 2;
      var r = Math.sqrt(Math.max(0, 1 - u * u));
      vals.push(W.fbm(r * Math.cos(th) * 2.4 + seed,
                      r * Math.sin(th) * 2.4 + seed, u * 2.4 + seed));
    }
  }
  var mean = vals.reduce(function (a, b) { return a + b; }, 0) / vals.length;
  var sd = Math.sqrt(vals.reduce(function (a, b) {
    return a + (b - mean) * (b - mean); }, 0) / vals.length);
  var max = Math.max.apply(null, vals.slice(0, 60000));
  console.log('  mean ' + mean.toFixed(4) + '  sd ' + sd.toFixed(4) +
              '  max ' + max.toFixed(3) + '  (' + vals.length + ' samples)');
  check('the field still averages what the thresholds were picked against',
        Math.abs(mean - 0.470) < 0.012, mean.toFixed(4));
  check('and still has the spread they were picked against',
        Math.abs(sd - 0.105) < 0.012, sd.toFixed(4));
  /* THE TRAP THE OLD MAPPING FELL INTO. Thresholds above this are
   * thresholds nothing ever clears, and a world with no weather. */
  check('and never reaches the thresholds the old mapping asked for',
        max < 0.86 && W.K.THRESH_HI < max, max.toFixed(3) + ' vs ' + W.K.THRESH_HI);
})();

console.log('--- what a port says about its own sky ---');
(function () {
  var seeds = ['kawartha', 'elsewhere', 'holton', 'seed-9',
               'mirven', 'thalisa', 'zueth', 'seed-22', 'seed-31'];
  var ports = [];
  seeds.forEach(function (sd) {
    var sys = Gen.generateSystem(sd);
    sys.ports.forEach(function (p) { if (W.hasWeather(p)) ports.push({ p: p, sys: sys }); });
  });
  check('there are ports with air over them', ports.length > 8, ports.length + ' ports');
  if (!ports.length) return;

  /* PURE, like everything else that moves here: the sky at an hour is a
   * fact about the hour. */
  var a = W.report(ports[0].p, ports[0].sys, 12345);
  var b = W.report(ports[0].p, ports[0].sys, 12345);
  check('a given hour gives a given forecast',
        a.cloud === b.cloud && a.wind === b.wind && a.from === b.from);
  /* And it MOVES. Asking one later hour is not enough — a pad under clear
   * sky reads zero at both ends and the check passes on a frozen field. */
  var seenCloud = {}, seenWind = {};
  for (var q = 0; q < 24; q++) {
    var rq = W.report(ports[0].p, ports[0].sys, q * 2700);
    seenCloud[rq.cloud.toFixed(5)] = 1;
    seenWind[rq.wind.toFixed(4)] = 1;
  }
  check('and the air over a pad is never still for a day',
        Object.keys(seenWind).length > 8,
        Object.keys(seenWind).length + ' distinct winds in 24 readings');
  /* Cloud is a threshold, so a pad under permanently clear sky honestly
   * reads zero all day — asking ONE pad to see cloud move is asking the
   * weather to be somewhere in particular. Ask the cloudiest pad in the
   * sample instead, which is the one the question is about. */
  var wettest = null, wettestC = -1;
  ports.forEach(function (e) {
    var c = e.p.parentBody.atmosphere.cloud;
    if (c > wettestC) { wettestC = c; wettest = e; }
  });
  var skies = {};
  for (var q2 = 0; q2 < 40; q2++) {
    skies[W.report(wettest.p, wettest.sys, q2 * 2700).cloud.toFixed(4)] = 1;
  }
  check('and the cloud over the wettest world moves',
        Object.keys(skies).length > 6,
        Object.keys(skies).length + ' skies over 30 h at cloud ' + wettestC.toFixed(2));

  var cloudy = 0, stormy = 0, windLo = 1e9, windHi = 0, bad = 0, n = 0;
  var byWorld = {};
  ports.forEach(function (e) {
    for (var k = 0; k < 24; k++) {
      var r = W.report(e.p, e.sys, k * 3600);
      if (!r || r.airless) continue;
      n++;
      if (r.cloud > 0.5) cloudy++;
      if (r.storm > 0.3) stormy++;
      if (r.wind < windLo) windLo = r.wind;
      if (r.wind > windHi) windHi = r.wind;
      if (!(r.from >= 0 && r.from < 360)) bad++;
      if (!(r.vis >= 0 && r.vis <= 1)) bad++;
      var cv = e.p.parentBody.atmosphere.cloud;
      var g = byWorld[cv > 0.5 ? 'wet' : 'dry'] || (byWorld[cv > 0.5 ? 'wet' : 'dry'] = [0, 0]);
      g[0] += r.cloud; g[1]++;
    }
  });
  check('every reading is a real reading', bad === 0, bad + ' out of range');
  console.log('  ' + n + ' readings: ' + (100 * cloudy / n).toFixed(0) + '% over half cloud, ' +
              (100 * stormy / n).toFixed(0) + '% under a storm, wind ' +
              windLo.toFixed(1) + '-' + windHi.toFixed(1) + ' m/s');
  check('some skies are cloudy and some are not',
        cloudy > n * 0.04 && cloudy < n * 0.85, cloudy + ' of ' + n);
  check('storms are rarer than cloud', stormy < cloudy);
  check('the wind is a wind, not a hurricane everywhere',
        windLo >= 0 && windHi < 120, windLo.toFixed(1) + ' to ' + windHi.toFixed(1));
  /* The world's own cloudiness has to reach the forecast, or the column in
   * the generator is inert again — which is exactly the bug that made
   * every planet cloudless. */
  if (byWorld.wet && byWorld.dry) {
    var wet = byWorld.wet[0] / byWorld.wet[1], dry = byWorld.dry[0] / byWorld.dry[1];
    check('a wet world reports more cloud than a dry one', wet > dry * 1.4,
          wet.toFixed(3) + ' vs ' + dry.toFixed(3));
  }

  /* AND IT NEVER CALLS A VACUUM CLEAR. */
  var airless = null, sys0 = Gen.generateSystem('kawartha');
  sys0.ports.forEach(function (p) {
    if (!airless && p.parentBody && !p.parentBody.atmosphere &&
        (p.surface || p.underground)) airless = p;
  });
  if (airless) {
    var r = W.report(airless, sys0, 1000);
    check('a port with no air says so', r && r.airless);
    check('and is never described as clear', W.describe(r).indexOf('clear') < 0,
          W.describe(r));
  }
  check('a forecast reads as a sentence', /wind \d+ m\/s from \d{3}/.test(W.describe(a)),
        W.describe(a));
})();

console.log('');
console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
