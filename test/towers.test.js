/* towers.test.js — the Capital and the Carrier at their true size, flown
 * from the conning tower (2026-10-25).
 *
 *     node test/towers.test.js
 *
 * Astra: "Let's fit the cockpits to the Carrier and Capital class ships to
 * align with where the conning tower is on the model, and the rest of the
 * ship should be visible since the tower has a 360 degree window views."
 * Asked, she chose TRUE SIZE IN THE WORLD: the Capital 250 m, the Carrier
 * 300 m. See claude/conning-tower-bridge.md.
 *
 * What it holds:
 *   - those two are drawn, fought and berthed at that length, every other
 *     hull at 25 m as before;
 *   - a bay too small for her refuses her, a big one takes her;
 *   - the cockpit is up in the tower: its eye in the model's window band,
 *     its rooms inside the part of the model cut away for them, and nothing
 *     else of the hull standing in them;
 *   - the frame the rooms are drawn in reads the ship's live attitude and
 *     shares her rooms (the same doors, the same lift);
 *   - the bridge deck and lobby are glazed all round, the decks below not;
 *   - each crew station on the bridge deck has a screen that is an MFD;
 *   - the drop to the main deck is the tower's, and the lift is quick.
 */
global.window = global.window || global;
['vec3', 'rng', 'kepler', 'economy', 'generate', 'sim'].forEach(function (m) { require('../src/' + m + '.js'); });
var Sim = global.Sim;
var Combat = require('../src/combat.js');
require('../src/crew.js');
require('../src/hulls.js');
require('../src/walk.js');
var SD = require('../src/shipdeck.js');
require('../src/render.js');
var R = global.Render;

var pass = 0, fail = 0;
function check(n, c, d) {
  if (c) { pass++; console.log('  ok   ' + n + (d ? '   ' + d : '')); }
  else { fail++; console.log('  FAIL  ' + n + (d ? '   ' + d : '')); }
}
function ship(id) {
  var h = Combat.HULLS[id];
  return { hullId: id, bornId: id + '-1', dryMass: h.dryMass,
           pos: { x: 1000, y: -20, z: 5 }, fwd: { x: 0, y: 0, z: 1 }, up: { x: 0, y: 1, z: 0 }, right: { x: 1, y: 0, z: 0 } };
}
var TOWERS = ['capital', 'carrier'];
var STATION_IN = 0.32;   // ShipDeck's STATION_CON: the console's depth off the wall
var LIB = { capital: 'capital-l', carrier: 'carrier-l' };
/* The model's own glass, measured off it: the Capital's gallery window
 * band and the Carrier's cab glass, as y in the unit-length frame. */
var BAND = { capital: [0.145, 0.158], carrier: [0.063, 0.081] };

console.log('--- true length ---');
check('the Capital is 250 m', Math.abs(R.hullLength('capital') - 0.250) < 1e-9);
check('the Carrier is 300 m', Math.abs(R.hullLength(ship('carrier')) - 0.300) < 1e-9);
var others = Object.keys(Combat.HULLS).filter(function (id) { return TOWERS.indexOf(id) < 0; });
/* 2026-10-26: not 25 m any more, but each at the length her rooms need
 * (tools/fit-hulls.js, src/hullfit.js) — and never shorter than she was. */
check('every other hull is at her fitted length, never under 25 m', others.every(function (id) {
  return Math.abs(R.hullLength(id) * 1000 - global.HullFit[id].len) < 1e-6 && R.hullLength(id) >= R.SHIP_LEN - 1e-12;
}), others.length + ' hulls');
var capBox = Sim.hullBox(ship('capital')).map(function (v) { return v * 1000; });
check('the Capital is measured for a bay at her own size', capBox[2] > 249 && capBox[2] < 251 && capBox[0] > 60,
      capBox.map(function (v) { return v.toFixed(0); }).join(' × ') + ' m');

