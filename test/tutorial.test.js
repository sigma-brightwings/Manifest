/* tutorial.test.js — Captain Halloway's lessons (tutorial.js, 2026-11-02).
 *
 * Astra: "Write a tutorial which plays like a mission, but teaches the
 * player exactly how to maneuver their ship, how to make money ... when you
 * complete his tutorial, you get his old ship."
 *
 * What is pinned here: the run he picks is a real profit on a real market
 * in every sampled galaxy (doctrine 6 — measured, not assumed); each lesson
 * is passed by the ship's actual state and nothing else; running ahead
 * passes lessons early; a blown contract goes back to the board; and the
 * ship he hands over is an ordinary fleet record that the ordinary FLEET
 * row can take command of.
 *
 * Run: node test/tutorial.test.js
 */
'use strict';

var path = require('path');
var SRC = path.join(__dirname, '..', 'src');
global.window = global;
var V = require(path.join(SRC, 'vec3.js'));
require(path.join(SRC, 'kepler.js'));
require(path.join(SRC, 'rng.js'));
var Eco = require(path.join(SRC, 'economy.js'));
var Gen = require(path.join(SRC, 'generate.js'));
var Galaxy = require(path.join(SRC, 'galaxy.js'));
var Sim = require(path.join(SRC, 'sim.js'));
var Combat = require(path.join(SRC, 'combat.js'));
require(path.join(SRC, 'crew.js'));
var Fleet = require(path.join(SRC, 'fleet.js'));
require(path.join(SRC, 'missions.js'));
var Journal = require(path.join(SRC, 'journal.js'));
var T = require(path.join(SRC, 'tutorial.js'));

var pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail !== undefined ? '   ' + detail : '')); }
}
function section(n) { console.log('\n' + n); }

/* Where a new career starts, by main.js's own rule: the world under the
 * first orbital station, its ground port if it has one, else the station. */
function opening(seed) {
  var galaxy = Galaxy.build(seed);
  var star = galaxy.home;
  var sys = Gen.generateSystem(star.seed, Galaxy.systemOpts(galaxy, star));
  sys.starId = star.id;
  var host = null;
  for (var i = 0; i < sys.bodies.length; i++) {
    var b = sys.bodies[i];
    if (b.kind === 'station' && !b.surface && !host) host = b.parentBody;
  }
  if (!host) return null;
  var station = host.children.filter(function (c) { return c.kind === 'station' && !c.surface && c.orbit; })[0];
  var port = (sys.ports || []).filter(function (p) { return p.surface && p.parentBody === host && p.market; })[0] || station;
  return { galaxy: galaxy, star: star, sys: sys, host: host, station: station, port: port };
}

function career(seed) {
  var o = opening(seed);
  if (!o || !o.port) return null;
  var ship = Sim.circularOrbit(o.host, o.sys, 0, o.host.radius * 2, 0, 0);
  ship.credits = Gen.SHIP_SPEC.credits;       // the hard purse, read from its one home
  ship.cargo = {};
  ship.cleared = {}; ship.cleared[o.port.id] = true;
  Sim.dockShip(ship, o.port, o.sys, 0);
  var G = { seed: seed, t: 0, galaxy: o.galaxy, here: o.star, sys: o.sys, ship: ship,
            missions: [], fleet: [], journal: [], doneMissions: {} };
  G.tutorial = T.begin(G, o.sys, 0);
  return { G: G, o: o };
}
function env(G, extra) {
  var e = { sys: G.sys, t: G.t, hooks: null, marketOpen: false, autodock: false, now: 100 };
  for (var k in (extra || {})) e[k] = extra[k];
  return e;
}

