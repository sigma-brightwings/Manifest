/* probe-cockpits-all.js - every hull's cockpit, in orbit over Mirven II
 * with the planet in the canopy (2026-11-21, for Astra).
 *
 *     node tools/electron-probe.cjs tools/probe-cockpits-all.js "<outdir>"
 */
if (window.Sound && window.Sound.mute) window.Sound.mute(true);
const G = window.Game, Combat = window.Combat, Sim = window.Sim, V = window.V;
G.title = null;
if (G.tutorial) { G.tutorial.done = true; G.tutorial.ended = true; }
G.panel = 0;
const s = G.ship;
s.docked = null; s.dockOffset = null; s.landed = false; G.dockTarget = null;
const world = G.sys.bodies.find(b => b.name === 'Mirven II') || G.sys.bodies.find(b => b.kind === 'planet');
const ws = Sim.bodyState(world, G.sys, G.t);
const sun = Sim.bodyPosition(G.sys.root, G.sys, G.t);
/* On the day side, a little off the sun line, two radii up, nose on the world. */
const toSun = V.norm(V.sub(sun, ws.pos));
const side = V.norm(V.cross(toSun, { x: 0, y: 0, z: 1 }));
const dir = V.norm(V.add(toSun, V.scale(side, 0.7)));
function park() {
  s.pos = V.addScaled(ws.pos, dir, world.radius * 2.2);
  s.vel = V.clone(ws.vel);
  s.fwd = V.norm(V.sub(ws.pos, s.pos));
  s.right = V.norm(V.cross(s.fwd, { x: 0, y: 0, z: 1 })); s.up = V.cross(s.right, s.fwd);
}
G.paused = true;
const ids = Object.keys(Combat.HULLS).filter(id => !Combat.HULLS[id].hidden);
const out = [];
for (const id of ids) {
  const h = Combat.HULLS[id];
  s.hullId = id;
  ['dryMass', 'thrustKN', 'thrusterCap', 'fuelCap', 'cargoCap', 'hullMax'].forEach(k => { if (h[k] !== undefined) s[k] = h[k]; });
  s.hullHp = h.hullMax;
  s._cockpit = null;
  s.bornId = 'probe-' + id;
  try { Combat.syncLegacy(s); if (Sim.refreshShip) Sim.refreshShip(s); } catch (e) { out.push(id + ' (setup threw: ' + e.message + ')'); continue; }
  park();
  G.viewMode = 'cockpit';
  await wait(1300);
  await shot(String(ids.indexOf(id) + 1).padStart(2, '0') + '-' + id);
  out.push(id + ' "' + (h.name || h.label || id) + '"' + (h.size ? ' ' + h.size : ''));
}
return out.join(' | ');
