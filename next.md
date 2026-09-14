# next.md — where this picks up

Written end of the 2026-09-13/14 session. Everything below is on disk and
committed; nothing here is uncommitted work at risk.

## Committed this session

- `74c3f79` — **station interiors L2**: draw the inside. See "the find" below.
- `f9e2569` — **loading your own save was a crime**, and a shut door said
  nothing. Two real bugs Astra hit, one chain. See "the two bugs" below.

Tests after both: lint clean; physics 227, render 676, cockpit 159, nodes 55,
ships 23, galaxy 39, arcs 18, combat 329. economy still has its one
pre-existing failure (17 manufacture-above-development violations) — present
on a clean tree, touches none of this, fix it separately or leave it.

---

## THE FIND that changed the station plan

**The station models already ship their interiors.** Every orbital model in
`src/ports.js` — ring / cylinder / spine / cradle, S-M-L — carries an
`interior` bucket: hangar, berths, sliding doors, force field, blast doors,
lit fixtures. 1,392 faces (ring) to 9,500 (spine). `libPort` has been
decompressing and caching it since imported ports arrived, and **nothing has
ever drawn it**. Same class of bug PORT-MODELS.md records against the spin
bucket: converted, stored, silently never rendered.

They also carry real `anchors`: `berths` (with `node` names and `normal`
vectors), `gates`, `innerGates`, `pockets`, `navLights`, `lamps`, `signs`.
The generator that built them is `Claude outputs/station.js` — worth reading
before touching any of this; it explains the S/M shared aperture, the L
force-field-and-blast-door bay, and the interior lighting rig.

So L2 turned out to be mostly *draw what is already there*:

- `Render.drawStationInterior(ctx, cam, frame, radiusKm, sun, role, tint)` —
  modelled `interior` first, procedural hall as the fallback.
- Called from main.js `drawBody` above `STATION_INTERIOR_PX` (40), on the
  **shell's own frame**. No model declares a spin bucket, so stations turn as
  one piece; a room held still inside a hull that was not would shear through
  its own walls. This resolves the contradiction between next.md's old design
  note ("interior does NOT spin") and its old L2 line (`stationFrame(s,false)`)
  — the design note only becomes right once a model separates its ring, and
  when one does, the caller already passes the still frame for the shell.
- `Gen.stationBay` is now pinned down: **z is the hub axis, +z out of the
  hatch**, so floorZ/ceilZ/depth keep the meanings the camera clamp and the
  berth arithmetic already read. A true long hall (deck along one side,
  berths down its length) cannot be described by this key set at all —
  floorZ/ceilZ and `depth` would need two different axes. That is a bigger
  change than a table and it is not this one.
- Its constants were ~8× too large: a hall wider than the station containing
  it, and at the top of the radius range a six-kilometre room for a
  forty-metre ship. Resized, the hall now fits *inside* the procedural hub
  (radius 0.22, half-length 0.26) — the cheapest possible proof it is not
  too big.
- `bayGeometry` now routes orbital stations to that table instead of the
  surface shed's. It had been putting station berths the better part of a
  station radius outside their own hull — the "ship parked in open space a
  few hundred metres off a station it is supposedly inside" that the
  berthState comment already complained about. The choice is made inside
  `bayGeometry`, never by the caller (house rule 6). A modelled bay still
  wins field by field.
- `berthOffset` spreads berths as a fraction of the chamber rather than at a
  constant in pad radii — the same number for a shed (1.30/1.30), the right
  one for a hall. Surface ports come out identical: floorZ -0.9, ceilZ -0.54,
  berth 0 at x -0.95, checked against the pre-change values.

### NOT YET LOOKED AT IN A BROWSER
The render suite is blind to appearance. Unverified by eye:
- whether the modelled interior actually reads as a room when you get close
- `STATION_INTERIOR_PX = 40` — a room you cannot see into is pure cost, and
  these are the heaviest meshes in the library (a modelled interior is
  several thousand faces against a shell's couple of hundred; on the
  Latitude that is worth more than the rest of the frame's drawing)
- the procedural fallback hall's proportions (only visible with ports.js
  absent, or on a station wearing no model)

