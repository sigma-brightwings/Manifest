/* habitable.test.js — warmer, fuller habitable zones (stars stage 2,
 * 2026-11-03).
 *
 *     node test/habitable.test.js
 *
 * The orbits used to start anywhere from 0.22 to 0.55·√L and step by
 * 1.30–1.75, so the zone caught one world, near an edge as often as not,
 * and its type was a flat pick regardless of how warm it was. Now one world
 * (the anchor) sits at 0.80–1.35 Earth insolation, a compact chain runs
 * through the zone at no less than r_min, and the zone's types lean on the
 * light. See warmChainAxes in src/generate.js.
 *
 * Three things are held here:
 *   1. opts.legacyOrbits rebuilds master's planets EXACTLY — names, types
 *      and semi-major axes captured from the generator at 44cd871, before
 *      the change. It is the instrument every before/after figure in the
 *      CHANGELOG was measured with, so it has to be the real "before".
 *   2. The targets, over 40 kawartha systems and two other galaxies.
 *   3. The chain stays dynamically sensible: adjacent solid worlds at
 *      least 8.5 mutual Hill radii apart.
 */
'use strict';
global.window = global.window || global;
require('../src/vec3.js');
require('../src/kepler.js');
require('../src/economy.js');
var Gen = require('../src/generate.js');
var Galaxy = require('../src/galaxy.js');

var pass = 0, fail = 0;
function check(n, c, d) {
  if (c) { pass++; console.log('  ok   ' + n + (d ? '   ' + d : '')); }
  else { fail++; console.log('  FAIL  ' + n + (d ? '   ' + d : '')); }
}
var M_SUN = 1.98892e30;
function planetsOf(sys) { return sys.root.children.filter(function (b) { return b.kind === 'planet'; }); }
function median(a) { a = a.slice().sort(function (x, y) { return x - y; }); return a[Math.floor(a.length / 2)]; }
function solid(p) { return p.type !== 'gasGiant' && p.type !== 'iceGiant'; }
/* Spacing in mutual Hill radii: R_H = ∛((m1+m2)/3M) · (a1+a2)/2. */
function hillGap(p, q, M) {
  return (q.orbit.a - p.orbit.a) / (Math.cbrt((p.mass + q.mass) / (3 * M)) * (p.orbit.a + q.orbit.a) / 2);
}
function systems(gseed, n, extra) {
  var gal = Galaxy.build(gseed), out = [];
  for (var s = 0; s < n && s < gal.stars.length; s++) {
    var o = Object.assign({}, Galaxy.systemOpts(gal, gal.stars[s]) || {}, extra || {});
    out.push(Gen.generateSystem(gal.stars[s].seed, o));
  }
  return out;
}
function stats(list) {
  var warm2 = 0, ins = [], minGap = Infinity, worst = '', anchored = 0, counts = [];
  list.forEach(function (sys) {
    var pl = planetsOf(sys), warm = 0;
    counts.push(pl.length);
    pl.forEach(function (p) {
      if (p.habitableGlobal) { ins.push(p.insolation); if (p.insolation >= 0.6) warm++; }
    });
    if (warm >= 2) warm2++;
    if (pl.some(function (p) { return p.insolation >= 0.80 - 1e-9 && p.insolation <= 1.35 + 1e-9; })) anchored++;
    for (var i = 1; i < pl.length; i++) {
      if (!solid(pl[i - 1]) || !solid(pl[i])) continue;
      var g = hillGap(pl[i - 1], pl[i], sys.root.mass);
      if (g < minGap) { minGap = g; worst = pl[i - 1].name + '/' + pl[i].name; }
    }
  });
  return { n: list.length, warm2: warm2 / list.length, medIns: median(ins), minGap: minGap, worst: worst,
           anchored: anchored, counts: counts };
}

