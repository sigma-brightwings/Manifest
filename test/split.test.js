/* split.test.js - the pirates split from the Syndicate (2026-10-31).
 *
 *     node test/split.test.js
 *
 * Astra: "Syndicate is mafia. Pirates are like their disposable muscle."
 * galaxy.js draws the bands (galaxy.test.js pins the map); this pins what a
 * band's systems are like once generated, against the Syndicate's own:
 *  - heldBy says whose, and pirateHeld stays true for both;
 *  - a band's space is violent and not very corrupt, Anarchy its commonest
 *    government; the Syndicate's is the reverse;
 *  - a band runs no police, keeps no Syndicate heavies, and is not taxed by
 *    the Syndicate's tithe; its raiders are out in force;
 *  - the navy crosses a band's space far more often than the Syndicate's;
 *  - the save epoch moved, because the map did.
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
var Tithe = require(path.join(SRC, 'tithe.js')) || global.Tithe;
Tithe = global.Tithe || Tithe;
var Save = require(path.join(SRC, 'save.js'));

var pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail !== undefined ? '   ' + detail : '')); }
}

var band = [], syn = [];
['kawartha', 'abby', 'manifest', 'split-a', 'split-b', 'split-c'].forEach(function (seed) {
  var g = Galaxy.build(seed);
  g.stars.forEach(function (st) {
    var f = g.factionById[st.factionId];
    if (!f || !f.outlaw) return;
    if (!f.pirate && syn.length >= 80) return;
    var sys = Gen.generateSystem(st.seed, { faction: f, allFactions: g.factions });
    (f.pirate ? band : syn).push(sys);
  });
});
function mean(a, k) { return a.reduce(function (s, x) { return s + x[k]; }, 0) / a.length; }
function share(a, fn) { return a.filter(fn).length / a.length; }

console.log('\n' + band.length + ' band systems, ' + syn.length + ' Syndicate systems');
check('whose it is: heldBy, with pirateHeld still true for both',
      band.every(function (s) { return s.heldBy === 'pirate' && s.pirateHeld; }) &&
      syn.every(function (s) { return s.heldBy === 'syndicate' && s.pirateHeld; }));
check('the Syndicate is still the system\'s outlaw power, not a band',
      band.every(function (s) { return s.outlaw && s.outlaw.id === 'outlaw'; }));

var bv = mean(band, 'violence'), bc = mean(band, 'corruption'), sv = mean(syn, 'violence'), sc = mean(syn, 'corruption');
check('a band\'s space is violent', bv > 55, bv.toFixed(0));
check('and not very corrupt', bc < 45, bc.toFixed(0));
check('the Syndicate\'s is the reverse: bought, not wild', sc > 60 && sv < bv - 20, 'v ' + sv.toFixed(0) + ' c ' + sc.toFixed(0));
var anarchy = share(band, function (s) { return s.government.name === 'Anarchy'; });
var synAnarchy = share(syn, function (s) { return s.government.name === 'Anarchy'; });
check('Anarchy is where a band usually lives', anarchy > 0.2 && anarchy > synAnarchy * 4,
      (anarchy * 100).toFixed(0) + '% vs ' + (synAnarchy * 100).toFixed(0) + '%');

function patrols(a, fn) { return a.reduce(function (n, s) { return n + (s.patrols || []).filter(fn).length; }, 0); }
check('a band runs no police', patrols(band, function (p) {
  return p.kind === 'police' && /^pb\d$/.test(p.faction);
}) === 0);
check('and keeps no Syndicate heavies', patrols(band, function (p) { return p.heavy; }) === 0);
check('its raiders are out in force',
      patrols(band, function (p) { return p.kind === 'pirate'; }) / band.length >
      patrols(syn, function (p) { return p.kind === 'pirate'; }) / syn.length + 1);
var bNavy = share(band, function (s) { return (s.patrols || []).some(function (p) { return p.passing; }); });
var sNavy = share(syn, function (s) { return (s.patrols || []).some(function (p) { return p.passing; }); });
check('the navy crosses a band\'s space far more than the Syndicate\'s', bNavy > sNavy * 1.8,
      (bNavy * 100).toFixed(0) + '% vs ' + (sNavy * 100).toFixed(0) + '%');
check('the Syndicate\'s tithe is not collected in a band\'s space',
      band.every(function (s) { return !Tithe.held(s); }) && syn.every(function (s) { return Tithe.held(s); }));
/* A milfuel plant still wears its licensor's colours, and in a band's space
 * that is the Syndicate's licence: the band is its muscle. */
check('nor does a band\'s own port wear the Syndicate\'s livery',
      band.every(function (s) { return (s.ports || []).every(function (p) {
        return p.faction === 'outlaw' || (p.market && p.market.role === 'milfuel') || p.livery !== 'syn';
      }); }));

check('the save epoch moved with the map', Save.VERSION === undefined || Save.VERSION >= 4, Save.VERSION);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
