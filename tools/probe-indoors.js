/* probe-indoors.js - what the indoor tests say along a transfer out of
 * Threshold Dock (2026-11-18). Astra saw Mirven's glow, planet labels and
 * the orbit line painted through the bore and the hall: the sky comes back
 * when the game thinks she is outdoors. Logs, every half second: the rail's
 * own `enclosed`, Sim.insideStation, and the occupancy cell under her. */
const G = window.Game, Sim = window.Sim, R = window.Render, V = window.V;
G.title = null;
const port = G.sys.bodies.find(b => /Threshold/.test(b.name || ''));
if (!port) return 'no Threshold';
const role = R.portModelFor(port), sol = R.portSolidity(role), rKm = port.radius;
const NAMES = { 0: 'unknown', 1: 'wall', 2: 'OUT', 3: 'room', 4: 'door' };
const out = [port.name + ' ' + role + ' SOLID_IN ' + R.SOLID_IN + ' OUT ' + R.SOLID_OUT + ' DOOR ' + R.SOLID_DOOR];
Sim.dockShip(G.ship, port, G.sys, G.t);
G.panel = 0; G.viewMode = 'orbit';
await wait(2000);
out.push('docked: inside ' + !!Sim.insideStation(G.ship.pos, G.sys, G.t));
Sim.undockShip(G.ship, G.sys, G.t, 0.003, { transfer: true });
let last = '';
for (let i = 0; i < 160 && Sim.arrivalActive(G.ship); i++) {
  await wait(400);
  const ap = G.arrivalPose || {};
  const basis = Sim.portBasis(port, G.sys, G.t);
  const rel = V.sub(G.ship.pos, basis.entrance.pos);
  const lp = [V.dot(rel, basis.east) / rKm, V.dot(rel, basis.north) / rKm, V.dot(rel, basis.up) / rKm];
  const cell = R.solidityAt(sol, lp[0], lp[1], lp[2]);
  const ins = !!Sim.insideStation(G.ship.pos, G.sys, G.t);
  const line = 'leg ' + ap.legId + ' enclosed ' + !!ap.enclosed + ' insideStation ' + ins + ' cell ' + (NAMES[cell] || cell) + (ap.mover ? ' car' : '');
  if (line !== last) { out.push('t' + i + ' ' + line); last = line; }
}
return out.join('\n');
