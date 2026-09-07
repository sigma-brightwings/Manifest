/* slipspace.test.js — the corridor, its timetable, its wakes and its hardware.
 *
 * The things worth pinning here are not "does the function return a number".
 * They are the calibrations and the invariants that a later edit would break
 * silently:
 *
 *  - a laden reference hull still takes seven hours per light year, so the
 *    new mass model did not quietly re-time the whole existing game;
 *  - the timetable is a pure function of (seed, t), so a wake found today is
 *    the same wake found today next session;
 *  - lanes are symmetric, so a wake read at one end names the star the other
 *    end is actually expecting;
 *  - the anchor resists rather than refuses, and a light hull genuinely
 *    cannot hold a heavy anchored one;
 *  - nobody is ever stranded by a drop-out.
 */
'use strict';

var S = require('../src/slipspace.js');
var Galaxy = require('../src/galaxy.js');

var pass = 0, fail = 0;
function ok(cond, label) {
  if (cond) { pass++; }
  else { fail++; console.log('  FAIL: ' + label); }
}
function near(a, b, tol, label) {
  ok(Math.abs(a - b) <= tol, label + ' (got ' + a + ', wanted ' + b + ' +/-' + tol + ')');
}
function section(name) { console.log('\n' + name); }

/* The reference hull, as generate.js defines it. Duplicated here as literal
 * numbers ON PURPOSE: if somebody changes SHIP_SPEC, the calibration test
 * below should fail loudly and make them re-check the transit curve, rather
 * than silently re-deriving itself and passing. */
function refShip(cargoTonnes) {
  var ship = { dryMass: 42, fuel: 28, fuelCap: 28, thrusterFuel: 12, cargo: {} };
  if (cargoTonnes) ship.cargo.ore = cargoTonnes;
  return ship;
}

/* ---- transit time ------------------------------------------------------ */
section('transit time');
{
  var laden = refShip(64), empty = refShip(0);
  near(S.allUpMass(laden), 146, 1e-9, 'laden all-up mass is 146 t');
  near(S.allUpMass(empty), 82, 1e-9, 'empty all-up mass is 82 t');

  /* THE calibration. The game shipped for months at a flat 7 h/ly; a full
   * hold must still land within a rounding error of that, or every mission
   * deadline and every market projection in the existing game just moved. */
  near(S.hoursPerLy(146), 7.0, 0.05, 'a full hold still takes ~7 h/ly');
  ok(S.hoursPerLy(82) < S.hoursPerLy(146), 'empty is faster than laden');
  near(S.hoursPerLy(82), 5.758, 0.01, 'empty is 5.76 h/ly');

  ok(S.hoursPerLy(900) > 2.5 * S.hoursPerLy(82),
     'a heavy freighter is at least 2.5x slower than a light empty hull');
  ok(S.hoursPerLy(1e9) <= S.MAX_HOURS_PER_LY + 1e-9,
     'transit time is capped — nothing takes literally forever');
  near(S.transitSeconds(4, 146), 4 * S.hoursPerLy(146) * 3600, 1e-6,
     'transitSeconds is hours/ly * ly * 3600');
  near(S.transitSeconds(0, 146), 0, 1e-9, 'a zero-length jump takes no time');

  /* Monotonic: adding cargo must never make you faster. */
  var monotonic = true;
  for (var m = 0; m < 5000; m += 37) {
    if (S.hoursPerLy(m + 37) < S.hoursPerLy(m)) monotonic = false;
  }
  ok(monotonic, 'transit time never decreases with mass');
}

/* ---- galaxy integration ------------------------------------------------ */
section('jumpPlan uses the mass model');
{
  var g = Galaxy.build('kawartha');
  var to = Galaxy.reachable(g, g.home, refShip(0))[0];
  ok(!!to, 'the home star has at least one reachable neighbour');

  var planEmpty = Galaxy.jumpPlan(g, g.home, to.star, refShip(0));
  var planLaden = Galaxy.jumpPlan(g, g.home, to.star, refShip(64));
  ok(planLaden.seconds > planEmpty.seconds,
     'the same hop takes longer with a full hold');
  ok(planEmpty.hullClass === 'I', 'the reference hull is Class I');
  near(planLaden.hoursPerLy, S.hoursPerLy(146), 1e-9,
     'the plan quotes the same h/ly the model does');

  /* The bare-distance form is what the old galaxy tests use to age a
   * market. It must keep answering the old flat rate exactly. */
  near(Galaxy.jumpSeconds(6), 6 * 7 * 3600, 1e-9,
     'jumpSeconds with no ship is still the flat legacy rate');
}

