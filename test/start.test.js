/* start.test.js - choosing the start (2026-11-02).
 *
 *     node test/start.test.js
 *
 * Astra: "I also want to be able to select the ship I start with based on
 * what I'm wanting to focus on - trade, mining, combat." Pinned:
 *  - each easy/normal start gets its hull, its whole fit (with the standard
 *    scoop and cruise drive) and its credits, and not one fitting refused;
 *  - within a difficulty every focus is worth the same, hull + fit +
 *    seekers + credits, at list;
 *  - a mining start is docked at a mining head with a mining laser, a
 *    survey scanner and a cargo scoop - including on a seed whose home
 *    system has no mining head;
 *  - a combat start is docked at a shipyard where the home system has one;
 *  - HARD is today's career exactly: the same ship, the same port, the
 *    same system, as newGame with no choice at all - and that is the old
 *    Talon, 3,200 cr and a pulse laser;
 *  - the same seed twice gives the same start;
 *  - the choice survives a save, additively;
 *  - New career goes straight to the seed and is the Talon with the
 *    lessons (2026-11-03); the picker opens when they end, walks
 *    difficulty then focus (skipped on HARD), every row says ship, hold,
 *    guns and the credits it will hand you, and a swap is the direct
 *    start's kit plus the run's profit.
 *
 * Boots the real main.js headless, in index.html's own script order, so
 * nothing here is a second copy of the new-career path.
 */
'use strict';
var fs = require('fs'), path = require('path');
var ROOT = path.resolve(__dirname, '..');

var pass = 0, fail = 0;
function check(n, c, d) {
  if (c) { pass++; console.log('  ok   ' + n + (d ? '   ' + d : '')); }
  else { fail++; console.log('  FAIL  ' + n + (d ? '   ' + d : '')); }
}

/* ---- a headless page ------------------------------------------------------ */
var noop = function () {};
var texts = [];
var ctx = new Proxy({
  measureText: function (t) { return { width: String(t).length * 6.2 }; },
  fillText: function (t) { texts.push(String(t)); },
  createLinearGradient: function () { return { addColorStop: noop }; },
  createRadialGradient: function () { return { addColorStop: noop }; },
  createPattern: function () { return null; },
  getImageData: function () { return { data: [] }; }
}, {
  get: function (o, k) { return k in o ? o[k] : noop; },
  set: function (o, k, v) { o[k] = v; return true; }
});
var listeners = {}, raf = [], clock = 0;
var canvas = {
  width: 1600, height: 900, style: {}, getContext: function () { return ctx; },
  addEventListener: function (n, f) { (listeners[n] = listeners[n] || []).push(f); },
  getBoundingClientRect: function () { return { left: 0, top: 0, width: 1600, height: 900 }; }
};
global.window = global;
global.innerWidth = 1600; global.innerHeight = 900; global.devicePixelRatio = 1;
global.addEventListener = function (n, f) { (listeners[n] = listeners[n] || []).push(f); };
global.performance = { now: function () { return clock; } };
global.location = { hash: '#kawartha' };
global.history = { replaceState: noop };
global.requestAnimationFrame = function (f) { raf.push(f); return raf.length; };
global.document = { readyState: 'complete', getElementById: function () { return canvas; },
                    addEventListener: noop, createElement: function () { return canvas; } };
var store = {};
global.localStorage = {
  getItem: function (k) { return store[k] === undefined ? null : store[k]; },
  setItem: function (k, v) { store[k] = String(v); },
  removeItem: function (k) { delete store[k]; }
};
var html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
var srcs = [];
html.replace(/<script[^>]*src="([^"]+)"/g, function (_, s) { srcs.push(s); return _; });
srcs.filter(function (s) { return !/gl\.js$|npcgl\.js$|embedder\.js$/.test(s); })
    .forEach(function (s) { require(path.join(ROOT, s)); });

var G = global.Game, S = global.Start, C = global.Combat, Save = global.Save;
check('the game and start.js booted', !!G && !!S && !!G.ship);
check('start.js is loaded from index.html, after combat.js',
      srcs.indexOf('src/start.js') > srcs.indexOf('src/combat.js') && srcs.indexOf('src/start.js') < srcs.indexOf('src/main.js'));

