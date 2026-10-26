/* probe-towers.js — for tools/electron-probe.cjs: the Capital and the
 * Carrier flown from the conning tower, at true size (2026-10-25). Sits in
 * each in open space and looks ahead, to starboard, aft and down; then
 * docks at a yard and walks the bridge deck, looking out of its side glass.
 *
 *     node tools/electron-probe.cjs tools/probe-towers.js "Claude outputs\towers-probe"
 */
const G = window.Game, Combat = window.Combat, Sim = window.Sim, R = window.Render;
G.title = null;
G.panel = 0;
const notes = [];
function make(id) {
  const h = Combat.HULLS[id];
  G.ship.hullId = id;
  ['dryMass', 'thrustKN', 'thrusterCap', 'fuelCap', 'cargoCap', 'hullMax'].forEach(k => { G.ship[k] = h[k]; });
  G.ship.hullHp = h.hullMax; G.ship._cockpit = null; G.ship.turret = null; G.ship.bornId = 'probe-' + id;
  Combat.syncLegacy(G.ship);
  if (Sim.refreshShip) Sim.refreshShip(G.ship);
}
G.ship.docked = null;
G.viewMode = 'cockpit';
for (const id of ['capital', 'carrier']) {
  make(id);
  const views = [['ahead', 0, 0], ['stbd', 1.4, -0.25], ['aft', 3.0, -0.2], ['port', -1.4, -0.25], ['down', 0, -0.9]];
  for (const [n, yaw, pitch] of views) {
    G.look.yaw = yaw; G.look.pitch = pitch;
    await wait(1200);
    await shot('tower-' + id + '-seat-' + n);
  }
  G.look.yaw = 0; G.look.pitch = 0;
  const fr = R.bridgeFrame(G.ship);
  notes.push(id + ': len ' + (R.hullLength(G.ship) * 1000) + ' m, eye ' + (G.cam.eye ? 'set' : '-') +
             ', bridge ' + ((fr.pos.x - G.ship.pos.x) * 1000).toFixed(1) + ',' + ((fr.pos.y - G.ship.pos.y) * 1000).toFixed(1) + ',' + ((fr.pos.z - G.ship.pos.z) * 1000).toFixed(1) +
             ' m from her centre, fps ' + Math.round(G.fps));
}
/* Walk: dock at a yard that takes her, get up, stand on the bridge deck. */
let yard = null;
const stars = G.galaxy.stars.slice().sort((a, b) => window.Galaxy.distance3(a, G.here) - window.Galaxy.distance3(b, G.here));
for (const st of stars.slice(0, 80)) {
  if (st.id !== G.here.id) G.enterSystem(st, { fresh: true });
  make('capital');
  for (const y of G.sys.bodies.filter(b => b.market && Combat.isShipyard(b) && !b.surface && !b.underground)) {
    if (!Sim.berthFitsHull(G.ship, y)) { notes.push('yard ' + y.id + ' too small for her'); continue; }
    Sim.dockShip(G.ship, y, G.sys, G.t); yard = y; break;
  }
  if (yard) break;
}
if (!yard) return 'FAIL: no yard that takes her\n' + notes.join('\n');
for (const id of ['capital', 'carrier']) {
  make(id);
  G.walk = null; G.viewMode = 'cockpit'; G.look.yaw = 0; G.look.pitch = 0;
  await wait(800);
  await key('o');
  await wait(1200);
  if (!G.walk || !G.walk.plan.ship) { notes.push(id + ': FAIL not walking'); continue; }
  const deck = G.walk.plan.ship.rooms.find(r => r.kind === 'bridgedeck');
  G.walk.x = 0; G.walk.z = (deck.z0 + deck.z1) / 2; G.walk.pitch = -0.1;
  for (const [n, yaw] of [['stbd', Math.PI / 2], ['aft', Math.PI], ['port', -Math.PI / 2]]) {
    G.walk.yaw = yaw;
    await wait(1500);
    await shot('tower-' + id + '-walk-' + n);
  }
  notes.push(id + ' walking: deck ' + G.walk.plan.deck + ', berthed at ' + yard.id + ', fps ' + Math.round(G.fps));
}
return notes.join('\n');
