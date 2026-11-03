/* weather.test.js — the sky a port reports, and the sky it is drawn with.
 *
 *     node test/weather.test.js
 *
 * gl.js paints a world's weather in a fragment shader and weather.js
 * evaluates the same field on the CPU so a port can say what it is like
 * down there. The functions have to exist twice, in two languages; the
 * NUMBERS must not. Most of this file is about that.
 */
global.window = global;
var Eco = require('../src/economy.js');
var Gen = require('../src/generate.js');
var Sim = require('../src/sim.js');
var W = require('../src/weather.js');
var GL = require('../src/gl.js');

var pass = 0, fail = 0;
function check(n, c, d) { if (c) pass++; else { fail++; console.log('  FAIL  ' + n + (d ? '   ' + d : '')); } }

console.log('--- one copy of every number ---');
(function () {
  var src = GL.planetShaderSource();
  check('the planet shader was built', src.length > 2000, src.length + ' chars');
  check('and no placeholder survived it', !/@[A-Z0-9_]+@/.test(src),
        (src.match(/@[A-Z0-9_]+@/g) || []).join(','));
  /* Every tunable weather.js owns has to be the number the picture uses.
   * Hand-edit one in the shader and the literal stops matching. */
  /* Two of them are consumed as JAVASCRIPT rather than interpolated —
   * gl.js reads FLASH_BUCKET to index the storm clock, and the clock's own
   * arithmetic lives in weather.js. Exempted by name instead of by luck:
   * FLASH_BUCKET is 0.9 and so is W1, so a string search finds it either
   * way and would have gone on passing after the reason stopped being
   * true. */
  var JS_ONLY = { FLASH_BUCKET: 1 };
  var missing = [];
  Object.keys(W.K).forEach(function (k) {
    if (JS_ONLY[k]) return;
    if (src.indexOf(W.K[k].toFixed(5)) < 0) missing.push(k + '=' + W.K[k]);
  });
  check('every weather constant in the picture came from weather.js',
        missing.length === 0, missing.join(', '));
})();

console.log('--- the field, ported faithfully ---');
(function () {
  /* The thresholds were chosen against this distribution, measured on the
   * shader's arithmetic. If the JS port drifts from it the numbers stop
   * meaning what they were picked to mean — so the distribution is the
   * thing to pin, not the implementation. */
  var vals = [];
  for (var s = 0; s < 30; s++) {
    var seed = s * 1.7 * 37.13;
    for (var i = 0; i < 4000; i++) {
      var u = (i * 2654435761 % 100000) / 50000 - 1;
      var th = (i * 40503 % 100000) / 100000 * Math.PI * 2;
      var r = Math.sqrt(Math.max(0, 1 - u * u));
      vals.push(W.fbm(r * Math.cos(th) * 2.4 + seed,
                      r * Math.sin(th) * 2.4 + seed, u * 2.4 + seed));
    }
  }
  var mean = vals.reduce(function (a, b) { return a + b; }, 0) / vals.length;
  var sd = Math.sqrt(vals.reduce(function (a, b) {
    return a + (b - mean) * (b - mean); }, 0) / vals.length);
  var max = Math.max.apply(null, vals.slice(0, 60000));
  console.log('  mean ' + mean.toFixed(4) + '  sd ' + sd.toFixed(4) +
              '  max ' + max.toFixed(3) + '  (' + vals.length + ' samples)');
  check('the field still averages what the thresholds were picked against',
        Math.abs(mean - 0.470) < 0.012, mean.toFixed(4));
  check('and still has the spread they were picked against',
        Math.abs(sd - 0.105) < 0.012, sd.toFixed(4));
  /* THE TRAP THE OLD MAPPING FELL INTO. Thresholds above this are
   * thresholds nothing ever clears, and a world with no weather. */
  check('and never reaches the thresholds the old mapping asked for',
        max < 0.86 && W.K.THRESH_HI < max, max.toFixed(3) + ' vs ' + W.K.THRESH_HI);
})();

