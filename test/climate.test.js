/* climate.test.js - the weather has a climate (2026-11-22).
 *
 *     node test/climate.test.js
 *
 * Weather was a noise field cut at one level per world. Now the cut moves
 * with the general circulation (weather.js climateWet). What this holds:
 *   - THE BELTS: the rain belt under the sun is wetter than the dry belts
 *     at 30 degrees, the storm tracks are wetter than the dry belts, the
 *     poles are drier than the equator, and the rain belt follows the sun;
 *   - THE GROUND: open water is wetter than high land, a windward slope
 *     wetter than its lee;
 *   - THE WORLD KEEPS ITS CLOUD: averaged over the sphere the multiplier
 *     is 1, so the generator's cloud column means what it was tuned to;
 *   - WHO HAS NONE: giants, twilight worlds and airless rock are left at 1;
 *   - SEASONS: a tilted world's sun wanders north and south over its year;
 *   - THE SHADER has the same function with every number filled in. */
global.window = global.window || global;
require('../src/vec3.js');
require('../src/rng.js');
require('../src/kepler.js');
require('../src/economy.js');
var Gen = require('../src/generate.js');
var Galaxy = require('../src/galaxy.js');
var Sim = require('../src/sim.js');
var W = require('../src/weather.js');

var pass = 0, fail = 0;
function check(n, c, d) {
  if (c) { pass++; console.log('  ok   ' + n + (d ? '   ' + d : '')); }
  else { fail++; console.log('  FAIL  ' + n + (d ? '   ' + d : '')); }
}
var D = Math.PI / 180;
function cw(lat, opt) {
  opt = opt || {};
  return W.climateWet(lat * D, (opt.sub || 0) * D, opt.sea || 0, opt.elev == null ? 0.5 : opt.elev,
                      opt.up == null ? (opt.elev == null ? 0.5 : opt.elev) : opt.up, opt.ocean || 0.5, opt.ice || 0, 1);
}

console.log('--- the belts ---');
check('the rain belt is wetter than the dry belts', cw(0).wet > cw(30).wet + 0.5, cw(0).wet.toFixed(2) + ' vs ' + cw(30).wet.toFixed(2));
check('the storm tracks are wetter than the dry belts', cw(57).wet > cw(30).wet + 0.3, cw(57).wet.toFixed(2));
check('the poles are drier than the equator', cw(85).wet < cw(0).wet - 0.5, cw(85).wet.toFixed(2));
check('both hemispheres alike at equinox', Math.abs(cw(40).wet - cw(-40).wet) < 1e-9);
check('the rain belt follows the sun', cw(15, { sub: 23 }).wet > cw(-15, { sub: 23 }).wet + 0.3,
      cw(15, { sub: 23 }).wet.toFixed(2) + ' vs ' + cw(-15, { sub: 23 }).wet.toFixed(2));
check('storms are readier in the wet belts', cw(0).stormy > cw(30).stormy && cw(57).stormy > cw(30).stormy);

console.log('--- the ground ---');
check('open water is wetter than high land', cw(45, { sea: 1, elev: 0.3 }).wet > cw(45, { sea: 0, elev: 0.75 }).wet + 0.2);
check('a windward slope is wetter than its lee',
      cw(45, { elev: 0.62, up: 0.56 }).wet > cw(45, { elev: 0.56, up: 0.62 }).wet + 0.3);
check('ice holds little water', cw(70, { ice: 1 }).wet < cw(70).wet);
check('the prevailing wind: trades and polar easterlies from the east, westerlies from the west',
      W.zonalSign(10 * D) === -1 && W.zonalSign(45 * D) === 1 && W.zonalSign(80 * D) === -1);

