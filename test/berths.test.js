/* berths.test.js — the fleet has to fit the stations, all of it, everywhere.
 *
 *     node test/berths.test.js
 *
 * Astra's constraint, and it is the right one: every station has to work
 * with every ship we put in, as a collective system. That is not something
 * you can assert once and walk away from — it is an invariant between two
 * libraries that are edited independently, by different tools, months
 * apart. A hull gets re-exported a little longer; a station gets a tighter
 * bay; nobody notices until a freighter is parked through a wall.
 *
 * So this sweeps the whole cross product and says which pairing is closest
 * to failing. It is deliberately a separate suite from ships.test.js: this
 * one is about the SEAM between the hull library and the port library, and
 * it is the only test that loads both.
 *
 * WHAT IT DOES NOT CLAIM. Passing does not mean the stations are the right
 * size — today they are drawn far larger than the fleet they were modelled
 * around, so the margins below are enormous and nothing could fail. It
 * means the fit is MEASURED rather than assumed, so the day that scale is
 * corrected this file is what tells you which bay went first.
 */
global.window = global.window || global;
var V = require('../src/vec3.js');
var Eco = require('../src/economy.js');
var Gen = require('../src/generate.js');
var Sim = require('../src/sim.js');
require('../src/hulls.js');
require('../src/ports.js');
var Render = require('../src/render.js');

var pass = 0, fail = 0;
function check(n, c, d) { if (c) pass++; else { fail++; console.log('  FAIL  ' + n + (d ? '   ' + d : '')); } }
function m(km) { return (km * 1000).toFixed(1) + ' m'; }

/* Every class that actually flies, and the model each one wears. */
var CLASSES = Object.keys(Render.HULL_ASSIGN);
/* Every orbital model in the library that declares berths. */
var MODELS = Object.keys(global.PortLib || {}).filter(function (id) {
  var e = global.PortLib[id];
  return e && e.kind === 'orbital' && e.anchors && e.anchors.berths &&
         e.anchors.berths.length;
});

console.log('--- what there is to fit ---');
check('there are ship classes to place', CLASSES.length > 0, CLASSES.length + ' classes');
check('there are modelled stations to place them in', MODELS.length > 0, MODELS.length + ' models');
var biggest = null;
CLASSES.forEach(function (k) {
  var s = Render.hullSpan(k);
  if (!biggest || s.w * s.h * s.l > biggest.s.w * biggest.s.h * biggest.s.l) biggest = { k: k, s: s };
});
console.log('  ' + CLASSES.length + ' classes, ' + MODELS.length + ' station models');
console.log('  largest hull: ' + biggest.k + '  ' +
            m(biggest.s.w) + ' W x ' + m(biggest.s.h) + ' H x ' + m(biggest.s.l) + ' L');

/* THE RADII THE GENERATOR ACTUALLY PRODUCES, sampled rather than written
 * down. The tightest bay in the game is the smallest model at the smallest
 * station, so a sweep that tested only a typical one would miss the case
 * that matters — and a sweep with the range hard-coded would go quietly
 * stale the first time anyone changed STATION_SCALE, which is exactly the
 * number this suite exists to keep honest. So it asks the generator. */
var RADII = (function () {
  var seen = [];
  for (var i = 0; i < 40; i++) {
    Gen.generateSystem('berth-sweep-' + i).ports.forEach(function (p) {
      if (!p.surface) seen.push(p.radius);
    });
  }
  seen.sort(function (a, b) { return a - b; });
  return [seen[0], seen[Math.floor(seen.length / 2)], seen[seen.length - 1]];
})();
console.log('  station radii in play: ' + RADII.map(function (r) {
  return (r * 1000).toFixed(0) + ' m';
}).join('  ·  ') + '   (smallest / median / largest of ' + '40 systems)');

function fakePort(id, radius) {
  return { id: id, kind: 'station', type: 'station', surface: false,
           radius: radius, docking: true };
}