/* ---- lanes ------------------------------------------------------------- */
section('lanes');
{
  var g = Galaxy.build('kawartha');
  var lanes = S.lanesFrom(g, g.home);
  ok(lanes.length > 0, 'the home star has lanes');
  ok(lanes.length <= S.LANE_NEIGHBOURS, 'no more lanes than neighbours allowed');

  var allShort = true, allHaveLegs = true;
  lanes.forEach(function (l) {
    if (l.distance > S.LANE_MAX_LY) allShort = false;
    if (!l.legs.length) allHaveLegs = false;
  });
  ok(allShort, 'no scheduled lane exceeds LANE_MAX_LY');
  ok(allHaveLegs, 'every lane runs at least one service');

  /* SYMMETRY. This is the one that matters: a wake read at A has to name
   * the destination B is expecting, and that only holds if both ends build
   * the identical lane object from the sorted pair. */
  var other = lanes[0].a.id === g.home.id ? lanes[0].b : lanes[0].a;
  var backLanes = S.lanesFrom(g, other);
  var mirrored = null;
  backLanes.forEach(function (l) { if (l.id === lanes[0].id) mirrored = l; });
  ok(!!mirrored, 'the far end knows about the same lane');
  if (mirrored) {
    ok(mirrored.legs.length === lanes[0].legs.length,
       'both ends agree on how many services the lane runs');
    var sameShips = true;
    for (var i = 0; i < mirrored.legs.length; i++) {
      if (mirrored.legs[i].name !== lanes[0].legs[i].name ||
          mirrored.legs[i].tonnes !== lanes[0].legs[i].tonnes) sameShips = false;
    }
    ok(sameShips, 'both ends agree on which ships fly it');
  }

  /* Determinism: same seed, same galaxy, same everything. */
  var g2 = Galaxy.build('kawartha');
  var l2 = S.lanesFrom(g2, g2.home);
  var identical = l2.length === lanes.length;
  for (var j = 0; identical && j < l2.length; j++) {
    identical = l2[j].id === lanes[j].id &&
                l2[j].legs[0].name === lanes[j].legs[0].name &&
                l2[j].legs[0].t0 === lanes[j].legs[0].t0;
  }
  ok(identical, 'lanes are a pure function of the galaxy seed');

  /* A leg's own crossing time must agree with the mass model, or a wake
   * would predict an arrival the corridor does not deliver. */
  var leg = lanes[0].legs[0];
  near(leg.cross, S.transitSeconds(lanes[0].distance, leg.tonnes), 1e-6,
     'a leg crosses in the time its mass says it should');
}

/* ---- the timetable ----------------------------------------------------- */
section('run states');
{
  var g = Galaxy.build('kawartha');
  var lane = S.lanesFrom(g, g.home)[0];
  var leg = lane.legs[0];

  /* Walk a whole period and check the state machine never lies about
   * whether it is flying, and that departure always precedes arrival. */
  var badOrder = 0, badProgress = 0, transitCount = 0;
  for (var k = 0; k < 400; k++) {
    var t = leg.t0 + (k / 400) * leg.period;
    var st = S.runState(lane, leg, t);
    if (!st) continue;
    if (st.arrivesAt <= st.departedAt) badOrder++;
    if (st.progress < -1e-9 || st.progress > 1 + 1e-9) badProgress++;
    if (st.inTransit) {
      transitCount++;
      if (t < st.departedAt - 1e-6 || t > st.arrivesAt + 1e-6) badOrder++;
    }
  }
  ok(badOrder === 0, 'a run never arrives before it departs');
  ok(badProgress === 0, 'progress stays inside [0,1]');
  ok(transitCount > 0, 'the run is actually in transit some of the time');

  /* Periodicity — the whole reason nothing has to be stored. */
  var a = S.runState(lane, leg, 1234567);
  var b = S.runState(lane, leg, 1234567 + leg.period);
  near(a.progress, b.progress, 1e-9, 'the timetable repeats exactly on its period');
  ok(a.dir === b.dir, 'and repeats in the same direction');
}

