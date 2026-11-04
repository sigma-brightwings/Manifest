# Changelog

## What Manifest is

Manifest is a procedural space sim built from the ground up, literally:
gravity first, then the planets that make it, then everything that flies
between them. One seed always grows the same galaxy (`kawartha`,
`beaverton`, `driftwood`, `manifest` ...), so a star system you flew last
month is the same system today, down to where each port sits and what its
warehouses hold on a given date. Time is part of the seed too: traffic,
markets and orbits are functions of the clock, so skipping six months gives
the answer flying them would have.

You fly a ship under real Newtonian flight and Kepler orbits: no rails for
the player, a cockpit with an attitude ladder, MFD pages and a ship screen
with guarded switches where a switch should be guarded. Around that sits a
working economy (ports sell what they make and buy anything, and prices are
stock), factions and their law, the Syndicate and its runners, rescue
services, crew and a fleet, industry you can buy into, and a mining ladder
climbed one rung at a time: survey, claim, cut, and eventually your own
skimmers and stations. It is a desktop game (Electron), developed and tested
on a modest machine (Syndicate Crawler, an RX 540) so it has to run on one.

Releases have a number and a pigeon's name. Everything that changes the
game is entered below with its date, under **Unreleased** until it ships;
when changes are grouped into a release commit, the section takes the
version number.

---

Revisions of Manifest (once Procedural Space Game). Newest first.

Each release gets: **Added** (new things you can do), **Changed** (things
that behave differently than they did), **Fixed** (things that were wrong),
and **Saves** (whether an existing career survives). That last heading is
not optional — a player who has flown a seed for a week deserves to know
before they update.

---

## Unreleased

### Fixed (2026-11-03, the open UI items: labels that overprinted, a lent bay that was forgotten, a hull on her tail, the sea's glint and domes)

Astra: "let's do all the still open stuff." Each of these was seen in a
screenshot, and each was looked at again after the fix at 800 × 600 and
1280 × 720/800.

- **Halloway's lesson strip leaves the page's name showing.** On a full-screen
  page the strip started 170 px in, which covered any title longer than
  COMMS. On F6 you could read only "GALAXY MAP & COU". Each page now records
  where its title ends (`screens.js` `modeFrame`), and the strip starts after
  that.
- **The galaxy chart's two always-shown names pick a clear side.** At the
  whole-galaxy zoom, "Mirven" and "Rhoameor" are always named, and they used
  to take the first spot that did not touch another name, whatever stars lay
  under it. Now they try sixteen directions at five distances and take the
  spot with the fewest star dots and territory border under it. The two are
  placed together, so one cannot take the only clear spot the other had (on
  kawartha they are 4 px apart). A name placed further out gets a thin line
  back to its star.
- **On foot, labels stay off the room title and the "E — use" prompt.** At the
  trade terminal, looking down, the terminal's label (set 2.4 m up) landed on
  the room title. A label that would hit either one now moves clear instead
  of vanishing (`walk.js` `labelClear`). The room title also has its own dark
  plate now. It used to be pale cyan text on whatever was behind it, and on
  the concourse's yellow sign it could not be read. Walk labels have a dark
  outline too.
- **In the cockpit, planet names stay off the readouts.** A planet just below
  the nose printed its name across PITCH / ROLL / REF. `Render.hudReadoutBoxes`
  gives the areas used by the heading tape, speed and altitude boxes, the
  attitude line, the facing cue and the key-hint line. These are worked out
  from the same numbers the HUD itself uses, and a test checks that every
  readout falls inside them. A label that would land on one moves above or
  below it.
- **The intercept pip's label keeps off the readouts too, and the locked
  target is named once.** With the pip just under the nose, "PIP 17.0 min"
  and its drive line printed through PITCH / ROLL. Both lines now move
  together, up or down, using the same boxes (`labelOffReadouts`'s new
  `extra`, the height of the second line). The nav lock and the docking
  target were named twice: once by their box on the glass, with the range,
  and again by the world's own label a few pixels away. In the cockpit the
  box's label is now the only one (`holoNames`).
- **Ships' names in a crowded berth stack instead of overprinting.** A ground
  port's pit with three ships berthed in it printed three names on one spot
  (Terminus Downport, Cydoren). Ship names are now placed like planet names
  (`Render.stackLabels`): they keep off the names already drawn, try the rows
  just above and below, and a name with no room left adds "+1" to the name it
  lost to.
- **A ship saved in a lent heavy bay reloads in it.** `ship.lentBay` (set when
  every small berth was full and the port lent you its heavy bay) was not
  saved. On reload `assignBerth` treated you as a normal arrival and parked
  you in a small berth your hull does not fit. It is now saved and restored
  before the ship is docked.
- **No hull stands on her tail at a sea rig.** Heavies (`outboard`: they lie
  off with lighters working them) never get a pad, and a boat based at a port
  has no route. At a sea platform both fell through to the open-pad pose:
  nose up, in the middle of the rig. That is where the "Ironwake Packet" was
  seen. They now hold off the rig, level, as a ship turned away from a full
  deck does. The holding pose also carries its level heading (`rest`), so a
  ship arriving to hold no longer tips nose-up for its last few hundred
  metres. Over 71 kawartha systems this was 70,473 of 2.27 million samples
  near a rig. Now it is none.
- **The sun's glint on the sea is easy to see.** Gain 2.2 → 4.5 in `gl.js`
  `seaShade`, chosen after trying 2.2, 3.5, 4.5, 6 and 9. At 2.2 the
  brightest point of the sun's reflection never got near its 0.85 cap (0.58
  for a low sun, 0.33 for a high one). At 4.5 it reaches the cap under a low
  or middling sun and 0.67 under a high one. At 9 the distant glint looked
  like a second sun. The cap is unchanged, so the glint still cannot blow
  out.
- **The tube's windows show rings and lightning.** Rings, tears and lightning
  bolts are drawn in passes after the mesh pass, and the windowed room clears
  depth before it draws the deck. So those passes were hidden behind the deck
  and the panes. They are now drawn at the depth clear, before the room.
- **Dome crowns keep their shape under a high sun.** A plate facing straight
  up gets the sun's full strength plus the light from the whole sky, so the
  crowns were the palest part: 161 of 255 against the shoulder's 154 at
  Linis's Low Strip with the sun 72° up. The petal rows are now toned from
  0.80 at the crown to the plate's own grey at the foot. The crown now reads
  128 against 140, darker than the shoulder.

Not fixed: the **torn strip at the top of Terminus Downport's pit** did not
show up. I looked at six Terminus Downports in kawartha from above, from the
pit's rim, at a grazing angle and from inside the berth, with the cutaway on
and off. All I saw was the cut's intended scorched edge. A screenshot of the
tear, or the seed, port and camera, would let it be found.

**Saves:** survive, version unchanged. One optional field was added:
`ship.lentBay`, a port id or null. A save from before it loads as "not lent",
which is what it was.

### Changed (2026-11-03, the pip takes the faster drive)

Astra found the pip saying "thrusters, too close for the drive, 17 min" at
2,900 km off Threshold Dock. The cruise drive does that trip in under a minute,
even at its 60 km/s floor. The cause was a 5,000 km threshold, auto-dock's
`AUTO_CRUISE_MIN`, which decided the drive by distance alone. She chose: "let
the pip work out both and take whichever is faster."

- **Both drives are solved, and the faster one is kept** (`Intercept.solve`).
  When the drive is allowed, cruise is solved first, then thrusters. The
  thruster solve gives up once it has taken ten times the cruise time, so a
  long crossing no longer pays for a thruster solve it would throw away.
- **The readout says what it chose and what the other drive would take**:
  `cruise  (thrusters over 6.0 min)`, or `thrusters · faster than cruise
  (cruise 2.1 min)`. *too close for the drive* now appears only under the
  floor (below).
- **The intercept assist flies the drive the pip chose.**
- **The cruise time now includes the drop-out miss.** The drive is dropped on
  the frame the gap falls under one step at its floor speed. Measured from
  2,900 km at 20 fps, that left the ship 5.7 km short and added 38 s of
  thrusters to a 53 s trip. Without the miss in the model, cruise came out
  faster than thrusters at any range.
- **A measured floor of 18 km.** That is twice the worst drop-out miss: one
  step at 60 km/s with 10 fps frames, times the 1.5 safety factor. It is
  raised further for a target the drive has to outrun. The modelled
  crossover was 1.1 times the miss in every case: 1.6–1.9 km at 60 fps, and
  9.3–10 km at 10 fps, for thrust from 0.002 to 0.019 km/s².
- **Auto-dock keeps its 5,000 km rule, deliberately.** From the same 2,900 km
  it reaches its berth phase in 27 s of wall clock, against the assist's 22 s.
  It flies on thrusters but winds the clock up to 500×, so the player waits
  about as long either way. Its long leg hands over at its lead point and
  hails the port. Rewiring that tested approach for 5 s is not worth it.

**Saves:** unaffected.

### Added (2026-11-03, trading houses: a factor on the concourse, an account for your ships, judged by the quarter)

Astra: "Is there a way for me to tell my fleet to go buy low and sell high on
commodities X, Y, Z etc, and actually give the ship a budget, if it increases
the budget, the captain stays on. NPCs would need a mercantile skill?" Then:
"we can add another NPC type, they're kinda like the fixer, but civilian, and
their job is a combination of economist and import/export company"; for other
systems, "both"; and "Trading firms measure their traders by the quarter year."

- **A trading house at bigger civilian ports** (`src/tradingfirm.js`). Its
  **factor** stands beside the trade terminal on the concourse (a new `factor`
  role, a civilian in a suit, with its own portrait leanings). Whether a port
  has a house, and what the house is, is a pure function of the system's seed
  and the port, on its own hash, so no other draw moves. More likely where the
  port is developed, its lanes busy and the law clean; never at a Navy or
  Syndicate port, a plant, a milfuel works or a carrier. **Measured over 30
  seeds × the 6 nearest claimed stars (2,690 ports): 1.34 houses a system, at
  12.5% of civilian ports; 64% of systems have at least one.**
- **The house's mercantile skill is its rating, 1–5** (measured 14 / 27 / 22 /
  24 / 12%). It decides how good the house's information is:
  - **1–3 read boards**: the other ports' prices as they were 5, 3 or 1.5 days
    ago (plus a corridor's age for another system, the trade analyser's own
    `reportAgeDays`), with a clerk's error of 10, 7 or 4.5%. From 3 the house
    prices its own size against the shelf (a 40 t lot moves a price).
  - **4–5 read forecasts**: the market at the hour the hull will arrive (4
    halfway there), and they see **your own fleet's footprint** in a market,
    so two of your hulls do not both pile into one glut. Lower houses see a
    quarter or half of it, or none.
  - Better houses get a better price at the desk (up to 1.6%), run more hulls
    (1–5), charge more commission (8, 10, 13, 17, 22% of a quarter's profit,
    a seeded half-point either way) and set a floor: **a first-rank house
    will not open an account under 50,000** ("Not worth our time under
    50,000."), a serious one under 20,000, a sound one under 5,000.
- **The economist: a paid market reading** (120–900 cr by rating). For the
  goods in your hold, or the port's exports if it is empty: which are rising
  over the next three days and where (this system and the nearest others),
  with a confidence that is the house's rating, less distance.
- **Import/export: an account.** At the desk, a deal sheet: a budget (5,000 to
  1,000,000, clicking past the house's floor and your purse), any of your
  ships in this system with a pilot aboard, and a goods list (or the house's
  choice of anything honest). **The budget becomes the account**, separate from
  your credits: every buy, sale and tank of jump hydrogen the house makes comes
  out of and goes into it. A bad house can lose its budget, never more. Profit
  stays in the account, so the budget grows; you withdraw the profit, deposit
  more, hand over another hull or close the account at the house's office.
- **The runs are a timetable**, booked closed-form like every other ship of
  yours under orders: she sits at a port until a decision instant, buys,
  casts off after a turn at the clamp (12 h between two ports of one world,
  1.5 days across the system, 2 days before a jump — the lanes' own layovers),
  and sells the instant she arrives. In-system legs are drawn and heard as
  your traffic. **Between stars** the leg is clearance, `Galaxy.jumpSeconds` at
  her laden mass, and a cruise in from the drop; the hydrogen is bought out of
  the account. Houses trade into the 1–4 nearest claimed stars by rating.
  Nothing to carry: she runs empty to a better port in the system, or waits a
  day. Every house remembers a losing run and keeps that good off that port
  for a week.
- **Every quarter (91 days)** the account's equity — cash, plus what the loads
  aboard cost — is put against where the quarter began, less what you moved in
  or out. **A profit renews it, and the house takes its commission. Anything
  else ends it**: you drop them, or a first-rank house with a small account
  drops you. Hulls on a run finish it and stand down; the balance is remitted to
  your credits when the last is home. Said, and written in the journal.
- **Booking is exact and idempotent.** All runs of all houses go through one
  queue in time order: one call or sixty, this hull first or that, the
  accounts come out the same to the credit, and booking twice books nothing.
  The house prices off the market's closed form plus **its own footprint**,
  which it keeps and which is saved, so a reload trades exactly as no reload
  would have; its trades also dent the real market, so you see them at the
  counter.
- **The FLEET tab's "1-11 of 13"** no longer sits under the FITTING button: it
  goes on the budget bar when there is room before the tabs, and at the foot of
  the list, right-aligned, when there is not.
- **F5 → FLEET** shows each account (worth, this quarter, the review, last
  quarter's verdict and commission, cash) and each traded hull (her run, ETA,
  her runs and what she has made the account). Her hail reports the run.
- **Refusals in words** everywhere: no house here; no ships; the book is full;
  no budget; under the floor; you cannot cover it; nobody aboard can helm her;
  she is in another system; under way; working a site; held by the harbour; a
  partner's ship; cargo aboard; a contraband good; an account already open; a
  hull already trading; withdrawals only at the office; more than the cash;
  under the floor while open; a deposit you cannot cover. A traded hull cannot
  be ordered, set to work or taken command of until she stands down.
- **Running costs, out of the account** (Astra: "costs + market depth"). The
  crew's wages by the day (`Crew.dailyWage`; the payroll at your desk stops
  charging you for a hull from the hour she is handed over, and starts again
  when she stands down); **a berth at every stop**, the fleet's own weekly fee
  by the day at the clamp, a day at least (the old exemption is gone);
  **insurance**, 0.08% of the hull's list price a day out of port and 2% of the
  load per run; and the jump hydrogen as before. Reaction mass is not charged,
  because nothing in the game charges for it. What the account cannot cover is
  owed, taken from the next sale and counted off the equity; **an account with
  nothing left closes** ("the account is empty"), so a house can still lose its
  budget and never more.
- **Market depth, for the house only.** Your trades at the counter are exactly
  as they were. The house's own book carries its lots **4x as deep per tonne**
  as yours and remembers them **16 days** against the market's 4. Both were
  measured on the same seeds (`tools/measure-firms.cjs depth`, `sweep`):
  - the slower memory makes a lane flatten: a run repeating a lane inside a
    fortnight made 0.65x a fresh one (0.93x at 4 days), so the house rotates —
    but on its own it barely moved a quarter (rating 4: 2.85M → 2.50M);
  - the deeper dent is what cuts the quarter (rating 5: 2.16M, 1.51M, 1.30M at
    x2, x3, x4), and it is where information shows: a house that prices its own
    size against the shelf (rating 3 up) buys what the shelf will bear, one that
    reads the top of the book (1 and 2) overbuys. With both, rating 1 loses in
    about two quarters in three (62% and 69% in two samples) and rating 2 in
    9–12%; with the dent alone (4 days) rating 1 lost in only 6%.
- **An idle quarter is a warning, not the sack** (Astra: "warning only"). A
  quarter with no run sold is said and journalled as a WARNING, no commission,
  and the account carries on; only a quarter that lost money on its runs ends
  it. **A second idle quarter in a row closes the account**: the markets cycle
  over weeks, so one dead quarter can be bad luck on a narrow list, two is the
  list or the house, and the account has paid her wages and berths throughout.
  Measured on a one-cheap-good list, 72–78% of quarters are idle at every
  rating: a list that is idle once is idle again.
- **The numbers now** (`tools/measure-firms.cjs quarters 20 2`, each quarter a
  fresh 50,000 cr account, a Talon, a rating-3 pilot, the house's choice of
  goods; 32 quarters per line):

  | | median quarter | p10 / p90 | quarters losing money on real runs |
  |---|---|---|---|
  | hand-flown Talon (baseline) | 19.9M | 15.9M / 25.7M | 0% |
  | rating 1 | −24k | −42k / +20k | 69% |
  | rating 2 | +82k | +11k / +263k | 9% |
  | rating 3 | +1.04M | 0.84M / 1.26M | 0% |
  | rating 4 | +1.24M | 0.98M / 1.49M | 0% |
  | rating 5 | +1.36M | 1.06M / 1.56M | 0% |

  **The baseline** is the same decision rule handed what a captain flying her
  own Talon has (the analyser's prices now, the counter's own price, her own
  footprint on the market's 4 days, the cruise drive's pace — 20x a hired
  pilot's timetable — and an hour or two at each clamp, no wages to a house,
  no commission), **flown end to end for the whole quarter: 623 runs, about 32k
  each.** It is a ceiling, not what a player at the keys makes; a good house's
  quarter is about 0.07x of it, roughly 40 hand-flown runs. Read against a
  part-time player rather than that ceiling, a good house is a few days of
  your own trading a quarter, on a hull you are not flying.
  Cut to one cheap good, every rating idles in 72–78% of quarters and runs
  at about −26k (the running costs); the hand-flown baseline on one good makes
  a median of 4.4k.

**Saves:** survive. One additive field, `firms` (the accounts and the houses'
footprint), absent in an older career; a traded hull's run state rides on its
fleet record (`trade`), which is saved whole already. No version bump.

### Fixed (2026-11-03, station geometry, second pass: the cylinders' arms, flush bores, every lift deck to deck, routes ready before you arrive)

Astra, of the station reports still open: "let's do all the still open stuff".

- **The cylinders' arms are whole again, and the small bays ride them.** The
  converter trimmed each inclined bore where its own centreline first "saw"
  open space, to stop the cradle's hoist hanging out of its block. A
  cylinder's arm bore *is* the arm: it runs from the hub through open space to
  its pod, so it saw space a third of the way along. Arm C (to the arm bay)
  kept 3 faces of about 140 between the hub and its pod. The hub's hole for it
  opened straight onto space, the route-finder's grid flooded the whole hub as
  outside, and no cylinder bay could be routed through it. Every one of them
  was "joined by elevator" in a straight line through the structure: at Halden
  Dock that was the hull out through the hub's underside and across open space
  to the pod. Now every arm bore has walls along its whole run, and every
  cylinder bay's route rides its arm's car down the bore.
- **The bores end flush with what they meet.** Each end of an inclined bore is
  now cut on the plane of the surface its walls cross there (the pod roof, the
  deck, the block wall), not left square or cut by box. Halden Dock's arm A
  stood 0.053 radii (260 m) down through its pod's roof; the cradles' hoists
  stood 0.04 radii (about 190 m) proud of the deck at the top. 27 models
  re-converted (the cradles, cylinders and spines, all liveries).
- **Every lift runs deck to deck.** The skimmer's sort lift stopped 18 m (at
  skimmer-m) under the sort hall's roof, and the spine's hub lift stopped 0.09
  radii under the hub's crown. Both stood a car's thickness proud of the floor
  they start on. Each car's run is now refitted to the decks beside its shaft,
  measured and not assumed. The car sits in its floor, its run ends flush with
  the top of the deck above, both decks are cut round the shaft (they were
  single wall-to-wall plates, which the old cut kept whole), the lower end is
  capped at the car's underside, and a hatch with caution bands closes the
  upper deck's aperture while the car is away. The ring's lift, which the art
  already fits, is unchanged.
- **Transfers go round the other bays' blast doors.** A route through a third
  bay's hall was found straight through its shut inner gate (cradle-s, once
  its hoist bore was whole). The route search now treats every bay's blast
  doors as shut except the two the transfer runs between.
- **No stall the first time you are routed to a berth.** Finding a berth's
  route through a station took 0.1 to 1.1 s in one frame (measured in node;
  up to 4.4 s on a loaded machine; 10.7 s across one system's 58 berths). The
  first arrival at the berth paid it at the docking clamp. Now each system's
  station berths are routed after you arrive in it, 3 ms a frame, the port you
  have targeted first, into the same cache. The same goes for the station's
  collision index and each berth's deck. Measured over cut-sweep's stations:
  2,770 frames, 2,501 of them under 4 ms, 3 over 33 ms (garbage collection on
  a loaded box). Every route found this way is the one the cold search finds
  (58 of 58 compared). After that, the worst first ask for a berth's path is
  2 ms.
- **Each station size carves its own doorways.** The occupancy grid's door
  cuts were made once per model, at the radius of whichever port asked first.
  The cut's lead is capped in kilometres, so it is a different length in radii
  at each size. Each (model, radius) now has its own carved copy, and the
  shared grid is never written.

Measured with interiors.test.js's sweep at Waypoint Dock's radius: berths with
an inner leg through structure, 55 of 131 before, 52 now. No ring, refinery or
small or medium spine has one. What is left is listed in the test: the arm
bores' hub ends (the bore opens into the hub only through structure at the
fleet's width, so the boarding leg still clips the bore's mouth), the
skimmers' hoists, the yards' tracks, two spine-l berths and four cradle
berths.

Not done yet: the yards' tracks and carriages (Halden Yard's "left and right
elevators": flush ends, floor apertures and covers, heights, and the track
hatches still welded into the interior bucket); the yard-navy approaches and
the navy/Syndicate yards' upward-opening bays; the 40 berths standing off a
level floor (Halden Dock b0 and b1 among them); the cradle and yard-syn
arrivals that go indoors and back out; ground ports' own-gear stance.

**Saves:** survive. Only geometry, routes and caches changed. Nothing here is
stored: routes and stand heights are worked out from the model each session.

### Added (2026-11-03, the lead pip and the intercept assist)

Astra: "can we simplify the orbital mechanics controls for the player? Maybe
like when you have selected a target, a navigation pip shows up on the HUD, if
it's in orbit of a star, that pip should track ahead of the target so that your
ship will end up reaching the target when the target will also be intersecting
that point in space?" On the timing she chose drive-aware. On the flying: "I
want the autopilot to do most of the flying with the option to take the
controls myself."

- **The pip.** Lock anything and a pink ring shows where it will be when you
  get there. A dashed line runs to it from the target, along the target's
  motion. Under the ring are the time to intercept and the drive the estimate
  assumes: **cruise** when the drive is yours to use for the trip, otherwise
  **thrusters** and why not cruise (*mass locked by Mirven I*, *too close for
  the drive*). It merges into the target when the two are as good as the same
  point. Off the screen, an arrow on the edge points to it. It shows in the
  cockpit and in the exterior view.
- **How it is solved** (`src/intercept.js`, new). The intercept time T is solved
  so that the time to fly from here to where the target will be at t+T, arriving
  matched, equals T. It uses a fixed point and falls back to bisection. The
  flown-time model is the assist's own flight law:
  - on thrusters, the close-phase law auto-dock already flies, run forward;
  - on cruise, the closing law `steerAutoCruise` already flies, under the drive's
    lock ceiling read along the path, with the turn onto the heading and the
    detour round any world in the way.
  It re-solves four times a second. Between solves the pip holds still in space
  and the count runs down.
- **`I`: the intercept assist.** It is a mode of the existing autopilot
  (`G.autodock.mode = 'intercept'`), not a second one. It turns onto the pip,
  spins the cruise drive up, flies the leg, drops out at the target's velocity
  and makes the final match on thrusters. It parks at a standoff:
  - four capture radii off a station (`T` docks from there in one press);
  - 2 km off a ship;
  - over a ground port at the height its descent starts;
  - in a circular orbit about a world.
- **You can take over at any time.** Any stick or throttle input takes the
  controls, and the assist stands by instead of cancelling. The banner at the
  top says **AUTO** or **YOU**. `I` hands it back, and `Shift+I` stands it down.
  It does not take the ship back when you let go: in space, letting go is a
  choice too.
- **The match marker.** Near the end of any intercept, a yellow diamond shows
  which way to burn to match the target's velocity, with the burn in m/s.
- **Every refusal says why:** no lock, a lock that is not in this system,
  docked, on the ground, inside a station, on the port's rail, out of reaction
  mass. With the cruise drive blocked it still engages, on thrusters, and says
  why the drive is out.

Measured (`test/intercept.test.js`, 24 seeds × an orbital port from another
world, the same port from 3,000 km, a moon and a coasting NPC ship, 96 runs):

- **Arrivals.** Every run that started arrived: inside the standoff tolerance
  and matched to within 2.4 m/s (worlds: into their orbit).
- **Thruster legs.** Arrival is within 0.5% of the pip's prediction, except a
  freighter that started a burn mid-chase (86% late).
- **Cruise legs to ports.** Within 2% typically, and up to 18% late.
- **Moons.** Within ±25%, and one 68% early, where the real detour round the
  planet was shorter than the modelled one.
- **Cost.** A solve takes a median of 0.12 ms and a worst of 2 ms. The pip
  standing on screen costs about 0.3 ms a frame.

Fixed on the way: a traffic ship's `vel` can disagree with its own rail. One
freighter moved at 37.5 km/s and reported 32.4. The assist therefore reads a
ship's velocity off its rail's positions, not the field.

**Saves:** unaffected. Nothing new is saved and the save version is
unchanged. The assist is not carried across a save, as auto-dock is not.

### Changed (2026-11-03, landing on open ground, giant skims retuned, the sky under an overcast)

Astra: "I agree with you on all of that, especially the skimming."

- **Open ground charges what a pad charges.** Setting down away from a port
  was free up to 100 m/s and a wreck past it. It now uses the pad's own damage
  ramp, the same function: free to 20 m/s, costing more hull the harder you
  hit, and fatal at 90. A hard touchdown says what it cost on the touchdown
  line. Gear up on open ground is still a wreck at any speed.
- **The landing autopilot sets her down at about 10 m/s.** It braked to its
  final crawl halfway inside a pad's capture envelope, but a pad catches a
  ship at the envelope's edge, so it caught her still fast. Flown into 47
  surface pads and bays across 12 seeds from 25 km up, it hit every open pad
  at about 138 m/s, which is fatal, and Harrow Deep's shaft at 30 m/s. Nobody
  saw this because pads used to refuse a fast arrival rather than charge for
  it. It now crawls at the edge, at half the lower of the pad's limit and the
  speed damage starts. Measured again: 8.6 to 10.5 m/s, no hull lost on any
  of the 47.
- **Gas giant skims are back where they were.** Once a giant's air turned
  with it, a skim flown with the spin met the air slower. Over 40 giants, a
  prograde pass took 0.53x the heat and 0.81x the hydrogen it used to, and a
  shielded hull could hold three times deeper. A giant's air heat is now x1.9
  and its intake x1.25. A prograde pass is back to 1.01x on both; against the
  spin is about 3.2x the old heat, so it is still the hard way round. Rocky
  worlds and a star's corona are unchanged. Your skimmers' work orders are
  unchanged.
- **An overcast looks overcast from the ground.** At a ground port or a sea
  platform, the sky now shows the weather over that spot. That is the same
  weather the planet is painted with and the port's forecast reports. Overcast
  is a grey cloud ceiling, partial cloud is broken cloud, and the sun and stars
  go behind it. The light goes flat: less direct sun on the ground, the sea and
  the buildings, no glint on the water, and the cloud's own diffuse light in
  the shade. The cloud layer still stays off the ground near your eye, so the
  white streaks it used to leave on the sea round a rig do not come back.

### Saves

Every save loads. Nothing new is written. The landing note on the ship
(`touchdown`) exists only at runtime.

### Fixed (2026-11-03, the Cutter's and the Crawler's models mended; a door out of the Crawler's lift pit)

Astra, on the two model problems the hull-walk fix reported and could not mend
in code: "can you not fix the models?"

- **The models themselves are fixed**, in `ref/glb`, by a new tool,
  `tools/glb-patch.js`, that edits the `.glb` files directly. It only touches
  the parts it names, and only those still open. Running it again changes
  nothing.
- **The Cutter's belly.** Four blisters under her (two on the keel, two sensor
  blisters) were domes with no lid. Their open rims sat a centimetre inside her
  belly, so they could not be seen, but they were holes. Each now has its lid
  (24 faces). Her radar dishes, each two open bowls whose rims missed by a
  centimetre, get their back faces.
- **The Crawler, all three liveries.** Her frame was built of open parts:
  single-sided lamps, hazard stripes, deck markings and her canopy panes;
  downward RCS bells open at the throat, 8 m up her track sides, which you could
  see up into her through; and open-ended struts, pipes and link tubes, plus
  point-defence domes with no base. Sheets get their back face, which looks the
  same because nothing is culled. Shells get lids in their own colour. Bells get
  their throat capped and their mouths left open. That is 65 parts and about
  2,400 faces per livery.
- **A door out of the Crawler's lift pit.** Her lift comes down into a pit
  boxed in by her skirt, with no way through it. Her fore cross-member now has a
  doorway, 2.30 m wide and 2.13 m clear, on the lift's line, framed in her hazard
  amber, with a door leaf in her belly doors' colour slid open beside it. The
  0.6 m "lift lane" you used to duck along is gone; a lift is walked off by the
  same rule as everywhere else.
- **You stand up in her lift pit.** It was 1.80 m to her closed belly doors,
  3 cm short of standing height. The doors (leaf and hazard stripes, both sides)
  are raised one import cell (0.478 m of her art, 0.164 m as flown), as far as
  her hangar floor allows, so the walk from the lift to the door has 1.92 m or
  more over the walker's whole footprint. `render.js` `CR_DOOR`, which finds
  those doors for a founded Crawler station, moved the same cell. It now finds
  only the doors: before, one strip of each skirt rail's inner face also slid
  away with them.
- **The Cutter's sisters too.** `navy-l` and `navy-s` share her lidless
  blisters and open dishes, and `police-s` had an open beacon dome. No player
  walks under them, but they are closed the same way.
- **Caught if it comes back.** `glb2hulls` prints every model's open edges
  and warns, naming the parts, on any model a vertical ray crosses an odd
  number of times. `test/hull-seal.test.js` fails on any model in the
  library above 0.

Before: the Cutter had 38 odd columns and each Crawler livery had 1,592. Now
every hull and livery has 0, in airlock.test, which also walks the Crawler
forward off her lift and through the doorway standing up. All 57 library
models are at 0. The other 50 models in `src/hulls.js` are byte-identical.

**Saves:** survive. Only the art changed; nothing about a hull is stored.

### Fixed (2026-11-03, inside a station on the way through: the rooms are drawn, the routes miss the walls, the lifts carry you, the blast doors are back)

Astra, at Halden Dock, Waypoint Dock, Threshold Dock and Halden Yard:
"station interiors in transitory spaces isn't drawn"; "shaft walls are not
drawn during transit for the angled shafts"; "ship sits on top of the shaft
for the 45 degree elevator instead of at the base of the shaft"; "why is the
shaft protruding from the wall at the top and bottom of the shaft?"; "when
the elevator is not there, there should be a blast door covering the shaft";
"What happened to having those interleaved blast doors inside, separating the
berths from the rest of the station interior?"; "can you ensure that the
surfaces are more than 1px thick?"

- **The station is drawn round you in transit.** The renderer draws one
  compartment when you are in one, and asked "which berth is nearest" to
  decide: riding a bore or crossing a hall beside a bay, you were "in" that
  bay, and with its inner gate shut behind you it was drawn alone - the car
  and two door leaves in black space. A compartment is now only the room you
  are inside (its berth's box); everywhere else the whole station is drawn.
  With the cutaway on and the camera still inside the station's metal, the
  station is lit as rooms, not as a hull in the sun, so its inside walls are
  no longer black on black.
- **Routes through a station go round its walls.** The corners of a small
  hull's route from the heavy bay were found on a coarse grid that let a
  line cross a lift's deck plating, and pulled taut on that grid: at Halden
  Dock one leg ran four kilometres straight through the structure. Each leg
  that crosses a surface (at the fleet's widest hull) is now routed again
  round it. Swept at Waypoint Dock's size: 85 of 131 routed and direct berths
  had an inner leg through something; 55 now, and 51 of those are legs the
  art has no open way through at all (the cylinders' arm bays, the
  skimmers' hoists, the yards' tracks), which are listed in
  interiors.test.js for the art. Every ring, refinery and small or medium
  spine berth is clear.
- **The 45-degree lifts carry you on their deck.** A hull riding an inclined
  car was stood on top of the car's bounding box, which on a tilted car is
  far above its deck: 127 m at Halden Dock, out through the top of the bore.
  It stands on the car's deck now, in the bore.
- **The ring's lift shaft is flush at both ends.** The floor under the
  parked car was solid (car and hull sank through it), and the shaft went on
  350 m below the spoke deck the car stops at. The plating across the run is
  cut, the pit below is cut away and floored at the car's underside, and the
  hatch over the shaft is shut exactly while the car is away and open while
  it is home - the car is the floor when it is there.
- **The inner blast doors are back.** The station set of 2026-09-25 kept
  every inner gate's frame and none of its doors. Every leafless inner-gate
  frame (spine, cylinder, yard, refinery, skimmer, cradle: 39 of them) now
  has a pair of slab doors meeting on interleaved teeth, run by the airlock
  as the inner gate always was, and on the way through a heavy bay to a
  small one the far bay's own inner gate opens for you.
- **The civil yards open their doors.** yard-s, yard-m and yard-l kept their
  door leaves in the wrong part of the model, so they were welded shut and
  every arrival flew through them.
- **Every hull stands on her own gear at a station.** A station berth held
  every hull at one height over the deck, the fleet's: at a small station a
  Talon's gear was 1.2 m into the deck, at a large one she stood 2 m above
  it, and the Tanker stood 5 m into it. Each hull's feet are now on the
  deck, half a metre higher on her gear as before. Ground ports keep the
  old height for now: their walkable hangar is fitted round her as she
  stood, and has to be refitted first.
- **Walls and floors are slabs, not sheets.** 1,670 walls and floors across
  the station models were single flat sheets - a 1 px line edge-on or cut by
  the cutaway. Each is now a slab (a metre at Threshold Dock, four at Halden
  Dock); decals and marks laid on surfaces stay flat. The new blast doors
  are built thick.

Not done, for the art: the cylinders' 45-degree bores still stand proud of
the hull where they meet it (the converter's clipBores trims them by box, not
along the true angled intersection); the yards' track hatches are still in
the hull, closed; the skimmer's sort lift and the spine's hub lift stop
0.04-0.12 radii short of the deck above them (neither is ridden); the yards'
inner gates open onto a wall of the art's own (the hall InnerCurtain).

**Saves:** survive. Nothing is stored that changed: berths, routes, doors
and stand heights are all computed from the model and the hull each frame, so
a ship saved docked loads standing on her own gear.

### Fixed (2026-11-03, her hull is solid when you walk under it; half a metre higher on her gear; a longer ramp)

Astra, on foot in a hangar at the foot of her Talon's ramp: "interior of ship
visible, no collision on underside so we're clipping through the bottom,
please fix"; "the ramp should be longer"; and "the ship should sit about one
half meter higher on the landing gear".

- **Her underside is solid.** The clearance under a parked hull was sampled at
  the middle of each half-metre cell only, so a keel fin narrower than a cell
  (the Talon's, 5 cm off the floor) was invisible from every cell beside it;
  only the walker's centre was asked, not the 0.3 m round it; and a head under
  1.4 m of hull was squashed down to an eye 0.4 m off the floor instead of
  being stopped. Now every triangle of her as drawn (the ramp's well, the
  airlock cut, her legs) is clipped to every cell it crosses, the walker's
  whole disc is asked, and the rule is two heads: under 1.83 m you crouch,
  under 1.34 m she is solid. The eye is held 18 cm under her skin wherever
  you are (the near plane's corners), so it cannot end up inside her while a
  crouch eases down. On a Talon in her hangar, 791 of 14,476 cells are now
  solid. The field is built once per hull and berth: 13-50 ms for the small
  hulls, 240 ms for the Crawler, up to 390 ms for the Carrier.
- **A lift has a way out of its pit.** The Crawler's lift comes down between
  her tracks into a pit closed fore and aft by cross-members 0.66 m off the
  ground, and her model has no door in them. A lift now has a lane straight
  out to open ground where you duck under (13.7 m on the Crawler). This is a
  model issue: a door in her skirt would fix it properly.
- **Half a metre higher on her gear**, at station berths, ground ports, sea
  pads and on open ground. A geared hull stands 0.5 m higher in her own frame
  (the ground beside her, her hangar's floor, her ramp's drop), her legs are
  drawn telescoped to meet the floor, and the sim carries her the same 0.5 m
  higher off whatever deck the berth reports, every frame and along the
  arrival rail. Hulls that sit on their bellies (Mule, Long Haul, Cutter,
  Meridian, Leviathan, Capital, Crawler) are not lifted. Her feet stay on the
  same patch of deck.
- **A longer, gentler ramp.** Cut at 22 degrees instead of 30: the Talon's and
  Kestrel's ramps are 8.7 m at 21 degrees (were 5.5 m at 28.5), the Mule's
  9.3 m at 21 (7.0 at 28.5), the Cutter's 7.3 m at 21 (5.5 at 29), the Long
  Haul's 10 m at 25 (8.5 at 29). A drop too tall for 22 degrees takes the
  whole 10 m up to 33 degrees before it becomes a stair. A ramp stops short
  of a gear leg in its path, which keeps the Bollard's at 8.0 m and 31
  degrees (7.5 m at 29 before) and the Fighter's at 9.75 m and 29. The ramp
  lies in the airlock's floor, so a longer ramp makes a longer airlock, and
  it is never allowed to cost a hull a room the old ramp left her: the
  Enforcer's stops at 6.8 m and 26 degrees (was 5.0 m at 29) so her cargo
  bay stays, 1 m shorter than it was. Stairs (Dart, Samaritan, Trader,
  Runner, Heavy Shuttle, Heavy Enforcer) stay stairs, 0.5-0.75 m longer.

Bays: every geared hull still fits under every bay's ceiling at the new height
except the Carrier, which was already 31 m over every ground-port and sea-pad
ceiling before this change. Pinned in airlock.test (every hull in three hangars,
the flood from hatch to door, the lift agreeing between the sim and the renderer
at a station, a ground port and a sea pad, the ramp's slope, no room lost).

**Saves:** survive. Nothing about the lift is stored: a ship saved docked at the
old height stands at the new one on the first frame after it loads.

### Fixed (2026-11-03, docked at Mirven: the zoom, the floor, the doors and the lamps)

From Astra's playtest of the Mirven start (seed `kawartha`, Threshold Dock).

- **The camera zooms out of a berth on a trackpad.** "Camera doesn't zoom
  out more than 21 m while docked." The hangar let go of the boom only when
  one frame's zoom carried it past 1.08 of its wall, and the wall put it back
  every frame, so a trackpad's small steps were undone one by one (measured:
  stuck at 19 m for ever). The wheel's request is now kept apart from the
  boom, and the walls that are meant to let go judge the request. With the
  cut off, the view hands over to "the station from outside" only once the
  eye is in open space, not in the hull plating.
- **Hulls stand on the bay's floor, not on top of the doorway.** "The ship
  is sitting at the top of the inside of the bay rather than at the base of
  it." Where an anchor box is the throat itself, floor to lintel, the deck
  reading took the lintel's upper face; and the cradle's heavy throat lies
  just above its own floor plate, so the floor was thrown out. Measured over
  every orbital model: 97 of 378 berths off a level floor before, 40 after
  (all of them doors that face down or out of a tilted face, listed by
  berths.test). Every cradle, spine, refinery and skimmer bay that sat on a
  lintel is fixed; Aubade Array, Coldwater Post and Pilgrim Depot are among
  them.
- **The approach follows the landing lights, and waits outside the doors.**
  "Ship is not aligned with the navigation landing lights", and on the way
  out "we phased through the wall just above it". The rail and the lamps now
  share one entry line from the door, and the hull waits half the longest
  hull's length outside the leaves while they open instead of at the door
  plane, where half of it stood through the shut doors. Before: the hull
  went through a shut door at every berth of every model swept (45 of 45 at
  eight models); after: none, outside the civil yards (below).
- **Your own berth's airlock runs while you are docked.** The doors read
  berth 0's airlock for a docked ship wherever she was parked, so her own
  inner gate stayed shut and her own doors started cold on undock.

Still open, found on the way: the civil yards' (yard-s/m/l) door leaves are
in the model's interior bucket, which the door split does not read, so their
doors never open; the cylinders' bore bays have no level floor for the deck
rule to find.

**Saves:** unaffected. No save field changed; a ship saved docked is parked
on the corrected deck when the career loads.

### Added (2026-11-03, the galaxy chart zooms)

Astra: "on the F6 tab I want to be able to zoom in and out on the galaxy now
that we're running so many more stars." The F6 chart was one fixed scale,
about 3.9 px per light year, where the median star sits 11 px from its
nearest neighbour; the middle of the cluster was a smear.

- **Zoom:** the mouse wheel over the plot, anchored on the pointer (the
  galaxy point under it stays under it); `=` / `+` and `-` (numpad too),
  anchored on the selected star while it is on the plot; on-chart `+` and
  `−` buttons, and `WHOLE` to come straight back out. The chart's wheel and
  keys never also zoom the flight camera behind it.
- **Limits:** from the whole galaxy (the old scale) to 40 px per light year,
  set from nearest-neighbour spacing measured over 40 seeds (18,000 stars):
  as drawn, median 2.89 ly, 5th percentile 0.83 ly, so at the closest zoom a
  5th-percentile pair is ~33 px apart and a median pair ~115 px, room for
  both names, while the view is still ~15 ly across.
- **Pan:** drag the plot; `C` centres on your star, `Shift+C` on the
  selection. A press is a click until it moves 4 px, so a drag never
  selects. (`C` still complies with a demand while you are held up.)
- **What shows as you zoom:** names come in by tier (selected, here, course,
  visited, in reach, the rest) and are placed highest first, so they never
  overprint; the reach ring is labelled once it is big enough; a light-year
  scale bar and the zoom factor sit in the plot's corner; the selection and
  your own star get an arrow on the plot's edge, with name and distance,
  when they are off it.
- **Clicks** pick the nearest drawn dot within 12 px at any zoom — the old
  per-star boxes overlapped, and the later star in galaxy order won.
  Clicking your own star no longer silently selects the nearest star.
- **Culled to the view:** stars off the plot are skipped before anything is
  worked out about them; territory is built only for charted stars whose
  flag reaches the view, anchored to the galaxy so a pan blits the cached
  picture instead of rebuilding it. Measured in headless Chrome (software
  GL, a shared box, so read the ratios): the whole galaxy draws all 450 stars
  at a frame median of 10.9 ms against 11.7 ms before the change; ×4.2 draws
  59 and culls 391 (chart 4.7 ms); the closest zoom draws 17 and culls 433
  (chart 2.5 ms). A 200 px drag over 40 frames rebuilt the territory once.
- Zoom and pan last the session (per seed), not the save.
- Key hints on the chart, the H card and FLIGHT-CARD.md say all of it.
  Pinned in galaxyzoom.test (the transform) and render.test (the real
  listeners, culling, labels, territory at zoom, session memory).

**Saves:** survive. Nothing is saved; the zoom is a view, not a fact about
the career.

### Fixed (2026-11-03, outworks tied to the station they belong to)

Astra, of a tank farm hanging off Threshold Dock on two trusses that ended in
empty space: "what is this floating in space unconnected to anything?" The
outbuildings round a dock (tank farms, cargo stacks, solar wings, masts,
scaffolds, greenhouse rings: render.js `stationOutworks`) stood off, and were
tethered back to, the radius of the model's FURTHEST vertex. That is right for a
round hub and wrong by most of the station for a long one: off the flank of a
spine or a yard the hull is a fraction of that radius away, so the outwork stood
well out and its truss stopped short. They now stand off the hull's own reach in
their direction (`hullReach`, the outermost face the ray from the centre
crosses), and the truss ends just inside it; a direction that crosses no face
has nothing to tie to and is skipped. Same draws in the same order, so each port
keeps the kinds of outwork it had; only where they stand changes. Measured over
375 orbital ports in 37 models: 0 tethers now end outside the hull; the old
measure left 871 of 938 short of it. New `test/outworks.test.js` (view group).

**Saves:** survive. Nothing saved; the layout is a pure function of the port.

### Fixed (2026-11-03, the market's keys inside its box)

Astra: "there are options along the bottom ... floating off the box they're
sitting inside of". The market's key line was one fixed line wider than the
720 px panel, so its tail ran out over the border. It now wraps a phrase at a
time inside the panel, growing upward, and lists **Y trade analyser**, which the
old line had no room for. Seen in the same screenshot and fixed with it: the
waste row's note ("pays you to haul it") was measured in the wrong font and
printed over the price beside it; it now steps down to "(paid to haul)", or to
nothing, before it reaches the column. And solid panels are opaque (they were
97.5%, enough for the docking message behind the market to read through as a
ghost between the rows).

**Saves:** survive. Drawing only.

### Changed (2026-11-03, the trade starts carry the trade analyser)

Astra: "for trader start, it gets the analyser, mining start gets the survey
scanner". Both trade starts (Easy's Tallyman, Normal's Talon) now carry the
1,000 cr **Trade analyser** in place of the 7,800 cr market survey array. The
Normal Talon could not fit the analyser at all before (her second utility slot
held the array, her first the scoop), which made the trader's own instrument a
thing the trade start could not buy. Both mining starts already carry the
survey scanner and are unchanged. Every focus at a difficulty is still worth the
same (start.js rule 2): the 6,800 cr difference comes back as cash, so the
trade starts open richer in credits. Pinned in tradeanalyser.test.

**Saves:** survive. A career already started keeps the kit it started with.

### Added (2026-11-03, the trade analyser)

Astra: "add a trade analyzer as a buyable upgrade, 1000 cr, shows the graph of
how every commodity buys and sells at that port, and what the average price is,
your break-even price when factoring fuel in, and the buy and sell prices should
be visually distinct from one another. Trade analyzer text will be in bold, and
I need you to generate a line graph showing the prices of the commodities. This
screen will also be reachable by walking out of your ship and onto a station in
order to read it off a public computer terminal."

- **The Trade analyser**, a new fitting (`portanalyser`): 1,000 cr, a utility
  slot, 0.3 MW and half a tonne, one per ship, sold at every yard (`minDev 0`).
  `Y` opens it, from the cockpit or from the market screen. Docked it reads the
  port you are on; in flight, the port you have locked, anywhere in the system,
  with no range limit (the market survey array already reads every port from
  orbit; a cheaper display of one port's figures failing where that works would
  be a rule with no reason). Without it, `Y` says so and names the terminal.
- **The screen, all in bold.** Every good the port trades — ask, bid and a
  30-day sparkline — and one large line graph of the selected good over **30
  days, a point every 12 hours**, with price ticks in cr and day ticks. **Ask
  solid with round markers, bid dashed with square ones**, in two colours, so
  colour never carries it alone; a legend draws each. A port that only buys a
  good, or a waste producer that only pays you, shows one line and says so.
- **Two averages**, each a labelled reference line: this port's over the
  window and the system's (every port quoting it, over the same window). The
  average is the **mid** (halfway between ask and bid) where the port quotes
  both, and the one line's own price where it quotes one; the screen says which.
- **Break-even = ask + trip fuel ÷ tonnes**, on a **full hold of the good,
  capped by credits and by stock** (the screen says which cap bit). The trip is
  to your lock: a **port** (`T`) costs the cruise drive's reaction mass over
  the straight line between the two ports; a **star** — plotted on the chart
  with `Enter`, or on the analyser's systems list — costs `Galaxy.jumpPlan`'s
  jump fuel for the ship *with the load aboard*. Fuel is priced at this port's
  hydrogen ask (list price if it sells none; milfuel's ask on a military
  drive). It is compared with the locked port's bid now, or the locked star's
  best reported bid, as a margin per tonne. Nothing locked: the ask alone, and
  "lock a target to cost the trip".
- **Other systems** (`Tab`): the selected good's best bid and best ask, with
  their ports, in the 8 nearest systems you can reach on the fuel aboard, then
  systems you have visited, to 12. **Prices as last reported**: news rides the
  freighters, so a report is as old as a class II hull takes to cross
  (`Slipspace.hoursPerLy(400 t)`, 11.8 h per ly — five light years is 2.5 days
  old). Systems come from the same cache a visit uses, so the markets are the
  ones you would find, less the age. Filled one system a frame (5–70 ms each,
  median 19 ms, over twenty seeds), never per frame after.
- **A public trade terminal on every station concourse** (and every sea
  platform's hub): a pedestal with a lit screen and header, placed from its own
  seeded stream on clear floor facing the way you come in. `E` at it opens the
  same screen for that port, no fitting needed — and no break-even: it cannot
  see your ship's lock, and says so. Placed after the dressing, so every
  concourse is dressed exactly as before.
- **`Economy.priceAt(port, cid, t)`**: the market as it was at `t` — the closed
  form, plus your own trades only from when you made them. `price()` cannot be
  asked about the past at a port you are docked at (it answers from the live
  shelf). `price()` and `priceAt()` now share one `quote()`, so they cannot
  price stock two ways.

### Changed (2026-11-03, the trade analyser)

- **The old 7,800 cr "Trade analyser" is now the Market survey array.** Same
  id (`tradescan`), same job (every port's shortages and gluts on the TRADE
  page), same price: the name went to the instrument Astra asked for with it.
  The TRADE page, the start kits' lines and the tests say the new name.

### Saves (2026-11-03, the trade analyser)

**Old saves survive.** No save version change. Nothing new is saved: the
screen is a screen, the plotted star for the analyser lives for the session,
and a ship that already carries `tradescan` keeps it under its new name.

### Changed (2026-11-03, warmer, fuller habitable zones: stars stage 2)

Stage 2 of the star programme. **Every seed's planets move**: Astra accepted the
reshuffle and that careers from before the star programme reset (see **Saves**).

- **A warm anchor.** One world in every system sits at insolation S₀ ~
  log-uniform(0.80, 1.35) Earth units, a = √(L/S₀).
- **A compact chain through the zone** (`warmChainAxes`, fork `'planet-orbits'`):
  1–3 steps inward and outward while the last world is inside the zone, at a
  ratio U(r_min, r_min + 0.18) with r_min = max(1.20, 1 + 8.8·∛(2·m_max/3M★)),
  m_max = 4.2 M⊕ (the top of the solid-world mass draw): 1.306 at 0.2 M☉, 1.225
  at 0.5 M☉, 1.20 for G and up. Past the zone ×U(1.35, 1.80) to the drawn count
  (6–12; the zone is never cut short, and measured counts stayed 6–12).
- **Zone types by warmth**, one pick on the planet's own prng as before: S ≥ 0.65
  terran, terran, ocean, ocean, desert; 0.45–0.65 terran, ocean, tundra, desert;
  under 0.45 tundra, tundra, terran, desert.
- **`opts.legacyOrbits`** rebuilds today's orbits and zone types exactly (a test
  instrument; `test/habitable.test.js` holds 10 systems to names, types and
  semi-major axes captured from 44cd871).

Measured, legacy against new (kawartha's first 40 stars; first 200 in brackets):

| | before | after |
|---|---|---|
| ≥2 warm (S ≥ 0.6) global-habitable worlds | 10.0% (11.0%) | **62.5% (58.0%)** |
| median global-habitable insolation | 0.806 (0.737) | **0.924 (0.899)** |
| ≥2 habitable worlds, any band | 57.5% (58.5%) | 92.5% (92.5%) |
| global-habitable worlds | 45 (251) | 78 (405) |
| terminator / equator worlds | 41 / 5 (188 / 18) | 51 / 7 (254 / 29) |
| mean development | 0.552 (0.563) | 0.619 (0.638) |
| ports per system | 13.52 (13.70) | 15.28 (15.31) |
| closest adjacent solid pair, mutual Hill radii | 12.65 | 9.19 |

Beaverton: 17.5% → 65.0%, median 0.689 → 0.950; driftwood: 15.0% → 67.5%, 0.824
→ 0.996. Across all 1,350 stars of the three galaxies, 2 of 7,189 adjacent
solid pairs fall under 8.5 Hill radii (8.39, 8.42; both heavy pairs at r_min
round an M dwarf). Terminator worlds +24% (+35% over 200), mostly round M
dwarfs; if they read as too many, the lever is `TWILIGHT_INNER` (left at 0.80).

**Gates re-measured (doctrine 6), before → after, and what moved:**
- **Navy cutter** `NAVY_MIN_DEV` 0.55 → **0.63**: at 0.55 it let in 45.8% of
  claimed kawartha systems (was 28.8%); at 0.63, 27.8%. Beaverton + driftwood
  27.6% → 26.9%. Systems with a cutter 21.2% → 19.8%.
- **Naval capital** `CAPITAL_MIN_DEV` 0.60 → **0.68**: 13.7% → 30.7% at 0.60,
  13.2% at 0.68; capitals over 300 seed-i systems 57 (master) → 59.
- **Syndicate flagship** `FLAGSHIP_MIN_CRIME` 58 → **56**: richer systems are less
  violent, and at 58 it let in 55 of 300 seed-i systems (was 64); 56 lets in 62.
  Flagships per naval capital 0.61 (master) → 0.58.
- **Port tugs**: highports doubled (48 → 86 in 25 claimed systems) and tugs went
  3.12 → 5.08 a system, the clutter the tug's first cut was cut back from. A
  world's highports now share one tug (shipyards and carriers keep their own):
  3.32 a system (3.17 over rescue-0..23, was 2.96). Every inhabited system now
  has a tug; the deep, not the system, is where you are on your own.
- **Liners**: unchanged rule (one settled end). Two settled worlds in a system is
  now common (34% → 48.5% of 200 systems); liners +10%, in the same 102 systems.
- **Syndicate tithe**: unaffected — it reads holds, not development (17 holds in
  200 before and after). **The pirate mark** reads standing only.
- **KIND_MEDIAN**: kept (80 + 80 stars): agri 0.89 of it, farm-gold 0.77,
  plant-refinery 1.11, the rest within 4%; distress 7.3% → 7.8% clean, 25.7% →
  28.7% corrupt.
- **Government and crime**: mix much the same (anarchy 4% → 3%, feudal 10% → 8%,
  corporate 12% → 14%); median permissivity 48 → 44, violence 24.2 → 20.1. The
  low-dev/high-dev trend is real and a little gentler: −53 → −46 permissivity per
  unit of development over 600 seeds. economy.test's check compared a mean of ONE
  system under 0.3 (31.0 vs 38.1); it now compares development quarters.

**Fixed, found by the reshuffle:**
- **Ore on dry land** (survey.js): a mostly-ocean world's twelve random tries at a
  dry province could all land in the sea, and the fallback was wet; now it is the
  nearest dry cell. And where every mine stands on ice or a sea platform, the
  first non-mine province is at full strength. (ground.test, 282 of 286.)
- **A surface station's own shuttle** (generate.js `addPortRoutes`): every local
  hop scored the same, so with more than four ports over her world her own
  orbital half was the one cut (stations.test, 0 routes). Her half goes first.
- **Forecast ≠ the station** (economy.js `marketKey`, stations.js `siteKey`): the
  market's demand, wine and shelf hashes read the port id, and the forecast is
  built under a stand-in id; once a site passed dev 0.45 the two disagreed. A
  station of yours hashes on her site.
- **A gold farm is a back room** (generate.js `buildContraband`): a system whose
  only back room was a later gold farm also got a placed fence.
- **Towed in is down** (upkeep.js `towedUntil`, sim.js sea stays): a towed run sat
  on a sea pad the sweep had given to another ship (4 of 15,392 samples), and at
  a ground port lifted back into the holding stack after the tug set her down.

**The three red files, 2026-11-03.** Each was a latent bug in older code that
the reseed exposed, not a stage-2 regression.

- **A ring's heavy bay parked its hull on the roof** (render.js `berthDeck`, sim.js
  `doorFromStand`). The heavy bay opens upward through hatch leaves in the hub's
  roof, and the deck cast read the shut hatch, with vacuum above it, as the floor:
  every ring (all nine ring models, and yard-syn-s's one upward bay) stood its
  heavy hulls on the closed doors, outdoors. berths.test caught it only at a
  1.57 km ring; at a bigger one the hull's centre fell into the carved hatch cell
  and read indoors by voxel accident. A surface on one of the bay's own outer gate
  leaves is no longer a deck where the bay opens upward (and the replacement must
  itself have room for a hull). The arrival and the carve also measured the doors
  from the stand rather than from the berth box's middle, where `berthApertures`
  and the renderer measure them. Zero for every side bay; for the ring's it put
  the doors 0.19 radii above the hatch. Measured over every orbital model at ten
  radii from 1,263 m to 6,714 m (the smallest to the largest of 301 stations in 40
  seeds): rings never indoors 36 → 0 arrivals. Nothing else in the library moved.
- **The street's height over a small moon** (gl.js `overSphere`). The footprint
  mask, the pit wall's building test and their JS twins took the height over the
  sphere as z + d²/2R, which reads low by d⁴/8R³: 11 mm on a 10 m building 3.9 km
  from Harrow Hold's mouth on its 134 km moon, and 0.2 m (FOOT_MIN's own size) at
  the mask's 8 km reach. It is exact now, in a form that stays stable in single
  precision. The cutaway sweep's fixtures were also corrected where they checked
  the wrong thing. The block's expected height is its top's true height over the
  sphere (a block on the mouth's vertical leans 1.7° there). The "hot point" now
  sits a hair past the cut's edge, not up to a sampling step past it: where the
  cone is held to its cap, the line of sight from a point 0.4 m outside the cut
  leaves the cone 17 m back, outside the 20 m test blocks (Downwell, Terminus).
  Before and after shots look identical, as they should for a sub-centimetre fix.
- **A full port told you the wrong wait** (sim.js `berthFreesAt`, combat.js). A
  busy port holds more ships than berths, because traffic is a timetable and does
  not queue. The wait was read off the *next* departure, which takes seven ships in
  five berths to six. The mid-range auto-dock was told 13 min, then 7, 23 and 25.
  It held 68.5 of its 71.9 minutes. The wait now walks the timetable to the
  departure that actually frees a berth (bounded at 24 departures, so a floor),
  and the port says "until a berth frees".
- **Full ports, both of Astra's fixes (2026-11-03, later).** *(a)* **A small
  hull may take a free heavy bay** when every small berth is taken. `berthStatus`
  gives `lend` from the same occupancy count. The clearance says so ("Small
  berths are full. Clearance granted to the heavy bay"; combat.js
  `grantClearance` sets `ship.lentBay`), and `Sim.assignBerth` then gives the
  arrival the largest bay that takes her. The auto-dock asks through the same
  hail. *(b)* **Timetabled traffic books a berth or holds** (sim.js `bookVisit`,
  `earliestFit`, `visitHold`; `trafficCore`, `berthOccupants`). A visit books
  from the earliest moment in its layover from which the berths booked by
  higher-priority visits leave one free until it leaves; otherwise it holds for
  the whole stay, then comes in only to leave on time.
  - **Where she holds.** A ground port's ships hold in the roads. An orbital
    port's ships hold where the crossing ends, alongside, station-keeping and
    in no berth, so there is no jump out to a stack and back.
  - **Priority is fixed, not first-come.** It is a route's place in
    `sys.traffic`: the scheduled lines first, then the feeders built after
    them. That keeps it a pure function of seed and t. A first-come queue
    recurses through the port's whole history, which is integration. At any
    instant a pool holds at most its capacity.
  - **The timetable does not shift.** Departures and every later leg are
    unchanged, and cargo moves as before (the heavies' lighters do the same).
    Delaying departures would make every later leg depend on the queue.
  - **Traffic does not take the heavy bay**, except at a port with no small
    berth. Measured with it allowed, a heavy pilot found the heavy bay full at
    67% of samples instead of 21%: the freighter left circling that the
    smallest-bay rule exists to prevent. One line in `bookAt` switches it.

  Measured, 40 seeds × 20 times (6,240 orbital-port samples; 5,900 surface),
  before → after:

  | | before | after |
  |---|---|---|
  | courier turned away (orbital) | 65.8% | **6.7%** (lent the heavy bay 34.6%) |
  | true wait, courier, median / p90 | ≥156 / ≥249 min | **15.5 / 44.7 min** |
  | courier turned away (surface) | 11.4% | 0.4% (lent 8.2%) |
  | heavy pilot turned away (orbital) | 21.3% | 18.7% (true wait median 8.6 h) |
  | traffic visits held for the whole stay | — | 48.0% (orbital), 38.3% (surface) |
  | delayed, median / p90 | — | 39 / 89 min (orbital) |

  The courier waits are in minutes, as `berths-and-queue` intended. The "third
  turned away" target no longer reads the same way: a small pilot is now lent
  the heavy bay instead of turned away, and almost never waits. The pressure has
  moved onto the feeders, most of which hold in the roads. `trafficAll` costs a
  median 0.48 ms a frame (0.35 before); the first ask in a new system fills the
  cache (28 ms once). The mid-range auto-dock is cleared into the heavy bay and
  docks in **3.4 min** (was 71.9). Its assertion now passes; it was not changed.
  `economy.test` pins it all: no pool over capacity, the heavy bay lent only
  when free, the named wait is the wait there is, a held ship is in no berth,
  and the queue reads the same in any order. Its seam checks now take the hold a
  ship actually flies, and so does rumours.js `berthTime`: a visit with no berth
  is skipped, to the next one that has one.

**Saves:** **do not survive.** `save.js` VERSION 4 → **5**, the one deliberate
break of doctrine 4 for the whole star programme (Astra: "we don't need to have
saves be cross-compatible if we're altering the star generation"). Careers from
before the star programme reset; later star stages ride this same epoch. The
DEPRECATED shelf was empty.

### Changed (2026-11-03, the lessons first, then the ship)

Astra: "make the tutorial go first, then you get to choose your ship".

- **New career asks only the seed.** It starts the classic career — the
  Talon at home, 3,200 cr — with Captain Halloway's lessons. A seed in the
  URL is the same road. The title card no longer has the difficulty and focus
  rows.
- **The picker opens when the lessons end**, by his CLOSE or by END LESSONS:
  the same two questions (difficulty, then focus; Hard skips the focus), as a
  page of the pause menu, with time stopped. Every row says ship, hold, guns
  and **the money it will hand you**: the preset's credits plus the run's
  profit, which the heading also prints once.
- **Hard keeps the Talon** and changes nothing. **Easy and Normal swap the
  ship in place**, at the dock you are on, through the same `Start.outfit` a
  direct start uses, so the kit is identical to a direct start of that choice.
  Credits become the preset's plus the profit. Profit is credits plus cargo at
  this port's price, less the classic 3,200, **floored at nothing** — a run
  that lost money does not come off the start. The hold moves across as far as
  the new hull takes it (contract freight first, then what this port will not
  buy, then the dearest), and the rest is sold here; contract freight that
  will not fit shuts the row and says why. The trade-in is for the Talon only.
- **Not docked when the lessons end?** The choice waits: the card reads *Dock
  anywhere to choose your ship* and the picker opens at the next dock. `Esc`
  closes it without losing it; the pause menu carries a *Choose your ship* row
  for as long as it waits.
- **The Patience is always given**, END LESSONS included, and **after** the
  choice, at the same dock — so the ship traded in is always the Talon, never
  her. His goodbye now comes before the handover, and neither promises the
  Talon stays.

### Saves (2026-11-03)

Old saves survive; no version bump. `startPending` is a new, additive field.
A career saved mid-lesson before this is asked its ship when its lessons end
— unless it chose an Easy or Normal start on the old title card. One saved
sitting on the old HANDOVER step is asked before the Patience comes round
(or, if she already has, the picker's Easy and Normal rows are shut because
you are not in the Talon, and Hard keeps her). A career whose lessons were
finished, or that never had them, is never asked.

### Changed (2026-11-03, more than one star: the plumbing, stage 1)

Stage 1 of the star programme (project doc `claude/stars-and-systems-plan.md`:
close binaries, triples, white dwarfs, a pulsar, a black hole at the cluster
centre). **This is plumbing with no change of behaviour.** Nothing about
generation changes: no new random draws, no binaries yet. Every system the game
makes today has one star at its root and plays exactly as it did; the suite
holds the new code to the old answers bit for bit.

- **`sys.stars`**, set in `finalize` for every system (generated and
  interstellar): the system's real stars. Today `[sys.root]`.
- **`orbit.mu` override.** `Sim.orbitMu` and `finalize`'s period read it when
  present: a star on a barycentric orbit needs G·M_B³/M², which no
  (parent + self) sum gives. `Gen.barycentricMu` is the one formula.
- **A `kind: 'barycentre'` body is supported**: mass the sum of its stars, radius
  0, in `byId` and `sys.barycentres` but kept out of `sys.bodies` — so out of
  gravity, pads, the draw pass, nav and focus cycling, the scopes and the system
  manifest at the source. `planetFamily` stops at one as it does at a star.
- **`Sim.frameBody`**: the body a frame is measured against. `dominantBody` for
  every system today; with a barycentre root, beyond 3 binary separations a star
  hands the frame up to the pair, so circumbinary space does not flip between the
  stars. The trajectory plot, `oscElements`, the ellipse path, apsis times, the
  orbital basis, the HUD speed reference, the attitude ladder (`localVertical`),
  the cruise drop-out's circular orbit and far canisters' rails go through it.
- **`Sim.lightsAt`**: up to three lights from `sys.stars`, flux in insolation
  units, and the flux-weighted direction. Every lighting site that took the sun
  off `sys.root` now asks it: the ground-port sky, planets and rings on the GPU,
  ring chunks and field rocks, traffic hulls, crates, founding crawlers, debris,
  your own ship, the walking and spacewalk views, the boarding tube, stations,
  the shed's lift car, the 2D terminator and the lens flare on the glass (these
  last two take the brightest star). Still single-light in the shaders; several
  lights is stage 4.
- **The corona** (`coronaContext`) loops over the stars, so heat and scooping
  cannot vanish when the root is not one.
- **The SYSTEM page and the legacy HUD** print the star rows through
  `Sim.starLabel` / `Sim.starLuminosity`: unchanged for one star, `G2+K5` and the
  summed light for a pair.
- Left on `sys.root` on purpose, because they want the point the system turns
  about rather than a light: the arrival capture orbit, the interstellar drop's
  rail parent, slipspace wakes, the jump ring and the belt chart's centre.
- New `test/stars.test.js` (core group): 12,148 samples over 20 kawartha systems
  bit-identical, and a hand-built pair held over 10⁴ binary periods.

**Saves:** unaffected. No save field and no version changed; no barycentre is
ever generated, so nothing a save refers to moved.

### Fixed (2026-11-03, the ground turns: landing, standing, lifting and air against the turning world)

Yesterday the HUD learned to read speed against the turning ground
(`Sim.surfaceVelocity`); everything that flies the ship still measured against
the world's CENTRE, which on a spinning world is the velocity of no ground there
is. Measured over 40 kawartha systems, equators turn at: rocky worlds with air
up to 2,040 m/s (median 118), airless up to 798 (median 23), giants' air up to
20 km/s (median 7,030).

- **Touching down on open ground** (Sim `checkImpact`) is judged against the
  ground at the contact point. Before, a hull sitting still on a fast equator
  "arrived" at the ground's spin and crashed (2,040 m/s on Ishtar V), and one
  sliding in at that speed against the ground set down clean. She is left moving
  with the ground, and the impact forecast's contact speed is the same number.
  The open-ground threshold is unchanged: gear down and under 100 m/s, which is
  far gentler than a pad (damage from 20 m/s, fatal at 90). Whether to put open
  ground on the pad's damage ramp is a feel question, left for Astra.
- **Standing on the ground, her nose turns with it.** Her position always rode
  the spin; her heading was a direction fixed in space, so she swung once a day
  round her own gear. The heading is now kept in the world's own turning frame
  (`landedAt.fwdB`, `Sim.bodyFixedDir`).
- **Her stance lasts.** `settleLanded` stood her on her gear for one frame; the
  next re-placed her at the touchdown's 4 m. The spot now takes her stance height
  and heading. A save loaded on the ground is settled on its first frame too.
- **Lifting off** from the no-spot branch (main.js `liftOff`) leaves with the
  ground's velocity plus a metre a second of climb, not the centre's (a 2 km/s
  sideways kick off a fast equator). `Sim.liftOff`, the usual way off, already
  did this; it is now under test.
- **The air turns with its world.** Drag, re-entry heat, the plasma's wind
  direction and the giant skim's intake all read the air's velocity at the
  ship: `Sim.airVelocity`, the centre plus omega x r, with omega from
  `Sim.spinOmega`, the same one the ground and `surfaceVelocity` use. A ship
  hovering still over the ground is no longer charged drag and heat for the
  spin. **This changes how entries and skims play.** Flying the same way the
  air turns, you meet it slower than your orbital speed, and heat goes as the
  cube. Low over the air (0.85 of its top), with the spin:
  - a giant's air meets you at 0.64-0.85 of orbital speed (median 0.77), so
    heat is about 0.46 of what it was and skim intake about 0.77;
  - against the spin it is 1.15-1.36 of orbital speed (median 1.23), about
    1.9 times the heat;
  - on rocky worlds the median is 0.98 (0.93 the heat), as low as 0.68 on a
    small, fast world.
- **The vector assist's HOVER holds against the air at her**, not the world's
  centre. Over a fast equator it used to spend the tank dragging her backwards
  across the ground. In VECTOR mode within 30 km of an airless world it holds
  against the ground (the same `SURFACE_SPEED_KM` the speed readout uses), so
  the number on the HUD is still the number it nulls.
- **Contrails** drift with the air at the point they were laid, and their
  strength reads the same `Sim.airVelocity`.
- **Every surface port's berth now turns her with the world.** Only sea pads
  did (2026-11-02); at a shaft hangar she lay over in her berth as the day went
  on. Now she is re-faced every frame with the `berthFacing` that `dockShip` used.
  The no-bay fallback keeps her nose up as the world turns.
- **Unchanged, on purpose:** the orbit page, the map, the ORBIT readout and
  the osculating elements stay orbital. Autodock and the flight-assist lock
  measure against the target port, whose velocity already carries the spin.
  Station-wall contacts at a surface port use the port's velocity, which is off
  by omega x d for a hull d km from the port's centre (well under 1 m/s).
- **Tests:**
  - new `turningground.test` (group `core`), which fails on the old code:
    - at rest with the ground at the fastest equators in 30 systems (2,040 m/s
      with air, 798 without), she lands, placed or dropped from 20 m;
    - still against the centre there is a crash at the spin;
    - an hour on the ground keeps the same latitude, longitude and heading;
    - an old save's spot keeps its saved nose;
    - lift-off is the ground's velocity plus 4 m/s up;
    - no drag and no heat moving with the air, where the centre's frame gave
      0.077 m/s²;
    - the air's velocity is the ground's;
    - a berthed ship at a shaft port is still level in her berth a quarter-day
      later.
  - Two expectations changed, both because the test built its case in the
    still-air frame:
    - airdata.test: the "coasting through air" case is now 2 km/s through the
      air rather than against the centre. Same expected G.
    - mining.test: "60 degrees off, about half" is now measured from the wind
      the scoop meets (`sk.airDir`), not from +y. The tilted giant's spin moves
      the oncoming air off the orbit line.
- **Saves survive**, version unchanged. One optional field was added,
  `landedAt.fwdB`. A save made on open ground before this has none: she loads
  with the nose she was saved with, and the first frame settles her and records
  it. Nothing else saved has changed.

### Fixed (2026-11-03, sea platforms, third round: windows, lamps, glint, domes, the HUD's speed)

- **The tube's windows are windows.** Astra: "the walking view can show it
  through windows though". The second round painted each pane sea below and
  sky above. Now, on foot at a platform with the GPU, the world is drawn first
  from the walker's eye (main.js `seaWalkWorld`), the same world the chase
  camera sees: the sky over the platform, the swell, the rig, the other domes
  and the ships on their pads. The deck goes over it. The panes are left out of
  the deck's mesh and drawn depth-only before it (walk.js `panesFor`, gl.js
  `GLWorld.queueWindows`), so the wall behind each pane is not drawn and the
  world shows through. It is the cockpit's trick (`queueCockpit`), moved into
  the mesh pass because her hangar and hull share that pass. The depth buffer
  is cleared between the world and the deck, since the rig's own hub, dome and
  tube stand all round the deck.
  - **The plan stands on the rig.** Through a window the world must be seen
    from the right place, so the deck plan is laid where the rig is:
    - she stands at the pad's centre, centred by her own origin (the new
      `origin` in main.js `hangarSpec`), not by her hull box;
    - she faces the door, nose to the hub, as her berth faces her
      (`noseIn`);
    - the tube ends at the drum, 0.98 R from her, where the rig's tube ends.
      A short passage through the drum joins it to the pad room, which is
      still the square inside the dome.
    Measured in the browser at Kestrel Undercroft, pad 4: the plan's tube runs
    from (-118.1, -118.1) to (-33.2, -33.2) m in the port frame, and the rig's
    tube runs from (-118.1, -118.1) to (-32.5, -32.5).
  - **The rig's own tube is cut away round you** while you walk it (main.js
    `seaWalkTubeCut`, the mesh shader's cut box). From inside, its shell and
    floor girder stood between every pane and the sea.
  - **Only your tube is glazed.** The stubs to the other pads are drawn inside
    the hub's block, so glass in them would look out at the inside of a wall.
  - **A ship on a sea pad turns with the world** (Sim `updateDockedShip`). Her
    attitude was set once, at docking, and held still in absolute space while
    her berth went round with the world. Half a day later she was turned on the
    pad, and the deck plan, which is drawn in her frame, turned with her. **Every
    other surface port has the same drift.** It is left alone there, because a
    launch script stands ships up while they are still docked.
  - Without a GPU there is no world to see, so the 2D walk fills the panes with
    one flat glass colour, not a painted horizon.
- **The tube's ceiling light** was the generic room strip: one self-lit plate
  half a metre wide and 120 m long, which from one end of the tube was a hard
  white wedge. Now there is one lamp per pane, on the glazing's rhythm. Each
  lamp is a bright lens in two rings that step down to the ceiling's colour,
  with a lighter pool on the floor under it (walk.js `tubeLights`).
- **The sea's glint** (gl.js `seaShade`) was a wide lobe (power 140) at full
  strength whatever the sun's height, added on top of the water and clipped.
  It is now:
  - a tight lobe (power 900), broken up by the swell into sparkle;
  - Fresnel-weighted, 2% looking straight down and most of the light at
    grazing angles;
  - dimmed and reddened by the sun's path through the air (about
    1/sin(altitude)), and gone below the horizon;
  - screened onto the water rather than added, so it nears white without
    passing it.
- **Most of the "white patch" was cloud.** The cloud deck is painted onto the
  planet's surface, which is right from orbit. Under the world's own sky it was
  painted on the sea round your feet, so on a cloudy hour the swell was a white,
  streaked snowfield from 28 m up and from 300 m. Under the ground sky the deck
  now fades off the ground below 3 km of eye height and is fully back by 10 km,
  where you look down on it. This applies to ground ports too. **The sky pass
  has no clouds in it, so an overcast day now reads clear from under it.**
- **The domes** read nearly white and flat in full sun: a skin of #cfd6db plus
  the sun and the sky fill went past white. The plate is now #8c969e (about 0.58 of white; the sky fill adds about a third again on every side):
  - each row of a leaf is its own sheet, a few per cent lighter or darker by a
    fixed pattern;
  - the seams are darker;
  - odd and even leaves differ by a shade;
  - a sun highlight is added for meshes that ask for one (gl.js `uSheen`,
    `GLWorld.setSheen`; only the petals do, and every other mesh is unchanged).
- **The HUD's speed, near a world, is against its ground or its air.** Coming
  down onto a platform, the band read about 178 m/s (257 m/s at Harrow
  Starport). That was the world's spin, the same cause as the contrail bug.
  The new `Sim.hudSpeed` and `Sim.surfaceVelocity` give the velocity of the
  ground under you, built exactly as `surfaceOffset` turns a port, so a point
  fixed to a port's ground has the port's velocity.
  - **When:** inside the world's air (atmosphere tops over 60 systems are
    72-286 km), or within 30 km of an airless world's ground (`SURFACE_SPEED_KM`;
    airless worlds with ports turn their equators at 0-476 m/s, median 23).
  - **What changed on screen** (two lines of main.js):
    - the STATUS row reads `airspeed` or `gnd speed` instead of `speed`;
    - the speed box on the glass carries `AIR` or `GND` after its unit.
    Out of the air and higher up, both read the orbit, as before. The orbit map
    (F2) always reads the orbit's `speed`. Vertical speed is unchanged, since
    the spin has no vertical part.
  - **Display only.** Here is what each flying system measures against,
    checked, not changed:
    - **autodock** and the **flight-assist lock**: the target port's own
      velocity, which includes the spin, so they are surface-relative at a
      port;
    - the **vector assist's hover**: `atmosphereContext`'s velocity, which is
      the world's CENTRE, not the turning air;
    - **landing damage** (Sim `checkImpact`): the world's
      CENTRE too;
    - **drag**: the centre, by its own comment ("rotation of the atmosphere
      itself is ignored").
    So on a fast-spinning world, a ship that reads 0 `gnd speed` and sets down
    away from a port is judged to have touched down at the spin speed. That
    is a physics question, raised and not touched here.
- **Tests:**
  - seaplatform.test (group `ground`): your tube is glazed and the stubs are
    not; the panes are their own mesh; no face of the deck carries the old
    painted sea or sky; every pane is in the tube's walls, just in front of
    them; main.js draws them with `queueWindows`; she stands at the pad's
    centre 0.98 R from the tube's end, nose to the hub.
  - airdata.test (group `core`): a ship sitting still on 12 surface ports'
    turning worlds reads 0 (the old reading was up to 124 m/s); it says air or
    ground; a 5 m/s descent over a pad reads 5 m/s; in orbit it is the orbit's.
- **Saves survive**, version unchanged. Nothing new is saved.
- **Not done:**
  - Planetary rings, tears and lightning bolts are not seen through the
    tube's panes. They draw after the depth clear and fail against the panes.
  - **The walk's floor is about 2 m under the rig's deck.** It is her gear's
    floor, and she stands a fixed standoff over the deck, not her own gear
    height: at Harrow Starport the courier's gear is 2.3 m under the deck
    plate. So through the panes your eye is just under the neighbouring
    decks' tops, and you see their edges as slabs. This is a berth-height
    question for every pad, not a window one.

### Added (2026-11-02, Captain Halloway's tutorial — from Astra's working copy)

**Saves**

Saves from Brian load unchanged. One field was added (`tutorial`), and a
career saved before it has no tutorial.

**Added**

- **2026-11-02: Captain Halloway's last run, a tutorial that plays like a
  mission.** Astra: "a tutorial which plays like a mission, but teaches the
  player exactly how to maneuver their ship, how to make money ... an old
  ship captain retiring and wanting to show the ropes to a new pilot, and
  when you complete his tutorial, you get his old ship."
  Every new career now opens with Oren Halloway on the channel: forty years
  hauling out of your home system, retiring, and offering you his Tallyman
  Trader, the *Patience*, if you fly one run his way. Fourteen lessons
  (`src/tutorial.js`), each passed by what the ship and the ledger actually
  do, never by a key the tutorial listens for:
  buy a cargo he picks from real prices (F4, Market) · request launch and
  ride the car up (F4, U) · climb on W · lock the station (F3, or `[` `]`) ·
  auto-dock (T, T) · sell it and see the profit · sign a contract (F7) ·
  undock and fly out of the hull · turn the nose (arrows, Q/E) · raise the
  far side of the orbit with a prograde burn (`/`, V, W) · deliver the
  contract · take command of the *Patience* on F5, FLEET.
  The *Patience* is an ordinary fleet record on the clamp beside you, with
  her yard outfit and a month's berth paid. You can keep the Talon or trade
  it in. Running ahead passes lessons early. SKIP STEP passes one, END LESSONS
  (two clicks) ends them with no ship, and HIDE folds the card to a line.
  - **The run is measured.** Across 40 sampled openings, 39 had a good worth
    carrying. The median first hold clears about 4,700 cr against the 3,200
    you start with. The destination is scored down by distance (half per
    ~100 million km), because on profit alone 70% of first runs left the
    home world, one of them 82 AU out.
  - **The card is in the corner when flying and a strip on the screens.**
    At 800 × 600 the full card covered COMMS's launch row and the market's
    sell column, the two things his first lessons ask you to press, so every
    full-screen mode gets a one-line strip across its title bar (MORE brings
    the card back). In flight it folds to one line while a collision, chase
    or node banner is up.
  - The captain's face is the composite-sketch portrait (`portrait.js`):
    the oldest plain face out of sixty draws, a merchant and not a pirate.
  - Hooks: `Tutorial.note` from the market's `trade()` and from
    `Missions.completeAtDock`, `Tutorial.update` once a frame after
    `Missions.update`, and `G.tutorial` in `save.js`.
    `test/tutorial.test.js` (100 checks) walks every lesson and measures
    the run across 40 galaxies.

**Changed**

- **2026-11-02: auto-dock asks for clearance, and holds for a berth.**
  Astra: "auto-docking should never make you a criminal. Auto-dock now
  includes auto-contact the dock for permission to land once we drop out of
  cruise." The autopilot sends the same hail F4 does when it drops out of
  cruise, or at once if the approach is too short to cruise. If clearance
  is granted it goes in. If the port is full it holds off the port (the
  autopilot reads HOLD) and asks again when the timetable says a berth
  frees, with the clock wound up while it waits. If you are barred it stands
  down and the port says why. The capture is also guarded, so no autopilot
  docking ever closes the clamps uncleared. Flying in by hand without asking
  is still your choice and still an offence. `render.test.js` flies it at a
  port forced full.

**Found by playing the tutorial**

- **Auto-dock into a full port made you a fugitive.** Both test ports were
  carrying more ships than berths (11 in 6). A port never offers clearance
  while it is full, and the autopilot docked anyway, so a new player's first
  docking booked a queue jump, 500 cr and FUGITIVE. Fixed the same day in
  the autopilot itself (under Changed). Halloway's stopgap, where he set the
  clearance himself, is gone.
- **An orbital undock can leave you inside the hull.** The clamp lets go
  with a 3 m/s push, nose out. Turning and burning in there put the test
  ship through a bulkhead and lost her with the contract freight. The undock
  lesson now passes only once `Sim.insideStation` says you are out.
- **The flight frame survives a new career.** ORBITAL left on from the burn
  lesson made W prograde at the top of the shaft, and the next career's
  climb flew sideways into the ground at 178 m/s. The climb lesson reads the
  frame and tells you to press `/`.

### Changed (2026-11-02, the drive on the ground: two seconds, longer for bigger hulls)

- **The ground spool is 2 s for a courier and grows with the size of the
  drive** (Astra: "bring the whole engine spool up sequence to 2 seconds,
  longer for larger ships"). It was a flat 3 s. Now 2 s for a 42 t
  courier, growing with the cube root of dry mass (a bigger turbopump and
  chamber take longer to bring up), capped at 8 s: a 260 t freighter is
  about 3.7 s, a capital hull 8 s. Dry mass, not laden: cargo does not make
  the engine bigger. The start message says this hull's own time.
- render.test: "the drive on the ground" now checks a courier spools in
  about 2 s and lifts just after, and a heavy hull is still spooling when a
  courier would be up and is hot in its own (capped) time.

### Added (2026-11-02, sea platforms: a port on the open water)

- **Astra: "for ocean worlds, we want like a floating oil rig style of port,
  and it would be pads that have protected domes open and close to protect
  ships and their cargo from the waves, and a central bar, connected by
  covered tubes."** And: "a dry salt flat has a buried port, water has a
  floating, pontoon-stabilized port."
- **Which ports.** Every pad the inland pass could not put on dry ground, on
  WATER, is now a sea platform where it was rolled (`Gen.makeSeaPlatforms`,
  straight after `placeInland`, no draws). Over the kawartha galaxy that is all
  117 of the `coastal` flags: 102 on ocean-type worlds, 15 on terran twilight
  worlds (14 ring, 1 band). None is left flagged coastal. Never on lava, never
  on a desert (its "sea" is a dry salt basin: ground, buried ports as before).
  - By market role: 38 orbital, 34 highport, 27 shipyard, 18 agri. The
    "orbital" and "highport" here are MARKET roles (`Economy.PORT_ROLES`),
    not kinds of station: "orbital" is the default role any port gets when it
    has no special one (named "Orbital port", which is misleading on a surface
    port, and missions.js already declines to say it), and "highport" is a hub
    on a developed habitable world. Every one of the 117 is a surface pad
    rolled by `makeSurfacePort`; none is an orbital station that strayed onto
    the ground. So all of them make sense as platforms.
  - 24 of them had been rolled as buried bays. A platform is never
    underground; the roll is kept as `seaRolledUnderground`.
- **Identity kept.** id, name, radius, faction, market, missions, the timetable,
  a save's references: unchanged. The farm rules and the town's draws read the
  rolled flag, so nothing else in ANY system moves (seaplatform.test generates
  all 450 systems with and without the pass and compares every port, route,
  patrol and body). New fields: `seaPlatform`, `platformWhy`,
  `seaRolledUnderground`; `typeName` 'Sea Platform'; `coastal` cleared.
- **The rig** (render.js `seaPlatformMesh`, in kilometres, `Gen.seaLayout`):
  - a hub on four columns and a ring of pontoons, with the bar's two-storey
    block, a lit name band, a derrick and a crane;
  - **eight pads**, each its own small semi-submersible on four columns and two
    pontoons, a drum wall round the landing circle (lamps, amber on the large
    pads), and a **covered tube** 120 m to the hub on two trestles, with window
    strips;
  - **pontoon-stabilised and still.** The pontoons are drawn awash at the
    water line (their tops 0.8 m up, so the swell washes over them); the
    columns stand on them; the deck is 28 m up. A semi-submersible's buoyancy
    sits low and its columns are thin at the water line, so it does not bob,
    and the rig is bolted to the world like any ground port. Only the water
    and the domes move.
  - **Why eight pads, two large (north and south):** measured over 120 systems
    and three days, a platform had a median of five ships moored at once and
    eight or fewer 92% of the time. Domes are 100 m across (a waste hauler,
    the largest hull not routed to a large bay) and 170 m on the large pads
    (a tanker).
- **The domes are petals, not a clamshell.** Eight leaves per dome, hinged on
  the drum, swinging up and out past vertical to open. Petals because they read
  as open from every side (a clamshell edge-on looks shut), each leaf sweeps
  only an eighth of the arc and never over the landing circle or the tube's
  doorway, and shut they read as a shell against the weather. Measured: an open
  leaf comes no nearer than 14 m to a neighbour's shut dome.
- **The dome sequence** (Sim `SEA_LEGS`, `seaDomeTargets`):
  - **You, arriving:** cleared and inside the 2.5 km envelope, your pad's dome
    opens; the pad catches you and the rail runs approach (held 90 m over the
    crown) > descend (through the open crown) > settle (onto the stand) > seal
    (the dome closes, over the whole leg) > berth. The dome is open every
    moment the hull is off the deck and starts to shut only once it stands on it.
  - **You, leaving:** undocking always runs that rail backwards: sat on the
    stand while the dome opens, lifted out through it, handed over held above
    it (the ground ports' pad hold). There is no instant way out through a shut
    dome.
  - **Any hull inside a dome's volume and not berthed holds that dome open**,
    cleared or not: the guard that means a dome never shuts on a ship in the air.
  - **Traffic:** open from 60 s or 3 km before she is down until 20 s after;
    shut while she is berthed; open 30 s before she lifts until she is 1.5 km
    off. Measured over three days at 24 platforms: 0 samples of a dome shut on a
    ship in the air over her pad, 0 opened for a berthed ship's own sake.
  - Petals are eased on the wall clock (4 s), like the shed's doors.
- **Traffic stands on the pads** (`Sim.seaTrafficPad`), under the domes, one ship
  to a pad. Closed form off the timetable, swept forward in eight-day blocks
  with a day's pre-roll, so it is the same answer after a warp or a reload.
  Your own pad is left for last. When every pad a ship could use is taken
  (7% of moored ship-samples over three days at 24 platforms; small hulls take a free large pad before
  that) she holds off the rig on station-keeping, low over the water, in plain
  sight, rather than share a dome.
- **Walking** (walk.js `seaLayout`): down her ramp onto the pad under the dome,
  through the dome's door, along the 120 m covered tube, into the hub: concourse
  (market desk, shipyard counter where there is a yard, freight office), the
  bar, the crew hall. The tube is the only way between them. The other pads'
  tubes leave the hub as stubs with the hatch at the end, where a ship moored on
  that pad is boarded. (The deck plan is axis-aligned boxes, so those stubs
  stand for tubes the rig runs out at 45 degrees; your own tube and dome are
  the real length and size.)
- **The cutaway at a platform** is the orbital cone, cut through the dome over
  you, not a street section: there is no ground over you to open, only petals.
  No hole is cut in the planet; nothing of the rig is below the sea.
- **Waves** (gl.js `SEA_GLSL`, `GLWorld.setSeaPort`): a swell of four trains
  (64, 41, 23, 13 m) in a 2.5 km disc round the platform, a closed function of
  sim time: tilted sun shading with a glint; the depth the sea writes lifted by
  the wave height, so the water line climbs and drops on every column (ocean
  worlds; on a terran shore the land is not lifted); foam round each of the 52
  columns and trestles, thicker as a crest passes; whitecaps on the highest
  crests. Each train fades out by its own wavelength with distance.
  - **CPU:** `seaPortNear` (nearest platform within 30 km) and a handful of
    uniforms per frame; `seaDomeTargets` 0.09 ms a frame at the busiest
    platform measured (46 routes); a cold pad sweep 8 to 63 ms, once on arrival
    in a system.
  - **GPU:** four sines per sea fragment inside the disc, plus the 52-post
    foam loop for fragments within the rig's reach (330 m). Not measured on the
    RX 540 (the cloud container has no GPU); see the report.
- **Also:** missions name "the sea platform at ..."; the HUD says "Sea platform"
  and "at sea on"; the control cabinet stands on the hub's deck; the shaft
  doors, collar lamps, the town and its boards are not drawn at a platform.
- **Tests:** `test/seaplatform.test.js` (group `ground`): which ports, identity,
  nothing else changes, determinism, the bay table, the mesh, the petals, the
  arrival and departure dome sequences, the targets, traffic on pads, the walk
  from the ramp to the bar and back, saves. ground.test reads platforms as the
  coastal flags they replaced.
- **Saves survive**, version unchanged. A save docked at one of these ports
  loads onto a pad of it (restore docks by id).
- **Second round, after the first frames:**
  - **The sky.** A daylit platform had a black, starry sky and the planet's
    bare limb for a horizon: the ground sky (sky pass, horizon, haze by optical
    depth) was only engaged by a ground port's street cut. It now runs whenever
    a sea platform is within 30 km of the eye (main.js `seaSkyPort`), cut or not.
  - **Sky fill.** Meshes under a daylit ground sky take a share of the sky's
    light on their shade side (gl.js `uSkyFill`), so backlit domes are not
    black. Ground ports in their cut get the same fill.
  - **The tube** is dressed as a tube in the walk view: chamfered upper and
    lower edges (an octagonal section) and a glazed strip down both flanks,
    pane by pane, painted sea and sky. The deck view draws no world through a
    wall, so the view through the glass is a painting, not the sea.
  - **The black box and slab in the cutaway** were the walking deck's hangar
    and its tube and hub, drawn into the world round the berthed ship in its
    hangar frame. At a platform the berth is the domed pad, so that plan is not
    drawn from outside (it is still what you walk on).
  - **The white beam from a ship into the sky** was her own contrail. Air speed
    was measured against the world's centre, so a hull carried round with the
    ground at the world's spin laid one sitting still, and the points streamed
    off at the centre's velocity. Contrails now measure against air turning
    with its world. This was not new to platforms; it showed there first.
  - **Foam** spreads round each column as a torn ring rather than a square.

### Fixed (2026-11-03, the burnt edge under a building, cleaned up)

- **The stray light pixels in the scorched strip are gone.** At Ashford
  Undercroft from 1.4 km, about six pixels of plain street showed along
  the strip's inner seam, and fainter ones showed in the hot band in open
  street.
  - They were not the footprint mask. The planet pass and the pit-wall pass
    each decide whether a street point is inside the cone, and in the last
    centimetre they can disagree. Where the planet kept a pixel that the
    wall pass sent down the pit wall, the lip's top lay a hair beyond the
    street and lost the depth test.
  - The lip's band is now written just nearer than the street on its ray,
    the same way the street's own band is.
- **The hair-thin light diagonal at the building's corner is gone.** The
  sliced wall is now found where the line of sight leaves the cone. It is
  scorched where that point is inside a building's footprint and below the
  building's height there.
  - The old test asked at the street point, then backed up to the roof.
    That works in the middle of a building but not at its side wall.
  - The street under a building is no longer thrown away. The old discard
    reached half a mask texel past the wall's foot into open street, and
    that strip was the light line. Where the band really is under a
    building, the building's own wall hides it by depth.
  - The scorched face now meets the side wall's own cut band exactly.
- **The corner step is left as it is.** Where open street meets a
  building, the hot line climbs the building's side wall from the street's
  edge to the roof's edge. That is the real cut through a wall the cone
  slices, drawn by the building's own band. Blending the two over a few
  metres would put a hot edge on surfaces that are not cut.
- **The footprint mask:**
  - A one-texel crack between two meshes now reads as the building. Two
    such cracks were found at Ashford from 1.4 km.
  - Heights are stored as a square root, so the steps are fine where
    things are low: 10 cm at a 0.3 m pad, 0.7 m at a 20 m roof.
  - Heights are rounded up, so a roof never reads low.
- **What counts as standing on the street is now 0.25 m, not 1 m.**
  Measured over 20 ground ports of kawartha, beaverton and driftwood,
  low surfaces near the cut's edge run without a gap:
  - kerbs and slabs at 0.05 to 0.15 m;
  - pad trims at 0.1 to 0.35 m;
  - landing pads at 0.6 to 0.9 m;
  - plazas at 0.7 to 1.6 m and at 1.6 to 3 m;
  - the lowest roofs near an edge at 4.0 to 4.6 m.

  No height separates an apron from a building. One metre fell inside two
  plazas, so one apron's cut had one edge on one side and two on the
  other. Counted, an apron has one edge, its own. 0.25 m is where the two
  lines would be under a pixel apart at 1.4 km, and above the 0.18 m that
  a flat slab rises over the curved street by curvature alone.
- The test now stands a block across the line of sight at a building's
  edge, one each way, and checks it is the sliced wall over the exit point
  and the band over the street point. It also walks street points past a
  block's corner and checks each is the sliced wall exactly where its own
  line of sight leaves the cone inside the block.
- Saves are unaffected.

### Fixed (2026-11-02, one burnt edge where a building stands on the cut)

- **Where a station building stands on the cut's edge, there is one burnt
  edge, not two.** From the hole outward you used to see the street's hot
  band, a thin dark strip (the street's scorched half, seen through the
  cut-away building), then the building's own hot and scorched band: the
  "double orange line" Astra rejected on 2026-10-26. Her call: the
  building's edge wins.
  - The street's band, and the lip's hot top, are now left out wherever
    one of the port's cut meshes (the model, its city, its dressing) stands
    over the street. Open street and the lip away from buildings are
    unchanged.
  - How: those meshes are drawn once more, straight down, into a 1024²
    footprint mask in the ground frame; only surfaces at least a metre over
    the world's sphere mark it, so the shaft and the hangar mark nothing.
    The mask is laid round where the cone crosses the street (about a metre
    a texel at Ashford from 1.4 km) and redrawn only when a mesh moves or
    the crossing moves by a quarter of the mask. The CPU cost per frame is
    a placement key per mesh.
  - **The strip under a building is the building's sliced wall.** In the
    first cut of this, plain street showed through the cut-away building
    between the hole and the building's band, and it read as a ledge. That
    strip is the building's wall where the cone slices it, seen from above,
    running from its roof down to the street. It is now painted look B's
    scorched plate and does not glow. The hot third stays where the
    building already has it, on the roof's cut, so a building reads as one
    wider burnt edge. The mask keeps each texel's tallest surface (MAX
    blending, 2 m steps up to 500 m). A street point counts as cut face
    where the line of sight, followed back up to the roof's height, was
    inside the cone.
  - **The lip under a building is scorched for the band's width, then
    rock.** Left as rock right up to the street, the wall's top beds showed
    instead: a pale bed 0.25 m deep, a pixel or less from 1.4 km. That bed
    was the broken light line along the strip's inner seam. It is gone at
    1.4 km and 2 km.
  - The scorched colour is one constant now (`CUT_SCORCHED`), written into
    the mesh shader and the wall shader alike.
  - The test stands a 20 m block on the street's hot band:
    - 100 m tall, the street there is the scorched cut face;
    - 10 m tall, it is cut face exactly where the cone takes the block's
      roof along the line of sight;
    - across the hole, in open street, the band is still there;
    - the same block sunk under the street changes nothing.
    It also checks that the cut face is the scorched colour, not hot and
    not glowing, that the lip under a building is scorched then rock, and
    that the mask's square covers the edge.
  - Saves are unaffected.

### Fixed (2026-11-02, the ground port's burnt edge, the horizon seam, the haze)

- **The cut through the street now has the glowing edge.** Astra: "why is
  the ground port cutaway not have the glowing edge effect?"
  - The port's meshes had the look-B band where the cone cuts them, but
    the planet's surface was only discarded inside the cone, and the pit
    wall had no band, so the edge stopped where a building met the street.
  - The street now gets the same band just outside the cone: the hot inner
    35%, which feeds the glow, then scorched plate. It uses the same width
    rule (6% of the cone's radius there) and the same colour. The pit wall
    gets the same band for that width in metres down from the street; below
    that it is rock strata again.
  - It is drawn in the pit-wall pass, not the planet pass, because the
    planet pass never writes the glow mask.
  - The test walks across the edge on the world's sphere round the hole at
    42 views and compares the street's band with the band the meshes get
    from the cut main.js hands them. They agree at every point.
- **The horizon seam is gone.** At Downwell the hazed ground was pale
  orange and the sky just above it grey-mauve, with a thin bright line
  between them.
  - The haze now runs all the way to the sky's own horizon colour (one
    function, `groundSkyAt`). Before, it stopped short at 92% of a colour
    86% as bright.
  - The planet's limb halo is no longer drawn under the ground sky. It was
    the bright line.
  - The haze reaches 1 at the **true** horizon, which from height is below
    the horizontal.
  - Largest row-to-row luminance step across the horizon, Downwell low
    angle: 69.6 → 3.9 at 0.6 km, 68.8 → 3.6 at 2 km.
- **Less haze from above.** At 8 km the Downwell frame was washed pink.
  - Haze now grows with the optical depth of the path through air that
    thins with height (6 km scale height), not with straight distance. A
    steep look down crosses mostly thin air; a grazing one crosses thick
    air all the way.
  - The rim haze, which treated every ray from near the surface as a limb
    ray, is off under the world's own sky.
  - Ground detail (std-dev of luminance after a 12 px blur is subtracted,
    side panels): 8 km straight down went from 1.73 to 2.07, against 2.17
    at 2 km. At 40 degrees: 2.50 → 3.10 at 8 km, 2.91 → 3.44 at 2 km.
    Plain std-dev at 8 km straight down went from 5.00 to 5.98; mean
    luminance went from 139.6 to 129.9.
- Saves are unaffected.

### Fixed (2026-11-02, ground ports inland: no shaft under the sea)

- **Astra: "placement needs to not ignore coastlines. All planetside ports
  should be set up far enough inland that no underground geometry
  protrudes into the water."**
  - Pads were rolled anywhere on their world and the sea was never asked.
  - Over the 450 kawartha systems, 302 of the 465 pads on worlds with a sea
    or a lava sea had their shaft and hangar at least partly in it. Kestrel
    Pads and Terminus Groundport were two of them.
- **The test for a site** (`Weather.dryAt`, `Gen.footprintDry`):
  - The footprint is a circle of 1.45 pad radii. That is everything a
    ground port can put underground, measured from the art: the widest
    ground site model is runway-city-site-s at 1.41 pad radii, the deep
    bay's tunnel is 1.35, the shed's corner is 0.75, and the walk deck is
    81 m.
  - The worst model is used rather than each port's own, so the answer is
    the same with or without a renderer loaded.
  - Every sample must stand at least 0.046 above sea level. That is the
    shader's soft coastline edge (0.035), plus the most gl.js's ground
    crinkle can ever move a coast (GD.elev / 2 = 0.010, a bound and not a
    sample), plus 0.001 of slack.
  - 25 samples: the centre, 8 at half the radius and 16 on the rim, all
    under 0.2 km apart. A 400-point disc agrees on every pad.
  - **Water is water**: a sea under an ice cap counts.
  - **Lava** is no-go too.
  - A **desert's** sea is a dry salt basin, so it counts as ground.
- **Moving a wet pad** (`Gen.placeInland`, right after the twilight fold
  and before anything reads a pad's position):
  - The pad goes to the nearest site that is dry, inside its twilight band
    if it has one, and clear of the world's other pads.
  - It is found by branch-and-bound over the cube-sphere. "Nearest" holds
    to within 0.25 km and 2% of the distance.
  - No draws are taken. A dry pad is untouched bit for bit, and nothing
    else in any system changes (ground.test generates with and without the
    pass and compares).
  - The rolled spot is kept as `port.movedInland {lat, lon, km}`.
  - 185 of 1,489 surface ports move. The median move is 1,436 km; 10% move
    less than 282 km and 10% more than 3,740 km (19 km to 7,385 km). That
    is 124 terran, 43 molten and 18 tundra.
  - The distances are long because the elevation field is smooth: about
    1.5e-4 per km. So 0.046 of elevation is roughly 300 km of ground, and
    the nearest ground that high is often across a sea.
- **Nowhere dry: 117 surface ports (7.9%) on 80 worlds, flagged
  `port.coastal = true` with `coastalWhy` and left where they were.**
  Astra decides what they get.
  - 102 are on ocean-type worlds, and every ocean-type world has no land
    at all. Sea level 0.78 is above the field's maximum, about 0.66.
  - 15 are on terran twilight worlds whose ring or band never clears the
    floor (best 0.03 above sea), though land does exist outside the band.
  - No system loses all of its pads to the flag.
  - By role: 38 orbital, 34 highport, 27 shipyard, 18 agri.
- **Everything that hangs off a port follows it**, because all of it is
  computed from `lat/lon` at run time: shaft, berth, approach, town, signs,
  traffic timetable, and the survey's mining province. ground.test checks
  the mouth, the berth, a moored trader and a moved mine's rich ground.
- **Cost:** generating all 450 systems went from 0.9 s to about 2 s. The
  worst single system is about 50 ms.
- **Tests:**
  - ground.test adds the inland section: dry footprints, flags with
    reasons, art inside the footprint, the dig margin covering
    `GD.elev / 2`, padDir agreeing with Sim, untouched pads, determinism
    and dependants.
  - galaxy.test's storm-salt collision check now keys on the whole salt.
    Weather is always loaded there now, and its salt32 has only 1,000,003
    levels, so one component of 4,000 draws repeats about 8 times by
    chance.
- Saves: survive, version unchanged. A pad's position is generated, not
  saved. A save docked at a moved port re-docks at its new site (docked is
  an id). A ship saved landed in the open keeps its own body-relative spot.
  A career that remembers where a port was will find it somewhere else.

### Fixed (2026-11-02, ground detail: the oblique streaks)

- **Cause of the diagonal smears in the upper half of Downwell's 0.6 and
  2 km frames: the sun-lit relief, not the octave fade.**
  - I measured it by switching each term off in turn. With relief off the
    streaks were gone; with brightness off they stayed.
  - Relief lit by one sun is the field's derivative along the sun's
    azimuth. The derivative of isotropic noise along one axis is a pattern
    drawn out across that axis, i.e. embossing, and the oblique view lays
    it over into diagonal streaks.
- **What changed:**
  - The slope's spectrum now falls off fast (0.78 an octave, was 0.92).
  - Each slope octave fades out at 2.5 times the footprint a brightness
    octave does, since a derivative aliases sooner.
  - The isotropic brightness mottle carries more of the detail (gain 0.9,
    swing 0.25).
  - Contrast is unchanged: standard deviation of luminance at
    0.6 / 2 / 8 km went from 14.3 / 14.1 / 11.8 to 14.6 / 14.3 / 12.4.
- **The fade's footprint is now exact and anisotropic**, as Astra's
  coordinator asked, though it was not the cause.
  - It comes from ray differentials: how far the hit on the tangent plane
    moves for one pixel across and one pixel down. The larger of the two
    decides.
  - The old estimate was t / (flen cos) with the cosine floored at 0.12, so
    it stopped growing within 7 degrees of the horizon. At the 40 degree
    shots the two agree to within a few percent.
  - The shader computes it analytically, not with dFdx/dFdy, because
    main() has already returned for some pixels of a quad by then.
  - `GLWorld.groundFootprint` is the JS twin, and groundport-look.test
    checks it straight down (t / flen) and at 3 degrees (t / (flen sin el),
    2.3 times the old floored value).

### Fixed (2026-11-02, ground ports: what the slabs were, and ground to stand them on)

- **The pink slabs over Downwell's town were the hatch lamps.** The ring
  of lamps that says whether the port has cleared you (red, or flashing
  green and white) was still laid out in pad radii for a shaft mouth of
  0.55, from before the mouth shrank to 0.20. The doors were converted to
  "mouths" at the time; the lamps were not. At Downwell (pad radius 227 m)
  that put twelve red boxes, each 23 m wide and 45 m tall, 160 m out from a
  45 m hatch, which is out over the rooftops. Through the orange haze and
  the glow pass they were the salmon-pink slabs with a pale outline on
  Astra's sheet. They now sit on the hatch's collar, a fifth of a mouth
  outside the opening, and are about 4 x 2.5 x 3 m: runway-light housings
  that read at a distance by their glow. They stand on the collar top on
  a procedural port and on the street (z = 0) on a modelled one.
- **The yellow squares were the pad-rim sodium lamps and the signs.** The
  rim lamps were 9 m glowing cubes. They are now 2.4 m housings, standing
  on the apron or street rather than buried in it. The signs were
  coloured slabs 25 to 60 m across on a 5 m post, with no lettering. Over
  ground with no detail in it, nothing said any of them stood on
  anything.
- **Signs are signs.** Each board now says what the generator always
  said it says, in Dressing.FONT's stroke letters, lit, on a dark backing
  panel. It is mounted on one of the town's own blocks: on its roof on two
  legs, facing the pad, or across the wall that faces the pad if the
  block already has a board. Letters are 1.6 to 4.5 m tall, sized to the
  building. Boards are at most 14 m tall and in practice up to 41 m wide.
  The role board breaks at its dash ("REPROCESSING / WASTE ACCEPTED"), and
  "&" is spelled out because the font has none. Placement reads only the
  dressing the generator already made. Nothing new is drawn from any
  stream, so every seed is unchanged. The first build came out
  mirror-written: the pad frame is left-handed (`Sim.groundBasis`, east x
  north = -up). The suite now checks with the game's own camera that the
  text runs left to right from the pad.
- **The ground has detail from 0.2 to 10 km up** (Astra: from 8 km over
  Downwell "the whole screen is flat orange"). The planet's terrain field
  is looked up at 2.6 cycles per world radius, so its finest octave is a
  couple of hundred km across. From a few km up the whole view lay inside
  one cell of it. The planet impostor now adds a body-fixed fractal field
  from 8 km cells down to 8 m: brightness mottling, a warm/cool hue drift,
  a small nudge to the elevation the coast and caps are cut from, and
  relief, where the field's own gradient is lit by the sun as slope.
  It is GPU only, in its own functions in gl.js (`groundDetail`,
  `groundDetailTint`, the `GD` table), with two call lines in the terrain
  block. The sky, the horizon, the cone and its strata are untouched.
  - **Seeded:** the hash is salted with the world's own `uSeed`. There is
    no Math.random and no stream draw.
  - **No pop from orbit:** every term is zero-mean, so averaged over any
    patch the colour is exactly the orbital colour. In the JS twin, a
    400 km patch averages to within 0.3%. Each octave also fades out as
    its cells drop below a few pixels, and the whole block is off above
    140 km.
  - **Local brightness:** a small patch is a hillside, not an average. The
    2 km round Downwell's pad is sunlit ground and reads about 18%
    brighter than the orbital colour, falling to 6% at 10 km and 0% at
    40 km.
  - **Precision:** the field is evaluated on an integer lattice anchored
    near the eye (`uGdAnchorCell`, exact), with the ray's near root taken
    as cq / (bq + sqrt(disc)) from a double-precision cq. Single precision
    cannot place an 8 m cell on a 5,000 km world otherwise. Re-anchoring
    gives the same ground cell for cell, so it cannot swim.
  - **Projection:** 2D value noise on a cube-map projection of the
    body-fixed frame, blended across the face seams.
- **Cost of the ground detail.** It was not measured on the Crawler; this
  workspace only has SwiftShader. Under SwiftShader, which runs the shader
  on the CPU, the whole frame went from 1.0 to 1.3 s at 8 km and 1.3 to
  2.5 s at 0.2 km. That shows the block's ALU is of the same order as the
  existing terrain, cloud and storm shading. The estimate for the RX 540 is
  about 4 hashes and ~80 flops per octave, ~7 octaves on an average
  ground pixel: ~0.4 GFLOP a frame at 1280 x 720, so roughly 0.5 to 1.5 ms.
  It is unmeasured; `GLWorld.setGroundDetail(false)` turns it off for an
  A/B on the Crawler. The CPU side is two rotations per world per frame,
  and nothing at all above 140 km. The first version used 3D noise with an
  integer-multiply hash and cost about twice as much; GCN runs a 32-bit
  multiply at a quarter rate.
- New test file `test/groundport-look.test.js` (group `view`) covers:
  - **lamps:** every lamp is under 6 m, outside its hatch and within 1.5
    mouths of it, on the right street;
  - **rim lamps:** under 3 m;
  - **boards:** every board is lettered, on a building, over its
    footprint, standing on its roof, sign-sized, and reads forwards;
  - **ground detail:** the field is deterministic per world, differs
    between worlds, has real variance close up and none once a cell is a
    pixel, averages to the orbital colour, is anchor-invariant, and is
    off above 140 km;
  - **wiring:** the shader is wired as the twin says.
- Saves: untouched. No generated data changed, only how it is drawn.
### Changed (2026-11-02, ground ports seen from outside, fourth round)

- **The pit wall is drawn per pixel, with no mesh** (Astra: the orbital
  cutaway is already per pixel, so do the walls the same way).
  - Built in JS, the wall was about 10,000 quads remade as the camera moved.
    In the probe it cost 7–22 ms a frame while orbiting Ashford Undercroft
    (0.2, 0.6 and 2 km, headless Chrome on the cloud box).
  - Now one full-screen pass (`FRAG_WALL`) casts each pixel's view ray
    against the cone (her end, widening toward the eye, held to a cylinder
    at the cap). Where the ray leaves the cone it shades rock and writes the
    hit's depth, so the bay and her composite against it.
  - The same probe now measures 0.01–0.02 ms a frame: uniforms only.
  - Above the street there is no wall, and none in the bay's open air. The
    layers are looked up from the hit's depth below the street, with the
    same tilt, fold and per-layer colour as before.
  - The bowl of rock round the pit is still a small mesh. It is rebuilt
    only when she moves or the boom changes size by a quarter.
  - `GLWorld.wallHit` and `GLWorld.wallFrag` mirror the shader in JS for
    the tests.
- **The rim is smooth.** The sawtooth edge round the hole at Ashford from
  0.2 and 0.6 km came from whole wall cells being dropped where they
  touched the room or the street. Both tests are per pixel now, so the edge
  is the true curve.
- **The cutaway toggle shows the outside** (Astra: "the cutaways should be
  toggle on/off so you can see the exterior of the station if so desired").
  - Off used to stop the camera at the wall. Now Off means nothing is cut.
    The camera goes out past the hangar wall once the eye would be outside:
    off the hull at a dock in orbit, above the street at a ground port.
    You see the station from space, or the port from the air with the
    ground whole, and her hidden inside.
  - Short of that, the walls still stop the camera. Inside the hangar, the
    room is still the view.
  - The Options row now reads "Off — see the outside, nothing cut".
  - New key: `` ` `` (backtick) flips the cutaway in flight. No other
    screen uses that key. It says which way it went and saves to prefs as
    before. The hint line shows its state while docked.
  - Added to FLIGHT-CARD.md and the H help.
- render.test:
  - wall hits from rays fanned round her lie on the capped cone, show only
    below the street and outside the bay's air, and a ray straight at her
    meets no wall;
  - a 0.2 m move does not rebuild the bowl;
  - with the cut off, an orbital berth and a ground berth reach 8 km with
    nothing cut and the eye outside; with it on, the same boom cuts again;
  - `` ` `` flips the cutaway and says so.
- Not saved beyond the existing prefs field; no save change.

### Fixed (2026-11-02, ground ports seen from outside, third round)

- **The sky has its own colour, and there is a horizon.** On Oruun the sky
  took the same orange as the air, the halo and the ground, so from the
  street the deck ended and orange carried on. Now:
  - By day the sky is the air tint carried most of the way to a scattered
    blue-white.
  - It is a gradient: palest at the horizon, darker toward the zenith, with
    a soft glare round the sun. Dusk warms the low sky on the sun's side;
    night and airless worlds are dark, as before.
  - It is drawn as its own full-screen pass behind everything
    (`GLWorld.drawGroundSky`).
  - The ground hazes into the horizon's colour with distance, a shade
    darker than the sky, so the horizon is a line (`groundHaze`).
  - Measured from the street at Downwell at 3 km: sky L* 77 against ground
    L* 58, hue 349 degrees against 14, deltaE 49. With the sun forced lower,
    deltaE is 39 at 9 degrees, 22 at 2 degrees, 14 just after sunset and
    5.5 at full night, where both are near black and only the stars tell
    them apart.
  - The sky and the haze are their own GLSL block and function (`SKY_GLSL`,
    `groundHaze`), mirrored in JS by `GLWorld.skyAt`.
- **The pit wall reads as cut rock, not a vortex.**
  - The 48 flat facets each lit at their own angle were the spokes. The wall
    now shades smoothly through per-vertex normals: `uploadMesh` takes an
    optional `vn`, and an optional `vcol` for per-vertex colour.
  - Down a near-level cone, the beds traced across the generators had
    become long slivers. The wall is now a grid of 104 generators by 64
    rows, each face coloured by the bed it is in. Cells a bed edge crosses
    are split 2x2 and blended per vertex.
  - The beds dip one way per port and fold together about 22 m on a 140 m
    wavelength. Each bed's colour is nudged per bed. All of this comes from
    a hash of the port's id, so the same port shows the same rock every
    visit.
  - The black cap past her is gone. The pit is set in a bowl of rock under
    the street, sunk with the planet's curve. Anything that misses the wall
    and the bay meets rock; up is still open to the sky.
- **No crater from far out.** The cone stops growing at the street: its
  radius is held to the lesser of its width there and the bay's footprint
  (the room's half-diagonal plus a hull). It is a cylinder from there on,
  in the shaders and in the wall alike. At Ashford from 2 km the hole went
  from about 1 km across to the bay's size, about 0.7 km.
- render.test checks:
  - the street hole is no wider than the bay;
  - the cone is held to the bay whenever the eye is above the street;
  - a hull's width round the whole sight-line to her stays cut at every
    angle swept;
  - the sky is paler and bluer than its air, and darker at the zenith than
    at the horizon;
  - every wall face lies on the capped cone, below the street and outside
    the bay's air.
- The wall is rebuilt only when the eye has moved 0.8% of the boom. A
  rebuild measured 6-30 ms in headless Chrome on the two-core cloud box;
  not yet measured on the Crawler.
- Not saved; no save change.

### Changed (2026-11-02, ground detail and biomes, second pass)

- **No more directional grain.** At Downwell from 0.6 to 8 km the ground
  read as brushed metal or diagonal rain. Every octave shared one
  axis-aligned lattice, and each added the same directional bias.
  - Each octave is now turned by its own golden-angle rotation.
  - The anchor stays exact: JS turns it by the same angle in double
    precision and hands the shader an integer cell and a fraction per face
    and octave (`uGdCell`, `uGdFrac`).
  - The JS twin does the same, and the anchor-invariance check still
    passes.
- **No camouflage.**
  - The clamps on brightness and relief are now soft limits,
    x A / (A + |x|). A hard clamp turned every overshoot into a flat
    plateau with a hard edge.
  - The swings are capped, and fine-octave slope is reduced.
  - Bright ground (snow, ice, salt) gets 30% of the detail, and what
    darkening remains turns blue-grey.
- **Measured contrast:** standard deviation of luminance, 0–255, over the
  top 280 rows of the same shots.

  | Shot | Master | First pass | Now |
  |---|---|---|---|
  | Downwell 0.6 km | 12.8 | 17.0 | 14.1 |
  | Downwell 2 km | 10.0 | 14.2 | 13.7 |
  | Downwell 8 km | 10.1 | 16.7 | 13.1 |
  | Downwell Downport ice, 2 km | 2.3 | 27.1 | 4.8 |
  | Downwell Downport ice, 8 km | 17.4 | 26.0 | 17.5 |
  | Low Deep 8 km | 13.5 | 24.9 | 17.1 |
  | Ashford 8 km | 6.3 | 20.5 | 9.4 |
- **Mountains follow ridges.** Rock and snow are cut from height plus a
  ridged noise, so a high massif is ranges and crest snow, not a round
  white hole (Kawartha star 11).
  - Rock is now a darker, greyer version of the ground it stands in. A
    desert's mountains no longer read as grey stains from orbit.
- **Tundra is lichen, not olive.** The polar and cold rows of the colour
  grid are grey-green-brown, and a tundra world runs 0.1 colder.

### Added (2026-11-02, biomes)

- **Earthlike biomes** (Astra: "Can we also have some more earthlike
  biomes on planets?"). The land on terran, ocean and tundra worlds, and
  more lightly on deserts, is split Whittaker-style by temperature and
  moisture.
  - **Temperature** comes from the world's insolation
    (`warm` = 0.62 + 0.30 log2(insolation), measured against the range
    across 40 systems), cooled by latitude off the real spin axis and by
    height on the mountains.
  - **Moisture** comes from distance to the sea plus a low-frequency
    noise field.
  - **Colour:** a 4 x 3 colour grid interpolated bilinearly, with wetland,
    bare rock and snow on smooth ramps over it, so nothing meets at a
    line. Each world's own colour tints it a little, and per-type
    blending means a desert keeps most of its sand and a tundra its cold
    grey.
  - **Twilight worlds** take the biome as their band's living colour.
    Green appears only in the band: the suite checks 2,749 green samples
    in the ring and none outside it, over 26 terminator worlds.
  - **No biomes** on rocky, molten or iceball worlds, or on giants.
- **One copy, two languages.** `Weather.BIOME` holds the table and
  `Weather.biomeAt` the arithmetic. gl.js builds its GLSL (`biomeColour`)
  from that table at load. `terrainAt` now also returns `biome`, a name
  such as taiga, savanna, ice cap or wetland. Nothing in gameplay reads it
  yet.
- **Ground detail and biomes.** Up close, the ground detail multiplies
  the biome colour and nudges the moisture, so biome edges are ragged at
  ground scale (this part is shader-only and zero from orbit).
- **Distribution** (test/biomes.test.js, 261 worlds, four galaxies):
  - **Terran land** (11.9% of the surface; the rest is sea, as before):
    taiga 28%, ice cap 16%, tundra 16%, temperate forest 13%, mountain 9%,
    wetland 9%, grassland 4%, snowfield 3%, rainforest 1.4%,
    savanna 0.9%. It runs boreal because the median terran gets 0.69 of
    Earth's sunlight.
  - **Desert:** desert 84%, ice cap 6%, savanna 5%, mountain 2%.
  - **Tundra:** tundra 45%, ice cap 33%, snowfield 11%, taiga 6%.
- **Nothing the survey reads moved.** Elevation, sea and ice from
  `terrainAt` are bit-identical (checked on 4,000 points). The survey,
  ground, claims, mining, prospectors, farms and weather suites pass
  unchanged.
- Found while measuring: **a desert's "dry basins" never appear.** Their
  level is 0.16 on the elevation field, and the field's 1st percentile is
  0.294. This was already true before this change and was left alone.
- **Cost:** one more 4-octave fbm per planet pixel on biome worlds,
  against the eight the terrain and cloud shading already pay.
- New test file `test/biomes.test.js` (group `ground`).

### Fixed (2026-11-02, ground ports seen from outside, second round)

- **The ground-port view was upside down.** The first round's camera frame
  took `Sim.groundBasis` as it is, and that basis is left-handed (its north
  is east x up), so the picture's up pointed into the ground: sky at the
  bottom of the screen, the near side of the pit at the top. Found from
  Downwell Starport at 8 km as "a V in the sky". The camera's frame is now
  right-handed (north = up x east). render.test now checks that the
  picture's up is the ground's up, and that check fails on the old frame.
- **The cut is a cone, and it cuts only what is in the way** (Astra: "the
  pit walls should appear along the cone drawn from the center of the
  radial camera out to the edge of the screen; and the 'laser cut' effect
  should only be drawn instead of whatever is in between the ship and the
  camera"). The square section is gone. A ground port is cut the way an
  orbital dock is: one cone round the line from the eye to her, a hull
  length of clearing at her end, widening by the same 20 degrees toward
  the eye. The port's meshes go only inside it (the keyhole, hot rim and
  all, with her deck kept on the ground's vertical). So the shaft collar,
  the apron, the town and the rest of the hangar draw whole round the hole.
  The planet's surface goes where the cone crosses it, in the same test.
- **The pit wall is the cone's own surface**, drawn as rock wherever it is
  in the ground. It is clipped at the street and left out where the cone
  runs through the bay's open air. Its strata are horizontal planes, so
  they run level round the pit. It is capped just past her, so a ray down
  the cone meets rock. From the camera the wall runs from her at the
  middle of the screen out past the edges.
- **Daytime sky in the cut** (Astra: "put daytime sky when looking up out
  of the cut"). The game had no sky as seen from the ground: rays that
  missed the planet fell through to near-black space. In the cut, the
  frame now clears to a sky built from the same two numbers the planet's
  halo already uses: the world's air tint and how much air it has. That is
  lit by the sun's height over the port. Day is the tint, a low sun warms
  it toward dusk, and below the horizon it fades to night over a few
  degrees. Airless worlds stay black. There are no stars by day. It is one
  flat colour, with no gradient.
- **The shaft's hole in the planet has round rock walls** down to its
  floor, in the same beds, instead of a flat floor that read as a grey
  disc from the air.
- render.test, "the ground under a ground port", is extended:
  - the picture is the right way up;
  - the cone narrows to her, and its middle is cut, while a point beside
    it and the deck just past her are not (`GLWorld.coneCuts` mirrors the
    shaders, whose text is pinned to the same expression);
  - every pit-wall face is on the cone, below the street and outside the
    bay's air;
  - the sky over the port is the world's air in the sun, and black at
    night or on an airless world;
  - the hole in the street is no wider than the cone there.
- Not saved; no save change.

### Changed (2026-11-02, the test suite in groups)

- **`npm test` runs the suite in ten groups** (Astra: "if the full test
  suite isn't running, we have to break the tests into various suites").
  It was one 79-command `&&` chain: it stopped at the first red file, hid
  everything after it, could not run only the part a change touched, and
  when `berths.test.js` was killed for memory beside two headless browsers
  it said nothing about which file or how big. `tools/run-tests.js` now
  runs `core`, `render`, `view`, `berths`, `ships`, `transfer`, `combat`,
  `economy`, `ground` and `story`, each file in its own process and one at
  a time, reporting every file's time and peak memory; a red file does not
  stop the rest, and the summary names every one. `npm run test:<group>`
  runs one group, `npm run test:list` shows them, `--stop` stops at the
  first failure. Every test file must be in a group — an ungrouped one
  fails the run before anything starts.
- Measured on the first run (79 green, 7 m 19 s): `transfer.test.js` peaks
  at 2.2 GB, `berths.test.js` 2.2 GB, `render.test.js` 1.1 GB; nothing else
  passes 0.75 GB. Those three are groups of one.

### Added (2026-11-02, the drive on the ground)

- **Starting her on open ground.** Astra: "we also need a means of
  starting our engine and launching off the surface when we land away from
  a port, like for setting up a mining drone." The way off was always R
  with enough thrust to beat the world, but nothing said so once the
  touchdown message had faded, and a drive that was always running could
  not be seen to start. Now a touchdown away from a port shuts the drive
  down, and a strip under the heading tape says so for as long as you sit
  there (first placed at the canopy's foot, where the screenshot showed it
  printed over the key hints and the message line): **ON THE GROUND
  · DRIVE COLD · R TO START**. The first R (or W with her nose to the sky)
  starts her: three seconds of real time winding up, a bar filling on the
  band and the drive heard spooling, which runs to the end once begun.
  Then **DRIVE HOT · HOLD R TO LIFT**, and R lifts her exactly as before.
  Held straight through from cold, she lifts the moment she is hot, so
  "hold R" is still the whole instruction. Leaving the seat — walking out
  to plant a drone — shuts her down again; so does loading a save on the
  ground. Refusals say why: no reaction mass ("the drive has nothing to
  light"), and W with her nose level ("W would push her along the ground —
  R lifts her straight up") instead of doing nothing at all.
- **The ramp check now covers open ground too.** It was only asked on the
  no-spot branch; a ship set down on open ground lifted with her ramp
  hanging open.
- The drive's state is transient (cold is the truth of a ship that has
  been sitting on the ground), so nothing is added to the save. No save
  change.
- render.test: "the drive on the ground" — touchdown is cold and says so,
  R starts rather than lifts, the start completes with R let go, hot R
  lifts, and R held from cold is still down at 2.5 s and up by 3.5 s.

### Fixed (2026-11-02, station cutaway)

- **Zooming out of a berth reaches the outside again, with your ship in
  it** (Astra: "the station cutaway thing should allow me to zoom out and
  view the station from the outside, and show my ship. This isn't working
  now ... even for planet side stations"). Since the walking deck's hangar
  became the chase view round a berthed ship (2026-10-31), its walls
  clamped the boom every frame — measured at 21 m at Waypoint Dock and 6 m
  at Ashford Undercroft, whatever the wheel asked — and the station's own
  model was not drawn, so there was no outside to reach. Now the hangar is
  the view until you wheel past its wall (8% over its reach); from there
  the camera belongs to the station as it does in flight: the cutaway
  opens the hull round her at an orbital dock, the street section opens the
  ground over her at a surface or underground port, and further out it is
  the station from space or the port from the air. Her hangar deck is still
  drawn round her, cut the same way, so she stands on a floor rather than
  hanging in the bay's box. Wheel back in under 92% of the reach and the
  hangar is the room again (two thresholds, so a boom resting on the wall
  does not flicker). Not saved; no save change.
- **The street section is only as big as it needs to be.** It grew with
  the camera's distance so the eye was never inside solid ground; zoomed
  out over a port that made a pit kilometres across, with the stars
  showing through the planet. Once the eye is above the street the
  section only has to clear the line of sight, so it takes the sight-line's
  offset where it crosses street level — about 0.6 km over Ashford
  Undercroft's 860 m-deep bay at 8 km out, where it was over 4 km.
- render.test: "zooming out of her hangar" — leaves the hangar, reaches
  8 km, the station is cut round her, the street section stays small, and
  wheeling back in restores the hangar clamp. It fails on the old build.

### Fixed (2026-11-02, ground ports seen from outside)

- **Zoomed out of a ground port, the camera stands on the ground.** Astra's
  sheet from Ashford Undercroft showed the hangar floating in black space
  with stars under it, a dark trench, huge striped walls, a pale-blue slab
  and her ship a speck. One cause under most of it: the camera's yaw and
  pitch were angles against the star system's axes, and a port on a planet
  has its own vertical wherever the planet's spin has carried it. At a
  ground port the boom is now measured in the ground's own frame
  (`Sim.groundBasis`): yaw round the local vertical, pitch above the local
  horizon, and the picture level with the street. Handover into and out of
  that frame converts the angles, so the view does not jump.
- **Once the boom can reach the street, the eye is above it.** Same
  closed-form arc as the deck clamp, round the local vertical, with a
  margin that grows with the boom (5 m at the least, about 4 degrees down
  on a long shot). Shorter than that — Ashford's bay is 860 m down — the
  eye stays in the section, which is built round it and her, so the walls
  between the camera and the ship are always cut away. Between half that
  length and all of it the allowed arc closes onto the vertical, so wheeling
  out cranes the camera up the cut and out through the top of it.
- **The surface is only there when you are above it** (Astra). Under the
  street the port is lit as indoors (the pale slab was the shed's wall lit
  by the sun 860 m underground), the town is not drawn, and what the
  section's walls do not cover is rock, not stars.
- **The shaft's hole in the planet has a floor**, at the bay floor's depth
  in the section's rock colour, so looking down an open pad from the air
  is no longer a black disc with space showing through the ground.
- **The rock beds in the section's walls thicken with depth**, from 5 m to
  at most 60 m, so a deep wall is a few strata rather than a moiré of 170
  stripes. **She is bracketed** when a cutaway is open and her hull is
  under 28 px on screen. The ecliptic grid is not drawn at a ground port.
- render.test: "the ground under a ground port" sweeps a deep bay (Ashford
  Undercroft) and an open pad (Downwell Starport, Oruun) across three
  elevations, two azimuths and booms of 0.05 to 8 km: the frame is the
  ground's, the eye is above the street whenever the boom reaches it, under
  the street the eye and the ship are both inside the section box, and the
  planet is drawn under the site with a floored hole. The draw itself
  (town, indoor light, rock sky) is pinned to the same predicate rather
  than observed, because the stub canvas never reaches a port's model. Not
  saved; no save change.

### Fixed (2026-11-02, deck fixes)

- **The glitchy bar door** (Astra, on Downwell Bunker's concourse: "this is
  the bar; the door is glitchy"). Every pair of rooms that share a wall
  built that wall twice in one plane — the concourse's at x = -13 and the
  bar's — and the GPU culls nothing, so the light concourse wall and the
  dark bar wall fought for every pixel round the doorway and shimmered as
  you moved. It was true of every shared wall on every station deck; the
  bar was where it showed worst. In the deck's GPU mesh (`Walk.meshFor`)
  each room's walls now stand 6 mm into their own room, so from inside a
  room its own wall is always the nearer. walk.test: "no two rooms' walls
  are drawn in the same plane" (it found 50+ fights before).
- **The Crawler's lift is inside her hull** (Astra: "fit the lift in the
  crawler to the hull"). The car sat straight aft of her lift lobby, which
  put the shaft where her lower decks pass a gap in her frame, and on the
  main and junction decks it ran a metre outside her plating — the fit
  test carried an exemption for it. Measured over all three decks at once,
  a centred shaft fits from 10 m aft of the bridge door to 20 m, so her
  lobby is 2.1 m longer (`LOBBY_EXTRA` in shipdeck.js) and the shaft stands
  at 9.4-11.3 m. The exemption is gone: boarding3's "no room stands outside
  her skin, on any hull" now covers the Crawler's lift, and fitting took
  nothing away from any hull.
- **Every cockpit at its canopy glass** (2026-11-02). Astra, of the Talon:
  "the cockpit on the starting ship is recessed into the block that juts
  out with the cockpit glass on it ... it should be cut into the nose
  block"; asked which block, she chose the jutting one, a step up from the
  passage; then "the cockpit fix should apply to all ships IF the glass
  isn't the forward-most part of the cockpit." The cause: `fit-hulls`
  puts the eye at the lowest point her deck fits, for a short ramp, and
  never looks at the glass, so the Talon's pilot sat a metre aft of the
  canopy and level with its bottom edge, down in the wedge under the nose
  block with its sloping skin through the room. Moving the whole deck does
  not fit (her passage comes out of the block's top), so the cockpit alone
  moves: a room may now carry a floor of its own (`y0`), and a hull in
  shipdeck.js `RAISED` has her cockpit `rise` up (or down) and `fwd`
  forward, a stair of a few treads aft of it down to the bridge door on
  the deck (`stairMesh`), and the rest of her deck exactly where it was in
  her hull. `ShipDeck.floorAt` is the floor under you; the walker climbs
  the stair (main.js `stepWalk`), her people stand on it (npc.js), the
  door leaves, bulkhead and rear screens are at the stair's foot, and her
  windows from outside cut the well round the raised room. The Talon's eye
  is now 0.5 m up and 1.2 m forward, behind the glass, its floor on the
  block's underside. `tools/fit-raised.js` measured every hull's canopy
  box against her cockpit and found the raise for each: raised (or
  levelled and moved forward), the Talon, Dart, Kestrel, Wren, Longhaul
  and Syndicate Enforcer; down a stair, the Sump, the Hawser Heavy Tug,
  the Tallyman and the Lance (their glass is below the old eye); moved
  aft, the Bollard (her windscreen stood ahead of her glass). Left alone:
  the Samaritan and Heron (already at their glass); the Coldwater Tanker,
  Naval Cutter, Corsair Runner and Syndicate Heavy (their glass box is
  off-centre or aft, not a canopy); the five decked and towered hulls
  (their cockpit is a deck reached by lift); and the Mule, which
  qualifies but whose bridge deck comes out of her skin at every eye
  tried. New `test/nosecockpit.test.js`: each raised eye within 0.5 m of
  its glass, the cockpit inside her but its windscreen, every other room
  where it was, no jump on the stair, and every other hull unmoved.
  **Saves survive**: nothing saved changes.

### Added

- **2026-11-02 — Choose your start: difficulty, then focus** (`start.js`).
  Astra: "I also want to be able to select the ship I start with based on
  what I'm wanting to focus on - trade, mining, combat." New career now
  asks how hard, then at what (skipped on Hard), then the seed, as rows on
  the title card; every row names the hull and the credits, with the
  hold, the guns and the kit on the line under it. Pointers (▸ ◂ ▲ ▼) are
  the direction cues, not words.
  - **Easy** (107,600 cr of ship and cash, any focus): trade = Tallyman
    Trader, intermittent + pulse, shield, trade analyser, 15,000 cr;
    mining = Sump Waste Hauler, mining laser, survey scanner, shield,
    16,200 cr; combat = Dart Interceptor, beam + pulse, shield, four Hawk
    seekers, 30,720 cr.
  - **Normal** (71,400 cr): trade = Talon Courier, pulse, trade analyser,
    shield, 20,500 cr; mining = Bollard Tug, mining laser, survey scanner,
    shield, 6,000 cr; combat = Lance Fighter, beam + intermittent, four
    Hawks, 11,520 cr. The Lance carries no shield because one will not go
    in: a generator is 4 t of her 6 t fit budget, and with it aboard there
    is room for no gun (the test pins the refusal).
  - **Hard** is the career as it always was — Talon, pulse laser,
    3,200 cr — and is not a preset at all: no plan, the old path, line for
    line (the test compares it field for field with a career started with
    no choice).
  - Value is hull + fittings + seekers at list, plus cash; the dearest
    kit at each difficulty gets the floor (15,000 easy, 6,000 normal) and
    the others the difference, computed rather than written down so a
    repriced laser cannot make one focus richer. Every hull still gets the
    standard scoop and cruise drive.
  - Where: trade docks where a career always has; mining at the nearest
    mining head (all are Guild halls), from the home world — 26 of 30
    measured home systems have one, and the other four start at the
    nearest unrestricted star that does; combat at the nearest shipyard
    (15 of 30 homes), else the best-developed port. No random draws, so
    the same seed starts at the same port. The pad says what the focus
    set you up for, and the full line goes in the captain's log as CAREER.
  - The choice is saved as `start: { difficulty, focus }`, additively; no
    save-version bump, and an older save loads with none. `test/start.test.js`.

- **2026-11-02 — The mass driver** (`massdriver.js`). A coil gun, and the
  first weapon that has to obey the game's physics. Astra's ruling on
  shields: "50% of the slug's damage to the hull and 50% to the shield ...
  residual static charge on the projectile after electromagnetic
  acceleration" — so half of every hit is charge a shield can catch and
  half is a slug it cannot (`split` in `splitDamage`; charge the shield
  cannot hold goes through too). The rest are Claude's first numbers:
  - **It travels**: 8 km/s on top of your own velocity, no falloff, 30
    damage every 1.6 s. Nothing is hit when you fire; it lands when its
    flight says, and a miss flies on for 20 s (160 km) and can hit the next
    ship along the line.
  - **A lead pip**: with a driver fitted and a ship locked, a diamond at
    the intercept point, a dashed line to it from the target, and the
    slug's flight time. Nothing when they are outrunning a slug.
  - **Recoil**: every shot pushes you back down the nose by the slug's
    momentum over your mass — about 2 m/s a shot on a 95 t Kestrel.
  - **Ammunition with mass**: slugs ride in the hold, 25 kg a round, forty
    to the tonne, 480 cr a tonne at any outfitter while a driver is fitted.
    Dry, it clicks and says where to get more.
  - Runs cool (3 heat a shot), its own sound, a white-hot slug drawn where
    it actually is with a short streak of its motion relative to you, and a
    spark where it strikes. 7,400 cr, needs development 0.5.
  - It carries the time its position is for, so a slug fired inside a frame
    is never tested a frame behind (the hunters' and torpedoes' bug).
  - A missed slug never goes on an orbit: Astra ruled it out ("we could
    very quickly end up with a Kessler syndrome"). Rounds are frangible —
    the charge cracks them to dust after their 20 s.
  - **Syndicate and navy only** (Astra: "mass drivers are a syndicate/navy
    only weapon"). Sold on the Syndicate's own turf to anyone they trust
    (50+), and in lawful space only where the navy keeps an armoury — a
    fleet carrier, or a shipyard in a system with a naval garrison — to
    50+ standing with that faction; nowhere else is it on the shelf.
  - **They carry it**: the navy (hunters included) and the Syndicate's
    enforcement wing fire slugs instead of their lasers — 26 a round every
    1.8 s, led at where you will be, with a gunner's spread that widens the
    faster you cross their sight. A ship that holds its course is hit; one
    that jinks after the shot is not. Their slugs are tested against you
    only. The enforcers' muon beam is retired; scanners read "mass driver".
  - test/massdriver.test.js (22 checks): the split, recoil, the round spent,
    travel time, the gap coasted, a crossing target missed when aimed at
    and hit when led, buying slugs and every refusal.

### Changed

- **2026-11-02 — The market review, part two: every port has a signature.**
  Astra asked that every port have a major and a minor import and export.
  Measured, almost all already did; the real fault was the other end — half
  of all ports listed 8+ imports, a third 8+ MAJOR ones, so the board stopped
  saying what a place is. Now, as the last market pass of every system
  (`Economy.applySignatures`, after fuel haulage, the giant plants and the
  licence, which all rewrite rows):
  - by trade value, the top export and top import are the port's MAJOR
    (full price signal, held to at least 0.78x / 1.22x base), the second on
    each side its MINOR (0.88x / 1.12x), and everything else keeps 40% of
    its signal: still made, still sold, priced near list;
  - **essentials are never softened as imports**: food (grain, livestock,
    fish, fruit), fissiles for the reactor and hydrogen keep at least minor
    strength wherever a port needs them;
  - a port short of two on a side promotes the row that leans hardest that
    way; a skimmer (hydrogen and nothing else) flips the need it comes
    closest to meeting into a minor export. Measured after: 0% of ports
    with no major export or import, 0.7% with fewer than two exports (pure
    consumers with nothing made to promote), 0% with fewer than two imports;
  - the market screen prints it beside the name: EXPORT / IMPORT in capitals
    for the major, lower case for the minor, "needs" for an essential.
  - Founded stations get the same pass.
  - Computers were still a glut (41% of ports made them, 14.5% bought):
    mining heads, refineries and reprocessing plants now buy them. 50% now.
  - The market colours' cut-offs re-measured the same way (sixty systems,
    quartiles and twentieths): an ask is news under 0.73x base (was 0.50x),
    a bid over 1.34x (was 1.62x). The economy tests' ramp checks now read
    the ramp's own ends rather than the old numbers.
  - `holdings.js` KIND_MEDIAN re-measured again (books read `local`).

- **2026-11-02 — The market review, part one (Astra: "do a meta-analysis
  of our current market and suggest changes", then "start on your
  recommendations").** Measured over 3,043 ports in 229 systems with the new
  `tools/measure-markets.cjs`; the review itself is `claude/market-review.md`
  in the project.
  - **Seven goods had no buyer anywhere** (livestock, timber, fish,
    textiles, fusion cells, AI cores, gene therapies), so they could only be
    sold back to a producer. Now: livestock and fish are eaten past
    subsistence (dev > 0.45), most at highports and carriers; timber builds
    developing worlds (0.2-0.65); textiles go anywhere with people; fusion
    cells go to shipyards and carriers; AI cores to shipyards and highports;
    gene therapies to farms (seed stock) and highports; medical supplies
    also to mining heads and refineries, where people get hurt. Every one
    of them now has buyers at 7-50% of ports.
  - **AI cores and gene therapies are thin buyers**: a 24 t shelf floor and
    a price ceiling of 1.12x base where they are newly wanted, because at
    the ordinary rules they measured 2,669 and 2,448 cr/t of margin, double
    luxuries. Now 1,745 and 1,656, beside luxuries' 1,589.
  - **Farm machinery is a farm import again.** The test was "has a grain
    row", which every port has (everyone eats), so 98-100% of mining heads,
    refineries and reprocessing plants bought tractors. It now asks whether
    the world can farm.
  - **Shipyards buy hull metal.** They were biased to make alloys and 99.6%
    exported them; now every yard imports alloys (1.8x the old draw as
    appetite), and a younger yard (dev < 0.7) buys ore as well.
  - No seed's universe moves except through these rows: every new amount is
    the port's own hash, rows this creates take their shelf numbers from
    the hash too, and the farm and shipyard draws are still taken where they
    always were.
  - `holdings.js` KIND_MEDIAN re-measured against the new books (shipyard
    3.45 -> 0.91, farms roughly halved, reprocessing up); distress is still
    7.5% of plants in clean systems against 24.1% in corrupt ones.

- **2026-11-01 — Pirate space has a comsat (Astra: "pirates should have
  the comsat for the syndicate that runs their territory").** A pirate band
  runs no police, so a pirate-held system had no authority channel at all,
  and the mayday, the tow and PLANT in COMMS went with it. The band answers
  to the Syndicate it is parented to, so that Syndicate's comsat is now the
  channel there: status and standing, settling what you owe it, both
  maydays, the tow and PLANT. The Syndicate's own systems had the same hole
  and get the same channel. One channel per Syndicate, and only where it or
  one of its bands holds a port. It does not take crime reports. (screens.js
  `commsContacts`; render.test "the Syndicate comsat".)

- **2026-11-01 — Weapons fire, by kind (Astra: "for the pulse and
  intermittent laser, we want bolts. For the beam laser we want a beam").**
  A pulse laser fires one bolt; an intermittent fires a burst of three; a
  beam laser (the mining laser included) is a continuous, thicker beam with
  a white-hot core, a wide halo and a slight flicker, glowing at the
  emitter and at whatever it is burning. Every bolt now has a white core,
  a bright knot at its head that shrinks as it flies (from the seat a bolt
  is at the crosshair within a frame, so the knot is what the eye follows),
  a muzzle flash as it leaves, and a flash and a spray of sparks where it
  lands. A beam held on a hull or a rock sprays the whole time; stone
  throws orange sparks whatever the beam's colour. A miss throws nothing.
  From the seat the muzzle flash spills up over the instrument deck.
  (main.js `drawCombatFx`; `Render.boltRibbon` takes a width cap so only a
  beam is allowed to be fat.)
- **NPC guns fire visible shots.** They had no birth time and a 70 ms life,
  so what showed was a stub a few percent out of the barrel. Pirates and
  freighters now fire pulse bolts, the police fire bursts, the Syndicate's
  enforcers and the navy (hunters included) fire beams; station batteries
  and your point-defence turret fire bolts. Picture only: the field is `fx`,
  not `variety`, because a gun's `variety` feeds the thermal split in
  `damagePlayer` and would have changed what their hits do.
  (`Combat.shotFx`, `Combat.npcShotVariety`.)
- **A shot at you is drawn from the seat.** It ends at your eye, which
  projects nowhere, so incoming fire was skipped in the cockpit and only the
  canopy flare showed. It now stops 60 m short and comes at the glass.
- **2026-11-01 — You can see your shield (Astra: "what effect do we have
  to show that there even is a shield around our ship?" — none, until it
  was hit; she chose all four of these).**
  - From outside, your own field shows as a faint skin whenever it is up,
    fainter as it drains. Other ships stay dark until hit, so whether a
    stranger carries a shield is still yours to find out.
  - It ripples over the hull from the nose when it comes online and again
    when it finishes recharging (the impact curve, pointed down the nose).
  - From the seat, a thin line of the field's colour runs round the inside
    of the canopy while it is up: blue full, through violet to dull orange,
    gone when it is down, brighter for a moment after a soaked hit or as it
    comes up.
  - The screen's hit flinch is red only when something got through to the
    hull. A hit the shield soaked whole flinches in the field's colour;
    before, the red drowned the blue flare that said it was holding.
- **Explosions have a fireball** under the shock rings, white at the heart
  and cooling to orange. A rock torpedo's lasts 1.6 s against a kill's 0.9.

### Fixed

- **2026-11-02 — The long white-blue bar on take-off.** Astra, climbing off
  Unysh IV b: a tapered white-blue bar detached behind the hull. It was a
  police cutter's bolts. Every NPC tracer froze both ends in absolute space
  at the instant of firing — harmless while a tracer lived 70 ms, and a
  disaster once the 2026-11-01 weapons pass gave it 0.62 s to fly: a moon
  carries both ships about 3 km a frame, so the bolts were drawn up to 30 km
  from either ship. Now both ends are live, as the player's own beams have
  been since the 25x-warp fan: the near end is the shooter's live body, the
  far end the ship it was fired at (your own, when it is you), and a muzzle
  with no body (a station battery) rides with the fight's frame
  (`Combat.shotFx` opt `{ src, t, fromVel }`; NPC fire at you, NPC against
  NPC, the turret's point defence and station batteries).
  combat.test: "an NPC's tracer stays on both ships".

- **2026-11-02 — The transfer to the exit pad went through walls in every
  procedural shed.** Astra: "the ship just clipped through walls instead of
  following the internal geometry of the station". The shed's rail took a
  45-degree incline by default, because that is what the modelled cargo
  lifts are — but nothing ever set the incline, and the shed render.js
  draws is a vertical duct over a hall 0.42 pad radii wide. So the foot of
  the shaft was four pad radii outside the hall, and the hull spent the
  drop and most of the traverse in rock. The shed's lift now goes straight
  down its own duct (`arrivalPath`); the modelled sites keep their own
  routes. `transfer.test.js` samples every pose under the ground against
  the duct and the hall.
- **2026-11-02 — No car in the lift shafts.** Astra, with a screenshot of
  a hull hanging in a shaft below the yellow platform meant to carry it:
  "no elevators in internal elevator shafts ... this needs fixed". Two
  causes. In orbit, a route that rides a lift across (the cylinder's bores,
  the cradle's and the skimmer's hoists, the spine's) boarded at the
  converter's corners, which are the shaft's air. The car can only go where
  the art's travel lets it, so it stopped as much as 0.42 radii above the
  hull. The ride's two corners are now seated on the car itself, standoff
  above its top (`Sim.seatRide`). The keel the renderer puts the car under
  is now the rail's standoff, not a fifth of a nominal hull. In a
  procedural shed there was no car at all, so one is drawn under the hull
  for the drop (`drawShedCar`).
- **2026-11-02 — Interrupting the transfer could softlock the game.**
  Astra: "if anything interrupts the 'move me to the launch pad' it
  softlocks the game". Each interruption was probed (pause, the menu, every
  panel key, held thrust, other commands, save and load, a pose that will
  not build), at a shed and at three routed orbital berths. Cruise was the
  one that broke it. Cruise is the first branch of `updateWorld`, ahead of
  the rail, so engaging it mid-transfer froze the rail and flew the hull
  out of the station: eight billion kilometres in the probe, with `arrival`
  still set, so dropping out snapped it back into the shaft. Cruise and
  the jump drive now refuse while the port has you, and say why
  (`portHasYou`). A save made in the pad hold reloads in the berth instead
  of hanging over the pad with nothing holding it.
- **2026-11-02 — Half buried and unable to climb after the transfer.**
  Astra: "it appeared that half the ship was buried in the surface and I
  couldn't gain any altitude". Measured at Oruun's ground ports: a mountain
  portal handed the hull over 50–73 m below the ground. On a heavy world
  the hand-off's 4 m/s climb was gone in two seconds, and the hull fell
  back and crashed at 43 m/s before the pilot could act. The rail now hands
  over to a hold (`Sim.stepPadHold`). The hold lifts the hull straight up
  until a hull length and 45 m of air are under it, then keeps it there
  nose-up until you thrust (or for 120 s). On the ground, a nose-up ship
  also lifts off on W, not only R. A hull whose drive cannot beat the
  world's gravity is refused the transfer at the counter, with both
  numbers.
- **2026-11-01 — A rock torpedo flew straight through the rock.** Filmed in
  the game for Astra's demonstration: launched from the panel between
  frames, the torpedo's position was one frame older than the rocks it was
  tested against for its whole flight — 0.87 km at belt speed and 15 fps —
  and it passed through the middle of a 240 m rock and coasted on. The test
  rig launched and stepped at the same instant, so it never saw it; the
  hunters had the same one-tick bug this morning. A torpedo now carries the
  time its position is for and coasts any gap before the test.
  (mining.test: "launched between frames, it still goes off on the rock".)
- **Missile smoke is no longer a grey bar across the sky.** Contrail points
  were laid in absolute space and left there, so in a belt doing 13 km/s
  round the star the trail was left kilometres behind within a second
  (doctrine 3). Each point now drifts with its frame: an atmosphere's with
  its planet, a missile's with your ship.
- **Blasts drift with what blew up.** The same doctrine-3 bug: an
  explosion stayed where it went off in absolute space, so a torpedo's
  fireball in a belt slid off the screen inside two frames. Every blast now
  carries the velocity of the thing that went up. A rock torpedo coasts, so
  it lays no smoke at all (it was a fat grey slab beside the rock), and its
  flash is drawn at its real 1 km blast radius, not 3.5 km. A pirate's rack
  cooking off is drawn at last: it had no timestamp, so its age was NaN.
- **A hull hit on your own ship no longer breaks the exterior frame.**
  Your ship has no `size` (NPC specs do), so the hull bloom's radius was
  NaN and the gradient threw, taking the rest of the frame with it. Found
  filming the shields; it uses the hull's length now.
- **One roll for an NPC's shot at you.** The picture rolled for a miss and
  the damage rolled again, so a bolt drawn wide could still hit you.

---

## 1.2.0-beta "Brian" (2026-11-01)

Named for Brian, a pigeon from the rescue. Everything below, down to Abby,
is in this release: seventeen days, from 2026-10-15 to today.

**You can get out of the chair now.** Every ship has rooms that fit inside
her own hull, an airlock and a belly ramp, and on the big ships decks, a
lift and a tram. Stations have interiors to walk, dressed Firefly by way of
Blade Runner. People are in pressure suits, every skin tone and build, and
you can talk to them. You can board another ship at a station, in space by
invitation, or by force once her drive is out.

**The sky has people in it who want things.** Every ship has a captain who
remembers you, rumours travel at the speed of ships, and a small language
model reads what you type on the band. Pirates pick the best prey and rob
it; the law runs pirates and smugglers down and arrests them; rival
empires skirmish; Syndicate runners can fire first, and then the law comes
for them. Kill enough of an empire's ships and its navy sends hunters.
Courier parcels have contents, sometimes not what the client said.

**And you can build.** Survey, claim and mine (the laser, drones, gas
skimming, ring laser ships), found a station from a Crawler and run its
books, and buy into industry. Every ship in the sky can be flown, built and
bought.

Everything that changed is listed below, by kind, newest first.

### Fixed

- **The web copy can no longer run scripts from two builds at once
  (2026-11-01).** Astra hit `error: cam is not defined` in the exterior
  view on the GitHub Pages copy. The live code was clean: her browser had
  kept a `gl.js` from 2026-10-30 (the one with that bug, fixed in
  "See-through windows on other ships") inside an otherwise current game,
  because Pages lets each file go stale on its own clock. The Pages build
  now stamps every script tag with the commit (`?v=<sha>`), so each push
  is a fresh set of URLs, and `ports.js` carries the same stamp onto the
  station art it fetches later. The build refuses to publish if fewer than
  50 tags were stamped. Running from disk or the desktop app is unchanged.

- **A hull pays out of her own purse (2026-11-01).** Selling to a hailed
  ship was limited only by her spare room, so a shuttle with six tonnes
  free would take 20,000 cr of AI cores she had nowhere to keep. Each
  hull now carries a purse for the voyage, by class (`PURSE` in
  `shiptrade.js`: shuttle 4k, liner 5k, hauler 6k, tanker 8k, freighter
  25k, bulker 70k, others 12k), and what you pay her for her own goods
  goes into it. The trade screen shows it, and when she is short she says
  it is the money, not the room. Sized by class rather than read off her
  hold because, measured over 8 seeds, most hulls with room are empty on
  the leg you meet them, which is when a captain has most cash. Saves
  survive: a voyage ledger from before reads as a full purse.

- **A rumours test sampled the exact instant a ship casts off (2026-10-31).**
  A route's period is twice its cruise plus layover, so a ship leaves her
  far port at exactly t0 + n.5 periods. `rumours.test.js` sampled at
  0.37k + 0.11i periods, which lands on a half for some k and i. Whether
  she was still berthed at that instant came down to a rounding error.
  Universal reactor demand moved the timetables, and one sample tipped
  over. The samples are now nudged off the half; the game's code is
  unchanged.

- **Her ramp, walked up or down (2026-10-31).** Astra: *"when traversing
  the ramp, ship detail flashes on screen"*, with a screenshot of a slab
  of sunlit hull standing in her airlock.
  - **What it was.** Two pieces of the hull model itself, in the way of
    the room you walk into.
    - A sloping plate over the well. Its middle was above the deck, so the
      well cut kept it whole, and its low edge hung down across the top of
      the ramp. That is the slab you walked up into. The well cut now also
      splits every plate at the deck: what is above stays, what is below
      goes.
    - Plating and greebles where her airlock room stands. They are now
      cut out of her hull per pixel, over the airlock and the whole well
      footprint, from deck to ceiling (`lockBox`), whenever she is drawn
      with her ramp out.
  - This was also today's open item, *"climbing the ramp you see the grey
    end wall of the belly well"*. The grey was the same plate.
  - Probe: `tools/probe-ramp-flash.js` walks her ramp in 16 steps with a
    shot at each one. Every step is now clean, from the hangar floor into
    her airlock.

### Saves

- **Epoch 4: existing careers do not carry over.** The pirates were split
  from the Syndicate, so the map was redrawn. Astra chose it knowing
  that: *"Bump, careers reset"*.
- **Additive: station licences, forged blanks and founded stations**
  (`licences`, `forgedBlanks`, `stations`). An older save loads with none.
  A crate in the arms at the save is back in her ring on load.

### Added

- **`\` locks what is ahead (2026-11-01).** Astra: *"we need a faster way
  to target ships and stations in front of our ship from the cockpit."*
  `[` and `]` step through every body and ship in the system in range
  order, so the freighter on your nose could be a dozen presses away. `\`
  locks the ship or station nearest the line of the nose, within 25°;
  pressing again within four seconds steps outward to the next. Planets are
  left out (still on `[ ]`), and so are ships more than a million km off.
  The message says how far, how many degrees off the nose, and how many
  more are in the cone. `Sim.aheadOf` chooses, and is tested on its own;
  `render.test.js` presses the key.

- **Naval hunters, sent after you on notoriety (2026-11-01).** PLAN.md
  Phase 9, the second half; Astra: "the navy hunters".
  - A second ledger beside your bounty, `G.notoriety`, per empire: it grows
    on REPORTED loud acts (a killing 12, a police cutter 25, a navy ship 40,
    a liner or a tender 30), halves every three days, and cannot be paid
    off. Paying your bounty clears the police; it does nothing for this.
    The Syndicate has no navy to send.
  - At 60 (three cutters in a few hours) you are told the navy has your
    name. Half an hour after you are in that empire's space, two naval
    interceptors launch from its nearest port and hunt you (three at 120).
    They open with no demand, fly the law's guns and missiles, are tougher
    than a cutter and a little faster than one. They wait out a dock and
    are never put back on a rail; leave the system and the hunt is over.
    Once a hunt ends, the next waits six hours. The same dispatch sends the
    same ships on a reload. Saves carry the ledger (additive).
  - Simulated chases (`test/hunters.test.js`, 28 checks): first hit at
    28 minutes from 16,000 km, 55 minutes from 83,000 km, 4.3 hours from
    1.8 million km.

### Fixed

- **NPCs steered one tick behind you (2026-11-01).** Found building the
  hunters, on Astra's guess. You are moved to the new time before the
  encounter loop runs; an NPC still stands where she was a tick ago until
  she steps. The station-keeping law measured her standoff against where
  you are NOW, so she settled one tick of your velocity off: about 1 km at
  60 fps (the "hovering about 1 km out" in the boarding notes), and the
  whole step at warp, which could keep a pursuer out of gun range. She now
  steers against where you were at her own time. A check that fails
  without the fix (44 km off at 1 s steps, against a 6 km standoff) and
  passes with it.
- **A hunter from far off no longer swings past you for ever.** The same
  spring law, from a million km, saturated, passed you at 300 km/s and
  oscillated. A hunter flies an intercept (closing at the speed she can
  still brake from) until she is inside her gun range.

- **Ships hold in the roads over ground ports (2026-11-01).** Astra, after
  the feeders: yes to ships lying off a port. Measured first, and the
  measure was wrong the first time: counting ships moored alongside an
  orbital station (which is out in space, on the apron), lonely orbital
  ports were already busy (empty 17% of the time). The empty ones were
  lonely ports on the ground or down a shaft, empty about 70% of the time,
  because their ships are inside and their approaches last minutes.
  - An arriving ship's crossing now ends in a holding stack 250-650 km
    over the field. She holds for half her layover (at most eight hours),
    flies a ten-minute final descent, and is then in her berth. Comms:
    "holding over Lowgate Landing, waiting on a slot".
  - Holding or descending she is not in a berth, so the berth model is
    unchanged and never counts a ship you can see outside. Rumours read
    the same hold when they work out who berthed where.
  - Your own ships, heavies, ships bound for a station you founded, and
    anything bound for an orbital port go straight in, as before.
  - Swept: no hold, lonely ground ports empty about 70%; 0.3 of the layover
    capped at 4 h, 51%; 0.5 capped at 8 h, 46%; 0.6 capped at 24 h, 42%.
    With the feeders, every port: empty 29% of the time to 20%; lonely ports
    63% to 44%. Ports with a sister port over the same world: never empty.
  - Found on the way: a signed shift in the stack's hash put some holding
    ships underground; the apron's own hash already used the unsigned one.
  - New checks in `test/berths.test.js`; `economy.test.js` now checks
    every seam of the arrival (crossing, hold, final descent) and
    nose-up at the real touchdown.

- **More peaceful ships round lonely stations (2026-11-01).** Astra:
  *"increase the number of civilian ships that we might come across that
  don't want to shoot at us."* Measured first (`tools/measure-encounters.cjs`,
  6 seeds, 93 systems, ships within 3,000 km): a port sharing her world with
  another had company 80% of the time; a port alone over her world, 44% of
  all ports, was empty 96% of the time. Feeders only ran between docks over
  the same body, so a moon station with a sister station over the planet
  below got none.
  - Twelve feeder shuttles now run between a lonely port and her nearest
    neighbour in the same planet-and-moons family (57% of lonely ports have
    one, a median million km off). Shuttles are unarmed, carry a share of
    the trade between the two, and are registered with no market, so no
    price moves and every existing route keeps every draw.
  - Lonely ports: empty 96% of the time before, 73% now. All ports: 55% to
    43%. Cost: about 0.06 ms more per traffic pass.
  - Saves survive: the new routes are additive (`ff` ids).

- **Syndicate runners can fire first, and then the law comes for them
  (2026-11-01).** Astra, in October: *"Syndicate runners don't get chased
  by cops unless they are firing on a civilian vessel as the aggressor.
  The syndicate pays off the police."* The rule was written down then, but
  nothing could break it: runners never fired on anyone.
  - A runner near you turns on 12% of her legs (seeded per leg, so the
    same leg chooses the same way on every reload), on the softest, richest
    civilian within 600 km. She fires first, with no "heave to", knocks the
    drive out, comes alongside and strips her. The victim calls it in.
  - She only picks a fight she can win: an unarmed ship, or one no tougher
    than she is. Once she has fired she carries a real gun (NPC_GUN), on
    you as on a freighter and on a scanner's readout; until then she reads
    as a freighter.
  - **And you** (Astra's call). Measured across 6 seeds
    (`tools/measure-runner-turns.cjs`), only 0.2% of runners have an NPC
    civilian within reach at any moment, because traffic lanes do not
    cross close. The civilian a runner actually meets is you, so she
    scores you the way a pirate does. Armed and tougher than her, you are
    left be.
  - Firing first marks her as the aggressor for 30 minutes. Any lawful
    cutter that sees her runs her down like a pirate ("your papers do not
    cover firing on a civilian"), and a runner chasing you drops you to
    run.
  - Shooting back at a runner who fired on you first is self-defence, not
    assault.
  - A runner who has fired on nobody is still left alone by the law.
  - 16 new checks in `test/aggression.test.js`.

- **The sealed courier parcel has contents (2026-11-01).** PLAN.md Phase
  10, built. Until now the parcel was one tonne of nothing that proved you
  reached the star.
  - What is inside is hashed off the contract (`parcelContents`, its own
    substream): mostly mundane and specific (legal instruments, medical
    samples, seed stock, a data core, somebody's ashes), sometimes
    narcotics, gold buds or restricted arms.
  - The odds lean on what the board shows: the fee's place in the courier
    band, whether the far star is Syndicate or pirate ground, and the
    crime of the system you sign in. The client and tone are drawn to
    agree with the contents more often than not. Measured over 8 seeds
    (`tools/measure-parcels.cjs`): dirty 14% overall, 1.8% for a mid-band
    fee to lawful ground out of a quiet system, 47% for the top of the
    band bound for Syndicate or pirate ground; 48% with a shady client
    against 5% with a proper one.
  - A courier contract now says when the far star is Syndicate or pirate
    ground (a true fact, and one of the tells).
  - **Customs finding it sealed** (Astra's call): the parcel is seized and
    fined, the contract is void, and your standing is left alone. You did
    not know; the seal was somebody else's word.
  - **Breaking the seal**: DETAILS on the contract, then BREAK THE SEAL,
    twice. The contract voids and the client's flag takes a standing hit.
    A dirty parcel becomes the tonne of contraband it was, and opened it
    is your crime like any other. A clean one stays aboard as a parcel.
  - **A reason to buy a scanner**: a combat scanner or better reads a
    sealed parcel through the seal, on the contract line. The hull scanner
    does not.
  - Saves survive: a contract signed before today reads as clean and
    unknown. Campaign chapters' parcels are not drawn from this table.
  - `test/parcel.test.js`, 32 checks.

- **Police interceptors burn harder in a chase (2026-10-31).** Astra:
  *"give police extra thrust for their interceptors"*.
  - A lawful interceptor running somebody down gets 1.5 times her cruising
    acceleration. That covers a fugitive she is chasing, and you, when
    she is hunting you.
  - From 30 km behind a fleeing pirate she now reaches gun range in about
    37 s at 1x, down from about 75.
  - Shadowing or inspecting, she cruises as before.
  - The Syndicate's enforcers don't get it (they already carry the better
    gun). Nor does the Navy: a warship doesn't chase, it arrives.
  - `Sim.accelOf`, `Sim.POLICE_BURN`; tested in `test/aggression.test.js`.

- **Who hunts whom: NPC aggression, the law, and standing (2026-10-31).**
  Astra: *"we need to add NPC aggression, including pirates, police
  arresting or disabling fleeing ships, and have that tie into the faction
  standing stuff."* Until now nothing in the game fought anything but you.
  New module `src/aggression.js`. Her choices:
  - **Where fights happen: near you, and off-screen as news.** Fights you
    can see are flown for real: any NPC woken within about 3,000 km of you.
    Everywhere else, a raid is rolled from the timetable (see off-screen
    raids, below).
  - **Best prey wins.** An idle pirate looks round every few seconds and
    scores every candidate within 2,500 km, you included: what her hold
    is worth, times how soft she is, over the distance.
    - Unarmed hulls and damaged ones score higher. An armed ship scores
      half; waste is worth nothing.
    - So a laden, unarmed freighter is robbed before a lean, armed ship.
    - Ships flying near a patrol lane are left alone, as they already were
      for you.
  - **A robbery.** The pirate lifts the freighter off her lane and runs her
    down. Within 15 km she calls on her to heave to, and the call goes out
    on the band.
    - The answer is seeded per pair of ships. An unarmed freighter usually
      yields; an armed one usually refuses.
    - Yielding, she gives up 60% of every line in her hold. Her port is
      short of it when she docks, saved like cargo bought off a ship. The
      pirate breaks away to sell it and looks for no one else for an hour.
    - Refusing, she is fired on, fires back if she has a gun, and sends a
      MAYDAY. If her drive goes or she strikes, the pirate comes alongside
      and strips her.
    - None of it is your crime.
  - **The law: pirates and smugglers run, and police disable and arrest.**
    - A lawful cutter or warship that sees a pirate within 1,500 km runs
      her down. The pirate drops whoever she was robbing and runs, firing
      back.
    - Cutters also check the papers of freighters passing within 400 km.
      Independent smugglers (8% of lines through a port with a fence)
      bolt. Syndicate runners are never stopped: "the syndicate pays off
      the police".
    - The law wants the crew, not the wreck. Under 15% hull, a fugitive's
      drive is shot out.
    - The cutter then comes alongside. After 20 seconds the crew is taken
      off and the ship impounded: she is gone, and her line is off the
      timetable.
  - **Standing.** Astra chose all four:
    - *HOSTILE means shot on sight.* At standing -40 or below, a faction's
      patrols open fire on you within 1,500 km, whether or not you owe them
      a bounty.
    - *Helping a victim raises standing.* Killing a ship that was attacking
      someone else: +5 with the victim's flag. Hurting a pirate badly
      enough that she breaks off: +2. Answering the MAYDAY: the existing
      +8.
    - *Helping an arrest.* Your shots in a fugitive before the law takes
      her: +3 with that force. Shooting a ship the law is already chasing
      is no crime.
    - *Interfering costs you.* Firing on a cutter mid-arrest: -10 with the
      force and -5 with the empire above it, and the fugitive gets away.
      The crime is booked as well.
    - *Rival empires skirmish.* Where two rival empires' patrols meet within
      800 km, they open fire on each other. These are border clashes, not
      a war: nobody's drive is knocked out and nobody dies. The beaten one
      withdraws at half hull, and neither starts again for an hour.
  - **Off-screen raids, as news.** In a system with pirates, a share of
    every line's arrivals has been robbed on the way in and lands 60%
    light. Her port's shelf shows it.
    - The share is 2% plus a tenth of the system's crime score, more in a
      pirate band's own space, at most 18%.
    - Closed form like the rest of the market: the same raid every time,
      with nothing to save.
    - Dock at that port within a day of it and the word is on the dock:
      *"the Halcyon Wain came in from Pilgrim Depot robbed by pirates -
      farm machinery is short here."*
    - Syndicate runners, your own lines and feeders are not raided.
  - **Steering (sim.js).** An NPC now flies at her own target, or away
    from her own threat, instead of always at you. Pursuit uses a new
    `chase` mode built on the flown approach a ship uses to come alongside
    you, plus gravity, with the target's next position predicted.
    - The old spring trailed a target that keeps accelerating by about
      250 km, so no cutter ever came within gun range.
    - A cutter's drive is about 23% stronger than a pirate's, so from
      30 km she reaches gun range in about 75 seconds at 1x.
  - **Combat.** `Combat.damageNpc` takes the ship that fired, and
    `damageNpcBy` books nothing to you. Kills and disables by somebody else
    are said aloud only when you are close enough to see them.
  - First numbers throughout. Nothing new is saved: a fight ends when you
    leave or dock, as an encounter always has.
  - **Your station defends her traffic.** Her Defence batteries now also
    fire on a pirate robbing any ship within their 25 km, as well as on
    ships that are after you.
  - Tests: `test/aggression.test.js`. Probe:
    `tools/probe-aggression.js` (a robbery and an arrest in the real
    shell).

- **Her Defence batteries fire (2026-10-31).** Astra: *"build that
  next"*. Until now a battery only held the Syndicate off on paper.
  - **What they fire at.** Ships that are after you within 25 km of her,
    whether you are flying or docked with her. In this build nothing hunts
    anybody else, so a ship hunting you is the only kind of target there
    is.
  - **An owner's switch** (Astra's choice). By default they fire on
    outlaws: pirates, the Syndicate's ships and bounty hunters. *FIRE ON
    THE LAW TOO*, under her row in YOUR STATIONS, adds police and Navy.
    Every hit on the law is an assault booked to you as her owner, with a
    witness and a hush price, the same as your own guns.
  - **A kill is yours** (Astra: *"Counts as yours"*). It goes on your
    public record, and a pirate kill counts toward lifting a pirate mark,
    the same as one by your turret.
  - **Each battery is its own mount**, firing every 1.5 s for 9 damage,
    falling off with range. Several batteries spread their fire over the
    nearest targets. A surface station's batteries alternate between her
    pad and her Crawler up top.
  - **What they leave alone.** A ship whose drive is out, or who has
    struck: a hulk you might board is not a target. They hold fire under
    time compression, the same as your own trigger. A station that has
    been seized, or is not open yet, does not fire.
  - First numbers, like the rest of her books. The switch is saved with
    her; an older save loads with it off.

- **The station leftovers: every crate does something, the Syndicate's
  cut, buying her back, and the XL shipyard (2026-10-31).** Astra: *"Build
  all the leftovers, then push."*
  - **A Defence battery holds the Syndicate off.** Each one takes a fifth
    off the odds of a sabotaged week, and adds two weeks before they can
    take her.
  - **A Comms relay brings more ships.** Her prices go out sooner: 15%
    more calls, and berth fees, for each one.
  - **A second defining crate is a second trade.** Fitted at founding or
    later (a market hall aboard a shipyard, say), she trades as both.
    - The second trade's goods are added to her floor as production
      (`Economy.addProduction`, which recomputes the row by the market's
      own rules), and her books are re-taken.
    - Her name reads both, e.g. "Shipyard & Market station".
  - **Her freight.** Whatever the Crawler carried as freight is on her
    shelves the day she opens: sold into her own market at her prices,
    onto her account.
  - **Her crew.** The Crawler's crew know the work: each point of rating
    adds 3% to her unpack and ferry rates, to half again at most.
  - **The Syndicate's cut.** In a Syndicate hold, or a system at
    corruption 60 or over, they want a quarter of her takings. Pirate
    bands raid; they don't run rackets.
    - **Pay** (INDUSTRY tab, under her account) and she runs; nothing else
      happens.
    - **Refuse** and it is slow and loud. The first week is a warning.
      After that, each week has a 50% chance (less 20% per battery) of
      being sabotaged and earning nothing. Every week you hear the count.
      After six refused weeks (plus two per battery) they take her: she
      runs on, theirs.
    - Paying again stops the count.
  - **Buying her back** (story-spine beat C, at station scale). A station
    you lost (seized, foreclosed or taken) is sold back at her own desk for
    a quarter more than she cost, plus anything she owed. The law wants a
    real licence first; the Syndicate wants only the money.
  - **Stitching: the XL shipyard.** A Crawler within 20 km of a shipyard
    of yours gets *Stitch her onto ...* on her crew channel.
    - She stops for good alongside the station, on her flank links.
    - Her crates go into the ring as upgrades, and you leave in one of
      her tugs.
    - Chains of more alternate to either side.
    - Two or more make an **XL shipyard**, drawn as the Crawlers side by
      side.
    - A shipyard you founded builds hulls up to L on one Crawler; XL hulls
      need the XL yard. Every other yard is unchanged.
  - Probe: `tools/probe-xl-yard.js` founds a shipyard, stitches a second
    Crawler on, and looks at the pair. `test/stations.test.js` covers all
    of the above (116 checks).

- **Surface stations have two halves, and Berth clamps have places
  (2026-10-31).** Astra: *"let's do surface stations as well as extra
  berths"*. Her choice for the Crawler: *"She stays up as the orbital
  half"*.
  - **The pad and her Crawler.** A station founded on a surface opens as
    two ports with one name: the pad on the ground, and the Crawler on her
    parking orbit over it as *<name> Orbital*. You dock in the Crawler's
    belly, as at any station of yours. The two halves:
    - share one market and one account;
    - go dark, are seized and are foreclosed together;
    - each count as her desk.

    Her own shuttle runs between them as a local route, and pays her no
    berth fee. Upgrades for a surface station float round her Crawler up
    top, and her shuttles ferry them down.
  - The site forecast for a surface station includes both halves, and
    matches the station founded there.
  - **Seven berths and up.** A Berth clamp is one more berth in her belly
    hangar. Past six, the two walls share the berths evenly across
    eight-tenths of the hangar, the near wall taking the odd one. The old
    layout put the seventh berth on top of the fourth. Six or fewer is
    exactly the layout every station always had.
  - A body that joins a system after you entered it gets its orbit line
    drawn the first time it is needed. The Crawler up top was throwing an
    error every frame.
  - Probes: `tools/probe-surface-station.js` founds an ore works on a
    claimed world, then shows the orbital half and the pad below.
    `tools/probe-station-crawler.js` now also berths in the seventh berth.

- **Your station's books, her reactor, growing her, and her own Crawler
  for a hull (2026-10-31).** Astra: *"keep working on it, we'll push after
  the station founding stuff is complete"*. Her choices: every port takes
  fissiles; another Crawler hauls upgrades; the station is drawn as the
  Crawler herself and you dock in her belly hangar.
  - **Every port runs a fission reactor.** Every port now buys fissiles
    for it, NPC ports included. A port in a bright sky tops up with solar
    and burns little; one round a dim star's outer moon burns the most.
    - Measured over 80 systems (`tools/measure-reactor.cjs`): every one of
      656 ports now has a fissile row (462 before).
    - The median price where fissiles are not exported is unchanged at
      1,313 cr/t.
    - The plant-to-press spread on the milfuel ladder is 501 cr/t (510
      before), and the ladder still climbs.
  - **Her week.** It is settled wherever you are, and money moves by wire.
    - **In:** her market, on what crosses her floor, and berth fees from her
      traffic.
    - **Out:** her crew's and staff's wages, upkeep on what she cost, and
      fissiles for her reactor.
    - Over 35 sites a type (`tools/measure-stations.cjs`), median net a
      week: market station +7k, refinery +11k, mining +26k, hab +33k,
      shipyard +22k. Every type has sites that lose money.
    - Her account keeps a 25,000 cr float for fuel. Anything over that is
      wired to you each week.
  - **Dark.** Her tank empty and no money to fill it: her market closes,
    her traffic stops calling, and she earns nothing while her wages and
    upkeep still run. Fuel her from your hold at her desk (free), or pay
    into her account, and she lights again.
  - **Foreclosure, slow and loud.** Every week she owes, you are told. After
    eight weeks she is foreclosed: she goes to the licensing power, keeps
    running, and pays you nothing.
  - **Will she pay?** On her crew channel, each *Found her here* row now
    carries a **FORECAST**: the station she would be at that spot, run
    through the real market and traffic code. It shows what she would earn
    and cost a week. A station founded there has the same market and berths
    as its forecast, because her numbers come from her site, not from the
    day she is founded. Asking changes nothing in the system.
  - **The INDUSTRY tab** lists YOUR STATIONS. For each one it shows:
    - building, or her week line by line;
    - her account, with PAY IN;
    - her reactor in weeks and tonnes, with FUEL HER at her own desk;
    - her upgrades and what each one does.
  - **Growing her.** A loaded Crawler within 20 km of your station gets
    *Unload her crates for ...* on her crew channel. The crates go into
    the station's ring. Her crew fits them in turn from the day they
    arrive, or you carry them in with a tug's arms. Fitted:
    - a Berth clamp is one more berth;
    - a Warehouse makes her shelves 30% deeper;
    - a Reactor pile adds 10% more trade;
    - a Fuel cell is three more weeks of reactor tank.

    A Defence battery, a Comms relay and a second defining crate are
    fitted and counted, and do nothing yet (the screen says so).
  - **She is her Crawler.** A station founded in orbit is drawn as the
    Crawler you founded her from, in her livery, with her crates in her
    cubes, fitted upgrades included. She is laid so her belly faces the
    way every station's bay faces. Her belly hangar is the bay:
    - you are cleared in through her two belly leaves, cut out of her own
      model and sliding apart to port and starboard;
    - you park on her ceiling pad;
    - collision is her own hull.

    Measured off Astra's re-export: hangar 200 x 116 x 37 m, door 58 m
    wide. The port is 478 m, her length.
  - Probes: `tools/probe-station-crawler.js` shows her flank, her belly and
    a berth inside her; `tools/probe-founding.js` still founds, carries and
    opens.

- **An arm-tip camera on the tugs (2026-10-31).** Astra: *"the tugs need
  a fwd camera on the end of one of the arms, and a screen in the cockpit
  for when there's a crate in the arms"*. A crate in the jaws fills the
  arm camera and most of the windscreen.
  - The camera rides on the end of the starboard arm, just outboard of the
    crate, looking straight ahead past it. Its screen sits high on the
    left of the canopy frame, opposite the arm camera, and is up only
    while a station crate is in the jaws.
  - It shows the Crawler you are building, with brackets round her. When
    she is off the picture, an arrow on its edge points the way.
  - The readout gives the metres left to her frame, how fast you are
    closing, and *AT HER FRAME - it goes in* once you are there.
  - Probe: `tools/probe-founding.js` now takes the tip camera facing away
    from her (the arrow) and turned to her (the brackets).

- **Founding a station from a Crawler (2026-10-31).** Astra: *"yeah,
  let's do that next"*. Her choices: a licence now, orbit and surface, a
  full port with traffic, and the arms helping build her (her crew's tugs
  unpack at the agreed rate; a crate you carry in yourself goes in at
  once). `src/stations.js`, `src/licence.js`.
  - **A licence first.** Bought on the authority channel from whoever
    governs the system, for about a mid-tier ship's price (more in a richer
    system), at WARM standing or better, and never by a marked pirate. In a
    Syndicate hold the collector sells it. A pirate band's space needs
    none.
    - A **forged blank** is sold by the Syndicate's collector in its holds
      for about a third of the real fee, and is filled in when you found.
      It is checked once a week; a clean system checks far more often than
      a corrupt one. Caught, you have a week to pay the real fee on the
      authority channel, or the station is **seized**: she stays open,
      under their flag, and is no longer yours.
  - **Founding.** Fly the Crawler there, cast off, and open her crew
    channel on the comms list (marked `*`, at the top). It offers *Found
    her here, in orbit of ...* and *Found her on the ground below*, each
    with the reason it can't be done when it can't. She needs:
    - a load that founds a type (Crew quarters, a defining crate, and what
      it needs);
    - a world below her, 500 km clear of every port and of your own sites;
    - a licence, or a forged blank;
    - for the surface: within one world radius of the ground, a mining
      claim on that world, and a shuttle in her bay.
  - **She stops for good.** In orbit she stands on the circular orbit
    through where she was. On a surface her site is the ground below her,
    and she waits on a parking orbit above it while her shuttles take the
    crates down. Her freight and her crew stay with her; your credits stay
    with you.
  - **You leave in one of her tugs** (a Bollard, or the Hawser if that is
    her only tug). That tug is off her shift while you fly it, so her
    crew works at the bay's rate less one tug.
  - **Her crates float in a ring round her**, 600 m out. Her crew unpacks
    them biggest first, at cubes per day. On a surface each one then
    waits on the shuttles' ferry rate.
    - Any crate you take in the tug's arms (G) and bring within 350 m of
      her is in at once and comes out of her crew's queue, so she opens
      sooner. The arm camera shows the crates. Let go short of her and
      her crew lines it back up.
    - The crew channel says how many crates are in, which one her crew is
      on, and when she opens.
  - **The day she opens she is a port like any other.** She has berths,
    a market of her type (market station, refinery, skimmer, mining head,
    hab as a highport, shipyard), her own dressing, and up to four
    routes of her own whose first ships leave her that day. Nobody else's
    ship moves when she opens. She is put back every time the system is
    generated or loaded.
  - Probe: `tools/probe-founding.js` founds a market station over a world
    and carries the crew quarters crate in with the arms (4 hours sooner).
    It then runs the clock to her opening and flies up to her berths.

- **A tug's grab arms, worked from the seat (2026-10-31).** Astra: *"the
  [tug's] cockpit should have a vidscreen to operate those grab arms"*.
  She chose canisters, towing disabled ships and moving station modules.
  The Bollard and the Hawser carry the arms; the Mule does not.
  - **The arm camera.** A vidscreen high on the right of a tug's canopy
    frame shows the view from the arms, just behind and above the jaws,
    looking past them. It shows:
    - what is there (her hull, a canister) and the reticle where the jaws
      meet, green when in reach;
    - the jaws closing;
    - a readout: what it is, how far off, how fast against you, and what G
      will do.
  - **G** shuts the jaws on whatever is in reach, and opens them again.
    Shift+G is still the gear. "In reach" means within 12 m ahead of where
    the jaw tips meet, 9 m ahead of the seat on a Bollard, at under 4 m/s
    against you. Closing on nothing, or too fast, says so.
  - **A canister** is held at the jaws and swung into the hold after five
    seconds. No scoop is needed: that's what the arms are for. With the
    hold full, it stays in the jaws until you let go.
  - **A disabled ship** is clamped where she was when the jaws shut. She
    comes with you, turning as you turn, and her mass is added to yours
    (`ship.armLoad`), so a tug pushing a freighter accelerates like one. A
    ship under way slips out of the jaws. Letting go leaves her adrift.
    Dock with her on the arms and the harbour takes her for **salvage at
    20 cr a tonne**. If you were seen to attack her, nobody pays: "Nobody
    pays salvage on a ship they watched you shoot."
  - **Station modules: not yet.** Founding a station from a Crawler isn't
    built (construction.js: "founding comes next"), so a module has
    nowhere to be carried to. The arms are the hands it will be built with.
  - Not saved: a load lets go of whatever the jaws held.
  - `src/arms.js` (new). Test: `test/arms.test.js` (21 checks). Probe:
    `tools/probe-arms.js`. In the real game, a lifted, disabled trader is
    clamped and towed with 0.00 m of drift.

- **Small open items (2026-10-31).**
  - **The freight office** in the cargo hall now opens the contract board
    (F7, MISSIONS), where hauls are let, instead of the market screen.
  - **The outfitter on a wall ad** (`outfitterFor`) is now the nearest
    shipyard port by where the ports actually are on their orbits. When
    ports carried no fixed position, every one measured 0 and the first
    listed won.

- **The pirates split from the Syndicate (2026-10-31).** Astra: *"Syndicate
  is mafia. Pirates are like their disposable muscle."*
  - **Three pirate bands** (`pb0`–`pb2`), with names like *The Vezor
    Corsairs* and *The Goros Reavers*. Each holds up to three systems in
    the far reaches still unclaimed after the Syndicate's holds. They
    answer to the Syndicate (`parentId: 'outlaw'`) and sit inside an empire
    (`empireId`). No waste ban, no racket. They draw from their own RNG
    stream, so the minor powers draw what they did.
  - **What a band's space is like.** Measured across six seeds:
    - It is violent and not very corrupt (violence 66, corruption 31).
      The Syndicate's space is the reverse (26 and 76).
    - Anarchy is a band's commonest government, about a third of its
      systems.
    - A band runs **no police and no customs**. Its raiders are out in
      force, two more per system.
    - **The navy crosses it far more often**, because it hunts pirates and
      cannot see a mafia.
    - The Syndicate's tithe isn't collected there, and no Syndicate heavies
      keep station. A band's ports don't wear Syndicate colours, except a
      milfuel plant licensed by the Syndicate.
    - The star chart reads *PIRATE HELD - no law, no customs, raiders*.
  - **`sys.heldBy`** is `'syndicate'`, `'pirate'` or null. `pirateHeld`
    stays true for both, so nothing that means "lawless territory" breaks.
    The Syndicate and pirate violence/corruption bonuses are now two pairs,
    +6/+22 and +26/−6.
  - `PIRATE_HOLDS`/`PIRATE_SHARE` are renamed `SYNDICATE_HOLDS` and
    `SYNDICATE_SHARE`. The literal id `'outlaw'` stays the Syndicate's.
  - Tests: `test/split.test.js` (13 checks), and three new map checks in
    `test/galaxy.test.js`.

- **The pirate mark, and framing a tug (Phase 18, 2026-10-31).** Astra
  chose to build the framing along with the mark, since the mark needs
  something to put it on you.
  - **Framing.** While a tug has you on the cable, her hold is open to
    you. COMMS (F4), on the authority channel, lists a **PLANT** row for
    each piece of contraband in your hold, worst first. Each row says what
    it would cost you.
    - Her crew are the witness by definition. They have your transponder
      on the end of their cable, so it is never anonymous, even running
      silent. The usual eight seconds to buy them off or lean on them
      apply. A Navy tender's log is sealed, as a capital ship's is.
    - The tow drops to 1x while a report is pending, or the window would
      pass inside one frame.
    - **Narcotics** are a `frame`: 1,500 cr on the bounty.
    - **Restricted arms or milfuel** are a `frameSerious`: 9,000 cr, and if
      it is reported, **the mark**.
    - **Nobody files:** the tug carries it in. At the port, customs board
      *her*, and her crew are charged.
  - **The mark is a floor, not a number.** Standing with the faction whose
    crew filed is set to −100 and pinned there. Nothing raises or moves
    it. F5 and the police channel read **MARKED n/12**, not HOSTILE, so a
    locked reputation is not mistaken for a bad one. Everything else
    (closed ports, patrols, an empty board, the yard's gates) follows from
    the standing that already exists.
  - **The road back: twelve pirate kills, anywhere.** A dead pirate
    reports itself, so no witness is needed and any space counts. Each
    pirate counts once, by its id, so a wing can't be farmed. Every
    faction holding a mark is credited at once. On the twelfth, the mark
    lifts and standing resumes at −40.
  - The mark, the pirates already credited, and the tug with what is in
    her hold are all saved.
  - Test: `test/mark.test.js` (29 checks).

- **Today's loose ends (2026-10-31).**
  - **C crouches** as well as Left Ctrl, while walking. Ctrl+W is a
    browser's close-tab, and crouching while walking forward is exactly
    Ctrl+W. Each key is tracked on its own, so letting go of one while
    the other is held keeps you down. The walking hint says *Ctrl or C
    crouch*.
  - **Seated in her, berthed in her hangar**, the windows now show the
    hangar you walk out into, not the station model's bay
    (`hangarSeat`). GPU only, as the chase view is.
  - **People in the chase view of her hangar.** The station's scene is the
    hangar deck's while you watch her there. A berth hand
    (`Berth hand`, a loadmaster) now works your hangar, posted in the
    first corner that is floor and clear of her. Test: three new checks
    in `test/hangar.test.js`.
  - **The floating label is gone.** The pointer to your home station is
    not drawn while you are docked at it. From the hangar it pointed
    kilometres off through the wall.

- **See-through windows on other ships (2026-10-31).** Astra: *"See
  through windows on other ships"*.
  - **What you see.** Within 400 m, with the GPU renderer on, a ship's
    canopy is glass. Through it you see her real cockpit: the same room,
    seat and fittings you would walk in if you boarded her, lit as
    indoors, in the place it sits inside her. This applies to traffic, a
    disabled ship you are crossing to in a suit, and your own ship from
    the chase camera or a spacewalk.
  - **How it is cut.** A hull model's glass is a dark panel on her skin,
    and on most hulls it sits a metre or more ahead of and above the
    cockpit room. So the opening is the *well* between the two: a box
    from the room's front wall out past her glass, as wide and tall as
    either. It is cut per pixel in the shader, because cutting whole
    faces either left her big forward plates standing or tore holes the
    size of them. Her glass panels near the cockpit are drawn at 32%
    opacity, and the room's own panes at 30%.
  - **Towered hulls** (Capital, Crawler) open their tower the same way
    their bridge view already did.
  - **Fixed along the way.** The shader's cut box can now have a lid
    (`uBoxTop`; unset means open-topped, as before). A mesh queued with a
    box no longer throws: the draw loop read a `cam` it did not have,
    which nothing had exercised until now.
  - **Still to tune.** The cabin reads dim through glass, because it
    uses the same indoors lighting as station interiors. The Mule's
    cockpit sits about four metres behind her canopy, so you see a deep
    well before you see the seat. Both are noted, not fixed.
  - Probe: `tools/probe-windows.js`.

- **Every ship's rooms fit inside her own hull (2026-10-31).** Astra:
  *"all ships should have interiors that exist as part of the ship
  itself"*, and they *"should follow the rules of making physical
  sense"*.
  - **How a deck is fitted.** Each hull's deck is now planned against the
    hull itself (`ShipDeck.planFitted`, asking `Render.hullFitter`
    whether a point is inside her).
    - Every room except the cockpit is sampled every half metre, at floor
      and ceiling height, a hand's width in from its walls. The cockpit's
      canopy stands proud of her skin by design.
    - The first room that is not wholly inside is dealt with, then the
      deck is planned again, until every room fits or nothing more can be
      done.
  - **What gives.** Asked, she chose *shrink, then drop*. A room is cut
    down to a size it can still do its job in, and only below that is it
    left out.
    - A side room is narrowed from its outboard wall.
    - The hold is narrowed, then given a lower deckhead (down to what two
      stacked containers need), then shortened from aft.
    - The airlock gets a narrower ramp before it gets anything else.
    - A decked hull's tramway is shortened until engineering is inside
      her.
  - **What it did, today:**
    - airlocks narrowed on the Talon, Mule, Longhaul, Tanker, Trader and
      Enforcer;
    - quarters narrowed on the Dart, Samaritan, Longhaul, Tanker, Trader
      and Crawler;
    - medbays narrowed on the Samaritan and Crawler.

    Nothing was left out of any hull.
  - **The Capital's tramway is now 6 m.** Her conning tower stands 44 m off
    her centreline, and a tram straight aft from under it left her skin at
    30 m.
  - **Measured first, and corrected.** The first measurement said only
    four hulls of twenty-three held every room. That number was wrong: it
    counted the cockpit, and a ray-parity test that her open meshes break.
    Measured against her hull above and below, most rooms were already
    nearly inside. What stuck out were outboard walls, a few corners, and
    the Capital's engineering, which was wholly outside.
  - **Seams and slots.** A point exactly on a seam between two panels, or
    in a slot under half a metre wide between hull sections (the Cutter
    has one across her belly), counts as inside her.
  - **Known:** the Crawler's lift car, on her two lower decks, runs a metre
    across an opening in her frame.
  - **Tools and tests:** `tools/interior-fit.js` reports every hull. A
    test fails if any room stands outside its hull, or if fitting ever
    leaves a room out.

- **Boarding, part 3: a disabled ship, taken by force (2026-10-31).**
  This is the third way aboard, after docking beside her at a station and
  being invited in through her tube. Astra's answers set each piece.
  - **Her drive** ("hull damage + aim"):
    - Hits on her hull also wear down her drive, and hits from within 60°
      of dead astern count double.
    - When the drive has taken two thirds of her hull's worth, she is dead
      in space. She coasts and tumbles slowly.
    - A ship that drops below 60% hull may also strike, once: often for an
      unarmed merchantman, seldom for a pirate, never for the law, the Navy
      or a warship.
  - **Calling on her to heave to.** The piracy menu has a new row, "Heave
    to — stand by to be boarded", with the odds on it.
    - Her odds go up as her hull goes down. She ignores you if you have no
      guns.
    - If she agrees, she cuts her drive and stops shooting.
    - If she refuses, she runs, and fights back if she is armed.
    - Asking is the robbery: it is reported like a demand.
  - **The spacewalk** ("fly the suit"):
    - In open space your airlock cycles out to vacuum and the ramp opens
      onto nothing. Walk off the end of it and you are in your suit.
    - **Controls:**
      - WASD, Space and Left Ctrl fire the cold-gas jets: 0.6 m/s², and a
        full pack is 30 m/s of change.
      - X brakes you against the nearest ship.
      - The mouse turns you.
    - **Safety line:** a 300 m line clipped to your own ramp. Holding H
      reels you in at 1.5 m/s and uses no gas, so running dry costs you
      the crossing, never your life.
    - **Marks:** both ramps carry a diamond and their distance. A ramp
      that is off screen gets an arrow on the edge of the view pointing at
      it.
    - **Readout:** gas, line, and your drift against the nearest ship.
    - E within 4 m of a ramp takes hold of it. Your own ramp puts you back
      aboard. Her belly door is forced open, and her ramp comes down for
      you.
    - The suit steps on the same clock as the ships. The first try used the
      wall clock, and at 55 km/s that put a quarter of a kilometre between
      you and your ramp in the first second.
  - **The standoff** ("they fight back"). Her master meets you in her
    airlock and her crew hold the inner door. You can:
    - lean on him;
    - talk him round;
    - pay him a third of her hold's value;
    - back off.

    Each way shows its odds. The answer is seeded per ship, per way of
    asking and per minute, so asking again at once gets the same answer.
    If it goes wrong, her crew throw you out of the lock, dog the door shut
    for fifteen minutes, and an armed crew start shooting at your ship.
  - **Her cargo** ("pick, they shift it"). Once she has yielded, press E
    on a container stack in her hold and her crew push it out of her
    airlock, one container every 6 s.
    - Each container comes off her manifest, the same hold every other path
      reads.
    - It goes on the charge at base price.
    - It hangs below her at 2 m/s (a jettison is 12) for your scoop.
  - The crates in a hold now carry their containers and tonnes.
  - `test/boarding3.test.js` (64 checks) covers each piece.
    `tools/probe-eva.js` runs all of it in the game, including a flight
    across on the jets.

- **Hulls are solid (2026-10-31).** Astra, watching the first spacewalk:
  *"There needs to be collision detection with ships and station walls,
  so we aren't flying through the hull of a ship like I just saw."* She
  chose collision for both the suit and the ship, and a touch that slides
  where a hit does damage.
  - **The test** is the one stations already used. It checks the PATH of
    each step against the hull's triangles as she is drawn (so nothing
    tunnels between two frames), as a bundle of five segments at the
    mover's own half-width. It is taken relative to her: where she was at
    the start of the step comes off where you were, so two ships coasting
    together are two ships sitting still. A hull with a ramp is tested
    with her ramp's well cut out, so her doorway lets you in.
  - **Your ship** now meets other ships' hulls as it meets a station's
    walls:
    - you are stopped a metre off her plate;
    - the motion into her is killed;
    - above the safe landing speed most of the rest goes too, and the hit
      costs hull as a hard landing does.
  - **Your suit** meets every hull near it, and station walls as a ship
    does. Above 2.5 m/s a hit bruises you and knocks a jet line loose,
    which costs gas.
  - **A hull you are floating beside** is no longer culled when her middle
    leaves the screen. She used to vanish at the moment you reached her
    ramp.
  - **The ship you are boarding** is drawn as a ship rather than as
    traffic: her ramp's bay is cut out, her ramp is down once it has been
    forced, and her lit airlock shows up the ramp. The mark points at her
    belly door while her ramp is up.

- **Canopies with more glass, shaped by role, unique to every ship
  (2026-10-31).** Astra: *"I want the canopy glass in the ships to give a
  better view to either side, as well as above and below, while also being
  unique to every ship."*
  - Asked, she chose:
    - **glass by role:** fighters and interceptors get near-bubble
      canopies; couriers and shuttles get generous wraparound glass;
      freighters, tugs and the big hulls get more frame and less glass, but
      still roof and lower windows;
    - **unique both ways:** each hull type has its own layout, and each
      individual ship has its own frame bars within it.
  - **Above:** there is glass in the roof either side of a spine down the
    middle of the ceiling. The overhead panel has narrowed onto that spine
    and no longer hangs across the top of the windscreen. Bubble hulls'
    roof glass runs most of the way aft; freighters' is a pair of
    skylights.
  - **To the sides:**
    - The side windows now run from the top of the side console up toward
      the ceiling, and further aft.
    - The quarter-lights beside the windscreen are taller, reaching well
      above and below where they used to stop, and they reach further round.
    - The side window now begins where the wall turns in toward the
      quarter-light, so the two read as one wrap.
  - **Below:** the landing window is wider, reaches further forward, and
    comes back under the desk toward your feet. The console slot widens to
    match, so you see all of it.
  - **The windscreen is unchanged.** It carries the HUD, and the forward
    view keeps the proportions it was tuned to.
  - **Unique per hull:** each family's sizes are moved within a band by a
    seed taken from the hull id. Three choices of shape are made the same
    way: the side window's top edge is level, tapers aft, or rises aft; the
    quarter-lights are swept or square; the roof panes are rectangles or
    trapezoids. No two hull types have the same glass.
  - **Unique per ship:** frame bars are seeded from the ship's own birth id,
    which never changes:
    - 0–2 bars across each side window;
    - 0–2 across each roof pane;
    - 0–1 across each quarter-light;
    - their width is per ship too.

    Bars never run through the middle fifth of a pane. Two Talons bought
    apart are framed apart, and renaming a ship changes nothing.
  - **Fixes found on the way:**
    - The corner where a quarter-light's wall meets the short wall back to
      the side wall left a gap that a sight line could pass through. Both
      walls now overlap there.
    - The light strips in the ceiling stop short of the roof glass.
  - Code:
    - render.js: `CANOPY_FAMILY`, `CANOPY_OF`, `canopyStyle`, `canopyBars`
      and `barQuad`; `spec.canopy` and `spec.slot`. `canopySegments` takes
      the quarter-light heights from the style. `cockpitGeometry` gains
      `roofs`, `bars`, `roofZ0`/`roofZ1`, `spineX` and `slot`, a per-hull
      `footHW`, and the side and floor windows from the style; `windows`
      now has 8 panes, with the roof's last. `apertureSet` punches roof
      panes `roof-right`/`roof-left`. The 2D path draws the bars.
    - shipdeck.js: the ceiling is framed round the roof panes; the bars are
      added to the room.
    - Tests: cockpit.test.js has 9 new checks:
      - every pane is inside its room;
      - every hull sees its whole landing window through its slot;
      - every hull has more side and roof glass than the old cockpit;
      - fighters have the most glass and freighters the least;
      - no two hulls have the same glass;
      - each ship has its own bars, the same every time;
      - bars stay out of the middle of a pane.

      shipdeck.test.js counts panes off the geometry.
    - Probe: `tools/probe-canopy.js` (ahead, port, up, down and
      starboard-up, per hull).
  - **Saves:** unaffected. Existing ships keep their old lean and trim,
    because the bars are drawn after them from the same seed.

- **The chase camera sees your hangar (2026-10-31).** Astra: *"the interior
  of the station is not visible when using the chase camera that orbits
  the ship."*
  - Seated and berthed, the orbiting camera used to show the station
    model's own docking bay: a big plain box, not the hangar you walk in.
  - Now, whenever your ship is berthed in her hangar and you look at her
    from outside, the hangar you walk in is drawn round her: the same floor,
    crates, signs and ads, with the spine through its door. The station
    model's bay is not drawn, because it would stand in the same space.
  - The camera stays inside the hangar's walls (0.6 m off walls and
    ceiling, 0.4 m off the floor), as it stays inside a station bay. You
    can't zoom out through the walls here.
  - **The hangar is bigger** so the camera has room to swing round her: 7 m
    of floor round her instead of 4, and 5 m over her instead of 2.
  - Code: main.js `hangarChase`, `clampCameraToDeckHangar` (a slab test in
    the hangar's frame), a skip in `drawBody` for the docked station, and
    `queueHangarFromShip` in the exterior view. walk.js `HANGAR_MARGIN` 7,
    and headroom height + 5. Probe: `tools/probe-chase-hangar.js`.

- **Stations by faction, wall ads, and a cargo hall (2026-10-31).** Astra:
  *"Yes, stations should vary by faction. There should be advertisements on
  the walls for the bar and outfitters, and there should be a central cargo
  area on the station."*
  - **A cargo hall** (24 x 18 m, 9 m high) now sits between the spine and
    the concourse, so every walk from the berths to the shops crosses it.
    - Container stacks (some two high) line both sides of a clear aisle,
      which is marked in dashed yellow. Hazard stripes run round the walls.
    - There is a gantry crane with its hoist and hook, a parked forklift,
      pallets of crates, and high-bay lamps.
    - Hanging signs point **^ CONCOURSE** and **^ BERTHS**.
    - **The freight office** is on the right-hand wall: a lit window with
      FREIGHT over it and a freight clerk at the counter. E there opens the
      market screen, as the market desk does.
    - Station security now patrols through the hall.
  - **Ads on the walls** in the spine, the cargo hall, the L port, the crew
    hall and your hangar. They are kept clear of doors.
    - **Bar ads** carry that station's own bar name and say DRINKS.
    - **Outfitter ads** say OUTFITTERS / SHIPYARD where the station has a
      yard. Where it has none, they say OUTFITTERS / AT and the name of a
      port in the system that does.
    - Each ad has a big **< or > arrow** at the end that points along its
      wall toward the bar or the yard counter, as you face it.
  - **Each faction dresses its own stations** (from the port's livery). The
    rooms and their layout stay the same; only the look changes.
    - **Free ports** keep the neon-and-grime look.
    - **Navy** ports are clean and blue-grey, with white light and almost no
      grime. Tall rooms hang blue banners with a white chevron.
    - **Syndicate** ports are near-black and oxblood, with gold trim round
      every room, red and gold neon, and black banners with a gold diamond.
    - **Pirate** holes are rust, with graffiti on the walls, a third of
      their light fittings dead, and twice the grime.
  - Code:
    - `dressing.js`: `STYLES` / `useStyle`, `dressCargoHall`, `placeAds` /
      `adBoard` / `wallSpans`, and `factionDetail`. `apply(plan, seed, opts)`
      now does a second pass for ads and faction marks on its own random
      stream, so the first-pass dressing of every room is unchanged.
    - `walk.js`: the cargo hall room and freight item, the concourse moved
      back by 18 m, and `FACTION_PAL` for walls and floors.
    - `main.js`: passes `livery` and `outfitter` (`outfitterFor`), and the
      freight counter.
    - `npc.js`: the freight clerk.
    - `dressing.test.js` has 14 new checks: the hall is between the spine
      and the concourse, the aisle is clear, each faction's marks are there
      and only there, the rooms are unchanged, and every station has ads.
    - Probe: `tools/probe-faction.js`.

- **A NOTES tab on the F5 ship screen (2026-10-30).** Astra: *"add a Notes
  section to the F5 menu, under a new tab."* She chose both a notepad and a
  log the game keeps, saved with the game and exportable to a file.
  - **Tab order:** STATUS, GUNS, PANELS, then NOTES (Tab cycles; the tabs are
    clickable).
  - **The notepad** (left).
    - Click it, press Enter or W, or press WRITE to type.
    - It is multi-line: Enter is a new line. Backspace and Delete work, with
      Ctrl to delete a word. The arrows move the caret, Ctrl+arrows move a word,
      Home/End go to the line's ends, Ctrl+Home/End to the text's, and Page
      Up/Down move a page. Ctrl+V pastes.
    - Clicking puts the caret where you clicked. Long lines wrap.
    - While you write, it takes the whole keyboard, so a 7 in a note does not
      flip an instrument page.
    - Esc stops writing and throws nothing away, because the text goes into
      the save as you type it. Leaving the tab stops writing too.
    - Capped at 20,000 characters.
  - **Who owes whom** (top right): read off the captains' own memories, so
    it always matches what a captain will say to you. Captains who owe you
    come first (green), then the ones you owe (amber), each with the reason.
    `Favours.addDebt` now keeps the ship's name on the memory (`who`,
    `debtAt`). A memory saved before this shows the ship's id instead.
  - **Ship's log** (bottom right): newest first, with ALL / PEOPLE / CRIME /
    TRADE / TRAVEL filters. The arrows, Page Up/Down and the wheel scroll it.
    Each entry has its kind, the game clock and the star you were at. The same
    line twice within a minute is folded into one, counted. The last 300 are
    kept.
  - **What gets written to the log:**
    - rescues (each load of mass passed, and the payment);
    - hold-ups (cargo dumped, cash box, transfer, purse);
    - being robbed;
    - every crime reported, with the bounty and the faction's name;
    - witnesses paid or leaned on;
    - bounties cleared and turning yourself in;
    - kills;
    - favours called in, asked back, given or refused;
    - captains who join you as partner or crew;
    - the Syndicate tithe, paid or refused;
    - contracts and passages, done or failed;
    - every ledger line: market and ship-to-ship trades, wages and berthing,
      fleet arrivals, hulls and modules delivered, a tender's rescue of you;
    - arrivals in a system (marked the first time), and dropping out of
      slipspace in deep space.
    `hooks.ledger(text, kind)` takes an optional kind, so a cash box or a
    rescue payment is filed under what it was rather than as trade.
  - **EXPORT** (or E) downloads a .txt: the notes, who owes whom, then the
    whole log. It is CRLF for Notepad, and named after the ship and the game
    clock. The game runs with no Node in the page, so this is the browser's
    own download, and Electron asks where to save it.
  - On the notes tab, Del no longer reaches the inventory's jettison, so it
    cannot throw out cargo you cannot see.
  - New `src/journal.js` (global `Journal`). `test/journal.test.js` (56 checks)
    covers the log, the debts, the export, the notepad's editing, and saving.
    `render.test.js` drives the tab through the real keyboard handler.
    `upkeep.test.js` checks that a rescue and a hold-up land in the log.

- **The walkway inside the ship is dressed (2026-10-30).** Astra: *"add some
  more detail to the walkway inside the ship."* The passage was ribs, one light
  strip, lockers and two hazard lines in a dark box. Now it has:
  - floor plates, with a tread runner down the middle;
  - kick plates along both walls, with low path lights set in them;
  - panel seams on the walls between the ribs;
  - a handrail at hip height down the port wall;
  - two pipe runs under the ceiling, with coloured bands, and a cable tray on
    the other side;
  - vent grilles in the ceiling either side of the light;
  - a fire extinguisher by the aft door and a first-aid box by the fore one;
  - lit signs with arrows: BRIDGE (LIFT on the decked hulls), CARGO, and
    AIRLOCK beside its door. Each arrow points the way along the passage, as
    seen from the wall it hangs on.
  - Everything stays within 16 cm of a wall or lies flat on the floor, so the
    walkway is as wide as it was. `boarding.test.js` checks this on all 18
    one-deck hulls. Nothing draws from the rng, so no deck lays out
    differently.

- **A container for each kind of cargo (2026-10-30).** Astra: *"let's
  create some different models for the different cargo types."* Claude
  Design drew nine from the brief, and they now fill every hold:
  - The nine: a freight crate, a bulk hopper, a cryo tank, a liquid tote, a
    reefer, a livestock pen, a shielded cask, a secure case and a lumber
    stack. Each has its placard pictogram and its own lamp.
  - Every commodity ships in one of them (`CargoKit.kindFor`): hydrogen and
    military drive fuel in cryo tanks; ores, rare metals and grain in
    hoppers; water, chemicals and wine in totes; fish, fruit, medicine and
    gene therapies chilled; livestock penned; waste and fissiles in casks;
    computers, AI cores, luxuries and fusion cells locked; timber strapped;
    everything else crated.
  - Each container's manifest strip prints the real cargo's name in a
    5x7 pixel font.
  - Containers face the aisle and stack two high, not three. At a metre
    tall, a third would reach the lights. A full hold is now two to a slot,
    and each stack's label gives tonnes to a tenth under 100 t, so the
    labels still add up to the manifest.
  - How it is built: the sheet is in `ref/cargo/`, as the GLBs and
    `cargo_specs.json`. `tools/cargo-kit.cjs` reads the parts (boxes,
    cylinders, a square hopper, the cask's lid disc) and samples each
    placard's texture onto a 16x16 grid of its two colours. It writes
    `src/cargokit-data.js`, and `src/cargokit.js` builds the containers
    into the hold's own vertex-coloured mesh. There are no textures and
    nothing new to load. A full 2.5x Mule hold (68 stacks) comes to about
    72k triangles.
  - `boarding.test.js`: there are nine kinds; every commodity has one;
    each container builds whole and fits its 1.1 m slot; two stack under
    the lights; the strip spells the cargo; and a full hold stays a
    reasonable mesh.

- **Other ships carry fuel and money, and some run dry (2026-10-30).**
  Astra: *"how expensive would it be to track her money and fuel? Having
  other ships in need of fuel can give us a reason to buy a rescue tender
  for ourselves."* Nothing is simulated tick by tick: like the timetable,
  all of it is worked out from the clock (`src/upkeep.js`).
  - **Her tank.** She leaves full, arrives with 60% left, and refills early
    in her layover. It grows with her size, the way her hold does.
  - **Her purse.** Her float, plus her cut of each leg (5% of what she
    carries), paid over to her owners every six legs.
  - **Breakdowns.** On about one leg in eighty a scheduled trader's
    reaction-mass tank lets go early in the leg (8-22% of the way). She
    burns what is left to go into orbit where she is, then drifts on that
    orbit, tumbling slowly. Feeders, the heavies and your own fleet never
    break down. In the survey that is about one ship adrift per system
    every four to five days (288 in 26,852 legs).
  - **Her mayday is real.** While she is adrift she is on the distress
    band, the beacon follows her, and the call says what she needs:
    *"Anyone with 20 tonnes of mass to spare, we will pay."* The port she
    was bound for sends a tug, which reaches her 12-48 hours later and
    always before her next departure. After that she is in her berth and
    back on her timetable.
  - **Passing her mass.** F4 on her call: "Pass her reaction mass", within
    50 km and matched to 100 m/s, with "Lock her up" to put the nav lock on
    her. Hydrogen in your hold goes first, then your own tank above a 2 t
    reserve. A part-load is banked, so a second trip can finish it. That is
    what a tender, or a hold full of hydrogen, is for.
  - **When she has enough**, she pays what she can from her purse (1.5x
    hydrogen's price plus 400 cr for the trip), owes you a favour,
    remembers that you saved her ship, and flies herself home from where
    she is. Once she is out of sight she is back on her timetable, and that
    leg stays rescued.
  - **Her screens show it.** Aboard her, the SHIP page shows her purse next
    to her name, and her real reaction mass, with "TANK GONE" when it has.
  - **Saved:** `npcLedger` holds what you passed, what was paid and which
    legs you rescued, keyed by system and route. It is put back on the
    routes after a load.
  - **The schedule's own maydays are bait only now.** `messages.js` used
    to put real traders on the band as well, and they were phantoms: the
    ship named in the call flew on along her timetable while her beacon
    sat where she wasn't. Real maydays now come only from ships that are
    really adrift. Pirate lures stay at about the same share of the band
    where pirates work (3% of four-hour slots).
  - Rumours' berthing times follow a breakdown too: a ship that broke
    down tells the port she was bound for when the tug brings her in.
  - `test/upkeep.test.js` (46 checks): how often legs break, that she is
    exactly where her timetable had her at the leak, that she stays on a
    bound orbit clear of the body, the tow, the tank and purse curves, the
    call, a part-load and a second trip, being paid, flying home, and
    surviving a save. `messages.test.js` now pins bait-only, and
    `rumours.test.js` checks berths against the real states.

- **Boarding, slice two: aboard a ship in space, by invitation (2026-10-29).**
  Within 25 km of a trader, F4 offers "Ask to come aboard". If she agrees
  ("Hold where you are and we will come to you"), she leaves her lane and
  comes alongside to 30 m off your hull.
  - Her tube runs out to your hatch over six seconds; the contacts box
    follows it: "coming alongside", "running her tube out", "tube made
    fast".
  - While joined, she flies the pair and you ride with her: her drives go
    cold and she coasts on her own orbit. Time runs at normal speed.
  - O gets you up; your airlock cycles out into the tube instead of
    onto a ramp; down the tube and up into her airlock; her controls
    cycle you in. Her crew are aboard and her master will talk to you.
  - Back the same way. U in the seat, or "Reel the tube in" on F4, lets
    her go, and she goes back to her lane.
  - She gives up after ten minutes if you never get close enough.
  - `tools/probe-tube.js` (muted) runs the whole loop: she joined in 37 s
    from 7.7 km, held 30.0 m for the walk across and back, and her
    velocity changed by 0.11 m/s (gravity) while joined.
- **Conversations work with the mouse (2026-10-29).** Astra: *"NPC
  dialogue trees should be mouse-navigable."* Clicking a reply already
  chose it, but nothing on the panel showed that.
  - The reply under the pointer now lights up with a bar and a ▶.
  - The pointer becomes a hand over a reply you can choose; a greyed-out
    reply shows its reason without changing the pointer.
  - When the conversation is over, a click anywhere on the panel walks on.
  - The number keys still work. The probe (`tools/probe-talk-mouse.js`,
    muted) hovers, clicks a reply, clicks Goodbye and clicks the panel shut,
    using the mouse alone.

- **Boarding, slice one: aboard another ship at a station (2026-10-28).**
  Astra chose boarding to come next, in three ways (docked beside her at a
  station, invited in space, a disabled ship by force), with a standoff
  you talk your way through when her crew don't want you there. Once
  aboard you can talk to the crew, trade with the captain, recruit, and
  take cargo. A ship ends up disabled in either of two ways (her drive
  knocked out, or her crew surrendering), and those are slices two and
  three. This is the first.
  - **Every ship moored at the port has a berth and a hatch on the
    station deck** (`walk.js` `others`). E on her hatch takes you up into
    her airlock, the way your own does. The deck grows berths to fit
    everyone without changing what its seed draws.
  - **She is walked as a real hull.** Her class flies the same library
    model as one of the player hulls (`hullForClass`, measured: every
    traffic class has one), so her rooms are `Render.shipInterior`'s and
    her airlock is `airlock.js`'s. Every walking path that used to say
    `G.ship` (the frame, the airlock, the ramp, the lift) now asks
    `walkHull()`. Your own airlock keeps running while you're aboard her.
  - **Her crew are the faces from the concourse** (`Npc.visitScene` over
    `crewForShip`). Her master holds her helm. Her gunner, engineer and
    co-pilot take her consoles. Hands with no console stand their watch
    where they belong: marines at the airlock, a loadmaster in the hold, a
    medic in the medbay.
  - **What you can say aboard** (`dialogue.js`):
    - her master offers *"Can we do business?"*, which opens the
      hailed-ship trade board on the comms page, at its prices and with
      its refusals;
    - her pilot, engineer or gunner can be asked to *"Fly with me
      instead"*. That costs half again the crew hall's signing fee, and
      the hand refuses if they're cold toward you, or lawful and only
      neutral. Their rating is a pure function of who they are. Once
      signed, they leave her deck and the bar.
  - **Her hold says what is really in it**: her contact's manifest
    through `Combat.holdOf`, the same source her trade board, a robbery
    and a kill all read. Moored, a ship has usually unloaded, so the line
    says so and names the load going in for her next run.
  - **Her consoles are hers.** Her seat, stations, turret and drive
    console tell you whose they are rather than letting you sit down.
- **Crates in a hold are what is in it (2026-10-28).** From the open
  list: *"cargo crates are random. They don't reflect what's actually in
  your hold."*
  - Yours and hers are now stacked from the cargo (`shipdeck.js` `load`,
    `Render.holdLoad`): none in an empty hold, every slot three high in a
    full one, filled from the door aft.
  - Each crate is tinted by the goods in it, so one cargo reads as one
    colour and a mixed hold as bands.
  - The room is rebuilt when the hold changes by a tenth or its goods
    change, not on every tonne.
  - With no ship to ask, the old seeded scatter is unchanged.

- **Women and men, every skin tone, every build (2026-10-26).** Astra: *"We
  should make sure that the female characters are well represented in race
  and bust size, as it is important."*
  - Who is a woman is decided per person (`People.sexOf`), and the portrait
    follows the body under the suit, so the sketch and the figure agree.
  - **The split (same evening).** Astra: *"let's be representative of how
    it's a nearly 50/50 split, in terms of men and women born, gender
    identity notwithstanding, and that smaller, more violent cultures might
    only survive by keeping the women out of the fighting."* So
    (`People.P_MALE`):
    - **Big societies** (civilian, navy, Syndicate) sit near the birth ratio
      overall, about 52% men, with a mild tilt: 60% men in the fighting jobs
      (marines, tactical, heavies, enforcers, security, gunners) and 44% in
      the rest.
    - **Pirates** are the small, violent culture. About 95% of their fighters
      are men; the women aboard (about 65%) keep the ship running.
  - Women and men both come in all seven skin tones at even odds, measured
    over 3,000 people: no tone is favoured for either sex.
  - Women's bodies come in five bust sizes (`People.BUSTS`: 0.45, 0.65, 0.85,
    1.0 and 1.15 of the stock body), seeded per person. The shape is changed
    before the body is measured, so vests, harnesses and plates are fitted to
    her, not to the stock body.
  - A woman's portrait draws from the same features, eased: a lighter jaw
    and chin, finer brows, fuller lips, no beard or stubble, and a buzz cut
    where the dice gave a receding horseshoe.
  - Tests: big societies are 47–56% men; over 90% of pirate raiders are men
    and most pirate engineers are women; all seven tones for both sexes;
    every bust size turns up; the portrait matches the body and no woman is
    bearded; a bigger bust measures deeper.

- **The people are Quaternius' bodies now (2026-10-26).** Astra, looking at
  free character kits: *"let's do the quaternius models"*. The 3D people
  stand on Quaternius' Universal Base Characters (the two in the free
  Standard pack, a male and a female body) and move with his Universal
  Animation Library. Both are CC0 (`assets/quaternius/LICENSE.txt`).
  - **What stays:** every role's look. The helmet, pack, vest, harness,
    exo-frame, rifle, boots and the face kit are still built by
    `npcmodel.js` as before. They're lifted onto the new skeleton by
    `people.js`: head kit is fitted to the head, chest kit to the torso's
    width at each height, arm kit is swung out to the new body's T-pose,
    and leg kit follows its joint. The suit's paint (each role's markings and
    the ship's livery) is wrapped round the new body by matching texture
    coordinates part by part.
  - **Animation:** standing, talking, walking (timed to the stride, so feet
    land where they step), sitting at a station and talking while seated,
    and working. The clips blend as people start and stop. Each body takes
    the library's clips through a retarget pair a bone, since the bodies
    are proportioned differently from the clip rig.
  - **Who gets which body:** seeded by name and role, so a person is always
    the same body.
  - **Pipeline:** `tools/glb2people.cjs` reads the packs (.glb or .gltf),
    folds the 30 finger bones into the hands (23 bones left), resamples
    every clip at 30 fps and writes `src/people-data.js`. `src/rig.js`
    samples, blends and poses at runtime. `npcgl.js` draws a body (smooth,
    four weights a vertex) and its kit (flat, one bone a vertex) through
    one program.
  - **Fixed on the way:** torsos torn into shards in the game but not in
    previews. The deck position was folded into every bone matrix in single
    precision, and a chest vertex blending four bones landed in four
    slightly different places. A person is now posed about their own feet,
    and the place they stand is added once, in the draw. The pass also
    forces depth writes on.
  - **Not yet:** the old box figures are still built, since they hold the
    paint and kit the new bodies borrow and they're the fallback without a
    GPU. Hands are bare under the gloves' colour, not gloved shapes.

- **The overboss's tithe (2026-10-26).** Astra: *"in Syndicate controlled
  systems, paying a tithe to the overboss or whatever is a great way to show
  you're not Navy or Police."* Asked, she chose:
  - **Two places to pay it.** The overboss's collector hails you when you
    arrive in a Syndicate hold, and a fixer (or any Syndicate face) in the
    bar of one of their ports takes it too.
  - **Paying buys all of these:**
    - their patrols and their pirates leave you alone in that system;
    - a little standing with the Syndicate (+2);
    - their own doors (Syndicate-issue guns, hulls and livery, and anything
      on a Syndicate port's shelf) read you 15 points higher;
    - 5% better prices both ways at their ports.
  - **Refusing marks you SUSPECTED** of being Navy or Police in that system.
  - **The law doesn't care.** In her words: *"Even the lawful empires
    treat the Syndicate as better than pirates, but worse than civilians.
    It's well known that they tax travellers in their space, and the
    general advice is to pay the tithe and keep problems from following you
    back to your home port."* Paying touches no lawful faction's standing or
    record.

  How it works (`src/tithe.js`, new):

  - **The call.** On arrival in a hold the collector names his price; the
    log tells you to press F4 to answer. His channel (`$`) is at the top of
    the comms list, with three choices:
    - **Pay**;
    - **Haggle**: once per call, and it can go up as well as down. The
      roll is seeded by system and day, so reloading doesn't change it;
    - **Refuse**.
  - **Ignoring him** for 10 minutes counts as refusing.
  - **The price.** 150 cr, plus 120/300/800 for a medium, large or extra-large
    hull, plus 3% of what the hold is worth. A friend of the Syndicate pays
    as little as half; someone they dislike pays up to 1.6×.
  - **How long it lasts.** A tithe covers that one system for a week of
    game time. Come back after that and he calls again; inside the week, he
    tells you your mark is still good.
  - **Left alone** (`sim.js`):
    - their pirates and patrols that wake near a ship that has paid only
      shadow it;
    - a pirate that is already holding you up breaks off when you pay;
    - a Syndicate patrol about to inspect you waves you through.
  - **Suspected**, for a week:
    - a Syndicate patrol searches you at least 90% of the time;
    - it looks again every ten minutes it holds on you;
    - their pirates don't break off when a patrol is near.
  - **Clearing suspicion.** Paying late, at 1.25×, on the channel or across
    the bar.
  - **Better prices** apply to the market rows of a Syndicate port while
    you're paid up. The port's own book is unchanged.
  - **The fixer** remembers that you paid through them.
  - `test/tithe.test.js` (46 checks).

- **A way out of every ship: an airlock and a belly ramp (2026-10-26).**
  Astra: *"create a set of stairs/ramp which can be opened from both inside
  and outside the ship and which allows travel from inside to outside of
  the ship"*, *"ensure that all models have a pathway to the exterior which
  will seal against vacuum"*, and *"climb into them from the ramp, up and
  into a room which seals the ramp and then perpendicular to the ramp is
  another airlock door which opens into the main interior of the ship."*
  Asked: you suit up in the airlock on airless worlds; the inner door and
  the ramp are **never** open together; a belly ramp on every hull.
  - **The airlock** (`shipdeck.js`) is a sealed room off the port side of
    the passage. Its inner door (`lock`) is across the room from the ramp
    well, at right angles to the ramp. Its controls are on the outboard
    wall, and a lamp shows red while sealed and green while open to the
    outside.
  - **The cycle** (`airlock.js`, new): every trip in or out pumps for 5 s,
    and only once both ends are shut. The inner door is locked whenever the
    room isn't at the ship's pressure. Cycling out while landed lowers the
    ramp; docked, it opens the berth hatch instead. Cycling in raises the
    ramp first. Nothing out there in flight: the controls refuse.
  - **Three ways down**, picked by how far the deck is off the ground under
    her gear: a 30° ramp, a 42° stair where a ramp would be too long, or a
    lift platform (2.6 m) on the tall hulls (Sump, Tanker, Meridian,
    Leviathan, Heavy Tug, Crawler). Treads, rails and hazard edges; the
    ramp swings from its hinge in 4 s.
  - **Walking out.** Walk down the ramp (or ride the lift) and you are on
    the ground beside her. You can see her from outside on her gear, with
    the ramp down, standing on a ground patch tinted for the world. There's
    a post at the foot of the ramp that raises and lowers it from outside.
    Under a low belly you crouch (the Crawler's needs a crawl). Chart
    overlays are hidden while you're outside.
  - **From outside** the hull is cut open under the ramp well, with the
    well walls and the lit airlock above it.
  - `test/airlock.test.js` (24 checks): every hull's rooms fit inside her
    model; the door is perpendicular; the ramp foot reaches the ground; a
    flood-fill walk from the cockpit reaches open ground; the seal state
    machine never has both ends open.

- **ENGINE and WEAPONS pages on the cockpit MFDs (2026-10-26).** Astra:
  *"Ship interiors require MFD panels which show things like engine fuel,
  heat in weapons, number of missiles and their hard points, etc. use some
  kind of graphic to identify systems from one another."*
  - Every system has its own colour and glyph (`SYS_COLOR`, `SYS_GLYPH`),
    used on every page, so a system reads the same at a glance wherever it
    appears.
  - **ENGINE**: slipspace fuel, reaction mass, reactor load, and gravity
    against thrust.
  - **WEAPONS**:
    - a heat thermometer with ticks at 55% and 100%, beside a live column
      for the heat sinks;
    - each hardpoint as a box with its gun glyph turned to the muzzle side,
      its fire group, its heat per shot and its cycle bar;
    - missile racks as silhouettes, with an arrowhead on the armed rack;
    - a strip for sinks, shield and turret.
  - The panel list on the side screens shrinks its rows to fit (min 14 px).
    `G.dashPage(id)` switches a page for playtests.

- **Each role's suit in its portrait, and the face kit on the suited body
  (2026-10-26).** Astra: *"let's make a variant for each class type, since
  some of that would still be visible in person like that."* Asked which she
  meant, the suit in the portrait or the kit on the 3D figure, she said both.
  - **The portrait shows the suit that body wears.** The sitter is drawn a
    little smaller so the shoulders get room, and the collar and shoulders
    are that role's suit, in the same colours the body is built in
    (`NpcModel.suitOf`: a crew role takes the ship's outfit, a faction role
    its own):
    - pilot: harness straps crossing the chest, seal ring in the accent
      colour;
    - engineer: a reflective yoke, and a chest pocket with a pen;
    - gunner: a quilted vest under a steel flak collar;
    - security: a vest with the SECURITY strip, a shoulder radio, and an
      arm band;
    - tactical: a chest plate and dome pauldrons;
    - medic: white sleeves, a sash, and the green disc with its staff;
    - loadmaster: the exo-frame bar across the shoulders with hazard
      chevrons, and the radio mast with its light;
    - raider: the stolen navy pauldron, a patched sleeve, and stitched
      patches;
    - pirate captain: lapels, a red sash, the steel arm with rivets, and
      trophy plates stacked on one shoulder;
    - enforcer: a high collar and black lapels;
    - heavy: an armour plate, big pauldrons and a gold line;
    - fixer: a white shirt, a gold tie and the gold seal ring;
    - marine: a chest plate with white chevrons, square pauldrons with
      white trim, and the rig straps;
    - officer: a white placket, white epaulettes and gold pips.
  - **The kit shows on the 3D figure where a helmet wouldn't hide it.** It
    is the same roll as the portrait (`Portrait.gearOf`, which `npc.js`
    hands to `NpcModel.build`), fitted to each role's helmet (`HEAD_FIT`;
    the slab helmets of tactical, marine and heavy sit flatter):
    - an eyepiece: a lens glowing over one eye on the visor, with its
      housing on the shell;
    - a cyber-eye: a hard point of light behind the visor;
    - goggles: strapped round the outside of the helmet;
    - a rebreather: filter canisters and a grille at the chin;
    - a headset: a whip antenna with a red tip.
    Glasses, shades, an eyepatch, an earpiece, tattoos, piercings and face
    paint are all under the helmet, so only the portrait has them. A piece
    the role's helmet already carries isn't doubled: the gunner's eyepiece
    and ear cups, the raider's goggles, the captain's red eye.
  - Tests: kit is built onto the body and cached; hidden kit leaves the
    body bare; every role takes the kit; suits come in the right colours;
    the portrait and the body share one roll. Probe: `tools/probe-kit.js`.

- **Haircuts in the portraits (2026-10-26).** Astra: *"the hairstyles
  appear identical across all the faces."* The 3D body has six hairstyles,
  and under a helmet nobody sees them. The sketch had only been drawing those
  six, and four of them came out as the same cap-shaped mass. Now each face
  rolls a cut of its own, from the body's family:
  - short: crop, side part, fringe, quiff, curls, afro, undercut, top knot,
    widow's peak;
  - long: loose, waves, ponytail, bun, bob, braids, locs;
  - slick: slicked back, slick side part, undercut, widow's peak;
  - buzz: buzz, fade, cornrows;
  - bald: bald, horseshoe (more likely over 50);
  - mohawk: mohawk, spikes, a low curly hawk.
  - The cut is rolled in its own seeded stream (`'cut|'`), so the rest of
    every face stays exactly as it was. The table is `CUTS` in
    `src/portrait.js`.
  - **Any face, any cut (same day).** Astra: *"we aren't modelling hair on
    the 3D models for the NPCs anyways."* So the portrait no longer keeps to
    the body's family of hairstyles, and the list above is just the set of
    cuts. Every face draws from all 26 cuts by weight (`CUT_ODDS`). A role
    makes a few cuts more likely (`CUT_LEAN`):
    - raiders: hawks, about a quarter of them;
    - marines and tactical: buzz and fade;
    - officers: side parts and buns;
    - fixers: slicked back;
    - captains: long hair and locs.
    The old forced styles (every raider a mohawk, every fixer slicked) are
    gone. A pirate captain still has a beard. Past 54, a fifth of faces go
    bald or horseshoe. The horseshoe's side tufts are soft ovals now, not
    boxes.
  - The hair is drawn as locks (clumps of strokes) rather than evenly spaced
    lines, which had read as a knitted cap. It has a band of sheen and a
    soft hairline. The crown now sits above the skull: before, the skull's
    top showed as a pale band over short hair.
  - Hair that hangs behind the head (long, bob, ponytail, braids, locs,
    afro, bun) no longer tints the face with its colour wash.
  - `tools/portrait-sheet.html` names each portrait's cut in its caption.
  - Tests: a crowd of 300 has at least a dozen different cuts, and all 26
    turn up; raiders lean to hawks; a face keeps its cut; every cut has odds.

- **Colour in the portraits, and a randomiser for the kit people wear on
  their faces (2026-10-26).** Astra: *"colorize them somewhat and then give a
  script to randomize things like eyepieces, rebreathers, etc."*
  - The sketches keep their pencil, with a light wash of colour laid under
    it: skin and hair in the body's own colours, an iris colour, some warmth
    in the lips and cheeks, and the suit collar and shoulders in the
    livery's colour (teal-grey for civilians, navy blue, charcoal and gold
    for the Syndicate, rust for pirates).
  - Each face is rolled a kit from twelve pieces: eyepiece (a monocle HUD
    with an LED by the ear), cyber-eye, eyepatch, rebreather mask with side
    canisters, goggles pushed up on the brow, glasses, shades, earpiece and
    wire, headset with boom mic, piercings, a tattoo (neck barcode or cheek
    chevrons) and face paint. Each piece goes on the left or right side.
  - The odds are per role, in one table at the top of `src/portrait.js`
    (`GEAR`). Gunners mostly wear an eyepiece, raiders and captains go for
    cyber-eyes, patches, ink and metal, engineers and loadmasters wear
    goggles and rebreathers, and security wears an earpiece. A second
    table (`CLASH`) keeps pieces that can't share a face apart, such as a
    patch and glasses, or two things on the same eye.
  - It's seeded from the person, in its own stream, so a person always has
    the same kit and their face doesn't change.
  - `tools/portrait-sheet.html`: open it in a browser to see a sheet of
    portraits by role and livery, with a tally of the kit. Change the odds
    in `GEAR` and reload to see the spread.
  - Tests: the kit is the same every time; every piece turns up in a crowd
    of 400; no clashing pieces are worn together; and plenty of faces wear
    nothing.

- **Talking to people on foot (2026-10-25).** Astra: *"let's make sure we
  have some more complex dialogue trees for NPCs, based on a few rules which
  already exist for the comms traffic."* Asked, she chose all four of those
  rules, and that talk feeds the systems the game already has. E on anyone
  on a deck opens a conversation: their line over numbered replies (1–9 or
  click). Greyed replies say why they are not open to you. Esc, Goodbye or
  walking away ends it. They stop and face you while you talk, and the
  pointer is free until you walk on.
  - **Temper and values**, drawn with the same weights a captain's chair
    uses: port security leans lawful, nobody in a Syndicate jacket is an
    abolitionist.
  - **Their opinion of you** comes from the same rules a captain on the
    band uses (`Captains.judge`, split out of `opinion` for this). Station
    people know what their port has heard (`Rumours.tallyAt`). A docked
    ship's crew speak for their captain. Your own crew know your whole
    record, and whether they have been paid. A furious face offers only
    Goodbye.
  - **Memory, no repeats.** Each person remembers what passed between you
    (`G.people`, saved) and brings it up. They never open the same way twice
    running.
  - **Lies are checked.** "What is your business here?" is answered with
    the comms page's claims, checked against the real ship by
    `Messages.check`. Customs and marines always read your manifest, and
    lawful or principled port security can pull it. A caught lie goes in
    their memory and on your public record.
  - **What talk can do:**
    - Buy a round, once a day, which warms the bartender and loosens the
      talk: who in port can't stand whom, raiders on the lanes, and whether
      the officials can be bought.
    - Ask who is in port and how each captain feels about you.
    - Read the market off the clerk.
    - Ask the yard about your hull, and about new papers.
    - Haggle a hand down (once each). They sign on at the agreed fee and
      wage, through `wageMul`.
    - Pay a warrant at the customs desk.
    - Buy friends in a port from a fixer (`Combat.bribePort`).
    - Ask a docked crew about their captain, where they are bound, and
      whether she owes you (`Favours`).
    - Ask your own crew how the ship is (real numbers) and how they are
      holding up.
  - Fixed on the way: on foot, the icon bar added ten click targets every
    frame and nothing cleared them. The walk overlay now rebuilds the list
    each frame, as the cockpit does.
  - Tests: `test/dialogue.test.js` (new, in `npm test`). Probe:
    `tools/probe-dialogue.js`.

- **The Capital and the Carrier at their true size, flown from the conning
  tower (2026-10-25).** Astra: *"Let's fit the cockpits to the Carrier and
  Capital class ships to align with where the conning tower is on the
  model, and the rest of the ship should be visible since the tower has a
  360 degree window views."* At 25 m the Capital's observation gallery was
  33 cm tall, so asked, she chose **true size in the world**: the Capital
  is **250 m** and the Carrier **300 m**, everywhere — drawn, fought and
  berthed at that length. Every other hull is still 25 m.
  - **The bridge is in the tower.** Your seat and the bridge deck sit in
    the Capital's observation gallery (eye 37.9 m up, in its window band)
    and in the Carrier's island cab (20.5 m up, over the flight deck). The
    cockpit view, walking aboard, your crew at their stations and the rear
    view all use that position; the ship turns about her own centre as
    before.
  - **360° glass.** The bridge deck's side walls, the aft bulkhead either
    side of the door and the lift lobby are glazed. From the bridge you see
    the rest of her — decks, terraces, mast, turrets, the flight deck —
    with the gallery or cab you are standing in left out of the model so
    its walls do not block the view (its floor stays, just below the
    sill). Below the bridge the decks are closed rooms, as before.
  - **The tower's height.** The lift drops 41.5 m to the Capital's main
    deck and 35 m to the Carrier's, at 8 m/s (about five seconds). The
    first guesses were 14 m and 10 m.
  - **Docking:** a port needs a bay big enough for her real size. Nearly
    every yard and highport has one; where none fits, docking is refused as
    TOO BIG. A port without modelled bays still takes her.
  - **Outside:** the chase camera, its zoom limit, the exhaust, re-entry
    plasma and shield all scale with her length, and the guns fire from
    where they are on a 250 or 300 m hull.
  - NPC traffic is unchanged: the NPC capital class is still 520 m.
  - **Screens on the bridge deck (2026-10-25).** Astra: *"On that conning
    tower bridge should be MFD panels which are configurable, as with the
    smaller ships."* The helm's own screens were already there; now every
    crew station on the bridge deck carries a live MFD across its face, with
    the same pages as the helm's. F5 → PANELS gains a HELM / BRIDGE DECK
    switch on these two hulls: the bridge deck is laid out bow-up with each
    wall's stations, and ◀ ▶ arrows point to the wall each screen is on.
    Gunnery starts on NAV / TARGET, Engineering on SHIP. Like the helm's, the
    choices last for the session. The station screens are only drawn when
    you can see them: walking the bridge deck, or turned round in the seat.
  - Tests: `test/towers.test.js` (new, in `npm test`); `shipdeck.test.js`
    allows the tower's extra panes.

- **Decks, a lift and a tram on the big ships: conning towers (2026-10-25).**
  Astra (2026-10-24): *"for the Capital and Carrier ships, there's a conning
  tower, which means the Bridge is on the top of it, and an elevator must be
  used to traverse from that to the flight deck or other parts of the
  ship."* The flight deck is the Carrier's hangar; the stops are the
  bridge, the main deck and airlock, the hangar, and a junction from which
  engineering is reached; the XL hulls without a tower get decks and a lift
  too. Asked on 2026-10-25: the lift is a **real ride**, the hangar holds
  **your parked craft**, and the long way aft to engineering is a **tram**.
  - **Which hulls:** Capital, Carrier, Meridian, Leviathan, Crawler. The
    bridge stands above the main deck by the tower: Capital 14 m, Carrier
    10, Leviathan 8, Crawler 5, Meridian 4 (Capital and Carrier since
    measured off their models at true size: 41.5 m and 35 m, see above). Every other hull is one deck, as
    before.
  - **The decks** (shipdeck.js): the **bridge** (cockpit, stations, the
    bridge door, a lift lobby); the **main deck** (passage, quarters, medbay,
    turret if fitted, airlock and cargo bay — where you come aboard); the
    **junction** 3.2 m below it (a tram platform, a 30–38 m tramway, the far
    platform and the **engine room**, which moves down here from the
    passage on these hulls); and on the Carrier the **hangar**, a 22 × 40 ×
    9 m bay with three pads and its doors lit at the aft end. The bridge
    deck runs forward of the lift shaft and every other deck aft of it, so
    no deck is ever seen from another but through the lift.
  - **The lift:** one car in one shaft, a door on every deck. Inside, a
    button per other deck on the starboard wall, marked **▲** up or **▼**
    down; you press the one you are LOOKING at (walk.js now picks such
    things by gaze, not by nearest). The doors close, the car moves at
    3 m/s with you in it — the eye moves, the keys rest — and the doors
    open on the new deck. Each landing has a lit panel showing which deck
    it is.
  - **The tram:** E at the platform's edge and it carries you aft at up to
    8 m/s down the lit tube to engineering, and back.
  - **The hangar's craft:** the small ships of your fleet berthed at the
    same port stand on the pads, in their own models at full length.
  - **The crew** (npc.js): every job knows its deck. A hand whose next work
    is on another deck walks into the lift and is gone from yours; one whose
    work brings them to your deck steps out of it. On the bridge you see
    engineers leave for the engine room and come back.
  - Tests: shipdeck.test.js walks a decked ship by the lift and checks each
    deck from it, the buttons' arrows and that the one you look at is the
    one pressed, the deck heights, the hangar clearing the tramway; npc.test
    checks crew leaving and returning by lift. `tools/probe-decks.js`
    rides the whole route in the real game (57 fps on the RX 540).
  - **Not done:** NPC ships' interiors (boarding), crew riding the tram
    with you, and conning-tower glass on the bridge to match each hull's
    exterior art.

- **Gunners on the bridge: a knack each, for the forward guns and the
  seekers (2026-10-25).** Astra: *"gunners act as a stat boost on component
  heating and energy draw requirements or increased damage/probability of
  hit for the forward facing guns. They also increase missile targeting
  accuracy."* Asked how the "or" works, she chose **by the gunner**; asked
  whether the lower draw counts at the yard, **yes**; asked whether seekers
  may lose a lock so accuracy means something, **yes**.
  - **The knack** (crew.js `knackOf`): every gunner is a **cool hand** or a
    **marksman**, a pure function of who they are (no save field). The hall
    and the crew screen say which; so do they, if you talk to them.
  - **Who gives it** (crew.js `gunnery`): a fitted turret takes your best
    gunner (as it always has); the others sit at the bridge's gunnery
    consoles, and the best of each knack there counts. Scaled by rating —
    an exceptional hand gives the full amount, a green one a fifth.
  - **Cool hand:** forward guns put up to 30% less heat into the hull and
    draw up to 25% less power — on the yard's own count, so a good one lets
    you fit more gun than the reactor carries bare.
  - **Marksman:** up to 25% more damage, and an aiming cone up to 80% wider,
    so a shot a little off the nose still connects.
  - **Every gunner, either knack, guides the seekers:** see below.
  - **Over budget** (new): pay off the cool hand who was making the fit
    legal and the ship draws more than she makes. Nothing is taken off her;
    the forward guns share what there is and cycle slower in proportion
    (20% over, a fifth slower). Paying them off says so, the reactor line on
    the ship screen goes red, and a fight reminds you.
  - **Seekers can lose a lock** (combat.js `updateMissiles`). Until now a
    missile never missed but by running out of fuel, and the Bootleg's
    "gives up if the target turns hard" was a line in the catalogue only.
    A seeker now has a track rate (Hawk 0.05 rad/s, Bootleg 0.022): when the
    target slides across its view faster than that, it may slip off and
    coast. Inside 1.5 km it is committed. From 10 km a target crossing at
    0.2 km/s is hit by both every time; at 0.5 the Bootleg hits about one in
    ten; at 0.8 the Hawk about a third — and an exceptional gunner aboard
    takes those to about 80% and 100%. "Seeker lost lock" when it happens.
  - **The turret room follows the turret.** No stock hull carries one, so
    the dome-per-gunner room from earlier today put every gunner in the
    wrong place: the turret position now appears when a turret is fitted
    (one seat, the gunner it takes), and the rest work from the bridge.
  - Tests: `test/gunnery.test.js` (22 checks: knacks, who gives what, heat,
    damage, the cone, the yard's count, over-budget cycling, seekers with
    and without a gunner, Bootleg vs Hawk), added to `npm test`.

- **The rest of the ship: engine room, turret, medbay, cargo bay, and a
  second seat on some small ships (2026-10-25).** Astra: *"S ships aren't
  all one seaters. Some have crew positions for a second pilot or gunner.
  M ships should have a small medbay, while S ships have medical supplies
  in the cockpit."* Asked which and how, she chose: the Wren and the Bollard
  get a co-pilot's seat beside yours, the Lance a gunner's console behind
  you, the Talon stays one seat; and the second seat is optional — nobody
  has to be hired to fly her, whoever you sign on sits there.
  - **M and up** (shipdeck.js): off the passage to starboard, a medbay (one
    bed on an M, two from L, a vitals screen over each and a cabinet, lit
    in white and green — no cross, it is a protected emblem) and an engine
    room (the drive trunk down the outboard wall with glowing inspection
    bands in the ship's colours, the drive console on the aft wall). To
    port, aft of the quarters, a turret: a seat per gunner (up to three),
    each under a glass dome let into the ceiling that the sky shows through
    like any window. Aft of the airlock, through a third sliding door, a
    cargo bay with crates stacked down both walls and a manifest terminal.
    The passage grows to fit both walls.
  - **S**: medical supplies on the bulkhead beside the door, and the second
    seat on the Wren, Bollard and Lance.
  - **The crew use them** (npc.js): gunners on watch sit under the turret
    domes (a bridge gunnery station only when the domes are full);
    engineers' rounds go to the drive console, now and then the cargo bay;
    off watch a hand sometimes looks into the medbay. On an S ship there are
    no watches — your hand is in the second seat, and a co-pilot takes the
    helm the moment you get up. A hand of any trade takes a free second seat.
  - **E** on the new things says what they are: the co-pilot's seat and the
    turret say who sits there, the manifest says how full the hold is.
  - **Fixed on the way:** a pilot taking the helm was planted behind the
    seat's backrest instead of on it; and the crew stopped to give way to
    you while you were sitting in the pilot's seat, which held a co-pilot
    at the door of a two-seat cockpit.
  - Tests: shipdeck.test.js and npc.test.js check every hull's rooms by
    size, that every room and everything labelled in it can be walked to
    from the airlock, the turret seats per gunner, and the crew in them.
    `tools/probe-rooms.js` photographs them in the real game.

### Added

- **2026-10-25: the Shared_AI line merged (ship interiors and people).**
  Seven commits from Driftwood's branch, ending at "Walk your own ship,
  and people on it", carried onto this line in a trial branch first. Its
  own entries follow this line's under each heading below. Where the two
  had built the same thing twice:
  - **Captains.** The NPC captains in their ships keep `captains.js`. The
    stories under the title menu moved to `captain-stories.js`
    (`CaptainStories`), with their own test.
  - **Lift rides, both kinds.** The ring's car under its heavy bay rides
    on the restored car-and-lift legs (board, lift, pad, transfer, the car
    drawn under you). A lift inside the hull (`route.ride`) is still driven
    to, waited on, ridden and left (`routePhases`), now on the transfer leg
    rather than one long enter leg. The ring's platform is no longer also
    lifted out as a mover, so it is drawn once.
  - **Moving parts after a split.** The converter's car and hatch faces are
    numbered against the whole hull; lifting movers or a city out of it
    moved every number after them, so the ring's car collided as most of
    the station. The split hull now remembers where each face came from
    (`oi`), and the converter re-reads the runs after clipping bores.
  - **survey.test.js** flies over a world that turns. Twilight worlds can
    be tidally locked now, and the first rock it used to pick is one.
  - **The cutaway.** This line's cone, cut greebles, ground-port section
    and cutaway styles are kept over the older band-and-quiet-zone shader.
    Faction paint and the slipspace tear are carried in the same shader.
  - **Docking.** Both lines had fixed the dock edge; one edge
    (`justDocked`) hands on to the contracts, the torpedo berth scan and
    the save.
  - **Arrival.** A pad is never taken as the home station: the Shared
    line's fallback to "any station" is what had put a pad with no orbit
    under spawnShip.
- **2026-10-25: survey instruments graded, carried over.** The 21 October
  commit (grade 1 scanner, grade 2 gamma spectrometer, grade 3 deep array;
  its own entry is below) was only in the older copy on C:; it is on this
  line now.
- **2026-10-25: deposits are somewhere, and a polar orbit is one key.**
  Astra: "we need easier controls to put the ship into a polar orbit for
  mapping mineral deposits. planets should have mineral deposits which are
  location-based, where you might find metals/precious metals in some
  ratio in one place, water where there's water on the surface, fissiles
  show up with the gamma spectrometer, and so on."
  - **Y on the F2 orbit map plans a polar survey orbit.** It finds the
    next time you cross the world's equator (its spin equator, the one the
    survey maps in) and puts one node there: the burn that leaves you
    circular at that height, running pole to pole, the cheaper way round.
    It is an ordinary node, so the planner shows the new orbit, the burn
    and the reaction mass before anything fires, and \ flies it. It warns
    if the orbit would be too high for the survey (three radii). Flown by
    the autopilot from an inclined low orbit (a 10.4 km/s, nine-minute burn):
    0.4° off polar, e 0.013.
  - **Every world has a ground map.** One grade per survey cell, per
    commodity. A world's grade is now its best ground; most of it is
    poorer (75% of all ground is under half its world's grade).
    - Metals come in two to five provinces. Each has its own mix: some are
      nearly all base metal, some carry a good share of precious metal, and
      where you find the precious metal you find ore with it. Ore bodies
      stand on land where a world has seas.
    - Fissiles are one to three small hotspots, which only the gamma
      spectrometer shows.
    - Water is where the picture shows it: under the seas and in the ice
      caps you can see from orbit, a little in the ground elsewhere. Lava is
      not water. An ice world is ice all over. A tidally locked world's ice
      is its night side. Worlds with no visible water have buried ice, in
      patches toward the poles.
    - A surface mining port stands on its world's ore body (94 of 94).
  - **The SURVEY page's map shows it.** Each mapped cell is the colour of
    the most valuable thing your instruments have read there (ore rust,
    precious gold, fissile green, water blue, hydrogen violet), brighter
    where it is richer. The list's swatches are the key. The ground under
    you is boxed, with a BELOW YOU line saying what is there. The grades
    in the list are the best ground you have seen so far.
  - **A drone digs the ground it stands on**, at that ground's grade, and
    says so when it is poor.
  - Seas and caps are worked out on the CPU by the shader's own arithmetic.
    The terrain table moved from gl.js to weather.js so both read one copy.
    The survey and the picture agree on every coastline sampled.
  - Fixed on the way: landing on a tidally locked world worked out the
    landing spot without undoing the pole's lean (`az`), so the ship was
    put back on the ground somewhere else the next frame.
  - `test/ground.test.js` (20 checks), `test/polar.test.js` (15).
- **2026-10-25: the burn autopilot warps through long burns.** Astra said
  yes to it: the polar plane change is a seven-to-nine-minute burn, and the
  autopilot used to hold every burn at 1x.
  - At ignition the clock goes up as far as leaves at least forty frames
    of burn, and comes down a notch at a time as the burn runs out, so the
    last of it is flown at 1x. You can take it lower yourself; the
    autopilot only ever brings it down.
  - What the engine delivered is now booked after each step, on the clock
    the integrator actually ran (the physics clamp and the impact net can
    both shorten a step), not guessed before it.
  - In the render suite's flown test: the polar burn finishes in a small
    fraction of the frames it took at 1x, and ends within 2° of polar.

- **2026-10-15: Driftwood's line merged into Abby.** Planetary rings,
  asteroid belts and Trojans, the lift car, lightning, the glass-glow
  option, cockpit greebles, faction names and the rescue fix now sit on
  Syndicate Crawler's cutaway-and-glow release.
- **2026-10-16: the 11 October test copy merged.** Station shuttles and
  drones, the ground-port section cut, the cutaway style option and the
  stand lift.
- **2026-10-16: lifts are ridden.** Lift cars, platforms and ramp cars are
  moving surfaces with collision. A ship waits for the lift, boards, rides
  the shaft at lift speed and drives off (39 station models route through
  a lift ride).
- **2026-10-16: mining, rung 1: survey.** A Survey scanner (6,400 cr,
  grades) and a Deep survey array (23,500 cr, tonnages) map a world's
  deposits from orbit along the real ground track: a polar orbit maps the
  world, an equatorial one a band. Rings map with their planet's equator,
  belts field by field. Deposits are seed data and agree with the industry
  already there. Surveys are dated, halve in value every 180 days, and sell
  once to the Mining Guild at any desk. New SURVEY dashboard page.
- **2026-10-16: mining, rung 2: claims, drones and landing.** File a claim
  (1,200 cr a year, once a quarter of the world is mapped), buy up to two
  mining drones (9,500 cr), set them down, and land on open ground to
  collect what they dug. Lawless worlds strip unattended drones. N deploys
  and collects, Shift+N recovers.
- **2026-10-16: mining, rung 3: the mining laser and gas skimming.** The
  Mining laser (4,800 cr) cuts ore chunks off rocks in a belt or ring
  (about 11 s a chunk); scoop them. Rich rocks give ore, poor ones slag. A
  Gas skimmer (7,800 cr) takes hydrogen from a giant's upper atmosphere,
  more the deeper you dare against the heat.
- **2026-10-16: R lifts off.** On the ground, R thrusts up and lifts you
  off; F thrusts down. Only R lifts off.
- **2026-10-16: rock torpedoes.** A small nuclear charge on a slow, dumb
  missile that breaks 6 to 14 chunks off an asteroid. Mining Guild
  torpedoes (2,500 cr) are sold only at mining ports; Syndicate ones
  (1,600 cr, grey) at outlaw ports or where corruption runs high.
  - **Out, never in.** Scanned inbound to a port with one aboard is an
    offence: 2,600 cr fine a torpedo, and they are seized. A Syndicate
    torpedo is seized whichever way you are going.
  - **Safing refund.** Detonate one for safety (well clear of any port) and
    the Guild pays back half its price, unless the blast was a successful
    mining shot that earned more than the torpedo cost.
  - **Sabotage.** A torpedo that goes off close to a station damages it:
    the port refuses docking for a while, and if you are caught the bounty
    is 30,000 cr and the owner's standing falls by 40.
- **2026-10-16: the ordnance panel.** Torpedoes do not launch from the
  missile key. F5 > ORDNANCE: pick a charge, lift the striped guard (C),
  then LAUNCH (Enter). The guard drops again after each launch and
  whenever you leave the tab. The panel shows the nose readout, what the
  torpedo will hit and how far the nearest station is.
- **2026-10-16: the torpedo command link.** Every torpedo in flight is
  listed on the panel with DISARM and DETONATE (D / X for the newest).
  A disarmed torpedo becomes an inert canister you can scoop back into
  the rack; the panel warns in red when you are inside the blast.

- **2026-10-17: mining, rung 4: your own skimmers.** A ship in your fleet
  with a pilot and a Gas skimmer can be put to work on a giant from the
  Fleet tab (F5, docked): she flies out, skims, comes home to the port she
  is clamped at and sells the load there, and goes back out, until you
  recall her. Or **keep aboard**: one run, and the hydrogen comes home in
  her hold (for stockpiling toward a station of your own).
  - She skims the safe way, a pass an orbit, so a run takes hours: a better
    pilot, a heat shield and an ice giant rather than a gas giant all make
    it shorter. About 1,500–2,500 cr a game day for one ship at a giant her
    port orbits; a giant across the system is honestly not worth it, and
    the row says so.
  - Every load is sold at the price on the day she brings it in, and her
    sales push that port's hydrogen price down like yours do.
  - Recall finishes the run she is on. A pilot who walks over unpaid wages
    brings her home first. Her tanks refill free alongside, as yours do.
  - She is real traffic: drawn in the giant's upper air while she skims,
    on the scope and the channel, and hailable.
  - Drone collection by your own ships was left out on purpose: having to
    land is what keeps a drone below active work. That job goes to an
    outpost on your claim in rung 5.

- **2026-10-18: the mining beam takes real pieces off a rock.** The mining
  laser cuts continuously, and every 2 t it cuts comes off as a piece to
  scoop: about 5 s on ice, 8 s on stone, 13 s on metal. Rocks weigh what
  their size and material say (a 5 m ice chunk is about 470 t), every
  piece comes off that mass, and it is carved out of the rock where the
  beam was: a crater in the rock's own surface that turns with it,
  deepening while you hold the beam on one face, with fresh paler rock
  showing in the cut. A rock shrinks as it loses mass and is gone when it
  runs out. Small ring chunks can be cut away in a session; big rocks scar.
  Torpedoes take their chunks off the same mass. The CUTTING bar shows
  tonnes toward the next piece. Saved.
- **2026-10-19: the shroud suite, silent running, and the chains that end
  with it.** Astra: a quiet jammer should be hard to come by, at the end of
  its own quest line, because a sabotage run means getting in and out
  without being detected or identified. The loud ECM stays in the yards;
  the **shroud suite** is sold nowhere. **SHIFT+X** runs silent:
  transponder dark and radiators shut. Ships notice you only inside 200 km
  (instead of 3,000). Crimes you commit are reported as an unidentified
  hull with no bounty, and so are thefts from other prospectors' drones and
  a torpedo sabotage. The price is heat: the hull sheds nothing and the
  suite runs warm, so cover lasts about two minutes before the heat limit,
  and then the battle shield and hull pay. Firing anything or burning past
  half throttle breaks cover for five seconds; the auto-turret holds its
  fire; it cannot run with the ECM on. A panel under the crosshair shows
  SILENT RUNNING or why cover is broken, with the heat. You earn the suite
  from either side: once the first chain is done (The Powder Chain or The
  Long Arrangement), the same dock offers a five-chapter sequel - **The
  Grey Ledger** for the navy's intelligence people, **Blackout** for the
  Syndicate. Its chapters are infiltration runs (reach a hostile system and
  dock without being searched; a search blows the run and breaks the
  chain), recovering the prototype from a wreck, burning a contact (two
  contracts on your board - deliver him, or let him run for less pay and a
  hit to your standing; whichever you settle first is your answer), and a
  first sabotage (hole a named port with a rock torpedo; it settles the
  moment the torpedo lands, and done silent it carries no name). The last
  chapter fits the suite, or holds it at the yard if no slot is free.
- **2026-10-19: jamming is loud.** Astra: ECM lights you up like a
  Christmas tree, just not with an ID code, which is suspicious enough.
  With the jammer on, ships notice you from three times as far (pirates
  and police alike come for you from 9,000 km instead of 3,000), a police
  patrol that has already inspected you comes back for another look, every
  customs scan searches your hold, and a lawful patrol that watches you
  jam from within 1,000 km for 20 seconds cites you for it (250 cr on your
  bounty, once per patrol). The INCOMING panel reads ECM ON - LOUD, NO ID.
- **2026-10-18: countermeasures against missiles.** Four, and each beats
  a seeker a different way. A **decoy launcher** (utility, 2,600 cr, rack
  of 12 charges at 60 cr each from any yard): **O** fires one aft, and each
  seeker coming for you rolls against it - far likelier when it is close to
  impact, so the last moment is the moment. **Radioactives as a flare**
  (Astra's idea): jettison a tonne or more of waste or fissiles with
  seekers inbound and it is a very hot, oxygen-free flare, much better than
  a charge and burning longer; dumping waste is still the crime it was.
  **Point defence**: the auto-turret shoots at a seeker inside 3 km before
  anything else, and a hit kills it. An **ECM jammer** (internal, 6,800
  cr): **SHIFT+O** switches it; while on, every seeker within 12 km has a
  steady chance each second of losing lock, and it puts heat in the hull.
  A lured seeker chases the decoy and, when that burns out, flies on blind
  until its fuel is gone. Police and navy carry six decoys a hull and drop
  one at your missile when it is 4 km out; traders and pirates carry none.
  With seekers inbound, a flashing INCOMING panel under the crosshair gives
  the count, the nearest range, your decoys and the ECM state, with a red
  marker on the nearest one or an arrow to it.
- **2026-10-18: past the heat shield, the battle shield; and the law has
  bite.** Skimming is an elliptical pass nose-first through the top of a
  giant's air: deeper fills faster, but below a certain depth the heat
  shield cannot shed the friction. Heat over the limit now burns the
  battle shield before it touches the hull - fast (a full shield lasts
  about fifteen seconds at the worst), but long enough to pull the nose up
  and raise the periapsis - and it does not recharge while it burns. The
  RAM SCOOP panel has a second row: the altitude the heat shield holds
  above at your speed, where you are, and your periapsis, coloured when
  you or your periapsis are below the line. A warning says when the
  battle shield starts burning. Separately, police were no threat to a
  fleeing starter ship (their gun did 4.5 a second at best and could not
  break a 40-point shield). Lawful police now carry a heavier gun (10 a
  second, 16 km, steadier against a runner) and three missiles each for a
  fugitive, fired from up to 30 km when you are running or your shield is
  up, one every 18 seconds, with a MISSILE LAUNCH warning. A police
  missile takes most of a full shield; it is slower than a Hawk and burns
  out after 40 seconds, so running early from far out escapes it and
  running late from close in does not. Docking or landing is cover.
- **2026-10-18: the gas skimmer is a ram scoop.** Astra: skimming means
  going into the atmosphere face first, the scoop collecting gas as a ram
  scoop. The intake's mouth is now on the nose: what it takes is density x
  speed x its area x how squarely the nose meets the oncoming air (full
  take nose-first, half at 60 degrees off, nothing side-on beyond 80
  degrees or tail-first). In the air with it fitted, a RAM SCOOP panel
  above the crosshair shows how square you are and the tonnes a minute,
  green when you are on the line; off it, a ringed marker shows where the
  nose should go, or an arrow to it when it is out of view, labelled NOSE
  HERE. Your fleet's skimmers are unchanged (their pilots fly it right).
- **2026-10-18: resource wars, stage 1 (the model and the map).** The
  empires now go to war over ore. Each system has a workable reserve of
  cheap ore that its industry draws down on the clock (the surveyed
  tonnage is the whole crust and is unchanged); scarcity is felt within a
  game year. An empire's chaos is the share of its systems where the law
  has been bought or the Syndicate holds, and scarcity pushes more of them
  over the line. When scarcity times chaos gets high enough, the empire
  declares on a rival's richest reachable border system; the war runs two
  to six months, the stronger and less chaotic side usually wins, and a
  win moves the system to the winner. First wars come in years two to
  three, from the empire with the most chaos, on all three test seeds.
  Corruption you leave behind counts, but it fades in weeks, so only
  crime kept up moves a war. It is all seed and clock: the same seed and
  the same player give the same wars. Seen on the galaxy map: contested
  systems carry a red cross, taken ones a ring in the new owner's colour,
  the destination readout says who is attacking or who took it, and a
  news line under the chart header gives the fronts, the last war, or how
  much of their cheap ore the empires have worked. Fixed on the same
  page: a long atmosphere description no longer runs over the planet
  names in the destination's world list.
- **2026-10-18: a fence in every system.** About one system in six had
  no back room outside a Guild hall, so stolen goods meant a jump. Each of
  those now has one, at its least developed market that is not the
  Guild's; every other port, and every back room that was already there,
  is unchanged, and so are the seed fingerprints. A Syndicate hold still
  pays more (85% against 60%). Holding hot goods, the refusal at a market
  and the message when you take them name the back room in this system.
- **2026-10-18: other prospectors, and stealing from them.** Other
  outfits now have claims and drones on about one world in eight, in
  nearly every system with a port: Ibarra Ore Co., Halloran & Daughters
  and so on, one to three drones a claim. They are worked out from the
  seed, so they are the same every time and no existing world, port or
  fingerprint changed. Each owner comes round to empty their drones every
  few weeks. Lock a world and get within a few radii: their drones are
  marked on the ground in orange (yours in green), with an arrow to the
  nearest when it is off screen, and the SURVEY page names who has claimed
  it. Land beside one: **N** empties its hopper into your hold and
  **SHIFT+N** pries the drone itself loose into your racks (empty it
  first). What you take is **hot**: a customs scan seizes the hot tonnes
  and any stolen drone and fines you (a corrupt inspector can still be
  paid off; an outlaw one does not care), Guild halls and ordinary
  markets will not buy it, and a fence (a black market that is not a
  Guild hall) pays 60% of the price, 85% in a Syndicate hold. A fence
  also buys a stolen drone (3,800 cr; 5,225 cr in a Syndicate hold), or
  set it down on your own claim and it is yours. Lawful traders will not
  take hot ore ship to ship; Syndicate hulls will. The owner reports the
  theft when they next come round, a few days to weeks later, wherever
  you are by then: a bounty of 900 cr plus half of what you took, with
  their flag. Saved.
- **2026-10-18: laser ships in rings.** A fleet ship with a pilot and a
  mining laser (or the cannon) can be put to work in a ring from the Fleet
  tab, beside the skimming rows: out to the ring, cut and scoop until the
  hold is full, home to sell, and round again until recalled; or keep the
  load aboard for one run. What costs her time is chasing and scooping the
  pieces, which a better pilot does faster, and she keeps less of what she
  cuts than you would. She only cuts for what her home port buys, and the
  load is the ring's own mix (water, ores, rare metals by how icy the ring
  is), sold commodity by commodity and drawn off the ring's survey store.
  Measured across twelve rings: a median of about 1,400 cr a game day for
  a steady pilot. The rows are sorted by what they pay a day.
- **2026-10-18: the mining laser cannon** (6,200 cr, hardpoint). A pulse
  that knocks a piece off the face every shot, from 5 km, with 3 s between
  shots. Against ships it is fully absorbed by a shield that is up, even by
  the shot that empties it; a bare hull takes it like a pulse laser. While
  it cools, its mount on the hull glows red, three capacitors on the
  cockpit dash glow and fade, and a CAPACITORS bar under the crosshair
  counts down.
- **2026-10-19: `tools/chop-modules.cjs`, station modules cut from the
  existing art.** Reads every port in `ref/ports` and every ship in
  `update_models`, gathers their named parts into functional assemblies
  (dock, habitat, command, storage, power, comms, propulsion, industry,
  defence, structure, hull, access), and writes each as its own `.glb`
  with a catalog (`modules.json`): kind, size, parts, colours, the models
  it came from, and **sockets** — the places where it was joined to a
  different assembly in its parent model, which is where the next module
  bolts on. Trim (decals, lamps, glass, greebles) goes with the nearest
  assembly; terrain, interiors, gear and stands are left out; the greeble
  kit is skipped. 171 models give 2,851 distinct modules in about 1,335
  forms (the same form in another paint, size or pose counts once), with a
  contact sheet (`index.html`, hover to turn). Output goes to
  `Claude outputs/modules`; nothing in `src/` changes. Groundwork for ports
  that grow and for cracked ports rebuilt over years.
  Same day, second pass: **modules carry their berth routes.** Each berth's
  route in from `src/ports.js` is turned back into the model's frame and
  clipped to the module that holds the berth; where it crosses the module's
  wall is the module's real doorway, and the piece inside is its own route.
  Berths reached straight from space are marked as having their own outer
  door. A module that other berths' routes run through is marked
  **pass-through**, with each way on and the biggest ship that fits it
  (Astra: outer doors become the doors into the next add-on, so these are
  the pieces that can sit in the middle of a chain). 407 berths: 259
  routed, 148 with their own door; 169 pass-through modules, 30 of them
  wide enough for large ships. A module that holds a berth counts as a dock
  whatever its parts are named. The contact sheet draws routes, doors and
  ways on, and has a filter box ("pass" shows the pass-throughs).
- **2026-10-20: ports that grow — the plan, not yet drawn.** Designed with
  Astra over 19–20 October; nothing in the running game changes yet (the
  three new `src/` files are not loaded by `index.html`).
  - `tools/growth-points.cjs` → `src/growth-points.js`: where each of the
    96 port models can grow. Points on its known berth routes with a
    straight neck out through the wall, points over outer doors (an add-on
    there turns the door inward and must be a pass-through), and hull
    points for add-ons with no berth. Each carries the biggest ship its
    route takes and the open ROOM measured around it, and each model
    carries its own symmetry, read off the mesh. About two minutes for all
    96, from data already in `src/ports`; no converter run.
  - The same function runs on every chopped module, so **every piece has
    growth points of its own** (Astra: "growth points should exist for all
    station types ... so that custom stations can be built"): a station
    grows from the free points of everything in it.
  - `tools/module-index.cjs` → `src/modules.js`: the chopped modules as
    the game needs them, one per form and paint, in game axes and metres,
    with the family each was cut from (1,739 modules). Ship pieces are
    scaled to the game's 25 m hull.
  - `src/growth.js`: each port's building history from twelve years before
    the game to forty after, seed + clock like the wars, cached. ORDER
    (wealth and law, less for a Syndicate hold, less for the corruption you
    leave) picks who builds each piece: the PORTBUILDERS' UNION (mirrored
    sets, the core's own family of pieces, a Crawler on site, never cut
    loose), MOONLIGHTERS (pairs with gaps, short chains), or SCAVENGERS
    (single pieces welded onto pieces, ship parts and mismatched paint, cut
    loose again after some years: a wreckhold). Chains stop at three pieces
    unless a large hub carries them on; no piece is bigger than what it
    hangs on; nothing standing overlaps. About half of each port's growth
    is already there when the game starts, the rest arrives over fifteen
    years. A Crawler stopped on its way (`Growth.delay`) pushes its job and
    every later one back.
  - `test/growth.test.js` (19 checks).
  - **2026-10-21, second pass.** The Union now builds **big, and from the
    station's own family**: it takes a piece of its own family before
    another family's piece of the asked-for kind (a rich spine had been
    growing refinery tanks and cradle bins, because a spine has no storage
    piece worth the name), and of what fits it takes the largest (anything
    within 60% of the biggest). On a rich `spine-l` that is spine habitats,
    docks and access trunks of 76–139 m, where it was 48–60 m bins. Union
    sets go **along the station's main axis**: a long station (a spine)
    grows lengthwise and a flat one along its axle; a point facing out off
    either end is three times as likely to be built on, a point with no
    mirror mate a third as likely, every member of a set stands at the same
    station along the axis (within 4% of the half-span), and the Union no
    longer builds half a set — if a mirror is free and the piece will not
    stand there, it tries another. **Necks**: each piece on a berth route
    carries its neck (`slot.neck`: from the route point out through the
    wall to the piece), and the paper draws them as corridors, 30 m for
    S/M routes, 60 m for L. `test/growth.test.js`: 26 checks.
    Same day, third pass: **necks off pieces too.** `tools/module-index.cjs`
    now keeps where each module route point's neck starts (1,760 of them;
    `src/modules.js` regenerated; every other value is unchanged), so a
    piece welded onto another piece's route gets a neck back into that
    piece. **The Union varies its blocks**: a form it has already built at
    a port is a third as likely next time (then a fifth...), and when only
    one or two big forms fit it reaches down in size until it has three to
    choose from. A rich spine builds 5–9 forms where it could build one;
    pad sites and farms stay narrow, because their families have few
    pieces that fit a flat ground site. 29 checks.
  - **2026-10-24: a way in from the primary L berth.** (Astra: "ensure that
    all constructed stations have a path for ships to enter from the
    primary L size berth and be taken through to their docking bay
    somewhere inside the stations".) Before this, nothing tied an add-on
    dock to the station's routes: a dock whose bays open to space stood on
    its base with its neck into a blank wall, and across every port model
    3,506 of 23,438 grown pieces stood in front of a primary L berth's
    mouth. Now:
    - The **primary** entrance is the L berth most of the core's routes
      come in through (berthL0 on a spine, berthLFwd on a cylinder; a
      ground site's busiest entrance). `Growth.wayIn(model)`.
    - `tools/module-index.cjs` keeps each module's **way in**: `in` (the
      biggest ship its doorway takes), `jd` (where the doorway is) and
      `ob` (bays open only to space). A dock whose bays all open through
      one face, mouths within 60 m, is **turned in** (`ti`): that outer
      door faces the station and becomes its doorway (Astra, 10-19:
      "outer doors can then become the doors ... of the NEXT add-on"). A
      pass-through with no bay joins by one of its ways on, door to door,
      instead of standing on its base. `src/modules.js` regenerated.
    - `src/growth.js`: every free point carries **reach**, the biggest
      class that gets there from the primary, inside: a core route that
      comes in through the primary, then the route points and ways on of
      pieces that are reached through their doorways. A dock is built only
      where it is reached by a ship its size, and only if it has no bay open
      straight to space. A piece is set so its **doorway** lands on the
      neck. Nothing stands in a **lane** in front of any mouth that opens to
      space (45 m either side, 1.5 half-spans out), and nothing is built
      over the primary's mouth (yard models had three points there).
    - Cost, every model × rich/middling/poor × 4 seeds: 4,265 docks where
      there were 5,079 (L: 160 of 226), every one reached; Union docks
      577 of 975. Docks reached only through a second L entrance (cradle
      Beta, some refinery and yard routes) are no longer grown.
    - `test/growth.test.js` "the way in", worked out from the port data
      and not from growth.js's bookkeeping: every grown bay reached, its
      class fits the whole way, the primary's approach clear and its mouth
      not built over. 33 checks. `Claude outputs/path-sweep.cjs` runs the
      same over all 96 models; `path-builders.cjs` counts docks by builder.
      The paper (`growth-paper.cjs`) draws the primary's way in as a cyan
      arrow and its kept-clear approach dashed.
  - **2026-10-24, later: a station is built out in a year or two, not
    decades.** (Astra: "I don't think it'd take literal decades to finish
    one of these things" — "I meant the whole station".) Growth had run
    from twelve years before the game to fifteen after, a piece a year,
    each 5–16 months on site. Now each port has ONE **build-out**: the
    Union finishes a station in 0.7–1.3 years, moonlighters in 1.2–2.2,
    scavengers in 1.5–3 (`Growth.BUILDOUT_Y`). On site a Union piece takes
    1–3 weeks, a moonlighter's 3–9, a scavenger's 1–10 (`PIECE_DAYS`; a
    Crawler's tugs unpack an L piece in hours, the rest is fitting out),
    and a Crawler is there 5 days before and 3 after. When a port's
    build-out falls is its own, between twelve years before the game and
    four years in: over every model × 3 orders × 4 seeds, about two in
    three are finished when you arrive, one in ten is building on day
    one, a quarter begin in your first four years. After it a station is
    finished; only where order has really fallen to scavengers do they keep
    welding on and cutting loose, about every ten months (a wreckhold is
    never finished). `test/growth.test.js` "time": the longest build-out
    3.0 years, no Union or moonlighter piece after one, a Union piece at
    most three weeks; 37 checks. The paper shows each port early in its
    build-out, halfway and finished, not game years 0/5/15.
    `Claude outputs/growth-timeline.cjs` prints the timings per order.
- **2026-10-24: no-man's land — 450 stars, and most of them nobody's.**
  Astra: "not every star system has anything in it but hydrogen for fuel
  to keep moving at the star or one of the planets, by increasing the
  number of stars to 450 and creating a kind of no-man's land in between
  polities; this makes every game have its own expansion into new
  territory which can inter-relate with faction missions." Decided with
  her: a bigger disc at the same spacing, about 45% claimed, the Syndicate
  both inside the empires and out in the frontier, and (later stages)
  both the polities and the player expanding into it.
  - **The galaxy** (`src/galaxy.js`): 450 stars on a 72.75 ly disc (was
    200 on 48.5), the same density, so a hop is the hop it always was. No
    star is left more than 8.8 ly from its nearest neighbour (the rim had
    one at 10.7, past a laden Mule's 9.7). Each empire claims the compact
    region round its capital, an even share of 45% of the stars, and never
    a star within 4 ly of another empire's: there is always open space
    between them. The first capital stands within 10 ly of home, so a
    career always begins inside a polity; the others stand out at 0.8 of
    the disc's reach at evenly spaced bearings - opposite each other when
    there are three - so the open space lies between every pair
    (farthest-point sampling had put both rim empires on one flank of
    kawartha, leaving half the map a single empty frontier). The
    Syndicate's three holds and
    the three minor powers are carved out of claimed space as before (their
    shares now of claimed space), and the Syndicate also keeps two
    **frontier outposts** of four systems out in no-man's land, with no
    empire round them. On kawartha: 212 of 450 claimed, 238 nobody's.
  - **Empty systems** (`src/generate.js`, `opts.empty`): a star nobody holds
    generates its star, worlds, moons, rings and belts exactly as it would
    (every stream is forked, nothing moves) and then no ports: no market,
    no traffic, no patrols, no flag, no law (`government: unclaimed`,
    `crimeScore` 100, as deep space), `sys.empty`. A bare seed never
    generates empty. `Galaxy.systemOpts` is the one call the game's system
    cache, the chart's preview and the wars' summary all use. Courier and
    passage contracts and the arcs' courier, infiltration and recovery
    steps only go to stars somebody holds; a hailed ship's charting says
    "nobody holds it".
  - **Star skimming** (`src/sim.js`, `src/mining.js`): every star has a
    CORONA out to three of its radii that the ram scoop works in - density
    x speed x area x facing, as for a giant, densest deepest. No drag (an
    orbit through it is the orbit it was), and RADIANT heat, inverse square
    of distance and fourth power of temperature: a red dwarf can be skimmed
    deep on a bare hull, a sun-like star wants a heat shield deep, a hot
    white one cooks even a shielded hull at half depth. About 1.7 t/min at
    the top, 5.5 halfway, 20-55 deep. **Skimmed hydrogen fills the jump
    tank first, then the hold** - at a giant as well as a star - so a ship
    can keep moving through systems with no port. 87 of 714 empty systems
    in three galaxies have no giant at all; the star is their fuel.
  - Arriving where the busiest port is a pad no longer parks you under the
    pad (main.js `enterSystem` wanted an orbital station; a latent bug the
    new map walked into).
  - **Saves: epoch 3.** A career from before this is in a galaxy that no
    longer exists, so it does not load (the DEPRECATED shelf was empty).
  - Tests: `galaxy.test.js` "no-man's land" (empty systems really empty and
    with the worlds they would have had, home claimed, about 45% claimed,
    the empires apart, frontier outposts) and the territory checks rewritten
    for claimed space, 96 checks; `mining.test.js` "the star" (skimming,
    tank before hold, heat by star class, every star has a corona), 106;
    `render.test.js` "an empty system" (arrive, every screen F1-F8, both
    views), 967. The slipspace tear-out test and the jump's clock check
    leaned on the old map's first lane (empty, long); they now take the
    longest lane and accept a live corridor's own crossing time.
    `Claude outputs`: `empty-smoke.cjs`, `corona-check.cjs`,
    `galaxy-map.cjs` (the map top down, held and nobody's).
  - **2026-10-24, later: you choose when the hold fills the tank.** (Astra:
    "fuel that you have in the hold as like hydrogen can be used to refuel
    the ship so you skim and then choose to refuel from inside the ship
    menu or ship screen".) The tanks-first skimming above is undone:
    skimmed hydrogen goes into the HOLD, at a star or a giant, as it did.
    `Mining.refuelFromHold` pumps hold hydrogen into the jump tank, as much
    as the tank has room for, never the tonnes held under contract; on F5
    SHIP the hydrogen row has a **TO TANKS** button, and **Enter** on that
    row does the same. (It was F for an hour; F is the down thrusters, and
    a screen that is up must never take a flight key - Astra.) "Skimmer:
    hold full" says how. The render harness now loads mining.js,
    as index.html always has (without it the pump found no Mining). Tests:
    mining 110 (into the hold not the tank, the pump fills to the brim and
    no further, contract hydrogen stays), render 970 (in an empty system,
    F5 shows TO TANKS, F still reaches the thrusters from that screen,
    Enter on the hydrogen row fills the tank).
  - **Next** (agreed, not built): the empires and the player expanding into
    no-man's land on the clock - Crawlers founding ports there, dated like
    the wars - and the faction missions that hang off it.

- **People: your crew at their stations, a station deck with people on it,
  and the crews of the ships in port (2026-10-25).** Astra: *"We should use
  these crew models on ships and stations in game, in the first person
  mode. They should also be on NPC ships. Give them each a basic AI script
  so they do their assigned jobs by class."* The models are the ones she
  designed on the turntable page ("Manifest Crew Roster") on 2026-10-24/25.
  - **The bodies** (`src/npcmodel.js`). Fourteen roles: pilot, engineer,
    gunner, security, tactical, medic and loadmaster for a ship's crew;
    raider and captain for pirates; enforcer, heavy and fixer for the
    Syndicate; marine and officer for the Navy.
    - Low-poly in the first Unreal Tournament's manner, 700 to 2,400
      triangles each, with the detail painted on one 512 × 512 skin per
      person rather than modelled.
    - A ship's crew wears its livery: none on a civilian ship, Navy blue
      and white, Syndicate charcoal and gold (an engineer's hard hat always
      yellow or red), or a pirate crew's mismatched patches.
    - Everything carried is attached: the loadmaster's antenna to a
      bracket on the frame, rifles to two-point slings over the shoulder,
      the smart optics to the helmet by a cable. Exo-frames hinge at
      elbows and knees, and every body has ankles.
    - Rifles are built from one datum, the chamber, and check six rules
      of how a gas carbine works (ejection port over the magazine well,
      trigger behind it, buffer tube in line with the bore, and the rest).
    - Each body is skinned on eleven bones, so posing one costs eleven
      matrices and no rebuild.
  - **Drawn on the GPU** (`src/npcgl.js`): one draw call per person,
    depth-tested against the room they stand in, lit like the cockpit
    room. `gl.js` gains `GLWorld.addPass`, run after the cockpit room and
    before the screens. Without WebGL2 the nearest few people go into
    walk.js's painter's sort as flat triangles coloured off their skins.
  - **Who is where, and what they do** (`src/npc.js`):
    - **Your crew** are the people on your roster. On watch (eight-hour
      watches on the game clock, two of every three) engineers and gunners
      sit at the bridge-deck stations of their own role, one to a seat; a
      second hand for a one-station role stands at the shoulder of whoever
      has it. An engineer now and then walks aft to look over the passage
      and the lock. Off watch, people sleep in their bunks or work at the
      galley. A pilot takes the helm whenever you get out of the seat, and
      gets up when you want it back; with you in the seat, the pilot on
      watch stands at your shoulder.
    - **A station deck** has a market clerk, a yard clerk where there is a
      yard, a bartender and a crew-hall steward at their counters;
      security in the port's colours (the Syndicate's enforcers and a heavy
      at the big lock in their ports, marines at the big lock and a customs
      officer where the Navy keeps a garrison, the port's own officers
      elsewhere); the hands in the crew hall, who are exactly the people
      `Crew.forHire` lists for that port and week, less anyone you have
      already signed on; and now and then a
      Syndicate face in the bar, more often where the port is bought.
    - **Other ships' crews.** Every ship moored at the port
      (`Sim.berthOccupants`) sends its people, in its owner's colours: one
      works her berth, the rest go between the bar and the concourse.
      `Npc.crewForShip` is the same crew for any NPC ship wherever she is
      met, ready for boarding.
    - People walk room to room through the doors only, round counters,
      wait at a sliding door until it opens (and hold it open:
      `ShipDeck.updateDoors` takes their `hold`), and stop short of you
      for a moment rather than walk through you.
    - **E talks to whoever you are facing**: their name, what they are,
      and a line in character. A hand for hire says how good they are.
  - **The station deck is drawn on the GPU** when it is available
    (`Walk.meshFor`): the same plates the 2D deck painted, as one mesh in
    the docked ship's frame, so the people on it are depth-tested against
    its walls. The 2D deck is unchanged without WebGL2.
  - Tests: `test/npc.test.js` (28 checks). Seen in game on the Crawler
    (`tools/probe-npc.js`, RX 540): a Dart's bridge deck from the seat and
    on foot, her quarters, and a station's spine, concourse, bar and crew
    hall with 23 people about; the concourse held 57 fps.

- **A modelled cockpit for every ship, a sliding door aft, and a walk to
  your airlock (2026-10-24).** Astra: *"We need to have a modeled interior
  for every ship that doesn't have one, specifically the cockpit. There
  needs to be doors that slide into the structure of the ship to open the
  way from the cockpit into the rest of the ship, and the syndicate ships
  need to have the dark grey and red motif on the interior too."* Her
  answers: a real 3D room per hull on the GPU; the door walkable to your
  airlock; Syndicate colours on the Corsair Runner, Enforcer, Syndicate
  Heavy and a Crawler in Syndicate livery. See `claude/ship-interiors.md`.
  - **The cockpit is a room now.** Every hull's bridge is a GPU mesh
    fitted to that hull's own glass and size (`src/shipdeck.js`, from
    `Render.cockpitGeometry`):
    - windscreen, quarter-lights and side windows each set in a wall;
    - the floor window at the bottom of a footwell under the dash slot;
    - side consoles, the overhead, a ceiling with light strips, and the
      rear bulkhead.
    It used to be one flat-painted room for all 23 hulls. The modelled
    cockpits inside the GLB files were never drawn and still are not.
  - **The windows keep exactly their shapes.** Each pane is drawn first,
    depth only, and the room after it. A wall behind glass fails the depth
    test and the world already drawn shows through. Tests show no wall
    stands between the seat and any window, on any hull, and every window
    is set in a wall with no sky past its edge.
  - **The door.** Two leaves in the rear bulkhead slide sideways into the
    wall to open, with a lit trim round the frame and a hazard stripe where
    they meet. Each opens as you reach it and closes behind you.
  - **Walking.** O, berthed or on a pad, stands you up behind the seat
    (it used to drop you on the station deck).
    - You walk aft through the bridge door, down a passage (longer on
      bigger ships: 2.4 m on an S hull to 8 m on an XL), through a second
      sliding door into the airlock.
    - The hatch's lamp is green when there is somewhere to step out to.
      E at the hatch, berthed, steps you out at your berth on the station
      deck. On the station deck, E at your own hatch brings you aboard at
      the airlock. E at the seat sits you down.
    - Walking uses the seat view's projection from a standing eye, so the
      room, the screens and the world through the glass all line up.
      From the passage the cockpit is seen only through the doorway.
      There is no flight HUD on foot.
  - **The Syndicate's interior.** Dark grey walls, floor, consoles and
    leaves; red door trim, stripes and hazard edges; red-and-amber switch
    panels on grey plate; a red accent strip on the dash. All taken from
    the hull art's own `syn*` and `syndicate_*` materials. On the Runner,
    Enforcer and Syndicate Heavy, and on any Crawler in their livery.
    Navy hulls (Cutter, Capital, Carrier) get a cooler grey with pale-blue
    trim.
- **Bridges with crew stations, and crew quarters (2026-10-24).** Astra:
  *"M and L size ships might have multiple crew stations on the bridge"*,
  *"create them so that they match the geometry of the ship, but with
  multiple crew stations"*, and *"All ships which have crew stations
  require crew quarters."* No crew-station models exist in the art (every
  hull file has only the pilot's seat), so the stations are built in code.
  - **The bridge deck.** On every M, L and XL hull, the bulkhead behind
    the helm stays where it was, with its rear screens and greebles. Its
    doorway is now an open arch onto a bridge deck behind it, with the
    sliding bridge door at the deck's aft end.
  - **The stations.** One for each hand the hull needs with you at the
    helm (`Crew.crewNeeded`): engineering (amber screens) and gunnery (red).
    Each is a console against the side wall with a seat facing it, down
    both walls on a wide hull and the port wall on a narrow one. Up to six;
    a Carrier's nine share them, gunnery included. E at a station says
    who signed on for it, or that nobody has. Seeing crew at them comes
    with the NPC work.
  - **Crew quarters.** On every ship with stations, off the port side of
    the passage behind a sliding door that runs into the wall:
    - a bunk for every hand and one for you, in two-high stacks with
      reading lamps and end boards;
    - lockers, and a galley across the aft end, after the navy yards'
      crew rooms.
    The passage is lengthened to fit them.
  - S hulls (Talon, Wren, Bollard, Lance) stay one-seat, with no deck and
    no quarters.
  - The Carrier's and Capital's conning-tower bridges and elevators are
    the next slice. For now they get a large bridge deck like the others.
  - *Tests:* `test/shipdeck.test.js` +14 checks (49):
    - stations and bunks per hull;
    - every room on every hull can be walked to;
    - the helm's bulkhead has not moved;
    - the quarters door is wall while shut and its leaves go into the wall.
  - `test/tear.test.js` now runs in `npm test`.
- **A Crawler in a faction's colours (2026-10-24).** Astra: *"Player
  crawlers can have syndicate livery if they're operating for the
  Syndicate."* Her answer: you choose it when you commission or repaint,
  and the same goes for a navy.
  - The order sheet for a Crawler has a LIVERY line: civilian, navy or
    Syndicate.
  - The FLEET tab offers a repaint of the Crawler under your hands
    (4,000 cr).
  - Syndicate colours need a yard the Syndicate holds and 40+ standing
    with them (an Enforcer's line), and they must not want you. A navy's
    need its own yard and 40+ standing (ALLIED, a Cutter's line).
  - She wears that livery's model outside (`crawler_syndicate`,
    `crawler_navy`) and its room inside, until she is repainted.
    `Combat.liveryRefusal`, `Combat.repaintLivery`.

- **Choking a port by buying her cargo in flight (2026-10-21).** Astra:
  *"buying cargo off a ship means it doesn't have that cargo for the
  destination. Provides a way to choke a station without killing trade
  ships."*
  - When you buy a line off a trader, the port she was bound for gets
    that much less of it when she arrives. The deal says so: "*Port* will
    be N t short."
  - Nothing changes at the port before she gets there. When she docks,
    the shelf is short by what she no longer carries, and the gap fades
    the way a delivery would (the same decay as the inbound arrivals).
  - Buying the same line off more ships deepens the shortage. Other ports
    are untouched.
  - Shortages are saved with the trade book and forgotten once they have
    faded (`Economy.shortfalls`, `ShipTrade.shortDelivery`,
    `ShipTrade.attach`). 9 new checks in `test/shiptrade.test.js`.
- **The police leave Syndicate runners alone (2026-10-21).** Astra:
  *"Syndicate runners don't get chased by cops unless they are firing on a
  civilian vessel as the aggressor. The syndicate pays off the police."*
  This already held in the game. Police never scan, hail or chase a
  runner, and no NPC fires on another NPC yet, so a runner can never be
  the aggressor. The rule is now written into `buildRunners`
  (generate.js), so whoever adds NPC-on-NPC fire knows what it must
  respect.

- **The Crawler: the first bay of a station, and the crates it carries
  (2026-10-20).** Astra, over the day:
  - *"This is the new station-constructor, called the Crawler. There's only
    one size."*
  - *"crawlers be the frame for L size bays, so they become the first bay in
    a station, and carry the station's components, for if it's to be a
    skimmer or a shipyard. To get the XL sized shipyards, we stitch two
    crawlers together."*
  - *"6 to a cube for S modules and 4 for M modules, 2 for L modules and 1
    for XL modules which are station component crates."*
  - On freight: *"we have dedicated cargo haulers for that, right? I want to
    see both in game."*

  Her answers: a Crawler that becomes a station is **permanent**; every
  player-buildable station type comes from a Crawler plus the right crates;
  Crawlers can **chain**, more than two. This is the first slice. Founding
  and stitching come next (`claude/crawler-and-station-modules.md`).
  - **The Crawler is the station's first L bay**, so there is no separate
    core module. You can only order crates once you have a Crawler
    (flying, in your fleet, or on the slip). That is your "L first" rule.
  - **The models.** Your three liveries are in the hull library, imported
    as the bare frame. The originals are kept in `ref/crawler-src/`. No
    other hull changed.
  - **Her 24 cubes, drawn as what they hold:**
    - her own container when it holds freight;
    - yellow station crates (navy and Syndicate in their own colours);
    - nothing when empty.
    A full Crawler rebuilt this way is exactly your model, face for face.
  - **Packing.** A cube holds 6 S, 4 M, 2 L or 1 XL crates, one size per
    cube. Any cube without crates is 25 t of freight, so an empty Crawler
    has a 600 t hold. That is less than a Leviathan, so the haulers stay
    the better freighters. The hold shrinks as crates take cubes.
  - **The hull.** XL, built to order at a shipyard (8 days),
    450,000 cr, needs a crew, never sold ready-built.
  - **Crates, on the yard's MODULES tab.** Paid when ordered, built with
    build time, and waiting at that yard when done.
    - XL: slipway.
    - L: skimmer rig, refinery line, ore works, market hall, hab ring.
    - M: warehouse, repair dock, reactor pile, crew quarters.
    - S: berth clamp, defence battery, comms relay, fuel cell.
    In a Crawler at the yard, click a crate to crane it aboard (▶) or lift
    it off. The tab shows her cubes as crates / freight / empty. Crates
    aboard are lost with her, and you must lift them off before you trade
    her in or step into another ship. **The catalogue and prices are my
    pick.**
  - **Crates cost about what a mid-tier ship does** (Astra: *"modules are
    like the price of mid tier ships each, so building out a large size
    station is an expensive, but often worthwhile goal"*):
    - S: 60–75k;
    - M: 80–110k;
    - L: 120–165k;
    - the XL slipway: 200k.

    A Crawler plus a slipway, two L, four M and six S comes to about
    1.7 million.
  - **Her bay door and her small-craft bay** (Astra: *"it's on the bottom
    of the crawler and I'm building the model for us now. It will also have
    a docking bay L size for two tugs and one shuttle, for bringing shit
    from orbit down to the surface for surface ports."*):
    - a garage-style door on her **underside**, one leaf sliding up behind
      the other, usable only once a station is being built;
    - her own **M craft bay with three S slots**. Her craft ferry crates
      from orbit down to surface ports. A **tug is always required**,
      because only tugs have grab arms to move parts out of the crates in
      orbit. A bigger (M) shuttle takes two slots. That gives three
      loadouts:
      - standard: 2 tugs + 1 shuttle;
      - orbital push: 3 tugs, faster in orbit;
      - planetary push: 1 tug + the M shuttle, faster on the surface.
    The door and the bay's geometry wait on Astra's re-exported model.
  - **Her craft bay, in the rules (2026-10-20).** Astra: *"More tugs speed
    up the work, giving buying them a purpose at all."*
    - Every Crawler comes with the standard bay. At a shipyard, the
      MODULES tab offers a ▶ refit to each of the other loadouts. New craft
      cost full price; departing craft come back at seven tenths (standard
      → orbital push is 31,400 cr). Her crew flies them.
    - Claude's first rates: a tug unpacks 1.5 cubes a day in orbit; a Wren
      shuttle ferries 1 cube a day down to a surface site, the heavy
      shuttle 2.5. The tab shows how many days this load would take in
      orbit and on a surface with each bay. With no tug it can't build;
      with no shuttle it can't reach a surface.
    - The bay is saved, follows her into the fleet and back, and is lost
      with her.
    - **Her bay only ever carries her tugs and shuttles** (Astra: *"that
      way we don't have custom-ship-won't-fit problems later."*). No
      player ship, fleet hull or future modular ship docks in it.
      `Construction.bayTakes` is the one check.
    - **The M tug** (Astra: *"there's also an M size tug in the models we
      currently have, and one of those unloads it a higher speed, but not
      double."*). The Heavy tug (art: tug-m) unpacks 2.25 cubes a day,
      half again an S tug, and costs 66,000 cr.
    - **The pads decide what fits** (Astra chose this from her re-exported
      model). The bay has two S pads by the door and one M pad further in.
      An S pad takes an S craft; the M pad takes one M craft or one S
      craft. This replaced "three S slots, an M craft takes two". The
      loadouts, with their refit price from standard:

      | loadout | craft | orbit | surface | refit |
      | :-- | :-- | --: | --: | --: |
      | Standard | 2 tugs + Wren | 3.0 | 1.0 | — |
      | Orbital push | 3 tugs | 4.5 | — | 31,400 |
      | Planetary push | 2 tugs + heavy shuttle | 3.0 | 2.5 | 47,400 |
      | Heavy tug | tug + Wren + heavy tug | 3.75 | 1.0 | 35,200 |
      | Heavy orbital | 2 tugs + heavy tug | 5.25 | — | 53,400 |

      Rates are cubes a day; "—" means it can't supply a surface site.
  - **What a load founds (2026-10-20), the agreed bill of crates:**
    - market: market + warehouse;
    - refinery: refinery + warehouse;
    - skimmer: skim rig + refinery;
    - mining: ore works + warehouse;
    - passenger hab: hab ring + two berths;
    - shipyard: slipway + repair;
    - XL shipyard: slipway + repair, two Crawlers stitched.
    Every one also needs Crew quarters. The MODULES tab shows ✓ for each
    type her load can found, or what it still needs. Founding itself,
    where she becomes the first L bay, is the next slice.
  - **Astra's re-exported Crawler is in (2026-10-20)**
    (`new models/20-10-2026/crawler_allLiveries_14of24.glb`, kept as
    `ref/crawler-src/crawler_allLiveries_14of24.glb`):
    - She's 478 m long now (was 454), 153 m wide, 204 m tall.
    - The one file holds all three liveries. It is split into
      `ref/glb/crawler_{civilian,navy,syndicate}.glb`, each with its cargo
      detached, and `src/hulls.js` is regenerated (57 models).
    - The generator's own state rode along in the file's extras: all 24
      cubes and every part as Three.js JSON, 7.5 MB of the 9.5 MB. It is
      stripped on import.
    - The file draws 14 of the 24 cubes. All 24 centres were re-measured
      from the generator's cube list, so the game still draws every cube
      by what it holds.
    - New in the model, not yet working in the game:
      - the L berth in her belly, with its pad and two bottom leaves;
      - the stern craft bay, with its roll-up door and pads `padS0`,
        `padS1` and `padM`;
      - 12 tug grab points along her flanks.
    - Fixed in passing: the "frame carries no containers" test was a face
      count, which every re-export broke. It now looks for geometry inside
      a cube's volume.
  - **Saves:** crates and what is in her cubes are saved. Older careers
    load with none.
  - Also: a commissioned hull now leaves the yard with a registration (it
    had none).

- **The model drop folder moved (2026-10-20).**
  - `update_models/` now lives at `new models/update_models/`, all 76
    files. Git had been showing them as deleted; the move is now recorded
    as one.
  - **Nothing in the game read that folder.** The game reads the converted
    libraries in `src/` (`hulls.js`, `ports/`), which are built from
    `ref/`.
  - The one thing that did read it, `tools/stage-update-models.ps1` (it
    files a drop into `ref/`), now defaults to the new place and takes
    `-Source` for any other.
  - Checked with `-WhatIf`: it plans 71 models from the new location.

- **On foot in a station (2026-10-20), first slice.** Astra: *"full first
  person walking. We do need to model station interiors to walk in. We
  also want to be able to talk to NPC characters who are also on site."*
  - **O**, while docked, stands you up out of the seat into your berth.
  - Moving: **WASD** to walk, **Shift** to run, drag or the arrow keys to
    look.
  - **E** uses what you face:
    - your own hatch takes you back to the cockpit;
    - another of your ships berthed here makes you take command of her,
      and the ship you walked off stays on her clamp;
    - the market desk, the shipyard counter and the crew hall board open
      their screens. The F-keys still work too (Astra: keep both).
  - **The station is code-built from the seed** (Astra: code-built now,
    her generator's modules later), so a port is the same building every
    visit. `src/walk.js` builds it:
    - the L docking port and its double doors;
    - a spine corridor, with berths off both sides that get smaller the
      further they are from the L port, as Astra laid stations out;
    - a concourse with the bar, the market desk and the yard counter;
    - the crew hall.
  - Rooms are boxes. **The doors are the only way between rooms**, and
    you slide along walls.
  - Each of your ships in port gets a berth of her own size, with a lit
    hatch.
  - The world keeps running while you walk. Flight keys are held away from
    the ship, so U on foot does not launch her.
  - Not yet: the people. The bar says it is quiet for now. NPCs and talking
    to them, the Syndicate contact, and the shuttle's docking tube come
    next (`claude/walking-stations.md`).
  - Tests: `test/walk.test.js` (26 checks: same plan every visit, every
    room reachable from your berth, walls stop you and doors don't, berths
    descend in size, a hatch for every ship of yours). Checked in the real
    shell by `tools/probe-walk.js`: step out, walk, board the other ship.

- **Every ship in the sky can be flown, built and bought (2026-10-20).**
  Astra: *"I want any other non-buyable non-flyable ship type updated with
  a cockpit, a model name and a cost to build, to buy and what the default
  outfitting is"*, with *"Build = bare, Buy = outfitted"*, and *"the
  number of crew required to operate each one without the player flying
  it."*
  - **Eight new hulls**, all Claude's first numbers:

    | hull | size | model | build | buy | crew* | sold |
    | :-- | :-- | :-- | --: | --: | :-: | :-- |
    | Hawser Heavy Tug | M | tug-m | 66,000 | 73,110 | 2 | floor |
    | Heron Heavy Shuttle | M | shuttle-m | 60,000 | 76,290 | 2 | floor |
    | Tallyman Trader | M | trader-m | 72,000 | 85,680 | 2 | floor |
    | Corsair Runner | M | runner-m | 68,000 | 70,800 | 3 | floor where corruption ≥ 60 |
    | Syndicate Enforcer | M | enforcer-m | 110,000 | 121,970 | 3 | Syndicate ports, standing 40 |
    | Syndicate Heavy | M | enforcer_heavy-m | 175,000 | 192,550 | 3 | Syndicate ports, standing 70 |
    | Lance Fighter | S | fighter-s | 48,000 | 51,060 | 1 | built for navy allies (40) |
    | Fleet Carrier | XL | carrier-l | 18,000,000 | 18,112,140 | 10 | built for navy at 85; 30 days |

    \*Crew is what she takes with nobody else flying her; one fewer with
    you at the helm.
  - The Hawser and Heron are the Crawler's bay craft, now flyable, at the
    same prices. The carrier is the slow, mobile station Astra described
    (*"pretty slowly because the inertia of carrying a whole fleet's worth
    of shit takes a while to change"*): a capital's thrust on four times
    the mass.
  - **Build = bare, buy = outfitted, for every hull.** Each hull now has a
    default outfit (`HULL_STOCK`, combat.js); its gear is in the floor
    price at nine tenths.
    - Off the floor, your own gear still moves across, and the outfit
      fills whatever slots are left.
    - A large hull off a floor now carries that outfit, not a random fit
      from the dock's shelf.
    - Every shipyard builds every hull to order, bare, in 1 day (S),
      2 (M), 3 (L), 8 (XL), 14 (a capital) or 30 (a carrier).
    - The yard card shows build, buy and crew on one line, and floor rows
      name what she comes with.
  - **Crew per hull** (`Crew.crewNeeded`):
    - a pilot, unless you fly her;
    - engineers: none on S, 1 on M, 2 on L, 3 on XL plus 1 per 1,000 t;
    - a gunner per two guns beyond the forward pair the pilot fires on
      S and M (every gun on L and XL), two per capital mount, and one per
      turret.
  - **Cockpits:** every new hull has its own bridge. The Bollard and the
    Hawser draw their grab arms from the seat: two booms along the lower
    corners of the windscreen, caution-striped forearms angling in, and
    open jaws ahead (`render.js drawGrabArms`). The jaws stay open until
    there is a player tow for them to close on.
  - Grey and Syndicate hulls pass the same gates as the grey and
    Syndicate-issue guns (`Combat.hullGate`).
  - Note: the Sump waste hauler also wears tug-m, so it and the Hawser
    share a silhouette.
  - Tests: shipyard (outfits fit, prices, a cockpit and a model for every
    hull, gates), crew (hands per hull), construction (craft are real
    hulls). The combat suite's fitting tests now start from a bare hull
    (`buyBare`).

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
  - **Tears and clouds linger for hours, and decay (2026-10-20).** Astra
    wanted them to last "hours, not minutes", and to "slowly fade and
    shrink over the time it does show in system; almost like radioactive
    decay".
    - *The decay:* `Slip.wakeDecay` gives a wake a 6-hour half-life over
      its 16-hour life. It is shifted so it lands on exactly zero at 16
      hours instead of popping out. That is about 65% at 3 hours, 28% at
      8 and 11% at 12.
    - *What decays:* the cloud's drawn brightness (`glow`), its size (the
      hole closes to a quarter of its torn width) and the rift in its
      middle all follow that one curve. The rift used to vanish after 15
      minutes; it is now open for the wake's whole life.
    - *What doesn't:* scan fidelity still reads the old `strength`, so
      nothing in the wake-hunting balance moves.

- **Tears bend light, boil and throw lightning (2026-10-21).** Built
  from a mockup Astra signed off ("wake glow and stuff are great. Let's
  implement them, arrival and departure, and then we should work those
  clouds into what we see as we reach our slipspace destination"). On
  the world layer a wake is now drawn by gl.js; the old 2D cloud stays
  as the fallback for machines without it.
  - **Lensing:** a tear is a point-mass lens. Up to four a frame bend
    the sky. Stars move outward and brighten, and a second pass draws
    each star's faint second image across the tear. Planets bend too,
    since they are ray-cast per pixel and their view ray is bent before
    the sphere test. Ships and stations are not bent. The lens is tied to
    the cloud's size, so it shrinks as the wake decays.
  - **Shift:** what is seen near a departure tear is redshifted, near an
    arrival blueshifted.
  - **The tear itself:** a brighter glow, then a churning veil filling
    the rip that hides whatever is behind it. The veil is dark and
    smouldering for a departure, lit from inside for an arrival
    (brighter than the space round it). The lips of the rip burn.
  - **Lightning, its own shader:** forked bolts built on the CPU cross
    the dark gap from the cloud on one side to the cloud on the other.
    Each re-flashes two to four times down its channel, like a real
    stroke. Arrival bolts are thicker, more forked and reach further:
    "very large, angry bolts of plasma discharge jumping the gap". No
    lightning on a mote under about ten pixels.
  - **The jump itself:** the red rift opening ahead in the charge and the
    blue way out at the end of the tunnel are cut out of the 2D picture,
    and the world layer draws the same veil through the hole. So you go
    in through a boiling dark cloud and come out through a lit blue one,
    with the lightning across it.
  - **Your own tears:** jumping leaves a red tear ahead of where you
    were, and you come out of a blue one that hangs behind you. Both
    decay like any other wake and are gone in sixteen hours. Visual
    only, and not saved.
  - **Lore,** in Astra's words, which is why nothing radiates forward:
    "we're not creating a bubble of superluminal space which carries
    particles, we're tearing space a new arsehole and punching our ship
    into the dimension which holds up 4D spacetime, beneath physics
    itself. Nobody knows why."
  - **Stations and ships bend too (second pass, same day).** Astra: "I
    do want the thing to lens planets and stations alike." Hulls are
    triangles with no per-pixel ray, so each vertex is moved to where
    its image is seen (`tearPush` in the mesh shader) and shifted red or
    blue like everything else.
  - **Only what is behind a tear bends.** Each tear now carries its
    distance. A planet, station or ship nearer than the tear (your own
    cockpit included) is left alone, with a short blend across the
    tear's own distance. Planets in front used to be bent too.
  - **A bent planet's drawing square** grows by an Einstein radius, so
    its pushed-out edge is no longer cut off flat.
  - **Lightning on the tunnel walls.** Astra: "we need to make the
    lightning stick to the inside walls of the tunnel." Each strike lives
    in tunnel coordinates (angle round the tube, depth). Its main channel
    crawls round the inside of the tube, riding toward you with the wall
    rings, and its forks reach along the tube. It is coloured like the
    walls (blue-violet ahead, red once beside you) and drawn bigger the
    nearer it is. It clings rather than strikes: half a second to a
    second, re-flashing three to six times, never dropping below a
    visible glow until it dies.
  - **A bit more lensing.** Astra: "a bit more lensing." Lens strength
    is now its own knob, `TEAR_LENS_GAIN` (1.55) in render.js, applied to
    the bending angle only. The cloud, slit and lightning keep their
    size, so the sky bends 1.55× harder round a tear of the same size.
    1.8 was tried first; it warped planets well clear of the tear.
  - **Known limits:** a planet still gets no second image, and a coarse
    hull bends as straight-edged facets.
  - *Tests:* new `test/tear.test.js` (29 checks). It covers the lens
    equation both ways and pins the shader text. It also checks screen
    size against the 2D cloud's floor and cap, that the slit follows the
    pole, and that every bolt crosses the gap, with arrivals thicker,
    more forked and longer.

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

- **A taller windscreen (2026-11-01).** Astra's choice from
  `unfinished.md`. The top edge rose from 0.62 to 0.70 and the upper
  chamfers from 0.30 to 0.38; the sill did not move, so the dash, the HUD
  and the landing window are where they were. The cockpit camera's view
  ends just above 0.72, and at 0.76 the glass ran off the top of the
  screen, so 0.70 halves the strip of frame overhead (9.5% of the screen
  to 4.2%) and keeps it.

- **Canopy bars wear her livery (2026-11-01).** Astra's choice. They were
  one of three near-black trims; now they are the trim she was painted at
  the yard (`paint.t`), a touch darker, or her hull's own accent, darkened,
  on an unpainted ship. Both the GPU room and the 2D painter use
  `Render.barColour`, and a repaint rebuilds the room.

- **Another ship's cabin, seen through her windows, is brighter
  (2026-11-01).** Astra's choice. It was lit like a station room you stand
  in, which from outside read as a dark well. The same indoor lamp, times
  1.8 (`CABIN_SEEN_GLOW`); every room you stand in is lit as before.

- **One line, really: the mining work and the ship cuts come in (2026-10-30).**
  Asked to test the mining drones, the work turned out not to be on master
  at all. It was in a second family of checkouts that had grown from the
  Abby release and never reached GitHub: `X:\Manifest-trial`,
  `X:\Manifest-merge` and `X:\Manifest-ships`, plus an older copy in
  `C:\Manifest-merge`. Astra: *"Merge first, then test"*, with all of
  their sessions finished.
  - **The mining line is merged.** It brings survey instruments graded
    by what they see, deposits that sit somewhere on a world, the polar
    survey orbit, claims and drones, the mining laser and cannon, gas
    skimming, rock torpedoes and the ordnance panel, countermeasures and
    the shroud suite, other prospectors, a fence in every system,
    resource wars, skimmers and laser ships under work orders,
    no-man's-land systems, ridden lifts and the burn autopilot that
    warps.
  - **The station-growth checkout is recorded as merged.** Its two extra
    commits were already in: the first copy of the graded-survey commit,
    and a scratch script.
  - **Astra's ship-cut table and its tools are merged** (69 new files).
  - **C:\Manifest-merge is superseded.** Its survey commit was carried
    over, and its two uncommitted lines were already on master.
  - **Where both lines changed the same thing:**
    - The cutaway keeps Astra's double orange line of 2026-10-26, and gains
      the mining line's ground-port section box and kept deck.
    - A crime report carries both the take and an unidentified hull.
    - Open ground with a recorded spot rides the world and lifts on R;
      other landings keep the settle-and-lift-off fix.
    - F5 tabs: STATUS, GUNS, ORDNANCE, PANELS, NOTES.
    - The station geometry takes the finer vertices (the flicker fix),
      with our move of the ground-site aprons re-applied.
  - **Tests:** 62 suites now, all green. That includes city-sites,
    growth, prospectors, stealth and wars, which the mining line kept
    outside `npm test`.
  - **`npm run unpack` now refreshes stale copies by itself.** It keeps
    a record of what each working copy was when last in sync
    (`.pack-state.json`, untracked), so a copy that is only old (after a
    merge or a pull) is refreshed, while one you edited is kept, and
    `npm test` says which.
- **The station cutaway: a burnt-through edge, and nothing else round it
  (2026-10-30).** Shown the two lines' cut faces side by side at the same
  berth, Astra chose the mining line's: *"I want option B but let's get rid
  of all the wires and greebles and shit that currently makes it look like
  a graphics failure."*
  - **The cut face** is a hot beam-orange lip that glows, with scorched
    plate behind it. It replaces the double orange line of 2026-10-26.
  - **No furniture round the cut.** The cables and frame that stood on the
    edge, and the ring of pipes round the ship when seen from above, are
    gone. `Render.drawCutGreebles` is no longer called.
  - **The setting has two choices:** Laser cut, or Off (the camera stops
    at the wall). A saved "Laser cut - cables and frame" or "Clean cut"
    loads as Laser cut.
- **The game goes back under its own name, sigma-brightwings/Manifest
  (2026-10-30).** Astra: *"I want you to wipe the current Manifest repo and
  then push our changes"*. She chose to delete the old repo and recreate it
  empty, which frees its ~548 MB of Git LFS storage, rather than
  force-push over it, which would have left that storage in place. The
  short-lived Manifest_Main is deleted afterwards.
  - The landing page links (download, flight card, bug reports, source)
    point at sigma-brightwings/Manifest again.
  - The pushed history is the LFS-free one: the same commits and release
    tags, with models stored gzipped.
- **Web stations unpack themselves, and a missing station model says so
  (2026-10-31).** The first site off the recreated repo was published with
  Pages on "Deploy from a branch". The repo stores the station geometry as
  `src/ports/<id>.js.gz`, so every `.js` the game asked for was a 404, and
  every station drew as the old blocky procedural ring. Astra: *"why are the
  stations like this, we did so much work to not have them so blocky and
  simple"*, then *"yeah can you fix this?"*
  - **The page unpacks the packed copy itself.** When `ports/<id>.js` is
    missing, the loader in `src/ports.js` fetches `<id>.js.gz` and unpacks it
    in the browser (DecompressionStream). It then draws the real station
    the same way a late-arriving model always has. A host that sends the
    file already decoded is caught by a magic-number check. So the game
    shows its stations on any static host, not only through our Pages
    workflow, the exe or `tools/serve.js`.
  - **A failed model is no longer silent.** `PortGeo.onfail` tells
    listeners, and the game puts *Station model "<id>" failed to load -
    showing a stand-in* on the comms line, and so in the log.
  - The same loader is in the `tools/glb2hulls.js` template, so
    regenerating ports.js keeps it.
  - `test/packed-browser.test.js` (16 checks) runs ports.js as a page
    against a server that has only the `.gz` files, both plain and
    `Content-Encoding: gzip`. The page must unpack the same vertices and
    faces as the stored copy, and a station with no file must fire onfail.
- **A body when you look down, and crouching on Left Ctrl (2026-10-31).**
  Astra: *"Can we give the player first person view a body when we look
  down? And we also need to be able to crouch with L Ctrl"*.
  - **Your body** is built by the crew's generator (npcmodel.js) in a
    pilot's pressure suit and posed every frame in walk.js
    (`Walk.selfFigure`):
    - the walk cycle follows the distance you actually cover;
    - it settles when you stop;
    - it squats when you crouch.
  - **What you see.** The head is not drawn: the camera is where the eyes
    are, a few centimetres ahead of the chest. Looking down you see your
    chest harness, belt, arms, legs and boots, as a real person would.
  - **Fitted to the eye.** The body is scaled so its eyes are at the
    standing eye height (1.65 m), and its boots are put on the deck each
    frame.
  - **Where it is drawn:**
    - in your own ship, outside her on the ground, and on a station deck;
    - on the GPU like the crew;
    - on the 2D fallback through the painter's sort.
  - **Crouching** is Left Ctrl, held, eased down and back up:
    - the eye drops to where the crouched body's eyes are (about
      1.16 m), so the view and the body always agree;
    - you walk at 0.8 m/s and Shift does not run;
    - the right Ctrl is left alone.
  - **Looking down** now goes to 83 degrees instead of 69. At 69 a
    standing walker saw only the toes of their boots. The up limit is
    unchanged.
  - **Tests and probe.** `test/self.test.js` has 23 checks (crouch timing
    and speed, boots on the floor standing and crouched, eye heights,
    the head cut, the gait). `tools/probe-self.js` shoots it in your ship
    and on a station deck.
  - **In a browser,** Ctrl+W still closes the tab (no page can stop it),
    so walking forward while crouched is safe in the exe but not on the
    web build.
- **Station interiors, dressed: Firefly by way of Blade Runner (2026-10-31).**
  Astra: *"the inside of stations needs more detail: there are many rooms but
  they contain nothing"*, and asked what it should feel like, *"a kind of
  Firefly / Blade Runner aesthetic"*. That means lived in and patched, warm
  practical light against cold blue, and neon in more than one script.
  - **`src/dressing.js` (new)** dresses every room kind on a station deck:
    the bar, the concourse, the crew hall, the spine, the L port and the
    berths.
    - It is seeded from its own stream (`dress|seed|port|room`), so the
      same port's bar is the same bar every visit.
    - It moves nothing else: the rooms and doors are identical with or
      without it.
    - It adds plates to both walk.js renderers (the GPU mesh and the 2D
      painter's sort), and solid footprints that you and the people walk
      round.
  - **The bar.** Each port's bar has a seeded name, put up in neon
    (*The Drifting Lantern*, *Ivo's*, *Last Call* and so on); the name
    also shows as the room label.
    - The counter stands 1.3 m off the wall, so the bartender works
      behind it. Behind them is a back bar of glowing bottles on three
      shelves against a dark mirror.
    - Stools line the counter. There are three or four round tables with
      mismatched chairs and crates, and a red vinyl booth.
    - A warm lamp on a drop hangs over each table in place of the white
      ceiling strip. A column of glyph neon stands by the door, with
      pipes, wall ribs and grime round the room.
  - **The concourse** is a street under the station roof:
    - a noodle stand with red lanterns and stools;
    - shuttered shopfronts with glyph signs, a few with the shutter up
      and warm light inside;
    - ad panels high on the walls, and pillars with light rings;
    - an info kiosk, benches, planters and crate stacks;
    - MARKET and SHIPYARD in neon over their desks, with terminals on
      them, and a departures board;
    - hanging signs that point the way, `< BAR`, `CREW >` and
      `^ BERTHS`. Direction is always an arrow, not a word.
  - **The crew hall** has lockers, a cork job board covered in pinned
    paper under a HIRING sign, benches, a KAFE vending machine and a
    coffee urn.
  - **The spine** has hazard stripes down the floor edges and pipe runs.
    Each berth door carries its number and size in neon, coloured by
    size (L amber, M cyan, S green). Overhead signs read `^ CONCOURSE`
    one way and `^ L PORT` the other. There are fire cabinets, and
    fixtures every four metres instead of one white slab.
  - **The L port** has a yellow loading square, a gantry crane, crate
    stacks clear of the guards' posts, hazard chevrons and amber beacons
    over the outer doors.
  - **Each berth** has a yellow box on the floor in front of the hatch,
    a fuel line and hose reel, the berth number in its size colour,
    lockers, crates and a terminal by the door.
  - **People** sit on real seats: a person who sits (the Syndicate fixer)
    takes a stool, a chair or the booth. The bartender's post is behind
    the counter (`it.post`, read by npc.js `postBy`).
  - **The font** gained digits and the arrows `<`, `>` and `^`.
  - **Tests and probes.** `test/dressing.test.js` has 21 checks across
    24 generated ports:
    - every room is dressed;
    - a second visit is identical;
    - bars get their own names;
    - the plan is unmoved;
    - a flood-fill from your berth reaches every room and every usable
      thing;
    - a metre each side of every door is clear;
    - the bartender stands behind the counter;
    - every seat is in its room with floor beside it.
    `tools/probe-bar.js` and `tools/probe-dressing.js` shoot the rooms; a
    station deck draws about 6,500 plates at 57 fps.
- **Your ship in her hangar: one walk from her seat to the station deck
  (2026-10-31).** Astra: *"we want to be able to get into our ship, not
  walk into a room and use a door. I want the inside of the ship and the
  inside of the station to be a clean, walkable path."* Asked, she chose a
  hangar with her ramp over a docking collar, and the airlock open while
  she is berthed. Then, watching it: *"the ship hull needs to be cut away
  where the ramp is, because otherwise we're phasing through the hull"*.
  - **The hangar** (walk.js). The berth of the ship you are flying is a
    hangar sized to her: her length out from the spine, her beam along
    it, 4 m of floor round her, and headroom over her.
    - Her nose points away from the spine, so her ramp faces the door
      you come in by.
    - `plan.hangar` says where she stands: a rotation and a shift
      between her frame and the deck's (`Walk.hangarToShip` and
      `hangarToStation`).
    - It is dressed (dressing.js `dressHangar`) with:
      - a yellow stand line round her and a hatched box at her ramp;
      - hazard-striped walls, ribs and a gantry rail;
      - crates and a fuel bowser kept clear of her;
      - a terminal by the door and HANGAR n in neon over it.
  - **One frame** (main.js). The deck is drawn in a frame built from her
    cockpit's (`hangarFrame`), so her model, her rooms and the hangar
    floor line up exactly.
    - Walk down her ramp and at its top you are simply on the deck
      (`stepIntoHangar`). Walk up it and you are aboard
      (`boardFromHangar`). Nothing to press: the old E-at-the-hatch is
      gone for the ship you fly.
    - In the hangar you see her: her hull, engines and gear, her ramp
      down, and her lit airlock and rooms through it. From aboard, the
      hangar shows down her ramp.
  - **Her hull is solid** on the hangar floor where her belly is low,
    using the same clearance map render.js already builds for standing
    beside her on a planet. Under 1.8 m of her you stoop automatically;
    the crouch is held down for you.
  - **Open while docked** (airlock.js `ctx.berth`). Berthed in her
    hangar, her ramp comes down on its own and the inner door works, so
    there is no cycle. The panel says *Berthed - open to the hangar*.
    Undocked, the 26 October rule is back: sealed to the ship, ramp up.
  - **The ramp's cut through her hull is exact** (render.js
    `rampExterior`).
    - It used to drop only hull faces whose middle lay over the opening,
      so a big panel straddling it stayed whole and you walked through
      it.
    - Every face reaching over the opening is now clipped at its four
      edges: the parts outside are kept, the part inside and below the
      deck goes.
    - This is the same cut she uses landed, so the planet ramp benefits
      too.
  - Ships with no ramp, a tube berth, and boarding someone else keep
    the old way.
  - **Tests and probe.** `test/hangar.test.js` has 39 checks:
    - sizing, fit and headroom;
    - the two frames converting exactly, as a rotation;
    - her nose out and her ramp at the door;
    - nothing standing on her;
    - berth mode open, and sealing again on undock.
    `tools/probe-hangar.js` walks it with W alone: down her ramp onto the
    hangar floor, round her, back up and aboard.
- **The whole history without Git LFS, ready for a fresh GitHub repo
  (2026-10-30).** Astra: *"we do a fresh repo and delete the former, but
  first we test"*.
  - Every commit since the first upload stored its models as LFS
    pointers. Each of the 494 pointers is replaced by the file it
    named, so every version of every model is in ordinary git, where
    git compresses it.
  - The whole history is 160 MB, and GitHub will hold no LFS at all.
  - Same 194 commits, authors, dates and merges, and the same files
    today, byte for byte. Release tags v0.1.0-alpha5 to v1.1.0-beta are
    carried across.
  - Commit IDs from the first upload onward are new. The old line is
    kept locally as `backup/2026-10-30-master-lfs-history`, and every ref
    as it was is in `C:\Manifest-safety-2026-10-30`.
  - Built with `git fast-export | fast-import`. `git lfs migrate export`
    was tried first and given up: on this two-root history it gave the
    upload commit a parent it never had.
- **The models and station geometry are stored compressed, and the game
  unpacks them itself (2026-10-30).** Astra: *"can you compress the data
  somehow?"*, then *"and ensure the executable can unpack the compressed
  data."*
  - Every .glb model and the station geometry (`src/ports/*.js`) is now
    stored gzipped, in plain git, with no Git LFS. That is 403 files, which
    go from 684.8 MB to 60.5 MB.
  - It is lossless. Each .gz was checked against the LFS checksum of the
    file it replaces, and all 403 match byte for byte.
  - **The .exe ships only the packed station files, 33 MB instead of 270 MB.**
    Its `game://` scheme unpacks each one in memory as the game asks for it
    (`electron/packed.js`), so the game sees exactly the script the
    generator wrote. Checked on a real Windows build: all 90 stations
    loaded from the .gz files, with no plain copies present.
  - The dev server (`tools/serve.js`) and the node loader in `src/ports.js`
    that the suites use read the .gz in the same way. The Pages deploy
    unpacks them on the runner, so the website doesn't change.
  - The plain files are still on disk as working copies that git ignores,
    so Blender and the tools open them as before.
    - `npm run unpack` writes them out after a fresh checkout.
    - `npm run pack` stores your changes.
    - `npm test` fails while any working copy differs from what is stored,
      so an edit can't silently miss the repo.
  - `test/packed.test.js` has 12 checks, and `tools/probe-packed.js`
    checks a packaged build.
  - The CI and Pages workflows no longer touch LFS, so there is no LFS
    bandwidth cost on deploys.
- **One line of work (2026-10-30).** Astra: *"let's take all the various
  work streams and integrate them into one."* Everything now lives on
  `master`:
  - The parallel sessions' uncommitted work from 2026-10-26 to 10-30
    (boarding, the tithe, upkeep, notes, cargo containers, hulls sized to
    their interiors) is committed (136d10f).
  - The Pages site branch (the landing page and the workflow that
    publishes the game on a push to master) is merged in.
  - The Abby release line had grown from a different root. Every one of
    its commits was already in the game's line, which was checked line by
    line, so it is joined by a merge that keeps the game exactly as it was.
    Its history and the release tags v0.1.0-alpha5 to v1.1.0-beta are all
    on master now.
  - The `driftwood-2026-10-15`, `crawler-abby` and `pages-site` branches,
    the website's spare worktree, and two old stashes (both already in the
    game) are retired. Every old head is kept as a `backup/2026-10-30-*`
    branch or tag.
  - Nine test suites that had never been part of `npm test` are in it now
    (farms, transfer, cruisesky, heading, airdata, orbitline, navsystem,
    twilight, cruisedrive). All of them pass.
  - Port models and `src/ports/*.js` are stored through Git LFS, as
    `.gitattributes` had asked for. Their content did not change.
    `Claude outputs/` is ignored.
  - Nothing is pushed yet.
- **The more you take, the more serious the crime (2026-10-30).** Astra, after
  one hold-up came to 41,028 cr: *"that's a lot of money, it should be a more
  serious crime the more money you take."*
  - A hold-up is charged its flat 400 cr plus half of what you took: credits,
    or cargo at its base price (waste counts as nothing).
  - Half, not all, so that being caught costs most of a big score rather than
    more than all of it. Otherwise the big transfer would be a trap rather
    than a choice.
  - Typical charges when reported:

    | Take | Amount taken | Charge |
    |---|---|---|
    | Freighter's cash box | 1,900 cr | +950 cr (with the flat 400, past the 800 cr at which police hunt you) |
    | 40,000 cr transfer | 40,000 cr | +20,000 cr |

  - The take rides on whichever report is still to come: a witness's, or the
    victim's own distress call. The report line says how much was taken and
    what it added.
  - A second hold-up of a ship that has already called it in is added at once,
    with the new figure.
  - Buying a witness's silence costs more too: 15% of what you took, on top of
    the usual price.
  - `upkeep.test.js` checks that the take rides on the pending report and that
    the bounty rises by the flat charge plus half of what was taken.

- **A trader has one purse, and a gun gets you part of it (2026-10-30).**
  Before, a shakedown took a fixed 150-850 cr that had nothing to do with the
  purse on her own screen, which the robbery left untouched. Astra: *"give the
  option to take more than a shakedown, but not everything, because that would
  mean they have nothing to get to port."* On a scheduled trader, the piracy
  menu now offers:
  - **Demand the cash box.** The cash aboard, a tenth of her purse. Once
    you've taken it, it stays empty until she is next in port.
  - **Demand a transfer.** Everything above what she needs to make port: a
    leg's reaction mass at hydrogen's price, plus her berth fee. She keeps
    that much and pays the rest.
  - Both come off the purse her screen shows, until she next settles with her
    owners (every six legs), when her float is topped back up. So a ship you
    robbed has less to pay you with if you answer her mayday, and she's worth
    robbing again next month.
  - Ships without a timetable (pirates, lane haulers torn out of slipspace)
    keep the old single "Demand credits".
  - Rescue payments use the same purse and the same top-up.
  - Typical takes (`Claude outputs/purse-survey.cjs`, 1,072 ships):

    | Ship | Cash box | Transfer (median) |
    |---|---|---|
    | Shuttle | ~400 cr | 2,500 cr |
    | Hauler | ~630 cr | 5,100 cr |
    | Freighter | ~1,900 cr | 15,800 cr |
    | Tanker | ~2,200 cr | 17,600 cr |
    | Liner | ~2,900 cr | 24,900 cr |

    The old shakedown was about 500 cr whatever the ship.
  - `upkeep.test.js` covers the cash box, the floor the transfer leaves, a
    second demand getting nothing, the top-up at settling, and the comms path
    end to end.

- **A small hold shows more of what is in it (2026-10-30).** A hold with more
  cargoes than stacks (a Mule's has two slots) used to show only as many
  cargoes as it had stacks. Now each container is its own cargo, biggest
  first, two to a stack, and a mixed stack's label names both. Holds with
  room for every cargo are unchanged: still one cargo to a stack.

- **Ships run about half full, and are sized for it (2026-10-30).** Astra:
  *"half-full holds that arrive at a rate commensurate with that, and have
  less XL size haulers."* Measured across 80 seeds first: waste haulers
  drawn at a median 95 m were 9% full, freighters 27%, tankers 29%, and
  local shuttles were carrying three times what a shuttle holds.
  - A ship's hold now holds her hull's capacity times the square of how
    much longer she is than her fitted length (`Gen.holdCapacity`); her
    walked hold, her screens and her crates use the same number.
  - Each scheduled route's ship is sized so the heavier of her two legs
    fills her to her own 42–62%, between her hull's fitted length and
    her class's longest (shuttle 70 m, freighter 150, hauler 110,
    tanker 190, liner 190). Where a bound bites, she runs more or less
    often instead (at most three times less often), and every leg's
    tonnage moves by the same factor, so what each market receives per
    day is unchanged. The rare load too heavy even then gets a ship
    longer than her class's longest rather than an overfull hold.
  - After, across the same 80 seeds: every class runs at a median 50–53%
    full (10th–90th percentile 43–61%). Waste haulers are now a median
    38 m, 70 m at the 90th percentile; the 100 m ones are rare.
    Freighters 88 m, tankers 117 m, liners 147 m. Local shuttles grew
    to 70 m and run more often, because what they carry is a third of
    each port's through-flow.
  - Return legs are lighter wherever the far end exports less.
  - Its own random streams: every other draw in the generator is what it
    was, but ship sizes and some timetables in every system change.
  - `test/boarding.test.js`: the hold table matches the hulls, the drawn
    hold matches the timetable's, and 1,071 scheduled ships across 40
    seeds run at a median 51% with none over full.
- **Every hull resized to fit her interior (2026-10-26).** Astra: *"if you
  have to resize hulls to fit their interiors, do it."* `tools/fit-hulls.js`
  finds, for each model, the smallest length and cockpit position at which
  every room on every deck sits inside the hull (hull above and below each
  sample, 4% edge allowance). It writes `src/hullfit.js` (`HullFit`), which
  `render.js` reads for `TRUE_LEN` and the cockpit anchor.
  - New lengths, in m:

    | Hull | m | Hull | m | Hull | m |
    |---|---|---|---|---|---|
    | Talon | 25 | Dart | 33 | Kestrel | 34 |
    | Mule | 35 | Wren | 25 | Bollard | 25 |
    | Samaritan | 29 | Sump | 31 | Longhaul | 38 |
    | Tanker | 51 | Cutter | 36 | Meridian | 80 |
    | Leviathan | 80 | Crawler | 164 | Heavy Tug | 31 |
    | Heavy Shuttle | 30 | Trader | 32 | Runner | 40 |
    | Enforcer | 31 | Enforcer Heavy | 31 | Fighter | 25 |

  - The capital ship and the carrier keep their lengths and bridges.
  - Bigger ships need bigger berths. A port turns you away when your hull
    won't fit its berth, and ports that don't take XL hulls refuse them.
  - The cargo bay now hangs off the aft end of the passage, with a door, so
    the airlock can have the port side.

- **Everyone in a pressure suit; the face is in a sketch (2026-10-25).**
  Astra: *"why don't we replace all NPC models with those that have
  pressure suits and helmets"*, then: *"Helmets remain on, but during
  chat, a portrait drawn in a 2D style and built a little bit like an FBI
  sketch."*
  - **The suit** (`npcmodel.js`): every body now wears a sealed helmet
    with a dark face plate and a faint HUD line, a seal ring at the neck,
    and a life-support pack with a hose up to the helmet. Each role's old
    headgear became its helmet, so roles still read across a room:
    - engineer: hard-hat shell and lamp, yellow or red on a Syndicate ship;
    - security: SEC band and sun peak;
    - medic: white helmet with the green disc;
    - gunner: ear cups and the red eyepiece;
    - raider: battered helmet with a rust crest and orange goggles;
    - pirate captain: spike and red eye;
    - enforcer: gold band;
    - fixer: gold-tinted plate;
    - marines, tactical and heavies keep the slab helmets they already had.
    The raider's bare tattooed arm is now a patched sleeve with the tattoos
    painted on.
  - **The portrait** (`portrait.js`, new): talking to someone shows their
    face beside what they say. It is assembled like a police composite:
    face shape, jaw and chin, eyes, brows, nose, mouth, ears, hairline,
    age lines, and the occasional scar or mole, each picked from a small
    catalogue by the person's seed. It is drawn in graphite on paper:
    outlines laid twice, hatching for tone, the shadow side
    cross-hatched, and the suit's collar ring at the bottom. Skin tone,
    hair and stubble come from the same draws as the body's painted face
    (`NpcModel.lookOf`), so the sketch is the person in the suit. The
    same person is always the same face.
  - Tests: `npc.test.js` checks that every body is sealed and that the
    portrait matches the body. Probe: `tools/probe-suits.js`.

- **Mouselook on foot (2026-10-25).** Astra: *"we're going to autoset
  mouselook for first person view."* Asked: **on foot only**, with the
  **pointer captured**. When you get up out of the seat, or walk a station,
  the mouse turns your head with no button held, and the pointer is hidden
  and locked to the window so you can turn all the way round. Hold left Alt
  to get the pointer back for the icon bar; let go and the mouse looks again.
  Esc, the menu, any F-screen and sitting down release it too, and a click
  (or any key) on the way back captures it again. The seat is unchanged:
  drag to look, right-Alt free look, F9 mouse aim. The walking hints now say
  "the mouse looks" and "hold Alt for the pointer". Probe:
  `tools/probe-mouselook.js`.

- **The loading screen says MANIFEST (2026-10-25).** The boot screen
  (`index.html`, `#boot`) still read "PROCEDURAL SPACE GAME", the working
  title. It now reads "MANIFEST"; the tagline under it ("gravity,
  clockwork, cockpit and cargo") is unchanged.
- **2026-10-24: every city site's town stands somewhere of its own.**
  Astra: "randomize the location of the city portion and the domes on
  those ports, without putting them on the landing apron or the door."
  The pad and runway city sites (s, m and l) carry their settlement as one
  piece in the art: three habitat domes, two greenhouse domes, the tubes
  between them, a water tank, sheds, solar panels and a mast, on a slab of
  its own. It always stood in the same corner. Now each port turns it to
  its own heading and stands it in its own place: on the site plate or
  beside the field. It stays clear of everything standing on the site, and
  further clear of the pad, the runway (and the runway's line well past
  both ends, under the approach and climb-out) and the doors. It stays
  within 1.12 of the site's half-span, so it never stands in the town
  dressing round the port. The domes move with the city rather than on
  their own: they are three sizes, and each one's vestibule faces the tube
  that reaches it, so a dome moved alone would leave a tube running into a
  blank wall. `tools/port-sites.cjs` reads the .glb models and writes
  `src/port-sites.js` (where each city is, and what it must keep clear
  of); render.js lifts exactly the city's 1,772 triangles out of the port
  (every corner inside the city's box: by centre it once took a slab of
  ground with it) and draws them where `Render.citySpot` puts them. The
  seed is new, `port.dressing.citySeed`, on its own random stream: the
  galaxy fingerprints and every port's signs, blocks and domes are
  unchanged. Where the art had the city there is now open site plate.
  `test/city-sites.test.js`, 52 checks.
  Same day, second pass: **the domes stand on their own, and the tubes
  always join them up.** Astra: "ensure that the domes always have tubes
  that connect to a branch point, a thicker tube, which goes directly into
  one of the faces of one of the city buildings." The slab, the tank, the
  two sheds, the panels and the mast still move as one piece; each of the
  five domes now has a spot of its own, turned so its porch door faces a
  branch point, a capped drum on the ground. A thin tube runs from every
  dome's door to the drum, and one trunk runs from the drum square into
  the middle of one wall of one shed (both sheds and five different walls
  get used). The sizes are taken from the art. A thin tube is square and
  a shade bigger than a dome's door, so it closes over it. The trunk is up
  to twice as wide and a little taller, but at most 85% of the wall's width
  and under the eave. It cannot simply be the art's tube made fatter: the
  art's tube is taller than a shed. Tubes have the art's tube colours, roof
  strip and ports, and run a little below the ground so they sit flush on
  the slab or off it. Every layout is checked before use: the trunk leaves
  through clear ground, no dome stands in another dome or a building, and
  no tube crosses a dome, a building or the trunk. The art's own four tubes
  are no longer drawn. The city is cut into its parts by a run list read
  off the art (`tools/port-sites.cjs`; the converter keeps the art's node
  order, checked on all six models), so nothing is guessed where a tube
  meets a porch. If no layout fits a port, the city goes whole, as the art
  laid it out, as before; on all six models every port tested found one.
  `test/city-sites.test.js`, 107 checks: every port joins its domes; every
  tube ends at its own dome's door, wherever that door has been turned to;
  the trunk is square to the wall, in the middle of it, fits it, stays
  under the eave and is thicker than the tubes; nothing crosses anything;
  and every corner of everything drawn stays off the pad, the runway's
  line and the doors.
  Same day, third pass: **the slab stands square to the site.** Astra:
  "the building that the domes connect to must be at a right angle to the
  other structures' walls; humans don't just put dotted lines on the
  ground to denote a square and then put a big four sided building at an
  angle to the lines." The slab, the tank, the sheds, the panels and the
  mast now turn only in quarter turns, so every wall runs with the pad's,
  the plates' and the markings'; the trunk leaves a shed wall square, so it
  runs with them too. The domes are round and keep any heading, and their
  tubes run where the domes are. All four quarter turns are used.
  `test/city-sites.test.js`, 113 checks.
- **2026-10-21: the comms channel fits a short window.** A port's ten
  options at a fixed 38 px a row printed over the traffic log in a short
  window, and the notes beside them ran off the right edge. The channel
  pane now takes the height its buttons need from the log first (the log
  keeps at least 96 px), the rows close up if that is still not enough,
  the footnote gives way when it is very tight, and every note is clipped
  to the pane, or left out if there is no room for a word of it.
- **2026-10-21: landing legs stand level, fold in half and pull up inside.**
  The hull converter (`tools/glb2hulls.js`) now brings every foot on a
  hull down to one level: the deepest foot, or 1% of a hull length under
  the lowest point of the hull if that is deeper. Legs are only ever
  lengthened, by sliding their lower half down the leg's own line. The
  heavy enforcer's nose leg grows about 6% of a hull length to match its
  rear legs, the runner's wing legs about 11% to match its nose leg, and
  the bulk hauler, courier and enforcer legs a little each so the feet
  clear the keel. Each leg is also cut at the knee: going up, the lower
  half folds back alongside the upper half, the folded pair pulls
  straight up into the hull, and then the bay door closes behind it
  (coming down is the same in reverse). The runner's wing is too thin to
  hold a leg, so its wing legs fold and then swing flat under the wing
  instead. No stowed leg reaches into a cockpit. Two new checks: every
  legged hull stands level, with its feet below its lowest point.
- **2026-10-21: survey instruments are graded by what they can see.**
  Astra: "a grade 1 scanner tells you where low grade minerals are, and
  grade 2 will tell you where fissiles are, and a grade 3 tells you where
  precious metals are."
  - **Grade 1, survey scanner** (6,400 cr): ores, water ice, hydrogen.
  - **Grade 2, gamma survey spectrometer** (new, 13,800 cr, development
    0.40 or better): adds fissiles.
  - **Grade 3, deep survey array** (23,500 cr): adds rare metals, and gives
    tonnes instead of words.
  - The SURVEY page lists only what an instrument of the right grade has
    mapped. It names the classes nobody has read ("not read - grade 2
    survey") whether or not anything is there, so the page never gives
    away which worlds hold fissiles.
  - The Guild pays for each commodity only on ground mapped by an
    instrument that reads it. Measured on one rich rocky world: about 660
    cr at grade 1, 3,030 at grade 2, 6,630 at grade 3. Flying sold ground
    again at a higher grade sells the newly read classes.
  - A drone digs the most valuable thing your survey has read, so a
    grade-1 survey keeps it on ore and ice.
- **2026-10-21: ship cuts tuned to the hulls' own seams** (ship-modules
  idea-stream). `tools/tune-cuts.cjs` moves each of Astra's cuts by at most
  4% to wherever it slices the least hull, and only when that slices at
  least 10% less than her line; it merges cuts that would leave a sliver
  under 4%, turns side cuts within 3% of the middle into one true centreline
  split, and drops cuts that would trim only the outermost 3%. 51 of 54
  ships changed (169 moves, 28 merges or drops). Her table is kept as
  `tools/ship-cuts-astra.json`. The chopper now makes a single plane for a
  centreline cut instead of two at the same place.
- **2026-10-16: the attitude ladder and bank scale are drawn sharp** under
  the glass glow. Measured on the RX 540: cockpit in a ring 22 > 40 fps,
  above it 37 > 51, in a belt field 26 > 40.
- **2026-10-16: rings do not bloom** (they mask alpha as bodies do).
- **2026-10-16: mining laser slowed** from about 7 s a chunk to about 11,
  because a rich rock out-earned a milfuel run, and the balance rule is
  that mining pays well but never beats active hauling.
- **2026-10-21: the loading screen says Manifest.** It said "PROCEDURAL
  SPACE GAME" in grey on black. It now shows the title card: the navy
  field, the eight-pointed compass rose and the Manifest wordmark, drawn
  from src/logo.js (now loaded first, before anything else), with the
  tagline and "loading". It fades into the title screen instead of
  blinking off.
- **2026-10-21: a new title card.** The wordmark is "Manifest" in Uncial
  Antiqua (chosen to suggest an epic voyage) in place of the Segoe
  Script, as outlines in src/logo.js. The navy is gone: the card is a
  starfield, with the wordmark above the compass rose rather than across
  it. On a wide window the logo has the left column and the menu sits on
  the right, with a box the menu's size under it telling one captain's
  rise (src/captains.js, twelve of them, a different one each launch and
  never the same twice running). Narrow windows stack the logo over the
  menu and leave the story out. The loading screen draws the same sky
  and logo in the same place from logo.js, and the title's first showing
  starts finished so the hand-over does not flicker. Tests: captains, 10
  checks; render 950/950.
- **2026-10-21: where the factory ships come apart.** tools/ship-cuts.json
  holds Astra's cuts for all 18 factory families at S, M and L: length
  cuts, deck cuts, and mirrored side cuts, as fractions of each hull. Set
  by eye in a cut editor (Claude outputs/ship-cuts-editor.cjs builds one
  page per size, real triangles from above and from the side, draggable
  lines). The carrier's conning tower is its cockpit, reached by lift.
  Groundwork for ship modules; nothing in the game reads it yet.
- **2026-10-21: the factory ships come apart (experiment, ship-modules
  branch).** tools/chop-ships.cjs cuts all 54 factory ships along Astra's
  cut table into modules: wings off whole as a mirrored pair, small parts
  kept whole in the cell their centre is in, hull shells sliced at the
  planes. Cells holding only a lamp or a bracket fold into the nearest
  piece of the same role, and a ship always keeps a fore and an aft piece
  (capital-l: 102 cells to 28 pieces; fighter-m: 23 to 20). Every pair of
  touching pieces records its joint. _ship-modules/view.html shows any ship
  pulled apart, drag to turn. Cut faces are still open; caps and standard
  sockets per size come next. Nothing in the game reads it yet.
- **2026-10-21: what a cut opens, a plate closes (ship-modules).** Where a
  cut slices one of a ship's solids, the outline it leaves on the plane is
  traced and filled: a wall at a length or side cut, a floor or ceiling at
  a deck cut, given to the pieces on both sides facing outward, in the
  part's own paint (capital-l: 1,718 plate triangles). Scraps are judged on
  the model's own geometry, not on the plates. The viewer can show the
  plates in yellow.
- **2026-10-21: round parts are pods (ship-modules).** A tank, bell or
  blister is never sliced by the cut grid: it becomes its own piece,
  trimmed once with a flat face (a fifth of its diameter) on the side where
  it meets the hull, and that face plated so it can mount on any hull
  piece; a dome's own flat side is its face. Round means a near-cube box
  with every vertex about the same distance from the centre (or a dome's),
  at least 6% of the ship's length across, and not a lamp, beacon, antenna
  tip, nozzle, engine, dish, nose or cockpit. Found on the couriers,
  shuttles, small trader, H2 freighters, tenders and tugs; smaller round
  parts stay whole inside their hull piece.
- **2026-10-21: plates are slabs, and every tank is a pod (ship-modules).**
  A plate was a sheet on the cut, so two joined pieces put two sheets in
  the same place and they fought for the pixels. Each plate is now a slab:
  outer face on the cut, inner face set back into its own piece (1% of the
  ship's length, at most a quarter of the part's own depth), walls round
  the edge. Pods' mounting faces too. The pod floor is 2.5% of the ship's
  length, not 6%: the same propellant tank is 3% of an L hull and 7% of an
  S, so a ratio alone made it a pod on one and not the other. Valves and
  sensor blisters stay with the hull by name. Propellant tanks are now pods
  on the freighters, liners, navy-l and enforcers as well.

- **The cockpit scales as one piece, and the bulkhead moved aft
  (2026-10-24).** Part of the ship-interiors work above.
  - **The scaling fix.** Before, the glass and screens grew with a hull's
    size but the consoles, overhead, bulkhead and dash were fixed at the
    Talon's. On a Mule the side windows sat outside its own consoles and
    the dash stopped well short of the windscreen. Now:
    - the room scales across and up with the hull, and fore and aft with
      the windscreen's real distance;
    - the dash runs from its near edge to the sill.
    The Talon is unchanged.
  - **Small hulls' dash screens are inside the glass now.** On a Dart,
    Fighter or Wren they stood past the windscreen, which the flat cockpit
    hid. They are drawn in toward the eye, scaled about it, so from the
    seat they look exactly the size they did.
  - **The rear bulkhead is 1.3 m behind the eye (it was 0.5 m)**, so there
    is room to stand and a door to walk through. The two rear screens sit
    either side of the door and are a third bigger. The bulkhead's greebles
    keep clear of the door and both screens.
  - **O stands you up in your own ship** instead of on the station deck.
    The station deck is through your airlock.
  - *Tests:*
    - new `test/shipdeck.test.js` (35 checks), now in `npm test`;
    - `test/greebles.test.js` checks each hull's fittings against that
      hull's own walls, not one fixed Talon-sized box, and checks nothing
      is mounted on the door (14);
    - `walk.js`: a shut sliding door is wall, and E only reaches things in
      the room you stand in.

- **No more force fields: every station that had one has sliding doors
  now (2026-10-20).** Astra: *"air locks to keep stations pressurized
  (let's get rid of the force fields)"*.
  - **Which stations:** 24 of the 96 station models still sealed a bay
    with a force field. They are every refinery and skimmer station and
    the mountain, runway and runway-city ground sites. The other 72
    already had real doors.
  - **What replaces each field:** a pair of door leaves, cut to the
    field's own size. They split down the long side of the opening, with
    a hazard stripe on the meeting edge, and slide apart until the
    opening is clear.
  - **They behave like real doors:** you can hit them where they stand,
    and they open in the same airlock cycle the berth already runs
    (outer gate, then inner, never both).
  - **Internal gates:** two gates inside the big skimmers stand at right
    angles to their berth. They became internal doors that open with the
    station, like the cradle's lift-well gate.
  - **Roll-up garage slats at the yards are unchanged.**
  - `berths.test.js` now fails if any force field survives anywhere.
  - Station modules drawn from your generator will bring their own
    airlocks.

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

- **The ramp's glitching (2026-10-31).** Astra: *"Ensure that ramp
  structures aren't width 0."* There were two causes.
  - **Flat rails:** the rails were single flat quads with no thickness,
    so seen along their length they broke up into a line of pixels. Every
    post and handrail is now a box, and a test fails if any rail side has
    no twin across from it.
  - **Drawn twice:** from outside a ship, her ramp was drawn twice, once
    by her hull and once by her room, in slightly different units. The two
    copies fought for the same pixels. The room no longer draws it when
    you are outside.
- **Planet names over your ramp (2026-10-31).** In a suit, or on your own
  ramp in open space, the orbit chart's labels no longer draw over the
  view, as they already didn't when standing on the ground.

- **A ship adrift stays adrift when you rob or hail her (2026-10-30).** Robbing
  her, or anything else that takes her off her timetable, used to hand her a
  working drive: she would run like any other trader.
  - Now she keeps her dead tank. She coasts under gravity with her slow tumble
    (`Sim.steerNpc`, `spec.adrift` from `Combat.liftTrader`), and stays on the
    distress band, her beacon wherever she drifts.
  - Passing her mass works on her where she actually is, and gives her a drive
    again.
  - "Lock her up" finds her by the right id.
  - Asking her aboard gets *"We would, if we could make way. Pass us some mass
    and ask again."*
  - The comms header no longer reads "0 m out" under a distress call or a
    traffic-control frequency.
  - **Seen in the game** (`Claude outputs/probe-rescue.js`, muted). At Mirven,
    the Mirefast Drover's tank let go:
    - her call was on the band and her transponder checked out;
    - one pass from a hold short of hydrogen left her needing 0.8 t more;
    - a second pass finished it, she paid 1,370 cr, her call came off the
      band, and she lit up and flew off;
    - the Tallow Runner, robbed while adrift, stayed exactly where her rail's
      drift has her (0.000 km) with her throttle at zero, still calling.
  - `upkeep.test.js` (58 checks) covers: asked aboard, robbed, still calling,
    and fuelled while lifted.

- **Container lettering read backwards (2026-10-30).** Astra: *"'Hydrogen
  Fuel' letters are backwards, ensure lettering always reads correctly no
  matter what side of the hull the cargo is on."*
  - The cause: the deck's frame is left-handed as the game draws it (your
    right is up × forward). The containers were laid out in the design sheet's
    right-handed axes, so every strip and pictogram came out mirrored.
  - The fix: `cargokit.js faceFrame` now runs each face's reading direction
    along normal × up. A container's turn is a pure rotation, so this fixes
    both walls of the hold at once.
  - Checked in the game on a container on each wall, and by a test that holds
    every face (front, side, lid) on both walls against the walker's own
    right.

- **Her hold, her screens, her crates (2026-10-30).** Astra: *"widen the
  hold, and make sure that the panels on the ship we're boarding display
  that ship's information. Make sure that the boxes in the hold are
  representative of what is actually in the hold."*
  - **Widened.** A ship bigger than her hull's fitted length has her hold
    widened to her own beam: measured against her model down the whole
    bay, at floor and ceiling, a metre clear of her skin, the way
    `tools/fit-hulls.js` measures rooms. The Pilgrim Barge's went from
    about 4 m wide to 11.9 m. Extra rows of crates go inboard of the wall
    rows, with a 1.8 m aisle kept clear down the middle.
  - **Her screens show her.** Aboard her, her bridge displays were
    drawing your credits, tanks and hold. They now show her: her name and
    hull where your money was, her hull's tanks (full: the game does not
    track an NPC's fuel), her manifest in her hold, against her hold's
    real size. Her own aft screen no longer lists her as its nearest
    contact. Your ship's screens are unchanged.
  - **The crates are her cargo.** Every line of the manifest gets its
    own stacks, at least one however small (two tonnes of medicine among
    300 t of waste used to round away to nothing), and a stack holds only
    one cargo. Facing a crate now says what is in it and how much
    ("Radioactive waste · 20 t"); the stacks of a line add up to the
    tonnes on the manifest. The hold fills from the door, as the old
    comment always said, so a half-empty hold no longer looks like an
    empty corridor from its door. Her hold's capacity grows with its
    floor (a 108 m hauler holds about 7,000 t), so the stacks are true to
    how full she is: the Pilgrim Barge's 78 t of waste is three stacks.
  - `test/boarding.test.js`: the widened hold, every crate inside it,
    every manifest line represented, the labels adding up, the bigger
    capacity. 50 checks.
- **A ship was far smaller inside than outside (2026-10-29).** Ships in
  space are drawn at their route's size, 1.4 to 4.5 times their hull's
  fitted length: the Pilgrim Barge is about 100 m long outside and was a
  31 m ship once you were aboard. Astra: *"we'll increase the ship size
  so that the hull interior makes sense"*, and, asked, each ship her own
  size.
  - A ship you board is as long inside as she is drawn outside. Her
    cockpit sits at the same point of her model, and her hold (or, on a
    small ship with no hold, her passage) runs on aft to fill the extra.
    The Pilgrim Barge, drawn at 108 m, now has a 46 m hold.
  - Her other rooms, her crew and her ramp are as before.
  - Hulls you fly are unchanged.
  - The ships-alongside layout and her hatch position use the same
    length, so the tube still meets her ramp.
  - `test/boarding.test.js`: every traffic hull at three times her length
    has the same rooms, a longer hold, her cockpit scaled with her, and
    nothing reaching further aft in her model than before.
- **Ships met nose to nose, with a Talon half inside a hauler (2026-10-29).**
  Astra: *"why are the ships coming together nose to nose?"* She aimed at
  a point 30 m from your centre, kept her nose wherever her approach had
  left it, and the tube ran centre to centre. Asked how they should lie,
  Astra said *"it should be ship dependent"*, so now:
  - **Two hulls of a size** (neither more than 1.6 times the other's
    length) lie **belly to belly**: she comes in beneath you upside down
    and the tube runs straight between the two ramps.
  - **A big ship and a small one** lie **side by side**, level and facing
    the same way, on your hatch's side. The tube drops out of her belly,
    runs across underneath, and rises into yours.
  - The gap comes from both hulls' shapes (`Render.hatchModel`: each
    ramp's mouth on the belly, and the box each hull fills), so they
    never overlap.
  - She points where her drive pushes: at you on the way in, engines
    first while braking, and turns to her final attitude in the last
    300 m. The tube connects only when she is within 5 m of her place and
    lying the right way.
  - The tube is a metre in radius whatever its length (it used to fatten
    with the gap).
  - Measured by `tools/probe-tube.js`: a Talon and a 97 m waste hauler
    side by side, 44 m of tube; a Meridian and a 108 m hauler belly to
    belly, her up exactly opposite yours, 29.5 m of tube.
- **Her drives burned flat out while she sat alongside (2026-10-29).** Once
  joined she was still steering toward your pinned position from a frame
  back, so she braked at full thrust every frame, which showed as lit
  plumes and slowly took her off her orbit. Joined, she now just coasts
  under gravity with her throttle at zero.
- **Her master was asked "Does your captain owe me anything?"** She is
  the captain. She is now asked "Do you owe me anything?" and answers for
  herself.
- **A ship asked alongside hovered about 1 km out (2026-10-29).** Astra:
  *"it is still hovering out about 1km in distance."* Her steering ran
  after your ship had already moved that frame, but she moved only after
  steering, so she always settled one frame of travel ahead of her aim.
  At 55 km/s and 60 fps that is 0.92 km. She now catches up to the same
  moment first, then steers. The same ordering held you a frame behind
  her once the tube was joined, so you are now pinned to her after she
  has moved, not before. Measured: she closes from 7.7 km and the tube
  joins at 30.0 m in 33 s, and holds there.
- **The contacts box said a ship you asked aboard was "fleeing".** It
  now says "coming alongside", "running her tube out", then "tube made
  fast".
- **The FLIGHT panel ran out of its frame.** RET was cut off by the left
  edge, PRO ran into the fuel bars, and the thruster burn time ran off
  the right. The burn rose is smaller, the bars start further right, and
  each figure (light-years, burn time) is right-aligned against its label;
  if a figure will not fit, it is dropped and the bar still shows it.
- **Landing gear hung out through its own shut doors (2026-10-29).** Astra,
  flying a Talon: *"there's something wrong with the landing gear doors."*
  The doors closed flush, but every hull's legs stowed 0.2–0.6 m short of
  folding away, so they poked down through the doors in flight.
  - `render.js` now measures each leg's stow angle against the hull's own
    belly over its bay, once per model: it turns the leg further the same
    way until it is inside, or the other way round if that is the only
    way it fits. Doors are left as they were.
  - A new render test says nothing hangs below the belly with the gear up,
    on every rigged hull.
- **No way in showed on her belly (2026-10-29).** *"I don't see where there
  could be a ramp to get in and out of the ship."*
  - The ramp and its bay were only drawn once the airlock had been used
    at least once. Your ship now has her airlock from the first frame.
  - With the ramp up, the well was an open dark hole: the ramp stows at
    deck height, above the skin. Two door leaves, painted the colour of
    the skin they replace, now close it flush with the belly. They slide
    apart in the first part of the ramp's travel.
  - Hazard stripes round every ramp (*"we need to put hazard stripes
    around the ramp ... around all ramps like it"*): a band about a
    quarter-metre wide of yellow and black at 45°, on all four sides of
    the opening, on every hull that has a ramp. It stays there with the
    ramp down as well as up.
- **Standing up in flight did nothing (2026-10-29).** *"standing up from my
  station doesn't work."* O only worked docked or landed. Now it works in
  flight too (not in hyperspace). Astra chose that the ship holds while
  you are up:
  - A pilot in your crew takes the helm and keeps whatever the autopilot
    was doing. E at the seat (or at her, sitting in it) takes it back.
  - With no pilot she coasts: the autopilots stand down, cruise drops out,
    and the controls stay locked until you sit down again.
  - Time compression drops to real time when you stand.
  - The outer door stays sealed in flight.
- **A ship's crew size came from a fraction (2026-10-28).**
  `crewForShip` compared a route's `size` (a mass fraction, e.g. 0.09) to
  'L' and 'M', so every ship in port was crewed like an S, with two
  souls. It now takes the size letter from her hull: three for an M,
  five for an L or XL. The concourse is a little busier for it.
- **The hand working a berth stood in front of its hatch.** E facing the
  hatch found the hand first, so you could talk to her crew but never
  get aboard her. They stand two metres or more along the wall now.
- **Her master refused to trade with you from his own deck** as "out of
  transmitter range". A traffic contact is one frame's rail position,
  and a moored ship rides her station round its orbit at tens of km/s,
  so a contact held from the moment you boarded was a hundred km away
  seconds later. Her contact is looked up fresh every time it's asked.

- **The station vanished round a berthed ship, and the cutaway with it
  (2026-10-26).** Astra: "what happened to our station cutaway for ships
  which are inside stations?" The berths sit at or just past a station's
  `radius` (Waypoint Dock: r 4.18 km, berth 4.36 km from the centre), so
  the "camera inside the bounding sphere" test failed. The centre then fell
  behind the eye and the whole station was culled: the ship sat alone in
  black space, and the cutaway had nothing to cut. The station the hull is
  in (`enclosedPort()`) now always counts as enclosing (`main.js`, the body
  list in the world draw).
  - **The cut edge is a double orange line with black between** (Astra: "a
    less busy, but still nicely convincing double orange line, with black
    in between them"). The capped band is split in thirds: orange, black,
    orange (`gl.js` FRAG_MESH). The band is skipped where the cut runs
    *along* a surface, like a floor lying along the line of sight, so it
    doesn't leave long orange slivers converging on the ship. That check
    came from the unmerged `cutaway-test` build.

- **A landed ship couldn't take off (2026-10-26).** `landed` was never
  cleared, so throttling up did nothing. Now, once landed, she settles
  onto the surface (upright, gear on the ground, turning with the world).
  She lifts off when the vertical thrust beats gravity by 2%, as long as
  nobody is walking aboard. She won't lift off with the ramp down: "The
  ramp is not up".
- **2026-10-16: contracts never settled after a full arrival.** Two
  dock-edge detectors shared one flag and the first one consumed it.
- **2026-10-16: station flicker.** Station vertices were rounded to a
  4 m grid on a 4 km station, crushing panels and thin walls into
  coplanar faces (cradle-s: 13,871 coplanar pairs, now 8).
- **2026-10-16: 45-degree bores poked through the hull.** They are clipped
  flush at the wall.
- **2026-10-17: scanner audit.** Astra asked for the scanners to be
  checked for bugs. Found and fixed:
  - **Low orbits left holes in a survey.** Below about 1.1 radii the swath
    is narrower than half a cell, so a diagonal ground track could run
    between cell centres and leave a chequerboard of unmapped ground it
    had flown straight over. A cell now counts once the swath reaches into
    it.
  - **One fresh cell made an old survey sell as new.** Value aged off the
    last time any ground was gained. It now ages off the coverage-weighted
    date of the unsold ground; the page's "as of" still shows the last
    pass.
  - **One deep-array cell made a whole scanner survey sell at array
    price.** Each survey now records how much of it each instrument
    mapped: the array's share sells at the full rate, the scanner's at
    0.6.
  - **The SURVEY page showed tonnages for ground only the scanner had
    mapped** as soon as an array was fitted. Tonnes now show only once the
    array itself has mapped a tenth of the world; otherwise grade words.
  - **The nav page's "carrying" row disagreed with the ship's hold.** A
    trader you had just robbed still showed a full hold, and a pirate full
    of other people's cargo showed nothing. It reads the same hold that
    robbery and wrecks use now.
  - **The trade analyser could start a run at an empty warehouse.** Runs
    now start only where there is at least a tonne to load.
  - Checked and found sound: the survey spin frame agrees with the ground
    frame that ports and drones use. A survey stalling at 16% round
    Mirven II a was the test orbit, not the scanner: that moon's Hill
    sphere is only about 2.2 radii, so small moons close to big planets
    can only be mapped on close passes, not orbited.

- **2026-10-18: a rock shattered at one star also vanished at others.**
  Rock state was kept by rock id alone, and ring-rock ids repeat from
  system to system. It is kept per system now; older saves' entries still
  count, so nothing a torpedo took comes back.

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

### Saves

- `notes` (string) and `journal` (array) are new, and additive. An older save
  loads with an empty notepad and an empty log; nothing is invented for it.

Careers carry over. Everything new (surveys, claims, drones, the landed
spot, shattered rocks, torpedo refunds, sabotage) is additive and loads as
"nothing yet" on an older save. A survey made before the scanner audit
keeps exactly the value it had: its ground counts as mapped by the
instrument its grade says. A survey taken with the deep array before
2026-10-21 counts as grade 3 and is worth what it was. One taken with the
scanner now reads ore, ice and hydrogen only, so an unsold scanner survey
of a world with fissiles or rare metals is worth less than it was.
A city site's town is placed from the port itself, not from the save, so
an older career sees it in its new place the next time it lands there.

- **Careers load unchanged.**
  - A Crawler's livery is new and optional (`livery`, `liveryFaction` on
    the ship and on fleet records); an older career's Crawler loads
    civilian, which it was.
  - Walking aboard is not saved, any more than walking a station is: a
    load puts you back in the seat.
  - The people (2026-10-25) are not saved either. Who is where is worked
    out from the roster, the port and the clock, so a load finds the same
    people at the same posts without storing any of them.

  - The airlock (2026-10-26) is not saved either: a load finds her
    sealed, ramp up. A career saved while landed loads landed and settles
    onto the surface as before.
  - Who you have paid and who you have refused (`tithe`, by system) is
    saved. An older career owes nobody anything.

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
