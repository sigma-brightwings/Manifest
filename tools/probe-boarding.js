/* probe-boarding.js — for tools/electron-probe.cjs: boarding another ship at a
 * station (2026-10-28). Docks where ships are moored, steps out onto the deck,
 * finds a moored ship's hatch and boards her, cycles her airlock, looks at her
 * crew, talks to her master and one hand, reads her hold, and walks back off.
 * Muted.
 *
 *     node tools/electron-probe.cjs tools/probe-boarding.js "Claude outputs\boarding-probe"
 */
if (window.Sound && window.Sound.mute) window.Sound.mute(true);
const G = window.Game, Sim = window.Sim, Combat = window.Combat, D = window.Dialogue;
G.title = null;
let port = null;
const stars = G.galaxy.stars.slice().sort((a, b) => window.Galaxy.distance3(a, G.here) - window.Galaxy.distance3(b, G.here));
for (const st of stars.slice(0, 40)) {
  if (st.id !== G.here.id) G.enterSystem(st, { fresh: true });
  const y = G.sys.bodies.find(b => b.market && !b.surface && !b.underground && Sim.berthOccupants(b, G.sys, G.t).length >= 2);
  if (y) { Sim.dockShip(G.ship, y, G.sys, G.t); port = y; break; }
}
if (!port) return 'FAIL: no port with ships moored';
G.ship.credits = 50000;
G.panel = 0; G.viewMode = 'cockpit';
const notes = ['port ' + port.name + ', moored: ' + Sim.berthOccupants(port, G.sys, G.t).map(o => o.name + ' (' + (o.route.cls || '?') + ')').join(', ')];
await wait(1000);
await key('o');
await wait(1200);
/* Out through your own airlock (2026-10-26): cycle out, open the hatch,
 * step down into the berth. Your rooms may be on two decks. */
async function lockOut() {
  const pl = G.walk.plan.ship && G.walk.plan.ship.decks ? G.walk.plan.ship.decks.main : G.walk.plan;
  if (pl !== G.walk.plan) { G.walk.plan = pl; }
  const ctl = pl.items.find(it => it.kind === 'hatch'), ramp = pl.items.find(it => it.kind === 'ramp');
  if (!ctl || !ramp) return 'no hatch/ramp';
  G.walk.x = ctl.x; G.walk.z = ctl.z; G.walk.near = ctl;
  await key('e'); await wait(6000);
  G.walk.x = ramp.x; G.walk.z = ramp.z; G.walk.near = ramp;
  await key('e'); await wait(400);
  if (G.walk && G.walk.ship) { G.walk.near = ramp; await key('e'); await wait(1500); }
  return 'ok';
}
notes.push('own lock: ' + await lockOut());
if (!G.walk || G.walk.ship) return 'FAIL: not on the station deck\n' + notes.join('\n');
const hatches = G.walk.plan.items.filter(it => it.kind === 'other');
notes.push('hatches on the deck: ' + hatches.map(h => h.label).join(' | '));
if (!hatches.length) return 'FAIL: no other hatches\n' + notes.join('\n');
/* The biggest of them, for the most crew and a hold to look in. */
const SZ = { S: 0, M: 1, L: 2, XL: 3 };
const h = hatches.slice().sort((a, b) => (SZ[b.other.size] || 0) - (SZ[a.other.size] || 0))[0];
const br = G.walk.plan.rooms.find(r => r.id === h.berth);
G.walk.x = h.x + (br.side < 0 ? 1.0 : -1.0); G.walk.z = h.z; G.walk.yaw = br.side < 0 ? -Math.PI / 2 : Math.PI / 2;
await wait(500);
await shot('1-berth-hatch');
notes.push('near: ' + (G.walk.near ? G.walk.near.label : 'nothing'));
/* Her hand working the berth stands by the hatch and E finds them first;
 * the probe is here for the hatch. */
