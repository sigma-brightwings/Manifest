/* tradeanalyser.test.js — one port's month, its averages, the break-even, and
 * the terminal on the concourse (2026-11-03).
 *
 *     node test/tradeanalyser.test.js
 *
 * Astra: "add a trade analyzer as a buyable upgrade, 1000 cr, shows the
 * graph of how every commodity buys and sells at that port, and what the
 * average price is, your break-even price when factoring fuel in ... This
 * screen will also be reachable by walking out of your ship and onto a
 * station in order to read it off a public computer terminal."
 *
 * The same rule as analysers.test.js: the screen invents nothing, so every
 * check is "does it agree with the market it reads". The history is
 * priceAt, which is the closed form; the present is price(); the
 * break-even is arithmetic on both and on Galaxy.jumpPlan's own fuel.
 */
'use strict';
global.window = global;
var path = require('path');
var SRC = path.join(__dirname, '..', 'src');
require(path.join(SRC, 'vec3.js'));
require(path.join(SRC, 'rng.js'));
require(path.join(SRC, 'slipspace.js'));
require(path.join(SRC, 'kepler.js'));
require(path.join(SRC, 'mining.js'));
var Eco = require(path.join(SRC, 'economy.js'));
var Gen = require(path.join(SRC, 'generate.js'));
var Galaxy = require(path.join(SRC, 'galaxy.js'));
var Sim = require(path.join(SRC, 'sim.js'));
var Combat = require(path.join(SRC, 'combat.js'));
require(path.join(SRC, 'dressing.js'));
var Walk = require(path.join(SRC, 'walk.js'));
var TA = require(path.join(SRC, 'tradeanalyser.js'));
var Slip = global.Slipspace;

var pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail !== undefined ? '   ' + detail : '')); }
}
var DAY = 86400, NOW = 40 * DAY + 3600 * 7;
var BURN = 1.5e-9;     // main.js CRUISE_BURN

function talon() {
  var s = { hullId: 'talon', cargo: {}, credits: 50000 };
  Combat.initShip(s);
  Sim.refreshShip && Sim.refreshShip(s);
  s.cargoCap = Combat.HULLS.talon.cargoCap;
  s.fuelCap = Combat.HULLS.talon.fuelCap; s.fuel = s.fuelCap;
  s.dryMass = Combat.HULLS.talon.dryMass; s.thrusterFuel = Combat.HULLS.talon.thrusterCap;
  return s;
}

/* A world: the kawartha galaxy, its home system, a ship docked at a port
 * that sells something and has a second port to sell it at. */
var gal = Galaxy.build('kawartha');
var home = gal.home;
var sys = Gen.generateSystem(home.seed, Galaxy.systemOpts(gal, home));
sys.byId = sys.byId || {};
var ports = sys.ports.filter(function (p) { return p.market; });
var portA = ports.filter(function (p) {
  return p.market.order.some(function (c) { var q = Eco.price(p, c, NOW); return q && q.buy !== null && q.stock > 5 && c !== 'waste'; });
})[0];
var portB = ports.filter(function (p) { return p !== portA; })[0];
function makeG(ship) {
  return { sys: sys, ship: ship, t: NOW, galaxy: gal, here: home, visited: {}, navTarget: null };
}

console.log('--- the fitting ---');
(function () {
  var it = Combat.EQUIPMENT.portanalyser;
  check('the trade analyser exists at 1,000 cr', it && it.price === 1000 && it.name === 'Trade analyser');
  check('a utility fitting, unique, sold everywhere', it.slot === 'utility' && it.unique && it.minDev === 0);
  check('the old instrument keeps its id and has its own name now',
        Combat.EQUIPMENT.tradescan && Combat.EQUIPMENT.tradescan.name === 'Market survey array');
  check('and the survey page cannot mistake the new one for it', it.kind !== Combat.EQUIPMENT.tradescan.kind);
  var s = talon();
  var f = Combat.canFit(s, 'portanalyser');
  check('it fits a bare Talon', f.ok, f.why);
  /* A Talon comes with a cargo scoop in one of her two utility slots
   * (initShip), so the analyser takes the other: the hard start, a pulse
   * laser and the scoop, has room for it. */
  Combat.fitItem(s, 'phpulse');
  var f2 = Combat.canFit(s, 'portanalyser');
  check('and the hard-start Talon (pulse laser and scoop), in the second utility slot', f2.ok, f2.why);
  Combat.fitItem(s, 'portanalyser');
  check('fitted, hasPortAnalyser says so and hasTradeAnalyser does not',
        Combat.hasPortAnalyser(s) && !Combat.hasTradeAnalyser(s));
  /* The NORMAL trade start puts the survey array in that second slot: the
   * analyser is refused there, and has to say why. */
  var n = talon();
  ['phpulse', 'tradescan', 'shield'].forEach(function (id) { Combat.fitItem(n, id); });
  var fn = Combat.canFit(n, 'portanalyser');
  check('the normal trade-start Talon has no utility slot left, and is told so', !fn.ok && /utility/.test(fn.why), fn.why);
  var f3 = Combat.canFit(s, 'portanalyser');
  check('a second is refused in words', !f3.ok && typeof f3.why === 'string' && f3.why.length > 3, f3.why);
  var bare = talon();
  var r = TA.route(makeG(bare), 'fitting', {});
  check('without it, the route refuses and names the terminal', !r.ok && /terminal/i.test(r.why), r.why);
})();

