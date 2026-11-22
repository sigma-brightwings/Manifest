/* magnetometer.test.js - the field a world has, and the instrument that maps it
 * (2026-11-10).
 *
 *     node test/magnetometer.test.js
 *
 * Astra: "a magnetic field mapping function on the planetary scanner ...
 * Polar orbits are displayed as a top to bottom, left to right scanning of
 * the ship over the X,Y grid ... Use both heatmaps and field lines."
 * She chose a separate instrument and one-degree cells.
 *
 * What this holds:
 *   - the aurora's axis (GL.magAxis) and the survey's (Weather.magAxisWorld)
 *     are the same arithmetic, so the magnetometer reads the poles the
 *     aurora is drawn at;
 *   - the field map: a dipole's poles read about twice its equator; a dead
 *     rock still has anomalies over its ore; nothing at all where there is
 *     neither; the map is a function of the world (same twice);
 *   - the field lines run pole to pole from the poles the map has;
 *   - the instrument: a magnetometer alone maps the field and NOT the ore,
 *     a survey scanner alone maps the ore and NOT the field, and a polar
 *     orbit maps the whole field.
 */
global.window = global;
require('../src/vec3.js');
require('../src/rng.js');
require('../src/kepler.js');
require('../src/economy.js');
var Gen = require('../src/generate.js');
var Galaxy = require('../src/galaxy.js');
require('../src/rings.js');
var Sim = require('../src/sim.js');
var W = require('../src/weather.js');
var GL = require('../src/gl.js');
var Sv = require('../src/survey.js');
require('../src/gravity.js');
var In = require('../src/interior.js');     // slice 3: the anomalies are the interior's bodies
var V = global.V;

var pass = 0, fail = 0;
function check(n, c, d) {
  if (c) { pass++; console.log('  ok   ' + n + (d ? '   ' + d : '')); }
  else { fail++; console.log('  FAIL  ' + n + (d ? '   ' + d : '')); }
}

var gal = Galaxy.build('kawartha');
var systems = [];
for (var s = 0; s < gal.stars.length && s < 40; s++) {
  var o = Galaxy.systemOpts ? Galaxy.systemOpts(gal, gal.stars[s]) : {};
  var sy = Gen.generateSystem(gal.stars[s].seed, o);
  systems.push(sy);
}
function find(pred) {
  for (var i = 0; i < systems.length; i++) {
    var b = systems[i].bodies.filter(function (x) {
      return (x.kind === 'planet' || x.kind === 'moon') && pred(x, systems[i]);
    })[0];
    if (b) return { b: b, sys: systems[i] };
  }
  return null;
}

console.log('--- one axis for the aurora and the survey ---');
(function () {
  var ax = { x: 0.2, y: 0.9, z: 0.3875 };
  var l = Math.sqrt(ax.x * ax.x + ax.y * ax.y + ax.z * ax.z);
  ax = { x: ax.x / l, y: ax.y / l, z: ax.z / l };
  var same = true;
  [0, 1.3, 4.1].forEach(function (ph) {
    var m = { tilt: 0.5, az: 2.2, strength: 0.5, activity: 0.5 };
    var a = GL.magAxis(m, ax, ph), b = W.magAxisWorld(m, ax, ph);
    if (Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs(a.z - b.z) > 1e-12) same = false;
  });
  check('GL.magAxis and Weather.magAxisWorld agree', same);
  var w = find(function (b) { return b.magnetosphere; });
  var ma = W.magneticAxis(w.b);
  check('a world with a field has a body-fixed axis, a unit vector',
        ma && Math.abs(Math.sqrt(ma.x * ma.x + ma.y * ma.y + ma.z * ma.z) - 1) < 1e-9);
  var dead = find(function (b) { return !b.magnetosphere; });
  check('a world without one has none', W.magneticAxis(dead.b) === null);
})();

