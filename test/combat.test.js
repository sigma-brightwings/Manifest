/* combat.test.js — weapons, law, contracts, and the save file.
 *
 *     node test/combat.test.js
 *
 * The systems under test here are the ones where a silent wrong answer is
 * worst: a bounty that appears with no witness breaks the game's one law
 * doctrine, a missile that never arrives breaks the purchase that paid for
 * it, and a save that loses the career breaks the only promise a save
 * makes.
 */
var path = require('path');
var SRC = path.join(__dirname, '..', 'src');
var V = require(path.join(SRC, 'vec3.js'));
var K = require(path.join(SRC, 'kepler.js'));
var RNG = require(path.join(SRC, 'rng.js'));
var Eco = require(path.join(SRC, 'economy.js'));
var Gen = require(path.join(SRC, 'generate.js'));
var Galaxy = require(path.join(SRC, 'galaxy.js'));
var Sim = require(path.join(SRC, 'sim.js'));
var Combat = require(path.join(SRC, 'combat.js'));
var Missions = require(path.join(SRC, 'missions.js'));

/* A fake localStorage, so the save round-trip runs headless. */
var fakeStore = {};
global.localStorage = {
  getItem: function (k) { return fakeStore[k] === undefined ? null : fakeStore[k]; },
  setItem: function (k, v) { fakeStore[k] = String(v); },
  removeItem: function (k) { delete fakeStore[k]; }
};
var Save = require(path.join(SRC, 'save.js'));

var pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  ok   ' + name + (detail ? '   ' + detail : '')); }
  else { fail++; console.log('  FAIL ' + name + (detail ? '   ' + detail : '')); }
}
function section(t) { console.log('\n' + t); }

/* A minimal player-shaped G, orbiting a real planet in a real system. */
function makeG(deepSpace) {
  var sys = Gen.generateSystem('kawartha');
  var planet = sys.bodies.filter(function (b) { return b.kind === 'planet'; })[0];
  var ship = Sim.circularOrbit(planet, sys, 0, planet.radius * 0.6, 0.1, 0);
  ship.credits = 5000;
  ship.cargo = {};
  Combat.initShip(ship);
  Sim.refreshShip(ship);
  var G = { ship: ship, sys: sys, t: 0, keys: {}, panel: 0,
            wanted: {}, standing: {}, missions: [], doneMissions: {},
            beams: [], explosions: [], navTarget: null };
  if (deepSpace) {
    // Far from every body, station and rail — no witnesses out here.
    ship.pos = { x: 4.2e9, y: 3.9e9, z: 2e8 };
    ship.vel = { x: 0, y: 0, z: 0 };
  }
  return G;
}

/* A victim that exists only for the test: trader-shaped, alive, nearby. */
function fakeVictim(G, opts) {
  opts = opts || {};
  var spec = {
    id: 'victim-' + Math.random().toFixed(6), kind: opts.kind || 'trader',
    cls: opts.cls || 'freighter', className: 'freighter', name: opts.name || 'Test Prey',
    faction: opts.faction || 'testfac', size: 0.12, accel: 0.004,
    rail: { type: 'lifted' }, liftedFrom: null,
    manifest: opts.manifest || [{ cid: 'grain', tonnes: 20 }],
    live: {
      pos: V.addScaled(V.clone(G.ship.pos), { x: 1, y: 0, z: 0 }, opts.range || 10),
      vel: V.clone(G.ship.vel),
      fwd: { x: 1, y: 0, z: 0 }, up: { x: 0, y: 0, z: 1 }, right: { x: 0, y: -1, z: 0 }
    },
    mode: 'shadow', modeSince: 0
  };
  spec.live.spec = spec; spec.live.id = spec.id; spec.live.name = spec.name;
  (G.sys.patrols = G.sys.patrols || []).push(spec);
  G.sys._ships = null;
  return spec;
}

var HOOKS = { say: function () {}, sound: function () {} };

section('--- the catalogue is not allowed to strand you ---');
(function () {
  for (var id in Combat.HULLS) {
    var h = Combat.HULLS[id];
    var laden = h.dryMass + h.fuelCap + h.thrusterCap + h.cargoCap;
    var g = (h.thrustKN / laden) / 1.15;
    check(h.name + ' can lift off every port that exists',
          g >= Gen.MAX_SURFACE_G - 1e-9,
          g.toFixed(2) + ' vs limit ' + Gen.MAX_SURFACE_G.toFixed(2));
  }
})();

section('--- fitting out ---');
(function () {
  var G = makeG();
  check('you start with a pulse laser and a whole hull',
        G.ship.gun === 'phpulse' && G.ship.hullHp === G.ship.hullMax);
  check('and it is actually in a hardpoint, not just a field',
        G.ship.fit.hardpoint0 === 'phpulse', JSON.stringify(G.ship.fit));

  G.ship.credits = 20000;          // the Class 2 ladder costs more than the old beam
  var before = G.ship.credits;
  var r = Combat.buyOutfit(G, 'gun', 'beam');
  check('buying the legacy beam id fits the Class 2 intermittent it maps to',
        r === Combat.GUNS.beam.price && G.ship.credits === before - r &&
        G.ship.gun === 'piint');

  G.ship.credits = 10;
  check('a purchase you cannot afford does not happen',
        Combat.buyOutfit(G, 'turret', 'turret') < 0 && G.ship.turret === null);

  G.ship.credits = 100000;
  Combat.buyOutfit(G, 'shield', 'shield');
  check('the shield arrives charged', G.ship.shield === 'shield' &&
        G.ship.shieldHp === Combat.MODULES.shield.cap);
  for (var i = 0; i < 20; i++) Combat.buyOutfit(G, 'missile', 'hawk');
  check('the missile rack has a size', G.ship.missiles === Combat.MISSILES.hawk.rack,
        String(G.ship.missiles));
})();

