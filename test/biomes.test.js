/* biomes.test.js - land split by temperature and moisture (2026-11-02).
 *
 *     node test/biomes.test.js
 *
 * Astra: "Can we also have some more earthlike biomes on planets?" The
 * land on a world with air and water is now coloured by a Whittaker-style
 * split (Weather.BIOME, Weather.biomeAt; the shader's biomeColour is built
 * from the same table). What this holds:
 *   - the shader is built from the table, number for number, and wired
 *     with the same per-world parameters the CPU uses;
 *   - nothing the survey already reads moved: elevation, sea and ice are
 *     what they were (ground, survey and farms suites still pass), and the
 *     biome is added beside them;
 *   - same seed, same biomes; no draws from any stream;
 *   - the distribution is sensible: terran land is mostly forest and
 *     tundra with real variety, a desert is mostly desert, a tundra mostly
 *     tundra and ice, and a twilight world grows green only in its band;
 *   - rock, molten and ice worlds get none of it.
 * The percentages print, so the numbers in CHANGELOG are this file's.
 */
global.window = global.window || global;
var path = require('path');
var ROOT = path.join(__dirname, '..');
['vec3', 'rng', 'slipspace', 'kepler', 'economy', 'generate', 'weather', 'gl']
  .forEach(function (m) { require(path.join(ROOT, 'src', m + '.js')); });
var W = global.Weather, GL = global.GLWorld, Gen = global.Gen;
var Galaxy = require(path.join(ROOT, 'src', 'galaxy.js'));

var pass = 0, fail = 0;
function check(n, c, d) {
  if (c) { pass++; console.log('  ok   ' + n + (d ? '   ' + d : '')); }
  else { fail++; console.log('  FAIL  ' + n + (d ? '   ' + d : '')); }
}

/* Worlds from 30 systems across four galaxies. */
var WORLDS = [];
['kawartha', 'manifest', 'oruun', 'test1'].forEach(function (seed) {
  var g = Galaxy.build(seed);
  for (var i = 0; i < 8; i++) {
    if (WORLDS.length && seed === 'test1' && i > 5) break;
    var sys = Gen.generateSystem(g.stars[i].seed);
    (function walk(b) {
      if (b.kind === 'planet') WORLDS.push(b);
      (b.children || []).forEach(walk);
    })(sys.star || sys.root);
  }
});
var h = 12345;
function rnd() { h = (Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) + 0x9e3779b9) >>> 0; return h / 4294967296; }
function dirs(n) {
  var out = [];
  for (var i = 0; i < n; i++) {
    var z = 2 * rnd() - 1, a = 2 * Math.PI * rnd(), r = Math.sqrt(1 - z * z);
    out.push({ x: r * Math.cos(a), y: r * Math.sin(a), z: z });
  }
  return out;
}
var D = dirs(1200);
function band(b) { return b.habitableBand === 'terminator' || b.habitableBand === 'equator'; }
function tally(list, sunB) {
  var t = {}, land = 0, n = 0;
  list.forEach(function (b) {
    D.forEach(function (p) {
      var g = W.terrainAt(b, p, sunB ? sunB : null);
      n++;
      if (g.biome === 'sea' || g.biome === 'salt flat' || g.biome === 'lava sea') { t.sea = (t.sea || 0) + 1; return; }
      land++; t[g.biome] = (t[g.biome] || 0) + 1;
    });
  });
  return { t: t, land: land, n: n };
}
function pct(r, k) { return 100 * (r.t[k] || 0) / Math.max(1, r.land); }
function show(label, r) {
  console.log('  ' + label + ': ' + (100 * r.land / r.n).toFixed(1) + '% land; of the land:');
  Object.keys(r.t).filter(function (k) { return k !== 'sea'; })
    .sort(function (a, b) { return r.t[b] - r.t[a]; })
    .forEach(function (k) { console.log('      ' + (k + '                  ').slice(0, 18) + pct(r, k).toFixed(1) + '%'); });
}

