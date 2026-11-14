/* probe-rendezvous.js - two hulls with an arrangement, in the running
 * game (rendezvous.js, 2026-11-12).
 *
 *     node tools/electron-probe.cjs tools/probe-rendezvous.js "Claude outputs\rv"
 *
 * Finds a system with a standing meeting, winds the clock to the hour
 * they are both alongside, puts the ship between them, and looks at what
 * the comms screen offers.
 */
const G = window.Game, Sim = window.Sim, R = window.Rendezvous, B = window.Band, V = window.V;
G.title = null; G.tutorial = null;

let found = null;
const stars = G.galaxy.stars.slice().sort((a, b) =>
  window.Galaxy.distance3(a, G.here) - window.Galaxy.distance3(b, G.here));
for (const st of stars.slice(0, 40)) {
  if (st.id !== G.here.id) G.enterSystem(st, { fresh: true });
  if (G.sys.rendezvous) { found = st; break; }
}
if (!found) return 'FAIL: no standing meeting in forty systems';

const rv = G.sys.rendezvous;
const hulls = R.hullsOf(G.sys);

/* The hour they are both out there. */
const when = rv.t0 + rv.layover * 0.5;
G.t = when;
await wait(400);

const deal = R.dealAt(G, G.sys, G.t);
const meet = R.live(G, G.sys, G.t);
if (!meet) return 'FAIL: the meeting is not on at its own middle hour';

/* Alongside. */
G.ship.pos = { x: meet.pos.x, y: meet.pos.y, z: meet.pos.z };
G.ship.vel = { x: 0, y: 0, z: 0 };
G.ship.docked = null;
G.panel = 0; G.viewMode = 'cockpit';
await wait(900);

/* The band should have it. */
R.watch(G, G.sys, G.t, null);
const onBand = (G.band || []).filter(e => e.kind === 'trade').length;

await key('F4');
await wait(700);
/* Select the meeting's own channel - the buttons are the thing worth
 * photographing, and they live on the row rather than beside it. */
const rows = window.Screens.commsContacts();
for (let i = 0; i < rows.length; i++) if (rows[i].kind === 'meet') G.commsSel = i;
await wait(900);
await shot('comms-meet');

/* And looking at them from outside. */
G.viewMode = 'orbit';
G.cam.dist = 40;
G.focus = null;
await wait(900);
await shot('alongside');

const nm = (c) => (window.Economy.BY_ID[c] && window.Economy.BY_ID[c].name) || c;
return 'system ' + found.name + ' | meeting at ' + rv.atName +
       ' | ' + hulls.a.name + ' (' + (hulls.a.faction || '-') + ')  +  ' +
       hulls.b.name + ' (' + (hulls.b.faction || '-') + ')' +
       ' | ' + (meet.apart / 1000).toFixed(1) + ' kkm apart' +
       ' | period ' + (rv.period / 86400).toFixed(1) + ' d, window ' +
       (rv.layover / 3600).toFixed(1) + ' h' +
       ' | carrying ' + (deal.quiet ? 'nothing' :
           (deal.tonnes + ' t ' + nm(deal.cid) + (deal.contraband ? ' CONTRABAND' : '') +
            ' at ' + deal.ask + ' cr/t')) +
       ' | set up by ' + (deal.who ? deal.who.name : 'nobody') +
       ' | on the band: ' + onBand;
