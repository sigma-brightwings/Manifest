/* probe-pitrock.js - what a ground port's pit is cut through (2026-11-22).
 * Render.groundRock: the walls and the bowl under a port's street section
 * take the world's own top layer (ice on an iceball, red sandstone on a
 * desert, ash and basalt on a molten world...). Walks the nearest systems
 * for ground ports on as many kinds of world as it can find, docks at each,
 * pulls the outside camera back and down so the cut opens, and shoots it.
 *
 * Set directly, and said so: the system, the dock, the view and the boom.
 *
 *     node tools/electron-probe.cjs tools/probe-pitrock.js "<outdir>"
 */
const G = window.Game, Sim = window.Sim, R = window.Render;
G.title = null; G.tutorial = null; G.menu = null; G.paused = true; G.panel = 0;
const out = [];
const stars = G.galaxy.stars.slice().sort((a, b) => window.Galaxy.distance3(a, G.here) - window.Galaxy.distance3(b, G.here));
const want = {}, found = [];
for (const st of stars.slice(0, 80)) {
  if (st.id !== G.here.id) G.enterSystem(st, { fresh: true });
  for (const p of (G.sys.pads || [])) {
    if (!p.surface || p.seaPlatform || !p.parentBody) continue;
    const rk = R.groundRock(p.parentBody, G.sys);
    if (want[rk.name]) continue;
    want[rk.name] = 1;
    found.push({ st, id: p.id, name: p.name, world: p.parentBody.name, type: p.parentBody.type, rock: rk.name });
  }
  if (found.length >= 7) break;
}
out.push('found ' + found.length + ': ' + found.map(f => f.rock).join(', '));
for (const f of found) {
  if (f.st.id !== G.here.id) G.enterSystem(f.st, { fresh: true });
  const p = G.sys.byId[f.id];
  G.ship.landed = false; G.ship.crashed = false; G.ship.docked = null;
  /* The game's own dock (Sim.dockShip): berthed in her bay, posed there. */
  Sim.dockShip(G.ship, p, G.sys, G.t);
  if (G.cam) G.cam.target = { x: G.ship.pos.x, y: G.ship.pos.y, z: G.ship.pos.z };
  G.viewMode = 'orbit';
  G.cutawayStyle = 0;
  if (G.cam) { G.cam.dist = 0.35; G.cam.pitch = -0.55; G.cam.yaw = 0.7; }
  await wait(2200);
  out.push(f.rock.padEnd(30) + ' ' + f.name + ' on ' + f.world + ' (' + f.type + ')  cut ' +
           !!(G.cutaway && G.cutaway.surface) + '  fps ' + Math.round(G.fps));
  await shot('pit-' + f.rock.split(' ')[0]);
}
return out.join('\n');
