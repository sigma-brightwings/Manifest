/* nosecockpit.test.js — every cockpit at her canopy glass (2026-11-02).
 *
 *     node test/nosecockpit.test.js
 *
 * Astra, of the Talon: "the cockpit on the starting ship is recessed into
 * the block that juts out with the cockpit glass on it ... it should be
 * cut into the nose block." Asked, she chose it raised up into that block
 * behind the glass, a step up from the passage; then: "the cockpit fix
 * should apply to all ships IF the glass isn't the forward-most part of
 * the cockpit." See shipdeck.js RAISED and tools/fit-raised.js.
 *
 * What it holds, for every hull in RAISED:
 *   - her eye is within half a metre of her model's canopy box, and her
 *     windscreen no further forward than the glass's front;
 *   - her eye is fit-hulls' plus her raise, and her plan carries the raise
 *     (the two never disagree: a plan that refused it with an eye that
 *     moved would put every room in the wrong place);
 *   - the cockpit, raised floor, stair and ceiling, is inside her but for
 *     its windscreen row (the glass, standing proud as it always did);
 *   - every other room is exactly where it was in her hull, and none was
 *     given up for it;
 *   - the floor is the deck's in the passage, the cockpit's at the seat,
 *     and climbs (or falls) the stair without a jump;
 *   - the bridge door's leaves are down at the deck;
 *   - her room meshes are finite.
 * For every other hull, her eye is exactly where fit-hulls put it. And the
 * Talon's cockpit is up in her nose block: on its underside, under its top.
 */
global.window = global.window || global;
['vec3', 'rng', 'kepler', 'economy', 'generate', 'sim'].forEach(function (m) { require('../src/' + m + '.js'); });
var Combat = require('../src/combat.js');
require('../src/crew.js');
require('../src/hullfit.js');
require('../src/hulls.js');
require('../src/walk.js');
var SD = require('../src/shipdeck.js');
require('../src/render.js');
var R = global.Render;

var pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail ? '  (' + detail + ')' : '')); }
}
function shipOf(id, tag) { var h = Combat.HULLS[id]; return { hullId: id, bornId: 'nc|' + id + '|' + tag, dryMass: h.dryMass, cargo: {} }; }
function libOf(id) { var h = Combat.HULLS[id]; return h.mesh === 'crawler' ? 'crawler_civilian' : (R.HULL_ASSIGN[h.mesh] || ''); }
function boxDist(p, lo, hi) {
  var d = 0;
  for (var i = 0; i < 3; i++) { var e = Math.max(lo[i] - p[i], 0, p[i] - hi[i]); d += e * e; }
  return Math.sqrt(d);
}
/* Each room in her hull's metres. */
function hullRooms(d, at) {
  var out = {};
  d.plan.rooms.forEach(function (r) {
    /* The bridge deck goes up with the helm (its stations are worked from
     * the helm's floor); boarding3 holds it inside her like every room. */
    if (r.kind === 'cockpit' || r.kind === 'bridgedeck') return;
    out[r.id] = [r.x0 + at[0], r.x1 + at[0], r.z0 + at[2], r.z1 + at[2], d.plan.floorY + at[1]].map(function (v) { return +v.toFixed(3); });
  });
  return out;
}