/* ---- 1. legacyOrbits is master, bit for bit ---------------------------- */
console.log('--- opts.legacyOrbits rebuilds the planets master made ---');
var MASTER = [
  { seed: "kawartha", planets: [
    ["Mirven I", "molten", 33998647.90548801],
    ["Mirven II", "rocky", 47405394.34350977],
    ["Mirven III", "ocean", 78731919.62224077],
    ["Mirven IV", "tundra", 107577185.28394662],
    ["Mirven V", "rocky", 159807849.52645347],
    ["Mirven VI", "iceball", 246331141.77412012]
  ] },
  { seed: "kawartha:s1", planets: [
    ["Oruun I", "molten", 13932308.169375688],
    ["Oruun II", "desert", 19077538.481259484],
    ["Oruun III", "desert", 28096177.557086006],
    ["Oruun IV", "terran", 49103527.284100376],
    ["Oruun V", "desert", 66395201.74021141],
    ["Oruun VI", "tundra", 114938193.35738139],
    ["Oruun VII", "iceGiant", 170130162.9660764],
    ["Oruun VIII", "iceball", 265333427.2856177],
    ["Oruun IX", "iceGiant", 362483288.5678153],
    ["Oruun X", "gasGiant", 547975642.7609689],
    ["Oruun XI", "gasGiant", 904931266.816617],
    ["Oruun XII", "iceGiant", 1298882389.7208118]
  ] },
  { seed: "kawartha:s2", planets: [
    ["Linethor I", "molten", 89692159.29251434],
    ["Linethor II", "molten", 136464397.5355259],
    ["Linethor III", "rocky", 201896937.31046486],
    ["Linethor IV", "desert", 339720481.1743928],
    ["Linethor V", "rocky", 558450682.0308895],
    ["Linethor VI", "iceball", 832331923.6781731],
    ["Linethor VII", "gasGiant", 1455013912.7143333],
    ["Linethor VIII", "gasGiant", 1933703320.9533648],
    ["Linethor IX", "gasGiant", 2763254590.479904],
    ["Linethor X", "iceball", 3741746550.677546],
    ["Linethor XI", "gasGiant", 6539836626.971747]
  ] },
  { seed: "kawartha:s3", planets: [
    ["Syyshai I", "desert", 15422522.181074912],
    ["Syyshai II", "rocky", 21364903.327747647],
    ["Syyshai III", "terran", 36679022.05360999],
    ["Syyshai IV", "iceball", 52086482.56661472],
    ["Syyshai V", "iceball", 81563854.65034227],
    ["Syyshai VI", "gasGiant", 131634722.55910468],
    ["Syyshai VII", "gasGiant", 194163616.88998777],
    ["Syyshai VIII", "iceball", 305743216.3174771],
    ["Syyshai IX", "gasGiant", 476277433.3242285],
    ["Syyshai X", "gasGiant", 774723610.1919357]
  ] },
  { seed: "kawartha:s4", planets: [
    ["Aelost I", "molten", 34979486.78853624],
    ["Aelost II", "rocky", 58039081.047730334],
    ["Aelost III", "tundra", 100786291.61362913],
    ["Aelost IV", "tundra", 146748531.2900857],
    ["Aelost V", "iceball", 197097504.74802482],
    ["Aelost VI", "iceball", 288052615.7504603],
    ["Aelost VII", "gasGiant", 423107859.15459716],
    ["Aelost VIII", "gasGiant", 619749666.6383122],
    ["Aelost IX", "iceball", 978278544.8282675]
  ] },
  { seed: "kawartha:s5", planets: [
    ["Taolmai I", "desert", 26740136.60462398],
    ["Taolmai II", "desert", 38368420.64376656],
    ["Taolmai III", "desert", 60693382.43729176],
    ["Taolmai IV", "terran", 92958688.16839027],
    ["Taolmai V", "tundra", 135726532.6233682],
    ["Taolmai VI", "rocky", 191683006.80375585],
    ["Taolmai VII", "gasGiant", 323623783.74998],
    ["Taolmai VIII", "gasGiant", 503698504.2530646],
    ["Taolmai IX", "iceball", 656611922.7682304],
    ["Taolmai X", "gasGiant", 946589345.7062716],
    ["Taolmai XI", "gasGiant", 1434296027.5084832]
  ] },
  { seed: "kawartha:s6", planets: [
    ["Noostis I", "rocky", 17483632.543368805],
    ["Noostis II", "tundra", 28093177.5059059],
    ["Noostis III", "terran", 47980344.45700098],
    ["Noostis IV", "rocky", 69989936.06913292],
    ["Noostis V", "iceball", 97521963.47224897],
    ["Noostis VI", "iceGiant", 131617053.76228134],
    ["Noostis VII", "iceGiant", 207611539.74659622],
    ["Noostis VIII", "gasGiant", 328694145.54610777],
    ["Noostis IX", "iceball", 554015661.268455],
    ["Noostis X", "iceball", 772956305.7094942]
  ] },
  { seed: "kawartha:s7", planets: [
    ["Unaq I", "molten", 3969594.1264996757],
    ["Unaq II", "rocky", 5998833.6575645795],
    ["Unaq III", "desert", 7967831.6234145],
    ["Unaq IV", "ocean", 12895314.068939794],
    ["Unaq V", "terran", 18701535.5630166],
    ["Unaq VI", "tundra", 27627556.96453738]
  ] },
  { seed: "kawartha:s8", planets: [
    ["Kaynxa I", "molten", 3720140.263410771],
    ["Kaynxa II", "molten", 6303436.382044182],
    ["Kaynxa III", "desert", 10276445.66648057],
    ["Kaynxa IV", "ocean", 17547130.536202],
    ["Kaynxa V", "tundra", 25944261.560509447],
    ["Kaynxa VI", "tundra", 40005093.88043125],
    ["Kaynxa VII", "gasGiant", 55449549.097168595]
  ] },
  { seed: "kawartha:s9", planets: [
    ["Sefven I", "molten", 2513081.126842419],
    ["Sefven II", "molten", 3903133.2089881995],
    ["Sefven III", "desert", 5334163.835687247],
    ["Sefven IV", "tundra", 7162990.3814515015],
    ["Sefven V", "terran", 11610739.136460662],
    ["Sefven VI", "terran", 17252619.059739176],
    ["Sefven VII", "rocky", 25799170.635343675],
    ["Sefven VIII", "iceGiant", 41985243.77612718]
  ] }
];
(function () {
  var gal = Galaxy.build('kawartha'), bad = [];
  MASTER.forEach(function (want, i) {
    var st = gal.stars[i];
    var o = Object.assign({}, Galaxy.systemOpts(gal, st) || {}, { legacyOrbits: true });
    var got = planetsOf(Gen.generateSystem(st.seed, o)).map(function (p) { return [p.name, p.type, p.orbit.a]; });
    if (st.seed !== want.seed || JSON.stringify(got) !== JSON.stringify(want.planets)) bad.push(want.seed);
  });
  check('10 kawartha systems: names, types and semi-major axes identical to 44cd871',
        bad.length === 0, bad.length ? 'differ: ' + bad.join(', ') : MASTER.length + ' systems');
  /* And the default really is the new generator, or every figure below is
   * the old one measured twice. */
  var moved = 0;
  MASTER.forEach(function (want, i) {
    var st = gal.stars[i];
    var got = planetsOf(Gen.generateSystem(st.seed, Galaxy.systemOpts(gal, st)));
    if (JSON.stringify(got.map(function (p) { return [p.name, p.type, p.orbit.a]; })) !== JSON.stringify(want.planets)) moved++;
  });
  check('without it, the same systems are built anew', moved === MASTER.length, moved + ' of ' + MASTER.length + ' moved');
})();

