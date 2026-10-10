# Modelling ports

What to name things in a port `.glb` so the game can use it, and why each
name exists. Companion to the ship models in `ref/glb`, which follow the
same idea: **the model carries its own anchors, and the simulation reads
them off** — the way every hull already carries its `laserEmitter` muzzles
and its `cockpitInterior`.

Convert with:

```
node tools/glb2hulls.js ref/ports --ports        # -> src/ports.js
node tools/glb2hulls.js ref/glb                  # -> src/hulls.js (ships, unchanged)
```

The game runs with `src/ports.js` absent — every role falls back to the
procedural mesh it has today. So a half-finished folder never breaks a build.

---

## The one thing that differs from ships

**Ships are +Y up. Ports are +Z up.**

Not a whim: `bayGeometry` and the ground basis were written with **z out of
the ground** — the floor sits at a negative z, headroom is measured up in z,
and berths are spread across x and y. Ships were normalised into the
renderer's +y-up convention long before ports had interiors.

**You do not have to care.** Model with Y up, the way glTF and every
authoring tool want. The `--ports` converter swaps Y and Z on the way in, and
that swap is in one place with a comment saying so. Just do not pre-rotate
your model to "help" — it will come out on its side.

---

## Scale: the model tells the game how big it is

A ship normalises to unit length along its longest axis. A port cannot: the
game measures ports in **pad radii**, and a pad radius is a gameplay quantity
rather than a bounding box. So a port declares its own scale.

### `portPad` — required on surface ports

One box covering the landing pad's footprint. Two things come off it:

- its **half-width in X becomes 1 pad radius** — everything else in the file
  is then expressed in pad radii, automatically
- its **top face becomes ground level**, z = 0

Everything the existing bays do is quoted in pad radii, so once `portPad` is
right the numbers below are directly comparable to your model.

### Orbital stations need no marker

They normalise to **radius 1** off their own bounds, which is what the
procedural stations already do (`z` is the spin axis for anything that
turns). If you want a station to read bigger or smaller in the sky, that is
the port's `radius` in the generator, not the model.

---

## Surface bays

The shed you fly into. A career now **starts** berthed in one of these, so
this is the first thing a new player ever sees.

| Node | What it is | What the game takes |
|---|---|---|
| *(unnamed)* | the structure | shell geometry, drawn from outside |
| `portPad` | pad footprint | **scale and ground level** — required |
| `bayMouth` | the opening | mouth half-width, and the collar plane |
| `bayFloor` | the floor slab | its **top** face → `floorZ` |
| `bayCeiling` | the roof | its **underside** → `ceilZ` |
| `bayChamber` | interior extents | `chamberX` / `chamberY` (optional) |
| `berth0` … `berthN` | one box per parking space | park position per berth |
| `portInterior*` | only visible from inside | second geometry bucket |
| `portSign*` | placards | anchor per sign — see *dressing*, below |
| `doorLeaf0` … | the moving door leaves | reserved; see *not wired yet* |

**Berth order is the berth number.** `berth0` is the large one and gets the
extra elbow room; the rest are interchangeable. They are sorted left to right
across the shed before numbering, so a re-export cannot renumber them and
move a parked ship — the same reason muzzles are sorted rather than taken in
glTF node order.

**Facing.** A berth's nose direction is the long axis of its box, pointing
away from the shed's centre, so a berthed ship is left facing the doors —
which is how you leave something that has to be pushed back out. Give a berth
a child node named `berthNose` if you want to override that.

### What the current bays measure, in pad radii

Match these and the game will feel exactly as it does now. Diverge and the
game follows your model — that is the point of extracting anchors — but these
are the proportions everything else was tuned against.

| | pad radii |
|---|---|
| Mouth, square, half-width | 0.55 |
| Throat at the bottom of the duct | 0.45 |
| Shed interior, half-extents | X 1.30, Y 0.80 |
| Headroom, floor to ceiling | 0.36 |
| Berths | 6 — one large plus five, on the two long walls at Y ±0.60 |
| Gear-to-floor once parked | 0.012 |
| Model stands proud of the ground | 0.04 |
| Shaft depth, surface pad | 0.9 |
| Shaft depth, underground | 4.0 |
| Tunnel radius, underground | 1.35 |
| Collar height | 0.02 |

