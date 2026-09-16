/* galaxy.test.js — the cluster, and jumping between its stars.
 *
 *     node test/galaxy.test.js
 *
 * The thing most worth defending here is that Gen.starPreview and
 * Gen.generateSystem can never disagree. The map draws a hundred and fifty
 * star names without generating a hundred and fifty systems; if the cheap
 * path and the real path ever diverged, the chart would quietly lie about
 * where you were going and nothing else would notice.
 */
var V = require('../src/vec3.js');
var Eco = require('../src/economy.js');
var Gen = require('../src/generate.js');
var Galaxy = require('../src/galaxy.js');
var Sim = require('../src/sim.js');

var pass = 0, fail = 0;
function check(n, c, d) { if (c) pass++; else { fail++; console.log('  FAIL  ' + n + (d ? '   ' + d : '')); } }

console.log('--- the cluster ---');
(function () {
  var g = Galaxy.build('kawartha');
  check('the requested number of stars was placed', g.stars.length === Galaxy.DEFAULT_STARS,
        String(g.stars.length));
  check('star zero carries the game seed unchanged', g.home.seed === 'kawartha');
  check('star zero sits at the origin', g.home.x === 0 && g.home.y === 0 && g.home.z === 0);

  // The preview and the full generator must agree, always.
  var mismatch = 0;
  for (var i = 0; i < g.stars.length; i += 7) {
    var full = Gen.generateSystem(g.stars[i].seed);
    var pre = Gen.starPreview(g.stars[i].seed);
    if (full.root.type !== pre.cls || full.root.mass !== pre.mass ||
        full.root.temp !== pre.temp || full.name !== pre.name) mismatch++;
  }
  check('the map preview matches full generation exactly', mismatch === 0, mismatch + ' mismatches');

  var tooClose = 0, outside = 0;
  for (i = 0; i < g.stars.length; i++) {
    if (Math.hypot(g.stars[i].x, g.stars[i].y) > g.radius * 1.01) outside++;
    for (var j = i + 1; j < g.stars.length; j++) {
      if (Galaxy.distance3(g.stars[i], g.stars[j]) < 1.1 - 1e-9) tooClose++;
    }
  }
  check('no two stars occupy the same point', tooClose === 0, tooClose + ' pairs');
  check('every star is inside the cluster radius', outside === 0, outside + ' outside');

  var names = {}, dup = 0;
  g.stars.forEach(function (s) { if (names[s.name]) dup++; names[s.name] = 1; });
  check('no two stars share a name', dup === 0, dup + ' duplicates');

  // Determinism, the whole point.
  var a = Galaxy.build('kawartha'), b = Galaxy.build('kawartha');
  check('the same seed builds the same cluster',
        JSON.stringify(a.stars) === JSON.stringify(b.stars));
  check('a different seed builds a different cluster',
        JSON.stringify(a.stars) !== JSON.stringify(Galaxy.build('kawartha ').stars));
})();

console.log('--- jump economics ---');
(function () {
  var g = Galaxy.build('kawartha');
  var sys = Gen.generateSystem(g.home.seed);
  var planet = sys.bodies.filter(function (b) { return b.kind === 'planet'; })[1];
  var ship = Sim.circularOrbit(planet, sys, 0, planet.radius * 0.5, 0, 0);

  var emptyRange = Galaxy.maxRange(ship);
  check('an empty ship has a useful range', emptyRange > 15 && emptyRange < 40,
        emptyRange.toFixed(2) + ' ly');
  ship.cargo.ores = 64;
  Sim.refreshShip(ship);
  var ladenRange = Galaxy.maxRange(ship);
  check('a full hold shortens your reach', ladenRange < emptyRange * 0.7,
        emptyRange.toFixed(1) + ' -> ' + ladenRange.toFixed(1) + ' ly');
  delete ship.cargo.ores;
  Sim.refreshShip(ship);

  // There must be somewhere to go on the first tank, from anywhere.
  var stranded = 0;
  for (var i = 0; i < g.stars.length; i++) {
    var r = Galaxy.reachable(g, g.stars[i], ship);
    if (!r.length) stranded++;
  }
  check('no star is a dead end on a full tank', stranded === 0, stranded + ' dead ends');

  var plan = Galaxy.jumpPlan(g, g.home, Galaxy.reachable(g, g.home, ship)[0].star, ship);
  check('a reachable jump is possible', plan.possible);
  check('it costs propellant', plan.fuel > 0 && plan.fuel < ship.fuel);
  check('it costs days, not seconds', plan.seconds > 3600 * 12, (plan.seconds / 86400).toFixed(2) + ' d');

  // Exhausting the tank makes everything unreachable, and says so honestly.
  ship.fuel = 0;
  Sim.refreshShip(ship);
  check('a dry tank reaches nothing', Galaxy.maxRange(ship) === 0);
  var dead = Galaxy.jumpPlan(g, g.home, g.stars[5], ship);
  check('and an impossible jump reports its shortfall', !dead.possible && dead.shortfall > 0);
})();

