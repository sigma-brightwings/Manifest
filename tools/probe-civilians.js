/* probe-civilians.js - ship AI slice 3 in the real shell (2026-11-22,
 * shipai.js civilian choices). A pirate runs down real laden freighters
 * one after another, with you 150 km off watching, and each freighter's
 * captain answers "heave to" in her own way: comply, dump part of her
 * hold and run, run, or fight. Nothing about her answer is forced - this
 * is the game choosing, with her real captain, mood and odds.
 *
 * Staged (as probe-aggression.js is): your ship out of dock and placed,
 * the pirate woken beside each freighter with Sim.wakeNpc, and
 * Sim.policeNearby stubbed so a patrol lane far off does not call the
 * robbery off before it starts. Scratch profile; no career touched.
 *
 *     node tools/electron-probe.cjs tools/probe-civilians.js "<outdir>"
 */
if (window.Sound && window.Sound.mute) window.Sound.mute(true);
const G = window.Game, Sim = window.Sim, V = window.V, Eco = window.Economy, AI = window.ShipAI;
G.title = null;
const out = [];
G.ship.arrival = null; G.ship.departed = null; G.ship.padHold = null;
if (G.ship.docked) { G.ship.docked = null; G.ship.dockOffset = null; }
G.ship.landed = false; G.dockTarget = null; G.navTarget = null;
G.warpIndex = 0; G.viewMode = 'cockpit'; G.panel = 0; G.ship.thrust = V.zero(); G.ship.throttle = 0;
G.ship.cargo = {}; G.ship.credits = 0;
const realPN = Sim.policeNearby;
Sim.policeNearby = () => null;
const face = (to) => {
  const f = V.norm(V.sub(to, G.ship.pos));
  const u0 = Math.abs(f.z) < 0.9 ? { x: 0, y: 0, z: 1 } : { x: 0, y: 1, z: 0 };
  const right = V.norm(V.cross(f, u0));
  G.ship.fwd = f; G.ship.right = right; G.ship.up = V.norm(V.cross(right, f));
};
const sys = G.sys;
const worth = s => (s.manifest || []).some(m => m.qty > 0 && Eco.BY_ID[m.cid] && !Eco.BY_ID[m.cid].waste && Eco.BY_ID[m.cid].base > 0);
const marks = Sim.trafficAll(sys, G.t).filter(s => s.phase === 'cruise' && !s.route.runner && s.route.flag !== 'outlaw' && worth(s)).slice(0, 4);
const pir = sys.patrols.find(p => p.kind === 'pirate' && !p.dead);
out.push('system ' + sys.name + ' | ' + marks.length + ' freighters | pirate ' + (pir && pir.name));
if (!marks.length || !pir) return out.join('\n');
const answers = [];
for (let k = 0; k < marks.length; k++) {
  const st = Sim.trafficAll(sys, G.t).find(s => s.route === marks[k].route) || marks[k];
  if (!st || !st.pos) continue;
  G.ship.pos = V.add(st.pos, { x: 0, y: 150, z: 6 }); G.ship.vel = V.clone(st.vel);
  /* A fresh pirate each time: the last one is sated or scooping. */
  pir.target = null; pir.loot = null; pir.scoop = null; pir.mode = 'intercept'; pir.preyAt = 0; pir.hostileToPlayer = false;
  /* Woken the first time; after that she is already awake, and wakeNpc
   * leaves an awake ship where she is - so she is moved. */
  if (!pir.live) Sim.wakeNpc(pir, { pos: V.add(st.pos, { x: 0, y: -12, z: 0 }), vel: V.clone(st.vel), fwd: { x: 0, y: 1, z: 0 },
                                    up: { x: 0, y: 0, z: 1 }, right: { x: 1, y: 0, z: 0 } }, sys);
  else { pir.live.pos = V.add(st.pos, { x: 0, y: -12, z: 0 }); pir.live.vel = V.clone(st.vel); }
  face(st.pos);
  await wait(1200);
  /* She may already have answered (a pirate woken inside hailing range
   * asks at once), so find the freighter by her route, not his target. */
  const v = pir.target || sys.patrols.find(p => p.liftedFrom === st.route);
  if (!v) { answers.push(st.route.name + ': not chosen as prey'); continue; }
  /* Close enough to hail her. */
  for (let i = 0; i < 30 && !v.demandedBy; i++) {
    if (v.live && pir.live) { pir.live.pos = V.add(v.live.pos, { x: 8, y: 0, z: 0 }); pir.live.vel = V.clone(v.live.vel); }
    await wait(250);
  }
  const said = new Set();
  for (let i = 0; i < 8; i++) {
    if (v.live) { G.ship.pos = V.add(v.live.pos, { x: 0, y: 40, z: 4 }); G.ship.vel = V.clone(v.live.vel); face(v.live.pos); }
    if (G.message) said.add(String(G.message.text || G.message));
    await wait(250);
  }
  const ans = v.robbed ? 'complied' : v.dumped ? 'dumped ' + (v.dumped.cans || []).length + ' canisters' :
              v.target === pir ? 'turned to fight' : v.refused ? 'ran' : '?';
  const sc = v._choice && v._choice.scores ? Object.keys(v._choice.scores).map(x => x + ' ' + v._choice.scores[x].toFixed(2)).join(', ') : '';
  const m = AI.moodOf(G, sys, v, G.t);
  answers.push(v.name + ' (' + (Window.Combat ? '' : '') + (window.Combat.isArmedNpc(v) ? 'armed' : 'unarmed') + ', ' + AI.civilRole(v) + ', fear ' + m.fear.toFixed(2) +
               '): ' + ans + '  [' + sc + ']  said: ' + Array.from(said).filter(x => /dumps|refuses|turns|took|MAYDAY|heave/i.test(x)).join(' / '));
  await shot('civilians-' + (k + 1) + '-' + ans.split(' ')[0]);
}
Sim.policeNearby = realPN;
const cans = (sys.canisters || []).filter(c => c.dumpedBy);
out.push(answers.join('\n'));
out.push('canisters dumped and still drifting: ' + cans.length + ' - ' + cans.map(c => c.id + ' ' + c.tonnes + 't ' + c.cid + ' by ' + c.dumpedBy + ' at ' + (c.born - G.t).toFixed(1)).join('; '));
return out.join('\n');
