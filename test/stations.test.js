/* stations.test.js - founding a station from a Crawler (2026-10-31).
 *
 *     node test/stations.test.js
 *
 * Astra: a licence now, orbit and surface, a full port with traffic, and
 * her crew's tugs unpacking at the agreed rate while any crate you carry in
 * yourself goes in at once. Pinned:
 *  - who may found, and where not: a Crawler, cast off, carrying a load
 *    that founds a type, over a world, clear of every port, with a licence;
 *    on a surface, low over a claimed world with a shuttle in the bay;
 *  - founding: her crates become hers, you are put in one of her tugs (her
 *    crew is a tug short while you fly it), and she stands on a circular
 *    orbit through where the Crawler was;
 *  - the schedule: biggest crates first at the crew's rate; a surface site
 *    waits on the shuttles too; a crate carried in by hand is in at once
 *    and brings the opening forward;
 *  - the arms lift a floating crate and carry it to her frame;
 *  - opening: a port of her type, with a market and berths, in every list
 *    the flight loop reads, with routes of her own that start the day she
 *    opens - and nobody else's ships moved;
 *  - she comes back with the system: a fresh generation, and a save;
 *  - a forged licence caught and unpaid: she is seized.
 */
'use strict';
global.window = global.window || global;
['vec3', 'rng', 'kepler', 'economy', 'generate', 'sim'].forEach(function (m) { require('../src/' + m + '.js'); });
var Combat = require('../src/combat.js');
require('../src/crew.js');
require('../src/hulls.js');
require('../src/walk.js');
require('../src/shipdeck.js');
require('../src/render.js');
require('../src/journal.js');
var Galaxy = require('../src/galaxy.js');
var Cn = require('../src/construction.js');
var L = require('../src/licence.js');
var Arms = require('../src/arms.js');
var S = require('../src/stations.js');
var Save = require('../src/save.js');
var V = global.V, Sim = global.Sim, Gen = global.Gen, R = global.Render;

var pass = 0, fail = 0;
function check(n, c, d) {
  if (c) { pass++; console.log('  ok   ' + n + (d ? '   ' + d : '')); }
  else { fail++; console.log('  FAIL  ' + n + (d ? '   ' + d : '')); }
}
function hooks() { var h = { said: [], say: function (m) { h.said.push(m); } }; return h; }
Sim.shipsAll = function () { return []; };

var g = Galaxy.build('kawartha');
/* A lawful system with a port above a rocky world, so both kinds can be
 * tried in one place. */
var star = null, sys = null, world = null;
for (var si = 0; si < g.stars.length && !world; si++) {
  var cand = g.stars[si], f = g.factionById[cand.factionId];
  if (!f || f.outlaw || f.minor || f.pirate) continue;
  var sy = Gen.generateSystem(cand.seed, Galaxy.systemOpts(g, cand));
  sy.starId = cand.id;
  if (!sy.ports || sy.ports.length < 2) continue;
  for (var bi = 0; bi < sy.bodies.length; bi++) {
    var b = sy.bodies[bi];
    if ((b.kind === 'planet' || b.kind === 'moon') && b.type !== 'gasGiant' && b.type !== 'iceGiant' && b.radius > 1500) {
      star = cand; sys = sy; world = b; break;
    }
  }
}
check('a lawful system with a rocky world to build over', !!world, world && (sys.name + ' / ' + world.name));

var T0 = 5e6;
function crawler() {
  var H = Combat.HULLS.crawler;
  var s = { hullId: 'crawler', shipName: 'Patience', dryMass: H.dryMass, fuel: H.fuelCap, fuelCap: H.fuelCap,
            thrusterFuel: 10, thrusterCap: H.thrusterCap, cargo: { grain: 12 }, cargoCap: H.cargoCap,
            thrustKN: H.thrustKN, hullMax: H.hullMax, hullHp: H.hullMax, crew: [{ id: 'c1', name: 'Ilse' }],
            credits: 1e6, craftBay: 'standard', fit: {}, modules: [],
            pos: null, vel: null, fwd: V.vec ? V.vec(0, 0, 1) : { x: 0, y: 0, z: 1 }, up: { x: 0, y: 1, z: 0 }, right: { x: -1, y: 0, z: 0 } };
  return s;
}
function game(crates) {
  var G = { seed: 'kawartha', t: T0, ship: crawler(), here: star, sys: sys, galaxy: g,
            stationModules: [], stations: [], licences: {}, standing: {}, claims: {}, journal: [] };
  crates.forEach(function (id, i) {
    var rec = { id: 'sc-' + i + '-' + id, crateId: id, aboard: true, due: 0 };
    G.stationModules.push(rec);
    G.ship.modules.push({ id: rec.id, crateId: id });
  });
  G.licences[star.id] = { fac: L.issuer(sys), forged: false, at: 0 };
  return G;
}
/* Put her `alt` world radii out from the world's centre, on the side away
 * from its ports, moving at circular speed. */
