/* stars.test.js — the plumbing for more than one star (2026-11-03).
 *
 *     node test/stars.test.js
 *
 * Stage 1 of claude/stars-and-systems-plan.md: a refactor with NO change of
 * behaviour. sys.stars, the orbit.mu override, a massless `barycentre`
 * body, Sim.frameBody, Sim.lightsAt and a coronaContext that loops over
 * the stars. Nothing generates a binary yet, so this file proves two
 * things and only two:
 *
 *   1. Every system the generator makes today answers EXACTLY as before —
 *      bit for bit, not "close": lightsAt(...).dir against the inline
 *      expression every lighting site used to carry, frameBody against
 *      dominantBody, coronaContext against the old root-only version.
 *   2. A hand-built pair — barycentre root, two stars on opposite override
 *      orbits, a planet round the pair — does what stage 2 will need.
 */
'use strict';
global.window = global.window || global;
var V = require('../src/vec3.js');
var K = require('../src/kepler.js');
require('../src/economy.js');
var Gen = require('../src/generate.js');
var Sim = require('../src/sim.js');
var Galaxy = require('../src/galaxy.js');
var Screens = require('../src/screens.js');

var pass = 0, fail = 0;
function check(n, c, d) {
  if (c) { pass++; console.log('  ok   ' + n + (d ? '   ' + d : '')); }
  else { fail++; console.log('  FAIL  ' + n + (d ? '   ' + d : '')); }
}
function same(a, b) { return Object.is(a.x, b.x) && Object.is(a.y, b.y) && Object.is(a.z, b.z); }

/* The root-only corona as it stood before this change, kept verbatim so
 * the loop can be held to it. */
function oldCorona(pos, sys, t) {
  var star = sys && sys.root;
  if (!star || star.kind !== 'star' || !(star.radius > 0)) return null;
  var st = Sim.bodyState(star, sys, t);
  var r = V.dist(pos, st.pos);
  if (r >= 3 * star.radius || r <= star.radius) return null;
  return { body: star, pos: st.pos, vel: st.vel, r: r };
}

console.log('single-star systems: identical answers');
var gal = Galaxy.build('kawartha');
var N = Math.min(20, gal.stars.length);
var dirSame = true, dirN = 0, frameSame = true, frameN = 0, coronaSame = true, coronaN = 0;
var starsOK = true, labelOK = true, firstBad = '';
var TIMES = [0, 86400 * 3.3, 3.7e7, 2.9e8];
for (var s = 0; s < N; s++) {
  var st = gal.stars[s];
  var fac = gal.factionById ? gal.factionById[st.factionId] : null;
  var sys = Gen.generateSystem(st.seed, fac ? { faction: fac, allFactions: gal.factions } : {});
  if (!(sys.stars && sys.stars.length === 1 && sys.stars[0] === sys.root)) starsOK = false;
  if (Sim.starLabel(sys) !== sys.root.type || Sim.starLuminosity(sys) !== sys.root.luminosity) labelOK = false;
  for (var ti = 0; ti < TIMES.length; ti++) {
    var t = TIMES[ti];
    /* Positions that matter: beside each world and moon (low and high),
     * at the ports, between the planets, deep in the corona and on top of
     * the star itself (the degenerate zero-length case). */
    var pts = [V.zero(), { x: sys.root.radius * 2, y: 0, z: 0 },
               { x: 0, y: sys.root.radius * 1.4, z: sys.root.radius * 0.3 }];
    for (var bi = 0; bi < sys.bodies.length; bi++) {
      var b = sys.bodies[bi];
      if (b.kind === 'star') continue;
      var bp = Sim.bodyPosition(b, sys, t);
      var r = b.radius || 1;
      pts.push(bp);
      pts.push(V.add(bp, { x: r * 1.2, y: 0, z: 0 }));
      pts.push(V.add(bp, { x: 0, y: -r * 60, z: r * 7 }));
      if (b.orbit) pts.push(V.scale(bp, 0.5 + (bi % 7) / 13));
    }
    for (var pi = 0; pi < pts.length; pi++) {
      var p = pts[pi];
      var want = V.norm(V.sub(Sim.bodyPosition(sys.root, sys, t), p));
      var got = Sim.lightsAt(p, sys, t);
      dirN++;
      if (!same(got.dir, want) || got.lights.length !== 1 || got.primary.body !== sys.root) {
        if (dirSame) firstBad = st.seed + ' t=' + t + ' pt ' + pi;
        dirSame = false;
      }
      frameN++;
      if (Sim.frameBody(p, sys, t) !== Sim.dominantBody(p, sys, t)) frameSame = false;
      var oc = oldCorona(p, sys, t), nc = Sim.coronaContext(p, sys, t);
      coronaN++;
      if (!!oc !== !!nc || (oc && (oc.body !== nc.body || !Object.is(oc.r, nc.r) || !same(oc.pos, nc.pos)))) coronaSame = false;
    }
  }
}
check('sys.stars is [sys.root] on ' + N + ' kawartha systems', starsOK);
check('lightsAt(...).dir is the old root expression bit for bit', dirSame, dirN + ' samples' + (firstBad ? ', first bad ' + firstBad : ''));
check('frameBody is dominantBody for a single star', frameSame, frameN + ' samples');
check('coronaContext loops to the same answer as the root-only one', coronaSame, coronaN + ' samples');
check('starLabel / starLuminosity print the root as before', labelOK);

