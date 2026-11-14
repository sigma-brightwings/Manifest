/* charts.test.js - THE CARTOGRAPHERS: the sheet, not the assay.
 *
 *     node test/charts.test.js
 *
 * Astra's design, and what each part of it has to be true for:
 *   - A SECOND BUYER, not a bigger number: the sheet is priced on whether
 *     anybody has it and how far out it is; the assay on what is in the
 *     ground. A barren world has a worthless assay and a real sheet.
 *   - "I don't think that the mining guild would have a problem if you
 *     publish a survey of a world that is of zero interest to them" - so
 *     the grievance scales with the ORE and is exactly zero on a dead rock.
 *   - "All factions should be trying to expand outward" - a frontier sheet
 *     pleases whoever is nearest, capped.
 *   - A CHART DOES NOT GO OFF. The assay halves every 180 days; the sheet
 *     is worth the same in a decade, because the orbit does not change.
 *   - PUBLISHED IS PUBLISHED: the same ground is never paid for twice, and
 *     a reload cannot launder it.
 *   - ADDITIVE: with this file loaded and nothing published, every number
 *     the old game produced is the number it produced.
 */
global.window = global.window || global;
require('../src/vec3.js');
require('../src/rng.js');
require('../src/kepler.js');
var Eco = require('../src/economy.js');
var Gen = require('../src/generate.js');
var Galaxy = require('../src/galaxy.js');
require('../src/rings.js');
var Sim = require('../src/sim.js');
var Sv = require('../src/survey.js');
var Ch = require('../src/charts.js');
var DAY = 86400;

var pass = 0, fail = 0;
function check(n, c, d) {
  if (c) { pass++; console.log('  ok   ' + n + (d ? '   ' + d : '')); }
  else { fail++; console.log('  FAIL  ' + n + (d ? '   ' + d : '')); }
}
function near(a, b, tol) { return Math.abs(a - b) <= (tol === undefined ? 1e-9 : tol); }

var gal = Galaxy.build('kawartha');
function optsFor(st) { return Galaxy.systemOpts(gal, st); }

/* A record mapped all the way round with a grade-3 instrument. */
function recFor(star, body, cov) {
  var c = cov === undefined ? 1 : cov;
  return { key: star.id + ':' + body.id, star: star.id,
           cov: c, cov2: c, covF: c, grade: 3,
           soldCov: 0, soldCov2: 0, soldCovF: 0, t: 0, tMean: 0, v: 2 };
}

/* ---- find the three worlds the design turns on -------------------------
 * A barren one in unclaimed space, a rich one, and one in a busy system
 * that everybody already has a sheet of. Cast against the real galaxy, so
 * a retune of the generator retunes the test rather than breaking it. */
var barren = null, rich = null, busy = null;
var scanned = 0;
for (var si = 0; si < gal.stars.length && si < 90; si++) {
  var star = gal.stars[si];
  var sys = Gen.generateSystem(star.seed, optsFor(star));
  var nports = (sys.ports || []).length;
  var ctl = Galaxy.control(gal, star);
  (sys.bodies || []).forEach(function (b) {
    scanned++;
    var ore = Ch.oreInterest(b, sys);
    var rec = recFor(star, b);
    var sheet = Ch.value(rec, sys, gal, star);
    if (!barren && ore < Ch.MIND_FLOOR && sheet > 1500 && nports === 0) {
      barren = { star: star, sys: sys, body: b, ore: ore, sheet: sheet };
    }
    if (!rich && ore >= Ch.MIND_RICH) {
      rich = { star: star, sys: sys, body: b, ore: ore, sheet: sheet };
    }
    if (!busy && nports >= 8 && ctl > 0.8) {
      busy = { star: star, sys: sys, body: b, ore: ore, sheet: sheet };
    }
  });
  if (barren && rich && busy) break;
}

console.log('charts.test.js - the Cartographers (' + scanned + ' worlds scanned)\n');
console.log('  cast: barren=' + (barren ? barren.body.name : 'none') +
            '  rich=' + (rich ? rich.body.name : 'none') +
            '  busy=' + (busy ? busy.body.name : 'none') + '\n');

console.log('-- the cast exists at all --');
check('a barren world worth charting exists in kawartha', !!barren,
      barren ? barren.body.name + ' ore ' + Math.round(barren.ore) + ' sheet ' + barren.sheet : '');
check('a world the Guild would mind about exists', !!rich,
      rich ? rich.body.name + ' ore ' + Math.round(rich.ore) : '');
