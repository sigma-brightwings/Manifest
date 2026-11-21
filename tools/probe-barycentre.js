/* probe-barycentre.js (bug hunt 2026-11-21): the point between a close
 * pair's suns. Is it on the F3 list, can it be locked, and what do the
 * nav card and the cockpit make of it?
 *     node tools/electron-probe.cjs tools/probe-barycentre.js "<outdir>"
 */
if (window.Sound && window.Sound.mute) window.Sound.mute(true);
const G = window.Game, Sim = window.Sim, V = window.V, Gx = window.Galaxy;
G.title = null;
if (G.tutorial) { G.tutorial.done = true; G.tutorial.ended = true; }
const errs = [];
window.addEventListener('error', e => errs.push(String(e.message)));
function press(k) { for (const type of ['keydown', 'keyup']) window.dispatchEvent(new KeyboardEvent(type, { key: k, code: k, bubbles: true })); }
const stars = G.galaxy.stars.filter(st => st.factionId).sort((a, b) => Gx.distance3(G.here, a) - Gx.distance3(G.here, b));
let pairStar = null;
for (const st of stars.slice(0, 60)) { G.enterSystem(st, { fresh: true }); await wait(30); if (G.sys.pairBary) { pairStar = st; break; } }
if (!pairStar) return 'no close pair';
const s = G.ship; s.docked = null; s.dockOffset = null; s.landed = false; G.dockTarget = null;
/* Out among the planets, a few AU from the pair. */
const p1 = G.sys.bodies.find(b => b.kind === 'planet');
const ps = Sim.bodyState(p1, G.sys, G.t);
s.pos = V.addScaled(ps.pos, V.norm(ps.pos), 2e6); s.vel = V.clone(ps.vel);
s.fwd = V.norm(V.scale(s.pos, -1)); const ref = { x: 0, y: 0, z: 1 }; s.right = V.norm(V.cross(s.fwd, ref)); s.up = V.cross(s.right, s.fwd);
G.paused = true;
await wait(300);
press('F3'); await wait(800);
await shot('1-f3-list');
G.navTarget = { kind: 'body', id: G.sys.root.id };
await wait(600);
await shot('2-f3-locked-barycentre');
press('Escape'); await wait(300);
press('F1'); await wait(800);
await shot('3-cockpit-locked');
const rows = [];
try { const ns = window.Screens && window.Screens.systemManifest ? window.Screens.systemManifest(G.sys) : []; rows.push('manifest: ' + ns.map(r => r.name || r.id).slice(0, 8).join(', ')); } catch (e) { rows.push('manifest threw ' + e.message); }
return pairStar.name + ' root ' + G.sys.root.id + ' "' + G.sys.root.name + '" kind ' + G.sys.root.kind + ' | ' + rows.join(' | ') + ' | errors: ' + (errs.join(' ; ') || 'none');
