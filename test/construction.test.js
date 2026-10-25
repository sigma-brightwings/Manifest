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
  /* No geometry inside a cube's volume: the containers are drawn per cube
   * by the renderer, so a frame that still carried them would draw every
   * cube twice. (Was a face count, which every re-export broke.) */
  /* 1.02 of the half-size reaches just past the container's own walls: the
   * full model scores 22 faces there, the frame 0. */
  var cubeIn = [0.0481, 0.035, 0.0414], cubeHalf = 0.0837 / 2 * 1.02;
  var inside = 0, hv = HullLib.crawler_civilian.v;
  HullLib.crawler_civilian.f.forEach(function (face) {
    var c = [0, 1, 2].map(function (k) {
      return face.reduce(function (s, vi) { return s + hv[vi][k]; }, 0) / face.length;
    });
    if (c.every(function (x, k) { return Math.abs(x - cubeIn[k]) < cubeHalf; })) inside++;
  });
  check('the frames are imported without their containers (drawn per cube)', inside === 0, inside + ' faces inside cube 8');
  check('the renderer knows which model a Crawler wears', /crawler:\s*'crawler_civilian'/.test(render));
})();

section('--- the cubes ---');
(function () {
  /* Astra: "6 to a cube for S modules and 4 for M modules, 2 for L modules
   * and 1 for XL modules which are station component crates." */
  var ship = { hullId: 'crawler', modules: [], cargo: {} };
  function load(ids) { ship.modules = ids.map(function (id, i) { return { id: 'x' + i, crateId: id }; }); }
  function many(id, n) { var a = []; for (var i = 0; i < n; i++) a.push(id); return a; }
  check('24 cubes, and her packing', Cn.CUBES === 24 && Cn.PER_CUBE.S === 6 && Cn.PER_CUBE.M === 4 &&
        Cn.PER_CUBE.L === 2 && Cn.PER_CUBE.XL === 1);
  load(many('berth', 6));
  check('six S crates take one cube', Cn.crateCubes(ship.modules) === 1);
  load(many('berth', 7));
  check('a seventh takes a second', Cn.crateCubes(ship.modules) === 2);
  load(many('warehouse', 4));
  check('four M crates take one cube', Cn.crateCubes(ship.modules) === 1);
  load(many('market', 2));
  check('two L crates take one cube', Cn.crateCubes(ship.modules) === 1);
  load(['slipway', 'slipway']);
  check('an XL crate takes a cube to itself', Cn.crateCubes(ship.modules) === 2);
  load(['berth', 'warehouse', 'market', 'slipway']);
  check('one size to a cube: four sizes, four cubes', Cn.crateCubes(ship.modules) === 4);
  load(many('slipway', 24));
  check('a full Crawler takes no more', !Cn.fits(ship, 'berth'));
  load(many('slipway', 23));
  check('one free cube takes six S crates',
        Cn.fits(ship, 'berth') && (load(many('slipway', 23).concat(many('berth', 6))), !Cn.fits(ship, 'berth')));

  /* Freight in the cubes the crates leave. */
  load([]);
  check('empty, all 24 cubes are hold', Cn.capFor(ship) === 24 * Cn.TONNES_PER_CUBE);
  load(many('slipway', 4));
  check('crates take their cubes out of the hold', Cn.capFor(ship) === 20 * Cn.TONNES_PER_CUBE);
  load([]);
  ship.cargo = { water: 23 * Cn.TONNES_PER_CUBE + 1 };
  check('freight in 24 cubes leaves no room for a crate', !Cn.fits(ship, 'berth'));
  ship.cargo = { water: 23 * Cn.TONNES_PER_CUBE };
  check('freight in 23 leaves one cube', Cn.fits(ship, 'slipway'));

  /* What the renderer draws. */
  ship.cargo = { water: 30 };
  load(['slipway', 'berth', 'berth']);
  var lay = Cn.layout(ship);
  check('the layout: the XL crate, then the S crates, then freight, then empty',
        lay[0].kind === 'crate' && lay[0].size === 'XL' && lay[1].size === 'S' && lay[1].n === 2 &&
        lay[2].kind === 'freight' && lay[3].kind === 'freight' && lay[4] === null, JSON.stringify(lay.slice(0, 5)));
  check('the showroom Crawler is full of containers', Cn.fullLayout().every(function (c) { return c.kind === 'freight'; }));
})();

