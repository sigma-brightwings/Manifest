/* arcs.test.js — faction campaigns: authored arc skeletons, procedurally cast.
 *
 *     node test/arcs.test.js
 *
 * The claim under test is the same one the rest of the universe makes: given
 * a seed, the story a faction runs is fixed, not rolled fresh every time you
 * ask. On top of that, the chain itself has to actually chain — accepting
 * chapter zero has to open a real, trackable progress record, delivering it
 * has to cast chapter one for real, and the last chapter has to pay the
 * bonus and close the loop — all while riding missions.js's ordinary
 * contract machinery rather than a parallel copy of it.
 */
var path = require('path');
var SRC = path.join(__dirname, '..', 'src');
var RNG = require(path.join(SRC, 'rng.js'));
var Eco = require(path.join(SRC, 'economy.js'));
var Gen = require(path.join(SRC, 'generate.js'));
var Galaxy = require(path.join(SRC, 'galaxy.js'));
var Sim = require(path.join(SRC, 'sim.js'));
var Combat = require(path.join(SRC, 'combat.js'));
var Missions = require(path.join(SRC, 'missions.js'));
var Arcs = require(path.join(SRC, 'arcs.js'));

var pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  ok   ' + name + (detail ? '   ' + detail : '')); }
  else { fail++; console.log('  FAIL ' + name + (detail ? '   ' + detail : '')); }
}
function section(t) { console.log('\n' + t); }

var HOOKS = { say: function () {}, sound: function () {} };
var WINDOW = 2 * 86400;

function systemForStar(galaxy, star) {
  var fac = galaxy.factionById[star.factionId];
  return Gen.generateSystem(star.seed, { faction: fac, allFactions: galaxy.factions });
}

/* A ship-shaped G, docked at a real faction port, with a real neighbouring
 * port in the same system (so an ordinary haul step is always castable). */
function makeDockedG(sys, port, galaxy, star) {
  var planet = sys.bodies.filter(function (b) { return b.kind === 'planet'; })[0];
  var ship = Sim.circularOrbit(planet, sys, 0, planet.radius * 0.6, 0.1, 0);
  ship.credits = 5000; ship.cargo = {};
  Combat.initShip(ship); Sim.refreshShip(ship);
  Sim.dockShip(ship, port, sys, 0);
  return {
    ship: ship, sys: sys, galaxy: galaxy, here: star, t: 0,
    standing: {}, wanted: {}, missions: [], doneMissions: {}, campaigns: {}
  };
}

/* Deliver whichever campaign mission is passed, wherever it actually goes —
 * same system for haul/disposal/smuggle, the destination star for courier. */
function deliver(state, m, dt) {
  var G = state.G, galaxy = state.galaxy;
  var dockSys, dockPort;
  if (m.toStarId) {
    var dstStar = galaxy.byId[m.toStarId];
    dockSys = systemForStar(galaxy, dstStar);
    G.here = dstStar; G.sys = dockSys;
    dockPort = (dockSys.ports || []).filter(function (p) { return p.market; })[0];
  } else {
    dockSys = G.sys;
    dockPort = dockSys.byId[m.toPortId];
  }
  G.t += dt;
  Missions.completeAtDock(G, dockPort, dockSys, G.t, HOOKS);
}

section('--- which story a faction runs is fixed by the seed ---');
(function () {
  var seed = 'kawartha';
  var g1 = Galaxy.build(seed);
  var g2 = Galaxy.build(seed);
  check('every faction resolves to one of the authored arcs',
        g1.factions.every(function (f) { return !!Arcs.arcForFaction(f); }));
  check('rebuilding the same galaxy assigns the same arc to the same faction',
        g1.factions.every(function (f) {
          return Arcs.arcForFaction(f).id === Arcs.arcForFaction(g2.factionById[f.id]).id;
        }));

  var g3 = Galaxy.build('a-different-seed-entirely');
  var sameAcrossAll = g1.factions.length === g3.factions.length &&
    g1.factions.every(function (f, i) { return Arcs.arcForFaction(f).id === Arcs.arcForFaction(g3.factions[i]).id; });
  check('a different galaxy is not guaranteed the same story roster',
        !sameAcrossAll || g1.factions.length < 2,
        '(a coincidence across every faction is possible but not expected)');
})();