/* ---------------------------------------------------------------------- */
section('the run he picks, measured across 40 galaxies');
var seeds = ['kawartha'];
for (var s = 0; s < 39; s++) seeds.push('tut-' + s);
var picked = 0, withGood = 0, nearHome = 0, margins = [], profits = [], noStart = 0;
seeds.forEach(function (sd) {
  var c = career(sd);
  if (!c) { noStart++; return; }
  var tut = c.G.tutorial;
  if (!tut) return;
  picked++;
  if (tut.cid) {
    withGood++;
    margins.push(tut.sellAt - tut.buyAt);
    profits.push((tut.sellAt - tut.buyAt) * Math.min(64, Math.floor(Gen.SHIP_SPEC.credits / tut.buyAt)));
  }
  var dest = c.o.sys.byId[tut.dest];
  if (dest && dest.parentBody === c.o.host) nearHome++;
  check(sd + ': destination is an orbital port with a market, not the home port',
        dest && !dest.surface && dest.market && dest.id !== tut.home);
});
margins.sort(function (a, b) { return a - b; });
profits.sort(function (a, b) { return a - b; });
console.log('    careers with a start: ' + (seeds.length - noStart) + '/' + seeds.length +
            ', tutorial picked: ' + picked + ', with a good to carry: ' + withGood +
            ', destination over the home world: ' + nearHome);
if (margins.length) {
  console.log('    margin cr/t  min ' + margins[0] + '  median ' + margins[margins.length >> 1] +
              '  max ' + margins[margins.length - 1]);
  console.log('    first-hold profit  min ' + profits[0] + '  median ' + profits[profits.length >> 1] +
              '  max ' + profits[profits.length - 1]);
}
check('every opening gets a tutorial', picked === seeds.length - noStart, picked + ' of ' + (seeds.length - noStart));
check('nearly every opening has something worth carrying (>= 90%)', withGood >= 0.9 * picked, withGood + ' of ' + picked);
check('no good he names is contraband, waste, milfuel or fuel', seeds.every(function (sd) {
  var c = career(sd); var cid = c && c.G.tutorial && c.G.tutorial.cid;
  return !cid || (!Eco.BY_ID[cid].contraband && ['waste', 'milfuel', 'hydrogen', 'parcel'].indexOf(cid) < 0);
}));

/* ---------------------------------------------------------------------- */
section('the lessons, walked on kawartha');
var c = career('kawartha');
var G = c.G, tut = G.tutorial;
check('a fresh career begins on HELLO', tut && tut.step === 'hello');
T.update(G, env(G));
check('HELLO waits for NEXT — talking is not passed by time', tut.step === 'hello');
var card = T.card(G, env(G));
check('the card names him and carries NEXT', card && /HALLOWAY/.test(card.name) &&
      card.buttons.some(function (b) { return b.id === 'next'; }));
T.press(G, 'next', env(G));
T.update(G, env(G));
check('NEXT moves to BUY (kawartha has a good to carry)', tut.step === 'buy', tut.step);

/* Buy, through the note the market sends. */
T.note(G, 'buy', { cid: tut.cid, tonnes: 10, cr: 10 * tut.buyAt });
G.ship.cargo[tut.cid] = 10;
T.update(G, env(G, { marketOpen: true }));
check('a buy with the console still open does not move the lesson on', tut.step === 'buy');
T.update(G, env(G));
check('closing the console after buying passes BUY', tut.step === 'launch', tut.step);

/* Launch: a docked ship has not launched; a free one has. */
T.update(G, env(G));
check('still on the pad: LAUNCH waits', tut.step === 'launch');
var port = G.sys.byId[G.ship.docked];
G.ship.cleared = {}; Combat.requestLaunch && Combat.requestLaunch(G, port, null);
Sim.undockShip(G.ship, G.sys, G.t, 0.003);
G.ship.arrival = null;
T.update(G, env(G));
var expectClimb = !!tut.surfaceStart;
check('off the pad: LAUNCH passes' + (expectClimb ? ' to CLIMB' : ' and CLIMB is skipped for an orbital start'),
      tut.step === (expectClimb ? 'climb' : 'lock'), tut.step);