section('--- built at a shipyard, Crawler first ---');
(function () {
  if (!found.yard || !found.orbital) { check('found a shipyard and an ordinary port', false); return; }
  var G0 = makeG(found.orbital, 'crawler');
  check('an ordinary port builds no crates', /shipyard/.test(Cn.orderRefusal(G0, 'berth') || ''));
  var G = makeG(found.yard);
  check('no crates before you have a Crawler', /Crawler/.test(Cn.orderRefusal(G, 'berth') || ''));
  Combat.commission(G, 'crawler', { fit: {} });
  check('a Crawler on the slip is enough', !Cn.orderRefusal(G, 'berth'));
  var before = G.ship.credits;
  var r = Cn.order(G, 'slipway');
  check('a crate is ordered, paid for now', r.ok && before - G.ship.credits === Cn.BY_ID.slipway.price, r.why);
  check('…due in its build time', r.rec.due === G.t + Cn.BY_ID.slipway.days * Cn.DAY);
  G.ship.credits = 10;
  check('a crate you cannot afford says so', /need/.test(Cn.orderRefusal(G, 'berth') || ''));
  check('every size is in the catalogue', ['S', 'M', 'L', 'XL'].every(function (z) {
    return Cn.CRATES.some(function (c) { return c.size === z; });
  }));
})();

section('--- loading a Crawler ---');
(function () {
  if (!found.yard) return;
  var G = makeG(found.yard, 'crawler');
  Combat.syncLegacy(G.ship);
  check('an empty Crawler\'s hold is all 24 cubes', G.ship.cargoCap === 24 * Cn.TONNES_PER_CUBE, G.ship.cargoCap);
  var slip = Cn.order(G, 'slipway').rec;
  G.ship.hullId = 'talon';
  G.t = slip.due;
  check('a ship that is not a Crawler carries none', /Crawler/.test(Cn.loadRefusal(G, slip) || ''));
  G.ship.hullId = 'crawler';
  var berth = Cn.order(G, 'berth').rec;
  check('nothing comes off the slip early', /slip/.test(Cn.loadRefusal(G, berth) || ''));
  check('a crate coming off the slip is announced once',
        Cn.announce(G, G.t).length === 1 && Cn.announce(G, G.t).length === 0);
  var r = Cn.load(G, slip.id);
  check('the slipway is craned aboard', r.ok && G.ship.modules.length === 1 && slip.aboard, r.why);
  check('…and her hold gives up that cube', G.ship.cargoCap === 23 * Cn.TONNES_PER_CUBE, G.ship.cargoCap);
  var docked = G.ship.docked;
  G.ship.docked = null;
  check('only a shipyard lifts a crate off', !Cn.unload(G, slip.id).ok);
  G.ship.docked = docked;
  check('the yard does, and the cube is hold again',
        Cn.unload(G, slip.id).ok && !slip.aboard && G.ship.cargoCap === 24 * Cn.TONNES_PER_CUBE);
  Cn.load(G, slip.id);

  var snap = Save.snapshot(Object.assign({ ledgerLog: [] }, G));
  check('the crates are saved', snap.stationModules && snap.stationModules.length === 2);
  check('and so is what is in her cubes', snap.ship.modules && snap.ship.modules.length === 1);

  check('no new hull while crates ride in her', /truss/.test(Combat.buyHull(G, 'mule', false).why || ''));

  var n = Cn.lostWith(G, G.ship);
  check('a Crawler lost is her load lost', n === 1 && Cn.owned(G).length === 1 && Cn.owned(G)[0].id === berth.id);
})();

section('--- elsewhere ---');
(function () {
  if (!found.yard || !found.orbital) return;
  var G = makeG(found.yard, 'crawler');
  var c = Cn.order(G, 'berth').rec;
  G.t = c.due;
  G.sys = systemFor(found.orbital.star); G.here = found.orbital.star; G.ship.docked = found.orbital.port.id;
  check('a crate waiting at another yard says where', /waiting at/.test(Cn.loadRefusal(G, c) || ''));
})();

section('--- what a load founds ---');
(function () {
  function get(list, id) { return Cn.canFound(list).filter(function (f) { return f.id === id; })[0]; }
  var m = get(['market', 'warehouse', 'quarters'], 'market');
  check('market + warehouse + crew quarters founds a market station', m.ok && !m.missing.length);
  var noHab = get(['market', 'warehouse'], 'market');
  check('without crew quarters it does not — every crewed station needs a hab',
        !noHab.ok && noHab.missing.join() === 'quarters' && noHab.defining);
  var hab = get(['habring', 'berth', 'quarters'], 'hab');
  check('a passenger hab wants two berths, and says one is missing', !hab.ok && hab.missing.join() === 'berth');
  var sk = get([{ crateId: 'skimrig' }, { crateId: 'refinery' }, { crateId: 'quarters' }], 'skimmer');
  check('records work as well as ids (skimmer: skimrig + refinery)', sk.ok);
  var xl = get(['slipway', 'repair', 'quarters'], 'shipyardXL');
  var yd = get(['slipway', 'repair', 'quarters'], 'shipyard');
  check('one Crawler founds a shipyard', yd.ok);
  check('…but never an XL shipyard: that is two stitched', !xl.ok && xl.missing.join() === 'second Crawler');
  check('nothing aboard founds nothing', Cn.canFound([]).every(function (f) { return !f.ok && !f.defining; }));
})();

