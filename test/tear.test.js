/* tear.test.js — slipspace tears on the world layer: lens, veil and lightning.
 *
 *     node test/tear.test.js
 *
 * Astra, 2026-10-21, after a mockup: "wake glow and stuff are great. Let's
 * implement them, arrival and departure, and then we should work those
 * clouds into what we see as we reach our slipspace destination."
 *
 * gl.js draws it and node cannot run a shader, so this pins the JS that
 * both renderers share: the lens arithmetic (VERT_STARS and the planet
 * shader carry it line for line — checked against the source text), where
 * a tear sits on screen, and the lightning — which must CROSS the dark gap,
 * not run along it, and be bigger and angrier for an arrival.
 */
global.window = global.window || global;
var fs = require('fs'), path = require('path');
require('../src/vec3.js');
require('../src/rng.js');
var Render = require('../src/render.js');

var pass = 0, fail = 0;
function check(n, c, d) {
  if (c) { pass++; console.log('  ok   ' + n + (d ? '   ' + d : '')); }
  else { fail++; console.log('  FAIL  ' + n + (d ? '   ' + d : '')); }
}
function lcg(seed) { var s = seed >>> 0; return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

console.log('--- the lens ---');
var E = 0.05, worst = 0, ring = Render.lensImages(1e-9, E);
[0.001, 0.02, 0.05, 0.1, 0.3].forEach(function (b) {
  var im = Render.lensImages(b, E);
  worst = Math.max(worst, Math.abs(Render.lensSource(im.plus, E) - b),
                          Math.abs(Render.lensSource(im.minus, E) - b));
});
check('both images map back to the source (lens equation, both ways)', worst < 1e-12, worst.toExponential(1));
var im = Render.lensImages(0.03, E);
check('the near image is on the source\'s side and pushed out', im.plus > 0.03, im.plus.toFixed(4));
check('the second image is across the tear, inside the ring', im.minus < 0 && Math.abs(im.minus) < E, im.minus.toFixed(4));
check('a point lens: magnifications differ by exactly one', Math.abs(im.muPlus - im.muMinus - 1) < 1e-12);
check('lined up behind it, a star becomes the Einstein ring', Math.abs(ring.plus - E) < 1e-6);
var far = Render.lensImages(40 * E, E);
/* The shaders stop bending at 40 E, so the step there is what is left of
 * the bend: E/40 — under a pixel even on the biggest tear (E ~ 27 px). */
check('at the shader cut-off (40 E) the bend left is about E/40', far.plus - 40 * E < E / 39 && far.muMinus < 1e-5,
      ((far.plus - 40 * E) / E).toFixed(4) + ' E');

var glsrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'gl.js'), 'utf8');
check('the star shader carries the same images', glsrc.indexOf("float th = 0.5 * (b + sqrt(b * b + 4.0 * E * E));") > 0 &&
      glsrc.indexOf("float th = 0.5 * (bb - sqrt(bb * bb + 4.0 * bE * bE));") > 0);
check('and the planet shader the same inverse', glsrc.indexOf("float b = mix(th, th - E * E / th, wb);") > 0 &&
      glsrc.indexOf("rd = tearBend(rd, length(uCenterRel));") > 0);
/* Astra, 2026-10-21: "I do want the thing to lens planets and stations alike". */
check('stations and ships bend too, per vertex', /'out float vAlpha;',\s*TEAR_GLSL,/.test(glsrc) &&
      glsrc.indexOf("vec3 dd = tearPush(rel / L, L);") > 0 &&
      glsrc.indexOf("float th = mix(b, 0.5 * (b + sqrt(b * b + 4.0 * E * E)), wb);") > 0);
check('only what is BEHIND a tear bends', glsrc.indexOf("smoothstep(z * 0.97, z * 1.03, dist)") > 0 &&
      glsrc.indexOf("tearK[o + 2] = t.dist || 0;") > 0);
check('a bent planet gets a bigger square, so its edge is not cut', glsrc.indexOf("quadPx += maxE * cam.flen * 1.25;") > 0);
var rsrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'render.js'), 'utf8');
check('the tunnel has lightning on its walls', rsrc.indexOf("drawTunnelWallBolts(ctx, cx, cy, maxR, T, I);") > 0 &&
      /var u = bt\.u0 \+ \(T - bt\.T0\) \* 0\.22;/.test(rsrc));
check('the lightning is its own program', /var VERT_BOLT = /.test(glsrc) && /var FRAG_BOLT = /.test(glsrc) &&
      glsrc.indexOf("link(gl, VERT_BOLT, FRAG_BOLT, 'bolt')") > 0);