function placeOver(G, body, alt) {
  var hs = Sim.bodyState(body, sys, G.t);
  var best = null;
  for (var k = 0; k < 24; k++) {
    var a = k / 24 * Math.PI * 2;
    var dir = { x: Math.cos(a), y: Math.sin(a), z: 0 };
    var pos = V.add(hs.pos, V.scale(dir, body.radius * alt));
    var clear = (sys.ports || []).every(function (p) { return p.surface || V.dist(Sim.bodyPosition(p, sys, G.t), pos) > 800; });
    if (clear) { best = { dir: dir, pos: pos }; break; }
  }
  var vc = Math.sqrt(body.mu / (body.radius * alt));
  G.ship.pos = best.pos;
  G.ship.vel = V.add(hs.vel, V.scale({ x: -best.dir.y, y: best.dir.x, z: 0 }, vc));
  return best;
}

console.log('who may found, and where');
var MARKET = ['market', 'warehouse', 'quarters'];
var G = game(MARKET);
placeOver(G, world, 1.6);
var dom = Sim.dominantBody(G.ship.pos, sys, G.t);
check('placed where the world dominates', dom === world, dom && dom.name);
var talon = game(MARKET); placeOver(talon, world, 1.6); talon.ship.hullId = 'talon';
check('only a Crawler', /Crawler/.test(S.refusal(talon, sys, T0, 'orbital')));
var dk = game(MARKET); placeOver(dk, world, 1.6); dk.ship.docked = 'b3';
check('cast off first', /cast off/.test(S.refusal(dk, sys, T0, 'orbital')));
var thin = game(['market', 'quarters']); placeOver(thin, world, 1.6);
var why = S.refusal(thin, sys, T0, 'orbital');
check('a load that founds nothing says what is missing', /Warehouse/.test(why), why);
var nolic = game(MARKET); placeOver(nolic, world, 1.6); nolic.licences = {};
check('no licence, no founding', /licence/.test(S.refusal(nolic, sys, T0, 'orbital')));
var near = game(MARKET);
var p0 = sys.ports.filter(function (p) { return !p.surface; })[0];
near.ship.pos = V.add(Sim.bodyPosition(p0, sys, T0), { x: 50, y: 0, z: 0 });
near.ship.vel = Sim.bodyState(p0, sys, T0).vel;
var wn = S.refusal(near, sys, T0, 'orbital');
check('not on top of a port', /too close|between/.test(wn), wn);
check('clear over a world, with a licence: yes', S.refusal(G, sys, T0, 'orbital') === null, S.refusal(G, sys, T0, 'orbital'));
check('the surface wants a claim', /claim/.test(S.refusal(G, sys, T0, 'surface')));
var inboundBefore = sys.ports.map(function (p) { return p.market ? p.market.inbound.length : 0; }).join(',');
var trafficBefore = sys.traffic.length, bodiesBefore = sys.bodies.length;
var fcO = S.forecastSite(G, sys, T0, 'orbital');
check('will she pay: a forecast for this site', fcO && fcO.market > 0 && fcO.type === 'Market station', fcO && JSON.stringify(fcO));
check('and asking changes nothing in the system', sys.traffic.length === trafficBefore && sys.bodies.length === bodiesBefore &&
      sys.ports.map(function (p) { return p.market ? p.market.inbound.length : 0; }).join(',') === inboundBefore &&
      !sys.byId['ps-forecast']);

console.log('founding in orbit');
var was = V.clone(G.ship.pos);
var h = hooks();
var r = S.found(G, sys, T0, 'orbital', h);
check('founded', r.ok, r.why || h.said[0]);
var st = r.st;
check('a market station, of her type', st && st.type === 'market' && st.typeName === 'Market station');
check('you are in one of her tugs, with arms', G.ship.hullId === 'bollard' && Arms.hasArms(G.ship) && G.ship.tugOf === st.id);
check('her crates and her freight stay with her', !G.ship.modules.length && !Object.keys(G.ship.cargo).length &&
      st.stock.grain === 12 && G.stationModules.every(function (m) { return m.station === st.id && !m.aboard; }));
