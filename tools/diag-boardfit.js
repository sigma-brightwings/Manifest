/* diag-boardfit.js - how often does a board run past what the F7 panel can
 * draw, and how many holiday offers fall off the bottom? (2026-11-20)
 *     node tools/diag-boardfit.js [rowsThatFit=11]
 */
'use strict';
global.window = global;
var path = require('path'), SRC = path.join(__dirname, '..', 'src');
['vec3', 'kepler', 'rng', 'economy', 'appeal', 'generate', 'galaxy', 'sim', 'combat', 'missions']
  .forEach(function (f) { require(path.join(SRC, f + '.js')); });
var Gen = global.Gen, Galaxy = global.Galaxy, M = global.Missions;
var FIT = +(process.argv[2] || 11);
var galaxy = Galaxy.build('kawartha');
var stars = galaxy.stars.filter(function (s) { return s.factionId; }).slice(0, 50);
var boards = 0, over = 0, overBefore = 0, tours = 0, toursCut = 0, hist = {};
stars.forEach(function (st) {
  var sys = Gen.generateSystem(st.seed, Galaxy.systemOpts(galaxy, st));
  (sys.ports || []).forEach(function (p) {
    if (!p.market || p.dug) return;
    [1000, 1000 + 3 * 86400, 1000 + 6 * 86400].forEach(function (t) {
      var b = M.boardAt(p, sys, galaxy, st, t);
      boards++;
      var old = b.filter(function (o) { return !o.tourist; }).length;
      hist[b.length] = (hist[b.length] || 0) + 1;
      if (b.length > FIT) over++;
      if (old > FIT) overBefore++;
      b.forEach(function (o, i) { if (o.tourist) { tours++; if (i >= FIT) toursCut++; } });
    });
  });
});
console.log('rows that fit: ' + FIT + ' | boards ' + boards);
console.log('over the edge before the holiday trade: ' + overBefore + ' (' + (100 * overBefore / boards).toFixed(1) + '%)');
console.log('over the edge now: ' + over + ' (' + (100 * over / boards).toFixed(1) + '%)');
console.log('holiday offers cut off: ' + toursCut + ' of ' + tours + ' (' + (100 * toursCut / tours).toFixed(1) + '%)');
console.log('rows per board: ' + JSON.stringify(hist));
