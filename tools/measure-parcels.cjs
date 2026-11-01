/* measure-parcels.cjs — how often a sealed courier parcel is dirty, and
 * whether the board's tells actually mean something (2026-11-01).
 *
 *     node tools/measure-parcels.cjs
 *
 * Doctrine 6: the odds in missions.js (parcelOdds) were set against these
 * numbers, not guessed. What has to hold:
 *   - a mid-band fee to lawful ground out of a quiet system is clean very
 *     nearly always (the "no coin flip" rule in PLAN.md Phase 10);
 *   - the top of the band, bound for Syndicate or pirate ground, is where
 *     the risk lives;
 *   - a shady client really is a worse bet than a proper one.
 */
'use strict';
var path = require('path');
var SRC = path.join(__dirname, '..', 'src');
require(path.join(SRC, 'vec3.js'));
require(path.join(SRC, 'kepler.js'));
require(path.join(SRC, 'rng.js'));
require(path.join(SRC, 'economy.js'));
var Gen = require(path.join(SRC, 'generate.js'));
var Galaxy = require(path.join(SRC, 'galaxy.js'));
require(path.join(SRC, 'sim.js'));
require(path.join(SRC, 'combat.js'));
var M = require(path.join(SRC, 'missions.js'));

var SEEDS = ['kawartha', 'alpha', 'pigeon', 'manifest', 'reverie', 'orrin', 'beaverton', 'quill'];
var SHADY = /quiet man|did not give a name|checking the door/;
var all = [];
SEEDS.forEach(function (seed) {
  var g = Galaxy.build(seed);
  for (var s = 0; s < g.stars.length && s < 30; s++) {
    var star = g.stars[s];
    if (!star.factionId) continue;
    var sys = Gen.generateSystem(star.seed, Galaxy.systemOpts ? Galaxy.systemOpts(g, star)
      : { faction: g.factionById[star.factionId], allFactions: g.factions });
    (sys.ports || []).forEach(function (port) {
      for (var w = 0; w < 12; w++) {
        var t = w * M.WINDOW + 1;
        M.boardAt(port, sys, g, star, t).forEach(function (o) {
          if (o.type !== 'courier' || !o.contents) return;
          var fac = g.factionById[(g.stars.filter(function (x) { return x.id === o.toStarId; })[0] || {}).factionId];
          all.push({
            pp: (o.pay - 1800) / 3000,
            held: !!(fac && (fac.outlaw || fac.parentId === 'outlaw')),
            crime: sys.crimeScore,
            dirty: o.contents.dirty,
            shady: SHADY.test(o.desc)
          });
        });
      }
    });
  }
});

function rate(list) {
  if (!list.length) return 'n=0';
  var d = list.filter(function (x) { return x.dirty; }).length;
  return (100 * d / list.length).toFixed(1) + '% of ' + list.length;
}
console.log('courier offers sampled:', all.length);
console.log('dirty overall               ', rate(all));
console.log('fee below mid, lawful, crime<=50', rate(all.filter(function (x) { return x.pp < 0.5 && !x.held && x.crime <= 50; })));
console.log('fee below mid, anything     ', rate(all.filter(function (x) { return x.pp < 0.5; })));
console.log('top quarter of the band      ', rate(all.filter(function (x) { return x.pp >= 0.75; })));
console.log('to Syndicate/pirate ground   ', rate(all.filter(function (x) { return x.held; })));
console.log('top quarter AND held ground  ', rate(all.filter(function (x) { return x.pp >= 0.75 && x.held; })));
console.log('shady client                 ', rate(all.filter(function (x) { return x.shady; })));
console.log('proper client                ', rate(all.filter(function (x) { return !x.shady; })));
