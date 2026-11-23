/* probe-doctrine.js - ship AI slice 5 in the real shell (2026-11-22).
 *
 * Three scenes in the starting system, each left to the game's own frame:
 *   1. ESCORTS: a liner (or a runner) and the ship riding with her, woken
 *      beside you - the contacts panel should say "escorting".
 *   2. THE HIT SQUAD: a Syndicate grudge past the line, the word already
 *      upstairs; Hunters.update sends the squad.
 *   3. THE PLATFORM: you shoot a defence platform with the real trigger
 *      (a mouse press on the canvas); the alarm goes out, the law flies to
 *      it, orders you to heave to, and - you sitting still - questions you.
 *
 * Set directly, and said so: your ship out of dock and placed, the escort
 * pair woken beside you, G.grudge written (60 points, due now) and the
 * squad's half-hour wait cut to two seconds, and in scene 3 the responder
 * moved to the platform rather than flown the whole way (her ETA can be
 * hours). Everything else - who answers, the order, the questions, the
 * squad's names and arrival - is the game's own. Scratch profile.
 *
 *     node tools/electron-probe.cjs tools/probe-doctrine.js "<outdir>"
 */
if (window.Sound && window.Sound.mute) window.Sound.mute(true);
const G = window.Game, Sim = window.Sim, V = window.V, Ms = window.Milsats, Hn = window.Hunters;
G.title = null;
const out = [];
G.ship.arrival = null; G.ship.departed = null; G.ship.padHold = null;
if (G.ship.docked) { G.ship.docked = null; G.ship.dockOffset = null; }
G.ship.landed = false; G.dockTarget = null; G.navTarget = null;
G.warpIndex = 0; G.viewMode = 'cockpit'; G.panel = 0; G.ship.thrust = V.zero(); G.ship.throttle = 0;
const sys = G.sys;
const face = (to) => {
  const f = V.norm(V.sub(to, G.ship.pos));
  const u0 = Math.abs(f.z) < 0.9 ? { x: 0, y: 0, z: 1 } : { x: 0, y: 1, z: 0 };
  const right = V.norm(V.cross(f, u0));
  G.ship.fwd = f; G.ship.right = right; G.ship.up = V.norm(V.cross(right, f));
};
const msg = () => (G.message ? (G.message.text || G.message) : '');
out.push('system ' + sys.name + ' | patrols ' + sys.patrols.length);

/* ---- 1. escorts ---- */
const esc = sys.patrols.filter(p => p.escorting);
out.push('escorts here: ' + esc.map(p => p.name + ' (' + p.kind + (p.heavy ? ' heavy' : '') + ') with ' + p.escorting).join('; '));
const e1 = esc[0];
if (e1) {
  const st = Sim.patrolState(e1, sys, G.t);
  G.ship.pos = V.add(st.pos, { x: 0, y: 30, z: 6 }); G.ship.vel = V.clone(st.vel);
  face(st.pos);
  await wait(1500);
  face(e1.live ? e1.live.pos : st.pos);
  await wait(400);
  out.push('escort ' + e1.name + ' live ' + !!e1.live + ' mode ' + e1.mode + ' | flight ' +
           (e1.flight ? e1.flight.org + ' x' + e1.flight.members.length : 'none'));
  await shot('doctrine-1-escort');
}

/* ---- 2. the hit squad ---- */
G.ship.pos = V.add(Sim.bodyPosition(sys.ports[0], sys, G.t), { x: 0, y: 0, z: 120000 });
G.ship.vel = V.clone(Sim.bodyState(sys.ports[0], sys, G.t).vel);
G.grudge = { v: 60, since: G.t - 3 * 86400, dueAt: G.t - 1 };
sys._hunts = sys._hunts || {};
sys._hunts.outlaw = { dueAt: G.t + 2 };
let squad = [];
for (let i = 0; i < 30 && !squad.length; i++) { await wait(200); squad = sys.patrols.filter(p => p.squad); }
out.push('squad: ' + (squad.length ? squad.map(s => s.name + ' ' + Math.round(V.dist(s.live.pos, G.ship.pos)) + ' km').join(', ') : 'none') + ' | said: ' + msg());
if (squad.length) {
  face(squad[0].live.pos);
  await wait(800);
  await shot('doctrine-2-squad');
  squad.forEach(s => { s.dead = true; });
}
G.grudge = null; if (sys._hunts) delete sys._hunts.outlaw;
await wait(500);

