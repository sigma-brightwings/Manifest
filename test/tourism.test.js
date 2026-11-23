/* tourism.test.js - worlds worth visiting, slice 2: the passage board
 * follows appeal (2026-11-20).
 *
 *     node test/tourism.test.js
 *
 * claude/worlds-people-and-infrastructure.md. Pinned here:
 *  - the holiday trade is appended LAST, so every other offer on a board is
 *    exactly what it was;
 *  - hops run between the sky and the ground of one world, only on a world
 *    rated pleasant or better, for a day's deadline and less per head than
 *    an ordinary local passage;
 *  - inbound bookings go to the system's best world and come from other
 *    worlds; going-home passages leave only from appealing worlds;
 *  - an appealing world's ports post more passage work than a harsh
 *    world's;
 *  - the board says why people go, and never names a drawback as the draw;
 *  - the same board twice.
 */
'use strict';
global.window = global;
var path = require('path'), SRC = path.join(__dirname, '..', 'src');
['vec3', 'kepler', 'rng', 'economy', 'appeal', 'generate', 'galaxy', 'sim', 'combat', 'missions']
  .forEach(function (f) { require(path.join(SRC, f + '.js')); });
var Gen = global.Gen, Galaxy = global.Galaxy, A = global.Appeal, M = global.Missions;

var pass = 0, fail = 0;
function check(n, c, d) {
  if (c) { pass++; console.log('  ok   ' + n + (d !== undefined ? '   ' + d : '')); }
  else { fail++; console.log('  FAIL ' + n + (d !== undefined ? '   ' + d : '')); }
}

var galaxy = Galaxy.build('kawartha');
var stars = galaxy.stars.filter(function (s) { return s.factionId; }).slice(0, 50);
var DAY = 86400, WINDOWS = [0, 3, 6, 9].map(function (k) { return 1000 + k * DAY; });

var all = [];          // { star, sys, port, t, offers }
stars.forEach(function (st) {
  var sys = Gen.generateSystem(st.seed, Galaxy.systemOpts(galaxy, st));
  (sys.ports || []).forEach(function (p) {
    if (!p.market || p.dug) return;
    WINDOWS.forEach(function (t) {
      all.push({ star: st, sys: sys, port: p, t: t, offers: M.boardAt(p, sys, galaxy, st, t) });
    });
  });
});
function scoreOf(sys, w) { var a = w ? A.of(sys, w) : null; return a ? a.score : 0; }
var tours = [];
all.forEach(function (b) { b.offers.forEach(function (o) { if (o.tourist) tours.push({ b: b, o: o }); }); });
console.log('     ' + all.length + ' boards, ' + tours.length + ' holiday offers');

console.log('--- appended last ---');
var order = all.every(function (b) {
  var seen = false;
  return b.offers.every(function (o) { if (o.tourist) seen = true; return o.tourist || !seen; });
});
check('every holiday offer comes after every other offer on its board', order);
check('their ids are their own', tours.every(function (x) { return x.o.id.indexOf('tr|') === 0; }));
var ids = {}, dup = 0;
/* Port ids (b2p1...) repeat from system to system, so the key carries the star. */
all.forEach(function (b) { b.offers.forEach(function (o) {
  var key = b.star.id + '|' + o.id + '@' + b.t;
  if (ids[key]) dup++; ids[key] = 1;
}); });
check('no id collides with another offer in the same window', dup === 0, dup + ' collisions');

/* And the claim itself: with the holiday trade switched off (no Appeal,
 * so touristOffers returns at once), every other offer is identical, field
 * by field, text included. */
var keep = global.Appeal, sample = all.filter(function (b, i) { return i % 7 === 0; });
global.Appeal = undefined;
var without = sample.map(function (b) { return M.boardAt(b.port, b.sys, galaxy, b.star, b.t); });
global.Appeal = keep;
var strip = function (o) { return JSON.stringify(o); };
var sameOld = sample.every(function (b, i) {
  var a = b.offers.filter(function (o) { return !o.tourist; }).map(strip);
  var z = without[i].map(strip);
  return a.length === z.length && a.every(function (s, j) { return s === z[j]; });
});
check('every other offer is what it was without the holiday trade, field by field', sameOld,
      sample.length + ' boards compared');

