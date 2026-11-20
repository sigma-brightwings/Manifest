/* workoff.test.js - working a fine off (combat.js workOff, 2026-11-19).
 *
 *     node test/workoff.test.js
 *
 * Astra: "security should detain you when you're wanted, but if you don't
 * have enough money to pay your fine that shouldn't be game breaking,
 * instead, the option to run missions for that station/faction until your
 * fine is paid off, and the missions pay half as much."
 *
 * Pinned: the debt is what settling would have cost; agreeing clears the
 * bounty (and a fugitive flag) at once; that faction's contracts then pay
 * half, the other half to the debt, never more than is owed; other
 * factions pay in full; it ends when it is paid; and a save keeps it.
 */
var path = require('path');
var SRC = path.join(__dirname, '..', 'src');
['rng', 'economy', 'generate', 'galaxy', 'sim', 'combat', 'missions'].forEach(function (m) {
  require(path.join(SRC, m + '.js'));
});
var Combat = global.Combat, Missions = global.Missions;

var pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  ok   ' + name + (detail !== undefined ? '   ' + detail : '')); }
  else { fail++; console.log('  FAIL ' + name + (detail !== undefined ? '   ' + detail : '')); }
}

function career() {
  return { ship: { credits: 100, cargo: {} }, wanted: { navy: 500 }, standing: {}, journal: [],
           galaxy: { factionById: { navy: { id: 'navy', name: 'Halden Navy' }, guild: { id: 'guild', name: 'Guild' } } } };
}

console.log('--- agreeing to it ---');
var G = career();
check('settling costs what paying would', Combat.settleCost(G, 'navy') === 800, Combat.settleCost(G, 'navy'));
check('and paying is refused for want of money', Combat.payBounty(G, 'navy') === -800);
var debt = Combat.workOff(G, 'navy');
check('the debt is that cost', debt === 800 && Combat.workOffOwed(G, 'navy') === 800);
check('and the bounty is cleared at once', !(G.wanted.navy > 0));
check('it is in the journal', G.journal.some(function (e) { return /work off 800/.test(e.text); }));
check('nothing to work off when nothing is owed', Combat.workOff(G, 'navy') === 0 && Combat.workOffOwed(G, 'navy') === 800);

console.log('\n--- half pay ---');
var g1 = Missions.creditFor(G, { faction: 'navy' }, 300);
check('a contract for them pays half', g1.kept === 150 && g1.took === 150 && G.ship.credits === 250, JSON.stringify(g1));
check('and says so', /150 cr to your fine with Halden Navy, 650 cr still owed/.test(g1.note), g1.note);
var g2 = Missions.creditFor(G, { faction: 'guild' }, 300);
check('another faction pays in full', g2.kept === 300 && g2.took === 0 && g2.note === '');
var odd = Missions.creditFor(G, { faction: 'navy' }, 301);
check('an odd fee rounds the debt\'s half up', odd.took === 151 && odd.kept === 150);
/* Down to the last of it: the final contract pays the rest to you. */
G.workoff.navy = 40;
var g3 = Missions.creditFor(G, { faction: 'navy' }, 1000);
check('never more than is owed', g3.took === 40 && g3.kept === 960, JSON.stringify(g3));
check('and then it is over', !(G.workoff && G.workoff.navy) && /now paid off/.test(g3.note), g3.note);
check('full pay again after', Missions.creditFor(G, { faction: 'navy' }, 200).kept === 200);

console.log('\n--- a fugitive ---');
var F = career();
F.wanted = {}; F.fugitive = { faction: 'navy', amount: 1000 };
check('turning yourself in costs 1.2x', Combat.settleCost(F, 'navy') === 1200);
Combat.workOff(F, 'navy');
check('working it off lifts the fugitive flag', !F.fugitive && Combat.workOffOwed(F, 'navy') === 1200);

console.log('\n--- saved ---');
var Save = require(path.join(SRC, 'save.js'));
var src = require('fs').readFileSync(path.join(SRC, 'save.js'), 'utf8');
check('save.js writes the debt', /workoff:\s*G\.workoff/.test(src));
check('and reads it back', /G\.workoff\s*=\s*data\.workoff/.test(src));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
