/* combat.js — hulls, weapons, damage, and the law's opinion of you.
 *
 * The design brief is FE2 crossed with Battlecruiser: fixed guns you aim
 * with the nose, an auto-turret you buy and forget, homing missiles, and a
 * legal system that only knows what somebody actually told it.
 *
 * Two principles hold everything together:
 *
 *   EVERYTHING THAT FLIES CAN DIE. NPCs get hull points the first time
 *   anything hits them; the player has them from the start. A killed NPC
 *   stops existing on its rail — permanently, this system remembers — and
 *   drops its manifest as the same canisters the jettison system already
 *   knows how to make and scoop.
 *
 *   CRIME IS WITNESSED, NOT OMNISCIENT. Demanding cargo or opening fire is
 *   only a bounty if somebody reports it: either a third party close enough
 *   to hear the victim's distress call at the scene, or the victim itself,
 *   which starts transmitting a few seconds after the attack begins. Kill
 *   it before the call goes out, with nobody else in range, and the law
 *   never hears. This is not a loophole; it is the design.
 */
(function (global) {
  'use strict';

  var V = global.V;
  /* Needed for hashString, which is how a pirate's hold and purse are
   * derived from its registration rather than rolled. Under node the
   * globals are assembled by the test harness in load order; the require
   * fallback is what lets combat.js be pulled in on its own. */
  var RNG = global.RNG || (typeof require !== 'undefined' ? require('./rng.js') : null);
  /* Needed for the two slipspace modules, which are catalogue entries here
   * and design — price, wake factor, resist factor — over there. Same
   * fallback and the same reason: this file has to be loadable alone, and a
   * dependency that only holds because galaxy.js happens to pull slipspace
   * in first is a dependency waiting to break. */
  var Slip = global.Slipspace ||
             (typeof require !== 'undefined' ? require('./slipspace.js') : null);

  /* ---- catalogues -------------------------------------------------------
   * Prices in credits. Ranges in km, damage in hull points, cooldowns in
   * seconds. Standoffs in the encounter code are 18-45 km, so gun ranges
   * sit just inside them: a pirate holding station on you is holding
   * station inside your beam's reach, which is the tension the standoff
   * distance was always waiting to have. */
  /* ---- lasers -----------------------------------------------------------
   * Three classes by emitter size, rated in MEGAWATTS DRAWN, and three
   * varieties by how the energy is delivered. The megawatt figure is not
   * decoration: it is checked against the hull's reactor (see HULLS below),
   * and it is what stops a Talon carrying a capital-grade gun.
   *
   * THE VARIETIES ARE NOT A LADDER. They differ in delivery, and the shield
   * comment further down already tells us why that matters — the energy
   * shield is a BUCKET, so it soaks an instantaneous load and fails against
   * one that never stops arriving:
   *
   *   pulse         discrete bolts     x0.6 vs shield, x1.2 vs hull
   *   intermittent  burst              x1.0 / x1.0
   *   beam          continuous         x1.5 vs shield, x0.7 vs hull
   *
   * So the loadout decision is real, and it is exactly what fire groups are
   * for: carry a beam to strip the shield and a pulse to open the hull.
   *
   * `heat` is units/second put into your OWN hull while firing. Read it
   * against sim.js: BASE_HEAT_SHED is 18/s bare, HEAT_LIMIT is 100. A C1
   * beam (12) is free forever; a C2 beam (26) gives about twelve seconds of
   * trigger; a C3 beam (45) gives under four. The ablative heat shield
   * sheds 130/s and covers all of them — which is how a re-entry module
   * becomes combat gear. */
  var LASER_DELIVERY = {
    pulse:        { vsShield: 0.6, vsHull: 1.2 },
    intermittent: { vsShield: 1.0, vsHull: 1.0 },
    beam:         { vsShield: 1.5, vsHull: 0.7 }
  };

  /* ---- what a beam is made of --------------------------------------------
   * The TIER is the particle, and the particle decides how damage behaves
   * with distance. This is the one place in the catalogue where a real
   * physical property hands over the balance number instead of taste.
   *
   *   photon     massless, does not decay. No falloff at all, and the
   *              longest reach — paid for in damage, not in range.
   *   pion/kaon  charged pion lifetime ~26 ns, kaon ~12 ns: 100-200x
   *              shorter-lived than a muon at the same accelerator gamma,
   *              so the beam loses coherence fast. Brutal up close,
   *              worthless at distance. The brawler's gun.
   *   muon       ~2.2 microseconds, long enough that time dilation carries
   *              it across a real gap. The only tier that holds its damage
   *              out to range, and the only one needing an accelerator big
   *              enough to justify what it costs.
   *
   * `falloff` is how much of the damage is lost at maximum range:
   * 0 keeps all of it, 0.85 keeps a seventh. See damageAtRange. */
  var PARTICLE = {
    photon: { falloff: 0.00, label: 'photon' },
    pion:   { falloff: 0.85, label: 'pion' },
    muon:   { falloff: 0.25, label: 'muon' }
  };

  function laser(id, name, particle, variety, price, power, mass, dmg, cooldown,
                 range, heat, color, avail, pitch) {
    var d = LASER_DELIVERY[variety];
    var p = PARTICLE[particle];
    return { id: id, name: name, slot: 'hardpoint', kind: 'gun',
             particle: particle, variety: variety, falloff: p.falloff,
             price: price, power: power, mass: mass,
             dmg: dmg, cooldown: cooldown, range: range, heat: heat,
             vsShield: d.vsShield, vsHull: d.vsHull, color: color,
             minDev: avail[0], minStanding: avail[1],
             minCrime: avail[2] || 0, grey: !!avail[3],
             pitch: pitch };
  }

  /* Damage actually delivered at a distance. Range stays a hard maximum —
   * past it the beam is not worth drawing — but inside it the particle
   * decides the curve. The 1.5 exponent keeps a pion respectable through
   * the first third of its reach and then drops it off a cliff, which is
   * what "close-quarters weapon" should mean in the hands rather than on
   * paper. */
  function damageAtRange(gun, dist) {
    if (!gun) return 0;
    if (dist > gun.range) return 0;
    var f = gun.falloff || 0;
    if (!f) return gun.dmg;
    var x = Math.max(0, Math.min(1, dist / gun.range));
    return gun.dmg * (1 - f * Math.pow(x, 1.5));
  }

  /* The `pitch` on every item is the yard's own copy — what a salesman
   * standing in a cold hangar would actually say about the thing. It is
   * not a stat line; the stat line is right next to it. Where a pitch is
   * unflattering that is deliberate: a catalogue where every entry is
   * enthusiastic is a catalogue nobody reads twice. */
  var GUNS = {
    /* PHOTON — the universal baseline. No falloff, longest reach, least
     * damage per shot. Anyone will sell you one. */
    phpulse: laser('phpulse', 'Photon pulse laser', 'photon', 'pulse',
                   900, 1.8, 1.5, 5, 0.40, 22, 2, '#ff6b5a', [0, -100],
                   'Every hull leaves the yard with one. There is a reason.'),
    phint:   laser('phint', 'Photon intermittent laser', 'photon', 'intermittent',
                   1700, 2.4, 2.0, 13, 1.00, 26, 4, '#ff8f4a', [0, -100],
                   'Hits harder, waits longer. Patience in a housing.'),
    phbeam:  laser('phbeam', 'Photon beam laser', 'photon', 'beam',
                   3100, 3.0, 2.5, 2, 0.12, 30, 12, '#ff3b8a', [0, -100],
                   'Reaches as far as you can aim it. Light does not get tired.'),

    /* PION — the brawler. Enormous close, nearly nothing at its own
     * maximum range. Wants a developed port and a civil word for you. */
    pipulse: laser('pipulse', 'Pion pulse accelerator', 'pion', 'pulse',
                   3400, 4.2, 3.5, 20, 0.40, 11, 5, '#c86bff', [0.45, 0],
                   'Devastating in a knife fight. Bring a knife.'),
    piint:   laser('piint', 'Pion intermittent accelerator', 'pion', 'intermittent',
                   6200, 5.2, 4.0, 52, 1.00, 13, 9, '#a86bff', [0.45, 0],
                   'Fifty-two points, if you are close enough to regret it.'),
    pibeam:  laser('pibeam', 'Kaon beam accelerator', 'pion', 'beam',
                   9800, 6.5, 5.0, 8, 0.12, 15, 26, '#8a5aff', [0.45, 0],
                   'Strips a shield like old paint. You will have to get close.'),

    /* MUON — the only tier that keeps its damage at distance. Reachable,
     * eventually, and priced like an argument you have already won. */
    mupulse: laser('mupulse', 'Muon pulse accelerator', 'muon', 'pulse',
                   14000, 9.0, 7.0, 24, 0.40, 34, 11, '#6bd5ff', [0.70, 10],
                   'Reach without apology. Bring a reactor and a firm opinion.'),
    muint:   laser('muint', 'Muon intermittent accelerator', 'muon', 'intermittent',
                   24000, 11.0, 8.0, 62, 1.00, 40, 18, '#5ab8ff', [0.70, 25],
                   'Sixty-two points, once a second, from further than they can answer.'),
    mubeam:  laser('mubeam', 'Muon beam accelerator', 'muon', 'beam',
                   38000, 13.0, 9.0, 9, 0.16, 46, 45, '#4a9bff', [0.80, 40],
                   'If it is still there after four seconds, check your aim — not the gun.')
  };

  /* Every id this game has ever shipped, kept alive as an alias so old
   * saves, old tests and every `s.gun === 'pulse'` in the codebase keep
   * meaning something. Aliases point AT the new objects rather than
   * copying them, so there is exactly one set of numbers per weapon.
   *
   * The mapping is by ROLE, not by name: the old Class 1/2/3 ladder was
   * emitter power, and power is still what the new tiers cost, so a
   * Class 2 owner wakes up holding the pion of the same delivery. */
  var LEGACY_GUN = {
    pulse: 'phpulse', beam: 'piint',
    c1pulse: 'phpulse', c1int: 'phint', c1beam: 'phbeam',
    c2pulse: 'pipulse', c2int: 'piint', c2beam: 'pibeam',
    c3pulse: 'mupulse', c3int: 'muint', c3beam: 'mubeam'
  };
  for (var _lg in LEGACY_GUN) GUNS[_lg] = GUNS[LEGACY_GUN[_lg]];

  /* The turret moved to a UTILITY slot. It is not a gun you aim — the file
   * header calls the hardpoints "fixed guns you aim with the nose", and
   * buyable disinterest is not that. */
  var TURRETS = {
    turret: { id: 'turret', name: 'Auto-turret', slot: 'utility', kind: 'turret',
              price: 5600, power: 2.6, mass: 3, unique: true,
              dmg: 4, range: 9, cooldown: 0.7, heat: 3, color: '#ffd36b',
              minDev: 0.40, minStanding: 0, minCrime: 0, grey: false,
              pitch: 'Buyable disinterest. Point the ship anywhere you like.' }
  };

  /* Two shields, and they are not interchangeable — buying the wrong one
   * for the job is a real mistake the outfitter will happily let you make.
   *
   * The energy shield is a BUCKET: forty points of capacity refilled at a
   * little over one a second. It shrugs off a laser hit, which delivers its
   * whole load in an instant, and it is useless in an atmosphere, where the
   * load never stops arriving.
   *
   * The heat shield is a PIPE: no capacity whatsoever, but it moves 130
   * units of heat a second out of the hull for as long as you need it to.
   * It does nothing at all about being shot. See Sim.updateHeating. */
  var MODULES = {
    /* `unique` because a second one does nothing. The regen tick reads one
     * shield, so stacking them would burn 2 MW and four tonnes for no
     * effect — a purchase that silently does nothing is the worst thing a
     * shop can sell you, and the fit check is the right place to say no. */
    shield: { id: 'shield', name: 'Shield generator', slot: 'internal',
              kind: 'shield', price: 4800, power: 2.0, mass: 4, unique: true,
              cap: 40, regen: 1.2, regenDelay: 6,
              minDev: 0.50, minStanding: 0, minCrime: 0, grey: false,
              pitch: 'Forty points of somebody else’s problem. Refills itself if you let it.' },
    /* Four jobs now, and each one was arrived at separately: re-entry,
     * sustained beam fire, fuel scooping, and keeping unstable ordnance
     * from cooking off.
     *
     * FOUR IS PROBABLY TOO MANY, and it was tempting to read that as the
     * systems agreeing with each other. The truer reading is that a module
     * which is correct in every build is not an upgrade, it is a tax, and
     * the slot it occupies has stopped being a slot.
     *
     * The plan's "heat shield has too many jobs" section carries the fix:
     * cap the throughput so this covers a hard entry OR a heavy beam and
     * not both at once, and make something described as ABLATIVE actually
     * ablate. Radiation, when it arrives, does not belong here at all — it
     * acts on crew and electronics rather than on hull temperature, and
     * wants shielding mass rather than a radiator. */
    heatshield: { id: 'heatshield', name: 'Ablative heat shield', slot: 'internal',
                  kind: 'heatshield', price: 3600, power: 0.8, mass: 3,
                  unique: true, shed: 130,
                  minDev: 0.35, minStanding: -100, minCrime: 0, grey: false,
                  pitch: 'Rated for atmospheric entry. Increasingly popular with beam crews.' },

    /* ---- heat sinks -----------------------------------------------------
     * A rack, not a slot each: individually-slotted consumables would eat
     * the whole utility budget and turn the decision into "sinks or a
     * scoop" rather than "how many sinks".
     *
     * A live sink banks SINK_BANK units of already-stored heat on the spot,
     * then takes SINK_FRACTION of everything generated until its capacity
     * fills or its timer runs out. The fraction is the design: at 100% the
     * heat clock stops and this is a panic button you mash when the warning
     * light comes on; at 65% the clock merely slows, so a sink EXTENDS a
     * window rather than suspending one, and firing one off while already
     * cooking will not save you. It is a thing you spend before the
     * shooting starts. */
    sinklauncher: { id: 'sinklauncher', name: 'Heat sink launcher', slot: 'utility',
                    kind: 'sinkrack', price: 4800, power: 1.2, mass: 2,
                    unique: true, rack: 3,
                    minDev: 0.55, minStanding: 0, minCrime: 0, grey: false,
                    pitch: 'Three chances to fire for longer than your hull agrees with.' },

    /* ---- scanners ---------------------------------------------------------
     * Two tiers of one question — how much fight is left in that ship — and
     * what separates them is PRECISION, not access.
     *
     * The cheap one gives you a bar. That is enough to answer "is this one
     * nearly dead", which is the question you have mid-fight, and it is not
     * enough to answer "can I break it before its escort arrives", which is
     * the question you have before you start one. So the expensive one buys
     * PLANNING rather than sight, and a pilot who never upgrades is not shut
     * out of anything — they are reading a gauge instead of a figure, which
     * is how most instruments in this cockpit already work.
     *
     * Both are `uniqueGroup: 'scanner'` because they answer the same
     * question: carrying both is two utility slots spent to learn one thing,
     * and the fit check should say so rather than take the money. */
    hullscan: { id: 'hullscan', name: 'Hull scanner', slot: 'utility',
                kind: 'scanner', scan: 1, price: 2200, power: 0.6, mass: 1,
                uniqueGroup: 'scanner',
                minDev: 0.30, minStanding: -100, minCrime: 0, grey: false,
                pitch: 'Tells you how badly they are hurt. Not how much they can take.' },
    combatscan: { id: 'combatscan', name: 'Combat scanner', slot: 'utility',
                  kind: 'scanner', scan: 2, price: 9500, power: 1.8, mass: 2,
                  uniqueGroup: 'scanner',
                  minDev: 0.60, minStanding: 0, minCrime: 0, grey: false,
                  pitch: 'Hull and shields, in numbers. Knowing is most of winning.' },

    /* ---- reactors -------------------------------------------------------
     * The answer to "my hull will not run this gun", and the module that
     * finally makes the MASS budget matter. Until these existed, power was
     * the binding constraint in every single build and fitMass was close to
     * decorative; a reactor buys megawatts with tonnes and an internal
     * slot, which is precisely the trade that turns two budgets into one
     * decision.
     *
     * One reactor, of any tier — `uniqueGroup` rather than `unique`,
     * because the tiers are three items and stacking a Mk I under a Mk III
     * is not a build, it is an accounting error. */
    reactor1: { id: 'reactor1', name: 'Auxiliary reactor Mk I', slot: 'internal',
                kind: 'reactor', price: 6000, power: 0, mass: 5,
                powerBonus: 2.5, uniqueGroup: 'reactor',
                minDev: 0.45, minStanding: 0, minCrime: 0, grey: false,
                pitch: 'Two and a half more megawatts. Five tonnes. Your call.' },
    reactor2: { id: 'reactor2', name: 'Auxiliary reactor Mk II', slot: 'internal',
                kind: 'reactor', price: 18000, power: 0, mass: 9,
                powerBonus: 5.0, uniqueGroup: 'reactor',
                minDev: 0.65, minStanding: 10, minCrime: 0, grey: false,
                pitch: 'The upgrade most pilots make twice: once too late, once correctly.' },
    reactor3: { id: 'reactor3', name: 'Auxiliary reactor Mk III', slot: 'internal',
                kind: 'reactor', price: 46000, power: 0, mass: 14,
                powerBonus: 9.0, uniqueGroup: 'reactor',
                minDev: 0.80, minStanding: 25, minCrime: 0, grey: false,
                pitch: 'Fourteen tonnes of yes. Check your fit tonnage before you sign.' }
  };

  var MISSILES = {
    hawk: { id: 'hawk', name: 'Hawk seeker', price: 420, rack: 8,
            dmg: 42, accel: 0.09, life: 60, fuse: 0.09, speed0: 0.15,
            pitch: 'Fire and forget. Mostly forget.' }
  };

  /* Heat sink charges — a consumable, not a fitting, so they live on a
   * counter the way seekers do rather than in a slot. */
  var SINK = {
    price: 320,
    bank: 60,          // stored heat pulled out of the hull on activation
    fraction: 0.65,    // share of GENERATED heat taken while live
    capacity: 220,     // units, total, before it ejects itself
    duration: 6,       // seconds
    cooldown: 8,       // seconds before another can be armed
    pitch: 'Ablative mass, one use. Comes back out glowing and stays that way.'
  };

  /* Hulls for sale. Every one satisfies the liftoff rule that sized the
   * surface ports: thrust over fully-laden mass, with the 1.15 margin,
   * clears the strongest gravity any port was built on — so no purchase can
   * strand you on a pad you could land on. The Talon is the ship the game
   * starts you in, priced so the trade-in maths has a base. */
  var HULLS = {
    talon: { id: 'talon', name: 'Talon Courier', price: 32000, mesh: 'courier',
             dryMass: 42, thrustKN: 1800, thrusterCap: 12, fuelCap: 28,
             cargoCap: 64, hullMax: 100,
             slots: { hardpoint: 2, utility: 2, internal: 3 },
             powerMW: 9.0, fitMass: 14,
             blurb: 'the ship you started with, and honestly not bad' },
    dart:  { id: 'dart', name: 'Dart Interceptor', price: 61000, mesh: 'police',
             dryMass: 30, thrustKN: 2200, thrusterCap: 10, fuelCap: 20,
             cargoCap: 22, hullMax: 80,
             /* THE RULE, checked by the hull-budget test: a reactor must
              * run every core system the hull has room for AND still
              * light the cheapest gun. Only shuttles fly unarmed.
              *
              * Audited rather than assumed, and the audit was a surprise:
              * the Dart looked like the hull that would fail, because
              * shield + heat shield + turret is 5.4 MW of its 7.0 and the
              * cheapest gun needs 1.8. It never fails, because it cannot
              * carry all three anyway — those three weigh 10 t against a
              * 9 t budget, so MASS BINDS BEFORE POWER on this hull and
              * the lockout is unreachable. 7.0 stands. The test is the
              * point: the rule is now enforced rather than believed. */
             slots: { hardpoint: 2, utility: 1, internal: 2 },
             powerMW: 7.0, fitMass: 9,
             blurb: 'outruns everything; carries nothing' },
    kestrel: { id: 'kestrel', name: 'Kestrel Multirole', price: 120000, mesh: 'merc',
             dryMass: 60, thrustKN: 2700, thrusterCap: 14, fuelCap: 34,
             cargoCap: 96, hullMax: 130,
             slots: { hardpoint: 3, utility: 2, internal: 4 },
             powerMW: 14.0, fitMass: 22,
             blurb: 'the compromise, made well' },
    mule:  { id: 'mule', name: 'Mule Freighter', price: 78000, mesh: 'freighter',
             dryMass: 80, thrustKN: 3700, thrusterCap: 16, fuelCap: 36,
             cargoCap: 160, hullMax: 160,
             slots: { hardpoint: 2, utility: 3, internal: 5 },
             powerMW: 18.0, fitMass: 30,
             blurb: 'slow, vast, and worth robbing' }
  };

  /* ---- slots, power and mass --------------------------------------------
   * Reactor output and fit tonnage scale off dryMass, so the numbers have a
   * reason rather than a taste. The Mule has the biggest reactor and the
   * fewest guns for its size, which is the right shape for the ship this
   * file already calls "worth robbing".
   *
   * What the budget buys, in one worked example: a Kestrel puts out 14 MW.
   * A Class 3 beam draws 13. Fit one and there is a single megawatt left,
   * which will not run a shield generator. That glass cannon is not a rule
   * anybody wrote down — it falls out of the arithmetic, which is the whole
   * argument for having a budget at all.
   *
   * ONE CATALOGUE, keyed by id, so a slot only ever stores a string. The
   * four older tables above remain the public views onto it: nothing that
   * already reads Combat.GUNS has to learn anything new. */
  var SLOT_ORDER = ['hardpoint', 'utility', 'internal', 'capital'];
  var SLOT_LABEL = { hardpoint: 'Hardpoint', utility: 'Utility',
                     internal: 'Internal', capital: 'Capital mount' };

  /* ---- the two slipspace modules, as things you can actually buy ---------
   * They existed before this: Slip.MODULES has priced a Wake Baffle and a
   * Harmonic Transit Anchor per hull class since the corridor was built, and
   * the corridor reads them. But they lived in a bespoke `ship.modules`
   * field, which meant no shop, no save, no mass, no power and no refusal —
   * a whole parallel outfitting system with one item in each hand.
   *
   * So the DESIGN stays in slipspace.js, where the wake factor and the
   * resist factor are, and the FITTING lives here, where slots and budgets
   * are. Neither file grows a copy of the other's numbers.
   *
   * WHY EIGHT ITEMS AND NOT TWO. Both modules are sized to the hull they
   * cover — an undersized field leaves most of the ship sticking out of it —
   * so the class is not a stat on one item, it is which item you bought.
   * Four classes each, and the budget then tells the story the old bespoke
   * field could not: a Class IV anchor on a Talon is 7 of its 9 megawatts
   * and 11 of its 14 tonnes, which is legal, ruinous, and visibly so before
   * you spend a credit. No rule had to be written to say "don't".
   *
   * MASS AND POWER SCALE WITH COVERAGE, because that is what the class means.
   * The anchor draws heavily and the baffle barely does: holding a corridor
   * open against a harmonic is work, and scattering what you have already
   * left behind is not.
   *
   * The gates match the rest of the catalogue rather than inventing a scale:
   * a baffle sits with the light kit, an anchor with the Class 3 lasers at
   * `warm` standing, because both are what a developed port sells to
   * somebody it likes. */
  var SLIP_FIT = {
    baffle: {
      slotType: 'internal', label: 'Wake Baffle',
      mass: { I: 2, II: 3, III: 4, IV: 6 },
      power: { I: 0.8, II: 1.1, III: 1.5, IV: 2.0 },
      minDev: 0.45, minStanding: 0,
      pitch: 'What you leave at the mouth of a jump, smeared until it is not worth reading.'
    },
    anchor: {
      slotType: 'internal', label: 'Harmonic Transit Anchor',
      mass: { I: 4, II: 6, III: 8, IV: 11 },
      power: { I: 3.2, II: 4.2, III: 5.4, IV: 7.0 },
      minDev: 0.70, minStanding: 10,
      pitch: 'The cheap opportunist stops being able to touch you. The serious one still can.'
    }
  };

  var SLIP_MODULES = {};
  (function () {
    if (!Slip || !Slip.MODULES) return;
    var classes = ['I', 'II', 'III', 'IV'];
    for (var kind in SLIP_FIT) {
      var fit = SLIP_FIT[kind], design = Slip.MODULES[kind];
      if (!design) continue;
      for (var c = 0; c < classes.length; c++) {
        var cid = classes[c], price = design.price[cid];
        if (!price) continue;
        var id = kind + cid;
        SLIP_MODULES[id] = {
          id: id,
          name: design.name + ' ' + cid,
          slot: fit.slotType,
          kind: 'slip' + kind,
          /* One of each, whatever the class. Two anchors do not stack — the
           * second field is inside the first — and a Class I under a Class
           * III is the same accounting error the reactors already refuse. */
          uniqueGroup: 'slip' + kind,
          slipKind: kind, slipClass: cid,
          price: price,
          mass: fit.mass[cid], power: fit.power[cid],
          minDev: fit.minDev, minStanding: fit.minStanding,
          minCrime: 0, grey: false,
          pitch: fit.pitch,
          blurb: design.blurb
        };
      }
    }
  })();

  var EQUIPMENT = {};
  (function () {
    var tables = [GUNS, TURRETS, MODULES, SLIP_MODULES];
    for (var i = 0; i < tables.length; i++) {
      for (var k in tables[i]) {
        var item = tables[i][k];
        if (!item || !item.id) continue;
        EQUIPMENT[item.id] = item;
        /* AND under the key it was found at, so every legacy id resolves
         * here too. This is not a convenience for tests: a save written
         * before the particle retier stores `c1pulse` in a slot, and a
         * lookup that missed it would silently drop the player's gun on
         * load. Aliases must reach the table the fit system reads. */
        EQUIPMENT[k] = item;
      }
    }
  })();

  /* Missiles are deliberately NOT in the slot system yet. They are still the
   * flat `ship.missiles` counter the rack code expects, and turning them
   * into an internal module is the ordnance phase's job — half a migration
   * is worse than none. */

  function hullOf(ship) { return HULLS[(ship && ship.hullId) || 'talon']; }

  /* Every slot this hull has, in a stable order, as keys like 'hardpoint0'.
   * A key is what a fit is stored against, so it has to be derived the same
   * way every time. */
  function slotKeys(ship) {
    var h = hullOf(ship), out = [];
    if (!h || !h.slots) return out;
    for (var i = 0; i < SLOT_ORDER.length; i++) {
      var type = SLOT_ORDER[i], n = h.slots[type] || 0;
      for (var j = 0; j < n; j++) out.push(type + j);
    }
    return out;
  }

  function slotType(key) { return String(key).replace(/\d+$/, ''); }

  function fitMap(ship) {
    if (!ship.fit || typeof ship.fit !== 'object') ship.fit = {};
    return ship.fit;
  }

  /* What is actually bolted on, as {key, type, item}. Skips anything whose
   * slot no longer exists — which is how a downsized hull is discovered. */
  function fittedList(ship) {
    var map = fitMap(ship), keys = slotKeys(ship), out = [];
    for (var i = 0; i < keys.length; i++) {
      var id = map[keys[i]];
      if (id && EQUIPMENT[id]) {
        out.push({ key: keys[i], type: slotType(keys[i]), item: EQUIPMENT[id] });
      }
    }
    return out;
  }

  function fitSummary(ship) {
    var h = hullOf(ship), list = fittedList(ship);
    var power = 0, mass = 0, bonus = 0;
    for (var i = 0; i < list.length; i++) {
      power += list[i].item.power || 0;
      mass += list[i].item.mass || 0;
      bonus += list[i].item.powerBonus || 0;      // reactors
    }
    var cap = ((h && h.powerMW) || 0) + bonus;
    return {
      powerUsed: Math.round(power * 100) / 100,
      powerCap: Math.round(cap * 100) / 100,
      powerBonus: bonus,
      powerFree: Math.round((cap - power) * 100) / 100,
      massUsed: Math.round(mass * 100) / 100,
      massCap: (h && h.fitMass) || 0,
      massFree: Math.round(((h && h.fitMass || 0) - mass) * 100) / 100,
      slots: list.length, slotsTotal: slotKeys(ship).length
    };
  }

  /* Can this go here, and if not, WHY NOT — in words the yard can print.
   * A greyed-out button that will not say what is wrong is indistinguishable
   * from a bug, so every refusal carries its reason. */
  function canFit(ship, id, key) {
    var item = EQUIPMENT[id];
    if (!item) return { ok: false, why: 'no such equipment' };

    /* One is enough. Lasers stack across hardpoints quite happily; a second
     * shield generator, heat shield or turret is dead weight the legacy
     * mirror will never look at. */
    var group = item.uniqueGroup || (item.unique ? item.id : null);
    if (group) {
      var have = fittedList(ship);
      for (var u = 0; u < have.length; u++) {
        var g = have[u].item.uniqueGroup ||
                (have[u].item.unique ? have[u].item.id : null);
        if (g === group && have[u].key !== key) {
          return { ok: false, why: have[u].item.id === id
                   ? item.name + ' is already fitted'
                   : have[u].item.name + ' is already fitted — sell it first' };
        }
      }
    }

    var keys = slotKeys(ship);
    if (key === undefined || key === null) {
      key = firstFreeSlot(ship, item.slot);
      if (!key) return { ok: false, why: 'no free ' + (SLOT_LABEL[item.slot] || item.slot).toLowerCase() + ' slot' };
    }
    if (keys.indexOf(key) < 0) return { ok: false, why: 'this hull has no ' + key };
    if (slotType(key) !== item.slot) {
      return { ok: false, why: item.name + ' needs a ' +
               (SLOT_LABEL[item.slot] || item.slot).toLowerCase() + ' slot' };
    }

    /* Budgets are checked as if the target slot were already empty, so
     * REPLACING a gun with a bigger one is judged on the swap rather than
     * on the pair — otherwise every upgrade would be refused for the draw
     * of the thing it is replacing. */
    var occupant = fitMap(ship)[key];
    var sum = fitSummary(ship);
    var freeP = sum.powerFree, freeM = sum.massFree;
    if (occupant && EQUIPMENT[occupant]) {
      var occ = EQUIPMENT[occupant];
      freeP += (occ.power || 0) - (occ.powerBonus || 0);   // pulling a reactor costs its bonus
      freeM += occ.mass || 0;
    }
    /* Net demand, because a reactor is an item with negative draw: what it
     * asks of the budget is its own consumption minus what it contributes. */
    var demandP = (item.power || 0) - (item.powerBonus || 0);
    if (demandP > freeP + 1e-9) {
      return { ok: false, key: key, why: 'needs ' + (item.power || 0).toFixed(1) +
               ' MW, only ' + freeP.toFixed(1) + ' free' };
    }
    if ((item.mass || 0) > freeM + 1e-9) {
      return { ok: false, key: key, why: 'needs ' + (item.mass || 0).toFixed(1) +
               ' t, only ' + freeM.toFixed(1) + ' free' };
    }
    return { ok: true, key: key };
  }

  function firstFreeSlot(ship, type) {
    var map = fitMap(ship), keys = slotKeys(ship);
    for (var i = 0; i < keys.length; i++) {
      if (slotType(keys[i]) === type && !map[keys[i]]) return keys[i];
    }
    return null;
  }

  /* Bolt it on. Does no buying — money is buyOutfit's business. */
  function fitItem(ship, id, key) {
    var v = canFit(ship, id, key);
    if (!v.ok) return v;
    /* Store the CANONICAL id, not whatever alias was passed in, so a save
     * normalises forward the first time an old fit is touched. */
    fitMap(ship)[v.key] = EQUIPMENT[id].id;
    syncLegacy(ship);
    return { ok: true, key: v.key, item: EQUIPMENT[id] };
  }

  function unfitItem(ship, key) {
    var map = fitMap(ship), id = map[key];
    if (!id) return null;
    delete map[key];
    syncLegacy(ship);
    return EQUIPMENT[id] || null;
  }

  /* A refit is a haircut, not an investment. */
  var RESALE = 0.45;

  function sellFitted(G, key) {
    var item = unfitItem(G.ship, key);
    if (!item) return 0;
    var paid = Math.round((item.price || 0) * RESALE);
    G.ship.credits += paid;
    return paid;
  }

  /* ---- the legacy mirror -------------------------------------------------
   * Everything that already existed reads ship.gun, ship.turret,
   * ship.shield and ship.heatshield. Rather than chase those through
   * fireGun, updateTurret, the regen tick, screens.js and the save file, the
   * slot system keeps them in step after every change. The slots are the
   * truth; these four are a view that happens to be spelled the old way. */
  function syncLegacy(ship) {
    var list = fittedList(ship);
    var gun = null, turret = null, shield = null, heatshield = null;
    for (var i = 0; i < list.length; i++) {
      var it = list[i].item;
      if (it.kind === 'gun' && !gun) gun = it.id;
      else if (it.kind === 'turret' && !turret) turret = it.id;
      else if (it.kind === 'shield' && !shield) shield = it.id;
      else if (it.kind === 'heatshield' && !heatshield) heatshield = it.id;
    }
    ship.gun = gun;
    ship.turret = turret;

    var hadShield = !!ship.shield;
    ship.shield = shield;
    if (shield && !hadShield) ship.shieldHp = MODULES.shield.cap;   // arrives charged
    if (!shield) ship.shieldHp = 0;

    ship.heatshield = heatshield;
    ship.heatShed = heatshield ? MODULES.heatshield.shed : 0;

    if (global.Sim && global.Sim.refreshShip) global.Sim.refreshShip(ship);
    return ship;
  }

  /* ---- migration ---------------------------------------------------------
   * Saves from before slots existed carry four flat fields. Old 'pulse'
   * becomes the Class 1 pulse it always was; old 'beam' becomes the Class 2
   * intermittent, which is where its 15-damage-per-shot behaviour actually
   * belongs on the new ladder. Nothing is charged and nothing is lost. */
  function migrateFit(ship) {
    if (ship.fit && typeof ship.fit === 'object' && Object.keys(ship.fit).length) {
      syncLegacy(ship);
      return ship;
    }
    ship.fit = {};
    var want = [];
    if (ship.gun) want.push(LEGACY_GUN[ship.gun] || ship.gun);
    if (ship.turret) want.push('turret');
    if (ship.shield) want.push('shield');
    if (ship.heatshield) want.push('heatshield');
    for (var i = 0; i < want.length; i++) {
      /* Deliberately forgiving: a legacy ship that would now be over budget
       * keeps its gear anyway. Confiscating something the player already
       * owns because the rules changed under them is the worst possible
       * first impression of a new system. */
      var v = canFit(ship, want[i]);
      var key = (v.key) || firstFreeSlot(ship, (EQUIPMENT[want[i]] || {}).slot);
      if (key) ship.fit[key] = want[i];
    }
    syncLegacy(ship);
    return ship;
  }

  /* Can everything currently bolted on move to `toHull`? Answers without
   * touching the ship, because buyHull has to be able to refuse the sale
   * before it takes any money. Returns the proposed fit map on success so
   * the caller can simply assign it. */
  function replanFit(ship, toHull) {
    var list = fittedList(ship);
    var probe = { hullId: toHull.id, fit: {} };
    /* Heaviest and hungriest first: a greedy pass that places the little
     * things first can wedge itself out of room for the big one. */
    list = list.slice().sort(function (a, b) {
      return (b.item.power || 0) - (a.item.power || 0);
    });
    /* Where each fitting ENDED UP, old slot key to new. A Kestrel's
     * hardpoint2 is a Talon's hardpoint1, so anything keyed by slot — fire
     * groups, so far — has to be carried across rather than left pointing
     * at a slot that has moved or stopped existing. */
    var moved = {};
    for (var i = 0; i < list.length; i++) {
      var v = canFit(probe, list[i].item.id);
      if (!v.ok) {
        return { ok: false, why: list[i].item.name + ' will not fit a ' +
                 toHull.name + ' — ' + v.why + '; sell it first' };
      }
      probe.fit[v.key] = list[i].item.id;
      moved[list[i].key] = v.key;
    }
    return { ok: true, fit: probe.fit, moved: moved };
  }

  /* Rewrite the group map through a replan's key mapping. Anything whose
   * slot did not survive is simply dropped — it is not on the ship any
   * more, so a trigger assignment for it would be a lie. */
  function remapGroups(ship, moved) {
    var old = groupMap(ship), next = {};
    for (var k in old) if (moved[k]) next[moved[k]] = old[k];
    ship.groups = next;
    return next;
  }

  /* What an NPC hull takes to crack, by class. Assigned lazily the first
   * time something hits it, so the generator never has to know combat
   * exists. */
  var NPC_HULL = {
    shuttle: 25, freighter: 55, tanker: 75, hauler: 40,
    police: 70, merc: 95, pirate: 80,
    liner: 110,          // big, soft, and full of people
    navy: 260,           // you do not crack one of these with a photon
    tender: 60           // built to tow, not to take hits
  };
  var NPC_GUN = { dmg: 5, range: 12, cooldown: 1.1 };

  /* ---- merchantmen shoot back --------------------------------------------
   * Freighters used to carry no guns at all, which made robbing one a
   * chore rather than a decision: you closed, you demanded, and nothing
   * could happen to you. Now everything flies armed EXCEPT SHUTTLES.
   *
   * Deliberately feeble. A trader's gun is not meant to win — it is meant
   * to make a robbery cost you hull and time, so that the mercenary escort
   * is still worth hiring and a pirate still prefers the soft target. The
   * real defence is the second line below: a merchantman screams for help
   * in half the time an armed ship takes, because it has nothing better to
   * do with those seconds. That leans on the witness system already in
   * place rather than on damage, which is where this game's teeth are.
   *
   * A shuttle stays unarmed, and that is a role rather than a weakness —
   * it is the hull nobody scans twice, which is exactly what you want when
   * the cargo is a sabotage device. */
  var TRADER_GUN = { dmg: 2, range: 8, cooldown: 2.2 };
  /* A rescue tender is unarmed for the same reason an ambulance is: what
   * protects it is that shooting one is unthinkable and expensive, not
   * that it can shoot back. See BOUNTY.killTender. */
  var UNARMED_CLASSES = { shuttle: true, tender: true };

  var DISTRESS_DELAY_ARMED = 10;   // a warship backs itself for a while
  var DISTRESS_DELAY_CIVIL = 5;    // a freighter calls the moment it is hit

  function isArmedNpc(spec) {
    if (!spec) return false;
    return !UNARMED_CLASSES[spec.cls];
  }

  function distressDelayFor(spec) {
    if (!spec) return DISTRESS_DELAY_ARMED;
    var civil = spec.kind === 'trader' || UNARMED_CLASSES[spec.cls];
    return civil ? DISTRESS_DELAY_CIVIL : DISTRESS_DELAY_ARMED;
  }

  var ATTACK_STANDOFF = 6;       // km — where an attacker tries to sit
  var AIM_CONE = 0.035;          // rad — generous, ships are tens of metres
  var WITNESS_RANGE = 150000;    // km — "the same patch of space"
  var DISTRESS_DELAY = 10;       // s — how long a victim needs to squawk
  var WANTED_HUNT = 800;         // bounty at which police attack and ports refuse
  /* Killing a warship is not the same offence as killing a patrol cutter,
   * and a liner is full of people who were going somewhere. */
  /* Shooting a rescue tender sits above killing a patrol cutter, and it
   * should: a cutter came looking for you, and the tender was on its way
   * to help somebody. It is the one hull in the game whose only defence
   * is that everyone agrees not to. */
  var BOUNTY = { demand: 400, assault: 300, kill: 2800, killPolice: 6000,
                 killNavy: 12000, killLiner: 9000, killTender: 14000,
                 smuggling: 0 };
  var SMUGGLING_FINE_PER_TONNE = 180;   // cr/t, on top of losing the cargo itself
  var SEARCH_FLOOR = 0.12;   // even the most permissive system still checks sometimes

  /* Dumping reactor waste in open space. Deliberately far above what a
   * reprocessing plant charges to take it properly (economy.js: roughly
   * 130-190 cr/t): the fine has to beat the fee even after the odds of
   * getting away with it, or dumping stays the rational play and the
   * disposal run — which is the actual content — never gets flown. At the
   * producer's end you are paid 310-620 cr/t to load the stuff, so this
   * also has to exceed THAT to stop "load and dump" being free money. */
  var DUMPING_FINE_PER_TONNE = 520;
  var REPORT_FLOOR = 0.15;   // even a lawless system has someone who talks

  /* ---- the player's fittings -------------------------------------------- */

  function initShip(ship) {
    if (ship.hullId === undefined) ship.hullId = 'talon';
    if (ship.hullMax === undefined) ship.hullMax = HULLS[ship.hullId].hullMax;
    if (ship.hullHp === undefined) ship.hullHp = ship.hullMax;
    if (ship.gun === undefined) ship.gun = 'pulse';   // you start armed, barely
    if (ship.turret === undefined) ship.turret = null;
    if (ship.shield === undefined) ship.shield = null;
    if (ship.shieldHp === undefined) ship.shieldHp = 0;
    if (ship.heatshield === undefined) ship.heatshield = null;
    if (ship.heatShed === undefined) ship.heatShed = 0;
    if (ship.heat === undefined) ship.heat = 0;
    if (ship.missiles === undefined) ship.missiles = 0;
    if (ship.sinks === undefined) ship.sinks = 0;
    /* Slots last: migrateFit reads the four legacy fields above and turns
     * them into a fit, then syncLegacy writes them back in the new
     * spelling. A ship that has never seen this code comes out of it with
     * a Class 1 pulse in hardpoint0, which is what "you start armed,
     * barely" now means. */
    migrateFit(ship);
    return ship;
  }

  function npcHull(spec) {
    if (spec.hullHp === undefined) {
      spec.hullMax = NPC_HULL[spec.cls] || 50;
      spec.hullHp = spec.hullMax;
    }
    return spec.hullHp;
  }

  /* ---- and what it takes to get THROUGH to the hull ----------------------
   * NPCs have never had shields. Everything shot at one went straight into
   * hullHp, which had a consequence nobody had noticed: `vsShield` and
   * `vsHull` have been on every gun in the catalogue since the particle
   * retier and NOTHING HAS EVER READ THEM. There was exactly one shield in
   * the game, it belonged to the player, and the player's own guns never hit
   * it — so the pulse-soaks / beam-drains interaction that the whole weapon
   * design rests on has been inert the entire time. This is the change that
   * switches it on, which matters more than the animation that asked for it.
   *
   * WHO CARRIES ONE is a statement about the ship, in the same voice as
   * NPC_HULL above. Warships and money have them; working hulls mostly do
   * not, because a generator is 4,800 credits, two megawatts and four tonnes
   * and a freighter would rather have the tonnage.
   *
   * The rescue tender is the interesting entry: unarmed, and shielded. It
   * flies INTO fights to pull people out, so what keeps it alive is being
   * hard to kill by accident rather than being able to shoot back — which is
   * the same argument BOUNTY.killTender already makes from the other end.
   *
   * A pirate's is deliberately feeble. It is grey-market kit on a hull that
   * is one bad week from being scrap, and twenty points is the difference
   * between a fight and a formality without being a wall.
   *
   * Lazy, exactly like npcHull, so the generator still never has to know
   * combat exists. */
  /* SIZE IS A REAL PROPERTY, and it lives in the model library rather than
   * here. Every imported hull comes in three variants — `shuttle-s`,
   * `shuttle-m`, `shuttle-l` and so on for all thirteen families — and
   * `Render.HULL_ASSIGN` says which one a class actually flies. So an entry
   * below may be one number for every size, or a per-size object when the
   * variant is the whole point:
   *
   *   - A SHUTTLE only has the volume for a generator in its largest form.
   *     Four tonnes and two megawatts is a lot to find on a hull whose job
   *     is being the one nobody scans twice.
   *   - AN ESCAPE POD never does, at any size. There is nothing aboard one
   *     but people and an hour of air, and a pod that could be shielded
   *     would be a pod somebody argued about shooting.
   *
   * Read through HULL_ASSIGN rather than off a number, because the
   * assignment is editable at runtime — `Render.assignHull('pirate',
   * 'fighter-s')` is offered as a design surface — and a shuttle that has
   * been reassigned to the large model should get the large model's answer.
   * Reached through `global` at call time, not bound at load: render.js
   * loads AFTER this file, and npcShield only ever runs once something has
   * been shot at, which is long after boot. */
  var NPC_SHIELD = {
    escape_pod: { s: 0, m: 0, l: 0 },   // never, at any size
    shuttle: { s: 0, m: 0, l: 15 },     // only the big one has the room
    freighter: 0, tanker: 0, hauler: 0,
    pirate: 20,          // bought off the same counter as its lasers
    police: 30,
    tender: 25,          // unarmed, and built to survive somebody else's fight
    merc: 40,            // this is what you are paying for
    liner: 45,           // insured, and full of people
    navy: 90             // you do not crack one of these with a photon
  };

  /* 's' | 'm' | 'l', off the model this class is currently assigned. Falls
   * back to 'm' rather than to nothing, so a class with no model — or a run
   * with render.js absent, which the headless suites are — still gets the
   * middle answer instead of an undefined one. */
  function hullSize(cls) {
    var R = global.Render;
    var id = R && R.HULL_ASSIGN && R.HULL_ASSIGN[cls];
    var m = /-(s|m|l)$/.exec(id || '');
    return m ? m[1] : 'm';
  }

  /* ---- what your scanner can tell you ------------------------------------
   * 0 nothing, 1 a fraction, 2 the numbers. Reads off the slots like
   * everything else, so fitting one is the only step. */
  function scanLevel(ship) {
    var list = fittedList(ship), best = 0;
    for (var i = 0; i < list.length; i++) {
      var it = list[i].item;
      if (it.kind === 'scanner' && (it.scan || 0) > best) best = it.scan;
    }
    return best;
  }

  /* A reading on one ship, or null if you have nothing fitted to read it
   * with. Deliberately returns null rather than zeroes: "no scanner" and
   * "an undamaged ship" must not look the same on the instrument.
   *
   * Asking settles the lazy hull and shield assignments early. That is safe
   * precisely because both are pure functions of the spec's class — looking
   * at a ship cannot change what it turns out to be made of, it only
   * decides it sooner, which is the same trick npcHull has always played on
   * the first shot. */
  function scanShip(ship, spec) {
    var level = scanLevel(ship);
    if (!level || !spec) return null;
    npcHull(spec);
    npcShield(spec);
    var max = spec.hullMax || 1;
    var out = {
      level: level,
      hullFrac: Math.max(0, Math.min(1, (spec.hullHp || 0) / max))
    };
    if (spec.shieldMax > 0) {
      out.shieldFrac = Math.max(0, Math.min(1, (spec.shieldHp || 0) / spec.shieldMax));
    }
    if (level >= 2) {
      out.hullHp = spec.hullHp;
      out.hullMax = spec.hullMax;
      out.shieldHp = spec.shieldHp || 0;
      out.shieldMax = spec.shieldMax || 0;
    }
    return out;
  }

  function npcShield(spec) {
    if (spec.shieldMax === undefined) {
      var cap = NPC_SHIELD[spec.cls];
      if (cap === undefined) cap = 0;                 // unknown hulls fly bare
      else if (typeof cap === 'object') cap = cap[hullSize(spec.cls)] || 0;
      spec.shieldMax = cap;
      spec.shieldHp = cap;
    }
    return spec.shieldHp;
  }

  /* ---- one rule for both sides of a fight --------------------------------
   * The shield is a BUCKET, and the delivery multipliers say how much of a
   * shot the bucket is any good against. What was never written down is what
   * happens to a shot that BREAKS THROUGH one, and getting that wrong would
   * quietly undo the design:
   *
   *   - the shot arrives carrying `dmg`
   *   - against the shield it delivers `dmg * vsShield`
   *   - whatever fraction of THAT the shield actually absorbs is the
   *     fraction of the shot that was spent
   *   - the rest of the shot goes on to the hull, at `vsHull`
   *
   * So a pulse wastes 40% of its punch on a full bucket and then opens the
   * plating at x1.2 once the bucket is empty; a beam strips the bucket at
   * x1.5 and is a poor tin-opener afterwards.
   *
   * MEASURED, against a naval cutter — 90 shield over 260 hull — with a flat
   * 20-point shot, so only the delivery differs:
   *
   *     beam alone            22 shots
   *     pulse alone           19
   *     intermittent alone    18
   *     BEAM, THEN PULSE      14      <- strip with one group, open with the other
   *
   * Twenty-two per cent better than the best single weapon, and it is the
   * first time in this project that carrying two kinds of gun has been worth
   * anything at all. Fire groups were built for exactly this and have had
   * nothing to reward until now.
   *
   * Returns what to subtract from each, so the two callers cannot drift. */
  var FLAT_DELIVERY = { vsShield: 1, vsHull: 1 };

  function splitDamage(shieldHp, dmg, delivery) {
    var d = delivery || FLAT_DELIVERY;
    var vs = d.vsShield === undefined ? 1 : d.vsShield;
    var vh = d.vsHull === undefined ? 1 : d.vsHull;
    /* A ZERO-DAMAGE SHOT, which is a real thing: damageAtRange takes a pion
     * to nearly nothing at the edge of its envelope. Without this line the
     * `soaked / offered` below is 0/0, and a NaN written into shieldHp is a
     * ship that can never be hurt again and a shield bar that reads blank
     * forever. Caught by reading rather than by playing, which is the only
     * way it would ever have been caught — nobody notices the shot that did
     * nothing until every shot after it does nothing too. */
    if (!(dmg > 0)) return { shield: 0, hull: 0, through: false };
    if (!(shieldHp > 0) || !(vs > 0)) {
      return { shield: 0, hull: dmg * vh, through: true };
    }
    var offered = dmg * vs;
    var soaked = Math.min(shieldHp, offered);
    var spent = soaked / offered;                 // share of the shot used up
    var left = dmg * (1 - spent);
    return { shield: soaked, hull: left * vh, through: left > 1e-9 };
  }

  /* ---- lifting a trader off its rail ------------------------------------
   * Traffic ships are pure functions of t and normally never simulated.
   * The moment one is attacked or extorted it needs to be able to flee,
   * fight back or die, so it is promoted into the same patrol-spec shape
   * the encounter system already steers. The route is suppressed while its
   * ship flies free, and marked dead forever if the ship dies — a timetable
   * with no ship on it.
   *
   * If it escapes (drops off the encounter list unhurt), the pseudo-spec is
   * reaped and the timetable resumes. Strictly that teleports it back onto
   * schedule — thousands of kilometres away, where nobody can see it. */
  function liftTrader(sys, state, t) {
    if (!state || !state.route || state.route.dead) return null;
    // Already lifted?
    var patrols = sys.patrols || (sys.patrols = []);
    for (var i = 0; i < patrols.length; i++) {
      if (patrols[i].liftedFrom === state.route) return patrols[i];
    }
    var route = state.route;
    route.suppressed = true;
    /* A trader's flag is its home port's flag: robbing the run from Halden
     * Dock is a crime Halden Dock's faction remembers, and their ports are
     * the ones that close to you. 'civil' is the fallback for a ship that
     * genuinely belongs to nobody, and nobody avenges it. */
    var faction = route.faction ||
                  (state.from && state.from.faction) ||
                  (state.to && state.to.faction) || null;
    var spec = {
      id: route.id + '-live', kind: 'trader', cls: route.cls,
      className: route.className, name: route.name, faction: faction,
      size: route.size, color: route.color, accel: (route.accel || 0.002) * 2.5,
      liftedFrom: route, manifest: state.manifest,
      rail: { type: 'lifted' },
      live: {
        pos: V.clone(state.pos), vel: V.clone(state.vel),
        fwd: V.clone(state.fwd), up: V.clone(state.up), right: V.clone(state.right),
        phase: 'live', route: route, manifest: state.manifest
      },
      mode: 'breakoff', modeSince: 0
    };
    spec.reg = route.reg || (global.Sim.regCode ? global.Sim.regCode(route.id) : null);
    spec.live.reg = spec.reg;
    spec.live.spec = spec; spec.live.kind = 'trader';
    spec.live.id = spec.id; spec.live.name = spec.name;
    spec.live.cls = spec.cls; spec.live.className = spec.className;
    spec.live.size = spec.size; spec.live.color = spec.color;
    spec.live.faction = spec.faction;
    patrols.push(spec);
    sys._ships = null;
    sys._traffic = null;         // the route list just changed shape
    return spec;
  }

  function reapLifted(sys) {
    var patrols = sys.patrols || [];
    for (var i = patrols.length - 1; i >= 0; i--) {
      var s = patrols[i];
      if (s.liftedFrom && !s.live && !s.dead) {
        s.liftedFrom.suppressed = false;      // back on the timetable
        patrols.splice(i, 1);
        sys._ships = null;
        sys._traffic = null;
      }
    }
  }

  /* ---- damage ----------------------------------------------------------- */

  /* ---- where a hit landed, for the things that draw it -------------------
   * The single seam between the combat model and every impact effect. It
   * records a DIRECTION rather than a point: a unit vector in world space
   * from the ship's centre toward whatever hit it, which is all the renderer
   * needs to find the spot on a hull or a shell and is the one thing that
   * stays meaningful while the ship keeps flying. A stored world point would
   * be half a kilometre astern within a second at combat speeds — the same
   * bug the beam muzzles had.
   *
   * SHORT AND CAPPED. These live for the length of an animation, not for the
   * length of a fight, and a ship under sustained beam fire takes a hit every
   * frame. Oldest out first, four at a time, which is more than the eye can
   * separate anyway.
   *
   * STAMPED IN REAL SECONDS, NOT SIM SECONDS, and this file already says why
   * a few hundred lines down: "the BEAM's fade stays on real time, because a
   * flash is for the player's eyes." An impact flare is the same kind of
   * thing. Sim time is the wrong clock for it — it runs at up to 500x, so a
   * half-second animation stamped in sim seconds would be over inside one
   * frame the moment anything was compressed.
   *
   * `spec.lastHitAt` deliberately stays on SIM time, because what it gates is
   * the shield's regeneration delay, and that is a delay in the world rather
   * than in the eye. Two clocks, two jobs; the only mistake would be using
   * one for both.
   *
   * Nothing here is seeded, and nothing here needs to be: an impact is a
   * consequence of a shot that has already happened, so replaying the shot
   * replays the impact. There is no draw to get wrong. */
  var MAX_IMPACTS = 4;

  function nowSec() {
    return (typeof performance !== 'undefined' ? performance.now() : 0) / 1000;
  }

  function markImpact(target, from, split) {
    if (!target || !split) return;
    /* A shot that delivered nothing gets no flare. `splitDamage` returns a
     * zero split for a pion that has run out of envelope, and without this
     * line the shell would light up for a hit that did not happen — which is
     * the worst kind of tell, because the player would learn to trust it. */
    if (!(split.shield > 0) && !(split.hull > 0)) return;
    var at = target.live ? target.live.pos : target.pos;
    var dir = null;
    if (from && at) {
      var d = V.sub(from, at), l = V.len(d);
      if (l > 1e-9) dir = V.scale(d, 1 / l);
    }
    /* No direction to be had — a missile, or a shot from something that has
     * already stopped existing. Facing the camera is the honest fallback:
     * the flare is a thing that happened to this ship, and putting it
     * somewhere arbitrary on the far side would hide it for no reason. */
    var list = target.impacts || (target.impacts = []);
    list.push({
      dir: dir, at: nowSec(),
      shield: split.shield, hull: split.hull,
      /* Which of the two effects this is. A shot fully soaked flares on the
       * shell; one that came through blooms on the plating; one that did
       * both does both, which is exactly what a shield failing looks like. */
      soaked: split.shield > 0, through: split.hull > 1e-9
    });
    while (list.length > MAX_IMPACTS) list.shift();
  }

  /* `delivery` and `from` are both additive and both optional. A missile
   * passes neither — it has no variety and detonates on contact rather than
   * arriving from anywhere in particular — and gets a flat split and a
   * bloom on the hull's own centre, which is the truth about a missile. */
  function damageNpc(sys, G, spec, dmg, t, hooks, delivery, from) {
    npcHull(spec);
    npcShield(spec);
    var split = splitDamage(spec.shieldHp, dmg, delivery);
    spec.shieldHp -= split.shield;
    spec.hullHp -= split.hull;
    spec.lastHitAt = t;
    /* When the shield next starts refilling. Pushed back by every hit, so a
     * ship under sustained fire never recovers a point of it — the same
     * shape the player's regenDelay has. */
    spec.shieldIdleAt = t + MODULES.shield.regenDelay;
    markImpact(spec, from, split);

    /* Being shot at is an argument everybody understands. Armed ships turn
     * and fight; unarmed ones run. Either way the crime clock starts. */
    if (spec.kind === 'trader' || spec.cls === 'shuttle') {
      /* A merchantman still RUNS — it is not going to win and it knows it
       * — but if it has a gun it fires while it goes. `defending` is
       * deliberately not `hostileToPlayer`: it shoots, it does not hunt,
       * and it will still break off the moment it can. */
      spec.mode = 'breakoff';
      if (isArmedNpc(spec)) spec.defending = true;
    } else {
      spec.mode = 'attack';
      spec.hostileToPlayer = true;
    }
    crime(sys, G, t, 'assault', spec, hooks);

    if (spec.hullHp <= 0) killNpc(sys, G, spec, t, hooks);
  }

  /* ---- a hold is a pure function of the ship that carries it --------------
   * killNpc used to invent a pirate's cargo with bare Math.random() at the
   * moment of death, which broke the first doctrine in two separate ways.
   * The same pirate, on the same seed, carried different goods every time it
   * died — and robbing one ALIVE then killing it could disagree about what
   * it had been holding, because only one of those two paths ever invented a
   * manifest at all.
   *
   * Same trick regCode already uses, and for the reason its own comment
   * gives: the ship reads the same forever "without a byte of stored state".
   *
   * SALTED WITH THE SYSTEM SEED, because buildPatrols numbers its specs n0,
   * n1, n2... PER SYSTEM. Unsalted, every system's n3 would carry identical
   * cargo — the sort of pattern a player notices about twenty minutes before
   * they stop trusting the generator. (Corridor drop-outs were the other
   * worry here: their ids are 'drop-' + a slipspace contact id, and those
   * come from `new RNG('galaxy-lane|...')` and `'corridor-hunt|...|window'`,
   * both seeded, so they hash stably across loads too.)
   *
   * BIASED TO LOCAL TRADE, because a pirate's hold is somebody else's cargo
   * and what is worth stealing here is what flies here. sys.traffic already
   * carries every route's manifest, so loot ends up saying something true
   * about where you are: a system running medicine has pirates full of
   * medicine, and that is worth more than a global loot table. */
  var FALLBACK_LOOT = ['medicine', 'computers', 'alloys', 'ores', 'luxuries'];

  function localGoods(sys) {
    if (!sys) return FALLBACK_LOOT;
    if (sys._loot) return sys._loot;
    var seen = {}, out = [], traffic = sys.traffic || [];
    for (var i = 0; i < traffic.length; i++) {
      var legs = [traffic[i].out || [], traffic[i].back || []];
      for (var j = 0; j < legs.length; j++) {
        for (var k = 0; k < legs[j].length; k++) {
          var cid = legs[j][k] && legs[j][k].cid;
          /* Waste is a disposal contract, not loot. Nobody fences it, and a
           * hold full of it is a punishment rather than a prize. */
          if (!cid || cid === 'waste' || seen[cid]) continue;
          seen[cid] = true; out.push(cid);
        }
      }
    }
    /* Sorted, because route order is generation order: if traffic is ever
     * re-ranked, an unsorted list would silently re-index every pirate's
     * hold in the galaxy. */
    out.sort();
    sys._loot = out.length ? out : FALLBACK_LOOT;
    return sys._loot;
  }

  /* DERIVED ONCE, THEN OWNED. The instant anything reads a hold it becomes
   * stored state on the spec — the same lazy pattern npcHull() already uses
   * for hull points — because the moment the player takes cargo off a ship
   * the pure function has stopped being the truth. */
  /* ---- HOW BIG THE PRIZE IS, when the hull's tonnage is known ------------
   *
   * An in-system pirate is a spec off buildPatrols and carries no tonnage
   * figure, so both scales below return 1 and every existing hold and purse
   * in the galaxy hashes to exactly what it hashed to before — the additive
   * discipline, applied to a number rather than to a save field.
   *
   * A LANE HAULER does carry one, because the slipspace timetable sizes each
   * leg. That is what makes the corridor a place where you CHOOSE: the fat
   * contact is worth more and is also the one your interdictor can barely
   * hold, and both halves of that trade read off the same number.
   *
   * MEASURED, NOT PICKED. Sampled across ten galaxy seeds, 2,858 lane legs:
   *
   *     packet 151 t · trader 416 · liner 654 · freighter 1104 · bulker 2717
   *     overall  min 90   p25 289   median 522   p75 1133   max 3592
   *
   * The first attempt at this scaled by 1 + t/900 capped at 3, which handed
   * a median hauler a ten-tonne hold and a 3,600 t bulker twenty — against a
   * Talon that carries 64 t. Two things were wrong with that and only one of
   * them was the size: the ladder was also nearly FLAT, so which contact you
   * chased down the corridor made no difference worth the chase. This is the
   * project's own rule about thresholds — sample the distribution first —
   * caught for once before it shipped rather than after.
   *
   * CARGO is deadweight, and deadweight is roughly what a hauler is. At
   * t/170 against the 3–10 t base draw the ladder comes out at about 4% of
   * all-up mass, which reads:
   *
   *     packet ~12 t · trader ~22 · liner ~32 · freighter ~49 · bulker ~111
   *
   * A packet is scraps, a freighter is a good day, and a bulker is MORE THAN
   * A TALON CAN LIFT — which is the correct feeling for piracy and hands the
   * big hulls a reason to exist without anyone writing a rule. Capped at 20
   * so the top of the range stays inside a Mule's 160 t hold. */
  function cargoScale(spec) {
    var t = spec && spec.tonnes;
    if (!(typeof t === 'number' && t > 0)) return 1;
    return Math.min(20, 1 + t / 170);
  }

  /* MONEY IS NOT DEADWEIGHT. What is in the safe is operating cash, and a
   * bulk hauler does not carry six times a trader's float just because it
   * displaces six times as much. So the purse gets its own, much gentler
   * curve — topping out around 2,500 cr — and the cargo stays the real
   * prize. That is the right emphasis for a game about trade: the payoff for
   * interdicting a freighter should be a hold you then have to go and SELL,
   * not a number that goes up. */
  function purseScale(spec) {
    var t = spec && spec.tonnes;
    if (!(typeof t === 'number' && t > 0)) return 1;
    return 1 + Math.min(2, t / 900);
  }

  function manifestFor(sys, spec) {
    if (!spec) return [];
    /* PRESENCE, NOT LENGTH. This tested `.length` and so could not tell a
     * hold that has never been derived from one that has been emptied — so a
     * robbed ship regenerated a fresh cargo on the very next demand and the
     * hold refilled itself forever. Exactly the shape of the purse bug
     * below, reached from the other side: "derive once, then own it" has to
     * mean owning the answer NOTHING as well. */
    if (spec.manifest) return spec.manifest;
    var goods = localGoods(sys);
    var h = RNG.hashString('hold|' + ((sys && sys.seed) || '?') + '|' +
                           (spec.id || spec.name || '?'));
    /* Three independent draws out of one hash: which commodity, how much of
     * it, and whether there is a second one at all. Shifted rather than
     * re-hashed, so there is one call and one place to look. */
    var k = cargoScale(spec);
    var pick = goods[h % goods.length];
    var man = [{ cid: pick, tonnes: Math.round((3 + ((h >>> 8) % 8)) * k) }];
    if (((h >>> 16) & 3) === 0 && goods.length > 1) {
      var second = goods[(h >>> 20) % goods.length];
      if (second !== pick) {
        man.push({ cid: second, tonnes: Math.round((2 + ((h >>> 24) % 5)) * k) });
      }
    }
    spec.manifest = man;
    return man;
  }

  /* The single read point for "what is this ship carrying", so robbery,
   * death and any future cargo scanner cannot disagree. Traders keep their
   * route-derived manifests, which are better grounded still; the hash only
   * fills in for ships that have no route to inherit one from.
   *
   * A SHIP TORN OUT OF SLIPSPACE IS EXACTLY THAT SHIP, and leaving it out of
   * the fallback is what made the whole interdiction feature end in an empty
   * room: you chase a freighter down a corridor, hold the lock, tear it into
   * deep space — and it reports itself running empty, every time, because it
   * flies an interstellar lane that no system's traffic list has ever heard
   * of and so inherits nothing.
   *
   * The guard is widened to `tornOut` rather than dropped, deliberately. Any
   * manifest-less trader falling back would hand cargo to every ship in the
   * galaxy that is legitimately deadheading, which is a much larger change
   * than this one and not obviously right. Lane haulers are a closed class:
   * they have no route to inherit from and never will. */
  function holdOf(sys, spec) {
    if (!spec) return [];
    /* First, because an owned hold is the truth even when it is empty. */
    if (spec.manifest) return spec.manifest;
    var man = (spec.live && spec.live.manifest) || [];
    if (man.length) return man;
    if (spec.kind !== 'pirate' && !spec.tornOut) return man;
    return manifestFor(sys, spec);
  }

  /* WHAT IS IN THE SAFE, and it is in there ONCE.
   *
   * Derived, not rolled: a ship carries the money it carries, and re-demanding
   * after a reload should not be a way to reroll the payout. Same hash family
   * as the hold, different salt.
   *
   * But derived is only half of it. The purse was a pure function read fresh
   * on every demand, which meant a torn-out freighter paid out its full purse
   * every time you asked and a successful interdiction was an unlimited
   * supply of credits — you never had to fly anywhere again. So it follows
   * the hold's doctrine to the end: DERIVE ONCE, THEN OWN IT. The moment the
   * money changes hands the pure function has stopped being the truth, and
   * what is left on the spec is the truth instead.
   *
   * Scaled by hull tonnage, but on purseScale's gentle curve rather than the
   * hold's — see the note there for why money and deadweight are not the
   * same quantity. */
  function purseOf(sys, spec) {
    if (!spec) return 0;
    if (typeof spec.purse === 'number') return spec.purse;
    var base = 150 + (RNG.hashString('purse|' + ((sys && sys.seed) || '?') +
                                     '|' + (spec.id || spec.name || '?')) % 701);
    spec.purse = Math.round(base * purseScale(spec));
    return spec.purse;
  }

  function killNpc(sys, G, spec, t, hooks) {
    spec.dead = true;
    var at = spec.live ? spec.live.pos : null;
    var vel = spec.live ? spec.live.vel : V.zero();

    if (at) {
      (G.explosions = G.explosions || []).push({
        pos: V.clone(at), at: (typeof performance !== 'undefined' ? performance.now() : 0),
        size: (spec.size || 0.06) * 30
      });

      /* The hold spills. Same canisters the airlock makes, so the scoop,
       * the scanner and the expiry clock all already work on them. */
      /* Traffic manifests quote quantity as `qty`; the test dummies and the
       * player quote `tonnes`. Reading only one of them made every real
       * freighter "run empty" — a bug only a live robbery could show. */
      /* A pirate flies no route and so no manifest, but it has been robbing
       * people — the hold is somebody else's cargo and it spills like
       * anyone's. holdOf derives that hold from the ship's own id, so the
       * same wreck always throws the same goods. */
      var man = holdOf(sys, spec);
      var dropped = 0;
      for (var i = 0; i < man.length && dropped < 3; i++) {
        var amount = man[i] && (man[i].qty || man[i].tonnes) || 0;
        if (!(amount > 0)) continue;
        /* The scatter direction is derived too, and from the same hash as
         * the hold: a replayed kill should throw its canisters the same way
         * it did the first time. */
        var sc = RNG.hashString('spill|' + (spec.id || '?') + '|' + i);
        var fake = { pos: at, vel: vel,
                     fwd: { x: ((sc & 255) / 255) - 0.5,
                            y: (((sc >>> 8) & 255) / 255) - 0.5, z: 0.2 } };
        global.Sim.dropCanister(sys, fake, man[i].cid,
                                Math.max(1, Math.round(amount * 0.3)), t);
        dropped++;
      }

      /* AND THE SHIP ITSELF COMES APART. The explosion above has been
       * standing in for this since combat existed — a pair of expanding
       * rings and then nothing, as though the hull had been deleted rather
       * than destroyed.
       *
       * What the wreck carries is what the hold did NOT spill as intact
       * cargo: three lines go out as canisters, and the rest of the manifest
       * is aboard when it breaks up, so it comes off as salvage on the
       * shards. Nothing is created and nothing is counted twice — the same
       * hold, split between what survived the blast in its crate and what
       * did not.
       *
       * Keyed on the victim's id, so a replayed kill throws the same pieces
       * the same way. spawnDebris owns that; this only has to hand it
       * something stable to hash. */
      if (global.Sim && global.Sim.spawnDebris) {
        global.Sim.spawnDebris(sys, spec.id || spec.name || 'wreck',
                               at, vel, spec.size, t, man.slice(dropped));
      }
    }

    /* A destroyed victim never files its report. This one line is the
     * user's whole witness doctrine: silence the call and there is no
     * response, however dark the deed. */
    spec.distressAt = null;

    if (spec.liftedFrom) spec.liftedFrom.dead = true;
    if (spec.kind !== 'pirate') {
      var charge = spec.kind === 'tender' ? 'killTender'
                 : spec.kind === 'navy' ? 'killNavy'
                 : spec.kind === 'police' ? 'killPolice'
                 : spec.cls === 'liner' ? 'killLiner'
                 : 'kill';
      crime(sys, G, t, charge, spec, hooks);
    } else if (hooks && hooks.say) {
      hooks.say('Pirate destroyed — nobody will miss it', 4);
    }

    spec.live = null;
    sys._ships = null;
    if (hooks && hooks.sound) hooks.sound('explosion');
  }

  /* `delivery` and `from` are additive here for the same reasons they are on
   * damageNpc, and they matter more: this is the ship the player is sitting
   * inside, and the direction is what lets the cockpit put the flare on the
   * right piece of canopy. NPC guns carry no variety, so the split is flat
   * until something out there mounts a real laser. */
  function damagePlayer(G, dmg, hooks, delivery, from) {
    var s = G.ship;
    s.lastHitAt = (typeof performance !== 'undefined' ? performance.now() : 0);
    var split = splitDamage(s.shield ? s.shieldHp : 0, dmg, delivery);
    if (s.shield) s.shieldHp -= split.shield;
    markImpact(s, from, split);
    dmg = split.hull;
    if (dmg > 0) {
      s.hullHp -= dmg;
      if (hooks && hooks.sound) hooks.sound('hit');
      /* Something has just come through the hull. What that does inside the
       * cockpit is the cockpit's business, not combat's — this only says
       * how hard it was hit and lets the ship you are sitting in react. */
      if (hooks && hooks.hullHit) hooks.hullHit(dmg);
      if (s.hullHp <= 25 && !G.hullWarned) {
        G.hullWarned = true;
        if (hooks && hooks.say) hooks.say('HULL CRITICAL — ' + Math.max(0, Math.round(s.hullHp)) + ' points left', 5);
      }
      if (s.hullHp <= 0 && hooks && hooks.destroyed) hooks.destroyed();
    } else if (hooks && hooks.sound) {
      hooks.sound('shieldHit');
    }
  }

  /* ---- heat sinks --------------------------------------------------------
   * The plumbing, ready for weapon heat to arrive in the fire-group work.
   * Anything that puts heat into the hull should call addHeat() rather than
   * touching ship.heat, so a live sink gets its share automatically and
   * nothing has to know sinks exist.
   *
   * Deliberately NOT special-cased against re-entry: heat is heat and
   * updateHeating does not distinguish sources, so a sink will happily soak
   * atmospheric flux too. It just is not much help — entry flux runs to
   * thousands of units a second, so 65% of it fills a 220-unit block almost
   * at once. The same item is decisive in a gunfight and nearly nothing on
   * the way down, because of the numbers rather than because of a rule. */
  function sinkRackSize(ship) {
    var list = fittedList(ship);
    for (var i = 0; i < list.length; i++) {
      if (list[i].item.kind === 'sinkrack') return list[i].item.rack;
    }
    return 0;
  }

  function armSink(G, t, hooks) {
    var s = G.ship;
    if (!sinkRackSize(s)) {
      if (hooks && hooks.say) hooks.say('No heat sink launcher fitted', 3);
      return false;
    }
    if (!(s.sinks > 0)) {
      if (hooks && hooks.say) hooks.say('Sink rack empty', 3);
      return false;
    }
    if (G.sink && G.sink.live) return false;
    if (t < (G.sinkCoolUntil || 0)) {
      if (hooks && hooks.say) {
        hooks.say('Launcher cycling — ' +
                  Math.ceil((G.sinkCoolUntil - t)) + ' s', 3);
      }
      return false;
    }
    s.sinks--;
    /* The bank: stored heat straight out of the hull, on the spot. This is
     * the half that makes a sink feel like relief rather than merely a
     * slower climb. */
    var banked = Math.min(SINK.bank, s.heat || 0);
    s.heat = Math.max(0, (s.heat || 0) - banked);
    G.sink = { live: true, held: banked, until: t + SINK.duration };
    if (hooks && hooks.say) hooks.say('HEAT SINK LIVE', 3);
    if (hooks && hooks.sound) hooks.sound('click');
    return true;
  }

  /* Route heat through the sink. Returns what actually reaches the hull. */
  function addHeat(G, units) {
    if (!(units > 0)) return 0;
    var sk = G.sink;
    if (!sk || !sk.live) { G.ship.heat = (G.ship.heat || 0) + units; return units; }
    var room = Math.max(0, SINK.capacity - sk.held);
    var taken = Math.min(room, units * SINK.fraction);
    sk.held += taken;
    var through = units - taken;
    G.ship.heat = (G.ship.heat || 0) + through;
    return through;
  }

  function updateSink(G, t, hooks) {
    var sk = G.sink;
    if (!sk || !sk.live) return;
    if (t < sk.until && sk.held < SINK.capacity) return;
    /* Ejected: a white-hot block with your heat in it, thrown overboard.
     * It is a scanner return that says precisely where you were and when,
     * and it cools over a minute or two — which is about how long a patrol
     * answering a distress call takes to arrive. Same doctrine as the
     * marked waste canister: evidence outlives the act.
     *
     * The physical object is the debris system's job, so this records the
     * ejection and leaves the tumbling shard to the phase that owns it. */
    sk.live = false;
    G.sinkCoolUntil = t + SINK.cooldown;
    (G.sinkEjections = G.sinkEjections || []).push({
      pos: V.clone(G.ship.pos), vel: V.clone(G.ship.vel),
      heat: sk.held, at: t
    });
    if (hooks && hooks.say) {
      hooks.say('Sink ejected — ' + Math.round(sk.held) + ' units overboard', 4);
    }
    if (hooks && hooks.sound) hooks.sound('click');
    G.sink = null;
  }

  /* ---- the law ----------------------------------------------------------
   * crime() is called at the moment of the act. If a third party is close
   * enough to the SCENE to hear the victim shouting, the report is
   * immediate. Otherwise the victim starts a transmission timer; update()
   * files the report when it expires, and killNpc cancels it. */
  function crime(sys, G, t, kind, victim, hooks) {
    if (!victim || victim.kind === 'pirate') return;    // no law for outlaws
    if (victim.reported === kind) return;               // one report per act

    var scene = victim.live ? victim.live.pos : G.ship.pos;
    var witness = witnessNear(sys, t, scene, victim, G);

    if (witness) {
      report(G, kind, victim, hooks,
             witness.name ? 'witnessed by ' + witness.name : 'witnessed');
      victim.reported = kind;
    } else if (victim.dead) {
      /* A dead victim starts no clock. The kill itself once restarted the
       * very distress call killNpc had just silenced — a corpse filing its
       * own murder report — which the test suite caught on the first run. */
    } else if (!victim.distressAt) {
      victim.distressAt = t + distressDelayFor(victim);
      victim.distressKind = kind;
    } else if (BOUNTY[kind] > BOUNTY[victim.distressKind || 'assault']) {
      victim.distressKind = kind;   // the charge escalates with the act
    }
  }

  function witnessNear(sys, t, scene, victim, G) {
    var Sim = global.Sim;
    var ships = Sim.shipsAll(sys, t);
    for (var i = 0; i < ships.length; i++) {
      var s = ships[i];
      if (victim && (s.id === victim.id || (s.spec && s.spec === victim))) continue;
      if (s.kind === 'pirate') continue;                // pirates don't call the police
      if (V.dist(s.pos, scene) < WITNESS_RANGE) return s;
    }
    for (var j = 0; j < sys.bodies.length; j++) {
      var b = sys.bodies[j];
      if (b.kind !== 'station') continue;
      if (V.dist(Sim.bodyPosition(b, sys, t), scene) < WITNESS_RANGE) return b;
    }
    return null;
  }

  function report(G, kind, victim, hooks, how) {
    var fac = victim.faction || 'civil';
    G.wanted = G.wanted || {};
    G.wanted[fac] = (G.wanted[fac] || 0) + (BOUNTY[kind] || 300);
    if (hooks && hooks.say) {
      hooks.say('CRIME REPORTED (' + how + ') — bounty now ' +
                Math.round(G.wanted[fac]) + ' cr', 6);
    }
    if (hooks && hooks.sound) hooks.sound('warn');
  }

  function bountyTotal(G) {
    var sum = 0;
    for (var k in (G.wanted || {})) sum += G.wanted[k];
    return sum;
  }

  /* Wanted enough for this faction's police to act on it.
   *
   * Two ways to qualify. The accumulating bounty crossing WANTED_HUNT is
   * the old one — a career's worth of small offences eventually adds up.
   * Being FUGITIVE is the new one, and it is immediate: one unannounced
   * arrival makes this faction's patrols hostile and its doors shut, which
   * is the whole weight behind asking for clearance in the first place. */
  function wantedHere(G, faction) {
    if (G.fugitive && G.fugitive.faction === faction) return true;
    return ((G.wanted || {})[faction] || 0) >= WANTED_HUNT;
  }

  function dockRefused(G, port) {
    return port && port.faction && wantedHere(G, port.faction);
  }

  /* Paying a bounty off costs more than the bounty — fines, lawyers, and
   * the port's cut — and can only be done somewhere that will still let you
   * dock, which is the entire punishment. */
  function payBounty(G, faction) {
    var owed = (G.wanted || {})[faction] || 0;
    if (!owed) return 0;
    var cost = Math.round(owed * 1.6);
    if (G.ship.credits < cost) return -cost;
    G.ship.credits -= cost;
    delete G.wanted[faction];
    return cost;
  }

  /* ---- searches ----------------------------------------------------------
   * Sim.updateEncounters hands back a one-shot `scanNow` the instant a
   * police patrol has held alongside long enough to inspect you — no
   * player input needed, unlike a pirate's demand. This is where it is
   * actually resolved: is there a search at all, and if so, is anything
   * flagged aboard.
   *
   * Two independent rolls, on purpose. `sys.crimeScore` (buildGovernment,
   * generate.js) sets how likely the search itself is — a permissive
   * system's police wave most ships through, a strict one checks nearly
   * everyone. Whether contraband turns up is not a roll at all: it is
   * just whatever `Eco.BY_ID[cid].contraband` cargo is actually in the
   * hold. Crime permissivity governs getting CAUGHT, never what exists to
   * find — that would make a lucky roll retroactively legal, which is
   * backwards. */
  function resolveScan(G, spec, hooks) {
    var Economy = global.Economy;
    var sys = G.sys, ship = G.ship;
    var crime = (sys && sys.crimeScore !== undefined) ? sys.crimeScore : 40;
    var searchChance = Math.max(SEARCH_FLOOR, 1 - (crime / 100) * 0.85);

    if (Math.random() >= searchChance) {
      if (hooks && hooks.say) hooks.say(spec.name + ': routine hail — you are clear', 4);
      return { searched: false };
    }

    var found = [];
    for (var cid in ship.cargo) {
      var com = Economy.BY_ID[cid];
      if (com && com.contraband && ship.cargo[cid] > 1e-9) found.push(cid);
    }
    if (!found.length) {
      if (hooks && hooks.say) hooks.say(spec.name + ' scans your hold — nothing flagged, cleared', 5);
      if (hooks && hooks.sound) hooks.sound('click');
      return { searched: true, contraband: false };
    }

    var fine = 0, seized = [];
    found.forEach(function (cid) {
      var qty = ship.cargo[cid];
      fine += qty * SMUGGLING_FINE_PER_TONNE;
      seized.push(qty.toFixed(0) + 't ' + Economy.BY_ID[cid].name);
      delete ship.cargo[cid];
    });
    if (global.Sim) global.Sim.refreshShip(ship);
    fine = Math.round(fine);

    var fac = spec.faction || 'civil';
    G.wanted = G.wanted || {};
    G.wanted[fac] = (G.wanted[fac] || 0) + fine;
    // The faction remembers a smuggler the same way it remembers a blown
    // contract — bumpStanding lives in missions.js, which always loads
    // after combat.js, so it is only ever resolved here, at call time.
    if (global.Missions) global.Missions.bumpStanding(G, fac, -10);

    if (hooks && hooks.say) {
      hooks.say('CONTRABAND FOUND: ' + seized.join(', ') + ' seized — fined ' + fine + ' cr', 7);
    }
    if (hooks && hooks.sound) hooks.sound('warn');
    return { searched: true, contraband: true, fine: fine, seized: seized };
  }

  /* ---- dumping ----------------------------------------------------------
   * Throwing reactor waste out of the airlock instead of paying a
   * reprocessing plant to take it. This is the one jettison that is a
   * crime: ordinary cargo is your property and nobody cares where it ends
   * up, but waste is a liability you were PAID to accept, and dumping it
   * hands that liability to whoever lives downrange.
   *
   * It is a victimless crime in the sense crime() means — there is no ship
   * to squawk a distress call — so it cannot go through crime(). What it
   * shares is the witness test: `witnessNear` already answers "was anyone
   * in this patch of space", counting stations as well as ships, and that
   * is exactly the question. Being alone when you do it is the whole
   * defence.
   *
   * Two rolls, the same shape resolveScan uses. Whether anyone SEES it is
   * geometry and nothing else. Whether a witness bothers to REPORT it is
   * crimeScore: a permissive system's traffic looks the other way, a
   * strict one calls it in every time. Note what that makes the exploit
   * into — dumping is still viable, but only out in the dark, far from the
   * ports, which is a long way from the industrial worlds that pay you to
   * take the stuff. That is the same geography the honest disposal run
   * already trades on, which is the point: the shortcut now costs the
   * thing it was invented to avoid. */
  function dumping(sys, G, t, cid, tonnes, hooks) {
    var Economy = global.Economy;
    var com = Economy && Economy.BY_ID[cid];
    if (!com || !com.waste || !(tonnes > 0)) return null;

    var witness = witnessNear(sys, t, G.ship.pos, null, G);
    if (!witness) {
      /* Nobody saw it. The canister is still out there with your cargo on
       * it, which is why main.js marks it — evidence outlives the act. */
      if (hooks && hooks.say) {
        hooks.say(tonnes.toFixed(1) + 't of waste dumped — nobody out here saw it', 5);
      }
      return { witnessed: false, reported: false };
    }

    var crime = (sys && sys.crimeScore !== undefined) ? sys.crimeScore : 40;
    var reportChance = Math.max(REPORT_FLOOR, 1 - (crime / 100) * 0.85);
    var who = witness.name || 'a nearby ship';

    if (Math.random() >= reportChance) {
      if (hooks && hooks.say) {
        hooks.say(who + ' watched you dump ' + tonnes.toFixed(1) +
                  't of waste — and said nothing', 5);
      }
      return { witnessed: true, reported: false };
    }

    /* Whose bounty. A police cutter or a station IS the jurisdiction and
     * carries the right faction already; a passing freighter is not, it
     * merely calls someone. So a factionless witness falls through to
     * whoever holds this system rather than pinning the fine on the ship
     * that happened to be looking.
     *
     * witnessNear hands back a LIVE STATE for a ship (and the body itself
     * for a station); a live state carries no faction, so the spec behind
     * it is where to look. Missing that is why the fine first landed on
     * the system holder every time, including when a faction's own police
     * cutter was the one watching. */
    var fine = Math.round(tonnes * DUMPING_FINE_PER_TONNE);
    var fac = witness.faction ||
              (witness.spec && witness.spec.faction) ||
              (sys && sys.factions && sys.factions[0] && sys.factions[0].id) ||
              'civil';
    G.wanted = G.wanted || {};
    G.wanted[fac] = (G.wanted[fac] || 0) + fine;
    if (global.Missions) global.Missions.bumpStanding(G, fac, -12);

    if (hooks && hooks.say) {
      hooks.say('ILLEGAL DUMPING reported by ' + who + ' — bounty now ' +
                Math.round(G.wanted[fac]) + ' cr', 7);
    }
    if (hooks && hooks.sound) hooks.sound('warn');
    return { witnessed: true, reported: true, fine: fine, faction: fac };
  }

  /* ---- docking clearance -------------------------------------------------
   * Every port, orbital or on the ground, expects to be hailed before you
   * arrive. Open ground does not: setting down in the wilderness, away from
   * any pad, remains nobody's business and is deliberately still the way a
   * wanted pilot gets home. What changed is that USING A PORT is a thing you
   * are granted, not a thing you take.
   *
   * The gate is SOFT, on purpose. The clamps will still take you uncleared —
   * a station that physically refuses is a wall, and a wall cannot be played
   * against — but arriving unannounced is an offence, priced like any other,
   * and a permissive system will barely look up. That makes it a decision
   * with a cost rather than a door that is locked.
   *
   * Clearance does not expire on a clock. It is granted until you use it or
   * leave the system, which keeps the tension on WHETHER YOU ARE WELCOME
   * rather than on a countdown the player has to watch. */

  /* Flat, and deliberately not scaled by local tolerance any more. The
   * earlier version charged 390 cr in a strict system and 39 in a lawless
   * one, which made the frontier feel loose — but the consequence that
   * actually bites is now FUGITIVE status, not the money, and a headline
   * number that moves around is harder to learn than one that does not.
   * Local tolerance still decides how hard they chase you. */
  var UNCLEARED_FINE = 500;      // cr, flat
  var HOSTILE_STANDING = -40;    // matches Missions.standingLabel's 'HOSTILE'

  function portKey(port) {
    if (!port) return null;
    return typeof port === 'string' ? port : (port.id || null);
  }

  function isCleared(G, port) {
    var k = portKey(port);
    return !!(k && G.ship && G.ship.cleared && G.ship.cleared[k]);
  }

  /* Hail a port and ask. Returns { granted, reason, text } — the text is
   * what the port says back, because a refusal the player cannot read the
   * reason for is indistinguishable from a bug. */
  function requestClearance(G, port, hooks) {
    var k = portKey(port);
    if (!k) return { granted: false, reason: 'nobody', text: 'No one to hail.' };

    var name = port.name || 'Port control';
    var fac = port.faction || 'civil';
    var res;

    if (wantedHere(G, fac)) {
      /* The same bounty that already closed the station doors. It now
       * closes the ground ones too, which is the point of the change —
       * and is exactly why wilderness landing had to stay open. */
      res = { granted: false, reason: 'wanted',
              text: name + ': "You are wanted here. Clearance DENIED."' };
    } else if (((G.standing || {})[fac] || 0) <= HOSTILE_STANDING) {
      res = { granted: false, reason: 'hostile',
              text: name + ': "We know who you are. Clearance DENIED."' };
    } else {
      G.ship.cleared = G.ship.cleared || {};
      G.ship.cleared[k] = true;
      res = { granted: true, reason: null,
              text: name + ': "Clearance granted. Pad is yours."' };
    }

    if (hooks && hooks.say) hooks.say(res.text, 6);
    if (hooks && hooks.sound) hooks.sound(res.granted ? 'click' : 'warn');
    return res;
  }

  /* Called the moment a dock or a pad landing completes. Consumes the
   * clearance if there was one, and books the offence if there was not.
   * Returns null when everything was in order. */
  function arriveAtPort(G, port, hooks) {
    var k = portKey(port);
    if (!k) return null;

    if (isCleared(G, port)) {
      delete G.ship.cleared[k];      // spent: the next visit is a new ask
      return null;
    }

    var sys = G.sys;
    var fine = UNCLEARED_FINE;
    var fac = (port.faction) || (sys && sys.factions && sys.factions[0] &&
                                 sys.factions[0].id) || 'civil';

    G.wanted = G.wanted || {};
    G.wanted[fac] = (G.wanted[fac] || 0) + fine;
    if (global.Missions) global.Missions.bumpStanding(G, fac, -6);

    /* FUGITIVE. The money is the smaller half of this — a citation you can
     * simply not pay is not a consequence. What matters is that the
     * faction now wants you, and keeps wanting you until you settle it or
     * put a jump between yourself and them.
     *
     * Deliberately its own state rather than a number folded into
     * G.wanted: the bounty total is an accumulating score with a threshold
     * (WANTED_HUNT), and a single citation would sit harmlessly under it.
     * Fugitive is binary and immediate, which is what "you were seen
     * coming in through the back door" should feel like. */
    G.fugitive = {
      faction: fac,
      amount: fine,
      port: port.name || 'a port',
      sinceT: G.t
    };

    var name = port.name || 'Port control';
    if (hooks && hooks.say) {
      hooks.say(name + ': "Unannounced arrival. ' + fine +
                ' cr and you are logged FUGITIVE until it is settled."', 7);
    }
    if (hooks && hooks.sound) hooks.sound('warn');
    return { fine: fine, faction: fac, fugitive: true };
  }

  /* ---- launch clearance --------------------------------------------------
   * Getting OUT is its own request. Docking clearance is spent the moment
   * you arrive, and a port that has you sitting in a hangar behind closed
   * doors is entitled to an opinion about when those doors open again —
   * particularly if you have collected a bounty since you landed.
   *
   * Kept separate from `ship.cleared` rather than reusing it: the two are
   * asked for at different times, refused for different reasons, and
   * conflating them would mean a docking clearance quietly doubling as
   * permission to leave. */
  function requestLaunch(G, port, hooks) {
    var k = portKey(port);
    if (!k) return { granted: false, reason: 'nobody', text: 'No one to hail.' };
    var name = port.name || 'Port control';
    var fac = port.faction || 'civil';
    var res;

    if (wantedHere(G, fac)) {
      /* The doors are the point. Somewhere you have to answer for it is
       * exactly where a warrant should catch up with you. */
      res = { granted: false, reason: 'wanted',
              text: name + ': "Launch DENIED. You are wanted here — settle it first."' };
    } else if (((G.standing || {})[fac] || 0) <= HOSTILE_STANDING) {
      res = { granted: false, reason: 'hostile',
              text: name + ': "Launch DENIED. Wait for an escort."' };
    } else {
      G.ship.launchOk = k;
      res = { granted: true, reason: null,
              text: name + ': "Launch approved. Pad rising, doors opening."' };
    }
    if (hooks && hooks.say) hooks.say(res.text, 6);
    if (hooks && hooks.sound) hooks.sound(res.granted ? 'click' : 'warn');
    return res;
  }

  function launchCleared(G, port) {
    var k = portKey(port);
    return !!(k && G.ship && G.ship.launchOk === k);
  }

  /* Spent on the way out, the same way docking clearance is spent on the
   * way in — so coming back needs a fresh ask in both directions. */
  function spendLaunch(G) {
    if (G.ship) G.ship.launchOk = null;
  }

  /* Should this port's shaft doors be standing open right now?
   *
   * It reduces to "does the player hold a live permission for this port",
   * because both permissions are SPENT at the moment they are used:
   * docking clearance is consumed by arriveAtPort, launch clearance by
   * undocking. So the doors open when you are told to come ahead, shut
   * behind you once you are down, open again when you are cleared to
   * leave, and shut behind you once you are out — without any of that
   * being sequenced anywhere. The renderer only has to ease toward it.
   *
   * Lives here rather than in the renderer because it is a fact about the
   * world that the tests can ask about without a canvas. */
  function doorsOpen(G, port) {
    if (!port || !port.surface) return false;
    return isCleared(G, port) || launchCleared(G, port);
  }

  /* ---- fugitive status --------------------------------------------------
   * Two ways out, and only two: pay what you owe, or leave. Leaving is not
   * a loophole — it is the same bargain the whole crime system runs on,
   * where a jump buys you distance from people who care and nothing else.
   * The bounty itself stays on the books; it is the ACTIVE pursuit that
   * ends at the system boundary. */

  function isFugitive(G, faction) {
    if (!G.fugitive) return false;
    return faction ? G.fugitive.faction === faction : true;
  }

  /* Settle it. Costs the citation plus the same processing every bounty
   * pays, and can only be done somewhere that will still talk to you. */
  function payFugitive(G) {
    if (!G.fugitive) return 0;
    var fac = G.fugitive.faction;
    var owed = (G.wanted || {})[fac] || G.fugitive.amount;
    var cost = Math.round(owed * 1.2);
    if (G.ship.credits < cost) return -cost;
    G.ship.credits -= cost;
    if (G.wanted) delete G.wanted[fac];
    G.fugitive = null;
    return cost;
  }

  /* Called from the jump. Escaping clears the pursuit, not the record. */
  function fleeSystem(G) {
    var was = G.fugitive;
    G.fugitive = null;
    return was;
  }

  /* Clearances are local to a system and do not survive leaving it. Called
   * from the jump, alongside everything else that gets reset there. */
  function clearAllClearances(G) {
    if (G && G.ship) G.ship.cleared = {};
  }

  /* ---- shooting --------------------------------------------------------- */

  /* Everything the player's guns could currently hit: live encounter ships
   * plus rail traffic (which gets lifted the moment it is actually hit). */
  function targetsInRange(sys, G, t, range) {
    var Sim = global.Sim;
    var out = [];
    var ships = Sim.shipsAll(sys, t);
    for (var i = 0; i < ships.length; i++) {
      var s = ships[i];
      if (s.route && s.route.suppressed) continue;
      var d = V.dist(s.pos, G.ship.pos);
      if (d < range) out.push({ state: s, range: d });
    }
    return out;
  }

  function coneHit(from, fwd, target, range, dist) {
    if (dist > range || dist < 1e-6) return false;
    var dir = V.scale(V.sub(target, from), 1 / dist);
    var dot = V.dot(fwd, dir);
    return dot > Math.cos(AIM_CONE + Math.atan2(0.08, dist));
  }

  /* ---- fire groups --------------------------------------------------------
   * A hull with three hardpoints is not three guns, it is a LOADOUT, and the
   * shield model is what makes that a decision: a beam strips a shield and
   * struggles with armour, a pulse is the reverse. Carrying both is the
   * intended answer, so both have to be reachable inside the same fight
   * without opening a menu.
   *
   * Two groups, two SEPARATE triggers — not one trigger and a cycle key.
   * The whole point is to switch mid-burst, and a mode whose state you have
   * to remember is a mode you will get wrong while somebody is shooting at
   * you. A is the default for everything, so a ship that has never been to
   * the yard still fires all of it on the first trigger anyone finds.
   *
   * Membership is stored per SLOT KEY rather than per weapon id, because two
   * of the same gun in different hardpoints is exactly the case that wants
   * them split — and the id cannot tell them apart. */
  function groupMap(ship) {
    if (!ship.groups || typeof ship.groups !== 'object') ship.groups = {};
    return ship.groups;
  }

  function groupOf(ship, key) {
    return groupMap(ship)[key] === 'b' ? 'b' : 'a';
  }

  function setGroup(ship, key, g) {
    groupMap(ship)[key] = (g === 'b') ? 'b' : 'a';
    return groupOf(ship, key);
  }

  function toggleGroup(ship, key) {
    return setGroup(ship, key, groupOf(ship, key) === 'a' ? 'b' : 'a');
  }

  function gunsInGroup(ship, group) {
    var want = (group === 'b') ? 'b' : 'a';
    var list = fittedList(ship), out = [];
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      if (e.type !== 'hardpoint' || e.item.kind !== 'gun') continue;
      if (groupOf(ship, e.key) === want) out.push(e);
    }
    return out;
  }

  /* ---- where a beam actually comes from ----------------------------------
   * A beam used to be drawn from `ship.pos`, and in the cockpit that is
   * EIGHT CENTIMETRES BEHIND THE PILOT'S EYE (render.js EYE_FWD, with the
   * hull authored around the seat). Projecting a point that close to the
   * camera divides by a depth of roughly zero, so the origin flew off toward
   * infinity and the beam swept in sideways from the edge of the canopy.
   * From outside it merely looked like it left the middle of the hull, which
   * is why this survived as long as it did.
   *
   * So a muzzle is a real place on the hull, given in the SHIP'S OWN AXES
   * (x right, y up, z forward) in km. Two things follow:
   *
   *   - It is ahead of the eye, so it projects sanely from the seat.
   *   - It is an OFFSET, not a world point, so the renderer resolves it
   *     against the ship's CURRENT attitude every frame. The old frozen
   *     world point detached visibly — at 5.5 km/s the ship travels half a
   *     kilometre during a beam's 90 ms life and the beam stayed behind.
   *
   * Hardpoints alternate starboard and port and step outboard in pairs, so a
   * group firing together visibly converges on the target instead of drawing
   * one line several times over. The spread scales with the hull, cube root
   * because mass goes as volume — a Mule's guns sit wider than a Dart's.
   *
   * The LENGTH does not scale, and that is deliberate rather than lazy:
   * render.js draws every hull at one SHIP_LEN, so stretching the muzzles to
   * match a Mule's tonnage would hang them off a hull that is not there.
   * When the renderer draws hulls at their real sizes, HULL_LEN is the one
   * number that has to follow it. */
  /* These four were MEASURED by looking at it, not chosen on paper, and the
   * first set was wrong in a way only the seat could show. A muzzle 1.6 m
   * off the axis and 5.5 m ahead subtends 16 degrees from the pilot's eye —
   * against a 68-degree canopy that put the beam's origin a quarter of the
   * screen off-centre, so the shot still read as a slash across the view
   * rather than as two guns converging ahead of the nose.
   *
   * Further forward and closer in fixes it by arithmetic: 1.0 m out at 8.5 m
   * ahead is under 7 degrees, which sits just inside the canopy sill where
   * a gun on a small ship actually looks like it is. The guns are still far
   * enough apart to read as separate weapons converging, which is the whole
   * reason they are offset at all. */
  var HULL_LEN = 0.010;        // km — render.js SHIP_LEN, 10 m nose to tail
  var MUZZLE_FWD = 0.85;       // of hull length, ahead of the origin: the nose
  var MUZZLE_DOWN = 0.06;      // and slightly under the axis, where guns hang
  var MUZZLE_SPREAD = 0.10;    // half-span of the innermost pair

  /* Which hardpoint this is, counted in slot order — the same stable order
   * every fit is keyed against, so a gun does not change muzzle because
   * something was sold out of another slot. */
  function hardpointIndex(ship, key) {
    var keys = slotKeys(ship), n = 0;
    for (var i = 0; i < keys.length; i++) {
      if (slotType(keys[i]) !== 'hardpoint') continue;
      if (keys[i] === key) return n;
      n++;
    }
    return 0;
  }

  function muzzleOf(ship, key) {
    var n = hardpointIndex(ship, key);

    /* THE ART IS THE AUTHORITY. Every armed model carries a `laserEmitter`
     * node at the tip of each barrel, and glb2hulls now records them, so ask
     * the renderer where the guns on this hull actually are rather than
     * guessing. On the courier that is a symmetric pair of CHIN guns at the
     * nose, 81 cm under the axis — under the console, which is exactly where
     * a beam should appear to come from when you are sitting behind it, and
     * a place no set of hand-tuned constants was going to find by itself.
     *
     * More hardpoints than modelled guns is not an error: a Kestrel has
     * three and the courier hull has two barrels. The extra ones wrap round
     * and are nudged outboard, so they still read as separate weapons rather
     * than as two beams drawn exactly on top of each other. */
    var real = (global.Render && global.Render.shipMuzzles) ? global.Render.shipMuzzles() : null;
    if (real && real.length) {
      var m = real[n % real.length];
      var wrap = Math.floor(n / real.length);
      if (!wrap) return { r: m.r, u: m.u, f: m.f };
      return { r: m.r * (1 + 0.5 * wrap), u: m.u, f: m.f };
    }

    /* Fallback, for a hull whose model carries no guns — capitals and
     * escape pods today — and for any headless context with no renderer.
     * Derived from the hull rather than typed in: heavier is wider, cube
     * root because mass goes as volume. */
    var h = hullOf(ship);
    var girth = Math.min(1.5, Math.pow(((h && h.dryMass) || 42) / 42, 1 / 3));
    var side = (n % 2) ? -1 : 1;              // starboard first, then port
    var rank = 1 + Math.floor(n / 2) * 0.7;   // stepping outboard in pairs
    return { r: side * HULL_LEN * MUZZLE_SPREAD * girth * rank,
             u: -HULL_LEN * MUZZLE_DOWN,
             f: HULL_LEN * MUZZLE_FWD };
  }

  function muzzleWorld(ship, mz) {
    var p = V.clone(ship.pos);
    p = V.addScaled(p, ship.right, mz.r);
    p = V.addScaled(p, ship.up, mz.u);
    return V.addScaled(p, ship.fwd, mz.f);
  }

  /* One emitter, one shot. Split out of fireGun because a group fires
   * several of these in the same frame, and each one draws its own beam and
   * rolls its own range falloff — a group is not one bigger gun. */
  function fireOne(sys, G, t, gun, key, hooks) {
    var s = G.ship;
    var now = (typeof performance !== 'undefined' ? performance.now() : 0) / 1000;

    /* The muzzle moves where the beam is DRAWN from and nothing else. The
     * hit test below still runs from the ship's origin down its own nose,
     * because five metres of offset is meaningless against a 22 km envelope
     * and pretending otherwise would make each hardpoint a slightly
     * different weapon for no gain anybody could perceive. */
    var mz = muzzleOf(s, key);
    var beamEnd = V.addScaled(muzzleWorld(s, mz), s.fwd, gun.range);
    var hit = null, hitDist = Infinity;
    var cands = targetsInRange(sys, G, t, gun.range + 1);
    for (var i = 0; i < cands.length; i++) {
      var c = cands[i];
      if (coneHit(s.pos, s.fwd, c.state.pos, gun.range, c.range) && c.range < hitDist) {
        hit = c.state; hitDist = c.range;
      }
    }

    /* BOTH ENDS ARE LIVE, and that is not a refinement — it is the whole
     * correctness condition. Tracking the muzzle while leaving the far end
     * frozen where it was fired makes every beam still on screen stretch
     * into a ray as the ship flies on, and at 25x warp — where a 90 ms beam
     * spans three hundred kilometres of travel — the screen fills with a
     * fan of them. Freezing both ends instead is the old bug: the beam is
     * left behind the ship rather than leaving it.
     *
     * So: `muzzle` is an offset in the ship's axes, and the far end is
     * either the TARGET (resolved from its live position, so the line
     * follows what you are shooting) or simply `range` down the current
     * nose. `from` and `to` stay as the world points at the instant of
     * firing, for anything that wants a straight answer and as the fallback
     * once a target stops existing. */
    /* `variety` and `born` are for the renderer: a pulse is drawn as a bolt
     * that travels, an intermittent as a broken line, a beam as a solid one.
     * THE TRACER IS THE ONLY THING THAT MOVES. The weapon is still hitscan
     * and the damage above has already landed — a beam at combat ranges is
     * instantaneous and this game's whole weapon design rests on that, so
     * putting travel time in the picture must not put any in the physics.
     * The tracer is slow because a shot you cannot see is a shot that reads
     * as a broken gun, not because the shot is slow. */
    (G.beams = G.beams || []).push({
      from: muzzleWorld(s, mz), muzzle: mz, fromShip: true,
      to: hit ? V.clone(hit.pos) : beamEnd,
      target: hit || null, range: gun.range,
      variety: gun.variety || 'pulse', side: mz.r < 0 ? -1 : 1,
      color: gun.color, born: now, until: now + 0.42
    });

    /* The hull pays for the shot, and this is the line that finally gives
     * the heat sink something to absorb — the rack, the charges and addHeat
     * have all been built and tested with nothing generating heat.
     *
     * `heat` is a SUSTAINED rate in units per second, so one shot is worth
     * heat x cooldown. A weapon held down then costs exactly its catalogue
     * figure and a weapon fired in taps costs proportionally less, with no
     * second number to keep in step with the first. It is also what "apply
     * beam damage per tick, not per shot" means on the heat side: a beam is
     * already modelled as a very short cooldown, so its per-tick share falls
     * out of the same arithmetic.
     *
     * Through addHeat rather than ship.heat, so a live sink takes its cut
     * and the gun code never has to know sinks exist. */
    addHeat(G, (gun.heat || 0) * (gun.cooldown || 0));

    if (!hit) return null;
    var spec = hit.spec || liftTrader(sys, hit, t);
    /* The particle decides what actually arrives. A photon delivers its
     * whole load at any range it can reach; a pion that connects at the
     * edge of its envelope is barely worth the power it drew. */
    /* The gun goes through as the delivery, which is what finally makes
     * `vsShield` and `vsHull` mean something, and the muzzle goes through as
     * the direction so the flare lands on the side you actually shot. */
    if (spec) {
      damageNpc(sys, G, spec, damageAtRange(gun, hitDist), t, hooks,
                gun, muzzleWorld(s, mz));
    }
    return spec;
  }

  /* Cooldowns run on SIM time. In a real fight warp is pinned to 1x and the
   * two clocks agree; everywhere else — scripted playtests, any future warp
   * shenanigans — the weapon belongs to the world it fires in, not to the
   * wall clock. The BEAM's fade stays on real time, because a flash is for
   * the player's eyes.
   *
   * A cooldown is per SLOT, not per ship. Two guns in one group are two
   * triggers pulled at once; sharing one cooldown would have made a second
   * gun do nothing at all, which is the fitting equivalent of selling
   * somebody a module that silently has no effect. */
  function fireGroup(sys, G, t, group, hooks) {
    var s = G.ship;
    if (s.docked || s.landed) return 0;

    /* NOT UNDER TIME COMPRESSION. Cooldowns run on sim time — deliberately,
     * so a weapon belongs to the world it fires in — which at 500x means
     * every gun cycles every frame: sixty shots a second of real time, a
     * hull cooked in an instant, and five stale beams on screen at once
     * because each one lives 90 ms of REAL time while the ship crosses
     * three hundred kilometres. It also cannot be aimed: the cone test runs
     * against targets that jump hundreds of km between frames, so a hit is
     * luck rather than skill.
     *
     * The file already says "in a real fight warp is pinned to 1x". This is
     * that sentence enforced rather than assumed, and it is a refusal with
     * a reason rather than a trigger that quietly does something absurd. */
    if (G.warpIndex > 0) {
      if (hooks && hooks.say && t >= (G.warpFireAt || -Infinity) + 4) {
        G.warpFireAt = t;
        hooks.say('Not under time compression — press , to drop to 1x', 4);
      }
      return 0;
    }

    var guns = gunsInGroup(s, group);
    if (!guns.length) {
      /* Refusals carry reasons. Group B is empty on every ship that has
       * never been to the yard, and a trigger that does nothing at all is
       * indistinguishable from a broken trigger. Rate-limited because this
       * arrives from a key the player is HOLDING DOWN. */
      if (hooks && hooks.say && t >= (G.emptyGroupAt || -Infinity) + 4) {
        G.emptyGroupAt = t;
        hooks.say(fittedList(s).length
          ? 'Fire group ' + String(group).toUpperCase() +
            ' is empty — assign a gun to it in the yard (F5)'
          : 'No guns fitted', 4);
      }
      return 0;
    }

    var cools = G.gunCool = G.gunCool || {};
    var fired = 0;
    for (var i = 0; i < guns.length; i++) {
      var e = guns[i];
      if (t < (cools[e.key] || 0)) continue;
      cools[e.key] = t + e.item.cooldown;
      fireOne(sys, G, t, e.item, e.key, hooks);
      fired++;
    }
    /* One report for the volley. Three emitters cycling together should
     * sound like a ship firing, not like three ships. */
    if (fired && hooks && hooks.sound) hooks.sound('laser');
    return fired;
  }

  /* Everything written before groups existed pulls the primary trigger. */
  function fireGun(sys, G, t, hooks) { return fireGroup(sys, G, t, 'a', hooks); }

  /* The turret. Buyable disinterest: it picks the nearest thing that is
   * actively hostile and keeps hitting it, all round, no aiming, which is
   * exactly what you paid 5,600 credits not to have to do. */
  function updateTurret(sys, G, t, hooks) {
    var s = G.ship;
    if (!s.turret || s.docked || s.landed) return;
    var tur = TURRETS[s.turret];
    if (t < (G.turretCoolUntil || 0)) return;
    var now = (typeof performance !== 'undefined' ? performance.now() : 0) / 1000;

    var best = null, bestD = tur.range;
    var patrols = sys.patrols || [];
    for (var i = 0; i < patrols.length; i++) {
      var sp = patrols[i];
      if (!sp.live || !sp.hostileToPlayer || sp.dead) continue;
      var d = V.dist(sp.live.pos, s.pos);
      if (d < bestD) { best = sp; bestD = d; }
    }
    if (!best) return;
    G.turretCoolUntil = t + tur.cooldown;
    /* The turret sits on the spine, above the axis and further back than the
     * fixed guns — it traverses, so it wants to see all round rather than to
     * point down the nose. Same offset treatment as the hardpoints, and for
     * the same reason: from the seat, a beam leaving the ship's origin
     * leaves from behind your own head. */
    var turMz = { r: 0, u: HULL_LEN * 0.12, f: HULL_LEN * 0.18 };
    (G.beams = G.beams || []).push({
      from: muzzleWorld(s, turMz), muzzle: turMz, fromShip: true,
      to: V.clone(best.live.pos), target: best.live,
      color: tur.color, until: now + 0.07
    });
    if (hooks && hooks.sound) hooks.sound('turret');
    /* The turret is bolted to the same hull and its waste heat goes the same
     * place. It has carried a heat rating in the catalogue since it was
     * written; this is the line that spends it. Cheap enough (3/s against a
     * bare hull's 18/s shed) that it will never cook you on its own, which
     * is right — you paid 5,600 credits not to think about it. */
    addHeat(G, (tur.heat || 0) * (tur.cooldown || 0));
    damageNpc(sys, G, best, damageAtRange(tur, bestD), t, hooks, tur, s.pos);
  }

  /* ---- missiles ---------------------------------------------------------
   * A missile is a canister with an opinion: same integration idea, but its
   * thrust is a saturated pursuit command toward the target's current
   * position plus a first-order lead. Proximity-fused, finite fuel. */
  function fireMissile(sys, G, t, hooks) {
    var s = G.ship;
    if (!(s.missiles > 0) || s.docked || s.landed) {
      if (hooks && hooks.say) hooks.say(s.missiles > 0 ? 'Not now' : 'No missiles aboard', 2);
      return;
    }
    var target = null;
    if (G.navTarget && G.navTarget.kind === 'ship') {
      var patrols = sys.patrols || [];
      for (var i = 0; i < patrols.length; i++) {
        var sp = patrols[i];
        if (sp.dead) continue;
        if (sp.id === G.navTarget.id) { target = sp; break; }
      }
      if (!target) {
        // A rail trader: lift it so the missile has something real to chase.
        var ships = global.Sim.shipsAll(sys, t);
        for (var j = 0; j < ships.length; j++) {
          if (ships[j].id === G.navTarget.id) { target = liftTrader(sys, ships[j], t); break; }
        }
      }
    }
    if (!target || !target.live) {
      if (hooks && hooks.say) hooks.say('Missile needs a ship lock — [ ] a ship first', 3);
      return;
    }
    s.missiles--;
    var m = MISSILES.hawk;
    (sys.missiles = sys.missiles || []).push({
      pos: V.addScaled(s.pos, s.fwd, 0.06),
      vel: V.addScaled(s.vel, s.fwd, m.speed0),
      target: target, dmg: m.dmg, accel: m.accel,
      born: t, dies: t + m.life, fuse: m.fuse
    });
    /* Launching at someone is assault the moment the seeker goes hot. */
    crime(sys, G, t, 'assault', target, hooks);
    if (hooks && hooks.sound) hooks.sound('missile');
  }

  function updateMissiles(sys, G, t, dtSim, hooks) {
    var list = sys.missiles;
    if (!list || !list.length) return;
    var keep = [];
    for (var i = 0; i < list.length; i++) {
      var ms = list[i];
      var tgt = ms.target;
      if (t >= ms.dies || tgt.dead || !tgt.live) continue;    // fuel out, or nothing left to chase

      var left = Math.max(0, dtSim), guard = 0;
      var hitIt = false;
      while (left > 1e-9 && guard++ < 200) {
        var to = V.sub(tgt.live.pos, ms.pos);
        var d = V.len(to);
        if (d < ms.fuse) { hitIt = true; break; }

        /* Everything in the RELATIVE frame. The first version led the
         * target with its absolute velocity — which in orbit is forty
         * kilometres a second of planet-going-round-star that the missile
         * shares — and aimed the seeker eight hundred kilometres up-orbit
         * of a target six kilometres away. Lead is relative position plus
         * relative velocity times time-to-go, nothing else. */
        var relVel = V.sub(tgt.live.vel, ms.vel);
        var relSpeed = V.len(relVel);
        var tGo = Math.min(25, d / Math.max(0.05, relSpeed));
        var cmd = V.norm(V.addScaled(to, relVel, tGo));

        /* Substep small enough that one step cannot fly through the fuse. */
        var h = Math.min(left, 0.5, Math.max(0.02, d / Math.max(0.2, relSpeed) * 0.4));
        ms.vel = V.addScaled(ms.vel, cmd, ms.accel * h);
        ms.pos = V.addScaled(ms.pos, ms.vel, h);
        left -= h;
      }
      if (hitIt || V.dist(tgt.live.pos, ms.pos) < ms.fuse) {
        (G.explosions = G.explosions || []).push({
          pos: V.clone(ms.pos),
          at: (typeof performance !== 'undefined' ? performance.now() : 0), size: 1.2
        });
        /* No delivery and no direction: a warhead has no variety, and it goes
         * off ON the hull rather than arriving from anywhere. Both arguments
         * are optional precisely so this line does not have to lie. */
        damageNpc(sys, G, tgt, ms.dmg, t, hooks);
        if (hooks && hooks.sound) hooks.sound('explosion');
        continue;
      }
      keep.push(ms);
    }
    sys.missiles = keep;
  }

  /* ---- NPCs shooting back ----------------------------------------------
   * Abstract hitscan rather than simulated bolts: every cooldown, an armed
   * hostile in range rolls against a hit chance that falls with range and
   * with how fast the player is crossing its sights. Dodging is therefore
   * real — thrust hard sideways and you are measurably harder to hit — but
   * nobody is asked to dogfight the frame timer. */
  function updateNpcFire(sys, G, t, dtSim, hooks) {
    var s = G.ship;
    if (s.docked || s.landed) return;
    var patrols = sys.patrols || [];
    var now = (typeof performance !== 'undefined' ? performance.now() : 0) / 1000;

    for (var i = 0; i < patrols.length; i++) {
      var sp = patrols[i];
      if (!sp.live || sp.dead) continue;
      /* Two ways to be shooting at the player: hunting them, or being
       * robbed by them. The second is new — a merchantman that fires
       * while it runs. */
      if (!sp.hostileToPlayer && !sp.defending) continue;
      if (!isArmedNpc(sp)) continue;                    // shuttles carry nothing

      var gun = (sp.kind === 'trader' || sp.defending) ? TRADER_GUN : NPC_GUN;
      var d = V.dist(sp.live.pos, s.pos);
      if (d > gun.range) continue;
      if (t < (sp.coolUntil || 0)) continue;
      sp.coolUntil = t + gun.cooldown;

      var transverse = V.len(V.sub(s.vel, sp.live.vel));
      var chance = Math.max(0.12, Math.min(0.85,
        1.0 - d / gun.range * 0.5 - transverse * 1.4));
      (G.beams = G.beams || []).push({
        from: V.clone(sp.live.pos), to: V.clone(s.pos),
        color: gun === TRADER_GUN ? '#ffc46b' : '#ff8a76',
        until: now + 0.07, miss: Math.random() > chance
      });
      if (Math.random() < chance) {
        damagePlayer(G, gun.dmg, hooks, gun, V.clone(sp.live.pos));
      }
      else if (hooks && hooks.sound) hooks.sound('nearMiss');
    }
  }

  /* ---- the per-frame tick ----------------------------------------------- */
  function update(sys, G, t, dtSim, hooks) {
    initShip(G.ship);

    // Shield regen, once things have been quiet for a moment.
    var s = G.ship;
    if (s.shield && s.shieldHp < MODULES.shield.cap) {
      var nowMs = (typeof performance !== 'undefined' ? performance.now() : 0);
      if (nowMs - (s.lastHitAt || 0) > MODULES.shield.regenDelay * 1000) {
        s.shieldHp = Math.min(MODULES.shield.cap, s.shieldHp + MODULES.shield.regen * dtSim);
      }
    }
    /* And the same for everyone else, off the same two numbers, so there is
     * one shield in this game with two owners rather than two shields.
     * Cheap: it runs only over specs that have already been shot at, since
     * shieldMax is undefined until npcShield is called and npcShield is only
     * called by damageNpc. A sky full of ships nobody has fired on costs one
     * `undefined` test each. */
    var pats = sys.patrols || [];
    for (var rg = 0; rg < pats.length; rg++) {
      var rs = pats[rg];
      if (rs.dead || !(rs.shieldMax > 0)) continue;
      if (rs.shieldHp >= rs.shieldMax) continue;
      if (t < (rs.shieldIdleAt || 0)) continue;
      rs.shieldHp = Math.min(rs.shieldMax,
                             rs.shieldHp + MODULES.shield.regen * dtSim);
    }

    /* Player triggers: HELD, each weapon respecting its own cooldown.
     *
     * Two sources, or'd together, because they are the same trigger reached
     * two ways. On the keyboard, Shift splits Space between the groups
     * exactly as it already splits G (grid / gear), T (dock / match) and /
     * (flight mode / assist) — every letter was spoken for long before
     * weapons wanted a second one, and a modifier on a trigger you already
     * know beats a new letter you have to learn. On the mouse, main.js sets
     * G.trigger from the buttons in mouse-aim mode.
     *
     * Both groups can be held at once, and that is allowed rather than
     * merely tolerated: a beam group stripping the shield while a pulse
     * group works the hull is the loadout the shield model was built to
     * reward, and forbidding it here would quietly delete that build. */
    if (G.panel === 0) {
      var trig = G.trigger || {};
      var spaceHeld = !!G.keys[' '];
      /* The latch is a press that has not yet been seen by a frame. Read it
       * once and clear it, so a click too short to span a frame still fires
       * exactly one volley instead of none. */
      var wantA = trig.a || trig.aLatch || (spaceHeld && !G.keys.shift);
      var wantB = trig.b || trig.bLatch || (spaceHeld && G.keys.shift);
      trig.aLatch = false; trig.bLatch = false;
      if (wantA) fireGroup(sys, G, t, 'a', hooks);
      if (wantB) fireGroup(sys, G, t, 'b', hooks);
    }
    updateSink(G, t, hooks);
    updateTurret(sys, G, t, hooks);
    updateMissiles(sys, G, t, dtSim, hooks);
    updateNpcFire(sys, G, t, dtSim, hooks);

    // Distress calls that were started and never silenced.
    var patrols = sys.patrols || [];
    for (var i = patrols.length - 1; i >= 0; i--) {
      var sp = patrols[i];
      if (sp.dead) { patrols.splice(i, 1); sys._ships = null; continue; }
      if (sp.distressAt && t >= sp.distressAt) {
        report(G, sp.distressKind || 'assault', sp, hooks, 'distress call');
        sp.reported = sp.distressKind;
        sp.distressAt = null;
      }
      /* A pirate whose demand goes unanswered runs out of patience. Thirty
       * seconds of stalling is exactly long enough to have been trying to
       * escape, which is what most people who stall are doing. */
      if (sp.kind === 'pirate' && sp.mode === 'demand' && sp.modeSince > 30 &&
          !sp.hostileToPlayer) {
        sp.hostileToPlayer = true;
        sp.mode = 'attack';
        sp.demanding = false;
        if (hooks && hooks.say) hooks.say(sp.name + ' is done asking.', 5);
      }
      /* Police with a warrant do not inspect; they engage. */
      if (sp.kind === 'police' && sp.live && wantedHere(G, sp.faction) && !sp.hostileToPlayer) {
        sp.hostileToPlayer = true;
        sp.mode = 'attack';
        if (hooks && hooks.say) hooks.say(sp.name + ': "You are wanted. Cut thrust or be fired on."', 6);
      }
    }
    reapLifted(sys);

    // Old light fades.
    var nowS = (typeof performance !== 'undefined' ? performance.now() : 0) / 1000;
    if (G.beams) G.beams = G.beams.filter(function (b) { return b.until > nowS; });
    if (G.explosions) {
      var nowMs2 = nowS * 1000;
      G.explosions = G.explosions.filter(function (e) { return nowMs2 - e.at < 900; });
    }
  }

  /* ---- piracy, from the player's side of the gun ------------------------ */
  function demandFrom(sys, G, t, contactState, what, hooks) {
    var s = G.ship;
    var spec = contactState.spec || liftTrader(sys, contactState, t);
    if (!spec) { if (hooks && hooks.say) hooks.say('No answer.', 3); return; }

    var armedThreat = !!s.gun || s.missiles > 0;
    var range = V.dist((spec.live ? spec.live.pos : contactState.pos), s.pos);
    if (range > 60) {
      if (hooks && hooks.say) hooks.say('Too far out to sound like a threat — close to under 60 km', 4);
      return;
    }

    /* The act itself is the crime, comply or not. Witnesses at the scene
     * report now; otherwise the victim's ten-second clock starts. */
    crime(sys, G, t, 'demand', spec, hooks);

    if (spec.kind === 'pirate') {
      if (hooks && hooks.say) hooks.say(spec.name + ' laughs on an open channel.', 4);
      spec.hostileToPlayer = true; spec.mode = 'attack';
      return;
    }
    if (spec.kind === 'police' || spec.kind === 'merc' || spec.kind === 'navy') {
      if (hooks && hooks.say) hooks.say(spec.name + ': "Wrong ship." Weapons hot.', 4);
      spec.hostileToPlayer = true; spec.mode = 'attack';
      return;
    }
    if (!armedThreat) {
      if (hooks && hooks.say) hooks.say(spec.name + ' scans you, finds no guns, and ignores you.', 4);
      spec.mode = 'breakoff';
      return;
    }

    /* A trader with a gun on it complies, resentfully — and a ship that has
     * already complied has nothing more to comply WITH. Both branches below
     * take from a store and leave it emptier, rather than reading a pure
     * function that cheerfully answers the same thing forever. That was not
     * a rounding error: a torn-out freighter paid its whole purse on every
     * demand, so one successful interdiction was an infinite bank and the
     * rest of the economy became optional. */
    if (what === 'cargo') {
      /* The same read point killNpc uses. Robbing a pirate alive and then
       * shooting it used to disagree about what it had aboard, because only
       * the death path ever invented a manifest. */
      var man = holdOf(sys, spec);
      var gave = 0;
      for (var i = 0; i < man.length && gave < 2; i++) {
        var amount = man[i] && (man[i].qty || man[i].tonnes) || 0;
        if (!(amount > 0)) continue;
        /* A third of the hold, and THE LOT once a third stops being worth
         * arguing about. Without that last clause the round-up floor of one
         * tonne is never reached from above and the ship dribbles a canister
         * a demand forever — the cargo version of the purse bug, arrived at
         * by a different route. A ship down to its last couple of tonnes
         * hands them over; nobody haggles at gunpoint over one tonne. */
        var taken = Math.max(1, Math.round(amount * 0.35));
        if (amount - taken < 2) taken = amount;
        var fake = { pos: spec.live ? spec.live.pos : contactState.pos,
                     vel: spec.live ? spec.live.vel : contactState.vel,
                     fwd: { x: 0.3, y: 0.7, z: 0.2 } };
        global.Sim.dropCanister(sys, fake, man[i].cid, taken, t);
        /* WRITTEN BACK. What it dumped is off the manifest, so a second
         * demand takes a third of what is LEFT and the ship runs dry after a
         * few — and so that killing it afterwards spills the remainder
         * rather than the load it started with. The hold is one number and
         * every path that touches it now agrees. */
        if (man[i].qty !== undefined) man[i].qty -= taken;
        else man[i].tonnes = amount - taken;
        gave++;
      }
      /* Empty lines are dropped rather than left as zeroes, so "running
       * empty" is a real answer instead of a list of nothings. */
      for (var z = man.length - 1; z >= 0; z--) {
        if (!((man[z].qty || man[z].tonnes) > 0)) man.splice(z, 1);
      }
      /* And the drained hold is OWNED, on the spec, whichever list it came
       * off. A lifted trader's manifest lives on `spec.live`, which goes
       * away the moment the ship sleeps — parking the emptied array here is
       * what stops "I robbed you" from being forgotten by a nap. */
      spec.manifest = man;
      if (hooks && hooks.say) {
        hooks.say(gave ? spec.name + ' dumps cargo and runs — scoop it before it drifts'
                       : spec.name + ' is running empty. Nothing to take.', 5);
      }
    } else {
      var cash = purseOf(sys, spec);
      if (cash > 0) {
        spec.purse = 0;
        s.credits += cash;
        if (hooks && hooks.say) hooks.say(spec.name + ' transfers ' + cash + ' cr and runs.', 5);
      } else if (hooks && hooks.say) {
        /* Named as a second visit rather than as a refusal, because it is
         * not one — the ship is not defying you, it is broke. A player who
         * has just been paid should be told the well is dry, not left
         * clicking a button that silently does nothing. */
        hooks.say(spec.name + ' has already emptied its account. There is nothing left.', 5);
      }
    }
    spec.mode = 'breakoff';
  }

  /* ---- what a port will sell you -----------------------------------------
   * Two axes, and they pull against each other. Both are already generated
   * — no new scale to keep in sync with anything.
   *
   *   port.market.dev   0..1, which generate.js calls in as many words
   *                     "this game's tech level under another name"
   *   sys.crimeScore    0..100, the number the contraband and scan code
   *                     already reads
   *
   * DEVELOPMENT GATES POWER. STANDING GATES ACCESS. CRIME OPENS A BACK DOOR.
   *
   * A developed port has the heavy classes and will not sell them to a
   * stranger; a lawful one will not sell weapons at all to someone it
   * wants. A high-crime port sells to anybody, asks nothing, and what it
   * has is junk. So the best gear needs you to be LIKED somewhere
   * developed, and being liked is exactly what a career of piracy costs —
   * which is the same bargain the rest of the crime system already runs on.
   *
   * Returns every catalogue item with a verdict, INCLUDING the ones you
   * cannot have, because "requires WARM standing with Halden Combine"
   * reads as a goal and a missing row reads as a bug. */
  function stockAt(G, port) {
    var out = [];
    if (!port) return out;
    var dev = (port.market && typeof port.market.dev === 'number')
      ? port.market.dev : 0.25;
    var sys = G.sys;
    var crime = (sys && sys.crimeScore !== undefined) ? sys.crimeScore : 40;
    var fac = port.faction || 'civil';
    var standing = (G.standing || {})[fac] || 0;
    var hot = wantedHere(G, fac);
    var facName = (sys && sys.factions || []).filter(function (f) {
      return f.id === fac;
    })[0];
    facName = (facName && facName.name) || 'the locals';

    for (var id in EQUIPMENT) {
      var it = EQUIPMENT[id];
      var verdict = null;

      if (it.grey) {
        /* Grey-market goods exist only where nobody is checking. */
        if (crime < (it.minCrime || 0)) continue;      // not stocked at all here
      } else {
        if (dev < (it.minDev || 0)) continue;          // this port is too small
        var armed = it.kind === 'gun' || it.kind === 'turret';
        if (hot && armed) {
          verdict = 'they will not arm someone they want';
        } else if (standing < (it.minStanding || -100)) {
          var band = global.Missions
            ? global.Missions.standingLabel(it.minStanding).toUpperCase()
            : (it.minStanding + '+');
          verdict = 'needs ' + band + ' standing with ' + facName;
        }
      }
      out.push({ item: it, available: !verdict, why: verdict });
    }

    out.sort(function (a, b) {
      var sa = SLOT_ORDER.indexOf(a.item.slot), sb = SLOT_ORDER.indexOf(b.item.slot);
      if (sa !== sb) return sa - sb;
      return (a.item.price || 0) - (b.item.price || 0);
    });
    return out;
  }

  /* ---- money: repair, outfitting, hulls --------------------------------- */

  /* A blown console screen is part of the damage, so it is part of the
   * bill. 240 credits a panel: enough to notice on a bad day, never enough
   * to strand you — the thing that strands you is the hull. */
  var PANEL_REPAIR = 240;

  function deadPanelCount(G) {
    var n = 0, d = (G && G.deadPanels) || {};
    for (var k in d) if (d[k]) n++;
    return n;
  }

  function repairCost(ship, G) {
    return Math.round((ship.hullMax - ship.hullHp) * 9) + deadPanelCount(G) * PANEL_REPAIR;
  }

  function repair(G) {
    var cost = repairCost(G.ship, G);
    if (!cost) return 0;
    if (G.ship.credits < cost) return -cost;
    G.ship.credits -= cost;
    G.ship.hullHp = G.ship.hullMax;
    G.deadPanels = {};                 // the screens come back with the hull
    G.hullWarned = false;
    return cost;
  }

  /* Buy a catalogue item straight into a slot. Returns a result object with
   * a reason, which is what the yard wants; buyOutfit below keeps the older
   * numeric contract for everything that already calls it. */
  function buyEquipment(G, id, key) {
    var s = G.ship, item = EQUIPMENT[id];
    if (!item) return { ok: false, why: 'no such equipment' };
    if (s.credits < item.price) {
      return { ok: false, why: 'need ' + item.price + ' cr', short: item.price - s.credits };
    }
    var v = fitItem(s, id, key);
    if (!v.ok) return v;
    s.credits -= item.price;
    return { ok: true, key: v.key, cost: item.price, item: item };
  }

  /* The original signature, preserved. Positive = bought at that price,
   * negative = you are short by that much, null = the purchase makes no
   * sense. Money is still tested before fit so "you cannot afford it" stays
   * the answer it always was. */
  function buyOutfit(G, kind, id) {
    var s = G.ship, item, ok = true;
    if (kind === 'gun') { item = GUNS[id]; ok = !!item && s.gun !== item.id; }
    else if (kind === 'turret') { item = TURRETS[id]; ok = !!item && s.turret !== id; }
    else if (kind === 'shield') { item = MODULES.shield; ok = !s.shield; }
    else if (kind === 'heatshield') { item = MODULES.heatshield; ok = !s.heatshield; }
    else if (kind === 'missile') {
      item = MISSILES[id]; ok = !!item && s.missiles < item.rack;
    }
    else if (kind === 'sink') {
      /* Charges need the launcher, the way seekers would need a rack if
       * seekers had one yet. */
      var rack = sinkRackSize(s);
      item = SINK; ok = rack > 0 && s.sinks < rack;
    }
    if (!item || !ok) return null;
    if (s.credits < item.price) return -item.price;

    if (kind === 'missile') { s.credits -= item.price; s.missiles++; return item.price; }
    if (kind === 'sink') { s.credits -= item.price; s.sinks++; return item.price; }

    /* A gun replaces whatever is in the first hardpoint, which is what the
     * old one-gun-at-a-time shop meant by "buying a gun". Anything else
     * takes the first free slot of its type. */
    var key = null;
    if (kind === 'gun') key = slotKeys(s).filter(function (k) {
      return slotType(k) === 'hardpoint';
    })[0] || null;

    var res = buyEquipment(G, item.id, key);
    if (!res.ok) return null;
    return res.cost;
  }

  /* Buying a hull. Trade-in at 70% of list, everything portable moves
   * across, and the deal is refused rather than allowed to strand cargo:
   * sell down to the new hold first. */
  function buyHull(G, hullId) {
    var s = G.ship;
    var to = HULLS[hullId], from = HULLS[s.hullId || 'talon'];
    if (!to || to.id === s.hullId) return { ok: false, why: 'already flying one' };
    var cost = to.price - Math.round(from.price * 0.7);
    if (cost > 0 && s.credits < cost) return { ok: false, why: 'need ' + cost + ' cr' };
    if (global.Sim.cargoMass(s) > to.cargoCap) {
      return { ok: false, why: 'hold too small for your cargo — sell some first' };
    }
    /* And the same refusal for the fit. Silently dropping a Class 3 laser
     * because you downsized is the worst possible outcome — worse than the
     * sale simply not happening, because the player does not find out until
     * the next fight. Same shape as the cargo refusal above: sell it down
     * yourself, deliberately, first. */
    var moved = replanFit(s, to);
    if (!moved.ok) return { ok: false, why: moved.why };
    s.credits -= cost;             // negative cost = they pay you the difference
    s.hullId = to.id;
    s.dryMass = to.dryMass;
    s.thrustKN = to.thrustKN;
    s.thrusterCap = to.thrusterCap;
    s.thrusterFuel = Math.min(s.thrusterFuel, to.thrusterCap);
    s.fuelCap = to.fuelCap;
    s.fuel = Math.min(s.fuel, to.fuelCap);
    s.cargoCap = to.cargoCap;
    s.hullMax = to.hullMax;
    s.hullHp = to.hullMax;         // a new hull arrives whole
    s.fit = moved.fit;             // the gear came across, replanned
    remapGroups(s, moved.moved);   // and so did which trigger it answers to
    syncLegacy(s);
    global.Sim.refreshShip(s);
    return { ok: true, cost: cost };
  }

  /* ---- death ------------------------------------------------------------ */
  /* The hull is gone; the pilot is not. Cargo and fitted upgrades were part
   * of the hull. Credits, standing and warrants are part of you. */
  function stripForRespawn(ship) {
    ship.cargo = {};
    ship.fit = { hardpoint0: 'phpulse' };   // the gear was part of the hull
    ship.groups = {};                       // and so were the trigger assignments
    ship.gun = 'phpulse';
    ship.turret = null;
    ship.shield = null;
    ship.shieldHp = 0;
    ship.heatshield = null;
    ship.heatShed = 0;
    ship.missiles = 0;
    ship.sinks = 0;
    ship.hullId = 'talon';
    var h = HULLS.talon;
    ship.dryMass = h.dryMass; ship.thrustKN = h.thrustKN;
    ship.thrusterCap = h.thrusterCap; ship.fuelCap = h.fuelCap;
    ship.cargoCap = h.cargoCap;
    ship.hullMax = h.hullMax; ship.hullHp = h.hullMax;
    global.Sim.refreshShip(ship);
  }

  var Combat = {
    GUNS: GUNS, TURRETS: TURRETS, MODULES: MODULES, MISSILES: MISSILES,
    HULLS: HULLS,
    EQUIPMENT: EQUIPMENT, LEGACY_GUN: LEGACY_GUN,
    SLOT_ORDER: SLOT_ORDER, SLOT_LABEL: SLOT_LABEL, RESALE: RESALE,
    LASER_DELIVERY: LASER_DELIVERY, PARTICLE: PARTICLE,
    damageAtRange: damageAtRange,
    slotKeys: slotKeys, slotType: slotType, firstFreeSlot: firstFreeSlot,
    fittedList: fittedList, fitSummary: fitSummary, canFit: canFit,
    fitItem: fitItem, unfitItem: unfitItem, sellFitted: sellFitted,
    syncLegacy: syncLegacy, migrateFit: migrateFit, replanFit: replanFit,
    buyEquipment: buyEquipment, stockAt: stockAt,
    SINK: SINK, sinkRackSize: sinkRackSize, armSink: armSink,
    scanLevel: scanLevel, scanShip: scanShip,
    addHeat: addHeat, updateSink: updateSink,
    WITNESS_RANGE: WITNESS_RANGE, DISTRESS_DELAY: DISTRESS_DELAY,
    TRADER_GUN: TRADER_GUN, NPC_GUN: NPC_GUN,
    UNARMED_CLASSES: UNARMED_CLASSES,
    DISTRESS_DELAY_ARMED: DISTRESS_DELAY_ARMED,
    DISTRESS_DELAY_CIVIL: DISTRESS_DELAY_CIVIL,
    isArmedNpc: isArmedNpc, distressDelayFor: distressDelayFor,
    WANTED_HUNT: WANTED_HUNT, BOUNTY: BOUNTY, ATTACK_STANDOFF: ATTACK_STANDOFF,
    SMUGGLING_FINE_PER_TONNE: SMUGGLING_FINE_PER_TONNE, SEARCH_FLOOR: SEARCH_FLOOR,
    DUMPING_FINE_PER_TONNE: DUMPING_FINE_PER_TONNE, REPORT_FLOOR: REPORT_FLOOR,
    resolveScan: resolveScan,
    dumping: dumping,
    isCleared: isCleared,
    requestClearance: requestClearance,
    arriveAtPort: arriveAtPort,
    clearAllClearances: clearAllClearances,
    requestLaunch: requestLaunch,
    launchCleared: launchCleared,
    spendLaunch: spendLaunch,
    doorsOpen: doorsOpen,
    isFugitive: isFugitive,
    payFugitive: payFugitive,
    fleeSystem: fleeSystem,
    UNCLEARED_FINE: UNCLEARED_FINE,
    initShip: initShip, npcHull: npcHull,
    update: update,
    fireGun: fireGun, fireGroup: fireGroup, fireMissile: fireMissile,
    groupOf: groupOf, setGroup: setGroup, toggleGroup: toggleGroup,
    gunsInGroup: gunsInGroup,
    muzzleOf: muzzleOf, muzzleWorld: muzzleWorld, HULL_LEN: HULL_LEN,
    manifestFor: manifestFor, holdOf: holdOf, purseOf: purseOf,
    npcShield: npcShield, splitDamage: splitDamage, hullSize: hullSize,
    NPC_SHIELD: NPC_SHIELD, MAX_IMPACTS: MAX_IMPACTS,
    damageNpc: damageNpc, damagePlayer: damagePlayer, killNpc: killNpc,
    liftTrader: liftTrader,
    crime: crime, witnessNear: witnessNear,
    bountyTotal: bountyTotal, wantedHere: wantedHere,
    dockRefused: dockRefused, payBounty: payBounty,
    demandFrom: demandFrom,
    repairCost: repairCost, repair: repair, deadPanelCount: deadPanelCount,
    buyOutfit: buyOutfit, buyHull: buyHull,
    stripForRespawn: stripForRespawn
  };

  global.Combat = Combat;
  if (typeof module !== 'undefined' && module.exports) module.exports = Combat;
})(typeof window !== 'undefined' ? window : globalThis);
