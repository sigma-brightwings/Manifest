/* fleet.test.js — the harbour master's book, and the bill he sends.
 *
 *     node test/fleet.test.js
 *
 * Astra, on what a ship you are not flying should cost: "yeah, it does
 * cost money to keep it, but it's just a modest charge every week, not
 * every day. The charge is no more than a full fuel tank of that ship, or
 * 1500 cr, whichever is less."
 *
 * Most of this file is that sentence pinned down, plus the two things it
 * needs to be true of the world it lands in: that the crew stay with the
 * hull they signed on to, and that a bill nobody can pay does something
 * other than nothing.
 *
 * Every check here is arithmetic on a plain object. Nothing boots, nothing
 * draws, and no seed is generated — a berth fee that needed a star system
 * to quote would be the bug this file exists to prevent.
 */
global.window = global;
var Eco = require('../src/economy.js');
var Combat = require('../src/combat.js');
var Fleet = require('../src/fleet.js');
var Crew = require('../src/crew.js');

var pass = 0, fail = 0;
function check(n, c, d) { if (c) pass++; else { fail++; console.log('  FAIL  ' + n + (d ? '   ' + d : '')); } }

var DAY = 86400, WEEK = Fleet.BERTH_WEEK;

function shipOf(hullId, credits, crew) {
  var s = {};
  Combat.initShip(s);
  s.hullId = hullId || 'talon';
  s.credits = credits == null ? 100000 : credits;
  s.crew = crew || [];
  s.cargo = {}; s.fit = {};
  return s;
}
function person(role, rating) { return Crew.make(role + rating, role, rating); }
function gameAt(t, ship, fleet) {
  return { t: t, ship: ship, fleet: fleet || [] };
}
function parked(hullId, t, crew, name) {
  var rec = Fleet.record(shipOf(hullId, 0, crew), 'p1', name || 'Kestrel');
  rec.berthTo = rec.wagesTo = t;
  rec.portName = 'Ivy Deep';
  return rec;
}

console.log('--- the fee is a tank of fuel, capped ---');
(function () {
  var base = Eco.BY_ID[Eco.FUEL_ID].base;
  check('the cap is the number Astra gave', Fleet.BERTH_CAP === 1500);
  check('and the week is a week', WEEK === 7 * DAY);

  /* THE WHOLE POINT OF THE RULE, checked against every hull the game has
   * rather than against the two I happened to think about. */
  Object.keys(Combat.HULLS).forEach(function (id) {
    var h = Combat.HULLS[id];
    var want = Math.min(1500, Math.round(h.fuelCap * base));
    check(id + ' is a tank of hydrogen or 1500, whichever is less',
          Fleet.berthFee({ hullId: id }) === want,
          Fleet.berthFee({ hullId: id }) + ' vs ' + want);
    check(id + ' is never charged more than the cap',
          Fleet.berthFee({ hullId: id }) <= 1500);
  });

  /* A bigger tank is a bigger berth, up to the ceiling — the reason the
   * fee is priced off fuel at all rather than being one flat number. */
  var ids = Object.keys(Combat.HULLS).sort(function (a, b) {
    return Combat.HULLS[a].fuelCap - Combat.HULLS[b].fuelCap;
  });
  var smallest = Fleet.berthFee({ hullId: ids[0] });
  var biggest = Fleet.berthFee({ hullId: ids[ids.length - 1] });
  check('the smallest tank pays less than the largest', smallest < biggest,
        ids[0] + ' ' + smallest + ' vs ' + ids[ids.length - 1] + ' ' + biggest);

  /* THE PRICE IS THE REFERENCE PRICE, not the local one — a berth six
   * jumps away has to be quotable without generating a star system. The
   * test for that is that the call takes no port and no clock. */
  check('quoting a berth needs nothing but the record',
        Fleet.berthFee({ hullId: 'talon' }) === Fleet.berthFee({ hullId: 'talon', port: 'anywhere' }));
})();

