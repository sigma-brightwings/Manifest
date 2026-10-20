/* shipyard.test.js — every ship type for sale, and what only a shipyard does.
 *
 * Astra, 2026-10-19: "I also want the player to be able to purchase ANY ship
 * type, but only at shipyards can you get a customized L size ship." Which
 * ships: "Civilian, plus warships only for a navy you're in good standing
 * with." Customised: "Both" — built to order, and refits only at a yard.
 * Sizes: an XL class, "sold only at shipyards, and too big to dock at
 * ordinary ports."
 *
 * Run: node test/shipyard.test.js
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
var Crew = require(path.join(SRC, 'crew.js'));
var Fleet = require(path.join(SRC, 'fleet.js'));
require(path.join(SRC, 'missions.js'));
var Save = require(path.join(SRC, 'save.js'));

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
  if (!cache[star.id]) {
    cache[star.id] = Gen.generateSystem(star.seed,
      { faction: galaxy.factionById[star.factionId], allFactions: galaxy.factions });
    cache[star.id].starId = star.id;
  }
  return cache[star.id];
}
function portsOf(sys) {
  return sys.bodies.filter(function (b) { return b.market && b.docking !== false; });
}
var MAJOR = {};
galaxy.factions.forEach(function (f) { if (!f.parentId && f.id !== 'outlaw') MAJOR[f.id] = true; });

/* A shipyard owned by a real power, an orbital non-shipyard, and a surface
 * port — found, not assumed. */
var found = { yard: null, orbital: null, surface: null, highport: null };
for (var si = 0; si < galaxy.stars.length && !(found.yard && found.orbital && found.surface && found.highport); si++) {
  var st = galaxy.stars[si], sys0 = systemFor(st);
  portsOf(sys0).forEach(function (p) {
    var role = p.market && p.market.role;
    if (!found.yard && role === 'shipyard' && MAJOR[p.faction] && !p.surface && !p.underground) found.yard = { star: st, port: p };
    if (!found.orbital && role !== 'shipyard' && role !== 'highport' && role !== 'carrier' &&
        !p.surface && !p.underground && !p.fleet) found.orbital = { star: st, port: p };
    if (!found.surface && p.surface) found.surface = { star: st, port: p };
    if (!found.highport && role === 'highport' && !p.surface) found.highport = { star: st, port: p };
  });
}

function makeG(at) {
  var sys = systemFor(at.star);
  var planet = sys.bodies.filter(function (b) { return b.kind === 'planet'; })[0];
  var ship = Sim.circularOrbit(planet, sys, 0, planet.radius * 0.6, 0.1, 0);
  Combat.initShip(ship);
  ship.cargo = {};
  Sim.refreshShip(ship);
  ship.credits = 10000000;
  ship.docked = at.port.id;
  var G = { seed: SEED, ship: ship, sys: sys, t: 1000, galaxy: galaxy, here: at.star,
            standing: {}, wanted: {}, missions: [], doneMissions: {}, fleet: [] };
  global.Game = G;
  return G;
}

/* ======================================================================== */
section('--- every ship type ---');
(function () {
  var H = Combat.HULLS, meshes = {};
  Object.keys(H).forEach(function (id) { meshes[H[id].mesh] = id; });
  ['shuttle', 'tug', 'tender', 'hauler', 'freighter', 'tanker', 'liner', 'bulk', 'merc', 'navy', 'capital']
    .forEach(function (cls) {
      check('the ' + cls + ' can be bought', !!meshes[cls], Object.keys(meshes).join(','));
    });
  check('there is an XL class', Object.keys(H).some(function (id) { return H[id].size === 'XL'; }));
  check('warships are the navy\'s own', H.cutter.military && H.capital.military &&
        H.capital.military.minStanding > H.cutter.military.minStanding);
  check('no civilian hull is military', ['wren', 'bollard', 'samaritan', 'sump', 'longhaul',
        'tanker', 'meridian', 'leviathan'].every(function (id) { return !H[id].military; }));
  check('XL needs a crew, like any big hull', Crew.needsCrew({ hullId: 'leviathan' }));
})();

section('--- the floor ---');
(function () {
  check('found a shipyard, an orbital port and a surface port',
        !!found.yard && !!found.orbital && !!found.surface,
        JSON.stringify({ y: !!found.yard, o: !!found.orbital, s: !!found.surface }));
  var bad = 0, n = 0;
  for (var s2 = 0; s2 < 40; s2++) {
    var sys = systemFor(galaxy.stars[s2]);
    portsOf(sys).forEach(function (p) {
      for (var w = 0; w < 6; w++) {
        Combat.hullsAt(p, w * Combat.HULL_WINDOW).forEach(function (id) {
          n++;
          var h = Combat.HULLS[id];
          if (h.size === 'XL' || h.military || h.orderOnly) bad++;
        });
      }
    });
  }
  check('nothing XL or military is ever on a floor (' + n + ' floor hulls)', bad === 0, bad);
})();

