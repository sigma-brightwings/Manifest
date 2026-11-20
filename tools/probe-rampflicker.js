/* probe-rampflicker.js - Astra (2026-11-18): "the ramp into the station has
 * flickering textures when looking down it from inside the ship". Aboard,
 * berthed, at the head of the ramp, looking down it from four headings;
 * two frames each, so a fight between coincident surfaces shows as a
 * difference between frames. Pass PROBE_TAG to name the run. */
const G = window.Game, Sim = window.Sim;
G.title = null;
const tag = window.PROBE_TAG || 'a';
const port = G.sys.bodies.find(b => b.market && !b.surface && !b.underground);
Sim.dockShip(G.ship, port, G.sys, G.t);
G.panel = 0; G.viewMode = 'cockpit';
await wait(1500);
await key('o'); await wait(1500);
if (!G.walk) return 'no walk';
const ramp = G.walk.plan.items.find(i => i.kind === 'ramp');
if (!ramp) return 'no ramp item';
const out = ['ramp item at ' + ramp.x.toFixed(2) + ',' + ramp.z.toFixed(2) + ' yaw ' + (ramp.yaw || 0)];
G.walk.x = ramp.x; G.walk.z = ramp.z + 0.6;
for (const [i, yaw] of [[0, Math.PI], [1, Math.PI + 0.5]]) {
  G.walk.yaw = yaw; G.walk.pitch = -0.55;
  await wait(1200);
  await shot('ramp-' + tag + '-' + i + 'a');
  await wait(120);
  await shot('ramp-' + tag + '-' + i + 'b');
}
out.push('walk ' + G.walk.x.toFixed(2) + ',' + G.walk.z.toFixed(2) + ' ship=' + !!G.walk.ship);
return out.join('\n');
