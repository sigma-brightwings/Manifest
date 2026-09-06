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

Currently at **alpha 5** (in progress). Not released, not public, not
finished.

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