function frame() { clock += 16; var f = raf.pop(); raf.length = 0; if (f) f(clock); }
function key(k) {
  (listeners.keydown || []).forEach(function (fn) {
    fn({ key: k, code: k, preventDefault: noop, stopPropagation: noop, target: {} });
  });
}

/* What a ship is worth, read off the ship rather than off the plan: hull
 * at list, every fitting at list, every seeker at list, and the cash. */
function shipValue(s) {
  var v = C.HULLS[s.hullId].price + (s.credits || 0);
  for (var k in (s.fit || {})) v += C.EQUIPMENT[s.fit[k]].price || 0;
  var racks = s.racks || {};
  for (var r in racks) v += ((C.MISSILES[r] || {}).price || 0) * (racks[r].n || 0);
  return v;
}
function fitted(s, id) { for (var k in (s.fit || {})) if (s.fit[k] === id) return true; return false; }
function dockedPort() { return G.ship.docked ? G.sys.byId[G.ship.docked] : null; }

/* ---- the numbers --------------------------------------------------------- */
console.log('--- the presets ---');
['easy', 'normal'].forEach(function (d) {
  var totals = S.FOCI.map(function (f) { return S.plan(d, f).total; });
  check(d + ': every focus is worth the same', totals[0] === totals[1] && totals[1] === totals[2], totals.join(' / '));
  var floor = Math.min.apply(null, S.FOCI.map(function (f) { return S.plan(d, f).credits; }));
  check(d + ': the dearest kit carries the floor in cash', floor === S.PRESETS[d].floor, floor + ' cr');
});
check('hard has no preset - it is the career with no plan', S.plan('hard', null) === null && S.plan('hard', 'trade') === null);
var want = { easy: { trade: 'trader', mining: 'sump', combat: 'dart' },
             normal: { trade: 'talon', mining: 'bollard', combat: 'fighter' } };
['easy', 'normal'].forEach(function (d) {
  S.FOCI.forEach(function (f) { check(d + ' ' + f + ' is Astra\'s hull', S.plan(d, f).hull === want[d][f], S.plan(d, f).hullName); });
});

/* The Lance's missing shield is a refusal with a reason, not an oversight. */
var lance = { hullId: 'fighter', fit: {}, cargo: {} };
['cargoscoop', 'cruise1', 'phbeam'].forEach(function (id) { var v = C.canFit(lance, id); lance.fit[v.key] = id; });
var nos = C.canFit(lance, 'shield');
check('a Lance with a gun has no room for a shield, and says why', !nos.ok && /t, only/.test(nos.why), nos.why);

/* ---- HARD is today ------------------------------------------------------- */
console.log('--- hard is the old career ---');
function careerKey() {
  return JSON.stringify({ star: G.here.id, docked: G.ship.docked, ship: G.ship, view: G.viewMode,
                          host: G.spawnHost && G.spawnHost.id, home: G.homeStation && G.homeStation.id });
}
['kawartha', 'alpha', 'delta'].forEach(function (seed) {
  G.newGame(seed);
  var old = careerKey(), oldShip = G.ship;
  G.newGame(seed, { difficulty: 'hard', focus: null });
  check(seed + ': HARD is newGame with no choice, field for field', careerKey() === old);
  check(seed + ': and that is the Talon, 3,200 cr, a pulse laser, scoop and drive',
        G.ship.hullId === 'talon' && G.ship.credits === 3200 &&
        JSON.stringify(G.ship.fit) === JSON.stringify({ hardpoint0: 'phpulse', utility0: 'cargoscoop', drive0: 'cruise1' }) &&
        oldShip.credits === 3200, JSON.stringify(G.ship.fit));
  check(seed + ': the hard career is saved as hard', G.start && G.start.difficulty === 'hard');
});

