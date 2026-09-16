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

section('--- no hull is locked out of a weapon ---');
(function () {
  /* THE RULE: a hull's reactor must run every core system it has slots
   * for AND still light the cheapest gun in the catalogue. A ship that
   * cannot be armed once it is properly fitted is a ship nobody would
   * fly, and only shuttles are meant to be unarmed. */
  var cheapest = null;
  for (var id in Combat.EQUIPMENT) {
    var it = Combat.EQUIPMENT[id];
    if (it.kind !== 'gun') continue;
    if (!cheapest || it.power < cheapest.power) cheapest = it;
  }
  check('there is a cheapest gun to reason about', !!cheapest,
        cheapest && cheapest.name + ' at ' + cheapest.power + ' MW');

  var core = ['shield', 'heatshield', 'turret'];
  var order = ['dart', 'talon', 'kestrel', 'mule'];
  for (var h = 0; h < order.length; h++) {
    var hull = Combat.HULLS[order[h]];
    var probe = { hullId: hull.id, fit: {} };
    var draw = 0;
    /* Fit everything essential this hull has room for, then check a gun
     * still fits afterwards. */
    for (var c = 0; c < core.length; c++) {
      var v = Combat.canFit(probe, core[c]);
      if (v.ok) {
        probe.fit[v.key] = core[c];
        draw += Combat.EQUIPMENT[core[c]].power;
      }
    }
    var armed = Combat.canFit(probe, cheapest.id);
    check(hull.name + ' can still arm itself fully fitted', armed.ok,
          'core draw ' + draw.toFixed(1) + ' of ' + hull.powerMW +
          ' MW' + (armed.ok ? '' : ' — ' + armed.why));
  }
})();

section('--- merchantmen shoot back, shuttles do not ---');
(function () {
  check('a freighter counts as armed', Combat.isArmedNpc({ cls: 'freighter' }));
  check('a tanker counts as armed', Combat.isArmedNpc({ cls: 'tanker' }));
  check('a shuttle does not', !Combat.isArmedNpc({ cls: 'shuttle' }));

  check('a trader gun is feeble next to a warship gun',
        Combat.TRADER_GUN.dmg < Combat.NPC_GUN.dmg / 2 &&
        Combat.TRADER_GUN.range < Combat.NPC_GUN.range,
        Combat.TRADER_GUN.dmg + ' dmg vs ' + Combat.NPC_GUN.dmg);

  check('but a merchantman calls for help in half the time',
        Combat.distressDelayFor({ kind: 'trader' }) <
        Combat.distressDelayFor({ kind: 'police' }),
        Combat.distressDelayFor({ kind: 'trader' }) + 's vs ' +
        Combat.distressDelayFor({ kind: 'police' }) + 's');

  /* Being shot at makes a freighter defend itself without making it a
   * hunter — it fires while it runs, and it still runs. */
  var G = makeG();
  var victim = fakeVictim(G, { kind: 'trader', cls: 'freighter', range: 5 });
  Combat.damageNpc(G.sys, G, victim, 4, 0, HOOKS);
  check('a hit freighter defends itself', victim.defending === true);
  check('but does not turn into a hunter',
        !victim.hostileToPlayer && victim.mode === 'breakoff');

  var G2 = makeG();
  var pod = fakeVictim(G2, { kind: 'trader', cls: 'shuttle', range: 5 });
  Combat.damageNpc(G2.sys, G2, pod, 4, 0, HOOKS);
  check('a shuttle has nothing to defend itself with', !pod.defending);

  /* The rescue tender is the other unarmed hull, and the only one whose
   * protection is entirely legal rather than physical. */
  check('a tender is unarmed too', !Combat.isArmedNpc({ cls: 'tender' }));
  check('and killing one costs more than killing a patrol cutter',
        Combat.BOUNTY.killTender > Combat.BOUNTY.killPolice,
        Combat.BOUNTY.killTender + ' vs ' + Combat.BOUNTY.killPolice);
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
  /* The cargo scoop comes off too, and that is the point rather than a
   * workaround. A Class 3 beam (9 t), a Mk II reactor (9 t) and a shield
   * (4 t) come to EXACTLY the Kestrel's 22 t budget, so the one tonne of
   * scoop every ship now leaves the yard with is the difference between
   * this build existing and not. A glass cannon does not stop to pick
   * things up, and the budget says so without anyone writing a rule. */
  var scoopSlot = Combat.fittedList(Rk.ship).filter(function (f) {
    return f.item.kind === 'scoop';
  })[0];
  if (scoopSlot) Combat.sellFitted(Rk, scoopSlot.key);
  check('the glass cannon has no room for a scoop', !Combat.hasScoop(Rk.ship));
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
  /* Four, not three: the gun, turret and shield the legacy fields named,
   * plus the cargo scoop migrateFit issues to any ship that has never had a
   * fit map. Catching cargo used to be a property of having a hold and is
   * now a fitting, so a career that predates slots is handed the thing it
   * has always been able to do rather than quietly losing it. */
  check('nothing was silently confiscated, and the scoop was issued',
        Combat.fittedList(s).length === 4 &&
        Combat.hasScoop(s), JSON.stringify(s.fit));

  // Idempotent: migrating an already-migrated ship changes nothing.
  var before = JSON.stringify(s.fit);
  Combat.migrateFit(s);
  check('migrating twice is a no-op', JSON.stringify(s.fit) === before);
})();

section('--- scanners ---');
(function () {
  var G = makeG();
  var s = G.ship;
  s.credits = 100000;
  var prey = fakeVictim(G, { kind: 'pirate', cls: 'pirate', range: 4 });

  /* Nothing fitted reads as NOTHING, not as zeroes — "no scanner" and "an
   * undamaged ship" must never look the same on the instrument. */
  check('with no scanner there is no reading',
        Combat.scanLevel(s) === 0 && Combat.scanShip(s, prey) === null);

  Combat.fitItem(s, 'hullscan');
  var r1 = Combat.scanShip(s, prey);
  check('a hull scanner reads a fraction', !!r1 && r1.level === 1 &&
        r1.hullFrac === 1, r1 && r1.hullFrac);
  check('and deliberately not the numbers',
        r1.hullHp === undefined && r1.hullMax === undefined);

  /* Asking settles the lazy hull, which is safe because npcHull is a pure
   * function of the class — looking cannot change what it is made of. */
  check('scanning assigned the hull it was always going to have',
        prey.hullMax === Combat.npcHull(prey) || prey.hullMax > 0,
        String(prey.hullMax));

  Combat.damageNpc(G.sys, G, prey, prey.hullMax * 0.5, G.t, HOOKS);
  var r2 = Combat.scanShip(s, prey);
  check('a hurt ship reads hurt', r2.hullFrac < 1 && r2.hullFrac > 0,
        r2.hullFrac.toFixed(2));

  /* One scanner at a time: they answer the same question, so two of them
   * is two utility slots spent to learn one thing. */
  var both = Combat.canFit(s, 'combatscan');
  check('the two scanners will not both fit', !both.ok, both.why);

  Combat.sellFitted(G, Combat.fittedList(s).filter(function (e) {
    return e.item.kind === 'scanner';
  })[0].key);
  Combat.fitItem(s, 'combatscan');
  var r3 = Combat.scanShip(s, prey);
  check('the combat scanner reads the numbers', r3.level === 2 &&
        r3.hullMax > 0 && typeof r3.hullHp === 'number',
        r3.hullHp.toFixed(0) + ' / ' + r3.hullMax);
  check('and reports the shield as well',
        typeof r3.shieldMax === 'number' && typeof r3.shieldHp === 'number',
        r3.shieldHp + ' / ' + r3.shieldMax);
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

  /* Cooldowns are per SLOT since fire groups landed — one gun in a group is
   * no longer one gun on the ship, so there is no single ship-wide clock to
   * zero. G.gunCool is keyed by slot key. */
  G.gunCool = {};
  G.ship.fwd = V.norm({ x: 0, y: 0, z: 1 });   // now aim at nothing
  var hp = victim.hullHp;
  Combat.fireGun(G.sys, G, G.t, HOOKS);
  check('a gun fired at empty sky hits empty sky', victim.hullHp === hp);

  /* Closer than the fleeing trader, because both test dummies sit on the
   * same bearing and the gun rightly hits the nearest thing in the cone. */
  var cop = fakeVictim(G, { kind: 'police', cls: 'police', range: 3, faction: 'lawfac' });
  G.gunCool = {};
  G.ship.fwd = V.norm(V.sub(cop.live.pos, G.ship.pos));
  Combat.fireGun(G.sys, G, G.t, HOOKS);
  check('an armed ship shot at turns and fights',
        cop.hostileToPlayer === true && cop.mode === 'attack');
})();

