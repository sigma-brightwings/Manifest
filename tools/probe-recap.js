/* probe-recap.js - "Last time on..." and the live mission distance
 * (2026-11-18). Docks at a market port, signs a job in this system and one
 * in another, puts a bounty and a journal line on the career, then presses
 * Resume on the title card the way a pilot coming back would, shoots the
 * card, closes it, and shoots the F7 board and contracts.
 *
 *     node tools/electron-probe.cjs tools/probe-recap.js
 */
const G = window.Game, Sim = window.Sim, M = window.Missions, J = window.Journal;
const ports = G.sys.bodies.filter(b => b.market);
const port = ports.find(p => !p.surface) || ports[0];
Sim.dockShip(G.ship, port, G.sys, G.t);
await wait(1200);
const hooks = { say: () => {}, sound: () => {} };
const board = M.boardAt(port, G.sys, G.galaxy, G.here, G.t, G);
const local = board.find(o => o.toPortId && !o.toStarId);
const away = board.find(o => o.toStarId && o.toStarId !== G.here.id);
const signed = [];
for (const o of [local, away]) if (o) { const r = M.accept(G, o, hooks); signed.push(o.text + ' -> ' + (r.ok ? 'ok' : r.why)); }
G.wanted = G.wanted || {}; G.wanted[G.here.factionId] = 600;
J.add(G, 'rescue', 'Pulled a stranger off a dead tank', { t: G.t - 3 * 3600 });
J.add(G, 'trade', 'Sold 12t of alloys at a loss', { t: G.t - 3600 });
G.recapShown = false;
G.title = { sel: 0, edit: null, note: null };
await wait(600);
await key('Enter');
await wait(600);
const page = G.menu && G.menu.page;
await shot('recap-card');
await key('x');
const closed = !G.menu;
await key('F7');
await wait(800);
await shot('recap-f7-board');
const reach = (G.missions || []).map(m => m.text + ' :: ' + ((M.reach(G, m) || {}).text || 'null'));
const t0 = performance.now(), others = ports.filter(p => p !== port);
for (const p of others) window.MissionEta(p.id, true);
reach.push('solve cost: ' + ((performance.now() - t0) / Math.max(1, others.length)).toFixed(1) + ' ms per port over ' + others.length);
return ['docked at ' + port.name, 'signed: ' + signed.join(' | '), 'menu page after Resume: ' + page,
        'closed by a key: ' + closed].concat(reach).join('\n');
