/* probe-approach.js - somebody comes over (2026-11-18). On the deck at
 * Threshold in the concourse, with a bounty and some wine in the hold,
 * brings the visit's approach forward (G.approachNow) and shoots the person
 * walking up and the moment they speak.
 *
 *     node tools/electron-probe.cjs tools/probe-approach.js
 */
const G = window.Game, Sim = window.Sim;
G.title = null;
const port = G.sys.bodies.find(b => /Threshold/.test(b.name || '')) || G.sys.bodies.find(b => b.market && !b.surface);
Sim.dockShip(G.ship, port, G.sys, G.t);
G.panel = 0; G.viewMode = 'cockpit';
await wait(1200);
G.wanted = G.wanted || {}; G.wanted[G.here.factionId] = 450;
G.ship.cargo = G.ship.cargo || {}; G.ship.cargo.wine = 4;
G.startWalk(true);
await wait(1500);
if (!G.walk || G.walk.ship) return 'FAIL: not on the deck';
const cc = G.walk.plan.rooms.find(r => r.kind === 'concourse');
G.walk.x = (cc.x0 + cc.x1) / 2 + 3; G.walk.z = (cc.z0 + cc.z1) / 2; G.walk.yaw = -Math.PI / 2; G.walk.pitch = 0;
await wait(2500);
G.message = null; G.messageUntil = 0;
G.approachNow();
const out = [];
let said = null, shotWalk = false;
for (let i = 0; i < 160 && !said; i++) {
  await wait(250);
  if (G.message && / comes over:/.test(G.message)) said = G.message;
  const sc = G.npcSceneNow();
  const walking = sc && sc.people.find(p => p.task && p.task.hold === 14 && p.act === 'walk');
  if (walking && !shotWalk && i > 6) {
    G.walk.yaw = Math.atan2(walking.x - G.walk.x, walking.z - G.walk.z);
    out.push('walking over: ' + walking.name + ' (' + walking.role + ') ' + Math.hypot(walking.x - G.walk.x, walking.z - G.walk.z).toFixed(1) + ' m');
    await wait(300); await shot('approach-walking'); shotWalk = true;
  }
}
if (said) {
  const sc = G.npcSceneNow(), p = sc.people.filter(q => q.task && q.task.hold === 14)[0];
  if (p) G.walk.yaw = Math.atan2(p.x - G.walk.x, p.z - G.walk.z);
  await wait(400); await shot('approach-speaks');
}
out.push('said: ' + (said || 'NOTHING'));
return out.join('\n');
