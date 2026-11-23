/* probe-storm.js - down through a storm (2026-11-22). Astra: "if you go
 * down through a storm, that should be obvious in the weather changing and
 * the view going from clear to reduced visibility as the density of the
 * cloud increases". Finds the stormiest daylit place on the starting
 * system's terran world, then shoots the cockpit at a ladder of heights
 * from above the anvil to near the sea, logging what Weather.aloft says at
 * each: the column's density, the visibility, the gloom, the rain, the
 * daylight. Then one shot in cloud on the night side, which must be dark.
 *
 * Set directly, and said so: the ship's position, attitude and velocity
 * (paused, so it holds still), and the view. Nothing else.
 *
 *     node tools/electron-probe.cjs tools/probe-storm.js "<outdir>"
 */
const G = window.Game, Sim = window.Sim, V = window.V, W = window.Weather;
G.title = null; G.tutorial = null; G.menu = null; G.paused = true; G.panel = 0;
const out = [];
const b = G.sys.bodies.find(x => x.name === 'Mirven II') || G.sys.bodies.find(x => x.type === 'terran');
const bs = Sim.bodyState(b, G.sys, G.t);
const air = b.atmosphere;
out.push(b.name + ' radius ' + b.radius.toFixed(0) + ' air.top ' + air.top);
function at(n, alt) { return { pos: V.add(bs.pos, V.scale(n, b.radius + alt)), vel: bs.vel }; }
/* The stormiest place, by day and by night. */
let bestD = null, bestN = null, sD = -1, sN = -1;
const N = 6000, ga = Math.PI * (3 - Math.sqrt(5));
for (let i = 0; i < N; i++) {
  const z = 1 - 2 * (i + 0.5) / N, r = Math.sqrt(1 - z * z), th = ga * i;
  const n = { x: r * Math.cos(th), y: r * Math.sin(th), z: z };
  const a = W.aloft(at(n, 1), G.sys, G.t);
  if (!a) continue;
  const sc = a.storm * a.cloud;
  if (a.day > 0.9 && sc > sD) { sD = sc; bestD = n; }
  if (a.day < 0.02 && sc > sN) { sN = sc; bestN = n; }
}
async function stand(tag, n, alt) {
  const s = at(n, alt);
  G.ship.docked = null; G.ship.landed = false; G.ship.crashed = false;
  G.ship.pos = s.pos; G.ship.vel = s.vel;
  /* Looking level along the ground, tipped ten degrees down. */
  const east = V.norm(V.cross({ x: 0, y: 0, z: 1 }, n));
  const fwd = V.norm(V.add(east, V.scale(n, -0.18)));
  const right = V.norm(V.cross(fwd, n));
  G.ship.fwd = fwd; G.ship.right = right; G.ship.up = V.norm(V.cross(right, fwd));
  G.viewMode = 'cockpit';
  await wait(1500);
  const a = W.aloft(G.ship, G.sys, G.t);
  out.push(tag + ' alt ' + alt.toFixed(1) + ' km: ' + (a ? 'density ' + a.density.toFixed(2) +
           ' vis ' + a.vis.toFixed(2) + ' gloom ' + a.gloom.toFixed(2) + ' rain ' + a.rain.toFixed(2) +
           ' day ' + a.day.toFixed(2) + ' storm ' + a.storm.toFixed(2) + ' low ' + a.low.toFixed(2) +
           ' deck ' + a.deckLo.toFixed(1) + '-' + a.deckHi.toFixed(1) : 'no weather') +
           '  fps ' + Math.round(G.fps));
  await shot(tag);
}
out.push('day storm ' + sD.toFixed(2) + ', night storm ' + sN.toFixed(2));
const ladder = [0.42, 0.33, 0.26, 0.19, 0.12, 0.06, 0.012];
for (let i = 0; i < ladder.length; i++) await stand('storm-' + i, bestD, air.top * ladder[i]);
if (bestN) await stand('storm-night', bestN, air.top * 0.19);
return out.join('\n');