## Station layers still to build

### L3 — placement + camera
- `berthOffset` for a station now reads the hall table, but the shipped
  models declare their OWN berths (`anchors.berths`, 5/1/7/3), and those win.
  Check where a ship actually parks in a modelled station before changing
  anything: the model's berths may already be right.
- Widen `enclosedPort()` in main.js to return the station when you are
  berthed inside it. Its own comment (~main.js 4395) explicitly invites this.
- A station camera clamp: `clampCameraToHangar` is already generic except
  that it calls `Sim.groundBasis`. `Sim.portBasis` answers for both kinds.
  That is most of the job.

### L4 — the watchable transit (the actual ask)
Widen `beginArrival` (sim.js) so orbital stations run arrival legs like
surface ports do, instead of the current one-frame dock — physics.test.js
currently pins the refusal ("an orbital station refuses to run an arrival,
with no shaft to run"), so that test changes with it. The legs carry the
ship through the mouth, down the hall, to the berth; `Sim.arrivalPose`
drives which leg you are on and `enclosedPort()` flips the world to interior
mid-sequence. Surface ports already do all of this. Reuse, not new machinery.

The models' `gates` / `innerGates` anchors are the apertures those legs
should be threaded through, and `pockets` are where the door leaves stow —
so a modelled station can eventually animate its own doors instead of
wearing the procedural leaves.

---

## THE TWO BUGS (`f9e2569`)

Astra's report: a mission that could not be finished, and a ship oscillating
off a station it could not reach. She diagnosed the cause herself.

**Loading a save made you a fugitive.** main.js detects a dock as the EDGE
from not-docked to docked — right, because there are two places a ship can
dock and only one is a call site. But loading runs `newGame` first (clears
`wasDocked`, leaves the ship flying) and only then drops the snapshot in,
parking the ship on the clamps. Next frame saw that edge and ran the whole
arrival: contracts settled again, and `Combat.arriveAtPort` booked the player
for arriving UNANNOUNCED at a port they had been sitting in since before they
saved. 500 cr and a FUGITIVE flag — and a fugitive's ports do not open, so
every door in the system shut and the open mission became impossible.

Fixed in `Save.restore`, which is the one function that knows the ship did
not fly here. Same guard that already keeps `wasteCustoms` from re-levying on
load. The test was checked against a reverted fix and fails four ways
without it.

**A shut door said nothing.** Auto-dock flew the whole approach into a port
that would never open and sat in the envelope. The one message named a
bounty whichever bar it actually was, so a pilot ordered out over a hold of
tailings was sent to fix the wrong thing; the CLEARANCE readout said NOT
REQUESTED in amber, which tells you to go and ask — the one action that
cannot help. Now: `Combat.dockRefusal(G, port)` → `null | {why, short, text}`,
read by startAutodock (refuses up front), advanceAutodock (gives up if the
doors shut mid-approach), the DENIED line, the CLEARANCE row (third state,
REFUSED, red), and the docking panel (DOORS SHUT). `dockRefused` is one line
over it so yes/no and in-words cannot drift.

**The seed is in the pause menu** now, leading the career line. It was only
on the title screen, which you have to abandon a career to see.

### Getting an already-broken career unstuck
The fix stops it happening again; a save that already carries the flag still
has it. Two ways out, both live:
- F4, hail the POLICE channel (marked `*`), it quotes, then **Y** to pay.
  Works at range — no docking needed, which is the point.
- Or jump to another system: `Combat.fleeSystem` clears the pursuit on the
  jump ("escaping clears the pursuit, not the record"). The 500 cr bounty
  stays but sits under WANTED_HUNT, so doors open again.

---

## Measurements taken this session (so nobody re-derives them)
- Auto-dock CONVERGES. Swept 38 station approaches across eight seeds, laden
  with a full hold, from 10,000 km and from 2 Mm: every one docked. The
  guidance law is not the problem; the closed door was.
- One sweep "failure" was the fixture's fault — placing the ship 10,000 km
  from a station in an arbitrary direction can put it inside the host planet.
  Worth knowing for the next harness. It did expose one small real thing:
  **auto-dock stays engaged, silent, when the ship is landed or crashed** —
  it burns nothing and says nothing while the AUTODOCK readout sits there.
  `startAutoMode` checks `G.ship.landed`; `startAutodock` and
  `advanceAutodock` do not. Unfixed, small, worth a line.
- At cruise dropout you are handed a circular orbit whose direction comes
  from `cross(worldZ, up)`, not from the target's. Station inclinations are
  0–6° so it happens to come out prograde and the mismatch is small; it is
  luck rather than design. Left alone.

## Still un-flown — needs eyes in the browser
- Everything under "NOT YET LOOKED AT" above.
- Landing FEEL and its damage thresholds: `LAND_SAFE_SPEED` /
  `LAND_FATAL_SPEED` / `LAND_DAMAGE_MAX` / `LAND_GEAR_UP_MULT` in sim.js.
- Gas-giant banding knobs in gl.js: `lati*7.0`/`lati*15.0` band count,
  `0.72`/`0.22` belt/zone contrast, `3.4`/`2.2` storm-oval ellipse.
- The GUNS tab layout on F5.

## Traps this project keeps hitting
- GREP FOR A TOP-LEVEL NAME BEFORE ADDING ONE. Duplicate declarations
  silently shadow and kill a whole IIFE file's later scope. Bitten 3+ times.
  `node tools/lint-globals.js` catches the cross-module cases.
- render.test.js is order-dependent — a new block calling newGame must
  snapshot/restore the tracked prefs or it breaks a test thousands of lines
  away. (The two blocks added this session use `newFlying` and touch no
  prefs, which is the safe shape.)
- Unit tests are STRUCTURALLY BLIND to layout and appearance.
- **A test that passes with the fix reverted is not a test.** The load-as-
  arrival test looked fine until it was checked both ways; the first version
  restored on top of an already-docked ship, so the edge it was meant to
  catch was not there to cross.

## PROCESS
- NEVER `git stash` with uncommitted work you care about. To check whether a
  failure is pre-existing use `git diff --stat` / `git show`, never stash.
- COMMIT AFTER EVERY GREEN STEP.
- PowerShell has no heredoc. `git commit -F COMMITMSG.txt`, then delete it.
  Use `;` not `&&`.
- File locks: if sim.js/gl.js give EPERM or "File exists", the game is open
  in a browser tab OR a failed git op left a handle. Close the tab; if that
  fails, restart the Claude Desktop app to remount X:.

## Toolchain note from this session
The workspace shell could not mount X: for most of the session (a Windows
update on 2026-09-08 breaks the Plan9 share). The fallback that worked, and
worth reaching for again if it recurs: stage `src/`, `test/`, `tools/` into
the cloud container with `device_stage_files` and run the suites there with
plain node — the tests need nothing but node — then write the changed files
back with `device_commit_files` and commit via Desktop Commander's shell.
Everything in this session was verified that way.

## Playtest recipe
1. DC start_process: `node tools/serve.js` (127.0.0.1:8732, no-store).
2. Open http://127.0.0.1:8732/index.html#kawartha in the browser pane.
3. Drive via javascript_tool (window.Game/Sim, synthetic KeyboardEvents).
4. Screenshots LAG several seconds behind state — change state, wait 4–8 s,
   THEN shoot.
5. Tidy up: close the tab, force_terminate the server pid. LEAVE NO SERVER
   RUNNING — a stray serve.js is what locked sim.js once.
6. Tests against X: directly (PowerShell, `;` not `&&`):
   `cd "X:\Shared_AI\Procedural Space Game" ; node test/render.test.js`
