# next.md — where this picks up

Written end of the 2026-09-14 session (second pass, after L4). Everything below is on disk and
committed; nothing here is uncommitted work at risk.

## Committed this session

- `1f366b5` — **the fleet was denser than concrete**: hulls are 25 m now,
  and one number (`Render.SHIP_LEN`) says so.
- `30d2964` — **stations are drawn at a size the fleet can actually use**.
- `be3b022` — **the shed on the ground is a building again**, and it is
  measured.
- `606225e` — **berthed inside a station**: the world goes away, and the
  room is measured. This is L3.
- `eb4f12d` — next.md for the scale correction and L3.
- `f6573d6` — **a station draws you in, and it calls you first.** L4, plus
  auto-clearance on approach.

Tests at the end: lint clean; physics 241, render 696, cockpit 159, nodes
55, ships 23, berths 24, galaxy 39, combat 342, arcs 18. economy still
has its one pre-existing failure (17 manufacture-above-development
violations) — present on a clean tree, touches none of this, fix it
separately or leave it.

---

## THE SCALE CORRECTION, and what it actually was

Astra's read of the six test screenshots was the right one: **the world was
too big, not the ships too small.** A 25× A/B was run both ways and the
version with everything else shrunk is the one that looks like the game.
The FE2 argument for monumental stations was discarded on her instruction —
this is not a remake, it is her own thing, and the metric is how it looks
and feels.

What moved, and it is three numbers:

- `Render.SHIP_LEN` 0.010 → **0.025**. Hulls are 25 m. `Render.hullSpan`
  reads the model's `span`, which the converter has always emitted and
  nothing had ever read, so width and height are the model's own rather
  than a guess off the length.
- `Gen.STATION_SCALE` = **0.35**, applied at both creation sites, one rng
  draw preserved, so a seed's stations are the same stations at a new size.
  Station radii in play are now 211 m / 670 m / 1118 m.
- The surface shed came down ~2.6×. Pad radii 100 / 168 / 240 m.

**Density was the argument that survived.** A hull at the old length worked
out denser than concrete. Astra's pushback on the first version of that
argument was correct — bullets and missiles *are* things that fly and *are*
built like that (AMRAAM ≈ 1,700 kg/m³) — so the surviving form of it is
purely volumetric, not "nothing that flies is shaped this way".

---

## THE FIND that changed the station plan (still the key context)

**The station models already ship their interiors.** Every orbital model in
`src/ports.js` — ring / cylinder / spine / cradle, S-M-L — carries an
`interior` bucket: hangar, berths, sliding doors, force field, blast doors,
lit fixtures. `libPort` has been decompressing and caching it since imported
ports arrived, and nothing had ever drawn it. Same class of bug
PORT-MODELS.md records against the spin bucket.

They also carry real `anchors`: `berths` (with `node` names and `normal`
vectors), `gates`, `innerGates`, `pockets`, `navLights`, `lamps`, `signs`.
The generator that built them is `Claude outputs/station.js` — worth reading
before touching any of this.

### The other half of that find, discovered in L3

**The art's `interior` buckets and the art's `berths` anchors are different
places.** Measured across the whole library: **0 of 48 modelled berths sit
inside their own station's interior volume.** The interiors are concourses
somewhere in the hull; the berths are alcoves on the outside. So docking at
a station does not put you in the room the model calls its interior, and
`drawStationInterior` therefore does not draw from a berth today.

That is not a bug to fix in code. It is a fact about the models, and if it
should change it changes in the art. `berths.test.js` prints the count every
run rather than asserting it, so an artist can put a berth in a hall and the
room lights up without anyone editing a test.

What you actually see berthed at a station today is the model's own alcove
geometry — which reads well: dark structure, amber lamps, ship on the
clamps, black sky. Verified by eye at seed `kawarthaas` across spine-l,
ring-l, cradle-s, cylinder-s, cradle-m.

---

## L3 — done (`606225e`)

- `enclosedPort()` answers for orbital stations. One widening, three
  effects, and they cannot drift: world suppression, interior eligibility,
  and a real box for the camera clamp.
- `clampCameraToHangar` asks `Sim.portBasis` (both kinds of port) and clamps
  to `Sim.berthRoom` — the alcove the model declares — falling back to the
  chamber table only for a port with no modelled berths, which is the right
  room for it.
- `HANGAR_MARGIN` is capped against the room it clears. It is 2% of a *pad*
  radius: a couple of metres in a shed, thirteen in a station measured in
  its own radii, which is half the height of a berth. A clearance bigger
  than its room collapses the box and welds the camera to the hull — that is
  exactly what happened, and `halfGap()` is the fix.