/* ---- wakes ------------------------------------------------------------- */
section('wakes');
{
  var g = Galaxy.build('kawartha');

  var samples = 3000, total = 0, empty = 0, sawDeparture = 0, sawArrival = 0;
  var badAge = 0, badStrength = 0;
  for (var i = 0; i < samples; i++) {
    var t = i * 3600 * 3;
    var w = S.wakesAt(g, g.home, t);
    total += w.length;
    if (!w.length) empty++;
    w.forEach(function (x) {
      if (x.age < 0 || x.age >= S.WAKE_LIFE) badAge++;
      if (x.strength <= 0 || x.strength > 1.0001) badStrength++;
      if (x.kind === 'departure') sawDeparture++;
      if (x.kind === 'arrival') sawArrival++;
    });
  }
  ok(badAge === 0, 'no wake is reported outside its own lifetime');
  ok(badStrength === 0, 'wake strength stays in (0,1]');
  ok(sawDeparture > 0, 'departures happen');
  ok(sawArrival > 0, 'arrivals happen');

  /* Density. Too sparse and the mechanic is invisible; too dense and a
   * scanner full of wakes stops meaning anything. */
  var mean = total / samples;
  ok(mean > 1.2 && mean < 4.5, 'a busy system averages 1.2-4.5 wakes (got ' + mean.toFixed(2) + ')');
  ok(empty / samples < 0.25, 'an empty sky is uncommon (got ' + (empty / samples).toFixed(2) + ')');

  /* Determinism again, this time on the derived object — and deliberately
   * ACROSS TWO SEPARATELY BUILT GALAXIES, which is what a save/load does.
   * The first version of lanesFrom compared stars by object identity, so a
   * star from a rebuilt galaxy became its own nearest neighbour at zero
   * distance and the whole lane list quietly went wrong. Nothing threw.
   * This is the assertion that caught it. */
  var g2 = Galaxy.build('kawartha');
  var w1 = S.wakesAt(g, g.home, 987654);
  var w2 = S.wakesAt(g2, g2.home, 987654);
  ok(w1.length === w2.length, 'the same instant yields the same number of wakes');
  var crossInstance = S.wakesAt(g, g2.home, 987654);
  ok(crossInstance.length === w1.length,
     'a star object from a rebuilt galaxy resolves to the same lanes');
  var sameIds = true;
  for (var q = 0; q < w1.length; q++) if (w1[q].id !== w2[q].id) sameIds = false;
  ok(sameIds, 'and the same wakes, by id');

  /* SIZE IS MASS. A wake reports the tonnage that tore it before you have
   * scanned a thing, which is what lets you pick which mark is worth flying
   * to from across a system. */
  ok(S.wakeRadius(3600) > S.wakeRadius(90) * 3,
     'a bulk hauler tears a far bigger hole than a packet');
  ok(S.wakeRadius(3600) < S.wakeRadius(90) * 9,
     'but not so much bigger that a packet becomes invisible');
  var risesWithMass = true;
  for (var rm = 50; rm < 4000; rm += 97) {
    if (S.wakeRadius(rm + 97) <= S.wakeRadius(rm)) risesWithMass = false;
  }
  ok(risesWithMass, 'wake size rises monotonically with tonnage');
  near(S.wakeRadius(500), S.WAKE_RADIUS_REF, 1e-6,
     'the reference tonnage gives the reference radius');
  var carriesRadius = true, matchesTonnes = true, shrinks = true;
  w1.forEach(function (x) {
    if (!(x.radius > 0) || !(x.radiusFull > 0)) carriesRadius = false;
    if (Math.abs(x.radiusFull - S.wakeRadius(x.leg.tonnes)) > 1e-6) matchesTonnes = false;
    if (x.radius > x.radiusFull + 1e-9) shrinks = false;
  });
  ok(carriesRadius, 'every wake carries a full and a current radius');
  ok(matchesTonnes, 'and the full one is what its tonnage says it should be');
  ok(shrinks, 'and the current one never exceeds it');

  /* A WAKE CLOSES AS IT AGES. Space is pulling itself back together, so an
   * old mark is smaller as well as fainter — a wake that only dimmed would
   * read as a light being turned down rather than a wound healing. */
  var young = null, old = null;
  for (var ai = 0; ai < 20000 && (!young || !old); ai++) {
    var wl = S.wakesAt(g, g.home, ai * 700);
    for (var aj = 0; aj < wl.length; aj++) {
      var wk = wl[aj];
      if (!young && wk.age < 900) young = wk;
      if (!old && wk.age > S.WAKE_LIFE * 0.85) old = wk;
    }
  }
  ok(!!young && !!old, 'the timetable offers both a fresh and a nearly-gone wake');
  if (young && old) {
    ok(young.radius / young.radiusFull > 0.95, 'a fresh wake is close to full size');
    ok(old.radius / old.radiusFull < 0.60, 'a nearly-gone one has closed up substantially');
    ok(old.strength < young.strength, 'and is fainter too');
    /* Both axes, but not at the same rate — brightness goes quadratically
     * and size linearly, so the old one is very faint and merely small. */
    ok((old.strength / young.strength) < (old.radius / old.radiusFull),
       'brightness fades faster than the hole closes');
  }

  /* A baffle must NOT shrink the hole. It scatters the return so nobody can
   * tell who you are; it cannot disguise how much ship went through. That
   * split is what stops it being an invisibility cloak. */
  var baffledSame = true;
  w1.forEach(function (x) {
    if (x.baffled && Math.abs(x.radiusFull - S.wakeRadius(x.leg.tonnes)) > 1e-6) {
      baffledSame = false;
    }
  });
  ok(baffledSame, 'a baffle hides who you are, not how big you are');

  /* SCATTERED AROUND THE SYSTEM, not pinned to a ring. Every ship that used
   * a lane once left its mark on exactly the same point in space, which read
   * as a few fixed pins rather than a system with traffic moving through it. */
  var sunAt = { x: 0, y: 0, z: 0 };
  var ring = 5e8;
  var placed = [], distinct = true, spread = 0;
  /* Deduped BY ID. Sampling across times returns the same physical wake
   * repeatedly — its id carries the moment its ship left, not the moment we
   * looked — and counting those as separate wakes would have this assert
   * complain that a wake is in the same place as itself. */
  var manyT = [], seenIds = {};
  for (var st2 = 0; st2 < 3000000 && manyT.length < 12; st2 += 900) {
    var wl2 = S.wakesAt(g, g.home, st2);
    for (var k2 = 0; k2 < wl2.length; k2++) {
      if (seenIds[wl2[k2].id]) continue;
      seenIds[wl2[k2].id] = 1;
      manyT.push(wl2[k2]);
    }
  }
  ok(manyT.length >= 6, 'gathered a decent sample of wakes to place');
  manyT.forEach(function (x) {
    var pp = S.wakePosition(x, sunAt, ring);
    var d = Math.sqrt(pp.x * pp.x + pp.y * pp.y + pp.z * pp.z);
    placed.push({ p: pp, d: d });
    spread = Math.max(spread, d);
  });
  var minD = Math.min.apply(null, placed.map(function (q) { return q.d; }));
  var maxD = Math.max.apply(null, placed.map(function (q) { return q.d; }));
  ok(maxD / minD > 1.4, 'wakes sit at a range of distances, not all on one ring (' +
     (maxD / minD).toFixed(2) + 'x)');
  /* No two on the same spot. */
  for (var m1 = 0; m1 < placed.length && distinct; m1++) {
    for (var m2 = m1 + 1; m2 < placed.length; m2++) {
      var dx = placed[m1].p.x - placed[m2].p.x;
      var dy = placed[m1].p.y - placed[m2].p.y;
      var dz = placed[m1].p.z - placed[m2].p.z;
      if (Math.sqrt(dx * dx + dy * dy + dz * dz) < ring * 0.01) distinct = false;
    }
  }
  ok(distinct, 'no two wakes land on top of each other');

  /* But placement is still STABLE — a wake must not wander between frames. */
  var anchor = manyT[0];
  var q1 = S.wakePosition(anchor, sunAt, ring);
  var q2 = S.wakePosition(anchor, sunAt, ring);
  ok(q1.x === q2.x && q1.y === q2.y && q1.z === q2.z,
     'and a given wake is always in the same place');
  /* And it still leans toward where its ship was going, so the sky stays
   * readable as a traffic map. */
  var leans = 0, tested = 0;
  manyT.forEach(function (x) {
    var pp = S.wakePosition(x, sunAt, ring);
    var l = Math.sqrt(pp.x * pp.x + pp.y * pp.y + pp.z * pp.z) || 1;
    var dot = (pp.x / l) * x.dir.x + (pp.y / l) * x.dir.y + (pp.z / l) * x.dir.z;
    tested++;
    if (dot > 0.5) leans++;
  });
  ok(leans / tested > 0.7,
     'most wakes still lean toward the star their ship was heading for');

  /* Direction. A departure wake points at where the ship went, which is
   * what makes the sky readable before you scan anything. */
  var pointed = true;
  w1.forEach(function (x) {
    var len = Math.sqrt(x.dir.x * x.dir.x + x.dir.y * x.dir.y + x.dir.z * x.dir.z);
    if (Math.abs(len - 1) > 1e-6) pointed = false;
    if (x.otherStar.id === x.atStar.id) pointed = false;
  });
  ok(pointed, 'every wake carries a unit bearing to a different star');
}

