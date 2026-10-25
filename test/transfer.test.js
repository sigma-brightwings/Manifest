/* transfer.test.js — getting in and out of the 24-09 ports the way the art
 * says you do.
 *
 *     node test/transfer.test.js
 *
 * Astra, 2026-09-24:
 *   - S and M hulls reach their bays through the L bay entrances, carried
 *     by the cargo elevators ("In Cradle station, for example").
 *   - The ground stations (pad, mountain, runway, and their city-built
 *     forms) have their bays underground; the way down is the site's own.
 *   - "fix that bug where you're re-docked immediately after the ship
 *     doesn't launch."
 *   - "a 'request transfer to exit pad' which takes you back the way you
 *     came in."
 */
global.window = global.window || global;
var V = require('../src/vec3.js');
require('../src/economy.js');
var Gen = require('../src/generate.js');
var Sim = require('../src/sim.js');
require('../src/hulls.js');
require('../src/ports.js');
var Render = require('../src/render.js');
var Galaxy = require('../src/galaxy.js');

var pass = 0, fail = 0;
function check(n, c, d) {
  if (c) { pass++; console.log('  ok   ' + n + (d ? '   ' + d : '')); }
  else { fail++; console.log('  FAIL  ' + n + (d ? '   ' + d : '')); }
}

/* ---- every S/M berth of every orbital design has a way in ------------- */
console.log('--- S/M in through the L bay ---');
var lib = global.PortLib, smTotal = 0, smRouted = 0, missing = [];
Object.keys(lib).forEach(function (id) {
  var m = lib[id];
  var b = m && m.anchors && m.anchors.berths;
  if (!b || m.entrances) return;                       // ground sites below
  var hasL = b.some(function (x) { return x.cls === 'L'; });
  if (!hasL) return;
  b.forEach(function (x) {
    if (x.cls !== 'SM') return;
    smTotal++;
    if (typeof x.entry === 'number' && x.via) smRouted++;
    else missing.push(id + ':' + x.node);
  });
});
check('every S/M berth behind an L bay has a route in', smTotal > 0 && smRouted === smTotal,
      smRouted + '/' + smTotal + (missing.length ? '  missing ' + missing.slice(0, 6).join(' ') : ''));
['cradle-m', 'cradle-l'].forEach(function (id) {
  var m = lib[id];
  var n = m ? m.anchors.berths.filter(function (x) { return x.cls === 'SM' && x.via; }).length : 0;
  check(id + ': the small bays are reached by way of the heavy bay', n > 0 && !!m.carriers,
        n + ' routed, ' + (m && m.carriers ? m.carriers.length : 0) + ' carrier volume(s)');
});

/* AND THE HEAVY BAY THEY COME IN BY IS ONE YOU CAN FLY TO: a route in
 * through a bay with no clear line to open space is no way in at all. */
(function () {
  var fx = Gen.generateSystem('arrival-sweep').ports.filter(function (p) { return !p.surface; })[0];
  var shut = [], entries = 0;
  Object.keys(lib).forEach(function (id) {
    var m = lib[id];
    if (!m.anchors || !m.anchors.berths || m.entrances || /-site-/.test(id)) return;
    Render.assignPort('orbital', id);
    var n = Gen.modelledBerths(fx).length, seen = {};
    for (var i = 0; i < n; i++) {
      var r = Gen.berthRoute(fx, i);
      if (!r || seen[r.entry]) continue;
      seen[r.entry] = true;
      entries++;
      var ap = Gen.berthApertures(fx, r.entry);
      if (!ap || ap.reachable === false) shut.push(id + ' berth ' + r.entry);
    }
  });
  Render.assignPort('orbital', null);
  check('every heavy bay a route comes in by is reachable from open space', entries > 0 && shut.length === 0,
        (entries - shut.length) + '/' + entries + (shut.length ? '  shut: ' + shut.slice(0, 6).join(', ') : ''));
})();

/* ---- the ground sites ------------------------------------------------- */
console.log('--- the ground sites ---');
var gTotal = 0, gRouted = 0;
Object.keys(lib).forEach(function (id) {
  var m = lib[id];
  if (!/-site-[sml]$/.test(id) || !m.entrances) return;
  (m.anchors.berths || []).forEach(function (x) {
    gTotal++;
    if (typeof x.door === 'number' && x.doorVia && m.entrances[x.door]) gRouted++;
  });
});
check('every ground-site berth is reached from one of the site\'s entrances', gTotal > 0 && gRouted === gTotal,
      gRouted + '/' + gTotal);

