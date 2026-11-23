/* probe-icons.js - for tools/electron-probe.cjs: the drawn icons (icons.js,
 * 2026-11-20) on the F3 nav list with its key, the COMMS list, and the
 * CONTACTS page on a dashboard MFD. Also renders every icon large on a
 * sheet, to look at the shapes themselves.
 *
 *     node tools/electron-probe.cjs tools/probe-icons.js "<outdir>"
 */
const G = window.Game, Ic = window.Icons;
G.title = null;
G.paused = true;
if (G.tutorial) { G.tutorial.done = true; G.tutorial.ended = true; }
G.showTraffic = true;
const kinds = {};
G.sys.ports.forEach(p => { const k = Ic.portKind(p, G.sys); kinds[k] = (kinds[k] || 0) + 1; });
const ships = window.Sim.shipsAll(G.sys, G.t);
ships.forEach(s => { const k = Ic.shipKind(s); kinds[k] = (kinds[k] || 0) + 1; });
G.panel = 2;
await wait(1500);
await shot('icons-nav');
G.panel = 3;
await wait(1500);
await shot('icons-comms');
G.panel = 0;
G.dashPages = G.dashPages || {};
G.dashPages.left = 'nav';
await wait(1500);
await shot('icons-mfd');
/* The sheet: every shape at 4x, labelled. */
const cv = document.createElement('canvas');
cv.width = 900; cv.height = 300;
const c = cv.getContext('2d');
c.fillStyle = '#040a0e'; c.fillRect(0, 0, 900, 300);
const all = Ic.LEGEND.map(l => l[0]).concat(['port-mining-ground', 'port-agri-ground', 'sat', 'mysat', 'sat-down', 'sat-gone', 'you', 'star', 'planet', 'moon']);
c.font = 'bold 11px monospace';
all.forEach((k, i) => {
  const x = 50 + (i % 9) * 95, y = 50 + Math.floor(i / 9) * 80;
  Ic.draw(c, k, x, y, 18, '#b4f0ff');
  c.fillStyle = '#6f97a8'; c.fillText(k, x - 40, y + 34);
});
Ic.link(c, 60, 200, 270, true, '#b4f0ff');
Ic.link(c, 260, 400, 270, false, '#ff9f7a');
file('icons-sheet.png.b64', cv.toDataURL('image/png').split(',')[1]);
G.dashPages.left = 'scope';
return 'kinds here: ' + JSON.stringify(kinds) + '\nfps ' + Math.round(G.fps);
