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
/* The GPU world layer. It loads fine without a WebGL context — everything
 * that touches `gl` is inside a function — and what this file wants from it
 * is the one piece of geometry it shares with sim.js. */
global.window = global;
var GL = require('../src/gl.js');

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

console.log('--- the systems you are not allowed into ---');
(function () {
  var g = Galaxy.build('kawartha');
  var restricted = g.stars.filter(function (s) { return s.restricted; });
  var kinds = {};
  restricted.forEach(function (s) { kinds[s.restricted.kind] = (kinds[s.restricted.kind] || 0) + 1; });
  console.log('  ' + restricted.length + ' of ' + g.stars.length + ' systems restricted (' +
              (kinds.penal || 0) + ' penal, ' + (kinds.yard || 0) + ' yards)');

  check('there are restricted systems', restricted.length > 0);
  check('and they are rare', restricted.length < g.stars.length * 0.08,
        restricted.length + ' of ' + g.stars.length);
  check('both kinds exist', kinds.penal > 0 && kinds.yard > 0,
        JSON.stringify(kinds));

  /* NEVER A CAPITAL, and never in a pocket. A power's own seat has to be
   * somewhere a trader can go; a syndicate hold is lawless rather than
   * restricted, which is the opposite problem. */
  var capitals = {};
  (g.factions || []).forEach(function (f) { capitals[f.capitalId] = f; });
  check('no capital is behind a checkpoint',
        restricted.every(function (s) { return !capitals[s.id]; }));
  check('and no pocket is', restricted.every(function (s) {
    var f = g.factionById[s.factionId];
    return f && !f.outlaw && !f.minor;
  }));

  /* NOT ON THE DOORSTEP. The first galaxy built with this turned kawartha's
   * nearest neighbour - the obvious first jump of a new career - into a
   * penal colony, so the opening move of the game was a door that will not
   * open and a fitting you cannot afford. */
  var nearest = Infinity;
  restricted.forEach(function (s) {
    nearest = Math.min(nearest, Galaxy.distance3(s, g.home));
  });
  check('none of them is on the home doorstep', nearest > 12,
        'nearest is ' + nearest.toFixed(1) + ' ly out');

  /* WHERE EACH KIND SITS, which is the whole characterisation: a prison
   * goes as far from the flag's capital as the flag reaches, a warship yard
   * as deep inside it as the flag reaches. Compared as means so one odd
   * placement does not carry the claim. */
  function meanDist(kind) {
    var list = restricted.filter(function (s) { return s.restricted.kind === kind; });
    if (!list.length) return 0;
    return list.reduce(function (t, s) {
      var f = g.factionById[s.restricted.faction];
      return t + Galaxy.distance3(s, g.byId[f.capitalId]);
    }, 0) / list.length;
  }
  var penalD = meanDist('penal'), yardD = meanDist('yard');
  console.log('  a prison sits ' + penalD.toFixed(1) + ' ly from its capital, a yard ' +
              yardD.toFixed(1));
  check('a prison is put where getting out of it is a journey', penalD > yardD * 2,
        penalD.toFixed(1) + ' vs ' + yardD.toFixed(1));
  /* And the shading agrees with the siting, which is a cross-check on both:
   * a yard is in the system its owner holds hardest. */
  function meanCtl(kind) {
    var list = restricted.filter(function (s) { return s.restricted.kind === kind; });
    return list.reduce(function (t, s) { return t + Galaxy.control(g, s); }, 0) / list.length;
  }
  check('and a yard sits behind everything its owner has',
        meanCtl('yard') > meanCtl('penal') + 0.3,
        meanCtl('yard').toFixed(2) + ' vs ' + meanCtl('penal').toFixed(2));

  /* ---- and the door itself ---- */
  var bare = { dryMass: 100, fuel: 500, fuelCap: 500, cargo: {}, fit: {} };
  var fitted = { dryMass: 100, fuel: 500, fuelCap: 500, cargo: {},
                 fit: { internal1: 'transponder' } };
  var target = restricted[0];
  var plan = Galaxy.jumpPlan(g, g.home, target, bare);
  check('a course into restricted space will not lay in',
        plan.barred === true && plan.possible === false, JSON.stringify({
          barred: plan.barred, possible: plan.possible }));
  /* AND IT SAYS WHICH REFUSAL IT IS. A checkpoint is not a shortfall, and
   * telling a pilot with a full tank they are short by nothing is how a
   * barred course reads as a broken fuel gauge. */
  check('and it is a door rather than an empty tank',
        plan.shortfall === 0 && !!plan.restricted,
        plan.shortfall + ' t short');

  var ok = Galaxy.jumpPlan(g, g.home, target, fitted);
  check('a transponder opens it', ok.barred === false && !!ok.restricted,
        JSON.stringify({ barred: ok.barred }));
  check('but only for the systems that need one',
        !Galaxy.jumpPlan(g, g.home, g.stars.filter(function (s) {
          return !s.restricted && s.id !== g.home.id;
        })[0], bare).barred);
})();