var gal = Galaxy.build('kawartha');
function optsFor(st) {
  var fac = gal.factionById ? gal.factionById[st.factionId] : null;
  return fac ? { faction: fac, allFactions: gal.factions } : undefined;
}
var found = [];
for (var s = 0; s < gal.stars.length && found.length < 6; s++) {
  var sys = Gen.generateSystem(gal.stars[s].seed, optsFor(gal.stars[s]));
  (sys.ports || []).forEach(function (p) {
    if (found.length >= 6 || !p.surface || !p.docking) return;
    if (!/-site-[sml]$/.test(Render.portModelFor(p) || '')) return;
    if ((sys.pads || []).indexOf(p) < 0) return;
    found.push({ sys: sys, port: p });
  });
}
check('the galaxy has ground sites to land at', found.length > 0, found.length + ' sampled');

function newShip(pos, vel) {
  return { cls: 'courier', dryMass: 80, hullHp: 100, gear: true, thrusterCap: 10,
           pos: V.clone(pos), vel: V.clone(vel), cargo: {},
           fwd: { x: 1, y: 0, z: 0 }, up: { x: 0, y: 0, z: 1 }, right: { x: 0, y: -1, z: 0 },
           cleared: {} };
}

var routedRail = 0, rode = 0, noseUp = 0, stayedOut = 0, instantOut = 0, rearm = 0, openedOnce = 0;
found.forEach(function (f) {
  var sys = f.sys, port = f.port, t = 0;
  var st = Sim.bodyState ? Sim.bodyState(port, sys, t) : null;
  var sh = newShip(st ? st.pos : { x: 0, y: 0, z: 0 }, st ? st.vel : { x: 0, y: 0, z: 0 });
  Sim.dockShip(sh, port, sys, t);
  if (sh.docked !== port.id) return;
  var berth = sh.dockOffset.berth;
  var path = Sim.arrivalPath(port, berth);
  if (path && path.through && path.through.length >= 2) routedRail++;

  /* The transfer: the rail backwards, out to the pad. */
  sh.launchOk = 'x';
  Sim.undockShip(sh, sys, t, 0.003, { transfer: true });
  if (!sh.arrival || !sh.arrival.reverse) return;
  var dur = sh.arrival.dur, tt = t, steps = 0;
  while (sh.arrival && steps++ < 4000) { tt += 0.25; Sim.stepArrival(sh, sys, tt); }
  if (!sh.arrival && !sh.docked) rode++;
  var gb = Sim.groundBasis ? Sim.groundBasis(port, sys, tt) : null;
  if (gb && V.dot(sh.fwd, gb.up) > 0.95) noseUp++;
  if (sh.launchOk === null) openedOnce++;

  /* THE BUG: nothing on the throttle, sinking back onto the pad — several
   * frames INSIDE its envelope — and the pad must not take the ship back. */
  var psT = Sim.bodyState(port, sys, tt);
  sh.pos = V.clone(psT.pos); sh.vel = V.clone(psT.vel);
  for (var k = 0; k < 12; k++) { Sim.checkImpact(sh, sys, tt, true); }
  if (!sh.docked && !sh.arrival) stayedOut++;

  /* Asking for clearance again lets you back in without going anywhere. */
  sh.cleared[port.id] = true;
  Sim.checkImpact(sh, sys, tt, true);
  if (sh.docked === port.id || sh.arrival) rearm++;

  /* And the old instant launch (tests, a save restore) keeps you out too. */
  var sh2 = newShip(st.pos, st.vel);
  Sim.dockShip(sh2, port, sys, t);
  Sim.undockShip(sh2, sys, t, 0.003);
  for (var k2 = 0; k2 < 12; k2++) Sim.checkImpact(sh2, sys, t + k2 * 0.05, true);
  if (!sh2.docked && !sh2.arrival) instantOut++;
});
var n = found.length;
check('a ground berth\'s rail follows the site\'s own route down', routedRail === n, routedRail + '/' + n);
check('the exit-pad transfer rides the ship back out and lets go', rode === n, rode + '/' + n);
check('and hands it over nose to the sky', noseUp === n, noseUp + '/' + n);
check('the launch clearance is spent when the car reaches the top', openedOnce === n, openedOnce + '/' + n);
check('a ship that does not throttle up is NOT re-docked by the pad', stayedOut === n, stayedOut + '/' + n);
check('asking for clearance again lets you back in', rearm === n, rearm + '/' + n);
check('the instant launch keeps you out as well', instantOut === n, instantOut + '/' + n);

