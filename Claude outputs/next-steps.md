# Manifest — next steps

Written 2026-09-16, at `f43ef7b` / **beta 1.0**.
Suite green: 2,145 checks, 10 files.

The previous version of this note is superseded: Tier 1 and Tier 2 are done.

---

## What 1.0 closed

- **1.1 Local traffic carries cargo.** Feeders carry a share of the body's
  through-flow, registered twice (arriving and *leaving*) so nothing was
  inflated. Measured: median price moved 0.8765 → 0.8756.
- **1.2 Capitals intervene.** Positional rather than pursuing — a four-times
  witness radius and a report that cannot be bought at any standing.
- **1.3 Fleet carriers are institutions.** Their own board, the licensed
  military-fuel haul (clearance checked at signature rather than at
  generation, which is what unblocked it), and stores that ignore the local
  development gate.
- **2.1 Flyable starports.** All 48 berths open; the twelve that were sealed
  were thirty-six faces, not a doorway. Bays lettered, concourse and lift
  shafts in, hoardings turning over.
- **Passengers**, end to end: habitation units, passage contracts with all
  three consequences, liners that carry people.
- **Syndicate docks** in black and red.

---

## Tier 1 — the things 1.0 created

Each of these exists because something in 1.0 landed and left a shape behind.

### 1.1 The navy campaign
A carrier posts contracts and a capital holds a volume, and neither of them
has a *story*. The licensed haul was the proof that a carrier can gate work
on standing; the same mechanism supports a chain — a first run that earns
you the licence, an escort, a delivery into a warship yard.

This is also the natural door into Tier 3, which is why it moved up.

### 1.2 Passage that goes wrong
Passage works and its failure modes are all economic. What it does not have
is an *event*: a passenger who is not who they said, a medical emergency
that makes the deadline real, a rotation that turns out to be a defection.
The hooks are already there — `rough`, the walk-off check at every dock —
and the contract carries enough state to hang one on.

### 1.3 The berth camera
Still stops at deck level, so some angles look along the floor. It is now
the most visible remaining fault, because there is finally something in the
bay worth looking at.

---

## Tier 2 — correctness

- **The storage/corridor bug.** Turning localStorage on in the render suite
  makes the slipspace corridor section fail, and it has never been
  diagnosed. A test that only passes with a feature disabled is a test we
  do not trust. This has outlived three releases.
- **A forged transponder.** The issued one cannot fail, which makes
  restricted space a binary you either have or do not. A forgery that can be
  detected is where the tension actually lives.
- **The factory spread is still under water**, and still needs your call
  rather than a fix — see the decision list below.

---

## Tier 3 — the room behind the locked door

### 3.1 Furnish restricted systems
Penal colonies and warship yards are flagged, sited and gated, and nothing
is inside them. This stayed last through 1.0 and should not stay last
through 1.1: it is the only pure-new-content item on the list, and it is now
much better supported than it was, because the navy has a board to send you
from and a carrier to send you off.

---

## What I would actually do

**The navy campaign, then furnish a warship yard.** They are the same piece
of work approached from two ends — the campaign needs somewhere to send you
and the yard needs a reason for you to be there — and between them they turn
three systems (carriers, capitals, restricted space) from things that exist
into things that happen.

The berth camera is an hour and should be done first because it is in front
of you every single docking.

## What needs a decision from you

1. **Factory spread** — leave it under water (player-favourable, physically
   honest) or cap the feed multiplier so factories book a profit? Asked
   before 1.0 and still open.
2. **Transponder location** — stays in the general catalogue at standing 40,
   or moves behind a carrier now that carriers have stores of their own?
3. **How far the navy campaign goes** — a three-contract chain that ends in a
   licence, or an arc with its own faction standing track like the existing
   campaigns in `arcs.js`?
