/* rings.test.js — planetary rings, belts, Trojans, and the rock in them.
 *
 *     node test/rings.test.js
 *
 * Rung 0 of the mining ladder (claude/mining-and-survey.md). What this holds:
 *   - ADDITIVE: turning rings and belts on moves nothing else in a system;
 *   - PHYSICAL: rings inside the Roche limit and inside the innermost moon,
 *     belts clear of every planet, Trojans at sixty degrees for ever;
 *   - ON RAILS: every rock is a closed-form function of t — same answer
 *     twice, smooth from one frame to the next, velocity that matches its
 *     own motion;
 *   - ONE RING: the shader's optical depth and Rings.ringDensity are the
 *     same function, constant for constant.
 */
global.window = global.window || global;
require('../src/vec3.js');
require('../src/rng.js');
require('../src/kepler.js');
require('../src/economy.js');
var Gen = require('../src/generate.js');
var Galaxy = require('../src/galaxy.js');
var R = require('../src/rings.js');
var V = global.V, K = global.Kepler;

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
var systems = [];
for (var s = 0; s < gal.stars.length && s < 70; s++) {
  systems.push(Gen.generateSystem(gal.stars[s].seed, optsFor(gal.stars[s])));
}

console.log('--- additive: rings and belts move nothing else ---');
function proj(sys) {
  return JSON.stringify({
    b: sys.bodies.map(function (b) {
      return [b.id, b.name, b.kind, b.type, b.mass, b.radius, b.orbit && [b.orbit.a, b.orbit.e, b.orbit.m0],
              b.rotation && [b.rotation.period, b.rotation.tilt], b.market && b.market.role];
    }),
    t: (sys.traffic || []).map(function (r) { return r.id; }),
    p: (sys.patrols || []).map(function (p) { return p.id; }),
    g: sys.government && sys.government.id, c: sys.crimeScore
  });
}
var same = 0, tried = 0;
for (var a = 0; a < 12; a++) {
  var st = gal.stars[a];
  var on = Gen.generateSystem(st.seed, optsFor(st));
  var off = Gen.generateSystem(st.seed, optsFor(st, { noRings: true }));
  tried++;
  if (proj(on) === proj(off)) same++;
}
check('a system with rings is the system without them, plus rings', same === tried, same + '/' + tried);
var again = Gen.generateSystem(gal.stars[3].seed, optsFor(gal.stars[3]));
check('rings and belts are deterministic',
      JSON.stringify(again.belts) === JSON.stringify(systems[3].belts) &&
      JSON.stringify(again.bodies.map(function (b) { return b.ring || null; })) ===
      JSON.stringify(systems[3].bodies.map(function (b) { return b.ring || null; })));

console.log('--- rings ---');
var giants = 0, ringed = 0, bad = [], lanes = 0, lanesClear = 0;
systems.forEach(function (sys) {
  sys.bodies.forEach(function (b) {
    if (b.ring && !R.isGiant(b)) bad.push(b.name + ' is not a giant');
    if (!R.isGiant(b)) return;
    giants++;
    if (!b.ring) return;
    ringed++;
    var rg = b.ring;
    if (rg.inner <= b.radius * 1.05) bad.push(b.name + ' ring inside the cloud tops');
    if (rg.outer > R.rocheIce(b) * 1.0001) bad.push(b.name + ' ring outside the Roche limit');
    b.children.forEach(function (c) {
      if (c.kind === 'moon' && c.orbit.a * (1 - c.orbit.e) < rg.outer) bad.push(b.name + ' moon inside ring');
    });
    if (rg.gaps.length > 8) bad.push(b.name + ' more gaps than the shader carries');
    rg.gaps.forEach(function (g) {
      if (g.kind !== 'lane') return;
      lanes++;
      var st2 = sys.byId[g.station];
      if (R.ringDensity(rg, st2.orbit.a) === 0) lanesClear++;
    });
  });
});
check('only giants have rings, every ring between the cloud tops, the Roche limit and the first moon',
      bad.length === 0, bad.slice(0, 3).join('; '));
