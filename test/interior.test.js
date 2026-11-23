/* interior.test.js - one seeded interior per world (2026-11-22).
 *
 *     node test/interior.test.js
 *
 * Slice 1 of the planetary interiors plan (claude/planetary-interiors.md):
 * data only, read by nothing yet. What this holds:
 *   - SAME SEED, SAME INTERIOR, and asking for one moves NOTHING: no body
 *     gains a key, no system changes, and the gravity profile is the one
 *     gravity.js already had (the new layers are names, not weight);
 *   - THE LAYERS tile the world from the centre to the surface;
 *   - A DYNAMO NEEDS A LIQUID OUTER CORE, and every giant has one;
 *   - EVERY GRAVITY SOURCE on a solid world is in the interior, with a
 *     composition that agrees with what grade IV already says of it;
 *   - THE CURIE DEPTH holds: nothing below it is magnetic;
 *   - THE DISTRIBUTION stays physical: earthlike worlds often have a field,
 *     dead rock and moons rarely. */
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
var In = require('../src/interior.js');

var pass = 0, fail = 0;
function check(n, c, d) {
  if (c) { pass++; console.log('  ok   ' + n + (d ? '   ' + d : '')); }
  else { fail++; console.log('  FAIL  ' + n + (d ? '   ' + d : '')); }
}

var gal = Galaxy.build('kawartha');
var STARS = gal.stars.slice(0, 24);
function build(st) { return Gen.generateSystem(st.seed, Galaxy.systemOpts(gal, st)); }
function worldsOf(sy) {
  return sy.bodies.filter(function (b) { return b.kind === 'planet' || b.kind === 'moon'; });
}
function project(sy) {
  return JSON.stringify(sy.bodies.map(function (b) {
    return [b.id, b.kind, b.type, b.mass, b.radius, Object.keys(b).sort().join(',')];
  }));
}
function strip(I) {
  var o = {};
  Object.keys(I).forEach(function (k) { if (k !== 'sys') o[k] = I[k]; });
  return JSON.stringify(o);
}

/* ---- 1. SEED DATA, MOVING NOTHING ------------------------------------- */
console.log('--- seed data ---');
var systems = [], same = true, moved = 0, n = 0;
STARS.forEach(function (st) {
  var a = build(st), b = build(st);
  var before = project(a);
  var wa = worldsOf(a), wb = worldsOf(b);
  wa.forEach(function (w, i) {
    var Ia = In.of(w, a), Ib = In.of(wb[i], b);
    n++;
    if (!Ia || !Ib || strip(Ia) !== strip(Ib)) same = false;
  });
  if (project(a) !== before) moved++;
  systems.push(a);
});
check('the same seed builds the same interior', same, n + ' worlds');
check('asking for an interior changes no body and no system', moved === 0, moved + ' moved');
var worlds = [];
systems.forEach(function (sy) { worldsOf(sy).forEach(function (b) { worlds.push({ b: b, sy: sy, I: In.of(b, sy) }); }); });
check('every world has an interior', worlds.every(function (w) { return !!w.I; }));
check('a second ask is the cached answer', worlds.every(function (w) { return In.of(w.b, w.sy) === w.I; }));
var profOk = worlds.every(function (w) {
  var p = Gr.profileOf(w.b, w.sy);
  return p && p.rc === w.I.rc && p.kc === w.I.kc && p.D === w.I.D;
});
check('the gravity profile is the one gravity.js already had', profOk);

