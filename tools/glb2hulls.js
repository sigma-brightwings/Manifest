/* glb2hulls.js — turn a folder of .glb ship models into src/hulls.js.
 *
 *     node tools/glb2hulls.js <folder-with-glbs> [out.js]
 *
 * The game's renderer eats one mesh format: { v: [[x,y,z]...], f: [[a,b,c]...],
 * c: [colourPerFace...] }, hand-rolled projection, painter's algorithm, no
 * GPU. So a model pipeline here is not "load glTF" — it is: walk the node
 * hierarchy, bake every transform into the vertices, keep one flat colour
 * per face from the material, normalise the whole ship to unit length on
 * the origin, and write it out as data the existing paintMesh draws with
 * zero new runtime code.
 *
 * Every model gets an ID — its filename stem — and that ID is the contract:
 * the game assigns hulls to ship classes BY ID, the viewer page labels them
 * BY ID, and re-running this tool over a bigger folder adds models without
 * renaming anything.
 *
 * Deliberately supported: positions, indices (u8/u16/u32), node TRS and
 * matrix transforms, baseColorFactor, emissiveFactor. Deliberately ignored:
 * textures, normals (the renderer computes its own), skins, animations.
 */
'use strict';
var fs = require('fs');
var path = require('path');

/* ---- two modes, one parser ---------------------------------------------
 * `--ports` converts PORTS instead of ships. It is a mode rather than a
 * second tool because everything above the classification step — the GLB
 * container, the accessors, the matrix kit, the palette compression — is
 * identical, and a sibling script would have been a hundred and thirty
 * copied lines waiting to drift out of step.
 *
 * What actually differs is three things, and each is marked PORTS below:
 * the axis convention (+z up out of the ground, not +y up), the scale
 * reference (a declared pad footprint, not the longest axis), and the set
 * of anchors extracted. See ref/PORT-MODELS.md.
 */
var argv = process.argv.slice(2).filter(function (a) { return a !== '--ports'; });
var PORTS = process.argv.indexOf('--ports') >= 0;

var srcDir = argv[0] || '.';
var outFile = argv[1] || path.join(__dirname, '..', 'src',
                                   PORTS ? 'ports.js' : 'hulls.js');

/* ---- tiny matrix kit (column-major 4x4, like glTF) ---------------------- */
function matIdentity() { return [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]; }
function matMul(a, b) {
  var o = new Array(16);
  for (var c = 0; c < 4; c++) for (var r = 0; r < 4; r++) {
    o[c*4+r] = a[r]*b[c*4] + a[4+r]*b[c*4+1] + a[8+r]*b[c*4+2] + a[12+r]*b[c*4+3];
  }
  return o;
}
function matFromTRS(t, q, s) {
  t = t || [0,0,0]; q = q || [0,0,0,1]; s = s || [1,1,1];
  var x=q[0], y=q[1], z=q[2], w=q[3];
  var m = [
    (1-2*(y*y+z*z))*s[0], (2*(x*y+z*w))*s[0], (2*(x*z-y*w))*s[0], 0,
    (2*(x*y-z*w))*s[1], (1-2*(x*x+z*z))*s[1], (2*(y*z+x*w))*s[1], 0,
    (2*(x*z+y*w))*s[2], (2*(y*z-x*w))*s[2], (1-2*(x*x+y*y))*s[2], 0,
    t[0], t[1], t[2], 1
  ];
  return m;
}
function matApply(m, p) {
  return [
    m[0]*p[0] + m[4]*p[1] + m[8]*p[2] + m[12],
    m[1]*p[0] + m[5]*p[1] + m[9]*p[2] + m[13],
    m[2]*p[0] + m[6]*p[1] + m[10]*p[2] + m[14]
  ];
}

/* ---- GLB container ------------------------------------------------------ */
function parseGlb(buf) {
  if (buf.toString('ascii', 0, 4) !== 'glTF') throw new Error('not a GLB');
  var jsonLen = buf.readUInt32LE(12);
  if (buf.toString('ascii', 16, 20) !== 'JSON') throw new Error('no JSON chunk');
  var json = JSON.parse(buf.toString('utf8', 20, 20 + jsonLen));
  var binStart = 20 + jsonLen;
  var bin = null;
  if (binStart < buf.length) {
    var binLen = buf.readUInt32LE(binStart);
    bin = buf.slice(binStart + 8, binStart + 8 + binLen);
  }
  return { json: json, bin: bin };
}

function accessorData(g, idx) {
  var acc = g.json.accessors[idx];
  var bv = g.json.bufferViews[acc.bufferView];
  var base = (bv.byteOffset || 0) + (acc.byteOffset || 0);
  var n = acc.count;
  var compCount = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[acc.type];
  var out = [];
  var stride, read;
  if (acc.componentType === 5126) { stride = 4; read = function (o) { return g.bin.readFloatLE(o); }; }
  else if (acc.componentType === 5125) { stride = 4; read = function (o) { return g.bin.readUInt32LE(o); }; }
  else if (acc.componentType === 5123) { stride = 2; read = function (o) { return g.bin.readUInt16LE(o); }; }
  else if (acc.componentType === 5121) { stride = 1; read = function (o) { return g.bin.readUInt8(o); }; }
  else throw new Error('componentType ' + acc.componentType);
  var byteStride = bv.byteStride || compCount * stride;
  for (var i = 0; i < n; i++) {
    var rec = [];
    for (var c = 0; c < compCount; c++) rec.push(read(base + i * byteStride + c * stride));
    out.push(compCount === 1 ? rec[0] : rec);
  }
  return out;
}

