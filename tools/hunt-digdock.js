/* hunt-digdock.js (bug hunt 2026-11-21): docked at a world dig's port,
 * saved, reloaded into the same system. Still docked?
 */
'use strict';
global.window = global.window || global;
['vec3', 'rng', 'kepler', 'economy', 'appeal', 'generate', 'sim', 'rings', 'comsats', 'digs'].forEach(function (m) {
  require('../src/' + m + '.js');
});
require('../src/combat.js'); require('../src/hulls.js'); require('../src/outside.js');
var Galaxy = require('../src/galaxy.js'), Save = require('../src/save.js');
var Gen = global.Gen, Sim = global.Sim, Dg = global.Digs, DAY = 86400;
var gal = Galaxy.build('kawartha');

function newShip() {
  var sh = { hullId: 'talon', cargo: {}, credits: 5000, fittings: [] };
  global.Combat.initShip(sh); Sim.refreshShip(sh);
  sh.pos = { x: 0, y: 0, z: 0 }; sh.vel = { x: 0, y: 0, z: 0 };
  sh.fwd = { x: 0, y: 1, z: 0 }; sh.up = { x: 0, y: 0, z: 1 }; sh.right = { x: 1, y: 0, z: 0 };
  return sh;
}
var star = null, dig = null;
for (var i = 0; i < gal.stars.length && !dig; i++) {
  var st = gal.stars[i]; if (!st.factionId) continue;
  var probe = Gen.generateSystem(st.seed, Galaxy.systemOpts(gal, st)); probe.starId = st.id;
  var plan = Dg.planFor(probe, st.id);
  if (plan.length) { star = st; dig = plan[0]; }
}
function career(t) {
  var sys = Gen.generateSystem(star.seed, Galaxy.systemOpts(gal, star)); sys.starId = star.id;
  return { seed: 'kawartha', t: t, here: star, sys: sys, galaxy: gal, ship: newShip(), visited: {}, charted: {},
           standing: {}, surveys: {}, missions: [], digs: {}, comsats: [] };
}
var tOpen = dig.doneAt0 + 3 * DAY;
var A = career(tOpen);
Dg.inject(A, A.sys, star.id);
var port = A.sys.byId[dig.id];
Sim.dockShip(A.ship, port, A.sys, A.t);
console.log('dig ' + dig.id + ' (' + port.name + ' on ' + dig.bodyName + '), docked before save: ' + A.ship.docked);
var snap = JSON.parse(JSON.stringify(Save.snapshot(A)));
/* A fresh game in the same system at t = 0, then the save restored into it. */
var B = career(0);
Save.restore(B, snap, { enterSystem: function () { throw new Error('same star: not called'); } });
console.log('after reload: docked ' + B.ship.docked + ', port in system ' + !!B.sys.byId[dig.id]);
