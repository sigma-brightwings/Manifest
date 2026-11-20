/* probe-notices.js - the concourse noticeboard (2026-11-19). Onto the deck
 * at Threshold, then faces the noticeboard from across the room, mid and
 * reading distance, and from an angle; then E on it.
 *
 *     node tools/electron-probe.cjs tools/probe-notices.js <shots dir>
 */
const G = window.Game, Sim = window.Sim;
G.title = null;
const port = G.sys.bodies.find(b => /Threshold/.test(b.name || '')) || G.sys.bodies.find(b => b.market && !b.surface);
Sim.dockShip(G.ship, port, G.sys, G.t);
G.panel = 0; G.viewMode = 'cockpit';
await wait(1200);
G.startWalk(true);
await wait(1500);
if (!G.walk || G.walk.ship) return 'FAIL: not on the deck';
const p = G.walk.plan, b = (p.boards || []).find(x => x.kind === 'notices');
if (!b) return 'FAIL: no noticeboard in plan';
const out = ['port ' + port.name + ' notices ' + b.x0 + '..' + b.x1 + ' z ' + b.z.toFixed(1)];
const mid = (b.x0 + b.x1) / 2;
for (const [name, dz, dx, yaw] of [['notices-far', 12, 3, Math.PI - 0.25], ['notices-mid', 5, 0, Math.PI], ['notices-near', 2.2, 0, Math.PI], ['notices-angle', 2.6, 2.6, Math.PI + 0.7]]) {
  G.walk.x = mid + dx; G.walk.z = b.z + dz; G.walk.yaw = yaw; G.walk.pitch = name === 'notices-near' ? 0.05 : 0.12;
  await wait(1600);
  await shot(name);
}
const it = p.items.find(i => i.kind === 'notices');
out.push('item ' + (it ? it.label + ' at ' + it.x.toFixed(1) + ',' + it.z.toFixed(1) : 'MISSING'));
G.walk.x = it.x; G.walk.z = it.z + 0.4; G.walk.yaw = Math.PI;
await wait(600);
await key('e');
await wait(900);
out.push('panel after E: ' + G.panel);
await shot('notices-e');
return out.join('\n');
