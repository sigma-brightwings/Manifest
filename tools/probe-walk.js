/* probe-walk.js â€” for tools/electron-probe.cjs: step out of the seat at a
 * shipyard with a second ship of yours berthed there, walk the station,
 * and board her. Runs in electron-probe's throwaway profile by default.
 *
 *     node tools/electron-probe.cjs tools/probe-walk.js
 */
const G = window.Game, Sim = window.Sim, Combat = window.Combat;
G.title = null;
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
G.ship.credits = 400000;
/* A second ship: buy a Mule and keep the Talon â€” the Talon goes on a clamp. */
const kept = Combat.buyHull(G, 'mule', true);
if (!kept.ok) return 'FAIL keep: ' + kept.why;
G.panel = 0; G.viewMode = 'cockpit';
await wait(600);
const press = k => { window.dispatchEvent(new KeyboardEvent('keydown', { key: k })); window.dispatchEvent(new KeyboardEvent('keyup', { key: k })); };
press('o');
await wait(900);
if (!G.walk) return 'FAIL: O did not step out';
await shot('walk-1-berth');
/* Turn round to face her hatch. */
G.walk.yaw += Math.PI;
await wait(500);
await shot('walk-2-own-hatch');
/* Walk out into the spine and look along it. */
G.walk.x = 0; G.walk.z = 1; G.walk.yaw = 0; G.walk.pitch = 0;
await wait(600);
await shot('walk-3-spine');
const spine = G.walk.plan.rooms.find(r => r.id === 'spine');
G.walk.x = 0; G.walk.z = spine.z1 + 3; G.walk.yaw = 0;
await wait(600);
await shot('walk-4-concourse');
/* Hold W for a second: does it move? */
const z0 = G.walk.z;
window.dispatchEvent(new KeyboardEvent('keydown', { key: 'w' }));
await wait(1000);
window.dispatchEvent(new KeyboardEvent('keyup', { key: 'w' }));
const moved = G.walk.z - z0;
/* Go to the Talon's hatch and board her. */
const hatch = G.walk.plan.items.find(it => it.kind === 'fleet');
if (!hatch) return 'FAIL: no hatch for the kept ship';
const br = G.walk.plan.rooms.find(r => r.id === hatch.berth);
G.walk.x = hatch.x + (br.side < 0 ? 1.2 : -1.2); G.walk.z = hatch.z;
G.walk.yaw = br.side < 0 ? -Math.PI / 2 : Math.PI / 2;
await wait(400);
await shot('walk-5-other-hatch');
const before = G.ship.hullId;
press('e');
await wait(900);
await shot('walk-6-boarded');
return 'yard ' + yard.name + ' Â· walked ' + moved.toFixed(2) + ' m in 1 s Â· boarded: ' + before + ' -> ' + G.ship.hullId +
       ' Â· walking ' + !!G.walk + ' Â· fleet ' + (G.fleet || []).map(r => r.hullId).join(',');