section('--- slots, power and mass ---');
(function () {
  var G = makeG();
  var s = G.ship;

  check('a Talon has seven slots in three flavours',
        Combat.slotKeys(s).length === 7 &&
        Combat.slotKeys(s).filter(function (k) {
          return Combat.slotType(k) === 'hardpoint';
        }).length === 2, Combat.slotKeys(s).join(','));

  var sum = Combat.fitSummary(s);
  check('the starting fit draws its listed power',
        Math.abs(sum.powerUsed - Combat.GUNS.phpulse.power) < 1e-9 &&
        sum.powerCap === 9.0, sum.powerUsed + ' / ' + sum.powerCap);

  /* The headline refusal: 13 MW will not run on a 9 MW hull. */
  var no = Combat.canFit(s, 'mubeam');
  check('a Class 3 beam will not fit a Talon at any price', !no.ok, no.why);
  check('and it says why, in words', /MW/.test(no.why || ''), no.why);

  /* A Kestrel can carry one — but only by itself. 13 MW of the hull's 14
   * leaves no room even for the Class 1 pulse it flew in with, which is a
   * sharper statement of the tradeoff than the design went looking for. */
  var K = makeG();
  K.ship.credits = 500000;
  Combat.buyHull(K, 'kestrel');
  check('a Kestrel cannot run a Class 3 beam alongside its starter gun',
        !Combat.canFit(K.ship, 'mubeam').ok);
  Combat.sellFitted(K, 'hardpoint0');
  var yes = Combat.canFit(K.ship, 'mubeam');
  check('but can carry one on a bare hull', yes.ok, yes.why || '');
  if (yes.ok) {
    Combat.fitItem(K.ship, 'mubeam', yes.key);
    var ksum = Combat.fitSummary(K.ship);
    var shield = Combat.canFit(K.ship, 'shield');
    check('and then has no power left for a shield — the glass cannon is arithmetic',
          !shield.ok, ksum.powerUsed + ' / ' + ksum.powerCap + '  ' + (shield.why || ''));
  }

  /* Swapping a gun is judged on the swap, not on the pair. */
  var S = makeG();
  var swap = Combat.canFit(S.ship, 'c2beam', 'hardpoint0');
  check('replacing a gun is costed against the slot it empties', swap.ok, swap.why || '');

  /* One of a thing that only works once. */
  var U = makeG();
  U.ship.credits = 100000;
  Combat.fitItem(U.ship, 'shield', 'internal0');
  var dup = Combat.canFit(U.ship, 'shield', 'internal1');
  check('a second shield generator is refused rather than silently useless',
        !dup.ok, dup.why);
  Combat.fitItem(U.ship, 'reactor1', 'internal1');
  var dupR = Combat.canFit(U.ship, 'reactor2', 'internal2');
  check('and only one reactor of any tier', !dupR.ok, dupR.why);

  /* Reactors: megawatts bought with tonnes, which is what finally makes the
   * mass budget the binding constraint instead of a decoration. */
  var Rk = makeG();
  Rk.ship.credits = 500000;
  Combat.buyHull(Rk, 'kestrel');
  Combat.sellFitted(Rk, 'hardpoint0');
  Combat.fitItem(Rk.ship, 'mubeam');
  check('a bare Kestrel cannot add a shield to a Class 3 beam',
        !Combat.canFit(Rk.ship, 'shield').ok);
  var rfit = Combat.fitItem(Rk.ship, 'reactor2');
  check('a Mk II reactor fits and raises the ceiling', rfit.ok,
        Combat.fitSummary(Rk.ship).powerCap + ' MW');
  check('which is exactly what the shield needed',
        Combat.canFit(Rk.ship, 'shield').ok);
  Combat.fitItem(Rk.ship, 'shield');
  var rsum = Combat.fitSummary(Rk.ship);
  check('and now MASS is what stops the next thing, not power',
        rsum.powerFree > 0 && !Combat.canFit(Rk.ship, 'reactor3').ok,
        rsum.massUsed + 't / ' + rsum.massCap + 't, ' +
        rsum.powerUsed + ' / ' + rsum.powerCap + ' MW');

  /* Pulling a reactor takes its megawatts back out with it. */
  var cap0 = Combat.fitSummary(Rk.ship).powerCap;
  Combat.unfitItem(Rk.ship, rfit.key);
  check('removing a reactor lowers the ceiling again',
        Combat.fitSummary(Rk.ship).powerCap === cap0 - Combat.MODULES.reactor2.powerBonus);

  // Selling gives back less than you paid, and empties the slot.
  var R = makeG();
  var cash = R.ship.credits;
  var got = Combat.sellFitted(R, 'hardpoint0');
  check('selling a fitting refunds part of list and clears the slot',
        got === Math.round(Combat.GUNS.phpulse.price * Combat.RESALE) &&
        R.ship.credits === cash + got && !R.ship.fit.hardpoint0 && !R.ship.gun,
        String(got));
})();

section('--- the legacy mirror stays in step ---');
(function () {
  var G = makeG();
  G.ship.credits = 100000;
  Combat.buyOutfit(G, 'shield', 'shield');
  check('fitting a shield sets the old field and charges it',
        G.ship.shield === 'shield' && G.ship.shieldHp === Combat.MODULES.shield.cap);
  Combat.unfitItem(G.ship, 'internal0');
  check('removing it clears the old field and the charge',
        !G.ship.shield && G.ship.shieldHp === 0);

  Combat.fitItem(G.ship, 'heatshield');
  check('the heat shield still reports its shed rate the old way',
        G.ship.heatshield === 'heatshield' &&
        G.ship.heatShed === Combat.MODULES.heatshield.shed);
})();

section('--- migrating a career that predates slots ---');
(function () {
  var G = makeG();
  var s = G.ship;
  // A save blob from before any of this existed.
  s.fit = null;
  s.gun = 'beam'; s.turret = 'turret'; s.shield = 'shield';
  s.heatshield = null; s.shieldHp = 12;
  Combat.migrateFit(s);

  check('the old beam becomes the Class 2 intermittent',
        s.fit.hardpoint0 === 'piint' && s.gun === 'piint', JSON.stringify(s.fit));
  check('the turret lands in a utility slot',
        s.fit.utility0 === 'turret' && s.turret === 'turret');
  check('the shield survives the move', s.shield === 'shield');
  check('nothing was silently confiscated', Combat.fittedList(s).length === 3);

  // Idempotent: migrating an already-migrated ship changes nothing.
  var before = JSON.stringify(s.fit);
  Combat.migrateFit(s);
  check('migrating twice is a no-op', JSON.stringify(s.fit) === before);
})();

