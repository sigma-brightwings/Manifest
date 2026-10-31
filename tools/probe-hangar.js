/* probe-hangar.js - for tools/electron-probe.cjs: your ship in her hangar
 * (2026-10-31). Berthed at the nearest orbital port, her ramp comes down on
 * its own; stand up, walk down it onto the hangar floor with W alone, look
 * at her, walk back up and aboard, then out through the hangar door to the
 * spine. No E anywhere.
 *
 *     node tools/electron-probe.cjs tools/probe-hangar.js
 */
const G = window.Game, Sim = window.Sim;
G.title = null;
let port = null;
const stars = G.galaxy.stars.slice().sort((a, b) =>
  window.Galaxy.distance3(a, G.here) - window.Galaxy.distance3(b, G.here));
for (const st of stars.slice(0, 20)) {
  if (st.id !== G.here.id) G.enterSystem(st, { fresh: true });
  port = G.sys.bodies.find(b => b.market && !b.surface && !b.underground) || null;
  if (port) break;
}
if (!port) return 'FAIL: no orbital port';
Sim.dockShip(G.ship, port, G.sys, G.t);
G.panel = 0; G.viewMode = 'cockpit';
await wait(8000);                        // the ramp comes down on its own
const al = G.ship.airlock || {};
const out = ['berth ' + !!al.berth + ' ramp ' + (al.ramp || 0).toFixed(2) + ' side ' + al.side];
await key('o');
await wait(1200);
if (!G.walk) return 'FAIL: O did not stand you up | ' + out.join(' | ');
const R = window.Render, lp = R.shipInterior(G.ship).plan, rp = lp.ramp;
if (!rp) return 'FAIL: no ramp | ' + out.join(' | ');
const main = lp.decks ? lp.decks.main : lp;
const hold = async (k, ms) => {
  window.dispatchEvent(new KeyboardEvent('keydown', { key: k, code: 'Key' + k.toUpperCase() }));
  await wait(ms);
  window.dispatchEvent(new KeyboardEvent('keyup', { key: k, code: 'Key' + k.toUpperCase() }));
};
/* Into the airlock at the head of her ramp, facing down it (aft, -z). */
if (G.walk.plan !== main) { G.walk.plan = main; }
G.walk.x = (rp.x0 + rp.x1) / 2; G.walk.z = rp.hinge + 0.6; G.walk.yaw = Math.PI; G.walk.pitch = -0.25;
await wait(1500);
const inner = (lp.doors || []).find(d => d.id === 'lock');
out.push('inner door ' + (inner ? (inner.locked ? 'locked' : 'unlocked') : 'none'));
await shot('h1-airlock-down-the-ramp');
await hold('w', 1600);
await wait(300);
out.push('after walking down: ship ' + !!G.walk.ship + ' hangar ' + !!(G.walk.plan && G.walk.plan.hangar) + ' dy ' + (G.walk.dy || 0).toFixed(2));
await shot('h2-on-the-ramp-going-down');
await hold('w', 1800);
await wait(300);
const p = G.walk.plan;
out.push('on the floor: ship ' + !!G.walk.ship + ' room ' + ((window.Walk.roomAt(p, G.walk.x, G.walk.z) || {}).label || '?') + ' dy ' + (G.walk.dy || 0).toFixed(2));
/* Turn round and look at her. */
G.walk.yaw += Math.PI; G.walk.pitch = 0.12;
await wait(1200);
await shot('h3-looking-back-at-her');
/* From the hangar door, the whole of her. */
const H = p && p.hangar, hroom = H && p.rooms.find(r => r.id === H.room);
if (hroom) {
  const door = p.doors.find(d => d.a === hroom.id || d.b === hroom.id);
  const inward = hroom.side < 0 ? -1 : 1;
  G.walk.x = door.at + inward * 1.2; G.walk.z = (door.z0 + door.z1) / 2; G.walk.yaw = inward > 0 ? Math.PI / 2 : -Math.PI / 2; G.walk.pitch = 0.1;
  await wait(1500);
  await shot('h4-from-the-hangar-door');
  /* Under her flank: does it make you crouch? */
  const hb = hroom.hullBox;
  G.walk.x = (hb[0] + hb[2]) / 2; G.walk.z = hb[1] - 0.6; G.walk.yaw = 0; G.walk.pitch = 0.3;
  await wait(1200);
  out.push('beside her: crouch ' + (G.walk.crouch || 0).toFixed(2) + ' standable ' + window.Walk.standable(p, G.walk.x, G.walk.z));
  await shot('h5-beside-her');
  /* Back to the ramp's foot, and up it. */
  G.walk.x = H.foot.x + (hroom.side < 0 ? 1.5 : -1.5); G.walk.z = H.foot.z;
  G.walk.yaw = hroom.side < 0 ? -Math.PI / 2 : Math.PI / 2; G.walk.pitch = 0;
  await wait(800);
  await shot('h6-at-the-foot-of-her-ramp');
  await hold('w', 2300);
  out.push('halfway: dy ' + (G.walk.dy || 0).toFixed(2) + ' ship ' + !!G.walk.ship);
  await shot('h6b-halfway-up-her-ramp');
  await hold('w', 3000);
  await wait(400);
  out.push('walked up: ship ' + !!G.walk.ship + ' plan ' + (G.walk.plan && (G.walk.plan.deck || G.walk.plan.kind || 'main')));
  await shot('h7-back-aboard');
}
return 'port ' + port.name + ' | hull ' + G.ship.hullId + ' | ' + out.join(' | ');