console.log('--- the history ---');
(function () {
  var cid = portA.market.order[0];
  var h1 = TA.history(portA, cid, NOW), h2 = TA.history(portA, cid, NOW);
  check('61 samples, 12 h apart, over 30 days', h1.length === TA.SAMPLES && TA.SAMPLES === 61 &&
        Math.abs((h1[1].t - h1[0].t) - 12 * 3600) < 1e-6 && Math.abs(h1[60].t - h1[0].t - 30 * DAY) < 1e-6);
  check('the history is deterministic', JSON.stringify(h1) === JSON.stringify(h2));
  check('and is the closed form: each past point is priceAt', h1.slice(0, -1).every(function (p) {
    var q = Eco.priceAt(portA, cid, p.t); return q.sell === p.sell && q.buy === p.buy;
  }));
  check('the last point is the market screen\'s own price now', h1[60].sell === Eco.price(portA, cid, NOW).sell);
  /* A LIVE port answers stock() from its stepped state, which is only a
   * now — price(t-10d) there would be today's price. priceAt is not. */
  Eco.goLive(portA, NOW);
  var live = TA.history(portA, cid, NOW);
  check('docked (the port live), the past is still the past',
        JSON.stringify(live.slice(0, -1)) === JSON.stringify(h1.slice(0, -1)));
  Eco.goDormant(portA, NOW);
  /* The player's footprint shows from when it was made, not before. */
  var sellCid = portA.market.order.filter(function (c) { var q = Eco.price(portA, c, NOW); return q.buy !== null && q.stock > 5 && c !== 'waste'; })[0];
  var before = TA.history(portA, sellCid, NOW);
  var saved = JSON.stringify(portA.market.ledger);
  Eco.applyTrade(portA, sellCid, 5, NOW - 2 * DAY);
  var after = TA.history(portA, sellCid, NOW);
  var k = TA.SAMPLES - 1 - 4;      // two days ago, the trade's own moment
  check('a trade two days ago leaves the month before it alone',
        JSON.stringify(after.slice(0, k)) === JSON.stringify(before.slice(0, k)));
  check('and shows from the moment it was made', after[k].mid > before[k].mid || after[k].stock !== before[k].stock || after[k].mid !== before[k].mid);
  portA.market.ledger = JSON.parse(saved);
  check('price() itself is what it was (refactored through quote())', (function () {
    for (var i = 0; i < ports.length; i++) for (var j = 0; j < ports[i].market.order.length; j++) {
      var c = ports[i].market.order[j], a = Eco.price(ports[i], c, NOW), b = Eco.priceAt(ports[i], c, NOW);
      if (Object.keys(ports[i].market.ledger).length === 0 && (a.buy !== b.buy || a.sell !== b.sell)) return false;
    }
    return true;
  })());
})();

