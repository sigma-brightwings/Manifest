if (window.Sound && window.Sound.mute) window.Sound.mute(true);   // quiet: someone is using this computer
/* probe-people.js — for tools/electron-probe.cjs: the Quaternius bodies in
 * the game (2026-10-26). Steps out onto a station deck (through the
 * airlock: cycled out, hatch open, down into the berth), lines up one of
 * every role across the concourse, walks a few of them, shoots the line
 * from far and near, and talks to two people.
 *
 *     node tools/electron-probe.cjs tools/probe-people.js "Claude outputs\people-probe"
 */
const G = window.Game, Sim = window.Sim, Combat = window.Combat, NM = window.NpcModel;
G.title = null;
let port = null;
const stars = G.galaxy.stars.slice().sort((a, b) => window.Galaxy.distance3(a, G.here) - window.Galaxy.distance3(b, G.here));
for (const st of stars.slice(0, 40)) {
  if (st.id !== G.here.id) G.enterSystem(st, { fresh: true });
  const y = G.sys.bodies.find(b => b.market && Combat.isShipyard(b) && !b.surface && !b.underground);
  if (y) { Sim.dockShip(G.ship, y, G.sys, G.t); port = y; break; }
}
if (!port) return 'FAIL: no yard';
G.panel = 0; G.viewMode = 'cockpit';
await wait(1000);
await key('o');
await wait(1200);
if (window.Airlock) { const a = window.Airlock.state(G.ship); a.side = 'out'; a.cycle = null; a.hatch = 1; }
const way = G.walk && G.walk.plan.items.find(it => it.kind === 'ramp') || G.walk && G.walk.plan.items.find(it => it.kind === 'hatch');
if (!way) return 'FAIL: no way out (' + (G.walk ? G.walk.plan.items.map(i => i.kind).join(',') : 'not walking') + ')';
G.walk.x = way.x; G.walk.z = way.z;
G.walk.near = Object.assign({}, way);
await wait(300);
await key('e');
await wait(2000);
if (!G.walk || G.walk.ship) return 'FAIL: not on the station deck';
const sp = G.walk.plan, conc = sp.rooms.find(r => r.id === 'concourse');
const sc = window.Npc.lastScene;
const roles = NM.ROLES.map(r => r.key);
const zc = (conc.z0 + conc.z1) / 2;
const line = roles.map((k, i) => ({
  id: 'people|' + k, name: ['Ines Varga', 'Tobiah Rusk', 'Pell Achterberg', 'Dana Mbeki', 'Ruslan Okonkwo', 'Yusuf Halloran', 'Grit Solberg',
                            'Scab', 'Mother Corrow', 'Mr. Lisle', 'Bruno Kasza', 'Celeste Aumont', 'Pvt. Okafor', 'Lt. Imre Vass'][i] || k,
  body: k, role: k, liv: k === 'marine' || k === 'officer' ? 'navy' : (k === 'enforcer' || k === 'heavy' || k === 'fixer') ? 'syn' : (k === 'raider' || k === 'captain') ? 'pir' : ['civ', 'navy', 'syn'][i % 3],
  x: conc.x0 + 1 + i * ((conc.x1 - conc.x0 - 2) / (roles.length - 1)), z: zc + 1.5, yaw: Math.PI, path: [], goal: null,
  act: 'stand', until: 1e12, n: 0, phase: i, gait: 0, sit: 0, lie: 0, work: 0, wait: 0, model: null, mats: null, line: 0,
  task: { act: 'stand', at: { x: 0, z: 0 } }
}));
line.forEach(p => { p.task.at = { x: p.x, z: p.z }; sc.people.push(p); });
G.walk.x = (conc.x0 + conc.x1) / 2; G.walk.z = zc - 3.2; G.walk.yaw = 0; G.walk.pitch = -0.02;
await wait(4000);
const built = line.filter(p => p.rig).length;
await shot('people-1-lineup');
for (let s = 0; s < 4; s++) {
  const a = line[Math.round(s * (line.length - 1) / 3)], b = line[Math.min(line.length - 1, Math.round(s * (line.length - 1) / 3) + 1)];
  G.walk.x = (a.x + b.x) / 2; G.walk.z = zc - 0.4; G.walk.yaw = 0; G.walk.pitch = 0.0;
  await wait(1500);
  await shot('people-2-close-' + s);
}
/* The station's own people, going about their business. */
const locals = sc.people.filter(p => !/^people\|/.test(p.id) && !p.away);
const walker = locals.find(p => p.gait > 0.5) || locals[0];
if (walker) {
  G.walk.x = walker.x - Math.sin(walker.yaw || 0) * -3; G.walk.z = walker.z + 3;
  G.walk.yaw = Math.atan2(walker.x - G.walk.x, walker.z - G.walk.z);
  await wait(800);
  await shot('people-3-local');
}
/* Diagnostics: the line again with the kit hidden, then the body hidden. */
const dbgP = line[3];
G.walk.x = dbgP.x; G.walk.z = zc - 0.2; G.walk.yaw = 0; G.walk.pitch = 0.05;
await wait(800);
await shot('people-5-both');
const kitCounts = line.map(p => p.rig && p.rig._gl ? p.rig._gl.count : 0);
line.forEach(p => { if (p.rig && p.rig._gl) p.rig._gl.count = 0; });
await wait(400);
await shot('people-5-body-only');
line.forEach((p, i) => { if (p.rig && p.rig._gl) p.rig._gl.count = kitCounts[i]; });
const bm = dbgP.rig.mesh._gl, bc = bm.count; bm.count = 0;
await wait(400);
await shot('people-5-kit-only');
bm.count = bc;
/* And with the old figures taken out of what figures() hands on. */
const realFig = window.Npc.figures;
window.Npc.figures = function () { return realFig.apply(this, arguments).map(f => f.rig ? Object.assign({}, f, { model: null, mats: null }) : f); };
await wait(500);
await shot('people-5-no-old');
window.Npc.figures = realFig;
const notes = ['lineup ' + line.length + ', on the new bodies ' + built, 'locals ' + locals.length + ' (' + locals.filter(p => p.rig).length + ' new)'];
for (const who of [line[5], line[12]]) {
  G.talk = null;
  G.walk.x = who.x; G.walk.z = who.z - 1.2; G.walk.yaw = 0; G.walk.pitch = 0.05;
  await wait(500);
  G.walk.near = { kind: 'npc', npc: who, label: 'Talk to ' + who.name, x: who.x, z: who.z };
  await key('e');
  await wait(1200);
  await shot('people-4-talk-' + who.role);
  await key('Escape');
  await wait(300);
}
return notes.join('\n') + '\nfps ' + Math.round(G.fps);
