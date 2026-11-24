/* probe-devharness.js — for tools/electron-probe.cjs: the developer's
 * panel in the real game (2026-11-23). Opens it with the ` key, becomes a
 * Capital, stands up, jumps to a room on her 2nd deck, checks her decks,
 * sets the hull to 30 %, and shoots each step.
 *
 *   node tools/electron-probe.cjs tools/probe-devharness.js "Claude outputs\devharness-probe"
 */
const G = window.Game, H = window.DevHarness;
G.title = null;
const notes = [];
if (!H || !H.on) return 'FAIL: harness not on (page search=' + location.search + ')';
function press(k, code) {
  window.dispatchEvent(new KeyboardEvent('keydown', { key: k, code: code, bubbles: true }));
}
press('`', 'Backquote');
await wait(300);
const panel = document.getElementById('devh');
notes.push('panel ' + (panel && panel.style.display === 'block' ? 'open' : 'MISSING'));
await shot('01-panel');
H.become('capital', 'navy', true);
await wait(300);
window.GameDev.startShipWalk('seat');
await wait(500);
const whole = G.walk && (G.walk.plan.ship || G.walk.plan);
notes.push('decks ' + (whole && whole.deckAll ? whole.deckAll.join(',') : '-'));
const target = whole && whole.rooms.filter(r => r.deck === 'n2' && r.walk !== false)[0];
if (target) {
  H.goTo('n2', target.id);
  await wait(600);
  const r = window.Walk.roomAt(G.walk.plan, G.walk.x, G.walk.z);
  notes.push('goTo ' + target.id + ' -> in ' + (r ? r.id : 'nothing') + ' deck ' + G.walk.plan.deck);
} else notes.push('no n2 room');
await shot('02-teleported');
H.checkDecks();
const slider = panel.querySelector('input[type=range]');
slider.value = 30; slider.dispatchEvent(new Event('input'));
await wait(400);
await shot('03-checked');
/* A field in the panel keeps its keys: W in the star box must not walk. */
const box = panel.querySelector('input[placeholder="star name"]');
box.focus();
const z0 = G.walk.z;
box.dispatchEvent(new KeyboardEvent('keydown', { key: 'w', code: 'KeyW', bubbles: true }));
await wait(500);
box.dispatchEvent(new KeyboardEvent('keyup', { key: 'w', code: 'KeyW', bubbles: true }));
notes.push('typing w moved walker ' + Math.abs(G.walk.z - z0).toFixed(3) + ' m');
notes.push('hull ' + Math.round(100 * G.ship.hullHp / G.ship.hullMax) + ' %');
notes.push('log: ' + panel.querySelector('.log').innerText.split('\n').join(' | '));
return notes.join('\n');
