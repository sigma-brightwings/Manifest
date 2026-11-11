/* lanes.test.js — the cargo lifts inside the stations keep their promise.
 *
 *     node test/lanes.test.js
 *
 * Astra, 2026-11-09, with a screenshot from inside Meridian Depot: "ship is
 * still not sitting on the elevator pad, and elevator pad is at the top of
 * the shaft when ship is being moved from inside the station to the launch
 * pad. The elevator pad on the cargo lifts must be waiting for the ship by
 * the time it gets there. The ship must follow a linear path." And her
 * drawing of the inclined lift: the pad level the whole way, flush in a
 * recess at the foot, flush with the floor at the head, the ship driving
 * straight on at the bottom and straight off at the top.
 *
 * Swept over every orbital model whose routed berths ride a lift on the
 * way across (Sim routePhases), arrival and — by running the same pure
 * timeline backwards — departure.
 */
global.window = global.window || global;
require('../src/vec3.js');
require('../src/economy.js');
var Gen = require('../src/generate.js');
var Sim = require('../src/sim.js');
require('../src/hulls.js');
require('../src/ports.js');
var Render = require('../src/render.js');

var pass = 0, fail = 0;
function check(n, c, d) { if (c) pass++; else { fail++; console.log('  FAIL  ' + n + (d ? '   ' + d : '')); } }

var lib = global.PortLib;
var fx = Gen.generateSystem('arrival-sweep').ports.filter(function (p) { return !p.surface; })[0];
var r = fx.radius || 1;
var keep = Render.portModelFor;

var rides = 0, late = [], parted = [], jumped = [], moved = [], tilted = [], unseated = [];
var worstGap = 0, worstEarly = Infinity, waits = 0;
Object.keys(lib).forEach(function (id) {
  var m = lib[id];
  if (!m || m.kind !== 'orbital' || !m.anchors || !m.anchors.berths || /-site-/.test(id)) return;
  Render.portModelFor = function () { return id; };
  fx.radius = r + 1e-9 * Math.random();                 // a fresh cache key per model
  var lm = Render.libPort(id);
  var n = Gen.modelledBerths(fx).length;
  for (var i = 0; i < n; i++) {
    if (!Gen.berthRoute(fx, i)) continue;
    var p = Sim.arrivalPath(fx, i);
    if (!p || !p.rideMover || !p.rideS) continue;
    var ph = Sim.routePhases(p, fx.radius);
    if (!ph) continue;
    rides++;
    var tag = id + ' b' + i;
    /* The index entry has the car's box and axis; the built library its deck. */
    var mv = (m.movers || []).filter(function (q) { return q.node === p.rideMover; })[0];
    var mvB = ((lm && lm.movers) || []).filter(function (q) { return q.node === p.rideMover; })[0];
    if (!mv) { unseated.push(tag + ' rides ' + p.rideMover + ', which the model does not have'); continue; }
    var deck = mvB && typeof mvB.deck === 'number' ? mvB.deck : mv.max[2];
    var ax = mv ? mv.axis : [0, 0, 1];

    /* 1. The car is at her end, still, CAR_EARLY before she drives onto it. */
    var tDoor = ph.d1a + ph.wait;
    var sDoor = Sim.moverAt(ph, Math.max(0, tDoor - Sim.CAR_EARLY + 1e-6));
    if (Math.abs(sDoor - ph.S[0]) > 1e-9) late.push(tag + ' ' + (sDoor - ph.S[0]).toExponential(2));
    if (ph.wait > 0) waits++;
    /* How early, measured: the last moment the car was still moving before she left the door. */
    var tc = tDoor;
    while (tc > 0 && Math.abs(Sim.moverAt(ph, tc) - ph.S[0]) < 1e-12) tc -= 0.05;
    worstEarly = Math.min(worstEarly, tDoor - tc);

    /* 2. Sampled through the whole leg: the car never jumps, never moves while
     *    she is getting on or off, and carries her the whole ride with its
     *    deck the same distance under her keel. */
    var dt = 0.05, prevS = null, prevPh = null, gap0 = null;
    for (var t = 0; t <= ph.total + 1e-9; t += dt) {
      var s = Sim.moverAt(ph, t), rp = Sim.ridePoint(ph, t);
      if (prevS !== null && Math.abs(s - prevS) > 0.02) { jumped.push(tag + ' t' + t.toFixed(2)); break; }
      /* Within the phase: the first sample of `alight` follows the last of
       * `ride`, which moved, by construction. */
      if ((rp.phase === 'board' || rp.phase === 'alight') && prevPh === rp.phase && Math.abs(s - prevS) > 1e-9) { moved.push(tag + ' ' + rp.phase); break; }
      prevPh = rp.phase;
      if (rp.phase === 'ride') {
        var carZ = deck + ax[2] * s;
        var carXY = [mv.mid[0] + ax[0] * s, mv.mid[1] + ax[1] * s];
        var gap = rp.loc.z - carZ;
        if (gap0 === null) gap0 = gap;
        worstGap = Math.max(worstGap, Math.abs(gap - gap0) * fx.radius * 1000);
        if (Math.abs(gap - gap0) * fx.radius * 1000 > 0.5) { parted.push(tag + ' ' + ((gap - gap0) * fx.radius * 1000).toFixed(1) + ' m'); break; }
        var off = Math.hypot(rp.loc.x - carXY[0], rp.loc.y - carXY[1]) * fx.radius * 1000;
        if (off > 5) { unseated.push(tag + ' ' + off.toFixed(1) + ' m off the car'); break; }
      }
      prevS = s;
    }

    /* 3. On an inclined car, she drives on level and drives off level. */
    if (Math.abs(ax[2]) > 0.2 && Math.abs(ax[2]) < 0.95) {
      var on0 = ph.pl[ph.k - 1], on1 = ph.pl[ph.k], off0 = ph.pl[ph.k + 1], off1 = ph.pl[ph.k + 2];
      if (on0 && Math.abs(on1.z - on0.z) * fx.radius * 1000 > 0.5) tilted.push(tag + ' on ' + ((on1.z - on0.z) * fx.radius * 1000).toFixed(1) + ' m');
      if (off1 && Math.abs(off1.z - off0.z) * fx.radius * 1000 > 0.5) tilted.push(tag + ' off ' + ((off1.z - off0.z) * fx.radius * 1000).toFixed(1) + ' m');
    }
  }
});
Render.portModelFor = keep;

console.log('--- the lift is sent for her ---');
check('there are lifts ridden on the way to a berth', rides > 0, rides + ' rides');
check('every car is at her end, still, before she drives onto it', late.length === 0,
      (rides - late.length) + '/' + rides + (late.length ? '  late: ' + late.slice(0, 5).join(', ') : '') +
      '  (earliest margin ' + worstEarly.toFixed(2) + ' s; ' + waits + ' rides make her hold at the door)');
check('no car jumps', jumped.length === 0, jumped.slice(0, 5).join(', '));
check('no car moves while she is getting on or off', moved.length === 0, moved.slice(0, 5).join(', '));
check('she rides ON the car: her height over its deck never changes on the ride', parted.length === 0,
      'worst ' + worstGap.toFixed(2) + ' m' + (parted.length ? '  ' + parted.slice(0, 5).join(', ') : ''));
check('and she is over it, not beside it', unseated.length === 0, unseated.slice(0, 5).join(', '));
check('an inclined car is driven onto and off level (her drawing)', tilted.length === 0, tilted.slice(0, 6).join(', '));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
