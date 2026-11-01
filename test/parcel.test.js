/* parcel.test.js — the sealed courier parcel has contents (2026-11-01).
 *
 * PLAN.md Phase 10, built:
 *  - contents are hashed off the contract id: the same board, the same
 *    parcels, every time;
 *  - the odds lean on facts the board shows (fee, whose ground, crime);
 *  - signing carries the contents and the seal onto the contract;
 *  - a scanner reads it at "the numbers" and not below;
 *  - customs finding it SEALED seizes and fines it but leaves your
 *    standing alone (Astra's call); opened, it is ordinary contraband;
 *  - breaking the seal voids the contract and costs standing.
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
var M = require(path.join(SRC, 'missions.js'));

var pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail !== undefined ? '   ' + detail : '')); }
}
function section(n) { console.log('\n' + n); }

var galaxy = Galaxy.build('kawartha');
function sysFor(star) { return Gen.generateSystem(star.seed, Galaxy.systemOpts(galaxy, star)); }

/* The first courier offer on any board that satisfies `want`. */
function findCourier(want) {
  for (var s = 0; s < galaxy.stars.length && s < 60; s++) {
    var star = galaxy.stars[s];
    if (!star.factionId) continue;
    var sys = sysFor(star);
    var ports = sys.ports || [];
    for (var p = 0; p < ports.length; p++) {
      for (var w = 0; w < 20; w++) {
        var t = w * M.WINDOW + 1;
        var offers = M.boardAt(ports[p], sys, galaxy, star, t);
        for (var o = 0; o < offers.length; o++) {
          if (offers[o].type === 'courier' && offers[o].contents && want(offers[o])) {
            return { offer: offers[o], port: ports[p], sys: sys, star: star, t: t };
          }
        }
      }
    }
  }
  return null;
}

function makeG(found) {
  var sys = found.sys;
  var planet = sys.bodies.filter(function (b) { return b.kind === 'planet'; })[0];
  var ship = Sim.circularOrbit(planet, sys, 0, planet.radius * 0.6, 0.1, 0);
  ship.credits = 100000; ship.cargo = {};
  Combat.initShip(ship); ship.hullId = 'kestrel';
  Sim.refreshShip(ship);
  return { ship: ship, sys: sys, t: found.t, galaxy: galaxy, here: found.star,
           standing: {}, wanted: {}, missions: [], doneMissions: {} };
}

/* A search that always happens and an inspector who cannot be bought:
 * ecmLoud forces the search, and a Math.random that never comes in under
 * the bribe chance (capped at 0.75) keeps the book from being bribed. */
function searched(G) {
  var real = Math.random;
  Math.random = function () { return 0.99; };
  G.ship.ecmLoud = true;
  var said = [];
  try {
    return { res: Combat.resolveScan(G, { name: 'Customs cutter', faction: G.sys.factions[0].id },
                                     { say: function (m) { said.push(m); } }), said: said };
  } finally { Math.random = real; G.ship.ecmLoud = false; }
}

section('contents are the contract\'s own, and the same every time');
var dirtyF = findCourier(function (o) { return o.contents.dirty; });
var cleanF = findCourier(function (o) { return !o.contents.dirty; });
check('a dirty parcel exists somewhere on the boards', !!dirtyF);
check('and a clean one', !!cleanF);
if (dirtyF) {
  var again = M.boardAt(dirtyF.port, dirtyF.sys, galaxy, dirtyF.star, dirtyF.t)
    .filter(function (o) { return o.id === dirtyF.offer.id; })[0];
  check('the same board deals the same parcel',
        again && JSON.stringify(again.contents) === JSON.stringify(dirtyF.offer.contents));
  check('a dirty parcel names a real contraband good',
        !!(Eco.BY_ID[dirtyF.offer.contents.cid] && Eco.BY_ID[dirtyF.offer.contents.cid].contraband),
        dirtyF.offer.contents.cid);
  check('the contents are not printed on the board',
        dirtyF.offer.desc.toLowerCase().indexOf(dirtyF.offer.contents.name.toLowerCase()) < 0);
}

section('the odds lean on what the board shows');
var mid = { type: 'courier', pay: 2600 };           // below the middle of 1800..4800
var top = { type: 'courier', pay: 4800 };
var quiet = { destHeld: null, crime: 30 };
var rough = { destHeld: 'The Syndicate', crime: 90 };
check('a mid-band fee to lawful ground out of a quiet system is nearly always clean',
      M.parcelOdds(mid, quiet) < 0.03, M.parcelOdds(mid, quiet));