console.log('--- every port sells fuel, so nowhere is a trap ---');
(function () {
  var dry = 0, ports = 0;
  for (var i = 0; i < 60; i++) {
    var sys = Gen.generateSystem('seed-' + i);
    sys.ports.forEach(function (p) {
      ports++;
      var q = Eco.price(p, Eco.FUEL_ID, 0);
      if (!q || q.buy === null || !(q.buy > 0)) dry++;
    });
  }
  check('every port in every system will sell you hydrogen', dry === 0,
        dry + ' of ' + ports + ' ports cannot');
})();

console.log('--- the clock moves, and the market moves with it ---');
(function () {
  var sys = Gen.generateSystem('kawartha');
  var port = sys.ports[0];
  var cid = port.market.order.filter(function (c) { return c !== 'waste'; })[0];
  var before = Eco.price(port, cid, 0).mid;
  var after = Eco.price(port, cid, Galaxy.jumpSeconds(6)).mid;   // a six light-year hop
  check('prices are not the same after a jump-length transit', Math.abs(after - before) > 1e-9,
        before.toFixed(1) + ' -> ' + after.toFixed(1));

  // ... and it is exact, not integrated: asking directly equals asking
  // after walking there, which is what makes a jump free to evaluate.
  var t = Galaxy.jumpSeconds(19);
  var direct = Eco.analyticStock(port, cid, t);
  for (var k = 0; k < 40; k++) Eco.analyticStock(port, cid, k * 5e4);
  check('the destination market is exact at the arrival instant',
        Math.abs(Eco.analyticStock(port, cid, t) - direct) < 1e-12);
})();

