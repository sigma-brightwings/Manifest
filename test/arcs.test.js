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

section('--- the two powers, and the choice between them ---');
(function () {
  /* Astra: "The Navy campaign should have a fairly in-depth story", and
   * "anything you do for the military power in the region, also do for
   * Syndicate, since they're basically the alternative."
   *
   * Everything above this line is a faction-neutral SHAPE cast against
   * whatever is at the port. These two are AUTHORED, and the tests below
   * are about the things authorship buys that generation cannot: the same
   * five chapters in the same order every time, with the same words. */
  var navy = Arcs.POWER_ARCS.navy, syn = Arcs.POWER_ARCS.syndicate;
  check('both powers have a chain', !!navy && !!syn);
  check('and the navy\'s is in depth rather than a three-step shape',
        navy.steps.length >= 5, navy.steps.length + ' chapters');
  check('the Syndicate gets the same depth, not a stub',
        syn.steps.length === navy.steps.length,
        syn.steps.length + ' against ' + navy.steps.length);
  check('every chapter is written rather than generated',
        navy.steps.concat(syn.steps).every(function (st) {
          return st.title && st.text && st.text.length > 60;
        }));
  check('and the two chains end in different things',
        navy.reward.id !== syn.reward.id,
        navy.reward.id + ' / ' + syn.reward.id);

  /* THE POINT OF NO RETURN. Not a difficulty gate and not a morality
   * meter: the two powers simply stop being able to use somebody the
   * other one has. */
  var G = { ship: { credits: 0, cargo: {}, fit: {} }, standing: {}, missions: [],
            powers: {}, t: 0 };
  Combat.initShip(G.ship); Sim.refreshShip(G.ship);
  check('with no allegiance both doors are open',
        !Arcs.powerBarred(G, 'navy') && !Arcs.powerBarred(G, 'syndicate'));
  G.allegiance = 'navy';
  check('taking one shuts the other', Arcs.powerBarred(G, 'syndicate'));
  check('and leaves your own open', !Arcs.powerBarred(G, 'navy'));

  /* The warning lands a chapter EARLY, because a point of no return the
   * player did not see coming is a bug rather than a decision. The chapter
   * before the fork is the one that says so. */
  check('the fork is far enough in to have earned it',
        Arcs.POINT_OF_NO_RETURN >= 2 && Arcs.POINT_OF_NO_RETURN < navy.steps.length - 1,
        'chapter ' + (Arcs.POINT_OF_NO_RETURN + 1) + ' of ' + navy.steps.length);
})();

section('--- running the navy chain end to end ---');
(function () {
  /* The data being right is not the same as the chain working. This runs
   * it: find a real carrier in a real galaxy, take chapter zero off its
   * board, and deliver every chapter to the end. */
  var galaxy = Galaxy.build('kawartha');
  var found = null;
  for (var i = 0; i < galaxy.stars.length && !found; i++) {
    var star = galaxy.stars[i];
    var sys = systemForStar(galaxy, star);
    for (var p = 0; p < sys.ports.length; p++) {
      if (Combat.fleetPort(sys.ports[p])) {
        found = { star: star, sys: sys, port: sys.ports[p] };
        break;
      }
    }
  }
  check('the galaxy has a carrier to start the chain at', !!found,
        found && found.port.name);
  if (!found) return;

  var G = makeDockedG(found.sys, found.port, galaxy, found.star);
  G.powers = {};
  var fac = found.port.faction;
  Missions.bumpStanding(G, fac, 40);

  var board = Arcs.powerBoardAt(G, found.port, found.sys, galaxy, found.star, G.t);
  check('the carrier posts chapter one', board.length === 1,
        board.length + ' offers');
  if (!board.length) return;
  check('and it is named rather than generated',
        /Powder Chain/.test(board[0].text), board[0].text);

  var res = Missions.accept(G, board[0], HOOKS);
  check('it signs', res.ok, res.why);

  var state = { G: G, galaxy: galaxy };
  var chapters = 1, guard = 0;
  var arc = Arcs.POWER_ARCS.navy;
  while (G.missions.length && guard++ < 12) {
    var m = G.missions[0];
    if (!m.power) break;
    /* The chain hands you the next chapter's freight at the dock, so the
     * only thing a delivery needs is to arrive. */
    deliver(state, m, 3600);
    if (G.missions.length && G.missions[0].power && G.missions[0].step > m.step) chapters++;
    else break;
  }
  console.log('  ran ' + chapters + ' of ' + arc.steps.length +
              ' chapters; allegiance ' + (G.allegiance || 'none'));
  check('the chain ran past the fork rather than stalling at it',
        chapters > Arcs.POINT_OF_NO_RETURN,
        chapters + ' chapters');
  check('and taking the third chapter picked a side',
        G.allegiance === 'navy', String(G.allegiance));
  check('which closed the other one', !!G.powers.syndicate &&
        G.powers.syndicate.status === 'barred',
        JSON.stringify(G.powers.syndicate || null));
  check('the Syndicate will not post its hook to somebody on a fleet roll',
        Arcs.powerBoardAt(G, found.port, found.sys, galaxy, found.star, G.t)
          .every(function (o) { return o.power !== 'syndicate'; }));

  /* AND IT RAN TO THE END, which is the thing an authored chain has to do
   * that a generated one does not. A shape that cannot be cast at this
   * port can be picked up at the next port of the same flag; a story that
   * stops at chapter three leaves the player holding a plot. */
  check('the chain reached its last chapter', chapters === arc.steps.length,
        chapters + ' of ' + arc.steps.length);
  check('and it is recorded as finished rather than abandoned',
        !!G.powers.navy && G.powers.navy.status === 'completed',
        JSON.stringify(G.powers.navy || null));

  /* THE REWARD IS A FITTING RATHER THAN A NUMBER, which is the point of
   * running it: standing can be earned by anybody with a hold and a
   * decade, and this cannot be bought at all. */
  var fitted = Combat.transponderKind(G.ship);
  check('the navy issues the transponder it does not sell',
        fitted === 'issued' || (G.owed || []).indexOf('transponder') >= 0,
        String(fitted) + ' / owed ' + JSON.stringify(G.owed || []));
  if (fitted === 'issued') {
    check('and it passes everywhere, unlike the forgery',
          Combat.transponderPasses(G.ship, { id: 'anywhere-at-all' }));
  }
})();