var share = ringed / giants;
check('most giants are ringed, not all', share > 0.45 && share < 0.85, (100 * share).toFixed(0) + '% of ' + giants);
check('a station orbiting inside a ring flies in a cleared lane', lanes > 0 && lanesClear === lanes,
      lanesClear + '/' + lanes);

var anyRinged = null;
systems.some(function (sys) {
  return sys.bodies.some(function (b) { if (b.ring && b.ring.grand) { anyRinged = { sys: sys, p: b }; return true; } });
});
var pr = anyRinged.p, rg0 = pr.ring;
var fr = R.ringFrame(pr);
check('the ring frame is right-handed and the normal is the spin axis',
      Math.abs(V.dot(fr.e1, fr.e2)) < 1e-12 &&
      V.dist(V.cross(fr.e1, fr.e2), fr.n) < 1e-12 &&
      Math.abs(fr.n.y + Math.sin(pr.rotation.tilt)) < 1e-12);
var dens = [];
for (var x = 0; x <= 1; x += 0.01) dens.push(R.ringDensity(rg0, rg0.inner + (rg0.outer - rg0.inner) * x));
check('density is zero off the ring and bounded on it',
      R.ringDensity(rg0, rg0.inner * 0.99) === 0 && R.ringDensity(rg0, rg0.outer * 1.01) === 0 &&
      dens.every(function (d) { return d >= 0 && d <= 1; }) && Math.max.apply(null, dens) > 0.3);
var g0 = rg0.gaps[0];
check('a gap is empty at its centre', R.ringDensity(rg0, g0.r) === 0);

console.log('--- ring chunks ---');
var ps = { pos: { x: 0, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 } };
var best = 0, bestR = 0;
for (var rr = rg0.inner; rr < rg0.outer; rr += (rg0.outer - rg0.inner) / 400) {
  var dd = R.ringDensity(rg0, rr); if (dd > best) { best = dd; bestR = rr; }
}
var at = V.scale(fr.e1, bestR);
var T = 3.3e7;
var c1 = R.ringChunksNear(pr, ps, at, 3, T, 0);
var c2 = R.ringChunksNear(pr, ps, at, 3, T, 0);
check('chunks are found in the dense part of a ring', c1.length > 20, c1.length + ' within 3 km');
check('the same question gives the same chunks', JSON.stringify(c1) === JSON.stringify(c2));
check('every chunk is inside the radius asked about', c1.every(function (c) { return V.dist(c.pos, at) <= 3 + 1e-9; }));
var inGap = R.ringChunksNear(pr, ps, V.scale(fr.e1, g0.r), Math.min(2, g0.hw * 0.4), T, 0);
check('a gap has no chunks in it', inGap.length === 0, inGap.length + '');
var off2 = R.ringChunksNear(pr, ps, V.add(at, V.scale(fr.n, 20)), 3, T, 0);
check('nothing twenty km off the plane', off2.length === 0);
/* Rails: one second later the same chunk is where its velocity said. */
/* Asked around where the first chunk WILL be: the ring moves at ~20 km/s,
 * so the old point is empty sky a second later. */
var later = R.ringChunksNear(pr, ps, V.add(c1[0].pos, c1[0].vel), 3.5, T + 1, 0);
var byId = {};
later.forEach(function (c) { byId[c.id] = c; });
var moved = 0, worst = 0;
c1.forEach(function (c) {
  var n2 = byId[c.id]; if (!n2) return;
  moved++;
  /* Plus half the planet's pull: a chunk at 20 km/s round a giant falls a
   * metre off its tangent in a second, and that is the orbit, not an error. */
  var rr2 = V.len(c.pos), acc = V.scale(c.pos, -6.67430e-20 * pr.mass / (rr2 * rr2 * rr2));
  var pred = V.add(V.add(c.pos, c.vel), V.scale(acc, 0.5));
  worst = Math.max(worst, V.dist(pred, n2.pos));
});
check('a chunk moves by its own velocity (rails, not teleports)', moved > 10 && worst < 1e-3,
      moved + ' tracked, worst ' + (worst * 1e6).toFixed(1) + ' mm');
