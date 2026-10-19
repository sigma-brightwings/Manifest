# Changelog

Alpha revisions of Procedural Space Game. Newest first.

Each release gets: **Added** (new things you can do), **Changed** (things
that behave differently than they did), **Fixed** (things that were wrong),
and **Saves** (whether an existing career survives). That last heading is
not optional — a player who has flown a seed for a week deserves to know
before they update.

---

## Unreleased

Since Abby. Changes made on the 1.1 line after the release was cut.

### Added

- **A ship built to order takes time to build (2026-10-19).** Astra:
  *"Build time for a ship is realistic, and lets you anticipate the use
  of your new ship even if you get blown up in your current one."*
  - *Commission, don't buy.* At a shipyard the BUILT TO ORDER list now
    shows each hull's time on the slip, and the card's one button is
    **COMMISSION — price · READY IN n DAYS**. You pay in full when you
    sign. You keep flying the ship you came in, so there is no trade-in
    at the desk, and the order sheet offers only the yard's shelf (your
    own gear stays on the ship you are in).
  - *Build time:* 3 days for a large hull, 8 for an extra-large one, 14
    for a Capital Ship. My pick; say if you want them longer or shorter.
  - *The order is yours, not the hull's.* It is saved, and a death does
    not touch it. A pilot blown up in the old ship wakes in a Talon with
    the new one still on the slip.
  - *Hand-over.* When she is done she is delivered at that yard as one
    of your fleet, tanks full, fitted, named and painted to the sheet.
    The yard calls you wherever you are, and her first week on the clamp
    is paid. The slip shows on the HULLS tab at that yard and on FLEET
    everywhere, with a countdown.
  - *Take command.* On FLEET, any ship of yours on the clamp you are
    docked at has two new rows. **▶ TAKE COMMAND · keep the …** leaves
    the ship you were in here as one of yours, with her hold and the
    contracts riding in it. **▶ TAKE COMMAND · trade in the …** sells
    her to the yard at seven tenths, gear and all, and your hold and
    people come across with you. Not for a partner's ship, one under
    way, or while a lien is outstanding. Unpaid berthing on her is
    settled first.
  - *The floor is still the floor.* A large civilian hull that happens
    to be standing on a yard's floor is sold as she sits and flown out
    today, as at any other dock. Warships and XL hulls are only ever
    commissioned.
  - Cancelling an order is not offered. Say if you want it, perhaps with
    a forfeit.

