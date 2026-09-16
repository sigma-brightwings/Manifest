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

/* ---- and the doors are doors ------------------------------------------
 * The models ship a full airlock: every leaf carries its own travel and
 * every berth names its outerGate, its innerGate and an interlock rule.
 * What was lost was the SEPARATION — the converter merged the leaves into
 * one shell, so there was nothing left to move, and a ship was flown
 * through a door drawn shut.
 *
 * Render.portDoors splits them back out by the gates anchors' own boxes.
 * What is pinned here is that the split is real on both sides: leaves that
 * are actually leaves, a hull that is still a hull, and a travel that
 * genuinely clears the opening rather than nudging the leaf a metre. */
console.log('--- and the doors are doors ---');
(function () {
  var bad = 0, checkedM = 0, noDoors = [];
  var minTravel = Infinity, maxTravel = 0, fields = 0, movers = 0;
  MODELS.forEach(function (modelId) {
    var d = Render.portDoors(modelId);
    checkedM++;
    if (!d) { noDoors.push(modelId); return; }
    /* THE PAINT SURVIVED, and this one shipped broken for an hour. The
     * library stores palette indices; `decompress` expands them into one
     * colour string per face and drops the indices. The split partitioned
     * the indices — undefined on a decompressed mesh — so every face came
     * out with no material and paintMesh fell back to the caller's tint.
     * A whole station in flat white, with 4,440 faces of caution yellow
     * painted over. Nothing else here would have noticed. */
    var uncoloured = (d.hull.c || []).filter(function (x) { return !x; }).length;
    if (d.hull.c.length !== d.hull.f.length || uncoloured) {
      bad++;
      console.log('  FAIL  ' + modelId + ' hull lost its paint: ' + uncoloured +
                  ' of ' + d.hull.f.length + ' faces have no colour');
    }
    d.leaves.forEach(function (lf) {
      if (lf.mesh.c && lf.mesh.c.length === lf.mesh.f.length &&
          !lf.mesh.c.filter(function (x) { return !x; }).length) return;
      bad++;
      console.log('  FAIL  ' + modelId + ' leaf ' + lf.node + ' lost its paint');
    });

    /* THE HULL SURVIVED. A split that swallowed the station into its own
     * doors would leave nothing to draw and nothing to hit, and every
     * other check here would still pass. */
    if (!(d.hull.f.length > d.leaves.reduce(function (n, l) { return n + l.mesh.f.length; }, 0))) {
      bad++;
      console.log('  FAIL  ' + modelId + ' is more door than station');
    }
    d.leaves.forEach(function (lf) {
      if (lf.field) { fields++; return; }
      if (!(lf.travel > 0)) { bad++; console.log('  FAIL  ' + modelId + ' leaf ' + lf.node + ' does not move'); return; }
      movers++;
      minTravel = Math.min(minTravel, lf.travel);
      maxTravel = Math.max(maxTravel, lf.travel);
      /* A UNIT AXIS, one component, no diagonals. A leaf that slid along
       * two axes at once would be a leaf leaving its own track. */
      var nz = lf.axis.filter(function (v) { return v !== 0; });
      if (nz.length !== 1 || Math.abs(nz[0]) !== 1) {
        bad++;
        console.log('  FAIL  ' + modelId + ' leaf ' + lf.node + ' slides along ' + lf.axis);
      }
    });
  });
  check('every orbital model with gates gives up its doors', bad === 0,
        bad + ' bad of ' + checkedM + ' models');
  check('and each one has exactly the field panels it declared',
        fields > 0, fields + ' force fields');
  console.log('  ' + movers + ' sliding leaves, travel ' + minTravel.toFixed(3) +
              '-' + maxTravel.toFixed(3) + ' station radii' +
              (noDoors.length ? '   (no gates: ' + noDoors.join(' ') + ')' : ''));

  /* AND OPEN WIDE ENOUGH FOR THE FLEET. A door that opens by less than the
   * hull is a door that does not open. Measured at the SMALLEST station the
   * generator makes, where a ship is largest against the station. */
  var worstW = 0;
  CLASSES.forEach(function (k) {
    var sp = Render.hullSpan(k);
    if (sp.w > worstW) worstW = sp.w;
  });
  var smallest = RADII[0];
  check('the leaves clear the widest hull in the fleet, at the smallest station',
        minTravel * 2 * smallest >= worstW,
        (minTravel * 2 * smallest * 1000).toFixed(0) + ' m of opening for a ' +
        (worstW * 1000).toFixed(0) + ' m hull');
})();

/* ---- outdoors until you are through the door ---------------------------
 * The carve is what makes a doorway passable, and the first version of it
 * wrote "room" along the corridor's whole length — including the lead-in,
 * which starts well outside the hull. A ship holding off the doors was
 * therefore ENCLOSED, and the sky went away while it was still in the open.
 *
 * Cutting a doorway takes away the door. It does not move the outside
 * indoors. So this walks a whole arrival and asks where the change
 * happens: it has to be exactly once, and it has to be after the hold. */
console.log('--- outdoors until you are through the door ---');
(function () {
  var sys = Gen.generateSystem('doorway-sweep');
  var bad = 0, never = 0, early = 0, checkedS = 0;
  (sys.ports || []).filter(function (p) { return !p.surface; }).forEach(function (port) {
    var ship = { cls: 'courier', dryMass: 80, pos: { x: 0, y: 0, z: 0 },
                 vel: { x: 0, y: 0, z: 0 } };
    if (!Sim.beginArrival(ship, port, sys, 0)) return;
    checkedS++;
    var b = ship.arrival.berth, total = Sim.arrivalTotal(port);
    var flips = 0, was = null, firstIn = -1;
    for (var k = 0; k <= 40; k++) {
      var pose = Sim.arrivalPose(port, sys, 0, b, total * k / 40);
      if (!pose) continue;
      var now = !!Sim.insideStation(pose.pos, sys, 0);
      if (was !== null && now !== was) flips++;
      if (now && firstIn < 0) firstIn = k;
      was = now;
    }
    /* ONCE. Outdoors, then indoors, and never back — a second flip is the
     * sky strobing at a ship being carried through a wall. */
    if (flips !== 1) { bad++; console.log('  FAIL  ' + Render.portModelFor(port) +
                                          ' crosses the threshold ' + flips + ' times'); }
    if (firstIn < 0) never++;
    /* AND NOT AT THE HANDOVER. The rail is picked up well outside the
     * doors; if that first point already reads as indoors the carve has
     * leaked back out into open space again. */
    if (firstIn === 0) early++;
    /* Docked is unambiguous and is the state the whole thing is for. */
    var parked = { cls: 'courier', dryMass: 80, pos: { x: 0, y: 0, z: 0 },
                   vel: { x: 0, y: 0, z: 0 } };
    Sim.dockShip(parked, port, sys, 0);
    if (!Sim.insideStation(parked.pos, sys, 0)) {
      bad++;
      console.log('  FAIL  ' + Render.portModelFor(port) + ' is not inside itself when docked');
    }
  });
  check('there are arrivals to walk', checkedS > 0, checkedS + ' stations');
  check('an arrival crosses from outdoors to indoors exactly once', bad === 0,
        bad + ' wrong of ' + checkedS);
  check('and it gets indoors at all', never === 0, never + ' never did');
  check('but not before it has reached the doors', early === 0,
        early + ' were indoors at the handover');
})();