/* ---- and out of a small bay the way it came in, in orbit -------------- */
console.log('--- out through the heavy bay ---');
var orbTried = 0, orbOut = 0;
for (var s3 = 0; s3 < gal.stars.length && orbTried < 6; s3++) {
  var sy3 = Gen.generateSystem(gal.stars[s3].seed, optsFor(gal.stars[s3]));
  (sy3.ports || []).forEach(function (p) {
    if (orbTried >= 6 || p.surface || !p.docking) return;
    var n3 = (Gen.modelledBerths(p) || []).length, k3 = -1;
    for (var i3 = 0; i3 < n3; i3++) if (Gen.berthRoute(p, i3)) { k3 = i3; break; }
    if (k3 < 0) return;
    orbTried++;
    var st3 = Sim.bodyState(p, sy3, 0);
    var sh3 = newShip(st3.pos, st3.vel);
    Sim.dockShip(sh3, p, sy3, 0, k3);
    Sim.undockShip(sh3, sy3, 0, 0.003);
    var t3 = 0, n4 = 0;
    while (sh3.arrival && n4++ < 4000) { t3 += 0.25; Sim.stepArrival(sh3, sy3, t3); }
    for (var k4 = 0; k4 < 8; k4++) Sim.checkImpact(sh3, sy3, t3, true);
    if (!sh3.arrival && !sh3.docked && sh3.departed && sh3.departed.port === p.id) orbOut++;
  });
}
check('a small bay behind a heavy one is left the way it was entered', orbTried > 0 && orbOut === orbTried,
      orbOut + '/' + orbTried);

/* ---- down the ring's lift, not through its wall (2026-10-17) ----------
 * Astra: "passing internal elevator shafts in ring station; the ship
 * passes thru the wall instead of waiting for doors to open and then
 * sitting on the elevator pad." */
