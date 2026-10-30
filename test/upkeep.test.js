/* upkeep.test.js — other ships' tanks and purses, and the ones that run dry.
 *
 *     node test/upkeep.test.js
 *
 * Astra, 2026-10-30: track other ships' money and fuel, so that a ship in
 * need of fuel is a reason to buy a rescue tender. Pinned:
 *
 *  - breakdowns are a pure function of (seed, route, leg), about one leg in
 *    eighty, only on the scheduled trading runs, and leave a system with a
 *    ship adrift every few days rather than every hour or every month;
 *  - a ship adrift starts exactly where her timetable had her, coasts on a
 *    bound orbit clear of the body, is towed into her berth before her next
 *    departure, and is back on her timetable after that leg;
 *  - her tank and her purse are functions of time, and the tank is empty
 *    from the leak;
 *  - her mayday is on the band while she is adrift, follows her, and comes
 *    off when the tug reaches her;
 *  - passing her mass takes being alongside and matched, banks a part-load
 *    for a second trip, takes hydrogen from your hold first, and once she
 *    has enough she pays from her purse, owes you, and flies home — off her
 *    rail, and back on it, past the leg you pulled her out of;
 *  - what you did is saved, and put back on the routes after a load.
 */
'use strict';

var path = require('path');
var SRC = path.join(__dirname, '..', 'src');
global.window = global;
var V = require(path.join(SRC, 'vec3.js'));
require(path.join(SRC, 'kepler.js'));
require(path.join(SRC, 'rng.js'));
require(path.join(SRC, 'economy.js'));
var Gen = require(path.join(SRC, 'generate.js'));
var Galaxy = require(path.join(SRC, 'galaxy.js'));
var Sim = require(path.join(SRC, 'sim.js'));
var Combat = require(path.join(SRC, 'combat.js'));
require(path.join(SRC, 'missions.js'));
require(path.join(SRC, 'shiptrade.js'));
var Cap = require(path.join(SRC, 'captains.js'));
/* Debts live in favours.js, which hangs addDebt on Captains as the game does. */
require(path.join(SRC, 'favours.js'));
var M = require(path.join(SRC, 'messages.js'));
var Save = require(path.join(SRC, 'save.js'));
var U = require(path.join(SRC, 'upkeep.js'));

var pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail !== undefined ? '   ' + detail : '')); }
}
function section(n) { console.log('\n' + n); }

var SEED = 'kawartha';
var DAY = 86400;
var galaxy = Galaxy.build(SEED);
var cache = {};
function systemFor(star) {
  if (!cache[star.id]) {
    cache[star.id] = Gen.generateSystem(star.seed,
      { faction: galaxy.factionById[star.factionId], allFactions: galaxy.factions });
    cache[star.id].starId = star.id;
  }
  return cache[star.id];
}
function makeG(star) {
  var sys = systemFor(star);
  var planet = sys.bodies.filter(function (b) { return b.kind === 'planet'; })[0];
  var ship = Sim.circularOrbit(planet, sys, 0, planet.radius * 0.6, 0.1, 0);
  ship.credits = 5000; ship.cargo = {}; ship.passengers = 0;
  Combat.initShip(ship);
  Sim.refreshShip(ship);
  ship.shipName = 'Brightwing'; ship.bornId = 'hull-A';
  return { seed: SEED, ship: ship, sys: sys, t: 1000, galaxy: galaxy, here: star,
           standing: {}, wanted: {}, missions: [], doneMissions: {}, distress: [] };
}
function legBounds(r, leg) {
  var cycle = Math.floor(leg / 2), start = r.t0 + cycle * r.period;
  var tDep = leg % 2 === 0 ? start : start + r.cruise + r.layover;
  return { tDep: tDep, legEnd: tDep + r.cruise, nextDep: tDep + r.cruise + r.layover };
}

/* One survey, used by several sections: every eligible leg in the first
 * thirty days of forty systems. */
