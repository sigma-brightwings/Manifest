/* outside.test.js - somebody out on the hull (2026-11-13).
 *
 *     node test/outside.test.js
 *
 * Astra: "wants damaged ships on multi-deck vessels to stay reachable, e.g.
 * EVA repairs by an engineer; accelerating while an untethered engineer is
 * outside strands them; EVA pack has a 12-hour oxygen candle and emergency
 * transponder naming their ship; deliberately abandoning them reflects on
 * that captain (12 hours is the grace period to return)."
 *
 * What this holds:
 *   - AN ENGINEER, IN OPEN SPACE, ON A DAMAGED HULL - and the refusal says
 *     which of those is missing;
 *   - THE HULL MENDS while they work, faster off the line than on it;
 *   - TWELVE HOURS OF AIR, and it runs on the sim clock, so time warp is
 *     the thing that kills them;
 *   - A BURN WITH THEM UNCLIPPED CASTS THEM OFF, and a burn with them
 *     clipped does not;
 *   - THE BEACON CARRIES THE SHIP'S NAME, which is why it costs anything;
 *   - GOING BACK IN TIME COSTS NOTHING; leaving them costs your name with
 *     every hiring hall, which is the only thing it can cost - no witness,
 *     so no bounty;
 *   - AND IT SURVIVES A RELOAD: the air does not come back.
 */
global.window = global.window || global;
require('../src/vec3.js');
require('../src/rng.js');
require('../src/kepler.js');
require('../src/economy.js');
require('../src/generate.js');
require('../src/sim.js');
require('../src/hulls.js');
var C = require('../src/combat.js');
var Crew = require('../src/crew.js');
var O = require('../src/outside.js');
var V = global.V;

var pass = 0, fail = 0;
function check(n, c, d) {
  if (c) { pass++; console.log('  ok   ' + n + (d ? '   ' + d : '')); }
  else { fail++; console.log('  FAIL  ' + n + (d ? '   ' + d : '')); }
}
var HOUR = 3600;
function says() { var L = []; return { log: L, say: function (m) { L.push(m); }, sound: function () {} }; }

function makeG(opts) {
  opts = opts || {};
  var hull = C.HULLS.talon;
  return {
    t: 0, lastDtSim: 0,
    here: { id: 'sys' }, sys: { faction: 'guild', ports: [] },
    crewRep: 0, adrift: [], outside: null,
    ship: {
      name: 'Patience', reg: 'KT-118',
      hullMax: hull.hullMax, hullHp: opts.hp === undefined ? hull.hullMax * 0.5 : opts.hp,
      credits: 5000, docked: null, landed: false,
      pos: { x: 0, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 },
      thrust: { x: 0, y: 0, z: 0 },
      crew: opts.crew === undefined
        ? [Crew.make('Ada Vance', 'engineer', 3, 'e1')]
        : opts.crew
    }
  };
}

console.log('--- who may go out, and who may not ---');
check('an engineer on a holed ship in open space may', O.refusal(makeG()) === null);
check('not from a berth', /berth/.test(O.refusal((function () { var g = makeG(); g.ship.docked = 'p1'; return g; })()) || ''));
check('not from the ground', /ground/.test(O.refusal((function () { var g = makeG(); g.ship.landed = true; return g; })()) || ''));
check('not without an engineer',
      /engineer/.test(O.refusal(makeG({ crew: [Crew.make('Bo', 'gunner', 3, 'g1')] })) || ''));
check('not on a sound hull', /not damaged/.test(O.refusal(makeG({ hp: C.HULLS.talon.hullMax })) || ''));
check('and not on one that is coming apart',
      /yard/.test(O.refusal(makeG({ hp: C.HULLS.talon.hullMax * 0.02 })) || ''));

console.log('--- the hull mends ---');
var g = makeG(), h = says();
var r = O.send(g, 0, null, true, h);
check('she goes out', r.ok && !!O.current(g), r.why || '');
check('and the line is on by default', O.current(g).tether === true);
var hp0 = g.ship.hullHp;
g.lastDtSim = HOUR;
O.step(g, HOUR, h);
check('an hour on the line mends her', g.ship.hullHp > hp0,
      '+' + (g.ship.hullHp - hp0).toFixed(1));
var onLine = g.ship.hullHp - hp0;

