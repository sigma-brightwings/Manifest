/* band.test.js - the open band: hearing what is happening to somebody
 * else (2026-11-11).
 *
 *     node test/band.test.js
 *
 * Astra: "something that the player can come across in the local system
 * chatter and attempt to render aid or even pirate their ship."
 *
 * The events were already there - aggression.js has run pirates, runners,
 * customs and border clashes since October - but every line of it was
 * gated on near(), so anything out of sight was silent. This is the reach.
 *
 * What this holds:
 *   - a call goes on the band, and the same ship in the same trouble does
 *     not go on it twice;
 *   - the position is where she WAS: it moves only on a rebroadcast, a
 *     minute apart, so a running fight is behind its own mark;
 *   - it goes quiet after half an hour without one;
 *   - a call from another system is heard and not shown;
 *   - the rows are nav rows, sorted by range, and the stale ones go grey;
 *   - answering one that asked for help is noticed, once.
 */
global.window = global;
require('../src/vec3.js');
require('../src/rng.js');
var M = require('../src/missions.js');
var B = require('../src/band.js');

var pass = 0, fail = 0;
function check(n, c, d) {
  if (c) { pass++; console.log('  ok   ' + n + (d ? '   ' + d : '')); }
  else { fail++; console.log('  FAIL  ' + n + (d ? '   ' + d : '')); }
}

function ship(id, x, fac) {
  return { id: id, name: id, faction: fac || 'emp-a', live: { pos: { x: x || 0, y: 0, z: 0 } } };
}
function career(x) {
  return { t: 0, here: { id: 'st1' }, ship: { pos: { x: x || 0, y: 0, z: 0 } },
           standing: {}, band: [] };
}
var sys = { seed: 'sy' };

console.log('--- a call goes out ---');
var G = career(0);
var v = ship('Pilgrim Lighter', 30e6), p = ship('The Salt', 30.1e6, 'outlaw');
var id = B.open(G, sys, 100, 'robbery', v, p);
check('it is on the band', !!id && G.band.length === 1);
check('it knows who is in trouble', G.band[0].whoName === 'Pilgrim Lighter');
check('and who is doing it', G.band[0].withName === 'The Salt');
check('and where she was', G.band[0].pos.x === 30e6);
B.open(G, sys, 140, 'robbery', v, p);
check('the same ship in the same trouble is the same call', G.band.length === 1);
B.open(G, sys, 140, 'pursuit', v, p);
check('but different trouble is a different call', G.band.length === 2);

console.log('--- it tells you where she was ---');
var G2 = career(0);
var w = ship('Redsail Wain', 10e6);
B.open(G2, sys, 100, 'robbery', w, p);
w.live.pos.x = 11e6;
B.touch(G2, 130, 'robbery', w);
check('a rebroadcast inside the minute does not move the mark',
      G2.band[0].pos.x === 10e6, G2.band[0].pos.x + '');
B.touch(G2, 200, 'robbery', w);
check('and one after it does', G2.band[0].pos.x === 11e6);
check('so a running fight is always behind its own mark', B.REBROADCAST === 60);

console.log('--- it goes quiet ---');
var G3 = career(0);
B.open(G3, sys, 100, 'robbery', w, p);
check('a fresh call is live', B.live(G3, sys, 200).length === 1);
check('and a half-hour-old one is not', B.live(G3, sys, 100 + B.LIFE + 1).length === 0);
check('and it is pruned as it is read', G3.band.length === 0);

console.log('--- heard, but not from here ---');
var G4 = career(0);
B.open(G4, sys, 100, 'robbery', w, p);
G4.here = { id: 'st2' };
check('a call from the system you left is not on your band',
      B.live(G4, sys, 200).length === 0);
check('but it is not thrown away either', G4.band.length === 1);
G4.here = { id: 'st1' };
check('and it is there again when you go back', B.live(G4, sys, 200).length === 1);

console.log('--- the rows ---');
var G5 = career(0);
B.open(G5, sys, 100, 'robbery', ship('Near Wain', 5e6), p);
B.open(G5, sys, 100, 'duel', ship('Far Clipper', 50e6), p);
var rows = B.rows(G5, sys, 200);
check('one row per call', rows.length === 2);
check('nearest first', rows[0].name === 'Near Wain', rows.map(function (r) { return r.name; }).join(', '));
check('they are nav rows', rows[0].kind === 'incident' && !!rows[0].pos && rows[0].range > 0);
check('a robbery asks for help', rows[0].help === true);
check('two empires shooting at each other does not', rows[1].help === false);
check('and the row says how old it is', /ago|just now/.test(rows[0].type), rows[0].type);

var closed = career(0);
var c1 = ship('Taken Wain', 5e6);
B.open(closed, sys, 100, 'robbery', c1, p);
B.close(closed, 150, 'robbery', c1, 'robbed');
var crow = B.rows(closed, sys, 160)[0];
check('a call that is over says what happened', /robbed/.test(crow.type), crow.type);
check('and goes grey', crow.color === '#6a7d92');
check('and stops asking for help', crow.help === false);

console.log('--- answering one ---');
var G6 = career(0);
var vic = ship('Quillon Packet', 1000, 'emp-b');
B.open(G6, sys, 100, 'robbery', vic, p);
G6.ship.pos.x = 1e6;                       // a long way off
check('standing off does not count', B.answer(G6, sys, 200, null) === null);
check('and nobody owes you anything', M.standing(G6, 'emp-b') === 0);
G6.ship.pos.x = 1000 + B.ANSWER_KM * 0.5;
var got = B.answer(G6, sys, 210, null);
check('arriving does', !!got && got.whoName === 'Quillon Packet');
check('and her flag notices', M.standing(G6, 'emp-b') === B.ANSWER_STANDING,
      M.standing(G6, 'emp-b') + '');
check('once, not every frame', B.answer(G6, sys, 220, null) === null);
check('and the standing does not keep climbing', M.standing(G6, 'emp-b') === B.ANSWER_STANDING);

var G7 = career(0);
var duel = ship('Ardent Clipper', 1000, 'emp-b');
B.open(G7, sys, 100, 'duel', duel, p);
check('turning up to somebody else\'s border clash earns nothing',
      B.answer(G7, sys, 200, null) === null);

console.log('--- the band is a band ---');
var G8 = career(0);
for (var i = 0; i < B.MAX + 10; i++) B.open(G8, sys, 100 + i, 'duel', ship('Hull ' + i, i * 1e5), p);
check('it holds a fixed number of calls', G8.band.length === B.MAX, G8.band.length + '');
check('and it is the oldest that drop off', G8.band[0].whoName === 'Hull 10');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