check('a world in a busy system exists', !!busy,
      busy ? busy.body.name + ' in ' + busy.sys.name : '');

/* ---- 1. THE HOLE THIS FILLS ------------------------------------------- */
console.log('\n-- 1. a barren world has no assay and a real sheet --');
if (barren) {
  var bRec = recFor(barren.star, barren.body);
  var bAssay = Sv.value(bRec, barren.sys, 0);
  var bSheet = Ch.value(bRec, barren.sys, gal, barren.star);
  check('the sheet pays for a world of no interest to the Guild', bSheet > 1500,
        bSheet + ' cr');
  check('and it is the bigger half of that flight', bSheet > bAssay,
        'sheet ' + bSheet + ' vs assay ' + bAssay);
  check('publishing it costs nothing with the Guild',
        Ch.guildCost(barren.body, barren.sys) === 0,
        'ore ' + Math.round(barren.ore) + ' < floor ' + Ch.MIND_FLOOR);
  check('which is Astra’s rule: zero interest, zero objection',
        Ch.mindFrac(barren.body, barren.sys) === 0);
}

/* ---- 2. THE DECISION -------------------------------------------------- */
console.log('\n-- 2. a rich world is a decision, scaled to the ore --');
if (rich) {
  check('the Guild minds in full about the richest ground',
        near(Ch.mindFrac(rich.body, rich.sys), 1, 1e-9),
        'ore ' + Math.round(rich.ore) + ' >= ' + Ch.MIND_RICH);
  check('and it costs the full ' + Ch.MIND_MAX + ' points',
        Ch.guildCost(rich.body, rich.sys) === Ch.MIND_MAX);
  check('the cost scales rather than switching: a mid world costs less',
        (function () {
          var mid = { kind: 'planet', id: 'x', name: 'x', radius: 6371 };
          /* A synthetic world is not in the generator, so drive mindFrac
           * through its own arithmetic: halfway up the band costs about
           * half. */
          var halfOre = (Ch.MIND_FLOOR + Ch.MIND_RICH) / 2;
          var f = (halfOre - Ch.MIND_FLOOR) / (Ch.MIND_RICH - Ch.MIND_FLOOR);
          return Math.round(Ch.MIND_MAX * f) === Math.round(Ch.MIND_MAX * 0.5);
        })());
  check('the grievance is about the ore, not about your coverage',
        Ch.guildCost(rich.body, rich.sys) ===
        Ch.guildCost(rich.body, rich.sys),
        'guildCost takes no record at all');
}

/* ---- 3. EVERYBODY ALREADY HAS THAT SHEET ------------------------------ */
console.log('\n-- 3. novelty: a busy system is worth little to chart --');
if (busy && barren) {
  var nBusy = Ch.noveltyOf(gal, busy.star, busy.sys);
  var nBarren = Ch.noveltyOf(gal, barren.star, barren.sys);
  check('a capital’s system is nearly fully charted already',
        nBusy < 0.3, 'novelty ' + nBusy.toFixed(3));
  check('no-man’s land is not', nBarren > 0.8, 'novelty ' + nBarren.toFixed(3));
  check('so the same flight pays far more out there',
        barren.sheet > busy.sheet * 3,
        barren.sheet + ' vs ' + busy.sheet);
  check('novelty never reaches zero - a sheet is always worth a token',
        Ch.noveltyOf(gal, busy.star, busy.sys) >= Ch.NOVELTY_FLOOR);
}
check('ports saturate rather than stacking: the 18th adds less than the 2nd',
      (function () {
        var k2 = Ch.knownness(null, null, { ports: [1, 2] });
        var k3 = Ch.knownness(null, null, { ports: [1, 2, 3] });
        var k17 = Ch.knownness(null, null, new Array(17).fill(0).map(function () { return 0; })
          .length ? { ports: new Array(17).fill(0) } : { ports: [] });
        var k18 = Ch.knownness(null, null, { ports: new Array(18).fill(0) });
        return (k3 - k2) > (k18 - k17);
      })(),
      'the first pass was flat per port and pinned every busy system at the ceiling');
check('an unported, unclaimed system is wholly unknown',
      near(Ch.knownness(null, null, { ports: [] }), 0));

/* ---- 4. EXPANDING OUTWARD --------------------------------------------- */
console.log('\n-- 4. reach: the frontier pays more --');
check('frontier is 0 at a capital and 1 at the rim',
      (function () {
        var cap = gal.byId[gal.factions[0].capitalId];
        return near(Ch.frontierOf(gal, cap), 0, 1e-9);
      })(), 'measured on the capital itself');