section('--- fire groups ---');
(function () {
  var G = makeG();
  G.ship.credits = 200000;
  Combat.buyHull(G, 'kestrel');            // three hardpoints to play with
  Combat.buyEquipment(G, 'phbeam', 'hardpoint1');

  check('a fresh ship puts everything on the primary trigger',
        Combat.gunsInGroup(G.ship, 'a').length === 2 &&
        Combat.gunsInGroup(G.ship, 'b').length === 0);

  var said = null;
  var LOUD = { say: function (m) { said = m; }, sound: function () {} };
  check('an empty group fires nothing',
        Combat.fireGroup(G.sys, G, G.t, 'b', LOUD) === 0);
  /* Refusals carry reasons: a trigger that silently does nothing is
   * indistinguishable from a broken trigger. */
  check('and says why, rather than doing nothing quietly',
        !!said && said.indexOf('group B') >= 0, said);

  Combat.toggleGroup(G.ship, 'hardpoint1');
  check('moving a gun moves it out of the other group',
        Combat.groupOf(G.ship, 'hardpoint1') === 'b' &&
        Combat.gunsInGroup(G.ship, 'a').length === 1 &&
        Combat.gunsInGroup(G.ship, 'b').length === 1);

  /* Two guns in one group are two triggers pulled at once, not one gun
   * firing twice as fast — so the cooldowns have to be per SLOT. Sharing
   * one would have made the second gun do nothing at all. */
  var pair = makeG();
  pair.ship.credits = 200000;
  Combat.buyHull(pair, 'kestrel');
  Combat.buyEquipment(pair, 'phpulse', 'hardpoint1');
  var prey = fakeVictim(pair, { range: 2 });
  pair.ship.fwd = V.norm(V.sub(prey.live.pos, pair.ship.pos));
  var fired = Combat.fireGroup(pair.sys, pair, pair.t, 'a', HOOKS);
  check('both guns in a group fire on the same trigger pull', fired === 2,
        fired + ' of 2');
  check('and each drew its own beam', pair.beams.length === 2);
  check('a second pull inside the cooldown fires nothing',
        Combat.fireGroup(pair.sys, pair, pair.t + 0.01, 'a', HOOKS) === 0);
  check('and it fires again once the cooldown has run',
        Combat.fireGroup(pair.sys, pair, pair.t + 1.0, 'a', HOOKS) === 2);

  /* A Kestrel's hardpoint2 is not a Talon's, so a group assignment keyed by
   * slot has to travel with the gear when the hull changes under it. */
  var swap = makeG();
  swap.ship.credits = 200000;
  Combat.buyHull(swap, 'kestrel');
  Combat.buyEquipment(swap, 'phbeam', 'hardpoint1');
  Combat.setGroup(swap.ship, 'hardpoint1', 'b');
  Combat.buyHull(swap, 'talon');
  check('a gun keeps its trigger across a hull change',
        Combat.gunsInGroup(swap.ship, 'b').length === 1 &&
        Combat.gunsInGroup(swap.ship, 'b')[0].item.id === 'phbeam',
        JSON.stringify(swap.ship.groups));
})();

section('--- beams heat your own hull ---');
(function () {
  /* The heat sink was built, tested and completely inert: nothing in the
   * game generated weapon heat for it to absorb. These are the tests that
   * say it is switched on. */
  var G = makeG();
  G.ship.credits = 200000;
  Combat.buyEquipment(G, 'phbeam', 'hardpoint0');   // 12 heat/s, 0.12 s cycle
  var beam = Combat.GUNS.phbeam;
  G.ship.heat = 0;

  Combat.fireGroup(G.sys, G, G.t, 'a', HOOKS);
  var perShot = beam.heat * beam.cooldown;
  check('a shot puts its own waste heat into the hull',
        Math.abs(G.ship.heat - perShot) < 1e-9,
        G.ship.heat.toFixed(3) + ' vs ' + perShot.toFixed(3));

  /* Held down, a weapon should cost exactly its catalogue figure per second
   * — that is the whole reason one shot is worth heat x cooldown rather
   * than a second number kept in step by hand. */
  var t = G.t, shots = 0;
  G.ship.heat = 0;
  for (var i = 0; i < 200; i++) {
    t += 0.01;
    if (Combat.fireGroup(G.sys, G, t, 'a', HOOKS)) shots++;
  }
  var rate = G.ship.heat / 2.0;          // two seconds of trigger
  check('and held down it costs its catalogue rate per second',
        Math.abs(rate - beam.heat) < beam.heat * 0.06,
        rate.toFixed(1) + ' /s vs catalogue ' + beam.heat + ' /s');

  // A live sink takes its share of it, through addHeat, with no special case.
  var S = makeG();
  S.ship.credits = 200000;
  Combat.buyEquipment(S, 'phbeam', 'hardpoint0');
  Combat.buyEquipment(S, 'sinklauncher');
  Combat.buyOutfit(S, 'sink', null);
  S.ship.heat = 0;
  Combat.armSink(S, 0, HOOKS);
  Combat.fireGroup(S.sys, S, 0, 'a', HOOKS);
  check('a live sink takes its cut of weapon heat too',
        S.ship.heat < perShot - 1e-9 && S.sink.held > 0,
        'hull ' + S.ship.heat.toFixed(3) + ', sink ' + S.sink.held.toFixed(3));
})();

section('--- a hold is a function of the ship that carries it ---');
(function () {
  /* The doctrine this fixes: killNpc used to invent a pirate's cargo with
   * bare Math.random(), so the same wreck on the same seed threw different
   * goods every time — and robbing one alive could disagree with killing
   * it about what it had been carrying. */
  var G = makeG();
  var a = { id: 'n7', kind: 'pirate', name: 'The Test' };
  var b = { id: 'n7', kind: 'pirate', name: 'The Test' };
  var m1 = Combat.manifestFor(G.sys, a);
  var m2 = Combat.manifestFor(G.sys, b);
  check('the same ship in the same system carries the same hold',
        JSON.stringify(m1) === JSON.stringify(m2), JSON.stringify(m1));

  var other = { id: 'n8', kind: 'pirate', name: 'The Other' };
  var m3 = Combat.manifestFor(G.sys, other);
  check('a different ship does not', JSON.stringify(m3) !== JSON.stringify(m1),
        JSON.stringify(m3));

  /* Salted with the system seed, because buildPatrols numbers its specs
   * n0, n1, n2... PER SYSTEM: unsalted, every system's n7 would be
   * carrying the identical crate. */
  var far = { bodies: [], seed: 'somewhere-else', traffic: G.sys.traffic };
  var m4 = Combat.manifestFor(far, { id: 'n7', kind: 'pirate' });
  check('and the same id in another system carries something else',
        JSON.stringify(m4) !== JSON.stringify(m1), JSON.stringify(m4));

  check('the hold is real cargo, in real tonnes',
        m1.length > 0 && typeof m1[0].cid === 'string' && m1[0].tonnes > 0);

  /* Derived once, then owned: the moment anything reads a hold it becomes
   * stored state, because the player is about to take things out of it. */
  check('reading a hold stores it on the ship', a.manifest === m1);
  a.manifest = [{ cid: 'grain', tonnes: 1 }];
  check('and a stored hold wins over the hash',
        Combat.manifestFor(G.sys, a)[0].cid === 'grain');

  // Loot is drawn from what actually flies here, not a global table.
  var flown = {};
  (G.sys.traffic || []).forEach(function (r) {
    (r.out || []).concat(r.back || []).forEach(function (l) { flown[l.cid] = true; });
  });
  var local = Combat.manifestFor(G.sys, { id: 'n99', kind: 'pirate' });
  check('and it is something that actually flies in this system',
        !!flown[local[0].cid], local[0].cid);

  /* Robbery and death read one hold. Before this they read two, because
   * only the death path ever invented one. */
  var R = makeG();
  var pirate = fakeVictim(R, { kind: 'pirate', cls: 'pirate', range: 3,
                               manifest: [] });
  pirate.id = 'n42';
  var robbed = Combat.manifestFor(R.sys, pirate);
  var killed = Combat.manifestFor(R.sys, pirate);
  check('robbing a pirate and killing it agree about the hold',
        JSON.stringify(robbed) === JSON.stringify(killed));
})();

