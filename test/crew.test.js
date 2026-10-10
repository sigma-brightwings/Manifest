/* crew.test.js — the people aboard, and what not having them costs.
 *
 *     node test/crew.test.js
 *
 * Astra's rule, in her words: "larger ships will require crew to operate
 * the turrets and stuff", and "a good engineer on the ship can slave the
 * turrets to the ship's targeting system, but traverse is half as fast,
 * and fire rate is 2/3 of normal." Most of this file is that sentence,
 * pinned so it cannot quietly become something else.
 */
global.window = global;
var RNG = require('../src/rng.js');
var Eco = require('../src/economy.js');
var Gen = require('../src/generate.js');
var Sim = require('../src/sim.js');
var Combat = require('../src/combat.js');
var Crew = require('../src/crew.js');

var pass = 0, fail = 0;
function check(n, c, d) { if (c) pass++; else { fail++; console.log('  FAIL  ' + n + (d ? '   ' + d : '')); } }

function shipOf(hullId, crew) {
  var s = {};
  Combat.initShip(s);
  s.hullId = hullId;
  var h = Combat.HULLS[hullId];
  s.dryMass = h.dryMass; s.cargoCap = h.cargoCap;
  s.turret = 'turret';
  s.crew = crew || [];
  return s;
}
function person(role, rating) { return Crew.make(role + rating, role, rating); }

console.log('--- who has to be on the turret ---');
(function () {
  /* THE SMALL HULL IS EXEMPT, and that is the design rather than a
   * softening: one seat with everything in reach is what a single-seat
   * ship IS, and the requirement arrives with the hull class that can
   * afford to answer it. */
  var sizes = {};
  Object.keys(Combat.HULLS).forEach(function (id) {
    sizes[Combat.HULLS[id].size || 'M'] = id;
  });
  check('there is a small hull and a larger one to compare',
        !!sizes.S && (!!sizes.M || !!sizes.L), Object.keys(sizes).join(','));

  var small = shipOf(sizes.S, []);
  var big = shipOf(sizes.M || sizes.L, []);
  check('a small hull works its own turret from the seat',
        Crew.turretCrewing(small).mode === 'pilot' &&
        Crew.turretCrewing(small).rate === 1,
        Crew.turretCrewing(small).mode);
  check('and needs nobody', !Crew.needsCrew(small));
  check('a larger hull does need somebody', Crew.needsCrew(big));
  check('and with an empty deck its turret is cold',
        Crew.turretCrewing(big).mode === 'unmanned' &&
        Crew.turretCrewing(big).rate === 0,
        Crew.turretCrewing(big).mode);

  /* A GUNNER IS THE WHOLE ANSWER. */
  var manned = Crew.turretCrewing(shipOf(sizes.M || sizes.L, [person('gunner', 1)]));
  check('any gunner mans it at full traverse and full rate',
        manned.mode === 'manned' && manned.traverse === 1 && manned.rate === 1,
        manned.mode + ' ' + manned.traverse + '/' + manned.rate);

  /* AND THE ENGINEER'S WORKAROUND, to the two numbers Astra gave. */
  var weak = Crew.turretCrewing(shipOf(sizes.M || sizes.L,
                                       [person('engineer', Crew.SLAVE_RATING - 1)]));
  check('an engineer below "good" cannot slave it', weak.mode === 'unmanned',
        weak.mode);
  var slaved = Crew.turretCrewing(shipOf(sizes.M || sizes.L,
                                         [person('engineer', Crew.SLAVE_RATING)]));
  check('a good engineer can', slaved.mode === 'slaved', slaved.mode);
  check('at half the traverse', slaved.traverse === 0.5, String(slaved.traverse));
  check('and two thirds the fire rate',
        Math.abs(slaved.rate - 2 / 3) < 1e-12, String(slaved.rate));
  check('which is worse than a gunner and better than nothing',
        slaved.rate < manned.rate && slaved.rate > 0);

  /* A gunner beats an engineer when both are aboard — the workaround is a
   * workaround. */
  var bothMode = Crew.turretCrewing(shipOf(sizes.M || sizes.L,
                    [person('engineer', 5), person('gunner', 1)])).mode;
  check('a gunner is preferred to a slaved mount even at rating one',
        bothMode === 'manned', bothMode);
  /* And the BEST of a role is the one who counts, so hiring a better hand
   * is worth doing. */
  var twoEng = shipOf(sizes.M || sizes.L, [person('engineer', 1), person('engineer', 4)]);
  check('the best hand of a role is the one on the job',
        Crew.turretCrewing(twoEng).mode === 'slaved' &&
        Crew.best(twoEng, 'engineer').rating === 4);

  /* No turret at all is its own answer, not "unmanned". */
  var bare = shipOf(sizes.M || sizes.L, [person('gunner', 3)]);
  bare.turret = null;
  check('a ship with no turret has no turret to man',
        Crew.turretCrewing(bare).mode === 'none');
})();

