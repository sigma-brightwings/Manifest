/* probe-bayframe.js - raw numbers behind main.js berthBay (2026-11-18). */
const G = window.Game, Sim = window.Sim, V = window.V, Gen = window.Gen, R = window.Render;
G.title = null;
const port = G.sys.bodies.find(b => b.market && !b.surface && !b.underground && !b.seaPlatform);
if (!port) return 'no port';
const out = [];
for (const berth of [0, 3]) {
  Sim.dockShip(G.ship, port, G.sys, G.t, berth);
  await wait(300);
  const room = Sim.berthRoom(port, berth), g = Gen.bayGeometry(port), r = port.radius;
  const basis = Sim.portBasis(port, G.sys, G.t);
  const rel = V.sub(G.ship.pos, basis.entrance.pos);
  const e = V.dot(rel, basis.east) / r, n = V.dot(rel, basis.north) / r, u = V.dot(rel, basis.up) / r - (g.lift || 0);
  out.push('berth ' + berth + ' r ' + r + ' lift ' + g.lift + ' room ' + JSON.stringify(room));
  out.push('  ship at e ' + e.toFixed(4) + ' n ' + n.toFixed(4) + ' z ' + u.toFixed(4) +
           ' dockOffset ' + JSON.stringify(G.ship.dockOffset));
  out.push('  ship fwd·east ' + V.dot(G.ship.fwd, basis.east).toFixed(2) + ' ·north ' + V.dot(G.ship.fwd, basis.north).toFixed(2) +
           ' ·up ' + V.dot(G.ship.fwd, basis.up).toFixed(2) + ' hullLen m ' + (R.hullLength(G.ship) * 1000).toFixed(1));
  const keys = Object.keys(basis);
  out.push('  basis keys ' + keys.join(','));
}
return out.join('\n');
