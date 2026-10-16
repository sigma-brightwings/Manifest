// Body of an async function run by tools/electron-probe.cjs inside the game.
const G = Game, V = window.V, R = window.Rings;
G.title = null; G.menu = null;
G.enterSystem(G.galaxy.stars[5]);           // Taolmai: a grand ring on VII
await wait(1500);
const out = { adapter: window.GLWorld && GLWorld.adapter, rings: GLWorld.rings };
const planet = G.sys.bodies.find(b => b.ring && b.ring.grand);
out.planet = planet && planet.name;
function park(pos, vel, look, camDist) {
  const s = G.ship;
  s.docked = null; s.landed = null; G.dockTarget = null; s.departed = true;
  s.pos = pos; s.vel = vel; s.thrust = { x: 0, y: 0, z: 0 };
  const f = V.norm(look);
  const ref = Math.abs(f.z) < 0.9 ? { x: 0, y: 0, z: 1 } : { x: 1, y: 0, z: 0 };
  const r = V.norm(V.cross(f, ref));
  s.fwd = f; s.right = r; s.up = V.cross(r, f);
  G.cam.target = V.clone(pos);
  if (camDist) G.cam.dist = camDist;
}
async function fps(ms) {
  let n = 0; const t0 = performance.now();
  await new Promise(res => { function f() { n++; if (performance.now() - t0 < ms) requestAnimationFrame(f); else res(); } requestAnimationFrame(f); });
  return +(n * 1000 / (performance.now() - t0)).toFixed(1);
}
const t = G.t;
const ps = Sim.bodyState(planet, G.sys, t);
const fr = R.ringFrame(planet), rg = planet.ring;
let best = 0, bestR = 0;
for (let r = rg.inner; r < rg.outer; r += (rg.outer - rg.inner) / 300) { const d = R.ringDensity(rg, r); if (d > best) { best = d; bestR = r; } }
const mu = 6.6743e-20 * planet.mass;

// 1. The whole ring from well above it, sunward side.
const starPos = Sim.bodyPosition(G.sys.root, G.sys, t);
const sun = V.norm(V.sub(starPos, ps.pos));
const sideN = V.dot(sun, fr.n) > 0 ? fr.n : V.scale(fr.n, -1);
const viewFrom = V.add(ps.pos, V.add(V.scale(sideN, rg.outer * 1.6), V.scale(fr.e1, rg.outer * 2.2)));
park(viewFrom, ps.vel, V.sub(ps.pos, viewFrom), 0.4);
G.viewMode = 'cockpit'; G.paused = true;
await wait(1200); await shot('ring-overview-cockpit');
out.fpsOverview = await fps(3000);

// 2. Inside the dense part of the ring, matched to it, looking along it.
const at = V.add(ps.pos, V.add(V.scale(fr.e1, bestR), V.scale(fr.n, 0.05)));
const vt = Math.sqrt(mu / bestR) * fr.spin;
const v = V.add(ps.vel, V.scale(fr.e2, vt));
park(at, v, V.add(V.scale(fr.e2, 1), V.scale(fr.e1, -0.25)), 0.08);
G.viewMode = 'cockpit';
await wait(1500); await shot('ring-inside-cockpit');
out.rocksInRing = G.rocksDrawn;
out.fpsInRing = await fps(3000);
G.viewMode = 'orbit';
await wait(1200); await shot('ring-inside-exterior');
out.fpsInRingExterior = await fps(3000);

// 3. A belt field, from 25 km out.
const field = G.sys.belts.find(b => b.fields.length).fields[0];
const c = R.fieldCenter(field, G.sys, G.t);
const from = V.add(c.pos, V.add(V.scale(V.norm(c.pos), field.radius * 0.6), V.scale(V.norm(c.vel), -field.radius * 0.3)));
park(from, c.vel, V.sub(c.pos, from), 0.08);
G.viewMode = 'cockpit';
await wait(1500); await shot('field-cockpit');
out.field = field.name + ' r=' + field.radius.toFixed(0) + ' km, ' + field.count + ' rocks';
out.rocksInField = G.rocksDrawn;
out.fpsField = await fps(3000);
G.viewMode = 'orbit'; G.cam.dist = 0.05;
await wait(1200); await shot('field-exterior');

// 4. The chart.
G.paused = false;
return out;
