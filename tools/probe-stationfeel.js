/* probe-stationfeel.js - a look round a station on foot, for the "make the
 * first-person stations more engaging" plan (2026-11-18). Steps off the
 * ship, stands in the bar, the concourse, the cargo hall and the spine,
 * and shoots each; then stands in the bar for 20 s and logs who is there
 * and what they are doing.
 *
 *     node tools/electron-probe.cjs tools/probe-stationfeel.js
 */
const G = window.Game, Sim = window.Sim;
G.title = null;
const port = G.sys.bodies.find(b => b.market && !b.surface && !b.underground);
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
  if (!window.Walk.standable(G.walk.plan, G.walk.x, G.walk.z)) G.walk.x = it.x + 0.5;
  await wait(200); G.walk.near = it; await key('e'); return true;
};
await use('hatch');
await wait(9000);
for (let i = 0; i < 4 && G.walk && G.walk.ship; i++) { if (!(await use('ramp'))) break; await wait(1500); }
if (!G.walk || G.walk.ship) return 'FAIL: station deck not reached';
const p = G.walk.plan, out = ['port ' + port.name + ' (' + (port.livery || 'civ') + ')'];
const room = id => p.rooms.find(r => r.id === id);
const views = [];
const add = (name, r, fx, fz, yaw, pitch) => { if (r) views.push([name, r.x0 + (r.x1 - r.x0) * fx, r.z0 + (r.z1 - r.z0) * fz, yaw, pitch]); };
add('feel-bar', room('bar'), 0.85, 0.5, -Math.PI / 2, -0.05);
add('feel-concourse', p.rooms.find(r => r.kind === 'concourse'), 0.5, 0.15, 0, -0.03);
add('feel-cargo', room('cargo'), 0.5, 0.1, 0, 0.02);
add('feel-spine', p.rooms.find(r => r.kind === 'corridor'), 0.5, 0.1, 0, -0.02);
for (const v of views) {
  G.walk.x = v[1]; G.walk.z = v[2]; G.walk.yaw = v[3]; G.walk.pitch = v[4];
  await wait(2000);
  await shot(v[0]);
}
const bar = room('bar');
G.walk.x = views[0][1]; G.walk.z = views[0][2];
const seen = {};
for (let s = 0; s < 10; s++) {
  await wait(2000);
  const sc = G.npcSceneNow ? G.npcSceneNow() : null;
  const ppl = (sc && sc.people) || [];
  for (const q of ppl) {
    const inBar = q.x >= bar.x0 && q.x <= bar.x1 && q.z >= bar.z0 && q.z <= bar.z1;
    if (!inBar) continue;
    const k = (q.role || '?') + ':' + (q.act || '?');
    seen[k] = (seen[k] || 0) + 1;
  }
  if (s === 0) out.push('scene people total: ' + ppl.length);
}
out.push('people seen over 20 s (role, times): ' + JSON.stringify(seen));
out.push('items: ' + p.items.filter(i => !i.prop).map(i => i.kind).join(', '));
out.push('fps ' + Math.round(G.fps || 0));
return out.join('\n');
