/* probe-crookedlaw.js - ship AI slice 4 in the real shell (2026-11-22).
 *
 * A bent cop comes alongside, scans you the ordinary way, wants her
 * "inspection fee", and is answered with real key presses: C to pay, then
 * (a second time) X to refuse. Then she is set beside a laden trader and
 * the game's own law pass shakes the trader down.
 *
 * Set directly, and said so: the starting system's corruption is set to 80
 * (it is 41: "bought" is what the slice is about); your ship out of dock
 * and placed; the cop woken beside you, matched, in 'inspect'; for the NPC
 * case she is moved beside the trader. The scan, the fee, the answers and
 * the shakedown are the game's own. Scratch profile.
 *
 *     node tools/electron-probe.cjs tools/probe-crookedlaw.js "<outdir>"
 */
if (window.Sound && window.Sound.mute) window.Sound.mute(true);
const G = window.Game, Sim = window.Sim, V = window.V, AI = window.ShipAI, C = window.Combat;
G.title = null;
const out = [];
G.ship.arrival = null; G.ship.departed = null; G.ship.padHold = null;
if (G.ship.docked) { G.ship.docked = null; G.ship.dockOffset = null; }
G.ship.landed = false; G.dockTarget = null; G.navTarget = null;
G.warpIndex = 0; G.viewMode = 'cockpit'; G.panel = 0; G.ship.thrust = V.zero(); G.ship.throttle = 0;
const sys = G.sys;
const corr0 = sys.corruption;
sys.corruption = 80;
G.ship.credits = 12000;
G.ship.cargo = {};
const face = (to) => {
  const f = V.norm(V.sub(to, G.ship.pos));
  const u0 = Math.abs(f.z) < 0.9 ? { x: 0, y: 0, z: 1 } : { x: 0, y: 1, z: 0 };
  const right = V.norm(V.cross(f, u0));
  G.ship.fwd = f; G.ship.right = right; G.ship.up = V.norm(V.cross(right, f));
};
const press = (k) => window.dispatchEvent(new KeyboardEvent('keydown', { key: k }));
const unkey = (k) => window.dispatchEvent(new KeyboardEvent('keyup', { key: k }));
const law = sys.patrols.filter(p => p.kind === 'police' && !p.outlaw && p.faction !== 'outlaw');
const bent = law.find(p => { const d = AI.dials(G, sys, p); return d && d.bent; });
out.push('system ' + sys.name + ' | corruption ' + corr0 + ' -> 80 (set) | lawful cops ' + law.length +
         ': ' + law.map(p => { const d = AI.dials(G, sys, p); return p.name + ' p' + d.probity.toFixed(2) + (d.bent ? ' BENT' : ''); }).join(', '));
if (!bent) { sys.corruption = corr0; out.push('no bent cop'); return out.join('\n'); }
/* Everyone else lawful well away, so nobody is watching her. */
const park = (p, pos) => {
  if (!p.live) Sim.wakeNpc(p, { pos, vel: V.clone(G.ship.vel), fwd: { x: 1, y: 0, z: 0 }, up: { x: 0, y: 0, z: 1 }, right: { x: 0, y: 1, z: 0 } }, sys);
  else { p.live.pos = V.clone(pos); p.live.vel = V.clone(G.ship.vel); }
};
const P0 = V.add(Sim.bodyPosition(sys.ports[0], sys, G.t), { x: 0, y: 0, z: 90000 });
G.ship.pos = V.clone(P0); G.ship.vel = V.clone(Sim.bodyState ? Sim.bodyState(sys.ports[0], sys, G.t).vel : G.ship.vel);
const round = async (answer, tag) => {
  park(bent, V.add(G.ship.pos, { x: 0.6, y: 0, z: 0 }));
  bent.mode = 'inspect'; bent.scanned = false; bent.scanHoldTime = 0; bent.modeSince = 0; bent.target = null;
  face(bent.live.pos);
  for (let i = 0; i < 40 && !G.shakedown; i++) {
    if (bent.live) { bent.live.pos = V.add(G.ship.pos, { x: 0.6, y: 0, z: 0 }); bent.live.vel = V.clone(G.ship.vel); }
    await wait(200);
  }
  if (!G.shakedown) { out.push(tag + ': no shakedown (searched instead?) ' + (G.message ? G.message.text || G.message : '')); return; }
  const fee = G.shakedown.fee, cr = G.ship.credits, w0 = JSON.stringify(G.wanted || {});
  await wait(400);
  await shot('crookedlaw-' + tag + '-asked');
  press(answer); unkey(answer);
  await wait(600);
  out.push(tag + ': fee ' + fee + ' | pressed ' + answer + ' | credits ' + cr + ' -> ' + G.ship.credits +
           ' | wanted ' + w0 + ' -> ' + JSON.stringify(G.wanted || {}) + ' | said: ' + (G.message ? (G.message.text || G.message) : ''));
  await shot('crookedlaw-' + tag + '-answered');
};
await round('c', '1-pay');
bent.shookAt = 0;
await round('x', '2-refuse');
/* On the lanes: beside a laden trader. */
const st = Sim.trafficAll(sys, G.t).find(s => s.phase === 'cruise' && !s.route.runner && s.manifest && s.manifest.length &&
  !s.route.stream && s.route.kind !== 'work');
if (st) {
  bent.shookAt = null; bent.scanAt = 0; bent.target = null; st.route.scannedAt = undefined;
  G.ship.pos = V.add(st.pos, { x: 0, y: 700, z: 40 }); G.ship.vel = V.clone(st.vel);
  park(bent, V.add(st.pos, { x: 60, y: 0, z: 0 }));
  bent.live.vel = V.clone(st.vel);
  let v = null;
  for (let i = 0; i < 40 && !v; i++) {
    face(st.pos);
    await wait(250);
    v = sys.patrols.find(p => p.liftedFrom === st.route && p.shakenBy);
  }
  out.push('trader: ' + st.route.name + ' -> ' + (v ? 'shaken down for ' + v.shakenBy.fee + ' cr' : 'not shaken down') +
           ' | said: ' + (G.message ? (G.message.text || G.message) : ''));
  if (v && v.live) face(v.live.pos);
  await wait(300);
  await shot('crookedlaw-3-trader');
}
out.push('on the take: ' + JSON.stringify(G.onTheTake || {}));
sys.corruption = corr0;
return out.join('\n');