console.log('--- weekly, not daily, and remainders are carried ---');
(function () {
  var rec = parked('kestrel', 0);
  check('six days owes nothing', Fleet.berthDue(rec, 6 * DAY).cr === 0);
  check('seven days owes one week', Fleet.berthDue(rec, 7 * DAY).weeks === 1);
  check('twenty days owes two', Fleet.berthDue(rec, 20 * DAY).weeks === 2);

  /* A charge that rounded up would bill a captain twice for docking twice
   * on a Tuesday. The carried remainder is what stops it. */
  var r2 = parked('kestrel', 0);
  var a = Fleet.berthDue(r2, 10 * DAY);
  r2.berthTo = a.berthTo;
  var b = Fleet.berthDue(r2, 10 * DAY + 3600);
  check('settling twice in one afternoon charges once',
        a.weeks === 1 && b.weeks === 0, a.weeks + ' then ' + b.weeks);
  check('and the unpaid days are still there to be paid later',
        Fleet.berthDue(r2, 14 * DAY).weeks === 1);

  /* A ship parked a moment ago is not a ship with a century of back rent:
   * a record whose clock was never started starts it now. */
  var fresh = Fleet.record(shipOf('talon'), 'p1', 'New');
  check('a record with no clock is not in arrears',
        fresh.berthTo === null && Fleet.berthDue(fresh, 500 * DAY).cr === 0);
})();

console.log('--- wages run on the same kind of clock ---');
(function () {
  var two = [person('gunner', 3), person('pilot', 5)];
  var rate = Crew.dailyWage(two[0]) + Crew.dailyWage(two[1]);
  var due = Crew.payrollDue(two, 0, 10 * DAY);
  check('ten days is ten days of both wages', due.cr === rate * 10,
        due.cr + ' vs ' + rate * 10);
  check('half a day is nothing yet', Crew.payrollDue(two, 0, DAY / 2).cr === 0);

  /* THE CLOCK ADVANCES ON AN EMPTY DECK. Left behind, it would hand the
   * next hand to sign on a month of back pay they were not there for. */
  var empty = Crew.payrollDue([], 0, 30 * DAY);
  check('an empty deck owes nothing', empty.cr === 0);
  check('but its clock still moves', empty.paidTo === 30 * DAY, empty.paidTo);
})();

console.log('--- the bill, settled at the desk ---');
(function () {
  var s = shipOf('talon', 100000, [person('gunner', 3)]);
  s.wagesTo = 0;
  var rec = parked('kestrel', 0, [person('pilot', 4)]);
  var G = gameAt(14 * DAY, s, [rec]);
  var before = s.credits;
  var lines = Fleet.settle(G, G.t);

  /* Asserted before it is spent: if the record had lost her pilot on the
   * way into the book, the arithmetic below would be measuring a different
   * ship and the failure would read as a pricing bug. */
  check('the parked ship still has the hand she was parked with',
        rec.crew.length === 1, JSON.stringify(rec.crew));
  var wageMine = Crew.dailyWage(s.crew[0]) * 14;
  var wageHers = rec.crew.length ? Crew.dailyWage(rec.crew[0]) * 14 : 0;
  var berth = Fleet.berthFee(rec) * 2;
  check('everything owed came out of one pocket',
        before - s.credits === wageMine + wageHers + berth,
        (before - s.credits) + ' vs ' + (wageMine + wageHers + berth));
  check('and every part of it was said out loud', lines.length === 3, lines.join(' | '));
  check('the clocks moved with the money',
        s.wagesTo === 14 * DAY && rec.wagesTo === 14 * DAY && rec.berthTo === 14 * DAY);

  /* AND SETTLING AGAIN CHANGES NOTHING. Docking, undocking and docking
   * again is the most ordinary thing a player does. */
  var mid = s.credits;
  var again = Fleet.settle(G, G.t);
  check('settling the same instant twice is free',
        s.credits === mid && again.length === 0, again.join(' | '));

  /* THE BERTH YOU ARE STANDING ON IS NOT CHARGED. A port charges for
   * storage, not for visiting. */
  var solo = shipOf('kestrel', 50000, []);
  solo.wagesTo = 0;
  var G2 = gameAt(60 * DAY, solo, []);
  Fleet.settle(G2, G2.t);
  check('the ship under your hands pays no berthing', solo.credits === 50000);
})();

