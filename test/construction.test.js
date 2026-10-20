/* construction.test.js — the Crawler and station modules (2026-10-20).
 *
 * Astra: "This is the new station-constructor, called the Crawler. There's
 * only one size, and it ships one L size module or two M size modules or up
 * to three S size modules, but you have to build the L size first."
 *
 *     node test/construction.test.js
 */
'use strict';
var path = require('path');
var fs = require('fs');
var SRC = path.join(__dirname, '..', 'src');

require(path.join(SRC, 'vec3.js'));
require(path.join(SRC, 'rng.js'));
require(path.join(SRC, 'kepler.js'));
require(path.join(SRC, 'economy.js'));
require(path.join(SRC, 'generate.js'));
var Galaxy = require(path.join(SRC, 'galaxy.js'));
var Sim = require(path.join(SRC, 'sim.js'));
var Combat = require(path.join(SRC, 'combat.js'));
require(path.join(SRC, 'crew.js'));
var Fleet = require(path.join(SRC, 'fleet.js'));
var Cn = require(path.join(SRC, 'construction.js'));
var Save = require(path.join(SRC, 'save.js'));
var Gen = global.Gen;

var pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail !== undefined ? '   ' + detail : '')); }
}
function section(n) { console.log('\n' + n); }

var SEED = 'kawartha';
var galaxy = Galaxy.build(SEED);
var cache = {};
function systemFor(star) {
  if (!cache[star.id]) cache[star.id] = Gen.generateSystem(star, { seed: SEED, galaxy: galaxy });
  return cache[star.id];
}
function portsOf(sys) {
  return sys.bodies.filter(function (b) { return b.market && b.docking !== false; });
}
var found = { yard: null, orbital: null };
for (var si = 0; si < galaxy.stars.length && !(found.yard && found.orbital); si++) {
  var st = galaxy.stars[si], sys0 = systemFor(st);
  portsOf(sys0).forEach(function (p) {
    var role = p.market && p.market.role;
    if (!found.yard && role === 'shipyard' && !p.surface && !p.underground) found.yard = { star: st, port: p };
    if (!found.orbital && role !== 'shipyard' && role !== 'highport' && role !== 'carrier' &&
        !p.surface && !p.underground && !p.fleet) found.orbital = { star: st, port: p };
  });
}

function makeG(at, hullId) {
  var sys = systemFor(at.star);
  var planet = sys.bodies.filter(function (b) { return b.kind === 'planet'; })[0];
  var ship = Sim.circularOrbit(planet, sys, 0, planet.radius * 0.6, 0.1, 0);
  Combat.initShip(ship);
  ship.cargo = {};
  if (hullId) ship.hullId = hullId;
  Sim.refreshShip(ship);
  ship.credits = 10000000;
  ship.docked = at.port.id;
  var G = { seed: SEED, ship: ship, sys: sys, t: 1000, galaxy: galaxy, here: at.star,
            standing: {}, wanted: {}, missions: [], doneMissions: {}, fleet: [],
            stationModules: [] };
  global.Game = G;
  return G;
}

/* ======================================================================== */
section('--- the Crawler ---');
(function () {
  var h = Combat.HULLS.crawler;
  check('there is a Crawler hull', !!h);
  check('one size, and it is the biggest there is', h.size === 'XL');
  var onFloor = 0;
  for (var s2 = 0; s2 < 30; s2++) {
    portsOf(systemFor(galaxy.stars[s2])).forEach(function (p) {
      for (var w = 0; w < 4; w++) if (Combat.hullsAt(p, w * Combat.HULL_WINDOW).indexOf('crawler') >= 0) onFloor++;
    });
  }
  check('built to order at a shipyard only, never on a floor', h.orderOnly && onFloor === 0, onFloor);
  check('she needs a crew', global.Crew.needsCrew({ hullId: 'crawler' }));
  check('commissioned like any XL', Combat.buildDays('crawler') === Combat.BUILD_DAYS.XL);
  /* The art. hulls.js is the generated library the renderer reads. */
  var HullLib = require(path.join(SRC, 'hulls.js'));
  check('three liveries are in the hull library',
        ['crawler_civilian', 'crawler_navy', 'crawler_syndicate'].every(function (id) {
          return HullLib && HullLib[id] && HullLib[id].f.length > 1000;
        }));
  var render = fs.readFileSync(path.join(SRC, 'render.js'), 'utf8');
  check('the renderer knows which model a Crawler wears', /crawler:\s*'crawler_civilian'/.test(render));
})();

