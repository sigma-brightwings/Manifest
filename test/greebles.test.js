/* greebles.test.js — the lit fittings in the cockpit (2026-10-15).
 *
 *     node test/greebles.test.js
 *
 * What it holds: each hull has its own panel, two ships of one hull are not
 * wired identically, the same ship always is, the bars that can read the
 * ship do, and master caution means something. The look and the frame cost
 * were checked in the running game; see claude/cockpit-greebles.md.
 */
global.window = global.window || global;
require('../src/vec3.js');
require('../src/rng.js');
require('../src/kepler.js');
require('../src/economy.js');
require('../src/generate.js');
require('../src/sim.js');
var Combat = require('../src/combat.js');
require('../src/hulls.js');
require('../src/render.js');
var R = global.Render;

var pass = 0, fail = 0;
function check(n, c, d) {
  if (c) { pass++; console.log('  ok   ' + n + (d ? '   ' + d : '')); }
  else { fail++; console.log('  FAIL  ' + n + (d ? '   ' + d : '')); }
}

function ship(hullId, bornId) {
  var h = Combat.HULLS[hullId];
  return { hullId: hullId, bornId: bornId || hullId + '-1', dryMass: h.dryMass,
           fuel: 30, fuelCap: 37, thrusterFuel: 16, thrusterCap: 16,
           hull: h.hullMax, hullMax: h.hullMax, shield: 0, shieldCap: 0, throttle: 0 };
}
function layout(s) { return R.greebleLayout(s, R.cockpitSpec(s)); }
function sig(L) { return JSON.stringify(L.items.map(function (i) { return [i.pts, i.fill || i.on, i.mode]; })); }

console.log('--- layouts ---');
var hulls = ['dart', 'talon', 'kestrel', 'mule'], L = {};
hulls.forEach(function (h) { L[h] = layout(ship(h)); });
check('every hull has a panel', hulls.every(function (h) { return L[h].items.length > 300; }),
      hulls.map(function (h) { return h + ' ' + L[h].items.length; }).join(', '));
check('and no two hulls share one', new Set(hulls.map(function (h) { return sig(L[h]); })).size === 4);
check('the Mule is busier than the Dart',
      L.mule.items.filter(function (i) { return i.led; }).length >
      L.dart.items.filter(function (i) { return i.led; }).length);
check('only the Dart guards its switches',
      L.dart.items.some(function (i) { return i.fill === '#7a2a24'; }) &&
      !L.mule.items.some(function (i) { return i.fill === '#7a2a24'; }));
check('the same ship is wired the same way every time', sig(layout(ship('mule'))) === sig(L.mule));
check('two Mules are not wired identically', sig(layout(ship('mule', 'mule-2'))) !== sig(L.mule));

console.log('--- bound to the ship ---');
var bound = {};
hulls.forEach(function (h) {
  L[h].items.forEach(function (i) { if (i.bind) bound[h + ':' + i.bind] = true; });
});
var counts = hulls.map(function (h) {
  return ['throttle', 'fuel', 'mass', 'hull', 'shield'].filter(function (b) { return bound[h + ':' + b]; }).length;
});
check('every hull carries live bars, throttle among them',
      counts.every(function (c) { return c >= 2; }) && hulls.every(function (h) { return bound[h + ':throttle']; }),
      counts.join(', ') + ' of 5');

var s = ship('talon');
var r0 = R.greebleReadings(s);
check('a healthy, fuelled ship raises no caution', r0.caution === false);
s.hull = s.hullMax * 0.5;
check('a damaged hull does', R.greebleReadings(s).caution === true);
s.hull = s.hullMax; s.fuel = 2;
check('so does low jump fuel', R.greebleReadings(s).caution === true);
s.fuel = 30; s.throttle = 0.5;
var r1 = R.greebleReadings(s);
check('throttle reads straight through', Math.abs(r1.throttle - 0.5) < 1e-9 && Math.abs(r1.fuel - 30 / 37) < 1e-9);

console.log('--- in the room ---');
/* Every quad on its slab: within the cockpit's own walls, so nothing floats
 * out through the hull. Each ship's OWN walls since 2026-10-24, when the
 * room started scaling with the glass and the bulkhead moved aft to make
 * room for a door (Render.cockpitGeometry); this used to be one fixed box,
 * the Talon's, with the bulkhead at -0.6 m. */
var stray = 0;
hulls.forEach(function (h) {
  var g = R.cockpitGeometry(R.cockpitSpec(ship(h))), e = 0.02;
  L[h].items.forEach(function (i) {
    i.pts.forEach(function (p) {
      if (Math.abs(p[0]) > g.sideX + e || p[1] > g.ceilY + e || p[1] < g.floorY - e ||
          p[2] > g.frontZ + e || p[2] < g.bulkZ - e) stray++;
    });
  });
});
check('nothing is mounted outside the cockpit', stray === 0, stray + ' corners out');
/* And nothing on the door. */
var onDoor = 0;
hulls.forEach(function (h) {
  var g = R.cockpitGeometry(R.cockpitSpec(ship(h)));
  L[h].items.forEach(function (i) {
    var allOn = i.pts.every(function (p) {
      return Math.abs(p[2] - g.bulkZ) < 0.02 && Math.abs(p[0]) < g.doorHW && p[1] < g.floorY + g.doorH;
    });
    if (allOn) onDoor++;
  });
});
check('nothing is mounted on the door', onDoor === 0, onDoor + ' fittings on it');
var sizes = [];
L.mule.blocks.forEach(function (b) { sizes.push(b.rad); });
check('no fitting is bigger than a panel', Math.max.apply(null, sizes) < 0.22,
      'largest half-diagonal ' + (Math.max.apply(null, sizes) * 100).toFixed(1) + ' cm');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