console.log('--- galactic territory ---');
(function () {
  var g = Galaxy.build('kawartha');

  /* THE ROSTER IS THREE LAYERS NOW, and this block used to assume one.
   *
   *   majors   the empires. Two or three, capitals by farthest-point
   *            sampling, splitting most of the galaxy between them.
   *   outlaw   ONE power, the Syndicate, holding several pockets and no
   *            realm — which is why it has no capital at all.
   *   minors   power brokers INSIDE the majors' space, carved out of a
   *            major's own cell rather than standing beside it.
   *
   * Counting all seven together and calling the total "factions that hold
   * ground" is what made this read as seven empires, and asking every one
   * of them for a capital is what crashed the file. */
  var majors  = g.factions.filter(function (f) { return !f.minor && !f.outlaw; });
  var minors  = g.factions.filter(function (f) { return f.minor; });
  var outlaws = g.factions.filter(function (f) { return f.outlaw; });

  check('two or three majors hold the galaxy between them',
        majors.length >= 2 && majors.length <= 3, majors.length + ' majors');
  check('exactly one outlaw power, and it holds pockets rather than a realm',
        outlaws.length === 1 && !outlaws[0].capitalId &&
        (outlaws[0].holdIds || []).length === Galaxy.PIRATE_HOLDS,
        outlaws.length + ' outlaw, ' +
        ((outlaws[0] || {}).holdIds || []).length + ' holds');
  check('and the brokers sit inside that map rather than beside it',
        minors.length === Galaxy.MINOR_POWERS &&
        minors.every(function (f) { return !!f.capitalId; }),
        minors.length + ' minors');
  check('every faction has a name, an id and a colour', g.factions.every(function (f) {
    return f.name && f.color && f.id;
  }));
  check('every star has a controlling faction', g.stars.every(function (s) {
    return !!g.factionById[s.factionId];
  }));

  var count = {};
  g.stars.forEach(function (s) { count[s.factionId] = (count[s.factionId] || 0) + 1; });

  /* OWNERSHIP IS NO LONGER NEAREST-CAPITAL and must not be tested as if it
   * were. A plain Voronoi split gave 67/30/11 on this seed — an empire and
   * two neighbours, not three peers — so the majors are assigned
   * capacity-balanced greedy against a cap of ceil(N / majors), and the
   * pockets are then carved out of the result. The invariant that survives
   * is the thing that split was FOR. */
  var share = Math.ceil(g.stars.length / majors.length);
  var over = majors.filter(function (f) { return (count[f.id] || 0) > share; });
  check('no major is handed more than an even share of the sky',
        over.length === 0,
        majors.map(function (f) { return count[f.id] || 0; }).join('/') +
        ' against a cap of ' + share);

  /* A capital in somebody else's territory would be absurd, and the greedy
   * pass pins them before it starts. The Syndicate is exempt by having no
   * capital to pin — that is what "pockets rather than a realm" means. */
  var stray = g.factions.filter(function (f) {
    if (!f.capitalId) return false;
    var star = g.byId[f.capitalId];
    return !star || star.factionId !== f.id;
  });
  check('a capital is always held by its own faction', stray.length === 0,
        stray.map(function (f) { return f.name; }).join(', '));

  var pirateShare = (count.outlaw || 0) / g.stars.length;
  var minorShare = minors.reduce(function (n, f) {
    return n + (count[f.id] || 0);
  }, 0) / g.stars.length;
  check('the Syndicate holds about the share it was designed to',
        Math.abs(pirateShare - Galaxy.PIRATE_SHARE) < 0.06,
        (pirateShare * 100).toFixed(0) + '% vs ' + (Galaxy.PIRATE_SHARE * 100) + '%');
  check('and the brokers between them hold about theirs',
        Math.abs(minorShare - Galaxy.MINOR_SHARE) < 0.05,
        (minorShare * 100).toFixed(0) + '% vs ' + (Galaxy.MINOR_SHARE * 100) + '%');

  /* Every power that is not a major operates INSIDE one, and knows which.
   * The pocket is carved out of a major's own cell, so the answer is free:
   * whoever held most of those stars the moment before the pocket took
   * them. This is what makes the roster three empires with powers inside
   * them rather than seven peers on one map. */
  var orphans = g.factions.filter(function (f) {
    return (f.minor || f.outlaw) && !g.factionById[f.parentId];
  });
  check('every broker and the Syndicate name the empire they sit inside',
        orphans.length === 0, orphans.map(function (f) { return f.name; }).join(', '));
  check('and a parent is always a major, never another pocket',
        g.factions.every(function (f) {
          if (!f.parentId) return true;
          var p = g.factionById[f.parentId];
          return p && !p.minor && !p.outlaw;
        }));
  check('the Syndicate records a parent for each of its holds',
        (outlaws[0].holdParents || []).length === Galaxy.PIRATE_HOLDS &&
        outlaws[0].holdParents.every(function (p) { return !!g.factionById[p]; }),
        (outlaws[0].holdParents || []).join(', '));

  // Determinism, same as everything else in this game.
  var g2 = Galaxy.build('kawartha');
  var same = g.stars.every(function (s, i) { return s.factionId === g2.stars[i].factionId; });
  check('the same seed draws the same territory map', same);
  check('same seed draws the same faction roster',
        JSON.stringify(g.factions) === JSON.stringify(g2.factions));

  var g3 = Galaxy.build('a different seed entirely');
  var identical = g.factions.length === g3.factions.length &&
    g.factions.every(function (f, i) { return f.name === g3.factions[i].name; });
  check('a different seed draws a different roster', !identical);

  // The whole point: two systems the same faction controls must show the
  // SAME faction identity, not two independently-rolled ones.
  var byFaction = {};
  g.stars.forEach(function (s) { (byFaction[s.factionId] = byFaction[s.factionId] || []).push(s); });
  var fid = Object.keys(byFaction).filter(function (k) { return byFaction[k].length >= 2; })[0];
  check('at least one faction controls more than one star (a real region)', !!fid);
  if (fid) {
    var pair = byFaction[fid];
    var sysA = systemForStar(g, pair[0]);
    var sysB = systemForStar(g, pair[1]);
    check('two systems in the same region share the same primary faction identity',
          sysA.factions[0].id === sysB.factions[0].id &&
          sysA.factions[0].name === sysB.factions[0].name &&
          sysA.factions[0].color === sysB.factions[0].color,
          sysA.factions[0].name + ' vs ' + sysB.factions[0].name);
  }

  // The legacy path — no galaxy context — must be untouched.
  var bare = Gen.generateSystem('seed-legacy-check');
  check('a bare seed with no galaxy context still gets 1-4 locally-rolled factions',
        bare.factions.length >= 1 && bare.factions.length <= 4);

  function systemForStar(galaxy, star) {
    var fac = galaxy.factionById[star.factionId];
    return Gen.generateSystem(star.seed, { faction: fac, allFactions: galaxy.factions });
  }
})();

