/* gl.js — the WebGL2 world layer.
 *
 * WHAT THIS IS FOR, and what it deliberately is not.
 *
 * The game's original renderer is a software rasterizer on a 2D canvas:
 * painter's algorithm, one ctx.fill() and ctx.stroke() per triangle, planets
 * drawn as a flat arc with a radial gradient. Measured on the target laptop
 * (i5-8350U / UHD 620) it is genuinely fast — under 3.4 ms a frame at every
 * distance — so this file does not exist to make the game quicker. It exists
 * because that renderer cannot get BIGGER: every added triangle is more CPU
 * fill, and planets with real surfaces, weather and a lit limb are simply not
 * expressible as one gradient-filled circle.
 *
 * So this is a second canvas, sitting BEHIND the 2D one, that draws the
 * world. The cockpit, the MFDs, the HUD, every panel in screens.js and every
 * label stays exactly where it was, in 2D, on top. That split is the whole
 * architecture: pixels that want a GPU get one, text and instruments stay
 * somewhere text and instruments are easy.
 *
 * PLANETS ARE IMPOSTORS, not meshes.
 *
 * A sphere here can be four pixels across or wider than the screen, and it
 * sits anywhere from a hundred metres to several AU away. Tessellating that
 * means either a wastefully dense mesh or a visible silhouette polygon, and
 * putting it through a depth buffer across that range of distances means
 * fighting z-precision for the rest of the project's life.
 *
 * Instead each body is drawn as a single screen-space quad, and the sphere is
 * solved analytically in the fragment shader. This buys three things that all
 * matter more than they sound:
 *
 *   - The limb is exact at every zoom. No tessellation to choose, ever.
 *   - It reuses the EXISTING camera. Screen position and radius come from
 *     Camera.project() on the CPU, the same call the 2D layer uses, so the
 *     two layers cannot drift apart — a planet and the label pinned to it
 *     agree by construction rather than by two projections being kept in
 *     sync by hand.
 *   - No depth buffer and no projection matrix, so none of the precision
 *     problems either.
 *
 * The approximation being accepted is that the disc is orthographic: the
 * shader ignores the slight perspective foreshortening of a sphere's limb.
 * That error is invisible until a planet fills most of the view, and even
 * then it is smaller than the error in the flat gradient circle it replaces.
 */