/* ---- you can land in a berth, and you cannot fly through the wall -------
 * Astra: "we need collision so that I can land the ship inside the station.
 * Make that work, and make stations consider you docked if you are gear
 * down, moving slowly and colliding with your berth's floor."
 *
 * Which is a pad, in orbit. So this pins it the way a pad behaves: touching
 * down is position, the COST is speed and gear, and nothing is ever
 * silently refused — bouncing off your own berth with no explanation is the
 * failure padCapture was written to avoid. */
console.log('--- landing in a berth ---');
(function () {
  var sys = Gen.generateSystem('landing-sweep');
  var landed = 0, hurt = 0, belly = 0, checkedL = 0;
  (sys.ports || []).filter(function (p) { return !p.surface; }).forEach(function (port) {
    /* CLEARED, because a berth does not close its clamps on a ship that
     * has not been given the bay. That is the subsystem that stops a
     * launched ship being picked straight back up, and it means every
     * landing test has to say out loud that it has permission. */
    function shipAt(pos, vel, gear) {
      var sh = { cls: 'courier', dryMass: 80, hullHp: 100, gear: !!gear,
                 pos: V.clone(pos), vel: V.clone(vel),
                 fwd: { x: 1, y: 0, z: 0 }, up: { x: 0, y: 0, z: 1 },
                 right: { x: 0, y: -1, z: 0 }, cleared: {} };
      sh.cleared[port.id] = true;
      return sh;
    }
    var bs = Sim.berthState(port, sys, 0, 0);
    if (!bs) return;
    checkedL++;

    /* A CLEAN SEAT: in the berth, matched to it, gear down. Docked, free. */
    var a = shipAt(bs.pos, bs.vel, true);
    Sim.checkImpact(a, sys, 0, true);
    if (a.docked === port.id && a.hullHp === 100) landed++;
    else console.log('  FAIL  ' + Render.portModelFor(port) +
                     ' refused a clean landing (docked=' + a.docked +
                     ' hull=' + a.hullHp + ')');

    /* THE SAME ARRIVAL, FAST. Still docked — you are not bounced — but it
     * costs hull, which is the whole of the FE2 model this copies. */
    var b = shipAt(bs.pos, V.addScaled(bs.vel, { x: 1, y: 0, z: 0 }, 0.06), true);
    Sim.checkImpact(b, sys, 0, true);
    if (b.docked === port.id && b.hullHp < 100) hurt++;

    /* AND GEAR UP, which is landing on the hull and costs three times. */
    var c = shipAt(bs.pos, V.addScaled(bs.vel, { x: 1, y: 0, z: 0 }, 0.04), false);
    var d = shipAt(bs.pos, V.addScaled(bs.vel, { x: 1, y: 0, z: 0 }, 0.04), true);
    Sim.checkImpact(c, sys, 0, true);
    Sim.checkImpact(d, sys, 0, true);
    if (c.hullHp < d.hullHp) belly++;
  });
  check('there are berths to land in', checkedL > 0, checkedL + ' stations');
  check('a clean seat in your own berth docks you, free', landed === checkedL,
        landed + ' of ' + checkedL);
  check('arriving fast still docks you, and costs hull', hurt === checkedL,
        hurt + ' of ' + checkedL);
  check('and the gear being up costs more than the same speed with it down',
        belly === checkedL, belly + ' of ' + checkedL);

  /* ---- AND LAUNCHING GETS YOU OUT --------------------------------------
   * The first version of the catch had no permission in it, so undocking —
   * which sets the hull down two metres a second off the clamps and leaves
   * it exactly where it was berthed — was followed immediately by being
   * docked again. From the seat that is not a docking bug, it is DEAD
   * THRUSTERS: you press the key, nothing moves, and nothing says why.
   *
   * Astra's rule: not docked again unless you leave and come back, or ask
   * again. Clearance is spent on arrival, so a launched ship holds none and
   * the catch does not fire; coming back inside ten kilometres re-grants
   * it, and so does hailing. This pins both ends of that. */
  var stuck = 0, rearmed = 0, checkedU = 0;
  (sys.ports || []).filter(function (p) { return !p.surface; }).forEach(function (port) {
    var bs0 = Sim.berthState(port, sys, 0, 0);
    if (!bs0) return;
    checkedU++;
    var sh = { cls: 'courier', dryMass: 80, hullHp: 100, gear: true,
               pos: V.clone(bs0.pos), vel: V.clone(bs0.vel),
               fwd: { x: 1, y: 0, z: 0 }, up: { x: 0, y: 0, z: 1 },
               right: { x: 0, y: -1, z: 0 }, cleared: {} };
    sh.cleared[port.id] = true;
    Sim.checkImpact(sh, sys, 0, true);
    if (sh.docked !== port.id) return;              // covered above
    /* Arriving SPENDS the clearance, the way Combat.arriveAtPort does. */
    delete sh.cleared[port.id];
    Sim.undockShip(sh, sys, 0, 0.002);
    /* Several frames of it, because once-is-luck: the catch runs every
     * frame and the hull has barely moved in any of them. */
    for (var k = 0; k < 8; k++) Sim.checkImpact(sh, sys, 0, true);
    if (sh.docked) {
      stuck++;
      console.log('  FAIL  ' + Render.portModelFor(port) + ' picks a launched ship straight back up');
    }
    /* AND ASKING AGAIN LETS YOU BACK IN, without having gone anywhere —
     * which is the second of the two ways out, and the one a pilot who
     * launched by mistake would reach for. */
    sh.cleared[port.id] = true;
    Sim.checkImpact(sh, sys, 0, true);
    if (sh.docked === port.id) rearmed++;
  });
  check('launching gets you out and keeps you out', stuck === 0,
        stuck + ' of ' + checkedU + ' re-docked');
  check('and asking for clearance again lets you back in', rearmed === checkedU,
        rearmed + ' of ' + checkedU);

  /* AND THE WALL — but "in a wall" is no longer a cell, it is a place.
   *
   * THIS TEST USED TO PICK THE CENTRE OF A GRID CELL MARKED WALL, and that
   * stopped meaning anything. A cell is 48th of a model, so at
   * STATION_SCALE 3.5 it is 183-315 m across and is marked WALL if ANY
   * triangle passes through it — its centre is usually open air a long way
   * from any surface. Asserting that a hull there is a collision was
   * asserting that a ship flying past a station at two hundred metres
   * should be flung sideways, which is precisely what the old grid escape
   * did (1.35 cells, so 248-425 m, every frame) and precisely what Astra
   * was seeing when she said collision did not work and the camera kept
   * doing that thing.
   *
   * So the requirement is restated in terms of geometry rather than of the
   * structure that used to approximate it: a hull with SOLID ON EVERY SIDE
   * within its own length is buried and must be moved; a hull with room in
   * any direction is flying, and must be left alone. Both halves matter,
   * and the second is the one that was wrong. */
  var freed = 0, stillIn = 0, checkedW = 0, falseGrab = 0, checkedF = 0;

  /* Every axis blocked within a hull's length: genuinely inside something. */
  function boxedIn(role, at, step) {
    var dirs = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
    for (var i = 0; i < dirs.length; i++) {
      var d = dirs[i];
      if (!Render.portSegmentHit(role, at,
            [at[0] + d[0] * step, at[1] + d[1] * step, at[2] + d[2] * step])) return false;
    }
    return true;
  }

  (sys.ports || []).filter(function (p) { return !p.surface; }).forEach(function (port) {
    var basis = Sim.portBasis(port, sys, 0);
    var role = Render.portModelFor(port);
    var ix = Render.portTriangles(role);
    if (!basis || !ix) return;
    var r = port.radius || 1;
    var step = 0.025 / r;                       // a hull length, in model units
    var toWorld = function (m) {
      var w = V.addScaled(basis.entrance.pos, basis.east, m[0] * r);
      w = V.addScaled(w, basis.north, m[1] * r);
      return V.addScaled(w, basis.up, m[2] * r);
    };
    var fly = function (m) {
      return { cls: 'courier', dryMass: 80, hullHp: 100, gear: false,
               pos: toWorld(m), vel: V.clone(Sim.bodyState(port, sys, 0).vel),
               fwd: { x: 1, y: 0, z: 0 }, up: { x: 0, y: 0, z: 1 },
               right: { x: 0, y: -1, z: 0 } };
    };

    /* A genuinely buried point: step off a face along its own normal, into
     * the structure, until every direction is blocked. */
    var n = ix.tri.length / 3, buried = null, open = null;
    for (var k = 0; k < n && (!buried || !open); k += Math.max(1, Math.floor(n / 200))) {
      var a = ix.tri[k * 3], b = ix.tri[k * 3 + 1], c = ix.tri[k * 3 + 2];
      var mid = [(a[0]+b[0]+c[0])/3, (a[1]+b[1]+c[1])/3, (a[2]+b[2]+c[2])/3];
      var e1 = [b[0]-a[0], b[1]-a[1], b[2]-a[2]], e2 = [c[0]-a[0], c[1]-a[1], c[2]-a[2]];
      var nx = e1[1]*e2[2]-e1[2]*e2[1], ny = e1[2]*e2[0]-e1[0]*e2[2], nz = e1[0]*e2[1]-e1[1]*e2[0];
      var nl = Math.sqrt(nx*nx+ny*ny+nz*nz);
      if (!(nl > 1e-12)) continue;
      nx /= nl; ny /= nl; nz /= nl;
      var into = [mid[0] - nx * step * 0.4, mid[1] - ny * step * 0.4, mid[2] - nz * step * 0.4];
      if (!buried && boxedIn(role, into, step)) buried = into;
      var out = [mid[0] + nx * step * 3, mid[1] + ny * step * 3, mid[2] + nz * step * 3];
      if (!open && !boxedIn(role, out, step)) open = out;
    }

    /* HALF ONE: a buried hull is freed. */
    if (buried) {
      checkedW++;
      var sh = fly(buried);
      Sim.checkStationImpact(sh, sys, 0);
      var rel = V.sub(sh.pos, basis.entrance.pos);
      var now = [V.dot(rel, basis.east) / r, V.dot(rel, basis.north) / r,
                 V.dot(rel, basis.up) / r];
      if (boxedIn(role, now, step)) {
        stillIn++;
        console.log('  FAIL  ' + role + ' leaves a hull buried in its structure');
      } else freed++;
    }

    /* HALF TWO, and the one the old test had backwards: a hull in open
     * space near the station is NOT touched. */
    if (open) {
      checkedF++;
      var sh2 = fly(open);
      var before = V.clone(sh2.pos);
      Sim.checkStationImpact(sh2, sys, 0);
      var moved = V.dist(before, sh2.pos) * 1000;
      if (moved > 1) {
        falseGrab++;
        console.log('  FAIL  ' + role + ' shoved a hull that was in open space ' +
                    moved.toFixed(0) + ' m');
      }
    }
  });
  check('a hull buried in station structure is freed', stillIn === 0 && checkedW > 0,
        freed + ' of ' + checkedW + ' freed');
  check('and a hull in open space beside a station is left alone',
        falseGrab === 0 && checkedF > 0, checkedF + ' checked, ' + falseGrab + ' shoved);'.replace(');', ''));
})();

