/* stealth.test.js - the shroud suite, silent running, and the chains that
 * end with it (2026-10-19).
 *
 *     node test/stealth.test.js
 *
 * Astra: the quiet jammer is "hard to come by, probably at the end of [its]
 * own quest line - if you want to do a sabotage mission, you got to be able
 * to get in and out without being detected or identified."
 *   - nobody sells it; the suite is a chain's reward;
 *   - silent running: noticed only close in, no ID on crimes, thefts or a
 *     sabotage; heat builds with the radiators shut; firing or a hard burn
 *     breaks cover; not with the ECM on;
 *   - the sequel chains: offered only once the first chain is done; an
 *     infiltration run is blown by a search; the contact is two contracts
 *     and the first settled wins; a sabotage contract settles on the strike;
 *     the last chapter fits the suite.
 */
var path = require('path');
var SRC = path.join(__dirname, '..', 'src');
global.window = global.window || global;
require(path.join(SRC, 'vec3.js'));
require(path.join(SRC, 'rng.js'));
require(path.join(SRC, 'kepler.js'));
var Eco = require(path.join(SRC, 'economy.js'));
var Gen = require(path.join(SRC, 'generate.js'));
var Galaxy = require(path.join(SRC, 'galaxy.js'));
require(path.join(SRC, 'rings.js'));
var Sim = require(path.join(SRC, 'sim.js'));
var Combat = require(path.join(SRC, 'combat.js'));
var Missions = require(path.join(SRC, 'missions.js'));
var Arcs = require(path.join(SRC, 'arcs.js'));
require(path.join(SRC, 'claims.js'));
var V = global.V;

var pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  ok   ' + name + (detail ? '   ' + detail : '')); }
  else { fail++; console.log('  FAIL ' + name + (detail ? '   ' + detail : '')); }
}
function section(t) { console.log('\n' + t); }
var said = [];
var HOOKS = { say: function (m) { said.push(m); }, sound: function () {} };

function makeG() {
  var sys = Gen.generateSystem('kawartha');
  var planet = sys.bodies.filter(function (b) { return b.kind === 'planet'; })[0];
  var ship = Sim.circularOrbit(planet, sys, 0, planet.radius * 0.6, 0.1, 0);
  ship.credits = 5000; ship.cargo = {};
  Combat.initShip(ship); Sim.refreshShip(ship);
  return { ship: ship, sys: sys, t: 0, wanted: {}, standing: {}, missions: [], doneMissions: {}, beams: [], explosions: [] };
}

section('--- the suite ---');
var item = Combat.MODULES.shroud;
check('nobody sells it', !!item && item.unlisted === true && item.slot === 'internal');
var G = makeG();
check('no suite, no silent running', Combat.toggleSilent(G, HOOKS) === false);
G.ship.fit.internal0 = 'shroud';
G.ecmOn = true;
check('with it, SHIFT+X runs silent and the ECM goes off', Combat.toggleSilent(G, HOOKS) === true && G.ecmOn === false);
G.ship.throttle = 0;
Combat.updateCountermeasures(G.sys, G, 10, 0.1, HOOKS);
check('dark', G.ship.silent === true);
G.ship.throttle = 0.9;
Combat.updateCountermeasures(G.sys, G, 10.1, 0.1, HOOKS);
check('a hard burn breaks cover', G.ship.silent === false);
G.ship.throttle = 0;
Combat.breakCover(G, 10.2);
Combat.updateCountermeasures(G.sys, G, 12, 0.1, HOOKS);
check('so does firing, for a few seconds', G.ship.silent === false);
Combat.updateCountermeasures(G.sys, G, 16, 0.1, HOOKS);
check('then dark again', G.ship.silent === true);

section('--- the price is heat ---');
var cold = makeG();
cold.ship.pos = { x: 4.2e9, y: 3.9e9, z: 2e8 }; cold.ship.vel = { x: 0, y: 0, z: 0 };
cold.ship.heat = 0; cold.ship.silent = true;
var tLim = 0;
while (cold.ship.heat < Sim.HEAT_LIMIT && tLim < 1000) { Sim.updateHeating(cold.ship, cold.sys, 0, 1); tLim += 1; }
check('cover lasts a couple of minutes before the heat limit', tLim > 90 && tLim < 200, tLim + ' s');
cold.ship.silent = false;
for (var k = 0; k < 20; k++) Sim.updateHeating(cold.ship, cold.sys, 0, 1);
check('and the radiators dump it when you stop', cold.ship.heat < 1);

section('--- who notices ---');
var Gw = makeG();
var cop = (Gw.sys.patrols || []).filter(function (p) { return p.kind === 'police' && p.faction !== 'outlaw'; })[0];
check('(fixture) a lawful patrol', !!cop);
if (cop) {
  var st = Sim.patrolState(cop, Gw.sys, 0);
  Gw.ship.pos = V.addScaled(st.pos, { x: 1, y: 0, z: 0 }, 1000); Gw.ship.vel = V.clone(st.vel);
  Gw.ship.silent = true;
  Sim.updateEncounters(Gw.sys, 0, 0.01, Gw.ship);
  check('silent, a patrol 1,000 km off never stirs', !cop.live);
  Gw.ship.silent = false;
  Sim.updateEncounters(Gw.sys, 0, 0.01, Gw.ship);
  check('with the transponder on, it does', !!cop.live);
}

section('--- no ID ---');
var Ga = makeG();
/* report(G, kind, victim, hooks, how, loot, anon): the take came before the
 * ID when the two lines merged (2026-10-30), so nothing taken, no ID. */
