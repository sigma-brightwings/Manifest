/* probe-mining.js — for tools/electron-probe.cjs: the mining loop in the
 * running game, end to end (2026-10-30, after the mining line was merged).
 *
 *   1. find a world with ore that a Talon can lift off;
 *   2. fit the deep survey array and fly a polar orbit over it under time
 *      warp, through the game's own loop (Survey.step runs in main.js);
 *   3. read the deposits the survey now shows, and the SURVEY page;
 *   4. file a claim, rack a drone, set down on the richest ground the map
 *      has read, put the drone down, let 90 days pass, and collect;
 *   5. lift off with R; sell the survey data to the Guild.
 *
 * Runs in electron-probe's throwaway profile.
 *     node tools/electron-probe.cjs tools/probe-mining.js
 */
const G = window.Game, Sim = window.Sim, Combat = window.Combat, V = window.V;
const Sv = window.Survey, Cl = window.Claims;
const res = {};
if (!Sv || !Cl) return 'FAIL: Survey or Claims not loaded';
G.title = null;
G.ship.credits = 200000;

/* 1. A world: rocky, ore on it, low enough gravity for the Talon to leave. */
let world = null;
const stars = G.galaxy.stars.slice().sort((a, b) => window.Galaxy.distance3(a, G.here) - window.Galaxy.distance3(b, G.here));
for (const st of stars.slice(0, 30)) {
  if (st.id !== G.here.id) G.enterSystem(st, { fresh: true });
  world = G.sys.bodies.find(b => (b.kind === 'planet' || b.kind === 'moon') && b.radius > 300 &&
    Sim.surfaceG(b) * 1000 < 4 && Sv.deposits(b, G.sys).some(r => r.cid === 'ore' || r.cid === 'metalore' || /ore/.test(r.cid)));
  if (world) break;
}
if (!world) return 'FAIL: no liftable ore world within 30 stars';
res.world = world.name + ' (' + world.type + ', r ' + Math.round(world.radius) + ' km, g ' + (Sim.surfaceG(world) * 1000).toFixed(2) + ' m/s2)';

/* 2. The instrument, and a polar orbit through the real loop. */
G.ship.docked = null; G.ship.landed = false; G.ship.crashed = false;
const fit = Combat.fitItem(G.ship, 'deepsurvey');
res.fitted = fit.ok ? 'deep survey array, grade ' + Combat.surveyLevel(G.ship) : 'FAIL ' + (fit.why || '');
const ws = Sim.bodyState(world, G.sys, G.t), sf = Sv.spinFrame(world, G.t);
const r = world.radius * 1.4, vc = Math.sqrt(6.6743e-20 * world.mass / r);   /* km/s, circular */
G.ship.pos = V.add(ws.pos, V.scale(sf.e1, r));
G.ship.vel = V.add(ws.vel, V.scale(sf.n, vc));   /* along the spin axis: pole to pole */
G.paused = false;
G.viewMode = 'external';
const svKey = Sv.keyOf(G, world.id);
const t0 = G.t;
/* Highest warp the loop allows, for a while, then back to 1x. */
/* 10,000x (main.js WARPS[6]); the game may taper it near the world. */
const warpSeen = {};
for (let i = 0; i < 120 && !((G.surveys || {})[svKey] && (G.surveys || {})[svKey].cov > 0.6); i++) { G.warpIndex = 6; await wait(250); warpSeen[G.warpIndex] = (warpSeen[G.warpIndex] || 0) + 1; }
res.warpSteps = JSON.stringify(warpSeen);
G.warpIndex = 0;
await wait(300);
const rec = (G.surveys || {})[svKey];
const cov = rec ? (rec.cov || 0) : 0;
res.flown = ((G.t - t0) / 3600).toFixed(1) + ' h of game time';
res.coverage = rec ? (Math.round((rec.cov || cov) * 100) + '% mapped') : 'FAIL no survey record';
const rows = Sv.deposits(world, G.sys).filter(d => rec && Sv.readable(rec, d.cid));
res.read = rows.map(d => d.cid + ' ' + Sv.gradeWord(d.grade)).join(', ') || 'nothing read';

