/* probe-digs.js - for tools/electron-probe.cjs: the world's own drilling
 * teams (digs.js, 2026-11-19). Finds a dig going on near the start, puts
 * the clock in the middle of it, surveys the world and shows the dig on the
 * planetary scanner; docks at another port in the system and shows the
 * mission board's dig work; then skips to the day it opens and checks the
 * port is there with its traffic.
 *
 *     node tools/electron-probe.cjs tools/probe-digs.js "<outdir>"
 */
const G = window.Game, Sim = window.Sim, V = window.V, Sv = window.Survey, Dg = window.Digs, Ms = window.Missions;
G.title = null;
G.paused = true;
window.Combat.surveyLevel = function () { return 3; };
const DAY = 86400;
const stars = G.galaxy.stars.slice().sort((a, b) => window.Galaxy.distance3(a, G.here) - window.Galaxy.distance3(b, G.here));
let pick = null;
for (const st of stars.slice(0, 60)) {
  if (st.id !== G.here.id) G.enterSystem(st, { fresh: true });
  const plan = Dg.planFor(G.sys, G.here.id);
  const d = plan.find(x => x.startAt > G.t - 400 * DAY && x.doneAt0 - x.startAt > 60 * DAY && Ms.digDepot(G.sys, x));
  if (d) { pick = { st, d }; break; }
}
if (!pick) return 'no dig found near the start';
const dig = pick.d;
G.t = dig.startAt + 0.4 * (dig.doneAt0 - dig.startAt);
G.enterSystem(pick.st, { fresh: true });
const world = G.sys.bodies.find(x => x.id === dig.body);
const skey = (G.here.id || 'sys') + ':' + world.id;
const out = ['star ' + pick.st.name + ', dig ' + dig.id + ' on ' + world.name + ' (' + world.type + '), ' + Dg.statusLine(G, dig, G.t)];

/* A quick polar survey so the map has ground on it. */
G.navTarget = { kind: 'body', id: world.id };
G.surveys = G.surveys || {};
const fr = Sv.spinFrame(world, 0), n = fr.n, e1 = fr.e1;
const e2 = { x: n.y * e1.z - n.z * e1.y, y: n.z * e1.x - n.x * e1.z, z: n.x * e1.y - n.y * e1.x };
const inc = 88 * Math.PI / 180;
const q = { x: e2.x * Math.cos(inc) + n.x * Math.sin(inc), y: e2.y * Math.cos(inc) + n.y * Math.sin(inc), z: e2.z * Math.cos(inc) + n.z * Math.sin(inc) };
const r = world.radius * 1.3, mu = 6.6743e-20 * world.mass, om = Math.sqrt(mu / (r * r * r));
const P = 2 * Math.PI / om;
G.ship.docked = null; G.ship.landed = false; G.ship.crashed = false;
const t0 = G.t, total = P * 10, dt = P / 200;
for (let t = 0; t <= total; t += dt) {
  const tt = t0 + t;
  const bs = Sim.bodyState(world, G.sys, tt), c = Math.cos(om * t), sn = Math.sin(om * t);
  G.ship.pos = V.add(bs.pos, { x: (e1.x * c + q.x * sn) * r, y: (e1.y * c + q.y * sn) * r, z: (e1.z * c + q.z * sn) * r });
  G.ship.vel = V.add(bs.vel, { x: (-e1.x * sn + q.x * c) * r * om, y: (-e1.y * sn + q.y * c) * r * om, z: (-e1.z * sn + q.z * c) * r * om });
  Sv.step(G, G.sys, tt, t === 0 ? 0 : dt);
}
G.t = t0 + total;
G._surveyNow = skey;
const lo = Math.floor(((dig.lon % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) / (2 * Math.PI) * Sv.LON_BINS);
G.panel = window.Game.modeIndex ? window.Game.modeIndex('scanner') : 11;
G.cursor.active = false;
const cell = Sv.cellOfLatLon(dig.lat, dig.lon);
const flip = !!(world.rotation && world.rotation.period > 0);
const col = flip ? Sv.LON_BINS - 1 - (cell % Sv.LON_BINS) : cell % Sv.LON_BINS;
G.scanUI = { layer: 'res', filter: 0, lines: true, style: 0, sweep: 1, zoom: 0 };
await wait(1800);
await shot('digs-scanner-z1');
G.scanUI = { layer: 'res', filter: 0, lines: true, style: 0, sweep: 1, zoom: 2,
             cx: col + 0.5, cy: Sv.LAT_BINS - 0.5 - Math.floor(cell / Sv.LON_BINS) };
await wait(1800);
await shot('digs-scanner-z4');

/* The board at another port in the system. */
const depot = Ms.digDepot(G.sys, dig);
let board = null, at = null;
for (let w = 0; w < 10 && !board; w++) {
  for (const p of G.sys.ports) {
    if (p === depot || !p.market) continue;
    const offers = Ms.boardAt(p, G.sys, G.galaxy, G.here, G.t + w * 2 * DAY, G).filter(o => o.dig === dig.id);
    if (offers.length) { board = offers; at = p; G.t += w * 2 * DAY; break; }
  }
}
out.push('depot ' + (depot && depot.name) + '; board ' + (at ? at.name + ': ' + board.map(o => o.text + ' (' + o.pay + ' cr)').join(' | ') : 'none'));
if (at) {
  G.ship.docked = at.id;
  G.panel = window.Game.modeIndex ? window.Game.modeIndex('missions') : 6;
  await wait(1800);
  await shot('digs-board');
}

/* Skip to the day it opens. */
G.ship.docked = null;
G.panel = 0;
G.t = Dg.doneAt(G, dig) + 600;
await wait(1500);
const port = G.sys.byId[dig.id];
const routes = (G.sys.traffic || []).filter(rt => rt.from === dig.id || rt.to === dig.id);
out.push('opened: ' + (port ? port.name + ' (' + (port.market && port.market.role) + '), ' + routes.length + ' routes, first ship out day ' +
         Math.round(Math.min.apply(null, routes.map(rt => rt.t0)) / DAY) : 'NO PORT'));
G.navTarget = { kind: 'body', id: dig.id };
await wait(1500);
await shot('digs-opened');
return out.join('\n') + '\nfps ' + Math.round(G.fps);