var g2 = makeG(), h2 = says();
O.send(g2, 0, null, false, h2);
var hp2 = g2.ship.hullHp;
O.step(g2, HOUR, h2);
var offLine = g2.ship.hullHp - hp2;
check('off the line she reaches more of the hull', offLine > onLine,
      offLine.toFixed(1) + ' vs ' + onLine.toFixed(1));
check('a better hand mends faster',
      O.mendRate({ rating: 5 }, false) > O.mendRate({ rating: 1 }, false));
check('mending never overshoots a sound hull', (function () {
  var g3 = makeG({ hp: C.HULLS.talon.hullMax - 1 });
  O.send(g3, 0, null, false, says());
  O.step(g3, 10 * HOUR, says());
  return g3.ship.hullHp <= g3.ship.hullMax + 1e-9;
})());

console.log('--- twelve hours of air ---');
check('the candle is twelve hours', O.O2_SECONDS === 12 * HOUR, String(O.O2_SECONDS));
var g4 = makeG(), h4 = says();
O.send(g4, 0, null, true, h4);
O.step(g4, 3 * HOUR, h4);
check('air burns while they work',
      Math.abs(O.current(g4).o2 - 9 * HOUR) < 1e-6, (O.current(g4).o2 / HOUR).toFixed(1) + ' h left');
O.step(g4, 8 * HOUR, h4);
check('they are warned before it runs out',
      h4.log.some(function (m) { return /hour of air/.test(m); }), '');
O.step(g4, 2 * HOUR, h4);
check('and the air running out on the hull kills them', !O.current(g4));
check('which is said plainly',
      h4.log.some(function (m) { return /dead on the hull/.test(m); }));
check('and it costs your name', g4.crewRep <= O.REP_DEATH, String(g4.crewRep));

console.log('--- the burn that casts them off ---');
var g5 = makeG(), h5 = says();
O.send(g5, 0, null, true, h5);                 // ON the line
g5.ship.thrust = { x: 0.001, y: 0, z: 0 };
O.step(g5, 60, h5);
check('a burn with them clipped drags them along, it does not lose them',
      !!O.current(g5) && !(g5.adrift || []).length);

var g6 = makeG(), h6 = says();
O.send(g6, 0, null, false, h6);                // OFF the line
g6.ship.vel = { x: 0.4, y: 0, z: 0 };
g6.ship.thrust = { x: 0.001, y: 0, z: 0 };
O.step(g6, 1, h6);
check('a burn with them unclipped casts them off', !O.current(g6) && g6.adrift.length === 1);
var cast = g6.adrift[0];
check('and the alarm says exactly what happened',
      h6.log.some(function (m) { return /IS OFF THE HULL/.test(m); }));

console.log('--- the beacon ---');
check('it is up', cast.beacon === true);
check("and it names the ship that left them", cast.shipName === 'Patience', String(cast.shipName));
check('with her registration', cast.reg === 'KT-118', String(cast.reg));
check('they keep the velocity they were cast off at',
      Math.abs(cast.vel.x - 0.4) < 1e-9);
check('they carry the air they had left', cast.o2 > 11.9 * HOUR);
check('and they show up in this system', O.liveHere(g6).length === 1);

console.log('--- drifting ---');
var before = cast.pos.x;
O.step(g6, HOUR, h6);
check('they coast on', cast.pos.x > before, 'moved ' + (cast.pos.x - before).toFixed(0) + ' km');
check('and the air goes down with the clock',
      cast.o2 < 11 * HOUR, (cast.o2 / HOUR).toFixed(1) + ' h');

console.log('--- going back ---');
var g7 = makeG(), h7 = says();
O.send(g7, 0, null, false, h7);
/* She has to be MOVING for them to fall behind. Cast somebody off while
 * coasting at nothing and then cut the engine and they are still right
 * there - which the auto-pickup rightly treats as picking them up, and
 * which is why this test has to give her way on. */
g7.ship.vel = { x: 0.4, y: 0, z: 0 };
g7.ship.thrust = { x: 0.001, y: 0, z: 0 };
O.step(g7, 1, h7);
g7.ship.thrust = { x: 0, y: 0, z: 0 };
O.step(g7, 2 * HOUR, h7);
var who = g7.adrift[0];
check('two hours on and they are a long way off', !!who && who.pos.x > 2000,
      who ? Math.round(who.pos.x) + ' km' : 'picked up already');