console.log('--- berths ---');
var Gen = global.Gen, realMB = Gen.modelledBerths;
function withBerths(boxesM, fn) {
  Gen.modelledBerths = function () {
    return boxesM.map(function (b, i) { return { mid: [i, 0, 0], min: [0, 0, 0], max: [b[0] / 1000, b[1] / 1000, b[2] / 1000] }; });
  };
  try { return fn(); } finally { Gen.modelledBerths = realMB; }
}
var port = { id: 'p', radius: 1, market: { role: 'highport' } };
check('a bay big enough takes her', withBerths([[140, 120, 280]], function () { return Sim.berthFitsHull(ship('capital'), port); }));
check('a bay too small does not', !withBerths([[280, 176, 94], [60, 60, 120]], function () { return Sim.berthFitsHull(ship('capital'), port); }));
check('a port with no modelled bays takes her, as before', withBerths([], function () { return Sim.berthFitsHull(ship('carrier'), port); }));
check('a 25 m hull fits the small bay', withBerths([[60, 60, 120]], function () { return Sim.berthFitsHull(ship('talon'), port); }));
var refused = withBerths([[60, 60, 120]], function () { return Combat.dockRefusal({ ship: ship('carrier') }, port); });
check('and docking there is refused as too big', !!refused && refused.why === 'toobig', refused && refused.text);
var taken = withBerths([[140, 120, 320]], function () { return Combat.dockRefusal({ ship: ship('carrier') }, port); });
check('a highport with a bay her size lets her in', !taken || taken.why !== 'toobig');