console.log('--- every hull fits somewhere, at every station, at every size ---');
(function () {
  var worst = null, checked = 0, misfits = 0;
  MODELS.forEach(function (modelId) {
    Render.assignPort('orbital', modelId);
    RADII.forEach(function (radius) {
      var port = fakePort('p-' + modelId + '-' + radius, radius);
      var boxes = Sim.berthBoxes(port);
      if (!boxes || !boxes.length) { misfits++; return; }
      CLASSES.forEach(function (kind) {
        var need = Sim.hullBox({ cls: kind });
        var any = boxes.some(function (b) { return Sim.boxFits(need, b); });
        checked++;
        if (!any) {
          misfits++;
          console.log('  FAIL  ' + kind + ' fits no berth at ' + modelId + ' r=' + radius);
        }
        /* Track the tightest pairing so the margin is a number somebody can
         * look at, rather than a pass nobody learns anything from. */
        boxes.forEach(function (b) {
          if (!Sim.boxFits(need, b)) return;
          var a = [need[0], need[1], need[2]].sort(function (x, y) { return y - x; });
          var c = b.slice().sort(function (x, y) { return y - x; });
          var ratio = Math.min(c[0] / a[0], c[1] / a[1], c[2] / a[2]);
          if (!worst || ratio < worst.ratio) {
            worst = { ratio: ratio, kind: kind, model: modelId, radius: radius };
          }
        });
      });
    });
  });
  check('every class fits a berth at every station, at every station size',
        misfits === 0, misfits + ' misfits of ' + checked);
  console.log('  tightest pairing anywhere: ' + worst.kind + ' at ' + worst.model +
              ' r=' + worst.radius + ' km — the bay is ' + worst.ratio.toFixed(1) +
              'x the hull on its tightest axis');
  /* Stated as a floor rather than a target. If this ever drops below 1 the
   * check above has already failed; the point of the number is that it is
   * printed every run, so a change that halves it is visible before it
   * becomes a bug. */
  check('and with room to spare on the tightest of them', worst.ratio >= 1);
})();

console.log('--- the berth a ship is ACTUALLY given is one that fits ---');
(function () {
  var bad = 0, checked = 0;
  MODELS.forEach(function (modelId) {
    Render.assignPort('orbital', modelId);
    RADII.forEach(function (radius) {
      var port = fakePort('p-' + modelId + '-' + radius, radius);
      var boxes = Sim.berthBoxes(port);
      if (!boxes) return;
      CLASSES.forEach(function (kind) {
        var ship = { cls: kind, dryMass: 80 };
        var i = Sim.assignBerth(ship, port);
        checked++;
        if (!(i >= 0 && i < boxes.length && Sim.boxFits(Sim.hullBox(ship), boxes[i]))) {
          bad++;
          console.log('  FAIL  ' + kind + ' assigned berth ' + i + ' at ' + modelId +
                      ', which does not fit it');
        }
      });
    });
  });
  check('assignBerth never parks a hull somewhere it does not go',
        bad === 0, bad + ' bad of ' + checked);
})();

console.log('--- the same ship comes back to the same berth ---');
(function () {
  Render.assignPort('orbital', MODELS[0]);
  var port = fakePort('p-stable', 1.9);
  var ship = { cls: 'freighter', dryMass: 300 };
  var a = Sim.assignBerth(ship, port);
  var b = Sim.assignBerth(ship, port);
  check('berth assignment is deterministic', a === b, a + ' then ' + b);
  var other = fakePort('p-stable-2', 1.9);
  check('and it is a property of the port, not a counter',
        typeof Sim.assignBerth(ship, other) === 'number');
})();

/* THE INVARIANT THAT MATTERS MOST, and the one that would fail silently.
 * assignBerth measures boxes; berthOffset places the hull. If those two
 * ordered a model's berths differently, berth 3 would mean one alcove to
 * the first and a different one to the second, and every ship would be
 * measured against a bay it was not parked in. They share a sort for
 * exactly this reason, so the sort is what gets pinned. */
console.log('--- both halves index a model\'s berths the same way ---');
(function () {
  var bad = 0;
  MODELS.forEach(function (modelId) {
    Render.assignPort('orbital', modelId);
    var port = fakePort('p-idx-' + modelId, 1.9);
    var mb = Gen.modelledBerths(port);
    if (!mb || !mb.length) return;
    var sorted = mb.slice().sort(function (a, b) {
      return a.mid[0] - b.mid[0] || a.mid[1] - b.mid[1] || a.mid[2] - b.mid[2];
    });
    for (var i = 0; i < sorted.length; i++) {
      var off = Gen.berthOffset(port, i);
      if (Math.abs(off.x - sorted[i].mid[0]) > 1e-9 ||
          Math.abs(off.y - sorted[i].mid[1]) > 1e-9) { bad++; }
    }
  });
  check('berthOffset and berthBoxes agree on which berth is which',
        bad === 0, bad + ' disagreements');
})();

