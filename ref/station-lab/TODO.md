# TODO — handoff

State of the project and what's left, for a fresh instance picking this up.

## What exists

| file | contents |
|---|---|
| `index.html` | viewer + HUD: ship class buttons, station buttons, S/M/L, faction accent swatches, ID/reroll, flight readouts, GLB exports |
| `ship.js` | 13 ship classes × 3 size marks (39 variants) |
| `station.js` | 4 orbital station patterns × 3 sizes |
| `station-tests.js` | runnable geometry checks for stations |
| `STATIONS.md` | parts guide for the station models — read this first |
| `three-d-stage.js` | viewer shell (do not edit) |

Ship classes: trader, freighter, police, shuttle, capital, courier, fighter,
tug, liner, hydrogen freighter, escape pod, tender, navy.
Station patterns: cylinder, spine, ring, cradle.

## Blocking bugs

None. `checkAll(STATION_TYPES)` reports 0 problems for all 4 patterns × 3 sizes.

### Fixed since last handoff

**Ring mirror offset.** The mirrored upper ring was placed at `halfH + gap`,
which put its ring plane at the joining trunk's mid-height and ran the ring
straight through the heavy berth. The offset now derives from the trunk:
`2 * halfBox.max.y + gap`, so the mirror beds 1.2 into the trunk's crown, the
same as the lower half does at the bottom. Ring L now reads lower 0–19.2,
trunk 18.0–35.6, upper 34.4–53.7, heavy berth 23.5–30.2 — clear of both halves.

**Bay conveyor rollers.** Rollers sat at a hand-written `convR + 0.32`, sharing
0.05 of volume with their bed — bbox contact without attachment (house rule 5).
Both thicknesses are now named (`bedThick`, `rollerThick`) and the offset is
derived from them, giving a 40% seat. `checkConveyorSeating` in
`station-tests.js` asserts it from now on rather than the check being run ad hoc,
measuring in the **bed's local frame** — every bay is rotated to its bore facet,
and a world-AABB overlap test reported 99% seating where the truth was 40%,
passing a roller floating a full unit clear. It now fires at 0.06 of
displacement; `station-check.html` runs that sensitivity sweep.

**`LINE-NOT-AT-GATE` on all twelve.** This one was a bad check, not bad
geometry. The transfer line is deliberately routed at ground level and reached
by the lift shaft, so measuring roller-to-gate distance was measuring the
shaft's height. `checkTransferLine` now anchors to `transferLiftCar` where a
lift exists and to the gate where it doesn't, and separately asserts that the
shaft reaches the gate it serves.

**Ring detached components.** No longer reproduces — `checkConnectivity`
reports no islands beyond the hall and its line. The earlier count predated the
berth-clearance pass.

## Design language

Everything built so far follows these rules. They came out of the user's
direction over many rounds — hold to them rather than re-deriving.

### Silhouette

- **Boxy and flat-faced.** Hulls are assemblies of rectangular blocks, stepped
  and chamfered, not smooth swept forms.
- **Low-poly and faceted, deliberately.** Curved things get few segments:
  station bore 12 facets, berth tubes and joining hub 8, dish bowls 8×3,
  pressure spheres 8×5. Nothing reads as round. If you raise a facet count
  anywhere, raise it everywhere or the two halves of the project stop
  matching. Ships run 7k–12k triangles, stations 7k–13k.
- **Trapezoidal prisms** where a shape needs to taper — wedge caps, bridge
  pods, sloped noses. The wedge's long face rakes *forward*.
- **Size marks are different hulls, not scaled copies.** S/M/L within a class
  differ in structure: section count, fin arrangement, armament, whether they
  carry a dorsal rib at all.
- **Asymmetry is allowed and sometimes wanted.** The navy S/M bridge is half
  width and right-justified, with a sensor suite filling the other half — that
  was a deliberate request. One-sided appendages (outriggers, comm booms,
  port-side ribs) are exempt from symmetry checks.

### Colour and markings