console.log('every raised cockpit at her glass');
Object.keys(SD.RAISED).forEach(function (id) {
  var rz = SD.RAISED[id], shp = shipOf(id, 'r');
  var d = R.shipInterior(shp), at = R.cockpitAt(shp), fit = R.hullFitter(shp), f = global.HullFit[id];
  var L = R.hullLength(shp) * 1000, m = global.HullLib[libOf(id)];
  var lo = m.glass.min.map(function (v) { return v * L; }), hi = m.glass.max.map(function (v) { return v * L; });
  var eg = boxDist(at, lo, hi);
  check(id + ': her eye is within 0.5 m of her glass', eg <= 0.5, eg.toFixed(2) + ' m');
  check(id + ': and her windscreen is no further forward than it', at[2] + d.geom.frontZ <= hi[2] + 0.05,
        (at[2] + d.geom.frontZ - hi[2]).toFixed(2) + ' m');
  check(id + ': her eye is her fit\'s plus her raise, and her plan has the raise', !!d.plan.raised &&
        Math.abs(at[1] - f.at[1] - rz.rise) < 1e-9 && Math.abs(at[2] - f.at[2] - rz.fwd) < 1e-9 && d.plan.raised.rise === rz.rise);

  /* The cockpit inside her, all but its windscreen row. */
  var p = d.plan, ck = SD.roomByKind(p, 'cockpit'), out = 0, n = 0;
  var nx = Math.max(2, Math.ceil((ck.x1 - ck.x0) / 0.4)), nz = Math.max(2, Math.ceil((ck.z1 - ck.z0) / 0.4));
  for (var i = 0; i <= nx; i++) for (var j = 0; j < nz; j++) {
    var x = ck.x0 + 0.05 + (ck.x1 - ck.x0 - 0.1) * i / nx, z = ck.z0 + 0.05 + (ck.z1 - ck.z0 - 0.1) * j / nz;
    [p.floorY + SD.floorAt(p, x, z) + 0.05, p.floorY + ck.y1 - 0.05].forEach(function (y) { n++; if (!fit.inside(x, y, z)) out++; });
  }
  check(id + ': her cockpit is inside her, bar the windscreen', out === 0, out + '/' + n + ' out');

  /* The rest of her where it was. */
  delete SD.RAISED[id];
  var shp0 = shipOf(id, '0'), d0 = R.shipInterior(shp0), at0 = R.cockpitAt(shp0);
  SD.RAISED[id] = rz;
  var a = hullRooms(d0, at0), b = hullRooms(d, at), moved = [];
  Object.keys(a).forEach(function (k) {
    if (!b[k]) { moved.push(k + ' gone'); return; }
    /* The passage runs on forward under her cockpit to the stair's foot
     * (or gives up its forward end, where the cockpit moved aft): its
     * aft end and its floor stay. */
    var same = k === 'passage' ? [0, 1, 2, 4] : [0, 1, 2, 3, 4];
    if (same.some(function (q) { return Math.abs(a[k][q] - b[k][q]) > 1e-6; })) moved.push(k + ' ' + JSON.stringify(a[k]) + ' -> ' + JSON.stringify(b[k]));
  });
  check(id + ': every other room is where it was in her', !moved.length, moved.slice(0, 3).join('; '));
  check(id + ': and none was given up for it', JSON.stringify(d.plan.fitted.omitted) === JSON.stringify(d0.plan.fitted.omitted),
        d.plan.fitted.omitted.join(' '));

  /* The floor: the deck's in the passage, the cockpit's at the seat, and
   * the stair between without a jump. */
  var rs = p.raised, ps = SD.roomByKind(p, 'passage'), seat = p.items.filter(function (it) { return it.kind === 'seat'; })[0];
  var jump = 0, last = SD.floorAt(p, 0, rs.doorZ - 0.3);
  for (var zz = rs.doorZ - 0.3; zz <= rs.stepZ + 0.3; zz += 0.02) {
    var fl = SD.floorAt(p, 0, zz);
    jump = Math.max(jump, Math.abs(fl - last)); last = fl;
  }
  check(id + ': the deck\'s floor in the passage, the cockpit\'s at the seat', SD.floorAt(p, 0, (ps.z0 + ps.z1) / 2) === 0 &&
        Math.abs(SD.floorAt(p, seat.x, seat.z) - rs.rise) < 1e-9);
  check(id + ': and the stair has no step in it a walker jumps', jump < 0.1, jump.toFixed(3) + ' m');
  var dB = SD.doorById(p, 'bridge');
  check(id + ': the bridge door is down at the deck', dB && Math.abs(dB.yOff + rs.rise) < 1e-9 && dB.wall[1] === rs.doorZ);
  var bad = 0;
  ['room', 'portals', 'seat'].forEach(function (k) { d.meshes[k].v.forEach(function (v) { if (!v.every(isFinite)) bad++; }); });
  check(id + ': her room meshes are finite', bad === 0, bad + ' bad vertices');
});

console.log('every other hull as she was');
var same = [];
Object.keys(Combat.HULLS).forEach(function (id) {
  if (SD.RAISED[id] || R.bridgeSpec(id)) return;
  var at = R.cockpitAt(shipOf(id, 's')), f = global.HullFit[id];
  if (!(at && f && at[0] === f.at[0] && at[1] === f.at[1] && at[2] === f.at[2])) same.push(id);
  var d = R.shipInterior(shipOf(id, 's2'));
  if (d.plan.raised) same.push(id + ' raised');
});
check('no unlisted hull\'s eye or plan moved', !same.length, same.join(' '));

console.log('the Talon, up in her nose block');
var t = shipOf('talon', 't'), td = R.shipInterior(t), tat = R.cockpitAt(t), tck = SD.roomByKind(td.plan, 'cockpit');
var floorH = tat[1] + td.plan.floorY + tck.y0, ceilH = tat[1] + td.plan.floorY + tck.y1;
/* Her nose block runs y -1.2 to +0.95 between z 6.8 and 11.5 in her 25 m
 * hull (measured off courier-m); the seat is in it, not in the wedge. */
check('her cockpit floor is on the block\'s underside, not down in the wedge', floorH > -1.2 && floorH < -1.1, floorH.toFixed(2) + ' m');
check('and its ceiling under the block\'s top', ceilH < 0.95, ceilH.toFixed(2) + ' m');
check('and her eye 1.2 m further forward than it was, 0.5 m up', Math.abs(tat[2] - 10.6) < 1e-6 && Math.abs(tat[1] + 0.05) < 1e-6);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
