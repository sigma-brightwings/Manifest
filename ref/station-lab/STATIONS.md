# Station models — parts guide

How the station meshes in `station.js` are organised, what each named part is
for, and which behaviours the game layer is expected to drive. Ships live in
`ship.js`; this file covers `STATION_TYPES` only.

## Building one

```js
import { STATION_TYPES } from './station.js';

const station = STATION_TYPES.spine.build('OS-014', 'M');   // (label, size)
```

- **label** — the assigned docking designation. It seeds the pseudo-random
  dressing *and* drives the billboard glyph pattern, so the same label always
  produces the same station.
- **size** — `'S' | 'M' | 'L'`. Changes bay count and overall span. It does
  **not** change berth apertures: a hull doesn't shrink, so the openings are
  fixed to the fleet envelope (below).

Every builder returns a `THREE.Group`, centred on its own footprint with
`min.y === 0`, so it can be dropped straight onto a ground plane.

`station.userData.label` carries the designation back out.

## The four patterns

| key | shape | character |
|---|---|---|
| `cylinder` | hollow drum, both ends open | fly *into* the bore; bays open off an internal landing deck |
| `spine` | long keel, berth blocks either side | volume traffic; heavy berth on the forward end |
| `ring` | square torus, doubled and mirrored | two rings joined by a hub, heavy berth between them |
| `cradle` | open truss with a clamshell hangar | yard station, not a trade hub; no pressurised rim |

## Berth apertures are sized from the fleet

Measured across all 13 ship classes:

```
S  4.80 W × 3.58 H ×  8.80 L
M  5.96 W × 4.37 H × 10.61 L
L  7.06 W × 5.17 H × 12.31 L
```

S and M **share one aperture**, sized to the M envelope plus clearance:

```
shared S/M throat  6.56 × 4.97 × 11.81
heavy (L) throat   7.66 × 5.77 × 13.51
```

If you add a ship class larger than the current L envelope, the constants at
the top of `station.js` (`BERTH`, `CLR_*`) are the single place to change — the
shells are all derived from them.

## Anatomy of a berth

Each berth is a group named `<tag>` containing:

| part | purpose |
|---|---|
| `…Throat` | the bay volume itself. **Measure this** to test whether a hull fits. |
| `…Jamb L/R`, `…Lintel`, `…Sill` | the frame around the opening |
| `…SlidingDoorL1/L2/R1/R2` | shared S/M gate: two telescopic leaves per side, centre-opening, sliding outward. Closed, each side's pair covers half the aperture. |
| `…ForceField` | heavy berth gate. Holds the atmosphere in; a hull flies straight through it. |
| `…BlastDoorL/R` | heavy berth's mechanical backup, slides shut when threatened |
| `…DoorPocket L/R`, `…BlastPocket L/R` | recesses sunk into the structure that the leaves stow inside |
| `…DoorHouse L/R`, `…BlastHouse L/R` | structural volume containing each pocket. Guarantees a stowed leaf is inside the hull rather than proud of it. |
| `…DoorRail`, `…DoorRailLower` | upper and lower guide rails |
| `…InnerGate`, `…InnerSeal` | the airlock's inboard gate onto the transfer line |
| `…CycleLamp L/R` | airlock cycle indicators |
| `…NavLight L/R` | **red to port, green to starboard** — orientation cue on approach |
| `…NavHood L/R`, `…ApproachLamp L/R`, `…ThresholdMarker0-4` | approach lighting |
| `…PocketCaution*`, `…Caution*`, `…InnerCaution*` | yellow/black hazard striping |

### Airlock behaviour

`berthGroup.userData.airlock`:

```js
{
  outerGate: 'slidingDoors' | 'forceField',
  innerGate: 'InnerGate',
  controlsLockedUntil: 'outerGateOpen',
  outerCyclesOnlyWhenOccupied: true
}
```

The intended sequence, both directions:

1. Hull crosses the threshold into the bay.
2. Outer gate cycles shut behind it — **only** once the bay is occupied.
3. Bay pressurises; inner gate opens.
4. Transfer line carries the hull to the internal hall.

Launch runs it backwards on clearance, and **pilot control is withheld until
the outer gate is fully open** (`controlsLockedUntil`). Nothing in the model
animates itself — the leaves and field are static meshes at their stowed/open
positions, and the game layer is expected to drive them.

## Interior spaces

### `hall*` — the internal hall

The pressurised core hulls are moved to after cycling through an airlock, and
back out from on launch clearance. Built from separate wall **plates**
(`hallFloor`, `hallRoof`, `hallWallL/R`, `hallBackWall`) so the interior is
genuinely hollow.

It **berths four hulls at once**, on two ranks of two stands sized from
`BERTH.sm`, and every airlock gets its own `transferLiftShaft` /
`transferLiftCar` and its own `transferMain` run down to the ground transfer
deck and into the hall mouth, so the hall is the one place hulls arrive. It
carries the fleet's usual dressing — `hallSkinGreeble*`, `hallSkinPort*`,
`hallSkinDecal*`, `hallConduit*` and `hallJunctionCaution*` — plus a `hallApron`
meant to tie its face into the structure.

**Not yet true, despite the intent:** the hall does not actually abut. `off`
derives from the station's overall AABB (`before.max.z` etc.), and on the ring
that plane is set by the extreme corner nodes — nowhere near the hall's
footprint or height band — so the nominal 0.2 clearance is measured to empty
space and the hall floats ~1.8 clear with the apron touching nothing. It needs
seating against real structure found by raycast along `pick.dir` within the
hall's own y-band, the way `checkApproachCorridors` measures, and then an
assertion that the hall or its apron shares volume with a non-hall mesh. It is
also still face-mounted rather than central.

`attachHall()` measures every berth's outward normal and scores the four faces,
so the hall never sits in a flight path. It remains a separate connected
component by construction, which `checkConnectivity` allows by design.

Fittings: `hallStandOutline/Inner/Clamp/Number` (parking stands),
`hallCraneRail/Bridge/Hoist` (overhead gantry), `hallAdPanel/AdFrame`
(hoardings), `hallHallLight`, `hallGreeble`, `hallCrate`, `hallFloorDecal`.

The hall is placed on a face **no berth opens onto** — `attachHall()` measures
every berth's outward normal and scores the four faces, so it never sits in a
flight path. It is a deliberately separate structure linked by the transfer
line, so expect it to read as its own connected component.

### `transferMain*` / `…Conveyor*` — the transfer line

`transferMainBed`, `transferMainRoller*`, `transferMainRailL/R`,
`transferMainAdHoarding*`, `transferMainAdFrame*`, `transferMainCaution*`.

Runs from an airlock's inner gate to the hall mouth. On stations whose airlocks
sit high in the structure, `transferLiftShaft` / `transferLiftCar` /
`liftGuide*` drop to a ground-level transfer deck first — the line is routed
below berth height deliberately, so it cannot cross another berth's approach.

The hoardings along the run are the point of the layout: a hull under tow is a
captive audience. Ad materials are `adOrange` / `adGreen` — swap in real
artwork by replacing those materials or the panel geometry.

On the cylinder, each bay has its own `bay<N>ConveyorBed` / `…ConveyorRoller*`
/ `…ConveyorRail*` / `…AdHoarding*` running **inboard of the inner gate**, so
the ship crosses the threshold, the doors close, and only then does it meet the
rollers.

## Exterior