**Headroom is tighter than it looks and it is deliberate.** 0.36 of a pad
radius, floor to ceiling, against a ship that is roughly a pad radius long.
The exterior camera clamps against `floorZ`/`ceilZ` and the two chamber
half-extents, so a shed with more air in it than this means the camera can
back further off the hull and the ship reads smaller in its own hangar. It
was reduced once already for exactly that reason.

### Three roles share this shape

`surface`, `bay` and `underground` are the same interior at different shaft
depths — a pad on the ground, a shed, and a deep bay reached down a tunnel.
Note that **every surface port draws as `bay`** today; the flat `surface`
apron is orphaned and nothing points at it.

---

## Naming, and several models for one role

There are two ways in and both work.

**One model per role — name the file after the role.** `refinery.glb` takes
over the refinery, `bay.glb` takes over every surface port. No configuration
at all. Right while there is one model per role.

```
ref/ports/bay.glb
ref/ports/underground.glb
ref/ports/refinery.glb
```

**Several models — the NAME says which pool it joins.** This is the normal
case: four space stations, several cities, several buried bays. Prefix the
filename and drop it in. No code, no assignment, nothing to edit.

```
ref/ports/station-ring.glb      station-drum.glb     -> any orbital role
ref/ports/city-market.glb       city-arcology.glb    -> any surface port
ref/ports/deep-silo.glb         deep-cavern.glb      -> any buried bay
```

| prefix | pool |
|---|---|
| `station-` | all seven orbital roles |
| `city-` | every surface port |
| `deep-` | every underground bay |

Put whatever you like after the dash — it is how you tell them apart, and
it never reaches the player. `station-drum`, `city-tiered`, `deep-cathedral`.

**Which model a given port gets is hashed from the port itself**, never drawn
at random — so a city is the same city every time you fly back to it, across
a save, a reload and a rebuild. That is the project's first doctrine and the
one that is invisible when broken: a random pick would look right for twenty
minutes and then quietly stop being a place.

### What pooling costs, and how to spend it back

Pooling means a refinery and a farm can wear the same hull, so **you can no
longer tell what a port does from its silhouette on approach.** The code used
to argue the other way and it was not wrong to: that was real information a
pilot had earned. It is being spent on variety instead, and the role is still
on the label and in the market.

It is reversible **one role at a time**, two ways:

- **Name a file exactly after a role.** `shipyard.glb` pins the shipyard and
  leaves everything else pooled. Most specific wins.
- **Assign explicitly**, if the naming does not suit:

  ```js
  Render.assignPort('shipyard', 'station-gantry');
  Render.assignPort('bay',      ['city-market', 'city-tiered']);
  ```

Precedence, most specific first: an explicit `assignPort`, then a file named
for the role, then the role's pool, then the procedural mesh.

| role | what it is |
|---|---|
| `orbital` | the ordinary port, the one you see most |
| `highport` | the big one over a settled world |
| `shipyard` | sells hulls — the one you go a long way for |
| `refinery` | tanks and pipework |
| `agri` | |
| `mining` | |
| `reprocessing` | where radioactive waste goes to be someone else's problem |
| `bay` | every surface port |
| `underground` | every buried bay |

**The shipyard is the one worth considering pinning.** It is the only role a
pilot changes course for — you fly a long way specifically to buy a hull —
so it is the one where recognising it from outside is worth a model.

---

## Orbital stations

Seven roles, and the design rule is the one already in `render.js`: **what a
place does should be legible from orbit before you have read a word of its
market.** A refinery should not be guessable from a shipyard.

| File | Today's procedural silhouette |
|---|---|
| `orbital.glb` | a wheel — the ordinary port |
| `highport.glb` | bigger, double-ringed, docking arms along the axis |
| `refinery.glb` | tank farm on a spine |
| `shipyard.glb` | the one that sells hulls |
| `agri.glb` | |
| `mining.glb` | |
| `reprocessing.glb` | where you dump radioactive waste |