check('the top of the band is riskier than the middle',
      M.parcelOdds(top, quiet) > M.parcelOdds(mid, quiet) + 0.25);
check('Syndicate ground and a rough origin push it further',
      M.parcelOdds(top, rough) > M.parcelOdds(top, quiet) + 0.2);
check('and it is never certain', M.parcelOdds(top, rough) < 1);

section('signing carries the parcel and its seal');
if (dirtyF) {
  var G = makeG(dirtyF);
  var acc = M.accept(G, dirtyF.offer, null);
  var m = G.missions[0];
  check('the contract is signed', acc.ok && !!m, JSON.stringify(acc));
  check('it carries the contents', m && JSON.stringify(m.contents) === JSON.stringify(dirtyF.offer.contents));
  check('and is sealed', m && m.sealed === true);
  check('the parcel is aboard', M.parcelsAboard(G).length === 1 && M.sealedParcelsAboard(G).length === 1);

  section('a scanner reads it at the numbers, and not below');
  var k0 = M.parcelKnown(G, m);
  check('with nothing fitted it is their business', !k0.known, k0.line);
  Combat.fitItem(G.ship, 'hullscan');
  check('a hull scanner reads only a fraction: still sealed', !M.parcelKnown(G, m).known);
  G.ship.fit = null; Combat.initShip(G.ship);
  var cf = Combat.canFit(G.ship, 'combatscan');
  Combat.fitItem(G.ship, 'combatscan');
  var k2 = M.parcelKnown(G, m);
  check('a combat scanner reads it through the seal', cf.ok && k2.known && k2.dirty &&
        k2.line.toLowerCase().indexOf(m.contents.name.toLowerCase()) >= 0, k2.line);

  section('customs finds it sealed: seized and fined, standing untouched');
  var fac = G.sys.factions[0].id;
  var stBefore = M.standing(G, fac);
  var scan = searched(G);
  check('it is found', scan.res.contraband === true && scan.res.sealedOnly === true, JSON.stringify(scan.res));
  check('and fined', scan.res.fine > 0);
  check('the parcel is seized', !G.ship.cargo.parcel);
  check('the contract is void', G.missions.length === 0 && G.doneMissions[m.id] === true);
  check('your standing is untouched', M.standing(G, fac) === stBefore, stBefore + ' -> ' + M.standing(G, fac));
  check('and you are told why', /seal kept your name clean/.test(scan.said.join(' ')), scan.said.join(' | '));
}

section('breaking the seal: void, a standing hit, and it is yours');
if (dirtyF) {
  var G2 = makeG(dirtyF);
  M.accept(G2, dirtyF.offer, null);
  var m2 = G2.missions[0];
  var st2 = M.standing(G2, m2.faction);
  var br = M.breakSeal(G2, m2.id, null);
  var cid = dirtyF.offer.contents.cid;
  check('the seal breaks', br.ok, JSON.stringify(br));
  check('the contract is void', G2.missions.length === 0);
  check('the client\'s flag remembers', M.standing(G2, m2.faction) < st2);
  check('the parcel is now the contraband it was', !G2.ship.cargo.parcel && G2.ship.cargo[cid] === 1,
        JSON.stringify(G2.ship.cargo));
  var fac2 = G2.sys.factions[0].id, before2 = M.standing(G2, fac2);
  var scan2 = searched(G2);
  check('opened, customs treats it as yours: fined and a standing hit',
        scan2.res.contraband && !scan2.res.sealedOnly && M.standing(G2, fac2) < before2,
        JSON.stringify(scan2.res));
}

section('a clean sealed parcel passes a search');
if (cleanF) {
  var G3 = makeG(cleanF);
  M.accept(G3, cleanF.offer, null);
  var scan3 = searched(G3);
  check('nothing is flagged', scan3.res.searched && !scan3.res.contraband, JSON.stringify(scan3.res));
  check('and the contract stands', G3.missions.length === 1);
  var br3 = M.breakSeal(G3, G3.missions[0].id, null);
  check('opening a clean one still voids it, and leaves a parcel in the hold',
        br3.ok && G3.missions.length === 0 && G3.ship.cargo.parcel === 1);
}

section('a contract signed before today reads as clean and unknown');
if (cleanF) {
  var G4 = makeG(cleanF);
  M.accept(G4, cleanF.offer, null);
  delete G4.missions[0].contents; delete G4.missions[0].sealed;
  var scan4 = searched(G4);
  check('an old contract is not flagged', !scan4.res.contraband);
  check('and still has a line to show', /Sealed/.test(M.parcelKnown(G4, G4.missions[0]).line));
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
