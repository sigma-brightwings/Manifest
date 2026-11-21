/* scars.test.js - what weapon fire leaves on a hull (scars.js, 2026-11-20).
 *
 *     node test/scars.test.js
 *
 * Pinned:
 *   - a hull hit leaves heat in the hull's own frame, on the side it came
 *     from, and it cools on sim time;
 *   - hits close together heat one spot; far apart, two;
 *   - enough damage in one spot opens it, as an arc or a vent, the same
 *     one every time; a vent empties, arcing settles into fits;
 *   - the list is capped, and the cold freckles go before the holes;
 *   - a hull back at full strength has no scars;
 *   - through Combat: an NPC shot from her right is scarred on her right;
 *     a shield that holds leaves nothing;
 *   - a station down the gun's line stops the shot, is scarred, and logs
 *     you - once per ten minutes;
 *   - Render.rayMesh finds the plating and its normal.
 */
global.window = global.window || global;
['vec3', 'rng', 'kepler', 'economy', 'generate', 'sim'].forEach(function (m) { require('../src/' + m + '.js'); });
var Sc = require('../src/scars.js');
var Combat = require('../src/combat.js');
require('../src/hulls.js');
require('../src/itemmodels.js');
require('../src/render.js');
var R = global.Render, V = global.V;

var pass = 0, fail = 0;
function check(n, c, d) {
  if (c) { pass++; console.log('  ok   ' + n + (d !== undefined ? '   ' + d : '')); }
  else { fail++; console.log('  FAIL  ' + n + (d !== undefined ? '   ' + d : '')); }
}
var frame = { right: { x: 1, y: 0, z: 0 }, up: { x: 0, y: 1, z: 0 }, fwd: { x: 0, y: 0, z: 1 } };

console.log('--- heat ---');
var tg = {};
var a = Sc.add(tg, frame, { x: 1, y: 0, z: 0 }, 0.05, 100, 'ship-a');
check('a hit leaves a hot spot on the side it came from', a && a.n.x > 0.99 && Sc.heatAt(a, 100) > 0.4, Sc.heatAt(a, 100).toFixed(2));
check('it cools on sim time', Sc.heatAt(a, 100 + Sc.HEAT_TAU) < Sc.heatAt(a, 100) * 0.4 && Sc.heatAt(a, 100 + 10 * Sc.HEAT_TAU) < 0.01);
var a2 = Sc.add(tg, frame, V.norm({ x: 1, y: 0.15, z: 0 }), 0.05, 101, 'ship-a');
check('a hit close by heats the same spot', a2 === a && tg.scars.length === 1 && Sc.heatAt(a, 101) > 0.8, Sc.heatAt(a, 101).toFixed(2));
Sc.add(tg, frame, { x: -1, y: 0, z: 0 }, 0.02, 102, 'ship-a');
check('one far round the hull is another spot', tg.scars.length === 2);
var rgbHot = Sc.heatRGB(Sc.HEAT_MAX), rgbDull = Sc.heatRGB(0.15);
check('white-hot is whiter than dull red', rgbHot[2] > 200 && rgbDull[2] < 60 && rgbHot[3] > rgbDull[3]);

console.log('--- breaches ---');
var tb = {}, kinds = {};
var sb = null;
for (var i = 0; i < 6; i++) sb = Sc.add(tb, frame, { x: 0, y: 1, z: 0 }, 0.03, 200 + i, 'ship-b');
check('enough in one place opens it', sb.kind === 'arc' || sb.kind === 'vent', sb.kind + ' at dose ' + sb.dose.toFixed(2));
var tb2 = {};
for (var j = 0; j < 6; j++) Sc.add(tb2, frame, { x: 0, y: 1, z: 0 }, 0.03, 200 + j, 'ship-b');
check('the same fight leaves the same wound', tb2.scars[0].kind === sb.kind);
for (var k = 0; k < 40; k++) {
  var tk = {};
  for (var q = 0; q < 6; q++) Sc.add(tk, frame, { x: 0, y: 0, z: 1 }, 0.03, q, 'kind-' + k);
  kinds[tk.scars[0].kind] = (kinds[tk.scars[0].kind] || 0) + 1;
}
check('both kinds happen', kinds.arc > 5 && kinds.vent > 5, JSON.stringify(kinds));
var vt = { kind: 'vent', openAt: 0 }, at = { kind: 'arc', openAt: 0 };
check('a vent empties', Sc.ventAt(vt, 1) > 0.95 && Sc.ventAt(vt, Sc.VENT_LIFE * 0.5) > 0.2 && Sc.ventAt(vt, Sc.VENT_LIFE + 1) === 0);
check('arcing settles into fits but does not stop', Sc.arcAt(at, 0) > 0.95 && Sc.arcAt(at, Sc.ARC_FADE * 3) > 0.2 && Sc.arcAt(at, Sc.ARC_FADE * 3) < 0.35);

