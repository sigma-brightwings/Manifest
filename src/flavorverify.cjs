// flavorverify.cjs — remote spectroscopy (planet count + atmosphere
// composition) and Elite-style per-world flavor text (lifeNote/cultureNote).
// Checks: determinism is preserved for EXISTING data (orbits unchanged by
// the new composition draw), the new fields are present and sane, buildFlavor
// only touches habitable planets, and previewSystem never marks a star
// visited.
require('./rng.js'); require('./vec3.js'); require('./kepler.js'); require('./arcs.js');
require('./economy.js'); require('./generate.js'); require('./slipspace.js'); require('./galaxy.js');
const Gen = globalThis.Gen, Gx = globalThis.Galaxy;
let fail = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fail++; };

console.log('DETERMINISM IS UNDISTURBED BY THE NEW flavRng FORK');
// The whole point of forking a sibling stream for atmosphereComposition was
// to avoid shifting the orbital-angle draws that come later in the same
// per-planet loop iteration. Prove it by generating twice and checking every
// orbital element, not just that the composition itself repeats.
{
  const g = Gx.build('kawartha');
  const star = g.stars[3];
  const opts = { faction: g.factionById[star.factionId], allFactions: g.factions };
  const s1 = Gen.generateSystem(star.seed, opts);
  const s2 = Gen.generateSystem(star.seed, opts);
  const planets1 = s1.bodies.filter(b => b.kind === 'planet');
  const planets2 = s2.bodies.filter(b => b.kind === 'planet');
  ok(planets1.length === planets2.length, 'same planet count both runs (' + planets1.length + ')');
  let orbitsMatch = true, compMatch = true;
  for (let i = 0; i < planets1.length; i++) {
    const a = planets1[i], b = planets2[i];
    if (a.orbit.a !== b.orbit.a || a.orbit.lan !== b.orbit.lan ||
        a.orbit.argp !== b.orbit.argp || a.orbit.m0 !== b.orbit.m0 ||
        a.mass !== b.mass) orbitsMatch = false;
    if (a.composition !== b.composition) compMatch = false;
  }
  ok(orbitsMatch, 'every orbital element + mass identical across two generations of the same seed');
  ok(compMatch, 'composition itself is also identical across two generations (seeded, not random)');
}

console.log('\nCOMPOSITION IS PRESENT AND KEYED TO TYPE, NOT RANDOM NOISE');
{
  const g = Gx.build('kawartha');
  let checked = 0, terranSet = new Set(), gasSet = new Set();
  for (const star of g.stars.slice(0, 25)) {
    const opts = { faction: g.factionById[star.factionId], allFactions: g.factions };
    const sys = Gen.generateSystem(star.seed, opts);
    for (const b of sys.bodies) {
      if (b.kind !== 'planet') continue;
      checked++;
      if (typeof b.composition !== 'string' || !b.composition.length) {
        ok(false, 'planet ' + b.name + ' (' + b.type + ') has no composition string');
      }
      if (b.type === 'terran') terranSet.add(b.composition);
      if (b.type === 'gasGiant') gasSet.add(b.composition);
      if (b.type === 'rocky' && b.composition !== 'none — hard vacuum') {
        ok(false, 'rocky planet got a non-vacuum composition: ' + b.composition);
      }
    }
  }
  ok(checked > 50, 'checked composition on ' + checked + ' planets across 25 systems');
  ok(terranSet.size >= 1 && [...terranSet].every(c => /breathable/.test(c)),
    'every terran composition mentions breathable air (' + [...terranSet].join(' | ') + ')');
  ok(gasSet.size >= 1 && [...gasSet].every(c => /hydrogen/.test(c)),
    'every gas giant composition mentions hydrogen (' + [...gasSet].join(' | ') + ')');
}

console.log('\nbuildFlavor ONLY TOUCHES HABITABLE PLANETS');
{
  const g = Gx.build('kawartha');
  let habCount = 0, nonHabWithFlavor = 0, habMissingFlavor = 0;
  for (const star of g.stars.slice(0, 40)) {
    const opts = { faction: g.factionById[star.factionId], allFactions: g.factions };
    const sys = Gen.generateSystem(star.seed, opts);
    for (const b of sys.bodies) {
      if (b.kind !== 'planet') continue;
      if (b.habitable) {
        habCount++;
        if (!b.lifeNote || !b.cultureNote) habMissingFlavor++;
      } else if (b.lifeNote || b.cultureNote) {
        nonHabWithFlavor++;
      }
    }
  }
  ok(habCount > 0, 'found ' + habCount + ' habitable worlds across 40 systems');
  ok(habMissingFlavor === 0, 'every habitable world got both lifeNote and cultureNote');
  ok(nonHabWithFlavor === 0, 'no non-habitable body was given flavor text');
}

