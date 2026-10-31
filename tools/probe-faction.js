/* probe-faction.js - for tools/electron-probe.cjs: the same station deck
 * dressed for each livery (civ, navy, syn, pir), with the cargo hall and
 * the bar/outfitter ads (dressing.js, 2026-10-31).
 *
 *     node tools/electron-probe.cjs tools/probe-faction.js
 */
const G = window.Game, Sim = window.Sim, Walk = window.Walk;
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
const out = [];
for (const liv of (window.PROBE_LIVERIES || ['civ', 'navy', 'syn', 'pir'])) {
  const plan = Walk.layout(port.id, { seed: G.seed || '', yard: false, livery: liv, outfitter: 'Kawartha Yards', ships: [], others: [] });
  G.walk = Walk.start(plan);
  G.walk.portName = port.name;
  const R = id => plan.rooms.find(r => r.id === id);
  const spine = R('spine'), cargo = R('cargo'), conc = R('concourse'), bar = R('bar');
  if (!cargo) return 'FAIL: no cargo hall';
  const views = [
    ['cargo-in', 0, cargo.z0 + 1.2, 0, 0.12],
    ['cargo-side', -2, (cargo.z0 + cargo.z1) / 2, Math.PI / 2 - 0.25, 0.08],
    ['cargo-ads', 2, (cargo.z0 + cargo.z1) / 2 + 2, -Math.PI / 2 + 0.3, 0.3],
    ['spine-ads', 0.4, spine.z1 * 0.4, 0.55, 0.0],
    ['concourse', 0, conc.z0 + 1.0, 0, 0.12],
    ['bar', bar.x1 - 0.6, (bar.z0 + bar.z1) / 2, -Math.PI / 2, -0.08]
  ];
  for (const v of views) {
    G.walk.x = v[1]; G.walk.z = v[2]; G.walk.yaw = v[3]; G.walk.pitch = v[4];
    await wait(1400);
    await shot(liv + '-' + v[0]);
  }
  const q = Object.values(plan.dress).reduce((a, b) => a + b.length, 0);
  out.push(liv + ': quads ' + q + ', cargo ' + (plan.dress.cargo || []).length + ', freight ' + !!plan.items.find(i => i.kind === 'freight'));
}
return 'port ' + port.name + ' (' + port.livery + ') | ' + out.join(' | ') + ' | fps ' + Math.round(G.fps || 0);
