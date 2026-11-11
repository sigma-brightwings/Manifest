/* probe-aurora.js - for tools/electron-probe.cjs: the aurorae and the
 * atmospheric envelope from orbit (2026-11-10). One world of each kind that
 * has a field and air - a terran/ocean world, a gas giant, an ice giant -
 * seen from the night-leaning side at 4 radii, so the oval round each
 * magnetic pole, the twilight band and the halo all show.
 *
 *     node tools/electron-probe.cjs tools/probe-aurora.js "Claude outputs\aurora-probe"
 */
const G = window.Game, Sim = window.Sim, V = window.V;
G.title = null;
G.paused = true;
const want = [
  ['terran', b => (b.type === 'terran' || b.type === 'ocean')],
  ['gas', b => b.type === 'gasGiant'],
  ['ice', b => b.type === 'iceGiant']
];
const found = {};
const stars = G.galaxy.stars.slice().sort((a, b) => window.Galaxy.distance3(a, G.here) - window.Galaxy.distance3(b, G.here));
for (const st of stars.slice(0, 40)) {
  if (want.every(w => found[w[0]])) break;
  if (st.id !== G.here.id) G.enterSystem(st, { fresh: true });
  for (const w of want) {
    if (found[w[0]]) continue;
    const b = G.sys.bodies.find(x => (x.kind === 'planet') && x.magnetosphere && x.atmosphere && w[1](x));
    if (b) found[w[0]] = { body: b, star: st };
  }
}
const out = [];
for (const w of want) {
  const f = found[w[0]];
  if (!f) { out.push(w[0] + ': none found'); continue; }
  /* Always enter: the search above left G.sys on whichever star it tried last. */
  G.enterSystem(f.star, { fresh: true });
  const b = G.sys.bodies.find(x => x.id === f.body.id) || f.body;
  const ws = Sim.bodyState(b, G.sys, G.t);
  const sun = V.norm(V.scale(ws.pos, -1));
  const side = V.norm(V.cross(sun, { x: 0, y: 0, z: 1 }));
  /* Night-leaning and well above the equator, so the ring round the pole
   * shows as an oval and not an edge-on sliver on the limb. */
  const d = V.norm(V.add(V.add(V.scale(sun, -0.45), V.scale(side, 0.55)), { x: 0, y: 0, z: 0.75 }));
  G.ship.docked = null; G.ship.landed = false; G.ship.crashed = false;
  G.ship.pos = V.add(ws.pos, V.scale(d, b.radius * 4));
  G.ship.vel = V.clone(ws.vel);
  const fwd = V.norm(V.sub(ws.pos, G.ship.pos));
  const right = V.norm(V.cross(fwd, { x: 0, y: 0, z: 1 }));
  G.ship.fwd = fwd; G.ship.right = right; G.ship.up = V.norm(V.cross(right, fwd));
  G.viewMode = 'cockpit';
  await wait(2500);
  await shot('aurora-' + w[0]);
  out.push('  framed ' + b.name + ' in ' + G.sys.name);
  const m = b.magnetosphere;
  out.push(w[0] + ': ' + b.name + ' (' + b.type + ') strength ' + m.strength.toFixed(2) +
           ' tilt ' + (m.tilt * 180 / Math.PI).toFixed(0) + ' deg activity ' + m.activity.toFixed(2));
}
return out.join('\n') + '\nfps ' + Math.round(G.fps);