section('--- the witness doctrine ---');
(function () {
  // Deep space, just the two of you: no bounty at the moment of the crime.
  var G = makeG(true);
  var victim = fakeVictim(G, { range: 5, faction: 'quietfac' });
  Combat.crime(G.sys, G, G.t, 'assault', victim, HOOKS);
  check('no witness, no immediate bounty', !(G.wanted.quietfac > 0));
  /* The delay is per-victim now: a merchantman with nothing better to do
   * with the next few seconds calls sooner than a warship does. */
  check('but the victim starts its distress clock',
        victim.distressAt === G.t + Combat.distressDelayFor(victim),
        'delay ' + Combat.distressDelayFor(victim) + 's for a ' + victim.kind);

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

  // Near a station: seen at once, filed eight seconds later.
  var G3 = makeG();          // in orbit, stations everywhere
  var v3 = fakeVictim(G3, { range: 5, faction: 'seenfac' });
  Combat.crime(G3.sys, G3, G3.t, 'assault', v3, HOOKS);
  /* NOT immediately any more, and the change is the point rather than a
   * regression: a third-party witness has to actually get on the radio, and
   * the eight seconds that takes ARE the window in which you can buy their
   * silence. A test asserting instant reporting was asserting that the hush
   * mechanic could not exist. */
  check('a witnessed crime is pending, not yet filed',
        !!G3.pendingReport && !(G3.wanted.seenfac > 0),
        JSON.stringify(G3.pendingReport || null));
  Combat.update(G3.sys, G3, G3.t + 9, 1, HOOKS);
  check('and lands once the witness gets on the radio', G3.wanted.seenfac > 0,
        String(G3.wanted.seenfac));

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
  check('the manifest spills as canisters',
        (G.sys.canisters || []).filter(function (c) { return c.kind === 'canister'; }).length > 0);
  check('the wreck flashes', G.explosions.length > 0);
  check('and the ship is gone from the sky', Sim.shipsAll(G.sys, G.t).every(function (s) {
    return s.id !== victim.id;
  }));

  /* AND THE HULL COMES APART. The explosion had been standing in for this
   * since combat existed — two expanding rings and then nothing, as though
   * the ship had been deleted rather than destroyed. */
  var shards = Sim.debrisAll(G.sys);
  check('the hull comes apart into wreckage', shards.length >= 6, shards.length + ' shards');
  /* Drawable: a mesh index, a size and a spin. The index is bounded here
   * rather than against Render.SHARD_COUNT because this suite deliberately
   * does not load the renderer; render.test.js holds the two together. */
  check('and it is drawable — a mesh, a size and a spin',
        shards.every(function (c) {
          return c.shard >= 0 && c.shard < 8 &&
                 c.lengthKm > 0 && c.spinRate > 0 && !!c.spinAxis;
        }));

  /* Nothing is created and nothing is counted twice: the cargo that spilled
   * intact and the salvage on the shards are two halves of one hold. */
  var crates = 0, salv = 0;
  (G.sys.canisters || []).forEach(function (c) {
    if (c.kind === 'debris') { if (c.cid) salv += c.tonnes; }
    else crates += c.tonnes;
  });
  check('the wreck accounts for part of the hold, not more than it',
        crates + salv > 0 && crates + salv <= 30, (crates + salv).toFixed(1) + ' t of 30');

  /* A ship whose hold was already emptied by robbery leaves scrap and no
   * salvage — the hold is one number and every path reads it. */
  var E = makeG(true);
  E.sys.canisters = [];
  var stripped = fakeVictim(E, { range: 4, manifest: [] });
  stripped.manifest = [];
  Combat.killNpc(E.sys, E, stripped, E.t, HOOKS);
  var left = Sim.debrisAll(E.sys);
  check('a ship robbed first still breaks up', left.length >= 6);
  check('but there is nothing left on it to salvage',
        left.every(function (c) { return !c.cid; }));
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

  /* A SHIP IS ROBBED ONCE, and this is the reason the section exists.
   *
   * Both the purse and the hold were pure functions read fresh on every
   * demand, so a compliant freighter paid its whole purse and a third of its
   * hold every single time you asked — and since the corridor plants exactly
   * such a freighter next to you in deep space with nothing else to do, one
   * successful interdiction was an unlimited supply of money and the rest of
   * the economy was optional. */
  var G6 = makeG(true);
  var v6 = fakeVictim(G6, { range: 10, faction: 'purse1' });
  var c0 = G6.ship.credits;
  Combat.demandFrom(G6.sys, G6, G6.t, v6.live, 'credits', HOOKS);
  var paid = G6.ship.credits - c0;
  check('the first credit demand pays out', paid > 0, String(paid));
  Combat.demandFrom(G6.sys, G6, G6.t, v6.live, 'credits', HOOKS);
  Combat.demandFrom(G6.sys, G6, G6.t, v6.live, 'credits', HOOKS);
  check('and asking again gets nothing — the safe is empty, not refilled',
        G6.ship.credits === c0 + paid, (G6.ship.credits - c0) + ' vs ' + paid);

  /* The same for cargo, and it must actually reach zero: rounding the dumped
   * share up to a minimum of one tonne meant a hold could be approached
   * forever without arriving, which is the same bug wearing a hat. */
  var G7 = makeG(true);
  G7.sys.canisters = [];
  var v7 = fakeVictim(G7, { range: 10, faction: 'purse2',
                            manifest: [{ cid: 'computers', qty: 12 }] });
  var pulls = 0, dry = 0;
  for (var q = 0; q < 30; q++) {
    var had = (G7.sys.canisters || []).length;
    Combat.demandFrom(G7.sys, G7, G7.t, v7.live, 'cargo', HOOKS);
    if ((G7.sys.canisters || []).length > had) pulls++; else { dry++; break; }
  }
  check('a hold empties in a handful of demands rather than never',
        pulls > 1 && pulls < 12 && dry === 1, pulls + ' pulls');
  var left = Combat.holdOf(G7.sys, v7);
  check('and what is left of it is nothing at all',
        left.length === 0, JSON.stringify(left));

  /* An emptied hold is OWNED. Reading it must not look like "never derived"
   * and quietly hash a fresh cargo into the ship you just cleaned out. */
  check('an emptied hold stays empty when read again',
        Combat.holdOf(G7.sys, v7).length === 0 &&
        Combat.manifestFor(G7.sys, v7).length === 0);

  /* A ship torn out of a lane has no route to inherit a manifest from — that
   * is why the whole interdiction feature used to end in an empty room. */
  var G8 = makeG(true);
  var torn = { id: 'drop-abc', kind: 'trader', name: 'Halcyon Drover',
               tonnes: 620, tornOut: true };
  var tornHold = Combat.holdOf(G8.sys, torn);
  check('a torn-out lane hauler is carrying something',
        tornHold.length > 0 && (tornHold[0].tonnes || tornHold[0].qty) > 0,
        JSON.stringify(tornHold));

  /* An ordinary manifest-less trader is NOT given cargo by the same route —
   * the fallback was widened to lane haulers deliberately, not dropped. */
  var plain = { id: 'n5', kind: 'trader', name: 'Somebody' };
  check('but an ordinary empty trader is still empty',
        Combat.holdOf(G8.sys, plain).length === 0);

  /* Size follows the hull, and follows it far enough to be worth choosing
   * between: a bulk hauler is a much bigger prize than a packet, which is
   * what makes picking a contact in the corridor a decision. */
  var packet = Combat.holdOf(G8.sys, { id: 'drop-p', kind: 'trader',
                                       tonnes: 150, tornOut: true });
  var bulker = Combat.holdOf(G8.sys, { id: 'drop-p', kind: 'trader',
                                       tonnes: 2700, tornOut: true });
  function tot(m) {
    var n = 0; for (var i = 0; i < m.length; i++) n += (m[i].qty || m[i].tonnes || 0);
    return n;
  }
  check('a bulk hauler carries several times a packet',
        tot(bulker) > tot(packet) * 4, tot(packet) + ' t vs ' + tot(bulker) + ' t');

  /* And an in-system pirate, which has no tonnage figure, is untouched by
   * any of it — every hold already hashed in the galaxy must still hash the
   * same, or the change was not additive. */
  var noTonnage = Combat.manifestFor(G8.sys, { id: 'n7', kind: 'pirate' });
  check('a pirate with no tonnage keeps the hold it always had',
        noTonnage.length > 0 && (noTonnage[0].tonnes >= 3 && noTonnage[0].tonnes <= 10),
        JSON.stringify(noTonnage));
})();