function materialColour(g, idx) {
  var m = (g.json.materials || [])[idx] || {};
  var pbr = m.pbrMetallicRoughness || {};
  var base = pbr.baseColorFactor || [0.72, 0.75, 0.8, 1];
  var em = m.emissiveFactor || [0, 0, 0];
  var lit = (em[0] + em[1] + em[2]) > 0.25;
  var c = lit ? em : base;
  function hex(v) {
    var b = Math.max(0, Math.min(255, Math.round(Math.pow(v, 1 / 2.2) * 255)));
    return ('0' + b.toString(16)).slice(-2);
  }
  return (lit ? '!#' : '#') + hex(c[0]) + hex(c[1]) + hex(c[2]);
}

/* ---- what belongs to the outside, and what belongs to the seat ----------
 * The redesigned models ship the cockpit inside the same file as the hull:
 * `cockpitInterior`, `pilotSeat` and `pilotSeatBack` sit just behind
 * `cockpitGlass` at the nose. Merging all of it into one mesh — which is
 * what this tool used to do — welds a chair inside the fuselage: invisible
 * from outside, several hundred wasted triangles, and no way to use it as
 * a cockpit.
 *
 * So geometry is sorted into two buckets by node name. The GLASS stays
 * with the exterior, because it is visible from outside, but its bounds
 * are recorded separately: that box is where the canopy is, and it is what
 * the seat view mounts its panels against. */
var INTERIOR_RE = /cockpitInterior|pilotSeat/i;
var GLASS_RE = /cockpitGlass/i;

/* ---- and where the guns actually are ------------------------------------
 * Every armed model carries its weapons as named nodes — `laser0`/`laser1`,
 * or `laserChin0`/`laserChin1` on the courier — each with a `laserPylon`,
 * a `laserBarrel` and a `laserEmitter`. That last one is the muzzle: it is
 * the tip of the barrel, modelled, in the right place, on every hull.
 *
 * combat.js used to guess this with four hand-tuned constants, which was
 * wrong twice over — the guess did not match the art, and it could not,
 * because a chin gun and a wing gun are not in the same place. Recording
 * the emitters here means a beam leaves the barrel the artist drew, and a
 * model redesigned tomorrow moves its own gunfire with it.
 *
 * Each emitter is kept as a SEPARATE instance rather than merged into one
 * box: two guns are two muzzles, and a merged bound would put both beams
 * out of the centreline between them. */
var EMITTER_RE = /laserEmitter/i;

/* ---- PORTS: the anchors a port carries ---------------------------------
 * Same mechanism as the emitters above — a named node opens one bounding
 * box and its children add to it — applied to the things a PORT has to tell
 * the simulation rather than the renderer.
 *
 * The distinction that matters: a ship's anchors are cosmetic (where a beam
 * appears to leave), and a port's are LOAD-BEARING. The camera clamps
 * against the chamber and the floor, and ships are parked in the berths. A
 * bay whose anchors disagree with its geometry puts a ship inside a wall,
 * so these are extracted and then checked (see the sanity pass at the end
 * of convertPort).
 *
 * THE NAMES ARE THE STATION DESIGN'S OWN. An earlier version of this file
 * invented a convention — portPad, bayMouth, berth0 — before there was any
 * port art to look at. models/STATIONS.md then turned out to carry a far
 * better one, with `station-tests.js` asserting invariants behind it, so
 * these match THAT and the invented names are kept only where the design
 * has nothing to say yet (the surface bays, still to be built).
 *
 * The important one: a berth is a tagged GROUP, and the measurable volume
 * inside it is `…Throat`. STATIONS.md is explicit that the throat is the
 * thing to measure to test whether a hull fits, and that a berth's outward
 * normal is its group's local +Z.
 *
 * SINGLE boxes — one per port. */
var PORT_SINGLE = {
  /* Surface bays only. No station design uses these yet; the four orbital
   * patterns have no pad and normalise to radius 1 instead. */
  pad: /^portPad/i,
  mouth: /bayMouth/i,
  floor: /bayFloor/i,
  ceiling: /bayCeiling/i,
  chamber: /bayChamber/i
};

