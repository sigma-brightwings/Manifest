# Port art waiting to be named

Everything in this folder is real art with no home yet. It is tracked so it
cannot be lost again; it is **not** in `ref/ports/` because nothing would
happen if it were.

## Why it is here and not one folder up

`tools/glb2hulls.js --ports` converts whatever sits in `ref/ports/` into the
generated `src/ports.js`. But converting a model is not the same as the game
ever *drawing* it: `Render.portModelFor` picks a model by name, and a name
it does not recognise is converted and then never chosen. See
`ref/PORT-MODELS.md` for the convention, and `PORT_PATTERNS` /
`PORT_POOL` in `src/render.js` for the tables that implement it.

The short version, after the `-s` / `-m` / `-l` size suffix is stripped:

| the stem is… | and it joins |
|---|---|
| `cylinder`, `spine`, `ring`, `cradle` | the orbital pool (named in `PORT_PATTERNS`) |
| anything starting `station-` | the orbital pool |
| anything starting `city-` | every surface port |
| anything starting `deep-` | every underground bay |
| exactly a role — `refinery`, `shipyard`, … | that role alone, beating the pool |
| anything else | **nothing** |

Every file below is in that last row.

## What is here

All of it was exported 2026-09-08 and was found in the untracked `models/`
staging tree, which held the only copies. Most of `models/` was duplicated
ship exports and has been deleted; these were not duplicates of anything.

**Planetside ports — 15 files.** `pad-site-{s,m,l}`,
`runway-port-{s,m,l}`, `runway-site-{s,m,l}` plus `-l2`/`-m2`/`-s2`
variants, and `comet-{s,m,l}`.

Nothing in `ref/station-lab/station.js` builds any of these — the lab
exports four orbital patterns and no cities — so unlike the orbital
stations they **cannot be re-exported**. That is the whole reason this
folder exists rather than a deletion.

To put them in the game, decide what each one is and rename accordingly:

- A **surface port** — the thing a ship lands at on a world — takes the
  `city-` prefix, e.g. `runway-port-l.glb` → `city-runway-l.glb`. Then it
  joins the pool every surface port draws from, and needs no code.
- The `-site` files look like they may be the *surroundings* rather than
  the port itself (an apron, a landing field) — which the renderer has no
  concept of yet. `Render.drawPortDressing` is the nearest thing.
- `comet-*` is probably not a port at all. If it is a body to fly to or
  mine, it belongs to generation, not to `PortLib`.

None of that is safe to guess, which is why none of it was guessed.

**Detail kits — 3 files.** `detail-kit`, `detail-kit-capital`,
`detail-kit-e5f7301d`. Greebles, decals, lamps and small fittings rather
than a port. The station lab can re-export these (its "Export detail kit
(GLB)" button), so they are the one recoverable thing in here. Nothing
consumes a kit yet.

**Screenshots — 8 files**, in `screenshots/`. Reference images that came
with the art.

## What went the other way

`cylinder-station-{s,m,l}.glb` was renamed to `cylinder-{s,m,l}.glb` and put
in `ref/ports/`, because `PORT_PATTERNS` already names the stem `cylinder`.
`city-port-{s,m,l}.glb` went across unchanged — it already carries the
`city-` prefix. Those six are the only rescued files the game can currently
use, and they are a day older than the lab, so re-exporting the orbital
stations from `ref/station-lab/index.html` will supersede the cylinder set.
