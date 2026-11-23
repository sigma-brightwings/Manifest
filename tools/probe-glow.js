/* probe-glow.js — for tools/electron-probe.cjs: the reactor's glass in the
 * real game (2026-11-23). Reactor control on a Kestrel (vertical core) and
 * a Capital (horizontal, rods from the front), at her berth's idle, at
 * full power, and scrammed; and the tank from the reactor room's side.
 *
 *   node tools/electron-probe.cjs tools/probe-glow.js "Claude outputs\glow-probe"
 */
const G = window.Game, H = window.DevHarness, W = window.Walk, SD = window.ShipDeck;
G.title = null;
const notes = [];
if (!H || !H.on) return 'FAIL: harness not on';
function plan() { return G.walk.plan.ship || G.walk.plan; }
async function at(name, dk, x, z, yaw, pitch) {
  if (!G.walk) { notes.push(name + ': walk had ended, standing up again'); window.GameDev.startShipWalk('seat'); await wait(500); }
  if (!G.walk) { notes.push(name + ': could not stand up'); return; }
  const p = plan();
  if (dk && p.decks && p.decks[dk]) { G.walk.plan = p.decks[dk]; G.walk.deck = dk; }
  G.walk.x = x; G.walk.z = z; G.walk.yaw = yaw; G.walk.pitch = pitch || 0; G.walk.ride = null;
  await wait(700);
  await shot(name);
  notes.push(name + ': reactor ' + (SD.reactorPower(G.ship, G.t) * 100).toFixed(1) + ' %, fps ' + Math.round(G.fps));
}
async function look(tag, hull) {
  H.become(hull, 'navy', true);
  await wait(300);
  window.GameDev.startShipWalk('seat');
  await wait(600);
  const p = plan(), rx = p.naval.reactors[0], T = SD.reactorTank(p, rx), w = rx.window;
  const ctl = p.rooms.find(r => r.id === rx.control), rr = p.rooms.find(r => r.id === rx.room);
  const ex = (w.x0 + w.x1) / 2, ez = Math.min(ctl.z1 - 0.4, T.zc + 1.6);
  /* At her berth: her hotel load. */
  SD.restartReactor(G.ship, G.t); G.ship._rx = null;
  await at(tag + '-1-berth', ctl.deck, ex, ez, Math.PI, -0.05);
  /* Full power and a fresh scram's afterglow: pinned (she is at a berth,
   * where the real thing would ease back to her hotel load). */
  const real = SD.reactorPower;
  SD.reactorPower = function () { return 1; };
  await at(tag + '-2-full', ctl.deck, ex, ez, Math.PI, -0.05);
  SD.reactorPower = function () { return 0.075; };
  await at(tag + '-3-scram', ctl.deck, ex, ez, Math.PI, -0.05);
  SD.reactorPower = function () { return 1; };
  /* The tank from the reactor's own room, by its door. */
  await at(tag + '-4-tank', rr.deck, Math.min(rr.x1 - 0.5, T.x1 + 0.45), rr.z1 - 0.6, Math.PI + 0.7, -0.15);
  SD.reactorPower = real;
}
try {
  await look('kestrel', 'kestrel');
  await look('capital', 'capital');
} catch (e) { notes.push('THREW ' + e.message + ' walk=' + !!G.walk); }
return notes.join('\n');