/* ---- 2. the targets ------------------------------------------------------ */
console.log('--- warmer, fuller zones: 40 kawartha systems ---');
var before = stats(systems('kawartha', 40, { legacyOrbits: true }));
var after = stats(systems('kawartha', 40));
check('two or more warm (S >= 0.6) global-habitable worlds in at least half of all systems',
      after.warm2 >= 0.5, (100 * after.warm2).toFixed(1) + '% (legacy ' + (100 * before.warm2).toFixed(1) + '%)');
check('median global-habitable insolation in [0.85, 1.0]',
      after.medIns >= 0.85 && after.medIns <= 1.0,
      after.medIns.toFixed(3) + ' (legacy ' + before.medIns.toFixed(3) + ')');
check('every system has its warm anchor (a world at 0.80-1.35 Earth insolation)',
      after.anchored === after.n, after.anchored + ' of ' + after.n);
check('adjacent solid worlds at least 8.5 mutual Hill radii apart',
      after.minGap >= 8.5, 'closest ' + after.minGap.toFixed(2) + ' (' + after.worst + ')');
var cMin = Math.min.apply(null, after.counts), cMax = Math.max.apply(null, after.counts);
check('planet counts stay in the old 6-12 range', cMin >= 6 && cMax <= 12, cMin + '-' + cMax);

