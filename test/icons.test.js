/* icons.test.js - the drawn marks (icons.js, 2026-11-20).
 *
 *     node test/icons.test.js
 *
 * Pinned:
 *   - every port in a sample of systems gets a port icon, by who runs it
 *     first and what it does second; every hull a ship icon;
 *   - navy ports and warships, Syndicate ports and runners, pirates and
 *     police are told apart;
 *   - every icon draws without throwing, using only canvas calls (no text:
 *     Astra asked for icons "without using ascii characters");
 *   - the key lists only icons that draw.
 */
global.window = global.window || global;
require('../src/vec3.js'); require('../src/rng.js'); require('../src/kepler.js'); require('../src/economy.js');
var Gen = require('../src/generate.js'), Galaxy = require('../src/galaxy.js');
require('../src/rings.js'); var Sim = require('../src/sim.js');
try { require('../src/combat.js'); } catch (e) { /* fleetPort is optional */ }
var Ic = require('../src/icons.js');

var pass = 0, fail = 0;
function check(n, c, d) {
  if (c) { pass++; console.log('  ok   ' + n + (d ? '   ' + d : '')); }
  else { fail++; console.log('  FAIL  ' + n + (d ? '   ' + d : '')); }
}

/* A canvas that records what was called, and refuses text. */
function fakeCtx() {
  var calls = { text: 0, paths: 0 };
  var ctx = {
    calls: calls, globalAlpha: 1, lineWidth: 1,
    save: function () {}, restore: function () {}, beginPath: function () { calls.paths++; }, closePath: function () {},
    moveTo: function () {}, lineTo: function () {}, arc: function () {}, quadraticCurveTo: function () {},
    fill: function () {}, stroke: function () {},
    fillRect: function () { calls.paths++; }, strokeRect: function () { calls.paths++; },
    translate: function () {}, rotate: function () {}, setLineDash: function () {},
    fillText: function () { calls.text++; }, strokeText: function () { calls.text++; }
  };
  return ctx;
}

console.log('--- ports and hulls ---');
var gal = Galaxy.build('kawartha'), tally = {}, unmarked = 0, ports = 0, ships = 0, sk = {};
for (var i = 0; i < 30; i++) {
  var st = gal.stars[i], sys = Gen.generateSystem(st.seed, Galaxy.systemOpts(gal, st));
  (sys.ports || []).forEach(function (p) {
    ports++;
    var k = Ic.kindOf({ kind: 'body', obj: p }, sys);
    if (!k || k.indexOf('port-') !== 0) unmarked++;
    tally[k] = (tally[k] || 0) + 1;
  });
  Sim.shipsAll(sys, 3 * 86400).forEach(function (s) {
    ships++;
    var k2 = Ic.kindOf({ kind: 'ship', obj: s }, sys);
    sk[k2] = (sk[k2] || 0) + 1;
  });
}
check('every port has a port icon', unmarked === 0 && ports > 0, ports + ' ports: ' + JSON.stringify(tally));
check('several kinds of port, told apart', Object.keys(tally).length >= 5);
check('every hull has a ship icon', Object.keys(sk).every(function (k) { return k.indexOf('ship') === 0; }), ships + ' hulls: ' + JSON.stringify(sk));
check('warships, police and pirates are not traders', ['ship-navy', 'ship-police', 'ship-pirate'].some(function (k) { return sk[k] > 0; }));
check('a navy port is a navy port', Ic.portKind({ livery: 'navy', market: { role: 'orbital' } }, {}) === 'port-navy');
check('a Syndicate port is a Syndicate port',
      Ic.portKind({ faction: 'f1', market: { role: 'mining' } }, { factionById: { f1: { outlaw: true } } }) === 'port-syndicate');
check('a mining head on the ground stands on the ground', Ic.portKind({ surface: true, market: { role: 'mining' } }, {}) === 'port-mining-ground');
check('yours is yours', Ic.portKind({ playerStation: 'st1', market: { role: 'mining' } }, {}) === 'port-player');
check('a runner flies a Syndicate chevron', Ic.shipKind({ route: { runner: true } }) === 'ship-syndicate');

console.log('--- drawn, not typed ---');
var all = ['ship', 'ship-pirate', 'ship-navy', 'ship-police', 'ship-syndicate', 'port-orbital', 'port-highport', 'port-yard',
           'port-refinery', 'port-mining', 'port-mining-ground', 'port-agri', 'port-agri-ground', 'port-navy', 'port-syndicate',
           'port-player', 'port-ground', 'sat', 'mysat', 'sat-down', 'sat-gone', 'star', 'planet', 'moon', 'incident',
           'incident-over', 'contact', 'you', 'milsat', 'milsat-down', 'milsat-gone'];
var threw = [], texty = [];
all.forEach(function (k) {
  var c = fakeCtx();
  try { Ic.draw(c, k, 10, 10, 5, '#fff'); } catch (e) { threw.push(k + ': ' + e.message); }
  if (c.calls.text) texty.push(k);
  if (!c.calls.paths) texty.push(k + ' (drew nothing)');
});
check('every icon draws', threw.length === 0, threw.join('; '));
check('and none of them is a letter', texty.length === 0, texty.join(', '));
var cl = fakeCtx(); Ic.link(cl, 0, 40, 5, true, '#fff'); Ic.link(cl, 0, 40, 5, false, '#fff');
check('links up and down draw too', cl.calls.text === 0 && cl.calls.paths >= 3);
check('the key lists only icons that draw', Ic.LEGEND.every(function (l) { return all.indexOf(l[0]) >= 0; }));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
