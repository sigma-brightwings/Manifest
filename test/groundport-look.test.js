/* groundport-look.test.js - what a ground port and the ground round it look
 * like from the outside camera (2026-11-02).
 *
 *     node test/groundport-look.test.js
 *
 * Astra's Downwell sheet showed two things nobody could name, and a third
 * that was simply missing:
 *
 *   - building-sized salmon-pink slabs over the town. They were the hatch
 *     lamps (Render.drawPortLamps), still laid out in pad radii for a
 *     mouth of 0.55 when the mouth had become 0.20: twelve 45 m red
 *     pillars 160 m out, bloomed by the glow pass.
 *   - bright yellow squares in the air: the pad-rim sodium lamps, 9 m
 *     glowing cubes, and the signs - coloured slabs with no lettering on a
 *     5 m post. Over flat ground nothing said they stood on anything.
 *   - the ground itself, one flat colour from 0.2 to 10 km up.
 *
 * What this holds, without a GPU (it cannot see a picture - the screenshots
 * are in the CHANGELOG entry):
 *   A  every lamp is lamp-sized and stands at the hatch it marks, on the
 *      street it stands on; every board is sign-sized, lettered, on a
 *      building, and reads forwards from the pad.
 *   B  the ground detail is the same field every time for the same world,
 *      differs between worlds, has real variance, averages to exactly the
 *      colour seen from orbit, and is the same ground whichever lattice
 *      anchor it is read from (so re-anchoring cannot make it swim); and
 *      the shader that draws it is wired the way the JS twin says.
 */
global.window = global.window || global;
var path = require('path');
var ROOT = path.join(__dirname, '..');
['vec3', 'rng', 'slipspace', 'kepler', 'economy', 'generate', 'hulls', 'ports', 'port-sites',
 'dressing', 'render', 'rings', 'sim', 'weather', 'gl']
  .forEach(function (m) { require(path.join(ROOT, 'src', m + '.js')); });
var R = global.Render, Gen = global.Gen, Sim = global.Sim, GL = global.GLWorld, V = global.V;
var Galaxy = require(path.join(ROOT, 'src', 'galaxy.js'));

var pass = 0, fail = 0;
function check(n, c, d) {
  if (c) { pass++; console.log('  ok   ' + n + (d ? '   ' + d : '')); }
  else { fail++; console.log('  FAIL  ' + n + (d ? '   ' + d : '')); }
}

/* Surface ports from the first few systems of two seeds: enough to see
 * every model kind (procedural, city site, runway, underground). */
var PORTS = [];
['kawartha', 'manifest'].forEach(function (seed) {
  var g = Galaxy.build(seed);
  for (var i = 0; i < 5; i++) {
    var st = g.stars[i], fac = g.factionById ? g.factionById[st.factionId] : null;
    var sys = Gen.generateSystem(st.seed, fac ? { faction: fac, allFactions: g.factions } : undefined);
    /* Sea platforms have no hatch, collar lamps or street (seaplatform.test). */
    (sys.ports || []).forEach(function (p) { if (p.surface && !p.seaPlatform) PORTS.push({ p: p, sys: sys }); });
  }
});

