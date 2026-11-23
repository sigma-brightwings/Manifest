/* probe-relays.js - for tools/electron-probe.cjs: relays in space, on the
 * map, and the RELAY MFD panel (2026-11-20). Parks the ship 40 m off a
 * relay looking at it; shows the cockpit with the RELAY page on a
 * dashboard MFD; puts a com-sat at the next star so the panel draws a
 * chain to it, and darkens one uplink on that chain to show the break; and
 * opens the orbit map zoomed on the relays' world.
 *
 *     node tools/electron-probe.cjs tools/probe-relays.js "<outdir>"
 */
const G = window.Game, Sim = window.Sim, V = window.V, Cs = window.Comsats;
G.title = null;
G.paused = true;
if (G.tutorial) { G.tutorial.done = true; G.tutorial.ended = true; }
const out = [];
const rl = Cs.relaysFor(G.sys, G.here.id);
const r0 = rl.find(r => G.sys.byId[r.body].kind === 'planet') || rl[0];
const Q = Cs.relayPos(G.sys, r0, G.t);
const w = G.sys.byId[r0.body];
const C = Sim.bodyPosition(w, G.sys, G.t);
/* Ship 40 m out from the relay, on the side away from the world, nose on. */
const away = V.norm(V.sub(Q, C));
const side = V.norm(V.cross(away, { x: 0, y: 0, z: 1 }));
G.ship.docked = null; G.ship.landed = false; G.ship.crashed = false;
G.ship.pos = V.add(Q, V.add(V.scale(away, 0.03), V.scale(side, 0.025)));
G.ship.vel = Sim.bodyState(w, G.sys, G.t).vel;
const f = V.norm(V.sub(Q, G.ship.pos)), right = V.norm(V.cross(f, { x: 0, y: 0, z: 1 }));
G.ship.fwd = f; G.ship.right = right; G.ship.up = V.norm(V.cross(right, f));
G.panel = 0;
G.dashPages = G.dashPages || {};
G.dashPages.left = 'relay';
await wait(2000);
await shot('relay-model');
out.push('relay ' + r0.id + ' over ' + w.name + '; linked: ' + JSON.stringify((Cs.connectedTo(G, G.sys, G.here.id, G.ship.pos, G.t) || {}).name));
/* A com-sat three or more hops away, so the chain has length. */
const hops = Cs.hopsFrom(G, G.galaxy, G.here);
const farId = Object.keys(hops).find(id => hops[id] >= 3) || Object.keys(hops).find(id => hops[id] >= 1);
G.comsats = [{ id: 'cs-probe', star: farId, starName: G.galaxy.stars.find(s => s.id === farId).name, body: 'b1', bodyName: 'there',
               a: 30000, inc: 0, lan: 0, m0: 0, period: 86400, at: G.t }];
const path = Cs.chainPath(G, G.galaxy, G.here, G.galaxy.stars.find(s => s.id === farId));
out.push('chain: ' + path.map(s => s.name + ':' + Cs.nodeState(G, s)).join(' - '));
await wait(1500);
await shot('relay-chain');
/* A real day when an uplink on the chain is dark, and (to show the third
 * mark) one link marked destroyed-but-expected. The cockpit with the band
 * stowed, so the dashboard MFDs are the instruments. */
const keepT = G.t;
let darkDay = null;
for (let d = 1; d < 1825 && darkDay === null; d++) {
  const tt = keepT + d * 86400;
  if (path.slice(1, -1).some(s => Cs.uplinkDark(G, s.id, tt))) darkDay = tt;
}
if (darkDay !== null) {
  G.t = darkDay;
  G.comsats[0].at = darkDay;
  G.relaysGone = {};
  const goneAt = path.find((s, i) => i > 0 && i < path.length - 1 && !Cs.uplinkDark(G, s.id, darkDay));
  if (goneAt) G.relaysGone[goneAt.id] = true;
  G.viewMode = 'cockpit'; G.cockpitChrome = 1;
  G.dashPages.centre = 'relay';
  await wait(2000);
  await shot('relay-chain-broken');
  out.push('day ' + Math.round(darkDay / 86400) + ': ' + path.map(s => s.name + ':' + Cs.nodeState(G, s)).join(' - '));
  G.relaysGone = {}; G.t = keepT; G.cockpitChrome = 0; G.dashPages.centre = 'orbit';
} else out.push('no dark uplink on the chain in five years');
/* The map, zoomed on the relays' world. */
G.panel = 1;
G.navTarget = { kind: 'body', id: w.id };
if (G.mapCam) { G.mapCam.focus = w.id; G.mapCam.dist = w.radius * 30; }
await wait(2000);
await shot('relay-map');
G.panel = 0;
G.dashPages.left = 'scope';
return out.join('\n') + '\nfps ' + Math.round(G.fps);