| part | purpose |
|---|---|
| `billboard*` | displays the assigned designation. `billboardGlyph*` blocks are derived from the label string; replace with real text rendering if you have it. |
| `…Designation` | per-bay designation plate |
| `skinGreeble*`, `rimGreeble*`, `keelGreeble*`, `yardGreeble*`, `ringGreeble*` | service clutter |
| `skinPort*`, `rimPort*`, `ringPort*` | lit / dark hull ports (`litPort` and `darkPort` materials) |
| `skinDecal*`, `rimDecal*` | painted panels |
| `approachBeacon*`, `cornerBeacon*`, `spineBeacon`, `mastBeacon`, `mouthLamp*` | navigation beacons |
| `endRing*`, `shellOuter`, `shellInner` | cylinder bore structure. Open-ended tubes (the bore is hollow) at **12 facets**, not smooth — the fleet is flat-panelled, so a round drum clashes. Bays snap to facet centres so plating sits flat on a panel rather than across an edge. |
| `ringRun*`, `ringNode*`, `hubSpar*`, `joiningHub`, `hubCollar*` | ring structure |
| `groundSaddle*`, `standLeg*`, `standShoe*`, `cradleArc*` | ground support for display |

## Materials

One shared palette, matching the ships: `stationHull`, `stationPanel`,
`stationDeep`, `stationAccent` (mustard), `hazardYellow` / `hazardBlack`,
`stationGlass`, `litPort` / `darkPort`, `forceField` (translucent, emissive),
`beaconRed`, `navGreen` / `navRed`, `billboardFace` / `billboardGlyph`,
`adOrange` / `adGreen`, `stationFitting`.

Materials are module-level singletons shared across every mesh, so recolouring
one recolours the whole fleet of stations.

## Running the checks

`station-tests.js` encodes every invariant below as a runnable check. Run it
after any geometry change:

```js
import { STATION_TYPES } from './station.js';
import { checkAll, checkStation } from './station-tests.js';

console.table(checkAll(STATION_TYPES));        // all 4 patterns x 3 sizes
checkStation(STATION_TYPES.ring.build('OS-1', 'L'));   // one station, full list
```

Each check returns an array of problem strings; empty means pass. The most
important is `checkApproachCorridors` — "can a ship actually fly in" — which
casts five rays per berth along the aperture's own normal over the length of
the hull that berth serves. Every blockage found during development (conveyor
rollers across bay mouths, hall walls in front of side berths, truss braces and
stand legs across a hangar mouth, clutter dressed onto mouth faces) was caught
by exactly that test.

`checkConnectivity` treats the internal hall and its transfer line as an
allowed second component, since they are deliberately a separate structure.

## Invariants worth asserting if you modify these

These are checked during development and are easy to break:

1. **Fit** — every `…Throat` exceeds the largest hull of the class it serves in
   all three axes.
2. **Clear gap** — the distance between `SlidingDoorL*` and `SlidingDoorR*`
   when stowed is ≥ the widest M hull.
3. **Leaf containment** — ≥90% of each leaf's volume lies inside a
   `DoorHouse` / `BlastHouse`.
4. **Approach corridor** — five rays per berth (centre plus four inset
   corners) along the aperture's own normal, over the served hull's length,
   hit nothing. Berth normal is the group's local **+Z**.
5. **Hall separation** — zero solid overlap between `hall*` meshes and any
   non-hall station mesh.
6. **Transfer anchoring** — the line's first roller is within ~1 unit of the
   `transferLiftCar` on stations that route down a lift shaft, or of an
   `InnerGate` on those that don't; and the shaft itself reaches its gate.
7. **Grounding** — `min.y === 0`.
8. **Conveyor seating** — every bay `ConveyorRoller` shares ≥25% of its own
   thickness with a `ConveyorBed`. Measure in the bed's local frame; the bays
   are rotated to their bore facets, so world AABBs are several times the
   roller's real thickness and an overlap test on them is vacuous.

## Known rough edges

- Nothing is rigged or animated. Doors, fields and conveyors are static meshes;
  every moving part is described in `userData` for the game layer to drive.
- Curved parts are deliberately low-facet to match the ships: bore 12,
  joining hub and berth tubes 8. If you raise these, raise the ships' too or
  the two read as different design languages.
- The internal hall is intentionally a separate connected component, linked
  only by the transfer line; `checkConnectivity` allows it by design.
