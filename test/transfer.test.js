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

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