- **Cruise drives come in classes (2026-10-19).** Astra: "class two costs
  about 10 times as much as a class one, class three costs 10 times more
  again, or you can switch to the milfuel drives ... some ships have a
  second drive slot ... milfuel drives travel at five times the speed of
  normal drives." With her, each class doubles the speed, milfuel's ×5 is
  on top of the class, and a heavier ship is slower on the same drive.
  - **Top cruise speed:** 250c × class (1, 2, 4) × milfuel (×5 while slugs
    last) × a second drive (1 + half its ratio to the first) × √(146 t ÷
    the ship's mass now). A laden Talon on its Class 1 makes 250c; empty,
    about 340c. The mass lock still governs anywhere near a body.
  - **The drives:**

    | Drive | Price | Gates |
    |---|---|---|
    | Class 1 | 4,000 cr | standard on every hull |
    | Class 2 | 40,000 cr | development 0.45 |
    | Class 3 | 400,000 cr | development 0.70, standing 10 |
    | Military, each class | 2.5× its class | the Chernobyl's gates: development 0.80, standing 40 |

    A military drive burns milfuel slugs (0.45 t and 0.28 t of waste per
    20 AU) instead of reaction mass. With no slugs aboard it runs as an
    ordinary drive of its class.
  - **The drive slot:** a new slot type, `drive`. L and XL hulls have two,
    everything else one. It is never empty: every hull leaves the yard with
    a Class 1, every save is given one on load, and the last drive cannot
    be sold. Buying into a full bay trades in the weakest drive at the usual
    45%. The yard row shows the top speed before and after, the trade-in
    and the net price. Drives carry no mass and no power yet.
  - New suite `test/cruisedrive.test.js` (20 checks).

- **The sky at cruise speed: the old streaks, blurred, behind the planets,
  with a TNG red-blue shift (2026-10-19).** Astra: "I liked the old cruise
  animation a bit better, just, we need a bit of planets covering the lines
  and blur them a bit so we get a streak and not just a point or a line",
  and the TNG-remaster starfield "where right as you pass a point of light
  it rapidly shifts in color."
  - **The streaks:** each star streaks back toward where it was. That
    makes them radial about the heading when looking ahead, longest
    abeam, and swinging with a turn.
  - **How they're drawn:** by the world layer as soft gaussian quads that
    fade along the tail, so planets cover them.
  - **The colour:** stars ahead are washed blue-white and brighter, stars
    behind red and dimmer. The flip happens within ±6° of abeam.
  - **What sets the strength:** wash and streak length ride one log-scale
    number from 0.02c to 2000c.
  - **What went:** the 2026-10-17 relativistic aberration and black rear
    sky. The edge darkening is back.
  - `test/cruisesky.test.js` was rewritten for the new rule (22 checks).

- **Slipspace transit is a rift (2026-10-19).** Astra chose it from three.
  - **Going in:** a red tear opens on the nose in the real sky and gapes
    until it swallows the view.
  - **Inside:** dark wine and violet, with ragged walls. Filaments come at
    you blue-violet and flip red as they pass, the same rule as the
    cruise sky.
  - **Coming out:** a blue rift grows at the far end, gapes, and flashes
    you out onto the real sky under a fading blue wash.
  - **Corridors:** in a slipspace corridor, the exit rift tracks corridor
    progress.

- **Fresh wakes show the tear (2026-10-19).** Astra asked whether other
  ships leave "a red exit cloud of distorted space, like a rip in the
  fabric of the universe."
  - **The tear:** they did leave a cloud, but no visible rip. Now a wake's
    rift stays open in the middle of its cloud for its first 15 minutes,
    closing: red for a departure, blue for an arrival.
  - **From deep in a well:** seen from low over a world (full on the
    ground, none three radii up), a departure wake is deeper red and
    larger, and an arrival violet. This is a deliberate exaggeration;
    strictly, light falling into a well arrives blueshifted.
  - **How often:** measured across 800 samples, about 1.7 wakes per system
    at any moment, half of them departures, and about one departure a day
    per system.

- **Every ship type is for sale, and shipyards build large ones to order
  (2026-10-19).** Astra: *"I also want the player to be able to purchase
  ANY ship type, but only at shipyards can you get a customized L size
  ship."* Asked which ships: civilian, plus warships *"only for a navy
  you're in good standing with"*. What "customized" means: **both**
  built to order and refits only at a shipyard. The biggest ships get an
  **XL** class.
  - *Ten new hulls*, each flying the model its traffic class already
    flies. **S:** Wren Shuttle (unarmed, like every shuttle), Bollard Tug.
    **M:** Samaritan Tender, Sump Waste Hauler. **L:** Longhaul Freighter,
    Coldwater Tanker (the longest reach of any civilian hull), Naval
    Cutter. **XL:** Meridian Liner, Leviathan Bulk Carrier, Capital Ship.
    Every one clears the loneliest star laden. Every hull that can land
    can still lift off the heaviest world with a port. The Kestrel stays
    the mercenary hull.
  - *Warships are the navy's own.* A Naval Cutter is built only at a
    shipyard of a real power, for a captain ALLIED with it (40+). A
    Capital Ship needs 70+. A navy that wants you builds you nothing. A
    locked warship is still listed, with the standing it needs.
  - *Built to order.* At a shipyard every L and XL hull is on the books,
    whether or not one is on the floor. Its order sheet has one line per
    slot. Click a line ▶ to cycle through empty, your own fittings (moved
    across when you trade in), and everything on the yard's shelf. Below
    those: her name, a hull colour and a trim from eleven paints, and a
    live quote (hull + fittings − trade-in, with the power and mass
    budget). Nothing is spent until **BUILD** on the card, and the card's
    ship turns in the colours on the sheet.
  - *Elsewhere, as she sits.* An ordinary orbital dock still has the odd
    L hull on its floor. It comes with the dock's own fit, the gear at
    nine tenths of list. The fittings on the ship you trade in are taken
    at seven tenths, because nobody there can move them across. The hull
    list says what she carries.
  - *Refits only at a shipyard.* An L or XL hull's fittings cannot be
    bought or sold anywhere else. The fitting page says so once, at the
    top. Missiles and heat-sink charges are not fittings and are sold
    everywhere. S and M hulls refit anywhere, as before.
  - *XL is too big for ordinary ports.* An XL hull docks only at
    shipyards, highports and fleet carriers. Never on a pad, never
    underground, never at an ordinary orbital dock. The refusal says
    so on the approach.
  - *Paint.* Your hull colour and trim are drawn in flight on both
    renderers (the GPU path through a new paint input on the hull
    shader), and in the showroom. Windows and nav lamps are never painted
    over. A hull from any other counter is yard grey.
  - Tests: new `test/shipyard.test.js` (53 checks). The take-off checks in
    `ships` and `combat` now skip XL hulls, since they never land. The
    medium-hull floor-odds check now counts per hull, because with four
    medium hulls "a dock has at least one" was always going to read 100%.
    A fleet test that kept a Kestrel bought off an ordinary floor now
    keeps a Mule. The render test that looks for hull rows now recognises
    them by their size letter, because the old names can scroll below the
    cheaper new hulls. Checked in the real Electron shell with
    `tools/probe-shipyard.js`. `tools/electron-probe.cjs` now takes
    `PROBE_PROFILE=<dir>`, which runs a probe in a throwaway profile so
    one that docks or buys can never touch the real career's autosave.
  - Known: in flight every player hull is still drawn at the same 25 m,
    a liner included, as it always has been. Scaling the player's ship to
    its class is a separate change.

  *Saves:* additive (`ship.paint`; fleet records carry `paint`). No
  version bump.

- **Twilight worlds: tidally locked rings and sideways equators
  (2026-10-19).** Astra: "tidally locked worlds: they can have habitable
  regions right along their star-set zone, or the day/night line around
  the equator." Fully habitable, both kinds.
  - *Tidally locked.* A solid world inside 0.45 AU × (star mass)^⅓ is
    locked: one day per year, its pole on its own orbit's normal, and
    longitude 0 always under the star. In practice that is most red
    dwarf habitable zones and nothing near a sun-like star. If it is
    terran, ocean, desert or tundra and sits between 0.8 × the zone's
    inner edge and its outer edge, it lives in its **twilight ring**: the
    strip where the star sits low on the horizon forever, running over
    both poles, between a bleached dayside and an iced nightside.
  - *Tipped.* About one solid world in fourteen outside the lock line
    lies on its side (80–100° tilt), Uranus-style. If it is one of the
    same four types and inside the habitable zone, it lives in an
    **equator band**: each pole bakes for half the year and freezes for
    the other.
  - *Fully habitable* means the same as any other habitable world: life
    and culture notes, economy, development, and two or three stations
    plus one or two pads. Pads on a ring world sit in the ring, about 9°
    sunward of the exact terminator, so the star stays low but up all
    year. Pads on a band world sit within ±12° of the equator.
  - *On screen.*
    - The planet shader paints the zones by the real sun angle (locked)
      or by latitude (tipped). The living strip is tinted green so a
      desert ring world reads as somewhere things grow. Polar caps stand
      down on both kinds.
    - The NAV card says **HZ ring** / **HZ band** and "tidally locked" for
      the day, adds a one-line description of the strip, and appends "on
      its side" to the day length of a tipped world.
    - The SYSTEM tab and the slipspace chart preview name the strip too.
  - *Same seed, same systems.* The old rule is kept as
    `habitableGlobal`, and every id- and draw-sensitive site reads it, so
    every existing body keeps its id, name and orbit. The extra ports
    come from their own substreams after the last existing id. The one
    visible knock-on: in about 70 of 200 systems, a newly habitable
    world nudges the economy, and in a few of those the fleet carrier
    moves to a different port (it takes the garrison's name).
  - *Scale.* Across 200 kawartha systems: 506 locked worlds, 54 tipped,
    188 ring worlds, 18 band worlds, 91 newly habitable. Mean system
    development goes from 0.51 to 0.54. A first cut let rings reach in
    to 0.55 × the inner edge; that put a desert ring in more than half of
    all systems, so it was pulled back to 0.8.
  - *Rotation frames can now lean any way.* Adds an optional
    `rotation.az`, the azimuth of the tilt, read by Sim.surfaceOffset,
    Sim.bodyPole, Rings.ringFrame and GLWorld.spinOf. Only locked worlds
    set it; everything else takes exactly the old path.
  - New suite `test/twilight.test.js` (20 checks). It covers id, name and
    orbit stability against `opts.noTwilight`, the subsolar point all
    year (worst 10.1°, all of it eccentricity libration), pads in their
    strip, the star's height over ring pads, port counts, determinism,
    and the card wording.

- **Every ship has a captain, and they remember you (2026-10-18).**
  Step 1 of the named-captains / rumours / disguise plan
  (DESIGN-NOTES-CAPTAINS-RUMOURS-DISGUISE-v3). Every NPC ship — traders,
  patrols, pirates — has a captain with a name, a temperament (wary,
  friendly, mercenary, principled, gruff), values (abolitionist,
  profit-first, lawful, pirate-sympathetic), a home port, and one friend
  and one rival among the other captains in the system. All of it is a
  pure function of the seed and the ship, drawn from its own substream,
  so no existing seed changed. A captain only gets a saved record once
  they have actually dealt with you; their memory of you is numbers, not
  text — honesty and feeling as two separate dials, a count of first-hand
  encounters, and the single most memorable thing you did to or for them.
  A trader you pull off its rails is the same person it was on the
  timetable; a patrol riding a lane is not the freighter on that lane.
  New `src/captains.js`; pinned by `test/captains.test.js`.

- **Hail is a greeting, from furious to grateful (2026-10-18).** Astra:
  "Are you a filthy pirate, or do you rescue stranded ships?" Pressing
  Hail now gets you the captain, by name, in a voice set by how they feel
  about you and coloured by their temper — and, unless they are neutral,
  *why*: "I still have your scorch marks on my hull", "They say you pull
  stranded ships out of the dark". **Seen beats heard**: a captain who
  has dealt with you goes by what they saw; one who has never met you
  goes by your public record, read through their values (a pirate-minded
  captain admires the career a lawful one despises). Grateful is reserved
  for someone you actually saved. The comms row says who is in the chair
  and their mood before you press it. The public record is new: assaults,
  robberies, kills, pirate kills and answered distress calls are now
  counted. Weights measured across 24 seeds, not guessed — the first pass
  put every trader at "furious" for one bad career, and the test prints
  the spread so it cannot drift back.

- **Disguise: a new name, new paint, a spoofed transponder
  (2026-10-18).** Step 2. At a yard where somebody can be bought
  (corruption 60, the grey market's own line) the station menu offers a
  paint-and-name refit (1,800 cr) or a full refit with a spoofed
  transponder and re-plating (6,500 cr); restoring your own colours is
  400 cr anywhere. Your public record and (later) rumours attach to the
  identity you broadcast, so a disguise starts with a clean sheet — but
  captains who have seen the **hull** may recognise it: about half the
  time under paint, about a fifth under a full refit (measured in the
  test), more the more often they have seen you. Being caught is a seen
  lie and they say so. A captain you fooled keeps a separate memory of the
  stranger they met, so what you do in disguise does not bleed onto the
  real you. A legal rename or re-registration is **not** a disguise — the
  registry links it, and your record follows. A newly bought hull flies
  its own colours. Fleet markings exist as data (your fleet: a three-letter
  code and a bicolour off the seed; a faction's: a tricolour off its chart
  colour) but nothing paints them on a hull yet. **Not yet built:** the
  sabotage missions from the same section of the plan.

  *Saves:* additive (`captains`, `record`, `ship.disguise`,
  `ship.disguiseCount`), no version bump; an older career loads with
  nobody who remembers it and a clean record.

- **Your own words on the band, read back before they go (2026-10-18).**
  Step 3. The police channel has a new row, *Distress call — in your own
  words*, and every ship has *Talk…* (*Send a message*, *Ask what they
  carry, and where*). You type; the game reads what you typed into claims
  — cargo, situation, threat — and shows them back as **Read as** before
  anything is sent, each one checked against your real ship. A claim that
  is not true is marked, a mayday from a ship that is fine says *Ship not
  in distress*, and the button changes to *Send anyway — knowingly
  false*: every lie in this game is a conscious one. Lies are weighed on
  the design's two axes (what they exploit, what they cost responders);
  "freed slaves aboard, drive about to explode" when neither is true is
  the worst there is. Captains who hear your call decide whether to come by
  their values (an abolitionist races in for people in a hold; a
  pirate-minded one may come for very different reasons), how they feel
  about you, and whether they have caught you lying before. When they
  arrive they look: a false emergency is plain to see, a false cargo claim
  only to a captain who scans the hold. An honest call from a ship really
  in trouble also goes out on the existing mayday, and the first captain
  there passes a hose. Captains answer messages from their real state and
  temper — a wary one may say "None of your business."
  New `src/messages.js`; pinned by `test/messages.test.js`.

- **Captains call for help too, and some of them are lying (2026-10-18).**
  On a seeded schedule (a 40% chance every four hours, a pure function of
  seed, star and clock), a trader in real trouble calls for help — the
  first rescues the game has ever been able to offer, and the way to a
  captain who is genuinely grateful. Where pirates work the lanes, close
  to half the calls are bait, transmitted from wherever the pirate is
  actually lurking, so answering one flies you into its intercept with
  nothing new spawned. *Check the transponder* is the tell: a real caller
  checks out; a copied registration belongs to a ship the registry puts
  somewhere else entirely; an invented one is not on file at all.

- **Captains remember your deeds and your words, and never say the same
  line twice (2026-10-18).** Astra: *"just to say 'last time I responded
  to your call, you were lying' or 'you saved my cargo and my crew, not to
  mention my ship. Looking for another fleetmate? We could go into
  business together.'"* Each captain keeps a short log of what happened
  between you — what was at stake, and your own words, quoted — and builds
  the hail from it: a greeting, the memory, and a closing, coloured by
  how they feel. A captain only ever talks about something that actually
  happened. Every line said is remembered and never repeated; back-to-back
  hails never reuse the greeting, the memory or the closing. Being *told*
  something is kept but does not count as having seen you act, so one
  chat does not wipe out what a stranger has heard about your piracy.
  (A generative model was considered for this and set aside: these lines
  need no writer, cost nothing, and cannot invent a deed you did not do.)

- **A small language model reads what you type (2026-10-18).** Astra:
  *"we want the maximal ability to process language in English."*
  transformers.js runs **all-MiniLM-L12-v2** locally in the game — offline,
  no network, ~35 MB — so "our engines are toast" reads as a drive
  failure without anyone having written "toast" down. Chosen by
  measurement, not size: five models were tuned on half of a labelled set
  of 56 phrasings (`test/reader-phrases.json`, written before any model
  ran) and scored on the other half. Held-out accuracy per claim:

  | Reader | Held-out | Paraphrases | Mixed | Size | Per message |
  |---|---|---|---|---|---|
  | Phrase matcher alone | 82.1% | 77.3% | 70.8% | — | <1 ms |
  | **MiniLM-L12 + matcher** | **92.9%** | 90.7% | 91.7% | 35 MB | 7 ms (node), ~35 ms in game |
  | MiniLM-L6 + matcher | 91.7% | 90.7% | 87.5% | 24 MB | 4 ms |
  | gte-small | 89.3% | 89.3% | 87.5% | 35 MB | 8 ms |
  | bge-base | 89.3% | 92.0% | 95.8% | 111 MB | 20 ms |
  | bge-small | 85.7% | 88.0% | 91.7% | 35 MB | 8 ms |

  The set is small — a point or two is one sentence — and it stays in the
  suite to catch any slide. Negation is still read by the matcher
  (embedding models cannot tell "carrying slaves" from "not carrying
  slaves"), and a negator that *describes* trouble ("can't steer", "no
  thrust") is no longer read as a denial. Known miss: "We are dead in the
  water, kids aboard" still loses the drive failure; the fix for it lost
  on the measurement. In the real Electron shell the model is ready about
  2 seconds after launch; until then, or if its files are missing, the
  game reads with the phrase matcher and nothing else changes. Staged by
  the new `npm run models` (which `npm run dist` now runs) into `lang/`
  and `vendor/`, both gitignored; re-run the comparison with
  `npm run bench:reader`. The first in-game test caught that
  transformers.js's `web` build expects a bundler; the self-contained
  build is the one vendored.

  *Saves:* additive (`broadcasts`, and captain memories gained `log`,
  `said` and `lastBits`), no version bump.

- **Favours, friends and rivals, and going into business (2026-10-18).**
  Step 4 of the captains plan (sections 6 and 8), in the new
  `src/favours.js`.
  - *Debts.* Save a ship, or answer a real mayday, and her captain owes
    you one; answer *your* honest mayday and you owe her. Clamped at ±5.
  - *She pays it back.* Unasked: a captain who owes you and sees a raider
    on your lane warns you, with its name and range. Or you call it in
    from **Talk…** — where the pirates are, reaction mass passed across
    (within 50 km), or a word with her people (+5 standing). Each costs
    one, and the note says what it does before you press it.
  - *She calls it in.* A captain you owe, on your board, asks for credits
    or reaction mass. Her row on the comms page leads with the ask, a
    countdown and *Wire her… / Pass across… / Refuse*. Refusing — or
    letting it run out — costs feeling, and she brings it up: a refusal
    outranks the rescue that earned the ask.
  - *Friends hear, rivals wonder.* Rob, shoot, lie to or exploit a
    captain and her friend hears it near-first-hand — on the `heard`
    dial, counted above your public record for someone who has never seen
    you, and at a third for someone who has. Save her and her friend warms
    to you, and her rival grows suspicious. Kill her and her friend knows
    whose guns. They say it by name: *"You crossed (her name). That means
    you crossed me."* Hearsay keeps to the colours you wore.
  - *Going into business* — Astra: **"Offer both."** A grateful trader's
    **Go into business together…** row gives two deals. **Partners:** she
    brings her ship into your fleet, takes standing orders, draws no
    wage, and every contract she delivers splits 50/50; she stays hers —
    the yard will not sell her — and she leaves, ship and all, if her
    berth fees go unpaid, if you turn on her, or if you start killing
    crews (or robbing traders, unless she is profit-first). **Crew:** she
    hands her ship to her mate and comes aboard as a skilled officer
    (rated good or better) at a friend's wage, 60% of the going rate.
    Either way her ship leaves its lane for good. Patrols and pirates
    never make the offer — and no longer say they will.
  - Tests: new `test/favours.test.js` (64 checks).

  *Saves:* additive (`joined`, `favourAsk`, `tipAt`; captain memories
  gained `heard` in use, `debt` in use and `joined`; fleet records may
  carry `partner`; crew may carry `wageMul`), no version bump.

- **Rumours travel at the speed of ships (2026-10-18).** Step 5, the last
  of the captains plan (section 3), in the new `src/rumours.js`. Until now
  a stranger read your public record, and every stranger in the galaxy
  knew it the instant it changed. Now:
  - *A rumour starts where somebody saw.* Robbery, a killing, a rescue,
    a lie found out, a pirate kill: each starts a rumour aboard the ship
    that saw it. That is the victim if she lived, otherwise the nearest
    honest ship or station within witness range. If nobody was close
    enough, there is no rumour at all. A ship destroyed before she berths
    takes the story with her.
  - *It travels on the timetable.* No faster-than-ship news. A ship that
    knows tells the port she next berths at, and every ship that berths
    at a port that knows carries it on. The timetable is a pure function
    of the clock, so who hears when is calculated, not simulated: the
    earliest arrival over the berthing schedule, once per rumour per
    system, accurate at any time warp. In a busy system it takes days to
    reach everyone.
  - *Between stars, with the trade.* Once a port knows, the news goes to
    each nearby star's busiest port. The four nearest stars are linked,
    and the trip takes 7 hours per light year (the same as your drive)
    plus a day's wait for a ship heading that way. Three hops at most,
    with the rumour 40% fainter at each. You can outrun your
    reputation, or be caught by it at the next port.
  - *Seen beats heard.* A captain who has seen you act goes by what she
    saw. A stranger reads only the rumours that have reached her ship,
    through her values (lies on the band now count too, and a mayday used
    as bait counts three times as much). She says where she heard it: *"At
    Halden Dock, they say you killed the crew of the Redsail Tender."* /
    *"Out in Kappa Lyrae, they say you pull ships out of the dark."*
  - *Friends hear at ship speed too.* Step 4's friend and rival hearsay
    now reaches them when the news reaches their ship, not instantly.
  - *Rumours stick to an identity.* Each one is about whoever you were
    flying as, so a fresh transponder starts unheard of, and a disguise
    that earns a name keeps it.
  - *They fade.* Half as loud every 120 days.
  - **Listen to the dock talk**, a new row on a port's comms page while
    docked: what has reached this port about you, loudest first.
  - Decisions I took that you may want changed: rumours do not
    *distort* as they are retold, they only fade with distance and time;
    the half-life is 120 days; the reach is three star hops. Any of the
    three is a single constant at the top of `rumours.js`.
  - Tests: new `test/rumours.test.js` (38 checks). Among them, the
    calculated berthing times are compared with the real timetable at 300
    sample points.

  *Saves:* additive (`rumours`, `hearsay`, `rumourSeq`, `recordLegacy`).
  Who has heard what is not saved; it is worked out again from the
  timetable. A career saved before this loads with its record as it stood
  copied into `recordLegacy`, still known everywhere, so nothing you had
  done is forgotten. Everything from then on travels by ship. No version
  bump.

- **The NAV card: the chart's view of a locked world (2026-10-19).**
  Astra: "slipspace chart info should be displayed for current system in
  the nav menu. Stuff like what type of planet each of the bodies in order
  from their star are", then a box under the locked planet in the world
  view, "integrate the two somehow, using a tab", and in the cockpit "on a
  panel, not on the HUD". Lock a planet or moon and its card has two tabs:
  - **WORLD**: where it sits (4th of 12 from the star, or moon of its
    planet), its type with `HZ` for a habitable-zone world, its air,
    moons and ports, surface pull, length of day, and the chart's notes
    on life and people; plus range, closing and ETA.
  - **SYSTEM**: every planet numbered out from the star with its type and
    ☾ moons and ⌂ ports, the locked one lit. Clicking a row locks it.
  
  It hangs under the locked world in the exterior and map views, with a
  leader to it (above it if there is no room below). When the world is off
  the screen or behind you, the card pins to that edge with an arrow
  pointing the way to the world. In the cockpit it is the NAV console
  screen, read-only like every console screen, so **M** flips the tab (M
  was free since the market moved to comms); the other two places take
  clicks. F3 shows it as its NAV tile. `Screens.systemManifest`,
  `Screens.worldFacts`, `drawWorldCard`; pinned against real generated
  systems by `test/navsystem.test.js` (95).

- **NAV and TARGET are different screens now (2026-10-19).** Astra: "call
  that screen NAV instead of TARGET — target should be reserved for ships
  that are targeted either for hailing or weapons fire." The lock screen
  heads itself NAV for a planet, moon, station or port and TARGET only for
  a ship. The contact list, which was also called NAV, is CONTACTS, the
  name F3 already gave it. In F5 → PANELS they are listed as NAV / TARGET
  and CONTACTS; saved panel assignments keep working, since the ids did
  not change.

- **Which way you are facing, on the glass (2026-10-19).** Astra: "we need
  a way to know if the ship is facing into or out of the direction of
  travel that's easier to find on the HUD". Under the attitude line, a
  cue reads **PROGRADE** or **RETROGRADE** with how many degrees off you
  are, boxed in amber when you are within 10°; NOT MOVING when there is
  nothing to face. The retrograde marker (circle with a cross) is now on
  the glass whenever it is in front of you, and when prograde is off the
  glass an arrow at the edge points the way to turn to find it. Before,
  turning your tail to your motion simply made the marker vanish. Both
  markers carry the dark halo. `Render.facingInfo`, `Render.drawFacingCue`.

- **Orbit line: ahead solid, behind dotted (2026-10-19).** Astra: "orbit
  already traveled should be in dotted lines, or orbit to be travelled,
  whichever reads easier." The half-period ahead of the ship is the solid
  line and leaves it the way it is going; the half-period just flown is
  dotted and arrives at it from behind. Split by flight TIME, not by
  angle, so on an eccentric orbit the solid half really is where you will
  be in half an orbit. Re-split every frame, so the join stays on the ship
  at any time warp. The ORBIT console page draws its sketch the same way,
  with an arrowhead showing which way round you are going.
  `Kepler.samplePathSplit`; pinned by `test/orbitline.test.js` (43),
  which flies the ship half a period by brute RK4 to check the solid half
  ends where the ship really is.

- **Speed and altitude boxes, and a G meter (2026-10-18).** The rest of
  the fighter-HUD air data, either side of the ladder at horizon height.
  Boxes rather than tapes (the F-35 choice): our speeds run from mm/s to
  multiples of c and a tape is useless at one end of that range or the
  other. **Speed** (left) is relative to the same body the heading tape and
  ladder use, with its unit printed under the box because the unit changes
  with the regime: M/S on approach, KM/S in orbit, c in cruise. **G** sits
  under it, as on a real jet, with **PK** (the peak since you last left a
  berth; a berth or the arrival rail clears it). G is *felt* G, gravity
  excluded: coasting in orbit is 0.0, a burn is the burn, air is the drag,
  and parked it reads the deck's 1.0 (see artificial gravity, below).
  **Altitude** (right) is above the surface of the
  reference body: metres below 10 km, then km, then Mkm. Under it,
  vertical speed with an up or down arrow, and the air: inside an
  atmosphere, the density in kg/m³ in amber (the number atmosphere mining
  will run on); above one, how far down the top of the air is. Same dark
  halo as the heading tape. `Sim.feltAccel`, `Render.drawAirData` and its
  four readout formatters; pinned by `test/airdata.test.js` (43).

- **Decks have artificial gravity (2026-10-19).** Astra: pads and common
  areas have "clarke-tech artificial gravity generators ... just to make
  design easier." Docked anywhere (a ring berth, a station that does not
  spin, a pad on a moon you could jump off) and on the arrival rail once
  you are through the door, the G meter reads **1.0**, pressing up off the
  deck. Before this it read the real physics, which was right and not the
  game: 0.036 G on a small moon's pad and 0 in a station.

- **Air drag is a quarter as brutal (2026-10-19).** Astra, after the new G
  meter showed a coast through thick air at 2 km/s pulling 17 G: "make the
  air drag less brutal on the ship." One knob, `Sim.DRAG_SCALE = 0.25`:
  drag area was Cd·A with Cd taken as 1, which is a brick, and a quarter of
  that is a streamlined hull. The same coast now pulls 4.4 G. Air bleeds
  speed a quarter as fast, so scoop passes survive at depth and an
  aerobrake takes longer or goes deeper. **Heat is unchanged** (it reads
  density and speed, not drag), so a fast entry still cooks you; you just
  are not also crushed. Every drag behaviour the tests pin is a ratio
  (orbits inside air decay, laden ships hold orbit longer, gear down costs
  a third more) and all still hold.

- **Heading tape on the cockpit glass (2026-10-17).** The fighter-HUD
  strip across the top, above the bank arc: the scale slides, the caret
  stays put, and the boxed number under it is your heading to the degree.
  North is the **dominant body's own spin pole** laid onto the local
  horizon (the same horizon the pitch ladder levels against), so N/E/S/W
  are true directions on whatever world has you, and E is always the way
  the ground turns. Cardinals are lettered (N in amber), intercardinals sit
  on a row above the numbers, and a `REF` tag at the end names the body
  the compass is using, because north changes when the dominant body does.
  The nav lock gets a steering bug on the strip; off the strip it parks as
  an arrow at the end that is the shorter way round. On a pole the strip
  says `NORTH POLE · NO HEADING`; with the nose straight up or down the box
  reads `---` and the scale goes dark rather than freezing on 000. It is
  drawn with a dark halo instead of the glass's additive glow, so it stays
  readable over a sunlit planet. Shown while you are looking ahead, like
  the bank scale. `Sim.bodyPole`, `Sim.headingAngles`,
  `Render.drawHeadingTape`; pinned by `test/heading.test.js` (41).

- **The sky at cruise speed is physics, not paint (2026-10-17).** Astra
  chose the model from four with sliders in front of her: *special
  relativity below c, the classical outrun-the-light picture above it,
  easing from one to the other between 1c and 1.5c.* Below c, stars are
  seen where aberration puts them — crowding into a ring ahead as you near
  c — and coloured by their own temperature times the Doppler factor:
  ahead blue and bright, behind red and dim. Above 1.5c there is no
  aberration, the forward shift is the classical 1 + β cos θ, and the rear
  sky is black because its light cannot catch you. Every star has a
  temperature now (from the tint it was seeded with, so no seed's sky
  changes). Drawn in the world layer's star pass, behind the planets.
  `Render.cruiseSky`; pinned by `test/cruisesky.test.js`.

- **Star trails follow each star, not the nose (2026-10-17).** The old
  cruise streaks all pointed away from the heading. Now a star's trail is
  the path its *apparent* position has traced on screen over the last
  third of a second, each point through that moment's own camera — motion
  blur and comet tail in one rule (Astra picked both). Turns swing and
  curve the trails, looking about blurs them, a change of speed stretches
  each along its own aberration path; a steady cruise keeps a short stub
  toward where the star would sit slightly slower. The painted bloom at
  the vanishing point and the darkened screen edges are gone. The trails
  are drawn in the world layer straight after the stars, so a planet
  covers them exactly as it covers the stars — on the 2D overlay they ran
  across planets' faces, which Astra ruled out (*"that breaks the
  immersion"*). `Render.cruiseTrails` + `GLWorld.drawTrails`; only a
  machine with no world layer falls back to drawing them in 2D.

- **The ring's lift car rides down with the ship (2026-10-17).** Astra:
  *"we need the car to ride with the ship."* The converter now reads the
  art's own `extras.motion` lift declarations and records each car (and
  the `hatch` panels over it) face by face; the renderer lifts them out of
  the hull and draws the car wherever the arrival says it is. Ship and car
  move by the same eased number, so the hull cannot drift off the pad; the
  empty car climbs back once the ship is clear, and comes down to collect
  it on the way out. You collide with the car where it is drawn. The floor
  hatch is there while shut and gone while open (the art says it is a
  hatch, not how one moves). Only the ring uses a car on its routes; the
  skimmer's and spine's cars stay at rest. `test/transfer.test.js`.

### Changed

- **Milfuel shelves hold at most 18 t, down from 24 (2026-10-19).** Twilight
  worlds settled more of the galaxy, so licensed plants made more. The
  best single slug run in the economy suite reached 127,711 cr, more than
  a Kestrel, which is exactly what the shelf cap exists to stop. At 18 t
  the median run is back to what it was before twilight worlds (80,564 cr
  against 78,780) and the best is 95,783.

- **Small bays reached through a heavy bay cycle an airlock first
  (2026-10-17).** In to the heavy bay's stand, the outer doors close, *then*
  the inner gate opens, then on through the hull — the hull used to carry
  straight on through a gate that had not opened. At the ring this is the
  whole way down: stand, hatch, down the well onto the lift, ridden down
  the shaft, a beat on the pad, and rolled off level along the spoke deck
  (the converter's route corner hung ~150 m up in the spoke and made the
  hull hop). Bays with no lift skip the ride legs and take no extra time.

### Fixed

- **Work that had been committed went missing from the working copy
  (2026-10-19).** Two lines of work split on 2026-10-15: Driftwood on one
  branch, the 1.1.0-beta "Abby" release on another. The working copy had
  lost parts of both. Restored by three-way merge, without touching
  anything done since:
  - **From Driftwood:**
    - planetary rings drawn by their own shader;
    - cockpit greebles and the glass glow;
    - refusing to undock inside a station;
    - a crash counted as a loss;
    - culling small moons;
    - the belt chart;
    - the hull-import fix for lift shafts;
    - test probes that never touch your real career (they run in a
      throwaway profile) and the crash log.
  - **From Abby:** the release name and number in `package.json`
    (1.1.0-beta "Abby"), `src/release.js` loaded on the page, the
    Manifest names for the installers, and Abby's own section in this
    file. Everything written after Abby was cut was moved up here into
    Unreleased.
  The rings, greebles and release suites pass again. The branches
  themselves still need reconciling in git.
- **A holding's first nudge could move a system's crime score by one
  too many (2026-10-19).** The galaxy works the score out before rounding
  a government's two axes. A holding then re-ran the formula on the
  rounded ones, so in about one system in six the first change jumped by
  an extra point. It now adds its change to the system's own score.

- **Crossing a system took half an hour (2026-10-19).** Astra: "That gas
  giant is 27 minutes flight time from Mirven I, even at 6 times c", and
  in her Talon "the fastest speed allowed, even between planets, was
  6.7c". The cruise drive was capped at 2.0e6 km/s for every ship.
  - **The cap:** now the drive's own ceiling (see *Cruise drives come in
    classes*). The global constant stays only as a 20,000c guard rail.
  - **Engaging:** the drive now engages on **full**, following the mass
    lock up and down. `,` takes it off full; `.` up to the limit puts it
    back on.
  - **Arriving:** with full on, the arrival look-ahead is 0.5 s instead of
    2.5 s. At 2.5 s it dropped you out 23 million km short of Beta
    Mirven VII.
  - **Fuel:** reaction mass per km is cut from 1.1e-8 to 1.5e-9 t. At the
    old rate a 20 AU crossing would have burned twice a full tank.
  - **Measured at the 2000c cap** (before drive classes): Linethor I to
    XI, 42 AU, in 64 s; Beta Mirven I to VII in 46 s.

- **Slipspace drops you well outside the habitable zone (2026-10-19).**
  Astra: jumps "should dump you not close to the HZ, but a ways out".
  - **Where:** you arrive in orbit about the star, on the line to the
    busiest world.
  - **How far:** the furthest of three: the frost line, 1.6 × the habitable
    zone's outer edge, or 1.25 × that world's distance.
  - **On arrival:** nose on the world, the world locked, the camera on
    the ship.
  - In Taost that was 1.32 AU out, with the world at 0.33 AU.

- **Clouds stood still over tidally locked worlds (2026-10-19).** The
  cloud deck turned at a multiple of the world's day, and a locked world's
  day is its year. Past four days the deck now runs on a nominal 30-hour
  circulation. Found by `weather.test.js`, whose wettest pad had landed on
  a ring world.

- **Arriving at a world whose only port is a pad crashed (2026-10-19).**
  enterSystem read the pad's orbit for the camera distance. Found by the
  first corridor jump into a twilight system.

- **A new game could crash spawning over a world whose first port was a
  pad (2026-10-19).** The spawn picked `children[0]` of any kind and read
  its orbit. A ground pad has no orbit. It now picks the first ORBITAL
  station, and spawnShip ignores a pad if one is handed to it anyway.
  Twilight worlds hit this every time: their old pad comes before the
  stations added for them.

- **Cockpit panels overlapped (2026-10-19).** Astra: "panels overlap.
  This is a problem." Three separate overlaps, all fixed:
  - *The dash screens overlapped each other*, by 43 to 138 px between
    housings at every window size, worst on the smallest hulls. The
    mounting comment claimed the arc was 28° with a degree to spare; the
    mounts were at 24° and the housings were never counted. Now ±28° with
    the screens 6% smaller, and small cockpits shrink their screens with
    the room instead of more slowly than it. Worst case now ~21 px clear.
    The cockpit suite checks neighbours against each other at six window
    shapes and three cockpit sizes (36 new checks), so it cannot drift back.
  - *The help hints ran across the ORBIT screen.* With the band stowed and
    the console showing, both hint lines move to the top-left corner.
  - *The icon bar sat on the bottom of the screens.* With the band stowed,
    the cockpit view is now built for the window above the bar rather than
    the whole window, so the console sits above it. The GPU layer projects
    through the same camera, so the world stays in register.
  - The NAV contacts list ran ship names into their distances on a narrow
    window ("Coldwater Drove38,606 km"); names are now clipped to the room
    the distance leaves.
  - On a narrow window F3's pages shrank to half a column at 7 px type;
    with no room for the scope beside them they now take the full column.
  - The AUTOPILOT page's last line ("mass locked by …") ran 7 px into its
    own soft-key strip; the column is packed to end inside the page.

- **Flat orbits were drawn rotated (2026-10-19).** An orbit lying in the
  system plane, which is most of them, has no node line, and
  `Kepler.elementsFromState` then left the argument of periapsis at 0: the
  ellipse had the right shape but its periapsis pointed along +X wherever
  it really was, so the line could miss the ship by thousands of km. Found
  by the new orbit-line test. Flat orbits now keep their periapsis
  (retrograde ones measured the other way), and "no node line" is judged
  relative to the angular momentum, not against an absolute 1e-9 that
  rounding noise could pass.

- **A save taken in cruise loaded at 6.7c (2026-10-19).** Inside the
  cruise bubble the hull's velocity is the cruise speed, up to 2,000,000
  km/s, and the save did not know about cruise: it wrote that velocity
  down, and loading dropped you into ordinary flight at it with no bubble
  and no way to slow. A save in cruise is now written as the drop-out
  would leave you, in the circular orbit you are standing in, and an
  older save carrying a frozen cruise velocity (anything over 15,000 km/s
  relative to the nearest body) is repaired the same way on load.

- **Contracts never completed on arrival (2026-10-17).** Astra: *"missions
  still don't auto-clear when you arrive at the mission destination."* Two
  things wait for the docking moment — the arrival desk and the contracts
  — and the desk marked it handled first, so the contracts always saw "not
  just docked". Read once now, and both get it. The same dead branch held
  the clamp sound and the autosave on docking, which now happen too. A
  render-suite test flies the real frame loop through it.

- **Docking at a ring's heavy bay could crash (2026-10-17).** Leg timings
  were cached per station off berth 0's path, and a ring's berth 0 is a
  routed small bay — so the heavy bay was handed the long routed table and
  read off the end of its own short path. Cached per berth and per model now,
  and a mismatch returns no pose instead of throwing.

- **Ships flew through the ring's lift shaft wall (2026-10-17).** The route
  to a small bay ran diagonally from the heavy bay's stand to the foot of the
  lift, through the closed inner gate and the shaft wall. It now goes
  straight down the shaft (see Changed).

- **The world analysis sheet printed a gas giant's atmosphere over its own
  label (2026-10-17).** Long values in the star chart's two-column rows now
  wrap onto right-aligned continuation lines, and the text below moves down
  to fit.

---

## 1.1.0-beta "Abby" (2026-10-15)

**Releases have names now** as well as numbers, the way Linux distributions
do. They are pigeons from the rescue, in no fixed order. This one is named
for Abby, a PMV survivor. The name is on the title screen, in the window
title and in `src/release.js`; `test/release.test.js` keeps it and the
number in step with `package.json`.

This section was opened for alpha 5 and never closed for 1.0.0-beta
(2026-09-16), so everything below, down to "Before this changelog", shipped
in Abby. Since 1.0: crew and a fleet, weather you fly through, two rescue
services with a bill and a hull lien, standing orders, analysers and
rumours, ship-to-ship trade, industry you can buy into, milfuel works, the
Syndicate's fleet and its runners, and the station cutaway and glow pass.

### Fixed (release housekeeping)

- **The game was being built as "Procedural Space Game" 0.1.0 again.** A
  commit on 2026-09-16 restored an old `package.json` and undid the rename,
  so every build after 1.0 carried the old name, and a build under the old
  name looks for saves in the old folder. The Manifest name, appId, artifact
  names, desktop entry and maintainer are back.
- **The rescue test still expected a flat fee that was waived when you were
  broke.** Since the tow-and-bill change the fee is quoted at dispatch and
  any shortfall becomes a lien on the hull. The test now checks that.

### Saves

Careers carry over. The `game://` origin and the `%APPDATA%\Manifest`
folder are unchanged, and `electron/main.js` still copies saves across from
the old name if it finds them there instead.

### Everything else since alpha 4


Outfitting, weapons, and the law. See `PLAN.md` for the
full design and the phases still outstanding.

### Added

- **Cruise speed reads in c.** `0.412c`, `3.10c` on the console and the
  autopilot page, for the cruise speed and the mass-lock limit. Below a
  thousandth of c the old km/s readout carries on.

- **Trading with a ship you have hailed is a proper market now.** `F4` →
  pick a ship → `Trade…` opens a board in the channel pane: every line in
  their hold and every line in yours, what they ask and what they pay, and
  — for the selected line — what each direction would do or why it will
  not. The keys are the port market's (↑↓, → buy, ← sell, Shift ×10, Home
  buy max, End sell all); Esc backs out to the channel. It replaces the two
  one-line buttons, which offered the first line of the manifest, six
  tonnes at a time, at a flat markup, to anyone.

  Who you are matters now, as Astra designed it:
  - **The record gates lawful hulls only.** Wanted by a ship's own flag, or
    a fugitive from it, and it will not open its hold to you — and says
    why, and what would change it. Outlaw hulls deal with anybody.
  - **Standing moves the price**, up to 12% either way, never the door.
  - **Standing rises with the size of the deal** — a point per 2,500 cr,
    fractions carried, at most four points a faction a day.
  - **Rivals resent it.** Galaxies now carry seeded rivalries between the
    empires (`Galaxy.rivalsOf`). Trading with a rival empire's hull in an
    empire's space costs you with that empire; trading with a lawful hull
    in a Syndicate hold costs you with the Syndicate, and an outlaw hull in
    lawful space with the owner. The board says who will mind *before* you
    trade.

  Prices are anchored to what the good is worth at the ship's destination,
  so at the best standing a ship still asks more and bids less than the
  port it is bound for: a convenience and a way to buy friends, never an
  arbitrage. A swept test holds every two-way line in a dozen systems to
  ask-above-bid.