/* ---- scanning ---------------------------------------------------------- */
section('scanning a wake');
{
  var g = Galaxy.build('kawartha');
  /* Find a fresh, unbaffled wake to read. Searching rather than asserting
   * one exists at an arbitrary t — the timetable owes us nothing. */
  var fresh = null;
  for (var i = 0; i < 20000 && !fresh; i++) {
    var w = S.wakesAt(g, g.home, i * 900);
    for (var j = 0; j < w.length; j++) {
      if (w[j].age < 1200 && !w[j].baffled) { fresh = w[j]; break; }
    }
  }
  ok(!!fresh, 'a fresh unbaffled wake exists somewhere in the timetable');

  if (fresh) {
    var close = S.scanWake(fresh, 0);
    ok(close.fidelity > 0.75, 'point blank on a fresh wake is a full read');
    ok(!!close.destination, 'a full read names the destination');
    ok(close.timeKnown, 'a full read knows when they left');
    ok(!!close.hullClass, 'a full read resolves the hull class');
    ok(close.tonnes > 0, 'a full read estimates tonnage');

    /* Degradation must be MONOTONIC in range — an instrument that got
     * better as you backed away would be worse than no instrument. */
    var prev = 2, mono = true;
    for (var d = 0; d <= S.WAKE_SCAN_RANGE * 1.2; d += S.WAKE_SCAN_RANGE / 40) {
      var f = S.scanFidelity(fresh, d);
      if (f > prev + 1e-9) mono = false;
      prev = f;
    }
    ok(mono, 'fidelity falls off monotonically with range');
    near(S.scanFidelity(fresh, S.WAKE_SCAN_RANGE * 1.01), 0, 1e-9,
       'beyond scan range there is no return at all');

    var far = S.scanWake(fresh, S.WAKE_SCAN_RANGE * 1.5);
    ok(!far.inRange && !far.destination, 'out of range tells you nothing');

    /* Mid-range should still name the star — the destination is the last
     * thing to go, because it is the thing the whole loop is built on. */
    var mid = S.scanWake(fresh, S.WAKE_SCAN_RANGE * 0.72);
    ok(!!mid.destination, 'a marginal read still names the destination');
    ok(!mid.tonnes, 'but a marginal read does not estimate tonnage');
  }

  /* A baffled wake must be unreadable in detail even from point blank —
   * that is the entire six-thousand-credit proposition. */
  var baffled = null;
  for (var k = 0; k < 20000 && !baffled; k++) {
    var ws = S.wakesAt(g, g.home, k * 900);
    for (var m = 0; m < ws.length; m++) {
      if (ws[m].baffled && ws[m].age < 600) { baffled = ws[m]; break; }
    }
  }
  if (baffled) {
    var b = S.scanWake(baffled, 0);
    ok(b.fidelity < 0.5, 'a baffled wake never gives a full read, however close');
    ok(!b.tonnes, 'a baffled wake hides its tonnage');
  } else {
    console.log('  (note: no fresh baffled wake in the sampled window — skipped)');
  }
}