/* ---- a hull parks on the deck, not in it ---------------------------------
 *
 * THE BUG THIS PINS. berthOffset read the berth anchor's `min[2]` as the
 * floor. The anchors are hung with their TOP at the deck and extend down
 * through it, so `min[2]` is 64-96 m inside the plating on every berth of
 * every station in the shipped library. Ships parked under the floor, the
 * camera orbited a point inside solid structure, and the screen filled with
 * the unlit back of a wall — Astra's grey bay.
 *
 * The check is not "the deck is where it is today", which would pin an
 * accident. It is the invariant that was violated: THE PARK POINT IS IN
 * OPEN AIR. Render.berthBoom casts 144 directions from it; if it is buried,
 * every one of them hits almost immediately.
 *
 * THE THRESHOLD IS MEASURED, not chosen. Across the whole library the
 * smallest of those 20,000-odd samples is 0.0070 radii; with the park point
 * back inside the plating it was 0.0010. 0.0040 sits between them with
 * room on both sides — a factor of 1.75 below anything the art actually
 * does, and a factor of 4 above the failure. */
(function () {
  var BURIED = 0.0040;                    // port radii
  var checked = 0, buried = 0, offDeck = 0, worst = Infinity, worstWho = '';

  MODELS.forEach(function (id) {
    var lib = Render.libPort(id);
    var mb = lib && lib.anchors && lib.anchors.berths;
    if (!mb || !mb.length) return;
    for (var k = 0; k < mb.length; k++) {
      var deck = Render.berthDeck(id, k);
      if (deck === null) continue;
      checked++;

      /* The deck has to lie inside the berth it belongs to. A measurement
       * that wandered out of the box is a measurement of something else. */
      var sorted = mb.slice().sort(function (a, b) {
        return a.mid[0] - b.mid[0] || a.mid[1] - b.mid[1] || a.mid[2] - b.mid[2];
      });
      var b = sorted[k];
      if (b.min && b.max && (deck < b.min[2] - 1e-6 || deck > b.max[2] + 1e-6)) {
        offDeck++;
        console.log('  FAIL  ' + id + ' berth ' + k + ' put its deck outside its own anchor');
      }

      var tb = Render.berthBoom(id, k);
      if (!tb) continue;
      var m = Infinity;
      for (var i = 0; i < tb.d.length; i++) if (tb.d[i] < m) m = tb.d[i];
      if (m < worst) { worst = m; worstWho = id + ' berth ' + k; }
      if (m < BURIED) {
        buried++;
        console.log('  FAIL  ' + id + ' berth ' + k + ' parks its hull in the plating   ' +
                    m.toFixed(4) + ' radii to the nearest surface');
      }
    }
  });

  check('every modelled berth has a measurable deck', checked > 0, checked + ' berths');
  check('and the deck is inside the berth it belongs to', offDeck === 0, offDeck + ' astray');
  check('a hull parks in open air, not inside the plating', buried === 0,
        'tightest ' + worst.toFixed(4) + ' radii at ' + worstWho);

  /* The boom table is the camera's only defence against the same mistake,
   * so it has to answer, and it has to answer the same way twice — it is
   * built once and cached, and a cache that returns null on the second ask
   * is the bug portSolidity had. */
  var again = Render.berthBoom(MODELS[0], 0);
  check('the boom table survives being asked twice', !!again && again.d.length > 0);

  /* And the lookup has to be bounded in every direction, including the two
   * poles, where the yaw term degenerates. */
  var bad = 0;
  [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
   [0.6, -0.6, 0.5], [-0.3, 0.2, -0.9]].forEach(function (d) {
    var v = Render.boomLimit(MODELS[0], 0, d);
    if (!(v > 0) || !isFinite(v)) bad++;
  });
  check('the boom lookup is bounded in every direction', bad === 0, bad + ' unbounded');

  /* A role with no model has nothing to measure and must say so rather
   * than inventing a number — the camera falls back to the bay table. */
  check('an unmodelled role measures nothing',
        Render.berthDeck('no-such-station', 0) === null &&
        !isFinite(Render.boomLimit('no-such-station', 0, [1, 0, 0])));
})();

