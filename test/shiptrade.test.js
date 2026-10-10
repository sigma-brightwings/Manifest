/* shiptrade.test.js — buying and selling with a hailed ship.
 *
 * Pinned here, because each one would break silently:
 *
 *  - the record gates LAWFUL hulls only, and says why;
 *  - standing moves the price, both ways, and never far enough to make a
 *    ship a better deal than the ports it is flying between;
 *  - standing rises with deal size, carries fractions, and stops at the
 *    daily cap — and a reload cannot reset the cap;
 *  - rivals resent it: the law and the Syndicate across each other's
 *    space, and seeded empire rivalries, each landing on the right power;
 *  - a voyage remembers what it sold you WITHOUT touching the manifest
 *    every later voyage of the line reads — the bug this replaced;
 *  - contraband and contract freight stay where they belong;
 *  - rivalries are a pure function of the galaxy seed.
 *
 * Every fixture is a real generated system and a real timetabled ship,
 * found by searching rather than hand-built, so the faction ids, ports and
 * prices are the ones the game will actually hand the code.
 */
'use strict';

var path = require('path');
var SRC = path.join(__dirname, '..', 'src');
var V = require(path.join(SRC, 'vec3.js'));
require(path.join(SRC, 'kepler.js'));
require(path.join(SRC, 'rng.js'));
var Eco = require(path.join(SRC, 'economy.js'));
var Gen = require(path.join(SRC, 'generate.js'));
var Galaxy = require(path.join(SRC, 'galaxy.js'));
var Sim = require(path.join(SRC, 'sim.js'));
var Combat = require(path.join(SRC, 'combat.js'));
var Missions = require(path.join(SRC, 'missions.js'));
var ST = require(path.join(SRC, 'shiptrade.js'));

var pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail !== undefined ? '   ' + detail : '')); }
}
function section(n) { console.log('\n' + n); }

/* ---- fixtures ------------------------------------------------------------ */

var SEED = 'kawartha';
var galaxy = Galaxy.build(SEED);
var sysCache = {};
function systemFor(star) {
  if (!sysCache[star.id]) {
    sysCache[star.id] = Gen.generateSystem(star.seed,
      { faction: galaxy.factionById[star.factionId], allFactions: galaxy.factions });
  }
  return sysCache[star.id];
}

function makeG(star) {
  var sys = systemFor(star);
  var planet = sys.bodies.filter(function (b) { return b.kind === 'planet'; })[0];
  var ship = Sim.circularOrbit(planet, sys, 0, planet.radius * 0.6, 0.1, 0);
  ship.credits = 200000;
  ship.cargo = {};
  Combat.initShip(ship);
  Sim.refreshShip(ship);
  return { ship: ship, sys: sys, t: 0, galaxy: galaxy, here: star,
           standing: {}, wanted: {}, missions: [], doneMissions: {} };
}

/* A traffic contact parked beside the player, as the comms screen would
 * hand it over — from Sim.trafficState, so from/to/route/manifest are real. */
function contactOn(G, route, t) {
  var c = Sim.trafficState(route, G.sys, t);
  G.ship.pos = V.addScaled(V.clone(c.pos), { x: 1, y: 0, z: 0 }, 5);
  return c;
}

function loaded(c) {
  var n = 0;
  (c.manifest || []).forEach(function (m) {
    var com = Eco.BY_ID[m.cid];
    if (com && com.base > 0) n += (m.qty || 0);
  });
  return n;
}

/* The first (star, route, t) where a ship flies a flag matching `wantFlag`
 * in space matching `wantSpace`, carrying something buyable. */
function find(wantSpace, wantFlag) {
  for (var s = 0; s < galaxy.stars.length && s < 80; s++) {
    var star = galaxy.stars[s];
    var spaceFac = galaxy.factionById[star.factionId];
    if (!wantSpace(spaceFac)) continue;
    var G = makeG(star);
    var routes = G.sys.traffic || [];
    for (var r = 0; r < routes.length; r++) {
      var home = G.sys.byId[routes[r].from];
      var flag = home && (galaxy.factionById[home.faction] || G.sys.factionById[home.faction]);
      if (!flag || !wantFlag(flag, spaceFac)) continue;
      for (var k = 0; k < 6; k++) {
        var t = routes[r].period * (k / 6);
        G.t = t;
        var c = contactOn(G, routes[r], t);
        if (loaded(c) >= 3) return { G: G, route: routes[r], c: c, t: t, star: star };
      }
    }
  }
  return null;
}

