/* heading.test.js — the heading tape, held to the compass.
 *
 *     node test/heading.test.js
 *
 * Astra, 2026-10-17: "give me the tape heading with the cardinal directions
 * as referenced by the locally bound grav body". North is the dominant
 * body's spin pole laid onto the local horizon; east is the way the ground
 * turns; heading is clockwise from north, as on any chart.
 */
global.window = global.window || global;
var V = require('../src/vec3.js');
require('../src/economy.js');
require('../src/generate.js');
var Sim = require('../src/sim.js');
var Render = require('../src/render.js');

var pass = 0, fail = 0;
function check(n, c, d) {
  if (c) { pass++; console.log('  ok   ' + n + (d ? '   ' + d : '')); }
  else { fail++; console.log('  FAIL  ' + n + (d ? '   ' + d : '')); }
}
function near(a, b, tol) { return Math.abs(a - b) <= (tol || 1e-6); }
function angNear(a, b, tol) { return Math.abs(((a - b + 540) % 360) - 180) <= (tol || 1e-6); }
function ship(fwd) { return { fwd: V.norm(fwd), up: { x: 0, y: 0, z: 1 } }; }

var flat = { rotation: { tilt: 0, period: 86400, phase: 0 } };
var P0 = Sim.bodyPole(flat);
var UP = { x: 1, y: 0, z: 0 };            // standing on the equator, +x side

console.log('--- the cardinals on an untilted world ---');
check('pole of an untilted world is +z', near(P0.x, 0) && near(P0.y, 0) && near(P0.z, 1));
[[{ x: 0, y: 0, z: 1 }, 0, 'N'], [{ x: 0, y: 1, z: 0 }, 90, 'E'],
 [{ x: 0, y: 0, z: -1 }, 180, 'S'], [{ x: 0, y: -1, z: 0 }, 270, 'W']].forEach(function (c) {
  var hd = Sim.headingAngles(ship(c[0]), UP, P0, null);
  check('nose ' + c[2] + ' reads ' + c[1], angNear(hd.hdgDeg, c[1]), hd.hdgDeg.toFixed(3));
});
var hdNE = Sim.headingAngles(ship({ x: 0, y: 1, z: 1 }), UP, P0, null);
check('halfway N to E reads 045', angNear(hdNE.hdgDeg, 45), hdNE.hdgDeg.toFixed(3));
check('headings are 0..360, never negative',
      Sim.headingAngles(ship({ x: 0, y: -1, z: 1 }), UP, P0, null).hdgDeg > 300);

console.log('--- pitch does not move the compass ---');
[-70, -20, 0, 35, 80].forEach(function (p) {
  var r = p * Math.PI / 180;
  var hd = Sim.headingAngles(ship(V.add(V.scale({ x: 0, y: 1, z: 0 }, Math.cos(r)), V.scale(UP, Math.sin(r)))), UP, P0, null);
  check('east at pitch ' + p + ' still reads 090', angNear(hd.hdgDeg, 90, 1e-5));
});

console.log('--- east is the way the ground turns ---');
/* Surface velocity is omega x r, with omega along the pole: that is the
 * direction the world carries a pad, so it must read 090 wherever you are. */
[{ tilt: 0 }, { tilt: 0.4 }, { tilt: 1.1 }, { tilt: 2.9 }].forEach(function (rot) {
  var body = { rotation: { tilt: rot.tilt, period: 86400, phase: 0 } };
  var pole = Sim.bodyPole(body);
  [{ x: 1, y: 0.2, z: 0.1 }, { x: -0.3, y: 0.8, z: 0.5 }, { x: 0.1, y: -0.6, z: -0.7 }].forEach(function (u) {
    var up = V.norm(u);
    var groundDir = V.norm(V.cross(pole, up));
    var hd = Sim.headingAngles(ship(groundDir), up, pole, null);
    check('tilt ' + rot.tilt + ': ground motion reads 090', angNear(hd.hdgDeg, 90, 1e-5), hd.hdgDeg.toFixed(4));
  });
});
var tilted = Sim.bodyPole({ rotation: { tilt: 0.5 } });
var hdT = Sim.headingAngles(ship(tilted), UP, tilted, null);
check('on a tilted world, flying at its pole reads 000', angNear(hdT.hdgDeg, 0));
check('a body with no rotation entry still has a north', near(Sim.bodyPole({}).z, 1));

console.log('--- where there is no answer ---');
var atN = Sim.headingAngles(ship({ x: 1, y: 0, z: 0 }), { x: 0, y: 0, z: 1 }, P0, null);
check('on the north pole there is no north', atN.noNorth && atN.atPole === 'N');
var atS = Sim.headingAngles(ship({ x: 1, y: 0, z: 0 }), { x: 0, y: 0, z: -1 }, P0, null);
check('on the south pole likewise', atS.noNorth && atS.atPole === 'S');
var vert = Sim.headingAngles(ship(UP), UP, P0, null);
check('nose at the zenith has no heading', vert.degenerate && !vert.noNorth);

console.log('--- the steering bug ---');
var hb = Sim.headingAngles(ship({ x: 0, y: 0, z: 1 }), UP, P0, { x: 0, y: -1, z: 0 });
check('target due west bears 270', angNear(hb.bugDeg, 270));
var hb2 = Sim.headingAngles(ship({ x: 0, y: 0, z: 1 }), UP, P0, UP);
check('target straight overhead has no bearing', hb2.bugDeg === null);

console.log('--- drawing it ---');
function stubCtx() {
  var texts = [];
  var c = new Proxy({ texts: texts }, {
    get: function (o, k) {
      if (k in o) return o[k];
      if (k === 'fillText') return function (s, x, y) { texts.push({ s: s, x: x, y: y }); };
      return function () {};
    },
    set: function (o, k, v) { o[k] = v; return true; }
  });
  return c;
}
function draw(hd) {
  var ctx = stubCtx();
  var bottom = Render.drawHeadingTape(ctx, 1600, 900, hd, { cy: 120, ref: 'TERRA' });
  return { ctx: ctx, bottom: bottom, has: function (s) { return ctx.texts.some(function (t) { return t.s === s; }); },
           at: function (s) { var t = ctx.texts.filter(function (t) { return t.s === s; })[0]; return t && t.x; } };
}
var dN = draw(Sim.headingAngles(ship({ x: 0, y: 0, z: 1 }), UP, P0, null));
check('heading 000 puts N under the index', dN.has('N') && near(dN.at('N'), 800, 0.5));
check('and boxes 000', dN.has('000'));
check('and tags the reference body', dN.has('REF TERRA'));
check('E is off a ±25° strip at 000', !dN.has('E'));
var d93 = draw(Sim.headingAngles(ship({ x: 0, y: 1, z: -0.0524 }), UP, P0, null));
check('at 093 E sits just left of the index', d93.has('E') && d93.at('E') < 800 && d93.at('E') > 760, 'x ' + (d93.at('E') || 0).toFixed(1));
check('and the box reads 093', d93.has('093'));
check('label 100 appears to the right', d93.has('100') && d93.at('100') > 800);
var dV = draw(vert);
check('nose vertical: box reads --- and no scale is drawn', dV.has('---') && !dV.has('N') && !dV.has('000'));
var dP = draw(atN);
check('on a pole the strip says so', dP.has('NORTH POLE · NO HEADING'));
check('returns the bottom of what it drew', dN.bottom > 120 && dN.bottom < 160, dN.bottom);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
