/* The outbuildings round a dock are tied to it (render.js stationOutworks).
 *
 * Astra, 2026-11-03, a tank farm hanging off a spine station on two trusses
 * that ended in empty space: "what is this floating in space unconnected
 * to anything?" Both its stand-off and its truss were measured from the
 * radius of the model's furthest vertex, which for a long station is most
 * of the station away from the flank the outwork stands off. These checks
 * hold the fix: every outwork's truss ends inside the hull along its own
 * direction, for every orbital model in the library, over a spread of
 * seeds - and the layout is still a pure function of the port.
 */
'use strict';
['vec3', 'rng', 'slipspace', 'kepler', 'mining', 'economy', 'generate', 'galaxy', 'sim', 'combat', 'hulls']
  .forEach(function (m) { require('../src/' + m + '.js'); });
try { require('../src/ports.js'); } catch (e) {}
require('../src/render.js');
const R = globalThis.Render, Gen = globalThis.Gen;

let pass = 0, fail = 0;
function check(c, msg, extra) {
  if (c) { pass++; console.log('  ok   ' + msg + (extra ? '   ' + extra : '')); }
  else { fail++; console.log('  FAIL ' + msg + (extra ? '   ' + extra : '')); }
}

const SEEDS = ['kawartha', 'beaverton', 'driftwood', 'ironwake', 'halden', 'mirven', 'oruun', 'ashford'];
let ports = 0, ties = 0, floating = 0, wouldHaveFloated = 0, models = {};
const worst = [];
SEEDS.forEach(function (seed) {
  for (let i = 0; i < 6; i++) {
    const sys = Gen.generateSystem(seed + '|' + i);
    (sys.ports || []).forEach(function (p) {
      if (p.surface || p.underground || p.seaPlatform) return;
      const model = R.portModelFor ? R.portModelFor(p) : null;
      if (!model) return;
      const mesh = R.stationOutworks(p, model);
      if (!mesh) return;
      ports++;
      models[model] = (models[model] || 0) + 1;
      (p._outworks.ties || []).forEach(function (t) {
        ties++;
        /* The truss's inner end has to be at or inside the hull's own
         * reach in that direction - within a centimetre of model slack. */
        if (t.inner > t.reach + 1e-6) { floating++; worst.push(model + ' ' + p.name); }
        /* What the old measure would have done: truss to 0.92 R, with
         * the hull only `reach` away this way. */
        if (t.R * 0.92 - 0.04 > t.reach * 1.02) wouldHaveFloated++;
      });
    });
  }
});
check(ports > 40, 'outworks built for a spread of orbital ports', ports + ' ports, ' + Object.keys(models).length + ' models');
check(ties > ports, 'and they carry tethers', ties + ' tethers');
check(floating === 0, 'every tether ends inside the hull along its own direction', floating + ' floating' + (worst.length ? ' e.g. ' + worst.slice(0, 3).join(', ') : ''));
console.log('  (the old furthest-vertex measure would have left ' + wouldHaveFloated + ' of ' + ties + ' short of the hull)');

/* Same port, same outworks: built twice from scratch, byte for byte. */
{
  const sys = Gen.generateSystem('kawartha|0');
  const p = (sys.ports || []).filter(function (q) { return !q.surface && !q.underground && !q.seaPlatform && R.portModelFor(q); })[0];
  const model = R.portModelFor(p);
  const a = JSON.stringify(R.stationOutworks(p, model));
  p._outworks = null;
  const b = JSON.stringify(R.stationOutworks(p, model));
  check(a === b, 'the outworks are a pure function of the port', p.name + ' (' + model + ')');
}

/* hullReach on a unit cube: straight out through a face is 1. */
{
  const cube = { v: [[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]],
                 f: [[0,1,2],[0,2,3],[4,6,5],[4,7,6],[0,4,5],[0,5,1],[2,6,7],[2,7,3],[1,5,6],[1,6,2],[0,3,7],[0,7,4]] };
  check(Math.abs(R.hullReach(cube, [1, 0, 0]) - 1) < 1e-9, 'hullReach: a cube face is 1 away');
  const d = Math.SQRT1_2;
  check(Math.abs(R.hullReach(cube, [d, d, 0]) - Math.SQRT2) < 1e-9, 'hullReach: its edge is root 2 away');
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
