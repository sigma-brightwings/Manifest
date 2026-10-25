/* favours.test.js — step 4: debts, favours, friends and rivals, partners.
 *
 * Run: node test/favours.test.js
 */
'use strict';

var path = require('path');
var SRC = path.join(__dirname, '..', 'src');
global.window = global;
var V = require(path.join(SRC, 'vec3.js'));
require(path.join(SRC, 'kepler.js'));
var RNG = require(path.join(SRC, 'rng.js'));
require(path.join(SRC, 'economy.js'));
var Gen = require(path.join(SRC, 'generate.js'));
var Galaxy = require(path.join(SRC, 'galaxy.js'));
var Sim = require(path.join(SRC, 'sim.js'));
var Combat = require(path.join(SRC, 'combat.js'));
var Crew = require(path.join(SRC, 'crew.js'));
var Fleet = require(path.join(SRC, 'fleet.js'));
var Missions = require(path.join(SRC, 'missions.js'));
require(path.join(SRC, 'shiptrade.js'));
var Cap = require(path.join(SRC, 'captains.js'));
var Msg = require(path.join(SRC, 'messages.js'));
var Fav = require(path.join(SRC, 'favours.js'));
var Save = require(path.join(SRC, 'save.js'));

var pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail !== undefined ? '   ' + detail : '')); }
}
function section(n) { console.log('\n' + n); }

/* ---- fixtures (the same as captains.test.js) ------------------------------ */
var SEED = 'kawartha';
var galaxy = Galaxy.build(SEED);
var sysCache = {};
function systemFor(star) {
  if (!sysCache[star.id]) {
    sysCache[star.id] = Gen.generateSystem(star.seed,
      { faction: galaxy.factionById[star.factionId], allFactions: galaxy.factions });
    sysCache[star.id].starId = star.id;
  }
  return sysCache[star.id];
}
function busyStar() {
  for (var i = 0; i < galaxy.stars.length && i < 60; i++) {
    var sys = systemFor(galaxy.stars[i]);
    if ((sys.traffic || []).length >= 6 && (sys.patrols || []).length >= 1) return galaxy.stars[i];
  }
  return galaxy.home;
}
var STAR = busyStar();
function makeG() {
  var sys = systemFor(STAR);
  /* Each G gets a pristine timetable: recruiting suppresses routes. */
  (sys.traffic || []).forEach(function (r) { r.suppressed = false; r.joined = false; });
  sys._traffic = null; sys._ships = null;
  var planet = sys.bodies.filter(function (b) { return b.kind === 'planet'; })[0];
  var ship = Sim.circularOrbit(planet, sys, 0, planet.radius * 0.6, 0.1, 0);
  ship.credits = 5000; ship.cargo = {};
  Combat.initShip(ship);
  Sim.refreshShip(ship);
  ship.shipName = 'Brightwing'; ship.bornId = 'hull-A';
  return { seed: SEED, ship: ship, sys: sys, t: 0, galaxy: galaxy, here: STAR,
           standing: {}, wanted: {}, missions: [], doneMissions: {}, captains: {}, fleet: [] };
}
function traderAt(G, i) {
  return Sim.trafficState(G.sys.traffic[i % G.sys.traffic.length], G.sys, G.t);
}
/* A trader whose friend and rival are both other traders, so their
 * contacts are easy to build. */
function tiedTrader(G) {
  for (var i = 0; i < G.sys.traffic.length; i++) {
    var c = traderAt(G, i), p = Cap.profile(G, G.sys, c);
    if (p && p.role === 'trade' && p.friend && p.rival &&
        /\/r\d+$/.test(p.friend) && /\/r\d+$/.test(p.rival)) return c;
  }
  return null;
}
function contactForKey(G, key) {
  var id = key.split('/')[1];
  for (var i = 0; i < G.sys.traffic.length; i++) {
    if (G.sys.traffic[i].id === id) return Sim.trafficState(G.sys.traffic[i], G.sys, G.t);
  }
  return null;
}

/* ---- wiring --------------------------------------------------------------- */
section('wiring');
check('Captains.addDebt is Favours.addDebt', Cap.addDebt === Fav.addDebt);
check('Captains._afterRecord is installed', Cap._afterRecord === Fav.afterRecord);

