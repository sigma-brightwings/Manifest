/* probe-blacksite.js - for tools/electron-probe.cjs: the field sweep in the
 * real game (2026-11-10). Finds a system that is hiding something, parks the
 * ship a long way off it, presses Q, lets the coil charge, and shows what
 * the sweep said and what it put on the nav list.
 *
 *     node tools/electron-probe.cjs tools/probe-blacksite.js "Claude outputs\blacksite-probe"
 */
const G = window.Game, Sim = window.Sim, V = window.V, Sv = window.Survey, Gen = window.Gen;
G.title = null;
if (G.tutorial) { G.tutorial.ended = true; G.tutorial.hidden = true; }
G.panel = 0;
G.viewMode = 'cockpit';

/* The magnetometer, fitted. */
window.Combat.magLevel = function () { return 1; };

const stars = G.galaxy.stars.slice().sort((a, b) =>
  window.Galaxy.distance3(a, G.here) - window.Galaxy.distance3(b, G.here));
let pick = null;
for (const st of stars.slice(0, 60)) {
  if (st.id !== G.here.id) G.enterSystem(st, { fresh: true });
  if ((G.sys.blackSites || []).length) { pick = st; break; }
}
if (!pick) return 'no black site within 60 stars';
G.enterSystem(pick, { fresh: true });
const site = G.sys.blackSites[0];
const out = [pick.name + ' (' + pick.id + ') hides ' + site.name + ' - ' + site.classified.label];

/* Is it off every list before the sweep? */
function navNames() { return (window.Game.navList ? [] : []); }
out.push('before: found=' + JSON.stringify(Object.keys(G.found || {})));

/* Park a long way off it, along the line from the star. */
const sitePos = Sim.bodyPosition(site, G.sys, G.t);
const starPos = Sim.bodyPosition(G.sys.root, G.sys, G.t);
const away = V.norm(V.sub(starPos, sitePos));
G.ship.docked = null; G.ship.landed = false; G.ship.crashed = false;
G.ship.pos = V.add(sitePos, V.scale(away, 4.0e8));
G.ship.vel = { x: 0, y: 0, z: 0 };
const fwd = V.norm(V.sub(sitePos, G.ship.pos));
const right = V.norm(V.cross(fwd, { x: 0, y: 0, z: 1 }));
G.ship.fwd = fwd; G.ship.right = right; G.ship.up = V.norm(V.cross(right, fwd));
out.push('parked ' + (V.dist(G.ship.pos, sitePos) / 1e6).toFixed(0) + ' Mkm off it');

/* Press Q, and let the coil charge. */
G.paused = false;
window.dispatchEvent(new KeyboardEvent('keydown', { key: 'q', bubbles: true }));
await wait(400);
out.push('charging: ' + (G.fieldSweep ? (G.fieldSweep.secs.toFixed(0) + ' s') : 'NOT STARTED'));
await shot('blacksite-charging');
/* Sim seconds, so warp carries it. */
/* Real seconds, and more than the coil needs: the charge is counted in
 * SIM seconds and this probe does not drive the warp control. */
await wait(9000);
out.push('after: found=' + JSON.stringify(Object.keys(G.found || {})));
out.push('G.sweep is ' + (G.sweep === undefined ? 'UNDEFINED' : (G.sweep.contacts.length + ' sources')));
out.push('docked=' + G.ship.docked + ' landed=' + G.ship.landed + ' fieldSweep=' + !!G.fieldSweep);
const manual = Sv.runSweep(G, G.sys, G.t);
out.push('manual runSweep: ' + (manual.ok ? (manual.contacts.length + ' contacts, ' + manual.news.length + ' new') : manual.why));
out.push('ports: ' + (G.sys.ports || []).length +
  '  direct: ' + Sv.sweepContacts(G.sys, G.ship.pos, 1, G.t).length +
  '  field: ' + Sv.sourceField(site).toFixed(2) +
  '  dist ' + (V.dist(G.ship.pos, Sim.bodyPosition(site, G.sys, G.t)) / 1e6).toFixed(0) + ' Mkm' +
  '  floor ' + Sv.SWEEP_FLOOR + ' ref ' + Sv.REF_KM);
if (G.sweep) {
  const mine = G.sweep.contacts.filter(c => c.id === site.id)[0];
  out.push('the site: ' + (mine ? ('sig ' + mine.signal.toFixed(2) + ' fix ' + mine.fix.toFixed(2) +
    ' err ' + (mine.error / 1e6).toFixed(0) + ' Mkm') : 'not heard'));
}
G.paused = true;
await wait(300);
await shot('blacksite-after');
return out.join('\n') + '\nfps ' + Math.round(G.fps);