(function (global) {
  'use strict';

  var GL = {};

  /* ---- shader sources --------------------------------------------------
   * Written inline rather than fetched: the game is served as plain files
   * with no build step, and a shader that arrives asynchronously is a first
   * frame that cannot draw. */

  var VERT_BODY = [
    '#version 300 es',
    'in vec2 aCorner;',                 // -1..1 unit quad
    'uniform vec2 uCenterPx;',          // disc centre, CSS pixels
    'uniform float uQuadPx;',           // half-size of the quad, CSS pixels
    'uniform vec2 uViewportPx;',
    'out vec2 vDisc;',                  // -1..1 across the quad
    'out vec2 vPx;',                    // this fragment, in CSS pixels
    'void main() {',
    '  vDisc = aCorner;',
    '  vec2 px = uCenterPx + aCorner * uQuadPx;',
    '  vPx = px;',
    /* Canvas pixels run y-down; clip space runs y-up. The flip lives here
     * so nothing downstream has to remember it. */
    '  vec2 ndc = vec2(px.x / uViewportPx.x * 2.0 - 1.0,',
    '                  1.0 - px.y / uViewportPx.y * 2.0);',
    '  gl_Position = vec4(ndc, 0.0, 1.0);',
    '}'
  ].join('\n');

  /* ---- THE GROUND SKY, in GLSL (2026-11-02, third round) ----------------
   * Shared by the sky pass (FRAG_SKY) and the planet pass's horizon haze,
   * and mirrored line for line by skyAt() in JS below, which is what the
   * test reads. Its own block so a change to the planet's own shading
   * merges round it. See the long note over skyAt for what it does. */
  var SKY_GLSL = [
    'uniform vec4 uSkyA;',        // tint rgb, air (0 = off)
    'uniform vec3 uSkyUp;',       // local vertical at the port
    'uniform vec3 uSkySun;',      // unit vector to the sun
    'vec3 groundSkyAt(vec3 rd) {',
    '  float sunUp = dot(uSkySun, uSkyUp);',
    '  float air = uSkyA.w;',
    '  float dayT = clamp((sunUp + 0.10) / 0.36, 0.0, 1.0);',
    '  float day = dayT * dayT * (3.0 - 2.0 * dayT);',
    '  float lit = day * min(1.0, air / 0.25);',
    '  float bright = air > 0.0 ? 0.32 + 0.68 * min(1.0, air / 0.6) : 0.0;',
    '  vec3 sc = mix(uSkyA.rgb, vec3(0.70, 0.83, 1.0), 0.62);',
    '  vec3 zen = sc * 0.58 * bright;',
    '  vec3 hor = mix(sc, vec3(1.0), 0.38) * bright * 1.04;',
    '  float e = dot(rd, uSkyUp);',
    '  vec3 col = mix(hor, zen, pow(clamp(e, 0.0, 1.0), 0.55));',
    '  float low = 1.0 - clamp(sunUp / 0.26, 0.0, 1.0);',
    '  vec3 sunH = uSkySun - uSkyUp * sunUp;',
    '  float toward = 0.5 + 0.5 * dot(normalize(rd - uSkyUp * e + 1e-6), normalize(sunH + 1e-6));',
    '  col = mix(col, vec3(1.0, 0.52, 0.28) * bright * 0.92, low * 0.62 * (1.0 - clamp(e * 2.0, 0.0, 1.0)) * toward);',
    '  col += vec3(1.0, 0.94, 0.82) * pow(max(0.0, dot(rd, uSkySun)), 80.0) * 0.55 * lit;',
    '  return mix(vec3(0.0157, 0.0235, 0.047), col, lit);',
    '}'
  ].join('\n');

  /* ---- THE PIT WALL, PER PIXEL (2026-11-02, fourth round) ----------------
   *
   * The wall round a ground port's cut used to be built in JS every time the
   * camera moved — about 10,000 quads from the cone, the strata traced
   * through them, the cells a bed's edge crossed split and blended — and it
   * cost 7 to 22 ms a frame while orbiting (measured in the probe, headless
   * Chrome, cloud box), on a CPU whose budget the trajectory predictor
   * already spends. A unit grid placed by a vertex shader was the first
   * answer; Astra pointed out that the orbital cutaway is already per pixel
   * (the keyhole discard in FRAG_MESH), and asked for the walls the same way.
   *
   * So there is no wall mesh at all. One full-screen pass casts each pixel's
   * view ray against the cone — narrow end round her, widening toward the
   * eye, held to a cylinder where main.js caps it — and where the ray leaves
   * the cone, that is the wall: shaded as rock, its depth written so the bay
   * and her composite against it. The eye sits on the cone's axis at its
   * wide end, so every ray that does not run out past her meets the wall
   * exactly once. Then, per pixel:
   *   - above the street, no wall: the pit's rim is the exact curve where the
   *     cone meets the ground;
   *   - in the bay's open air (the room and the shaft), no wall: the edge
   *     where the rock gives way to the room is a curve too. Those two were
   *     the cell-quantised sawtooth rim at Ashford from 0.2 and 0.6 km;
   *   - the beds come from the hit's depth under the street, dipped and
   *     folded, so their edges are curves rather than stair-steps.
   * The CPU's part is uniforms. GLWorld.wallHit and GLWorld.wallFrag are the
   * same arithmetic in JS, which is what the test reads. */
  /* LOOK B'S SCORCHED PLATE, one colour for every cut face that is not hot
   * (sixth round): the meshes' outer band, the street's, the lip's, and the
   * building's sliced wall filled in over the street (FRAG_WALL). Written
   * into each shader from here, so they cannot drift apart; GL.cutColour
   * hands the test the same numbers. */
  var CUT_SCORCHED = [0.16, 0.11, 0.085];
  var SCORCHED_GLSL = 'vec3(' + CUT_SCORCHED.join(', ') + ')';
  /* THE FOOTPRINT's two numbers, here because FRAG_WALL is written with
   * them: what stands a metre over the street is standing on it, and the
   * mask holds each texel's tallest surface as a fraction of half a
   * kilometre — two-metre steps in eight bits, taller held at the top. */
  var FOOT_MIN = 0.001;   // km
  var FOOT_TOP = 0.5;     // km
  var FRAG_WALL = [
    '#version 300 es',
    'precision highp float;',
    'in vec2 vDisc;',
    'in vec2 vPx;',
    'uniform vec3 uRight, uUp, uFwd;',
    'uniform vec2 uScreenPx;',
    'uniform float uFlen;',
    'uniform vec3 uWS;',          // her, relative to the eye, km
    'uniform vec3 uWR;',          // the cone's radius at her, at the eye, and its cap, km
    'uniform vec3 uWEnt;',        // the shaft mouth on the street, relative to the eye, km
    'uniform vec3 uWE, uWN, uWU;',// the ground frame: east, north, up
    'uniform vec4 uWRoomA;',      // room x0, x1, y0, y1, pad radii
    'uniform vec4 uWRoomB;',      // room z0, z1 (model z), lift, duct
    'uniform vec4 uWShip;',       // her x, y on the street, metres; pad radius km; seed
    'uniform vec4 uWFold;',       // dip x, dip y, fold phase 1, phase 2
    'uniform float uWPh3;',
    'uniform vec3 uSunDir;',
    'uniform float uNear, uInvLogRange;',
    /* ---- the burnt edge (2026-11-02, fifth round) --------------------- */
    'uniform vec4 uWPlanet;',     // the world's centre relative to the eye, km; its radius
    'uniform vec4 uWRim;',        // the cut-face band's colour, and its width as a fraction of the cone's radius
    /* ---- ONE EDGE WHERE A BUILDING STANDS (2026-11-02, sixth round) ---- */
    'uniform sampler2D uWMask;',  // the port's footprint on the street: its tallest surface there, / FOOT_TOP (streetFootprint)
    'uniform vec4 uWMaskB;',      // its centre east, north of the mouth, km; half its side, km; w = 1 when there is one
    'out vec4 frag;',
    'float whash(float a, float b) { return fract(sin(a * 12.9898 + b * 78.233) * 43758.5453); }',
    /* How tall the port's own cut meshes stand over a point (relative to
     * the eye, km) — a building, a shed, the city — in km, and 0 where
     * nothing does. The street's band and the lip's are left out where
     * something does: the building's own cut face is that place's edge.
     * See THE FOOTPRINT over FRAG_FOOT. */
    'float footH(vec3 rel) {',
    '  if (uWMaskB.w < 0.5) return 0.0;',
    '  vec3 q = rel - uWEnt;',
    '  vec2 uv = (vec2(dot(q, uWE), dot(q, uWN)) - uWMaskB.xy) / (2.0 * uWMaskB.z) + 0.5;',
    '  if (uv.x <= 0.0 || uv.y <= 0.0 || uv.x >= 1.0 || uv.y >= 1.0) return 0.0;',
    '  float h = texture(uWMask, uv).r * ' + FOOT_TOP.toFixed(4) + ';',
    '  return h >= ' + FOOT_MIN.toFixed(4) + ' ? h : 0.0;',
    '}',
    'void main() {',
    '  vec3 rd = normalize(uRight * (vPx.x - uScreenPx.x) + uUp * (uScreenPx.y - vPx.y) + uFwd * uFlen);',
    '  float L = length(uWS);',
    /* ---- THE BURNT EDGE IN THE STREET (fifth round) -------------------
     * Astra: "why is the ground port cutaway not have the glowing edge
     * effect?" The port's own meshes get the keyhole's cut-face band
     * (FRAG_MESH, look B: the inner 35% hot and fed to the glow pass, the
     * rest scorched plate), but the planet's surface was only discarded
     * inside the cone — so where the cut broke the street there was no
     * edge at all, and the buildings' rim stopped dead at the ground.
     *
     * The band is the SAME test: the ray meets the world's sphere (the
     * very surface the planet pass draws, so the two agree), and a hit
     * just outside the cone, within the band's width of it, is painted
     * the way FRAG_MESH paints a cut wall — with that shader's width rule
     * (a fraction uWRim.w of the cone's radius there), its 35% split, its
     * colour and its glow, and its rule that a surface lying ALONG the
     * line of sight gets no band. Written a hair nearer than the ground so
     * it wins the depth test against the planet's own fragment there.
     * A ray that meets the street INSIDE the cone carries on to the wall
     * below; one that meets it anywhere else is the planet's to draw.
     *
     * Here and not in the planet pass, though that is where the street is
     * cut: drawBodies writes with the glow mask turned off (a world is lit,
     * it does not glow), and the hot edge's whole look is that it feeds
     * the glow. This pass writes alpha, and it meets the sphere with the
     * planet pass's own arithmetic from the same float uniforms, so its
     * rounding is the planet's rounding and 0.05% nearer is enough to win.
     *
     * The width is the mesh band's as it now is — a plain fraction of the
     * cone's radius. FRAG_MESH's "THE BAND IS CAPPED" note describes a
     * uCutBand.x ceiling that look B (1248a7b, 2026-10-30) took out; were
     * it ever put back, it must go in here and on the lip too, or the
     * street's edge and a building's will part company at the corner. */
    '  vec3 a0 = uWS / max(L, 1e-9);',
    '  if (uWPlanet.w > 0.0) {',
    '    float pb = dot(rd, uWPlanet.xyz);',
    '    float pc = dot(uWPlanet.xyz, uWPlanet.xyz) - uWPlanet.w * uWPlanet.w;',
    '    float pdisc = pb * pb - pc;',
    '    if (pc > 0.0 && pdisc > 0.0) {',
    '      float ts = pb - sqrt(pdisc);',
    '      if (ts > 0.0) {',
    '        vec3 hs = rd * ts;',
    '        float tt = dot(hs, uWS) / max(L * L, 1e-12);',
    '        float rs = min(mix(uWR.y, uWR.x, tt), uWR.z);',
    '        vec3 offs = hs - uWS * tt;',
    '        float ds = length(offs);',
    '        bool inCone = tt > 0.0 && tt < 1.0 && ds < rs;',
    '        if (!inCone) {',
    '          vec3 ns = normalize(hs - uWPlanet.xyz);',
    /* UNDER A BUILDING (sixth round) the street's band is not drawn: the
     * building's is the edge, and the street's, seen through the cut-away
     * building just inside it, was a second orange line with a dark strip
     * between. What IS seen there, between the hole and the building's
     * band, is the building's own sliced wall from above — the cone's
     * surface running down through it from its roof to the street. Left as
     * street it read as a ledge (the coordinator, on the first cut of
     * this), so it is painted as what it is: look B's scorched plate,
     * glowing nothing. The hot third stays where the building has it, at
     * its top edge, on the roof's own cut; together they are one wider
     * burnt edge where a building stands.
     *
     * Which street points: under the footprint, where the ray, back up at
     * the height the building stands there, was inside the cone — so the
     * building was cut away along this line of sight. Anywhere else under
     * a building (the street under an overhang, seen from the side) is not
     * a cut face and is left to the planet. GLWorld.streetBand is this in JS. */
    '          float fh = footH(hs);',
    '          if (fh > 0.0) {',
    '            float dn = -dot(rd, uWU);',
    '            if (dn > 1e-4) {',
    /* Back up the ray to the roof's height — or most of the way to the
     * eye, when the eye is lower than the roof and the ray comes in
     * through the building's side. */
    '              vec3 pt = hs - rd * min(fh / dn, ts * 0.99);',
    '              float t2 = dot(pt, uWS) / max(L * L, 1e-12);',
    '              float r2 = min(mix(uWR.y, uWR.x, t2), uWR.z);',
    '              if (t2 > 0.0 && t2 < 1.0 && length(pt - uWS * t2) < r2) {',
    '                frag = vec4(' + SCORCHED_GLSL + ', 0.0);',
    '                float sd2 = dot(hs, uFwd) * 0.9995;',
    '                gl_FragDepth = clamp(log2(max(uNear, sd2) / uNear) * uInvLogRange, 0.0, 1.0);',
    '                return;',
    '              }',
    '            }',
    '            discard;',
    '          }',
    '          if (tt > 0.0 && tt < 1.0 && ds < rs * (1.0 + uWRim.w) &&',
    '              abs(dot(ns, offs / max(ds, 1e-9))) < 0.8) {',
    '            float ru = (ds - rs) / (rs * uWRim.w);',
    '            frag = ru < 0.35 ? vec4(uWRim.rgb, 0.85) : vec4(' + SCORCHED_GLSL + ', 0.0);',
    '            float sd = dot(hs, uFwd) * 0.9995;',
    '            gl_FragDepth = clamp(log2(max(uNear, sd) / uNear) * uInvLogRange, 0.0, 1.0);',
    '            return;',
    '          }',
    '          discard;',
    '        }',
    '      }',
    '    }',
    '  }',
    /* The ray against the cone. x is along the axis from the eye toward her,
     * c the cosine between ray and axis; the radius at x is rEye + k x, held
     * to the cap. Near the eye it is the cylinder (where the cone would be
     * wider than the cap), then the cone, out to her. */
    '  vec3 a = a0;',
    '  float c = dot(rd, a);',
    '  if (c <= 0.0) discard;',
    '  float sn = sqrt(max(0.0, 1.0 - c * c));',
    '  float k = (uWR.x - uWR.y) / max(L, 1e-9);',
    '  float cap = min(uWR.z, uWR.y);',
    '  float xc = k < 0.0 ? max(0.0, (uWR.y - cap) / -k) : 0.0;',
    '  float t = sn > 1e-6 ? cap / sn : 1e30;',
    '  bool cyl = t * c <= xc;',
    '  if (!cyl) {',
    '    float den = sn - k * c;',
    '    if (den <= 1e-9) discard;',
    '    t = uWR.y / den;',
    '  }',
    '  if (t * c >= L) discard;',
    '  vec3 vRel = rd * t;',
    '  vec3 radial = vRel - a * (t * c);',
    '  radial /= max(length(radial), 1e-9);',
    '  vec3 vNrm = cyl ? radial : normalize(radial - a * k);',
    '  vec3 q = vRel - uWEnt;',
    '  float hm = dot(q, uWU) * 1000.0;',                 // metres above the street
    '  if (hm > 0.0) discard;',
    '  float r = uWShip.z;',
    '  float lx = dot(q, uWE) / r, ly = dot(q, uWN) / r, lz = hm * 0.001 / r;',
    '  float mz = lz - uWRoomB.z;',
    '  if (lx > uWRoomA.x && lx < uWRoomA.y && ly > uWRoomA.z && ly < uWRoomA.w &&',
    '      mz > uWRoomB.x && mz < uWRoomB.y) discard;',
    '  if (abs(lx) < uWRoomB.w && abs(ly) < uWRoomB.w && mz >= uWRoomB.y) discard;',
    /* The beds: dipped and folded together, eased in below the street. */
    '  float xm = lx * r * 1000.0, ym = ly * r * 1000.0;',
    '  float ease = min(1.0, -hm / 40.0);',
    '  float kw = 6.28318530718 / 140.0;',
    '  float fold = 0.6 * sin(xm * kw + uWFold.z) * cos(ym * kw * 0.83 + uWFold.w) +',
    '               0.4 * sin((xm * 0.61 - ym * 0.79) * kw * 1.7 + uWPh3);',
    '  float d = -(hm - ((xm - uWShip.x) * uWFold.x + (ym - uWShip.y) * uWFold.y + fold * 22.0) * ease);',
    '  vec3 base; float bed;',
    '  if (d < 0.35) { base = vec3(0.169, 0.176, 0.192); bed = 0.0; }',
    '  else if (d < 0.60) { base = vec3(0.553, 0.565, 0.588); bed = 1.0; }',
    '  else if (d < 1.80) { base = vec3(0.651, 0.635, 0.604); bed = 2.0; }',
    '  else if (d < 3.40) { base = vec3(0.247, 0.227, 0.208); bed = 3.0; }',
    '  else if (d < 6.40) { base = vec3(0.420, 0.325, 0.220); bed = 4.0; }',
    '  else {',
    '    float dd = d - 6.4;',
    '    float B13 = 5.0 * (pow(1.22, 13.0) - 1.0) / 0.22;',
    '    float i = dd < B13 ? floor(log(1.0 + dd * 0.044) / log(1.22)) : 13.0 + floor((dd - B13) / 60.0);',
    '    base = mod(i, 2.0) < 0.5 ? vec3(0.310, 0.290, 0.267) : vec3(0.357, 0.337, 0.306);',
    '    bed = 5.0 + i;',
    '  }',
    '  float light = 0.86 + 0.28 * whash(uWShip.w, bed);',
    '  float warm = (whash(uWShip.w + 7.0, bed) - 0.5) * 0.07;',
    '  base = clamp(base * light + vec3(warm, 0.0, -warm), 0.0, 1.0);',
    '  vec3 n = normalize(vNrm);',
    '  if (dot(n, -vRel) < 0.0) n = -n;',
    '  float lam = max(0.0, dot(n, uSunDir));',
    '  frag = vec4(base * (0.26 + 0.70 * lam), 0.0);',
    /* AND DOWN THE WALL'S LIP (fifth round): the same band, the same width
     * in metres as the street's beside it — the cone's radius here times
     * the band fraction — run down from the street, hot at the top where
     * it meets the street's hot edge, scorched below, then the beds. So
     * the rim reads as one burnt edge round the hole, street and rock. */
    '  float rh = cyl ? cap : (uWR.y + k * t * c);',
    '  float lipM = rh * uWRim.w * 1000.0;',
    /* (Sixth round.) Under a building there is no hot top: the street
     * above it is the building's sliced wall, scorched, and the lip carries
     * that on down the same width before the rock. Left as rock there, the
     * wall's top beds showed instead — the dark one 0.35 m deep, then a
     * pale one 0.25 m deep, a pixel or less from 1.4 km — and that pale bed
     * was the broken light line along the strip's inner seam. */
    '  if (-hm < lipM) {',
    '    float lu = -hm / max(lipM, 1e-6);',
    '    frag = (lu < 0.35 && footH(vRel) == 0.0) ? vec4(uWRim.rgb, 0.85) : vec4(' + SCORCHED_GLSL + ', 0.0);',
    '  }',
    '  float depth = dot(vRel, uFwd);',
    '  gl_FragDepth = clamp(log2(max(uNear, depth) / uNear) * uInvLogRange, 0.0, 1.0);',
    '}'
  ].join('\n');

  /* ---- THE FOOTPRINT (2026-11-02, sixth round) ----------------------------
   * What FRAG_WALL's footH reads: the port's cut meshes seen straight
   * down, into a small mask in the ground frame. Each mesh the cut was on
   * this frame is drawn again with its own buffers, flattened onto the
   * street, and a fragment survives only where the surface stands above
   * the street (FOOT_MIN) — so a roof marks its building, a wall that is
   * a line from above marks nothing on its own, and the shaft, the hangar
   * and anything else under the ground mark nothing at all. The height is
   * over the world's SPHERE (the street the planet pass draws), by the
   * flat frame's height plus d^2/2R, and each texel keeps the TALLEST
   * surface over it (MAX blending), which is how high the building's cut
   * face runs there. The vertex stage is built once the
   * mesh program has linked, at its aPos location, because these are the
   * mesh pass's own vertex arrays. */
  function vertFootSrc(loc) {
    return [
      '#version 300 es',
      'layout(location = ' + loc + ') in vec3 aPos;',
      'uniform vec3 uFOff;',     // the mesh's origin east, north, up of the mouth, km
      'uniform mat3 uFRot;',     // its axes in east, north, up
      'uniform float uFScale;',
      'uniform vec3 uFBox;',     // the mask's centre east, north, km; half its side, km
      'uniform float uFCurv;',   // 1 / 2R, per km
      'out float vH;',
      'void main() {',
      '  vec3 g = uFOff + uFRot * (aPos * uFScale);',
      '  vH = g.z + dot(g.xy, g.xy) * uFCurv;',
      '  gl_Position = vec4((g.xy - uFBox.xy) / uFBox.z, 0.0, 1.0);',
      '}'
    ].join('\n');
  }
  var FRAG_FOOT = [
    '#version 300 es',
    'precision highp float;',
    'in float vH;',
    'uniform float uFMin;',
    'out vec4 frag;',
    'void main() {',
    '  if (vH < uFMin) discard;',
    /* Its height, kept by MAX blending: the texel holds its tallest
     * surface, the roof, which is where the cut face starts down from. */
    '  frag = vec4(clamp(vH / ' + FOOT_TOP.toFixed(4) + ', 0.0, 1.0));',
    '}'
  ].join('\n');

  var FRAG_SKY = [
    '#version 300 es',
    'precision highp float;',
    'in vec2 vDisc;',
    'in vec2 vPx;',
    'uniform vec3 uRight, uUp, uFwd;',
    'uniform vec2 uScreenPx;',
    'uniform float uFlen;',
    SKY_GLSL,
    'out vec4 frag;',
    'void main() {',
    '  vec3 rd = normalize(uRight * (vPx.x - uScreenPx.x) + uUp * (uScreenPx.y - vPx.y) + uFwd * uFlen);',
    '  frag = vec4(groundSkyAt(rd), 0.0);',
    '}'
  ].join('\n');

  /* ---- GROUND DETAIL: what the surface looks like from a few km up -------
   * (2026-11-02)
   *
   * Astra, zoomed out over Downwell: the ground is "one flat colour". It
   * was. The terrain field below is looked up at 2.6 cycles per world
   * radius, so its finest octave is a couple of hundred kilometres across
   * — from eight kilometres up the whole view lies inside one cell of it,
   * and the screen was flat orange with a speck of port in it. That field
   * is right for what it is for (coastlines from orbit); nothing was
   * drawing the scales in between.
   *
   * WHAT THIS ADDS. A body-fixed fractal field from 8 km cells down to
   * 8 m, eleven octaves of value noise each half the last, used three
   * ways: brightness and a warm/cool hue drift (mottling — soil, rock,
   * dust), a nudge to the elevation the sea and the ice caps are cut from
   * (so a coast seen from low down is crinkled, not a blur), and RELIEF —
   * the field's own analytic gradient taken as slope and lit by the sun,
   * so the ground has hills that face toward the light and away from it.
   *
   * IT DOES NOT CHANGE THE PICTURE FROM ORBIT, by construction rather than
   * by tuning. Every term is zero-mean (a multiplier of 1 + something
   * centred on 0, a relief that is linear in a slope centred on 0), so
   * averaged over any patch the colour is exactly the colour without it;
   * and each octave fades out as its cells shrink below a few pixels, so
   * by the time the camera is high enough that a cell is sub-pixel there
   * is nothing left of it to alias. Above GD.altHi the whole block is
   * skipped. Descending, detail grows in octave by octave out of the
   * colour that was already there: no pop.
   *
   * PRECISION IS THE REASON FOR ITS SHAPE. A world here is thousands of km
   * across and a cell is 8 m; in single precision a body-fixed position on
   * the surface is good to about half a metre, and the hash would be
   * hashing rounding error. So the field is evaluated on an INTEGER
   * lattice: JS picks an anchor near the eye, snapped to a multiple of the
   * coarsest cell in the world's body-fixed frame, and hands over its
   * lattice index (uGdAnchorCell, exact) and its offset from the eye
   * (uGdAnchorRel, small, subtracted in double). The shader works in the
   * small offset from that anchor and adds the anchor's index back as an
   * integer — shifted left by the octave, since every finer cell size is
   * the coarsest halved. The anchor can therefore move wherever it likes:
   * the field it describes is the same absolute field, cell for cell, and
   * re-anchoring cannot make the ground swim. GL.groundDetailAt is the
   * same arithmetic in JS and test/render.test.js holds it to that.
   *
   * And the ray. `bq - sqrt(disc)` loses everything below about half a
   * metre to cancellation at these radii; uGdCq is |eye-centre|^2 - R^2
   * computed in double as (d - R)(d + R), and the near root is taken as
   * cq / (bq + sqrt(disc)), which has no cancellation in it at all.
   *
   * SEEDED. The hash is salted with the world's own uSeed (Weather.hashSeed
   * of the body id) and nothing else: no Math.random, no draw from any
   * stream, so the same world has the same hills every visit and adding
   * this changed no other seed.
   *
   * TWO DIMENSIONS, CUBE-MAPPED. The field is 2D value noise on whichever
   * body-fixed plane the ground faces (a cube-map projection), blended with
   * the next plane across the seams between faces. Half the lookups of 3D
   * noise, and the projection keeps the integer lattice intact — dropping
   * a coordinate drops it from the anchor's index too.
   *
   * COST. Only fragments of the ground pay: four cheap hashes and a
   * bilinear blend per octave, and octaves stop at the first one finer
   * than a few pixels, so a pixel far off pays for three or four and one
   * under the ship for at most eleven (twice that in the seam band). Off
   * entirely above GD.altHi. See CHANGELOG for what was measured. */
  var GD = {
    cmax: 8.0,          // km — the coarsest cell; every other is this halved
    oct: 11,            // 8 km .. 7.8 m
    fadeLo: 2.0,        // an octave is gone when its cell is under this many pixels...
    fadeHi: 6.0,        // ...and fully in above this many
    gain: 0.80,         // amplitude, octave to octave (brightness/hue)
    /* SLOPE IS WHAT STREAKED (2026-11-02, third pass), measured by
     * switching each term off at Downwell 0.6 km: relief off, the diagonal
     * smears were gone; brightness off, they stayed. A slope lit by one sun
     * is the field's derivative along the sun's azimuth, and the derivative
     * of isotropic noise along one axis is a pattern drawn out across that
     * axis: embossing, which foreshortening at an oblique view then lays
     * over into diagonal streaks. Two changes: the slope's spectrum falls
     * off fast (relief is the big hills, not the gravel), and a slope
     * octave fades out at `slopeFade` times the footprint a brightness
     * octave does, because a derivative carries its octave's energy at a
     * higher frequency and aliases sooner. */
    slopeGain: 0.78,    // slope, octave to octave
    slopeFade: 2.5,
    bright: 0.90,       // brightness mottle at full strength (x the normalised field)
    hue: 0.35,          // warm/cool drift, coarse octaves only
    hueOct: 4,          // ...the first this many
    elev: 0.020,        // nudge to the elevation field, for the coast and caps
    relief: 0.16,       // slope at the coarsest octave, per unit gradient
    /* Shading clamps, and a cap on the brightness swing, at every range.
     * Without them the ground read as a pattern laid over the planet
     * rather than as terrain (Astra's coordinator, of the Downwell Downport
     * ice and Low Deep's band at 8 km: "camouflage"). */
    reliefMin: 0.80,
    reliefMax: 1.22,
    swing: 0.25,        // |brightness multiplier - 1| never exceeds this
    /* BRIGHT GROUND IS SUBTLE. Snow, ice and salt vary as faint blue-grey
     * shading, not as dark blotches: above `snowLo` luminance the detail is
     * scaled down to `snowAmp` of itself by `snowHi`, and what is left of
     * the darkening is turned cool. */
    snowLo: 0.55, snowHi: 0.85, snowAmp: 0.30,
    /* The floor under the sun term the relief is divided by. Lambert says
     * divide by n.l, and at a low sun that is a large gain: at 0.25 the
     * relief on Ashford Undercroft's moon (sun 9 degrees up) was four times
     * its noon contrast and clamped at both ends, so the ground read as
     * black-and-cream camouflage. Physically a low sun does throw long
     * shadows; this field has no shadows to throw, only slope, and slope
     * alone exaggerated that far looks like a fault, not a sunset. */
    reliefSun: 0.5,
    altLo: 40,          // km above the surface: full strength below...
    altHi: 140,         // ...and none at all above
    seam: 0.04          // cube-face blend band, in |n| difference
  };
  /* The normaliser that keeps the mottle's range independent of how many
   * octaves happen to be in: the sum of every octave's amplitude. */
  GD.norm = (1 - Math.pow(GD.gain, GD.oct)) / (1 - GD.gain);
  /* EACH OCTAVE TURNED BY ITS OWN ANGLE. Every octave on the same axis-
   * aligned lattice adds its lattice's own directional bias to the last,
   * and on a cube-map face seen obliquely that summed into diagonal streaks
   * across the whole view — brushed metal, or rain, not ground (Downwell,
   * 0.6 to 8 km). Turning octave k by k golden angles (137.5 degrees,
   * irrational against the lattice) leaves no two sharing an axis. The
   * anchor still lands exactly: JS turns the anchor's position by the same
   * angle in double precision and splits it into an integer cell and a
   * fraction per face and octave (uGdCell, uGdFrac), so the rotated
   * lattice is still the same absolute lattice from any anchor. */
  GD.rot = [];
  for (var gk = 0; gk < GD.oct; gk++) {
    var ga = 0.31 + gk * 2.39996323;
    GD.rot.push([Math.cos(ga), Math.sin(ga)]);
  }

  function gdFloat(v) { return v.toFixed(6); }
  /* ---- THE SEA AT A SEA PLATFORM (2026-11-02) ---------------------------
   *
   * Astra wants domes over the pads "to protect ships and their cargo from
   * the waves" - so near a platform the sea has to visibly HAVE waves, and
   * they have to break on the columns. Kept to this block, GL.setSeaPort
   * and the three marked lines in the planet shader, so it stays out of
   * the way of the haze, sky and ground-detail work in this file.
   *
   * WHAT IT IS: a swell of four long-crested trains (64, 41, 23 and 13 m,
   * deep-water speeds, about 1.2 m of amplitude between them) in a disc
   * SEA_WAVE_KM round the port, evaluated per fragment on the planet's own
   * sphere. It tilts the normal the sun is shaded with and puts a sun
   * glint on the slopes; it lifts the DEPTH the sea writes by the wave
   * height, so the water line climbs and drops on every column and trestle
   * (the rig's meshes are depth-tested against it); and it paints foam in
   * a ring round each of them, thicker as a crest passes. Whitecaps on the
   * highest crests. Each train fades out by its own wavelength with
   * distance, so nothing shimmers at the edge of the disc or from 2 km up.
   *
   * WHAT IT IS NOT: an ocean simulation. Nothing is integrated and nothing
   * is stored; it is a closed function of where and of sim time, so the
   * same second is the same sea. And the rig does NOT move with it - see
   * render.js, the platform is a semi-submersible and is meant to be still.
   *
   * COST: on the CPU, a handful of uniforms per frame while a platform is
   * within SEA_UPLOAD_KM (setSeaPort; the post list is built once per
   * port). On the GPU, the four sines everywhere in the disc, and the post
   * loop (fifty-six at most; the rig has fifty-two) only within the rig's own reach. */
  var SEA_WAVE_KM = 2.5;      // radius of the swell round a platform
  var SEA_POSTS = 56;            // and literally 56 in SEA_GLSL and its uniform: GLSL wants a constant. The rig has 52.
  var SEA_GLSL = [
    /* Height (km) and slope of the swell at p (km, port frame), sea time t
     * (s), seen from `dist` km away. */
    'vec3 seaSwell(vec2 p, float t, float dist) {',
    '  vec3 acc = vec3(0.0);',
    '  vec4 lam = vec4(64.0, 41.0, 23.0, 13.0);',      // metres
    '  vec4 amp = vec4(0.55, 0.36, 0.20, 0.10);',      // metres
    '  vec4 ang = vec4(0.35, 1.25, -0.55, 2.30);',
    '  vec2 pm = p * 1000.0;',
    '  for (int i = 0; i < 4; i++) {',
    '    float L = lam[i], k = 6.2831853 / L, w = sqrt(9.81 * k);',
    '    vec2 d = vec2(cos(ang[i]), sin(ang[i]));',
    /* Gone by the time a crest is a few pixels: past that it is a moire. */
    '    float fade = 1.0 - smoothstep(L * 8.0, L * 30.0, dist * 1000.0);',
    '    float ph = k * dot(d, pm) - w * t + float(i) * 1.7;',
    '    float a = amp[i] * fade;',
    '    acc.x += a * sin(ph);',
    '    acc.yz += a * k * cos(ph) * d;',
    '  }',
    '  acc.x *= 0.001;',                               // metres -> km
    '  return acc;',
    '}',
    /* x: height (km), yz: slope along uSeaE, uSeaN, w: foam 0..1 - or all
     * zero away from a platform. `hit` is eye-relative, km. */
    'vec4 seaWaves(vec3 hit, float tHit) {',
    '  if (uSeaRel.w <= 0.0) return vec4(0.0);',
    '  vec3 q = hit - uSeaRel.xyz;',
    '  vec2 lp = vec2(dot(q, uSeaE), dot(q, uSeaN));',
    '  float r = length(lp);',
    '  if (r > uSeaRel.w) return vec4(0.0);',
    '  float edge = 1.0 - smoothstep(uSeaRel.w * 0.55, uSeaRel.w, r);',
    '  vec3 sw = seaSwell(lp, uSeaK.x, tHit) * edge * uSeaK.z;',
    '  float foam = 0.0;',
    '  if (r < uSeaK.w) {',
    '    for (int i = 0; i < 56; i++) {',
    '      vec4 po = uSeaPost[i];',
    '      if (po.z <= 0.0) break;',
    /* ROUND, not the column's square: a wash spreads from a column as a
     * ring, and a square halo read from mid-distance as an outline drawn
     * round each one (2026-11-02). Its edge is torn by `tear` below. */
    '      vec2 rel0 = lp - po.xy;',
    '      float e = (length(rel0) - po.z * 1.15) * 1000.0;',  // metres off the column, roughly
    '      float crest = sw.x * 1000.0;',
    '      if (e > 9.0) continue;',
    '      float ring = 1.0 - smoothstep(-1.0, 3.5 + 3.0 * max(0.0, crest), e);',
    /* Breaking: brightest as a crest arrives, ebbing between, and torn up
     * by a little noise round the column so it is spray, not a halo. */
    '      float wash = 0.45 + 0.55 * smoothstep(-0.2, 0.6, crest);',
    '      float az = atan(rel0.y, rel0.x);',
    '      float tear = clamp(0.5 + 0.5 * sin(az * 7.0 + e * 1.3 - uSeaK.x * 1.7 + po.x * 4000.0)',
    '                       * sin(az * 3.0 - uSeaK.x * 0.9 + po.y * 3000.0) + 0.25, 0.0, 1.0);',
    '      foam = max(foam, ring * wash * tear);',
    '    }',
    '  }',
    /* Whitecaps: the highest crests break on their own. */
    '  float cap = smoothstep(0.95, 1.25, sw.x * 1000.0) * (1.0 - smoothstep(0.4, 1.6, tHit));',
    '  foam = max(foam, cap * 0.6);',
    '  return vec4(sw.x, sw.y, sw.z, foam * edge);',
    '}',
    /* The sea's colour under the swell: the slope-tilted normal for the
     * sun, a glint, and the foam. `sea` is the shader's own sea mask, so
     * a coast in the disc keeps its land. */
    /* THE GLINT, TONED (2026-11-02, second round). Looking toward a low sun
     * it was a large white patch, blown out: a wide lobe (power 140, half
     * width ~6 degrees), at full strength whatever the sun's height, added
     * on top of the water and clipped. Now:
     *   - a tight lobe (power 900, ~2 degrees): the sun's image on the
     *     water, broken up by the swell's slopes into sparkle, not a sheet;
     *   - Fresnel: water reflects 2% looking straight down and most of the
     *     light at grazing, which is where a low sun's glitter path is;
     *   - the sun's light through the air: its path is about 1/sin(height)
     *     atmospheres long, so a low sun is dimmer and redder in its own
     *     reflection, and below the horizon it has none;
     *   - and screened onto the water, never added: it approaches white
     *     without ever passing it, so nothing clips. */
    'vec3 seaShade(vec3 col, vec3 base, vec3 n, vec3 rd, float sea, vec4 sw) {',
    '  if (uSeaRel.w <= 0.0 || sea < 0.01) return col;',
    '  vec3 n2 = normalize(n - (sw.y * uSeaE + sw.z * uSeaN));',
    '  float l2 = smoothstep(-0.14, 0.30, dot(n2, uSunDir));',
    '  vec3 c2 = base * (0.055 + 0.95 * l2);',
    '  float mu = dot(n, uSunDir);',                       // sine of the sun's height over the flat sea
    '  float tr = mu > 0.0 ? exp(-0.10 / max(mu, 0.015)) : 0.0;',
    '  vec3 sunC = vec3(1.0, 0.96, 0.88) * mix(vec3(1.0, 0.62, 0.38), vec3(1.0), smoothstep(0.02, 0.45, mu));',
    '  float fres = 0.02 + 0.98 * pow(1.0 - max(0.0, -dot(rd, n2)), 5.0);',
    '  float g = pow(max(0.0, dot(reflect(rd, n2), uSunDir)), 900.0) * (0.15 + 0.85 * fres) * tr;',
    '  vec3 hl = sunC * min(g * 2.2, 0.85);',
    '  c2 = 1.0 - (1.0 - c2) * (1.0 - hl);',
    '  c2 = mix(c2, vec3(0.88, 0.93, 0.96) * (0.12 + 0.88 * l2), clamp(sw.w, 0.0, 1.0));',
    '  return mix(col, c2, sea);',
    '}'
  ].join('\n');

  var GROUND_DETAIL_GLSL = [
    'uniform float uGdOn;',         // 0..1 strength by altitude; 0 skips the block
    'uniform vec3 uGdAnchorRel;',   // eye -> lattice anchor, km
    'uniform ivec2 uGdCell[' + (3 * GD.oct) + '];', // per face and octave: the turned anchor's cell...
    'uniform vec2 uGdFrac[' + (3 * GD.oct) + '];',  // ...and its fraction of one
    'const vec2 GD_ROT[' + GD.oct + '] = vec2[' + GD.oct + '](' + GD.rot.map(function (r) {
      return 'vec2(' + r[0].toFixed(7) + ', ' + r[1].toFixed(7) + ')'; }).join(', ') + ');',
    'uniform float uGdCq;',         // |eye - centre|^2 - R^2, in double
    /* A lattice corner's value. The integer index is folded to 0..1023
     * first, which is exact in a float, and then hashed with the cheap
     * fract hash the rest of this shader uses: the field repeats every 1024
     * cells of an octave — 8 km for the finest, 8,000 km for the coarsest —
     * which, under ten coarser octaves that do not repeat with it, is not a
     * thing anyone can see. An integer-multiply hash was the first version
     * and cost several times as much on GCN, where a 32-bit multiply runs
     * at a quarter rate. */
    'float gdH(ivec2 c, float s) {',
    '  vec3 p = fract(vec3(vec2(c & 1023), s) * vec3(0.1031, 0.1030, 0.0973));',
    '  p += dot(p, p.yzx + 33.33);',
    '  return fract((p.x + p.y) * p.z);',
    '}',
    /* 2D value noise with its analytic gradient (per cell): the slope costs
     * no extra lookups. */
    'vec3 gdNoise(ivec2 i, vec2 f, float s) {',
    '  vec2 u = f * f * (3.0 - 2.0 * f), du = 6.0 * f * (1.0 - f);',
    '  float a = gdH(i, s), b = gdH(i + ivec2(1, 0), s), c = gdH(i + ivec2(0, 1), s), d = gdH(i + ivec2(1, 1), s);',
    '  float k1 = b - a, k2 = c - a, k3 = a - b - c + d;',
    '  return vec3(a + k1 * u.x + k2 * u.y + k3 * u.x * u.y,',
    '              du * vec2(k1 + k3 * u.y, k2 + k3 * u.x));',
    '}',
    /* One plane of the field: brightness, hue, and the slope in the
     * plane's two axes. `ax` picks the plane (0: y,z  1: z,x  2: x,y), the
     * cube-map projection, so the lattice stays the body-fixed one and the
     * anchor's integer index carries straight over. */
    'vec4 gdPlane(vec2 q, int face, float foot, float seed) {',
    '  float c = ' + gdFloat(GD.cmax) + ', amp = 1.0, samp = ' + gdFloat(GD.relief) + ';',
    '  float br = 0.0, hu = 0.0;',
    '  vec2 sl = vec2(0.0);',
    '  for (int k = 0; k < ' + GD.oct + '; k++) {',
    '    float w = smoothstep(' + gdFloat(GD.fadeLo) + ' * foot, ' + gdFloat(GD.fadeHi) + ' * foot, c);',
    '    if (w <= 0.0) break;',
    '    vec2 cs = GD_ROT[k];',
    '    int ix = face * ' + GD.oct + ' + k;',
    '    vec2 x = vec2(cs.x * q.x - cs.y * q.y, cs.y * q.x + cs.x * q.y) / c + uGdFrac[ix];',
    '    vec2 fl = floor(x);',
    '    vec3 nz = gdNoise(uGdCell[ix] + ivec2(fl), x - fl, seed + float(k) * 7.31);',
    '    nz.yz = vec2(cs.x * nz.y + cs.y * nz.z, -cs.y * nz.y + cs.x * nz.z);',
    '    float v = (nz.x - 0.5) * w * amp;',
    '    br += v;',
    '    if (k < ' + GD.hueOct + ') hu += v;',
    '    float ws = smoothstep(' + gdFloat(GD.fadeLo * GD.slopeFade) + ' * foot, ' + gdFloat(GD.fadeHi * GD.slopeFade) + ' * foot, c);',
    '    sl += nz.yz * (ws * samp);',
    '    c *= 0.5; amp *= ' + gdFloat(GD.gain) + '; samp *= ' + gdFloat(GD.slopeGain) + ';',
    '  }',
    '  return vec4(br, hu, sl);',
    '}',
    'vec2 gdPick(vec3 v, int ax) { return ax == 0 ? v.yz : ax == 1 ? v.zx : v.xy; }',
    'vec3 gdLift(vec2 g, int ax) { return ax == 0 ? vec3(0.0, g) : ax == 1 ? vec3(g.y, 0.0, g.x) : vec3(g, 0.0); }',
    /* x: brightness (zero-mean), y: hue (zero-mean), z: elevation nudge,
     * w: relief (zero-mean, already divided by the sun term). All zero
     * when the block is off. */
    'vec4 groundDetail(vec3 rd, vec3 n, float bq, float disc) {',
    '  if (uGdOn <= 0.0) return vec4(0.0);',
    '  float t = uGdCq / (bq + sqrt(max(disc, 0.0)));',
    '  vec3 qb = spinAbout(rd * t - uGdAnchorRel, uSpinAxis, -uSpinPhase);',
    '  vec3 nb = spinAbout(n, uSpinAxis, -uSpinPhase);',
    '  vec3 lb = spinAbout(uSunDir, uSpinAxis, -uSpinPhase);',
    /* GROUND PER PIXEL, ALONG THE STEEPER SCREEN AXIS (2026-11-02, third
     * pass). The first estimate was isotropic, t / (flen * cos), with the
     * cosine floored at 0.12 — so within seven degrees of the horizon it
     * stopped growing, and everywhere it was only an approximation of the
     * footprint along the view-tilted axis. Fine octaves outlived the pixel
     * that way and aliased into horizontal smears in the upper half of the
     * frame (Downwell, 0.6 and 2 km). Now each pixel's footprint is taken
     * from ray differentials: how far the hit on the local tangent plane
     * moves for one pixel right and one pixel down, exactly, and the LARGER
     * of the two decides when an octave fades. Analytic rather than dFdx /
     * dFdy because main() has already returned early for some pixels of a
     * quad by here (the hole, the limb), and screen derivatives in non-
     * uniform control flow are undefined. GLWorld.groundFootprint is the
     * same arithmetic in JS. */
    '  float fz = dot(rd, uFwd) / uFlen;',
    '  vec3 dRx = (uRight - rd * dot(rd, uRight)) * fz;',
    '  vec3 dRy = -(uUp - rd * dot(rd, uUp)) * fz;',
    '  float rn = dot(rd, n);',
    '  rn = rn < 0.0 ? min(rn, -0.004) : max(rn, 0.004);',
    '  vec3 dPx = t * (dRx - rd * (dot(dRx, n) / rn));',
    '  vec3 dPy = t * (dRy - rd * (dot(dRy, n) / rn));',
    '  float foot = max(length(dPx), length(dPy));',
    '  float seed = fract(uSeed * 0.61803) * 89.0;',
    /* The cube face this ground faces, and the next one. Across the seam
     * between two faces the two projections are blended over a narrow
     * band, which is the only place a pixel pays for both. */
    '  vec3 an = abs(nb);',
    '  int a0 = an.x >= an.y && an.x >= an.z ? 0 : (an.y >= an.z ? 1 : 2);',
    '  float m0 = a0 == 0 ? an.x : a0 == 1 ? an.y : an.z;',
    '  int a1 = a0 == 0 ? (an.y >= an.z ? 1 : 2) : a0 == 1 ? (an.x >= an.z ? 0 : 2) : (an.x >= an.y ? 0 : 1);',
    '  float m1 = a1 == 0 ? an.x : a1 == 1 ? an.y : an.z;',
    '  float wb = smoothstep(0.0, ' + gdFloat(GD.seam) + ', m0 - m1);',
    '  vec4 p0 = gdPlane(gdPick(qb, a0), a0, foot, seed);',
    '  vec3 slope = gdLift(p0.zw, a0);',
    '  vec2 bh = p0.xy;',
    '  if (wb < 1.0) {',
    '    vec4 p1 = gdPlane(gdPick(qb, a1), a1, foot, seed);',
    '    bh = mix(p1.xy, bh, wb);',
    '    slope = mix(gdLift(p1.zw, a1), slope, wb);',
    '  }',
    '  bh /= ' + gdFloat(GD.norm) + ';',
    '  slope -= nb * dot(slope, nb);',
    '  float rel = -dot(slope, lb) / max(dot(nb, lb), ' + gdFloat(GD.reliefSun) + ');',
    '  return vec4(bh.x, bh.y, bh.x * ' + gdFloat(GD.elev) + ', rel) * uGdOn;',
    '}',
    /* The albedo multiplier, applied once the ground's colour is settled
     * (seas, ice, twilight zones) and before the cloud deck covers it. The
     * sea takes almost none of it: water is flat, and mottled water reads
     * as more land in a different colour (the terrain block says the same
     * about its own relief). */
    'vec3 groundDetailTint(vec4 gd, float sea, vec3 base) {',
    '  float snow = smoothstep(' + gdFloat(GD.snowLo) + ', ' + gdFloat(GD.snowHi) + ', dot(base, vec3(0.30, 0.50, 0.20)));',
    '  float k = (1.0 - 0.85 * sea) * mix(1.0, ' + gdFloat(GD.snowAmp) + ', snow);',
    /* SOFT limits, not clamps: a clamp turns every swing past it into a
     * flat plateau with a hard edge, which on screen was a field of
     * bright, sharp-edged flakes. x A / (A + |x|) approaches A smoothly. */
    '  float bx = ' + gdFloat(GD.bright) + ' * gd.x * k;',
    '  float m = 1.0 + bx * ' + gdFloat(GD.swing) + ' / (' + gdFloat(GD.swing) + ' + abs(bx));',
    '  vec3 tint = vec3(1.0) + vec3(0.55, 0.05, -0.50) * (' + gdFloat(GD.hue) + ' * gd.y * k * (1.0 - snow));',
    '  float rx = gd.w * k, ra = rx < 0.0 ? ' + gdFloat(1 - GD.reliefMin) + ' : ' + gdFloat(GD.reliefMax - 1) + ';',
    '  float r = 1.0 + rx * ra / (ra + abs(rx));',
    '  float mr = m * r;',
    /* Snow's shading is cool: where it darkens, it darkens toward blue. */
    '  vec3 cool = vec3(1.0) + vec3(-0.50, -0.20, 0.35) * ((1.0 - mr) * snow);',
    '  return tint * cool * mr;',
    '}'
  ].join('\n');

  /* ---- BIOMES, the GLSL half (2026-11-02) -------------------------------
   * Weather.BIOME and Weather.biomeAt are the reasoning and the numbers;
   * this is the same arithmetic, built FROM that table at load so a
   * constant cannot be nudged in one language and not the other
   * (test/biomes.test.js checks the built source against the table). gl.js
   * loaded on its own (the hull viewer) has no Weather, and gets a stub
   * that returns the world's own colour, which is what every world looked
   * like before. */
  var BIOME_GLSL = (function () {
    var W = global.Weather, B = W && W.BIOME;
    var f = function (v) { return (+v).toFixed(5); };
    var v3 = function (c) { return 'vec3(' + f(c[0]) + ', ' + f(c[1]) + ', ' + f(c[2]) + ')'; };
    var head = 'uniform vec4 uBio;';     // x: mix, y: moisture bias, z: warmth, w: marsh
    if (!B) return [head, 'vec3 biomeColour(vec3 sp, vec3 n, float elev, float ndl, float gdx) { return uColor; }'].join('\n');
    var cells = [];
    for (var i = 0; i < 4; i++) for (var j = 0; j < 3; j++) cells.push(v3(B.grid[i][j]));
    return [
      head,
      'const vec3 BIOME_GRID[12] = vec3[12](' + cells.join(', ') + ');',
      'vec3 biomeCell(int i, int j) { return BIOME_GRID[i * 3 + j]; }',
      'vec3 biomeGrid(float t, float m) {',
      '  float ti = clamp(t, 0.0, 1.0) * 3.0, mi = clamp(m, 0.0, 1.0) * 2.0;',
      '  int i0 = min(2, int(floor(ti))), j0 = min(1, int(floor(mi)));',
      '  float ft = ti - float(i0), fm = mi - float(j0);',
      '  vec3 a = mix(biomeCell(i0, j0), biomeCell(i0, j0 + 1), fm);',
      '  vec3 b = mix(biomeCell(i0 + 1, j0), biomeCell(i0 + 1, j0 + 1), fm);',
      '  return mix(a, b, ft);',
      '}',
      /* `sp` is the terrain block's body-fixed lookup (n * 2.6 + uSeed);
       * `gdx` the ground detail's brightness term, so biome edges are
       * ragged at ground scale too (zero from orbit). */
      'vec3 biomeColour(vec3 sp, vec3 n, float elev, float ndl, float gdx) {',
      '  float lat = abs(dot(n, uSpinAxis));',
      '  float h = elev - uOcean;',
      '  float hN = max(0.0, elev - ' + f(B.mountLo) + ') / ' + f(B.mountSpan) + ';',
      '  float t = (uBand > 0.5 && uBand < 1.5) ? ' + f(B.ringT) + ' + ' + f(B.ringSlope) + ' * (ndl - 0.15)',
      '          : uBio.z + ' + f(B.equator) + ' - ' + f(B.pole) + ' * lat * lat;',
      '  t -= ' + f(B.lapse) + ' * hN;',
      '  vec3 mp = (sp - uSeed) * ' + f(B.moistScale) + ' + uSeed + ' + f(B.moistOffset) + ';',
      '  float mn = clamp(0.5 + (fbm(mp) - 0.47) * 3.2, 0.0, 1.0);',
      '  float coastW = 1.0 - smoothstep(0.0, ' + f(B.coast) + ', h);',
      '  float m = clamp(' + f(B.coastWet) + ' * coastW + ' + f(B.noiseWet) + ' * (mn - 0.5) + 0.40 + uBio.y + gdx * 0.25, 0.0, 1.0);',
      '  vec3 rp = (sp - uSeed) * ' + f(B.ridgeScale) + ' + uSeed + 3.7;',
      '  float rn = 0.67 * vnoise(rp) + 0.33 * vnoise((sp - uSeed) * ' + f(B.ridgeScale * 2.1) + ' + uSeed + 3.7);',
      '  float hR = hN + ' + f(B.ridgeAmp) + ' * ((1.0 - abs(2.0 * rn - 1.0)) - ' + f(B.ridgeMid) + ');',
      '  vec3 col = biomeGrid(t, m);',
      '  float wetW = (1.0 - smoothstep(0.0, 0.02, h)) * smoothstep(0.55, 0.75, m) * smoothstep(0.20, 0.35, t) * uBio.w;',
      '  col = mix(col, ' + v3(B.wet) + ', wetW);',
      '  float rockW = smoothstep(0.35, 0.70, hR);',
      '  col = mix(col, mix(col * ' + f(B.rockDark) + ', ' + v3(B.rock) + ', ' + f(B.rockGrey) + '), rockW);',
      '  float snowW = max(smoothstep(0.95, 1.25, hR) * (1.0 - smoothstep(0.25, 0.45, t)),',
      '                    1.0 - smoothstep(' + f(B.snowT - 0.12) + ', ' + f(B.snowT) + ', t));',
      '  col = mix(col, ' + v3(B.snow) + ', snowW);',
      '  float wl = max(dot(uColor, vec3(1.0 / 3.0)), 0.05);',
      '  vec3 tinted = col * (vec3(1.0) + (uColor / wl - vec3(1.0)) * ' + f(B.tint) + ');',
      '  return mix(uColor, tinted, uBio.x);',
      '}'
    ].join('\n');
  })();

  var FRAG_BODY = [
    '#version 300 es',
    'precision highp float;',
    'precision highp int;',
    'in vec2 vDisc;',
    'in vec2 vPx;',
    /* A TRUE ray-sphere impostor, not an orthographic disc.
     *
     * The first version projected the body's centre and radius on the CPU
     * and shaded a flat disc of that size. That is exact enough from orbit
     * and completely wrong up close: standing a kilometre above a
     * seven-thousand-kilometre world, the planet should fill the view, but
     * a disc sized by projected radius covers a few hundred pixels and
     * everything else stays empty sky. It showed up the moment starports
     * became holes you descend into — the underground structure was
     * plainly visible against black, with no planet to hide behind.
     *
     * So each fragment now rebuilds its own view ray from the camera basis
     * and intersects the sphere analytically. Correct silhouette at every
     * range, correct depth, and no approximation left to break. */
    'uniform vec3 uCenterRel;',   // eye -> body centre, km, double-subtracted in JS
    'uniform vec3 uHoleRel;',     // eye -> a shaft mouth on this body, km
    'uniform float uHoleR;',      // its radius, km; 0 disables the cut
    'uniform float uHoleDepth;',  // km down to the pit floor; 0 = open to space
    /* The sea at a platform (SEA_GLSL, GL.setSeaPort). */
    'uniform vec4 uSeaRel;',      // eye -> the platform on the sea, km; w = swell radius, 0 = none
    'uniform vec3 uSeaE, uSeaN;', // the port frame along the sea
    'uniform vec4 uSeaK;',        // sea time s, lift the depth (1/0), amplitude scale, post reach km
    'uniform vec4 uSeaPost[56];',   // columns: x, y, half-width (km); z 0 ends the list
    'uniform float uHaloPush;',   // km behind the centre the halo sits; a ring's outer radius
    /* The ground-port cone — see GL.setGroundCone. */
    'uniform vec4 uConeS;',       // eye -> ship, km; w = 1 when on
    'uniform vec3 uConeR;',       // radius at the ship, at the eye, and the most it may be, km
    /* The ground sky, for the horizon haze (groundHaze). */
    SKY_GLSL,
    /* AERIAL PERSPECTIVE (2026-11-02, third round): the ground fades into
     * the horizon's own sky colour with distance through the air. Only for
     * the world the ground sky is over (uSkyA.w > 0); the planet seen from
     * space is untouched. Its own function so a change to the ground's
     * shading above it merges round it.
     *
     * FIFTH ROUND, two fixes the coordinator found at Downwell:
     *   - THE SEAM. The haze went toward a colour a shade darker than the
     *     sky (0.86 of it) and never all the way (0.92), and the planet's
     *     limb halo laid a thin bright orange line on top, so the horizon
     *     was a hard line with a band on it. Now the haze goes all the way
     *     to groundSkyAt along the horizontal, which IS the sky's colour at
     *     the horizon, and the halo is left out for this world (the sky
     *     pass replaces it): ground and sky meet in one colour.
     *   - TOO MUCH HAZE FROM ABOVE. It grew with straight distance through
     *     air of the same thickness everywhere, so 8 km straight down was as
     *     hazy as 8 km along the ground and the frame washed pink. Now it is
     *     the optical depth of the path through an atmosphere that thins
     *     with height (scale height HAZE_H, 6 km): a path that starts high
     *     and runs down is mostly thin air, a path along the ground is all
     *     thick air. `h0` is the eye's height over the sphere. */
    'vec3 groundHaze(vec3 col, vec3 rd, float dist, float h0, float R) {',
    '  if (uSkyA.w <= 0.0) return col;',
    '  vec3 flat_ = normalize(rd - uSkyUp * dot(rd, uSkyUp) + 1e-6);',
    '  float H = 6.0;',
    '  float od = h0 > 0.01 ? dist * H * (1.0 - exp(-h0 / H)) / h0 : dist;',
    '  float f = 1.0 - exp(-od * uSkyA.w * 0.03);',
    /* And all the way at the horizon itself, however low the eye: a ray
     * that only just meets the ground is the horizon, and the horizon is
     * where ground and sky are one colour. Over the last five degrees
     * ABOVE THE TRUE HORIZON, which from height sits below the horizontal
     * by the dip (sine sqrt(h(2R+h))/(R+h): 0.4 degrees at 43 m, 2.9 at
     * 8 km). Measured from the horizontal, as the first cut of this was,
     * the forcing at the real horizon fell to 0.84 from 1.3 km up and the
     * optical depth had to make up the rest — 0.96, a faint line. From
     * the dip it is exactly 1 there at every height. */
    '  float dip = h0 > 0.0 ? sqrt(h0 * (2.0 * R + h0)) / (R + h0) : 0.0;',
    '  f = max(f, 1.0 - smoothstep(dip, dip + 0.08, -dot(rd, uSkyUp)));',
    '  return mix(col, groundSkyAt(flat_), f);',
    '}',
    /* The ground-port section box — see GL.setGroundCut. */
    'uniform vec4 uBoxO;',        // eye -> ship, km; w = 1 when on
    'uniform vec3 uBoxA, uBoxB, uBoxU;',
    'uniform vec4 uBoxD;',        // along min, along max, half width, floor
    'uniform float uBoxTop;',     // ceiling (1e9 = none)
    'uniform vec2 uScreenPx;',    // the camera's principal point (cx, cy)
    'uniform float uFlen;',
    'uniform float uPad;',        // quad half-size measured in body radii (>1)
    'uniform vec3 uRight;',       // camera basis, world space
    'uniform vec3 uUp;',
    'uniform vec3 uFwd;',
    'uniform vec3 uSunDir;',      // unit, body -> star
    'uniform vec3 uColor;',
    'uniform float uIsStar;',
    'uniform float uAtmo;',       // 0..1 how much air
    'uniform vec3 uAtmoColor;',
    'uniform float uCloud;',      // 0..1 coverage
    'uniform float uOcean;',      // sea level, 0 = no sea at all
    'uniform vec3 uSeaColor;',
    'uniform float uIce;',        // how far the caps reach, 0 = none
    'uniform float uSeed;',
    'uniform float uBanded;',     // 1 = gas/ice giant: latitude bands, not terrain
    'uniform float uBand;',       // twilight world: 1 = terminator ring, 2 = equator band
    /* THE WORLD'S OWN SPIN, not a made-up one.
     *
     * This used to be a single `uSpin` that scrolled at a fixed rate about
     * world +y: clouds at one speed, terrain at 0.15 of it, ice caps pinned
     * to the y poles. All three were fictions. The generator gives every
     * planet a real rotation — a period between nine and ninety hours, an
     * axial tilt, a phase — and sim.js turns surface ports around it. So a
     * pad on the ground moved while the continents under it did not, and
     * the caps sat wherever world +y happened to point.
     *
     * uSpinAxis is that axis in world coordinates and uSpinPhase is how far
     * round the body has turned. Rotating the noise lookup BACKWARD by the
     * phase nails the field to the body, so the world turns at its own day
     * length and a port keeps the same coastline under it.
     *
     * uDeckPhase is the cloud deck's own angle — it super-rotates, so
     * weather slides over the ground instead of being painted on it — and
     * uWeather walks the noise field itself, which is what makes a cloud
     * bank build and break up rather than merely come round again. */
    'uniform vec3 uSpinAxis;',
    'uniform float uSpinPhase;',
    'uniform float uDeckPhase;',
    'uniform float uBandPhase;',
    'uniform float uShearPhase;',
    'uniform float uWeather;',
    /* STORMS. The cloud field on its own is uniform — thicker or thinner,
     * but with nowhere in particular for anything to HAPPEN. A second,
     * much coarser field picks out cells, and a cell is an address: it is
     * where the tops are bright, where the base is dark, and where the
     * lightning is.
     *
     * The flash needs no state and no particles. A cell is a cube of the
     * coarse lookup; a bucket is a slice of time; hashing the two together
     * decides whether that cell fires in that bucket, and the fraction
     * through the bucket shapes the stroke. Pure function of place and
     * time, like everything else here, so a storm you fly back to is the
     * same storm.
     *
     * The bucket arrives as a SALT, not as a number. Feeding a bucket
     * index straight into the hash was the obvious version and it does
     * not survive single precision: the hash multiplies its input by
     * 0.318 and takes the fraction, so by a few thousand buckets the
     * input's own grid spacing swamps the fraction and every cell starts
     * agreeing with its neighbours. Hashed in JS, where doubles are free,
     * and handed over as three small numbers, it stays a hash forever.
     * The phase comes separately for the same reason — it is the shape of
     * the stroke and has to be exact. */
    'uniform vec3 uStormSalt;',
    /* The slot before this one, so a stroke that started late in it can
     * finish rather than being cut off at the boundary. */
    'uniform vec3 uStormSaltPrev;',
    /* Four slow co-prime rhythms: the storm's own waxing and waning. */
    'uniform vec4 uStormSlow;',
    'uniform float uStormPhase;',
    'uniform float uFlashGain;',
    /* Depth, so a ship can pass behind a planet. The impostor has no
     * geometry to rasterize a depth from, so it computes one: the disc's
     * centre distance minus how far the sphere bulges toward the camera at
     * this pixel. Same logarithmic encoding the mesh pass uses, or the two
     * would not compare. */
    'uniform float uCenterDepth;',
    'uniform float uWorldRadius;',
    'uniform float uNear, uInvLogRange;',
    'out vec4 frag;',
    'float encodeDepth(float d) {',
    '  return clamp(log2(max(uNear, d) / uNear) * uInvLogRange, 0.0, 1.0);',
    '}',

    /* Hash-based 3D value noise. Cheap, no texture, and stable for a given
     * seed — which matters, because a world's weather has to be the same
     * weather every time you visit it. */
    'float hash13(vec3 p) {',
    '  p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));',
    '  p += dot(p, p.yzx + 19.19);',
    '  return fract((p.x + p.y) * p.z);',
    '}',
    'float vnoise(vec3 x) {',
    '  vec3 i = floor(x), f = fract(x);',
    '  f = f * f * (3.0 - 2.0 * f);',
    '  float n000 = hash13(i + vec3(0,0,0)), n100 = hash13(i + vec3(1,0,0));',
    '  float n010 = hash13(i + vec3(0,1,0)), n110 = hash13(i + vec3(1,1,0));',
    '  float n001 = hash13(i + vec3(0,0,1)), n101 = hash13(i + vec3(1,0,1));',
    '  float n011 = hash13(i + vec3(0,1,1)), n111 = hash13(i + vec3(1,1,1));',
    '  return mix(mix(mix(n000,n100,f.x), mix(n010,n110,f.x), f.y),',
    '             mix(mix(n001,n101,f.x), mix(n011,n111,f.x), f.y), f.z);',
    '}',
    'float fbm(vec3 p) {',
    '  float s = 0.0, a = 0.5;',
    '  for (int i = 0; i < 4; i++) { s += a * vnoise(p); p *= 2.03; a *= 0.5; }',
    '  return s;',
    '}',
    /* Rotate about an arbitrary unit axis — Rodrigues, four lines. spinY
     * only ever turned about world +y, which is not where any of these
     * worlds actually keep their poles. */
    'vec3 spinAbout(vec3 v, vec3 k, float a) {',
    '  float c = cos(a), s = sin(a);',
    '  return v * c + cross(k, v) * s + k * (dot(k, v) * (1.0 - c));',
    '}',
    /* Near-ground detail, in its own functions: see GD above. */
    GROUND_DETAIL_GLSL,
    SEA_GLSL,
    /* Biomes: see BIOME_GLSL above and Weather.BIOME. */
    BIOME_GLSL,

    'void main() {',
    /* The view ray for this pixel, in world axes, from the eye. */
    '  vec3 rd = normalize(uRight * (vPx.x - uScreenPx.x)',
    '                    + uUp    * (uScreenPx.y - vPx.y)',
    '                    + uFwd   * uFlen);',
    '  vec3 oc = uCenterRel;',
    '  float bq = dot(rd, oc);',
    '  float cq = dot(oc, oc) - uWorldRadius * uWorldRadius;',
    '  float disc = bq * bq - cq;',
    /* How far off-axis this ray passes, in body radii — the perspective
     * replacement for the old flat disc coordinate. 1.0 is the silhouette. */
    '  float perp = sqrt(max(0.0, dot(oc, oc) - bq * bq));',
    '  float r = perp / uWorldRadius;',
    '  if (r > uPad) discard;',
    /* Behind us: nothing to draw. */
    '  if (bq <= 0.0 && cq > 0.0) discard;',
    /* INSIDE the body (cq < 0). The near root is behind the eye, so the
     * old code shaded the far side of the world as if it were the near
     * side and filled the screen with a grey slab — which is what you
     * saw from inside a starport hangar. A world you are inside is not a
     * sphere you can see; it is the rock around a room, and the room is
     * drawn by the port's own mesh. So draw nothing, and let the hangar
     * and the shaft's opening to the sky be the whole of the view. */
    '  if (cq < 0.0) discard;',
    '  vec2 d = vec2(0.0);',
    '  if (r > 0.0001) {',
    /* Direction of the off-axis offset, expressed in the same screen-ish
     * axes the old code used, so the cloud and terrain fields below carry
     * on working unchanged. */
    '    vec3 perpDir = normalize(rd * bq - oc);',
    '    d = vec2(dot(perpDir, uRight), -dot(perpDir, uUp)) * r;',
    '  }',

    /* ---- a star: emissive, no lighting, plus a corona in the padding ---- */
    '  if (uIsStar > 0.5) {',
    '    if (r <= 1.0) {',
    '      float lim = sqrt(max(0.0, 1.0 - r * r));',
    '      vec3 c = mix(uColor, vec3(1.0), pow(lim, 1.6) * 0.85);',
    '      gl_FragDepth = encodeDepth(dot(oc, uFwd) - lim * uWorldRadius);',
    '      frag = vec4(c, 1.0);',
    '    } else {',
    '      float g = exp(-(r - 1.0) * 2.2) * 0.55;',
    '      gl_FragDepth = encodeDepth(dot(oc, uFwd));',
    '      frag = vec4(uColor * g, g);',
    '    }',
    '    return;',
    '  }',

    /* ---- the lit limb, outside the disc -------------------------------- */
    '  if (r > 1.0) {',
    '    if (uAtmo <= 0.0) discard;',
    /* Not under the ground sky (fifth round): from the ground the sky
     * pass is the air, and the limb halo was a bright line on the horizon. */
    '    if (uSkyA.w > 0.0) discard;',
    /* Normal at the silhouette in this direction: z = 0, so the normal lies
     * in the screen plane. Whether the halo is bright here is decided by the
     * same sun term the surface uses, which is what makes the glow a
     * crescent on a half-lit world instead of a uniform ring. */
    '    vec3 nl = normalize(uRight * d.x - uUp * d.y);',
    '    float lam = max(0.0, dot(nl, uSunDir));',
    '    float fall = exp(-(r - 1.0) / (0.055 + 0.10 * uAtmo));',
    '    float a = fall * uAtmo * (0.16 + 0.84 * lam);',
    /* The halo sits at the body's own distance rather than at the limb it
     * surrounds — near enough, and it keeps the glow from being punched
     * through by anything at the same range.
     *
     * A RINGED world pushes it back by the ring's outer radius. The halo
     * reaches 1.22 radii and the ring starts at about 1.1, so a halo written
     * at the centre's depth hid the far side of the ring just past the limb
     * — a dark band between the disc and the ring behind it. Behind the
     * back of the ring, nothing of the ring can fail against it. */
    '    gl_FragDepth = encodeDepth(dot(oc, uFwd) + uHaloPush);',
    '    frag = vec4(uAtmoColor * a, a);',
    '    return;',
    '  }',

    /* ---- the surface ---------------------------------------------------- */
    /* The real intersection. `z` survives only as the limb term the haze
     * and terminator want — the geometry itself now comes from the ray. */
    '  float z = sqrt(max(0.0, 1.0 - r * r));',
    '  float tHit = bq - sqrt(max(0.0, disc));',
    '  vec3 hit = rd * tHit;',
    /* THE HOLE UNDER A STARPORT.
     *
     * A shaft mouth is a hole in the ground, and the ground here is one
     * analytic sphere with no hole in it — so from outside, the planet's
     * own surface is drawn straight across the opening and the shaft you
     * are supposed to fly down is a painted-on circle. Cutting the sphere
     * where the mouth is costs one distance test: any fragment whose
     * surface hit lands inside the mouth is simply not ground.
     *
     * One hole at a time. You can only be at one port, and the moment two
     * would be on screen at once they are both far enough away that the
     * mouth is sub-pixel anyway. */
    /* AND THE HOLE HAS A BOTTOM (2026-11-02). Cut and left at that, a
     * ray through the mouth went on into nothing and the frame's clear
     * colour showed through — black, with stars in it: from above an open
     * pad on Astra's zoom-out sheet, a black disc in the ground round the
     * port with the sky visible through the planet. A sphere has no inside
     * to draw, so the pit is given a floor: the plane uHoleDepth below the
     * mouth, square to the local vertical, in the colour of the section's
     * own rock. The port's model stands in the pit in front of it and wins
     * the depth test; only the gaps between its walls see the floor. */
    /* AND WALLS (second round). A floor alone read from the air as a flat
     * grey disc round the port. So the ray goes on down the hole and stops
     * at whichever it meets first: the hole's own round wall — a cylinder
     * of the hole's radius on the local vertical — or the floor. The wall
     * is the section's rock, in the same beds as the cone's pit wall
     * (Render.sectionBands: a fill course, then beds thickening by 1.22
     * each from 5 m), lit by the sun on its inward face. */
    '  if (uHoleR > 0.0 && distance(hit, uHoleRel) < uHoleR) {',
    '    if (uHoleDepth <= 0.0) discard;',
    '    vec3 hn = normalize(uHoleRel - oc);',
    '    vec3 p0 = uHoleRel - hn * uHoleDepth;',
    '    float dn = dot(rd, hn);',
    '    float tp = dn < -1e-6 ? dot(p0, hn) / dn : 1e30;',
    '    vec3 rp = rd - hn * dn;',
    '    vec3 op = -uHoleRel - hn * dot(-uHoleRel, hn);',
    '    float ca = dot(rp, rp), cb = 2.0 * dot(rp, op), cc = dot(op, op) - uHoleR * uHoleR;',
    '    float cd = cb * cb - 4.0 * ca * cc;',
    '    float tw = (ca > 1e-12 && cd >= 0.0) ? (-cb + sqrt(cd)) / (2.0 * ca) : 1e30;',
    '    if (tw < tHit) tw = 1e30;',
    '    if (min(tw, tp) >= 1e29 || min(tw, tp) <= 0.0) discard;',
    '    vec3 pc;',
    '    if (tw < tp) {',
    '      pc = rd * tw;',
    '      vec3 q = pc - uHoleRel;',
    '      float dep = -dot(q, hn) * 1000.0;',      // metres down the wall
    '      vec3 wn = -normalize(q - hn * dot(q, hn));',
    '      float bed = floor(log(1.0 + max(0.0, dep - 6.4) * 0.044) / log(1.22));',
    '      vec3 rock = mod(bed, 2.0) < 0.5 ? vec3(0.31, 0.29, 0.267) : vec3(0.357, 0.337, 0.306);',
    '      if (dep < 6.4) rock = vec3(0.42, 0.325, 0.22);',
    '      frag = vec4(rock * (0.40 + 0.55 * max(0.0, dot(wn, uSunDir))), 1.0);',
    '    } else {',
    '      pc = rd * tp;',
    '      frag = vec4(0.20, 0.185, 0.17, 1.0);',
    '    }',
    '    gl_FragDepth = encodeDepth(dot(pc, uFwd));',
    '    return;',
    '  }',
    /* AND THE CONE (2026-11-02, second round). Astra: the pit walls
     * "should appear along the cone drawn from the center of the radial
     * camera out to the edge of the screen". The ground goes where the
     * cone between the eye and her crosses it, and only there: the same
     * keyhole the mesh shader cuts the port with, so the hole in the street
     * and the hole in the buildings are one hole. GLWorld.coneCuts is this
     * line in JS, for the test. */
    '  if (uConeS.w > 0.5) {',
    '    float cL2 = max(dot(uConeS.xyz, uConeS.xyz), 1e-12);',
    '    float ct = dot(hit, uConeS.xyz) / cL2;',
    '    if (ct > 0.0 && ct < 1.0 && length(hit - uConeS.xyz * ct) < min(mix(uConeR.y, uConeR.x, ct), uConeR.z)) discard;',
    '  }',
    /* And the section, when the camera has been pulled up out of a ground
     * port: the street over the hangar is not there. */
    '  if (uBoxO.w > 0.5) {',
    '    vec3 bq = hit - uBoxO.xyz;',
    '    float ba = dot(bq, uBoxA), bb = dot(bq, uBoxB), bz = dot(bq, uBoxU);',
    '    if (ba > uBoxD.x && ba < uBoxD.y && abs(bb) < uBoxD.z && bz > uBoxD.w && bz < uBoxTop) discard;',
    '  }',
    /* SEA: the swell, and its height lifting the depth the sea writes. */
    '  vec4 seaW = seaWaves(hit, tHit);',
    '  gl_FragDepth = encodeDepth(dot(hit + normalize(hit - oc) * seaW.x * uSeaK.y, uFwd));',
    '  vec3 n = normalize(hit - oc);',
    '  float ndl = dot(n, uSunDir);',
    /* A soft terminator. A hard max(0.0, ndl) gives a knife edge that reads
     * as a rendering artefact rather than as a sunrise. */
    '  float lam = smoothstep(-0.14, 0.30, ndl);',
    /* Ground detail (GD): computed once here, spent in two places below. */
    '  vec4 gd = uBanded > 0.5 ? vec4(0.0) : groundDetail(rd, n, bq, disc);',

    /* ---- gas / ice giants: latitude bands, not terrain ------------------
     * A gas giant has no surface and no coastline; what you see is zonal
     * banding — stripes of cloud parallel to the equator, each sheared at
     * its own speed, with the classic storm oval drifting against them. So
     * a banded world takes a completely different path from the terrain
     * below and returns early. Latitude is n.y (the world spins about +y
     * here, the same axis the ice caps use). Bands are fbm in latitude,
     * warped a little in longitude so edges waver instead of ruling
     * straight. Each band scrolls in longitude at a speed set by latitude
     * — fast at the equator, slow at the poles — real differential
     * rotation with no per-frame physics, just uSpin through a per-latitude
     * multiplier. One noise eval, same cost as the terrain it replaces. */
    '  if (uBanded > 0.5) {',
    /* Latitude off the world's REAL pole, and longitude measured in a
     * frame that turns with it — so a giant's bands are fixed to the giant
     * and its eight-hour day is the eight hours the generator gave it. */
    '    float lati = dot(n, uSpinAxis);',
    '    vec3 nb = spinAbout(n, uSpinAxis, -uSpinPhase);',
    '    vec3 ax = abs(uSpinAxis.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);',
    '    vec3 e1 = normalize(cross(ax, uSpinAxis));',
    '    vec3 e2 = cross(uSpinAxis, e1);',
    '    float lon = atan(dot(nb, e2), dot(nb, e1));',
    '    float shear = mix(1.6, 0.35, abs(lati));',
    /* Differential rotation on top of the body's own: each band slides
     * against the ground at its own rate, fast at the equator and slow at
     * the poles, which is the whole reason a giant reads as weather rather
     * than as a striped ball. */
    '    float ph = lon + uBandPhase * shear;',
    '    float band = fbm(vec3(lati * 7.0, sin(ph) * 0.5, uSeed + uWeather * 0.20));',
    '    band = mix(band, fbm(vec3(lati * 15.0, cos(ph) * 0.4, uSeed + 5.0 + uWeather * 0.13)), 0.4);',
    '    vec3 belt = uColor * 0.72;',
    '    vec3 zone = mix(uColor, vec3(1.0), 0.22);',
    '    vec3 gcol = mix(belt, zone, smoothstep(0.35, 0.65, band));',
    /* The storm oval: fixed seeded home, its own drift speed so it slides
     * against the bands over time; elliptical, wider in longitude. */
    '    float spotLat = -0.22 + 0.10 * (fract(uSeed * 0.13) - 0.5);',
    '    float spotLon = uBandPhase * 0.42 + uSeed;',
    '    float dLat = (lati - spotLat) * 3.4;',
    '    float dLon = sin((lon - spotLon) * 0.5) * 2.2;',
    '    float spot = 1.0 - smoothstep(0.4, 1.0, sqrt(dLat * dLat + dLon * dLon));',
    '    gcol = mix(gcol, mix(gcol, vec3(0.85, 0.42, 0.30), 0.75), spot);',
    '    vec3 gc = gcol * (0.06 + 0.94 * lam);',
    '    if (uAtmo > 0.0) {',
    '      float grim = pow(1.0 - z, 3.0);',
    '      gc += uAtmoColor * grim * uAtmo * (0.08 + 0.45 * lam);',
    '    }',
    '    frag = vec4(gc, 1.0);',
    '    return;',
    '  }',

    /* ---- terrain --------------------------------------------------------
     * An elevation field, thresholded against a sea level, plus ice at the
     * poles. Not a heightmap in any real sense — nothing is displaced, the
     * sphere stays a sphere — but shading the disc by where the land WOULD
     * be is the whole of what you can see from orbit anyway.
     *
     * The world's own colour stays the land colour, so a desert is still a
     * desert and a tundra still reads cold; what this adds is the coastline
     * between it and its sea, which is the single thing that makes a planet
     * look like a place rather than a ball.
     *
     * uOcean carries how much of the world is under water and uIce how far
     * the caps reach — both decided by the generator from the world type,
     * so a molten world gets lava seas and no ice, and an iceball is
     * almost all cap. */
    /* Body-fixed, so the continents belong to the world instead of to the
     * sky behind it. */
    '  vec3 sp = spinAbout(n, uSpinAxis, -uSpinPhase) * 2.6 + uSeed;',
    '  float elev = fbm(sp);',
    /* Warp the field with a second, coarser one before thresholding it.
     * Straight fbm thresholds into round blobs; distorting the lookup
     * first is what turns them into coastlines with inlets and peninsulas
     * for almost no extra cost. */
    '  elev = mix(elev, fbm(sp * 0.55 + elev * 1.4), 0.45);',
    /* GD: the coast and the cap edge, crinkled at ground scale. */
    '  elev += gd.z;',

    /* BIOMES: the land colour from temperature and moisture (Weather.
     * BIOME). A twilight world keeps its own colour outside its band and
     * takes the biome as the band's living colour below. */
    '  vec3 bio = uBio.x > 0.0 ? biomeColour(sp, n, elev, ndl, gd.x) : uColor;',
    '  vec3 base = uBand > 0.5 ? uColor : bio;',
    '  float sea = 0.0;',
    '  if (uOcean > 0.001) {',
    '    sea = 1.0 - smoothstep(uOcean - 0.035, uOcean + 0.035, elev);',
    '    base = mix(base, uSeaColor, sea);',
    '  }',
    /* Land relief only where there is land — mottling the sea as well
     * makes the water look like more ground in a different colour. */
    '  base *= mix(0.82 + 0.34 * elev, 1.0, sea);',

    /* TWILIGHT WORLDS. Painted before the caps so the caps can stand down.
     *
     * A locked world (uBand 1) is zoned by the REAL sun angle, not by a
     * body-fixed longitude: its day face is where ndl is high, by
     * construction, so this is the same thing and needs no phase. Baked
     * rock where the star stands overhead, ice where it never rises, and
     * the world's own colours — its seas, its land — only in the ring.
     *
     * A world on its side (uBand 2) is zoned by latitude: whichever pole
     * is turned to the star this season is scorched, the other frozen,
     * and the equator keeps the world's own colours. Which pole is which
     * swaps over the year, as it should. */
    /* Bleached salt-pan pale for the baked side, so it reads as burnt
     * even on a world whose own colour is already desert tan; and the
     * living strip carries a little green, so a desert ring world looks
     * like somewhere things grow rather than more of the same sand. */
    '  vec3 scorch = vec3(0.92, 0.82, 0.64) * (0.86 + 0.22 * elev);',
    '  vec3 frost = vec3(0.86, 0.91, 0.97);',
    '  vec3 verdure = uBio.x > 0.0 ? bio * (0.80 + 0.40 * elev)',
    '                               : vec3(0.30, 0.46, 0.24) * (0.80 + 0.40 * elev);',
    '  if (uBand > 0.5 && uBand < 1.5) {',
    '    float jag = (elev - 0.5) * 0.16;',
    /* The ring sits a little sunward of the geometric terminator — the
     * star low but up, which is where the warmth is and also where the
     * shading term below leaves it visible. Centred on ndl 0 it was
     * almost all in the dark and read as nothing at all. */
    '    float dayside = smoothstep(0.40, 0.64, ndl + jag);',
    '    float nightside = 1.0 - smoothstep(-0.34, -0.10, ndl + jag);',
    '    float living = (1.0 - dayside) * (1.0 - nightside);',
    '    base = mix(base, verdure, 0.55 * living * (1.0 - sea));',
    '    base = mix(base, scorch, dayside);',
    '    base = mix(base, frost, nightside);',
    '  } else if (uBand > 1.5) {',
    '    float blat = dot(n, uSpinAxis);',
    '    float jag2 = (elev - 0.5) * 0.12;',
    '    float polar = smoothstep(0.34, 0.58, abs(blat) + jag2);',
    '    float facing = smoothstep(-0.15, 0.15, sign(blat) * dot(uSpinAxis, uSunDir));',
    '    base = mix(base, verdure, 0.55 * (1.0 - polar) * (1.0 - sea));',
    '    base = mix(base, mix(frost, scorch, facing), polar);',
    '  }',
    /* Ice caps. Latitude comes off the world's spin axis, roughened
     * slightly by the elevation field so the cap edge is ragged rather
     * than a drawn circle. Not on a twilight world: a locked world's poles
     * sit IN the living ring, and a tipped world's poles are done above. */
    '  if (uIce > 0.001 && uBand < 0.5) {',
    /* On the real poles now, which is also where the generator has been
     * putting the cold all along. */
    '    float lat = abs(dot(n, uSpinAxis));',
    '    float edge = uIce * (0.85 + 0.30 * elev);',
    '    float cap = smoothstep(1.0 - edge - 0.06, 1.0 - edge + 0.06, lat);',
    '    base = mix(base, vec3(0.92, 0.95, 0.99), cap);',
    '  }',

    /* Clouds: opaque blobs of sky, the FE2 way. Not translucent volumetrics —
     * a threshold on noise, filled solid, and lit by the same sun term as the
     * ground. Coverage drives the threshold, so an ocean world is mostly
     * white and a thin-aired desert has a few wisps. */
    /* GD: mottling and relief, on the settled ground colour, under the
     * clouds. */
    '  base *= groundDetailTint(gd, sea, base);',
    /* What the storms put into this pixel on their own account, spent
     * after the sun term below. */
    '  float glow = 0.0;',
    '  if (uCloud > 0.001) {',
    /* THE DECK TURNS FASTER THAN THE GROUND, AND IT CHANGES WHILE IT DOES.
     *
     * Rotating a fixed noise field was the old behaviour and it is a decal:
     * the same bank of cloud comes past again, forever, in exactly the same
     * shape. Two things fix that. The deck gets its own phase, ahead of the
     * body's, so weather slides over the continents the way Venus's does.
     * And the field is walked along a fourth direction by uWeather, so a
     * bank builds, spreads and breaks up instead of merely travelling.
     *
     * The shear term is the third: mid-latitudes drag against the equator,
     * which is what stops the whole deck reading as one rigid shell. */
    '    vec3 nb = spinAbout(n, uSpinAxis, -uDeckPhase);',
    '    float clat = dot(n, uSpinAxis);',
    /* THE SHEAR HAS TO BE BOUNDED, and the first version was not.
     *
     * Differential rotation that grows without limit is physically honest
     * and visually fatal: a deck whose equator runs faster than its poles
     * winds the noise field into a spiral, and within one day of sim time
     * every cloud is a hairline streak drawn from pole to pole. It looked
     * like the planet had been combed. Real atmospheres escape this by
     * tearing and re-forming; a single noise lookup cannot, so the drag
     * between latitudes breathes instead of accumulating. Twelve degrees
     * at the equator, none at the poles, over about an hour. */
    '    float shear = @SHEAR@ * (1.0 - abs(clat)) * sin(uShearPhase);',
    '    nb = spinAbout(nb, uSpinAxis, shear);',
    '    vec3 cp = nb * @CLOUD_SCALE@ + uSeed * @SEED_SCALE@;',
    /* And the weather itself. The field is moved through, which is what
     * makes a bank build and break up rather than merely come round again
     * — but it is moved around a small CIRCUIT, not along a line.
     *
     * A straight walk was the obvious version and it is wrong for a
     * reason worth writing down: coverage here is a threshold on a noise
     * field, and the fraction of a field that clears a fixed threshold is
     * a property of the NEIGHBOURHOOD you are sampling. Walk far enough
     * and you arrive somewhere with no peaks above the cut. Measured on
     * the cloudiest world in the seed, an eight-hour drift took the disc
     * from 33% cloud to 0.1% and left it there for three hours — an ocean
     * world with a completely clear sky, which reads as a bug and not as
     * good weather.
     *
     * Two circuits at rates that do not divide into each other: the
     * pattern keeps changing and never repeats within anything like a
     * session, and the statistics stay exactly where they were tuned. */
    '    cp += vec3(cos(uWeather * @W1@), sin(uWeather * @W1@), 0.0) * @DRIFT1@;',
    '    cp += vec3(0.0, cos(uWeather * @W2@), sin(uWeather * @W2@)) * @DRIFT2@;',
    '    float cl = fbm(cp);',
    /* COVERAGE-TO-THRESHOLD, AND THIS IS WHERE THE CLOUDS WENT.
     *
     * The mapping ran 0.95 down to 0.52. The field it cuts is four octaves
     * of value noise summed at halving amplitude, which — measured, 240,000
     * samples, the same arithmetic ported to JS — has mean 0.470, standard
     * deviation 0.105, and a MAXIMUM OF 0.829. So the top two thirds of
     * that mapping asked for a threshold the field can never reach:
     *
     *     iceball  0.02 -> 0.941 ->  0.0% of the sky
     *     desert   0.08 -> 0.916 ->  0.0%
     *     molten   0.35 -> 0.799 ->  0.0%
     *     tundra   0.40 -> 0.778 ->  0.1%
     *     terran   0.55 -> 0.714 ->  0.8%
     *     ocean    0.72 -> 0.640 ->  5.3%
     *
     * Every world in the game except the very wettest had no weather at
     * all, and the generator's `cloud` column — seeded per world, varied by
     * type, carefully written down — controlled nothing. The earlier pass
     * that raised the bottom from 0.30 to 0.52 was right about the bottom
     * (0.30 really is total overcast) and never looked at the top.
     *
     * Mapped onto the range the field actually occupies, the column means
     * something again, and the numbers below are measured the same way,
     * counting the smoothstep rather than a hard cut:
     *
     *     desert   0.08 ->  4% of the sky
     *     molten   0.35 -> 11%
     *     tundra   0.40 -> 13%
     *     terran   0.55 -> 24%
     *     ocean    0.72 -> 38%
     *
     * A terran world a quarter clouded still shows every coastline, which
     * is what the old note was protecting and is still true. */
    '    float thresh = mix(@THRESH_HI@, @THRESH_LO@, clamp(uCloud, 0.0, 1.0));',
    '    float mask = smoothstep(thresh, thresh + @EDGE@, cl);',
    '    vec3 cloudCol = mix(vec3(0.90, 0.93, 0.97), uAtmoColor, 0.22);',

    /* ---- where the weather is actually happening -------------------- */
    /* A handful of cells per world: the upper tail of a field four times
     * coarser than the cloud itself, and only where there is cloud to
     * build in. A storm over clear air is not a storm. */
    /* SCALE MEASURED, NOT CHOSEN. The first version looked up the storm
     * field FOUR TIMES COARSER than the cloud, on the reasoning that a
     * storm is a big thing — which gets it exactly backwards. The cloud
     * lookup spans about five noise features across a whole sphere, so a
     * quarter of that is one or two cells per WORLD, and the planet I
     * measured had both of them on the far side: storms covered 0.9% of
     * the visible disc and the lightning, which only fires inside a cell,
     * never once fired at all.
     *
     * Storm cover on the visible disc, by lookup scale:
     *     cp * 0.42   0.9%        cp * 2.5   12.8%
     *     cp * 1.5    5.1%        cp * 3.5    8.2%
     *                             cp * 5.0    5.5%
     *
     * It peaks in the middle because too fine a field stops clearing the
     * threshold at all — cells smaller than the noise's own detail are
     * cells that are never strong enough to be cells. */
    '    vec3 sc = cp * @STORM_SCALE@;',
    '    float storm = smoothstep(@STORM_LO@, @STORM_HI@, fbm(sc)) * mask;',
    /* Tops catch more light and the base loses it — the same cell read
     * twice, which is what gives a bank depth instead of a flat lid. */
    '    cloudCol = mix(cloudCol, vec3(1.0), storm * 0.35);',
    '    cloudCol = mix(cloudCol, vec3(0.42, 0.45, 0.55),',
    '                   storm * 0.55 * smoothstep(0.62, 0.30, cl));',
    '    base = mix(base, cloudCol, mask);',

    /* ---- and the lightning ------------------------------------------- */
    /* Held aside rather than added here. `base` is about to be multiplied
     * by the sun term, and a flash is not lit by the sun — it IS a light.
     * Added before the multiply it survived at 5% on the night side,
     * which is the one side of a planet where lightning is the entire
     * point, and the storms were invisible. */
    /* THE PACE IS THE WHOLE POINT. Every stroke used to begin at the top of
     * its 0.9 s slot, so the sky kept a perfect beat no matter how the cells
     * were scattered — a strobe with a storm texture on it. Weather.js's
     * `stormClock` carries the argument in full; what the shader does with
     * it is three things: slide each stroke off the grid by a hashed
     * offset, evaluate the PREVIOUS slot as well so a late stroke is not
     * guillotined at the boundary, and modulate each cell's firing
     * threshold with four slow co-prime rhythms so storms burst and then go
     * quiet instead of ticking over at a flat rate.
     *
     * (Restored 2026-10-19: the 10-17 branch merge took the other side's
     * copy of this block and the old one-slot strobe came back with it.) */
    '    if (storm > 0.03 && uFlashGain > 0.0) {',
    /* The patch one stroke lights: about a twelfth of the world across,
     * which is enormous for a thunderstorm and the smallest thing worth
     * drawing from orbit. A physically-sized cell is a sub-pixel flash. */
    '      vec3 cid = floor(sc * 2.0);',
    /* A cell's own four phases, so neighbouring cells are busy and quiet at
     * different times. Without these the whole planet would breathe
     * together, which is a worse artefact than the beat it replaces. */
    '      vec4 cph = vec4(hash13(cid * 1.3), hash13(cid * 2.1 + 7.0),',
    '                      hash13(cid * 3.7 + 13.0), hash13(cid * 5.3 + 19.0)) * 6.2831853;',
    '      float act = 0.25 * (sin(uStormSlow.x + cph.x) + sin(uStormSlow.y + cph.y)',
    '                        + sin(uStormSlow.z + cph.z) + sin(uStormSlow.w + cph.w));',
    '      act = 0.5 + 0.5 * act;',
    /* In a lull almost nothing fires; at the peak of a spell about half the
     * cells do. The distance between those two numbers is the clustering,
     * and clustering a uniform draw is how the gaps come out roughly
     * exponential without a Poisson process per cell per frame. */
    '      float thr = mix(@FLASH_QUIET@, @FLASH_DUTY@, act);',
    '      float lit = 0.0;',
    /* Two slots: this one and the one before. A stroke that began late in
     * the previous slot is still burning in this one. */
    '      for (int k = 0; k < 2; k++) {',
    '        vec3 sl = (k == 0) ? uStormSalt : uStormSaltPrev;',
    '        float ph = uStormPhase + float(k);',
    '        float r = hash13(cid + sl * 37.0);',
    '        float fire = step(thr, r);',
    /* Off the grid. This one line is most of the fix. */
    '        float tt = ph - hash13(cid * 3.1 + sl.yzx * 29.0) * @FLASH_JITTER@;',
    '        float hard = 0.45 + 0.55 * hash13(cid * 1.7 + sl.zxy * 53.0);',
    /* A leader, a return, and sometimes a third, at hashed gaps rather than
     * a fixed fifth of a slot. The flicker is most of what the eye reads as
     * lightning rather than as a lamp being switched. */
    '        float env = 0.0;',
    '        if (tt > 0.0) {',
    '          float g1 = 0.04 + 0.16 * hash13(cid * 4.3 + sl * 11.0);',
    '          float g2 = g1 + 0.04 + 0.18 * hash13(cid * 6.1 + sl * 17.0);',
    '          env = exp(-tt * 7.0) + 0.75 * exp(-abs(tt - g1) * 24.0);',
    '          env += step(0.45, hash13(cid * 7.9 + sl * 23.0))',
    '                 * 0.55 * exp(-abs(tt - g2) * 28.0);',
    '        }',
    '        lit = max(lit, fire * hard * env);',
    '      }',
    /* SOFTEN THE CELL, or the cell is what you see. A stroke picked by
     * hashing a cube of the lookup lights that cube — corners, faces and
     * all — and from orbit the sky flashed in rectangles, which reads as a
     * rendering fault rather than as weather. A bump that peaks at the
     * cube's centre and falls to nothing at its faces leaves a soft ball
     * of light with no edge to notice. */
    '      vec3 fp = fract(sc * 2.0);',
    '      vec3 b3 = smoothstep(0.0, 0.50, fp) * (1.0 - smoothstep(0.50, 1.0, fp));',
    '      glow += lit * storm * (b3.x * b3.y * b3.z) * 7.0 * uFlashGain;',
    '    }',
    /* AT TIME WARP THE FLASHES BECOME A GLOW. The stroke is a tenth of a
     * second and the frames are seconds apart, so sampling it would give
     * uncorrelated noise — a strobe, which is both wrong and unpleasant.
     * What you would really see at a thousand times is the average, so
     * that is what is drawn. */
    '    glow += storm * 0.09 * (1.0 - uFlashGain);',
    '  }',

    '  vec3 col = base * (0.055 + 0.95 * lam);',
    /* SEA: shaded under the swell, with its glint and foam. */
    '  col = seaShade(col, base, n, rd, sea, seaW);',
    /* THE STORMS, LIT FROM INSIDE. Added after the sun, because that is
     * what a light source is — and weighted toward the dark side, which
     * is not artistic licence: a flash is lost in daylight and is the
     * brightest thing on a night hemisphere, which is exactly how a world
     * with weather looks from orbit. */
    '  col += vec3(0.82, 0.88, 1.0) * glow * (0.22 + 1.30 * (1.0 - lam));',

    /* Haze toward the limb on the day side: the air you are looking through
     * gets thicker as the surface turns away, which is what makes a world
     * with an atmosphere read as having one at a glance. */
    '  if (uAtmo > 0.0) {',
    /* Limb haze, pulled back from 0.75 to 0.45: at the old strength it
     * washed the day side toward white across most of the disc, which
     * fought the terrain for the same pixels. Haze should thicken toward
     * the edge, not bleach the middle. */
    '    float rim = pow(1.0 - z, 3.0);',
    /* Not from under this world's own sky (fifth round): seen from near
     * its surface EVERY ray is near the limb by this measure, so the rim
     * haze washed the whole ground pink from 8 km up. groundHaze is the
     * haze there, by the air the ray actually crosses. */
    '    if (uSkyA.w > 0.0) rim = 0.0;',
    '    col += uAtmoColor * rim * uAtmo * (0.08 + 0.45 * lam);',
    '  }',

    '  col = groundHaze(col, rd, tHit, sqrt(dot(oc, oc)) - uWorldRadius, uWorldRadius);',
    '  frag = vec4(col, 1.0);',
    '}'
  ].join('\n');

  /* ---- ONE COPY OF EVERY NUMBER -----------------------------------------
   *
   * The shader above is written with @TOKENS@ where a weather constant
   * goes, and they are filled in from weather.js at load. That file
   * evaluates the same field on the CPU so a port can tell you what its
   * sky is doing, and the one duplication that would really have hurt is
   * not the noise functions — those are obviously two languages doing the
   * same arithmetic — it is a threshold nudged in one of them. Now a
   * threshold cannot be nudged in one of them.
   *
   * The fallbacks are what gl.js uses when it is loaded on its own, which
   * the hull viewer page does. */
  FRAG_BODY = (function (src) {
    var W = (global.Weather && global.Weather.K) || {};
    var D = { CLOUD_SCALE: 2.4, SEED_SCALE: 1.7, THRESH_HI: 0.655,
              THRESH_LO: 0.405, EDGE: 0.055, SHEAR: 0.21, STORM_SCALE: 2.5,
              STORM_LO: 0.55, STORM_HI: 0.70, W1: 0.9, W2: 0.3703,
              DRIFT1: 0.42, DRIFT2: 0.28,
              FLASH_BUCKET: 0.9, FLASH_DUTY: 0.52, FLASH_QUIET: 0.94,
              FLASH_JITTER: 0.85 };
    return src.replace(/@([A-Z0-9_]+)@/g, function (m, key) {
      var v = (W[key] !== undefined) ? W[key] : D[key];
      if (v === undefined) throw new Error('gl.js: no weather constant ' + key);
      /* GLSL will not take an integer where a float belongs. */
      return v.toFixed(5);
    });
  })(FRAG_BODY);

  /* ---- TORN SPACE BENDS LIGHT (2026-10-21) ------------------------------
   *
   * A slipspace tear is a hole punched through spacetime into whatever
   * holds it up, and the space around a hole like that is curved: what is
   * behind it is lensed. Astra chose this over a tachyon glow after seeing
   * a mockup — stars sliding round a point where nothing glows sells "space
   * is torn here" better than any brightness could, because it moves as
   * you fly.
   *
   * Up to four tears a frame (GL.setTears), each a direction from the eye
   * and an Einstein angle. The point-mass lens equation, beta = theta -
   * E^2/theta, in both directions:
   *   - tearBend takes a VIEW ray to the direction its light came from.
   *     Planets are ray-cast per pixel, so they bend for free this way.
   *   - stars are points with known directions, so they map forward: each
   *     star's primary image moves out, and a second pass draws the faint
   *     second image on the far side of the tear (VERT_STARS, uImage).
   * Render.lensImages is this arithmetic in JS, and test/tear.test.js pins
   * it; change one, change the other.
   *
   * And the shift: what is seen through the space round a departure is
   * reddened, round an arrival blued, strongest near the tear. Same
   * numbers as the mockup Astra signed off. Ships and stations have no
   * per-pixel ray, so they take the lens per VERTEX instead (tearPush in
   * VERT_MESH): each corner moves to where its image is seen. A coarse
   * hull bends as straight-edged facets, which at the size a tear is on
   * screen is not visible. */
  /* ONLY WHAT IS BEHIND A TEAR BENDS (2026-10-21, second pass). Each tear
   * carries its distance (uTearK.z, km), and everything here takes the
   * distance of the thing being drawn: a planet or a station nearer than
   * the tear is in front of it and is left alone, with a short blend
   * across the tear's own distance so nothing snaps. Stars pass a huge
   * distance: always behind. */
  var TEAR_GLSL = [
    'uniform vec4 uTear[4];',    // xyz: unit direction from the eye; w: Einstein angle, rad
    'uniform vec4 uTearK[4];',   // x: 0 departure, 1 arrival; y: how open; z: distance, km
    'uniform int uTearN;',
    'float tearBehind(int i, float dist) {',
    '  float z = uTearK[i].z;',
    '  return z <= 0.0 ? 1.0 : smoothstep(z * 0.97, z * 1.03, dist);',
    '}',
    /* A view ray to where its light came from (planets: per pixel). */
    'vec3 tearBend(vec3 d, float dist) {',
    '  for (int i = 0; i < 4; i++) {',
    '    if (i >= uTearN) break;',
    '    float E = uTear[i].w; if (E <= 0.0) continue;',
    '    float wb = tearBehind(i, dist); if (wb <= 0.0) continue;',
    '    vec3 T = uTear[i].xyz; float c = dot(d, T);',
    '    float th = acos(clamp(c, -1.0, 1.0));',
    '    if (th < 1e-7 || th > E * 40.0) continue;',
    '    vec3 p = normalize(d - T * c);',
    '    float b = mix(th, th - E * E / th, wb);',
    '    d = T * cos(b) + p * sin(b);',
    '  }',
    '  return d;',
    '}',
    /* A point to where its primary image is seen (stations and ships: per
     * vertex). The forward half of the same lens; see VERT_STARS. */
    'vec3 tearPush(vec3 d, float dist) {',
    '  for (int i = 0; i < 4; i++) {',
    '    if (i >= uTearN) break;',
    '    float E = uTear[i].w; if (E <= 0.0) continue;',
    '    float wb = tearBehind(i, dist); if (wb <= 0.0) continue;',
    '    vec3 T = uTear[i].xyz; float c = dot(d, T);',
    '    float b = acos(clamp(c, -1.0, 1.0));',
    '    if (b < 1e-7 || b > E * 40.0) continue;',
    '    vec3 p = normalize(d - T * c);',
    '    float th = mix(b, 0.5 * (b + sqrt(b * b + 4.0 * E * E)), wb);',
    '    d = T * cos(th) + p * sin(th);',
    '  }',
    '  return d;',
    '}',
    /* x: how red, y: how blue, for something seen in direction d */
    'vec2 tearShift(vec3 d, float dist) {',
    '  vec2 w = vec2(0.0);',
    '  for (int i = 0; i < 4; i++) {',
    '    if (i >= uTearN) break;',
    '    float E = uTear[i].w; if (E <= 0.0) continue;',
    '    float th = acos(clamp(dot(d, uTear[i].xyz), -1.0, 1.0));',
    '    float rr = th / (E * 2.4);',
    '    float k = exp(-rr * rr * 0.35) * min(1.0, uTearK[i].y * 1.5) * tearBehind(i, dist);',
    '    if (uTearK[i].x > 0.5) w.y = max(w.y, k); else w.x = max(w.x, k);',
    '  }',
    '  return w;',
    '}',
    'vec3 dopplerTint(vec3 c, vec2 w) {',
    '  vec3 red = vec3(c.r * 1.5 + c.g * 0.4, c.g * 0.45, c.b * 0.2);',
    '  vec3 blu = vec3(c.r * 0.25, c.g * 0.7 + c.r * 0.2, c.b * 1.7 + c.g * 0.5);',
    '  c = mix(c, red, w.x);',
    '  return mix(c, blu, w.y);',
    '}'
  ].join('\n');

  /* The planet shader takes the lens by bending its view ray before the
   * sphere test, and takes the shift on whatever it finally drew. Done to
   * the finished source so the body shader itself stays readable. */
  FRAG_BODY = (function (src) {
    var RAY = '+ uFwd   * uFlen);';
    if (src.indexOf(RAY) < 0 || src.indexOf('void main() {') < 0) {
      throw new Error('gl.js: body shader no longer has the hooks the tear lens needs');
    }
    src = src.replace('void main() {', TEAR_GLSL + '\nvoid shadeBody() {');
    src = src.replace(RAY, RAY + '\n  rd = tearBend(rd, length(uCenterRel));');
    return src + '\nvoid main() {\n' +
      '  vec3 rd0 = normalize(uRight * (vPx.x - uScreenPx.x) + uUp * (uScreenPx.y - vPx.y) + uFwd * uFlen);\n' +
      '  shadeBody();\n' +
      '  if (uTearN > 0) frag.rgb = dopplerTint(frag.rgb, tearShift(rd0, length(uCenterRel)));\n' +
      '}\n';
  })(FRAG_BODY);

  /* ---- THE TEAR ITSELF: cloud, veil and lips (2026-10-21) ---------------
   *
   * The mockup's look, in a screen-facing quad at the tear's own depth so a
   * planet in front of it hides it. Everything is in screen pixels round
   * the tear's centre, turned so y runs along the slit (main.js points it
   * along the system's pole).
   *   - a glow round the whole wound: red for a departure, blue for an
   *     arrival, brighter than the 2D cloud it replaces;
   *   - THE VEIL, a churning cloud filling the rip and the heart of the lens
   *     so whatever lies behind the tear is never seen: dark and smouldering
   *     for a departure, lit from inside — brighter than the space around
   *     it — for an arrival;
   *   - the lips of the rip, burning.
   * Premultiplied: the glow adds light, the veil covers what is behind.
   * The lightning is NOT here; it has its own program (VERT_BOLT). */
  var VERT_TEAR = [
    '#version 300 es',
    'in vec2 aCorner;',
    'uniform vec2 uCenterPx;',
    'uniform float uQuadPx;',
    'uniform vec2 uViewportPx;',
    'uniform float uDepth;',          // encoded, 0..1
    'out vec2 vLocal;',
    'void main() {',
    '  vLocal = aCorner * uQuadPx;',
    '  vec2 px = uCenterPx + vLocal;',
    '  gl_Position = vec4(px.x / uViewportPx.x * 2.0 - 1.0, 1.0 - px.y / uViewportPx.y * 2.0,',
    '                     uDepth * 2.0 - 1.0, 1.0);',
    '}'
  ].join('\n');

  var FRAG_TEAR = [
    '#version 300 es',
    'precision highp float;',
    'in vec2 vLocal;',
    'uniform vec2 uRoll;',            // the across-the-slit axis on screen
    'uniform float uE, uW, uH;',      // Einstein radius, rip half-width, half-height: px
    'uniform float uOpen, uGlow, uMode, uT;',
    'out vec4 frag;',
    'float h1(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }',
    'float vn(vec3 p) { vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);',
    '  return mix(mix(mix(h1(i), h1(i + vec3(1,0,0)), f.x), mix(h1(i + vec3(0,1,0)), h1(i + vec3(1,1,0)), f.x), f.y),',
    '             mix(mix(h1(i + vec3(0,0,1)), h1(i + vec3(1,0,1)), f.x), mix(h1(i + vec3(0,1,1)), h1(i + vec3(1,1,1)), f.x), f.y), f.z); }',
    'void main() {',
    '  float x = dot(vLocal, uRoll), y = dot(vLocal, vec2(-uRoll.y, uRoll.x));',
    '  float th = length(vLocal);',
    '  float W = max(uW, 0.5), H = max(uH, 1.0);',
    '  float jag = (vn(vec3(y / H * 4.0, uT * 0.3, 1.7)) - 0.5) * 1.2 + (vn(vec3(y / H * 11.0, uT * 0.6, 8.3)) - 0.5) * 0.45;',
    '  float sx = (x - W * jag) / W, sy = y / H;',
    /* the glow */
    '  float rr = th / (uE * 2.4 + 2.0);',
    '  vec3 cIn = mix(vec3(1.0, 0.22, 0.10), vec3(0.25, 0.45, 1.0), uMode);',
    '  vec3 cHot = mix(vec3(1.0, 0.55, 0.30), vec3(0.65, 0.85, 1.0), uMode);',
    '  vec3 glow = uGlow * (cIn * exp(-rr * rr) * (0.75 + 0.35 * uMode) + cHot * exp(-rr * rr * 4.0) * (0.5 + 0.25 * uMode));',
    /* the veil */
    /* The churn is measured in a capped width, so a rip gaping wider than
     * the screen (the jump itself) still boils instead of streaking. */
    '  float Wq = min(W, H * 0.25);',
    '  vec3 q = vec3((x - Wq * jag) / Wq * 0.55, sy * 2.4, uT * 0.2);',
    '  float n = vn(q * 2.0 + vec3(0.0, -uT * 0.45, 0.0)) * 0.55 + vn(q * 4.5 + vec3(uT * 0.7, 0.0, 0.0)) * 0.3 + vn(q * 10.0) * 0.15;',
    '  float billow = (n - 0.5) * 0.9;',
    '  float inside = smoothstep(1.7 + billow, 0.7, abs(sx)) * smoothstep(1.05 + billow * 0.3, 0.75, abs(sy));',
    '  float core = smoothstep(0.75, 0.3, th / max(uE, 0.5));',
    '  float occ = clamp(max(inside, core), 0.0, 1.0) * 0.97 * smoothstep(0.0, 0.08, uOpen);',
    '  vec3 fogD = mix(vec3(0.22, 0.03, 0.05), vec3(1.25, 0.42, 0.18), smoothstep(0.3, 0.8, n)) + vec3(1.0, 0.75, 0.55) * pow(n, 6.0) * 1.6;',
    '  vec3 fogA = mix(vec3(0.25, 0.4, 0.95), vec3(0.95, 1.1, 1.5), smoothstep(0.3, 0.85, n)) + vec3(0.9, 1.0, 1.2) * pow(n, 5.0) * 1.2;',
    '  vec3 fog = mix(fogD, fogA, uMode);',
    /* the lips */
    '  vec3 lips = uGlow * mix(vec3(1.0, 0.6, 0.38), vec3(0.6, 0.8, 1.0), uMode) *',
    '              exp(-pow((abs(sx) - 1.15) * 2.4, 2.0)) * smoothstep(1.0, 0.5, abs(sy)) * 1.1;',
    '  vec3 rgb = glow * (1.0 - occ) + fog * occ + lips;',
    '  frag = vec4(rgb, occ);',
    '}'
  ].join('\n');

  /* ---- THE LIGHTNING (2026-10-21) ---------------------------------------
   * Its own program, as Astra asked: the bolts are real forked polylines
   * built on the CPU (Render.tearBolts), crossing the dark gap from the
   * cloud on one side to the cloud on the other, and drawn here as
   * feathered quads — a hot white core in a tinted halo — added on top of
   * the tear at its depth. */
  var VERT_BOLT = [
    '#version 300 es',
    'in vec2 aPx;',
    'in vec4 aW;',                    // x: px across the stroke, y: core px, z: halo px, w: intensity
    'uniform vec2 uViewportPx;',
    'uniform float uDepth;',
    'out vec4 vW;',
    'void main() {',
    '  vW = aW;',
    '  gl_Position = vec4(aPx.x / uViewportPx.x * 2.0 - 1.0, 1.0 - aPx.y / uViewportPx.y * 2.0,',
    '                     uDepth * 2.0 - 1.0, 1.0);',
    '}'
  ].join('\n');

  var FRAG_BOLT = [
    '#version 300 es',
    'precision mediump float;',
    'in vec4 vW;',
    'uniform vec3 uTint;',
    'out vec4 frag;',
    'void main() {',
    '  float d = abs(vW.x);',
    '  float core = exp(-d * d / (vW.y * vW.y));',
    '  float halo = exp(-d / vW.z) * (1.0 - smoothstep(vW.z * 2.2, vW.z * 3.0, d));',
    '  vec3 c = mix(uTint, vec3(1.0), core * 0.8) * (core * 1.9 + halo * 0.55) * vW.w;',
    '  frag = vec4(c, 0.0);',
    '}'
  ].join('\n');

  /* The starfield has to live down here too, and that is not an
   * optimisation — it is a correctness fix. The 2D canvas is now strictly an
   * overlay, so anything drawn on it appears IN FRONT of every planet. Left
   * in 2D, the starfield put stars across the face of a world you were
   * looking at, which reads instantly as broken. Anything that belongs to
   * the world has to be down here where a planet can cover it.
   *
   * Projected on the GPU from the same camera basis the CPU uses, so it
   * matches the 2D layer's framing exactly. Directions only: these are at
   * effective infinity and have no position. */
  /* THE SKY AT SPEED (2026-10-19, the TNG red-blue rule; it replaced the
   * 2026-10-17 relativistic sky). In cruise each star stays where it is
   * and is washed blue-white in the forward half, red in the rear, with
   * the flip in a narrow band at abeam; how strongly rides the speed on a
   * log scale, 0.02c to 2000c. This is Render.cruiseSky line for
   * line, and must stay so: change one, change the other. The JS one is
   * what test/cruisesky.test.js pins (node cannot run a shader). It lives
   * here because a star has to be BEHIND the planets, which only this
   * layer can do.
   * Below uBeta 0.02 nothing moves and every star is white, exactly as it
   * always was. aMag.z is the star's own temperature (Render.starTemp). */
  var VERT_STARS = [
    '#version 300 es',
    'in vec3 aDir;',
    'in vec3 aMag;',            // x = brightness, y = size in px, z = temperature K
    'uniform vec3 uRight, uUp, uFwd;',
    'uniform float uFlen;',
    'uniform vec2 uCenterPx;',
    'uniform vec2 uViewportPx;',
    'uniform vec3 uHead;',
    'uniform float uBeta;',
    'out float vB;',
    'out vec3 vCol;',
    'vec3 k2rgb(float T) {',
    '  float t = clamp(T, 1000.0, 40000.0) / 100.0; vec3 c;',
    '  if (t <= 66.0) { c.r = 255.0; c.g = 99.47 * log(t) - 161.12;',
    '    c.b = t <= 19.0 ? 0.0 : 138.52 * log(t - 10.0) - 305.04; }',
    '  else { c.r = 329.7 * pow(t - 60.0, -0.1332); c.g = 288.12 * pow(t - 60.0, -0.0755); c.b = 255.0; }',
    '  return clamp(c / 255.0, 0.0, 1.0);',
    '}',
    TEAR_GLSL,
    'uniform float uImage;',     // 0: each star's primary image; 1: its second image, if a tear makes one
    'void main() {',
    '  vec3 dir = aDir; float bright = aMag.x, size = aMag.y; vCol = vec3(1.0);',
    '  if (uBeta >= 0.02) {',
    '    float ct = dot(aDir, uHead);',
    '    float f = clamp(log(uBeta / 0.02) / log(2000.0 / 0.02), 0.0, 1.0);',
    '    float s = clamp(f / 0.35, 0.0, 1.0); s = s * s * (3.0 - 2.0 * s);',
    '    float ah = clamp((ct + 0.10) / 0.20, 0.0, 1.0); ah = ah * ah * (3.0 - 2.0 * ah);',
    '    float lum = 1.0 + s * (0.6 * ah - 0.35 * (1.0 - ah));',
    '    vec3 tint = mix(vec3(255.0, 84.0, 58.0), vec3(178.0, 212.0, 255.0), ah) / 255.0;',
    '    vCol = mix(mix(vec3(1.0), k2rgb(aMag.z), s), tint, s * 0.8);',
    '    bright *= lum;',
    '    size *= 1.0 + 0.5 * s;',
    '  }',
    /* THE LENS, forward: a star at angle b from a tear is seen at
     * (b + sqrt(b^2 + 4E^2)) / 2 on its own side, magnified, and faintly
     * at (b - sqrt(b^2 + 4E^2)) / 2 — the far side. Render.lensImages. */
    '  if (uTearN > 0) {',
    '    if (uImage < 0.5) {',
    '      for (int i = 0; i < 4; i++) {',
    '        if (i >= uTearN) break;',
    '        float E = uTear[i].w; if (E <= 0.0) continue;',
    '        vec3 T = uTear[i].xyz; float c = dot(dir, T);',
    '        float b = acos(clamp(c, -1.0, 1.0));',
    '        if (b < 1e-7 || b > E * 40.0) continue;',
    '        vec3 p = normalize(dir - T * c);',
    '        float th = 0.5 * (b + sqrt(b * b + 4.0 * E * E));',
    '        float u = b / E;',
    '        float mu = (u * u + 2.0) / (2.0 * u * sqrt(u * u + 4.0)) + 0.5;',
    '        dir = T * cos(th) + p * sin(th);',
    '        bright *= min(mu, 4.0);',
    '      }',
    '    } else {',
    /* Only the strongest pull on this star makes a second image worth
     * drawing; past six Einstein angles it is far too faint to see. */
    '      float bu = 1e9; vec3 bT = vec3(0.0), bp = vec3(0.0); float bb = 0.0, bE = 0.0;',
    '      for (int i = 0; i < 4; i++) {',
    '        if (i >= uTearN) break;',
    '        float E = uTear[i].w; if (E <= 0.0) continue;',
    '        vec3 T = uTear[i].xyz; float c = dot(dir, T);',
    '        float b = acos(clamp(c, -1.0, 1.0));',
    '        if (b < 1e-7) continue;',
    '        float u = b / E;',
    '        if (u < bu) { bu = u; bT = T; bp = normalize(dir - T * c); bb = b; bE = E; }',
    '      }',
    '      if (bu > 6.0) { bright = 0.0; } else {',
    '        float th = 0.5 * (bb - sqrt(bb * bb + 4.0 * bE * bE));',
    '        float mu = (bu * bu + 2.0) / (2.0 * bu * sqrt(bu * bu + 4.0)) - 0.5;',
    '        dir = bT * cos(th) + bp * sin(th);',
    '        bright *= min(mu, 4.0);',
    '      }',
    '    }',
    '    vCol = dopplerTint(vCol, tearShift(dir, 1e30));',
    '  }',
    '  float depth = dot(dir, uFwd);',
    '  if (depth <= 1e-6 || bright < 0.03) {',   // behind the camera, or not seen: park it offscreen
    '    gl_Position = vec4(2.0, 2.0, 0.0, 1.0); gl_PointSize = 1.0; vB = 0.0; return;',
    '  }',
    '  float kk = uFlen / depth;',
    '  vec2 px = uCenterPx + vec2(dot(dir, uRight) * kk, -dot(dir, uUp) * kk);',
    '  gl_Position = vec4(px.x / uViewportPx.x * 2.0 - 1.0,',
    '                     1.0 - px.y / uViewportPx.y * 2.0, 0.0, 1.0);',
    '  gl_PointSize = size;',
    '  vB = min(1.0, bright);',
    '}'
  ].join('\n');

  var FRAG_STARS = [
    '#version 300 es',
    'precision mediump float;',
    'in float vB;',
    'in vec3 vCol;',
    'out vec4 frag;',
    'void main() { frag = vec4(vCol, vB); }'
  ].join('\n');

  /* THE STAR TRAILS IN CRUISE (2026-10-17). Astra: "we have to not have
   * them cross in front of planets, that breaks the immersion." So they
   * are drawn here, straight after the stars and before anything else in
   * the frame, where every planet drawn later covers them — exactly as the
   * stars themselves are. The geometry is Render.cruiseTrails', already in
   * screen pixels: each segment arrives as a thin quad, two triangles, with
   * its colour and fade per vertex (WebGL will not draw a line wider than
   * one pixel on most hardware, so a line primitive cannot carry a star's
   * size). */
  var VERT_TRAIL = [
    '#version 300 es',
    'in vec2 aPx;',
    'in vec4 aCol;',
    'in vec2 aUV;',
    'uniform vec2 uViewportPx;',
    'out vec4 vC;',
    'out vec2 vUV;',
    'void main() {',
    '  gl_Position = vec4(aPx.x / uViewportPx.x * 2.0 - 1.0, 1.0 - aPx.y / uViewportPx.y * 2.0, 0.0, 1.0);',
    '  vC = aCol; vUV = aUV;',
    '}'
  ].join('\n');

  var FRAG_TRAIL = [
    '#version 300 es',
    'precision mediump float;',
    'in vec4 vC;',
    'in vec2 vUV;',
    'out vec4 frag;',
    /* x across the quad (-1..1), y along it (0 at the star, 1 at the tail):
     * a gaussian cross-section for the blur, and a tail that fades out. */
    'void main() {',
    '  float across = exp(-vUV.x * vUV.x * 3.2);',
    '  float along = pow(1.0 - clamp(vUV.y, 0.0, 1.0), 1.4);',
    '  frag = vec4(vC.rgb, vC.a * across * along);',
    '}'
  ].join('\n');

  /* ---- ship and station meshes ------------------------------------------
   * The reason slice 2 was not optional. The imported hulls run 1,800 to
   * 4,456 triangles each, and the 2D rasterizer draws every one of them as
   * its own ctx.fill() plus ctx.stroke(): measured at 87 ms for a single
   * liner against a 16.6 ms frame. The same geometry on this laptop's UHD
   * 620, batched, is 0.00 ms — 80 ships at once is 0.34 ms. The models were
   * unusable until they got here, and are effectively free now they have.
   *
   * PROJECTION. Meshes cannot dodge it the way the planet impostors do, so
   * the vertex shader reproduces Camera.project() exactly — the same
   * flen/depth division the 2D layer uses — rather than introducing a
   * projection matrix that would have to be kept in agreement with it by
   * hand. The two layers stay aligned by construction, which is the same
   * bargain the impostors make.
   *
   * PRECISION. World coordinates here reach ~1e9 km, and float32 cannot
   * hold those to anything like the metre a docking approach needs. So the
   * subtraction that matters — vertex minus eye — never happens in float32:
   * JavaScript does it in double precision, hands the shader a model origin
   * ALREADY relative to the camera, and the shader only ever adds small
   * local offsets to a small number.
   *
   * DEPTH. Logarithmic, because a linear buffer cannot span a cockpit
   * fitting a metre away and a gas giant several AU off. Written from the
   * fragment shader so the planet impostors can take part in the same
   * scheme — which is what finally lets a ship pass correctly BEHIND a
   * planet instead of being painter-sorted against it. */

  var VERT_MESH = [
    '#version 300 es',
    'in vec3 aPos;',
    'in vec3 aNrm;',
    'in vec3 aCol;',
    'in float aEmis;',
    'in float aAlpha;',
    'uniform vec3 uModelRel;',     // model origin, already relative to the eye
    'uniform mat3 uRot;',          // the frame's right/up/fwd, as a basis
    'uniform float uScale;',
    'uniform vec3 uRight, uUp, uFwd;',
    'uniform float uFlen;',
    'uniform vec2 uCenterPx, uViewportPx;',
    /* Shared with the fragment stage — one uniform, one upload. */
    'uniform float uNear;',
    'out vec3 vNrm; out vec3 vCol; out float vEmis; out vec3 vRel;',
    'out float vAlpha;',
    TEAR_GLSL,
    'void main() {',
    '  vec3 rel = uModelRel + uRot * (aPos * uScale);',
    '  vNrm = uRot * aNrm; vCol = aCol; vEmis = aEmis; vRel = rel;',
    '  vAlpha = aAlpha;',
    /* A station or ship behind a tear is lensed like the planets are
     * (Astra, 2026-10-21: "I do want the thing to lens planets and stations
     * alike"): each vertex is moved to where its image is seen, and
     * coloured by the shift. Anything nearer than the tear — your own
     * cockpit, a ship between you and it — is untouched (tearBehind). */
    '  if (uTearN > 0) {',
    '    float L = length(rel);',
    '    if (L > 1e-9) {',
    '      vec3 dd = tearPush(rel / L, L);',
    '      rel = dd * L; vRel = rel;',
    '      vCol = dopplerTint(vCol, tearShift(dd, L));',
    '    }',
    '  }',
    /* ---- THE NEAR PLANE, AND WHY THE HARDWARE HAS TO OWN IT ------------
     *
     * This used to read:
     *
     *     if (depth <= 1e-7) { gl_Position = vec4(2.0, 2.0, 0.0, 1.0); return; }
     *
     * which is not clipping. It moves ONE VERTEX off screen and leaves the
     * triangle it belongs to be rasterized anyway, from its two surviving
     * corners to a made-up third — so a wall the eye is standing inside
     * comes out as an enormous flat wedge of colour with a hard straight
     * edge across the canopy. Astra, berthed, four times: "we still have a
     * camera bug". It was never the camera. Measured from her seat at
     * Waypoint Dock: every cream slab filling the glass was a `!#f2e3a7`
     * light panel whose own projection put all three corners 3,000 pixels
     * BELOW the screen — the picture could not be explained by the
     * geometry, because the picture was not being drawn from the geometry.
     * The same hack is why the MFDs skewed when you turned your head: a
     * console panel a foot from your face straddles the eye plane the
     * moment you look past it.
     *
     * A vertex shader cannot clip — clipping makes new vertices, and only
     * the fixed-function stage between the two shaders can do that. It
     * will do it for free, against -w <= z <= w, if we hand it clip
     * coordinates that are honest for points behind the eye. So:
     *
     *   - x and y are written WITHOUT the divide. Expanding ndc*depth by
     *     hand cancels the 1/depth, leaving a linear function of `rel`
     *     that is exactly the old value wherever the old value existed and
     *     is still finite where it did not. Nothing about the on-screen
     *     picture changes; the arithmetic is the same arithmetic.
     *   - z = depth - 2*uNear, w = depth. Then z >= -w is depth >= uNear:
     *     a real near plane at 10 cm, cut by the rasterizer, with the new
     *     corner vertices it needs. z <= w is always true, so there is
     *     still no far plane, which was the good half of the old comment.
     *
     * w = depth as before, so the varyings still interpolate with the
     * perspective divide, and depth is still written per fragment, so z
     * here is a clip test and nothing else. */
    '  float depth = dot(rel, uFwd);',
    '  vec2 c2 = uCenterPx * 2.0 / uViewportPx;',
    '  vec2 axis = vec2(dot(rel, uRight), dot(rel, uUp));',
    '  vec2 span = axis * (2.0 * uFlen) / uViewportPx;',
    '  vec2 clipXY = vec2((c2.x - 1.0) * depth + span.x,',
    '                     (1.0 - c2.y) * depth + span.y);',
    '  gl_Position = vec4(clipXY, depth - 2.0 * uNear, depth);',
    '}'
  ].join('\n');

  var FRAG_MESH = [
    '#version 300 es',
    'precision highp float;',
    'in vec3 vNrm; in vec3 vCol; in float vEmis; in vec3 vRel;',
    'in float vAlpha;',
    'uniform vec3 uSunDir;',
    'uniform vec3 uFwd;',
    'uniform float uNear, uInvLogRange;',
    /* 0 outdoors, 1 indoors. Set per queued mesh, so a station's own hull
     * shades one way seen from space and another from a berth inside it,
     * on the same frame. */
    'uniform float uIndoors;',
    'uniform vec3 uSkyFill;',     // the ground sky's light, as ambient; 0 off the ground
    'uniform float uSheen;',      // a sun highlight, 0..1 (GL.setSheen); 0 for everything that never asked
    /* Whole-mesh opacity, multiplied into the per-face alpha. 1.0 is the
     * default and the opaque path short-circuits on it, so a hull costs one
     * float compare and nothing else. */
    'uniform float uAlpha;',
    /* A shipyard's paint (Combat.PAINTS, 2026-10-19): rgb hull colour and
     * strength in uPaint, trim in uTrim. w = 0 is yard grey, and every hull
     * but the player's is queued at 0. Same remap as render.js paintFace. */
    'uniform vec4 uPaint;',
    'uniform vec3 uTrim;',
    /* Re-entry plasma. uGlow is Sim.updateHeating's normalised flux and
     * uWind is the direction the air is arriving from, both already
     * computed by the flight model — the shader invents nothing, it only
     * decides where on the hull to put what physics already worked out. */
    'uniform float uGlow;',
    'uniform vec3 uWind;',
    /* THE CUTAWAY: a keyhole from the eye to the ship. xyz is the ship,
     * already relative to the eye, w is 1 when the cut is on. uCutR is
     * (radius at the ship, radius at the eye, rim as a fraction of radius).
     * See GL.setCutaway for why it is a cone and not a plane. */
    'uniform vec4 uCut;',
    'uniform vec3 uCutR;',
    'uniform float uCutCap;',     // the most the cone's radius may be, km (third round)
    'uniform vec3 uCutRim;',
    /* (widest the cut-face band may get in km, quiet zone as a fraction of
     * the local radius, how much colour the quiet zone drains, 0..1). */
    'uniform vec3 uCutBand;',
    /* Which way is up at the berth: the deck under the ship is kept, the
     * walls round it are not. Zero means "keep the whole bubble". */
    'uniform vec3 uCutUp;',
    'uniform vec4 uBoxO;',
    'uniform vec3 uBoxA, uBoxB, uBoxU;',
    'uniform vec4 uBoxD;',
    'uniform float uBoxTop;',
    'out vec4 frag;',

    /* ---- SCREEN-DOOR TRANSPARENCY, and why it is not alpha blending -----
     *
     * An 8x8 ordered dither: keep the fragment if its opacity beats this
     * pixel's threshold, throw it away otherwise. What survives is a fine
     * mesh of holes, and at the size these things occupy on screen the eye
     * reads that as glass.
     *
     * THE REASON IT IS THIS AND NOT BLENDING is depth. This pass draws
     * hulls in queue order with the depth buffer on and no sorting
     * whatsoever — which is the whole trick that lets a ship pass behind a
     * planet correctly. Real alpha blending needs back-to-front order per
     * triangle, so making one face translucent would have dragged a sort
     * into a pass deliberately built without one, and a merged mesh like a
     * port's dressing cannot be sorted as a unit anyway: the glass and the
     * crop it covers are in the same draw call. A discarded fragment writes
     * no depth and a kept one writes its own, so this needs no sort, no
     * blend state, and no separate pass. It composites correctly against
     * anything, including other dithered glass.
     *
     * What it costs: the pattern is locked to screen pixels, so it crawls
     * against a moving hull rather than sticking to it, and below a few
     * pixels across there are not enough samples left for the shape to
     * read. Both are acceptable for a greenhouse pane the size of a
     * thumbnail; neither would be for a full-screen canopy.
     *
     * The matrix is the standard recursive Bayer, built by interleaving the
     * bits of (x^y) and y. Verified in node before it was written here:
     * over an 8x8 tile it is a bijection onto 0..63, and at 50% every 2x2
     * block is exactly half lit, which is what makes it disperse instead of
     * clump. Get those bit positions wrong and it still compiles — it just
     * quietly turns into blotches. */
    'float bayer8(ivec2 p) {',
    '  int x = (p.x ^ p.y) & 7;',
    '  int y = p.y & 7;',
    '  int v = ((x >> 2) & 1)',
    '        | (((y >> 2) & 1) << 1)',
    '        | (((x >> 1) & 1) << 2)',
    '        | (((y >> 1) & 1) << 3)',
    '        | ((x & 1) << 4)',
    '        | ((y & 1) << 5);',
    /* +0.5 centres each level in its bucket, so alpha 1/64 keeps one pixel
     * in 64 rather than none, and alpha 1.0 never discards. */
    '  return (float(v) + 0.5) / 64.0;',
    '}',

    'void main() {',
    '  float a = vAlpha * uAlpha;',
    '  if (a < 0.999 && a < bayer8(ivec2(gl_FragCoord.xy))) discard;',
    /* THE KEYHOLE. Everything inside a cone running from the eye to the
     * ship goes, except a bubble round the ship itself — so the deck it
     * stands on and the cradle holding it survive as a little island at
     * the bottom of the hole. `t` is how far along the eye->ship axis this
     * fragment sits; nothing at or beyond the ship (t >= 1) is cut, which
     * keeps the far wall as the backdrop. Just outside the cone a thin
     * band is painted flat in uCutRim: the cut face of a wall, the way a
     * technical drawing hatches a section, so a wall that has been cut
     * reads as cut and not as a wall that was never there. */
    /* THE BAND IS CAPPED, AND THE METAL ROUND IT IS QUIETED (2026-10-11).
     * Astra, looking at the hole from a berth: "cleaner and less busy
     * without losing the whole cut-away-model thing". Two causes, both
     * here. The band was a FRACTION of the local radius, so at the eye end
     * of the cone — where the radius is largest — it was metres thick and
     * swallowed every pipe and strut that crossed it whole: the ring read
     * as a wreath of orange debris, not as a cut. Now it is that fraction
     * or uCutBand.x km, whichever is thinner, so it stays a drawn edge.
     * And the station's own interior, the many-coloured conduits, was
     * shown at full saturation right up against the edge, competing with
     * it. `near` is 1 at the cut face and falls to 0 over uCutBand.y of
     * the local radius; inside it colour is drained toward a dimmed grey
     * by uCutBand.z and lamp glow is turned off, so the cut is the loudest
     * thing at the hole and the far wall keeps its colour as the backdrop.
     * (Found 2026-11-02: look B, below, dropped both — the band is a plain
     * fraction uCutR.z again and `near` is never set. The uniforms are still
     * uploaded. The ground's band in FRAG_WALL matches what is drawn, not
     * this note.) */
    /* THE BUBBLE IS A FLOOR, NOT A SPHERE (from the trial line). Inside the
     * ground-port section box only what is at or below the deck survives. */
    '  if (uBoxO.w > 0.5) {',
    '    vec3 bq = vRel - uBoxO.xyz;',
    '    float ba = dot(bq, uBoxA), bb = dot(bq, uBoxB), bz = dot(bq, uBoxU);',
    '    if (ba > uBoxD.x && ba < uBoxD.y && abs(bb) < uBoxD.z && bz > uBoxD.w && bz < uBoxTop) discard;',
    '  }',
    '  bool rim = false;',
    '  float rimU = 0.0;',
    '  vec3 cutW = vec3(0.0);',
    '  float near = 0.0;',
    '  if (uCut.w > 0.5) {',
    '    float L2 = max(dot(uCut.xyz, uCut.xyz), 1e-12);',
    '    float t = dot(vRel, uCut.xyz) / L2;',
    '    vec3 q = vRel - uCut.xyz;',
    '    bool deck = length(q) < uCutR.x && dot(q, uCutUp) < uCutR.x * 0.15;',
    '    if (t > 0.0 && t < 1.0 && !deck) {',
    '      float r = min(mix(uCutR.y, uCutR.x, t), uCutCap);',
    '      vec3 off = vRel - uCut.xyz * t;',
    '      float d = length(off);',
    '      if (d < r) discard;',
    '      if (d < r * (1.0 + uCutR.z)) { rim = true; rimU = (d - r) / (r * uCutR.z); cutW = off / max(d, 1e-9); }',
    '    }',
    '  }',
    '  float depth = dot(vRel, uFwd);',
    '  float fd = log2(max(uNear, depth) / uNear) * uInvLogRange;',
    /* LIT FACES WIN TIES. Measured on the courier hull Astra flies: 66 of
     * its 208 self-lit faces — nav lamps, window strips — lie exactly flush
     * on a hull plate, at the same depth to the last bit, so as the camera
     * moves the two take turns being drawn and the red and green lamps
     * flicker. It always did; the glow pass made every swap a flash, which
     * is how it was noticed ("flickering of the red or green surfaces as
     * the ship moves"). A lamp is decoration laid ON a plate, never under
     * one, so it is pulled toward the eye by ~20 steps of the depth buffer:
     * in this log space that is a fixed fraction of distance — ~2 mm at
     * 30 m, ~1 m at 15 km — enough to win a tie and nowhere near enough to
     * show a lamp through a wall. */
    '  if (vEmis > 0.5) fd -= 1.2e-6;',
    '  gl_FragDepth = clamp(fd, 0.0, 1.0);',
    '  vec3 n = normalize(vNrm);',
    /* Winding-agnostic, exactly as the 2D renderer is and for the same
     * reason: every hull is several parts bolted together with no promise
     * of consistent winding, so nothing is culled and the normal is turned
     * to face the camera before it is lit. A mis-wound triangle shades
     * correctly instead of leaving a hole. */
    '  vec3 toCam = normalize(-vRel);',
    '  if (dot(n, toCam) < 0.0) n = -n;',
    '  float lam = max(0.0, dot(n, uSunDir));',
    /* The same two constants paintMesh uses, so a hull looks like itself
     * whichever renderer drew it: 1.15 flat for self-lit faces, and
     * 0.26 + 0.70*NdotL for everything else. */
    /* INDOORS THERE IS NO SUN, and that is the whole of this branch.
     *
     * Astra, from a berth: "the interior is just as grey as the exterior
     * and you cannot tell that you're flying into a thing instead of a
     * solid shape", and later "we have to solve this problem of the walls
     * clipping through themselves". Both are the same thing, and it is not
     * clipping: inside a station you are looking at enormous flat-shaded
     * triangles, every one of them turned to face you and lit by the SUN.
     * The inside of a hangar was being shaded exactly like the outside of
     * the station, so of course the two look identical.
     *
     * The obvious fixes are both dead, and the art says why. Culling what
     * should not be visible — by rays or by winding — needs the geometry to
     * have a consistent front, and measured from any viewpoint at all,
     * inside or out, these meshes are 50/50 front to back. They are open
     * plates bolted together with no promise of winding (36,698 of spine-s
     * edges belong to one triangle, 9,113 to two), so anything winding-
     * based deletes half a station at random.
     *
     * So: no cull, no rays, no normals to trust. Indoors the sun term is
     * replaced by a lamp at the eye, on abs(N·V) so winding cannot matter,
     * over a lower ambient. Surfaces fall off with angle — which is what
     * gives a flat plate its shape — the room reads dark, and the 864
     * self-lit faces the interior bucket already carries become the light
     * in it. */
    '  float lamp = abs(dot(n, toCam));',
    '  vec3 base = vCol;',
    '  if (uPaint.w > 0.0 && vEmis < 0.5) {',
    '    float pl = dot(vCol, vec3(0.299, 0.587, 0.114));',
    '    vec3 pc = (pl > 0.62 ? uTrim : uPaint.rgb) * (0.55 + 0.9 * pl);',
    '    base = mix(vCol, min(pc, vec3(1.0)), uPaint.w);',
    '  }',
    '  vec3 lit = base * (0.26 + 0.70 * lam);',
    /* SKY FILL (2026-11-02): under a daylit ground sky the shade side of a
     * structure is lit by the sky, not black - a sea platform's domes,
     * backlit against the sun, went near-black over a bright sea. Outdoors
     * only (the mix with `dim` below takes it away indoors). */
    '  lit += base * uSkyFill;',
    /* SHEEN (2026-11-02): a sea platform's domes are painted sheet, and in
     * full sun they read as flat white blobs - diffuse alone, at an albedo
     * near white, says nothing about their curve. A Blinn highlight, only
     * on meshes that ask for it (GL.setSheen; every hull and station is 0
     * and unchanged), moves across the faceted petals as the eye does. */
    '  if (uSheen > 0.0 && lam > 0.0) {',
    '    float nh = max(0.0, dot(n, normalize(uSunDir + toCam)));',
    '    lit += vec3(1.0, 0.97, 0.92) * pow(nh, 40.0) * uSheen;',
    '  }',
    /* uIndoors above 1 is the same indoor lamp, brighter (2026-11-01):
     * another ship's cabin seen through her windows (render.js,
     * CABIN_SEEN_GLOW). At exactly 1, every room is lit as it was. */
    '  float ind = min(uIndoors, 1.0);',
    '  vec3 dim = base * (0.10 + 0.55 * lamp) * max(1.0, uIndoors);',
    '  vec3 c = vEmis > 0.5 ? vCol * 1.15 : mix(lit, dim, ind);',
    '  float glow = vEmis > 0.5 ? mix(1.0, 0.28, ind) : 0.0;',
    /* THE ROOM STEPS BACK WHILE YOU LOOK THROUGH IT (2026-10-11). With the
     * keyhole open the subject is the cut and the ship at the bottom of
     * it, and the hangar's neon strips — every one a full-strength lamp —
     * were the next loudest thing on screen. Only indoors, only with the
     * cut on, so a berth seen normally is lit exactly as it was. */


    /* Shock heating, on the faces actually meeting the air.
     *
     * Two terms, because a shock layer has two readable features. `front`
     * is how squarely a face is turned into the flow — that is the nose and
     * the leading edges of the stabilizers, and it is where the gas is
     * being compressed. `edge` is the silhouette: at a grazing angle you
     * are looking along the hot layer rather than through it, so the rim
     * lights up first, which is why re-entry footage shows a ship outlined
     * before it shows a ship glowing.
     *
     * The colour runs the right way round as it gets worse: dull orange
     * first, whitening as the load climbs, because that is the sequence a
     * pilot needs to read at a glance. Added rather than mixed, so the hull
     * underneath stays visible and this looks like heat on a ship instead
     * of a ship repainted. */
    '  if (uGlow > 0.001) {',
    '    float wind = max(0.0, dot(n, uWind));',
    '    float front = pow(wind, 2.2);',
    '    float edge = pow(1.0 - abs(dot(n, toCam)), 2.0);',
    '    float g = uGlow * (front * 0.9 + front * edge * 0.8);',
    /* Whitening is held back deliberately — squared, so the hot core only
     * appears near the top of the range instead of washing the whole face
     * out the moment the ship touches air. */
    '    float hot = clamp(uGlow * uGlow * front * 1.35, 0.0, 1.0);',
    '    vec3 plasma = mix(vec3(1.0, 0.34, 0.10), vec3(1.0, 0.94, 0.86), hot);',
    '    c += plasma * g * 1.15;',
    '    glow += g;',
    '  }',
    /* THE GLOW MASK RIDES IN ALPHA. The world is drawn into an offscreen
     * buffer whose alpha nobody else needs (the canvas is opaque), so the
     * one number the glow pass wants — how much of this pixel is its own
     * light — costs no second render target and no second pass. See
     * POST below. Indoors it is turned well down: the ceiling of a hangar
     * is one great self-lit panel, and at full strength it would halo the
     * whole room instead of the lamps in it. */
    /* The quiet zone round the cut — see THE BAND IS CAPPED above. Luma,
     * not an average, so a saturated red pipe and a grey plate of the same
     * apparent brightness come out the same grey. */
    '  if (near > 0.0) {',
    '    float luma = dot(c, vec3(0.299, 0.587, 0.114));',
    '    c = mix(c, vec3(luma) * 0.6, near * uCutBand.z);',
    '    glow *= 1.0 - near;',
    '  }',
    /* THE CUT FACE, LOOK B (Astra, 2026-10-30, choosing between the two
     * lines' versions side by side: "I want option B"). The inner third is
     * still hot from the beam - self-lit and fed to the glow pass - and the
     * rest is scorched plate, so the edge reads as burnt through rather
     * than drawn on. Replaces the double orange line of 2026-10-26. Not
     * painted where the cut runs ALONG a surface (a floor lying along the
     * line of sight), where a band would read as runway markings. */
    '  if (rim && abs(dot(n, cutW)) < 0.8) {',
    '    if (rimU < 0.35) { c = uCutRim; glow = max(glow, 0.85); }',
    '    else { c = ' + SCORCHED_GLSL + '; glow = 0.0; }',
    '  }',
    '  frag = vec4(c, clamp(glow, 0.0, 1.0));',
    '}'
  ].join('\n');

  /* ---- PANELS: a screen that is actually in the world --------------------
   *
   * THE BUG THIS EXISTS TO KILL. The MFDs were drawn on the 2D canvas by
   * mapping a flat pixel space onto the panel with `ctx.transform`. That
   * transform is built from three of the quad's corners and mathematically
   * cannot use the fourth, because an affine maps a rectangle to a
   * PARALLELOGRAM and nothing else. The panel's outline was clipped with all
   * four corners, so the frame was a true perspective quad while its
   * contents were a parallelogram — they agree only when you are looking
   * straight on, and diverge further the more you turn your head. That is
   * the "holographic-but-not" skew: the readout sliding out of its own
   * housing as the camera moves.
   *
   * Canvas 2D cannot fix it. A homography is not an affine, `ctx.transform`
   * takes six numbers, and the missing two are exactly the ones that carry
   * perspective. So the panel becomes what it always was in the fiction: a
   * lit rectangle bolted to the console, at a place in the world, drawn by
   * the same projection as everything else.
   *
   * Perspective correctness is then FREE and not approximated. `gl_Position`
   * carries w = depth, which is what makes the hardware interpolate the UVs
   * per fragment with the divide included. There is no subdivision here and
   * no seams, because there is nothing being approximated.
   *
   * THE STACKING, which is the part that needs explaining. #gl is z-index 0
   * and #view is z-index 1 with a transparent background, so the 2D cockpit
   * is painted OVER the GPU layer. A panel drawn here would therefore be
   * hidden behind the console it is mounted in — unless the console has a
   * hole where the screen goes. It does: render.js punches the glass out
   * with `destination-out` after drawing the housing, and this shows
   * through it. The housing, the bezel and the stalk stay 2D, because they
   * are opaque furniture and were never the thing that skewed. */

  var VERT_PANEL = [
    '#version 300 es',
    'in vec3 aPos;',           // corner, already relative to the eye, in km
    'in vec2 aUV;',
    'uniform vec3 uRight, uUp, uFwd;',
    'uniform float uFlen;',
    'uniform vec2 uCenterPx, uViewportPx;',
    /* Shared with the fragment stage — one uniform, one upload. */
    'uniform float uNear;',
    'out vec2 vUV;',
    'out float vDepth;',
    'void main() {',
    '  vUV = aUV;',
    '  float depth = dot(aPos, uFwd);',
    '  vDepth = depth;',
    /* Clipped by the hardware against a real near plane, exactly as the
     * mesh pass is and for the same reason — see the long note on
     * VERT_MESH. A console panel sits a foot from the pilot's face, so it
     * is the FIRST thing to straddle the eye plane when you turn your
     * head, and parking one corner off screen is what made the readout
     * slide out of its housing. */
    '  vec2 c2 = uCenterPx * 2.0 / uViewportPx;',
    '  vec2 axis = vec2(dot(aPos, uRight), dot(aPos, uUp));',
    '  vec2 span = axis * (2.0 * uFlen) / uViewportPx;',
    '  vec2 clipXY = vec2((c2.x - 1.0) * depth + span.x,',
    '                     (1.0 - c2.y) * depth + span.y);',
    /* w = depth still: it is what makes vUV interpolate with the
     * perspective divide instead of linearly. */
    '  gl_Position = vec4(clipXY, depth - 2.0 * uNear, depth);',
    '}'
  ].join('\n');

  var FRAG_PANEL = [
    '#version 300 es',
    'precision highp float;',
    'in vec2 vUV;',
    'in float vDepth;',
    'uniform sampler2D uTex;',
    'uniform float uNear, uInvLogRange;',
    'uniform float uAlpha;',
    'out vec4 frag;',
    'void main() {',
    '  gl_FragDepth = clamp(log2(max(uNear, vDepth) / uNear) * uInvLogRange, 0.0, 1.0);',
    '  vec4 c = texture(uTex, vUV);',
    /* OPAQUE-BACKED, not additive, and that is a correction to the obvious
     * first instinct. A lit screen in a dark cockpit reads as additive, and
     * the 2D path did use `lighter` — but the 2D path was drawing onto a
     * console that was already there. Here the console has a HOLE cut in it
     * so this can show through, and behind the hole is open space. Additive
     * over that would put the starfield through the middle of the readout.
     * So the panel is a surface: it covers what is behind it. */
    '  frag = vec4(c.rgb, c.a * uAlpha);',
    '}'
  ].join('\n');

  /* ---- POST: the glow, kept in the spirit of FE2 and FFE ---------------
   *
   * WHAT GLOWS is decided by the hulls, not by brightness. Every mesh writes
   * into the alpha of the offscreen scene how much of each pixel is its OWN
   * light — a window, a nav lamp, a light panel, re-entry plasma — and
   * nothing else does. So a sunlit plate, however white, never blooms; a
   * dim red strobe in shadow does. Thresholding on brightness, which is how
   * bloom is usually done, would have haloed every lit hull and every
   * planet limb, and washed the picture into a modern haze.
   *
   * WHAT IT LOOKS LIKE is Astra's brief: "glow, but still in the spirit of
   * FE2 and FFE". Those games are crisp flat polygons, and a soft
   * photographic bloom fights that look rather than adding to it. So:
   *
   *   - TIGHT. One blur level at half resolution, a short kernel — a halo
   *     that hugs the light, not a wash across the screen. The usual wide
   *     quarter-resolution layer was left out on purpose (and is cheaper
   *     left out).
   *   - STEPPED. The halo is quantised into a few flat bands before it is
   *     added, so a lamp reads as a lit shape with a ring or two round it —
   *     closer to FFE's flat light flares than to a gradient.
   *   - THE POLYGONS STAY SHARP. The scene itself is never blurred; only
   *     the halo is added on top.
   *
   * BUDGET, because the RX 540 is a 4 GB entry-level card and Astra asked
   * not to overstress it: one multisampled scene buffer (which replaces the
   * canvas's own antialiasing rather than adding to it), one resolved copy,
   * two half-resolution halo buffers. About 75 MB at 1920×1080, and five
   * cheap full-screen passes. If any of it cannot be created the layer
   * draws straight to the canvas exactly as it always did. */
  var VERT_POST = [
    '#version 300 es',
    'out vec2 vUV;',
    /* One oversized triangle covers the screen; no vertex buffer at all. */
    'void main() {',
    '  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));',
    '  vUV = p;',
    '  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);',
    '}'
  ].join('\n');

  /* Scene → half-resolution halo source: colour weighted by its own glow
   * mask, four taps so a one-pixel strobe is not lost in the downsample. */
  var FRAG_EXTRACT = [
    '#version 300 es',
    'precision mediump float;',
    'in vec2 vUV;',
    'uniform sampler2D uSrc;',
    'uniform vec2 uTexel;',
    'out vec4 frag;',
    'vec3 tap(vec2 o) { vec4 c = texture(uSrc, vUV + o * uTexel); return c.rgb * c.a; }',
    'void main() {',
    '  vec3 s = tap(vec2(-0.5, -0.5)) + tap(vec2(0.5, -0.5))',
    '         + tap(vec2(-0.5, 0.5)) + tap(vec2(0.5, 0.5));',
    /* max, not just the mean, so a single lit pixel survives at full
     * strength instead of being averaged to a quarter. */
    '  vec3 m = max(max(tap(vec2(-0.5,-0.5)), tap(vec2(0.5,-0.5))),',
    '               max(tap(vec2(-0.5, 0.5)), tap(vec2(0.5, 0.5))));',
    '  frag = vec4(mix(s * 0.25, m, 0.5), 1.0);',
    '}'
  ].join('\n');

  /* Separable blur, 9 taps folded into 5 bilinear fetches. Short on
   * purpose — see TIGHT above. */
  var FRAG_BLUR = [
    '#version 300 es',
    'precision mediump float;',
    'in vec2 vUV;',
    'uniform sampler2D uSrc;',
    'uniform vec2 uStep;',
    'out vec4 frag;',
    'void main() {',
    '  vec3 c = texture(uSrc, vUV).rgb * 0.2270;',
    '  c += texture(uSrc, vUV + uStep * 1.3846).rgb * 0.3162;',
    '  c += texture(uSrc, vUV - uStep * 1.3846).rgb * 0.3162;',
    '  c += texture(uSrc, vUV + uStep * 3.2308).rgb * 0.0703;',
    '  c += texture(uSrc, vUV - uStep * 3.2308).rgb * 0.0703;',
    '  frag = vec4(c, 1.0);',
    '}'
  ].join('\n');

  /* Scene + stepped halo, onto the canvas. */
  var FRAG_COMPOSITE = [
    '#version 300 es',
    'precision mediump float;',
    'in vec2 vUV;',
    'uniform sampler2D uScene;',
    'uniform sampler2D uHalo;',
    'uniform float uGain;',
    'uniform float uBands;',
    'out vec4 frag;',
    'void main() {',
    '  vec3 base = texture(uScene, vUV).rgb;',
    '  vec3 h = texture(uHalo, vUV).rgb * uGain;',
    /* THE STEPS. Quantise the halo's strength, keep its hue. The floor
     * after the scale is what makes rings rather than a ramp; the small
     * bias keeps the faintest band from vanishing entirely. uBands 0 turns
     * stepping off (a smooth halo), for comparison. */
    '  if (uBands > 0.5) {',
    '    float k = max(h.r, max(h.g, h.b));',
    '    float q = floor(k * uBands + 0.35) / uBands;',
    '    h = k > 1e-4 ? h * (q / k) : vec3(0.0);',
    '  }',
    '  frag = vec4(base + h, 1.0);',
    '}'
  ].join('\n');

  /* ---- RINGS: a giant's ring, as one flat quad in its equator ------------
   *
   * One quad per ring, 2*outer on a side, laid in the planet's equatorial
   * plane. The shader decides what is actually there: the radius from the
   * planet's centre, then the ring's optical depth at that radius by the
   * SAME function rings.js uses (Rings.ringDensity) — same profile, same
   * three octaves of ringlets, same gaps, same integer hash — so the ice a
   * scan or a laser finds is the ice on the screen.
   *
   * Three pieces of light, each one cheap and each one a thing a real ring
   * does:
   *   - the lit face and the unlit face differ. From the sunward side you
   *     see reflected light; from the other side only what scatters
   *     through, which is dim and brightest where the ring is thin;
   *   - the planet's shadow falls across the ring, tested per fragment as
   *     a ray from the ring point toward the sun against the planet's
   *     sphere — in planet-centred coordinates, so the numbers stay small;
   *   - the slant of the view thickens it: optical depth tau seen at angle
   *     mu is tau / mu, which is why a ring nearly edge-on reads as a thin
   *     hard line rather than fading away.
   *
   * Drawn AFTER the meshes and with depth writes off: it is translucent,
   * so it blends over whatever is behind it and is hidden by whatever is
   * in front. One quad, a few dozen ALU per pixel — the RX 540 does not
   * notice it, and a ring off screen or under a pixel is never queued. */
  var VERT_RING = [
    '#version 300 es',
    'in vec2 aCorner;',
    'uniform vec3 uCenterRel, uE1, uE2;',
    'uniform float uOuter;',
    'uniform vec3 uRight, uUp, uFwd;',
    'uniform float uFlen;',
    'uniform vec2 uCenterPx, uViewportPx;',
    'uniform float uNear;',
    'out vec2 vLocal; out vec3 vRel;',
    'void main() {',
    '  vLocal = aCorner;',
    '  vec3 rel = uCenterRel + (uE1 * aCorner.x + uE2 * aCorner.y) * uOuter;',
    '  vRel = rel;',
    '  float depth = dot(rel, uFwd);',
    '  vec2 c2 = uCenterPx * 2.0 / uViewportPx;',
    '  vec2 axis = vec2(dot(rel, uRight), dot(rel, uUp));',
    '  vec2 span = axis * (2.0 * uFlen) / uViewportPx;',
    '  vec2 clipXY = vec2((c2.x - 1.0) * depth + span.x,',
    '                     (1.0 - c2.y) * depth + span.y);',
    '  gl_Position = vec4(clipXY, depth - 2.0 * uNear, depth);',
    '}'
  ].join('\n');

  var FRAG_RING = [
    '#version 300 es',
    'precision highp float;',
    'precision highp int;',
    'in vec2 vLocal; in vec3 vRel;',
    'uniform vec3 uE1, uE2, uN, uSunDir, uFwd, uColor;',
    'uniform float uOuter, uInner, uOpacity, uPlanetR;',
    'uniform int uSeed, uGapN;',
    'uniform vec2 uGaps[8];',
    'uniform float uNear, uInvLogRange;',
    /* Where the sheet hands over to the rock (km from the eye): fully gone
     * inside x, fully there beyond y. */
    'uniform vec2 uFade;',
    'out vec4 frag;',
    /* Bit-identical to rings.js mix32/vhash — see the note there. */
    'uint mix32(uint h) {',
    '  h = (h ^ (h >> 16u)) * 0x7feb352du;',
    '  h = (h ^ (h >> 15u)) * 0x846ca68bu;',
    '  return h ^ (h >> 16u);',
    '}',
    'float vhash(int i, int s) {',
    '  return float(mix32(uint(i) ^ (uint(s) * 0x27d4eb2du))) / 4294967296.0;',
    '}',
    'float vnoise(float x, int s) {',
    '  float fi = floor(x); float f = x - fi; int i = int(fi);',
    '  float u = f * f * (3.0 - 2.0 * f);',
    '  return mix(vhash(i, s), vhash(i + 1, s), u);',
    '}',
    'void main() {',
    '  float r = length(vLocal) * uOuter;',
    '  if (r <= uInner || r >= uOuter) discard;',
    '  float x = (r - uInner) / (uOuter - uInner);',
    '  float d = smoothstep(0.0, 0.035, x) * (1.0 - smoothstep(0.955, 1.0, x));',
    '  float n = 0.52 + 0.30 * vnoise(x * 23.0, uSeed) + 0.14 * vnoise(x * 97.0, uSeed + 101)',
    '          + 0.10 * vnoise(x * 389.0, uSeed + 211);',
    '  d *= uOpacity * min(1.15, n);',
    '  for (int g = 0; g < 8; g++) {',
    '    if (g >= uGapN) break;',
    '    d *= smoothstep(uGaps[g].y * 0.55, uGaps[g].y, abs(x - uGaps[g].x));',
    '  }',
    '  d = clamp(d, 0.0, 0.999);',
    '  if (d < 0.003) discard;',
    '  float depth = dot(vRel, uFwd);',
    '  gl_FragDepth = clamp(log2(max(uNear, depth) / uNear) * uInvLogRange, 0.0, 1.0);',
    /* Seen through at a slant, tau / mu. */
    '  vec3 view = normalize(vRel);',
    '  float mu = max(0.03, abs(dot(view, uN)));',
    '  float a = 1.0 - pow(1.0 - d, 1.0 / mu);',
    /* UP CLOSE THE SHEET IS THE ROCK. From inside a ring every fragment
     * is seen nearly edge-on, so tau / mu drives the sheet opaque and it
     * paints straight over the chunks it stands for — measured, 160 rocks
     * queued and none of them visible. Within the radius main.js draws
     * real chunks in, the sheet steps aside for them. */
    '  a *= smoothstep(uFade.x, uFade.y, length(vRel));',
    '  if (a < 0.002) discard;',
    /* Which face you are looking at. */
    '  float sunN = dot(uSunDir, uN);',
    '  float elev = abs(sunN);',
    '  bool litFace = sunN * dot(-view, uN) > 0.0;',
    '  float lum = litFace ? (0.30 + 0.75 * sqrt(elev))',
    '                      : (0.06 + 0.55 * sqrt(elev) * (1.0 - d));',
    /* The planet\'s shadow, in planet-centred km. */
    '  vec3 P = (uE1 * vLocal.x + uE2 * vLocal.y) * uOuter;',
    '  float tt = dot(-P, uSunDir);',
    '  if (tt > 0.0) {',
    '    float miss = length(-P - uSunDir * tt);',
    '    lum *= mix(0.04, 1.0, smoothstep(uPlanetR * 0.985, uPlanetR * 1.02, miss));',
    '  }',
    '  frag = vec4(uColor * lum, a);',
    '}'
  ].join('\n');

  /* ---- plumbing --------------------------------------------------------- */

  function compile(gl, type, src, label) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      /* Shader errors are otherwise silent and the screen simply stays
       * black, which is a miserable thing to debug. Say which shader, and
       * hand back the driver's own message. */
      var log = gl.getShaderInfoLog(s);
      gl.deleteShader(s);
      throw new Error('gl.js: ' + label + ' shader failed to compile:\n' + log);
    }
    return s;
  }

  function link(gl, vsSrc, fsSrc, label) {
    var p = gl.createProgram();
    var vs = compile(gl, gl.VERTEX_SHADER, vsSrc, label + ' vertex');
    var fs = compile(gl, gl.FRAGMENT_SHADER, fsSrc, label + ' fragment');
    gl.attachShader(p, vs); gl.attachShader(p, fs);
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      throw new Error('gl.js: ' + label + ' failed to link:\n' + gl.getProgramInfoLog(p));
    }
    gl.deleteShader(vs); gl.deleteShader(fs);
    return p;
  }

  function uniforms(gl, program, names) {
    var u = {};
    for (var i = 0; i < names.length; i++) {
      u[names[i]] = gl.getUniformLocation(program, names[i]);
    }
    return u;
  }

  /* '#rrggbb' -> [r,g,b] in 0..1. The generator speaks CSS hex and there is
   * no reason to make it stop. */
  function rgb(hex, fallback) {
    if (typeof hex !== 'string' || hex.charAt(0) !== '#' || hex.length !== 7) {
      return fallback || [0.6, 0.65, 0.72];
    }
    var n = parseInt(hex.slice(1), 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }

  /* ---- the layer -------------------------------------------------------- */

  var gl = null, canvas = null, prog = null, uni = null, quad = null, vao = null;
  var skyProg = null, skyUni = null, groundSky = null;
  var wallProg = null, wallUni = null, wallQ = null;
  var footProg = null, footUni = null, foot = null;   // THE FOOTPRINT (sixth round)
  /* The glow pass's resources — see POST. `post` stays null when any of it
   * failed, and then every frame goes straight to the canvas as before. */
  var post = null;
  var glowOn = true;
  var queue = [], vw = 0, vh = 0;
  var starProg = null, starUni = null, starVao = null, starCount = 0;
  var meshProg = null, meshUni = null, meshQueue = [], meshSeq = 0;
  var panelProg = null, panelUni = null, panelVao = null, panelBuf = null;
  var panelQueue = [], panelSlots = [];
  var ringProg = null, ringUni = null, ringVao = null, ringQueue = [];
  /* Tears (2026-10-21): the lens, the tear quads, and the lightning. */
  var tearN = 0, tearA = new Float32Array(16), tearK = new Float32Array(16);
  var tearProg = null, tearUni = null, tearVao = null, tearQueue = [];
  var boltProg = null, boltUni = null, boltVao = null, boltBuf = null, boltQueue = [];

  /* The logarithmic depth range. NEAR is ten centimetres, because the
   * cockpit view sits about a metre from its own console; FAR is far past
   * anything a system contains. Everything in between distributes evenly
   * across the buffer, which linear depth cannot begin to do over fourteen
   * orders of magnitude. */
  var ZERO3 = { x: 0, y: 0, z: 0 };
  var DEPTH_NEAR = 1e-4;                                  // km
  var DEPTH_FAR = 1e10;                                   // km
  var INV_LOG_RANGE = 1 / Math.log2(DEPTH_FAR / DEPTH_NEAR);

  /* Returns false rather than throwing when WebGL2 is missing. The 2D
   * renderer is still complete and still correct, so an old driver should
   * cost you weather, not the game. */
  GL.init = function (glCanvas) {
    canvas = glCanvas;
    /* 'high-performance', not 'low-power'. On a laptop with an integrated
     * and a discrete GPU this hint is what the browser reads to choose
     * between them, and 'low-power' meant the discrete card was never
     * picked even when it was there. Electron's own
     * force_high_performance_gpu switch (electron/main.js) is the
     * process-wide half of the same request; a context asking for
     * low-power can undercut it, so the two have to agree. It is a hint,
     * not a command: with one GPU it changes nothing. */
    try {
      gl = canvas.getContext('webgl2', {
        /* antialias OFF on the canvas: the world is drawn into a
         * multisampled offscreen buffer instead (see POST), and paying for
         * both would double the memory for nothing. The one cost: if the
         * offscreen buffer cannot be made, edges go unsmoothed. */
        alpha: false, antialias: false, depth: true,
        premultipliedAlpha: false, powerPreference: 'high-performance'
      });
    } catch (e) { gl = null; }
    if (!gl) { GL.available = false; return false; }

    /* WHICH CHIP WE ACTUALLY GOT. A frame time measured on a dual-GPU
     * laptop means nothing until you know which adapter produced it, and
     * the hint above is a request, not a guarantee. Recorded once, never
     * per frame. Null where the browser withholds it. */
    GL.adapter = null;
    try {
      var dbg = gl.getExtension('WEBGL_debug_renderer_info');
      if (dbg) GL.adapter = String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL));
    } catch (e) { GL.adapter = null; }

    try {
      prog = link(gl, VERT_BODY, FRAG_BODY, 'body');
      starProg = link(gl, VERT_STARS, FRAG_STARS, 'stars');
      starUni = uniforms(gl, starProg, ['uRight', 'uUp', 'uFwd', 'uFlen',
                                        'uCenterPx', 'uViewportPx', 'uHead', 'uBeta',
                                        'uTear', 'uTearK', 'uTearN', 'uImage']);
      meshProg = link(gl, VERT_MESH, FRAG_MESH, 'mesh');
      meshUni = uniforms(gl, meshProg, ['uModelRel', 'uRot', 'uScale',
                                        'uRight', 'uUp', 'uFwd', 'uFlen',
                                        'uCenterPx', 'uViewportPx', 'uSunDir',
                                        'uNear', 'uInvLogRange', 'uIndoors', 'uSkyFill', 'uSheen',
                                        'uGlow', 'uWind',
                                        'uAlpha', 'uCut', 'uCutR', 'uCutRim',
                                        'uCutBand', 'uCutUp', 'uCutCap',
                                        'uBoxO', 'uBoxA', 'uBoxB', 'uBoxU', 'uBoxD', 'uBoxTop',
                                        'uPaint', 'uTrim',
                                        'uTear', 'uTearK', 'uTearN']);
    } catch (e) {
      if (global.console) console.error(e.message);
      GL.available = false; gl = null; return false;
    }

    uni = uniforms(gl, prog, ['uCenterPx', 'uQuadPx', 'uViewportPx', 'uPad',
                              'uRight', 'uUp', 'uFwd', 'uSunDir', 'uColor',
                              'uIsStar', 'uAtmo', 'uAtmoColor', 'uCloud',
                              'uSeed', 'uSpinAxis', 'uSpinPhase', 'uDeckPhase',
                              'uBandPhase', 'uShearPhase',
                              'uStormSalt', 'uStormSaltPrev', 'uStormSlow',
                              'uStormPhase', 'uFlashGain',
                              'uWeather', 'uCenterDepth', 'uWorldRadius',
                              'uNear', 'uInvLogRange', 'uBanded', 'uBand',
                              'uOcean', 'uSeaColor', 'uIce',
                              'uCenterRel', 'uScreenPx', 'uFlen',
                              'uHoleRel', 'uHoleR', 'uHoleDepth', 'uHaloPush',
                              'uSeaRel', 'uSeaE', 'uSeaN', 'uSeaK', 'uSeaPost',
                              'uConeS', 'uConeR', 'uSkyA', 'uSkyUp', 'uSkySun',
                              'uBoxO', 'uBoxA', 'uBoxB', 'uBoxU', 'uBoxD', 'uBoxTop',
                              'uGdOn', 'uGdAnchorRel', 'uGdCell', 'uGdFrac', 'uGdCq', 'uBio',
                              'uTear', 'uTearK', 'uTearN']);

    /* The pit wall (GL.queueGroundWall): one full-screen pass. */
    try {
      wallProg = link(gl, VERT_BODY, FRAG_WALL, 'wall');
      wallUni = uniforms(gl, wallProg, ['uWS', 'uWR', 'uRight', 'uUp', 'uFwd', 'uScreenPx',
                                        'uFlen', 'uCenterPx', 'uQuadPx', 'uViewportPx', 'uNear', 'uInvLogRange',
                                        'uWEnt', 'uWE', 'uWN', 'uWU', 'uWRoomA', 'uWRoomB',
                                        'uWShip', 'uWFold', 'uWPh3', 'uSunDir', 'uWPlanet', 'uWRim',
                                        'uWMask', 'uWMaskB']);
    } catch (e) { wallProg = null; if (global.console) console.error(e.message); }
    /* Its footprint pass (THE FOOTPRINT). Its own try: without it the
     * street keeps its band everywhere, as before the sixth round. */
    try {
      var aPosLoc = meshProg ? gl.getAttribLocation(meshProg, 'aPos') : -1;
      if (aPosLoc >= 0) {
        footProg = link(gl, vertFootSrc(aPosLoc), FRAG_FOOT, 'footprint');
        footUni = uniforms(gl, footProg, ['uFOff', 'uFRot', 'uFScale', 'uFBox', 'uFCurv', 'uFMin']);
      }
    } catch (e) { footProg = null; if (global.console) console.error(e.message); }

    /* The ground sky pass (GL.drawGroundSky). Its own try: a sky that
     * fails to compile costs the sky, not the world. */
    try {
      skyProg = link(gl, VERT_BODY, FRAG_SKY, 'sky');
      skyUni = uniforms(gl, skyProg, ['uCenterPx', 'uQuadPx', 'uViewportPx',
                                      'uRight', 'uUp', 'uFwd', 'uScreenPx', 'uFlen',
                                      'uSkyA', 'uSkyUp', 'uSkySun']);
    } catch (e) { skyProg = null; if (global.console) console.error(e.message); }

    quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER,
                  new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    var loc = gl.getAttribLocation(prog, 'aCorner');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    /* The panel pass. Six vertices per panel — two triangles — rebuilt every
     * frame into one dynamic buffer, because a console has a handful of
     * screens and they move with the ship every single frame. There is
     * nothing here worth caching. */
    try {
      panelProg = link(gl, VERT_PANEL, FRAG_PANEL, 'panel');
      panelUni = uniforms(gl, panelProg, ['uRight', 'uUp', 'uFwd', 'uFlen',
                                          'uCenterPx', 'uViewportPx',
                                          'uNear', 'uInvLogRange',
                                          'uTex', 'uAlpha']);
      panelBuf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, panelBuf);
      gl.bufferData(gl.ARRAY_BUFFER, 6 * 5 * 4, gl.DYNAMIC_DRAW);
      panelVao = gl.createVertexArray();
      gl.bindVertexArray(panelVao);
      var pPos = gl.getAttribLocation(panelProg, 'aPos');
      var pUV = gl.getAttribLocation(panelProg, 'aUV');
      if (pPos >= 0) {
        gl.enableVertexAttribArray(pPos);
        gl.vertexAttribPointer(pPos, 3, gl.FLOAT, false, 20, 0);
      }
      if (pUV >= 0) {
        gl.enableVertexAttribArray(pUV);
        gl.vertexAttribPointer(pUV, 2, gl.FLOAT, false, 20, 12);
      }
      gl.bindVertexArray(null);
    } catch (e2) {
      /* A panel program that will not compile must not cost the player the
       * world. The 2D MFD path is still there and still correct — skewed,
       * which is the bug this was meant to fix, but a skewed readout beats
       * a black screen. render.js asks `GL.panels` before using this. */
      if (global.console) console.error(e2.message);
      panelProg = null;
    }

    try {
      post = {
        extract: link(gl, VERT_POST, FRAG_EXTRACT, 'glow-extract'),
        blur: link(gl, VERT_POST, FRAG_BLUR, 'glow-blur'),
        composite: link(gl, VERT_POST, FRAG_COMPOSITE, 'glow-composite'),
        vao: gl.createVertexArray(),
        w: 0, h: 0
      };
      post.uExtract = uniforms(gl, post.extract, ['uSrc', 'uTexel']);
      post.uBlur = uniforms(gl, post.blur, ['uSrc', 'uStep']);
      post.uComposite = uniforms(gl, post.composite, ['uScene', 'uHalo', 'uGain', 'uBands']);
      post.samples = Math.min(4, gl.getParameter(gl.MAX_SAMPLES) || 0);
    } catch (e3) {
      if (global.console) console.error(e3.message);
      post = null;
    }

    /* The ring pass. Like panels, allowed to fail on its own: a driver that
     * will not build it costs you rings, not the world. */
    try {
      ringProg = link(gl, VERT_RING, FRAG_RING, 'ring');
      ringUni = uniforms(gl, ringProg, ['uCenterRel', 'uE1', 'uE2', 'uN', 'uOuter',
                                        'uInner', 'uOpacity', 'uPlanetR', 'uSeed',
                                        'uGapN', 'uGaps', 'uColor', 'uSunDir',
                                        'uRight', 'uUp', 'uFwd', 'uFlen',
                                        'uCenterPx', 'uViewportPx',
                                        'uNear', 'uInvLogRange', 'uFade']);
      ringVao = gl.createVertexArray();
      gl.bindVertexArray(ringVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, quad);
      var rloc = gl.getAttribLocation(ringProg, 'aCorner');
      gl.enableVertexAttribArray(rloc);
      gl.vertexAttribPointer(rloc, 2, gl.FLOAT, false, 0, 0);
      gl.bindVertexArray(null);
    } catch (e4) {
      if (global.console) console.error(e4.message);
      ringProg = null;
    }

    /* The tear and its lightning. Each allowed to fail alone: a driver that
     * will not build them costs you the look of a wake, and main.js falls
     * back to the 2D cloud (GL.tears false). */
    try {
      tearProg = link(gl, VERT_TEAR, FRAG_TEAR, 'tear');
      tearUni = uniforms(gl, tearProg, ['uCenterPx', 'uQuadPx', 'uViewportPx', 'uDepth',
                                        'uRoll', 'uE', 'uW', 'uH',
                                        'uOpen', 'uGlow', 'uMode', 'uT']);
      tearVao = gl.createVertexArray();
      gl.bindVertexArray(tearVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, quad);
      var tloc = gl.getAttribLocation(tearProg, 'aCorner');
      gl.enableVertexAttribArray(tloc);
      gl.vertexAttribPointer(tloc, 2, gl.FLOAT, false, 0, 0);
      gl.bindVertexArray(null);
    } catch (e5) {
      if (global.console) console.error(e5.message);
      tearProg = null;
    }
    try {
      boltProg = link(gl, VERT_BOLT, FRAG_BOLT, 'bolt');
      boltUni = uniforms(gl, boltProg, ['uViewportPx', 'uDepth', 'uTint']);
      boltBuf = gl.createBuffer();
      boltVao = gl.createVertexArray();
      gl.bindVertexArray(boltVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, boltBuf);
      var bp = gl.getAttribLocation(boltProg, 'aPx');
      var bw = gl.getAttribLocation(boltProg, 'aW');
      gl.enableVertexAttribArray(bp);
      gl.vertexAttribPointer(bp, 2, gl.FLOAT, false, 24, 0);
      gl.enableVertexAttribArray(bw);
      gl.vertexAttribPointer(bw, 4, gl.FLOAT, false, 24, 8);
      gl.bindVertexArray(null);
    } catch (e6) {
      if (global.console) console.error(e6.message);
      boltProg = null;
    }

    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    GL.available = true;
    GL.panels = !!panelProg;
    GL.rings = !!ringProg;
    GL.tears = !!(tearProg && boltProg);
    return true;
  };

  GL.available = false;
  /* Defaulted alongside `available`, so a caller can ask before init has run
   * or after it failed without a special case. The panel program is allowed
   * to fail on its own while the rest of the layer still works. */
  GL.panels = false;

  /* Upload the starfield once. It is generated by Render.makeStarfield from
   * the system seed and never changes, so it has no business being rebuilt
   * per frame. */
  GL.setStarfield = function (stars) {
    if (!gl || !stars || !stars.length) return;
    var dirs = new Float32Array(stars.length * 3);
    /* Brightness, size, and the star's own temperature — the last is only
     * read in cruise, where the shader shifts it (see VERT_STARS). */
    var mags = new Float32Array(stars.length * 3);
    var R = global.Render;
    for (var i = 0; i < stars.length; i++) {
      var s = stars[i];
      dirs[i * 3] = s.d.x; dirs[i * 3 + 1] = s.d.y; dirs[i * 3 + 2] = s.d.z;
      mags[i * 3] = s.b; mags[i * 3 + 1] = Math.max(1, s.size);
      mags[i * 3 + 2] = (R && R.starTemp) ? R.starTemp(s) : 6500;
    }
    starVao = gl.createVertexArray();
    gl.bindVertexArray(starVao);

    var bd = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, bd);
    gl.bufferData(gl.ARRAY_BUFFER, dirs, gl.STATIC_DRAW);
    var ld = gl.getAttribLocation(starProg, 'aDir');
    gl.enableVertexAttribArray(ld);
    gl.vertexAttribPointer(ld, 3, gl.FLOAT, false, 0, 0);

    var bm = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, bm);
    gl.bufferData(gl.ARRAY_BUFFER, mags, gl.STATIC_DRAW);
    var lm = gl.getAttribLocation(starProg, 'aMag');
    gl.enableVertexAttribArray(lm);
    gl.vertexAttribPointer(lm, 3, gl.FLOAT, false, 0, 0);

    gl.bindVertexArray(null);
    starCount = stars.length;
  };

  /* The cruise trails (see VERT_TRAIL), drawn now — call it straight after
   * drawStars, so everything later in the frame covers them. `segs` is
   * Render.cruiseTrails' flat list, nine numbers a segment: ax, ay, bx, by
   * in CSS pixels, r, g, b in 0-255, alpha, width in pixels. Compiled on
   * first use and on its own: a trail program that will not build costs the
   * trails, never the rest of the world layer. Returns whether it drew. */
  var trailProg = null, trailUni = null, trailVao = null, trailBuf = null;
  var trailBroken = false, trailData = null;
  GL.drawTrails = function (segs) {
    if (!gl || trailBroken || !segs || !segs.length) return false;
    if (!trailProg) {
      try {
        trailProg = link(gl, VERT_TRAIL, FRAG_TRAIL, 'trails');
        trailUni = uniforms(gl, trailProg, ['uViewportPx']);
        trailVao = gl.createVertexArray();
        gl.bindVertexArray(trailVao);
        trailBuf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, trailBuf);
        var lp = gl.getAttribLocation(trailProg, 'aPx');
        var lc = gl.getAttribLocation(trailProg, 'aCol');
        var lu = gl.getAttribLocation(trailProg, 'aUV');
        gl.enableVertexAttribArray(lp);
        gl.vertexAttribPointer(lp, 2, gl.FLOAT, false, 32, 0);
        gl.enableVertexAttribArray(lc);
        gl.vertexAttribPointer(lc, 4, gl.FLOAT, false, 32, 8);
        gl.enableVertexAttribArray(lu);
        gl.vertexAttribPointer(lu, 2, gl.FLOAT, false, 32, 24);
        gl.bindVertexArray(null);
      } catch (e) {
        trailBroken = true;
        if (global.console) console.error(e.message);
        return false;
      }
    }
    var n = Math.floor(segs.length / 9), need = n * 6 * 8;
    if (!trailData || trailData.length < need) trailData = new Float32Array(Math.max(need, 6 * 8 * 1024));
    var o = 0;
    for (var i = 0; i < n; i++) {
      var k = i * 9;
      var ax = segs[k], ay = segs[k + 1], bx = segs[k + 2], by = segs[k + 3];
      var dx = bx - ax, dy = by - ay, L = Math.sqrt(dx * dx + dy * dy);
      if (!(L > 1e-3)) continue;
      /* Feathered: the quad is wider than the streak so the gaussian in
       * FRAG_TRAIL has room to fall off — a soft smear, not a ruled line. */
      var hw = segs[k + 8] * 0.5 * 2.2 + 1.0;
      var nx = -dy / L * hw, ny = dx / L * hw;
      var r = segs[k + 4] / 255, g = segs[k + 5] / 255, b = segs[k + 6] / 255, a = segs[k + 7];
      var quad = [ax + nx, ay + ny, 1, 0,  ax - nx, ay - ny, -1, 0,  bx + nx, by + ny, 1, 1,
                  bx + nx, by + ny, 1, 1,  ax - nx, ay - ny, -1, 0,  bx - nx, by - ny, -1, 1];
      for (var q = 0; q < 24; q += 4) {
        trailData[o++] = quad[q]; trailData[o++] = quad[q + 1];
        trailData[o++] = r; trailData[o++] = g; trailData[o++] = b; trailData[o++] = a;
        trailData[o++] = quad[q + 2]; trailData[o++] = quad[q + 3];
      }
    }
    if (!o) return true;
    gl.disable(gl.DEPTH_TEST);
    gl.colorMask(true, true, true, false);     // never the glow mask, as for stars
    gl.useProgram(trailProg);
    gl.bindVertexArray(trailVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, trailBuf);
    gl.bufferData(gl.ARRAY_BUFFER, trailData.subarray(0, o), gl.DYNAMIC_DRAW);
    gl.uniform2f(trailUni.uViewportPx, vw, vh);
    gl.drawArrays(gl.TRIANGLES, 0, o / 8);
    gl.bindVertexArray(null);
    gl.colorMask(true, true, true, true);
    return true;
  };

  /* `head` and `beta` are cruise's: the direction of travel and speed over
   * c. Omitted (or beta under 0.02) the sky is the ordinary one. */
  GL.drawStars = function (cam, head, beta) {
    if (!gl || !starVao || !starCount) return;
    /* The backdrop, and nothing is ever behind it — so it neither tests
     * nor writes depth, and everything drawn afterwards simply covers it. */
    gl.disable(gl.DEPTH_TEST);
    /* Stars never touch the glow mask (alpha) — see POST. */
    gl.colorMask(true, true, true, false);
    gl.useProgram(starProg);
    gl.bindVertexArray(starVao);
    gl.uniform3f(starUni.uRight, cam.r.x, cam.r.y, cam.r.z);
    gl.uniform3f(starUni.uUp, cam.u.x, cam.u.y, cam.u.z);
    gl.uniform3f(starUni.uFwd, cam.f.x, cam.f.y, cam.f.z);
    gl.uniform1f(starUni.uFlen, cam.flen);
    gl.uniform2f(starUni.uCenterPx, cam.cx, cam.cy);
    gl.uniform2f(starUni.uViewportPx, vw, vh);
    var hd = head || { x: 0, y: 0, z: 1 };
    gl.uniform3f(starUni.uHead, hd.x, hd.y, hd.z);
    gl.uniform1f(starUni.uBeta, (head && beta > 0) ? beta : 0);
    setTearUniforms(starUni);
    gl.uniform1f(starUni.uImage, 0);
    gl.drawArrays(gl.POINTS, 0, starCount);
    /* The second images, only when a tear is there to make them. */
    if (tearN) {
      gl.uniform1f(starUni.uImage, 1);
      gl.drawArrays(gl.POINTS, 0, starCount);
    }
    gl.bindVertexArray(null);
    gl.colorMask(true, true, true, true);
  };

  /* ---- TEARS (2026-10-21) ------------------------------------------------
   * setTears: the lenses for this frame, set before drawStars. Each is
   * { dir: unit vector from the eye, E: Einstein angle in radians,
   *   arrival: bool, open: 0..1 }. The four strongest are kept.
   * queueTear / queueBolts: the tear's own quad and its lightning, in
   * screen pixels, drawn after the hulls at the tear's depth. */
  function setTearUniforms(u) {
    gl.uniform1i(u.uTearN, tearN);
    if (tearN) {
      gl.uniform4fv(u.uTear, tearA);
      gl.uniform4fv(u.uTearK, tearK);
    }
  }
  GL.setTears = function (list) {
    tearN = 0;
    if (!list || !list.length) return;
    var l = list.slice().sort(function (a, b) { return b.E - a.E; });
    for (var i = 0; i < l.length && tearN < 4; i++) {
      var t = l[i];
      if (!(t.E > 1e-6) || !t.dir) continue;
      var o = tearN * 4;
      tearA[o] = t.dir.x; tearA[o + 1] = t.dir.y; tearA[o + 2] = t.dir.z; tearA[o + 3] = t.E;
      tearK[o] = t.arrival ? 1 : 0; tearK[o + 1] = t.open; tearK[o + 2] = t.dist || 0; tearK[o + 3] = 0;
      tearN++;
    }
  };
  function depth01(km) {
    return Math.max(0, Math.min(1, Math.log2(Math.max(DEPTH_NEAR, km) / DEPTH_NEAR) * INV_LOG_RANGE));
  }
  /* t: { x, y (CSS px), depth (km), E, W, H (px), roll: [across.x, across.y],
   *      arrival, open, glow, time } */
  GL.queueTear = function (t) {
    if (!gl || !tearProg) return false;
    tearQueue.push(t);
    return true;
  };
  /* polys: [{ pts: [[x, y], ...] CSS px, core, halo (px), I }]; tint [r,g,b] */
  GL.queueBolts = function (polys, tint, depthKm) {
    if (!gl || !boltProg) return false;
    if (polys && polys.length) boltQueue.push({ polys: polys, tint: tint, depth: depthKm });
    return true;
  };

  function drawTears() {
    if (!tearQueue.length || !tearProg) return;
    tearQueue.sort(function (a, b) { return b.depth - a.depth; });
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.depthMask(false);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    /* A tear is a light, not a surface, but it must not bloom the whole
     * frame: kept out of the glow mask like the stars. */
    gl.colorMask(true, true, true, false);
    gl.useProgram(tearProg);
    gl.bindVertexArray(tearVao);
    gl.uniform2f(tearUni.uViewportPx, vw, vh);
    for (var i = 0; i < tearQueue.length; i++) {
      var t = tearQueue[i];
      var quadPx = Math.max(t.E * 2.4 * 2.6 + 6, t.H * 1.3, t.W * 3.5) + 4;
      gl.uniform2f(tearUni.uCenterPx, t.x, t.y);
      gl.uniform1f(tearUni.uQuadPx, quadPx);
      gl.uniform1f(tearUni.uDepth, depth01(t.depth));
      gl.uniform2f(tearUni.uRoll, t.roll[0], t.roll[1]);
      gl.uniform1f(tearUni.uE, t.E);
      gl.uniform1f(tearUni.uW, t.W);
      gl.uniform1f(tearUni.uH, t.H);
      gl.uniform1f(tearUni.uOpen, t.open);
      gl.uniform1f(tearUni.uGlow, t.glow);
      gl.uniform1f(tearUni.uMode, t.arrival ? 1 : 0);
      gl.uniform1f(tearUni.uT, t.time % 1000);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    gl.bindVertexArray(null);
    gl.colorMask(true, true, true, true);
    gl.depthMask(true);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  }

  function drawBolts() {
    if (!boltQueue.length || !boltProg) return;
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.depthMask(false);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.colorMask(true, true, true, false);
    gl.useProgram(boltProg);
    gl.bindVertexArray(boltVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, boltBuf);
    gl.uniform2f(boltUni.uViewportPx, vw, vh);
    for (var q = 0; q < boltQueue.length; q++) {
      var b = boltQueue[q], v = [];
      for (var i = 0; i < b.polys.length; i++) {
        var br = b.polys[i], pts = br.pts, half = br.halo * 3;
        for (var k = 0; k < pts.length - 1; k++) {
          var p0 = pts[k], p1 = pts[k + 1];
          var dx = p1[0] - p0[0], dy = p1[1] - p0[1], len = Math.sqrt(dx * dx + dy * dy) || 1e-6;
          /* stretched a core's width past each end so joints do not gap */
          var tx = dx / len * br.core, ty = dy / len * br.core;
          var nx = -dy / len * half, ny = dx / len * half;
          var ax = p0[0] - tx, ay = p0[1] - ty, bx = p1[0] + tx, by = p1[1] + ty;
          v.push(ax + nx, ay + ny, half, br.core, br.halo, br.I,
                 ax - nx, ay - ny, -half, br.core, br.halo, br.I,
                 bx + nx, by + ny, half, br.core, br.halo, br.I,
                 bx + nx, by + ny, half, br.core, br.halo, br.I,
                 ax - nx, ay - ny, -half, br.core, br.halo, br.I,
                 bx - nx, by - ny, -half, br.core, br.halo, br.I);
        }
      }
      if (!v.length) continue;
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(v), gl.DYNAMIC_DRAW);
      gl.uniform1f(boltUni.uDepth, depth01(b.depth));
      gl.uniform3f(boltUni.uTint, b.tint[0], b.tint[1], b.tint[2]);
      gl.drawArrays(gl.TRIANGLES, 0, v.length / 6);
    }
    gl.bindVertexArray(null);
    gl.colorMask(true, true, true, true);
    gl.depthMask(true);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  }

  /* Upload a hull once, expanded to flat triangles.
   *
   * The renderer's mesh format is indexed with ONE COLOUR PER FACE, which
   * an indexed draw cannot express — a shared vertex would have to carry
   * three different colours at once. So the mesh is expanded: three
   * vertices per triangle, each carrying that triangle's own normal and
   * colour. It costs memory (a liner is 11k vertices instead of 6.7k) and
   * buys flat shading that matches the 2D renderer exactly, which is the
   * whole point — a hull has to look like itself in both.
   *
   * Cached on the mesh object itself. Meshes are memoised upstream in
   * render.js (LIB_CACHE, SHIP_MESHES) so object identity is stable, which
   * makes the mesh its own cache key and saves inventing an id scheme for
   * something that already has one. */
  function uploadMesh(mesh) {
    if (mesh._gl) return mesh._gl;
    var tris = mesh.f.length;
    var pos = new Float32Array(tris * 9);
    var nrm = new Float32Array(tris * 9);
    var col = new Float32Array(tris * 9);
    var emi = new Float32Array(tris * 3);
    var alp = new Float32Array(tris * 3);

    for (var i = 0; i < tris; i++) {
      var f = mesh.f[i];
      var a = mesh.v[f[0]], b = mesh.v[f[1]], c = mesh.v[f[2]];
      // Face normal, from the winding as authored. The shader turns it to
      // face the camera, so which way it points here does not matter.
      var ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
      var wx = c[0] - a[0], wy = c[1] - a[1], wz = c[2] - a[2];
      var nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
      var nl = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
      nx /= nl; ny /= nl; nz /= nl;

      /* The face-material prefixes. '!' is emissive, '~h' is glass at
       * opacity h/15 — see FACE_MATERIALS in render.js, which is where the
       * convention is documented and where paintMesh parses the identical
       * two characters for the 2D path. Parsed in both rather than shared,
       * because gl.js loads without render.js and should keep doing so. */
      var raw = String((mesh.c && mesh.c[i]) || '#b8c6d8');
      var lit = raw.charAt(0) === '!';
      var glass = raw.charAt(0) === '~';
      var fa = 1;
      if (glass) {
        var h = parseInt(raw.charAt(1), 16);
        fa = (h >= 0 && h <= 15) ? h / 15 : 1;
        raw = raw.slice(2);
      } else if (lit) {
        raw = raw.slice(1);
      }
      var rgbv = rgb(raw);

      var tri = [a, b, c];
      for (var k = 0; k < 3; k++) {
        var o = i * 9 + k * 3;
        pos[o] = tri[k][0]; pos[o + 1] = tri[k][1]; pos[o + 2] = tri[k][2];
        /* A mesh may carry its own per-vertex normals (`vn`, parallel to
         * `v`) for a curved surface that should shade smoothly rather than
         * by facet — the ground-port pit wall, whose 48 flat facets read as
         * spokes radiating from the ship (2026-11-02, third round). */
        var vnk = mesh.vn ? mesh.vn[f[k]] : null;
        if (vnk) { nrm[o] = vnk[0]; nrm[o + 1] = vnk[1]; nrm[o + 2] = vnk[2]; }
        else { nrm[o] = nx; nrm[o + 1] = ny; nrm[o + 2] = nz; }
        /* And its own per-vertex colours (`vcol`, [r, g, b] 0..1 parallel
         * to `v`), so a colour can change across a face rather than at its
         * edge: the pit wall's rock beds, which coloured by face stepped
         * round the pit like a staircase. */
        var vck = mesh.vcol ? mesh.vcol[f[k]] : null;
        if (vck) { col[o] = vck[0]; col[o + 1] = vck[1]; col[o + 2] = vck[2]; }
        else { col[o] = rgbv[0]; col[o + 1] = rgbv[1]; col[o + 2] = rgbv[2]; }
        emi[i * 3 + k] = lit ? 1 : 0;
        alp[i * 3 + k] = fa;
      }
    }

    var vaoM = gl.createVertexArray();
    var bufs = [];
    gl.bindVertexArray(vaoM);
    function attr(data, name, n) {
      var b = gl.createBuffer();
      bufs.push(b);
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      var l = gl.getAttribLocation(meshProg, name);
      if (l >= 0) { gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, n, gl.FLOAT, false, 0, 0); }
    }
    attr(pos, 'aPos', 3); attr(nrm, 'aNrm', 3);
    attr(col, 'aCol', 3); attr(emi, 'aEmis', 1);
    attr(alp, 'aAlpha', 1);
    gl.bindVertexArray(null);

    mesh._gl = { vao: vaoM, count: tris * 3, id: ++meshSeq, bufs: bufs };
    return mesh._gl;
  }

  /* GIVE A MESH'S VIDEO MEMORY BACK. Every other mesh in the game is built
   * once and lives for the session, so nothing ever needed this. The cut
   * greebles are rebuilt whenever the camera moves far enough to move the
   * cut, and each rebuild is a fresh object — without this, every notch of
   * the wheel would leave five buffers behind on the card for good. */
  GL.releaseMesh = function (mesh) {
    if (!gl || !mesh || !mesh._gl) return;
    var g = mesh._gl;
    for (var i = 0; g.bufs && i < g.bufs.length; i++) gl.deleteBuffer(g.bufs[i]);
    gl.deleteVertexArray(g.vao);
    mesh._gl = null;
  };

  /* Queue one hull. `frame` is the renderer's own {pos, right, up, fwd} —
   * the same object paintMesh takes — and `scale` its length in km. */
  /* WHETHER THE EYE IS INDOORS, for everything queued until it is cleared.
   * A flag rather than an argument on queueMesh because the callers that
   * matter — every drawPortPart, every door leaf, the interior — would all
   * have to pass it through identically, and one that forgot would light a
   * wall by the sun in a room with no sun in it. main.js sets it around the
   * station it is inside and clears it after. */
  var indoorsFlag = 0;
  /* A sun highlight for the meshes queued while it is set (the sea
   * platform's domes, render.js drawSeaDomes); 0 for everything else. */
  var sheenFlag = 0;
  GL.setSheen = function (k) { sheenFlag = k > 0 ? k : 0; };
  GL.setIndoors = function (on) { indoorsFlag = !on ? 0 : (typeof on === 'number' ? on : 1); };

  /* THE CUTAWAY, for everything queued until it is cleared — the same
   * set-and-clear shape as setIndoors, for the same reason.
   *
   * Astra: "a zoomout maybe creates a cutaway in the section containing
   * the ship, and the perspective from how far back you are determines how
   * much station gets cut away". So the boom is no longer stopped at the
   * wall; the wall is opened instead. The shape is a CONE from the ship to
   * the eye, narrow at the ship and widening toward the camera by however
   * far the boom has gone past the wall — pull back further and more of
   * the station opens. A cone rather than a slicing plane because a plane
   * takes away the deck the ship is standing on whenever the camera looks
   * down at it, and a cone only ever takes what is actually in the way.
   *
   * `cut` is { pos (world, km), rShip, rEye (km), rim (fraction), color
   * [r,g,b] } or null. main.js sets it around the station the ship is in
   * and clears it after, so the ship itself and everything outside that
   * station are never cut. */
  /* Safety orange, darkened: FE2's cutaway diagrams hatched a section in a
   * flat warm colour, and it has to read against grey plating, black
   * Syndicate hulls and pale fleet paint alike. */
  var CUT_RIM = [1.0, 0.48, 0.12];
  /* The band's ceiling, the quiet zone and how hard it drains — see THE
   * BAND IS CAPPED in FRAG_MESH. Three metres is about an eighth of a hull
   * length: a pen line at berth distance, not a sleeve over every pipe.
   * Starting values chosen by eye on one screenshot, NOT measured across
   * stations (doctrine 6) — if a port reads wrong, tune these first. */
  var CUT_BAND_MAX = 0.003;   // km
  var CUT_QUIET = 0.35;       // fraction of local cone radius
  var CUT_DRAIN = 0.8;        // 0 keeps the colour, 1 is fully grey
  var cutFlag = null;
  GL.setCutaway = function (cut) { cutFlag = cut || null; };

  /* `paint` is render.js's paintRGB result — { p: [r,g,b] | null, t: … }
   * in 0..255 — or absent for yard grey. */
  function paintVec(paint) {
    if (!paint || (!paint.p && !paint.t)) return null;
    var p = paint.p || paint.t, t = paint.t || paint.p;
    return { p: [p[0] / 255, p[1] / 255, p[2] / 255], t: [t[0] / 255, t[1] / 255, t[2] / 255] };
  }

  GL.queueMesh = function (cam, frame, mesh, scale, sunDir, glow, wind, alpha, paint) {
    if (!gl || !meshProg || !mesh || !mesh.f || !mesh.f.length) return false;
    /* The double-precision subtraction that keeps this usable. Everything
     * the shader sees is small; the big numbers never leave JavaScript. */
    var rel = {
      x: frame.pos.x - cam.eye.x,
      y: frame.pos.y - cam.eye.y,
      z: frame.pos.z - cam.eye.z
    };
    meshQueue.push({ mesh: mesh, rel: rel, scale: scale, sun: sunDir,
                     r: frame.right, u: frame.up, f: frame.fwd, cam: cam,
                     glow: (glow > 0 && wind) ? glow : 0,
                     wind: wind || ZERO3,
                     /* Undefined means opaque, not zero. A caller that has
                      * never heard of alpha must not get an invisible hull. */
                     alpha: (typeof alpha === 'number' && alpha >= 0 && alpha < 1)
                            ? alpha : 1,
                     paint: paintVec(paint),
                     /* Set by GL.setIndoors for the frames the eye spends
                      * inside something. Per-mesh rather than per-frame
                      * because a station's hull and the ship parked in it
                      * are both queued on the same frame and only one of
                      * them is being looked at from within. */
                     indoors: indoorsFlag,
                     sheen: sheenFlag,
                     /* Relative to the eye here, in doubles, for the same
                      * reason `rel` is. */
                     box: (cutFlag && cutFlag.box) ? cutFlag.box : null,
                     cut: (cutFlag && !cutFlag.box) ? {
                       x: cutFlag.pos.x - cam.eye.x,
                       y: cutFlag.pos.y - cam.eye.y,
                       z: cutFlag.pos.z - cam.eye.z,
                       rShip: cutFlag.rShip, rEye: cutFlag.rEye,
                       cap: cutFlag.cap > 0 ? cutFlag.cap : 1e9,
                       rim: cutFlag.rim || 0, color: cutFlag.color || CUT_RIM,
                       /* typeof, not ||, so a caller can ask for 0. */
                       bandMax: typeof cutFlag.bandMax === 'number'
                                ? cutFlag.bandMax : CUT_BAND_MAX,
                       quiet: typeof cutFlag.quiet === 'number'
                              ? cutFlag.quiet : CUT_QUIET,
                       drain: typeof cutFlag.drain === 'number'
                              ? cutFlag.drain : CUT_DRAIN,
                       up: cutFlag.up || ZERO3
                     } : null });
    return true;
  };

  GL.resize = function (cssW, cssH, dpr) {
    if (!gl) return;
    var pw = Math.max(1, Math.round(cssW * dpr));
    var ph = Math.max(1, Math.round(cssH * dpr));
    if (canvas.width !== pw || canvas.height !== ph) {
      canvas.width = pw; canvas.height = ph;
      canvas.style.width = cssW + 'px';
      canvas.style.height = cssH + 'px';
    }
    gl.viewport(0, 0, pw, ph);
    vw = cssW; vh = cssH;      // uniforms speak CSS px, same as Camera does
    if (post && (post.w !== pw || post.h !== ph)) allocatePost(pw, ph);
  };

  /* (Re)build the offscreen targets for a canvas of pw × ph device pixels.
   * Anything that fails drops the whole glow pass rather than half of it:
   * a world drawn into a buffer nobody resolves is a black screen. */
  function allocatePost(pw, ph) {
    freePost();
    try {
      var hw = Math.max(1, pw >> 1), hh = Math.max(1, ph >> 1);
      post.w = pw; post.h = ph; post.hw = hw; post.hh = hh;

      post.msColor = gl.createRenderbuffer();
      gl.bindRenderbuffer(gl.RENDERBUFFER, post.msColor);
      gl.renderbufferStorageMultisample(gl.RENDERBUFFER, post.samples, gl.RGBA8, pw, ph);
      post.msDepth = gl.createRenderbuffer();
      gl.bindRenderbuffer(gl.RENDERBUFFER, post.msDepth);
      gl.renderbufferStorageMultisample(gl.RENDERBUFFER, post.samples, gl.DEPTH_COMPONENT24, pw, ph);
      post.msFbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, post.msFbo);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, post.msColor);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, post.msDepth);
      checkFbo('scene');

      post.scene = targetTexture(pw, ph);
      post.halo = [targetTexture(hw, hh), targetTexture(hw, hh)];
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.bindRenderbuffer(gl.RENDERBUFFER, null);
    } catch (e) {
      if (global.console) console.error('glow pass disabled: ' + e.message);
      freePost();
      post = null;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
  }

  function targetTexture(w, h) {
    var tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, w, h);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    var fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    checkFbo('target');
    gl.bindTexture(gl.TEXTURE_2D, null);
    return { tex: tex, fbo: fbo, w: w, h: h };
  }

  function checkFbo(what) {
    var st = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (st !== gl.FRAMEBUFFER_COMPLETE) throw new Error(what + ' framebuffer incomplete (' + st + ')');
  }

  function freePost() {
    if (!post || !gl) return;
    [post.scene, post.halo && post.halo[0], post.halo && post.halo[1]].forEach(function (t) {
      if (t) { gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fbo); }
    });
    if (post.msFbo) gl.deleteFramebuffer(post.msFbo);
    if (post.msColor) gl.deleteRenderbuffer(post.msColor);
    if (post.msDepth) gl.deleteRenderbuffer(post.msDepth);
    post.scene = post.halo = post.msFbo = post.msColor = post.msDepth = null;
    post.w = post.h = 0;
  }

  /* Whether the frame goes through the offscreen buffer at all. It does
   * whenever the buffer exists, glow or no glow, because that buffer is
   * also where the antialiasing now lives. */
  function postReady() { return !!(post && post.msFbo); }

  function fullscreen(prog, target, w, h) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, target);
    gl.viewport(0, 0, w, h);
    gl.useProgram(prog);
    gl.bindVertexArray(post.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /* Resolve the scene, build the halo, put both on the canvas. */
  function finishPost() {
    var pw = post.w, ph = post.h;
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.depthMask(true);
    gl.colorMask(true, true, true, true);

    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, post.msFbo);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, post.scene.fbo);
    gl.blitFramebuffer(0, 0, pw, ph, 0, 0, pw, ph, gl.COLOR_BUFFER_BIT, gl.NEAREST);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);

    gl.activeTexture(gl.TEXTURE0);
    if (glowOn) {
      var a = post.halo[0], b = post.halo[1];
      gl.useProgram(post.extract);
      gl.uniform1i(post.uExtract.uSrc, 0);
      gl.uniform2f(post.uExtract.uTexel, 1 / pw, 1 / ph);
      gl.bindTexture(gl.TEXTURE_2D, post.scene.tex);
      fullscreen(post.extract, a.fbo, a.w, a.h);

      gl.useProgram(post.blur);
      gl.uniform1i(post.uBlur.uSrc, 0);
      gl.uniform2f(post.uBlur.uStep, GL.glowSpread / a.w, 0);
      gl.bindTexture(gl.TEXTURE_2D, a.tex);
      fullscreen(post.blur, b.fbo, b.w, b.h);
      gl.useProgram(post.blur);
      gl.uniform2f(post.uBlur.uStep, 0, GL.glowSpread / a.h);
      gl.bindTexture(gl.TEXTURE_2D, b.tex);
      fullscreen(post.blur, a.fbo, a.w, a.h);
    }

    gl.useProgram(post.composite);
    gl.uniform1i(post.uComposite.uScene, 0);
    gl.uniform1i(post.uComposite.uHalo, 1);
    gl.uniform1f(post.uComposite.uGain, glowOn ? GL.glowGain : 0);
    gl.uniform1f(post.uComposite.uBands, GL.glowBands);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, post.halo[0].tex);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, post.scene.tex);
    fullscreen(post.composite, null, pw, ph);

    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindVertexArray(null);
    gl.viewport(0, 0, pw, ph);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  }

  /* Tuning, set by looking (see the CHANGELOG entry for the numbers it
   * started at and why they moved). Exposed so the options page and a
   * playtest console can both reach them. */
  GL.glowGain = 0.85;
  GL.glowBands = 4;
  GL.glowSpread = 1.0;
  GL.setGlow = function (on) { glowOn = !!on; };
  GL.glowEnabled = function () { return !!(glowOn && postReady()); };

  /* Clear to the same near-black the 2D layer used to paint, so the sky is
   * unchanged on any frame that queues nothing at all. */
  /* The one shaft mouth being cut out of its world this frame. Set by the
   * caller after begin() and cleared with it, so a port that stops being
   * relevant stops punching a hole in the planet on the very next frame
   * rather than leaving one behind. */
  var hole = null;

  /* THE GROUND-PORT SECTION (from the trial line). A box in the port's own
   * frame: everything inside it above the hangar floor is not drawn, so a
   * camera pulled up out of the bay looks down into it the way a cutaway
   * drawing of a building does. `box` is { origin (world km, the ship),
   * a, b, u (unit axes), aMin, aMax, bHalf, zMin (km, from the origin) }. */
  var groundCut = null;
  /* THE GROUND-PORT CONE (2026-11-02): { pos (world km, the ship), rShip,
   * rEye (km) }, the eye end being this frame's eye. Replaces the box for
   * the zoom-out view; the box stays for what else uses it. */
  var groundCone = null;
  GL.setGroundCone = function (bodyId, cone) {
    groundCone = (bodyId && cone) ? { bodyId: bodyId, cone: cone } : null;
  };
  /* The same test as the two shaders, in JS: is `p` (world km) inside the
   * cone between `eye` and `cone.pos`? For render.test, which cannot run
   * GLSL. */
  GL.coneCuts = function (p, eye, cone) {
    var cx = cone.pos.x - eye.x, cy = cone.pos.y - eye.y, cz = cone.pos.z - eye.z;
    var px = p.x - eye.x, py = p.y - eye.y, pz = p.z - eye.z;
    var L2 = Math.max(cx * cx + cy * cy + cz * cz, 1e-12);
    var t = (px * cx + py * cy + pz * cz) / L2;
    if (!(t > 0 && t < 1)) return false;
    var ox = px - cx * t, oy = py - cy * t, oz = pz - cz * t;
    var r = Math.min(cone.rEye + (cone.rShip - cone.rEye) * t, cone.cap > 0 ? cone.cap : 1e9);
    return Math.sqrt(ox * ox + oy * oy + oz * oz) < r;
  };
  /* FRAG_MESH's keyhole band in JS, for the test that holds the street's
   * edge to it: at `p` (world km) seen from `eye`, with the cut flag main.js
   * hands GL.setCutaway, 'cut', 'hot', 'scorched' or null — the shader's
   * own lines, leaving out the deck bubble and the along-the-surface rule. */
  GL.meshBand = function (cut, eye, p) {
    var cx = cut.pos.x - eye.x, cy = cut.pos.y - eye.y, cz = cut.pos.z - eye.z;
    var px = p.x - eye.x, py = p.y - eye.y, pz = p.z - eye.z;
    var L2 = Math.max(cx * cx + cy * cy + cz * cz, 1e-12);
    var t = (px * cx + py * cy + pz * cz) / L2;
    if (!(t > 0 && t < 1)) return null;
    var r = Math.min(cut.rEye + (cut.rShip - cut.rEye) * t, cut.cap > 0 ? cut.cap : 1e9);
    var ox = px - cx * t, oy = py - cy * t, oz = pz - cz * t, d = Math.sqrt(ox * ox + oy * oy + oz * oz);
    if (d < r) return 'cut';
    if (!(d < r * (1 + (cut.rim || 0)))) return null;
    return (d - r) / (r * cut.rim) < 0.35 ? 'hot' : 'scorched';
  };
  GL.setGroundCut = function (bodyId, box) {
    groundCut = (bodyId && box) ? { bodyId: bodyId, box: box } : null;
  };
  function uploadBox(uni, bx, cam) {
    gl.uniform4f(uni.uBoxO, bx.origin.x - cam.eye.x, bx.origin.y - cam.eye.y,
                 bx.origin.z - cam.eye.z, 1);
    gl.uniform3f(uni.uBoxA, bx.a.x, bx.a.y, bx.a.z);
    gl.uniform3f(uni.uBoxB, bx.b.x, bx.b.y, bx.b.z);
    gl.uniform3f(uni.uBoxU, bx.u.x, bx.u.y, bx.u.z);
    gl.uniform4f(uni.uBoxD, bx.aMin, bx.aMax, bx.bHalf, bx.zMin);
    /* A lid, for a box that is a window well rather than a cutaway: unset
     * means open to the sky, as every box was before. */
    gl.uniform1f(uni.uBoxTop, typeof bx.zMax === 'number' ? bx.zMax : 1e9);
  }
  /* `depthKm`, optional, puts a floor in the hole that far down (see the
   * shader); without one the hole is open, as it always was. */
  /* THE SEA AT A PLATFORM: where it is and what stands in it, or null.
   * `port`: { bodyId, pos (world km, on the sea), east, north (unit),
   * posts: [[x, y, half], ...] km in that frame, reach (km round the
   * origin the posts lie within), disp (lift the depth), t (sim s) }.
   * main.js sets it while a platform is near and clears it otherwise. */
  var seaPort = null, seaPostBuf = new Float32Array(SEA_POSTS * 4);
  GL.setSeaPort = function (port) {
    seaPort = port || null;
    if (!seaPort) return;
    if (seaPort.posts !== seaPort._packedFrom) {
      seaPostBuf.fill(0);
      var n = Math.min(SEA_POSTS, seaPort.posts.length);
      for (var i = 0; i < n; i++) {
        seaPostBuf[i * 4] = seaPort.posts[i][0]; seaPostBuf[i * 4 + 1] = seaPort.posts[i][1];
        seaPostBuf[i * 4 + 2] = seaPort.posts[i][2];
      }
      seaPort._packedFrom = seaPort.posts;
    }
  };
  GL.SEA_WAVE_KM = SEA_WAVE_KM; GL.SEA_POSTS = SEA_POSTS;
  function uploadSeaPort(b, cam) {
    if (!seaPort || seaPort.bodyId !== b.id) { gl.uniform4f(uni.uSeaRel, 0, 0, 0, 0); return; }
    gl.uniform4f(uni.uSeaRel, seaPort.pos.x - cam.eye.x, seaPort.pos.y - cam.eye.y,
                 seaPort.pos.z - cam.eye.z, SEA_WAVE_KM);
    gl.uniform3f(uni.uSeaE, seaPort.east.x, seaPort.east.y, seaPort.east.z);
    gl.uniform3f(uni.uSeaN, seaPort.north.x, seaPort.north.y, seaPort.north.z);
    /* Sea time wrapped to an hour of the slowest train's whole periods, so
     * float32 keeps its precision a year into a career. 3200 s carries
     * 64 m waves (6.4 s) round exactly 500 times; the shorter trains do
     * not divide it, and at the wrap they step - once an hour, invisibly
     * small next to the swell itself. */
    var ts = ((seaPort.t % 3200) + 3200) % 3200;
    gl.uniform4f(uni.uSeaK, ts, seaPort.disp ? 1 : 0, 1, seaPort.reach || 0);
    gl.uniform4fv(uni.uSeaPost, seaPostBuf);
  }

  GL.setSurfaceHole = function (bodyId, worldPos, radiusKm, depthKm) {
    hole = (bodyId && worldPos && radiusKm > 0)
      ? { bodyId: bodyId, pos: worldPos, radius: radiusKm, depth: depthKm || 0 } : null;
  };

  /* `bg` is an optional [r,g,b] in 0..1. It exists for one case: the eye
   * inside a world, where the sky is not sky but the rock the room was cut
   * out of. Everything else takes the near-black the 2D layer used to
   * paint, so the sky is unchanged on any frame that queues nothing. */
  GL.begin = function (bg) {
    queue.length = 0;
    meshQueue.length = 0;
    panelQueue.length = 0;
    ringQueue.length = 0;
    tearQueue.length = 0;
    boltQueue.length = 0;
    tearN = 0;
    hole = null;
    groundCut = null;
    groundCone = null;
    groundSky = null;
    wallQ = null;
    if (!gl) return;
    gl.bindFramebuffer(gl.FRAMEBUFFER, postReady() ? post.msFbo : null);
    /* Alpha cleared to ZERO, not one: in the offscreen buffer alpha is the
     * glow mask, and empty sky does not glow. */
    if (bg) gl.clearColor(bg[0], bg[1], bg[2], 0);
    else gl.clearColor(0x04 / 255, 0x06 / 255, 0x0c / 255, 0);
    gl.clearDepth(1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  };


  /* Queue one body. `sp` is the projected centre and `rpx` the disc radius,
   * both already computed by the 2D layer's own camera — see the note at the
   * top about why they are passed in rather than recomputed. */
  GL.queueBody = function (body, sp, rpx, cam, sunDir, t, worldPos) {
    if (!gl || !(rpx > 0.5) || !worldPos) return false;
    /* Eye-to-centre, subtracted in double precision here so the shader
     * never sees an astronomical coordinate — the same discipline the mesh
     * pass uses for model origins. */
    queue.push({ body: body, x: sp.x, y: sp.y, r: rpx,
                 depth: sp.depth, cam: cam, sun: sunDir, t: t || 0,
                 rel: { x: worldPos.x - cam.eye.x, y: worldPos.y - cam.eye.y,
                        z: worldPos.z - cam.eye.z } });
    return true;
  };

  /* Queue one lit panel. `corners` are WORLD points in the order
   * [topLeft, topRight, bottomRight, bottomLeft] — the same order the 2D
   * path uses, so a caller can hand the same array to either. `source` is
   * anything texImage2D accepts; in practice the offscreen canvas render.js
   * drew the readout into.
   *
   * The eye subtraction happens HERE, in JavaScript doubles, for the same
   * reason queueMesh does it: a panel a metre away and a star ten billion
   * km away cannot both be expressed in a float. */
  GL.queuePanel = function (cam, corners, source, alpha, dirty) {
    if (!gl || !panelProg || !corners || corners.length !== 4 || !source) {
      return false;
    }
    var rel = [], i;
    for (i = 0; i < 4; i++) {
      rel.push({ x: corners[i].x - cam.eye.x,
                 y: corners[i].y - cam.eye.y,
                 z: corners[i].z - cam.eye.z });
    }
    panelQueue.push({ rel: rel, src: source, cam: cam,
                      alpha: (typeof alpha === 'number') ? alpha : 1,
                      dirty: dirty !== false });
    return true;
  };

  /* ONE TEXTURE PER SOURCE CANVAS, not per queue slot.
   *
   * Per-slot was wrong in a way that only cost pixels when the queue
   * changed shape: slot 2 is the right-hand screen on a frame with three
   * panels and the rear-left screen on a frame with five, so a panel could
   * be drawn holding the last frame's picture of a different panel. Keyed
   * on the canvas it came from, a screen owns its texture for as long as
   * that canvas exists.
   *
   * It is also what makes skipping an upload possible at all — see the
   * `dirty` flag below. A texture that might belong to a different panel
   * next frame has to be rewritten every frame by definition. */
  function panelSlot(src) {
    for (var i = 0; i < panelSlots.length; i++) {
      if (panelSlots[i].src === src) return panelSlots[i];
    }
    var t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    /* CLAMP and LINEAR, no mips. A readout is viewed at roughly its own
     * size and wrapping would drag the far edge of the screen onto the
     * near one, which is the sort of artefact that reads as corruption. */
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    var slot = { src: src, tex: t, w: 0, h: 0 };
    panelSlots.push(slot);
    return slot;
  }

  function drawPanels() {
    if (!panelQueue.length || !panelProg) return;
    var cam = panelQueue[0].cam;

    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LESS);
    /* Ordinary alpha, because the panel is a surface that covers the hole it
     * shows through. Depth-WRITING stays off: panels are the last thing
     * drawn, so nothing needs to test against them, and two that overlap on
     * screen should not fight over the buffer. They are still depth-TESTED,
     * so a panel behind the hull is still hidden by it. */
    gl.enable(gl.BLEND);
    /* Colour blends as before; ALPHA — the glow mask — is scaled down by
     * the panel's own opacity, so a lamp behind an MFD stops haloing where
     * the screen covers it. See POST. */
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ZERO, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);

    gl.useProgram(panelProg);
    gl.bindVertexArray(panelVao);
    gl.uniform2f(panelUni.uViewportPx, vw, vh);
    gl.uniform2f(panelUni.uCenterPx, cam.cx, cam.cy);
    gl.uniform1f(panelUni.uFlen, cam.flen);
    gl.uniform3f(panelUni.uRight, cam.r.x, cam.r.y, cam.r.z);
    gl.uniform3f(panelUni.uUp, cam.u.x, cam.u.y, cam.u.z);
    gl.uniform3f(panelUni.uFwd, cam.f.x, cam.f.y, cam.f.z);
    gl.uniform1f(panelUni.uNear, DEPTH_NEAR);
    gl.uniform1f(panelUni.uInvLogRange, INV_LOG_RANGE);
    gl.uniform1i(panelUni.uTex, 0);
    gl.activeTexture(gl.TEXTURE0);

    var verts = new Float32Array(30);
    for (var i = 0; i < panelQueue.length; i++) {
      var p = panelQueue[i], q = p.rel;
      /* Two triangles: 0-1-2 and 0-2-3. UVs follow the corner order, so
       * (0,0) is the top-left of the readout. */
      var order = [0, 1, 2, 0, 2, 3];
      var uvs = [[0, 0], [1, 0], [1, 1], [0, 0], [1, 1], [0, 1]];
      for (var k = 0; k < 6; k++) {
        var c = q[order[k]], o = k * 5;
        verts[o] = c.x; verts[o + 1] = c.y; verts[o + 2] = c.z;
        verts[o + 3] = uvs[k][0]; verts[o + 4] = uvs[k][1];
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, panelBuf);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, verts);
      var slot = panelSlot(p.src);
      var sw = p.src.width | 0, sh = p.src.height | 0;
      if (!sw || !sh) continue;                 // a zero-sized canvas, mid-resize
      gl.bindTexture(gl.TEXTURE_2D, slot.tex);
      /* ALLOCATE ONCE, THEN WRITE INTO IT, and only when the readout was
       * actually repainted. texImage2D reallocates the texture's storage
       * every call; five of those a frame, of a 460x178 canvas each, is
       * about a megabyte and a half of CPU-to-GPU traffic sixty times a
       * second for a screen whose content changes a dozen times a second
       * at most. This is the cockpit-only cost that made first person the
       * slow view on an integrated GPU. */
      if (slot.w !== sw || slot.h !== sh) {
        try {
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, p.src);
        } catch (e) { continue; }
        slot.w = sw; slot.h = sh;
      } else if (p.dirty) {
        try {
          gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, p.src);
        } catch (e) { continue; }
      }
      gl.uniform1f(panelUni.uAlpha, p.alpha);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }

    gl.bindVertexArray(null);
    gl.depthMask(true);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  }

  /* Queue one planet's ring. `planet` carries `.ring` from rings.js and its
   * own rotation, from which the plane is read; `worldPos` is its centre.
   * The frame is passed in rather than recomputed so there is one source
   * of truth for the plane (Rings.ringFrame) and gl.js keeps loading on its
   * own. Returns false when there is nothing to draw. */
  /* `fade` is [near, far] in km: inside near the sheet is not drawn, because
   * the caller is drawing the chunks there instead. Omitted, no fade. */
  GL.queueRing = function (planet, frame, worldPos, cam, sunDir, fade) {
    if (!gl || !ringProg || !planet || !planet.ring || !frame || !worldPos) return false;
    ringQueue.push({ planet: planet, frame: frame, cam: cam, sun: sunDir,
                     fade: fade || [0, 0],
                     rel: { x: worldPos.x - cam.eye.x, y: worldPos.y - cam.eye.y,
                            z: worldPos.z - cam.eye.z } });
    return true;
  };

  var gapBuf = new Float32Array(16);
  function drawRings() {
    if (!ringQueue.length || !ringProg) return;
    /* Far to near, so two rings in one view composite in order. */
    ringQueue.sort(function (a, b) {
      return (b.rel.x * b.rel.x + b.rel.y * b.rel.y + b.rel.z * b.rel.z) -
             (a.rel.x * a.rel.x + a.rel.y * a.rel.y + a.rel.z * a.rel.z);
    });
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LESS);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    /* Rings are lit by the sun like the planet they circle, so - as in
     * drawBodies - their blended alpha must stay out of the glow mask. */
    gl.colorMask(true, true, true, false);
    gl.useProgram(ringProg);
    gl.bindVertexArray(ringVao);
    var cam = ringQueue[0].cam;
    gl.uniform2f(ringUni.uViewportPx, vw, vh);
    gl.uniform2f(ringUni.uCenterPx, cam.cx, cam.cy);
    gl.uniform1f(ringUni.uFlen, cam.flen);
    gl.uniform3f(ringUni.uRight, cam.r.x, cam.r.y, cam.r.z);
    gl.uniform3f(ringUni.uUp, cam.u.x, cam.u.y, cam.u.z);
    gl.uniform3f(ringUni.uFwd, cam.f.x, cam.f.y, cam.f.z);
    gl.uniform1f(ringUni.uNear, DEPTH_NEAR);
    gl.uniform1f(ringUni.uInvLogRange, INV_LOG_RANGE);
    for (var i = 0; i < ringQueue.length; i++) {
      var q = ringQueue[i], p = q.planet, R = p.ring, f = q.frame;
      var span = R.outer - R.inner;
      gl.uniform3f(ringUni.uCenterRel, q.rel.x, q.rel.y, q.rel.z);
      gl.uniform3f(ringUni.uE1, f.e1.x, f.e1.y, f.e1.z);
      gl.uniform3f(ringUni.uE2, f.e2.x, f.e2.y, f.e2.z);
      gl.uniform3f(ringUni.uN, f.n.x, f.n.y, f.n.z);
      gl.uniform1f(ringUni.uOuter, R.outer);
      gl.uniform1f(ringUni.uInner, R.inner);
      gl.uniform1f(ringUni.uOpacity, R.opacity);
      gl.uniform1f(ringUni.uPlanetR, p.radius);
      gl.uniform1i(ringUni.uSeed, R.seed | 0);
      var ng = Math.min(8, R.gaps.length);
      for (var g = 0; g < 8; g++) {
        gapBuf[g * 2] = g < ng ? (R.gaps[g].r - R.inner) / span : -9;
        gapBuf[g * 2 + 1] = g < ng ? R.gaps[g].hw / span : 0;
      }
      gl.uniform1i(ringUni.uGapN, ng);
      gl.uniform2fv(ringUni.uGaps, gapBuf);
      var c = rgb(R.color);
      gl.uniform3f(ringUni.uColor, c[0], c[1], c[2]);
      gl.uniform3f(ringUni.uSunDir, q.sun.x, q.sun.y, q.sun.z);
      gl.uniform2f(ringUni.uFade, q.fade[0], Math.max(q.fade[1], q.fade[0] + 1e-6));
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    gl.bindVertexArray(null);
    gl.depthMask(true);
  }

  /* ---- PASSES OTHER FILES ADD (2026-10-25) -------------------------------
   * A pass is a function (gl, env) run after the cockpit room and before
   * the screens, into whatever framebuffer the frame is being drawn to.
   * `env` carries what a pass needs to agree with this file about the
   * picture — the viewport, the log-depth constants — and the shader
   * helpers, so a new kind of thing to draw can live in its own file
   * without this one learning about it. npcgl.js (the people) is the first.
   * A pass that throws is reported and skipped, never allowed to take the
   * rest of the frame with it. */
  var extraPasses = [];
  GL.addPass = function (fn) {
    if (typeof fn === 'function' && extraPasses.indexOf(fn) < 0) extraPasses.push(fn);
  };
  function drawExtraPasses() {
    if (!extraPasses.length) return;
    var env = { vw: vw, vh: vh, near: DEPTH_NEAR, invLogRange: INV_LOG_RANGE, link: link, uniforms: uniforms };
    for (var i = 0; i < extraPasses.length; i++) {
      try { extraPasses[i](gl, env); } catch (e) { if (global.console) console.error(e); }
    }
    gl.bindVertexArray(null);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  }

  GL.end = function () {
    if (!gl) return;
    drawBodies();
    drawMeshes();
    drawGroundWall();
    /* Tears after the hulls, so a ship in front of one covers it, and the
     * lightning after its tear, added on top. */
    drawTears();
    drawBolts();
    /* After the hulls, before the screens: translucent, so it blends over
     * what is behind it and is hidden by what is in front. */
    drawRings();
    /* The cockpit after everything outside it, because its windows write
     * depth (see drawCockpit), and before the screens mounted in it. */
    drawCockpit();
    /* The people (npcgl.js), standing in the room just drawn. */
    drawExtraPasses();
    /* Last, so the screens are lit over a finished world rather than
     * competing with it — and after the hull, so a panel is depth-tested
     * against the cockpit it is mounted in. */
    drawPanels();
    if (postReady()) finishPost();
  };

  function drawBodies() {
    /* Planets, atmospheres and stars blend over one another, and left alone
     * that blending would write their alpha into the glow mask. A world
     * is lit by the sun, not by itself, so it must not glow — see POST. */
    if (!queue.length) return;
    gl.colorMask(true, true, true, false);
    /* Still sorted far to near even though there is now a depth buffer:
     * the atmosphere halo is blended, and blended fragments have to arrive
     * in order to composite correctly against each other. Depth sorts the
     * SURFACES against the ships; this sorts the glows against themselves. */
    queue.sort(function (a, b) { return b.depth - a.depth; });

    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LESS);
    gl.useProgram(prog);
    gl.bindVertexArray(vao);
    gl.uniform2f(uni.uViewportPx, vw, vh);
    gl.uniform1f(uni.uNear, DEPTH_NEAR);
    gl.uniform1f(uni.uInvLogRange, INV_LOG_RANGE);
    setTearUniforms(uni);

    for (var i = 0; i < queue.length; i++) {
      var q = queue[i], b = q.body, cam = q.cam;
      var at = b.atmosphere;
      var isStar = b.kind === 'star' ? 1 : 0;

      /* How much wider than the body the quad has to be, to leave room for
       * whatever glows outside the silhouette. A star's corona is generous;
       * an airless rock needs no margin at all and should not pay for one. */
      var pad = isStar ? 3.2 : (at ? 1.22 : 1.0);

      var atmoStrength = airOf(b);

      gl.uniform2f(uni.uCenterPx, q.x, q.y);
      /* The quad only has to CONTAIN the sphere's screen footprint — the
       * shader decides what is actually on it. Near the surface that
       * footprint is the whole viewport and then some, so the quad is
       * floored to cover the screen from wherever its centre happens to
       * be. Without this the planet stops at the edge of a disc and you
       * can see straight through the ground. */
      var quadPx = q.r * pad;
      var centreDist = Math.sqrt(q.rel.x * q.rel.x + q.rel.y * q.rel.y +
                                 q.rel.z * q.rel.z);
      if (centreDist < (b.radius || 1) * 4) {
        var reach = Math.max(Math.abs(q.x), Math.abs(vw - q.x)) +
                    Math.max(Math.abs(q.y), Math.abs(vh - q.y));
        quadPx = Math.max(quadPx, reach);
      }
      /* A tear can throw a planet's image up to one Einstein radius out
       * past its own silhouette; the square has to reach that far or the
       * bent edge is cut off flat. */
      if (tearN) {
        var maxE = 0;
        for (var te = 0; te < tearN; te++) maxE = Math.max(maxE, tearA[te * 4 + 3]);
        quadPx += maxE * cam.flen * 1.25;
      }
      gl.uniform1f(uni.uQuadPx, quadPx);
      gl.uniform1f(uni.uPad, pad);
      gl.uniform3f(uni.uRight, cam.r.x, cam.r.y, cam.r.z);
      gl.uniform3f(uni.uUp, cam.u.x, cam.u.y, cam.u.z);
      gl.uniform3f(uni.uFwd, cam.f.x, cam.f.y, cam.f.z);
      gl.uniform3f(uni.uSunDir, q.sun.x, q.sun.y, q.sun.z);

      var c = rgb(b.color);
      gl.uniform3f(uni.uColor, c[0], c[1], c[2]);
      gl.uniform1f(uni.uIsStar, isStar);
      gl.uniform1f(uni.uAtmo, atmoStrength);

      /* Air colour by type rather than one blue for everything: a thick
       * molten world hazes orange, an ice giant hazes cyan. Cheap, and it
       * does more for telling worlds apart at a glance than the surface
       * colour does. */
      var ac = atmoTint(b);
      gl.uniform3f(uni.uAtmoColor, ac[0], ac[1], ac[2]);
      gl.uniform1f(uni.uCloud, at ? at.cloud : 0);
      var terr = terrainOf(b);
      var sc = rgb(terr.sea, [0, 0, 0]);
      /* Gas and ice giants render as latitude bands, not terrain. The
       * shader takes a separate path for these and returns before it
       * touches ocean/ice/cloud, so those are zeroed here only to keep the
       * uniform state honest. */
      var banded = (!isStar && (b.type === 'gasGiant' || b.type === 'iceGiant'));
      gl.uniform1f(uni.uBanded, banded ? 1 : 0);
      /* Twilight worlds: 1 = living ring at the terminator, 2 = living
       * band at the equator of a world on its side. */
      gl.uniform1f(uni.uBand, isStar ? 0 : b.habitableBand === 'terminator' ? 1
                                           : b.habitableBand === 'equator' ? 2 : 0);
      gl.uniform1f(uni.uOcean, (isStar || banded) ? 0 : terr.ocean);
      gl.uniform3f(uni.uSeaColor, sc[0], sc[1], sc[2]);
      gl.uniform1f(uni.uIce, (isStar || banded) ? 0 : terr.ice);
      var bpar = (!isStar && !banded && global.Weather && global.Weather.biomeParams)
                 ? global.Weather.biomeParams(b) : null;
      gl.uniform4f(uni.uBio, bpar ? bpar.mix : 0, bpar ? bpar.moist : 0, bpar ? bpar.warm : 0, bpar ? bpar.marsh : 0);
      gl.uniform1f(uni.uSeed, hashSeed(b.id));
      var sp2 = spinOf(b, q.t);
      gl.uniform3f(uni.uSpinAxis, sp2.ax.x, sp2.ax.y, sp2.ax.z);
      gl.uniform1f(uni.uSpinPhase, sp2.phase);
      uploadGroundDetail(b, q, sp2, isStar || banded);
      gl.uniform1f(uni.uDeckPhase, sp2.deck);
      gl.uniform1f(uni.uBandPhase, sp2.band);
      gl.uniform1f(uni.uShearPhase, sp2.shear);
      gl.uniform1f(uni.uWeather, sp2.weather);
      gl.uniform3f(uni.uStormSalt, sp2.salt[0], sp2.salt[1], sp2.salt[2]);
      gl.uniform3f(uni.uStormSaltPrev, sp2.saltPrev[0], sp2.saltPrev[1], sp2.saltPrev[2]);
      gl.uniform4f(uni.uStormSlow, sp2.slow[0], sp2.slow[1], sp2.slow[2], sp2.slow[3]);
      gl.uniform1f(uni.uStormPhase, sp2.stormPhase);
      gl.uniform1f(uni.uFlashGain, flashGain);
      gl.uniform1f(uni.uCenterDepth, q.depth);
      gl.uniform1f(uni.uWorldRadius, b.radius || 1);
      gl.uniform1f(uni.uHaloPush, (b.ring && ringProg) ? b.ring.outer : 0);
      gl.uniform3f(uni.uCenterRel, q.rel.x, q.rel.y, q.rel.z);
      /* The shaft mouth, if the port we are cutting a hole for is on THIS
       * body. Recomputed against this frame's eye rather than stored as a
       * relative vector by the caller, for the same reason uCenterRel is:
       * the subtraction has to happen in double precision, once, here. */
      if (hole && hole.bodyId === b.id) {
        gl.uniform3f(uni.uHoleRel, hole.pos.x - cam.eye.x,
                     hole.pos.y - cam.eye.y, hole.pos.z - cam.eye.z);
        gl.uniform1f(uni.uHoleR, hole.radius);
        gl.uniform1f(uni.uHoleDepth, hole.depth || 0);
      } else {
        gl.uniform1f(uni.uHoleR, 0);
      }
      uploadSeaPort(b, cam);
      if (groundCone && groundCone.bodyId === b.id) {
        var gc = groundCone.cone;
        gl.uniform4f(uni.uConeS, gc.pos.x - cam.eye.x, gc.pos.y - cam.eye.y,
                     gc.pos.z - cam.eye.z, 1);
        gl.uniform3f(uni.uConeR, gc.rShip, gc.rEye, gc.cap > 0 ? gc.cap : 1e9);
      } else {
        gl.uniform4f(uni.uConeS, 0, 0, 0, 0);
      }
      /* The horizon haze, on the world the ground sky is over. */
      if (groundSky && groundSky.bodyId === b.id) setSkyUniforms(uni, groundSky);
      else gl.uniform4f(uni.uSkyA, 0, 0, 0, 0);
      if (groundCut && groundCut.bodyId === b.id) {
        uploadBox(uni, groundCut.box, cam);
      } else {
        gl.uniform4f(uni.uBoxO, 0, 0, 0, 0);
      }
      gl.uniform2f(uni.uScreenPx, cam.cx, cam.cy);
      gl.uniform1f(uni.uFlen, cam.flen);

      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    gl.bindVertexArray(null);
    gl.colorMask(true, true, true, true);
  }

  function drawMeshes() {
    if (!meshQueue.length) return;
    /* Depth-tested against the planets already in the buffer — which is
     * what lets a ship pass behind a world instead of being painter-sorted
     * in front of it.
     *
     * BLENDING STAYS OFF even now that some faces are translucent, and that
     * is the point of doing it with a dither: glass here is a pattern of
     * kept and discarded fragments, not a blend, so this pass still needs
     * no blend state and — more importantly — still needs no sort. Turning
     * blending on would cost fill rate for nothing and would not make the
     * glass any more correct. */
    meshPassBegin(meshQueue[0].cam);
    for (var i = 0; i < meshQueue.length; i++) {
      var mq = meshQueue[i];
      /* GL.queueWindows: the world so far is finished, its depth is
       * dropped, and the windows go in depth-only (see there). */
      if (mq.clearDepth) { gl.depthMask(true); gl.clear(gl.DEPTH_BUFFER_BIT); continue; }
      if (mq.depthOnly) {
        gl.colorMask(false, false, false, false);
        drawQueuedMesh(mq);
        gl.colorMask(true, true, true, true);
        continue;
      }
      drawQueuedMesh(mq);
    }
    gl.bindVertexArray(null);
    gl.enable(gl.BLEND);
  }

  /* ---- WINDOWS IN A ROOM DRAWN INTO THE WORLD (2026-11-02) ---------------
   * The sea platform's covered tube: the deck walk.js lays out stands on
   * the rig, and through its panes you see the rig, the sea and the sky.
   * It is the cockpit's trick (queueCockpit, below) moved into the mesh
   * pass, because the deck is a mesh-pass item there (her hangar shares
   * the pass with her hull, and her rooms take the cockpit pass after).
   *
   * Everything queued before this call is the world, drawn from the
   * walker's eye. Then the DEPTH is cleared - the rig's own shell, the hub
   * and the dome stand all round the deck and some of their faces are
   * nearer the eye than the deck's walls; left in the buffer they would be
   * drawn through the room. Then the panes, depth only. Everything queued
   * after (the deck, her hull) is depth-tested against the panes alone: a
   * wall behind a pane is further than the pane and is not drawn, so the
   * world's colour stays there. What the depth clear costs: the passes
   * after the mesh pass (rings, tears, lightning bolts) are tested against
   * the deck and the panes, so a planetary ring is not seen through a
   * pane. A sea platform's sky rarely has one in it; noted, not fixed. */
  GL.queueWindows = function (cam, frame, mesh, scale) {
    if (!gl || !meshProg || !mesh || !mesh.f || !mesh.f.length) return false;
    meshQueue.push({ clearDepth: true, cam: cam });
    if (!GL.queueMesh(cam, frame, mesh, scale, ZERO3, 0)) return false;
    meshQueue[meshQueue.length - 1].depthOnly = true;
    return true;
  };

  function meshPassBegin(cam) {
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LESS);
    gl.disable(gl.BLEND);
    gl.useProgram(meshProg);
    gl.uniform2f(meshUni.uViewportPx, vw, vh);
    gl.uniform2f(meshUni.uCenterPx, cam.cx, cam.cy);
    gl.uniform1f(meshUni.uFlen, cam.flen);
    gl.uniform3f(meshUni.uRight, cam.r.x, cam.r.y, cam.r.z);
    gl.uniform3f(meshUni.uUp, cam.u.x, cam.u.y, cam.u.z);
    gl.uniform3f(meshUni.uFwd, cam.f.x, cam.f.y, cam.f.z);
    gl.uniform1f(meshUni.uNear, DEPTH_NEAR);
    gl.uniform1f(meshUni.uInvLogRange, INV_LOG_RANGE);
    setTearUniforms(meshUni);
  }

  /* ---- THE COCKPIT, last of the world (2026-10-24) -----------------------
   * Astra: "a modeled interior for every ship … specifically the cockpit."
   * The room is a mesh like any other, in the ship's frame — but it is
   * cut by its windows, and the windows are not holes in it. Every pane is
   * drawn first with colour writes off: it puts its depth in the buffer
   * and nothing else. Then the room: any wall behind a pane is further than
   * the pane and fails the depth test, so whatever the world already drew
   * there — stars, a planet, the station you are parked in — is what you
   * see. That is why this pass comes after everything outside (bodies,
   * hulls, tears, lightning, rings) and before the screens: once a pane
   * has written its depth, nothing beyond it can be drawn.
   *
   * Indoors-lit always: a cockpit has no sun in it. Your own hull is never
   * queued in the seat view, so nothing of the ship's outside is in the
   * way of the glass. */
  var cockpitQ = null;
  GL.queueCockpit = function (cam, frame, portals, room, parts, scale) {
    if (!gl || !meshProg || !room || !room.f || !room.f.length) return false;
    function item(mesh, off) {
      off = off || ZERO_OFF;
      var p = {
        x: frame.pos.x + (frame.right.x * off[0] + frame.up.x * off[1] + frame.fwd.x * off[2]) * scale,
        y: frame.pos.y + (frame.right.y * off[0] + frame.up.y * off[1] + frame.fwd.y * off[2]) * scale,
        z: frame.pos.z + (frame.right.z * off[0] + frame.up.z * off[1] + frame.fwd.z * off[2]) * scale
      };
      return { mesh: mesh, rel: { x: p.x - cam.eye.x, y: p.y - cam.eye.y, z: p.z - cam.eye.z },
               scale: scale, sun: ZERO3, r: frame.right, u: frame.up, f: frame.fwd, cam: cam,
               glow: 0, wind: ZERO3, alpha: 1, paint: null, indoors: 1, cut: null };
    }
    cockpitQ = {
      cam: cam,
      portals: portals && portals.f && portals.f.length ? item(portals) : null,
      room: item(room),
      parts: (parts || []).filter(function (pt) { return pt && pt.mesh && pt.mesh.f && pt.mesh.f.length; })
                          .map(function (pt) { return item(pt.mesh, pt.off); })
    };
    return true;
  };
  var ZERO_OFF = [0, 0, 0];

  function drawCockpit() {
    var q = cockpitQ;
    cockpitQ = null;
    if (!q) return;
    meshPassBegin(q.cam);
    if (q.portals) {
      gl.colorMask(false, false, false, false);
      drawQueuedMesh(q.portals);
      gl.colorMask(true, true, true, true);
    }
    drawQueuedMesh(q.room);
    for (var i = 0; i < q.parts.length; i++) drawQueuedMesh(q.parts[i]);
    gl.bindVertexArray(null);
    gl.enable(gl.BLEND);
  }

  function drawQueuedMesh(m) {
      var up = uploadMesh(m.mesh);
      gl.bindVertexArray(up.vao);
      gl.uniform3f(meshUni.uModelRel, m.rel.x, m.rel.y, m.rel.z);
      gl.uniform1f(meshUni.uScale, m.scale);
      gl.uniform3f(meshUni.uSunDir, m.sun.x, m.sun.y, m.sun.z);
      gl.uniform1f(meshUni.uGlow, m.glow);
      gl.uniform3f(meshUni.uWind, m.wind.x, m.wind.y, m.wind.z);
      gl.uniform1f(meshUni.uAlpha, m.alpha);
      if (m.paint) {
        gl.uniform4f(meshUni.uPaint, m.paint.p[0], m.paint.p[1], m.paint.p[2], 0.72);
        gl.uniform3f(meshUni.uTrim, m.paint.t[0], m.paint.t[1], m.paint.t[2]);
      } else {
        gl.uniform4f(meshUni.uPaint, 0, 0, 0, 0);
      }
      gl.uniform1f(meshUni.uIndoors, m.indoors);
      gl.uniform1f(meshUni.uSheen, m.sheen || 0);
      var fill = groundSky && groundSky.fill;
      gl.uniform3f(meshUni.uSkyFill, fill ? fill[0] : 0, fill ? fill[1] : 0, fill ? fill[2] : 0);
      /* m.cam: this loop has no `cam` of its own, and until the canopy
       * wells (2026-10-31) nothing queued a mesh with a box to find out. */
      if (m.box) uploadBox(meshUni, m.box, m.cam);
      else gl.uniform4f(meshUni.uBoxO, 0, 0, 0, 0);
      if (m.cut) {
        gl.uniform4f(meshUni.uCut, m.cut.x, m.cut.y, m.cut.z, 1);
        gl.uniform3f(meshUni.uCutR, m.cut.rShip, m.cut.rEye, m.cut.rim);
        gl.uniform1f(meshUni.uCutCap, m.cut.cap);
        gl.uniform3f(meshUni.uCutRim, m.cut.color[0], m.cut.color[1], m.cut.color[2]);
        gl.uniform3f(meshUni.uCutBand, m.cut.bandMax, m.cut.quiet, m.cut.drain);
        gl.uniform3f(meshUni.uCutUp, m.cut.up.x, m.cut.up.y, m.cut.up.z);
      } else {
        gl.uniform4f(meshUni.uCut, 0, 0, 0, 0);
      }
      /* Column-major, and the columns are the frame's own axes — so a
       * local +x lands along `right`, +y along `up`, +z along `fwd`,
       * matching localToWorld() in render.js exactly. */
      gl.uniformMatrix3fv(meshUni.uRot, false, [
        m.r.x, m.r.y, m.r.z,
        m.u.x, m.u.y, m.u.z,
        m.f.x, m.f.y, m.f.z
      ]);
      gl.drawArrays(gl.TRIANGLES, 0, up.count);
  }

  /* Terrain, per world type: how much of it is under something, what that
   * something looks like, and how far the ice reaches.
   *
   * `ocean` is a sea LEVEL against the elevation field, not a percentage —
   * fbm here sits around 0.5, so 0.5 is roughly half drowned and 0.72 is
   * mostly water. A gas or ice giant has no surface to flood and no pole to
   * freeze; what it has is banding, which the cloud layer already draws.
   *
   * Lives here rather than in the generator because it is appearance, not
   * simulation — nothing in the flight model or the economy asks where a
   * coastline is. If sea level ever starts mattering to gameplay it should
   * move to generate.js with the atmospheres. */
  var TERRAIN = {
    molten:   { ocean: 0.52, sea: '#ff7a2e', ice: 0.00 },   // lava, not water
    rocky:    { ocean: 0.00, sea: '#000000', ice: 0.04 },
    desert:   { ocean: 0.16, sea: '#8f6a3a', ice: 0.07 },   // dry basins
    terran:   { ocean: 0.55, sea: '#2a5c93', ice: 0.16 },
    ocean:    { ocean: 0.78, sea: '#1f5586', ice: 0.13 },
    tundra:   { ocean: 0.38, sea: '#3f6a86', ice: 0.34 },
    iceball:  { ocean: 0.10, sea: '#8fb8cc', ice: 0.62 },
    iceGiant: { ocean: 0.00, sea: '#000000', ice: 0.00 },
    gasGiant: { ocean: 0.00, sea: '#000000', ice: 0.00 }
  };
  /* THE TABLE LIVES IN WEATHER.JS now (2026-10-25): the survey reads the
   * same seas and caps on the CPU to put water where the picture shows it.
   * The copy above is the fallback for gl.js loaded on its own (the hull
   * viewer), and test/survey.test.js checks the two have not drifted. */
  function terrainOf(b) {
    var W = global.Weather;
    if (W && W.terrainOf) return W.terrainOf(b);
    return TERRAIN[b.type] || { ocean: 0, sea: '#000000', ice: 0 };
  }

  var ATMO_TINT = {
    molten:   '#ff9a5c', desert: '#e8c79a', terran: '#8fc4ff',
    ocean:    '#7fb8ff', tundra: '#b8d4e8', iceball: '#cfe8f5',
    iceGiant: '#7fe0f0', gasGiant: '#f0cd9a'
  };
  function atmoTint(b) {
    return rgb(ATMO_TINT[b.type] || '#9fc8ff', [0.62, 0.78, 1.0]);
  }
  /* Thicker air glows harder, but only up to a point — a gas giant should
   * not be a lamp. Anchored on Earth's 1.225 kg/m^3 reading as "a proper
   * atmosphere", i.e. about 0.6. (Lifted out of the body pass so the sky
   * below can ask the same question.) */
  function airOf(b) {
    var at = b && b.atmosphere;
    return at ? Math.min(1, Math.sqrt(at.rho0 / 1.225) * 0.6) : 0;
  }

  /* ---- the pit wall's API ------------------------------------------------
   * `w` is what the wall is, in world terms, and it is all the CPU does per
   * frame: main.js/render.js fill it from the cone and the port, and the
   * eye-relative subtraction happens here, in double precision, once.
   *   ship, entrance (world km), east, north, up (unit), p1, p2 (unit,
   *   square to the eye-ship line), rShip, rEye, cap (km), r (km per pad
   *   radius), room { x0, x1, y0, y1, z0, z1 } pad radii, lift, duct,
   *   shipXY [x, y] metres from the mouth, seed, dip [x, y], ph [3], sun. */
  /* ---- ONE EDGE WHERE A BUILDING STANDS (2026-11-02, sixth round) --------
   * Where a station building stood on the cut's edge there were two burnt
   * edges, one inside the other: the street's band, seen THROUGH the
   * cut-away building (its roof is nearer the eye, so the cone takes it
   * wider on screen than it takes the ground under it), a thin dark strip
   * that was the street's scorched half, then the building's own band. The
   * "double orange line" Astra rejected on 2026-10-26, back by another
   * road. Her call: the building's edge wins. So the street's band and the
   * lip's are left out wherever one of the port's cut meshes stands over
   * the street, and each place has exactly one edge. Left at that, the
   * plain street showed through the cut-away building between the hole
   * and its band, and read as a ledge — worse than the double line, the
   * coordinator said on the first shots — so that strip is the building's
   * sliced wall, scorched (UNDER A BUILDING, in FRAG_WALL).
   *
   * Which meshes: exactly those the cut was on this frame (meshQueue
   * entries carrying `cut`) — the port's model, its city and its dressing,
   * whatever art the port has, with no second list of what a building is to
   * fall out of step with. Their footprint is drawn once into a small mask
   * (THE FOOTPRINT over FRAG_FOOT) and kept until one of them moves in the
   * ground frame or the set changes — a door leaf on its run, a mesh
   * swapped in when its art arrives. The CPU's part per frame is a dozen
   * dot products a mesh, to make the key that says nothing moved. */
  var FOOT_N = 1024;      // texels a side (FOOT_MIN, FOOT_TOP: by FRAG_WALL, which reads them)
  /* WHERE THE MASK LIES. The edge exists only where the cone crosses the
   * street, so the mask is laid round that crossing, not round the port:
   * a square twice the cone's band there across, stretched by 1/sin of the
   * axis's elevation (a slanted cone meets the street in a long ellipse),
   * its side a power of two in km and its centre snapped to a quarter of
   * that, so an orbiting eye moves it — and redraws it — only now and then.
   * At Ashford from 1.4 km that is a 1 km square, a metre a texel. With
   * the eye under the street there is no crossing, and FOOT_REACH pad
   * radii round the mouth are covered. Off the mask the street keeps its
   * band, as it did before. */
  var FOOT_REACH = 3, FOOT_MAX = 8;   // pad radii; km
  /* A mesh's placement in the ground frame: its origin east, north, up of
   * the mouth (km) and its three axes in east, north, up — the numbers
   * FRAG_FOOT is given, and the key. `ent` is the mouth relative to the
   * same eye the mesh's `rel` was taken from. */
  /* What FRAG_WALL paints each kind of street point, as [r, g, b, glow]:
   * 'hot', 'scorched', and 'face', a building's sliced wall over the
   * street. The same constants the shaders are written from. */
  GL.cutColour = function (kind, rim) {
    var c = rim || CUT_RIM;
    if (kind === 'hot') return [c[0], c[1], c[2], 0.85];
    if (kind === 'scorched' || kind === 'face') return CUT_SCORCHED.concat([0]);
    return null;
  };
  GL.groundPlace = function (w, ent, m) {
    var E = w.east, N = w.north, U = w.up;
    var ox = m.rel.x - ent.x, oy = m.rel.y - ent.y, oz = m.rel.z - ent.z;
    function p(v) { return [v.x * E.x + v.y * E.y + v.z * E.z, v.x * N.x + v.y * N.y + v.z * N.z,
                            v.x * U.x + v.y * U.y + v.z * U.z]; }
    var r = p(m.r), u = p(m.u), f = p(m.f);
    return { off: p({ x: ox, y: oy, z: oz }), rot: [r[0], r[1], r[2], u[0], u[1], u[2], f[0], f[1], f[2]],
             scale: m.scale };
  };
  /* -> [centre east, centre north (km from the mouth), half the side (km)],
   * for the eye at `eye` (world km). */
  GL.footprintBox = function (w, eye) {
    var U = w.up, E = w.east, N = w.north;
    function d(a, b) { return (a.x - b.x) * U.x + (a.y - b.y) * U.y + (a.z - b.z) * U.z; }
    var hS = d(w.ship, w.entrance), hE = d(eye, w.entrance);
    var ax = { x: eye.x - w.ship.x, y: eye.y - w.ship.y, z: eye.z - w.ship.z };
    var L = Math.sqrt(ax.x * ax.x + ax.y * ax.y + ax.z * ax.z);
    if (!(hE > 0 && hS < hE && L > 1e-9 && w.cap > 0)) return [0, 0, FOOT_REACH * w.r];
    var s = -hS / (hE - hS);
    var X = { x: w.ship.x + ax.x * s - w.entrance.x, y: w.ship.y + ax.y * s - w.entrance.y,
              z: w.ship.z + ax.z * s - w.entrance.z };
    var xe = X.x * E.x + X.y * E.y + X.z * E.z, xn = X.x * N.x + X.y * N.y + X.z * N.z;
    var want = Math.min(FOOT_MAX, w.cap * (1 + (w.rim || 0)) * 2 / Math.max((hE - hS) / L, 0.05));
    var half = Math.pow(2, Math.ceil(Math.log(want) / Math.LN2)), q = half / 2;
    return [Math.round(xe / q) * q, Math.round(xn / q) * q, half];
  };
  /* FRAG_FOOT in JS, without the texels: how tall `items` ({ mesh, place }
   * from GL.groundPlace) stand over the point `p` (world km), in km — the
   * tallest face whose shadow straight down covers it, of those FOOT_MIN
   * or more over the street — and 0 where none does. What FRAG_WALL's
   * footH reads back, so the test can hold the band to it. */
  GL.footprintAt = function (w, items, p) {
    var q = { x: p.x - w.entrance.x, y: p.y - w.entrance.y, z: p.z - w.entrance.z };
    var pe = q.x * w.east.x + q.y * w.east.y + q.z * w.east.z;
    var pn = q.x * w.north.x + q.y * w.north.y + q.z * w.north.z;
    var curv = (w.planet && w.planet.radius > 0) ? 1 / (2 * w.planet.radius) : 0, top = 0;
    for (var i = 0; i < items.length; i++) {
      var M = items[i].mesh, P = items[i].place, R = P.rot, o = P.off, s = P.scale;
      var g = function (v) {
        var x = v[0] * s, y = v[1] * s, z = v[2] * s;
        var gx = o[0] + R[0] * x + R[3] * y + R[6] * z, gy = o[1] + R[1] * x + R[4] * y + R[7] * z;
        var gz = o[2] + R[2] * x + R[5] * y + R[8] * z;
        return [gx, gy, gz + (gx * gx + gy * gy) * curv];
      };
      for (var k = 0; k < M.f.length; k++) {
        var a = g(M.v[M.f[k][0]]), b = g(M.v[M.f[k][1]]), c = g(M.v[M.f[k][2]]);
        var det = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
        if (Math.abs(det) < 1e-18) continue;
        var l1 = ((b[1] - c[1]) * (pe - c[0]) + (c[0] - b[0]) * (pn - c[1])) / det;
        var l2 = ((c[1] - a[1]) * (pe - c[0]) + (a[0] - c[0]) * (pn - c[1])) / det;
        var l3 = 1 - l1 - l2;
        if (l1 < 0 || l2 < 0 || l3 < 0) continue;
        var hz = l1 * a[2] + l2 * b[2] + l3 * c[2];
        if (hz >= FOOT_MIN && hz > top) top = Math.min(hz, FOOT_TOP);
      }
    }
    return top;
  };
  function streetFootprint(w, eye) {
    if (!footProg || !w || !(w.r > 0) || !w.east) return null;
    var items = [], key = [];
    for (var i = 0; i < meshQueue.length; i++) {
      var m = meshQueue[i];
      if (!m.cut || !m.mesh._gl) continue;
      var e = m.cam.eye;
      var pl = GL.groundPlace(w, { x: w.entrance.x - e.x, y: w.entrance.y - e.y, z: w.entrance.z - e.z }, m);
      items.push({ m: m, pl: pl });
      key.push(m.mesh._gl.id, Math.round(pl.off[0] * 1e4), Math.round(pl.off[1] * 1e4), Math.round(pl.off[2] * 1e4),
               pl.rot.map(function (v) { return Math.round(v * 1e5); }).join(':'), pl.scale);
    }
    if (!items.length) return null;
    var box = GL.footprintBox(w, eye);
    var curv = (w.planet && w.planet.radius > 0) ? 1 / (2 * w.planet.radius) : 0;
    key.push(box.join(':'), Math.round(curv * 1e9));
    key = key.join(',');
    if (foot && foot.key === key) return foot;
    if (!foot) {
      var tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, FOOT_N, FOOT_N, 0, gl.RED, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.bindTexture(gl.TEXTURE_2D, null);
      var fbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      var ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
      gl.bindFramebuffer(gl.FRAMEBUFFER, postReady() ? post.msFbo : null);
      if (!ok) { gl.deleteFramebuffer(fbo); gl.deleteTexture(tex); footProg = null; return null; }
      foot = { tex: tex, fbo: fbo, key: null, box: null, builds: 0 };
    }
    /* Drawn now, between the hulls and the wall, into its own target; the
     * frame's target, viewport and clear colour are put back after. */
    var vp = gl.getParameter(gl.VIEWPORT), cc = gl.getParameter(gl.COLOR_CLEAR_VALUE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, foot.fbo);
    gl.viewport(0, 0, FOOT_N, FOOT_N);
    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendEquation(gl.MAX);
    gl.colorMask(true, true, true, true);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(footProg);
    gl.uniform3f(footUni.uFBox, box[0], box[1], box[2]);
    gl.uniform1f(footUni.uFCurv, curv);
    gl.uniform1f(footUni.uFMin, FOOT_MIN);
    for (i = 0; i < items.length; i++) {
      var it = items[i], up = it.m.mesh._gl;
      gl.uniform3f(footUni.uFOff, it.pl.off[0], it.pl.off[1], it.pl.off[2]);
      gl.uniformMatrix3fv(footUni.uFRot, false, it.pl.rot);
      gl.uniform1f(footUni.uFScale, it.pl.scale);
      gl.bindVertexArray(up.vao);
      gl.drawArrays(gl.TRIANGLES, 0, up.count);
    }
    gl.bindVertexArray(null);
    gl.blendEquation(gl.FUNC_ADD);
    gl.disable(gl.BLEND);
    gl.bindFramebuffer(gl.FRAMEBUFFER, postReady() ? post.msFbo : null);
    gl.viewport(vp[0], vp[1], vp[2], vp[3]);
    gl.clearColor(cc[0], cc[1], cc[2], cc[3]);
    foot.key = key; foot.box = box; foot.builds++;
    return foot;
  }
  /* For a probe: how often the footprint has been drawn, and over what. */
  GL.footprintInfo = function () { return foot ? { builds: foot.builds, box: foot.box } : null; };

  GL.queueGroundWall = function (cam, w) {
    if (!gl || !wallProg || !w) return false;
    wallQ = { cam: cam, w: w };
    return true;
  };
  function drawGroundWall() {
    var q = wallQ;
    if (!q || !wallProg) return;
    var cam = q.cam, w = q.w, u = wallUni, e = cam.eye;
    var fp = streetFootprint(w, e);       // before the wall's own state: it draws
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LESS);
    gl.disable(gl.BLEND);
    /* Alpha on (fifth round): it is the glow mask, and the hot edge feeds
     * it as the port's own cut face does. Rock writes 0 there. */
    gl.colorMask(true, true, true, true);
    gl.useProgram(wallProg);
    gl.bindVertexArray(vao);
    gl.uniform2f(u.uViewportPx, vw, vh);
    gl.uniform2f(u.uCenterPx, vw / 2, vh / 2);
    gl.uniform1f(u.uQuadPx, vw + vh);
    gl.uniform2f(u.uScreenPx, cam.cx, cam.cy);
    gl.uniform1f(u.uFlen, cam.flen);
    gl.uniform3f(u.uRight, cam.r.x, cam.r.y, cam.r.z);
    gl.uniform3f(u.uUp, cam.u.x, cam.u.y, cam.u.z);
    gl.uniform3f(u.uFwd, cam.f.x, cam.f.y, cam.f.z);
    gl.uniform1f(u.uNear, DEPTH_NEAR);
    gl.uniform1f(u.uInvLogRange, INV_LOG_RANGE);
    gl.uniform3f(u.uWS, w.ship.x - e.x, w.ship.y - e.y, w.ship.z - e.z);
    gl.uniform3f(u.uWR, w.rShip, w.rEye, w.cap > 0 ? w.cap : 1e9);
    gl.uniform3f(u.uWEnt, w.entrance.x - e.x, w.entrance.y - e.y, w.entrance.z - e.z);
    gl.uniform3f(u.uWE, w.east.x, w.east.y, w.east.z);
    gl.uniform3f(u.uWN, w.north.x, w.north.y, w.north.z);
    gl.uniform3f(u.uWU, w.up.x, w.up.y, w.up.z);
    gl.uniform4f(u.uWRoomA, w.room.x0, w.room.x1, w.room.y0, w.room.y1);
    gl.uniform4f(u.uWRoomB, w.room.z0, w.room.z1, w.lift, w.duct);
    gl.uniform4f(u.uWShip, w.shipXY[0], w.shipXY[1], w.r, w.seed);
    gl.uniform4f(u.uWFold, w.dip[0], w.dip[1], w.ph[0], w.ph[1]);
    gl.uniform1f(u.uWPh3, w.ph[2]);
    gl.uniform3f(u.uSunDir, w.sun.x, w.sun.y, w.sun.z);
    if (w.planet) gl.uniform4f(u.uWPlanet, w.planet.pos.x - e.x, w.planet.pos.y - e.y,
                               w.planet.pos.z - e.z, w.planet.radius);
    else gl.uniform4f(u.uWPlanet, 0, 0, 0, 0);
    var rc = w.rimColor || CUT_RIM;
    gl.uniform4f(u.uWRim, rc[0], rc[1], rc[2], w.rim || 0);
    /* The footprint, on its own unit so nothing else's binding moves. */
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, fp ? fp.tex : null);
    gl.uniform1i(u.uWMask, 2);
    gl.activeTexture(gl.TEXTURE0);
    if (fp) gl.uniform4f(u.uWMaskB, fp.box[0], fp.box[1], fp.box[2], 1);
    else gl.uniform4f(u.uWMaskB, 0, 0, 1, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindVertexArray(null);
    gl.colorMask(true, true, true, true);
    gl.enable(gl.BLEND);
  }
  /* FRAG_WALL's ray cast in JS: where the view ray `rd` (unit, world)
   * from `eye` meets the wall, as { t (km), p (world), cyl }, or null when
   * it runs out past her or points away. */
  GL.wallHit = function (w, eye, rd) {
    var Sx = w.ship.x - eye.x, Sy = w.ship.y - eye.y, Sz = w.ship.z - eye.z;
    var L = Math.sqrt(Sx * Sx + Sy * Sy + Sz * Sz);
    if (!(L > 1e-9)) return null;
    var c = (rd.x * Sx + rd.y * Sy + rd.z * Sz) / L;
    if (!(c > 0)) return null;
    var sn = Math.sqrt(Math.max(0, 1 - c * c));
    var k = (w.rShip - w.rEye) / L;
    var cap = Math.min(w.cap > 0 ? w.cap : 1e9, w.rEye);
    var xc = k < 0 ? Math.max(0, (w.rEye - cap) / -k) : 0;
    var t = sn > 1e-6 ? cap / sn : 1e30, cyl = t * c <= xc;
    if (!cyl) {
      var den = sn - k * c;
      if (!(den > 1e-9)) return null;
      t = w.rEye / den;
    }
    if (t * c >= L) return null;
    return { t: t, p: { x: eye.x + rd.x * t, y: eye.y + rd.y * t, z: eye.z + rd.z * t }, cyl: cyl };
  };
  /* The street's burnt edge in JS (FRAG_WALL's first block): at a point
   * `p` on the ground (world km) seen from `eye`, 'cut' inside the cone,
   * 'hot' or 'scorched' in the band just outside it, null beyond — the
   * same radius and the same fraction as FRAG_MESH's keyhole band. With
   * `items` (THE FOOTPRINT: { mesh, place } as GL.footprintAt takes), no
   * band under a building (sixth round): 'face' where the ray, back up at
   * the building's height, was inside the cone — its sliced wall, painted
   * scorched — and null elsewhere under it. */
  GL.streetBand = function (w, eye, p, items) {
    var Sx = w.ship.x - eye.x, Sy = w.ship.y - eye.y, Sz = w.ship.z - eye.z;
    var px = p.x - eye.x, py = p.y - eye.y, pz = p.z - eye.z;
    var L2 = Math.max(Sx * Sx + Sy * Sy + Sz * Sz, 1e-12);
    var tt = (px * Sx + py * Sy + pz * Sz) / L2;
    if (!(tt > 0 && tt < 1)) return null;
    var rs = Math.min(w.rEye + (w.rShip - w.rEye) * tt, w.cap > 0 ? w.cap : 1e9);
    var ox = px - Sx * tt, oy = py - Sy * tt, oz = pz - Sz * tt, ds = Math.sqrt(ox * ox + oy * oy + oz * oz);
    if (ds < rs) return 'cut';
    var fh = (items && items.length) ? GL.footprintAt(w, items, p) : 0;
    if (fh > 0) {
      var rl = Math.sqrt(px * px + py * py + pz * pz), U = w.up;
      var dn = -(px * U.x + py * U.y + pz * U.z) / rl;
      if (!(dn > 1e-4)) return null;
      var k = Math.min(fh / dn / rl, 0.99), qx = px * (1 - k), qy = py * (1 - k), qz = pz * (1 - k);
      var t2 = (qx * Sx + qy * Sy + qz * Sz) / L2;
      var r2 = Math.min(w.rEye + (w.rShip - w.rEye) * t2, w.cap > 0 ? w.cap : 1e9);
      var ex = qx - Sx * t2, ey = qy - Sy * t2, ez = qz - Sz * t2;
      return (t2 > 0 && t2 < 1 && Math.sqrt(ex * ex + ey * ey + ez * ez) < r2) ? 'face' : null;
    }
    if (ds >= rs * (1 + w.rim)) return null;
    return (ds - rs) / (rs * w.rim) < 0.35 ? 'hot' : 'scorched';
  };
  /* groundHaze's blend fraction in JS: `dist` km of path from an eye `h0`
   * km up over a world of radius `R` km (absent: flat ground, no dip), the
   * ray `down` (sine of its angle below the horizontal). */
  GL.hazeAt = function (air, dist, h0, down, R) {
    if (!(air > 0)) return 0;
    var H = 6, od = h0 > 0.01 ? dist * H * (1 - Math.exp(-h0 / H)) / h0 : dist;
    var f = 1 - Math.exp(-od * air * 0.03);
    var dip = GL.horizonDip(h0, R);
    var u = Math.max(0, Math.min(1, (down - dip) / 0.08));
    return Math.max(f, 1 - u * u * (3 - 2 * u));
  };
  /* The sine of the true horizon's angle below the horizontal, `h0` km
   * over a sphere of radius `R` km. */
  GL.horizonDip = function (h0, R) {
    return (R > 0 && h0 > 0) ? Math.sqrt(h0 * (2 * R + h0)) / (R + h0) : 0;
  };
  /* The pit wall's lip band (FRAG_WALL's last block) in JS: `depthM`
   * metres down the wall from the street where the cone's radius is `rh`
   * km — 'hot', 'scorched', or null for the rock below; and all
   * 'scorched' `under` a building (sixth round), carrying its sliced wall
   * down, where the building's own band is the hot edge. */
  GL.lipBand = function (w, rh, depthM, under) {
    var lipM = rh * w.rim * 1000;
    if (!(depthM < lipM)) return null;
    if (under) return 'scorched';
    return depthM / Math.max(lipM, 1e-6) < 0.35 ? 'hot' : 'scorched';
  };
  /* FRAG_WALL in JS, up to the bed: null where the wall is not drawn
   * (above the street, in the bay's air), else the bed index. */
  GL.wallFrag = function (w, p) {
    var qx = p.x - w.entrance.x, qy = p.y - w.entrance.y, qz = p.z - w.entrance.z;
    function d3(a) { return qx * a.x + qy * a.y + qz * a.z; }
    var hm = d3(w.up) * 1000;
    if (hm > 0) return null;
    var r = w.r, lx = d3(w.east) / r, ly = d3(w.north) / r, mz = hm * 0.001 / r - w.lift, R = w.room;
    if (lx > R.x0 && lx < R.x1 && ly > R.y0 && ly < R.y1 && mz > R.z0 && mz < R.z1) return null;
    if (Math.abs(lx) < w.duct && Math.abs(ly) < w.duct && mz >= R.z1) return null;
    var xm = lx * r * 1000, ym = ly * r * 1000, ease = Math.min(1, -hm / 40), k = Math.PI * 2 / 140;
    var fold = 0.6 * Math.sin(xm * k + w.ph[0]) * Math.cos(ym * k * 0.83 + w.ph[1]) +
               0.4 * Math.sin((xm * 0.61 - ym * 0.79) * k * 1.7 + w.ph[2]);
    var d = -(hm - ((xm - w.shipXY[0]) * w.dip[0] + (ym - w.shipXY[1]) * w.dip[1] + fold * 22) * ease);
    if (d < 0.35) return 0; if (d < 0.6) return 1; if (d < 1.8) return 2; if (d < 3.4) return 3; if (d < 6.4) return 4;
    var dd = d - 6.4, B13 = 5 * (Math.pow(1.22, 13) - 1) / 0.22;
    return 5 + (dd < B13 ? Math.floor(Math.log(1 + dd * 0.044) / Math.log(1.22)) : 13 + Math.floor((dd - B13) / 60));
  };

  /* ---- the sky from the ground (2026-11-02) ------------------------------
   *
   * Astra, looking up out of the cut at a ground port: "put daytime sky".
   * There was no sky from the ground to reuse: the planet pass draws the
   * world as a sphere seen from outside, its halo is the limb of that
   * sphere, and every ray that misses the ground fell through to the clear
   * colour — near-black space. So the sky is built from the SAME two
   * numbers the halo is: this world's air tint (atmoTint) and how much air
   * it has (airOf), lit by how high the sun stands over the place you are.
   * An airless world's sky is black at noon, a thin one a dim one.
   *
   * THE SECOND VERSION (third round, the same day). The first was the air
   * tint itself, flat, and on Oruun — where the air, the halo and the
   * ground are all the same orange — there was no horizon at all: the deck
   * ended and orange carried on. So the sky has its own colour now:
   *   - the tint carried 62% of the way to a scattered blue-white, the way
   *     a sky is paler and bluer than the air's colour seen edgewise;
   *   - a gradient, palest at the horizon (38% further toward white) and
   *     darkening to 58% toward the zenith;
   *   - dusk warms the low sky toward the sun's side only, over the last
   *     fifteen degrees of its height, and twilight fades it to the night
   *     clear over about six degrees below the horizon;
   *   - a soft glare round the sun itself.
   * And the planet pass hazes the ground into the horizon's colour with
   * distance (groundHaze), a shade darker than the sky so the horizon stays
   * a line. SKY_GLSL above is the shader copy; this is the one the test
   * reads. `e` is the sine of the view's elevation, `toward` 0..1 how far
   * round toward the sun's azimuth it looks. Returns [r, g, b] 0..1 with
   * `lit` 0..1, which says whether the stars show. */
  var SKY_NIGHT = [0x04 / 255, 0x06 / 255, 0x0c / 255];
  var SKY_DUSK = [1.0, 0.52, 0.28];
  var SKY_SCATTER = [0.70, 0.83, 1.0];
  function skyAt(tint, air, sunUp, e, toward, sunCos) {
    var dayT = Math.max(0, Math.min(1, (sunUp + 0.10) / 0.36));
    var day = dayT * dayT * (3 - 2 * dayT);
    var lit = day * Math.min(1, air / 0.25);
    var bright = air > 0 ? (0.32 + 0.68 * Math.min(1, air / 0.6)) : 0;
    var low = 1 - Math.max(0, Math.min(1, sunUp / 0.26));
    var k = Math.pow(Math.max(0, Math.min(1, e)), 0.55);
    var dusk = low * 0.62 * (1 - Math.max(0, Math.min(1, e * 2))) * (toward === undefined ? 0.5 : toward);
    var glare = Math.pow(Math.max(0, sunCos || 0), 80) * 0.55 * lit;
    var out = [];
    for (var i = 0; i < 3; i++) {
      var sc = tint[i] + (SKY_SCATTER[i] - tint[i]) * 0.62;
      var zen = sc * 0.58 * bright, hor = (sc + (1 - sc) * 0.38) * bright * 1.04;
      var c = hor + (zen - hor) * k;
      c = c + (SKY_DUSK[i] * bright * 0.92 - c) * dusk;
      c += [1.0, 0.94, 0.82][i] * glare;
      out.push(SKY_NIGHT[i] + (c - SKY_NIGHT[i]) * lit);
    }
    out.lit = lit;
    return out;
  }
  GL.skyAt = skyAt;
  /* The flat version, for the frame's clear colour and the stars: the sky
   * a third of the way up, looking across the sun. */
  function skyFor(tint, air, sunUp) { return skyAt(tint, air, sunUp, 0.33, 0.5, 0); }
  GL.skyFor = skyFor;
  /* The sky over `body` at a place whose local vertical is `up`, with the
   * sun along `sunDir` (both unit, world). */
  GL.skyOver = function (body, up, sunDir) {
    var sunUp = up.x * sunDir.x + up.y * sunDir.y + up.z * sunDir.z;
    return skyFor(atmoTint(body), airOf(body), sunUp);
  };
  function setSkyUniforms(u, sk) {
    gl.uniform4f(u.uSkyA, sk.tint[0], sk.tint[1], sk.tint[2], sk.air);
    gl.uniform3f(u.uSkyUp, sk.up.x, sk.up.y, sk.up.z);
    gl.uniform3f(u.uSkySun, sk.sun.x, sk.sun.y, sk.sun.z);
  }
  /* Set by main.js each frame the ground sky is wanted, cleared by begin;
   * it hazes that body's ground. */
  GL.setGroundSky = function (body, up, sunDir) {
    groundSky = body ? { bodyId: body.id, tint: atmoTint(body), air: airOf(body),
                         up: up, sun: sunDir } : null;
    /* The sky's light on the shade side of whatever stands under it: the
     * sky half-way up, at about half strength - an overcast-ish fill, not
     * a second sun. */
    if (groundSky) {
      var su = up.x * sunDir.x + up.y * sunDir.y + up.z * sunDir.z;
      var sk = skyAt(groundSky.tint, groundSky.air, su, 0.5, 0.5, 0);
      groundSky.fill = [sk[0] * 0.55, sk[1] * 0.55, sk[2] * 0.55];
    }
  };
  /* The sky itself: one full-screen quad behind everything, no depth, no
   * glow. Called right after begin, before the stars, so at dusk the stars
   * come out over it. */
  GL.drawGroundSky = function (cam) {
    if (!gl || !skyProg || !groundSky || !(groundSky.air > 0)) return;
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);
    gl.disable(gl.BLEND);
    gl.colorMask(true, true, true, false);
    gl.useProgram(skyProg);
    gl.bindVertexArray(vao);
    gl.uniform2f(skyUni.uViewportPx, vw, vh);
    gl.uniform2f(skyUni.uCenterPx, vw / 2, vh / 2);
    gl.uniform1f(skyUni.uQuadPx, vw + vh);
    gl.uniform3f(skyUni.uRight, cam.r.x, cam.r.y, cam.r.z);
    gl.uniform3f(skyUni.uUp, cam.u.x, cam.u.y, cam.u.z);
    gl.uniform3f(skyUni.uFwd, cam.f.x, cam.f.y, cam.f.z);
    gl.uniform2f(skyUni.uScreenPx, cam.cx, cam.cy);
    gl.uniform1f(skyUni.uFlen, cam.flen);
    setSkyUniforms(skyUni, groundSky);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
    gl.colorMask(true, true, true, true);
    gl.depthMask(true);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  };

  /* ---- how a world turns, for the shader --------------------------------
   *
   * The axis is read straight out of the same construction sim.js uses to
   * put a surface port on the ground: a body-fixed frame whose pole is +z,
   * tipped about x by the axial tilt. So the pole lands at
   * (0, -sin tilt, cos tilt) in world coordinates, and asking that question
   * HERE rather than inventing an axis is the whole reason the caps, the
   * bands and the continents now agree with where the pads actually are.
   *
   * DECK_SUPER and WEATHER_RATE are the two numbers that decide whether
   * anybody ever SEES this. The body's own rotation is physical and stays
   * physical — nine to ninety hours, so a world turns at somewhere between
   * four and forty degrees an hour and you notice it over a long orbit or
   * a short warp. Weather cannot afford to be that patient: a cloud deck
   * that only moves with the ground is a painted ball at every timescale a
   * player actually watches one. So the deck runs ahead of the ground, and
   * the field it is drawn from drifts on a clock of its own.
   *
   * Both are SIM time, not wall clock. Weather is a pure function of the
   * timetable like everything else here — pause the game and the clouds
   * stop, come back to the same world at the same hour and it has the same
   * sky, and the fast-forward that carries you across a system carries its
   * weather with it. */
  var DECK_SUPER = 2.6;              // deck turns this much faster than the ground
  var WEATHER_PERIOD = 2400;         // seconds of sim time per unit of drift
  var SHEAR_RATE = 0.09;             // how fast the latitude drag breathes
  /* The two circuits the weather field travels. Rationally related, as any
   * two finite decimals are, so the pattern DOES come round again — after
   * 2*pi*10000 units, which is 4.8 years of sim time. That is the point of
   * choosing them this way rather than pretending otherwise: an exactly
   * periodic weather field can be wrapped exactly, which is what keeps it
   * inside single precision forever (see below). */
  var W1 = 0.9000, W2 = 0.3703;
  var WEATHER_CYCLE = 2 * Math.PI * 10000;
  /* How long a lightning bucket is. Short enough that a busy storm fires
   * several times while you watch it, long enough that a single stroke is
   * a stroke rather than a flicker. */
  /* One copy, like every other weather number — the fallback is for gl.js
   * loaded without weather.js, which the hull viewer does. */
  var STORM_BUCKET = ((global.Weather && global.Weather.K &&
                       global.Weather.K.FLASH_BUCKET) || 0.9);

  /* Three small numbers from one bucket index, done here because the
   * shader's hash cannot take a large input and stay a hash. Integer
   * arithmetic in doubles, so it is exact for any bucket a career will
   * ever reach. */
  function saltOf(n) {
    var a = (n * 374761393 + 668265263) % 2147483647;
    var b = (a * 1103515245 + 12345) % 2147483647;
    var c = (b * 1664525 + 1013904223) % 2147483647;
    return [Math.abs(a) / 2147483647, Math.abs(b) / 2147483647,
            Math.abs(c) / 2147483647];
  }

  var TAU = 2 * Math.PI;
  function wrap(a, m) { a = a % m; return a < 0 ? a + m : a; }

  /* WHY THESE ARE WRAPPED, AND WHY ONE OF THEM IS NOT.
   *
   * Every number here goes to the GPU as a uniform1f — single precision —
   * and every one of them grows without bound with the clock. A phase of
   * a hundred thousand radians lands on a float32 grid whose spacing is
   * 0.016 rad, and the world then turns in steps instead of turning:
   *
   *     career     spin (rad)   grain (rad)   slip on a 400 px disc
   *     1 month    5.4e2        6.1e-5        0.0 px
   *     1 year     6.6e3        4.9e-4        0.1 px
   *     5 years    3.4e4        3.9e-3        0.8 px
   *     20 years   1.3e5        1.6e-2        3.1 px   (deck: 6.3 px)
   *
   * Sub-pixel for a normal career and visible judder for a long one — and
   * nothing about it would look like a clock problem, which is how it
   * would have survived. Every angle below that is consumed by a rotation
   * or by a sin of multiplier one is periodic in 2*pi, so wrapping it in
   * double precision here is exact and the shader never sees a large
   * number again. `weather` wraps at its own exact common period.
   *
   * `band` is the exception and cannot be fixed this way. The gas giants
   * scroll each latitude at its OWN multiple of this phase — that is what
   * differential rotation is — and there is no single period you can wrap
   * a continuously varying multiplier by without the bands jumping when
   * it wraps. So it stays unwrapped, and the grain lands on the one
   * surface in the game where a pixel of slip on a low-contrast stripe is
   * the least visible thing there is. */
  function spinOf(body, t) {
    var rot = body.rotation;
    var tilt = rot ? rot.tilt : 0;
    var W = global.Weather;
    var clock = (W && W.stormClock) ? W.stormClock(t) : null;
    /* The axis, read out of the same construction sim.js uses to put a pad
     * on the ground: a body-fixed frame whose pole is +z, tipped about x by
     * the tilt. Asking that question HERE rather than inventing an axis is
     * the whole reason the caps, the bands, the continents and the pads
     * now agree. */
    var az = (rot && rot.az) || 0;   // a locked world's pole leans along its own orbit normal
    var ax = { x: Math.sin(tilt) * Math.sin(az), y: -Math.sin(tilt) * Math.cos(az), z: Math.cos(tilt) };
    /* A star, or anything the generator did not spin, still needs an axis
     * and a phase — it just gets a nominal day so its own noise field is
     * not frozen to the sky. */
    var period = (rot && rot.period) ? rot.period : 86400;
    var phase = (rot ? rot.phase : 0) + (TAU / period) * t;
    /* A TIDALLY LOCKED WORLD STILL HAS WEATHER (2026-10-19). Its day is
     * its year, and a deck turning at a multiple of THAT stands still —
     * the clouds over a ring world froze in place. Its air circulates
     * anyway (day side to night side, endlessly), so past four days the
     * deck runs on a nominal 30-hour circulation of its own. */
    var deckPeriod = Math.abs(period) > 4 * 86400 ? (period < 0 ? -1 : 1) * 30 * 3600 : period;
    var deck = ((rot ? rot.phase : 0) + (TAU / deckPeriod) * t) * DECK_SUPER;
    return {
      ax: ax,
      phase: wrap(phase, TAU),
      deck: wrap(deck, TAU),
      band: deck,                          // giants only; see above
      shear: wrap(deck * SHEAR_RATE, TAU),
      weather: wrap(t / WEATHER_PERIOD, WEATHER_CYCLE),
      /* Split, not one growing number: the shader needs the whole part
       * only to hash with, where losing a bit costs nothing but a
       * different flash, and needs the fraction to be exact, because it
       * is the shape of the stroke. */
      /* THE SCHEDULE LIVES IN WEATHER.JS, with every other weather number,
       * so the suite can check the pace without a GPU and the two languages
       * cannot drift. The fallback is for gl.js loaded on its own, which
       * the hull viewer does — one slot, no rhythms, the old flat rate. */
      salt: clock ? clock.salt : saltOf(Math.floor(t / STORM_BUCKET)),
      saltPrev: clock ? clock.saltPrev : [0, 0, 0],
      slow: clock ? clock.slow : [0, 0, 0, 0],
      stormPhase: clock ? clock.phase : wrap(t / STORM_BUCKET, 1)
    };
  }

  /* ---- GROUND DETAIL, the JS half (see GD at the top) -------------------- */
  var groundDetailOn = true;
  /* For a probe or the options page: false draws the ground as it was. */
  GL.setGroundDetail = function (on) { groundDetailOn = !!on; };

  function rotAbout(v, k, a) {
    var c = Math.cos(a), s = Math.sin(a), kd = k.x * v.x + k.y * v.y + k.z * v.z;
    return { x: v.x * c + (k.y * v.z - k.z * v.y) * s + k.x * kd * (1 - c),
             y: v.y * c + (k.z * v.x - k.x * v.z) * s + k.y * kd * (1 - c),
             z: v.z * c + (k.x * v.y - k.y * v.x) * s + k.z * kd * (1 - c) };
  }
  /* The anchor, in double: the eye's own body-fixed position snapped to
   * the coarsest lattice, and the offsets the shader needs from it. Pure
   * function of where the eye is and how far the world has turned, so it
   * is exported for the suite. */
  function groundDetailFrame(b, rel, sp) {
    var R = b.radius || 1;
    var ex = -rel.x, ey = -rel.y, ez = -rel.z;           // centre -> eye, world
    var d = Math.sqrt(ex * ex + ey * ey + ez * ez);
    var alt = d - R;
    var on = 1 - smooth(GD.altLo, GD.altHi, alt);
    var eb = rotAbout({ x: ex, y: ey, z: ez }, sp.ax, -sp.phase);
    var cell = [Math.round(eb.x / GD.cmax), Math.round(eb.y / GD.cmax), Math.round(eb.z / GD.cmax)];
    var aw = rotAbout({ x: cell[0] * GD.cmax, y: cell[1] * GD.cmax, z: cell[2] * GD.cmax }, sp.ax, sp.phase);
    /* Per face and octave, the anchor turned by that octave's angle, split
     * into its integer cell and fraction — in double, here, once. */
    var rotCell = new Int32Array(6 * GD.oct), rotFrac = new Float32Array(6 * GD.oct);
    for (var face = 0; face < 3; face++) {
      var ii = GD_PICK[face][0], jj = GD_PICK[face][1];
      var ax0 = cell[ii] * GD.cmax, ay0 = cell[jj] * GD.cmax, cc = GD.cmax;
      for (var k = 0; k < GD.oct; k++, cc *= 0.5) {
        var rr = GD.rot[k];
        var rx = (rr[0] * ax0 - rr[1] * ay0) / cc, ry = (rr[1] * ax0 + rr[0] * ay0) / cc;
        var fx = Math.floor(rx), fy = Math.floor(ry), o = (face * GD.oct + k) * 2;
        rotCell[o] = fx; rotCell[o + 1] = fy; rotFrac[o] = rx - fx; rotFrac[o + 1] = ry - fy;
      }
    }
    return {
      on: on, alt: alt, cell: cell, rotCell: rotCell, rotFrac: rotFrac,
      anchorRel: { x: rel.x + aw.x, y: rel.y + aw.y, z: rel.z + aw.z },
      cq: (d - R) * (d + R)
    };
  }
  function smooth(e0, e1, x) {
    var t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
    return t * t * (3 - 2 * t);
  }
  function uploadGroundDetail(b, q, sp, skip) {
    var f = (!skip && groundDetailOn && b.kind !== 'star') ? groundDetailFrame(b, q.rel, sp) : null;
    if (!f || !(f.on > 0)) { gl.uniform1f(uni.uGdOn, 0); return; }
    gl.uniform1f(uni.uGdOn, f.on);
    gl.uniform3f(uni.uGdAnchorRel, f.anchorRel.x, f.anchorRel.y, f.anchorRel.z);
    gl.uniform2iv(uni.uGdCell, f.rotCell);
    gl.uniform2fv(uni.uGdFrac, f.rotFrac);
    gl.uniform1f(uni.uGdCq, f.cq);
  }

  /* The shader's field, line for line, in JS: gdH/gdNoise/gdPlane/
   * groundDetail before the sun term, in doubles (so not bit-for-bit the
   * GPU's floats, but the same lattice, the same hash and the same sums —
   * which is what the suite asks of it: determinism, zero mean, real
   * variance, and the same ground whichever anchor it is read from). `pb`
   * is a BODY-FIXED point in km, `nb` the body-fixed normal there,
   * `anchor` a lattice index and `foot` km per pixel. */
  function fract(x) { return x - Math.floor(x); }
  function gdHJS(cx, cy, s) {
    var px = fract((cx & 1023) * 0.1031), py = fract((cy & 1023) * 0.1030), pz = fract(s * 0.0973);
    var dd = px * (py + 33.33) + py * (pz + 33.33) + pz * (px + 33.33);
    px += dd; py += dd; pz += dd;
    return fract((px + py) * pz);
  }
  function gdNoiseJS(ix, iy, fx, fy, s) {
    var ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
    var dx = 6 * fx * (1 - fx), dy = 6 * fy * (1 - fy);
    var a = gdHJS(ix, iy, s), b = gdHJS(ix + 1, iy, s), c = gdHJS(ix, iy + 1, s), d = gdHJS(ix + 1, iy + 1, s);
    var k1 = b - a, k2 = c - a, k3 = a - b - c + d;
    return [a + k1 * ux + k2 * uy + k3 * ux * uy, dx * (k1 + k3 * uy), dy * (k2 + k3 * ux)];
  }
  function gdPlaneJS(qx, qy, ax0, ay0, foot, seed) {
    var c = GD.cmax, amp = 1, samp = GD.relief, br = 0, hu = 0, sx = 0, sy = 0, used = 0;
    for (var k = 0; k < GD.oct; k++) {
      var w = smooth(GD.fadeLo * foot, GD.fadeHi * foot, c);
      if (w <= 0) break;
      var rr = GD.rot[k];
      /* The anchor's part, split as groundDetailFrame splits it... */
      var arx = (rr[0] * ax0 - rr[1] * ay0) / c, ary = (rr[1] * ax0 + rr[0] * ay0) / c;
      var acx = Math.floor(arx), acy = Math.floor(ary);
      /* ...and the offset's, as the shader adds it. */
      var x = (rr[0] * qx - rr[1] * qy) / c + (arx - acx), y = (rr[1] * qx + rr[0] * qy) / c + (ary - acy);
      var flx = Math.floor(x), fly = Math.floor(y);
      var nz = gdNoiseJS((acx + flx) | 0, (acy + fly) | 0, x - flx, y - fly, seed + k * 7.31);
      var g0 = nz[1], g1 = nz[2];
      nz[1] = rr[0] * g0 + rr[1] * g1; nz[2] = -rr[1] * g0 + rr[0] * g1;
      var v = (nz[0] - 0.5) * w * amp;
      br += v; if (k < GD.hueOct) hu += v;
      var ws = smooth(GD.fadeLo * GD.slopeFade * foot, GD.fadeHi * GD.slopeFade * foot, c);
      sx += nz[1] * ws * samp; sy += nz[2] * ws * samp;
      c *= 0.5; amp *= GD.gain; samp *= GD.slopeGain; used++;
    }
    return { br: br, hu: hu, sx: sx, sy: sy, used: used };
  }
  var GD_PICK = [[1, 2], [2, 0], [0, 1]];
  function groundDetailAt(seed, pb, nb, anchor, foot) {
    var sd = fract(seed * 0.61803) * 89;
    var P = [pb.x - anchor[0] * GD.cmax, pb.y - anchor[1] * GD.cmax, pb.z - anchor[2] * GD.cmax];
    var an = [Math.abs(nb.x), Math.abs(nb.y), Math.abs(nb.z)];
    var a0 = (an[0] >= an[1] && an[0] >= an[2]) ? 0 : (an[1] >= an[2] ? 1 : 2);
    var a1 = a0 === 0 ? (an[1] >= an[2] ? 1 : 2) : a0 === 1 ? (an[0] >= an[2] ? 0 : 2) : (an[0] >= an[1] ? 0 : 1);
    var wb = smooth(0, GD.seam, an[a0] - an[a1]);
    function plane(ax) {
      var i = GD_PICK[ax][0], j = GD_PICK[ax][1];
      var r = gdPlaneJS(P[i], P[j], anchor[i] * GD.cmax, anchor[j] * GD.cmax, foot, sd);
      var s3 = [0, 0, 0]; s3[i] = r.sx; s3[j] = r.sy;
      return { br: r.br, hu: r.hu, s: s3, used: r.used };
    }
    var p0 = plane(a0), br = p0.br, hu = p0.hu, sl = p0.s;
    if (wb < 1) {
      var p1 = plane(a1);
      br = p1.br + (br - p1.br) * wb; hu = p1.hu + (hu - p1.hu) * wb;
      sl = [p1.s[0] + (sl[0] - p1.s[0]) * wb, p1.s[1] + (sl[1] - p1.s[1]) * wb, p1.s[2] + (sl[2] - p1.s[2]) * wb];
    }
    br /= GD.norm; hu /= GD.norm;
    var sn = sl[0] * nb.x + sl[1] * nb.y + sl[2] * nb.z;
    sl = [sl[0] - nb.x * sn, sl[1] - nb.y * sn, sl[2] - nb.z * sn];
    return { bright: br, hue: hu, elev: br * GD.elev, slope: sl, octaves: p0.used };
  }
  /* The albedo multiplier the shader's groundDetailTint applies, for a
   * sun direction `lb` (body-fixed) — so the suite can average it. */
  function groundDetailTintAt(d, nb, lb, sea, base) {
    base = base || [0.5, 0.5, 0.5];
    var snow = smooth(GD.snowLo, GD.snowHi, base[0] * 0.30 + base[1] * 0.50 + base[2] * 0.20);
    var k = (1 - 0.85 * (sea || 0)) * (1 + (GD.snowAmp - 1) * snow);
    var bx = GD.bright * d.bright * k, m = 1 + bx * GD.swing / (GD.swing + Math.abs(bx));
    var ndl = Math.max(nb.x * lb.x + nb.y * lb.y + nb.z * lb.z, GD.reliefSun);
    var rel = -(d.slope[0] * lb.x + d.slope[1] * lb.y + d.slope[2] * lb.z) / ndl;
    var rx = rel * k, ra = rx < 0 ? 1 - GD.reliefMin : GD.reliefMax - 1, r = 1 + rx * ra / (ra + Math.abs(rx));
    var h = GD.hue * d.hue * k * (1 - snow), mr = m * r, cs = (1 - mr) * snow;
    return [(1 + 0.55 * h) * (1 - 0.50 * cs) * mr, (1 + 0.05 * h) * (1 - 0.20 * cs) * mr, (1 - 0.50 * h) * (1 + 0.35 * cs) * mr];
  }
  GL.groundDetailTintAt = groundDetailTintAt;
  /* The shader's footprint (groundDetail, "GROUND PER PIXEL"), in JS:
   * km of ground per pixel along the steeper screen axis, for a unit ray
   * `rd`, ground normal `n`, distance `t` and a camera basis. */
  function groundFootprint(rd, n, t, right, up, fwd, flen) {
    function d3(a, b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
    var fz = d3(rd, fwd) / flen, rr = d3(rd, right), ru = d3(rd, up);
    var dRx = { x: (right.x - rd.x * rr) * fz, y: (right.y - rd.y * rr) * fz, z: (right.z - rd.z * rr) * fz };
    var dRy = { x: -(up.x - rd.x * ru) * fz, y: -(up.y - rd.y * ru) * fz, z: -(up.z - rd.z * ru) * fz };
    var rn = d3(rd, n); rn = rn < 0 ? Math.min(rn, -0.004) : Math.max(rn, 0.004);
    function dp(dR) {
      var k = d3(dR, n) / rn;
      return Math.hypot(t * (dR.x - rd.x * k), t * (dR.y - rd.y * k), t * (dR.z - rd.z * k));
    }
    return Math.max(dp(dRx), dp(dRy));
  }
  GL.groundFootprint = groundFootprint;
  GL.GROUND_DETAIL = GD;
  GL.groundDetailAt = groundDetailAt;
  GL.groundDetailFrame = groundDetailFrame;

  /* HOW MUCH OF THE LIGHTNING TO DRAW, set once a frame by main.js from
   * the time warp. At one times it is all of it; by a hundred times the
   * strokes are further apart than the frames and what is left is the
   * glow. See the cloud block for why. */
  var flashGain = 1;
  GL.setFlashGain = function (g) {
    flashGain = Math.max(0, Math.min(1, g));
  };

  /* A stable per-world number for the noise fields, from the body id. The id
   * is already seed-derived, so this inherits determinism for free. */
  function hashSeed(id) {
    /* ONE COPY. weather.js evaluates the same field on the CPU so a port
     * can say what its sky is doing, and a forecast seeded differently
     * from the picture is a forecast about a different planet. The
     * fallback is for gl.js loaded on its own, which the hull viewer
     * does. */
    var W = global.Weather;
    if (W && W.hashSeed) return W.hashSeed(id);
    var h = 2166136261, s = String(id || '');
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = (h * 16777619) >>> 0;
    }
    return (h % 10000) / 97.0;
  }

  /* The planet shader as it was actually built, tokens filled in. Exported
   * so the suite can check that every weather constant in the picture came
   * from weather.js — the drift that would matter is a threshold nudged in
   * one of the two languages and not the other. */
  GL.planetShaderSource = function () { return FRAG_BODY; };
  /* Same reason, for the ring: test/rings.test.js checks every constant in
   * the ring's optical depth matches Rings.ringDensity, the CPU twin. */
  GL.ringShaderSource = function () { return FRAG_RING; };

  GL.rgb = rgb;              // exported for tests
  GL.hashSeed = hashSeed;
  /* Exported so the suite can ask the renderer which way a world turns and
   * compare it with the way sim.js actually turns the ports on it. The two
   * disagreed for as long as both existed and nothing could see it. */
  GL.spinOf = spinOf;
  GL.DECK_SUPER = DECK_SUPER;
  GL.WEATHER_CYCLE = WEATHER_CYCLE;
  GL.STORM_BUCKET = STORM_BUCKET;

  global.GLWorld = GL;
  if (typeof module !== 'undefined' && module.exports) module.exports = GL;
})(typeof window !== 'undefined' ? window : globalThis);