section('--- heat sinks ---');
(function () {
  var G = makeG();
  var s = G.ship;
  s.credits = 100000;
  G.t = 0;

  check('no launcher, no sinks', Combat.sinkRackSize(s) === 0 &&
        Combat.armSink(G, 0, HOOKS) === false);

  Combat.fitItem(s, 'sinklauncher');
  check('the launcher fits a utility slot',
        Combat.sinkRackSize(s) === Combat.MODULES.sinklauncher.rack);
  check('an empty rack still will not arm', Combat.armSink(G, 0, HOOKS) === false);

  for (var i = 0; i < 5; i++) Combat.buyOutfit(G, 'sink', null);
  check('the rack fills to its size and stops', s.sinks === 3, String(s.sinks));

  /* The bank: stored heat straight out of the hull on activation. */
  s.heat = 90;
  check('arming works', Combat.armSink(G, 0, HOOKS) === true);
  check('and banks stored heat up to its limit',
        Math.abs(s.heat - (90 - Combat.SINK.bank)) < 1e-9, String(s.heat));
  check('a charge was spent', s.sinks === 2);

  /* The fraction: the clock slows, it does not stop. */
  s.heat = 0;
  var through = Combat.addHeat(G, 100);
  check('a live sink takes its share and lets the rest through',
        Math.abs(through - 35) < 1e-9 && Math.abs(s.heat - 35) < 1e-9,
        through + ' units reached the hull');

  /* It expires, ejects, and leaves something behind. */
  Combat.updateSink(G, 7, HOOKS);
  check('it ejects when its time is up', !G.sink);
  check('and leaves a hot object where you were',
        (G.sinkEjections || []).length === 1 &&
        G.sinkEjections[0].heat > 0, JSON.stringify((G.sinkEjections || [])[0] || {}).slice(0, 60));

  check('heat goes straight to the hull once it is gone',
        Combat.addHeat(G, 10) === 10);

  check('the launcher will not re-arm inside its cooldown',
        Combat.armSink(G, 8, HOOKS) === false);
  check('but will once it has cycled', Combat.armSink(G, 16, HOOKS) === true);

  /* Capacity, not just the timer, ends it. */
  var H = makeG();
  H.ship.credits = 100000;
  Combat.fitItem(H.ship, 'sinklauncher');
  Combat.buyOutfit(H, 'sink', null);
  Combat.armSink(H, 0, HOOKS);
  Combat.addHeat(H, 10000);
  Combat.updateSink(H, 0.1, HOOKS);
  check('a sink that fills up ejects early, before its timer',
        !H.sink && H.sinkEjections.length === 1,
        'held ' + Math.round(H.sinkEjections[0].heat));
  check('and it never holds more than its capacity',
        H.sinkEjections[0].heat <= Combat.SINK.capacity + 1e-9);
})();

section('--- the yard has something to say ---');
(function () {
  var missing = [];
  for (var id in Combat.EQUIPMENT) {
    if (!Combat.EQUIPMENT[id].pitch) missing.push(id);
  }
  check('every catalogue item has a sales pitch', missing.length === 0,
        missing.join(','));
  check('consumables have one too',
        !!Combat.MISSILES.hawk.pitch && !!Combat.SINK.pitch);
})();

section('--- what a port will sell you ---');
(function () {
  var G = makeG();
  var port = (G.sys.ports || [])[0];
  if (!port) { check('a port exists to shop at', false); return; }
  var fac = port.faction || 'civil';

  function find(list, id) {
    return list.filter(function (e) { return e.item.id === id; })[0] || null;
  }

  /* Development gates what is on the shelf at all. */
  port.market = port.market || {};
  port.market.dev = 0.10;
  var poor = Combat.stockAt(G, port);
  check('a frontier port does not stock the heavy classes',
        !find(poor, 'mubeam') && !find(poor, 'c2beam'),
        poor.length + ' lines');
  check('but it will sell you a Class 1', !!find(poor, 'phpulse'));

  /* Standing gates access to what IS on the shelf. */
  port.market.dev = 0.90;
  G.standing[fac] = 0;
  var rich = Combat.stockAt(G, port);
  var c3 = find(rich, 'mubeam');
  check('a developed port stocks Class 3', !!c3);
  check('but will not sell it to a stranger', c3 && !c3.available, c3 && c3.why);
  check('and says what would change that', c3 && /standing/i.test(c3.why || ''), c3 && c3.why);

  G.standing[fac] = 40;
  var friendly = Combat.stockAt(G, port);
  check('a friend can buy it', find(friendly, 'mubeam').available);

  /* And being wanted closes the weapon counter, but not the whole shop. */
  G.wanted[fac] = Combat.WANTED_HUNT + 100;
  var hot = Combat.stockAt(G, port);
  check('a wanted pilot is not sold guns', !find(hot, 'phpulse').available,
        find(hot, 'phpulse').why);
  check('nor a turret', !find(hot, 'turret').available);
  check('but can still buy a reactor — it is not a weapon',
        find(hot, 'reactor1').available);
})();

section('--- buying hulls ---');
(function () {
  var G = makeG();
  G.ship.credits = 200000;
  var before = G.ship.credits;
  var r = Combat.buyHull(G, 'mule');
  var expected = Combat.HULLS.mule.price - Math.round(Combat.HULLS.talon.price * 0.7);
  check('the trade-in maths is honest', r.ok && before - G.ship.credits === expected,
        (before - G.ship.credits) + ' vs ' + expected);
  check('the new hull is whole and fitted numbers moved over',
        G.ship.hullMax === Combat.HULLS.mule.hullMax &&
        G.ship.hullHp === Combat.HULLS.mule.hullMax &&
        G.ship.cargoCap === 160 && G.ship.hullId === 'mule');

  G.ship.cargo = { grain: 150 };
  Sim.refreshShip(G.ship);
  var r2 = Combat.buyHull(G, 'dart');
  check('a hull too small for your cargo is refused, not stranded',
        !r2.ok && G.ship.hullId === 'mule', r2.why);
})();