g7.ship.pos = { x: who.pos.x, y: who.pos.y, z: who.pos.z };
check('close enough, you can see them', O.pickupAt(g7) === who);
var rep0 = g7.crewRep;
var got = O.recover(g7, g7.t, null, h7);
check('and take them aboard', got.ok && !g7.adrift.length);
check('they go back on the crew list',
      (g7.ship.crew || []).some(function (p) { return p.id === who.id; }));
check('going back promptly does your name no harm', g7.crewRep >= rep0,
      rep0 + ' -> ' + g7.crewRep);

console.log('--- flying to them IS picking them up ---');
/* No button for it: at the moment you are finally alongside somebody you
 * nearly killed, hunting for a control is the wrong thing to be doing. */
var g9 = makeG(), h9 = says();
O.send(g9, 0, null, false, h9);
g9.ship.thrust = { x: 0.001, y: 0, z: 0 };     // cast off, but barely under way
O.step(g9, 1, h9);
g9.ship.thrust = { x: 0, y: 0, z: 0 };         // engine cold, still alongside
O.step(g9, 1, h9);
check('cut the engine while still alongside and they come straight back aboard',
      !(g9.adrift || []).length &&
      (g9.ship.crew || []).some(function (p) { return p.role === 'engineer'; }));

var g10 = makeG(), h10 = says();
O.send(g10, 0, null, false, h10);
g10.ship.vel = { x: 0.4, y: 0, z: 0 };
g10.ship.thrust = { x: 0.001, y: 0, z: 0 };
O.step(g10, 1, h10);
O.step(g10, 60, h10);                           // still burning, drawing away
check('but not while the engine is lit - you do not collect a person at speed',
      g10.adrift.length === 1);

console.log('--- leaving them ---');
var g8 = makeG(), h8 = says();
O.send(g8, 0, null, false, h8);
g8.ship.vel = { x: 0.4, y: 0, z: 0 };          // under way, so they fall behind
g8.ship.thrust = { x: 0.001, y: 0, z: 0 };
O.step(g8, 1, h8);
g8.ship.thrust = { x: 0, y: 0, z: 0 };
var rep8 = g8.crewRep;
O.step(g8, 13 * HOUR, h8);
check('after twelve hours the beacon stops', g8.adrift[0].dead === true);
check('it is said', h8.log.some(function (m) { return /beacon has stopped/.test(m); }));
check('and your name goes with it', g8.crewRep < rep8, rep8 + ' -> ' + g8.crewRep);
check('a cutting-it-fine rescue costs less than a death',
      O.REP_SCARE > O.REP_DEATH, O.REP_SCARE + ' vs ' + O.REP_DEATH);

console.log('--- what hands have heard ---');
check('a clean name changes nothing at the hall',
      O.hallEffect({ crewRep: 0 }).feeMul === 1 && O.hallEffect({ crewRep: 0 }).maxRating === 5);
var one = O.hallEffect({ crewRep: O.REP_DEATH });
check('one death and the good hands start saying no', one.maxRating < 5, 'ceiling ' + one.maxRating);
check('and the rest want more to sign', one.feeMul > 1, '×' + one.feeMul.toFixed(2));
check('and there are fewer berths on the board', one.fewer > 0, String(one.fewer));
var two = O.hallEffect({ crewRep: O.REP_MIN });
check('a habit of it and only the desperate will fly with you',
      two.maxRating <= 2 && two.feeMul > one.feeMul, 'ceiling ' + two.maxRating);
check('it never gets worse than the floor',
      O.hallEffect({ crewRep: -9999 }).maxRating === two.maxRating);
check('and the hall has words for it', !!two.word, two.word);

console.log('--- no witness, so no bounty ---');
check('leaving somebody is not on the bounty table',
      C.BOUNTY && C.BOUNTY.leftCrew === undefined);
check('but shooting one is, and it tops the killing ladder',
      C.BOUNTY.killSuited > C.BOUNTY.killTender &&
      C.BOUNTY.killSuited > C.BOUNTY.killNavy,
      C.BOUNTY.killSuited + ' vs tender ' + C.BOUNTY.killTender);

console.log('--- it survives a reload ---');
var save = require('fs').readFileSync(
  require('path').join(__dirname, '..', 'src', 'save.js'), 'utf8');
check('the hand on the hull is saved', /outside: G\.outside/.test(save));
check('anybody adrift is saved', /adrift: G\.adrift/.test(save));
check('and so is your name', /crewRep: G\.crewRep/.test(save));

console.log('');
console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