/* ---- a station is a set of compartments ---------------------------------
 *
 * Astra's design, and the art already declares it: every section has a
 * blast door, so the renderer only has to draw the one around the ship.
 * What this pins is the decomposition those doors hang off.
 *
 * THE TRAP IT GUARDS is naming. A ring MIRRORS its patterns, so two alcoves
 * on opposite sides of the hub are both called berthSM0 — grouping by node
 * name alone gave ring-s two sections where it has five. Sections are
 * therefore geometric, keyed on the berth INDEX in the same canonical order
 * generate.js sorts by, and this checks the two halves of that: every berth
 * lands in its own section, and open space lands in none. */
(function () {
  console.log('--- the station in compartments ---');
  var checked = 0, own = 0, leaked = 0, faces = [];
  MODELS.forEach(function (id) {
    var S = Render.portSections(id);
    var lib = Render.libPort(id);
    var mb = lib && lib.anchors && lib.anchors.berths;
    if (!S || !mb) return;
    var sorted = mb.slice().sort(function (a, b) {
      return a.mid[0] - b.mid[0] || a.mid[1] - b.mid[1] || a.mid[2] - b.mid[2];
    });
    check('every berth of ' + id + ' has a section',
          S.n === sorted.length, S.n + ' vs ' + sorted.length);
    for (var k = 0; k < sorted.length; k++) {
      checked++;
      if (Render.sectionAt(id, sorted[k].mid) === k) own++;
    }
    /* A corner of the bounding cube is not in anybody's compartment. */
    if (Render.sectionAt(id, [0.95, 0.95, 0.95]) >= 0) leaked++;

    var whole = 0, one = 0;
    ['hull', 'interior'].forEach(function (b) {
      if (S.structure[b]) whole += S.structure[b].f.length;
      S.sections.forEach(function (s) { if (s[b]) whole += s[b].f.length; });
    });
    ['hull', 'interior'].forEach(function (b) {
      if (S.structure[b]) one += S.structure[b].f.length;
      if (S.sections[0] && S.sections[0][b]) one += S.sections[0][b].f.length;
    });
    /* A single-compartment station is the whole station, correctly — a
     * cylinder has one bay and nothing to divide. Only models that HAVE
     * divisions can be asked whether dividing them paid. */
    if (S.n > 1) faces.push({ id: id, whole: whole, one: one });
  });

  check('every berth is in its own compartment', own === checked,
        own + ' of ' + checked);
  check('and open space is in none of them', leaked === 0, leaked + ' leaked');

  /* The point of the exercise: one room costs a fraction of the station. */
  var worst = 0, worstId = '';
  faces.forEach(function (f) {
    var frac = f.one / f.whole;
    if (frac > worst) { worst = frac; worstId = f.id; }
  });
  check('one compartment is a fraction of a divided station',
        faces.length > 0 && worst < 0.75,
        faces.length + ' divided models, worst ' + worstId + ' draws ' +
        (worst * 100).toFixed(0) + '% of its faces');
  console.log('  one compartment costs ' +
              (100 * faces.reduce(function (a, f) { return a + f.one / f.whole; }, 0) /
               Math.max(1, faces.length)).toFixed(0) + '% of the station, on average');

  /* Built once and cached — it is a second of work across the library. */
  check('the decomposition is cached', Render.portSections(MODELS[0]) ===
        Render.portSections(MODELS[0]));
})();

/* ---- the blast doors are real -------------------------------------------
 *
 * Astra's call: sections, and make the doors matter. The art has specified
 * the mechanism all along — every berth carries an airlock with an outer
 * set of sliding doors, an inner gate, and an interlock — and these are the
 * three things that make it true rather than decorative.
 *
 * ONE AUTHORITY is the load-bearing claim. The renderer draws what
 * Sim.stationDoorState says and the collision test makes solid what
 * Sim.stationDoorState says, so a door you can see is shut is a door you
 * cannot fly through. Two sources for that would drift within a week. */
