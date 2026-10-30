/* ground.test.js - deposits are somewhere (2026-10-25).
 *
 *     node test/ground.test.js
 *
 * Astra: "planets should have mineral deposits which are location-based,
 * where you might find metals/precious metals in some ratio in one place,
 * water where there's water on the surface, fissiles show up with the
 * gamma spectrometer, and so on."
 *
 * What this holds (survey.js groundMap, weather.js terrainAt):
 *   - SEED DATA: the same map every time, and asking draws nothing;
 *   - A WORLD'S GRADE IS ITS BEST GROUND: no cell beats it, and most of a
 *     world is poorer;
 *   - METALS in provinces, ore and precious metal together in each one's
 *     own ratio; FISSILES in small hotspots; a surface mining port stands
 *     on rich ground;
 *   - WATER where the picture shows it: the CPU coastline is the shader's
 *     (same frame, same field), seas and caps are wet, lava is not water;
 *   - DRONES dig the ground they stand on;
 *   - and a ship set down on a tidally locked world stays where it landed.
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
var Sv = require('../src/survey.js');
var Cl = require('../src/claims.js');
var V = global.V;

var pass = 0, fail = 0;
function check(n, c, d) {
  if (c) { pass++; console.log('  ok   ' + n + (d ? '   ' + d : '')); }
  else { fail++; console.log('  FAIL  ' + n + (d ? '   ' + d : '')); }
}

var gal = Galaxy.build('kawartha');
var systems = [];
for (var s = 0; s < gal.stars.length && systems.length < 50; s++) {
  var sy = Gen.generateSystem(gal.stars[s].seed, Galaxy.systemOpts(gal, gal.stars[s]));
  sy._star = gal.stars[s];
  systems.push(sy);
}
var worlds = [];
systems.forEach(function (sy) {
  sy.bodies.forEach(function (b) { if (b.kind === 'planet' || b.kind === 'moon') worlds.push({ b: b, sys: sy }); });
});
var NC = Sv.NCELL;
function maxOf(a) { var m = 0; for (var i = 0; i < a.length; i++) if (a[i] > m) m = a[i]; return m; }

console.log('--- seed data ---');
(function () {
  var st = systems[2]._star;
  var a = Gen.generateSystem(st.seed, Galaxy.systemOpts(gal, st));
  var before = JSON.stringify(a.bodies.map(function (b) { return [b.id, b.mass, b.orbit && b.orbit.a]; }));
  a.bodies.forEach(function (b) { Sv.groundMap(b, a); });
  var b2 = Gen.generateSystem(st.seed, Galaxy.systemOpts(gal, st));
  check('asking for the ground draws nothing', before ===
        JSON.stringify(b2.bodies.map(function (b) { return [b.id, b.mass, b.orbit && b.orbit.a]; })));
  var w = a.bodies.filter(function (b) { return b.kind === 'planet' && b.type !== 'gasGiant'; })[0];
  var m1 = Sv.groundMap(w, a), m2 = Sv.groundMap(w, b2);
  var same = Object.keys(m1.grade).every(function (cid) {
    for (var i = 0; i < NC; i++) if (m1.grade[cid][i] !== m2.grade[cid][i]) return false;
    return true;
  });
  check('the same world has the same map in a fresh copy of its system', same && Object.keys(m1.grade).length > 0);
})();

console.log('--- a world\'s grade is its best ground ---');
(function () {
  var over = 0, maps = 0, poorer = 0, cells = 0, landBest = 0, landN = 0;
  worlds.forEach(function (w) {
    var m = Sv.groundMap(w.b, w.sys);
    if (!m) return;
    maps++;
    Object.keys(m.grade).forEach(function (cid) {
      var a = m.grade[cid], g = m.world[cid];
      if (maxOf(a) > g + 1e-6) over++;
      for (var i = 0; i < NC; i++) { cells++; if (a[i] < g * 0.5) poorer++; }
      if (cid === 'ores' && m.sea) {
        var anyLand = false;
        for (i = 0; i < NC; i++) if (m.sea[i] < 0.5 && (!m.ice || m.ice[i] < 0.5)) anyLand = true;
        if (anyLand) { landN++; if (maxOf(a) >= g * 0.6) landBest++; }
      }
    });
  });
  check('no cell anywhere is richer than its world', maps > 500 && over === 0, maps + ' worlds, ' + over + ' over');
  check('most ground is poorer than the best', poorer / cells > 0.4, Math.round(100 * poorer / cells) + '% of cells under half');
  check('a world with dry land has its ore on it', landN > 10 && landBest === landN, landBest + ' of ' + landN);
})();

console.log('--- metals in provinces, fissiles in hotspots ---');
(function () {
  var withBoth = 0, together = 0, small = 0, fis = 0, mixes = [];
  worlds.forEach(function (w) {
    var m = Sv.groundMap(w.b, w.sys);
    if (!m) return;
    if (m.grade.ores && m.grade.rare) {
      withBoth++;
      var bi = 0;
      for (var i = 0; i < NC; i++) if (m.grade.rare[i] > m.grade.rare[bi]) bi = i;
      if (m.grade.ores[bi] >= 0.3 * m.world.ores) together++;
      if (mixes.length < 2000) m.provinces.forEach(function (p) { mixes.push(p.share); });
    }
    if (m.grade.fissile) {
      fis++;
      var hot = 0;
      for (i = 0; i < NC; i++) if (m.grade.fissile[i] > 0.5 * m.world.fissile) hot++;
      if (hot / NC < 0.25) small++;
    }
  });
  check('the richest precious metal sits in an ore body', withBoth > 50 && together / withBoth > 0.9,
        together + ' of ' + withBoth);
  var lo = mixes.filter(function (x) { return x < 0.1; }).length, hi = mixes.filter(function (x) { return x > 0.4; }).length;
  check('provinces carry different mixes - some nearly all base metal, some rich in precious',
        lo > 0 && hi > 0, lo + ' lean, ' + hi + ' rich of ' + mixes.length);
  check('fissiles are hotspots, not the whole world', fis > 20 && small / fis > 0.95, small + ' of ' + fis);
})();

console.log('--- the mine is where the ore is ---');
(function () {
  var heads = 0, rich = 0;
  worlds.forEach(function (w) {
    (w.sys.bodies || []).forEach(function (p) {
      if (p.kind !== 'station' || !p.surface || typeof p.lat !== 'number') return;
      var host = p.parentBody ? (p.parentBody.id || p.parentBody) : null;
      if (host !== w.b.id || !p.market || (p.market.role || p.market.roleId) !== 'mining') return;
      heads++;
      /* What it sells most of, by the same rule survey.js reads it. */
      var rows = p.market.rows || {}, sells = 'ores', bp = -1;
      ['ores', 'rare', 'fissile'].forEach(function (cid) {
        var prod = rows[cid] ? (rows[cid].prod || 0) : 0;
        if (prod > bp) { bp = prod; sells = cid; }
      });
      var cell = Sv.cellOfLatLon(p.lat, p.lon);
      var m = Sv.groundMap(w.b, w.sys);
      var here = Sv.localGrade(w.b, w.sys, sells, cell);
      if (!m.world[sells] || here >= 0.6 * m.world[sells]) rich++;
      else if (heads - rich < 4) console.log('     ' + w.b.name + ' sells ' + sells + ': ' + here.toFixed(3) +
                                              ' here, ' + m.world[sells].toFixed(3) + ' best, sea ' +
                                              (m.sea ? m.sea[cell].toFixed(2) : '-'));
    });
  });
  check('a surface mining port stands on rich ground', heads === 0 || rich === heads, rich + ' of ' + heads);
})();