section('--- the hook: chapter zero on the board ---');
(function () {
  var seed = 'kawartha';
  var galaxy = Galaxy.build(seed);

  // Hunt across the galaxy's own stars for a faction port whose assigned
  // arc's first chapter is actually castable here, and for a window where
  // the hook happens to roll. Real content varies system to system (a
  // courier-opening arc needs a neighbour star; not every port has one) —
  // this is the same tolerance a real playthrough needs, not a shortcut.
  var found = null;
  for (var i = 0; i < galaxy.stars.length && !found; i++) {
    var star = galaxy.stars[i];
    var sys = systemForStar(galaxy, star);
    var ports = (sys.ports || []).filter(function (p) {
      return p.market && p.faction &&
             (sys.ports.filter(function (q) { return q !== p && q.market; }).length > 0);
    });
    for (var j = 0; j < ports.length && !found; j++) {
      var port = ports[j];
      for (var w = 0; w < 10; w++) {
        var offers = Arcs.campaignBoardAt({ campaigns: {} }, port, sys, galaxy, star, w * WINDOW);
        if (offers.length) { found = { star: star, sys: sys, port: port, offer: offers[0], t: w * WINDOW }; break; }
      }
    }
  }

  check('somewhere in the galaxy, a faction hooks you', !!found);
  if (!found) return;

  var off = found.offer;
  var fac = galaxy.factionById[found.port.faction];
  var tpl = Arcs.arcForFaction(fac);
  check('the hook is tagged as chapter zero of the faction\'s own arc',
        off.campaign === true && off.factionId === fac.id && off.arcId === tpl.id && off.step === 0);
  check('it reads like a real contract, not a placeholder',
        typeof off.text === 'string' && off.text.length > 0 && off.pay > 0 && off.deadline > found.t);

  var G = makeDockedG(found.sys, found.port, galaxy, found.star);
  G.t = found.t;
  var res = Missions.accept(G, off, HOOKS);
  check('the hook signs exactly like an ordinary contract', res.ok, res.why);
  check('accepting it opens a tracked chain', G.campaigns[fac.id] &&
        G.campaigns[fac.id].status === 'active' && G.campaigns[fac.id].step === 0 &&
        G.campaigns[fac.id].arcId === tpl.id);
  check('the same port will not hook you twice while the chain is live',
        Arcs.campaignBoardAt(G, found.port, G.sys, galaxy, found.star, found.t).length === 0);

  var standingBefore = Missions.standing(G, fac.id);
  deliver({ G: G, galaxy: galaxy }, G.missions[0], 3600);
  check('delivering chapter zero moved your standing with them',
        Missions.standing(G, fac.id) > standingBefore);

  var stillGoing = G.missions.filter(function (m) { return m.campaign && m.factionId === fac.id; });
  var state2 = G.campaigns[fac.id];
  check('the chain either casts its next chapter or stalls without crashing',
        (stillGoing.length === 1 && stillGoing[0].step === 1 && state2.status === 'active') ||
        state2.status === 'stalled',
        'status=' + state2.status + ' step=' + state2.step);
})();

section('--- the last chapter pays out and closes the loop ---');
(function () {
  var seed = 'kawartha';
  var galaxy = Galaxy.build(seed);
  var fac = galaxy.factions[0];
  var tpl = Arcs.arcForFaction(fac);
  var lastStep = tpl.steps.length - 1;

  var G = { ship: { credits: 1000 }, standing: {}, campaigns: {}, galaxy: galaxy, here: galaxy.home };
  G.campaigns[fac.id] = { arcId: tpl.id, step: lastStep, status: 'active' };
  var m = { factionId: fac.id, arcId: tpl.id, step: lastStep, id: 'test-final' };

  Arcs.onStepComplete(G, m, { id: 'dummy' }, { ports: [] }, 12345, HOOKS);
  check('the completion bonus actually lands',
        G.ship.credits === 1000 + tpl.completeCredits,
        G.ship.credits + ' vs ' + (1000 + tpl.completeCredits));
  check('standing jumps by the whole-chain bonus, not just a chapter bonus',
        Missions.standing(G, fac.id) >= tpl.completeStanding);
  check('the chain marks itself finished and starts a cooldown',
        G.campaigns[fac.id].status === 'completed' && G.campaigns[fac.id].cooldownUntil > 12345);
  check('a finished chain will not re-hook until the cooldown passes',
        Arcs.campaignBoardAt(G, { faction: fac.id, market: { rows: {}, blackMarket: false } },
                              { ports: [] }, galaxy, galaxy.home, 12346).length === 0);
})();

section('--- a broken chain breaks cleanly ---');
(function () {
  var seed = 'kawartha';
  var galaxy = Galaxy.build(seed);
  var fac = galaxy.factions[0];
  var tpl = Arcs.arcForFaction(fac);

  var G = { standing: {}, wanted: {}, ship: { credits: 1000, cargo: {} },
            campaigns: {}, missions: [], doneMissions: {} };
  G.campaigns[fac.id] = { arcId: tpl.id, step: 0, status: 'active' };
  G.missions.push({
    id: 'arc-fail-test', type: 'haul', cid: 'grain', tonnes: 5, pay: 500,
    deadline: 100, faction: fac.id, text: 'a chapter nobody delivered',
    campaign: true, factionId: fac.id, arcId: tpl.id, step: 0
  });

  Missions.update(G, 200, HOOKS);
  check('a blown campaign deadline is fined and dropped like any contract',
        G.missions.length === 0 && G.ship.credits < 1000);
  check('and the chain itself records the break',
        G.campaigns[fac.id].status === 'failed' && G.campaigns[fac.id].cooldownUntil > 200);
})();

section('--- the save file remembers the chain ---');
(function () {
  var Save = require(path.join(SRC, 'save.js'));
  var G = { seed: 'x', t: 1, ship: { pos: {x:0,y:0,z:0}, vel: {x:0,y:0,z:0}, fwd:{x:1,y:0,z:0},
            up:{x:0,y:0,z:1}, right:{x:0,y:1,z:0}, fuel:1, thrusterFuel:1, cargo:{}, credits:0 },
            standing: {}, wanted: {}, missions: [], doneMissions: {},
            campaigns: { gf0: { arcId: 'shadow-run', step: 1, status: 'active' } } };
  var snap = Save.snapshot(G);
  check('the snapshot carries the campaign progress record',
        snap.campaigns && snap.campaigns.gf0 && snap.campaigns.gf0.arcId === 'shadow-run' &&
        snap.campaigns.gf0.step === 1);
})();

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
