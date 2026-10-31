/* probe-ramp-flash.js - for tools/electron-probe.cjs (2026-10-31). Astra:
 * "when traversing the ramp, ship detail flashes on screen". Berthed, down
 * her ramp onto the hangar floor, then back up it in short steps with a
 * shot after each, the walker's state logged per step.
 *
 *     node tools/electron-probe.cjs tools/probe-ramp-flash.js ".probe-shots\rf"
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
await wait(8000);
await key('o');
await wait(1200);
if (!G.walk) return 'FAIL: no walk';
const R = window.Render, lp = R.shipInterior(G.ship).plan, rp = lp.ramp;
const main = lp.decks ? lp.decks.main : lp;
const hold = async (k, ms) => {
  window.dispatchEvent(new KeyboardEvent('keydown', { key: k, code: 'Key' + k.toUpperCase() }));
  await wait(ms);
  window.dispatchEvent(new KeyboardEvent('keyup', { key: k, code: 'Key' + k.toUpperCase() }));
};
if (G.walk.plan !== main) G.walk.plan = main;
G.walk.x = (rp.x0 + rp.x1) / 2; G.walk.z = rp.hinge + 0.6; G.walk.yaw = Math.PI; G.walk.pitch = 0;
await wait(800);
await hold('w', 3400);
await wait(300);
const out = ['floor: ship ' + !!G.walk.ship];
G.walk.yaw += Math.PI; G.walk.pitch = 0;
await wait(600);
for (let i = 0; i < 16; i++) {
  await hold('w', 160);
  await wait(60);
  out.push(i + ': ' + (G.walk.ship ? 'SHIP' : 'hangar') + ' dy ' + (G.walk.dy || 0).toFixed(2) + ' eyeDy ' + (G.walk.eyeDy || 0).toFixed(2) + ' crouch ' + (G.walk.crouch || 0).toFixed(2));
  await shot('s' + String(i).padStart(2, '0'));
}
return out.join(' | ');
