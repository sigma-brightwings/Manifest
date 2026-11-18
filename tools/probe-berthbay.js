/* probe-berthbay.js - for tools/electron-probe.cjs (2026-11-18). Astra,
 * docked after Halloway's run: a black S-size room inside the L bay she was
 * put in. The hangar you walk is now the station's own berth (main.js
 * berthBay). This docks a Talon in the L bay and in a small one at an
 * orbital port and at a ground port, and shoots the chase view, the
 * zoomed-out cutaway, and the floor at the foot of her ramp.
 *
 *     node tools/electron-probe.cjs tools/probe-berthbay.js
 */
const G = window.Game, Sim = window.Sim;
G.title = null;
const out = [];
function findPort(pred) {
  const stars = G.galaxy.stars.slice().sort((a, b) =>
    window.Galaxy.distance3(a, G.here) - window.Galaxy.distance3(b, G.here));
  for (const st of stars.slice(0, 30)) {
    if (st.id !== G.here.id) G.enterSystem(st, { fresh: true });
    const p = G.sys.bodies.find(pred);
    if (p) return p;
  }
  return null;
}
async function at(tag, port, berth) {
  if (!port) { out.push(tag + ': none'); return; }
  if (G.walk) { await key('o'); await wait(600); }
  Sim.dockShip(G.ship, port, G.sys, G.t, berth);
  const S = window.Render.portSections(window.Render.portModelFor(port));
  const sb = S && S.sections[berth] && S.sections[berth].box;
  const room = sb ? { x0: sb.min[0], x1: sb.max[0], y0: sb.min[1], y1: sb.max[1], z0: sb.min[2], z1: sb.max[2] } : null;
  const r = port.radius || 1;
  out.push(tag + ' ' + port.name + ' berth ' + berth + ' bay ' +
    (room ? ((room.x1 - room.x0) * r * 1000).toFixed(0) + ' x ' + ((room.y1 - room.y0) * r * 1000).toFixed(0) +
            ' x ' + ((room.z1 - room.z0) * r * 1000).toFixed(0) + ' m' : 'none'));
  G.panel = 0; G.viewMode = 'orbit'; G.followShip = true; G.hangarOut = false;
  G.cam.pitch = 0.45; G.cam.yaw = 0.9; G.cam.dist = 0.06;
  await wait(4500);
  const bay = G.berthBay(), hp = G.hangarPlan();
  const hr = hp && hp.hangar && hp.rooms.find(q => q.id === hp.hangar.room);
  out.push(tag + '   measured ' + (bay ? JSON.stringify({ box: bay.box.map(v => +v.toFixed(1)), h: +bay.h.toFixed(1),
             walls: Object.fromEntries(Object.entries(bay.walls).map(([k, v]) => [k, isFinite(v) ? +v.toFixed(1) : 'open'])) }) : 'null') +
           ' | room ' + (hr ? (hr.x1 - hr.x0).toFixed(1) + ' x ' + (hr.z1 - hr.z0).toFixed(1) + ' x ' + (hr.h ?? hr.height ?? 0).toFixed(1) : 'none'));
  await shot(tag + '-1-chase');
  G.cam.dist = 3; G.cam.pitch = 0.7;
  if (!G.cutaway) await key('`');
  await wait(2500);
  await shot(tag + '-2-cutaway');
  if (G.cutaway) await key('`');
  G.viewMode = 'cockpit';
  await wait(6000);                       // the ramp comes down
  await key('o');
  await wait(1200);
  const w = G.walk;
  if (w) {
    const plan = w.plan;
    const H = plan && plan.hangar;
    const hr = H && plan.rooms.find(q => q.id === H.room);
    out.push(tag + '   hangar room ' + (hr ? (hr.x1 - hr.x0).toFixed(1) + ' x ' + (hr.z1 - hr.z0).toFixed(1) + ' x ' + (hr.h ?? hr.height ?? 0).toFixed(1) + ' m' : 'none') +
             ' on foot in ' + ((window.Walk.roomAt(plan, w.x, w.z) || {}).label || '?'));
    if (H && H.foot) { w.x = H.foot.x; w.z = H.foot.z; }
    w.yaw += Math.PI * 0.8; w.pitch = 0.05;
    await wait(1500);
    await shot(tag + '-3-on-the-floor');
  } else out.push(tag + '   could not stand up');
}
const orb = findPort(b => b.market && !b.surface && !b.underground && !b.seaPlatform);
if (orb) {
  const n = window.Gen.bayGeometry(orb).berths || 1;
  await at('orbL', orb, 0);
  await at('orbS', orb, Math.min(n - 1, 3));
}
const gnd = findPort(b => b.market && b.surface && !b.seaPlatform);
if (gnd) await at('gnd', gnd, Math.min((window.Gen.bayGeometry(gnd).berths || 1) - 1, 1));
return out.join('\n');
