/* seaplatform.test.js - ports on the open sea (2026-11-02).
 *
 *     node test/seaplatform.test.js
 *
 * Astra: "for ocean worlds, we want like a floating oil rig style of port,
 * and it would be pads that have protected domes open and close to protect
 * ships and their cargo from the waves, and a central bar, connected by
 * covered tubes."
 *
 * What this holds:
 *   - WHICH PORTS: every pad placeInland could not put on dry ground, on
 *     water, is a sea platform; none is left flagged coastal; nothing else
 *     anywhere in the galaxy changes, bit for bit; same seed, same answer;
 *   - IDENTITY: id, name, radius, faction and market are what they were;
 *   - THE BAY: pads on a ring round the hub, clear of each other and of the
 *     hub, a stand on the deck above the sea, a dome room round each;
 *   - SAVES: a career docked at one of these ports loads onto its pad;
 *   - and (further sections) the dome sequence, the walk and the waves.
 */
global.window = global.window || global;
require('../src/vec3.js');
require('../src/rng.js');
require('../src/kepler.js');
require('../src/economy.js');
var Gen = require('../src/generate.js');
var Galaxy = require('../src/galaxy.js');
require('../src/rings.js');
var Sim = require('../src/sim.js');
var W = require('../src/weather.js');
var V = global.V;

var pass = 0, fail = 0;
function check(n, c, d) {
  if (c) { pass++; console.log('  ok   ' + n + (d ? '   ' + d : '')); }
  else { fail++; console.log('  FAIL  ' + n + (d ? '   ' + d : '')); }
}

var gal = Galaxy.build('kawartha');

/* The galaxy's systems, with and without the pass, compared port by port.
 * Everything a port is built from, plus the whole timetable and the
 * patrols: if the pass took a draw or moved a port, this changes. */
function strip(sy, sea) {
  return JSON.stringify(sy.ports.map(function (p) {
    var m = p.market || {}, isSea = !!sea[p.id];
    return [p.id, p.name, p.radius, p.lat, p.lon, p.faction, p.livery,
            isSea ? null : (p.siteKind || null), isSea ? null : p.underground,
            isSea ? null : p.elevation, isSea ? null : p.typeName, m.role, m.pop, m.dev,
            Object.keys(m.rows || {}).sort().map(function (k) {
              return k + ':' + (m.rows[k].prod || 0) + ':' + (m.rows[k].cons || 0) + ':' + (m.rows[k].base || 0);
            }).join(','),
            p.orbit ? [p.orbit.a, p.orbit.e, p.orbit.m0] : null,
            (p.dressing && p.dressing.signs || []).length];
  })) + JSON.stringify((sy.traffic || []).map(function (r) {
    return [r.id, r.from, r.to, r.period, r.cruise, r.layover, r.t0, r.size, r.cls];
  })) + JSON.stringify((sy.patrols || []).map(function (r) { return [r.id, r.kind, r.faction]; })) +
    JSON.stringify(sy.bodies.map(function (b) { return [b.id, b.mass, b.radius]; }));
}