function lawful(f) { return f && !f.outlaw; }
function outlawF(f) { return f && f.outlaw; }
function empire(f) { return f && !f.outlaw ? (f.parentId || f.id) : null; }

/* ---- rivalries ----------------------------------------------------------- */

section('rivalries are seeded, symmetric, and leave no empire friendless');
['kawartha', 'alpha', 'pigeon', 'manifest', 'reverie', 'orrin', 'beaverton', 'quill']
  .forEach(function (seed) {
    var g1 = Galaxy.build(seed), g2 = Galaxy.build(seed);
    var majors = g1.factions.filter(function (f) { return !f.outlaw && !f.parentId; });
    var sym = true, lonely = false;
    majors.forEach(function (a) {
      var mine = Object.keys(g1.rivals[a.id] || {});
      if (!mine.length) lonely = true;
      mine.forEach(function (b) { if (!Galaxy.rivalsOf(g1, b, a.id)) sym = false; });
    });
    check(seed + ': the same seed, the same quarrels',
          JSON.stringify(g1.rivals) === JSON.stringify(g2.rivals));
    check(seed + ': symmetric, and every empire has an enemy', sym && !lonely,
          JSON.stringify(g1.rivals));
    if (majors.length === 2) {
      check(seed + ': two empires are always rivals',
            Galaxy.rivalsOf(g1, majors[0].id, majors[1].id));
    }
  });
check('only empires hold grudges — the Syndicate is not in the table',
      !galaxy.rivals.outlaw);
check('an unknown id is simply not a rival', Galaxy.rivalsOf(galaxy, 'gf0', 'nobody') === false);
check('nor is a galaxy that predates rivalries', Galaxy.rivalsOf({}, 'gf0', 'gf1') === false);

/* ---- the door ------------------------------------------------------------ */

section('the record gates lawful hulls, and only lawful hulls');
var law = find(lawful, function (f) { return !f.outlaw; });
check('found a lawful hull to trade with', !!law);
if (law) {
  var flag = ST.flagOf(law.G, law.G.sys, law.c);
  check('it flies its home port\'s flag', flag.id && !flag.outlaw, JSON.stringify(flag));
  check('and will deal with a clean pilot',
        ST.refusal(law.G, law.G.sys, law.c) === null, ST.refusal(law.G, law.G.sys, law.c));
  law.G.wanted[flag.id] = Combat.WANTED_HUNT + 200;
  var why = ST.refusal(law.G, law.G.sys, law.c);
  check('but not with one wanted by its own flag', !!why && /Wanted by/.test(why), why);
  check('and says what it would take to change that', !!why && /settled/.test(why), why);
  var b0 = ST.board(law.G, law.G.sys, law.t, law.c);
  check('the board carries the refusal', b0.refusal === why);
  var tried = ST.deal(law.G, law.G.sys, law.t, law.c, b0.rows[0] && b0.rows[0].cid, 1);
  check('and the deal honours it', tried.ok === false);
  law.G.wanted = {};
  /* Wanted by somebody ELSE is not this hull's business. */
  law.G.wanted.someoneElse = Combat.WANTED_HUNT * 5;
  check('a warrant from another power is not its business',
        ST.refusal(law.G, law.G.sys, law.c) === null);
  law.G.wanted = {};
}

var crook = find(function () { return true; }, function (f) { return f.outlaw; });
check('found an outlaw-flagged hull', !!crook);
if (crook) {
  var cf = ST.flagOf(crook.G, crook.G.sys, crook.c);
  crook.G.wanted[cf.id] = Combat.WANTED_HUNT * 3;
  for (var wf in crook.G.galaxy.factionById) crook.G.wanted[wf] = Combat.WANTED_HUNT * 3;
  check('an outlaw hull deals with anybody, warrants and all',
        ST.refusal(crook.G, crook.G.sys, crook.c) === null,
        ST.refusal(crook.G, crook.G.sys, crook.c));
  crook.G.wanted = {};
}

check('a warship is not a shop',
      /warship/.test(ST.refusal(law.G, law.G.sys,
        { name: 'X', cls: 'capital', kind: 'capital', pos: law.G.ship.pos }) || ''));
var far = law && { name: 'Far', pos: V.addScaled(law.G.ship.pos, { x: 1, y: 0, z: 0 },
                                                 Combat.HAIL_RANGE_KM + 40) };
