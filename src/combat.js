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

  /* SYNDICATE_TRUST is the one number "high enough up with the Syndicate"
   * means everywhere it means anything. Past this standing with `outlaw`
   * you stop paying witnesses (see INTIMIDATE_STANDING below, which is
   * this same constant under its older name) and their own quartermaster
   * will sell you what their own enforcement wing carries. One threshold,
   * because it is one fact about you — the Syndicate has decided you are
   * inside rather than a customer — not two coincidentally equal ones. */
  var SYNDICATE_TRUST = 70;

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
                   'If it is still there after four seconds, check your aim — not the gun.'),

    /* ---- THE GREY MARKET ------------------------------------------------
     * Stocked where somebody can be bought (corruption >= 60, see stockAt),
     * sold to anyone, and built by people who were not being watched.
     *
     * THE RULE THESE HAD TO SATISFY, and it is the one that kept the
     * catalogue empty for so long: a drawback must be a TRADEOFF, not a
     * smaller number. A gun that costs 65% as much and does 65% as much is
     * not a decision, it is a longer route to the same place. So the grey
     * versions keep their damage, their cooldown and very nearly their
     * reach — what they cost you is HEAT and CERTAINTY.
     *
     * Both of those are things the player can already fly around. Heat has
     * sinks, a shed rate and a discipline; a gun that runs at twice the
     * thermal load is a real weapon in the hands of someone who paces their
     * bursts and a liability in the hands of someone who holds the trigger.
     * That makes buying one a statement about how you fly, which is the
     * only kind of purchase worth putting in a shop.
     *
     * And the geography does the rest. The best gear needs to be LIKED
     * somewhere developed, and being liked is exactly what a career of
     * piracy costs. Go outlaw and you can still arm yourself — never
     * well. */
    greyphint: greyGun(
      laser('greyphint', 'Bootleg intermittent laser', 'photon', 'intermittent',
            1105, 2.4, 2.4, 13, 1.00, 24, 8, '#d08a5c', [0, -100, 0, true],
            'Same thirteen points as the certified one. Runs twice as hot ' +
            'and sometimes just does not.'),
      { minCorrupt: 60, misfire: 0.06 }),

    greypipulse: greyGun(
      laser('greypipulse', 'Salvaged pion accelerator', 'pion', 'pulse',
            1870, 4.2, 4.0, 20, 0.40, 10, 11, '#9a7ab8', [0, -100, 0, true],
            'Twenty points off a wreck, at a bit over half list. It will ' +
            'cook you and it will let you down, and it is still twenty points.'),
      { minCorrupt: 60, misfire: 0.09 }),

    /* ---- SYNDICATE ISSUE --------------------------------------------------
     * Not the grey market. The grey market is what somebody bolts together
     * out of a wreck and sells to a stranger — same damage, worse heat, a
     * real chance it just does not fire. This is the opposite trade: the
     * genuine muon-tier accelerator, at muon-tier reliability, sold by
     * people who do not stock inventory they would be embarrassed to carry
     * themselves.
     *
     * What it costs is not heat or certainty, it is TRUST. The legitimate
     * path to a muon beam runs through a major faction's good opinion of
     * you (minStanding 40, see mubeam) — closed, in practice, to anyone
     * who has spent a career burning that goodwill. The Syndicate opens a
     * second path with the same ceiling: get far enough inside THEM
     * instead, at SYNDICATE_TRUST, and their quartermaster sells you the
     * same accelerator their own enforcement wing carries (see
     * SYNDICATE_GUN, below, and buildPatrols in generate.js). Two
     * reputations, one gun at the top of each.
     *
     * `syndicate: true` puts this on its own gate in stockAt: stocked only
     * at a port the Syndicate itself holds, checked against standing with
     * `outlaw` specifically rather than whoever happens to run the port
     * you are standing in. */
    syndbeam: syndicateGun(
      laser('syndbeam', 'Syndicate-issue beam accelerator', 'muon', 'beam',
            44000, 13.0, 9.0, 9, 0.16, 46, 45, '#c86bff', [0, -100],
            'The same gun the enforcement wing flies. Nobody asks where ' +
            'the serial numbers went.'),
      { minStanding: SYNDICATE_TRUST })
  };

  /* Ordinary catalogue item, minus the legitimate-standing gate `laser`
   * would otherwise set — stockAt's `syndicate` branch checks standing
   * with `outlaw` on its own terms, not the port's nominal minStanding. */
  function syndicateGun(item, opts) {
    item.syndicate = true;
    item.minStanding = opts.minStanding;
    return item;
  }

  /* Grey entries are ordinary catalogue items with two extra fields, added
   * after `laser` rather than threaded through its already-long signature.
   * `misfire` is read once, in fireGroup. */
  function greyGun(item, opts) {
    item.grey = true;
    item.minCorrupt = opts.minCorrupt;
    item.misfire = opts.misfire || 0;
    item.uncertified = true;      // what the yard and the FIT page print in amber
    return item;
  }

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
    /* ---- the transponder ------------------------------------------------
     * Astra: "There should be restricted systems which are only able to be
     * visited by ships which are carrying a special transponder. Penal
     * colonies and manufacturing hubs for warships would qualify."
     *
     * So this is not equipment in the sense the rest of this table is. It
     * does nothing to the ship at all — no gun, no field, no heat — and
     * everything to where the ship is ALLOWED. It sits in the catalogue
     * anyway, because the catalogue is where mass, power, price, a slot and
     * a standing gate already live, and the alternative was a bespoke flag
     * with its own shop, its own save and its own refusal.
     *
     * Barely any mass or draw, which is the joke: the most restrictive
     * object in the game is a box that answers a question. What gates it is
     * the standing, at the same 40 the Chernobyl drive wants — the navy
     * issues this to people it trusts with the address of a prison.
     *
     * NOT SOLD GREY. A forged transponder is a good idea for later and a
     * different item: it should be able to fail, and this one cannot. */
    transponder: { id: 'transponder', name: 'Restricted-space transponder',
                  slot: 'internal', kind: 'transponder', price: 24000,
                  power: 0.2, mass: 1, unique: true, uniqueGroup: 'transponder',
                  minDev: 0.70, minStanding: 40, minCrime: 0, grey: false,
                  pitch: 'Answers the challenge nobody civilian is supposed to hear. Where it lets you go is not a reward.' },

    /* ---- the habitation unit ---------------------------------------------
     * Astra: "Habitation Units that trade cargo space for ability to move
     * people?"
     *
     * That is the whole design in one sentence and it is the right one,
     * because it makes carrying people a DECISION about the hull rather
     * than a second kind of freight. A tonne of grain needs a hold; four
     * people need air, water, somewhere to sleep and somewhere to be sick,
     * and the eight tonnes of hold this eats is that plumbing. Cargo you
     * can always take. Passengers you have to have built for.
     *
     * NO HAB, NO PASSAGE — Astra's call, and it is what gives the fitting
     * teeth: without one the passage contracts do not merely fail, they
     * are not offered, because a board does not advertise berths to a ship
     * that has none. It is the first fitting in the catalogue that changes
     * what WORK you are shown rather than what you can survive.
     *
     * Not unique. Internal slots are the scarce thing (2-5 by hull), so a
     * mule can be a small liner if its owner is willing to give up half a
     * hold for it, and that trade is the interesting part. */
    habunit: { id: 'habunit', name: 'Habitation unit', slot: 'internal',
               kind: 'hab', price: 14500, power: 0.9, mass: 4,
               seats: 4, hold: 8,
               minDev: 0.30, minStanding: -100, minCrime: 0, grey: false,
               pitch: 'Four berths, a galley and a scrubber. Eight tonnes of hold becomes four people who expect to arrive.' },

    /* ---- and the one nobody sells ----------------------------------------
     * The issued transponder above has always had a note on it: "a forged
     * transponder is a good idea for later and a different item: it should
     * be able to fail, and this one cannot." This is that item, and it is
     * the Syndicate chain's reward the way the issued one is the navy's.
     *
     * UNLISTED. It is not stocked anywhere at any price, because the whole
     * of what it is worth is that you cannot buy it. `unlisted` keeps it
     * out of every shelf rather than relying on a development gate nobody
     * could reach.
     *
     * AND IT FAILS DETERMINISTICALLY, which is the design decision here. A
     * dice roll at the moment of jumping would be a jump that sometimes
     * kills you for no reason you could have known; hashing the answer off
     * the STAR and the ship's registration makes it a fact about a place
     * instead. Your papers are good at Coldwater and they are not good at
     * Ardent, they are consistently not good at Ardent, and you can be told
     * so before you commit. That turns a gamble into a piece of geography,
     * which is what this game does with everything else. */
    forgedtransponder: { id: 'forgedtransponder', name: 'Forged transponder',
                  slot: 'internal', kind: 'transponder', price: 0,
                  power: 0.2, mass: 1, unique: true, forged: true, unlisted: true,
                  uniqueGroup: 'transponder',
                  minDev: 0, minStanding: -100, minCrime: 0, grey: false,
                  pitch: 'Answers the challenge in somebody else\'s name. Not every challenger is satisfied.' },

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

    /* ---- the cargo scoop --------------------------------------------------
     * Picking cargo up used to be a property of having a hold, which made
     * jettison reversible and therefore meaningless — you threw a crate out
     * and the ship inhaled it again on the way past. Catching is now a
     * fitting, and that one change gives three separate systems a spine:
     * throwing cargo overboard to outrun somebody is a decision you cannot
     * take back, a freighter dumping its hold in front of you is only worth
     * robbing if you brought the equipment, and a debris field is something
     * you have to have prepared for rather than something you drive through.
     *
     * Cheap, and stocked at `minDev: 0` so the poorest frontier pad has one.
     * This is a gate, not a paywall — a pilot who cannot afford 1,400 cr has
     * larger problems than salvage.
     *
     * FITTED ON A NEW SHIP, deliberately. Learning the rule by watching your
     * own cargo drift away is a bad first lesson; learning it by selling the
     * scoop because you wanted the slot for a scanner is a good one. See
     * migrateFit, which is also why selling it sticks: the scoop lives in
     * the fit map like everything else, and the fit map is what is saved.
     *
     * Nothing whatsoever to do with the FUEL scoop, which is one of the heat
     * shield's four jobs and is about skimming a gas giant rather than
     * catching a crate.
     *
     * ZERO POWER DRAW, and that is a decision rather than an oversight. A
     * scanner and a shield are things a hull runs continuously; a scoop is a
     * hatch, a clamp and a short conveyor that do work for a few seconds a
     * day. Billing it a permanent 0.4 MW taxed every build in the game for a
     * fitting that is idle almost always — and this file already argues, at
     * the heat shield, that a module which is correct in every build is not
     * an upgrade but a tax. The first draft did charge it, and the suite
     * said so immediately: four separate measured budget facts moved,
     * including the one where an oversized anchor stops fitting a Talon.
     *
     * Its price is a tonne of mass and a UTILITY SLOT, which on a Talon
     * means the scoop is competing with the turret, the sink launcher and
     * both scanners for one of two. That is a real decision and it is the
     * one worth having. */
    cargoscoop: { id: 'cargoscoop', name: 'Cargo scoop', slot: 'utility',
                  kind: 'scoop', price: 1400, power: 0, mass: 1,
                  unique: true,
                  minDev: 0, minStanding: -100, minCrime: 0, grey: false,
                  pitch: 'Catches whatever you can fly gently enough to catch.' },

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
            pitch: 'Fire and forget. Mostly forget.' },

    /* The reason anyone pays 420 credits for a Hawk.
     *
     * A fifth of the price, a bigger crate, two thirds of the punch and a
     * seeker that gives up if the target turns hard — all of which is a
     * legitimate purchase in volume, which is the point. What you are
     * actually buying is the cook-off risk below. */
    bootleg: { id: 'bootleg', name: 'Bootleg seeker', price: 200, rack: 14,
               dmg: 28, accel: 0.065, life: 38, fuse: 0.11, speed0: 0.13,
               grey: true, minCorrupt: 60, uncertified: true,
               pitch: 'Sold by the crate, no questions, no paperwork and ' +
                      'no guarantee it leaves the rail.' }
  };

  /* ---- RACKS, PLURAL ------------------------------------------------------
   * Astra: N racks off the MISSILES table, both firable, selectable in the
   * yard.
   *
   * What was here before was one counter and one type id, which meant the
   * choice between a certified Hawk and a crate of bootlegs was made at the
   * shop and could not be revisited in flight: to carry both you had to sell
   * one. The interesting decision - "this one is worth a Hawk, that one is
   * worth a bootleg" - had nowhere to happen.
   *
   * So a ship now carries up to `rackSlots` racks, one per TYPE, each with
   * its own count and its own batch quality, and one of them is armed. The
   * one-type-per-rack rule survives intact and for the same reason: a mixed
   * rack makes the cook-off unreadable, and "is this crate the bad one" is
   * the question the batch hash exists to let the player answer.
   *
   * THE OLD FIELDS ARE KEPT AS A VIEW, exactly as ship.gun and ship.shield
   * are kept in step with the slots. `ship.missiles` is the armed rack's
   * count and `ship.missileId` is which rack is armed, so fireMissile, the
   * HUD, the threat check in demandFrom and every save that predates this
   * all keep working without knowing racks exist. The racks are the truth;
   * those two are the old spelling of it.
   */
  var DEFAULT_RACK_SLOTS = 2;

  function rackSlots(ship) {
    var h = hullOf(ship);
    return (h && h.rackSlots) || DEFAULT_RACK_SLOTS;
  }

  /* Migrating read. A save from before racks carries one counter and one
   * type, which is exactly one rack - so it becomes one, in place, the
   * first time anything asks. Nothing has to run at load time. */
  function racksOf(ship) {
    if (!ship) return {};
    if (!ship.racks) {
      ship.racks = {};
      if (ship.missiles > 0) {
        /* AND THE ARMED ID IS PART OF THE MIGRATION. A pre-racks ship could
         * carry rounds with no type recorded — the old code defaulted to
         * Hawk at every read — so the rack is created as Hawk and the ship
         * is ARMED with it here. Without that the trigger points at a rack
         * id of `undefined`, the round never leaves a rail, and the counter
         * silently never moves. */
        var mid = ship.missileId || 'hawk';
        ship.missileId = mid;
        ship.racks[mid] = {
          id: mid,
          n: ship.missiles,
          batch: ship.missileBatch === undefined ? null : ship.missileBatch
        };
      }
    }
    if (!ship.missileId) {
      var first = null;
      for (var k in ship.racks) if (ship.racks[k] && ship.racks[k].n > 0) { first = k; break; }
      if (first) ship.missileId = first;
    }
    return ship.racks;
  }

  function rackList(ship) {
    var racks = racksOf(ship), out = [];
    for (var k in racks) if (racks[k] && racks[k].n > 0) out.push(racks[k]);
    out.sort(function (a, b) { return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; });
    return out;
  }

  /* Push the armed rack into the three legacy fields. Called after every
   * change to a rack, which is the same contract syncLegacy keeps. */
  function syncRacks(ship) {
    var racks = racksOf(ship);
    var armed = racks[ship.missileId];
    if (!armed || armed.n <= 0) {
      /* The armed rack ran dry. Arm whatever else is aboard rather than
       * leaving the trigger pointed at an empty rail - a player who has
       * bootlegs left should not have to visit a menu to fire them. */
      var list = rackList(ship);
      armed = list[0] || null;
      ship.missileId = armed ? armed.id : (ship.missileId || 'hawk');
    }
    ship.missiles = armed ? armed.n : 0;
    ship.missileBatch = armed ? armed.batch : null;
    return ship;
  }

  /* Arm a rack by type. Returns what is now armed, or null if that rack is
   * not aboard - the caller says so; this does not talk. */
  function armRack(ship, id) {
    var racks = racksOf(ship);
    if (!racks[id] || racks[id].n <= 0) return null;
    ship.missileId = id;
    syncRacks(ship);
    return racks[id];
  }

  /* The next rack with rounds in it, for the key that cycles them. */
  function nextRack(ship) {
    var list = rackList(ship);
    if (list.length < 2) return null;
    var at = 0;
    for (var i = 0; i < list.length; i++) if (list[i].id === ship.missileId) at = i;
    return armRack(ship, list[(at + 1) % list.length].id);
  }

  /* ---- ordnance that cooks off ------------------------------------------
   * A flat "5% chance to lose 40 hull on launch" is a slot machine: the
   * player cannot fly differently in response, so it is a tax with a die
   * roll attached. Three things turn it into a mechanic.
   *
   * 1. IT HANGS BEFORE IT DETONATES. The motor lights and the seeker fails
   *    to separate. You get an alarm and a few seconds, and what you do
   *    with them is the whole feature.
   *
   * 2. THE ODDS ANSWER TO HOW YOU HAVE BEEN FLYING. Unstable propellant is
   *    unstable WHEN HOT, so the hang chance scales with `ship.heat` — the
   *    gauge is already on the dash and already means something. A player
   *    who holds down a beam and then reaches for bootleg seekers has made
   *    a choice, and the game is entitled to answer it.
   *
   * 3. THE BATCH IS HASHED, NOT ROLLED PER SHOT. A crate carries a hidden
   *    quality derived from the port and the purchase sequence, so some
   *    crates are simply clean and some are bad. Firing a few is how you
   *    find out. That converts raw randomness into INFORMATION THE PLAYER
   *    CAN GO AND ACQUIRE, which is a much better thing to have in a game
   *    about flying somewhere to learn something.
   *
   * WHERE THIS DEPARTS FROM THE ORIGINAL DESIGN, and why. That design had
   * the cook-off destroy the hardpoint the rack sat in, so you were
   * gambling a fitting against the missiles. There is no missile hardpoint
   * in this game — `ship.missiles` is a bare counter on a separate trigger
   * — so there is nothing in that slot to lose, and "jettison the rack"
   * would have been strictly better than doing nothing every single time.
   * A choice with a dominant option is not a choice.
   *
   * So the hung seeker is still a LIVE ROUND. Dump the rack and you lose
   * what is left, for certain, and take nothing. Ride it out and the hang
   * may clear — you keep the crate and the shot — or it cooks off and takes
   * the rack and a piece of the hull with it. The odds of clearing are the
   * same heat you are already looking at, which makes the gauge a risk
   * meter rather than a warning light, and the stake scales with how many
   * rounds are left: gambling with two is cheap and gambling with twelve
   * is a run-ender. */
  var HANG_COLD = 0.02, HANG_WARM = 0.04, HANG_HOT = 0.08;
  var HANG_WINDOW = 2.2;        // s to decide
  var HANG_CLEAR_COLD = 0.75;   // odds it separates late, cold hull
  var HANG_CLEAR_HOT = 0.20;    // ...and glowing
  var COOKOFF_PER_ROUND = 7;    // hull damage per remaining round
  var COOKOFF_FLOOR = 18;

  /* Base hang chance for the hull's current heat, before batch quality. */
  function hangChanceFor(heat) {
    if (heat < 30) return HANG_COLD;
    if (heat <= 70) return HANG_WARM;
    return HANG_HOT;
  }

  /* A crate's hidden quality, 0 (clean) to 1 (rubbish), fixed at purchase.
   * Doubles the base odds at its worst and very nearly cancels them at its
   * best, so two crates of the same ordnance are genuinely different
   * things to be carrying. */
  function batchFactor(ship) {
    var q = ship.missileBatch;
    if (q === undefined || q === null) return 1;
    return 0.25 + q * 1.75;
  }

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
  /* EVERY TANK IS A THIRD BIGGER THAN IT WAS, and the reason is a
   * measurement rather than a feeling.
   *
   * A hull's reach is its tank over its LADEN mass, and the number that
   * matters is not how far you can go but whether you can go at all: a
   * star whose nearest neighbour is further than your range is a star you
   * cannot reach by any route. Measured on the old galaxy, a laden Mule
   * could not reach TEN of them and a laden Kestrel could not reach one.
   * That was never the galaxy's fault; it was the tank's, and it had been
   * true the whole time.
   *
   * 28/20/34/36 -> 37/27/45/48, which puts laden range at 14.9 / 19.0 /
   * 13.1 / 9.9 ly against a worst forced hop of 9.00 in the new cluster
   * (see DEFAULT_STARS). Everything is reachable, with the thinnest margin
   * on the heaviest ship, which is where a margin belongs.
   *
   * AND THE LIFTOFF RULE STILL HOLDS, which is the thing this could have
   * broken quietly. Nine tonnes more tank is nine tonnes more laden mass,
   * so every hull's thrust-to-weight falls: 12.33 -> 11.61 on the Talon,
   * 12.67 -> 12.17 on the Mule. All four still clear MAX_SURFACE_G with
   * its 1.15 margin, so no purchase strands you on a pad you could land
   * on. That ceiling is itself derived from the Talon's laden mass, so it
   * came down 5.8% with everything else — see generate.js. */
  var HULLS = {
    talon: { id: 'talon', name: 'Talon Courier', price: 32000, mesh: 'courier',
             dryMass: 42, thrustKN: 1800, thrusterCap: 16, fuelCap: 37,
             cargoCap: 64, hullMax: 100,
             slots: { hardpoint: 2, utility: 2, internal: 3 },
             /* Two racks: a courier can carry a crate of each and choose. */
             rackSlots: 2,
             powerMW: 9.0, fitMass: 14,
             blurb: 'the ship you started with, and honestly not bad',
             /* ---- what the yard says about it -------------------------
              * Astra: "a paragraph about the ship, who makes it and what
              * it's ideal for."
              *
              * Written per hull rather than generated, and written to say
              * something the stat line does not. A row already tells you
              * the hold, the hull and the reactor; this is for the things
              * a spec sheet cannot hold — who built it, why it is shaped
              * like that, and what kind of career it suits. */
             maker: 'Ardwick Yards, Coldwater',
             about: 'Ardwick has built the Talon for thirty years and has ' +
               'changed almost nothing, which tells you most of what you ' +
               'need to know. It is cheap, it is honest, and there is ' +
               'nothing on it a dockside mechanic has not seen. The hold ' +
               'is larger than the hull suggests because Ardwick gave up ' +
               'on armour early and never looked back. Ideal for a first ' +
               'career: light freight, courier work, and learning which ' +
               'of your mistakes are expensive.' },
    dart:  { id: 'dart', name: 'Dart Interceptor', price: 61000, mesh: 'police',
             dryMass: 30, thrustKN: 2200, thrusterCap: 13, fuelCap: 27,
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
             /* ONE. An interceptor is a gun platform with a seat; the space
              * that would be a second crate is why it turns like that. */
             rackSlots: 1,
             powerMW: 7.0, fitMass: 9,
             blurb: 'outruns everything; carries nothing',
             maker: 'Kepner Dynamics',
             about: 'A police interceptor with the badge taken off. Kepner ' +
               'sells the civilian pattern at a loss and makes it back on ' +
               'the fleet contracts, which is why nothing else this fast ' +
               'is this cheap. The hold is an afterthought and the frame ' +
               'does not forgive a hard landing. Ideal for people who ' +
               'need to be somewhere before somebody else is: couriers ' +
               'on a deadline, and anybody whose plan depends on leaving.' },
    kestrel: { id: 'kestrel', name: 'Kestrel Multirole', price: 120000, mesh: 'merc',
             dryMass: 60, thrustKN: 2700, thrusterCap: 19, fuelCap: 45,
             cargoCap: 96, hullMax: 130,
             slots: { hardpoint: 3, utility: 2, internal: 4 },
             /* Two, same as the courier — the extra tonnage went to guns. */
             rackSlots: 2,
             powerMW: 14.0, fitMass: 22,
             blurb: 'the compromise, made well',
             maker: 'Sable & Roan',
             about: 'The hull mercenary outfits buy when they cannot ' +
               'predict the work. Sable & Roan build to survive a bad ' +
               'afternoon rather than to win a race, and it shows in the ' +
               'reactor margin and the hardpoint count. It is not the ' +
               'fastest, the roomiest or the cheapest thing on this list ' +
               'and it is the only one that is never badly wrong. Ideal ' +
               'for a pilot who takes whatever is on the board.' },
    mule:  { id: 'mule', name: 'Mule Freighter', price: 78000, mesh: 'freighter',
             dryMass: 80, thrustKN: 3700, thrusterCap: 21, fuelCap: 48,
             cargoCap: 160, hullMax: 160,
             slots: { hardpoint: 2, utility: 3, internal: 5 },
             /* Three, because a hauler's answer to everything is volume. */
             rackSlots: 3,
             powerMW: 18.0, fitMass: 30,
             blurb: 'slow, vast, and worth robbing',
             maker: 'Drayton Heavy',
             about: 'Drayton do not pretend the Mule is a ship so much as ' +
               'a warehouse with a drive bolted to it, and they are right. ' +
               'It is slow to start, slow to stop and enormous inside, and ' +
               'the ten fitting slots mean it can be made into almost ' +
               'anything given money and patience. Ideal for bulk trade, ' +
               'passenger work with the berths in, and being the reason ' +
               'pirates get out of bed.' }
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
    },
    /* The Chernobyl. Heaviest and hungriest thing on the list, because it
     * is a warship's drive and nobody designed it to be polite about a
     * civilian's power budget: a Class IV is 16 t and 9 MW, which on a
     * Talon is most of the ship. That is the honest answer to "why not just
     * fit the biggest one" and it is visible before you spend a credit,
     * the same way the anchor's is.
     *
     * `minDev 0.80` and `minStanding 40` are the tightest gates in the
     * catalogue and they are the point: this is navy standard issue, and a
     * yard sells one to a civilian only if the yard is good enough to build
     * them and the civilian is ALLIED. Nobody stumbles into one. */
    mildrive: {
      slotType: 'internal', label: 'Military Slipspace Drive',
      mass: { I: 6, II: 9, III: 12, IV: 16 },
      power: { I: 4.0, II: 5.5, III: 7.2, IV: 9.0 },
      minDev: 0.80, minStanding: 40,
      pitch: 'Half the corridor. It will not take hydrogen, and what it leaves in your hold is nobody\'s idea of clean.'
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
    /* A HAB UNIT IS BUILT INTO THE HOLD, so it cannot be fitted around
     * cargo that is already in there. Refused with the number rather than
     * silently overfilling the hull, which is what writing cargoCap below
     * a full hold would do. */
    if ((item.hold || 0) > 0) {
      var hold = global.Sim ? global.Sim.cargoMass(ship) : 0;
      var capAfter = (hullOf(ship) || { cargoCap: 0 }).cargoCap - (item.hold || 0) -
                     habHoldCost(ship, key);
      if (hold > capAfter + 1e-9) {
        return { ok: false, key: key, why: 'the hold is too full — needs ' +
                 Math.ceil(hold - capAfter) + ' t off first' };
      }
    }
    return { ok: true, key: key };
  }

  /* Hold given up to hab units ALREADY fitted, ignoring the slot being
   * filled — the same "judge the swap, not the pair" rule the power and
   * mass budgets above use. */
  function habHoldCost(ship, exceptKey) {
    var have = fittedList(ship), n = 0;
    for (var i = 0; i < have.length; i++) {
      if (have[i].key === exceptKey) continue;
      n += have[i].item.hold || 0;
    }
    return n;
  }

  /* How many people this hull can carry, and how many are aboard. Read off
   * the fitting rather than stored, so there is no way to be carrying
   * passengers you have nowhere to put. */
  function seatsOf(ship) { return (ship && ship.seats) || 0; }
  function passengersAboard(ship) { return (ship && ship.passengers) || 0; }
  function seatsFree(ship) { return Math.max(0, seatsOf(ship) - passengersAboard(ship)); }

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

    /* ---- and what the hab units did to the hold --------------------------
     * Derived here rather than tracked, for the reason every other derived
     * number in this file is: there is no way to be carrying passengers
     * without the berths to put them in, because both numbers are read off
     * the same fitted list every time anything changes.
     *
     * cargoCap is written from the HULL each time rather than decremented,
     * or pulling a hab unit would leave the hold eight tonnes short
     * forever and every save that ever carried one would drift. */
    var seats = 0, holdCost = 0;
    for (var hb = 0; hb < list.length; hb++) {
      var hit = list[hb].item;
      if (hit.kind !== 'hab') continue;
      seats += hit.seats || 0;
      holdCost += hit.hold || 0;
    }
    var hullNow = hullOf(ship);
    ship.seats = seats;
    if (hullNow) ship.cargoCap = Math.max(0, hullNow.cargoCap - holdCost);
    /* Anybody aboard a ship that no longer has a berth for them is put off
     * at the next dock, not vaporised — but the count cannot exceed the
     * berths, or the manifest starts lying. */
    if (ship.passengers && seats <= 0) ship.passengers = 0;

    if (global.Sim && global.Sim.refreshShip) global.Sim.refreshShip(ship);
    return ship;
  }

  /* ---- migration ---------------------------------------------------------
   * Saves from before slots existed carry four flat fields. Old 'pulse'
   * becomes the Class 1 pulse it always was; old 'beam' becomes the Class 2
   * intermittent, which is where its 15-damage-per-shot behaviour actually
   * belongs on the new ladder. Nothing is charged and nothing is lost. */
  /* ---- what a hull leaves the yard carrying -------------------------------
   * ONE list, and it is one list because of a specific bug.
   *
   * A respawned ship and a brand-new one are the same ship, and they were
   * assembled by two pieces of code with no reason to agree: migrateFit
   * issued the kit, and stripForRespawn hand-wrote a fit map. When the cargo
   * scoop stopped being a property of having a hold and became a fitting,
   * only migrateFit learned about it — and migrateFit issues the kit ONLY
   * when `fit` is empty, which a respawned ship's never is.
   *
   * So every pilot who had ever died flew without a scoop. The symptom was
   * not "no scoop": it was that ROBBING SHIPS STOPPED WORKING. The freighter
   * dumps its hold exactly as it always did, and none of it can be picked
   * up — and the refusal speaks once every twelve seconds, so the obvious
   * conclusion is that piracy is broken rather than that you are missing a
   * 1,400 cr fitting nobody told you you had lost.
   *
   * The gun is first so it takes hardpoint0, which the yard tests assert. */

  /* ---- two lists, because they answer two different questions -----------
   *
   * HULL_STANDARD is what EVERY HULL COMES WITH. It is Astra's rule and it
   * is not the same as "what a new career starts with": a scoop is fitted
   * to every hull that leaves a yard, so buying a Kestrel gets you one the
   * same way buying a car gets you a spare wheel.
   *
   * Saleable all the same, and the two facts are not in tension — selling
   * it is a real choice with a real price, and the next hull you buy simply
   * arrives with one again. That is why migrateFit's early return has to
   * stay: a career that already has a fit map is left alone, so selling
   * STICKS instead of being quietly undone on the next load.
   *
   * STARTING_FIT is what a BRAND-NEW SHIP carries — the standard gear plus
   * the starter gun. The gun is emphatically not standard-with-every-hull:
   * issuing one per purchase would make hull-buying a gun printer.
   *
   * Splitting them fixed a second instance of the same bug. buyHull only
   * ever replanned the gear you already had onto the new hull, so a pilot
   * who had sold their scoop and then bought a hull got a hull with no
   * scoop — which under the rule above is wrong, and fails in exactly the
   * silent way the respawn bug did. */
  var HULL_STANDARD = ['cargoscoop'];
  var STARTING_FIT = ['phpulse'].concat(HULL_STANDARD);

  /* Fit anything on HULL_STANDARD that this ship is missing. Returns the
   * ids actually added, so a caller can say so rather than leaving the
   * player to notice.
   *
   * Additive and non-destructive: it never displaces something the player
   * paid for, and it never issues a second of anything already carried. */
  function addHullStandard(ship) {
    var added = [];
    for (var i = 0; i < HULL_STANDARD.length; i++) {
      var id = HULL_STANDARD[i];
      if (hasFitted(ship, id)) continue;
      var v = canFit(ship, id);
      var key = v.key || firstFreeSlot(ship, (EQUIPMENT[id] || {}).slot);
      if (key && !ship.fit[key]) { ship.fit[key] = id; added.push(id); }
    }
    if (added.length) syncLegacy(ship);
    return added;
  }

  function hasFitted(ship, id) {
    var fit = (ship && ship.fit) || {};
    for (var k in fit) if (fit[k] === id) return true;
    return false;
  }

  /* Does this ship answer the challenge? Asked by the jump planner before
   * you commit and by the chart so it can say why a course is barred — one
   * function, so the warning and the refusal cannot disagree about what is
   * fitted. Reads the slots rather than a flag: there is no way to be
   * carrying one except by having bought and fitted it. */
  function hasTransponder(ship) {
    return hasFitted(ship, 'transponder') || hasFitted(ship, 'forgedtransponder');
  }

  /* WHICH one, because the difference is the whole of the Syndicate's
   * reward. Null when there is none. */
  function transponderKind(ship) {
    if (hasFitted(ship, 'transponder')) return 'issued';
    if (hasFitted(ship, 'forgedtransponder')) return 'forged';
    return null;
  }

  /* Will a forgery pass AT THIS STAR? Hashed off the star and the ship's
   * own registration, so it is a fact about a place rather than a dice
   * roll at the moment of jumping — the same answer every time you ask,
   * which is what lets the chart warn you before you commit.
   *
   * Two thirds, measured against nothing because there is nothing to
   * measure: it is the rate at which a forgery has to fail to be a
   * different object from the issued one and still be worth carrying. A
   * paper that worked nine times in ten would be the issued transponder
   * with extra words; one that worked half the time would be a coin. */
  var FORGED_PASS = 0.67;

  function forgedPasses(star, ship) {
    if (!star) return true;
    var R = global.RNG;
    if (!R || !R.hashString) return true;
    var reg = (ship && (ship.reg || ship.registration)) || 'unregistered';
    var h = R.hashString('forged|' + (star.id || star.name || '?') + '|' + reg);
    return (h % 1000) / 1000 < FORGED_PASS;
  }

  /* Does this ship's paperwork actually answer the challenge at this star?
   * One function, asked by the jump planner and by the chart, so the
   * warning and the refusal cannot disagree. */
  function transponderPasses(ship, star) {
    var kind = transponderKind(ship);
    if (!kind) return false;
    if (kind === 'issued') return true;
    return forgedPasses(star, ship);
  }

  /* Strip a ship back to that list. The hull must already be set: slot keys
   * are derived from it, so fitting before the hull is decided files the kit
   * against the wrong slots. */
  function applyStartingFit(ship) {
    ship.fit = {};
    ship.groups = {};
    for (var i = 0; i < STARTING_FIT.length; i++) {
      var id = STARTING_FIT[i];
      var v = canFit(ship, id);
      var key = v.key || firstFreeSlot(ship, (EQUIPMENT[id] || {}).slot);
      if (key) ship.fit[key] = id;
    }
    syncLegacy(ship);
    return ship;
  }

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
    /* The rest of the starting kit — the cargo scoop today — issued once and
     * only here. This runs for a brand-new ship and for a save old enough to
     * have no fit map at all; a career that already has a fit map returned
     * above and is untouched, which is exactly what makes SELLING the scoop
     * stick. Last in the list so it can never displace something the player
     * actually paid for.
     *
     * Read off HULL_STANDARD, which is precisely "what every hull comes
     * with" and so is precisely what a migrating save should be given. It
     * used to walk STARTING_FIT skipping anything of kind 'gun', which
     * computed the same answer by subtraction — the gun comes from the
     * legacy field above instead. Naming the list directly means the two
     * cannot drift, and it stops a second standard fitting being added one
     * day and silently landing here as a free gun. */
    for (var si = 0; si < HULL_STANDARD.length; si++) {
      var extra = HULL_STANDARD[si];
      if (want.indexOf(extra) < 0) want.push(extra);
    }
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
  /* `heat` is spent as `heat * cooldown` per shot, the same arithmetic
     `fireGroup` uses on the player's guns — so a hostile holding down its
     trigger loads its hull at a rate you could work out from the dash if
     it were your ship. 5.5/s against a pirate's 18/s shed (base 18, see
     NPC_SHED.pirate) means a pirate firing flat out is nowhere near
     cooking on its own; what tips one over is somebody else's heat on
     top. */
  var NPC_GUN = { dmg: 5, range: 12, cooldown: 1.1, heat: 5 };

  /* The Syndicate's own enforcement wing — a `police`-kind patrol flying
   * under the outlaw flag, spawned by the same loop as any legitimate
   * faction's cops wherever the Syndicate holds ports of its own (see
   * buildPatrols in generate.js). It is not a raider: it patrols a beat
   * between two of the mob's own ports on a timetable, same as the law
   * anywhere else. "Unless you are high enough up with the Syndicate,
   * obviously their own enforcement wing uses the best possible tech they
   * can buy" — so its gun is built off the same numbers as the catalogue's
   * muon beam (see GUNS.syndbeam) rather than the flat NPC_GUN every other
   * patrol carries: roughly 2.9x NPC_GUN's DPS and half again its range.
   * A player who sees one of these is not being mugged, they are being
   * policed by an organisation with better hardware than the law usually
   * has. */
  var SYNDICATE_GUN = { dmg: 11, range: 18, cooldown: 0.85, heat: 9 };

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
  var TRADER_GUN = { dmg: 2, range: 8, cooldown: 2.2, heat: 2 };
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

  /* ---- how bad is it, exactly --------------------------------------------
   * A flat rate per tonne said every illegal cargo was the same crime, and
   * it plainly is not. The ladder, worst last:
   *
   *   1  narcotics   somebody's vice
   *   2  arms        somebody's war
   *   3  milfuel     naval materiel, in hands the navy did not licence
   *
   * Radioactive waste inside a Syndicate hold is worse than all three and
   * is deliberately NOT on this ladder: it is a flat WASTE_FINE and an
   * expulsion, handled in wasteCustoms, because that is a protection racket
   * enforcing its own law rather than a state enforcing a graded one.
   *
   * The multipliers are chosen against SMUGGLING_FINE_PER_TONNE so that a
   * typical ten-tonne run lands somewhere meaningful: 1,800 cr of narcotics,
   * 4,500 of arms, 9,000 of naval fuel — the last of which sits just under
   * the 10,000 flat fine for waste, which is the ordering we want and it
   * falls out of the numbers rather than being asserted. */
  var CONTRABAND_SEVERITY = { 1: 1, 2: 2.5, 3: 5 };
  var STANDING_HIT = { 1: -8, 2: -14, 3: -22 };

  /* Standing at which the navy considers you fit to be carrying its fuel.
   * The same gate the Chernobyl drive itself is sold behind, deliberately:
   * one number, so a pilot cleared to own the drive is cleared to carry
   * what it burns, and nobody has to discover a second threshold. */
  var MILFUEL_LICENCE_STANDING = 40;

  function fineFor(tonnes, sev) {
    return tonnes * SMUGGLING_FINE_PER_TONNE * (CONTRABAND_SEVERITY[sev] || 1);
  }

  /* WHAT COUNTS AS CONTRABAND DEPENDS ON WHO IS ASKING, and military drive
   * fuel is the case that forces the distinction. Narcotics and arms are
   * illegal in anyone's hold. Milfuel is a legal, openly traded commodity —
   * bred at licensed plants, sold at a listed price — and it is an offence
   * only when the ship carrying it has no standing with the flag that
   * stopped it. Flagging it `contraband` in the catalogue would have made
   * the entire legitimate trade a crime, which is not the same rule at all.
   *
   * Returns 0 for "not an offence here", or the severity tier. */
  function contrabandSeverity(G, cid, fac) {
    var com = (global.Economy && global.Economy.BY_ID) ? global.Economy.BY_ID[cid] : null;
    if (!com) return 0;
    if (com.contraband) return com.severity || 1;
    if (com.milfuel) {
      var st = global.Missions ? global.Missions.standing(G, fac) : 0;
      return st >= MILFUEL_LICENCE_STANDING ? 0 : (com.severity || 3);
    }
    return 0;
  }
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

  /* Can this ship pick a canister up at all? Read off the fit rather than
   * off a flag, the same way `fittedEquipment` reads the ship rather than a
   * table, so selling the scoop takes the capability with it and no second
   * piece of state can drift out of agreement with the slot. */
  function hasScoop(ship) {
    var list = fittedList(ship);
    for (var i = 0; i < list.length; i++) {
      if (list[i].item.kind === 'scoop') return true;
    }
    return false;
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

  /* ---- heat, on both sides of the gun ------------------------------------
   * Heat was the player's alone, and it should never have been. The whole
   * thermal model — a rising load, a shed rate, damage past a limit, sinks
   * that buy you a few seconds — was sitting in `sim.js` behind a function
   * that never once mentions the player: `updateHeating(ship, sys, t, dt)`
   * asks for `heat`, `heatShed`, `pos`, `vel` and `hullHp` and does not
   * care whose they are. Nothing was stopping an NPC from having them
   * except that nobody had handed them over.
   *
   * That gap was blocking two features at once — bootleg ordnance cooking
   * off in a pirate's rack, and any weapon whose damage is thermal — and
   * both were blocked on the same missing field. So this is the same move
   * the shield already made: ONE RULE WITH TWO OWNERS, rather than two
   * models to keep in step.
   *
   * LAZY, exactly like `npcShield`, and for the same reason. `heatShed` is
   * undefined until something actually heats this ship, and the tick skips
   * anything that has never been heated — so a sky full of ships nobody
   * has fired on costs one `undefined` test each, and a fight costs the
   * arithmetic for the handful of hulls in it.
   *
   * WHAT DOES NOT COME FREE, and is worth being honest about: because the
   * field only appears when something heats the ship, an NPC that dives
   * into an atmosphere without having fired does not burn up. That is very
   * nearly never — traffic is on rails between ports and does not go
   * aerobraking — and paying for every hull in the system every frame to
   * cover it would be the wrong trade. */
  /* How much of a shot stays behind as heat, by delivery. Calibrated
   * against the shed rates below: a photon beam on a pirate (14/s shed)
   * nets about +13/s, which walks a cold hull up to the cook-off band in
   * roughly six seconds of held fire. Enough to be a tactic, nowhere near
   * enough to replace shooting the thing. */
  var THERMAL_SHARE = { pulse: 0.35, intermittent: 0.50, beam: 1.00 };
  var THERMAL_DEFAULT = 0.35;
  var THERMAL_GAIN = 1.6;

  /* WHAT THIS NUMBER IS, because getting it wrong is easy and silent:
   * `sim.js` sheds `BASE_HEAT_SHED + ship.heatShed`, so this is the hull's
   * cooling ABOVE THE BARE 18/s that everything radiates for free — the
   * same slot the player's heat shield fills. A pirate at 0 is not a ship
   * with no cooling, it is a ship with nothing but its own skin. */
  var NPC_SHED = {
    escape_pod: 0,
    shuttle: 2,
    /* Bulk hulls are mostly surface, and carry almost nothing that makes
     * heat. A freighter is never the ship that cooks. */
    freighter: 10, tanker: 10, hauler: 8,
    /* Nothing. Nobody paid for radiators on a hull bought to be expendable,
     * which is the same reason its guns came off the grey counter — and it
     * is what makes a pirate the ship most likely to cook its own rack. */
    pirate: 0,
    police: 6,
    merc: 9,
    tender: 8,
    liner: 14,
    /* Built around the problem. You do not overheat one of these. */
    navy: 30
  };

  function npcHeat(spec) {
    if (spec.heatShed === undefined) {
      spec.heat = 0;
      spec.heatShed = NPC_SHED[spec.cls];
      if (spec.heatShed === undefined) spec.heatShed = 18;   // bare hull, as sim.js
    }
    return spec.heat;
  }

  /* Add heat to somebody else's ship. `by` records who did it, because a
   * hull that cooks itself firing its own guns is an accident and a hull
   * the player cooked is a kill — and the difference is a bounty. */
  function addNpcHeat(spec, units, by) {
    npcHeat(spec);
    spec.heat += units;
    if (by) spec.heatBy = by;
  }

  /* ---- a pirate's rack, and what heat does to it -------------------------
   * "NPCs fly it too." They could not, before, for a reason that turned out
   * to be structural rather than lazy: NPCs never launch missiles, so there
   * is no launch for a seeker to hang on. The player's version of this
   * mechanic hangs on the rail; theirs cannot.
   *
   * So it triggers on the thing that was always the real driver anyway.
   * Unstable propellant is unstable WHEN HOT — that is the whole design
   * note — and a hull carrying grey-market ordnance that gets hot enough
   * does not need a launch to set it off. Which means the player can now
   * DO something about a pirate other than shoot it: heat it up and let
   * its own cheap crate finish the job. That is a tactic that did not
   * exist ten minutes ago and it exists because heat stopped being
   * player-only.
   *
   * SEEDED, like every other fact about a pirate's fit-out. Whether this
   * one is carrying and how bad the crate is are hashed off the ship's own
   * id salted with the system seed — the same discipline `manifestFor`
   * already uses for its hold — so the same pirate in the same system is
   * always the same gamble, and reloading does not shop for a better one.
   * The IGNITION is a live roll; the CARGO is not. */
  var RACK_HEAT = 78;            // where a cheap crate starts to be a problem
  var RACK_IGNITE_PER_S = 0.22;  // at HEAT_MAX, worst crate — scaled down from there
  var RACK_DAMAGE = 46;

  function pirateRack(sys, spec) {
    if (spec.rack === undefined) {
      /* Only the hulls that would actually be buying grey. A navy cutter
       * does not run bootleg ordnance and a liner does not run any. */
      var cheap = spec.kind === 'pirate' || spec.cls === 'pirate';
      if (!cheap) { spec.rack = null; return null; }
      var h = RNG.hashString('rack|' + ((sys && sys.seed) || '?') + '|' +
                             (spec.id || spec.name || '?'));
      /* Two draws out of one hash, shifted rather than re-hashed: does it
         carry, and how bad is what it carries. */
      spec.rack = ((h % 100) < 55)
        ? { batch: (((h >>> 8) % 1000) / 1000) }
        : null;
    }
    return spec.rack;
  }

  /* One proxy object, reused. `updateHeating` wants a single thing carrying
   * position, velocity, heat and hull; an NPC keeps its position on `live`
   * (which is rebuilt every time it is lifted off its rail) and its heat and
   * hull on the SPEC (which is not). Copy in, run the shared rule, copy
   * back — six lines, and no second thermal model to keep in step.
   *
   * Heat lives on the spec deliberately: a ship that goes to sleep and
   * wakes up a few seconds later should still be hot, the same way it is
   * still damaged. */
  var HEAT_PROXY = { pos: null, vel: null, heat: 0, heatShed: 0, hullHp: 0 };

  function updateNpcHeat(sys, G, t, dtSim, hooks) {
    if (!(dtSim > 0)) return;
    var Sim = global.Sim;
    if (!Sim || !Sim.updateHeating) return;
    var pats = sys.patrols || [];
    for (var i = pats.length - 1; i >= 0; i--) {
      var sp = pats[i];
      if (sp.dead || !sp.live) continue;
      if (sp.heatShed === undefined) continue;      // never been heated
      var px = HEAT_PROXY;
      px.pos = sp.live.pos; px.vel = sp.live.vel;
      px.heat = sp.heat; px.heatShed = sp.heatShed;
      px.hullHp = sp.hullHp === undefined ? Infinity : sp.hullHp;
      var dmg = Sim.updateHeating(px, sys, t, dtSim);
      sp.heat = px.heat;
      /* The renderer already knows how to draw a glowing hull; handing the
       * value over means an overheating pirate LOOKS overheating, which is
       * the only warning anyone else gets. */
      sp.reentryGlow = px.reentryGlow;
      /* A cheap crate in a hot hold. Rolled per second rather than per
         frame, so the odds mean the same thing at any frame rate. */
      var rk = sp.heat >= RACK_HEAT ? pirateRack(sys, sp) : null;
      if (rk) {
        var over = (sp.heat - RACK_HEAT) / Math.max(1, 300 - RACK_HEAT);
        var pIgnite = RACK_IGNITE_PER_S * over * batchFactor({ missileBatch: rk.batch });
        if (Math.random() < pIgnite * dtSim) {
          sp.rack = null;
          if (sp.hullHp !== undefined) {
            sp.hullHp = Math.max(0, sp.hullHp - RACK_DAMAGE);
          }
          (G.explosions = G.explosions || []).push({
            pos: V.clone(sp.live.pos), born: t, small: true
          });
          if (hooks && hooks.say) {
            hooks.say((sp.name || 'A pirate') + "'s rack cooked off.", 5);
          }
          if (hooks && hooks.sound) hooks.sound('warn');
          if (sp.hullHp !== undefined && sp.hullHp <= 0) {
            /* Same attribution question as below: you heated it, you did
               it. Cooking a pirate's own ordnance off is a kill. */
            if (sp.heatBy === 'player') killNpc(sys, G, sp, t, hooks);
            else sp.dead = true;
            sys._ships = null;
            continue;
          }
        }
      }

      if (dmg > 0 && sp.hullHp !== undefined) {
        sp.hullHp = px.hullHp;
        if (sp.hullHp <= 0) {
          /* Cooked. Whose kill it is depends on who put the heat in — the
           * player, if they did it with a thermal weapon; nobody, if the
           * ship simply held its own trigger too long. `killNpc` files the
           * charge, so this is the line that decides whether burning a
           * hull down is murder or an industrial accident. */
          if (sp.heatBy === 'player') {
            killNpc(sys, G, sp, t, hooks);
          } else {
            sp.dead = true;
            if (hooks && hooks.say && sp.name) {
              hooks.say(sp.name + ' cooked itself off.', 5);
            }
          }
          sys._ships = null;
        }
      }
    }
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

    /* A shot is energy arriving, and some of it stays as heat. This is what
     * turns the new NPC thermal model into something the player can USE
     * rather than something that only ever happens to them.
     *
     * WHAT IT ADDS TO THE DELIVERY MODEL, and it is a third axis for free.
     * `vsShield` and `vsHull` already say what a pulse, a burst and a beam
     * are good against. THERMAL_SHARE says what they leave behind. A beam
     * is a sustained energy dump and heats most; a pulse is impulse and
     * heats least. So the beam-then-pulse pairing the delivery model was
     * built to reward now has a second reason to exist: the beam cooks the
     * hull while the pulse opens it, and against a pirate carrying a cheap
     * crate that is a genuine third way to win a fight.
     *
     * Attributed. `heatBy` is what decides whether a hull that cooks to
     * death is a kill or an accident, and this is the line that makes the
     * player the answer. */
    var share = THERMAL_SHARE[(delivery && delivery.variety) || ''];
    if (share === undefined) share = THERMAL_DEFAULT;
    if (split.hull > 0 && share > 0) {
      addNpcHeat(spec, split.hull * share * THERMAL_GAIN, 'player');
    }

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
      /* AND THE PEOPLE IN THE BACK FELT THAT. Recorded the moment it
       * happens rather than worked out at the far end, because by the time
       * anybody is paying the hull has been repaired and there is nothing
       * left to read off it. One line here is the whole of "passengers
       * react to being shot at" — the contract carries the mark, and
       * Missions.passageCut turns it into a number at the door. */
      if ((s.passengers || 0) > 0 && global.Missions &&
          global.Missions.passengersUnderFire &&
          global.Missions.passengersUnderFire(G) && hooks && hooks.say) {
        hooks.say('Your passengers are screaming.', 5);
      }
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

  function updateSink(G, t, hooks, sys) {
    var sk = G.sink;
    if (!sk || !sk.live) return;
    if (t < sk.until && sk.held < SINK.capacity) return;
    /* Ejected: a white-hot block with your heat in it, thrown overboard.
     * It is a scanner return that says precisely where you were and when,
     * and it cools over a minute or two — which is about how long a patrol
     * answering a distress call takes to arrive. Same doctrine as the
     * marked waste canister: evidence outlives the act.
     *
     * IT IS NOW AN OBJECT. This used to say "the physical object is the
     * debris system's job" and record the ejection for a phase that had not
     * been built; Phase 4 built it, and `Sim.spawnSink` puts a real tumbling
     * block in `sys.canisters` on the shard path. The record stays — it is
     * three numbers, it is what a future customs officer or investigator
     * would read, and it survives the shard's own 150-second life. */
    sk.live = false;
    G.sinkCoolUntil = t + SINK.cooldown;
    (G.sinkEjections = G.sinkEjections || []).push({
      pos: V.clone(G.ship.pos), vel: V.clone(G.ship.vel),
      heat: sk.held, at: t
    });
    if (sys && global.Sim && global.Sim.spawnSink) {
      global.Sim.spawnSink(sys, G.ship, sk.held, t);
    }
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
      /* A witness used to file instantly. It now takes them a few seconds
       * to actually call it in, for one reason: without that gap there is
       * nowhere to stand between the act and the report, and buying
       * silence needs somewhere to stand. Eight seconds is long enough to
       * decide and short enough that doing nothing is indistinguishable
       * from the old behaviour.
       *
       * This is deliberately NOT stored on the witness. Traffic ships are
       * rebuilt from their rails every time t moves, so anything written
       * on one is gone by the next frame; it lives on G, which is also
       * what makes it survive a save. */
      if (!G.pendingReport) {
        G.pendingReport = {
          kind: kind, fac: victim.faction || 'civil',
          at: t + WITNESS_CALL_DELAY,
          by: witness.name || 'a witness',
          /* A warship's log is not a thing anybody sells. See
           * capitalWatching for why this is the whole of the feature. */
          sealed: witness.kind === 'capital',
          victimName: victim.name || null
        };
        /* Quote the price in the warning itself. The window is eight
         * seconds; making the player press a second key to find out what
         * the first key would cost spends most of it on the interface. */
        if (hooks && hooks.say) {
          var q0 = hushQuote(sys, G, t);
          var offer = !q0 ? ''
            : !q0.possible && q0.sealed ? '  —  ' + q0.reason
            : q0.intimidate ? '  —  Shift+H to have a word (free; they will remember it)'
            : !q0.possible  ? '  —  ' + q0.reason
            : '  —  Shift+H: ' + Math.round(q0.price) + ' cr, ~' +
              Math.round(q0.stick * 100) + '% it holds';
          hooks.say('WITNESSED by ' + G.pendingReport.by + ' — transmitting in ' +
                    WITNESS_CALL_DELAY + 's' + offer, 7);
        }
        if (hooks && hooks.sound) hooks.sound('warn');
      } else if ((BOUNTY[kind] || 0) > (BOUNTY[G.pendingReport.kind] || 0)) {
        G.pendingReport.kind = kind;      // the charge escalates with the act
      }
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

  /* ---- what a capital ship is FOR ----------------------------------------
   * Astra: "there are ships for the capital class." They fly, and until now
   * that was all they did — a hull twice a cutter's size that never affected
   * anything, which is set dressing with a fuel bill.
   *
   * A capital does NOT chase. That was the design and it is the right one:
   * a third of a cutter's acceleration means it could never catch anybody,
   * and building a pursuit it always loses would make it look foolish
   * rather than dangerous. So what it does is POSITIONAL — it makes the
   * volume around it a different place to be.
   *
   * Two effects, both of them on the existing law rather than a new system:
   *
   *   IT SEES FURTHER. A warship keeps a watch, so the radius within which
   *   an act is witnessed is four times the ordinary one. Not because its
   *   sensors are magic — because somebody aboard is being paid to look,
   *   which is exactly the thing an ordinary trader on a schedule is not.
   *
   *   AND ITS WATCH IS NOT FOR SALE. The whole hush mechanic rests on the
   *   witness having something to lose and a reason to deal; a duty officer
   *   on a capital ship has neither, and the Syndicate's promise of
   *   consequences does not reach a warship's log. So a crime seen from a
   *   capital is SEALED: it cannot be paid off and it cannot be leaned on,
   *   whatever your standing.
   *
   * The consequence is the point: a system with a capital in it is not
   * uniformly harder, it has a place in it you do not do business. That is
   * geography, which is what this game does with everything else. */
  var CAPITAL_WATCH = WITNESS_RANGE * 4;
  var SHADOW_DISCOUNT = 0.55;      // of the going rate, under a flagship
  var SHADOW_STICK = 0.22;         // and this much likelier to stay bought

  /* ---- AND THE OTHER SIDE'S FLAGSHIP ------------------------------------
   * Astra: "anything you do for the military power in the region, also do
   * for Syndicate, since they're basically the alternative."
   *
   * The same object with the law reversed, which is a better description
   * of what the two powers are than any amount of prose about them. Inside
   * a naval capital's watch a crime cannot be bought off at any price;
   * inside a Syndicate flagship's shadow ANYTHING can — the corruption
   * floor that normally decides whether a bargain is even enforceable does
   * not apply, because the thing that enforces it is sitting right there.
   *
   * The two are not symmetric in precedence, and they should not be: where
   * both are present the warship wins. A flagship can buy a witness; it
   * cannot buy a naval log, and the fact that it is standing nearby does
   * not change what is written in one. */
  function capitalShadow(sys, t, scene) {
    var Sim = global.Sim;
    var patrols = (sys && sys.patrols) || [];
    for (var i = 0; i < patrols.length; i++) {
      var sp = patrols[i];
      if (sp.kind !== 'capital' || !sp.outlaw || sp.dead) continue;
      var st = sp.live || (Sim && Sim.patrolState ? Sim.patrolState(sp, sys, t) : null);
      var pos = st && st.pos;
      if (!pos) continue;
      if (V.dist(pos, scene) < CAPITAL_WATCH) return sp;
    }
    return null;
  }

  function capitalWatching(sys, t, scene, victim) {
    var Sim = global.Sim;
    var patrols = (sys && sys.patrols) || [];
    for (var i = 0; i < patrols.length; i++) {
      var sp = patrols[i];
      if (sp.kind !== 'capital' || sp.dead) continue;
      /* A Syndicate flagship keeps no log anybody will read. */
      if (sp.outlaw) continue;
      if (victim && (sp === victim || sp.id === victim.id)) continue;
      var st = sp.live || (Sim && Sim.patrolState ? Sim.patrolState(sp, sys, t) : null);
      var pos = st && st.pos;
      if (!pos) continue;
      if (V.dist(pos, scene) < CAPITAL_WATCH) return sp;
    }
    return null;
  }

  function witnessNear(sys, t, scene, victim, G) {
    var Sim = global.Sim;
    /* THE WARSHIP FIRST, and not merely as one candidate among many: if a
     * capital is inside its watch radius it IS the witness, because which
     * witness it is decides whether the report can be bought. */
    var cap = capitalWatching(sys, t, scene, victim);
    if (cap) return cap;
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

  /* ---- buying silence ----------------------------------------------------
   * The witness system has always had a gap in it and never used it: a
   * victim who is not killed does not report instantly, it sets
   * `distressAt` and squawks a few seconds later. That gap is a window,
   * and this is what you do with it.
   *
   * WHY IT IS ENFORCEABLE, which is the whole question. Handing a stranger
   * money to keep quiet is not a mechanic, it is a donation — nothing stops
   * them taking it and transmitting anyway. What makes it a bargain is the
   * syndicate standing behind it: if you go down, the people who take your
   * money have a problem, and they know it. So the odds of a payment
   * STICKING are set by how corrupt the system is (is this a place where
   * that arrangement is normal and understood?) and by your standing with
   * the pirates (is the threat behind it credible when it is YOU making
   * it?). In a clean system nobody takes the money at all, because there is
   * nothing to enforce it with.
   *
   * THE PRICE is quoted the way everything else in this game is quoted:
   * as cargo. A witness prices their silence at the local going rate for
   * so many tonnes of risk. The rate is sampled from the nearest ten
   * traders and stations to the scene — whichever are nearer, mixed — so a
   * murder in front of a wealthy highport costs a great deal more to bury
   * than the same murder out by a mining head, and the number moves as the
   * neighbourhood does. The tonnage is what you did.
   *
   * THE DISCOUNT starts at standing 10, which is not an arbitrary number:
   * 10 is exactly where Missions.standingLabel stops saying `neutral` and
   * starts saying `warm`. The Syndicate gives you a rate the moment it
   * considers you a friend, and not one point sooner. Each point past that
   * takes another 2% off, compounding, down to a floor of 0.15.
   *
   * AND ABOVE 70 YOU STOP PAYING, which is a different mechanic wearing the
   * same coat. You are not buying anything at that point — the price does
   * not fall to zero, the transaction stops being a purchase. Somebody who
   * is known to be that far inside the Syndicate does not have to open with
   * a number: they walk over and start a conversation, and the witness
   * works out the rest on their own. It is more reliable than money for the
   * obvious reason, and it is not free, because it costs you standing with
   * the faction whose trader you just leaned on. Paying leaves a witness
   * bought; intimidating leaves one who remembers you. */
  var HUSH_FROM_STANDING = 10;    // where `warm` begins — see Missions.standingLabel
  var HUSH_PER_POINT = 0.98;      // each point past it, compounding
  var HUSH_FLOOR = 0.15;          // and never below this share of the rate
  var HUSH_MIN_CORRUPTION = 25;   // below this, nobody here will take it
  var INTIMIDATE_STANDING = SYNDICATE_TRUST;  // same fact about you as the arms locker
  var INTIMIDATE_STICK = 0.25;    // fear is better at this than money is
  var INTIMIDATE_STANDING_COST = 1;  // ...with the faction whose trader it was
  var HUSH_SAMPLE = 10;           // nearest N traders and stations
  var WITNESS_CALL_DELAY = 8;     // s — a witness has to actually call it in

  /* An ordinary neighbourhood, in credits per tonne. MEASURED, not chosen:
   * across 40 systems of seed `kawartha`, 501 port price lists and 1802
   * route manifests give a combined median of 268 and a mean of 376. 380
   * is the mean rounded, so a typical place quotes a multiplier near 1 and
   * the clamp below is doing nothing most of the time. */
  var TRADE_REFERENCE = 380;
  var TRADE_MIN = 0.35, TRADE_MAX = 2.6;

  /* How many tonnes of risk each act is. These are the prices of silence,
   * not of guilt: they track what the witness is taking on by keeping
   * quiet, which is why killing a rescue tender — the one hull whose only
   * defence is that everyone agrees not to — is the most expensive thing
   * on the list by a distance. */
  var RISK_TONNES = { demand: 1.6, assault: 1.2, kill: 9, killPolice: 18,
                      killNavy: 34, killLiner: 26, killTender: 40, smuggling: 2 };

  /* The going rate around a point in space. Ships and stations both count
   * and are ranked together by distance, because "this part of the system"
   * is a place, not a category — a convoy of ore barges IS the character of
   * the neighbourhood it is crossing.
   *
   * Distances are collected for everything and the price lists are only
   * built for the ten that survive the sort, so the cost of this is ten
   * price lists however many ports the system has. */
  function localTradeRate(sys, G, t, scene) {
    var Sim = global.Sim, Eco = global.Economy;
    if (!Sim || !Eco) return TRADE_REFERENCE;
    var cand = [], i;

    var ships = Sim.shipsAll(sys, t);
    for (i = 0; i < ships.length; i++) {
      var sh = ships[i];
      if (!sh.pos || !sh.manifest || !sh.manifest.length) continue;
      cand.push({ d: V.dist(sh.pos, scene), ship: sh });
    }
    for (i = 0; i < sys.bodies.length; i++) {
      var b = sys.bodies[i];
      if (b.kind !== 'station' || !b.market) continue;
      cand.push({ d: V.dist(Sim.bodyPosition(b, sys, t), scene), port: b });
    }
    cand.sort(function (a, c) { return a.d - c.d; });

    var vals = [];
    for (i = 0; i < cand.length && vals.length < HUSH_SAMPLE; i++) {
      var v = cand[i].port ? portRate(cand[i].port, t) : cargoRate(cand[i].ship);
      if (v > 0) vals.push(v);
    }
    if (!vals.length) return TRADE_REFERENCE;
    var sum = 0;
    for (i = 0; i < vals.length; i++) sum += vals[i];
    return sum / vals.length;
  }

  function portRate(port, t) {
    var Eco = global.Economy;
    var list = Eco.priceList(port, t), sum = 0, n = 0;
    for (var i = 0; i < list.length; i++) {
      /* Waste is the one commodity with a negative price. It is a disposal
       * fee, not a trade, and averaging it in would make a reprocessing
       * plant look like a poor neighbourhood when it is simply a grim one. */
      if (list[i].mid > 0) { sum += list[i].mid; n++; }
    }
    return n ? sum / n : 0;
  }

  function cargoRate(sh) {
    var Eco = global.Economy, q = 0, v = 0;
    for (var i = 0; i < sh.manifest.length; i++) {
      var e = sh.manifest[i];
      /* Route manifests say `qty`, a pirate's improvised hold says
       * `tonnes`. Both are tonnes. */
      var n = e.qty || e.tonnes || 0;
      var com = Eco.BY_ID[e.cid];
      if (!com || !n) continue;
      q += n; v += n * Math.abs(com.base);
    }
    return q > 0 ? v / q : 0;
  }

  /* What is about to be transmitted, if anything, and what it would cost to
   * stop it. Returns null when there is nothing pending — the caller uses
   * that to decide whether to offer the option at all. */
  function hushQuote(sys, G, t) {
    var target = null;
    if (G.pendingReport && t < G.pendingReport.at) {
      target = { pending: G.pendingReport, kind: G.pendingReport.kind,
                 who: G.pendingReport.by, at: G.pendingReport.at };
    } else {
      var patrols = sys.patrols || [];
      for (var i = 0; i < patrols.length; i++) {
        var sp = patrols[i];
        if (!sp.distressAt || t >= sp.distressAt) continue;
        if (!target || sp.distressAt < target.at) {
          target = { victim: sp, kind: sp.distressKind || 'assault',
                     who: sp.name || 'the victim', at: sp.distressAt };
        }
      }
    }
    if (!target) return null;

    var corrupt = systemCorruption(G, sys);
    var standing = (G.standing || {}).outlaw || 0;
    var scene = (target.victim && target.victim.live && target.victim.live.pos) ||
                (G.ship && G.ship.pos);
    if (!scene) return null;

    var rate = localTradeRate(sys, G, t, scene);
    var level = Math.max(TRADE_MIN, Math.min(TRADE_MAX, rate / TRADE_REFERENCE));
    var tonnes = RISK_TONNES[target.kind] || 2;

    var mult = 1;
    if (standing > HUSH_FROM_STANDING) {
      mult = Math.max(HUSH_FLOOR,
                      Math.pow(HUSH_PER_POINT, standing - HUSH_FROM_STANDING));
    }
    target.intimidate = standing >= INTIMIDATE_STANDING;

    target.rate = Math.round(rate);
    target.level = level;
    target.tonnes = tonnes;
    target.standing = standing;
    target.discount = mult;
    target.corruption = corrupt;
    target.price = target.intimidate
      ? 0
      : Math.max(50, Math.round(TRADE_REFERENCE * level * tonnes * mult));
    /* Whether it stays bought. Corruption is the larger term because it is
     * the institutional fact — an arrangement everyone here understands —
     * and standing is the personal one on top of it. Neither alone gets you
     * near certainty, and nothing gets you to it. */
    target.stick = Math.max(0, Math.min(0.95,
                     0.35 + corrupt / 180 + Math.max(0, standing) / 220));
    if (target.intimidate) {
      target.stick = Math.min(0.97, target.stick + INTIMIDATE_STICK);
    }
    /* The corruption floor is about whether a BARGAIN can be enforced, and
     * a threat is not a bargain. Somebody the Syndicate vouches for that
     * heavily is frightening in an anarchy too — arguably more so, since
     * there is nobody to complain to. */
    target.possible = target.intimidate || corrupt >= HUSH_MIN_CORRUPTION;
    target.reason = target.possible ? null
      : 'nobody here will take it — too little corruption to enforce a bargain';
    /* AND A WARSHIP'S WATCH IS NOT FOR SALE, whoever you are. This is
     * deliberately the LAST word rather than one term among several: the
     * intimidation path bypasses the corruption floor on the argument that
     * a threat is not a bargain, and that argument stops at a hull with a
     * flag on it. There is no standing that makes a duty officer on a
     * capital ship your problem to solve. */
    /* IN THE FLAGSHIP'S SHADOW, EVERYTHING IS FOR SALE. The corruption
     * floor is a question about whether a bargain can be ENFORCED, and a
     * Syndicate capital standing over the scene is the answer to it — so
     * the floor lifts, the price comes down because the seller is
     * negotiating with somebody else's gun behind them, and the odds of it
     * staying bought go up for the same reason.
     *
     * Applied BEFORE the warship clause below, deliberately: a flagship can
     * buy a witness and it cannot buy a naval log, and standing nearby does
     * not change what is written in one. */
    if (!target.intimidate && capitalShadow(sys, t, scene)) {
      target.shadowed = true;
      target.possible = true;
      target.reason = null;
      target.price = Math.max(50, Math.round(target.price * SHADOW_DISCOUNT));
      target.stick = Math.min(0.97, target.stick + SHADOW_STICK);
    }

    if (target.pending && target.pending.sealed) {
      target.sealed = true;
      target.shadowed = false;
      target.intimidate = false;
      target.possible = false;
      target.price = 0;
      target.stick = 0;
      target.reason = 'a warship saw it — that log is not for sale';
    }
    return target;
  }

  /* Pay. Deterministic: the roll is hashed off the ACT, so reloading and
   * paying again buys you the same answer. Buying silence is a decision,
   * not a slot machine you can pull twice. */
  function hushWitness(sys, G, t, hooks) {
    var q = hushQuote(sys, G, t);
    if (!q) { if (hooks && hooks.say) hooks.say('Nobody is transmitting.', 3); return null; }
    if (!q.possible) { if (hooks && hooks.say) hooks.say(q.reason, 5); return null; }
    if (G.ship.credits < q.price) {
      if (hooks && hooks.say) {
        hooks.say('They want ' + Math.round(q.price) + ' cr and you have ' +
                  Math.round(G.ship.credits) + '.', 5);
      }
      return null;
    }

    if (q.price > 0) G.ship.credits -= q.price;
    if (q.intimidate) {
      /* Leaning on somebody is noticed by the flag they fly under, even
       * when it works. */
      var vf = q.pending ? q.pending.fac : (q.victim && q.victim.faction);
      if (vf && vf !== 'outlaw' && global.Missions) {
        global.Missions.bumpStanding(G, vf, -INTIMIDATE_STANDING_COST);
      }
    }
    var h = RNG.hashString('hush|' + ((sys && sys.seed) || '?') + '|' + q.kind + '|' +
                           Math.floor(q.at) + '|' + (q.who || '?'));
    var roll = (h % 10000) / 10000;

    if (roll < q.stick) {
      if (q.pending) G.pendingReport = null;
      if (q.victim) { q.victim.distressAt = null; q.victim.distressKind = null; }
      /* Only a PAID witness corrupts the place. Intimidation is fear, not
       * an institutional arrangement, and costs the player nothing to set
       * up — see the section comment above `bumpCorruption`. */
      if (!q.intimidate) bumpCorruption(G, CORRUPTION_BUMP_HUSH);
      if (hooks && hooks.say) {
        hooks.say(q.intimidate
          ? 'You had a word with ' + q.who + '. Nothing was transmitted.'
          : 'Paid ' + Math.round(q.price) + ' cr. ' + q.who + ' never saw a thing.', 6);
      }
      if (hooks && hooks.sound) hooks.sound('click');
      return { paid: q.price, stuck: true };
    }

    /* Took the money and talked. Exactly the risk the pirates are supposed
     * to be insuring against, which is why standing raises `stick` — and
     * why it never raises it to 1. */
    if (q.pending) { G.pendingReport = null; }
    if (q.victim) { q.victim.distressAt = null; q.victim.distressKind = null; }
    report(G, q.kind, { faction: q.pending ? q.pending.fac : (q.victim.faction || 'civil') },
           hooks, 'paid off and reported anyway');
    if (hooks && hooks.say) {
      hooks.say(q.intimidate
        ? q.who + ' called it in anyway. Somebody is braver than they look.'
        : 'You are out ' + Math.round(q.price) + ' cr and they transmitted anyway.', 7);
    }
    return { paid: q.price, stuck: false };
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

  /* ---- corruption: a fact about the government, and a lever on top -----
   * `sys.corruption` (buildGovernment, generate.js) is permanent and
   * deterministic — a fact about who runs the place, never touched here.
   * What lives on the SAVE is a SHIFT on top of it, keyed by star id:
   * `G.corruptionShift[id] = { v: <points>, t: <G.t when last touched> }`.
   * Positive only — nothing in this game currently makes a place cleaner,
   * only dirtier — and it decays back toward the baseline on its own,
   * because a bought official eventually retires. Read lazily rather than
   * ticked: nothing costs anything until somebody actually bribes someone,
   * the same discipline `npcShield` and the heat system already use.
   *
   * Three ways to move it, all writing through `bumpCorruption`, all read
   * back through `effectiveCorruption` — and everything that used to read
   * `sys.corruption` directly (the grey market gate, `hushQuote`'s
   * enforceability roll) now reads the effective number, because a bribe
   * that does not change what the game actually does with the place is
   * not a mechanic, it is a number in a save file:
   *
   *   - A witness PAID off (never one merely intimidated — that is fear,
   *     not corruption, and costs the player nothing to arrange) nudges it
   *     up a little. You did not set out to corrupt the place; you did it
   *     one bribe at a time.
   *   - A customs officer who takes a bribe instead of enforcing (see the
   *     new branch in `resolveScan`) nudges it up a little more — a more
   *     direct, more institutional transaction than a bystander pocketing
   *     cash to stay quiet.
   *   - `bribePort`, a deliberate lump sum the player can spend at any
   *     port's yard screen, moves it a lot in one purchase. This is "let
   *     the player corrupt a port" as its own action, not a side effect of
   *     something else. */
  var CORRUPTION_BUMP_HUSH = 1.5;       // one paid-off witness
  var CORRUPTION_BUMP_CUSTOMS = 2.5;    // one bribed inspection
  var CORRUPTION_BRIBE_AMOUNT = 40;     // the deliberate, expensive kind
  var CORRUPTION_SHIFT_CAP = 65;        // the government underneath still
                                         // shows through no matter how much
                                         // you spend
  var CORRUPTION_HALFLIFE = 21 * 86400; // s — three weeks to fade by half

  function decayedShift(G, id) {
    if (!id) return 0;
    var e = (G.corruptionShift || {})[id];
    if (!e || !e.v) return 0;
    var age = Math.max(0, (G.t || 0) - (e.t || 0));
    return e.v * Math.pow(0.5, age / CORRUPTION_HALFLIFE);
  }

  function bumpCorruption(G, amount) {
    if (!(amount > 0) || !G.here) return;
    var id = G.here.id;
    var cur = decayedShift(G, id);
    G.corruptionShift = G.corruptionShift || {};
    G.corruptionShift[id] = { v: Math.min(CORRUPTION_SHIFT_CAP, cur + amount), t: G.t };
  }

  /* `base` is whatever the caller already resolved `sys.corruption` (or its
   * legacy fallback) to be — this never re-derives that, so every call
   * site keeps its own existing fallback behaviour for a pre-Syndicate
   * save exactly as it was. `starId` defaults to the system you are
   * IN (`G.here`), which is what every gameplay check wants; the F2 chart
   * passes a star you are only looking at. */
  function effectiveCorruption(G, base, starId) {
    var id = starId || (G && G.here && G.here.id);
    var shift = decayedShift(G, id);
    if (!shift) return base;
    return Math.max(0, Math.min(100, Math.round(base + shift)));
  }

  /* Convenience wrapper for callers (screens.js) that have a system object
   * but do not want to re-derive the legacy-save fallback themselves. */
  function systemCorruption(G, sys, starId) {
    var base = (sys && sys.corruption !== undefined) ? sys.corruption : 40;
    return effectiveCorruption(G, base, starId);
  }

  function corruptionLabel(v) {
    // Bands lined up on the two thresholds that actually mean something —
    // HUSH_MIN_CORRUPTION and the grey market's minCorrupt (60, see GUNS) —
    // rather than picked for even spacing.
    return v < HUSH_MIN_CORRUPTION ? 'clean'
         : v < 60 ? 'bribeable' : 'bought';
  }
  function violenceLabel(v) {
    return v < 15 ? 'peaceful' : v < 40 ? 'policed'
         : v < 65 ? 'rough' : 'lawless';
  }

  /* The deliberate bribe. Priced off the port's own development — a
   * wealthier, more legitimate shopfront costs more to buy into — and
   * discounted by how corrupt the place already is, because the marginal
   * bribe is always cheaper than the first one. */
  function bribeCost(G, sys, port) {
    var dev = (port && port.market && typeof port.market.dev === 'number')
      ? port.market.dev : 0.35;
    var eff = systemCorruption(G, sys) / 100;
    return Math.round(18000 * (0.5 + dev) * (1 - eff * 0.6));
  }

  /* Always returns a result object rather than `null` on refusal, so a
   * caller with no `hooks` (the yard screen, which composes its own
   * message the way every other row here does) still has something to
   * read; a caller that does pass hooks also gets the automatic `say`. */
  function bribePort(G, sys, port, hooks) {
    if (!G.here) return { ok: false, why: 'nowhere to bribe anyone from' };
    if (decayedShift(G, G.here.id) >= CORRUPTION_SHIFT_CAP - 0.5) {
      if (hooks && hooks.say) hooks.say('There is nobody left here worth buying.', 4);
      return { ok: false, maxed: true, why: 'there is nobody left here worth buying' };
    }
    var cost = bribeCost(G, sys, port);
    if (G.ship.credits < cost) {
      if (hooks && hooks.say) {
        hooks.say('Buying this place costs ' + cost + ' cr — you have ' +
                  Math.round(G.ship.credits) + '.', 5);
      }
      return { ok: false, cost: cost, why: 'short ' + Math.round(cost - G.ship.credits) + ' cr' };
    }
    G.ship.credits -= cost;
    bumpCorruption(G, CORRUPTION_BRIBE_AMOUNT);
    if (hooks && hooks.say) {
      hooks.say('Paid ' + cost + ' cr. The right people here now owe you a favour.', 6);
    }
    if (hooks && hooks.sound) hooks.sound('click');
    return { ok: true, paid: cost };
  }

  /* ---- the waste ban -----------------------------------------------------
   * "Don't jump into a system where Chernobyl drives are banned."
   *
   * Except it is not the drive that is banned, and that distinction is the
   * whole mechanic. The Syndicate bans RADIOACTIVE WASTE in the systems it
   * holds, which is both a better law and a funnier one, since their own
   * disposal arrangements consist of dumping it across everybody else's
   * back garden. What they will not have is somebody else's tailings
   * decaying in their sky.
   *
   * Because the offence is the cargo and not the hardware:
   *   - You can fly a Chernobyl into a hold quite legally. Come in cold —
   *     make the last leg on hydrogen, or sell the waste before you jump —
   *     and there is nothing to charge you with. The ban is a decision you
   *     make before committing, which is why jumpPlan quotes `arrivesDirty`
   *     rather than springing it on arrival.
   *   - It catches you even without a drive. Hauling somebody else's waste
   *     to a disposal contract through Syndicate space is the same offence,
   *     which is exactly the kind of law a protection racket writes.
   *
   * Ten thousand, and an order to leave. Paying is not optional in the
   * sense that a bounty is: this comes straight off your credits, and what
   * you cannot cover is held against you as a citation, because the people
   * levying it are standing in front of you. */
  var WASTE_FINE = 10000;
  var EXPULSION_GRACE = 900;     // s — how long before they stop asking nicely

  /* One charge per arrival. Keyed to the star and the moment you got here,
   * so re-entering later is a fresh offence and bouncing between two
   * systems is not free. */
  function wasteCustoms(G, star, sys, hooks) {
    if (!G || !star || !G.galaxy) return null;
    var Galaxy = global.Galaxy;
    if (!Galaxy || !Galaxy.wasteBanned(G.galaxy, star)) return null;

    var waste = (G.ship.cargo && G.ship.cargo.waste) || 0;
    if (waste < 0.05) return null;

    var holder = G.galaxy.factionById[star.factionId];
    var name = (holder && holder.name) || 'Local control';

    G.ship.credits -= WASTE_FINE;
    var unpaid = 0;
    if (G.ship.credits < 0) { unpaid = -G.ship.credits; G.ship.credits = 0; }
    if (unpaid > 0) {
      G.wanted = G.wanted || {};
      G.wanted.outlaw = (G.wanted.outlaw || 0) + unpaid;
    }

    /* Ordered out. Not a wall — you can stay, and nothing stops you — but
     * the doors are shut while you are carrying it and everyone here knows
     * why you are still in the sky. */
    G.expelled = { star: star.id, faction: 'outlaw', sinceT: G.t,
                   until: G.t + EXPULSION_GRACE, reason: 'waste' };

    if (hooks && hooks.say) {
      hooks.say(name + ' customs: "' + waste.toFixed(1) + ' t of tailings in your hold. ' +
                WASTE_FINE.toLocaleString() + ' cr, and then you leave."' +
                (unpaid > 0 ? '  (' + Math.round(unpaid) + ' cr of it held against you.)' : ''), 10);
    }
    if (hooks && hooks.sound) hooks.sound('warn');
    return { fine: WASTE_FINE, unpaid: unpaid, waste: waste, faction: 'outlaw' };
  }

  /* Are you currently under an order to leave, here? Read by the docking
   * check — a port in a system that has expelled you does not open. */
  function expelledHere(G, star) {
    var x = G.expelled;
    if (!x || !star || x.star !== star.id) return null;
    /* Clearing it takes getting rid of the cargo, not waiting. */
    var waste = (G.ship.cargo && G.ship.cargo.waste) || 0;
    if (waste < 0.05) { G.expelled = null; return null; }
    return x;
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

  /* WHY a port will not open, in words, or null when it will.
   *
   * dockRefused answers yes or no, which is all the docking check itself
   * needs and is nowhere near enough for anything the player reads. The
   * HAIL path has explained itself since it was written — "a refusal the
   * player cannot read the reason for is indistinguishable from a bug",
   * a few hundred lines down — and the APPROACH path did not. So a barred
   * station looked exactly like an auto-dock that could not fly: the
   * autopilot flew the whole approach, sat in the envelope, and nothing
   * happened. Astra hit precisely that and reported it as a bug, which is
   * the correct thing to call it.
   *
   * One function, and every reader of a refusal goes through it. */
  function dockRefusal(G, port) {
    if (!port) return null;
    /* Under an order to leave, nothing here opens for you. Not a separate
     * punishment so much as the same one: "and then you leave" is not a
     * request if you can still dock, refuel and carry on trading. Dumping
     * or selling the waste lifts it immediately — see expelledHere. */
    if (G.expelled && G.here && expelledHere(G, G.here)) {
      return { why: 'expelled', short: 'ORDERED OUT',
               text: 'you are under an order to leave this system — sell or dump ' +
                     'the tailings and every door here opens again' };
    }
    if (port.faction && wantedHere(G, port.faction)) {
      var fug = G.fugitive && G.fugitive.faction === port.faction;
      return fug
        ? { why: 'fugitive', short: 'FUGITIVE',
            text: 'they have you down as a fugitive — that is what arriving ' +
                  'unannounced costs. Nothing of theirs will open.' }
        : { why: 'wanted', short: 'WANTED',
            text: 'your bounty with them is past what they will overlook — ' +
                  'pay it off somewhere that will still take you' };
    }
    return null;
  }

  function dockRefused(G, port) { return !!dockRefusal(G, port); }

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

    var scanFac = spec.faction || 'civil';
    var found = [];
    for (var cid in ship.cargo) {
      if (!(ship.cargo[cid] > 1e-9)) continue;
      var sev = contrabandSeverity(G, cid, scanFac);
      if (sev > 0) found.push({ cid: cid, sev: sev });
    }
    if (!found.length) {
      if (hooks && hooks.say) hooks.say(spec.name + ' scans your hold — nothing flagged, cleared', 5);
      if (hooks && hooks.sound) hooks.sound('click');
      return { searched: true, contraband: false };
    }

    /* Caught red-handed is not the end of it where the inspector can be
     * bought. This is corruption's own consequence, distinct from what
     * violence already does above (a lawless place simply has nobody to
     * do the searching) — here somebody DOES search, and DOES find it, and
     * takes a cut instead of writing it up. Below HUSH_MIN_CORRUPTION
     * there is nobody to take the offer, same floor the witness system
     * uses, and the chance never reaches certainty: a corrupt port still
     * has the occasional inspector who is not for sale. */
    var corrupt = systemCorruption(G, sys);
    var bribeChance = Math.max(0, Math.min(0.75, (corrupt - HUSH_MIN_CORRUPTION) / 100));
    if (bribeChance > 0 && Math.random() < bribeChance) {
      var wouldBeFine = 0;
      found.forEach(function (f) { wouldBeFine += fineFor(ship.cargo[f.cid], f.sev); });
      var ask = Math.max(50, Math.round(wouldBeFine * 0.55));
      if (ship.credits >= ask) {
        ship.credits -= ask;
        bumpCorruption(G, CORRUPTION_BUMP_CUSTOMS);
        if (hooks && hooks.say) {
          hooks.say(spec.name + ' finds it — and a quiet word costs you ' + ask +
                    ' cr. Cargo stays aboard.', 6);
        }
        if (hooks && hooks.sound) hooks.sound('click');
        return { searched: true, contraband: true, bribed: true, paid: ask };
      }
      // Can't afford the quiet word — the book gets thrown after all.
    }

    var fine = 0, seized = [], worst = 0;
    found.forEach(function (f) {
      var qty = ship.cargo[f.cid];
      fine += fineFor(qty, f.sev);
      if (f.sev > worst) worst = f.sev;
      seized.push(qty.toFixed(0) + 't ' + Economy.BY_ID[f.cid].name);
      delete ship.cargo[f.cid];
    });
    if (global.Sim) global.Sim.refreshShip(ship);
    fine = Math.round(fine);

    var fac = scanFac;
    G.wanted = G.wanted || {};
    G.wanted[fac] = (G.wanted[fac] || 0) + fine;
    /* The faction remembers a smuggler the same way it remembers a blown
     * contract — bumpStanding lives in missions.js, which always loads
     * after combat.js, so it is only ever resolved here, at call time.
     *
     * Graded by the WORST thing found, not the sum: being caught with a
     * hold of narcotics and one tonne of naval fuel is a naval-fuel
     * problem, and averaging it would say otherwise. */
    if (global.Missions) {
      global.Missions.bumpStanding(G, fac, STANDING_HIT[worst] || STANDING_HIT[1]);
    }

    if (hooks && hooks.say) {
      hooks.say((worst >= 3 ? 'NAVAL MATERIEL FOUND: ' : 'CONTRABAND FOUND: ') +
                seized.join(', ') + ' seized — fined ' + fine + ' cr', 7);
    }
    if (hooks && hooks.sound) hooks.sound('warn');
    return { searched: true, contraband: true, fine: fine, seized: seized,
             severity: worst };
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

  /* ---- cutting the line --------------------------------------------------
   * A full port refuses clearance and tells you to hold. The clamps still
   * take you — the gate stays soft, for the same reason it always was — so
   * you CAN put your hull in a berth somebody else is queued for. Doing it
   * is free the first ten times and then it is not.
   *
   * FREE_JUMPS is not leniency for its own sake. A penalty that starts on the
   * first offence teaches the player that the queue is a wall, and the whole
   * point of a soft gate is that it is a decision with a price. Ten is enough
   * that a pilot who does it in an emergency never notices, and few enough
   * that one who does it as a habit ends up unwelcome. After that each
   * offence is a flat -1 with that faction, cumulative and permanent until
   * they earn it back the ordinary way.
   *
   * -1 rather than a scaling penalty deliberately: it has to be legible.
   * "Every time I barge in I lose a point" is a rule a player can hold in
   * their head and choose against. */
  var FREE_JUMPS = 10;
  var JUMP_STANDING = -1;

  function queueJumpsOf(G, fac) {
    return ((G && G.queueJumps) || {})[fac] || 0;
  }

  /* Books one line-cut against a faction and returns what it cost, so the
   * caller can tell the player rather than silently docking their standing. */
  function bookQueueJump(G, fac) {
    G.queueJumps = G.queueJumps || {};
    var n = (G.queueJumps[fac] || 0) + 1;
    G.queueJumps[fac] = n;
    if (n <= FREE_JUMPS) {
      return { count: n, standing: 0, remaining: FREE_JUMPS - n };
    }
    if (global.Missions) global.Missions.bumpStanding(G, fac, JUMP_STANDING);
    return { count: n, standing: JUMP_STANDING, remaining: 0 };
  }

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
  /* A wait a pilot can act on. Seconds are useless past a minute and hours
     are useless under one. */
  function fmtWait(s) {
    if (!isFinite(s) || s <= 0) return 'moments';
    if (s < 90) return Math.round(s) + 's';
    if (s < 5400) return Math.round(s / 60) + ' min';
    return (s / 3600).toFixed(1) + ' hr';
  }

  /* WHY THIS PORT WOULD SAY NO, or null when it would say yes.
   *
   * Split out of requestClearance because two callers now need the same
   * judgement and only one of them is allowed to speak: the port calls YOU
   * on approach (autoClearance) and must stay silent when the answer is a
   * refusal, or every wanted pilot in the game would be nagged by every
   * marker they drifted past. Same shape as dockRefusal, one line above the
   * yes/no, for the same reason — a port that answers one way in words and
   * another in fact is the disagreement both of these exist to prevent. */
  function clearanceRefusal(G, port, berths) {
    var name = (port && port.name) || 'Port control';
    var fac = (port && port.faction) || 'civil';

    if (wantedHere(G, fac)) {
      /* The same bounty that already closed the station doors. It now
       * closes the ground ones too, which is the point of the change —
       * and is exactly why wilderness landing had to stay open. */
      return { granted: false, reason: 'wanted',
               text: name + ': "You are wanted here. Clearance DENIED."' };
    }
    if (((G.standing || {})[fac] || 0) <= HOSTILE_STANDING) {
      return { granted: false, reason: 'hostile',
               text: name + ': "We know who you are. Clearance DENIED."' };
    }
    if (berths && berths.full) {
      /* Not a refusal of YOU — a refusal of the moment, and it says so and
         says how long. A hold with no number attached is indistinguishable
         from being turned away. */
      var jumps = queueJumpsOf(G, fac);
      var res = { granted: false, reason: 'full', wait: berths.waitFor,
                  queue: berths.occupied, capacity: berths.capacity,
                  text: name + ': "All ' + berths.capacity + ' berths occupied. Hold at the marker — ' +
                        fmtWait(berths.waitFor) + ' to the next departure."' };
      if (jumps >= FREE_JUMPS) {
        res.text += ' [' + jumps + ' unauthorised arrivals on your record here]';
      }
      return res;
    }
    return null;
  }

  function grantClearance(G, port) {
    var k = portKey(port);
    if (!k || !G.ship) return false;
    G.ship.cleared = G.ship.cleared || {};
    G.ship.cleared[k] = true;
    return true;
  }

  function requestClearance(G, port, hooks, berths) {
    var k = portKey(port);
    if (!k) return { granted: false, reason: 'nobody', text: 'No one to hail.' };

    var name = port.name || 'Port control';
    var res = clearanceRefusal(G, port, berths);
    if (!res) {
      grantClearance(G, port);
      res = { granted: true, reason: null,
              text: name + ': "Clearance granted. Pad is yours."' };
    }

    if (hooks && hooks.say) hooks.say(res.text, 6);
    if (hooks && hooks.sound) hooks.sound(res.granted ? 'click' : 'warn');
    return res;
  }

  /* THE PORT CALLS YOU.
   *
   * Clearance was always the same three keystrokes in the same order —
   * open comms, pick the port, ask — and the answer was yes almost every
   * time. What the ritual actually produced was not tension but a trap:
   * forget it once and you arrive unannounced, which is a fine, a standing
   * hit and a FUGITIVE flag, and a fugitive's doors do not open. A player
   * could lose an evening's work to a step that a real controller would
   * have initiated themselves.
   *
   * So a port with room hails an approaching ship and clears it. The
   * mechanic is not removed — it is inverted. It still refuses, and the
   * refusals are the interesting half: wanted here, hostile, or full. When
   * the answer would be no, this says NOTHING and returns null, leaving the
   * player to hail and hear why. Being ignored by a port is itself the
   * signal that something is wrong, and it costs no message line.
   *
   * LAUNCH IS UNCHANGED, deliberately. Asking to leave is the half with a
   * real decision in it — it is where a hold full of something is a
   * problem, and where a port can keep you sitting on the clamps. Nothing
   * about that is busywork, so nothing about it is automated.
   *
   * Returns the grant when it made one, null otherwise. */
  function autoClearance(G, port, hooks, berths) {
    if (!G || !G.ship || !port) return null;
    if (isCleared(G, port)) return null;
    if (clearanceRefusal(G, port, berths)) return null;
    if (!grantClearance(G, port)) return null;
    var name = port.name || 'Port control';
    var res = { granted: true, reason: null, auto: true,
                text: name + ': "We have you on approach. Cleared in — ' +
                      (port.surface ? 'pad' : 'berth') + ' is yours."' };
    if (hooks && hooks.say) hooks.say(res.text, 6);
    if (hooks && hooks.sound) hooks.sound('click');
    return res;
  }

  /* Called the moment a dock or a pad landing completes. Consumes the
   * clearance if there was one, and books the offence if there was not.
   * Returns null when everything was in order. */
  function arriveAtPort(G, port, hooks, berths) {
    var k = portKey(port);
    if (!k) return null;

    var fac0 = (port.faction) || (G.sys && G.sys.factions && G.sys.factions[0] &&
                                  G.sys.factions[0].id) || 'civil';

    /* CUTTING THE LINE is a separate offence from arriving unannounced, and
       they stack. You can hold clearance granted before the port filled up and
       still be taking a berth somebody is waiting for; you can also barge in
       uncleared, which is both. Booked on the port being FULL at the moment
       the clamps close, because that is the fact that harmed anyone. */
    var jumped = null;
    /* UNLESS THE PORT SAID YES. Clearance is the port allocating a berth to
     * this ship, and the sweep never grants one while the port is full — so
     * a cleared ship arriving into a full port is a ship whose berth was
     * promised and then taken by the timetable between the hail and the
     * clamps. Charging for that is the port billing you for its own
     * overbooking, and it stacked: the fine below fires for the same
     * arrival, so one busy afternoon cost a citation AND a standing hit.
     *
     * It is not a loophole either way round. Clearance is spent on arrival,
     * so it cannot be hoarded against a rush, and it cannot be obtained
     * during one. Barging in without it at a full port is still both
     * offences, which is the case the queue is actually about.
     *
     * Found by a brand-new career: the opening berth is granted clearance a
     * few lines into newGame, and when the home port's timetable happened
     * to have all five small berths full at t=0 the first message a player
     * ever saw was being logged for taking someone's berth — over the top
     * of the line telling them which key launches. */
    if (berths && berths.full && !isCleared(G, port)) {
      jumped = bookQueueJump(G, fac0);
      if (hooks && hooks.say) {
        var pname = port.name || 'Port control';
        if (jumped.standing) {
          hooks.say(pname + ': "You took an occupied berth. That is ' + jumped.count +
                    ' now — it is going on your record." (standing ' + jumped.standing + ')', 7);
        } else {
          hooks.say(pname + ': "You took an occupied berth. Logged. ' +
                    jumped.remaining + ' more and it starts costing you."', 6);
        }
      }
      if (hooks && hooks.sound) hooks.sound('warn');
    }

    if (isCleared(G, port)) {
      delete G.ship.cleared[k];      // spent: the next visit is a new ask
      return jumped ? { queueJump: jumped } : null;
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
    return { fine: fine, faction: fac, fugitive: true, queueJump: jumped };
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
    /* A BREACH IS A THIRD LIVE PERMISSION, and adding it here rather than in
     * the renderer is the whole integration. `ref/PORT-MODELS.md`: "a breach
     * grants the same command set a clearance does". It does not defeat the
     * interlocks, because those are mechanical — the car still cannot come
     * flush while the leaves are shut, and the arrival rail drives the gate
     * poses off which leg it is on, not off who is allowed to be there. */
    return isCleared(G, port) || launchCleared(G, port) || breachedHere(G, port);
  }

  /* ---- BREAKING INTO THE CABINET ----------------------------------------
   * Faction standing decides the odds of being GRANTED clearance. It has no
   * bearing whatever on whether the cabinet can be TAKEN — that is the point
   * of the thing standing outside on the rock where anyone can land beside
   * it, and it is the smuggler's route into a port that will never clear
   * them. A ship the whole sector wants can still get through the door.
   *
   * What it costs: the attempt is loud. `alarmOnFail` books the offence
   * against the port's owner, so a failed run at a well-run port turns a
   * closed door into a bounty, and the same doors are then shut to you by
   * `dockRefused` for a reason you brought on yourself.
   *
   * THE ROLL IS ALLOWED TO BE UNREPEATABLE. Doctrine 1 forbids Math.random
   * in generation and in anything the player can revisit — the cabinet's
   * difficulty is derived and stable, and is the part that must not move.
   * Whether this particular attempt beat it is an in-the-moment die roll,
   * the same class as a customs search or a witness deciding to talk. */

  var HACK_COOLDOWN = 45;        // s of sim time before the panel will retry
  var HACK_TOOL = 'breaker';     // the fitted module that makes it possible
  var HACK_SKILL = 0.30;         // what a bare attempt is worth without one

  function breachedHere(G, port) {
    var k = portKey(port);
    return !!(k && G.ship && G.ship.breached && G.ship.breached[k]);
  }

  /* How good the ship is at this: the best `breach` rating among the fitted
   * equipment, or the bare-hands figure.
   *
   * READ OFF A FIELD RATHER THAN AN ID so that adding the module later is a
   * data change and not a code change — the same reason `vsShield` lives on
   * the gun and not in a table of gun names.
   *
   * HONEST NOTE: nothing in EQUIPMENT carries `breach` yet, so today every
   * attempt is the bare 0.30 and this loop always falls through. That makes
   * the module the next thing this mechanic wants, and it is deliberately
   * NOT being added in the same pass as the shop catalogue it would have to
   * be priced and stocked into. Against a backwater at difficulty 0.15 the
   * bare odds are 0.30/(0.30+0.15) = 67%; against a core world at 0.90 they
   * are 25%. So the mechanic is playable without the module and clearly
   * better with it, which is the shape it should have had anyway. */
  function breakerRating(ship) {
    var best = HACK_SKILL;
    if (!ship) return best;
    var list = fittedList(ship);
    for (var i = 0; i < list.length; i++) {
      var b = list[i].item && list[i].item.breach;
      if (typeof b === 'number' && b > best) best = b;
    }
    return best;
  }

  /* A breach lasts while you are here and is forgotten when you leave, the
   * same way active pursuit ends at the system boundary. Called from
   * fleeSystem's neighbourhood rather than kept forever, because a port
   * whose lock you broke once is not a port you own. */
  function clearBreaches(G) {
    if (G.ship) G.ship.breached = {};
  }

  /* Returns { ok, reason, text, alarm } and never throws. The text is what
   * the attempt looks like from the cockpit, because a refusal whose reason
   * the player cannot read is indistinguishable from a bug. */
  function hackControl(G, port, hooks, t) {
    var name = (port && port.name) || 'the port';
    var k = portKey(port);
    var Gen = global.Gen, Sim = global.Sim;

    if (!k || !port || !port.surface) {
      return say0(hooks, { ok: false, reason: 'nothing',
        text: 'Nothing here answers to a ground channel.' });
    }
    var c = Gen && Gen.controlFor ? Gen.controlFor(port, G.sys) : null;
    if (!c) {
      return say0(hooks, { ok: false, reason: 'nothing',
        text: name + ' has no ground control cabinet.' });
    }
    if (breachedHere(G, port)) {
      return say0(hooks, { ok: true, reason: 'already',
        text: name + ' control is already yours.' });
    }
    /* ALREADY CLEARED IS A REFUSAL, and a deliberate one. Breaking into a
     * door that is standing open for you is not a shortcut, it is a crime
     * with no upside — and letting it succeed silently would teach the
     * player that hacking is simply what you do at every port. */
    if (isCleared(G, port)) {
      return say0(hooks, { ok: false, reason: 'cleared',
        text: name + ': you already hold clearance. Nothing to break.' });
    }
    if (Sim && Sim.controlInRange &&
        !Sim.controlInRange(G.ship, port, G.sys, t || G.t)) {
      return say0(hooks, { ok: false, reason: 'range',
        text: 'Out of range of ' + name + ' control. Set down beside the cabinet.' });
    }
    var until = (G.ship && G.ship.hackAfter) || 0;
    if ((t || G.t) < until) {
      return say0(hooks, { ok: false, reason: 'cooldown',
        text: name + ' control has locked its panel. Wait ' +
              fmtWait(until - (t || G.t)) + '.' });
    }

    /* The tool matters more than the pilot. Without a breaker fitted this is
     * a long shot at anything but a backwater, which is what makes the module
     * worth buying rather than a tax on wanting to use the mechanic. */
    var tool = breakerRating(G.ship);
    var diff = c.security.hackDifficulty;
    var odds = Math.max(0.02, Math.min(0.97, tool / (tool + diff)));

    if (G.ship) G.ship.hackAfter = (t || G.t) + HACK_COOLDOWN;

    if (Math.random() < odds) {
      G.ship.breached = G.ship.breached || {};
      G.ship.breached[k] = true;
      return say0(hooks, { ok: true, reason: null, alarm: false,
        text: name + ' control: PANEL OPEN. Doors answering.' }, 'click');
    }

    /* Failed, and heard. The offence is booked against the owner rather than
     * the generic civil authority: you broke into THEIR cabinet. */
    var res = { ok: false, reason: 'failed', alarm: true,
      text: name + ' control: ACCESS REFUSED — alarm tripped.' };
    if (c.security.alarmOnFail) {
      var fac = c.security.owner ||
                (G.sys && G.sys.factions && G.sys.factions[0] &&
                 G.sys.factions[0].id) || 'civil';
      G.wanted = G.wanted || {};
      G.wanted[fac] = (G.wanted[fac] || 0) + BREACH_FINE;
      if (global.Missions) global.Missions.bumpStanding(G, fac, -8);
    }
    return say0(hooks, res, 'warn');
  }

  var BREACH_FINE = 350;

  function say0(hooks, res, snd) {
    if (hooks && hooks.say) hooks.say(res.text, 6);
    if (hooks && hooks.sound) hooks.sound(snd || (res.ok ? 'click' : 'warn'));
    return res;
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
    /* AND THE BREACHES, for the same reason and on the same trip. A panel
     * you forced is local to the system you forced it in — a port whose lock
     * you broke once is not a port you own, and carrying breaches across a
     * jump would quietly turn one good roll into permanent access to a
     * station you are still wanted at. The cooldown goes too: it is a panel
     * locking you out, not something you carry. */
    if (G && G.ship) { G.ship.breached = {}; G.ship.hackAfter = 0; }
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
   * The LENGTH does not scale with tonnage, and that is deliberate rather
   * than lazy: render.js draws every hull at one SHIP_LEN, so stretching the
   * muzzles to match a Mule's tonnage would hang them off a hull that is not
   * there.
   *
   * IT DOES FOLLOW THE RENDERER, though, which it did not use to. This was a
   * second copy of SHIP_LEN written out as a number with a comment pointing
   * at the first one — the exact duplicate-constant trap CLAUDE.md warns
   * about, and a live one: change the drawn hull length and every beam in
   * the game would leave from a point on a ship that is no longer there.
   * Read through `global.Render` at call time rather than bound at load,
   * because combat.js loads before render.js does (index.html's order), the
   * same reach generate.js makes for the port library. */
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
  function hullLen() {
    var R = global.Render;
    return (R && R.SHIP_LEN) || 0.010;
  }
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
    var len = hullLen();
    return { r: side * len * MUZZLE_SPREAD * girth * rank,
             u: -len * MUZZLE_DOWN,
             f: len * MUZZLE_FWD };
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

      /* A salvaged emitter that fails to cycle.
       *
       * The cooldown is set BEFORE this test and the heat is spent below,
       * which is the entire punishment and it is the right one: the
       * capacitor charged, dumped into the housing, and no light came out.
       * You lose the shot and the second you were going to fire it in.
       * Taking the heat as well is what stops "it misfired" from being a
       * free pause in an overheating fight.
       *
       * A live die roll, not a hash, and deliberately so. The seeded-
       * generation doctrine governs what the WORLD is — a pirate's hold,
       * a system's government, where a vineyard grows. It does not govern
       * whether a bad capacitor holds this particular time, which is
       * exactly the class of in-the-moment roll the project already
       * accepts alongside a customs search and an NPC's shot connecting. */
      if (e.item.misfire && Math.random() < e.item.misfire) {
        addHeat(G, (e.item.heat || 0) * (e.item.cooldown || 0));
        if (hooks && hooks.say && t >= (G.misfireAt || -Infinity) + 3) {
          G.misfireAt = t;
          hooks.say(e.item.name.toUpperCase() + ' FAILED TO CYCLE', 2.5);
        }
        if (hooks && hooks.sound) hooks.sound('warn');
        continue;
      }

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
    var turMz = { r: 0, u: hullLen() * 0.12, f: hullLen() * 0.18 };
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
    /* Nothing else leaves a rail that already has something stuck on it. */
    if (G.hungSeeker) {
      if (hooks && hooks.say) hooks.say('Rail is fouled — jettison or wait', 2);
      return;
    }
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
    var m = MISSILES[s.missileId || 'hawk'] || MISSILES.hawk;

    /* Did it leave the rail? Bootleg ordnance sometimes does not. The round
     * is spent either way — the motor lit. */
    if (m.grey) {
      var pHang = hangChanceFor(s.heat || 0) * batchFactor(s);
      if (Math.random() < pHang) {
        var hr = racksOf(s)[s.missileId];
        if (hr) hr.n = Math.max(0, hr.n - 1);
        syncRacks(s);
        G.hungSeeker = { until: t + HANG_WINDOW, rack: s.missiles, kind: m.id };
        if (hooks && hooks.say) {
          hooks.say('SEEKER HUNG — BACKSPACE TO JETTISON RACK (' +
                    s.missiles + ' left)', HANG_WINDOW);
        }
        if (hooks && hooks.sound) hooks.sound('warn');
        return;
      }
    }

    /* Off the RACK, and the legacy counter follows it rather than the other
     * way round. */
    var rack = racksOf(s)[s.missileId];
    if (rack) rack.n = Math.max(0, rack.n - 1);
    syncRacks(s);
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

  /* Dump the rack. Certain, total, and free of consequences beyond the
   * ordnance itself — which is exactly what makes riding it out a real
   * decision rather than a formality. */
  function jettisonRack(G, hooks) {
    if (!G.hungSeeker) return false;
    var lost = G.ship.missiles;
    /* THE ARMED RACK GOES, not the whole magazine. With one rack those were
     * the same sentence; with two they are not, and dumping a clean crate
     * of Hawks because a bootleg hung on the rail beside it would be the
     * game punishing the wrong decision. */
    var racks = racksOf(G.ship);
    if (racks[G.ship.missileId]) delete racks[G.ship.missileId];
    syncRacks(G.ship);
    G.hungSeeker = null;
    if (hooks && hooks.say) {
      hooks.say('Rack away — ' + lost + ' round' + (lost === 1 ? '' : 's') +
                ' overboard, hull intact.', 5);
    }
    if (hooks && hooks.sound) hooks.sound('click');
    return true;
  }

  /* The window closing. Cold hulls usually clear; hot ones usually do not.
   * Rolled at the moment of resolution rather than at the moment of the
   * hang, so the heat that decides it is the heat you are carrying WHEN IT
   * MATTERS — cutting your burn during those two seconds is a real thing
   * you can do about it. */
  function resolveHungSeeker(sys, G, t, hooks) {
    var h = G.hungSeeker;
    if (!h || t < h.until) return;
    G.hungSeeker = null;

    var heat = G.ship.heat || 0;
    var span = Math.max(0, Math.min(1, heat / 100));
    var clear = HANG_CLEAR_COLD + (HANG_CLEAR_HOT - HANG_CLEAR_COLD) * span;
    if (Math.random() < clear) {
      if (hooks && hooks.say) hooks.say('Seeker separated late — rail clear.', 4);
      if (hooks && hooks.sound) hooks.sound('missile');
      return;
    }

    var rounds = G.ship.missiles;
    var dmg = Math.max(COOKOFF_FLOOR, rounds * COOKOFF_PER_ROUND);
    G.ship.missiles = 0;
    G.ship.hullHp = Math.max(0, (G.ship.hullHp || 0) - dmg);
    if (hooks && hooks.say) {
      hooks.say('RACK COOKED OFF — ' + Math.round(dmg) + ' hull, ' +
                rounds + ' round' + (rounds === 1 ? '' : 's') + ' gone.', 8);
    }
    if (hooks && hooks.sound) hooks.sound('warn');
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

      /* The Syndicate's own police patrol — not a loitering pirate, which
       * stays on NPC_GUN like it always has — carries what its own
       * enforcement wing can buy. See SYNDICATE_GUN. */
      var elite = sp.kind === 'police' && sp.faction === 'outlaw';
      var gun = (sp.kind === 'trader' || sp.defending) ? TRADER_GUN
              : elite ? SYNDICATE_GUN : NPC_GUN;
      var d = V.dist(sp.live.pos, s.pos);
      if (d > gun.range) continue;
      if (t < (sp.coolUntil || 0)) continue;
      sp.coolUntil = t + gun.cooldown;
      /* Their emitter, their hull. No `by` — a ship that overheats firing
         its own guns did that to itself. */
      addNpcHeat(sp, (gun.heat || 0) * (gun.cooldown || 0), null);

      var transverse = V.len(V.sub(s.vel, sp.live.vel));
      var chance = Math.max(0.12, Math.min(0.85,
        1.0 - d / gun.range * 0.5 - transverse * 1.4));
      (G.beams = G.beams || []).push({
        from: V.clone(sp.live.pos), to: V.clone(s.pos),
        color: gun === TRADER_GUN ? '#ffc46b' : elite ? '#c86bff' : '#ff8a76',
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
    updateSink(G, t, hooks, sys);
    updateTurret(sys, G, t, hooks);
    updateMissiles(sys, G, t, dtSim, hooks);
    updateNpcFire(sys, G, t, dtSim, hooks);

    updateNpcHeat(sys, G, t, dtSim, hooks);
    resolveHungSeeker(sys, G, t, hooks);

    /* A witness's call, if it was neither bought nor intimidated away. */
    if (G.pendingReport && t >= G.pendingReport.at) {
      report(G, G.pendingReport.kind, { faction: G.pendingReport.fac }, hooks,
             'witnessed by ' + G.pendingReport.by);
      G.pendingReport = null;
    }

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

  /* ---- talking to a ship that is not a threat ----------------------------
   * Astra: "This might require the ability to hail other ships to ask for
   * directions, assistance or to trade?"
   *
   * It did, and the reason is the map. Once the chart is something you
   * assemble by flying, the other ships in the system are the only other
   * people who have BEEN anywhere - and asking them is both the obvious
   * thing a pilot would do and the cheapest chart in the game.
   *
   * Three intents, deliberately three rather than a dialogue tree: the tree
   * is the next piece of work and this is the shape it grows into. Each one
   * is a transaction with a price the player can see before pressing, which
   * is the same contract the port options already keep.
   *
   * A HOSTILE SHIP ANSWERS NONE OF THEM. Not as a rule written here - the
   * comms screen greys them out - but the guard is repeated at the bottom
   * of the stack anyway, because "the UI will not offer it" is not the same
   * statement as "it cannot happen".
   */
  var HAIL_RANGE_KM = 120;          // the transmitter, not the radar
  var ASSIST_FUEL_MAX = 8;          // t of hydrogen a passing ship will spare
  var ASSIST_MARKUP = 2.4;          // what a rescue costs out in the black
  var TRADE_MARKUP = 1.35;          // buying off a hull that is not a shop
  var TRADE_DISCOUNT = 0.82;        // and selling to one

  function hailRefusal(G, contact) {
    if (!contact || !contact.pos) return 'No channel open.';
    if (contact.hostile) return null;            // handled by the caller's wording
    var range = V.dist(contact.pos, G.ship.pos);
    if (range > HAIL_RANGE_KM) {
      return 'Out of transmitter range — close to under ' + HAIL_RANGE_KM + ' km.';
    }
    return null;
  }

  /* What this ship would sell you, and what it would take off your hands.
   * Read off the manifest it is actually flying, so a hauler full of
   * tailings offers tailings and a tanker offers hydrogen - the answer is
   * the cargo the timetable says is aboard, not a shop window. */
  function hailTrade(G, contact) {
    var Eco = global.Economy;
    if (!Eco) return null;
    var s = G.ship;
    var man = (contact.route && contact.manifest) || [];
    var hold = global.Sim ? global.Sim.cargoMass(s) : 0;
    var room = Math.max(0, (s.cargoCap || 0) - hold);

    var buy = null, i;
    for (i = 0; i < man.length; i++) {
      var cid = man[i].cid, qty = man[i].qty || man[i].tonnes || 0;
      var com = Eco.BY_ID[cid];
      if (!com || qty <= 0 || com.base <= 0) continue;      // nobody sells you waste
      var take = Math.min(6, Math.floor(qty), Math.floor(room));
      if (take < 1) continue;
      buy = { cid: cid, name: com.name, qty: take,
              each: Math.round(com.base * TRADE_MARKUP) };
      break;
    }

    /* And what they would take. A ship buys what its DESTINATION is short
     * of, which is the same question the manifest generator answers - so
     * this is not a second economy, it is the same one asked from the other
     * end. */
    var sell = null;
    var dst = contact.to;
    if (dst && dst.market) {
      var best = 0;
      for (var cid2 in (s.cargo || {})) {
        var have = s.cargo[cid2];
        var row = dst.market.rows[cid2];
        var com2 = Eco.BY_ID[cid2];
        if (!have || !row || !com2 || com2.base <= 0) continue;
        if (!row.importer) continue;
        var val = com2.base * Math.min(have, 8);
        if (val > best) {
          best = val;
          sell = { cid: cid2, name: com2.name, qty: Math.min(have, 8),
                   each: Math.round(com2.base * TRADE_DISCOUNT) };
        }
      }
    }
    return { buy: buy, sell: sell };
  }

  /* Whether this ship can spare fuel, and what it wants for it. Gated on
   * the player actually being in trouble: a ship will not act as a floating
   * pump for somebody who simply did not want to fly to a port. */
  function hailAssist(G, contact) {
    var Eco = global.Economy;
    var s = G.ship;
    var cap = s.fuelCap || 1;
    if (s.fuel > cap * 0.3) return null;
    var want = Math.min(ASSIST_FUEL_MAX, Math.max(1, Math.round(cap * 0.5 - s.fuel)));
    if (want < 1) return null;
    var base = (Eco && Eco.BY_ID.hydrogen) ? Eco.BY_ID.hydrogen.base : 55;
    return { tonnes: want, each: Math.round(base * ASSIST_MARKUP),
             cost: Math.round(base * ASSIST_MARKUP) * want };
  }

  /* DIRECTIONS, and this is the one that matters. A ship that has flown
   * somewhere knows what is there, and what it knows is exactly the kind of
   * knowing the chart trades in: whose flag flies over a system. So asking
   * is a free sheet for one system - and once asked, that ship has told you
   * what it knows, which is what `_told` records. The charts you buy at a
   * port are for everything else.
   *
   * It also names the nearest port it would recommend for what you are
   * carrying, because that is the other thing you would actually ask. */
  function hailDirections(G, sys, t, contact, hooks) {
    var said = [];
    var route = contact.route;
    var Galaxy = global.Galaxy;

    if (contact.to && contact.to.name) {
      said.push('running ' +
        ((contact.manifest && contact.manifest.length)
          ? (global.Economy && global.Economy.BY_ID[contact.manifest[0].cid]
              ? global.Economy.BY_ID[contact.manifest[0].cid].name.toLowerCase()
              : 'freight')
          : 'empty') +
        ' into ' + contact.to.name);
    }

    /* The sheet. One uncharted system within this ship's own reach, nearest
     * first, so the answer is somewhere you could actually go next. */
    var charted = null;
    if (Galaxy && G.galaxy && G.here && route && !route._told) {
      var best = null, bestD = Infinity;
      for (var i = 0; i < G.galaxy.stars.length; i++) {
        var st = G.galaxy.stars[i];
        if (st.id === G.here.id || (G.charted && G.charted[st.id])) continue;
        var d = Galaxy.distance3(st, G.here);
        if (d < bestD) { bestD = d; best = st; }
      }
      if (best) {
        route._told = true;
        G.charted = G.charted || {};
        G.charted[best.id] = true;
        charted = best;
      }
    }

    var text = contact.name + ': "' + (said.length ? said.join(', ') : 'nothing much') + '.';
    if (charted) {
      var fac = G.galaxy.factionById[charted.factionId];
      text += ' Came through ' + charted.name +
              (fac ? ' — that is ' + fac.name + ' space' : '') + '.';
    } else if (route && route._told) {
      text += ' Told you everything I know.';
    }
    text += '"';
    if (hooks && hooks.say) hooks.say(text, 7);
    return { charted: charted };
  }

  /* The one entry point, so the comms screen never has to know which of
   * these is a transaction and which is conversation. */
  /* What a warship says when you call it. Three answers, in the order the
   * law would apply them: wanted, carrying, or neither. */
  function hailChallenge(G, sys, t, contact, hooks) {
    function talk(msg, secs) { if (hooks && hooks.say) hooks.say(msg, secs || 6); }
    var fac = contact.faction || null;
    var name = contact.name || 'the warship';

    if (fac && wantedHere(G, fac)) {
      talk(name + ': "We have your registration. Cut thrust and hold station."', 7);
      /* It does not chase — it does not have to. What it does is stop
       * pretending it has not seen you, which is what turns its watch from
       * a number in a file into something happening now. */
      contact.hostileToPlayer = true;
      contact.mode = 'attack';
      return { challenge: 'wanted', faction: fac };
    }

    var dirty = fac ? contrabandAboardFor(G, fac) : null;
    if (dirty) {
      talk(name + ': "You are inside our watch carrying ' + dirty.name.toLowerCase() +
           '. We are not customs. They are."', 7);
      return { challenge: 'contraband', cid: dirty.cid, faction: fac };
    }

    talk(name + ': "' + name + ', station keeping. You are logged. Keep it civil."', 6);
    return { challenge: 'clear', faction: fac };
  }

  /* The worst thing in the hold by this flag's own law, or null. Reads the
   * same severity table the customs search does, so a capital cannot
   * disagree with the port that would fine you. */
  function contrabandAboardFor(G, fac) {
    var Eco = global.Economy;
    var cargo = (G.ship && G.ship.cargo) || {};
    var worst = null;
    for (var cid in cargo) {
      if (!(cargo[cid] > 0)) continue;
      var sev = contrabandSeverity(G, cid, fac);
      if (!(sev > 0)) continue;
      if (!worst || sev > worst.severity) {
        worst = { cid: cid, severity: sev,
                  name: (Eco && Eco.BY_ID[cid] && Eco.BY_ID[cid].name) || cid };
      }
    }
    return worst;
  }

  /* A FLAGSHIP DOES NOT CHALLENGE YOU, IT ASSESSES YOU — which is the same
   * conversation from the other side of the law, and it answers the same
   * question a warship does: where do I stand with this hull. What it
   * offers instead of a warning is the mechanical fact that is worth
   * knowing from inside its shadow, and which nothing else in the game
   * will tell you: while it is here, a witness has a price. */
  function hailShadow(G, sys, t, contact, hooks) {
    function talk(msg, secs) { if (hooks && hooks.say) hooks.say(msg, secs || 6); }
    var name = contact.name || 'the flagship';
    var standing = (G.standing || {}).outlaw || 0;
    var hot = bountyTotal(G) > 0;

    if (standing >= INTIMIDATE_STANDING) {
      talk(name + ': "We know you. Anything you do out here, we did not see."', 7);
      return { shadow: 'made', standing: standing };
    }
    if (hot) {
      talk(name + ': "Somebody wants you. Out here that is a reference."', 7);
      return { shadow: 'wanted', standing: standing };
    }
    talk(name + ': "You are inside our arrangement. Witnesses here are for sale."', 7);
    return { shadow: 'notice', standing: standing };
  }

  function hailShip(G, sys, t, contact, intent, hooks) {
    function talk(msg, secs) { if (hooks && hooks.say) hooks.say(msg, secs || 5); }
    if (!contact) return null;
    if (contact.hostile) {
      talk(contact.name + ' does not answer.', 4);
      return null;
    }
    var refusal = hailRefusal(G, contact);
    if (refusal) { talk(refusal, 5); return null; }

    var s = G.ship;

    /* A CAPITAL ANSWERS IN A DIFFERENT REGISTER, and refusing the ordinary
     * three is most of the point. A warship is not a trader with spare
     * cargo, it is not a taxi with spare fuel, and it does not hand out
     * charts — but it will tell you exactly where you stand with it, which
     * is the one thing worth knowing from inside its watch.
     *
     * It reads as an instrument rather than as flavour for the same reason
     * the comms channel does: every word of it is a fact the law is about
     * to act on. */
    if (contact.cls === 'capital' || contact.kind === 'capital') {
      return contact.outlaw ? hailShadow(G, sys, t, contact, hooks)
                            : hailChallenge(G, sys, t, contact, hooks);
    }

    if (intent === 'directions') return hailDirections(G, sys, t, contact, hooks);

    if (intent === 'assist') {
      var offer = hailAssist(G, contact);
      if (!offer) {
        talk(contact.name + ': "You have fuel. We are not diverting."', 5);
        return null;
      }
      if (s.credits < offer.cost) {
        talk(contact.name + ': "' + offer.tonnes + ' t for ' + offer.cost +
             ' cr. You have not got it."', 6);
        return null;
      }
      s.credits -= offer.cost;
      s.fuel = Math.min(s.fuelCap || s.fuel + offer.tonnes, s.fuel + offer.tonnes);
      if (global.Sim && global.Sim.refreshShip) global.Sim.refreshShip(s);
      talk(contact.name + ' pumps ' + offer.tonnes + ' t across for ' + offer.cost +
           ' cr. "Do not make a habit of it."', 6);
      return { fuel: offer.tonnes, cost: offer.cost };
    }

    if (intent === 'buy' || intent === 'sell') {
      var deal = hailTrade(G, contact);
      if (!deal) return null;
      if (intent === 'buy') {
        var b = deal.buy;
        if (!b) { talk(contact.name + ': "Nothing aboard you could carry."', 5); return null; }
        var cost = b.each * b.qty;
        if (s.credits < cost) {
          talk(contact.name + ': "' + b.qty + ' t of ' + b.name.toLowerCase() +
               ', ' + cost + ' cr. Come back with the money."', 6);
          return null;
        }
        s.credits -= cost;
        s.cargo = s.cargo || {};
        s.cargo[b.cid] = (s.cargo[b.cid] || 0) + b.qty;
        /* And it leaves their hold, so the same ship cannot be milked: the
         * manifest is what the timetable says is aboard, and this is a hole
         * in it. */
        for (var m = 0; m < (contact.manifest || []).length; m++) {
          if (contact.manifest[m].cid === b.cid) {
            contact.manifest[m].qty = Math.max(0, (contact.manifest[m].qty || 0) - b.qty);
          }
        }
        if (global.Sim && global.Sim.refreshShip) global.Sim.refreshShip(s);
        talk(contact.name + ' transfers ' + b.qty + ' t of ' + b.name.toLowerCase() +
             ' for ' + cost + ' cr.', 6);
        return { bought: b.cid, qty: b.qty, cost: cost };
      }
      var sl = deal.sell;
      if (!sl) { talk(contact.name + ': "Nothing you have is worth our hold."', 5); return null; }
      var paid = sl.each * sl.qty;
      s.cargo[sl.cid] = Math.max(0, (s.cargo[sl.cid] || 0) - sl.qty);
      if (!s.cargo[sl.cid]) delete s.cargo[sl.cid];
      s.credits += paid;
      if (global.Sim && global.Sim.refreshShip) global.Sim.refreshShip(s);
      talk(contact.name + ' takes ' + sl.qty + ' t of ' + sl.name.toLowerCase() +
           ' for ' + paid + ' cr.', 6);
      return { sold: sl.cid, qty: sl.qty, paid: paid };
    }
    return null;
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
  /* Is this dock a warship? `fleet` is set by Economy.siteFleetCarrier when
   * it converts a port into the navy's own, and the role name follows it —
   * asked in one place so nothing downstream has to know which of the two
   * fields is the truth. */
  function fleetPort(port) {
    if (!port) return false;
    if (port.fleet) return true;
    return !!(port.market && port.market.role === 'carrier');
  }

  function stockAt(G, port) {
    var out = [];
    if (!port) return out;
    var dev = (port.market && typeof port.market.dev === 'number')
      ? port.market.dev : 0.25;
    var sys = G.sys;
    var crime = (sys && sys.crimeScore !== undefined) ? sys.crimeScore : 40;
    /* A GREY MARKET IS A MARKET, and that is why it reads corruption rather
     * than permissivity.
     *
     * The original gate was `crimeScore >= 60` — the law looks the other
     * way, so somebody will sell you a gun. But permissivity is high in an
     * Anarchy for the opposite reason to why it is high in a Patronage
     * state: one has bought its police, the other has none. Only the first
     * of those has a supply chain, a shopfront and somebody whose job it is
     * to have three of a thing in the back.
     *
     * Measured on seed `kawartha`: the old gate caught 19% of systems and
     * ALL FIVE ANARCHIES. Corruption >= 60 catches 33% of systems and not
     * one of them. That is the whole argument in two numbers — the wider
     * net is also the more discriminating one, because it is finally asking
     * the right question. A third of ports is right for the place a
     * fugitive rearms: cut off from developed space, you still have to be
     * able to FIND one.
     *
     * Falls back to permissivity for a system generated before corruption
     * existed, so nothing that predates the two-axis split breaks.
     *
     * Reads EFFECTIVE corruption, base plus whatever the player has bribed
     * onto it — see the corruption-lever section above `bribePort`. A
     * bribe that could not open this shelf would not be much of a bribe. */
    var corrupt = effectiveCorruption(G, (sys && sys.corruption !== undefined) ? sys.corruption : crime);
    var fac = port.faction || 'civil';
    var standing = (G.standing || {})[fac] || 0;
    var hot = wantedHere(G, fac);
    var facName = (sys && sys.factions || []).filter(function (f) {
      return f.id === fac;
    })[0];
    facName = (facName && facName.name) || 'the locals';

    for (var id in EQUIPMENT) {
      var it = EQUIPMENT[id];
      /* Some things are not for sale anywhere at any price — see the
       * forged transponder. A shelf that listed it with a reason would be
       * advertising the Syndicate's chain to somebody who has not run it. */
      if (it.unlisted) continue;
      var verdict = null;

      if (it.syndicate) {
        /* Syndicate-issue goods exist only where the Syndicate itself is
         * the landlord, and only once THEY trust you — a different
         * faction's standing has no say here, which is the whole point:
         * a made friend of the Allies who has never met the Syndicate
         * should not see this gun, and a career criminal the Allies want
         * dead on sight should, provided the mob likes them. */
        if (fac !== 'outlaw') continue;                // not their turf
        var outlawStanding = (G.standing || {}).outlaw || 0;
        if (hot) {
          verdict = 'they will not arm someone they want';
        } else if (outlawStanding < (it.minStanding || 0)) {
          verdict = 'needs ' + (it.minStanding || 0) + '+ standing with the Syndicate';
        }
      } else if (it.grey) {
        /* Grey-market goods exist only where somebody can be bought. */
        if (corrupt < (it.minCorrupt || 0)) continue;  // not stocked at all here
        if (crime < (it.minCrime || 0)) continue;
      } else {
        /* A FLEET CARRIER IS NOT A SMALL PORT, whatever its development
         * reading says. Astra: "those carrier shipstations, they're
         * basically floating cities." The number generate.js writes there
         * is about the civilian economy that grew around the hull, and a
         * warship's own stores have nothing to do with it — a carrier
         * moored off a mining head still has the armoury it sailed with.
         *
         * So the development gate is waived and the STANDING gate is not,
         * which is the same trade the rest of this function runs on stated
         * the other way round: the best kit in the game is somewhere the
         * navy keeps it, and the navy sells to people it already trusts.
         * Additive — nothing stops being available anywhere it was. */
        if (!fleetPort(port) && dev < (it.minDev || 0)) continue;
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
      item = MISSILES[id];
      /* ONE TYPE PER RACK. Certified and bootleg rounds do not share a
       * feed, and more to the point a mixed rack would make the cook-off
       * unreadable — "is this crate the bad one" is the question the batch
       * hash exists to let the player answer, and it has no answer if the
       * rack is two crates at once. Refused with a reason, per the rule
       * canFit already follows. */
      /* ROOM IN THIS TYPE'S RACK, or a free rack to start one in. The old
       * rule was "one type per ship"; the rule now is one type per rack,
       * with the hull deciding how many racks there are. */
      var racksB = racksOf(s), existing = racksB[id];
      ok = !!item && (existing ? existing.n < item.rack
                               : rackList(s).length < rackSlots(s));
    }
    else if (kind === 'sink') {
      /* Charges need the launcher, the way seekers would need a rack if
       * seekers had one yet. */
      var rack = sinkRackSize(s);
      item = SINK; ok = rack > 0 && s.sinks < rack;
    }
    if (!item || !ok) return null;
    if (s.credits < item.price) return -item.price;

    if (kind === 'missile') {
      s.credits -= item.price;
      var racks2 = racksOf(s), r2 = racks2[item.id];
      /* A NEW CRATE GETS A NEW QUALITY, and the quality belongs to the
       * crate rather than to the round — buying the first of a batch is
       * what fixes it, and topping the same rack up does not re-roll it.
       * Hashed off the port and a per-career purchase counter, so the same
       * career buying at the same counter twice gets two different crates,
       * and reloading a save does not shop for a better one. */
      if (!r2) {
        var batch = null;
        if (item.grey) {
          s.missileSeq = (s.missileSeq || 0) + 1;
          var bh = RNG.hashString('batch|' + (G.ship.docked || '?') + '|' + s.missileSeq);
          batch = (bh % 1000) / 1000;
        }
        r2 = racks2[item.id] = { id: item.id, n: 0, batch: batch };
        /* A rack you just started is the one you meant to use, unless
         * something else is already armed and loaded. */
        if (!s.missiles) s.missileId = item.id;
      }
      r2.n++;
      syncRacks(s);
      return item.price;
    }
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
    /* THE HULL'S BIRTH MARK. Stamped when the ship is bought and never
     * touched again — it is what the cockpit's flair is seeded from, so the
     * bridge you learned stays the bridge you have. Deliberately NOT the
     * registration: that is a field the player types on the yard page, and
     * hanging the shape of the room on it would rebuild your cockpit around
     * you every time you renamed the ship.
     *
     * Derived rather than random, so it is the same for the same career
     * doing the same thing: which hull, bought where, at what hour. */
    s.bornId = to.id + '@' + (G.here ? G.here.id : 'void') + '#' +
               Math.round((G.t || 0) / 3600);
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
    /* AND THE HULL'S OWN STANDARD GEAR. A scoop is fitted to every hull
     * that leaves a yard, so one arrives with the ship even if the pilot
     * sold the last one — see HULL_STANDARD. Done after replanFit so it
     * fills a gap rather than competing for a slot with something the
     * player actually chose, and reported back so the yard can say it
     * happened instead of leaving it to be discovered mid-robbery. */
    var fitted = addHullStandard(s);
    syncLegacy(s);
    global.Sim.refreshShip(s);
    return { ok: true, cost: cost, standard: fitted };
  }

  /* ---- death ------------------------------------------------------------ */
  /* The hull is gone; the pilot is not. Cargo and fitted upgrades were part
   * of the hull. Credits, standing and warrants are part of you. */
  function stripForRespawn(ship) {
    ship.cargo = {};
    ship.shieldHp = 0;
    ship.heatShed = 0;
    ship.missiles = 0;
    ship.sinks = 0;
    /* Hull FIRST: slot keys are derived from it, so the kit has to be filed
     * against the hull it is going into. */
    ship.hullId = 'talon';
    var h = HULLS.talon;
    ship.dryMass = h.dryMass; ship.thrustKN = h.thrustKN;
    ship.thrusterCap = h.thrusterCap; ship.fuelCap = h.fuelCap;
    ship.cargoCap = h.cargoCap;
    ship.hullMax = h.hullMax; ship.hullHp = h.hullMax;
    /* And then the same kit a ship leaves the yard with — hand-written here
     * until it fell out of step with the yard and took piracy with it. See
     * STARTING_FIT. syncLegacy writes gun/turret/shield/heatshield from the
     * result, so the four legacy fields no longer need setting by hand and
     * cannot be set WRONG by hand either. */
    applyStartingFit(ship);
    global.Sim.refreshShip(ship);
  }

  var Combat = {
    npcHeat: npcHeat, addNpcHeat: addNpcHeat, NPC_SHED: NPC_SHED,
    pirateRack: pirateRack, updateNpcHeat: updateNpcHeat,
    jettisonRack: jettisonRack, hangChanceFor: hangChanceFor,
    batchFactor: batchFactor,
    wasteCustoms: wasteCustoms, expelledHere: expelledHere,
    WASTE_FINE: WASTE_FINE,
    seatsOf: seatsOf, passengersAboard: passengersAboard, seatsFree: seatsFree,
    hushQuote: hushQuote, hushWitness: hushWitness,
    HUSH_FROM_STANDING: HUSH_FROM_STANDING,
    HUSH_MIN_CORRUPTION: HUSH_MIN_CORRUPTION,
    INTIMIDATE_STANDING: INTIMIDATE_STANDING,
    RISK_TONNES: RISK_TONNES,
    localTradeRate: localTradeRate,
    effectiveCorruption: effectiveCorruption, systemCorruption: systemCorruption,
    bumpCorruption: bumpCorruption, decayedShift: decayedShift,
    bribeCost: bribeCost, bribePort: bribePort,
    corruptionLabel: corruptionLabel, violenceLabel: violenceLabel,
    CORRUPTION_BUMP_HUSH: CORRUPTION_BUMP_HUSH,
    CORRUPTION_BUMP_CUSTOMS: CORRUPTION_BUMP_CUSTOMS,
    CORRUPTION_BRIBE_AMOUNT: CORRUPTION_BRIBE_AMOUNT,
    CORRUPTION_SHIFT_CAP: CORRUPTION_SHIFT_CAP,
    CORRUPTION_HALFLIFE: CORRUPTION_HALFLIFE,
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
    scanLevel: scanLevel, scanShip: scanShip, hasScoop: hasScoop,
    addHeat: addHeat, updateSink: updateSink,
    WITNESS_RANGE: WITNESS_RANGE, DISTRESS_DELAY: DISTRESS_DELAY,
    TRADER_GUN: TRADER_GUN, NPC_GUN: NPC_GUN, SYNDICATE_GUN: SYNDICATE_GUN,
    SYNDICATE_TRUST: SYNDICATE_TRUST,
    updateNpcFire: updateNpcFire,
    UNARMED_CLASSES: UNARMED_CLASSES,
    DISTRESS_DELAY_ARMED: DISTRESS_DELAY_ARMED,
    DISTRESS_DELAY_CIVIL: DISTRESS_DELAY_CIVIL,
    isArmedNpc: isArmedNpc, distressDelayFor: distressDelayFor,
    WANTED_HUNT: WANTED_HUNT, BOUNTY: BOUNTY, ATTACK_STANDOFF: ATTACK_STANDOFF,
    SMUGGLING_FINE_PER_TONNE: SMUGGLING_FINE_PER_TONNE, SEARCH_FLOOR: SEARCH_FLOOR,
    CONTRABAND_SEVERITY: CONTRABAND_SEVERITY, STANDING_HIT: STANDING_HIT,
    MILFUEL_LICENCE_STANDING: MILFUEL_LICENCE_STANDING,
    contrabandSeverity: contrabandSeverity, fineFor: fineFor,
    DUMPING_FINE_PER_TONNE: DUMPING_FINE_PER_TONNE, REPORT_FLOOR: REPORT_FLOOR,
    resolveScan: resolveScan,
    dumping: dumping,
    isCleared: isCleared,
    requestClearance: requestClearance,
    clearanceRefusal: clearanceRefusal,
    autoClearance: autoClearance,
    hasTransponder: hasTransponder,
    hailShip: hailShip, hailTrade: hailTrade, hailAssist: hailAssist,
    rackList: rackList, rackSlots: rackSlots, armRack: armRack,
    nextRack: nextRack, syncRacks: syncRacks,
    HAIL_RANGE_KM: HAIL_RANGE_KM,
    queueJumpsOf: queueJumpsOf,
    FREE_JUMPS: FREE_JUMPS,
    arriveAtPort: arriveAtPort,
    clearAllClearances: clearAllClearances,
    requestLaunch: requestLaunch,
    launchCleared: launchCleared,
    spendLaunch: spendLaunch,
    doorsOpen: doorsOpen,
    hackControl: hackControl, breachedHere: breachedHere,
    clearBreaches: clearBreaches, breakerRating: breakerRating,
    HACK_COOLDOWN: HACK_COOLDOWN, HACK_SKILL: HACK_SKILL,
    BREACH_FINE: BREACH_FINE,
    isFugitive: isFugitive,
    payFugitive: payFugitive,
    fleeSystem: fleeSystem,
    UNCLEARED_FINE: UNCLEARED_FINE,
    initShip: initShip, npcHull: npcHull,
    update: update,
    fireGun: fireGun, fireGroup: fireGroup, fireMissile: fireMissile,
    groupOf: groupOf, setGroup: setGroup, toggleGroup: toggleGroup,
    gunsInGroup: gunsInGroup,
    muzzleOf: muzzleOf, muzzleWorld: muzzleWorld, hullLen: hullLen,
    manifestFor: manifestFor, holdOf: holdOf, purseOf: purseOf,
    npcShield: npcShield, splitDamage: splitDamage, hullSize: hullSize,
    NPC_SHIELD: NPC_SHIELD, MAX_IMPACTS: MAX_IMPACTS,
    damageNpc: damageNpc, damagePlayer: damagePlayer, killNpc: killNpc,
    liftTrader: liftTrader,
    crime: crime, witnessNear: witnessNear,
    bountyTotal: bountyTotal, wantedHere: wantedHere, fleetPort: fleetPort,
    transponderKind: transponderKind, forgedPasses: forgedPasses,
    transponderPasses: transponderPasses, FORGED_PASS: FORGED_PASS,
    capitalShadow: capitalShadow, CAPITAL_WATCH: CAPITAL_WATCH,
    contrabandAboardFor: contrabandAboardFor,
    dockRefused: dockRefused, dockRefusal: dockRefusal, payBounty: payBounty,
    demandFrom: demandFrom,
    repairCost: repairCost, repair: repair, deadPanelCount: deadPanelCount,
    buyOutfit: buyOutfit, buyHull: buyHull,
    stripForRespawn: stripForRespawn
  };

  global.Combat = Combat;
  if (typeof module !== 'undefined' && module.exports) module.exports = Combat;
})(typeof window !== 'undefined' ? window : globalThis);