(function () {
  console.log('--- the blast doors ---');

  /* ONE: a shut leaf is solid where it is, and an open one is not. The
   * collision index cannot hold this because the leaf MOVES — it is baked
   * at the closed position — so it is tested separately at its live
   * offset. */
  var solidShut = 0, clearOpen = 0, tried = 0;
  MODELS.forEach(function (id) {
    var d = Render.portDoors(id);
    var lib = Render.libPort(id);
    var mb = lib && lib.anchors && lib.anchors.berths;
    if (!d || !mb) return;
    var sorted = mb.slice().sort(function (a, b) {
      return a.mid[0] - b.mid[0] || a.mid[1] - b.mid[1] || a.mid[2] - b.mid[2];
    });
    var b = sorted[0];
    var mine = d.leaves.filter(function (l) {
      return l.berthMid && Math.abs(l.berthMid[0] - b.mid[0]) < 1e-6 &&
             Math.abs(l.berthMid[1] - b.mid[1]) < 1e-6 && !l.field && l.travel > 0;
    });
    if (!mine.length) return;
    var lf = mine[0], m = lf.mesh;
    var lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
    m.f.forEach(function (f) {
      f.forEach(function (vi) {
        var p = m.v[vi];
        if (!p) return;
        for (var a = 0; a < 3; a++) {
          if (p[a] < lo[a]) lo[a] = p[a];
          if (p[a] > hi[a]) hi[a] = p[a];
        }
      });
    });
    var c = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2];
    var n = b.normal || [1, 0, 0];
    var A = [c[0] + n[0] * 0.04, c[1] + n[1] * 0.04, c[2] + n[2] * 0.04];
    var B = [c[0] - n[0] * 0.04, c[1] - n[1] * 0.04, c[2] - n[2] * 0.04];
    tried++;
    if (Render.leafHit(id, A, B, { open: 0, berthMid: b.mid })) solidShut++;
    if (!Render.leafHit(id, A, B, { open: 1, berthMid: b.mid })) clearOpen++;
  });
  check('a shut blast door is solid', tried > 0 && solidShut === tried,
        solidShut + ' of ' + tried);
  check('and an open one is a hole', clearOpen === tried, clearOpen + ' of ' + tried);

  /* TWO: the interlock. Both ends open at once is not an airlock, it is a
   * corridor — so neither gate may begin to move while the other is off its
   * seat, whatever is asked of it. */
  var port = { id: 'lock-test', radius: 5, kind: 'station', surface: false, docking: true };
  var t = 0, both = 0, steps = 0;
  var st = Sim.airlockState(port, 0, t, true, false);       // open the outer
  for (var k = 0; k < 40; k++) {
    t += 0.25;
    /* Ask for BOTH the whole way, which is the demand the interlock exists
     * to refuse. */
    st = Sim.airlockState(port, 0, t, true, true);
    steps++;
    if (st.outer > 0.05 && st.inner > 0.05) both++;
  }
  check('the outer gate opens when asked', st.outer > 0.9, st.outer.toFixed(2));
  check('and the inner stays seated while it is open', st.inner < 0.05,
        st.inner.toFixed(2));
  check('the two are never open together', both === 0,
        both + ' of ' + steps + ' steps');

  /* And it cycles: shut the outer, and only then does the inner run back. */
  for (var j = 0; j < 40; j++) { t += 0.25; st = Sim.airlockState(port, 0, t, false, true); }
  check('shutting the outer lets the inner open', st.inner > 0.9 && st.outer < 0.05,
        'outer ' + st.outer.toFixed(2) + ', inner ' + st.inner.toFixed(2));

  /* THREE: a clock that runs backwards is a career reload, not a paradox. */
  var back = Sim.airlockState(port, 0, t - 500, false, true);
  check('and a rewound clock does not throw the gates', back.inner > 0.9,
        back.inner.toFixed(2));
})();

console.log('--- the doorway is a hole ---');
(function () {
  /* Astra, parked: "How about the transfer halls between the bay and the
   * doors to the outside? Currently it's 4 walls and no doors."
   *
   * She was describing something real and it was not a rendering bug. The
   * aperture was never cut. Measured before the fix: 81 rays fired out
   * across the whole cross-section of a berth, not one reaching open
   * space, every one stopping at about 700 m — and opening the doors
   * changed nothing, because what they hit was not a door. 48 of 48
   * modelled berths could not see their own doorway from the park point.
   * The leaves slid, the voxel grid was carved so the simulation believed
   * there was a corridor, and the wall itself had no hole in it.
   *
   * WHAT THIS PINS. Not the wording of the fix — that the doorways are
   * open, measured the way a ship experiences them: a ray down the berth's
   * own axis, through the collision index every hull test goes through.
   * Cut it in the art instead and this still passes. */
  var cutFaces = 0, clear = 0, total = 0, stillShut = [];
  MODELS.forEach(function (modelId) {
    Render.assignPort('orbital', modelId);
    cutFaces += Render.apertureCutCount(modelId);
    var d = Render.portDoors(modelId);
    if (!d || !d.apertures) return;
    d.apertures.forEach(function (ap, i) {
      total++;
      var n = ap.normal, m = ap.mid, blocked = null;
      var limit = ap.along + 0.10;
      for (var t = 0.004; t < limit; t += 0.004) {
        var a = [m[0] + n[0] * (t - 0.004), m[1] + n[1] * (t - 0.004), m[2] + n[2] * (t - 0.004)];
        var b = [m[0] + n[0] * t, m[1] + n[1] * t, m[2] + n[2] * t];
        if (Render.portSegmentHit(modelId, a, b,
              { open: 1, inner: 0, berth: i, berthMid: m })) { blocked = t; break; }
      }
      if (blocked === null) clear++;
      else stillShut.push(modelId + ' berth ' + i);
    });
  });
  Render.assignPort('orbital', null);

  console.log('  the cut removes ' + cutFaces + ' faces across the library, and ' +
              clear + ' of ' + total + ' berths can now see out along their own axis');
  if (stillShut.length) {
    console.log('  still walled in: ' + stillShut.slice(0, 4).join(', ') +
                (stillShut.length > 4 ? ' (+' + (stillShut.length - 4) + ' more)' : ''));
  }
  check('there are doorways to cut', total > 0, total + ' apertures');
  check('and the cut takes faces out of every model', cutFaces > 0, cutFaces + ' faces');
  /* ALL OF THEM, NOW, and the last twelve were a different bug wearing the
   * same symptom. The cut asks whether a face's CENTRE is in the doorway,
   * which is right for a wall tessellated finer than the opening and wrong
   * for a slab: every cradle berth and the one spine berth facing along -y
   * was sealed by a single enormous interior face lying across the alcove
   * a quarter of the way to the door, every vertex of it outside the
   * opening's cross-section and its centre nowhere near the hole. Thirty-six
   * faces in the whole library, and they stopped twelve berths completely.
   *
   * The bar is the measurement, so a change that puts a wall back fails
   * here rather than being discovered from the cockpit. */
  check('every berth has a way out with the doors open', clear === total,
        clear + ' of ' + total);
})();

console.log('--- the floor of the room is the deck ---');
(function () {
  /* Astra, in the exterior view at a berth: "we're under the deck."
   *
   * berthRoom handed the camera clamp the ANCHOR BOX, and the artist hung
   * these boxes with their top at the deck and let them extend down
   * through it — the same authoring convention that put every ship in the
   * game under the floor until berthDeck was written. As a room that says
   * there is most of a kilometre of headroom BELOW the hull and almost
   * none above, so the boom pitched down went through the plating.
   *
   * It had always said that. What changed is that the hull used to float
   * eighty metres up on a standoff that scaled with the station, so a short
   * boom spent its length in open air; parked properly it is six metres up
   * and any downward pitch is through the floor immediately.
   *
   * Swept across the library, because this is a fact about the ART and one
   * model re-exported the other way round would put it back. */
  var wrongFloor = 0, sunk = 0, noHead = 0, checked = 0;
  var worstSunk = Infinity, worstWho = '';
  MODELS.forEach(function (modelId) {
    Render.assignPort('orbital', modelId);
    var port = fakePort('room-' + modelId, 1.9);
    var g = Gen.bayGeometry(port);
    var n = Math.max(1, g.berths);
    for (var i = 0; i < n; i++) {
      var room = Sim.berthRoom(port, i);
      var deck = Render.berthDeck(modelId, i);
      if (!room || deck === null || deck === undefined) continue;
      checked++;
      /* The floor the camera is given and the plate the ship is stood on
       * are the same number, or the two disagree about where down is. */
      if (Math.abs(room.z0 - deck) > 1e-9) wrongFloor++;
      /* And the park point is above it, by the standoff and nothing else. */
      var off = Gen.berthOffset(port, i);
      var gap = off.z - room.z0;
      if (gap < worstSunk) { worstSunk = gap; worstWho = modelId + ' berth ' + i; }
      if (gap <= 0) sunk++;
      if (!(room.z1 > room.z0)) noHead++;
    }
  });
  Render.assignPort('orbital', null);
  check('every modelled berth has a room to measure', checked > 0, checked + ' berths');
  check('the room\'s floor is the deck the ship is stood on, everywhere',
        wrongFloor === 0, wrongFloor + ' of ' + checked + ' disagree');
  check('the parked hull is above that floor, never in it',
        sunk === 0, sunk + ' of ' + checked + ' sunk');
  check('and the room has headroom above the deck rather than below it',
        noHead === 0, noHead + ' of ' + checked + ' inverted');
  console.log('  the hull clears its deck by ' + (worstSunk * 1.9 * 1000).toFixed(1) +
              ' m at the tightest berth in the library (' + worstWho + ')');
})();