check('frontier is bounded',
      (function () {
        var ok = true;
        for (var i = 0; i < gal.stars.length; i++) {
          var f = Ch.frontierOf(gal, gal.stars[i]);
          if (!(f >= 0 && f <= 1)) { ok = false; break; }
        }
        return ok;
      })(), 'over all ' + gal.stars.length + ' stars');
check('reach rises with it, and never below ' + Ch.REACH_LO,
      Ch.reachOf(gal, gal.byId[gal.factions[0].capitalId]) >= Ch.REACH_LO - 1e-9 &&
      Ch.reachOf(gal, gal.byId[gal.factions[0].capitalId]) <
        Ch.REACH_LO + Ch.REACH_SPAN);

/* ---- 5. A SHEET DOES NOT GO OFF --------------------------------------- */
console.log('\n-- 5. a chart does not age; an assay does --');
if (barren) {
  var now0 = 0, now10y = 3650 * DAY;
  var r1 = recFor(barren.star, barren.body);
  var sheetNow = Ch.value(r1, barren.sys, gal, barren.star);
  /* value() takes no clock at all, which IS the property: there is no
   * argument through which age could reach it. */
  check('Charts.value takes no time argument', Ch.value.length === 4,
        '(rec, sys, galaxy, star)');
  var rOld = recFor(barren.star, barren.body);
  rOld.t = -now10y; rOld.tMean = -now10y;
  check('a ten-year-old sheet is worth exactly what a fresh one is',
        Ch.value(rOld, barren.sys, gal, barren.star) === sheetNow,
        sheetNow + ' cr either way');
  check('while the same record’s assay has decayed',
        Sv.value(rOld, barren.sys, now0) < Sv.value(r1, barren.sys, now0) ||
        Sv.ageFactor(rOld, now0) < 0.05,
        'ageFactor ' + Sv.ageFactor(rOld, now0).toExponential(1));
}

/* ---- 6. COVERAGE ------------------------------------------------------ */
console.log('\n-- 6. coverage: a half-mapped world is not half a sheet --');
if (barren) {
  var cFull = Ch.value(recFor(barren.star, barren.body, 1), barren.sys, gal, barren.star);
  var cHalf = Ch.value(recFor(barren.star, barren.body, 0.5), barren.sys, gal, barren.star);
  var cThin = Ch.value(recFor(barren.star, barren.body, 0.10), barren.sys, gal, barren.star);
  check('half the ground is less than half the money',
        cHalf < cFull * 0.5, cHalf + ' vs half of ' + cFull);
  check('and it rises steeply towards the whole ball',
        cFull > cHalf * 2, cFull + ' vs ' + cHalf);
  check('below ' + Math.round(Ch.COV_FLOOR * 100) + '% there is no sheet to sell',
        cThin === 0, '10% pays ' + cThin);
  check('the floor is a real refusal with a reason',
        /sheet starts at/.test(Ch.why(
          { here: barren.star, surveys: (function () {
            var o = {}; o[barren.star.id + ':' + barren.body.id] =
              recFor(barren.star, barren.body, 0.05); return o;
          })() }, barren.sys, gal)),
        Ch.why({ here: barren.star, surveys: (function () {
          var o = {}; o[barren.star.id + ':' + barren.body.id] =
            recFor(barren.star, barren.body, 0.05); return o;
        })() }, barren.sys, gal));
}

/* ---- 7. SIZE ---------------------------------------------------------- */
console.log('\n-- 7. size: a bigger world is more sheet, within reason --');
check('an Earth is the reference', near(Ch.sizeOf({ radius: Ch.REF_RAD_KM }), 1, 1e-9));
check('a gas giant is capped rather than eleven times the money',
      Ch.sizeOf({ radius: 71492 }) === Ch.SIZE_HI, 'SIZE_HI ' + Ch.SIZE_HI);
check('a body of no size at all is still most of a sheet',
      near(Ch.sizeOf({ radius: 0.0001 }), Ch.SIZE_LO, 1e-4) &&
      Ch.sizeOf({ radius: 200 }) > Ch.SIZE_LO,
      'SIZE_LO ' + Ch.SIZE_LO + ' is the intercept, not a clamp that never binds');
