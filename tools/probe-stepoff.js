/* probe-stepoff.js - can she still walk off her ship onto the station deck
 * with the hangar sized to the real berth (2026-11-18)? Logs each stage. */
const G = window.Game, Sim = window.Sim;
G.title = null;
const port = G.sys.bodies.find(b => b.market && !b.surface && !b.underground);
Sim.dockShip(G.ship, port, G.sys, G.t);
G.panel = 0; G.viewMode = 'cockpit';
await wait(800);
const out = ['port ' + port.name];
await key('o'); await wait(1200);
const st = () => G.walk ? ('walk ship=' + !!G.walk.ship + ' outside=' + !!G.walk.outside + ' x=' + G.walk.x.toFixed(1) + ' z=' + G.walk.z.toFixed(1) +
  ' items=' + (G.walk.plan.items || []).map(i => i.kind).filter((k, i, a) => a.indexOf(k) === i).join('/')) : 'no walk';
out.push('after O: ' + st());
const hp = G.hangarPlan && G.hangarPlan();
out.push('hangarPlan: ' + (hp ? ('hangar room ' + (hp.hangar && hp.hangar.room && hp.hangar.room.id) + ' rooms ' + hp.rooms.length) : 'null'));
const use = async (kind) => {
  const it = G.walk.plan.items.find(i => i.kind === kind);
  if (!it) return 'no ' + kind;
  G.walk.x = it.x; G.walk.z = it.z;
  if (!window.Walk.standable(G.walk.plan, G.walk.x, G.walk.z)) G.walk.x = it.x + 0.5;
  await wait(200); G.walk.near = it; await key('e'); return 'used ' + kind;
};
out.push(await use('hatch')); await wait(9000); out.push('after hatch: ' + st());
for (let i = 0; i < 4 && G.walk && G.walk.ship; i++) { out.push(await use('ramp')); await wait(1500); out.push('  ' + st()); }
await shot('stepoff');
return out.join('\n');