console.log('--- the list ---');
var tc = {};
Sc.add(tc, frame, { x: 0, y: -1, z: 0 }, 0.2, 0, 'cap');           // a breach
for (var m = 0; m < 30; m++) {
  var th = m / 30 * Math.PI * 2;
  Sc.add(tc, frame, { x: Math.cos(th), y: 0.2, z: Math.sin(th) }, 0.004, 10 + m * 50, 'cap');
}
check('capped', tc.scars.length === Sc.MAX_SCARS, tc.scars.length);
check('the hole outlives the freckles', tc.scars.some(function (s) { return s.kind; }));
Sc.reconcile(tc, 80, 100);
check('a hurt hull keeps them', tc.scars.length === Sc.MAX_SCARS);
Sc.reconcile(tc, 100, 100);
check('patched to full, they are gone', tc.scars.length === 0);

console.log('--- through Combat ---');
var G = { t: 500, ship: { pos: { x: 0, y: 0, z: 0 }, fwd: { x: 0, y: 0, z: 1 } }, wanted: {} };
var spec = { id: 'n9', name: 'Test Mule', cls: 'freighter', kind: 'trader',
             live: { pos: { x: 100, y: 0, z: 0 }, right: { x: 0, y: 0, z: -1 }, up: { x: 0, y: 1, z: 0 }, fwd: { x: 1, y: 0, z: 0 } },
             shieldHp: 0, shieldMax: 0, hullMax: 100, hullHp: 100 };
Combat.markImpact(spec, { x: 100, y: 0, z: -50 }, { shield: 0, hull: 12 }, 500);
var s0 = spec.scars && spec.scars[0];
check('an NPC shot from her right is scarred on her right', !!s0 && s0.n.x > 0.99, s0 && JSON.stringify(s0.n));
var spec2 = { id: 'n10', live: spec.live, hullMax: 100 };
Combat.markImpact(spec2, { x: 100, y: 0, z: -50 }, { shield: 20, hull: 0 }, 500);
check('a shield that holds leaves nothing', !spec2.scars || !spec2.scars.length);

console.log('--- a station down the line ---');
var port = { id: 'p1', name: 'Test Dock', kind: 'station', radius: 2, faction: 'f1',
             orbit: null, parentBody: null };
var sysP = { ports: [port] };
var keepPos = global.Sim.bodyPosition;
global.Sim.bodyPosition = function (b) { return b === port ? { x: 0, y: 0, z: 30 } : keepPos.apply(null, arguments); };
var ph = Combat.portOnRay(sysP, G, 500, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, 50);
check('a port down the nose is hit at its plating', ph && Math.abs(ph.dist - 28) < 1e-6, ph && ph.dist);
check('one off to the side is not', !Combat.portOnRay(sysP, G, 500, { x: 0, y: 0, z: 0 }, V.norm({ x: 1, y: 0, z: 1 }), 50));
check('nor one beyond the gun\'s reach', !Combat.portOnRay(sysP, G, 500, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, 20));
var said = [];
var hooks = { say: function (s) { said.push(s); } };
Combat.stationStruck(sysP, G, 500, ph, 30, hooks);
check('the plating is scarred where it was hit', port.scars && port.scars.length === 1 && port.scars[0].n.z < -0.99);
check('and the station logs you', G.wanted.f1 === Combat.BOUNTY.assault && /FIRING ON TEST DOCK/.test(said[0] || ''), said[0]);
Combat.stationStruck(sysP, G, 560, ph, 30, hooks);
check('once per ten minutes, not per shot', G.wanted.f1 === Combat.BOUNTY.assault && said.length === 1);
Combat.stationStruck(sysP, G, 1200, ph, 30, hooks);
check('and again after', G.wanted.f1 === 2 * Combat.BOUNTY.assault);
var mine = { id: 'p2', name: 'Mine', radius: 1, playerStation: true };
var G2 = { t: 0, ship: {}, wanted: {} };
Combat.stationStruck({ ports: [mine] }, G2, 0, { port: mine, dist: 1, local: { n: { x: 0, y: 1, z: 0 } } }, 30, hooks);
check('your own station scars but does not book you', mine.scars.length === 1 && !G2.wanted.civil);
global.Sim.bodyPosition = keepPos;

console.log('--- the plating ---');
var cube = { v: [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1], [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]],
             f: [[0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4], [2, 3, 7, 6], [1, 2, 6, 5], [0, 3, 7, 4]] };
var rh = R.rayMesh(cube, [0, 0, 5], [0, 0, -1]);
check('a ray meets the near face', rh && Math.abs(rh.t - 4) < 1e-9 && rh.n[2] > 0.99, rh && JSON.stringify(rh));
check('and misses past the edge', !R.rayMesh(cube, [3, 0, 5], [0, 0, -1]));
var scS = { n: { x: 0, y: 1, z: 0 } };
R.hullScarPoint('courier', scS);
var hm = R.hullMeshFor('courier'), maxY = 0;
hm.v.forEach(function (p) { if (p[1] > maxY) maxY = p[1]; });
check('a ship scar sits on the hull, not off it', scS._p && scS._p[1] > 0 && scS._p[1] <= maxY + 1e-9 && scS._n[1] > 0,
      scS._p && scS._p.map(function (x) { return x.toFixed(3); }).join(','));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