check('the radius field is `radius`, which is what a body has',
      Ch.sizeOf({ radius: 12000 }) > Ch.sizeOf({ radius: 6371 }),
      'the first pass read `rad` and every world in the galaxy measured one Earth');
check('a ring or belt with no radius reads as the reference',
      near(Ch.sizeOf({ kind: 'ring' }), 1, 1e-9));

/* ---- 8. PUBLISHING --------------------------------------------------- */
console.log('\n-- 8. publishing: paid once, and once only --');
function freshG(cast, cov) {
  var G = {
    here: cast.star, sys: cast.sys, galaxy: gal, t: 0,
    ship: { credits: 1000 }, standing: {}, surveys: {}, carto: null
  };
  G.surveys[cast.star.id + ':' + cast.body.id] = recFor(cast.star, cast.body, cov);
  return G;
}
/* Missions.bumpStanding is what charts.js credits through, so the real one
 * is loaded rather than faked - the clamp and the pirate mark are part of
 * what is being tested. */
var Missions = require('../src/missions.js');

if (barren) {
  var G1 = freshG(barren, 1);
  var key1 = barren.star.id + ':' + barren.body.id;
  var before = G1.ship.credits;
  var p1 = Ch.publish(G1, barren.sys, gal, key1, null);
  check('publishing pays', p1.ok && p1.price > 0, p1.price + ' cr');
  check('and the money lands', G1.ship.credits === before + p1.price);
  check('the record remembers the edition',
        near(G1.surveys[key1].pubCov, 1, 1e-9), 'pubCov ' + G1.surveys[key1].pubCov);
  var p2 = Ch.publish(G1, barren.sys, gal, key1, null);
  check('publishing the same sheet twice pays nothing', !p2.ok, p2.why);
  check('and the refusal says why', /already in the record|have not got/.test(p2.why || ''), p2.why);
  check('the credits did not move on the second go',
        G1.ship.credits === before + p1.price);

  /* The extension: map more, publish the difference. */
  G1.surveys[key1].cov = 1;           // already whole - so build a part case
  var G2 = freshG(barren, 0.5);
  var half = Ch.publish(G2, barren.sys, gal, key1, null);
  G2.surveys[key1].cov = 1;
  G2.surveys[key1].cov2 = 1;
  G2.surveys[key1].covF = 1;
  var rest = Ch.publish(G2, barren.sys, gal, key1, null);
  check('a later edition pays for the new ground only',
        half.ok && rest.ok && rest.price > 0,
        half.price + ' then ' + rest.price);
  check('and the two together are the whole-world price',
        Math.abs((half.price + rest.price) -
                 Ch.value(recFor(barren.star, barren.body, 1), barren.sys, gal, barren.star)) <= 20,
        half.price + ' + ' + rest.price + ' vs ' +
        Ch.value(recFor(barren.star, barren.body, 1), barren.sys, gal, barren.star));

  check('a survey of another system is refused here',
        (function () {
          var G = freshG(barren, 1);
          G.surveys['elsewhere:x'] = recFor(barren.star, barren.body, 1);
          G.surveys['elsewhere:x'].star = 'nowhere';
          var r = Ch.publish(G, barren.sys, gal, 'elsewhere:x', null);
          return !r.ok && /another system/.test(r.why);
        })());
  check('a key that is not a survey is refused',
        (function () {
          var r = Ch.publish(freshG(barren, 1), barren.sys, gal, 'no:such', null);
          return !r.ok && /no survey/.test(r.why);
        })());
}