console.log('--- and a bill nobody can pay ---');
(function () {
  /* PEOPLE FIRST: the deck under your feet, then the decks you left, then
   * the harbour master. */
  var s = shipOf('talon', 0, [person('gunner', 3)]);
  s.wagesTo = 0;
  var G = gameAt(30 * DAY, s, []);
  var lines = Fleet.settle(G, G.t);
  check('a crew that cannot be paid leaves', s.crew.length === 0);
  check('and says so', /PAYROLL/.test(lines.join(' ')), lines.join(' | '));
  check('nobody is charged into the red', s.credits >= 0, s.credits);

  /* Unpaid berthing is a debt before it is a seizure, and the debt is
   * visible on the record so the fleet page can show it. */
  var s2 = shipOf('talon', 0, []);
  s2.wagesTo = 0;
  var rec = parked('kestrel', 0, []);
  var G2 = gameAt(21 * DAY, s2, [rec]);
  Fleet.settle(G2, G2.t);
  check('an unpaid week becomes arrears', rec.arrears === Fleet.berthFee(rec) * 3,
        rec.arrears);
  check('and she is still yours', Fleet.list(G2).length === 1);

  /* Until the arrears pass what she is worth. On a Kestrel that is well
   * over a year of never once paying, which is the warning the rule owes
   * the player before it takes a ship. */
  var weeks = Math.ceil(Fleet.resale(rec) / Fleet.berthFee(rec)) + 1;
  check('foreclosure is a long way off', weeks > 20, weeks + ' weeks');
  var G3 = gameAt(weeks * WEEK, s2, [rec]);
  Fleet.settle(G3, G3.t);
  check('but it does come', Fleet.list(G3).length === 0);
  check('and it pays out nothing', s2.credits === 0, s2.credits);

  /* A TEST THAT PASSES WITH THE FIX REVERTED IS NOT A TEST: if arrears
   * never accumulated, the hull would survive this forever. */
  var rec2 = parked('kestrel', 0, []);
  var s3 = shipOf('talon', 0, []);
  s3.wagesTo = 0;
  var G4 = gameAt(WEEK, s3, [rec2]);
  for (var w = 1; w <= weeks; w++) { G4.t = w * WEEK; Fleet.settle(G4, G4.t); }
  check('a week at a time gets to the same place', Fleet.list(G4).length === 0);
})();

console.log('--- the crew stay with the hull ---');
(function () {
  /* The bug this replaced: Fleet.record wrote `crew: []`, so keeping a
   * ship quietly dismissed everybody aboard her. */
  var s = shipOf('kestrel', 0, [person('pilot', 4), person('gunner', 2)]);
  var rec = Fleet.record(s, 'p1', 'Old Girl');
  check('a parked ship keeps her people', rec.crew.length === 2);
  check('and they are the same people', rec.crew[0].id === s.crew[0].id);
  check('a ship with a pilot aboard can be ordered', Crew.canBeOrdered(rec));

  /* Copied, not shared: paying somebody off aboard the new ship must not
   * reach into the roster of the one on the clamp. */
  s.crew.length = 0;
  check('the roster was copied, not borrowed', rec.crew.length === 2);
})();