if (expectClimb) {
  /* Lift the ship straight up above the port. */
  var hp = Sim.bodyPosition(c.o.host, G.sys, G.t);
  var up = V.norm(V.sub(G.ship.pos, hp));
  G.ship.pos = V.add(hp, V.scale(up, c.o.host.radius + 5));
  T.update(G, env(G));
  check('5 km up: CLIMB waits', tut.step === 'climb', tut.step);
  var pr = T.card(G, env(G)).progress;
  check('CLIMB says how high', /altitude/.test(pr || ''), pr);
  G.ship.pos = V.add(hp, V.scale(up, c.o.host.radius + T.CLIMB_KM + 1));
  T.update(G, env(G));
  check('past ' + T.CLIMB_KM + ' km: CLIMB passes to LOCK', tut.step === 'lock', tut.step);
}
G.navTarget = { kind: 'body', id: tut.home };
T.update(G, env(G));
check('locking the wrong thing does not pass LOCK', tut.step === 'lock');
/* He no longer grants clearance himself: the autopilot asks for it
 * (main.js autodockClearance, pinned in render.test.js). Nothing here may
 * quietly clear the ship. */
check('the lessons never grant clearance themselves',
      !(G.ship.cleared && G.ship.cleared[tut.dest]));
G.navTarget = { kind: 'body', id: tut.dest };
T.update(G, env(G));
check('locking the station passes LOCK', tut.step === 'autodock', tut.step);

/* Dock at the station the way a finished autopilot leaves it. */
var dest = G.sys.byId[tut.dest];
var ds = Sim.bodyState(dest, G.sys, G.t);
G.ship.pos = V.clone(ds.pos); G.ship.vel = V.clone(ds.vel);
G.ship.cleared = {}; G.ship.cleared[dest.id] = true;
Sim.dockShip(G.ship, dest, G.sys, G.t);
T.update(G, env(G));
check('docked at ' + tut.destName + ': AUTODOCK passes to SELL', tut.step === 'sell', tut.step);
T.note(G, 'sell', { cid: tut.cid, tonnes: 10, cr: 10 * tut.sellAt });
delete G.ship.cargo[tut.cid];
T.update(G, env(G));
check('selling the hold passes SELL to CONTRACT', tut.step === 'contract', tut.step);
check('CONTRACT tells you what the run cleared', /clear on one hold/.test(T.card(G, env(G)).words));

/* A contract appears in G.missions the way Missions.accept puts it there. */
G.missions.push({ id: 'old-one', type: 'haul', cid: 'grain', tonnes: 5, toName: 'X', deadline: 1e9, campaign: true });
T.update(G, env(G));
check('a campaign chapter does not count as signing the lesson\'s contract', tut.step === 'contract');
G.missions.push({ id: 'm1', type: 'haul', cid: 'grain', tonnes: 5, toName: 'Somewhere', toPortId: tut.home, deadline: 3 * 86400 });
T.update(G, env(G));
check('signing a contract passes CONTRACT to UNDOCK', tut.step === 'undock', tut.step);
check('the contract is remembered', tut.contract && tut.contract.id === 'm1');

Sim.undockShip(G.ship, G.sys, G.t, 0.003);
T.update(G, env(G));
check('off the clamp: UNDOCK passes to ATTITUDE', tut.step === 'attitude', tut.step);
check('ATTITUDE noted where the nose was', !!tut.fwd0);
G.ship.fwd = V.norm(V.add(G.ship.fwd, V.scale(G.ship.right, 0.3)));
T.update(G, env(G));
check('a small turn is not enough', tut.step === 'attitude');
G.ship.fwd = V.clone(G.ship.right);
T.update(G, env(G));
check('a 90 degree turn passes ATTITUDE to BURN', tut.step === 'burn', tut.step);
check('BURN noted the orbit it started from', !!tut.orbit0, JSON.stringify(tut.orbit0));
var target = T.burnTarget(tut);
check('the target is half as high again, and at least ' + T.APO_MIN_KM + ' km more',
      tut.orbit0 && target >= tut.orbit0.apo * 1.5 - 1e-6 && target >= tut.orbit0.apo + T.APO_MIN_KM - 1e-6);
