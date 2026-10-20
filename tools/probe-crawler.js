/* probe-crawler.js — for tools/electron-probe.cjs: the Crawler and station
 * modules, in the real shell. electron-probe.cjs runs it in a throwaway
 * profile by default (it docks, and docking commits the autosave):
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
G.ship.credits = 3000000;
await wait(800);
/* The showroom card, on the Crawler. */
G.panel = 4; G.yardTab = 'hull'; G.yardHull = 'crawler'; G.yardBuild = true; G.yardOrder = null;
await wait(1200);
await shot('crawler-card');
await wait(2500);
/* The modules tab before a core: the M and S rows refuse. */
G.yardTab = 'modules'; G.yardScroll = 0;
await wait(900);
await shot('modules-no-core');
await wait(2500);
/* Commission her, skip the build, take command. */
const c = Combat.commission(G, 'crawler', { fit: {}, name: 'Long Haul' });
if (!c.ok) return 'FAIL commission: ' + c.why;
G.t = c.order.due + 1;
Combat.deliverOrders(G, G.t);
const rec = G.fleet.find(r => r.id === 'fs-' + c.order.id);
const tc = Combat.takeCommand(G, rec.id, 'keep');
if (!tc.ok) return 'FAIL command: ' + tc.why;
/* A core, built, and craned aboard. */
const core = Cn.order(G, 'core', { pattern: 'ring' });
if (!core.ok) return 'FAIL core: ' + core.why;
Cn.order(G, 'market'); Cn.order(G, 'berth');
G.t = core.rec.due + 1;
const ld = Cn.load(G, core.rec.id);
G.yardTab = 'modules'; G.yardScroll = 0;
await wait(1200);
await shot('modules-loaded');
await wait(2500);
G.panel = 0;
G.viewMode = 'chase';
await wait(1800);
await shot('crawler-flight');
return 'yard ' + yard.name + ' · flying ' + G.ship.hullId + ' "' + G.ship.shipName + '" · load ' +
       (ld.ok ? 'ok' : ld.why) + ' · bay ' + Cn.loadUsed(Cn.aboard(G.ship)) + '/' + Cn.BAY +
       ' · owned ' + Cn.owned(G).length;
