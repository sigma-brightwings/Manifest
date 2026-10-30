/* probe-tube.js — boarding in space by invitation (2026-10-29). Puts you
 * beside a trader in flight, matched to her, asks to come aboard, watches her
 * tube run out, walks out through your airlock and down it into hers, talks
 * to her master, and walks back. Muted.
 *
 *     node tools/electron-probe.cjs tools/probe-tube.js "Claude outputs\tube-probe"
 */
if (window.Sound && window.Sound.mute) window.Sound.mute(true);
const G = window.Game, Sim = window.Sim, V = window.V, BD = window.Boarding, D = window.Dialogue;
G.title = null;
const notes = [];
/* Real keystrokes (someone typing on this machine while the window has
 * focus) never reach the game during the run: a stray U reels the tube in. */
/* The probe's own presses arrive through the same input pipeline and are
 * trusted as well, so they are let through by name while k2 sends them. */
let allowKeys = false;
const k2 = async k => { allowKeys = true; await key(k); allowKeys = false; };
window.addEventListener('keydown', e => { if (e.isTrusted && !allowKeys) { e.stopImmediatePropagation(); e.preventDefault(); } }, true);
window.addEventListener('keyup', e => { if (e.isTrusted && !allowKeys) { e.stopImmediatePropagation(); e.preventDefault(); } }, true);
if (!BD) return 'FAIL: boarding.js not loaded';
/* A trader in flight, far from anything, with a route. */
let her = null;
const stars = G.galaxy.stars.slice().sort((a, b) => window.Galaxy.distance3(a, G.here) - window.Galaxy.distance3(b, G.here));
for (const st of stars.slice(0, 30)) {
  if (st.id !== G.here.id) G.enterSystem(st, { fresh: true });
  const list = Sim.shipsAll(G.sys, G.t).filter(s => s.route && !s.hostile && s.phase !== 'moored' && !BD.NEVER[s.cls] && /hauler|freighter|trade|tanker|liner|shuttle/.test(s.cls || ''));
  if (list.length) { her = list[0]; break; }
}
if (!her) return 'FAIL: no trader in flight';
if (G.ship.docked) { G.ship.docked = null; G.ship.dockOffset = null; }
G.ship.landed = false;
/* Too far first: the gate should say so. */
G.ship.pos = V.add(her.pos, { x: 60, y: 0, z: 0 }); G.ship.vel = V.clone(her.vel);
notes.push('60 km off: ' + BD.ask(G, G.sys, G.t, BD.herState(G.sys, G.t, her.name)).why);
/* Then 8 km off her, on her rail velocity, and ask. */
const at = BD.herState(G.sys, G.t, her.name);
G.ship.pos = V.add(at.pos, { x: 6, y: 4, z: 3 });
G.ship.vel = V.clone(at.vel);
G.panel = 0; G.viewMode = 'orbit'; G.followShip = true; G.cam.dist = 0.15; G.cam.pitch = 0.3; G.cam.yaw = 0.9;
/* Who reels it in, if anybody does early. */
const relOrig = BD.release;
let relStack = null;
BD.release = function () { if (G.ship.tether && !G.ship.tether.joined) relStack = new Error('released').stack.split('\n').slice(1, 5).join(' | '); return relOrig.apply(this, arguments); };
const r = BD.join(G, G.sys, G.t, BD.herState(G.sys, G.t, her.name));
notes.push('her: ' + her.name + ' (' + her.cls + ')  ask: ' + JSON.stringify(r));
if (!r.ok) return notes.join('\n');
const t0 = performance.now();
let shotMid = false;
while (!G.ship.tether || !G.ship.tether.joined) {
  await wait(500);
  const h = BD.herState(G.sys, G.t, her.name);
  if (!G.ship.tether || !h) { notes.push('tether lost while waiting: ' + G.message + '  stack: ' + relStack + '  her ' + (h ? V.dist(h.pos, G.ship.pos).toFixed(3) + ' km' : 'gone')); return notes.join('\n'); }
  if (!shotMid && V.dist(h.pos, G.ship.pos) < 1) { shotMid = true; G.cam.dist = 0.25; await shot('1-coming-alongside'); }
  if (shotMid !== 2 && V.dist(h.pos, G.ship.pos) < 0.25) { shotMid = 2; G.cam.dist = 0.2; await shot('1b-coming-round'); }
  if (performance.now() - t0 > 180000) { notes.push('still not alongside after 180 s, ' + V.dist(h.pos, G.ship.pos).toFixed(3) + ' km'); return notes.join('\n'); }
}
notes.push('alongside after ' + ((performance.now() - t0) / 1000).toFixed(0) + ' s  (' + G.message + ')');
const vJoin = V.clone(BD.herState(G.sys, G.t, her.name).vel);
{
  const sl = G.ship.tether.slot, hh = BD.herState(G.sys, G.t, her.name), s = G.ship;
  notes.push('slot: ' + (sl ? sl.mode + ' (lengths ' + (sl.lengths || []).map(x => (x * 1000).toFixed(1)).join(' / ') + ' m, her size ' + ((hh.size || 0) * 1000).toFixed(1) + ' m), tube ' + (sl.gap * 1000).toFixed(1) + ' m, her centre ' + sl.off.map(x => (x * 1000).toFixed(1)).join('/') + ' m' : 'none') +
    ' | her nose·yours ' + V.dot(hh.fwd, s.fwd).toFixed(3) + ', her up·yours ' + V.dot(hh.up, s.up).toFixed(3) +
    ' | basis check right·(fwd×up) ' + V.dot(s.right, V.cross(s.fwd, s.up)).toFixed(3));
}
await wait(7000);
const hj = BD.herState(G.sys, G.t, her.name);
notes.push('joined 7 s: her throttle ' + (hj.throttle || 0).toFixed(2) + ', her velocity changed ' + (V.dist(hj.vel, vJoin) * 1000).toFixed(2) + ' m/s');
G.cam.dist = 0.12;
await wait(500);
notes.push('tube out: ' + G.ship.tether.tube.toFixed(2) + ', distance to her ' + (V.dist(G.ship.pos, BD.herState(G.sys, G.t, her.name).pos) * 1000).toFixed(1) + ' m');
await shot('2-tube-out');
/* The pair from beside and from below, the way they lie. */
for (const [p, y, d, n] of [[0.05, 1.57, 0.12, '2b-beside'], [-0.9, 0.6, 0.12, '2c-below'], [0.35, 0.0, 0.14, '2d-astern']]) {
  G.cam.pitch = p; G.cam.yaw = y; G.cam.dist = d; await wait(700); await shot(n);
}
/* Out of the seat and through your airlock. */
G.viewMode = 'cockpit';
await k2('o');
await wait(1000);
notes.push('walking: ' + !!(G.walk && G.walk.ship) + '  (' + G.message + ')  tubed ' + !!(G.ship.tether && G.ship.tether.joined) + ' docked ' + G.ship.docked + ' hyper ' + !!G.hyper + ' title ' + !!G.title + ' panel ' + G.panel + ' view ' + G.viewMode);
if (!G.walk) return notes.join('\n');
const pl = G.walk.plan.ship && G.walk.plan.ship.decks ? G.walk.plan.ship.decks.main : G.walk.plan;
G.walk.plan = pl;
const ctl = pl.items.find(it => it.kind === 'hatch'), ramp = pl.items.find(it => it.kind === 'ramp');
G.walk.near = ctl; await k2('e'); await wait(6000);
G.walk.near = ramp; await k2('e'); await wait(400);
notes.push('your ramp says: ' + (G.walk.near ? G.walk.near.label : '-') + '  (' + G.message + ')');
if (!G.aboard) { G.walk.near = ramp; await k2('e'); }
await wait(1500);
notes.push('aboard: ' + !!G.aboard + ' ' + (G.aboard ? G.aboard.how + ' ' + G.aboard.ship.shipName + ' as ' + G.aboard.ship.hullId : '') + '  (' + G.message + ')');
if (!G.aboard) return notes.join('\n');
const lock = G.walk.plan.items.find(it => it.kind === 'hatch');
G.walk.near = lock; await k2('e'); await wait(6000);
const sc = window.Npc.lastScene;
notes.push('her crew: ' + (sc ? sc.people.map(p => p.name + ' ' + p.role + (p.master ? ' (master)' : '')).join('; ') : 'none'));
const pass = (G.walk.plan.rooms || []).find(r => r.kind === 'passage');
if (pass) { G.walk.x = (pass.x0 + pass.x1) / 2; G.walk.z = (pass.z0 + pass.z1) / 2; G.walk.yaw = 0; }
await wait(1200);
await shot('3-aboard-her');
/* Her hold, as long as she is outside (each ship her own size). */
{
  const cg = (G.walk.plan.rooms || []).find(r => r.kind === 'cargo');
  const ps = (G.walk.plan.rooms || []).find(r => r.kind === 'passage');
  notes.push('her length ' + (window.Render.hullLength(G.aboard.ship) * 1000).toFixed(1) + ' m; hold ' + (cg ? (cg.z1 - cg.z0).toFixed(1) + ' m long' : 'none') + ', passage ' + (ps ? (ps.z1 - ps.z0).toFixed(1) : '-') + ' m');
  if (cg) {
    const sx = G.walk.x, sz = G.walk.z, sy = G.walk.yaw;
    G.walk.x = (cg.x0 + cg.x1) / 2; G.walk.z = cg.z1 - 0.6; G.walk.yaw = Math.PI; G.walk.pitch = -0.15; await wait(900); await shot('3b-her-hold');
    const crates = (G.walk.plan.items || []).filter(it => it.kind === 'crate');
    const byCid = {};
    crates.forEach(c => { if (c.cid) byCid[c.cid] = (byCid[c.cid] || 0) + 1; });
    notes.push('hold ' + (cg.x1 - cg.x0).toFixed(1) + ' m wide; crate stacks ' + crates.length + ' ' + JSON.stringify(byCid) +
               '; labels e.g. ' + crates.filter(c => c.label).slice(0, 3).map(c => '"' + c.label + '"').join(', ') +
               ' | her manifest ' + JSON.stringify(G.aboard.ship.cargo));
    const lab = crates.find(c => c.label);
    if (lab) { G.walk.x = lab.x + (lab.x < 0 ? 1.6 : -1.6); G.walk.z = lab.z; G.walk.yaw = lab.x < 0 ? -Math.PI / 2 : Math.PI / 2; G.walk.pitch = -0.2; await wait(900); await shot('3c-crate-label'); }
    G.walk.x = sx; G.walk.z = sz; G.walk.yaw = sy; await wait(300);
  }
}
const m = sc && sc.people.find(p => p.master);
if (m) {
  G.walk.x = m.x + Math.sin(m.yaw) * 1.0; G.walk.z = m.z + Math.cos(m.yaw) * 1.0;
  G.walk.yaw = Math.atan2(m.x - G.walk.x, m.z - G.walk.z);
  await wait(400);
  G.walk.near = { kind: 'npc', npc: m, label: 'Talk to ' + m.name, x: m.x, z: m.z };
  await k2('e'); await wait(700);
  if (G.talk) notes.push('master: "' + G.talk.st.line + '"  offered: ' + D.options(G, G.sys, null, G.talk.st).map(o => o.label + (o.ok ? '' : ' (' + o.why + ')')).join(' | '));
  await shot('4-her-master');
  G.talk = null;
}
/* Back: her airlock, cycle out, down the tube. */
const lock2 = G.walk.plan.items.find(it => it.kind === 'hatch') ||
  (G.walk.plan.ship && G.walk.plan.ship.decks ? G.walk.plan.ship.decks.main.items.find(it => it.kind === 'hatch') : null);
if (lock2) {
  if (G.walk.plan.ship && G.walk.plan.ship.decks) G.walk.plan = G.walk.plan.ship.decks.main;
  G.walk.near = lock2; await k2('e'); await wait(6000);
  const ramp2 = G.walk.plan.items.find(it => it.kind === 'ramp');
  G.walk.near = ramp2; await k2('e'); await wait(400);
  if (G.aboard) { G.walk.near = ramp2; await k2('e'); await wait(1500); }
}
notes.push('after: aboard ' + !!G.aboard + ', walking your own ship ' + !!(G.walk && G.walk.ship) + '  (' + G.message + ')');
/* Into the seat and reel in. */
G.walk = null;
await wait(300);
await k2('u');
await wait(500);
notes.push('reeled in: ' + !G.ship.tether + '  (' + G.message + ')');
return notes.join('\n') + '\nfps ' + Math.round(G.fps);