var vrel = 0;
c1.forEach(function (c) { vrel = Math.max(vrel, V.dist(c.vel, c1[0].vel)); });
check('neighbouring chunks drift past each other slowly', vrel < 0.05, (vrel * 1000).toFixed(1) + ' m/s max');
var orbV = Math.sqrt(6.67430e-20 * pr.mass / bestR);
check('and orbit at the Keplerian speed', Math.abs(V.len(c1[0].vel) - orbV) / orbV < 0.01);

console.log('--- belts and Trojans ---');
var outerBelts = 0, trojans = 0, fieldsAll = 0, clash = [];
systems.forEach(function (sys) {
  var planets = sys.root.children.filter(function (b) { return b.kind === 'planet'; });
  (sys.belts || []).forEach(function (bl) {
    fieldsAll += bl.fields.length;
    if (bl.kind === 'belt') {
      outerBelts++;
      planets.forEach(function (p) {
        var lo = p.orbit.a * (1 - p.orbit.e), hi = p.orbit.a * (1 + p.orbit.e);
        if (hi > bl.inner && lo < bl.outer) clash.push(bl.name + ' crosses ' + p.name);
      });
      bl.fields.forEach(function (f) {
        if (f.orbit.a * (1 - f.orbit.e) < bl.inner * 0.94 || f.orbit.a * (1 + f.orbit.e) > bl.outer * 1.06) {
          clash.push(f.name + ' strays out of ' + bl.name);
        }
      });
    } else if (bl.kind === 'trojan') {
      trojans++;
      var gi = sys.byId[bl.giant];
      bl.fields.forEach(function (f) {
        if (f.orbit.a !== gi.orbit.a) clash.push(f.name + ' is not on its giant\'s orbit');
      });
    }
  });
});
check('belts never cross a planet\'s orbit, and their fields stay in them', clash.length === 0, clash.slice(0, 3).join('; '));
check('outer belts are common and Trojan clouds exist', outerBelts > 20 && trojans > 20,
      outerBelts + ' belts, ' + trojans + ' Trojan clouds, ' + fieldsAll + ' fields');

/* A Trojan stays sixty degrees off its giant — now, and a century on. */
var tSys = null, tCloud = null;
systems.some(function (sys) {
  return (sys.belts || []).some(function (bl) { if (bl.kind === 'trojan') { tSys = sys; tCloud = bl; return true; } });
});
var giant = tSys.byId[tCloud.giant];
var muS = 6.67430e-20 * tSys.root.mass;
function sepDeg(f, t) {
  var a = K.state(giant.orbit, muS, t).pos, b = R.fieldCenter(f, tSys, t).pos;
  return Math.acos(Math.max(-1, Math.min(1, V.dot(V.norm(a), V.norm(b))))) / Math.PI * 180;
}
var f4 = tCloud.fields[0];
var s0 = sepDeg(f4, 0), s100 = sepDeg(f4, 100 * 3.156e7);
check('a Trojan field sits about sixty degrees from its giant', s0 > 40 && s0 < 80, s0.toFixed(1) + ' deg');
check('and is still there a century later', Math.abs(s100 - s0) < 8, s100.toFixed(1) + ' deg');

console.log('--- field members ---');
var fd = null, fSys = null;
systems.some(function (sys) {
  return (sys.belts || []).some(function (bl) { if (bl.fields.length) { fd = bl.fields[0]; fSys = sys; return true; } });
});
var cen = R.fieldCenter(fd, fSys, T), hf = R.hillFrame(cen);
var far = 0, big = 0;
for (var m = 0; m < fd.count; m++) {
  var rk = R.fieldMember(fd, m, fSys, T, cen, hf);
  if (V.dist(rk.pos, cen.pos) > fd.radius * 1.05) far++;
  if (rk.size > 0.5) big++;
}
check('every member stays within its field', far === 0, far + ' outside');
check('a field has a few big rocks in it', big >= 1 && big < fd.count * 0.2, big + ' over 500 m of ' + fd.count);
var mA = R.fieldMember(fd, 7, fSys, T), mB = R.fieldMember(fd, 7, fSys, T + 10);
var mPred = V.add(mA.pos, V.scale(mA.vel, 10));
check('a member moves by its own velocity', V.dist(mPred, mB.pos) < 1e-3,
      (V.dist(mPred, mB.pos) * 1e6).toFixed(1) + ' mm over 10 s');
