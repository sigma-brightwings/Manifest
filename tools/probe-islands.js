/* probe-islands.js - for tools/electron-probe.cjs: an island felt (comsats.js
 * slice 3, 2026-11-20). Finds a real day when a world in the start system
 * has its relays dark, locks a port on it and opens the trade analyser in
 * flight (the fitting is lent for the probe), then shows the orbit map's
 * BODIES list with the island marked, and the island's own mission board.
 *
 *     node tools/electron-probe.cjs tools/probe-islands.js "<outdir>"
 */
const G = window.Game, Cs = window.Comsats, Cb = window.Combat;
G.title = null;
G.paused = true;
if (G.tutorial) { G.tutorial.done = true; G.tutorial.ended = true; }
const out = [];
const keepT = G.t;
let hit = null;
const worlds = {};
Cs.relaysFor(G.sys, G.here.id).forEach(r => { worlds[r.body] = true; });
for (let d = 1; d < 1825 && !hit; d++) {
  const tt = keepT + d * 86400;
  for (const b in worlds) {
    const L = Cs.darkSpan(G, G.here.id, b, tt);
    if (!L || tt - L.from < 8 * 86400) continue;
    const isl = G.sys.ports.find(p => p.market && p.parentBody && p.parentBody.id === b && !p.dug);
    if (isl) { hit = { t: tt, L, isl }; break; }
  }
}
if (!hit) return 'no island in five years';
G.t = hit.t;
G.ship.docked = null; G.ship.landed = false;
G.navTarget = { kind: 'body', id: hit.isl.id };
const keepHas = Cb.hasPortAnalyser;
Cb.hasPortAnalyser = () => true;
out.push(hit.isl.name + ' on day ' + Math.round(hit.t / 86400) + ', dark since day ' + Math.round(hit.L.from / 86400) +
         '; news ' + Cs.fmtCourier(Cs.newsAgeH(G, G.sys, G.here.id, hit.isl, G.t, null)));
G.analyser = { via: 'fitting', portId: hit.isl.id, sel: 0, view: 'graph', sysSel: 0,
               ctx: null, data: null, key: null, det: null, detKey: null, cands: null, reports: {} };
await wait(2000);
await shot('island-analyser');
out.push('analyser ageH ' + (G.analyser && G.analyser.data ? G.analyser.data.ageH.toFixed(1) : 'closed'));
G.analyser = null;
Cb.hasPortAnalyser = keepHas;
G.panel = 1;
await wait(2000);
await shot('island-bodies');
const board = window.Missions.boardAt(hit.isl, G.sys, G.galaxy, G.here, G.t, G).filter(o => o.mail);
out.push('mail at ' + hit.isl.name + ': ' + board.map(o => o.text + ' ' + o.pay + ' cr').join(' | '));
G.panel = 0;
G.t = keepT;
return out.join('\n');