/* ---- debts ---------------------------------------------------------------- */
section('debts');
(function () {
  var G = makeG(), c = traderAt(G, 0);
  check('a stranger owes nothing', Fav.debtOf(G, G.sys, c) === 0);
  Fav.addDebt(G, G.sys, c, 1, 0, 'saved');
  check('a rescue puts her in your debt', Fav.debtOf(G, G.sys, c) === 1);
  for (var i = 0; i < 10; i++) Fav.addDebt(G, G.sys, c, 1, 0, null);
  check('debt is clamped', Fav.debtOf(G, G.sys, c) === Fav.DEBT_MAX, Fav.debtOf(G, G.sys, c));
  for (i = 0; i < 20; i++) Fav.addDebt(G, G.sys, c, -1, 0, null);
  check('and clamped the other way', Fav.debtOf(G, G.sys, c) === -Fav.DEBT_MAX);
})();

/* ---- friends and rivals --------------------------------------------------- */
section('friends and rivals');
(function () {
  var G = makeG(), c = tiedTrader(G);
  check('found a trader with a friend and a rival', !!c);
  if (!c) return;
  var p = Cap.profile(G, G.sys, c);
  var friend = contactForKey(G, p.friend), rival = contactForKey(G, p.rival);
  var before = Cap.opinion(G, G.sys, friend).score;
  Cap.record(G, G.sys, c, 'robbed', 10, null);
  var fm = G.captains[p.friend], rm = G.captains[p.rival];
  check('her friend heard about it', fm && fm.heard < 0, fm && fm.heard);
  check('…as near-first-hand testimony', fm && fm.log && fm.log[0].k === 'friendTold' && fm.log[0].f === p.name);
  check('her friend has not SEEN you', fm && !fm.seen);
  var after = Cap.opinion(G, G.sys, friend).score;
  check('the friend thinks less of you', after < before, before + ' -> ' + after);
  check('…weighted above the public record (more than one robbery on the books)',
        before - after > 0.8 * 1.15, (before - after).toFixed(2));
  check('her rival is not sorry', rm && rm.heard > 0 && rm.log[0].k === 'rivalHurt');
  var g = Cap.speak(G, G.sys, friend, 20);
  check('the friend says so, by name', g && g.text.indexOf(p.name) >= 0, g && g.text);

  /* And the other way. */
  var G2 = makeG(), c2 = tiedTrader(G2), p2 = Cap.profile(G2, G2.sys, c2);
  Cap.record(G2, G2.sys, c2, 'rescued', 10, { stakes: ['crew', 'ship'] });
  check('save her and her friend warms to you', G2.captains[p2.friend].heard > 0 &&
        G2.captains[p2.friend].log[0].k === 'friendSaved');
  check('…and her rival grows suspicious', G2.captains[p2.rival].heard < 0 &&
        G2.captains[p2.rival].log[0].k === 'rivalHelped');
  var rg = Cap.speak(G2, G2.sys, contactForKey(G2, p2.rival), 20);
  check('the rival names who you helped', rg && rg.text.indexOf(p2.name) >= 0, rg && rg.text);

  /* A told message is not news worth passing on. */
  var G3 = makeG(), c3 = tiedTrader(G3), p3 = Cap.profile(G3, G3.sys, c3);
  Cap.record(G3, G3.sys, c3, 'told', 10, { q: 'hello' });
  check('chat does not travel', !G3.captains[p3.friend]);

  /* Killing her: the friend knows whose guns. */
  var G4 = makeG(), c4 = tiedTrader(G4), p4 = Cap.profile(G4, G4.sys, c4);
  Fav.died(G4, G4.sys, c4, 50);
  var km = G4.captains[p4.friend];
  check('kill a captain and her friend knows', km && km.heard <= -6 && km.log[0].k === 'killedFriend');
  var kg = Cap.speak(G4, G4.sys, contactForKey(G4, p4.friend), 60);
  check('…and greets you with it', kg && /dead|killed/i.test(kg.text), kg && kg.text);
  check('…coldly', ['cold', 'angry', 'furious'].indexOf(kg.band) >= 0, kg.band);
})();

/* ---- calling in a favour -------------------------------------------------- */
section('calling in a favour');
(function () {
  var G = makeG(), c = traderAt(G, 1);
  check('no favours from someone who owes nothing', Fav.favourOptions(G, G.sys, c, 0).length === 0);
  Cap.record(G, G.sys, c, 'rescued', 0, null);
  Fav.addDebt(G, G.sys, c, 2, 0, null);
  var opts = Fav.favourOptions(G, G.sys, c, 0);
  check('three favours on offer', opts.length === 3, opts.map(function (o) { return o.id; }).join(','));
  var mass = opts.filter(function (o) { return o.id === 'mass'; })[0];
  check('reaction mass needs you alongside, and says so', !mass.enabled && /within/.test(mass.note), mass.note);
  var said = [];
  var hooks = { say: function (m) { said.push(m); } };
  var r = Fav.callIn(G, G.sys, c, 'tip', 10, hooks);
  check('a tip-off is given', r.ok && said.length === 1, said[0]);
  check('…and costs one', Fav.debtOf(G, G.sys, c) === 1);
  /* Alongside, with room in the tanks. */
  G.ship.pos = V.clone(c.pos); G.ship.thrusterFuel = 1;
  var r2 = Fav.callIn(G, G.sys, c, 'mass', 11, hooks);
  check('mass passed across alongside', r2.ok && G.ship.thrusterFuel > 1, G.ship.thrusterFuel);
  check('…and now you are square', Fav.debtOf(G, G.sys, c) === 0 && /square/.test(said[said.length - 1]));
  check('square means no more favours', Fav.favourOptions(G, G.sys, c, 12).length === 0);
})();