console.log('--- a whole galaxy generates without complaint ---');
(function () {
  var g = Galaxy.build('kawartha');
  var bad = 0, totalPorts = 0, totalPatrols = 0, habitable = 0;
  for (var i = 0; i < g.stars.length; i += 5) {
    var sys = Gen.generateSystem(g.stars[i].seed);
    if (!sys.ports.length) bad++;
    totalPorts += sys.ports.length;
    totalPatrols += (sys.patrols || []).length;
    habitable += sys.bodies.filter(function (b) { return b.habitable; }).length;
    // Every port must still hold to the same invariants everywhere.
    sys.ports.forEach(function (p) {
      if (!p.market || !p.faction) bad++;
    });
  }
  check('every sampled system has ports, markets and flags', bad === 0, bad + ' bad');
  console.log('  sampled 30 systems: ' + totalPorts + ' ports, ' + totalPatrols +
              ' patrols, ' + habitable + ' habitable worlds');
})();

console.log('--- every hull can reach every star ---');
(function () {
  /* THE NUMBER THAT DECIDES WHETHER A SYSTEM EXISTS FOR YOU.
   *
   * Not how far a ship can go — whether it can go at all. A star whose
   * NEAREST neighbour is further than your laden range is a star you cannot
   * reach by any route, however patient you are, because every path into it
   * ends with that hop. Nothing checked it, and it had been false the whole
   * time: on the old 150-star cluster a laden Mule was cut off from ten
   * stars and a laden Kestrel from one. It looked like a galaxy-size
   * question and it was a tankage question.
   *
   * Laden, deliberately. A ship with an empty hold can reach anything; the
   * promise worth keeping is that you can get there with the cargo that
   * paid for the trip. */
  var Combat = require('../src/combat.js');
  var HULLS = Combat.HULLS;
  var FUEL_PER_LY_PER_TONNE = 0.016;      // galaxy.js's own constant

  var g = Galaxy.build('kawartha');
  var worst = 0, worstStar = null;
  for (var i = 0; i < g.stars.length; i++) {
    var best = Infinity;
    for (var j = 0; j < g.stars.length; j++) {
      if (i === j) continue;
      var d = Galaxy.distance3(g.stars[i], g.stars[j]);
      if (d < best) best = d;
    }
    if (best > worst) { worst = best; worstStar = g.stars[i]; }
  }
  console.log('  ' + g.stars.length + ' stars in ' + g.radius + ' ly; the loneliest is ' +
              worst.toFixed(2) + ' ly from its nearest neighbour');

  var stranded = [], tightest = Infinity, tightestWho = '';
  Object.keys(HULLS).forEach(function (k) {
    var h = HULLS[k];
    var laden = h.dryMass + h.fuelCap + (h.thrusterCap || 0) + (h.cargoCap || 0);
    var range = h.fuelCap / (FUEL_PER_LY_PER_TONNE * laden);
    var margin = range / worst;
    if (margin < tightest) { tightest = margin; tightestWho = k; }
    if (range < worst) stranded.push(k + ' (' + range.toFixed(1) + ' ly)');
  });
  console.log('  tightest hull is the ' + tightestWho + ', with ' +
              ((tightest - 1) * 100).toFixed(0) + '% in hand');
  check('no hull is stranded from a star it can see', stranded.length === 0,
        stranded.join(', '));
  /* AND THE MARGIN IS THIN ON PURPOSE. A fleet with twice the range it
   * needs has no reason to care about mass, which is the question the fuel
   * model exists to ask. If this ever climbs past about half again, the
   * tanks have drifted away from the map. */
  check('and the tightest margin is a margin, not a cushion',
        tightest > 1.0 && tightest < 1.6,
        tightestWho + ' at ' + tightest.toFixed(2) + 'x');

  /* The two numbers move together or the density does not hold, and the
   * density is what keeps a hop the same length of hop. */
  var density = g.stars.length / (Math.PI * g.radius * g.radius);
  check('the cluster keeps the density it was tuned at',
        Math.abs(density - 0.027) < 0.004, density.toFixed(4) + ' stars/ly^2');
})();

