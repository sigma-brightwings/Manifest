/* probe-turncoats.js - outlaws by corruption, and a trader who turns, in
 * the real shell (2026-11-22).
 *
 * Reports the starting system's raiders (names, crews), then finds an
 * armed trader in cruise whose captain is bent and greedy and whose roll
 * this leg would let her turn for a fortune, and parks you beside her
 * with 20 t of milfuel and no gun. The turn itself is the game's own
 * Aggression.runners pass on its own clock - nothing calls it here.
 *
 * Set directly, and said so: your ship out of dock and placed beside her;
 * your hold (20 t milfuel, no credits, no gun); Sim.policeNearby stubbed
 * so a patrol lane far off does not stop her (a trader never turns under
 * the law's eye - that is the point of the stub). Scratch profile.
 *
 *     node tools/electron-probe.cjs tools/probe-turncoats.js "<outdir>"
 */
if (window.Sound && window.Sound.mute) window.Sound.mute(true);
const G = window.Game, Sim = window.Sim, V = window.V, AI = window.ShipAI, A = window.Aggression, C = window.Combat;
G.title = null;
const out = [];
G.ship.arrival = null; G.ship.departed = null; G.ship.padHold = null;
if (G.ship.docked) { G.ship.docked = null; G.ship.dockOffset = null; }
G.ship.landed = false; G.dockTarget = null; G.navTarget = null;
G.warpIndex = 0; G.viewMode = 'cockpit'; G.panel = 0; G.ship.thrust = V.zero(); G.ship.throttle = 0;
const sys = G.sys;
out.push('system ' + sys.name + ' | corruption ' + sys.corruption + (sys.heldBy ? ' | held by ' + sys.heldBy : ''));
const law = sys.patrols.filter(p => !p.outlaw && p.faction !== 'outlaw' && /police|navy|capital/.test(p.kind));
const outl = sys.patrols.filter(p => p.outlaw || p.faction === 'outlaw');
out.push('lawful guns ' + law.length + ' | outlaws ' + outl.length + ': ' +
         outl.map(p => p.name + ' (' + p.kind + (p.band ? ', crew ' + p.band : '') + ')').join('; '));
G.ship.cargo = { milfuel: 20 }; G.ship.credits = 0;
G.ship.gun = null; G.ship.turret = null; G.ship.missiles = 0;
if (G.ship.fit) Object.keys(G.ship.fit).forEach(k => { if (/^hardpoint/.test(k)) G.ship.fit[k] = null; });
const realPN = Sim.policeNearby;
Sim.policeNearby = () => null;
const face = (to) => {
  const f = V.norm(V.sub(to, G.ship.pos));
  const u0 = Math.abs(f.z) < 0.9 ? { x: 0, y: 0, z: 1 } : { x: 0, y: 1, z: 0 };
  const right = V.norm(V.cross(f, u0));
  G.ship.fwd = f; G.ship.right = right; G.ship.up = V.norm(V.cross(right, f));
};
/* Who would turn this leg, by the game's own numbers. */
const prize = A.cargoValue([{ cid: 'milfuel', qty: 20 }]);
const cands = Sim.trafficAll(sys, G.t).filter(s => s && s.phase === 'cruise').map(st => {
  const d = A.opportunistState(sys, G, st);
  if (!d) return null;
  const tempt = AI.temptation(d, { prize: prize, own: A.cargoValue(st.manifest), soft: 1, law: false });
  const roll = A.hash01('turncoat|' + (sys.seed || '') + '|' + A.legKey(st, G.t));
  return { st, d, tempt, roll };
}).filter(Boolean);
out.push('bent, greedy, armed traders in cruise: ' + cands.length + ' | would turn this leg for ' + Math.round(prize) + ' cr: ' +
         cands.filter(c => c.roll < c.tempt).length);
const pick = cands.filter(c => c.roll < c.tempt).sort((a, b) => b.tempt - a.tempt)[0];
if (!pick) { Sim.policeNearby = realPN; out.push('nobody this leg'); return out.join('\n'); }
out.push('she: ' + pick.st.route.name + ' | probity ' + pick.d.probity.toFixed(2) + ', greed ' + pick.d.greed.toFixed(2) +
         ' | tempt ' + pick.tempt.toFixed(2) + ' vs roll ' + pick.roll.toFixed(2));
pick.st.route.turnLeg = null;
sys._runnerLookAt = 0;
const said = [];
let r = null;
for (let i = 0; i < 60 && !r; i++) {
  const st = Sim.trafficAll(sys, G.t).find(s => s.route === pick.st.route);
  if (st && st.pos) { G.ship.pos = V.add(st.pos, { x: 0, y: 90, z: 8 }); G.ship.vel = V.clone(st.vel); face(st.pos); }
  if (G.message) said.push(String(G.message.text || G.message));
  await wait(250);
  r = sys.patrols.find(p => p.turncoat && p.liftedFrom === pick.st.route) || null;
}
if (!r) { Sim.policeNearby = realPN; out.push('she did not turn in 15 s'); return out.join('\n'); }
for (let i = 0; i < 6; i++) {
  if (r.live) face(r.live.pos);
  if (G.message) said.push(String(G.message.text || G.message));
  await wait(250);
}
await shot('turncoat-1-turns');
const rec = A.crimeOf(G, sys, pick.st.route, G.t);
out.push('turned: ' + r.name + ' | hostile ' + !!r.hostileToPlayer + ' mode ' + r.mode +
         ' | record ' + (rec ? JSON.stringify(rec) : 'none'));
out.push('said: ' + Array.from(new Set(said)).filter(x => /lane|fire|wanted/i.test(x)).join(' / '));
/* Pull away so she is not shooting you, and let the law see her. */
Sim.policeNearby = realPN;
const cop = law.find(p => p.kind === 'police');
if (cop && r.live) {
  if (!cop.live) Sim.wakeNpc(cop, { pos: V.add(r.live.pos, { x: 400, y: 0, z: 0 }), vel: V.clone(r.live.vel), fwd: { x: -1, y: 0, z: 0 },
                                    up: { x: 0, y: 0, z: 1 }, right: { x: 0, y: 1, z: 0 } }, sys);
  else { cop.live.pos = V.add(r.live.pos, { x: 400, y: 0, z: 0 }); cop.live.vel = V.clone(r.live.vel); }
  cop.target = null; cop.pursuing = null; cop.hostileToPlayer = false;
  out.push('woke ' + cop.name + ' 400 km off her (set directly)');
  for (let i = 0; i < 24 && cop.target !== r; i++) {
    if (r.live) { G.ship.pos = V.add(r.live.pos, { x: 0, y: 600, z: 30 }); G.ship.vel = V.clone(r.live.vel); face(r.live.pos); }
    if (G.message) said.push(String(G.message.text || G.message));
    await wait(250);
  }
  await shot('turncoat-2-law');
  out.push('law: ' + cop.name + ' -> ' + (cop.target ? cop.target.name + ' (' + cop.pursuing + ')' : 'nobody'));
}
out.push('heard: ' + Array.from(new Set(said)).slice(-6).join(' / '));
return out.join('\n');