section('--- a transponder that can fail ---');
(function () {
  /* The issued transponder has carried a note since it landed: "a forged
   * transponder is a good idea for later and a different item: it should
   * be able to fail, and this one cannot." It is the Syndicate chain's
   * reward the way the issued one is the navy's. */
  var ship = {};
  Combat.initShip(ship); Sim.refreshShip(ship);
  check('a bare ship answers no challenge', !Combat.hasTransponder(ship));
  check('and has no papers of either kind', Combat.transponderKind(ship) === null);

  var slot = Combat.canFit(ship, 'forgedtransponder');
  check('the forgery fits an internal slot', slot.ok, slot.why);
  ship.fit[slot.key] = 'forgedtransponder';
  Combat.syncLegacy(ship);
  check('it answers the challenge at all', Combat.hasTransponder(ship));
  check('and it knows what it is', Combat.transponderKind(ship) === 'forged');

  /* YOU CANNOT CARRY BOTH. They are the same box with different paperwork
   * and the game should not let you hedge. */
  var both = Combat.canFit(ship, 'transponder');
  check('the issued one will not fit beside it', !both.ok, JSON.stringify(both));

  /* IT FAILS BY PLACE, NOT BY DICE. A roll at the moment of jumping is a
   * jump that sometimes kills you for no reason you could have known;
   * hashed off the star and the registration it is a fact about a place,
   * which is what lets the chart warn you before you commit. */
  ship.reg = 'AB-1234';
  var stars = [];
  for (var i = 0; i < 400; i++) stars.push({ id: 'star-' + i });
  var passed = stars.filter(function (st) { return Combat.forgedPasses(st, ship); }).length;
  console.log('  a forgery passes at ' + passed + ' of ' + stars.length + ' stars');
  check('a forgery works in most places and not all of them',
        passed > stars.length * 0.5 && passed < stars.length * 0.85,
        passed + ' of ' + stars.length);
  check('and the same star gives the same answer every time',
        stars.every(function (st) {
          return Combat.forgedPasses(st, ship) === Combat.forgedPasses(st, ship);
        }));
  /* A different ship's papers are a different forgery. */
  var other = { reg: 'ZK-9911' };
  var differ = stars.filter(function (st) {
    return Combat.forgedPasses(st, ship) !== Combat.forgedPasses(st, other);
  }).length;
  check('somebody else\'s forgery fails somewhere else', differ > 20,
        differ + ' stars disagree');

  /* AND THE ISSUED ONE NEVER FAILS, which is what the navy's chain is
   * actually paying you in. */
  var clean = {};
  Combat.initShip(clean); Sim.refreshShip(clean);
  var s2 = Combat.canFit(clean, 'transponder');
  clean.fit[s2.key] = 'transponder';
  Combat.syncLegacy(clean);
  clean.reg = 'AB-1234';
  check('an issued transponder passes everywhere',
        stars.every(function (st) { return Combat.transponderPasses(clean, st); }));
  check('and the forgery does not', !stars.every(function (st) {
        return Combat.transponderPasses(ship, st); }));

  /* NOBODY SELLS IT. The whole of what it is worth is that it cannot be
   * bought, so it must not appear on a shelf with a reason attached —
   * that would advertise the Syndicate's chain to somebody who has not
   * run it. */
  var G2 = { ship: clean, standing: {}, wanted: {}, sys: { crimeScore: 90, corruption: 90 } };
  var shelf = Combat.stockAt(G2, { faction: 'outlaw', market: { dev: 1 } });
  check('and it is on no shelf anywhere',
        shelf.every(function (row) { return row.item.id !== 'forgedtransponder'; }),
        String(shelf.length) + ' rows');
})();

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
