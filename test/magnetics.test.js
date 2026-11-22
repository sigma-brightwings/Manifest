/* magnetics.test.js - the magnetometer hears the interior (2026-11-22).
 *
 *     node test/magnetics.test.js
 *
 * Planetary interiors slice 3 (claude/planetary-interiors.md). The
 * magnetic anomaly used to be the ore-grade map; now it is the interior's
 * bodies. What this holds:
 *   - ASKING MOVES NOTHING: the ground map is the same after the field is
 *     built, and the same seed gives the same field;
 *   - ONLY WHAT CAN BE MAGNETIC IS HEARD: magnetic compositions, above the
 *     Curie depth - no ice, salt or fissile, nothing below Curie;
 *   - THE DIPOLE LAW: a buried body reads as (size/depth)^3, so a deeper
 *     body of the same make is quieter, and its high is centred over it;
 *   - REMANENCE belongs to dead dynamos only, and is never a contact;
 *   - THE CONTACT LIST is readings only (no composition), is limited to
 *     what the coil has swept, and explains a province only when the
 *     spectrometer reads its class. A buried body is never explained. */
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
require('../src/gravity.js');
var In = require('../src/interior.js');

var pass = 0, fail = 0;
function check(n, c, d) {
  if (c) { pass++; console.log('  ok   ' + n + (d ? '   ' + d : '')); }
  else { fail++; console.log('  FAIL  ' + n + (d ? '   ' + d : '')); }
}

var gal = Galaxy.build('kawartha');
var STARS = gal.stars.slice(0, 16);
function build(st) { return Gen.generateSystem(st.seed, Galaxy.systemOpts(gal, st)); }
var worlds = [];
STARS.forEach(function (st) {
  var sy = build(st);
  sy.bodies.forEach(function (b) {
    if (b.kind === 'planet' || b.kind === 'moon') worlds.push({ b: b, sy: sy, st: st });
  });
});
function sum(a) { var s = 0; for (var i = 0; i < a.length; i++) s += a[i] * (i % 97 + 1); return s; }

console.log('--- asking moves nothing ---');
(function () {
  var w = worlds.filter(function (x) { var g = Sv.groundMap(x.b, x.sy); return g && g.grade.ores; })[0];
  var before = sum(Sv.groundMap(w.b, w.sy).grade.ores);
  var mm = Sv.magMap(w.b, w.sy);
  check('the ground map is untouched by building the field', sum(Sv.groundMap(w.b, w.sy).grade.ores) === before);
  var again = Sv.magMap(Gen.generateSystem(w.st.seed, Galaxy.systemOpts(gal, w.st)).bodies
                          .filter(function (b) { return b.id === w.b.id; })[0],
                        Gen.generateSystem(w.st.seed, Galaxy.systemOpts(gal, w.st)));
  check('same seed, same field', again && sum(again.field) === sum(mm.field), w.b.name);
})();

console.log('--- only what can be magnetic is heard ---');
(function () {
  var bad = 0, below = 0, srcs = 0, silentKinds = 0;
  worlds.forEach(function (x) {
    var mm = Sv.magMap(x.b, x.sy);
    if (!mm) return;
    mm.sources.forEach(function (s) {
      if (!s.m) return;
      srcs++;
      if (!(s.m.mag > 0)) bad++;
      if (!s.m.aboveCurie) below++;
      if (s.m.comp === 'ice' || s.m.comp === 'salt' || s.m.comp === 'fissile') silentKinds++;
    });
  });
  check('every source is a magnetic composition', srcs > 50 && bad === 0, srcs + ' sources');
  check('nothing below the Curie depth is heard', below === 0);
  check('ice, salt and fissile are silent', silentKinds === 0);
  var giants = worlds.filter(function (x) { return In.of(x.b, x.sy) && In.of(x.b, x.sy).type && /Giant|giant/.test(x.b.type || ''); });
  check('a giant has no crust to hold an anomaly',
        giants.every(function (x) { var mm = Sv.magMap(x.b, x.sy); return !mm || mm.sources.length === 0; }),
        giants.length + ' giants');
})();