/* ---- and the shed on the ground ---------------------------------------
 * Surface ports are the other half of "every station works with every ship",
 * and they are built from the shared constant table rather than from art, so
 * there are no berth boxes to measure. What CAN be measured is the four
 * things that decide whether a hull gets in and fits once it is there: the
 * hatch it flies through, the headroom over it, the spacing between berths
 * along the wall, and whether a parked hull stays inside the chamber
 * instead of sticking out through the far side.
 *
 * This is the check the shed did not have when its chamber was 1.30 pad
 * radii, which is how it came to be 620 m across for a 25 m ship. */
console.log('--- the shed on the ground ---');
(function () {
  var pads = [];
  for (var i = 0; i < 40; i++) {
    Gen.generateSystem('shed-sweep-' + i).ports.forEach(function (p) {
      if (p.surface) pads.push(p.radius);
    });
  }
  pads.sort(function (a, b) { return a - b; });
  check('there are surface ports to measure', pads.length > 0, pads.length + ' pads');
  if (!pads.length) return;
  var sizes = [pads[0], pads[Math.floor(pads.length / 2)], pads[pads.length - 1]];
  console.log('  pad radii in play: ' + sizes.map(function (r) {
    return (r * 1000).toFixed(0) + ' m';
  }).join('  \u00b7  '));

  /* The hull that has to fit is the WORST of the fleet on each axis - the
   * widest, the tallest and the longest need not be the same ship, and a
   * shed that only takes the average is a shed that strands somebody. */
  var worst = { w: 0, h: 0, l: 0 };
  CLASSES.forEach(function (k) {
    var sp = Render.hullSpan(k);
    if (sp.w > worst.w) worst.w = sp.w;
    if (sp.h > worst.h) worst.h = sp.h;
    if (sp.l > worst.l) worst.l = sp.l;
  });
  console.log('  worst case hull: ' + m(worst.w) + ' wide, ' + m(worst.h) +
              ' tall, ' + m(worst.l) + ' long');

  var tight = { hatch: Infinity, head: Infinity, pitch: Infinity,
                depth: Infinity, ends: Infinity };
  sizes.forEach(function (r) {
    var port = { id: 'pad-' + r, surface: true, radius: r, shaftDepth: r * 0.9 };
    var g = Gen.bayGeometry(port);
    /* The hatch is square and the hull flies through it nose-first, so what
     * has to clear is the widest and the tallest of it, not its length. */
    tight.hatch = Math.min(tight.hatch, (2 * g.mouthR * r) / worst.w);
    tight.head = Math.min(tight.head, ((g.ceilZ - g.floorZ) * r) / worst.h);
    /* Berths line the two long walls and a berthed hull points across the
     * shed, so along the wall neighbours are separated by WIDTH and into the
     * wall each one needs LENGTH. */
    var xs = [];
    for (var b = 0; b < g.berths; b++) xs.push(Gen.berthOffset(port, b).x);
    xs = xs.filter(function (v, i, a) { return a.indexOf(v) === i; })
           .sort(function (a2, b2) { return a2 - b2; });
    for (var i2 = 1; i2 < xs.length; i2++) {
      tight.pitch = Math.min(tight.pitch, ((xs[i2] - xs[i2 - 1]) * r) / worst.w);
    }
    /* From the berth line out to the wall, and back in toward the middle:
     * half a hull each way, or it is parked through the concrete. */
    var toWall = (g.chamberY - Math.abs(g.berthY)) * r;
    tight.depth = Math.min(tight.depth, toWall / (worst.l / 2));
    /* AND THE SAME QUESTION ALONG THE WALL, which the first version of
     * this section forgot to ask - so a berth spread that put hulls outside
     * the chamber in x sailed through while the y check passed. The end
     * berth plus half a hull has to be inside the end wall. */
    var endGap = (g.chamberX - Math.abs(xs[xs.length - 1])) * r;
    tight.ends = Math.min(tight.ends === undefined ? Infinity : tight.ends,
                          endGap / (worst.w / 2));
  });

  check('the hatch passes the widest hull in the fleet', tight.hatch >= 1,
        tight.hatch.toFixed(2) + 'x');
  check('there is headroom over the tallest', tight.head >= 1,
        tight.head.toFixed(2) + 'x');
  check('neighbouring berths do not overlap', tight.pitch >= 1,
        tight.pitch.toFixed(2) + 'x');
  check('and a parked hull stays inside the chamber', tight.depth >= 1,
        tight.depth.toFixed(2) + 'x');
  check('including the ones at the ends of the wall', tight.ends >= 1,
        tight.ends.toFixed(2) + 'x');
  console.log('  tightest: hatch ' + tight.hatch.toFixed(1) + 'x  headroom ' +
              tight.head.toFixed(1) + 'x  berth pitch ' + tight.pitch.toFixed(1) +
              'x  depth ' + tight.depth.toFixed(1) + 'x  ends ' +
              tight.ends.toFixed(1) + 'x');
})();

