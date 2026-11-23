/* probe-panel-support.js - for tools/electron-probe.cjs: the starting
 * Talon refitted to cockpit fit C at the nearest shipyard, where the
 * no-overlap rule (Render.mfdLayout) lifts the two outer screens onto
 * supports. Shoots the dash from the seat, then closer on each side.
 *
 *     node tools/electron-probe.cjs tools/probe-panel-support.js "<outdir>"
 */
const G = window.Game, Sim = window.Sim, Combat = window.Combat, Render = window.Render;
G.title = null;
let yard = null;
const stars = G.galaxy.stars.slice().sort((a, b) => window.Galaxy.distance3(a, G.here) - window.Galaxy.distance3(b, G.here));
for (const st of stars.slice(0, 40)) {
  if (st.id !== G.here.id) G.enterSystem(st, { fresh: true });
  yard = G.sys.bodies.find(b => b.market && Combat.isShipyard(b) && !b.surface && !b.underground) || null;
  if (yard) break;
}
if (!yard) return 'FAIL: no shipyard';
Sim.dockShip(G.ship, yard, G.sys, G.t);
G.ship.credits = 100000;
const rf = Combat.refitCockpit(G, 2);
G.panel = 0; G.viewMode = 'cockpit';
if (window.Tutorial && window.Tutorial.press) { try { window.Tutorial.press(G, 'end'); window.Tutorial.press(G, 'end'); } catch (e) {} }
await wait(2500);
G.look.pitch = -0.38; G.look.yaw = 0;
await wait(1500);
await shot('support-1-dash');
G.look.yaw = -0.45; G.look.pitch = -0.42;
await wait(1200);
await shot('support-2-left');
G.look.yaw = 0; G.look.pitch = 0;
const lay = Render.mfdLayout(Render.cockpitSpec(G.ship));
return 'hull ' + G.ship.hullId + ' fit ' + G.ship.cockpitLook + ' refit ' + (rf.ok ? 'ok' : rf.why) + ' · lifts ' + JSON.stringify(lay.lift) + ' · supports ' + JSON.stringify(lay.support);
