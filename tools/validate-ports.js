/* validate-ports.js — does a port model carry the contract the game reads?
 *
 *     node tools/validate-ports.js ref/ports
 *     node tools/validate-ports.js ref/ports/city-port-m.glb
 *     node tools/validate-ports.js --selftest
 *
 * WHY THIS EXISTS. Four port families were modelled independently and each
 * invented its own vocabulary for the same three ideas: where the ground is,
 * what volume a hull can stand in, and how a hull gets to it.
 *
 *     concept        runwayPort        padSite            cityPort    cometOutpost
 *     ground plane   groundY           surfaceY           (absent)    crown.plateauY
 *     hull space     bay + chamber     interiorAnchors    stands[]    openings[]
 *     route in       route[]           gates[]            (absent)    route{lg,sm}
 *
 * The game cannot read four dialects. `Render.portModelFor` is the single key
 * deciding both which mesh is drawn and whose dimensions are used, and growing
 * a second copy of it per family is the thing the house rules forbid — the
 * lining and the void came apart last time a dimension was derived twice. So
 * the exporters converge on ONE block, `userData.interior`, and this says
 * exactly what is missing before a re-export reaches the game.
 *
 * It reports rather than throws, and for every missing field it names the
 * legacy key the same information already lives in. Most of these are renames,
 * and a rename is a far smaller job than a remodel — saying "add chambers" when
 * the model already has `stands` would be technically true and useless.
 *
 * No dependencies: a GLB is a 12-byte header and length-prefixed chunks, and
 * the JSON chunk is all this needs. Nothing here decodes a vertex.
 */
'use strict';
var fs = require('fs'), path = require('path');

/* Assigned rather than declared so --selftest can swap it for a stub and
 * exercise checkFile without writing a file to disk. */
var glbJson = function (file) {
  var d = fs.readFileSync(file);
  if (d.length < 12 || d.toString('ascii', 0, 4) !== 'glTF') {
    throw new Error('not a GLB (no glTF magic)');
  }
  var off = 12;
  while (off + 8 <= d.length) {
    var len = d.readUInt32LE(off), type = d.readUInt32LE(off + 4);
    off += 8;
    if (type === 0x4E4F534A) return JSON.parse(d.toString('utf8', off, off + len));
    off += len;
  }
  throw new Error('no JSON chunk');
};

function rootNode(j) {
  var scene = (j.scenes || [])[j.scene || 0] || {};
  return (j.nodes || [])[(scene.nodes || [])[0]] || {};
}

/* A PARTS LIBRARY IS NOT A PORT. detail-kit.glb is greebles the patterns
 * borrow from; it has no interior, no route and no ground, and faulting it
 * every run would train everyone to ignore this tool's output. */
function isKit(file, root) {
  return /detail-kit/i.test(path.basename(file)) || /^detailKit/i.test(root || '');
}

/* The contract. `from` is where the same information already lives in one of
 * the four dialects, so a message can say "rename this" rather than "add
 * this". Keep these lists honest — a wrong hint is worse than none. */
var REQUIRED = [
  { key: 'envelope', from: ['bay', 'stands[].{w,d}', 'openings[].{w,d}'],
    note: 'the hull this set is sized to, as {w,h,d}' },
  { key: 'padRadius', from: ['padRadius', 'the portPad node half-width'],
    note: 'so the game can express everything in pad radii, whatever the model scale' },
  { key: 'chambers', from: ['chamber + bay', 'stands', 'openings', 'interiorAnchors'],
    note: 'every volume a hull can stand in: [{id,kind,w,h,d,floorY,ceilY,x,z}]' },
  { key: 'routes', from: ['route', 'route.{lg,sm}', 'gates'],
    note: 'one per branch, EACH WITH ITS OWN envelope — sweeping every branch ' +
          'with the heavy hull condemns the medium bays for being medium' },
  { key: 'gates', from: ['gates', 'apronDoorLeaf* / BlastDoor* / SlidingDoor* nodes'],
    note: '[{id,node,kind,plane,aperture,open,closed,requires}] — `plane` matters: ' +
          'xy is a wall, xz is a lid, and a sampler that assumes vertical reads a lid as sealed' }
];

var OPTIONAL = [
  { key: 'groundY', from: ['groundY', 'surfaceY', 'crown.plateauY'],
    note: 'the surface plane. REQUIRED for anything planetside; omit for orbital' },
  { key: 'carriers', from: ['lift', 'sorter', 'transferLiftCar extras.carrier'],
    note: 'lifts and traversers: [{id,node,kind,level,angle,from,to}]. `kind` may be ' +
          '"both" — some traversers are also elevators — and a 45-degree cargo lift ' +
          'is angle:45 with level:true, because the shaft is inclined and the deck is not' },
  { key: 'control', from: ['controlSystem node'],
    note: 'the command cabinet. Must be OUTSIDE the excavation: a computer that lets ' +
          'you in cannot be inside the thing it lets you into' },
  { key: 'excavation', from: ['(nothing yet)'],
    note: 'the volumes that must be empty, for the terrain cut and the route sweep' },
  { key: 'groundCut', from: ['(nothing yet)'],
    note: 'only the breaches reaching the surface — unioning a chamber 34 down opens ' +
          'a crater over a room nobody can see' }
];