section('--- the slipspace modules are things you can buy ---');
(function () {
  /* They were priced and read by the corridor from the day it was built, and
   * they lived in a bespoke `ship.modules` field — so there was no shop, no
   * save, no mass, no draw and no refusal. This is that field folded into
   * the outfitting system that already had all five. */
  var Slip = global.Slipspace || require(path.join(SRC, 'slipspace.js'));
  var classes = ['I', 'II', 'III', 'IV'];
  var kinds = ['baffle', 'anchor'];

  var all = true, priced = true, internal = true;
  kinds.forEach(function (kind) {
    classes.forEach(function (c) {
      var it = Combat.EQUIPMENT[kind + c];
      if (!it) { all = false; return; }
      if (it.price !== Slip.MODULES[kind].price[c]) priced = false;
      if (it.slot !== 'internal') internal = false;
      if (!(it.mass > 0) || !(it.power > 0)) priced = false;
    });
  });
  check('all eight are in the catalogue', all);
  check('and every one is an internal fitting with a mass and a draw', internal);
  check('priced from slipspace.js, so there is one price table and not two',
        priced);

  /* Bought through the ordinary counter, and the corridor sees it. */
  var G = makeG();
  G.ship.credits = 400000;
  var bought = Combat.buyEquipment(G, 'anchorI');
  check('an anchor can simply be bought', bought.ok, bought.why);
  check('and the corridor reads it off the fit map',
        Slip.fittedClass(G.ship, 'anchor') === 'I',
        String(Slip.fittedClass(G.ship, 'anchor')));
  check('a Talon is a class I hull, so a class I anchor actually works',
        Slip.moduleEffective(G.ship, 'anchor') === true);

  /* One field inside another is not a build. */
  var again = Combat.buyEquipment(G, 'anchorIII');
  check('a second anchor is refused, with a reason',
        !again.ok && /already fitted/.test(again.why || ''), again.why);
  var baf = Combat.buyEquipment(G, 'baffleI');
  check('but a baffle is a different module and goes in beside it', baf.ok, baf.why);

  /* THE POINT OF MOVING THEM. The budget now tells the story that the
   * bespoke field could not: an oversized anchor is legal and ruinous, and
   * it says so before you spend rather than after. */
  var H = makeG();
  H.ship.credits = 400000;
  var big = Combat.buyEquipment(H, 'anchorIV');
  check('an oversized anchor is allowed onto a small hull', big.ok, big.why);
  var sum = Combat.fitSummary(H.ship);
  check('and it eats nearly the whole reactor doing it', sum.powerFree < 1,
        sum.powerFree + ' MW free');
  var gun = Combat.canFit(H.ship, 'phpulse');
  check('so the cheapest gun will not light — refused, in words',
        !gun.ok && /MW/.test(gun.why || ''), gun.why);

  /* The old field still works for anything that still writes it — the same
   * courtesy the equipment table extends to legacy weapon ids. */
  var L = makeG();
  L.ship.modules = { anchor: 'II', baffle: null };
  check('the old bespoke field is still honoured', Slip.fittedClass(L.ship, 'anchor') === 'II');
  check('and a ship with neither has neither',
        Slip.fittedClass(makeG().ship, 'anchor') === null);

  /* It saves, because the fit map already did. */
  var snap = Save.snapshot(G);
  check('an anchor rides along in the save via the fit map',
        !!snap && !!snap.ship && JSON.stringify(snap.ship.fit).indexOf('anchorI') >= 0,
        snap && snap.ship && JSON.stringify(snap.ship.fit));

  /* A GATE THAT NOBODY CAN REACH IS NOT A GATE. This project has shipped two
   * of those — a navy needing development > 0.62 when the maximum is 0.61,
   * and a liner needing a pair of settled worlds that essentially never
   * co-occur — so anything with a minDev is now held to actually existing
   * somewhere. Sampled rather than reasoned about, for the same reason.
   *
   * (The check earned its place immediately: a first pass at measuring this
   * called generateSystem with a star object instead of a star SEED, got the
   * same system two hundred times, and reported the entire top of the
   * catalogue as unbuyable. The gates were fine. The measurement was not,
   * which is its own argument for keeping the measurement in the suite.) */
  var reach = {}, ports = 0;
  var seeds = ['kawartha', 'aldebar', 'muirneach', 'tesselate', 'ordovix'];
  for (var s = 0; s < seeds.length; s++) {
    var gal = Galaxy.build(seeds[s]);
    for (var i = 0; i < Math.min(4, gal.stars.length); i++) {
      var sys = Gen.generateSystem(gal.stars[i].seed);
      var bodies = sys.bodies || [];
      for (var b = 0; b < bodies.length; b++) {
        var p = bodies[b];
        if (!p.market) continue;
        ports++;
        var dev = typeof p.market.dev === 'number' ? p.market.dev : 0;
        for (var id in Combat.EQUIPMENT) {
          var it = Combat.EQUIPMENT[id];
          if (it.id !== id) continue;
          if (dev >= (it.minDev || 0)) reach[id] = (reach[id] || 0) + 1;
        }
      }
    }
  }
  var dead = [];
  for (var id2 in Combat.EQUIPMENT) {
    if (Combat.EQUIPMENT[id2].id !== id2) continue;
    if (!reach[id2]) dead.push(id2);
  }
  check('every catalogue item is stocked SOMEWHERE across five seeds',
        dead.length === 0, dead.join(', ') + '  (of ' + ports + ' ports)');
  check('and the anchors are rare rather than everywhere',
        reach.anchorI > 0 && reach.anchorI < ports * 0.6,
        reach.anchorI + ' of ' + ports + ' ports');
})();