/* ---- and the hall itself, not just the alcoves in it -------------------
 * The sweep at the top measures BERTH BOXES — alcoves an artist placed,
 * read back out of the port library. That is only half of what a station
 * has to get right. The room those alcoves sit in comes from the constant
 * table in Gen.stationBay, and it is live for every station in the game:
 * the library's orbital models declare a berth COUNT and nothing else, so
 * the hatch a ship flies through, the roof over it, the floor it lands on
 * and the walls it must not be parked through are all still the table's.
 * Nothing measured them, and they were the tightest room in the game by a
 * wide margin — a 25 m hull 12 m from the wall of a 170 m hall, with the
 * camera clamp then asked to find somewhere to stand in what was left.
 *
 * So the hall gets the same questions the shed gets, at the radii the
 * generator actually produces, against the worst hull on each axis. */
console.log('--- the hall the alcoves sit in ---');
(function () {
  var worst = { w: 0, h: 0, l: 0 };
  CLASSES.forEach(function (k) {
    var sp = Render.hullSpan(k);
    if (sp.w > worst.w) worst.w = sp.w;
    if (sp.h > worst.h) worst.h = sp.h;
    if (sp.l > worst.l) worst.l = sp.l;
  });

  var tight = { hatch: Infinity, head: Infinity, pitch: Infinity,
                depth: Infinity, ends: Infinity };
  var corner = 0;
  RADII.forEach(function (r) {
    /* Through bayGeometry, with a model assigned, because that is the
     * object the game hands to the doors, the mesh and the camera clamp.
     * If a model ever does start declaring its own chamber, this keeps
     * measuring whatever the station ends up with rather than the table. */
    Render.assignPort('orbital', MODELS[0]);
    var g = Gen.bayGeometry(fakePort('hall-' + r, r));
    tight.hatch = Math.min(tight.hatch, (2 * g.mouthR * r) / worst.w);
    tight.head = Math.min(tight.head, ((g.ceilZ - g.floorZ) * r) / worst.h);

    /* The berth spread is the fallback's, laid out the way berthOffset lays
     * it out. A station whose model carries berth anchors uses those
     * instead — the sweep at the top of this file is what measures THOSE —
     * but one whose model carries none lands here, and the room has to hold
     * them either way. */
    var xs = [];
    for (var b = 0; b < g.berths; b++) xs.push(Gen.tableBerthOffset(fakePort('hall-' + r, r), b).x);
    xs = xs.filter(function (v, i, a) { return a.indexOf(v) === i; })
           .sort(function (a2, b2) { return a2 - b2; });
    for (var i = 1; i < xs.length; i++) {
      tight.pitch = Math.min(tight.pitch, ((xs[i] - xs[i - 1]) * r) / worst.w);
    }
    tight.depth = Math.min(tight.depth,
                           ((g.chamberY - Math.abs(g.berthY)) * r) / (worst.l / 2));
    tight.ends = Math.min(tight.ends,
                          ((g.chamberX - Math.abs(xs[xs.length - 1])) * r) / (worst.w / 2));
    corner = Math.sqrt(g.chamberX * g.chamberX + g.chamberY * g.chamberY);
  });

  check('the hatch passes the widest hull in the fleet', tight.hatch >= 1,
        tight.hatch.toFixed(2) + 'x');
  check('there is headroom over the tallest', tight.head >= 1,
        tight.head.toFixed(2) + 'x');
  check('neighbouring berths do not overlap', tight.pitch >= 1,
        tight.pitch.toFixed(2) + 'x');
  check('and a parked hull stays inside the hall', tight.depth >= 1,
        tight.depth.toFixed(2) + 'x');
  check('including the ones at the ends of the wall', tight.ends >= 1,
        tight.ends.toFixed(2) + 'x');
  console.log('  tightest: hatch ' + tight.hatch.toFixed(1) + 'x  headroom ' +
              tight.head.toFixed(1) + 'x  berth pitch ' + tight.pitch.toFixed(1) +
              'x  depth ' + tight.depth.toFixed(1) + 'x  ends ' +
              tight.ends.toFixed(1) + 'x');

  /* AND THE CHEAP CONTAINMENT PROOF the table's comment promises: the hall
   * has to be inside the hub drawn around it. Both numbers are in station
   * radii, so this is a straight comparison and it costs nothing — which is
   * the point, because the alternative is noticing from a screenshot that
   * the hangar sticks out through the outside of its own station. */
  check('the hall fits inside the hub drawn around it', corner <= 0.36,
        'far corner ' + corner.toFixed(3) + ' vs hub radius 0.360');
})();