console.log('--- the field map ---');
(function () {
  var g = find(function (b) { return b.type === 'gasGiant' && b.magnetosphere; });
  var mm = Sv.magMap(g.b, g.sys);
  check('a giant has a dipole map', mm && mm.dipole && mm.max > 0);
  var ax = mm.axis, fr = Sv.spinFrame(g.b, 0), hi = 0, lo = 9, hiCell = 0;
  for (var i = 0; i < Sv.NCELL; i += 37) {
    var la = Math.floor(i / Sv.LON_BINS), lo2 = i % Sv.LON_BINS;
    var lat = -Math.PI / 2 + (la + 0.5) * Math.PI / Sv.LAT_BINS, lon = (lo2 + 0.5) * 2 * Math.PI / Sv.LON_BINS;
    var p = { x: Math.cos(lat) * Math.cos(lon) * fr.e1.x + Math.cos(lat) * Math.sin(lon) * fr.e2.x + Math.sin(lat) * fr.n.x,
              y: Math.cos(lat) * Math.cos(lon) * fr.e1.y + Math.cos(lat) * Math.sin(lon) * fr.e2.y + Math.sin(lat) * fr.n.y,
              z: Math.cos(lat) * Math.cos(lon) * fr.e1.z + Math.cos(lat) * Math.sin(lon) * fr.e2.z + Math.sin(lat) * fr.n.z };
    var sl = Math.abs(p.x * ax.x + p.y * ax.y + p.z * ax.z);
    if (sl > 0.97 && mm.field[i] > hi) hi = mm.field[i];
    if (sl < 0.08 && mm.field[i] < lo) lo = mm.field[i];
  }
  check('the poles read about twice the magnetic equator', hi / lo > 1.7 && hi / lo < 2.3, (hi / lo).toFixed(2));
  var again = Sv.magMap(g.b, g.sys);
  check('the map is cached per world', again === mm);
  var dead = find(function (b, sy) {
    if (b.magnetosphere || b.kind !== 'planet') return false;
    var m = Sv.groundMap(b, sy), I = In.of(b, sy);
    /* Ore a coil can hear: a magnetic body above the Curie depth. */
    return m && m.grade.ores && I && I.bodies.some(function (x) { return x.magnetic && x.kind === 'province'; });
  });
  if (dead) {
    var dm = Sv.magMap(dead.b, dead.sys);
    check('a dead rock has no dipole but anomalies over its ore', !dm.dipole && dm.max > 0.05 && dm.min < dm.max,
          dead.b.name + ' max ' + dm.max.toFixed(2));
  } else check('a dead rock with ore was found', false);
  var none = find(function (b) { return !b.magnetosphere && b.type === 'iceGiant'; }) ||
             find(function (b, sy) {
               /* Silent rock now means nothing magnetic in it at all, and no
                * old field frozen into its crust (slice 3). */
               var I = In.of(b, sy);
               return !b.magnetosphere && I && !(I.remanence > 0 && !I.dynamo) &&
                      !I.bodies.some(function (x) { return x.magnetic; });
             });
  if (none) {
    var nm = Sv.magMap(none.b, none.sys);
    check('no field and no ore reads nothing', nm.max === 0, none.b.name);
  }
})();

console.log('--- the field lines ---');
(function () {
  var g = find(function (b) { return b.magnetosphere && b.type === 'terran'; }) ||
          find(function (b) { return b.magnetosphere; });
  var fl = Sv.fieldLines(g.b, g.sys, 12);
  check('twelve lines, two poles', fl.lines.length === 12 && fl.poles.length === 2);
  var ok = true;
  fl.lines.forEach(function (ln) {
    if (Math.abs(ln[0][0] - fl.poles[0][0]) > 1e-6) ok = false;
    if (Math.abs(ln[ln.length - 1][0] - fl.poles[1][0]) > 1e-6) ok = false;
  });
  check('every line runs from one magnetic pole to the other', ok);
  check('the poles are opposite (latitudes sum to zero)', Math.abs(fl.poles[0][0] + fl.poles[1][0]) < 1e-9);
  var dead = find(function (b) { return !b.magnetosphere; });
  check('a world with no dipole has no lines', Sv.fieldLines(dead.b, dead.sys, 12).lines.length === 0);
})();

