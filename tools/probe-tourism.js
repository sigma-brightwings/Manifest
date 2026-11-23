/* probe-tourism.js - the F7 board on a world worth visiting (worlds worth
 * visiting, slice 2, 2026-11-20).
 *
 *     node tools/electron-probe.cjs tools/probe-tourism.js "X:\Shared_AI\Claude's Stuff\probe-tourism"
 *
 * Docks at a port on a postcard world whose board carries holiday work,
 * and looks at it; then at a port on another world in the same system,
 * where the inbound bookings are posted. The rows are read, not assumed
 * (ledger L72: "drawn" is not "readable").
 */
const G = window.Game, Sim = window.Sim, M = window.Missions, A = window.Appeal;
G.title = null; G.tutorial = null;

let hit = null;
const stars = G.galaxy.stars.slice().filter(s => s.factionId).sort((a, b) =>
  window.Galaxy.distance3(a, G.here) - window.Galaxy.distance3(b, G.here));
for (const st of stars.slice(0, 60)) {
  if (st.id !== G.here.id) G.enterSystem(st, { fresh: true });
  for (const p of (G.sys.ports || [])) {
    if (!p.market || p.dug || !p.parentBody) continue;
    const a = A.of(G.sys, p.parentBody);
    if (!a || a.score < 0.7) continue;
    const board = M.boardAt(p, G.sys, G.galaxy, G.here, G.t, G);
    if (board.some(o => o.tourist === 'hop')) { hit = { port: p, a, board }; break; }
  }
  if (hit) break;
}
if (!hit) return 'FAIL: no postcard world with hops in 60 systems';

G.ship.credits = 400000;
Sim.dockShip(G.ship, hit.port, G.sys, G.t);
G.panel = 0; G.viewMode = 'cockpit';
await wait(600);
await key('F7');
await wait(900);
await shot('1-postcard-board');

/* The other end: a port on another world, where the inbound trade is posted. */
const away = (G.sys.ports || []).filter(p => p.market && !p.dug && p.parentBody && p.parentBody !== hit.port.parentBody);
let awayHit = null;
for (const p of away) {
  for (let w = 0; w < 6 && !awayHit; w++) {
    const t2 = G.t + w * 2 * 86400;
    const b = M.boardAt(p, G.sys, G.galaxy, G.here, t2, G);
    if (b.some(o => o.tourist === 'inbound')) awayHit = { port: p, t: t2, board: b };
  }
  if (awayHit) break;
}
let awayLine = 'no inbound found';
if (awayHit) {
  await key('Escape'); await wait(300);
  G.t = awayHit.t;
  Sim.dockShip(G.ship, awayHit.port, G.sys, G.t);
  await wait(600);
  await key('F7');
  await wait(900);
  await shot('2-inbound-board');
  awayLine = awayHit.port.name + ': ' + awayHit.board.filter(o => o.tourist).map(o => o.text).join(' / ');

  /* Push the board past the panel's foot by opening a row's details, then
   * scroll it with real wheel events over the board, the way a hand would. */
  const first = awayHit.board.find(o => o.desc);
  if (first) G.missionDesc = first.id;
  await wait(500);
  await shot('3-board-overflows');
  const cv = document.querySelector('canvas');
  /* The pointer goes over the board first, as a hand's would: the board
   * claims the wheel only while the mouse is over it. */
  /* Left Alt held is the interface cursor (main.js setCursorMode). */
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Alt', code: 'AltLeft', location: 1, bubbles: true }));
  await wait(100);
  for (const tgt of [cv, window]) if (tgt) tgt.dispatchEvent(new MouseEvent('mousemove', { clientX: 1300, clientY: 600, bubbles: true }));
  await wait(200);
  for (let i = 0; i < 4; i++) {
    /* Every canvas: the GL layer is first in the page, the interface's is
     * the one main.js listens on. */
    for (const c of document.querySelectorAll('canvas')) {
      c.dispatchEvent(new WheelEvent('wheel', { deltaY: 120, clientX: 1300, clientY: 600, bubbles: true, cancelable: true }));
    }
    await wait(120);
  }
  await wait(400);
  await shot('4-board-scrolled');
  window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Alt', code: 'AltLeft', location: 1, bubbles: true }));
}

return 'postcard ' + hit.port.parentBody.name + ' (' + hit.a.score.toFixed(2) + ', ' + hit.a.why.join(', ') + ') at ' +
       hit.port.name + ' | ' + hit.board.length + ' rows, holiday: ' +
       hit.board.filter(o => o.tourist).map(o => o.tourist + ' "' + o.text + '"').join(' / ') +
       ' || ' + awayLine;