console.log('--- the averages ---');
(function () {
  var cid = portA.market.order.filter(function (c) { var q = Eco.price(portA, c, NOW); return q.buy !== null && q.sell !== null; })[0];
  var h = TA.history(portA, cid, NOW), m = TA.meanMid(h);
  var sum = 0; h.forEach(function (p) { sum += p.mid; });
  check('quoting both, the port average is the mean mid over the window', Math.abs(m - sum / h.length) < 1e-9);
  check('and lies between the month\'s low and high', m >= Math.min.apply(null, h.map(function (p) { return p.mid; })) - 1e-9 &&
        m <= Math.max.apply(null, h.map(function (p) { return p.mid; })) + 1e-9);
  var sa = TA.systemAverage(sys, cid, NOW, null, 'mid');
  var n = 0, s2 = 0;
  sys.ports.forEach(function (p) {
    if (!p.market || !p.market.rows[cid] || p.dark) return;
    var q = Eco.price(p, cid, NOW);
    if (q.buy === null || q.sell === null) return;
    n++; s2 += TA.meanMid(TA.history(p, cid, NOW));
  });
  check('the system average is every port that quotes it, each over the window', sa.n === n && Math.abs(sa.mean - s2 / n) < 1e-9,
        sa.n + ' vs ' + n);
  /* A row with one line averages that line, not a mid nobody quotes. */
  var one = ports.map(function (p) {
    var c = p.market.order.filter(function (x) { var q = Eco.price(p, x, NOW); return q.buy === null && q.sell !== null; })[0];
    return c ? { p: p, c: c } : null;
  }).filter(Boolean)[0];
  var G1 = { sys: sys, ship: talon(), t: NOW, galaxy: gal, here: home, visited: {}, navTarget: null };
  var r1 = TA.route(G1, 'terminal', { port: one.p }), d1 = TA.detail(r1, TA.build(r1), one.c, {});
  var bids = TA.history(one.p, one.c, NOW).map(function (x) { return x.sell; });
  check('a port that only buys it: the average is of its bid', d1.basis === 'sell' &&
        Math.abs(d1.portAvg - bids.reduce(function (a, b) { return a + b; }, 0) / bids.length) < 1e-9);
  check('so it lies on the line drawn, not above it', d1.portAvg <= Math.max.apply(null, bids) + 1e-9 && d1.portAvg >= Math.min.apply(null, bids) - 1e-9);
})();

console.log('--- break-even ---');
(function () {
  var s = talon(); Combat.fitItem(s, 'portanalyser');
  s.docked = portA.id;
  var G = makeG(s);
  var r = TA.route(G, 'fitting', { burnPerKm: BURN });
  check('docked with the fitting, the route reads the docked port', r.ok && r.port === portA && r.origin === portA, r.why);
  var data = TA.build(r);
  var row = data.rows.filter(function (x) { return x.buy !== null && x.stock > 5 && !x.waste; })[0];
  var d0 = TA.detail(r, data, row.id, {});
  check('with nothing locked: no break-even, and it says to lock a target',
        !d0.be.price && /lock a target to cost the trip/.test(d0.be.why), d0.be.why);
  check('and the ask stands alone', d0.be.buy === row.buy);

  /* Lock the other port. */
  G.navTarget = { kind: 'body', id: portB.id };
  r = TA.route(G, 'fitting', { burnPerKm: BURN });
  data = TA.build(r);
  row = data.rows.filter(function (x) { return x.id === row.id; })[0];
  var d1 = TA.detail(r, data, row.id, {});
  var a = Sim.bodyPosition(portA, sys, NOW), b = Sim.bodyPosition(portB, sys, NOW);
  var km = Math.sqrt(Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2) + Math.pow(a.z - b.z, 2));
  var load = TA.tonnesFor(s, row);
  var h2 = Eco.price(portA, Eco.FUEL_ID, NOW).buy;
  var want = row.buy + km * BURN * h2 / load.tonnes;
  check('locked on a port: buy + cruise fuel ÷ tonnes', Math.abs(d1.be.price - want) < 1e-9, d1.be.price + ' vs ' + want);
  check('on a full hold of the good, capped by credits and stock',
        load.tonnes === Math.floor(Math.min(s.cargoCap - Sim.cargoMass(s), s.credits / row.buy, row.stock)));
  check('compared with the locked port\'s bid now',
        d1.be.compare && d1.be.compare.bid === Eco.price(portB, row.id, NOW).sell && d1.be.compare.ageDays === 0);
  /* Poorer, and the load shrinks — the break-even rises. */
  s.credits = row.buy * 3.5;
  var d2 = TA.detail(r, TA.build(r), row.id, {});
  check('a smaller load carries the same fuel: a higher break-even', d2.be.load.tonnes === 3 && d2.be.price > d1.be.price &&
        d2.be.load.by === 'what you can afford');
  s.credits = 50000;

  /* A star instead. */
  G.navTarget = null;
  var far = Galaxy.reachable(gal, home, s)[0].star;
  r = TA.route(G, 'fitting', { burnPerKm: BURN, courseStar: far.id });
  check('a plotted star is the lock when no port is', r.ok && r.lock && r.lock.kind === 'star' && r.lock.star === far);
  data = TA.build(r);
  row = data.rows.filter(function (x) { return x.id === row.id; })[0];
  var farSys = Gen.generateSystem(far.seed, Galaxy.systemOpts(gal, far));
  var reports = {}; reports[far.id] = TA.systemReport(farSys, far, Galaxy.distance3(home, far), NOW);
  var d3 = TA.detail(r, data, row.id, reports);
  var ld = TA.tonnesFor(s, row);
  var laden = {}; for (var k in s) laden[k] = s[k]; laden.cargo = {}; laden.cargo[row.id] = ld.tonnes;
  var jf = Galaxy.jumpPlan(gal, home, far, laden).fuel;
  check('locked on a star: buy + jump fuel (for the ship laden) ÷ tonnes',
        Math.abs(d3.be.price - (row.buy + jf * h2 / ld.tonnes)) < 1e-9 && jf > Galaxy.jumpPlan(gal, home, far, s).fuel);
  var g = reports[far.id].goods[row.id];
  check('compared with that system\'s best reported bid',
        g ? d3.be.compare.bid === g.bid && d3.be.compare.ageDays === reports[far.id].ageDays : d3.be.compare === null || d3.be.compare.bid === null);

  /* In flight: the locked port, and no trip. */
  s.docked = null;
  G.navTarget = { kind: 'body', id: portB.id };
  r = TA.route(G, 'fitting', { burnPerKm: BURN });
  check('in flight the fitting reads the locked port', r.ok && r.port === portB && !r.origin);
  var d4 = TA.detail(r, TA.build(r), TA.build(r).rows[0].id, {});
  check('and does not cost a trip, saying why', !d4.be.price && /dock/.test(d4.be.why), d4.be.why);
  G.navTarget = null;
  r = TA.route(G, 'fitting', {});
  check('in flight with nothing locked, refused in words', !r.ok && /lock/.test(r.why), r.why);
})();

