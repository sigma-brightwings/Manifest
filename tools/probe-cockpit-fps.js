/* probe-cockpit-fps.js - where the cockpit's frame time goes (2026-11-20).
 * Astra: cockpit mouselook is sluggish. Measures presented fps in the
 * cockpit and outside, undocked in open space, then with this week's
 * per-frame additions switched off one at a time.
 *
 *     node tools/electron-probe.cjs tools/probe-cockpit-fps.js "<outdir>"
 */
if (window.Sound && window.Sound.mute) window.Sound.mute(true);
const G = window.Game, V = window.V;
G.title = null;
if (G.tutorial) { G.tutorial.done = true; G.tutorial.ended = true; }
if (G.ship.docked) { G.ship.docked = null; G.ship.dockOffset = null; }
G.ship.landed = false; G.dockTarget = null;
G.ship.pos = V.addScaled(G.ship.pos, G.ship.up, 300);
G.warpIndex = 0; G.panel = 0; G.paused = false;
G.message = null;
const out = [];
async function fps(label, ms) {
  await wait(800);
  const t0 = performance.now();
  let n = 0, worst = 0, last = t0;
  await new Promise(res => {
    function tick(now) {
      n++; worst = Math.max(worst, now - last); last = now;
      if (now - t0 < (ms || 2500)) requestAnimationFrame(tick); else res();
    }
    requestAnimationFrame(tick);
  });
  const f = n / ((performance.now() - t0) / 1000);
  out.push(label + ': ' + f.toFixed(1) + ' fps, worst gap ' + worst.toFixed(0) + ' ms');
}
G.viewMode = 'orbit'; await fps('exterior');
G.viewMode = 'cockpit'; await fps('cockpit');
await shot('cockpit');
const keep = { Ms: window.Milsats, Cs: window.Comsats, Sc: window.Scars, Ic: window.Icons };
window.Milsats = null; await fps('cockpit, no platforms');
window.Comsats = null; await fps('cockpit, no relays either');
window.Milsats = keep.Ms; window.Comsats = keep.Cs;
const chrome = G.cockpitChrome;
G.cockpitChrome = 2; await fps('cockpit, canopy only (no band)');
G.cockpitChrome = chrome;
if (window.Render && window.Render.setGlassHalo) {
  window.Render.setGlassHalo('off'); await fps('cockpit, glass halo off');
  window.Render.setGlassHalo('half');
}
const st = G.showTraffic; G.showTraffic = false; await fps('cockpit, traffic hidden'); G.showTraffic = st;
return out.join('\n');