/* ---- they call it in ------------------------------------------------------ */
section('they call it in');
(function () {
  function owedG() {
    var G = makeG(), c = traderAt(G, 2);
    Cap.record(G, G.sys, c, 'honest', 0, { log: 'cameForYou' });
    Fav.addDebt(G, G.sys, c, -1, 0, 'came for you');
    return { G: G, c: c };
  }
  function waitForAsk(G, c) {
    for (var h = 1; h < 80 && !G.favourAsk; h++) {
      G.t = h * 3600;
      var st = Sim.trafficState(c.route, G.sys, G.t);
      G.ship.pos = V.clone(st.pos);
      G._favourSlot = null;
      Fav.update(G.sys, G, G.t, null);
    }
    return G.favourAsk;
  }
  var a = owedG(), ask = waitForAsk(a.G, a.c);
  check('a captain you owe asks, sooner or later', !!ask, ask && Fav.askText(ask));
  if (!ask) return;
  check('the ask names her ship', ask.name === a.c.name);
  if (ask.kind === 'mass') a.G.ship.thrusterFuel = 20;
  var cr0 = a.G.ship.credits, mass0 = a.G.ship.thrusterFuel;
  var r = Fav.answerAsk(a.G, a.G.sys, true, a.G.t, null);
  check('giving it squares you', r.ok && Fav.debtOf(a.G, a.G.sys, a.c) === 0);
  check('…and it cost you', ask.kind === 'credits' ? a.G.ship.credits === cr0 - ask.amount
                                                  : a.G.ship.thrusterFuel < mass0);
  var m = Cap.resolve(a.G, a.G.sys, a.c).m;
  check('…and she remembers you came through', m.log.some(function (e) { return e.k === 'repaid'; }));

  var b = owedG(), ask2 = waitForAsk(b.G, b.c);
  var f0 = Cap.resolve(b.G, b.G.sys, b.c).m.feeling;
  Fav.answerAsk(b.G, b.G.sys, false, b.G.t, null);
  var mb = Cap.resolve(b.G, b.G.sys, b.c).m;
  check('refusing costs feeling', mb.feeling < f0, f0 + ' -> ' + mb.feeling);
  check('…and the debt stands', Fav.debtOf(b.G, b.G.sys, b.c) === -1);
  var gb = Cap.speak(b.G, b.G.sys, Sim.trafficState(b.c.route, b.G.sys, b.G.t), b.G.t + 10);
  check('…and she says so', gb && /favour|turned me down|answer/.test(gb.text), gb && gb.text);

  var x = owedG(), ask3 = waitForAsk(x.G, x.c);
  x.G.t = ask3.until + 1; x.G._favourSlot = null;
  Fav.update(x.G.sys, x.G, x.G.t, null);
  check('an ask that runs out is a no', !x.G.favourAsk &&
        Cap.resolve(x.G, x.G.sys, x.c).m.log.some(function (e) { return e.k === 'refused'; }));
})();

