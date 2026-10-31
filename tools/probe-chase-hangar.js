/* probe-chase-hangar.js - for tools/electron-probe.cjs: berthed in your
 * hangar, seated, the chase camera orbiting her (2026-10-31). Astra: "the
 * interior of the station is not visible when using the chase camera that
 * orbits the ship."
 *
 *     node tools/electron-probe.cjs tools/probe-chase-hangar.js
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
await wait(6000);
/* From the seat first: her hangar out of the glass, not the model's bay. */
G.viewMode = 'cockpit';
await wait(800);
await shot('seat');
await key('F1');
await wait(300);
if (G.viewMode === 'cockpit') G.viewMode = 'orbit';
await wait(1500);
const info = [];
const d0 = G.cam.dist;
info.push('view ' + G.viewMode + ' dist ' + (d0 * 1000).toFixed(1) + ' m yaw ' + (G.cam.yaw || 0).toFixed(2));
await shot('chase-1');
for (let i = 2; i <= 4; i++) {
  if (typeof G.cam.yaw === 'number') G.cam.yaw += Math.PI / 2;
  if (typeof G.cam.pitch === 'number') G.cam.pitch = 0.25;
  await wait(1200);
  await shot('chase-' + i);
}
G.cam.dist = d0 * 0.4;
await wait(1200);
await shot('chase-close');
G.cam.dist = d0 * 5; G.cam.pitch = 0.5;
await wait(1200);
info.push('asked ' + (d0 * 5000).toFixed(0) + ' m, got ' + (G.cam.dist * 1000).toFixed(1) + ' m');
await shot('chase-far');
/* Round her from as far back as the walls allow: the berth hand and the
 * pointer that is no longer there (2026-10-31). */
for (let i = 1; i <= 4; i++) {
  G.cam.yaw += Math.PI / 2; G.cam.pitch = 0.35; G.cam.dist = d0 * 5;
  await wait(1000);
  await shot('round-' + i);
}
info.push('cam keys ' + Object.keys(G.cam).join(','));
return info.join(' | ');