| Node | What the game takes |
|---|---|
| *(unnamed)* | shell geometry — **does not turn** |
| `stationSpin*` | geometry that turns about +z |
| `dockPort0` … | latch points, and the approach direction from the hub |
| `portSign*` | placards |

**A station does not have to be round and does not have to spin.** The wheel
is a default, not a requirement.

**But be deliberate about `stationSpin`, because it changes what moves.**

- **No `stationSpin` node**: the whole model turns as one piece, which is
  what the procedural stations do today. Fine for a wheel modelled in one
  lump, and it is the safe default — if in doubt, leave it out.
- **With a `stationSpin` node**: that geometry turns and *everything else
  stands still*. This is what you want the moment a station has a docking
  bay: a hub that rotates with its own ring is not something a pilot can aim
  an approach at, and the whole point of separating them is that the part you
  fly into holds still.

So put the habitat ring in `stationSpin` and leave the hub, the docking arms
and anything a ship touches out of it. Rate is not yours to set — the game
turns it about once every couple of minutes, slower for bigger rings, and it
is a pure function of time so it stays exact across a time warp.

*(This was a real gap for a while: the first wiring only took the shell, so a
modelled ring was converted, stored, and then silently never drawn. If a part
of your model goes missing, that class of bug is the first thing to suspect —
and the converter's per-model line prints what it found, so compare it against
what you exported.)*

---

## Dressing: signs that tell the truth

There is generated data waiting for this. A port knows what it trades, what
grade of gear it sells and who holds it, and the intent has always been that
the **signage says so** — so a shipyard reads as a shipyard on approach, and
a port that will not sell you a Class 3 laser looks like a port that would
not.

`portSign*` nodes are recorded as anchors so that text can be projected onto
them later. Put them where a sign would actually go — over the doors, on the
collar, along a ring — and size the box to the text you would expect. Nothing
renders on them yet; the anchors are cheap and the alternative is remodelling
every port when they do.

---

## `userData.interior` — the one block the game reads

**Run `node tools/validate-ports.js ref/ports` before handing over a model.**
It names every missing field and, for each, the key the same information
already lives in — most of these are renames.

Four families were modelled independently and each invented its own words for
the same three ideas:

| concept | runwayPort | padSite | cityPort | cometOutpost |
|---|---|---|---|---|
| ground plane | `groundY` | `surfaceY` | *absent* | `crown.plateauY` |
| hull space | `bay`+`chamber` | `interiorAnchors` | `stands[]` | `openings[]` |
| route in | `route[]` | `gates[]` | *absent* | `route{lg,sm}` |

The game cannot read four dialects. `Render.portModelFor` is the single key
deciding both which mesh is drawn and whose dimensions are used, and a second
copy of it per family is what house rule 6 exists to prevent. So every pattern
emits one block on the root node:

```js
userData.interior = {
  envelope:   { w, h, d },          // the hull the set is sized to
  padRadius:  Number,               // so the game can talk in pad radii
  groundY:    Number,               // surface plane — REQUIRED planetside
  chambers:   [{ id, kind, w, h, d, floorY, ceilY, x, z }],
  routes:     [{ id, envelope, waypoints: [{ x, y, z, at }] }],
  gates:      [{ id, node, kind, plane, aperture, open, closed, requires }],
  carriers:   [{ id, node, kind, level, angle, from, to }],   // optional
  control:    { node, at, commsRange, access, security, commands },
  excavation: [{ x, y, z, w, h, d, tag }],
  groundCut:  { x, y, z, r } | null
}
```

Four things the validator checks that are easy to get wrong:

- **Every route carries its OWN envelope.** One shared envelope looks
  reasonable right up until a heavy hull is swept down a medium branch, or
  every medium bay is condemned for being medium.
- **`plane` on a gate.** `'xy'` is a wall, `'xz'` is a lid. A sampler that
  assumes vertical reads a lid's depth as a height, finds nothing in the
  middle of a rock slab, and reports a door that covers nothing as sealed.
