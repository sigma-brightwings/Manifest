/* mark.test.js - the pirate mark, and framing a tug (Phase 18, 2026-10-31).
 *
 *     node test/mark.test.js
 *
 * Astra chose to build the framing along with the mark, as PLAN.md Phase 18
 * has it. Pinned here:
 *  - on the cable, the contraband in your hold is what you could plant, worst
 *    first, graded by the tug's own faction;
 *  - planting moves it into her hold and is witnessed by her crew, never
 *    anonymously, with the usual window before they call it in; a Navy
 *    tender's log is sealed;
 *  - a serious frame (arms, milfuel) that is reported marks you; a frame in
 *    narcotics is only a bounty; a frame nobody files marks nobody, and her
 *    crew answer for it at the port;
 *  - the mark pins standing at -100: nothing raises it, and it reads MARKED;
 *  - twelve pirate kills, anywhere, each pirate once, lift it to -40, for
 *    every faction holding one at once;
 *  - the mark and the tug go in the save.
 */
'use strict';

var path = require('path');
var SRC = path.join(__dirname, '..', 'src');
global.window = global;
require(path.join(SRC, 'vec3.js'));
require(path.join(SRC, 'kepler.js'));
require(path.join(SRC, 'rng.js'));
require(path.join(SRC, 'economy.js'));
var Gen = require(path.join(SRC, 'generate.js'));
var Galaxy = require(path.join(SRC, 'galaxy.js'));
var Sim = require(path.join(SRC, 'sim.js'));
var Combat = require(path.join(SRC, 'combat.js'));
var Missions = require(path.join(SRC, 'missions.js')) || global.Missions;
var Save = require(path.join(SRC, 'save.js'));
Missions = global.Missions;

var pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail !== undefined ? '   ' + detail : '')); }
}
function section(n) { console.log('\n' + n); }

var SEED = 'kawartha';
var galaxy = Galaxy.build(SEED);
var star = galaxy.stars.filter(function (s) {
  var f = galaxy.factionById[s.factionId];
  return f && !f.outlaw;
})[0];
var sys = Gen.generateSystem(star.seed, { faction: galaxy.factionById[star.factionId], allFactions: galaxy.factions });
sys.starId = star.id;
var port = sys.bodies.filter(function (b) { return b.market && !b.surface && !b.underground; })[0] ||
           sys.bodies.filter(function (b) { return b.market; })[0];
var FAC = port.faction || star.factionId;

function makeG(who) {
  var planet = sys.bodies.filter(function (b) { return b.kind === 'planet'; })[0];
  var ship = Sim.circularOrbit(planet, sys, 0, planet.radius * 0.6, 0.1, 0);
  ship.credits = 5000; ship.cargo = { arms: 6, narcotics: 4 }; ship.passengers = 0;
  Combat.initShip(ship);
  Sim.refreshShip(ship);
  ship.shipName = 'Brightwing'; ship.bornId = 'hull-A';
  var G = { seed: SEED, ship: ship, sys: sys, t: 1000, galaxy: galaxy, here: star,
            standing: {}, wanted: {}, missions: [], doneMissions: {}, distress: [] };
  Sim.beginTow(ship, port, sys, G.t, 3600);
  ship.tow.tug = { name: 'Halden Tug 3', fac: FAC, who: who || 'harbour' };
  return G;
}
function hooks() { var h = { said: [], say: function (m) { h.said.push(m); }, sound: function () {} }; return h; }
function fileNow(G, h) {
  if (G.pendingReport) G.pendingReport.at = G.t + 1;
  Combat.update(sys, G, G.t + 30, 0.05, h);
}

section('on the cable, what could go in her hold');
var G = makeG();
var pl = Combat.plantables(G);
check('your contraband is offered, worst first', pl.length === 2 && pl[0].cid === 'arms' && pl[1].cid === 'narcotics',
      JSON.stringify(pl));
check('and nothing is offered off the cable', Combat.plantables({ ship: { cargo: { arms: 3 } } }).length === 0);

section('planting arms: a serious frame, witnessed by her crew');
var h = hooks();
var r = Combat.plantInTug(sys, G, G.t, 'arms', h);
check('it goes', r.ok && r.kind === 'frameSerious' && r.tonnes === 6, JSON.stringify(r));
check('out of your hold and into hers', !G.ship.cargo.arms && G.ship.tow.planted.arms === 6);
check('her crew saw it, with the usual window to deal with them',
      G.pendingReport && /Halden Tug 3/.test(G.pendingReport.by) && G.pendingReport.kind === 'frameSerious' &&
      G.pendingReport.at > G.t && !G.pendingReport.anon, JSON.stringify(G.pendingReport));