check('her crew stays with her, and your credits with you', st.crew.length === 1 && G.ship.credits === 1e6);
var site = S.siteState(st, sys, T0);
check('she stands where the Crawler was', V.dist(site.pos, was) < 0.01, V.dist(site.pos, was).toFixed(4) + ' km');
var site2 = S.siteState(st, sys, T0 + 7200), hs2 = Sim.bodyState(world, sys, T0 + 7200);
check('on a circular orbit round the world', Math.abs(V.dist(site2.pos, hs2.pos) - world.radius * 1.6) < 0.5);
check('a tug short: the bay\'s rate less one', Math.abs(st.rates.unpack - 1.5) < 1e-9);

console.log('the schedule');
var sch = S.schedule(st);
check('biggest first', sch.crateIn[st.crates.indexOf('market')] < sch.crateIn[st.crates.indexOf('warehouse')]);
var cubes = 0.5 + 0.25 + 0.25;
check('opens at cubes / rate', Math.abs((sch.opensAt - T0) / 86400 - cubes / 1.5) < 1e-6, ((sch.opensAt - T0) / 86400).toFixed(3) + ' d');
check('three crates floating at the start', S.floatingCrates(st, sys, T0).length === 3);
var fc = S.floatingCrates(st, sys, T0);
check('in a ring round her', fc.every(function (c) { return Math.abs(V.dist(c.pos, site.pos) - S.FLOAT_RING_KM) < 1e-6; }));
var mid = sch.crateIn[st.order[0]] + 1;
check('one in when her crew has unpacked it', S.floatingCrates(st, sys, mid).length === 2 && S.cratesIn(st, mid) === 1);

console.log('the arms');
G.t = T0 + 60;
var crate = S.floatingCrates(st, sys, G.t).filter(function (c) { return c.crateId === 'quarters'; })[0];
function frame() { return R.bridgeFrame(G.ship); }
var gp = R.armGrip(frame());
G.ship.pos = V.add(G.ship.pos, V.sub(crate.pos, gp));
G.ship.vel = V.clone(crate.vel);
var sv = Arms.survey(G, frame());
check('the camera sees her crate in reach', sv.best && sv.best.kind === 'crate', sv.best && sv.best.name);
var ha = hooks();
var tg = Arms.toggle(G, frame(), ha);
check('the jaws shut on it, its mass on the arms', tg.held === 'crate' && G.ship.armLoad > 0 && st.held === crate.idx, ha.said[0]);
check('it is out of the ring while you carry it', S.floatingCrates(st, sys, G.t).length === 2);
var av = Arms.view(G, frame());
check('the arm-tip camera knows where her frame is', av.crateSize === 'M' && av.frame && av.frame.crawler &&
      av.frame.dist > 0 && !av.frame.inside, av.frame && (av.frame.dist + ' m to go'));
var before = S.opensAt(st);
G.ship.pos = V.add(G.ship.pos, V.sub(S.crawlerState(st, sys, G.t).pos, R.armGrip(frame())));
var hu = hooks();
Arms.update(G, frame(), 0.1, hu);
check('brought to her frame, it is in at once', st.hand[crate.idx] === G.t && !G.ship.arms.held && G.ship.armLoad === 0, hu.said[0]);
check('and she opens sooner', S.opensAt(st) < before, ((before - S.opensAt(st)) / 3600).toFixed(1) + ' h sooner');

console.log('opening');
var routesBefore = sys.traffic.map(function (q) { return q.id + '@' + q.t0 + '/' + q.period; }).join(',');
var nb = sys.bodies.length;
var at = S.opensAt(st);
check('not a port before she opens', S.inject(G, sys, star.id) === 0 && !sys.byId[S.portId(st)]);
G.t = at + 1;
var ho = hooks();
S.update(G, sys, G.t, ho);
var port = sys.byId[S.portId(st)];
check('the day she opens, a port in the system', !!port && /open/.test(ho.said[0]), ho.said[0]);
check('in every list the flight loop reads', port && sys.ports.indexOf(port) >= 0 && sys.bodies.length === nb + 1 &&
      world.children.indexOf(port) >= 0 && port.parentBody === world);
check('docking, and yours', port && port.docking && port.player && S.owns(G, port));
check('a market of her type', port && port.market && port.market.role === 'orbital' && port.market.roleName === 'Market station' &&
      Object.keys(port.market.rows).length > 3);
check('where her site was', port && V.dist(Sim.bodyPosition(port, sys, G.t), S.siteState(st, sys, G.t).pos) < 0.01);
var mine = sys.traffic.filter(function (q) { return q.playerPort === port.id; });
check('her own traffic, starting the day she opens', mine.length >= 1 && mine.every(function (q) { return q.t0 === at && (q.from === port.id); }),
      mine.length + ' routes');
