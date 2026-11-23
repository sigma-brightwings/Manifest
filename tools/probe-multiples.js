/* probe-multiples.js - stars stage 3 in the running game: a close pair seen
 * from one of its planets, the F2 map of it, and a companion's living moon
 * with its ringed giant overhead.
 *
 *     node tools/electron-probe.cjs tools/probe-multiples.js "<outdir>"
 */
if (window.Sound && window.Sound.mute) window.Sound.mute(true);
const G = window.Game, Sim = window.Sim, V = window.V, Gx = window.Galaxy, A = window.Appeal;
G.title = null;
if (G.tutorial) { G.tutorial.done = true; G.tutorial.ended = true; }
const out = [];
function press(k) { for (const type of ['keydown', 'keyup']) window.dispatchEvent(new KeyboardEvent(type, { key: k, code: k, bubbles: true })); }
function undock() { const s = G.ship; s.docked = null; s.dockOffset = null; s.landed = false; G.dockTarget = null; }
/* Park her beside a body, nose on a target, at rest in the body's frame. */
function parkBy(body, dist, target) {
  const t = G.t, bs = Sim.bodyState(body, G.sys, t), s = G.ship;
  const tp = Sim.bodyPosition(target, G.sys, t);
  /* On the target's side of the body, so the body is behind her and the
   * target is in front, not hidden behind the body. */
  const toward = V.norm(V.sub(tp, bs.pos));
  s.pos = V.addScaled(bs.pos, toward, dist);
  s.vel = V.clone(bs.vel);
  s.fwd = V.norm(V.sub(tp, s.pos));
  const ref = Math.abs(s.fwd.z) < 0.9 ? { x: 0, y: 0, z: 1 } : { x: 0, y: 1, z: 0 };
  s.right = V.norm(V.cross(s.fwd, ref)); s.up = V.cross(s.right, s.fwd);
}
const stars = G.galaxy.stars.filter(st => st.factionId).sort((a, b) => Gx.distance3(G.here, a) - Gx.distance3(G.here, b));
let pairStar = null, warmStar = null;
for (const st of stars.slice(0, 60)) {
  G.enterSystem(st, { fresh: true });
  await wait(50);
  if (!pairStar && G.sys.pairBary) pairStar = st;
  if (!warmStar && G.sys.byId.b0c2 && G.sys.byId.b0cp1) warmStar = st;
  if (pairStar && warmStar) break;
}
out.push('close pair at ' + (pairStar ? pairStar.name : 'none in 60') + ', warm moon at ' + (warmStar ? warmStar.name : 'none in 60'));
G.paused = true; G.warpIndex = 0;
if (pairStar) {
  G.enterSystem(pairStar, { fresh: true });
  await wait(300);
  undock(); G.paused = true;
  const sys = G.sys, bc = sys.pairBary;
  const planets = sys.root.children.filter(b => b.kind === 'planet').sort((a, b) => a.orbit.a - b.orbit.a);
  const p = planets[0];
  out.push(pairStar.name + ': ' + sys.stars.map(s => s.name + ' ' + s.type + ' L ' + s.luminosity.toFixed(3)).join(', ') +
           '; a_bin ' + bc.binary.aBin.toFixed(3) + ' AU; label ' + Sim.starLabel(sys) + '; innermost ' + p.name + ' at ' + (p.orbit.a / 1.496e8).toFixed(3) + ' AU');
  parkBy(p, p.radius * 4, bc);
  G.viewMode = 'cockpit'; G.panel = 0;
  await wait(1500);
  await shot('1-two-suns');
  press('F2');
  await wait(1500);
  await shot('2-pair-map');
  press('F1');
  await wait(300);
}
if (warmStar) {
  G.enterSystem(warmStar, { fresh: true });
  await wait(300);
  undock(); G.paused = true;
  const sys = G.sys, moon = sys.byId.b0c2, giant = sys.byId.b0c1, C = sys.companion;
  const ap = A.of(sys, moon);
  out.push(warmStar.name + ': ' + C.name + ' ' + C.type + ' at ' + (C.orbit.a / 1.496e8).toFixed(0) + ' AU; ' + giant.name +
           (giant.ring ? ' ringed' : '') + '; ' + moon.name + ' ' + moon.type + ' appeal ' + (ap ? ap.score.toFixed(2) + ' ' + ap.tier : '-') +
           '; ports ' + sys.ports.filter(p => /^b0cp/.test(p.id)).map(p => p.name).join(', ') +
           '; ferries with people ' + sys.traffic.filter(r => /^ps\|b0cp/.test(r.id) && r.souls).length);
  parkBy(moon, moon.radius * 1.5, giant);
  G.viewMode = 'cockpit'; G.panel = 0;
  await wait(1500);
  await shot('3-giant-overhead');
  G.lock = moon; G.focus = moon; G.navTarget = { kind: 'body', id: moon.id }; G.lockTab = 'world';
  press('F3');
  await wait(1200);
  await shot('4-moon-card');
  press('F1');
}
return out.join('\n');
