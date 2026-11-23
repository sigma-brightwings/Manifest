/* probe-scars.js - for tools/electron-probe.cjs: what weapon fire leaves on
 * a hull (scars.js, 2026-11-20). Your own ship from outside with hot spots,
 * an arcing breach and a venting one; a trader alongside, worked over; and
 * a station's plating after a burst of real beam-path hits (portOnRay with
 * the renderer's exact test).
 *
 *     node tools/electron-probe.cjs tools/probe-scars.js "<outdir>"
 */
if (window.Sound && window.Sound.mute) window.Sound.mute(true);
const G = window.Game, Sim = window.Sim, V = window.V, Sc = window.Scars, Cb = window.Combat;
G.title = null;
if (G.tutorial) { G.tutorial.done = true; G.tutorial.ended = true; }
const out = [];
if (G.ship.docked) { G.ship.docked = null; G.ship.dockOffset = null; }
G.ship.landed = false;
G.ship.pos = V.addScaled(G.ship.pos, G.ship.up, 120);
G.dockTarget = null; G.navTarget = null;
G.warpIndex = 0; G.panel = 0;
G.ship.thrust = V.zero(); G.ship.throttle = 0;
G.paused = true;
/* Find keys that give one of each breach, so the shot shows both. */
function breach(target, dir, want, tag) {
  for (let k = 0; k < 40; k++) {
    const probe = {};
    for (let i = 0; i < 4; i++) Sc.add(probe, G.ship, dir, 0.06, G.t, tag + k);
    if (probe.scars[0].kind === want) {
      for (let i = 0; i < 4; i++) Sc.add(target, G.ship, dir, 0.06, G.t - 5, tag + k);
      return true;
    }
  }
  return false;
}
const s = G.ship;
s.hullHp = (s.hullMax || 100) * 0.5;
s.scars = [];
const side = (a, b, c) => V.norm(V.add(V.add(V.scale(s.right, a), V.scale(s.up, b)), V.scale(s.fwd, c)));
breach(s, side(1, 0.3, 0.1), 'arc', 'me-a');
breach(s, side(-0.2, 1, -0.3), 'vent', 'me-v');
Sc.add(s, s, side(0.6, 0.5, 0.6), 0.16, G.t, 'me-h1');       // white-hot
Sc.add(s, s, side(0.8, -0.2, -0.6), 0.05, G.t - 20, 'me-h2'); // orange, cooling
Sc.add(s, s, side(0.2, 0.9, 0.5), 0.04, G.t - 60, 'me-h3');   // dull red
/* Both breaches where the camera will see them, whatever the hash gave. */
if (s.scars[0]) { s.scars[0].kind = 'arc'; }
if (s.scars[1]) { s.scars[1].kind = 'vent'; s.scars[1].n = { x: 0.3, y: 0.95, z: 0.1 }; s.scars[1]._pk = null; }
out.push('my scars: ' + s.scars.map(x => (x.kind || 'hot') + ' ' + Sc.heatAt(x, G.t).toFixed(2)).join(', '));
G.viewMode = 'orbit';
G.followShip = true; G.focus = null;
G.cam.dist = 0.06; G.cam.pitch = 0.35;
await wait(1500);
await shot('1-own-ship');
if (typeof G.cam.yaw === 'number') G.cam.yaw += 2.2;
await wait(700);
await shot('1b-own-ship-other-side');

/* A trader alongside. */
const tr = Sim.shipsAll(G.sys, G.t).filter(x => x.route && !x.hostile && x.phase !== 'moored')[0];
if (tr) {
  const spec = Cb.liftTrader(G.sys, tr, G.t);
  const L = spec.live;
  L.pos = V.addScaled(s.pos, s.fwd, 0.08);
  L.vel = V.clone(s.vel); L.fwd = V.clone(s.right); L.up = V.clone(s.up); L.right = V.cross(L.fwd, L.up);
  spec.hullMax = spec.hullMax || 50; spec.hullHp = spec.hullMax * 0.4;
  const toMe = V.norm(V.sub(s.pos, L.pos));
  for (let i = 0; i < 5; i++) Cb.markImpact(spec, V.addScaled(L.pos, toMe, 1), { shield: 0, hull: spec.hullMax * 0.05 }, G.t);
  for (let i = 0; i < 3; i++) Cb.markImpact(spec, V.addScaled(L.pos, V.norm(V.add(toMe, L.up)), 1), { shield: 0, hull: spec.hullMax * 0.06 }, G.t - 3);
  out.push(spec.name + ': ' + spec.scars.map(x => (x.kind || 'hot') + ' ' + Sc.heatAt(x, G.t).toFixed(2)).join(', '));
  G.viewMode = 'cockpit';
  await wait(1500);
  await shot('2-trader');
}

/* A station: fly to 4 km off its nearest orbital port, nose on, and land
 * real hits down the beam's own line. */
const port = G.sys.ports.filter(p => !p.surface).sort((a, b) => V.dist(Sim.bodyPosition(a, G.sys, G.t), s.pos) - V.dist(Sim.bodyPosition(b, G.sys, G.t), s.pos))[0];
if (port) {
  const P = Sim.bodyPosition(port, G.sys, G.t);
  const R = port.radius;
  let hits = 0;
  const said = [];
  for (let k = 0; k < 40 && hits < 3; k++) {
    const away = V.norm({ x: Math.cos(k * 0.7), y: Math.sin(k * 0.7), z: 0.3 });
    s.pos = V.addScaled(P, away, R * 2.2);
    s.vel = Sim.bodyState(port, G.sys, G.t).vel;
    const f = V.norm(V.sub(V.addScaled(P, { x: 0, y: 0, z: 1 }, R * 0.1 * (k % 3)), s.pos));
    s.fwd = f; s.right = V.norm(V.cross(f, { x: 0, y: 0, z: 1 })); s.up = V.cross(s.right, f);
    const h = Cb.portOnRay(G.sys, G, G.t, s.pos, s.fwd, R * 4);
    if (!h || h.port !== port) continue;
    for (let i = 0; i < (hits === 0 ? 8 : 3); i++) Cb.stationStruck(G.sys, G, G.t - (hits === 0 ? 0 : 30), h, 400, { say: m => said.push(m) });
    hits++;
  }
  out.push(port.name + ': ' + (port.scars || []).map(x => (x.kind || 'hot') + ' ' + Sc.heatAt(x, G.t).toFixed(2)).join(', ') + ' | ' + said[0]);
  /* Look at it from where the last shot came. */
  G.viewMode = 'cockpit';
  await wait(1500);
  await shot('3-station');
}
G.paused = false;
return out.join('\n');