- **`groundY` is not `y = 0`.** The group is grounded so `min.y === 0`, but
  that is the bottom of the excavation. Ground level is the top of the paving.
- **`carriers[].kind` may be `'both'`** — some traversers are also elevators —
  and a 45° cargo lift is `angle: 45` with `level: true`, because the shaft is
  inclined and the deck is not.

`control` is the command cabinet and it must sit **outside** the excavation: a
computer that lets you in cannot be inside the thing it lets you into, or
nobody could get in the first time and there would be nothing to break into.

A file matching `detail-kit*` is a parts library, not a port, and is skipped.

## Not wired yet, but name them anyway

Reserved names the converter records and the renderer ignores for now. They
cost nothing in the model and save a re-export later.

- `doorLeaf0` … — the shaft doors currently animate as procedural leaves that
  slide clear of the mouth. Modelled leaves would replace them, and they have
  to be separate instances because they move independently.
- `portLamp*` — the approach lamps are procedural rings today, and they are a
  readout rather than decoration: the colour says whether you actually have
  clearance. If you model them, model them unlit.

---

## Doors, and bays that do not face out (the 2026-09-21 set)

The cylinder, spine, cradle and hydrogen refinery added on 2026-09-21 speak a newer
door dialect than the first stations. The converter reads both:

| Node / extras | What the game takes |
|---|---|
| `leafGroup_<berth>_<L\|R>` | one door leaf; everything under it moves as one. **The berth number in the name is the berth it belongs to**. Leaves are no longer handed to the nearest bay, which gave cylinder leaves to the wrong door |
| extras `doorLeaf.travel` | how far the leaf slides, in model units. Used as given: measuring the leaf's box ran lap doors short |
| `LapPocket*`, `LapHouse*` | the slot a lap door slides into. Treated like a `pocket` |
| `ForceField*` | a field rather than a leaf: it is there or it is not, and when it is down you cannot hit it |
| `SlidingDoor[LR]n`, `BlastDoor[LR]` | the older names. Still read |

A gate node inside a gate node is not a second door. Only the outermost one
counts.

**A leaf group that names something other than a berth is an internal
door.** The cradle's `leafGroup_liftWell_<side>` is the gate to its cargo
lift. It belongs to no berth, and its leaves slide apart from each other.
Before this, it went to the nearest berth, tube L. That put tube L's doorway
inside the station and left the tube's real mouth, an end cap on the tube
cylinder, uncut.

**Berths no longer have to point away from the hub.** Each berth's frame is
its node's own axes: +Z out through the door, +Y up. The door slide, the cut
aperture, the bay lettering and the undock push all follow that frame now.
Before, they assumed an axis-aligned berth, which is why the cylinder's
leaves did not move. The undock push goes out along the berth's normal
rather than away from the centre. In the cylinder, "away from the centre" is
a wall.

**A model built lying down is stood up.** If every berth's up points the
same way and it is not +Z (the cylinder came in with up = -Y), the converter
turns the whole model by a right angle before measuring it. Otherwise parked
hulls come out on their sides.

**The way in is found, not assumed.** For each berth, `berthApertures` looks
for a clear line out of the door, straight along the normal or tilted up to
a limit. It records `entry`, `exit` and `reachable`. The cylinder's bays ring
its bore, so the line out runs along the bore. The hold point, the voxel
carve and the pull-in all use that line. **A berth with no clear line out is
never assigned.** The refinery's S and M bays face inward, reached in the art
through the heavy bay and a lift, so at present only the heavy bay takes
ships.

**The pull-in goes round.** A ship that starts on the far side of the station
from its hold point is taken round the hull on a few secants, not in a
straight line through it. berths.test sweeps every model's pull-in against
the triangles. With a straight line, all 15 fail.

Known tight spots, for the next pass on the art:

- **cylinder-l**: neighbouring bays share leaf pockets, so two doors cannot
  be open at once without a leaf sliding into its neighbour's opening.
- **cylinder-l berth 2** (the lift-chute bay) clears by 0.003 radii. It is
  refused at small stations.