console.log('--- the dipole law ---');
(function () {
  var peaks = 0, peaksOK = 0, lawOK = true, pairs = 0, pairsOK = 0;
  worlds.forEach(function (x) {
    var mm = Sv.magMap(x.b, x.sy);
    if (!mm) return;
    var buried = mm.sources.filter(function (s) { return s.m && !s.broad; });
    buried.forEach(function (s) {
      var z = Math.max(s.m.zKm, s.m.radKm), q = s.m.radKm / z;
      if (Math.abs(s.amp - 0.30 * s.m.mag * q * q * q) > 1e-9) lawOK = false;
      if (s.amp * Sv.NT_PER < 500) return;
      peaks++;
      var cell = Sv.cellOfLatLon(Math.asin(s.c[2]), Math.atan2(s.c[1], s.c[0]));
      if (mm.anom[cell] >= 0.6 * s.amp) peaksOK++;
    });
    for (var i = 0; i < buried.length; i++) for (var j = 0; j < buried.length; j++) {
      var a = buried[i].m, b = buried[j].m;
      /* b is no bigger and deeper: it must read quieter. */
      if (i === j || a.comp !== b.comp || b.radKm > a.radKm || a.zKm >= b.zKm - 2) continue;
      pairs++;
      if (buried[i].amp > buried[j].amp) pairsOK++;
    }
  });
  check('a buried body reads as (size/depth)^3', lawOK);
  check('its high stands over it', peaks > 5 && peaksOK === peaks, peaksOK + '/' + peaks);
  check('the same make, deeper, is quieter', pairsOK === pairs, pairsOK + '/' + pairs + ' pairs');
})();

console.log('--- remanence ---');
(function () {
  var withR = 0, wrong = 0, asContact = 0;
  worlds.forEach(function (x) {
    var mm = Sv.magMap(x.b, x.sy), I = In.of(x.b, x.sy);
    if (!mm || !I) return;
    var rem = mm.sources.filter(function (s) { return s.remanent; });
    if (rem.length) withR++;
    if (rem.length && (I.dynamo || !(I.remanence > 0))) wrong++;
    Sv.magContacts(x.b, x.sy, null, 4).forEach(function (c) { if (!c.id) asContact++; });
  });
  check('some dead worlds keep a remanent crust', withR > 0, withR + ' worlds');
  check('only where the dynamo has died', wrong === 0);
  check('remanence is never listed as a contact', asContact === 0);
})();

console.log('--- the contact list ---');
(function () {
  var all = [], rich = null;
  worlds.forEach(function (x) {
    var cs = Sv.magContacts(x.b, x.sy, null, 4);
    cs.forEach(function (c) { all.push(c); });
    if (!rich && cs.some(function (c) { return !c.broad; }) && cs.some(function (c) { return c.broad; })) rich = x;
  });
  check('the coil finds contacts across the sample', all.length > 20, all.length + ' contacts');
  check('readings only: no composition on a contact',
        all.every(function (c) { return c.comp === undefined && c.compName === undefined; }));
  check('loudest first', all.length > 1 && (function () {
    var ok = true;
    worlds.forEach(function (x) {
      var cs = Sv.magContacts(x.b, x.sy, null, 4);
      for (var i = 1; i < cs.length; i++) if (cs[i].nT > cs[i - 1].nT) ok = false;
    });
    return ok;
  })());
  check('none under the floor', all.every(function (c) { return c.nT >= Sv.MAG_FLOOR_NT; }));
  check('a buried body is never explained', all.every(function (c) { return c.broad || !c.explained; }));
  if (rich) {
    var none = Sv.magContacts(rich.b, rich.sy, { cellsM: '' }, 4);
    check('nothing is listed over ground the coil has not flown', none.length === 0, rich.b.name);
    var cs1 = Sv.magContacts(rich.b, rich.sy, null, 0);
    check('no spectrometer, nothing explained', cs1.every(function (c) { return !c.explained; }));
    var I = In.of(rich.b, rich.sy), cs4 = Sv.magContacts(rich.b, rich.sy, null, 4);
    check('a full survey kit explains the provinces', cs4.filter(function (c) { return c.broad; })
          .every(function (c) { return c.explained; }));
    var line = Sv.describeMag(cs4.filter(function (c) { return !c.broad; })[0]);
    check('a buried high is read in nT with a depth', /^\+[\d.k]+ nT/.test(line) && /km down/.test(line), line);
    var line2 = Sv.describeMag(cs4.filter(function (c) { return c.broad; })[0]);
    check('a province reads broad, near the surface', /broad/.test(line2), line2);
  } else check('a world with both kinds of high was found', false);
})();

console.log((fail ? '' : '') + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
