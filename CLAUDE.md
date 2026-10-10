# Working on Manifest

Orientation for a coding assistant picking this up cold. Read this, then
`PLAN.md`'s **Status** section — between them you should
not need to re-derive anything from the conversation that produced them.

## What this is

A space sim built bottom-up: gravity first, then orbits, then planets,
then everything living on them. Frontier: Elite II crossed with a flight
simulator's respect for physics. No engine, no bundler — plain JS modules
attached to `window`, loaded in order by `index.html`, and the same files
run under node for the tests via `module.exports`.

## Read these first

| File | What it holds |
|---|---|
| `PLAN.md` | The design. Phases 1–13, with a **Status** section marking what is built, what is inert, and what is untouched. Verified against source, not memory. |
| `CHANGELOG.md` | What changed per alpha, and — its own heading — **whether saves survive**. |
| `FLIGHT-CARD.md` | The controls. |
| `README.md` | Layout, how to run, how to build. |

## The doctrines

These are not style preferences. Breaking one causes a specific bug that
has already happened at least once.

1. **The same seed is the same universe.** Everything generated is a pure
   function of a seed. `Math.random()` in generation or in anything the
   player can revisit is a bug — see `combat.js`'s pirate manifest, which
   is a known outstanding instance.

2. **New random draws go in their own forked substream.** `base.fork('x')`.
   Adding a feature must not consume a draw that something else was
   relying on, or every seed silently changes.

3. **Rails versus integration.** Traffic, canisters and patrols ride
   closed-form Kepler orbits until the player is close enough to see the
   difference. Anything new that moves should follow the same split, and
   anything far away should still be *moving* — a frozen object in
   absolute space drifts away from the planet it was orbiting.

4. **Additive changes, and do not bump the save version.** `save.js`
   `readSlot` and `load` discard any payload whose version does not match
   exactly, so a bump does not migrate old saves, it deletes them. Add
   fields; migrate on load.

5. **Refusals carry reasons.** `canFit` returns *why* in words. A greyed
   button that will not say what is wrong is indistinguishable from a bug.

6. **Measure before choosing a threshold.** Two gates in this project were
   written from plausible-sounding numbers and excluded 100% of cases —
   a navy that required `development > 0.62` when the maximum across all
   seeds is 0.61, and a liner needing two settled worlds in one system
   when that combination essentially does not occur. Sample 20–40 seeds
   and look at the distribution first.

## Testing

```
npm test          # every suite in package.json, plain node, no framework
```

Suites print `ok` / `FAIL` and exit non-zero. **They are blind to layout** —
a test can prove a panel's quad projects where it should, never that the
panel is readable. Anything visual has to be looked at.

**Hard-reload when playtesting.** A cached bundle will happily show you
the previous build and let you conclude the wrong thing.

## Toolchain quirks

- The project drive is **not mounted in the bash sandbox**. Use the
  file tools (Read/Write/Edit/Grep/Glob) for editing, and Desktop
  Commander's shell to run node and git. If Desktop Commander is
  disconnected, you can still edit but cannot run tests — say so rather
  than claiming work is verified.
- `npm` via PowerShell fails on script-signing policy; call
  `node test\<name>.test.js` directly, or use `cmd`.
- Ship models: `.glb` files in `ref/glb`, converted by
  `node tools/glb2hulls.js ref/glb` into the generated `src/hulls.js`.
  Superseded models live in `ref/glb-superseded/` and are excluded because
  `readdirSync` is not recursive. Each model carries its cockpit interior
  as named nodes; the tool splits them and emits the canopy box.
- Port models: the same tool in `--ports` mode, `node tools/glb2hulls.js
  ref/ports --ports` into the generated `src/ports.js`, keyed by port ROLE.
  **`src/ports.js` is optional** — absent, every role falls back to its
  procedural mesh. Three things differ from ships and each is marked PORTS
  in the tool: **+z is up out of the ground** (not +y up), scale comes from
  a declared `portPad` rather than the longest axis, and the anchors are
  **load-bearing** — `bayGeometry` reads a modelled bay's own floor,
  chamber and berth count, so a wrong anchor parks a ship inside a wall.
  The convention is `ref/PORT-MODELS.md`; `tools/make-port-fixture.js`
  writes synthetic port `.glb`s so the pipeline can be tested without art.
  `Render.portModelFor` is the single key deciding both which mesh is drawn
  and whose dimensions are used — do not grow a second copy of it.

## Target hardware

**Latitude 5424 Rugged ("Syndicate Crawler")**, from October 2026: Core
i7-8650U (4C/8T), 32 GB RAM at 2400 MT/s, a **discrete AMD Radeon RX 540
with 4 GB** alongside the Intel UHD 620, Windows 11. It is the development
machine too, so profiling still needs no extrapolation.

What changed from the old target, a Latitude 5420 Rugged (i5-8350U, 16 GB,
UHD 620 only), is the discrete GPU — and the direction is to **move
rendering onto it**, even where that means rebuilding things. Two
consequences worth holding on to:

- The GPU belongs to the renderer, but the CPU is still four mobile cores.
  The trajectory predictor cost ~25 ms a frame against the renderer's ~3 ms
  on the 5420; when something feels slow it is usually not the rendering,
  and the 8650U is a faster chip, not a different class. Anything added to
  the per-frame path should still be costed against that budget explicitly.
- A dual-GPU laptop will happily run a browser or Electron window on the
  **integrated** chip. Anything that measures GPU performance has to check
  which adapter it actually got (WebGL's `WEBGL_debug_renderer_info`)
  before trusting the number.

The old 5420 survives as an honest floor-spec machine: integrated graphics
only.

**A machine with a 4 GB discrete GPU is incoming (noted 2026-10-09), and
it changes less than it sounds like it should.** The renderer is already
the cheap end of the budget at ~3 ms; the predictor is ~25 ms of pure CPU
JavaScript — Kepler solves and RK4 — and a graphics card does not touch
it. So the new hardware buys headroom in the part that was never the
problem. Two consequences:

- The groundwork is already in: `src/gl.js` asks for
  `powerPreference: 'high-performance'` and `electron/main.js` passes
  `force_high_performance_gpu`. Both halves are needed — a context asking
  for low power can undercut the process-wide switch, which is how the
  discrete card went unused.
- **Do not retune any threshold for it until it is measured on the new
  machine.** Doctrine 6 applies with full force here: raising detail or
  draw budgets against an imagined card is exactly how the 0.62
  development gate happened. Profile first, then spend.

## Style

The code explains *why*, not *what*. Comments carry the reasoning and, in
several places, the bug that motivated the current shape — that history is
the most valuable thing in the file and should be preserved and extended
rather than tidied away. Match it.