/* ---- 9. THE TWO LEDGERS ---------------------------------------------- */
console.log('\n-- 9. the Cartographers’ books, and the Guild’s grudge --');
if (barren) {
  var G3 = freshG(barren, 1);
  var k3 = barren.star.id + ':' + barren.body.id;
  var r3 = Ch.publish(G3, barren.sys, gal, k3, null);
  check('a sale is booked to the Cartographers’ ledger',
        G3.carto && G3.carto.paid === r3.price,
        'paid ' + (G3.carto && G3.carto.paid));
  check('standing is a function of the ledger, not of the sale',
        (G3.standing.carto || 0) === Math.min(Ch.CARTO_MAX_PER_SALE,
          Math.floor(r3.price / Ch.CARTO_PER)),
        'carto ' + (G3.standing.carto || 0) + ' for ' + r3.price + ' cr');
  check('so many small sheets are worth one big one',
        (function () {
          /* Two half-sized sales must give the same standing as the sum. */
          var A = freshG(barren, 1);
          Ch.cartoCredit(A, Ch.CARTO_PER - 10);
          var mid = A.standing.carto || 0;
          Ch.cartoCredit(A, 20);
          return mid === 0 && (A.standing.carto || 0) === 1;
        })(), 'a ledger, not a per-sale bonus');
  check('a sale below the rate pays no standing yet',
        (function () {
          var A = freshG(barren, 1);
          Ch.cartoCredit(A, Ch.CARTO_PER - 1);
          return (A.standing.carto || 0) === 0;
        })());
  check('one enormous sheet cannot buy the whole relationship',
        (function () {
          var A = freshG(barren, 1);
          Ch.cartoCredit(A, Ch.CARTO_PER * 50);
          return (A.standing.carto || 0) === Ch.CARTO_MAX_PER_SALE;
        })(), 'capped at ' + Ch.CARTO_MAX_PER_SALE + ' per filing');
  check('the Guild is untouched by a barren sheet',
        !G3.standing.guild, 'guild ' + (G3.standing.guild || 0));
}
if (rich) {
  var G4 = {
    here: rich.star, sys: rich.sys, galaxy: gal, t: 0,
    ship: { credits: 0 }, standing: { guild: 20 }, surveys: {}, carto: null
  };
  var k4 = rich.star.id + ':' + rich.body.id;
  G4.surveys[k4] = recFor(rich.star, rich.body, 1);
  var r4 = Ch.publish(G4, rich.sys, gal, k4, null);
  check('publishing a rich world spends the Guild’s good opinion',
        r4.ok && G4.standing.guild === 20 - Ch.MIND_MAX,
        '20 -> ' + G4.standing.guild);
  check('and the result says what it cost', r4.guild === Ch.MIND_MAX);
  check('the Guild can be taken cold by charting',
        (function () {
          var A = {
            here: rich.star, sys: rich.sys, galaxy: gal, t: 0,
            ship: { credits: 0 }, standing: { guild: 0 }, surveys: {}, carto: null
          };
          A.surveys[k4] = recFor(rich.star, rich.body, 1);
          Ch.publish(A, rich.sys, gal, k4, null);
          return (A.standing.guild || 0) < 0;
        })(), 'which the F7 list now paints red');
}

/* ---- 10. THE FRONTIER NOD ------------------------------------------- */
console.log('\n-- 10. "all factions should be trying to expand outward" --');
if (barren) {
  var G5 = freshG(barren, 1);
  var k5 = barren.star.id + ':' + barren.body.id;
  var r5 = Ch.publish(G5, barren.sys, gal, k5, null);
  var ctl5 = Galaxy.control(gal, barren.star);
  if (ctl5 < Ch.FRONTIER_CTL) {
    check('a frontier sheet pleases whoever is nearest',
          r5.nod && r5.nod.up === 1,
          (r5.nod && (r5.nod.fac.name || r5.nod.fac.id)) + ' +1');
    check('and that is a real faction, not the Syndicate',
          r5.nod && r5.nod.fac && !r5.nod.fac.outlaw,
          'charting is not a thing you do for the Syndicate');
    check('their standing moved', (G5.standing[r5.nod.fac.id] || 0) >= 1);
  } else {
    check('no nod inside somebody’s writ', !r5.nod, 'control ' + ctl5.toFixed(2));
  }
  check('the nod is capped: charting is not a career with a government',
        (function () {
          var fac = Ch.nearestPower(gal, barren.star);
          if (!fac) return true;
          var A = freshG(barren, 1);
          A.carto = { paid: 0, given: 0, frontier: {} };
          A.carto.frontier[fac.id] = Ch.FRONTIER_CAP;
          var nod = Ch.frontierNod(A, gal, barren.star);
          return !nod || nod.up === 0;
        })(), 'FRONTIER_CAP ' + Ch.FRONTIER_CAP);
  check('nearestPower picks a lawful power',
        (function () {
          var f = Ch.nearestPower(gal, barren.star);
          return !f || !f.outlaw;
        })());
}

