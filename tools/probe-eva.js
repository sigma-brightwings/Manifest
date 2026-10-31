/* probe-eva.js — boarding part 3, in the real game (2026-10-31). A trader
 * in flight is lifted and her drive knocked out; you park 40 m off her,
 * stand up, cycle out to vacuum, walk off your ramp into your suit, fly
 * the jets, cross to her ramp, force her outer door, face her master,
 * and (made to yield) have her crew push a container out for your scoop;
 * then back across to your own ramp and aboard. Muted.
 *
 *     node tools/electron-probe.cjs tools/probe-eva.js ".probe-shots\eva"
 */
if (window.Sound && window.Sound.mute) window.Sound.mute(true);
const G = window.Game, Sim = window.Sim, V = window.V, Cb = window.Combat, D = window.Dialogue;
G.title = null;
const notes = [];
let allowKeys = false;
const k2 = async k => { allowKeys = true; await key(k); allowKeys = false; };
window.addEventListener('keydown', e => { if (e.isTrusted && !allowKeys) { e.stopImmediatePropagation(); e.preventDefault(); } }, true);
window.addEventListener('keyup', e => { if (e.isTrusted && !allowKeys) { e.stopImmediatePropagation(); e.preventDefault(); } }, true);
if (!window.Eva) return 'FAIL: eva.js not loaded';
let st = null;
const stars = G.galaxy.stars.slice().sort((a, b) => window.Galaxy.distance3(a, G.here) - window.Galaxy.distance3(b, G.here));
for (const s of stars.slice(0, 30)) {
  if (s.id !== G.here.id) G.enterSystem(s, { fresh: true });
  const list = Sim.shipsAll(G.sys, G.t).filter(x => x.route && !x.hostile && x.phase !== 'moored' && /hauler|freighter|trade|tanker/.test(x.cls || ''));
  if (list.length) { st = list[0]; break; }
}
if (!st) return 'FAIL: no trader in flight';
if (G.ship.docked) { G.ship.docked = null; G.ship.dockOffset = null; }
G.ship.landed = false;
const spec = Cb.liftTrader(G.sys, st, G.t);
if (!spec || !spec.live) return 'FAIL: could not lift her';
Cb.disableNpc(G.sys, G, spec, 'drive', G.t, null);
notes.push('her: ' + spec.name + ' (' + spec.cls + '), disabled ' + spec.disabled + ', hold ' + JSON.stringify(Cb.holdOf(G.sys, spec)));
/* 120 m off her beam, matched, lying the way she lies: the way across,
 * belly to belly, runs clear of both hulls. */
const L = spec.live;
G.ship.pos = V.addScaled(L.pos, L.right, 0.12); G.ship.vel = V.clone(L.vel);
G.ship.fwd = V.clone(L.fwd); G.ship.up = V.clone(L.up); G.ship.right = V.clone(L.right);
G.ship.thrust = V.zero(); G.ship.angRate = { pitch: 0, yaw: 0, roll: 0 };
G.warpIndex = 0; G.panel = 0; G.viewMode = 'cockpit';
await wait(800);
await k2('o');
await wait(800);
if (!G.walk) return notes.concat('FAIL: could not stand up (' + G.message + ')').join('\n');
const W = G.walk.plan.ship && G.walk.plan.ship.decks ? G.walk.plan.ship.decks.main : G.walk.plan;
G.walk.plan = W;
const sp = (G.walk.plan.ship || W).aboard || W.spawn;
G.walk.x = sp.x; G.walk.z = sp.z; G.walk.yaw = 0;
const hatch = W.items.find(it => it.kind === 'hatch');
G.walk.near = hatch; await k2('e'); await wait(400);
notes.push('cycle out: ' + G.message);
for (let i = 0; i < 40 && !(G.ship.airlock && G.ship.airlock.ramp >= 0.999); i++) await wait(500);
notes.push('airlock ' + JSON.stringify({ side: G.ship.airlock.side, ramp: +G.ship.airlock.ramp.toFixed(2), want: G.ship.airlock.want }) + '  (' + G.message + ')');
/* Off the bottom of the ramp. */
const rp = W.ramp;
G.walk.x = (rp.x0 + rp.x1) / 2;
G.walk.z = rp.mode === 'lift' ? (rp.foot + rp.hinge) / 2 : rp.hinge - rp.len * Math.cos(rp.angle) + 0.05;
G.walk.yaw = Math.PI;
await wait(600);
notes.push('suit: ' + !!G.eva + '  walk ' + !!G.walk + '  (' + G.message + ')');
if (!G.eva) return notes.join('\n');
/* Look back at your own ship. */
const lookAt = p => { const f = V.norm(V.sub(p, G.eva.pos)); G.eva.f = f; G.eva.r = V.norm(V.cross(f, G.eva.u)); G.eva.u = V.norm(V.cross(G.eva.r, f)); };
G.eva.pos = V.addScaled(G.eva.pos, V.scale(G.ship.up, -1), 0.008);
lookAt(G.ship.pos); await wait(500); await shot('1-suit-own-ship');
/* The jets, for two seconds forward. */
const v0 = V.clone(G.eva.vel), g0 = G.eva.gas;
G.keys.w = true; await wait(2000); G.keys.w = false;
notes.push('2 s on the jets: ' + (V.dist(G.eva.vel, v0) * 1000).toFixed(2) + ' m/s change, gas ' + g0.toFixed(1) + ' -> ' + G.eva.gas.toFixed(1));
G.keys.x = true; await wait(2500); G.keys.x = false;
notes.push('braked: ' + (window.Eva.relSpeed(G.eva, G.eva.ref) * 1000).toFixed(2) + ' m/s against the ' + (G.eva.ref && G.eva.ref.name));
/* Her ramp, marked. Look at her from 20 m. */
const tg = G.eva.tg;
notes.push('her marked: ' + !!(tg && tg.foot) + (tg ? ' at ' + (tg.dist * 1000).toFixed(0) + ' m' : ''));
if (!tg || !tg.foot) return notes.join('\n');
/* Turned away: the marker becomes an arrow on the edge. */
lookAt(V.addScaled(G.eva.pos, V.sub(G.eva.pos, tg.foot.world), 1)); await wait(400); await shot('3-arrow-behind');
/* Fly across on the jets: point at her ramp, thrust up to 2 m/s closing,
 * brake inside 12 m. */