var stars = galaxy.stars.slice(0, 40);
var legs = 0, broke = 0, perDay = [], found = [];
stars.forEach(function (star) {
  var sys = systemFor(star), n = 0;
  (sys.traffic || []).forEach(function (r) {
    if (!U.eligible(r)) return;
    for (var leg = U.legAt(r, 0).leg; leg <= U.legAt(r, 30 * DAY).leg; leg++) {
      legs++;
      var bd = U.failure(r, sys, leg);
      if (bd) { broke++; n++; if (found.length < 60) found.push({ star: star, sys: sys, r: r, bd: bd }); }
    }
  });
  perDay.push(n / 30);
});
function q(a, p) { var s = a.slice().sort(function (x, y) { return x - y; }); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; }

section('--- how often ---');
(function () {
  console.log('     ' + broke + ' breakdowns in ' + legs + ' legs; per system-day p10/med/p90 ' +
              q(perDay, 0.1).toFixed(2) + ' / ' + q(perDay, 0.5).toFixed(2) + ' / ' + q(perDay, 0.9).toFixed(2));
  check('about one leg in eighty breaks, after the vetoes', broke > legs / 160 && broke < legs / 70, broke + '/' + legs);
  var med = q(perDay, 0.5);
  check('a typical system has a ship adrift every few days, not hourly or monthly', med > 0.05 && med < 1, med);
  var one = found[0];
  one.r._fail = null;
  var again = U.failure(one.r, one.sys, one.bd.leg);
  check('the same leg breaks the same way every time',
        again && again.at === one.bd.at && again.towAt === one.bd.towAt);
  /* The feeders and the heavies never do. */
  var sys = one.sys, never = true;
  (sys.traffic || []).forEach(function (r) {
    if (!(r.feeder || r.heavy)) return;
    for (var leg = 0; leg < 400; leg++) if (U.failure(r, sys, leg)) never = false;
  });
  check('feeders and heavies never break', never);
})();

section('--- adrift, then towed, then back on the timetable ---');
(function () {
  var worst = 0, jumps = 0, orbitOk = true, towOk = true, mooredOk = true, backOk = true;
  found.forEach(function (f) {
    var r = f.r, sys = f.sys, bd = f.bd, lb = legBounds(r, bd.leg);
    var core = Sim.trafficCore(r, sys, bd.at), st = Sim.trafficState(r, sys, bd.at);
    worst = Math.max(worst, V.dist(core.pos, st.pos));
    if (st.phase !== 'adrift') jumps++;
    var parent = sys.byId[r.parentId];
    var r0 = V.len(V.sub(st.pos, Sim.bodyState(parent, sys, bd.at).pos));
    [0.25, 0.5, 0.75, 0.99].forEach(function (k) {
      var t = bd.at + (bd.towAt - bd.at) * k;
      var s = Sim.trafficState(r, sys, t);
      var rr = V.len(V.sub(s.pos, Sim.bodyState(parent, sys, t).pos));
      if (s.phase !== 'adrift' || Math.abs(rr - r0) > r0 * 0.01 || rr < parent.radius * 1.1) orbitOk = false;
    });
    if (!(bd.towAt < lb.nextDep) || !(bd.towAt - bd.at >= U.WAIT_MIN)) towOk = false;
    if (bd.towAt < lb.legEnd) {
      var m = Sim.trafficState(r, sys, (bd.towAt + lb.legEnd) / 2);
      if (m.phase !== 'moored' || !m.towed || m.to !== sys.byId[bd.outbound ? r.to : r.from]) mooredOk = false;
    }
    var after = Math.max(lb.legEnd, bd.towAt) + 1;
    if (V.dist(Sim.trafficState(r, sys, after).pos, Sim.trafficCore(r, sys, after).pos) > 1e-9) backOk = false;
  });
  check('she is adrift from the moment of the leak', jumps === 0, jumps);
  check('exactly where her timetable had her', worst < 1e-3, worst.toFixed(6) + ' km');
  check('coasting on a bound orbit, clear of the body', orbitOk);
  check('the tug reaches her after three hours at least, and before her next departure', towOk);
  check('towed in, she is moored in the berth she was bound for', mooredOk);
  check('and after that leg she is on her timetable again', backOk);
})();

