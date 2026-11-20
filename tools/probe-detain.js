/* probe-detain.js - detained when wanted (2026-11-19). Docks at Threshold
 * with a bounty there and too little money to settle, steps onto the deck
 * and waits for the port's law: shoots the officer coming, the detention
 * page, tries Esc (it must not let you go), then works it off and checks
 * the books.
 *
 *     node tools/electron-probe.cjs tools/probe-detain.js
 */
const G = window.Game, Sim = window.Sim;
G.title = null;
const port = G.sys.bodies.find(b => /Threshold/.test(b.name || '')) || G.sys.bodies.find(b => b.market && !b.surface);
Sim.dockShip(G.ship, port, G.sys, G.t);
G.panel = 0; G.viewMode = 'cockpit';
await wait(1200);
const fac = port.faction || G.here.factionId;
G.wanted = G.wanted || {}; G.wanted[fac] = 600;
G.ship.credits = 100;
G.startWalk(true);
await wait(1200);
if (!G.walk || G.walk.ship) return 'FAIL: not on the deck';
const cc = G.walk.plan.rooms.find(r => r.kind === 'concourse');
G.walk.x = (cc.x0 + cc.x1) / 2; G.walk.z = (cc.z0 + cc.z1) / 2 + 4; G.walk.yaw = Math.PI; G.walk.pitch = 0;
const out = ['port ' + port.name + ' faction ' + fac + ', bounty 600, credits 100'];
let shotCome = false, t0 = performance.now();
for (let i = 0; i < 240 && !(G.menu && G.menu.page === 'detain'); i++) {
  await wait(250);
  const sc = G.npcSceneNow();
  const cop = sc && sc.people.find(p => p.task && p.task.hold === 20);
  if (cop && !shotCome && Math.hypot(cop.x - G.walk.x, cop.z - G.walk.z) < 8) {
    G.walk.yaw = Math.atan2(cop.x - G.walk.x, cop.z - G.walk.z);
    out.push('officer coming: ' + cop.name + ' (' + cop.role + ')');
    await shot('detain-coming'); shotCome = true;
  }
}
if (!(G.menu && G.menu.page === 'detain')) { out.push('no detention after ' + ((performance.now() - t0) / 1000).toFixed(0) + ' s; last message: ' + G.message); return out.join('\n'); }
out.push('detained after ' + ((performance.now() - t0) / 1000).toFixed(0) + ' s; selected row ' + G.menu.sel);
await wait(400); await shot('detain-page');
await key('Escape');
out.push('after Esc: menu ' + (G.menu && G.menu.page) + ', note: ' + (G.menu && G.menu.note));
await key('Enter');
await wait(400);
out.push('after Enter: menu ' + (G.menu ? G.menu.page : 'closed') + '; wanted ' + (G.wanted[fac] || 0) + '; workoff ' + JSON.stringify(G.workoff || {}));
out.push('said: ' + G.message);
await wait(8000);
out.push('detained again within 8 s: ' + !!(G.menu && G.menu.page === 'detain'));
return out.join('\n');