- Hull greys and grey-blues; **mustard** (`#d6c24a`) is the accent throughout.
- **Engine accents are mustard on every ship**, not faction-coloured.
- **Yellow/black caution striping** around exhausts, moving parts, door
  pockets, berth sills and transfer lines. Tile it to a whole number of chips
  per edge so nothing straddles a corner.
- Faction colour appears as **one badge per ship** — a painted emblem or a
  transponder lamp array, never both.
- **Navigation lights: green to starboard, red to port.** With the nose at +Z
  and up at +Y, starboard is −X. Stations carry them at every aperture too.
- Lit and dark **windows mixed**, with which ones are lit derived from the ship
  or station ID, so the same ID always looks the same.

### "Used space"

- Visible **service clutter** everywhere: greebles, conduits, pipework, bottles
  in clamps, hoses on reels, crates, drums, access hatches, sensor blisters,
  antenna masts. Every hull carries at least one antenna.
- **Painted decal panels** on decks and flanks — but they must lie flat on a
  level patch of real skin, never bridging a slope.
- Interiors are dressed: parking stands with painted outlines and clamps,
  gantry cranes, strip lighting, scuffed decking, and **advertisements for
  component upgrades and ships**.

### Function must be legible

- Things that move are **modelled where they would actually be**: doors in
  recesses cut into the structure, gear in bays with hinged plates, dishes on
  booms that stow, blast doors in pockets.
- Behaviour lives in `userData` for the game layer to drive — nothing
  self-animates. See the airlock contract in `STATIONS.md`.
- **Believable engineering.** A berth hung on a stick, a turret on a plate
  thinner than its own ring, a rib floating over a gantry — all rejected.
  Structure carries load: trunks, sponsons, gussets, braces, shoes.
- **A ship has to be able to fly in.** Openings are sized from the real fleet
  envelope and their approach corridors kept clear. This is the single rule
  that broke most often.

## Not started

These were specified but never built. Follow the design language above.

