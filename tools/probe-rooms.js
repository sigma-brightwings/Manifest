/* probe-rooms.js — for tools/electron-probe.cjs: the rest of the ship
 * (2026-10-25). A crewed hull with a gunner, berthed at a shipyard: the
 * turret, medbay, engine room and cargo bay on foot; then an S ship with a
 * second seat, from the pilot's seat.
 *
 *     node tools/electron-probe.cjs tools/probe-rooms.js "Claude outputs\rooms-probe"
 */
const G = window.Game, Sim = window.Sim, Combat = window.Combat, Crew = window.Crew;
G.title = null;
let yard = null, hullId = '';
const gunned = Object.keys(Combat.HULLS).filter(id => {
  const h = Combat.HULLS[id];
  return h.size !== 'S' && !h.orderOnly && !h.military && Crew.crewNeeded(id, true).gunner > 0;
});
const smalls = ['wren', 'bollard', 'fighter'];
const stars = G.galaxy.stars.slice().sort((a, b) =>
  window.Galaxy.distance3(a, G.here) - window.Galaxy.distance3(b, G.here));
for (const st of stars.slice(0, 60)) {
  if (st.id !== G.here.id) G.enterSystem(st, { fresh: true });
  for (const y of G.sys.bodies.filter(b => b.market && Combat.isShipyard(b) && !b.surface && !b.underground)) {
    Sim.dockShip(G.ship, y, G.sys, G.t);
    G.ship.credits = 3000000;
    for (const id of gunned) {
      const r = Combat.buyHull(G, id, false);
      if (r.ok) { yard = y; hullId = id; break; }
    }
    if (yard) break;
  }
  if (yard) break;
}
if (!yard) return 'FAIL: no hull with a gunner on any floor within 60 stars (tried ' + gunned.join(',') + ')';
G.ship.crew = ['engineer', 'engineer', 'gunner', 'pilot'].map((role, i) => ({
  id: 'c|rooms' + i, name: ['Mira Lund', 'Teo Hoyt', 'Rue Sable', 'Bo Grieve'][i], role, rating: 3, paidTo: G.t }));
G.panel = 0; G.viewMode = 'cockpit';
G.look.yaw = 0; G.look.pitch = 0;
await wait(1200);
await key('o');
await wait(1200);
if (!G.walk) return 'FAIL: O did not stand you up';
const p = G.walk.plan;
const room = k => p.rooms.find(r => r.kind === k);
const notes = [];
async function at(k, x, z, yaw, pitch, name) {
  G.walk.x = x; G.walk.z = z; G.walk.yaw = yaw; G.walk.pitch = pitch;
  await wait(1800);
  await shot(name);
  notes.push(name + ' near=' + (G.walk.near ? G.walk.near.kind : '-'));
}
const t = room('turret'), m = room('medbay'), e = room('engine'), c = room('cargo'), ps = room('passage');
/* The passage first, looking aft: the new doors down both walls. */
await at('passage', 0, ps.z1 - 0.4, Math.PI, -0.05, 'rooms-1-passage-aft');
if (t) {
  await at('turret', t.x1 - 0.45, t.z1 - 0.5, Math.PI + 0.35, 0.05, 'rooms-2-turret');
  const seat = p.turrets[0];
  /* Beside the gunner, looking up past her into the dome. */
  await at('turret', seat.x + 0.75, seat.z + 0.15, -Math.PI / 2, 0.95, 'rooms-3-turret-dome');
}
if (m) await at('medbay', m.x0 + 0.5, m.z1 - 0.4, Math.PI - 0.5, -0.15, 'rooms-4-medbay');
if (e) await at('engine', e.x0 + 0.45, e.z1 - 0.4, Math.PI - 0.45, -0.05, 'rooms-5-engine');
if (c) await at('cargo', 0.3, c.z1 - 0.6, Math.PI, -0.05, 'rooms-6-cargo');
const ppl = window.Npc.lastScene ? window.Npc.lastScene.people.map(q => q.name + '/' + q.role + ' ' + ((window.Walk.roomAt(p, q.x, q.z) || {}).kind || '?') + ' ' + q.act) : [];
const fps = Math.round(G.fps);

/* An S ship with a second seat, and somebody in it. */
G.walk = null;
await wait(300);
let small = '';
for (const st of stars.slice(0, 60)) {
  if (st.id !== G.here.id) G.enterSystem(st, { fresh: true });
  for (const y of G.sys.bodies.filter(b => b.market && Combat.isShipyard(b) && !b.surface && !b.underground)) {
    Sim.dockShip(G.ship, y, G.sys, G.t);
    G.ship.credits = 3000000;
    for (const id of smalls) {
      const r = Combat.buyHull(G, id, false);
      if (r.ok) { small = id; break; }
    }
    if (small) break;
  }
  if (small) break;
}
if (small) {
  const role = small === 'fighter' ? 'gunner' : 'pilot';
  G.ship.crew = [{ id: 'c|rooms-s', name: 'Ama Coyle', role, rating: 3, paidTo: G.t }];
  G.viewMode = 'cockpit';
  G.look.yaw = small === 'fighter' ? Math.PI * 0.8 : 2.0; G.look.pitch = -0.3;
  await wait(7000);
  await shot('rooms-7-' + small + '-second-seat');
  const sp2 = window.Npc.lastScene;
  notes.push('SMALL ' + (sp2 ? sp2.people.map(q => q.name + ' ' + q.x.toFixed(2) + ',' + q.z.toFixed(2) + ' ' + q.act + ' sit' + q.sit.toFixed(2) +
    ' st=' + (q.station ? q.station.kind + '@' + q.station.x.toFixed(2) + ',' + q.station.z.toFixed(2) : '-') + ' helm=' + q.helm).join('; ') : 'no scene') +
    ' plan=' + (sp2 ? sp2.plan.hullId : '?') + ' walk=' + !!G.walk);
  G.look.yaw = Math.PI * -0.92; G.look.pitch = -0.55;
  await wait(1500);
  await shot('rooms-8-' + small + '-medkit');
  G.look.yaw = 0; G.look.pitch = 0;
}
return 'hull ' + hullId + ' / small ' + (small || 'none on this floor') + ' / fps ' + fps + ' / adapter ' + (window.GLWorld.adapter || '?') +
       '\n' + notes.join('\n') + '\nPEOPLE ' + ppl.join('\n  ');