/* ---- going into business -------------------------------------------------- */
section('going into business');
(function () {
  var G = makeG(), c = null, i;
  for (i = 0; i < G.sys.traffic.length && !c; i++) {
    var t = traderAt(G, i), p = Cap.profile(G, G.sys, t);
    if (p && p.role === 'trade') c = t;
  }
  check('a stranger will not throw in with you', !!Fav.recruitRefusal(G, G.sys, c));
  Cap.record(G, G.sys, c, 'rescued', 0, { stakes: ['cargo', 'crew', 'ship'] });
  check('a grateful trader will', Fav.recruitRefusal(G, G.sys, c) === null,
        Fav.recruitRefusal(G, G.sys, c) + ' / ' + Cap.opinion(G, G.sys, c).band);
  var pat = G.sys.patrols[0];
  Cap.record(G, G.sys, pat, 'rescued', 0, null);
  check('a grateful patrol has a commission, not a ship', /commission/.test(Fav.recruitRefusal(G, G.sys, pat) || ''));
  var heardOffer = false;
  for (i = 0; i < 12; i++) {
    var gp = Cap.speak(G, G.sys, pat, 100 + i);
    if (gp && /fleetmate/.test(gp.text)) heardOffer = true;
  }
  check('…and never offers to go into business', !heardOffer);

  var said = [];
  var r = Fav.recruit(G, G.sys, c, 'partner', 200, { say: function (m) { said.push(m); } });
  check('partners: she joins the fleet', r.ok && G.fleet.length === 1 && G.fleet[0].partner);
  var rec = G.fleet[0];
  check('…as her own ship', rec.name === c.name && /Partners/.test(said[0]), said[0]);
  check('…with her in the chair, ready for orders', Fleet.pilotOf(rec) && Fleet.pilotOf(rec).name === Cap.profile(G, G.sys, c).name);
  check('…drawing no wage', Crew.dailyWage(Fleet.pilotOf(rec)) === 0);
  check('…and off her old lane', c.route.suppressed &&
        Sim.trafficAll(G.sys, 300).every(function (s) { return s.route !== c.route; }));
  check('the fleet list says whose she is', /50\/50/.test(Fleet.describe(rec, G.sys)), Fleet.describe(rec, G.sys));
  check('profit is split down the middle', Fav.partnerCut(G, rec, 1000) === 500 && rec.partner.earned === 500);
  check('she cannot be asked twice', /already/.test(Fav.recruitRefusal(G, G.sys, c) || ''));
  /* The timetable is regenerated with the system; G.joined puts her back in the fleet's keeping. */
  c.route.suppressed = false; c.route.joined = false; G.sys._traffic = null;
  Fav.applyJoined(G, G.sys);
  check('a regenerated timetable still leaves her off it', c.route.suppressed === true);
  var snap = Save.snapshot ? Save.snapshot(Object.assign({ ledgerLog: [] }, G)) : null;
  check('joined captains are saved', !snap || (snap.joined && snap.joined[rec.partner.key]));

  /* Delivery through a partner. */
  G.missions = [{ id: 'mx', carrier: rec.id, toPortId: 'P', type: 'cargo', cid: 'water', tonnes: 5, pay: 800 }];
  rec.cargo = { water: 5 };
  var cr0 = G.ship.credits;
  var lines = Missions.deliverByCarrier(G, rec, { id: 'P', name: 'Pier' }, 300);
  check('a delivery pays you half', G.ship.credits - cr0 === 400, lines[0]);

  /* Mistreatment. */
  check('a fresh partnership has no grievance', Fav.partnerGrievance(G, rec) === null);
  rec.partner.values = 'lawful';
  Cap.bumpRecord(G, 'piracy', 2);
  var why = Fav.partnerGrievance(G, rec);
  check('rob traders and a lawful partner objects', /robbed/.test(why || ''), why);
  rec.partner.values = 'profit';
  check('…a profit-first one does not', Fav.partnerGrievance(G, rec) === null);
  rec.arrears = 10 * Fleet.berthFee(rec);
  check('…until her berth fees go unpaid', /berth/.test(Fav.partnerGrievance(G, rec) || ''));
  var left = [];
  Fav.partnerLeaves(G, G.sys, rec, Fav.partnerGrievance(G, rec), 400, { say: function (m) { left.push(m); } });
  check('she leaves, with her ship', G.fleet.length === 0 && !G.joined[rec.partner.key] && /taken the/.test(left[0]), left[0]);
  check('…back to her lane', c.route.suppressed === false);
  var lm = Cap.memory(G, rec.partner.memKey);
  check('…and remembers why', lm.log.some(function (e) { return e.k === 'leftYou'; }));

  /* Crew. */
  var G2 = makeG(), c2 = null;
  for (i = 0; i < G2.sys.traffic.length && !c2; i++) {
    var t2 = traderAt(G2, i), p2 = Cap.profile(G2, G2.sys, t2);
    if (p2 && p2.role === 'trade') c2 = t2;
  }
  Cap.record(G2, G2.sys, c2, 'rescued', 0, null);
  var r2 = Fav.recruit(G2, G2.sys, c2, 'crew', 10, null);
  var mem = r2.member;
  check('crew: she comes aboard', r2.ok && G2.ship.crew.indexOf(mem) >= 0);
  check('…a skilled officer', mem.rating >= 4, mem.rating);
  check('…at a friend\'s wage', Crew.dailyWage(mem) < Crew.dailyWage(Crew.make('x', mem.role, mem.rating, 'x')),
        Crew.dailyWage(mem));
  check('…and her mate takes the ship home', c2.route.suppressed === true);
})();

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