section('--- shooting things ---');
(function () {
  var G = makeG();
  var victim = fakeVictim(G, { range: 5 });
  // Point the nose straight at it.
  G.ship.fwd = V.norm(V.sub(victim.live.pos, G.ship.pos));

  Combat.fireGun(G.sys, G, G.t, HOOKS);
  check('a gun fired down the throat connects',
        victim.hullHp !== undefined && victim.hullHp < victim.hullMax,
        victim.hullHp + ' / ' + (victim.hullMax || '?'));
  check('an unarmed trader runs rather than fights', victim.mode === 'breakoff');
  check('and the beam was drawn', G.beams.length > 0);

  G.gunCoolUntil = 0;
  G.ship.fwd = V.norm({ x: 0, y: 0, z: 1 });   // now aim at nothing
  var hp = victim.hullHp;
  Combat.fireGun(G.sys, G, G.t, HOOKS);
  check('a gun fired at empty sky hits empty sky', victim.hullHp === hp);

  /* Closer than the fleeing trader, because both test dummies sit on the
   * same bearing and the gun rightly hits the nearest thing in the cone. */
  var cop = fakeVictim(G, { kind: 'police', cls: 'police', range: 3, faction: 'lawfac' });
  G.gunCoolUntil = 0;
  G.ship.fwd = V.norm(V.sub(cop.live.pos, G.ship.pos));
  Combat.fireGun(G.sys, G, G.t, HOOKS);
  check('an armed ship shot at turns and fights',
        cop.hostileToPlayer === true && cop.mode === 'attack');
})();

section('--- the witness doctrine ---');
(function () {
  // Deep space, just the two of you: no bounty at the moment of the crime.
  var G = makeG(true);
  var victim = fakeVictim(G, { range: 5, faction: 'quietfac' });
  Combat.crime(G.sys, G, G.t, 'assault', victim, HOOKS);
  check('no witness, no immediate bounty', !(G.wanted.quietfac > 0));
  check('but the victim starts its distress clock',
        victim.distressAt === G.t + Combat.DISTRESS_DELAY);

  // Kill it before the call goes out: silence, forever.
  Combat.killNpc(G.sys, G, victim, G.t + 2, HOOKS);
  check('a victim destroyed before transmitting never reports',
        victim.distressAt === null);
  Combat.update(G.sys, G, G.t + 60, 1, HOOKS);
  check('and no report ever arrives', !(G.wanted.quietfac > 0));

  // Same crime, but let the clock run out.
  var G2 = makeG(true);
  var v2 = fakeVictim(G2, { range: 5, faction: 'talkfac' });
  Combat.crime(G2.sys, G2, G2.t, 'assault', v2, HOOKS);
  Combat.update(G2.sys, G2, G2.t + Combat.DISTRESS_DELAY + 1, 1, HOOKS);
  check('a surviving victim gets its call out', G2.wanted.talkfac > 0,
        String(G2.wanted.talkfac));

  // Near a station: reported on the spot, no clock involved.
  var G3 = makeG();          // in orbit, stations everywhere
  var v3 = fakeVictim(G3, { range: 5, faction: 'seenfac' });
  Combat.crime(G3.sys, G3, G3.t, 'assault', v3, HOOKS);
  check('a witnessed crime is reported immediately', G3.wanted.seenfac > 0);

  // Pirates are fair game, always.
  var G4 = makeG();
  var v4 = fakeVictim(G4, { kind: 'pirate', cls: 'pirate', range: 5, faction: 'outlaw' });
  Combat.crime(G4.sys, G4, G4.t, 'kill', v4, HOOKS);
  check('there is no law for outlaws', Combat.bountyTotal(G4) === 0);
})();

section('--- the law, once it knows ---');
(function () {
  var G = makeG();
  G.wanted.lawfac = Combat.WANTED_HUNT + 100;
  var port = { name: 'Test Port', faction: 'lawfac' };
  check('a wanted ship is refused the dock', Combat.dockRefused(G, port));
  check('other factions still take your money',
        !Combat.dockRefused(G, { name: 'Elsewhere', faction: 'otherfac' }));

  G.ship.credits = 100;
  check('you cannot pay a bounty you cannot afford',
        Combat.payBounty(G, 'lawfac') < 0 && G.wanted.lawfac > 0);
  G.ship.credits = 100000;
  var owed = G.wanted.lawfac;
  var paid = Combat.payBounty(G, 'lawfac');
  check('paying off costs more than the bounty and clears it',
        paid === Math.round(owed * 1.6) && !G.wanted.lawfac);

  // A hostile police spec starts hunting once the bounty crosses the line.
  var G5 = makeG();
  G5.wanted.huntfac = Combat.WANTED_HUNT + 1;
  var cop = fakeVictim(G5, { kind: 'police', cls: 'police', range: 2000, faction: 'huntfac' });
  cop.hostileToPlayer = false; cop.mode = 'inspect';
  Combat.update(G5.sys, G5, G5.t, 1, HOOKS);
  check('police with a warrant engage on sight', cop.hostileToPlayer && cop.mode === 'attack');
})();

section('--- missiles ---');
(function () {
  /* Deep space, everything at rest: the test dummy's stated velocity has to
   * MATCH its actual motion (it has no steering loop to integrate it), or
   * the seeker correctly leads a phantom doing forty kilometres a second
   * and the test punishes correct guidance. */
  var G = makeG(true);
  G.ship.missiles = 2;
  check('a missile without a ship lock refuses to fire',
        (Combat.fireMissile(G.sys, G, G.t, HOOKS), (G.sys.missiles || []).length === 0));

  var victim = fakeVictim(G, { range: 6 });
  G.navTarget = { kind: 'ship', id: victim.id };
  Combat.fireMissile(G.sys, G, G.t, HOOKS);
  check('with a lock it leaves the rail', G.sys.missiles.length === 1 && G.ship.missiles === 1);

  var t = G.t, guard = 0;
  while (G.sys.missiles.length && guard++ < 300) {
    t += 0.5;
    Combat.update(G.sys, G, t, 0.5, HOOKS);
  }
  check('the seeker arrives inside a minute', guard < 130, guard + ' half-second steps');
  check('and forty-two points of it arrive with it',
        victim.dead || victim.hullHp <= victim.hullMax - Combat.MISSILES.hawk.dmg,
        victim.hullHp + ' hull left');
})();

section('--- a kill leaves things behind ---');
(function () {
  var G = makeG(true);
  G.sys.canisters = [];
  var victim = fakeVictim(G, { range: 4, manifest: [{ cid: 'grain', tonnes: 30 }] });
  Combat.killNpc(G.sys, G, victim, G.t, HOOKS);
  check('the manifest spills as canisters', (G.sys.canisters || []).length > 0);
  check('the wreck flashes', G.explosions.length > 0);
  check('and the ship is gone from the sky', Sim.shipsAll(G.sys, G.t).every(function (s) {
    return s.id !== victim.id;
  }));
})();

