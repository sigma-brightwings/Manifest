/* probe-appeal.js - the appeal line on a world's card, and ferries with
 * people aboard, in the running game at Mirven.
 *
 *     node tools/electron-probe.cjs tools/probe-appeal.js "<outdir>"
 */
if (window.Sound && window.Sound.mute) window.Sound.mute(true);
const G = window.Game, A = window.Appeal;
G.title = null;
if (G.tutorial) { G.tutorial.done = true; G.tutorial.ended = true; }
const out = [];
const worlds = G.sys.bodies.map(b => ({ b, a: A.of(G.sys, b) })).filter(x => x.a).sort((p, q) => q.a.score - p.a.score);
worlds.forEach(x => out.push(x.b.name + ': ' + x.a.score.toFixed(2) + ' ' + x.a.tier + ' (' + x.a.why.join(', ') + ')'));
const ferries = (G.sys.traffic || []).filter(r => r.feeder && r.cls === 'shuttle');
out.push('ferries ' + ferries.length + ', with people ' + ferries.filter(r => r.souls).length +
         ', e.g. ' + ferries.filter(r => r.souls).slice(0, 3).map(r => r.name + ' ' + r.souls).join('; '));
const best = worlds[0].b;
G.lock = best; G.focus = best; G.navTarget = { kind: 'body', id: best.id };
G.lockTab = 'world';
for (const type of ['keydown', 'keyup']) window.dispatchEvent(new KeyboardEvent(type, { key: 'F3', code: 'F3', bubbles: true }));
await wait(1500);
await shot('1-nav-world');
return out.join('\n');