- `Gen.stationBay`'s table was resized **against the fleet, not guessed**.
  At the smallest station the generator makes: hatch 1.5× the widest hull,
  headroom 2.7× the tallest, berth pitch 1.5×, berth depth 1.4×, end walls
  1.3×. The procedural hub grew to match so the hall is inside the thing
  drawn around it; `berths.test.js` compares those two numbers every run.
- `Gen.tableBerthOffset` split out of `berthOffset` — the table's answer
  with no model consulted. The procedural hall mesh used to ask
  `berthOffset` with a stub port, which resolved to whatever model matched
  the stub and drew this room's alcoves at x = −0.65 in a room 0.26 wide.
- `Render.interiorBounds` falls back to the procedural hall mesh when a
  model declares no interior. Three of fifteen orbital models (the city
  ports) are like that, and without the fallback the room was drawn by one
  half of the pair and gated to death by the other.
- `berthIsInInterior()` in main.js gates the interior on the *berth*, not
  just the eye. See the find above for why it is currently always shut.

## L4 — done (`f6573d6`)

**A station draws you in, stern-first, and the doors mean something.**

- `beginArrival` no longer refuses orbital ports. The only thing holding the
  rail to the ground was `arrivalPose` asking for a ground frame;
  `Sim.portBasis` answers for both kinds — the same one-word move that
  widened `berthState` and the camera clamp.
- `ORBITAL_LEGS`, five of them: **lineup** (holding off, doors shut) →
  **open** (outer doors run back, hull holds at the threshold) → **enter**
  (drawn in through the throat; the sky goes away here) → **settle** (onto
  the stand, doors close behind) → **admit** (inner gate opens). The last
  leg moves nothing. It exists so the sequence ends by showing you what you
  have arrived inside of rather than on a shut door.
- **The route is the art's.** `Gen.berthApertures(port, i)` measures each
  berth's outer doors and inner gate off the model, along that berth's own
  `normal`. Matched **geometrically, not by node name** — a ring mirrors its
  patterns, so two alcoves on opposite sides of the hub both answer to
  `berthSM0`, and a string match would fly a ship in through the far side.
  Measured across the library the doors sit 0.17–0.23 station radii outboard
  of the throat floor; that number is printed by `berths.test.js` every run
  and typed nowhere.
- **No modelled berths → the hall.** City ports have no throat, so they get
  the hatch route: in on the hub axis and across to a stand. Same leg table,
  different waypoints. `physics.test.js` pins that one (it does not load
  ports.js); `berths.test.js` pins the modelled one.
- **The hull never turns.** A berthed ship faces the way it leaves, and the
  way it leaves is the way it came in — so a station draws you in
  stern-first, the way a truck backs onto a loading dock. No rotation to
  animate, no blend at the end, and the pose the rail hands `dockShip` is
  the pose it started with. Pinned as an invariant.

### The camera, which was wrong three separate ways
A boom collapsed onto the hull is thirteen seconds of grey plating filling
the screen and **nothing throws** — so these are correctness bugs, not
polish.

1. `clampCameraToHangar` read the berth from `dockOffset`, which `dockShip`
   writes — and `dockShip` does not run until the rail *ends*. The whole
   arrival clamped to berth 0 of a station the ship was being carried into
   berth 2 of. `currentBerth()` asks the arrival first.
2. The slab tests have nothing to give when the hull is not in the room yet
   (out at the hatch, or a hundred metres outboard in a throat) **and**
   nothing to give when the eye is pitched into a deck a hull's standoff
   below it. One rule covers both now: *when the direction the camera is
   pointing has no room in it, stand back by half the narrowest way through
   the room instead.* No threshold of its own; it resolves back into the
   slab tests the moment they have something to say.
3. The shaft's own `descend` branch computed a limit in **pad radii** and
   assigned it as **kilometres** — half a kilometre of boom at a pad a
   hundred metres across, so the eye sat outside the shaft for the entire
   descent looking at the outside of a tube it was meant to be inside.
   Pre-existing; fixed here because it is the same shot.

## The port calls you (`f6573d6`)

Astra's change, and it closes the trap that started this whole thread.
Clearance was three keystrokes with the answer "yes" almost every time, and
forgetting it once cost a fine, a standing hit and a FUGITIVE flag — which
shut every door in the system, including the one an open mission needed.

A port with room now hails a ship **closing inside 10 km** and clears it.