Combat.report(Ga, 'assault', { faction: 'lawfac' }, HOOKS, 'witnessed', 0, true);
check('a crime reported without an ID carries no bounty', !(Ga.wanted.lawfac > 0) && /unidentified/.test(said[said.length - 1]));
Combat.report(Ga, 'assault', { faction: 'lawfac' }, HOOKS, 'witnessed', 0, false);
check('with one, it does', Ga.wanted.lawfac > 0);
var Gs = makeG(); Gs.ship.silent = true;
var portS = Gs.sys.ports[0];
Combat.reportSabotage(Gs.sys, Gs, 0, portS, HOOKS);
check('a silent sabotage is logged with no name on it', !(Gs.wanted[portS.faction || 'civil'] > 0));
Gs.ship.silent = false;
Combat.reportSabotage(Gs.sys, Gs, 0, portS, HOOKS);
check('a loud one is not', Gs.wanted[portS.faction || 'civil'] > 0);

section('--- the sequel chain, end to end (the Syndicate path) ---');
var gal = Galaxy.build('kawartha'), found = null;
for (var i = 0; i < gal.stars.length && !found; i++) {
  var stI = gal.stars[i];
  var facI = gal.factionById[stI.factionId];
  var sysI = Gen.generateSystem(stI.seed, { faction: facI, allFactions: gal.factions });
  var pO = (sysI.ports || []).filter(function (p) { return p.faction === 'outlaw' && p.market; })[0];
  var others = (sysI.ports || []).filter(function (p) { return p !== pO && p.market; });
  if (pO && others.length) found = { star: stI, sys: sysI, port: pO };
}
check('(fixture) a Syndicate port with neighbours', !!found);
if (found) {
  var Gq = makeG();
  Gq.sys = found.sys; Gq.galaxy = gal; Gq.here = found.star;
  Gq.ship.cargoCap = 200;
  Gq.standing = { outlaw: 60 }; Gq.allegiance = 'syndicate';
  var none = Arcs.powerBoardAt(Gq, found.port, found.sys, gal, found.star, 0);
  check('before the first chain is done, the dock offers the first chain', none.length === 0 || none[0].arcId === 'long-arrangement');
  Gq.powers = { syndicate: { status: 'completed' } };
  var board = [], tq = 0;
  for (var w = 0; w < 40 && !board.length; w++) { tq = w * 2 * 86400; board = Arcs.powerBoardAt(Gq, found.port, found.sys, gal, found.star, tq); }
  check('after it, the sequel', board.length === 1 && board[0].arcId === 'blackout' && board[0].infiltrate === true, board[0] && board[0].text);
  var m = board[0];
  Gq.missions.push(m);
  /* Searched on the way: blown. */
  var Gb = JSON.parse(JSON.stringify({ missions: [m] }));
  var realRandom = Math.random;
  Math.random = function () { return 0.01; };
  Gq.ship.cargo = {};
  var scanG = makeG(); scanG.missions = Gb.missions; scanG.t = tq; scanG.powers = { syndicate2: { status: 'active' } };
  scanG.ship.credits = 0;
  Combat.resolveScan(scanG, { name: 'Patrol 9', faction: 'f0' }, HOOKS);
  Math.random = realRandom;
  check('a search blows an infiltration run', scanG.missions[0].blownBy === 'Patrol 9' && scanG.missions[0].deadline < tq);
  Missions.update(scanG, tq, HOOKS);
  check('and the chain breaks on it, saying why', scanG.powers.syndicate2.status === 'failed' && /run is blown/.test(said.join(' ')));
  /* Unsearched: walk the chain. */
  function settle(mm) { Gq.missions = Gq.missions.filter(function (o) { return o !== mm; }); Arcs.onStepComplete(Gq, mm, found.port, found.sys, tq, HOOKS); }
  settle(m);
  var m1 = Gq.missions[Gq.missions.length - 1];
  check('then the hardware: recover it from a wreck', m1 && m1.step === 1 && /wreck/.test(m1.text), m1 && m1.text);
  settle(m1);
  var pair = Gq.missions.filter(function (o) { return o.choiceGroup; });
  check('then the contact: two contracts, deliver or let him run', pair.length === 2 &&
        pair.some(function (o) { return o.choice === 'deliver'; }) && pair.some(function (o) { return o.choice === 'run'; }));
  var run = pair.filter(function (o) { return o.choice === 'run'; })[0];
  var stBefore = Missions.standing(Gq, 'outlaw');
  settle(run);
  check('letting him run voids the other and costs standing', pair.filter(function (o) { return o.choice === 'deliver'; })[0].choiceVoid === true &&
        Missions.standing(Gq, 'outlaw') < stBefore + 8, 'standing ' + stBefore + ' -> ' + Missions.standing(Gq, 'outlaw'));
  Missions.update(Gq, tq, HOOKS);
  check('and the void one is dropped quietly', !Gq.missions.some(function (o) { return o.choiceVoid; }));
  var sab = Gq.missions.filter(function (o) { return o.type === 'sabotage'; })[0];
  check('then a sabotage contract against a real port', !!sab && !!sab.toPortId, sab && sab.text);
  if (sab) {
    var tgt = found.sys.ports.filter(function (p) { return p.id === sab.toPortId; })[0];
    var cr0 = Gq.ship.credits;
    Missions.onSabotage(Gq, found.sys, tgt, tq, HOOKS);
    check('the strike settles it and pays', Gq.ship.credits > cr0 && Gq.missions.indexOf(sab) < 0);
    var last = Gq.missions[Gq.missions.length - 1];
    check('then out the way you came in', last && last.infiltrate === true && last.step === 4);
    Gq.ship.fit = {};
    settle(last);
    var fitted = Combat.hasShroud(Gq.ship) || (Gq.owed || []).indexOf('shroud') >= 0;
    check('and the reward is the suite', fitted && Gq.powers.syndicate2.status === 'completed');
  }
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