var deep = Gen.interstellarSystem(gal.stars[0]);
check('interstellarSystem has its one star in sys.stars', deep.stars.length === 1 && deep.stars[0] === deep.root);

/* ---- a hand-built binary ------------------------------------------------ */
console.log('a hand-built pair');
var MA = 1.0 * Gen.M_SUN, MB = 0.6 * Gen.M_SUN, M = MA + MB;
var aBin = 0.2 * Gen.AU;
var aA = aBin * MB / M, aB = aBin * MA / M;
var shared = { e: 0.15, inc: 0.04, lan: 0.6, m0: 1.1 };
function orbitOf(a, argp, mu) {
  return { parent: 'bc', a: a, e: shared.e, inc: shared.inc, lan: shared.lan, argp: argp, m0: shared.m0, mu: mu };
}
var starA = { id: 'sA', name: 'Pair A', kind: 'star', type: 'G2', mass: MA, radius: Gen.R_SUN,
              luminosity: 1.0, temp: 5778, color: '#fff4e0', children: [],
              orbit: orbitOf(aA, 0.7, Gen.barycentricMu(MA, MB)) };
var starB = { id: 'sB', name: 'Pair B', kind: 'star', type: 'K5', mass: MB, radius: 0.7 * Gen.R_SUN,
              luminosity: 0.16, temp: 4400, color: '#ffc890', children: [],
              orbit: orbitOf(aB, 0.7 + Math.PI, Gen.barycentricMu(MB, MA)) };
var aP = 1.5 * Gen.AU;
var planet = { id: 'p1', name: 'Pair A I', kind: 'planet', type: 'rocky', mass: Gen.M_EARTH, radius: 6371,
               children: [], orbit: { parent: 'bc', a: aP, e: 0.02, inc: 0.01, lan: 0.2, argp: 0.3, m0: 2.0 } };
var bc = { id: 'bc', name: 'Pair', kind: 'barycentre', radius: 0, orbit: null, children: [starA, starB, planet] };
var bin = Gen.finalize({ root: bc, seed: 'pair', name: 'Pair', frostLine: 0, hzInner: 0, hzOuter: 0 });

check('barycentre mass is the sum of its stars', bc.mass === MA + MB);
check('sys.stars holds both stars and not the barycentre',
      bin.stars.length === 2 && bin.stars[0] === starA && bin.stars[1] === starB);
check('the barycentre is not in gravBodies', bin.gravBodies.indexOf(bc) < 0 &&
      bin.gravBodies.indexOf(starA) >= 0 && bin.gravBodies.indexOf(starB) >= 0);
/* Every list the game draws, cycles, targets and radars over is built off
 * sys.bodies (main.js focusList, navList, the draw pass, the scopes), and
 * the chart off systemManifest. */
check('the barycentre is not in sys.bodies (draw, nav, focus, radar lists)', bin.bodies.indexOf(bc) < 0);
check('...but is in byId and sys.barycentres', bin.byId.bc === bc && bin.barycentres[0] === bc);
check('...nor in pads', bin.pads.indexOf(bc) < 0);
check('...nor in the system manifest', Screens.systemManifest(bin).every(function (r) { return r.body !== bc; }) &&
      Screens.systemManifest(bin).length === 1);
check('separation is a_A + a_B', Math.abs(bc.separation - aBin) < 1e-6 * aBin);

var Pwant = K.TAU * Math.sqrt(aBin * aBin * aBin / (V.G * M));
check('star A period is 2π√(a³/G(M_A+M_B))', Math.abs(starA.orbit.period - Pwant) / Pwant < 1e-12,
      (starA.orbit.period / 86400).toFixed(3) + ' d');
check('star B period is the same', Math.abs(starB.orbit.period - Pwant) / Pwant < 1e-12);
var PpWant = K.period(aP, V.G * M + V.G * Gen.M_EARTH);
check('the planet period uses the summed mass', planet.orbit.period === PpWant,
      (planet.orbit.period / 86400).toFixed(2) + ' d');