section('--- her tank and her purse ---');
(function () {
  var f = found[0], r = f.r, sys = f.sys, bd = f.bd, lb = legBounds(r, bd.leg);
  var G = makeG(f.star);
  /* A leg that does not break, for the ordinary curve. */
  var ok = bd.leg + 2;
  while (U.failure(r, sys, ok)) ok += 2;
  var lo = legBounds(r, ok);
  var a = U.fuelAt(r, sys, lo.tDep + 1, G), b = U.fuelAt(r, sys, lo.legEnd - 1, G);
  var c = U.fuelAt(r, sys, lo.legEnd + r.layover * 0.5, G);
  check('full when she leaves', a.frac > 0.99, a.frac);
  check('lighter by a share of her tank when she arrives', Math.abs(b.frac - (1 - U.BURN_PER_LEG)) < 0.01, b.frac);
  check('and full again early in her layover', c.frac > 0.99, c.frac);
  var d = U.fuelAt(r, sys, bd.at + 60, G);
  check('empty from the leak, and leaking', d.t === 0 && d.leaking);
  check('her tank is her hull\'s, grown with her', U.tankOf(r) >= 10 && U.needOf(r) >= 4 && U.needOf(r) < U.tankOf(r));
  var p1 = U.purseAt(r, sys, lo.tDep + 1, G), p2 = U.purseAt(r, sys, lo.tDep + 1, G);
  check('her purse is a number, the same number twice', p1 > 0 && p1 === p2, p1);
  var settled = 0, rising = 0, lp = null;
  for (var leg = 0; leg < 24; leg++) {
    var lbx = legBounds(r, leg), p = U.purseAt(r, sys, lbx.legEnd + 1, G);
    if (lp !== null) { if (p > lp) rising++; else if (p < lp) settled++; }
    lp = p;
  }
  check('it fills leg by leg and empties when she settles with her owners', rising > 10 && settled >= 3, rising + ' up, ' + settled + ' down');
})();

section('--- her mayday ---');
(function () {
  var f = found[0], r = f.r, bd = f.bd;
  var G = makeG(f.star), sys = G.sys;
  var t = bd.at + 600;
  U.updateCalls(G, sys, t);
  var call = G.distress.filter(function (c) { return c.routeId === r.id && c.upkeep; })[0];
  check('adrift, she is on the band', !!call && !call.fake && call.npc);
  if (!call) return;
  var her = Sim.trafficState(r, sys, t);
  check('from where she is', V.dist(call.pos, her.pos) < 1e-6);
  check('saying what is wrong and what she needs', /reaction-mass tank/.test(call.text) && /tonnes/.test(call.text), call.text);
  check('her transponder checks out', /checks out/.test(M.checkTransponder(G, sys, t, call)));
  var t2 = bd.at + (bd.towAt - bd.at) * 0.5;
  U.updateCalls(G, sys, t2);
  check('the beacon follows her drift', V.dist(call.pos, Sim.trafficState(r, sys, t2).pos) < 1e-6 &&
        G.distress.filter(function (c) { return c.routeId === r.id; }).length === 1);
  U.updateCalls(G, sys, bd.towAt + 5);
  check('and comes off the band when the tug has her', !G.distress.some(function (c) { return c.routeId === r.id && c.upkeep; }));
})();

