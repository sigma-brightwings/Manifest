/* probe-railjets.js - nothing fires on the rail (2026-11-18). Rides the
 * transfer out of Threshold with flight assist ON in the ship frame (as
 * Astra flies) and logs the largest thrust commanded while the rail has
 * her. Before the fix, assist fired against the rail's sideways motion. */
const G = window.Game, Sim = window.Sim, V = window.V;
G.title = null;
const port = G.sys.bodies.find(b => /Threshold/.test(b.name || ''));
Sim.dockShip(G.ship, port, G.sys, G.t);
G.flightMode = 'ship'; G.assist = true; G.dockTarget = port; G.viewMode = 'orbit';
await wait(2000);
Sim.undockShip(G.ship, G.sys, G.t, 0.003, { transfer: true });
let worst = 0, frames = 0, active = {};
G.dockTarget = port; G.keys = G.keys || {}; G.keys['w'] = true; G.keys['d'] = true;
for (let i = 0; i < 300 && Sim.arrivalActive(G.ship); i++) {
  await wait(100);
  frames++;
  const th = V.len(G.ship.thrust || V.zero());
  if (th > worst) worst = th;
  Object.keys(G.activeThrust || {}).forEach(k => { active[k] = 1; });
}
return 'rail frames ' + frames + ', worst thrust ' + worst.toExponential(2) + ' km/s2 (' +
  (worst / G.ship.maxAccel * 100).toFixed(1) + '% of max), active: ' + (Object.keys(active).join(',') || 'none');

