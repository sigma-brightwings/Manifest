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
/* OR DOCKED AT ITS OWN DOOR, SAYING WHY (2026-11-04). Every bay whose only
 * "route" in was an elevator bridge - a straight line through whatever lay
 * between two decks - was a hull through the structure at the exact test
 * (interiors.test: 58 of 166 inner legs). The converter now leaves such a
 * bay unrouted, docked at its own mouth, with the reason on the anchor. */
var lib = global.PortLib, smTotal = 0, smRouted = 0, missing = [], ownDoor = 0;
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
    else if (x.unrouted && /^(door|field|curtain)$/.test(x.kind || '')) ownDoor++;
    else missing.push(id + ':' + x.node);
  });
});
check('every S/M berth behind an L bay has a route in, or a door of its own and the reason it has no route',
      smTotal > 0 && smRouted + ownDoor === smTotal,
      smRouted + ' routed + ' + ownDoor + ' at their own doors / ' + smTotal + (missing.length ? '  missing ' + missing.slice(0, 6).join(' ') : ''));
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
  /* An ORBITAL-role port, the role the ring models are assigned to below:
   * since stars stage 2 the seed's first orbital port is a shipyard, which
   * wears the yard's model whatever 'orbital' is set to. */
  var fx0 = Gen.generateSystem('arrival-sweep').ports.filter(function (p) {
    return !p.surface && Render.portRole(p) === 'orbital';
  })[0];
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
    /* RIDDEN AWAY, THE SHAFT IS COVERED (2026-11-03). Astra: "when the
     * elevator is not there, there should be a blast door covering the
     * shaft". The hatch over the shaft is shut exactly while the car is
     * away (Render carShafts / partState), so where the car was is still
     * solid - the hatch, not the car - whatever the inner gate says. */
    var hatchOnly = Render.leafHit(id, down, up2, { open: 0, inner: 1, berthMid: Lmid,
                                                     car: { node: car.node, f: 1 } });
    check(id + ': the car is solid where it is, and its shaft is covered once it has gone',
          !!atRest && !!gone && !!hatchOnly, 'at rest ' + (atRest ? 'hit' : 'miss') + ', ridden away ' + (gone ? 'hit' : 'miss'));
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

/* ---- 2026-11-02: the transfer, and what it leaves you in ---------------
 * Astra: "when I was requesting being moved to the launch pad the ship just
 * clipped through walls instead of following the internal geometry of the
 * station"; "no elevators in internal elevator shafts"; "if anything
 * interrupts the 'move me to the launch pad' it softlocks the game"; "half
 * the ship was buried in the surface and I couldn't gain any altitude". */
