/* probe-copilot.js - for tools/electron-probe.cjs: where a hired pilot is
 * on a two-abreast flight deck while you sit at the helm (Npc.lastScene),
 * and a shot across at the co-pilot's chair. Buys a Tanker (or the next
 * big hull on the floor) in cockpit fit B, signs on a pilot directly.
 *
 *     node tools/electron-probe.cjs tools/probe-copilot.js "<outdir>"
 */
const G = window.Game, Sim = window.Sim, Combat = window.Combat, Crew = window.Crew, Npc = window.Npc;
G.title = null;
const WANT = ['tanker', 'longhaul', 'cutter', 'kestrel'];
let yard = null;
const stars = G.galaxy.stars.slice().sort((a, b) => window.Galaxy.distance3(a, G.here) - window.Galaxy.distance3(b, G.here));
outer:
for (const st of stars.slice(0, 80)) {
  if (st.id !== G.here.id) G.enterSystem(st, { fresh: true });
  for (const b of G.sys.bodies.filter(b => b.market && Combat.isShipyard(b) && !b.surface && !b.underground)) {
    Sim.dockShip(G.ship, b, G.sys, G.t);
    G.ship.credits = 9000000;
    for (const id of WANT) if (Combat.buyHull(G, id, false, { look: 1 }).ok) { yard = b; break outer; }
  }
}
if (!yard) return 'FAIL: no big hull on any floor';
const pil = (Crew.forHire(yard, G.t) || []).find(c => c.role === 'pilot') || Crew.make('Ines Varga', 'pilot', 3);
G.ship.crew = (G.ship.crew || []).concat([pil]);
G.panel = 0; G.viewMode = 'cockpit';
function report(tag) {
  const sc = Npc.lastScene;
  if (!sc) return tag + ': no scene';
  return tag + ': ' + sc.people.map(p => p.name + ' (' + p.role + ')' +
    ' station ' + (p.station ? p.station.kind + '@' + p.station.x.toFixed(2) : '-') +
    ' act ' + (p.act || '-') + ' at ' + (p.x !== undefined ? p.x.toFixed(2) + ',' + p.z.toFixed(2) : '?') +
    ' sit ' + (p.sit || 0).toFixed(1) + ' away ' + !!p.away +
    ' onWatch ' + Npc.onWatch(p, G.t) + ' task ' + (p.task ? (p.task.act + (p.task.at ? '@' + p.task.at.x.toFixed(2) + ',' + p.task.at.z.toFixed(2) : '') + (p.task.deck ? ' deck ' + p.task.deck : '')) : '-')).join(' ; ') +
    ' · present ' + (Crew.present ? Crew.present(G.ship).map(c => c.name).join(',') : '?') +
    ' · bunks ' + ((sc.plan.ship || sc.plan).bunkAt || []).length;
}
await wait(2000);
const r1 = report('2 s');
await wait(8000);
const r2 = report('10 s');
G.look.yaw = 1.55; G.look.pitch = -0.45;
await wait(1500);
await shot('copilot-1-across');
G.look.yaw = 0; G.look.pitch = 0;
/* Then on to her next watch (the ship's clock moved on, as a long wait at
 * the berth would), and give her time to walk up from her bunk. */
const me = Npc.lastScene && Npc.lastScene.people.find(p => p.role === 'pilot');
let stepped = 0;
while (me && !Npc.onWatch(me, G.t) && stepped < 200) { G.t += 300; stepped++; }
if (me) { me.task = null; me.until = 0; }
await wait(15000);
const r3 = report('on watch, +' + (stepped * 5) + ' min, 15 s on');
G.look.yaw = 1.55; G.look.pitch = -0.45;
await wait(1500);
await shot('copilot-2-on-watch');
G.look.yaw = 0; G.look.pitch = 0;
return G.ship.hullId + ' · ' + r1 + ' || ' + r2 + ' || ' + r3;