/* ---- hardware and interdiction ----------------------------------------- */
section('modules and interdiction');
{
  ok(S.hullClassFor(146).id === 'I', 'the reference hull is Class I');
  ok(S.hullClassFor(400).id === 'II', '400 t is Class II');
  ok(S.hullClassFor(1200).id === 'III', '1200 t is Class III');
  ok(S.hullClassFor(5000).id === 'IV', '5000 t is bulk');

  /* Pricing shape: the anchor is the expensive one, at every class, because
   * it is the one that helps after you have already been found. */
  var dearer = true, rising = true;
  ['I', 'II', 'III', 'IV'].forEach(function (c) {
    if (S.modulePrice('anchor', c) <= S.modulePrice('baffle', c)) dearer = false;
  });
  ok(dearer, 'an anchor costs more than a baffle at every class');
  for (var ci = 1; ci < 4; ci++) {
    var a = ['I', 'II', 'III', 'IV'];
    if (S.modulePrice('baffle', a[ci]) <= S.modulePrice('baffle', a[ci - 1])) rising = false;
    if (S.modulePrice('anchor', a[ci]) <= S.modulePrice('anchor', a[ci - 1])) rising = false;
  }
  ok(rising, 'bigger hulls pay more for both modules');
  ok(S.modulePrice('anchor', 'I') > 4 * S.modulePrice('baffle', 'I'),
     'the gap between them is a real decision, not a rounding difference');

  /* The core promise of the anchor: it resists, it does not refuse. */
  var bare = S.lockTime(150, 146, null);
  var anchored = S.lockTime(150, 146, 'I');
  ok(anchored > bare * 3, 'an anchor makes a light attacker take far longer');
  ok(S.lockTime(2600, 146, 'I') < 60,
     'but a bulk hull still gets through an anchored light hull');
  ok(S.canHold(2600, 146, 'I'), 'and it is genuinely possible, not merely slow');

  /* And the other half: a light hull cannot hold a heavy anchored one. */
  ok(!S.canHold(146, 1400, 'III'),
     'the reference hull cannot hold an anchored heavy freighter at all');
  ok(S.lockTime(146, 1400, 'III') === Infinity,
     'and the instrument says Infinity rather than a number it will never reach');
  ok(S.canHold(146, 900, null),
     'an UNanchored heavy freighter is still fair game for a light pirate');

  /* Tear cost rations piracy by reaction mass. The reference tank is 12 t. */
  ok(S.tearCost(900) < 12, 'a 900 t freighter is within a full reaction tank');
  ok(S.tearCost(3400) > 12, 'a bulk hauler is not — you need a bigger ship');
  ok(S.tearCost(0) === 0, 'tearing nothing costs nothing');

  /* Corridor throttle: costs nothing at neutral, and braking is cheaper
   * than pushing — the same asymmetry the speed band has. */
  near(S.corridorBurn(0), 0, 1e-12, 'coasting the corridor is free');
  ok(S.corridorBurn(-1) > 0, 'but braking is not free either');
  ok(S.corridorBurn(-1) < S.corridorBurn(1), 'braking costs less than pushing');
  ok(S.corridorRate(4, 146, 1) > S.corridorRate(4, 146, 0),
     'full throttle really is faster');
  ok(S.corridorRate(4, 82, 0) > S.corridorRate(4, 146, 0),
     'and a light hull outruns a laden one at the same throttle');

  /* THE MATCHING BAND. This is the number that decides whether an
   * interception is playable at all: a fast hull must be able to slow to a
   * heavy freighter's pace, or it can catch one and never hold one. */
  near(S.throttleScale(-1), 0.20, 1e-9, 'full brake is a fifth of nominal');
  near(S.throttleScale(1), 1.35, 1e-9, 'full boost is 1.35x, and no more');
  ok(S.corridorRate(5, 82, -1) < S.corridorRate(5, 900, 0),
     'an empty hull can slow below a heavy freighter and match it');
  ok(S.corridorRate(5, 82, 1) > S.corridorRate(5, 900, 0) * 3,
     'and can also overhaul it several times over');
}

