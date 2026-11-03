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

/* ---- INLAND (2026-11-02) --------------------------------------------------
 * Astra: "placement needs to not ignore coastlines. All planetside ports
 * should be set up far enough inland that no underground geometry protrudes
 * into the water." generate.js placeInland: every surface port's footprint
 * dry, or the port flagged `coastal` with its reason; a wet pad moved to the
 * nearest dry site with everything that hangs off it; a dry pad untouched;
 * no draws, so nothing else in the system moves. */
console.log('--- inland ---');
(function () {
  var fs = require('fs'), path = require('path');
  var GLW = null;
  try { GLW = require('../src/gl.js'); } catch (e) { GLW = null; }
  var sample = systems.slice(0, 40);
  var pads = [];
  sample.forEach(function (sy) {
    sy.ports.forEach(function (p) { if (p.surface) pads.push({ p: p, sys: sy }); });
  });
  var wet = pads.filter(function (x) { return W.digFloor(x.p.parentBody) !== null; });
  var moved = pads.filter(function (x) { return !!x.p.movedInland; });
  /* Flagged coastal, or - since 2026-11-02 - built as a sea platform for
   * the same reason (generate.js makeSeaPlatforms): either way, nowhere dry. */
  var coastal = pads.filter(function (x) { return !!(x.p.coastal || x.p.seaPlatform); });
  console.log('     ' + pads.length + ' surface ports in ' + sample.length + ' systems, ' + wet.length +
              ' on worlds with a sea, ' + moved.length + ' moved inland, ' + coastal.length + ' flagged coastal');

  /* The footprint, as the generator tests it and again on a 400-point disc
   * (golden-angle spiral) - a thin inlet the 25 samples step over would
   * show up here. */
  function denseDry(p) {
    var b = p.parentBody, rf = Gen.inlandFootKm(p), q = Gen.qOfLatLon(p.lat, p.lon);
    var e = [-q[1], q[0], 0], el = Math.hypot(e[0], e[1]) || 1; e = [e[0] / el, e[1] / el, 0];
    var n = [q[1] * e[2] - q[2] * e[1], q[2] * e[0] - q[0] * e[2], q[0] * e[1] - q[1] * e[0]];
    for (var i = 0; i < 400; i++) {
      var g = rf * Math.sqrt((i + 0.5) / 400) / b.radius, a = i * 2.399963229728653;
      var c = Math.cos(g), sn = Math.sin(g), v = [0, 1, 2].map(function (k) {
        return q[k] * c + (n[k] * Math.cos(a) + e[k] * Math.sin(a)) * sn;
      });
      if (!W.dryAt(b, W.padDir(b, Math.asin(v[2]), Math.atan2(v[1], v[0])))) return false;
    }
    return true;
  }
  var notDry = pads.filter(function (x) {
    return !x.p.coastal && !x.p.seaPlatform && !(Gen.footprintDry(W, x.p.parentBody, Gen.qOfLatLon(x.p.lat, x.p.lon), Gen.inlandFootKm(x.p)) && denseDry(x.p));
  });
  check('every surface port\'s underground footprint is dry, unless flagged coastal', notDry.length === 0,
        notDry.length + ' wet: ' + notDry.slice(0, 3).map(function (x) { return x.p.name; }).join(', '));
  check('the 40 seeds put some ports in the sea to begin with, and moved them', moved.length > 0, moved.length + ' moved');
  check('a coastal flag carries its reason', coastal.every(function (x) { var w = x.p.coastalWhy || x.p.platformWhy; return typeof w === 'string' && w.length > 20; }),
        coastal.length ? (coastal[0].p.coastalWhy || coastal[0].p.platformWhy) : 'none flagged');
  /* Where a flagged port is, there really is no site: no ground on that
   * world (in its band) clears the floor anywhere. A coarse sweep is enough
   * to catch a flag set on a world with plenty of land. */
  var falseFlags = coastal.filter(function (x) {
    var b = x.p.parentBody, f = W.digFloor(b), band = b.habitableBand;
    for (var i = 0; i < 20000; i++) {
      var z = 2 * ((i + 0.5) / 20000) - 1, lat = Math.asin(z), lon = (i * 2.399963229728653) % (2 * Math.PI);
      if (Math.abs(lat) > 1.45) continue;
      if (band === 'equator' && Math.abs(lat) > 1.45 * 0.15) continue;
      if (band === 'terminator') {
        var l = ((x.p.lon % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
        var ring = (l < Math.PI ? 1 : -1) * (Math.PI / 2 - 0.15);
        if (Math.abs(Math.atan2(Math.sin(lon - ring), Math.cos(lon - ring))) > 0.06) continue;
      }
      /* Margin over the floor for the footprint the sweep does not sample. */
      if (W.elevationAt(b, W.padDir(b, lat, lon)) > f + 0.01) return true;
    }
    return false;
  });
  check('and a flagged port\'s world has no clearly dry ground for it', falseFlags.length === 0,
        falseFlags.map(function (x) { return x.p.name + ' on ' + x.p.parentBody.name; }).join(', '));
  check('a moved port stood in the water where it was rolled', moved.every(function (x) {
    return !Gen.footprintDry(W, x.p.parentBody, Gen.qOfLatLon(x.p.movedInland.lat, x.p.movedInland.lon), Gen.inlandFootKm(x.p));
  }));

  /* THE ART FITS THE FOOTPRINT. Every vertex of every ground site model, in
   * pad radii, against INLAND_FOOT - and the shed's own corner and the deep
   * bay's tunnel. A wider model added later fails here, not in the sea. */
  var dir = path.join(__dirname, '..', 'src', 'ports'), widest = 0, widestOf = '';
  if (fs.existsSync(dir)) {
    fs.readdirSync(dir).filter(function (f) { return /site.*\.js$/.test(f); }).forEach(function (f) {
      var src = fs.readFileSync(path.join(dir, f), 'utf8');
      var at = src.indexOf('var d = '), end = src.indexOf(';\n', at);
      if (at < 0 || end < 0) return;
      var d = JSON.parse(src.slice(at + 8, end));
      [d.v, d.interior && d.interior.v].forEach(function (vs) {
        (vs || []).forEach(function (v) {
          var r = Math.hypot(v[0], v[1]);
          if (r > widest) { widest = r; widestOf = f; }
        });
      });
    });
  }
  var bay = Gen.bayGeometry({ surface: true, radius: 0.2, shaftDepth: 0.8 });
  var shedCorner = Math.hypot(bay.chamberX, bay.chamberY);
  var tunnel = moved.length ? moved[0].p.tunnelRadius / moved[0].p.radius : 1.35;
  check('every ground site model, the shed and the tunnel fit inside INLAND_FOOT',
        widest > 0 && widest <= Gen.INLAND_FOOT && shedCorner <= Gen.INLAND_FOOT && tunnel <= Gen.INLAND_FOOT,
        'widest ' + widest.toFixed(3) + ' (' + widestOf + '), shed ' + shedCorner.toFixed(3) +
        ', tunnel ' + tunnel.toFixed(2) + ' of ' + Gen.INLAND_FOOT);

  /* THE MARGIN IS THE SHADER'S. Weather.DIG_NUDGE is the most gl.js's
   * ground crinkle can move a coastline: GD.elev x a brightness normalised
   * into [-0.5, 0.5]. A retune of GD.elev that outgrows it fails here rather
   * than quietly putting ports back in the water. */
  if (GLW && GLW.GROUND_DETAIL) {
    check('the dig margin covers the shader\'s ground crinkle', GLW.GROUND_DETAIL.elev / 2 <= W.DIG_NUDGE + 1e-12,
          'GD.elev/2 ' + (GLW.GROUND_DETAIL.elev / 2).toFixed(4) + ' vs ' + W.DIG_NUDGE);
  }

  /* The direction the coastline is read at is the direction the pad is. */
  var dirErr = 0;
  pads.forEach(function (x) {
    var b = x.p.parentBody, t = 7777;
    var off = Sim.surfaceOffset(b, { lat: x.p.lat, lon: x.p.lon, elevation: 0 }, t);
    var d = V.scale(off.pos, 1 / V.len(off.pos)), pb = W.bodyFixed(b, d, t), pd = W.padDir(b, x.p.lat, x.p.lon);
    dirErr = Math.max(dirErr, Math.hypot(pb.x - pd.x, pb.y - pd.y, pb.z - pd.z));
  });
  check('Weather.padDir is where Sim puts the pad', dirErr < 1e-9, dirErr.toExponential(2));

  /* UNTOUCHED, BIT FOR BIT. The same systems without the pass: every pad
   * that was not moved has exactly the same latitude and longitude, every
   * moved one differs, and nothing else - names, ids, markets, orbits,
   * roles - moved anywhere, because the pass takes no draws. */
  var sameDry = true, sameRest = true, moveSeen = true, n = 0;
  /* `sea`: the ids built as sea platforms in the inland run. The building
   * a platform stands as (siteKind) is its own; everything else about it
   * must be what it would have been. */
  function strip(sy, sea) {
    return JSON.stringify(sy.ports.map(function (p) {
      var m = p.market || {};
      if (sea && sea[p.id]) p = Object.assign({}, p, { seaPlatform: true, seaRolledUnderground: p.seaPlatform ? p.seaRolledUnderground : p.underground });
      return [p.id, p.name, p.radius, p.seaPlatform ? p.seaRolledUnderground : p.underground, m.role || m.roleId || null,
              Object.keys(m.rows || {}).sort().map(function (k) { return k + ':' + (m.rows[k].prod || 0) + ':' + (m.rows[k].base || 0); }).join(','),
              p.orbit ? p.orbit.a : null, p.faction, p.livery, p.seaPlatform ? null : (p.siteKind || null)];
    })) + JSON.stringify((sy.traffic || []).map(function (r) { return [r.from, r.to, r.period, r.phase]; }));
  }
  sample.slice(0, 20).forEach(function (sy) {
    var st = sy._star;
    var off = Gen.generateSystem(st.seed, Object.assign({}, Galaxy.systemOpts(gal, st), { noInland: true }));
    sy.ports.forEach(function (p) {
      if (!p.surface) return;
      var q = off.byId[p.id];
      if (!q) { sameRest = false; return; }
      n++;
      if (p.movedInland) {
        if (q.lat === p.lat && q.lon === p.lon) moveSeen = false;
        if (q.lat !== p.movedInland.lat || q.lon !== p.movedInland.lon) moveSeen = false;
      } else if (q.lat !== p.lat || q.lon !== p.lon) sameDry = false;
    });
    var seaIds = {};
    sy.ports.forEach(function (p) { if (p.seaPlatform) seaIds[p.id] = true; });
    if (strip(off, seaIds) !== strip(sy, seaIds)) sameRest = false;
  });
  check('a port already dry is exactly where it was (bit for bit)', sameDry && n > 0, n + ' pads compared');
  check('a moved port started from the rolled spot, and is somewhere else', moveSeen);
  check('nothing else in the system changed: ids, names, markets, orbits, traffic', sameRest);

  /* Deterministic. */
  var st1 = sample[3]._star;
  var r1 = Gen.generateSystem(st1.seed, Galaxy.systemOpts(gal, st1));
  var r2 = Gen.generateSystem(st1.seed, Galaxy.systemOpts(gal, st1));
  var key = function (sy) { return JSON.stringify(sy.ports.filter(function (p) { return p.surface; }).map(function (p) { return [p.id, p.lat, p.lon, !!(p.coastal || p.seaPlatform)]; })); };
  var allSame = true;
  sample.forEach(function (sy) {
    var again = Gen.generateSystem(sy._star.seed, Galaxy.systemOpts(gal, sy._star));
    if (key(again) !== key(sy)) allSame = false;
  });
  check('same seed, same inland placement', key(r1) === key(r2) && allSame);

  /* EVERYTHING THAT HANGS OFF A PORT FOLLOWS IT. The shaft mouth and the
   * berth (Sim.portEntrance, bodyState) stand over the new spot, not the
   * old; traffic bound for the port moors at the new spot; and a moved
   * mining head's province - the rich ground - is under it. */
  /* The first moved port that has traffic: since stars stage 2 the first
   * moved port of all (Harrow Deep) has none, and the mooring check below
   * was skipped rather than run. */
  var mx = moved.filter(function (m) {
    var tr = (m.sys.traffic || []).filter(function (r) { return r.to === m.p.id || r.from === m.p.id; })[0];
    for (var k = 0; tr && k < 400; k++) {
      var sk = Sim.trafficState(tr, m.sys, tr.period * k / 400);
      if (sk && sk.landed) return true;
    }
    return false;
  })[0] || moved[0];
  if (mx) {
    var p = mx.p, b = p.parentBody, sy = mx.sys, t = 3600;
    var wp = Sim.bodyPosition(b, sy, t);
    var at = function (lat, lon) {
      return V.add(wp, Sim.surfaceOffset(b, { lat: lat, lon: lon, elevation: 0 }, t).pos);
    };
    var mouth = Sim.portEntrance(p, sy, t), berth = Sim.bodyState(p, sy, t).pos;
    var dNew = V.len(V.sub(mouth.pos, at(p.lat, p.lon))), dOld = V.len(V.sub(mouth.pos, at(p.movedInland.lat, p.movedInland.lon)));
    check('a moved port\'s shaft mouth is over its new site', dNew < 1 && dOld > 100,
          p.name + ': ' + dNew.toFixed(3) + ' km from the new site, ' + dOld.toFixed(0) + ' from the old');
    check('and its berth is down that shaft', V.len(V.sub(berth, at(p.lat, p.lon))) < 2);
    var trips = (sy.traffic || []).filter(function (r) { return r.to === p.id || r.from === p.id; });
    var moored = null;
    for (var i = 0; trips.length && i < 400 && !moored; i++) {
      var tt = trips[0].period * i / 400, st2 = Sim.trafficState(trips[0], sy, tt);
      if (st2 && st2.landed) moored = { st: st2, t: tt };
    }
    if (trips.length && moored) {
      var wp2 = Sim.bodyPosition(b, sy, moored.t);
      var here = V.add(wp2, Sim.surfaceOffset(b, { lat: p.lat, lon: p.lon, elevation: 0 }, moored.t).pos);
      check('traffic to a moved port moors at the new site', V.len(V.sub(moored.st.pos, here)) < 5,
            V.len(V.sub(moored.st.pos, here)).toFixed(2) + ' km');
    } else console.log('     (no landed traffic at ' + p.name + ' in a period - not checked)');
  }
  var mine = moved.filter(function (x) {
    var m = x.p.market; return m && (m.role || m.roleId) === 'mining';
  })[0];
  if (mine) {
    /* By the rule the mine-is-where-the-ore-is section reads: its best
     * product, at its own (new) cell, at least 0.6 of the world's best.
     * The survey reads the port's position lazily, so it follows. */
    var rows = mine.p.market.rows || {}, sells = 'ores', bp = -1;
    ['ores', 'rare', 'fissile'].forEach(function (cid) {
      var prod = rows[cid] ? (rows[cid].prod || 0) : 0;
      if (prod > bp) { bp = prod; sells = cid; }
    });
    var gm = Sv.groundMap(mine.p.parentBody, mine.sys);
    var hereNew = Sv.localGrade(mine.p.parentBody, mine.sys, sells, Sv.cellOfLatLon(mine.p.lat, mine.p.lon));
    var hereOld = Sv.localGrade(mine.p.parentBody, mine.sys, sells, Sv.cellOfLatLon(mine.p.movedInland.lat, mine.p.movedInland.lon));
    check('a moved mining port\'s rich ground moved with it', !gm.world[sells] || hereNew >= 0.6 * gm.world[sells],
          mine.p.name + ' sells ' + sells + ': ' + hereNew.toFixed(3) + ' at the new site (' + hereOld.toFixed(3) +
          ' at the old), world best ' + (gm.world[sells] || 0).toFixed(3));
  } else console.log('     (no moved mining port in these seeds - the rich-ground check above covers the rest)');
})();

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
