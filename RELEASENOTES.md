A ship that flies where it points, and a channel telling you what everyone else is doing.

## Downloads

- **Manifest-0.4.1-beta-portable.exe** — run it, no install.
- **Manifest-Setup-0.4.1-beta.exe** — installer, per-user, choose your own directory.

Windows x64. Both are unsigned, so SmartScreen will warn: *More info* → *Run anyway*.
Linux builds (AppImage, .deb, tar.gz) are attached when the Linux runner produces them.

## What's new since 0.4.0

**Vector assist — Shift+]**. It points your momentum where your nose is
pointing. Not a heading hold and not a speed limiter: it commands the
thrusters to kill the part of your velocity that is *sideways*, so the way you
are travelling converges on the way you are facing, and the cockpit stops
lying to you about where you are about to be. It has full authority over the
thruster budget, which is why every hull's thruster capacity went up with it
(12/10/14/16 → 16/13/19/21 units).

In atmosphere it hovers. Engage it in air and it holds the altitude it was
engaged at *and* kills your drift over the ground — both, so a hull parked
over a landing pad stays over that landing pad. Docking assist stands down
while vector is on, and the STATUS column says so rather than leaving you to
guess which autopilot has the stick.

**The SHIP page reads mass · thrust · gravity.** Gravity in m/s² for whatever
body you are nearest, and thrust as what your engines can actually produce
against it. "Can I lift off from here" is now a number you read instead of a
question you answer by trying.

**A comms channel, overhead at your 3 o'clock.** A sixth screen, and the first
that is neither dash nor bulkhead — it hangs above your right shoulder and
leans down at you. It lists every ship in range: its ID, what it is saying,
and where it is bound.

What a ship says is what it is *doing* — the phase it is flying, its
destination, what is in the hold — which makes the channel an instrument
rather than decoration. A hauler announcing drums is telling you there is
reactor waste here worth being paid to take away. A heavy calling the marker
is telling you the apron is busy. A ship on final tells you which port is
live. It is a survey of the system conducted by the people flying it, and it
costs nothing to listen.

Like everything else about traffic, it is a function of the timetable and the
clock rather than something stored, so skipping six months of game time and
tuning in gives you what those ships would have been saying then.

**The fleet.** Capital ships fly: twice a patrol cutter's size, a third of its
acceleration, and they do not chase you, because a capital is already where it
intends to be. Eight across sixty systems, in the places a navy is holding
hardest.

**Fleet carriers are places you can dock.** A station whose building is a
warship, sited where a naval garrison already sits, wearing the fleet's name —
so the readout says FNS Redoubt where it used to say a dock. Thirteen across
sixty systems. They trade like a station and look like nothing else in the
sky.

## Also in 0.4.0, if you are coming from 0.3.0

Two hundred stars in 48.5 light years and every fuel tank up a third to match;
the chart as something you build by flying, with faction territory filled only
where you have been or bought the sheet; restricted systems and the
transponder that opens them; the fuel chain paying at every step, waste
through fissiles to military fuel slugs; hailing other ships for directions,
trade or fuel; two missile racks and contrails; stations painted in their
owner's colours; and contract freight that is bonded rather than yours to
sell. The 0.4.0 notes have the detail.

## Known issues

- Twelve of the forty-eight berths — the cradle stations and the three large
  spine berths — are still walled in short of their doors. The rest are open.
- The doorways are cut but not yet dressed, so a shut blast door reads as
  plain plating rather than as a door.
- Restricted systems are a door you cannot open. What is behind them is not
  built yet: a penal colony has no prison in it.
- Capital ships and fleet carriers can be seen, hailed and docked at, but the
  navy does not yet give you anything to do at one. Missions and a
  carrier-only outfitting list are the next step.
- Local traffic still carries nothing, which the new comms channel makes
  audible: most short hops between two ports above the same world announce an
  empty hold.
- In the exterior view at a berth, the camera stops at deck level rather than
  going under it; at some angles that leaves you looking along the floor.
- Saves live under `%APPDATA%\Manifest`. If you ran an earlier build called
  Procedural Space Game, this one copies your careers across on first run and
  leaves the originals alone.

## Careers from 0.4.0 and 0.3.0

They load. A save written before charts existed is read as having charted
everywhere it visited, so no career loses territory it earned, and ships
carrying missiles keep them as a single rack.

## Seed

Same seed, same universe, every time — the galaxy is generated, not stored.
The current seed is shown in the pause menu.