section('--- piracy, from the demanding end ---');
(function () {
  // Unarmed: laughed off.
  var G = makeG(true);
  G.ship.gun = null; G.ship.missiles = 0;
  var v = fakeVictim(G, { range: 10, faction: 'vicfac' });
  Combat.demandFrom(G.sys, G, G.t, v.live, 'cargo', HOOKS);
  check('an unarmed demand is ignored', v.mode === 'breakoff' && !(G.sys.canisters || []).length);

  // Armed: the freighter pays, in canisters, and the clock starts.
  var G2 = makeG(true);
  G2.sys.canisters = [];
  var v2 = fakeVictim(G2, { range: 10, faction: 'vicfac2' });
  Combat.demandFrom(G2.sys, G2, G2.t, v2.live, 'cargo', HOOKS);
  check('an armed demand shakes cargo loose', (G2.sys.canisters || []).length > 0);
  check('no witnesses: only the distress clock ticks',
        !(G2.wanted.vicfac2 > 0) && v2.distressAt !== null && v2.distressAt !== undefined);

  // A REAL traffic manifest quotes `qty`, not `tonnes` — the live playtest
  // found every freighter "running empty" because only one spelling was
  // read. Both must shake loose.
  var G2b = makeG(true);
  G2b.sys.canisters = [];
  var v2b = fakeVictim(G2b, { range: 10, manifest: [{ cid: 'computers', qty: 40 }] });
  Combat.demandFrom(G2b.sys, G2b, G2b.t, v2b.live, 'cargo', HOOKS);
  check('a qty-shaped manifest shakes loose too', (G2b.sys.canisters || []).length > 0);

  // Credits variant pays cash.
  var G3 = makeG(true);
  var v3 = fakeVictim(G3, { range: 10 });
  var before = G3.ship.credits;
  Combat.demandFrom(G3.sys, G3, G3.t, v3.live, 'credits', HOOKS);
  check('a credit demand is wired over', G3.ship.credits > before);

  // Demanding from the police is a bad idea, mechanically.
  var G4 = makeG(true);
  var v4 = fakeVictim(G4, { kind: 'police', cls: 'police', range: 10, faction: 'lf' });
  Combat.demandFrom(G4.sys, G4, G4.t, v4.live, 'cargo', HOOKS);
  check('demanding from the law starts a fight', v4.hostileToPlayer && v4.mode === 'attack');

  // Range gate: threats whispered from 100 km away are not threats.
  var G5 = makeG(true);
  var v5 = fakeVictim(G5, { range: 100, faction: 'farfac' });
  Combat.demandFrom(G5.sys, G5, G5.t, v5.live, 'cargo', HOOKS);
  check('too far away to threaten anyone', !(G5.wanted.farfac > 0) && !v5.distressAt);
})();

section('--- taking hits ---');
(function () {
  var G = makeG();
  Combat.buyOutfit(G, 'shield', 'shield');
  var hull0 = G.ship.hullHp;
  Combat.damagePlayer(G, 10, HOOKS);
  check('the shield eats damage first',
        G.ship.hullHp === hull0 && G.ship.shieldHp === Combat.MODULES.shield.cap - 10);

  Combat.damagePlayer(G, Combat.MODULES.shield.cap, HOOKS);
  check('overflow reaches the hull', G.ship.hullHp < hull0);

  var died = false;
  Combat.damagePlayer(G, 10000, { say: function () {}, sound: function () {},
                                  destroyed: function () { died = true; } });
  check('zero hull is the end of the hull', died);

  Combat.stripForRespawn(G.ship);
  check('the respawn hull is a stock Talon with the starter gun',
        G.ship.hullId === 'talon' && G.ship.gun === 'phpulse' &&
        G.ship.hullHp === Combat.HULLS.talon.hullMax &&
        Object.keys(G.ship.cargo).length === 0);
  check('and the slots came back empty but for that gun',
        Object.keys(G.ship.fit).length === 1 &&
        G.ship.fit.hardpoint0 === 'phpulse', JSON.stringify(G.ship.fit));
})();

section('--- contracts ---');
(function () {
  var G = makeG();
  var galaxy = Galaxy.build('kawartha');
  var port = G.sys.ports[0];
  var here = galaxy.home;

  var board1 = Missions.boardAt(port, G.sys, galaxy, here, 1000);
  var board2 = Missions.boardAt(port, G.sys, galaxy, here, 2000);
  check('the board is a pure function of its window',
        JSON.stringify(board1.map(function (o) { return o.id; })) ===
        JSON.stringify(board2.map(function (o) { return o.id; })));
  check('it offers real work', board1.length >= 3, board1.length + ' offers');

  var haul = board1.filter(function (o) { return o.toPortId; })[0];
  check('there is freight to haul', !!haul);
  if (haul) {
    var res = Missions.accept(G, haul, HOOKS);
    check('signing loads the freight aboard',
          res.ok && (G.ship.cargo[haul.cid] || 0) >= haul.tonnes);
    check('and the contract is on the list', G.missions.length === 1);

    check('the same offer cannot be signed twice',
          !Missions.accept(G, haul, HOOKS).ok);

    // Deliver it.
    G.here = here;
    var dst = G.sys.byId[haul.toPortId];
    var creditsBefore = G.ship.credits;
    Missions.completeAtDock(G, dst, G.sys, G.t, HOOKS);
    check('delivery pays on the spot',
          G.ship.credits === creditsBefore + haul.pay && G.missions.length === 0);
    check('the freight left with the contract', !(G.ship.cargo[haul.cid] > 0));
    check('and the faction warms to you',
          !haul.faction || Missions.standing(G, haul.faction) > 0);
  }

  // Expiry: sign one and stand it up.
  var G2 = makeG();
  var b2 = Missions.boardAt(port, G2.sys, galaxy, here, 1000)
    .filter(function (o) { return o.toPortId; })[0];
  Missions.accept(G2, b2, HOOKS);
  var c0 = G2.ship.credits;
  Missions.update(G2, b2.deadline + 1, HOOKS);
  check('a blown deadline fails on its own', G2.missions.length === 0);
  check('the fine came out', G2.ship.credits < c0, c0 + ' -> ' + G2.ship.credits);
  check('and the faction remembers',
        !b2.faction || Missions.standing(G2, b2.faction) < 0);

  // A courier who sold the parcel completes nothing.
  var G3 = makeG();
  var b3 = Missions.boardAt(port, G3.sys, galaxy, here, 1000)
    .filter(function (o) { return o.toPortId; })[1] ||
           Missions.boardAt(port, G3.sys, galaxy, here, 1000)[0];
  if (b3 && b3.toPortId) {
    Missions.accept(G3, b3, HOOKS);
    delete G3.ship.cargo[b3.cid];        // "lost" the freight
    Missions.completeAtDock(G3, G3.sys.byId[b3.toPortId], G3.sys, G3.t, HOOKS);
    check('arriving without the freight completes nothing', G3.missions.length === 1);
  }
})();

