/* probe-decks.js — for tools/electron-probe.cjs: decks, the lift and the
 * tram (2026-10-25). A Crawler with a crew: up out of the seat, aft to the
 * lift, ride it down to the main deck and on to the junction, ride the
 * tram aft to engineering. Then the same hull as a Carrier for the hangar,
 * with a small craft of yours berthed at the same port.
 *
 *     node tools/electron-probe.cjs tools/probe-decks.js "Claude outputs\decks-probe"
 */
const G = window.Game, Sim = window.Sim, Combat = window.Combat;
G.title = null;
let yard = null;
const stars = G.galaxy.stars.slice().sort((a, b) =>
  window.Galaxy.distance3(a, G.here) - window.Galaxy.distance3(b, G.here));
for (const st of stars.slice(0, 80)) {
  if (st.id !== G.here.id) G.enterSystem(st, { fresh: true });
  for (const y of G.sys.bodies.filter(b => b.market && Combat.isShipyard(b) && !b.surface && !b.underground)) {
    Sim.dockShip(G.ship, y, G.sys, G.t);
    G.ship.credits = 3000000;
    /* A Crawler is built to order, so for a look round she is simply
     * made one, as the Carrier is below. */
    const r = Combat.buyHull(G, 'crawler', false);
    if (!r.ok) { G.ship.hullId = 'crawler'; G.ship.dryMass = Combat.HULLS.crawler.dryMass; G.ship.turret = null; }
    yard = y; break;
  }
  if (yard) break;
}
if (!yard) return 'FAIL: no yard within 80 stars';
G.ship.crew = ['engineer', 'engineer', 'engineer', 'gunner', 'pilot'].map((role, i) => ({
  id: 'c|decks' + i, name: ['Mira Lund', 'Teo Hoyt', 'Ulla Wray', 'Rue Sable', 'Bo Grieve'][i], role, rating: 3, paidTo: G.t }));
G.panel = 0; G.viewMode = 'cockpit'; G.look.yaw = 0; G.look.pitch = 0;
await wait(1000);
await key('o');
await wait(1200);
if (!G.walk || !G.walk.plan.ship) return 'FAIL: not on a deck (' + (G.walk ? 'walk without decks' : 'no walk') + ')';
const notes = [];
const whole = G.walk.plan.ship, carMid = (whole.carZ[0] + whole.carZ[1]) / 2;
async function shot2(name) { await shot(name); notes.push(name + ' deck=' + G.walk.plan.deck + ' z=' + G.walk.z.toFixed(1) + ' near=' + (G.walk.near ? G.walk.near.kind + ':' + G.walk.near.label : '-') + ' fps=' + Math.round(G.fps)); }
/* The lobby, looking aft at the lift doors. */
const lob = whole.decks.bridge.rooms.find(r => r.kind === 'lobby');
G.walk.x = 0.3; G.walk.z = lob.z1 - 0.3; G.walk.yaw = Math.PI; G.walk.pitch = -0.05;
await wait(2000);
await shot2('decks-1-lobby');
/* In the car, at the buttons. */
async function pressFor(to) {
  const sh = G.walk.plan.ship;
  G.walk.x = -0.2; G.walk.z = (sh.carZ[0] + sh.carZ[1]) / 2; G.walk.pitch = -0.15;
  const b = G.walk.plan.items.find(it => it.kind === 'liftbtn' && it.to === to);
  G.walk.yaw = Math.atan2(b.x - G.walk.x, b.z - G.walk.z);
  await wait(400);
  return b;
}
const b1 = await pressFor('main');
await shot2('decks-2-car-buttons');
await key('e');
await wait(1500);
await shot2('decks-3-riding');
await wait(6000);
G.walk.pitch = 0;
await shot2('decks-4-main-deck');
/* On down to the junction, and the tram. */
await pressFor('junction');
await key('e');
await wait(4000);
const tramIt = G.walk.plan.items.find(it => it.kind === 'tram' && it.to === 'b');
G.walk.x = 0.4; G.walk.z = tramIt.z + 0.9; G.walk.yaw = Math.PI; G.walk.pitch = -0.1;
await wait(1500);
await shot2('decks-5-tram-platform');
G.walk.x = 0; G.walk.z = tramIt.z + 0.3; G.walk.yaw = Math.PI;
await wait(400);
await key('e');
await wait(2500);
await shot2('decks-6-on-the-tram');
await wait(5000);
G.walk.yaw = Math.PI; G.walk.pitch = -0.05;
await wait(800);
await shot2('decks-7-aft-platform');
const er = whole.rooms.find(r => r.kind === 'engine');
G.walk.x = -1.0; G.walk.z = er.z1 - 0.6; G.walk.yaw = Math.PI + 0.2;
await wait(1500);
await shot2('decks-8-engine-room');
/* The people: who is on this deck. */
const sc = window.Npc.lastScene;
const ppl = sc ? sc.people.map(p => p.name + ' ' + (p.away ? 'away' : (window.Walk.roomAt(sc.plan, p.x, p.z) || {}).kind)) : [];
/* The Carrier's hangar, with a Wren of yours berthed at the port. */
G.walk = null;
await wait(300);
G.ship.hullId = 'carrier'; G.ship.dryMass = Combat.HULLS.carrier.dryMass;
G.ship.turret = null;
G.fleet = (G.fleet || []).concat([{ id: 'fs-probe', hullId: 'wren', name: 'Little Wren', port: G.ship.docked, fit: {}, cargo: {} }]);
await wait(300);
await key('o');
await wait(1200);
if (!G.walk || !G.walk.plan.ship || !G.walk.plan.ship.decks.hangar) return 'FAIL: Carrier has no hangar deck\n' + notes.join('\n');
await pressFor('hangar');
const fb = window.Walk.facing(G.walk);
notes.push('carrier: deck=' + G.walk.plan.deck + ' near=' + (G.walk.near ? G.walk.near.kind + ':' + G.walk.near.to : '-') +
           ' facing=' + (fb ? fb.kind + ':' + fb.to : '-') + ' standable=' + window.Walk.standable(G.walk.plan, G.walk.x, G.walk.z) +
           ' room=' + ((window.Walk.roomAt(G.walk.plan, G.walk.x, G.walk.z) || {}).kind) + ' flying? viewMode=' + G.viewMode + ' panel=' + G.panel + ' paused=' + !!G.paused);
if (!G.walk.near && fb) G.walk.near = fb;
await key('e');
await wait(500);
notes.push('riding=' + !!G.walk.ride + (G.walk.ride ? ' dur=' + G.walk.ride.dur.toFixed(1) : ''));
for (let i = 0; i < 30 && G.walk.ride; i++) await wait(500);
notes.push('arrived deck=' + G.walk.plan.deck);
const wh = G.walk.plan.ship;
G.walk.x = -1.5; G.walk.z = wh.carZ[0] - 2.5; G.walk.yaw = Math.PI - 0.15; G.walk.pitch = 0.08;
await wait(2500);
await shot2('decks-9-hangar');
return notes.join('\n') + '\nPEOPLE ' + ppl.join(', ');
