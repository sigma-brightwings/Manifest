/* probe-milsats.js - for tools/electron-probe.cjs: armed defence platforms
 * (milsats.js, 2026-11-20). Finds the nearest system with platforms if this
 * one has none (reports which), parks 90 m off DP-1 looking at it, makes the
 * owner want you so it fires, puts a breach in it, and shows the orbit map
 * round the guarded port with the platform marks.
 *
 *     node tools/electron-probe.cjs tools/probe-milsats.js "<outdir>"
 */
if (window.Sound && window.Sound.mute) window.Sound.mute(true);
const G = window.Game, Sim = window.Sim, V = window.V, Ms = window.Milsats, Cb = window.Combat;
G.title = null;
if (G.tutorial) { G.tutorial.done = true; G.tutorial.ended = true; }
const out = [];
let plats = Ms.platformsFor(G.sys, G.here, G.galaxy);
out.push(G.here.name + ': ' + plats.length + ' platforms');
if (!plats.length) {
  /* The nearest claimed star that has them. */
  const Gx = window.Galaxy;
  const cand = G.galaxy.stars.filter(s => s.factionId && s !== G.here)
    .sort((a, b) => Gx.distance3(G.here, a) - Gx.distance3(G.here, b));
  for (const st of cand.slice(0, 40)) {
    G.enterSystem(st, { fresh: true });
    await wait(300);
    plats = Ms.platformsFor(G.sys, G.here, G.galaxy);
    if (plats.length) break;
  }
  out.push('went to ' + G.here.name + ': ' + plats.length + ' platforms' + (plats[0] ? ' (' + plats[0].why + ')' : ''));
}
if (!plats.length) return out.join('\n');
const p = plats[0];
if (G.ship.docked) { G.ship.docked = null; G.ship.dockOffset = null; }
G.ship.landed = false; G.dockTarget = null;
G.warpIndex = 0; G.panel = 0; G.viewMode = 'cockpit';
G.paused = true;
const place = () => {
  const fr = Ms.frameOf(G.sys, p, G.t);
  const P = fr.pos;
  G.ship.pos = V.add(V.addScaled(P, fr.right, 0.12), V.addScaled({ x: 0, y: 0, z: 0 }, fr.up, 0.1));
  G.ship.pos = V.addScaled(G.ship.pos, fr.fwd, -0.08);
  G.ship.vel = Sim.bodyState(G.sys.byId[p.port], G.sys, G.t).vel;
  const f = V.norm(V.sub(P, G.ship.pos));
  G.ship.fwd = f; G.ship.right = V.norm(V.cross(f, fr.up)); G.ship.up = V.cross(G.ship.right, f);
};
place();
await wait(1500);
await shot('1-platform');
out.push('platform ' + p.name + ', owner ' + p.owner + ', dark ' + Ms.isDark(G, p, G.t));
/* It fires on a wanted pilot. */
G.wanted = G.wanted || {};
G.wanted[p.owner] = Cb.WANTED_HUNT + 100;
G.paused = false;
for (let i = 0; i < 12; i++) { place(); await wait(120); }
G.paused = true;
out.push('hull after its fire ' + Math.round(G.ship.hullHp) + ', beams ' + (G.beams || []).length);
await shot('2-firing');
/* A breach in it, from your guns' side. */
const h = { plat: p, dist: 0.05, point: Ms.posOf(G.sys, p, G.t) };
for (let i = 0; i < 6; i++) Ms.struck(G.sys, G, G.t, h, 15, null);
out.push('scars ' + (p.scars || []).map(s => s.kind || 'hot').join(','));
place();
await wait(1200);
await shot('3-scarred');
/* The map round the guarded port. */
G.panel = 1;
const port = G.sys.byId[p.port];
G.navTarget = { kind: 'body', id: port.id };
G.focus = port;
if (G.cam) G.cam.dist = 400;
await wait(2000);
await shot('4-map');
G.panel = 0;
G.wanted[p.owner] = 0;
return out.join('\n');