section('--- her craft bay ---');
(function () {
  check('her pads are two S and one M, as the model has them', Cn.PADS.join() === 'S,S,M');
  check('every loadout fits her pads', Cn.LOADOUTS.every(function (l) { return !!Cn.padsFor(l.craft); }));
  check('three S craft fit (the third on the M pad)', (Cn.padsFor(['tug', 'tug', 'shuttle']) || []).join() === 'S,S,M');
  check('two S and one M fit, the M craft on the M pad', (Cn.padsFor(['tugM', 'tug', 'shuttle']) || []).join() === 'M,S,S');
  check('two M craft do not', Cn.padsFor(['tugM', 'shuttleM']) === null);
  check('four craft do not', Cn.padsFor(['tug', 'tug', 'tug', 'shuttle']) === null);
  check('every loadout carries a tug — only tugs have grab arms', Cn.LOADOUTS.every(function (l) {
    return l.craft.some(function (c) { return Cn.CRAFT[c].unpack > 0; });
  }));
  check('the heavy shuttle and heavy tug are M craft', Cn.CRAFT.shuttleM.size === 'M' && Cn.CRAFT.tugM.size === 'M');
  check('every craft is a real hull you can also fly, priced the same', Object.keys(Cn.CRAFT).every(function (k) {
    var c = Cn.CRAFT[k], h = Combat.HULLS[c.hull];
    return h && h.price === c.price && h.size === c.size;
  }));
  check('her bay only ever takes her tugs and shuttles',
        Cn.bayTakes('tug') && Cn.bayTakes('tugM') && Cn.bayTakes('shuttle') && Cn.bayTakes('shuttleM') &&
        !Cn.bayTakes('bollard') && !Cn.bayTakes('dart') && !Cn.bayTakes('crawler') && !Cn.bayTakes('toString'));
  check('every loadout is made only of bay craft', Cn.LOADOUTS.every(function (l) {
    return l.craft.every(Cn.bayTakes);
  }));
  check('the M tug unloads faster than an S tug, but not double',
        Cn.CRAFT.tugM.unpack > Cn.CRAFT.tug.unpack && Cn.CRAFT.tugM.unpack < 2 * Cn.CRAFT.tug.unpack);
  check('…so on the M pad it beats the S tug that would sit there',
        Cn.buildDaysFor(['market'], Cn.LOADOUT_BY_ID.heavyorbit, false) <
        Cn.buildDaysFor(['market'], Cn.LOADOUT_BY_ID.orbital, false));
  check('a heavy tug alone still builds', isFinite(Cn.buildDaysFor(['berth'], Cn.LOADOUT_BY_ID.heavytug, false)));
  var std = Cn.LOADOUT_BY_ID.standard, orb = Cn.LOADOUT_BY_ID.orbital, pl = Cn.LOADOUT_BY_ID.planetary;
  check('a Crawler comes with the standard bay', Cn.loadoutOf({ hullId: 'crawler' }) === std);
  check('anything else has no bay', Cn.loadoutOf({ hullId: 'mule' }) === null);
  var load = ['market', 'warehouse', 'quarters'];
  check('more tugs: faster in orbit', Cn.buildDaysFor(load, orb, false) < Cn.buildDaysFor(load, std, false));
  check('the heavy shuttle: faster to the surface',
        Cn.buildDaysFor(load, pl, true) < Cn.buildDaysFor(load, std, true));
  check('three tugs and no shuttle cannot reach a surface site', Cn.buildDaysFor(load, orb, true) === Infinity);
  check('no tugs, no building', Cn.buildDaysFor(load, { craft: ['shuttle'] }, false) === Infinity);
  check('an empty load takes no time', Cn.buildDaysFor([], std, true) === 0);
  check('refit cost: a new tug in, the shuttle traded at seven tenths',
        Cn.loadoutCost('standard', 'orbital') === 44000 - Math.round(18000 * 0.7));
  check('going back pays most of it back',
        Cn.loadoutCost('orbital', 'standard') === 18000 - Math.round(44000 * 0.7));

  if (!found.yard || !found.orbital) return;
  var G = makeG(found.yard, 'crawler');
  G.ship.credits = 100000;
  var r = Cn.changeLoadout(G, 'orbital');
  check('a yard refits her bay, for the difference',
        r.ok && G.ship.craftBay === 'orbital' && G.ship.credits === 100000 - r.cost, r.why);
  check('not to the bay she already has', !Cn.changeLoadout(G, 'orbital').ok);
  check('her bay is saved', Save.snapshot(Object.assign({ ledgerLog: [] }, G)).ship.craftBay === 'orbital');
  G.ship.docked = found.orbital.port.id;
  G.sys = systemFor(found.orbital.star); G.here = found.orbital.star;
  check('only a shipyard refits it', /shipyard/.test(Cn.changeLoadout(G, 'standard').why || ''));
  var H = makeG(found.yard, 'mule');
  check('only a Crawler has a craft bay', /Crawler/.test(Cn.changeLoadout(H, 'orbital').why || ''));
})();

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
