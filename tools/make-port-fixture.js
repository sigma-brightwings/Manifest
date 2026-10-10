/* make-port-fixture.js — write synthetic port .glb files.
 *
 *     node tools/make-port-fixture.js <out-dir>
 *
 * WHY THIS EXISTS. The port pipeline (glb2hulls --ports) reads named nodes
 * out of a model and hands the simulation numbers it then parks ships and
 * clamps cameras against. That is worth testing, and testing it needs a
 * .glb — but binary art in the repo is exactly what nobody wants to diff,
 * and waiting for real models means the tool is only ever exercised by the
 * asset it is supposed to be validating.
 *
 * So this writes the smallest models that carry every anchor the convention
 * defines: a surface bay with a pad, a mouth, a floor, a ceiling, a chamber,
 * three berths and a sign, and an orbital station with a spinning ring and
 * two dock ports. They are boxes. They are not meant to be looked at — they
 * are meant to make the converter's arithmetic checkable.
 *
 * Authored in glTF's own axes (+Y up, +Z front) exactly as a real model
 * would be, so the converter's Y/Z swap is under test too rather than
 * side-stepped.
 */
'use strict';
var fs = require('fs');
var path = require('path');

var outDir = process.argv[2] || path.join(__dirname, '..', 'test', 'fixtures');

/* ---- a box, in glTF axes ------------------------------------------------ */
function boxAt(cx, cy, cz, hx, hy, hz) {
  var v = [
    [cx - hx, cy - hy, cz - hz], [cx + hx, cy - hy, cz - hz],
    [cx + hx, cy + hy, cz - hz], [cx - hx, cy + hy, cz - hz],
    [cx - hx, cy - hy, cz + hz], [cx + hx, cy - hy, cz + hz],
    [cx + hx, cy + hy, cz + hz], [cx - hx, cy + hy, cz + hz]
  ];
  var f = [0,1,2, 0,2,3, 4,6,5, 4,7,6, 0,4,5, 0,5,1,
           3,2,6, 3,6,7, 0,3,7, 0,7,4, 1,5,6, 1,6,2];
  return { v: v, f: f };
}

/* ---- GLB writer --------------------------------------------------------- */
function writeGlb(file, parts) {
  var json = {
    asset: { version: '2.0', generator: 'make-port-fixture' },
    scenes: [{ nodes: [] }], scene: 0,
    nodes: [], meshes: [], accessors: [], bufferViews: [], buffers: [],
    materials: [{ pbrMetallicRoughness: { baseColorFactor: [0.6, 0.65, 0.7, 1] } }]
  };
  var chunks = [], offset = 0;

  parts.forEach(function (part) {
    var box = part.box;
    /* Positions as float32, indices as uint16 — the two the converter's
     * accessor reader is exercised on most. */
    var pos = Buffer.alloc(box.v.length * 12);
    box.v.forEach(function (p, i) {
      pos.writeFloatLE(p[0], i * 12);
      pos.writeFloatLE(p[1], i * 12 + 4);
      pos.writeFloatLE(p[2], i * 12 + 8);
    });
    var idx = Buffer.alloc(box.f.length * 2);
    box.f.forEach(function (n, i) { idx.writeUInt16LE(n, i * 2); });

    var posView = json.bufferViews.length;
    json.bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: pos.length });
    chunks.push(pos); offset += pos.length;
    var idxView = json.bufferViews.length;
    json.bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: idx.length });
    chunks.push(idx); offset += idx.length;
    /* uint16 accessors must start on an even offset, and every bufferView
     * here is a multiple of 12 or 2, so no padding is needed — but say so,
     * because the next person to add a uint8 attribute will need it. */

    var lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    box.v.forEach(function (p) {
      for (var a = 0; a < 3; a++) {
        if (p[a] < lo[a]) lo[a] = p[a];
        if (p[a] > hi[a]) hi[a] = p[a];
      }
    });

    var posAcc = json.accessors.length;
    json.accessors.push({ bufferView: posView, componentType: 5126,
                          count: box.v.length, type: 'VEC3', min: lo, max: hi });
    var idxAcc = json.accessors.length;
    json.accessors.push({ bufferView: idxView, componentType: 5123,
                          count: box.f.length, type: 'SCALAR' });

    var mesh = json.meshes.length;
    json.meshes.push({ primitives: [{ attributes: { POSITION: posAcc },
                                      indices: idxAcc, material: 0, mode: 4 }] });
    var node = json.nodes.length;
    var rec = { name: part.name, mesh: mesh };
    /* An optional rotation, so a fixture can carry berths that genuinely
     * face different ways — which is the case the normal extraction exists
     * for and the one a fixture of axis-aligned boxes would never exercise.
     * Quaternion, as glTF wants it. */
    if (part.rot) rec.rotation = part.rot;
    if (part.extras) rec.extras = part.extras;
    json.nodes.push(rec);
    json.scenes[0].nodes.push(node);
  });

  var bin = Buffer.concat(chunks);
  while (bin.length % 4) bin = Buffer.concat([bin, Buffer.alloc(1)]);
  var jsonStr = JSON.stringify(json);
  while (jsonStr.length % 4) jsonStr += ' ';
  var jsonBuf = Buffer.from(jsonStr, 'utf8');

  var total = 12 + 8 + jsonBuf.length + 8 + bin.length;
  var out = Buffer.alloc(total);
  out.write('glTF', 0, 'ascii');
  out.writeUInt32LE(2, 4);
  out.writeUInt32LE(total, 8);
  out.writeUInt32LE(jsonBuf.length, 12);
  out.write('JSON', 16, 'ascii');
  jsonBuf.copy(out, 20);
  var binHdr = 20 + jsonBuf.length;
  out.writeUInt32LE(bin.length, binHdr);
  out.write('BIN\0', binHdr + 4, 'ascii');
  bin.copy(out, binHdr + 8);

  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, out);
  return out.length;
}