check('out of range says how close to get',
      /under \d+ km/.test(ST.refusal(law.G, law.G.sys, far) || ''));

/* ---- prices -------------------------------------------------------------- */

section('standing moves the price, and never into arbitrage');
if (law) {
  var G = law.G, c = law.c, t = law.t;
  var f0 = ST.flagOf(G, G.sys, c).id;
  G.ship.cargo = {};
  /* Something the destination trades, so there is a PAY price to read. */
  var dstRows = (c.to && c.to.market) ? Object.keys(c.to.market.rows) : [];
  var sellCid = dstRows.filter(function (k) {
    var com = Eco.BY_ID[k]; return com && com.base > 0 && !com.contraband;
  })[0];
  G.ship.cargo[sellCid] = 10;
  Sim.refreshShip(G.ship);

  function rowOf(b, cid) { return b.rows.filter(function (r) { return r.cid === cid; })[0]; }
  var buyCid = ST.board(G, G.sys, t, c).rows.filter(function (r) { return r.buyEach !== null; })[0].cid;

  G.standing[f0] = 0;
  var neutral = ST.board(G, G.sys, t, c);
  G.standing[f0] = 100;
  var allied = ST.board(G, G.sys, t, c);
  G.standing[f0] = -100;
  var hostile = ST.board(G, G.sys, t, c);
  G.standing[f0] = 0;

  check('a friend pays less',
        rowOf(allied, buyCid).buyEach < rowOf(neutral, buyCid).buyEach,
        rowOf(allied, buyCid).buyEach + ' vs ' + rowOf(neutral, buyCid).buyEach);
  check('and is paid more',
        rowOf(allied, sellCid).sellEach > rowOf(neutral, sellCid).sellEach);
  check('an enemy the other way round',
        rowOf(hostile, buyCid).buyEach > rowOf(neutral, buyCid).buyEach &&
        rowOf(hostile, sellCid).sellEach < rowOf(neutral, sellCid).sellEach);
  check('the door stays open whatever the standing', hostile.refusal === null);

  /* THE GUARANTEES. At the best standing a ship still asks more than its
   * destination would and bids less — and on every line, at every
   * standing, its ask is above its bid. The last one is the money loop
   * the render test found: two anchors put a hauler's bid for rare metals
   * at 634 against its ask of 423, so buying and selling straight back
   * paid 211 a tonne forever. */
  var dstBuy = Eco.price(c.to, buyCid, t);
  if (dstBuy) {
    check('a friend still asks more than the port it is bound for',
          rowOf(allied, buyCid).buyEach > dstBuy.mid * 1.045,
          rowOf(allied, buyCid).buyEach + ' vs port mid ' + dstBuy.mid.toFixed(0));
  }
  var loop = [];
  [-100, -40, 0, 40, 100].forEach(function (sv) {
    G.standing[f0] = sv;
    G.ship.cargo = {};
    ST.board(G, G.sys, t, c).rows.forEach(function (r) { if (r.theirs > 0) G.ship.cargo[r.cid] = 5; });
    if (sellCid) G.ship.cargo[sellCid] = 5;
    Sim.refreshShip(G.ship);
    ST.board(G, G.sys, t, c).rows.forEach(function (r) {
      if (r.buyEach !== null && r.sellEach !== null && !(r.buyEach > r.sellEach)) {
        loop.push(sv + ':' + r.cid + ' ask ' + r.buyEach + ' bid ' + r.sellEach);
      }
    });
  });
  G.standing[f0] = 0;
  G.ship.cargo = {}; G.ship.cargo[sellCid] = 10; Sim.refreshShip(G.ship);
  check('no line ever bids above its own ask — no buy-and-sell-back loop',
        loop.length === 0, loop.join(', '));
  var dstP = Eco.price(c.to, sellCid, t);
  check('and still pays less than the port it is bound for',
        rowOf(allied, sellCid).sellEach < dstP.sell,
        rowOf(allied, sellCid).sellEach + ' vs port ' + dstP.sell.toFixed(0));
  check('prices come from the ports, not a flat table',
        rowOf(neutral, buyCid).buyEach !==
        Math.round(Eco.BY_ID[buyCid].base * ST.BUY_MARKUP));
}

/* The same guarantee, swept: every route in a dozen systems, holding five
 * tonnes of everything the ship carries plus everything its destination
 * trades, at both ends of the standing scale. */