/* ---- is the hall the room you are actually in? ------------------------
 * main.js draws a station's modelled interior only when the berth the ship
 * is parked in lies INSIDE that interior's volume, because an axis-aligned
 * box round a spine-shaped room is most of the station and the eye can sit
 * in it while the ship is out on the rim. What that predicate answers is a
 * property of the ART, not of the code, so this measures it and says so.
 *
 * As the library ships today the answer is no, everywhere: the interior
 * buckets are concourses and the berth anchors are alcoves on the outside.
 * That is not asserted — an artist is free to put a berth in a hall and the
 * room should light up without anyone editing a test. What IS asserted is
 * that the question can be ASKED of every model, because a gate that
 * silently cannot be evaluated is a room that is silently never drawn. */
console.log('--- is a berth ever inside its station\'s own interior? ---');
(function () {
  var askable = 0, inside = 0, total = 0;
  MODELS.forEach(function (modelId) {
    Render.assignPort('orbital', modelId);
    var port = fakePort('gate-' + modelId, 1.9);
    var bb = Render.interiorBounds(modelId);
    var boxes = Sim.berthBoxes(port);
    if (!boxes || !boxes.length) return;
    for (var i = 0; i < boxes.length; i++) {
      var room = Sim.berthRoom(port, i);
      total++;
      if (!room || !bb) continue;
      askable++;
      if (room.x0 >= bb.lo[0] && room.x1 <= bb.hi[0] &&
          room.y0 >= bb.lo[1] && room.y1 <= bb.hi[1] &&
          room.z0 >= bb.lo[2] && room.z1 <= bb.hi[2]) inside++;
    }
  });
  check('the gate can be evaluated for every modelled berth there is',
        total > 0 && askable === total, askable + ' of ' + total + ' answerable');
  console.log('  ' + inside + ' of ' + total + ' modelled berths sit inside their ' +
              'station\'s own interior volume' +
              (inside === 0 ? ' — so the modelled hall is never drawn from a berth today'
                            : ''));
})();

/* ---- the way in, at every modelled station ----------------------------
 * The arrival rail for a station is a straight line along the berth's own
 * normal: hold off the outer doors, through the throat, onto the stand.
 * NONE of those distances are written down anywhere — they are measured off
 * the model by Gen.berthApertures every time — which is the right way round
 * and also the way a silent failure gets in. An aperture matched to the
 * wrong berth sends a ship in through the far side of the station, and it
 * would look like a bug in the camera rather than in a lookup.
 *
 * physics.test.js pins the HALL route, which is the fallback for a station
 * with no modelled berths. This is the other one, and it needs both
 * libraries loaded, which is this suite. */