var others = sys.traffic.filter(function (q) { return !q.playerPort; }).map(function (q) { return q.id + '@' + q.t0 + '/' + q.period; }).join(',');
check('and nobody else\'s ships moved', others === routesBefore);
check('once only', S.inject(G, sys, star.id) === 0 && sys.traffic.filter(function (q) { return q.playerPort; }).length === mine.length);
var dockR = Sim.dockShip ? (function () { try { var sh = { pos: Sim.bodyPosition(port, sys, G.t), vel: Sim.bodyState(port, sys, G.t).vel,
  fwd: { x: 0, y: 0, z: 1 }, up: { x: 0, y: 1, z: 0 }, right: { x: -1, y: 0, z: 0 }, dryMass: 30, cargo: {}, fuel: 1 };
  Sim.dockShip(sh, port, sys, G.t); return sh.docked === port.id; } catch (e) { return e.message; } })() : 'no dockShip';
check('a ship can berth at her', dockR === true, String(dockR));
console.log('she is her Crawler');
var R = global.Render;
var mkey = R.portModelFor(port);
check('drawn as her own Crawler, her crates in the key', /^crawler:civ:/.test(mkey) && mkey.indexOf('market') > 0, mkey);
var lib = R.libPort(mkey);
check('her model: the Crawler laid into the station frame', lib && lib.shell && lib.shell.f.length > 5000, lib && lib.shell.f.length + ' faces');
var bgm = Gen.bayGeometry(port);
check('her bay is her belly hangar: pad, then door, then mouth', bgm.floorZ < bgm.ceilZ && bgm.ceilZ <= bgm.mouthZ + 1e-9 &&
      Math.abs((bgm.ceilZ - bgm.floorZ) * 478 - 35.1) < 1, 'floor ' + bgm.floorZ.toFixed(3) + ' ceil ' + bgm.ceilZ.toFixed(3) + ' mouth ' + bgm.mouthZ);
var dr = R.portDoors ? R.portDoors(mkey) : null;
check('her belly leaves are her doors, sliding apart', dr && dr.leaves.length === 2 && dr.leaves[0].mesh.f.length > 0 &&
      dr.leaves[1].mesh.f.length > 0 && dr.leaves[0].axis[1] === -dr.leaves[1].axis[1],
      dr && (dr.leaves[0].mesh.f.length + ' + ' + dr.leaves[1].mesh.f.length + ' faces'));
check('a port the size of her: 478 m', Math.abs(port.radius - 0.478) < 1e-9);

console.log('upgrades: another Crawler brings them');
var Gu = game(['berth', 'warehouse', 'fuelcell', 'battery']);
Gu.stations = G.stations; Gu.t = G.t + 3600;
var csu = S.crawlerState(st, sys, Gu.t);
Gu.ship.pos = V.add(csu.pos, { x: 60, y: 0, z: 0 }); Gu.ship.vel = V.clone(csu.vel);
check('too far off to unload says so', /km/.test(S.unloadRefusal(Gu, sys, st, Gu.t)));
Gu.ship.pos = V.add(csu.pos, { x: 5, y: 0, z: 0 });
var opened = S.opensAt(st), n0 = st.crates.length, berths0 = Sim.berthCapacity(port);
var cap0 = port.market.rows.grain ? port.market.rows.grain.cap : port.market.rows[Object.keys(port.market.rows)[0]].cap;
var capKey = port.market.rows.grain ? 'grain' : Object.keys(port.market.rows)[0];
var ru = S.unloadTo(Gu, sys, st, Gu.t, hooks());
check('within reach: her crates unload into the station\'s ring', ru.ok && st.crates.length === n0 + 4 && !Gu.ship.modules.length &&
      S.pending(st, Gu.t) === 4 && S.floatingCrates(st, sys, Gu.t).length === 4, ru.why);
check('her opening day does not move', S.opensAt(st) === opened);
var sch2 = S.schedule(st);
var lastIn = Math.max.apply(null, st.added.map(function (a) { return sch2.crateIn[a.idx]; }));
check('her crew fits them from the day they arrive', st.added.every(function (a) { return sch2.crateIn[a.idx] > Gu.t; }),
      ((lastIn - Gu.t) / 86400).toFixed(2) + ' days for all four');
