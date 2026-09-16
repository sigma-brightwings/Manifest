The bays are open, the traffic is carrying something, and the people in the back can hear you.

## Downloads

- **Manifest-1.0.0-beta-portable.exe** — run it, no install.
- **Manifest-Setup-1.0.0-beta.exe** — installer, per-user, choose your own directory.

Windows x64. Both are unsigned, so SmartScreen will warn: *More info* → *Run anyway*.
Linux builds (AppImage, .deb, tar.gz) are attached when the Linux runner produces them.

## Why this one is 1.0

Because the loop closes. You can fly into a bay, read its number off the
door, see where everybody else is going and what they are carrying, take a
contract that is about people rather than tonnage, and know at a glance
whose dock you are landing on. Nothing in that sentence was true a week ago.

## Every berth is open

All forty-eight modelled berths can now be flown into and out of. Twelve
of them — all three cradle stations and the largest spine berth — had been
sealed since doorways were first cut, and the cause was not the doorway.
It was a single enormous interior face lying across the alcove a quarter
of the way to the door, with every corner of it outside the opening.
Thirty-six faces in the whole library, and they stopped twelve bays dead.

**And the bay is a place now.** A concourse gallery runs along the back
with lit windows in it — some of them dark, because a building where
everybody is in tonight does not look like a building. A lift shaft stands
at each end with its car showing. The stand you park on sits on the floor
rather than in it. And the hoardings turn over every few seconds,
advertising things you can actually buy, fly, or be fined for.

**Every door says which bay it is.** BAY low on the left, the number large
on the right, painted on the leaves — so when the doors part, the legend
parts with them.

## Syndicate docks, at a glance

A Syndicate station is black with red trim and looks like nothing else in
the sky. Not the polite hue-shift every other power gets: the plating is
crushed into the bottom fifth of its range and the trim turned all the way
up. You will know before you are close enough to read the transponder.

## The traffic carries cargo

Short hops between two docks over the same world used to fly empty — and
once the comms channel existed you could hear them saying so. They are
feeders: the orbital port is where the system's cargo lands and the
surface port is where it is going, so they carry a share of it. 98% of
local shuttles now have something aboard.

Nothing inflated. Every leg is registered twice — arriving at one dock and
*leaving* the other — so the total supply in a system is exactly what it
was. Prices moved by less than a tenth of a per cent.

## Passengers

**Habitation units** trade eight tonnes of hold for four berths, and
without one you cannot take passage work at all. It is the first fitting
in the catalogue that changes what work you are offered rather than what
you can survive.

**Passage contracts** run port to port and out to neighbouring stars. The
people in the back react to three things: being shot at (a rough trip pays
45% less, and they will tell you at the door), arriving late (which does
not tear up the contract, because they are still aboard being late with
you), and who they are travelling with — nobody boards a captain the local
flag is hunting, and nobody stays aboard a ship they discover is running
contraband. That last one is checked at every dock, not just at boarding.

**And the liners carry people at last.** They have been in the sky since
the traffic model learned the word and have always flown freight. Four
hundred of them across forty systems, a couple of hundred aboard each.

## The fleet has work at it

A fleet carrier posts contracts nobody else does, including the **licensed
military fuel haul** — the navy will hand you seven tonnes of slug if it
trusts you with it, and tell you why not if it does not. A carrier's
stores are its own rather than the local economy's, because a warship
moored off a mining head still has the armoury it sailed with.

**Capital ships do something now.** They do not chase — a third of a
cutter's acceleration never catches anybody — so what they do is hold a
volume. Inside a capital's watch you are seen four times further out than
anywhere else, and what it sees cannot be bought off at any price or any
standing. A system with a capital in it is not uniformly harder; it has a
place in it where you do not do business.

## The market tells you which prices are worth acting on

Green means *do it here*, and the two columns run opposite ways: a cheap
ask and a dear bid are both green. The shade says how good — full green is
the best five per cent of prices in the galaxy, and a row that only just
qualifies is barely tinted. The reference is the commodity's base price,
so green survives being carried between systems.

## Also since 0.4.1

Vector assist and atmospheric hover (Shift+]), the comms channel on the
overhead screen, fleet carriers and capital ships in the sky, two hundred
stars, the chart you build by flying, restricted space, the fuel chain
that pays at every step, hailing, missile racks and contrails.

## Known issues

- Restricted systems are a door you cannot open. What is behind them is
  not built yet: a penal colony has no prison in it.
- Capital ships and fleet carriers can be hailed and docked at, but the
  navy's own campaign is not written.
- In the exterior view at a berth, the camera stops at deck level rather
  than going under it; at some angles that leaves you looking along the
  floor.
- Saves live under `%APPDATA%\Manifest`. If you ran an earlier build
  called Procedural Space Game, this one copies your careers across on
  first run and leaves the originals alone.

## Careers from 0.4.x and 0.3.0

They load. Ships come back with the hold the hull actually has, passengers
and all; a save written before charts existed is read as having charted
everywhere it visited, so no career loses territory it earned.

## Seed

Same seed, same universe, every time — the galaxy is generated, not
stored. The current seed is shown in the pause menu.
