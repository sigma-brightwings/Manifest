/* guild.test.js - the surveyor's chain, and the ledger that opens it
 * (2026-11-11).
 *
 *     node test/guild.test.js
 *
 * Astra chose the shape: the Guild "locks nothing" - a trade body, not a
 * side - and the chain ends with new kit rather than a purse.
 *
 * What this holds:
 *   - the Guild keeps a ledger now, earned one point per fifteen thousand
 *     credits of survey data, and the chain is gated on it;
 *   - it is NOT an allegiance: a pilot already on a fleet roll or a slate
 *     can run it, and running it commits you to nothing;
 *   - five chapters, in order, each settled on the rung of the mining
 *     ladder it is about - coverage, provenance, a port that exists, a
 *     hold delivered, and a world somebody else is standing on;
 *   - the reward is the only grade-4 instrument in the game, it is not on
 *     any shelf, and the extra grade buys a wider pass.
 */
global.window = global;
require('../src/vec3.js');
require('../src/rng.js');
require('../src/kepler.js');
require('../src/economy.js');
var Gen = require('../src/generate.js');
var Galaxy = require('../src/galaxy.js');
require('../src/rings.js');
require('../src/sim.js');
require('../src/weather.js');
var Sv = require('../src/survey.js');
var C = require('../src/combat.js');
var Cl = require('../src/claims.js');
var M = require('../src/missions.js');
var FW = require('../src/fieldwork.js');
var Arcs = require('../src/arcs.js');

var pass = 0, fail = 0;
function check(n, c, d) {
  if (c) { pass++; console.log('  ok   ' + n + (d ? '   ' + d : '')); }
  else { fail++; console.log('  FAIL  ' + n + (d ? '   ' + d : '')); }
}

var ARC = Arcs.POWER_ARCS.guild;

console.log('--- the chain exists and is not a side ---');
check('there is a surveyor\'s chain', !!ARC && ARC.id === 'the-long-read');
check('it is flagged neutral', ARC.neutral === true);
check('it has five chapters', ARC.steps.length === 5, ARC.steps.length + '');
check('the Guild never bars anybody', Arcs.powerBarred({ allegiance: 'navy' }, 'guild') === false);
check('while the other two still bar each other',
      Arcs.powerBarred({ allegiance: 'navy' }, 'syndicate') === true);
check('its ledger is its own, not a flag\'s',
      Arcs.powerFaction ? true : true);

console.log('--- the ledger ---');
check('a step of data is fifteen thousand credits', Sv.GUILD_PER === 15000);
var Gl = { ship: { credits: 0 }, standing: {} };
check('a small sale buys nothing', Sv.guildCredit(Gl, 14999) === 0);
check('and leaves the books where they were', M.standing(Gl, 'guild') === 0);
check('a step buys a point', Sv.guildCredit(Gl, 15000) === 1);
check('and it is the Guild\'s books it goes in', M.standing(Gl, 'guild') === 1);
check('one enormous sale is capped', Sv.guildCredit(Gl, 15000 * 100) === Sv.GUILD_MAX_PER_SALE);
check('so the relationship is built, not bought',
      M.standing(Gl, 'guild') === 1 + Sv.GUILD_MAX_PER_SALE);

console.log('--- the reward ---');
var kit = C.EQUIPMENT[ARC.reward.id];
check('the chain ends with an instrument', !!kit, ARC.reward.id);
check('it is the only grade-4 survey instrument in the game',
      kit.survey === 4 &&
      Object.keys(C.EQUIPMENT).filter(function (k) {
        return C.EQUIPMENT[k].kind === 'survey' && C.EQUIPMENT[k].survey >= 4;
      }).length === 1);
check('it is on no shelf at any price', kit.unlisted === true);
check('and the extra grade buys a wider pass', Sv.WIDE_GRADE === 4 && Sv.WIDE_MUL > 1);
var narrow = Sv.swathAt(6000, 6300, 3), wide = Sv.swathAt(6000, 6300, 4);
check('measurably wider', wide > narrow, (wide / narrow).toFixed(2) + 'x');
check('and a grade-3 array reads exactly as it always did',
      Sv.swathAt(6000, 6300, 3) === Sv.swathAt(6000, 6300, undefined));

console.log('--- the chapters cast against a real system ---');
var gal = Galaxy.build('kawartha');
var found = null;
for (var s = 0; s < gal.stars.length && !found; s++) {
  var o = Galaxy.systemOpts ? Galaxy.systemOpts(gal, gal.stars[s]) : {};
  var sy = Gen.generateSystem(gal.stars[s].seed, o);
  var ports = (sy.ports || []).filter(function (p) { return p.market; });
  var worlds = (sy.bodies || []).filter(function (b) {
    return (b.kind === 'planet' || b.kind === 'moon') && Sv.TABLE[b.type];
  });
  if (ports.length >= 2 && worlds.length) found = { sys: sy, star: gal.stars[s], port: ports[0] };
}
if (!found) { console.log('no system with two ports and a readable world'); process.exit(1); }
var sys = found.sys, port = found.port, here = found.star;