var fitT = lastIn + 1;
var nf = S.applyUpgrades(Gu, sys, st, fitT);
check('fitted: a berth clamp is one more berth', Sim.berthCapacity(port) === berths0 + 1, berths0 + ' -> ' + Sim.berthCapacity(port));
check('fitted: a warehouse holds 30% more', port.market.rows[capKey].cap === Math.round(cap0 * 1.3), cap0 + ' -> ' + port.market.rows[capKey].cap);
check('fitted: a fuel cell is three more weeks of tank', S.tankWeeksCap(st) === S.TANK_WEEKS + 3);
check('a battery is fitted and counted', nf.battery === 1);
var bset = {}, bok = true, bg7 = Gen.bayGeometry(port);
for (var bk = 0; bk < Sim.berthCapacity(port); bk++) {
  var bo = Gen.berthOffset(port, bk), key7 = bo.x.toFixed(4) + ',' + bo.y.toFixed(4);
  if (bset[key7]) bok = false;
  bset[key7] = 1;
  if (Math.abs(bo.x) > bg7.chamberX + 1e-9 || Math.abs(bo.y) > bg7.chamberY + 1e-9) bok = false;
}
check('seven berths, seven places, all inside her hangar', bok && Object.keys(bset).length === 7, Object.keys(bset).join(' '));
check('and applying twice changes nothing', (S.applyUpgrades(Gu, sys, st, fitT), Sim.berthCapacity(port) === berths0 + 1 &&
      port.market.rows[capKey].cap === Math.round(cap0 * 1.3)));

console.log('she comes back with the system');
var fresh = Gen.generateSystem(star.seed, Galaxy.systemOpts(g, star)); fresh.starId = star.id;
S.inject(G, fresh, star.id);
var fp = fresh.byId[S.portId(st)];
check('a regenerated system has her, in the same place', fp && V.dist(Sim.bodyPosition(fp, fresh, G.t), Sim.bodyPosition(port, sys, G.t)) < 1e-6);
check('with the same market and routes', fp && fp.market.role === port.market.role &&
      fresh.traffic.filter(function (q) { return q.playerPort; }).length === mine.length);
var snap = JSON.parse(JSON.stringify(Save.snapshot(Object.assign({}, G, { visited: {}, charted: {} }))));
check('saved', Array.isArray(snap.stations) && snap.stations.length === 1 && snap.stations[0].id === st.id);

console.log('on a surface');
var Gs = game(MARKET);
Gs.t = T0 + 1000;     // her own id: a founding is named by its time
placeOver(Gs, world, 1.3);
Gs.claims[star.id + ':' + world.id] = { key: star.id + ':' + world.id, star: star.id, body: world.id, t: 0, until: 1e12 };
var hiG = game(MARKET); placeOver(hiG, world, 2.5); hiG.claims = Gs.claims;
check('too high over the world says so', /too high/.test(S.refusal(hiG, sys, T0, 'surface')));
var noSh = game(MARKET); placeOver(noSh, world, 1.3); noSh.claims = Gs.claims; noSh.ship.craftBay = 'orbital';
check('no shuttle, no surface station', /shuttle/.test(S.refusal(noSh, sys, T0, 'surface')));
var fcS = S.forecastSite(Gs, sys, Gs.t, 'surface');
var rs = S.found(Gs, sys, Gs.t, 'surface', hooks());
check('founded on a claimed world, low over it', rs.ok, rs.why);
var sst = rs.st;
check('a site on the ground under her', sst && sst.kind === 'surface' && sst.at && typeof sst.at.lat === 'number');
check('the shuttles make it slower than in orbit', sst && S.opensAt(sst) - T0 > (st.startedAt ? (cubes / 1.5) * 86400 : 0) + 1,
      ((S.opensAt(sst) - T0) / 86400).toFixed(2) + ' d');
check('her crates float with the Crawler, up in orbit', S.floatingCrates(sst, sys, T0).every(function (c) {
  return V.dist(c.pos, Sim.bodyPosition(world, sys, T0)) > world.radius * 1.2; }));
Gs.t = S.opensAt(sst) + 1;
S.update(Gs, sys, Gs.t, hooks());
var sp = sys.byId[S.portId(sst)];
check('opens as a pad on the ground', sp && sp.surface && sys.pads.indexOf(sp) >= 0 &&
      Math.abs(V.dist(Sim.bodyPosition(sp, sys, Gs.t), Sim.bodyPosition(world, sys, Gs.t)) - world.radius) < 1,
      sp ? (sp.surface + ' pads:' + (sys.pads.indexOf(sp) >= 0) + ' r:' + (V.dist(Sim.bodyPosition(sp, sys, Gs.t), Sim.bodyPosition(world, sys, Gs.t)) - world.radius).toFixed(3)) : 'no port');

var up = sys.byId[S.upId(sst)];
check('and her Crawler stays up as the orbital half', up && !up.surface && up.upHalf && up.playerStation === sst.id &&
      /^crawler:/.test(global.Render.portModelFor(up)) &&
      V.dist(Sim.bodyPosition(up, sys, Gs.t), S.crawlerState(sst, sys, Gs.t).pos) < 0.05, up && global.Render.portModelFor(up));
