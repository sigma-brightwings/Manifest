/* probe-tower-mfds.js — for tools/electron-probe.cjs: the bridge deck's
 * station screens on a Capital, and their F5 → PANELS layout (2026-10-25).
 *
 *     node tools/electron-probe.cjs tools/probe-tower-mfds.js "Claude outputs\tower-mfds"
 */
const G = window.Game, Combat = window.Combat, Sim = window.Sim, R = window.Render;
G.title = null; G.panel = 0;
const notes = [];
function make(id) {
  const h = Combat.HULLS[id];
  G.ship.hullId = id;
  ['dryMass', 'thrustKN', 'thrusterCap', 'fuelCap', 'cargoCap', 'hullMax'].forEach(k => { G.ship[k] = h[k]; });
  G.ship.hullHp = h.hullMax; G.ship._cockpit = null; G.ship.turret = null; G.ship.bornId = 'probe-' + id;
  Combat.syncLegacy(G.ship);
}
await wait(800);
make('capital');
G.viewMode = 'cockpit'; G.look.yaw = 0; G.look.pitch = 0;
await wait(800);
await key('o');
await wait(1200);
if (!G.walk || !G.walk.plan.ship) return 'FAIL: not walking';
const plan = G.walk.plan.ship;
const sts = plan.stations.filter(s => !s.cockpit);
const st = sts.find(s => s.side > 0) || sts[0];
/* Stand in the aisle across from a starboard station and look at it. */
G.walk.x = st.side * (plan.decks.bridge.rooms.find(r => r.kind === 'bridgedeck').x1 - 1.3);
G.walk.z = st.z; G.walk.yaw = st.side > 0 ? Math.PI / 2 : -Math.PI / 2; G.walk.pitch = -0.25;
await wait(2000);
await shot('mfd-1-station-close');
G.walk.x = 0; G.walk.z = st.z - 2.2; G.walk.yaw = 0.6 * st.side; G.walk.pitch = -0.15;
await wait(1500);
await shot('mfd-2-deck');
notes.push('stations ' + sts.map(s => s.role + '@' + s.side + ',' + s.z.toFixed(1)).join(' '));
notes.push('pages ' + JSON.stringify(G.dashPages));
/* The F5 tab, bridge-deck view. */
G.walk = null; await wait(300);
G.shipTab = 'panels'; G.panelsView = 'deck';
await key('F5');
await wait(1000);
await shot('mfd-3-f5-deck');
notes.push('panel=' + G.panel + ' view=' + G.panelsView + ' pick=' + G.panelPick);
return notes.join('\n');
