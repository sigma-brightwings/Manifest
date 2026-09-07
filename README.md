# Manifest

Gravity, clockwork, cockpit and cargo.

*A manifest is the cargo list — the thing every route carries, every pirate
wants, and every scan searches for. It is also what becomes evident: this
game's law only knows what somebody actually told it, and whether an act is
witnessed is the difference between a career and a warrant. Cargo and
evidence, one word.*

A space sim built from the ground up — literally in that order. Gravity
first, then orbits, then planets, then everything that lives on them. Every
star system is a pure function of its seed, so the same seed gives the same
universe every time, on any machine, forever.

Currently at **alpha 5** (in progress). Public, unreleased, and unfinished
in that order — the source is here because it is easier to be told what is
broken than to find it alone. See **Beta testing** below.

## What it is

Frontier: Elite II crossed with a flight simulator's respect for physics.
Newtonian flight with real orbital mechanics — you do not point and go, you
plan a burn. Trade, piracy, contracts and a legal system that only knows
what somebody actually told it.

Some things it does that are worth knowing about:

- **Rails versus n-body.** Traffic, canisters and patrols ride closed-form
  Kepler orbits until you get close enough to see the difference, then they
  are integrated properly. This is what makes a whole populated system
  affordable on a laptop.
- **Crime is witnessed, not omniscient.** Opening fire is only a bounty if
  someone reports it — a third party at the scene, or the victim itself,
  which starts transmitting a few seconds after the attack begins. Silence
  the call with nobody in range and the law never hears. That is the
  design, not a loophole.
- **Atmospheres are real enough to kill you.** Drag, re-entry heating and
  two shields that are different shapes: the energy shield is a bucket, the
  heat shield is a pipe. Buying the wrong one for the job is a mistake the
  outfitter will happily let you make.
- **The cockpit is geometry.** Flight-critical symbology is projected on
  the canopy glass; data-heavy readouts live on physical panels set into
  the dashboard and drawn in perspective. Panels can be shot out, and it
  costs money to put them right.

## What works right now

Enough to fly, trade, fight, get arrested and land somewhere you should
not have.

- **Flight and orbits.** Newtonian flight with a trajectory predictor,
  orbital-frame and ship-frame control modes, flight assist that needs a
  nearby lock to have anything to hold you against, and time warp.
- **A whole system, cheaply.** 6–12 planets per star, traffic and patrols
  and drifting canisters on Kepler rails until you close, then integrated
  properly.
- **Outfitting.** Typed slots with power and mass budgets, nine lasers,
  three reactors, shields, heat sinks, sell-back at 45%, and refusals that
  tell you in words why a thing will not fit.
- **Weapons.** Two fire groups on two triggers, per-slot cooldowns, an
  auto-turret, seekers, and weapon heat that will cook you if you hold the
  trigger down.
- **The law.** A crime is only a crime if somebody reports it — a witness
  at the scene, or the victim itself, which starts transmitting a few
  seconds into the attack. Bounties are per-faction; fugitives get hunted.
- **Death and salvage.** Ships break into wreckage hashed off the victim,
  shards fly a cheap ballistic path, and you scoop what is left.
- **Slipspace.** Mass-scaled transit, an interstellar lane timetable,
  wakes you can scan and follow, and an interdiction corridor you can be
  torn into and have to fly out of.
- **Ports and interiors.** Berth at a surface port and you are genuinely
  inside a building — no stars, no orbit lines, just the port.
- **Markets that are alive rather than tabulated.** Prices come from
  scarcity — a mining world's ore is cheap because it has too much of it,
  not because a designer typed a low number. Every port's stock is a
  closed-form function of time, so you can skip a year ahead and get the
  exact figure for the cost of a few multiplies, and the wobble you see in
  a price is a *named freighter arriving*: each scheduled delivery leaves
  its own decaying sawtooth at its destination. Ports near your ship run a
  genuine stepped simulation instead, seeded from the analytic value on
  waking and folding their accumulated divergence back into a decaying
  ledger on going dormant — exactly one number crosses that boundary, and
  it forgets. Your own trades move prices through that same ledger.
- **Saves.** Six manual slots plus a per-seed autosave.