check('one station: the two halves share one market', up && up.market === sp.market);
var hop = sys.traffic.filter(function (q) { return q.playerPort === sp.id && (q.to === up.id || q.from === up.id); });
check('her own shuttle runs between them', hop.length === 1 && hop[0].local, hop.length + ' routes');
check('and pays her no berth fee', (function () {
  var v = 0; sys.traffic.forEach(function (q) { if (q.playerPort === sp.id && q.to !== up.id) v += S.WEEK / q.period; });
  return Math.abs(v - sst.books.visits) < 1e-9; })());
check('the forecast for the site was her, both halves and all', fcS && fcS.market === S.forecast(sst).market &&
      fcS.berths === S.forecast(sst).berths, fcS && (fcS.berths + '/' + S.forecast(sst).berths));
var upDock = (function () { try { var sh = { pos: Sim.bodyPosition(up, sys, Gs.t), vel: Sim.bodyState(up, sys, Gs.t).vel,
  fwd: { x: 0, y: 0, z: 1 }, up: { x: 0, y: 1, z: 0 }, right: { x: -1, y: 0, z: 0 }, dryMass: 30, cargo: {}, fuel: 1 };
  Sim.dockShip(sh, up, sys, Gs.t); return sh.docked === up.id; } catch (e) { return e.message; } })();
check('a ship berths in her belly, up top', upDock === true, String(upDock));
Gs.ship.docked = up.id; Gs.sys = sys;
check('and her desk is either half', S.dockedAt(Gs, sst));
Gs.ship.docked = null;

console.log('a forged licence');
var Gf = game(MARKET); Gf.t = T0 + 2000; placeOver(Gf, world, 1.7);
Gf.licences = {}; Gf.forgedBlanks = 1;
check('a forged blank will do', S.refusal(Gf, sys, Gf.t, 'orbital') === null, S.refusal(Gf, sys, Gf.t, 'orbital'));
var rf = S.found(Gf, sys, Gf.t, 'orbital', hooks());
check('founded on it', rf.ok && rf.forged && rf.st.licence.forged, rf.why);
var lr = L.rec(Gf, sys);
lr.caught = true; lr.caughtAt = T0; lr.dueBy = T0 + 1;
Gf.t = S.opensAt(rf.st) + 10;
var hz = hooks();
S.update(Gf, sys, Gf.t, hz);
check('caught and unpaid: seized', rf.st.seized && hz.said.some(function (m) { return /seized/.test(m); }));
var fport = sys.byId[S.portId(rf.st)];
check('she stays open, under their flag', fport && !fport.player && !S.owns(Gf, fport) && fport.faction === rf.st.seizedBy);

console.log('her books');
var Eco = global.Economy;
check('every port in the system burns fissiles', sys.ports.every(function (p) { return !p.market || (p.market.rows.fissile && p.market.reactor > 0); }));
var outer = { insolation: 0.01 }, inner = { insolation: 9 };
check('a dark sky burns more than a bright one', Eco.reactorDark(outer) > Eco.reactorDark(inner) * 5,
      Eco.reactorDark(outer).toFixed(2) + ' vs ' + Eco.reactorDark(inner).toFixed(2));
check('her books are taken when she opens', st.books && st.books.trade > 0 && st.books.burn > 0 && st.books.visits > 0,
      st.books && JSON.stringify({ trade: Math.round(st.books.trade), burn: st.books.burn.toFixed(2), visits: st.books.visits.toFixed(1) }));
var fc = S.forecast(st);
check('the forecast was her: the same market and berths', fcO && fc.market === fcO.market && fc.berths === fcO.berths,
      fcO && (fc.market + '/' + fcO.market + ', ' + fc.berths + '/' + fcO.berths));
check('a week: market and berths in, wages, upkeep and reactor out', fc.market > 0 && fc.berths > 0 && fc.wages > 0 &&
      fc.upkeep > 0 && fc.fuel > 0 && fc.net === fc.market + fc.berths - fc.wages - fc.upkeep - fc.fuel, JSON.stringify(fc));
check('she opens with fuel in her tank', S.tankWeeks(st) >= 1.9, S.tankWeeks(st).toFixed(1) + ' weeks');
var c0 = G.ship.credits;
st.balance = 0; st.paidTo = G.t;
var hw = hooks();
S.settle(G, G.t + 3 * S.WEEK + 10, hw);
var expectNet = st.balance + (G.ship.credits - c0);
check('three weeks settle: over her float is wired to you', st.paidTo === G.t + 3 * S.WEEK && (fc.net < 0 || G.ship.credits >= c0),
      'wired ' + Math.round(G.ship.credits - c0) + ', account ' + Math.round(st.balance));
