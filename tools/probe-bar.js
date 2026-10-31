/* probe-bar.js - for tools/electron-probe.cjs: the dressed bar
 * (dressing.js, 2026-10-31). Out of your ship onto the station deck, into
 * the bar, and a look round it from the door, the middle, and the counter.
 *
 *     node tools/electron-probe.cjs tools/probe-bar.js
 */
const G = window.Game, Sim = window.Sim;
G.title = null;
let port = null;
const stars = G.galaxy.stars.slice().sort((a, b) =>
  window.Galaxy.distance3(a, G.here) - window.Galaxy.distance3(b, G.here));
const pick = Number(window.PROBE_PORT || 0);
let seen = 0;
for (const st of stars.slice(0, 30)) {
  if (st.id !== G.here.id) G.enterSystem(st, { fresh: true });
  port = G.sys.bodies.find(b => b.market && !b.surface && !b.underground) || null;
  if (port && seen++ >= pick) break;
}
if (!port) return 'FAIL: no orbital port';
Sim.dockShip(G.ship, port, G.sys, G.t);
G.panel = 0; G.viewMode = 'cockpit';
await wait(800);
await key('o');
await wait(1200);
if (!G.walk) return 'FAIL: O did not stand you up';
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
for (let i = 0; i < 4 && G.walk && G.walk.ship; i++) { if (!(await use('ramp'))) break; await wait(1500); }
if (!G.walk || G.walk.ship) return 'FAIL: station deck not reached';
const p = G.walk.plan, bar = p.rooms.find(r => r.id === 'bar');
const counts = { quads: (p.dress && p.dress.bar || []).length, props: p.items.filter(i => i.prop).length, seats: (p.seats || []).length };
const views = [
  ['bar-1-from-door', bar.x1 - 0.6, (bar.z0 + bar.z1) / 2, -Math.PI / 2, -0.08],
  ['bar-2-counter', bar.x0 + 4.2, (bar.z0 + bar.z1) / 2 + 0.5, -Math.PI / 2 - 0.25, -0.05],
  ['bar-3-sign', (bar.x0 + bar.x1) / 2, bar.z1 - 1.0, Math.PI, 0.08],
  ['bar-4-booth', (bar.x0 + bar.x1) / 2 - 1, bar.z0 + 1.5, 0.35, -0.05],
  ['bar-5-glyphs', (bar.x0 + bar.x1) / 2 - 1, (bar.z0 + bar.z1) / 2, Math.PI / 2, 0.1]
];
for (const v of views) {
  G.walk.x = v[1]; G.walk.z = v[2]; G.walk.yaw = v[3]; G.walk.pitch = v[4];
  await wait(1800);
  await shot(v[0]);
}
return 'port ' + port.name + ' | bar "' + bar.label + '" | ' + JSON.stringify(counts) + ' | fps ' + Math.round(G.fps || 0);