console.log('--- the bridge in the tower ---');
TOWERS.forEach(function (id) {
  var s = ship(id), b = R.bridgeSpec(s), Lm = R.hullLength(id) * 1000;
  check(id + ': has a bridge in the tower', !!b);
  var eyeY = b.at[1] / Lm;
  check(id + ': the seated eye is in the model\'s window band', eyeY > BAND[id][0] && eyeY < BAND[id][1],
        eyeY.toFixed(4) + ' in ' + BAND[id].join('–'));
  var d = R.shipInterior(s), p = d.plan, g = d.geom, c = b.cut;
  var lo = [-g.sideX, p.floorY, Infinity], hi = [g.sideX, g.ceilY, g.frontZ + 0.3];
  p.decks.bridge.rooms.forEach(function (r) { lo[2] = Math.min(lo[2], r.z0); lo[0] = Math.min(lo[0], r.x0); hi[0] = Math.max(hi[0], r.x1); });
  var nlo = lo.map(function (v, i) { return (v + b.at[i]) / Lm; }), nhi = hi.map(function (v, i) { return (v + b.at[i]) / Lm; });
  check(id + ': the bridge deck lies inside the part of the model cut for it',
        nlo[0] > c[0] && nlo[1] > c[1] && nlo[2] > c[2] && nhi[0] < c[3] && nhi[1] < c[4] && nhi[2] < c[5]);
  var lib = HullLib[LIB[id]], intrude = 0;
  lib.f.forEach(function (f) {
    var x = 0, y = 0, z = 0;
    f.forEach(function (i) { x += lib.v[i][0]; y += lib.v[i][1]; z += lib.v[i][2]; });
    x /= f.length; y /= f.length; z /= f.length;
    if (x > c[0] && x < c[3] && y > c[1] && y < c[4] && z > c[2] && z < c[5]) return;
    if (f.some(function (i) { var v = lib.v[i]; return v[0] > nlo[0] && v[0] < nhi[0] && v[1] > nlo[1] && v[1] < nhi[1] && v[2] > nlo[2] && v[2] < nhi[2]; })) intrude++;
  });
  check(id + ': nothing of her hull stands in the bridge rooms', intrude === 0, intrude + ' triangles');
  var drawn = R.hullPreviewMesh(id, s), cut = R.bridgeCutMesh(drawn, s);
  check(id + ': from the bridge the gallery is left out, and only that', cut.f.length < drawn.f.length && cut.f.length > drawn.f.length * 0.95,
        (drawn.f.length - cut.f.length) + ' of ' + drawn.f.length + ' triangles');
  check(id + ': the cut hull is built once, its colours still lined up', R.bridgeCutMesh(drawn, s) === cut && cut.c.length === cut.f.length && cut !== drawn);

  /* The frame. */
  var fr = R.bridgeFrame(s);
  var want = R.localToWorld(s, b.at[0] * 0.001, b.at[1] * 0.001, b.at[2] * 0.001);
  check(id + ': the rooms are drawn up in the tower',
        Math.abs(fr.pos.x - want.x) + Math.abs(fr.pos.y - want.y) + Math.abs(fr.pos.z - want.z) < 1e-12 && fr !== s);
  s.fwd = { x: 1, y: 0, z: 0 }; s.right = { x: 0, y: 0, z: -1 };
  var fr2 = R.bridgeFrame(s);
  check(id + ': and it turns with her', fr2 === fr && fr2.fwd.x === 1 && Math.abs(fr2.pos.x - (s.pos.x + b.at[2] * 0.001)) < 1e-12);
  check(id + ': the same rooms, doors and lift whichever frame asks', R.shipInterior(fr) === d);
  check(id + ': nothing of the frame rides along into a save', JSON.stringify(Object.keys(s)).indexOf('_base') < 0);

  /* The glass. */
  var xs = {};
  d.meshes.portals.v.forEach(function (v) { xs[Math.round(Math.abs(v[0]) * 1000)] = true; });
  var sideX = Math.round((g.sideX - 0.012) * 1000);
  check(id + ': the bridge deck\'s side walls are glazed', !!xs[sideX]);
  var aftPanes = d.meshes.portals.v.filter(function (v) {
    var dB = SD.doorById(p, 'bridge');
    return Math.abs(v[2] - (dB.wall[1] + 0.012)) < 1e-6;
  });
  check(id + ': and the aft bulkhead either side of the door', aftPanes.length >= 12, aftPanes.length / 6 + ' panes');
  var lowGlass = d.meshes.portals.v.some(function (v) { return v[1] < p.floorY - 1; });
  check(id + ': no glass on the decks below', !lowGlass);

  /* The stations' screens (MFDs, configurable on F5 → PANELS). */
  var sts = p.stations.filter(function (st) { return !st.cockpit; });
  var okScr = sts.length > 0 && sts.every(function (st) {
    var c = SD.stationScreen(st, g.sideX, g.floorY);
    var tl = c[0], tr = c[1], br = c[2], bl = c[3];
    var upright = tl[1] > bl[1] + 0.2 && tr[1] > br[1] + 0.2;
    var rightward = Math.sign(tr[2] - tl[2]) === -st.side;      // facing the wall, forward is behind your shoulder
    var wide = Math.abs(tr[2] - tl[2]) > 0.6;
    /* In front of the console's face (and of the lit blocks on it, 6 mm
     * proud) at every corner, so it is what you see. */
    var proud = c.every(function (q) {
      var v = (q[1] - (g.floorY + 0.76)) / 0.74;
      var faceX = st.side * (g.sideX - STATION_IN) + st.side * (STATION_IN - 0.06) * v;
      return st.side * (faceX - q[0]) > 0.008;
    });
    return upright && rightward && wide && proud;
  });
  check(id + ': every bridge station has a screen, upright, facing its seat', okScr, sts.length + ' stations');

  /* The decks below. */
  var dropM = p.decks.bridge.floorY - p.decks.main.floorY;
  check(id + ': the main deck is the tower\'s drop below', Math.abs(dropM - SD.TOWER[id]) < 1e-9, dropM + ' m');
  var mainShipY = (b.at[1] + p.decks.main.floorY) / Lm;
  check(id + ': and still inside her', mainShipY > -0.5 && mainShipY < 0.1, (mainShipY * Lm).toFixed(1) + ' m');
  var secs = dropM / SD.liftSpeed(id);
  check(id + ': the ride up is quick', secs < 6.5, secs.toFixed(1) + ' s');
});
var talon = ship('talon');
/* 2026-10-26: not her origin any more but where tools/fit-hulls.js put
 * the cockpit so her rooms are inside her — and still no tower. */
var tAt = R.cockpitAt(talon), tFit = global.HullFit && global.HullFit.talon;
check('an ordinary hull\'s cockpit is where her fit put it, with no tower', !R.bridgeSpec(talon) && !!tAt && !!tFit &&
      tAt[0] === tFit.at[0] && tAt[1] === tFit.at[1] && tAt[2] === tFit.at[2]);
check('and its hull is never cut', R.bridgeCutMesh(HullLib['capital-l'], talon) === HullLib['capital-l']);
check('and its lift (if any) is the ordinary one', SD.liftSpeed('meridian') === SD.LIFT_SPEED);
var mer = R.shipInterior(ship('meridian'));
check('no other decked hull is glazed', mer && !mer.plan.tower);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