section('--- passing her mass ---');
(function () {
  var f = found[1] || found[0], r = f.r, bd = f.bd;
  var G = makeG(f.star), sys = G.sys;
  var hooks = { said: [], say: function (m) { hooks.said.push(m); } };
  var t = bd.at + 600;
  U.updateCalls(G, sys, t);
  var call = G.distress.filter(function (c) { return c.routeId === r.id && c.upkeep; })[0];
  check('there is a call to answer', !!call);
  if (!call) return;
  var her = Sim.trafficState(r, sys, t);
  var need = U.needOf(r);

  G.ship.pos = V.add(her.pos, { x: 500, y: 0, z: 0 }); G.ship.vel = V.clone(her.vel);
  var far = Combat.answerDistress(sys, G, t, call, hooks);
  check('from too far, it says how close to come', !far.ok && /within/.test(far.why), far.why);

  G.ship.pos = V.add(her.pos, { x: 2, y: 0, z: 0 }); G.ship.vel = V.add(her.vel, { x: 0.5, y: 0, z: 0 });
  var fast = Combat.answerDistress(sys, G, t, call, hooks);
  check('unmatched, it says to match her drift', !fast.ok && /match/.test(fast.why), fast.why);

  G.ship.vel = V.clone(her.vel);
  G.ship.cargo = {};
  G.ship.thrusterFuel = U.TRANSFER_RESERVE + need * 0.4;
  var credits0 = G.ship.credits;
  var part = Combat.answerDistress(sys, G, t, call, hooks);
  check('a part-load is passed and banked', part.ok && !part.done && Math.abs(part.tonnes - need * 0.4) < 1e-6, JSON.stringify(part));
  check('your reserve is kept', Math.abs(G.ship.thrusterFuel - U.TRANSFER_RESERVE) < 1e-6, G.ship.thrusterFuel);
  check('she says how much more', hooks.said.some(function (s) { return /more before we can make way/.test(s); }));
  check('and the call stays open for the next trip', !call.answeredBy);
  check('her tank shows what you gave her', Math.abs(U.fuelAt(r, sys, t + 1, G).t - need * 0.4) < 1e-6);
  check('nothing is paid yet', G.ship.credits === credits0);

  G.ship.cargo = { hydrogen: need };
  G.ship.thrusterFuel = 10;
  var t2 = t + 3600;
  her = Sim.trafficState(r, sys, t2);
  G.ship.pos = V.add(her.pos, { x: 1, y: 0, z: 0 }); G.ship.vel = V.clone(her.vel);
  var purse = U.purseAt(r, sys, t2, G);
  var done = Combat.answerDistress(sys, G, t2, call, hooks);
  check('a second trip finishes the job', done.ok && done.done, JSON.stringify(done));
  check('from your hold first, your tank untouched', Math.abs(G.ship.cargo.hydrogen - need * 0.4) < 1e-6 && G.ship.thrusterFuel === 10,
        JSON.stringify(G.ship.cargo) + ' ' + G.ship.thrusterFuel);
  check('she pays what she can from her purse', done.paid > 0 && done.paid <= purse &&
        G.ship.credits === credits0 + done.paid, done.paid + ' of ' + done.price + ', purse ' + purse);
  check('and her purse is lighter by it', U.purseAt(r, sys, t2, G) === Math.max(0, purse - done.paid));
  check('the call is answered and off the band', call.answeredBy === 'player' &&
        !G.distress.some(function (c) { return c.routeId === r.id && c.upkeep; }));
  check('the rescue is on your record', Cap.recordOf(G).rescues === 1);
  /* And in the captain's log on F5 NOTES (journal.js), with who owes whom. */
  var Jn = global.Journal;
  var logged = (G.journal || []).filter(function (e) { return e.kind === 'rescue'; });
  check('both trips and the payment are in the captain\'s log', !!Jn && logged.length === 3 &&
        logged[2].text.indexOf(r.name) >= 0 && logged[2].text.indexOf('+' + done.paid) >= 0,
        logged.map(function (e) { return e.text; }).join(' | '));
  check('and she is on the notes tab as owing you, by name', !!Jn && Jn.debts(G).some(function (d) {
    return d.who === r.name && d.debt === 1 && /adrift/.test(d.why);
  }), JSON.stringify(Jn && Jn.debts(G)));
  var mem = Cap.memory(G, Cap.keyOf(G, sys, { route: r, id: r.id }));
  check('and her captain is grateful', mem && mem.tag === 'SAVED_MY_SHIP' &&
        Cap.greeting(G, sys, { route: r, id: r.id }, t2 + 100).band === 'grateful', mem && mem.tag);
  var spec = (sys.patrols || []).filter(function (p) { return p.liftedFrom === r; })[0];
  check('she flies herself home, off her rail, from where she was', !!spec && r.suppressed &&
        V.dist(spec.live.pos, her.pos) < 1e-6);
  /* Out of sight, she is reaped and the timetable takes her back — and
   * this leg is now one she was pulled out of. */
  spec.live = null;
  Combat.reapLifted(sys);
  check('reaped, she is on her timetable again', !r.suppressed &&
        V.dist(Sim.trafficState(r, sys, t2 + 60).pos, Sim.trafficCore(r, sys, t2 + 60).pos) < 1e-9);

  /* Saved, loaded into a fresh copy of the system: the leg stays rescued. */
  var snap = JSON.parse(JSON.stringify(Save.snapshot(G)));
  check('what you did is saved', snap.npcLedger && Object.keys(snap.npcLedger).length === 1);
  var sys2 = Gen.generateSystem(f.star.seed, { faction: galaxy.factionById[f.star.factionId], allFactions: galaxy.factions });
  sys2.starId = f.star.id;
  var r2 = sys2.traffic.filter(function (x) { return x.id === r.id; })[0];
  check('a fresh copy of her would be adrift', U.stranded(r2, sys2, t2 + 60) && U.stranded(r2, sys2, t2 + 60).adrift);
  var G2 = { ship: G.ship, npcLedger: snap.npcLedger, distress: [] };
  U.updateCalls(G2, sys2, t2 + 60);
  check('and after a load she is not', !U.stranded(r2, sys2, t2 + 60) &&
        !G2.distress.some(function (c) { return c.routeId === r.id; }));
})();