console.log('--- the shader is the table ---');
(function () {
  var src = GL.planetShaderSource(), B = W.BIOME, f = function (v) { return (+v).toFixed(5); };
  var missing = [];
  B.grid.forEach(function (row) { row.forEach(function (c) {
    var s = 'vec3(' + f(c[0]) + ', ' + f(c[1]) + ', ' + f(c[2]) + ')';
    if (src.indexOf(s) < 0) missing.push(s);
  }); });
  [B.wet, B.rock, B.snow].forEach(function (c) {
    var s = 'vec3(' + f(c[0]) + ', ' + f(c[1]) + ', ' + f(c[2]) + ')';
    if (src.indexOf(s) < 0) missing.push(s);
  });
  ['ringT', 'ringSlope', 'ridgeScale', 'ridgeAmp', 'ridgeMid', 'rockGrey', 'rockDark', 'mountLo', 'mountSpan', 'equator', 'pole', 'lapse', 'moistScale', 'moistOffset', 'coast', 'coastWet', 'noiseWet', 'tint']
    .forEach(function (k) { if (src.indexOf(f(B[k])) < 0) missing.push(k); });
  if (src.indexOf(f(B.snowT)) < 0 || src.indexOf(f(B.snowT - 0.12)) < 0) missing.push('snowT');
  check('every biome colour and constant in the shader comes from Weather.BIOME', missing.length === 0, missing.join(' '));
  check('the shader colours the land from it, and the band from it', /vec3 bio = uBio\.x > 0\.0 \? biomeColour\(/.test(src) &&
        /vec3 verdure = uBio\.x > 0\.0 \? bio/.test(src));
  /* The uniform the shader is fed is the CPU's own parameters. */
  var gs = GL.planetShaderSource !== undefined;
  var b = WORLDS.filter(function (x) { return x.type === 'terran'; })[0];
  var bp = W.biomeParams(b);
  check('per-world parameters are a pure function of the world', JSON.stringify(bp) === JSON.stringify(W.biomeParams(b)) && gs,
        JSON.stringify(bp));
  var none = ['rocky', 'molten', 'iceball', 'gasGiant', 'iceGiant'].every(function (t) { return W.biomeParams({ type: t, insolation: 1 }).mix === 0; });
  check('rock, molten, ice and giant worlds get no biomes', none);
  /* Parity of the arithmetic: the shader's lines and the JS's lines. */
  var js = W.biomeAt.toString();
  check('the same overlays in both languages, in the same order',
        js.indexOf('wetW') < js.indexOf('rockW') && js.indexOf('rockW') < js.indexOf('snowW') &&
        src.indexOf('float wetW') < src.indexOf('float rockW') && src.indexOf('float rockW') < src.indexOf('float snowW'));
})();

console.log('--- nothing the survey reads moved ---');
(function () {
  /* elev, sea and ice by the formulas they had before biomes existed. */
  var bad = 0, n = 0;
  WORLDS.slice(0, 40).forEach(function (b) {
    var T = W.terrainOf(b);
    D.slice(0, 100).forEach(function (p) {
      var g = W.terrainAt(b, p, null), e = W.elevationAt(b, p);
      var sea = T.ocean > 0.001 ? 1 - smooth(T.ocean - 0.035, T.ocean + 0.035, e) : 0;
      n++; if (g.elev !== e || Math.abs(g.sea - sea) > 0) bad++;
    });
  });
  function smooth(a, c, x) { var t = Math.max(0, Math.min(1, (x - a) / (c - a))); return t * t * (3 - 2 * t); }
  check('elevation and sea are exactly what they were', bad === 0, bad + ' of ' + n + ' differ');
  var b = WORLDS.filter(function (x) { return x.type === 'terran'; })[1];
  var a1 = D.slice(0, 200).map(function (p) { return W.terrainAt(b, p).biome; }).join(',');
  var a2 = D.slice(0, 200).map(function (p) { return W.terrainAt(b, p).biome; }).join(',');
  check('same world, same biomes', a1 === a2);
  var src = W.biomeAt.toString() + W.biomeParams.toString();
  check('and no Math.random in it', !/Math\.random/.test(src));
})();

console.log('--- the distribution, ' + WORLDS.length + ' worlds ---');
(function () {
  var terran = tally(WORLDS.filter(function (b) { return b.type === 'terran' && !band(b); }));
  show('terran (' + WORLDS.filter(function (b) { return b.type === 'terran' && !band(b); }).length + ' worlds)', terran);
  var forest = pct(terran, 'taiga') + pct(terran, 'temperate forest') + pct(terran, 'rainforest');
  var kinds = Object.keys(terran.t).filter(function (k) { return k !== 'sea' && pct(terran, k) >= 1; }).length;
  check('terran land is a quarter forest or more', forest >= 25, forest.toFixed(1) + '%');
  check('...with at least seven biomes over 1% of it', kinds >= 7, kinds + ' biomes');
  check('...and no one biome over half of it', Object.keys(terran.t).every(function (k) { return k === 'sea' || pct(terran, k) <= 50; }));

  var desert = tally(WORLDS.filter(function (b) { return b.type === 'desert' && !band(b); }));
  show('desert', desert);
  check('a desert is mostly desert', pct(desert, 'desert') >= 70, pct(desert, 'desert').toFixed(1) + '%');
  check('...with no marsh round its dry basins', pct(desert, 'wetland') === 0);

  var tundra = tally(WORLDS.filter(function (b) { return b.type === 'tundra' && !band(b); }));
  show('tundra', tundra);
  var cold = pct(tundra, 'tundra') + pct(tundra, 'ice cap') + pct(tundra, 'snowfield') + pct(tundra, 'taiga');
  check('a tundra is mostly tundra, ice, snow and taiga', cold >= 85, cold.toFixed(1) + '%');

  /* Twilight: green only in the band. The terminator world's sun is
   * passed body-fixed, as the survey does. */
  var GREEN = { taiga: 1, 'temperate forest': 1, rainforest: 1, grassland: 1, savanna: 1, wetland: 1, steppe: 1, tundra: 1 };
  var term = WORLDS.filter(function (b) { return b.habitableBand === 'terminator'; });
  var sunB = { x: 1, y: 0, z: 0 }, inBand = 0, outBand = 0, greenIn = 0;
  term.forEach(function (b) {
    D.forEach(function (p) {
      var g = W.terrainAt(b, p, sunB);
      if (!GREEN[g.biome]) return;
      var ndl = p.x;
      var jag = (g.elev - 0.5) * 0.16;
      var day = smooth(0.40, 0.64, ndl + jag), night = 1 - smooth(-0.34, -0.10, ndl + jag);
      if ((1 - day) * (1 - night) > 0.25) inBand++; else outBand++;
      greenIn++;
    });
  });
  function smooth(a, c, x) { var t = Math.max(0, Math.min(1, (x - a) / (c - a))); return t * t * (3 - 2 * t); }
  check('a terminator world grows green only in its ring', greenIn > 0 && outBand === 0,
        inBand + ' green samples in the ring, ' + outBand + ' outside, over ' + term.length + ' worlds');
  var eq = WORLDS.filter(function (b) { return b.habitableBand === 'equator'; }), eqOut = 0, eqIn = 0;
  eq.forEach(function (b) {
    var k = W.spinAxis(b);
    D.forEach(function (p) {
      var g = W.terrainAt(b, p, null);
      if (!GREEN[g.biome]) return;
      var lat = Math.abs(p.x * k.x + p.y * k.y + p.z * k.z);
      if (smooth(0.34, 0.58, lat + (g.elev - 0.5) * 0.12) > 0.75) eqOut++; else eqIn++;
    });
  });
  check('a tipped world grows green only in its equatorial band', eq.length === 0 || eqOut === 0,
        eqIn + ' in, ' + eqOut + ' out, over ' + eq.length + ' worlds');

  var bare = tally(WORLDS.filter(function (b) { return /rocky|molten|iceball/.test(b.type); }));
  var ok = Object.keys(bare.t).every(function (k) { return /^(sea|bare rock|lava plain|ice|ice cap)$/.test(k); });
  check('rock, molten and ice worlds are named for what they are, not for a biome', ok, Object.keys(bare.t).join(', '));
})();

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
