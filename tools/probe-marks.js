/* probe-marks.js - the nav and comms lists, with drawn marks and hull
 * colours (screens.js trackInk/markAt, 2026-11-12).
 *
 *     node tools/electron-probe.cjs tools/probe-marks.js "Claude outputs\marks"
 *
 * Astra: "the ascii icons for the various places are difficult to
 * recognize as what they are at a glance ... Ships should be in grey if
 * neutral, green if friendly and red if hostile. If unknown, the track
 * shows up as white."
 *
 * Sets up one of each so all four colours are on screen at once.
 */
const G = window.Game, Sim = window.Sim, S = window.Screens, M = window.Missions;
G.title = null; G.tutorial = null;
G.panel = 0; G.viewMode = 'cockpit';
G.showTraffic = true;
await wait(700);

const ships = Sim.shipsAll(G.sys, G.t) || [];
if (!ships.length) return 'FAIL: no traffic in ' + G.here.name;

/* FRIENDLY: think well of the flag the nearest hull flies.
 * HOSTILE: fall out badly with another.
 * UNKNOWN: one running dark.
 * NEUTRAL: everybody else. */
function tallyNow() {
  const t = {};
  S.commsContacts().filter(c => c.kind === 'ship').forEach(c => {
    const ink = S.trackInk(c);
    const w = Object.keys(S.TRACK).filter(k => S.TRACK[k] === ink)[0] || ink;
    t[w] = (t[w] || 0) + 1;
  });
  return Object.keys(t).map(k => k + ':' + t[k]).join(' ');
}
/* What a career that has done nothing sees: this should be nearly all
 * neutral, because grey is the default and the others have to be earned. */
const baseline = tallyNow();

/* A flag that flies over few berths here, so friendly reads as a handful
 * of hulls rather than swallowing the list. */
const facs = (G.sys.factions || []).map(f => f.id);
if (facs[facs.length - 1]) M.bumpStanding(G, facs[facs.length - 1], 40);
if (facs[facs.length - 2]) M.bumpStanding(G, facs[facs.length - 2], -60);
const dark = ships.slice().sort((a, b) =>
  window.V.dist(a.pos, G.ship.pos) - window.V.dist(b.pos, G.ship.pos))[2];
if (dark) dark.silent = true;

const tally = {};
const cs = S.commsContacts();
cs.filter(c => c.kind === 'ship').forEach(c => {
  const ink = S.trackInk(c);
  const word = Object.keys(S.TRACK).filter(k => S.TRACK[k] === ink)[0] || ink;
  tally[word] = (tally[word] || 0) + 1;
});

await key('F4');
await wait(900);
await shot('comms-marks');

await key('F3');
await wait(900);
await shot('nav-marks');

const kinds = {};
cs.forEach(c => { kinds[c.kind] = (kinds[c.kind] || 0) + 1; });

return 'system ' + G.here.name + ' | contacts ' + cs.length +
       ' | kinds ' + Object.keys(kinds).map(k => k + ':' + kinds[k]).join(' ') +
       ' | hulls ' + Object.keys(tally).map(k => k + ':' + tally[k]).join(' ') +
       ' | dark ' + (dark ? dark.name : 'none') +
       ' | baseline ' + baseline;