section('--- held up: the cash box, or a transfer that leaves her enough to make port ---');
(function () {
  var f = found[4] || found[0], r = f.r;
  var G = makeG(f.star), sys = G.sys;
  var t = f.bd.at - 7200;
  var purse0 = U.purseAt(r, sys, t, G), floor = U.floorOf(r);
  var box = U.cashBox(r, sys, t, G);
  check('the cash box is a tenth of her purse', Math.abs(box - purse0 * U.CASHBOX_SHARE) <= 1, box + ' of ' + purse0);
  var got = U.rob(G, sys, t, r, 'cash');
  check('taking it takes that, off the purse her screen shows', got === box && U.purseAt(r, sys, t, G) === purse0 - got);
  check('and the box is empty for the rest of the leg', U.cashBox(r, sys, t + 60, G) === 0 && U.rob(G, sys, t + 60, r, 'cash') === 0);
  var acct = U.accountTake(r, sys, t, G);
  var got2 = U.rob(G, sys, t, r, 'account');
  var left = U.purseAt(r, sys, t, G);
  check('a transfer takes everything above what she needs to make port', got2 === acct &&
        (left === floor || (acct === 0 && left <= floor)), got2 + ' cr taken, ' + left + ' left, floor ' + floor);
  check('and a second transfer gets nothing', U.rob(G, sys, t + 60, r, 'account') === 0);
  /* Her owners top her float back up when she next settles. */
  var legs = U.legAt(r, t).leg, settleT = t;
  for (var k = 0; k < 40 && U.legAt(r, settleT).leg < legs + U.SETTLE_LEGS + 1; k++) settleT += r.period / 2;
  var clean = { npcLedger: {} };
  check('after she next settles with her owners, her purse is as if nothing happened',
        U.purseAt(r, sys, settleT, G) === U.purseAt(r, sys, settleT, clean),
        U.purseAt(r, sys, settleT, G) + ' vs ' + U.purseAt(r, sys, settleT, clean));

  /* Through Combat.demandFrom, the comms row's own path. */
  var G2 = makeG(f.star), sys2 = G2.sys;
  var r2 = (found[5] || found[1]).r;
  if (sys2 !== (found[5] || found[1]).sys) { check('(a second ship in the same system)', true); return; }
  var t2 = (found[5] || found[1]).bd.at - 7200;
  var st = Sim.trafficState(r2, sys2, t2);
  G2.t = t2; G2.ship.pos = V.add(st.pos, { x: 5, y: 0, z: 0 }); G2.ship.vel = V.clone(st.vel);
  G2.ship.missiles = 2;
  var hooks = { said: [], say: function (m) { hooks.said.push(m); } };
  var p0 = U.purseAt(r2, sys2, t2, G2), c0 = G2.ship.credits;
  Combat.demandFrom(sys2, G2, t2, st, 'account', hooks);
  var paid = G2.ship.credits - c0;
  check('demanding a transfer at gunpoint pays it into your account', paid > 0 && paid === p0 - U.floorOf(r2), paid + ' cr; ' + hooks.said.join(' | '));
  /* THE MORE YOU TAKE, THE WORSE THE CRIME (Astra, 2026-10-30). What was
   * taken rides on the report still to come — a witness's, or her own
   * call — and is charged on top of the flat rate when it goes out. */
  var spec2 = U.liftedOf(r2, sys2);
  var riding = G2.pendingReport && t2 < G2.pendingReport.at ? G2.pendingReport.loot : spec2 && spec2.lootUnreported;
  check('what you took rides on the report still to come', riding === paid, riding + ' vs ' + paid);
  var before = Combat.bountyTotal(G2);
  if (spec2 && spec2.distressAt) spec2.distressAt = t2 + 1;
  if (G2.pendingReport) G2.pendingReport.at = t2 + 1;
  Combat.update(sys2, G2, t2 + 30, 0.05, hooks);
  var added = Combat.bountyTotal(G2) - before;
  var flat = 400;
  check('and when it is reported, the charge is the hold-up plus half of what you took',
        Math.abs(added - (flat + Combat.lootBounty(paid))) <= 1, '+' + added + ' cr on the bounty for ' + paid + ' cr taken');
  check('so a bigger take is a bigger charge', Combat.lootBounty(paid * 2) > Combat.lootBounty(paid) && Combat.lootBounty(0) === 0);
  var kinds = (G2.journal || []).map(function (e) { return e.kind; });
  check('the hold-up and the charge are both in the captain\'s log', kinds.indexOf('robbery') >= 0 && kinds.indexOf('crime') >= 0 &&
        G2.journal.some(function (e) { return e.kind === 'crime' && /Bounty with .* now \d+ cr/.test(e.text); }),
        (G2.journal || []).map(function (e) { return e.kind + ': ' + e.text; }).join(' | '));
})();

