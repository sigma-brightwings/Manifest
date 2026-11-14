/* gravity.test.js - weighing a world from the inside (2026-11-12).
 *
 *     node test/gravity.test.js
 *
 * Astra: "the spectrographic scanner should map the gravity well too; please
 * model this as an XY / YZ / ZX selectable planar slice through the center of
 * the planet... Regions of higher gravity would correspond to minerals that
 * aren't detectable by your level 2 scanner as well as just the planet's
 * mass." Then: "the gravimeter fitting; but we're going with 4 tiers of
 * gravimeter, and what is affected is the resolution." And: depth is real
 * and gates reachability.
 *
 * What this holds:
 *   - THE FIELD CANNOT DISAGREE WITH THE ORBIT: the two-layer profile
 *     integrates to the mass the body already has, so g at the surface is
 *     exactly mu/R^2, and g at the centre is exactly zero;
 *   - IT PEAKS INSIDE, like a differentiated world's does;
 *   - SEED DATA: the same world reads the same twice, and asking draws no rng;
 *   - THE SURFACE MAP DID NOT MOVE when depth was added - depth is additive;
 *   - DEPTH IS REAL: a province that outcrops is shallow, a buried body is
 *     not, and nothing claims to be reachable that isn't;
 *   - THE TIERS BUY RESOLUTION: a finer rung sees everything a coarser one
 *     saw and more, names depth only from grade 3, and reads 'dense for its
 *     size' only at grade 4;
 *   - A BURIED BODY IS NEVER EXPLAINED by any spectrometer, at any grade -
 *     which is the whole reason the instrument exists.
 */
global.window = global.window || global;
require('../src/vec3.js');
require('../src/rng.js');
require('../src/kepler.js');
require('../src/economy.js');
var Gen = require('../src/generate.js');
var Galaxy = require('../src/galaxy.js');
require('../src/rings.js');
require('../src/sim.js');
require('../src/weather.js');
var Sv = require('../src/survey.js');
var Gr = require('../src/gravity.js');
var C = require('../src/combat.js');

var pass = 0, fail = 0;
function check(n, c, d) {
  if (c) { pass++; console.log('  ok   ' + n + (d ? '   ' + d : '')); }
  else { fail++; console.log('  FAIL  ' + n + (d ? '   ' + d : '')); }
}

var gal = Galaxy.build('kawartha');
var systems = [], worlds = [];
for (var s = 0; s < gal.stars.length && systems.length < 24; s++) {
  var sy = Gen.generateSystem(gal.stars[s].seed, Galaxy.systemOpts(gal, gal.stars[s]));
  systems.push(sy);
  for (var i = 0; i < sy.bodies.length; i++) {
    var b = sy.bodies[i];
    if ((b.kind === 'planet' || b.kind === 'moon') && b.radius > 0) worlds.push({ b: b, sy: sy });
  }
}
console.log('--- ' + worlds.length + ' worlds over ' + systems.length + ' systems ---');

/* ---- 1. THE FIELD ------------------------------------------------------ */
console.log('--- the field ---');
var worstSurf = 0, worstCentre = 0, worstFrac = 0, monoOk = true, gasSkipped = 0;
worlds.forEach(function (w) {
  var p = Gr.profileOf(w.b, w.sy);
  if (!p) { gasSkipped++; return; }
  var want = (p.mu / (p.R * p.R)) * 1000;
  worstSurf = Math.max(worstSurf, Math.abs(Gr.gSmooth(p, 1) - want) / Math.max(1e-12, want));
  worstCentre = Math.max(worstCentre, Math.abs(Gr.gSmooth(p, 0)));
  worstFrac = Math.max(worstFrac, Math.abs(Gr.massFrac(p, 1) - 1));
  /* Enclosed mass must never decrease going outwards. */
  var prev = -1;
  for (var k = 0; k <= 40; k++) {
    var f = Gr.massFrac(p, k / 40);
    if (f < prev - 1e-12) monoOk = false;
    prev = f;
  }
});
check('g at the surface is exactly mu/R^2', worstSurf < 1e-12, 'worst rel err ' + worstSurf.toExponential(1));
check('g at the centre is exactly zero', worstCentre === 0);
check('the profile integrates to the whole mass', worstFrac < 1e-12);
check('enclosed mass rises monotonically outwards', monoOk);

