/* probe-intel.js - selling a classified location at a rival's desk
 * (intel.js, 2026-11-10).
 *
 *     node tools/electron-probe.cjs tools/probe-intel.js "Claude outputs\intel"
 *
 * Finds a system that has a black site AND a port flying a rival's flag,
 * writes the find the way the coil writes it, then walks the desk option
 * and checks what each flag would pay for the same position.
 */
const G = window.Game, Sim = window.Sim, In = window.Intel, Gx = window.Galaxy;
G.title = null; G.tutorial = null;

let site = null, desks = [];
const stars = G.galaxy.stars.slice().sort((a, b) =>
  Gx.distance3(a, G.here) - Gx.distance3(b, G.here));
for (const st of stars.slice(0, 60)) {
  if (st.id !== G.here.id) G.enterSystem(st, { fresh: true });
  const s = (G.sys.ports || []).find(p => p.classified);
  const other = (G.sys.ports || []).filter(p => p.market && !p.classified);
  if (s && other.length) { site = s; desks = other; break; }
}
if (!site) return 'FAIL: no system with a black site and an ordinary port in 60 stars';

/* The find, written the way Survey.runSweep writes it. */
G.found = G.found || {};
G.intel = {};
const fkey = (G.here.id) + ':' + site.id;
G.found[fkey] = {
  t: G.t, fac: site.faction || null,
  kind: (site.classified && site.classified.kind) || null,
  name: site.name, star: G.here.id, starName: G.here.name
};

const fix = In.fixes(G)[0];
const owner = (G.galaxy.factionById[site.faction] || {}).name || site.faction;
const top = In.topOf(G.galaxy, site.faction);

/* What every flag in the galaxy would pay for it. */
const quotes = [];
for (const f of G.galaxy.factions) {
  const d = { id: 'probe-' + f.id, name: f.name + ' desk', faction: f.id };
  const why = In.refusal(G, G.galaxy, fix, d);
  quotes.push(f.name + ': ' + (why ? '(' + why.slice(0, 34) + ')'
                                   : In.priceOf(G, G.galaxy, fix, d, G.t) + ' cr'));
}

/* Now actually sell it at a real desk, if one here would take it. */
let sold = 'no desk here would take it';
const taker = desks.find(p => !In.refusal(G, G.galaxy, fix, p));
if (taker) {
  G.ship.credits = 0;
  Sim.dockShip(G.ship, taker, G.sys, G.t);
  G.panel = 0; G.viewMode = 'cockpit';
  await wait(700);
  await key('F4');
  await wait(900);
  await shot('desk');
  /* THE APPROACH, before the sale takes the fix off the table: somebody
   * at this desk has a better idea than buying the position. */
  const M = window.Missions;
  let approach = 'none offered';
  for (let w = 0; w < 10; w++) {
    const t2 = G.t + w * 2 * 86400;
    const rows = M.boardAt(taker, G.sys, G.galaxy, G.here, t2, G)
      .filter(o => o.type === 'watch' || o.type === 'walkin');
    if (rows.length) {
      approach = rows.map(o => o.type + ' ' + o.pay + ' cr' +
        (M.accept ? '' : '')).join(' / ');
      await key('F7');
      await wait(900);
      await shot('approach');
      break;
    }
  }

  const r = In.sell(G, G.galaxy, taker, fkey, G.t, null);
  sold = r.ok ? (taker.name + ' paid ' + r.cr + ' cr' + (r.burned ? ', and it came back on you' : ', quietly') + ' | approach: ' + approach)
              : ('refused: ' + r.why);
  await wait(500);
  await shot('desk-after');
}

return 'site ' + site.name + ' (' + (fix.kind || '?') + ', ' + owner + ' / ' + top +
       ') in ' + G.here.name + ' | ' + sold + ' | quotes: ' + quotes.join(' | ');