- **Syndicate runners work the black markets of lawful space.** Before
  them, 2,000 sampled systems put an outlaw-flagged trader in lawful space
  exactly zero times, so "dealing with an outlaw hull costs you with the
  owner" could never happen. Astra: *"pirates are always trying to get
  more."* Now a route touching a black-market port may fly the Syndicate's
  flag instead of its home port's — odds rising with the system's crime
  score — and the comms list marks it **Syndicate runner**. About 3% of
  lawful traffic; at least one in 77% of lawful systems, median four. A
  runner will deal with a pilot the local law wants, will buy your
  contraband, and costs you standing with whoever owns the space.

  It is a relabel, not new ships: the route keeps its manifest, timetable
  and hull. Manifests are scheduled deliveries to port markets, so new
  cargo would have moved prices in every existing seed.

- **The game asks for the discrete GPU.** The WebGL layer requested the
  `low-power` adapter, which on a dual-GPU laptop like the Latitude 5424 is
  an explicit request for the integrated chip. It asks for
  `high-performance` now, Electron forces the same at process level, and
  `GLWorld.adapter` records which chip actually answered.

- **Distress calls are signals now, not a bounty timer.** `distressAt` has
  existed since the law did, and the word had been a lie for the whole life
  of the codebase: the timer expired, `report()` added a bounty, and
  nothing in the universe had heard anything. No line, no position, no
  responder, no way to answer one.

  A call is an entry in `G.distress` carrying who is transmitting, their
  registration, where they are, what is happening to them, and when the
  transmission lapses. The comms list reads that list directly rather than
  keeping a copy in step with it, so a line on the panel cannot outlive the
  call it describes — Phase 13's rule (*every line must be true*) enforced
  by there being one account of the truth.

  **You can transmit your own, and choose what you are asking for.** A fuel
  tender or security — two genuinely different services that do not
  substitute for one another, so asking the wrong one is a real mistake the
  game lets you make. The emergency itself is read off the ship rather than
  chosen from a menu: out of reaction mass, hull critical, out of jump fuel.

  **This closes a real dead end.** Running the reaction mass out used to
  print *"Docking refills it free"* to a pilot with no thrust, naming the
  one exit and pointing at a door they could no longer reach. It now points
  at the exit that exists from where they are.

  **Two things the arithmetic caught during the build:**

  The first version gave every call a 90-second life. The nearest patrol
  in the test system was **34.7 million km away — eighteen honest hours**
  at a cutter's real acceleration — so the beacon would have lapsed while
  the answer was still accelerating: the dead end again, wearing a rescue's
  clothes. A mayday now transmits until the responder arrives; a squawk
  about a fight still goes stale in ninety seconds, because news does.

  And storing the rescue witness as `vouchesFor = t` was a trap, because
  `t` is 0 at the start of a career: the first rescue you ever performed
  would have read as no rescue at all everywhere downstream. It is an
  object now.

  **`steerNpc` learned to fly somewhere that is not the player.** Every
  mode it had steered relative to the player's ship, which is exactly the
  assumption that stops a cutter answering a robbery happening elsewhere.
  Responders are given a position. Today that position is always near the
  player — `damageNpc` has no caller but the player's own guns, so no NPC
  can attack another NPC — but writing it as a place rather than a synonym
  for `ship` is what Phase 9 will need, and a shortcut would have had to be
  undone.

  **Answering somebody else's call is built, tested and dormant** for that
  same reason: there is no third-party victim to rescue yet. It credits
  standing with the victim's flag and makes the rescued ship a witness
  *for* you, spending systems that already exist rather than inventing a
  currency.