Honest about the gaps: piracy does not yet reach the economy — blow up a
freighter and its delivery is still counted at the far end, because
nothing cancels a scheduled arrival (that is Phase 6, and the decaying
ledger it needs is already built). The grey market has a flag and no goods
behind it, fire-group membership is invisible from the cockpit mid-fight,
and several recently built visual systems have passing tests but have
never actually been looked at. `PLAN.md` keeps a Status section that is checked against
the source rather than against memory.

## Beta testing

**Testers wanted, and the useful kind of report is the specific kind.**

What is most valuable, roughly in order:

1. **Anything that looks wrong.** The test suite is blind to layout — it
   can prove a cockpit panel projects where it should and cannot tell you
   the panel is unreadable. Screenshots are worth more than descriptions.
2. **Seeds that generate something broken.** Every universe is a pure
   function of its seed, so a seed is a complete bug report on its own.
   Send the seed and where in it you were.
3. **Where the flight model fights you** rather than being hard. Those are
   different, and only a second pilot can tell them apart.
4. **Performance.** The development machine is a rugged Latitude 5420, so
   it is already a slow target — but if it stutters on yours, say what you
   were doing and what was on screen.
5. **Refusals that do not explain themselves.** A greyed-out button that
   will not say what is wrong is a bug by this project's rules.

Send reports to **support.manifest@agentmail.to**. Include the alpha from
`CHANGELOG.md`, your seed, and your OS. There are built binaries under
**Releases** — Windows portable, Windows installer, Linux tar.gz — or
clone it and run `npm install && npm start`; see **Running it** below.

The binaries are unsigned, so Windows SmartScreen will interrupt you. That
is what an unsigned executable from a stranger on the internet is supposed
to look like, and you are right to be suspicious of it — the source is
here to read, and building it yourself takes two commands.

Fair warning: saves do not always survive an alpha. `CHANGELOG.md` says
so under its own heading each time.

## Running it

```
npm install
npm start          # Electron desktop build
npm run serve      # browser, via a local server on http://localhost:8080
npm test           # the full test suite
```

`npm run serve` rather than opening `index.html` directly: the game needs a
real origin, not `file://`.

**If you are playtesting, hard-reload.** A cached bundle will happily show
you the previous build and let you conclude the wrong thing.

## Building desktop binaries

```
npm run dist:win     # Windows portable + NSIS installer
npm run dist:linux   # Linux tar.gz
```

Cross-building Linux AppImages from Windows does not work; the tar.gz
target is the one that does.

## Layout

```
src/            the game, one module per concern, no bundler
  rng.js        seeded hashing and streams — the root of determinism
  vec3.js       vectors
  kepler.js     orbital elements, closed-form state
  generate.js   systems, worlds, ports, factions, government, traffic
  economy.js    commodities, markets, contraband
  galaxy.js     stars, jump ranges
  sim.js        flight, rails, atmospheres, heat, encounters, canisters
  combat.js     equipment, weapons, damage, and the law
  missions.js   contracts and faction standing
  arcs.js       faction campaigns
  slipspace.js  the jump corridor
  render.js     meshes, hulls, the cockpit interior
  gl.js         the WebGL world layer
  screens.js    the MFD pages
  save.js       six manual slots and a per-seed autosave
  main.js       the loop, input, and everything that ties together
test/           node test scripts, no framework
tools/          dev server, icon builder, glb -> hull converter
ref/glb/        source ship models, consumed by tools/glb2hulls.js
ref/station-lab/  standalone sketch for station geometry, not wired in yet
electron/       desktop shell
```

No build step and no bundler. `index.html` loads the modules in order and
each one attaches itself to `window`; the same files run under node for the
tests via `module.exports`. That is deliberate — it means a change is one
file edit and a reload.

## Testing

```
npm test
```

Nine suites, no framework, each one a plain node script that prints `ok` or
`FAIL` and exits. They cover physics, orbital nodes, generation
determinism, the economy, combat and the law, the save round-trip, and a
good deal of the renderer's geometry.

**They are blind to layout.** A test can tell you a panel's quad projects
where it should; it cannot tell you the panel is readable. Anything visual
has to be looked at.

## Documents

- `PLAN.md` — the current work: outfitting, weapons,
  debris, mining, and the police
- `CHANGELOG.md` — what changed in each alpha, and whether your save
  survives it
- `FLIGHT-CARD.md` — the controls

## Licence

Not yet chosen. All rights reserved by default.
