/* probe-lanes.js - ships on the lanes and in the outer system, in the real
 * shell (2026-11-22, generate.js buildLanes / buildWorkers, Sim.updateLanes).
 *
 * Puts you out on the starting system's busiest lane, mid-crossing, flying
 * with the stream, and counts what the scope and the sky show; then beside
 * a prospector at work in a field, and a skimmer at a giant. Records the
 * frame rate in each.
 *
 * Set directly, and said so: your ship out of dock and placed (on the lane,
 * then beside each worker), matched to the hull beside you. Nothing else
 * is touched; the lane hulls are found by the game's own updateLanes on
 * its own clock. Scratch profile.
 *
 *     node tools/electron-probe.cjs tools/probe-lanes.js "<outdir>"
 */
if (window.Sound && window.Sound.mute) window.Sound.mute(true);
const G = window.Game, Sim = window.Sim, V = window.V;
G.title = null;
const out = [];
G.ship.arrival = null; G.ship.departed = null; G.ship.padHold = null;
if (G.ship.docked) { G.ship.docked = null; G.ship.dockOffset = null; }
G.ship.landed = false; G.dockTarget = null; G.navTarget = null;
G.warpIndex = 0; G.viewMode = 'cockpit'; G.panel = 0; G.ship.thrust = V.zero(); G.ship.throttle = 0;
const sys = G.sys;
const face = (to) => {
  const f = V.norm(V.sub(to, G.ship.pos));
  const u0 = Math.abs(f.z) < 0.9 ? { x: 0, y: 0, z: 1 } : { x: 0, y: 1, z: 0 };
  const right = V.norm(V.cross(f, u0));
  G.ship.fwd = f; G.ship.right = right; G.ship.up = V.norm(V.cross(right, f));
};
const fps = async () => { await wait(2000); return Math.round(G.fps || 0); };
const count = (R) => Sim.trafficAll(sys, G.t).filter(s => V.dist(s.pos, G.ship.pos) < R);
out.push('system ' + sys.name + ' | lanes ' + (sys.lanes || []).length + ' (' + (sys.lanes || []).filter(l => l.busy).length +
         ' busy) | workers ' + (sys.workers || []).length + ': ' +
         Object.entries((sys.workers || []).reduce((a, w) => (a[w.work] = (a[w.work] || 0) + 1, a), {})).map(e => e.join(' ')).join(', '));
/* The busiest lane: a stream hull mid-crossing, and you beside her. */
const lane = (sys.lanes || [])[0];
if (!lane) return out.join('\n');
const tpl = Sim.laneTemplate(sys, lane);
let mark = null;
for (let k = 1; k <= lane.n && !mark; k++) {
  const r = Sim.laneRoute(sys, lane, k), st = Sim.trafficCore(r, sys, G.t);
  if (st.phase === 'cruise' && st.progress > 0.35 && st.progress < 0.65) mark = { r, st };
}
if (!mark) { out.push('no hull mid-crossing on ' + lane.id); return out.join('\n'); }
out.push('lane ' + lane.id + ': ' + tpl.name + ' route, ' + sys.byId[tpl.from].name + ' <-> ' + sys.byId[tpl.to].name +
         ', ' + lane.n + ' hulls | beside ' + mark.r.name + ' (' + mark.r.className + ') at ' + (mark.st.progress * 100).toFixed(0) + '%');
const R1 = (Sim.LANE_SHOW_KM || 2e7);
const before = (() => { const keep = sys.lanes; sys.lanes = []; sys._laneShown = null; sys._traffic = null;
  G.ship.pos = V.add(mark.st.pos, { x: 0, y: 600, z: 40 });
  const n1 = count(1e6).length, nR = count(R1).length; sys.lanes = keep; return { n1, nR }; })();
for (let i = 0; i < 12; i++) {
  const st = Sim.trafficCore(mark.r, sys, G.t);
  G.ship.pos = V.add(st.pos, { x: 0, y: 600, z: 40 }); G.ship.vel = V.clone(st.vel);
  face(V.add(st.pos, V.scale(V.norm(st.vel), 5e5)));
  await wait(250);
}
const after1 = count(1e6).length, afterR = count(R1).length;
const shown = (sys._laneShown || []).length;
out.push('within 1M km: ' + before.n1 + ' without lanes -> ' + after1 + ' | within ' + (R1 / 1e6) + 'M km: ' + before.nR + ' -> ' + afterR +
         ' | lane hulls shown ' + shown);
out.push('fps on the lane: ' + await fps());
await shot('lanes-1-cockpit');
/* And looking at the nearest lane hull that is not the one beside you. */
const nb = Sim.trafficAll(sys, G.t).filter(s => s.route.stream && s.route !== mark.r)
  .sort((a, b) => V.dist(a.pos, G.ship.pos) - V.dist(b.pos, G.ship.pos))[0];
if (nb) {
  face(nb.pos);
  out.push('nearest other lane hull: ' + nb.name + ' (' + nb.className + ') ' + Math.round(V.dist(nb.pos, G.ship.pos)).toLocaleString() + ' km');
  await wait(500);
  await shot('lanes-2-next');
}
/* Out to the workers. */
const worker = (kind) => {
  const w = (sys.workers || []).find(x => x.work === kind);
  if (!w) return null;
  const st = Sim.trafficState(w, sys, G.t);
  return { w, st };
};
for (const kind of ['field', 'skim', 'ice', 'survey']) {
  const x = worker(kind);
  if (!x) { out.push(kind + ': none in this system'); continue; }
  for (let i = 0; i < 8; i++) {
    const st = Sim.trafficState(x.w, sys, G.t);
    G.ship.pos = V.add(st.pos, { x: 0, y: 3, z: 0.6 }); G.ship.vel = V.clone(st.vel);
    face(st.pos);
    await wait(250);
  }
  const st = Sim.trafficState(x.w, sys, G.t);
  out.push(kind + ': ' + x.w.name + ' (' + x.w.className + ') ' + st.phase + ' ' + (st.progress * 100).toFixed(0) + '% ' +
           (st.outbound ? 'to ' : 'from ') + sys.byId[x.w.to].name + ' | carrying ' +
           ((x.w.back || []).map(m => m.qty + 't ' + m.cid).join(', ') || 'nothing') + ' | fps ' + await fps());
  await shot('lanes-3-' + kind);
}
return out.join('\n');