- The refinery's S and M bays are unused until there is a route through the
  heavy bay.
- The cradle's heavy bay (`berthL`) is a force field under a clamshell roof
  that opens upward. Its S/M ships park in the two tubes, and `berthSM<n>`
  in the hall have a clear line to outside, so the game sends ships
  straight in rather than through the tube and lift the art describes.
- `src/ports.js` is 30 MB with the new set (from 15.6 MB).

The old cylinder, spine and cradle are kept in `ref/ports-retired`.

---

## Things that will bite

**Grep for a name before you invent one.** Three times now a new top-level
name in this project has collided with an existing one and the later
declaration silently won. The same applies to node names: `portPad` and
`bayFloor` mean something specific.

**Classification is inherited.** A named parent carries its unnamed children,
which is how these files are actually assembled. So `bayFloor` containing six
unnamed slabs is one floor, not six anonymous pieces of shell.

**One anchor, one instance.** A named node opens one bounding box and its
children add to it — so a multi-part berth stays one berth. Two berths must
be two siblings, not one node with two lumps in it.

**Triangles only.** Quads and n-gons are skipped silently. So are textures,
normals, skins and animations: the renderer computes its own lighting from
one flat colour per face, taken from `baseColorFactor`. An `emissiveFactor`
makes a face self-lit, which is the only honest way to paint a lit window or
a live lamp.

---

## The 22-09 set: liveries, industry, farms, and geometry on demand

Staged by `node tools/stage-2026-09-22.cjs [folder] [--apply]`, which files a
drop under the ids below (browser `(1)` counters stripped, newest write wins)
and keeps anything it replaces in `ref/ports-retired/2026-09-21`.

**Id grammar: `<pattern>[-navy|-syn]-<s|m|l>`.** The livery suffix is what
`Render.portModelFor` reads. A pattern with no suffix is the civilian one.

| stem | from | used for |
|---|---|---|
| `cylinder` `ring` `cradle` | `*-station-*_2_variant` | ordinary orbital roles (civ only) |
| `spine` | the 09-21 spine, kept | ordinary orbital roles (civ only) |
| `cylinder-classic` `spine-classic` `ring-classic` `cradle-classic` | `*-subvariant_3` | ordinary orbital roles, all three liveries |
| `yard` | `civ/navy/synd-yard-station` | shipyard |
| `refinery`, `skimmer` | `civ/navy/synd-refinery/skimmer-station` | the refinery role, which is gas and ice giants |
| `city-port` | `city-port-*-subvariant_3` | every other ground port |
| `farm` | `syndicate-farm-*-subvariant_3` | a farm: plain = grapes, `-syn` = gold buds, `-navy` = grapes in navy space |
| `comet` | `comet-*-subvariant_3` | buried bays, on ice (iceball, tundra) only |
| `runway-refi` `runway-indu` `runway-pass` | *not yet made* | ground ports on ice worlds — see below |

**Who wears which livery** is stamped on the port by `stampLiveries` in
generate.js (no rng): `syn` where the Syndicate holds the system or the port
flies its flag; `navy` where a naval garrison is based and the port is its
faction's, and every carrier; `civ` otherwise. A farm's livery is its crop.
A livery the art does not exist in falls back to the civilian building.

**Runway hooks.** A ground port on an iceball gets `siteKind` `runway-refi`
(the default: that is where the volatiles are harvested), `runway-indu`
(shipyard, mining, reprocessing, milfuel) or `runway-pass` (highport). Until
a file with that stem is in `ref/ports` it wears the city port. Name the
exports `Runway-REFI-S.glb` etc. — the stage script maps them.

**Held back** (`Render.PORT_HELD_BACK`): converted but never handed out, and
skipped by berths.test with the reason printed. Take a line out when the art
is re-exported and passes.

- `spine-v2-*` — berths are toothed sliders with no throat panels; the converter finds none
- `ring-*` (v2) — the far-side pull-in runs through the ring; hulls park 0.003 radii from plating
- `yard-l`, `yard-syn-l` — every berth parks its hull 0.001–0.002 radii from plating (large civ/syn yards use the M model meanwhile)