- **Lightning keeps weather now, not time.** Astra: it should flash "at a
  more random-looking pace", and "look more like a real storm".

  What was wrong was a metronome. Time was cut into fixed 0.9 s slots and
  every stroke began at the top of its slot, so however many cells fired and
  however hard, the sky kept a perfect 0.9 s beat — a strobe with a storm
  texture on it. Three changes, each of them something real lightning does:
  strokes slide anywhere inside their slot; the previous slot is evaluated
  too, so a late stroke finishes instead of being guillotined at the
  boundary; and each cell's firing threshold is modulated by four slow
  rhythms, so storms burst and then go quiet rather than ticking over. A
  flash is also two or three strokes at hashed gaps instead of a fixed
  fifth of a slot, which is most of what the eye reads as lightning rather
  than as a lamp being switched.

  **Measured, because "looks real" is a claim about numbers.** The gaps
  between flashes in one cell now run 0.72 s at the tenth percentile, 2.3 s
  median, 7.2 s at p90 and up to 31 s, with a coefficient of variation of
  **1.01** — a metronome is 0 and a Poisson process is 1, and real
  inter-flash intervals are very close to exponential. Gaps landing within
  50 ms of a whole slot fell to 12.5% against 11% expected by chance, which
  is the beat being gone rather than disguised.

  **It repeats on purpose, and the number is written down.** The four
  rhythms are 419, 557, 683 and 811 slots — 6 to 12 minutes, which is how
  long a cell actually takes to wax and wane — and they are pairwise
  co-prime, so they realign only after their product: 1.293e11 slots, about
  **3,700 years of sim time**. Astra asked for a pattern that eventually
  repeats and cannot be caught repeating.

  The schedule lives in `weather.js` with every other weather number, so the
  suite checks the pace without a GPU and the two languages cannot drift.

  **And a latent bug found on the way.** The old salt multiplied the slot
  index by 374761393 in a double while claiming to be exact "for any bucket
  a career will ever reach". It left 2^53 after roughly eight months of sim
  time and began dropping low bits — the storms would have gone quietly
  periodic, which is the exact failure that function exists to prevent,
  hiding inside the function. It is `Math.imul` now and exact for every slot
  in the cycle.

- **The tow, the bill, and what happens when you cannot pay it.** The
  tender arrived and filled your tanks for a flat 500 cr, and if you were
  broke the crew waived it. Three things were wrong with that: there was
  only one service, the price did not depend on who was doing the work, and
  the waiver quietly made the whole fee optional — fly out broke, run dry,
  get filled for nothing. A rescue you can farm is not a punishment.

  **Two services, and you pick.** A transfer fills the tanks where you
  float and leaves you exactly where your mistake left you. A tow hauls you
  and your hull to a port you choose, and it is the only one of the two that
  answers a dead hull or a decaying orbit. Agreed over COMMS while the boat
  is still inbound, because the quote is a fact about the *call* — a crew
  that named a price and then re-quoted once you picked somewhere far away
  would be running the oldest trick there is.

  **Who answers sets the rate.** A port tug is a business: call-out, crew
  hours, and a rate on your all-up mass. A faction navy tender is free,
  because a warship's boat exists to pull people out of the dark — but
  waste one and it costs you standing, which is the right currency, since
  what you spent was their goodwill. The Syndicate charges three times a
  harbour's rate plus a quarter of what your hold is worth, and it reads
  your manifest before it quotes. The quote is the threat.

  **A rescue you cannot pay for becomes a lien on the hull.** Every sale
  gives up 20% until it clears, and the yard will not fit or trade an
  encumbered ship — with the reason said out loud, which is the rule
  `canFit` has always followed. Cargo trade, fuel, repairs and consumables
  stay open deliberately: the one activity that clears the debt is always
  available, so a bill can never become a soft game over. Astra's reason for
  choosing it over impound or confiscation was that it leaves room for a
  story, and it does — you keep flying, you just fly for the harbour for a
  while. It reuses the instrument unpaid berthing already runs on rather
  than inventing a second kind of debt.

  **Priced on crew hours, and the measurement is the whole design.**
  Distance to the nearest boat across forty seeds, sampled from every port:
  median 43 Mkm, p90 694 Mkm, worst 4,779 Mkm — and ~0 at the first
  quartile, because tugs live *at* ports. A linear rate over a spread that
  wide is unusable: at a mere 20 cr/Mkm the worst case bills 95,574 cr
  against a median full-hold sale of 4,898 cr, which is a debt that can
  never be cleared. So the bill is the tug's *hours*, using the same
  brachistochrone the rescue already flew — sublinear by construction.
  Measured at 26.7 crew hours median, 106.7 at p90, 280.1 at worst; at
  25 cr/h over a 500 cr call-out that is 1,167 cr median, 3,169 at p90 and
  7,502 for the worst tow in the galaxy. One to eight sales under the lien.
  Felt every time, fatal never.

  The lien's cut is a percentage for the same reason: a full hold grosses
  704 cr at the tenth percentile and 340,726 cr at the top, and any flat
  deduction across that is either beneath notice or confiscation.

  **The cable is a rail that hands off to the arrival.** Nothing about being
  dragged on a cable is interesting to integrate, and a 280-hour tow
  integrated accurately is tens of millions of frames — so the hull is
  placed where a tug flying a brachistochrone would have put it, on a
  smoothstep so the cable comes taut instead of snapping, with `vel` set
  from the same curve because the speed tape reads it. It ends by handing
  the ship to `beginArrival`: the tug delivers you to the apron and the port
  draws you in, through the geometry that already knows about gates and
  berths. A tow that re-implemented docking would be a second copy of the
  hardest code in the project.

  Carried like an arrival but compressed like a long burn — its own branch
  in the main loop, because an arrival's legs are seconds and are forced to
  1×, whereas a tow is hours and would otherwise be a wait rather than a
  journey. You keep the seat throughout, which is what will make being
  interdicted mid-tow possible.

  **Two bugs worth recording.** A tow deliberately does not refuel you, so
  `stranded` stays true for the whole crossing — which had the rescue
  calling a fresh boat every frame, forever, for the same emergency. And
  `holdBase` reached for `global.Eco` when every other site in the file uses
  `global.Economy`, so the Syndicate silently valued every hold at zero and
  its whole menace evaporated; the test caught it on the first run.

