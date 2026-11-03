/* tradingfirm.test.js — the import/export house on the concourse (2026-11-03).
 *
 *     node test/tradingfirm.test.js
 *
 * Astra: "Is there a way for me to tell my fleet to go buy low and sell
 * high on commodities X, Y, Z etc, and actually give the ship a budget, if
 * it increases the budget, the captain stays on." — and "Trading firms
 * measure their traders by the quarter year."
 *
 * What this file pins down, in the order the brief gave it:
 *   - where a firm is, and what it is, is a pure function of the seed;
 *   - booking is idempotent and order-independent: one call or sixty, this
 *     hull first or that one, the accounts come out the same to the credit;
 *   - the account never goes below zero, and never touches your credits
 *     except by a deposit, a withdrawal, or the remittance that closes it;
 *   - a better house makes more money, over many seeds;
 *   - the quarterly review renews with its commission, or ends it;
 *   - hulls jump between stars on closed-form legs;
 *   - a save and a reload trade exactly as no reload would have;
 *   - and every refusal says why, in words.
 */
'use strict';
global.window = global;
var path = require('path');
var SRC = path.join(__dirname, '..', 'src');
['vec3', 'rng', 'slipspace', 'kepler', 'mining'].forEach(function (m) { require(path.join(SRC, m + '.js')); });
var Eco = require(path.join(SRC, 'economy.js'));
var Gen = require(path.join(SRC, 'generate.js'));
var Galaxy = require(path.join(SRC, 'galaxy.js'));
require(path.join(SRC, 'sim.js'));
var Combat = require(path.join(SRC, 'combat.js'));
var Crew = require(path.join(SRC, 'crew.js'));
var Fleet = require(path.join(SRC, 'fleet.js'));
require(path.join(SRC, 'tradeanalyser.js'));
var Journal = require(path.join(SRC, 'journal.js'));
var TF = require(path.join(SRC, 'tradingfirm.js'));
var Save = require(path.join(SRC, 'save.js'));

var pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail !== undefined ? '   ' + detail : '')); }
}
var DAY = 86400, Q = TF.QUARTER, T0 = 10 * DAY;

/* ---- a world ------------------------------------------------------------
 * A galaxy, its home system, the most developed civilian port in it, and a
 * firm there whose numbers the test may override. Each world has its own
 * system cache, so two worlds never share a market; `use()` points Fleet's
 * systemFor at this world's before anything is booked. */
function world(seed, opt) {
  opt = opt || {};
  var gal = Galaxy.build(seed), home = gal.home, cache = {};
  var sysFor = function (st) {
    if (!cache[st.id]) { cache[st.id] = Gen.generateSystem(st.seed, Galaxy.systemOpts(gal, st)); cache[st.id].starId = st.id; }
    return cache[st.id];
  };
  var sys = sysFor(home);
  var port = sys.ports.filter(function (p) { return TF.civilian(p, sys); })
    .sort(function (a, b) { return b.market.dev - a.market.dev || (a.id < b.id ? -1 : 1); })[0];
  var ship = { credits: opt.credits == null ? 500000 : opt.credits, cargo: {}, pos: { x: 0, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 },
               fwd: { x: 1, y: 0, z: 0 }, up: { x: 0, y: 0, z: 1 }, right: { x: 0, y: 1, z: 0 } };
  Combat.initShip(ship);
  ship.credits = opt.credits == null ? 500000 : opt.credits;
  var G = { seed: seed, t: T0, galaxy: gal, here: home, sys: sys, ship: ship, fleet: [], visited: {}, charted: {},
            standing: {}, wanted: {}, missions: [], doneMissions: {} };
  var firm = port ? TF.statsFor('test|' + seed, port) : null;
  if (firm && opt.rating) { firm.rating = opt.rating; firm.commission = TF.COMMISSION[opt.rating]; firm.minAccount = TF.MIN_ACCOUNT[opt.rating]; }
  if (firm && opt.capacity) firm.capacity = opt.capacity;
  if (firm && opt.minAccount !== undefined) firm.minAccount = opt.minAccount;
  var w = { G: G, gal: gal, home: home, sys: sys, port: port, firm: firm, cache: cache, sysFor: sysFor,
            use: function () { Fleet.systemFor = sysFor; return w; } };
  w.hull = function (id, hullId, pilotRating, at) {
    var s = {}; Combat.initShip(s);
    s.hullId = hullId || 'talon'; s.cargo = {}; s.fit = {};
    s.crew = pilotRating ? [Crew.make('Pilot ' + id, 'pilot', pilotRating)] : [];
    var rec = Fleet.park(G, s, (at || port).id, id);
    rec.id = id;                          // Fleet.record's id is off Game.t, absent here
    rec.portName = (at || port).name;
    rec.fuel = Combat.HULLS[rec.hullId].fuelCap;
    return rec;
  };
  return w.use();
}

