/* twilight.test.js — tidally locked and tipped worlds with a living strip.
 *
 *     node test/twilight.test.js
 *
 * Astra, 2026-10-19: "tidally locked worlds: they can have habitable
 * regions right along their star-set zone, or the day/night line around
 * the equator." Full habitability; both kinds.
 */
global.window = global.window || global;
var V = require('../src/vec3.js');
require('../src/economy.js');
var Gen = require('../src/generate.js');
var Sim = require('../src/sim.js');
var Galaxy = require('../src/galaxy.js');
var Screens = require('../src/screens.js');

var pass = 0, fail = 0;
function check(n, c, d) {
  if (c) { pass++; console.log('  ok   ' + n + (d ? '   ' + d : '')); }
  else { fail++; console.log('  FAIL  ' + n + (d ? '   ' + d : '')); }
}

var gal = Galaxy.build('kawartha');
function optsFor(st, extra) {
  var fac = gal.factionById ? gal.factionById[st.factionId] : null;
  var o = fac ? { faction: fac, allFactions: gal.factions } : {};
  for (var k in (extra || {})) o[k] = extra[k];
  return o;
}

var locked = 0, tipped = 0, ring = 0, band = 0, newlyHab = 0;
var idsStable = true, namesStable = true, orbitsStable = true, extraAtEnd = true;
var ringPadsOK = true, bandPadsOK = true, newPorts = true, lockPeriod = true;
var subsolarOK = true, worstAngle = 0, tipOK = true;
var ringSys = null, bandSys = null, padSunOK = true, worstSun = 0;

for (var s = 0; s < gal.stars.length; s++) {
  var st = gal.stars[s];
  var a = Gen.generateSystem(st.seed, optsFor(st));
  var b = Gen.generateSystem(st.seed, optsFor(st, { noTwilight: true }));

  /* Everything the old generator made is still there, same id, same name,
   * same orbit — the twilight ports only ever ADD ids, after the last. */
  var maxOld = -1;
  b.bodies.forEach(function (ob) {
    var nb = a.byId[ob.id];
    if (!nb) { idsStable = false; return; }
    /* A fleet carrier takes the garrison's name, and it parks over the
     * best-developed port — which a newly habitable world can change. That
     * is the economy answering, not an id moving, so carriers are exempt. */
    if (nb.name !== ob.name && !nb.fleet && !ob.fleet) namesStable = false;
    if (ob.orbit && (nb.orbit.a !== ob.orbit.a || nb.orbit.m0 !== ob.orbit.m0)) orbitsStable = false;
    maxOld = Math.max(maxOld, +ob.id.slice(1));
  });
  a.bodies.forEach(function (nb) {
    if (!b.byId[nb.id] && +nb.id.slice(1) <= maxOld) extraAtEnd = false;
  });

  a.bodies.forEach(function (p) {
    if (p.kind !== 'planet') return;
    if (p.tidallyLocked) {
      locked++;
      if (Math.abs(p.rotation.period - p.orbit.period) > 1e-6 * p.orbit.period) lockPeriod = false;
      /* Longitude 0 under the star: compare the surface point at lon 0 with
       * the direction to the star, at a few times across the year. */
      for (var k = 0; k < 4; k++) {
        var t = p.orbit.period * k / 4;
        var pp = Sim.bodyState(p, a, t).pos;
        var off = Sim.surfaceOffset ? Sim.surfaceOffset(p, { lat: 0, lon: 0, elevation: 0 }, t).pos : null;
        if (!off) { subsolarOK = false; break; }
        /* In full 3D: the pole stands on the orbit normal, so even a
         * "wanderer" on a 30° orbit keeps its star on its equator. All
         * that is left is eccentricity's libration, ±2e rad at most. */
        var toStar = V.norm(V.scale(pp, -1)), up = V.norm(off);
        var ang = Math.acos(Math.max(-1, Math.min(1, V.dot(toStar, up)))) * 180 / Math.PI;
        worstAngle = Math.max(worstAngle, ang);
        if (ang > 2 * p.orbit.e * 180 / Math.PI + 1) subsolarOK = false;
      }
    }
    if (p.tipped) {
      tipped++;
      var tl = p.rotation.tilt * 180 / Math.PI;
      if (tl < 79.9 || tl > 100.1) tipOK = false;
    }
    if (p.habitableBand === 'terminator') { ring++; if (!ringSys) ringSys = { sys: a, p: p }; }
    if (p.habitableBand === 'equator') { band++; if (!bandSys) bandSys = { sys: a, p: p }; }
    if (p.habitable && !p.habitableGlobal) {
      newlyHab++;
      if (p.children.filter(function (c) { return c.kind === 'station' && !c.surface; }).length < 2) newPorts = false;
    }
    if (p.habitableBand === 'terminator' || p.habitableBand === 'equator') {
      p.children.forEach(function (c) {
        if (!c.surface) return;
        if (p.habitableBand === 'terminator' &&
            Math.abs(Math.abs(Math.atan2(Math.sin(c.lon), Math.cos(c.lon))) - (Math.PI / 2 - 0.15)) > 0.07) ringPadsOK = false;
        if (p.habitableBand === 'equator' && Math.abs(c.lat) > 0.23) bandPadsOK = false;
        /* And the star really is low over it, all year: the sun's height
         * at the pad stays inside the strip gl.js paints as living. */
        if (p.habitableBand === 'terminator') {
          for (var q = 0; q < 3; q++) {
            var tq = p.orbit.period * q / 3;
            var wp = Sim.bodyState(p, a, tq).pos, cp = Sim.bodyState(c, a, tq).pos;
            var upv = V.norm(V.sub(cp, wp)), sun = V.norm(V.scale(wp, -1));
            var h = V.dot(upv, sun);
            worstSun = Math.max(worstSun, Math.abs(h - 0.15));
            if (h < -0.10 || h > 0.40) padSunOK = false;
          }
        }
      });
    }
  });
}