const tFly = performance.now();
let shot2 = false;
while (performance.now() - tFly < 150000) {
  const ft = G.eva && G.eva.tg && G.eva.tg.foot ? G.eva.tg.foot.world : null;
  if (!ft) {
    notes.push('lost her: suit ' + !!G.eva + (G.eva ? ', ' + (V.dist(G.eva.pos, L.pos) * 1000).toFixed(0) + ' m from her, tg ' + !!G.eva.tg : '') +
               ', her disabled ' + spec.disabled + ' dead ' + !!spec.dead + ' live ' + !!spec.live + '  (' + G.message + ')');
    break;
  }
  const d = V.dist(G.eva.pos, ft);
  if (d < 0.003) break;
  lookAt(ft);
  const rel = V.sub(G.eva.vel, L.vel), closing = V.dot(rel, V.norm(V.sub(ft, G.eva.pos)));
  G.keys.w = d > 0.012 && closing < 0.002;
  G.keys.x = d <= 0.012 && V.len(rel) > 0.0004 || closing > 0.003;
  if (d <= 0.012 && V.len(rel) <= 0.0004) { G.keys.w = true; await wait(150); G.keys.w = false; }
  if (!shot2 && d < 0.02) { shot2 = true; G.keys.w = false; G.keys.x = false; await shot('2-her-ramp-close'); }
  await wait(100);
}
G.keys.w = false; G.keys.x = false;
notes.push('flew across in ' + ((performance.now() - tFly) / 1000).toFixed(0) + ' s, gas ' + G.eva.gas.toFixed(1) + ', ' +
           (G.eva.tg && G.eva.tg.foot ? (V.dist(G.eva.pos, G.eva.tg.foot.world) * 1000).toFixed(1) + ' m from her ramp' : 'lost her'));