section('--- the load rule ---');
(function () {
  var ship = { hullId: 'crawler', modules: [] };
  function load(ids) { ship.modules = ids.map(function (id, i) { return { id: 'x' + i, moduleId: id }; }); }
  load([]);
  check('one L fits', Cn.fits(ship, 'core'));
  load(['core']);
  check('and nothing beside it', !Cn.fits(ship, 'berth') && !Cn.fits(ship, 'market'));
  load(['market']);
  check('two M fit', Cn.fits(ship, 'hab'));
  load(['market', 'hab']);
  check('but not a third', !Cn.fits(ship, 'repair') && !Cn.fits(ship, 'berth'));
  load(['berth', 'battery']);
  check('three S fit', Cn.fits(ship, 'relay'));
  load(['berth', 'battery', 'relay']);
  check('but not a fourth', !Cn.fits(ship, 'fuelstore'));
  load(['market']);
  check('one M and one S ride together (Claude\'s reading, flagged)', Cn.fits(ship, 'berth'));
  load(['market', 'berth']);
  check('and then nothing more', !Cn.fits(ship, 'relay'));
  check('exactly one L module in the catalogue, and it is the core',
        Cn.MODULES.filter(function (m) { return m.size === 'L'; }).map(function (m) { return m.id; }).join() === 'core');
})();

section('--- built at a shipyard, core first ---');
(function () {
  if (!found.yard || !found.orbital) { check('found a shipyard and an ordinary port', false); return; }
  var G0 = makeG(found.orbital);
  check('an ordinary port builds no modules', /shipyard/.test(Cn.orderRefusal(G0, 'core') || ''));
  var G = makeG(found.yard);
  check('no M or S before there is a core', /core first/.test(Cn.orderRefusal(G, 'market') || '') &&
        /core first/.test(Cn.orderRefusal(G, 'berth') || ''));
  var before = G.ship.credits;
  var r = Cn.order(G, 'core', { pattern: 'ring' });
  check('the core is ordered, paid for now', r.ok && before - G.ship.credits === Cn.BY_ID.core.price, r.why);
  check('…in the pattern asked for', r.rec.pattern === 'ring');
  check('…due in its build time', r.rec.due === G.t + Cn.BY_ID.core.days * Cn.DAY);
  check('and now the M and S modules can be ordered', !Cn.orderRefusal(G, 'market') && !Cn.orderRefusal(G, 'berth'));
  var m = Cn.order(G, 'market');
  check('an M module has no pattern', m.ok && m.rec.pattern === null);
  G.ship.credits = 10;
  check('a module you cannot afford says so', /need/.test(Cn.orderRefusal(G, 'hab') || ''));
})();

section('--- loading a Crawler ---');
(function () {
  if (!found.yard) return;
  var G = makeG(found.yard);
  var core = Cn.order(G, 'core').rec;
  check('a ship that is not a Crawler carries none', /Crawler/.test(Cn.loadRefusal(G, core) || ''));
  G.ship.hullId = 'crawler';
  check('nothing comes off the slip early', /slip/.test(Cn.loadRefusal(G, core) || ''));
  G.t = core.due;
  check('a module coming off the slip is announced once',
        Cn.announce(G, G.t).length === 1 && Cn.announce(G, G.t).length === 0);
  var r = Cn.load(G, core.id);
  check('the core is craned aboard', r.ok && G.ship.modules.length === 1 && core.aboard, r.why);
  var berth = Cn.order(G, 'berth').rec;
  G.t = berth.due;
  check('with the core aboard the bay is full', /no room/.test(Cn.loadRefusal(G, berth) || ''));
  var docked = G.ship.docked;
  G.ship.docked = null;
  check('only a shipyard lifts a module off', !Cn.unload(G, core.id).ok);
  G.ship.docked = docked;
  check('the yard does', Cn.unload(G, core.id).ok && !core.aboard && G.ship.modules.length === 0);
  check('and then the berth fits', Cn.load(G, berth.id).ok);

  /* Saved, both halves. */
  var snap = Save.snapshot(Object.assign({ ledgerLog: [] }, G));
  check('the modules are saved', snap.stationModules && snap.stationModules.length === 2);
  check('and so is what is in the truss', snap.ship.modules && snap.ship.modules.length === 1);

  /* A Crawler with modules aboard is not traded or swapped away. */
  check('no new hull while modules ride in her', /truss/.test(Combat.buyHull(G, 'mule', false).why || ''));

  /* Lost with her. */
  var n = Cn.lostWith(G, G.ship);
  check('a Crawler lost is her load lost', n === 1 && Cn.owned(G).length === 1 && Cn.owned(G)[0].id === core.id);
  check('…and the core waiting at the yard is not touched', !core.aboard);
})();

section('--- elsewhere ---');
(function () {
  if (!found.yard || !found.orbital) return;
  var G = makeG(found.yard, 'crawler');
  var core = Cn.order(G, 'core').rec;
  G.t = core.due;
  G.sys = systemFor(found.orbital.star); G.here = found.orbital.star; G.ship.docked = found.orbital.port.id;
  check('a module waiting at another yard says where', /waiting at/.test(Cn.loadRefusal(G, core) || ''));
})();

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