console.log('--- A: the hatch lamps ---');
(function () {
  var mouth = R.mouthR ? R.mouthR() : Gen.bayGeometry({ radius: 1, shaftDepth: 1 }).mouthR;
  /* drawPortLamps builds LAMP_RINGS on first use; ask for one port's set. */
  R.stationMeshes && R.stationMeshes();
  var sets = 0, worstM = 0, inside = 0, outside = 0, nearest = Infinity, farthest = 0, zBad = 0, mouthsDiffer = 0;
  PORTS.forEach(function (e) {
    var set = R.lampSetFor(e.p);
    if (!set) return;
    sets++;
    var g = Gen.bayGeometry(e.p);
    if (Math.abs(g.mouthR - mouth) > 1e-9) mouthsDiffer++;
    var m = set.denied, lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    var modelled = !!(global.PortLib && global.PortLib[R.portModelFor(e.p)]);
    /* Each box is 8 consecutive vertices. */
    for (var b = 0; b < m.v.length; b += 8) {
      var bl = [Infinity, Infinity, Infinity], bh = [-Infinity, -Infinity, -Infinity];
      for (var k = 0; k < 8; k++) for (var a = 0; a < 3; a++) {
        bl[a] = Math.min(bl[a], m.v[b + k][a]); bh[a] = Math.max(bh[a], m.v[b + k][a]);
      }
      var size = Math.max(bh[0] - bl[0], bh[1] - bl[1], bh[2] - bl[2]) * e.p.radius * 1000;
      worstM = Math.max(worstM, size);
      var cx = (bl[0] + bh[0]) / 2, cy = (bl[1] + bh[1]) / 2;
      var off = Math.max(Math.abs(cx), Math.abs(cy));            // square hatch
      nearest = Math.min(nearest, off / g.mouthR); farthest = Math.max(farthest, off / g.mouthR);
      if (off <= g.mouthR) inside++; else outside++;
      var want = modelled ? 0 : 0.08;
      if (Math.abs(bl[2] - want) > 1e-6) zBad++;
    }
  });
  check('every surface port has a lamp set', sets === PORTS.length, sets + ' of ' + PORTS.length);
  check('a lamp is lamp-sized (under 6 m on any port)', worstM < 6, 'largest ' + worstM.toFixed(1) + ' m');
  check('every lamp stands outside its hatch, not over it', inside === 0, inside + ' inside, ' + outside + ' outside');
  check('...and at its edge, not out over the town (within 1.5 mouths)', farthest < 1.5,
        'from ' + nearest.toFixed(2) + ' to ' + farthest.toFixed(2) + ' mouths out');
  check('and on the street it stands on (collar top procedural, z 0 modelled)', zBad === 0, zBad + ' off');
  check('every port\'s mouth is the one the lamp ring is built for', mouthsDiffer === 0,
        mouthsDiffer + ' ports with another mouth');
})();

console.log('--- A: the pad-rim lamps ---');
(function () {
  var worst = 0, n = 0;
  PORTS.forEach(function (e) {
    var p = e.p, d = p.dressing;
    if (!d) return;
    p._dressMesh = undefined; p._signBoards = undefined;
    var m = R.portDressingMesh(p);
    var lampCol = '!' + (d.padLight || '#ffb45c');
    for (var f = 0; f < m.f.length; f++) {
      if (m.c[f] !== lampCol) continue;
      var tri = m.f[f], lo = Infinity, hi = -Infinity;
      for (var k = 0; k < 3; k++) { lo = Math.min(lo, m.v[tri[k]][2]); hi = Math.max(hi, m.v[tri[k]][2]); }
      worst = Math.max(worst, (hi - lo) * p.radius * 1000); n++;
    }
  });
  check('pad-rim lamps are housings, not 9 m cubes', n > 0 && worst < 3.0, 'tallest ' + worst.toFixed(2) + ' m over ' + n + ' faces');
})();