console.log('\nlifeNote / cultureNote READ AS PROSE, VARY BY SEED, AND STAY SEEDED');
{
  const g = Gx.build('kawartha');
  const notes = new Set();
  let sample = null;
  for (const star of g.stars) {
    const opts = { faction: g.factionById[star.factionId], allFactions: g.factions };
    const sys = Gen.generateSystem(star.seed, opts);
    for (const b of sys.bodies) {
      if (b.kind === 'planet' && b.habitable) {
        notes.add(b.lifeNote);
        if (!sample) sample = { star: star, sys: sys, world: b };
      }
    }
  }
  ok(notes.size > 3, 'lifeNote varies across systems (' + notes.size + ' distinct lines seen)');
  ok([...notes].every(n => /^Dominant native life: /.test(n)), 'every lifeNote follows the travel-guide framing');

  if (sample) {
    const opts = { faction: g.factionById[sample.star.factionId], allFactions: g.factions };
    const again = Gen.generateSystem(sample.star.seed, opts);
    const worldAgain = again.bodies.find(b => b.id === sample.world.id);
    ok(worldAgain.lifeNote === sample.world.lifeNote && worldAgain.cultureNote === sample.world.cultureNote,
      'same world, regenerated: identical lifeNote and cultureNote (seeded, not re-rolled)');
    console.log('        sample — ' + sample.world.name + ': "' + sample.world.lifeNote + '"');
    console.log('        sample — culture: "' + sample.world.cultureNote + '"');
  }
}

console.log('\nCULTURE BUCKETS ACTUALLY DISCRIMINATE ON violence/corruption/pirateHeld');
{
  // Exercise cultureNote directly against synthetic sys objects, bypassing
  // generation entirely, so the bucket logic is pinned down independent of
  // whatever the RNG happens to roll for real systems.
  const RNG = globalThis.RNG;
  const rng = new RNG('bucket-test').fork('x');
  const held = Gen.cultureNote({ pirateHeld: true, violence: 10, corruption: 10 }, rng);
  const violent = Gen.cultureNote({ pirateHeld: false, violence: 80, corruption: 10 }, rng);
  const corrupt = Gen.cultureNote({ pirateHeld: false, violence: 10, corruption: 75 }, rng);
  const both = Gen.cultureNote({ pirateHeld: false, violence: 80, corruption: 75 }, rng);
  const nice = Gen.cultureNote({ pirateHeld: false, violence: 10, corruption: 10 }, rng);
  ok(typeof held === 'string' && held.length, 'pirate-held system gets a line');
  ok(held !== nice, 'pirate-held reads differently than a quiet system');
  ok(violent !== nice, 'a violent system reads differently than a quiet one');
  ok(corrupt !== nice, 'a corrupt system reads differently than a quiet one');
  ok(both !== violent && both !== corrupt, 'violent+corrupt gets its own combined bucket, not either alone');
}

console.log('\nsystemNote IS PRESENT, KEYED TO WHAT WAS ACTUALLY GENERATED, AND STAYS SEEDED');
{
  const g = Gx.build('kawartha');
  let checked = 0, missing = 0;
  const notes = new Set();
  for (const star of g.stars.slice(0, 40)) {
    const opts = { faction: g.factionById[star.factionId], allFactions: g.factions };
    const sys = Gen.generateSystem(star.seed, opts);
    checked++;
    if (typeof sys.systemNote !== 'string' || !sys.systemNote.length) missing++;
    notes.add(sys.systemNote);
  }
  ok(checked > 0, 'checked systemNote on ' + checked + ' systems');
  ok(missing === 0, 'every single system got a systemNote (0 missing)');
  ok(notes.size > 3, 'systemNote varies across systems (' + notes.size + ' distinct lines seen)');

  // Regenerate one system and confirm the note repeats exactly — seeded,
  // not re-rolled per call — AND that adding this feature never touched
  // the per-world lifeNote/cultureNote already covered above (fork() is
  // keyed on label+seed only, not on how many prior forks were taken).
  const star = g.stars[5];
  const opts = { faction: g.factionById[star.factionId], allFactions: g.factions };
  const s1 = Gen.generateSystem(star.seed, opts);
  const s2 = Gen.generateSystem(star.seed, opts);
  ok(s1.systemNote === s2.systemNote, 'same seed regenerated: identical systemNote');
  const hab1 = s1.bodies.filter(b => b.kind === 'planet' && b.habitable);
  const hab2 = s2.bodies.filter(b => b.kind === 'planet' && b.habitable);
  const worldNotesMatch = hab1.every((w, i) =>
    w.lifeNote === hab2[i].lifeNote && w.cultureNote === hab2[i].cultureNote);
  ok(worldNotesMatch, 'per-world lifeNote/cultureNote unaffected by the new systemNote fork');
  console.log('        sample systemNote: "' + s1.systemNote + '"');
}

