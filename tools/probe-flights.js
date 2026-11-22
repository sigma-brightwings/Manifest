/* probe-flights.js - ship AI slice 2 in the real shell (2026-11-22,
 * shipai.js flights and moods). Wakes two real pirates of one band near
 * you with the game's own Sim.wakeNpc, lets the flights form, then you
 * open fire on one the way a hand would - Space held, down the nose - and
 * watches whether her band-mate breaks to cover her and turns on you.
 *
 * Staged, not played: the system, the pirates' wake positions, your ship
 * out of dock and facing her are set directly (as probe-aggression.js
 * does); the shooting is the real key. Sim.policeNearby is stubbed so a
 * patrol lane far off does not send the pirates running first. Scratch
 * profile, so no real career is touched.
 *
 *     node tools/electron-probe.cjs tools/probe-flights.js "<outdir>"
 */
if (window.Sound && window.Sound.mute) window.Sound.mute(true);
const G = window.Game, Sim = window.Sim, V = window.V, AI = window.ShipAI;
G.title = null;
const out = [];
/* A system with two pirates of the same band in it. */
let pair = null;
const stars = G.galaxy.stars.slice().sort((a, b) => window.Galaxy.distance3(a, G.here) - window.Galaxy.distance3(b, G.here));
for (const st of stars.slice(0, 160)) {
  if (st.id !== G.here.id) G.enterSystem(st, { fresh: true });
  const pir = (G.sys.patrols || []).filter(p => p.kind === 'pirate' && !p.dead);
  const byBand = {};
  pir.forEach(p => { (byBand[p.faction] = byBand[p.faction] || []).push(p); });
  const band = Object.keys(byBand).find(k => byBand[k].length >= 2);
  if (band) { pair = byBand[band].slice(0, 2); break; }
}
if (!pair) return 'FAIL: no system with two pirates of one band in 160 stars';
const sys = G.sys;
out.push('system ' + sys.name + ' | band ' + pair[0].faction + ': ' + pair.map(p => p.name).join(', '));
/* Out of dock, and off the arrival rail that docks a ship entering a
 * system fresh (Sim.dockShip is that rail's last act) - and well out in
 * the open, 30 000 km above the station. */
G.ship.arrival = null; G.ship.departed = null; G.ship.padHold = null;
if (G.ship.docked) { G.ship.docked = null; G.ship.dockOffset = null; }
G.ship.landed = false; G.dockTarget = null; G.navTarget = null;
G.ship.pos = V.add(G.ship.pos, { x: 0, y: 0, z: 30000 });
G.warpIndex = 0; G.viewMode = 'cockpit'; G.panel = 0; G.ship.thrust = V.zero(); G.ship.throttle = 0;
Sim.policeNearby = () => null;
const face = (to) => {
  const f = V.norm(V.sub(to, G.ship.pos));
  const u0 = Math.abs(f.z) < 0.9 ? { x: 0, y: 0, z: 1 } : { x: 0, y: 1, z: 0 };
  const right = V.norm(V.cross(f, u0));
  G.ship.fwd = f; G.ship.right = right; G.ship.up = V.norm(V.cross(right, f));
};
const base = V.add(G.ship.pos, { x: 0, y: 0, z: 0 });
const fwd = V.norm(G.ship.fwd || { x: 1, y: 0, z: 0 });
const side = V.norm(V.cross(fwd, { x: 0, y: 0, z: 1 }));
const wake = (sp, pos) => Sim.wakeNpc(sp, { pos: pos, vel: V.clone(G.ship.vel), fwd: V.scale(fwd, -1),
                                            up: { x: 0, y: 0, z: 1 }, right: V.scale(side, -1) }, sys);
wake(pair[0], V.add(base, V.scale(fwd, 2.5)));
wake(pair[1], V.add(V.add(base, V.scale(fwd, 6)), V.scale(side, 25)));
pair.forEach(p => { p.preyAt = G.t + 3600; p.mode = 'intercept'; p.target = null; p.hostileToPlayer = false; });
face(pair[0].live.pos);
const t0 = G.t;
out.push('woke: ' + pair.map(p => p.name + ' rail ' + (p.rail && p.rail.type) + ' live ' + !!p.live + ' in patrols ' + (sys.patrols.indexOf(p) >= 0)).join('; '));
await wait(2500);
out.push('clock ' + (G.t - t0).toFixed(2) + ' s · paused ' + !!G.paused + ' · docked ' + !!G.ship.docked + ' · flightsAt ' + sys._flightsAt +
         ' · Aggression ' + !!window.Aggression + ' · dist ' + (pair[0].live ? V.dist(pair[0].live.pos, G.ship.pos).toFixed(1) : '-') + ' km' +
         ' · modes ' + pair.map(p => p.mode + '/' + (p.rail && p.rail.type) + '/' + !!p.live).join(','));
const f0 = AI.flightOf(pair[0]);
out.push('flight ' + (f0 ? f0.id + ' leader ' + f0.leader.name + ', ' + f0.members.length + ' ships' : 'none'));
await shot('flights-1-band');
/* Fire on the nearer one: Space held, down the nose. */
const target = pair[0], mate = pair[1];
const hp0 = target.hullHp === undefined ? target.hullMax : target.hullHp;
const said = new Set();
window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));
for (let i = 0; i < 12; i++) {
  await wait(250);
  if (target.live) face(target.live.pos);
  if (G.message) said.add(String(G.message.text || G.message));
}
window.dispatchEvent(new KeyboardEvent('keyup', { key: ' ' }));
for (let i = 0; i < 6; i++) { await wait(250); if (G.message) said.add(String(G.message.text || G.message)); }
await shot('flights-2-covered');
const mood = s => { const m = AI.moodOf(G, sys, s, G.t); return m.stance + ' (fear ' + m.fear.toFixed(2) + ', anger ' + m.anger.toFixed(2) + ')'; };
out.push('target hull ' + hp0 + ' -> ' + Math.round(target.hullHp) + ' | ' + mood(target));
out.push('mate hostile to you ' + !!mate.hostileToPlayer + ', mode ' + mate.mode + ', covering ' + (mate.defending ? mate.defending.name : '-') + ' | ' + mood(mate));
out.push('said: ' + Array.from(said).join(' / '));
/* Turn to look at the mate coming in. */
if (mate.live) face(mate.live.pos);
await wait(1200);
await shot('flights-3-mate');
return out.join('\n');
