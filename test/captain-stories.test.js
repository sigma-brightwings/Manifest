/* captain-stories.test.js - the stories on the title card.
 *   node test/captain-stories.test.js
 * Each fits the box, each names its captain, and the pick never shows the
 * same story twice running. */
var store = {};
global.localStorage = {
  getItem: function (k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
  setItem: function (k, v) { store[k] = String(v); }
};
var Captains = require('../src/captain-stories.js');

var pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail ? '   ' + detail : '')); }
}

console.log('--- the stories ---');
check('there are at least ten', Captains.LIST.length >= 10, Captains.LIST.length);
var long = Captains.LIST.filter(function (s) { return s.text.length > Captains.MAX_CHARS; });
check('every story fits the box', long.length === 0,
      long.map(function (s) { return s.name + ' ' + s.text.length; }).join(', '));
check('every story names a captain', Captains.LIST.every(function (s) { return /^Captain \S+/.test(s.name); }));
var surnames = Captains.LIST.map(function (s) { return s.name.split(' ').pop(); });
check('and its story uses the name', Captains.LIST.every(function (s, i) { return s.text.indexOf(surnames[i]) >= 0; }));
var names = {};
Captains.LIST.forEach(function (s) { names[s.name] = 1; });
check('no two captains share a name', Object.keys(names).length === Captains.LIST.length);

console.log('--- the pick ---');
var seq = [0, 0.99, 0.5, 0, 0, 0.3, 0.999, 0.999], k = 0;
function rand() { return seq[k++ % seq.length]; }
var prev = Captains.pick(rand).index, repeats = 0, seen = {};
seen[prev] = 1;
for (var i = 0; i < 400; i++) {
  var p = Captains.pick(i < 8 ? rand : Math.random);
  if (p.index === prev) repeats++;
  if (p.index < 0 || p.index >= Captains.LIST.length) repeats += 1000;
  seen[p.index] = 1;
  prev = p.index;
}
check('never the same story twice running', repeats === 0, repeats + ' repeats');
check('and every story comes up', Object.keys(seen).length === Captains.LIST.length, Object.keys(seen).length);
store['manifest.lastCaptain'] = 'garbage';
check('a bad stored value is ignored', Captains.pick().index >= 0);
global.localStorage = { getItem: function () { throw new Error('blocked'); }, setItem: function () { throw new Error('blocked'); } };
check('blocked storage still gives a story', !!Captains.pick().text);
delete global.localStorage;
check('and so does no storage at all', !!Captains.pick().text);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