/* ---- every focus start --------------------------------------------------- */
console.log('--- the focus starts ---');
['easy', 'normal'].forEach(function (d) {
  S.FOCI.forEach(function (f) {
    var plan = S.plan(d, f);
    G.newGame('kawartha', { difficulty: d, focus: f });
    var s = G.ship;
    check(d + ' ' + f + ': hull ' + plan.hull, s.hullId === plan.hull && s.cargoCap === C.HULLS[plan.hull].cargoCap &&
          s.dryMass === C.HULLS[plan.hull].dryMass);
    var missing = plan.fit.concat(['cargoscoop', 'cruise1']).filter(function (id) { return !fitted(s, id); });
    check(d + ' ' + f + ': the whole fit, nothing refused', !missing.length && !(G.startRefused || []).length,
          missing.join(',') + ' ' + (G.startRefused || []).join(';'));
    check(d + ' ' + f + ': credits', s.credits === plan.credits, s.credits + ' cr');
    check(d + ' ' + f + ': worth the difficulty total', shipValue(s) === S.totalFor(d), shipValue(s) + ' cr');
    check(d + ' ' + f + ': starts docked, with clean papers',
          !!dockedPort() && !(G.wanted && Object.keys(G.wanted).some(function (k) { return G.wanted[k] > 0; })),
          dockedPort() && dockedPort().name);
    if (plan.seekers) {
      var r = (s.racks || {})[plan.seekers.id];
      check(d + ' ' + f + ': seekers racked and armed', !!r && r.n === plan.seekers.n && s.missileId === plan.seekers.id);
    }
    check(d + ' ' + f + ': the arrival says what it set up', /start:/.test(G.message || '') &&
          (G.journal || []).some(function (e) { return e.kind === 'start'; }), G.message);
  });
});

/* ---- where they start ---------------------------------------------------- */
console.log('--- where they start ---');
/* Measured with the harness this file grew from: delta, quartz, wisp and
 * zephyr have no mining head at home. */
['kawartha', 'alpha', 'delta', 'quartz', 'wisp', 'zephyr'].forEach(function (seed) {
  ['easy', 'normal'].forEach(function (d) {
    G.newGame(seed, { difficulty: d, focus: 'mining' });
    var p = dockedPort();
    check(seed + ' ' + d + ' mining: docked at a mining head (a Guild hall)',
          !!p && S.isMiningHead(p) && C.torpedoSoldAt(G, p, C.MISSILES.rocktorp),
          (p ? p.name : 'nowhere') + ' in ' + G.here.name + (G.here === G.galaxy.home ? '' : ' (not home)'));
    check(seed + ' ' + d + ' mining: laser, survey scanner, scoop',
          fitted(G.ship, 'mininglaser') && fitted(G.ship, 'surveyscan') && fitted(G.ship, 'cargoscoop') && C.hasScoop(G.ship));
  });
});
['alpha', 'fjord', 'kawartha'].forEach(function (seed) {
  G.newGame(seed);
  var homeYard = (G.sys.ports || []).some(function (p) { return C.isShipyard(p); });
  G.newGame(seed, { difficulty: 'normal', focus: 'combat' });
  var p = dockedPort();
  check(seed + ' combat: ' + (homeYard ? 'docked at a shipyard' : 'no yard at home - the best outfitter'),
        !!p && (homeYard ? C.isShipyard(p) : true), p && p.name + ' ' + p.market.role);
});
G.newGame('kawartha');
var tradeHardPort = G.ship.docked;
G.newGame('kawartha', { difficulty: 'easy', focus: 'trade' });
check('a trade start docks where a career always has', G.ship.docked === tradeHardPort);

/* ---- the same seed is the same start ------------------------------------- */
console.log('--- determinism ---');
['easy', 'normal'].forEach(function (d) {
  S.FOCI.forEach(function (f) {
    G.newGame('alpha', { difficulty: d, focus: f });
    var a = careerKey();
    G.newGame('bravo', { difficulty: d, focus: f });
    G.newGame('alpha', { difficulty: d, focus: f });
    check(d + ' ' + f + ': same seed twice, same start', careerKey() === a);
  });
});

