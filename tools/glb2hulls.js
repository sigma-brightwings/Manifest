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
/* One `engineGlow` node per engine: the model says how many engines it has,
 * and the renderer draws one plume per glow. */
var ENGINE_RE = /^engineGlow/i;

/* ---- the parts that MOVE ------------------------------------------------
 * Every hull is rigged for landing gear — `gearNose`, `gearRearLeft`,
 * `gearRearRight`, each carrying a static `gearBayPlate` with its caution
 * stripes, a `gearDoorHinge` over a `gearBayDoor`, and a `gearStrutHinge`
 * over a `gearStrut`, `gearBrace` and `gearFoot`. There are no animation
 * clips in the files: `animations: 0` in every one. The hinges are real
 * nodes, so the geometry supports actuation, but the motion was never
 * authored.
 *
 * AND THE MODELS WERE SAVED GEAR-DOWN. Baking every node transform into the
 * vertices therefore did not just lose the ability to animate — it welded
 * three legs to the belly of every ship in the game, permanently extended,
 * in flight, in combat, in slipspace. That was the actual bug behind
 * "Shift+G does nothing": the state was flipping correctly the whole time
 * and there was nothing on screen that could ever have shown it.
 *
 * So a node whose name ends in `Hinge` opens its own bucket instead of
 * writing into the hull, and comes out as a separate small mesh carrying
 * the pivot and axis it turns about. The static half of the leg — plate and
 * stripes — stays in the hull, because a bay is a hole in the ship whether
 * or not anything is hanging out of it. */
var HINGE_RE = /Hinge$/i;

/* Which leg a part belongs to, and which of the two hinges it is: both are
 * read off the node names rather than positions, so a model that adds a
 * fourth leg or a second door needs no change here. */
var LEG_RE = /^gear(Nose|RearLeft|RearRight|[A-Za-z]*)$/i;

function vNorm(v) {
  var L = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / L, v[1] / L, v[2] / L];
}
function vCross(a, b) {
  return [a[1] * b[2] - a[2] * b[1],
          a[2] * b[0] - a[0] * b[2],
          a[0] * b[1] - a[1] * b[0]];
}
function vDot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }

/* Rotate `p` about a unit `axis` through the origin, by `ang`. Rodrigues,
 * written out rather than pulled in, because this file has no dependencies
 * and one formula is cheaper than a vector library. */
function rotAbout(p, axis, ang) {
  var c = Math.cos(ang), s = Math.sin(ang);
  var d = vDot(axis, p);
  var cr = vCross(axis, p);
  return [p[0] * c + cr[0] * s + axis[0] * d * (1 - c),
          p[1] * c + cr[1] * s + axis[1] * d * (1 - c),
          p[2] * c + cr[2] * s + axis[2] * d * (1 - c)];
}

/* ---- WHICH WAY A HINGE TURNS, derived rather than guessed ---------------
 * A hinge node's matrix gives three candidate axes and nothing says which
 * one is the pin. Geometry alone cannot settle it either: a strut is a rod,
 * so it straddles BOTH axes perpendicular to its length and the two score
 * identically.
 *
 * What does settle it is that these legs are CANTED. Every one of them
 * leans out of vertical in a single plane — the nose fore-and-aft, the
 * rears left-and-right — and a hinge pin is perpendicular to the plane its
 * part swings in. So: take the direction the part extends away from its
 * pivot, drop its vertical component to get the lean, and the pin is the
 * cross product of hull-up with that lean. On the courier this returns the
 * lateral axis for all three doors and the nose strut, and the fore-aft
 * axis for the two rear struts, which is exactly the rig the artist drew.
 *
 * A part with no lean at all — a perfectly vertical strut — has no plane to
 * derive, and falls back to the hinge node's own local axis that the
 * geometry is most nearly centred on. */
var HULL_UP = [0, 1, 0];

function hingeAxis(extendDir, localAxes, spans, centres) {
  var lean = [extendDir[0], 0, extendDir[2]];
  if (Math.hypot(lean[0], lean[2]) > 1e-3) {
    return vNorm(vCross(HULL_UP, vNorm(lean)));
  }
  var best = 0, bestScore = Infinity;
  for (var a = 0; a < 3; a++) {
    var score = Math.abs(centres[a]) / (spans[a] / 2 + 1e-9) - spans[a];
    if (score < bestScore) { bestScore = score; best = a; }
  }
  return vNorm(localAxes[best]);
}

/* How far to turn it to stow it, and which way round.
 *
 * The authored pose is the DEPLOYED pose — that is what "saved gear-down"
 * means — so travel runs from the model as drawn to the model tucked away,
 * and stowed is the part lying flat against the hull.
 *
 * FLATNESS ALONE DOES NOT PICK A DIRECTION, and getting this wrong is
 * visible immediately: there are always TWO rotations that lay a leg flat,
 * one folding it into the bay and one swinging it up over the spine, and
 * they score identically on "how vertical is it". The first version scanned
 * for minimum verticality, found the two tied, kept whichever it reached
 * first, and put the nose leg through the roof of the ship.
 *
 * What breaks the tie is that a bay is INBOARD of the leg that lives in it.
 * A leg retracts toward the middle of the hull, never away from it — so of
 * the two flat poses, take the one whose foot ends up nearer the ship's
 * axis. `outward` is the pivot's own horizontal offset from the hull
 * centre, which is exactly the direction the leg must not fold toward.
 *
 * Both terms in one score, flatness weighted an order of magnitude above
 * inboardness so it decides the angle and inboardness only decides the
 * sign. A centreline pivot with no horizontal offset has no preference to
 * express and falls back to folding aft, which is the convention and, more
 * to the point, is deterministic. */
var STOW_AFT = [0, 0, -1];

function stowAngle(extendDir, axis, pivot) {
  var outward = [pivot[0], 0, pivot[2]];
  outward = Math.hypot(outward[0], outward[2]) > 1e-4
    ? vNorm(outward) : STOW_AFT.slice();

  var e0 = vNorm(extendDir);
  var best = 0;
  var bestScore = Math.abs(vDot(e0, HULL_UP)) * 10 + vDot(e0, outward);
  for (var deg = 1; deg <= 180; deg++) {
    for (var s = -1; s <= 1; s += 2) {
      var ang = s * deg * Math.PI / 180;
      var r = vNorm(rotAbout(e0, axis, ang));
      var score = Math.abs(vDot(r, HULL_UP)) * 10 + vDot(r, outward);
      if (score < bestScore - 1e-9) { bestScore = score; best = ang; }
    }
  }
  return best;
}

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
  /* `leafGroup_…` is the newer station builder's own name for ONE LEAF:
   * a group holding the lap door and its chevrons, with the leaf's travel
   * in its extras (`doorLeaf`). It is the whole moving part, so it is the
   * gate, and nothing inside it may open a second one — see `inGate` in
   * walk. Without this the 2026-09-21 exports (cylinder, spine, hydrogen
   * refinery) converted with no doors at all on their lap-door berths:
   * `LapDoorL` matches none of the older names. */
  /* `…HatchLeafL0` is the ring's heavy-bay finger hatch and `…LeafL` the
   * spine's toothed slider (24-09): outer doors both, and without them those
   * bays had no way in at all. A yard garage (`berthLY…`) is a ROLL-UP
   * door, so its gates are the slats themselves — its `LeafL` is the
   * slats' guides, rails and motor, which do not move. */
  gates: /^leafGroup_|SlidingDoor[LR]\d|BlastDoor[LR]|ForceField|^berth(?!LY)(?!\w*Inner)\w*?(Hatch)?Leaf[LR]\d*$|^berthLY\d+Leaf[LR]Slat\d+$/i,
  innerGates: /InnerGate/i,
  /* Where a stowed leaf lives. STATIONS.md asserts >=90% of each leaf sits
   * inside its house, which is what makes an open door invisible rather
   * than proud of the hull. */
  pockets: /Door(Pocket|House)|Blast(Pocket|House)|Lap(Pocket|House)/i,
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

/* REFERENCE VOLUMES: measured, never painted.
 *
 * A bay's `…Throat` is a solid block spanning the whole aperture. The lab
 * builds it deliberately — STATIONS.md measures hull fit and the approach
 * corridor against its dimensions — and hides it, because a visible one is
 * a dark slab where the corridor should be.
 *
 * Hiding it used to mean losing it: GLTFExporter skips invisible nodes by
 * default, so it never reached the file and every station converted with no
 * bay dimensions. The exporter now emits it (see three-d-stage.js) and this
 * is the other half of that bargain — the volume arrives, is measured, and
 * is kept out of the drawn mesh here, where deciding what to paint belongs.
 *
 * Separate from PORT_OMIT_RE because the two mean opposite things. A stand
 * leg is dropped entirely: it is furniture that does not belong in orbit,
 * and nothing wants its bounds. This is dropped from the PICTURE only. */
var PORT_REFERENCE_RE = /Throat$/i;

/* A bay declared by its own group node: berthL…, berthLY…, berthSM… with
 * nothing after the qualifier, so `berthLAlphaHatch` (a door inside the
 * heavy bay) is not mistaken for a second bay.
 *
 * `berthSMs0` (24-09 evening cylinders): an SM bay drawn for a SMALL hull
 * only — its extras say `hullClass: 'S'`, beside `berthSM1` with 'M'. The
 * lower-case size letter is part of the bay's name, not a qualifier word,
 * and without it here half of every new cylinder's small bays vanished
 * from the index (cylinder-m converted with 2 SM berths of the 4 it
 * declares). */
var BERTH_GROUP_RE = /^berth(?:L|SM)[sml]?(?:Y|[A-Z][a-z]+)?\d*$/;
/* Geometry that opens, left out of the grid the interior routes are found
 * in. Leaves, slats, teeth, gates, fields, hatches and seals. */
/* Carriers, keyed by stem: `liftGuide0` and `liftRackBrace3` are both the
 * lift, `shaftWallL` the shaft, `dockLift1Guide2` dock lift 1. */