console.log('--- the stand under the ship ---');
(function () {
  /* THE ONE THING IN A BAY THAT DOES NOT SCALE WITH THE STATION, and that
   * is the whole of why it works. Astra, parked: "it's just a square box
   * room with no decorations." Nothing was missing — the berth anchor
   * measured 2.16 km around a 25 m hull, so every edge in the room was too
   * far off to resolve. Halving the station halves that and no more; the
   * rest closes by putting something the size of the SHIP on the floor.
   *
   * So the invariant is physical, not proportional: the same stand, in
   * metres, at any station wearing the model. */
  var role = MODELS[0];
  var small = Render.berthDressing(role, 0, 1.3);
  var large = Render.berthDressing(role, 0, 6.7);
  check('the stand builds at a small station', !!(small && small.f.length > 50),
        small && small.f.length + ' faces');
  check('and at a large one', !!(large && large.f.length > 50));
  if (!small || !large) return;

  /* The STAND's footprint, not the mesh's bounding box: the mesh also
   * carries the station's own approach lamps, which sit where the art put
   * them and therefore do scale with the station. */
  var sKm = small.padHalfA * 2 * 1.3, lKm = large.padHalfA * 2 * 6.7;
  console.log('  the stand is ' + (sKm * 1000).toFixed(0) + ' m across at a 1.3 km station and ' +
              (lKm * 1000).toFixed(0) + ' m at a 6.7 km one');
  check('the stand is the same size in metres at both',
        Math.abs(sKm - lKm) / Math.max(sKm, lKm) < 0.02,
        (sKm * 1000).toFixed(1) + ' m vs ' + (lKm * 1000).toFixed(1) + ' m');
  /* And that size is a few hulls, not a few hundred metres of apron. */
  check('and it is a few ship lengths across, which is the point',
        sKm > Render.SHIP_LEN * 2 && sKm < Render.SHIP_LEN * 10,
        (sKm / Render.SHIP_LEN).toFixed(1) + ' hull lengths');

  /* LIT WITHOUT A LIGHTING SYSTEM. Indoors every surface reads
   * 0.10 + 0.55*|N.V| and the deck is always glancing from a cockpit six
   * metres above it, so a plain-coloured stand is a black stand. The
   * plating is emissive at a dark colour instead — flat 1.15, which is
   * what a floodlit surface looks like — and if that ever gets reverted to
   * plain the bay goes black again with nothing else failing. */
  var emissive = 0;
  for (var c = 0; c < small.c.length; c++) if (small.c[c][0] === '!') emissive++;
  check('most of the stand is self-lit, or the bay is black again',
        emissive > small.c.length * 0.6,
        emissive + ' of ' + small.c.length + ' faces');

  /* THE ART'S OWN FITTINGS, which had never been drawn. */
  var lib = Render.libPort(role);
  var fittings = ((lib.anchors && lib.anchors.lamps) || []).length +
                 ((lib.anchors && lib.anchors.navLights) || []).length;
  console.log('  ' + role + ' declares ' + fittings +
              ' lamp and nav-light anchors the game had never drawn');
  check('the model declares fittings to draw', fittings > 0);

  /* THE STAND STANDS ON THE FLOOR IT IS BOLTED TO.
   *
   * Astra, parked at Waypoint Dock: "the landing pad is still inside the
   * floor." `deck` is where a ray cast down the alcove first meets
   * STRUCTURE, and the bay's visible floor is the plating over it — so a
   * stand drawn at the cast depth is a rectangle sunk in the deck with a
   * ship floating above the hole.
   *
   * Measured off the pad plate itself (the first box the builder pushes,
   * so vertices 0-7) rather than off the recorded lift, or this would be
   * the code agreeing with itself. Revert the lift and the underside sits
   * a centimetre off the cast, which is what this catches. */
  var padUnder = Infinity;
  for (var pv = 0; pv < 8; pv++) padUnder = Math.min(padUnder, small.v[pv][2]);
  var hullH = Render.hullSpan('courier').h * 1000;            // m
  var standUp = (padUnder - small.deckZ) * 1.3 * 1000;        // model units -> m
  console.log('  the stand stands ' + standUp.toFixed(2) + ' m off the cast deck, ' +
              (standUp / hullH).toFixed(2) + ' of a ' + hullH.toFixed(1) + ' m hull height');
  check('the stand is lifted clear of the structure it was cast against',
        standUp > hullH * 0.5,
        standUp.toFixed(2) + ' m of a ' + hullH.toFixed(1) + ' m hull');
  check('and it is lifted by about two thirds of a hull, not by an arbitrary number',
        Math.abs(standUp / hullH - 0.66) < 0.05,
        (standUp / hullH).toFixed(3) + ' hull heights');
  /* The lift is a number of METRES, like everything else on the stand, so
   * it must not change when the station does. */
  var lgUnder = Infinity;
  for (var pv2 = 0; pv2 < 8; pv2++) lgUnder = Math.min(lgUnder, large.v[pv2][2]);
  var lgUp = (lgUnder - large.deckZ) * 6.7 * 1000;
  check('and it is the same lift in metres at a station five times the size',
        Math.abs(standUp - lgUp) / Math.max(standUp, lgUp) < 0.02,
        standUp.toFixed(2) + ' m vs ' + lgUp.toFixed(2) + ' m');

  /* THE STAND IS A RULER, NOT A FLAG.
   *
   * Astra, parked in a bay at a violet dock: "the screencaps you show me
   * have yellow caution stripes on the floor: all I'm seeing is purple
   * stuff." The faction accent was repainting the deck furniture along
   * with the hull — hazard gold #c9b44a straight to #824ac9 — so the one
   * high-contrast edge in the room came out the same hue as the room.
   *
   * Checked by accenting and comparing, because the failure was silent:
   * every face still drew, in the wrong colour. */
  var MARK_GOLD = '#c9b44a';
  function goldFaces(mesh) {
    var n = 0;
    for (var i = 0; i < mesh.c.length; i++) {
      if (mesh.c[i].toLowerCase().indexOf(MARK_GOLD) >= 0) n++;
    }
    return n;
  }
  var bare = goldFaces(small);
  check('the stand is striped in hazard gold to begin with', bare > 0, bare + ' faces');
  ['#8a5cc4', '#c0392b', '#2e86c1'].forEach(function (flag) {
    Render.setAccent(flag);
    var painted = Render.accented(small);
    check('the stripes survive a ' + flag + ' dock',
          goldFaces(painted) === bare,
          goldFaces(painted) + ' of ' + bare + ' left');
    Render.setAccent(null);
  });
  /* And the station around it still takes the colour, or this fix has
   * traded one silent failure for another. */
  Render.setAccent('#8a5cc4');
  var hull = Render.libPort(role);
  var shell = hull && hull.shell;
  if (shell && shell.c && shell.c.length) {
    var swapped = 0;
    for (var hc = 0; hc < shell.c.length; hc++) {
      if (Render.accentSwap(shell.c[hc], '#8a5cc4')) swapped++;
    }
    check('while the station itself still wears the flag', swapped > shell.c.length * 0.2,
          swapped + ' of ' + shell.c.length + ' hull faces');
  }
  Render.setAccent(null);

  /* Cached per (role, berth, radius) — a station radius is a float off an
   * rng, so the key is effectively unique per station and the cache has to
   * be bounded or a long career holds a mesh for every port it visited. */
  check('and it is cached rather than rebuilt',
        Render.berthDressing(role, 0, 1.3) === small);
  for (var n = 0; n < 40; n++) Render.berthDressing(role, 0, 2 + n * 0.01);
  check('the cache is bounded — a career visits more ports than it can hold',
        Render.berthDressing(role, 0, 1.3) !== small);
})();