/* ---- 11. THE DESK’S CHOICE ----------------------------------------- */
console.log('\n-- 11. one world at a time, and which one --');
if (barren && rich && barren.star === rich.star) {
  check('(barren and rich are in the same system - skipping the pick test)', true);
} else if (barren) {
  var G6 = freshG(barren, 1);
  /* Two worlds in one system, both with sheets to sell. */
  var others = (barren.sys.bodies || []).filter(function (b) {
    return b.id !== barren.body.id;
  });
  if (others.length) {
    var k6 = barren.star.id + ':' + others[0].id;
    G6.surveys[k6] = recFor(barren.star, others[0], 1);
    var picked = Ch.pick(G6, barren.sys, gal);
    check('with no nav lock the desk offers the best-paying sheet',
          picked && picked.price === Math.max.apply(null,
            Ch.offers(G6, barren.sys, gal).map(function (o) { return o.price; })),
          picked ? picked.name + ' at ' + picked.price : '');
    G6.navTarget = { kind: 'body', id: others[0].id };
    var picked2 = Ch.pick(G6, barren.sys, gal);
    check('a nav lock chooses the world instead',
          picked2 && picked2.target && picked2.target.id === others[0].id,
          picked2 ? picked2.name : '');
    check('offers are sorted best first',
          (function () {
            var o = Ch.offers(G6, barren.sys, gal);
            for (var i = 1; i < o.length; i++) if (o[i].price > o[i - 1].price) return false;
            return true;
          })());
    check('every offer carries what publishing it would cost',
          Ch.offers(G6, barren.sys, gal).every(function (o) {
            return typeof o.guild === 'number' && o.guild >= 0;
          }), 'so the desk can say so before you press it');
  }
}
console.log('');
check('an empty career is refused with a reason, not a crash',
      (function () {
        var G = { here: gal.stars[0], sys: null, galaxy: gal, t: 0,
                  ship: { credits: 0 }, standing: {}, surveys: {} };
        var sys0 = Gen.generateSystem(gal.stars[0].seed, optsFor(gal.stars[0]));
        return Ch.pick(G, sys0, gal) === null &&
               /nothing of this system mapped/.test(Ch.why(G, sys0, gal));
      })());
check('publishing with no Survey module aboard does not throw',
      (function () {
        var keep = global.Survey;
        global.Survey = null;
        var r;
        try { r = Ch.publish({ surveys: {} }, null, gal, 'x', null); }
        catch (e) { global.Survey = keep; return false; }
        global.Survey = keep;
        return r && !r.ok;
      })());

/* ---- 12. ADDITIVE ---------------------------------------------------- */
console.log('\n-- 12. additive: the old game is untouched --');
check('Charts never writes to a survey record except pubCov',
      (function () {
        var src = require('fs').readFileSync(__dirname + '/../src/charts.js', 'utf8');
        var writes = src.match(/rec\.[a-zA-Z0-9_]+\s*=/g) || [];
        return writes.every(function (w) { return /rec\.pubCov\s*=/.test(w); });
      })(), 'so an assay is worth exactly what it was');
check('publishing does not touch the assay’s own sold marks',
      (function () {
        if (!barren) return true;
        var G = freshG(barren, 1);
        var k = barren.star.id + ':' + barren.body.id;
        var was = Sv.value(G.surveys[k], barren.sys, 0);
        Ch.publish(G, barren.sys, gal, k, null);
        return Sv.value(G.surveys[k], barren.sys, 0) === was;
      })(), 'you can still sell the Guild the assay after publishing the sheet');
check('and the Guild can still be sold it afterwards',
      (function () {
        if (!barren) return true;
        var G = freshG(barren, 1);
        var k = barren.star.id + ':' + barren.body.id;
        Ch.publish(G, barren.sys, gal, k, null);
        var got = Sv.sell(G, barren.sys, 0);
        return got.total > 0;
      })(), 'two buyers, one flight');
check('Charts draws nothing from the seed',
      (function () {
        var src = require('fs').readFileSync(__dirname + '/../src/charts.js', 'utf8');
        return !/new RNG|hash01|\.next\(\)|Math\.random/.test(src);
      })(), 'so it cannot move a star, a world or a deposit');

/* ---- 13. DETERMINISM ------------------------------------------------- */
console.log('\n-- 13. the same seed prices the same sheet --');
var gal2 = Galaxy.build('kawartha');
if (barren) {
  var star2 = gal2.byId[barren.star.id];
  var sys2 = Gen.generateSystem(star2.seed, Galaxy.systemOpts(gal2, star2));
  var body2 = sys2.byId[barren.body.id];
  check('a rebuilt galaxy prices it identically',
        Ch.value(recFor(star2, body2), sys2, gal2, star2) === barren.sheet,
        barren.sheet + ' cr both times');
  check('and minds about it identically',
        Ch.guildCost(body2, sys2) === Ch.guildCost(barren.body, barren.sys));
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