console.log('--- the renderer turns a world the way the world turns ---');
(function () {
  /* THE TWO HALVES OF A SPINNING PLANET HAD NEVER BEEN INTRODUCED.
   *
   * sim.js turns surface ports around a real axis at a real period — nine
   * to ninety hours, tilted, phased, all seeded by the generator. gl.js
   * drew the planet spinning about world +y at a made-up rate, put the ice
   * caps on the y poles, and scrolled the clouds on a third clock. So the
   * continents did not belong to the world: a pad rotated out from under
   * its own coastline, and the caps sat wherever +y happened to point.
   *
   * The check is geometric and exact. A port at the north pole sits, by
   * construction, one radius along the spin axis — whatever the tilt, at
   * every time. If the renderer's axis is the same axis, that offset and
   * the renderer's axis point the same way to within rounding. */
  var seeds = ['kawartha', 'elsewhere', 'seed-7', 'holton', 'a-fourth'];
  var worlds = 0, worstDot = 1, worstPhase = 0, worstHalf = 0, spun = 0;
  seeds.forEach(function (sd) {
    var sys = Gen.generateSystem(sd);
    sys.bodies.forEach(function (b) {
      if (!b.rotation) return;
      worlds++;
      [0, 3600, 91234, 5e5].forEach(function (t) {
        var pole = Sim.surfaceOffset(b, { lat: Math.PI / 2, lon: 0, elevation: 0 }, t);
        var len = Math.sqrt(pole.pos.x * pole.pos.x + pole.pos.y * pole.pos.y +
                            pole.pos.z * pole.pos.z);
        var ax = GL.spinOf(b, t).ax;
        var dot = (pole.pos.x * ax.x + pole.pos.y * ax.y + pole.pos.z * ax.z) / len;
        if (dot < worstDot) worstDot = dot;
      });

      /* AND AT THE RIGHT RATE. One day of the body's own must be exactly
       * one turn of the renderer's phase, or a world with a nine-hour day
       * renders one with some other day. The phase is wrapped into a
       * single turn before it goes to the GPU, so "one turn later" reads
       * as "back where it started" — and a HALF day must not, which is
       * what stops this passing on a phase that never moves at all. */
      var per = Math.abs(b.rotation.period);
      var a = GL.spinOf(b, 0).phase;
      var err = Math.abs(GL.spinOf(b, per).phase - a);
      err = Math.min(err, Math.abs(err - 2 * Math.PI));
      var half = Math.abs(GL.spinOf(b, per / 2).phase - a);
      half = Math.min(half, Math.abs(half - 2 * Math.PI));
      if (err > worstPhase) worstPhase = err;
      if (Math.abs(half - Math.PI) > worstHalf) worstHalf = Math.abs(half - Math.PI);
      /* A real day, not a stopped one. */
      if (GL.spinOf(b, 1000).phase !== GL.spinOf(b, 0).phase) spun++;
    });
  });
  check('there are worlds with a rotation to check', worlds > 40, worlds + ' worlds');
  check('the pole the renderer spins about is the pole the ports turn around',
        worstDot > 0.999999, 'worst alignment ' + worstDot.toFixed(9));
  check('and one day of the body\'s own is exactly one turn',
        worstPhase < 1e-8, 'worst phase error ' + worstPhase.toExponential(2));
  check('half a day is exactly half a turn',
        worstHalf < 1e-8, 'worst half-turn error ' + worstHalf.toExponential(2));
  check('every one of them actually turns', spun === worlds, spun + ' of ' + worlds);

  /* WEATHER IS EVALUATED, NEVER INTEGRATED, and this is the section that
   * says so — Astra's question, which is the right one to ask of anything
   * that moves on its own: can a planet's sky drift out of step while
   * nobody is looking at it, and does arriving recompute it?
   *
   * It cannot and it does not, because there is no weather simulation to
   * drift. `spinOf(body, t)` is a pure function of the body's seeded
   * rotation and the clock, called once per body per frame and thrown
   * away. Nothing accumulates, so there is nothing to accumulate WRONG:
   * the sky at hour nine is the same sky whether you flew there, warped
   * there, loaded a save into it, or never watched at all.
   *
   * These checks exist so that stays true. The failure they are aimed at
   * is somebody later writing `phase += rate * dt` in a frame loop, which
   * would look correct, would even look smoother, and would make a world's
   * weather depend on how many frames you happened to be present for. */
  (function () {
    var sys = Gen.generateSystem('kawartha');
    var w = sys.bodies.filter(function (x) { return x.rotation; })[0];
    if (!w) return;
    var T = 987654.321;

    /* 1. Never watched: ask for hour T out of nowhere. */
    var cold = GL.spinOf(w, T);

    /* 2. Watched the whole way there, frame by frame — which is what the
     *    renderer actually does, 3,000 times. */
    var warm = null;
    for (var i = 0; i < 3000; i++) warm = GL.spinOf(w, T - 3000 * 16 + i * 16);
    warm = GL.spinOf(w, T);

    /* 3. Arrived from somewhere else entirely, having drawn other worlds
     *    at other times in between — the approach case. */
    sys.bodies.forEach(function (o) { if (o.rotation) GL.spinOf(o, T * 0.37); });
    var arrived = GL.spinOf(w, T);

    ['phase', 'deck', 'band', 'shear', 'weather'].forEach(function (k) {
      check('the sky at a given hour is the same whether it was watched (' + k + ')',
            cold[k] === warm[k] && cold[k] === arrived[k],
            cold[k] + ' / ' + warm[k] + ' / ' + arrived[k]);
    });
    check('and so is the axis',
          cold.ax.x === arrived.ax.x && cold.ax.y === arrived.ax.y &&
          cold.ax.z === arrived.ax.z);

    /* AND IT IS NOT FROZEN EITHER. A pure function of the clock that
     * ignores the clock would pass everything above. */
    check('time still moves it', GL.spinOf(w, T + 600).deck !== cold.deck);

    /* THE PHASES STAY SMALL, which is what keeps them exact once they are
     * single-precision uniforms. An unwrapped phase after a long career
     * lands on a float32 grid coarse enough to turn the world in visible
     * steps — 1.6e-2 rad at twenty years, about three pixels of slip on a
     * 400-pixel disc, and six on the cloud deck. */
    var TAU = Math.PI * 2, worst = 0, worstGrain = 0;
    [0, 86400, 3.15e7, 6.3e8, 1e10, 1e12].forEach(function (t) {
      var sp = GL.spinOf(w, t);
      ['phase', 'deck', 'shear'].forEach(function (k) {
        if (Math.abs(sp[k]) > worst) worst = Math.abs(sp[k]);
        var err = Math.abs(Math.fround(sp[k]) - sp[k]);
        if (err > worstGrain) worstGrain = err;
      });
      if (Math.abs(sp.weather) > GL.WEATHER_CYCLE) worst = Infinity;
    });
    check('every angle the shader is handed stays inside one turn',
          worst <= TAU + 1e-9, 'largest ' + worst.toFixed(4));
    check('so single precision never coarsens the rotation',
          worstGrain < 1e-6, 'worst float32 error ' + worstGrain.toExponential(2) + ' rad');

    /* AND WRAPPING IS LOSSLESS, not a rounding. Every wrapped angle is
     * used by a rotation or a sin of multiplier one, so 2*pi is exact;
     * the weather field travels two circuits whose rates share an exact
     * common period, which is the reason it can be wrapped at all. */
    /* THE LIGHTNING IS A FUNCTION OF THE CLOCK TOO, which is the only way
     * a storm you fly back to can be the same storm. The bucket picks
     * which cells fire and the phase shapes the stroke. */
    var b1 = GL.spinOf(w, 5000), b2 = GL.spinOf(w, 5000);
    check('a given instant gives a given sky, lightning included',
          b1.salt[0] === b2.salt[0] && b1.stormPhase === b2.stormPhase);
    check('the stroke phase runs through a bucket',
          GL.spinOf(w, 5000).stormPhase !== GL.spinOf(w, 5000.3).stormPhase);
    check('and a bucket later it is a different set of cells',
          GL.spinOf(w, 5000).salt[0] !== GL.spinOf(w, 5000 + GL.STORM_BUCKET).salt[0]);

    /* THE SALT IS A SALT. Feeding a growing bucket index straight to the
     * shader's hash was the first version, and it does not survive single
     * precision — the hash multiplies by 0.318 and takes the fraction, so
     * past a few thousand buckets neighbouring cells start agreeing and
     * the sky flashes in unison. Hashed here, in doubles, it has to stay
     * spread out no matter how long the career. */
    var lo = [1, 1, 1], hi = [0, 0, 0], seen = {}, dup = 0;
    for (var bk = 0; bk < 4000; bk++) {
      var sv = GL.spinOf(w, bk * GL.STORM_BUCKET + 1e7).salt;
      for (var c = 0; c < 3; c++) {
        if (sv[c] < lo[c]) lo[c] = sv[c];
        if (sv[c] > hi[c]) hi[c] = sv[c];
      }
      var key = sv[0].toFixed(6);
      if (seen[key]) dup++; else seen[key] = 1;
    }
    check('the storm salt still spans its range after four thousand buckets',
          lo[0] < 0.05 && hi[0] > 0.95 && lo[2] < 0.05 && hi[2] > 0.95,
          lo.map(function (x) { return x.toFixed(3); }).join(',') + ' .. ' +
          hi.map(function (x) { return x.toFixed(3); }).join(','));
    check('and does not collapse onto repeats', dup < 4, dup + ' collisions in 4000');

    /* The stroke phase must stay exact in float32 or the lightning
     * quantises into a stutter — it is a tenth of a bucket wide. */
    var grain = 0;
    for (var g = 0; g < 500; g++) {
      var v = GL.spinOf(w, 1e9 + g * 0.017).stormPhase;
      grain = Math.max(grain, Math.abs(Math.fround(v) - v));
    }
    check('the stroke phase survives single precision', grain < 1e-7,
          'worst ' + grain.toExponential(2));

    var raw = 4e6 / 2400, wrapped = raw % GL.WEATHER_CYCLE;
    check('wrapping the weather field does not move it',
          Math.abs(Math.cos(raw * 0.9) - Math.cos(wrapped * 0.9)) < 1e-6 &&
          Math.abs(Math.cos(raw * 0.3703) - Math.cos(wrapped * 0.3703)) < 1e-6);
    console.log('  weather repeats every ' +
                (GL.WEATHER_CYCLE * 2400 / 3.15e7).toFixed(1) + ' years of sim time');
  })();

  /* THE DECK RUNS AHEAD OF THE GROUND, which is the whole of why weather
   * slides across a world instead of being painted on it. */
  var any = null;
  for (var i = 0; i < Gen.generateSystem('kawartha').bodies.length && !any; i++) {
    var bb = Gen.generateSystem('kawartha').bodies[i];
    if (bb.rotation) any = bb;
  }
  if (any) {
    var s0 = GL.spinOf(any, 0), s1 = GL.spinOf(any, 10000);
    var ground = s1.phase - s0.phase, deck = s1.deck - s0.deck;
    check('the cloud deck super-rotates', Math.abs(deck) > Math.abs(ground) * 1.5,
          (deck / ground).toFixed(2) + 'x the ground');
    /* WEATHER IS ON THE SIM CLOCK, not the wall clock. Same world, same
     * hour, same sky — pause the game and the clouds stop, and the warp
     * that carries you across a system carries its weather with it. */
    check('and the weather field is a function of the time, not of the frame',
          GL.spinOf(any, 4242).weather === GL.spinOf(any, 4242).weather &&
          GL.spinOf(any, 4242).weather !== GL.spinOf(any, 4243).weather);
  }
})();

console.log('');
console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