/* Burn prograde, impulsively, until the far side clears the mark. */
var dom = Sim.oscElements(G.ship, G.sys, G.t).body;
var vb = Sim.bodyVelocity(dom, G.sys, G.t);
var pro = V.norm(V.sub(G.ship.vel, vb));
for (var k = 0; k < 200 && tut.step === 'burn'; k++) {
  G.ship.vel = V.add(G.ship.vel, V.scale(pro, 0.02));
  T.update(G, env(G));
}
check('burning prograde lifts the far side and passes BURN', tut.step === 'deliver', tut.step);
T.update(G, env(G));
check('DELIVER says the autopilot may hold for a berth', /HOLD/.test(T.card(G, env(G)).words));
check('AUTODOCK\'s words say the autopilot asks for clearance itself',
      /clearance herself/.test(T.LESSONS.autodock.words(G, tut)));
check('AUTODOCK shows when the autopilot is holding',
      /holding for a berth/.test(T.LESSONS.autodock.progress(G, tut, env(G, { autodock: true, autodockPhase: 'hold' }))));

/* A blown contract goes back to the board. */
G.missions = G.missions.filter(function (m) { return m.id !== 'm1'; });
T.update(G, env(G));
check('a contract that vanished undelivered sends the lesson back to CONTRACT', tut.step === 'contract', tut.step);
check('...and he says so', /got away from you/.test(T.card(G, env(G)).words));
G.missions.push({ id: 'm2', type: 'haul', cid: 'grain', tonnes: 5, toName: 'Elsewhere', toPortId: tut.dest, deadline: 3 * 86400 });
T.update(G, env(G));
T.update(G, env(G));
check('a second contract skips back over flying already done: UNDOCK, ATTITUDE, BURN pass at once',
      tut.step === 'deliver' || tut.step === 'attitude' || tut.step === 'burn', tut.step);
/* The flying lessons each read the ship afresh; walk them forward if the
 * ship has not been turned since. */
for (var w = 0; w < 4 && tut.step !== 'deliver'; w++) T.press(G, 'skip', env(G));
T.update(G, env(G));
check('on DELIVER with the new contract', tut.step === 'deliver' && tut.contract.id === 'm2', tut.step);
T.note(G, 'contract', { id: 'someone-else', pay: 100 });
T.update(G, env(G));
check('another contract settling is not this one', tut.step === 'deliver');
var ds2 = Sim.bodyState(dest, G.sys, G.t);
G.ship.pos = V.clone(ds2.pos); G.ship.vel = V.clone(ds2.vel);
G.ship.cleared = {}; G.ship.cleared[dest.id] = true;
Sim.dockShip(G.ship, dest, G.sys, G.t);
T.note(G, 'contract', { id: 'm2', pay: 900 });
G.missions = [];
T.update(G, env(G));
check('delivering it passes DELIVER to FAREWELL — his goodbye now comes before the ship',
      tut.step === 'farewell' && !tut.given, tut.step + ' given=' + tut.given);
check('FAREWELL offers CLOSE and no END LESSONS', T.card(G, env(G)).buttons.some(function (b) { return b.id === 'close'; }) &&
      !T.card(G, env(G)).buttons.some(function (b) { return b.id === 'end'; }));
check('FAREWELL no longer promises the Talon stays', !/Keep the Talon if you like/.test(T.card(G, env(G)).words));
T.press(G, 'close', env(G));
check('CLOSE ends the lessons and goes to HANDOVER', tut.ended && tut.step === 'handover' && !tut.done, tut.step);
check('a career that chose its start is not asked again', !G.startPending);
T.update(G, env(G));
check('...and the Patience is handed over at this dock in the next frame', tut.step === 'handover' && tut.given);

