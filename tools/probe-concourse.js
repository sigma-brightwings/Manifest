/* probe-concourse.js - the station speaks (2026-11-18). Onto the deck at
 * Threshold, into the concourse facing the departures board from three
 * distances, then stands among people for a while and logs what the PA
 * and passers-by say.
 *
 *     node tools/electron-probe.cjs tools/probe-concourse.js
 */
const G = window.Game, Sim = window.Sim;
G.title = null;
const port = G.sys.bodies.find(b => /Threshold/.test(b.name || '')) || G.sys.bodies.find(b => b.market && !b.surface);
Sim.dockShip(G.ship, port, G.sys, G.t);
G.panel = 0; G.viewMode = 'cockpit';
await wait(1200);
G.wanted = G.wanted || {}; G.wanted[G.here.factionId] = 600;
G.startWalk(true);
await wait(1500);
if (!G.walk || G.walk.ship) return 'FAIL: not on the deck (ship=' + (G.walk && G.walk.ship) + ')';
const p = G.walk.plan, b = (p.boards || [])[0];
if (!b) return 'FAIL: no board in plan';
const out = ['port ' + port.name + ' board ' + b.x0 + '..' + b.x1 + ' z ' + b.z.toFixed(1)];
const said = [];
const orig = G.message;
let last = null;
const watch = setInterval(() => { if (G.message && G.message !== last) { last = G.message; said.push(G.message); } }, 200);
for (const [name, dz, dx] of [['board-far', 14, 0], ['board-mid', 8, 0], ['board-near', 4.5, -1.5]]) {
  G.walk.x = (b.x0 + b.x1) / 2 + dx; G.walk.z = b.z + dz; G.walk.yaw = Math.PI; G.walk.pitch = 0.18;
  await wait(1800);
  await shot(name);
}
/* Among people: the bar, then the concourse middle. */
const bar = p.rooms.find(r => r.id === 'bar'), cc = p.rooms.find(r => r.kind === 'concourse');
for (const r of [bar, cc, bar]) {
  if (!r) continue;
  const sc = G.npcSceneNow && G.npcSceneNow();
  const near = sc && sc.people ? sc.people.filter(q => q.x > r.x0 && q.x < r.x1 && q.z > r.z0 && q.z < r.z1) : [];
  for (const q of near.slice(0, 5)) { G.walk.x = q.x + 1; G.walk.z = q.z; await wait(1500); }
}
await wait(8000);
clearInterval(watch);
out.push('said (' + said.length + '):');
said.forEach(s => out.push('  ' + s));
out.push('fps ' + Math.round(G.fps || 0));
return out.join('\n');