section('--- built to order ---');
(function () {
  if (!found.yard) return;
  var G = makeG(found.yard), port = found.yard.port;
  var list = Combat.orderList(G, port);
  var ids = list.map(function (e) { return e.id; });
  check('a shipyard builds every large hull', ['kestrel', 'longhaul', 'tanker', 'cutter',
        'meridian', 'leviathan', 'capital'].every(function (id) { return ids.indexOf(id) >= 0; }),
        ids.join(','));
  check('and no small or medium one (those are on the floor)',
        ids.every(function (id) { return Combat.bigHull(id); }));
  var cut = list.filter(function (e) { return e.id === 'cutter'; })[0];
  check('a warship is locked to a stranger, and says why', cut.why && /standing/.test(cut.why), cut.why);
  G.standing[port.faction] = 45;
  check('ALLIED opens the cutter', !Combat.orderRefusal(G, port, 'cutter'));
  check('but not the capital', /standing/.test(Combat.orderRefusal(G, port, 'capital') || ''));
  G.standing[port.faction] = 80;
  check('and further up, the capital', !Combat.orderRefusal(G, port, 'capital'));
  G.wanted[port.faction] = 99999;
  check('a navy will not build a warship for someone it wants',
        /want/.test(Combat.orderRefusal(G, port, 'cutter') || ''));
  G.wanted = {};

  /* The quote arithmetic, with your own laser moved across (the trade-in
   * form quoteOrder still answers — a commission never uses it). */
  var shelf = Combat.stockAt(G, port).filter(function (e) {
    return e.available && e.item.slot === 'hardpoint' && e.item.kind === 'gun';
  });
  check('the yard has guns on the shelf', shelf.length > 0);
  var ownKey = Combat.fittedList(G.ship).filter(function (f) { return f.type === 'hardpoint'; })[0].key;
  var fit = { hardpoint0: 'own:' + ownKey, hardpoint1: shelf[0].item.id };
  var q = Combat.quoteOrder(G, port, 'longhaul', { fit: fit });
  check('the quote is hull + new gear − trade-in',
        q.ok && q.cost === Combat.HULLS.longhaul.price + shelf[0].item.price - q.credit, JSON.stringify(q.why));

  /* A refusal is a refusal, not a silent dud. */
  var bad = Combat.quoteOrder(G, port, 'tanker', { fit: { hardpoint0: 'nonesuch' } });
  check('an impossible sheet says why', !bad.ok && !!bad.why, bad.why);
  var big = Combat.quoteOrder(G, port, 'kestrel', { fit: { hardpoint0: 'own:hardpoint0', hardpoint1: 'own:hardpoint0' } });
  check('one fitting cannot go in two slots', !big.ok && /already/.test(big.why || ''), big.why);
})();

/* Commission, wait, and step across — the whole road from a sheet to a
 * ship under your hands. Used by the sections below to put a pilot in a
 * large hull the way the game does it. */
function commissionAndBoard(G, hullId, mode) {
  var c = Combat.commission(G, hullId, { fit: {} });
  if (!c.ok) return c;
  G.t = c.order.due;
  Combat.deliverOrders(G, G.t);
  var rec = G.fleet.filter(function (r) { return r.id === 'fs-' + c.order.id; })[0];
  return rec ? Combat.takeCommand(G, rec.id, mode || 'tradein') : { ok: false, why: 'not delivered' };
}