/* ---------------------------------------------------------------------- */
section('the Patience');
var rec = Fleet.byId(G, tut.recId);
check('she is a fleet record on the clamp you are standing at', rec && rec.port === G.ship.docked);
check('she is a Tallyman Trader called the Patience', rec && rec.hullId === 'trader' && rec.name === 'Patience');
check('her berth is paid for a month', rec && rec.berthTo >= G.t + 29 * 86400);
check('she carries the yard outfit (a gun on a hardpoint)', rec && Object.keys(rec.fit).some(function (k) {
  var it = Combat.EQUIPMENT && Combat.EQUIPMENT[rec.fit[k]];
  return /^hardpoint/.test(k) || (it && it.slot === 'hardpoint');
}), rec && JSON.stringify(rec.fit));
check('she is written in the captain\'s log', (G.journal || []).some(function (e) { return /Patience/.test(e.text); }));
check('the FLEET row will let you take command of her', !Combat.commandRefusal(G, rec, 'keep'),
      Combat.commandRefusal(G, rec, 'keep'));
T.update(G, env(G));
check('HANDOVER waits until you take her', tut.step === 'handover');
var took = Combat.takeCommand(G, rec.id, 'keep');
check('taking command works', took && took.ok, took && took.why);
check('...and you are flying a Tallyman', G.ship.hullId === 'trader');
T.update(G, env(G));
check('taking command passes HANDOVER, the last card, and the card goes', tut.done && T.card(G, env(G)) === null, tut.step);
check('the second gift is not given twice', G.fleet.filter(function (r) { return r.id === 'fs-halloway'; }).length <= 1);

/* ---------------------------------------------------------------------- */
section('skipping, ending, hiding');
var c2 = career('kawartha'), G2 = c2.G, t2 = G2.tutorial;
T.press(G2, 'hide', env(G2));
check('HIDE folds the card to a line', T.card(G2, env(G2)).collapsed === true);
T.press(G2, 'show', env(G2));
check('...and clicking it opens it again', T.card(G2, env(G2)).collapsed === false);
T.press(G2, 'end', env(G2, { now: 10 }));
check('one click on END LESSONS only arms it', !t2.done && /SURE/.test(T.card(G2, env(G2, { now: 11 })).buttons.slice(-1)[0].label));
T.press(G2, 'end', env(G2, { now: 30 }));
check('a second click long after does not end it — it re-arms', !t2.done);
T.press(G2, 'end', env(G2, { now: 31 }));
check('two clicks inside the window end the lessons', t2.ended && t2.step === 'handover');
T.update(G2, env(G2));
/* Astra, 2026-11-03: the Patience is always given. */
check('ending early still hands over the Patience', t2.given && Fleet.byId(G2, t2.recId) &&
      Fleet.byId(G2, t2.recId).hullId === 'trader', JSON.stringify(G2.fleet.map(function (r) { return r.id; })));
check('...and the journal says you knew the trade', (G2.journal || []).some(function (e) { return /knew the trade/.test(e.text); }));
check('no END LESSONS on the handover card once they have ended',
      !T.card(G2, env(G2)).buttons.some(function (b) { return b.id === 'end'; }));
T.press(G2, 'later', env(G2));
check('LATER closes the card and leaves her on the clamp', t2.done && !!Fleet.byId(G2, t2.recId));

/* ---------------------------------------------------------------------- */
section('a career still to choose its ship (pickAtEnd)');
function endNow(Gx) {
  T.press(Gx, 'end', env(Gx, { now: 1 }));
  T.press(Gx, 'end', env(Gx, { now: 2 }));
}
var c5 = career('kawartha'), G5 = c5.G, t5 = G5.tutorial;
t5.pickAtEnd = true;
endNow(G5);
check('END LESSONS raises G.startPending', G5.startPending === true);
T.update(G5, env(G5));
check('the Patience waits for the choice, even docked', !t5.given && t5.step === 'handover');
check('the card says what is waiting', /choose your ship/i.test(T.card(G5, env(G5)).goal), T.card(G5, env(G5)).goal);
G5.startPending = false; t5.picked = true;          // what main.js takeStart does
T.update(G5, env(G5));
check('chosen: she comes round at the same dock', t5.given && !!Fleet.byId(G5, t5.recId));
var j5 = JSON.parse(JSON.stringify(t5));
check('the end of the lessons round-trips', j5.ended === true && j5.picked === true && j5.pickAtEnd === true);

