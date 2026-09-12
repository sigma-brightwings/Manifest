# Manifest — the plan

**The single design document.** `DESIGN-NOTES-WEAPONS-AND-BEACON.md` and
`SLIPSPACE-TODO.md` have both been folded into this file; anything that
referred to either one means the weapons/beacon sections and Phase 15
(slipspace) here.

It began as a plan for outfitting and combat and grew past that. It now
covers weapons, the law, debris and salvage, mining, the economy and how
piracy reaches it, faction war and territory, who hunts whom, the mission
board, subfactions and crew, hydrogen, comms, black holes and radiation,
the pulsar beacon, drive upgrades, naval stations and the work they hand
out, the tow service and the pirate mark, and eventually a fleet.

**Start with the Status section immediately below** — it is checked
against the source rather than against memory, and it is the fastest way
to know what is real. `CHANGELOG.md` carries what changed and whether
saves survive; `CLAUDE.md` carries the doctrines and the toolchain
quirks.

---

## Status

Checked against the source, not against memory. Everything below was
verified by loading the modules and inspecting what is actually there.

### Built ✅

| | Where |
|---|---|
| **Phase 1 — the slot model** | typed slots, power and mass budgets, nine lasers, three reactors, sell-back at 45%, `canFit` reasons, `replanFit` on hull change, `migrateFit`, save persistence |
| **Phase 2 — the F5 page** | text entry primitive, pilot/ship/registration editing, yard rebuilt in three tabs, `stockAt` port filtering, scrolling with wheel + scrollbar, yard named for the port's role |
| **Phase 3 — weapons in the control scheme** | `fireGroup` over the fitted hardpoints with per-slot cooldowns, two groups on two triggers (`Space` / `Shift+Space`, mouse 1 / mouse 2, middle button launches), mouse-aim steers with no button held, `contextmenu` suppressed, group assignment on the F5 FIT page, `groups` in the save |
| **Weapon heat** *(the other half of Phase 3)* | every shot spends `heat × cooldown` through `addHeat`; the turret too. This is what switched the heat sinks on |
| **Seed discipline: pirate holds** *(pulled forward from Phase 4)* | `manifestFor` / `holdOf` hash `'hold\|sys.seed\|spec.id'`, biased to local trade, derived once then owned; canister scatter and the robbery purse derived too |
| **Heat sinks** *(part of Phase 5)* | launcher, charges, `armSink`, `addHeat`, `updateSink`, ejection record |
| **Hull roles** *(not originally a phase)* | `liner` traffic class, `navy` patrol class, hull assignments, `killNavy` / `killLiner` charges, navy as a piracy deterrent |
| **The settlement chain** *(not originally a phase)* | `Eco.setPressure` 0.25–3.0, `Eco.galaxyProfile`, byte-identical at 1.0, tested |
| **Wider habitable zone, more planets** *(not originally a phase)* | 6–12 planets, optimistic HZ, tighter orbit spacing; 2+ habitable worlds in half of systems |
| **Model pipeline** *(not originally a phase)* | `glb2hulls` splits cockpit interiors from hulls and emits the canopy box; 33 redesigned models imported |
| **Slipspace core** *(not originally a phase)* | Mass-scaled transit time, interstellar lane timetable, wakes and wake scanning, `Shift+J` wake-following, a flyable interdiction corridor with HUD, the interstellar drop-out locale — see Phase 15 |
| **Phase 4 — death, debris and salvage** | Eight-shard mesh pool built once, wreckage spawned on `killNpc` and hashed off the victim, a cheap ballistic path in `sys.canisters` with no rail, a global cap, salvage through the existing scoop — see Phase 4 |
| **Slipspace outfitting and the interdiction payoff** *(Phase 15 items 1, 2, 6)* | Both slipspace modules are `EQUIPMENT` in four classes each; a torn-out hauler now carries a hold worth taking and a purse it can only hand over once; bolts draw as elongating streaks |
| **Shields on both sides, and impact effects** *(not originally a phase)* | NPC shields gated by class and by the model's own size letter, `splitDamage` as one rule for everyone, a form-fitting shell that flares and dissipates where it is hit, a hull bloom where a shot gets through, and a canopy flare so you can see your own — see the shield section. **Tested, never looked at** |
| **The cockpit kit** *(not originally a phase)* | `Render.cockpitSpec(ship)` — archetype table by hull id for character, cube-rooted `dryMass` for size, seeded flair off `ship.bornId` (stamped in `buyHull`, saved additively, and NOT the editable `reg`). Every multiplier is 1.0 for the Talon so the hand-tuned bridge is untouched and other hulls deviate from it. `canopySegments` gives a flat windscreen — the old `APERTURE`, chamfers and all — plus quarter-lights hinged on its outer edge, and `apertureSet` punches every pane. Rake is measured off the hull's own mesh via `hullFineness`, with the archetype as fallback. **Tested, never looked at** |
| **MFDs as textured quads** *(not originally a phase)* | `gl.js` gains a panel pass: `GL.queuePanel` takes four world corners and a canvas, and the perspective divide falls out of `gl_Position.w = depth`. `mfdBegin` now RETURNS the context to draw into — an offscreen canvas on the GPU path, the caller's own with the old affine otherwise — and `drawCockpitInterior` punches the glass out of the 2D console with `destination-out` so the quad shows through, since `#gl` sits beneath `#view`. ⚠️ **The GPU half cannot be tested here** (no WebGL under node) and its per-frame upload cost is unmeasured — see below |
| **The arrival, animated** *(not originally a phase)* | `Sim.beginArrival` / `stepArrival` / `arrivalPose` — a closed-form rail through approach, pad, shaft foot, traverse and berth, driving the apron doors, the level car and the inboard gate off the leg. `dockShip` is deliberately unchanged and is the rail's own endpoint, so `save.js` and the direct callers are untouched; a save taken mid-ride records the destination and reloads berthed. Hooked at `padCapture` inside `checkImpact` — the auto-dock path alone would have made it a sequence nobody ever saw. Warp forced to 1×; the enclosure and the camera clamp both follow the leg, and the shaft gets its own clamp because mid-descent the hull is above the hangar ceiling |
| **A berthed ship is inside a building** *(not originally a phase)* | `enclosedPort()` is the single predicate; berthed at a surface port the stars, grid, orbit lines, every other body, the trajectory, the traffic and the canopy sun-glare are all suppressed and only the port itself is drawn. F2 is exempt — asking for the orbit chart from inside a hangar must not answer with a blank map |
| **The Syndicate, and permissivity on two axes** *(not originally a phase — save epoch 2)* | Balanced-capacity Voronoi for the majors, three pirate holds at ~18% of stars under one named Syndicate keeping the reserved `outlaw` id, three minor powers; `sys.violence` and `sys.corruption` as separate scores with `crimeScore` derived from both and the per-government pairs *solved* to preserve the old distribution; no naval garrison in a hold but a cutter in transit; ports in holds, half of them flying a rival flag as the legitimate front door |
| **Buying and intimidating witnesses** *(not originally a phase)* | `G.pendingReport` gives a third-party witness an 8 s call delay where there was none; `hushQuote` prices silence as cargo — the local going rate sampled from the nearest ten ships and stations, times tonnes of risk by offence — discounted 2%/point above standing 10 and free above 70, where it stops being a purchase and costs faction standing instead; enforceability from corruption plus standing; the roll hashed off the act |
| **The Chernobyl drive and the waste ban** *(not originally a phase)* | `mildrive` in four classes at the tightest gates in the catalogue; halves `hoursPerLy`, refuses hydrogen, burns `milfuel` slugs out of the hold and breeds `waste` back into it; fitted permanently and *armed* per jump; `milfuel` bred at reprocessing plants licensed by a naval garrison, in a post-pass with no rng draws; the Syndicate bans the WASTE rather than the drive, so `jumpPlan` quotes `arrivesDirty` and `doJump` needs a second press |
| **The grey market, switched on** *(the plan's own largest dead code)* | Two grey guns that keep their damage and pay in heat and certainty, gated on **corruption** rather than permissivity; the bootleg seeker, its hashed crate quality and a cook-off you get to play — see the availability section |
| **Heat on both sides of the gun** *(the blocker, now cleared)* | `NPC_SHED` per hull class as a bonus over the bare 18/s, lazy-initialised exactly like `npcShield`; `updateNpcHeat` runs the SAME `Sim.updateHeating` the player uses through a reused proxy; NPC guns spend `heat × cooldown` firing; player shots deposit heat by delivery (`THERMAL_SHARE`), attributed, so a hull that cooks is a kill or an accident depending on who put the heat in; a pirate's seeded cheap rack cooks off when its own hull gets hot enough |
| **The Syndicate's own arms locker** *(not originally a phase)* | `SYNDICATE_TRUST` (70) as the one fact behind two consequences — no more paying witnesses, and their quartermaster sells the muon-tier `GUNS.syndbeam` — gated in `stockAt` on standing with `outlaw` specifically at a port the Syndicate holds, not the ordinary per-port `minStanding` check; their `police`-kind enforcement wing fires `SYNDICATE_GUN` (~2.9× `NPC_GUN`'s DPS) while a loitering `pirate`-kind raider under the same flag does not |
| **Corruption: shown, driven, spent, and given teeth** *(not originally a phase)* | `sys.corruption` stays a fact about the government; `G.corruptionShift`, saved per star and read back decayed on a half-life rather than ticked, is what the player actually moves — a small nudge from a witness PAID (never one merely intimidated), a small nudge from a customs officer bribed out of a catch, or a large deliberate one from the new `bribePort` action in the yard screen; `effectiveCorruption`/`systemCorruption` replace every direct read of `sys.corruption` (the grey market gate, `hushQuote`); `resolveScan` gained a bribe-out-of-a-catch branch scaled off it; the F2 survey panel now shows violence and effective corruption (with a qualitative label and the baseline called out when a bribe has moved it) and flags Syndicate-held territory, none of which was visible before |
| **Time warp only pins to 1x for real danger** *(not originally a phase)* | `updateEncounters` gained `result.dangerClosest`, tracked only across `hostileToPlayer` contacts and intercepting/demanding pirates; the hard 1x floor now reads it instead of the old `closest` (any awake contact), so a routine, no-choice police scan only gets the soft 500x cap — an actual threat still pins exactly as before |
| **Remote spectroscopy + travel-guide flavour text** *(not originally a phase)* | Every planet type gained a seeded `ATMO_COMPOSITION` string, drawn off its own `flavRng` sibling fork so existing orbits are untouched; the F2 panel's unsurveyed branch previews an unvisited star through the same `Gen.generateSystem`/cache path a real visit uses (`previewSystem`, never touching `G.visited`) to show planet count and composition; every **habitable** planet also gets a whimsical `lifeNote` and a `cultureNote` picked from violence/corruption/pirateHeld-keyed buckets; every **system** additionally gets one `systemNote` keyed off what was actually generated (habitable count, giant count, port count) rather than the government axis, shown both surveyed and unsurveyed |
| **Dithered glass** *(not originally a phase)* | Face-material prefixes: `!` emissive, `~h` glass at `h/15`. An 8×8 ordered-dither `discard` in the mesh shader for the GPU path, real `globalAlpha` in `paintMesh` for the 2D one. First consumer is the greenhouse panes, which had been opaque — sealing the emissive crop that is the whole point of the building inside an unlit drum. **Tested, never looked at** |

### Built but inert ⚠️

- ~~**The grey market has no goods.**~~ **CLOSED.** Two grey guns and a
  bootleg seeker now set the flag, and the gate moved from `crimeScore` to
  `sys.corruption` — see the availability section for why that is not a
  tuning change but a correction.
- **The muon cannon does not exist** as an item. Note also that its spec
  below quotes a `pierce` field which **has never existed**: it was written
  before `splitDamage`, and the model that actually shipped is
  `vsShield` / `vsHull`, where a shot spends part of itself on the bucket
  and the remainder carries to the hull. `pierce: 0.85` translates to a low
  `vsShield` — the shield barely absorbs any of the shot, so nearly all of
  it goes through — and that is a better fit for the weapon than the
  original wording, because it makes a capital gun *bypass* a shield rather
  than have a separate rule.
- ~~**NPCs have no heat state.**~~ **CLOSED**, and it turned out to be
  smaller than it looked: `Sim.updateHeating(ship, sys, t, dt)` never
  mentioned the player. It asks for `heat`, `heatShed`, `pos`, `vel` and
  `hullHp` and does not care whose they are. Nothing was stopping an NPC
  from having them except that nobody had handed them over. The casaba
  howitzer is now unblocked; see the weapons section.
- ~~**The ejected heat sink is a record, not an object.**~~ **CLOSED.**
  `Sim.spawnSink` puts a real tumbling block in `sys.canisters` on the
  Phase 4 shard path — so it drifts, it is a scanner return, and it is
  drawn. It is a shard with `sink` set rather than a fourth kind of loose
  object, for the same reason salvage is a shard with a `cid`: everything
  it needs already exists and three places branch on it. Two things it does
  NOT share with wreckage: it lives 150 s rather than 90, and it is exempt
  from `DEBRIS_MAX`, because being deleted by the sixteen shards of the ship
  you just killed is precisely the case it exists for. The heat is
  closed-form off a 34 s half-life (`Sim.sinkHeatAt`) rather than ticked —
  same idiom as `corruptionShift` — and one `sinkRGB` walks white-hot →
  orange → dull iron, so the hull, the bloom and the scope cannot disagree
  about how hot the same object looks. `G.sinkEjections` still records the
  three numbers, which now outlive the block itself.
- ~~**No way to see which group is firing from the cockpit.**~~ **CLOSED.**
  The GUNS dashboard page: every hardpoint the hull has (empty ones
  included), which way it points, what is in it, which trigger it answers
  to, and how far through its cycle it is, over the hull-heat bar and the
  sink's state. It stores NOTHING — membership is Combat's `groups` map,
  readiness is the `G.gunCool` entry the trigger already writes, and the
  side pointer is read off the muzzle the renderer draws the beam from — so
  there is nothing here that can drift out of agreement with the ship.
  Under time compression the soft-key strip says the triggers are inhibited
  rather than describing a trigger that would refuse.
*(The two slipspace entries that were here — unpurchasable modules, and an
interdiction that ended in an empty room — are both closed. See Phase 15.)*

### Not started ☐

Phases 5 (apart from heat sinks), 6, 7, 8, 9, 10, 11, 12, 13, the rest
of 15 — escort for hire, ship-to-ship trade, and flares — and 16, 17 and 18.

**Item 5 of the play report is BUILT** — the destination line and the
DETAILS button on a signed contract, and with them the mission-text
generator and the fact-driven prose from Phase 10. The remaining five are
unstarted and four are small: the contract resolution card and log, mission
marks on the nav list and the star chart, and the market's cost basis and
deal gradient. None of them needs a phase to land in.

**Phase 4 is now built**, which unblocked two things that were waiting on
it: the ejected heat sink has become the physical scanner return it was
always meant to be (see above), and mining fragments in Phase 5 are the
same shards from a second source.

**The spent sink is now an object that nothing reacts to**, which is the
next question rather than a defect. It is visible, it is hot, it says where
you were and it cools over two and a half minutes — but no NPC reads it. The
two obvious consumers, in order of how much they would change: a hot block
astern is the classic seeker DECOY, and a hot block at a scene is EVIDENCE
a patrol answering a distress call could act on. Both are design decisions
rather than plumbing, and neither is started.

**A CURVED WINDSCREEN BOWS OFF THE SCREEN, and it took three attempts to
see why** — worth recording so nobody rebuilds it as a curve again. A band on
a sphere has an exact angular elevation at every bearing, which sounds like
precisely what a wrap-around canopy wants. But a pinhole camera projects y/z,
and for that band y/z works out as tan(e)/cos(a): at the 45-degree corners
that is 1.41x, so the glass runs a long way past the top and bottom of the
view. The suite reported the window spanning twice the height of the screen
and covering 2% of it, which is what a bowtie polygon measures as.

The two failed shapes before it are worth knowing too. A cylinder at constant
height is worse, because a corner at 45 degrees sits at z = cos(45)*r and the
same height reads as a far steeper angle out at the edges. And rake applied
as a constant z-offset swung the outer corners from 45 to 50 degrees off-axis,
because z is already small out there.

The answer is the one real aircraft use: flat windscreen, wrap from separate
panes angled outboard. The rake then has to move the whole band rather than
tilt within it, which is what `rakeBias` does — small, because it changes
where you are looking.

**The MFD panel pass has an UNMEASURED per-frame cost, and it is the one
number this change owes.** Five panels at 460x178 RGBA is 0.31 MB each, so
about 1.56 MB of texture upload per frame — roughly 94 MB/s at 60 fps, on a
Latitude 5420's integrated graphics. That may be nothing or it may be the
whole 3 ms renderer budget; it cannot be measured from node, because there is
no WebGL there, so it has to be profiled in the browser before anyone calls
this done. If it bites, the fix is cheap and obvious: a readout that has not
changed since last frame does not need re-uploading, and most of them change
far slower than 60 Hz. Do not pre-emptively optimise it — measure first.

**The shield shell deliberately does NOT use the new dither**, and this is
worth writing down because unifying them looks like an obvious tidy-up. The
shell is drawn *additively* on the 2D layer, and its rim brightness is a
free consequence of overlapping faces adding up along the silhouette. A
dither cannot add: a kept fragment replaces and a discarded one contributes
nothing, so moving the shell onto the dithered mesh path would lose the rim
entirely and buy nothing. Dithering replaces *source-over* transparency, not
additive. The glass domes are the right consumer; the shield is not.

**What the dither costs, for whoever reaches for it next.** The pattern is
locked to screen pixels, so it crawls against a moving hull instead of
sticking to it, and below a few pixels across there are not enough samples
left for the shape to read at all. Fine for a greenhouse pane the size of a
thumbnail. Not fine for a full-screen canopy — that one wants real blending
and the sort that comes with it. The geodesic glass domes still being
modelled are the case this was built for and are not in yet.

**The seed-discipline correction is now closed.** `combat.js` no longer
invents a pirate's manifest with `Math.random()`; `manifestFor` hashes it
from the ship's own id, salted with the system seed, and `holdOf` is the
single read point so robbery and death cannot disagree. The remaining
`Math.random()` calls in `combat.js` are all in-the-moment die rolls that
are *meant* to be unrepeatable — a customs search, a witness deciding to
talk, an NPC's shot connecting — and those are not generation.

---

## Reported from play — 2026-09-08

Six items came back from the seat. Five of them are the same complaint
wearing different clothes: **the game already knows the thing and will not
say it.** The sixth is a rule for a feature that does not exist yet, and it
is written down here so it never has to be discovered by looking at it.

None of these are hard. All of them are the difference between a simulation
and a game you can play without a second screen open.

### 1. A contract ends and nobody sees it

Not a missing message. `Missions.completeAtDock` already calls
`say('Contract complete — N cr', 5)` and `update` already says
`'CONTRACT FAILED: … — fined N cr'` when a deadline passes. The message
exists and is unread, for three separate reasons:

- **Completion fires inside the arrival rail.** `dockShip` is the rail's
  own endpoint, several seconds into a closed-form ride through approach,
  pad, shaft foot, traverse and berth. The line goes up while the player is
  watching a hangar door move, on a channel that expires in five seconds.
  By the time the market panel opens it is gone.
- **Failure fires wherever you happen to be** — possibly mid-fight, on the
  same one-line channel as combat chatter, weapon heat and customs.
- **There is no past tense.** `G.ledgerLog` keeps six trade lines because
  trades needed a record; contracts get nothing at all. An hour later there
  is no way to find out what happened to a job you signed.

Both halves are needed:

1. **A contract resolution card.** Drawn once when you berth and once on
   the F7 board, listing every contract that resolved this dock: what
   completed and what it paid, what failed and what it cost, and the
   standing that moved. Dismissed on any key. It is the docking equivalent
   of the arrival rail — the thing that happens *because* you arrived — and
   unlike a `say` it can be read at leisure.
2. **`G.contractLog`**, the same shape and the same size as `G.ledgerLog`:
   `{text, t, ok}`, twelve deep, written by `completeAtDock` and by
   `update`'s failure branch, drawn under the board. One writer per
   outcome, so a mission type added later cannot resolve silently.

**Sound carries the verdict before the text does.** Success and failure
should not share a cue. This is the cheapest half of the whole item.

### 2. The nav list does not know about your contracts

`drawNavScreen`'s CONTACTS column colours rows by `e.hostile` and by
selection, and by nothing else. Meanwhile `G.missions` carries `toPortId`
for every haul and disposal and `toStarId` for every courier. The screen
that exists to answer "where am I going" is the one screen that has not
been told.

- **Mark the row**, don't recolour it. Hostile is already `#ff8a76` and
  selection is already `MFD_HOT`; a third colour on the same text would
  make a hostile mission destination unreadable as either. A leading glyph
  in the board's own amber — `◆` — plus the contract's tonnage as a right-
  hand tag, leaves both existing meanings intact.
- **Two contracts to the same port is one mark**, with a count. The list is
  already tight at 24 characters of name.
- **Out-of-system destinations have nothing to mark here**, and pretending
  otherwise is worse than silence. A courier bound for another star belongs
  on the star chart, so `drawStarMap` gets the same treatment: a marked ring
  around any star that a signed contract names. That is the actual fix for
  "I forgot where this parcel was going."

### 3. The market terminal has no memory of what you paid

`G.ship.cargo` is `{cid: tonnes}` and that is all it has ever been. There is
no cost basis anywhere in the save, which is why the terminal can show you a
sell price and cannot tell you whether it is good news.

**The model: a weighted average per commodity.** `G.ship.cargoCost = {cid:
crPerTonne}`, updated on buy and only on buy:

```
cost' = (ownTonnes * cost + boughtTonnes * price) / (ownTonnes + boughtTonnes)
```

Selling does not move it, jettison does not move it, and the entry is
deleted when the last tonne goes. Chosen over a literal last-price-paid
(which slanders a cheap load the moment you top it up at an expensive port)
and over a per-lot ledger (truer, but it changes the shape of the hold
everywhere — manifest, jettison, scans, piracy, saves — for a readout).

**Three traps, and the first one is the one that will bite:**

- **Contract freight is in the same hold and cost nothing.** `accept()`
  pushes `offer.tonnes` straight into `G.ship.cargo[offer.cid]`, so 18 t of
  contract grain sitting on 10 t of bought grain would drag the average to
  a third of what you actually paid. The average must be kept over
  **uncommitted tonnage only**: `own = held − committed`, and
  `committedTonnes()` already exists in `screens.js` and already keys by
  commodity for exactly this reason.
- **Salvage and piracy enter at zero, and that is correct.** A scooped
  canister genuinely cost nothing. It should read as pure margin, because
  it is.
- **Negative-price cargo.** Waste is bought at a negative price — the port
  pays you to take it. A negative cost basis is arithmetically fine and
  makes the margin rule read backwards, so waste is excluded from the
  colour rule and keeps the amber treatment it already has.

### 4. Green, amber, red — and what the gradient is measured against

Both price columns get coloured, by two different rules, because they answer
two different questions.

| Column | Question | Scale |
|---|---|---|
| **SELL** | did I make money | your cost basis for that commodity |
| **BUY** | is this port cheap | that commodity's spread across this system |

**A fixed percentage band would be wrong**, and this is the part worth
getting right. ±12% on grain (base 64 cr) is eight credits; on AI cores
(base 4200) it is five hundred. The threshold has to come from what the
market is actually offering, and the game can already compute that:
`bestMarketFor(cid)` in `screens.js` walks every port in the system and
returns the best sell price going. Give it a sibling that returns the worst,
and the gradient has real ends:

- **SELL** interpolates over `[cost, bestSell]` — full red at or below what
  you paid, amber at break-even plus the fee you would eat anyway, full
  green as it approaches the best price in the system. Selling at the best
  port in the system *is* the green, by construction, and no constant had to
  be invented to say so.
- **BUY** interpolates over `[worstBuy, bestBuy]` across the system for that
  commodity, so a genuinely cheap port glows before you own a tonne of it.