section('--- the board says what it is, and what it is for ---');
(function () {
  var G = makeG();
  var port = (G.sys.ports || [])[0];
  var board = Missions.boardAt(port, G.sys, null, null, 0);
  check('the board offers work', board.length > 0, board.length + ' offers');

  var longest = 0, missing = 0, sameTwice = true;
  for (var i = 0; i < board.length; i++) {
    var o = board[i];
    longest = Math.max(longest, o.text.length);
    if (!o.desc) missing++;
  }
  check('every headline fits the cap',
        longest <= Missions.TEXT_MAX, longest + ' / ' + Missions.TEXT_MAX);
  check('and in practice stays far under it', longest < 80, String(longest));
  check('every offer carries a long form', missing === 0, missing + ' without');

  /* The grammar may only use state the mission has, so the destination
   * must appear verbatim in the prose — this is the property that makes a
   * clumsy sentence the worst possible failure. */
  var wrong = board.filter(function (o) {
    return o.desc.indexOf(o.toName) < 0 || o.desc.indexOf(String(o.pay)) < 0;
  });
  check('the long form names the real destination and the real fee',
        wrong.length === 0, wrong.length + ' disagreed with their own offer');

  // Stable: a board read twice reads the same, prose included.
  var again = Missions.boardAt(port, G.sys, null, null, 0);
  for (var j = 0; j < board.length; j++) {
    if (!again[j] || again[j].desc !== board[j].desc) sameTwice = false;
  }
  check('a board reads the same when you come back to it', sameTwice);

  // And the text survives being signed.
  G.ship.credits = 50000;
  var haul = board.filter(function (o) { return o.type === 'haul'; })[0];
  if (haul) {
    Missions.accept(G, haul, HOOKS);
    var mine = (G.missions || []).filter(function (m) { return m.id === haul.id; })[0];
    check('a signed contract still explains itself',
          !!mine && mine.desc === haul.desc);
  }
})();

section('--- contraband and the scan ---');
(function () {
  check('the catalogue lists narcotics and arms as contraband',
        Eco.BY_ID.narcotics && Eco.BY_ID.narcotics.contraband === true &&
        Eco.BY_ID.arms && Eco.BY_ID.arms.contraband === true);

  var realRandom = Math.random;

  // A hail that rolls above the search chance: routine, nothing happens.
  var G = makeG();
  G.sys.crimeScore = 40;           // searchChance = 1 - 0.4*0.85 = 0.66
  var cop = fakeVictim(G, { kind: 'police', cls: 'police', faction: 'lawfac' });
  Math.random = function () { return 0.99; };
  var r1 = Combat.resolveScan(G, cop, HOOKS);
  Math.random = realRandom;
  check('a lucky roll waves you through', r1.searched === false);

  // A search that finds a clean hold.
  G.ship.cargo = { grain: 10 };
  Math.random = function () { return 0.01; };
  var r2 = Combat.resolveScan(G, cop, HOOKS);
  Math.random = realRandom;
  check('a clean hold is searched and cleared',
        r2.searched === true && r2.contraband === false && G.ship.cargo.grain === 10);
  check('clearance costs nothing', !(G.wanted.lawfac > 0));

  // A search that finds narcotics: seized, fined, and standing takes a hit.
  var G2 = makeG();
  G2.sys.crimeScore = 40;
  G2.standing.lawfac = 20;
  var cop2 = fakeVictim(G2, { kind: 'police', cls: 'police', faction: 'lawfac' });
  G2.ship.cargo = { grain: 5, narcotics: 10 };
  Sim.refreshShip(G2.ship);
  Math.random = function () { return 0.01; };
  var r3 = Combat.resolveScan(G2, cop2, HOOKS);
  Math.random = realRandom;
  check('a dirty hold is caught', r3.searched === true && r3.contraband === true);
  check('the contraband is seized, the legal freight is not',
        !(G2.ship.cargo.narcotics > 0) && G2.ship.cargo.grain === 5);
  check('the fine matches the tonnage on the books',
        r3.fine === Math.round(10 * Combat.SMUGGLING_FINE_PER_TONNE) &&
        G2.wanted.lawfac === r3.fine, String(r3.fine));
  check('and the faction likes you less for it', Missions.standing(G2, 'lawfac') < 20);

  // The search floor: even a lawless system searches you sometimes.
  var G3 = makeG();
  G3.sys.crimeScore = 100;         // searchChance floors at SEARCH_FLOOR
  var cop3 = fakeVictim(G3, { kind: 'police', cls: 'police', faction: 'lawfac' });
  Math.random = function () { return Combat.SEARCH_FLOOR - 1e-6; };
  var r4 = Combat.resolveScan(G3, cop3, HOOKS);
  Math.random = realRandom;
  check('the most permissive world still has a search floor', r4.searched === true);

  // The mission board never hands out contraband as legal freight.
  var galaxy = Galaxy.build('kawartha');
  var Ggen = makeG();
  var boards = [];
  (Ggen.sys.ports || []).forEach(function (p) {
    boards.push.apply(boards, Missions.boardAt(p, Ggen.sys, galaxy, galaxy.home, 1000));
  });
  check('no haul contract ever moves contraband',
        boards.every(function (o) { return !Eco.BY_ID[o.cid] || !Eco.BY_ID[o.cid].contraband; }));
})();