console.log('--- which ports ---');
var platforms = [], coastalLeft = 0, byRole = {}, byWorld = {}, sameRest = true, rolledUg = 0;
var sameIdentity = true, notFlagged = true, waterOnly = true, wasCoastal = 0, cleared = true;
var sampleSys = null;
gal.stars.forEach(function (st) {
  var o = Galaxy.systemOpts(gal, st);
  var sy = Gen.generateSystem(st.seed, o);
  var sea = {};
  sy.ports.forEach(function (p) {
    if (p.coastal) coastalLeft++;
    if (!p.seaPlatform) return;
    sea[p.id] = true;
    platforms.push({ p: p, sys: sy, star: st });
    if (p.seaRolledUnderground) rolledUg++;
    var role = (p.market && p.market.role) || '?';
    byRole[role] = (byRole[role] || 0) + 1;
    var wk = p.parentBody.type + (p.parentBody.habitableBand ? ' ' + p.parentBody.habitableBand : '');
    byWorld[wk] = (byWorld[wk] || 0) + 1;
    if (p.underground || p.coastal || p.coastalWhy !== undefined || !(p.platformWhy && p.platformWhy.length > 20)) cleared = false;
    if (W.terrainOf(p.parentBody).lava) waterOnly = false;
    if (!sampleSys) sampleSys = { sys: sy, port: p, star: st };
  });
  if (!platforms.length || !Object.keys(sea).length) return;
  var off = Gen.generateSystem(st.seed, Object.assign({}, o, { noSea: true }));
  off.ports.forEach(function (q) {
    if (q.coastal) {
      wasCoastal++;
      if (!sea[q.id] && !W.terrainOf(q.parentBody).lava) notFlagged = false;
    }
    if (sea[q.id]) {
      var p = sy.byId[q.id];
      if (!q.coastal) notFlagged = false;
      if (p.id !== q.id || p.name !== q.name || p.faction !== q.faction ||
          JSON.stringify(p.market && p.market.rows) !== JSON.stringify(q.market && q.market.rows)) sameIdentity = false;
    }
  });
  var sa = strip(off, sea), sb = strip(sy, sea);
  if (sa !== sb) {
    if (sameRest) { for (var ci = 0; ci < sa.length && sa[ci] === sb[ci]; ci++); console.log('     first difference, ' + st.seed + ': ' + sb.slice(Math.max(0, ci - 120), ci + 60) + '\n     without the pass: ' + sa.slice(Math.max(0, ci - 120), ci + 60)); }
    sameRest = false;
  }
});
console.log('     ' + platforms.length + ' sea platforms in ' + gal.stars.length + ' systems (' + rolledUg +
            ' rolled as buried bays); by role ' + JSON.stringify(byRole) + '; by world ' + JSON.stringify(byWorld));
check('every port flagged coastal on water is now a sea platform', notFlagged && wasCoastal === platforms.length,
      wasCoastal + ' flagged without the pass, ' + platforms.length + ' platforms');
check('none is left flagged coastal', coastalLeft === 0, coastalLeft + ' left');
check('the kawartha count is the one the inland pass reported (117)', platforms.length === 117, String(platforms.length));
check('only on water, never on lava', waterOnly);
check('a platform is not a shaft, carries its reason, and the coastal flag is gone', cleared);
check('a platform keeps its id, name, faction and market', sameIdentity);
check('nothing else in any system changed, bit for bit', sameRest);

/* Same seed, same answer. */
(function () {
  var st = sampleSys.star;
  var a = Gen.generateSystem(st.seed, Galaxy.systemOpts(gal, st));
  var b = Gen.generateSystem(st.seed, Galaxy.systemOpts(gal, st));
  var key = function (sy) {
    return JSON.stringify(sy.ports.filter(function (p) { return p.seaPlatform; })
      .map(function (p) { return [p.id, p.lat, p.lon, p.elevation, p.platformWhy]; }));
  };
  check('same seed, same platforms', key(a) === key(b) && key(a).length > 4);
})();

