/* probe-climate.js - the climate in the picture (2026-11-22). Parks the
 * ship three radii off the day side of the starting system's terran world
 * (Mirven II), looking at it, and shoots it from over the equator and
 * from high over each pole, so the rain belt, the dry belts and the storm
 * tracks can be seen as bands of cloud. Also reports, for the same
 * moment, Weather.overhead at the sub-ship point and the climate there,
 * which the shader computes from the same numbers.
 *
 * Set directly, and said so: the ship's position and attitude, the view.
 *
 *     node tools/electron-probe.cjs tools/probe-climate.js "<outdir>"
 */
const G = window.Game, Sim = window.Sim, V = window.V, W = window.Weather;
G.title = null; G.tutorial = null; G.menu = null; G.paused = true; G.panel = 0;
const out = [];
const b = G.sys.bodies.find(x => x.name === 'Mirven II') || G.sys.bodies.find(x => x.type === 'terran');
const bs = Sim.bodyState(b, G.sys, G.t);
const sun = V.norm(V.sub(Sim.bodyPosition(G.sys.root, G.sys, G.t), bs.pos));
const k = W.spinAxis(b);
out.push(b.name + ' ' + b.type + ' cloud ' + b.atmosphere.cloud + ' norm ' + W.climateNorm(b).toFixed(3) +
         ' subsolar ' + (W.subsolarLat(b, G.sys, G.t) * 180 / Math.PI).toFixed(1) + ' deg');
async function look(tag, dir) {
  const n = V.norm(dir);
  G.ship.docked = null; G.ship.landed = false; G.ship.crashed = false;
  G.ship.pos = V.add(bs.pos, V.scale(n, b.radius * 3.2));
  G.ship.vel = bs.vel;
  const fwd = V.scale(n, -1);
  const right = V.norm(V.cross(fwd, Math.abs(fwd.z) < 0.9 ? { x: 0, y: 0, z: 1 } : { x: 1, y: 0, z: 0 }));
  G.ship.fwd = fwd; G.ship.right = right; G.ship.up = V.norm(V.cross(right, fwd));
  G.viewMode = 'cockpit';
  await wait(1200);
  const c = W.climateAt(b, G.sys, n, G.t), oh = W.overhead(b, n, G.t, G.sys);
  out.push(tag + ': wet ' + c.wet.toFixed(2) + ' stormy ' + c.stormy.toFixed(2) +
           (oh ? '  overhead cloud ' + oh.cloud.toFixed(2) + ' storm ' + oh.storm.toFixed(2) : ''));
  await shot(tag);
}
/* Over the equator on the day side, then over each pole tipped sunward. */
const eq = V.norm(V.sub(sun, V.scale(k, V.dot(sun, k))));
await look('climate-equator', eq);
await look('climate-north', V.add(V.scale(k, 0.8), V.scale(eq, 0.6)));
await look('climate-south', V.add(V.scale(k, -0.8), V.scale(eq, 0.6)));
/* And low sun (2026-11-22): seventy degrees round from noon, where the
 * lit tops, the shaded flanks and the shadows on the ground show. */
const east = V.norm(V.cross(k, eq));
await look('climate-lowsun', V.add(V.scale(eq, 0.34), V.scale(east, 0.94)));
return out.join('\n') + '\nfps ' + Math.round(G.fps);