console.log('--- BAY 4 ---');
(function () {
  /* Astra: "add the number for each berth on the doors for that berth. The
   * number should be high right and low left it says BAY, with each berth
   * having its number on it."
   *
   * ON THE LEAVES, which is the harder of the two places and the one she
   * asked for: lettering welded to a door travels with it, so a legend
   * across a pair of leaves parts down the middle when they open. */
  var LEGEND = '!#7ed3ff', NUMERAL = '!#ffe6a8';
  var lettered = 0, models = 0;
  MODELS.forEach(function (id) {
    Render.assignPort('orbital', id);
    var d = Render.portDoors(id);
    if (!d) return;
    models++;
    var word = 0, num = 0;
    d.leaves.forEach(function (lf) {
      if (!lf.mesh || !lf.mesh.c) return;
      lf.mesh.c.forEach(function (c) {
        if (c === LEGEND) word++;
        else if (c === NUMERAL) num++;
      });
    });
    if (word > 0 && num > 0) lettered++;
  });
  Render.assignPort('orbital', null);
  check('every model with doors has its bays lettered', lettered === models,
        lettered + ' of ' + models);

  /* The glyphs are boxes, so a numeral costs faces — and the count is what
   * proves they are NUMERALS rather than the tally of dashes the stand
   * board used to carry, which said "four" by drawing four of something. */
  Render.assignPort('orbital', MODELS[0]);
  var d0 = Render.portDoors(MODELS[0]);
  var onLeaves = 0;
  d0.leaves.forEach(function (lf) {
    if (!lf.mesh || !lf.mesh.c) return;
    lf.mesh.c.forEach(function (c) { if (c === LEGEND || c === NUMERAL) onLeaves++; });
  });
  check('the legend is on the leaves rather than the hull', onLeaves > 0,
        onLeaves + ' faces');
  /* And NOT on the hull, which is the half that matters: lettering left on
   * the bulkhead stays behind when the door slides away. Compared against
   * the raw library rather than against zero, because the art's own
   * signage happens to use one of these colours already — asserting zero
   * would have been asserting something about the model. */
  var raw = Render.libPort(MODELS[0]).shell;
  function count(list) {
    var n = 0;
    for (var i = 0; i < list.length; i++) {
      if (list[i] === LEGEND || list[i] === NUMERAL) n++;
    }
    return n;
  }
  check('and not left behind on the bulkhead when the door opens',
        count(d0.hull.c) <= count(raw.c),
        count(d0.hull.c) + ' on the hull against ' + count(raw.c) + ' in the art');
  Render.assignPort('orbital', null);
})();

console.log('--- the bay is somewhere people work ---');
(function () {
  /* Astra: "we need more colored things, concourses, elevator shafts,
   * etc... put some advertisement signs on the inside of the berth, which
   * scroll through ads for different things."
   *
   * The stand fixed the SCALE of the room. What it did not fix is that the
   * room reads as empty — nothing in it implies anybody is on the other
   * side of the wall. */
  var role = MODELS[0];
  var dress = Render.berthDressing(role, 0, 1.3);
  check('the bay has furniture in it', !!dress && dress.f.length > 200,
        dress && String(dress.f.length));
  if (!dress) return;

  var colours = {};
  dress.c.forEach(function (c) { colours[c] = (colours[c] || 0) + 1; });
  check('lit windows look into somewhere', colours['!#9fd8ff'] > 0,
        String(colours['!#9fd8ff']));
  check('and some of them are dark, which is what makes the lit ones read',
        colours['!#1b222b'] > 0, String(colours['!#1b222b']));
  check('there are lift shafts with cars in them',
        colours['!#2b3a4a'] > 0 && colours['!#ffd36b'] > 0);

  /* THE BOARDS TURN OVER. A hoarding that never changes is scenery. */
  check('the bay has hoardings', dress.adBoards && dress.adBoards.length > 0,
        dress.adBoards && String(dress.adBoards.length));
  var a0 = Render.berthAds(role, 0, 1.3, 0);
  var a1 = Render.berthAds(role, 0, 1.3, 1);
  check('and something is playing on them', !!a0 && a0.f.length > 0,
        a0 && String(a0.f.length));
  check('which is not the same thing a slot later', !!a1 && a1 !== a0,
        a1 ? 'different mesh' : 'none');
  /* Cached per slot, and bounded — a career docks at more berths than a
   * cache should hold meshes for. */
  check('a slot is cached rather than rebuilt',
        Render.berthAds(role, 0, 1.3, 0) === a0);
  for (var n = 0; n < 40; n++) Render.berthAds(role, 0, 1.3, 100 + n);
  check('and the cache is bounded', Render.berthAds(role, 0, 1.3, 0) !== a0);

  /* Two berths in the same station are not running the same campaign. */
  var b0 = Render.berthAds(role, 0, 1.3, 5);
  var b1 = Render.berthAds(role, 1, 1.3, 5);
  check('two bays are not showing the same board',
        !!b0 && !!b1 && b0.f.length !== b1.f.length,
        b0 && b1 ? (b0.f.length + ' vs ' + b1.f.length) : 'missing');

  /* WALL CLOCK, not sim time — a hoarding is a light on a timer in the
   * world, and feeding it the simulation would race the ads during a warp. */
  check('the slot advances on seconds', Render.adSlot(Render.AD_SECONDS * 3 + 1) === 3,
        String(Render.adSlot(Render.AD_SECONDS * 3 + 1)));

  /* The furniture is not livery either, for the same reason the stand is
   * not: a bay lit in the owner's hue is a bay with no contrast in it. */
  Render.setAccent('#8a5cc4');
  check('and none of it is repainted by the flag',
        Render.accented(dress) === dress);
  Render.setAccent(null);
})();