['beaverton', 'driftwood'].forEach(function (g) {
  var r = stats(systems(g, 40));
  check(g + ': warm pairs in at least half, median insolation in [0.85, 1.0], Hill spacing >= 8.5',
        r.warm2 >= 0.5 && r.medIns >= 0.85 && r.medIns <= 1.0 && r.minGap >= 8.5,
        (100 * r.warm2).toFixed(1) + '%, ' + r.medIns.toFixed(3) + ', ' + r.minGap.toFixed(2));
});

/* ---- 3. the chain's own numbers ----------------------------------------- */
console.log('--- the chain spacing floor ---');
var r02 = Gen.chainRatioMin(0.2), r05 = Gen.chainRatioMin(0.5), r1 = Gen.chainRatioMin(1.0);
check('r_min ~1.31 at 0.2 M_sun, ~1.23 at 0.5, floored at 1.20 for a G star',
      Math.abs(r02 - 1.31) < 0.01 && Math.abs(r05 - 1.23) < 0.01 && r1 === 1.20,
      r02.toFixed(3) + ' / ' + r05.toFixed(3) + ' / ' + r1.toFixed(3));
(function () {
  /* Inside the zone, every step from one world to the next is at least
   * r_min: the floor is what the Hill spacing above rests on. */
  var worst = Infinity, where = '';
  systems('kawartha', 40).forEach(function (sys) {
    var pl = planetsOf(sys), rm = Gen.chainRatioMin(sys.root.mass / M_SUN);
    for (var i = 1; i < pl.length; i++) {
      if (pl[i - 1].orbit.a > sys.hzOuter) break;
      var k = pl[i].orbit.a / pl[i - 1].orbit.a / rm;
      if (k < worst) { worst = k; where = pl[i - 1].name; }
    }
  });
  check('no step inside the zone is tighter than r_min', worst >= 1 - 1e-12,
        'tightest ' + worst.toFixed(4) + ' x r_min (' + where + ')');
})();

console.log('--- the zone types by warmth ---');
(function () {
  var warmTundra = 0, coolOcean = 0, inZone = 0;
  systems('kawartha', 80).forEach(function (sys) {
    planetsOf(sys).forEach(function (p) {
      if (p.orbit.a < sys.hzInner || p.orbit.a > sys.hzOuter || p.insolation > 6) return;
      inZone++;
      if (p.insolation >= Gen.HZ_WARM && p.type === 'tundra') warmTundra++;
      if (p.insolation < Gen.HZ_COOL && p.type === 'ocean') coolOcean++;
    });
  });
  check('no tundra in the warm band, no ocean in the cool band', warmTundra === 0 && coolOcean === 0,
        inZone + ' zone worlds; ' + warmTundra + ' warm tundra, ' + coolOcean + ' cool ocean');
})();

console.log('');
console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