var peakIn = 0, peakRatio = [];
worlds.forEach(function (w) {
  var p = Gr.profileOf(w.b, w.sy);
  if (!p) return;
  var pk = Gr.peakOf(p);
  if (pk.x < 0.999) peakIn++;
  peakRatio.push(pk.g / Math.max(1e-12, p.gSurf));
  if (pk.g < p.gSurf - 1e-9) monoOk = false;
});
check('g peaks below the surface on most worlds', peakIn > worlds.length * 0.4,
      peakIn + ' of ' + worlds.length);
check('the peak is never weaker than the surface', peakRatio.every(function (r) { return r >= 1 - 1e-9; }));
check('the peak stays within reason', peakRatio.every(function (r) { return r < 1.8; }),
      'max ' + Math.max.apply(null, peakRatio).toFixed(2));

/* ---- 2. SEED DATA ------------------------------------------------------ */
console.log('--- seed data ---');
var stable = true;
worlds.slice(0, 30).forEach(function (w) {
  var a = Gr.contacts(w.b, w.sy, 4, 3), b2 = Gr.contacts(w.b, w.sy, 4, 3);
  if (JSON.stringify(a) !== JSON.stringify(b2)) stable = false;
});
check('the same world reads the same twice', stable);

/* Regenerating a system after asking it about gravity must give the same
 * system: asking may not touch the shared rng. */
var s0 = gal.stars[0];
var fresh1 = Gen.generateSystem(s0.seed, Galaxy.systemOpts(gal, s0));
var w1 = fresh1.bodies.filter(function (b) { return b.kind === 'planet' && b.radius > 0; })[0];
Gr.slice(w1, fresh1, 'xy', 4);
Gr.contacts(w1, fresh1, 4, 3);
var fresh2 = Gen.generateSystem(s0.seed, Galaxy.systemOpts(gal, s0));
function fp(sy) {
  return sy.bodies.map(function (b) {
    return [b.id, b.kind, (b.radius || 0).toFixed(6), (b.mu || 0).toFixed(6),
            b.orbit ? (b.orbit.a || 0).toFixed(6) : ''].join(':');
  }).join('|');
}
check('asking a world its field draws no rng', fp(fresh1) === fp(fresh2));

/* ---- 3. DEPTH IS ADDITIVE AND REAL ------------------------------------- */
console.log('--- depth ---');
var provShallow = true, provN = 0, buriedN = 0, buriedShallow = 0, reachOk = true;
var coverMax = 0, radMax = 0, zOk = true;
worlds.forEach(function (w) {
  var m = Sv.groundMap(w.b, w.sy);
  if (!m) return;
  (m.provinces || []).forEach(function (p) {
    provN++;
    if (p.band !== 'shallow') provShallow = false;
    if (p.cover > Sv.COVER_SHALLOW[1]) provShallow = false;
    if (p.reach !== 'drone') reachOk = false;
    if (Math.abs(p.zKm - (p.cover + p.radKm)) > 1e-9) zOk = false;
    radMax = Math.max(radMax, p.radKm);
  });
  (m.deep || []).forEach(function (b) {
    buriedN++;
    if (b.band === 'shallow') buriedShallow++;
    if (b.band === 'mid' && b.reach !== 'drill') reachOk = false;
    if (b.band === 'deep' && b.reach !== 'none') reachOk = false;
    if (Math.abs(b.zKm - (b.cover + b.radKm)) > 1e-9) zOk = false;
    coverMax = Math.max(coverMax, b.cover);
    radMax = Math.max(radMax, b.radKm);
  });
});
check('a province that outcrops is shallow', provShallow, provN + ' provinces');
check('a buried body is never shallow', buriedShallow === 0, buriedN + ' buried');
check('what can reach it follows its band', reachOk);
check('depth to centre is cover plus radius', zOk);
check('no ore body is absurdly large', radMax <= 50, 'largest ' + radMax.toFixed(0) + ' km across');
check('overburden stays in the modelled range', coverMax <= Sv.COVER_DEEP[1] + 1e-9,
      'deepest ' + coverMax.toFixed(0) + ' km');
