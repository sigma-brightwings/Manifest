/* probe-menuaboard.js - menus show where you are, aboard (2026-11-19):
 * up out of the seat (O), Esc, shoot. */
const G = window.Game, Sim = window.Sim;
G.title = null;
const port = G.sys.bodies.find(b => /Threshold/.test(b.name || '')) || G.sys.bodies.find(b => b.market && !b.surface);
Sim.dockShip(G.ship, port, G.sys, G.t);
G.panel = 0; G.viewMode = 'cockpit';
await wait(1200);
await key('o'); await wait(1500);
const out = ['aboard: ' + !!(G.walk && G.walk.ship)];
await key('Escape'); await wait(800);
out.push('menu ' + (G.menu && G.menu.page) + ', hotspots ' + (G.hotspots || []).length +
         ', panel ' + G.panel + ', talk ' + !!G.talk + ', help ' + !!G.showHelp + ', airlockUI ' + !!(G.airlockUI || G.lockPanel));
if (!G.menu) { await key('Escape'); await wait(800); out.push('second Esc: menu ' + (G.menu && G.menu.page)); }
await shot('menu-aboard');
await key('Escape');
return out.join('\n');