/* ---- the surface bay ----------------------------------------------------
 * Built to the numbers in ref/PORT-MODELS.md so the converter's output can
 * be checked against them directly. In glTF axes, which means the game's
 * UP is glTF's +Y and the game's -Y is glTF's +Z.
 *
 * The pad is 40 units half-width, so 1 pad radius = 40 and every other
 * dimension below is (pad radii x 40). Chosen as an awkward number on
 * purpose: a fixture built at 1 unit = 1 pad radius would pass even if the
 * converter ignored portPad entirely. */
var U = 40;
var bay = [
  { name: 'portPad',     box: boxAt(0, 0, 0, U, U * 0.02, U) },
  { name: 'bayMouth',    box: boxAt(0, U * 0.02, 0, U * 0.55, U * 0.01, U * 0.55) },
  { name: 'bayFloor',    box: boxAt(0, -U * 0.9, 0, U * 1.3, U * 0.02, U * 0.8) },
  { name: 'bayCeiling',  box: boxAt(0, -U * 0.54, 0, U * 1.3, U * 0.02, U * 0.8) },
  { name: 'bayChamber',  box: boxAt(0, -U * 0.72, 0, U * 1.3, U * 0.18, U * 0.8) },
  /* Three berths along one wall, written to the file OUT of left-to-right
   * order so the converter's sort is actually under test. */
  { name: 'berth1',      box: boxAt(0,        -U * 0.88, U * 0.6, U * 0.3, U * 0.02, U * 0.15) },
  { name: 'berth2',      box: boxAt(U * 0.95, -U * 0.88, U * 0.6, U * 0.3, U * 0.02, U * 0.15) },
  { name: 'berth0',      box: boxAt(-U * 0.95, -U * 0.88, U * 0.6, U * 0.4, U * 0.02, U * 0.2) },
  { name: 'portSign0',   box: boxAt(0, U * 0.06, U * 0.55, U * 0.4, U * 0.06, U * 0.01) },
  { name: 'apronSlab',   box: boxAt(0, U * 0.005, 0, U * 1.35, U * 0.005, U * 1.35) }
];

/* ---- the orbital station ------------------------------------------------
 * No pad, so it normalises to radius 1 off its own bounds.
 *
 * NAMED TO models/STATIONS.md, not to the convention this tool invented
 * before that document existed: throats rather than berths, telescopic
 * sliding leaves and a force field rather than `doorLeaf`, a hall and a
 * transfer line for the interior, a billboard for the signage. The ground
 * furniture is here on purpose — it is what the design adds so a station
 * can sit on a plane in the authoring workspace, and the converter has to
 * be seen dropping it. */
