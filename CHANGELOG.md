# Changelog

Alpha revisions of Procedural Space Game. Newest first.

Each release gets: **Added** (new things you can do), **Changed** (things
that behave differently than they did), **Fixed** (things that were wrong),
and **Saves** (whether an existing career survives). That last heading is
not optional — a player who has flown a seed for a week deserves to know
before they update.

---

## Unreleased — alpha 5 (in progress)

Outfitting, weapons, and the law. See `PLAN-COMBAT-OUTFITTING.md` for the
full design and the phases still outstanding.

### Added

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

  The plumbing (`Combat.addHeat`) is in and tested; weapon heat itself
  arrives with the fire-group work, and the ejected sink becomes a real
  tumbling object with the debris system.

- **Every item has a sales pitch** — the yard's own copy, shown after the
  numbers on any line you can actually afford and fit. Where a pitch is
  unflattering that is deliberate.

- **Ports stock different things.** Development gates what is on the shelf,
  standing gates whether they will sell it to you, and a lawful port will
  not arm someone it wants. Locked lines are *drawn, with the reason*, not
  hidden: "needs WARM standing with the Halden Combine" reads as a goal
  where a missing row reads as a bug.

### Changed

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

### Saves

**Existing careers load, with their gear.** The save version is
deliberately *not* bumped: `readSlot` and `load` discard any payload whose
version does not match exactly, so a bump would not migrate old saves, it
would delete them. The change is additive — a `fit` map is written
alongside the four legacy weapon fields, and `Combat.migrateFit` rebuilds
a fit from those fields when `fit` is absent.

A migrated ship keeps everything it owned even if the new budgets would not
strictly allow it. Confiscating something a player already paid for because
the rules changed underneath them is the worst possible introduction to a
new system.

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
  `DESIGN-NOTES-WEAPONS-AND-BEACON.md`, a laser's tier is now what it
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