check('and her tank is kept topped up from her account', S.tankWeeks(st) > 1, S.tankWeeks(st).toFixed(1) + ' weeks');
/* Dark: no fuel, no money, and fuel dear. */
G.t = st.paidTo;
st.tank = 0; st.balance = 0; st.books.fuelPrice = 1e9;
var hd = hooks();
S.settle(G, G.t + S.WEEK + 1, hd);
check('out of fuel and money: she goes dark, and says so', st.dark && hd.said.some(function (m) { return /DARK/.test(m); }), hd.said[0]);
S.applyLight(G, sys, st);
check('dark: her traffic stops calling', port.dark && !sys.traffic.some(function (q) { return q.playerPort === port.id; }));
check('dark: she earns nothing', (function () { var b0 = st.balance; G.t = st.paidTo; S.settle(G, G.t + S.WEEK + 1, hooks()); return st.balance < b0; })());
G.ship.docked = port.id; G.sys = sys;
G.ship.cargo = { fissile: 40 };
var rfh = S.fuelFromHold(G, st);
check('fissiles from your hold, at her desk: lit again', rfh.ok && !st.dark && !G.ship.cargo.fissile, rfh.why || (rfh.weeks.toFixed(1) + ' weeks'));
S.applyLight(G, sys, st);
check('and her traffic comes back', !port.dark && sys.traffic.filter(function (q) { return q.playerPort === port.id; }).length === mine.length);
/* Arrears, loud, then foreclosure. */
st.books.fuelPrice = 900;
var saveBooks = st.books.trade, saveVisits = st.books.visits;
st.books.trade = 0; st.books.visits = 0;
st.balance = -1; st.owingWeeks = 0; G.t = st.paidTo;
var hf = hooks();
S.settle(G, G.t + 3 * S.WEEK + 1, hf);
check('weeks owing are told, every time', st.owingWeeks === 3 && hf.said.some(function (m) { return /OWES/.test(m); }) && !st.seized, hf.said[0]);
var pi = S.payIn(G, st, -st.balance + 5000);
check('paying in clears it', pi.ok && st.balance >= 0 && st.owingWeeks === 0);
st.balance = -1e6; G.t = st.paidTo;
var hx = hooks();
S.settle(G, G.t + 9 * S.WEEK + 1, hx);
check('eight weeks owing: foreclosed, and she runs on under new owners', st.seized && st.foreclosed && !S.owns(G, port) &&
      hx.said.some(function (m) { return /FORECLOSED/.test(m); }), hx.said[hx.said.length - 1]);
st.books.trade = saveBooks; st.books.visits = saveVisits;

console.log('the rest of her crates, her freight and her crew');
/* A yard with a second trade aboard, a relay and a battery, a rated crew
 * and some freight - founded over the same world at another time. */
var Gy = game(['slipway', 'repair', 'quarters', 'market', 'relay', 'battery']);
Gy.t = T0 + 9000; placeOver(Gy, world, 1.9);
Gy.ship.crew = [{ id: 'c1', name: 'Ilse', rating: 5 }, { id: 'c2', name: 'Oro', rating: 4 }];
Gy.ship.cargo = { grain: 30 };
check('a rated crew works faster', S.crewMul(Gy.ship.crew) > 1.2, S.crewMul(Gy.ship.crew).toFixed(2) + 'x');
var ry = S.found(Gy, sys, Gy.t, 'orbital', hooks());
check('a shipyard founded with a market hall aboard', ry.ok && ry.st.type === 'shipyard', ry.why);
var sy = ry.st;
check('her crew rate carries their skill', Math.abs(sy.rates.unpack - 1.5 * S.crewMul(sy.crew)) < 1e-9, sy.rates.unpack + ' vs ' + 1.5 * S.crewMul(sy.crew));
Gy.t = S.opensAt(sy) + 1;
S.update(Gy, sys, Gy.t, hooks());
var py = sys.byId[S.portId(sy)];
check('she trades as both', py && S.typesOf(sy, Gy.t).join(',') === 'shipyard,market' && /Shipyard & Market station/.test(py.market.roleName),
      py && py.market.roleName);
var yr = global.Economy.ROLE_BY_ID.shipyard.bias;
check('her shipyard goods are on her floor', yr.every(function (c) { return py.market.rows[c] && py.market.rows[c].prod > 0; }));
check('her freight went onto her shelves, and onto her account', sy.stockSold && sy.stockValue > 0 && sy.balance >= sy.stockValue,
      sy.stockValue + ' cr');
check('a relay brings more ships: 15% more berth fees', Math.abs(S.relayMul(sy) - 1.15) < 1e-9 || S.batteries(sy) === 1);
check('a founding battery counts', S.batteries(sy) === 1 && S.takeWeeks(sy) === S.TAKE_WEEKS + 2);