### Planetside — underground ports (3 variants)
- Runway type, and a mountain type with doors in the rock face.
- Berths for all three size classes, same fleet envelope as the stations
  (see `STATIONS.md` — reuse the `BERTH` constants, don't invent new ones).

### Planetside — domes (3 variants)
- Access airlock with a door that stays **closed until the player requests
  docking clearance**, and again before launch clearance.
- Vertical landing shafts.
- Reuse the airlock `userData` contract from `station.js` so the game layer
  drives all gates the same way.

### City spaceports
- Sit next to cities, with greenhouse domes **and buildings inside the domes**.
- Billboard displaying the assigned docking designation (the `billboard()`
  helper in `station.js` derives its glyph pattern from the label string).

### Interior dressing for all of the above
Advertisements for component upgrades and ships, decals and greebles so spaces
read as used. `internalHall()` in `station.js` is the reference implementation.

## House rules learned the hard way

Read these before touching geometry — each one cost several rounds.

1. **A berth's aperture normal is the group's local +Z.** Getting this backwards
   made the hall-placement code choose the *worst* face instead of the best.
2. **Never size an opening by eye.** Berth apertures derive from the measured
   fleet envelope (`BERTH` in `station.js`). The hull doesn't shrink, so the
   shell grows.
3. **Test the clear gap, not the aperture.** Doors positioned at a fraction of
   the opening left a fixed 22% gap however large the throat grew.
4. **A flat plate cannot lie on a slope.** When decals wouldn't sit flush on the
   fighter's wedge nose, the fix was making the nose flat-topped — not another
   placement rule. Sample all four edges of a plate, and on the *same* host.
5. **Bounding boxes lie about sloped and swept shapes.** Wingtip nav lights,
   hull decals and greebles all "passed" bbox contact while hanging in space.
   Raycast against real triangles.
6. **Derive positions from measured bounds, never from a second fraction.** Any
   part positioned by `len * 0.44` while its host moved to a different basis
   drifts apart — this caused the drogue lamp, the recovery beacon, the comm
   dish and the bow greebles, all the same bug.
7. **Anything placed mid-build can be invalidated by parts added later.** The
   settle pass in `ship.js` `finalize()` exists for exactly this.
8. **Check your checks.** Several "0 problems" results were wrong: comparing a
   mesh with itself, a field's width against a throat's depth, host lists too
   narrow, and a mount excluded from being a host because its name matched the
   detail pattern. When a result looks too clean, verify the assertion fires.

## The docking route is not built yet

`checkDockingRoute` in `station-tests.js` walks the whole path — aperture →
inner gate → lift car → conveyor → hangar stand — sweeping the berth's own
Throat volume (shrunk 10%, so it stays tied to the fleet) along each leg. It is
exported and run by `station-check.html`, but deliberately **not** in
`checkStation`, because nothing satisfies it yet and it would gate every commit.

Result on first run: **every berth on all twelve stations is blocked**, 3–9 per
station, and the blockers are primary structure, not clutter:

| pattern | blocked by |
|---|---|
| cylinder | `shellOuter`, `shellInner`, the landing decks |
| spine | `keel`, the berth blocks, neighbouring door houses |
| ring | `berthPylon*` and the under-pylon clutter |
| cradle | `spine`, `trussL`, truss braces, the light tubes |

This is the measurement behind the decision to put the **hangars inside the
hulls**. The berths currently open into solid structure a metre or two inboard
of the gate; the lifts and transfer lines were routed around the outside of
that structure to an outboard hall, which is why the path was never clear. Each
pattern's shell has to grow to enclose a four-berth hangar, and the route has to
be cut through it — then this check goes into `checkStation` and stays there.

## Cradle doors look broken — hypothesis (regression, this session)

Mechanically they are fine: 3 bays, 10 leaves, all sealing, blast leaves
meeting exactly on the centreline at ±3.83. `checkDoorClosure` passes 12/12.
So the fault is visual, and the likely cause is the throat rework in this
session: `Throat` was a SOLID block of matDeep and is now an invisible
reference volume with thin plates around it. On the cylinder that opened up the
corridor as intended. On the cradle the berths are embedded in `*Block` and the
light tubes, and the solid throat was probably also doing duty as the bay's
visual backing — with it gone you may now see straight through the bay into the
truss, or the 0.4 plates may z-fight with the surrounding block.

First thing to try: set `throat.visible = true` for one build and compare. If
that is it, the fix is not to restore the solid block (it buries the interior
and hides the corridor) but to give the cradle's berths their own backing —
either seat the plates against the block or thicken `ThroatBack`.

## Normal traffic transits internally too

NPC market traffic uses the same route as the player, inside the station. This
changes an assumption baked into what exists: one lift, one transfer run and
four hangar stands were sized for a single arrival at a time. Concurrent
transits need queueing — hold points on the approach, a lift that is a resource
with occupancy rather than a static mesh, and stand assignment. Worth settling
BEFORE the remaining three patterns are rebuilt, because it may change how many
lifts each hull needs, which is the thing being consolidated in TODO 17.

## The cradle doors and the cradle routing are ONE defect

`checkDoorSweep` (station-tests.js) sweeps each leaf from stowed to sealed and
names anything it passes through. The cradle's heavy leaves close straight
through `spine` (1.85 shared volume), `trussL` and `hangarShellL` (4.41); the
S/M leaves close through `lightTubeL` (3.86). `checkDoorClosure` still calls
them sealed, and it is right to: the arithmetic seals, the geometry does not.
That is why they read as broken.

The blockers are the same meshes `checkDockingRoute` reports for those berths.
Berths buried in structure cannot open their doors OR route a hull out; fixing
the routing fixes the doors, and there is no separate door bug to chase.

Current state, from station-check.html:

| pattern | route | sweep |
|---|---|---|
| cylinder S/M/L | 0 | 0 |
| spine S/M/L | 5 / 7 / 9 | 18 / 26 / 34 |
| ring S/M/L | 5 | 18 |
| cradle S/M/L | 3 | 12 |

Caveat on the sweep counts: some hits are the berth's own mounting block
(`berthSM0LBlock`, `berthPylon0`), which arguably belongs in `ENCLOSURE` — a
leaf sliding into its own mount is fine. The unambiguous failures are `spine`,
`hangarShellL` and `lightTubeL`. Exempt mounts before reading the numbers as a
target.

`checkDoorSweep` is deliberately OUT of `checkStation`, same as
`checkDockingRoute`: both are known-failing on three patterns and would gate
every commit. Both go in permanently once those patterns are rebuilt.

## NPC traffic transits internally too (planned)

Market traffic uses the same route as the player — enter, lift, hangar stand.
Consequences for the rebuild, worth settling BEFORE the other three patterns
are built: stands need occupancy (four per hangar), the lift needs to be a
resource that one hull holds at a time, and door requests need a queue rather
than an unconditional grant. The route waypoints `checkDockingRoute` computes
are what both the player's tractor and NPC pathing should read, so they belong
in `station.js` as data rather than being duplicated in flight code.

## Cradle: raise the central berth (specified, not built)

The centre berth is occluded by the spine and truss — `checkDockingRoute`
reports `berthL` blocked by `spine`, `trussL`, `trussBraceL2` and ~24 more, and
`berthSML` blocked by `lightTubeL`, `tubeSpurL`, `tubeRibL0`.

Intended shape: lift the central berth ABOVE the two flanking berths on a
protruding stalk, then drop an elevator from it down to the same level as the
enclosed conveyor feeding the hangar. In elevation that reads as an inverted T
with a protrusion — an F seen from one side. The two side berths keep their
current height and feed the same conveyor level, so all three converge on one
run rather than three.

Build it the way the cylinder was done, in this order:

1. Raise the central berth and give it its own stalk clear of the spine. Derive
   the height from the truss's actual top, not a tuned number.
2. One lift from the raised berth down to conveyor level. Model the car at its
   idle (down) pose and give the shaft enough Z depth to reach the inner gate,
   or `checkTransferLine` reports `LIFT-NOT-AT-GATE`.
3. Nest the hangar inside the structure (see TODO 17) and route all three
   berths into it.
4. Keep lamps and clutter OFF the descent column and out of the swept hull
   envelope — that mistake was made twice on the cylinder and caught both times
   by the route check, not by eye.

Run `checkDockingRoute` after each step. It is the sanity check being asked
for: it sweeps the berth's own throat volume along aperture → gate → lift car →
conveyor → hangar stand and names whatever it hits. Cylinder is at 0; spine
(5–9 per size) and cradle (3) and ring (5) are not.

## Docking permission, fines and impound (planned)

Door opening is not a button in the finished game — it is a **permission** the
station grants or refuses:

- Probability of the station opening for you scales with **faction score**. A
  score of 0 puts you at the back of the queue rather than refusing outright.
- Landing without permission is a **crime** and draws a **fine**.
- Unpaid fines let a station **impound** the ship.

Bearing on what exists now: `setStationDoors` / `setBerthDoors` are the
mechanism and take a plain 0..1, so the permission model sits above them and
they need no changes. Two gaps stand in the way (TODO 20, 23): there is no
interlock, so a hull can cross a sealed aperture, and nothing yet distinguishes
docking permission from launch clearance — an impound is exactly the case where
the doors stay shut on the way *out*, so launch clearance has to be its own
state, not a re-use of the docking grant. The Comms button is currently an
unconditional grant and is a demo, not the mechanic.

## Verification

Stations: `checkAll(STATION_TYPES)` from `station-tests.js` — currently 0
problems across all twelve. `station-check.html` runs it in the browser and
prints the ring's vertical layout and conveyor seating alongside, which is how
the three bugs above were pinned down; open it after any geometry change.

Ships have no test file yet — the sweep was run ad hoc in the viewer console.
Worth extracting to a `ship-tests.js` alongside the station one, asserting:
single connected component, grounded, `cockpitGlass` present and unoccluded,
cockpit interior inside the hull, one faction badge, no weapon interpenetration,
no muzzle firing into the ship, nav lights on real surfaces (green to starboard
at −X, red to port), and every detail piece sharing solid volume with a
structural host.
