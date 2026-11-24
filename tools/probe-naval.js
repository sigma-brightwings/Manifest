/* probe-naval.js — for tools/electron-probe.cjs: the naval decks in the
 * real game (2026-11-23, claude/naval-decks.md stage 2). A Capital: up out
 * of the seat, the lift down to her own airlock deck and through to the
 * band, the 2nd deck's passageway, a ladder climbed, engineering, the
 * reactor's glass, the tram; then a Carrier's hangar bays and a Meridian.
 *
 *   set ELECTRON_EXE=...\node_modules\electron\dist\electron.exe
 *   node tools/electron-probe.cjs tools/probe-naval.js "Claude outputs\naval-probe"
 */
const G = window.Game, Sim = window.Sim, Combat = window.Combat;
G.title = null;
let yard = null;
const stars = G.galaxy.stars.slice().sort((a, b) =>
  window.Galaxy.distance3(a, G.here) - window.Galaxy.distance3(b, G.here));
for (const st of stars.slice(0, 80)) {
  if (st.id !== G.here.id) G.enterSystem(st, { fresh: true });
  for (const y of G.sys.bodies.filter(b => b.market && Combat.isShipyard(b) && !b.surface && !b.underground)) {
    Sim.dockShip(G.ship, y, G.sys, G.t);
    G.ship.credits = 3000000;
    yard = y; break;
  }
  if (yard) break;
}
if (!yard) return 'FAIL: no yard within 80 stars';
const notes = [];
function as(hull) {
  G.walk = null;
  G.ship.hullId = hull; G.ship.dryMass = Combat.HULLS[hull].dryMass; G.ship.turret = null;
  G.ship._deck = null; G.ship._cockpit = null;
}
G.ship.crew = ['engineer', 'engineer', 'gunner', 'pilot'].map((role, i) => ({
  id: 'c|naval' + i, name: ['Mira Lund', 'Teo Hoyt', 'Rue Sable', 'Bo Grieve'][i], role, rating: 3, paidTo: G.t }));
G.panel = 0; G.viewMode = 'cockpit'; G.look.yaw = 0; G.look.pitch = 0;
async function shot2(name) {
  await shot(name);
  const w = G.walk, r = w && window.Walk.roomAt(w.plan, w.x, w.z);
  notes.push(name + ' deck=' + (w ? w.plan.deck : '-') + ' room=' + (r ? (r.sub || r.kind) + (r.comp ? ' ' + r.comp : '') : '-') +
             ' near=' + (w && w.near ? w.near.kind + ':' + w.near.label : '-') + ' fps=' + Math.round(G.fps));
}
/* Put the walker somewhere, on a deck of her plan. */
function put(dk, x, z, yaw, pitch) {
  const whole = G.walk.plan.ship || G.walk.plan;
  G.walk.plan = whole.decks[dk]; G.walk.deck = dk;
  G.walk.x = x; G.walk.z = z; G.walk.yaw = yaw; G.walk.pitch = pitch || 0;
}
function roomsOf(whole, sub, dk) { return whole.rooms.filter(r => r.kind === 'naval' && r.sub === sub && (!dk || r.deck === dk)); }
async function ride(to) {
  const sh = G.walk.plan.ship;
  G.walk.x = -0.2; G.walk.z = (sh.carZ[0] + sh.carZ[1]) / 2; G.walk.pitch = -0.15;
  const b = G.walk.plan.items.find(it => it.kind === 'liftbtn' && it.to === to);
  if (!b) { notes.push('no button to ' + to + ' on ' + G.walk.plan.deck); return false; }
  G.walk.yaw = Math.atan2(b.x - G.walk.x, b.z - G.walk.z);
  await wait(400);
  if (!G.walk.near || G.walk.near !== b) G.walk.near = b;
  await key('e');
  for (let i = 0; i < 40 && G.walk.ride; i++) await wait(300);
  await wait(600);
  return G.walk.plan.deck === to;
}

