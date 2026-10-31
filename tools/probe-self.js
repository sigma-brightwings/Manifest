/* probe-self.js - for tools/electron-probe.cjs: your own body and the
 * crouch (2026-10-31). Berthed at the nearest orbital port: stand up in your
 * ship, step clear of the seat and look down; crouch (Left Ctrl, held) and
 * look down and ahead; then out through the airlock onto the station deck
 * and the same again, walking.
 *
 *     node tools/electron-probe.cjs tools/probe-self.js
 */
const G = window.Game, Sim = window.Sim;
G.title = null;
let port = null;
const stars = G.galaxy.stars.slice().sort((a, b) =>
  window.Galaxy.distance3(a, G.here) - window.Galaxy.distance3(b, G.here));
for (const st of stars.slice(0, 20)) {
  if (st.id !== G.here.id) G.enterSystem(st, { fresh: true });
  port = G.sys.bodies.find(b => b.market && !b.surface && !b.underground) || null;
  if (port) break;
}
if (!port) return 'FAIL: no orbital port';
Sim.dockShip(G.ship, port, G.sys, G.t);
G.panel = 0; G.viewMode = 'cockpit';
await wait(800);
await key('o');
await wait(1200);
if (!G.walk) return 'FAIL: O did not stand you up';
const ctrl = (down) => window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { key: 'Control', code: 'ControlLeft' }));
const out = [];
const note = (tag) => out.push(tag + ' eye ' + (window.Walk.eyeOf(G.walk)).toFixed(2) + ' crouch ' + (G.walk.crouch || 0).toFixed(2));

/* A step aft of the seat, facing aft, into the open. */
G.walk.z -= 1.2;
if (!window.Walk.standable(G.walk.plan, G.walk.x, G.walk.z)) G.walk.z += 0.6;
G.walk.yaw = Math.PI;
G.walk.pitch = -1.45;
await wait(1200);
note('ship stand');
await shot('self-1-ship-look-down');
ctrl(true);
await wait(1200);
note('ship crouch');
await shot('self-2-ship-crouch-look-down');
G.walk.pitch = -0.05;
await wait(600);
await shot('self-3-ship-crouch-ahead');
ctrl(false);
await wait(1000);
note('ship up');

/* Out through the airlock: cycle it from the hatch, then the ramp item
 * (open the hatch, then step down onto the deck). */
const use = async (kind) => {
  const it = G.walk.plan.items.find(i => i.kind === kind);
  if (!it) return false;
  G.walk.x = it.x; G.walk.z = it.z;
  if (!window.Walk.standable(G.walk.plan, G.walk.x, G.walk.z)) { G.walk.x = it.x + 0.5; }
  await wait(200);
  G.walk.near = it;
  await key('e');
  return true;
};
await use('hatch');
await wait(9000);
for (let i = 0; i < 4 && G.walk && G.walk.ship; i++) {
  if (!(await use('ramp'))) break;
  await wait(1500);
}
if (!G.walk || G.walk.ship) {
  out.push('(station deck not reached: ' + (G.message || '') + ')');
  return 'port ' + port.name + ' | ' + out.join(' | ');
}
G.walk.x = 0; G.walk.z = 1.5; G.walk.yaw = 0; G.walk.pitch = -1.45;
await wait(2000);
note('deck stand');
await shot('self-4-deck-look-down');
window.dispatchEvent(new KeyboardEvent('keydown', { key: 'w', code: 'KeyW' }));
await wait(450);
await shot('self-5-deck-walking-look-down');
window.dispatchEvent(new KeyboardEvent('keyup', { key: 'w', code: 'KeyW' }));
ctrl(true);
await wait(1200);
note('deck crouch');
await shot('self-6-deck-crouch-look-down');
G.walk.pitch = -0.5;
await wait(500);
await shot('self-7-deck-crouch-half-down');
ctrl(false);
await wait(800);
note('deck up');
return 'port ' + port.name + ' | ' + out.join(' | ');