**Door stops.** The new stations' telescoping leaves (`SlidingDoorL1/L2`) carry
`door: {openX, closedX}`; the converter takes `|openX - closedX|` as the
leaf's travel, as it takes `doorLeaf.travel` for leaf groups.

### ports.js is an index now

`glb2hulls --ports` writes `src/ports.js` (~1.4 MB: kind, anchors, geom,
extras for every model, each marked `lazy: true`) and one
`src/ports/<id>.js` per model holding only the triangles (v f pal ci
interior spin, ~131 MB in all). The simulation reads only the index, so
berths are known the moment a system is generated.

`Render.libPort(id)` fetches a model's geometry the first time it is asked:
synchronously under node and wherever a page may do a synchronous read
(http, the playtest server), otherwise with a `<script>` tag, after which
`PortGeo.onload` → `Render.portGeometryArrived` drops every cache that
remembered "no model". `enterSystem` calls `Render.prefetchPorts(sys)` so the
reads happen during the jump tunnel. A test fixture library without `lazy`
behaves exactly as before.

## The 24-09 set: new stations, ground sites, routes through the art

**Orbital.** The new `cylinder`/`spine`/`ring`/`cradle` designs are the only
orbital stations handed out. The old `-classic` (subvariant_3) navy and
Syndicate stations are NOT ports: they live in `ref/port-art/livery-templates`
and `tools/skin-liveries.cjs` reads their swatches to dress the new designs as
`<pattern>-navy-<sz>` and `<pattern>-syn-<sz>`. `PORT_HELD_BACK` is empty.

**Ground sites** (`model_update/`, staged by `tools/stage-2026-09-22.cjs`):
`pad-site`, `mountain-site`, `runway-site`, `pad-city-site`,
`runway-city-site`, each s/m/l. They are the `bay` pool and replace
`city-port` (retired to `ref/ports-retired/2026-09-24`). The ice-world
`runway-refi/indu/pass` hooks stand in with `runway-site` /
`runway-city-site` until their own art lands. The 09-21
`hydrogen-refinery-station-*` in that folder is superseded and skipped.

**S/M through the L bay** (`interiorRoutes` in glb2hulls). A voxel A* from
each L berth to each S/M berth, doors open (OPENABLE_RE), with CARRIER volumes
passable: nodes matching `CARRIER_RE` (transferLift/Main/Lock/Deck, dockLift*,
hangarLift*, spokeTransfer*, ringLift, cargoHoist, sortHoist*, hoist, shaft,
lift, incline, ramp), grouped by stem over their whole subtree, and swept
along `extras.lift.travel` where a car declares it. Where the art has both
decks but no open voxel joins them (the car parked at one landing, the shaft
walled at the other) the route is joined by an ELEVATOR: the nearest pair of
cells between what the L bay reaches and what the S/M bay reaches, preferring
carrier volumes, capped at 0.8 half-spans. The report prints how many routes
needed that ("joined by elevator across unconnected decks") — those are the
places the art could open a shaft. Written on the S/M berth as `entry` (the L
berth index) and `via` (corners); `berthRoute` reads it, the arrival walks it
and undocking runs it backwards.

**Ground entrances.** A node with `airlock.outerOpensOn: 'dockingClearance'`
that is not a berth (`padSurfaceDoor`, `hangarDoor`, `portal`,
`lHangarDoor`) is an ENTRANCE, written to `entrances` with its outward
normal. Every berth gets `door` + `doorVia`: the route in from the
entrance that fits it — S/M prefer the pad door and its 45-degree lift, L the
hangar or portal. `Gen.berthDoorRoute` reads it; the surface rail becomes
hold off the entrance → doors → down and across along the route (descend +
traverse legs) → stand.

**Leaving.** `Sim.undockShip(..., { transfer: true })` at a ground port runs
the arrival backwards to the hold off the entrance and hands the ship over
nose-up, climbing 4 m/s ("Request transfer to exit pad" on the comms panel,
and U). A launched ship carries `departed` and `padCapture` ignores that pad
until the hull has left its envelope or holds fresh clearance — the fix for
being re-docked the instant a launch did not climb.