console.log('--- where a tear is on screen ---');
/* A bare camera at the origin looking down +y, z up. */
function cam(w, h) {
  return { w: w, h: h, eye: { x: 0, y: 0, z: 0 }, flen: 0.5 * h / Math.tan(0.45), near: 1e-6,
    project: function (p) {
      if (p.y <= this.near) return null;
      var k = this.flen / p.y;
      return { x: w / 2 + p.x * k, y: h / 2 - p.z * k, depth: p.y, scale: k };
    } };
}
var C = cam(1000, 640), POLE = { x: 0, y: 0, z: 1 };
var dep = { kind: 'departure', decay: 0.9, glow: 0.9 }, arr = { kind: 'arrival', decay: 0.9, glow: 0.9 };
var nearT = Render.tearScreen(C, { x: 0, y: 1e5, z: 0 }, dep, 30000, 0, POLE);
var farT = Render.tearScreen(C, { x: 0, y: 1e10, z: 0 }, dep, 30000, 0, POLE);
check('behind you, nothing', Render.tearScreen(C, { x: 0, y: -1e5, z: 0 }, dep, 30000, 0, POLE) === null);
check('close up the cloud is capped at a tenth of the screen, as in 2D', Math.abs(nearT.r - 64) < 1e-9, nearT.r.toFixed(1));
check('far off it is a mote, never nothing', farT.r >= 2.2 && farT.r < 6, farT.r.toFixed(2));
check('the lens is tied to the cloud', Math.abs(nearT.E / nearT.r - 1 / 2.4) < 1e-12 && Math.abs(nearT.thetaE - 1.55 * nearT.E / C.flen) < 1e-15);
check('the slit runs along the pole: across axis is horizontal here',
      Math.abs(nearT.roll[1]) < 1e-9 && Math.abs(Math.abs(nearT.roll[0]) - 1) < 1e-9);
check('it knows which kind it is', !nearT.arrival &&
      Render.tearScreen(C, { x: 0, y: 1e5, z: 0 }, arr, 30000, 0, POLE).arrival === true);
var older = Render.tearScreen(C, { x: 0, y: 1e5, z: 0 }, { kind: 'departure', decay: 0.2, glow: 0.2 }, 30000, 0, POLE);
check('as it decays the rip narrows', older.W < nearT.W * 0.4, older.W.toFixed(1) + ' px vs ' + nearT.W.toFixed(1));

console.log('--- the lightning ---');
var rnd = lcg(7), crossD = 0, crossA = 0, N = 300, coreD = 0, coreA = 0, forkD = 0, forkA = 0, reachD = 0, reachA = 0;
for (var i = 0; i < N; i++) {
  var d = Render.makeBolt(0.3, false, rnd), a = Render.makeBolt(0.3, true, rnd);
  [[d, false], [a, true]].forEach(function (pr) {
    var b = pr[0], m = b.branches[0].pts, x0 = m[0][0], x1 = m[m.length - 1][0];
    var crosses = x0 * x1 < 0 && Math.abs(x0) > 0.3 * 1.4 && Math.abs(x1) > 0.3 * 1.4;
    if (pr[1]) { if (crosses) crossA++; coreA += b.branches[0].core; forkA += b.branches.length - 1; reachA += Math.abs(x1 - x0); }
    else { if (crosses) crossD++; coreD += b.branches[0].core; forkD += b.branches.length - 1; reachD += Math.abs(x1 - x0); }
  });
}
check('every departure bolt crosses the gap, cloud to cloud', crossD === N, crossD + '/' + N);
check('every arrival bolt crosses it too', crossA === N, crossA + '/' + N);
check('arrival bolts are thicker', coreA / N > coreD / N * 1.5, (coreA / N).toFixed(1) + ' vs ' + (coreD / N).toFixed(1) + ' px');
check('and more forked', forkA / N > forkD / N + 1, (forkA / N).toFixed(2) + ' vs ' + (forkD / N).toFixed(2) + ' forks');
check('and reach further', reachA > reachD * 1.6, (reachA / N).toFixed(2) + ' vs ' + (reachD / N).toFixed(2) + ' slit heights');
var bolt = Render.makeBolt(0.3, true, lcg(3));
var lv0 = Render.boltLevel(bolt); bolt.age = bolt.life + 0.01;
check('a stroke flashes at once and is gone after its life', lv0 === 1 && Render.boltLevel(bolt) === 0);

var mote = { x: 500, y: 300, W: 1, H: 6, roll: [1, 0], arrival: true, open: 1, glow: 1 };
var big = { x: 500, y: 300, W: 12, H: 60, roll: [1, 0], arrival: true, open: 1, glow: 1 };
var t0 = 1000, got = [], moteGot = 0;
for (var k = 0; k < 400 && !got.length; k++) got = Render.tearBolts('test-big', t0 + k * 0.05, big);
for (k = 0; k < 400; k++) moteGot += Render.tearBolts('test-mote', t0 + k * 0.05, mote).length;
check('no lightning on a mote', moteGot === 0);
check('a big tear strikes', got.length > 0, got.length + ' strokes');
var spansCentre = got.some(function (p) {
  var xs = p.pts.map(function (q) { return q[0]; });
  return Math.min.apply(null, xs) < 500 - 12 && Math.max.apply(null, xs) > 500 + 12;
});
check('in screen pixels, across the slit\'s centre', spansCentre);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