var mY = R.fieldMember(fd, 7, fSys, T + 3.156e7 * 50);
var cY = R.fieldCenter(fd, fSys, T + 3.156e7 * 50);
check('and is still in its field fifty years on (bounded, no drift)', V.dist(mY.pos, cY.pos) < fd.radius * 1.05);
var rel = V.len(V.sub(mA.vel, cen.vel));
check('rocks in a field barely move against each other', rel < 0.01, (rel * 1000).toFixed(2) + ' m/s');
var near = R.fieldsNear(fSys, cen.pos, T, 10);
check('fieldsNear finds the field you are in', near.length && near[0].field === fd);

console.log('--- meshes ---');
var mesh = R.rockMesh(2, 'metal');
check('a rock is 80 faces, a colour per face', mesh.f.length === 80 && mesh.c.length === 80);
check('and is cached', R.rockMesh(2, 'metal') === mesh && R.rockMesh(2, 'ice') !== mesh);
var maxR = 0;
mesh.v.forEach(function (p) { maxR = Math.max(maxR, Math.hypot(p[0], p[1], p[2])); });
check('about a unit across, so its size is its radius', maxR > 0.8 && maxR < 1.3, maxR.toFixed(2));
var fine = R.rockMesh(2, 'metal', 2);
check('the close-up mesh is the same rock split twice: 1,280 faces, cached',
      fine.f.length === 1280 && fine.c.length === 1280 && R.rockMesh(2, 'metal', 2) === fine && fine !== mesh);
var fineR = 0;
fine.v.forEach(function (p) { fineR = Math.max(fineR, Math.hypot(p[0], p[1], p[2])); });
check('and keeps the far mesh\'s silhouette, so the swap does not pop', Math.abs(fineR - maxR) / maxR < 0.08,
      maxR.toFixed(3) + ' -> ' + fineR.toFixed(3));
var ringSizes = c1.map(function (c) { return c.size; });
check('ring chunks are big enough to find: 5 m to ~120 m',
      Math.min.apply(null, ringSizes) >= 0.005 && Math.max.apply(null, ringSizes) <= 0.121);

console.log('--- one ring, two languages ---');
var GLW = null;
try { GLW = require('../src/gl.js'); } catch (e) { GLW = null; }
var src = GLW && GLW.ringShaderSource ? GLW.ringShaderSource() : '';
var js = R.ringDensity.toString() + R.vhash.toString() + R.mix32.toString();
var shared = [['0x7feb352d', '0x7feb352du'], ['0x846ca68b', '0x846ca68bu'], ['0x27d4eb2d', '0x27d4eb2du'],
              ['x * 23', 'x * 23.0'], ['x * 97', 'x * 97.0'], ['x * 389', 'x * 389.0'],
              ['s + 101', 'uSeed + 101'], ['s + 211', 'uSeed + 211'],
              ['0.035', '0.035'], ['0.955', '0.955'], ['g.hw * 0.55', '.y * 0.55'],
              ['0.52 + 0.30', '0.52 + 0.30'], ['0.14 *', '0.14 *'], ['0.10 *', '0.10 *'], ['1.15', '1.15']];
var missing = shared.filter(function (p) { return js.indexOf(p[0]) < 0 || src.indexOf(p[1]) < 0; });
check('the shader and Rings.ringDensity share every constant', src && missing.length === 0,
      missing.map(function (p) { return p[0]; }).join(', '));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
