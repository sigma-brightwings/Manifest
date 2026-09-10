# Changelog

Alpha revisions of Procedural Space Game. Newest first.

Each release gets: **Added** (new things you can do), **Changed** (things
that behave differently than they did), **Fixed** (things that were wrong),
and **Saves** (whether an existing career survives). That last heading is
not optional — a player who has flown a seed for a week deserves to know
before they update.

---

## Unreleased — alpha 5 (in progress)

Outfitting, weapons, and the law. See `PLAN.md` for the
full design and the phases still outstanding.

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
