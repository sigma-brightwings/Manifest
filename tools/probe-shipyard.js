/* probe-shipyard.js — for tools/electron-probe.cjs: the shipyard pages, a
 * commission on the slip, the hand-over and taking command, in the real
 * shell. electron-probe.cjs runs it in a throwaway profile by default — it
 * docks and commissions a ship, and docking commits the autosave:
 *
 *     node tools/electron-probe.cjs tools/probe-shipyard.js
 */
const G = window.Game, Sim = window.Sim, Combat = window.Combat;
G.title = null;
/* Go to the nearest star that has a shipyard. */
let yard = null;
const stars = G.galaxy.stars.slice().sort((a, b) =>
  window.Galaxy.distance3(a, G.here) - window.Galaxy.distance3(b, G.here));
for (const st of stars.slice(0, 40)) {
  if (st.id !== G.here.id) G.enterSystem(st, { fresh: true });
  yard = G.sys.bodies.find(b => b.market && Combat.isShipyard(b) && !b.surface && !b.underground) || null;
  if (yard) break;
}
if (!yard) return 'FAIL: no shipyard within 40 stars';
Sim.dockShip(G.ship, yard, G.sys, G.t);
G.ship.credits = 2000000;
await wait(800);
G.panel = 4; G.yardTab = 'hull'; G.yardHull = 'longhaul'; G.yardBuild = true; G.yardOrder = null;
await wait(800);
await shot('yard-hulls');
await wait(2500);
if (G.yardOrder) { G.yardOrder.paint = { p: 'crimson', t: 'sand' }; G.yardOrder.name = 'Probe'; }
G.yardScroll = 99;
await wait(800);
await shot('yard-order-sheet');
await wait(2500);           // the screenshot pump is slower than the page
const o = G.yardOrder || { fit: {} };
const c = Combat.commission(G, 'longhaul', { fit: o.fit, name: 'Probe', paint: { p: '#8f2630', t: '#c9b48a' } });
if (!c.ok) return 'FAIL: ' + c.why;
G.yardTab = 'fleet'; G.yardScroll = 0;
await wait(800);
await shot('yard-fleet-on-slip');
await wait(2500);
/* Skip the build. */
G.t = c.order.due + 1;
await wait(1500);
G.yardTab = 'fleet';
await wait(800);
await shot('yard-fleet-handed-over');
await wait(2500);
const rec = G.fleet.find(r => r.id === 'fs-' + c.order.id);
if (!rec) return 'FAIL: not handed over · orders ' + JSON.stringify(G.orders);
const r = Combat.takeCommand(G, rec.id, 'keep');
if (!r.ok) return 'FAIL: ' + r.why;
await wait(800);
await shot('yard-fleet-in-command');
await wait(2500);
G.panel = 0;
await wait(1500);
await shot('flight-painted');
return 'yard: ' + yard.name + ' · commissioned ' + c.days + ' days · flying ' + G.ship.hullId +
       ' "' + G.ship.shipName + '" · paint ' + JSON.stringify(G.ship.paint) +
       ' · fleet ' + G.fleet.map(f => f.hullId + '@' + f.portName).join(', ');