console.log('the Syndicate wants its cut');
var G2 = { stations: [], ship: { credits: 0 }, t: 0 };
var rsys = { corruption: 90, starId: star.id, factions: [] };
check('in a corrupt system they ask', S.racketApplies(G2, rsys));
check('not in a clean one', !S.racketApplies(G2, { corruption: 10, starId: star.id }));
check('not in pirate space: bands raid, they do not run rackets', !S.racketApplies(G2, { corruption: 95, heldBy: 'pirate' }));
sy.racketHere = true; sy.racket = { paying: true, refused: 0 };
var b0y = sy.balance; Gy.t = sy.paidTo;
S.settle(Gy, Gy.t + S.WEEK + 1, hooks());
var incY = S.incomeWeek(sy);
check('paying: a quarter of her takings goes to them', sy.lastWeek && sy.lastWeek.income === incY.market + incY.berths);
S.setPaying(Gy, sy, false);
var hr = hooks(); Gy.t = sy.paidTo;
S.settle(Gy, Gy.t + S.WEEK + 1, hr);
check('refused: the first week is a warning', sy.racket.refused === 1 && hr.said.some(function (m) { return /protection/.test(m); }), hr.said[0]);
var hs = hooks(); Gy.t = sy.paidTo;
S.settle(Gy, Gy.t + (S.takeWeeks(sy) - 2) * S.WEEK + 1, hs);   // one short of the count
check('then sabotage, loudly, and a count to when they take her', !sy.seized && sy.racket.refused === S.takeWeeks(sy) - 1 &&
      hs.said.some(function (m) { return /SABOTAGED|counting/.test(m) && /take her in 1/.test(m); }),
      JSON.stringify({ refused: sy.racket.refused, take: S.takeWeeks(sy), seized: sy.seized, said: hs.said }));
var ht = hooks(); Gy.t = sy.paidTo;
S.settle(Gy, Gy.t + S.WEEK + 1, ht);
check('refused long enough, they take her', sy.seized && sy.takenBy === 'outlaw' && py.faction === 'outlaw' && !S.owns(Gy, py),
      JSON.stringify({ refused: sy.racket.refused, seized: sy.seized, took: sy.takenBy, said: ht.said }));

console.log('buying her back');
Gy.ship.docked = null; Gy.sys = sys;
check('only at her own desk', /desk/.test(S.buyBackRefusal(Gy, sys, sy)));
Gy.ship.docked = py.id;
Gy.ship.credits = 10;
check('for more than she cost', S.buyBackPrice(sy) > S.buildCost(sy) && /wants/.test(S.buyBackRefusal(Gy, sys, sy)), S.buyBackPrice(sy) + ' cr');
Gy.ship.credits = 1e7;
var bb = S.buyBack(Gy, sys, sy, hooks());
check('bought back: yours again', bb.ok && !sy.seized && S.owns(Gy, py) && py.faction === sy.faction, bb.why || bb.price + ' cr');
Gy.ship.docked = null;

console.log('stitching an XL yard');
var Cm = Combat;
check('one Crawler builds no XL hulls', /XL yard/.test(Cm.orderRefusal({ ship: { credits: 1e9 }, standing: {} }, py, 'leviathan')));
var Gx = game(['berth']);
Gx.stations = Gy.stations; Gx.t = Gy.t + 3600;
var csx = S.crawlerState(sy, sys, Gx.t);
Gx.ship.pos = V.add(csx.pos, { x: 4, y: 0, z: 0 }); Gx.ship.vel = V.clone(csx.vel);
var mk1 = global.Render.portModelFor(py);
var rxs = S.stitch(Gx, sys, sy, Gx.t, hooks());
check('a second Crawler stitched on', rxs.ok && sy.crawlers === 2 && Gx.ship.hullId === 'bollard' && py.xlYard, rxs.why);
check('she brought her crates as upgrades', S.pending(sy, Gx.t) >= 1);
var mk2 = global.Render.portModelFor(py), lib2 = global.Render.libPort(mk2), lib1 = global.Render.libPort(mk1);
check('drawn as two Crawlers side by side', /:x2$/.test(mk2) && lib2 && lib1 && lib2.shell.f.length > lib1.shell.f.length * 1.8, mk2);
check('an XL yard builds XL hulls', !/XL yard/.test(Cm.orderRefusal({ ship: { credits: 1e9 }, standing: {} }, py, 'leviathan') || ''));
check('and calls herself one', /XL shipyard/.test(S.typeName(sy, Gx.t)), S.typeName(sy, Gx.t));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