console.log('--- A: the boards ---');
(function () {
  var boards = 0, onBlock = 0, posts = 0, wMax = 0, tMax = 0, lMin = Infinity, lMax = 0, floating = 0, lettered = 0, offBuilding = 0;
  PORTS.forEach(function (e) {
    var p = e.p; p._signBoards = undefined;
    var bs = R.portSignBoards(p), blocks = p.dressing.blocks;
    bs.forEach(function (b) {
      boards++;
      wMax = Math.max(wMax, b.wM); tMax = Math.max(tMax, b.tM);
      lMin = Math.min(lMin, b.letterM); lMax = Math.max(lMax, b.letterM);
      if (b.lines.join('').replace(/ /g, '').length > 0) lettered++;
      if (b.mount === 'post') { posts++; return; }
      onBlock++;
      var bl = blocks[b.block];
      var bx = Math.cos(bl.u) * bl.r, by = Math.sin(bl.u) * bl.r;
      /* On its building: the panel's centre over the block's footprint
       * (a wall board sits on the footprint's edge), and a roof board's
       * legs standing on that roof. */
      var dx = Math.abs(b.c[0] - bx), dy = Math.abs(b.c[1] - by);
      if (dx > bl.w / 2 + 0.003 || dy > bl.d / 2 + 0.003) offBuilding++;
      if (b.mount === 'roof' && (Math.abs(b.stand - bl.h) > 1e-9 || b.base < b.stand)) floating++;
    });
  });
  check('there are boards to check', boards > 20, boards + ' boards on ' + PORTS.length + ' ports');
  check('every board says something', lettered === boards);
  check('every board is on a building, where there is one', posts === 0, onBlock + ' on blocks, ' + posts + ' on posts');
  check('...over that building, not beside it', offBuilding === 0, offBuilding + ' off');
  check('...standing on its roof, not hovering', floating === 0, floating + ' hovering');
  check('sign-sized: no wider than 45 m, no taller than 14 m', wMax <= 45 && tMax <= 14 + 1e-9,
        'widest ' + wMax.toFixed(1) + ' m, tallest ' + tMax.toFixed(1) + ' m');
  check('letters between 1.6 and 4.5 m', lMin >= 1.6 - 1e-9 && lMax <= 4.5 + 1e-9,
        lMin.toFixed(2) + '..' + lMax.toFixed(2) + ' m');
  check('the role board breaks at its dash', R.signLines('REPROCESSING — WASTE ACCEPTED').join('/') === 'REPROCESSING/WASTE ACCEPTED');
  check('and & is spelled out, since the font has none',
        R.signLines('MILFUEL WORKS — WASTE & ISOTOPES ACCEPTED').join('/') === 'MILFUEL WORKS/WASTE AND/ISOTOPES/ACCEPTED',
        R.signLines('MILFUEL WORKS — WASTE & ISOTOPES ACCEPTED').join('/'));
  check('the same port gets the same boards',
        JSON.stringify(R.portSignBoards(PORTS[0].p)) === JSON.stringify((PORTS[0].p._signBoards = undefined, R.portSignBoards(PORTS[0].p))));
})();

console.log('--- A: boards read forwards ---');
(function () {
  /* Stand on the pad, look at the board, and ask the game's own camera
   * whether the text runs left to right. The frame is the port's real
   * ground basis, which is left-handed (east x north = -up) - the trap
   * that mirrored every board in the first build. */
  var e = PORTS[0], p = e.p, t = 1000;
  var gb = Sim.groundBasis(p, e.sys, t);
  var hand = V.dot(V.cross(gb.east, gb.north), gb.up);
  var bs = R.portSignBoards(p), ok = 0, n = 0;
  var km = p.radius;
  function W(c) {
    return V.add(gb.pos || gb.entrance.pos, V.add(V.scale(gb.east, c[0] * km),
                 V.add(V.scale(gb.north, c[1] * km), V.scale(gb.up, c[2] * km))));
  }
  bs.forEach(function (b) {
    var rt = R.signRight(b.n);
    var nW = V.norm(V.add(V.scale(gb.east, b.n[0]), V.scale(gb.north, b.n[1])));
    var centre = W(b.c);
    var eye = V.add(centre, V.scale(nW, km * 0.6));             // in front of the face
    var cam = new R.Camera();
    cam.buildFree(eye, V.scale(nW, -1), gb.up, 1280, 720);
    var a = cam.project(W([b.c[0] - rt[0] * b.w / 2, b.c[1] - rt[1] * b.w / 2, b.c[2]]));
    var z = cam.project(W([b.c[0] + rt[0] * b.w / 2, b.c[1] + rt[1] * b.w / 2, b.c[2]]));
    n++; if (a && z && z.x > a.x) ok++;
  });
  check('the ground frame is the left-handed one this was written for', Math.abs(hand + 1) < 1e-6, 'east x north . up = ' + hand.toFixed(3));
  check('every board\'s text runs left to right from the pad', n > 0 && ok === n, ok + ' of ' + n);
})();