section('--- NPCs have shields, and the delivery model finally means something ---');
(function () {
  /* THE FIND THIS SECTION EXISTS FOR. `vsShield` and `vsHull` have been on
   * every gun in the catalogue since the particle retier and NOTHING READ
   * THEM: there was one shield in the game, it belonged to the player, and
   * the player's own guns never hit it. The pulse-soaks / beam-drains
   * interaction the whole weapon design rests on was inert. */
  var flat = { vsShield: 1, vsHull: 1 };
  var pulse = Combat.LASER_DELIVERY.pulse;
  var beam = Combat.LASER_DELIVERY.beam;

  var bare = Combat.splitDamage(0, 20, pulse);
  check('with no shield up, a pulse goes straight to the hull at its hull rate',
        bare.shield === 0 && Math.abs(bare.hull - 24) < 1e-9, JSON.stringify(bare));

  var pv = Combat.splitDamage(100, 20, pulse);
  var bv = Combat.splitDamage(100, 20, beam);
  check('a beam strips a full shield far faster than a pulse',
        bv.shield > pv.shield * 2, pv.shield + ' vs ' + bv.shield);
  check('and neither reaches the hull through a full one',
        pv.hull === 0 && bv.hull === 0);

  /* The part that was never written down: what happens to the REST of a
   * shot that breaks through. The fraction of the shot the shield actually
   * absorbed is the fraction that was spent. */
  var brk = Combat.splitDamage(5, 20, pulse);
  check('a shot that breaks through spends only what the shield took',
        brk.shield === 5 && brk.hull > 0 && brk.hull < 24,
        JSON.stringify(brk));
  check('and it is a real breakthrough, flagged as one', brk.through === true);

  var thin = Combat.splitDamage(1, 20, beam);
  check('a beam wastes almost nothing on a nearly-dead shield',
        thin.shield === 1 && thin.hull > 12, JSON.stringify(thin));

  /* MEASURED, and this is the number the design has been waiting for: two
   * groups beat one gun. Strip with the beam, switch, open with the pulse. */
  function shotsToKill(plan) {
    var spec = { id: 'z' + plan, cls: 'navy' };
    Combat.npcHull(spec); Combat.npcShield(spec);
    var n = 0;
    while (spec.hullHp > 0 && n < 10000) {
      var v = plan === 'switch' ? (spec.shieldHp > 0 ? beam : pulse)
            : plan === 'beam' ? beam : pulse;
      var sp = Combat.splitDamage(spec.shieldHp, 20, v);
      spec.shieldHp -= sp.shield; spec.hullHp -= sp.hull;
      n++;
    }
    return n;
  }
  var sw = shotsToKill('switch'), bo = shotsToKill('beam'), po = shotsToKill('pulse');
  check('switching groups mid-fight beats either gun alone',
        sw < bo && sw < po, 'switch ' + sw + '  beam ' + bo + '  pulse ' + po);
  check('and beats them by enough to be worth the second hardpoint',
        sw <= po * 0.85, sw + ' vs ' + po);

  /* WHO CARRIES ONE. A working hull would rather have the four tonnes. */
  function capOf(cls) {
    var s = { cls: cls };
    Combat.npcShield(s);
    return s.shieldMax;
  }
  check('warships and money are shielded',
        capOf('navy') > capOf('merc') && capOf('merc') > capOf('police') &&
        capOf('police') > 0, [capOf('navy'), capOf('merc'), capOf('police')].join(' '));
  check('working hulls are not',
        capOf('freighter') === 0 && capOf('tanker') === 0 && capOf('hauler') === 0);
  check('a rescue tender is — unarmed, and built to survive somebody else\'s fight',
        capOf('tender') > 0, String(capOf('tender')));
  check('a pirate\'s is feeble rather than absent',
        capOf('pirate') > 0 && capOf('pirate') < capOf('police'),
        String(capOf('pirate')));
  check('and an unknown hull flies bare rather than throwing',
        capOf('something-new') === 0);

  /* SIZE. render.js is not loaded in this suite, so hullSize falls back to
   * 'm' — which is the case worth pinning here: a shuttle at medium and an
   * escape pod at any size carry nothing. The -l shuttle is checked in
   * render.test.js, where the model table actually exists. */
  check('hullSize falls back to m with no model library loaded',
        Combat.hullSize('shuttle') === 'm');
  check('a medium shuttle has nowhere to put a generator', capOf('shuttle') === 0);
  check('and an escape pod never does', capOf('escape_pod') === 0);

  /* Through damageNpc: the shield goes first, and the hull only after. */
  var G = makeG(true);
  var v = fakeVictim(G, { kind: 'pirate', cls: 'police', range: 5, faction: 'sf' });
  v.cls = 'police';
  delete v.hullHp; delete v.shieldMax;
  Combat.npcHull(v); Combat.npcShield(v);
  var hull0 = v.hullHp, shield0 = v.shieldHp;
  check('the victim starts shielded', shield0 > 0, String(shield0));
  Combat.damageNpc(G.sys, G, v, 10, G.t, HOOKS, pulse, { x: 1, y: 0, z: 0 });
  check('a hit drains the shield first', v.shieldHp < shield0 && v.hullHp === hull0,
        v.shieldHp + ' / ' + v.hullHp);

  /* Keep hitting it and the hull starts taking it. */
  for (var i = 0; i < 40; i++) {
    Combat.damageNpc(G.sys, G, v, 10, G.t, HOOKS, pulse, { x: 1, y: 0, z: 0 });
  }
  check('once the shield is gone the hull takes it', v.shieldHp <= 0 && v.hullHp < hull0);

  /* IMPACTS, which is what every effect reads. */
  var I = makeG(true);
  var iv = fakeVictim(I, { kind: 'pirate', cls: 'merc', range: 5, faction: 'if' });
  iv.cls = 'merc';
  delete iv.hullHp; delete iv.shieldMax;
  Combat.damageNpc(I.sys, I, iv, 5, I.t, HOOKS, pulse, { x: 100, y: 0, z: 0 });
  check('a hit is recorded for the renderer', !!iv.impacts && iv.impacts.length === 1);
  if (iv.impacts && iv.impacts.length) {
    var im = iv.impacts[0];
    check('as a unit direction toward whatever hit it',
          !!im.dir && Math.abs(Math.sqrt(im.dir.x * im.dir.x + im.dir.y * im.dir.y +
                                         im.dir.z * im.dir.z) - 1) < 1e-9,
          JSON.stringify(im.dir));
    check('and it says the shield took this one',
          im.soaked === true && im.through === false, JSON.stringify(im));
  }
  /* A missile has no variety and goes off ON the hull, so both extras are
   * optional and it must not throw for want of them. */
  var threw = null;
  try { Combat.damageNpc(I.sys, I, iv, 5, I.t, HOOKS); } catch (e) { threw = e; }
  check('a missile can still do damage without a direction or a delivery',
        !threw, threw && threw.message);
  check('and its impact simply has no direction',
        iv.impacts[iv.impacts.length - 1].dir === null);

  for (var k = 0; k < 20; k++) {
    Combat.damageNpc(I.sys, I, iv, 1, I.t, HOOKS, pulse, { x: 1, y: 1, z: 0 });
  }
  check('the impact list is capped rather than growing all fight',
        iv.impacts.length <= Combat.MAX_IMPACTS,
        iv.impacts.length + ' of ' + Combat.MAX_IMPACTS);

  /* REGEN, off the same two numbers the player's shield uses. */
  var R = makeG(true);
  var rv = fakeVictim(R, { kind: 'pirate', cls: 'navy', range: 5, faction: 'rf' });
  rv.cls = 'navy';
  delete rv.hullHp; delete rv.shieldMax;
  Combat.damageNpc(R.sys, R, rv, 30, R.t, HOOKS, pulse, { x: 1, y: 0, z: 0 });
  var dented = rv.shieldHp;
  check('the navy took it on the shield', dented < rv.shieldMax, String(dented));
  Combat.update(R.sys, R, R.t + 1, 1, HOOKS);
  check('and does not recover a point while it is still being shot at',
        rv.shieldHp === dented, String(rv.shieldHp));
  Combat.update(R.sys, R, R.t + Combat.MODULES.shield.regenDelay + 2, 1, HOOKS);
  check('but refills once things go quiet', rv.shieldHp > dented, String(rv.shieldHp));
  Combat.update(R.sys, R, R.t + 10000, 10000, HOOKS);
  check('and never past full', rv.shieldHp === rv.shieldMax,
        rv.shieldHp + ' / ' + rv.shieldMax);

  /* A ZERO-DAMAGE SHOT. damageAtRange takes a pion to nearly nothing at the
   * edge of its envelope, and the split used to divide zero by zero there —
   * a NaN into shieldHp is a ship that can never be hurt again. */
  var z = Combat.splitDamage(40, 0, pulse);
  check('a shot that delivers nothing divides nothing by nothing',
        z.shield === 0 && z.hull === 0 &&
        isFinite(z.shield) && isFinite(z.hull), JSON.stringify(z));
  var Z = makeG(true);
  var zv = fakeVictim(Z, { kind: 'pirate', cls: 'navy', range: 5, faction: 'zf' });
  zv.cls = 'navy';
  delete zv.hullHp; delete zv.shieldMax;
  Combat.npcHull(zv); Combat.npcShield(zv);
  var zs = zv.shieldHp, zh = zv.hullHp;
  Combat.damageNpc(Z.sys, Z, zv, 0, Z.t, HOOKS, pulse, { x: 1, y: 0, z: 0 });
  check('and leaves the ship exactly as it was, not NaN',
        zv.shieldHp === zs && zv.hullHp === zh,
        zv.shieldHp + ' / ' + zv.hullHp);
  check('with no flare recorded for a hit that did not happen',
        !zv.impacts || zv.impacts.length === 0);

  /* An unshielded hull must not have gained one by accident — the whole
   * point of the gate is that most of the sky is still soft. */
  var F = makeG(true);
  var fv = fakeVictim(F, { range: 5, faction: 'ff' });
  fv.cls = 'freighter';
  delete fv.hullHp; delete fv.shieldMax;
  var fh = Combat.npcHull(fv);
  Combat.damageNpc(F.sys, F, fv, 12, F.t, HOOKS, pulse, { x: 1, y: 0, z: 0 });
  check('a freighter still takes it straight on the plating',
        fv.shieldMax === 0 && fv.hullHp < fh, fv.hullHp + ' of ' + fh);
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
  /* A RESPAWNED SHIP IS A NEW SHIP, and the cargo scoop is the part of that
   * which had gone missing. It is issued in migrateFit, which only runs its
   * issuing branch when `fit` is EMPTY — and stripForRespawn wrote a
   * non-empty map, so the early return fired and no scoop was ever handed
   * out again.
   *
   * The symptom is not "no scoop", it is that PIRACY STOPS WORKING. Rob a
   * freighter and the canisters it dumps cannot be picked up; the refusal
   * speaks once every twelve seconds and is easy to miss entirely. You would
   * conclude the robbery mechanic was broken, not that you were missing a
   * 1,400 cr fitting you had never been told you lost. */
  check('a respawned ship still has its cargo scoop', Combat.hasScoop(G.ship));
  check('and the starter gun', G.ship.fit.hardpoint0 === 'phpulse');
  check('and nothing it had paid for', !G.ship.shield && !G.ship.turret,
        JSON.stringify(G.ship.fit));
})();

