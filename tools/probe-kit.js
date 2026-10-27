/* probe-kit.js — for tools/electron-probe.cjs: the face kit that shows
 * through a sealed suit, on every body (2026-10-26). Lines up one of every
 * role on a station concourse wearing every piece that shows (eyepiece or
 * cyber-eye, goggles, rebreather, headset), then shots close along the line
 * and talks to two of them for the suit in the portrait.
 *
 *     node tools/electron-probe.cjs tools/probe-kit.js "Claude outputs\kit-probe"
 */
const G = window.Game, Sim = window.Sim, Combat = window.Combat, NM = window.NpcModel, PT = window.Portrait;
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
const hatch = G.walk.plan.items.find(it => it.kind === 'hatch');
G.walk.x = hatch.x + 0.5; G.walk.z = hatch.z; G.walk.yaw = -Math.PI / 2;
await wait(400);
await key('e');
await wait(2000);
if (!G.walk || G.walk.ship) return 'FAIL: not on the station deck';
/* Everyone in the line wears everything that shows. */
const realGear = PT.gearOf;
PT.gearOf = p => /^kit\|/.test(p.id)
  ? (NM.ROLES.findIndex(r => 'kit|' + r.key === p.id) % 2 ? { cybereye: { side: 'L', tint: 0.1 }, goggles: { side: 'R', tint: 0.6 }, headset: { side: 'R', tint: 0 }, rebreather: { side: 'L', tint: 0 } }
                 : { eyepiece: { side: 'R', tint: 0.3 }, goggles: { side: 'L', tint: 0.9 }, headset: { side: 'L', tint: 0 }, rebreather: { side: 'R', tint: 0 } })
  : realGear(p);
const sp = G.walk.plan, conc = sp.rooms.find(r => r.id === 'concourse');
const sc = window.Npc.lastScene;
const roles = NM.ROLES.map(r => r.key);
const zc = (conc.z0 + conc.z1) / 2;
const line = roles.map((k, i) => ({
  id: 'kit|' + k, name: 'Kit ' + k, body: k, role: k,
  liv: k === 'marine' || k === 'officer' ? 'navy' : (k === 'enforcer' || k === 'heavy' || k === 'fixer') ? 'syn' : (k === 'raider' || k === 'captain') ? 'pir' : ['civ', 'navy', 'syn'][i % 3],
  x: conc.x0 + 1 + i * ((conc.x1 - conc.x0 - 2) / (roles.length - 1)), z: zc + 1.5, yaw: Math.PI, path: [], goal: null,
  act: 'stand', until: 1e12, n: 0, phase: i, gait: 0, sit: 0, lie: 0, work: 0, wait: 0, model: null, mats: null, line: 0,
  task: { act: 'stand', at: { x: 0, z: 0 } }
}));
line.forEach(p => { p.task.at = { x: p.x, z: p.z }; sc.people.push(p); });
G.walk.x = (conc.x0 + conc.x1) / 2; G.walk.z = zc - 3.2; G.walk.yaw = 0; G.walk.pitch = -0.02;
await wait(3500);
await shot('kit-1-lineup');
const notes = ['lineup ' + line.length, 'built with kit: ' + line.filter(p => p.model && p.model.gear).map(p => p.role).join(',')];
for (let s = 0; s < 4; s++) {
  const a = line[Math.round(s * (line.length - 1) / 3)], b = line[Math.min(line.length - 1, Math.round(s * (line.length - 1) / 3) + 1)];
  G.walk.x = (a.x + (b ? b.x : a.x)) / 2; G.walk.z = zc + 0.1; G.walk.yaw = 0; G.walk.pitch = 0.04;
  await wait(1500);
  await shot('kit-2-close-' + s);
}
for (const who of [line[3], line[12]]) {
  G.talk = null;
  G.walk.x = who.x; G.walk.z = who.z - 1.1; G.walk.yaw = 0; G.walk.pitch = 0.0;
  await wait(500);
  G.walk.near = { kind: 'npc', npc: who, label: 'Talk to ' + who.name, x: who.x, z: who.z };
  await key('e');
  await wait(900);
  await shot('kit-3-talk-' + who.role);
  await key('Escape');
  await wait(300);
}
PT.gearOf = realGear;
return notes.join('\n') + '\nfps ' + Math.round(G.fps);