G.walk.near = h;
await key('e');
await wait(1500);
notes.push('aboard: ' + !!G.aboard + ' ' + (G.aboard ? G.aboard.ship.shipName + ' as ' + G.aboard.ship.hullId : '') + ', walking her: ' + !!(G.walk && G.walk.ship) + '  (said: ' + G.message + ')');
await shot('2-her-airlock');
/* Cycle in: the controls by the inner door. */
const lock = G.walk.plan.items.find(it => it.kind === 'hatch');
if (lock) {
  G.walk.x = lock.x; G.walk.z = lock.z - 0.6; G.walk.yaw = 0;
  await wait(300);
  G.walk.near = lock;
  await key('e');
  await wait(6500);
  notes.push('her airlock: ' + JSON.stringify(G.aboard && G.aboard.ship.airlock));
}
const sc = window.Npc.lastScene;
notes.push('scene: ' + (sc ? (sc.visit ? 'visit' : sc.kind) + ', ' + sc.people.map(p => p.name + ' ' + p.role + (p.master ? ' (master)' : '') + (p.guard ? ' @' + p.guard : '') + (p.station ? ' @station' : '') + (p.turret ? ' @turret' : '')).join('; ') : 'none'));
/* Into the passage and look forward. */
const pass = (G.walk.plan.rooms || []).find(r => r.kind === 'passage');
if (pass) { G.walk.x = (pass.x0 + pass.x1) / 2; G.walk.z = (pass.z0 + pass.z1) / 2; G.walk.yaw = 0; }
await wait(1500);
await shot('3-her-passage');
async function talkTo(pred, tag) {
  const s2 = window.Npc.lastScene;
  const who = s2 && s2.people.find(pred);
  if (!who) { notes.push(tag + ': nobody'); return null; }
  if (who.away) notes.push(tag + ' is on another deck');
  G.walk.x = who.x + Math.sin(who.yaw) * 1.0; G.walk.z = who.z + Math.cos(who.yaw) * 1.0;
  G.walk.yaw = Math.atan2(who.x - G.walk.x, who.z - G.walk.z); G.walk.pitch = -0.05;
  await wait(400);
  G.walk.near = { kind: 'npc', npc: who, label: 'Talk to ' + who.name, x: who.x, z: who.z };
  await key('e');
  await wait(700);
  notes.push(tag + ': ' + (G.talk ? G.talk.st.speaker + ' [' + G.talk.st.band + '] "' + G.talk.st.line + '"' : 'no conversation'));
  if (G.talk) notes.push('  offered: ' + D.options(G, G.sys, port, G.talk.st).map(o => o.label + (o.ok ? '' : ' (' + o.why + ')')).join(' | '));
  return who;
}
await talkTo(p => p.master, 'master');
await shot('4-talk-master');
if (G.talk) {
  const opts = D.options(G, G.sys, port, G.talk.st), ix = opts.findIndex(o => o.id === 'deal');
  if (ix >= 0 && opts[ix].ok) {
    await key(String(ix + 1));
    await wait(800);
    notes.push('  deal -> panel ' + G.panel + ', shipDeal ' + JSON.stringify(G.shipDeal));
    await shot('5-her-books');
    G.shipDeal = null; G.panel = 0;
  }
}
G.talk = null;
await wait(300);
const hand = await talkTo(p => !p.master && (p.role === 'engineer' || p.role === 'pilot' || p.role === 'gunner'), 'hand');
await shot('6-talk-hand');
if (G.talk && hand) {
  const before = (G.ship.crew || []).length, credits = G.ship.credits;
  const opts = D.options(G, G.sys, port, G.talk.st), ix = opts.findIndex(o => o.id === 'recruit');
  if (ix >= 0 && opts[ix].ok) {
    await key(String(ix + 1));
    await wait(800);
    const sc3 = window.Npc.lastScene;
    notes.push('  recruit: "' + (G.talk ? G.talk.st.line : '') + '"  crew ' + before + ' -> ' + (G.ship.crew || []).length +
               ', paid ' + (credits - G.ship.credits) + ' cr, still on her deck: ' + !!(sc3 && sc3.people.find(p => p.id === hand.id)));
  } else notes.push('  recruit not open: ' + (ix >= 0 ? opts[ix].why : 'not offered'));
}
G.talk = null;
/* Her hold. */
const cargo = G.walk.plan.items.find(it => it.kind === 'cargo') ||
  (G.walk.plan.ship && G.walk.plan.ship.items || []).find(it => it.kind === 'cargo');
if (cargo) {
  const room = (G.walk.plan.rooms || []).find(r => r.kind === 'cargo');
  if (room) { G.walk.x = (room.x0 + room.x1) / 2; G.walk.z = room.z1 - 0.8; G.walk.yaw = Math.PI; G.walk.pitch = -0.15; await wait(800); await shot('6b-her-hold'); }
  G.walk.near = cargo;
  await key('e');
  await wait(300);
  notes.push('hold: ' + G.message);
} else notes.push('hold: no cargo item on this deck');
/* And back off her, through her airlock. */
const lock2 = G.walk.plan.items.find(it => it.kind === 'hatch');
if (lock2) {
  G.walk.x = lock2.x; G.walk.z = lock2.z + 0.6;
  G.walk.near = lock2;
  await key('e');
  await wait(6500);
  const ramp = G.walk.plan.items.find(it => it.kind === 'ramp');
  if (ramp) {
    G.walk.near = ramp;
    await key('e');
    await wait(500);
    if (G.walk && G.walk.ship) { G.walk.near = ramp; await key('e'); await wait(1200); }
  }
}
notes.push('after leaving: aboard ' + !!G.aboard + ', on the station deck ' + !!(G.walk && !G.walk.ship) +
           ', at x ' + (G.walk ? G.walk.x.toFixed(1) + ' z ' + G.walk.z.toFixed(1) : '-'));
await shot('7-back-on-deck');
return notes.join('\n') + '\nfps ' + Math.round(G.fps);
