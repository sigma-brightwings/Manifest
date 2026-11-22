/* probe-gravlows.js - planetary interiors slice 2: lows on the gravimeter
 * (2026-11-22). Finds, in the starting system, the world whose strongest
 * light body (buried ice or salt) reads loudest, locks it, fits a grade IV
 * gravimeter and a grade 2 survey scanner, and shoots the GRAVITY layer on
 * the plane that cuts closest through that body. Then a gas giant, which
 * should now read no lumps at all.
 *
 * Set directly, and said so: fittings, the lock, the scanner layer and
 * plane (the same way tools/probe-gravity.js does). Scratch profile.
 *
 *     node tools/electron-probe.cjs tools/probe-gravlows.js "<outdir>"
 */
const G = window.Game, Gr = window.Gravity;
G.title = null; G.tutorial = null; G.menu = null;
G.showHelp = false; G.showCatalogue = false;
const out = [];
let best = null, giant = null;
for (const b of G.sys.bodies) {
  if ((b.kind !== 'planet' && b.kind !== 'moon') || !(b.radius > 0)) continue;
  if (Gr.isGiant(b)) { if (!giant) giant = b; continue; }
  const cs = Gr.contacts(b, G.sys, 4, 2).filter(c => c.low);
  for (const c of cs) if (!best || Math.abs(c.mgal) > Math.abs(best.c.mgal)) best = { b, c };
}
out.push('low: ' + (best ? best.b.name + ' ' + Gr.describe(best.c) + ' [' + best.c.kind + ']' : 'none in ' + G.sys.name));
const lock = (b) => { G.lock = b; G.focus = b; G.navTarget = { kind: 'body', id: b.id }; };
G.panel = 11;
G.ship.fittings = ['gammasurvey', 'gravIV'];
if (best) {
  lock(best.b);
  const v = [Math.cos(best.c.lat) * Math.cos(best.c.lon), Math.cos(best.c.lat) * Math.sin(best.c.lon), Math.sin(best.c.lat)];
  /* The plane that throws away the smallest component cuts nearest it. */
  const planes = ['xy', 'yz', 'zx'], ax = Gr.PLANE_AXES;
  const plane = planes.slice().sort((a, b) => Math.abs(v[ax[a][2]]) - Math.abs(v[ax[b][2]]))[0];
  G.scanUI = { layer: 'grav', filter: 0, lines: true, style: 0, sweep: 1, zoom: 0, plane: plane };
  await wait(400);
  out.push('plane ' + plane + ', contacts: ' + Gr.contacts(best.b, G.sys, 4, 2).map(c => (c.low ? 'LOW ' : '') + Math.round(c.mgal)).join(' '));
  await shot('gravlow-' + plane);
}
if (giant) {
  lock(giant);
  G.scanUI = { layer: 'grav', filter: 0, lines: true, style: 0, sweep: 1, zoom: 0, plane: 'xy' };
  await wait(400);
  out.push('giant ' + giant.name + ': ' + Gr.contacts(giant, G.sys, 4, 2).length + ' contacts');
  await shot('gravlow-giant');
}
return out.join('\n');
