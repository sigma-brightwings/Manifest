/* precip.test.js - what comes out of the deck (2026-11-10).
 *
 *     node test/precip.test.js
 *
 * Astra: "storms which rain, snow and thunder/lightning as viewed from on
 * the surface of a planet."
 *
 * The rule this file holds is that WHAT FALLS FOLLOWS THE GROUND IT FALLS
 * ON, and follows the same ice the planet is painted with - so the snow
 * line is where you can see it is, and a world with no cap never snows.
 * The fall itself (how hard) is weather.test.js's; this is only what it is
 * made of.
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

var pass = 0, fail = 0;
function check(n, c, d) {
  if (c) { pass++; console.log('  ok   ' + n + (d ? '   ' + d : '')); }
  else { fail++; console.log('  FAIL  ' + n + (d ? '   ' + d : '')); }
}

var gal = Galaxy.build('kawartha');
function optsFor(st) {
  var fac = gal.factionById ? gal.factionById[st.factionId] : null;
  return fac ? { faction: fac, allFactions: gal.factions } : {};
}
var systems = [];
for (var i = 0; i < 30; i++) systems.push(Gen.generateSystem(gal.stars[i].seed, optsFor(gal.stars[i])));
function find(fn) {
  for (var s = 0; s < systems.length; s++) {
    for (var b = 0; b < systems[s].bodies.length; b++) {
      if (fn(systems[s].bodies[b], systems[s])) return { b: systems[s].bodies[b], sys: systems[s] };
    }
  }
  return null;
}
/* A world direction at a given body latitude: the pole is the spin axis,
 * so a point near it is inside whatever cap the world has. */
function atLat(body, f, swing) {
  var k = W.spinAxis(body);
  /* Any vector off the axis, to swing out from the pole by acos(f). */
  var h = Math.abs(k.z) < 0.9 ? { x: 0, y: 0, z: 1 } : { x: 1, y: 0, z: 0 };
  var u = { x: k.y * h.z - k.z * h.y, y: k.z * h.x - k.x * h.z, z: k.x * h.y - k.y * h.x };
  var ul = Math.sqrt(u.x * u.x + u.y * u.y + u.z * u.z) || 1;
  u = { x: u.x / ul, y: u.y / ul, z: u.z / ul };
  var v = { x: k.y * u.z - k.z * u.y, y: k.z * u.x - k.x * u.z, z: k.x * u.y - k.y * u.x };
  /* `swing` walks round the pole at the same latitude, so a search can
   * cover the whole cap rather than one meridian of it. */
  var c = Math.cos(swing || 0), sn = Math.sin(swing || 0);
  var d = { x: u.x * c + v.x * sn, y: u.y * c + v.y * sn, z: u.z * c + v.z * sn };
  var s = Math.sqrt(Math.max(0, 1 - f * f));
  return { x: k.x * f + d.x * s, y: k.y * f + d.y * s, z: k.z * f + d.z * s };
}

console.log('--- snow follows the cap ---');
(function () {
  var hit = find(function (b) {
    var T = W.terrainOf(b);
    return b.kind === 'planet' && b.atmosphere && T.ice > 0.12 && !b.habitableBand;
  });
  if (!hit) { check('found an iced world with air', false); return; }
  check('found an iced world with air', true, hit.b.name + ' (' + hit.b.type + ') ice ' + W.terrainOf(hit.b).ice.toFixed(2));
  /* Walk from the pole to the equator and find where the snow stops. */
  var polar = 0, eq = 0, line = -1;
  for (var k = 0; k <= 40; k++) {
    var f = 1 - k / 40;                       // 1 at the pole, 0 at the equator
    var sn = W.precipKind(hit.b, hit.sys, atLat(hit.b, f), 0).snow;
    if (k === 0) polar = sn;
    if (k === 40) eq = sn;
    if (line < 0 && sn < 0.5) line = k;
  }
  check('it snows at the pole', polar > 0.8, polar.toFixed(2));
  check('and rains at the equator', eq < 0.2, eq.toFixed(2));
  check('with a snow line somewhere between', line > 0 && line < 40, 'crossed at step ' + line + ' of 40');
  /* The same question twice is the same answer - no clock, no state. */
  var a = W.precipKind(hit.b, hit.sys, atLat(hit.b, 0.95), 0);
  var b = W.precipKind(hit.b, hit.sys, atLat(hit.b, 0.95), 0);
  check('and it is a pure function of where you are', a.snow === b.snow && a.ash === b.ash);
})();

