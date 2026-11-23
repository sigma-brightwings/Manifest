/* probe-comsats.js - for tools/electron-probe.cjs: your com-sat
 * (comsats.js, 2026-11-20). Puts the ship in a circular orbit round a
 * world with a port, one com-sat aboard, and shows the COMMS page's own
 * channel for it (launch from there); launches it; shows the channel again
 * and reports what the chain reaches and which ports are islands.
 *
 *     node tools/electron-probe.cjs tools/probe-comsats.js "<outdir>"
 */
const G = window.Game, Sim = window.Sim, V = window.V, Cs = window.Comsats;
G.title = null;
G.paused = true;
if (G.tutorial) { G.tutorial.done = true; G.tutorial.ended = true; }
const world = G.sys.ports.map(p => p.parentBody).find(b => b && b.kind === 'planet');
if (!world) return 'no planet with a port here';
const t = G.t;
const bs = Sim.bodyState(world, G.sys, t);
const r = world.radius * 3, mu = 6.6743e-20 * world.mass, vc = Math.sqrt(mu / r);
G.ship.docked = null; G.ship.landed = false; G.ship.crashed = false;
G.ship.pos = V.add(bs.pos, { x: r, y: 0, z: 0 });
G.ship.vel = V.add(bs.vel, { x: 0, y: vc * 0.8, z: vc * 0.6 });
G.ship.comsats = 1;
const out = ['world ' + world.name + ', refusal before: ' + Cs.launchRefusal(G, G.sys, G.t)];
G.panel = window.Game.modeIndex ? window.Game.modeIndex('comms') : 3;
G.commsSel = 0;
await wait(1500);
await shot('comsat-channel-ready');
const ln = Cs.launch(G, G.sys, G.here.id, G.t, G.here.name);
out.push('launch: ' + (ln.text || ln.why));
await wait(1500);
await shot('comsat-channel-launched');
const reach = Cs.reachHere(G, G.galaxy, G.here);
out.push('reach: ' + JSON.stringify(reach));
const isl = G.sys.ports.filter(p => p.market && Cs.isIsland(G, G.sys, G.here.id, p, G.t)).map(p => p.name);
out.push('islands here now: ' + (isl.length ? isl.join(', ') : 'none'));
G.panel = 0;
return out.join('\n') + '\nfps ' + Math.round(G.fps);