/* ---- the save ------------------------------------------------------------ */
console.log('--- the save ---');
G.newGame('kawartha', { difficulty: 'easy', focus: 'mining' });
var snap = JSON.parse(JSON.stringify(Save.snapshot(G)));
check('the choice is in the save', snap.start && snap.start.difficulty === 'easy' && snap.start.focus === 'mining');
var vBefore = snap.version;
G.newGame('kawartha');
Save.restore(G, snap, { enterSystem: G.enterSystem });
check('and comes back on load, hull and all', G.start && G.start.focus === 'mining' && G.ship.hullId === 'sump');
check('the save version did not move', Save.snapshot(G).version === vBefore);
delete snap.start;
G.newGame('kawartha');
Save.restore(G, snap, { enterSystem: G.enterSystem });
check('an older save with no start loads as none', G.start === null);

/* ---- the title card: New career is the Talon and the lessons ------------- */
console.log('--- the title card ---');
G.title = { sel: 2, edit: null, note: null, born: -1e9 };
key('Enter');
check('New career goes straight to the seed field - no picker on the title',
      G.title && G.title.edit && !G.title.pick, G.title && JSON.stringify(G.title.pick));
key('Enter');
check('and Enter starts the classic Talon with the lessons',
      !G.title && G.ship.hullId === 'talon' && G.ship.credits === 3200 && G.start === null &&
      G.tutorial && G.tutorial.step === 'hello' && G.tutorial.pickAtEnd === true && G.startPending === false);
var newKey = careerKey();
G.newGame('kawartha', { difficulty: 'hard', focus: null });
check('...which is the hard career field for field', careerKey() === newKey);
check('an explicit start is never asked again', G.tutorial && G.tutorial.pickAtEnd === false);
frame();

/* ---- the picker after the lessons ------------------------------------------ */
console.log('--- choosing after the lessons ---');
var T = global.Tutorial, Fleet = global.Fleet;
function endLessons() {
  T.press(G, 'end', { now: 1 });
  T.press(G, 'end', { now: 2 });
}
/* A new career with `profit` made on the run, its lessons ended, and the
 * frame run that opens the picker. */
function freshEnded(profit) {
  G.newGame('kawartha');
  G.ship.credits = 3200 + profit;
  endLessons();
  frame();
}
/* The kit a direct start of this choice is built with, bornId aside (it is
 * stamped with where and when, and a swap happens elsewhere and later). */
function kitKey(sh) {
  return JSON.stringify({ hull: sh.hullId, fit: sh.fit, racks: sh.racks, missileId: sh.missileId, missiles: sh.missiles,
                          cap: sh.cargoCap, dry: sh.dryMass, fuel: sh.fuel, fuelCap: sh.fuelCap,
                          hp: sh.hullHp, hullMax: sh.hullMax, thrust: sh.thrustKN, groups: sh.groups });
}

freshEnded(1500);
check('ending the lessons docked opens the picker, time stopped', G.menu && G.menu.page === 'startpick' && G.startPending === true);
check('the Patience waits for the choice', !G.tutorial.given && !(G.fleet || []).length);
texts.length = 0; frame();
check('the difficulty stage says the run profit, once, in the heading',
      texts.some(function (t) { return /LESSONS DONE/.test(t) && /1,500 cr/.test(t); }),
      texts.filter(function (t) { return /LESSONS/.test(t); }).join(' | '));
check('HARD reads "keep the Talon" and shows the ship as she stands',
      texts.some(function (t) { return t === 'keep the Talon'; }) &&
      texts.some(function (t) { return /Talon Courier . 64 t hold . guns: pulse . 4,700 cr$/.test(t); }));
check('direction is glyphs', texts.some(function (t) { return t.indexOf('▸') >= 0; }) &&
      texts.some(function (t) { return t.indexOf('◂') >= 0; }));
key('ArrowUp'); key('Enter');
check('Easy asks the focus', G.menu && G.menu.pick.stage === 'focus' && G.menu.pick.difficulty === 'easy');
texts.length = 0; frame();
check('every focus row prints the money it will hand you: preset plus profit',
      S.FOCI.every(function (f) {
        var p = S.plan('easy', f);
        return texts.some(function (t) { return t === p.hullName + '  ·  ' + S.fmt(p.credits + 1500) + ' cr'; }) &&
               texts.some(function (t) { return t.indexOf(p.cargoCap + ' t hold') === 0 && t.indexOf('guns: ') > 0; });
      }), texts.filter(function (t) { return / cr$/.test(t); }).join(' | '));
