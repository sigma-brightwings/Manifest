/* probe-halden.js - the lift Astra photographed at Halden Depot (Mirven),
 * ridden on the transfer out, shot when she is on the car. */
const G = window.Game, Sim = window.Sim, R = window.Render, V = window.V;
G.title = null;
const port = G.sys.bodies.find(b => /Threshold/.test(b.name || ''));
if (!port) return 'no Halden here: ' + G.sys.bodies.filter(b => b.market).map(b => b.name).join(', ');
const role = R.portModelFor(port), lib = R.libPort(role), rKm = port.radius;
const out = [port.name + ' ' + role];
Sim.dockShip(G.ship, port, G.sys, G.t);
G.panel = 0; G.viewMode = 'orbit'; G.followShip = true;
await wait(2500);
Sim.undockShip(G.ship, G.sys, G.t, 0.003, { transfer: true });
let n = 0, lastF = -1;
for (let i = 0; i < 700 && Sim.arrivalActive(G.ship) && n < 6; i++) {
  await wait(100);
  const mvp = (G.arrivalPose || {}).mover; if (!mvp) continue;
  const car = lib.movers.find(m => m.node === mvp.node); if (!car) continue;
  const basis = Sim.portBasis(port, G.sys, G.t);
  const rel = V.sub(G.ship.pos, basis.entrance.pos);
  const sp = [V.dot(rel, basis.east) / rKm, V.dot(rel, basis.north) / rKm, V.dot(rel, basis.up) / rKm];
  const ax = car.axis;
  const sShip = (sp[0] - car.mid[0]) * ax[0] + (sp[1] - car.mid[1]) * ax[1] + (sp[2] - car.mid[2]) * ax[2];
  if (Math.abs(sShip - mvp.s) * rKm * 1000 > 30) continue;
  const f = (mvp.s - car.range[0]) / (car.range[1] - car.range[0]);
  if (f - lastF < 0.3) continue;
  lastF = f;
  G.paused = true;
  out.push(car.node + ' at ' + (f * 100).toFixed(0) + '% level ' + !!car.level);
  for (const [yaw, pitch, d] of [[0.9, 0.25, 0.06], [2.4, 0.15, 0.06], [1.6, 0.05, 0.05]]) {
    G.cam.yaw = yaw; G.cam.pitch = pitch; G.cam.dist = d;
    await wait(800);
    await shot('halden-' + (n++));
  }
  G.paused = false;
}
return out.join('\n');