/* REPEATED boxes — an ordered list, one entry per instance. */
var PORT_MULTI = {
  /* The bay volume — and it is measured from the throat's PANELS, not from
   * the throat.
   *
   * `Throat$` is STATIONS.md's name for the reference volume and it was the
   * right thing to look for. It matched nothing, in all four station
   * patterns, and the cause is worth keeping because it is invisible from
   * either end. station.js DOES build the volume:
   *
   *     const throat = box(w, h, depth, matDeep, tag + 'Throat');
   *     throat.visible = false;
   *
   * It is hidden on purpose — a visible one is a dark slab filling the
   * aperture, which the lab fixed once already. three's GLTFExporter
   * defaults to `onlyVisible: true`, and three-d-stage.js exports with
   * `parseAsync(obj, { binary: true })` and no override. So the one volume
   * the whole berth system measures against is the one thing the exporter
   * drops, silently, and every station converted with geom=NONE.
   *
   * Turning onlyVisible off would bring it back AND weld every other
   * invisible helper into the drawn mesh, so the fix belongs here. The
   * throat's five structural panels do export — ThroatFloor, ThroatRoof,
   * ThroatWallL, ThroatWallR, ThroatBack — and they line the bay, so their
   * union IS the bay envelope. Arguably a better measurement than the
   * reference box: it is the surface a hull would actually hit.
   *
   * `^berth\d` is kept but no longer carries this alone — the real groups
   * are berthL, berthSM0L, berthPylon0, none of which put a digit straight
   * after "berth". The lamps are excluded (`ThroatLamp0` is a fixture, and
   * station.js already had to rename them 'lamp…' for the same reason) and
   * so is anything else that merely mentions a throat.
   *
   * MERGED PER BERTH by mergeKey below, or five panels would arrive as five
   * berths and a cylinder with one bay would report having five. */
  berths: /Throat(Floor|Roof|WallL|WallR|Back)$|Throat$|^berth\d/i,
  /* Everything that MOVES. The models are static at their stowed/open
   * positions and the game layer is expected to drive them, so each leaf
   * has to arrive as its own instance with its own box — a merged bound
   * would give one door where there are four leaves. */
  gates: /SlidingDoor[LR]\d|BlastDoor[LR]|ForceField/i,
  innerGates: /InnerGate/i,
  /* Where a stowed leaf lives. STATIONS.md asserts >=90% of each leaf sits
   * inside its house, which is what makes an open door invisible rather
   * than proud of the hull. */
  pockets: /Door(Pocket|House)|Blast(Pocket|House)/i,
  /* Red to port, green to starboard — an orientation cue on approach, and
   * the one piece of dressing that is information rather than decoration. */
  navLights: /NavLight/i,
  lamps: /ApproachLamp|CycleLamp|mouthLamp|Beacon/i,
  signs: /^billboard|Designation$|^portSign/i,
  docks: /^dockPort\d/i
};

/* The pressurised inside: the hall hulls are moved to, and the transfer
 * line that carries them there. A deliberately separate structure in the
 * design — `checkConnectivity` allows it as a second component — so it is
 * its own bucket here rather than part of the shell. */
var PORT_INTERIOR_RE = /^hall|^transfer(Main|Lift)|Conveyor|^liguide|^liftGuide|^portInterior/i;

var PORT_SPIN_RE = /stationSpin/i;

/* DISPLAY-ONLY, AND EXCLUDED. The station builders ground their output with
 * `min.y === 0` so it can be dropped on a ground plane in the design
 * workspace, and they add the furniture to match: a saddle, stand legs,
 * shoes, a cradle arc. None of that belongs on something in orbit, and a
 * station floating with its landing legs down would be the first thing
 * anybody noticed. Dropped rather than bucketed — there is no view in which
 * the game wants them. */
var PORT_OMIT_RE = /^groundSaddle|^standLeg|^standShoe|^cradleArc/i;

