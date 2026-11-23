/* probe-block.js — for tools/electron-probe.cjs: the reactor block on the
 * L hulls in the real game (2026-11-23). A Kestrel (layout A): the bridge
 * door from the side passage, the cross passage, reactor control at the
 * glass, the reactor; then a Tanker in layout B: the side passage to the
 * bridge's aft door, and the avionics bay.
 *
 *   node tools/electron-probe.cjs tools/probe-block.js "Claude outputs\block-probe"
 */
const G = window.Game, H = window.DevHarness, W = window.Walk;
G.title = null;
const notes = [];
if (!H || !H.on) return 'FAIL: harness not on';
function put(x, z, yaw, pitch) { G.walk.x = x; G.walk.z = z; G.walk.yaw = yaw; G.walk.pitch = pitch || 0; G.walk.ride = null; }
function room(id) { const p = G.walk.plan.ship || G.walk.plan; return p.rooms.find(r => r.id === id); }
async function look(name, x, z, yaw, pitch) {
  put(x, z, yaw, pitch);
  await wait(700);
  await shot(name);
  const r = W.roomAt(G.walk.plan, G.walk.x, G.walk.z);
  notes.push(name + ': in ' + (r ? r.id : '-') + ' near ' + (G.walk.near ? G.walk.near.kind + ' "' + G.walk.near.label + '"' : '-') + ' fps ' + Math.round(G.fps));
}
H.become('kestrel', 'civ', true);
G.ship.blockVariant = 'A';
await wait(300);
window.GameDev.startShipWalk('seat');
await wait(600);
let p = G.walk.plan.ship || G.walk.plan;
notes.push('kestrel layout ' + p.block + ', raised ' + (p.raised ? p.raised.rise : 0));
const bd = SD => SD;
const dB = p.doors.find(d => d.id === 'bridge');
const deck = p.rooms.find(r => r.kind === 'bridgedeck');
await look('01-kestrel-bridge-to-side-door', 0, dB.zc + 0.6, Math.PI / 2 + 0.35);
const side = room('bk-side'), cross = room('bk-cross'), ctl = room('bk-ctl'), rx = room('bk-reactor');
await look('02-kestrel-side-passage-aft', (side.x0 + side.x1) / 2, side.z1 - 0.8, Math.PI);
await look('03-kestrel-cross-passage', (side.x0 + side.x1) / 2, (cross.z0 + cross.z1) / 2, -Math.PI / 2);
await look('04-kestrel-reactor-control-glass', (ctl.x0 + ctl.x1) / 2 - 0.3, ctl.z1 - 0.6, Math.PI, -0.05);
await look('05-kestrel-reactor', rx.x1 - 0.6, rx.z1 - 0.5, Math.PI + 0.5);
H.checkDecks();
H.become('tanker', 'civ', true);
G.ship.blockVariant = 'B';
await wait(300);
window.GameDev.startShipWalk('seat');
await wait(600);
p = G.walk.plan.ship || G.walk.plan;
notes.push('tanker layout ' + p.block);
const side2 = room('bk-side'), bay = room('bk-bay'), dB2 = p.doors.find(d => d.id === 'bridge');
if (side2 && bay) {
  await look('06-tanker-side-passage-to-bridge-door', (side2.x0 + side2.x1) / 2, side2.z0 + 0.5, 0);
  await look('07-tanker-avionics-bay', (bay.x0 + bay.x1) / 2, (bay.z0 + bay.z1) / 2, Math.PI / 2);
}
H.checkDecks();
notes.push('log: ' + document.querySelector('#devh .log') ? '' : '');
return notes.join('\n');
