/* probe-crawler.js — for tools/electron-probe.cjs: the Crawler, station
 * crates and freight in her cubes, in the real shell. electron-probe.cjs
 * runs it in a throwaway profile by default (it docks, and docking commits
 * the autosave):
 *
 *     node tools/electron-probe.cjs tools/probe-crawler.js
 */
const G = window.Game, Sim = window.Sim, Combat = window.Combat, Cn = window.Construction;
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
G.ship.credits = 5000000;
await wait(800);
/* Commission her, skip the build, take command. */
const c = Combat.commission(G, 'crawler', { fit: {}, name: 'Long Haul' });
if (!c.ok) return 'FAIL commission: ' + c.why;
G.t = c.order.due + 1;
Combat.deliverOrders(G, G.t);
const rec = G.fleet.find(r => r.id === 'fs-' + c.order.id);
const tc = Combat.takeCommand(G, rec.id, 'keep');
if (!tc.ok) return 'FAIL command: ' + tc.why;
/* A load: two slipways, a skimmer rig pair, a cube of M, six S — and freight. */
const ids = ['slipway', 'slipway', 'skimrig', 'skimrig', 'warehouse', 'repair', 'reactor', 'quarters',
             'berth', 'berth', 'battery', 'battery', 'relay', 'fuelcell'];
const recs = ids.map(id => Cn.order(G, id)).map(r => { if (!r.ok) throw new Error(r.why); return r.rec; });
G.t = Math.max.apply(null, recs.map(r => r.due)) + 1;
const bad = recs.map(r => Cn.load(G, r.id)).filter(r => !r.ok);
G.ship.cargo = { water: 100 };          // four cubes of freight
Combat.syncLegacy(G.ship);
G.panel = 4; G.yardTab = 'modules'; G.yardScroll = 0;
await wait(1200);
await shot('crates-tab');
await wait(2500);
/* Outside, close. */
G.panel = 0;
G.ship.docked = null;
G.viewMode = 'orbit'; G.followShip = true; G.focus = null;
G.cam.dist = 0.05;
await wait(1500);
await shot('crawler-loaded');
await wait(2500);
G.cam.yaw = (G.cam.yaw || 0) + 1.6;
await wait(1200);
await shot('crawler-loaded-2');
await wait(2500);
return 'yard ' + yard.name + ' · load failures ' + bad.length + (bad.length ? ' ' + bad[0].why : '') +
       ' · crate cubes ' + Cn.crateCubes(Cn.aboard(G.ship)) + ' · freight cubes ' + Cn.freightCubes(G.ship) +
       ' · hold ' + G.ship.cargoCap + ' t · cam ' + JSON.stringify(G.cam);