check('Sim.orbitMu reads the override', Sim.orbitMu(starA, bin) === starA.orbit.mu &&
      Sim.orbitMu(planet, bin) === bc.mu + planet.mu);

var worstOpp = 0, worstCom = 0;
for (var k = 0; k <= 400; k++) {
  var tt = Pwant * (k * 25 + k / 401);           // out to 10^4 binary periods
  var pa = Sim.bodyPosition(starA, bin, tt), pb = Sim.bodyPosition(starB, bin, tt);
  var opp = 1 + V.dot(V.norm(pa), V.norm(pb));    // 0 when exactly opposite
  var com = V.len(V.add(V.scale(pa, MA), V.scale(pb, MB))) / (MA * V.len(pa));
  if (opp > worstOpp) worstOpp = opp;
  if (com > worstCom) worstCom = com;
}
check('the stars stay opposite through the barycentre over 10^4 periods', worstOpp < 1e-9,
      'worst 1+cos = ' + worstOpp.toExponential(2));
check('...and the centre of mass stays on the barycentre', worstCom < 1e-6,
      'worst ' + worstCom.toExponential(2));
var p0 = Sim.bodyPosition(planet, bin, 0), p1 = Sim.bodyPosition(planet, bin, planet.orbit.period);
check('the planet comes round in its own period', V.dist(p0, p1) < 1e-6 * aP);

var t0 = Pwant * 0.37;
var posA = Sim.bodyPosition(starA, bin, t0), posB = Sim.bodyPosition(starB, bin, t0);
var cA = Sim.coronaContext(V.add(posA, { x: 0, y: 2 * starA.radius, z: 0 }), bin, t0);
var cB = Sim.coronaContext(V.add(posB, { x: 0, y: 0, z: 1.8 * starB.radius }), bin, t0);
check('coronaContext finds heat near star A', !!cA && cA.body === starA);
check('coronaContext finds heat near star B', !!cB && cB.body === starB);
check('...and none out between them', !Sim.coronaContext(V.scale(V.add(posA, posB), 0.5), bin, t0));

var near = V.add(Sim.bodyPosition(bc, bin, t0), { x: 0.1 * Gen.AU, y: 0.6 * Gen.AU, z: 0.05 * Gen.AU });
var lit = Sim.lightsAt(near, bin, t0);
var dA = V.dist(near, posA) / Gen.AU, dB = V.dist(near, posB) / Gen.AU;
var fluxWant = 1.0 / (dA * dA) + 0.16 / (dB * dB);
var fluxGot = lit.lights.reduce(function (a, l) { return a + l.flux; }, 0);
check('lightsAt near the pair returns two lights', lit.lights.length === 2);
check('...whose fluxes sum to L/d² over both', Math.abs(fluxGot - fluxWant) / fluxWant < 1e-12,
      fluxGot.toFixed(4) + ' vs ' + fluxWant.toFixed(4));
check('...brightest first as primary', lit.primary.body === starA);
var wsum = V.add(V.scale(lit.lights[0].dir, lit.lights[0].flux), V.scale(lit.lights[1].dir, lit.lights[1].flux));
check('...and dir is the flux-weighted direction', V.dist(lit.dir, V.norm(wsum)) < 1e-12 &&
      Math.abs(V.len(lit.dir) - 1) < 1e-12);

var far = { x: -2.2 * Gen.AU, y: 0.4 * Gen.AU, z: 0 };
check('dominantBody far out is still a star', Sim.dominantBody(far, bin, t0).kind === 'star');
check('frameBody far from the pair is the barycentre', Sim.frameBody(far, bin, t0) === bc);
var nearA = V.add(posA, { x: 5 * starA.radius, y: 0, z: 0 });
check('frameBody near star A is A', Sim.frameBody(nearA, bin, t0) === starA);
var nearP = V.add(Sim.bodyPosition(planet, bin, t0), { x: 20000, y: 0, z: 0 });
check('frameBody near the circumbinary world is the world', Sim.frameBody(nearP, bin, t0) === planet);
var ship = Sim.makeShip(far, { x: 0, y: Math.sqrt(V.G * M / V.len(far)), z: 0 });
var oe = Sim.oscElements(ship, bin, t0);
check('oscElements far out is about the pair, on its summed mu', oe && oe.body === bc && oe.closed);
check('localVertical far out points away from the barycentre',
      Sim.localVertical(far, bin, t0).body === bc);
check('starLabel prints both types', Sim.starLabel(bin) === 'G2+K5');
check('starLuminosity sums them', Math.abs(Sim.starLuminosity(bin) - 1.16) < 1e-12);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