- **Zero-cost cargo** (salvage, piracy, a contract's freight) is not on the
  scale at all — it is drawn in the board's amber with the tag that says
  why, because "infinite margin" is not information.

The honest limit, which the manifest page already states in its own hint:
**this is system-local knowledge.** The terminal must not imply it knows
what grain fetches four jumps away.

### 5. ✅ A signed contract cannot explain itself — BUILT

*Both halves landed, plus the headline generator below. Destination line and
DETAILS button on every active contract, `arcs.js` chapters given a long
form they never had, and five new checks in `render.test.js` covering a path
the suite had never exercised: 1,494 green.*

This one is almost embarrassing, because the fix is entirely deletion of an
omission. **Both halves already exist in the data and neither is drawn.**

- **The destination is on the contract.** `accept()` copies `toPortId`,
  `toStarId` and `toName` onto the accepted mission. The ACTIVE CONTRACTS
  column draws `m.text`, the fee, the time remaining and a FREIGHT MISSING
  warning — and never the destination as a field. It is visible only if the
  generated headline happened to mention it, which for a haul it does
  ("18t Grain to Halden Dock") and for a campaign chapter may not.
- **The long form is on the contract too.** `desc` is deliberately *carried*
  rather than regenerated — the comment in `accept()` says so in as many
  words: "a contract you signed a week ago has to still say what it said
  when you signed it." Then `drawMissionScreen` gives the DETAILS button to
  the **board** only. The one place `desc` was designed to be readable is
  the one place it cannot be read.

So: a **DETAILS button on every active contract**, the same
`G.missionDesc` toggle and the same `wrapText` panel the board already uses
— the board's version is drawn from `off.desc`, and this one is drawn from
`m.desc`, and that is the entire difference. Plus a destination line under
each active contract: **port, body, and system**, spelled out rather than
inferred from the headline, with the out-of-system case saying which star.

Do this in the same pass as item 2's nav marks. They are the same
question — *where is this going* — asked on two different screens, and
answered from the same three fields.

### 6. Turrets go on the outside of a hull

Recorded ahead of the feature, deliberately. **There is no station turret
code in the project today and no navy base** — `grep` across `src/` finds
`turret` only as the ship's own auto-turret in `combat.js` and as an
inventory label in `screens.js`, and `navy` only as a patrol class and a
ship model. So this is not a bug report against something that exists; it is
the constraint written down before the first version can get it wrong.

> **A defensive turret is placed on the exterior surface of a station's
> hull, facing out. Never inside the envelope, never inside a bay.**

The reason it needs saying is that the placement machinery this will reach
for is `buildPortDressing`, whose `{u, r, h}` — bearing, radii out, height —
is a **surface-pad** coordinate system, generated for a port sitting on a
world with a ground plane under it. Feed a station's radius into it
unchanged and half the emplacements end up inside the drum, invisible from
outside and clipping through the bay the player is berthed in. The interior
rules in `starport-interiors` and the exterior dressing are two different
spaces and turrets belong entirely to the second one.

---

## What already exists

Worth knowing before touching anything, because roughly half of this is
already load-bearing:

- **`combat.js`** — guns, auto-turret, Hawk seekers, two shields, hull
  catalogue, `buyOutfit`/`buyHull`, `damageNpc`/`killNpc`, and the whole
  witness-based law: `crime()`, `witnessNear()`, distress delay, `G.wanted`
  per faction, `WANTED_HUNT = 800`, fugitive status, clearance.
- **`screens.js` `drawYard()`** — the shop, a flat row of buttons inside the
  F5 hold panel. One gun, one turret, one shield, missiles, hulls. No
  selling, no slots, no stock variation by port.
- **`screens.js` `fittedEquipment()`** — the "about my ship" list. Reads off
  the ship rather than a table, which is the right instinct and should
  survive.
- **`sim.js` `dropCanister`/`updateCanisters`** — the model debris should
  copy: integrated near the player, frozen onto a Kepler rail when far,
  expiry clock, impact test. Already solved; don't solve it twice.
- **`gl.js` `GL.queueMesh(cam, frame, mesh, scale, sunDir, ...)`** — takes an
  arbitrary mesh with a `{pos,right,up,fwd}` frame. Debris shards go through
  this. Note `uploadMesh` caches GPU buffers *on the mesh object*, which
  dictates the shard design below.
- **`missions.js` `bumpStanding`/`standingLabel`** — standing is already
  −100..100 per faction with labels at −40 / −10 / +10 / +40. Combat
  reputation should feed this, not invent a parallel number.

---

## Decisions taken

1. **Slots with capacity.** Typed slots per hull plus a power and mass
   budget, so a bigger shield costs you hold or power.
2. **Fire groups, triggered on the mouse.** Mouse 1 fires the laser group,
   mouse 2 launches the selected missile. (See the aim-mode consequence in
   Phase 3 — this is not free.)
3. **Police hail and demand payment under 1000 cr**, escalating only on
   refusal, flight, or crossing the threshold.
4. **Debris is visual and salvageable.** Shards tumble, and some are worth
   scooping.
5. **Pilot name, ship name and registration are editable** on the F5 page.
6. **Lasers are rated in megawatts**, in three classes × three varieties
   (pulse, intermittent, beam). Catalogue below.
7. **Stock varies by port.** Gear you can only buy in certain places is
   what makes the map worth flying.
8. **A pirate's hold is a pure function of its registration.**
9. **Mining, fuel scooping and grappling** as utility gear — which requires
   asteroids, which do not yet exist.

---

## ✅ Phase 1 — the slot model (`combat.js`, `save.js`) — BUILT

Pure data and logic, no pixels. Everything else leans on it.

**Slot types.** `hardpoint` (guns, launchers, mining rig), `utility`
(scoop, scanner, ECM, heat shield), `internal` (shield gen, hold expansion,
armour, missile rack, fuel). A hull declares its own layout:

```js
talon: { ..., slots: { hardpoint: 2, utility: 2, internal: 3 },
         powerMW: 9.0, fitMass: 14 }
```

**The two budgets, and why both.** Slot count alone says *how many* things
you brought; it does not make you choose *which*. Power and mass are what
create the interesting refusal — the beam laser and the big shield both
fit the slots and cannot both run. Mass folds straight into the existing
`Sim.refreshShip` mass chain, so a heavily fitted ship is genuinely more
sluggish and the liftoff-margin rule in the HULLS comment stays honest.

**The catalogue.** Fold `GUNS`, `TURRETS`, `MODULES`, `MISSILES` into one
`EQUIPMENT` table keyed by id, each entry carrying `slot`, `mass`,
`power`, `price`, `tier`, plus whatever its own behaviour needs. Keep the
old four objects as filtered views so nothing that reads `Combat.GUNS`
breaks on day one.

**API.** `fit(G, id, slotIndex)`, `unfit(G, slotRef)`, `sell(G, slotRef)` at
roughly 45% of list (a refit is a haircut, not an investment),
`fitSummary(ship)` returning used/free power and mass, and
`canFit(ship, id)` returning a *reason string* on failure — "no free
hardpoint", "needs 2.1 MW, 0.8 free" — because a greyed-out button that
won't say why is indistinguishable from a bug.

**Migration.** Old saves carry flat `gun`/`turret`/`shield`/`missiles`.
`migrateFit(ship)` converts them into slots on load, and `save.js`
`snapshot()` grows a `fit` map. This must be written *with* the slot code,
not after.

**Do not bump `save.js` VERSION.** Both `readSlot` and `load` return
`null` on any version mismatch, so a bump does not migrate old saves — it
*deletes* them, which is precisely what the migration exists to prevent.
The change is additive: `fit` is added, the four legacy weapon fields stay
written, and `migrateFit` rebuilds a fit from them when `fit` is absent.
Bump the version only for a change that genuinely cannot be read forward.

**Two existing behaviours to fix while in here:**

- `buyHull` must revalidate the fit against the new hull's slots and
  refuse the sale if the gear won't go — the same shape as the existing
  "hold too small for your cargo" refusal. Silently dropping a 5,600 cr
  turret when you downsize is the worst possible outcome.
- `stripForRespawn` must reset slots to the Talon's starting fit.

**Tests** (`test/combat.test.js`): fit/unfit round-trips, power and mass
refusals, migration from a v-old save blob, `buyHull` refusal, respawn
strip.

### Hull budgets

Derived from the existing `dryMass` so the numbers have a reason. Slots
and power scale with the hull; a Dart is fast and cannot carry a war.

| Hull | Dry mass | Power | Hardpoint | Utility | Internal | Fit mass |
|---|---|---|---|---|---|---|
| Dart Interceptor | 30 t | 7.0 MW | 2 | 1 | 2 | 9 t |
| Talon Courier | 42 t | 9.0 MW | 2 | 2 | 3 | 14 t |
| Kestrel Multirole | 60 t | 14.0 MW | 3 | 2 | 4 | 22 t |
| Mule Freighter | 80 t | 18.0 MW | 2 | 3 | 5 | 30 t |

The Mule has the biggest reactor and the fewest guns for its size, which
is the correct shape for the ship the HULLS comment already calls "worth
robbing."

---

## The weapon retier, and what it replaced

A later design pass revised this plan's original weapon scheme. Both are
recorded because the disagreement is the useful part — the first version
is still what the *numbers* were tuned against, and knowing why they
moved is worth more than only knowing where they landed.

### The conflict that matters: what a tier IS

| | This plan (**built**) | Design notes (**newer**) |
|---|---|---|
| Tiers are | emitter **power** — Class 1/2/3, 1.8–13 MW | **particle** — photon / pion-kaon / muon |
| Differentiated by | delivery vs the shield model (pulse ×0.6, beam ×1.5) | **range falloff** |
| Range | fixed, 9–23 km per item | photon **flat and unlimited**; pion steep falloff; muon holds |
| Top player tier | Class 3, buyable at `warm` standing | muon is **capital / planetary defence only** |

**The sharpest incompatibility is photon range.** Nine catalogue items
currently priced and balanced around a 9–23 km ladder cannot coexist with
"instant, unlimited range, no falloff" — that single property collapses
the ladder, and the notes say as much themselves ("needs a real downside
somewhere or it's just a better gun").

**The merge I would propose, if asked:** the two schemes are more
compatible than they look, because each supplies the axis the other
lacks. Keep the 3 × 3 shape — it is built, tested and sized — but let
**particle type become what the tier means**, and add falloff:

- **Photon** — universal, no falloff, lowest damage. The unlimited range
  is paid for in heat and in damage-at-any-range, not in a range number.
- **Pion / kaon** — hits hardest inside ~10 km, falls off steeply. The
  brawler tier. This is the honest home for what is currently Class 2/3.
- **Muon** — holds damage to long range, capital and planetary defence
  only, as both documents already agree.

Delivery (pulse / intermittent / beam) stays the second axis, so the
count and the shield interaction survive. What changes is that `range`
stops being a hard cutoff and becomes a falloff curve — a real change to
`fireGun`'s damage application, and to nine catalogue entries.

**Decided:** merge as above. Particle becomes the tier, falloff replaces
hard range cutoffs, the 3 × 3 shape and the shield interaction survive.
Old ids stay as aliases so nothing already saved or tested breaks.

**Also decided:** the muon tier *is* eventually reachable by players —
heavily gated, on the largest hulls — rather than capital-only forever.
It keeps a ceiling worth climbing toward and gives Class-3 money
somewhere to go; the capital ship stays distinct through the muon *burst
cannon*, which is a different and much larger weapon than a muon rifle.

### Smaller notes

- **Muon-only-for-capitals is consistent** with this plan's existing muon
  section; it just means the player's ceiling is the pion tier until
  capital hulls exist. Worth being deliberate about, since it lowers the
  top of the player's damage ladder.
- **"13 ship types"** — the imported set is **11** (capital, courier,
  escape_pod, fighter, freighter, h2_freighter, liner, police, shuttle,
  trader, tug). Either two are planned and unbuilt, or the count is off.
- **Combat is only half dice.** The notes describe it as an abstract
  hit-chance placeholder; that is true of `updateNpcFire` (NPCs rolling
  against the player), but the **player's own fire is already a hitscan
  cone test** in `fireGun`. Only the NPC half needs replacing.
- **Turret gating by hull size** is another job for the `-s`/`-m`/`-l`
  distinction, which Phase 11 also wants for crew. Both point the same
  way: make size a real property and the 22 unused models start flying.
  The notes' recommendation — cost it like the shield/reactor tradeoff
  rather than a flat gate — is the same instinct as the power budget, and
  it already has machinery.

---

## Why beams, and why missiles are the only projectile

*Absorbed from `DESIGN-NOTES-WEAPONS-AND-BEACON.md`, now folded into this
file.*

**The method both halves of this section follow:** take a real physical
property seriously and let it hand you the balance number, rather than
picking one by feel. That is already this project's design language — the
mass budget, real reaction-mass cost, the atmosphere modelled as a bucket
against a pipe — and it is why the particle tiers came out as a range
ladder rather than a damage ladder.

Primary weapons are particle beams. At combat ranges they are effectively
instantaneous: no travel time, no leading a shot. Missiles are the only
weapon with flight time. That is a clean split of two different skills:

- **Beams — aim and precision.** Can you hold it on target while both
  ships manoeuvre.
- **Missiles — Newtonian interception.** Can you predict where a burning
  target will be when the seeker arrives.

Concentrating all the prediction skill onto missiles alone is what makes
each weapon *feel* like a different problem rather than a different
number.

**Two consequences that matter for implementation:**

- **Turret AI never needs a firing solution.** With no lead to compute,
  a turret only has to track and hold — cheap, and it means turret
  effectiveness has to come from somewhere else (see the open questions).
- **A beam is a line drawn for one frame**, not a simulated object
  tracked every frame. Reuse the existing render path; do not stand up a
  parallel projectile/VFX system. This is a real constraint on a Latitude
  5420 with integrated graphics, not a stylistic preference.

### Open questions, still open

- **What is photon's downside?** Flat damage at unlimited range needs a
  cost somewhere or it dominates by having none. Current answer is heat
  and low damage-per-shot; that may not be enough, and rate-of-fire or
  capacitor drain are the untried levers.
- **Turret gating by hull size.** S manual-aim only, L can mount one — is
  M a real choice with a real cost, or is a turret purely an L privilege?
  Recommend costing it like the shield/reactor tradeoff that already
  exists rather than a flat size gate, since the machinery is there.
- **Is NPC-vs-NPC beam fire ever simulated**, or is full hitscan fidelity
  player-only? Recommend player-only, for the same reason rails-vs-n-body
  exists: nobody is dodging by feel in a fight nobody is watching. Phase 9
  assumes this.
- **What makes a turret good or bad** once there is no lead solution to
  get right? Transverse speed already degrades the abstract gunnery — does
  that survive into a hitscan model, or does tracking rate become the
  stat?

---

## Weapons: the laser catalogue

Three classes by emitter size, three varieties by how the energy is
delivered. Rated in megawatts drawn, which is what makes the hull power
budget bite.

**The varieties are not a ladder.** They differ in *delivery*, and the
existing shield design already tells us how that should matter.
`combat.js` says the energy shield is a **bucket** that "shrugs off a laser
hit, which delivers its whole load in an instant," and is useless against
a load that never stops arriving. So:

| Variety | vs shield | vs hull | Character |
|---|---|---|---|
| Pulse | ×0.6 | ×1.2 | Discrete bolts. The bucket soaks them. Cheap, cool, short. |
| Intermittent | ×1.0 | ×1.0 | Burst. The honest middle. |
| Beam | ×1.5 | ×0.7 | Continuous — the load never stops arriving, so it *drains* a shield instead of being absorbed. Runs hot. |

That is the loadout decision, and it is exactly what fire groups are for:
carry a beam to strip the shield and a pulse to open the hull, and switch
between them mid-fight.

### The nine

Damage is per shot; DPS is sustained. A beam is modelled as a very short
cooldown with a small per-tick figure, which the existing hitscan code
handles with no change.

**Class 1 — light emitters** (fit anything)

| Weapon | Draw | Dmg | Cooldown | DPS | Range | Heat/s | Price |
|---|---|---|---|---|---|---|---|
| C1 Pulse | 1.8 MW | 5 | 0.40 s | 12.5 | 9 km | 2 | 900 |
| C1 Intermittent | 2.4 MW | 13 | 1.00 s | 13.0 | 12 km | 4 | 1,700 |
| C1 Beam | 3.0 MW | 2 | 0.12 s | 16.7 | 15 km | 12 | 3,100 |

**Class 2 — medium**

| Weapon | Draw | Dmg | Cooldown | DPS | Range | Heat/s | Price |
|---|---|---|---|---|---|---|---|
| C2 Pulse | 4.2 MW | 11 | 0.40 s | 27.5 | 11 km | 5 | 3,400 |
| C2 Intermittent | 5.2 MW | 30 | 1.00 s | 30.0 | 15 km | 9 | 6,200 |
| C2 Beam | 6.5 MW | 4.5 | 0.12 s | 37.5 | 19 km | 26 | 9,800 |

**Class 3 — heavy** (shipyard-economy ports only)

| Weapon | Draw | Dmg | Cooldown | DPS | Range | Heat/s | Price |
|---|---|---|---|---|---|---|---|
| C3 Pulse | 9.0 MW | 24 | 0.40 s | 60.0 | 13 km | 11 | 14,000 |
| C3 Intermittent | 11.0 MW | 62 | 1.00 s | 62.0 | 18 km | 18 | 24,000 |
| C3 Beam | 13.0 MW | 9 | 0.16 s | 56.3 | 23 km | 45 | 38,000 |

The old `pulse` (6 dmg / 12 km / 0.5 s) and `beam` (15 / 20 / 0.85) map
onto C1 Pulse and C2 Intermittent respectively; migrate saves that way.

### Beam heat, against the real numbers

`sim.js` gives the scale: `HEAT_LIMIT = 100` is where the hull starts
cooking, `HEAT_DAMAGE = 0.025` hull points per second per unit of
overshoot, and `BASE_HEAT_SHED = 18` units/s is what a bare hull radiates.
So:

- **C1 beam (12/s)** — under the bare shed. Free. Fire it all day.
- **C2 beam (26/s)** — net +8/s on a bare hull. Roughly 12 s of continuous
  fire before it starts hurting. You learn to pulse the trigger.
- **C3 beam (45/s)** — net +27/s. Under 4 seconds. Effectively unusable
  sustained without cooling.

And the payoff: **the ablative heat shield (sheds 130/s) covers all of
them completely.** That turns it from a re-entry tax into genuine combat
gear, and makes the internal slot a real fight — heat shield, bigger
shield generator, or more hold. It also means a heavy beam build has a
prerequisite, which is what a 38,000 cr gun should have.

Two calibration notes for when this lands:

- **NPC hull points will need a pass upward.** A C3 build kills an 80-point
  pirate in under two seconds. Either the heavy classes stay rare and
  expensive enough that this is a late-career power fantasy, or
  `NPC_HULL` rises to meet it. Decide by playing it, not on paper.
- **Beam damage should be applied per tick, not per "shot"**, so the
  fractional values above accumulate correctly against shields.

---

## Availability: who will sell you what

Two axes, and they pull against each other. Both are **already generated**
— no new scale to keep in sync:

- `sys.development` (0–1), which `generate.js` calls in as many words
  "this game's tech level under another name." Per-port granularity comes
  free from `port.market.dev`, so a core world's main station and a mining
  outpost in the same system stock differently.
- `sys.crimeScore` (0–100), the number the contraband and scan code
  already reads.

**Development gates power. Standing gates access. Crime opens a back
door.**

### The certified market — advanced, and choosy

A developed port has the good stuff and will not sell it to a stranger.
Thresholds map onto the existing `standingLabel` bands so the mission
screen already teaches the player to read them:

| Grade | Needs dev | Needs standing | |
|---|---|---|---|
| Class 1 | any | any | anyone will sell you a light emitter |
| Class 2 | ≥ 0.45 | ≥ 0 (not `cold`) | |
| Class 3 | ≥ 0.70 | ≥ 10 (`warm`) | |
| Capital-grade | ≥ 0.85 | ≥ 40 (`ALLIED`) | see below |

Plus the obvious: **a lawful port will not sell weapons to someone it
wants.** `wantedHere(G, port.faction)` already gates docking; it should
gate the weapon counter too. Being wanted in developed space should mean
being cut off from developed space's arsenal.

### ✅ The grey market — armed, cheap, and incurious — BUILT

A corrupt port sells to anyone, asks nothing, and what it has is junk. No
standing check, no wanted check — this is where a fugitive rearms, and
that is the point.

**The gate is `sys.corruption ≥ 60`, not `crimeScore ≥ 60`, and that is a
correction rather than a tuning change.** A grey market is a *market*: it
needs a supply chain, a shopfront and somebody whose job it is to have
three of a thing in the back. Permissivity is high in an Anarchy for the
opposite reason to why it is high in a Patronage state — one has bought
its police, the other has none — and only the first of those has anything
to sell you.

Measured on seed `kawartha`, and the two numbers are the whole argument:

| Gate | Systems | Ports | Anarchies caught |
|---|---|---|---|
| `crimeScore ≥ 60` (as designed) | 29 (19%) | 380 (20%) | **all 5** |
| `corruption ≥ 60` (as built) | 49 (33%) | 617 (33%) | **0** |

The wider net is also the more discriminating one, because it is finally
asking the right question. A third of ports is right for the place a
fugitive rearms: cut off from developed space, you still have to be able
to *find* one. 239 of those ports are in Syndicate holds, so the syndicate
is a major supplier without being the only one.

| Item | Character | Price |
|---|---|---|
| **Bootleg intermittent laser** | Full 13 points, **2.0× the heat**, 6% failure to cycle, a hair short on reach. | 1,105 cr (65% of list) |
| **Salvaged pion accelerator** | Full 20 points close in, **2.2× the heat**, 9% failure to cycle. | 1,870 cr (55% of list) |
| **Bootleg seeker** | 28 points against the Hawk's 42, a crate of 14 against 8, poorer lead. **7.1 cr per point of damage against the Hawk's 10.0.** | 200 cr |

**The rule that kept this catalogue empty for so long**, now satisfied: a
drawback must be a *tradeoff, not a smaller number*. A gun that costs 65%
as much and does 65% as much is not a decision, it is a longer route to
the same place. So the grey guns keep their damage, their cooldown and
nearly their reach, and what they cost you is **heat and certainty** —
both things the player can already fly around. A weapon at twice the
thermal load is real in the hands of someone who paces their bursts and a
liability in the hands of someone who holds the trigger, which makes
buying one a statement about how you fly.

**The misfire is a live die roll, not a hash, and that is deliberate.**
The seeded-generation doctrine governs what the *world* is — a pirate's
hold, a system's government, where a vineyard grows. It does not govern
whether a bad capacitor holds this particular time. The cooldown is set
before the test and the heat is spent anyway: the capacitor charged,
dumped into the housing, and no light came out. You lose the shot and the
second you were going to fire it in, which is the right punishment and
stops "it misfired" from being a free pause in an overheating fight.

### Bootleg ordnance cooks off on the rail

The signature failure of grey-market missiles, and the reason anyone pays
420 cr for a certified Hawk. But a flat "5% chance to lose 40 hull on
launch" is a slot machine — the player cannot fly differently in response,
so it is a tax with a die roll attached. Three things make it a mechanic:

**1. It hangs before it detonates.** The motor lights and the seeker fails
to separate. Alarm, an unmistakable message — `SEEKER HUNG — JETTISON
RACK` — and roughly **2 seconds** to dump the rack. Jettison and you lose
the remaining missiles and keep the ship. Do nothing and it cooks off.
That is the difference between a punishment and a moment you get to play.

**2. ~~It takes the hardpoint, not a slab of hull.~~ CHANGED IN BUILDING,
and the reason is worth keeping.** The original had the cook-off destroy
the hardpoint the rack sat in, so you gambled a fitting against the
missiles. **There is no missile hardpoint in this game** — `ship.missiles`
is a bare counter on its own trigger — so there was nothing in that slot
to lose, which made "jettison the rack" strictly better than doing nothing
every single time. A choice with a dominant option is not a choice.

So **the hung seeker stays a live round.** Dump the rack and you lose what
is left, for certain, and take nothing. Ride it out and the hang may clear
— you keep the crate *and* the shot — or it cooks off and takes the rack
and a piece of the hull with it (7 points per remaining round, floor 18).
The odds of clearing are the same heat you are already looking at, rolled
**at the moment of resolution rather than at the hang**, so cutting your
burn during those two seconds is a real thing you can do about it. That
turns the heat gauge from a warning light into a risk meter, and the stake
scales with the rack: gambling with two rounds is cheap and gambling with
twelve is a run-ender.

**3. The odds respond to heat.** Unstable propellant is unstable *when
hot*. Failure chance scales with `ship.heat`:

| Hull heat | Failure chance per launch |
|---|---|
| Cold (< 30) | ~2% |
| Warm (30–70) | ~4% |
| Hot (> 70) | ~8% |

So it is not a blind roll — it is a consequence of how you have been
flying. It gives the beam-heat system a third thing to bite on, and hands
the heat shield yet another reason to occupy an internal slot. A player
who holds down a C3 beam and then reaches for bootleg seekers has made a
choice, and the game is entitled to answer it.

**The batch is hashed, not rolled per shot.** Same doctrine as the pirate
holds: a crate carries a hidden quality derived from
`hashString('batch|' + port.id + '|' + purchaseSeq)`, so some crates are
simply clean and some are bad. Firing a few is how you find out; paying a
port for an inspection is the other way. That converts raw randomness into
**information the player can go and acquire**, which is a far better thing
to have in a game about flying somewhere to find something out.

**Two supporting details:**

- **Never hidden.** The yard and the F5 fitted list must show bootleg
  ordnance as `UNCERTIFIED` in amber. A mechanic the player cannot see
  coming is indistinguishable from a bug — the same principle as
  `canFit()` returning a reason.
- **✅ NPCs fly it too — BUILT, on a different trigger, and the difference
  is the interesting part.** NPCs never launch missiles, so there is no
  launch for a seeker to hang on; their version could not copy the
  player's. It triggers instead on the thing that was always the real
  driver: unstable propellant is unstable WHEN HOT, and a hull carrying a
  cheap crate that gets hot enough does not need a launch to set it off.

  **Which means the player can now do something to a pirate other than
  shoot it.** Heat it and let its own ordnance finish the job. `NPC_SHED`
  puts a pirate at **zero bonus over the bare 18/s** — nobody paid for
  radiators on a hull bought to be expendable, the same reason its guns
  came off the grey counter — so it is the hull most likely to cook, and
  that now says something about pirates rather than being a balance knob.

  55% of pirates carry, and the crate quality is hashed off the ship's id
  salted with the system seed, same discipline as `manifestFor`. **The
  cargo is seeded; the ignition is a live roll.**

**The geography this creates** is the whole point: the best gear requires
being *liked* somewhere developed, and being liked is exactly what a
career of piracy costs you. Go outlaw and you can still arm yourself —
just never well. That is the same bargain the crime system already runs
on, extended to the arsenal.

### Implementation

Four fields on each equipment entry, and stock becomes one filter:

```js
minDev: 0.70, minStanding: 10, minCrime: 0, minCorrupt: 0, grey: false
```

`minCorrupt` is the field the grey branch actually reads; `minCrime` kept
its original meaning rather than being quietly redefined, so anything that
genuinely wants permissivity still has it. `stockAt` falls back to
`crimeScore` when a system predates `sys.corruption`.

`stockAt(port, G)` returns the catalogue filtered by all four plus the
wanted check. The yard draws whatever comes back, and shows *why*
something is absent — "CLASS 3 — requires WARM standing with Halden
Combine" reads as a goal; a missing row reads as a bug.

---

## ⚠️ The directed muon burst cannon (capital) — DESIGN ONLY

A capital-ship weapon. **There are no capital hulls yet** — `HULLS` tops
out at the 80 t Mule — so this arrives first as something mounted on
NPC capital ships you encounter, and becomes purchasable only if and when
a capital hull class exists. That is the right order anyway: meeting one
before you can own one is how a weapon earns a reputation.

It needs a `capital` slot type that no current hull declares, so it can
never be fitted to something that should not carry it even if acquired.

| | Draw | Dmg | Cooldown | Range | Pierce | Heat |
|---|---|---|---|---|---|---|
| Muon burst cannon | 40 MW | 180 | 3.5 s | 30 km | 0.85 | enormous |

**It is not a laser and should not use the pulse/intermittent/beam
multipliers.** It fires relativistic muons, which are *penetrating* —
`pierce: 0.85` means 85% of the damage bypasses the shield bucket entirely
and lands on hull. That is what makes a capital weapon frightening rather
than just large: your shield does not help.

**Range is physically motivated.** Muons decay in about 2.2 µs at rest;
relativistic time dilation stretches that a long way but not forever. A
hard range limit on a particle beam is one of the few weapon ranges in
this game that does not need hand-waving.

### The Cherenkov pillar, and why it is a mechanic

Your description is exactly right, and it has a consequence worth
building the whole weapon around. Cherenkov radiation is emitted when a
charged particle exceeds the **phase velocity of light in a medium** — not
c itself. So:

- **In hard vacuum there is no glow at all.** Nothing exceeds c in vacuum,
  the refractive index is 1, and the beam is *invisible*. No tracer, no
  warning, no line back to the shooter. You simply start taking damage.
- **In the thin upper atmosphere above a planet**, the refractive index
  rises just above 1, the threshold drops below the muons' speed, and the
  beam blooms into a thick blue pillar. This is real — atmospheric
  Cherenkov telescopes detect cosmic-ray muons by precisely this light.

So the same weapon is a silent assassin in deep space and a
kilometres-long blue searchlight near a world. Which means:

- **It gives away the shooter.** Firing one in atmosphere paints a line
  from the muzzle to the target across the whole sky.
- **It is witnessed.** `witnessNear()` already answers "was anyone in this
  patch of space." A capital ship firing a muon cannon over a populated
  world should be an *event* — and if the player is ever the one holding
  it, an unmissable crime.
- **The renderer already knows where atmospheres are.** Draw the pillar
  only where the ray passes through one, using the existing atmosphere
  data — brightness scaling with local density, so the beam fades in as it
  descends. Rendered as a screen-space additive quad along the ray, not
  geometry.

The blue is not artistic licence either: Cherenkov light is strongest at
short wavelengths, which is why reactor pools glow that specific blue.
Using the real spectrum costs nothing and looks correct because it is.

---

## Heat, on both sides of the gun — BUILT

The gap that was blocking two features turned out to be one missing field
and no missing physics. `Sim.updateHeating(ship, sys, t, dt)` never once
mentions the player: it asks for `heat`, `heatShed`, `pos`, `vel` and
`hullHp` and does not care whose they are. So this is the move the shield
already made — **one rule with two owners** — rather than a second thermal
model to keep in step.

**Lazy, exactly like `npcShield`.** `heatShed` is undefined until something
actually heats a ship, and the tick skips anything that has never been
heated. A sky full of ships nobody has fired on costs one `undefined` test
each. *What that does not buy:* an NPC that dives into an atmosphere
without having fired will not burn up. Traffic is on rails between ports
and does not go aerobraking, and paying for every hull every frame to
cover it would be the wrong trade.

**`NPC_SHED` is a bonus over the bare 18/s, not a total** — the same slot
the player's heat shield fills. Getting that wrong is easy and silent, so
it is written on the table itself. A **pirate sits at 0**: not a ship with
no cooling, a ship with nothing but its own skin, because nobody paid for
radiators on a hull bought to be expendable. A **navy cutter is +30**,
because it is built around the problem. Those two numbers now say
something about the factions rather than being balance knobs.

### The third axis the delivery model just grew

Player shots deposit heat in what they hit, by delivery:

```js
THERMAL_SHARE = { pulse: 0.35, intermittent: 0.50, beam: 1.00 }
```

`vsShield` and `vsHull` already said what a pulse, a burst and a beam are
good *against*. This says what they leave *behind* — a beam is a sustained
energy dump, a pulse is impulse. So the beam-then-pulse pairing the
delivery model was built to reward has a second reason to exist: the beam
cooks the hull while the pulse opens it.

**And you cannot cook a ship through its bucket.** Heat rides on
`split.hull`, so a shot the shield absorbs deposits nothing at all. That
was not designed; it fell out of routing heat through the existing damage
split, and it is the right answer.

Measured, sustained fire on a pirate (120 hull, 18/s shed, cook-off band
at 78):

| Gun | Reaches 78 heat | Hull left at that point |
|---|---|---|
| Kaon beam accelerator | **1.4 s** | 53 / 120 |
| Muon beam accelerator | **1.7 s** | 51 / 120 |
| Photon beam laser | never — kills first at ~7 s | 0 |
| Photon intermittent | never — kills first | 0 |
| Pion pulse accelerator | never — kills first | 0 |

So **cooking a hull is a heavy-beam tactic and nothing else**, which is a
design outcome rather than an accident: it lands exactly where the
delivery table already said beams belong. The rack does 46 of 120, so it
is a damage bonus and not a shortcut — you still have to finish the job.

### Attribution, which is the line that makes it a crime or not

`heatBy` records who put the heat in. A hull that cooks to death goes
through `killNpc` — bounty, witness, the lot — **only if the player did
it**. A pirate that holds its own trigger too long simply dies, and nobody
is charged. One field, and it is the whole difference between murder and
an industrial accident.

---

## The Syndicate's own arms locker — BUILT

Grew directly out of a correction to the mafia framing: "unless you are
high enough up with the Syndicate, obviously their own enforcement wing
uses the best possible tech they can buy." The grey market answers "what
does a stranger get sold in Syndicate space" — the same damage as the
certified item, at worse heat and a real chance it just does not fire, to
anyone with the price and a corrupt enough port. This is the other half of
that sentence: what the Syndicate's *own people* carry, and what it takes
for a player to be sold the same thing.

**One shared constant, `SYNDICATE_TRUST` (70), used for two facts about
you.** Past it you stop paying witnesses — `INTIMIDATE_STANDING` is now
just this constant under its older name — and their quartermaster sells
you what their enforcement wing flies. Not two coincidentally equal
numbers; one fact (the Syndicate considers you inside) with two
consequences.

**`GUNS.syndbeam`** — a Syndicate-issue muon beam accelerator, same numbers
as the certified `mubeam`, `grey: false` (this is not bootleg — it is the
genuine article, sold by people unbothered by where it came from). What it
costs is not heat or certainty like the grey items, it is **trust rather
than money**: the legitimate path to a muon-tier gun runs through a major
faction's standing (`minStanding: 40`), which is closed in practice to
anyone who has spent a career burning that goodwill. This opens a second
path to the same ceiling through the opposite reputation. `stockAt` gives
it its own gate — `it.syndicate` — checked against `G.standing.outlaw`
specifically and only at a port the Syndicate itself holds, rather than
riding the ordinary `minStanding`-vs-whoever-owns-the-port check every
other item uses; a wanted-by-the-Syndicate player is refused the same as
the certified market refuses one the locals want.

**`SYNDICATE_GUN`** on the NPC side — the enforcement wing's own gun,
built off the same numbers, ~2.9× the flat `NPC_GUN`'s DPS and half again
its range. Selected in `updateNpcFire` for a `kind: 'police'` patrol flying
`faction: 'outlaw'` — the mob's own law, generated by the same police loop
as any legitimate faction's cops, wherever the Syndicate holds ports of its
own — and *not* for a loitering `kind: 'pirate'` raider, which is a
different job under the same flag and stays on the ordinary gun. A player
who meets one of these is being policed by an organisation with better
hardware than the law usually has, not mugged.

Verified in `syndverify.cjs`: standing below 70 lists the item and refuses
it by name; standing 70+ at a Syndicate port sells it; wanted by the
Syndicate refuses regardless of standing; not stocked at all off Syndicate
turf, any standing; low corruption does not unlock it (the gate is
standing, not corruption, unlike the grey market); the enforcement wing's
cooldown reads off `SYNDICATE_GUN`, a legitimate faction's police and a
loitering pirate both still read off `NPC_GUN`.

**Answers half of the casaba howitzer's open sourcing question, below**:
a Syndicate-exclusive item is now a real, tested pattern (turf-gated,
standing-gated, full reliability) rather than a design note. Whether the
howitzer specifically sits in this tier, the certified tier at ALLIED, or
both at different prices is still open — this just built the door.

---

## Corruption: shown, driven, spent, and given teeth — BUILT

Asked as "maybe work on the corruption level mechanism", which turned out
to name four separate gaps once the actual code was checked against it:
`sys.corruption` was rolled once per system at generation and never
touched again, never shown to the player split from violence, gated
exactly two things, and had no player-facing verb at all. All four,
because they turned out to be one design rather than four:

**The baseline stays exactly what it was.** `sys.corruption`
(`buildGovernment`) is still a permanent, deterministic fact about a
system's government — this never writes to it, and nothing here changes
what a fresh system generates with.

**What moved is a SHIFT on top, and it lives on the save, not the
system.** `G.corruptionShift[starId] = { v: points, t: G.t at last touch
}` — additive, undefined-safe, and read back lazily rather than ticked:
`decayedShift` computes `v * 0.5^(age / CORRUPTION_HALFLIFE)` on demand,
the same "costs nothing until touched" discipline `npcShield` and the
heat system already use. Three weeks (`CORRUPTION_HALFLIFE`) to fade by
half, capped at `CORRUPTION_SHIFT_CAP` (65) no matter how much you spend
— the government underneath still shows through.

**Three ways to move it, one of them new:**

1. A witness PAID off — never one merely intimidated, which is fear and
   costs nothing to arrange, see the section above `hushWitness` already
   had — nudges it up `CORRUPTION_BUMP_HUSH` (1.5). You did not set out to
   corrupt the place; you did, one bribe at a time.
2. A customs officer bribed out of a catch (new: `resolveScan` gained a
   branch after contraband is found but before the fine is levied — a
   roll scaled `(corruption − HUSH_MIN_CORRUPTION) / 100`, capped at 0.75,
   distinct from the search-happens-at-all roll that violence already
   governs above it) nudges it `CORRUPTION_BUMP_CUSTOMS` (2.5) and costs
   55% of what the fine would have been, cargo kept, no standing hit.
   Corruption now does something violence cannot: violence explains why
   nobody looks, corruption explains why somebody looked, found it, and
   took a cut instead of writing it up.
3. `bribePort` (new), a deliberate lump sum in the yard screen —
   "BRIBE THE HARBOURMASTER" sits with REPAIR and PAY OFF BOUNTY, above
   the tabs, because it is not equipment either. Priced off the port's own
   development (a richer shopfront costs more to buy into) and discounted
   by how corrupt the place already is (the marginal bribe is always
   cheaper than the first one); moves the shift by `CORRUPTION_BRIBE_AMOUNT`
   (40) in one purchase — most of the way to opening a grey market
   somewhere it currently has none. The row disappears once bribery here
   is maxed out, the same "not stocked at all" treatment the grey market
   itself gives an item below threshold, rather than a permanently greyed
   row.

**Every existing reader switched from the raw fact to the effective
number.** `effectiveCorruption(G, base, starId)` — `starId` defaults to
wherever you currently are, so gameplay checks need not pass one, and the
F2 chart passes the star it is only looking at — replaces the direct
`sys.corruption` reads in `stockAt`'s grey market gate and in
`hushQuote`'s enforceability roll. A bribe that could not open the grey
market or make a bargain enforceable would not be much of a bribe.

**Shown, finally.** The F2 survey panel had exactly one combined number
(`crimeScore`, "X / 100 permissive") and nothing underneath it — the whole
reason the two-axis split existed was so a player could tell "nobody here
will stop you" from "everybody here can be bought" apart, and there was
nowhere to read that. Now it lists violence and EFFECTIVE corruption
separately, each with a qualitative label (`violenceLabel`,
`corruptionLabel` — bands lined up on the thresholds that actually mean
something: `HUSH_MIN_CORRUPTION` and the grey market's 60, not picked for
even spacing), calls out the baseline when a bribe has moved the number
away from it, and flags Syndicate-held territory — folding in a
long-pending note that the chart never marked a waste ban at all.

Verified in `corruptverify.cjs`: decay math against the half-life
directly, the cap, `effectiveCorruption` for the current system versus an
explicit star you have never bribed, a paid witness bumping corruption
while an intimidated one does not (sampled across hashed victims until
each outcome actually occurs, since the stick roll is hashed off the
act), the customs bribe-out rate tracking its formula at three corruption
levels, a failed/unaffordable bribe still losing the cargo, a successful
one keeping it and feeding the shift, `bribeCost` responding correctly to
both development and existing corruption, `bribePort`'s refusals (at cap,
and short of cash) spending nothing, and the grey market actually opening
at a port it was closed at once bribery pushes it over 60.

**Not doing yet.** No failure mode on `bribePort` itself — money always
works, no risk of the bribe attempt itself being reported, which would be
the natural next layer of texture once this one has been played with.
Dumping's own witness-report roll (see the waste ban section) still does
not go through the hush pipeline at all, paid or intimidated — corruption
already governs whether that witness is enforceable in spirit, but the
code path was never connected, and connecting it is a separate, sizeable
piece of work rather than a natural extension of this one.

---

## Time warp only pins to 1x for something actually dangerous — BUILT

The floor existed for a reason — you need to be able to react in real time
to a threat — but `updateEncounters` was applying it to *any* awake patrol
within `CLOSE_RANGE * 4`, including a routine `mode:'inspect'` police scan
that has no player choice the way a pirate's demand has one. The result:
getting scanned and cleared by a cop pinned your warp to 1x anyway, making
it needlessly slow to leave the area afterward even though nothing was
actually happening.

`result` grew a second distance alongside the existing `closest` (nearest
awake contact, any kind): `dangerClosest`, tracked only across contacts
that are genuinely threatening — `spec.hostileToPlayer`, or a `pirate` in
`intercept`/`demand` mode. The hard 1x floor now reads `dangerClosest`
instead of `closest`; the softer 500x cap ("something is nearby, don't get
reckless") still reads `closest`, unchanged. `hostileToPlayer` is the
existing universal "this will shoot you" flag — set exactly at the moment
of genuine danger (a pirate's demand timing out, a wanted player's police
engagement, any transition into an attack mode) and never for a
no-consequence inspection — so nothing that was ever actually dangerous
becomes escapable at high warp under the new logic; only the purely
cosmetic "a patrol happens to be nearby" case gets the relief. The one-shot
HUD warning in `main.js` was updated to match (`dangerClosest < 1000`
instead of `closest < 1000`), so the message itself still only fires for a
real threat.

Verified in `warpverify.cjs` (7 cases, `dtSim=0` to freeze NPC steering so
synthetic positions/modes hold exactly as set): a non-hostile scan gets
only the soft cap; a hostile cop, an intercepting pirate, and a demanding
pirate all still pin to 1x exactly as before; a benign patrol sitting
right on top of you does not mask a genuine threat farther off (`closest`
and `dangerClosest` diverge correctly, and the *danger* distance is what
gates the floor); a threat outside the hard-floor radius only gets the
soft cap; an empty system has no cap at all. One case needed adjusting
mid-write: a "far but dangerous pirate" scenario tripped the pre-existing,
unrelated `policeNearby` rule (any patrol within `POLICE_DETERRENT` of the
*ship* makes every pirate in the system break off, regardless of the
pirate's own range) — correct existing behaviour, not a bug, fixed by
using an already-hostile merc for that case instead.

---

## Remote spectroscopy, and a travel guide's idea of anywhere worth living — BUILT

Two small, related additions to what a system tells you before you have
ever been there.

**Composition, not just count.** The old F2 panel for an unsurveyed star
said, flatly, that spectroscopy gives you the star and nothing else — which
undersold real spectroscopy. Transit photometry gives you planet count for
free, and transmission spectroscopy during that same transit reads
atmospheric composition directly off the starlight — genuinely
remote-observable, unlike a government or a port list, which are not. Every
planet type in `PLANET_TYPES` got a new `ATMO_COMPOSITION` entry (one or two
seeded phrasings each, so a rocky world reliably reads "none — hard vacuum"
and a terran reliably reads "breathable" without every world sounding
identical), and `atmosphereComposition(type, rng)` picks one.

The unsurveyed branch of the F2 panel now calls a new `previewSystem(star)`
helper (mirroring `main.js`'s own `systemFor` exactly — same cache, same
`Gen.generateSystem` call, same options resolution) to get planet count and
per-planet type/composition, shown through the same `rows()` helper the
surveyed branch already uses. Because `generateSystem` is pure and
deterministic, previewing produces byte-identical data to an eventual real
visit, and `previewSystem` never touches `G.visited` — the only thing that
was ever hidden (who lives there, who runs it, how dangerous it is) stays
hidden until somebody actually goes.

The one determinism trap here: composition is decided inside the existing
per-planet loop, which already draws `prng` sequentially for `classify`,
mass, eccentricity, inclination, and — critically — the orbital angles
(`lan`, `argp`, `m0`). Splicing one more draw into that sequence would have
shifted every subsequent angle for every planet after it, silently
reshaping every existing seed's orbits. Fixed by forking a sibling stream,
`flavRng = base.fork('flavor-' + p)`, used only for composition — `prng`'s
sequence is untouched.

**A travel guide's idea of anywhere worth living.** The original Elite's
habit of a one-line flavour blurb per world — an absurd creature, a
travel-guide-voice note on the place — never had an equivalent here.
`Gen.buildFlavor(sys, base)` now runs right after `buildGovernment` (reading
`violence`/`corruption`/`pirateHeld`/`government`, all just decided, and
writing nothing anything downstream reads) and sets `lifeNote` and
`cultureNote` on every **habitable** planet only — the only worlds anyone
would bother writing a travel guide about. `lifeNote` is pure whimsy
(`"Dominant native life: " + adjective + " " + creature + clause`), seeded
and otherwise disconnected from anything else, with two extra clauses that
only enter the pool at high violence or high corruption. `cultureNote` is
not disconnected: it picks from `CULTURE_BUCKETS` — ordered, first-match
rules keyed on `pirateHeld` / violence / corruption / their combination /
neither — and appends a line keyed on the government's `lowTechBias`, so
the prose evokes the same facts the F2 numbers already show rather than
just restating them. This is deliberately the *rumour* you'd have heard
before ever visiting, not the number in different words. The F2 panel
shows up to two habitable worlds' notes, word-wrapped with the existing
`wrapText` helper.

Verified in `flavorverify.cjs`: two full generations of the same seed
produce identical orbital elements *and* identical composition (proving
the sibling-fork fix actually holds); composition is present on every
planet and keyed sensibly to type across 25 systems (every terran
mentions breathable air, every gas giant mentions hydrogen, every rocky
world is vacuum); `buildFlavor` sets flavour text on every habitable
world and on no non-habitable one, across 40 systems; the same world
regenerated twice gives back the identical `lifeNote`/`cultureNote`
(seeded, not re-rolled); and `cultureNote` called directly against
synthetic pirate-held / violent / corrupt / both / quiet system objects
produces a distinct line for each bucket.

**A rumour about the SYSTEM, not any one world in it.** `cultureNote`
covers the government — violence, corruption, who holds the place — and
repeats per habitable world because that's what you'd actually have heard
about each one. It says nothing about what kind of *place* the system
itself is: two systems can have an identical government and still be
completely different — one a two-world garden cluster, the other six gas
giants and a fuel depot. `sys.systemNote` (`Gen.systemNote`) fills that
gap, keyed off `systemProfile(sys)` — planet count, how many are giants,
how many are habitable, how many ports exist — rather than the
violence/corruption axis. `SYSTEM_DESC_BUCKETS` is tried in the same
first-match order as `CULTURE_BUCKETS`: 2+ habitable worlds (rare and
notable, checked first) → exactly 1 habitable world → all-giants with zero
habitable (a miner's system) → 4 planets or fewer (sparse) → 5+ ports
(a busy junction) → the ordinary-system fallback. One per system, set at
the end of `buildFlavor` via `fr.fork('system')` — a sibling of the
per-world `fr.fork('world-'+id)` forks already there, and since `fork()`
is keyed on `(label, seed)` only and never on call order or how many prior
draws were taken, adding it disturbs nothing the per-world loop already
set for any existing seed.

Shown on the F2 panel in both branches: for a surveyed system, it prints
below the existing info rows (worlds/ports/factions/government/etc); for
an unsurveyed one, it prints right under the spectroscopy disclaimer and
above the per-planet scan rows, on the same "word around the dock, not a
sensor return" footing as the per-world culture notes below it — honest to
show pre-visit because it's about the physically-generated bodies, not the
government facts that genuinely do stay hidden until `G.visited`.

Verified in `flavorverify.cjs`: every one of 40 systems gets a
`systemNote`, it varies across systems, and regenerating the same seed
reproduces it exactly while leaving the per-world notes untouched (proving
the new leaf fork really is inert against what already existed); and
`systemNote` called directly against synthetic profiles sharing an
*identical* government but different generated bodies (2-habitable /
1-habitable / all-giants / sparse / heavily-ported / ordinary) produces a
distinct line for each — confirming the bucket logic actually keys off
generated content and not government, which is the entire point of this
being a separate note from `cultureNote`.

---

## Two more weapons, designed not built

Both came out of the same observation: **the gun table is already doing
real physics, and it should keep doing it.** Photon is massless, has no
falloff and the longest reach. Pion has a 26 ns lifetime, so it is
devastating close and nearly nothing at its own maximum range. Muon is the
penetrating one — the particle that actually reaches underground detectors
— and the only tier that keeps its damage at distance. Each weapon's
falloff curve *is* that particle's behaviour. Anything added to the table
has to earn its place the same way.

### The glueball projector — a colour-neutral gun

A gluon *beam* is impossible, and interestingly so: gluons are
colour-confined, and pulling colour charge apart makes new quark-antiquark
pairs out of the vacuum rather than letting a free gluon out. What
confinement *does* let out is a **colour singlet** — which is why free
pions exist at all, and why there has been a pion accelerator in this game
since before anyone asked the question.

The exotic colour singlet is a **glueball**: bound gluons, no valence
quarks, net colour zero. Predicted by QCD, still not cleanly identified
because it mixes with ordinary mesons. Since every tier here is named for
a particle, it names itself.

**What it is for.** Neutral colour charge and neutral electric charge
means no EM coupling, which means **a shield has nothing to grab**. In the
`splitDamage` model that is a `vsShield` near zero: the bucket does not
spend the shot, so it carries to the hull. Not "strips shields fast" like
the kaon beam — *ignores that the shield is there*. Nothing else in the
table does that, and it makes the weapon an **answer to a problem** rather
than a rung on a damage ladder. Fire groups were built to reward carrying
two kinds of gun; this is a third option — do not strip at all.

**What it costs, and it falls out of the same property.** Everything else
in that table is a laser or an *accelerator*: light, or charged particles
bent by magnets. **You cannot steer a neutral particle.** No focusing, no
collimation — a wide cone, poor accuracy, modest damage per hit, short
reach. A shotgun made of nuclear binding energy.

**Rejected along the way, and worth recording.** An earlier version had
the string tension give it *inverted* falloff — stronger with range, then
a hard snap. `damageAtRange` would take it for free (a negative constant
in `PARTICLE`, and `dist > gun.range` already returns zero). It was
dropped because it contradicts the fix: once the projectile is colour
neutral it propagates freely, so there is no string pulling on it in
flight, and the honest curve for a heavy unstable neutral is a *steep*
falloff — which is the pion's niche already. The physics fix and the
backwards curve cannot both be had.

**Cost to build:** one entry in `PARTICLE`, one in `LASER_DELIVERY`, and
splitting `AIM_CONE` (currently a single shared constant at 0.035 rad) so
a gun can carry its own. Perhaps fifteen lines.

### The casaba howitzer — ordnance, and a heat weapon

Real, documented, out of the Project Orion work at General Atomics, and
named after a melon. A **directed thermonuclear blast**: the device goes
off, X-rays flood a beryllium-oxide channel filler, that plasma slams a
tungsten plate, and the yield leaves as a jet a couple of degrees wide
instead of a sphere. Fission-primed fusion specifically, because the
harder radiation couples better to the ablation. (Performance figures in
circulation are mostly extrapolation; the concept is well attested.)

The analogy to a conventional shaped charge actively misleads. A Munroe
charge is *mechanical* — explosive collapsing a liner. A nuclear one has
no time for that; the transport is radiative, and **the thing being shaped
is the blast itself**. The tungsten is a working fluid, not shrapnel.

**Why it belongs in the ordnance table rather than the gun table.** That
table has one entry in it. The casaba is the Hawk's opposite on every
axis: expensive, racked one, unguided, and not aimed at a target at all —
**aimed at a direction**.

**Three things it brings that nothing else has:**

1. **A minimum range.** Every weapon in the game has a maximum and argues
   about the curve on the way there. Nothing has a floor. A device you
   cannot fire inside your own blast radius is useless in a knife fight —
   the precise inverse of the pion accelerator, and two weapons that
   cannot cover for each other is a better tension than another rung.
2. **The cone, and therefore friendly fire.** `killTender` is 14,000, the
   highest bounty in the game, above a note saying the tender's only
   defence is that everyone agrees not to. A casaba that clips one you did
   not check for is the most expensive keypress in Manifest — and there is
   now a witness eight seconds from transmitting and a price on their
   silence.
3. **It is a heat weapon.** A directed thermonuclear blast does not punch
   a hole through `splitDamage`; it *cooks*. The heat model is already
   complete — `HEAT_LIMIT` 100, `BASE_HEAT_SHED` 18/s bare, damage
   accruing past the limit in `sim.js`, and `addHeat` as a single funnel so
   a live sink automatically takes its cut. Counterplay is a heat sink
   burned at exactly the right second, which turns sinks and heat shields
   from re-entry gear and self-inflicted-gun management into **combat
   equipment**.

**~~Blocked on NPC heat.~~ UNBLOCKED.** NPCs now carry `heat`, a per-class
shed rate and the same past-limit damage rule, through the same
`Sim.updateHeating` the player runs. A thermal weapon will work on both
sides of the gun the day it is written.

**Delivery shape.** A directed blast is effectively instantaneous at
combat ranges — nothing to dodge, nothing to shoot down — so the flight
time lives in the *carrier*: a dumb round that flies out and detonates
when you say. `MISSILES` already carries a `fuse` field. You are not
aiming a weapon, you are placing a device and choosing the moment, and the
minimum range stops being a rule and becomes the consequence of being able
to trigger it whenever you like, including too early.

**Two open questions, one now narrower.** Whether detonating one in an
inhabited system should be **its own crime above `killNavy` (12,000)
regardless of whether it hit anything** — setting off a nuke in somebody's
sky is not a thing that goes unremarked because you missed, and it would
be the first offence in the game committed by *firing* rather than by
connecting, is still fully open. Where it is sold is half-answered: "The
Syndicate's own arms locker" above built exactly this pattern — a
turf-gated, standing-gated, full-reliability tier, keyed off
`SYNDICATE_TRUST` — for `syndbeam`. Whether the howitzer belongs there, at
a naval yard for ALLIED at a different price, or both, is still a decision
rather than a fact about the code.

The catalogue name stays "Casaba howitzer" verbatim. Reality already did
the joke and the table's register is deadpan enough to carry it.

---

## ✅ Phase 2 — the F5 page: identity and the yard (`screens.js`) — BUILT

Both live on the same page, so build them in one pass.

**Identity.** Pilot name, ship name, registration. Registration today is
`Sim.regCode(seed + '|player')` — *derived*, never stored — so making it
editable means it must join `save.js`. Suggested shape:

- Pilot name: free text, 24 chars.
- Ship name: free text, 24 chars. Shows in comms, on the hull viewer, and
  in anything a witness says about you.
- Registration: constrained to the existing `LL-NNNN` grammar (no I/O/Q,
  which `regCode` already avoids because they read as digits). Offer a
  **reroll** button that pulls the next seeded code, and a **type it
  yourself** field validated against the grammar. Rerolling is the safe
  default path; typing is for people who want `KA-7777`.

**The missing primitive.** There is no text entry anywhere in this game —
every screen is keys and hotspots. This needs a small focused input widget
in `screens.js`: caret, backspace, character filter, Enter to commit, Esc
to cancel. Critically, **while a field has focus it must swallow every
keystroke**, or naming your ship "Wanderer" will fire the guns, jettison
waste and open the star map. The `modeKey()` return-true convention is
already the mechanism for this; use it.

Changing registration mid-career is a fiction question as much as a UI one.
Recommendation: free while docked, and it costs a few hundred credits —
repainting a hull number is exactly the sort of thing a yard charges for,
and a price stops it being a thing you fiddle with every dock.

**The yard rewrite.** Replace the flat button row with:

- A **slot grid** — one row per slot, showing what's in it, its mass and
  draw, with SELL on the fitted ones.
- A **budget bar** — `Power 6.2 / 9.0 MW · Mass 11 / 14 t`, live as you
  hover a purchase, so the tradeoff is visible before you commit.
- A **catalogue** filtered to what this port stocks. Stock should follow
  the port: a `shipyard` economy carries hulls and heavy internals, a
  frontier outpost carries a pulse laser and nothing else. `economy.js`
  already has the port-type vocabulary to key off. This is what makes the
  map worth flying — gear you can only get somewhere.

---

## ✅ Phase 3 — weapons in the control scheme (`main.js`) — BUILT

*Built as described below, with two deviations, both taken deliberately.*

**Deviation 1: two triggers, not one trigger and a cycle key.** The plan
left "switch between them mid-fight" unspecified. It is now mouse 1 for
group A and mouse 2 for group B, with the missile moving to the middle
button — because the whole point is switching mid-burst, and a mode whose
state you have to remember is a mode you will get wrong while somebody is
shooting at you. Both can be held at once, which is what makes the
beam-then-pulse loadout actually playable rather than merely purchasable.

**Deviation 2: `Shift`+`Space` is the keyboard's second trigger.** Every
letter was spoken for long before weapons wanted one, so the second trigger
is a modifier on the first — the same split the codebase already uses for
G (grid / gear), T (dock / match) and / (mode / assist).

**Also built:** cooldowns became per-slot rather than per-ship (sharing one
would have made a second gun in a group do nothing at all); group
assignment lives on the F5 FIT page as its own row per gun, so the control
that moves a 38,000 cr laser between triggers is never the same control
that sells it; `groups` is additive in the save and a missing entry reads
as group A, so an old career loads firing everything on the primary.

**The conflict, stated plainly.** In the cockpit, left-drag currently turns
your head (or aims, with F9 mouse-aim on). Mouse 1 cannot both fire and
look.

**The resolution:** make mouse weapons part of mouse-aim mode.

- **Mouse-aim ON (F9):** the mouse aims *without a held button* — drop the
  `if (!dragging) return` guard for this mode. Mouse 1 fires the laser
  group, mouse 2 launches the selected missile. This is the combat mode.
- **Mouse-aim OFF:** unchanged. Left-drag looks around, and Space / B stay
  as the keyboard triggers.

Space and B keep working in both modes regardless — someone flying on a
laptop trackpad still needs to shoot, and Space is already the interdiction
trigger in the corridor, which must not change.

**Also required:**

- `preventDefault` on `contextmenu` over the canvas, or mouse 2 opens the
  browser menu mid-fight.
- Mousedown must still check `overHot()` and `G.cursor.active` first — a
  click landing on an MFD button must never also fire.
- No firing while `docked`, `landed`, in `G.hyper`, or with a modal open.

**Fire groups.** With multiple hardpoints, `fireGun` becomes
`fireGroup(sys, G, t, 'lasers')` — iterate the fitted hardpoints in that
group, each with its own cooldown, drawing one beam per weapon. Missiles
get a *selected type* (there's one now; there will be more), cycled with a
key. Group assignment lives in the yard, not in a menu mid-flight.

**`FLIGHT-CARD.md` must be updated in the same commit.** The in-game help
(`main.js` ~7815, "F5 while docked") too.

---

## Shields, on both sides of the gun — WRITTEN, UNRUN

⚠️ **Nothing in this section has been executed.** It was written in a session
where Desktop Commander would not connect, so the suites could not be run and
neither could `node --check`. The tests below the code were written at the
same time and are equally unrun. Treat every number here as intended rather
than as measured, except the two marked as measured, which came from a probe
run earlier in the same session while the shell was still connected.

### The find that made this bigger than an animation

The request was for a bloom on the hull and an absorbing shield bubble. The
first thing the work turned up is that **`vsShield` and `vsHull` have been on
every gun in the catalogue since the particle retier and nothing has ever
read them.** There was exactly one shield in the game, it belonged to the
player, and the player's own guns never hit it — so the pulse-soaks /
beam-drains interaction that this document spends a page arguing for has been
inert the whole time, along with the entire argument for carrying two kinds
of gun.

Giving NPCs shields is what switches it on, and that matters more than the
effect that asked for it.

**Measured, before the shell went down** — a naval cutter, 90 shield over 260
hull, hit with a flat 20-point shot so only the delivery differs:

| | shots to kill |
|---|---|
| beam alone | 22 |
| pulse alone | 19 |
| intermittent alone | 18 |
| **beam, then pulse** | **14** |

Twenty-two per cent better than the best single weapon, and the first time in
this project that a second hardpoint has been worth anything. Fire groups were
built for exactly this and have had nothing to reward until now.

### Who carries one

Per class, in the same voice as `NPC_HULL`. A generator is 4,800 credits, two
megawatts and four tonnes, so warships and money have them and working hulls
would rather have the tonnage.

| | shield | |
|---|---|---|
| shuttle | 0 / 0 / 15 | per size letter — only the large variant has the room |
| escape pod | 0 | never, at any size |
| freighter, tanker, hauler | 0 | a working hull would rather have the four tonnes |
| pirate | 20 | grey-market kit on a hull one bad week from scrap |
| tender | 25 | unarmed, and built to survive somebody else's fight |
| police | 30 | |
| merc | 40 | this is what you are paying for |
| liner | 45 | insured, and full of people |
| navy | 90 | you do not crack one of these with a photon |

**Size is a real property and it already existed.** Every imported hull comes
as `-s`, `-m` and `-l` — thirteen families, thirty-nine models — and
`Render.HULL_ASSIGN` says which one a class flies. So the rule reads through
that table rather than off a hardcoded number, which means
`Render.assignHull('shuttle', 'shuttle-l')` moves the shield with the model,
as it should. An earlier attempt gated on `spec.size` in kilometres instead;
that was replaced because it would have zeroed a large shuttle too, and
because the letter is what the assets actually carry.

### What a hit looks like

Three effects, and the point of having three is that **which one you see tells
you whether the shield is holding**, from any distance and without reading a
number.

- **The shell.** The hull's own mesh inflated along its vertex normals by
  0.12 of a hull length — about 1.2 m on a ten-metre courier, which is a
  medium drive bell's width and the standoff the request asked for. Not a
  sphere: a field projected from a hull has that hull's silhouette, which is
  the one thing this renderer's mesh design says survives at combat range.
  Memoised per kind, for the same reason the shard pool is fixed — `gl.js`
  caches GPU buffers on the mesh object.
- **The flare, and the dissipation, in one curve.** A bump centred on the
  impact whose *width grows* toward the whole shell while its *height decays*.
  Early it is a hard bright point, halfway a spreading glow, at the end a
  faint even wash over everything, then nothing. Spot, spread, dissipate — no
  ring to tune, no per-vertex state, and exact at any `t`, which is the same
  property the rails and the market have and for the same reason.
- **The bloom.** A hot sphere on the plating where a shot got through.
  Deliberately a different *shape* from the shell flare rather than a
  different colour: the flare spreads across a surface, the bloom sits on
  one. A shot that punches through a failing shield produces both at once,
  which is exactly what that moment is.

**The hue is the gauge.** The field runs cold blue-white when it is holding,
through amber, to hot red when it is nearly down — cool-to-hot being the same
language the hull-temperature bar, the re-entry glow and the drive plume
already speak, so it needs no explaining the first time you see it.

**And you can see your own, from the seat.** You cannot see your own hull from
the cockpit, so the whole feature would have been invisible in ordinary play.
A soaked hit now blooms on the inside of the canopy *in the direction it came
from* — which makes it a warning as well as an effect, because the direction
is where the shooter is. A hit from behind, which `projectDir` cannot answer,
pins to the correct edge of the view; dead astern goes to the bottom, because
that is where you would flinch.

### Two bugs caught by reading, not by playing

Both were found reviewing the code with no way to run it, and both are the
kind that hide:

- **A zero-damage shot divided by zero.** `damageAtRange` takes a pion to
  nearly nothing at the edge of its envelope, and `splitDamage` computed
  `soaked / offered` with both at zero. A `NaN` written into `shieldHp` is a
  ship that can never be hurt again and a shield bar that reads blank
  forever. Nobody notices the shot that did nothing until every shot after it
  does nothing too.
- **The flare ran on the wrong clock.** Impacts were stamped in *sim* seconds
  and the flash life is in *real* seconds, so at 500× warp a half-second
  animation would have been over inside one frame. This file already had the
  rule written down — `nowSeconds()`'s own comment says anything that
  "blinks, flashes or pulses because it is a physical light" belongs on the
  wall clock — and there was already a helper for it, so the fix was to use
  the one that existed rather than add a second one to pick wrong.

`spec.lastHitAt` stays on sim time on purpose, because what it gates is the
shield's regeneration delay, which is a delay in the world rather than in the
eye. Two clocks, two jobs.

### Still owed

- [ ] **Run it.** Ten suites, `node --check`, `lint-globals`.
- [ ] **Cost the shell pass.** It is three transforms and three projections
      per face, and an imported hull carries far more triangles than the
      procedural ones. There is a `SHELL_MIN_PX` gate at 16 px with a
      one-fill fallback below it, but the number was chosen rather than
      measured and the per-face cost has not been put against the ~25 ms
      predictor budget the way the debris field was.
- [ ] **Look at it.** The alphas — 0.055 for the resting rim, 0.50 for the
      flare — are guesses. Tests cannot say whether a field reads as a field.

---

## ✅ Phase 4 — death, debris, salvage — BUILT

*Built as designed below, with the shard pool in `render.js`, the physics in
`sim.js`, the spawn in `killNpc`, and the drawing and scoop in `main.js`.
Four things worth recording — three where the design's own argument decided
it, and one that was measured:*

- **In `sys.canisters`, not beside it.** The plan proposed routing only
  *salvage* shards through the canister list. Building it that way needs a
  second list for the visual shards anyway, and then a second collision test,
  a second scoop and a second expiry sweep — four chances to forget one. So
  the whole field goes in the same array with `kind: 'debris'` and the
  handful of places that care branch once. A shard with a `cid` is simply a
  canister shaped like a piece of a ship.
- **The physics is a different path, deliberately.** No `stepShip`, no
  substepping, no terrain impact, no Kepler rail — out of the wake radius a
  shard is *gone*, not asleep. And **one dominant body, resolved at spawn and
  never again**: a shard covers a few kilometres in its ninety-second life,
  so whatever dominated where it died still dominates where it dies.
- **Costed, not asserted.** A full 96-shard field runs `updateCanisters` in
  **0.0143 ms/frame** — about one and a half `Sim.acceleration` calls, on a
  frame that already spends ~25 ms in the predictor. The dominant-body
  shortcut is what buys that; resolving one per shard per frame would have
  made it ninety-six of them. One whole wreck costs 0.0168 ms to spawn, once.
- **Nothing is created and nothing is counted twice.** Three lines of the
  hold go out as intact crates and the rest of the manifest is aboard when
  the ship breaks up, so it comes off as salvage on the shards. A ship robbed
  empty first still breaks up and has nothing on it worth taking — one hold,
  two ways out of it.

Two consequences that fell out rather than being designed: an emptied salvage
shard keeps drifting and keeps being drawn, because it is still a piece of a
ship and only its `cid` is cleared (which is also what stops it being scooped
twice); and the radar draws scrap as a dim grey dot and salvage as the same
amber cross a crate gets, because what the radar is for here is telling you
which of the sixteen pieces of that freighter is worth flying to.

**Still owed: somebody has to look at it.** `render.test.js` proves a debris
field survives being drawn in both views, with salvage in it, at both the
model and the too-small-for-a-model sizes. It cannot prove it reads as a ship
coming apart.

### The design, as written



**Shard meshes: a fixed pool, built once.** `gl.js` caches GPU buffers on
the mesh object (`mesh._gl`). Generating a unique mesh per shard would
upload a new VAO per shard and never free it — a GPU leak that grows with
every kill. So: build **6–8 shard meshes once** at startup from the seeded
RNG (irregular low-poly wedges, hull-plate colours), and instance them with
different scales, spins and tints. Same reason `SHIP_MESHES` is memoised.

**Spawning.** `killNpc` already pushes an explosion and drops the manifest.
Add: 8–14 shards, velocity = ship velocity plus a radial kick scaled to
hull size, random tumble axis and rate. Count should scale with `spec.size`
and be **capped globally** — a running total across the system, oldest
recycled first.

**Simulation — the frame-budget constraint.** The predictor already costs
~25 ms on the Latitude, and that is the machine this ships on. Debris must
not go through `stepShip`. Ballistic integration plus the dominant body's
gravity is plenty; shards live seconds, not days. Reuse the
`updateCanisters` near/far structure but with a much shorter life
(~90 s of game time) and **no Kepler rail at all** — anything that far
away should simply be gone.

**Despawn** on any of: age expiry, leaving the wake radius, system jump.
The user asked for despawn-on-leaving-the-area, and the wake radius is
already the game's definition of "the area."

**Salvage.** A fraction of shards (say 2–4 per kill) carry a `salvage`
payload — scrap alloy, or components if the victim was a tech hauler.
Scoopable through the existing canister scoop path, which means the
scanner, the scoop and the hold accounting all work for free. This is the
argument for routing salvage shards through `sys.canisters` with a
`kind: 'debris'` flag rather than a separate list: one collision path, one
scoop, one expiry.

**Seed discipline.** Debris should use the seeded RNG keyed on the
victim's id, so a replayed kill throws the same shards — never
`Math.random()`.

### ✅ A pirate's hold is a function of its registration — BUILT

*Pulled forward out of Phase 4 and built as described, because it was a
live doctrine violation sitting in the tree rather than a feature waiting
its turn. `manifestFor(sys, spec)` hashes `'hold|sys.seed|spec.id'` —
`sys.seed`, not `sys.id`, which does not exist — biased to `sys.traffic`'s
commodities and memoised onto the spec. `holdOf(sys, spec)` is the single
read point, so `killNpc` and `demandFrom` cannot disagree. The canister
scatter direction and the cash a robbed ship hands over are hashed the same
way, so neither can be rerolled by reloading.*

*The corridor-id worry below was checked and is fine: drop-out ids are
`'drop-' + ` a slipspace contact id, and those come from
`new RNG('galaxy-lane|…')` and `'corridor-hunt|…|window'` — both seeded, so
they hash stably across loads.*

`killNpc` currently invents a pirate's cargo with bare `Math.random()` at
the moment of death. Replace it with a hash of the ship's own id — the
same trick `regCode` already uses, whose comment is the whole argument:
the same ship reads the same code forever "without a byte of stored
state."

```js
manifestFor(sys, spec)  →  hashString('hold|' + sys.id + '|' + spec.id)
```

**Salt with the system id.** `buildPatrols` numbers its specs `n0, n1,
n2…` *per system*, so without the salt every system's `n3` carries
identical cargo.

**Derive at first read, not at death.** Today, robbing a pirate alive
(`demandFrom`) and killing it can disagree about what it was carrying,
because only one path invents a manifest. One memoised `manifestFor(spec)`
makes robbery, death, and any future cargo scanner all read the same hold.

**Derive once, then own it.** The instant the player takes cargo off a
ship, the pure function stops being the truth and the manifest becomes
stored state on the spec. Exactly the lazy pattern `npcHull()` already
uses for hull points: compute on demand, then keep.

**Bias to local trade.** A pirate's hold is stolen goods, so the hash
should pick from what actually flies in *this* system — `economy.js` knows
the local routes — rather than a global list. Then loot tells you
something true about where you are: a system running medicine has pirates
full of medicine. Traders keep their route-derived manifests, which are
better grounded still; the hash only fills in for ships that have no
route (pirates, mercs, anything lifted empty).

**The payoff beyond determinism.** Registration stops being decoration —
the reg *is* the index into the hold, so a cargo scanner reading a hull
number is diegetically coherent, and becomes something worth selling as a
utility module. It also makes the editable registration from Phase 2
quietly interesting: your own reg indexes your own record.

**One thing to check first.** Generated lurker pirates get `id: 'n' + id++`
from `buildPatrols`, which runs off `base.fork('patrols')` — deterministic
generation order, so those ids are seed-stable and hash cleanly. But
corridor drop-outs get `id: 'drop-' + other.id` from the slipspace contact
list, and whether *that* is seeded has not been traced. If the corridor
rolls contacts off the wall clock, those need their own salt or they will
be stable within a session and different across loads.

---

## ✅ The cargo scoop — BUILT, and it closed a hole in jettison

*Reported from play 2026-09-09: jettisoning cargo simply resulted in picking
it back up.*

**The bug was arithmetic, not logic.** `dropCanister` already pushed a crate
out 50 m astern at 12 m/s — the right behaviour, and what the plan always
described. `scoopCanisters` reaches **80 m** at up to 20 m/s. So the crate
spawned inside the scoop envelope and the ship inhaled it on the next frame.
Jettison had never once worked, and the suite had a `frames(60)` sitting
directly on top of it that only checked for exceptions.

Two changes, and they are separable:

1. **Arming.** Anything the player pushes out is inert until it has been
   further away than the scoop can reach. A **distance** test, not a timer —
   a timer in sim seconds evaporates under time compression and a timer in
   real seconds can be waited out sitting still. Cargo dumped by somebody
   *else* carries no `armed` field and is catchable immediately, which is
   what makes robbing a freighter work.
2. **Catching is a fitting.** `cargoscoop`, utility slot, 1,400 cr,
   `minDev: 0`. `Combat.hasScoop` reads it off the fit rather than a flag,
   so selling it takes the capability with it.

**Fitted on a new ship** (and issued by `migrateFit` to any save with no fit
map). Learning the rule by watching your own cargo drift away is a bad first
lesson; learning it by selling the scoop because you wanted the slot for a
scanner is a good one. Selling sticks because the scoop lives in the fit map
and the fit map is what is saved.

**Zero power draw, and the suite is why.** The first version charged 0.4 MW.
Four measured budget facts moved at once — the starting fit's draw, the
Kestrel's reactor-then-shield sequence, and the pair of anchor measurements
that depend on a Talon having exactly 6.8 MW free. A scanner runs
continuously; a scoop is a hatch and a clamp that work for seconds a day.
Its price is a tonne and a utility slot, and on a Kestrel that tonne is
exactly the difference between the Class 3 beam / Mk II reactor / shield
glass cannon existing and not, because those three come to precisely its
22 t budget. The budget says "a glass cannon does not stop to pick things
up" without anyone having written that rule.

**What this unblocks.** Phase 5's mining and Phase 4's salvage both run
through the same scoop, so the utility slot now has a customer before
asteroids exist — and the parcel design in Phase 10 wants a *scanner* good
enough to read a sealed crate, which is the same slot competing again.

---

## Phase 5 — asteroids, mining, and the utility slot

**Asteroids do not exist.** Grepped: there is no asteroid, belt or
minor-body entity anywhere in `generate.js`. Mining is not a module you
bolt on, it is a world-generation feature with a module attached, and
that is most of the work in this phase.

### Asteroid fields (`generate.js`)

Generated like everything else — a pure function of the system seed,
`base.fork('belts')`. A field is a **region**, not an object list: define
it by parent body, semi-major axis band, eccentricity and inclination
spread, and a density. Individual rocks are then instantiated *on demand*
near the player from a sub-hash of the field id plus a cell index — the
same reasoning that keeps traffic on rails until you are close enough to
care. A belt with ten thousand persistent rock objects in it is a memory
leak with an orbit.

Rocks ride Kepler rails exactly as canisters do when asleep. **Density
should be honest**: a real field puts kilometres between rocks. It should
feel like prospecting, not like the Millennium Falcon.

**Composition from the seed.** Each rock hashes to a type — ores,
metals, ice, volatiles — weighted by where the field sits. `economy.js`
already has the `NATIVE` table (`rocky: ['ores','alloys']`) to key off, so
mined output slots straight into the existing market with no new commodity
ids required. An ice field out past the frost line yielding volatiles is
worth flying to precisely because the inner system does not have one.

### Mining laser (hardpoint)

| | Draw | Range | vs rock | vs ship | Mass | Price |
|---|---|---|---|---|---|---|
| Mining laser | 3.6 MW | **0.8 km** | high | ×0.15 | 3 t | 4,500 |

**The range is the whole design.** Encounter standoffs in `sim.js` are
6 km at their closest and 18–45 km normally, so a 800 m weapon can never
be brought to bear on anything that wants to keep its distance. That is
the FE2 mining-laser-as-murder-weapon problem solved by geometry rather
than by a rule. It should also **not count as a weapon** for
`demandFrom`'s `armedThreat` check — waving a rock cutter at a freighter
is not a threat, and the freighter should say so.

Firing at a rock **blasts fragments off the surface** — and those
fragments are the Phase 4 debris shards, unchanged. Same mesh pool, same
cheap ballistic sim, same expiry, same scoop path. Mining and combat
salvage are one system with two sources, which is the argument for
building debris before mining rather than after.

Matching velocity with a tumbling rock at 800 m is a genuine piloting
task, and that is the gameplay. It should be slow and calm and worth
doing while something else is on the radio.

### Fuel scoop (utility)

| | Draw | Mass | Price |
|---|---|---|---|
| Fuel scoop | 2.2 MW | 4 t | 7,200 |

Skims jump fuel from a gas giant's or star's outer atmosphere. **This is
already a heat minigame** — the atmosphere, drag and re-entry heating
model exists, so scooping is: go deep enough to collect, not so deep you
cook. `heatFlux` scales with the cube of speed, so the skill is arriving
slow.

**And once radiation exists it is a two-axis problem**, which is what
makes it worth flying rather than holding a button:

- **Depth** is thermal. Too deep, too fast, and you cook.
- **Inclination** is radiological. A gas giant's belts are equatorial, so
  an equatorial skim is the fast way and a **polar approach is the safe
  one**. See "Inclination finally matters" above — this is the mechanic
  that finally gives the manoeuvre-node planner a plane change it has to
  make.

A star can be scooped the same way, off the solar wind, and the same rule
applies: over the poles.

### ✅ Heat sinks (utility rack + consumable) — BUILT AND LIVE

*The rack, the charges, `armSink`, `addHeat` and the ejection record all
exist and are tested, and as of Phase 3 there is finally weapon heat for a
sink to absorb: every shot spends `heat × cooldown` through `addHeat`. The
ejected block is still only recorded in `G.sinkEjections` and is not yet a
physical object; that remains Phase 4.*

*Unverified in play: the ten-seconds-per-charge figure below is arithmetic,
not measurement. It wants a fight before anyone trusts it.*

A one-shot block of ablative mass that soaks your heat and is then thrown
overboard. The answer to "this one absolutely cannot be allowed to
survive."

| | Draw | Mass | Price |
|---|---|---|---|
| Heat sink launcher | 1.2 MW | 2 t | 4,800 |
| Sink charge (×3 rack) | — | — | 320 each |

**A rack, not a slot each.** Same shape as the Hawk seekers: one utility
module holds three charges. Individually-slotted consumables would eat the
whole utility budget and make the decision "sinks or a scoop" rather than
"how many sinks".

**What a live sink does, in two parts:**

1. **On activation it banks stored heat** — up to 60 units straight out of
   the hull and into the block. That is the "dump what you have already
   accumulated" half.
2. **While live it takes 65% of generated heat**, not all of it, for up to
   6 seconds or until its 220-unit capacity is full.

**The fraction is the important choice.** At 100% the heat clock stops and
the sink is a panic button you mash when the warning light comes on. At
65% the clock keeps running, only slowly — so a sink *extends* a window
rather than suspending one, and using it when you are already cooking does
not save you. That makes it a thing you spend before the fight starts,
which is a far better decision than a thing you spend when it goes wrong.

Worked against the real constants: a Class 3 beam puts 45 units/s into the
hull and a bare hull sheds 18, so you cross `HEAT_LIMIT` in **3.7
seconds**. With a sink live, 15.75/s reaches the hull against 18/s shed —
near enough flat. So the sequence is 6 seconds of effectively free fire,
then the sink goes and the original 3.7-second clock starts again: about
**ten seconds of continuous beam** for one charge. Three sinks is three
guaranteed kills for 960 cr of consumables, and then you are back to the
cooling you actually paid for.

A Class 2 beam (26/s) under a sink puts 9.1/s against 18/s shed and
genuinely *cools* while firing — the lighter gun gets more out of a sink
than the heavy one does, which is a nice inversion and nobody had to write
a rule for it.

**The ejected sink is a physical object, and that is the real cost.**

- It is white-hot and it is a scanner return. It marks, precisely, where
  you were and when. The game already has the doctrine for this — the
  marked waste canister, where *evidence outlives the act*. Ejecting a
  sink during a murder is leaving a receipt.
- It is debris, so it uses the Phase 4 shard system: it tumbles, it
  despawns, and it can be hit. Ejecting one into a pursuer is a legitimate
  if petty tactic.
- It cools over a minute or two and stops being a return. So the tell is
  *recent*, which is exactly the window a patrol responding to a distress
  call would arrive in.

**Guard rails, so this does not delete the heat system it plugs into:**

- 8-second cooldown between ejections — you cannot chain three sinks into
  half a minute of uninterrupted beam.
- Rack of three, and charges are bought one at a time.
- Availability `minDev 0.55`, `minStanding 0`. There should also be a
  **grey-market sink** that occasionally fails to eject and dumps its whole
  220 units straight back into your hull, which is the funniest possible
  version of the bootleg-ordnance rule and needs no new mechanism.

**It works on re-entry heat too, and the physics balances that for free.**
Heat is heat and `updateHeating` does not distinguish sources, so a sink
absorbs atmospheric flux as readily as beam waste. But entry flux runs to
thousands of units per second, so 65% of it fills a 220-unit block almost
instantly — a fraction of a second of relief on the way down, against six
seconds in a gunfight. No special case needed: the same item is an
execution window in combat and very nearly nothing on entry, because the
numbers say so rather than because a rule says so.

**One free consequence.** Cook-off odds for bootleg ordnance scale with
hull heat, so a live sink also makes cheap seekers briefly safe to launch.
That falls straight out of both rules without a line of code connecting
them, which is the sign they belong in the same game.

### Grappler (utility)

| | Draw | Mass | Price |
|---|---|---|---|
| Grappler | 1.4 MW | 2 t | 3,800 |

Extends the scoop envelope by a wide margin and pulls loose objects to
you rather than requiring you to fly onto each one. After a kill, the
difference between salvage being satisfying and salvage being fiddly is
entirely this module. It should also steady a tumbling mine fragment so it
can be taken aboard without a chase.

Deliberately not a tow cable for ships. Towing a disabled hull is a
different feature with its own physics problems, and this plan is long
enough.

---

## Phase 6 — making piracy reach the economy

**Investigated, not assumed.** The economy is in better shape than
expected and has one specific hole.

### What already works

- **Prices are not RNG.** `Eco.price` is pure scarcity:
  `base × local × (0.55 + 0.95 × (1 − fill))`, `fill = stock / cap`.
- **Stock is closed-form in `t`** — `analyticStock` is a seeded slow
  oscillation (amplitude 0.03–0.11) times warehouse capacity, plus
  deliveries, plus the player's own decaying ledger. It is the market's
  `Kepler.state()`: exact at any past or future `t`, no accumulated state.
  Near the player it switches to a stepped `live` mode and writes the
  difference back as a ledger entry when it goes dormant.
- **Freighters already carry what the destination needs.**
  `manifestFor(src, dst)` only picks commodities where `src.exporter &&
  dst.importer`, scores them `(src.prod − src.cons) + (dst.cons −
  dst.prod)`, takes the top three, and sizes the load from that score.
  Routes are ranked by total score; the best ~28 fly.
- **Deliveries move prices.** `registerDeliveries` writes each manifest
  into `port.market.inbound`; `scheduledDeliveries` adds a pile at each
  arrival decaying with τ ≈ 0.55 × period.

### The hole

An `inbound` entry is `{cid, qty, t0, cruise, period}`. **It has no
back-reference to the route that flies it**, and nothing ever removes or
suspends one. `killNpc` sets `route.dead = true` and the ship stops
existing — and its cargo goes on arriving on schedule forever. Robbing a
hold is the same: the canisters spill into your scoop and the full
shipment still lands.

So the player perturbs markets by trading, and piracy does not perturb
them at all.

### The fix: negative deliveries

The elegant part is that the existing maths already does the work.

1. **Tag each inbound entry with its `routeId`.**
2. **Add a `shortfall` list** shaped exactly like `inbound`, and subtract
   it in `scheduledDeliveries`. A robbed or destroyed shipment pushes
   `{cid, qty: −taken, atT}`. It decays with the same time constant, so a
   raid's effect on price fades over roughly one delivery interval, which
   is the correct behaviour and costs no new model.
3. **A dead route stops contributing** arrivals after `route.deadAt` —
   one comparison inside the existing loop, since the form is already
   evaluated per-arrival.

That makes a blockade real: kill the grain hauler and grain climbs at the
colony, which raises the price *you* can sell grain at. Piracy becomes a
way of manufacturing a trade route, which is a far more interesting crime
than shooting a freighter for its hold.

### The counterweight: routes heal

Do not let a player permanently starve a world. A dead route should be
**replaced after a delay** — someone else takes the contract, because the
demand that created the route has not gone anywhere. Say 20–60 days,
scaled by how badly the destination wants the goods and by local crime
score (a lawless system takes longer to find a willing operator).

That bounds the damage, gives raids a natural half-life, and explains
itself in-world without a rule the player has to be told.

### Where this is going: blockade as a faction objective

Starving a world is not just a consequence to be bounded — it is
*content*. A faction that wants a rival's world can hire you to cut its
supply until it changes hands. That turns the shortfall mechanism from a
realism fix into the scoreboard of a campaign, and it is the best possible
reason to have an economy model at all: **the player has to learn how the
market works in order to win.**

See Phase 8. It is sketched there rather than here because it depends on
this phase existing first, and because it is large enough to deserve its
own decision.

**This changes the counterweight.** Route healing above was a safety rail
against griefing. With blockades as content it becomes the *defender's
move* — the rival faction re-routing around you — which is a much better
thing for it to be. Same code, better reason.

### Not doing yet: dynamic re-planning

Routes are chosen once at generation and fly A↔B forever. Making them
re-score periodically is a much larger change and is not needed for any of
the above — the shortfall mechanism plus route healing already delivers
"a raid changes prices" and "the world reacts". Note it and move on.

---

## Phase 8 — blockade, and worlds changing hands

The largest idea in this document, and the one most worth doing carefully.
A faction hires you to strangle a rival's world until it changes
allegiance. It depends on Phase 6 and should not be started before it.

### The one architectural rule

**Faction control is SAVE state, never generated state.**

`generate.js` decides who holds a port, as a pure function of the seed —
that is what makes the same seed the same universe. A world changing hands
must therefore be an *overlay*, not a mutation:

```js
G.control = { 'portId': 'factionId' }        // empty at t = 0
Combat.factionOf(port, G)                     // the single read point
```

Everything already reads `port.faction` — docking clearance, police
hostility, `stockAt`'s standing gates, bounty ownership, mission boards.
Routing them all through one `factionOf(port, G)` is the whole insertion,
and it keeps "same seed, same universe" true at t = 0 while letting
history diverge through play. This is exactly how `G.wanted` and
`G.standing` already work, and doing it any other way makes every save a
fork of the generator.

### The objective is a STATE, not a counter

Existing arc steps (`arcs.js`: haul, courier, disposal, smuggle) are all
"go there, deliver, come back", settled the moment you dock. A blockade is
a different animal — a condition sustained over days:

> *Keep alloys at Dorsey Yard below 25% of warehouse capacity for 12 days.*

Measured straight off `Eco.stock`, which is already exact at any `t`. So
this needs a new **kind** of objective in the mission machinery — one that
is checked continuously rather than settled on arrival — not merely a new
step type. That is the real work in this phase, and it is worth building
generically: "hold a world condition for N days" is a shape a lot of
future content will want.

### The defender fights back

This is what stops a blockade being a fortnight of waiting, which is the
genuine design hazard here.

- **Escorts** appear on the cut route — mercenaries on the freighters that
  were previously unarmed.
- **Patrol density rises** in that system, and the holding faction posts a
  bounty specifically for interdiction, not just for the kills.
- **They re-route.** After the healing delay, a replacement route from a
  *different origin port* — which you now have to find and cut as well.
  The blockade gets harder the longer it works, which is correct and is
  the healing mechanism doing double duty.

### Third parties hate you for it

People on that world are going hungry, and the game should say so.

- Standing loss with every faction not party to the war, scaled by how
  long the blockade runs and how badly the world needs the goods.
- A **counter-contract**: somebody hires blockade *runners* to get food
  through. That is a haul contract with teeth, and it makes this two
  sides of one piece of content rather than a one-way objective. A player
  who has run the blockade from both ends understands the system better
  than any tutorial could manage.

### The flip, and the flip back

Hold the condition and the world changes hands: `G.control[port.id]` moves
to your patron, standing swings hard both ways, and every system listed
above reacts for free.

**It must be reversible.** The dispossessed faction should be able to hire
you — or somebody else — to take it back. A system that only moves one
direction turns the map monotonic, and a galaxy that can only be conquered
is a galaxy with an end state.

### Wars are economic, and the supply graph already records them

The blockade above is the player *forcing* a flip. Worlds should also
change hands on their own, because that is what makes it a galaxy rather
than a diorama with one lever in it.

**Two different axes, and they must not be confused:**

| | Settlement pressure | Territorial control |
|---|---|---|
| When | generation, t = 0 | simulation, through play |
| Where | derived from the seed | `G.control`, save state |
| Moves | how much exists | who holds it |
| May move a planet? | **never** — there is a test | n/a, it moves allegiance |

Pressure decides how much there is to fight over. Control decides who has
it. Confusing the two would make a seed stop meaning a place.

**The mechanism is already in the data.** A port's `market.inbound`
carries every scheduled delivery, and every delivery came from a route
whose origin port belongs to a faction. So *who feeds this world* is
already computable — sum inbound tonnage by the source port's faction and
you have each faction's economic share of that world, for free, from
tables that exist today.

A world drifts toward the faction that feeds it. Specifically:

- **Supply share** — of everything arriving, whose ports did it leave?
- **Adjacency** — a faction can only pull a world it already borders. This
  is what stops a distant power acquiring an enclave halfway across the
  system, and it is why wars spread along frontiers instead of teleporting.
- **Drift, not a coin flip** — a world sits in a *contested* state for a
  long time before anything changes, with the drift direction and the
  share readable on the system map. A flip nobody saw coming is
  indistinguishable from a bug.

**This is what makes ordinary trading political.** Hauling grain to a
contested world is an act of war by other means, and cutting the other
side's tanker route is the counter. A player who never fires a shot can
decide a border — which is a far better answer to "what is trading for"
than a rising credit balance.

It also gives the two branches from Phase 11 something to disagree about:
the consortium wants the supply contract, the navy wants the world, and
they will pay you for different things on the same frontier.

**Two hazards worth designing against up front:**

- **Do not let the galaxy churn behind the player's back.** Rates should be
  slow enough that a war is a season, not a week, and a faction losing
  ground should be *announced* — you find out on the comms, not by
  arriving somewhere and finding the flags changed.
- **Keep it reversible and bounded.** A faction reduced to nothing removes
  content permanently. Factions should have a floor, and a dispossessed
  one should be able to hire the player to push back.

### Scope discipline

- **One port, not a system.** A world, not a war.
- Rare, expensive, and gated on high standing — this is what a faction
  asks of someone who has already run their campaign.
- Do not start it before Phase 6 works and has been played with. The
  blockade is only interesting if shortfalls genuinely move prices, and
  that wants tuning by hand first.
- **Build the player-forced flip before the autonomous drift.** One
  blockade you can watch end to end teaches more about whether the rates
  feel right than a background process ever will, and the drift is the
  same arithmetic pointed at every world instead of one.

---

## Phase 9 — who hunts whom

Two opposite AI problems that share one piece of plumbing.

### The structural fact

`steerNpc(spec, sys, t, dtSim, ship)` takes **the player's ship** as its
target, and `updateEncounters` is written entirely around the player.
Every NPC in the game currently steers at you by construction. Giving an
NPC a target that is not necessarily the player is the single change that
unlocks everything below, and it is not a small one — it touches the
standoff logic, the demand logic and the wake/sleep bookkeeping.

### Only the player's bubble is simulated, and that is fine

NPCs wake inside `WAKE_RANGE` (3,000 km) and sleep outside it. So
pirate-on-trader robbery can only be *simulated* where you can see it.
Everywhere else it should be **resolved statistically** — and that is not
a compromise, it is the same feature seen from further away:

> **An off-screen robbery is a Phase 6 shortfall event.**

A pirate takes 8 tonnes of alloys off a freighter you never saw, and the
port it was bound for gets a shortfall entry and a price bump. Watch it
happen and it is a dogfight; fly past a week later and it is an
unexplained spike in the price of alloys. Same event, same numbers, and
the economy is what connects them. This is the strongest argument for
building Phase 6 before this one.

### Pirates want paying, not killing

Target selection by score, evaluated over every candidate in range —
**the player is simply one of them**:

```
score = cargo value  ×  vulnerability  ÷  distance
```

where vulnerability rises for an unarmed hull, a slow one, a laden one,
and one already damaged. Consequences that fall out without a rule being
written:

- Fly a fat slow freighter with a full hold and **you are the best prey in
  the system**, correctly.
- Fly a Dart with an empty hold past a laden tanker and the pirate takes
  the tanker. You are not interesting, which is a much better reason to be
  left alone than a difficulty setting.
- Arming up genuinely deters, because it lowers your score rather than
  because a flag says "armed".

**Satiation.** A pirate that has been paid — cargo handed over, or a hold
taken off a kill — breaks off and leaves the area to sell it. That single
behaviour is what makes them read as economic rather than murderous, and
it gives the player the option of *paying* as a real strategy rather than
a humiliation.

**They still avoid the law.** `policeNearby` already exists and already
calls off a robbery; it should apply to NPC victims too, which means
freighters flying patrol lanes are genuinely safer. That is a fact about
the map the player can learn and exploit.

### The navy is a different animal

Police are lenient (Phase 7). Naval fighters and military interceptors
are not, and **the difference is what you did, not what you owe.**

That needs a second metric, because bounty is the wrong shape:

| | `G.wanted[fac]` | `G.notoriety[fac]` (new) |
|---|---|---|
| Means | money owed | recent loud acts |
| Grows on | fines, citations, smuggling | killing their ships, their police, blockading |
| Decays | slowly, or by paying | over days, and **cannot be paid off** |
| Triggers | police stop, fine | naval dispatch |

A career smuggler accumulates bounty and gets stopped and fined. Someone
who destroys three patrol cutters in a week gets **hunted**, and cannot
buy their way out of it — they have to leave, or survive it.

Naval hunters differ from patrols in kind: they do not fly a route, they
are *dispatched* — they spawn with a task, seek the player across the
system, arrive in pairs or threes, fly the better hulls, and do not open
with a demand. They should be frightening and they should be survivable
mainly by leaving.

---

## ⚠️ Phase 10 — the mission board: sabotage, and text that fits

*Text discipline and the word-pool grammar are **BUILT** — `text` capped
at 240, `desc` generated and carried onto accepted contracts, DETAILS
button on the F7 board, tested. **Sabotage is not built.***

### Text discipline

Mission `text` today is already terse — `"18t Grain to Halden Dock"` —
because every mission type so far is a delivery. Sabotage and blockade
will not be, and this is where boards start to sprawl.

- **`text`: the one line, hard cap 240 characters** and in practice far
  shorter. It says what the job is, not why.
- **`desc`: the long form** — who is asking, why, what happens if you
  fail, and any condition that is not obvious from the one-liner.
- **A DESCRIPTION button** on the mission screen opens it. The board stays
  scannable; the detail is one click away for the job you are actually
  considering.

Both fields go on the offer and are carried onto the accepted mission, so
a contract you signed a week ago can still explain itself.

### Generated text: a word pool with grammar

Mission text should be assembled from a pool of fragments joined by rules,
not written out per type. The rule that keeps it from producing nonsense:

> **The grammar may only combine fragments that describe state the mission
> actually has.** A slot is filled from the pool of phrases valid for that
> field, so the worst case is a sentence that reads oddly — never one that
> describes a job the player cannot do.

So `[URGENCY] [VERB] [CARGO] to [PLACE] [PRESSURE]` draws `PLACE` from the
real destination and `CARGO` from the real manifest, and the pool only
supplies the connective tissue. A clumsy join is a cosmetic failure; a
wrong destination is a broken contract, and this structure makes the second
one impossible.

Fragments should also be **selected by the mission's own seed**, not by
`Math.random()`, so a board reads the same when you come back to it — the
same doctrine as the pirate holds.

### What is actually in the sealed parcel

**Nothing, today.** `registerParcel()` invents `parcel` as a phantom
commodity — `{ id: 'parcel', name: 'Sealed courier parcel', base: 0,
tier: 0 }` — registered *after* the catalogue so the market has never heard
of it and cannot price it, and `accept()` puts one tonne of it in the hold.
It exists so the hold has something to carry and so `completeAtDock` has
something to check for. Mechanically the courier contract is "fly to that
star", and the parcel is the token that proves you did.

That is not wasted. The courier is **the only mission type that makes you
leave the system**, which makes it the game's tutorial for the lane
timetable, wakes, the corridor and interdiction, and it should keep doing
that job. But it leaves something obvious on the table, because a **sealed
container in the hold is the perfect object for a game that already searches
holds.**

**The parcel has contents, and you do not know them.** `contents` hashed off
the mission id — the pirate-hold doctrine exactly: derived once, owned,
deterministic, not a die roll you can reload away. Weighted so that most of
it is mundane and specific: legal instruments, medical samples, a machine
part nobody will trust to general freight, seed stock, a data core,
somebody's ashes. And sometimes it is not: narcotics, restricted arms, and
once Phase 18 exists, a sabotage device.

**A sealed parcel is not your crime until it is opened.** `resolveScan`
already searches holds and already knows what contraband is. Carrying a
dirty parcel through a customs stop is the whole tension, and the game
should be exactly as honest about it as the situation is: the seal is
somebody else's word, and you took the fee.

**You can break the seal.** A button on the contract, and it costs you:

- The contract **voids** — no fee, a standing hit for the breach, and the
  client's line about discretion turns out to have meant something.
- You find out what you are carrying.
- You can then dump it before the border, through the existing `dumping()`
  path — which is itself a witnessed act with its own consequences.

Three things that already exist (a seeded hash, `resolveScan`, `dumping`)
plus one flag and one button, and the result is a decision with genuine
information asymmetry in it.

**And a reason to buy a scanner.** `scanLevel(ship)` already exists and
already grades a ship's sensors. A good enough scanner should read a sealed
parcel **without breaking the seal** — which turns an abstract utility-slot
stat into a thing a courier pilot specifically wants, and gives the Phase 5
utility slot a customer it does not currently have.

**The fee is the tell, and the tell must be true.** The courier band is
1,800–4,800 cr for a single tonne, already conspicuous beside a haul's
`tonnes × 28–55 + 250`. A parcel at the top of that band, from a client the
pool calls *"someone who did not give a name"*, bound for a system with a
high `crimeScore`, is the game telling you something without ever lying.
**So weight the contents table on the fee and on the destination's crime
score, and draw the client and tone fragments from the same seed.** If a
nervous `desc` and a fat fee do not actually correlate with dirty contents,
players learn within an hour to ignore both, and the mechanic is dead.

**What it must not become:** a coin flip that ruins a run with no warning. A
mid-band fee, a named client and a low-crime destination should be clean
very nearly always. The uncertainty belongs at the tempting end of the
board, where the money is.

### ✅ Narrative text, from facts rather than adjectives — BUILT

*`factsFor` / `placePhrase` / `reasonPhrase` in `missions.js`, plus the
headline generator below. The pools roughly doubled and a `smuggle` set was
added so `arcs.js`'s off-the-books chapters stop borrowing the haul voice.*

The ask is for mission text with more character in it. The wrong way to get
there is a bigger `TONE` pool — four entries per type is not the problem.
**The problem is that there is one sentence shape per type, and it draws on
almost nothing the world knows.** `describe()` uses the client, the tone,
the origin name, the destination name, the tonnage and the fee. Everything
below is already computed, already true, and currently unsaid:

| Fact | Where it lives | What it lets the text say |
|---|---|---|
| destination's role | `port.market.roleName` | "the reprocessing plant at Halden Dock", not "Halden Dock" |
| surplus and deficit at each end | `market.rows[cid].prod − cons` | "they are drowning in it here and short of it there" |
| development level | `port.market.dev` | a frontier client and a core-world client should not talk alike |
| surface / orbital / underground | `port.surface`, `port.underground` | "it goes down the shaft, so mind your descent" |
| crime score en route | `sys.crimeScore` | "the run goes through permissive space" |
| distance | `Galaxy.distance3` | "nine light years, and they know what that costs" |
| faction and your standing | `port.faction`, `Missions.standing` | a client who has dealt with you before, or has not |
| contraband flag | `Eco.BY_ID[cid].contraband` | why the fee is what it is |

**The governing rule does not change, and this is what makes the expansion
safe**: *the grammar may only combine fragments that describe state the
mission actually has.* Every row above is a real value read off the offer or
the world, so adding these makes the text more specific **and** keeps the
guarantee that a clumsy join is the worst failure available. This is the
starport signage principle applied to prose — the boards advertise what the
port genuinely exports, and the contracts should describe the job the
economy genuinely has.

Two field traps, both already recorded in `starport-dressing` and both
silent if you get them wrong: **the role id is `port.market.role`, not
`port.role`**, and `economy.js` exports `PORT_ROLES` but keeps `ROLE_BY_ID`
private, so a small local lookup is needed.

**✅ The headline generator — BUILT.** Shipped as
`[URGENCY] [VERB] <core> [— TAIL]`. The shape changed slightly from the
specification above and the change is the interesting part:

- **`core` replaced `[CARGO] to [PLACE]`.** Whoever builds the offer writes
  the core — tonnage, commodity, destination — and `headline()` never edits
  it. That is what guarantees the three facts a headline exists to carry
  survive every decoration, and it is why `boardAt` now sets `core` where it
  used to set `text`.
- **`[PRESSURE]` moved out of the headline entirely.** It is a mood, not a
  fact, and it belongs in `desc` where there is room for it. What took its
  place is a *true* tail — "— they are short", "— underground bay" — drawn
  from the world rather than a pool.
- **`[URGENCY]` is earned, not rolled.** It appears when `payPressure()`
  puts the fee in the top quarter of that type's own pay band. A board that
  shouts is a board worth reading twice, and the shout is honest.
- **A 64-column budget, checked against the assembled string.** Decorations
  are added in priority order only while they fit, so a long port name
  quietly costs you the tail rather than producing a headline that runs off
  the panel. Measured across a galaxy: longest 64, and the suite holds the
  board under 80.
- **All three draws happen before any fit test**, so reordering or adding a
  decoration later cannot shift the stream and silently reword every board
  in the galaxy.

**Two fragments were written and then deleted, and the reason generalises.**
"There is more of it on this dock than anyone here can use" and its matching
"— surplus here" tail both read well in isolation and were true. They were
also true of *every haul ever generated*, because `boardAt` only offers a
haul in a good the origin exports — a tautology dressed as insight, printed
on two thirds of the board. The pool rule (a fragment must be true of every
mission of its type) has a mirror image that is just as important: **a
fact-driven fragment must NOT be true of every mission of its type**, or it
is noise with a citation. Same test for the 'orbital' role name, which is
the role a port gets when it has no role, and which is now left unsaid.

### The board should have people on it, not just contracts

**Requested, not yet built.** Today the board is a list of jobs that come
from nowhere. It should be a place where you can *contact* somebody:

- **Grey-market suppliers reachable from the board.** The grey market
  currently has no goods and no door. Making the contact the door solves
  both — you do not browse illegal gear, you get put in touch with
  somebody who has it, and the standing that gates the certified market
  is replaced here by whether anyone will vouch for you.
- **Open-ended quest givers.** A named contact who offers work
  repeatedly, remembers what you did last time, and whose offers change as
  standing does. `arcs.js` already casts authored chapter chains against
  real ports; the missing half is a *person* the chain belongs to, so a
  campaign reads as somebody asking rather than as a board refreshing.
- **Missions integrated with both.** A contract from a named contact
  should be visibly different from an anonymous board posting — better
  paid, more dangerous, and unavailable to a stranger.

The pieces that already exist: `arcs.js` chains, faction standing,
`stockAt`'s standing gates, the `desc` long-form field, and the
comms/hail machinery. What is missing is the contact as a first-class
thing with an identity, a memory, and a location.

Sequencing note: this wants Phase 11's **subfactions** first, or every
contact ends up working for the same undifferentiated faction and the
"who vouches for you" question has only one answer.

### Sabotage

The elegant version reuses machinery that already exists rather than
inventing a new verb:

> Carry a disguised device to a rival's port, dock, and leave. The payload
> takes a bite out of that port's production — a **shortfall entry**, the
> same mechanism a pirate raid uses.

Why this shape:

- It is a haul contract, so `accept`, cargo mass, deadline and the
  pay-on-arrival path all work unchanged.
- **The scan suddenly matters enormously.** `resolveScan` already searches
  holds for contraband; carrying a sabotage device through a police
  inspection should be the worst outcome in the game short of dying — an
  instant, serious bounty with the commissioning faction denying
  everything. That turns the existing search mechanic from a tax into a
  source of real tension.
- It feeds Phase 6 and Phase 8 directly: sabotage is how you soften a
  target you intend to blockade.

It should cost standing with the victim badly if traced, and the game
should be honest that this is not a clean job.

---

## Phase 12 — hydrogen as the spine of the economy

**H₂ is the one commodity every ship must buy.** That makes it the only
good whose price is a fact about the whole galaxy rather than about one
port, and it means the hydrogen tanker — already in the game as the
`tanker` class flying the `h2_freighter` hull — is not one trade among
many. It is the trade the others rest on.

### The geography, which already half exists

`pickRole` already gives a gas or ice giant a **refinery** 70% of the
time, and `NATIVE`/`INDUSTRY` already have hydrogen flowing. What is
missing is that the *price* does not yet say where hydrogen comes from.

- **Cheapest at a refinery in orbit of a gas giant.** Skimmed on site;
  the only cost is lifting it out of the well.
- **Dearer everywhere else, in proportion to how far the tankers had to
  bring it.** Scarcity already does half of this — a port with a full
  warehouse charges less — but the structural `local` factor is where the
  "this world has no gas giant" fact belongs.
- **A system with no giant at all is expensive to operate out of**, which
  is a real strategic fact about a map that currently has none.

`refuelFull` already buys from the port's own hydrogen stock at the port's
own price, so **the whole mechanism is already wired** — the numbers just
do not yet reflect the geography.

### Why this is worth doing early

It gives the existing systems something to push against:

- **Range becomes a function of route, not a number on the ship.** Already
  true in code; not yet true in feel, because hydrogen costs roughly the
  same everywhere.
- **Tankers become worth robbing**, which gives piracy an economic target
  rather than an opportunistic one.
- **Cutting a tanker route is the sharpest possible blockade** (Phase 8):
  starve a world of hydrogen and nothing leaves it.
- It is the clearest argument for the **fuel scoop** (Phase 5): skim your
  own and stop paying.

---

## Phase 13 — comms chatter

The system should sound inhabited. Traffic already exists, is already
deterministic, and already has names, registrations, factions and
destinations — and none of it ever says anything.

What there is to hear, all of it from state that already exists:

- Traffic hailing ports for docking clearance — the player already has to
  do this (F4), so hearing others do it makes the rule feel like a rule
  rather than a tax on the player.
- Departure and arrival calls, with the registration and the destination
  the timetable already knows.
- **Pirates threatening NPCs** — the audible half of Phase 9's
  pirate-on-trader work, and the thing that tells you a robbery is
  happening somewhere you could go and interrupt.
- Police running searches on NPC traffic, and collecting prisoners.
- Distress calls, which the crime system *already generates* — `crime()`
  starts a victim's transmission timer today and nothing broadcasts it.

**The rule that makes this work: every line must be true.** Chatter that
is decoration becomes wallpaper within an hour. Chatter that reports real
state — that freighter really is bound for that port, that pirate really
is holding up that trader — turns the comms panel into an instrument.

---

## Phase 11 — subfactions, and crew

### Subfactions

A faction is not one organisation. It has branches, and they want
different things:

| Branch | Wants | Hires you to |
|---|---|---|
| **Navy** | territory, deterrence | escort, interdict, blockade, fight |
| **Police** | order, revenue | patrol, transport prisoners, run stings |
| **Consortium** | margin | haul, smuggle quietly, break rivals' routes |

**The point is that they conflict.** Running contraband for the
consortium should cost you with the police *of the same faction*. That is
what makes "freedom" mechanical rather than cosmetic — you are not
choosing a side on a map, you are choosing which half of a government
likes you, and the other half notices.

**What this changes structurally:**

- **Standing goes per branch.** `G.standing` is keyed by faction id today;
  it becomes keyed by branch (`'halden'`, `'halden/navy'`,
  `'halden/police'`, `'halden/trade'`), with the bare faction id as the
  parent that branch standing feeds into at a discount. Existing saves
  migrate by treating every stored value as the parent.
- **`arcs.js` already casts one campaign per faction** from the faction's
  own `arcSeed` — the same machinery gives each *branch* an arc, and the
  three templates it has (`proving-ground`, `shadow-run`, `long-haul`)
  already read as navy, consortium and courier work respectively. This is
  close to free.
- **Joining** is what high branch standing buys: the branch's own mission
  board, its gear, and its hulls. `stockAt` already gates equipment on
  standing — pointing it at branch standing is a one-line change, and it
  is how a navy-grade weapon becomes something you *earn* rather than
  something you find at a rich port.
- **`port.faction` stays the parent.** Branches operate out of a port;
  they do not own it. Docking, clearance and bounty stay where they are.

The navy class built this session is the first branch made visible. It
currently patrols and nothing more, which is the right amount until this
phase gives it somewhere to belong.

### Crew, and what the model sizes are for

**Right now `-s` / `-m` / `-l` are decorative.** `HULL_ASSIGN` picks one
size per class and the other 22 of the 33 imported models are never drawn.
Crew is what would make that distinction mean something.

- **Every hull above size S needs hands**, and the number scales with the
  hull. A Talon is a one-pilot ship; a Mule is not.
- **Crew are hired at ports with people on them** — a starport, a
  groundport, a planetary city. Not at an unmanned mining head, which
  gives the settled worlds a job only they can do and makes the map less
  uniform.
- **Wages are an ongoing cost**, which is the first recurring expense in
  the game and changes what "profit" means on a run. It also gives an
  answer to why anyone flies small: a Dart costs nothing to keep.
- **Undercrewed is a real state**, not a refusal. Fly a Mule with two
  hands short and it is slower to turn and slower to reload — degraded,
  not forbidden. A hard block would just be a wall.

The obvious extension once crew exists: casualties. Taking hull damage
with crew aboard should cost you people, which is a consequence with
weight that no repair bill has.

**Ports per planet: already true.** Measured across ten systems — habitable
worlds get **3 to 5 ports each**; it is the airless bodies that get one or
two. The trade hubs already have their several cities. No change needed.

---

## A pattern worth naming: commodities that do something

Three separate ideas in this plan have landed on the same trick, and it is
worth stating as a principle rather than rediscovering it a fourth time:

> **Give an existing commodity a mechanical job, instead of adding an
> item.**

- **Water** shields the crew from radiation.
- **Medicine** treats the dose they took anyway.
- **Hydrogen** is already the one thing every ship must buy (Phase 12).

Each was already in `COMMODITIES`, already priced, already produced and
consumed somewhere, already haulable and robbable. Giving one a job costs
almost nothing and changes the market everywhere at once — a commodity
with a use has a demand floor set by *ships* rather than by ports, which
is exactly the thing a trading game's prices should be made of.

It is also the cure for a market where every good is interchangeable.
Grain and computers currently differ only by a number; water and medicine
would differ by what they let you survive. More commodities should
eventually earn a job this way — but only where the job is real, because
a fake use is worse than none.

---

## The heat shield has too many jobs — and the fix is not more items

By the time the black-hole idea landed, the ablative heat shield answered
re-entry, sustained beam fire, fuel scooping, ordnance stability and
radiation. Five jobs for one 3-tonne module.

**The problem is not the count, it is that the item is never wrong.** An
upgrade that is correct in every build is not a decision — it is a
prerequisite, and the internal slot it occupies stops being a slot. That
is the actual failure, and it is worth diagnosing that way because the
obvious remedy (invent more modules) does not fix it. Three items that all
reduce to the same scalar are one item with three names.

### The real error: radiation is not heat

Routing radiation through `Combat.addHeat` was a shortcut taken because
the plumbing already existed. It is wrong on the physics and, worse, it is
wrong on the *consequences*:

| | acts on | countermeasure |
|---|---|---|
| Atmospheric entry | the hull's skin — convective flux, huge and brief | **ablative mass** that boils away |
| Weapon waste heat | the hull's interior — generated inboard | **radiators and heat sinks** |
| Radiation | **crew and electronics**, straight through the hull | **mass between you and the source** |

A radiator does nothing about a particle flux, and a slab of shielding
does nothing about a hull full of waste heat. These are three different
problems that happened to share a variable.

Making radiation damage **crew** rather than hull is also the better
mechanic: it gives the crew system (Phase 11) something to be at risk
from, it makes an undercrewed ship a genuine consequence rather than a
stat penalty, and "the radiation got the crew, the ship flew home empty"
is a far better story than a number going down.

### Radiation as its own system

Not a heat source. A field, with its own damage, its own countermeasures,
and its own geography.

**Sources, all 1/r², all cheap:**

- **Every star.** Radiation is not a black-hole special case — it rises as
  you close on any star, which is what makes the inner system a place with
  a character rather than just a shorter orbit.
- **Gas giants**, which have magnetospheres and therefore belts.
- **Anchors**, at the extreme end.

**Tune it so ordinary play never notices.** At the AU distances where
trade happens the field must be background noise; it should only bite on
close approaches — scooping, inner-system work, a core transit. A
radiation mechanic that taxes every flight is an annoyance, not a hazard.

**What it damages: crew, then electronics.** Not hull. That is the whole
point of separating it from heat, and it gives the crew system (Phase 11)
something to be at risk from.

### Inclination finally matters

**Belts are equatorial. The poles are comparatively clear.** That is true
of Earth, spectacularly true of Jupiter, and it is the single best thing
about this idea:

> **You can scoop fuel from a gas giant safely by coming in over the
> pole.**

This game has a manoeuvre-node planner built to change inclination, real
orbital elements on every body, and *nothing that has ever required a
plane change*. Every orbit the player has ever needed could be flown in
the ecliptic. A polar approach being the safe one turns an unused system
into a piloting skill — and it is discovered rather than taught, because
the radiation readout falls as you climb out of the plane.

It also gives the fuel scoop a real technique instead of "hold this
button near a planet", and makes an equatorial scoop a legitimate
desperate option: faster, and it costs you crew.

### Water is the shielding, and the player must be told

Hydrogen-rich mass stops particle radiation — it is why spent fuel sits
under water. So:

- **Water in the hold shields the crew.** `water` is already a commodity
  in this game, already universally demanded, already cheap and heavy. No
  new item is needed for the best radiation countermeasure in the game to
  already be sitting on every market.
- **A habitation module** — the pressurised section a liner needs for
  passengers anyway — doubles as the hardened compartment the crew shelters
  in. One module, two honest jobs, which is the good version of what the
  heat shield became by accident.

The trade is real and it is the point: water is heavy and worth little, so
carrying it costs both hold space and the mass budget. Insurance versus
cargo, decided before you leave.

**This must not be a hidden mechanic.** A rule nobody can discover is a
trap, however elegant, and "obvious to anyone who knows what radiation
actually is" is not a design — it is a filter on physics education. So it
has to be surfaced in three places:

1. **The F5 fitted list shows effective shielding**, and shows the cargo's
   contribution as its own line — `Water in hold  +18 shielding` — so the
   connection is visible the first time anyone carries water anywhere.
2. **The radiation warning names what is protecting you**, and what is
   not: "CREW EXPOSURE RISING — shielding 22 (hull 8, water 14)".
3. **The port sells it as such.** Somewhere selling water inside a
   radiation-heavy system should pitch it that way — the sales-pitch field
   already exists on every catalogue item, and a commodity pitch is the
   same idea one table over.

Discovery by deduction is a delight *when the game confirms you were
right*. Discovery by having read a textbook, with no in-game
acknowledgement, is just an undocumented feature.

### Medicine treats what shielding failed to prevent

`medicine` is another commodity that already exists and is currently
nothing but arbitrage — buy low, sell high, and it may as well be called
Cargo. Give it a job:

> **Water prevents the dose. Medicine treats it.**

That split is both physically right and mechanically clean, and it makes
the two commodities complements rather than alternatives:

| | Water | Medicine |
|---|---|---|
| Does | reduces dose taken | recovers crew already exposed |
| Costs | hold space and mass — bulky, cheap | credits — compact, dear |
| Suits | the poor and the cautious | the rich and the committed |

Carrying neither is a real option, and it is how a reckless pilot flies.

Consequences that fall out for free:

- **Medicine gains a demand floor set by ships, not ports.** Every crewed
  hull working near a star is a customer, which makes the price mean
  something in radiation-heavy systems specifically.
- **Robbing a medicine hauler stops being equivalent to robbing grain.**
  Near a radiation-heavy world it is closer to what the game already
  treats waste-dumping as: an act with people downstream of it.
- It gives the **liner** a reason to be well-supplied, and a stricken one
  a reason to be worth intercepting.

### The autopilot should route around the dose — and say so

The autopilot currently flies the fastest useful path. With a radiation
field it needs a second mode, and the interesting part is that **the right
answer is not obvious**, which is what makes it worth having:

> dose = ∫ flux dt, and flux ∝ 1/r².

So a fast transfer *through* the inner system can take less total dose
than a slow one that stays out — you are closer, but for far less time.
That is a genuine optimisation with a real trade in it, not a
low-dose-is-always-slower tax.

**Two modes, and the numbers shown before committing:**

```
    TRANSFER TO HALDEN DOCK
      Most direct burn    4.2 h   ·   1.8 t   ·   dose 180
      Low exposure        7.1 h   ·   2.4 t   ·   dose  40
```

- **Do not silently reroute.** An autopilot that quietly takes the long
  way and burns a tonne of extra reaction mass reads as a bug, however
  well-meant. Offer, price it, let the player pick, and remember the
  choice.
- **"Most direct burn" stays the named default behaviour**, so nothing the
  player already knows how to do changes underneath them.

**Cost, honestly:** the dose integral is cheap — one scalar per sampled
point along a path the predictor already computes. What is *not* cheap is
searching trajectory space for an optimum, and the plan should not.
Offering two or three named candidates and scoring each is affordable;
solving for the minimum-dose transfer is a research project and would land
on a frame budget that already spends 25 ms predicting.

Around a gas giant the inclination term returns: belts are equatorial, so
a low-exposure approach there is a polar one, and the same planner that
offers the choice can offer the plane change.

### Three fixes, in order of how much they cost

1. **Split radiation out.** A separate shielding module, heavy, low power,
   sized in mass rather than throughput — because that is literally what
   shielding is. Radiation sinks stay a consumable in the same family.
   This is the one that should definitely happen.

2. **Give the pipe a throughput ceiling.** The existing design already
   says the energy shield is a *bucket* and the heat shield a *pipe*; a
   pipe has a maximum flow. 130 units/s covers a hard entry **or** a
   Class 3 beam — not both at once. Then the module stays one item and the
   decision becomes *what you are doing simultaneously*, which is a better
   question than *which module do I buy*. Cheap: one clamp.

3. **Make the ablative shield actually ablate.** A shield described as
   ablative that never wears out is a misnomer, and a permanently-correct
   item. If it degrades with use it becomes a running cost, and carrying
   one module for every thermal job burns it out fast — the overload
   limits itself, with no rule needed.

Together these turn one universal answer into a set of trades: thermal
capacity against radiation mass against the slot either one costs you.

---

## Phase 14 — the pulsar neutrino beacon

From `DESIGN-NOTES-WEAPONS-AND-BEACON.md`. Recorded here because it
touches more existing systems than anything else outstanding, and because
one of its open questions has a cheap answer.

**The chain of reasoning is unusually tight**, and it started as a joke —
a planet-sterilising neutrino beam, which does not work, because a
neutrino beam could pass through a light-year of lead and half of it still
would not interact. That inverts into something real: **the property that
makes neutrinos useless as a weapon makes them the one signal nothing can
block, jam, or shadow** — not dust, not gas, not a planet, not a star.
This is a genuine proposed communication method (Learned, Pakvasa & Zee,
2009) on exactly that logic.

**The scale constraint is what fixes where this lives in the world.**
SN 1987A is the real proof neutrinos are detectable across galactic
distances — and even at ~10⁵⁸ emitted, Earth's entire detector network
registered about two dozen events between them. So a beacon audible
across a galaxy needs supernova-adjacent output to transmit and something
the size of a small moon to receive. It is necessarily a fixed, enormous,
faction-scale installation. **Never something a ship carries**, which is
what keeps it a place rather than a gadget.

**Attaching it to a pulsar solves the output problem for free** and adds
a second property worth more than the first: a pulsar's rotation is a
fixed, physically locked, absurdly precise clock — some are timed to
fractions of a microsecond, which is why real spacecraft-navigation
proposals use them. If the beacon's modulation rides the pulsar's own
rotation, its rhythm is public, verifiable and impossible to fake, because
**nobody can spin up a counterfeit pulsar.** That is what makes a
treaty-enforced neutral installation credible: no faction has to trust
another, only that the pulsar keeps spinning.

It also sets the failure state. The way to attack this is not to capture
it — it is to tamper with the receiver hardware bolted onto it, without
being seen. Which is this game's witness doctrine, pointed at the highest-
stakes target on the map, rather than a capture-the-flag beat.

### The mechanic that makes it a place rather than a landmark

Ships do not sail toward lighthouses, and the notes get this right. What
puts traffic there is danger: a pulsar is a neutron star, so dropping out
of slipspace nearby without a precise timing reference should be
genuinely hazardous. The beacon becomes a **mandatory waypoint** for
anyone crossing that region — the relationship a ship has to a light
marking a strait, not to a destination.

Everything else follows from captive traffic:

- **A toll economy.** A port nobody can route around is the one place a
  docking fee is unavoidable — a natural fit for the living market, and a
  port whose prices are set by position rather than production.
- **A faction motive with no sentiment in it.** Whoever holds it holds the
  one channel in the region that cannot be jammed. That is a concrete
  reason to contest a world, which is what Phase 8's wars want.
- **Guaranteed witnesses.** A chokepoint with constant traffic is the
  worst possible place to commit a crime under this game's witness
  doctrine — and therefore the most interesting one.
- **Sabotage rather than capture.** The failure state is tampering with
  the receiver hardware without being seen, which is Phase 10's sabotage
  contract pointed at the highest-stakes target on the map.

### The open question, and my answer

> *Does slipspace exit-precision near a gravity well become a general
> mechanic, or is it beacon-specific?*

**General, with the beacon as its most dramatic instance.** A rule that
exists in one place is a special case the player learns once and never
uses again; a general rule turns every neutron star, black hole and gas
giant into terrain, makes the star map worth reading before a jump, and
gives the beacon its significance *because* it is the exception that
makes a dangerous region passable — rather than because it is scripted to
matter. It also composes with the black-hole anchors above: dense
formations are exactly where blind exits should be worst.

Cheaper, too. One exit-precision term keyed on local gravity beats a
bespoke system attached to one installation.

### Two more open questions

- **Is beacon control narrative or systemic?** A mission-arc device, or an
  ongoing property — faster reinforcement for whoever holds it, a
  player-purchasable guaranteed distress relay? Undecided. Leaning
  systemic, because a comms channel that cannot be jammed is exactly the
  sort of thing Phase 8's wars should be fought over, and pure flavour
  wastes the setup.
- **Where does the treaty live mechanically?** Flavour text, or does
  standing react when someone is caught interfering? If sabotage here is
  a real contract, the treaty has to have teeth, or the whole neutral-
  ground premise is set dressing.

### Scale discipline

This is a large feature with a lot of surface — economy, slipspace,
factions, missions, comms. It should be **one installation in one
region**, not a category of object, until it has been played. And it
depends on Phase 8 (control) and Phase 12 (a reason to be crossing that
region at all) being real first.

**The installation itself should be remote, automated and unpleasant to
approach** — pulsar environments are intensely radioactive, often binary,
sometimes carrying an accretion disc — rather than somewhere anyone
casually lives. Which is the radiation system from earlier in this
document, arriving where it was always going to be needed.

---

## Phase 15 — slipspace: outfitting, the interdiction payoff, and rendering fixes

*From `SLIPSPACE-TODO.md`, written at the end of the slipspace session
(2026-09-05) and folded in here. Everything under **Built** is on disk and
green across 1,352 tests; everything under **Owed** is designed and agreed
but not implemented.*

### Built

See the Status section's slipspace row above for the full list —
mass-scaled transit time, the lane timetable, wakes and wake scanning,
wake-following, the flyable interdiction corridor, the interstellar
drop-out locale, and the corridor HUD. Transit time is calibrated so a
fully laden reference hull still takes 6.97 h/ly against the old flat 7 —
nothing about existing play changed; what's new is that unloading buys you
speed.

### Owed

**1. The two modules are not purchasable.** `Slip.MODULES` defines the
**Wake Baffle** (6k–28k cr) and the **Harmonic Transit Anchor** (28k–140k
cr), priced per hull class, and the corridor reads them off
`ship.modules = { baffle, anchor }`. **This is the wrong home for them.**
`combat.js` already has a full outfitting system — `EQUIPMENT`,
`slots: { hardpoint, utility, internal }`, `buyOutfit`, `fitMap`, priced
and mass-costed, bought on F5 while docked (Phase 1). Both modules should
be `EQUIPMENT` entries in the `internal` slot type, and `Slip.moduleEffective`
should read the fit map rather than a bespoke field. Doing it that way gets
the shop UI, the save/load, the mass penalty and the "wrong class for this
hull" refusal for free, all of which would otherwise have to be written
twice.

- [x] Move both modules into `combat.js` `EQUIPMENT` — **four classes each**
      rather than two items with a class stat, because the class is what the
      field covers and so it is which item you bought
- [x] Point `Slip.fittedClass` / `moduleEffective` at `Combat.fittedList`
- [x] `ship.modules` kept as a **fallback**, not deleted — the corridor tests
      set it and anything already carrying one keeps working, the same
      courtesy the equipment table extends to legacy weapon ids
- [x] Confirmed in `Save.snapshot` via the existing fit map

The design stays in `Slip.MODULES` — price, wake factor, resist factor — and
`combat.js` adds only what it takes to bolt one on. `SLIP_MODULES` is built
from that price table at load, so neither file grows a copy of the other's
numbers and adding a class later needs one edit.

| | Mass | Draw | Price | minDev | Standing |
|---|---|---|---|---|---|
| Wake Baffle I–IV | 2–6 t | 0.8–2.0 MW | 6k–28k | 0.45 | any |
| Transit Anchor I–IV | 4–11 t | 3.2–7.0 MW | 28k–140k | 0.70 | `warm` |

The payoff is that the budget now tells the story the bespoke field could
not: a Class IV anchor on a Talon is 7.0 of its 9.0 MW and 11 of its 14 t —
legal, ruinous, and visibly so *before* you spend, with the cheapest gun
refused in words afterwards. Nobody had to write a rule saying "don't".

**A false alarm worth recording, because the method is the point.** The
gates were measured against 2,000 generated ports before being trusted —
this project has shipped two that excluded 100% of cases — and the first
measurement reported *the entire top of the catalogue* as unbuyable: all
three muon lasers, both upgrade reactors, and the new anchors. The gates
were fine. The measurement called `generateSystem` with a star **object**
instead of a star **seed**, got the same system two hundred times, and read
seven distinct `dev` values off it. Called correctly, `dev` reaches 0.98 and
the ladder is the intended rarity curve — muons and anchors at ~26% of
ports, the top tier at ~19%. That check now lives in `combat.test.js` rather
than in a scratch file, because a measurement that can be wrong that quietly
belongs in the suite.

**2. ✅ Robbing the ship you tore out — DONE, and the gap was not what it
looked like.** The claim above was that "nothing points `Combat.demandFrom`
at it". That is false: the planted spec is an ordinary ship contact, so
F4 → `Piracy…` → *Demand* already reached it and already paid. Flying the
sequence in a harness found the real reasons it played as an empty room, and
they were worse than a missing call.

- **The freighter was carrying nothing.** `holdOf` fell back to a hashed
  manifest only for `kind === 'pirate'`, and a lane hauler is a *trader* on
  an interstellar route no system's traffic list has ever heard of — so it
  inherited no manifest and reported "running empty" every single time. The
  fallback is now widened to `tornOut` as well. Widened, not dropped: any
  manifest-less trader falling back would hand cargo to every deadheading
  ship in the galaxy, which is a much larger change and not obviously right.
- **The purse was an infinite bank.** Both the purse and the hold were pure
  functions read fresh on every demand, so a compliant freighter paid its
  whole purse and a third of its hold *as often as you asked* — and since
  the corridor plants exactly such a freighter beside you in deep space with
  nothing else to do, one successful interdiction retired you. Both now
  follow the hold's own stated doctrine, **derive once then own it**, to the
  end. That meant fixing two places where an emptied store read as an
  underived one and quietly refilled itself: `manifestFor` tested `.length`
  rather than presence, and rounding the dumped share up to a minimum of one
  tonne meant a hold could be approached forever without arriving.
- **The load was far too small, and far too flat.** Measured across ten
  galaxy seeds and 2,858 lane legs: packet 151 t, trader 416, liner 654,
  freighter 1,104, bulker 2,717. The first scaling handed a median hauler a
  ten-tonne hold and a 3,600 t bulker twenty, against a Talon that carries
  64 — and the ladder was nearly flat, so which contact you chased made no
  difference worth the chase. Cargo now runs at roughly 4% of all-up mass
  (packet ~12 t, freighter ~49, bulker ~111), which makes the corridor a
  place where you **choose**: the fat contact is worth several times the thin
  one and is also the one your interdictor can barely hold. Money is *not*
  deadweight and keeps its own gentle curve, topping out near 2,500 cr — the
  prize is a hold you then have to go and sell, which is the right emphasis
  for a game about trade.
- **Nobody was told the door was there.** The arrival now names the move, and
  names it truthfully: there are no witnesses in deep space, but the victim
  still squawks its own distress call about ten seconds in. Robbing someone
  out here is not a free crime — it is a crime with one witness, who is
  currently running away.

- [x] `Combat.demandFrom` reaches the torn-out ship — it already did; the
      hold, the purse and the prompt were what was missing
- [x] What a freighter does afterwards: it **runs**, on the reserve fuel the
      drop-out granted it. Measured rather than assumed — `breakoff` steering
      already accelerates it away at 0.0013 km/s², so it leaves slowly, the
      way a laden hull should. No new behaviour was needed, and the "and
      runs" in the message turned out to be honest.

**3. Escort for hire, over COMMS.** Agreed design, not built. Hail an
outbound ship on F4 and offer to fly it to its port of call for a fee.

- Refused unless the **destination system's `crimeScore`** is above a
  threshold — they do not want company through policed space, and that
  refusal is what makes lawless space feel different
- Fee scales with cargo value and distance, paid **on arrival intact**
- You have to actually be there when they arrive, which means jumping the
  same lane and holding station

**4. Ship-to-ship trade over COMMS.** Newer ask, not designed in detail.
Offer to trade wares with a ship you have hailed, with availability and
price gated on your criminal record and your standing with that ship's
faction. Worth noting before building: **faction standing already
exists** — `Missions.bumpStanding`, `Missions.standingLabel`, standing
dented by smuggling fines, campaign chapters paying standing, and `Combat`
tracking bounties per faction. Start-at-zero and rise-by-trading is close
to what is already there; the rival-faction penalty is the part that is
genuinely new.

- [ ] Confirm what `bumpStanding` already does before adding a second system
- [ ] Decide whether trading in a faction's space raises standing
      passively, or only missions do
- [ ] Decide which mission types carry a rival penalty

**5. Flares/chaff as a consumable.** Seeker missiles **already exist** —
`MISSILES.hawk` ("Hawk seeker", 420 cr, rack of 8), `Combat.fireMissile`,
real homing, launched with B at a ship lock. What does not exist is any
way to defeat one.

- [ ] Flares/chaff as a consumable in the existing outfitter, bought in
      quantity like missiles are
- [ ] A key to deploy (every unshifted letter is taken — expect a shifted
      binding, and note the keydown switch matches **lowercased** keys, so
      `case 'G'` is silently unreachable)
- [ ] Seeker re-targets onto the decoy with some probability, rather than a
      flat immunity window

**6. ✅ Weapon bolt rendering — DONE.** Reported in play: the laser animation
was **too chunky and too slow**. The repetition rate was right; the bolts
moved as fat short slugs.

- [x] `Render.boltSpan(age, cross)` returns the streak's two ends as
      fractions of the muzzle-to-target run, and it **elongates**: a pulse
      emitter fires a bunch of charged particles, a bunch debunches, and the
      packet stretches linearly with distance covered. The animation comes
      out of a real property of a real particle beam rather than a number
      picked by feel — the same method the weapon tiers and the atmosphere
      model already use. A free consequence: once the head arrives the head
      stops and the tail keeps going, so the streak **collapses into the
      impact point** instead of blinking out.
- [x] Thinned — the core went 7.0 px → 2.4 and gained a wide dim halo, which
      is exactly the wake lightning's fix. A bright bar has no centre for the
      eye to find; splitting glow from shape lets the core get hot.
- [x] `TRACER_CROSS` 0.30 s → 0.20 s. It was slow because a slug is only
      visible where it happens to be; a streak says "a shot happened" along
      its whole length, so the head can cross faster without the event
      disappearing between frames.

**And then the perspective, which was a second report on the same feature.**
The streak fixed the *shape* and left the projection wrong in two ways, both
because the tracer was still drawn between two projected endpoints:

- **The width was a pixel ramp** — 2.4 px to 0.55, over a constant whose own
  comment admitted it was "perspective, faked cheaply". Every shot tapered by
  the same 4.4×: one down the boresight at something 20 km away and one
  crossing the canopy broadside got identical ramps, when broadside both ends
  are the same distance off and it should be a ribbon of constant width.
- **The travel was linear in pixels.** A point moving at constant speed down a
  receding ray does not cross the screen at a constant rate — it should appear
  to slow sharply as it goes. Sliding uniformly is exactly what makes a thing
  read as painted on the glass, and it is what survived the first fix.

Both die the same way: `Render.boltRibbon` interpolates along the **world**
ray and takes each sample's width from that sample's own depth. The line
stays straight — perspective maps lines to lines — so what is sampled is the
width, which varies hyperbolically, and the spacing, which is the travel.
Drawn as one closed polygon rather than a run of quads, because butting quads
under `lighter` double-cover every seam and leave a ladder of bright rungs
down the middle of the bolt.

**A measurement caught the naive version.** The first pass used an honest
physical radius — a 1.5 m packet — and the new test showed what that means at
this game's scale: the width hits its floor at 1.8 km while the guns reach
9–23 km and encounter standoffs run 6–45. Every bolt would have been a flat
hairline end to end, which is not correct perspective, it is *no* perspective
with a physical justification stapled on. The radius is now openly an
exaggeration chosen to put the taper where the fighting is — capped inside
3.3 km, real taper to 24 km, floored beyond — and the comment says so.

**Still owed: somebody has to look at it.** The suite can now hold the
projection to account — broadside is a constant-width ribbon, receding is not,
and equal steps down a receding ray crowd together on screen — but it still
cannot say whether the result reads well.

**7. Never verified.**

- [ ] The corridor and the drop-out have **never been flown by hand** in a
      browser. They pass in `render.test.js`, which drives the real game,
      but nobody has sat in the seat and tried to interdict a freighter.
- [ ] The corridor HUD's layout has not been looked at on a narrow window.
      Tests are structurally blind to layout — see `CLAUDE.md`.

### Traps this work hit, worth not repeating

**Grep for a top-level name before adding one.** A new `strokePath` in
`render.js` collided with the existing one; the later declaration silently
wins, every polyline caller handed its `cam` to the wrong parameter, and
the whole renderer died — which surfaced as "laser firing is broken."
Third time this exact trap has been hit in this project.

**A hash is not automatically a hash.** `wakeHash(id, i)` appended the
index to a shared prefix and read the high bits; FNV-1a does not diffuse a
last-byte change upward, so all nine arcs of a wake came out identical and
drew stacked on top of each other. Salt goes first, plus an avalanche
tail. Measure the spread of any seeded value derived this way.

**Anything that names a place must be cleared on arrival.**
`enterInterstellar` inherited `G.homeStation` from the system just left,
and the HUD walked a dead reference every frame. `enterSystem` has a long
reset list for exactly this reason.

**`render.test.js` is order-dependent.** The options-menu test near the
end passes only because earlier sections leave the sliders on their stops.
New blocks that call `newGame` must snapshot and restore the twelve
tracked preferences, or they break a test two thousand lines away.

---

## Phase 16 — drives as a career

Two upgrade ladders, both of them things you *buy* rather than things you
find, and both of them paid for with something other than money.

### The slot: one torch, one perforation drive, never zero

Not `slots: { drive: 2 }` — that lets you bolt on two torches and cancels
the choice. **Two singleton slot types**, `torch: 1` and `slip: 1`, added to
every hull's slot table. `slotType()` already strips the trailing digits off
a key, so `torch1` and `slip1` need no new machinery, and exclusivity comes
out of the table rather than out of a rule somebody has to remember.

**A drive slot is never empty.** `refreshShip` computes
`maxAccel = thrustKN / mass`, so an unfitted torch is a ship that cannot
move, and `hoursPerLy` with no perforation drive is a ship that cannot
leave the system. Buying a drive is therefore a **swap**, never a fit: the
old one is sold back at the standard 45% in the same transaction, and
`unfitItem` refuses a drive key in words. This is the one place the slot
model needs a genuine exception, and it is worth taking rather than
pretending a bare hull could fly.

**Migration.** `migrateFit` gives every existing ship a Class 1 torch and a
Class I perforation drive, whose stats are exactly today's numbers — so
every save in existence keeps flying identically and the ladder starts at
where the game already was. Same courtesy the equipment table extends to
legacy weapon ids.

### Torch drives — acceleration bought with heat and visibility

Rated as multipliers on the hull's own `thrustKN`, so one table covers the
whole catalogue instead of a number per hull.

| | Thrust | Drive heat at full throttle | Power | Plume |
|---|---|---|---|---|
| **Class 1 torch** | ×1.00 | — | 0 | blue, today's |
| **Class 2 torch** | ×1.45 | ×2.2 baseline | 2.4 MW | amber |
| **Class 3 torch** | ×2.05 | ×4.0 baseline | 5.6 MW | ethereal violet |

**Heat stops being a gunnery problem.** Today `addHeat` is spent only by
weapons — `heat × cooldown` per shot, the turret included — so a trader who
never fires never touches the thermal system and the heat sinks built in
Phase 5 are, for that pilot, decoration. A torch above Class 1 adds a
*continuous* term proportional to `throttle²`, and suddenly a hard burn
across a system is a thermal decision. That is a large amount of already-
built machinery — `armSink`, `updateSink`, the ejection record, the sink
rack — switching on for a player who has never been in a fight.

`throttle²` and not `throttle`, because the cost of going fast should punish
the last 20% of the lever far more than the first 20%. A pilot who cruises
at three-quarters throttle should be comfortable; a pilot who holds it on
the stop should be watching the gauge.

**The plume is information, and that is the whole point.** Class 3's violet
is not a skin. `plumeSignature(ship) = throttle × classFactor × hullSize`
feeds two gates that already exist:

- **`witnessNear`'s radius scales with it.** Committing a crime while
  burning hard makes you easier to identify. Coasting is free — the
  signature falls to the hull's own baseline at zero throttle — and coasting
  is already how orbital flight works, so the counter-play costs nothing to
  build and everything to use.
- **`Sim.updateEncounters` closes from further out.** Patrols and pirates
  vector in on a bright plume. The class you paid for is the class everyone
  can see.

**NPCs carry them too**, and this is what turns the colour into a mechanic.
A naval cutter runs Class 2; an interdictor built to catch you runs Class 3.
An amber plume closing at range is not a trader, and a violet one is a very
bad afternoon — read off the sky, before the contact list has resolved a
name. `drawShipExhaust` already takes its colour from an `EXHAUST` spec
keyed by `kind`; it gains a colour and a length override, and length scales
with class because a hotter exhaust leaves faster. Same method as the bolt
streak and the atmosphere model: the animation comes out of a property, not
out of taste.

### Slipspace perforation drives — the interstellar half

`hoursPerLy(tonnes) = BASE + (tonnes/100) × PER_100T`, with `BASE = 4.2` and
`PER_100T = 1.9`. **The drive moves `BASE` and nothing else.**

| | h/ly floor | Interdiction factor | Draw | Price band |
|---|---|---|---|---|
| **Perforation I** | 4.20 | ×1.00 | 1.2 MW | fitted, sells at 45% |
| **Perforation II** | 3.60 | ×0.88 | 2.6 MW | 12k – 55k |
| **Perforation III** | 3.00 | ×0.76 | 4.4 MW | 45k – 200k |
| **Perforation IV** | 2.50 | ×0.62 | 6.8 MW | 140k – 600k |

Leaving `PER_100T` alone is deliberate: **unloading stays the way you buy
speed**, and the drive raises the ceiling rather than flattening the hold's
story. A laden reference hull at 146 t goes 6.97 → 5.27 h/ly on a Class IV,
which is a quarter off a long haul; an empty one goes 5.76 → 4.06.

**The trap that would have made this upgrade worth nothing.** `openCorridor`
sets `hunter.rate = corridorRate(lightYears, tonnes, 0) × 1.15` — the
hunter's speed is derived from *the player's* nominal rate, so a hunter is
defined as "15% faster than you, whatever you are". Improve your drive under
that rule and the hunter improves by exactly as much: the Class IV costs six
hundred thousand credits and changes nothing about being chased. The hunter
must be re-based on **its own** mass — `corridorHunter` already picks one,
110–195 t light and 260–520 t heavy — running a stock Class I. Then
outrunning a light interdictor in a good drive is a thing that can happen,
which is what the money is for.

**And the chance itself.** `corridorHunter` rolls
`chance = 0.04 + (crime/100) × 0.30`, plus 0.08 over 20,000 cr of cargo
value. The drive multiplies that by the factor above, **floored at 0.03** —
you can never buy your way to un-interdictable, because a threat you can
switch off stops being a threat and the corridor stops being a place.

**The baffle and the drive are different jobs and should stay legible as
two.** The Wake Baffle hides your *trail*: `wakeFactor` is read at line 627
when somebody scans a wake to work out where you went. The perforation drive
shortens your *exposure*: fewer hours in the corridor, and a hunter with less
of it to close in. One is about who follows you tomorrow, the other about
who catches you today. Both should be buyable, and a pilot who owns both
should feel like they bought two different things.

### Where they are sold

Same gate structure as the anchors — `minDev`, `minStanding`, `minCrime` —
so the ladder is a rarity curve rather than a shopping list. Class 3 torches
and Class IV perforation drives belong at high-development ports and, once
Phase 17 exists, at naval stations, which is the first thing a rank actually
buys you.

**Verification owed.** The gates must be measured against generated ports
before being trusted, and measured *correctly* — `generateSystem` takes a
star **seed**, not a star **object**, and the anchor work already lost a day
to that. The check belongs in `combat.test.js` beside the existing one.

---

## Phase 17 — naval stations, and work for a flag

The navy exists in the sky and nowhere else. `PATROL_CLASSES.navy` puts a
cutter in roughly a system in twelve, `killNavy` is a charge, and that is the
whole of it: a deterrent with no door. **A naval station is the door.**

### The port role

An eighth entry in `PORT_ROLES` — `{ id: 'navy', name: 'Naval station',
bias: ['alloys', 'fusion', 'arms'] }` — but generated on a different rule
from the other seven. Not one per system: **one per faction per few
systems**, on a high-`dev` world inside that faction's own space, drawn in
its own `base.fork('navy')` substream so adding it cannot perturb a planet,
a moon or a patrol that already existed. The same discipline
`buildPortDressing` follows, for the same reason, with the same test.

Its market is thin and its yard is not. A naval station is where the top of
the weapons catalogue lives, and it is where **the directed muon burst
cannon** finally has a home — currently the plan's one DESIGN ONLY item,
with no plausible shop to put it in. A capital-grade weapon should not be
for sale at a farming co-op at any price, and "you have to have earned it"
is a better gate than "it costs a lot".

### Turrets, and the rule from the play report

Naval stations are defended. This is the feature the exterior-only rule
above was written for, and it is worth restating where the work will happen:
emplacements are placed on the **hull surface, facing out**, in the
station's own exterior frame — never in `buildPortDressing`'s surface-pad
`{u, r, h}` space, which assumes a ground plane and will happily bury half
of them inside the drum.

They should also **fire**, which is what makes them worth modelling at all.
A defended station is why Phase 8's blockade is a decision rather than a
formality, and why attacking a faction's naval station is the loudest thing
a pilot can do.

### The military board

Not a second mission system. `Missions.boardAt` already builds a
deterministic board from `(port, window, seed)`, `finish()` already caps the
headline and writes the long form, and `arcs.js` already casts authored
chapter chains against real ports. A naval station's board is the same
machinery with a different offer table and one extra gate.

| Job | Reuses | New |
|---|---|---|
| **Patrol sweep** | `killNpc`, `crime`, standing | a kill counter with a deadline |
| **Convoy escort** | Phase 15's escort-for-hire, whole | pay from the faction, not the ship |
| **Picket** | the interdiction corridor, whole | a named target instead of a random hunter |
| **Strike** | `damageNpc`, blockade shortfalls | standing loss with the *victim* faction |

**Rank is standing, relabelled.** `standingLabel` already bands −100..100 at
−40 / −10 / +10 / +40. Those bands become the rank ladder, so there is no
second number to keep in sync and no way for your rank and your standing to
disagree. Strike missions are the ones that cost you elsewhere: taking a
faction's flag means taking their enemies, and that has to show up as a
number going down somewhere else on the same screen.

**Closed to the wrong people, in words.** A pilot with a live bounty is
refused at the desk. A fugitive is refused at the door — `dockRefused`
already exists. A pilot carrying the pirate mark is refused everything, and
Phase 18 is about what they do instead.

---

## Phase 18 — the tow, the frame, and the mark

Three things that turn out to be one thing: a service you can hire, an abuse
of it, and what the galaxy does to you for the abuse.

### Taxi tow

**Fee-based: a tug comes out, grapples you, and moves you and your own ship
from where you are to where you want to be.**

The reason this earns its place is that the game already has a real dead end
and no answer for it. Run the reaction mass out and `main.js` says *"Reaction
mass exhausted — no thrust. Docking refills it free"* to a pilot who cannot
dock. That is a stranded save. The tow is the answer, and its price is the
punishment — which is a far better shape than a rescue that costs nothing or
a game over that costs everything.

- **Hired over COMMS (F4) or from a port**, so it reaches you where the
  problem is.
- **Fee scales with your all-up mass and the distance**, with a surcharge in
  lawless space — the same `crimeScore` that gates everything else. Being
  towed out of somewhere nobody wants to go is expensive, and that is
  correct.
- **In-system first.** Surface, orbit, or dead in the deep. An interstellar
  tow is a much more expensive second tier and should wait until the first
  one has been flown.
- **You keep the seat.** Time-compressed like a long burn, not a cutscene —
  the arrival rail's precedent, in the other direction. And because you keep
  the seat, **you can be interdicted mid-tow**, which is exactly what makes
  a tow through bad space a thing you think about rather than a fast-travel
  button.

### Framing a tug

A tug's hold is open to you while you are under tow. So you can put
something in it.

This is **Phase 10's sabotage run backwards**, and it uses the identical
machinery: `resolveScan` already searches a hold for contraband and already
treats a sabotage device as the worst thing it can find. Sabotage is you
carrying the device. Framing is you leaving it in somebody else's ship and
walking away clean — and when the tug is scanned at the destination, the
operator is the one who is charged.

**Being seen is the whole risk.** Planting goes through `crime()` like every
other act in this game, and the tug's own crew is a witness by definition —
a ship with a transponder, ten metres away, whose job is watching you. So
the frame does not turn on a die roll about whether it worked; it turns on
whether anyone can say it was you. That is the same bargain the rest of the
law runs on, and it needs no new system.

> **Framing somebody for a serious crime, and being caught at it, gets you
> marked as a pirate.**

Serious means the sabotage device, restricted arms, or anything that would
have carried a kill charge. Planting a bale of narcotics on a tug is
ordinary, ugly smuggling and is handled by the existing fine.

### The mark

**Not a new number.** The mark is a **standing floor**: standing with that
faction is set to −100 and *pinned* there. Trade does not move it. Contracts
do not move it. `bumpStanding` is allowed to compute a rise and is not
allowed to apply it, and the F5 standing readout says `MARKED` rather than
`HOSTILE` so the player can tell a bad reputation from a locked one.

Everything else falls out of machinery that already exists: `dockRefused`
closes the ports, `wantedHere` makes the patrols hostile on sight,
`stockAt`'s standing gates empty the yard, the mission board has nothing on
it, and Phase 17's naval station will not open the door.

### Earning it back — every pirate you kill, wherever you kill it

**A pirate kill counts from anywhere.** Nobody has to be alongside to see
it, and it does not matter whose space you were in. The road back to the law
has to be findable by a pilot who has just watched every port on the map
close, and a redemption you can only earn in the one place you are being
shot at is not a road, it is a wall with a door painted on it.

**This is not an exemption from "crime is witnessed, not omniscient" — it
is the other side of the same rule.** A crime needs a witness because it
depends on somebody *choosing* to report it, and everyone at the scene has a
reason not to. A dead pirate reports itself. `killNpc` already knows the
victim's id, class and faction at the instant it fires, and the ship that
died was carrying a posted bounty: the record is the pirate's own
transponder, logged by your ship and filed against every flag that had money
on them. One is a person deciding to talk. The other is a claim, and claims
do not need company.

- **+6 per kill; twelve lifts the pin**, and standing resumes at −40 —
  HOSTILE, the bottom of the ordinary ladder, with the ordinary climb ahead
  of you.
- **Credit goes to every faction currently holding a mark on you, at
  once.** The claim goes out on an open channel; it is not a favour done for
  one government. A pilot marked by three flags digs out of all three
  together, which is the difference between a chapter of play and a
  sentence.
- **One credit per pirate**, keyed on the ship's own id. Ships are already
  uniquely identified and already seed-derived — `manifestFor` hashes a hold
  off the registration — so the dedupe is a set in the save and costs
  nothing. It exists to stop a wing being farmed by re-entering the system,
  and for no other reason.
- **No cap per system and no cap per window.** Considered and dropped. A
  throttle would be friction reintroduced under a different name, and the
  thing that limits this should be *finding pirates*, which is already a
  game.

**What was cut here, and why nothing replaces it.** An earlier draft
required `witnessNear` to see the kill, on the theory that the function
which convicts you should also be the one that credits you. It was a
tidy symmetry and it was wrong for this mechanic: it made the only exit
from the mark run through the exact space where the marking faction's
patrols are hostile to you on sight, and it left a hole — a kill in the dark
counting for nothing — that read as a bug every time it happened. Removing
it takes the drama out of the bookkeeping and puts it back where it belongs,
on pirates being dangerous.

Raising twelve to sixteen to compensate was considered and rejected for the
same reason: compensating for a friction you deliberately removed just
re-adds it wearing a hat. **If the chapter plays too short, raise the
count** — it is one number, and it is the right lever to reach for.

**The mark still costs you plenty, and it costs you everywhere.** Ports
shut, yards empty, boards blank, patrols hostile. Hunting pirates while
carrying that is harder than hunting them clean, wherever you do it — you
cannot repair, you cannot refit, and you cannot sell what you take without
finding somewhere that will have you. That is the difficulty. It does not
need a witness rule on top of it.

**Say the intent out loud, because it is the design.** The mark does not
lock you out of the game and it is not a fail state with a timer on it. It
changes what the game is about for a while, and the way out is the one
honest thing you can do with a gun. Morality as a mechanic, not as a
punishment for having fun.

**Where this touches Phase 7.** Phase 7's bounty ladder, roadside
settlement, decay and scan-scaling all stay exactly as written. The mark
sits *above* that ladder: bounties are money and lapse, the mark is not
money and does not. A pilot can be clean of every bounty in the galaxy and
still be marked, and the two readouts must not be the same widget.

---

## Idea — black holes as galactic anchors

**The framing that makes this work: the killer is the radiation field, not
the gravity.** That is a better idea than a tidal death zone for three
separate reasons, and it is worth being explicit about all of them.

1. **Radiation is a scalar field.** Flux falling off as 1/r² from each
   anchor is a few multiplications per frame. Tidal gravity near a compact
   mass is the opposite: it makes `suggestedStep` shrink without bound and
   the frame dies.
2. **It is cheap to evaluate either way.** ⚠️ An earlier draft routed it
   through `Combat.addHeat` to reuse existing plumbing — see the section
   above for why that was wrong. Radiation acts on **crew and
   electronics**, not hull temperature, and wants shielding mass rather
   than a radiator. The field itself is still trivial to compute; only
   what it damages changes.
3. **It kills you long before the physics stops being true.** No
   relativistic regime, no invisible wall, no special case in the
   integrator. The exclusion zone enforces itself with a mechanic the
   player already understands from re-entry.

### Anchors give the galaxy terrain

`galaxy.js` currently places every star with **one** radial falloff —
`r = radius × rng.next()^0.62` — a single smooth gradient with no
structure in it. Anchors replace that with several density centres, each
holding a dense formation together.

What that buys, beyond looking right:

- **Dense formations mean short jumps.** More stars packed closer together
  is a region you can cross quickly and trade around richly, and
  `Galaxy.maxRange` already makes jump distance the binding constraint on
  travel. Density becomes a fact about how good a region is to work in.
- **The deep field is sparse and slow**, which makes range upgrades matter
  and gives the frontier a reason to feel remote.
- **Faction territory gets a shape.** Capitals near anchors, borders in the
  thin places between formations — and Phase 8's wars then spread along
  frontiers that mean something geographically.

### The core is a shortcut you have to buy your way into

This is the part that turns a hazard into content. A dense formation's
core is the *fastest* place in the galaxy to cross — many stars, all close
together — and it is lethal.

- **Radiation shielding** (internal slot, permanent) raises the flux you
  can sit in. Sized in **mass**, not throughput — shielding is literally a
  quantity of matter between the crew and the source.
- **Radiation sinks** (consumable, same family as heat sinks and therefore
  already legible) buy dwell time for one crossing.
- **A hold full of water**, which is the cheapest answer and available at
  every port that sells anything. See "Water is the shielding" above. A
  crossing paid for in cargo space rather than credits is the version of
  this a poor pilot can actually afford, and it should be.

So the core is a toll road: pay in equipment and consumables, get a route
that is shorter than going around. And nobody patrols it, which makes it
the smuggler's road as well — the police cannot afford the shielding
either, which is a much better reason for a route to be unwatched than a
flag saying it is.

**What this actually costs to build:** star placement gains anchors
(contained, `galaxy.js`), a radiation field function (trivial), the field
feeding `addHeat` (one call), two catalogue items, and — the real work —
the jump planner and the star map needing to *show* radiation, because a
route that kills you without warning is a bug rather than a hazard.

### Why the gravity itself is nearly free

Worth stating plainly, since it is the reason this is affordable at all:

> **At planetary distances, a black hole is gravitationally identical to a
> star of the same mass.** Same `mu`, same Kepler orbits, same everything.
> A ten-solar-mass hole with worlds at 1–20 AU needs no new physics at all
> — the generator already produces bodies with a mass and a radius, and
> this is one with an unusual ratio between them.

What changes is not the mechanics but the *place*:

- **No light.** Luminosity near zero means no habitable zone anywhere, so
  `classify` never returns terran or ocean and `developmentOf` gives every
  port an outpost. The settlement chain then does the rest by itself:
  low development → low `fHub` → and `buildGovernment` reads development,
  so **a black hole system comes out lawless without a line of code saying
  so.** That is the shape of a smugglers' haven, arrived at honestly.
- **A destination rather than a stop.** Somewhere you go *for* a reason —
  the grey market, a place to lie low while a bounty ages, a route nobody
  patrols — instead of somewhere you pass through.
- **The node planner finally gets a hard problem.** Slingshots around a
  compact mass are exactly what a manoeuvre planner is for.

**The two things that would break are both avoided by the radiation
framing**, which is why it matters:

1. **The integrator.** `suggestedStep` sizes steps from the local gravity
   gradient; near a compact mass that gradient goes vertical, the substep
   count explodes and the frame dies. On a machine where the predictor
   already costs 25 ms this is not a small risk.
2. **Newtonian physics stops being true.** Close in, orbital velocities
   reach a real fraction of c and the simulation is simply wrong.

Radiation kills at a radius far outside both problems, so neither is ever
reached. Nothing in `sim.js` needs to change.

The visual (an accretion disc, lensing) is a separate and much larger
question; lensing in particular is a real shader problem and should not be
what gates the feature. A black disc that occludes stars would do.

---

## Later — the player commands a fleet

The X-series shape: you stop being a pilot and become an owner. Recorded
now because several decisions already taken point at it, and it is much
cheaper to keep the door open than to cut one later.

**What already leans this way:**

- Ships are `spec` objects steered by `steerNpc`, and Phase 9's work makes
  that steering take an arbitrary target instead of always the player.
  A ship you own is a spec with your flag on it.
- Traffic already runs on rails with timetables and manifests, which is
  exactly what an owned trade ship needs — a route, a cargo, a schedule.
- Crew, wages and hull sizes (Phase 11) are the cost model a fleet needs
  to be a decision rather than an accumulation.
- Subfaction standing (Phase 11) gives an owned fleet somewhere to belong.

**The two hard questions, worth deciding before any of it is built:**

1. **What does the player DO while the fleet works?** X answers this with
   an order interface and a lot of waiting. This game's answer should
   probably be that a fleet is *leverage on the systems already here* —
   your freighters generate the shortfalls and supply shares that Phase 8
   turns into territory — rather than an idle-income button.
2. **Simulation cost.** Owned ships far from the player must ride rails
   like everything else, or the frame budget goes. That is already the
   project's answer to every "what happens off-screen" question, so it is
   not a new problem — but a fleet makes it load-bearing.

Not soon. But nothing in the current design should assume there is only
ever one ship with the player's flag on it.

---

## ✅ Two more ship types — MODELS IN, one mechanic outstanding

Both imported (39 models total, every one with a cockpit interior).

- **✅ Naval interceptor.** `navy` now flies `navy-m` instead of
  `capital-m`, which was wrong in a way that mattered: a navy that only
  fields capital hulls cannot be *dispatched*, and dispatched hunters are
  exactly what Phase 9 needs. The capital is now free for what it is
  actually for — the thing you are meant to run from.

- **⚠️ Rescue tender.** The hull, the class and the law are in; **the
  rescue mechanic is not.** Tenders fly a short local loop in any system
  developed enough to keep a crew waiting — 23 of 25 sampled systems have
  one. They are unarmed, and killing one costs 14,000 cr, more than
  killing a patrol cutter: a cutter came looking for you, the tender was
  on its way to help somebody. It is the one hull whose only defence is
  that everyone agrees not to.

  **Still to build — and this is the point of the ship:** running dry is
  a dead end. A stranded pilot has no resolution but a reload, which is
  the worst kind of failure state, one the game notices and offers
  nothing for. Calling a tender turns that into a transaction, and it
  composes with what is already here: priced by distance from a refinery
  (Phase 12's haulage), slow to reach the frontier, and an obvious thing
  for a pirate to impersonate.

  Putting the ship in the sky first is deliberate. Being able to *see*
  the service is half of knowing you can call it.

---

## Awaited: the medical ship

A new ship class is coming, with a model to follow. Nothing to build until
it arrives. Worth noting now that a medical hull has obvious hooks into
systems that already exist — a ship nobody should be shooting at, which
makes killing one a serious crime, and a plausible counter-contract runner
for the Phase 8 blockade (see the food-through-the-blockade note there).
Design that when the model lands, not before.

---

## Phase 7 — reputation and a forgiving police force (`combat.js`)

**Combat reputation.** Kills should move `Missions.standing`, not a new
number:

- Killing a **pirate** in a system: `+4` with the local faction, `+8` if it
  was actively hostile to another ship at the time. **No witness needed** —
  this was originally gated on `witnessNear()` for the symmetry, and Phase
  18 has since settled the rule for the whole project: *a crime needs a
  witness because it depends on somebody choosing to report it; a dead
  pirate reports itself.* The two must not disagree, or the same kill pays
  under one rule and not the other.
- Killing a **clean trader**: the existing bounty, plus `−15` standing with
  its faction.
- Killing **police**: bounty (6000), plus `−40`, which is straight to
  HOSTILE and closed doors.
- **Bounty vouchers**: killing a pirate that carries a bounty should pay
  out, claimable at a port of that faction. This is the loop that makes
  combat a career rather than a hazard.

**The police, under 1000 cr.** Today, `WANTED_HUNT = 800` makes patrols
attack outright. New shape:

| Bounty with this faction | Police behaviour |
|---|---|
| 0 | Routine scan (`resolveScan`, exists) |
| 1 – 999 | **Hail and demand payment.** Pull alongside, state the sum, offer settlement on the spot. |
| ≥ 1000 | Hostile — attack on sight (today's behaviour, threshold raised from 800) |

The demand reuses the pirate-demand plumbing (`sp.mode = 'demand'`,
`modeSince`, the comms panel's Y/N) rather than inventing a second
negotiation UI. Outcomes:

- **Pay** — bounty cleared with that faction, small standing hit, they
  leave. No 1.6× multiplier: settling roadside is the *cheap* path, and
  that is the mechanic. The multiplier stays for paying at a dock later.
- **Decline** — logged, they break off, bounty stands. One decline is not
  a war.
- **Run or shoot** — escalates. Fleeing an intercept adds to the bounty
  (`BOUNTY.evade`), and two escalations, or crossing 1000, flips them
  hostile.

**Scanning scales with the record.** A wanted pilot gets stopped far more
often than a clean one — that is most of what "wanted" should *feel* like
before anyone opens fire.

`resolveScan` today rolls `searchChance = max(0.12, 1 − crimeScore/100 ×
0.85)`, which at a typical `crimeScore` of 40 is **0.66** — two thirds of
every hold-alongside is a search. That is already high enough that there is
no headroom to raise it for a wanted pilot, so:

- **Drop the base rate** to something like `0.30` at mid-tolerance, so a
  clean run genuinely feels waved through.
- **Multiply by the record**: roughly ×2 with any live bounty, ×3 with
  fugitive status, clamped below 1. A fugitive is searched nearly every
  time a patrol gets close.
- **Make them close more often too.** Volume of searches is not just the
  roll — `Sim.updateEncounters` gates the scan on `scanHoldTime > 3` within
  `CLOSE_RANGE`. A wanted pilot should be *actively intercepted*: patrols
  that would otherwise pass by should vector in. The roll decides whether
  they search; the interception decides how often they are alongside at
  all, and both should move.
- **`spec.scanned` is one-shot per patrol.** Keep that, or a fugitive gets
  re-rolled every three seconds by the same cutter.

The consequence is the point: **running contraband while wanted becomes a
bad idea.** Clear the record first, or fly around the patrols. It also
gives the roadside-settlement mechanic above something to buy — paying
640 cr to make the searches stop is a decision with a number on it.

**Decay.** Elite never forgot. Small bounties should age out — a few
hundred credits of citations quietly lapsing over a long enough stretch of
game time keeps a career from being permanently poisoned by an early
mistake. Serious charges (kill, killPolice) never decay.

---

## Phase 7 — verification

Tests in this project are blind to layout — they can tell you a slot fits,
never that the yard is readable. So both halves:

**Automated** (`test/combat.test.js`, extended):

- Fit/unfit/sell round-trips; power and mass refusals with reasons.
- Save migration from a pre-slot blob.
- `buyHull` refusing an incompatible downsize.
- Debris: spawn count capped, despawn on expiry and on range, salvage
  reaching the hold through the scoop.
- Police: at 999 cr they demand and do not shoot; at 1000 they attack;
  paying roadside clears the bounty; fleeing escalates.
- Scan rate: clean pilot searched rarely, fugitive searched nearly always,
  same `crimeScore`; and the clamp holds at the top end.
- Reputation deltas for each kill class.
- `manifestFor` is stable across two generations of the same seed, differs
  between systems for the same spec id, and stops being derived once the
  hold has been robbed.
- Laser power: a C3 beam refuses to fit a Talon; fits a Kestrel and leaves
  it unable to also run a shield.
- Beam heat: C3 beam held down on a bare hull crosses `HEAT_LIMIT` in
  under 4 s, and never crosses it with a heat shield fitted.
- Mining laser does not register as `armedThreat`, and cannot reach a
  contact holding standoff.
- Asteroid fields regenerate identically from the same seed, and rock
  count near the player stays bounded.
- Stock: a `cold`-standing pilot is refused Class 3 at a developed port
  and told why; a wanted pilot is refused weapons entirely there but
  served at a `crimeScore ≥ 60` port.
- Muon cannon draws no pillar in vacuum and a full one inside an
  atmosphere, and its pierce lands on hull with a full shield up.
- Bootleg cook-off: failure rate rises with heat; jettisoning the rack
  inside the window saves the hull; a cook-off destroys that hardpoint and
  shows up on the repair bill; the same batch hash gives the same crate
  quality on a reload.

**By eye, in the running game** (the browser cache trap applies — hard
reload or the old bundle will lie to you):

- Fit a shield you cannot power; read the refusal.
- Name the ship something with a space and an apostrophe; confirm no key
  leaks to the flight controls.
- Kill a freighter at close range and fly through the debris field.
- Kill one at 40 km and confirm the shards are cheap enough not to hitch.
- Accumulate ~600 cr of fines and let a patrol find you.

**Known hazard — narrowed, still open.** Live localStorage breaks the
slipspace corridor section of `render.test.js` (not `slipspace.test.js`,
which never loads `save.js` at all). Two recorded symptoms: the charge phase
never advances, and drawing deep space reads `.mu` off undefined.

What is now known, from reading:

- **The second symptom is a real null-dereference and it is fixed.** The NAV
  panel's "surface gravity" row read `dom.mu` where `dom` is a chain of
  fallbacks ending in `G.sys.root`, in the branch that runs when the ship is
  neither orbiting nor docked. It reads `—` when it does not know. Two
  sibling cases were hardened at the same time: `dropCruise` tested
  `dom.mu > 0` *after* already dereferencing `dom` twice, and
  `orbitalFrame` now falls back to the root.
- **The first symptom is NOT explained yet**, and one obvious theory is
  wrong: the interstellar locale is deliberately an ordinary system holding
  one star, precisely so `dominantBody` keeps answering (see
  `Gen.interstellarSystem`), so "there is no dominant body out there" is
  false. Do not spend time on it.
- **The likeliest remaining mechanism is state leaking between runs.**
  `boot()` calls `newGame(seed)` and then, if `Save.load(seed)` returns
  anything, `Save.restore` — and with storage live every dock writes a
  career. If the store is genuinely persistent under node (recent versions
  ship a real Web Storage), a save from a *previous run* is present at boot,
  which would make the failure depend on run history rather than on the
  code. That would explain why it reads as nondeterministic and resisted
  diagnosis. **Check first:** print `typeof localStorage` under plain node,
  and whether `fakeStore` is the only thing `save.js` ever sees.

Everything above is reading, not running — Desktop Commander was down. The
fixes are unverified.

---

## Suggested order

1. ~~Slot model, laser catalogue, migration, tests.~~ **✅ Done.**
2. ~~F5 page: text input primitive, identity, yard rewrite with port
   stock.~~ **✅ Done.** Scrolling and per-port yard titles too.
3. Fire groups and the mouse, plus FLIGHT-CARD. **Weapon heat lands here** —
   the heat-sink plumbing is already in and waiting for it, and until it
   arrives both the Class 3 beam's drawback and the whole heat-sink item
   are inert.
4. Debris and salvage, pirate holds from the registration, and the
   ejected heat sink as a real object.
5. Asteroids, mining, fuel scoop, grappler.
6. Piracy reaching the economy — shortfalls, dead routes, healing.
7. Reputation and police.
8. Blockade and worlds changing hands. Not before 6 has been played with.
9. Who hunts whom — pirate opportunism, NPC-on-NPC robbery, naval hunters.
10. Mission board: sabotage, `desc` field, DESCRIPTION button, 240-char cap.
11. Drives (Phase 16) — the torch ladder first, the perforation ladder
    second. They share a slot table and nothing else.
12. Naval stations and the military board (Phase 17). Wants 7 and 10 first:
    a rank ladder built on standing needs the standing to mean something,
    and a military board built before the text discipline inherits the
    sprawl.
13. Taxi tow (Phase 18's first third). Independent of everything, and it
    closes the stranded-save dead end on its own.
14. Framing and the pirate mark (the rest of 18). Wants 10's sabotage
    device to exist — the frame is that device pointed the other way.

**Do the play report before any of this.** Five of its six items are an
afternoon each, they are all "say a thing the game already knows", and
every phase above adds another thing the game will know and not say. The
contract card in particular should land before the military board, or Phase
17 ships four new mission types that resolve as silently as the three
existing ones do.

**Phase 16 before Phase 17.** A naval station's first real reward is access
to hardware, and until the drive ladder exists the only hardware to gate is
the gun catalogue — which makes rank a discount rather than a door.

**Phase 16's torch half wants Phase 5's heat sinks played with first**,
which they now can be: continuous drive heat is the thing that makes a heat
sink matter to somebody who never fires a shot, and tuning that against a
thermal system nobody has flown yet is guessing twice.

Phase 10's text discipline is small and independent — worth doing early
and out of order, because every later mission type inherits it and
retrofitting a board that has already sprawled is worse.

Phase 9 wants Phase 6 first: an off-screen robbery and an economic
shortfall are the same event, and building the AI before the economy can
record it means building it twice.

Phases 3 and 4 are the ones that will feel like progress; 1 is the one
that makes them possible. Phase 5 depends on 4 — mine fragments *are*
debris shards, so building debris first means mining is mostly a laser and
a generator rather than a whole new subsystem. Phase 6 is last because it
is the only one that needs everything else in place to tune against.

**If you want to feel it sooner:** do 1 and 3 first, with the nine lasers
fitted by hand into slots and no yard UI at all. Flying a Kestrel with a
beam on mouse 1 and a pulse on mouse 2 answers the question the rest of
the plan is built on — whether the delivery-variety split is fun — before
any of the interface work is spent on it.