(function () {
  var bad = [], lines = 0;
  for (var si = 0; si < 12; si++) {
    var Gs = makeG(galaxy.stars[si]);
    (Gs.sys.traffic || []).forEach(function (route) {
      var cs = Sim.trafficState(route, Gs.sys, route.period * 0.3);
      Gs.ship.pos = V.clone(cs.pos);
      Gs.ship.cargo = {};
      (cs.manifest || []).forEach(function (m) { Gs.ship.cargo[m.cid] = 5; });
      if (cs.to && cs.to.market) for (var k in cs.to.market.rows) Gs.ship.cargo[k] = 5;
      Gs.ship.cargoCap = 1e6;
      [-100, 100].forEach(function (sv) {
        var fid = ST.flagOf(Gs, Gs.sys, cs).id;
        Gs.standing = {}; if (fid) Gs.standing[fid] = sv;
        ST.board(Gs, Gs.sys, route.period * 0.3, cs).rows.forEach(function (r) {
          if (r.buyEach === null || r.sellEach === null) return;
          lines++;
          if (!(r.buyEach > r.sellEach)) bad.push(route.id + ':' + r.cid);
        });
      });
    });
  }
  check('swept: ' + lines + ' two-way lines, every ask above its bid',
        lines > 50 && bad.length === 0, bad.slice(0, 5).join(', ') + ' lines=' + lines);
})();

/* ---- the voyage ledger --------------------------------------------------- */

section('a voyage remembers; the timetable does not change');
if (law) {
  var G = law.G, c = law.c, t = law.t;
  G.ship.cargo = {}; Sim.refreshShip(G.ship);
  G.standing = {};
  var before = JSON.stringify(law.route.out) + JSON.stringify(law.route.back);
  var b1 = ST.board(G, G.sys, t, c);
  var row = b1.rows.filter(function (r) { return r.buyEach !== null; })[0];
  var res = ST.deal(G, G.sys, t, c, row.cid, 3);
  check('a purchase arrives', res.ok && G.ship.cargo[row.cid] === 3, JSON.stringify(res));
  var b2 = ST.board(G, G.sys, t, c);
  var row2 = b2.rows.filter(function (r) { return r.cid === row.cid; })[0];
  check('and leaves their hold for this voyage', row2.theirs === row.theirs - 3,
        row.theirs + ' -> ' + row2.theirs);
  check('without touching the route every later voyage reads',
        JSON.stringify(law.route.out) + JSON.stringify(law.route.back) === before);
  var later = law.t + law.route.period;
  var c2 = Sim.trafficState(law.route, G.sys, later);
  var row3 = ST.board(G, G.sys, later, c2).rows.filter(function (r) { return r.cid === row.cid; })[0];
  check('the same leg next cycle sails full', !!row3 && row3.theirs === row.theirs,
        row3 && (row3.theirs + ' vs ' + row.theirs));
  ST.prune(G, later + law.route.period);
  check('and the old voyage is forgotten once it is over',
        Object.keys(G.shipTrade.legs).length === 0, JSON.stringify(G.shipTrade.legs));

  /* Room is the hull's, per voyage. */
  G.ship.cargo = {}; G.ship.cargo[row.cid] = 500;
  G.ship.cargoCap = 1000; Sim.refreshShip(G.ship);
  var bb = ST.board(G, G.sys, t, c);
  var sr = bb.rows.filter(function (r) { return r.cid === row.cid; })[0];
  if (sr.sellEach !== null) {
    var sold = ST.deal(G, G.sys, t, c, row.cid, -1000);
    check('they take only what their hull has room for',
          sold.ok && sold.qty === bb.room, JSON.stringify({ qty: sold.qty, room: bb.room }));
    var again = ST.deal(G, G.sys, t, c, row.cid, -1);
    check('and then say so', again.ok === false && /room/i.test(again.text), again.text);
  }
}

/* ---- standing ------------------------------------------------------------ */

