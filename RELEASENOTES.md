A galaxy you have to go and look at, and a supply chain worth flying.

## Downloads

- **Manifest-0.4.0-beta-portable.exe** — run it, no install.
- **Manifest-Setup-0.4.0-beta.exe** — installer, per-user, choose your own directory.

Windows x64. Both are unsigned, so SmartScreen will warn: *More info* → *Run anyway*.
Linux builds (AppImage, .deb, tar.gz) are attached when the Linux runner produces them.

## What's in it

**The chart is something you build by flying.** Territory is no longer drawn
for powers you have never heard of. Arriving in a system tells you whose flag
flies over it; everything else is black until you go, or until you buy the
local sheet at a port — eight light years around it, priced per system and
rising with distance, and you cannot buy the same sheet twice. Faction space
is filled in its owner's colour, more saturated the harder that power holds
the system, with bold dotted borders in the faction's own colour. The edge
against uncharted space is the most useful line on the map.

**Restricted systems.** Penal colonies sit as far from their power's capital
as its flag reaches; warship yards sit as deep inside as it reaches. Six of
them in two hundred systems, and a course into one will not lay in without a
restricted-space transponder, which the navy sells to people it already
trusts. Nothing within fourteen light years of home — the first galaxy built
with this turned the obvious first jump of a new career into a prison.

**The fuel chain pays at every step.** Ten tonnes of reactor waste reclaim
into five tonnes of fissiles at an ordinary reprocessing plant, or into one
military fuel slug at a licensed one; five tonnes of fissiles press into one
slug at a milfuel factory, which is a new kind of station. A slug is priced
as what it takes to make, so each link of the chain is worth more than the
one before it — and a reprocessing plant is no longer the one industry in the
game with an input and no product, which gives the waste run a return leg.
Military fuel is the best paying cargo there is and it is an offence to carry
without standing, which is the trade.

**A bigger galaxy and the tanks to cross it.** Two hundred stars in 48.5 light
years, and every hull's fuel capacity up by a third to match. The loneliest
star is nine light years from its nearest neighbour; the tightest hull still
has ten per cent in hand.

**Docks look like somebody's.** Every station wears its owner's colours —
trim and plating both, Syndicate red included.

**Ships to talk to and ships to look at.** Hail traffic for directions (they
chart a system for you, once), to trade off what they are actually carrying,
or for fuel when you are nearly dry and a long way from anywhere — it costs
more than a port would charge, which is the point. And there are three times
as many large hulls lying off the docks, which used to be one freighter drawn
nine times in the same spot.

**Two missile racks.** A hull carries one rack per seeker type — a Dart one,
a Talon or Kestrel two, a Mule three — and Shift+B swaps which is armed. An
empty rack hands the trigger to the next one. Missiles trail smoke, and so do
hulls flying through atmosphere.

**Fixed, and worth naming:** a berth the port promised is no longer a berth
you stole. Clearance is granted only when there is room, so a ship cleared on
approach that arrives into a port which filled up during the flight was being
billed for the port's own overbooking — and it stacked with the
unannounced-arrival citation. A brand-new career found it: the first line a
player ever read was being logged for taking someone's berth.

**Also fixed:** contract freight is yours to deliver, not to sell. A haul
hands you the cargo for nothing and nothing stopped you selling it at the next
port — twelve tonnes of AI cores against an eight-hundred credit fee. It fills
your hold, it says "under contract" in the manifest, and the trade screen
refuses it by name. You can still jettison it; that is a breach you chose.

## Known issues

- Twelve of the forty-eight berths — the cradle stations and the three large
  spine berths — are still walled in short of their doors. The rest are open.
- The doorways are cut but not yet dressed, so a shut blast door reads as
  plain plating rather than as a door.
- Restricted systems are a door you cannot open. What is behind them is not
  built yet: a penal colony has no prison in it.
- Local traffic still carries nothing. Most short hops between two ports above
  the same world are running empty.
- In the exterior view at a berth, the camera stops at deck level rather than
  going under it; at some angles that leaves you looking along the floor.
- Saves live under `%APPDATA%\Manifest`. If you ran an earlier build called
  Procedural Space Game, this one copies your careers across on first run and
  leaves the originals alone.

## Careers from 0.3.0

They load. The chart knows everywhere you have already been, because a save
written before charts existed is read as having charted everywhere it visited
— no career loses territory it earned. Ships carrying missiles keep them as a
single rack.

## Seed

Same seed, same universe, every time — the galaxy is generated, not stored.
The current seed is shown in the pause menu.
