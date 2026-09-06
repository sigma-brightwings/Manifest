# Design notes: beam weapon tiers, and the pulsar neutrino beacon

Two related design threads from discussion, consolidated for later
integration. Both follow the same method: take a real physical property
seriously and let it hand you the game-balance number, rather than picking
one by feel. That's consistent with the game's existing design language
(mass budget on cargo, real reaction mass cost, atmosphere modeled as a
bucket vs. a pipe).

---

## Part 1 — Weapon tiers

Context: combat currently resolves as an abstract hit-chance roll (placeholder,
built that way to get downstream systems testable). Moving to manual aim /
hitscan beams with a blaster-style animation, plus missiles as the only
projectile-with-travel-time weapon.

### Why beams, why missiles are the only projectile

Primary weapons are particle beams (photon-based for most ships, muon
accelerators for capital ships and planetary defense). At combat ranges these
are effectively instantaneous — no travel time, no leading a shot. That
concentrates all the "predict where a maneuvering target will be" skill onto
missiles alone, which is a clean split:

- **Beams** — pure aim/precision skill. Can you keep it on target while both
  ships maneuver.
- **Missiles** — Newtonian interception skill. Can you predict where a
  burning target will actually be by the time it arrives.

Turret AI for beam weapons only needs to track-and-hold (cheap); it never
needs a targeting-solution/lead calculation, because there's nothing to lead.

Rendering: a beam is a line drawn for one frame, not a simulated object
tracked every frame like a projectile — reuse the existing render pipeline,
don't stand up a parallel VFX/hit-detection system for bolts. This matters
concretely on our target hardware (Dell Rugged Latitude 5420, integrated
graphics, no discrete GPU).

### The three tiers

**Photon — universal baseline**
- Massless, no decay. Infinite range, zero range falloff.
- The gun everyone starts with / every ship can mount.
- Balance lever should be rate of fire / heat / capacitor drain, not range —
  "instant, unlimited range, unlimited ammo" needs a real downside somewhere
  or it's just a better gun with no cost.

**Pion / kaon accelerators — short-to-medium range brawler weapon**
- Charged pion lifetime ≈ 26 nanoseconds; charged kaon ≈ 12 nanoseconds.
  Roughly 100–200x shorter-lived than a muon at the same accelerator gamma.
- Decay length scales with lifetime, so at a comparable gamma factor these
  beams lose coherence over a much shorter distance than a muon beam would.
  Matching muon range would need a gamma factor ~100x higher — an even
  bigger, even more capital-exclusive accelerator, which is backwards from
  wanting this as a lesser/mid-tier weapon.
- **Design conclusion: hits harder than photon up close, falls off hard with
  range.** A brawler's weapon — rewards closing distance, punishes sniping.
  Falloff curve should be steep, not gradual.
- Skip the neutral pion entirely — it decays electromagnetically in about
  8×10⁻¹⁷ seconds, ~100 million times faster than the charged pion. No
  achievable gamma factor makes that a beam rather than a flash at the
  muzzle. Only charged pion/kaon are viable as a fictional weapon.

**Muon accelerators — capital ship / planetary defense only**
- Muon lifetime ≈ 2.2 microseconds — long by particle-physics standards, and
  the reason relativistic time dilation can stretch it far enough to survive
  an interplanetary shot at all.
- The accelerator needed to get particles relativistic enough to survive
  transit is necessarily enormous — the in-fiction reason it's
  capital-ship/planetary-defense-only rather than something a fighter could
  ever miniaturize.
- **Design conclusion: the one weapon that holds damage out to long range.**
  Optional: damage/accuracy tapers as more particles decay in flight at
  extreme range. A flat big-number weapon is also a legitimate simpler
  choice.

### Result: a range/size ladder that falls out of real physics

| Tier | Range behavior | Who mounts it |
|---|---|---|
| Photon | flat, no falloff | everyone |
| Pion/kaon | strong close, steep falloff | brawler fit, any size class probably |
| Muon | falloff-resistant, long range | capital ships, planetary defense only |

### Open questions

- **Turret gating by ship size (S / M / L, 13 ship types total).** S is
  manual-aim-only. L can mount a turret (the "splurge" option). Is M a real
  choice with a real cost (cargo capacity, power draw competing with
  shield/reactor), or is a turret purely an L privilege? Recommend: cost it
  like the shield/reactor tradeoff already in the game rather than a flat
  size gate.
- **Secondary cost for photon weapons** — heat buildup, capacitor drain,
  fire-rate cap? Needs *something* or it dominates every other option by
  having no downside.
