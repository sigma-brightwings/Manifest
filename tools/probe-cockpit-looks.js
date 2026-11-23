/* probe-cockpit-looks.js - each hull's three candidate cockpit looks
 * (Render.HULL_LOOKS, A B C), in orbit over Mirven II with the planet in
 * the canopy, for Astra to choose from (2026-11-21).
 *
 *     node tools/electron-probe.cjs tools/probe-cockpit-looks.js "<outdir>"
 *
 * Shots are <nn>-<hull>-<A|B|C>.png. The hull is swapped by hand here:
 * this is a gallery of what each cockpit looks like, not a test of how
 * you come to be flying one.
 */
if (window.Sound && window.Sound.mute) window.Sound.mute(true);
const G = window.Game, Combat = window.Combat, Sim = window.Sim, V = window.V, R = window.Render;
G.title = null;
if (G.tutorial) { G.tutorial.done = true; G.tutorial.ended = true; }
G.panel = 0;
const s = G.ship;
s.docked = null; s.dockOffset = null; s.landed = false; G.dockTarget = null;
const world = G.sys.bodies.find(b => b.name === 'Mirven II') || G.sys.bodies.find(b => b.kind === 'planet');
const ws = Sim.bodyState(world, G.sys, G.t);
const sun = Sim.bodyPosition(G.sys.root, G.sys, G.t);
const toSun = V.norm(V.sub(sun, ws.pos));
const side = V.norm(V.cross(toSun, { x: 0, y: 0, z: 1 }));
const dir = V.norm(V.add(toSun, V.scale(side, 0.7)));
/* Low over the day side, nose 12 degrees under the horizon, wings level:
 * the limb across the lower glass and the pitch ladder on it, so every
 * instrument has something to stand against. */
function park() {
  s.pos = V.addScaled(ws.pos, dir, world.radius * 1.12);
  s.vel = V.clone(ws.vel);
  const up = dir, tan = V.norm(V.cross(up, { x: 0, y: 0, z: 1 }));
  const a = 12 * Math.PI / 180;
  s.fwd = V.norm(V.add(V.scale(tan, Math.cos(a)), V.scale(up, -Math.sin(a))));
  s.right = V.norm(V.cross(s.fwd, up)); s.up = V.cross(s.right, s.fwd);
}
G.paused = true;
/* A subset, for a quick look: PROBE_HULLS=dart,mule in the environment
 * (electron-probe passes it through as window.PROBE_HULLS when it can). */
const only = (window.PROBE_HULLS || (typeof process !== 'undefined' && process.env && process.env.PROBE_HULLS) || '').split(',').filter(Boolean);
const ids = Object.keys(Combat.HULLS).filter(id => !Combat.HULLS[id].hidden && (!only.length || only.includes(id)));
const out = [];
for (const id of ids) {
  const h = Combat.HULLS[id];
  s.hullId = id;
  ['dryMass', 'thrustKN', 'thrusterCap', 'fuelCap', 'cargoCap', 'hullMax'].forEach(k => { if (h[k] !== undefined) s[k] = h[k]; });
  s.hullHp = h.hullMax;
  s._cockpit = null;
  s.bornId = 'probe-' + id;
  try { Combat.syncLegacy(s); if (Sim.refreshShip) Sim.refreshShip(s); } catch (e) { out.push(id + ' (setup threw: ' + e.message + ')'); continue; }
  park();
  /* Something for each role panel to read: a little in the hold, a port
   * locked on NAV to price it at, and a party aboard for the liners. */
  const cap = s.cargoCap || 0;
  s.cargo = cap ? { grain: Math.min(12, Math.floor(cap / 3)), ores: Math.min(6, Math.floor(cap / 4)) } : {};
  /* What it cost: the grain dear (a loss at Halden), the ore cheap (a
   * gain), so the trade panel's colours have both ends to show. */
  s.cargoCost = cap ? { grain: { cr: s.cargo.grain * 140, t: s.cargo.grain },
                        ores: { cr: s.cargo.ores * 30, t: s.cargo.ores } } : null;
  const mkt = G.sys.bodies.find(b => b.market && b.name === 'Halden Dock') || G.sys.bodies.find(b => b.market);
  if (mkt) G.navTarget = { kind: 'body', id: mkt.id };
  G.missions = (G.missions || []).filter(m => !m._probe);
  if ((R.HULL_ROLE || {})[id] === 'passage') {
    G.missions.push({ _probe: true, type: 'passage', souls: 4, toName: mkt ? mkt.name : 'a port', pay: 1240, deadline: G.t + 30 * 3600 });
  }
  G.viewMode = 'cockpit';
  const n = (R.HULL_LOOKS[id] || []).length || 1;
  for (let i = 0; i < n; i++) {
    const t = {}; t[id] = i; R.setLookTry(t);
    /* The big hulls draw slowly on their first frames (the room is built
     * then), and a shot taken before a fresh frame shows a stale one. */
    await wait(i === 0 ? 2600 : 1500);
    await shot(String(ids.indexOf(id) + 1).padStart(2, '0') + '-' + id + '-' + 'ABC'[i]);
  }
  out.push(id + ' x' + n);
}
R.setLookTry(null);
return out.join(' | ');