console.log('--- standing orders: a timetable entry, not an agent ---');
(function () {
  var Gen = require('../src/generate.js');
  var Sim = require('../src/sim.js');

  /* A real system, because the leg is priced off two real ports about
   * their real common parent — the one thing here that cannot be a plain
   * object. Any seed with two ports will do; this one has several. */
  var sys = null, seed = null;
  for (var k = 0; k < 20 && !sys; k++) {
    var cand = Gen.generateSystem('orders-' + k);
    if (cand.ports && cand.ports.length >= 3) { sys = cand; seed = 'orders-' + k; }
  }
  check('found a system with three ports to run between', !!sys, seed);
  if (!sys) return;
  var A = sys.ports[0], B = sys.ports[1], Cp = sys.ports[2];
  var here = { id: 'star-x', name: 'Orders' };

  function ordered(crew, port) {
    var s = shipOf('talon', 0, crew);
    s.thrusterFuel = 10;
    var rec = Fleet.record(s, (port || A).id, 'Runner');
    rec.berthTo = rec.wagesTo = 0;
    rec.portName = (port || A).name; rec.star = here.id; rec.starName = here.name;
    return rec;
  }
  function game(t, fleet) {
    var G = gameAt(t, shipOf('talon', 100000, []), fleet);
    G.here = here; G.sys = sys;
    return G;
  }

  /* REFUSALS CARRY REASONS. */
  var noPilot = ordered([person('gunner', 3)]);
  var G0 = game(0, [noPilot]);
  var r0 = Fleet.canOrder(G0, noPilot, sys, B.id);
  check('a ship with nobody to helm her cannot be sent', !r0.ok && /helm/.test(r0.why), r0.why);
  var rec = ordered([person('pilot', 3)]);
  var G = game(1000, [rec]);
  check('same port is refused, in words', /already there/.test(Fleet.canOrder(G, rec, sys, A.id).why));
  check('a strange port is refused', /no such port/.test(Fleet.canOrder(G, rec, sys, 'nowhere').why));
  rec.arrears = 400;
  check('the harbour holds a hull in arrears', /400 cr/.test(Fleet.canOrder(G, rec, sys, B.id).why));
  rec.arrears = 0;
  var dry = ordered([person('pilot', 3)]); dry.thrusterFuel = 0;
  check('and an empty tank stays on the clamp', /reaction mass/.test(Fleet.canOrder(G, dry, sys, B.id).why));
  var elsewhere = ordered([person('pilot', 3)]); elsewhere.star = 'star-y'; elsewhere.starName = 'Far';
  check('a ship at another star cannot be ordered from here',
        /Far/.test(Fleet.canOrder(G, elsewhere, sys, B.id).why));

  /* THE ORDER, and what it puts on the timetable. */
  var q = Fleet.quote(G, rec, sys, B.id);
  check('a quote carries the crossing time', q.ok && q.cruise >= 600, JSON.stringify(q));
  var r = Fleet.order(G, rec, sys, B.id, G.t);
  check('the order is taken', r.ok && rec.order && rec.order.to === B.id);
  check('and she is not yet at the far end', rec.port === A.id);
  check('the arrival is when the quote said', r.arriveAt === G.t + q.cruise);
  check('and twice is refused', /under way/.test(Fleet.order(G, rec, sys, Cp.id, G.t).why));

  var mine = sys.traffic.filter(function (x) { return x.kind === 'fleet'; });
  check('she is on the traffic list, once', mine.length === 1, mine.length);
  check('under her own name', mine[0].name === 'Runner');
  check('as a leg rather than a loop', mine[0].oneWay === true);
  check('wearing her own hull', mine[0].cls === Combat.HULLS.talon.mesh);

  /* A PURE FUNCTION OF THE CLOCK. Her position at any instant is the
   * arithmetic, and it is the same arithmetic whichever order the instants
   * are asked in — the same test the rest of the traffic passes. */
  var route = mine[0], t0 = rec.order.t0, cr = rec.order.cruise;
  var stA = Sim.trafficState(route, sys, t0 + 1);
  var stMid = Sim.trafficState(route, sys, t0 + cr * 0.5);
  var stB = Sim.trafficState(route, sys, t0 + cr + 10);
  check('she leaves from her clamp', stA.from.id === A.id && stA.to.id === B.id && stA.phase !== 'moored');
  check('mid-crossing she is under way', !stMid.landed && stMid.phase !== 'moored', stMid.phase);
  check('past the cruise she is moored at the far end', stB.phase === 'moored' && stB.to.id === B.id, stB.phase);
  var stLate = Sim.trafficState(route, sys, t0 + cr * 5);
  check('and stays there — no return leg', stLate.phase === 'moored' && stLate.to.id === B.id && stLate.outbound,
        stLate.phase + ' ' + (stLate.to && stLate.to.id));
  var stBefore = Sim.trafficState(route, sys, t0 - 500);
  check('before the order she had not left', stBefore.progress === 0 && stBefore.from.id === A.id);

  /* A BETTER PILOT FLIES A FASTER TIMETABLE. The first thing the rating
   * on the card has ever bought. */
  var ace = ordered([person('pilot', 5)]);
  var slow = ordered([person('pilot', 1)]);
  var qa = Fleet.quote(game(0, [ace]), ace, sys, B.id);
  var qs = Fleet.quote(game(0, [slow]), slow, sys, B.id);
  check('an exceptional pilot is quicker than a green one', qa.cruise < qs.cruise, qa.cruise + ' vs ' + qs.cruise);
  /* And slower than the torch could manage: she keeps the traffic's rhythm. */
  check('nobody flies her at the stop', Fleet.orderAccel(ace) < Combat.HULLS.talon.thrustKN / Fleet.massOf(ace) / 1000);

  /* ARRIVAL IS A TIMESTAMP. Not a frame, not a step: skip the whole
   * crossing in one jump and she is alongside at exactly the right moment
   * with the book updated and the timetable cleared. */
  var early = Fleet.tick(G, sys, t0 + cr - 1);
  check('a second early she is still under way', early.length === 0 && !!rec.order);
  var lines = Fleet.tick(G, sys, t0 + cr);
  check('on the instant she is alongside', lines.length === 1 && /alongside/.test(lines[0]), lines.join('|'));
  check('the book has her at the new port', rec.port === B.id && rec.portName === B.name && !rec.order);
  check('her berth clock restarts on arrival', rec.berthTo === t0 + cr);
  check('and she is off the timetable', !sys.traffic.some(function (x) { return x.kind === 'fleet'; }));
  check('with her pilot still aboard, ready for the next one', Crew.canBeOrdered(rec));
  check('ticking again does nothing', Fleet.tick(G, sys, t0 + cr + 5000).length === 0);

  /* NO BERTH BILL WHILE UNDER WAY. A port charges for storage. */
  var rec2 = ordered([person('pilot', 3)]);
  var G2 = game(0, [rec2]);
  Fleet.order(G2, rec2, sys, B.id, 0);
  var creds = G2.ship.credits;
  G2.ship.wagesTo = 0;
  G2.t = 3 * WEEK;
  Fleet.settle(G2, G2.t);
  var wages = Crew.dailyWage(rec2.crew[0]) * 21;
  check('three weeks under way is three weeks of wages and no rent',
        creds - G2.ship.credits === wages, (creds - G2.ship.credits) + ' vs ' + wages);
  Fleet.tick(G2, sys, G2.t);

  /* SHE CAN BE ORDERED ON, from where she now is. */
  var on = Fleet.order(G2, rec2, sys, Cp.id, G2.t);
  check('and sent on from the new port', on.ok && rec2.order.from === B.id, JSON.stringify(on));
  Fleet.tick(G2, sys, G2.t);
  check('the new leg is the one on the list',
        sys.traffic.filter(function (x) { return x.kind === 'fleet'; }).length === 1 &&
        sys.traffic.filter(function (x) { return x.kind === 'fleet'; })[0].from === B.id);
  Fleet.tick(G2, sys, G2.t + rec2.order.cruise);

  /* THE ROUTE IS NOT IN THE SAVE. A record goes into the slot whole. */
  var rec3 = ordered([person('pilot', 3)]);
  var G3 = game(0, [rec3]);
  Fleet.order(G3, rec3, sys, B.id, 0);
  var json = JSON.stringify(rec3);
  check('the record carries the order and nothing else', /"order"/.test(json) && !/_leg|"cls"/.test(json));
  check('and rebuilding from the save puts her back on the list',
        (function () {
          var copy = JSON.parse(json);
          var G4 = game(100, [copy]);
          Fleet.tick(G4, sys, 100);
          var live = sys.traffic.filter(function (x) { return x.kind === 'fleet'; });
          return live.length === 1 && live[0].fleetId === copy.id;
        })());
  Fleet.tick(game(1e9, []), sys, 1e9);
  check('and nothing of yours lingers on a system you own nothing in',
        !sys.traffic.some(function (x) { return x.kind === 'fleet'; }));

  console.log('--- contracts across the clamp ---');
  var Missions = require('../src/missions.js');
  function haul(id, toPort, cid, tonnes, pay, extra) {
    var m = { id: id, type: 'haul', cid: cid, tonnes: tonnes, souls: 0,
              toPortId: toPort.id, toName: toPort.name, faction: 'f', pay: pay,
              deadline: 1e9, text: 'haul ' + id };
    for (var k in (extra || {})) m[k] = extra[k];
    return m;
  }
  function passage(id, toPort, souls, pay) {
    return { id: id, type: 'passage', cid: null, tonnes: 0, souls: souls,
             toPortId: toPort.id, toName: toPort.name, faction: 'f', pay: pay,
             deadline: 1e9, text: 'passage ' + id };
  }

  /* You, docked at A with freight and people aboard; her, on the same
   * clamp with a pilot, a hab unit and room. */
  var me = shipOf('kestrel', 1000, []);
  me.docked = A.id; me.cargo = { grain: 12 }; me.cargoCap = 60; me.seats = 6; me.passengers = 3;
  var her = ordered([person('pilot', 3)]);
  her.fit = { internal0: 'habunit' };
  var Gc = { t: 0, ship: me, fleet: [her], here: here, sys: sys,
             missions: [haul('h1', B, 'grain', 12, 900), passage('p1', B, 3, 1200),
                        haul('h2', Cp, 'ore', 5, 300), haul('h3', B, 'grain', 1, 50, { campaign: true }),
                        haul('h4', B, 'grain', 1, 50, { toStarId: 'star-far' })] };
  var h1 = Gc.missions[0], p1 = Gc.missions[1], h2 = Gc.missions[2], h3 = Gc.missions[3], h4 = Gc.missions[4];

  var capB = Fleet.capacityOf(her);
  check('a hab unit gives her berths and costs her hold',
        capB.seats === 4 && capB.cargoCap === Combat.HULLS.talon.cargoCap - 8, JSON.stringify(capB));
  check('bonded tonnes count against YOUR hold before the move',
        Missions.bondedTonnes(Gc, 'grain') === 14);

  /* Refusals, in words. */
  check('the freight has to be in your hold', /not in your hold/.test(Missions.loadRefusal(Gc, her, h2, A)));
  check('a chapter of a story stays with you', /yourself/.test(Missions.loadRefusal(Gc, her, h3, A)));
  check('a run that leaves the system is refused', /cannot jump/.test(Missions.loadRefusal(Gc, her, h4, A)));
  check('not from a different clamp', /same clamp/.test(Missions.loadRefusal(Gc, her, h1, B)));
  var big = passage('p9', B, 5, 1);
  check('and the berths are counted', /berths/.test(Missions.loadRefusal(Gc, her, big, A)));

  /* The move. */
  var l1 = Missions.loadOnto(Gc, her, h1, A);
  check('the haul goes across', l1.ok && h1.carrier === her.id, JSON.stringify(l1));
  check('the freight left your hold', !me.cargo.grain);
  check('and is in hers', her.cargo.grain === 12);
  check('the bond moved with it — only the two tonnes still with you count',
        Missions.bondedTonnes(Gc, 'grain') === 2 && Missions.bondHolder(Gc, 'grain') === h3);
  var l2 = Missions.loadOnto(Gc, her, p1, A);
  check('the passengers go across', l2.ok && her.passengers === 3 && me.passengers === 0, JSON.stringify(l2));
  check('twice is refused', /already aboard/.test(Missions.loadRefusal(Gc, her, h1, A)));

  /* DOCKING AT THE DESTINATION AHEAD OF HER SETTLES NOTHING. */
  var said = [];
  Missions.completeAtDock(Gc, B, sys, 0, { say: function (t) { said.push(t); } });
  check('the desk does not nag you for freight she is carrying',
        Gc.missions.length === 5 && !said.some(function (x) { return /12t/.test(x); }), said.join('|'));

  /* And back, while she is still on the clamp. */
  var u = Missions.unloadFrom(Gc, her, p1, A);
  check('people come back aboard you', u.ok && me.passengers === 3 && her.passengers === 0 && !p1.carrier);
  Missions.loadOnto(Gc, her, p1, A);

  /* SHE IS SENT, AND THE HARBOUR TAKES DELIVERY. */
  var od = Fleet.order(Gc, her, sys, B.id, 0);
  check('she can be sent with the contracts aboard', od.ok);
  check('the channel knows who is aboard', Fleet.routeFor(her).souls === 3);
  check('and what', Fleet.routeFor(her).out[0].cid === 'grain');
  check('you cannot unload a ship under way', /under way/.test(Missions.unloadRefusal(Gc, her, h1, A)));
  var credits = me.credits, st0 = Missions.standing(Gc, 'f');
  var arrive = Fleet.tick(Gc, sys, od.arriveAt);
  check('on arrival the fee lands wherever you are',
        me.credits === credits + 900 + 1200, me.credits - credits);
  check('both contracts are closed', Gc.missions.length === 3 && Gc.doneMissions.h1 && Gc.doneMissions.p1);
  check('her hold and berths are empty of them', !her.cargo.grain && her.passengers === 0);
  check('standing moved', Missions.standing(Gc, 'f') > st0);
  check('and it was all said', arrive.length === 3 &&
        arrive.some(function (x) { return /delivered/.test(x); }) &&
        arrive.some(function (x) { return /Passage ends/.test(x); }), arrive.join(' | '));

  /* A LATE PASSAGE PAYS LESS on her exactly as it would on you. */
  var late = passage('p2', Cp, 2, 1000);
  late.deadline = 10;
  me.passengers = 2; me.docked = B.id;
  Gc.missions.push(late);
  Missions.loadOnto(Gc, her, late, B);
  var od2 = Fleet.order(Gc, her, sys, Cp.id, 100);
  var c2 = me.credits;
  Fleet.tick(Gc, sys, od2.arriveAt);
  check('late on her is late', me.credits - c2 === 600, me.credits - c2);

  /* SHE ARRIVES WITHOUT IT: the contract stands, and says so. */
  var gone = haul('h5', A, 'ore', 4, 500);
  me.cargo.ore = 4; me.docked = Cp.id;
  Gc.missions.push(gone);
  Missions.loadOnto(Gc, her, gone, Cp);
  var od3 = Fleet.order(Gc, her, sys, A.id, 200);
  delete her.cargo.ore;                                  // robbed on the way, say
  var c3 = me.credits;
  var l3 = Fleet.tick(Gc, sys, od3.arriveAt);
  check('no freight, no fee', me.credits === c3 && Gc.missions.indexOf(gone) >= 0);
  check('and the log says why', l3.some(function (x) { return /unmet/.test(x); }), l3.join(' | '));

  /* A PASSAGE THAT EXPIRES ABOARD HER puts them off HER. */
  me.passengers = 0; her.passengers = 2;
  var stale = passage('p3', B, 2, 10); stale.deadline = 0; stale.carrier = her.id;
  Gc.missions.push(stale);
  Missions.update(Gc, 1e7, {});
  check('abandoned passengers leave her berths, not yours', her.passengers === 0 && me.passengers === 0);

  /* KEEPING A HULL KEEPS ITS CONTRACTS. buyHull(keep) hands the hold and
   * the berths to the record, so the contracts riding in them go too. */
  var Sim2 = require('../src/sim.js');
  var buyer = shipOf('talon', 500000, [person('pilot', 2)]);
  buyer.docked = A.id; buyer.cargo = { grain: 6 }; buyer.passengers = 0;
  var Gk = { t: 0, ship: buyer, fleet: [], here: here, sys: sys,
             missions: [haul('k1', B, 'grain', 6, 100)] };
  var bought = Combat.buyHull(Gk, 'kestrel', true);
  check('the kept hull is in the book', bought.ok && Gk.fleet.length === 1, JSON.stringify(bought));
  check('with the contract marked as hers', Gk.missions[0].carrier === Gk.fleet[0].id);
  check('and the freight in her hold', Gk.fleet[0].cargo.grain === 6 && !buyer.cargo.grain);
  Fleet.tick(game(1e9, []), sys, 1e9);

  console.log('--- the crossing costs reaction mass: a burn out and a burn in ---');
  var full = ordered([person('pilot', 3)]); full.thrusterFuel = 16;
  var farPort = sys.ports.filter(function (p) { return p.id !== A.id; }).sort(function (x, y) {
    return Fleet.quote(game(0, [full]), full, sys, y.id).cruise - Fleet.quote(game(0, [full]), full, sys, x.id).cruise;
  })[0];
  var qf = Fleet.quote(game(0, [full]), full, sys, farPort.id);
  check('a quote says what the leg burns', qf.ok && qf.fuel > 0, JSON.stringify(qf));
  check('a long leg is charged for two burns, not the coast between',
        Math.abs(qf.burning - 2 * Fleet.ORDER_BURN_LEG) < 1e-9 && qf.cruise > qf.burning, qf.burning + ' of ' + qf.cruise);
  check('at the pilot\'s throttle off the same drive the player burns',
        Math.abs(qf.fuel - Fleet.burnRate(full) * (qf.accel / (Combat.HULLS.talon.thrustKN / Fleet.massOf(full) / 1000)) * qf.burning) < 1e-9);
  check('and a tank is good for many legs, not one', qf.fuel * 10 < 16, qf.fuel);
  var qb = Fleet.quote(game(0, [full]), full, sys, B.id);
  check('a short hop is charged for its own length when that is less', qb.burning <= qb.cruise + 1e-9 && qb.fuel <= qf.fuel + 1e-9);
  var Gf = game(0, [full]);
  var before = full.thrusterFuel;
  var of = Fleet.order(Gf, full, sys, farPort.id, 0);
  check('the mass is spent at the clamp', of.ok && Math.abs(before - full.thrusterFuel - of.order.fuel) < 1e-9,
        before + ' -> ' + full.thrusterFuel);
  Fleet.tick(Gf, sys, of.arriveAt);
  var dry = ordered([person('pilot', 3)]); dry.thrusterFuel = 0.01;
  var od = Fleet.order(game(0, [dry]), dry, sys, farPort.id, 0);
  check('a leg the tank cannot cover is refused with both numbers',
        !od.ok && /needs .* t of reaction mass, she has/.test(od.why), od.why);
  check('and the quote says the same', /needs/.test(Fleet.quote(game(0, [dry]), dry, sys, farPort.id).why || ''));

  console.log('--- passengers look at her manifest too ---');
  var dirtyRec = ordered([person('pilot', 3)]);
  dirtyRec.fit = { internal0: 'habunit' };
  dirtyRec.cargo = { narcotics: 2 };
  var meP = shipOf('kestrel', 1000, []); meP.docked = A.id; meP.seats = 6; meP.passengers = 2;
  var Gp = { t: 0, ship: meP, fleet: [dirtyRec], here: here, sys: sys, standing: {}, wanted: {},
             missions: [passage('pd', B, 2, 500)] };
  Gp.missions[0].faction = (sys.factions && sys.factions[0] && sys.factions[0].id) || 'f';
  var whyP = Missions.loadRefusal(Gp, dirtyRec, Gp.missions[0], A);
  var sev = Combat.contrabandSeverity ? Combat.contrabandSeverity(Gp, 'narcotics', Gp.missions[0].faction) : 0;
  check('nobody boards a ship of yours over contraband, by that flag\'s law',
        sev > 0 ? /saw her manifest/.test(whyP) : whyP === null, whyP + ' (sev ' + sev + ')');

  console.log('--- raising the bridge ---');
  var rep = ordered([person('pilot', 4)]);
  rep.cargo = { grain: 5 }; rep.passengers = 0; rep.thrusterFuel = 12;
  var Gr = game(0, [rep]);
  var line0 = Fleet.report(Gr, rep, 0);
  check('on the clamp she reports the clamp', /on the clamp/.test(line0) && /5 t aboard/.test(line0) && /grain/.test(line0), line0);
  var orr = Fleet.order(Gr, rep, sys, B.id, 0);
  var line1 = Fleet.report(Gr, rep, 100);
  check('under way she reports the leg and the time', new RegExp('for ' + B.name).test(line1) && /alongside in/.test(line1), line1);
  check('with the pilot\'s name on it', line1.indexOf(rep.crew[0].name) >= 0);
  Fleet.tick(Gr, sys, orr.arriveAt);
})();

console.log('');
console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
