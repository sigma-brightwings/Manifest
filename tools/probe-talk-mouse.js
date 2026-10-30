/* probe-talk-mouse.js — the talk panel, worked with the mouse alone
 * (2026-10-29). Docks, steps out, opens a conversation with the bartender,
 * hovers a reply, clicks it, and clicks through to the end. Muted.
 *
 *     node tools/electron-probe.cjs tools/probe-talk-mouse.js "Claude outputs\talk-mouse"
 */
if (window.Sound && window.Sound.mute) window.Sound.mute(true);
const G = window.Game, Sim = window.Sim, D = window.Dialogue;
G.title = null;
let port = null;
const stars = G.galaxy.stars.slice().sort((a, b) => window.Galaxy.distance3(a, G.here) - window.Galaxy.distance3(b, G.here));
for (const st of stars.slice(0, 40)) {
  if (st.id !== G.here.id) G.enterSystem(st, { fresh: true });
  const y = G.sys.bodies.find(b => b.market && !b.surface && !b.underground);
  if (y) { Sim.dockShip(G.ship, y, G.sys, G.t); port = y; break; }
}
G.ship.credits = 50000;
G.panel = 0; G.viewMode = 'cockpit';
const notes = [];
await wait(800);
await key('o');
await wait(1000);
const pl = G.walk.plan.ship && G.walk.plan.ship.decks ? G.walk.plan.ship.decks.main : G.walk.plan;
G.walk.plan = pl;
const ctl = pl.items.find(it => it.kind === 'hatch'), ramp = pl.items.find(it => it.kind === 'ramp');
G.walk.near = ctl; await key('e'); await wait(6000);
G.walk.near = ramp; await key('e'); await wait(400);
if (G.walk && G.walk.ship) { G.walk.near = ramp; await key('e'); await wait(1500); }
if (!G.walk || G.walk.ship) return 'FAIL: not on the station deck';
const who = window.Npc.lastScene.people.find(p => D.kindOf(p) === 'bartender') || window.Npc.lastScene.people[0];
G.walk.x = who.x + Math.sin(who.yaw) * 1.1; G.walk.z = who.z + Math.cos(who.yaw) * 1.1;
G.walk.yaw = Math.atan2(who.x - G.walk.x, who.z - G.walk.z);
await wait(300);
G.walk.near = { kind: 'npc', npc: who, label: 'Talk to ' + who.name, x: who.x, z: who.z };
await key('e');
await wait(800);
if (!G.talk) return 'FAIL: no conversation';
const canvas = document.getElementById('view') || document.querySelector('canvas');
const rect = canvas.getBoundingClientRect();
const rows = () => G.hotspots.filter(h => h.hint && (h.hint === 'say this' || G.talk));
function rowSpot(i) { const r = G.hotspots.filter(h => h.hint === 'say this')[i]; return r; }
const r0 = rowSpot(0);
notes.push('rows clickable: ' + G.hotspots.filter(h => h.hint === 'say this').length + ', pointer locked: ' + !!document.pointerLockElement);
/* Hover the first reply. */
window.dispatchEvent(new MouseEvent('mousemove', { clientX: rect.left + r0.x + 40, clientY: rect.top + r0.y + 10, bubbles: true }));
await wait(300);
notes.push('cursor over a reply: ' + canvas.style.cursor);
await shot('1-hover');
const before = G.talk.st.line;
canvas.dispatchEvent(new MouseEvent('mousedown', { clientX: rect.left + r0.x + 40, clientY: rect.top + r0.y + 10, button: 0, bubbles: true }));
canvas.dispatchEvent(new MouseEvent('mouseup', { clientX: rect.left + r0.x + 40, clientY: rect.top + r0.y + 10, button: 0, bubbles: true }));
await wait(500);
notes.push('clicked reply 1: line changed ' + (G.talk && G.talk.st.line !== before) + ' -> "' + (G.talk ? G.talk.st.line : '(closed)') + '"');
await shot('2-after-click');
/* And Goodbye, by mouse. */
const bye = G.hotspots.filter(h => h.hint === 'say this').slice(-1)[0];
canvas.dispatchEvent(new MouseEvent('mousedown', { clientX: rect.left + bye.x + 40, clientY: rect.top + bye.y + 10, button: 0, bubbles: true }));
await wait(500);
notes.push('goodbye: ended ' + !!(G.talk && G.talk.st.end) + ' "' + (G.talk ? G.talk.st.line : '') + '"');
await shot('3-goodbye');
const panel = G.hotspots.find(h => h.hint === 'walk on');
if (panel) {
  canvas.dispatchEvent(new MouseEvent('mousedown', { clientX: rect.left + panel.x + 20, clientY: rect.top + panel.y + 20, button: 0, bubbles: true }));
  await wait(400);
}
notes.push('after clicking the finished panel: talking ' + !!G.talk + ', cursor "' + canvas.style.cursor + '"');
return notes.join('\n');