/* 3. The SURVEY page, on a dashboard mount. */
await shot('mining-1-polar-orbit');

/* 4. Claim, drone, land on the best read ground, deploy, wait, collect. */
G.navTarget = { kind: 'body', id: world.id };
const ck = Cl.claimable(G, G.sys, world, G.t);
const filed = ck.ok ? Cl.fileClaim(G, G.sys, world, G.t) : { ok: false, why: ck.why };
res.claim = filed.ok ? 'filed to day ' + Math.floor(filed.claim.until / 86400) : 'FAIL ' + filed.why;
const bought = Cl.buyDrone(G);
res.drone = bought.ok ? G.ship.drones + ' racked' : 'FAIL ' + (bought.why || '');
/* The richest cell the survey has read. */
let best = null;
const digCids = rows.filter(d => d.cid !== 'hydrogen').map(d => d.cid);
for (let cell = 0; cell < Sv.NCELL; cell++) {
  let val = 0;
  digCids.forEach(cid => { val = Math.max(val, Sv.localGrade(world, G.sys, cid, cell) || 0); });
  if (!best || val > best.val) best = { la: Math.floor(cell / Sv.LON_BINS), lo: cell % Sv.LON_BINS, val };
}
res.bestGround = best ? 'cell ' + best.la + '/' + best.lo + ', local grade ' + best.val.toFixed(2) : 'none';
const lat = -Math.PI / 2 + ((best ? best.la : 6) + 0.5) * Math.PI / Sv.LAT_BINS;
const lon = ((best ? best.lo : 0) + 0.5) * 2 * Math.PI / Sv.LON_BINS;
const ws2 = Sim.bodyState(world, G.sys, G.t);
const surf = V.add(ws2.pos, V.scale(sf.e1, world.radius));
G.ship.landed = true; G.ship.crashed = false; G.ship.throttle = 0;
G.ship.landedAt = Sim.landSpot(world, G.sys, G.t, surf);
G.ship.landedAt.lat = lat; G.ship.landedAt.lon = lon;
Sim.updateLandedShip(G.ship, G.sys, G.t);
await wait(400);
const dep = Cl.deploy(G, G.sys, G.t, world);
res.deploy = dep && dep.ok ? 'down, digging ' + (dep.drone ? dep.drone.cid + ' at grade ' + (dep.drone.grade || 0).toFixed(2) : '?') : 'FAIL ' + (dep && dep.why);
const drone = (G.drones || [])[(G.drones || []).length - 1];
G.t += 90 * 86400;
Sim.updateLandedShip(G.ship, G.sys, G.t);
const inHopper = drone ? Cl.hopper(G, drone, G.t) : 0;
res.hopper90d = (typeof inHopper === 'object' ? JSON.stringify(inHopper) : (+inHopper).toFixed(1) + ' t');
const holdBefore = JSON.stringify(G.ship.cargo || {});
const got = drone ? Cl.collect(G, G.sys, G.t, drone) : null;
res.collect = got ? JSON.stringify(got).slice(0, 160) : 'FAIL no drone';
res.holdAfter = JSON.stringify(G.ship.cargo || {}).slice(0, 160);
await shot('mining-2-on-the-claim');

/* 5. Lift off with R, the game's own key. */
G.ship.throttle = 1;
G.keys['r'] = true;
await wait(800);
G.keys['r'] = false;
res.liftoff = G.ship.landed ? 'FAIL still landed' : 'lifted off';

/* The Guild buys the survey. */
const sale = Sv.saleable(G, G.sys, G.t);
const c0 = G.ship.credits;
const sold = Sv.sell(G, G.sys, G.t);
res.sale = (sold && sold.total ? sold.total + ' cr for ' + sold.count + ' survey(s)' : 'nothing to sell') + ' (offered ' + sale.length + ')';
res.creditsUp = G.ship.credits - c0;
log(JSON.stringify(res));
const bad = Object.keys(res).filter(k => /FAIL/.test(String(res[k])));
return (bad.length ? 'FAIL ' + bad.join(',') + ' ' : 'PASS ') + JSON.stringify(res);