/* ---- one model ---------------------------------------------------------- */
function convert(file) {
  var g = parseGlb(fs.readFileSync(file));
  var j = g.json;
  var ext = { v: [], f: [], c: [] };
  var inr = { v: [], f: [], c: [] };
  var glassMin = [Infinity, Infinity, Infinity];
  var glassMax = [-Infinity, -Infinity, -Infinity];
  var sawGlass = false;
  var emitters = [];        // one accumulated bounding box per laserEmitter

  function walk(nodeIdx, parentMat, inInterior, inEmitter) {
    var node = j.nodes[nodeIdx];
    var local = node.matrix ? node.matrix.slice()
                            : matFromTRS(node.translation, node.rotation, node.scale);
    var world = matMul(parentMat, local);
    var name = node.name || '';
    /* Classification is INHERITED: a named parent carries unnamed children
     * with it, which is how these files are actually assembled. */
    var interior = inInterior || INTERIOR_RE.test(name);
    /* A new emitter opens a new box; a child of one keeps adding to its
     * parent's, so a multi-part muzzle stays a single gun. */
    var emitter = inEmitter;
    if (!emitter && EMITTER_RE.test(name)) {
      emitter = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
      emitters.push(emitter);
    }

    if (node.mesh !== undefined) {
      var mesh = j.meshes[node.mesh];
      var mname = name || mesh.name || '';
      var mine = interior || INTERIOR_RE.test(mname);
      var isGlass = GLASS_RE.test(mname);
      if (!emitter && EMITTER_RE.test(mname)) {
        emitter = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
        emitters.push(emitter);
      }
      var into = mine ? inr : ext;
      for (var p = 0; p < mesh.primitives.length; p++) {
        var prim = mesh.primitives[p];
        if (prim.mode !== undefined && prim.mode !== 4) continue;   // triangles only
        var pos = accessorData(g, prim.attributes.POSITION);
        var base = into.v.length;
        for (var i = 0; i < pos.length; i++) {
          var w = matApply(world, pos[i]);
          into.v.push(w);
          if (isGlass) {
            sawGlass = true;
            for (var a0 = 0; a0 < 3; a0++) {
              if (w[a0] < glassMin[a0]) glassMin[a0] = w[a0];
              if (w[a0] > glassMax[a0]) glassMax[a0] = w[a0];
            }
          }
          if (emitter) {
            for (var a1 = 0; a1 < 3; a1++) {
              if (w[a1] < emitter.min[a1]) emitter.min[a1] = w[a1];
              if (w[a1] > emitter.max[a1]) emitter.max[a1] = w[a1];
            }
          }
        }
        var col = materialColour(g, prim.material);
        var idx = prim.indices !== undefined
          ? accessorData(g, prim.indices)
          : pos.map(function (_, k) { return k; });
        for (var t = 0; t < idx.length; t += 3) {
          into.f.push([base + idx[t], base + idx[t + 1], base + idx[t + 2]]);
          into.c.push(col);
        }
      }
    }
    for (var ch = 0; ch < (node.children || []).length; ch++) {
      walk(node.children[ch], world, interior, emitter);
    }
  }

  var scene = j.scenes[j.scene || 0];
  for (var r = 0; r < scene.nodes.length; r++) {
    walk(scene.nodes[r], matIdentity(), false, null);
  }

  /* Normalise: centred on the origin, unit length along the LONGEST axis.
   * These assets follow the glTF convention (+Y up, front toward +Z), which
   * is the game's own convention, so no axis shuffle — but if a batch ever
   * arrives sideways, this is the one place to fix it.
   *
   * MEASURED ON THE EXTERIOR, APPLIED TO BOTH. This is the part that has to
   * be right: normalising each bucket against its own bounds would scale a
   * two-metre chair up to the length of the ship and park it at the origin.
   * One transform, derived from the hull, moves everything together and
   * keeps the seat registered to the canopy. It also means the hull's unit
   * length is unchanged from before this split existed, so nothing that was
   * tuned against the old scale moves. */
  var mins = [Infinity, Infinity, Infinity], maxs = [-Infinity, -Infinity, -Infinity];
  for (var i2 = 0; i2 < ext.v.length; i2++) for (var a = 0; a < 3; a++) {
    if (ext.v[i2][a] < mins[a]) mins[a] = ext.v[i2][a];
    if (ext.v[i2][a] > maxs[a]) maxs[a] = ext.v[i2][a];
  }
  var span = [maxs[0] - mins[0], maxs[1] - mins[1], maxs[2] - mins[2]];
  var mid = [(maxs[0] + mins[0]) / 2, (maxs[1] + mins[1]) / 2, (maxs[2] + mins[2]) / 2];
  var scale = 1 / Math.max(span[0], span[1], span[2], 1e-9);

  function place(p) {
    return [
      Math.round((p[0] - mid[0]) * scale * 1000) / 1000,
      Math.round((p[1] - mid[1]) * scale * 1000) / 1000,
      Math.round((p[2] - mid[2]) * scale * 1000) / 1000
    ];
  }
  for (var i3 = 0; i3 < ext.v.length; i3++) ext.v[i3] = place(ext.v[i3]);
  for (var i4 = 0; i4 < inr.v.length; i4++) inr.v[i4] = place(inr.v[i4]);

  /* Palette-compress the colour array: a handful of materials colour
   * hundreds of faces, and writing the hex string per face triples the
   * output size for nothing. */
  function palette(cols) {
    var pal = [], palIdx = {};
    var ci = cols.map(function (col) {
      if (palIdx[col] === undefined) { palIdx[col] = pal.length; pal.push(col); }
      return palIdx[col];
    });
    return { pal: pal, ci: ci };
  }
  var pe = palette(ext.c), pi = palette(inr.c);

  var out = {
    v: ext.v, f: ext.f, pal: pe.pal, ci: pe.ci,
    span: span.map(function (s) { return Math.round(s * scale * 1000) / 1000; })
  };
  if (inr.f.length) {
    out.interior = { v: inr.v, f: inr.f, pal: pi.pal, ci: pi.ci };
  }
  /* The canopy box, in the same normalised frame — where the glass is, and
   * therefore where a seat view looks out of and mounts its panels. */
  if (sawGlass) {
    var gmin = place(glassMin), gmax = place(glassMax);
    /* Rounded like every other coordinate here. An unrounded midpoint
     * writes 0.47050000000000003 into a generated file, which is noise in
     * the diff and bytes in the payload. */
    var r3 = function (x) { return Math.round(x * 1000) / 1000; };
    out.glass = {
      min: gmin, max: gmax,
      mid: [r3((gmin[0] + gmax[0]) / 2), r3((gmin[1] + gmax[1]) / 2),
            r3((gmin[2] + gmax[2]) / 2)]
    };
  }
  /* The muzzles, in the same normalised frame as everything else: the
   * FORWARD FACE of each emitter box, not its centre, because a beam leaves
   * the end of a barrel rather than the middle of one.
   *
   * Sorted left to right across the hull, so hardpoint order is stable
   * between runs and between models — glTF node order is whatever the
   * authoring tool wrote, and letting that decide which gun is hardpoint 0
   * would reshuffle a player's fire groups whenever a model was re-exported. */
  var live = emitters.filter(function (e) { return isFinite(e.min[0]); });
  if (live.length) {
    out.muzzles = live.map(function (e) {
      var c = place([(e.min[0] + e.max[0]) / 2,
                     (e.min[1] + e.max[1]) / 2,
                     e.max[2]]);
      return c;
    }).sort(function (p, q) { return p[0] - q[0] || p[1] - q[1] || p[2] - q[2]; });
  }
  return out;
}