- **Does beam weapon fire ever get simulated for background NPC-vs-NPC
  fights the player isn't watching**, or is full hitscan/manual-aim fidelity
  player-only? Recommend player-only for the same performance reason
  rails-vs-n-body exists — nobody's aiming or dodging by feel in a fight
  off-screen.
- **Turret AI target-tracking model** — since there's no lead solution to
  compute for beams, what determines turret accuracy/effectiveness against a
  maneuvering target? (Transverse speed already reduces hit chance for the
  existing abstract gunnery — does that carry over once combat is no longer
  purely dice-based?)

---

## Part 2 — The pulsar neutrino beacon (mission hook + chokepoint mechanic)

Started as a joke ("planet-sterilizing neutrino beam" — doesn't work, a
neutrino beam could pass through a light-year of lead and roughly half of it
still wouldn't interact) that inverted into something real: the same
property that makes neutrinos useless as a weapon makes them the one signal
that can't be blocked, jammed, or shadowed by anything in its path — dust,
gas, planets, stars. This is a real proposed communication method (Learned,
Pakvasa & Zee, 2009, interstellar neutrino communication) on exactly that
logic.

**Scale constraint, and why it matters for where this lives in the world:**
SN 1987A is the real-world proof this is detectable across galactic
distances — but even at ~10^58 neutrinos emitted, Earth's entire detector
network at the time registered only about two dozen events, combined. So a
neutrino beacon visible galaxy-wide needs supernova-adjacent output on the
transmit side and something on the scale of a small moon full of target
nuclei to receive it. That means this is necessarily a fixed, enormous,
faction-scale (or pre-faction/ancient) installation — never something a
ship carries.

**Attaching it to a pulsar solves the output problem for free**, and adds a
second useful property: a pulsar's rotation is a fixed, physically-locked,
extremely precise clock (some are timed to fractions of a microsecond — used
in real spacecraft navigation proposals for exactly this reliability). If
the beacon's modulation rides the pulsar's own rotation, its rhythm is
public, verifiable, and impossible to spoof or fake, because nobody can spin
up a fake pulsar. That's a strong physical justification for a
**treaty-enforced neutral installation**: no faction has to trust another
faction, they only have to trust that the pulsar keeps spinning. The failure
state for the associated mission arc is naturally sabotage/tampering with
the receiver hardware bolted onto the installation, not "who's standing on
it" — closer in spirit to the witness/distress-call design (can this be
done without anyone finding out) than to a capture-the-flag beat.

**Why ships end up near it — not "sailing toward a lighthouse."** Real
pulsar navigation (X-ray pulsar navigation / XNAV) works like GPS: you
triangulate position using the known timing of several pulsars at once, not
by flying toward one. So ships don't travel to the beacon because it's a
destination. Better mechanism: pulsars are neutron stars, i.e. an extreme
gravity well — dropping out of slipspace nearby without a precise reference
to correct your exit against should be genuinely dangerous
(`slipspace.js`). That makes the beacon's location a **mandatory waypoint**
for safely reorienting after a jump through that region, not a voluntary
one — the same relationship a real ship has to an actual lighthouse marking
a hazardous strait: not because the light is the destination, because you
have to pass near it safely.

**Economic and mission consequences, downstream of danger rather than
charm:**
- A station sited at a mandatory, safety-critical jump waypoint gets
  captive traffic whether it wants tourists or not — a strong candidate for
  `economy.js`'s living market: toll-like docking fees nobody can avoid,
  reliably high through-traffic.
- A faction has a real (non-sentimental) motive to seize control of it:
  whoever holds it controls the one comms channel in the region that's
  guaranteed to get through regardless of jamming or line-of-sight — a
  potential system-level property (faster reinforcement response for the
  controlling faction; possibly a player option to relay a
  beacon-guaranteed distress call for a price/favor). Undecided whether this
  is pure narrative flavor for one mission arc or a system other missions
  can reference later.
- A guaranteed safety chokepoint on a busy route is also a natural spot for
  piracy that fits the existing witness system — a fight here is
  guaranteed to have people nearby to see it.
- The installation itself should probably be remote, automated, and
  hazardous to approach (pulsar environment: intense radiation, often
  binary, sometimes an accretion disk) rather than a station anyone casually
  lives on.

### Open questions

- Is beacon control a pure narrative/mission-arc device, or does it hook
  into simulated faction behavior (reinforcement timing, distress-call
  reliability) as an ongoing system property?
- Does slipspace exit-precision-near-a-gravity-well become a general
  mechanic (any strong gravity well makes blind slipspace exit risky) with
  the pulsar beacon as one specific instance, or is it beacon-specific?
- Where does the "treaty" itself live mechanically — is it just fiction/flavor
  text, or does faction standing/reputation react if someone is caught
  tampering with the installation?
