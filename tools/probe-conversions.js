/* probe-conversions.js - hold into a hardpoint, in the running game.
 * Docked at a shipyard in the start system: the FITTING tab with its new
 * rows, one registered and one concealed hardpoint cut, guns in both; then
 * out on the clamp-side view before and after the hidden gun fires.
 *
 *     node tools/electron-probe.cjs tools/probe-conversions.js "<outdir>"
 */
if (window.Sound && window.Sound.mute) window.Sound.mute(true);
const G = window.Game, C = window.Combat;
G.title = null;
if (G.tutorial) { G.tutorial.done = true; G.tutorial.ended = true; }
const out = [];
const yard = (G.sys.ports || []).find(p => C.isShipyard(p));
out.push('shipyard: ' + (yard ? yard.name : 'none in ' + G.here.name));
const port = yard || G.sys.byId[G.ship.docked];
if (yard && G.ship.docked !== yard.id) G.ship.docked = yard.id;
/* Bought for the screenshot: the concealed row only shows where it can be had. */
G.corruptionShift = G.corruptionShift || {};
G.corruptionShift[G.here.id] = { v: 40, t: G.t };
out.push('corruption now ' + C.systemCorruption(G, G.sys));
G.ship.credits = 400000;
const s = G.ship;
out.push('hold before ' + s.cargoCap + ' t, hardpoints ' + C.slotKeys(s).filter(k => /^hardpoint/.test(k)).length);
for (const type of ['keydown', 'keyup']) window.dispatchEvent(new KeyboardEvent(type, { key: 'F5', code: 'F5', bubbles: true }));
await wait(300);
G.yardTab = 'fit';
await wait(800);
await shot('1-fit-before');
const a = C.convert(G, port, 'open'), b = C.convert(G, port, 'hidden');
out.push('registered: ' + JSON.stringify(a) + '  concealed: ' + JSON.stringify(b));
if (a.ok) C.fitItem(s, 'phpulse', a.key);
if (b.ok) C.fitItem(s, 'phpulse', b.key);
C.syncLegacy(s);
out.push('hold after ' + s.cargoCap + ' t, hardpoints ' + C.slotKeys(s).filter(k => /^hardpoint/.test(k)).length +
         ', looks armed to a pirate: ' + C.visiblyArmed(s));
G.yardScroll = 99;
await wait(800);
await shot('2-fit-after');
return out.join('\n');