console.log('\n  ' + gal.stars.length + ' systems: ' + locked + ' locked, ' + tipped + ' tipped; ' +
            ring + ' twilight rings, ' + band + ' equator bands, ' + newlyHab + ' newly habitable\n');

check('some worlds are tidally locked', locked > 0);
check('some worlds are tipped', tipped > 0);
check('some locked worlds live in their ring', ring > 0);
check('some tipped worlds live along their equator', band > 0);
check('every old body keeps its id', idsStable);
check('and its name', namesStable);
check('and its orbit', orbitsStable);
check('new ports only take ids after the old ones', extraAtEnd);
check('a locked world turns once a year', lockPeriod);
check('longitude 0 faces the star, all year', subsolarOK, 'worst ' + worstAngle.toFixed(1) + '°');
check('a tipped world lies on its side', tipOK);
check('a newly habitable world gets at least two orbital ports', newPorts);
check('pads on a ring world sit on the ring', ringPadsOK);
check('pads on a band world sit in the band', bandPadsOK);
check('and a ring pad has the star low over it all year', padSunOK, 'worst ' + worstSun.toFixed(2) + ' off the ring centre');

/* Deterministic. */
var st0 = gal.stars[0];
var x1 = Gen.generateSystem(st0.seed, optsFor(st0)), x2 = Gen.generateSystem(st0.seed, optsFor(st0));
check('same seed, same twilight worlds',
      JSON.stringify(x1.bodies.map(function (q) { return [q.id, q.habitableBand || '', q.tipped || false]; })) ===
      JSON.stringify(x2.bodies.map(function (q) { return [q.id, q.habitableBand || '', q.tipped || false]; })));

/* The card says so. */
if (ringSys) {
  var f = Screens.worldFacts(ringSys.sys, ringSys.p);
  var txt = [f.zone, f.day].concat(f.notes).join(' | ');
  check('the NAV card calls a ring world tidally locked', /tidally locked/i.test(txt), f && f.day);
  check('and names the ring', /ring/i.test(txt));
}
if (bandSys) {
  var g = Screens.worldFacts(bandSys.sys, bandSys.p);
  check('the NAV card names an equator band', /equator/i.test(g.zone), g.zone);
}
var anyM = ringSys || bandSys;
if (anyM) {
  var man = Screens.systemManifest(anyM.sys);
  var row = man.filter(function (r) { return r.body === anyM.p; })[0];
  check('the chart row marks it habitable', row && row.habitable);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
