/* probe-dialogue.js — for tools/electron-probe.cjs: talking to people on a
 * station deck (2026-10-25). Berths at a market port, steps out through the
 * lock, walks up to the bartender and buys a round, asks the talk; then the
 * port's law, and a hand in the crew hall.
 *
 *     node tools/electron-probe.cjs tools/probe-dialogue.js "Claude outputs\dialogue-probe"
 */
const G = window.Game, Sim = window.Sim, Combat = window.Combat, D = window.Dialogue;
G.title = null;
if (!D) return 'FAIL: dialogue.js is not loaded';
let port = null;
const stars = G.galaxy.stars.slice().sort((a, b) => window.Galaxy.distance3(a, G.here) - window.Galaxy.distance3(b, G.here));
for (const st of stars.slice(0, 40)) {
  if (st.id !== G.here.id) G.enterSystem(st, { fresh: true });
  const y = G.sys.bodies.find(b => b.market && Combat.isShipyard(b) && !b.surface && !b.underground);
  if (y) { Sim.dockShip(G.ship, y, G.sys, G.t); port = y; break; }
}
if (!port) return 'FAIL: no yard';
G.ship.credits = 50000;
G.panel = 0; G.viewMode = 'cockpit';
await wait(1000);
await key('o');
await wait(1200);
const p = G.walk.plan;
const hatch = p.items.find(it => it.kind === 'hatch');
G.walk.x = hatch.x + 0.5; G.walk.z = hatch.z; G.walk.yaw = -Math.PI / 2;
await wait(400);
await key('e');
await wait(2000);
if (!G.walk || G.walk.ship) return 'FAIL: not on the station deck';
const notes = [];
async function talkTo(pred, tag) {
  const sc = window.Npc.lastScene;
  const who = sc && sc.people.find(pred);
  if (!who) { notes.push(tag + ': nobody'); return null; }
  G.walk.x = who.x + Math.sin(who.yaw) * 1.1; G.walk.z = who.z + Math.cos(who.yaw) * 1.1;
  G.walk.yaw = Math.atan2(who.x - G.walk.x, who.z - G.walk.z); G.walk.pitch = -0.05;
  await wait(400);
  if (!(G.walk.near && G.walk.near.kind === 'npc')) {
    /* Facing them, but E may find a counter first: open directly. */
    G.walk.near = { kind: 'npc', npc: who, label: 'Talk to ' + who.name, x: who.x, z: who.z };
  }
  await key('e');
  await wait(800);
  notes.push(tag + ': ' + (G.talk ? G.talk.st.speaker + ' [' + G.talk.st.band + '] "' + G.talk.st.line + '"' : 'no conversation') +
             '   locked=' + (document.pointerLockElement === document.getElementById('view')));
  return who;
}
async function pick(id, tag) {
  if (!G.talk) return;
  const opts = D.options(G, G.sys, port, G.talk.st);
  const ix = opts.findIndex(o => o.id === id);
  if (ix < 0) { notes.push('  (' + id + ' not offered: ' + opts.map(o => o.id).join(',') + ')'); return; }
  await key(String(ix + 1));
  await wait(600);
  notes.push('  ' + tag + ' → "' + (G.talk ? G.talk.st.line : '(closed)') + '"');
}
await talkTo(q => D.kindOf(q) === 'bartender', 'bartender');
await shot('talk-1-bartender');
await pick('round', 'round');
await pick('talk', 'talk');
await shot('talk-2-the-talk');
await pick('inport', 'in port');
await key('Escape');
await wait(300);
await talkTo(q => ['customs', 'security', 'marine'].indexOf(D.kindOf(q)) >= 0, 'the law');
await shot('talk-3-the-law');
const law = G.talk;
if (law && law.st.node !== 'business') await pick('business', 'business');
await pick('claim-medical', 'claim medical');
await shot('talk-4-caught');
await key('Escape');
await wait(300);
await talkTo(q => D.kindOf(q) === 'hire', 'hand for hire');
await pick('terms', 'terms');
await pick('haggle', 'haggle');
await shot('talk-5-hire');
await key('Escape');
notes.push('record lies: ' + ((window.Captains.recordOf(G) || {}).lies || 0) + ', people remembered: ' + Object.keys(G.people || {}).length);
return notes.join('\n');