G.ship.silent = true;
var G1 = makeG(); G1.ship.silent = true;
Combat.plantInTug(sys, G1, G1.t, 'arms', hooks());
check('running silent does not hide it: they have you on their cable', G1.pendingReport && !G1.pendingReport.anon);
fileNow(G, h);
check('reported, it marks you with her faction', Combat.isMarked(G, FAC), JSON.stringify(G.marks));
check('standing pinned at the floor', Missions.standing(G, FAC) === Combat.MARK_FLOOR);
check('and a bounty is posted for the frame', (G.wanted[FAC] || 0) >= 9000, G.wanted[FAC]);
check('the readout says MARKED, not HOSTILE', /^MARKED 0\/12/.test(Missions.standingLabel(-100, G, FAC)),
      Missions.standingLabel(-100, G, FAC));
check('without the faction it is just a bad number', Missions.standingLabel(-100) === 'HOSTILE');

section('the pin');
Missions.bumpStanding(G, FAC, 30);
check('a contract or a trade does not lift it', Missions.standing(G, FAC) === -100);
Missions.bumpStanding(G, FAC, -30);
check('nor push it anywhere else', Missions.standing(G, FAC) === -100);

section('narcotics: smuggling with their name on it');
var G2 = makeG();
var r2 = Combat.plantInTug(sys, G2, G2.t, 'narcotics', hooks());
check('an ordinary frame', r2.ok && r2.kind === 'frame');
fileNow(G2, hooks());
check('reported, it is a bounty and not a mark', !Combat.isMarked(G2, FAC) && (G2.wanted[FAC] || 0) >= 1500);

section('nobody files');
var G3 = makeG();
Combat.plantInTug(sys, G3, G3.t, 'arms', hooks());
G3.pendingReport = null;               // bought, or leaned on
fileNow(G3, hooks());
check('no report, no mark', !Combat.isMarked(G3, FAC) && !(G3.wanted[FAC] > 0));
var h3 = hooks();
var line = Combat.towDelivered(G3, port, h3);
check('her crew answer for it at the port', line && /board the Halden Tug 3/.test(line) && /arms|Restricted arms/i.test(line), line);
check('and it is off the books after', !G3.ship.tow.planted);

section('a Navy tender');
var G4 = makeG('navy');
Combat.plantInTug(sys, G4, G4.t, 'arms', hooks());
check('her log is sealed: not for sale', G4.pendingReport && G4.pendingReport.sealed === true);

section('the road back');
var h5 = hooks();
G.marks.other = { at: 0, kills: 0 }; G.standing.other = -100;
for (var i = 0; i < 11; i++) Combat.creditPirateKill(G, { id: 'pirate-' + i, kind: 'pirate' }, 2000 + i, h5);
check('eleven kills are not enough', Combat.isMarked(G, FAC) && G.marks[FAC].kills === 11);
Combat.creditPirateKill(G, { id: 'pirate-3', kind: 'pirate' }, 3000, h5);
check('the same pirate counts once', G.marks[FAC].kills === 11);
check('the readout counts the way back', /^MARKED 11\/12/.test(Missions.standingLabel(-100, G, FAC)));
Combat.creditPirateKill(G, { id: 'pirate-11', kind: 'pirate' }, 3100, h5);
check('the twelfth lifts it', !Combat.isMarked(G, FAC) && Missions.standing(G, FAC) === Combat.MARK_RELEASE,
      Missions.standing(G, FAC));
check('for every faction holding one at once', !Combat.isMarked(G, 'other') && G.standing.other === Combat.MARK_RELEASE);
check('and the open channel says so', h5.said.some(function (m) { return /MARK LIFTED/.test(m); }));
Missions.bumpStanding(G, FAC, 5);
check('after which standing moves again', Missions.standing(G, FAC) === Combat.MARK_RELEASE + 5);
check('a kill with no mark on you credits nothing', Combat.creditPirateKill({ marks: {} }, { id: 'x' }, 0) === 0);

section('the save');
var G6 = makeG();
Combat.plantInTug(sys, G6, G6.t, 'arms', hooks());
fileNow(G6, hooks());
var snap = JSON.parse(JSON.stringify(Save.snapshot(G6)));
check('the mark is saved', snap.marks && snap.marks[FAC] && snap.marks[FAC].kills === 0, JSON.stringify(snap.marks));
var shipSnap = snap.ship || {};
check('and the tug on the cable with what is in her hold',
      shipSnap.tow && shipSnap.tow.tug && shipSnap.tow.tug.name === 'Halden Tug 3' && shipSnap.tow.planted.arms === 6,
      JSON.stringify(shipSnap.tow));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