/* Everything the firm's book is, as one string: the accounts, the hulls by
 * id, and the footprint. Two worlds that agree on this agree on the lot. */
function digest(w) {
  var G = w.G;
  var cs = TF.contracts(G).map(function (c) {
    return [c.firmKey, Math.round(c.cash), c.owed, c.legs, c.jumps || 0, c.qNo, Math.round(c.qStart), c.closed,
            JSON.stringify(c.history), JSON.stringify(c.log)];
  });
  var hs = Fleet.list(G).slice().sort(function (a, b) { return a.id < b.id ? -1 : 1; }).map(function (r) {
    return [r.id, r.port, r.star, JSON.stringify(r.cargo), JSON.stringify(r.trade)];
  });
  var foot = G.firms ? G.firms.foot : {};
  var fk = Object.keys(foot).sort().map(function (k) { return k + '=' + JSON.stringify(foot[k]); });
  return JSON.stringify([cs, hs, fk]);
}

/* ======================================================================== */
console.log('--- where the houses are, and what they are ---');
(function () {
  var w = world('kawartha');
  var a = [], b = [];
  w.sys.ports.forEach(function (p) { if (p.market) a.push(JSON.stringify(TF.firmAt(p, w.sys))); });
  var w2 = world('kawartha');
  w2.sys.ports.forEach(function (p) { if (p.market) b.push(JSON.stringify(TF.firmAt(p, w2.sys))); });
  check('the same seed places the same firms, with the same numbers', a.join() === b.join());
  check('and there is at least one house in kawartha\'s home system', a.some(function (x) { return x !== 'null'; }), a.length + ' ports');

  /* Never at a port that is not civilian. */
  var bad = 0, civ = 0, placed = 0, systems = 0;
  for (var s = 0; s < 8; s++) {
    var gal = Galaxy.build('seed' + s);
    gal.stars.filter(function (st) { return st.factionId; }).slice(0, 3).forEach(function (st) {
      var sys = Gen.generateSystem(st.seed, Galaxy.systemOpts(gal, st));
      systems++;
      sys.ports.forEach(function (p) {
        var f = TF.firmAt(p, sys);
        if (TF.civilian(p, sys)) civ++;
        if (f) { placed++; if (!TF.civilian(p, sys)) bad++; }
      });
    });
  }
  check('no house at a Navy or Syndicate port, a plant, a milfuel works or a carrier', bad === 0, bad);
  /* The measured rate is 1.34 a system (tools/measure-firms.cjs place 30).
   * Eight seeds is a small sample: this guards the order of magnitude. */
  check('about one house a system (0.5 to 2.5 over 24 sampled)', placed / systems > 0.5 && placed / systems < 2.5,
        (placed / systems).toFixed(2));

  /* The ladder: better houses cost more and ask more. */
  var lastC = 0, lastM = -1, ok = true;
  for (var r = 1; r <= 5; r++) {
    if (!(TF.COMMISSION[r] > lastC) || !(TF.MIN_ACCOUNT[r] >= lastM)) ok = false;
    lastC = TF.COMMISSION[r]; lastM = TF.MIN_ACCOUNT[r];
  }
  check('commission rises with rating, and so does the smallest account', ok);
  check('a top house will not open under 50,000', TF.MIN_ACCOUNT[5] === 50000);
  var st = TF.statsFor('x|y', w.port), st2 = TF.statsFor('x|y', w.port);
  check('a firm\'s stats are a function of its key', JSON.stringify(st) === JSON.stringify(st2) &&
        st.rating >= 1 && st.rating <= 5 && st.capacity >= 1 && st.capacity <= 5 && /&/.test(st.name), JSON.stringify(st));
})();

