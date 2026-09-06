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
npm test          # nine suites, plain node, no framework
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

## Target hardware

A rugged Latitude 5420 **is** the development machine, so profiling needs
no extrapolation. The trajectory predictor already costs ~25 ms a frame
and the renderer ~3 ms — when something feels slow, it is usually not the
rendering. Anything added to the per-frame path should be costed against
that budget explicitly.

## Style

The code explains *why*, not *what*. Comments carry the reasoning and, in
several places, the bug that motivated the current shape — that history is
the most valuable thing in the file and should be preserved and extended
rather than tidied away. Match it.
