/* orbitline.test.js — the orbit line, ahead solid and behind dotted.
 *
 *     node test/orbitline.test.js
 *
 * Astra, 2026-10-19: "orbit already traveled should be in dotted lines, or
 * orbit to be travelled, whichever reads easier". The half-period ahead of
 * the ship is solid and leaves it the way it is going; the half-period
 * behind is dotted and arrives at it. Split by TIME.
 */
global.window = global.window || global;
var V = require('../src/vec3.js');
require('../src/rng.js');
var K = require('../src/kepler.js');

var pass = 0, fail = 0;
function check(n, c, d) {
  if (c) { pass++; console.log('  ok   ' + n + (d ? '   ' + d : '')); }
  else { fail++; console.log('  FAIL  ' + n + (d ? '   ' + d : '')); }
}
var MU = 398600;                                   // an Earth, km^3/s^2

function orbitAt(r, vScale, tilt, radial) {
  var v = Math.sqrt(MU / r) * vScale;
  var pos = { x: r, y: 0, z: 0 };
  var vel = { x: (radial === undefined ? 0.1 : radial) * v, y: v * Math.cos(tilt), z: v * Math.sin(tilt) };
  return { pos: pos, vel: vel, el: K.elementsFromState(pos, vel, MU) };
}
function timeTo(el, Ea, Eb) {                      // flight time between two eccentric anomalies
  var Ma = Ea - el.e * Math.sin(Ea), Mb = Eb - el.e * Math.sin(Eb);
  var dM = K.wrapAngle(Mb - Ma);
  return dM / K.meanMotion(el.a, MU);
}
function anomalyOf(el, p) {                        // eccentric anomaly of a point on the orbit
  var r = V.len(p), e = el.e;
  var cosE = (1 - r / el.a) / e;
  return Math.acos(Math.max(-1, Math.min(1, cosE)));
}

/* "flat" is the case that caught the first version: an orbit with no
 * inclination at all, which is most orbits in a system laid out in a plane. */
[['flat, nearly circular', 1, 0], ['eccentric', 1.25, 0.3], ['very eccentric', 1.38, 1.1],
 ['falling', 0.8, 0.5], ['flat, retrograde', 1.1, Math.PI], ['flat, climbing hard', 1.2, 0, 0.6]].forEach(function (c) {
  var o = orbitAt(7000, c[1], c[2], c[3]);
  var el = o.el;
  var s = K.samplePathSplit(el, 240, o.pos);
  var tag = c[0] + ' (e ' + el.e.toFixed(2) + ')';
  var a0 = s.ahead[0], bN = s.behind[s.behind.length - 1];
  check(tag + ': the solid half starts at the ship', V.dist(a0, o.pos) < 1e-6 * 7000, V.dist(a0, o.pos).toExponential(1) + ' km');
  check(tag + ': the dotted half ends at the ship', V.dist(bN, o.pos) < 1e-6 * 7000);
  check(tag + ': the halves meet at the far end too',
        V.dist(s.ahead[s.ahead.length - 1], s.behind[0]) < 1e-6 * 7000);
  var dir = V.sub(s.ahead[1], s.ahead[0]);
  check(tag + ': the solid half leaves the way the ship is going', V.dot(dir, o.vel) > 0);
  var back = V.sub(bN, s.behind[s.behind.length - 2]);
  check(tag + ': the dotted half arrives the way the ship came', V.dot(back, o.vel) > 0);
  /* Half a period of flight: fly the ship forward half a period by brute
   * RK4 on two-body gravity, and it must land on the far end of the solid
   * half. Numerical on purpose — the closed-form propagator reads the same
   * anomaly that misled the first version, and a check that shares the bug
   * cannot see it. */
  var period = K.period(el.a, MU);
  var flown = (function () {
    var p = V.clone(o.pos), v = V.clone(o.vel), steps = 20000, dt = period / 2 / steps;
    function acc(q) { var r = V.len(q); return V.scale(q, -MU / (r * r * r)); }
    for (var k = 0; k < steps; k++) {
      var a1 = acc(p), v1 = v;
      var a2 = acc(V.addScaled(p, v1, dt / 2)), v2 = V.addScaled(v, a1, dt / 2);
      var a3 = acc(V.addScaled(p, v2, dt / 2)), v3 = V.addScaled(v, a2, dt / 2);
      var a4 = acc(V.addScaled(p, v3, dt)), v4 = V.addScaled(v, a3, dt);
      p = V.add(p, V.scale(V.add(V.add(v1, V.scale(V.add(v2, v3), 2)), v4), dt / 6));
      v = V.add(v, V.scale(V.add(V.add(a1, V.scale(V.add(a2, a3), 2)), a4), dt / 6));
    }
    return p;
  })();
  check(tag + ': the solid half is half a period of flying',
        V.dist(flown, s.ahead[s.ahead.length - 1]) < 1e-5 * 7000,
        'ends ' + V.dist(flown, s.ahead[s.ahead.length - 1]).toExponential(1) + ' km from where the ship is in P/2');
  check(tag + ': every sample lies on the orbit', s.ahead.concat(s.behind).every(function (p) {
    var r = V.len(p);
    return r >= el.periapsis * (1 - 1e-9) && r <= el.apoapsis * (1 + 1e-9);
  }));
});

/* On an eccentric orbit the time split is NOT the angle split: near
 * apoapsis half a period covers much less than half the loop. */
var mid = orbitAt(7000, 1.1, 0.2, 0.4);         // climbing, well away from either apse
var hs = K.samplePathSplit(mid.el, 240, mid.pos);
var aEnd = hs.ahead[hs.ahead.length - 1];
var sweep = Math.acos(Math.max(-1, Math.min(1, V.dot(hs.ahead[0], aEnd) / (V.len(hs.ahead[0]) * V.len(aEnd))))) * 180 / Math.PI;
check('time, not angle: half a period off the apses does not sweep half the loop',
      Math.abs(sweep - 180) > 5, 'e ' + mid.el.e.toFixed(2) + ', solid half sweeps ' + sweep.toFixed(1) + '°');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
