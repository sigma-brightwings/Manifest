/* probe-arms.js - a tug's grab arms and their camera, in the real game
 * (2026-10-31). In a Bollard, out of the dock: a canister ahead of the
 * jaws, the arm camera on it, G, and the jaws shut and swinging it in.
 *
 *     node tools/electron-probe.cjs tools/probe-arms.js ".probe-shots\arms"
 */
if (window.Sound && window.Sound.mute) window.Sound.mute(true);
const G = window.Game, Sim = window.Sim, V = window.V, R = window.Render;
G.title = null;
const out = [];
if (G.ship.docked) { G.ship.docked = null; G.ship.dockOffset = null; }
G.ship.landed = false;
/* Well clear of the port, or it takes her back into the berth. */
G.ship.pos = V.addScaled(G.ship.pos, G.ship.up, 80);
G.dockTarget = null; G.navTarget = null;
G.ship.hullId = 'bollard';
const H = window.Combat.HULLS.bollard;
G.ship.dryMass = H.dryMass; G.ship.cargoCap = H.cargoCap; G.ship.thrustKN = H.thrustKN;
Sim.refreshShip(G.ship);
G.warpIndex = 0; G.panel = 0; G.viewMode = 'cockpit';
G.ship.thrust = V.zero(); G.ship.throttle = 0;
await wait(800);
const frame = () => R.bridgeFrame(G.ship);
const g = R.armGrip(frame());
out.push('grip ' + (g ? (V.dot(V.sub(g, frame().pos), G.ship.fwd) * 1000).toFixed(1) + ' m ahead' : 'none'));
G.sys.canisters = G.sys.canisters || [];
const can = { kind: 'canister', id: 'probe-can', name: 'Cargo canister', cid: 'grain', tonnes: 4,
              pos: V.addScaled(g, G.ship.fwd, 0.005), vel: V.clone(G.ship.vel), born: G.t, expires: G.t + 1e6, radius: 0.004,
              armed: false };   // her old fit has a scoop: keep it off, so only the arms take it
G.sys.canisters.push(can);
/* Hold it there against the drift while we look. */
const pin = () => { if (!can._inJaws) { const gg = R.armGrip(frame()); can.pos = V.addScaled(gg, G.ship.fwd, 0.005); can.vel = V.clone(G.ship.vel); } };
for (let i = 0; i < 10; i++) { pin(); await wait(60); }
await shot('1-arm-cam-canister-ahead');
const gNow = R.armGrip(frame());
out.push('can in list ' + (G.sys.canisters.indexOf(can) >= 0) + ', ' + (V.dist(can.pos, gNow) * 1000).toFixed(1) + ' m from the jaws, rel ' +
         (V.dist(can.vel, G.ship.vel) * 1000).toFixed(2) + ' m/s, scoop ' + window.Combat.hasScoop(G.ship));
const v = window.Arms.view(G, frame());
out.push('view ' + JSON.stringify({ t: v.target, d: v.dist, r: v.rel, reach: v.inReach }));
pin();
await key('g');
await wait(200);
if (!(G.ship.arms && G.ship.arms.held)) {
  /* The key did not take: ask the arms directly, and say why. */
  const said = [];
  const r = window.Arms.toggle(G, frame(), { say: m => said.push(m) });
  out.push('KEY DID NOT TAKE; direct: ' + JSON.stringify(r) + ' ' + said.join(' / ') +
           ' | docked ' + G.ship.docked + ' landed ' + G.ship.landed + ' arms ' + JSON.stringify(G.ship.arms && { want: G.ship.arms.want }));
}
await wait(500);
await shot('2-jaws-shut');
out.push('held ' + (G.ship.arms && G.ship.arms.held ? G.ship.arms.held.kind : 'nothing') + ', jaw ' + (G.ship.arms ? G.ship.arms.jaw.toFixed(2) : '-'));
G.viewMode = 'orbit';
await wait(900);
await shot('3-outside');
G.viewMode = 'cockpit';
const t0 = G.t;
while (G.t - t0 < window.Arms.STOW_S + 1) await wait(200);
await wait(300);
out.push('after the swing: grain ' + (G.ship.cargo.grain || 0) + ', held ' + (G.ship.arms.held ? 'yes' : 'no'));
await shot('4-stowed');

/* A dead trader, taken in tow. Lifted and knocked out, slid along the nose
 * until her skin is in reach of the jaws, then G. */
const tr = Sim.shipsAll(G.sys, G.t).filter(x => x.route && !x.hostile && x.phase !== 'moored' && /freighter|trade|shuttle|hauler/.test(x.cls || ''))[0];
if (!tr) return out.join(' | ') + ' | no trader to tow';
const spec = window.Combat.liftTrader(G.sys, tr, G.t);
window.Combat.disableNpc(G.sys, G, spec, 'drive', G.t, null);
const L = spec.live, gg = R.armGrip(frame());
L.vel = V.clone(G.ship.vel); L.fwd = V.clone(G.ship.right); L.up = V.clone(G.ship.up); L.right = V.cross(L.fwd, L.up);
const herState = () => Sim.shipsAll(G.sys, G.t).filter(o => o.spec === spec)[0];
for (let d = 0.3; d > 0; d -= 0.001) {
  L.pos = V.addScaled(R.armGrip(frame()), G.ship.fwd, d);
  const o = herState();
  if (o && R.hullSegmentHit(o, R.armGrip(frame()), V.addScaled(R.armGrip(frame()), G.ship.fwd, window.Arms.REACH_KM * 0.8), 0.002)) break;
}
await wait(300);
const vv = window.Arms.view(G, frame());
out.push('her in view: ' + JSON.stringify({ t: vv.target, d: vv.dist, reach: vv.inReach, note: vv.note }));
await shot('5-arm-cam-her');
await key('g');
await wait(300);
out.push('clamped ' + (G.ship.arms.held ? G.ship.arms.held.kind + ' ' + Math.round(G.ship.arms.held.mass) + ' t' : 'no') + ', mass ' + Math.round(G.ship.mass) + ' t');
const rel0 = V.sub(L.pos, G.ship.pos);
G.ship.vel = V.addScaled(G.ship.vel, G.ship.fwd, 0.03);
await wait(1500);
const rel1 = V.sub(spec.live.pos, G.ship.pos);
out.push('she comes with you: offset drift ' + (V.dist(rel0, rel1) * 1000).toFixed(2) + ' m, rel speed ' + (V.dist(spec.live.vel, G.ship.vel) * 1000).toFixed(2) + ' m/s');
await shot('6-towing');
G.viewMode = 'orbit';
await wait(900);
await shot('7-towing-outside');
return out.join(' | ');