console.log('--- the way in, at every modelled station ---');
(function () {
  var sys = Gen.generateSystem('arrival-sweep');
  var station = (sys.ports || []).filter(function (p) { return !p.surface; })[0];
  check('there is a station to fly into', !!station);
  if (!station) return;
  var t0 = 0;

  var bad = 0, checkedB = 0, straight = 0;
  var throatMin = Infinity, throatMax = 0, holdMin = Infinity;
  MODELS.forEach(function (modelId) {
    Render.assignPort('orbital', modelId);
    var n = (Gen.modelledBerths(station) || []).length;
    for (var i = 0; i < n; i++) {
      var ap = Gen.berthApertures(station, i);
      checkedB++;
      if (!ap || !ap.normal || typeof ap.gate !== 'number') {
        bad++;
        console.log('  FAIL  ' + modelId + ' berth ' + i + ' has no way in');
        continue;
      }
      /* The outer doors are OUTBOARD and the inner gate is INBOARD. Get
       * these the wrong way round and a ship flies out through the back of
       * the station into open space, which is the failure this pair of
       * signs exists to prevent. */
      if (!(ap.gate > 0) || (ap.inner !== null && !(ap.inner < 0))) {
        bad++;
        console.log('  FAIL  ' + modelId + ' berth ' + i + ' gate ' + ap.gate +
                    ' inner ' + ap.inner);
        continue;
      }
      var ship = { cls: 'courier', dryMass: 80, pos: { x: 0, y: 0, z: 0 },
                   vel: { x: 0, y: 0, z: 0 } };
      if (!Sim.beginArrival(ship, station, sys, t0)) {
        bad++;
        console.log('  FAIL  ' + modelId + ' refuses to run an arrival');
        continue;
      }
      var b = ship.arrival.berth;
      var total = Sim.arrivalTotal(station);
      var p0 = Sim.arrivalPose(station, sys, t0, b, 0);
      var pEnd = Sim.arrivalPose(station, sys, t0, b, total - 0.001);
      if (!p0 || !pEnd) { bad++; continue; }
      var r = station.radius || 1;
      holdMin = Math.min(holdMin, V.dist(p0.pos, pEnd.pos) / r);
      var th = Math.abs(ap.gate);
      throatMin = Math.min(throatMin, th);
      throatMax = Math.max(throatMax, th);

      /* A STRAIGHT LINE, and it has to be: the hull is being drawn along a
       * throat cut through a hull, so any sideways wander is a wall. Every
       * sample has to lie on the segment from where the rail starts to
       * where it ends. */
      var axis = V.sub(pEnd.pos, p0.pos);
      var len = V.len(axis);
      var off = 0;
      if (len > 1e-9) {
        var u = V.scale(axis, 1 / len);
        for (var k = 0; k <= 40; k++) {
          var q = Sim.arrivalPose(station, sys, t0, b, total * k / 40);
          if (!q) continue;
          var rel = V.sub(q.pos, p0.pos);
          var along = V.dot(rel, u);
          off = Math.max(off, V.len(V.sub(rel, V.scale(u, along))));
        }
      }
      if (off > r * 0.001) {
        straight++;
        console.log('  FAIL  ' + modelId + ' berth ' + i + ' wanders ' +
                    (off / r).toFixed(4) + ' radii off its own axis');
      }
    }
  });

  check('every modelled berth declares a way in, doors outboard and gate inboard',
        bad === 0, bad + ' bad of ' + checkedB);
  check('and the rail down a throat is a straight line', straight === 0,
        straight + ' wandering');
  console.log('  outer doors sit ' + throatMin.toFixed(3) + '-' +
              throatMax.toFixed(3) + ' station radii outboard of the throat ' +
              'floor, measured off the art');
  console.log('  shortest run from handover to the stand: ' +
              holdMin.toFixed(2) + ' station radii (' +
              (holdMin * (station.radius || 1) * 1000).toFixed(0) + ' m here)');
})();

/* ---- a station is a solid object ---------------------------------------
 * Astra: "no collision detection enabled on the interiors or exteriors of
 * stations." Render.portSolidity voxelises a model once into wall / open
 * space / room, and Sim carves the berth throats through it.
 *
 * THE FIRST THING PINNED HERE IS THE CACHE, which sounds like plumbing and
 * is not: the first version stored `null` before building and never stored
 * the result, so it answered correctly exactly once per role and null for
 * the rest of the session. Every downstream symptom of that — the sky back
 * inside the hull, a ship through a wall — looks like the feature not
 * existing rather than like a cache bug, which is the worst way for it to
 * fail. */
