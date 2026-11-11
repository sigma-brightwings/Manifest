/* probe-band.js - the open band in the running game (band.js, 2026-11-11).
 *
 *     node tools/electron-probe.cjs tools/probe-band.js "Claude outputs\band"
 *
 * Puts a few calls on the band the way aggression.js does, then looks at
 * the comms screen and the nav list to see that they are drawn and that
 * they are steerable.
 */
const G = window.Game, Sim = window.Sim, B = window.Band, V = window.V;
G.title = null; G.tutorial = null;
G.panel = 0; G.viewMode = 'cockpit';
await wait(600);

const ships = Sim.shipsAll(G.sys, G.t) || [];
if (ships.length < 2) return 'FAIL: no traffic in ' + G.here.name;

/* Three calls at real traffic positions, at three ranges. */
const sorted = ships.slice().sort((a, b) =>
  V.dist(a.pos, G.ship.pos) - V.dist(b.pos, G.ship.pos));
const picks = [sorted[0], sorted[Math.floor(sorted.length / 2)], sorted[sorted.length - 1]];
const kinds = ['robbery', 'pursuit', 'duel'];
G.band = [];
picks.forEach((s, i) => {
  B.open(G, G.sys, G.t, kinds[i], { id: s.id, name: s.name, faction: s.faction, live: { pos: s.pos } },
         { id: 'x', name: 'The Salt' });
});
/* And one that is over, to see it go grey. */
const done = sorted[1];
B.open(G, G.sys, G.t, 'robbery', { id: done.id + 'd', name: done.name, faction: done.faction, live: { pos: done.pos } }, null);
B.close(G, G.t, 'robbery', { id: done.id + 'd', name: done.name }, 'robbed');

const rows = B.rows(G, G.sys, G.t);

await key('F4');
await wait(900);
await shot('comms-band');

await key('F3');
await wait(900);
await shot('nav-band');

/* Steer at the nearest one: the band row has to be a nav target like any
 * other, or hearing it is no use. */
let steered = 'not found in the nav list';
const navRows = (window.PROBE_NAV || null);
const near = rows[0];
if (near) {
  G.navTarget = { kind: near.kind, id: near.id };
  await wait(600);
  await shot('nav-selected');
  steered = 'set course at ' + near.name + ' (' + near.type + ')';
}

return 'system ' + G.here.name + ' | band ' + rows.length + ' rows | ' +
       rows.map(r => r.name + ' [' + r.type + '] ' +
                     (r.range / 1e6).toFixed(1) + ' Mkm' + (r.help ? ' HELP' : '')).join(' | ') +
       ' | ' + steered;