console.log('--- what a port says about its own sky ---');
(function () {
  var seeds = ['kawartha', 'elsewhere', 'holton', 'seed-9',
               'mirven', 'thalisa', 'zueth', 'seed-22', 'seed-31'];
  var ports = [];
  seeds.forEach(function (sd) {
    var sys = Gen.generateSystem(sd);
    sys.ports.forEach(function (p) { if (W.hasWeather(p)) ports.push({ p: p, sys: sys }); });
  });
  check('there are ports with air over them', ports.length > 8, ports.length + ' ports');
  if (!ports.length) return;

  /* PURE, like everything else that moves here: the sky at an hour is a
   * fact about the hour. */
  var a = W.report(ports[0].p, ports[0].sys, 12345);
  var b = W.report(ports[0].p, ports[0].sys, 12345);
  check('a given hour gives a given forecast',
        a.cloud === b.cloud && a.wind === b.wind && a.from === b.from);
  /* And it MOVES. Asking one later hour is not enough — a pad under clear
   * sky reads zero at both ends and the check passes on a frozen field. */
  var seenCloud = {}, seenWind = {};
  for (var q = 0; q < 24; q++) {
    var rq = W.report(ports[0].p, ports[0].sys, q * 2700);
    seenCloud[rq.cloud.toFixed(5)] = 1;
    seenWind[rq.wind.toFixed(4)] = 1;
  }
  check('and the air over a pad is never still for a day',
        Object.keys(seenWind).length > 8,
        Object.keys(seenWind).length + ' distinct winds in 24 readings');
  /* Cloud is a threshold, so a pad under permanently clear sky honestly
   * reads zero all day — asking ONE pad to see cloud move is asking the
   * weather to be somewhere in particular. Ask the cloudiest pad in the
   * sample instead, which is the one the question is about. */
  var wettest = null, wettestC = -1;
  ports.forEach(function (e) {
    var c = e.p.parentBody.atmosphere.cloud;
    if (c > wettestC) { wettestC = c; wettest = e; }
  });
  var skies = {};
  for (var q2 = 0; q2 < 40; q2++) {
    skies[W.report(wettest.p, wettest.sys, q2 * 2700).cloud.toFixed(4)] = 1;
  }
  check('and the cloud over the wettest world moves',
        Object.keys(skies).length > 6,
        Object.keys(skies).length + ' skies over 30 h at cloud ' + wettestC.toFixed(2));

  var cloudy = 0, stormy = 0, windLo = 1e9, windHi = 0, bad = 0, n = 0;
  var byWorld = {};
  ports.forEach(function (e) {
    for (var k = 0; k < 24; k++) {
      var r = W.report(e.p, e.sys, k * 3600);
      if (!r || r.airless) continue;
      n++;
      if (r.cloud > 0.5) cloudy++;
      if (r.storm > 0.3) stormy++;
      if (r.wind < windLo) windLo = r.wind;
      if (r.wind > windHi) windHi = r.wind;
      if (!(r.from >= 0 && r.from < 360)) bad++;
      if (!(r.vis >= 0 && r.vis <= 1)) bad++;
      var cv = e.p.parentBody.atmosphere.cloud;
      var g = byWorld[cv > 0.5 ? 'wet' : 'dry'] || (byWorld[cv > 0.5 ? 'wet' : 'dry'] = [0, 0]);
      g[0] += r.cloud; g[1]++;
    }
  });
  check('every reading is a real reading', bad === 0, bad + ' out of range');
  console.log('  ' + n + ' readings: ' + (100 * cloudy / n).toFixed(0) + '% over half cloud, ' +
              (100 * stormy / n).toFixed(0) + '% under a storm, wind ' +
              windLo.toFixed(1) + '-' + windHi.toFixed(1) + ' m/s');
  check('some skies are cloudy and some are not',
        cloudy > n * 0.04 && cloudy < n * 0.85, cloudy + ' of ' + n);
  check('storms are rarer than cloud', stormy < cloudy);
  check('the wind is a wind, not a hurricane everywhere',
        windLo >= 0 && windHi < 120, windLo.toFixed(1) + ' to ' + windHi.toFixed(1));
  /* The world's own cloudiness has to reach the forecast, or the column in
   * the generator is inert again — which is exactly the bug that made
   * every planet cloudless. */
  if (byWorld.wet && byWorld.dry) {
    var wet = byWorld.wet[0] / byWorld.wet[1], dry = byWorld.dry[0] / byWorld.dry[1];
    check('a wet world reports more cloud than a dry one', wet > dry * 1.4,
          wet.toFixed(3) + ' vs ' + dry.toFixed(3));
  }

  /* AND IT NEVER CALLS A VACUUM CLEAR. */
  var airless = null, sys0 = Gen.generateSystem('kawartha');
  sys0.ports.forEach(function (p) {
    if (!airless && p.parentBody && !p.parentBody.atmosphere &&
        (p.surface || p.underground)) airless = p;
  });
  if (airless) {
    var r = W.report(airless, sys0, 1000);
    check('a port with no air says so', r && r.airless);
    check('and is never described as clear', W.describe(r).indexOf('clear') < 0,
          W.describe(r));
  }
  check('a forecast reads as a sentence', /wind \d+ m\/s from \d{3}/.test(W.describe(a)),
        W.describe(a));
})();