console.log('--- a station is a solid object ---');
(function () {
  var sys = Gen.generateSystem('solid-sweep');
  var station = (sys.ports || []).filter(function (p) { return !p.surface; })[0];
  check('there is a station to be solid', !!station);
  if (!station) return;

  var sameTwice = 0, hasRooms = 0, hasWalls = 0, n = 0;
  MODELS.forEach(function (modelId) {
    Render.assignPort('orbital', modelId);
    var a = Render.portSolidity(modelId);
    var b = Render.portSolidity(modelId);
    n++;
    if (a && a === b) sameTwice++;
    if (!a) return;
    var wall = 0, room = 0;
    for (var i = 0; i < a.grid.length; i++) {
      if (a.grid[i] === Render.SOLID_WALL) wall++;
      else if (a.grid[i] === Render.SOLID_IN) room++;
    }
    if (wall > 0) hasWalls++;
    if (room > 0) hasRooms++;
  });
  check('asking a model for its solidity twice gives the same grid twice',
        sameTwice === n, sameTwice + ' of ' + n);
  check('every station model has walls in it', hasWalls === n, hasWalls + ' of ' + n);
  check('and a room the outside cannot reach', hasRooms === n, hasRooms + ' of ' + n);

  /* AND THE DOOR IS OPEN — which is a check on the CARVE, not on the art,
   * and saying so matters because the two look identical from here.
   *
   * The carve follows the same line the rail flies, so of course the rail
   * comes out clear; what this catches is the carve and the rail drifting
   * apart, which they would the moment either the leg table or
   * berthApertures changed. That is worth pinning and it is not a claim
   * that the route is clear of the model's own geometry.
   *
   * MEASURED AGAINST THE RAW ART, before any carve, the route is NOT clear:
   * at a cradle 26 of 31 sample points along the rail are inside mesh, and
   * at cylinder-m 17 of 31. That is not the rail being wrong — it is the
   * DOORS. A station's blast doors, sliding leaves and force field are all
   * geometry in the shell, they are solid to a voxeliser, and nothing in
   * the game opens them: Sim.arrivalPose poses `gates.apron` from shut to
   * open across the legs and no modelled station reads it. So a ship is
   * flown through a door that is drawn closed, which is exactly what Astra
   * reported as being pulled in through the wall.
   *
   * The carve is therefore load-bearing rather than a convenience: it is
   * the only thing that currently says a doorway is a doorway. */
  var blocked = 0, checkedPts = 0;
  MODELS.forEach(function (modelId) {
    Render.assignPort('orbital', modelId);
    var ship = { cls: 'courier', dryMass: 80, pos: { x: 0, y: 0, z: 0 },
                 vel: { x: 0, y: 0, z: 0 } };
    if (!Sim.beginArrival(ship, station, sys, 0)) return;
    var b = ship.arrival.berth, total = Sim.arrivalTotal(station);
    for (var k = 0; k <= 30; k++) {
      var pose = Sim.arrivalPose(station, sys, 0, b, total * k / 30);
      if (!pose) continue;
      checkedPts++;
      if (Sim.stationSolidAt(station, pose.pos, sys, 0) === Render.SOLID_WALL) {
        blocked++;
        if (blocked < 3) {
          console.log('  FAIL  ' + modelId + ' flies its own arrival into a wall at ' +
                      (100 * k / 30).toFixed(0) + '% of the way in');
        }
      }
    }
  });
  check('no station flies its own arrival into a wall', blocked === 0,
        blocked + ' of ' + checkedPts + ' points');

  /* AND THE HULL IS STILL SOLID somewhere a ship has no business being.
   * Without this the carve could widen until nothing was solid and every
   * check above would still pass. */
  Render.assignPort('orbital', MODELS[0]);
  var sol = Render.portSolidity(MODELS[0]);
  var solid = 0;
  if (sol) {
    for (var q = 0; q < sol.grid.length; q++) if (sol.grid[q] === Render.SOLID_WALL) solid++;
  }
  check('and cutting the doors did not dissolve the hull',
        solid > sol.grid.length * 0.02,
        (100 * solid / sol.grid.length).toFixed(1) + '% of the grid is wall');
})();

Render.assignPort('orbital', null);   // leave the library as we found it

console.log('');
console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
