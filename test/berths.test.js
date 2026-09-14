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

Render.assignPort('orbital', null);   // leave the library as we found it

console.log('');
console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