**Fixes from the 24-09 test pass.**
- Ring heavy bays (`…HatchLeafL0` finger hatches) and spine sliders (`berth…LeafL/R`, `door` extras) are now gates, so both have outer doors, a way in, and BAY lettering.
- Yard garages (`berthLY…`) are roll-up doors: their gates are the slats (`…LeafLSlat0`), which render as there-or-not like a field. The garage berth box is moved in behind the slats, because the group box is the door frame standing outside them. Without the move the hull parked in the doorway and the garage had no way in.
- `Render.berthDeck` keeps its centreline cast unless that finds less than 0.03 radii of headroom (a plate's underside or a header). Then it takes the median, over nine columns, of the candidate surface with the most room above it. This fixed ring hulls 0.009 radii inside the floor and cradle decks read off a header.
- The converter's rasteriser sample cap and search radii scale with ROUTE_N, so the 256 grid has no pinholes.
- `tools/merge-ports.cjs <dir>` folds a partial conversion into src/ports.js, so a few changed models do not cost a full hour-long run.

## The 24-09 evening drop: the CURRENT stations

Astra: "These are the CURRENT station models. Replace any previous versions
of these files." Source `new_current_stations/` (41 files), staged by
`node tools/stage-2026-09-22.cjs new_current_stations --apply`.

- **Replaced (38 ids):** `cylinder` `spine` `ring` `cradle` (civ), `yard`
  `refinery` (civ/navy/syn), `skimmer` (civ), `skimmer-navy-s/m`, and
  `cylinder-navy` — the first orbital pattern to arrive AUTHORED in a livery
  (`navy-cylinder-station-*`; the stage script now maps
  `<civ|navy|synd>-<pattern>-station-*`).
- **Retired** to `ref/ports-retired/2026-09-24-2/`. The stage script now
  takes a fresh folder per run: the morning's retirements already sat in
  `2026-09-24/` under the same ids, and keep-the-first-copy would have
  dropped the morning versions on the floor.
- **Re-skinned** by `node tools/skin-liveries.cjs --keep ref/ports-retired/2026-09-24-2`:
  navy + syn `cradle` `ring` `spine`, and `cylinder-syn`, from the new civil
  geometry. skin-liveries now leaves an authored livery alone (a liveried
  file whose root has no `extras.skinnedFrom`), so `cylinder-navy` is the
  art as drawn. `--keep` retires the old skins with the models.
- **Two cylinders.** Every size came as `(1)` and `(2)`: identical structure,
  docks and arms, different dressing (pallets/containers/tower vs a robot
  arm and seam plates). Newest write wins, so `(2)`.
- **Not in the drop, so left as they were:** `skimmer-navy-l` and
  `skimmer-syn-*` (older skimmer design beside the new civ one), and all the
  ground sites, farms and comets.

**Converter changes this drop needed** (`tools/glb2hulls.js`):

- `berthSMs0` is a bay — an SM bay drawn for a small hull only (`hullClass:
  'S'` in its extras). `BERTH_GROUP_RE` now takes a lower-case size letter
  after the class; before it, every new cylinder lost its S bays (cylinder-m
  converted with 2 SM berths of the 4 it declares).
- **Inner heavy bays.** An L bay whose extras say `exitVia: <another L bay>`
  (the cylinder's `berthLArm`, the spine's `berthL1`: curtains with no door
  onto space) is routed in through that bay like an S/M bay and is never
  offered as an entry. `exitVia` is carried onto the berth anchor. Before it,
  berths.test found "no way in" for the arm bay of every cylinder.

**Converted** at ROUTE_N=256 in two partial runs merged with
`tools/merge-ports.cjs` (59 models, then the 18 cylinders and spines again
after the converter changes). Berth counts match the art's `docks` table on
every model.

**Still open after this drop** (berths.test 181/4, transfer.test 13/1):

- **Civilian yard (`yard-s/m/l`) — "carriage halls".** Its S/M bays sit on
  carriages that ride a track (`extras.carriage: {dir, travel, raised,
  hatch, fromAbove}`) with an explicit `dockPath` and `exitVia`. The voxel
  router cannot ride a carriage, so half the S/M bays have no route in
  (yard-m 4 of 8, yard-s 2 of 4). The art also has no door leaves at all
  (force-field curtains), so the yard carries no BAY lettering. Needs the
  converter to follow the declared `dockPath` / carriage, or the art to add
  a carrier volume.
- **Ring (all liveries):** the new hatches carry no BAY lettering (9 models).
- **spine-m (all liveries), upper bays 3 and 5:** the deck cast lands 0.001
  radii above the berth box. spine-s/l sit exactly on the box top, so the
  upper bays' deck is being read at the TOP of their frame on every spine —
  needs a look in the game before the tolerance is touched.
- **Compartments:** most of the new art's faces sit outside any berth's
  compartment (station dressing), so drawing one compartment now costs 77%
  of a station on average (was 43%); skimmer-s 97%. A frame-rate concern
  inside stations, not a correctness one.
- `skimmer-syn-*` is still the older skimmer design. (`skimmer-navy-l`
  arrived separately the same evening, staged the same way and retired to
  `ref/ports-retired/2026-09-24-3/`; it converts clean, 8 berths, 6 S/M
  routed, and added no failures.)

## 2026-09-25: carriages, hatches and roofs

Three of the four items left open by the 24-09 evening drop, closed.

- **Civil yard carriages.** The converter now reads each bay's own
  `dockPath` (root frame) and `exitVia`. Where no clear voxel passage
  exists, a bay that rides a CARRIAGE takes the art's route before the
  elevator bridge: from the heavy bay's stand, the declared corners that
  lie inboard of it, to the foot of the carriage, then up (or down) the
  carriage to the stand. Written on the berth as `entry`/`via` like every
  other route, plus `carriageRide: 1`. All 20 of the yards' S/M bays route
  (yard-s 4, yard-m 8, yard-l 8); transfer.test 14/14. Other bays keep the
  old order (voxel, bridge, then the declared route as a last resort), so
  no other station's routes moved. `carriage.raised` is read but NOT
  routed through: it lies on the run between dockPath[1] and dockPath[0].
- **Hatches are lettered.** `letterTheBays` used to skip a door whose
  normal is vertical. The new ring's only doors are its heavy bay's roof
  hatch, so all nine rings went unlettered; a hatch is now painted like a
  pad, on its frame's first axis.
- **The spine's upper bays' floor.** `berthDeck` took the surface with the
  most room above it, and on a station's crown the room above a lintel is
  open space — so every spine's upper curtain bays had their deck on the
  roof of the doorway. A surface in the lower three quarters of the box
  with at least 60% of the box's height clear above it now wins; the ring
  (whose boxes hang below the deck, all plate inside) has no such surface
  and is decided by the old rule as before.

**Still open:** the compartment split. `portSections` divides a station by
connected solids, and the new art is largely one welded shell, so one
compartment still costs 77% of a station on average (43% before the new
art), skimmer-s 97%. berths.test 183/2 on those two checks only.

### Compartments with the welded art (25-09)

berths.test said one compartment was 77% of a station with the evening set
in (43% before). It was measuring the wrong thing: it counted station
structure in every room, but `drawStationModel` only paints structure while
the inner gate is off its seat. Behind a shut gate it paints the room's hull
alone, and that is **4.4% of a station on average** across 78 divided
models (worst: yard-syn-s's big bay, 37%). With the gate open it is ~80%,
the same order as the view from outside, and only for two arrival legs.

Structure grew because the evening art is one welded shell and most of it
is 3-5 bay diagonals from any bay (spine-m: 36,000 of 46,600 structure
faces), i.e. the outer hull no room can see. Splitting big welded solids
face by face was tried and moved nothing (4.4% -> 4.5%), so it was
removed. The test now measures what is painted: sealed average < 10%,
worst sealed room < 45%, and logs the open-gate figure.