- **Two rescue services, from two different homes.** A mayday for a tender
  used to be answered by one kind of ship that existed for no stated reason.
  There are now two, and where each one lives is the whole of the mechanic:

  A **port tug** never leaves home. It works a short hop between its own
  berth and the next port along, and it only exists at a **shipyard, a
  highport or a fleet carrier** — places where ships are actually worked on,
  not merely stopped at. Squat orange hull, harbour-tug names with no
  romance about the job: *Bollard*, *Capstan*, *Hawser*.

  A **rescue tender** is launched by a capital ship and rides its parent's
  own orbit, which is how two vessels keep company without an AI that flies
  formation. **The capital's size sets the tender's size** — a big warship
  launches a big tender — so a size letter is, for the first time in this
  game, a fact about a *particular ship* rather than about its class.
  The Syndicate flagship carries one too. That is not generosity: a salvage
  crew that reaches a stranded hull first is in a very strong negotiating
  position.

  The consequence is a map you can read. Help near a port is a question
  about **what kind** of port; help in the deep is a question about whether
  a capital flies there. And it makes a warship's presence cut both ways —
  the same hull that sees four times as far and cannot be bribed is also the
  reason anyone comes for you out there.

  **A measurement and a doctrine violation, both caught by the suite.**
  The first cut let tugs spawn at ordinary orbital ports — the commonest
  role in the game — which put 218 of them across forty systems, five and a
  half per system, every one a patrol to wake and steer. Restricting them to
  working ports gives 2.9 per system across 33 of 40.

  And the capital's size letter was first drawn with `rng.next()` **from the
  shared patrol stream**. `economy.test.js` failed inside a minute on an
  assertion about something else entirely — capitals had become *more*
  common than cutters — because one extra draw shifted every subsequent draw
  in `buildPatrols` and changed which systems got capitals at all. Every
  seed in the galaxy had quietly become a different place. The letter is
  hashed off the ship's own id now, and the tug and tender loops draw from
  their own forked substreams. Doctrine 2 exists for precisely this, and the
  test that caught it was not testing for it.

- **A GUNS page on the dashboard.** Which hardpoint answers which trigger
  used to be visible only on the F5 FIT page, and F5 is the wrong place to
  find it out, because you cannot open the yard while somebody is shooting
  at you. Click a cockpit panel round to GUNS and it shows both groups with
  a live count, every hardpoint the hull has — including the empty ones,
  because a hole in the rack is a fact about your ship — which way each one
  points, which trigger it is on, and how far through its cycle it is, over
  the hull-heat bar and the sink's state.

  It stores nothing of its own. Group membership is the same map the
  trigger reads, readiness is the same cooldown the trigger writes, and the
  side pointer comes from the muzzle the renderer draws the beam from, so
  the panel cannot drift out of agreement with the ship. Under time
  compression, where the triggers refuse, it says so rather than reciting
  keys that would do nothing.

- **A spent heat sink is now something in the world.** It used to be three
  numbers in a list nothing read. Ejecting one now throws a tumbling,
  white-hot block clear of the hull: it drifts on the same physics as
  wreckage, it is the loudest thing on your scope while it is hot, and it
  cools to a dull grey brick over about two and a half minutes — half its
  heat gone every thirty-four seconds. It outlives a piece of wreckage, and
  the debris of a ship you kill can never delete it.

  Nothing else reacts to it yet. It is a record of where you were and when,
  sitting in space where anyone could find it, and what a patrol or a
  seeker does about that is still an open question.

- **The landing gear works, and it always did.** Shift+G has been flipping
  the state correctly for as long as it has existed — the drag changed, pads
  caught you, the status line said GEAR DOWN — but nothing on the ship
  moved, so the only conclusion available to a player was that the key was
  broken. Now three legs swing out of their bays over a couple of seconds,
  doors first, and fold back in the same order reversed.

  The legs come out of the models rather than being drawn by hand: every
  hull was already rigged with hinges, doors, struts and feet as separate
  nodes, and the converter now keeps that rig instead of welding it flat.
  Thirty-six of the fifty-two hulls have gear. The ones that do not —
  capitals, liners, navy cutters, freighters, escape pods — are the ships
  that never touch a pad, which is the right answer rather than a gap.

### Changed

