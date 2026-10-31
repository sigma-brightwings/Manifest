/* probe-founding.js - founding a station from a Crawler, in the real game
 * (2026-10-31). A Crawler with a market load, over a world clear of its
 * ports, with a licence: found her, see her and her crates, lift one with
 * the tug's arms and carry it in, then run the clock to her opening.
 *
 *     node tools/electron-probe.cjs tools/probe-founding.js ".probe-shots\founding"
 */
if (window.Sound && window.Sound.mute) window.Sound.mute(true);
const G = window.Game, Sim = window.Sim, V = window.V, R = window.Render, S = window.Stations, C = window.Combat;
G.title = null;
const out = [];
if (G.ship.docked) { G.ship.docked = null; G.ship.dockOffset = null; }
G.ship.landed = false;
G.dockTarget = null; G.navTarget = null;
/* Her: a Crawler, a market load. */
const H = C.HULLS.crawler;
Object.assign(G.ship, { hullId: 'crawler', dryMass: H.dryMass, cargoCap: H.cargoCap, thrustKN: H.thrustKN,
  fuelCap: H.fuelCap, fuel: H.fuelCap, hullMax: H.hullMax, hullHp: H.hullMax, craftBay: 'standard', shipName: 'Patience' });
G.stationModules = G.stationModules || [];
G.ship.modules = [];
['market', 'warehouse', 'quarters'].forEach((id, i) => {
  const rec = { id: 'probe-sc-' + i, crateId: id, aboard: true, due: 0, placed: 0, paid: 0 };
  G.stationModules.push(rec); G.ship.modules.push({ id: rec.id, crateId: id });
});
Sim.refreshShip(G.ship);
G.licences = G.licences || {};
G.licences[G.here.id] = { fac: window.Licence.issuer(G.sys), forged: false, at: 0 };
/* Over a world, clear of every port. */
const worlds = G.sys.bodies.filter(b => (b.kind === 'planet' || b.kind === 'moon') && b.radius > 800);
let placed = null;
for (const w of worlds) {
  const hs = Sim.bodyState(w, G.sys, G.t);
  for (let k = 0; k < 24 && !placed; k++) {
    const a = k / 24 * Math.PI * 2, dir = { x: Math.cos(a), y: Math.sin(a), z: 0 };
    const pos = V.add(hs.pos, V.scale(dir, w.radius * 1.6));
    if (Sim.dominantBody(pos, G.sys, G.t) !== w) continue;
    if (!G.sys.ports.every(p => p.surface || V.dist(Sim.bodyPosition(p, G.sys, G.t), pos) > 800)) continue;
    const vc = Math.sqrt(w.mu / (w.radius * 1.6));
    G.ship.pos = pos; G.ship.vel = V.add(hs.vel, V.scale({ x: -dir.y, y: dir.x, z: 0 }, vc));
    placed = w;
  }
  if (placed) break;
}
out.push('over ' + (placed ? placed.name : 'NOTHING'));
G.warpIndex = 0; G.panel = 0; G.viewMode = 'cockpit';
G.ship.thrust = V.zero(); G.ship.throttle = 0;
await wait(600);
out.push('refusal ' + S.refusal(G, G.sys, G.t, 'orbital'));
const said = [];
const r = S.found(G, G.sys, G.t, 'orbital', { say: m => { said.push(m); window.Game.say && window.Game.say(m, 8); } });
out.push('found ' + r.ok + ' ' + (r.why || said[0]));
if (!r.ok) return out.join(' | ');
const st = r.st;
out.push('now flying ' + G.ship.hullId + ', opens in ' + r.days.toFixed(2) + ' d');
/* Look at her from her tug, nose to her. */
const cs = () => S.crawlerState(st, G.sys, G.t);
const face = (to) => {
  const f = V.norm(V.sub(to, G.ship.pos));
  const up0 = Math.abs(f.z) < 0.9 ? { x: 0, y: 0, z: 1 } : { x: 0, y: 1, z: 0 };
  const right = V.norm(V.cross(f, up0));
  G.ship.fwd = f; G.ship.right = right; G.ship.up = V.norm(V.cross(right, f));
};
G.ship.pos = V.add(cs().pos, { x: 0.9, y: -0.9, z: 0.35 });
G.ship.vel = V.clone(cs().vel);
face(cs().pos);
await wait(900);
await shot('1-her-and-her-crates');
G.viewMode = 'orbit';
await wait(900);
await shot('2-outside');
G.viewMode = 'cockpit';
/* A crate in the jaws. */
const frame = () => R.bridgeFrame(G.ship);
const crate = S.floatingCrates(st, G.sys, G.t).filter(c => c.crateId === 'quarters')[0];
const holdAt = (pt) => {
  face(pt);
  const gp = R.armGrip(frame());
  G.ship.pos = V.add(G.ship.pos, V.sub(pt, gp));
  G.ship.vel = V.clone(cs().vel);
};
/* She is on an orbit: where the crate is moves with the clock. */
const crateNow = () => S.floatingCrates(st, G.sys, G.t).filter(c => c.idx === crate.idx)[0];
G.ship.pos = V.add(crateNow().pos, { x: 0.03, y: 0.03, z: 0 });
for (let i = 0; i < 6; i++) { holdAt(V.addScaled(crateNow().pos, G.ship.fwd, 0.003)); await wait(80); }
holdAt(V.addScaled(crateNow().pos, G.ship.fwd, 0.003));
const v0 = window.Arms.view(G, frame());
out.push('arm cam: ' + JSON.stringify({ t: v0.target, d: v0.dist, reach: v0.inReach }));
await shot('3-arm-cam-crate');
holdAt(crateNow().pos);
await key('g');
await wait(300);
out.push('held ' + (G.ship.arms && G.ship.arms.held ? G.ship.arms.held.kind + ' ' + G.ship.arms.held.mass + ' t' : 'nothing'));
/* Carry it to her frame. */
const before = S.opensAt(st);
for (let i = 0; i < 20 && G.ship.arms && G.ship.arms.held; i++) {
  const gp = R.armGrip(frame());
  /* Alongside her, not into her: a hundred and fifty metres off her deck. */
  const hpos = Sim.bodyPosition(cs().host, G.sys, G.t);
  const to = V.addScaled(cs().pos, V.norm(V.sub(cs().pos, hpos)), 0.15);
  if (i === 0) face(cs().pos);
  G.ship.pos = V.add(G.ship.pos, V.scale(V.sub(to, gp), 0.25));
  G.ship.vel = V.clone(cs().vel);
  await wait(120);
  if (i === 2) await shot('4-carrying');
}
out.push('installed ' + (st.hand && Object.keys(st.hand).length) + ', opens ' + ((before - S.opensAt(st)) / 3600).toFixed(1) + ' h sooner');
await shot('5-installed');
/* Run the clock to her opening. */
G.t = S.opensAt(st) + 60;
await wait(900);
const port = G.sys.byId[S.portId(st)];
out.push('port ' + (port ? port.name + ' ' + port.market.roleName + ' routes ' +
  G.sys.traffic.filter(q => q.playerPort === port.id).length : 'MISSING'));
G.ship.pos = V.add(Sim.bodyPosition(port, G.sys, G.t), { x: 4, y: -4, z: 1.5 });
G.ship.vel = Sim.bodyState(port, G.sys, G.t).vel;
face(Sim.bodyPosition(port, G.sys, G.t));
await wait(1200);
await shot('6-open');
return out.join(' | ');