console.log('--- other systems ---');
(function () {
  var hpl = Slip.hoursPerLy(Slip.CLASS_TYPICAL.II);
  check('a report ages at a class II freighter\'s pace', Math.abs(TA.reportAgeDays(5) - 5 * hpl / 24) < 1e-9 &&
        TA.reportAgeDays(0) === 0, TA.reportHoursPerLy());
  var s = talon(); s.docked = portA.id;
  var G = makeG(s);
  var visited = gal.stars.filter(function (st) { return st !== home; }).sort(function (a, b) {
    return Galaxy.distance3(home, b) - Galaxy.distance3(home, a);
  })[0];     // the FARTHEST star: visited, and out of any reach
  G.visited[visited.id] = true;
  var ctx = { here: home, galaxy: gal, ship: s, visited: G.visited, lock: null };
  var c = TA.candidates(ctx);
  var reach = Galaxy.reachable(gal, home, s).slice(0, TA.NEAREST_CAP).map(function (x) { return x.star; });
  check('the nearest in reach are listed', reach.every(function (st) { return c.some(function (x) { return x.star === st; }); }));
  check('and the systems you have been to, even out of reach', c.some(function (x) { return x.star === visited; }));
  check('capped, and nearest first', c.length <= TA.LIST_CAP && c.every(function (x, i) { return !i || x.ly >= c[i - 1].ly; }));
  var st = reach[0], ss = Gen.generateSystem(st.seed, Galaxy.systemOpts(gal, st));
  var ly = Galaxy.distance3(home, st), rep = TA.systemReport(ss, st, ly, NOW);
  check('a report is the market as it was, now less the age', Math.abs(rep.at - (NOW - TA.reportAgeDays(ly) * DAY)) < 1e-6);
  var cid = Object.keys(rep.goods)[0], best = null;
  ss.ports.forEach(function (p) {
    if (!p.market || !p.market.rows[cid] || p.dark) return;
    var q = Eco.priceAt(p, cid, rep.at);
    if (q.sell !== null && (best === null || q.sell > best)) best = q.sell;
  });
  check('its best bid is the best bid in that system at that moment', rep.goods[cid].bid === best);
  check('and is deterministic', JSON.stringify(TA.systemReport(ss, st, ly, NOW).goods) === JSON.stringify(rep.goods));
})();