section('--- commissioned, not bought (build time) ---');
(function () {
  if (!found.yard) return;
  var G = makeG(found.yard), port = found.yard.port;
  var shelf = Combat.stockAt(G, port).filter(function (e) {
    return e.available && e.item.slot === 'hardpoint' && e.item.kind === 'gun';
  });
  var talonFit = JSON.stringify(G.ship.fit);
  check('a large hull off the slips is not bought over the counter',
        !Combat.buyHull(G, 'meridian', false).ok && /commission/.test(Combat.buyHull(G, 'meridian', false).why));
  check('build time grows with the hull', Combat.buildDays('longhaul') === Combat.BUILD_DAYS.L &&
        Combat.buildDays('meridian') === Combat.BUILD_DAYS.XL &&
        Combat.buildDays('capital') === Combat.BUILD_DAYS_CAPITAL &&
        Combat.BUILD_DAYS.L < Combat.BUILD_DAYS.XL && Combat.BUILD_DAYS.XL < Combat.BUILD_DAYS_CAPITAL);
  var sheet = { fit: { hardpoint0: 'own:hardpoint0', hardpoint1: shelf[0].item.id },
                name: 'Brightwing II', paint: { p: '#22406e', t: '#e6e9ec' } };
  var q = Combat.quoteCommission(G, 'longhaul', sheet);
  check('a commission is hull + new gear, no trade-in, and your own gear stays put',
        q.ok && q.credit === 0 && q.cost === Combat.HULLS.longhaul.price + shelf[0].item.price &&
        !q.fit.hardpoint0, JSON.stringify(q.fit) + ' ' + q.why);
  /* A full hold does not stop an order — she is handed over empty. */
  G.ship.cargo = { water: 1 };
  var before = G.ship.credits, t0 = G.t;
  var c = Combat.commission(G, 'longhaul', sheet);
  check('she goes on the slip, paid now', c.ok && before - G.ship.credits === q.cost, c.why);
  check('…and you are still in your own ship, gear and all',
        G.ship.hullId === 'talon' && JSON.stringify(G.ship.fit) === talonFit);
  check('…due in her build time', c.order.due === t0 + Combat.BUILD_DAYS.L * 86400, c.order.due - t0);
  var snap = Save.snapshot(Object.assign({ ledgerLog: [] }, G));
  check('the order is saved', snap.orders && snap.orders.length === 1 && snap.orders[0].hullId === 'longhaul');

  G.t = c.order.due - 60;
  check('nothing is handed over early', Combat.deliverOrders(G, G.t).length === 0 && G.fleet.length === 0);

  /* BLOWN UP while she is on the slip. The pilot respawns; the order is
   * the pilot's, not the hull's. */
  Combat.stripForRespawn(G.ship);
  check('a death does not cancel the order', Combat.orders(G).length === 1);

  G.t = c.order.due + 1;
  var said = Combat.deliverOrders(G, G.t);
  check('on the day, she is handed over at the yard', said.length === 1 && G.fleet.length === 1 &&
        G.fleet[0].port === port.id && G.fleet[0].hullId === 'longhaul', said[0]);
  check('…and the slip is empty', Combat.orders(G).length === 0);
  var rec = G.fleet[0];
  check('…named, painted, and fitted to the sheet', rec.name === 'Brightwing II' &&
        rec.paint && rec.paint.p === '#22406e' && rec.fit.hardpoint1 === shelf[0].item.id, JSON.stringify(rec));
  check('…with her first week on the clamp paid',
        Fleet.berthDue(rec, G.t + 6 * 86400).cr === 0 && Fleet.berthDue(rec, G.t + 15 * 86400).cr > 0);
  check('…registered', /^[A-Z]{2}-\d{4}$/.test(rec.reg || ''), rec.reg);
  check('…tanks full and hull whole', rec.fuel === Combat.HULLS.longhaul.fuelCap &&
        rec.hullHp === Combat.HULLS.longhaul.hullMax);

  /* Away from her, you cannot take her. */
  var docked = G.ship.docked;
  G.ship.docked = null;
  check('you have to be standing beside her', /go to her/.test(Combat.commandRefusal(G, rec, 'keep') || ''));
  G.ship.docked = docked;

  /* KEEP: step across and leave the Talon on the clamp. */
  G.ship.cargo = { water: 2 };
  G.missions = [{ id: 'm1' }];
  var r = Combat.takeCommand(G, rec.id, 'keep');
  check('you take command', r.ok && G.ship.hullId === 'longhaul' && G.ship.shipName === 'Brightwing II', r.why);
  check('…in her paint and fit', G.ship.paint.p === '#22406e' && G.ship.fit.hardpoint1 === shelf[0].item.id);
  check('…and the Talon stays yours, with what was in her hold',
        r.parked && G.fleet.length === 1 && G.fleet[0].hullId === 'talon' && G.fleet[0].cargo.water === 2);
  check('…and the contract riding in her goes with her', G.missions[0].carrier === r.parked.id);
  check('her hold starts empty', !G.ship.cargo.water);

  /* TRADE IN: back into the Talon and sell the longhaul? No — the other
   * way round: step back into the Talon, trading the longhaul in. */
  var talonRec = G.fleet[0];
  var worth = Combat.tradeInValue(G.ship);
  var cr0 = G.ship.credits;
  var r2 = Combat.takeCommand(G, talonRec.id, 'tradein');
  check('trading in is the yard\'s seven tenths, gear and all',
        r2.ok && G.ship.credits - cr0 === worth && G.fleet.length === 0, r2.why);
  check('…and the contract is back aboard with you', !G.missions[0].carrier);
  check('…and the cargo she carried comes across', G.ship.cargo.water === 2);

  /* A partner's ship is hers. */
  var G2 = makeG(found.yard);
  var p = Fleet.park(G2, Object.assign({}, G2.ship, { hullId: 'sump' }), port.id, 'Hers');
  p.star = found.yard.star.id;
  p.partner = { name: 'Captain Vey', share: 0.5 };
  check('you cannot take command of a partner\'s ship', /Vey/.test(Combat.commandRefusal(G2, p, 'keep') || ''));
})();

