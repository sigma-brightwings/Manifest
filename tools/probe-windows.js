/* probe-windows.js — see-through windows on other ships (2026-10-31). A
 * trader in flight; a suit hung a few metres off her cockpit, looking in;
 * then off your own. Muted.
 *
 *     node tools/electron-probe.cjs tools/probe-windows.js ".probe-shots\windows"
 */
if (window.Sound && window.Sound.mute) window.Sound.mute(true);
const G = window.Game, Sim = window.Sim, V = window.V, R = window.Render;
G.title = null;
const notes = [];
window.addEventListener('keydown', e => { if (e.isTrusted) { e.stopImmediatePropagation(); e.preventDefault(); } }, true);
let st = null;
const stars = G.galaxy.stars.slice().sort((a, b) => window.Galaxy.distance3(a, G.here) - window.Galaxy.distance3(b, G.here));
for (const s of stars.slice(0, 30)) {
  if (s.id !== G.here.id) G.enterSystem(s, { fresh: true });
  const list = Sim.shipsAll(G.sys, G.t).filter(x => x.route && !x.hostile && x.phase !== 'moored' && /freighter|trade|shuttle|hauler/.test(x.cls || ''));
  if (list.length) { st = list[0]; break; }
}
if (!st) return 'FAIL: no trader';
if (G.ship.docked) { G.ship.docked = null; G.ship.dockOffset = null; }
G.ship.landed = false;
const spec = window.Combat.liftTrader(G.sys, st, G.t);
window.Combat.disableNpc(G.sys, G, spec, 'drive', G.t, null);
const L = spec.live;
G.ship.pos = V.addScaled(L.pos, L.right, 0.15); G.ship.vel = V.clone(L.vel);
G.ship.fwd = V.clone(L.fwd); G.ship.up = V.clone(L.up); G.ship.right = V.clone(L.right);
G.warpIndex = 0; G.panel = 0; G.viewMode = 'cockpit';
await wait(600);
/* A stand-in for her, as drawTraffic builds one, to find her cockpit. */
const hulls = window.Combat.HULLS, hid = Object.keys(hulls).find(k => hulls[k].mesh === (spec.cls));
const look = (eye, at) => {
  G.eva = window.Eva.start({ pos: eye, vel: V.clone(L.vel), fwd: V.norm(V.sub(at, eye)), up: L.up });
  G.eva.line = false;
};
const Lkm = spec.size || 0.05;
const ck = (ship) => R.bridgeFrame(ship).pos;
/* Each view taken off where she is NOW, in her own frame: the suit is
 * given her velocity, so it stays where it was put relative to her. */
const herView = (f, u, r, lookUp) => {
  const S = spec.live, vis = { hullId: hid, bornId: 'probe|' + spec.id, cargo: {}, lengthKm: spec.size, pos: S.pos, fwd: S.fwd, up: S.up, right: S.right };
  const c = ck(vis), at = V.addScaled(c, S.up, lookUp * 0.001);
  look(V.add(c, V.add(V.add(V.scale(S.fwd, f * 0.001), V.scale(S.up, u * 0.001)), V.scale(S.right, r * 0.001))), at);
};
notes.push('her: ' + spec.name + ' (' + spec.cls + ' → ' + hid + '), ' + (Lkm * 1000).toFixed(0) + ' m');
herView(9, 1.2, 0, 1.0); await wait(500); await shot('1-her-canopy-front');
herView(4, 1.5, 6, 1.0); await wait(500); await shot('2-her-canopy-side');
herView(60, 10, 20, 0); await wait(500); await shot('3-her-from-60m');
const myView = (f, u, r, lookUp) => {
  const S = G.ship, c = ck(S), at = V.addScaled(c, S.up, lookUp * 0.001);
  G.eva = window.Eva.start({ pos: V.add(c, V.add(V.add(V.scale(S.fwd, f * 0.001), V.scale(S.up, u * 0.001)), V.scale(S.right, r * 0.001))),
                             vel: V.clone(S.vel), fwd: V.norm(V.sub(at, V.add(c, V.add(V.add(V.scale(S.fwd, f * 0.001), V.scale(S.up, u * 0.001)), V.scale(S.right, r * 0.001))))), up: S.up });
};
myView(6, 1.2, 0, 1.0); await wait(500); await shot('4-own-canopy-front');
myView(2, 1.4, 4, 1.0); await wait(500); await shot('5-own-canopy-side');
{
  const S = spec.live, vis = { hullId: hid, bornId: 'probe|' + spec.id, cargo: {}, lengthKm: spec.size, pos: S.pos, fwd: S.fwd, up: S.up, right: S.right };
  const c = ck(vis), d = V.sub(c, S.pos);
  notes.push('her cockpit from centre: fwd ' + (V.dot(d, S.fwd) * 1000).toFixed(1) + ' up ' + (V.dot(d, S.up) * 1000).toFixed(1) + ' m; L ' + (R.hullLength(vis) * 1000).toFixed(1) + ' m');
  const m = G.ship, dm = V.sub(ck(m), m.pos);
  notes.push('mine: fwd ' + (V.dot(dm, m.fwd) * 1000).toFixed(1) + ' up ' + (V.dot(dm, m.up) * 1000).toFixed(1) + ' m; L ' + (R.hullLength(m) * 1000).toFixed(1) + ' m');
}
G.eva = null;
return notes.join('\n') + '\nfps ' + Math.round(G.fps);
