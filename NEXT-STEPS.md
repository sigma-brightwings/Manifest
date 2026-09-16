# Manifest — next steps

Written 2026-09-16, at `69fed3c`, on top of beta 0.4.0.
Suite green: 2,190 checks, 11 files.

---

## The one-line version

**0.4.0 built a lot of places and not much to do in them.** The next pass
should be about consequence, not about new nouns. Three of the last five
things we shipped — fleet carriers, capitals, the chatter panel — are
*visible* and *inert*. A fourth, local traffic, is now audibly inert,
because the channel reads out holds that have nothing in them.

So the recommended order below is not "hardest first" or "biggest first".
It is **finish what is already on screen, then open a new room.**

---

## Tier 1 — things that are already visible and do nothing

These cost the least and pay the most, because the art, the siting and the
data are already built. Every one of them is wiring, not construction.

### 1.1 Local traffic carries cargo
**Why first:** 83% of routes are empty local hops, and the chatter panel now
announces them. A ship saying it is running empty between two docks over the
same world is the game telling on itself. This is the single loudest
remaining lie in the sim.

**The shape we agreed:** give local runs a share of the system's through-flow
rather than inventing demand for them.

**The caveat that has always blocked it, restated honestly:** it moves
prices. Local legs currently contribute nothing to the market, so switching
them on is a supply increase across every system at once. That is not a
reason not to do it — it is a reason to **measure the price shift before and
after across forty systems** and decide the share from the measurement rather
than from a guess. Same method as the milfuel shelf.

**My opinion:** do this one next, and do not let the price worry defer it
again. It has been deferred twice.

### 1.2 Capitals intervene
A capital that is seen and never acts is set dressing with a hull budget.
It does not chase — that was the design, and it is right — so its behaviour
has to be *positional*: it is already where it intends to be, so the thing it
does is **make where it is matter**.

Cheapest honest version: a capital in-system raises the effective response to
crime near it, and hailing one gets you a different register than a cutter —
it does not do directions or trade, it challenges.

### 1.3 Fleet carriers become institutions
They dock, they trade, they wear the fleet's name. What is missing is the
reason to fly to one:

- a **navy mission board** that only a carrier offers
- a **carrier-only outfitting list** — the transponder should arguably live
  here rather than in the general catalogue
- standing gates on both, so the carrier is a place you earn access to

This also unblocks the **licensed haul contract** below, because a
carrier-issued contract is per-port-and-standing by construction, which is
exactly the thing the generic board cannot express.

---

## Tier 2 — the thing that was asked for first and still is not built

### 2.1 Flyable starports
Owed since the same conversation that produced the chatter panel, and the
only Tier-2 item because it is genuinely construction rather than wiring.

The recon in `enterable-starports.md` says most of the geometry exists. The
blocker is not the shaft, it is the **12 berths still walled short of their
doors** — 3 cradles and 3 large spine berths, blocked 53–106 m out by an
obstruction that is not the aperture cut. Flying into a port you cannot then
reach the back of is worse than not flying into it.

**Order within this item:**
1. Find the 12 berths' actual blocker (it is a different obstruction than the
   one already solved — do not assume the aperture fix generalises).
2. Dress the doorways. A shut blast door currently reads as plain plating,
   which means the player cannot tell a closed door from a wall.
3. Then open the shaft.

---

## Tier 3 — correctness and honesty items

Not glamorous. Each one is a place the game currently knows something and
says something else.

- **The exterior camera at a berth** stops at deck level, so some angles look
  along the floor. Small, visible on every single docking.
- **The factory spread is under water.** A milfuel factory buys feed as a
  desperate importer (~1.6× base) and sells slugs as an exporter (~0.95×), so
  at its own bid and ask the conversion loses money. This is true of any port
  that both imports and exports one chain, and it is *what makes the run pay
  for the player* — so it may be correct as-is. **This needs your call, not a
  fix.** If you want factories to book a profit, the lever is capping the
  local multiplier on a factory's feed row.
- **The storage/corridor bug.** Turning localStorage on in the render suite
  makes the slipspace corridor section fail, and it has never been diagnosed.
  A test that only passes with a feature disabled is a test we do not trust.
- **A forged transponder.** The issued one cannot fail, which makes restricted
  space a binary you either have or do not. A forgery that can be detected is
  where the tension in restricted space actually lives.

---

## Tier 4 — the room behind the locked door

### 4.1 Furnish restricted systems
Penal colonies and warship yards are flagged, sited and gated. Nothing is
inside them. A penal colony has no prison in it.

This is deliberately last, not because it is unimportant but because it is
**the only item on this list that is pure new content** — everything above is
finishing something that already exists. It will also be more fun to build
once carriers have missions, because "the navy sends you into a yard" is a
better door than "you bought a transponder and went".

---

## What I would actually do

If it were my call and we had one session: **1.1, then 1.3.**

Local cargo makes the chatter panel true, which makes the survey-by-listening
idea work the way it was designed. Carriers-as-institutions gives the fleet a
reason to exist and hands us the licensed haul contract for free.

Capitals (1.2) are tempting because they are cheap, but a capital that
challenges you is only interesting if there is somewhere to be challenged
*on the way to*, and that is Tier 1.1 and 1.3.

## What needs a decision from you

1. **Local traffic share** — do we accept a system-wide price shift to make
   local legs real? (I think yes, measured.)
2. **Factory spread** — leave it under water (player-favourable, physically
   honest) or cap the feed multiplier so factories book a profit?
3. **Transponder location** — stays in the general catalogue at standing 40,
   or moves behind a carrier?