/* ---- pursuit ----------------------------------------------------------- */
section('pursuit arithmetic');
{
  /* An empty reference hull chasing a heavy freighter that left an hour
   * ago should catch it comfortably — that is the mechanic working. */
  var p = S.pursuit(5, 900, 0, 82, 3600, 1);
  ok(p.possible, 'an empty hull overhauls a freighter with an hour head start');
  ok(p.at > 0 && p.at < 1, 'and does so inside the corridor');
  ok(p.remainingSeconds > 0, 'with corridor left to hold them in');

  /* Laden, the same chase should be much worse, and the same hull chasing
   * something faster than itself should be told plainly that it cannot. */
  var pLaden = S.pursuit(5, 900, 0, 146, 3600, 1);
  ok(pLaden.at > p.at, 'a laden chaser catches up later, if at all');
  var pNo = S.pursuit(5, 90, 0, 900, 3600, 1);
  ok(!pNo.possible, 'a bulk hauler cannot run down a packet');
  ok(pNo.at === Infinity, 'and says so with Infinity rather than a large number');

  /* Leave late enough and the chase was never on. */
  var late = S.pursuit(5, 900, 0, 82, 5 * S.hoursPerLy(900) * 3600 * 0.99, 1);
  ok(!late.possible, 'set off just before they land and you miss them');
}