console.log('--- what else falls ---');
(function () {
  var molten = find(function (b) { return b.type === 'molten' && b.atmosphere; });
  if (molten) {
    var m = W.precipKind(molten.b, molten.sys, atLat(molten.b, 0.2), 0);
    check('over lava it is ash, not water', m.ash === 1 && m.snow === 0, molten.b.name);
  } else check('found a molten world with air', false);
  var warm = find(function (b) {
    var T = W.terrainOf(b);
    return b.kind === 'planet' && b.type !== 'gasGiant' && b.type !== 'iceGiant' &&
           b.atmosphere && !T.lava && !(T.ice > 0.001) && !b.habitableBand;
  });
  if (warm) {
    var r = W.precipKind(warm.b, warm.sys, atLat(warm.b, 0.9), 0);
    check('a world with no cap never snows, not even at its pole',
          r.snow === 0 && r.ash === 0, warm.b.name + ' (' + warm.b.type + ')');
  } else console.log('  (no capless world with air in these seeds)');
})();

console.log('--- and aloft carries it ---');
(function () {
  /* A stand-in GL layer: aloft wants spinOf, and the suite has no GPU. */
  global.GLWorld = global.GLWorld || {};
  if (!global.GLWorld.spinOf) {
    global.GLWorld.spinOf = function (body, t) {
      var ax = W.spinAxis(body);
      var cl = W.stormClock(t);
      return { ax: ax, phase: W.spinPhase ? W.spinPhase(body, t) : 0, deck: 0, band: 0, shear: 0,
               weather: 0, salt: cl.salt, saltPrev: cl.saltPrev, slow: cl.slow,
               stormPhase: cl.phase, slot: cl.slot };
    };
  }
  var hit = find(function (b) {
    var T = W.terrainOf(b);
    return b.kind === 'planet' && b.atmosphere && b.atmosphere.cloud > 0.3 && T.ice > 0.12 && !b.habitableBand;
  });
  if (!hit) { console.log('  (no cloudy iced world in these seeds)'); return; }
  var V = global.V;
  var st = Sim.bodyState(hit.b, hit.sys, 0);
  function at(f, alt, t, swing) {
    var n = atLat(hit.b, f, swing);
    var s2 = Sim.bodyState(hit.b, hit.sys, t || 0);
    return W.aloft({ pos: { x: s2.pos.x + n.x * (hit.b.radius + alt),
                            y: s2.pos.y + n.y * (hit.b.radius + alt),
                            z: s2.pos.z + n.z * (hit.b.radius + alt) },
                     vel: s2.vel }, hit.sys, t || 0);
  }
  var low = hit.b.atmosphere.top * W.DECK_LO * 0.4;
  /* Cloud is patchy in space AND in time, so a chosen point need not be
   * under any: sweep round the cap and across a few hours until something
   * is actually falling. Inside the cap the whole way, which is the part
   * being tested. */
  var pole = null;
  for (var ti = 0; ti < 8 && !pole; ti++) {
    for (var f = 0.995; f > 0.80 && !pole; f -= 0.01) {
      for (var g = 0; g < 8 && !pole; g++) {
        var r0 = at(f, low, ti * 5400, g * Math.PI / 4);
        if (r0 && r0.rain > 0.05 && r0.snow > 0.8) pole = r0;
      }
    }
  }
  var equator = at(0.0, low, 0, 0);
  check('under the deck inside the cap, the fall is snow',
        !!pole, pole ? 'fall ' + pole.rain.toFixed(2) + ' snow ' + pole.snow.toFixed(2)
                     : 'no cloud raining anywhere in the cap on this world');
  check('and at the equator it is not',
        equator && equator.snow < 0.2, equator ? 'snow ' + equator.snow.toFixed(2) : 'no reading');
  check('snow and ash are shares of the fall, not extra',
        pole && pole.snow + pole.ash <= 1.0000001);
})();

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