section('--- the save file ---');
(function () {
  var G = makeG();
  G.seed = 'kawartha';
  G.galaxy = Galaxy.build('kawartha');
  G.here = G.galaxy.home;
  G.visited = {}; G.visited[G.here.id] = true;
  G.t = 123456;
  G.ship.credits = 7777;
  G.ship.cargo = { grain: 5 };
  G.ship.missiles = 3;
  G.standing = { fac1: 12 };
  G.wanted = { fac2: 450 };
  G.missions = [{ id: 'm1', type: 'haul', cid: 'grain', tonnes: 5, pay: 100,
                  deadline: 999999, faction: 'fac1', text: 'test', toPortId: 'p1' }];
  G.ledgerLog = [];

  check('the save writes', Save.store(G));
  var data = Save.load('kawartha');
  check('and reads back', !!data && data.ship.credits === 7777);
  check('a save for another seed is not this one', Save.load('elsewhere') === null);

  // Restore into a fresh career.
  var G2 = makeG();
  G2.seed = 'kawartha';
  G2.galaxy = Galaxy.build('kawartha');
  G2.here = G2.galaxy.home;
  G2.visited = {};
  Save.restore(G2, data, {});
  check('time, money, hold and warrants all survive the round trip',
        G2.t === 123456 && G2.ship.credits === 7777 &&
        G2.ship.cargo.grain === 5 && G2.wanted.fac2 === 450 &&
        G2.ship.missiles === 3 && G2.missions.length === 1);
  check('position survives to the metre',
        V.dist(G2.ship.pos, G.ship.pos) < 1e-6);

  Save.clear('kawartha');
  check('N really deletes it', Save.load('kawartha') === null);
})();

/* The exploit this closes: waste pays you at PICKUP, so jettisoning it
 * used to keep the whole payout at zero cost — faster and richer than the
 * disposal run the payout exists to fund. The fix is not a price change,
 * because no price is wrong; it is that dumping is now a crime. */
section('--- dumping reactor waste ---');
(function () {
  // Force the report roll on: strict system, everyone talks.
  function strict(G) { G.sys.crimeScore = 0; }
  function lawless(G) { G.sys.crimeScore = 100; }

  /* Deep space plus one planted witness, so the only thing that can see
   * the dump is the thing the test put there. In orbit you are inside
   * WITNESS_RANGE of stations and rail traffic, which is realistic and
   * useless for asserting WHO reported it. */
  var G = makeG(true);
  strict(G);
  fakeVictim(G, { name: 'Witness', faction: 'testfac', range: 10 });
  var r = Combat.dumping(G.sys, G, 0, 'waste', 4, HOOKS);
  check('a witnessed dump in a strict system is reported',
        r && r.witnessed && r.reported, JSON.stringify(r));
  check('the fine scales with tonnage',
        r.fine === Math.round(4 * Combat.DUMPING_FINE_PER_TONNE),
        r.fine + ' cr for 4t');
  check('a witness that is itself an authority takes the bounty',
        G.wanted.testfac === r.fine, JSON.stringify(G.wanted));

  /* A factionless bystander reports it to whoever holds the system, rather
   * than the fine being pinned on the ship that happened to be looking. */
  var Gj = makeG(true);
  strict(Gj);
  // fakeVictim defaults the faction, so strip it back off: the point of
  // this case is a witness with no jurisdiction of its own.
  delete fakeVictim(Gj, { name: 'Bystander', range: 10 }).faction;
  var rj = Combat.dumping(Gj.sys, Gj, 0, 'waste', 2, HOOKS);
  var holder = Gj.sys.factions && Gj.sys.factions[0] && Gj.sys.factions[0].id;
  check('a bystander reports it to the system authority',
        rj.reported && rj.faction === holder && Gj.wanted[holder] === rj.fine,
        rj.faction + ' vs holder ' + holder);

  /* The economic claim, and the whole point of the exercise: loading waste
   * and dumping it must not beat loading it and delivering it. Payout is
   * 310-620 cr/t at the producer, disposal 130-190 cr/t at the sink, so an
   * honest run nets at worst 310-190 = 120 cr/t. Dumping nets the payout
   * minus the fine, and that has to be worse. */
  var worstHonest = 310 - 190;
  var bestDump = 620 - Combat.DUMPING_FINE_PER_TONNE;
  check('dumping is worse per tonne than disposing, even at best odds',
        bestDump < worstHonest,
        bestDump + ' cr/t dumped vs ' + worstHonest + ' cr/t hauled');

  // Nobody around: geometry alone clears you, whatever the law says.
  var G2 = makeG(true);
  strict(G2);
  var r2 = Combat.dumping(G2.sys, G2, 0, 'waste', 4, HOOKS);
  check('an unwitnessed dump costs nothing',
        r2 && !r2.witnessed && !r2.reported &&
        !Object.keys(G2.wanted).length);

  // Lawless system, witness present: the floor still bites sometimes, so
  // this asserts the distribution rather than a single roll.
  var G3 = makeG(true);
  lawless(G3);
  fakeVictim(G3, { name: 'Witness', faction: 'testfac', range: 10 });
  var reported = 0;
  for (var i = 0; i < 400; i++) {
    G3.wanted = {};
    if (Combat.dumping(G3.sys, G3, 0, 'waste', 1, HOOKS).reported) reported++;
  }
  check('a lawless system reports it only rarely',
        reported > 0 && reported < 400 * 0.4,
        reported + '/400 reported');

  // Ordinary cargo is your property. Dumping it is not anyone's business.
  var G4 = makeG(true);
  strict(G4);
  fakeVictim(G4, { name: 'Witness', faction: 'testfac', range: 10 });
  check('jettisoning legal cargo is not a crime',
        Combat.dumping(G4.sys, G4, 0, 'grain', 20, HOOKS) === null &&
        !Object.keys(G4.wanted).length);
})();

/* Docking clearance. The rule is soft by design — the clamps still take an
 * uncleared ship — so what these guard is that the PRICE actually lands, and
 * that a granted clearance is spent rather than permanent. */