console.log('--- B: ground detail, the field ---');
(function () {
  var GD = GL.GROUND_DETAIL;
  /* A patch of ground on a 5000 km world, body-fixed. */
  function patch(seed, span, foot, centre) {
    var c = centre || { x: 0.3, y: -0.5, z: 0.81 };
    var l = Math.hypot(c.x, c.y, c.z); c = { x: c.x / l, y: c.y / l, z: c.z / l };
    var lb = V.norm({ x: 0.5, y: 0.2, z: 0.84 });
    var e1 = V.norm(V.cross(c, { x: 0, y: 0, z: 1 })), e2 = V.cross(c, e1);
    var s = [0, 0, 0], sb = 0, sb2 = 0, n = 0, h = 0x2545f491;
    var vals = [];
    for (var i = 0; i < 6000; i++) {
      /* a fixed sequence, not Math.random: the suite is deterministic too */
      h = (Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) + 0x9e3779b9) >>> 0; var u = h / 4294967296 - 0.5;
      h = (Math.imul(h ^ (h >>> 13), 0x297a2d39) + 0x7f4a7c15) >>> 0; var v = h / 4294967296 - 0.5;
      var pr = V.scale(V.norm(V.add(V.scale(c, 5000), V.add(V.scale(e1, u * span), V.scale(e2, v * span)))), 5000);
      var nb = V.norm(pr);
      var anchor = [Math.round(pr.x / GD.cmax), Math.round(pr.y / GD.cmax), Math.round(pr.z / GD.cmax)];
      var d = GL.groundDetailAt(seed, pr, nb, anchor, foot);
      var tt = GL.groundDetailTintAt(d, nb, lb, 0);
      s[0] += tt[0]; s[1] += tt[1]; s[2] += tt[2];
      var lum = (tt[0] + tt[1] + tt[2]) / 3; sb += lum; sb2 += lum * lum; n++;
      if (i < 40) vals.push(d.bright.toFixed(5));
    }
    var mean = sb / n;
    return { mean: s.map(function (x) { return x / n; }), sd: Math.sqrt(Math.max(0, sb2 / n - mean * mean)), sig: vals.join(',') };
  }
  var a = patch(12.3, 400, 0.004), a2 = patch(12.3, 400, 0.004), b = patch(77.7, 400, 0.004);
  check('the same world gives the same ground', a.sig === a2.sig);
  check('another world gives other ground', a.sig !== b.sig);
  check('there is detail: the ground varies by more than 5% at 4 m a pixel (and under 15%: terrain, not a pattern)', a.sd > 0.05 && a.sd < 0.15, 'sd ' + a.sd.toFixed(3));
  var far = patch(12.3, 400, 3.0);
  check('and almost none once a cell is a pixel (8 km cells at 3 km a pixel)', far.sd < 0.02, 'sd ' + far.sd.toFixed(4));
  var dev = Math.max.apply(null, a.mean.map(function (m) { return Math.abs(m - 1); }));
  check('averaged over a 400 km patch it is the orbital colour to within 1.5%', dev < 0.015,
        'mean x ' + a.mean.map(function (m) { return m.toFixed(4); }).join(','));
  var dev2 = Math.max.apply(null, b.mean.map(function (m) { return Math.abs(m - 1); }));
  check('...on another world too', dev2 < 0.015, 'mean x ' + b.mean.map(function (m) { return m.toFixed(4); }).join(','));

  /* Re-anchoring: the same body-fixed point read from two anchors a few
   * cells apart must give the same answer exactly. */
  var p = { x: 2101.37, y: -3502.91, z: 2950.123 }, nb = V.norm(p), same = 0, N = 0;
  for (var k = -3; k <= 3; k++) {
    var a0 = [Math.round(p.x / GD.cmax) + k, Math.round(p.y / GD.cmax) - k, Math.round(p.z / GD.cmax) + 2 * k];
    var r0 = GL.groundDetailAt(5.5, p, nb, a0, 0.002), r1 = GL.groundDetailAt(5.5, p, nb, [a0[0] + 1, a0[1] + 1, a0[2] - 1], 0.002);
    N++; if (Math.abs(r0.bright - r1.bright) < 1e-9 && Math.abs(r0.slope[0] - r1.slope[0]) < 1e-9) same++;
  }
  check('the same ground whichever anchor reads it (no swim on re-anchoring)', same === N, same + ' of ' + N);

  /* The JS anchor: small offsets, an exact integer cell. */
  var b0 = { radius: 5000 }, sp = { ax: V.norm({ x: 0.1, y: -0.2, z: 0.97 }), phase: 2.2 };
  var rel = { x: -4000.123, y: 2999.5, z: 3.0 };      // eye -> centre, 1.5 km up-ish
  var L = Math.hypot(rel.x, rel.y, rel.z); rel = V.scale(rel, (5000 + 1.5) / L);
  var fr = GL.groundDetailFrame(b0, rel, sp);
  check('the anchor is near the eye (within a cell and a half)', V.len(fr.anchorRel) < GD.cmax * 1.5, V.len(fr.anchorRel).toFixed(2) + ' km');
  check('its cell is an exact integer index', fr.cell.every(function (c) { return c === Math.round(c); }));
  check('cq is the double-precision (d-R)(d+R)', Math.abs(fr.cq - 1.5 * (10001.5)) < 1e-6, fr.cq.toFixed(4));
  check('full strength near the ground', fr.on === 1);
  var hi = GL.groundDetailFrame(b0, V.scale(rel, (5000 + GD.altHi + 1) / (5001.5)), sp);
  check('and off entirely above ' + GD.altHi + ' km, where it costs nothing', hi.on === 0);
})();

