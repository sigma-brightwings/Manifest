/* probe-weather.js - for tools/electron-probe.cjs: the local weather from
 * the cockpit and from the external camera (2026-11-10). Puts the ship down
 * under the worst cloud on worlds of three kinds - a wet one (rain), an icy
 * one (snow) and a molten one (ash) - and shoots both views.
 *
 *     node tools/electron-probe.cjs tools/probe-weather.js "Claude outputs\weather-probe"
 */
const G = window.Game, Sim = window.Sim, V = window.V, W = window.Weather, GL = window.GLWorld;
G.title = null;
G.paused = true;
G.panel = 0;
if (G.tutorial) G.tutorial.ended = true, G.tutorial.hidden = true;

const want = [
  ['rain', b => (b.type === 'terran' || b.type === 'ocean')],
  ['snow', b => (b.type === 'tundra' || b.type === 'iceball')],
  ['ash', b => b.type === 'molten']
];
const found = {};
const stars = G.galaxy.stars.slice().sort((a, b) => window.Galaxy.distance3(a, G.here) - window.Galaxy.distance3(b, G.here));
for (const st of stars.slice(0, 50)) {
  if (want.every(x => found[x[0]])) break;
  if (st.id !== G.here.id) G.enterSystem(st, { fresh: true });
  for (const x of want) {
    if (found[x[0]]) continue;
    const b = G.sys.bodies.find(y => y.kind === 'planet' && y.atmosphere && y.atmosphere.cloud > 0.25 && x[1](y));
    if (b) found[x[0]] = { body: b, star: st };
  }
}

const out = [];
for (const [name] of want) {
  const f = found[name];
  if (!f) { out.push(name + ': none found'); continue; }
  G.enterSystem(f.star, { fresh: true });
  const b = G.sys.bodies.find(y => y.id === f.body.id) || f.body;
  const air = b.atmosphere;
  /* Hunt the clock for a moment with real storm overhead, and a spot on
   * the ground that is under it. */
  let best = null;
  const sun = (() => {
    const sp = Sim.bodyPosition(G.sys.root, G.sys, G.t), bp = Sim.bodyPosition(b, G.sys, G.t);
    const d = V.sub(sp, bp); return V.norm(d);
  })();
  for (let k = 0; k < 900; k++) {
    const t = G.t + k * 37;
    /* A point on the day side, so there is light to see the rain by. */
    const ph = (k % 30) / 30 * Math.PI * 2, el = ((k / 30 | 0) % 12) / 12 - 0.5;
    const e1 = V.norm(V.cross(sun, { x: 0, y: 0, z: 1 })), e2 = V.cross(sun, e1);
    const n = V.norm(V.add(V.add(V.scale(sun, 0.55), V.scale(e1, Math.cos(ph) * 0.6)),
                           V.add(V.scale(e2, Math.sin(ph) * 0.6), { x: 0, y: 0, z: el })));
    const oh = W.overhead(b, n, t);
    if (!oh) continue;
    const kind = W.precipKind(b, G.sys, n, t);
    /* Each shot has to SHOW what it is named: a rain frame over ground the
     * snow line has not reached, a snow frame inside it. */
    let fit = 1;
    if (name === 'rain' && kind.snow > 0.2) fit = 0.02;
    if (name === 'snow' && kind.snow < 0.7) fit = 0.02;
    /* NOT ON A FLASH. A strike washes the canopy pale for a sixth of a
     * second, and a paused probe parked on one shows the flash instead of
     * the fall - the lightning gets its own shot below. */
    const sp0 = GL.spinOf(b, t);
    if (sp0 && sp0.salt[0] > 0.5) fit *= 0.05;
    const score = (oh.cloud * 0.6 + oh.storm) * fit;
    if (!best || score > best.score) best = { score, t, n, oh, kind };
  }
  if (!best) { out.push(name + ': ' + b.name + ' has no weather to sample'); continue; }
  G.t = best.t;
  /* Just under the cloud base, flying along: rain slants with airspeed. */
  const bs = Sim.bodyState(b, G.sys, G.t);
  const alt = air.top * W.DECK_LO * 0.45;
  G.ship.docked = null; G.ship.landed = false; G.ship.crashed = false;
  G.ship.pos = V.add(bs.pos, V.scale(best.n, b.radius + alt));
  const fwd = V.norm(V.cross(best.n, V.norm(V.cross({ x: 0, y: 0, z: 1 }, best.n))));
  G.ship.vel = V.add(bs.vel, V.scale(fwd, 0.22));
  const right = V.norm(V.cross(fwd, best.n));
  G.ship.fwd = fwd; G.ship.right = right; G.ship.up = V.norm(V.cross(right, fwd));
  const wx = W.aloft(G.ship, G.sys, G.t);
  out.push(name + ': ' + b.name + ' (' + b.type + ')  cloud ' + best.oh.cloud.toFixed(2) +
           ' storm ' + best.oh.storm.toFixed(2) +
           (wx ? '  fall ' + wx.rain.toFixed(2) + ' snow ' + wx.snow.toFixed(2) +
                 ' ash ' + wx.ash.toFixed(2) + ' gloom ' + wx.gloom.toFixed(2) +
                 ' inCloud ' + wx.inCloud.toFixed(2) : '  (no aloft)'));
  G.panel = 0;
  G.viewMode = 'cockpit';
  await wait(1500);
  await shot('weather-' + name + '-cockpit');
  G.viewMode = 'orbit';
  G.focus = null; G.followShip = true;
  if (G.cam) G.cam.dist = 0.09;
  out.push('  outside: panel ' + G.panel + ' view ' + G.viewMode + ' camdist ' + (G.cam ? G.cam.dist.toFixed(3) : '?') +
           ' aloft ' + (W.aloft(G.ship, G.sys, G.t) ? 'yes' : 'NULL'));
  await wait(1500);
  await shot('weather-' + name + '-outside');
  await wait(600);
}
return out.join('\n') + '\nfps ' + Math.round(G.fps);