console.log('--- the bay ---');
(function () {
  var p = sampleSys.port, sy = sampleSys.sys, r = p.radius;
  var g = Gen.bayGeometry(p), L = Gen.seaLayout();
  check('a platform wears its own role', !global.Render || global.Render.portModelFor(p) === 'seaplatform');
  check('the bay table is the sea one: no shaft, the floor is the deck above the sea',
        g.sea && g.depth === 0 && Math.abs(g.floorZ * r - Gen.SEA_DECK_KM) < 1e-12 && g.berths === Gen.SEA_PADS);
  var ok = true, minGap = Infinity, hubGap = Infinity;
  for (var i = 0; i < Gen.SEA_PADS; i++) {
    var a = L.pads[i];
    hubGap = Math.min(hubGap, a.ring - a.dome - L.hub);
    for (var j = i + 1; j < Gen.SEA_PADS; j++) {
      var b = L.pads[j];
      minGap = Math.min(minGap, Math.hypot(a.x - b.x, a.y - b.y) - a.dome - b.dome);
    }
    var off = Gen.berthOffset(p, i);
    if (Math.abs(off.x * r - a.x) > 1e-9 || Math.abs(off.y * r - a.y) > 1e-9) ok = false;
    if (!(off.z > g.floorZ) || off.z - g.floorZ > 0.01 / r) ok = false;
  }
  check('each berth is its own pad, standing on the deck', ok);
  check('no two domes touch', minGap > 0.005, (minGap * 1000).toFixed(1) + ' m between the nearest rims');
  check('every dome stands clear of the hub, with a tube between', hubGap >= L.tube - 1e-12, (hubGap * 1000).toFixed(1) + ' m');
  check('berth 0 is the large pad and the only one', Gen.berthOffset(p, 0).large &&
        [1, 2, 3, 4, 5].every(function (k) { return !Gen.berthOffset(p, k).large; }));
  /* Sized for the traffic: a hull a dome is to protect fits under it. */
  var big = Gen.SHIP_CLASSES.tanker.size, small = Gen.SHIP_CLASSES.hauler.size;
  check('the large dome covers a tanker and an ordinary one a waste hauler',
        L.pads[0].dome * 2 > big && L.pads[1].dome * 2 > small,
        'domes ' + (L.pads[0].dome * 2000).toFixed(0) + ' m / ' + (L.pads[1].dome * 2000).toFixed(0) + ' m across');

  /* The berth in the world: above the sea at the port, on the deck. */
  var t = 5000;
  var bs = Sim.berthState(p, sy, t, 2);
  var hc = Sim.bodyPosition(p.parentBody, sy, t);
  var alt = V.dist(bs.pos, hc) - p.parentBody.radius;
  check('a pad stands above the sea, at the deck', alt > Gen.SEA_DECK_KM * 0.98 && alt < Gen.SEA_DECK_KM + 0.02,
        (alt * 1000).toFixed(1) + ' m above sea level');
  /* And the room the camera keeps to is the dome over that pad. */
  var room = Sim.berthRoom(p, 2), pad = L.pads[2];
  check('the berth room is the dome over the pad',
        room && Math.abs((room.x0 + room.x1) / 2 * r - pad.x) < 1e-9 && room.z0 * r >= Gen.SEA_DECK_KM - 1e-9 &&
        (room.z1 - room.z0) * r < pad.rise + 1e-9);
})();

console.log('--- saves ---');
(function () {
  /* restore() docks by id (save.js: Sim.dockShip(s, sys.byId[d.docked])):
   * a career saved at this port before it was a platform comes back on a
   * pad of it. */
  var p = sampleSys.port, sy = sampleSys.sys, t = 12345;
  var saved = JSON.parse(JSON.stringify({ docked: p.id }));
  var again = Gen.generateSystem(sampleSys.star.seed, Galaxy.systemOpts(gal, sampleSys.star));
  var q = again.byId[saved.docked];
  var ship = Sim.makeShip ? Sim.makeShip(V.zero(), V.zero()) : { pos: V.zero(), vel: V.zero(), fwd: { x: 1, y: 0, z: 0 }, up: { x: 0, y: 0, z: 1 }, right: { x: 0, y: 1, z: 0 } };
  Sim.dockShip(ship, q, again, t);
  var b = ship.dockOffset && ship.dockOffset.berth;
  var bs = Sim.berthState(q, again, t, b);
  check('a save docked at the port loads onto one of its pads',
        q && q.seaPlatform && ship.docked === p.id && bs && V.dist(ship.pos, bs.pos) < 1e-6,
        'berth ' + b);
})();

module.exports = { platforms: platforms, sample: sampleSys };
if (require.main === module) {
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
}
