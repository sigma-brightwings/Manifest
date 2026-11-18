/* probe-transit.js - for tools/electron-probe.cjs (2026-11-18). Astra, from
 * play: the ship's hull half buried in the cargo lift instead of sitting on
 * it; lifts that are a flat panel not standing out square to their travel;
 * the engines firing against the direction of motion through the station;
 * the star visible through walls. This rides the transfer out of a berth
 * (the arrival rail backwards: stand, traverser, lift, doors) at one
 * orbital port and one ground port, cutaway on, and screenshots each leg.
 *
 *     node tools/electron-probe.cjs tools/probe-transit.js
 */
const G = window.Game, Sim = window.Sim, V = window.V;
G.title = null;
const out = [];
function findPort(pred) {
  const stars = G.galaxy.stars.slice().sort((a, b) =>
    window.Galaxy.distance3(a, G.here) - window.Galaxy.distance3(b, G.here));
  for (const st of stars.slice(0, 30)) {
    if (st.id !== G.here.id) G.enterSystem(st, { fresh: true });
    const p = G.sys.bodies.find(pred);
    if (p) return p;
  }
  return null;
}
async function ride(tag, port) {
  if (!port) { out.push(tag + ': none found'); return; }
  Sim.dockShip(G.ship, port, G.sys, G.t);
  G.panel = 0; G.viewMode = 'orbit'; G.followShip = true;
  await wait(3000);
  const left = Sim.undockShip(G.ship, G.sys, G.t, 0.003, { transfer: true });
  out.push(tag + ' ' + port.name + ' (' + (port.model || port.kind || '?') + ') transfer ' + !!left +
           ' arrival ' + !!G.ship.arrival);
  if (!G.cutaway) await key('`');
  G.cam.pitch = 0.35; G.cam.yaw = 0.8;
  let lastLeg = null, n = 0, prevPos = V.clone(G.ship.pos);
  for (let i = 0; i < 60 && Sim.arrivalActive(G.ship); i++) {
    await wait(700);
    const ap = G.arrivalPose || {};
    const moved = V.sub(G.ship.pos, prevPos); prevPos = V.clone(G.ship.pos);
    const ml = V.len(moved);
    const alongNose = ml > 1e-9 ? V.dot(V.scale(moved, 1 / ml), G.ship.fwd) : 0;
    const th = V.len(G.ship.thrust || V.zero());
    const line = tag + ' t' + i + ' leg ' + ap.legId + ' enc ' + !!ap.enclosed +
      ' move ' + (ml * 1e6).toFixed(0) + ' mm/step nose·move ' + alongNose.toFixed(2) +
      ' thrust ' + th.toExponential(1) + ' cut ' + !!G.cutaway;
    if (ap.legId !== lastLeg || i % 4 === 0) {
      out.push(line);
      await shot(tag + '-' + String(n++).padStart(2, '0') + '-' + ap.legId);
      lastLeg = ap.legId;
    }
  }
  out.push(tag + ' done, arrival ' + !!G.ship.arrival);
}
await ride('orb', findPort(b => b.market && !b.surface && !b.underground && !b.seaPlatform));
await ride('gnd', findPort(b => b.market && b.surface && !b.seaPlatform));
return out.join('\n');
