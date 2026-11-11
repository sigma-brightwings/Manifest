/* magnetosphere.test.js - a seeded magnetic field per world, and the aurorae
 * and atmospheric envelope drawn from it (2026-11-10).
 *
 *     node test/magnetosphere.test.js
 *
 * What this holds:
 *   - SAME SEED, SAME FIELD; opts.noMagnetosphere leaves every field out and
 *     NOTHING else in the system moves (the field has its own substream);
 *   - THE DISTRIBUTION over a sample of systems: every giant has one, ice
 *     giants lean hard, rock is a chance by type, fields are in range;
 *   - THE GEOMETRY: GL.magAxis is a unit vector tilted by the field's tilt
 *     off the spin axis, and it turns with the world's phase;
 *   - THE PICTURE: the planet shader carries the aurora and the envelope.
 * The shader's GLSL is proven in the browser, not here: node cannot compile it.
 */
global.window = global;
require('../src/vec3.js');
require('../src/rng.js');
require('../src/kepler.js');
require('../src/economy.js');
var Gen = require('../src/generate.js');
var Galaxy = require('../src/galaxy.js');
require('../src/rings.js');
require('../src/sim.js');
require('../src/weather.js');
var GL = require('../src/gl.js');

var pass = 0, fail = 0;
function check(n, c, d) {
  if (c) { pass++; if (d) console.log('  ok   ' + n + '   ' + d); }
  else { fail++; console.log('  FAIL  ' + n + (d ? '   ' + d : '')); }
}

var gal = Galaxy.build('kawartha');
var STARS = gal.stars.slice(0, 40);

/* Everything a system is built from, minus the field. If the pass took a
 * draw or moved anything, this changes. */
function project(sy) {
  return JSON.stringify(sy.bodies.map(function (b) {
    return [b.id, b.type, b.mass, b.radius, b.rotation, b.atmosphere, b.tidallyLocked];
  })) + JSON.stringify(sy.ports.map(function (p) {
    return [p.id, p.lat, p.lon, p.radius, p.faction];
  })) + JSON.stringify((sy.traffic || []).map(function (r) {
    return [r.id, r.from, r.to, r.period, r.t0];
  }));
}

console.log('--- same seed, same field; nothing else moves ---');
var determinism = true, sameRest = true, offClean = true, worlds = 0;
var byType = {}, giants = 0, giantsWith = 0, iceTiltOk = true, rangeOk = true, noAirField = 0;
STARS.forEach(function (st) {
  var o = Galaxy.systemOpts(gal, st);
  var a = Gen.generateSystem(st.seed, o), b = Gen.generateSystem(st.seed, o);
  var off = Gen.generateSystem(st.seed, Object.assign({}, o, { noMagnetosphere: true }));
  var fa = a.bodies.map(function (x) { return JSON.stringify(x.magnetosphere); }).join('|');
  var fb = b.bodies.map(function (x) { return JSON.stringify(x.magnetosphere); }).join('|');
  if (fa !== fb) determinism = false;
  if (project(a) !== project(off)) sameRest = false;
  off.bodies.forEach(function (x) { if (x.magnetosphere !== undefined) offClean = false; });
  a.bodies.forEach(function (x) {
    if (x.kind !== 'planet' && x.kind !== 'moon') return;
    worlds++;
    var m = x.magnetosphere;
    if (x.kind === 'planet') {
      var t = byType[x.type] || (byType[x.type] = { n: 0, has: 0 });
      t.n++; if (m) t.has++;
    }
    if (x.type === 'gasGiant' || x.type === 'iceGiant') {
      giants++; if (m) giantsWith++;
      if (m && x.type === 'iceGiant' && m.tilt < 39 * Math.PI / 180) iceTiltOk = false;
    }
    if (m) {
      if (!(m.strength > 0 && m.strength <= 1 && m.tilt >= 0 && m.tilt < Math.PI / 2 &&
            m.activity >= 0.3 && m.activity <= 1 && isFinite(m.az))) rangeOk = false;
      if (!(x.atmosphere && x.atmosphere.rho0 > 0)) noAirField++;
    }
  });
});
check('same seed gives the same fields', determinism);
check('opts.noMagnetosphere moves nothing else', sameRest);
check('and leaves no field on any world', offClean);
check('every giant has a field', giants > 0 && giants === giantsWith, giantsWith + '/' + giants);
check('ice giants lean like Uranus and Neptune', iceTiltOk);
check('every field is in range', rangeOk);
var rows = Object.keys(byType).sort().map(function (k) {
  return k + ' ' + byType[k].has + '/' + byType[k].n;
});
console.log('  fields by type over ' + STARS.length + ' systems, ' + worlds + ' worlds: ' + rows.join(', '));
check('some rock has a field and some does not',
      Object.keys(byType).some(function (k) { return byType[k].has > 0 && byType[k].has < byType[k].n; }));
console.log('  fields over airless worlds (read by a magnetometer, no aurora): ' + noAirField);

console.log('--- the geometry ---');
(function () {
  var ax = { x: 0.3, y: 0.8, z: 0.52 };
  var l = Math.sqrt(ax.x * ax.x + ax.y * ax.y + ax.z * ax.z);
  ax = { x: ax.x / l, y: ax.y / l, z: ax.z / l };
  var mag = { tilt: 0.4, az: 1.1, strength: 0.5, activity: 0.5 };
  var ok = true, tiltOk = true, moves = false, prev = null;
  for (var ph = 0; ph < 6.3; ph += 0.7) {
    var m = GL.magAxis(mag, ax, ph);
    var len = Math.sqrt(m.x * m.x + m.y * m.y + m.z * m.z);
    if (Math.abs(len - 1) > 1e-9) ok = false;
    var ang = Math.acos(m.x * ax.x + m.y * ax.y + m.z * ax.z);
    if (Math.abs(ang - mag.tilt) > 1e-9) tiltOk = false;
    if (prev && (Math.abs(prev.x - m.x) > 1e-6 || Math.abs(prev.y - m.y) > 1e-6)) moves = true;
    prev = m;
  }
  check('the magnetic axis is a unit vector', ok);
  check('and leans exactly its tilt off the spin axis', tiltOk);
  check('and turns with the world', moves);
  var flat = GL.magAxis({ tilt: 0, az: 2, strength: 1, activity: 1 }, ax, 3);
  check('a field with no tilt sits on the spin axis',
        Math.abs(flat.x - ax.x) < 1e-9 && Math.abs(flat.y - ax.y) < 1e-9 && Math.abs(flat.z - ax.z) < 1e-9);
})();

console.log('--- the envelope scales with the air ---');
(function () {
  var gas = GL.haloThickness({ atmosphere: { scaleHeight: 41 } }, 0.8);
  var thin = GL.haloThickness({ atmosphere: { scaleHeight: 7 } }, 0.8);
  var earth = GL.haloThickness({ atmosphere: { scaleHeight: 8.8 } }, 0.8);
  check('a gas giant has a deeper shell than a thin world', gas > earth && earth > thin,
        thin.toFixed(3) + ' < ' + earth.toFixed(3) + ' < ' + gas.toFixed(3));
  check('but never a different planet (clamped)', gas <= earth * 1.71 && thin >= earth * 0.74);
})();

console.log('--- the picture ---');
(function () {
  var src = GL.planetShaderSource();
  ['uMag', 'uAurA', 'uAurB', 'uAurT', 'uHaloH', 'auroraAt'].forEach(function (k) {
    check('the planet shader carries ' + k, src.indexOf(k) >= 0);
  });
  check('and no placeholder survived', !/@[A-Z0-9_]+@/.test(src));
})();

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