await shot('4-in-reach');
await k2('e'); await wait(600);
notes.push('forced: aboard ' + !!G.aboard + (G.aboard ? ' ' + G.aboard.how : '') + '  (' + G.message + ')');
if (!G.aboard) return notes.join('\n');
/* Up into her airlock. */
const hp = Render.shipInterior(G.aboard.ship).plan, hw = hp.decks ? hp.decks.main : hp;
G.walk.plan = hw; G.walk.outside = false; G.walk.dy = 0; G.walk.x = hp.aboard.x; G.walk.z = hp.aboard.z; G.walk.yaw = 0; G.walk.pitch = 0;
await wait(1200);
notes.push('standoff: talk ' + !!G.talk + (G.talk ? ' "' + G.talk.st.line + '"  offered: ' + D.options(G, G.sys, null, G.talk.st).map(o => o.label + (o.ok ? '' : ' (' + o.why + ')')).join(' | ') : ''));
await shot('5-standoff');
const hatch2 = hw.items.find(it => it.kind === 'hatch');
/* The inner door is held. */
if (G.talk) { G.talk = null; }
G.walk.near = hatch2; await k2('e'); await wait(300);
notes.push('inner door: ' + G.message);
G.talk = null;
/* Talk; take whatever comes. */
if (!G.talk) { const m = window.Npc.lastScene && window.Npc.lastScene.people.find(p => p.master); if (m) { G.walk.near = { kind: 'npc', npc: m, label: 'x', x: m.x, z: m.z }; await k2('e'); await wait(300); } }
if (G.talk) { await k2('2'); await wait(400); notes.push('talked: "' + G.talk.st.line + '"'); }
await wait(2200);
notes.push('after talking: suit ' + !!G.eva + ', aboard ' + !!G.aboard + ', her yielded ' + spec.yielded + ', repelled ' + ((spec.repelledUntil || 0) > G.t) + ', hostile ' + !!spec.hostileToPlayer + '  (' + G.message + ')');
if (G.eva) { lookAt(L.pos); await wait(400); await shot('6-thrown-out'); }
/* Made to yield, and back aboard for the cargo. */
spec.yielded = 'talk'; spec.repelledUntil = 0; spec.hostileToPlayer = false; spec.defending = false;
if (G.eva) {
  const ft = rampFootOf();
  G.eva.pos = V.addScaled(ft, V.norm(V.sub(G.ship.pos, ft)), 0.002); G.eva.vel = V.clone(L.vel);
  await wait(200); await k2('e'); await wait(600);
}
function rampFootOf() { return G.eva && G.eva.tg && G.eva.tg.foot ? G.eva.tg.foot.world : L.pos; }
notes.push('yielded: aboard ' + !!G.aboard + '  (' + G.message + ')');
if (G.aboard) {
  const hold = (hw.rooms || []).find(r => r.kind === 'cargo');
  const crate = hw.items.find(it => it.kind === 'crate' && it.cid) || hp.items.find(it => it.kind === 'crate' && it.cid);
  if (hold && crate) {
    G.walk.plan = hw; G.walk.dy = 0; G.walk.outside = false; G.walk.x = crate.x + (crate.x < 0 ? 1.4 : -1.4); G.walk.z = crate.z; G.walk.yaw = crate.x < 0 ? -Math.PI / 2 : Math.PI / 2; G.walk.pitch = -0.2;
    await wait(600); await shot('7-her-hold');
    const before = (G.sys.canisters || []).length;
    G.walk.near = crate; await k2('e'); await wait(300);
    notes.push('pointed at "' + crate.label + '": ' + G.message);
    await wait(7000);
    notes.push('canisters out: ' + ((G.sys.canisters || []).length - before) + '  her hold now ' + JSON.stringify(Cb.holdOf(G.sys, spec)) + '  (' + G.message + ')');
  } else notes.push('no hold or crate on her main deck');
  /* Down her ramp, out — with a look along it from halfway. */
  const hr = hw.ramp;
  G.walk.plan = hw; G.walk.outside = false;
  if (hr.mode !== 'lift') {
    G.walk.x = (hr.x0 + hr.x1) / 2; G.walk.z = hr.hinge - hr.len * Math.cos(hr.angle) * 0.4; G.walk.yaw = Math.PI; G.walk.pitch = -0.25;
    await wait(700); await shot('7b-her-ramp');
  }
  G.walk.x = (hr.x0 + hr.x1) / 2; G.walk.z = hr.mode === 'lift' ? (hr.foot + hr.hinge) / 2 : hr.hinge - hr.len * Math.cos(hr.angle) + 0.05; G.walk.evaHold = false;
  await wait(800);
  notes.push('out of her: suit ' + !!G.eva + '  (' + G.message + ')');
}
if (G.eva) {
  const can = (G.sys.canisters || []).filter(c => V.dist(c.pos, L.pos) < 1).length;
  notes.push('canisters within 1 km of her: ' + can);
  lookAt(L.pos); await wait(400); await shot('8-canisters');
  const mine = G.eva.mine;
  G.eva.pos = V.addScaled(mine.world, V.norm(V.sub(L.pos, mine.world)), 0.002); G.eva.vel = V.clone(G.ship.vel);
  await wait(200); await k2('e'); await wait(600);
  notes.push('home: walking own ship ' + !!(G.walk && G.walk.ship && !G.aboard) + '  (' + G.message + ')');
  await shot('9-home-ramp');
}
return notes.join('\n') + '\nfps ' + Math.round(G.fps);