check('there are buried bodies to find at all', buriedN > worlds.length * 0.5,
      buriedN + ' over ' + worlds.length + ' worlds');

/* ---- 4. THE TIERS BUY RESOLUTION -------------------------------------- */
console.log('--- the tiers ---');
var monoTier = true, depthRule = true, denseRule = true, bandRule = true, mgalRule = true;
var seenBy = [0, 0, 0, 0, 0];
worlds.forEach(function (w) {
  var ids = [null, null, null, null, null];
  for (var lvl = 1; lvl <= 4; lvl++) {
    var cs = Gr.contacts(w.b, w.sy, lvl, 4);
    seenBy[lvl] += cs.length;
    ids[lvl] = {};
    cs.forEach(function (c) {
      ids[lvl][c.id] = 1;
      if (c.mgal < Gr.RES[lvl].mgal - 1e-9) mgalRule = false;
      if (lvl >= 3 && c.depthKm == null) depthRule = false;
      if (lvl < 3 && c.depthKm != null) depthRule = false;
      if (lvl >= 2 && !c.depthBand) bandRule = false;
      if (lvl < 2 && c.depthBand) bandRule = false;
      if (lvl < 4 && c.dense !== null) denseRule = false;
      if (lvl === 4 && c.dense === null) denseRule = false;
    });
  }
  /* Nothing a coarse rung saw may vanish on a finer one. */
  for (var l2 = 2; l2 <= 4; l2++) {
    for (var k in ids[l2 - 1]) if (!ids[l2][k]) monoTier = false;
  }
});
check('a finer rung sees everything a coarser one did', monoTier);
check('each rung sees strictly more', seenBy[1] < seenBy[2] && seenBy[2] < seenBy[3] && seenBy[3] < seenBy[4],
      seenBy.slice(1).join(' -> '));
check('nothing below the rung\'s sensitivity is reported', mgalRule);
check('depth in km only from grade 3', depthRule);
check('the depth band only from grade 2', bandRule);
check('dense-for-its-size only at grade 4', denseRule);

/* ---- 5. WHAT NO SPECTROMETER CAN SEE ---------------------------------- */
console.log('--- the unexplained ---');
var buriedExplained = 0, unexplainedAtTop = 0, dropsWithSurvey = true;
worlds.forEach(function (w) {
  for (var sl = 0; sl <= 4; sl++) {
    Gr.contacts(w.b, w.sy, 4, sl).forEach(function (c) {
      if (c.kind === 'buried' && c.explained) buriedExplained++;
    });
  }
  var lo = Gr.contacts(w.b, w.sy, 4, 1).filter(function (c) { return !c.explained; }).length;
  var hi = Gr.contacts(w.b, w.sy, 4, 3).filter(function (c) { return !c.explained; }).length;
  if (hi > lo) dropsWithSurvey = false;
  unexplainedAtTop += hi;
});
check('a buried body is never explained, at any survey grade', buriedExplained === 0);
check('better survey kit explains more, never less', dropsWithSurvey);
check('something is still unexplained with a grade 3 survey aboard', unexplainedAtTop > 0,
      unexplainedAtTop + ' contacts');