console.log('--- flying into it ---');
(function () {
  /* The deck is a PLACE: above it you look down on the top, inside it the
   * window fills, below it the rain falls on you. Getting the third of
   * those backwards is what the first version did — it faded the weather
   * out as you descended, so five kilometres up under a solid overcast
   * reported rain 0.03 and gloom 0.04: a sunny afternoon beneath a black
   * sky. */
  var sys = null, body = null;
  ['kawartha', 'elsewhere', 'holton', 'seed-9', 'mirven'].forEach(function (sd) {
    if (body) return;
    var s2 = Gen.generateSystem(sd);
    var b2 = s2.bodies.filter(function (x) {
      return x.kind === 'planet' && x.atmosphere && x.atmosphere.cloud > 0.5; })[0];
    if (b2) { sys = s2; body = b2; }
  });
  check('there is a cloudy world to fly into', !!body, body && body.name);
  if (!body) return;

  var air = body.atmosphere, t = 4000;
  var st = Sim.bodyState(body, sys, t);
  /* Stand over the thickest cloud we can find, so the readings are about
   * the deck and not about a gap in it. */
  var best = null;
  for (var i = 0; i < 500; i++) {
    var th = i * 0.61, ph = Math.acos(1 - 2 * ((i * 0.37) % 1));
    var d = { x: Math.sin(ph) * Math.cos(th), y: Math.sin(ph) * Math.sin(th), z: Math.cos(ph) };
    var probe = { pos: { x: st.pos.x + d.x * (body.radius + air.top * 0.18),
                         y: st.pos.y + d.y * (body.radius + air.top * 0.18),
                         z: st.pos.z + d.z * (body.radius + air.top * 0.18) } };
    var r0 = W.aloft(probe, sys, t);
    if (r0 && (!best || r0.cloud > best.c)) best = { d: d, c: r0.cloud };
  }
  check('and somewhere thick to fly into', best && best.c > 0.6,
        best ? best.c.toFixed(2) : 'none');
  if (!best) return;

  function at(alt) {
    return W.aloft({ pos: { x: st.pos.x + best.d.x * (body.radius + alt),
                            y: st.pos.y + best.d.y * (body.radius + alt),
                            z: st.pos.z + best.d.z * (body.radius + alt) } }, sys, t);
  }
  var lo = air.top * W.DECK_LO, hi = air.top * W.DECK_HI;
  var above = at(hi * 2.6), inside = at((lo + hi) / 2), under = at(lo * 0.4), ground = at(0.2);
  console.log('  deck ' + lo.toFixed(0) + '-' + hi.toFixed(0) + ' km   ' +
              'above rain ' + above.rain.toFixed(2) + '  in ' + inside.inCloud.toFixed(2) +
              '  under ' + under.rain.toFixed(2) + '  ground ' + ground.rain.toFixed(2));

  check('above the deck there is no weather on you', above.rain < 0.02 && above.gloom < 0.02,
        'rain ' + above.rain.toFixed(3) + ' gloom ' + above.gloom.toFixed(3));
  check('inside it the window fills', inside.inCloud > 0.5, inside.inCloud.toFixed(2));
  check('under it, it is raining', under.rain > 0.2, under.rain.toFixed(2));
  /* THE ONE THE FIRST VERSION FAILED. Descending must not clear the sky. */
  check('and it is still raining at the ground', ground.rain >= under.rain * 0.95,
        under.rain.toFixed(3) + ' at ' + (lo * 0.4).toFixed(1) + ' km -> ' +
        ground.rain.toFixed(3) + ' at 0.2 km');
  check('and still dark under it', ground.gloom > 0.2, ground.gloom.toFixed(2));
  check('you are not in cloud once you are under it', under.inCloud < 0.1,
        under.inCloud.toFixed(2));

  /* Pure, like the rest. */
  var a1 = at(lo * 0.5), a2 = at(lo * 0.5);
  check('and the sky you fly into is a fact about the hour',
        a1.rain === a2.rain && a1.gloom === a2.gloom);

  /* Out in space there is no weather to be in, and asking must not throw. */
  check('there is no weather in orbit',
        W.aloft({ pos: { x: st.pos.x + 1e6, y: st.pos.y, z: st.pos.z } }, sys, t) === null);
})();