/* ---- 3. the platform ---- */
/* Mirven has none: Aelost (s4) has six and a navy in its sky. */
const aelost = G.galaxy.stars.find(s => s.id === 's4');
if (aelost && aelost.id !== G.here.id) G.enterSystem(aelost, { fresh: true });
await wait(1500);
G.ship.arrival = null; G.ship.departed = null; G.ship.padHold = null;
if (G.ship.docked) { G.ship.docked = null; G.ship.dockOffset = null; }
G.ship.landed = false; G.warpIndex = 0; G.viewMode = 'cockpit'; G.panel = 0;
const sys3 = G.sys;
out.push('now in ' + sys3.name);
const plats = Ms.platformsFor(sys3, G.here, G.galaxy);
out.push('platforms here: ' + plats.length);
if (plats.length) {
  const p = plats[0], P = Ms.posOf(sys3, p, G.t);
  const port = sys3.byId[p.port];
  G.ship.pos = V.add(P, V.scale(V.norm(V.sub(P, Sim.bodyPosition(port.parentBody, sys3, G.t))), 12));
  G.ship.vel = V.clone(Sim.bodyState(port, sys3, G.t).vel);
  face(Ms.posOf(sys3, p, G.t));
  G.wanted = {};
  const cv = document.querySelector('canvas');
  for (let i = 0; i < 12 && !(sys3._alarm); i++) {
    face(Ms.posOf(sys3, p, G.t));
    cv.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true }));
    await wait(120);
    cv.dispatchEvent(new MouseEvent('mouseup', { button: 0, bubbles: true }));
    window.dispatchEvent(new MouseEvent('mouseup', { button: 0, bubbles: true }));
    await wait(200);
  }
  /* Let go of the trigger for certain: a held one kept firing as the
   * probe turned to face the warship, and disabled her (main.js releases
   * every trigger on blur). */
  window.dispatchEvent(new Event('blur'));
  await wait(200);
  let how = 'trigger';
  if (!sys3._alarm) {
    how = 'struck directly (the trigger did not land)';
    Ms.struck(sys3, G, G.t, { plat: p, dist: 12, point: P }, 20, {});
  }
  const a = sys3._alarm;
  out.push('alarm (' + how + '): ' + (a ? a.platName + ' -> ' + a.by + ' phase ' + a.phase : 'none') + ' | said: ' + msg());
  await shot('doctrine-3a-alarm');
  if (a && a.by) {
    const sp = sys3.patrols.find(x => x.id === a.by);
    /* Moved to the scene rather than flown the whole way. */
    const scene = Ms.posOf(sys3, p, G.t);
    if (!sp.live) Sim.wakeNpc(sp, { pos: V.add(scene, { x: 60, y: 0, z: 0 }), vel: V.clone(G.ship.vel), fwd: { x: 1, y: 0, z: 0 }, up: { x: 0, y: 0, z: 1 }, right: { x: 0, y: 1, z: 0 } }, sys3);
    else { sp.live.pos = V.add(scene, { x: 60, y: 0, z: 0 }); sp.live.vel = V.clone(G.ship.vel); }
    for (let i = 0; i < 20 && a.phase === 'coming'; i++) await wait(200);
    out.push('at the scene: phase ' + a.phase + ' | said: ' + msg());
    face(sp.live.pos);
    await wait(500);
    await shot('doctrine-3b-order');
    /* You sit still and let her come to you. Moved to 10 km of you first
     * (set, and said so): a navy cutter takes three minutes over 60. */
    if (sp.live) sp.live.pos = V.add(G.ship.pos, V.scale(V.norm(V.sub(sp.live.pos, G.ship.pos)), 10));
    for (let i = 0; i < 600 && a.phase !== 'done' && a.phase !== 'subdue'; i++) {
      await wait(200); if (sp.live) face(sp.live.pos);
      if (i === 40) await shot('doctrine-3b2-closing');
    }
    out.push('questioned: phase ' + a.phase + ' verdict ' + a.verdict + ' fined ' + (a.fined || 0) +
             ' | range ' + (sp.live ? V.dist(sp.live.pos, G.ship.pos).toFixed(2) : '-') + ' km | said: ' + msg());
    await shot('doctrine-3c-questioned');
  }
}
/* ---- 4. a ship scanning you (Astra: highlight it) ---- */
{
  const s4 = G.sys;
  if (s4._alarm) s4._alarm.phase = 'done';
  G.ship.hullHp = G.ship.hullMax;
  const cop = s4.patrols.find(p => p.kind === 'police' && p.faction !== 'outlaw' && !p.escorting && !p.questioning && !p.dead);
  if (cop) {
    G.ship.pos = V.add(Sim.bodyPosition(s4.ports[0], s4, G.t), { x: 0, y: 0, z: 150000 });
    G.ship.vel = V.clone(Sim.bodyState(s4.ports[0], s4, G.t).vel);
    const at = V.add(G.ship.pos, { x: 40, y: 12, z: 4 });
    if (!cop.live) Sim.wakeNpc(cop, { pos: at, vel: V.clone(G.ship.vel), fwd: { x: -1, y: 0, z: 0 }, up: { x: 0, y: 0, z: 1 }, right: { x: 0, y: -1, z: 0 } }, s4);
    else { cop.live.pos = at; cop.live.vel = V.clone(G.ship.vel); }
    cop.mode = 'inspect'; cop.scanned = false; cop.scanHoldTime = 0; cop.target = null; cop.hostileToPlayer = false;
    face(at);
    await wait(1200);
    face(cop.live.pos);
    await wait(300);
    out.push('scanning: ' + cop.name + ' mode ' + cop.mode + ' at ' + V.dist(cop.live.pos, G.ship.pos).toFixed(1) + ' km');
    await shot('doctrine-4-scanning');
  }
}
return out.join('\n');