console.log('--- B: octaves fade by the larger footprint ---');
(function () {
  /* Ground plane z = 0, normal +z. A camera at the origin looking along a
   * ray `el` degrees below the horizon, pointed straight at it. */
  function at(elDeg, t) {
    var e = elDeg * Math.PI / 180;
    var fwd = { x: Math.cos(e), y: 0, z: -Math.sin(e) };
    var right = { x: 0, y: -1, z: 0 };
    var up = { x: Math.sin(e), y: 0, z: Math.cos(e) };
    return GL.groundFootprint(fwd, { x: 0, y: 0, z: 1 }, t, right, up, fwd, 667);
  }
  var down = at(90, 2);
  check('looking straight down, a pixel is t / flen', Math.abs(down - 2 / 667) < 1e-9, (down * 1e6).toFixed(1) + ' mm');
  var g3 = at(3, 2), want = 2 / 667 / Math.sin(3 * Math.PI / 180), old = 2 / (667 * 0.12);
  check('at 3 degrees it is the stretched axis, t / (flen sin el)', Math.abs(g3 / want - 1) < 1e-6, (g3 * 1000).toFixed(2) + ' m');
  check('...not floored where the old isotropic estimate stopped growing', g3 > old * 2,
        'old ' + (old * 1000).toFixed(2) + ' m, now ' + (g3 * 1000).toFixed(2) + ' m');
  var src = GL.planetShaderSource();
  check('the shader takes the larger of the two axes', /float foot = max\(length\(dPx\), length\(dPy\)\);/.test(src));
})();

console.log('--- B: the shader carries it ---');
(function () {
  var src = GL.planetShaderSource();
  check('the planet shader has the ground-detail functions', /vec4 groundDetail\(/.test(src) && /vec3 groundDetailTint\(/.test(src));
  check('...computes it once per fragment', (src.match(/= uBanded > 0\.5 \? vec4\(0\.0\) : groundDetail\(/g) || []).length === 1);
  check('...feeds the elevation the coast is cut from', /elev \+= gd\.z;/.test(src));
  check('...and tints the settled ground before the clouds', src.indexOf('base *= groundDetailTint(gd, sea, base);') > src.indexOf('float cap = smoothstep') &&
        src.indexOf('base *= groundDetailTint(gd, sea, base);') < src.indexOf('float glow = 0.0;'));
  check('the shader and the twin agree on the octave count and coarsest cell',
        src.indexOf('k < ' + GL.GROUND_DETAIL.oct + ';') > 0 && src.indexOf('float c = ' + GL.GROUND_DETAIL.cmax.toFixed(6)) > 0);
  check('no Math.random anywhere in the ground detail', !/Math\.random/.test(GL.groundDetailAt.toString() + GL.groundDetailFrame.toString()));
})();

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