section('standing: by the size of the deal, fractions kept, capped per day');
if (law) {
  var G = law.G, c = law.c, t = law.t;
  G.shipTrade = null; G.standing = {}; G.ship.cargo = {}; G.ship.cargoCap = 100000;
  Sim.refreshShip(G.ship);
  var fid = ST.flagOf(G, G.sys, c).id;
  var brow = ST.board(G, G.sys, t, c).rows.filter(function (r) { return r.buyEach !== null; })[0];
  var perPoint = Math.ceil(ST.CR_PER_STANDING / brow.buyEach);
  var small = Math.max(1, Math.floor(perPoint / 3));
  if (brow.theirs >= perPoint + small) {
    ST.deal(G, G.sys, t, c, brow.cid, small);
    check('a small deal fills the bucket without tipping it',
          (G.standing[fid] || 0) === 0, String(G.standing[fid]));
    ST.deal(G, G.sys, t, c, brow.cid, perPoint);
    check('and a bigger one tips it', G.standing[fid] >= 1, String(G.standing[fid]));
  } else {
    check('(hold too thin to measure fractions on this seed)', true);
  }

  /* The cap, against a synthetic hull with an enormous hold so the cap,
   * not the stock, is what stops it. */
  var whale = { name: 'Whale', pos: V.clone(G.ship.pos), faction: fid, cls: 'bulk',
                id: 'whale', manifest: [{ cid: brow.cid, qty: 100000 }],
                from: c.from, to: c.to };
  G.shipTrade = null; G.standing = {}; G.ship.credits = 1e9;
  ST.deal(G, G.sys, t, whale, brow.cid, 5000);
  check('one enormous deal stops at the daily cap', G.standing[fid] === ST.DAILY_CAP,
        String(G.standing[fid]));
  ST.deal(G, G.sys, t + 3600, whale, brow.cid, 5000);
  check('and so does a second the same day', G.standing[fid] === ST.DAILY_CAP);
  ST.deal(G, G.sys, t + 86400 * 1.01, whale, brow.cid, 5000);
  check('the next day it moves again', G.standing[fid] === 2 * ST.DAILY_CAP,
        String(G.standing[fid]));
}

/* ---- rivals -------------------------------------------------------------- */

section('rivals: the law against the Syndicate');
var dirty = find(lawful, function (f) { return f.outlaw; });
check('ordinary traffic flies no outlaw flag in lawful space (see below)', !dirty);
if (dirty) {
  var con = ST.consequence(dirty.G, dirty.G.sys, ST.flagOf(dirty.G, dirty.G.sys, dirty.c));
  check('an outlaw hull in lawful space costs you with the owner',
        con.loss && con.loss.id === dirty.star.factionId, JSON.stringify(con));
  check('and says so in words', con.loss && /outlaw hull/.test(con.loss.why));
}
/* MEASURED, 2026-10-10: across ten galaxies and 2,000 systems, ordinary
 * traffic NEVER puts an outlaw-flagged trader in lawful space — every
 * outlaw-flagged port is inside a hold. So this half of the rule is
 * dormant today (the other half, lawful hulls in a hold, is ~9,000 legs)
 * and wakes up the day anything outlaw trades outside a hold: pirate bands,
 * smugglers, a Syndicate runner on a lane. Pinned with a synthetic hull
 * so it is still correct when that day comes. */
if (law) {
  var lg = makeG(law.star);
  var runner = { name: 'Quiet Runner', faction: 'outlaw', id: 'qr',
                 pos: V.clone(lg.ship.pos), manifest: [] };
  var con1 = ST.consequence(lg, lg.sys, ST.flagOf(lg, lg.sys, runner));
  check('an outlaw hull in lawful space costs you with the owner',
        con1.loss && con1.loss.id === law.star.factionId, JSON.stringify(con1));
  check('and says so in words', con1.loss && /outlaw hull/.test(con1.loss.why));
}
var hold = find(outlawF, function (f) { return !f.outlaw; });
if (hold) {
  var con2 = ST.consequence(hold.G, hold.G.sys, ST.flagOf(hold.G, hold.G.sys, hold.c));
  check('a lawful hull in a Syndicate hold costs you with the Syndicate',
        con2.loss && con2.loss.id === hold.star.factionId, JSON.stringify(con2));
} else {
  check('(no lawful hull in a hold on this seed — skipped)', true);
}

