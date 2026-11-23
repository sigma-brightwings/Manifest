/* probe-overcast.js - how dark it is under the weather (2026-11-22).
 * Four scenes from the seat, 3 km up over Mirven II, looking level: clear
 * sky by day, under an ordinary deck by day, under a storm by day, under
 * a deck at night. Logs Weather.aloft's gloom/day/storm for each and the
 * mean colour of a patch of sky above the horizon, read from the shot.
 *
 * Set directly, and said so: the ship's position, attitude and velocity
 * (paused), the view.
 *
 *     node tools/electron-probe.cjs tools/probe-overcast.js "<outdir>"
 */
const G = window.Game, Sim = window.Sim, V = window.V, W = window.Weather;
G.title = null; G.tutorial = null; G.menu = null; G.paused = true; G.panel = 0;
const out = [];
const b = G.sys.bodies.find(x => x.name === 'Mirven II');
function bp() { return Sim.bodyPosition(b, G.sys, G.t); }
const sunD = V.norm(V.sub(Sim.bodyPosition(G.sys.root, G.sys, G.t), bp()));
function place(n, alt) { return V.add(bp(), V.scale(n, b.radius + alt)); }
const pick = { clear: null, deck: null, storm: null, night: null };
const score = { clear: -1, deck: -1, storm: -1, night: -1 };
const N = 5000, ga = Math.PI * (3 - Math.sqrt(5));
for (let i = 0; i < N; i++) {
  const z = 1 - 2 * (i + 0.5) / N, r = Math.sqrt(1 - z * z), th = ga * i;
  const n = { x: r * Math.cos(th), y: r * Math.sin(th), z: z };
  const a = W.aloft({ pos: place(n, 3) }, G.sys, G.t);
  if (!a || a.density > 0.02) continue;
  const sd = V.dot(n, sunD);
  if (sd > 0.6) {
    if (a.cloud < 0.02 && sd > score.clear) { score.clear = sd; pick.clear = n; }
    if (a.storm < 0.05 && a.cloud > 0.9 && a.gloom > score.deck) { score.deck = a.gloom; pick.deck = n; }
    if (a.storm > score.storm) { score.storm = a.storm; pick.storm = n; }
  }
  if (sd < -0.5 && a.cloud > 0.9 && a.storm < 0.05 && a.cloud > score.night) { score.night = a.cloud; pick.night = n; }
}
async function stand(tag, n) {
  const pos = place(n, 3);
  G.ship.docked = null; G.ship.landed = false; G.ship.crashed = false;
  G.ship.pos = pos; G.ship.vel = Sim.surfaceVelocity ? Sim.surfaceVelocity(b, pos, G.sys, G.t) : Sim.bodyState(b, G.sys, G.t).vel;
  const east = V.norm(V.cross(W.spinAxis(b), n));
  G.ship.fwd = east; G.ship.up = n; G.ship.right = V.norm(V.cross(east, n));
  G.viewMode = 'cockpit';
  await wait(1500);
  const a = W.aloft(G.ship, G.sys, G.t);
  out.push(tag + ': cloud ' + a.cloud.toFixed(2) + ' storm ' + a.storm.toFixed(2) + ' gloom ' + a.gloom.toFixed(2) +
           ' day ' + a.day.toFixed(2));
  await shot(tag);
}
for (const k of ['clear', 'deck', 'storm', 'night']) if (pick[k]) await stand('overcast-' + k, pick[k]);
/* And climbing out over the clear place: the sky should thin to space,
 * not snap off. Pitched up 20 degrees so the shot is mostly sky. */
async function climb(alt) {
  const n = pick.clear, pos = place(n, alt);
  G.ship.pos = pos; G.ship.vel = Sim.surfaceVelocity ? Sim.surfaceVelocity(b, pos, G.sys, G.t) : G.ship.vel;
  const east = V.norm(V.cross(W.spinAxis(b), n));
  const fwd = V.norm(V.add(east, V.scale(n, 0.36)));
  G.ship.fwd = fwd; G.ship.right = V.norm(V.cross(fwd, n)); G.ship.up = V.norm(V.cross(G.ship.right, fwd));
  await wait(1200);
  const rho = Sim.airDensity(b, alt);
  out.push('climb ' + alt + ' km: thin ' + Math.sqrt(rho / b.atmosphere.rho0).toFixed(3));
  await shot('climb-' + alt);
}
if (pick.clear) for (const a of [12, 30, 50, 80]) await climb(a);
return out.join('\n');