console.log('--- every refusal says why ---');
(function () {
  var w = world('kawartha', { rating: 5, capacity: 2, credits: 60000 });
  var G = w.G, f = w.firm, p = w.port, sys = w.sys;
  var ok = w.hull('h-ok', 'talon', 3), nop = w.hull('h-nopilot', 'talon', 0);
  function why(terms) { var r = TF.canEngage(G, f, p, sys, terms); return r.ok ? '' : r.why; }
  check('no house', /no trading house/.test(TF.canEngage(G, null, p, sys, {}).why));
  check('no ships', /at least one ship/.test(why({ hulls: [], budget: 50000 })));
  check('too many ships: their book is full', /book is full/.test(why({ hulls: ['a', 'b', 'c'], budget: 50000 })));
  check('no budget', /name a budget/.test(why({ hulls: [ok.id], budget: 0 })));
  check('a top house: "not worth our time under 50,000"', /Not worth our time under 50,000/.test(why({ hulls: [ok.id], budget: 20000 })),
        why({ hulls: [ok.id], budget: 20000 }));
  check('not enough credits', /you have 60,000 cr/.test(why({ hulls: [ok.id], budget: 100000 })), why({ hulls: [ok.id], budget: 100000 }));
  check('no pilot', /can helm her/.test(why({ hulls: [nop.id], budget: 50000 })));
  var away = w.hull('h-away', 'talon', 3);
  away.star = 'elsewhere'; away.starName = 'Faraway';
  check('a hull in another system', /has to be in this system/.test(why({ hulls: [away.id], budget: 50000 })), why({ hulls: [away.id], budget: 50000 }));
  var busy = w.hull('h-busy', 'talon', 3); busy.order = { toName: 'x' };
  check('a hull under way', /under way/.test(why({ hulls: [busy.id], budget: 50000 })));
  var work = w.hull('h-work', 'talon', 3); work.work = { siteName: 'Big Blue' };
  check('a working hull', /working Big Blue/.test(why({ hulls: [work.id], budget: 50000 })));
  var owe = w.hull('h-owe', 'talon', 3); owe.arrears = 900;
  check('a hull the harbour holds', /harbour holds/.test(why({ hulls: [owe.id], budget: 50000 })));
  var hers = w.hull('h-hers', 'talon', 3); hers.partner = { name: 'Maren' };
  check('a partner\'s ship', /Maren's ship/.test(why({ hulls: [hers.id], budget: 50000 })));
  var full = w.hull('h-full', 'talon', 3); full.cargo = { grain: 10 };
  check('a hull with cargo aboard', /unload her first/.test(why({ hulls: [full.id], budget: 50000 })));
  var contraband = Object.keys(Eco.BY_ID).filter(function (k) { return Eco.BY_ID[k].contraband; })[0];
  check('a contraband good on the list', /honest house/.test(why({ hulls: [ok.id], budget: 50000, goods: [contraband] })), contraband);
  check('no such ship', /no such ship/.test(why({ hulls: ['nobody'], budget: 50000 })));
  /* Every hull in the game has a hold today; the refusal is for one that
   * does not (a record whose hull is gone from the catalogue). */
  var nohold = JSON.parse(JSON.stringify(ok)); nohold.hullId = 'no-such-hull';
  check('a hull with no hold to trade with', /no hold to trade with/.test(TF.hullRefusal(G, nohold, f, G.here.id)));

  var r = TF.engage(G, f, p, sys, { hulls: [ok.id], budget: 50000 }, G.t);
  check('and with everything in order, it opens', r.ok && G.ship.credits === 10000, r.why);
  var c = r.contract;
  check('a second account with the same house is refused', /already hold an account/.test(why({ hulls: [ok.id], budget: 50000 })));
  check('a hull already trading is refused', /already trades for/.test(TF.hullRefusal(G, ok, f, G.here.id)));
  check('Fleet will not send a traded hull anywhere', /trades for .* stand her down/.test(Fleet.canOrder(G, ok, sys, 'x').why), Fleet.canOrder(G, ok, sys, 'x').why);
  check('nor set her to work', /trades for/.test(Fleet.planWork(G, ok, sys, 'x', 'sell').why));
  check('nor can you take command of her', /trading for a firm/.test(Combat.commandRefusal(G, ok, 'keep')));
  check('her hail says whose book she is on', /trading for /.test(Fleet.report(G, ok, G.t)), Fleet.report(G, ok, G.t));
  check('and the fleet list says she is trading', /trading/.test(Fleet.describe(ok, sys)));
  var other = sys.ports.filter(function (q) { return q !== p && q.market; })[0];
  check('withdrawals only at the office', /made at their office/.test(TF.canWithdraw(G, c, 100, other).why));
  check('not more than the cash', /holds 50,000 cr in cash/.test(TF.canWithdraw(G, c, 60000, p).why), TF.canWithdraw(G, c, 60000, p).why);
  check('not below the house\'s floor while open', /under 50,000 — close it instead/.test(TF.canWithdraw(G, c, 1, p).why), TF.canWithdraw(G, c, 1, p).why);
  check('a withdrawal of nothing', /name an amount/.test(TF.canWithdraw(G, c, 0, p).why));
  check('a deposit you cannot cover', /you have 10,000 cr/.test(TF.canDeposit(G, c, 20000).why), TF.canDeposit(G, c, 20000).why);
  var third = w.hull('h-3', 'talon', 3);
  check('adding a hull while there is room', TF.canAddHull(G, c, third).ok, TF.canAddHull(G, c, third).why);
  TF.addHull(G, c, third, G.t);
  var fourth = w.hull('h-4', 'talon', 3);
  check('and refused when the book is full', /book is full/.test(TF.canAddHull(G, c, fourth).why));
  TF.close(G, c, G.t);
  check('closing twice', /already closing|no open account/.test(TF.close(G, c, G.t).why || ''), TF.close(G, c, G.t).why);
  check('no account at all', /no open account/.test(TF.canDeposit(G, null, 5).why));
})();

console.log('--- booking is idempotent and order-independent ---');
(function () {
  function setup(reverse) {
    var w = world('kawartha', { rating: 4, capacity: 3, minAccount: 0 });
    var a = w.hull('h-a', 'talon', 3), b = w.hull('h-b', 'kestrel', 4);
    TF.engage(w.G, w.firm, w.port, w.sys, { hulls: [a.id, b.id], budget: 40000 }, T0);
    if (reverse) w.G.fleet.reverse();
    return w;
  }
  var END = T0 + 40 * DAY;
  var one = setup(false);
  TF.book(one.G, END);
  var d1 = digest(one);
  var again = TF.book(one.G, END);
  check('booking the same instant twice books nothing the second time', again.length === 0 && digest(one) === d1);

  var many = setup(false), credits0 = many.G.ship.credits, neg = 0, touched = 0;
  for (var t = T0; t <= END; t += 16 * 3600) {
    TF.book(many.G, t);
    TF.contracts(many.G).forEach(function (c) { if (c.cash < -1e-6) neg++; });
    if (many.G.ship.credits !== credits0) touched++;
  }
  TF.book(many.G, END);
  check('sixty calls book exactly what one call does', digest(many) === d1);
  check('the account is never below zero, at any instant booked', neg === 0, neg);
  check('and booking never touches your credits', touched === 0 && many.G.ship.credits === credits0);

  var rev = setup(true);
  TF.book(rev.G, END);
  check('the fleet list in the other order books the same', digest(rev) === d1);
  var c = TF.contracts(one.G)[0];
  check('and there was trading to agree about', c.legs > 3, c.legs + ' runs');
})();

console.log('--- the account and your credits ---');
(function () {
  var w = world('kawartha', { rating: 3, minAccount: 0, credits: 100000 });
  var G = w.G, h = w.hull('h-a', 'talon', 3);
  var r = TF.engage(G, w.firm, w.port, w.sys, { hulls: [h.id], budget: 30000 }, T0);
  var c = r.contract;
  check('opening moves the budget out of your credits, exactly', G.ship.credits === 70000 && c.cash === 30000);
  TF.book(G, T0 + 20 * DAY);
  var before = G.ship.credits;
  var d = TF.deposit(G, c, 5000, T0 + 20 * DAY);
  check('a deposit moves exactly its amount', d.ok && G.ship.credits === before - 5000);
  TF.book(G, T0 + 30 * DAY);
  var cash = TF.withdrawable(c);
  var take = Math.min(cash, 7000);
  var before2 = G.ship.credits;
  var wd = TF.withdraw(G, c, take, T0 + 30 * DAY, w.port);
  check('a withdrawal moves exactly its amount', wd.ok && G.ship.credits === before2 + take, wd.why);
  check('and the quarter knows what you moved', c.qFlows === 5000 - take);
  var prof = TF.profitAvailable(c);
  check('the profit is what is above what you put in, less what you took',
        prof === Math.max(0, Math.min(TF.withdrawable(c), Math.floor(c.cash - (c.deposited - c.withdrawn)))));
})();

console.log('--- a better house makes more money ---');
(function () {
  /* The measured direction (tools/measure-firms.cjs quarters 30 4: median
   * quarter 1.65M at rating 1 rising to 3.35M at rating 5, for a Talon on a
   * 20,000 budget). Here: six seeds, one quarter, ratings 1 and 5 on the
   * same seed, the same port and the same hull. */
  var lo = [], hi = [], mid = [];
  ['seed0', 'seed2', 'seed3', 'seed4', 'seed5', 'seed6'].forEach(function (s) {
    [1, 3, 5].forEach(function (r) {
      var w = world(s, { rating: r, minAccount: 0, capacity: 2 });
      if (!w.port) return;
      var h = w.hull('h-a', 'talon', 3);
      TF.engage(w.G, w.firm, w.port, w.sys, { hulls: [h.id], budget: 20000 }, T0);
      TF.book(w.G, T0 + Q + 1);
      var hist = TF.contracts(w.G)[0].history[0];
      (r === 1 ? lo : r === 3 ? mid : hi).push(hist ? hist.profit : 0);
    });
  });
  function mean(a) { return a.reduce(function (x, y) { return x + y; }, 0) / Math.max(1, a.length); }
  check('rating 5 out-earns rating 1, on average over six seeds', mean(hi) > mean(lo), Math.round(mean(lo)) + ' vs ' + Math.round(mean(hi)));
  check('and rating 3 sits between them', mean(mid) > mean(lo) && mean(mid) < mean(hi),
        [mean(lo), mean(mid), mean(hi)].map(Math.round).join(' / '));
  var wins = 0;
  for (var i = 0; i < lo.length; i++) if (hi[i] > lo[i]) wins++;
  check('rating 5 beats rating 1 on most seeds', wins >= Math.ceil(lo.length * 0.66), wins + '/' + lo.length);
})();

console.log('--- the quarterly review ---');
(function () {
  var w = world('kawartha', { rating: 3, minAccount: 0 });
  var G = w.G, h = w.hull('h-a', 'kestrel', 3);
  G.journal = [];
  var r = TF.engage(G, w.firm, w.port, w.sys, { hulls: [h.id], budget: 50000 }, T0);
  var c = r.contract;
  check('the first review is a quarter out, 91 days', c.nextReview === T0 + 91 * DAY);
  var lines = TF.book(G, T0 + Q);
  var e = c.history[0];
  check('a profitable quarter renews', e && e.verdict === 'renewed' && e.profit > 0, JSON.stringify(e));
  check('and the house takes its commission off the profit, rounded', e.commission === Math.round(e.profit * c.commission));
  check('the next quarter starts from the equity after commission', Math.abs(c.qStart - (e.end - e.commission)) <= 1 && c.qNo === 2);
  check('the review is said', lines.some(function (l) { return /quarter 1: \+.*renewed/.test(l); }), lines.join(' | '));
  check('and written in the journal', (G.journal || []).some(function (j) { return /quarter 1/.test(j.text); }));
  check('and the next is a quarter after that', c.nextReview === T0 + 2 * Q);

  /* A quarter that makes nothing: the pilot walks, the hull stands down
   * at her next decision, the account sits idle and the review drops it. */
  var w2 = world('kawartha', { rating: 3, minAccount: 0 });
  var G2 = w2.G, h2 = w2.hull('h-a', 'talon', 3);
  var c2 = TF.engage(G2, w2.firm, w2.port, w2.sys, { hulls: [h2.id], budget: 20000 }, T0).contract;
  h2.crew = [];
  var l1 = TF.book(G2, T0 + DAY);
  check('a hull whose pilot is gone stands down, and says why', !h2.trade && l1.some(function (l) { return /can helm her/.test(l); }), l1.join(' | '));
  var cr0 = G2.ship.credits;
  var l2 = TF.book(G2, T0 + Q);
  check('a quarter that did not grow the budget ends the account: you drop them',
        c2.history[0].verdict === 'dropped' && c2.closed && l2.some(function (l) { return /you drop them/.test(l); }), l2.join(' | '));
  check('and the balance is remitted to you, all of it', G2.ship.credits === cr0 + 20000, G2.ship.credits - cr0);

  /* A first-rank house with a small account at a loss drops YOU. */
  var w3 = world('kawartha', { rating: 5 });
  var G3 = w3.G, h3 = w3.hull('h-a', 'talon', 3);
  var c3 = TF.engage(G3, w3.firm, w3.port, w3.sys, { hulls: [h3.id], budget: 50000 }, T0).contract;
  h3.crew = [];
  var l3 = TF.book(G3, T0 + Q);
  check('a first-rank house drops a small losing account itself',
        c3.history[0].verdict === 'dropped-you' && l3.some(function (l) { return /they drop you/.test(l); }), l3.join(' | '));

  /* Closing mid-run: the hull finishes her leg, then the account remits. */
  var w4 = world('kawartha', { rating: 4, minAccount: 0 });
  var G4 = w4.G, h4 = w4.hull('h-a', 'kestrel', 3);
  var c4 = TF.engage(G4, w4.firm, w4.port, w4.sys, { hulls: [h4.id], budget: 60000 }, T0).contract;
  var tt = T0;
  while (!(h4.trade && h4.trade.phase === 'leg' && h4.trade.leg.cid) && tt < T0 + 20 * DAY) { tt += 3600; TF.book(G4, tt); }
  var arriveAt = h4.trade.leg.arrive, cr4 = G4.ship.credits;
  TF.close(G4, c4, tt);
  check('closing with a hull on a run waits for her', !c4.closed && !!c4.closing && !!h4.trade);
  TF.book(G4, arriveAt + 1);
  check('she sells on arrival, stands down, and the account remits', c4.closed && !h4.trade && G4.ship.credits > cr4 &&
        Math.abs(c4.cash) < 1e-6, (G4.ship.credits - cr4) + ' remitted');
})();

console.log('--- between the stars ---');
(function () {
  var w = world('seed0', { rating: 5, minAccount: 0 });
  var G = w.G, h = w.hull('h-a', 'talon', 3);
  var c = TF.engage(G, w.firm, w.port, w.sys, { hulls: [h.id], budget: 40000 }, T0).contract;
  var t = T0, jump = null;
  while (!jump && t < T0 + 2 * Q) {
    t += 6 * 3600;
    TF.book(G, t);
    if (h.trade && h.trade.phase === 'leg' && h.trade.leg.kind === 'jump') jump = h.trade.leg;
  }
  check('a top house sends a hull to another star', !!jump);
  if (jump) {
    var from = G.galaxy.stars.filter(function (s) { return s.id === jump.fromStar; })[0];
    var to = G.galaxy.stars.filter(function (s) { return s.id === jump.toStar; })[0];
    check('the leg is a real distance between two stars', jump.toStar !== jump.fromStar &&
          Math.abs(jump.ly - Galaxy.distance3(from, to)) < 1e-9);
    check('the corridor time is Galaxy.jumpSeconds, plus clearance and the cruise in', jump.jump > 0 && jump.inbound > 0 &&
          Math.abs(jump.arrive - (jump.depart + TF.DEPART + jump.jump + jump.inbound)) < 1e-6);
    check('the jump\'s hydrogen came out of the account', jump.fuelCr > 0);
    check('she carries cargo across', jump.qty > 0 && !!jump.cid);
    /* The player moves to another star; the hull's arrival is booked all
     * the same, through Fleet.systemFor. */
    G.here = G.galaxy.stars.filter(function (s) { return s.id !== jump.toStar && s.id !== jump.fromStar && s.factionId; })[0];
    G.sys = w.sysFor(G.here);
    TF.book(G, jump.arrive + 1);
    check('she arrives at the other star and is recorded there', h.star === jump.toStar && h.port === jump.to &&
          h.starName === to.name, h.star + ' ' + h.port);
    var sold = c.log[0] || '';
    check('and the sale there is on the account\'s log', sold.indexOf(jump.toName) >= 0 && /\(/.test(sold), sold);
    check('her in-system route is not drawn in a system she is not in', !TF.routeLeg(h, jump.arrive + 1) ||
          TF.routeLeg(h, jump.arrive + 1).kind === 'local');
  }
  check('and the account kept trading', c.legs > 2 && (c.jumps || 0) >= 1, c.legs + ' runs, ' + c.jumps + ' jumps');
})();

console.log('--- saved, and reloaded into a fresh world ---');
(function () {
  var mk = function () {
    var w = world('kawartha', { rating: 4, minAccount: 0, capacity: 2 });
    var a = w.hull('h-a', 'talon', 3), b = w.hull('h-b', 'kestrel', 2);
    TF.engage(w.G, w.firm, w.port, w.sys, { hulls: [a.id, b.id], budget: 45000, goods: [] }, T0);
    return w;
  };
  var A = mk();
  TF.book(A.G, T0 + 20 * DAY);
  var snap = JSON.parse(JSON.stringify(Save.snapshot(A.G)));
  check('the snapshot carries the trading houses', !!snap.firms && snap.firms.contracts.length === 1);
  check('and the hulls\' run state rides on their fleet records', snap.fleet.every(function (r) { return !!r.trade; }));
  /* A fresh world: new systems, no market dents, nothing but the save. */
  var B = world('kawartha', { rating: 4 });
  B.G.fleet = snap.fleet; B.G.firms = snap.firms; B.G.t = snap.t;
  TF.book(A.use().G, T0 + 60 * DAY);
  TF.book(B.use().G, T0 + 60 * DAY);
  check('a reload trades exactly as no reload would have', digest(A) === digest(B));
  /* An older save has no field at all. */
  var old = JSON.parse(JSON.stringify(snap)); delete old.firms;
  var C = world('kawartha');
  C.G.firms = (old.firms && typeof old.firms === 'object') ? old.firms : null;
  check('an older career has no accounts and books nothing', TF.book(C.G, T0 + Q).length === 0 && TF.contracts(C.G).length === 0);
})();

console.log('--- the economist ---');
(function () {
  var w = world('kawartha', { rating: 5 });
  var r1 = TF.reading(w.G, w.firm, w.port, w.sys, T0 + 5 * DAY);
  var r2 = TF.reading(w.G, w.firm, w.port, w.sys, T0 + 5 * DAY);
  check('a reading is deterministic', JSON.stringify(r1) === JSON.stringify(r2));
  check('with an empty hold it reads the port\'s exports', /exports/.test(r1.whose) && r1.rows.length > 0, r1.whose);
  check('each row names a place and a confidence', r1.rows.every(function (x) { return x.where && x.confidence > 0 && x.confidence <= 95; }));
  var lowF = JSON.parse(JSON.stringify(w.firm)); lowF.rating = 1;
  var rl = TF.reading(w.G, lowF, w.port, w.sys, T0 + 5 * DAY);
  check('a back-street house is less sure of itself', rl.rows[0].confidence < r1.rows[0].confidence,
        rl.rows[0].confidence + ' vs ' + r1.rows[0].confidence);
  /* A first-rank house reads the forecast: over its own horizon the rise
   * it calls at a port is the closed form's. */
  var x = r1.rows[0], port = w.sys.ports.filter(function (p) { return x.where.indexOf(p.name) === 0; })[0];
  if (port) {
    var then = Eco.quoteStock(port, x.cid, Eco.analyticStock(port, x.cid, T0 + 5 * DAY + TF.HORIZON)).sell;
    check('and a top house\'s three-day call is the closed form', Math.abs(Math.round(then) - x.then) <= 1, then + ' vs ' + x.then);
  }
})();

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