key('Escape');
check('Esc steps back one question', G.menu && G.menu.pick.stage === 'difficulty');
key('Escape');
check('Esc again closes it, and the choice is still waiting', !G.menu && G.startPending === true);
frame();
check('...it does not reopen itself at the same dock', !G.menu);
key('Escape');
texts.length = 0; frame();
check('the pause menu carries a row to reopen it',
      G.menu && G.menu.page === 'main' && texts.some(function (t) { return t === 'Choose your ship'; }));
key('ArrowDown'); key('Enter');
check('...and it does', G.menu && G.menu.page === 'startpick');
key('Escape'); frame();

/* Every Easy and Normal choice, against a direct start of the same. */
['easy', 'normal'].forEach(function (d) {
  S.FOCI.forEach(function (f, fi) {
    var plan = S.plan(d, f);
    G.newGame('kawartha', { difficulty: d, focus: f });
    var direct = kitKey(G.ship);
    freshEnded(1500);
    var talonPort = G.ship.docked;
    if (d === 'easy') key('ArrowUp');
    key('Enter');
    for (var n = 0; n < fi; n++) key('ArrowDown');
    key('Enter');
    check(d + ' ' + f + ': the Talon is swapped in place for the direct start\'s kit',
          kitKey(G.ship) === direct && G.ship.docked === talonPort, kitKey(G.ship) + ' vs ' + direct);
    check(d + ' ' + f + ': credits are the preset\'s plus the profit', G.ship.credits === plan.credits + 1500,
          G.ship.credits + ' vs ' + (plan.credits + 1500));
    check(d + ' ' + f + ': the choice is recorded and nothing is waiting',
          G.start && G.start.difficulty === d && G.start.focus === f && !G.startPending && !G.menu);
    frame();
    var rec = Fleet.byId(G, 'fs-halloway');
    check(d + ' ' + f + ': the Patience comes round after it, at this dock',
          rec && rec.hullId === 'trader' && rec.port === G.ship.docked && G.fleet.length === 1);
  });
});

freshEnded(1500);
key('ArrowDown'); key('Enter');
check('HARD keeps the Talon and changes nothing', G.ship.hullId === 'talon' && G.ship.credits === 4700 &&
      G.start.difficulty === 'hard' && !G.startPending && !G.menu);

/* A run that lost money does not come off the start. */
freshEnded(-1200);
key('Enter'); key('Enter');                  // Normal, trade
check('a loss is floored at nothing: the preset purse, whole', G.ship.credits === S.plan('normal', 'trade').credits,
      G.ship.credits);

/* Cargo: kept up to the new hold, the rest sold here, all of it counted. */
G.newGame('kawartha');
var port0 = G.sys.byId[G.ship.docked];
var bids = {};
global.Economy.priceList(port0, G.t).forEach(function (r) { if (r.sell > 0) bids[r.id] = r.sell; });
var goods = Object.keys(bids).filter(function (id) { return id !== 'waste'; }).sort(function (a, b) { return bids[b] - bids[a]; });
G.ship.cargo = {}; G.ship.cargo[goods[0]] = 10; G.ship.cargo[goods[goods.length - 1]] = 50;
G.ship.credits = 3000;
var lance = S.plan('normal', 'combat');
var worth = 3000 + 10 * bids[goods[0]] + 50 * bids[goods[goods.length - 1]];
var q = S.quote(G, lance, port0, G.t);
check('quote: the dearest good is kept first, and the hold is not overfilled',
      q.ok && q.keep[goods[0]] === Math.min(10, lance.cargoCap) &&
      Object.keys(q.keep).reduce(function (a, k) { return a + q.keep[k]; }, 0) <= lance.cargoCap, JSON.stringify(q.keep));
var keptV = Object.keys(q.keep).reduce(function (a, k) { return a + q.keep[k] * bids[k]; }, 0);
check('quote: profit counts the cargo, and the cargo kept is not paid twice',
      q.profit === Math.max(0, Math.round(worth - 3200)) && q.credits === Math.round(lance.credits + q.profit - keptV),
      q.profit + ' / ' + q.credits);
