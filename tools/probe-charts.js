/* probe-charts.js - THE CARTOGRAPHERS at a real desk (charts.js, 2026-11-13).
 *
 *     node tools/electron-probe.cjs tools/probe-charts.js "Claude outputs\charts"
 *
 * What this has to show, in the running game rather than in a unit test:
 *   - the row appears on the F4 deck list, under the Guild's assay row;
 *   - it names the world, the coverage and the price;
 *   - on a world with real ore it says the Guild will mind, BEFORE you
 *     press it - which is the whole decision;
 *   - publishing pays, says so, and the row then refuses with a reason;
 *   - the F7 standing list carries the Cartographers under the Mining
 *     Guild, and paints a spent Guild red.
 */
const G = window.Game, Sim = window.Sim, Ch = window.Charts,
      Sv = window.Survey, Gx = window.Galaxy;
G.title = null; G.tutorial = null; G.menu = null;
G.showHelp = false; G.showCatalogue = false;

if (!Ch) return 'FAIL: window.Charts is not loaded - check the index.html script tag';

/* A system with a desk to file at and worlds worth charting. Prefer one
 * where the two cases live side by side: a barren world and a rich one. */
let found = null;
const stars = G.galaxy.stars.slice().sort((a, b) =>
  Gx.distance3(a, G.here) - Gx.distance3(b, G.here));
for (const st of stars.slice(0, 70)) {
  if (st.id !== G.here.id) G.enterSystem(st, { fresh: true });
  const desks = (G.sys.ports || []).filter(p => p.market && !p.classified);
  if (!desks.length) continue;
  let barren = null, rich = null;
  for (const b of G.sys.bodies) {
    const ore = Ch.oreInterest(b, G.sys);
    if (!barren && ore < Ch.MIND_FLOOR) barren = b;
    if (!rich && Ch.guildCost(b, G.sys) >= 2) rich = b;
  }
  if (barren && rich) { found = { star: st, desk: desks[0], barren, rich }; break; }
  if (barren && !found) found = { star: st, desk: desks[0], barren, rich: null };
}
if (!found) return 'FAIL: no system in 70 stars with a desk and a chartable world';
if (found.star.id !== G.here.id) G.enterSystem(found.star, { fresh: true });

log('system: ' + G.sys.name + '  desk: ' + found.desk.name);
log('  barren: ' + found.barren.name +
            ' ore ' + Math.round(Ch.oreInterest(found.barren, G.sys)) +
            '  guild -' + Ch.guildCost(found.barren, G.sys));
log('  rich:   ' + (found.rich ? found.rich.name +
            ' ore ' + Math.round(Ch.oreInterest(found.rich, G.sys)) +
            '  guild -' + Ch.guildCost(found.rich, G.sys) : 'none here'));
log('  novelty ' + Ch.noveltyOf(G.galaxy, G.here, G.sys).toFixed(3) +
            '  frontier ' + Ch.frontierOf(G.galaxy, G.here).toFixed(3) +
            '  ports ' + (G.sys.ports || []).length);

/* Hand the career a fully mapped sheet of each, the way a long survey
 * would have left it. Nothing else is touched. */
function giveSheet(body, cov) {
  /* A fresh career has no G.surveys at all until the first pass over a
   * world, so the probe makes the store the way the game would. */
  G.surveys = G.surveys || {};
  const key = Sv.keyOf(G, body.id);
  G.surveys[key] = { key, star: G.here.id,
    cov, cov2: cov, covF: cov, grade: 3,
    soldCov: 0, soldCov2: 0, soldCovF: 0, t: G.t, tMean: G.t, v: 2,
    cells: '', cells2: '', cellsF: '' };
  return key;
}
const kBarren = giveSheet(found.barren, 1);
const kRich = found.rich ? giveSheet(found.rich, 1) : null;

G.standing = G.standing || {};
G.standing.guild = 20;            // something to spend, so the cost shows
G.ship.credits = 1000;
G.carto = null;

Sim.dockShip(G.ship, found.desk, G.sys, G.t);
G.panel = 0; G.viewMode = 'cockpit';
await wait(700);

/* --- the row, with the barren world picked --- */
G.navTarget = { kind: 'body', id: found.barren.id };
await key('F4');
await wait(900);
let pick = Ch.pick(G, G.sys, G.galaxy);
log('\nrow (barren): ' + (pick
  ? pick.name + ' at ' + Math.round(pick.cov * 100) + '% - ' + pick.price +
    ' cr, guild -' + pick.guild
  : 'NONE - ' + Ch.why(G, G.sys, G.galaxy)));
await shot('desk-barren');

/* --- the row with the rich world picked: the warning must be there --- */
if (found.rich) {
  G.navTarget = { kind: 'body', id: found.rich.id };
  await wait(500);
  pick = Ch.pick(G, G.sys, G.galaxy);
  log('row (rich):   ' + (pick
    ? pick.name + ' at ' + Math.round(pick.cov * 100) + '% - ' + pick.price +
      ' cr, guild -' + pick.guild
    : 'NONE'));
  log('  the warning is on the row before you press it: ' +
              (pick && pick.guild > 0 ? 'YES (-' + pick.guild + ')' : 'NO'));
  await shot('desk-rich');
}

/* --- publish the barren one and watch the money and the message --- */
G.navTarget = { kind: 'body', id: found.barren.id };
await wait(300);
const before = G.ship.credits, gBefore = G.standing.guild;
const got = Ch.publish(G, G.sys, G.galaxy, kBarren, { say: (t, s) => G.say && G.say(t, s) });
log('\npublished ' + got.name + ': ' + got.price + ' cr' +
            '  carto +' + got.carto + '  guild -' + got.guild +
            (got.nod && got.nod.up ? '  ' + (got.nod.fac.name || got.nod.fac.id) + ' +1' : ''));
log('  credits ' + before + ' -> ' + G.ship.credits +
            '   guild ' + gBefore + ' -> ' + G.standing.guild);
await wait(700);
await shot('published');

/* --- the row must now refuse, with a reason --- */
const again = Ch.pick(G, G.sys, G.galaxy);
const stillBarren = again && again.target && again.target.id === found.barren.id;
log('\nafter publishing, the barren sheet is ' +
            (stillBarren ? 'STILL ON OFFER - wrong' : 'off the list - right'));
G.surveys[kRich] && delete G.surveys[kRich];
await wait(300);
log('  with nothing else here, the row says: "' + Ch.why(G, G.sys, G.galaxy) + '"');
await key('F4');
await wait(700);
await shot('desk-spent');

/* --- publish the rich one, so the Guild goes cold, and read F7 --- */
if (found.rich) {
  giveSheet(found.rich, 1);
  G.standing.guild = 2;
  const r = Ch.publish(G, G.sys, G.galaxy, Sv.keyOf(G, found.rich.id),
                       { say: (t, s) => G.say && G.say(t, s) });
  log('\npublished the rich one: guild 2 -> ' + G.standing.guild +
              ' (' + (G.standing.guild < 0 ? 'cold, as it should be' : 'still warm') + ')');
}
await key('F7');
await wait(900);
await shot('standing');
log('\nF7 standing: guild ' + (G.standing.guild || 0) +
            '  carto ' + (G.standing.carto || 0) +
            '  carto ledger ' + JSON.stringify(G.carto));
return 'ok';
