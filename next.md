# next.md — where the station-interior build picks up

Written end of the 2026-09-12 session. Everything below is on disk and
committed; nothing here is uncommitted work at risk.

## Committed this session (all tests green except one pre-existing economy failure)

- `7a3c669` — gas/ice giants render as latitude bands (were fBm mud-balls). gl.js.
- `80317b6` — surface-pad landing: land at ANY speed, hard touchdowns cost hull,
  gear-up multiplies the hit. Fixed a real latent bug on the way — landing damage
  was written to `ship.hull`, which does not exist; the field is `ship.hullHp`.
  sim.js + physics.test.js.
- `860e67d` — GUNS moved off the deck MFD cycle into a tab on the F5 SHIP screen
  (clickable tab + Tab key toggle). main.js, screens.js, render.test.js.
- `6d99446` — station interiors LAYER 1: `Gen.stationBay(station)`. generate.js.

## The one known pre-existing failure (NOT from this work)
`economy.test.js`: "no world manufactures above its development level — 17
violations". Present on a clean tree before any of this session's edits; economy.js
and generate.js's economy code were never touched. Confirmed via `git diff --stat`.
Leave it or fix it separately — it is not part of the station work.

## The goal (in Astra's words)
"To be able to watch the ship as it transits the inside of the station and gets
docked at its berth." This is the FE2 CINEMATIC arrival — carried in while you
watch — NOT manual fly-in. It reuses the surface-port arrival-leg machinery,
widened to orbital stations.

## Decided design
- Interior does NOT spin; exterior ring DOES. Rationale: a rotating habitat docks
  along its spin (hub) axis — you approach down the still centre and the ring turns
  around you, not the hall you sit in. This is both the FE2 feel and the only
  version that reads/flies sanely. `stationFrame(station, still)` in main.js already
  gives both frames and already spins with t.
- The interior is a HALL along the hub axis (open bay), NOT a shaft-down-into-ground.
  That is why L1 is a separate `stationBay()` and not just `bayGeometry` pointed at a
  station — different axis, different proportions (wide+shallow hall vs narrow+deep
  well). But it returns the SAME SHAPE of object bayGeometry does, so every consumer
  reads it with no second code path.

## What L1 gave us (done)
`Gen.stationBay(station)` → geometry object with the same keys as `Gen.bayGeometry`
(depth, mouthR, throatR, chamberX, chamberY, floorZ, ceilZ, berthY, standoff,
berths, lift) plus `station:true`. Exported. Constants are `SBAY_*` in generate.js
just above `stationBay`, tune-by-eye.

## Layers still to build (one commit each, test before committing)

### L2 — the mesh (first thing you can SEE)
Render the hall from `stationBay()` in `stationFrame(station, false...)` so it spins
as one piece with the ring. Look at render.js `stationMeshes()` — there is already an
`underground`/shaft mesh built from `bayGeometry`; the station hall is the sibling of
that, built from `stationBay` along the hub axis instead of ground-down. Reuse the
mesh kit (box/tube/rimRing/etc). Squared geometry per Astra's note. Verify by eye in
the browser (render tests are blind to appearance — see playtest recipe below).

### L3 — placement + camera (fixes the screenshot)
- Put the ship in a berth inside the hall via `berthOffset` interpreted in the station
  frame (berthOffset currently calls `bayGeometry`; it needs to use `stationBay` when
  the target is a station — branch on `port.kind==='station'` or the `station` flag).
- Widen `enclosedPort()` in main.js to return the station when you are berthed inside
  it. The function's own comment (main.js ~4388) EXPLICITLY invites this: "when the
  orbital stations grow the interiors... the way in is to widen this function."
- Add a station camera clamp (sibling of `clampCameraToHangar`) that measures against
  the hall in the ROTATING station frame — this is the actual fix for "station rotates,
  camera stays fixed / sweeps past". The camera must ride the interior.

### L4 — the watchable transit (the actual ask)
Widen `beginArrival` (sim.js) so orbital stations run arrival legs like surface ports
do, instead of the current one-frame dock (it currently refuses stations — "a bare pad
docks in one frame"). The legs carry the ship through the mouth, down the hall, to the
berth, while `Sim.arrivalPose` drives which leg you are on and `enclosedPort()` flips
the world to interior mid-sequence — all of which surface ports ALREADY do. This is
reuse, not new machinery.

## Still un-flown — needs eyes in the browser
- Landing FEEL and its damage thresholds: `LAND_SAFE_SPEED` / `LAND_FATAL_SPEED` /
  `LAND_DAMAGE_MAX` / `LAND_GEAR_UP_MULT` in sim.js (near BASE_HEAT_SHED). Deliberately
  first-pass numbers, meant to be tuned by feeling a touchdown.
- The gas-giant banding tuning knobs (in gl.js banded branch): `lati*7.0`/`lati*15.0`
  band count, `0.72`/`0.22` belt/zone contrast, `3.4`/`2.2` storm-oval ellipse.
- The new GUNS tab layout on F5.

## Confirmed working in-game by Astra
Lasers fire (space). The "guns broken / can't fire" earlier was a half-written sim.js
during a file-lock episode, not a logic bug.

## Traps this project keeps hitting (from CLAUDE.md / architecture notes)
- GREP FOR A TOP-LEVEL NAME BEFORE ADDING ONE. Duplicate declarations silently shadow
  and kill a whole IIFE file's later scope. Bitten 3+ times.
- render.test.js is order-dependent — a new block calling newGame must snapshot/restore
  the tracked prefs or it breaks a test thousands of lines away.
- Unit tests are STRUCTURALLY BLIND to layout and appearance. Anything visual must be
  looked at in the browser.

## HARD-WON PROCESS LESSONS FROM THIS SESSION (do not repeat)
- NEVER `git stash` with uncommitted work you care about. A stash collided with CRLF
  conversion, deleted sim.js + gl.js, and lost uncommitted landing+banding work (both
  had to be rebuilt from the chat). To check if a failure is pre-existing, use
  `git diff --stat` / `git show`, NEVER stash.
- COMMIT AFTER EVERY GREEN STEP. The back half of the session only stopped bleeding
  once each feature was committed the moment its tests passed.
- File locks: if sim.js/gl.js give EPERM or "File exists", the game is open in a
  browser tab OR a failed git op left a handle. Close the tab; if that fails, restart
  the Claude Desktop app to remount X:. Reads may work while writes are locked.

## Playtest recipe (the browser lies less than you'd think, but it lags)
1. DC start_process: `node tools/serve.js` (serves on 127.0.0.1:8732, no-store).
2. Open http://127.0.0.1:8732/index.html#kawartha in the browser pane.
3. Drive via javascript_tool (window.Game/Sim, dispatch synthetic KeyboardEvents).
4. Screenshots LAG several seconds behind state — change state, wait 4-8s, THEN shoot.
5. Tidy up: close the tab, force_terminate the server pid. LEAVE NO SERVER RUNNING —
   a stray serve.js is what locked sim.js this session.
6. Run tests with DC against X: directly (PowerShell: use `;` not `&&`):
   `cd "X:\Shared_AI\Procedural Space Game" ; node test/render.test.js`
