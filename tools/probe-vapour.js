/* probe-vapour.js - vapour off a hull in a hard pull (2026-11-22).
 *
 * Finds a place on the starting system's terran world under a full deck by
 * day (wet air), puts the ship 3 km up at 250 m/s through the air, level,
 * and flies it: a second with nothing held (she is falling - no lift in
 * this game, so she feels almost nothing), then the vertical and lateral
 * thrusters held together, which is a pull across the airflow. Logs what
 * Weather.vapourOf made of it through G.vapour, shoots the cockpit, then
 * the outside view, then the same pull in dry air for comparison.
 *
 * Set directly, and said so: the ship's position, velocity and attitude,
 * the view, assist off. The pull itself is the real keys (G.keys, as the
 * key handler sets them).
 *
 *     node tools/electron-probe.cjs tools/probe-vapour.js "<outdir>"
 */
const G = window.Game, Sim = window.Sim, V = window.V, W = window.Weather;
G.title = null; G.tutorial = null; G.menu = null; G.panel = 0;
const out = [];
const b = G.sys.bodies.find(x => x.name === 'Mirven II');
const bs = Sim.bodyState(b, G.sys, G.t);
const sunD = V.norm(V.sub(Sim.bodyPosition(G.sys.root, G.sys, G.t), bs.pos));
/* Against where the world is NOW: it moves along its orbit while the
 * earlier legs fly, and a position from the start of the run put the
 * third leg inside the planet. */
function place(n, alt) { return V.add(Sim.bodyPosition(b, G.sys, G.t), V.scale(n, b.radius + alt)); }
/* Wettest and driest daylit places with no storm (a storm's murk hides it). */
let wet = null, dry = null, hw = -1, hd = 2;
const N = 4000, ga = Math.PI * (3 - Math.sqrt(5));
for (let i = 0; i < N; i++) {
  const z = 1 - 2 * (i + 0.5) / N, r = Math.sqrt(1 - z * z), th = ga * i;
  const n = { x: r * Math.cos(th), y: r * Math.sin(th), z: z };
  if (V.dot(n, sunD) < 0.5) continue;
  const p = { pos: place(n, 3) };
  const a = W.aloft(p, G.sys, G.t);
  if (!a || a.storm > 0.05 || a.density > 0.05) continue;
  const h = W.humidity(p, G.sys, G.t);
  if (h > hw) { hw = h; wet = n; }
  if (h < hd) { hd = h; dry = n; }
}
out.push('wet place humidity ' + hw.toFixed(2) + ', dry place ' + hd.toFixed(2));
async function fly(tag, n, view, alt) {
  G.paused = true;
  const pos = place(n, alt || 3);
  /* The outside camera close on the hull - about three of her lengths. */
  if (view === 'orbit' && G.cam) { G.cam.dist = 0.08; G.followShip = true; }
  const k = W.spinAxis(b);
  const east = V.norm(V.cross(k, n));
  const airV = Sim.surfaceVelocity ? Sim.surfaceVelocity(b, pos, G.sys, G.t) : bs.vel;
  G.ship.docked = null; G.ship.landed = false; G.ship.crashed = false;
  G.ship.pos = pos; G.ship.vel = V.addScaled(airV, east, 0.25);
  G.ship.fwd = east; G.ship.up = n; G.ship.right = V.norm(V.cross(east, n));
  G.assist = false; G.vector = false; G.flightMode = 'ship';
  G.viewMode = view;
  G.keys = G.keys || {};
  G.paused = false;
  await wait(900);
  const v0 = G.vapour && G.vapour.player;
  const ac = Sim.atmosphereContext(G.ship.pos, G.sys, G.t);
  out.push(tag + ' state: alt ' + (V.dist(G.ship.pos, Sim.bodyPosition(b, G.sys, G.t)) - b.radius).toFixed(2) +
           ' km, landed ' + !!G.ship.landed + ' crashed ' + !!G.ship.crashed + ' docked ' + !!G.ship.docked +
           ' air ' + (ac ? ac.body.name : 'none'));
  out.push(tag + ' coasting: load ' + (v0 ? v0.load.toFixed(2) : '-') + ' tip ' + (v0 ? v0.tip.toFixed(2) : '-') +
           ' sheet ' + (v0 ? v0.sheet.toFixed(2) : '-'));
  G.keys.r = true; G.keys.d = true;
  await wait(1300);
  const v1 = G.vapour && G.vapour.player;
  const st = G.contrails && G.contrails.by;
  out.push(tag + ' pulling: load ' + (v1 ? v1.load.toFixed(2) : '-') + ' tip ' + (v1 ? v1.tip.toFixed(2) : '-') +
           ' sheet ' + (v1 ? v1.sheet.toFixed(2) : '-') + ' hum ' + (v1 ? v1.hum.toFixed(2) : '-') +
           '  tip trails ' + ((st && st['player:tl']) ? st['player:tl'].pts.length + '+' + st['player:tr'].pts.length + ' pts' : 'none') +
           '  maxAccel ' + (G.ship.maxAccel / Sim.G0).toFixed(1) + ' g  fps ' + Math.round(G.fps));
  await shot(tag);
  G.keys.r = false; G.keys.d = false;
  G.paused = true;
}
await fly('vapour-wet-cockpit', wet, 'cockpit');
await fly('vapour-wet-outside', wet, 'orbit');
/* Dry ground is high inland ground, so higher: 3 km put her in the hill. */
await fly('vapour-dry-outside', dry, 'orbit', 9);
return out.join('\n');
