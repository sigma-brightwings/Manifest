/* probe-fixes-1120.js - Astra's 2026-11-20 notes, checked in the game:
 * the lighter canopy glass (a trader 80 m off the nose), the start's
 * "Docked at" line gone once you are out, and the platform marks to the
 * left of their station on the orbit map (Noolm).
 *
 *     node tools/electron-probe.cjs tools/probe-fixes-1120.js "<outdir>"
 */
if (window.Sound && window.Sound.mute) window.Sound.mute(true);
const G = window.Game, Sim = window.Sim, V = window.V, Cb = window.Combat, Ms = window.Milsats;
G.title = null;
if (G.tutorial) { G.tutorial.done = true; G.tutorial.ended = true; }
const out = [];
out.push('message at start: ' + JSON.stringify(G.message));
if (G.ship.docked) { G.ship.docked = null; G.ship.dockOffset = null; }
G.ship.landed = false; G.dockTarget = null;
G.ship.pos = V.addScaled(G.ship.pos, G.ship.up, 120);
G.warpIndex = 0; G.panel = 0; G.viewMode = 'cockpit';
await wait(600);
out.push('message once undocked: ' + JSON.stringify(G.message));
G.paused = true;
const s = G.ship;
const tr = Sim.shipsAll(G.sys, G.t).filter(x => x.route && !x.hostile && x.phase !== 'moored')[0];
if (tr) {
  const spec = Cb.liftTrader(G.sys, tr, G.t), L = spec.live;
  L.pos = V.addScaled(s.pos, s.fwd, 0.08);
  L.vel = V.clone(s.vel); L.fwd = V.clone(s.right); L.up = V.clone(s.up); L.right = V.cross(L.fwd, L.up);
}
await wait(1500);
await shot('1-glass');
/* Noolm's platforms on the map, beside their stations. */
const Gx = window.Galaxy;
const cand = G.galaxy.stars.filter(st => st.factionId).sort((a, b) => Gx.distance3(G.here, a) - Gx.distance3(G.here, b));
for (const st of cand.slice(0, 40)) {
  G.enterSystem(st, { fresh: true });
  await wait(200);
  if (Ms.platformsFor(G.sys, G.here, G.galaxy).length) break;
}
const plats = Ms.platformsFor(G.sys, G.here, G.galaxy);
out.push(G.here.name + ': ' + plats.length + ' platforms; corridors at ' + plats.filter((p, i) => i % 2 === 0).map(p => {
  const c = Ms.corridorsOf(G.sys, G.sys.byId[p.port]);
  return p.portName + ' ' + (c ? (c.second ? 'two' : 'one') : 'none');
}).join(', '));
G.paused = true;
/* Open F2 the way a hand does: setting G.panel directly skips selectPanel,
 * which is what frames the orbit map and takes the camera out of the
 * cockpit, and the shot then shows the cockpit through an empty map. */
for (const type of ['keydown', 'keyup'])
  window.dispatchEvent(new KeyboardEvent(type, { key: 'F2', code: 'F2', bubbles: true }));
await wait(2000);
out.push('panel after F2: ' + G.panel + ', view ' + G.viewMode);
await shot('2-map');
const port = G.sys.byId[plats[0].port];
G.navTarget = { kind: 'body', id: port.id };
G.focus = port;
if (G.cam) G.cam.dist = 30000;
await wait(2000);
await shot('3-map-near');
return out.join('\n');