console.log('--- water where the picture has it ---');
(function () {
  /* The CPU coastline is the shader's: a cell's centre flown out to the
   * world at some moment, turned into the shader's body-fixed frame, lands
   * on the same sea the map says. */
  /* A world with both sea and dry land on it. */
  var w = worlds.filter(function (x) {
    if (x.b.habitableBand || !(x.b.type === 'terran' || x.b.type === 'tundra')) return false;
    var mm = Sv.groundMap(x.b, x.sys);
    if (!mm || !mm.sea || !mm.grade.water) return false;
    var wet = 0, dry = 0;
    for (var i = 0; i < NC; i++) { if (mm.sea[i] > 0.9) wet++; else if (mm.sea[i] < 0.1 && mm.ice[i] < 0.1) dry++; }
    return wet > 20 && dry > 20;
  })[0];
  check('a world with seas to look at', !!w);
  if (!w) return;
  var m = Sv.groundMap(w.b, w.sys), agree = 0, n = 0;
  var t = 123456.7, fr = Sv.spinFrame(w.b, t);
  for (var la = 0; la < Sv.LAT_BINS; la += 2) {
    for (var lo = 0; lo < Sv.LON_BINS; lo += 3) {
      var lat = -Math.PI / 2 + (la + 0.5) * Math.PI / Sv.LAT_BINS, lon = (lo + 0.5) * 2 * Math.PI / Sv.LON_BINS;
      var ln = lon + fr.turn;
      var d = V.add(V.add(V.scale(fr.e1, Math.cos(lat) * Math.cos(ln)), V.scale(fr.e2, Math.cos(lat) * Math.sin(ln))),
                    V.scale(fr.n, Math.sin(lat)));
      var cell = Sv.cellOfWorld(w.b, d, t);
      var g = W.terrainAt(w.b, W.bodyFixed(w.b, d, t));
      n++;
      if (cell === la * Sv.LON_BINS + lo && Math.abs(g.sea - m.sea[cell]) < 1e-6) agree++;
    }
  }
  check('the survey and the picture agree on every coastline sampled', agree === n, agree + ' of ' + n);
  var seaW = 0, seaN = 0, dryW = 0, dryN = 0;
  for (var i = 0; i < NC; i++) {
    if (m.sea[i] > 0.9) { seaW += m.grade.water[i]; seaN++; }
    else if (m.sea[i] < 0.1 && m.ice[i] < 0.1) { dryW += m.grade.water[i]; dryN++; }
  }
  check('the seas are wet and the dry land is not', seaN && dryN && seaW / seaN > 4 * (dryW / dryN),
        (seaW / seaN).toFixed(2) + ' vs ' + (dryW / dryN).toFixed(2));
  var cap = worlds.filter(function (x) { return x.b.type === 'tundra' && !x.b.habitableBand; })[0];
  if (cap) {
    var mc = Sv.groundMap(cap.b, cap.sys);
    var pole = mc.grade.water[NC - 1], equ = mc.grade.water[(Sv.LAT_BINS / 2) * Sv.LON_BINS] ;
    check('a cold world\'s ice caps hold its water', pole >= equ && pole > 0.5 * mc.world.water,
          pole.toFixed(2) + ' at the pole');
  }
  var molten = worlds.filter(function (x) { return x.b.type === 'molten'; })[0];
  if (molten) {
    var mm = Sv.groundMap(molten.b, molten.sys);
    check('lava is not water', !mm.sea || maxOf(mm.sea) === 0);
  }
  check('gl.js keeps the same terrain table weather.js reads',
        /terran:\s*\{ ocean: 0\.55/.test(require('fs').readFileSync(require('path').join(__dirname, '..', 'src', 'gl.js'), 'utf8')) &&
        W.TERRAIN.terran.ocean === 0.55);
})();

console.log('--- a drone digs the ground it stands on ---');
(function () {
  var pick = null;
  worlds.some(function (w) {
    var m = Sv.groundMap(w.b, w.sys);
    if (!m || !m.grade.ores || w.b.kind !== 'planet') return false;
    var lo = 0, hi = 0;
    for (var i = 0; i < NC; i++) {
      if (m.grade.ores[i] < m.grade.ores[lo]) lo = i;
      if (m.grade.ores[i] > m.grade.ores[hi]) hi = i;
    }
    if (m.grade.ores[hi] > 3 * m.grade.ores[lo]) { pick = { w: w, lo: lo, hi: hi }; return true; }
    return false;
  });
  check('a world with rich and poor ground', !!pick);
  if (!pick) return;
  global.Combat = global.Combat || { surveyLevel: function () { return 3; } };
  function landAt(cell) {
    var la = Math.floor(cell / Sv.LON_BINS), lo = cell % Sv.LON_BINS;
    var key = 'here:' + pick.w.b.id, full = new Uint8Array(NC);
    for (var i = 0; i < NC; i++) full[i] = 1;
    var packed = Sv.packCells(full);
    var G = { here: { id: 'here' }, t: 0, claims: {}, surveys: {}, drones: [],
              ship: { drones: 1, credits: 0, cargo: {}, landed: true,
                      landedAt: { body: pick.w.b.id, lat: -Math.PI / 2 + (la + 0.5) * Math.PI / Sv.LAT_BINS,
                                  lon: (lo + 0.5) * 2 * Math.PI / Sv.LON_BINS, elevation: 0 } } };
    G.claims[key] = { until: 1e12 };
    G.surveys[key] = { key: key, kind: 'world', cells: packed, cellsF: packed, cells2: packed,
                       cov: 1, covF: 1, cov2: 1, grade: 3, v: 2, t: 0 };
    var r = Cl.deploy(G, pick.w.sys, 0, pick.w.b);
    return r.ok ? r.drone : null;
  }
  var rich = landAt(pick.hi), poor = landAt(pick.lo);
  check('set down on the ore body, it digs that ground at that ground\'s grade',
        rich && Math.abs(rich.grade - Sv.localGrade(pick.w.b, pick.w.sys, rich.cid, pick.hi)) < 1e-9 &&
        Sv.localGrade(pick.w.b, pick.w.sys, rich.cid, pick.hi) < Sv.groundMap(pick.w.b, pick.w.sys).world[rich.cid] + 1e-9,
        rich ? rich.cid + ' ' + rich.grade.toFixed(2) + ' (world best ' +
               Sv.groundMap(pick.w.b, pick.w.sys).world[rich.cid].toFixed(2) + ')' : 'no drone');
  check('set down away from it, it digs less', rich && poor && poor.grade * 2 < rich.grade,
        poor ? poor.cid + ' ' + poor.grade.toFixed(2) : 'no drone');
})();

console.log('--- landing on a tidally locked world ---');
(function () {
  var locked = worlds.filter(function (w) { return w.b.rotation && w.b.rotation.az; })[0];
  check('a world whose pole leans along its orbit (az)', !!locked);
  if (!locked) return;
  var at = { lat: 0.4, lon: 1.1, elevation: 0 }, t = 5000;
  var off = Sim.surfaceOffset(locked.b, at, t);
  var pos = V.add(Sim.bodyPosition(locked.b, locked.sys, t), off.pos);
  var back = Sim.landSpot(locked.b, locked.sys, t, pos);
  check('where you land is where you stay', Math.abs(back.lat - at.lat) < 1e-6 && Math.abs(back.lon - at.lon) < 1e-6,
        'lat ' + back.lat.toFixed(4) + ' lon ' + back.lon.toFixed(4));
})();

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