console.log('--- the terminal ---');
(function () {
  var seeds = ['kawartha', 'a1', 'b2', 'c3', 'd4', 'e5', 'f6', 'g7', 'h8', 'i9', 'j10', 'k11'];
  var placed = 0, reached = 0, total = 0, again = 0, sea = 0;
  seeds.forEach(function (sd, i) {
    [false, true].forEach(function (isSea) {
      var opts = { seed: sd, yard: i % 2 === 0, ships: [{ id: 'me', size: 'M', name: 'Mine', current: true }] };
      if (isSea) opts.sea = { tube: 120, dome: 50, mine: 0, pads: [{ k: 0, large: false, mine: true }, { k: 1, large: true, mine: false }] };
      var plan = Walk.layout('port-' + i, opts);
      total++;
      var term = plan.items.filter(function (it) { return it.kind === 'tradeterm'; });
      if (term.length !== 1) return;
      placed++; if (isSea) sea++;
      var t = term[0];
      if (JSON.stringify(Walk.layout('port-' + i, opts).items.filter(function (it) { return it.kind === 'tradeterm'; })[0]) === JSON.stringify(t)) again++;
      /* Flood the floor from the spawn, and find a spot from which E
       * reaches it, facing it. */
      var step = 0.25, seen = {}, q = [[Math.round(plan.spawn.x / step), Math.round(plan.spawn.z / step)]], ok = false;
      seen[q[0].join(',')] = true;
      while (q.length && !ok) {
        var c = q.shift(), x = c[0] * step, z = c[1] * step;
        var dx = t.x - x, dz = t.z - z, d = Math.sqrt(dx * dx + dz * dz);
        if (d < Walk.REACH) {
          var w = { plan: plan, x: x, z: z, yaw: Math.atan2(dx, dz) };
          if (Walk.facing(w) === t) { ok = true; break; }
        }
        [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (o) {
          var nx = c[0] + o[0], nz = c[1] + o[1], key = nx + ',' + nz;
          if (seen[key] || !Walk.standable(plan, nx * step, nz * step)) return;
          seen[key] = true; q.push([nx, nz]);
        });
      }
      if (ok) reached++;
    });
  });
  check('every concourse gets exactly one terminal (' + placed + ' of ' + total + ', ' + sea + ' at sea)', placed === total);
  check('placed the same way every visit', again === placed);
  check('and you can walk from your berth to it and use it, everywhere', reached === placed, reached + ' of ' + placed);
  var plan0 = Walk.layout('port-0', { seed: 'kawartha', ships: [] });
  var t0 = plan0.items.filter(function (it) { return it.kind === 'tradeterm'; })[0];
  check('it stands in the concourse', Walk.roomAt(plan0, t0.x, t0.z).kind === 'concourse');
  check('another port puts it somewhere else (it is seeded)', (function () {
    for (var i = 1; i < 8; i++) {
      var o = Walk.layout('port-' + i, { seed: 'kawartha', ships: [] }).items.filter(function (it) { return it.kind === 'tradeterm'; })[0];
      if (o.x !== t0.x || o.z !== t0.z) return true;
    }
    return false;
  })());
  /* The dressing is exactly what it would have been without it. */
  var noTerm = Walk.layout('port-0', { seed: 'kawartha', ships: [] });
  noTerm.items = noTerm.items.filter(function (it) { return it.kind !== 'tradeterm'; });
  check('the concourse is dressed exactly as before (the terminal goes in last)',
        JSON.stringify(noTerm.dress) === JSON.stringify(plan0.dress));
  check('its pedestal is drawn on the GPU deck too', Walk.meshFor(plan0).c.some(function (c) { return c === '!#7dfaff'; }));
})();

console.log('--- one screen, two routes ---');
(function () {
  var s = talon(); Combat.fitItem(s, 'portanalyser'); s.docked = portA.id;
  var G = makeG(s);
  var fit = TA.route(G, 'fitting', { burnPerKm: BURN });
  var term = TA.route(G, 'terminal', { port: portA, burnPerKm: BURN });
  check('the terminal needs no fitting', TA.route(makeG(talon()), 'terminal', { port: portA }).ok);
  var a = TA.build(fit), b = TA.build(term);
  check('the same rows from both routes', JSON.stringify(a.rows) === JSON.stringify(b.rows));
  check('the same averages', JSON.stringify(TA.detail(fit, a, a.rows[0].id, {}).portAvg) ===
                             JSON.stringify(TA.detail(term, b, b.rows[0].id, {}).portAvg));
  G.navTarget = { kind: 'body', id: portB.id };
  term = TA.route(G, 'terminal', { port: portA, burnPerKm: BURN });
  var dt = TA.detail(term, TA.build(term), b.rows[0].id, {});
  check('the terminal does not see your lock, and says so', !term.lock && !dt.be.price && /cannot see your ship/.test(dt.be.why), dt.be.why);
})();

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