console.log('--- the airlock, then the lift ---');
(function () {
  var fx0 = Gen.generateSystem('arrival-sweep').ports.filter(function (p) { return !p.surface; })[0];
  /* A fresh id per model: Sim caches leg timings per port and berth, and
   * in the game a port never changes which model it wears. */
  var asModel = function (id) {
    Render.assignPort('orbital', id);
    return Object.assign({}, fx0, { id: fx0.id + '@' + id });
  };
  var fx;
  ['ring-s', 'ring-m', 'ring-l'].forEach(function (id) {
    fx = asModel(id);
    var n = (Gen.modelledBerths(fx) || []).length, b = -1;
    for (var i = 0; i < n; i++) if (Gen.berthRoute(fx, i)) { b = i; break; }
    if (b < 0) { check(id + ': has a routed small bay', false); return; }
    var path = Sim.arrivalPath(fx, b), legs = Sim.legsFor(fx, b);
    var sys = Gen.generateSystem('arrival-sweep');
    var ids = legs.map(function (L) { return L.id; }).join(',');
    check(id + ': the hull stops at the heavy bay for the airlock to cycle',
          ids === 'lineup,open,enter,settle,admit,board,lift,pad,transfer', ids);
    /* Slots: 3 the L stand, 6 on the car at the top, 7 the car's foot, 9 the stand. */
    var Ls = path[3], top = path[6], foot = path[7], stand = path[9];
    check(id + ': the hull goes STRAIGHT down the well and the shaft, not across',
          Math.abs(foot.x - Ls.x) < 1e-9 && Math.abs(foot.y - Ls.y) < 1e-9 &&
          Math.abs(top.x - Ls.x) < 1e-9 && Ls.z > top.z && top.z > foot.z + 0.1,
          'well ' + (Ls.z - top.z).toFixed(3) + ', shaft ' + (top.z - foot.z).toFixed(3));

    /* THE CAR RIDES WITH THE SHIP: the hull's run down the shaft is exactly
     * the car's travel, and the car's position is the hull's own eased u. */
    var car = global.PortLib[id].cars[0];
    check(id + ': the ride is exactly the car\'s travel',
          path.car === car.node && Math.abs((foot.z - top.z) - car.d[2]) < 1e-9,
          path.car + ' ride ' + (foot.z - top.z).toFixed(4) + ' vs d ' + car.d[2]);
    var acc = 0, starts = [];
    for (var k = 0; k < legs.length; k++) { starts.push(acc); acc += legs[k].dur; }
    var together = 0, sampled = 0;
    for (var s = 1; s < 10; s++) {
      var q = Sim.arrivalPose(fx, sys, 0, b, starts[6] + legs[6].dur * s / 10);
      if (!q) continue;
      sampled++;
      if (q.legId === 'lift' && q.car && Math.abs(q.car.f - q.u) < 1e-12) together++;
    }
    check(id + ': through the ride the car is exactly where the hull is', sampled === 9 && together === 9,
          together + '/' + sampled);
    var p0 = Sim.arrivalPose(fx, sys, 0, b, 0), pE = Sim.arrivalPose(fx, sys, 0, b, acc - 1e-6);
    var onBoard = Sim.arrivalPose(fx, sys, 0, b, starts[6] - 1e-6);
    check(id + ': the car waits at the top, and is home again when the rail ends',
          p0.car.f === 0 && onBoard.car.f === 0 && pE.car.f < 1e-6,
          'start ' + p0.car.f + ', boarded ' + onBoard.car.f + ', end ' + pE.car.f.toExponential(1));
    var midT = Sim.arrivalPose(fx, sys, 0, b, starts[8] + legs[8].dur * 0.4);
    check(id + ': and is still at the bottom while the hull rolls off it',
          midT && midT.car.f === 1, midT ? 'f ' + midT.car.f : 'no pose');
    check(id + ': it takes time to ride, then sits on the pad',
          legs[6].dur >= 4 && legs[7].dur > 0, legs[6].dur.toFixed(1) + ' s + ' + legs[7].dur + ' s');

    /* The hatch must be open by the time the hull leaves the stand. */
    var atDrop = Sim.arrivalPose(fx, sys, 0, b, starts[5] + 0.01);
    check(id + ': the floor hatch is open before the hull sinks through it',
          atDrop && atDrop.gates.inner < 0.01 && atDrop.legId === 'board',
          atDrop ? atDrop.legId + ' inner ' + atDrop.gates.inner.toFixed(3) : 'no pose');
    /* And the run across the spoke deck is level: off the car, onto the stand. */
    var pts = [foot].concat(path.through, [stand]), dzMax = 0;
    for (var qq = 1; qq < pts.length; qq++) dzMax = Math.max(dzMax, Math.abs(pts[qq].z - pts[0].z));
    check(id + ': the transfer rolls along the deck, no hop off the platform', dzMax < 0.005,
          'dz ' + dzMax.toFixed(4));

    /* ---- and the renderer draws the car there, and you hit it there ---- */
    var dd = Render.portDoors(id);
    var cars = dd.leaves.filter(function (l) { return l.car; });
    var hatches = dd.leaves.filter(function (l) { return l.hatch; });
    check(id + ': the car and its hatch come out of the hull as moving parts',
          cars.length === 1 && hatches.length === 2 && cars[0].mesh.f.length > 0,
          cars.length + ' car (' + (cars[0] ? cars[0].mesh.f.length : 0) + ' faces), ' + hatches.length + ' hatch panels');
    var Lmid = Gen.berthApertures(fx, Gen.berthRoute(fx, b).entry).mid;
    var down = [car.mid[0], car.mid[1], car.mid[2] + 0.05], up2 = [car.mid[0], car.mid[1], car.mid[2] - 0.05];
    var atRest = Render.leafHit(id, down, up2, { open: 0, inner: 1, berthMid: Lmid,
                                                  car: { node: car.node, f: 0 } });
    var gone = Render.leafHit(id, down, up2, { open: 0, inner: 1, berthMid: Lmid,
                                                car: { node: car.node, f: 1 } });
    var shut = Render.leafHit(id, down, up2, { open: 0, inner: 0, berthMid: Lmid,
                                                car: { node: car.node, f: 1 } });
    check(id + ': the car is solid where it is, and gone from where it was',
          !!atRest && !gone, 'at rest ' + (atRest ? 'hit' : 'miss') + ', ridden away ' + (gone ? 'hit' : 'miss'));
    check(id + ': and a shut hatch still closes the well', !!shut, shut ? 'hit' : 'miss');
  });
  /* A routed model with no lift under its heavy bay: no ride, no idling. */
  fx = asModel('cradle-m');
  var nC = (Gen.modelledBerths(fx) || []).length, bC = -1;
  for (var iC = 0; iC < nC; iC++) if (Gen.berthRoute(fx, iC)) { bC = iC; break; }
  if (bC >= 0) {
    var lc = Sim.legsFor(fx, bC);
    check('cradle-m: no car under the heavy bay, so board, lift and pad take no time',
          lc[5].dur === 0 && lc[6].dur === 0 && lc[7].dur === 0,
          lc[5].dur + ' / ' + lc[6].dur + ' / ' + lc[7].dur);
  }
  Render.assignPort('orbital', null);
})();

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
