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

  var FRAG_BODY = [
    '#version 300 es',
    'precision highp float;',
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
    'uniform float uSpin;',       // cloud rotation phase, radians
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
    'vec3 spinY(vec3 v, float a) {',
    '  float c = cos(a), s = sin(a);',
    '  return vec3(c * v.x + s * v.z, v.y, -s * v.x + c * v.z);',
    '}',

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
     * through by anything at the same range. */
    '    gl_FragDepth = encodeDepth(dot(oc, uFwd));',
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
    '  if (uHoleR > 0.0 && distance(hit, uHoleRel) < uHoleR) discard;',
    '  gl_FragDepth = encodeDepth(dot(hit, uFwd));',
    '  vec3 n = normalize(hit - oc);',
    '  float ndl = dot(n, uSunDir);',
    /* A soft terminator. A hard max(0.0, ndl) gives a knife edge that reads
     * as a rendering artefact rather than as a sunrise. */
    '  float lam = smoothstep(-0.14, 0.30, ndl);',

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
    '    float lati = n.y;',
    '    float lon = atan(n.z, n.x);',
    '    float shear = mix(1.6, 0.35, abs(lati));',
    '    float ph = lon + uSpin * shear * 40.0;',
    '    float band = fbm(vec3(lati * 7.0, sin(ph) * 0.5, uSeed));',
    '    band = mix(band, fbm(vec3(lati * 15.0, cos(ph) * 0.4, uSeed + 5.0)), 0.4);',
    '    vec3 belt = uColor * 0.72;',
    '    vec3 zone = mix(uColor, vec3(1.0), 0.22);',
    '    vec3 gcol = mix(belt, zone, smoothstep(0.35, 0.65, band));',
    /* The storm oval: fixed seeded home, its own drift speed so it slides
     * against the bands over time; elliptical, wider in longitude. */
    '    float spotLat = -0.22 + 0.10 * (fract(uSeed * 0.13) - 0.5);',
    '    float spotLon = uSpin * 0.55 * 40.0 + uSeed;',
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
    '  vec3 sp = spinY(n, uSpin * 0.15) * 2.6 + uSeed;',
    '  float elev = fbm(sp);',
    /* Warp the field with a second, coarser one before thresholding it.
     * Straight fbm thresholds into round blobs; distorting the lookup
     * first is what turns them into coastlines with inlets and peninsulas
     * for almost no extra cost. */
    '  elev = mix(elev, fbm(sp * 0.55 + elev * 1.4), 0.45);',

    '  vec3 base = uColor;',
    '  float sea = 0.0;',
    '  if (uOcean > 0.001) {',
    '    sea = 1.0 - smoothstep(uOcean - 0.035, uOcean + 0.035, elev);',
    '    base = mix(base, uSeaColor, sea);',
    '  }',
    /* Land relief only where there is land — mottling the sea as well
     * makes the water look like more ground in a different colour. */
    '  base *= mix(0.82 + 0.34 * elev, 1.0, sea);',

    /* Ice caps. Latitude comes off the world's spin axis, which is +y here,
     * roughened slightly by the elevation field so the cap edge is ragged
     * rather than a drawn circle. */
    '  if (uIce > 0.001) {',
    '    float lat = abs(n.y);',
    '    float edge = uIce * (0.85 + 0.30 * elev);',
    '    float cap = smoothstep(1.0 - edge - 0.06, 1.0 - edge + 0.06, lat);',
    '    base = mix(base, vec3(0.92, 0.95, 0.99), cap);',
    '  }',

    /* Clouds: opaque blobs of sky, the FE2 way. Not translucent volumetrics —
     * a threshold on noise, filled solid, and lit by the same sun term as the
     * ground. Coverage drives the threshold, so an ocean world is mostly
     * white and a thin-aired desert has a few wisps. */
    '  if (uCloud > 0.001) {',
    '    vec3 cp = spinY(n, uSpin) * 2.4 + uSeed * 1.7;',
    '    float cl = fbm(cp);',
    /* Coverage-to-threshold. The first mapping ran to 0.30 at full cloud,
     * which put the cut below the middle of an fbm field that averages
     * about 0.5 — so a wet world came out under total overcast and the
     * oceans and coastlines underneath were only visible through gaps. It
     * read as an ice planet with blue continents. Bottoming out at 0.52
     * keeps even the cloudiest world mostly weather-ON-a-world rather than
     * weather instead of one. */
    '    float thresh = mix(0.95, 0.52, clamp(uCloud, 0.0, 1.0));',
    '    float mask = smoothstep(thresh, thresh + 0.055, cl);',
    '    vec3 cloudCol = mix(vec3(0.90, 0.93, 0.97), uAtmoColor, 0.22);',
    '    base = mix(base, cloudCol, mask);',
    '  }',

    '  vec3 col = base * (0.055 + 0.95 * lam);',

    /* Haze toward the limb on the day side: the air you are looking through
     * gets thicker as the surface turns away, which is what makes a world
     * with an atmosphere read as having one at a glance. */
    '  if (uAtmo > 0.0) {',
    /* Limb haze, pulled back from 0.75 to 0.45: at the old strength it
     * washed the day side toward white across most of the disc, which
     * fought the terrain for the same pixels. Haze should thicken toward
     * the edge, not bleach the middle. */
    '    float rim = pow(1.0 - z, 3.0);',
    '    col += uAtmoColor * rim * uAtmo * (0.08 + 0.45 * lam);',
    '  }',

    '  frag = vec4(col, 1.0);',
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
  var VERT_STARS = [
    '#version 300 es',
    'in vec3 aDir;',
    'in vec2 aMag;',            // x = brightness, y = size in px
    'uniform vec3 uRight, uUp, uFwd;',
    'uniform float uFlen;',
    'uniform vec2 uCenterPx;',
    'uniform vec2 uViewportPx;',
    'out float vB;',
    'void main() {',
    '  float depth = dot(aDir, uFwd);',
    '  if (depth <= 1e-6) {',           // behind the camera: park it offscreen
    '    gl_Position = vec4(2.0, 2.0, 0.0, 1.0); gl_PointSize = 1.0; vB = 0.0; return;',
    '  }',
    '  float k = uFlen / depth;',
    '  vec2 px = uCenterPx + vec2(dot(aDir, uRight) * k, -dot(aDir, uUp) * k);',
    '  gl_Position = vec4(px.x / uViewportPx.x * 2.0 - 1.0,',
    '                     1.0 - px.y / uViewportPx.y * 2.0, 0.0, 1.0);',
    '  gl_PointSize = aMag.y;',
    '  vB = aMag.x;',
    '}'
  ].join('\n');

  var FRAG_STARS = [
    '#version 300 es',
    'precision mediump float;',
    'in float vB;',
    'out vec4 frag;',
    'void main() { frag = vec4(vec3(1.0), vB); }'
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
    'out vec3 vNrm; out vec3 vCol; out float vEmis; out vec3 vRel;',
    'out float vAlpha;',
    'void main() {',
    '  vec3 rel = uModelRel + uRot * (aPos * uScale);',
    '  vNrm = uRot * aNrm; vCol = aCol; vEmis = aEmis; vRel = rel;',
    '  vAlpha = aAlpha;',
    '  float depth = dot(rel, uFwd);',
    '  if (depth <= 1e-7) { gl_Position = vec4(2.0, 2.0, 0.0, 1.0); return; }',
    '  float k = uFlen / depth;',
    '  vec2 px = uCenterPx + vec2(dot(rel, uRight), -dot(rel, uUp)) * k;',
    '  vec2 ndc = vec2(px.x / uViewportPx.x * 2.0 - 1.0,',
    '                  1.0 - px.y / uViewportPx.y * 2.0);',
    /* w = depth gives perspective-correct interpolation of the varyings.
     * z is parked at 0 because depth is written per fragment below; that
     * also means nothing is ever clipped by a near or far plane, which is
     * the other thing that goes wrong at these scales. */
    '  gl_Position = vec4(ndc * depth, 0.0, depth);',
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
    /* Whole-mesh opacity, multiplied into the per-face alpha. 1.0 is the
     * default and the opaque path short-circuits on it, so a hull costs one
     * float compare and nothing else. */
    'uniform float uAlpha;',
    /* Re-entry plasma. uGlow is Sim.updateHeating's normalised flux and
     * uWind is the direction the air is arriving from, both already
     * computed by the flight model — the shader invents nothing, it only
     * decides where on the hull to put what physics already worked out. */
    'uniform float uGlow;',
    'uniform vec3 uWind;',
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
    '  float depth = dot(vRel, uFwd);',
    '  gl_FragDepth = clamp(log2(max(uNear, depth) / uNear) * uInvLogRange, 0.0, 1.0);',
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
    '  vec3 c = vEmis > 0.5 ? vCol * 1.15 : vCol * (0.26 + 0.70 * lam);',

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
    '  }',
    '  frag = vec4(c, 1.0);',
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
    'out vec2 vUV;',
    'out float vDepth;',
    'void main() {',
    '  vUV = aUV;',
    '  float depth = dot(aPos, uFwd);',
    '  vDepth = depth;',
    /* Behind the eye: park it off-screen rather than letting it wrap round
     * through the projection, exactly as the mesh pass does. */
    '  if (depth <= 1e-7) { gl_Position = vec4(2.0, 2.0, 0.0, 1.0); return; }',
    '  float k = uFlen / depth;',
    '  vec2 px = uCenterPx + vec2(dot(aPos, uRight), -dot(aPos, uUp)) * k;',
    '  vec2 ndc = vec2(px.x / uViewportPx.x * 2.0 - 1.0,',
    '                  1.0 - px.y / uViewportPx.y * 2.0);',
    /* w = depth. This one line is the entire fix: it is what makes vUV
     * interpolate with the perspective divide instead of linearly. */
    '  gl_Position = vec4(ndc * depth, 0.0, depth);',
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
  var queue = [], vw = 0, vh = 0;
  var starProg = null, starUni = null, starVao = null, starCount = 0;
  var meshProg = null, meshUni = null, meshQueue = [], meshSeq = 0;
  var panelProg = null, panelUni = null, panelVao = null, panelBuf = null;
  var panelQueue = [], panelTex = [];

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
    try {
      gl = canvas.getContext('webgl2', {
        alpha: false, antialias: true, depth: true,
        premultipliedAlpha: false, powerPreference: 'low-power'
      });
    } catch (e) { gl = null; }
    if (!gl) { GL.available = false; return false; }

    try {
      prog = link(gl, VERT_BODY, FRAG_BODY, 'body');
      starProg = link(gl, VERT_STARS, FRAG_STARS, 'stars');
      starUni = uniforms(gl, starProg, ['uRight', 'uUp', 'uFwd', 'uFlen',
                                        'uCenterPx', 'uViewportPx']);
      meshProg = link(gl, VERT_MESH, FRAG_MESH, 'mesh');
      meshUni = uniforms(gl, meshProg, ['uModelRel', 'uRot', 'uScale',
                                        'uRight', 'uUp', 'uFwd', 'uFlen',
                                        'uCenterPx', 'uViewportPx', 'uSunDir',
                                        'uNear', 'uInvLogRange', 'uGlow', 'uWind',
                                        'uAlpha']);
    } catch (e) {
      if (global.console) console.error(e.message);
      GL.available = false; gl = null; return false;
    }

    uni = uniforms(gl, prog, ['uCenterPx', 'uQuadPx', 'uViewportPx', 'uPad',
                              'uRight', 'uUp', 'uFwd', 'uSunDir', 'uColor',
                              'uIsStar', 'uAtmo', 'uAtmoColor', 'uCloud',
                              'uSeed', 'uSpin', 'uCenterDepth', 'uWorldRadius',
                              'uNear', 'uInvLogRange', 'uBanded',
                              'uOcean', 'uSeaColor', 'uIce',
                              'uCenterRel', 'uScreenPx', 'uFlen',
                              'uHoleRel', 'uHoleR']);

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

    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    GL.available = true;
    GL.panels = !!panelProg;
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
    var mags = new Float32Array(stars.length * 2);
    for (var i = 0; i < stars.length; i++) {
      var s = stars[i];
      dirs[i * 3] = s.d.x; dirs[i * 3 + 1] = s.d.y; dirs[i * 3 + 2] = s.d.z;
      mags[i * 2] = s.b; mags[i * 2 + 1] = Math.max(1, s.size);
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
    gl.vertexAttribPointer(lm, 2, gl.FLOAT, false, 0, 0);

    gl.bindVertexArray(null);
    starCount = stars.length;
  };

  GL.drawStars = function (cam) {
    if (!gl || !starVao || !starCount) return;
    /* The backdrop, and nothing is ever behind it — so it neither tests
     * nor writes depth, and everything drawn afterwards simply covers it. */
    gl.disable(gl.DEPTH_TEST);
    gl.useProgram(starProg);
    gl.bindVertexArray(starVao);
    gl.uniform3f(starUni.uRight, cam.r.x, cam.r.y, cam.r.z);
    gl.uniform3f(starUni.uUp, cam.u.x, cam.u.y, cam.u.z);
    gl.uniform3f(starUni.uFwd, cam.f.x, cam.f.y, cam.f.z);
    gl.uniform1f(starUni.uFlen, cam.flen);
    gl.uniform2f(starUni.uCenterPx, cam.cx, cam.cy);
    gl.uniform2f(starUni.uViewportPx, vw, vh);
    gl.drawArrays(gl.POINTS, 0, starCount);
    gl.bindVertexArray(null);
  };

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
        nrm[o] = nx; nrm[o + 1] = ny; nrm[o + 2] = nz;
        col[o] = rgbv[0]; col[o + 1] = rgbv[1]; col[o + 2] = rgbv[2];
        emi[i * 3 + k] = lit ? 1 : 0;
        alp[i * 3 + k] = fa;
      }
    }

    var vaoM = gl.createVertexArray();
    gl.bindVertexArray(vaoM);
    function attr(data, name, n) {
      var b = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      var l = gl.getAttribLocation(meshProg, name);
      if (l >= 0) { gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, n, gl.FLOAT, false, 0, 0); }
    }
    attr(pos, 'aPos', 3); attr(nrm, 'aNrm', 3);
    attr(col, 'aCol', 3); attr(emi, 'aEmis', 1);
    attr(alp, 'aAlpha', 1);
    gl.bindVertexArray(null);

    mesh._gl = { vao: vaoM, count: tris * 3, id: ++meshSeq };
    return mesh._gl;
  }

  /* Queue one hull. `frame` is the renderer's own {pos, right, up, fwd} —
   * the same object paintMesh takes — and `scale` its length in km. */
  GL.queueMesh = function (cam, frame, mesh, scale, sunDir, glow, wind, alpha) {
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
                            ? alpha : 1 });
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
  };

  /* Clear to the same near-black the 2D layer used to paint, so the sky is
   * unchanged on any frame that queues nothing at all. */
  /* The one shaft mouth being cut out of its world this frame. Set by the
   * caller after begin() and cleared with it, so a port that stops being
   * relevant stops punching a hole in the planet on the very next frame
   * rather than leaving one behind. */
  var hole = null;
  GL.setSurfaceHole = function (bodyId, worldPos, radiusKm) {
    hole = (bodyId && worldPos && radiusKm > 0)
      ? { bodyId: bodyId, pos: worldPos, radius: radiusKm } : null;
  };

  /* `bg` is an optional [r,g,b] in 0..1. It exists for one case: the eye
   * inside a world, where the sky is not sky but the rock the room was cut
   * out of. Everything else takes the near-black the 2D layer used to
   * paint, so the sky is unchanged on any frame that queues nothing. */
  GL.begin = function (bg) {
    queue.length = 0;
    meshQueue.length = 0;
    panelQueue.length = 0;
    hole = null;
    if (!gl) return;
    if (bg) gl.clearColor(bg[0], bg[1], bg[2], 1);
    else gl.clearColor(0x04 / 255, 0x06 / 255, 0x0c / 255, 1);
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
  GL.queuePanel = function (cam, corners, source, alpha) {
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
                      alpha: (typeof alpha === 'number') ? alpha : 1 });
    return true;
  };

  /* One GL texture per queue slot, reused across frames. The MFD content
   * changes every frame, so the upload is unavoidable; allocating a new
   * texture for it would not be. */
  function panelTexture(i) {
    if (!panelTex[i]) {
      var t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      /* CLAMP and LINEAR, no mips. A readout is viewed at roughly its own
       * size and wrapping would drag the far edge of the screen onto the
       * near one, which is the sort of artefact that reads as corruption. */
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      panelTex[i] = t;
    }
    return panelTex[i];
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
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
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
      gl.bindTexture(gl.TEXTURE_2D, panelTexture(i));
      try {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, p.src);
      } catch (e) { continue; }      // a zero-sized canvas, mid-resize
      gl.uniform1f(panelUni.uAlpha, p.alpha);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }

    gl.bindVertexArray(null);
    gl.depthMask(true);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  }

  GL.end = function () {
    if (!gl) return;
    drawBodies();
    drawMeshes();
    /* Last, so the screens are lit over a finished world rather than
     * competing with it — and after the hull, so a panel is depth-tested
     * against the cockpit it is mounted in. */
    drawPanels();
  };

  function drawBodies() {
    if (!queue.length) return;
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

    for (var i = 0; i < queue.length; i++) {
      var q = queue[i], b = q.body, cam = q.cam;
      var at = b.atmosphere;
      var isStar = b.kind === 'star' ? 1 : 0;

      /* How much wider than the body the quad has to be, to leave room for
       * whatever glows outside the silhouette. A star's corona is generous;
       * an airless rock needs no margin at all and should not pay for one. */
      var pad = isStar ? 3.2 : (at ? 1.22 : 1.0);

      var atmoStrength = 0;
      if (at) {
        /* Thicker air glows harder, but only up to a point — a gas giant
         * should not be a lamp. Anchored on Earth's 1.225 kg/m^3 reading as
         * "a proper atmosphere", i.e. about 0.6. */
        atmoStrength = Math.min(1, Math.sqrt(at.rho0 / 1.225) * 0.6);
      }

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
      gl.uniform1f(uni.uOcean, (isStar || banded) ? 0 : terr.ocean);
      gl.uniform3f(uni.uSeaColor, sc[0], sc[1], sc[2]);
      gl.uniform1f(uni.uIce, (isStar || banded) ? 0 : terr.ice);
      gl.uniform1f(uni.uSeed, hashSeed(b.id));
      gl.uniform1f(uni.uSpin, q.t * 2.2e-5);   // slow; weather, not a blender
      gl.uniform1f(uni.uCenterDepth, q.depth);
      gl.uniform1f(uni.uWorldRadius, b.radius || 1);
      gl.uniform3f(uni.uCenterRel, q.rel.x, q.rel.y, q.rel.z);
      /* The shaft mouth, if the port we are cutting a hole for is on THIS
       * body. Recomputed against this frame's eye rather than stored as a
       * relative vector by the caller, for the same reason uCenterRel is:
       * the subtraction has to happen in double precision, once, here. */
      if (hole && hole.bodyId === b.id) {
        gl.uniform3f(uni.uHoleRel, hole.pos.x - cam.eye.x,
                     hole.pos.y - cam.eye.y, hole.pos.z - cam.eye.z);
        gl.uniform1f(uni.uHoleR, hole.radius);
      } else {
        gl.uniform1f(uni.uHoleR, 0);
      }
      gl.uniform2f(uni.uScreenPx, cam.cx, cam.cy);
      gl.uniform1f(uni.uFlen, cam.flen);

      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    gl.bindVertexArray(null);
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
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LESS);
    gl.disable(gl.BLEND);
    gl.useProgram(meshProg);

    var cam = meshQueue[0].cam;
    gl.uniform2f(meshUni.uViewportPx, vw, vh);
    gl.uniform2f(meshUni.uCenterPx, cam.cx, cam.cy);
    gl.uniform1f(meshUni.uFlen, cam.flen);
    gl.uniform3f(meshUni.uRight, cam.r.x, cam.r.y, cam.r.z);
    gl.uniform3f(meshUni.uUp, cam.u.x, cam.u.y, cam.u.z);
    gl.uniform3f(meshUni.uFwd, cam.f.x, cam.f.y, cam.f.z);
    gl.uniform1f(meshUni.uNear, DEPTH_NEAR);
    gl.uniform1f(meshUni.uInvLogRange, INV_LOG_RANGE);

    for (var i = 0; i < meshQueue.length; i++) {
      var m = meshQueue[i];
      var up = uploadMesh(m.mesh);
      gl.bindVertexArray(up.vao);
      gl.uniform3f(meshUni.uModelRel, m.rel.x, m.rel.y, m.rel.z);
      gl.uniform1f(meshUni.uScale, m.scale);
      gl.uniform3f(meshUni.uSunDir, m.sun.x, m.sun.y, m.sun.z);
      gl.uniform1f(meshUni.uGlow, m.glow);
      gl.uniform3f(meshUni.uWind, m.wind.x, m.wind.y, m.wind.z);
      gl.uniform1f(meshUni.uAlpha, m.alpha);
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
    gl.bindVertexArray(null);
    gl.enable(gl.BLEND);
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
  function terrainOf(b) {
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

  /* A stable per-world number for the noise fields, from the body id. The id
   * is already seed-derived, so this inherits determinism for free. */
  function hashSeed(id) {
    var h = 2166136261, s = String(id || '');
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = (h * 16777619) >>> 0;
    }
    return (h % 10000) / 97.0;
  }

  GL.rgb = rgb;              // exported for tests
  GL.hashSeed = hashSeed;

  global.GLWorld = GL;
  if (typeof module !== 'undefined' && module.exports) module.exports = GL;
})(typeof window !== 'undefined' ? window : globalThis);