- **Contraband is graded now.** A flat 180 cr/t said every illegal cargo was
  the same crime. The ladder, worst last: **narcotics** (somebody's vice),
  **restricted arms** (somebody's war), **military drive fuel** (naval
  materiel in hands the navy did not licence). Ten tonnes costs 1,800,
  4,500, or 9,000 cr — the last of which sits just under the flat 10,000 for
  carrying radioactive waste into a Syndicate hold, which stays the worst
  thing on the board and stays off this ladder entirely, because that is a
  protection racket enforcing its own law rather than a state enforcing a
  graded one. The standing hit is graded the same way, by the **worst** item
  found rather than the average: a hold of narcotics with one tonne of naval
  fuel in it is a naval-fuel problem.

- **Military drive fuel is contraband depending on who is asking.** It is
  not flagged illegal in the catalogue and it must not be — it is bred at
  licensed plants and sold at a listed price, and flagging it would have
  made the whole legitimate trade a crime. It is an offence only in the hold
  of a pilot with no standing with the flag that stopped them, at the same
  threshold the Chernobyl drive itself is sold behind. One number, so a
  pilot cleared to own the drive is cleared to carry what it burns.

### Fixed

- **Lightning went back to a strobe (restored 2026-10-19).** The 10-17
  branch merge kept the other side's copy of the planet shader's flash
  block, and the old one-slot lightning came back with it: every stroke
  started on the same 0.9 s beat. Restored from the Driftwood commit:
  strokes slide off the beat by a hashed offset, a late stroke is
  allowed to finish in the next slot, and storms burst and go quiet on
  four slow rhythms instead of firing at a flat rate. The cut-band code
  the merge brought in is untouched. `test/weather.test.js` was the
  canary (it checks that every weather constant reaches the shader) and
  is back to 41/41; the shader compiles on the GPU and planets draw.

- **Buying off a passing ship emptied the whole line, for the session.**
  The purchase came off `route.out` — the template manifest every later
  sailing of that line reads — so six tonnes bought once meant every
  future voyage sailed six tonnes light, and a line bought dry ran empty
  until the next reload. What a voyage has lost is now a per-voyage ledger
  (`G.shipTrade`), forgotten when the voyage ends; the timetable stays a
  pure function of the seed.

- **Every ship in the game was flying with its landing gear down.** All
  fifty-two models were authored with the legs extended, and the converter
  baked every node transform into the vertices, so three legs were welded to
  the belly of every hull — in flight, in combat, in slipspace, on the F5
  hull viewer. Nobody had reported it as a bug, because with nothing able to
  retract them there was no "up" to compare against; it surfaced only when
  the gear was given real motion and the belly came out clean.

- **Piracy stopped working the moment you died.** A respawned ship came back
  without a cargo scoop, so a robbed freighter dumped its hold exactly as it
  always had and none of it could be picked up. The refusal speaks once every
  twelve seconds, which is easy to miss entirely — so the conclusion available
  to a player was that robbing ships was broken, not that they were missing a
  1,400 cr fitting nobody had told them they had lost.

  The cause was two pieces of code assembling the same ship with no reason to
  agree. `migrateFit` issues the starting kit, but only when the fit map is
  **empty**; `stripForRespawn` hand-wrote a map with the starter gun in it, so
  the early return fired and the kit was never issued again. When the scoop
  stopped being a property of having a hold and became a fitting, only one of
  those two learned about it.

  There is one starting-fit list now (`STARTING_FIT`) and both paths read it,
  so they cannot drift apart again — and `stripForRespawn` no longer sets the
  four legacy weapon fields by hand, which means it can no longer set them
  wrongly by hand either. Two checks that would have caught it: one asserting a
  new ship and a respawned one carry the same thing, and one in the render
  suite that robs a crate **after** a respawn and drives the real frame loop.
  Both were confirmed to fail with the fix removed — the two scoop checks
  already in the suite passed throughout, because both ran on a ship that had
  never died.

- **Contraband was being detected and then not punished.** A search would
  find a dirty hold and the cargo would stay aboard with no fine. The cause
  was in the suite rather than the game: the test pinned `Math.random` to a
  single low value to force the search, and once the bribe branch landed
  that same value also sailed under the bribe roll, so the inspector took a
  payoff every time. The test now feeds a *sequence* — low to search, high
  to refuse the bribe — which is what a test has to do once the code under
  it draws twice.

- **A witnessed crime is no longer expected to be reported instantly.**
  Same shape of problem: a third-party witness takes eight seconds to get on
  the radio, and those eight seconds are the window in which their silence
  can be bought. The old check asserted instant reporting, which amounted to
  asserting that the hush mechanic could not exist.

- **Jettisoning cargo actually gets rid of it.** It did not. A crate leaves
  the airlock 50 metres astern; the scoop reaches 80; so the ship swallowed
  it again on the very next frame and the hold came out unchanged. The only
  symptom was cargo that would not go away.

  Anything you push out yourself is now inert until it has genuinely got
  clear of you. That is a **distance** test rather than a timer, on purpose:
  a timer in sim seconds evaporates under time compression, and a timer in
  real seconds could be waited out sitting still. It resolves on its own in
  about seven seconds from the shove the airlock gives it, or instantly if
  you are moving. Cargo somebody *else* dumped is catchable at once, which
  is what makes robbing a freighter work at all.

  This had a `frames(60)` sitting right on top of it in the suite that only
  ever checked for exceptions. It checks the hold now.

### Added

- **The cargo scoop is a fitting.** Picking things up used to be a property
  of having a hold, which made throwing cargo overboard reversible and
  therefore meaningless. It is now a utility-slot item — 1,400 cr, stocked
  everywhere, **fitted on a new ship** so nobody learns the rule by watching
  their own cargo drift away.

  Three systems get a spine out of one change: dumping cargo to outrun
  somebody is a decision you cannot take back, a freighter dumping its hold
  in front of you is only worth robbing if you brought the equipment, and a
  debris field is something you prepared for rather than drove through. Sell
  it if you want the slot — on a Talon it is competing with the turret, the
  sink launcher and both scanners for one of two.

  It draws **no power**, which is a decision and not an oversight: a scanner
  runs continuously, a scoop is a hatch and a clamp that work for a few
  seconds a day. The first version charged it 0.4 MW and the suite
  immediately reported four separate measured budget facts moving, including
  the one where an oversized slipspace anchor stops fitting a Talon. Its
  price is a tonne and a slot — enough that a Class 3 beam, a Mk II reactor
  and a shield on a Kestrel, which come to *exactly* its 22 t budget, mean
  the glass cannon flies without one.

  Nothing to do with the fuel scoop, which is one of the heat shield's jobs.

- **A signed contract can finally explain itself.** The ACTIVE CONTRACTS
  column on F7 now spells out where each job is actually going — the berth,
  the body it sits on, and the system, or for a courier the star and the
  fact that any port there will do — and every contract carries its own
  **DETAILS** button, which opens the long form you signed it with.

  Both of those had been on the contract the whole time. `accept()` copies
  the destination across and deliberately *carries* the long form rather
  than regenerating it, so that a job signed a week ago still says what it
  said when you signed it. The board had the button; the one place the text
  was designed to be read did not. Now it does, and the F7 screen has tests
  covering it — signing a contract and then drawing the screen was a path
  the suite had never once exercised.

- **Mission headlines are generated rather than concatenated.** A board used
  to read as one fixed sentence shape per job type. It now assembles
  `[URGENCY] [VERB] <core> [— TAIL]`, where the core — tonnage, commodity,
  destination — is never touched and everything else has to fit a 64-column
  budget to appear at all. "Priority: Run 6t Metal ores to Coldwater Post —
  they are short" instead of "6t Metal ores to Coldwater Post".

  The urgency prefix is a **true tell**: it appears when the fee sits in the
  top quarter of that job type's own pay band. A board that shouts is a
  board worth reading twice.

- **Mission prose reads the world instead of a bigger adjective list.** The
  long form now names the destination's actual role ("the reprocessing plant
  at Halden Dock"), says when a run goes down a shaft into an underground
  bay, quotes the real distance in light years for a courier, notices when
  the far end is genuinely short of what you are carrying, and warns you
  when the route crosses permissive space. All of it is read off state the
  mission and the economy already had.

  The rule that makes this safe is unchanged and is the whole reason the
  generator is allowed to exist: **the grammar may only combine fragments
  that describe state the mission actually has.** A clumsy join is the worst
  failure available; a sentence describing a job you cannot do remains
  structurally impossible.

  Two fragments were written and then deleted for being *true but useless* —
  "there is more of it on this dock than anyone can use" and a matching
  "— surplus here" tail. A haul is only ever offered in a good the origin
  exports, so both were true of every haul ever generated, which is a
  tautology dressed as insight printed on two thirds of the board.

- **Faction campaign chapters have a long form at all.** `arcs.js` built its
  own contract objects and never called the finisher, so every campaign
  chapter shipped with a headline and no description — the one kind of work
  that most deserves an explanation was the only kind that had none.

- **Your bridge belongs to your ship.** Every hull in the game sat in the same
  room behind the same glass — a Dart interceptor and a Mule freighter had
  identical cockpits, which is a poor joke when the cockpit is the only part
  of your own ship you ever actually look at.

  It is a kit now. **Type** decides the character: an interceptor wraps more
  glass around a tighter seat, a freighter sits you back behind a heavy brow.
  **Size** scales it, read off the hull's own mass — so a hull nobody has
  designed yet still gets a sensible bridge without anyone adding a row to a
  table. And a little **flair** on top, seeded so it is yours.

  The seed is the hull's birth mark, stamped when you buy it — deliberately
  *not* the registration, which you can retype on the yard page. Renaming your
  ship does not rebuild the cockpit around you.

  The Talon's bridge is unchanged, and that is on purpose: every multiplier is
  1.0 for it, so the room that was tuned by hand is still exactly that room and
  everything else deviates from a known-good one.

- **The canopy wraps, and it is raked to the hull you are flying.** The old
  glass was one flat pane at a fixed 1.20 m for every ship. There are
  quarter-lights outboard of the windscreen now, so turning your head finds
  more sky and less wall — an interceptor sees noticeably further round than a
  freighter. The lean of the glass is measured off the hull's own model rather
  than chosen: a long fine nose gets steeply raked glass, a blunt one sits
  more upright.

  The windscreen itself stays flat, which is not a shortcut. A curved pane
  projects as tan(elevation)/cos(bearing) through a flat camera, so it bows
  off the top and bottom of the view at the corners — which is exactly why
  real windscreens are flat glass and the wrap comes from separate panes.

- **The cockpit screens stop skewing when you turn your head.** The readouts
  were drawn by mapping a flat page onto the panel with a 2D transform. That
  transform is built from three of the screen's four corners and *cannot* use
  the fourth — an affine maps a rectangle to a parallelogram and nothing else.
  The housing was drawn with all four, so the frame was a true perspective
  quad with a parallelogram of content sliding around inside it. The more you
  turned, the further apart they got.

  Each screen is now a real lit rectangle bolted to the console, drawn by the
  same projection as the rest of the world, so the perspective is exact rather
  than approximated — no subdivision, no seams, nothing left over at the
  corners. The housing, bezel and stalk are still 2D; they are opaque
  furniture and were never the part that skewed.

  Without WebGL2 the old path still runs, skew and all. A wrong-looking
  readout beats a blank one.

- **You can break into a starport.** A surface port's doors are not commanded
  on the port — they answer to a control cabinet standing out on the rock
  beside the works. It has to be outside, because a computer that lets you in
  cannot be inside the thing it lets you into. And because it is outside, it
  is exposed: you can set down beside it, and so can somebody who was never
  granted anything.

  That is the mechanic. Faction standing decides whether you are **granted**
  clearance and has no bearing whatever on whether the cabinet can be
  **taken** — so the port that will never clear you is exactly the one you can
  still get into. `F4`, pick the port, `H`.

  It is loud. A failed attempt trips the alarm, books a bounty with the
  cabinet's owner, and locks the panel for 45 seconds — turning a closed door
  into a warrant, after which the same doors are shut to you for a reason you
  brought on yourself. A developed world has better locks than a backwater,
  and it is the **same** lock every time you come back to it: the difficulty
  is derived from the world, only the roll is a roll.

  Two things it deliberately is not. It is not a launch clearance — getting in
  is not the same as getting out, and asking for the way out is still a
  conversation you have to have. And it does not defeat the interlocks, which
  are mechanical: the lift still cannot come flush while the doors are shut,
  whoever is giving the orders. A breach also does not follow you to the next
  system; a port whose lock you broke once is not a port you own.

  You will find out about it the way you should: ask a port that hates you for
  clearance while parked next to its cabinet, and the refusal mentions it.

- **You can watch yourself being docked.** Landing on a pad with a hangar
  under it used to park the ship in a single frame. Now the apron doors open
  under the hull, a level car carries it down the 45° shaft, the inboard gate
  opens, and a traverser runs it across the floor to its assigned bay — about
  eighteen seconds, and **the camera is yours the whole time**, so you can
  orbit the hull while it is being carried. Time compression is held at 1×
  while it runs, because a sequence measured in seconds resolves into nothing
  at 500×.

  The best moment is not the machinery, it is the sky: on the apron you are
  still outside, with the planet and the stars where they should be. When the
  car starts down and the leaves seal above you, the world goes away — because
  something closed over your head, not because a flag flipped.

  A bare pad with nothing under it still docks instantly, as do orbital
  clamps: there is no shaft to be carried down.

- **A berthed ship is inside a building.** Park in a surface port and the
  hangar is now the whole world: no stars, no ecliptic grid, no orbit lines,
  no other planets, no traffic, and no sun-glare across the canopy. Before
  this the walls were there but you could see the solar system past the end
  of them, which read worse than no walls at all — it made the room look
  like a texture. Pressing **F2** for the orbit chart still shows you the
  system, because answering "show me the system" with the inside of a shed
  would just be a blank map.

- **Glass is translucent.** Every port town grows greenhouses — a colony on
  a world nobody can breathe on has to make its own air — and the crop
  inside them is lit precisely so that you can tell there is something alive
  in there from a long way off. The panes over it were solid, so you never
  saw it. Now you do.

- **Everyone has shields now, and you can see them work.** Warships and money carry a
  field; freighters, shuttles and escape pods do not. When something hits one
  it **flares where it was struck and the energy spreads out across the rest
  of the bubble and dissipates**, and the field is not a sphere — it is the
  ship's own shape, held about a metre off the plating. A shot that gets
  through makes a hot bloom on the hull instead, so which effect you see tells
  you whether the shield is still holding without reading a number.

  The field also **changes colour as it wears down** — cold blue-white while
  it holds, amber as it goes, hot red when it is nearly gone. And because you
  cannot see your own hull from the cockpit, a hit you soak now blooms on the
  inside of the canopy in the direction it came from, which doubles as a
  warning about where the shooter is.

- **And carrying two kinds of gun finally pays.** The pulse-soaks /
  beam-drains numbers have been printed on every laser in the shop since the
  weapons were retiered, and nothing in the game ever read them — there was
  only one shield, it was yours, and your own guns never hit it. Now that
  other ships have fields, the whole thing switches on: against a naval
  cutter, stripping with a beam and then opening the hull with a pulse takes
  **14 shots against 18 for the best single weapon**. That is what fire groups
  were for.

- **Ships come apart when you kill them.** The explosion has been standing in
  for this since combat existed — two expanding rings and then nothing, as
  though the hull had been deleted rather than destroyed. A wreck now throws
  six to sixteen tumbling shards, more from a bigger hull, and **some of them
  are worth taking**: what did not spill as intact crates was aboard when the
  ship broke up, so it comes off as salvage you scoop the same way you scoop
  anything else. The radar tells you which is which — scrap is a dim grey
  dot, salvage is the amber cross a crate gets — because picking through a
  debris field is the game, and hoovering one is not.

  Same seed, same wreck: the pieces are hashed off the ship's own id, so a
  replayed kill throws the same shards the same way. They live ninety seconds
  and vanish when you leave, which is what stops a system that has seen a
  hundred fights from being a hundred fights' worth of litter.

- **The two slipspace modules are things you can buy.** The Wake Baffle and
  the Harmonic Transit Anchor have been priced and read by the corridor since
  it was built, and there was no way to purchase either one. They are now
  ordinary fittings in the internal slot — **four classes each**, because the
  class is what the field covers — so they cost power, cost tonnage, save
  with the ship, and refuse in words when they will not go.

  | | Mass | Draw | Price |
  |---|---|---|---|
  | Wake Baffle I–IV | 2–6 t | 0.8–2.0 MW | 6,000–28,000 cr |
  | Transit Anchor I–IV | 4–11 t | 3.2–7.0 MW | 28,000–140,000 cr |

  A baffle needs a moderately developed port; an anchor needs a developed one
  that likes you, the same counter that sells the muon lasers. And the budget
  now says what a bespoke field could not: a Class IV anchor on a Talon is
  seven of its nine megawatts and eleven of its fourteen tonnes, which is
  legal, ruinous, and visible before you spend rather than after.

- **Fire groups, and a second trigger.** A hull with more than one hardpoint
  now has two of them. Every gun starts on group A; move one to B on the F5
  FIT page and it answers a different trigger:

  | | Group A | Group B | Missile |
  |---|---|---|---|
  | Keyboard | `Space` | `Shift`+`Space` | `B` |
  | Mouse aim (`F9`) | mouse 1 | mouse 2 | middle button |

  Hold either, or both at once — a beam group stripping the shield while a
  pulse group works the hull is the loadout the shield model was built to
  reward, so forbidding it would have quietly deleted that build. Cooldowns
  are per *slot*: two guns in one group are two triggers pulled together, not
  one gun firing twice as fast.

- **The mouse is a weapon, in mouse-aim mode.** With `F9` aim on, the nose
  now follows the mouse with **no button held** — which is what frees the
  buttons to be triggers, and what fixes the previous arrangement where you
  could only turn the ship while dragging. Mouse-aim off is unchanged:
  left-drag turns your head, `Space` and `B` still shoot. Right-click over
  the canvas no longer opens the browser menu mid-fight.

- **Beams heat your own hull — for real this time.** The heat sink shipped
  built, tested and completely inert because nothing in the game generated
  weapon heat. Now every shot puts its rated waste heat in, through the same
  `addHeat` a live sink intercepts. One shot costs `heat × cooldown`, so a
  weapon held down costs exactly the figure the catalogue prints and one
  fired in taps costs proportionally less, with no second number to keep in
  step. Against a bare hull's 18/s shed: a photon beam (12/s) can be held
  down forever, a kaon beam (26/s) gives about twelve seconds, a muon beam
  (46/s) under four. The turret's own heat rating is now spent too.

- **A pirate's hold is a pure function of its registration.** It used to be
  invented with `Math.random()` at the moment of death, which broke the
  project's first doctrine two ways: the same wreck on the same seed threw
  different goods every time, and robbing a pirate *alive* could disagree
  with killing it about what it had been carrying, because only the death
  path ever invented a manifest. Both now read one hashed hold — salted with
  the system seed, since patrol ids are numbered per system — and the loot is
  drawn from **what actually flies in that system**, so a run on medicine
  means pirates full of medicine. The scatter of the canisters and the cash a
  robbed ship hands over are derived the same way, so neither can be rerolled
  by reloading.

- **Equipment slots.** Every hull now has typed slots — hardpoint, utility,
  internal — plus a **reactor output budget in megawatts** and a **fit
  tonnage budget**. What you can carry is now a decision instead of a
  shopping list.

  | Hull | Power | Hardpoint | Utility | Internal | Fit mass |
  |---|---|---|---|---|---|
  | Dart Interceptor | 7.0 MW | 2 | 1 | 2 | 9 t |
  | Talon Courier | 9.0 MW | 2 | 2 | 3 | 14 t |
  | Kestrel Multirole | 14.0 MW | 3 | 2 | 4 | 22 t |
  | Mule Freighter | 18.0 MW | 2 | 3 | 5 | 30 t |

- **Nine lasers**, three classes by emitter size and three varieties by how
  the energy is delivered. The varieties are not a ladder — they trade
  against the shield model that already existed:

  | Variety | vs shield | vs hull |
  |---|---|---|
  | Pulse | ×0.6 | ×1.2 |
  | Intermittent | ×1.0 | ×1.0 |
  | Beam | ×1.5 | ×0.7 |

  A beam strips a shield and struggles with armour; a pulse is the reverse.
  Carrying both is the intended answer, which is what fire groups will be
  for.

- **Beams heat your own hull.** Rated in heat units/second against the
  existing re-entry model: a Class 1 beam (12/s) sits under what a bare
  hull radiates and can be held down forever; a Class 2 (26/s) gives about
  twelve seconds; a Class 3 (45/s) gives under four. The ablative heat
  shield covers all of them — so a re-entry module is now combat gear too.

- **Auxiliary reactors, Mk I–III.** +2.5, +5.0 and +9.0 MW for 5, 9 and 14
  tonnes and an internal slot. One reactor of any tier. These are what make
  the mass budget bite: before them, power was the binding constraint in
  every build and fit tonnage was close to decorative.

- **Selling fittings back**, at 45% of list. A refit is a haircut, not an
  investment.

- **`canFit` explains itself.** Every refusal carries a reason in words —
  "needs 13.0 MW, only 7.2 free" — because a greyed-out button that will
  not say what is wrong is indistinguishable from a bug.

- **Availability data** on every item (`minDev`, `minStanding`, `minCrime`,
  `grey`), ready for the port-stock work: developed ports will carry the
  heavy classes but only sell them to factions that like you, while
  high-crime ports will sell cheap gear to anyone including a fugitive.
  The data is in; the yard does not read it yet.

- **Pilot name, ship name and registration**, on the F5 page. Pilot and
  ship names are yours and cost nothing. Registration is a legal record: a
  dockside job at 250 cr, either typed in `LL-NNNN` form or rerolled from
  the seed. All three persist in the save.

- **Text entry**, which this game has never had. It is a small widget and
  one rule: **while a field has focus it eats the entire keyboard.** Naming
  your ship must not jettison waste on the W or flip to MFD page 5 on a
  digit, so `main.js` consults it before the function-key and number-row
  handlers, which run early and would otherwise steal half the alphabet.
  Enter commits, Escape abandons, leaving the page abandons.

- **The yard rebuilt** around slots, in three tabs — FITTING, BUY, HULLS —
  with a permanent power/mass/slots bar above them. Fittings can be sold
  from the FITTING tab.

- **The yard scrolls.** Rows are built as a list and then drawn through a
  window, rather than painted straight into a cursor that ran off the
  bottom of the panel — which is why a Mule's ten slots used to simply
  vanish. Mouse wheel over the list, or click above/below the scrollbar
  thumb to page. The wheel is claimed before the camera zoom, so rolling it
  over a shop no longer flies the camera backwards out of the cockpit.

- **The yard is named for the port it is in** — `MINING HEAD · OUTFITTING`,
  `AGRICULTURAL CO-OP · OUTFITTING`. It used to say "SHIPYARD &
  OUTFITTING" everywhere, including at a farming co-op with three items on
  the shelf. Now that stock genuinely varies, the sign tells the truth
  about the place, the way the trade console always has.

- **Heat sinks.** A launcher (utility slot, 4,800 cr) holding three
  charges at 320 each. A live sink banks 60 units of stored heat on the
  spot, then takes 65% of everything generated for six seconds or 220
  units. The fraction is the design: at 100% the heat clock stops and it
  is a panic button, at 65% it merely slows, so a sink extends a window
  rather than suspending one and cannot rescue you once you are cooking.
  Ejects itself when full or expired.

  The plumbing (`Combat.addHeat`) is in and tested, and weapon heat now
  actually arrives — see fire groups above, which is what switched this on.
  The ejected sink becomes a real tumbling object with the debris system.

- **Every item has a sales pitch** — the yard's own copy, shown after the
  numbers on any line you can actually afford and fit. Where a pitch is
  unflattering that is deliberate.

- **Ports stock different things.** Development gates what is on the shelf,
  standing gates whether they will sell it to you, and a lawful port will
  not arm someone it wants. Locked lines are *drawn, with the reason*, not
  hidden: "needs WARM standing with the Halden Combine" reads as a goal
  where a missing row reads as a bug.

### Changed

- **A new career starts on a spaceport, not in orbit.** ⚠️ *Written but not
  yet run.* You begin docked at a port on the home world — stationary, with
  the trade console and the yard available before you have risked anything —
  and getting off the pad is the first thing you choose to do rather than the
  thing that has already happened to you. Launch clearance is not handed to
  you: hail port control on `F4`, then `U`. The first orbit you fly is one you
  put yourself into, which is the thing this game is actually about.

  A respawn after a crash still puts you back in orbit. Being handed your ship
  back on a pad would quietly undo the cost of having crashed.

- **The auto-turret moved to a utility slot.** Hardpoints are for guns you
  aim with the nose, which is what this game's guns have always been.
- **Duplicate uniques are refused rather than sold.** A second shield
  generator, heat shield or turret did nothing but burn power and tonnage.
  The shop now says so instead of taking the money.
- **Buying a hull revalidates your fit** and refuses the sale if the gear
  will not go, exactly like the existing refusal when your cargo will not
  fit the new hold. Silently dropping a Class 3 laser on a downsize is
  worse than the sale simply not happening — you would not find out until
  the next fight.
- **`ship.gun` now reads `c1pulse` rather than `pulse`.** The old ids
  survive as aliases pointing at the same objects, so nothing that reads
  `Combat.GUNS.beam` broke.
- The old `pulse` maps to **Class 1 pulse**; the old `beam`, at 15 damage a
  shot, maps to **Class 2 intermittent**, which is where that behaviour
  actually belongs on the new ladder.
- **Bolts are streaks now, not slugs.** They were reported as too chunky and
  too slow, and the slug was the mistake: a pulse emitter fires a bunch of
  charged particles, a bunch debunches as it travels, so the bolt **gets
  longer on the way out** and then collapses into the point of impact rather
  than blinking away. The core is a third of its old width with a soft halo
  behind it — a bright bar has no centre for the eye to find — and the whole
  thing crosses in 0.20 s instead of 0.30, because a streak says a shot
  happened along its entire length and no longer has to dawdle to be seen.

- **And bolts are in the world now, not on the glass.** A tracer used to be
  drawn between two projected points with its width on a fixed pixel ramp, so
  every shot tapered by the same amount whichever way it was pointed, and the
  bolt slid across the screen at a constant rate however far it was going
  away from you. Both are fixed at once by walking the **world** ray and
  taking each point's width from its own distance: a shot crossing your view
  broadside is now an even ribbon, one fired away down the boresight narrows
  and its travel visibly slows as it recedes.

- **A Quit button on the main menu.** The title screen could start a career,
  load one and resume one, and had no way to leave the game — you closed the
  window. It now closes it for you, committing the autosave first. In a
  browser tab it says why it cannot instead of quietly doing nothing.
- **A robbed freighter now stays robbed.** Demanding cargo or credits used to
  pay out in full every time you asked, which one interdiction in deep space
  turned into an unlimited supply of money. A ship hands over its purse once
  and its hold a third at a time until there is none, and says so.
- **Interdicting a hauler is worth doing.** The ship you tear out of
  slipspace carries a hold scaled to its tonnage — roughly 4% of all-up mass,
  so a packet is about twelve tonnes and a bulk hauler about a hundred and
  ten, more than a Talon can lift. Which contact you chase down the corridor
  is now a decision rather than a formality.

### Fixed

- **A new career started at a spaceport, banked ninety degrees.** Docking
  chose the roll arbitrarily off whatever axis happened to be perpendicular
  to the ship, so a berthed hull sat on its side with its landing gear
  pointing at a wall. It is now levelled against the local horizon, and the
  attitude measures exactly level across every seed tried. A career that
  starts on the pad also **arrives with its docking clearance already
  spent** rather than being fined 500 credits and logged as a fugitive at
  its own home port on the first frame of the game.

- **Greenhouses were sealed drums.** The lit crop inside every one of them
  was drawn, and then hidden behind its own opaque glass — so the one
  feature meant to make a port town legible at night was never once
  visible.

- **Beams left the ship sideways.** They were drawn from `ship.pos`, which
  in the cockpit is eight centimetres *behind* the pilot's eye — projecting
  a point at a depth of roughly zero threw the origin toward infinity, so
  the shot swept in across the canopy instead of running down the nose.
  They now leave the **guns the model actually has**: `glb2hulls` records
  every `laserEmitter` node, so the courier's beams come off its chin guns,
  81 cm under the axis and at the nose — beneath the console, where you can
  see them from the seat. 33 of the 39 models carry real muzzles; the six
  that do not (capitals and escape pods) fall back to an offset derived
  from the hull.

- **And they stayed where they were fired.** A beam is now resolved live at
  both ends — muzzle from the ship's current attitude, far end from the
  target or from the current nose — so it no longer detaches at 5.5 km/s,
  nor pivots about its muzzle into the fan of stale rays that time
  compression turned it into.

- **The guns do not fire under time compression.** Cooldowns run on sim
  time, so at 500x every weapon cycled every frame: sixty shots a second,
  a hull cooked instantly, and nothing aimable, since the cone test was
  running against targets that jump hundreds of kilometres between frames.
  The refusal says so rather than quietly doing something absurd.

- **Beams are visible again from outside.** A 22 km beam with the camera
  120,000 km out was a third of a pixel, which is why the guns appeared not
  to work in the exterior view at all. The drawn length is floored, and the
  tracer is now a bright core inside a wider bloom instead of a hairline.

- **The mouse works outside the cockpit.** Mouse 2 fires group B and the
  side button launches in any view; mouse 1 stays the camera out there,
  because swinging the view around the ship is what the exterior view is
  for. Releasing the side button no longer cut the primary trigger.

- **Your ship came back from a save lying on its side.** ⚠️ *Fix written but
  not yet run.* Docking at an orbital station built the ship's attitude from
  an arbitrary perpendicular to its nose, so the bank angle it ended up at was
  whatever the arithmetic happened to produce. On its own nobody would notice
  — but loading a career re-docks the ship, and the game restores the autosave
  when it starts, and saves are almost always made on the clamps. So the
  ordinary path was: quit docked, come back, and find yourself banked ninety
  degrees with the attitude ladder reading it, before touching anything. A
  berthed ship is now level, with its gear toward whatever it is orbiting.

  The spawn attitude itself was never wrong — measured across five seeds it is
  exactly level, and the slow pitch drift afterwards is the orbital rate,
  which is correct for a hull with nothing holding its attitude.

- **A ship torn out of slipspace was always empty.** It flies an interstellar
  lane that no system's traffic list has ever heard of, so it inherited no
  manifest and reported itself running empty however many times you asked.
  The chase, the lock and the drop-out all worked and paid off in an empty
  room; they now pay off in a freighter's hold.

### Saves

**Cruise drives (2026-10-19) need no version bump.** The drive bay is a
new slot type keyed after every existing one (`drive0`, `drive1`), so no
saved fit key moves. A save without a drive is given a Class 1 on load
(`migrateFit`).

**Twilight worlds (2026-10-19) need no version bump.** Systems are
regenerated from the seed and every existing body keeps its id, so a
docked or targeted id still resolves. What does move:
- Every tidally locked world's day and pole changed, so pads on those
  worlds now stand somewhere else at a given moment.
- Pads on ring and band worlds were folded into their strip.

A ship saved docked or landed at one of those pads is put back on the pad
wherever it now is. A ship saved in free flight low over one could find
the ground in a different place.

**Nothing from 2026-10-17 touches a save.** The cruise sky and its trails
are pure functions of speed, heading and the seeded sky; the trail history
is never stored. The lift car and hatch data were added to the port index
as two new fields (`cars`, `parts`) and nothing else in it changed — proved
by diffing a fresh conversion against the shipped index, since the
converter on disk has drifted from the shipped data (a full re-run would
also rewrite 69 models' interior routes; that is a separate decision).
A ship already parked in a ring's small bay leaves by the new route.

**Runners change only a flag.** An existing career's systems keep every
port, route, manifest and price; some routes in lawful space now report the
Syndicate as their flag. Nothing to migrate.

**Ship-to-ship trade adds one field, `shipTrade`** — the per-voyage ledger
and the day's standing tally. An older save has none and starts with an
empty one. Rivalries are not saved at all: they are a pure function of the
galaxy seed, so an existing career gets its galaxy's quarrels on load.

**Existing careers load, with their gear.** The save version is
deliberately *not* bumped: `readSlot` and `load` discard any payload whose
version does not match exactly, so a bump would not migrate old saves, it
would delete them. The change is additive — a `fit` map and a `groups` map
are written alongside the four legacy weapon fields, and
`Combat.migrateFit` rebuilds a fit from those fields when `fit` is absent.

A save written before fire groups existed has no `groups`, and a missing
entry reads as group A — so an old career comes back firing everything on
the primary trigger, which is exactly what it was doing before the update.

A migrated ship keeps everything it owned even if the new budgets would not
strictly allow it. Confiscating something a player already paid for because
the rules changed underneath them is the worst possible introduction to a
new system.

**A slipspace module bought before this update still works.** They used to
live on a bespoke `ship.modules` field rather than in the fit map; that field
is still read as a fallback, so an anchor already aboard keeps holding your
corridor. New ones are bought and stored as ordinary equipment.

**A career that predates the cargo scoop keeps one.** `migrateFit` issues
it to any ship that has never had a fit map, which is every save old enough
to predate slots and every new ship. A save that already carries a fit map
is left alone and buys one at the yard — and that asymmetry is deliberate,
because it is also what makes SELLING the scoop stick: it lives in the fit
map like every other fitting, and the fit map is what is saved.

**The GUNS page and the spent heat sink cost a save nothing.** Neither the
canister list nor which page a cockpit panel is showing has ever been
written to a save, so there is nothing new in the file and nothing to
migrate. An old career simply gains a page it can click a panel round to,
and starts leaving blocks behind it the next time a sink ejects.

**Nor does the landing gear.** `ship.gear` — the switch, which is what
every rule reads and what is saved — has not changed meaning. The new
`gearTravel` is where the legs have physically got to, it is not written to
the file, and on load it initialises to wherever the switch already is: a
career saved on a pad comes back standing on its gear, one saved in flight
comes back clean, and neither sees the mechanism move.

**Contracts already in flight are untouched.** A signed mission keeps the
headline and the destination it was signed with — the new generator runs
when a board is built, not when a contract is read, so nothing you already
agreed to changes wording underneath you. The only visible difference is
that a contract signed before the long form existed has no `desc` and
therefore shows no DETAILS button; the next one you take will have both.

**The docked start only applies to new careers.** It runs on the fresh-game
path, so loading an existing save puts you back exactly where you left off,
in flight or on a pad as you were. The levelled berthing attitude is
computed at docking rather than stored, so an old save that was written
while parked crooked comes back level.

**Wreckage is not saved, on purpose.** A debris field lives ninety seconds
and vanishes when you leave the area. Serialising one would mean loading into
somebody else's explosion.

**Shields need no migration.** An NPC's is assigned the first time something
shoots at it, exactly as its hull points already were, so nothing about a
saved career has to know they exist. Your own shield is the module you already
bought; what is new is only what it looks like when it works.

- **`glb2hulls.js` now splits cockpit interiors out of the hull.** The
  redesigned ship models carry `cockpitInterior` / `pilotSeat` /
  `pilotSeatBack` inside the same `.glb` as the exterior, and the old tool
  merged every node into one mesh — welding a chair inside the fuselage,
  invisible from outside and unusable as a cockpit. Geometry is now sorted
  into `v/f` (exterior) and `interior` by node name, with the canopy's
  bounding box emitted as `glass` so a seat view can mount against it.

  Both parts are normalised by **one transform measured on the exterior**.
  Normalising each independently would scale a two-metre chair to the
  length of the ship; this way the hull's unit length is also unchanged
  from before the split, so nothing tuned against the old scale moves.

  The tool now reports interior triangle counts per model and names any
  model that arrives without one.

- **All ship models replaced with the redesigned set.** 33 models, 11 types
  × 3 sizes: capital, courier, **escape_pod** (new), fighter, freighter,
  h2_freighter, liner, police, shuttle, trader, tug. Every one carries a
  cockpit interior (60–96 triangles) and a canopy box. `hulls.js` grew from
  4.5 MB to 5.7 MB.

  The previous 30 models are preserved in `ref/glb-superseded/pre-redesign/`,
  and the six older revisions that shipped alongside the new set (capital
  `(2)`, courier `(1)` — the two without interiors) in
  `ref/glb-superseded/`. The old `hulls.js` is kept as `src/hulls.js.prev`.
  `readdirSync` is not recursive, so the superseded folders are excluded
  from conversion automatically.

- **Two new ship classes: naval interceptor and rescue tender.** 39 models
  now, all six new ones carrying cockpit interiors and canopy boxes.

  **Navy flies `navy-m` instead of `capital-m`.** That was a real
  mismatch, not a cosmetic one: a navy that only fields capital hulls
  cannot be *dispatched*, and dispatched hunters are what the notoriety
  work needs. The capital hull is now free for what it is for.

  **Rescue tenders** run a short local loop in any system developed enough
  to keep a crew standing by — 23 of 25 sampled systems have one. Unarmed
  by design, like the shuttle, but for the opposite reason: what protects
  a tender is that shooting one costs **14,000 cr**, more than killing a
  patrol cutter. A cutter came looking for you; the tender was on its way
  to help somebody.

  The rescue *mechanic* is not built. The ship is in the sky first on
  purpose — being able to see the service is half of knowing you can call
  it.

- **Merchantmen shoot back. Only shuttles fly unarmed.** `updateNpcFire`
  used to skip every trader outright — *"freighters carry no guns"* — so
  robbing one was a chore rather than a decision. Now everything is armed
  except shuttles.

  Deliberately feeble: a trader's gun does 2 damage at 8 km against a
  warship's 5 at 12 km. It is not meant to win, only to make a robbery
  cost hull and time so the mercenary escort is still worth hiring and a
  pirate still prefers the soft target. **The real defence is the clock**
  — a merchantman calls for help in 5 seconds where an armed ship takes
  10, which leans on the witness system rather than on damage.

  A hit freighter now sets `defending` rather than `hostileToPlayer`: it
  fires while it runs, and it still runs.

  The shuttle staying unarmed is a role, not a weakness — it is the hull
  nobody scans twice, which is what you want when the cargo is a sabotage
  device.

- **A hull-budget rule, now enforced by test:** a reactor must run every
  core system the hull has room for and still light the cheapest gun.
  **The audit found the rule already held**, and was a useful surprise —
  the Dart looked like the failing case (shield + heat shield + turret is
  5.4 MW of its 7.0, and a gun needs 1.8) but it cannot carry all three
  anyway: those three weigh 10 t against its 9 t budget, so **mass binds
  before power** and the lockout is unreachable. No numbers changed. The
  test is the deliverable — the rule is enforced now rather than believed.

- **Weapons retiered by particle, with range falloff.** Following
  `PLAN.md`, a laser's tier is now what it
  fires rather than how big its emitter is, and the particle decides how
  damage behaves with distance:

  | Tier | Falloff | Character |
  |---|---|---|
  | **Photon** | none | massless, does not decay — longest reach, least damage, universal |
  | **Pion / kaon** | 0.85 | ~26 ns lifetime, loses coherence fast — brutal close, near-useless far |
  | **Muon** | 0.25 | ~2.2 µs, time dilation carries it — holds damage at range |

  Measured at the extremes: a photon pulse delivers 5.0 at 2 km and 5.0 at
  22 km; a pion pulse 19.5 at 1 km and **3.0** at its own maximum; a muon
  pulse 23.8 close and 18.0 at 34 km. Range stops being a cutoff and
  becomes a curve.

  The 3 × 3 shape, the shield interaction (pulse ×0.6, beam ×1.5) and the
  power budget all survive — only what a tier *means* changed.

  **Every old id still resolves.** `c1pulse` … `c3beam`, plus the original
  `pulse` and `beam`, are aliases. This mattered more than it looked: they
  had to be added to `EQUIPMENT`, not just `GUNS`, because a save stores
  ids *in slots* and a lookup that missed one would have silently dropped
  the player's gun on load. Fits now normalise to the canonical id the
  first time they are touched.

- **A port sells only what it makes. It buys anything.** The market is
  asymmetric now, which is what turns a trade route into a route rather
  than a price lookup — you cannot buy computers at a farming co-op just
  because there are some in the warehouse, since that stock is what the
  colony eats, not merchandise. Supply is a fact about a place; demand is
  a fact about a need.

  Measured before committing to it: 53% of rows are exporters, an average
  port sells 6.8 of the 12.8 goods it lists, and **no port in any sampled
  system is left with nothing to sell**. A refusal names the reason —
  *"Waypoint Dock consumes grain, it does not export it — they will buy
  yours"* — rather than greying a row out.

  **Fuel is the deliberate exception.** Only 20% of ports produce
  hydrogen while every port stocks and burns it, so a strict rule would
  leave four ports in five unable to sell fuel and strand anyone who did
  not plan two jumps ahead. A port that imports fuel and resells it is
  what a fuel depot *is*.

- **Hydrogen is priced by the haul.** Its structural price now scales with
  the port's distance from the nearest gas or ice giant — 5.5% per AU,
  capped at +85%, with a flat +95% in a system that has no giant to skim
  at all. Distance is orbital radius about the star, not a distance at an
  instant, because a structural factor must not depend on `t`.

  | Port role | avg fuel price |
  |---|---|
  | Refinery (at a giant) | **42** |
  | Mining head | 91 |
  | Orbital port | 101 |
  | Highport | 137 |

  6.5× between the cheapest and dearest port across 25 seeds. The good
  part fell out rather than being designed: a rich mining world far from
  any giant charges more for its ores *and* pays more for its fuel, so its
  real margin can be worse than a poorer world sitting beside a refinery.
  "Expensive wares" and "profitable to work" stop being the same
  statement.

- **Mission board: a headline and a long form.** `text` is what the job is
  — terse, factual, hard-capped at 240 characters so a board stays
  scannable however baroque later mission types get. `desc` is who is
  asking and why, behind a DETAILS button on the F7 board, word-wrapped in
  place. Both are carried onto the accepted contract, so a job signed a
  week ago still explains itself.

  The long form is assembled from a pool of fragments joined by rules, and
  there is one rule that keeps it honest: **the grammar may only combine
  fragments that describe state the mission actually has.** Every slot is
  either a real value off the offer or connective tissue true of every
  mission of that type, so the worst case is a sentence that reads oddly —
  a sentence describing a job the player cannot do is structurally
  impossible. There is a test that every long form names the real
  destination and the real fee.

  Fragments are drawn from the offer's **own** seeded stream, never the
  board's, so a board reads the same when you come back to it and offer
  generation loses not a single draw to prose.

  Applied in one place at the end of `boardAt`, so a mission type added
  later cannot ship without both fields.

- **The settlement chain — one knob for how rural or developed the galaxy
  feels.** Drake's equation with the biology thrown away: Drake's terms are
  about life arising and becoming intelligent, and this galaxy has no
  aliens in it, so the filter is economic rather than biological. What is
  worth stealing is the *shape* — a named chain of factors, each arguable
  separately, multiplying out to a headline number.

  ```
  worlds settled = systems × nHab × fSettled × fGrown × fHub
  ```

  Every term was already being computed somewhere in `economy.js` or
  `generate.js`; naming them means you can see why a galaxy came out as it
  did, and there is one place to turn when it should feel different.
  `Eco.setPressure(p)`, 0.25 to 3.0, and `Eco.galaxyProfile(Gen, seeds)`
  reads the chain back off real systems.

  | pressure | ports/system | mean development | hubs/system |
  |---|---|---|---|
  | 0.35 | 11.3 | 0.40 | 0.35 |
  | 1.0 *(default)* | 12.3 | 0.52 | 2.2 |
  | 2.5 | 14.2 | 0.61 | 4.3 |

  Hubs swing **12×**, which is where the rural-versus-core feeling lives —
  a frontier galaxy has one highport per three systems, a settled one has
  four per system.

  **Pressure 1.0 is byte-identical to the generator before the knob
  existed**, and there is a test that fails if that ever stops being true.
  It works by biasing a roll (`u^(1/p)`) rather than moving bounds, so at
  p = 1 the exponent is 1 and the same single draw produces the same
  number in the same order. Pressure also deliberately cannot move a
  planet or invent a habitable world — the astronomy is `generate.js`'s
  business — and that is tested too.

- **More planets, and a wider habitable zone.** This changes every system
  in the galaxy. Saves store a seed and regenerate the world, so a career
  keeps its ship, money and record but wakes up somewhere with a different
  set of planets — nothing corrupts, the map simply is not the map it was.

  **Harmless here: no save files existed yet.** Noting it because it stops
  being harmless the moment one does. Any later change to `generate.js`
  needs this heading filled in honestly, which is why the heading exists.

  Three changes, all measured across 40 seeds:

  | | before | after |
  |---|---|---|
  | Planets per system | 4–9 | 6–12 (avg 8.9) |
  | Habitable zone | 0.95–1.67 √L | 0.75–1.77 √L |
  | Orbit spacing | ×1.42–2.05 | ×1.30–1.75 |
  | Habitable worlds/system | rarely >1 | avg 1.27; **2+ in 20/40** |
  | Ports on habitable worlds | 20% | 36% |

  The habitable zone was the binding constraint, and for a geometric
  reason rather than a tuning one: at 0.95–1.67 it spanned a ratio of
  1.76, while orbits stepped by 1.42–2.05 each. **The zone was barely one
  orbital slot wide** — most systems dropped nothing into it and none
  could ever hold two. The new bounds are the optimistic
  (recent-Venus / early-Mars) limits, which is a real pair out of the
  exoplanet literature, and they span 2.36.

  The spacing floor also turned out to be over-cautious. Its comment
  claimed 1.42 was needed for orbits not to cross, but the actual
  constraint at this generator's 0.09 eccentricity cap is
  1.09/0.91 = **1.198**. 1.30 keeps a real margin and fits more worlds in
  the zone.

- **Two of the three unassigned hulls now have roles.**

  **Liner** — a new traffic class. Takes over a light interplanetary run
  that touches a settled world, carrying whatever the manifest says, so
  what you see changes without a single price moving. 11 liner routes
  across 15 test systems, in 4 of them.

  **Navy** — a new patrol class flying the capital hull. Slow (0.006 vs a
  police interceptor's 0.021): it does not chase, it arrives, and anything
  that wants to run from one can. 260 hull points, counts as a deterrent
  against piracy the way police do, refuses to be robbed, and killing one
  is a 12,000 cr charge. Fielded only where a faction has the industry and
  the order to justify it — 1 system in 15.

  Thresholds were measured rather than guessed: `sys.development` runs
  0.28–0.61 across seeds, so an initial 0.62 gate produced zero navies
  anywhere. Likewise a liner requiring *both* ends settled produced zero
  routes — only ~20% of ports sit on a habitable world, about two per
  system, and two different settled worlds in one system is rare. That run
  is an interstellar one, and this game's traffic is per-system.

  **`escape_pod-*` deliberately still has no role.** It is not a ship
  anyone flies anywhere — it is what is left when a ship dies, so it
  belongs with the debris work.

  **The tug's canopy is amidships, not at the nose** — glass at z 0.195
  where every other hull sits at 0.44–0.48. Correct for a pusher, and the
  reason the seat anchor is read from the glass box rather than assumed.

### Known issues

- Missiles are still the flat `ship.missiles` counter and have not moved
  into the slot system. Half a migration is worse than none; the rack
  becomes an internal module in the ordnance phase.

---

## Before this changelog

This file starts at alpha 5. The systems below were already built and
working when it was created — listed so the changelog has a floor, not
dated, because the alpha they each landed in is not recorded anywhere.
**Worth backfilling from memory if you want the history.**

- Seeded galaxy and system generation; the same seed gives the same
  universe every time.
- N-body flight with Kepler rails, time warp, orbital and ship reference
  frames, node planning.
- Atmospheres: drag, re-entry heating, the ablative heat shield.
- Landing, docking, docking clearance and fugitive status.
- Economy, markets, contraband, reactor waste and illegal dumping.
- Missions, faction standing, faction campaign arcs.
- Combat: guns, auto-turret, homing seekers, shields, and the
  witness-based bounty system.
- Slipspace corridor: lanes, wakes, interdiction, deep-space drop-out.
- The cockpit: console MFDs, aft view, pause menu, six save slots plus a
  per-seed autosave.
- WebGL world layer, planet impostors, ship models.
- Electron desktop build for Windows and Linux.

---

## A note on version control

There is no git repository here. That is now the most expensive missing
piece in the project: it is why the render-test question above cannot be
answered, why this changelog has to start with a floor instead of a
history, and why every refactor from here carries risk that a `git diff`
would remove in a second.

`git init` plus a first commit costs about a minute and would pay for
itself the first time something breaks.
