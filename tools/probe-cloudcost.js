/* probe-cloudcost.js - what the lit clouds cost (2026-11-22). Parks the
 * ship 1.25 radii from the starting terran world's day side, looking
 * straight down, so the cloudy disc fills the glass, and averages the
 * frame rate over five seconds. Run it on the shader as built and on the
 * shader with the two added lookups taken out, and compare.
 *
 * Set directly, and said so: the ship's position, attitude, the view.
 *
 *     node tools/electron-probe.cjs tools/probe-cloudcost.js "<outdir>"
 */
const G = window.Game, Sim = window.Sim, V = window.V;
G.title = null; G.tutorial = null; G.menu = null; G.paused = true; G.panel = 0;
const b = G.sys.bodies.find(x => x.name === 'Mirven II');
const bs = Sim.bodyState(b, G.sys, G.t);
const n = V.norm(V.sub(Sim.bodyPosition(G.sys.root, G.sys, G.t), bs.pos));
G.ship.docked = null; G.ship.landed = false; G.ship.crashed = false;
G.ship.pos = V.add(bs.pos, V.scale(n, b.radius * 1.25)); G.ship.vel = bs.vel;
const fwd = V.scale(n, -1);
const right = V.norm(V.cross(fwd, { x: 0, y: 0, z: 1 }));
G.ship.fwd = fwd; G.ship.right = right; G.ship.up = V.norm(V.cross(right, fwd));
G.viewMode = 'cockpit';
await wait(2000);
let frames = 0;
const t0 = performance.now();
await new Promise(res => { function f() { frames++; if (performance.now() - t0 < 5000) requestAnimationFrame(f); else res(); } requestAnimationFrame(f); });
const ms = (performance.now() - t0) / frames;
await shot('cloudcost');
return 'frames ' + frames + '  ' + ms.toFixed(1) + ' ms/frame  (' + (1000 / ms).toFixed(1) + ' fps)';