var station = [
  { name: 'stationHub',        box: boxAt(0, 0, 0, 22, 22, 26) },
  { name: 'stationSpinRing',   box: boxAt(0, 0, 0, 100, 100, 16) },

  /* Two shared S/M berths and one heavy, sized to the fleet envelopes the
   * design measured: shared throat 6.56 x 4.97 x 11.81, heavy 7.66 x 5.77
   * x 13.51. Half-extents here, so half of each. */
  /* bay0 faces +Z (forward), bay1 is turned 180 degrees to face -Z, and the
   * heavy berth is turned 90 degrees to face +X. Three different normals,
   * because a fixture of axis-aligned boxes would let a converter that
   * ignored orientation entirely pass every check. A spine station has
   * berths down both flanks and a cylinder's face inward; getting this
   * wrong would say a ship can fly into a bay whose far wall it would hit. */
  { name: 'bay0Throat',        box: boxAt(-40, 0, 34, 3.28, 2.49, 5.9) },
  { name: 'bay1Throat',        box: boxAt(40, 0, 34, 3.28, 2.49, 5.9),
    rot: [0, 1, 0, 0] },                                  /* 180 deg about Y */
  { name: 'heavyThroat',       box: boxAt(0, 0, 40, 3.83, 2.89, 6.76),
    rot: [0, 0.7071068, 0, 0.7071068] },                  /* 90 deg about Y */

  /* Four telescopic leaves on the shared gate, two per side. Separate
   * instances because they move independently. */
  { name: 'bay0SlidingDoorL1', box: boxAt(-44, 0, 40, 1.6, 2.5, 0.3) },
  { name: 'bay0SlidingDoorL2', box: boxAt(-42, 0, 40, 1.6, 2.5, 0.3) },
  { name: 'bay0SlidingDoorR1', box: boxAt(-38, 0, 40, 1.6, 2.5, 0.3) },
  { name: 'bay0SlidingDoorR2', box: boxAt(-36, 0, 40, 1.6, 2.5, 0.3) },
  { name: 'bay0DoorHouseL',    box: boxAt(-46, 0, 40, 3.4, 3, 0.8) },
  { name: 'bay0DoorHouseR',    box: boxAt(-34, 0, 40, 3.4, 3, 0.8) },
  /* And the behaviour the design keeps in userData, which three.js writes
   * into glTF `extras`. The converter carries it through untouched. */
  { name: 'bay0InnerGate',     box: boxAt(-40, 0, 26, 3.3, 2.5, 0.3),
    extras: { airlock: { outerGate: 'slidingDoors', innerGate: 'InnerGate',
                         controlsLockedUntil: 'outerGateOpen',
                         outerCyclesOnlyWhenOccupied: true } } },

  /* The heavy gate holds atmosphere with a field and keeps a mechanical
   * backup behind it. */
  { name: 'heavyForceField',   box: boxAt(0, 0, 47, 3.9, 2.9, 0.1) },
  { name: 'heavyBlastDoorL',   box: boxAt(-4, 0, 47, 2, 3, 0.4) },
  { name: 'heavyBlastDoorR',   box: boxAt(4, 0, 47, 2, 3, 0.4) },
  { name: 'heavyInnerGate',    box: boxAt(0, 0, 32, 3.9, 2.9, 0.3) },

  { name: 'bay0NavLightL',     box: boxAt(-45, 3, 41, 0.4, 0.4, 0.4) },
  { name: 'bay0NavLightR',     box: boxAt(-35, 3, 41, 0.4, 0.4, 0.4) },
  { name: 'bay0ApproachLamp0', box: boxAt(-40, 4, 42, 0.3, 0.3, 0.3) },
  { name: 'billboardFace',     box: boxAt(0, 24, 0, 30, 6, 2) },
  { name: 'bay0Designation',   box: boxAt(-40, 3.5, 41, 2, 0.8, 0.1) },

  /* The pressurised inside, which is its own component by design. */
  { name: 'hallFloor',         box: boxAt(0, -30, -60, 30, 1, 20) },
  { name: 'hallRoof',          box: boxAt(0, -14, -60, 30, 1, 20) },
  { name: 'hallWallL',         box: boxAt(-30, -22, -60, 1, 8, 20) },
  { name: 'transferMainBed',   box: boxAt(0, -29, -20, 4, 0.5, 20) },
  { name: 'bay0ConveyorBed',   box: boxAt(-40, -1, 20, 3, 0.4, 6) },

  /* Display furniture. Must NOT reach the game. */
  { name: 'groundSaddle',      box: boxAt(0, -40, 0, 40, 6, 40) },
  { name: 'standLegA',         box: boxAt(-30, -36, 0, 3, 6, 3) },
  { name: 'standShoeA',        box: boxAt(-30, -41, 0, 5, 1, 5) }
];

var a = writeGlb(path.join(outDir, 'bay.glb'), bay);
var b = writeGlb(path.join(outDir, 'orbital.glb'), station);
console.log('wrote ' + path.join(outDir, 'bay.glb') + ' (' + a + ' bytes)');
console.log('wrote ' + path.join(outDir, 'orbital.glb') + ' (' + b + ' bytes)');
