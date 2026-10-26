/* probe-towers-seat.js — for tools/electron-probe.cjs: the seat views from
 * the tower again, properly undocked in open space, with a Talon's seat as
 * the baseline for what the glass looks like (2026-10-25).
 *
 *     node tools/electron-probe.cjs tools/probe-towers-seat.js "Claude outputs\towers-probe2"
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
  if (Sim.refreshShip) Sim.refreshShip(G.ship);
}
await wait(1000);
if (G.ship.docked) { const left = Sim.undockShip(G.ship, G.sys, G.t, 0.003); notes.push('undock: ' + JSON.stringify(left && left.ok !== undefined ? left.ok : !!left)); }
await wait(4000);
notes.push('docked now: ' + G.ship.docked);
G.viewMode = 'cockpit';
for (const id of ['talon', 'capital', 'carrier']) {
  make(id);
  for (const [n, yaw, pitch] of [['ahead', 0, -0.15], ['stbd', 1.3, -0.35], ['down', 0.3, -1.0], ['aft', 2.9, -0.3]]) {
    G.look.yaw = yaw; G.look.pitch = pitch;
    await wait(1200);
    await shot('seat-' + id + '-' + n);
  }
  notes.push(id + ' fps ' + Math.round(G.fps) + ' docked ' + G.ship.docked + ' enclosed ' + !!(window.Game.enclosed));
}
G.look.yaw = 0; G.look.pitch = 0;
return notes.join('\n');
