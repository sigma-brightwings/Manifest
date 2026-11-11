/* probe-fieldwork.js - the F7 board with the new work on it: survey,
 * sweep, prospect, recovery and short hops (fieldwork.js, 2026-11-10).
 *
 *     node tools/electron-probe.cjs tools/probe-fieldwork.js "Claude outputs\fw"
 *
 * Fits the instruments, docks, and looks at the board - once bare, once
 * kitted - so the new rows can be read rather than assumed.
 */
const G = window.Game, Sim = window.Sim, C = window.Combat, M = window.Missions, FW = window.Fieldwork;
G.title = null; G.tutorial = null;

let port = null;
const stars = G.galaxy.stars.slice().sort((a, b) =>
  window.Galaxy.distance3(a, G.here) - window.Galaxy.distance3(b, G.here));
for (const st of stars.slice(0, 30)) {
  if (st.id !== G.here.id) G.enterSystem(st, { fresh: true });
  if ((G.sys.ports || []).filter(p => p.market).length >= 2 &&
      (G.sys.bodies || []).some(b => (b.kind === 'planet' || b.kind === 'moon'))) {
    port = (G.sys.ports || []).filter(p => p.market)[0];
    break;
  }
}
if (!port) return 'FAIL: no system with two ports';

G.ship.credits = 400000;
Sim.dockShip(G.ship, port, G.sys, G.t);
G.panel = 0; G.viewMode = 'cockpit';
await wait(600);

function panelTo(id) {
  const list = (window.PANELS || []).map(p => p.id);
  const i = list.indexOf(id);
  if (i >= 0) G.panel = i;
  return i;
}

/* --- the board as a career with nothing fitted sees it --- */
const bare = M.boardAt(port, G.sys, G.galaxy, G.here, G.t, G);
await key('F7');
await wait(900);
await shot('board-bare');

/* --- now fit the instruments and look again --- */
const fitted = [];
for (const id of ['surveyscan', 'magnet', 'deepsurvey', 'gammaspec']) {
  if (!C.EQUIPMENT || !C.EQUIPMENT[id]) continue;
  const r = C.buyEquipment ? C.buyEquipment(G, id) : null;
  if (r && r.ok) fitted.push(id);
}
Sim.refreshShip(G.ship);
const caps = FW.capsOf(G);
const kitted = M.boardAt(port, G.sys, G.galaxy, G.here, G.t, G);
await wait(500);
await shot('board-kitted');

/* --- sign one of each and look at the contract rows --- */
const want = ['survey', 'sweep', 'prospect', 'recovery'];
const signed = [];
for (const ty of want) {
  for (let w = 0; w < 10; w++) {
    const t2 = G.t + w * 2 * 86400;
    const off = M.boardAt(port, G.sys, G.galaxy, G.here, t2, G).find(o => o.type === ty);
    if (!off) continue;
    const r = M.accept(G, off, null);
    if (r.ok) { signed.push(ty + ' (' + off.pay + ' cr)'); break; }
  }
}
const hops = M.boardAt(port, G.sys, G.galaxy, G.here, G.t, G).filter(o => o.hop);
if (hops.length) { const r = M.accept(G, hops[0], null); if (r.ok) signed.push('hop (' + hops[0].pay + ' cr)'); }
await wait(600);
await shot('contracts-signed');

const lines = (G.missions || []).map(m => m.type + ': ' + (FW.progress(G, m) || '-'));

return 'port ' + port.name + ' | bare ' + bare.length + ' rows, kitted ' + kitted.length +
       ' | fitted ' + (fitted.join(',') || 'none') +
       ' | caps survey ' + caps.survey + ' mag ' + caps.mag + ' hold ' + caps.hold +
       ' | signed ' + (signed.join(', ') || 'none') +
       ' | ' + lines.join(' / ');