section('--- adrift and lifted: robbed, or asked aboard ---');
(function () {
  var f = found[6] || found[0], r = f.r, bd = f.bd;
  var G = makeG(f.star), sys = G.sys;
  /* The systems are shared between sections; a section above may have
   * lifted this very ship. Start her clean, on her rail. */
  sys.patrols = (sys.patrols || []).filter(function (p) { return p.liftedFrom !== r; });
  r.suppressed = false;
  var t = bd.at + 900, st = Sim.trafficState(r, sys, t);
  G.t = t; G.ship.pos = V.add(st.pos, { x: 3, y: 0, z: 0 }); G.ship.vel = V.clone(st.vel);
  G.ship.missiles = 2;
  var hooks = { said: [], say: function (m) { hooks.said.push(m); } };
  /* Asking her aboard: she cannot come alongside. */
  var B = require(path.join(SRC, 'boarding.js'));
  var ask = B.ask(G, sys, t, st);
  check('asked aboard while adrift, she says she cannot come', !ask.ok && /tank is gone/.test(ask.why), ask.why);
  /* Robbing her lifts her off her rail; she must not fly off. */
  Combat.demandFrom(sys, G, t, st, 'credits', hooks);
  var spec = U.liftedOf(r, sys);
  check('robbed while adrift, she is lifted with a dead tank', !!spec && spec.adrift && spec.live.adrift, hooks.said.join(' | '));
  U.updateCalls(G, sys, t + 5);
  var call = G.distress.filter(function (c) { return c.routeId === r.id && c.upkeep; })[0];
  check('and still on the band, her beacon where she coasts', !!call && V.dist(call.pos, spec.live.pos) < 1e-6);
  /* Fuel her: the lifted ship is the one fuelled, and she can fly again. */
  G.ship.pos = V.add(spec.live.pos, { x: 1, y: 0, z: 0 }); G.ship.vel = V.clone(spec.live.vel);
  G.ship.cargo = { hydrogen: U.needOf(r) + 1 };
  var tr = U.transfer(G, sys, t + 10, r, hooks);
  check('passing her mass works on the lifted ship', tr.ok && tr.done, JSON.stringify(tr));
  check('and she has a drive again', !spec.adrift && !spec.live.adrift && spec.mode === 'breakoff');
})();

section('--- nothing to give ---');
(function () {
  var f = found[2] || found[0], r = f.r, bd = f.bd;
  var G = makeG(f.star), sys = G.sys;
  var t = bd.at + 300, her = Sim.trafficState(r, sys, t);
  G.ship.pos = V.add(her.pos, { x: 1, y: 0, z: 0 }); G.ship.vel = V.clone(her.vel);
  G.ship.cargo = {}; G.ship.thrusterFuel = U.TRANSFER_RESERVE;
  var res = U.transfer(G, sys, t, r, null);
  check('with only your reserve left, you cannot', !res.ok && /nothing to spare/.test(res.why), res.why);
  var notYet = U.transfer(G, sys, bd.at - 60, r, null);
  check('and before her tank goes there is nothing to answer', !notYet.ok);
})();

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