console.log('--- the pace of a storm ---');
(function () {
  var K = W.K, TAU = Math.PI * 2;

  /* Stateless and deterministic, like the rest of the file: the sky at a
   * time is a fact about that time, so flying away and coming back finds
   * the same storm mid-flash. */
  check('the clock is a pure function of t',
        JSON.stringify(W.stormClock(9999.25)) === JSON.stringify(W.stormClock(9999.25)));
  var c0 = W.stormClock(0);
  check('the phase is a proper fraction of a slot',
        c0.phase >= 0 && c0.phase < 1);
  check('and it sweeps the slot', Math.abs(W.stormClock(K.FLASH_BUCKET * 0.5).phase - 0.5) < 1e-9);

  /* THE IMUL FIX. The old salt multiplied the slot index by 374761393 in a
   * double and claimed to be exact for any career; it left 2^53 after about
   * eight months of sim time and began dropping low bits, which would have
   * shown up as the storms going quietly periodic. */
  var far = W.stormClock(3600 * 24 * 365 * 40);
  check('a slot forty years in still salts inside the unit interval',
        far.salt.every(function (v) { return v >= 0 && v < 1; }),
        far.salt.map(function (v) { return v.toFixed(4); }).join(', '));
  check('and distinct slots get distinct salts out there',
        JSON.stringify(far.salt) !==
        JSON.stringify(W.stormClock(3600 * 24 * 365 * 40 + K.FLASH_BUCKET).salt));
  check('the previous slot is the previous slot',
        JSON.stringify(W.stormClock(1000).saltPrev) ===
        JSON.stringify(W.stormClock(1000 - K.FLASH_BUCKET).salt));

  /* The cycle is the product of the rhythms, which requires them to be
   * pairwise co-prime — that is the only reason the product is also the
   * least common multiple. */
  function gcd(a, b) { return b ? gcd(b, a % b) : a; }
  var coprime = true;
  for (var i = 0; i < W.FLASH_RHYTHMS.length; i++) {
    for (var j = i + 1; j < W.FLASH_RHYTHMS.length; j++) {
      if (gcd(W.FLASH_RHYTHMS[i], W.FLASH_RHYTHMS[j]) !== 1) coprime = false;
    }
  }
  check('the four rhythms are pairwise co-prime', coprime, W.FLASH_RHYTHMS.join(','));
  var product = W.FLASH_RHYTHMS.reduce(function (a, b) { return a * b; }, 1);
  check('so the cycle is their product', W.FLASH_CYCLE === product);
  var years = W.FLASH_CYCLE * K.FLASH_BUCKET / (3600 * 24 * 365.25);
  check('which is long enough that nobody will catch it repeating',
        years > 1000, Math.round(years) + ' years of sim time');
  check('and it is exact in doubles', W.FLASH_CYCLE < Math.pow(2, 53));

  /* ---- and now the thing Astra actually asked for -------------------
   * The old schedule fired every stroke at the top of its slot, so the
   * sky kept a 0.9 s beat. These two checks are the beat being gone and
   * the gaps looking like weather instead of like a clock. The shader's
   * per-cell decision is reproduced here, which is what putting the clock
   * in weather.js bought. */
  function fract(x) { return x - Math.floor(x); }
  function h13(x, y, z) {
    x = fract(x * 0.3183099 + 0.71);
    y = fract(y * 0.3183099 + 0.113);
    z = fract(z * 0.3183099 + 0.419);
    var d = x * (y + 19.19) + y * (z + 19.19) + z * (x + 19.19);
    x += d; y += d; z += d;
    return fract((x + y) * z);
  }
  function gapsOf(cid, seconds) {
    var cph = [[1.3, 0], [2.1, 7], [3.7, 13], [5.3, 19]].map(function (m) {
      return h13(cid[0] * m[0] + m[1], cid[1] * m[0] + m[1], cid[2] * m[0] + m[1]) * TAU;
    });
    var times = [], rising = false;
    for (var t = 0; t < seconds; t += 0.02) {
      var c = W.stormClock(t);
      var act = 0.25 * (Math.sin(c.slow[0] + cph[0]) + Math.sin(c.slow[1] + cph[1]) +
                        Math.sin(c.slow[2] + cph[2]) + Math.sin(c.slow[3] + cph[3]));
      var thr = K.FLASH_QUIET + (K.FLASH_DUTY - K.FLASH_QUIET) * (0.5 + 0.5 * act);
      var lit = 0;
      for (var k = 0; k < 2; k++) {
        var sl = k === 0 ? c.salt : c.saltPrev;
        if (h13(cid[0] + sl[0] * 37, cid[1] + sl[1] * 37, cid[2] + sl[2] * 37) < thr) continue;
        var tt = c.phase + k - h13(cid[0] * 3.1 + sl[1] * 29, cid[1] * 3.1 + sl[2] * 29,
                                   cid[2] * 3.1 + sl[0] * 29) * K.FLASH_JITTER;
        if (tt <= 0) continue;
        var g1 = 0.04 + 0.16 * h13(cid[0] * 4.3 + sl[0] * 11, cid[1] * 4.3 + sl[1] * 11,
                                   cid[2] * 4.3 + sl[2] * 11);
        lit = Math.max(lit, Math.exp(-tt * 7) + 0.75 * Math.exp(-Math.abs(tt - g1) * 24));
      }
      if (!rising && lit > 0.25) { rising = true; times.push(t); }
      else if (rising && lit < 0.15) rising = false;
    }
    var g = [];
    for (var i2 = 1; i2 < times.length; i2++) g.push(times[i2] - times[i2 - 1]);
    return g;
  }

  var gaps = [];
  for (var cc = 0; cc < 4; cc++) {
    gaps = gaps.concat(gapsOf([cc * 3 + 1, cc * 5 + 2, cc * 7 + 3], 900));
  }
  check('(fixture) the cells flash often enough to measure', gaps.length > 300,
        gaps.length + ' gaps');

  var mean = gaps.reduce(function (a, b) { return a + b; }, 0) / gaps.length;
  var sd = Math.sqrt(gaps.reduce(function (a, b) {
    return a + (b - mean) * (b - mean);
  }, 0) / gaps.length);
  var cv = sd / mean;
  /* A metronome has cv 0; a Poisson process has cv 1, which is what real
   * inter-flash intervals look like. Measured at 1.01 when this landed. */
  check('the gaps are spread like a Poisson process, not like a clock',
        cv > 0.7, 'cv ' + cv.toFixed(2) + ' (0 = metronome, 1 = exponential)');

  /* THE BEAT IS GONE. If strokes still began at slot tops, every gap would
   * be a whole number of slots and this would be ~100%. Chance is about
   * 11% for a 50 ms window in a 0.9 s slot. */
  var onGrid = gaps.filter(function (g2) {
    var m = g2 % K.FLASH_BUCKET;
    return m < 0.05 || m > K.FLASH_BUCKET - 0.05;
  }).length;
  var pctGrid = 100 * onGrid / gaps.length;
  check('and the flashes no longer land on the slot grid',
        pctGrid < 25, pctGrid.toFixed(1) + '% within 50 ms of a whole slot, 11% is chance');
})();