section('--- refits only at a shipyard ---');
(function () {
  if (!found.yard || !found.orbital) return;
  var G = makeG(found.yard), yard = found.yard.port;
  var boarded = commissionAndBoard(G, 'tanker', 'tradein');
  check('commissioned and boarded a tanker', boarded.ok && G.ship.hullId === 'tanker', boarded.why);
  var gun = Combat.stockAt(G, yard).filter(function (e) {
    return e.available && e.item.kind === 'gun';
  })[0].item;
  /* Fly her somewhere that is not a yard. */
  G.sys = systemFor(found.orbital.star); G.here = found.orbital.star;
  G.ship.docked = found.orbital.port.id;
  var fitBefore = JSON.stringify(G.ship.fit);
  var r = Combat.buyEquipment(G, gun.id);
  check('a large hull cannot be refitted off a shipyard', !r.ok && /shipyard/.test(r.why), r.why);
  var anyKey = Object.keys(G.ship.fit)[0];
  check('nor stripped', Combat.sellFitted(G, anyKey) === 0 && JSON.stringify(G.ship.fit) === fitBefore);
  check('and the yard says so', /shipyard/.test(Combat.yardRefusal(G) || ''));
  /* Seekers are not fittings. */
  var mr = Combat.buyOutfit(G, 'missile', 'hawk');
  check('consumables are still sold anywhere', mr > 0, String(mr));
  /* Back at a yard, she can be worked on. */
  G.sys = systemFor(found.yard.star); G.here = found.yard.star; G.ship.docked = yard.id;
  check('at a shipyard she can be refitted', !Combat.yardRefusal(G));
  /* A small hull is refitted anywhere. */
  var G2 = makeG(found.orbital);
  check('a small hull refits anywhere', !Combat.yardRefusal(G2));
})();

section('--- sold as she sits ---');
(function () {
  if (!found.orbital) return;
  /* Find a window where this orbital dock has a large hull on the floor. */
  var G = makeG(found.orbital), port = found.orbital.port, t = null, id = null;
  for (var w = 0; w < 400 && !id; w++) {
    var list = Combat.hullsAt(port, w * Combat.HULL_WINDOW);
    for (var i = 0; i < list.length; i++) if (Combat.bigHull(list[i])) { id = list[i]; t = w * Combat.HULL_WINDOW; break; }
  }
  check('found a large hull on an ordinary floor', !!id);
  if (!id) return;
  G.t = t;
  check('an ordinary dock will not build to order', /only a shipyard/.test(Combat.orderRefusal(G, port, id)));
  var sf = Combat.stockFit(G, port, id, t);
  var credit = Math.round(Combat.HULLS.talon.price * Combat.TRADE_IN);
  Combat.fittedList(G.ship).forEach(function (f) { credit += Math.round(f.item.price * Combat.TRADE_IN); });
  var before = G.ship.credits;
  var r = Combat.buyHull(G, id, false);
  check('she is sold as she sits', r.ok && r.mode === 'stock', r.why);
  check('…with the dock\'s own fit', JSON.stringify(G.ship.fit) === JSON.stringify(
    Object.assign({}, sf.fit, (function () {
      var o = {}; for (var k in G.ship.fit) if (!sf.fit[k]) o[k] = G.ship.fit[k]; return o;
    })())), JSON.stringify(G.ship.fit));
  check('…for hull + package − trade-in', before - G.ship.credits === Combat.HULLS[id].price + sf.gear - credit,
        (before - G.ship.credits) + ' vs ' + (Combat.HULLS[id].price + sf.gear - credit));
  check('…in yard grey', G.ship.paint === null);
  var G3 = makeG(found.orbital);
  var no = Combat.buyHull(G3, 'leviathan', false);
  check('an XL hull is not sold off an ordinary floor', !no.ok && /shipyard/.test(no.why), no.why);
})();

section('--- too big to dock ---');
(function () {
  if (!found.yard || !found.surface) return;
  var G = makeG(found.yard);
  G.ship.hullId = 'leviathan';
  check('an XL hull docks at a shipyard', !Combat.dockRefusal(G, found.yard.port));
  if (found.highport) check('and a highport', !Combat.dockRefusal(G, found.highport.port));
  var r = Combat.dockRefusal(G, found.surface.port);
  check('but never on a pad', r && r.why === 'toobig', r && r.text);
  if (found.orbital) {
    var r2 = Combat.dockRefusal(G, found.orbital.port);
    check('nor at an ordinary orbital port', r2 && r2.why === 'toobig', r2 && r2.text);
  }
  G.ship.hullId = 'longhaul';
  check('an L hull is not refused for size', !Combat.dockRefusal(G, found.surface.port));
})();

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
