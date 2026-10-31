/* probe-canopy.js - for tools/electron-probe.cjs: the view out of each
 * hull's canopy, ahead, to port, up and down (2026-10-31). Astra: "I want
 * the canopy glass in the ships to give a better view to either side, as
 * well as above and below, while also being unique to every ship."
 *
 *     node tools/electron-probe.cjs tools/probe-canopy.js
 * window.PROBE_HULLS overrides the list.
 */
const G = window.Game, Combat = window.Combat, Sim = window.Sim;
G.title = null;
G.panel = 0;
G.ship.docked = null;
const ids = window.PROBE_HULLS || ['talon', 'fighter', 'mule', 'carrier'];
const views = [['ahead', 0, 0], ['port', -1.35, 0.05], ['up', 0, 1.1], ['down', 0, -1.1], ['stbd-up', 1.0, 0.75]];
const out = [];
for (const id of ids) {
  const h = Combat.HULLS[id];
  if (!h) { out.push(id + ' ?'); continue; }
  G.ship.hullId = id;
  ['dryMass', 'thrustKN', 'thrusterCap', 'fuelCap', 'cargoCap', 'hullMax'].forEach(k => { G.ship[k] = h[k]; });
  G.ship.hullHp = h.hullMax;
  G.ship._cockpit = null;
  G.ship.bornId = window.PROBE_BORN || ('probe-' + id);
  Combat.syncLegacy(G.ship);
  if (Sim.refreshShip) Sim.refreshShip(G.ship);
  G.viewMode = 'cockpit';
  for (const v of views) {
    G.look.yaw = v[1]; G.look.pitch = v[2];
    await wait(900);
    await shot(id + '-' + v[0]);
  }
  G.look.yaw = 0; G.look.pitch = 0;
  out.push(id);
}
return 'shot ' + out.join(', ');
