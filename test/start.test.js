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
 *  - the title card walks difficulty, then focus (skipped on HARD), then
 *    seed, and every row says ship, hold, guns and credits.
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

/* ---- the title card ------------------------------------------------------ */
console.log('--- the title card ---');
G.title = { sel: 2, edit: null, note: null, born: -1e9 };
key('Enter');
check('New career asks the difficulty first', G.title && G.title.pick && G.title.pick.stage === 'difficulty');
texts.length = 0; frame();
check('the difficulty rows say ship and money',
      texts.some(function (t) { return /Tallyman \/ Sump \/ Dart/.test(t); }) &&
      texts.some(function (t) { return /Talon Courier . 64 t hold . guns: pulse . 3,200 cr/.test(t); }),
      texts.filter(function (t) { return /cr/.test(t); }).slice(0, 4).join(' | '));
check('the heading and the pointer are glyphs', texts.some(function (t) { return t.indexOf('▸') >= 0; }) &&
      texts.some(function (t) { return t.indexOf('◂') >= 0; }));
key('ArrowUp'); key('Enter');
check('Easy asks the focus', G.title.pick && G.title.pick.stage === 'focus' && G.title.pick.difficulty === 'easy');
texts.length = 0; frame();
check('every focus row says hull, hold, guns and credits',
      S.FOCI.every(function (f) {
        var p = S.plan('easy', f);
        return texts.some(function (t) { return t.indexOf(p.hullName) === 0 && /[\d,]+ cr$/.test(t); }) &&
               texts.some(function (t) { return t.indexOf(p.cargoCap + ' t hold') === 0 && t.indexOf('guns: ') > 0; });
      }));
key('Escape');
check('Esc steps back one question, not out of the card', G.title && G.title.pick && G.title.pick.stage === 'difficulty');
key('Enter');            // Easy again (the selection was put back on it)
key('ArrowDown'); key('Enter');
check('a focus goes to the seed field', G.title.edit && /easy mining career/.test(G.title.edit.title), G.title.edit && G.title.edit.title);
key('Enter');
check('and Enter starts the easy mining career', !G.title && G.ship.hullId === 'sump' && G.start.focus === 'mining');
G.title = { sel: 2, edit: null, note: null, born: -1e9 };
key('Enter'); key('ArrowDown'); key('Enter');
check('HARD skips the focus question', G.title.edit && !G.title.pick && /hard career/.test(G.title.edit.title));
key('Enter');
check('and is the Talon', !G.title && G.ship.hullId === 'talon' && G.ship.credits === 3200);
frame();

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
