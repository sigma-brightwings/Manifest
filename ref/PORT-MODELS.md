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
