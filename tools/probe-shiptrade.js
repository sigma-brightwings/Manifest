/* probe-shiptrade.js â€” for tools/electron-probe.cjs: hail a passing trader
 * in the real shell, open the ship-to-ship trade board, and buy and sell a
 * tonne through the board's own keys. Runs in the throwaway profile.
 *
 *     node tools/electron-probe.cjs tools/probe-shiptrade.js
 */
const G = window.Game, Sim = window.Sim, ST = window.ShipTrade, Scr = window.Screens;
G.title = null;
G.ship.docked = null;
G.ship.credits = 200000;
let pick = null;
const stars = G.galaxy.stars.slice().sort((a, b) =>
  window.Galaxy.distance3(a, G.here) - window.Galaxy.distance3(b, G.here));
for (const st of stars.slice(0, 12)) {
  if (st.id !== G.here.id) G.enterSystem(st, { fresh: true });
  G.ship.docked = null;
  G.panel = 3;
  await wait(300);
  for (const c of Scr.commsContacts()) {
    if (!c.obj || !c.obj.pos || c.obj.hostile || c.obj.cls === 'capital' || c.obj.kind === 'capital') continue;
    G.ship.pos = { x: c.obj.pos.x + 5, y: c.obj.pos.y, z: c.obj.pos.z };
    if (c.obj.vel) G.ship.vel = { x: c.obj.vel.x, y: c.obj.vel.y, z: c.obj.vel.z };
    if (ST.refusal(G, G.sys, c.obj)) continue;
    const b = ST.board(G, G.sys, G.t, c.obj);
    if (b && b.rows && b.rows.some(r => r.theirs > 0 && r.buyEach)) { pick = c; break; }
  }
  if (pick) break;
}
if (!pick) return 'FAIL: no trader with stock willing to deal within 12 stars';
G.paused = true;
G.ship.pos = { x: pick.obj.pos.x + 5, y: pick.obj.pos.y, z: pick.obj.pos.z };
G.shipDeal = { name: pick.name, sel: 0 };
const board0 = ST.board(G, G.sys, G.t, pick.obj);
const rowIdx = board0.rows.findIndex(r => r.theirs > 0 && r.buyEach);
G.shipDeal.sel = rowIdx;
const row = board0.rows[rowIdx];
G.panel = 3;
await wait(800);
await shot('shiptrade-1-board');
const out = [];
const press = k => { window.dispatchEvent(new KeyboardEvent('keydown', { key: k })); window.dispatchEvent(new KeyboardEvent('keyup', { key: k })); };
const cargo = () => (G.ship.cargo || {})[row.cid] || 0;
out.push('with ' + pick.name + ' (' + board0.flag.name + ') Â· ' + row.name + ' ' + row.buyEach + ' cr/t, they hold ' + row.theirs);
out.push('before: hold ' + cargo() + ', cr ' + G.ship.credits + ', panel ' + G.panel + ', deal ' + JSON.stringify(G.shipDeal));
const contact = Scr.commsContacts().find(c => c.name === pick.name);
out.push('contact still listed: ' + !!contact + (contact ? ', range ' + Math.round(window.V.dist(contact.obj.pos, G.ship.pos)) + ' km, refusal ' + ST.refusal(G, G.sys, contact.obj) : ''));
press('ArrowRight');
out.push('after â†’ key: hold ' + cargo() + ', cr ' + G.ship.credits + ', msg "' + G.message + '"');
const direct = ST.deal(G, G.sys, G.t, pick.obj, row.cid, 1, { say: m => { out.push('deal says: ' + m); } });
out.push('direct deal: ' + JSON.stringify(direct) + ', hold ' + cargo());
await wait(500);
await shot('shiptrade-2-bought');
press('ArrowLeft');
out.push('after â† key: hold ' + cargo() + ', cr ' + G.ship.credits + ', msg "' + G.message + '"');
await shot('shiptrade-3-sold');
return out.join(' | ');