/* ---- PORTS: one port ----------------------------------------------------
 * Deliberately its own function rather than a pile of branches inside
 * convert(). The two share a container format and nothing else: different
 * axes, a different scale reference, different buckets and different
 * anchors, and interleaving them would have made both harder to read than
 * either is alone.
 */
function convertPort(file) {
  var g = parseGlb(fs.readFileSync(file));
  var j = g.json;
  var ext = { v: [], f: [], c: [] };     // the shell
  var inr = { v: [], f: [], c: [] };     // only visible from inside
  var spn = { v: [], f: [], c: [] };     // turns about +z
  var single = {}, multi = {}, extras = [];
  var key;
  for (key in PORT_MULTI) multi[key] = [];

  function box() {
    return { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
  }

  /* Which anchor, if any, this node should JOIN rather than start.
   *
   * Returns a key that several nodes can agree on, or null to mean "this
   * node is its own instance" — which is the answer for everything except
   * berths. A berth's five throat panels all reduce to the berth's own tag,
   * so they accumulate into one box with one orientation.
   *
   * KEYED ON THE PARENT NODE, not on the name, and the difference is not
   * academic. Keying on the text before 'Throat' looked right and was
   * measured wrong: the ring station carries its bays in two mirrored
   * halves, and both halves export panels called `berthSM0ThroatFloor`. A
   * name key merged a berth with the berth on the OPPOSITE SIDE of the
   * station, so the ring reported 3 bays instead of 5 and two of those
   * boxes spanned the whole structure. A box like that would say a hull
   * fits where it would hit the far wall.
   *
   * A node's parent is unique per instance whatever it is called. Using it
   * also keeps the measurement off the group itself, which is what we want:
   * the group holds the jambs, the lintel and the sill as well, and those
   * stand proud of the aperture, so measuring it would report a bay bigger
   * than the hole a ship actually has to fly through. */
  var merged = {};
  function mergeKey(kind, name, parentIdx) {
    if (kind !== 'berths') return null;
    if (!/Throat(?:Floor|Roof|WallL|WallR|Back)$/i.test(name)) return null;
    return 'berth|' + parentIdx;
  }
  function grow(b, p) {
    for (var a = 0; a < 3; a++) {
      if (p[a] < b.min[a]) b.min[a] = p[a];
      if (p[a] > b.max[a]) b.max[a] = p[a];
    }
  }

  /* THE AXIS SWAP, and it lives here and nowhere else.
   *
   * glTF gives +Y up and +Z front. bayGeometry and the ground basis want
   * +Z UP OUT OF THE GROUND — the floor is at a negative z, headroom is
   * measured up in z, berths spread across x and y. Ships never needed this
   * because the renderer's own convention is +y up; ports do because their
   * frame was written from the ground upward.
   *
   * A PROPER ROTATION, not an exchange. The obvious (x, y, z) -> (x, z, y)
   * is a reflection: determinant -1, which mirrors the model and inverts
   * every face winding, so a shed would come out inside-out and lit from
   * the wrong side. Negating the new y makes it a -90 degree rotation about
   * x instead, determinant +1, which is a rotation and changes nothing but
   * the axis names. glTF front (+Z) therefore becomes the bay's -Y. */
  function toGame(p) { return [p[0], -p[2], p[1]]; }

  function walk(nodeIdx, parentMat, inInterior, inSpin, anchors, inOmit, parentIdx) {
    var node = j.nodes[nodeIdx];
    var local = node.matrix ? node.matrix.slice()
                            : matFromTRS(node.translation, node.rotation, node.scale);
    var world = matMul(parentMat, local);
    var name = node.name || '';

    /* Inherited, like every other classification here: a named parent takes
     * its unnamed children with it, which is how a stand leg made of six
     * unnamed pieces goes away as one leg. */
    var omit = inOmit || PORT_OMIT_RE.test(name);
    var interior = inInterior || PORT_INTERIOR_RE.test(name);
    var spin = inSpin || PORT_SPIN_RE.test(name);

    /* glTF `extras` is where three.js's GLTFExporter puts userData, and
     * userData is where STATIONS.md keeps the airlock's gate sequence — the
     * one part of the design that is behaviour rather than geometry. Carried
     * through verbatim: this file has no business interpreting it, and the
     * game layer that drives the doors is the thing that should. */
    if (node.extras && typeof node.extras === 'object') {
      extras.push({ name: name, data: node.extras });
    }

    /* Anchors are inherited the same way geometry classification is: a named
     * parent's unnamed children add to ITS box, so a multi-part berth stays
     * one berth. A named node inside another named node opens its own. */
    var mine = anchors;
    var k;
    for (k in PORT_SINGLE) {
      if (PORT_SINGLE[k].test(name)) {
        if (!single[k]) single[k] = box();
        mine = single[k];
      }
    }
    for (k in PORT_MULTI) {
      if (PORT_MULTI[k].test(name)) {
        /* SEVERAL NODES, ONE ANCHOR. A berth arrives as five separate
         * throat panels (see PORT_MULTI.berths), and taking each as its own
         * instance would report a one-bay cylinder as having five. Panels
         * that share a berth tag share a box: `berthSM0LThroatFloor` and
         * `berthSM0LThroatBack` both reduce to `berthSM0L`.
         *
         * Only the berths merge. Everything else in PORT_MULTI is genuinely
         * one box per node — four door leaves ARE four leaves — so
         * mergeKey returns null for them and the old behaviour stands. */
        var mk = mergeKey(k, name, parentIdx);
        if (mk && merged[mk]) { mine = merged[mk]; continue; }
        var b = box();
        if (mk) merged[mk] = b;
        /* THE NODE'S OWN ORIENTATION, kept alongside its bounds.
         *
         * A bounding box has no direction, and for a berth the direction is
         * the whole question — STATIONS.md's approach-corridor check casts
         * its rays along "the group's local +Z", and a spine station has
         * berths facing opposite ways while a cylinder's face inward. Take
         * only the bounds and every berth comes out pointing the same way,
         * which is worse than useless: it would say a ship can fly into a
         * bay it would actually hit the far wall of.
         *
         * So the transform is carried here and reduced to a unit vector at
         * output. It is the one piece of information this tool was throwing
         * away that the simulation cannot reconstruct. */
        b.mat = world;
        b.node = name;
        multi[k].push(b);
        mine = b;
      }
    }

    if (node.mesh !== undefined && !omit) {
      var mesh = j.meshes[node.mesh];
      var into = interior ? inr : (spin ? spn : ext);
      for (var p = 0; p < mesh.primitives.length; p++) {
        var prim = mesh.primitives[p];
        if (prim.mode !== undefined && prim.mode !== 4) continue;
        var pos = accessorData(g, prim.attributes.POSITION);
        var base = into.v.length;
        for (var i = 0; i < pos.length; i++) {
          var w = toGame(matApply(world, pos[i]));
          into.v.push(w);
          if (mine) grow(mine, w);
        }
        var col = materialColour(g, prim.material);
        var idx = prim.indices !== undefined
          ? accessorData(g, prim.indices)
          : pos.map(function (_, n) { return n; });
        for (var t = 0; t < idx.length; t += 3) {
          into.f.push([base + idx[t], base + idx[t + 1], base + idx[t + 2]]);
          into.c.push(col);
        }
      }
    }
    for (var ch = 0; ch < (node.children || []).length; ch++) {
      walk(node.children[ch], world, interior, spin, mine, omit, nodeIdx);
    }
  }

  var scene = j.scenes[j.scene || 0];
  for (var r = 0; r < scene.nodes.length; r++) {
    walk(scene.nodes[r], matIdentity(), false, false, null, false, -1);
  }

  /* ---- scale, and where the origin is ----------------------------------
   * A surface bay is measured in PAD RADII, which is a gameplay quantity
   * and not a bounding box — so the model declares it with `portPad` and
   * everything else falls out. An orbital station has no pad and normalises
   * to radius 1 off its own bounds, which is what the procedural stations
   * already do. */
  var all = ext.v.concat(inr.v, spn.v);
  var mins = [Infinity, Infinity, Infinity], maxs = [-Infinity, -Infinity, -Infinity];
  for (var i2 = 0; i2 < all.length; i2++) {
    for (var a2 = 0; a2 < 3; a2++) {
      if (all[i2][a2] < mins[a2]) mins[a2] = all[i2][a2];
      if (all[i2][a2] > maxs[a2]) maxs[a2] = all[i2][a2];
    }
  }
  var scale, origin, kind;
  if (single.pad && isFinite(single.pad.min[0])) {
    kind = 'surface';
    var pad = single.pad;
    var halfX = (pad.max[0] - pad.min[0]) / 2;
    scale = 1 / Math.max(halfX, 1e-9);
    /* Centred on the pad in the horizontal, and GROUND LEVEL AT ITS TOP
     * FACE — a pad is a thing you land on, so z = 0 is its surface rather
     * than the middle of the slab. */
    origin = [(pad.min[0] + pad.max[0]) / 2,
              (pad.min[1] + pad.max[1]) / 2,
              pad.max[2]];
  } else {
    kind = 'orbital';
    var span = [maxs[0] - mins[0], maxs[1] - mins[1], maxs[2] - mins[2]];
    scale = 1 / Math.max(span[0] / 2, span[1] / 2, span[2] / 2, 1e-9);
    origin = [(maxs[0] + mins[0]) / 2, (maxs[1] + mins[1]) / 2,
              (maxs[2] + mins[2]) / 2];
  }

  var r3 = function (x) { return Math.round(x * 1000) / 1000; };
  function place(p) {
    return [r3((p[0] - origin[0]) * scale),
            r3((p[1] - origin[1]) * scale),
            r3((p[2] - origin[2]) * scale)];
  }
  [ext, inr, spn].forEach(function (bucket) {
    for (var i = 0; i < bucket.v.length; i++) bucket.v[i] = place(bucket.v[i]);
  });

  function placedBox(b) {
    if (!b || !isFinite(b.min[0])) return null;
    var lo = place(b.min), hi = place(b.max);
    var out = { min: lo, max: hi,
                mid: [r3((lo[0] + hi[0]) / 2), r3((lo[1] + hi[1]) / 2),
                      r3((lo[2] + hi[2]) / 2)] };
    if (b.node) out.node = b.node;
    /* The node's local +Z, in game axes: the direction a ship approaches
     * along. Taken as the DIFFERENCE of two transformed points rather than
     * the matrix's third column, so a node with a negative scale — a
     * mirrored berth, which the ring station's whole upper half is — gives
     * the direction it actually faces rather than the one it would face
     * unmirrored. toGame is a pure rotation, so it is valid on a direction. */
    if (b.mat) {
      var p0 = toGame(matApply(b.mat, [0, 0, 0]));
      var p1 = toGame(matApply(b.mat, [0, 0, 1]));
      var dx = p1[0] - p0[0], dy = p1[1] - p0[1], dz = p1[2] - p0[2];
      var l = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (l > 1e-9) out.normal = [r3(dx / l), r3(dy / l), r3(dz / l)];
    }
    return out;
  }

  function palette(cols) {
    var pal = [], palIdx = {};
    var ci = cols.map(function (col) {
      if (palIdx[col] === undefined) { palIdx[col] = pal.length; pal.push(col); }
      return palIdx[col];
    });
    return { pal: pal, ci: ci };
  }
  var pe = palette(ext.c);
  var out = { kind: kind, v: ext.v, f: ext.f, pal: pe.pal, ci: pe.ci };
  if (inr.f.length) {
    var pi2 = palette(inr.c);
    out.interior = { v: inr.v, f: inr.f, pal: pi2.pal, ci: pi2.ci };
  }
  if (spn.f.length) {
    var ps2 = palette(spn.c);
    out.spin = { v: spn.v, f: spn.f, pal: ps2.pal, ci: ps2.ci };
  }

  /* Berths and docks are SORTED before numbering, left to right then along.
   * glTF node order is whatever the authoring tool happened to write, and
   * letting that decide which berth is berth 0 would move a parked ship
   * every time a model was re-exported — the same reason the muzzles are
   * sorted rather than taken in file order. */
  function sortedBoxes(list) {
    return list.map(placedBox).filter(Boolean).sort(function (p, q) {
      return p.mid[0] - q.mid[0] || p.mid[1] - q.mid[1] || p.mid[2] - q.mid[2];
    });
  }
  var anchors = {};
  for (key in PORT_MULTI) {
    var got = sortedBoxes(multi[key]);
    if (got.length) anchors[key] = got;
  }
  for (key in PORT_SINGLE) {
    var one = placedBox(single[key]);
    if (one) anchors[key] = one;
  }

  /* ---- the numbers the simulation actually reads -----------------------
   * Derived here rather than in the game, so generate.js gets the same
   * shape bayGeometry already hands out and does not have to learn what a
   * bounding box is. Anything the model did not declare is simply absent
   * and the existing constant is used instead. */
  var geom = {};
  if (anchors.floor) geom.floorZ = anchors.floor.max[2];
  if (anchors.ceiling) geom.ceilZ = anchors.ceiling.min[2];
  if (anchors.mouth) {
    geom.mouthR = r3(Math.max(anchors.mouth.max[0] - anchors.mouth.mid[0],
                              anchors.mouth.max[1] - anchors.mouth.mid[1]));
  }
  if (anchors.chamber) {
    geom.chamberX = r3(anchors.chamber.max[0] - anchors.chamber.mid[0]);
    geom.chamberY = r3(anchors.chamber.max[1] - anchors.chamber.mid[1]);
  }
  if (anchors.berths) geom.berths = anchors.berths.length;
  if (Object.keys(geom).length) out.geom = geom;
  if (Object.keys(anchors).length) out.anchors = anchors;

  /* Whatever the design attached as userData, carried through untouched.
   * STATIONS.md keeps the airlock's gate sequence there — which gate is the
   * outer one, that it only cycles when the bay is occupied, that pilot
   * control is withheld until it is fully open — and that is behaviour, not
   * geometry. This file should not have an opinion about it; the game layer
   * that drives the doors should. */
  if (extras.length) out.extras = extras;

  /* ---- and a sanity pass, because these anchors are load-bearing -------
   * A ship's muzzle in the wrong place is a cosmetic bug. A berth outside
   * its own shed parks a ship inside a wall, and a ceiling under its floor
   * gives the camera clamp a negative interval to solve. Warned rather than
   * thrown: a half-finished model should still convert so it can be looked
   * at, and the modeller should be TOLD rather than left to find out by
   * flying into it. */
  out.warnings = [];
  if (kind === 'surface' && !anchors.pad) out.warnings.push('no portPad — scale is a guess');
  if (geom.floorZ !== undefined && geom.ceilZ !== undefined &&
      geom.ceilZ <= geom.floorZ) {
    out.warnings.push('bayCeiling is at or below bayFloor (' +
                      geom.floorZ + ' -> ' + geom.ceilZ + ')');
  }
  if (anchors.berths && geom.chamberX !== undefined) {
    var stray = anchors.berths.filter(function (b) {
      return Math.abs(b.mid[0]) > geom.chamberX + 0.05 ||
             Math.abs(b.mid[1]) > (geom.chamberY || Infinity) + 0.05;
    }).length;
    if (stray) out.warnings.push(stray + ' berth(s) outside bayChamber');
  }
  if (kind === 'surface' && !anchors.berths) {
    out.warnings.push('no berths — ships will fall back to the shared table');
  }
  if (!out.warnings.length) delete out.warnings;
  return out;
}

/* ---- the whole folder --------------------------------------------------- */
var files = fs.readdirSync(srcDir).filter(function (f2) { return /\.glb$/i.test(f2); }).sort();
if (!files.length) { console.error('no .glb files in ' + srcDir); process.exit(1); }

var lib = {};
for (var fi = 0; fi < files.length; fi++) {
  var id = files[fi].replace(/\.glb$/i, '');
  if (PORTS) {
    var pm = convertPort(path.join(srcDir, files[fi]));
    lib[id] = pm;
    var bits = [pm.kind, pm.v.length + ' verts', pm.f.length + ' tris'];
    if (pm.interior) bits.push('interior ' + pm.interior.f.length);
    if (pm.spin) bits.push('spin ' + pm.spin.f.length);
    var an = pm.anchors || {};
    if (an.berths) bits.push(an.berths.length + ' berths');
    if (an.docks) bits.push(an.docks.length + ' docks');
    if (an.signs) bits.push(an.signs.length + ' signs');
    if (pm.geom) {
      bits.push('floorZ ' + (pm.geom.floorZ === undefined ? '-' : pm.geom.floorZ));
      bits.push('mouthR ' + (pm.geom.mouthR === undefined ? '-' : pm.geom.mouthR));
    }
    console.log(id.padEnd(14) + bits.join(', '));
    /* Warnings go out per model and immediately under it, because a wall of
     * models followed by a wall of warnings makes you count lines to find
     * out which one is wrong. */
    (pm.warnings || []).forEach(function (w) { console.log('  ! ' + w); });
    continue;
  }
  var m = convert(path.join(srcDir, files[fi]));
  lib[id] = m;
  console.log(id + ': ' + m.v.length + ' verts, ' + m.f.length + ' tris, ' +
              m.pal.length + ' colours, span ' + m.span.join(' x ') +
              (m.interior ? '   + interior ' + m.interior.f.length + ' tris'
                          : '   NO INTERIOR') +
              (m.glass ? '   glass@' + m.glass.mid.join(',') : '   no glass'));
}
/* Loud, because a model that arrives without an interior is not an error —
 * it is an older export, and the only way to notice is to be told. */
if (!PORTS) {
  var noInterior = Object.keys(lib).filter(function (k) { return !lib[k].interior; });
  if (noInterior.length) {
    console.log('\n' + noInterior.length + ' model(s) have NO cockpit interior:');
    console.log('  ' + noInterior.join(', '));
  }
}

var portHeader = [
  '/* ports.js — GENERATED by tools/glb2hulls.js --ports. Do not edit by hand.',
  ' *',
  ' * Port models imported from .glb files, keyed by ROLE (the source',
  ' * filename): orbital, highport, refinery, shipyard, agri, mining,',
  ' * reprocessing, surface, bay, underground.',
  ' *',
  ' * Coordinates are +z UP OUT OF THE GROUND, not +y up — a port frame is',
  ' * written from the ground upward, which is what bayGeometry and the',
  ' * ground basis already assume. A surface port is measured in PAD RADII',
  ' * with its origin on the pad surface; an orbital station is normalised',
  ' * to radius 1 about its centre. See ref/PORT-MODELS.md.',
  ' *',
  ' * `anchors` are load-bearing, not decoration: the berths park ships and',
  ' * the chamber and floor clamp the camera. `geom` is the same shape',
  ' * Gen.bayGeometry hands out, so a modelled bay overrides the shared',
  ' * constant table field by field and anything absent falls back to it.',
  ' *',
  ' * This file is OPTIONAL. The game runs without it and every role falls',
  ' * back to its procedural mesh.',
  ' */',
  '(function (global) {',
  "  'use strict';",
  '  global.PortLib = '
].join('\n');

var header = [
  '/* hulls.js — GENERATED by tools/glb2hulls.js. Do not edit by hand.',
  ' *',
  ' * Ship models imported from .glb files, one entry per model, keyed by ID',
  ' * (the source filename). Vertices are unit-length, origin-centred, +z',
  ' * forward, +y up; colours are a per-model palette indexed per face, with',
  ' * the emissive-marker convention render.js already uses (a leading ! means',
  ' * full-bright). render.js decompresses these into its own mesh format at',
  ' * load. To add models: drop .glb files in a folder and re-run the tool.',
  ' */',
  '(function (global) {',
  "  'use strict';",
  '  global.HullLib = '
].join('\n');

var libName = PORTS ? 'PortLib' : 'HullLib';
fs.writeFileSync(outFile,
  (PORTS ? portHeader : header) + JSON.stringify(lib) + ';\n' +
  "  if (typeof module !== 'undefined' && module.exports) module.exports = global." +
  libName + ';\n' +
  "})(typeof window !== 'undefined' ? window : globalThis);\n");
console.log('\nwrote ' + outFile + ' (' + Math.round(fs.statSync(outFile).size / 1024) + ' KB, ' +
            files.length + (PORTS ? ' ports)' : ' models)'));
if (PORTS) {
  var warned = Object.keys(lib).filter(function (k) { return lib[k].warnings; });
  if (warned.length) {
    console.log(warned.length + ' port(s) converted WITH WARNINGS: ' + warned.join(', '));
  }
  console.log('add <script src="src/ports.js"></script> to index.html before render.js');
}