(function () {
  console.log('--- the shed: down its own duct, inside its own hall ---');
  var sheds = [];
  for (var s5 = 0; s5 < gal.stars.length && sheds.length < 4; s5++) {
    var sy5 = Gen.generateSystem(gal.stars[s5].seed, optsFor(gal.stars[s5]));
    (sy5.ports || []).forEach(function (p) {
      if (sheds.length < 4 && p.surface && Render.portModelFor(p) === 'underground') sheds.push({ sys: sy5, port: p });
    });
  }
  check('the galaxy has procedural sheds to sample', sheds.length > 0, sheds.length + '');
  var outDuct = 0, outHall = 0, samples = 0, worst = 0;
  sheds.forEach(function (f) {
    var port = f.port, sys = f.sys, g = Gen.bayGeometry(port), r = port.radius;
    var duct = (g.mouthR + g.throatR) / 2;
    var basis = Sim.portBasis(port, sys, 0);
    for (var b = 0; b < g.berths; b++) {
      var tot = Sim.arrivalTotal(port, b);
      for (var el = 0; el <= tot; el += tot / 300) {
        /* Every pose under the ground, not just the enclosed legs: the
         * drop itself is the `pad` leg (slot 1 to the shaft foot), which is
         * where the old incline left the duct. */
        var pose = Sim.arrivalPose(port, sys, 0, b, el);
        if (!pose) continue;
        var d = V.sub(pose.pos, basis.entrance.pos);
        var x = V.dot(d, basis.east) / r, y = V.dot(d, basis.north) / r, z = V.dot(d, basis.up) / r;
        if (z >= 0) continue;
        samples++;
        /* Above the hall's ceiling the only open rock is the duct. */
        if (z > g.ceilZ && (Math.abs(x) > duct || Math.abs(y) > duct)) {
          outDuct++; worst = Math.max(worst, Math.max(Math.abs(x), Math.abs(y)) - duct);
        }
        if (z <= g.ceilZ && (Math.abs(x) > g.chamberX || Math.abs(y) > g.chamberY)) {
          outHall++; worst = Math.max(worst, Math.max(Math.abs(x) - g.chamberX, Math.abs(y) - g.chamberY));
        }
      }
    }
  });
  /* It was a 45-degree incline nobody had modelled: the shaft foot four pad
   * radii outside a hall 0.42 wide, and the hull in rock the whole way. */
  check('in the shaft, the hull is inside the duct', samples > 0 && outDuct === 0, outDuct + ' of ' + samples + ' outside');
  check('in the hall, the hull is inside its walls', outHall === 0, outHall + ' outside, worst ' + worst.toFixed(3) + ' radii');

  console.log('--- a ridden lift is under the hull riding it ---');
  /* Every orbital model whose heavy-bay route rides a lift on its way
   * across: while the hull is boarding, riding and getting off, the car
   * the renderer draws (Render.moverPose, keel at the rail's standoff) has
   * its top at the keel, not above it. It was up to 0.42 radii above. */
  var seen = {}, rides = 0, above = 0, worstR = 0, worstAt = '';
  var frame = { pos: { x: 0, y: 0, z: 0 }, right: { x: 1, y: 0, z: 0 }, up: { x: 0, y: 1, z: 0 }, fwd: { x: 0, y: 0, z: 1 } };
  for (var s6 = 0; s6 < gal.stars.length; s6++) {
    var sy6 = Gen.generateSystem(gal.stars[s6].seed, optsFor(gal.stars[s6]));
    (sy6.ports || []).forEach(function (p) {
      var id = Render.portModelFor(p);
      if (p.surface || seen[id]) return;
      seen[id] = true;
      var lib = global.PortLib && global.PortLib[id];
      if (!lib || !lib.movers) return;
      var g6 = Gen.bayGeometry(p), basis = Sim.portBasis(p, sy6, 0), r = p.radius;
      for (var b = 0; b < g6.berths; b++) {
        var path = Sim.arrivalPath(p, b);
        if (!path || !(path.rideAt >= 1) || !path.rideMover) continue;
        var mv = lib.movers.filter(function (m) { return m.node === path.rideMover; })[0];
        var tot = Sim.arrivalTotal(p, b);
        for (var el = 0; el <= tot; el += tot / 300) {
          var pose = Sim.arrivalPose(p, sy6, 0, b, el);
          if (!pose || !(pose.ride === 'board' || pose.ride === 'ride' || pose.ride === 'alight')) continue;
          var d = V.sub(pose.pos, basis.entrance.pos);
          var loc = { x: V.dot(d, basis.east) / r, y: V.dot(d, basis.north) / r, z: V.dot(d, basis.up) / r };
          Render.setMoverRiders([{ pos: loc, keelKm: g6.standoff }]);
          /* The car's DECK (Render.libPort movers, 2026-11-03), not its box:
           * an inclined car's box top is far over the deck it carries on. */
          var mvR = (Render.libPort(id).movers || []).filter(function (m) { return m.node === mv.node; })[0] || mv;
          var sp = Render.moverPose(mvR, frame, 1);
          var top = (typeof mvR.deck === 'number' ? mvR.deck : mv.max[2]) + mv.axis[2] * sp;
          var gap = (loc.z - g6.standoff) - top;
          rides++;
          if (gap < -0.002) { above++; if (-gap > worstR) { worstR = -gap; worstAt = id + ' b' + b; } }
        }
      }
    });
  }
  Render.setMoverRiders([]);
  check('there are ridden lifts to check', rides > 0, rides + ' samples');
  check('and no car is ever above the keel of the hull it carries', above === 0,
        above + ' above, worst ' + worstR.toFixed(3) + ' radii at ' + worstAt);

  console.log('--- handed the stick clear of the ground, and held there ---');
  var held = 0, cleared = 0, stayed = 0, letGo = 0, timedOut = 0, n7 = 0, lowest = Infinity;
  found.concat(sheds).forEach(function (f) {
    var sys = f.sys, port = f.port, t = 0;
    var st = Sim.bodyState(port, sys, t);
    var sh = newShip(st.pos, st.vel);
    Sim.dockShip(sh, port, sys, t);
    if (sh.docked !== port.id) return;
    sh.launchOk = 'x';
    Sim.undockShip(sh, sys, t, 0.003, { transfer: true });
    var tt = t, steps = 0;
    while (sh.arrival && steps++ < 4000) { tt += 0.25; Sim.stepArrival(sh, sys, tt); }
    n7++;
    if (sh.padHold) held++;
    var len = Render.hullLength ? Render.hullLength(sh) : 0.025;
    var gb = Sim.groundBasis(port, sys, tt);
    var hAt = function (time) {
      var g2 = Sim.groundBasis(port, sys, time);
      return V.dot(V.sub(sh.pos, g2.entrance.pos), g2.up);
    };
    /* Nobody at the stick for a minute: lifted clear, and not let fall. */
    var minH = Infinity;
    for (var k = 1; k <= 240; k++) {
      var r7 = Sim.stepPadHold(sh, sys, tt + k * 0.25, false);
      if (!r7.holding) break;
      /* A mountain portal hands over 73 m below the ground: twelve seconds
       * of lift before it is clear. Judged once it has had the time. */
      if (k > 120) minH = Math.min(minH, hAt(tt + k * 0.25));
    }
    if (sh.padHold && minH >= Sim.PAD_HOLD_CLEAR + len - 1e-6) cleared++;
    lowest = Math.min(lowest, minH - len);
    if (sh.padHold && V.dot(sh.fwd, gb.up) > 0.99) stayed++;
    /* The pilot's thrust lets go. */
    var r8 = Sim.stepPadHold(sh, sys, tt + 61, true);
    if (!r8.holding && !sh.padHold && r8.released === 'pilot') letGo++;
    /* And nobody at all: it does not hover forever. */
    sh.padHold = { port: port.id, at: tt, e: 0, n: 0, h0: 0 };
    var r9 = Sim.stepPadHold(sh, sys, tt + Sim.PAD_HOLD_MAX + 1, false);
    if (!r9.holding && !sh.padHold && r9.released === 'timeout') timedOut++;
  });
  check('the transfer ends in the pad\'s hold, not in free fall', n7 > 0 && held === n7, held + '/' + n7);
  check('the hold lifts the whole hull clear of the ground and keeps it there', cleared === n7,
        cleared + '/' + n7 + ', lowest keel ' + (lowest * 1000).toFixed(0) + ' m up');
  check('nose to the sky while held', stayed === n7, stayed + '/' + n7);
  check('thrust takes the stick back', letGo === n7, letGo + '/' + n7);
  check('and an empty cockpit is let go after PAD_HOLD_MAX', timedOut === n7, timedOut + '/' + n7);

  /* Docking ends a hold the way it ends an arrival. */
  var f0 = found[0];
  if (f0) {
    var sh0 = newShip(Sim.bodyState(f0.port, f0.sys, 0).pos, Sim.bodyState(f0.port, f0.sys, 0).vel);
    sh0.padHold = { port: f0.port.id, at: 0, e: 0, n: 0, h0: 0 };
    Sim.dockShip(sh0, f0.port, f0.sys, 0);
    check('docking clears a hold', !sh0.padHold);
  }
})();

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