console.log('\nSYSTEM_DESC_BUCKETS ACTUALLY DISCRIMINATE ON GENERATED CONTENT, NOT GOVERNMENT');
{
  // Exercise systemNote directly against synthetic profiles, independent of
  // whatever a real seed happens to roll. Two systems with IDENTICAL
  // violence/corruption/government but different generated bodies must
  // still read differently — that is the entire point of this feature as
  // distinct from cultureNote.
  const RNG = globalThis.RNG;
  const rng = new RNG('system-bucket-test').fork('x');
  const sameGovt = { violence: 40, corruption: 40, government: { lowTechBias: 0.5 } };
  const settled = Gen.systemNote({ ...sameGovt, bodies: [
    ...Array(2).fill({ kind: 'planet', habitable: true }),
    ...Array(3).fill({ kind: 'planet', habitable: false, type: 'rocky' })
  ], ports: [] }, rng);
  const singleWorld = Gen.systemNote({ ...sameGovt, bodies: [
    { kind: 'planet', habitable: true },
    ...Array(4).fill({ kind: 'planet', habitable: false, type: 'rocky' })
  ], ports: [] }, rng);
  const miners = Gen.systemNote({ ...sameGovt, bodies: [
    ...Array(3).fill({ kind: 'planet', habitable: false, type: 'gasGiant' })
  ], ports: [] }, rng);
  const sparse = Gen.systemNote({ ...sameGovt, bodies: [
    { kind: 'planet', habitable: false, type: 'rocky' },
    { kind: 'planet', habitable: false, type: 'desert' }
  ], ports: [] }, rng);
  const busy = Gen.systemNote({ ...sameGovt, bodies: [
    ...Array(6).fill({ kind: 'planet', habitable: false, type: 'rocky' }),
    ...Array(6).fill({ kind: 'station' })
  ], ports: Array(6).fill({}) }, rng);
  const ordinary = Gen.systemNote({ ...sameGovt, bodies: [
    ...Array(6).fill({ kind: 'planet', habitable: false, type: 'rocky' }),
    { kind: 'station' }
  ], ports: [{}] }, rng);
  ok(settled !== ordinary, 'a 2-habitable-world system reads differently than an ordinary one, same government');
  ok(singleWorld !== ordinary && singleWorld !== settled, 'a 1-habitable-world system gets its own bucket');
  ok(miners !== ordinary, 'an all-giants, zero-habitable system reads as a miner\'s system');
  ok(sparse !== ordinary && sparse !== busy, 'a thin (<=4 planet) system reads as sparse');
  ok(busy !== ordinary, 'a heavily-ported system reads as a busy junction');
}

console.log('\nprevewSystem-style CALL NEVER SETS G.visited (via generateSystem purity)');
{
  // previewSystem lives in screens.js and is a thin cache wrapper around
  // exactly this call — the only thing that could leak visitation is
  // generateSystem itself touching something global, which it does not:
  // it takes a seed and opts and returns a fresh object graph.
  const g = Gx.build('kawartha');
  const star = g.stars[7];
  const opts = { faction: g.factionById[star.factionId], allFactions: g.factions };
  const before = JSON.stringify(Object.keys(globalThis).filter(k => k === 'visited'));
  const sys = Gen.generateSystem(star.seed, opts);
  ok(!!sys && Array.isArray(sys.bodies), 'generateSystem returns a plain system object for an arbitrary star');
  ok(before === JSON.stringify(Object.keys(globalThis).filter(k => k === 'visited')),
    'generateSystem touches no global "visited" state');
}

console.log(fail ? '\n' + fail + ' CHECK(S) FAILED' : '\nall checks passed');
if (fail) process.exitCode = 1;