/* ---- 2. THE LAYERS ----------------------------------------------------- */
console.log('--- the layers ---');
var tiled = true, bad = '';
worlds.forEach(function (w) {
  var L = w.I.layers.slice().sort(function (x, y) { return x.from - y.from; });
  if (!L.length || Math.abs(L[0].from) > 1e-9 || Math.abs(L[L.length - 1].to - 1) > 1e-9) { tiled = false; bad = w.b.id; }
  for (var i = 0; i < L.length; i++) {
    if (!(L[i].to > L[i].from)) { tiled = false; bad = w.b.id + ' ' + L[i].name; }
    if (i && Math.abs(L[i].from - L[i - 1].to) > 1e-9) { tiled = false; bad = w.b.id + ' gap at ' + L[i].name; }
  }
});
check('the layers tile the world, centre to surface, without a gap', tiled, bad);
var solid = worlds.filter(function (w) { return !In.TYPE[w.I.type].giant; });
check('a rocky world has a crust and an icy one a shell',
      solid.every(function (w) { return In.TYPE[w.I.type].shell ? w.I.shellKm > 0 : w.I.crustKm > 0; }));
check('the inner core never outgrows the core',
      solid.every(function (w) { return w.I.innerFrac >= 0 && w.I.innerFrac <= 1; }));

/* ---- 3. THE DYNAMO ----------------------------------------------------- */
console.log('--- the dynamo ---');
var giants = worlds.filter(function (w) { return In.TYPE[w.I.type].giant; });
check('every giant has a dynamo', giants.length > 0 && giants.every(function (w) { return w.I.dynamo; }),
      giants.length + ' giants');
check('every rocky dynamo has a liquid outer core',
      solid.every(function (w) { return !w.I.dynamo || (w.I.innerFrac < 1 && w.I.outerShell >= In.SHELL_MIN); }));
check('drive is 0..1, and 0 with no dynamo',
      worlds.every(function (w) { return w.I.drive >= 0 && w.I.drive <= 1 && (w.I.dynamo || w.I.drive === 0); }));
check('old magnetised crust only where there is no dynamo',
      worlds.every(function (w) { return !w.I.dynamo || w.I.remanence === 0; }));

/* ---- 4. THE MASSES ----------------------------------------------------- */
console.log('--- the masses ---');
var allIn = true, compOk = true, nb = 0, nIce = 0, iceOk = true;
solid.forEach(function (w) {
  var ids = {};
  w.I.bodies.forEach(function (m) { ids[m.id] = m; nb++; });
  Gr.sourcesOf(w.b, w.sy).forEach(function (s) {
    var m = ids[s.id];
    if (!m) { allIn = false; return; }
    var want = s.kind === 'fissile' ? 'fissile' : s.kind === 'ice' ? 'ice' : s.kind === 'salt' ? 'salt'
             : (s.share > In.RARE_SHARE ? 'rare' : null);
    if (want && m.comp !== want) compOk = false;
    if (!want && m.comp !== 'iron' && m.comp !== 'sulphide') compOk = false;
  });
  w.I.bodies.forEach(function (m) {
    if (m.comp !== 'ice') return;
    nIce++;
    if (In.TYPE[w.I.type].shell || m.sign !== -1 || !(m.zKm < (w.b.radius || 1))) iceOk = false;
  });
});
check('every gravity source on a solid world is in its interior', allIn, nb + ' masses');
check('composition agrees with the grade IV tell (rare iff share > 0.55)', compOk);
check('buried ice is light, inside the world, and only in rock', iceOk, nIce + ' ice bodies');
check('a giant holds no lumps', giants.every(function (w) { return w.I.bodies.length === 0; }));

/* ---- 5. THE CURIE DEPTH ------------------------------------------------ */
console.log('--- the Curie depth ---');
var curieOk = true, hears = 0, silent = 0;
solid.forEach(function (w) {
  var I = w.I;
  if (!(I.curieKm > 0 && I.curieKm <= 0.3 * (w.b.radius || 1) + 1e-9)) curieOk = false;
  I.bodies.forEach(function (m) {
    if (m.magnetic) hears++;
    if (m.mag > 0 && !m.aboveCurie) silent++;
    if (m.magnetic && (m.zKm > I.curieKm || !(m.mag > 0))) curieOk = false;
  });
});
check('nothing below the Curie depth is magnetic, nor anything non-magnetic',
      curieOk, hears + ' a coil hears, ' + silent + ' too deep and hot');
check('the Curie depth lies under an icy world\'s shell',
      solid.every(function (w) { return !In.TYPE[w.I.type].shell || w.I.curieKm >= w.I.shellKm; }));