section('rivals: empire against empire');
var feud = find(lawful, function (f, space) {
  return !f.outlaw && empire(f) !== empire(space) &&
         Galaxy.rivalsOf(galaxy, empire(f), empire(space));
});
if (feud) {
  var con3 = ST.consequence(feud.G, feud.G.sys, ST.flagOf(feud.G, feud.G.sys, feud.c));
  var spaceEmpire = empire(galaxy.factionById[feud.star.factionId]);
  check('a rival empire\'s hull costs you with the empire whose space it is',
        con3.loss && con3.loss.id === spaceEmpire, JSON.stringify(con3));
  /* And it actually lands, through the same cap. */
  var G = feud.G; G.standing = {}; G.shipTrade = null; G.ship.credits = 1e9;
  G.ship.cargo = {}; G.ship.cargoCap = 1e6; Sim.refreshShip(G.ship);
  var fr = ST.board(G, G.sys, feud.t, feud.c).rows.filter(function (r) { return r.buyEach !== null; })[0];
  var r4 = ST.deal(G, G.sys, feud.t, feud.c, fr.cid, fr.theirs);
  var lost = r4.standing.filter(function (m) { return m.delta < 0; })[0];
  check('the penalty is applied when the deal is big enough to count',
        r4.total < ST.CR_PER_STANDING || (!!lost && G.standing[spaceEmpire] < 0),
        JSON.stringify({ total: r4.total, standing: G.standing }));
} else {
  check('(no rival-flagged hull found on this seed — skipped)', true);
}
var friendly = find(lawful, function (f, space) { return !f.outlaw && empire(f) === empire(space); });
if (friendly) {
  var con4 = ST.consequence(friendly.G, friendly.G.sys,
                            ST.flagOf(friendly.G, friendly.G.sys, friendly.c));
  check('your own empire\'s hulls cost you nothing', !con4.loss, JSON.stringify(con4));
}
if (law) {
  var deepG = makeG(law.star);
  deepG.here = { id: 'drop-x', name: 'deep space' };       // what enterInterstellar leaves
  var con5 = ST.consequence(deepG, deepG.sys, { id: 'outlaw', name: 'the Syndicate', outlaw: true });
  check('in deep space nobody is watching', !con5.loss);
}

/* ---- what stays where it belongs ----------------------------------------- */

section('contraband and contract freight');
if (law && crook) {
  law.G.ship.cargo = { narcotics: 4 }; Sim.refreshShip(law.G.ship);
  var lr = ST.board(law.G, law.G.sys, law.t, law.c).rows.filter(function (r) { return r.cid === 'narcotics'; })[0];
  check('a lawful hull will not take contraband', lr && lr.sellEach === null &&
        /customs/.test(lr.sellWhy), JSON.stringify(lr));
  crook.G.ship.cargo = { narcotics: 4 }; Sim.refreshShip(crook.G.ship);
  var cr = ST.board(crook.G, crook.G.sys, crook.t, crook.c).rows.filter(function (r) { return r.cid === 'narcotics'; })[0];
  check('an outlaw one will', cr && cr.sellEach > 0, JSON.stringify(cr));

  law.G.ship.cargo = {}; law.G.ship.cargo[sellCid || 'grain'] = 10;
  law.G.missions = [{ cid: sellCid || 'grain', tonnes: 10, toName: 'Somewhere' }];
  Sim.refreshShip(law.G.ship);
  var fr2 = ST.deal(law.G, law.G.sys, law.t, law.c, sellCid || 'grain', -5);
  check('contract freight is not yours to sell', fr2.ok === false && /freight for/.test(fr2.text),
        fr2.text);
  law.G.missions = [];
  var none = ST.deal(law.G, law.G.sys, law.t, law.c, 'narcotics', -1);
  check('selling what you do not have says so', none.ok === false && /no narcotics/i.test(none.text),
        none.text);
}

/* ---- the old one-line offer still works, through the new door ------------ */

section('the quick offer is a view of the board');
if (law) {
  var G = law.G; G.ship.cargo = {}; G.ship.cargoCap = 64; G.ship.credits = 50000;
  G.shipTrade = null; Sim.refreshShip(G.ship);
  var q = Combat.hailTrade(G, law.c, G.sys, law.t);
  check('it offers a line', !!(q && q.buy), JSON.stringify(q));
  var said = [];
  var got = Combat.hailShip(G, G.sys, law.t, law.c, 'buy', { say: function (m) { said.push(m); } });
  check('and buys it at the board\'s price', !!got && got.cost === q.buy.each * q.buy.qty,
        JSON.stringify(got));
  G.wanted[ST.flagOf(G, G.sys, law.c).id] = Combat.WANTED_HUNT + 1;
  said = [];
  var refused = Combat.hailShip(G, G.sys, law.t, law.c, 'buy', { say: function (m) { said.push(m); } });
  check('and refuses a wanted pilot with the same words', refused === null &&
        /Wanted by/.test(said.join(' ')), said.join(' | '));
  G.wanted = {};
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