console.log('--- the instrument ---');
var LVL = 0, MAG = 1;
global.Combat = { surveyLevel: function () { return LVL; }, magLevel: function () { return MAG; } };
function turning(b) {
  return b.kind === 'planet' && b.type === 'rocky' && !(b.rotation && b.rotation.period > 3 * 86400);
}
var sys = systems.filter(function (x) { return x.bodies.some(turning); })[0];
var world = sys.bodies.filter(turning)[0];
function fly(inclDeg, totalSec, dt) {
  var G = { here: { id: 'test' }, ship: { pos: null, vel: null }, surveys: {} };
  var fr = Sv.spinFrame(world, 0), n = fr.n, e1 = fr.e1;
  var e2 = { x: n.y * e1.z - n.z * e1.y, y: n.z * e1.x - n.x * e1.z, z: n.x * e1.y - n.y * e1.x };
  var inc = inclDeg * Math.PI / 180;
  var q = { x: e2.x * Math.cos(inc) + n.x * Math.sin(inc), y: e2.y * Math.cos(inc) + n.y * Math.sin(inc),
            z: e2.z * Math.cos(inc) + n.z * Math.sin(inc) };
  var r = world.radius * 1.3, mu = 6.6743e-20 * world.mass, om = Math.sqrt(mu / (r * r * r));
  for (var t = 0; t <= totalSec; t += dt) {
    var bs = Sim.bodyState(world, sys, t), c = Math.cos(om * t), sn = Math.sin(om * t);
    G.ship.pos = V.add(bs.pos, { x: (e1.x * c + q.x * sn) * r, y: (e1.y * c + q.y * sn) * r, z: (e1.z * c + q.z * sn) * r });
    G.ship.vel = V.add(bs.vel, { x: (-e1.x * sn + q.x * c) * r * om, y: (-e1.y * sn + q.y * c) * r * om, z: (-e1.z * sn + q.z * c) * r * om });
    Sv.step(G, sys, t, t === 0 ? 0 : dt);
  }
  return { rec: G.surveys['test:' + world.id], period: 2 * Math.PI / om };
}
var P = fly(90, 1, 1).period;
LVL = 0; MAG = 1;
var onlyMag = fly(88, P * 12, P / 200);
check('a magnetometer alone makes a record', !!onlyMag.rec);
check('a polar orbit maps the whole field', onlyMag.rec && onlyMag.rec.covM > 0.9, onlyMag.rec && Math.round(onlyMag.rec.covM * 100) + '%');
check('and maps no ore', onlyMag.rec && !(onlyMag.rec.cov > 0));
LVL = 1; MAG = 0;
var onlyScan = fly(88, P * 12, P / 200);
check('a survey scanner alone maps the ore', onlyScan.rec && onlyScan.rec.cov > 0.9);
check('and not the field', onlyScan.rec && !(onlyScan.rec.covM > 0));
LVL = 1; MAG = 1;
var both = fly(88, P * 12, P / 200);
check('both together map both', both.rec.cov > 0.9 && both.rec.covM > 0.9);
LVL = 0; MAG = 1;
var eqOnly = fly(0, P * 12, P / 200);
check('an equatorial orbit maps a band of the field, not the world', eqOnly.rec.covM > 0.1 && eqOnly.rec.covM < 0.7,
      Math.round(eqOnly.rec.covM * 100) + '%');

console.log('--- the fitting ---');
try {
  var C = require('../src/combat.js');
  var it = (C.EQUIPMENT || {}).magnetometer;
  check('the magnetometer is a utility item with its own group', it && it.slot === 'utility' && it.kind === 'magnet' && it.uniqueGroup === 'magnet');
  check('and it fits beside a survey scanner (different group)', it && C.EQUIPMENT.surveyscan.uniqueGroup !== it.uniqueGroup);
} catch (e) {
  console.log('  (combat.js not loadable standalone: ' + e.message + ')');
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