section('--- docking clearance ---');
(function () {
  function portIn(G) {
    var p = G.sys.ports && G.sys.ports[0];
    if (p && !p.faction) p.faction = 'testfac';
    return p;
  }

  var G = makeG();
  var port = portIn(G);
  check('a port exists to hail', !!port);
  if (!port) return;

  check('you start uncleared', !Combat.isCleared(G, port));

  var r = Combat.requestClearance(G, port, HOOKS);
  check('a clean pilot is granted clearance', r.granted && Combat.isCleared(G, port));
  check('and the port says so in words', /granted/i.test(r.text), r.text);

  // Arriving cleared costs nothing, and spends the clearance.
  check('arriving cleared is free', Combat.arriveAtPort(G, port, HOOKS) === null);
  check('and the clearance is spent, not permanent', !Combat.isCleared(G, port));

  /* Arriving unannounced is an offence rather than a refusal — the whole
   * point of the soft gate. */
  var G2 = makeG();
  var p2 = portIn(G2);
  G2.sys.crimeScore = 0;                       // strict: full price
  var off = Combat.arriveAtPort(G2, p2, HOOKS);
  check('arriving uncleared costs a flat 500', off && off.fine === 500,
        JSON.stringify(off));
  check('and the bounty lands on the port owner',
        G2.wanted[off.faction] === off.fine);
  check('the faction thinks less of you',
        (G2.standing[off.faction] || 0) < 0);

  /* The citation is the smaller half. FUGITIVE is the part that bites. */
  check('and it makes you a fugitive', Combat.isFugitive(G2, off.faction));
  check('which the faction acts on immediately, bounty threshold or not',
        Combat.wantedHere(G2, off.faction) &&
        G2.wanted[off.faction] < Combat.WANTED_HUNT,
        'owed ' + G2.wanted[off.faction] + ' vs hunt threshold ' + Combat.WANTED_HUNT);
  check('so their ports shut too', Combat.dockRefused(G2, p2));

  /* The flat fine does not move with local tolerance any more — a lawless
   * frontier charges the same 500. What tolerance still decides is how
   * hard they come after you for it. */
  var G3 = makeG();
  var p3 = portIn(G3);
  G3.sys.crimeScore = 100;
  var lax = Combat.arriveAtPort(G3, p3, HOOKS);
  check('a lawless port charges the same flat citation', lax.fine === off.fine,
        lax.fine + ' cr vs ' + off.fine + ' cr');

  /* Two ways out, and only two. */
  var G7 = makeG();
  var p7 = portIn(G7);
  Combat.arriveAtPort(G7, p7, HOOKS);
  G7.ship.credits = 100000;
  var paid = Combat.payFugitive(G7);
  check('paying it off clears the status', paid > 0 && !Combat.isFugitive(G7),
        paid + ' cr');
  check('and reopens the door', !Combat.dockRefused(G7, p7));

  var G8 = makeG();
  var p8 = portIn(G8);
  Combat.arriveAtPort(G8, p8, HOOKS);
  G8.ship.credits = 0;
  check('and you cannot pay what you have not got', Combat.payFugitive(G8) < 0);
  var fled = Combat.fleeSystem(G8);
  check('running for it ends the pursuit', !!fled && !Combat.isFugitive(G8));
  check('but the citation is still on the books',
        (G8.wanted[fled.faction] || 0) > 0,
        G8.wanted[fled.faction] + ' cr outstanding');

  // Refusals: a bounty, and a faction that hates you.
  var G4 = makeG();
  var p4 = portIn(G4);
  G4.wanted = {}; G4.wanted[p4.faction] = 5000;      // over WANTED_HUNT
  var denied = Combat.requestClearance(G4, p4, HOOKS);
  check('a wanted pilot is refused', !denied.granted && denied.reason === 'wanted');
  check('and stays uncleared', !Combat.isCleared(G4, p4));

  var G5 = makeG();
  var p5 = portIn(G5);
  G5.standing = {}; G5.standing[p5.faction] = -80;
  var hated = Combat.requestClearance(G5, p5, HOOKS);
  check('so is one the faction is hostile to',
        !hated.granted && hated.reason === 'hostile');

  /* Getting out is its own permission, refused for its own reasons. */
  var G9 = makeG();
  var p9 = portIn(G9);
  check('you are not cleared to launch by default', !Combat.launchCleared(G9, p9));
  var lr = Combat.requestLaunch(G9, p9, HOOKS);
  check('a clean pilot is cleared to launch',
        lr.granted && Combat.launchCleared(G9, p9));
  Combat.spendLaunch(G9);
  check('and it is spent on the way out, not permanent',
        !Combat.launchCleared(G9, p9));

  /* Docking clearance is NOT launch clearance — the doors do not open
   * just because they once let you in. */
  var G10 = makeG();
  var p10 = portIn(G10);
  Combat.requestClearance(G10, p10, HOOKS);
  check('being cleared to dock does not clear you to leave',
        Combat.isCleared(G10, p10) && !Combat.launchCleared(G10, p10));

  /* And a warrant collected while you were parked keeps you parked. */
  var G11 = makeG();
  var p11 = portIn(G11);
  G11.wanted = {}; G11.wanted[p11.faction] = 5000;
  var lrDenied = Combat.requestLaunch(G11, p11, HOOKS);
  check('a wanted pilot is not let out', !lrDenied.granted &&
        lrDenied.reason === 'wanted' && !Combat.launchCleared(G11, p11));

  /* THE DOORS. They are a readout of a permission, not a state of their
   * own — which is what makes them impossible to get out of step. Both
   * permissions are spent when they are used, so the doors open when you
   * are told to come ahead, shut behind you once you are down, open again
   * when you are cleared to leave, and shut once you are out. */
  var G12 = makeG();
  /* Explicitly a GROUND port: only a shaft has doors, and ports[0] is as
   * likely as not to be a wheel in orbit. */
  var p12 = (G12.sys.ports || []).filter(function (p) { return p.surface; })[0];
  if (p12 && !p12.faction) p12.faction = 'testfac';
  check('a ground port exists to hail', !!p12);
  check('the doors start shut', !Combat.doorsOpen(G12, p12));
  Combat.requestClearance(G12, p12, HOOKS);
  check('clearance to dock opens them', Combat.doorsOpen(G12, p12));
  Combat.arriveAtPort(G12, p12, HOOKS);
  check('and they shut behind you once you are down',
        !Combat.doorsOpen(G12, p12));
  Combat.requestLaunch(G12, p12, HOOKS);
  check('clearance to launch opens them again', Combat.doorsOpen(G12, p12));
  Combat.spendLaunch(G12);
  check('and they shut behind you on the way out',
        !Combat.doorsOpen(G12, p12));

  var G13 = makeG();
  var orb13 = { id: 'orb-1', name: 'Wheel', faction: 'civil', surface: false };
  Combat.requestClearance(G13, orb13, HOOKS);
  check('an orbital dock has no shaft doors to open',
        Combat.isCleared(G13, orb13) && !Combat.doorsOpen(G13, orb13));

  // Leaving the system drops everything you were granted.
  var G6 = makeG();
  var p6 = portIn(G6);
  Combat.requestClearance(G6, p6, HOOKS);
  check('cleared before the jump', Combat.isCleared(G6, p6));
  Combat.clearAllClearances(G6);
  check('and not after it', !Combat.isCleared(G6, p6));
})();

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