- **Inverted, not removed.** It still refuses — wanted here, hostile, full —
  and when the answer would be no it says **nothing**. A wanted pilot is not
  nagged by every marker they drift past, and the port going quiet is itself
  the signal. Hailing still works and is now how you find out *why*.
- **Launch is untouched**, deliberately. Asking to leave is the half with a
  real decision in it.
- **10 km** because the docking envelope is `max(1.2 km, 4 radii)` — 0.8 to
  4.5 km at the sizes the generator makes — so clearance arrives with the
  final leg still ahead of it rather than at the moment it stops mattering.
- **Closing**, because a ship that just launched is not arriving. Without it
  the port clears you straight back in over the top of whatever it said
  about leaving.
- **Twice a second**, because asking where a body is costs a Kepler solve —
  the most expensive call in the file.
- `Combat.clearanceRefusal` is the judgement, split out so `requestClearance`
  and `autoClearance` cannot drift. Same shape as `dockRefusal`.

That sweep shipped with the bug this kind of stamp always has: `G.t` resets
on a new game or a load while `clearanceSweptAt` rides along on `G`, so a
stamp from the last career sat in the future and the sweep **never ran again
for the rest of the session**, silently. Guarded the way `stepArrival`
already guards its clock.

## Parked

- **Point-and-click interiors, Wing Commander style.** Astra's idea, on the
  back burner by her call. Worth recording because it fits the finding
  above better than anything else does: the models' `interior` buckets are
  *concourses*, not places ships park — which is exactly the room a bar, a
  mission board, a shipyard counter would be in. The geometry is already in
  `src/ports.js` and already drawable (`Render.drawStationInterior`), and
  `berthIsInInterior()` is the gate that would stop being always-shut.
- The force field renders as an opaque lit slab. The `enter` leg now flies
  through one, so this is visible — next time someone is looking at a
  cylinder or cradle port up close.

---

## THE TWO BUGS from the previous session (`f9e2569`), for context

**Loading a save made you a fugitive.** main.js detects a dock as the EDGE
from not-docked to docked. Loading runs `newGame` first (clears `wasDocked`,
leaves the ship flying) and only then drops the snapshot in, parking the
ship on the clamps — so the next frame saw that edge and ran the whole
arrival, and `Combat.arriveAtPort` booked the player for arriving
UNANNOUNCED at a port they had been sitting in since before they saved. 500
cr and a FUGITIVE flag, and a fugitive's ports do not open. Fixed in
`Save.restore`. Test checked against a reverted fix; fails four ways
without it.

**A shut door said nothing.** `Combat.dockRefusal(G, port)` →
`null | {why, short, text}`, read by startAutodock, advanceAutodock, the
DENIED line, the CLEARANCE row (third state, REFUSED, red) and the docking
panel (DOORS SHUT).

**The seed is in the pause menu** now, leading the career line.

### Getting an already-broken career unstuck
- F4, hail the POLICE channel (marked `*`), it quotes, then **Y** to pay.
  Works at range — no docking needed, which is the point.
- Or jump: `Combat.fleeSystem` clears the pursuit. The bounty stays but
  sits under WANTED_HUNT, so doors open again.

---

## Measurements taken (so nobody re-derives them)
- Auto-dock CONVERGES. 38 station approaches across eight seeds, laden, from
  10,000 km and from 2 Mm: every one docked. The guidance law was never the
  problem; the closed door was.
- **Auto-dock stays engaged, silent, when the ship is landed or crashed.**
  `startAutoMode` checks `G.ship.landed`; `startAutodock` and
  `advanceAutodock` do not. Unfixed, small, worth a line.
- At cruise dropout the circular orbit's direction comes from
  `cross(worldZ, up)`, not the target's. Station inclinations are 0–6° so it
  comes out prograde by luck rather than design. Left alone.
- Tightest fit anywhere in the fleet/station cross product: shuttle at
  spine-l at the smallest radius, **1.7×** the hull on its tightest axis.

