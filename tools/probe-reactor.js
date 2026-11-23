/* probe-reactor.js — the reactor's glass and room on a Capital, a Cutter
 * and a Meridian (2026-11-23). For tools/electron-probe.cjs. */
const G = window.Game, Sim = window.Sim, Combat = window.Combat;
G.title = null;
let yard = null;
const stars = G.galaxy.stars.slice().sort((a, b) => window.Galaxy.distance3(a, G.here) - window.Galaxy.distance3(b, G.here));
for (const st of stars.slice(0, 80)) {
  if (st.id !== G.here.id) G.enterSystem(st, { fresh: true });
  for (const y of G.sys.bodies.filter(b => b.market && Combat.isShipyard(b) && !b.surface && !b.underground)) { Sim.dockShip(G.ship, y, G.sys, G.t); yard = y; break; }
  if (yard) break;
}
if (!yard) return 'FAIL: no yard';
const notes = [];
for (const hull of ['capital', 'meridian']) {
  G.walk = null;
  G.ship.hullId = hull; G.ship.dryMass = Combat.HULLS[hull].dryMass; G.ship.turret = null; G.ship._deck = null;
  G.panel = 0; G.viewMode = 'cockpit';
  await wait(800);
  await key('o');
  await wait(1500);
  const whole = G.walk.plan.ship, rx = whole.naval.reactors[0];
  const ctl = whole.rooms.find(r => r.id === rx.control), rr = whole.rooms.find(r => r.id === rx.room);
  G.walk.plan = whole.decks[ctl.deck]; G.walk.deck = ctl.deck;
  G.walk.x = (ctl.x0 + ctl.x1) / 2 + 0.4; G.walk.z = ctl.z0 + 2.2; G.walk.yaw = Math.PI; G.walk.pitch = 0.02;
  await wait(1800);
  await shot(hull + '-r1-control-glass');
  G.walk.x = rr.x1 - 0.7; G.walk.z = rr.z0 + 0.7; G.walk.yaw = -0.5; G.walk.pitch = 0.0;
  await wait(1500);
  await shot(hull + '-r2-reactor-room');
  notes.push(hull + ' ' + rx.axis + ' fps=' + Math.round(G.fps));
}
return notes.join('\n');
