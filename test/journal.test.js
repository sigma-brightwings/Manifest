/* journal.test.js — the F5 NOTES tab: the notepad and the captain's log.
 *
 *     node test/journal.test.js
 *
 * Astra, 2026-10-30: "add a Notes section to the F5 menu, under a new tab";
 * both a notepad and a log the game keeps; saved, and exportable. Pinned:
 *
 *  - the log keeps entries oldest first, says where and when, folds the
 *    same line repeated inside a minute into one, and keeps the last MAX;
 *  - it filters by group, newest first;
 *  - who owes whom is read off the captains' own memories, by name;
 *  - the export has the notes, the debts and the log, in CRLF;
 *  - the notepad's editing: typing, newlines, deleting either way, by the
 *    word, moving by character, word, line and page, wrapping, a column
 *    kept through a run of up/down, a length cap; Esc is "done", Ctrl+V
 *    is "paste" for the caller;
 *  - both are saved and put back on load, and an older save has neither;
 *  - the game writes to it: a bounty cleared, a favour owed.
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
require(path.join(SRC, 'sim.js'));
var Combat = require(path.join(SRC, 'combat.js'));
require(path.join(SRC, 'missions.js'));
var Cap = require(path.join(SRC, 'captains.js'));
var Fav = require(path.join(SRC, 'favours.js'));
var Save = require(path.join(SRC, 'save.js'));
var J = require(path.join(SRC, 'journal.js'));

var pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail !== undefined ? '   ' + detail : '')); }
}
function section(n) { console.log('\n' + n); }
function key(st, k, mods) { var e = { key: k }; for (var m in (mods || {})) e[m] = mods[m]; return J.noteKey(st, e); }
function type(st, s) { for (var i = 0; i < s.length; i++) key(st, s[i] === '\n' ? 'Enter' : s[i]); }

section('--- the log ---');
(function () {
  var G = { t: 1000, here: { id: 's1', name: 'Kesh' } };
  J.add(G, 'rescue', 'Fuelled the Mirefast Drover');
  check('an entry says what, when and where', G.journal.length === 1 && G.journal[0].t === 1000 &&
        G.journal[0].at === 'Kesh' && G.journal[0].kind === 'rescue');
  G.t = 1030; J.add(G, 'rescue', 'Fuelled the Mirefast Drover');
  check('the same line inside a minute is one line, counted', G.journal.length === 1 && G.journal[0].n === 2);
  G.t = 2000; J.add(G, 'rescue', 'Fuelled the Mirefast Drover');
  check('but not later than that', G.journal.length === 2);
  J.add(G, 'robbery', '  Took   400 cr  ');
  check('whitespace is tidied', G.journal[2].text === 'Took 400 cr');
  check('nothing to say is not an entry', J.add(G, 'trade', '   ') === null && G.journal.length === 3);
  G.here = null; G.sys = { name: 'deep space' };
  J.add(G, 'travel', 'Out of slipspace');
  check('in deep space it says so', G.journal[3].at === 'deep space');
  var es = J.entries(G);
  check('read back newest first', es[0].kind === 'travel' && es[es.length - 1].t === 1030);
  check('and by group', J.entries(G, 'crime').length === 1 && J.entries(G, 'people').length === 2 &&
        J.entries(G, 'travel').length === 1 && J.entries(G, 'all').length === 4);
  for (var i = 0; i < J.MAX + 20; i++) J.add(G, 'trade', 'Line ' + i);
  check('it keeps the last ' + J.MAX + ', dropping the oldest', G.journal.length === J.MAX &&
        G.journal[G.journal.length - 1].text === 'Line ' + (J.MAX + 19) && G.journal[0].text === 'Line 20');
  check('the clock reads as the HUD writes it', J.fmtEpoch(3.1557e7 * 2 + 86400 * 3 + 3600 * 4 + 60 * 5) === 'Y2 D3 04:05',
        J.fmtEpoch(3.1557e7 * 2 + 86400 * 3 + 3600 * 4 + 60 * 5));
  check('every kind the game writes has a label and a group', Object.keys(J.KINDS).every(function (k) {
    return J.KINDS[k].label && J.GROUPS.some(function (g) { return g.id === J.KINDS[k].group; });
  }));
})();

section('--- who owes whom ---');
(function () {
  var G = { t: 500, here: { id: 'star-9', name: 'Mirven' }, captains: {}, ship: {} };
  var trader = { route: { id: 'r4', kind: 'trade', name: 'Tallow Runner' }, id: 'r4', name: 'Tallow Runner' };
  var other = { route: { id: 'r7', kind: 'trade', name: 'Gannet' }, id: 'r7', name: 'Gannet' };
  Fav.addDebt(G, null, trader, 2, 500, 'you fuelled her when she was adrift');
  Fav.addDebt(G, null, other, -1, 600, null);
  var ds = J.debts(G);
  check('read off the captains, by the name you know them by', ds.length === 2 && ds[0].who === 'Tallow Runner' && ds[1].who === 'Gannet',
        JSON.stringify(ds));
  check('they owe you first, then whom you owe', ds[0].debt === 2 && ds[1].debt === -1);
  check('in words', J.debtLine(ds[0]) === 'Tallow Runner owes you 2 favours' && J.debtLine(ds[1]) === 'You owe Gannet a favour',
        J.debtLine(ds[0]) + ' / ' + J.debtLine(ds[1]));
  check('with the reason', ds[0].why === 'you fuelled her when she was adrift');
  G.captains['star-1/r9'] = { debt: 1 };
  check('a memory from before names were kept falls back to the ship', J.debts(G).some(function (d) { return d.who === 'r9'; }));
  Fav.addDebt(G, null, other, 1, 700, null);
  check('square is off the list', !J.debts(G).some(function (d) { return d.who === 'Gannet'; }));
})();

section('--- export ---');
(function () {
  var G = { t: 3.1557e7 + 86400 * 12 + 3600 * 9, here: { id: 'x', name: 'Kesh' },
            ship: { shipName: 'Brightwing', reg: 'KX-114' }, notes: 'Buy cheap water at Kesh.\nOwe Gannet one.',
            captains: { 'x/r1': { debt: 1, who: 'Mirefast Drover', debtWhy: 'you fuelled her' } } };
  J.add(G, 'rescue', 'Fuelled the Mirefast Drover');
  G.t += 60; J.add(G, 'crime', 'Reported for robbery');
  var txt = J.exportText(G);
  check('it has the notes, the debts and the log', /== NOTES ==/.test(txt) && /Buy cheap water at Kesh\./.test(txt) &&
        /Mirefast Drover owes you a favour — you fuelled her/.test(txt) && /\[RESCUE\] Fuelled the Mirefast Drover/.test(txt));
  check('the log newest first', txt.indexOf('Reported for robbery') < txt.indexOf('[RESCUE]'));
  check('with the ship and the time on top', /Brightwing \(KX-114\)/.test(txt) && /Y1 D12 09:/.test(txt));
  check('in CRLF, for Notepad, and no lone LF', /\r\n/.test(txt) && !/[^\r]\n/.test(txt));
  check('a file name a disk will take', /^manifest-notes-brightwing-Y1-D12-09-0[01]\.txt$/.test(J.fileName(G)), J.fileName(G));
  check('with no browser there is no download, and no crash', J.download(G) === false);
  var empty = J.exportText({ t: 0 });
  check('an empty career exports something readable', /\(nothing written\)/.test(empty) && /\(nobody, either way\)/.test(empty) && /\(empty\)/.test(empty));
})();

section('--- the notepad ---');
(function () {
  var st = { text: '', caret: 0, cols: 12, rows: 3 };
  type(st, 'Fuel at Kesh');
  check('typing goes in at the caret', st.text === 'Fuel at Kesh' && st.caret === 12);
  check('Enter is a new line, not "done"', key(st, 'Enter') === true && st.text === 'Fuel at Kesh\n');
  type(st, 'Owe Gannet');
  key(st, 'Backspace');
  check('Backspace deletes behind', st.text === 'Fuel at Kesh\nOwe Ganne');
  key(st, 'Backspace', { ctrlKey: true });
  check('Ctrl+Backspace deletes the word', st.text === 'Fuel at Kesh\nOwe ', JSON.stringify(st.text));
  key(st, 'Home');
  check('Home goes to the start of the line', st.caret === 13);
  key(st, 'Delete');
  check('Delete deletes ahead', st.text === 'Fuel at Kesh\nwe ' && st.caret === 13);
  key(st, 'ArrowUp');
  check('Up goes to the line above', st.caret === 0);
  key(st, 'ArrowRight', { ctrlKey: true });
  check('Ctrl+Right goes a word', st.caret === 5);
  key(st, 'ArrowLeft');
  check('Left goes a character', st.caret === 4);
  key(st, 'End', { ctrlKey: true });
  check('Ctrl+End goes to the end', st.caret === st.text.length);
  key(st, 'Home', { ctrlKey: true });
  check('Ctrl+Home to the start', st.caret === 0);

  /* Wrapping, and a column kept through a run of up/down past a short line. */
  var w = J.wrap('the quick brown fox jumps', 10);
  check('long lines wrap at a space', w.length === 3 && w[0].end === 9 && w[1].start === 10,
        JSON.stringify(w));
  check('a word longer than the line is cut', J.wrap('abcdefghijklmnop', 6).length === 3);
  check('an empty text is one empty line', J.wrap('', 10).length === 1);
  check('a trailing newline is a line of its own', J.wrap('a\n', 10).length === 2);
  var s2 = { text: 'abcdefgh\nab\nabcdefgh', caret: 6, cols: 20 };
  key(s2, 'ArrowDown');
  check('down onto a short line stops at its end', s2.caret === 11, s2.caret);
  key(s2, 'ArrowDown');
  check('and down again comes back to the column you were in', s2.caret === 18, s2.caret);
  key(s2, 'ArrowLeft');
  key(s2, 'ArrowUp'); key(s2, 'ArrowUp');
  check('a sideways move starts a new run', s2.caret === 5, s2.caret);
  var s3 = { text: '1\n2\n3\n4\n5\n6\n7\n8', caret: 0, cols: 20, rows: 4 };
  key(s3, 'PageDown');
  check('PageDown moves a page less a line', J.caretLine(J.wrap(s3.text, 20), s3.caret).line === 3);
  key(s3, 'ArrowDown'); key(s3, 'ArrowDown'); key(s3, 'ArrowDown'); key(s3, 'ArrowDown'); key(s3, 'ArrowDown');
  check('down off the bottom goes to the end', s3.caret === s3.text.length);

  check('Esc is "done", and keeps the text', key(st, 'Escape') === 'done' && st.text === 'Fuel at Kesh\nwe ');
  check('Ctrl+V asks the caller to paste', key(st, 'v', { ctrlKey: true }) === 'paste');
  var before = st.text;
  key(st, 'F5'); key(st, 'Tab'); key(st, 'a', { ctrlKey: true });
  check('function keys, Tab and other shortcuts are swallowed, not typed', st.text === before);
  var s4 = { text: '', caret: 0, max: 5 };
  type(s4, 'abcdefgh');
  check('the length is capped', s4.text === 'abcde');
  var s5 = { text: 'ab', caret: 1 };
  J.insert(s5, 'x\r\ny\tz');
  check('pasted text has its line endings and tabs tidied', s5.text === 'ax\ny  zb' && s5.caret === 7, JSON.stringify(s5));
  var lines = J.wrap('hello world', 20);
  check('a click puts the caret where it landed, clamped to the line', J.caretAt(lines, 0, 3) === 3 && J.caretAt(lines, 0, 99) === 11 &&
        J.caretAt(lines, 5, 0) === 0);
})();