console.log('--- hops ---');
var hops = tours.filter(function (x) { return x.o.tourist === 'hop'; });
check('some appealing worlds post hops', hops.length > 0, hops.length + ' hops');
var sys0 = function (x) { return x.b.sys; };
check('a hop stays on its world, sky to ground or ground to sky', hops.every(function (x) {
  var to = sys0(x).byId[x.o.toPortId];
  return to && to.parentBody === x.b.port.parentBody && !!to.surface !== !!x.b.port.surface;
}));
check('only a pleasant-or-better world posts hops', hops.every(function (x) {
  return scoreOf(x.b.sys, x.b.port.parentBody) >= 0.5;
}));
check('a hop is a day\'s work', hops.every(function (x) { return x.o.deadline - (x.b.t - (x.b.t % M.WINDOW || 0)) <= DAY + 1; }));
var perHop = hops.map(function (x) { return x.o.pay / x.o.souls; }).sort(function (a, b) { return a - b; });
var plain = [];
all.forEach(function (b) { b.offers.forEach(function (o) {
  if (o.type === 'passage' && !o.tourist && o.toPortId && o.id.indexOf('p|') === 0) plain.push(o.pay / o.souls);
}); });
plain.sort(function (a, b) { return a - b; });
var med = function (a) { return a.length ? a[Math.floor(a.length / 2)] : NaN; };
check('a hop pays less per head than an ordinary local passage', med(perHop) < med(plain),
      Math.round(med(perHop)) + ' vs ' + Math.round(med(plain)) + ' cr per head (median)');

console.log('--- inbound and going home ---');
var inb = tours.filter(function (x) { return x.o.tourist === 'inbound'; });
check('inbound bookings occur', inb.length > 0, inb.length);
check('an inbound booking goes to the system\'s best world, from another world', inb.every(function (x) {
  var to = x.b.sys.byId[x.o.toPortId], here = x.b.port.parentBody;
  if (!to || to.parentBody === here) return false;
  var bestScore = 0;
  (x.b.sys.ports || []).forEach(function (p) {
    if (p.market && !p.dug && p.parentBody && p.parentBody !== here) bestScore = Math.max(bestScore, scoreOf(x.b.sys, p.parentBody));
  });
  return Math.abs(scoreOf(x.b.sys, to.parentBody) - bestScore) < 1e-9 && bestScore >= 0.5;
}));
var home = tours.filter(function (x) { return x.o.tourist === 'home'; });
check('going-home passages occur', home.length > 0, home.length);
check('they leave only from appealing worlds, for another star', home.every(function (x) {
  return scoreOf(x.b.sys, x.b.port.parentBody) >= 0.5 && x.o.toStarId && x.o.toStarId !== x.b.star.id;
}));

console.log('--- the board follows appeal ---');
function passagesPerBoard(pred) {
  var n = 0, k = 0;
  all.forEach(function (b) {
    if (!pred(scoreOf(b.sys, b.port.parentBody))) return;
    k++; n += b.offers.filter(function (o) { return o.type === 'passage'; }).length;
  });
  return k ? n / k : NaN;
}
var hi = passagesPerBoard(function (s) { return s >= 0.7; }), lo = passagesPerBoard(function (s) { return s < 0.3; });
check('a postcard world\'s board carries more passage work than a harsh world\'s', hi > lo,
      hi.toFixed(2) + ' vs ' + lo.toFixed(2) + ' per board');

console.log('--- the words ---');
check('every holiday offer says why people go', tours.every(function (x) { return typeof x.o.reason === 'string' && x.o.reason.length > 10; }));
var couples = tours.filter(function (x) { return /couple/.test(x.o.core); });
check('a couple is two people', couples.length > 0 && couples.every(function (x) { return x.o.souls === 2; }),
      couples.length + ' couples');
check('a drawback is never the draw', tours.every(function (x) { return !/grey skies|gravity|thin air|thick air|\bhot\b|\bcold\b/.test(x.o.reason); }));
check('the reason reaches the long form', tours.length && tours.every(function (x) { return typeof x.o.desc === 'string' && x.o.desc.indexOf(x.o.reason) >= 0; }),
      tours[0] ? tours[0].o.desc : 'none');
console.log('     e.g. ' + tours.filter(function (x) { return x.o.tourist === 'hop'; }).slice(0, 2).map(function (x) { return x.o.text + ' | ' + x.o.desc; }).join('\n          '));

console.log('--- the same twice ---');
var probe = tours[0];
var again = probe ? M.boardAt(probe.b.port, probe.b.sys, galaxy, probe.b.star, probe.b.t) : [];
check('the same board, offer for offer', probe && JSON.stringify(again.map(function (o) { return [o.id, o.pay, o.souls]; })) ===
      JSON.stringify(probe.b.offers.map(function (o) { return [o.id, o.pay, o.souls]; })));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