/* ---- an overcast from underneath (2026-11-03) ------------------------------
 * The sea polish kept the painted deck off the ground below 3 km of eye
 * height, and the ground sky had no weather, so an overcast day looked
 * clear from the street. Weather.overhead is the cover at a place and hour;
 * GLWorld.overcastFor turns it into the ground sky's shading inputs. These
 * read the INPUTS (GLWorld.groundSkyInputs), not pixels. */
console.log('--- an overcast from underneath ---');
(function () {
  var seeds = ['kawartha', 'elsewhere', 'holton', 'seed-9', 'mirven', 'thalisa', 'zueth', 'seed-22', 'seed-31'];
  var ports = [];
  seeds.forEach(function (sd) {
    var sys = Gen.generateSystem(sd);
    sys.ports.forEach(function (p) {
      if (W.hasWeather(p) && p.surface && p.parentBody.atmosphere.cloud > 0) ports.push({ p: p, sys: sys });
    });
  });
  check('ports with weather over them, to stand under', ports.length > 8, ports.length + ' ports');
  /* An hour of each kind at the same port: clear, broken, overcast. */
  var found = null;
  ports.some(function (e) {
    var gb = Sim.groundBasis(e.p, e.sys, 0);
    var kinds = {};
    for (var q = 0; q < 600 && !(kinds.clear && kinds.broken && kinds.over); q++) {
      var t = q * 3600, g = Sim.groundBasis(e.p, e.sys, t);
      var wx = W.overhead(e.p.parentBody, g.up, t);
      if (!wx) break;
      if (wx.cloud < 0.02 && !kinds.clear) kinds.clear = { t: t, wx: wx, up: g.up };
      else if (wx.cloud > 0.35 && wx.cloud < 0.65 && !kinds.broken) kinds.broken = { t: t, wx: wx, up: g.up };
      else if (wx.cloud > 0.9 && !kinds.over) kinds.over = { t: t, wx: wx, up: g.up };
    }
    if (kinds.clear && kinds.broken && kinds.over) { found = { e: e, k: kinds }; return true; }
    return false;
  });
  check('one port has a clear, a broken and an overcast hour in 600', !!found, found && found.e.p.name);
  if (!found) return;
  var host = found.e.p.parentBody, k = found.k;

  /* The same field the forecast reads, at the same point. */
  var rep = W.report(found.e.p, found.e.sys, k.over.t);
  check('overhead is the cover the port\'s own forecast gives', Math.abs(rep.cloud - k.over.wx.cloud) < 1e-6,
        rep.cloud.toFixed(4) + ' vs ' + k.over.wx.cloud.toFixed(4));

  function inputs(kind, sunUp) {
    var up = k[kind].up;
    /* A sun at the given height, in the plane of up and any horizontal. */
    var h = Math.abs(up.z) < 0.9 ? { x: 0, y: 0, z: 1 } : { x: 1, y: 0, z: 0 };
    var hz = { x: up.y * h.z - up.z * h.y, y: up.z * h.x - up.x * h.z, z: up.x * h.y - up.y * h.x };
    var hl = Math.sqrt(hz.x * hz.x + hz.y * hz.y + hz.z * hz.z);
    var c = Math.sqrt(1 - sunUp * sunUp);
    var sun = { x: up.x * sunUp + hz.x / hl * c, y: up.y * sunUp + hz.y / hl * c, z: up.z * sunUp + hz.z / hl * c };
    GL.setGroundSky(host, up, sun, k[kind].wx);
    var got = GL.groundSkyInputs();
    return { over: got.over, fill: got.fill, sky: GL.skyOver(host, up, sun, k[kind].wx),
             clearSky: GL.skyOver(host, up, sun), up: up, sun: sun };
  }
  var noon = { clear: inputs('clear', 0.85), broken: inputs('broken', 0.85), over: inputs('over', 0.85) };
  ['clear', 'broken', 'over'].forEach(function (kind) {
    var o = noon[kind].over, wx = k[kind].wx;
    check(kind + ': the sky\'s cover is Weather\'s, unchanged', o.cover === wx.cloud && o.storm === wx.storm,
          o.cover.toFixed(4));
    check(kind + ': its brightness is Weather\'s gloom (the canopy wash\'s number)', Math.abs(o.skyK - (1 - 0.45 * wx.gloom)) < 1e-12 &&
          Math.abs(wx.gloom - W.gloomOf(wx)) < 1e-12);
  });
  var c = noon.clear.over, b = noon.broken.over, o = noon.over.over;
  check('clear: full sun, no deck light, nothing hidden', c.sunK > 0.98 && c.diffuse < 0.005 && c.veil < 0.02,
        'sun ' + c.sunK.toFixed(3));
  check('broken cloud sits between clear and overcast - it scales with the cover',
        c.sunK > b.sunK && b.sunK > o.sunK && c.diffuse < b.diffuse && b.diffuse < o.diffuse && c.veil < b.veil && b.veil < o.veil,
        'sun ' + [c.sunK, b.sunK, o.sunK].map(function (x) { return x.toFixed(2); }).join(' > '));
  /* The mesh shader's own terms: sun side 0.26 + 0.70 sunK + fill, shade
   * side 0.26 + fill. Flatter is the point. */
  function contrast(n) { var f = n.fill[1]; return (0.26 + 0.70 * n.over.sunK + f) / (0.26 + f); }
  check('overcast: the direct sun is mostly gone, and sun side and shade side nearly meet',
        o.sunK < 0.2 && o.diffuse > 0.12 && contrast(noon.over) < 1.25 && contrast(noon.clear) > 2.0,
        'sun ' + o.sunK.toFixed(2) + ', diffuse ' + o.diffuse.toFixed(2) + ', lit:shade ' +
        contrast(noon.clear).toFixed(2) + ' -> ' + contrast(noon.broken).toFixed(2) + ' -> ' + contrast(noon.over).toFixed(2));
  check('overcast: the sun itself is behind it', o.veil > 0.85, o.veil.toFixed(2));
  function sat(rgb) { var mx = Math.max(rgb[0], rgb[1], rgb[2]), mn = Math.min(rgb[0], rgb[1], rgb[2]); return mx > 0 ? (mx - mn) / mx : 0; }
  function lum(rgb) { return 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]; }
  var so = noon.over.sky, sc0 = noon.over.clearSky;
  check('overcast: the sky is dimmer and greyer than a clear one at the same sun',
        lum(so) < lum(sc0) && sat(so) < sat(sc0) * 0.6,
        'lum ' + lum(sc0).toFixed(2) + ' -> ' + lum(so).toFixed(2) + ', sat ' + sat(sc0).toFixed(2) + ' -> ' + sat(so).toFixed(2));
  check('clear weather leaves the sky exactly as it was', noon.clear.sky.every(function (x, i) {
    return Math.abs(x - noon.clear.clearSky[i]) < 0.02; }));
  /* No weather handed over is a clear sky: the shaders get their old values. */
  GL.setGroundSky(host, noon.over.up, noon.over.sun);
  var none = GL.groundSkyInputs().over;
  check('no weather given: every shading input at its clear value', none.cover === 0 && none.sunK === 1 && none.diffuse === 0 && none.skyK === 1 && none.veil === 0);
  /* Dusk and night: the deck light is daylight, and the stars go. */
  var dusk = inputs('over', 0.03), night = inputs('over', -0.5);
  check('overcast dusk: less deck light than noon, and none at night',
        dusk.over.diffuse < o.diffuse && night.over.diffuse === 0, dusk.over.diffuse.toFixed(3) + ' / ' + night.over.diffuse);
  check('overcast night: no stars through it', night.sky.lit >= o.cover && night.clearSky.lit < 0.1,
        'lit ' + night.sky.lit.toFixed(2) + ' vs clear ' + night.clearSky.lit.toFixed(2));
  /* Airless: nothing to be overcast. */
  var bare = null;
  seeds.some(function (sd) { var sy = Gen.generateSystem(sd); return sy.bodies.some(function (bb) { if (bb.kind === 'planet' && !bb.atmosphere) { bare = bb; return true; } return false; }); });
  check('no air, no deck', !!bare && W.overhead(bare, { x: 0, y: 0, z: 1 }, 0) === null);
  /* The shader text: the deck is read from these, the film stays off the
   * ground (the edge-on shell the fade hides), and the ceiling fades into
   * its own mean toward the horizon rather than being drawn edge-on. */
  var src = require('fs').readFileSync(require('path').join(__dirname, '..', 'src', 'gl.js'), 'utf8');
  check('the painted deck stays off the ground below 3 km', /mask \*= smoothstep\(3\.0, 10\.0, sqrt\(dot\(oc, oc\)\) - uWorldRadius\)/.test(src));
  check('the ceiling goes to its mean toward the horizon', /float hz = smoothstep\(0\.10, 0\.40, e\);/.test(src) && /float op = mix\(cov, m, hz\)/.test(src));
  check('the ground, the sea, the meshes and the sun all read it',
        /if \(uSkyA\.w > 0\.0\) lam = lam \* uSkyC\.z \+ uSkyC\.w;/.test(src) &&
        /if \(uSkyA\.w > 0\.0\) l2 = l2 \* uSkyC\.z \+ uSkyC\.w;/.test(src) &&
        /0\.70 \* lam \* uSunK/.test(src) && /frag = vec4\(c, 1\.0 - uSkyVeil\)/.test(src));
  var msrc = require('fs').readFileSync(require('path').join(__dirname, '..', 'src', 'main.js'), 'utf8');
  check('main.js hands the ground sky Weather.overhead',
        /setGroundSky\(skyPort\.parentBody, skyGb\.up,\s*sunDirAt\(skyGb\.entrance\.pos\), overheadAt\(skyPort, skyGb\)\)/.test(msrc) &&
        /Weather\.overhead\(port\.parentBody, gb\.up, G\.t\)/.test(msrc));
})();

console.log('');
console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
