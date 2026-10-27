/* probe-suits.js — for tools/electron-probe.cjs: everybody in a pressure suit,
 * and the face under the helmet in conversation (2026-10-25). Steps out onto
 * a station deck, lines up one of every role across the concourse, then
 * talks to the bartender.
 *
 *     node tools/electron-probe.cjs tools/probe-suits.js "Claude outputs\suits-probe"
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
const hatch = G.walk.plan.items.find(it => it.kind === 'hatch');
G.walk.x = hatch.x + 0.5; G.walk.z = hatch.z; G.walk.yaw = -Math.PI / 2;
await wait(400);
await key('e');
await wait(2000);
if (!G.walk || G.walk.ship) return 'FAIL: not on the station deck';
const sp = G.walk.plan, conc = sp.rooms.find(r => r.id === 'concourse');
const sc = window.Npc.lastScene;
const roles = NM.ROLES.map(r => r.key);
const zc = (conc.z0 + conc.z1) / 2;
const line = roles.map((k, i) => ({
  id: 'lineup|' + k, name: ['Ines Varga', 'Tobiah Rusk', 'Pell Achterberg', 'Dana Mbeki', 'Ruslan Okonkwo', 'Yusuf Halloran', 'Grit Solberg',
                          'Scab', 'Mother Corrow', 'Mr. Lisle', 'Bruno Kasza', 'Celeste Aumont', 'Pvt. Okafor', 'Lt. Imre Vass'][i] || k,
  body: k, role: k, liv: k === 'marine' || k === 'officer' ? 'navy' : (k === 'enforcer' || k === 'heavy' || k === 'fixer') ? 'syn' : (k === 'raider' || k === 'captain') ? 'pir' : 'civ',
  x: conc.x0 + 1 + i * ((conc.x1 - conc.x0 - 2) / (roles.length - 1)), z: zc + 1.5, yaw: Math.PI, path: [], goal: null,
  act: 'stand', until: 1e12, n: 0, phase: i, gait: 0, sit: 0, lie: 0, work: 0, wait: 0, model: null, mats: null, line: 0,
  task: { act: 'stand', at: { x: 0, z: 0 } }
}));
line.forEach(p => { p.task.at = { x: p.x, z: p.z }; sc.people.push(p); });
G.walk.x = (conc.x0 + conc.x1) / 2; G.walk.z = zc - 3.2; G.walk.yaw = 0; G.walk.pitch = -0.02;
await wait(3500);
await shot('suits-1-lineup');
G.walk.x = conc.x0 + 3.5; G.walk.z = zc - 0.6; G.walk.yaw = -0.35;
await wait(2000);
await shot('suits-2-lineup-close-left');
G.walk.x = conc.x1 - 3.5; G.walk.z = zc - 0.6; G.walk.yaw = 0.35;
await wait(2000);
await shot('suits-3-lineup-close-right');
/* Talk to the bartender: the face under the helmet. */
const bt = sc.people.find(q => window.Dialogue && window.Dialogue.kindOf(q) === 'bartender');
const notes = ['lineup ' + line.length];
for (const who of [bt, line[1], line[11]]) {
  if (!who) continue;
  G.talk = null;
  G.walk.x = who.x + Math.sin(who.yaw || 0) * 1.1; G.walk.z = who.z + Math.cos(who.yaw || 0) * 1.1;
  G.walk.yaw = Math.atan2(who.x - G.walk.x, who.z - G.walk.z); G.walk.pitch = -0.05;
  await wait(500);
  G.walk.near = { kind: 'npc', npc: who, label: 'Talk to ' + who.name, x: who.x, z: who.z };
  await key('e');
  await wait(900);
  await shot('suits-4-talk-' + who.role);
  notes.push(who.name + ': ' + (G.talk ? G.talk.st.line : '(no talk)'));
  await key('Escape');
  await wait(300);
}
return notes.join('\n') + '\nfps ' + Math.round(G.fps);
