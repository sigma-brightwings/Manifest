/* probe-menudeck.js - menus show where you are (2026-11-19). On the deck
 * at Threshold, opens the Esc menu and shoots it; then aboard, the same. */
const G = window.Game, Sim = window.Sim;
G.title = null;
const port = G.sys.bodies.find(b => /Threshold/.test(b.name || '')) || G.sys.bodies.find(b => b.market && !b.surface);
Sim.dockShip(G.ship, port, G.sys, G.t);
G.panel = 0; G.viewMode = 'cockpit';
await wait(1200);
G.startWalk(true);
await wait(1500);
if (!G.walk || G.walk.ship) return 'FAIL: not on the deck';
const cc = G.walk.plan.rooms.find(r => r.kind === 'concourse');
G.walk.x = (cc.x0 + cc.x1) / 2; G.walk.z = (cc.z0 + cc.z1) / 2 + 6; G.walk.yaw = Math.PI; G.walk.pitch = 0.1;
await wait(1500);
await key('Escape');
await wait(800);
const out = ['deck: menu ' + (G.menu && G.menu.page) + ', walk still ' + !!G.walk + ', hotspots ' + (G.hotspots || []).length];
await shot('menu-on-deck');
await key('Escape');
await wait(600);
out.push('closed: ' + !G.menu);
/* Aboard her: the same. */
const hatch = G.walk.plan.items.find(i => i.kind === 'mine');
G.startWalk(false);
await wait(1500);
out.push('aboard: ship ' + !!(G.walk && G.walk.ship));
await key('Escape');
await wait(800);
await shot('menu-aboard');
out.push('aboard menu ' + (G.menu && G.menu.page));
await key('Escape');
return out.join('\n');
