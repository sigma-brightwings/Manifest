# Plan — outfitting, weapons in the controls, debris, and the law

Scope: slot-based outfitting, fire groups on the mouse, salvageable polygonal
debris, combat reputation, and a police force that fines you before it kills
you. Plus pilot/ship identity on the F5 page.

---

## Status

Checked against the source, not against memory. Everything below was
verified by loading the modules and inspecting what is actually there.

### Built ✅

| | Where |
|---|---|
| **Phase 1 — the slot model** | typed slots, power and mass budgets, nine lasers, three reactors, sell-back at 45%, `canFit` reasons, `replanFit` on hull change, `migrateFit`, save persistence |
| **Phase 2 — the F5 page** | text entry primitive, pilot/ship/registration editing, yard rebuilt in three tabs, `stockAt` port filtering, scrolling with wheel + scrollbar, yard named for the port's role |
| **Heat sinks** *(part of Phase 5)* | launcher, charges, `armSink`, `addHeat`, `updateSink`, ejection record |
| **Hull roles** *(not originally a phase)* | `liner` traffic class, `navy` patrol class, hull assignments, `killNavy` / `killLiner` charges, navy as a piracy deterrent |
| **The settlement chain** *(not originally a phase)* | `Eco.setPressure` 0.25–3.0, `Eco.galaxyProfile`, byte-identical at 1.0, tested |
| **Wider habitable zone, more planets** *(not originally a phase)* | 6–12 planets, optimistic HZ, tighter orbit spacing; 2+ habitable worlds in half of systems |
| **Model pipeline** *(not originally a phase)* | `glb2hulls` splits cockpit interiors from hulls and emits the canopy box; 33 redesigned models imported |

### Built but inert ⚠️

- **Heat sinks have nothing to absorb.** `addHeat` is written and tested,
  but no weapon puts heat into the hull yet. Phase 3 closes this.
- **The grey market has no goods.** `stockAt` honours a `grey` flag and
  **zero catalogue items set it**, so that branch is unreachable. The
  bootleg seeker and its cook-off do not exist.
- **The muon cannon does not exist** as an item.

### Not started ☐

Phases 3, 4, 5 (apart from heat sinks), 6, 7, 8, 9, 10, 11, 12, 13.

**One correction to an earlier claim in this document:** the seed-discipline
fix is *not* done — `combat.js` still generates a pirate's improvised
manifest with `Math.random()`. That lands with Phase 4.

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

## ⚠️ Reconciling with `DESIGN-NOTES-WEAPONS-AND-BEACON.md`

That document post-dates this plan and revises part of it. Read it
alongside this section; where they disagree, the disagreement is listed
here rather than silently resolved.

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

### ⚠️ The grey market — armed, cheap, and incurious — NO ITEMS YET

*`stockAt` already honours the `grey` flag, but no catalogue entry sets
it, so this branch is currently unreachable. The bootleg seeker below and
its cook-off are design only.*

A high-crime port (`crimeScore ≥ 60`) sells to anyone, asks nothing, and
what it has is junk. No standing check, no wanted check — this is where a
fugitive rearms, and that is the point.

| Item | Character | Price |
|---|---|---|
| Grey C1/C2 Intermittent | Reliable enough. The grey market's staple — burst lasers are simple to build badly. | ~65% of list |
| Cheap heat-seeker | Shorter range, poor lead solution, **loses lock** on a hard turn. Sold by the crate. | ~200 cr |
| Salvaged Class 2 | No warranty. Higher heat than spec, occasionally fails to cycle. | ~55% of list |

The drawbacks must be *real tradeoffs, not just worse numbers* — a cheap
seeker that costs a fifth as much and hits two thirds as often is a
legitimate purchase, especially in volume. One that is simply bad is a
trap, and a trap is not a decision.

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

**2. It takes the hardpoint, not a slab of hull.** A cook-off destroys the
weapon in that slot and deals modest hull damage. That is a repair bill —
`repairCost` already models exactly this — rather than a run-ender, and it
makes the true price of bootleg ordnance legible: you are gambling a
hardpoint, not your life.

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
- **NPCs fly it too.** Pirates and low-end hostiles should carry the same
  grey-market seekers, with the same failure roll. Watching a pirate's
  rack cook off on its own hardpoint is excellent, and it rewards a player
  who has learned to recognise who is flying cheap gear.

**The geography this creates** is the whole point: the best gear requires
being *liked* somewhere developed, and being liked is exactly what a
career of piracy costs you. Go outlaw and you can still arm yourself —
just never well. That is the same bargain the crime system already runs
on, extended to the arsenal.

### Implementation

Four fields on each equipment entry, and stock becomes one filter:

```js
minDev: 0.70, minStanding: 10, minCrime: 0, grey: false
```

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

## Phase 3 — weapons in the control scheme (`main.js`)

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

## Phase 4 — death, debris, salvage (`combat.js`, `sim.js`, `render.js`)

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

### A pirate's hold is a function of its registration

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

### ✅ Heat sinks (utility rack + consumable) — BUILT, waiting on Phase 3

*The rack, the charges, `armSink`, `addHeat` and the ejection record all
exist and are tested. Nothing generates weapon heat yet, so a sink
currently has nothing to absorb — Phase 3 is what switches it on. The
ejected block is recorded in `G.sinkEjections` but is not yet a physical
object; that is Phase 4.*

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

**The chain of reasoning is unusually tight:** neutrinos cannot be blocked
or shadowed, which makes them useless as a weapon and perfect as a signal.
Detecting them needs supernova-scale output, so the transmitter is
necessarily enormous and fixed — never shipborne. Attaching it to a pulsar
supplies that output *and* an unspoofable clock, which is what makes a
treaty-enforced neutral installation credible: **no faction has to trust
another, only that the pulsar keeps spinning.**

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

### Scale discipline

This is a large feature with a lot of surface — economy, slipspace,
factions, missions, comms. It should be **one installation in one
region**, not a category of object, until it has been played. And it
depends on Phase 8 (control) and Phase 12 (a reason to be crossing that
region at all) being real first.

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

## Awaited: two more ship types

Models to follow. Both fill gaps the systems already have:

- **A naval variant of the police interceptor.** The `navy` class
  currently flies the capital hull, which is right for a warship and wrong
  for a patrol — a navy that only fields capital ships cannot be
  *dispatched* the way Phase 9's hunters need to be. A naval interceptor
  is the hull those hunters should arrive in, with the capital reserved
  for something you are meant to run from.

- **A fuel and repair tender.** This one earns its place mechanically
  rather than decoratively: **running dry is currently a dead end.** A
  stranded ship has no resolution but a reload, which is the worst kind of
  failure state — one the game notices and offers nothing for. A rescue
  service turns that into a transaction with a price, and it composes with
  everything nearby: expensive far from a refinery (Phase 12's haulage),
  slow to arrive at the frontier, and a legitimate thing for a pirate to
  impersonate.

Neither is urgent. Both are more useful than the medical ship they
replace, because each answers a question the simulation is already asking.

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
  was actively hostile to a witness ship. Being *seen* doing it should
  matter — the same `witnessNear()` that convicts you can also credit you.
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

**Known hazard:** `save.js` changes touch localStorage, and there is an
open, undiagnosed bug where live localStorage breaks the slipspace corridor
tests. Expect it; don't chase it into this work.

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