function checkFile(file) {
  var out = { file: path.basename(file), root: null, missing: [], soft: [],
              ok: [], fatal: null, kit: false, wholeBlock: null };
  var j;
  try { j = glbJson(file); } catch (e) { out.fatal = e.message; return out; }
  var root = rootNode(j);
  out.root = root.name || '(unnamed)';
  if (isKit(file, out.root)) { out.kit = true; return out; }

  var ex = root.extras || {};
  var it = ex.interior;
  if (!it || typeof it !== 'object') {
    out.wholeBlock = Object.keys(ex);
    REQUIRED.forEach(function (r) { out.missing.push(r); });
    OPTIONAL.forEach(function (o) { out.soft.push(o); });
    return out;
  }

  REQUIRED.forEach(function (r) {
    var v = it[r.key];
    var empty = v === undefined || v === null || (Array.isArray(v) && !v.length);
    if (empty) out.missing.push(r); else out.ok.push(r.key);
  });
  OPTIONAL.forEach(function (o) {
    if (it[o.key] === undefined) out.soft.push(o); else out.ok.push(o.key);
  });

  /* The rule most likely to be got wrong, because one shared envelope looks
   * perfectly reasonable until a heavy hull is swept down a medium branch. */
  if (Array.isArray(it.routes)) {
    var bad = it.routes.filter(function (r) { return !r || !r.envelope; }).length;
    if (bad) {
      out.missing.push({ key: 'routes[].envelope', from: ['routes'],
        note: bad + ' of ' + it.routes.length +
              ' branches carry no envelope of their own' });
    }
  }
  /* Planetside without a ground plane is not a soft miss. The terrain layer
   * has nothing to cut against and the works float. */
  if (it.groundY === undefined && Array.isArray(it.chambers) &&
      it.chambers.some(function (c) { return c && c.floorY !== undefined; })) {
    out.missing.push({ key: 'groundY', from: ['groundY', 'surfaceY', 'crown.plateauY'],
      note: 'chambers declare a floorY, so this set is planetside and the surface ' +
            'plane is required — ground level is not y = 0, it is the top of the paving' });
  }
  return out;
}

/* SELF-TEST. House rule 8 turned on the checker: one that has only ever said
 * "no" has not been tested. Two models in memory — one carrying the contract,
 * one whose single route has no envelope — and both outcomes asserted. */
function selfTest() {
  var good = { interior: {
    envelope: { w: 14.7, h: 5.8, d: 20.5 }, padRadius: 13.56, groundY: 45.18,
    chambers: [{ id: 'ml', kind: 'ml', w: 33.8, h: 12, d: 29.7,
                 floorY: 3.7, ceilY: 15, x: 0, z: -35.4 }],
    routes: [{ id: 'ml', envelope: { w: 14.7, h: 5.8, d: 20.5 },
               waypoints: [{ x: 0, y: 45, z: 0, at: 'pad' }] }],
    gates: [{ id: 'apron', node: 'apronDoorLeaf', kind: 'comb', plane: 'xz',
              aperture: { w: 9.5, h: 25 }, open: 0, closed: 1 }]
  } };
  var noEnv = JSON.parse(JSON.stringify(good));
  delete noEnv.interior.routes[0].envelope;
  var noGround = JSON.parse(JSON.stringify(good));
  delete noGround.interior.groundY;

  function run(extras) {
    var saved = glbJson;
    glbJson = function () {
      return { scene: 0, scenes: [{ nodes: [0] }],
               nodes: [{ name: 'selfTestPort', extras: extras }] };
    };
    var r = checkFile('(memory)');
    glbJson = saved;
    return r;
  }
  function has(r, key) {
    return r.missing.some(function (m) { return m.key === key; });
  }
  var a = run(good), b = run(noEnv), c = run(noGround);
  var res = [
    [a.missing.length === 0, 'a complete contract is accepted'],
    [b.missing.length === 1 && has(b, 'routes[].envelope'),
     'a branch with no envelope of its own is faulted'],
    [has(c, 'groundY'), 'a planetside set with no surface plane is faulted']
  ];
  var bad = 0;
  res.forEach(function (r) {
    if (!r[0]) bad++;
    console.log((r[0] ? '  ok   ' : '  FAIL ') + r[1]);
  });
  return bad ? 1 : 0;
}

var target = process.argv[2];
if (target === '--selftest') process.exit(selfTest());
if (!target) {
  console.error('usage: node tools/validate-ports.js <dir|file.glb>');
  console.error('       node tools/validate-ports.js --selftest');
  process.exit(2);
}

var files = fs.statSync(target).isDirectory()
  ? fs.readdirSync(target)
      .filter(function (f) { return /\.glb$/i.test(f); })
      .map(function (f) { return path.join(target, f); })
  : [target];

var bad = 0, kits = 0, checked = 0;
files.forEach(function (f) {
  var r = checkFile(f);
  var head = r.file + '  [' + r.root + ']';
  if (r.fatal) { console.log('\n' + head + '\n   FATAL  ' + r.fatal); bad++; return; }
  if (r.kit) { kits++; return; }
  checked++;
  if (!r.missing.length) {
    console.log('\n' + head + '  OK' +
                (r.soft.length ? '   (' + r.soft.length + ' optional absent)' : ''));
    return;
  }
  bad++;
  console.log('\n' + head);
  if (r.wholeBlock) {
    console.log('   NO interior BLOCK AT ALL — the game has nothing to read.');
    console.log('   the root carries: ' + (r.wholeBlock.join(', ') || '(nothing)'));
  }
  r.missing.forEach(function (m) {
    console.log('   MISSING  interior.' + m.key);
    console.log('            ' + m.note);
    if (m.from && m.from.length) {
      console.log('            already present as: ' + m.from.join('  |  '));
    }
  });
});

console.log('\n' + (checked - bad) + ' of ' + checked + ' port models carry the contract' +
            (kits ? '   (' + kits + ' parts kit' + (kits > 1 ? 's' : '') + ' skipped)' : ''));
process.exit(bad ? 1 : 0);
