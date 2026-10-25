/* probe-cockpits.js — for tools/electron-probe.cjs: sit in each hull made
 * flyable on 2026-10-20 and photograph the cockpit, the tugs' grab arms
 * above all. Runs in electron-probe's throwaway profile by default.
 *
 *     node tools/electron-probe.cjs tools/probe-cockpits.js
 */
const G = window.Game, Combat = window.Combat, Sim = window.Sim;
G.title = null;
G.panel = 0;
G.ship.docked = null;
const ids = ['bollard', 'heavytug', 'heavyshuttle', 'trader', 'runner', 'enforcer',
             'enforcerheavy', 'fighter', 'carrier'];
const out = [];
for (const id of ids) {
  const h = Combat.HULLS[id];
  G.ship.hullId = id;
  ['dryMass', 'thrustKN', 'thrusterCap', 'fuelCap', 'cargoCap', 'hullMax'].forEach(k => { G.ship[k] = h[k]; });
  G.ship.hullHp = h.hullMax;
  G.ship._cockpit = null;
  G.ship.bornId = 'probe-' + id;
  Combat.syncLegacy(G.ship);
  if (Sim.refreshShip) Sim.refreshShip(G.ship);
  G.viewMode = 'cockpit';
  await wait(1200);
  await shot('cockpit-' + id);
  out.push(id);
}
return 'shot ' + out.join(', ');