/* Undocked when they end: it waits, and says so plainly. */
var c6 = career('kawartha'), G6 = c6.G, t6 = G6.tutorial;
t6.pickAtEnd = true;
Sim.undockShip(G6.ship, G6.sys, 0, 0.003); G6.ship.arrival = null;
endNow(G6);
T.update(G6, env(G6));
var card6 = T.card(G6, env(G6));
check('undocked: the choice is pending', G6.startPending === true && !t6.given);
check('...and the card reads "Dock anywhere to choose your ship"',
      card6.goal === 'Dock anywhere to choose your ship' && /Dock anywhere and choose your ship/.test(card6.words), card6.goal);

/* By his CLOSE, the same. */
var c7 = career('kawartha'), G7 = c7.G, t7 = G7.tutorial;
t7.pickAtEnd = true;
t7.step = 'farewell'; t7.entered = false;
T.update(G7, env(G7));
check('FAREWELL to a career still to choose says so', /choose your ship/.test(T.card(G7, env(G7)).goal) &&
      /trade the Talon in|take the Talon in/.test(T.card(G7, env(G7)).words));
T.press(G7, 'close', env(G7));
check('CLOSE raises the same flag END LESSONS does', G7.startPending === true && t7.step === 'handover');

/* Saved under the old order: sitting on HANDOVER, lessons never ended. */
var c8 = career('kawartha'), G8 = c8.G, t8 = G8.tutorial;
t8.pickAtEnd = true; t8.step = 'handover'; t8.entered = false;
T.update(G8, env(G8));
check('an old-order save on HANDOVER is asked its ship before the Patience', t8.ended && G8.startPending && !t8.given);

var c3 = career('kawartha'), G3 = c3.G, t3 = G3.tutorial;
T.press(G3, 'next', env(G3));
T.update(G3, env(G3));
T.press(G3, 'skip', env(G3));
T.update(G3, env(G3));
check('SKIP STEP passes a lesson without doing it', t3.step === 'launch', t3.step);
check('a skipped BUY means SELL is passed over later (nothing to sell)',
      T.LESSONS.sell.skipIf(G3, t3, env(G3)) === true);

/* Running ahead: dock at the destination straight from the pad's lesson. */
var c4 = career('kawartha'), G4 = c4.G, t4 = G4.tutorial;
T.press(G4, 'next', env(G4));
T.press(G4, 'skip', env(G4));        // buy
var d4 = G4.sys.byId[t4.dest], s4 = Sim.bodyState(d4, G4.sys, 0);
Sim.undockShip(G4.ship, G4.sys, 0, 0.003); G4.ship.arrival = null;
G4.ship.pos = V.clone(s4.pos); G4.ship.vel = V.clone(s4.vel);
G4.ship.cleared = {}; G4.ship.cleared[d4.id] = true;
Sim.dockShip(G4.ship, d4, G4.sys, 0);
T.update(G4, env(G4));
check('a pilot already docked at the station passes LAUNCH, CLIMB, LOCK and AUTODOCK at once',
      t4.step === 'contract', t4.step);

/* ---------------------------------------------------------------------- */
section('it survives a save');
var j = JSON.parse(JSON.stringify(G.tutorial));
check('the state is plain data', j.done === true && j.recId === 'fs-halloway');
var j3 = JSON.parse(JSON.stringify(t3));
check('a mid-lesson state round-trips', j3.step === t3.step && j3.home === t3.home && j3.cid === t3.cid);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