var CARRIER_RE = /^(transferLift|transferMain|transferLock|transferDeck|dockLift\d+|hangarLift\d+|spokeTransfer\d+|ringLift|ringHoist|ringFeed|cargoHoist|sortHoist\d*|hoist|shaft|lift|incline|ramp)/i;
var OPENABLE_RE = /(?:SlidingDoor|BlastDoor|Leaf|Slat|Tooth|InnerGate|ForceField|Hatch|InnerSeal)[LR]?\d*$|^leafGroup_|Lift(?:Car|Platform)\d*$|^hoistCar|^liftPlatform|ThroatBack$/i;

/* ---- the way through a station, from a heavy bay to a small one ---------
 * Astra, 2026-09-24: "make sure that when we land at the station, the ship
 * is able to path all the way through to the S or M bay from the L bay
 * entrances on the new designs."
 *
 * The new designs are built that way: the heavy bay's doors are the big
 * hole in the hull, and behind them a hall, a transfer lock, a hoist or a
 * lift carries a small hull on to its own bay — some of which (the
 * refinery's curtained chambers, the ring's inner bays) have no door onto
 * space at all. So for every S/M berth this finds a route from an L berth
 * through the inside of the model, WITH THE DOORS OPEN, and stores it on
 * the berth as `entry` (which L berth, by sorted index) and `via` (the
 * corners between the two stands, in the model's normalised frame).
 *
 * Found here, once, rather than in the game: it is a property of the art,
 * the same for every port that wears the model, and it is a few seconds of
 * voxel search per model that nobody should pay at a docking clamp.
 *
 * The grid is two views of one model. OPEN leaves out everything that
 * opens (OPENABLE_RE) and is what a route may pass through; CLOSED keeps it
 * and says what is inside the hull at all, so a route cannot leave through
 * one door and come back in through another. Cost rises near walls, so a
 * route keeps to the middle of a passage rather than scraping it. */
var ROUTE_N = +process.env.ROUTE_N || 128;
var ROUTE_SPAN = 1.06;               // the normalised model fits in +-1