console.log('--- the worlds ---');
var gal = Galaxy.build('kawartha'), worlds = [];
gal.stars.slice(0, 12).forEach(function (st) {
  var sy = Gen.generateSystem(st.seed, Galaxy.systemOpts(gal, st));
  sy.bodies.forEach(function (b) { if (b.kind === 'planet' || b.kind === 'moon') worlds.push({ b: b, sy: sy }); });
});
var on = worlds.filter(function (x) { return W.climateOn(x.b); });
var worst = 0;
on.slice(0, 25).forEach(function (x) {
  var s = 0, N = 900, ga = Math.PI * (3 - Math.sqrt(5));
  for (var i = 0; i < N; i++) {
    var z = 1 - (2 * i + 1) / N, r = Math.sqrt(1 - z * z), a = ga * i + 0.37;
    s += W.climateAtFixed(x.b, { x: r * Math.cos(a), y: r * Math.sin(a), z: z }, 0).wet;
  }
  worst = Math.max(worst, Math.abs(s / N - 1));
});
check('each world keeps its cloud: the sphere-mean multiplier is 1', on.length > 10 && worst < 0.04,
      on.length + ' worlds with climate, worst off by ' + (worst * 100).toFixed(1) + '%');
var giants = worlds.filter(function (x) { return /Giant/.test(x.b.type); });
var twi = worlds.filter(function (x) { return x.b.habitableBand === 'terminator' || x.b.habitableBand === 'equator'; });
var bare = worlds.filter(function (x) { return !x.b.atmosphere; });
check('giants, twilight worlds and airless rock have no climate term',
      giants.concat(twi, bare).every(function (x) {
        var c = W.climateAtFixed(x.b, { x: 0.3, y: 0.4, z: Math.sqrt(0.75) }, 0);
        return c.wet === 1 && c.stormy === 0;
      }), giants.length + ' giants, ' + twi.length + ' twilight, ' + bare.length + ' airless');
var x0 = on[0];
var p0 = { x: 0.6, y: 0, z: 0.8 };
check('same place, same climate', W.climateAtFixed(x0.b, p0, 0.1).wet === W.climateAtFixed(x0.b, p0, 0.1).wet);

console.log('--- seasons ---');
var tilted = on.filter(function (x) { return x.b.rotation && Math.abs(x.b.rotation.tilt) > 0.2 && x.b.kind === 'planet'; })[0];
if (tilted) {
  var P = tilted.b.orbit && tilted.b.orbit.period ? tilted.b.orbit.period : 3e7, lo = 9, hi = -9;
  for (var q = 0; q < 24; q++) {
    var s2 = W.subsolarLat(tilted.b, tilted.sy, q * P / 24);
    if (s2 < lo) lo = s2; if (s2 > hi) hi = s2;
  }
  var tilt = Math.abs(tilted.b.rotation.tilt);
  check('a tilted world\'s sun wanders as far as its tilt, both ways',
        Math.abs(hi - tilt) < 0.12 && Math.abs(lo + tilt) < 0.12,
        tilted.b.name + ' tilt ' + (tilt / D).toFixed(1) + ', sun ' + (lo / D).toFixed(1) + ' to ' + (hi / D).toFixed(1));
} else check('a tilted world with a climate was found', false);

console.log('--- the shader ---');
/* Read as source, as weather.test.js reads it: the @NAME@ tokens are
 * filled from Weather.K when gl.js builds the shader, so every one the
 * climate uses must exist there. */
(function () {
  var src = require('fs').readFileSync(require('path').join(__dirname, '..', 'src', 'gl.js'), 'utf8');
  check('the shader carries climateWet and elevFixed',
        /vec2 climateWet\(float lat, float sub, float sea, float elev, float elevUp, float ocean, float ice, float wetSea\)/.test(src) &&
        /float elevFixed\(vec3 p\)/.test(src));
  var toks = (src.match(/@CL_[A-Z_]+@/g) || []).map(function (t) { return t.slice(1, -1); });
  var missing = toks.filter(function (t) { return W.K[t] === undefined; });
  check('every climate number it uses is in Weather.K', toks.length >= 15 && missing.length === 0,
        toks.length + ' uses, missing: ' + (missing.join(' ') || 'none'));
  check('the cloud cut and the storm threshold both read it',
        /clamp\(uCloud \* clim\.x, 0\.0, 1\.0\)/.test(src) && /float sLo = @STORM_LO@ - clim\.y \* @CL_STORM_SHIFT@;/.test(src));
  check('the season is the sun on the spin axis, as subsolarLat has it',
        /asin\(clamp\(dot\(uSunDir, uSpinAxis\), -1\.0, 1\.0\)\)/.test(src));
  check('gl.js hands it the world\'s own mean', /WxC\.climateNorm\(b\)/.test(src));
})();

console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