/* ---- 6. THE SLICE ----------------------------------------------------- */
console.log('--- the slice ---');
var w0 = worlds.filter(function (w) { return w.b.kind === 'planet'; })[0];
var planesOk = true, nOk = true, nanOk = true, centreOk = true, limbOk = true;
Gr.PLANES.forEach(function (pl) {
  for (var lvl = 1; lvl <= 4; lvl++) {
    var sl = Gr.slice(w0.b, w0.sy, pl, lvl);
    if (!sl) { planesOk = false; continue; }
    if (sl.n !== Gr.RES[lvl].n) nOk = false;
    /* The corners are outside the disc and must stay NaN. */
    if (!isNaN(sl.g[0]) || !isNaN(sl.g[sl.n - 1])) nanOk = false;
    /* The middle of the disc is near the centre, where g is small. */
    var mid = Math.floor(sl.n / 2) * sl.n + Math.floor(sl.n / 2);
    if (!(sl.g[mid] < sl.gSurf)) centreOk = false;
    /* Every finite cell lies inside the disc. */
    for (var iy = 0; iy < sl.n; iy++) {
      for (var ix = 0; ix < sl.n; ix++) {
        var u = (ix + 0.5) / sl.n * 2 - 1, v = (iy + 0.5) / sl.n * 2 - 1;
        var inside = Math.sqrt(u * u + v * v) <= 1;
        if (inside === isNaN(sl.g[iy * sl.n + ix])) limbOk = false;
      }
    }
  }
});
check('all three planes slice', planesOk);
check('the grid is as fine as the rung', nOk);
check('outside the world is left blank', nanOk);
check('the middle of the slice is weaker than the surface', centreOk);
check('finite cells are exactly the ones inside the limb', limbOk);

var sl4 = Gr.slice(w0.b, w0.sy, 'xy', 4);
check('the slice carries both the well and the anomaly',
      sl4.g && sl4.anom && sl4.gMax > 0);
check('the slice reports the core it was built on', sl4.core > 0 && sl4.core < 1,
      'core at ' + sl4.core.toFixed(2) + ' R');
var offs = Gr.contacts(w0.b, w0.sy, 4, 2).map(function (c) { return Gr.offPlane(c, 'xy'); });
check('how far off-plane a contact lies is a fraction',
      offs.every(function (o) { return o >= 0 && o <= 1 + 1e-9; }));

/* A coarse rung must not resolve more than a fine one. */
var mergedBy = [0, 0, 0, 0, 0];
worlds.forEach(function (w) {
  for (var lvl = 1; lvl <= 4; lvl++) {
    Gr.contacts(w.b, w.sy, lvl, 4).forEach(function (c) { if (c.merged > 1) mergedBy[lvl]++; });
  }
});
check('a coarse rung leaves sources unresolved that a fine one separates',
      mergedBy[4] <= mergedBy[1], 'grade 1 ' + mergedBy[1] + ', grade 4 ' + mergedBy[4]);

/* ---- 7. THE FITTINGS -------------------------------------------------- */
console.log('--- the fittings ---');
var ids = ['gravI', 'gravII', 'gravIII', 'gravIV'];
var items = ids.map(function (id) { return C.EQUIPMENT[id]; });
check('all four rungs are on the shelf', items.every(function (it) { return !!it; }));
check('each is a utility fitting in one group',
      items.every(function (it) { return it.slot === 'utility' && it.uniqueGroup === 'gravity'; }));
check('the grades run 1 to 4', items.map(function (it) { return it.gravity; }).join() === '1,2,3,4');
var upOk = true;
for (var q = 1; q < 4; q++) {
  if (!(items[q].price > items[q - 1].price)) upOk = false;
  if (!(items[q].power >= items[q - 1].power)) upOk = false;
  if (!(items[q].mass >= items[q - 1].mass)) upOk = false;
  if (!(items[q].minDev >= items[q - 1].minDev)) upOk = false;
}
check('a better rung costs more and asks for more', upOk);
check('every rung has a resolution', ids.every(function (id, k) { return !!Gr.RES[k + 1]; }));

function shipWith(list) { return { fittings: list }; }
check('gravLevel reads nothing from an empty ship', C.gravLevel(shipWith([])) === 0);
check('gravLevel finds the fitted rung', C.gravLevel(shipWith(['gravII'])) === 2);
check('gravLevel takes the best of several', C.gravLevel(shipWith(['gravI', 'gravIII'])) === 3);
check('a gravimeter is not a survey scanner', C.surveyLevel(shipWith(['gravIV'])) === 0);
check('a survey scanner is not a gravimeter', C.gravLevel(shipWith(['deepsurvey'])) === 0);

console.log('');
console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
