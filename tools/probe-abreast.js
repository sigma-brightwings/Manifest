/* probe-abreast.js - for tools/electron-probe.cjs: the two-abreast flight
 * deck (shipdeck.js TWO ABREAST, 2026-11-22). Buys a Tanker in cockpit
 * fit B at a shipyard, signs on a pilot if the crew hall has one, then
 * gets up out of the seat with the real key and looks at the two chairs.
 *
 *     node tools/electron-probe.cjs tools/probe-abreast.js "<outdir>"
 *
 * The turn to look forward at the chairs sets the walker's yaw directly
 * (a camera turn, as probe-walk.js does); standing up and sitting back
 * down are the real keys.
 */
const G = window.Game, Sim = window.Sim, Combat = window.Combat, Crew = window.Crew, Render = window.Render;
G.title = null;
/* The first yard with a big two-abreast hull on the floor. */
const WANT = ['tanker', 'longhaul', 'cutter', 'kestrel'];
let yard = null, bought = null, why = [];
const stars = G.galaxy.stars.slice().sort((a, b) =>
  window.Galaxy.distance3(a, G.here) - window.Galaxy.distance3(b, G.here));
outer:
for (const st of stars.slice(0, 80)) {
  if (st.id !== G.here.id) G.enterSystem(st, { fresh: true });
  for (const b of G.sys.bodies.filter(b => b.market && Combat.isShipyard(b) && !b.surface && !b.underground)) {
    Sim.dockShip(G.ship, b, G.sys, G.t);
    G.ship.credits = 9000000;
    for (const id of WANT) {
      const r = Combat.buyHull(G, id, false, { look: 1 });
      if (r.ok) { yard = b; bought = id; break outer; }
      why.push(id + ': ' + r.why);
    }
  }
}
if (!yard) return 'FAIL: none of ' + WANT.join('/') + ' on any floor in 80 stars · ' + why.slice(-3).join(' | ');
/* A pilot signed on (set directly, not through the crew hall's screen):
 * the second chair is hers. */
let hired = 'none';
try {
  const pil = (Crew.forHire(yard, G.t) || []).find(c => c.role === 'pilot') || Crew.make('Ines Varga', 'pilot', 3);
  G.ship.crew = (G.ship.crew || []).concat([pil]);
  hired = pil.name;
} catch (e) { hired = 'error ' + e.message; }
G.panel = 0; G.viewMode = 'cockpit';
await wait(2500);
await shot('abreast-1-seated');
const press = k => { window.dispatchEvent(new KeyboardEvent('keydown', { key: k })); window.dispatchEvent(new KeyboardEvent('keyup', { key: k })); };
press('o');
await wait(1500);
if (!G.walk) return 'FAIL: O did not get you up';
const standX = G.walk.x;
await shot('abreast-2-stood-up');
G.walk.yaw = 0; G.walk.pitch = -0.25;
await wait(1200);
await shot('abreast-3-the-pair');
/* Step back a pace for both chairs in frame. */
G.walk.z -= 0.6;
await wait(1000);
await shot('abreast-4-step-back');
/* Down over the backs of both chairs. */
G.walk.z += 0.6; G.walk.x = 0; G.walk.pitch = -0.8;
await wait(1000);
await shot('abreast-5-from-above');
const helm = G.walk.plan.items.find(i => i.kind === 'seat'), cop = G.walk.plan.items.find(i => i.kind === 'copilot');
/* Back behind your own chair, facing it, and E: sit down. */
G.walk.x = helm.x; G.walk.pitch = 0; G.walk.yaw = 0;
await wait(400);
press('e');
await wait(1500);
const sat = !G.walk;
/* From the seat, look across at the other chair (a drag-to-look turn). */
G.look.yaw = 1.55; G.look.pitch = -0.55;
await wait(1500);
await shot('abreast-6-across-the-aisle');
G.look.yaw = 0; G.look.pitch = 0;
/* Fit C, the instrument stack, refitted at the yard: its two outer
 * screens lifted clear of the centre one, on supports (Render.mfdLayout). */
const rf = Combat.refitCockpit(G, 2);
await wait(2000);
G.look.pitch = -0.30;
await wait(1500);
await shot('abreast-7-fit-c-dash');
G.look.pitch = 0;
const lay = Render.mfdLayout(Render.cockpitSpec(G.ship));
return 'refit C ' + (rf.ok ? 'ok' : rf.why) + ' · lifts ' + JSON.stringify(lay.lift) + ' · ' + 'yard ' + yard.name + ' · hull ' + G.ship.hullId + ' fit ' + G.ship.cockpitLook + ' · pilot ' + hired +
       ' · stood up at x ' + standX.toFixed(2) + ' · helm x ' + (helm ? helm.x.toFixed(2) : '-') +
       ' · co-pilot x ' + (cop ? cop.x.toFixed(2) : '-') + ' · E sat you down ' + sat;
