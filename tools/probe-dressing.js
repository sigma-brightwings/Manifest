/* probe-dressing.js - for tools/electron-probe.cjs: every dressed room of a
 * station deck (dressing.js, 2026-10-31). Out of your ship onto the deck,
 * then a shot or two of the berth, the spine, the L port, the concourse,
 * the crew hall and the bar.
 *
 *     node tools/electron-probe.cjs tools/probe-dressing.js
 */
const G = window.Game, Sim = window.Sim;
G.title = null;
let port = null;
const stars = G.galaxy.stars.slice().sort((a, b) =>
  window.Galaxy.distance3(a, G.here) - window.Galaxy.distance3(b, G.here));
for (const st of stars.slice(0, 30)) {
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
const p = G.walk.plan, R = id => p.rooms.find(r => r.id === id);
const spine = R('spine'), lport = R('lport'), conc = R('concourse'), hall = R('crewhall'), bar = R('bar');
const mine = p.items.find(i => i.kind === 'mine'), berth = mine ? R(mine.berth) : p.rooms.find(r => r.kind === 'berth');
const bmx = (berth.x0 + berth.x1) / 2, bmz = (berth.z0 + berth.z1) / 2;
const views = [
  ['d1-berth', berth.side < 0 ? berth.x1 - 0.8 : berth.x0 + 0.8, bmz + 1.5, berth.side < 0 ? -Math.PI / 2 - 0.4 : Math.PI / 2 + 0.4, 0],
  ['d2-spine-north', 0, 1.2, 0, 0.02],
  ['d3-spine-south', 0, spine.z1 - 1.2, Math.PI, 0.02],
  ['d4-lport', 0, -1.5, Math.PI, 0.05],
  ['d5-concourse-in', 0, conc.z0 + 1.0, 0, 0.05],
  ['d6-concourse-noodles', conc.x0 + 8.5, conc.z0 + 2.8, -Math.PI / 2 - 0.2, -0.05],
  ['d7-concourse-back', 2, conc.z1 - 3, Math.PI + 0.3, 0.1],
  ['d8-crewhall', hall.x0 + 0.8, (hall.z0 + hall.z1) / 2, Math.PI / 2, 0],
  ['d9-bar', bar.x1 - 0.6, (bar.z0 + bar.z1) / 2, -Math.PI / 2, -0.08]
];
for (const v of views) {
  G.walk.x = v[1]; G.walk.z = v[2]; G.walk.yaw = v[3]; G.walk.pitch = v[4];
  await wait(1600);
  await shot(v[0]);
}
const counts = {};
Object.keys(p.dress || {}).forEach(k => { counts[k] = p.dress[k].length; });
const total = Object.values(counts).reduce((a, b) => a + b, 0);
/* Can you still walk from your berth to every room? */
const reach = {};
['spine', 'lport', 'concourse', 'crewhall', 'bar'].forEach(id => { const r = R(id); reach[id] = window.Walk.standable(p, (r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2); });
return 'port ' + port.name + ' | quads ' + total + ' ' + JSON.stringify(counts) + ' | props ' + p.items.filter(i => i.prop).length +
       ' | seats ' + (p.seats || []).length + ' | fps ' + Math.round(G.fps || 0) + ' | centres standable ' + JSON.stringify(reach);