console.log('--- the hall ---');
(function () {
  var sys = Gen.generateSystem('kawartha');
  var port = sys.ports.filter(function (p) { return p.market; })[0];
  check('there is a port to hire at', !!port, port && port.name);
  if (!port) return;

  /* ON RAILS, like the traffic and the market: who is going spare is a
   * function of the port and the week. Walking out and back in must not
   * reshuffle the hall. */
  var a = Crew.forHire(port, 1000), b = Crew.forHire(port, 1000);
  check('the hall is the same hall a moment later',
        a.length === b.length && a.every(function (p, i) {
          return p.name === b[i].name && p.role === b[i].role &&
                 p.rating === b[i].rating; }),
        a.length + ' vs ' + b.length);
  check('and the same one an hour later',
        Crew.forHire(port, 1000 + 3600)[0].name === a[0].name);
  /* But not the same one next week. */
  var later = Crew.forHire(port, 1000 + Crew.HALL_WINDOW * 3);
  check('and a different one next week',
        later.length !== a.length || later[0].name !== a[0].name);

  /* Sane people. */
  var n = 0, roles = {}, bad = 0, ratings = {};
  sys.ports.forEach(function (p) {
    if (!p.market) return;
    for (var w = 0; w < 12; w++) {
      Crew.forHire(p, w * Crew.HALL_WINDOW).forEach(function (q) {
        n++;
        roles[q.role] = (roles[q.role] || 0) + 1;
        ratings[q.rating] = (ratings[q.rating] || 0) + 1;
        if (!Crew.ROLES[q.role]) bad++;
        if (!(q.rating >= 1 && q.rating <= 5)) bad++;
        if (!q.name || q.name.indexOf(' ') < 0) bad++;
        if (!(Crew.signingFee(q) > 0) || !(Crew.dailyWage(q) > 0)) bad++;
      });
    }
  });
  check('everybody in the hall is a real person', bad === 0, bad + ' bad of ' + n);
  check('and there are enough of them to choose from', n > 60, String(n));
  check('all three trades turn up',
        roles.gunner > 0 && roles.engineer > 0 && roles.pilot > 0,
        JSON.stringify(roles));
  console.log('  ' + n + ' berths offered: ' + JSON.stringify(roles));
  console.log('  ratings: ' + JSON.stringify(ratings));
  /* A good engineer has to be findable, or the workaround is theory. */
  var good = 0;
  for (var r = Crew.SLAVE_RATING; r <= 5; r++) good += ratings[r] || 0;
  check('and a good engineer is findable', good > n * 0.15,
        good + ' of ' + n + ' at ' + Crew.SLAVE_RATING + '+');
  /* AND THE TOP OF THE SCALE IS REACHABLE. The first version rolled a
   * maximum of four, so "exceptional" was a word in the table that
   * described nobody in the galaxy. Rare, though — a hand you go looking
   * for rather than one you trip over. */
  check('the best hands exist', (ratings[5] || 0) > 0, JSON.stringify(ratings));
  check('and are rare', (ratings[5] || 0) < n * 0.10,
        (ratings[5] || 0) + ' of ' + n);

  /* Better hands cost more, or rating is decoration. */
  check('a better hand wants more to sign',
        Crew.signingFee(Crew.make('a', 'gunner', 5)) >
        Crew.signingFee(Crew.make('b', 'gunner', 1)) * 1.5);
  check('and more to keep',
        Crew.dailyWage(Crew.make('a', 'gunner', 5)) >
        Crew.dailyWage(Crew.make('b', 'gunner', 1)) * 1.5);
})();

console.log('--- and a ship you are not in ---');
(function () {
  /* The next slice needs this and the answer belongs with the people. */
  check('a ship with nobody aboard cannot be ordered',
        !Crew.canBeOrdered({ crew: [] }));
  check('nor one with only a gunner',
        !Crew.canBeOrdered({ crew: [person('gunner', 5)] }));
  check('a pilot is what makes her orderable',
        Crew.canBeOrdered({ crew: [person('pilot', 1)] }));
})();

console.log('');
console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