function interiorRoutes(buckets, berths, carried, doors) {
  var N = ROUTE_N, lo = -ROUTE_SPAN, cell = 2 * ROUTE_SPAN / N, inv = 1 / cell;
  var NN = N * N, NNN = N * N * N;
  var open = new Uint8Array(NNN), closed = new Uint8Array(NNN);
  function idx(x, y, z) { return (z * N + y) * N + x; }
  function rast(v, f, o) {
    for (var fi = 0; fi < f.length; fi++) {
      var a = v[f[fi][0]], b = v[f[fi][1]], c = v[f[fi][2]];
      if (!a || !b || !c) continue;
      var e = 0;
      for (var k = 0; k < 3; k++) {
        e = Math.max(e, Math.abs(b[k] - a[k]), Math.abs(c[k] - a[k]), Math.abs(c[k] - b[k]));
      }
      /* Enough samples to leave no hole at THIS grid: a capped count that
       * was enough at 128 leaves pinholes at 256, the outside floods in
       * through them, and bays that were inside the hull become space. */
      var n = Math.min(Math.ceil(160 * N / 128) * 2, Math.max(1, Math.ceil(e * inv * 2)));
      for (var i = 0; i <= n; i++) {
        for (var jj = 0; i + jj <= n; jj++) {
          var u = i / n, w = jj / n;
          var gx = Math.floor((a[0] + (b[0] - a[0]) * u + (c[0] - a[0]) * w - lo) * inv);
          var gy = Math.floor((a[1] + (b[1] - a[1]) * u + (c[1] - a[1]) * w - lo) * inv);
          var gz = Math.floor((a[2] + (b[2] - a[2]) * u + (c[2] - a[2]) * w - lo) * inv);
          if (gx < 0 || gy < 0 || gz < 0 || gx >= N || gy >= N || gz >= N) continue;
          var q = idx(gx, gy, gz);
          closed[q] = 1;
          if (!o[fi]) open[q] = 1;
        }
      }
    }
  }
  buckets.forEach(function (bk) { rast(bk.v, bk.f, bk.o || []); });

  /* Outside, with the doors shut: flood from the border. */
  var out = new Uint8Array(NNN), stack = new Int32Array(NNN), top = 0;
  function seed(q) { if (!closed[q] && !out[q]) { out[q] = 1; stack[top++] = q; } }
  for (var s0 = 0; s0 < N; s0++) {
    for (var s1 = 0; s1 < N; s1++) {
      seed(idx(s0, s1, 0)); seed(idx(s0, s1, N - 1)); seed(idx(s0, 0, s1));
      seed(idx(s0, N - 1, s1)); seed(idx(0, s0, s1)); seed(idx(N - 1, s0, s1));
    }
  }
  while (top) {
    var q0 = stack[--top], z0 = (q0 / NN) | 0, r0 = q0 - z0 * NN, y0 = (r0 / N) | 0, x0 = r0 - y0 * N;
    if (x0 > 0) seed(q0 - 1); if (x0 < N - 1) seed(q0 + 1);
    if (y0 > 0) seed(q0 - N); if (y0 < N - 1) seed(q0 + N);
    if (z0 > 0) seed(q0 - NN); if (z0 < N - 1) seed(q0 + NN);
  }

  /* Clearance: steps to the nearest open-grid wall, capped at 4. */
  var dist = new Uint8Array(NNN).fill(4);
  var qd = new Int32Array(NNN), qh = 0, qt = 0;
  for (var w0 = 0; w0 < NNN; w0++) if (open[w0]) { dist[w0] = 0; qd[qt++] = w0; }
  while (qh < qt) {
    var p = qd[qh++], d1 = dist[p] + 1;
    if (d1 >= 4) continue;
    var pz = (p / NN) | 0, pr = p - pz * NN, py = (pr / N) | 0, px = pr - py * N;
    var nb = [px > 0 ? p - 1 : -1, px < N - 1 ? p + 1 : -1, py > 0 ? p - N : -1,
              py < N - 1 ? p + N : -1, pz > 0 ? p - NN : -1, pz < N - 1 ? p + NN : -1];
    for (var ni = 0; ni < 6; ni++) {
      var nq = nb[ni];
      if (nq >= 0 && dist[nq] > d1) { dist[nq] = d1; qd[qt++] = nq; }
    }
  }
  /* Carriers: the cargo elevators, lift shafts and transfer decks that move
   * an S or M hull from the L bay's deck to its own. The route may cross
   * their volume wherever it lies inside the hull, deck plating and all —
   * the car carries the ship through it — and it costs no more than open
   * passage, so a route takes the lift rather than squeezing round it. */
  var carry = new Uint8Array(NNN);
  (carried || []).forEach(function (c) {
    var a = cellOf(c.min), b = cellOf(c.max);
    for (var z = Math.max(0, Math.min(a[2], b[2]) - 1); z <= Math.min(N - 1, Math.max(a[2], b[2]) + 1); z++)
      for (var y = Math.max(0, Math.min(a[1], b[1]) - 1); y <= Math.min(N - 1, Math.max(a[1], b[1]) + 1); y++)
        for (var x = Math.max(0, Math.min(a[0], b[0]) - 1); x <= Math.min(N - 1, Math.max(a[0], b[0]) + 1); x++) {
          var cq = idx(x, y, z);
          if (!out[cq]) { carry[cq] = 1; if (dist[cq] < 2) dist[cq] = 2; }
        }
  });
  function passable(q) { return (!open[q] || carry[q]) && !out[q]; }
  function cellOf(pt) {
    return [Math.floor((pt[0] - lo) * inv), Math.floor((pt[1] - lo) * inv), Math.floor((pt[2] - lo) * inv)];
  }
  function nearestPassable(pt) {
    var c = cellOf(pt), best = -1, bd = Infinity;
    /* Eight cells at the 128 grid, the same DISTANCE at any other. */
    var rMax = Math.ceil(8 * N / 128);
    for (var r = 0; r <= rMax && best < 0; r++) {
      for (var dz = -r; dz <= r; dz++) for (var dy = -r; dy <= r; dy++) for (var dx = -r; dx <= r; dx++) {
        var x = c[0] + dx, y = c[1] + dy, z = c[2] + dz;
        if (x < 0 || y < 0 || z < 0 || x >= N || y >= N || z >= N) continue;
        var q = idx(x, y, z);
        if (!passable(q)) continue;
        var dd = dx * dx + dy * dy + dz * dz;
        if (dd < bd) { bd = dd; best = q; }
      }
    }
    return best;
  }

  /* A*, 26-connected, octile distance, a binary heap on typed arrays. */
  var g = new Float32Array(NNN), from = new Int32Array(NNN), shut = new Uint8Array(NNN);
  var heapI = new Int32Array(NNN * 2), heapF = new Float32Array(NNN * 2);
  var OFF = [];
  for (var oz = -1; oz <= 1; oz++) for (var oy = -1; oy <= 1; oy++) for (var ox = -1; ox <= 1; ox++) {
    if (ox || oy || oz) OFF.push([ox, oy, oz, Math.sqrt(ox * ox + oy * oy + oz * oz)]);
  }
  function astar(sq, gq) {
    g.fill(Infinity); shut.fill(0);
    var hn = 0;
    function h(q) {
      var z = (q / NN) | 0, r = q - z * NN, y = (r / N) | 0, x = r - y * N;
      var gz = (gq / NN) | 0, gr = gq - gz * NN, gy = (gr / N) | 0, gx = gr - gy * N;
      var a = [Math.abs(x - gx), Math.abs(y - gy), Math.abs(z - gz)].sort(function (m, n) { return m - n; });
      return a[2] + 0.41 * a[1] + 0.32 * a[0];
    }
    function push(q, f) {
      var i = hn++;
      heapI[i] = q; heapF[i] = f;
      while (i > 0) {
        var pa = (i - 1) >> 1;
        if (heapF[pa] <= heapF[i]) break;
        var ti = heapI[pa], tf = heapF[pa];
        heapI[pa] = heapI[i]; heapF[pa] = heapF[i]; heapI[i] = ti; heapF[i] = tf; i = pa;
      }
    }
    function pop() {
      var q = heapI[0];
      hn--;
      heapI[0] = heapI[hn]; heapF[0] = heapF[hn];
      var i = 0;
      for (;;) {
        var l = 2 * i + 1, rr = l + 1, m = i;
        if (l < hn && heapF[l] < heapF[m]) m = l;
        if (rr < hn && heapF[rr] < heapF[m]) m = rr;
        if (m === i) break;
        var ti = heapI[m], tf = heapF[m];
        heapI[m] = heapI[i]; heapF[m] = heapF[i]; heapI[i] = ti; heapF[i] = tf; i = m;
      }
      return q;
    }
    g[sq] = 0; from[sq] = -1; push(sq, h(sq));
    var steps = 0;
    while (hn > 0 && steps++ < Math.max(3000000, NNN)) {
      var q = pop();
      if (shut[q]) continue;
      if (q === gq) break;
      shut[q] = 1;
      var z = (q / NN) | 0, r = q - z * NN, y = (r / N) | 0, x = r - y * N;
      for (var k = 0; k < OFF.length; k++) {
        var nx = x + OFF[k][0], ny = y + OFF[k][1], nz = z + OFF[k][2];
        if (nx < 0 || ny < 0 || nz < 0 || nx >= N || ny >= N || nz >= N) continue;
        var nq = idx(nx, ny, nz);
        if (shut[nq] || !passable(nq)) continue;
        var cost = OFF[k][3] * (1 + 3 / (dist[nq] || 0.5));
        var ng = g[q] + cost;
        if (ng < g[nq]) { g[nq] = ng; from[nq] = q; push(nq, ng + h(nq)); }
      }
    }
    if (!isFinite(g[gq])) return null;
    var path = [];
    for (var c = gq; c >= 0; c = from[c]) path.push(c);
    return { cost: g[gq], cells: path.reverse() };
  }
  function centre(q) {
    var z = (q / NN) | 0, r = q - z * NN, y = (r / N) | 0, x = r - y * N;
    return [lo + (x + 0.5) * cell, lo + (y + 0.5) * cell, lo + (z + 0.5) * cell];
  }
  function sight(a, b) {
    var L = Math.sqrt((b[0] - a[0]) * (b[0] - a[0]) + (b[1] - a[1]) * (b[1] - a[1]) + (b[2] - a[2]) * (b[2] - a[2]));
    var n = Math.max(2, Math.ceil(L * inv * 3));
    for (var i = 0; i <= n; i++) {
      var t = i / n, c = cellOf([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
      if (c[0] < 0 || c[1] < 0 || c[2] < 0 || c[0] >= N || c[1] >= N || c[2] >= N) return false;
      var q = idx(c[0], c[1], c[2]);
      if (!passable(q) || dist[q] < 1) return false;
    }
    return true;
  }
  function pull(cells) {
    var pts = cells.map(centre), outp = [pts[0]], i = 0;
    while (i < pts.length - 1) {
      var j2 = pts.length - 1;
      while (j2 > i + 1 && !sight(pts[i], pts[j2])) j2--;
      outp.push(pts[j2]); i = j2;
    }
    return outp;
  }

  var heavy = [], small = [];
  var found = 0, bridged = 0, reachL = null, distL = null, srcL = null, reachCache = {};
  var r3 = function (x) { return Math.round(x * 1000) / 1000; };
  var r3p = function (p) { return [r3(p[0]), r3(p[1]), r3(p[2])]; };

  /* GROUND SITES (2026-09-24). Astra: the ground ports' "bays live
   * underground", and the way down to them is the site's own: the surface
   * pad door and its 45-degree cargo lift for S and M hulls, the hangar
   * door for the heavy ones, a portal in a mountain face or at the foot of
   * a runway ramp. So every berth of a model that declares entrances gets
   * a route in from one of them — `door`, the entrance's index, and
   * `doorVia`, the corners — found the same way as the heavy-bay routes
   * below, elevator fallback included. */
  if (doors && doors.length) {
    doors.forEach(function (d) {
      /* The door's normal: its thinnest axis, pointing to whichever side
       * of it is outside. */
      var sz = [d.max[0] - d.min[0], d.max[1] - d.min[1], d.max[2] - d.min[2]];
      var ax = sz.indexOf(Math.min(sz[0], sz[1], sz[2]));
      var pick1 = null;
      [1, -1].forEach(function (sg) {
        var hits = 0;
        for (var st = 2; st <= 16; st += 2) {
          var p = d.mid.slice(); p[ax] += sg * st * cell;
          var c = cellOf(p);
          if (c[0] < 0 || c[1] < 0 || c[2] < 0 || c[0] >= N || c[1] >= N || c[2] >= N) { hits++; continue; }
          if (out[idx(c[0], c[1], c[2])]) hits++;
        }
        if (!pick1 || hits > pick1.hits) pick1 = { sg: sg, hits: hits };
      });
      d.normal = [0, 0, 0]; d.normal[ax] = pick1.sg;
    });
    var liftDoor = /pad|surface/i, heavyDoor = /hangar|portal/i;
    var doorFound = 0, doorLift = 0;
    berths.forEach(function (b) {
      var gq = nearestPassable(b.mid);
      if (gq < 0) return;
      var want = b.cls === 'L' ? heavyDoor : liftDoor;
      var order = doors.map(function (_, i) { return i; }).sort(function (i, j) {
        var pi = want.test(doors[i].node) ? 0 : 1, pj = want.test(doors[j].node) ? 0 : 1;
        if (pi !== pj) return pi - pj;
        var di = Math.hypot(doors[i].mid[0] - b.mid[0], doors[i].mid[1] - b.mid[1], doors[i].mid[2] - b.mid[2]);
        var dj = Math.hypot(doors[j].mid[0] - b.mid[0], doors[j].mid[1] - b.mid[1], doors[j].mid[2] - b.mid[2]);
        return di - dj;
      });
      for (var oi = 0; oi < order.length; oi++) {
        var d = doors[order[oi]];
        var inside = [d.mid[0] - d.normal[0] * 2 * cell, d.mid[1] - d.normal[1] * 2 * cell, d.mid[2] - d.normal[2] * 2 * cell];
        var sq = nearestPassable(inside);
        if (sq < 0) continue;
        var got = astar(sq, gq), pts = null, lifted = false;
        if (got) pts = pull(got.cells);
        else {
          var br = bridgeFrom('door' + order[oi], [sq], gq);
          if (!br) continue;
          var a1 = astar(sq, br.a), t1 = astar(br.b, gq);
          if (!a1 || !t1) continue;
          pts = pull(a1.cells).concat(pull(t1.cells));
          lifted = br;
        }
        b.door = order[oi];
        b.doorVia = pts.slice(1, -1).map(r3p);
        if (lifted) { b.doorLift = 1; b.shaft = shaftSpec(lifted); doorLift++; }
        doorFound++;
        break;
      }
    });
    console.log('    ground entrances: ' + doors.map(function (d) { return d.node; }).join(', ') +
                ' - ' + doorFound + ' of ' + berths.length + ' berth(s) routed in' +
                (doorLift ? ' (' + doorLift + ' by elevator across unconnected decks)' : ''));
  }

  /* AN INNER HEAVY BAY (24-09 evening cylinders): `berthLArm` is an L bay
   * down the arm with a curtain and no door onto space — its extras name
   * `exitVia: 'berthLFwd'`, and its dockPath runs in through the forward
   * bay and along the hub. It is a destination, like a small bay, and never
   * an entry: routed from the heavy bays like S/M, and not offered as a way
   * in. Without this the arrival had no door to fly it through and
   * berths.test reported "no way in" for the arm bay of every cylinder. */
  /* Keyed by the bay's own name: a berth measured off its throat panels
   * carries the panel's node (`berthLFwdThroatFloor`), and `exitVia` names
   * the bay (`berthLFwd`). */
  var byNode = {};
  berths.forEach(function (b) {
    if (b.node) byNode[String(b.node).replace(/Throat(Floor|Roof|WallL|WallR|Back)?$/, '')] = b;
  });
  berths.forEach(function (b, k) {
    var via = b.exitVia && byNode[b.exitVia];
    var inner = b.cls === 'L' && via && via !== b && via.cls === 'L';
    if (inner) small.push(k);
    else if (b.cls === 'L') heavy.push(k);
    else if (b.cls === 'SM') small.push(k);
  });
  if (!heavy.length || !small.length) return 0;
  var declared = 0;
  /* A clear passage first. Then, for a CARRIAGE bay, the art's own route
   * before the elevator bridge — the bridge is a straight line through
   * whatever is in the way, and on the civil yard it had been "routing"
   * half the carriage bays through the hall walls while the art said
   * exactly how the carriage runs. Every other bay keeps the old order
   * (bridge, then the declared route as a last resort), so the stations
   * converted this morning route exactly as they did — the shaft report
   * is keyed on those bridges. */
  small.forEach(function (k) {
    if (routeVoxel(k, false)) { found++; return; }
    if (berths[k].carriage && routeDeclared(k)) { found++; declared++; return; }
    if (routeVoxel(k, true)) { found++; return; }
    if (routeDeclared(k)) { found++; declared++; }
  });
  if (bridged) console.log('    ' + bridged + ' S/M route(s) joined by elevator across unconnected decks');
  if (declared) console.log('    ' + declared + ' route(s) taken from the art\'s own dockPath (carriage or unreachable deck)');
  berths.forEach(function (b) { delete b.declared; delete b.carriage; });
  return found;

  /* THE ART'S OWN ROUTE, where the voxels cannot find one (24-09 evening:
   * the civil yard's "carriage halls"). Each S/M bay there rides a carriage
   * — a floor that moves — on a track down to a hall reached through a
   * heavy bay, and the builder writes the way out into the bay's extras:
   * `dockPath`, from the carriage's end of the track out through its
   * `exitVia` bay's mouth. A voxel search over a static model cannot ride a
   * moving floor, so half the yard's bays had no way in at all.
   *
   * Taken backwards it is the way IN: from the heavy bay's stand, the
   * declared corners that lie inboard of that stand (the ones outboard are
   * the run in from space, which the heavy bay's own approach already
   * flies), ending at the foot of the carriage, then up the carriage to
   * this bay's stand. Only where the art names a real heavy bay to come in
   * through. */
  function routeDeclared(k) {
    var b = berths[k];
    if (!b.declared || !b.declared.length) return false;
    var h = b.exitVia && byNode[b.exitVia];
    var hi = h ? berths.indexOf(h) : -1;
    if (hi < 0 || heavy.indexOf(hi) < 0) return false;
    var n = h.normal, m = h.mid;
    var pts = b.declared.slice().reverse().filter(function (p) {
      if (!n) return true;
      return (p[0] - m[0]) * n[0] + (p[1] - m[1]) * n[1] + (p[2] - m[2]) * n[2] <= 0;
    });
    /* NOT the carriage's `raised` point. Measured on yard-m it lies on the
     * straight run between dockPath[1] and dockPath[0], so appending it
     * after dockPath[0] sent the hull back down the track before the
     * climb. dockPath[0] is the foot of the carriage's diagonal and the
     * leg from it to the stand IS the carriage ride; `carriage` is kept
     * only as the mark that this bay has one. */
    if (!pts.length) return false;
    b.entry = hi;
    b.via = pts.map(function (p) { return [r3(p[0]), r3(p[1]), r3(p[2])]; });
    if (b.carriage) b.carriageRide = 1;
    return true;
  }

  function routeVoxel(k, allowBridge) {
    var gq = nearestPassable(berths[k].mid);
    if (gq < 0) return false;
    var best = null;
    heavy.forEach(function (h0) {
      var sq = nearestPassable(berths[h0].mid);
      if (sq < 0) return;
      var got = astar(sq, gq);
      if (got && (!best || got.cost < best.cost)) best = { cost: got.cost, cells: got.cells, from: h0 };
    });
    if (!best && process.env.ROUTE_DEBUG) {
      /* Why not: flood from the first heavy bay and see what it reaches. */
      var sq0 = nearestPassable(berths[heavy[0]].mid), seen = new Uint8Array(NNN), st2 = [sq0], cnt = 0, hit = false, nearest = Infinity;
      var gc = centre(gq);
      if (sq0 >= 0) seen[sq0] = 1;
      while (st2.length && sq0 >= 0) {
        var c0 = st2.pop(); cnt++;
        if (c0 === gq) hit = true;
        var cc = centre(c0), dd0 = Math.hypot(cc[0] - gc[0], cc[1] - gc[1], cc[2] - gc[2]);
        if (dd0 < nearest) nearest = dd0;
        var cz = (c0 / NN) | 0, cr = c0 - cz * NN, cy = (cr / N) | 0, cx = cr - cy * N;
        [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]].forEach(function (o3) {
          var x = cx + o3[0], y = cy + o3[1], z = cz + o3[2];
          if (x < 0 || y < 0 || z < 0 || x >= N || y >= N || z >= N) return;
          var q3 = idx(x, y, z);
          if (!seen[q3] && passable(q3)) { seen[q3] = 1; st2.push(q3); }
        });
      }
      console.log('    route debug ' + berths[k].node + ': from ' + berths[heavy[0]].node + ' reaches ' + cnt +
                  ' cells, closest ' + nearest.toFixed(3) + ' radii to the bay; goal out=' + out[gq]);
    }
    var pts;
    if (best) pts = pull(best.cells);
    else if (!allowBridge) return false;
    else {
      /* THE ELEVATOR, where the art has the idea but not the connection: the
       * heavy bay's passages and this bay's passages both exist, but no
       * open voxel joins them — the car is parked on one deck and its shaft
       * is walled at the other, or the elevator is drawn as a shape rather
       * than a hole. The cargo elevator is exactly the thing that joins
       * them (Astra, 24-09), so the route is: through the heavy bay to the
       * point of its reach nearest this bay's, up or down the elevator in a
       * straight (possibly angled) line, and on through this bay's own
       * passages to the stand. The nearest pair is preferred inside a
       * carrier volume, which is where the elevator is. */
      var br = bridge(gq);
      if (!br) return false;
      heavy.forEach(function (h0) {
        var sq = nearestPassable(berths[h0].mid);
        if (sq < 0) return;
        var got = astar(sq, br.a);
        if (got && (!best || got.cost < best.cost)) best = { cost: got.cost, cells: got.cells, from: h0 };
      });
      var tail = astar(br.b, gq);
      if (!best || !tail) return false;
      pts = pull(best.cells).concat(pull(tail.cells));
      berths[k].lift = 1;
      berths[k].shaft = shaftSpec(br);
      bridged++;
    }
    berths[k].entry = best.from;
    berths[k].via = pts.slice(1, -1).map(function (p) { return [r3(p[0]), r3(p[1]), r3(p[2])]; });
    return true;
  }

  /* Everything the heavy bays reach, once; and for a goal, the closest
   * cell of what IT reaches to that, measured as a straight line through
   * the hull (a multi-source BFS over inside cells, seeded from the heavy
   * reach). Capped at BRIDGE_MAX of the model's half-span. */
  function flood(seeds) {
    var seen = new Uint8Array(NNN), st = [];
    seeds.forEach(function (s) { if (s >= 0 && !seen[s]) { seen[s] = 1; st.push(s); } });
    while (st.length) {
      var c0 = st.pop();
      var cz = (c0 / NN) | 0, cr = c0 - cz * NN, cy = (cr / N) | 0, cx = cr - cy * N;
      for (var k2 = 0; k2 < OFF.length; k2++) {
        var x = cx + OFF[k2][0], y = cy + OFF[k2][1], z = cz + OFF[k2][2];
        if (x < 0 || y < 0 || z < 0 || x >= N || y >= N || z >= N) continue;
        var q3 = idx(x, y, z);
        if (!seen[q3] && passable(q3)) { seen[q3] = 1; st.push(q3); }
      }
    }
    return seen;
  }
  /* WHERE THE SHAFT THE ART IS MISSING WOULD GO (24-09: "we need actual
   * shafts for the lifts"). Written on the berth so a report can hand it
   * to whoever builds the model: the two ends in the model's normalised
   * frame, its length, its angle off vertical (0 a plain lift, 45 the pad
   * sites' inclined cars), and which carrier volume, if any, it runs
   * through — a named lift the art already has but has not opened. */
  function shaftSpec(br) {
    var a = centre(br.a), c = centre(br.b);
    var dx = c[0] - a[0], dy = c[1] - a[1], dz = c[2] - a[2];
    var L = Math.sqrt(dx * dx + dy * dy + dz * dz);
    var ang = L > 1e-9 ? Math.acos(Math.min(1, Math.abs(dz) / L)) * 180 / Math.PI : 0;
    var inCar = null;
    (carried || []).forEach(function (cb) {
      if (inCar) return;
      var m = 2 * cell;
      function inside(p) {
        return p[0] >= cb.min[0] - m && p[0] <= cb.max[0] + m && p[1] >= cb.min[1] - m &&
               p[1] <= cb.max[1] + m && p[2] >= cb.min[2] - m && p[2] <= cb.max[2] + m;
      }
      if (inside(a) || inside(c)) inCar = cb.key || 'carrier';
    });
    return { from: r3p(a), to: r3p(c), len: r3(L), deg: Math.round(ang), carrier: inCar };
  }
  function bridge(goal) {
    return bridgeFrom('heavy', heavy.map(function (h0) { return nearestPassable(berths[h0].mid); }), goal);
  }
  function bridgeFrom(ck, seeds, goal) {
    var cached = reachCache[ck];
    if (cached) { reachL = cached.reach; distL = cached.dist; srcL = cached.src; }
    else {
      reachL = flood(seeds);
      /* Distance out from the heavy reach, through anything inside. */
      distL = new Uint16Array(NNN).fill(65535); srcL = new Int32Array(NNN).fill(-1);
      var qq = new Int32Array(NNN), h1 = 0, t1 = 0;
      for (var s = 0; s < NNN; s++) if (reachL[s]) { distL[s] = 0; srcL[s] = s; qq[t1++] = s; }
      var cap = Math.ceil(BRIDGE_MAX / cell);
      while (h1 < t1) {
        var p = qq[h1++], d = distL[p] + 1;
        if (d > cap) continue;
        var pz = (p / NN) | 0, pr = p - pz * NN, py = (pr / N) | 0, px = pr - py * N;
        for (var k3 = 0; k3 < OFF.length; k3++) {
          var x = px + OFF[k3][0], y = py + OFF[k3][1], z = pz + OFF[k3][2];
          if (x < 0 || y < 0 || z < 0 || x >= N || y >= N || z >= N) continue;
          var nq = idx(x, y, z);
          if (out[nq] || distL[nq] <= d) continue;
          distL[nq] = d; srcL[nq] = srcL[p]; qq[t1++] = nq;
        }
      }
      reachCache[ck] = { reach: reachL, dist: distL, src: srcL };
    }
    var mine = flood([goal]), bestB = -1, bestS = Infinity;
    for (var q = 0; q < NNN; q++) {
      if (!mine[q] || distL[q] === 65535) continue;
      var sc = distL[q] - ((carry[q] || carry[srcL[q]]) ? 6 : 0);
      if (sc < bestS) { bestS = sc; bestB = q; }
    }
    return bestB < 0 ? null : { a: srcL[bestB], b: bestB };
  }
}
var BRIDGE_MAX = 1.2;                // of the half-span: no elevator longer than that

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
  var engines = [];         // one accumulated bounding box per engineGlow
  var hinged = [];          // one bucket per Hinge node — the parts that move

  function walk(nodeIdx, parentMat, inInterior, inEmitter, inHinge, legName, inEngine) {
    var node = j.nodes[nodeIdx];
    var local = node.matrix ? node.matrix.slice()
                            : matFromTRS(node.translation, node.rotation, node.scale);
    var world = matMul(parentMat, local);
    var name = node.name || '';

    /* A hinge opens its own bucket, and everything under it goes in there
     * rather than into the hull. Nested hinges are not a thing these models
     * have, and if one ever appears the outer bucket keeps it — which is
     * wrong but visible, rather than silently dropping the geometry. */
    /* A hinge is not a leg, and LEG_RE would otherwise match one — the
     * hinge test comes first so `gearNose/gearStrutHinge` does not come out
     * named `gearStrutHinge/gearStrutHinge`. */
    var leg = (!HINGE_RE.test(name) && LEG_RE.test(name)) ? name : legName;
    var hinge = inHinge;
    /* A hinge only counts as GEAR if it is inside a gear leg. The tender
     * carries a ninth `...Hinge` node halfway up its starboard flank —
     * service gear of some kind, not a landing leg — and claiming it put an
     * unmovable part in the gear list: no lean to derive an axis from, so
     * no rotation, so a "moving" part that never moved. Anything outside a
     * `gear*` subtree stays baked into the hull exactly as before, which is
     * both correct and a no-op for every model that has one. */
    if (!hinge && leg && HINGE_RE.test(name)) {
      hinge = { name: name, leg: leg, world: world, v: [], f: [], c: [] };
      hinged.push(hinge);
    }
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
    var engine = inEngine || null;
    if (!engine && ENGINE_RE.test(name)) {
      engine = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
      engines.push(engine);
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
      if (!engine && ENGINE_RE.test(mname)) {
        engine = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
        engines.push(engine);
      }
      /* A hinged part is neither hull nor interior: it is its own small
       * mesh, drawn with its own frame. The test comes first because a
       * gear door is exterior geometry and would otherwise be welded into
       * the hull exactly as it is today. */
      var into = hinge ? hinge : (mine ? inr : ext);
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
          if (engine) {
            for (var a2 = 0; a2 < 3; a2++) {
              if (w[a2] < engine.min[a2]) engine.min[a2] = w[a2];
              if (w[a2] > engine.max[a2]) engine.max[a2] = w[a2];
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
      walk(node.children[ch], world, interior, emitter, hinge, leg, engine);
    }
  }

  var scene = j.scenes[j.scene || 0];
  for (var r = 0; r < scene.nodes.length; r++) {
    walk(scene.nodes[r], matIdentity(), false, null, null, null);
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
  /* MEASURED OVER THE WHOLE AUTHORED MODEL, gear included, even though the
   * gear no longer lives in `ext`. Pulling three legs out of the bucket the
   * bounds are taken from would shrink the vertical span and move the
   * centre, which would renormalise every hull in the library and quietly
   * invalidate every number tuned against the old scale — the canopy box,
   * the muzzles, the cockpit archetypes, SHIP_LEN itself. The split is
   * meant to change what MOVES, not how big anything is. */
  var mins = [Infinity, Infinity, Infinity], maxs = [-Infinity, -Infinity, -Infinity];
  function bound(list) {
    for (var q = 0; q < list.length; q++) for (var b = 0; b < 3; b++) {
      if (list[q][b] < mins[b]) mins[b] = list[q][b];
      if (list[q][b] > maxs[b]) maxs[b] = list[q][b];
    }
  }
  bound(ext.v);
  for (var hb = 0; hb < hinged.length; hb++) bound(hinged[hb].v);
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
  /* ---- the moving parts, as their own meshes ----------------------------
   * Each one is emitted RELATIVE TO ITS OWN PIVOT, so the game draws it with
   * a frame placed at the pivot and rotated about the axis, which is exactly
   * the shape `drawPortDoors` already uses for a sliding leaf and the port
   * library uses for a spinning ring. Nothing about the mesh format or
   * either renderer has to change: a part is a mesh and a frame, like
   * everything else this file emits.
   *
   * `stow` is the angle that puts it away, measured off the model rather
   * than typed in — see stowAngle. The game interpolates 0..stow and owns
   * the timing, because how long a leg takes to swing is a feel decision
   * and belongs where feel decisions live. */
  if (hinged.length) {
    var parts = [];
    for (var hg = 0; hg < hinged.length; hg++) {
      var H = hinged[hg];
      if (!H.f.length) continue;
      var m = H.world;
      var pivotRaw = [m[12], m[13], m[14]];
      var localAxes = [vNorm([m[0], m[1], m[2]]),
                       vNorm([m[4], m[5], m[6]]),
                       vNorm([m[8], m[9], m[10]])];

      /* Where the part reaches, measured in the hinge's own frame: spans to
       * pick a fallback axis with, and a centroid to give the direction it
       * extends away from the pin. */
      var lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
      var cen = [0, 0, 0];
      for (var pv = 0; pv < H.v.length; pv++) {
        var rel = [H.v[pv][0] - pivotRaw[0], H.v[pv][1] - pivotRaw[1], H.v[pv][2] - pivotRaw[2]];
        cen[0] += rel[0]; cen[1] += rel[1]; cen[2] += rel[2];
        for (var ax = 0; ax < 3; ax++) {
          var d = vDot(rel, localAxes[ax]);
          if (d < lo[ax]) lo[ax] = d;
          if (d > hi[ax]) hi[ax] = d;
        }
      }
      cen = [cen[0] / H.v.length, cen[1] / H.v.length, cen[2] / H.v.length];
      var spans = [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]];
      var centres = [(hi[0] + lo[0]) / 2, (hi[1] + lo[1]) / 2, (hi[2] + lo[2]) / 2];

      var axis = hingeAxis(cen, localAxes, spans, centres);
      /* The PLACED pivot, because "which way is inboard" is a question
       * about the hull's centre and `place` is what puts the origin there.
       * Handing stowAngle the raw glTF coordinate would measure outward
       * from wherever the artist's world origin happened to be. */
      var pivot = place(pivotRaw);
      var stow = stowAngle(cen, axis, pivot);

      var pp = palette(H.c);
      var r4 = function (x) { return Math.round(x * 10000) / 10000; };
      parts.push({
        id: H.leg + '/' + H.name,
        role: /door/i.test(H.name) ? 'door' : 'strut',
        pivot: pivot,
        axis: axis.map(r4),
        stow: r4(stow),
        v: H.v.map(function (p) {
          return [Math.round((p[0] - pivotRaw[0]) * scale * 1000) / 1000,
                  Math.round((p[1] - pivotRaw[1]) * scale * 1000) / 1000,
                  Math.round((p[2] - pivotRaw[2]) * scale * 1000) / 1000];
        }),
        f: H.f, pal: pp.pal, ci: pp.ci
      });
    }
    /* Sorted so the order is stable between runs and between models, for
     * the same reason the muzzles are: glTF node order is whatever the
     * authoring tool happened to write. */
    parts.sort(function (p, q) {
      return (p.role < q.role ? -1 : p.role > q.role ? 1 : 0) ||
             p.pivot[2] - q.pivot[2] || p.pivot[0] - q.pivot[0];
    });
    if (parts.length) out.gear = parts;
  }

  var live = emitters.filter(function (e) { return isFinite(e.min[0]); });
  if (live.length) {
    out.muzzles = live.map(function (e) {
      var c = place([(e.min[0] + e.max[0]) / 2,
                     (e.min[1] + e.max[1]) / 2,
                     e.max[2]]);
      return c;
    }).sort(function (p, q) { return p[0] - q[0] || p[1] - q[1] || p[2] - q[2]; });
  }
  /* The engines: [x, y, z, r] per engineGlow, at the AFT face of its box
   * (the hull faces +z, so a plume leaves at min z) with r half the smaller
   * cross-section span. Sorted like the muzzles so the order is stable. */
  var liveE = engines.filter(function (e) { return isFinite(e.min[0]); });
  if (liveE.length) {
    out.engines = liveE.map(function (e) {
      var c = place([(e.min[0] + e.max[0]) / 2, (e.min[1] + e.max[1]) / 2, e.min[2]]);
      var r = Math.min(e.max[0] - e.min[0], e.max[1] - e.min[1]) / 2 * scale;
      c.push(Math.max(0.001, Math.round(r * 1000) / 1000));
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
/* The right-angle turn that takes a shared berth `up` to +z, or null. Needs
 * the berth boxes' own matrices, so it runs before anything is placed. */
function standUp(berths) {
  if (!berths || !berths.length) return null;
  var ups = [];
  for (var i = 0; i < berths.length; i++) {
    var b = berths[i];
    if (!b.mat) continue;
    var o = matApply(b.mat, [0, 0, 0]), y = matApply(b.mat, [0, 1, 0]);
    var g0 = [o[0], -o[2], o[1]], g1 = [y[0], -y[2], y[1]];     // toGame, inline
    var d = [g1[0] - g0[0], g1[1] - g0[1], g1[2] - g0[2]];
    var l = Math.sqrt(d[0] * d[0] + d[1] * d[1] + d[2] * d[2]);
    if (!(l > 1e-9)) return null;
    ups.push([d[0] / l, d[1] / l, d[2] / l]);
  }
  if (!ups.length) return null;
  var u = ups[0];
  for (i = 1; i < ups.length; i++) {
    if (u[0] * ups[i][0] + u[1] * ups[i][1] + u[2] * ups[i][2] < 0.999) return null;   // they disagree
  }
  var ax = -1;
  for (var k = 0; k < 3; k++) if (Math.abs(u[k]) > 0.999) ax = k;
  if (ax < 0) return null;                       // not a world axis: leave it be
  var sgn = u[ax] > 0 ? 1 : -1;
  if (ax === 2) return sgn > 0 ? null : function (p) { return [p[0], -p[1], -p[2]]; };
  /* up = +/-y: turn about x.  up = +/-x: turn about y. Each maps u to +z. */
  if (ax === 1) return sgn > 0 ? function (p) { return [p[0], -p[2], p[1]]; }
                               : function (p) { return [p[0], p[2], -p[1]]; };
  return sgn > 0 ? function (p) { return [-p[2], p[1], p[0]]; }
                 : function (p) { return [p[2], p[1], -p[0]]; };
}

function convertPort(file) {
  var g = parseGlb(fs.readFileSync(file));
  var j = g.json;
  var ext = { v: [], f: [], c: [], o: [] };     // the shell
  var inr = { v: [], f: [], c: [], o: [] };     // only visible from inside
  var spn = { v: [], f: [], c: [], o: [] };     // turns about +z
  var single = {}, multi = {}, extras = [], groups = [], carriers = {};
  /* ENTRANCES: the outer doors a port opens to traffic control's say-so
   * (`airlock.outerOpensOn: 'dockingClearance'`). An orbital berth is its
   * own entrance; a ground site is not — its bays are underground, and the
   * way in is a surface pad door, a hangar door or a portal in a mountain
   * face (Astra, 24-09). Keyed by node name, grown over the door's subtree. */
  var entrances = {}, sweeps = [];
  /* The scene root's own transform. A bay's declared `dockPath` is written
   * in the root's LOCAL frame (the station as designed, before the builder
   * grounded it), so it needs the root's matrix and nothing else — measured
   * on yard-m: the carriage's `raised` point (hall frame) and dockPath[0]
   * agree on x and y exactly once each is taken to the root frame. */
  var rootMat = null;
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
    /* Both the reference volume and its panels, so a bay that ships both
     * is ONE berth. Without the bare `Throat$` arm here, a model exported
     * with its reference volumes intact reports every bay twice — the box
     * once and its lining once — which is the failure that arrives the
     * moment onlyVisible:false starts working. */
    if (!/Throat(?:Floor|Roof|WallL|WallR|Back)?$/i.test(name)) return null;
    /* A node with NO parent merges with nothing. The station builder puts a
     * bay's volume and its lining inside a group, so they share a parent
     * and belong together; a flat model — the synthetic fixtures, or any
     * bay authored by hand — hangs several complete `…Throat` volumes off
     * the scene root, where they share the non-parent -1 and are three
     * different bays. Keying on that would have reported the orbital
     * fixture's two S/M berths and one heavy as a single berth spanning
     * the station. */
    if (!(parentIdx >= 0)) return null;
    return 'berth|' + parentIdx;
  }

  /* Is this node the bay's own reference volume, as opposed to the plates
   * that line it? The distinction decides which measurement wins below. */
  function isReference(name) { return /Throat$/i.test(name); }
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

  function walk(nodeIdx, parentMat, inInterior, inSpin, anchors, inOmit, parentIdx, inGate, inOpen, inCarry, inEntr) {
    var node = j.nodes[nodeIdx];
    var local = node.matrix ? node.matrix.slice()
                            : matFromTRS(node.translation, node.rotation, node.scale);
    var world = matMul(parentMat, local);
    var name = node.name || '';
    if (parentIdx === -1 && !rootMat) rootMat = world;
    /* Anything that opens: leaves, gates, fields, hatches. Drawn like any
     * other geometry, but left out of the voxel grid the interior routes
     * are found in — a route runs through doors with the doors open. */
    var openHere = inOpen || OPENABLE_RE.test(name);
    /* A CARRIER: a lift, a hoist, a conveyor, a shaft. Its whole volume is
     * somewhere a hull can be taken, decks and all — a lift car IS the hole
     * in the floor (Astra, 24-09: "angled cargo elevators to move the S and
     * M sized ships to their berths"). Grouped by stem so a shaft modelled
     * as four thin walls becomes one volume. */
    var cm = CARRIER_RE.exec(name), ckey = inCarry || null;
    if (cm) {
      ckey = cm[1].toLowerCase();
      if (!carriers[ckey]) carriers[ckey] = box();
    }
    /* A car that DECLARES its travel (`lift.travel`, the pad sites' 45
     * degree incline) sweeps its whole run, not just the landing it was
     * exported at: the car is drawn at the top, and the hull rides it to
     * the bottom. Swept after the walk, once the car's own box is known. */
    var lx = node.extras && node.extras.lift;
    if (ckey && lx && lx.travel && typeof lx.travel === 'object') {
      var o0 = toGame(matApply(parentMat, [0, 0, 0]));
      var o1 = toGame(matApply(parentMat, [+lx.travel.x || 0, +lx.travel.y || 0, +lx.travel.z || 0]));
      sweeps.push({ key: ckey, d: [o1[0] - o0[0], o1[1] - o0[1], o1[2] - o0[2]] });
    }
    var ekey = inEntr || null;
    var al = node.extras && node.extras.airlock;
    if (!ekey && al && al.outerOpensOn === 'dockingClearance' && !/^berth/i.test(name)) {
      ekey = name;
      entrances[ekey] = box();
      entrances[ekey].node = name;
      if (node.extras.clearOpening) entrances[ekey].opening = node.extras.clearOpening;
    }

    /* Inherited, like every other classification here: a named parent takes
     * its unnamed children with it, which is how a stand leg made of six
     * unnamed pieces goes away as one leg. */
    /* A reference volume is omitted from the picture but NOT inherited as
     * omitted — it has no children today, and if one ever grows some they
     * are geometry until they say otherwise. PORT_OMIT_RE keeps inheriting,
     * because a stand leg's six unnamed pieces go away with the leg. */
    var omit = inOmit || PORT_OMIT_RE.test(name) || PORT_REFERENCE_RE.test(name);
    var inOmitNext = inOmit || PORT_OMIT_RE.test(name);
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
    /* A BERTH DECLARED BY ITS OWN GROUP (the 22-09 designs). Their bays
     * carry `berthKind` in extras and many have no throat panels at all —
     * the spine's toothed sliders, the refinery's curtained chambers, the
     * yard's garages, the ring's heavy bay — so the throat rule above never
     * saw them. The group node's own axes are the bay's frame (+Z out
     * through the door, +Y up), exactly as for the throat berths. Kept as a
     * candidate: if the same group turns out to hold throat panels, those
     * win and this is dropped (see the merge after the walk). */
    if (BERTH_GROUP_RE.test(name) && node.extras && node.extras.berthKind) {
      var gb = box();
      gb.mat = world; gb.node = name; gb.idx = nodeIdx; gb.kind = node.extras.berthKind;
      /* The bay the art says a ship leaves by. Read by interiorRoutes for
       * a HEAVY bay that is itself inside the station (see there). */
      if (typeof node.extras.exitVia === 'string') gb.exitVia = node.extras.exitVia;
      /* THE ROUTE THE ART DECLARES (24-09 evening civil yard, and the new
       * cylinders): `dockPath` runs from the bay out through its exitVia
       * bay's mouth, in the root's frame; a carriage bay adds
       * `carriage.raised`, the carriage's track point, in the bay's parent
       * frame. Kept in game axes here and used only where the voxel router
       * cannot find a way — a carriage is a moving floor, and the router
       * only knows fixed ones. */
      if (Array.isArray(node.extras.dockPath) && rootMat) {
        gb.declaredRaw = node.extras.dockPath.filter(function (q) {
          return Array.isArray(q) && q.length === 3;
        }).map(function (q) { return toGame(matApply(rootMat, q)); });
      }
      var cx = node.extras.carriage;
      if (cx && Array.isArray(cx.raised) && cx.raised.length === 3) {
        gb.carriageRaw = toGame(matApply(parentMat, cx.raised));
      }
      groups.push(gb);
      mine = gb;
    }
    var gateHere = false;
    for (k in PORT_MULTI) {
      /* ONE LEAF, ONE GATE. A leaf group's own door plate is also called
       * a door (`…BlastDoorL` inside `leafGroup_…_L`); opening a second
       * gate for it would split one moving part in two and leave the
       * chevrons behind when it slid. */
      if (k === 'gates' && inGate) continue;
      if (PORT_MULTI[k].test(name)) {
        if (k === 'gates') gateHere = true;
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
        if (mk && merged[mk]) {
          var have = merged[mk];
          /* THE REFERENCE VOLUME WINS, and it is not merely a tie-break.
           *
           * The panels LINE the throat, so their union is the aperture plus
           * a wall thickness all round — a bay measured that way reads
           * bigger than the hole a hull has to fly through, and this number
           * decides whether a hull fits. Erring large is the dangerous
           * direction: it says yes to a ship that would hit the jamb.
           *
           * So when the true volume turns up, it replaces whatever the
           * panels had accumulated and locks the box; panels seen
           * afterwards are measured into a scratch box and discarded. When
           * no reference volume is present — every model exported before
           * the exporter was fixed — the panel union stands, which is what
           * the bays are measured from today. */
          if (isReference(name) && !have.authoritative) {
            have.min = [Infinity, Infinity, Infinity];
            have.max = [-Infinity, -Infinity, -Infinity];
            have.mat = world;
            have.node = name;
            have.authoritative = true;
            mine = have;
          } else if (have.authoritative && !isReference(name)) {
            mine = box();                    // measured nowhere, deliberately
          } else {
            mine = have;
          }
          continue;
        }
        var b = box();
        if (mk) { merged[mk] = b; b.authoritative = isReference(name); }
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
        /* A leaf group carries its own travel (`doorLeaf.travel`, in the
         * model's own units). Kept raw and scaled on the way out, because
         * the art's number is the distance the builder actually animates —
         * better than any distance measured back off a stowed leaf. */
        if (k === 'gates' && node.extras && node.extras.doorLeaf &&
            typeof node.extras.doorLeaf.travel === 'number') {
          b.travelRaw = node.extras.doorLeaf.travel;
        }
        /* THE 22-09 DIALECT: a telescoping pair of leaves per side
         * (`SlidingDoorL1`, `SlidingDoorL2`), each carrying the two stops it
         * runs between in its own local X — `door: {openX, closedX}`. The
         * outer leaf of the pair has to run further than the inner one, and
         * measuring either against the centreline gave the outer leaf almost
         * nothing: 110 leaves across the new set reported "does not move".
         * The art's own stops are the travel. */
        if (k === 'gates' && b.travelRaw === undefined && node.extras && node.extras.door &&
            typeof node.extras.door.openX === 'number' && typeof node.extras.door.closedX === 'number') {
          b.travelRaw = Math.abs(node.extras.door.openX - node.extras.door.closedX);
        }
        multi[k].push(b);
        mine = b;
      }
    }

    /* MEASURED EVEN WHEN NOT DRAWN, and the two used to be the same
     * decision. `omit` skipped the whole block, so a node excluded from the
     * mesh contributed nothing to its anchor either — which is fine for a
     * stand leg and wrong for a reference volume, whose entire purpose is
     * to be measured and never painted. Now the vertices are always walked
     * and only the pushing is conditional. */
    if (node.mesh !== undefined) {
      var mesh = j.meshes[node.mesh];
      var into = interior ? inr : (spin ? spn : ext);
      for (var p = 0; p < mesh.primitives.length; p++) {
        var prim = mesh.primitives[p];
        if (prim.mode !== undefined && prim.mode !== 4) continue;
        var pos = accessorData(g, prim.attributes.POSITION);
        var base = into.v.length;
        for (var i = 0; i < pos.length; i++) {
          var w = toGame(matApply(world, pos[i]));
          if (!omit) into.v.push(w);
          if (mine) grow(mine, w);
          if (ckey) grow(carriers[ckey], w);
          if (ekey) grow(entrances[ekey], w);
        }
        if (omit) continue;                 // measured, deliberately unpainted
        var col = materialColour(g, prim.material);
        var idx = prim.indices !== undefined
          ? accessorData(g, prim.indices)
          : pos.map(function (_, n) { return n; });
        for (var t = 0; t < idx.length; t += 3) {
          into.f.push([base + idx[t], base + idx[t + 1], base + idx[t + 2]]);
          into.c.push(col);
          into.o.push(openHere ? 1 : 0);
        }
      }
    }
    for (var ch = 0; ch < (node.children || []).length; ch++) {
      walk(node.children[ch], world, interior, spin, mine, inOmitNext, nodeIdx,
           inGate || gateHere, openHere, ckey, ekey);
    }
  }

  var scene = j.scenes[j.scene || 0];
  for (var r = 0; r < scene.nodes.length; r++) {
    walk(scene.nodes[r], matIdentity(), false, false, null, false, -1);
  }
  sweeps.forEach(function (s) {
    var b = carriers[s.key];
    if (!b || !isFinite(b.min[0])) return;
    grow(b, [b.min[0] + s.d[0], b.min[1] + s.d[1], b.min[2] + s.d[2]]);
    grow(b, [b.max[0] + s.d[0], b.max[1] + s.d[1], b.max[2] + s.d[2]]);
  });

  /* Group-declared berths join the list only where the group held no throat
   * panels; where it did, the throat berth stands and just learns its kind.
   * Every berth also learns its CLASS from its name — `berthL…` is a heavy
   * bay, `berthSM…` a small/medium one — which is what the interior routes
   * below are keyed on. */
  var groupByIdx = {};
  groups.forEach(function (gb2) { groupByIdx[gb2.idx] = gb2; });
  multi.berths.forEach(function (b0) {
    for (var mk2 in merged) {
      if (merged[mk2] === b0) {
        var gidx = +mk2.split('|')[1];
        if (groupByIdx[gidx]) {
          b0.kind = groupByIdx[gidx].kind;
          if (groupByIdx[gidx].exitVia) b0.exitVia = groupByIdx[gidx].exitVia;
          if (groupByIdx[gidx].declaredRaw) b0.declaredRaw = groupByIdx[gidx].declaredRaw;
          if (groupByIdx[gidx].carriageRaw) b0.carriageRaw = groupByIdx[gidx].carriageRaw;
          groupByIdx[gidx].claimed = true;
        }
      }
    }
  });
  groups.forEach(function (gb3) {
    if (!gb3.claimed && isFinite(gb3.min[0])) multi.berths.push(gb3);
  });
  multi.berths.forEach(function (b1) {
    var nm = String(b1.node || '');
    b1.cls = /^berthL/.test(nm) ? 'L' : (/^berthSM/.test(nm) ? 'SM' : null);
  });

  /* ---- scale, and where the origin is ----------------------------------
   * A surface bay is measured in PAD RADII, which is a gameplay quantity
   * and not a bounding box — so the model declares it with `portPad` and
   * everything else falls out. An orbital station has no pad and normalises
   * to radius 1 off its own bounds, which is what the procedural stations
   * already do. */
  /* ---- STAND IT UP THE WAY THE GAME STANDS STATIONS -----------------------
   *
   * The game's port frame has +z up: a berth's deck is below it on z, the
   * camera clamps against z, and a station that turns, turns about z.
   * Every model before 2026-09-21 was built that way round. The new
   * cylinder is not — it lies on its side, its bays ringing a bore that
   * runs along y, every bay's up pointing down that bore — so parked hulls
   * stood on their tails against a deck the game was looking for on z, and
   * the whole station would have tumbled end over end instead of turning
   * on its long axis.
   *
   * So if EVERY berth agrees on an up, and it is a world axis that is not
   * +z, the model is turned a quarter or half turn to make it +z. Only
   * then, and only by a right angle: a rotation by a multiple of 90
   * degrees keeps every axis-aligned box axis-aligned, so no anchor has to
   * be re-measured, and a model whose bays disagree about up is left
   * exactly as its maker built it. */
  var fix = standUp(multi.berths);
  if (fix) {
    [ext, inr, spn].forEach(function (bucket) {
      for (var q = 0; q < bucket.v.length; q++) bucket.v[q] = fix(bucket.v[q]);
    });
    var fixBox = function (b) {
      if (!b || !isFinite(b.min[0])) return;
      var c1 = fix(b.min), c2 = fix(b.max);
      b.min = [Math.min(c1[0], c2[0]), Math.min(c1[1], c2[1]), Math.min(c1[2], c2[2])];
      b.max = [Math.max(c1[0], c2[0]), Math.max(c1[1], c2[1]), Math.max(c1[2], c2[2])];
      b.fix = fix;
    };
    for (var sk in single) fixBox(single[sk]);
    for (var mk2 in multi) multi[mk2].forEach(fixBox);
    for (var ck2 in carriers) fixBox(carriers[ck2]);
    for (var ek2 in entrances) fixBox(entrances[ek2]);
  }

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
    var toG = b.fix ? function (q) { return b.fix(toGame(q)); } : toGame;
    var lo = place(b.min), hi = place(b.max);
    var out = { min: lo, max: hi,
                mid: [r3((lo[0] + hi[0]) / 2), r3((lo[1] + hi[1]) / 2),
                      r3((lo[2] + hi[2]) / 2)] };
    if (b.node) out.node = b.node;
    if (b.cls) out.cls = b.cls;
    if (b.kind) out.kind = b.kind;
    if (b.exitVia) out.exitVia = b.exitVia;
    /* Declared route points, in the same placed coordinates as the box.
     * Working data for interiorRoutes; stripped before the index is written. */
    var fixP = function (q) { return place(b.fix ? b.fix(q) : q); };
    if (b.declaredRaw && b.declaredRaw.length) out.declared = b.declaredRaw.map(fixP);
    if (b.carriageRaw) out.carriage = fixP(b.carriageRaw);
    if (typeof b.travelRaw === 'number') out.travel = r3(b.travelRaw * scale);
    /* The node's local +Z, in game axes: the direction a ship approaches
     * along. Taken as the DIFFERENCE of two transformed points rather than
     * the matrix's third column, so a node with a negative scale — a
     * mirrored berth, which the ring station's whole upper half is — gives
     * the direction it actually faces rather than the one it would face
     * unmirrored. toGame is a pure rotation, so it is valid on a direction. */
    if (b.mat) {
      var p0 = toG(matApply(b.mat, [0, 0, 0]));
      var p1 = toG(matApply(b.mat, [0, 0, 1]));
      var dx = p1[0] - p0[0], dy = p1[1] - p0[1], dz = p1[2] - p0[2];
      var l = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (l > 1e-9) out.normal = [r3(dx / l), r3(dy / l), r3(dz / l)];
      /* And the node's local +Y — the bay's own UP, its deck-to-ceiling
       * direction. Every berth before 2026-09-21 had it equal to game +z,
       * which is why nothing asked. The cylinder's bays ring its bore, so
       * each one's deck faces a different way. */
      var p2 = toG(matApply(b.mat, [0, 1, 0]));
      var ux = p2[0] - p0[0], uy = p2[1] - p0[1], uz = p2[2] - p0[2];
      var ul = Math.sqrt(ux * ux + uy * uy + uz * uz);
      if (ul > 1e-9) out.up = [r3(ux / ul), r3(uy / ul), r3(uz / ul)];
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
  /* The routes from the heavy bays to the small ones, where the model has
   * both (see interiorRoutes). Orbital stations only: a ground port's bays
   * are reached down its own shaft. */
  /* A GARAGE'S BERTH IS BEHIND ITS DOOR (24-09). The yards declare each
   * heavy garage as a group holding the door frame — jambs, lintel, sill,
   * nav lights — and the slatted leaves, so the group's box is the frame,
   * proud of the hull OUTSIDE the leaves, and a hull parked at its middle
   * sat in the doorway with the garage (0.47 radii deep, measured) empty
   * behind it and no door between it and space. So the box is moved in
   * along the berth's normal to lie behind the leaves, keeping its size:
   * the leaves become its outer gate like every other bay's. */
  /* The gates here are the garage's SLATS (see PORT_MULTI.gates): a
   * roll-up door, which render.js draws as there-or-not like a field
   * rather than sliding each slat sideways. */
  (anchors.berths || []).forEach(function (b) {
    if (b.kind !== 'garage' || !b.normal || !b.node || !anchors.gates) return;
    var leaves = anchors.gates.filter(function (g) { return g.node && g.node.indexOf(b.node + 'Leaf') === 0; });
    if (!leaves.length) return;
    var n = b.normal, lm = [0, 1, 2].map(function (k) {
      return leaves.reduce(function (s, g) { return s + g.mid[k]; }, 0) / leaves.length;
    });
    var d = (b.mid[0] - lm[0]) * n[0] + (b.mid[1] - lm[1]) * n[1] + (b.mid[2] - lm[2]) * n[2];
    if (!(d > -1e-3)) return;                    // already behind its door
    var depth = Math.abs(n[0]) * (b.max[0] - b.min[0]) + Math.abs(n[1]) * (b.max[1] - b.min[1]) +
                Math.abs(n[2]) * (b.max[2] - b.min[2]);
    var s = -(d + depth / 2);
    for (var k = 0; k < 3; k++) {
      b.min[k] = r3(b.min[k] + n[k] * s); b.max[k] = r3(b.max[k] + n[k] * s); b.mid[k] = r3(b.mid[k] + n[k] * s);
    }
  });
  if (anchors.berths) anchors.berths.sort(function (p, q) {
    return p.mid[0] - q.mid[0] || p.mid[1] - q.mid[1] || p.mid[2] - q.mid[2];
  });

  var routed = 0;
  var carried = Object.keys(carriers).map(function (ck) {
    var pb = placedBox(carriers[ck]);
    if (pb) pb.key = ck;
    return pb;
  }).filter(Boolean);
  if (process.env.ROUTE_DEBUG) carried.forEach(function (c) {
    console.log('    carrier ' + c.key + ' ' + JSON.stringify(c.min) + ' .. ' + JSON.stringify(c.max));
  });
  var doorList = Object.keys(entrances).map(function (ek) {
    var pb = placedBox(entrances[ek]);
    if (pb) { pb.node = ek; if (entrances[ek].opening) pb.opening = entrances[ek].opening; }
    return pb;
  }).filter(Boolean).sort(function (p, q) {
    return p.mid[0] - q.mid[0] || p.mid[1] - q.mid[1] || p.mid[2] - q.mid[2];
  });
  if (kind === 'orbital' && anchors.berths) routed = interiorRoutes([ext, inr], anchors.berths, carried, doorList);
  /* The art's declared routes are working data for the router, not index. */
  (anchors.berths || []).forEach(function (b) { delete b.declared; delete b.carriage; });
  if (carried.length) out.carriers = carried.map(function (c) { return { min: c.min, max: c.max, key: c.key }; });
  /* The model's own metres per normalised unit, so a shaft spec can be
   * handed back to the builder in the units it was drawn in. */
  out.metresPerUnit = Math.round(1000 / scale) / 1000;
  out.origin = origin.map(function (v) { return Math.round(v * 1000) / 1000; });   // game axes, model units
  if (doorList.length) out.entrances = doorList.map(function (d) {
    var e = { node: d.node, min: d.min, max: d.max, mid: d.mid, normal: d.normal || [0, 0, 1] };
    if (d.opening) e.opening = d.opening;
    return e;
  });

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
  if (anchors.berths) {
    var smN = anchors.berths.filter(function (b) { return b.cls === 'SM'; }).length;
    var lN = anchors.berths.filter(function (b) { return b.cls === 'L'; }).length;
    if (lN && smN && routed < smN) out.warnings.push((smN - routed) + ' of ' + smN + ' S/M berth(s) have no route in from an L bay');
    out.routes = routed;
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
    if (pm.routes) bits.push(pm.routes + ' S/M routed via L');
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
              (m.glass ? '   glass@' + m.glass.mid.join(',') : '   no glass') +
              /* Reported per model, because "how many legs came out of this
               * hull" is the one number that says whether the rig was
               * found — and a model that silently loses its gear back into
               * the baked mesh looks completely normal in every other line
               * of this output. */
              (m.gear ? '   + ' + m.gear.length + ' hinged' : '   NO GEAR'));
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

/* ---- PORTS ARE SPLIT: a small index eagerly, the geometry on demand ------
 * Astra, 2026-09-22: "Lazy-load." The 22-09 drop is 102 port models and
 * 280 MB of GLB; baked into one script it was a 127 MB ports.js that every
 * boot parsed before the first frame, on the same laptop that runs the
 * game. Nearly all of it is triangles for stations in systems you are not
 * in.
 *
 * So ports.js keeps EVERYTHING THE SIMULATION READS — kind, anchors (the
 * berths, gates, pockets, signs), geom, extras — for every model, because
 * the model a port wears and where its berths are must be known the instant
 * a system is generated, and a berth that moved once the art arrived would
 * move a parked ship. Only the drawing buckets (v f pal ci interior spin)
 * go to src/ports/<id>.js, fetched the first time something asks
 * Render.libPort for that model. See PortGeo below and libPort in render.js.
 *
 * Ids in the index stay exactly the ids they always were, so poolFor and
 * every Object.keys(PortLib) reader see the whole library from boot. */
var PORT_GEO_KEYS = ['v', 'f', 'pal', 'ci', 'interior', 'spin'];
var PORT_LOADER = [
  '',
  '  /* ---- PortGeo: the geometry, on demand ------------------------------',
  '   * An index entry carries `lazy: true` until its drawing buckets arrive.',
  '   * load(id) answers "is the geometry here NOW": in node it requires the',
  '   * file synchronously (tests see a whole library); in a page it tries a',
  '   * synchronous fetch first, so the first answer is already the real one,',
  '   * and falls back to a <script> tag when the scheme will not allow that',
  '   * (file:// in a browser). The async path tells its listeners on arrival',
  '   * so anything that cached "no model" can forget it. */',
  "  var GEO_STATE = {}, GEO_LISTENERS = [];",
  "  var GEO_BASE = null;",
  "  if (typeof document !== 'undefined' && document.currentScript && document.currentScript.src) {",
  "    GEO_BASE = document.currentScript.src.replace(/[^\\/]*$/, '') + 'ports/';",
  "  }",
  "  function geoMerge(id, d) {",
  "    var m = global.PortLib && global.PortLib[id];",
  "    if (!m || !d) return false;",
  "    for (var k in d) if (Object.prototype.hasOwnProperty.call(d, k)) m[k] = d[k];",
  "    m.lazy = false;",
  "    GEO_STATE[id] = 'loaded';",
  "    return true;",
  "  }",
  "  function geoTake(id) {",
  "    var bag = global.PortGeoData;",
  "    if (!bag || !bag[id]) return false;",
  "    var ok = geoMerge(id, bag[id]);",
  "    delete bag[id];",
  "    return ok;",
  "  }",
  "  function geoLoad(id) {",
  "    var m = global.PortLib && global.PortLib[id];",
  "    if (!m) return false;",
  "    if (!m.lazy) return true;",
  "    if (geoTake(id)) return true;",
  "    if (GEO_STATE[id] === 'failed' || GEO_STATE[id] === 'pending') return false;",
  "    if (typeof document === 'undefined' && typeof require === 'function' && typeof __dirname === 'string') {",
  "      try {",
  "        var d = require(require('path').join(__dirname, 'ports', id + '.js'));",
  "        if (global.PortGeoData) delete global.PortGeoData[id];",
  "        return geoMerge(id, d);",
  "      } catch (e) { GEO_STATE[id] = 'failed'; return false; }",
  "    }",
  "    if (!GEO_BASE || typeof XMLHttpRequest === 'undefined') { GEO_STATE[id] = 'failed'; return false; }",
  "    try {",
  "      var x = new XMLHttpRequest();",
  "      x.open('GET', GEO_BASE + id + '.js', false);",
  "      x.send(null);",
  "      if ((x.status === 200 || x.status === 0) && x.responseText) {",
  "        (new Function(x.responseText))();",
  "        if (geoTake(id)) return true;",
  "      }",
  "    } catch (e) { /* the scheme refused a synchronous read: go async */ }",
  "    GEO_STATE[id] = 'pending';",
  "    var s = document.createElement('script');",
  "    s.src = GEO_BASE + id + '.js';",
  "    s.async = true;",
  "    s.onload = function () {",
  "      if (!geoTake(id)) { GEO_STATE[id] = 'failed'; return; }",
  "      for (var i = 0; i < GEO_LISTENERS.length; i++) {",
  "        try { GEO_LISTENERS[i](id); } catch (e) { /* a listener is not allowed to stop the others */ }",
  "      }",
  "    };",
  "    s.onerror = function () { GEO_STATE[id] = 'failed'; };",
  "    (document.head || document.documentElement).appendChild(s);",
  "    return false;",
  "  }",
  "  global.PortGeo = {",
  "    load: geoLoad,",
  "    loaded: function (id) { var m = global.PortLib && global.PortLib[id]; return !!(m && !m.lazy); },",
  "    state: function (id) { return GEO_STATE[id] || null; },",
  "    onload: function (fn) { if (typeof fn === 'function') GEO_LISTENERS.push(fn); },",
  "    prefetch: function (ids) { (ids || []).forEach(function (id) { geoLoad(id); }); }",
  "  };",
  ''
].join('\n');

if (PORTS) {
  var geoDir = path.join(path.dirname(outFile), 'ports');
  fs.mkdirSync(geoDir, { recursive: true });
  var index = {}, geoBytes = 0;
  Object.keys(lib).forEach(function (pid) {
    var full = lib[pid], meta = {}, geo = {};
    Object.keys(full).forEach(function (k) {
      if (PORT_GEO_KEYS.indexOf(k) >= 0) geo[k] = full[k]; else meta[k] = full[k];
    });
    meta.lazy = true;
    index[pid] = meta;
    var body = '/* ' + pid + ' - GENERATED by tools/glb2hulls.js --ports. Geometry only; the anchors are in ports.js. */\n' +
      '(function (g) {\n  var d = ' + JSON.stringify(geo) + ';\n' +
      '  (g.PortGeoData || (g.PortGeoData = {}))[' + JSON.stringify(pid) + '] = d;\n' +
      "  if (typeof module !== 'undefined' && module.exports) module.exports = d;\n" +
      "})(typeof window !== 'undefined' ? window : globalThis);\n";
    fs.writeFileSync(path.join(geoDir, pid + '.js'), body);
    geoBytes += body.length;
  });
  /* A model removed from ref/ports must not linger as a file nothing indexes. */
  fs.readdirSync(geoDir).forEach(function (f3) {
    if (/\.js$/.test(f3) && !index[f3.replace(/\.js$/, '')]) fs.unlinkSync(path.join(geoDir, f3));
  });
  fs.writeFileSync(outFile,
    portHeader + JSON.stringify(index) + ';\n' + PORT_LOADER +
    "  if (typeof module !== 'undefined' && module.exports) module.exports = global.PortLib;\n" +
    "})(typeof window !== 'undefined' ? window : globalThis);\n");
  console.log('\nwrote ' + outFile + ' (' + Math.round(fs.statSync(outFile).size / 1024) + ' KB index, ' +
              files.length + ' ports) + ' + geoDir + ' (' + Math.round(geoBytes / 1048576) + ' MB geometry, loaded on demand)');
  var warnedP = Object.keys(lib).filter(function (k) { return lib[k].warnings; });
  if (warnedP.length) console.log(warnedP.length + ' port(s) converted WITH WARNINGS: ' + warnedP.join(', '));
  process.exit(0);
}

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
