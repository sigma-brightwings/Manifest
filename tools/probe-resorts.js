/* probe-resorts.js - the home resort, seen (worlds worth visiting, slice 3,
 * 2026-11-20).
 *
 *     node tools/electron-probe.cjs tools/probe-resorts.js "X:\Shared_AI\Claude's Stuff\probe-resorts"
 *
 * Mirven II's Larkspur Resort: listed on F3, docked at (the cockpit view
 * of an open-air field), and its F7 board.
 */
const G = window.Game, Sim = window.Sim, M = window.Missions;
G.title = null; G.tutorial = null;

const rs = (G.sys.ports || []).find(p => p.resort);
if (!rs) return 'FAIL: no resort in the home system';

await key('F3');
await wait(900);
await shot('1-nav-list');

await key('Escape'); await wait(300);
G.ship.credits = 400000;
Sim.dockShip(G.ship, rs, G.sys, G.t);
G.panel = 0; G.viewMode = 'cockpit';
await wait(1500);
await shot('2-docked-cockpit');

await key('F7');
await wait(900);
await shot('3-resort-board');

const board = M.boardAt(rs, G.sys, G.galaxy, G.here, G.t, G);
return rs.id + ' ' + rs.name + ' (' + rs.typeName + ', ' + (rs.seaPlatform ? 'sea' : rs.underground ? 'buried' : 'open air') +
       ') on ' + rs.parentBody.name + ' | lat ' + (rs.lat * 180 / Math.PI).toFixed(1) + ' | board ' + board.length +
       ' rows, holiday ' + board.filter(o => o.tourist).map(o => o.text).join(' / ');