/* ---- THE CAPITAL ------------------------------------------------------ */
as('capital');
await wait(800);
await key('o');
await wait(1500);
if (!G.walk || !G.walk.plan.ship) return 'FAIL: not on a deck';
let whole = G.walk.plan.ship;
notes.push('capital decks ' + whole.deckAll.join(',') + ' | lift ' + whole.deckOrder.join(',') + ' | naval rooms ' + whole.rooms.filter(r => r.kind === 'naval').length);
notes.push('rode to main: ' + await ride('main'));
await shot2('n01-capital-main-from-car');
/* Through her hold to the band. */
const jl = whole.rooms.find(r => r.id === 'nv-' + whole.naval.layout.join.room);
if (jl) { put('main', jl.x1 - 0.6, (jl.z0 + jl.z1) / 2, -Math.PI / 2, 0); await wait(1500); await shot2('n02-capital-join-passage'); }
notes.push('rode to n2: ' + await ride('n2'));
/* The starboard passageway, looking forward. */
const pas = roomsOf(whole, 'passage', 'n2').filter(r => (r.x0 + r.x1) / 2 > whole.naval.cx).sort((a, b) => a.z0 - b.z0);
const mp = pas[Math.floor(pas.length / 2)];
put('n2', (mp.x0 + mp.x1) / 2, mp.z0 + 1.0, 0, 0);
await wait(1500);
await shot2('n03-capital-2nd-deck-passage');
/* A ladder up: at its foot, looking at it, then E. */
const lad = whole.items.find(it => it.kind === 'climb' && it.via === 'ladder' && it.deck === 'n2' && it.up && it.to === 'main');
if (lad) {
  put('n2', lad.x, lad.z - 0.8, 0, 0.15);
  await wait(1200);
  G.walk.near = lad;
  await shot2('n04-capital-ladder-foot');
  await key('e');
  await wait(700);
  await shot2('n05-capital-climbing');
  for (let i = 0; i < 20 && G.walk.ride; i++) await wait(300);
  await wait(800);
  await shot2('n06-capital-ladder-head');
}
/* Engineering, by lift. */
notes.push('rode to n4: ' + await ride('n4'));
await shot2('n07-capital-engineering-landing');
/* Reactor control, looking aft through the glass at the core. */
const rx = whole.naval.reactors[0];
const ctl = whole.rooms.find(r => r.id === rx.control);
if (ctl) {
  put(ctl.deck, (ctl.x0 + ctl.x1) / 2, ctl.z0 + 1.6, Math.PI, 0.05);
  await wait(1800);
  await shot2('n08-capital-reactor-glass');
  const rr = whole.rooms.find(r => r.id === rx.room);
  put(rr.deck, rr.x1 - 0.8, rr.z1 - 0.8, Math.PI + 0.6, -0.05);
  await wait(1500);
  await shot2('n09-capital-reactor-room');
}
/* The tram. */
if (whole.tram) {
  const tb = whole.items.find(it => it.kind === 'tram' && it.to === 'b');
  put(whole.tram.deck, tb.x, tb.z + 0.6, Math.PI, -0.05);
  await wait(1200);
  await shot2('n10-capital-tram-platform');
  G.walk.near = tb;
  await key('e');
  await wait(2500);
  await shot2('n11-capital-on-the-tram');
  for (let i = 0; i < 40 && G.walk.ride; i++) await wait(300);
  await wait(800);
  await shot2('n12-capital-aft-platform');
}
const sc = window.Npc && window.Npc.lastScene;
notes.push('PEOPLE ' + (sc ? sc.people.map(p => p.name + ' ' + (p.away ? 'away' : ((window.Walk.roomAt(sc.plan, p.x, p.z) || {}).sub || (window.Walk.roomAt(sc.plan, p.x, p.z) || {}).kind))).join(', ') : '-'));

/* ---- THE CARRIER ------------------------------------------------------ */
as('carrier');
G.fleet = (G.fleet || []).concat([{ id: 'fs-probe', hullId: 'wren', name: 'Little Wren', port: G.ship.docked, fit: {}, cargo: {} }]);
await wait(800);
await key('o');
await wait(1500);
whole = G.walk.plan.ship;
notes.push('carrier decks ' + whole.deckAll.join(',') + ' | lift ' + whole.deckOrder.join(','));
notes.push('rode to main (hangar deck): ' + await ride('main'));
const bays = roomsOf(whole, 'hangar').sort((a, b) => a.z0 - b.z0);
if (bays.length) {
  const b0 = bays[0];
  put(b0.deck, (b0.x0 + b0.x1) / 2 + 9, b0.z0 + 2.5, 0.25, 0.08);
  await wait(2500);
  await shot2('n13-carrier-hangar-bays');
}
notes.push('rode to n03: ' + await ride('n03'));
const ready = roomsOf(whole, 'passage', 'n03').sort((a, b) => a.z0 - b.z0)[3];
if (ready) { put('n03', (ready.x0 + ready.x1) / 2, ready.z0 + 1, 0, 0); await wait(1500); await shot2('n14-carrier-gallery-passage'); }

/* ---- THE MERIDIAN ----------------------------------------------------- */
as('meridian');
await wait(800);
await key('o');
await wait(1500);
whole = G.walk.plan.ship;
notes.push('meridian decks ' + whole.deckAll.join(',') + ' | lift ' + whole.deckOrder.join(','));
notes.push('rode to main: ' + await ride('main'));
const mjl = whole.rooms.find(r => r.id === 'nv-' + whole.naval.layout.join.room);
const bpas = roomsOf(whole, 'passage', 'main').sort((a, b) => b.z1 - a.z1)[0];
if (bpas) { put('main', 0, bpas.z1 - 0.8, Math.PI, 0); await wait(1500); await shot2('n15-meridian-b-deck'); }
const st = whole.items.find(it => it.kind === 'climb' && it.via === 'stair' && it.to === 'nA');
if (st) {
  put(st.deck, st.x, st.z - 0.6, 0, 0.2); await wait(1000); G.walk.near = st;
  await key('e'); for (let i = 0; i < 20 && G.walk.ride; i++) await wait(300); await wait(800);
  await shot2('n16-meridian-a-deck');
}
return notes.join('\n');
