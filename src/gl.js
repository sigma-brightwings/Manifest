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
    'uniform float uHaloPush;',   // km behind the centre the halo sits; a ring's outer radius
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
     * quiet instead of ticking over at a flat rate. */
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
    '    col += uAtmoColor * rim * uAtmo * (0.08 + 0.45 * lam);',
    '  }',

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
    /* Shared with the fragment stage — one uniform, one upload. */
    'uniform float uNear;',
    'out vec3 vNrm; out vec3 vCol; out float vEmis; out vec3 vRel;',
    'out float vAlpha;',
    'void main() {',
    '  vec3 rel = uModelRel + uRot * (aPos * uScale);',
    '  vNrm = uRot * aNrm; vCol = aCol; vEmis = aEmis; vRel = rel;',
    '  vAlpha = aAlpha;',
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
    /* THE CUTAWAY: a keyhole from the eye to the ship. xyz is the ship,
     * already relative to the eye, w is 1 when the cut is on. uCutR is
     * (radius at the ship, radius at the eye, rim as a fraction of radius).
     * See GL.setCutaway for why it is a cone and not a plane. */
    'uniform vec4 uCut;',
    'uniform vec3 uCutR;',
    'uniform vec3 uCutRim;',
    /* (widest the cut-face band may get in km, quiet zone as a fraction of
     * the local radius, how much colour the quiet zone drains, 0..1). */
    'uniform vec3 uCutBand;',
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
     * thing at the hole and the far wall keeps its colour as the backdrop. */
    '  bool rim = false;',
    '  float near = 0.0;',
    '  if (uCut.w > 0.5) {',
    '    float L2 = max(dot(uCut.xyz, uCut.xyz), 1e-12);',
    '    float t = dot(vRel, uCut.xyz) / L2;',
    '    if (t > 0.0 && t < 1.0 && distance(vRel, uCut.xyz) > uCutR.x) {',
    '      float r = mix(uCutR.y, uCutR.x, t);',
    '      float d = length(vRel - uCut.xyz * t);',
    '      if (d < r) discard;',
    '      float band = min(r * uCutR.z, uCutBand.x);',
    '      rim = d < r + band;',
    '      near = 1.0 - smoothstep(r + band, r + band + r * uCutBand.y, d);',
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
    '  vec3 lit = vCol * (0.26 + 0.70 * lam);',
    '  vec3 dim = vCol * (0.10 + 0.55 * lamp);',
    '  vec3 c = vEmis > 0.5 ? vCol * 1.15 : mix(lit, dim, uIndoors);',
    '  float glow = vEmis > 0.5 ? mix(1.0, 0.28, uIndoors) : 0.0;',
    /* THE ROOM STEPS BACK WHILE YOU LOOK THROUGH IT (2026-10-11). With the
     * keyhole open the subject is the cut and the ship at the bottom of
     * it, and the hangar's neon strips — every one a full-strength lamp —
     * were the next loudest thing on screen. Only indoors, only with the
     * cut on, so a berth seen normally is lit exactly as it was. */
    '  if (uCut.w > 0.5 && uIndoors > 0.5 && vEmis > 0.5) {',
    '    c *= 0.75;',
    '    glow *= 0.6;',
    '  }',

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
    /* Flat, unlit, no glow: a cut face is a colour, not a lamp. */
    '  if (rim) { c = uCutRim; glow = 0.0; }',
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
                                        'uCenterPx', 'uViewportPx']);
      meshProg = link(gl, VERT_MESH, FRAG_MESH, 'mesh');
      meshUni = uniforms(gl, meshProg, ['uModelRel', 'uRot', 'uScale',
                                        'uRight', 'uUp', 'uFwd', 'uFlen',
                                        'uCenterPx', 'uViewportPx', 'uSunDir',
                                        'uNear', 'uInvLogRange', 'uIndoors',
                                        'uGlow', 'uWind',
                                        'uAlpha', 'uCut', 'uCutR', 'uCutRim',
                                        'uCutBand']);
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
                              'uNear', 'uInvLogRange', 'uBanded',
                              'uOcean', 'uSeaColor', 'uIce',
                              'uCenterRel', 'uScreenPx', 'uFlen',
                              'uHoleRel', 'uHoleR', 'uHaloPush']);

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
    } catch (e3) {
      if (global.console) console.error(e3.message);
      ringProg = null;
    }

    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    GL.available = true;
    GL.panels = !!panelProg;
    GL.rings = !!ringProg;
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
    gl.drawArrays(gl.POINTS, 0, starCount);
    gl.bindVertexArray(null);
    gl.colorMask(true, true, true, true);
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
  /* WHETHER THE EYE IS INDOORS, for everything queued until it is cleared.
   * A flag rather than an argument on queueMesh because the callers that
   * matter — every drawPortPart, every door leaf, the interior — would all
   * have to pass it through identically, and one that forgot would light a
   * wall by the sun in a room with no sun in it. main.js sets it around the
   * station it is inside and clears it after. */
  var indoorsFlag = 0;
  GL.setIndoors = function (on) { indoorsFlag = on ? 1 : 0; };

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
  var CUT_RIM = [0.78, 0.42, 0.12];
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
                            ? alpha : 1,
                     /* Set by GL.setIndoors for the frames the eye spends
                      * inside something. Per-mesh rather than per-frame
                      * because a station's hull and the ship parked in it
                      * are both queued on the same frame and only one of
                      * them is being looked at from within. */
                     indoors: indoorsFlag,
                     /* Relative to the eye here, in doubles, for the same
                      * reason `rel` is. */
                     cut: cutFlag ? {
                       x: cutFlag.pos.x - cam.eye.x,
                       y: cutFlag.pos.y - cam.eye.y,
                       z: cutFlag.pos.z - cam.eye.z,
                       rShip: cutFlag.rShip, rEye: cutFlag.rEye,
                       rim: cutFlag.rim || 0, color: cutFlag.color || CUT_RIM,
                       /* typeof, not ||, so a caller can ask for 0. */
                       bandMax: typeof cutFlag.bandMax === 'number'
                                ? cutFlag.bandMax : CUT_BAND_MAX,
                       quiet: typeof cutFlag.quiet === 'number'
                              ? cutFlag.quiet : CUT_QUIET,
                       drain: typeof cutFlag.drain === 'number'
                              ? cutFlag.drain : CUT_DRAIN
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
    ringQueue.length = 0;
    hole = null;
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
    gl.colorMask(true, true, true, true);
  }

  GL.end = function () {
    if (!gl) return;
    drawBodies();
    drawMeshes();
    /* After the hulls, before the screens: translucent, so it blends over
     * what is behind it and is hidden by what is in front. */
    drawRings();
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
      var sp2 = spinOf(b, q.t);
      gl.uniform3f(uni.uSpinAxis, sp2.ax.x, sp2.ax.y, sp2.ax.z);
      gl.uniform1f(uni.uSpinPhase, sp2.phase);
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
      } else {
        gl.uniform1f(uni.uHoleR, 0);
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
      gl.uniform1f(meshUni.uIndoors, m.indoors);
      if (m.cut) {
        gl.uniform4f(meshUni.uCut, m.cut.x, m.cut.y, m.cut.z, 1);
        gl.uniform3f(meshUni.uCutR, m.cut.rShip, m.cut.rEye, m.cut.rim);
        gl.uniform3f(meshUni.uCutRim, m.cut.color[0], m.cut.color[1], m.cut.color[2]);
        gl.uniform3f(meshUni.uCutBand, m.cut.bandMax, m.cut.quiet, m.cut.drain);
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
    var ax = { x: 0, y: -Math.sin(tilt), z: Math.cos(tilt) };
    /* A star, or anything the generator did not spin, still needs an axis
     * and a phase — it just gets a nominal day so its own noise field is
     * not frozen to the sky. */
    var period = (rot && rot.period) ? rot.period : 86400;
    var phase = (rot ? rot.phase : 0) + (TAU / period) * t;
    var deck = phase * DECK_SUPER;
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