console.log('--- how firmly a power holds a star, and what you know of it ---');
(function () {
  var g = Galaxy.build('kawartha');

  /* CONTROL IS DERIVED, NOT STORED. What the chart shades by is a reading
   * of the assignment that already happened - so a border that moves moves
   * the shading with it, and nothing can drift out of step. */
  var vals = g.stars.map(function (s) { return Galaxy.control(g, s); });
  var sorted = vals.slice().sort(function (a, b) { return a - b; });
  console.log('  control across ' + vals.length + ' stars: ' +
              sorted[0].toFixed(2) + ' / ' +
              sorted[Math.floor(sorted.length / 2)].toFixed(2) + ' / ' +
              sorted[sorted.length - 1].toFixed(2));

  check('every star reads somewhere between nothing and everything',
        sorted[0] >= 0 && sorted[sorted.length - 1] <= 1);
  /* A FLAT READING WOULD BE USELESS. If every system came out the same
   * the shading says nothing, which is the failure mode worth guarding:
   * the spread is the feature, not the numbers. */
  check('and the readings actually spread out',
        sorted[sorted.length - 1] - sorted[0] > 0.4,
        'spread ' + (sorted[sorted.length - 1] - sorted[0]).toFixed(2));

  var capitalsFull = true;
  (g.factions || []).forEach(function (f) {
    var cap = g.byId[f.capitalId];
    if (cap && Galaxy.control(g, cap) < 0.999) capitalsFull = false;
  });
  check('a capital is held absolutely', capitalsFull);

  /* THE EDGE IS THINNER THAN THE MIDDLE, which is the whole claim the fill
   * makes visually. Compared as means rather than star by star, because one
   * star near a neighbour capital proves nothing. */
  var major = (g.factions || []).filter(function (f) { return !f.outlaw && !f.minor; })[0];
  if (major) {
    var owned = g.stars.filter(function (s) { return s.factionId === major.id; });
    var cap = g.byId[major.capitalId];
    owned.sort(function (a, b) {
      return Galaxy.distance3(a, cap) - Galaxy.distance3(b, cap);
    });
    function mean(list) {
      return list.reduce(function (t, s) { return t + Galaxy.control(g, s); }, 0) / list.length;
    }
    var third = Math.max(1, Math.floor(owned.length / 3));
    var core = mean(owned.slice(0, third)), rim = mean(owned.slice(owned.length - third));
    console.log('  ' + major.name + ': core ' + core.toFixed(2) + ', rim ' + rim.toFixed(2));
    check('a power holds its core harder than its rim', core > rim + 0.1,
          core.toFixed(2) + ' vs ' + rim.toFixed(2));
  }

  /* ---- and the chart you build by flying ---- */
  var here = g.home;
  var known = {};
  known[here.id] = true;
  var offer = Galaxy.chartOffer(g, here, known, Galaxy.CHART_RADIUS_LY);
  console.log('  a sheet at ' + here.name + ': ' + offer.stars.length +
              ' systems for ' + offer.cost + ' cr');
  check('a port has neighbours to sell you', offer.stars.length > 0);
  check('none of them is the system you are standing in',
        offer.stars.every(function (s) { return s.id !== here.id; }));
  check('and none is further than the sheet claims',
        offer.stars.every(function (s) {
          return Galaxy.distance3(s, here) <= Galaxy.CHART_RADIUS_LY + 1e-9;
        }));
  check('the sheet costs something', offer.cost > 0);

  /* PAYING TWICE IS NOT POSSIBLE, rather than merely unwise: what you have
   * already charted is not in the offer, so the same sheet is free the
   * second time and the row goes dead. */
  offer.stars.forEach(function (s) { known[s.id] = true; });
  var again = Galaxy.chartOffer(g, here, known, Galaxy.CHART_RADIUS_LY);
  check('buying the same sheet twice buys nothing',
        again.stars.length === 0 && again.cost === 0,
        again.stars.length + ' stars, ' + again.cost + ' cr');

  /* A WIDER SHEET COSTS MORE PER STAR, because the far corners of it are
   * further away - which is what makes the local sheet the one you can
   * afford early. */
  var near = Galaxy.chartOffer(g, here, {}, 6);
  var far = Galaxy.chartOffer(g, here, {}, 14);
  if (near.stars.length && far.stars.length) {
    check('a wider sheet costs more, and more per system',
          far.cost > near.cost &&
          far.cost / far.stars.length > near.cost / near.stars.length,
          (near.cost / near.stars.length).toFixed(0) + ' vs ' +
          (far.cost / far.stars.length).toFixed(0) + ' cr/system');
  }
})();

console.log('');
console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
