/* probe-npc.js â€” for tools/electron-probe.cjs: the people (2026-10-25).
 * A Kestrel with a crew of four, berthed at a shipyard: the bridge deck from
 * the seat, on foot on the bridge deck and in the quarters, then out onto
 * the station deck â€” spine, concourse, bar and crew hall.
 *
 *     node tools/electron-probe.cjs tools/probe-npc.js
 */
const G = window.Game, Sim = window.Sim, Combat = window.Combat, Crew = window.Crew;
G.title = null;
let yard = null, bought = null, hullId = '';
/* A crewed hull â€” one with stations on its bridge â€” that some nearby yard
 * has on the floor today. */
const crewed = Object.keys(Combat.HULLS).filter(id => {
  const h = Combat.HULLS[id];
  return h.size !== 'S' && !h.orderOnly && !h.military && Crew.crewNeeded(id, true).total > 0;
});
const stars = G.galaxy.stars.slice().sort((a, b) =>
  window.Galaxy.distance3(a, G.here) - window.Galaxy.distance3(b, G.here));
for (const st of stars.slice(0, 60)) {
  if (st.id !== G.here.id) G.enterSystem(st, { fresh: true });
  for (const y of G.sys.bodies.filter(b => b.market && Combat.isShipyard(b) && !b.surface && !b.underground)) {
    Sim.dockShip(G.ship, y, G.sys, G.t);
    G.ship.credits = 2000000;
    for (const id of crewed) {
      const r = Combat.buyHull(G, id, false);
      if (r.ok) { yard = y; bought = r; hullId = id; break; }
    }
    if (yard) break;
  }
  if (yard) break;
}
if (!yard) return 'FAIL: no crewed hull on any floor within 60 stars (tried ' + crewed.join(',') + ')';
/* Four hands: two engineers, a gunner and a pilot, from this port's hall
 * where it has them and made up where it does not. */
const hall = Crew.forHire(yard, G.t);
const want = ['engineer', 'engineer', 'gunner', 'pilot'];
G.ship.crew = want.map((role, i) => {
  const c = hall.find(h => h.role === role && !h._used);
  if (c) { c._used = true; return Object.assign({}, c, { paidTo: G.t }); }
  return { id: 'c|probe' + i, name: ['Mira Lund', 'Teo Hoyt', 'Rue Sable', 'Bo Grieve'][i], role, rating: 3, paidTo: G.t };
});
G.panel = 0; G.viewMode = 'cockpit';
G.look.yaw = 0; G.look.pitch = 0;
await wait(1500);
await shot('npc-1-seat-forward');
G.look.yaw = Math.PI * 0.85;
await wait(1500);
await shot('npc-2-seat-looking-aft');
G.look.yaw = 0;
await key('o');
await wait(1200);
if (!G.walk) return 'FAIL: O did not stand you up';
const p = G.walk.plan;
const deck = p.rooms.find(r => r.kind === 'bridgedeck');
if (deck) {
  G.walk.x = 0; G.walk.z = deck.z1 - 0.3; G.walk.yaw = Math.PI; G.walk.pitch = -0.1;
  await wait(2500);
  await shot('npc-3-bridge-deck-aft');
  G.walk.yaw = -Math.PI / 2;
  await wait(800);
  await shot('npc-4-bridge-deck-port');
  G.walk.yaw = Math.PI / 2;
  await wait(800);
  await shot('npc-5-bridge-deck-starboard');
}
const q = p.rooms.find(r => r.kind === 'quarters');
if (q) {
  G.walk.x = (q.x0 + q.x1) / 2 + 0.3; G.walk.z = q.z1 - 0.5; G.walk.yaw = Math.PI; G.walk.pitch = -0.15;
  await wait(1500);
  await shot('npc-6-quarters');
}
/* Out through the lock onto the station deck. */
const lock = p.rooms.find(r => r.kind === 'airlock');
const hatch = p.items.find(it => it.kind === 'hatch');
G.walk.x = hatch.x + 0.5; G.walk.z = hatch.z; G.walk.yaw = -Math.PI / 2; G.walk.pitch = 0;
await wait(400);
await key('e');
await wait(1500);
if (!G.walk || G.walk.ship) return 'FAIL: the hatch did not step out (walk ' + !!G.walk + ')';
const sp = G.walk.plan;
await wait(1500);
await shot('npc-7-own-berth');
const spine = sp.rooms.find(r => r.id === 'spine');
G.walk.x = 0; G.walk.z = 1.5; G.walk.yaw = 0; G.walk.pitch = 0;
await wait(2500);
await shot('npc-8-spine');
G.walk.x = 0; G.walk.z = spine.z1 + 2.5; G.walk.yaw = 0;
await wait(3000);
await shot('npc-9-concourse');
const fps = Math.round(G.fps);
const bar = sp.rooms.find(r => r.id === 'bar');
G.walk.x = bar.x1 - 1.5; G.walk.z = (bar.z0 + bar.z1) / 2; G.walk.yaw = -Math.PI / 2;
await wait(2500);
await shot('npc-10-bar');
const hallR = sp.rooms.find(r => r.id === 'crewhall');
G.walk.x = hallR.x0 + 1.2; G.walk.z = (hallR.z0 + hallR.z1) / 2; G.walk.yaw = Math.PI / 2;
await wait(2500);
await shot('npc-11-crew-hall');
const ppl = window.Npc.lastScene ? window.Npc.lastScene.people.map(p => p.name + '/' + p.role + '/' + p.body + '/' + p.liv + (p.shipName ? '@' + p.shipName : '') + ' in ' + ((window.Walk.roomAt(sp, p.x, p.z) || {}).id || '?')) : [];
/* Talk to whoever is in front. */
let said = '';
if (G.walk.near && G.walk.near.kind === 'npc') { await key('e'); await wait(300); said = G.message || ''; }
if (!said && window.Npc.lastScene) {
  /* Walk up to the nearest person and face them. */
  const who = window.Npc.lastScene.people.slice().sort((a, b) => Math.hypot(a.x - G.walk.x, a.z - G.walk.z) - Math.hypot(b.x - G.walk.x, b.z - G.walk.z))[0];
  if (who) {
    G.walk.x = who.x - Math.sin(who.yaw) * -1.1; G.walk.z = who.z - Math.cos(who.yaw) * -1.1;
    G.walk.yaw = Math.atan2(who.x - G.walk.x, who.z - G.walk.z); G.walk.pitch = 0.05;
    await wait(200);
    await shot('npc-12-face-to-face');
    if (G.walk.near && G.walk.near.kind === 'npc') { await key('e'); await wait(300); said = G.message || ''; }
  }
}
return 'hull ' + hullId + ' / yard ' + yard.name + ' / livery ' + yard.livery + ' / crew ' + G.ship.crew.map(c => c.name + '/' + c.role).join(', ') +
       ' / concourse fps ' + fps + ' / adapter ' + (window.GLWorld.adapter || '?') + ' / said: ' + said + '\nPEOPLE ' + ppl.join('\n  ');