/* ---- the corridor ------------------------------------------------------ */
section('the corridor');
{
  var g = Galaxy.build('kawartha');
  var lane = S.lanesFrom(g, g.home)[0];
  var far = lane.a.id === g.home.id ? lane.b : lane.a;

  /* An empty corridor stays the cutscene it always was. Jumping somewhere
   * no scheduled service runs must NOT wake the flyable mode up — that is
   * what stops every routine hop becoming a thirty-second chore. */
  var offLane = null;
  for (var i = 0; i < g.stars.length && !offLane; i++) {
    var s = g.stars[i];
    if (s.id === g.home.id) continue;
    if (!S.corridorTraffic(g, g.home, s, 0).length) offLane = s;
  }
  ok(!!offLane, 'some destinations have no scheduled service at all');
  if (offLane) {
    var quiet = S.openCorridor({ galaxy: g, from: g.home, to: offLane, tonnes: 82, t: 0 });
    ok(!quiet.live, 'a corridor with no traffic is not live');
  }

  /* And a lane with traffic in it, at a moment when somebody is flying,
   * must produce contacts. Search for such a moment rather than assuming. */
  var busyT = -1;
  for (var t = 0; t < 4000000 && busyT < 0; t += 7000) {
    if (S.corridorTraffic(g, g.home, far, t).length) busyT = t;
  }
  ok(busyT >= 0, 'a lane has somebody flying it at some point');

  if (busyT >= 0) {
    var cor = S.openCorridor({
      galaxy: g, from: g.home, to: far, tonnes: 82, t: busyT
    });
    ok(cor.live, 'a corridor with traffic is live');
    ok(cor.contacts.length > 0, 'and carries contacts');
    near(cor.progress, 0, 1e-9, 'you start at the near end');
    near(cor.crossSeconds, S.transitSeconds(cor.distanceLy, 82), 1e-6,
       'and your crossing time is your own mass model');

    /* Fly it at full throttle with no lock and make sure it terminates,
     * advances the clock, and burns reaction mass. */
    var ship = { dryMass: 42, fuel: 28, fuelCap: 28, thrusterFuel: 12, cargo: {} };
    var frames = 0, sawContact = false;
    while (!cor.outcome && frames < 20000) {
      S.advanceCorridor(cor, 1 / 30, { throttle: 1, lockHeld: false }, ship);
      cor.events.forEach(function (e) { if (e.kind === 'contact') sawContact = true; });
      frames++;
    }
    ok(cor.outcome === 'arrived', 'flying the corridor without locking gets you there');
    ok(frames < 20000, 'and terminates rather than running forever');
    ok(ship.thrusterFuel < 12, 'full throttle costs reaction mass');
    ok(ship.thrusterFuel > 0, 'but not the whole tank on one crossing');
    near(S.corridorClock(cor), cor.departT + cor.crossSeconds, 1,
       'arriving means the whole transit time has elapsed');
    ok(cor.elapsedReal > 1 && cor.elapsedReal < 400,
       'a crossing takes seconds of real time, not hours (got ' +
       cor.elapsedReal.toFixed(1) + 's)');

    /* Compression must actually engage and disengage. */
    var cor2 = S.openCorridor({ galaxy: g, from: g.home, to: far, tonnes: 82, t: busyT });
    var sawFast = false, sawSlow = false;
    var sh2 = { dryMass: 42, fuel: 28, fuelCap: 28, thrusterFuel: 12, cargo: {} };
    for (var f2 = 0; f2 < 20000 && !cor2.outcome; f2++) {
      S.advanceCorridor(cor2, 1 / 30, { throttle: 0, lockHeld: false }, sh2);
      if (cor2.compress > 1) sawFast = true; else sawSlow = true;
    }
    ok(sawFast, 'the corridor compresses time when nobody is near');
    ok(sawSlow, 'and drops to real time when somebody is');

    /* Coasting must be free — an ordinary jump cannot touch the tank. */
    near(sh2.thrusterFuel, 12, 1e-9, 'coasting a whole corridor costs nothing');
  }

  /* Interdiction end to end: park alongside a holdable contact and hold.
   *
   * Search every lane and a wide span of the timetable for a target the
   * reference hull can actually take, rather than hoping the first lane at
   * the first busy moment offers one. An earlier version checked exactly one
   * lane at one instant, found nothing holdable, and printed a cheerful
   * "skipped" — which is a test that reports success while testing nothing. */
  {
    var corX = null, victim = null;
    var allLanes = S.lanesFrom(g, g.home);
    for (var li = 0; li < allLanes.length && !victim; li++) {
      var other = allLanes[li].a.id === g.home.id ? allLanes[li].b : allLanes[li].a;
      for (var ti = 0; ti < 900 && !victim; ti++) {
        var tt = ti * 9000;
        var trial = S.openCorridor({ galaxy: g, from: g.home, to: other, tonnes: 82, t: tt });
        for (var v = 0; v < trial.contacts.length; v++) {
          var c = trial.contacts[v];
          if (c.sameWay && S.canHold(82, c.tonnes, c.anchor) && S.tearCost(c.tonnes) < 12) {
            corX = trial; victim = c; break;
          }
        }
      }
    }
    ok(!!victim, 'the reference hull can find something it is able to take');
    if (victim) {
      var shX = { dryMass: 42, fuel: 28, fuelCap: 28, thrusterFuel: 12, cargo: {} };
      /* Cheat the geometry — park right on them, which is what a good pilot
       * achieves by throttling to match. What is under test here is the
       * lock, not the flying. */
      corX.progress = victim.progress;
      var held = 0;
      while (!corX.outcome && held < 60 * 30) {
        // Hold station by matching their rate exactly.
        corX.progress = victim.progress;
        S.advanceCorridor(corX, 1 / 30, { throttle: 0, lockHeld: true }, shX);
        held++;
      }
      ok(corX.outcome === 'tore', 'holding station alongside a soft target tears it out');
      ok(shX.thrusterFuel < 12 - S.tearCost(victim.tonnes) + 1e-6,
         'and the tear-out charged its reaction mass');
      ok(held / 30 > 10, 'it took real seconds of held proximity, not an instant');
    }
  }

  /* An anchored heavy target must refuse the lock outright and SAY so,
   * rather than letting the bar creep toward a number it never reaches. */
  {
    var corY = S.openCorridor({ galaxy: g, from: g.home, to: far, tonnes: 82, t: busyT });
    corY.contacts = [{
      id: 'fake', name: 'Test Bulk', cls: 'freighter', className: 'freighter',
      tonnes: 1400, hullClass: 'III', anchor: 'III', sameWay: true, hostile: false,
      progress: 0, rate: 0
    }];
    var shY = { dryMass: 42, fuel: 28, fuelCap: 28, thrusterFuel: 12, cargo: {} };
    for (var y = 0; y < 300; y++) {
      corY.progress = 0;
      S.advanceCorridor(corY, 1 / 30, { throttle: 0, lockHeld: true }, shY);
    }
    ok(corY.cannotHold, 'an anchored heavy target reports CANNOT HOLD');
    ok(corY.lock === 0, 'and the lock never climbs at all');
    ok(!corY.outcome, 'and is never torn out');
  }

  /* Being hunted, and the anchor answering it. */
  {
    var hunted = S.openCorridor({ galaxy: g, from: g.home, to: far, tonnes: 146, t: busyT });
    hunted.contacts = [{
      id: 'h', name: 'The Shrike', cls: 'pirate', className: 'interdictor',
      tonnes: 170, hullClass: 'I', anchor: null, sameWay: true, hostile: true,
      progress: 0, rate: 0
    }];
    var shH = { dryMass: 42, fuel: 28, fuelCap: 28, thrusterFuel: 12, cargo: {} };
    var warned = false;
    for (var hh = 0; hh < 60 * 30 && !hunted.outcome; hh++) {
      hunted.progress = 0;
      S.advanceCorridor(hunted, 1 / 30, { throttle: 0, lockHeld: false }, shH);
      hunted.events.forEach(function (e) { if (e.kind === 'huntWarn') warned = true; });
    }
    ok(hunted.outcome === 'torn', 'an unanchored ship is eventually torn out');
    ok(warned, 'and is warned before it happens');

    /* The same encounter with an anchor fitted. This is the 28,000 credits. */
    var safe = S.openCorridor({
      galaxy: g, from: g.home, to: far, tonnes: 146, t: busyT, anchor: 'I'
    });
    safe.contacts = [{
      id: 'h', name: 'The Shrike', cls: 'pirate', className: 'interdictor',
      tonnes: 170, hullClass: 'I', anchor: null, sameWay: true, hostile: true,
      progress: 0, rate: 0
    }];
    var shS = { dryMass: 42, fuel: 28, fuelCap: 28, thrusterFuel: 12, cargo: {} };
    for (var ss = 0; ss < 60 * 30 && !safe.outcome; ss++) {
      safe.progress = 0;
      S.advanceCorridor(safe, 1 / 30, { throttle: 0, lockHeld: false }, shS);
    }
    ok(safe.outcome !== 'torn', 'a Class I anchor survives a minute a bare hull did not');
    ok(safe.anchorHolding, 'and says so, so the player sees what they paid for');
    ok(safe.anchorFactor > 5,
       'and quotes how much longer it is buying (got ' + safe.anchorFactor.toFixed(1) + 'x)');
    ok(safe.huntLock < 0.5, 'the lock is nowhere near complete after a minute');

    /* Against something big enough, the same anchor must NOT refuse — it
     * resists, it does not refuse, and that was the choice made. */
    var bulk = S.openCorridor({
      galaxy: g, from: g.home, to: far, tonnes: 146, t: busyT, anchor: 'I'
    });
    bulk.contacts = [{
      id: 'b', name: 'The Gallows', cls: 'pirate', className: 'heavy interdictor',
      tonnes: 2600, hullClass: 'IV', anchor: null, sameWay: true, hostile: true,
      progress: 0, rate: 0
    }];
    var shB = { dryMass: 42, fuel: 28, fuelCap: 28, thrusterFuel: 12, cargo: {} };
    for (var bb = 0; bb < 120 * 30 && !bulk.outcome; bb++) {
      bulk.progress = 0;
      S.advanceCorridor(bulk, 1 / 30, { throttle: 0, lockHeld: false }, shB);
    }
    ok(bulk.outcome === 'torn', 'a bulk interdictor gets through the anchor anyway');
    ok(!bulk.anchorRefusing, 'the anchor never claimed it could refuse that one');
  }

  /* The hunter roll is deterministic — a threat you can re-roll by
   * reloading the page is not a threat. */
  {
    var opts = { crimeFrom: 80, crimeTo: 60, cargoValue: 30000 };
    var a1 = S.corridorHunter(g, g.home, far, 500000, opts);
    var a2 = S.corridorHunter(g, g.home, far, 500000, opts);
    ok((a1 === null) === (a2 === null), 'the same jump has the same answer');
    if (a1 && a2) ok(a1.id === a2.id && a1.name === a2.name, 'down to the same ship');

    /* Nobody hunts a pauper, and nobody hunts in policed space. */
    ok(S.corridorHunter(g, g.home, far, 500000,
        { crimeFrom: 90, crimeTo: 90, cargoValue: 0 }) === null,
       'an empty hold is not worth crossing a corridor for');
    ok(S.corridorHunter(g, g.home, far, 500000,
        { crimeFrom: 0, crimeTo: 0, cargoValue: 90000 }) === null,
       'and lawful space is not where this happens');

    /* Over many windows in lawless space with a rich hold, it must happen
     * sometimes — and must NOT happen most of the time. */
    var hits = 0, N = 600;
    for (var w = 0; w < N; w++) {
      if (S.corridorHunter(g, g.home, far, w * 3600,
          { crimeFrom: 85, crimeTo: 40, cargoValue: 26000 })) hits++;
    }
    ok(hits > N * 0.10, 'lawless space with a rich hold is genuinely dangerous');
    ok(hits < N * 0.55, 'but not so dangerous that trade becomes impossible');
  }
}