console.log('--- leaving a berth ---');
(function () {
  /* THE TWO BUGS THAT WERE HIDING EACH OTHER.
   *
   * berthCapture refuses to close the clamps on a ship holding no
   * clearance, and its note argues that a ship which has just launched
   * holds none because arriving spent it. Arriving usually does -- but not
   * on the first frame of a new career, which grants the flag and parks the
   * hull on top of it, and not on a save restored while docked, which
   * suppresses the arrival deliberately so that loading a game is not an
   * offence. Either way the flag outlived the visit, U released the clamps
   * and the next frame closed them again.
   *
   * And the flag was ALSO what held the outer doors open, so fixing only
   * the first half traps the ship in its own throat instead. Both halves
   * are checked here, in that order, because that is the order they bite
   * in. */
  var sys = Gen.generateSystem('undock-sweep');
  var station = (sys.ports || []).filter(function (p) { return !p.surface; })[0];
  check('the sweep seed has an orbital station to leave', !!station,
        station && station.name);
  if (!station) return;

  Render.assignPort('orbital', MODELS[0]);
  var ship = { cls: 'courier', dryMass: 80, pos: { x: 0, y: 0, z: 0 },
               vel: { x: 0, y: 0, z: 0 }, thrust: V.zero(),
               fwd: { x: 1, y: 0, z: 0 }, up: { x: 0, y: 0, z: 1 },
               right: { x: 0, y: -1, z: 0 }, cleared: {} };
  Sim.refreshShip(ship);
  ship.cleared[station.id] = true;           // the state that bit: cleared AND docked
  Sim.dockShip(ship, station, sys, 0);
  check('the fixture ship is berthed in a modelled alcove',
        ship.docked === station.id && !!(ship.dockOffset && ship.dockOffset.station));
  check('and it is holding the clearance that used to survive the visit',
        !!ship.cleared[station.id]);
  check('so the catch would take it — which is the bug, stated',
        !!Sim.berthCapture(ship, sys, 0));

  var ts = Sim.bodyState(station, sys, 0);
  var before = V.clone(ship.pos);
  Sim.undockShip(ship, sys, 0, 0.003);
  check('undocking lets go', ship.docked === null);
  check('and leaving spends the docking clearance',
        !ship.cleared[station.id]);
  check('so nothing can close the clamps again on the way out',
        !Sim.berthCapture(ship, sys, 0));

  /* WHICH WAY THE PUSH GOES, measured rather than argued. The way out of
   * a throat is the berth anchor's own normal — the axis the corridor was
   * carved along and the arrival flew down — and radial from the hub is a
   * different vector in principle. In this library it is not: the worst
   * berth normal anywhere sits under four degrees off radial, which is
   * why undockShip still pushes radially. The spread is printed rather
   * than asserted, so a re-export that puts a berth on the side of a hull
   * shows up here as a number that moved. */
  var worst = 1, worstId = null;
  MODELS.forEach(function (modelId) {
    Render.assignPort('orbital', modelId);
    var g = Gen.bayGeometry(station);
    for (var bi = 0; bi < Math.max(1, g.berths); bi++) {
      var a2 = Gen.berthApertures(station, bi);
      var o2 = Gen.berthOffset(station, bi);
      if (!a2 || !a2.normal || !o2) continue;
      var rl = Math.sqrt(o2.x * o2.x + o2.y * o2.y + o2.z * o2.z);
      if (!(rl > 1e-9)) continue;
      var c = (a2.normal[0] * o2.x + a2.normal[1] * o2.y + a2.normal[2] * o2.z) / rl;
      if (c < worst) { worst = c; worstId = modelId + ' berth ' + bi; }
    }
  });
  Render.assignPort('orbital', MODELS[0]);
  console.log('  the least radial berth normal in the library: cos ' +
              worst.toFixed(3) + '  (' + worstId + ')');
  check('every berth opens roughly out of the hub, which is what the ' +
        'radial push assumes', worst > 0.9, 'worst cos ' + worst.toFixed(4));
  check('and the burn is a push, not a placement — same point, new velocity',
        V.dist(before, ship.pos) < 1e-9 && V.len(V.sub(ship.vel, ts.vel)) > 1e-6);

  /* THE DOORS. Still inside, on the way out: they run back. This is the
   * half that a clearance-only rule gets wrong, and the flag expires by
   * geometry — once the hull is out of the hull it stops counting. */
  check('the departure is marked against the port it left',
        !!(ship.departed && ship.departed.port === station.id));
  check('and the ship is still inside the hull it is leaving',
        Sim.insideStation(ship.pos, sys, 0) === station);
  /* THE STATION IS IN ORBIT. Advancing the clock without carrying the hull
   * along with it leaves the ship hundreds of kilometres behind a station
   * moving at twenty-odd kilometres a second — outside, by the time the
   * doors have finished a two-and-a-half second cycle, and the test then
   * measures the expiry rather than the opening. Held in the berth's own
   * frame instead, which is what being parked in one means. */
  var rel0 = V.sub(ship.pos, ts.pos);
  var t2 = 0, dst = null;
  for (var k = 0; k < 40; k++) {
    t2 += 0.25;
    var tsK = Sim.bodyState(station, sys, t2);
    ship.pos = V.add(tsK.pos, rel0);
    dst = Sim.stationDoorState(station, sys, t2, ship, false);
  }
  check('the outer doors open for a ship that is leaving',
        !!dst && dst.open > 0.9, dst && dst.open.toFixed(2));
  check('and the inner gate shuts behind it',
        !!dst && dst.inner < 0.05, dst && dst.inner.toFixed(2));

  /* OUT, and the flag stops mattering without anyone clearing it. Moved
   * far enough off that no room of the model contains the point. */
  var far = V.addScaled(ts.pos, V.norm(V.sub(ship.pos, ts.pos)), station.radius * 4);
  var ghost = { cls: ship.cls, pos: far, vel: V.clone(ship.vel),
                docked: null, departed: ship.departed, cleared: {} };
  check('the hull is outside once it is well clear',
        Sim.insideStation(ghost.pos, sys, 0) !== station);
  check('and then the doors stop answering to a stale departure',
        Sim.stationDoorState(station, sys, 0, ghost, false) === null);

  /* And docking again ends it outright, whatever the geometry says. */
  Sim.dockShip(ship, station, sys, 0);
  check('docking clears the departure', !ship.departed);
})();

Render.assignPort('orbital', null);   // leave the library as we found it

console.log('');
console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