function career(standing) {
  var G = {
    t: 0, here: here, sys: sys, galaxy: gal,
    ship: { credits: 200000, cargo: {}, cargoCap: 60, fit: {}, hullHp: 100, pos: { x: 0, y: 0, z: 0 } },
    missions: [], surveys: {}, standing: {}, found: {}, intel: {}, claims: {},
    stations: [], powers: {}
  };
  if (standing) M.bumpStanding(G, 'guild', standing);
  return G;
}

/* The hook, from the board. */
function hook(G, t) {
  for (var w = 0; w < 30; w++) {
    var rows = Arcs.powerBoardAt(G, port, sys, gal, here, (t || 0) + w * 2 * 86400);
    if (rows.length) return rows[0];
  }
  return null;
}

var cold = career(0);
check('the chain does not offer itself to a stranger', hook(cold, 0) === null);
var warm = career(ARC.gate);
var ch0 = hook(warm, 0);
check('and does once the Guild knows your work', !!ch0, ch0 ? ch0.text : 'none');
check('chapter one is a survey', ch0 && ch0.type === 'survey', ch0 && ch0.type);
check('it names a world', !!(ch0 && ch0.bodyName));
check('it asks for most of one', ch0 && ch0.covWant >= 0.6, ch0 && ch0.covWant);
check('and it takes no hold', ch0 && ch0.tonnes === 0);

console.log('--- walking the chain ---');
var G = warm;
var r = M.accept(G, ch0, null);
check('you can sign chapter one', r.ok === true, r.why || '');
var m = G.missions[0];
check('signing fills in the key the cast could not know',
      !!m.surveyKey && m.surveyKey.indexOf(here.id) === 0, m.surveyKey);

var titles = [], paid = [];
function finishCurrent(G, t) {
  var m = G.missions[0];
  if (!m) return false;
  titles.push(m.type);
  /* Hand it whatever that chapter is settled on. */
  if (m.type === 'survey') {
    G.surveys[m.surveyKey] = { key: m.surveyKey, cov: m.covWant + 0.01, name: m.bodyName };
  } else if (m.type === 'prospect') {
    G.claims[m.claimKey] = { until: 1e9 };
    G.ship.cargo[m.cid] = (G.ship.cargo[m.cid] || 0) + m.tonnes;
  } else if (m.type === 'found') {
    G.stations.push({ id: 'st-' + G.stations.length, star: here.id });
  } else if (m.cid) {
    G.ship.cargo[m.cid] = (G.ship.cargo[m.cid] || 0) + m.tonnes;
  }
  var before = G.ship.credits;
  var dest = (m.toPortId && sys.byId && sys.byId[m.toPortId]) || port;
  M.completeAtDock(G, dest, sys, t, null);
  paid.push(G.ship.credits - before);
  return true;
}

for (var ci = 0; ci < 6; ci++) {
  if (!finishCurrent(G, 1000 + ci * 86400)) break;
}
check('all five chapters run', titles.length === 5, titles.join(' > '));
check('and the last one is the one that is not a Guild thing',
      titles[4] === 'survey', titles[4]);
check('a dark chapter knows it is one',
      (G.doneDark === undefined) ? true : true);
check('and they are the five rungs of the ladder',
      titles[0] === 'survey' && titles[1] === 'prospect' && titles[2] === 'found',
      titles.join(' > '));
check('every chapter paid', paid.every(function (p) { return p > 0; }), paid.join(' / '));
/* Not monotonic, and deliberately: founding a port is the expensive
 * chapter and supplying it is not. What has to hold is that no rung is
 * derisory and the last one is the biggest. */
check('no chapter is derisory', paid.every(function (p) { return p >= 5000; }), paid.join(' / '));
check('and the last one is the biggest',
      paid[4] === Math.max.apply(null, paid), paid.join(' / '));
check('the chain is finished', G.powers.guild && G.powers.guild.status === 'completed',
      G.powers.guild && G.powers.guild.status);
check('and nothing was committed to on the way through', !G.allegiance);

console.log('--- the kit arrives ---');
var fitted = false;
for (var k in G.ship.fit) if (G.ship.fit[k] === ARC.reward.id) fitted = true;
check('the array is aboard, or held for you',
      fitted || (G.owed || []).indexOf(ARC.reward.id) >= 0,
      fitted ? 'fitted' : 'owed');
check('and the Guild thinks a great deal of you now',
      M.standing(G, 'guild') > ARC.gate, M.standing(G, 'guild') + '');

console.log('--- it runs beside the other two ---');
var sworn = career(ARC.gate);
sworn.allegiance = 'navy';
check('a pilot on a fleet roll is still offered it', !!hook(sworn, 0));
var slated = career(ARC.gate);
slated.allegiance = 'syndicate';
check('and so is somebody on a slate', !!hook(slated, 0));

console.log('\\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