/* ---- drop-out ---------------------------------------------------------- */
section('being torn out');
{
  var g = Galaxy.build('kawartha');
  var a = g.home, b = S.lanesFrom(g, g.home)[0].b;
  if (b.id === a.id) b = S.lanesFrom(g, g.home)[0].a;

  var mid = S.dropPoint(a, b, 0.5);
  near(mid.x, (a.x + b.x) / 2, 1e-9, 'a midpoint drop is at the midpoint');
  ok(S.dropPoint(a, b, 0.2).nearer.id === a.id, 'an early drop is nearer the origin');
  ok(S.dropPoint(a, b, 0.8).nearer.id === b.id, 'a late drop is nearer the destination');
  ok(S.dropPoint(a, b, 1.5).progress === 1, 'progress is clamped');

  /* NOBODY IS STRANDED. This is the promise made when the drop-out locale
   * was chosen, and it is the one that would be worst to break silently:
   * a player with no fuel in interstellar space has lost the career, and
   * would rightly read it as a bug rather than a risk. */
  var stranded = 0, checked = 0;
  for (var f = 0.02; f < 1; f += 0.03) {
    var ship = { dryMass: 42, fuel: 0, fuelCap: 28, thrusterFuel: 12, cargo: { ore: 64 } };
    var drop = S.dropPoint(a, b, f);
    var granted = S.grantReserve(ship, drop, Galaxy.FUEL_PER_LY_PER_TONNE);
    checked++;
    var need = drop.nearerLy * Galaxy.FUEL_PER_LY_PER_TONNE * S.allUpMass(ship);
    if (ship.fuel < need) stranded++;
    if (granted <= 0) stranded++;   // an empty tank must always have been topped up
  }
  ok(checked > 20, 'checked drops all along the lane');
  ok(stranded === 0, 'an empty tank is always given enough to reach the nearer star');

  /* But a ship that already has plenty is not handed free fuel. */
  var rich = { dryMass: 42, fuel: 28, fuelCap: 28, thrusterFuel: 12, cargo: {} };
  ok(S.grantReserve(rich, S.dropPoint(a, b, 0.5), Galaxy.FUEL_PER_LY_PER_TONNE) === 0,
     'a full tank is not topped up — the reserve is a floor, not a gift');
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
