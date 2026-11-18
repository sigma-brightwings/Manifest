/* probe-levelpad.js - riding an inclined lift as a level pad (2026-11-18).
 * Docks at the nearest cradle or cylinder port, starts the transfer out,
 * and pauses the moment she is on the car (arrivalPose.mover) - and again
 * near the top of the ride - to shoot her from beside the bore. */
const G = window.Game, Sim = window.Sim, R = window.Render;
G.title = null;
const out = [];
const want = window.PROBE_MODEL || /^(cradle|cylinder|spine)/;
let port = null;
const stars = G.galaxy.stars.slice().sort((a, b) => window.Galaxy.distance3(a, G.here) - window.Galaxy.distance3(b, G.here));
for (const st of stars.slice(0, 60)) {
  if (st.id !== G.here.id) G.enterSystem(st, { fresh: true });
  port = G.sys.bodies.find(b => b.market && !b.surface && want.test(R.portModelFor(b) || '')) || null;
  if (port) break;
}
if (!port) return 'no port';
out.push('at ' + port.name + ' (' + R.portModelFor(port) + ')');
Sim.dockShip(G.ship, port, G.sys, G.t);
G.panel = 0; G.viewMode = 'orbit'; G.followShip = true;
await wait(2500);
Sim.undockShip(G.ship, G.sys, G.t, 0.003, { transfer: true });
let k = 0, onCar = 0;
const shotsAt = [0.15, 0.55, 0.95];
for (let i = 0; i < 400 && Sim.arrivalActive(G.ship); i++) {
  await wait(150);
  const ap = G.arrivalPose || {};
  const mv = ap.mover;
  if (!mv) continue;
  onCar++;
  const lib = R.libPort(R.portModelFor(port)), car = lib && lib.movers.find(m => m.node === mv.node);
  const f = car ? (mv.s - car.range[0]) / Math.max(1e-9, car.range[1] - car.range[0]) : 0;
  if (k < shotsAt.length && f >= shotsAt[k]) {
    G.paused = true; if (!G.cutaway) await key('`');
    out.push('on ' + mv.node + ' at ' + (f * 100).toFixed(0) + '% level=' + !!(car && car.level));
    for (const [yaw, pitch, d] of [[1.57, 0.02, 0.35], [0.0, 0.02, 0.35], [1.57, 0.9, 0.5]]) {
      G.cam.yaw = yaw; G.cam.pitch = pitch; G.cam.dist = d;
      await wait(700);
      await shot('pad-' + k + '-' + yaw.toFixed(1));
    }
    G.paused = false;
    k++;
  }
}
out.push('frames on the car ' + onCar);
return out.join('\n');
