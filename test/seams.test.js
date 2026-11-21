/* seams.test.js - the bug hunt of 2026-11-21, pinned.
 *
 *     node test/seams.test.js
 *
 * Every bug this hunt found lived where two systems built on their own
 * meet, and each system's own suite was green. Pinned here, one per seam:
 *  1. COM-SATS x DIGS: a world dig opened mid-session had no relays until
 *     you reloaded, then six. Relay cover must not depend on when you looked.
 *  2. MIL-SATS x LATE PORTS: a companion moon's station ('b0cp1' sorts
 *     before 'b12') took platforms off older ports.
 *  3. MIL-SATS x LATE ROUTES: a resort's or companion's routes moved an
 *     older port's approach corridor, and a platform with it.
 *  4. SAVES x DIGS: docked at a dig's port, saved, reloaded: undocked at the
 *     foot of the shaft.
 *  5. SLIPSPACE x BINARIES: a distant companion star dragged the jump ring,
 *     and every wake, out with her (Mirven 2.2 AU -> 9.4, Dratara 27 -> 3,450).
 */
'use strict';
global.window = global.window || global;
['vec3', 'rng', 'kepler', 'economy', 'appeal', 'generate', 'sim', 'rings', 'rumours', 'comsats', 'digs', 'slipspace']
  .forEach(function (m) { require('../src/' + m + '.js'); });
require('../src/combat.js'); require('../src/hulls.js'); require('../src/outside.js'); require('../src/milsats.js');
var Galaxy = require('../src/galaxy.js'), Save = require('../src/save.js');
var Gen = global.Gen, Sim = global.Sim, V = global.V, Cs = global.Comsats, Dg = global.Digs, Ms = global.Milsats, Sl = global.Slipspace;
var DAY = 86400, AU = 1.495978707e8;

var pass = 0, fail = 0;
function check(n, c, d) {
  if (c) { pass++; console.log('  ok   ' + n + (d !== undefined ? '   ' + d : '')); }
  else { fail++; console.log('  FAIL ' + n + (d !== undefined ? '   ' + d : '')); }
}
var gal = Galaxy.build('kawartha');
var claimed = gal.stars.filter(function (s) { return s.factionId; });
function sysOf(st, extra) {
  var s = Gen.generateSystem(st.seed, Object.assign({}, Galaxy.systemOpts(gal, st), extra || {}));
  s.starId = st.id; return s;
}

console.log('--- 1. relay cover does not depend on when you looked ---');
var digWorlds = 0, differ = 0;
claimed.slice(0, 80).forEach(function (st) {
  Dg.planFor(sysOf(st), st.id).forEach(function (dig) {
    var tOpen = dig.doneAt0 + DAY;
    var A = sysOf(st), GA = { t: dig.startAt, digs: {}, comsats: [] };
    Cs.relaysFor(A, st.id);                         // asked on arrival
    Dg.update(GA, A, st.id, tOpen, null);           // it opens while you are there
    var B = sysOf(st), GB = { t: tOpen, digs: {}, comsats: [] };
    Dg.inject(GB, B, st.id);                        // after a reload
    digWorlds++;
    var key = function (s) { return Cs.relaysFor(s, st.id).map(function (r) { return r.id; }).join(); };
    if (key(A) !== key(B)) differ++;
  });
});
check('the same relays whether a dig opened before or after you arrived', digWorlds > 0 && differ === 0,
      differ + ' of ' + digWorlds + ' digs differ');

console.log('--- 2 and 3. platforms stay on the ports, and the corridors, they had ---');
var guarded = 0, reassigned = 0, movedKm = 0;
claimed.forEach(function (st) {
  var A = sysOf(st), B = sysOf(st, { noMultiples: true, noResorts: true });
  var pa = Ms.platformsFor(A, st, gal), pb = Ms.platformsFor(B, st, gal);
  if (!pa.length) return;
  guarded++;
  if (pa.map(function (p) { return p.id; }).join() !== pb.map(function (p) { return p.id; }).join()) { reassigned++; return; }
  pa.forEach(function (p, i) { movedKm = Math.max(movedKm, V.dist(Ms.posOf(A, p, 1e6), Ms.posOf(B, pb[i], 1e6))); });
});
check('no platform goes to a port added after generation', guarded > 0 && reassigned === 0, reassigned + ' of ' + guarded + ' systems');
check('and none moves because later routes call at its port', movedKm < 1e-6, movedKm.toFixed(3) + ' km at worst');

console.log('--- 4. docked at a dig, saved, reloaded ---');
var star = null, dig = null;
for (var i = 0; i < claimed.length && !dig; i++) {
  var plan = Dg.planFor(sysOf(claimed[i]), claimed[i].id);
  if (plan.length) { star = claimed[i]; dig = plan[0]; }
}
function newShip() {
  var sh = { hullId: 'talon', cargo: {}, credits: 5000, fittings: [] };
  global.Combat.initShip(sh); Sim.refreshShip(sh);
  sh.pos = { x: 0, y: 0, z: 0 }; sh.vel = { x: 0, y: 0, z: 0 };
  sh.fwd = { x: 0, y: 1, z: 0 }; sh.up = { x: 0, y: 0, z: 1 }; sh.right = { x: 1, y: 0, z: 0 };
  return sh;
}
function career(t) {
  return { seed: 'kawartha', t: t, here: star, sys: sysOf(star), galaxy: gal, ship: newShip(), visited: {}, charted: {},
           standing: {}, surveys: {}, missions: [], digs: {}, comsats: [] };
}
var A4 = career(dig.doneAt0 + 3 * DAY);
Dg.inject(A4, A4.sys, star.id);
Sim.dockShip(A4.ship, A4.sys.byId[dig.id], A4.sys, A4.t);
var snap = JSON.parse(JSON.stringify(Save.snapshot(A4)));
var B4 = career(0);
Save.restore(B4, snap, { enterSystem: function () {} });
check('docked at the same dig port after the reload', A4.ship.docked === dig.id && B4.ship.docked === dig.id,
      'before ' + A4.ship.docked + ', after ' + B4.ship.docked);
/* A dig hurried open by your supplies: open on the reload too. */
var A5 = career(dig.startAt + DAY);
A5.digs[dig.id] = { doneAt: dig.startAt + DAY };
Dg.inject(A5, A5.sys, star.id);
Sim.dockShip(A5.ship, A5.sys.byId[dig.id], A5.sys, A5.t);
var B5 = career(0);
Save.restore(B5, JSON.parse(JSON.stringify(Save.snapshot(A5))), { enterSystem: function () {} });
check('and a dig your supplies brought forward is open again on the reload', B5.ship.docked === dig.id, String(B5.ship.docked));

console.log('--- 5. the jump ring is the planets\', not a companion star\'s ---');
var comp = 0, moved = 0, home = null;
claimed.slice(0, 200).forEach(function (st) {
  var A = sysOf(st);
  if (!A.companion) return;
  comp++;
  var B = sysOf(st, { noMultiples: true });
  if (Math.abs(Sl.jumpRingRadius(A) - Sl.jumpRingRadius(B)) > 1) moved++;
  if (st.id === gal.stars[0].id) home = Sl.jumpRingRadius(A) / AU;
});
check('a companion does not move the jump ring', comp > 0 && moved === 0, moved + ' of ' + comp + ' systems');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
