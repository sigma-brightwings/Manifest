/* probe-padfit.js - does the level pad sit where it should (2026-11-18)?
 * Rides the transfer out of the nearest cradle/cylinder/spine port and, at
 * three points on the car, measures in metres: her keel against the pad's
 * deck, the shaft floor under the pad's four corners against the pad's
 * underside there, and the ceiling over her middle. */
const G = window.Game, Sim = window.Sim, R = window.Render, V = window.V;
G.title = null;
const out = [];
let port = null;
const want = window.PROBE_MODEL || /^(cradle|cylinder|spine)/;
const stars = G.galaxy.stars.slice().sort((a, b) => window.Galaxy.distance3(a, G.here) - window.Galaxy.distance3(b, G.here));
for (const st of stars.slice(0, 60)) {
  if (st.id !== G.here.id) G.enterSystem(st, { fresh: true });
  port = G.sys.bodies.find(b => b.market && !b.surface && want.test(R.portModelFor(b) || '')) || null;
  if (port) break;
}
if (!port) return 'no port';
const role = R.portModelFor(port), lib = R.libPort(role), rKm = port.radius;
const Mm = rKm * 1000;                       // metres per model unit
out.push(port.name + ' ' + role + ' r ' + rKm.toFixed(3) + ' km');
function hit(o, d, a, b, c) {
  const e1 = [b[0]-a[0], b[1]-a[1], b[2]-a[2]], e2 = [c[0]-a[0], c[1]-a[1], c[2]-a[2]];
  const p = [d[1]*e2[2]-d[2]*e2[1], d[2]*e2[0]-d[0]*e2[2], d[0]*e2[1]-d[1]*e2[0]];
  const det = e1[0]*p[0]+e1[1]*p[1]+e1[2]*p[2]; if (Math.abs(det) < 1e-14) return -1;
  const inv = 1/det, t0 = [o[0]-a[0], o[1]-a[1], o[2]-a[2]];
  const u = (t0[0]*p[0]+t0[1]*p[1]+t0[2]*p[2])*inv; if (u < 0 || u > 1) return -1;
  const q = [t0[1]*e1[2]-t0[2]*e1[1], t0[2]*e1[0]-t0[0]*e1[2], t0[0]*e1[1]-t0[1]*e1[0]];
  const v = (d[0]*q[0]+d[1]*q[1]+d[2]*q[2])*inv; if (v < 0 || u+v > 1) return -1;
  const t = (e2[0]*q[0]+e2[1]*q[1]+e2[2]*q[2])*inv; return t > 1e-7 ? t : -1;
}
const SH = lib.shell;
function cast(o, d) {
  let best = Infinity;
  for (const f of SH.f) { const h = hit(o, d, SH.v[f[0]], SH.v[f[1]], SH.v[f[2]]); if (h > 0 && h < best) best = h; }
  return best;
}
Sim.dockShip(G.ship, port, G.sys, G.t);
G.panel = 0; G.viewMode = 'orbit';
await wait(2000);
Sim.undockShip(G.ship, G.sys, G.t, 0.003, { transfer: true });
const marks = [0.1, 0.5, 0.9]; let k = 0;
for (let i = 0; i < 600 && Sim.arrivalActive(G.ship) && k < marks.length; i++) {
  await wait(100);
  const mvp = (G.arrivalPose || {}).mover; if (!mvp) continue;
  const car = lib.movers.find(m => m.node === mvp.node); if (!car || !car.level) continue;
  const f = (mvp.s - car.range[0]) / (car.range[1] - car.range[0]);
  if (f < marks[k]) continue;
  const L = car.level, ax = car.axis, s = mvp.s;
  const basis = Sim.portBasis(port, G.sys, G.t);
  const rel = V.sub(G.ship.pos, basis.entrance.pos);
  const sp = [V.dot(rel, basis.east) / rKm, V.dot(rel, basis.north) / rKm, V.dot(rel, basis.up) / rKm];
  /* On the car, not waiting for it: her place along its axis is the car's. */
  const sShip = (sp[0] - car.mid[0]) * ax[0] + (sp[1] - car.mid[1]) * ax[1] + (sp[2] - car.mid[2]) * ax[2];
  if (Math.abs(sShip - s) * Mm > 30) continue;
  G.paused = true;
  const deckNow = car.deck + ax[2] * s;
  const keel = (R.hullFit ? (R.hullFit(G.ship) || {}).keel : null);
  const cx = car.mid[0] + ax[0] * s, cy = car.mid[1] + ax[1] * s;
  const row = [car.node + ' ' + (f * 100).toFixed(0) + '%: hull centre ' + ((sp[2] - deckNow) * Mm).toFixed(1) + ' m over the deck'];
  /* Floor under the pad's corners vs the pad's underside there. */
  const [ux, uy] = L.uphill, pxv = -uy, pyv = ux;
  for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, 0]]) {
    const x = cx + ux * a * L.hl * 0.98 + pxv * b * L.hw * 0.98, y = cy + uy * a * L.hl * 0.98 + pyv * b * L.hw * 0.98;
    const under = (a < 0 ? L.low : a > 0 ? L.top - (L.top - L.low) * 0.0 - 0 : (L.top + L.low) / 2) + ax[2] * s;
    const padBottom = (L.low + (L.top - L.low) * (a + 1) / 2) + ax[2] * s - (a > 0 ? 0 : 0);
    const fl = cast([x, y, deckNow - 1e-5], [0, 0, -1]);
    row.push('(' + a + ',' + b + ') floor-minus-pad ' + (isFinite(fl) ? ((deckNow - fl - padBottom) * Mm).toFixed(1) : 'none') + ' m');
  }
  const up = cast([sp[0], sp[1], sp[2]], [0, 0, 1]);
  row.push('ceiling ' + (isFinite(up) ? (up * Mm).toFixed(1) : 'open') + ' m over her middle');
  out.push(row.join(' | '));
  G.paused = false; k++;
}
return out.join('\n');