/* ---- 6. THE DISTRIBUTION ----------------------------------------------- */
console.log('--- the distribution ---');
function share(types) {
  var a = 0, b = 0;
  worlds.forEach(function (w) { if (types.indexOf(w.I.type) >= 0) { b++; if (w.I.dynamo) a++; } });
  return { a: a, b: b, f: b ? a / b : 0 };
}
var earth = share(['terran', 'ocean']), dead = share(['rocky', 'rockyMoon', 'iceMoon', 'iceball']);
check('earthlike worlds often have a dynamo', earth.b > 0 && earth.f > 0.3 && earth.f < 0.9,
      earth.a + ' of ' + earth.b);
check('dead rock and moons rarely do', dead.f < 0.1, dead.a + ' of ' + dead.b);

/* ---- 7. SIGNED GRAVITY (slice 2) --------------------------------------- */
console.log('--- signed gravity ---');
(function () {
  var giantSrc = 0, shellLight = 0, lights = 0, ice = 0, salt = 0, lowSig = true, lowSeen = 0, lowDesc = true;
  var saltWhere = true, explainedOk = true, deepIceUnexplained = true, dipSlice = null;
  var wc = Sv.classOf ? Sv.classOf('water') : 1;
  worlds.forEach(function (w) {
    var src = Gr.sourcesOf(w.b, w.sy);
    if (In.TYPE[w.I.type].giant) { giantSrc += src.length; return; }
    var L = src.filter(function (s) { return s.light; });
    if (In.TYPE[w.I.type].shell) shellLight += L.length;
    L.forEach(function (s) {
      lights++;
      if (s.kind === 'ice') ice++;
      if (s.kind === 'salt') { salt++; if (w.I.type !== 'desert') saltWhere = false; }
      if (!(s.w < 0)) lowSig = false;
    });
    var cs = Gr.contacts(w.b, w.sy, 4, wc);
    cs.forEach(function (c) {
      if (c.kind !== 'ice' && c.kind !== 'salt') return;
      if (c.merged > 1) return;
      lowSeen++;
      if (!(c.mgal < 0 && c.low)) lowSig = false;
      if (!/-\d.*mGal low/.test(Gr.describe(c))) lowDesc = false;
      if (c.kind === 'salt' && c.explained) explainedOk = false;
      if (c.kind === 'ice' && c.band === 'shallow' && !c.explained) explainedOk = false;
      if (c.kind === 'ice' && c.band !== 'shallow' && c.explained) deepIceUnexplained = false;
    });
    if (!dipSlice && L.length) {
      var sl = Gr.slice(w.b, w.sy, 'xy', 4);
      if (sl && sl.anomMin < 0) dipSlice = sl;
    }
  });
  check('a giant holds no lumps on the gravimeter either', giantSrc === 0);
  check('buried ice and salt are gravity sources now', ice > 0 && salt > 0, ice + ' ice, ' + salt + ' salt');
  check('salt only under desert worlds, light bodies never in an ice shell', saltWhere && shellLight === 0);
  check('a light body reads LOW: negative mGal, flagged low', lowSig && lowSeen > 0, lowSeen + ' lows at grade 4');
  check('and the line says so, as a reading', lowDesc);
  check('shallow ice is explained by a kit that reads water; salt never; deep ice never',
        explainedOk && deepIceUnexplained);
  check('the slice carries the dip below zero', !!dipSlice && dipSlice.anomMin < 0,
        dipSlice ? (dipSlice.anomMin * 1e5).toFixed(1) + ' mGal at the deepest' : 'none');
  /* The same ice in both: the interior's mass list IS the gravity list. */
  var same = worlds.every(function (w) {
    var a = Gr.sourcesOf(w.b, w.sy).map(function (s) { return s.id; }).join(',');
    var b = w.I.bodies.map(function (m) { return m.id; }).join(',');
    return a === b;
  });
  check('the interior lists exactly what the gravimeter weighs', same);
})();

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