section('--- saved ---');
(function () {
  var Sim = global.Sim;
  var galaxy = Galaxy.build('kawartha');
  var star = galaxy.home;
  var sys = Gen.generateSystem(star.seed, { faction: galaxy.factionById[star.factionId], allFactions: galaxy.factions });
  sys.starId = star.id;
  function makeG() {
    var planet = sys.bodies.filter(function (b) { return b.kind === 'planet'; })[0];
    var ship = Sim.circularOrbit(planet, sys, 0, planet.radius * 0.6, 0.1, 0);
    ship.credits = 5000; ship.cargo = {}; ship.passengers = 0;
    Combat.initShip(ship);
    Sim.refreshShip(ship);
    return { seed: 'kawartha', ship: ship, sys: sys, t: 1000, galaxy: galaxy, here: star, ledgerLog: [],
             standing: {}, wanted: {}, missions: [], doneMissions: {}, distress: [] };
  }
  var G = makeG();
  G.notes = 'Remember the Gannet.';
  G.journal = [{ t: 5, kind: 'rescue', text: 'x', at: 'Kesh' }];
  var snap = JSON.parse(JSON.stringify(Save.snapshot(G)));
  check('the notepad is saved', snap.notes === 'Remember the Gannet.');
  check('and the log', Array.isArray(snap.journal) && snap.journal.length === 1 && snap.journal[0].kind === 'rescue');
  var bare = JSON.parse(JSON.stringify(Save.snapshot(makeG())));
  check('a career that never wrote saves an empty page, not nothing', bare.notes === '' && Array.isArray(bare.journal) && !bare.journal.length);
  /* The load side is two lines in save.js beside every other field's;
   * there is no whole-game restore in this harness, so pin what they do
   * with an older save directly. */
  var src = require('fs').readFileSync(path.join(SRC, 'save.js'), 'utf8');
  check('and on load an older save gets an empty page and an empty log',
        /G\.notes = typeof data\.notes === 'string' \? data\.notes : ''/.test(src) &&
        /G\.journal = Array\.isArray\(data\.journal\) \? data\.journal : \[\]/.test(src));
})();

section('--- the game writes to it ---');
(function () {
  var G = { t: 900, here: { id: 'k', name: 'Kesh' }, ship: { credits: 5000 }, wanted: { navy: 300 },
            galaxy: { factionById: { navy: { name: 'Kesh Navy' } } } };
  var paid = Combat.payBounty(G, 'navy');
  var last = (G.journal || [])[G.journal ? G.journal.length - 1 : 0];
  check('clearing a bounty is logged, by the faction\'s name and what it cost', paid > 0 && last && last.kind === 'law' &&
        /Kesh Navy/.test(last.text) && last.text.indexOf(String(paid)) >= 0, last && last.text);
  var G2 = { t: 10, here: { id: 'k', name: 'Kesh' }, ship: { credits: 0 }, wanted: { navy: 300 } };
  Combat.payBounty(G2, 'navy');
  check('and a bounty you could not pay is not', !G2.journal || !G2.journal.length);
})();

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