endLessons(); frame();
key('Enter'); key('ArrowDown'); key('ArrowDown'); key('Enter');   // Normal, combat
var held = Object.keys(G.ship.cargo).reduce(function (a, k) { return a + G.ship.cargo[k]; }, 0);
check('the swap leaves the hold within the Lance\'s and the overflow sold', G.ship.hullId === 'fighter' &&
      held <= G.ship.cargoCap + 1e-9 && G.ship.credits === q.credits, held + ' t, ' + G.ship.credits + ' cr');

/* Contract freight that will not fit shuts the row, with the reason. */
G.newGame('kawartha');
G.ship.cargo = { grain: 40 };
G.missions = [{ id: 'mx', type: 'haul', cid: 'grain', tonnes: 40, toName: 'X', deadline: 1e9 }];
var qx = S.quote(G, lance, G.sys.byId[G.ship.docked], G.t);
check('contract freight bigger than the new hold refuses, and says why', !qx.ok && /contract freight/.test(qx.why), qx.why);
G.missions = [];

/* Only from the Talon. */
G.newGame('kawartha', { difficulty: 'easy', focus: 'trade' });
var qt = S.quote(G, lance, G.sys.byId[G.ship.docked], G.t);
check('flying something else, the trade-in refuses with the reason', !qt.ok && /trade-in is for the Talon/.test(qt.why), qt.why);

/* Undocked when they end: pending, plainly. */
G.newGame('kawartha');
global.Sim.undockShip(G.ship, G.sys, G.t, 0.003); G.ship.arrival = null;
var dockId = G.tutorial.home;
endLessons(); frame();
check('undocked: nothing opens, the choice waits', !G.menu && G.startPending === true);
var tc = T.card(G, { sys: G.sys, t: G.t, now: 3 });
check('...and the card says "Dock anywhere to choose your ship"', tc && tc.goal === 'Dock anywhere to choose your ship', tc && tc.goal);
key('Escape'); frame();
key('ArrowDown'); key('Enter');
check('the pause row says why it will not open undocked', G.menu && G.menu.page === 'main' && /Dock anywhere/.test(G.menu.note || ''),
      G.menu && G.menu.note);
key('Escape');
var sv = JSON.parse(JSON.stringify(Save.snapshot(G)));
check('the pending flag is in the save', sv.startPending === true);
var homePort = G.sys.byId[dockId];
G.ship.cleared = {}; G.ship.cleared[homePort.id] = true;
var hs = global.Sim.bodyState(homePort, G.sys, G.t);
G.ship.pos = hs.pos; G.ship.vel = hs.vel;
global.Sim.dockShip(G.ship, homePort, G.sys, G.t);
frame();
check('docking opens the picker', G.menu && G.menu.page === 'startpick');
key('Escape'); key('Escape');

/* The save, both ways. */
G.newGame('kawartha');
Save.restore(G, sv, { enterSystem: G.enterSystem });
check('the pending flag comes back on load', G.startPending === true && G.tutorial.pickAtEnd === true);
var sv2 = JSON.parse(JSON.stringify(sv));
delete sv2.startPending; delete sv2.tutorial.pickAtEnd; delete sv2.tutorial.ended;
sv2.tutorial.step = 'deliver'; sv2.start = null;
G.newGame('kawartha');
Save.restore(G, sv2, { enterSystem: G.enterSystem });
check('an old mid-lesson save loads with nothing pending, and will be asked when its lessons end',
      G.startPending === false && G.tutorial.pickAtEnd === true);
sv2 = JSON.parse(JSON.stringify(sv2));      // restore adopts the object it is handed
delete sv2.tutorial.pickAtEnd;
sv2.start = { difficulty: 'easy', focus: 'mining' };
G.newGame('kawartha');
Save.restore(G, sv2, { enterSystem: G.enterSystem });
check('...unless it chose a focus start on the old title card', G.tutorial.pickAtEnd === false);
sv2.tutorial = null;
G.newGame('kawartha');
Save.restore(G, sv2, { enterSystem: G.enterSystem });
frame();
check('a career with no tutorial gets no picker', !G.startPending && !G.menu);
check('the save version did not move', Save.snapshot(G).version === vBefore);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
