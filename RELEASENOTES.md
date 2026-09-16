Gravity, clockwork, cockpit and cargo. First build handed to anyone.

## Downloads

- **Manifest-0.3.0-beta-portable.exe** — run it, no install.
- **Manifest-Setup-0.3.0-beta.exe** — installer, per-user, choose your own directory.

Windows x64. Both are unsigned, so SmartScreen will warn: *More info* → *Run anyway*.

## What's in it

Stations are real places now rather than shapes seen from outside. Imported
station art with its own interiors, berths you are flown into and can leave
again, blast doors and airlocks per compartment, a lit stand under the ship
sized to the ship rather than to the station, and the MFD console with its
F5 → PANELS tab for reassigning instruments.

Most of what made that possible was a run of bugs that had been hiding each
other:

- The mesh shaders answered "this vertex is behind the eye" by moving it off
  screen instead of clipping, so the triangle still drew from a made-up
  corner. Inside a station that painted whole walls as flat slabs across the
  canopy. It is also what made the console MFDs skew when you turned your
  head. The near plane belongs to the hardware now.
- Docking clearance survived the visit, so releasing the clamps re-docked you
  on the next frame. Leaving spends it.
- The outer doors were run off the arriving flag, so they shut on the ship
  they had just let go.
- Gear-to-floor clearance was a fraction of the station's radius, which is
  1.2 m at a landing pad and 80 m at a station — your ship was parked eighty
  metres above its own deck.
- The camera clamped against a room whose floor was measured a hundred metres
  inside the plating, so the exterior view went under the deck.
- And the berth doorways were never cut. The leaves slid and the simulation
  believed there was a corridor, but the wall had no hole in it — 48 of 48
  modelled berths were sealed.

## Known issues

- Twelve of the forty-eight berths — the cradle stations and the three large
  spine berths — are still walled in short of their doors by something else.
  The rest are open.
- The doorways are cut but not yet dressed, so a shut blast door reads as
  plain plating rather than as a door.
- In the exterior view at a berth, the camera stops at deck level rather than
  going under it; at some angles that leaves you looking along the floor.
- Saves live under `%APPDATA%\Manifest`. If you ran an earlier build called
  Procedural Space Game, this one copies your careers across on first run and
  leaves the originals alone.
- The installer uses a new application id, so an older install under the old
  name stays installed and has to be removed by hand.

## Seed

Same seed, same universe, every time — the galaxy is generated, not stored.
The current seed is shown in the pause menu.