## Still un-flown — needs eyes in the browser
- `STATION_INTERIOR_PX = 40` — a room you cannot see into is pure cost, and
  interiors are the heaviest meshes in the library (several thousand faces
  against a shell's couple of hundred).
- The procedural fallback hall's proportions from the inside. It is now
  measured but has never been *looked at* — reachable at a city port.
- Landing FEEL and its damage thresholds: `LAND_SAFE_SPEED` /
  `LAND_FATAL_SPEED` / `LAND_DAMAGE_MAX` / `LAND_GEAR_UP_MULT` in sim.js.
- Gas-giant banding knobs in gl.js.
- The GUNS tab layout on F5.

## Traps this project keeps hitting
- **NEVER `git checkout` to revert on X:.** It deleted `src/generate.js` and
  `src/render.js` outright this session — the unlink succeeded, the recreate
  failed on the locked drive, and then X: refused all access until the
  desktop app was restarted. Both files had to be restored from container
  copies. **Edit in place; revert by editing back.**
- A CONSTANT SCALED BY ANOTHER CONSTANT IS A BUG WEARING A DISGUISE.
  `BERTH_X * (chamberX / BAY_CHAMBER_X)` read the ratio between one chamber
  and a *different* constant, so the day `BAY_CHAMBER_X` changed, berths
  jumped outside the rooms they were in. A fraction of the room the berth is
  actually in (`BERTH_FX`) cannot drift.
- MEASURE BEFORE CHOOSING A THRESHOLD. Every number in the bay tables is now
  derived from the worst hull in the fleet at the smallest port the
  generator makes, and `berths.test.js` prints the margins every run.
- A TIME STAMP ON `G` OUTLIVES `G.t`. Starting a new game or loading a save
  resets the career clock while any `G.somethingAt` you parked rides along —
  so the stamp sits in the future and the throttle it guards never fires
  again, silently, for the rest of the session. Guard with `since >= 0 &&
  since < interval`, the way `stepArrival` already does.
- A VALUE IN PAD RADII IS NOT A VALUE IN KILOMETRES. The bay tables are all
  in radii and `G.cam.dist` is in km; the shaft's camera clamp mixed them
  and was out by a factor of the radius for as long as it has existed.
- A STUB PORT RESOLVES TO A REAL MODEL. `{radius: 1, kind: 'station'}` looks
  inert and is not: `portModelFor` will match it to something and hand back
  that model's anchors. Twice now.
- GREP FOR A TOP-LEVEL NAME BEFORE ADDING ONE. Duplicate declarations
  silently shadow and kill a whole IIFE file's later scope.
  `node tools/lint-globals.js` catches the cross-module cases.
- render.test.js is order-dependent — a new block calling newGame must
  snapshot/restore the tracked prefs. It also does NOT load `ports.js` (15 MB
  of generated art); anything needing a model there builds a fixture and
  restores `W.PortLib` after.
- Unit tests are STRUCTURALLY BLIND to layout and appearance.
- **A test that passes with the fix reverted is not a test.**

## PROCESS
- NEVER `git stash` with uncommitted work you care about. Use
  `git diff --stat` / `git show`.
- COMMIT AFTER EVERY GREEN STEP.
- PowerShell has no heredoc. `git commit -F COMMITMSG.txt`, then delete it.
  Use `;` not `&&`.
- File locks: if a file gives EPERM or "File exists", the game is open in a
  browser tab OR a failed git op left a handle. Close the tab; if that
  fails, restart the Claude Desktop app to remount X:.
- **`device_commit_files` can silently write a STALE copy.** It reported
  success twice this session while the device kept the old file. Always
  `Get-FileHash -Algorithm MD5` the written file against the container's
  `md5sum` before running anything, and re-push under a *fresh staging path*
  if it does not match.

## Toolchain note
The workspace shell still cannot mount X: (the Windows update of 2026-09-08
breaks the Plan9 share; `device_bash` fails outright). The fallback that
works: keep the tree staged in the cloud container, run the suites there
with plain node — they need nothing else — then `device_commit_files` the
changed files back, verify by hash, and commit via Desktop Commander's
PowerShell. Everything this session was done that way.

## Playtest recipe
1. DC start_process: `Start-Process -NoNewWindow node -ArgumentList 'tools/serve.js'`
   (serves 127.0.0.1:**8732**, no-store).
2. `Claude_Browser__preview_start` on http://127.0.0.1:8732/index.html
3. Drive via `javascript_tool`. The game object is **`window.Game`**, not
   `G`. rAF is frozen while the pane is hidden, so advance frames by hand:
   `for (var i=0;i<6;i++) Game.step(0.016);`
4. To move between ports, UNDOCK FIRST — `Sim.dockShip` on top of a docked
   ship is a no-op and you will screenshot the old station. Clear
   `G.wanted/G.fugitive/G.expelled/G.ship.cleared` between forced docks or
   the unannounced-arrival fine locks the doors.
5. Screenshots lag state by a frame or two; step, then shoot.
6. Tidy up: close the tab, force_terminate the server pid. LEAVE NO SERVER
   RUNNING — a stray serve.js is what locked sim.js once.
7. Tests against X: directly (PowerShell, `;` not `&&`):
   `cd "X:\Shared_AI\Procedural Space Game" ; node test/render.test.js`
