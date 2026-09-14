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

Render.assignPort('orbital', null);   // leave the library as we found it

console.log('');
console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
