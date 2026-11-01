/* probe-aggression.js - a robbery and an arrest, in the real shell
 * (2026-10-31, aggression.js). Puts a pirate beside a laden freighter with
 * you 150 km off and nothing in your hold, lets her work, then brings a
 * cutter in on her. Sim.policeNearby is stubbed for the robbery half, so a
 * patrol lane thirty thousand km away does not call it off before it
 * starts. Runs in a scratch profile (electron-probe.cjs), so emptying the
 * hold touches no real career.
 *
 *     node tools/electron-probe.cjs tools/probe-aggression.js ".probe-shots\aggression"
 */
if (window.Sound && window.Sound.mute) window.Sound.mute(true);
const G = window.Game, Sim = window.Sim, V = window.V;
G.title = null;
const out = [];
if (G.ship.docked) { G.ship.docked = null; G.ship.dockOffset = null; }
G.ship.landed = false; G.dockTarget = null; G.navTarget = null;
G.warpIndex = 0; G.viewMode = 'cockpit'; G.ship.thrust = V.zero(); G.ship.throttle = 0;
G.ship.cargo = {}; G.ship.credits = 0;
const realPN = Sim.policeNearby;
Sim.policeNearby = () => null;
const face = (to) => {
  const f = V.norm(V.sub(to, G.ship.pos));
  const u0 = Math.abs(f.z) < 0.9 ? { x: 0, y: 0, z: 1 } : { x: 0, y: 1, z: 0 };
  const right = V.norm(V.cross(f, u0));
  G.ship.fwd = f; G.ship.right = right; G.ship.up = V.norm(V.cross(right, f));
};
const hp = sp => sp ? (Math.round(sp.hullHp) + (sp.disabled ? '/' + sp.disabled : '')) : '-';
const sys = G.sys;
/* A freighter out of sight of any patrol lane: pirates stand off where the
 * law flies (Sim.policeNearby, inside updateEncounters too). */
const Eco = window.Economy;
const worth = s => (s.manifest || []).some(m => m.qty > 0 && Eco.BY_ID[m.cid] && !Eco.BY_ID[m.cid].waste && Eco.BY_ID[m.cid].base > 0);
const tr = Sim.trafficAll(sys, G.t).find(s => s.phase === 'cruise' && !s.route.runner && worth(s) && !realPN(sys, G.t, s.pos));
const pir = sys.patrols.find(p => p.kind === 'pirate' && !p.dead);
out.push('trader ' + (tr && tr.route.name) + ' | pirate ' + (pir && pir.name));
if (!tr || !pir) return out.join(' | ');
G.ship.pos = V.add(tr.pos, { x: 0, y: 150, z: 6 }); G.ship.vel = V.clone(tr.vel);
Sim.wakeNpc(pir, { pos: V.add(tr.pos, { x: 0, y: -12, z: 0 }), vel: V.clone(tr.vel), fwd: { x: 0, y: 1, z: 0 },
                   up: { x: 0, y: 0, z: 1 }, right: { x: 1, y: 0, z: 0 } }, sys);
pir.preyAt = 0;
face(tr.pos);
await wait(1500);
const v = pir.target;
out.push('after 1.5s: target ' + (v && v.name) + ', mode ' + pir.mode);
for (let i = 0; i < 40 && v && !v.demandedBy; i++) await wait(500);
out.push('demand ' + (v && v.demandedBy === pir.id) + ' -> ' + (v && (pir.loot ? 'yielded' : v.refused ? 'refused' : '?')));
const trace = [];
for (let i = 0; i < 24 && v && v.refused && !v.dead && !(pir.loot); i++) {
  await wait(500);
  if (v.live && pir.live) { G.ship.pos = V.add(v.live.pos, { x: 0, y: 60, z: 6 }); G.ship.vel = V.clone(v.live.vel); face(V.scale(V.add(v.live.pos, pir.live.pos), 0.5)); }
  if (i % 4 === 0) trace.push(hp(v) + ':' + hp(pir));
  if (i === 6) await shot('1-under-fire');
}
/* Struck or knocked out: give her the time to strip the freighter. */
for (let i = 0; i < 50 && v && v.disabled && !v.robbed && !v.dead; i++) {
  await wait(500);
  if (v.live) { G.ship.pos = V.add(v.live.pos, { x: 0, y: 20, z: 3 }); G.ship.vel = V.clone(v.live.vel); face(v.live.pos); }
}
out.push('trace victim:pirate ' + trace.join(' '));
await shot('2-robbery-end');
out.push('victim ' + hp(v) + ' robbed ' + !!(v && v.robbed) + ' | distress ' + (G.distress || []).filter(c => c.victim === v).map(c => c.kind).join(','));
/* The law arrives. */
Sim.policeNearby = realPN;
const cop = sys.patrols.find(p => p.kind === 'police' && p.faction !== 'outlaw' && !p.dead && !p.live);
if (cop && pir.live) {
  Sim.wakeNpc(cop, { pos: V.add(pir.live.pos, { x: 30, y: 0, z: 0 }), vel: V.clone(pir.live.vel), fwd: { x: -1, y: 0, z: 0 },
                     up: { x: 0, y: 0, z: 1 }, right: { x: 0, y: 1, z: 0 } }, sys);
  await wait(1000);
  out.push('cop ' + cop.name + ' -> ' + (cop.target && cop.target.name) + ' (' + cop.pursuing + ') | pirate ' + pir.mode);
  const t2 = [];
  let shotP = false;
  for (let i = 0; i < 240 && pir.live && !pir.disabled && !pir.dead; i++) {
    await wait(500);
    if (pir.live) { G.ship.pos = V.add(pir.live.pos, { x: 0, y: 50, z: 6 }); G.ship.vel = V.clone(pir.live.vel); face(pir.live.pos); }
    if (i % 10 === 0) t2.push(hp(pir) + '@' + (cop.live ? Math.round(V.dist(cop.live.pos, pir.live.pos)) : '-') + 'km');
    if (pir.hullHp !== undefined && !shotP) { shotP = true; await shot('3-pursuit'); }
  }
  out.push('pursuit ' + t2.join(' '));
  for (let i = 0; i < 90 && !pir.dead; i++) {
    await wait(500);
    if (cop.live) { G.ship.pos = V.add(cop.live.pos, { x: 0, y: 8, z: 1 }); G.ship.vel = V.clone(cop.live.vel); face(cop.live.pos); }
  }
  await shot('4-arrest');
  out.push('arrested ' + !!pir.arrested + ' dead ' + !!pir.dead + ' | cop ' + cop.mode);
} else out.push('no lawful cop to send');
out.push('journal: ' + ((G.journal || []).slice(-4).map(j => j.text).join(' / ')));
return out.join('\n');
