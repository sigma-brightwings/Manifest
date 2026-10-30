/* Playtest helpers for the ramp (2026-10-26). Load with:
 *   await import('/Claude outputs/ramp/probe-ramp.js?' + Date.now())  -- or a script tag */
window.__probe = function (hull, opts) {
  opts = opts || {};
  const G = window.Game; G.title = null; G.menu = null;
  const s = G.ship;
  if (hull && hull !== s.hullId) { const H = Combat.HULLS[hull]; s.hullId = hull; s.bornId = hull + '-probe'; s.dryMass = H.dryMass; s._cockpit = null; }
  const bodies = G.sys.bodies.filter(b => b.kind === 'planet' || b.kind === 'moon');
  const w = opts.airless ? (bodies.find(b => !Airlock.breathable(b) && b.type === 'rocky') || bodies[0]) : (bodies.find(b => Airlock.breathable(b)) || bodies[0]);
  const bp = Sim.bodyPosition(w, G.sys, G.t), n = V.norm({ x: 0.3, y: 0.9, z: 0.2 });
  G.walk = null; s.airlock = null;
  s.docked = null; s.landed = true; s.landedOn = w; s.crashed = false; s.gear = true; s.gearTravel = 1; s.settled = false;
  s.pos = V.add(bp, V.scale(n, w.radius)); s.vel = Sim.bodyVelocity(w, G.sys, G.t);
  G.autodock = null; G.dockTarget = null; G.viewMode = 'cockpit';
  for (let i = 0; i < 4; i++) G.step(0.05);
  if (opts.stopAtLanding) return { hull: s.hullId, world: w.name };
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'o', bubbles: true })); G.step(0.05);
  window.dispatchEvent(new KeyboardEvent('keyup', { key: 'o', bubbles: true }));
  const d = Render.shipInterior(s), p = d.plan.decks ? d.plan.decks.main : d.plan, rp = d.plan.ramp;
  const hatch = p.items.find(it => it.kind === 'hatch');
  G.walk.plan = p; G.walk.x = hatch.x + 0.7; G.walk.z = hatch.z; G.walk.yaw = -Math.PI / 2; G.walk.pitch = 0;
  G.step(0.05);
  if (opts.stopAtPanel) return { hull: s.hullId, near: G.walk.near && G.walk.near.label };
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'e', bubbles: true })); G.step(0.05);
  window.dispatchEvent(new KeyboardEvent('keyup', { key: 'e', bubbles: true }));
  for (let i = 0; i < 220; i++) G.step(0.05);
  G.walk.x = rp.xc; G.walk.z = rp.hinge + 0.7; G.walk.yaw = Math.PI; G.walk.pitch = -0.05;
  if (rp.mode === 'lift') {
    /* ride it: onto the raised platform, lower it with the ramp item */
    G.ship.airlock.want = 0; for (let i = 0; i < 120; i++) G.step(0.05);
    G.walk.z = (rp.hinge + rp.foot) / 2; G.step(0.05);
    Airlock.request(G.ship, 'lower', { landed: true });
    for (let i = 0; i < 120; i++) G.step(0.05);
    G.walk.yaw = Math.PI; G.keys.w = true;
    for (let i = 0; i < 300; i++) { G.step(1 / 30); if (G.walk.outside && G.walk.z < G.walk.plan.footZ - 6) break; }
    G.keys.w = false;
  } else if (!opts.stopAtTop) {
    G.keys.w = true;
    for (let i = 0; i < 500; i++) { G.step(1 / 30); if (G.walk.outside && G.walk.z < G.walk.plan.footZ - (opts.far || 6)) break; }
    G.keys.w = false;
  }
  return { hull: s.hullId, mode: rp.mode, outside: !!G.walk.outside, a: JSON.stringify(s.airlock), z: G.walk.z.toFixed(1), dy: (G.walk.dy || 0).toFixed(2) };
};
window.__look = function (dyaw, pitch) { const G = window.Game; G.walk.yaw += dyaw; G.walk.pitch = pitch; for (let i = 0; i < 3; i++) G.step(0.05); return 'ok'; };
window.__walk = function (secs, yawAbs) { const G = window.Game; if (yawAbs !== undefined) G.walk.yaw = yawAbs; G.keys.w = true; for (let i = 0; i < secs * 30; i++) G.step(1 / 30); G.keys.w = false; return { x: G.walk.x, z: G.walk.z, outside: G.walk.outside, dy: G.walk.dy }; };
'probe loaded';