section('--- and the two ways to get a ship agree ---');
(function () {
  /* The starting fit is one list now. These two used to be assembled by
   * separate code with no reason to agree, which is how the scoop came to be
   * issued to new pilots and withheld from every pilot who had ever died. */
  var fresh = makeG().ship;
  var reborn = makeG().ship;
  reborn.credits = 60000;
  Combat.fitItem(reborn, 'shield');
  Combat.stripForRespawn(reborn);
  var a = Object.keys(fresh.fit).sort().map(function (k) { return k + '=' + fresh.fit[k]; });
  var b = Object.keys(reborn.fit).sort().map(function (k) { return k + '=' + reborn.fit[k]; });
  check('a new ship and a respawned one carry the same thing',
        a.join(',') === b.join(','), a.join(',') + '   vs   ' + b.join(','));
  check('and both of them can pick cargo up',
        Combat.hasScoop(fresh) && Combat.hasScoop(reborn));

  /* ---- and so does every hull that leaves a yard ----------------------
   * Astra's rule: the scoop is a saleable item, but it is STANDARD WITH
   * EVERY HULL. Those two facts are not in tension and the code has to
   * hold both — selling it has to stick, and the next hull has to arrive
   * with one anyway.
   *
   * buyHull only ever replanned the gear you already had onto the new
   * hull, so this was the same bug the respawn had, in a second place: a
   * pilot who had sold their scoop and then bought a ship got a ship with
   * no scoop, and found out the next time they shot a freighter. */
  var buyer = makeG();
  buyer.ship.credits = 400000;

  var sold = Combat.sellFitted ? Combat.sellFitted(buyer, scoopKeyOf(buyer.ship)) : null;
  check('the scoop can be sold', !!sold && !Combat.hasScoop(buyer.ship),
        sold ? 'still aboard' : 'sell refused');

  /* Selling STICKS across a load — migrateFit's early return is what makes
   * that true, and it is the reason the fix could not simply re-issue the
   * kit on every load. */
  Combat.migrateFit(buyer.ship);
  check('and selling it sticks rather than being undone on load',
        !Combat.hasScoop(buyer.ship));

  var bought = Combat.buyHull(buyer, 'kestrel');
  check('a hull can be bought', bought.ok, bought.why);
  check('and it arrives with a scoop fitted as standard',
        Combat.hasScoop(buyer.ship));
  check('and the yard is told to say so rather than leaving it to be found',
        !!bought.standard && bought.standard.indexOf('cargoscoop') >= 0,
        JSON.stringify(bought.standard));

  /* Not a second one for a pilot who kept theirs, and nothing displaced. */
  var keeper = makeG();
  keeper.ship.credits = 400000;
  var beforeN = Object.keys(keeper.ship.fit).length;
  var k2 = Combat.buyHull(keeper, 'kestrel');
  var scoops = Object.keys(keeper.ship.fit).filter(function (key) {
    return keeper.ship.fit[key] === 'cargoscoop';
  }).length;
  check('a pilot who kept theirs is not issued a second',
        k2.ok && scoops === 1 && (k2.standard || []).length === 0,
        scoops + ' scoops, standard=' + JSON.stringify(k2.standard));
  check('and nothing they owned was displaced to make room',
        Object.keys(keeper.ship.fit).length >= beforeN,
        beforeN + ' -> ' + Object.keys(keeper.ship.fit).length);

  function scoopKeyOf(ship) {
    var fit = ship.fit || {};
    for (var k in fit) if (fit[k] === 'cargoscoop') return k;
    return null;
  }
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
  /* TWO ROLLS NOW, NOT ONE, and pinning Math.random to a constant stopped
   * being enough the moment the bribe branch landed. The old test forced
   * 0.01 to guarantee the search — and that same 0.01 then sailed under the
   * bribe chance, so the inspector took a payoff, nothing was seized, and
   * the result carried no `fine` at all. Four checks failed and the code was
   * innocent.
   *
   * So: feed a SEQUENCE. Low first (the search happens), high second (this
   * inspector is not for sale). A test that pins a shared source of
   * randomness has to know how many times the code under it draws. */
  function rolls(seq) {
    var n = 0;
    return function () { return seq[Math.min(n++, seq.length - 1)]; };
  }
  Math.random = rolls([0.01, 0.99]);
  var r3 = Combat.resolveScan(G2, cop2, HOOKS);
  Math.random = realRandom;
  check('a dirty hold is caught', r3.searched === true && r3.contraband === true);
  check('and this one would not take a bribe', !r3.bribed, JSON.stringify(r3));
  check('the contraband is seized, the legal freight is not',
        !(G2.ship.cargo.narcotics > 0) && G2.ship.cargo.grain === 5);
  check('the fine matches the tonnage and the severity',
        r3.fine === Math.round(Combat.fineFor(10, 1)) &&
        G2.wanted.lawfac === r3.fine, String(r3.fine));
  check('and the faction likes you less for it', Missions.standing(G2, 'lawfac') < 20);

  /* The ladder itself: vice, then war, then naval materiel. Asserted as an
   * ORDER rather than three magic numbers, so retuning the multipliers is a
   * one-line change and this still guards the thing that matters. */
  check('arms are a worse crime than narcotics, and naval fuel worse again',
        Combat.fineFor(10, 1) < Combat.fineFor(10, 2) &&
        Combat.fineFor(10, 2) < Combat.fineFor(10, 3),
        [1, 2, 3].map(function (s) { return Combat.fineFor(10, s); }).join(' < '));
  check('and ten tonnes of naval fuel still costs less than dumping waste in a hold',
        Combat.fineFor(10, 3) < Combat.WASTE_FINE,
        Combat.fineFor(10, 3) + ' vs ' + Combat.WASTE_FINE);

  /* Military drive fuel is the case that forces "contraband depends on who
   * is asking": a legal commodity that is an offence only in the hold of
   * somebody the navy has not licensed. */
  var Gm = makeG();
  Gm.standing = { lawfac: 0 };
  check('naval fuel is contraband to a pilot with no standing',
        Combat.contrabandSeverity(Gm, 'milfuel', 'lawfac') === 3);
  Gm.standing.lawfac = Combat.MILFUEL_LICENCE_STANDING;
  check('and perfectly legal to one the navy has cleared',
        Combat.contrabandSeverity(Gm, 'milfuel', 'lawfac') === 0);
  check('narcotics are illegal to everybody, standing or not',
        Combat.contrabandSeverity(Gm, 'narcotics', 'lawfac') === 1 &&
        Combat.contrabandSeverity(Gm, 'arms', 'lawfac') === 2);
  check('and grain never is', Combat.contrabandSeverity(Gm, 'grain', 'lawfac') === 0);

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

  /* ---- THE PORT CALLS YOU -----------------------------------------------
   * Clearance was three keystrokes with the answer "yes" almost every time,
   * and forgetting it once cost a fine, a standing hit and a FUGITIVE flag
   * — which shut every door in the system, including the one an open
   * mission needed. So a port with room now hails an approaching ship.
   *
   * The half that matters is the SILENCE. A refusal must not be announced,
   * or a wanted pilot is nagged by every marker they drift past, and the
   * port going quiet becomes the signal that something is wrong. So these
   * check what was SAID as well as what was granted. */
  (function () {
    var heard;
    var LOUD = { say: function (m) { heard.push(m); }, sound: function () {} };

    var Ga = makeG();
    var pa = portIn(Ga);
    heard = [];
    var auto = Combat.autoClearance(Ga, pa, LOUD, { full: false });
    check('a port with room clears an approaching ship without being asked',
          !!auto && auto.granted && Combat.isCleared(Ga, pa));
    check('and it hails you rather than clearing you in silence',
          heard.length === 1 && /cleared in/i.test(heard[0]), heard.join(' | '));
    check('the grant is marked as the port\'s own, not an answer to a hail',
          auto.auto === true);

    /* Once cleared it stops talking. A port repeating itself twice a second
     * for the whole approach would bury every other message. */
    heard = [];
    check('a ship already cleared is not hailed again',
          Combat.autoClearance(Ga, pa, LOUD, { full: false }) === null);
    check('and nothing is said', heard.length === 0, heard.join(' | '));

    /* And it settles the arrival, which is the entire point: this is the
     * trap it exists to close. Checked last because arriving SPENDS the
     * clearance, and a spent clearance is an uncleared ship again. */
    check('so arriving costs nothing', Combat.arriveAtPort(Ga, pa, LOUD) === null);
    check('and the clearance is spent like any other',
          !Combat.isCleared(Ga, pa));

    var Gb = makeG();
    var pb = portIn(Gb);
    Gb.wanted = {}; Gb.wanted[pb.faction] = 5000;     // over WANTED_HUNT
    heard = [];
    check('a wanted pilot is not cleared on approach',
          Combat.autoClearance(Gb, pb, LOUD, { full: false }) === null &&
          !Combat.isCleared(Gb, pb));
    check('and the port does not say why unless hailed', heard.length === 0,
          heard.join(' | '));

    var Gc2 = makeG();
    var pc2 = portIn(Gc2);
    heard = [];
    check('a full port is not cleared on approach',
          Combat.autoClearance(Gc2, pc2, LOUD,
                               { full: true, capacity: 4, occupied: 4, waitFor: 120 }) === null &&
          !Combat.isCleared(Gc2, pc2));
    check('and says nothing about it either', heard.length === 0, heard.join(' | '));

    /* HAILING STILL WORKS, and it is now the way you find out WHY. The
     * refusal wording is the same one it always was, because it is the same
     * function underneath. */
    var asked = Combat.requestClearance(Gc2, pc2, LOUD,
                                        { full: true, capacity: 4, occupied: 4, waitFor: 120 });
    check('hailing a full port still explains itself',
          !asked.granted && asked.reason === 'full' && /berths occupied/i.test(asked.text),
          asked.text);

    /* A BERTH THE PORT PROMISED IS NOT A BERTH YOU STOLE.
     *
     * The two offences used to stack, and the stacking was the bug: the
     * port clears a ship on approach (it has room), the timetable fills
     * the last small berth during the flight in, and the arrival books a
     * queue jump against a pilot who did exactly as they were told —
     * plus, because arriving into a full port with clearance ALSO left
     * the clearance unspent in the old ordering, the uncleared citation
     * on top of it.
     *
     * A brand-new career found it. newGame grants clearance for the berth
     * it puts you in; on a seed whose home port happened to be busy at
     * t=0 the first line a player ever read was being logged for taking
     * someone's berth, printed over the line telling them which key
     * launches.
     *
     * Both halves are pinned, because only the pair says what the rule
     * is: cleared costs nothing, uncleared at the same full port still
     * books the jump. */
    var Ge = makeG();
    var pe = portIn(Ge);
    var FULL = { full: true, capacity: 6, occupied: 6, waitFor: 300 };
    Combat.requestClearance(Ge, pe, LOUD);              // granted: asked before the rush
    check('cleared before the rush', Combat.isCleared(Ge, pe));
    var arrE = Combat.arriveAtPort(Ge, pe, LOUD, FULL);
    check('arriving cleared into a port that filled up costs nothing',
          arrE === null, JSON.stringify(arrE));
    check('and no queue jump is on the record',
          !(Ge.queueJumps && Ge.queueJumps[pe.faction]),
          JSON.stringify(Ge.queueJumps));
    check('and the clearance was still spent on arriving',
          !Combat.isCleared(Ge, pe));

    var Gf = makeG();
    var pf = portIn(Gf);
    var arrF = Combat.arriveAtPort(Gf, pf, LOUD, FULL);
    check('but barging into a full port uncleared is still cutting the line',
          !!(arrF && arrF.queueJump), JSON.stringify(arrF));
    check('and is still an unannounced arrival on top of it',
          !!(arrF && arrF.fugitive));

    /* AND LAUNCH IS UNTOUCHED. Asking to leave is the half with a decision
     * in it; nothing here automates it. */
    var Gd = makeG();
    var pd = portIn(Gd);
    Combat.autoClearance(Gd, pd, LOUD, { full: false });
    check('being cleared IN does not clear you to launch',
          typeof Combat.requestLaunch === 'function' &&
          !(Gd.ship.launchCleared && Gd.ship.launchCleared[pd.id]));
  })();

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

/* ---- the control cabinet, and breaking into it ------------------------- */
console.log('\n--- hailing a ship that is not shooting at you ---');
(function () {
  /* Astra: "the ability to hail other ships to ask for directions,
   * assistance or to trade." The interesting one is directions, because
   * once the chart is something you assemble by flying, the other ships in
   * the system are the only people who have BEEN anywhere. */
  var G = makeG();
  G.galaxy = Galaxy.build('kawartha');
  G.here = G.galaxy.home;
  G.charted = {}; G.charted[G.here.id] = true;
  var heard = [];
  var LOUD = { say: function (m) { heard.push(m); }, sound: function () {} };

  /* A traffic contact, shaped as Sim.trafficState hands one over. */
  var dst = G.sys.ports.filter(function (p) { return !!p.market; })[0];
  function contact(opts) {
    opts = opts || {};
    return {
      name: opts.name || 'Redsail Wain', hostile: !!opts.hostile,
      pos: V.addScaled(G.ship.pos, { x: 1, y: 0, z: 0 }, opts.range === undefined ? 20 : opts.range),
      route: opts.route || { id: 'r-test' },
      to: opts.to === undefined ? dst : opts.to,
      manifest: opts.manifest || [{ cid: 'ores', qty: 40 }]
    };
  }

  /* ---- directions, which are also a free sheet ---- */
  var c = contact();
  var before = Object.keys(G.charted).length;
  Combat.hailShip(G, G.sys, 0, c, 'directions', LOUD);
  check('a passing ship answers', heard.length > 0, heard[0]);
  check('and charts a system you had not been to',
        Object.keys(G.charted).length === before + 1,
        before + ' -> ' + Object.keys(G.charted).length);
  /* ONCE. A ship knows what it knows; asking twice does not make it know
   * more, and without this the nearest freighter is an infinite chart. */
  heard = [];
  Combat.hailShip(G, G.sys, 0, c, 'directions', LOUD);
  check('but only once — a ship knows what it knows',
        Object.keys(G.charted).length === before + 1);
  check('and says so rather than repeating itself',
        /everything I know/.test(heard.join(' ')), heard.join(' | '));

  /* ---- range, which is the transmitter rather than the radar ---- */
  heard = [];
  var far = contact({ range: Combat.HAIL_RANGE_KM + 50 });
  Combat.hailShip(G, G.sys, 0, far, 'directions', LOUD);
  check('a ship out of transmitter range cannot be asked anything',
        /range/i.test(heard.join(' ')), heard.join(' | '));

  /* ---- and a hostile answers nothing ---- */
  heard = [];
  Combat.hailShip(G, G.sys, 0, contact({ hostile: true }), 'directions', LOUD);
  check('somebody shooting at you does not give directions',
        /does not answer/.test(heard.join(' ')), heard.join(' | '));

  /* ---- buying off a hull that is not a shop ---- */
  var G2 = makeG();
  G2.galaxy = G.galaxy; G2.here = G.here; G2.charted = { s0: true };
  G2.ship.credits = 20000;
  var c2 = contact();
  var quote = Combat.hailTrade(G2, c2);
  check('a loaded ship has something to sell', !!(quote && quote.buy), JSON.stringify(quote));
  var cash0 = G2.ship.credits;
  var res = Combat.hailShip(G2, G2.sys, 0, c2, 'buy', LOUD);
  check('and it arrives in your hold', !!res && G2.ship.cargo[res.bought] === res.qty,
        JSON.stringify(res));
  check('paid for at the quoted price',
        !!res && cash0 - G2.ship.credits === res.cost,
        cash0 + ' -> ' + G2.ship.credits);
  /* AND IT LEAVES THEIRS. Otherwise the same freighter is an infinite
   * warehouse, which is the trade version of the infinite chart above. */
  check('and it leaves their hold', c2.manifest[0].qty === 40 - res.qty,
        String(c2.manifest[0].qty));

  /* ---- assistance, which is gated on actually being in trouble ---- */
  var G3 = makeG();
  G3.ship.credits = 20000;
  G3.ship.fuel = G3.ship.fuelCap;
  check('a ship with a full tank is told to fly on',
        Combat.hailAssist(G3, contact()) === null);
  G3.ship.fuel = G3.ship.fuelCap * 0.1;
  var aid = Combat.hailAssist(G3, contact());
  check('a nearly dry one gets an offer', !!aid && aid.tonnes > 0 && aid.cost > 0,
        JSON.stringify(aid));
  heard = [];
  var fuel0 = G3.ship.fuel, cred0 = G3.ship.credits;
  Combat.hailShip(G3, G3.sys, 0, contact(), 'assist', LOUD);
  check('and the fuel actually arrives', G3.ship.fuel > fuel0,
        fuel0.toFixed(2) + ' -> ' + G3.ship.fuel.toFixed(2));
  check('and it is not free', G3.ship.credits < cred0,
        cred0 + ' -> ' + G3.ship.credits);
  /* A RESCUE COSTS MORE THAN A PUMP. Out in the black is exactly where a
   * price should hurt, or the stranding the fuel model creates is not a
   * failure state at all. */
  check('and it costs more than a port would charge',
        aid.each > Eco.BY_ID.hydrogen.base * 1.5,
        aid.each + ' cr/t against a base of ' + Eco.BY_ID.hydrogen.base);
  check('but never more fuel than the tank can hold',
        G3.ship.fuel <= G3.ship.fuelCap + 1e-9,
        G3.ship.fuel.toFixed(2) + ' / ' + G3.ship.fuelCap);
})();

console.log('\n--- the control cabinet ---');
(function () {
  var G = makeG();
  var port = (G.sys.ports || []).filter(function (p) { return p.surface; })[0];
  check('a ground port exists to break into', !!port);
  if (!port) return;
  if (!port.faction) port.faction = 'testfac';

  var c = Gen.controlFor(port, G.sys);
  check('it has a control cabinet', !!c && !!c.security);

  /* DERIVED, NOT ROLLED. The difficulty is part of the world: it must be the
   * same lock when you come back to it, or the player cannot learn that a
   * core world is hard and a backwater is not. Read twice through a fresh
   * generation of the same system, not twice off the same object, since a
   * memo would make the second read trivially equal. */
  var sysAgain = Gen.generateSystem('kawartha');   // the seed makeG() uses
  var again = (sysAgain.ports || []).filter(function (p) {
    return p.id === port.id;
  })[0];
  check('the same port regenerates', !!again, again && again.name);
  if (again) {
    var c2 = Gen.controlFor(again, sysAgain);
    check('and its lock is the same lock — difficulty is derived',
          Math.abs(c2.security.hackDifficulty - c.security.hackDifficulty) < 1e-12,
          c.security.hackDifficulty.toFixed(6) + ' vs ' +
          c2.security.hackDifficulty.toFixed(6));
    check('and it stands in the same place',
          c2.at.x === c.at.x && c2.at.y === c.at.y);
  }
  check('the difficulty is never certain at either end',
        c.security.hackDifficulty >= 0.15 && c.security.hackDifficulty <= 0.95,
        String(c.security.hackDifficulty));

  /* An orbital clamp has no rock to stand a cabinet on. Null, so the caller
   * can say why rather than silently offering an option that does nothing. */
  var orb = (G.sys.ports || []).filter(function (p) { return !p.surface; })[0];
  if (orb) {
    check('an orbital dock has no cabinet', Gen.controlFor(orb, G.sys) === null);
    var rOrb = Combat.hackControl(makeG(), orb, HOOKS, 0);
    check('and refuses with a reason rather than throwing',
          rOrb.ok === false && rOrb.reason === 'nothing', rOrb.reason);
  }

  /* THE REFUSALS, each with its own reason. */
  var Gc = makeG();
  Combat.requestClearance(Gc, port, HOOKS);
  var rCleared = Combat.hackControl(Gc, port, HOOKS, 0);
  check('breaking into a door already open for you is refused',
        rCleared.ok === false && rCleared.reason === 'cleared', rCleared.reason);

  var Gf = makeG();
  Gf.ship.pos = { x: 9e9, y: 0, z: 0 };          // nowhere near it
  var rFar = Combat.hackControl(Gf, port, HOOKS, 0);
  check('out of range is refused, and says so',
        rFar.ok === false && rFar.reason === 'range', rFar.reason);

  /* THE BREACH ITSELF opens the doors — the same doors a clearance opens,
   * which is the whole integration. Forced rather than rolled: the roll is
   * deliberately unrepeatable, so a test that rolled would be flaky. */
  var Gb = makeG();
  check('the doors start shut', !Combat.doorsOpen(Gb, port));
  Gb.ship.breached = {};
  Gb.ship.breached[port.id] = true;
  check('a breach opens them', Combat.doorsOpen(Gb, port));
  check('and reads as breached here', Combat.breachedHere(Gb, port));

  /* ...but it is NOT a launch clearance. The model says the two are
   * separate and both are spent where they are used; a breach that let you
   * out as well would make the way out a non-event. */
  check('a breach is not a launch clearance',
        !Combat.launchCleared(Gb, port));
  /* Nor is it docking clearance: arriving on a forced door is still
   * arriving unannounced, and should still be booked as such. */
  check('nor is it docking clearance', !Combat.isCleared(Gb, port));

  /* Local to the system, like every other permission. */
  Combat.clearAllClearances(Gb);
  check('and it does not survive the jump', !Combat.breachedHere(Gb, port) &&
        !Combat.doorsOpen(Gb, port));

  /* A FAILED ATTEMPT IS LOUD. Forced by making it impossible to succeed:
   * difficulty 1e9 against any rating drives the odds to the 0.02 floor,
   * so this is not certain — run it until it fails, which it will at once.
   * The assertion is about what a failure DOES, not that one happened. */
  /* STAND BESIDE THE CABINET. makeG() parks the ship in a circular orbit,
   * which is nowhere near a cabinet bolted to a planet — the first version
   * of these two tests got 'range' two hundred times and reported that a
   * hopeless lock never fails. Placed through Sim.controlState so the test
   * asks the game where the thing is rather than guessing. */
  /* `at` is not optional. The cabinet is bolted to a rotating planet, so
   * "beside it" is only true at one instant — placing the ship at t=0 and
   * then hacking at t=100 put it back out of range, which is the same trap
   * the arrival-rail test fell into comparing two poses eighteen seconds
   * apart. Position and attempt must share a clock. */
  function standAtCabinet(g, p, at) {
    var cs = Sim.controlState(p, g.sys, at);
    if (cs) g.ship.pos = { x: cs.pos.x, y: cs.pos.y, z: cs.pos.z };
    return !!cs;
  }

  var Ga = makeG();
  var pa = (Ga.sys.ports || []).filter(function (p) { return p.surface; })[0];
  pa.faction = 'testfac';
  check('the ship can be put beside the cabinet', standAtCabinet(Ga, pa, 0));
  check('and is then in range', Sim.controlInRange(Ga.ship, pa, Ga.sys, 0));
  Gen.controlFor(pa, Ga.sys).security.hackDifficulty = 1e9;
  var owed0 = (Ga.wanted || {}).testfac || 0;
  var tries = 0, failed = null;
  while (tries++ < 200) {
    Ga.ship.hackAfter = 0;                       // ignore the panel cooldown
    /* AND FORGET ANY BREACH, which is what made this check flaky about one
     * run in fifty. `odds` is floored — Math.max(0.02, tool/(tool+diff)) —
     * so even a difficulty of 1e9 opens the door 2% of the time, and that
     * floor is deliberate: a lock nobody can ever pick is not a mechanic.
     * But once a try SUCCEEDS the port is breached, and every subsequent
     * call short-circuits to reason 'already' rather than rolling again —
     * so a lucky first attempt meant the loop ran all 200 times and never
     * saw the 'failed' it was waiting for.
     *
     * Clearing the breach each time makes every iteration an independent
     * roll, which is what "does a hopeless lock ever fail" was always
     * asking. 200 independent tries at 98% is as close to certain as this
     * suite gets. */
    if (Ga.ship.breached) Ga.ship.breached = {};
    var r = Combat.hackControl(Ga, pa, HOOKS, 0);
    if (!r.ok && r.reason === 'failed') { failed = r; break; }
  }
  check('a hopeless lock does fail', !!failed, tries + ' tries');
  if (failed) {
    check('and it trips the alarm', failed.alarm === true);
    check('booking a bounty with the cabinet OWNER',
          ((Ga.wanted || {}).testfac || 0) > owed0,
          owed0 + ' -> ' + ((Ga.wanted || {}).testfac || 0));
    check('which the same port then refuses to open for',
          Combat.dockRefused(Ga, pa) || !Combat.doorsOpen(Ga, pa));
  }

  /* The panel locks you out for a while, so this is not a button you hold. */
  var Gk = makeG();
  var pk = (Gk.sys.ports || []).filter(function (p) { return p.surface; })[0];
  standAtCabinet(Gk, pk, 100);          // same clock as the attempt below
  Gk.ship.hackAfter = 500;
  var rCool = Combat.hackControl(Gk, pk, HOOKS, 100);
  check('a locked panel refuses until it reopens',
        rCool.ok === false && rCool.reason === 'cooldown', rCool.reason);
  /* And out of range beats the cooldown, because it is the more actionable
   * of the two things wrong: "go there" is advice, "wait" is not, when you
   * would have had to go there anyway. */
  Gk.ship.pos = { x: 9e9, y: 0, z: 0 };
  check('but out of range is the answer when both are true',
        Combat.hackControl(Gk, pk, HOOKS, 100).reason === 'range');

  /* The bare rating, and the honest fact that no module beats it yet. */
  check('a bare attempt is worth the documented figure',
        Combat.breakerRating(makeG().ship) === Combat.HACK_SKILL,
        String(Combat.breakerRating(makeG().ship)));
})();

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
