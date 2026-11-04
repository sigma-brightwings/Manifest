/* weather.js — what the sky is doing at a place and a time.
 *
 * THE FIELD THE CLOUDS ARE DRAWN FROM, ON THE CPU. gl.js paints a world's
 * weather in a fragment shader; this evaluates the same field at a point,
 * so that when a port says "overcast" it is overcast in the picture too.
 * A game that draws one sky and reports another is worse than one that
 * reports nothing.
 *
 * TWO COPIES OF THE NOISE, ONE COPY OF EVERY NUMBER. The functions have to
 * exist twice — GLSL cannot be called from JavaScript and there is no
 * third language both of them speak — but every threshold, scale and rate
 * lives HERE and gl.js interpolates them into its shader source when it
 * builds it. So the two can differ in how they compute and cannot differ
 * in what they compute, which is the half of the duplication that would
 * actually have bitten.
 *
 * Nothing in here has state. Weather is a pure function of (body, place,
 * time) exactly as the renderer's is, so a forecast is a fact about an
 * hour rather than about when you asked.
 */
(function (global) {
  'use strict';

  var TAU = Math.PI * 2;

  /* ---- the numbers, which gl.js also uses -------------------------------
   * Changing one of these changes the picture and the forecast together,
   * which is the entire point of them being in one place. */
  var K = {
    CLOUD_SCALE: 2.4,        // lookup units across a sphere
    SEED_SCALE: 1.7,
    THRESH_HI: 0.655,        // threshold at cloud = 0 (measured; see gl.js)
    THRESH_LO: 0.405,        // ... and at cloud = 1
    EDGE: 0.055,             // softness of the cloud edge
    SHEAR: 0.21,             // latitude drag, radians at the equator
    STORM_SCALE: 2.5,        // storm lookup, relative to the cloud's
    STORM_LO: 0.55,          // a cell starts here ...
    STORM_HI: 0.70,          // ... and is fully one here
    W1: 0.9000, W2: 0.3703,  // the two circuits the field travels
    DRIFT1: 0.42, DRIFT2: 0.28,
    /* ---- lightning, scheduled rather than ticking ----------------------
     * See `stormClock` below for the whole argument. These four are the
     * shape of a flash; the clock is the shape of the storm. */
    FLASH_BUCKET: 0.9,       // s — one slot of the schedule
    FLASH_DUTY: 0.52,        // slot threshold at the peak of an active spell
    FLASH_QUIET: 0.94,       // ... and in a lull. The gap is the clustering.
    FLASH_JITTER: 0.85       // of a slot, how far a stroke may slide off grid
  };

  /* ---- the same noise, in the other language ---------------------------
   * Written to match the shader's arithmetic rather than to be good noise:
   * it has to agree with what is on screen, so every constant is the one
   * gl.js uses and the octave loop is the same four. */
  function fract(x) { return x - Math.floor(x); }
  function hash13(x, y, z) {
    x = fract(x * 0.3183099 + 0.71);
    y = fract(y * 0.3183099 + 0.113);
    z = fract(z * 0.3183099 + 0.419);
    var d = x * (y + 19.19) + y * (z + 19.19) + z * (x + 19.19);
    x += d; y += d; z += d;
    return fract((x + y) * z);
  }
  function vnoise(x, y, z) {
    var ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
    var fx = x - ix, fy = y - iy, fz = z - iz;
    fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy); fz = fz * fz * (3 - 2 * fz);
    function h(a, b, c) { return hash13(ix + a, iy + b, iz + c); }
    function mix(a, b, t) { return a + (b - a) * t; }
    return mix(mix(mix(h(0,0,0), h(1,0,0), fx), mix(h(0,1,0), h(1,1,0), fx), fy),
               mix(mix(h(0,0,1), h(1,0,1), fx), mix(h(0,1,1), h(1,1,1), fx), fy), fz);
  }
  function fbm(x, y, z) {
    var s = 0, a = 0.5;
    for (var i = 0; i < 4; i++) {
      s += a * vnoise(x, y, z);
      x *= 2.03; y *= 2.03; z *= 2.03; a *= 0.5;
    }
    return s;
  }

  function smoothstep(e0, e1, x) {
    var t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
    return t * t * (3 - 2 * t);
  }

  /* A stable per-world number for the field. Lives here rather than in
   * gl.js because the forecast and the picture must seed identically. */
  function hashSeed(id) {
    var h = 2166136261, s = String(id || '');
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = (h * 16777619) >>> 0;
    }
    return (h % 10000) / 97.0;
  }

  function rotAbout(v, k, a) {
    var c = Math.cos(a), s = Math.sin(a);
    var kd = k.x * v.x + k.y * v.y + k.z * v.z;
    return {
      x: v.x * c + (k.y * v.z - k.z * v.y) * s + k.x * kd * (1 - c),
      y: v.y * c + (k.z * v.x - k.x * v.z) * s + k.y * kd * (1 - c),
      z: v.z * c + (k.x * v.y - k.y * v.x) * s + k.z * kd * (1 - c)
    };
  }

  /* Where in the noise this bit of sky is. `n` is the OUTWARD UNIT NORMAL
   * in world coordinates — the same thing the shader solves for at each
   * pixel — and `sp` is what gl.js's spinOf returned for this body and
   * hour. Kept as its own step because the storm lookup wants the same
   * point at a different scale. */
  function lookup(n, sp, seed) {
    var nb = rotAbout(n, sp.ax, -sp.deck);
    var clat = n.x * sp.ax.x + n.y * sp.ax.y + n.z * sp.ax.z;
    var shear = K.SHEAR * (1 - Math.abs(clat)) * Math.sin(sp.shear);
    nb = rotAbout(nb, sp.ax, shear);
    var w = sp.weather;
    return {
      x: nb.x * K.CLOUD_SCALE + seed * K.SEED_SCALE
         + Math.cos(w * K.W1) * K.DRIFT1,
      y: nb.y * K.CLOUD_SCALE + seed * K.SEED_SCALE
         + Math.sin(w * K.W1) * K.DRIFT1 + Math.cos(w * K.W2) * K.DRIFT2,
      z: nb.z * K.CLOUD_SCALE + seed * K.SEED_SCALE
         + Math.sin(w * K.W2) * K.DRIFT2
    };
  }

  /* Cover and storm at one point of one world. `cover` is the body's own
   * cloudiness from the generator — the same uCloud the shader is handed. */
  function sample(n, sp, seed, cover) {
    var cp = lookup(n, sp, seed);
    var cl = fbm(cp.x, cp.y, cp.z);
    var thresh = K.THRESH_HI + (K.THRESH_LO - K.THRESH_HI) *
                 Math.max(0, Math.min(1, cover));
    var mask = smoothstep(thresh, thresh + K.EDGE, cl);
    var s = K.STORM_SCALE;
    var storm = smoothstep(K.STORM_LO, K.STORM_HI,
                           fbm(cp.x * s, cp.y * s, cp.z * s)) * mask;
    return { raw: cl, cloud: mask, storm: storm };
  }

  /* ---- what it is doing over a place ------------------------------------
   *
   * WIND COMES OUT OF THE FIELD, not out of a second random number. Air
   * runs along the pressure contours rather than down them — that is what
   * makes weather rotate instead of simply filling in — so the direction
   * here is the cloud field's gradient turned ninety degrees, and the
   * strength is how steep that gradient is plus whatever the storm is
   * adding. Two extra lookups, and the result is that the wind at a pad
   * agrees with the shape of the cloud you can see over it. */
  var WIND_BASE = 2.2;         // m/s of ordinary air movement
  var WIND_GRAD = 120;         // m/s per unit of field gradient
  var WIND_STORM = 26;         // m/s at the heart of a cell

  function report(port, sys, t) {
    var Sim = global.Sim, GL = global.GLWorld;
    var host = port && port.parentBody;
    if (!host || !Sim || !GL || !GL.spinOf) return null;
    var air = host.atmosphere;
    /* No air, no weather — and saying "clear" about a vacuum is a lie of
     * exactly the kind this file exists to avoid. */
    if (!air) return { airless: true, cloud: 0, storm: 0, wind: 0, gust: 0 };

    var sp = GL.spinOf(host, t);
    var seed = hashSeed(host.id);
    var lat = port.lat || 0, lon = port.lon || 0;

    function normalAt(la, lo) {
      var off = Sim.surfaceOffset(host, { lat: la, lon: lo, elevation: 0 }, t);
      var p = off.pos, len = Math.sqrt(p.x * p.x + p.y * p.y + p.z * p.z);
      return { x: p.x / len, y: p.y / len, z: p.z / len };
    }

    var here = sample(normalAt(lat, lon), sp, seed, air.cloud);
    /* A degree either way, which is a few hundred kilometres — the scale
     * the field actually varies on. A finer step measures rounding. */
    var d = 0.9 * Math.PI / 180;
    var dLon = sample(normalAt(lat, lon + d), sp, seed, air.cloud).raw -
               sample(normalAt(lat, lon - d), sp, seed, air.cloud).raw;
    var dLat = sample(normalAt(Math.max(-1.5, Math.min(1.5, lat + d)), lon), sp, seed, air.cloud).raw -
               sample(normalAt(Math.max(-1.5, Math.min(1.5, lat - d)), lon), sp, seed, air.cloud).raw;
    var grad = Math.sqrt(dLon * dLon + dLat * dLat);
    /* Along the contour, not down it. The sign flips across the equator
     * for the same reason it does on Earth. */
    var sign = lat < 0 ? -1 : 1;
    var dir = Math.atan2(-dLat * sign, dLon * sign);

    var wind = WIND_BASE + grad * WIND_GRAD + here.storm * WIND_STORM;
    return {
      airless: false,
      cloud: here.cloud,
      storm: here.storm,
      wind: wind,
      gust: wind * (1 + here.storm * 1.1),
      /* Bearing the wind comes FROM, in degrees, which is the convention
       * every pilot in the world reads. */
      from: ((-dir * 180 / Math.PI) + 540) % 360,
      vis: Math.max(0, 1 - here.cloud * 0.45 - here.storm * 0.75)
    };
  }

  /* One line a port can say out loud. */
  function describe(r) {
    if (!r) return '';
    if (r.airless) return 'no air';
    var sky = r.storm > 0.45 ? 'storm over the field'
            : r.storm > 0.12 ? 'squalls'
            : r.cloud > 0.75 ? 'overcast'
            : r.cloud > 0.35 ? 'broken cloud'
            : r.cloud > 0.10 ? 'scattered cloud'
            : 'clear';
    var w = 'wind ' + Math.round(r.wind) + ' m/s from ' +
            ('00' + Math.round(r.from / 10) * 10).slice(-3);
    if (r.gust > r.wind * 1.25) w += ', gusting ' + Math.round(r.gust);
    var v = r.vis > 0.7 ? '' : r.vis > 0.4 ? '  ·  visibility fair'
          : r.vis > 0.2 ? '  ·  visibility poor' : '  ·  visibility bad';
    return sky + '  ·  ' + w + v;
  }

  /* ---- and what it is like where the SHIP is -----------------------------
   *
   * The deck is not at the ground and it is not at the top of the air. It
   * sits in a band a few scale heights up, which is what makes flying down
   * through it a thing that happens at a particular moment rather than a
   * fade you are always halfway through. Below the band you are under the
   * weather and it can rain on you; inside it you are in cloud; above it
   * you are looking down at the top of it, which is what you see from
   * orbit.
   *
   * Fractions of `top` rather than of the radius, because `top` is already
   * twelve scale heights — so a thick world's deck is high and a thin
   * one's is low without a second table to keep in step. */
  var DECK_LO = 0.10, DECK_HI = 0.26;

  function aloft(ship, sys, t) {
    var Sim = global.Sim, GL = global.GLWorld;
    if (!ship || !Sim || !Sim.atmosphereContext || !GL || !GL.spinOf) return null;
    var atmo = Sim.atmosphereContext(ship.pos, sys, t);
    if (!atmo) return null;
    var body = atmo.body, air = body.atmosphere;
    if (!air || !(air.cloud > 0)) return null;

    var dx = ship.pos.x - atmo.pos.x, dy = ship.pos.y - atmo.pos.y,
        dz = ship.pos.z - atmo.pos.z;
    var r = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (!(r > 1e-9)) return null;
    var alt = r - body.radius;
    var n = { x: dx / r, y: dy / r, z: dz / r };

    var here = sample(n, GL.spinOf(body, t), hashSeed(body.id), air.cloud);
    var lo = air.top * DECK_LO, hi = air.top * DECK_HI;

    /* UNDER THE DECK IS UNDER THE DECK, all the way to the ground.
     *
     * The first version faded this out as you descended, on some notion of
     * the weather thinning — which is precisely backwards and was obvious
     * the moment it was flown: five kilometres up under a solid overcast
     * reported rain 0.03 and gloom 0.04, a sunny afternoon beneath a sky
     * that was black. What thins is the cloud ABOVE you, so the only fade
     * is at the top: full below the deck, gone a little way above it. */
    var below = 1 - smoothstep(hi, hi * 1.4, alt);

    /* And in the murk, which is its own state: the window fills and you
     * fly on instruments. Ramped over the outer fifth of the band, or
     * entering a cloud is a frame rather than a moment. */
    var edge = (hi - lo) * 0.22;
    var inside = smoothstep(lo - edge, lo + edge, alt) *
                 (1 - smoothstep(hi - edge, hi + edge, alt));

    return {
      body: body, alt: alt, deckLo: lo, deckHi: hi,
      cloud: here.cloud, storm: here.storm,
      inCloud: here.cloud * inside,
      /* Rain falls out of the bottom of the deck, and only from cloud
       * thick enough to be raining out of. */
      rain: Math.max(0, here.cloud - 0.25) / 0.75 *
            (0.35 + 0.65 * here.storm) * below,
      /* How much of the daylight the deck is keeping off you. */
      gloom: gloomOf(here) * below
    };
  }

  /* How much daylight a deck of this cover and storm keeps off the ground.
   * One formula for the canopy's wash (aloft) and the ground sky
   * (overhead), so a cockpit and a camera on the street cannot disagree
   * about how dark it is. */
  function gloomOf(here) { return here.cloud * (0.55 + 0.45 * here.storm); }

  /* ---- and over a place on the GROUND (2026-11-03) -----------------------
   *
   * The ground sky (gl.js drawGroundSky) had no weather in it: the sea
   * polish took the cloud film off the ground round your feet below 3 km of
   * eye height, which was right, and that left an overcast day looking
   * clear from the street. This is what that sky asks: the cover and the
   * storm overhead, at the local vertical `up` (unit, world) of a point on
   * `body` at time t - the same sample() the planet is painted with and a
   * port's report reads, so the broken cloud over a pad is the broken
   * cloud the forecast names. Null on an airless world or one with no
   * weather at all; nothing is invented for it. `deck` is the height of
   * the deck's base, km, for the ceiling; `phase` is the field's own clock
   * (spinOf's weather), so the underside drifts as the field does. */
  function overhead(body, up, t) {
    var GL = global.GLWorld;
    var air = body && body.atmosphere;
    if (!air || !(air.cloud > 0) || !up || !GL || !GL.spinOf) return null;
    var sp = GL.spinOf(body, t);
    if (!sp || !sp.ax) return null;            // a stand-in GL layer (tests) has no spin to give
    var here = sample(up, sp, hashSeed(body.id), air.cloud);
    return { cloud: here.cloud, storm: here.storm, gloom: gloomOf(here),
             deck: air.top * DECK_LO, phase: sp.weather };
  }

  /* Does this port have weather worth mentioning at all? An orbital clamp
   * is not in anybody's air. */
  function hasWeather(port) {
    return !!(port && port.parentBody && port.parentBody.atmosphere &&
              (port.surface || port.underground));
  }

  /* ---- the storm clock ---------------------------------------------------
   *
   * Astra, 2026-10-14: lightning should flash "at a more random-looking
   * pace", on "a long enough pattern that isn't gonna be made out to repeat,
   * but one which eventually does repeat", and it should "look more like a
   * real storm".
   *
   * WHAT WAS WRONG WAS THE METRONOME. Time was cut into fixed 0.9 s slots
   * and every stroke began at the top of its slot, so however many cells
   * fired and however hard, the sky kept a perfect 0.9 s beat. That reads as
   * a strobe with a storm texture on it. Three things fix it, and all three
   * are things real lightning does:
   *
   *   1. STROKES SLIDE OFF THE GRID. A per-cell, per-slot offset moves the
   *      leader anywhere in its slot, so the beat disappears. A stroke that
   *      starts late has to be allowed to finish after its slot ends, which
   *      is why the shader evaluates the PREVIOUS slot as well as the
   *      current one and takes whichever is brighter — without that, every
   *      late stroke is cut off mid-flash at the boundary, which is the
   *      metronome again wearing a different hat.
   *
   *   2. STORMS BURST AND THEN GO QUIET. A cell's firing threshold is
   *      modulated by four slow rhythms, so it has active spells and lulls
   *      instead of a flat rate. Real inter-flash intervals are roughly
   *      exponential — lots of short gaps, occasional long silences — and
   *      clustering a uniform draw is the cheap way to get that shape
   *      without computing a Poisson process per cell per frame.
   *
   *   3. A FLASH IS SEVERAL STROKES. A leader, a return, and sometimes a
   *      third, at hashed gaps rather than a fixed 0.22. The flicker is most
   *      of what the eye reads as lightning rather than as a lamp.
   *
   * AND IT REPEATS, EXACTLY, ON PURPOSE. The four rhythms have periods of
   * 419, 557, 683 and 811 slots — co-prime, so they only realign after
   * their product. That is 1.293e11 slots, and at 0.9 s a slot the whole
   * sky repeats after about 3,700 years of sim time. Astra asked for a
   * pattern that eventually repeats and cannot be caught repeating; this is
   * that, with the number written down instead of hoped for.
   *
   * The periods are minutes, not seconds — 6 to 12 of them — because that
   * is how long a cell actually takes to wax and wane. Picked as primes in
   * that band rather than for their size.
   *
   * Nothing here holds state, like everything else in this file: the sky at
   * time t is a function of t, so flying away and coming back finds the same
   * storm mid-flash rather than a fresh one. */
  var FLASH_RHYTHMS = [419, 557, 683, 811];     // slots; co-prime on purpose
  var FLASH_CYCLE = FLASH_RHYTHMS.reduce(function (a, b) { return a * b; }, 1);

  /* Three small numbers from one slot index.
   *
   * MATH.IMUL, NOT A PRODUCT IN A DOUBLE. The previous version multiplied
   * the slot index by 374761393 and claimed to be exact "for any bucket a
   * career will ever reach". It was not: 0.9 s slots reach 2^53 / 374761393
   * at about eight months of sim time, after which the salt quietly starts
   * losing low bits and the storms go subtly periodic — the exact failure
   * this function exists to prevent, hiding inside the function. imul keeps
   * every step in int32, so it is exact for every slot in the cycle above
   * no matter how long anybody flies. */
  function salt32(n, k) {
    /* n can exceed 2^31, so it is split rather than coerced. Both halves
     * are integers below 65536 and exact. */
    var lo = n % 65536, hi = Math.floor(n / 65536) % 65536;
    var h = Math.imul(lo ^ Math.imul(k, 0x9e3779b1), 0x85ebca6b);
    h ^= Math.imul(hi + k, 0xc2b2ae35);
    h ^= h >>> 15; h = Math.imul(h, 0x2545f491); h ^= h >>> 13;
    return ((h >>> 0) % 1000003) / 1000003;
  }

  function saltOf(n) { return [salt32(n, 1), salt32(n, 2), salt32(n, 3)]; }

  /* Everything the picture needs to draw this instant's lightning. gl.js
   * hands the lot straight to uniforms; the suite checks it without a GPU. */
  function stormClock(t) {
    var exact = t / K.FLASH_BUCKET;
    var slot = Math.floor(exact);
    var n = ((slot % FLASH_CYCLE) + FLASH_CYCLE) % FLASH_CYCLE;
    var back = ((n - 1) % FLASH_CYCLE + FLASH_CYCLE) % FLASH_CYCLE;
    var slow = [];
    for (var i = 0; i < FLASH_RHYTHMS.length; i++) {
      /* Off the REDUCED index, so the rhythms wrap with the cycle and the
       * repeat is exact rather than approximate. */
      slow.push(TAU * (n % FLASH_RHYTHMS[i]) / FLASH_RHYTHMS[i]);
    }
    return {
      slot: slot, n: n,
      salt: saltOf(n),
      saltPrev: saltOf(back),
      phase: exact - slot,          // 0..1, and exact: it shapes the stroke
      slow: slow
    };
  }

  /* ---- THE GROUND UNDER THE WEATHER (2026-10-25) -------------------------
   *
   * Where a world's seas and ice caps are, on the CPU, by the same
   * arithmetic gl.js paints them with. Astra: "water where there's water on
   * the surface" - so a survey's water has to sit under the seas you can
   * see from orbit, which means asking the picture rather than inventing a
   * second coastline. Moved here from gl.js (which reads it back) for the
   * same reason the forecast lives here: one copy, two languages.
   *
   * `ocean` is a sea LEVEL against the elevation field, not a percentage -
   * fbm sits around 0.5, so 0.5 is roughly half drowned and 0.72 is mostly
   * water. A gas or ice giant has no surface to flood and no pole to
   * freeze. A molten world's sea is lava: `lava` says so, and the survey
   * does not count it as water. */
  var TERRAIN = {
    molten:   { ocean: 0.52, sea: '#ff7a2e', ice: 0.00, lava: true },
    rocky:    { ocean: 0.00, sea: '#000000', ice: 0.04 },
    desert:   { ocean: 0.16, sea: '#8f6a3a', ice: 0.07 },   // dry basins
    terran:   { ocean: 0.55, sea: '#2a5c93', ice: 0.16 },
    ocean:    { ocean: 0.78, sea: '#1f5586', ice: 0.13 },
    tundra:   { ocean: 0.38, sea: '#3f6a86', ice: 0.34 },
    iceball:  { ocean: 0.10, sea: '#8fb8cc', ice: 0.62 },
    iceGiant: { ocean: 0.00, sea: '#000000', ice: 0.00 },
    gasGiant: { ocean: 0.00, sea: '#000000', ice: 0.00 }
  };
  var NO_TERRAIN = { ocean: 0, sea: '#000000', ice: 0 };
  function terrainOf(b) { return TERRAIN[b && b.type] || NO_TERRAIN; }

  /* The world's pole, as gl.js spinOf builds it (and Rings.ringFrame, and
   * sim.js's pads): +z tipped about x by the tilt, turned by `az` on a
   * locked world. */
  function spinAxis(body) {
    var rot = body.rotation, tilt = rot ? rot.tilt : 0, az = (rot && rot.az) || 0;
    return { x: Math.sin(tilt) * Math.sin(az), y: -Math.sin(tilt) * Math.cos(az), z: Math.cos(tilt) };
  }
  function spinPhase(body, t) {
    var rot = body.rotation;
    var period = (rot && rot.period) ? rot.period : 86400;
    return (rot ? rot.phase : 0) + (TAU / period) * t;
  }
  /* A world direction at time t into the world's own body-fixed frame -
   * the shader's spinAbout(n, uSpinAxis, -uSpinPhase). */
  function bodyFixed(body, d, t) {
    var k = spinAxis(body), a = -spinPhase(body, t);
    var c = Math.cos(a), s = Math.sin(a), kd = k.x * d.x + k.y * d.y + k.z * d.z;
    return { x: d.x * c + (k.y * d.z - k.z * d.y) * s + k.x * kd * (1 - c),
             y: d.y * c + (k.z * d.x - k.x * d.z) * s + k.y * kd * (1 - c),
             z: d.z * c + (k.x * d.y - k.y * d.x) * s + k.z * kd * (1 - c) };
  }
  /* The elevation field at a body-fixed unit direction: the shader's
   * terrain block, line for line (gl.js FRAG, "---- terrain"). */
  function elevationAt(body, p) {
    var sd = hashSeed(body.id);
    var x = p.x * 2.6 + sd, y = p.y * 2.6 + sd, z = p.z * 2.6 + sd;
    var e = fbm(x, y, z);
    var e2 = fbm(x * 0.55 + e * 1.4, y * 0.55 + e * 1.4, z * 0.55 + e * 1.4);
    return e + (e2 - e) * 0.45;
  }
  /* What the picture shows at a body-fixed direction: `sea` and `ice` are
   * 0..1 as the shader blends them, `elev` the field. `sunB` is the star's
   * direction in the same frame, needed only for a tidally locked world,
   * whose ice is its night side rather than its poles. */
  /* The sea's soft edge, in elevation units, either side of the level:
   * the shader's smoothstep(uOcean - 0.035, uOcean + 0.035). Named so the
   * inland-port test (dryAt, below) reads the same edge the picture does. */
  var SEA_EDGE = 0.035;
  function terrainAt(body, p, sunB) {
    var T = terrainOf(body), elev = elevationAt(body, p);
    var sea = T.ocean > 0.001 ? 1 - smoothstep(T.ocean - SEA_EDGE, T.ocean + SEA_EDGE, elev) : 0;
    var ice = 0, k = spinAxis(body);
    var band = body.habitableBand;
    if (band === 'terminator') {
      if (sunB) {
        var ndl = p.x * sunB.x + p.y * sunB.y + p.z * sunB.z;
        ice = 1 - smoothstep(-0.34, -0.10, ndl + (elev - 0.5) * 0.16);
      }
    } else if (band === 'equator') {
      var blat = Math.abs(p.x * k.x + p.y * k.y + p.z * k.z);
      ice = smoothstep(0.34, 0.58, blat + (elev - 0.5) * 0.12);
    } else if (T.ice > 0.001) {
      var lat = Math.abs(p.x * k.x + p.y * k.y + p.z * k.z);
      var edge = T.ice * (0.85 + 0.30 * elev);
      ice = smoothstep(1 - edge - 0.06, 1 - edge + 0.06, lat);
    }
    var bio = biomeAt(body, p, elev, sea, ice, sunB);
    return { elev: elev, sea: sea, ice: ice, lava: !!T.lava, biome: bio.name, bio: bio };
  }

  /* ---- IS THIS GROUND DRY ENOUGH TO DIG IN? (2026-11-02) -----------------
   *
   * Astra: "placement needs to not ignore coastlines. All planetside ports
   * should be set up far enough inland that no underground geometry
   * protrudes into the water." generate.js placeInland asks this, over
   * every sample of a port's footprint.
   *
   * WATER IS WATER: a sea under an ice cap is still a sea, so ice does not
   * enter into it - only the elevation against sea level does. LAVA is no
   * better to dig under than water. A DESERT's "sea" is a dry basin the
   * picture paints as salt flat (biomeName), not water, and is ground.
   *
   * THE MARGIN IS THE SHADER'S, NOT A GUESS. The picture's coast is this
   * field plus gl.js's ground-detail nudge (GD.elev times a brightness
   * normalised into [-0.5, 0.5] by construction: every octave's value noise
   * is 0..1, centred and divided by the sum of the amplitudes), so the
   * nudge can never exceed GD.elev / 2 = 0.010. Land at SEA_EDGE + that
   * above sea level is dry in the picture at every altitude, whatever the
   * crinkle does - the worst case, proven rather than sampled. COAST_SLACK
   * is the rest: the CPU field over the gap between two samples (its
   * steepest measured slope, 5.4e-4 per km over 176 ports in 40 seeds,
   * times a sample spacing under 0.2 km, is 1e-4) rounded up tenfold. */
  var DIG_NUDGE = 0.010, COAST_SLACK = 0.001;
  var DIG_MARGIN = SEA_EDGE + DIG_NUDGE + COAST_SLACK;
  /* Elevation the ground has to clear, or null on a world with nothing
   * wet to keep out of. */
  function digFloor(body) {
    var T = terrainOf(body);
    if (!(T.ocean > 0.001)) return null;
    if (body && body.type === 'desert') return null;
    return T.ocean + DIG_MARGIN;
  }
  function dryAt(body, p) {
    var f = digFloor(body);
    return f === null || elevationAt(body, p) >= f;
  }
  /* A pad's latitude and longitude to the body-fixed direction terrainAt
   * reads - sim.js surfaceOffset at the world's rest phase: the equatorial
   * frame, tipped about x by the tilt, turned about z by `az`. The spin
   * phase drops out, because bodyFixed undoes exactly the turn that
   * surfaceOffset adds. ground.test holds this to Sim. */
  function padDir(body, lat, lon) {
    var rot = body.rotation || {}, tilt = rot.tilt || 0, az = rot.az || 0;
    var cl = Math.cos(lat), x = cl * Math.cos(lon), y = cl * Math.sin(lon), z = Math.sin(lat);
    var ct = Math.cos(tilt), st = Math.sin(tilt);
    var py = y * ct - z * st, pz = y * st + z * ct;
    var ca = Math.cos(az), sa = Math.sin(az);
    return { x: x * ca - py * sa, y: x * sa + py * ca, z: pz };
  }

  /* ---- BIOMES (2026-11-02) ----------------------------------------------
   *
   * Astra: "Can we also have some more earthlike biomes on planets?" A
   * terran world was one land colour with a coastline cut into it. Now its
   * land is split the way Whittaker split Earth's: by TEMPERATURE and by
   * MOISTURE, read off things the world already has.
   *
   *   TEMPERATURE. The world's own warmth is its insolation (generate.js,
   *   Earth = 1). Measured across 40 systems in four galaxies, terran
   *   worlds run 0.33 to 1.74 (median 0.69), oceans 0.35 to 1.65, tundras
   *   0.11 to 2.47; so `warm` is 0.62 + 0.30 log2(insolation), which puts
   *   the median terran's equator in the warm-temperate band and its poles
   *   in tundra, the cold edge of the zone at a temperate equator and the
   *   hot edge at a tropical one. Latitude comes off the real spin axis;
   *   height above the sea cools it (a lapse rate in elevation units, as a
   *   fraction of the world's own relief).
   *
   *   MOISTURE. Close to the sea is wet; the rest is a low-frequency noise
   *   field (a second fbm, offset from the elevation's), so the interior
   *   of a continent has its own wet and dry country.
   *
   * The colour is a 4 x 3 grid in (temperature, moisture), interpolated
   * bilinearly, so no two biomes ever meet at a line; wetland, bare rock
   * and snow lie over it on their own smooth ramps. It is then tinted a
   * little toward the world's own colour, and blended into it by `mix`:
   * a desert keeps most of its sand and gets scrub and oases at the edges
   * of its dry basins; a tundra keeps its cold palette.
   *
   * ONE COPY, TWO LANGUAGES. gl.js builds its GLSL from this table and
   * this arithmetic (GL.planetShaderSource; test/biomes.test.js holds the
   * two together), and nothing here draws from any stream: the moisture
   * field is the elevation field's own lookup, offset. Same seed, same
   * biomes.
   *
   * `biome` is a NAME for what is under you, for the game to say. Nothing
   * reads it for gameplay yet. */
  var BIOME = {
    /* Per world type. `mix`: how far the land goes from the world's colour
     * to the biome colour. `moist`: added to the moisture everywhere.
     * `warm`: added to the warmth — a TUNDRA is a cold world by type, and
     * measured it can sit at a median terran's insolation (Kawartha star
     * 4's tundra is at 0.69); read off insolation alone it came out as
     * green as a terran from orbit, which is the type lying. `marsh`: how
     * much wetland its coasts grow. A desert's dry basins are not shores,
     * and ringed with marsh they read from orbit as dark holes. */
    worlds: {
      terran: { mix: 0.78, moist: 0.00, warm: 0.00, marsh: 1.0 },
      ocean:  { mix: 0.78, moist: 0.15, warm: 0.00, marsh: 1.0 },
      tundra: { mix: 0.40, moist: -0.05, warm: -0.45, marsh: 0.6 },
      desert: { mix: 0.50, moist: -0.42, warm: 0.00, marsh: 0.0 }
    },
    warmBase: 0.62, warmLog: 0.30, warmMin: -0.40, warmMax: 1.10,
    equator: 0.25,       // the equator is this much warmer than the world...
    pole: 0.80,          // ...and the pole this much colder (x lat^2)
    /* MOUNTAINS are absolute height on the elevation field, not height
     * above the sea: measured over 40 worlds the field's 90th percentile is
     * 0.562, its 99th 0.637 and its 99.9th 0.690, the same on every world.
     * Measured from a desert's dry-basin level (0.16) instead, 87% of every
     * desert came out mountain or snow. hM runs 0 at 0.56 to 1 at 0.66. */
    mountLo: 0.56, mountSpan: 0.10,
    lapse: 0.50,         // cooling at hM = 1
    snowT: -0.30,        // below this it is snow, whatever grows above it
    /* A terminator world's temperature is where you are across its ring
     * (the sun's height, ndl), not latitude. Centred temperate and running
     * cool to the night edge and warm to the day edge. A first cut of 0.55 +
     * 1.4(ndl - 0.15) made the ring hot, and Low Deep's band (Kaynxa) went
     * from the old olive to savanna tan: right by the numbers, but the
     * band is the one living place on the world and it stopped looking
     * alive. Its air circulates day to night, so its moisture is floored. */
    ringT: 0.45, ringSlope: 1.0, ringMoist: 0.10,
    /* MOUNTAINS FOLLOW RIDGES. The elevation field is smooth at continental
     * scale, so a threshold on it alone is a round blob: a white hole in
     * the middle of a continent from orbit (Kawartha star 11). Rock and
     * snow are cut from height plus a ridged noise (1 - |2n - 1|, two
     * octaves, ~36 cycles a radius), so they break into ranges and patches.
     * And rock is a darker, greyer version of the ground it stands in, not
     * one grey for every world: on a desert that grey read as stains. */
    ridgeScale: 14.0, ridgeAmp: 0.60, ridgeMid: 0.62, rockGrey: 0.45, rockDark: 0.88,
    coast: 0.10,         // height above the sea within which the coast is wet
    coastWet: 0.55, noiseWet: 0.70,
    moistScale: 1.7, moistOffset: 11.3,
    tint: 0.25,          // toward the world's own hue
    /* Rows: polar, cold, temperate, hot. Columns: dry, mid, wet. */
    grid: [
      /* Polar and cold rows are lichen and moss, grey-green-brown, not
       * olive: blended into a tundra world's own grey the first set came
       * out muddy olive from orbit (Kawartha star 4). */
      [[0.55, 0.54, 0.50], [0.50, 0.52, 0.47], [0.45, 0.49, 0.45]],
      [[0.60, 0.57, 0.47], [0.42, 0.47, 0.39], [0.20, 0.31, 0.25]],
      [[0.72, 0.64, 0.47], [0.47, 0.57, 0.28], [0.19, 0.38, 0.16]],
      [[0.84, 0.70, 0.46], [0.65, 0.59, 0.31], [0.10, 0.32, 0.11]]
    ],
    wet: [0.26, 0.35, 0.24], rock: [0.55, 0.51, 0.47], snow: [0.93, 0.95, 0.98]
  };
  var BIOME_NONE = { mix: 0, moist: 0, warm: 0, marsh: 0 };
  function biomeParams(body) {
    var w = BIOME.worlds[body && body.type] || BIOME_NONE;
    var ins = (body && body.insolation > 0) ? body.insolation : 1;
    var warm = BIOME.warmBase + BIOME.warmLog * Math.log(ins) / Math.LN2 + w.warm;
    warm = Math.max(BIOME.warmMin, Math.min(BIOME.warmMax, warm));
    /* A twilight world's living band is its oasis whatever the world is
     * (generate.js: "Desert and tundra worlds qualify too — the ring is
     * the oasis"), so a dry world's band is not made dry again here, nor
     * washed back to sand: blended at a desert's 0.5, Low Deep's ring
     * (Kaynxa) went from the old flat olive to tan, and the oasis was gone.
     * Only the band ever shows this colour (gl.js uses it as the band's
     * verdure), so the world outside it is untouched. */
    var band = body && (body.habitableBand === 'terminator' || body.habitableBand === 'equator');
    return { mix: band ? Math.max(BIOME.worlds.terran.mix, w.mix) : w.mix, moist: band ? Math.max(BIOME.ringMoist, w.moist) : w.moist, warm: warm, marsh: band ? Math.max(0.6, w.marsh) : w.marsh };
  }
  function hexRgb(h) {
    var m = /^#?([0-9a-f]{6})$/i.exec(h || '');
    if (!m) return [0.5, 0.5, 0.5];
    var v = parseInt(m[1], 16);
    return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
  }
  function mix3(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
  /* The shader's biomeColour, line for line. `p` body-fixed unit, `elev`
   * the warped elevation, `ndl` the sun's height (a terminator world's
   * temperature is its ring position, not its latitude). Returns the
   * colour, the two axes and the overlay weights, and the name. */
  function biomeAt(body, p, elev, sea, ice, sunB) {
    var T0 = terrainOf(body), bp = biomeParams(body);
    var k = spinAxis(body), band = body && body.habitableBand;
    var lat = Math.abs(p.x * k.x + p.y * k.y + p.z * k.z);
    var h = elev - T0.ocean;
    var hN = Math.max(0, elev - BIOME.mountLo) / BIOME.mountSpan;
    var t;
    if (band === 'terminator') {
      var ndl = sunB ? (p.x * sunB.x + p.y * sunB.y + p.z * sunB.z) : 0.15;
      t = BIOME.ringT + BIOME.ringSlope * (ndl - 0.15);
    } else {
      t = bp.warm + BIOME.equator - BIOME.pole * lat * lat;
    }
    t -= BIOME.lapse * hN;
    var sd = hashSeed(body.id);
    var q = BIOME.moistScale * 2.6, o = sd + BIOME.moistOffset;
    var mn = fbm(p.x * q + o, p.y * q + o, p.z * q + o);
    mn = Math.max(0, Math.min(1, 0.5 + (mn - 0.47) * 3.2));
    var coastW = 1 - smoothstep(0, BIOME.coast, h);
    var m = Math.max(0, Math.min(1, BIOME.coastWet * coastW + BIOME.noiseWet * (mn - 0.5) + 0.40 + bp.moist));
    var rs = BIOME.ridgeScale * 2.6, ro = sd + 3.7;
    var rn = 0.67 * vnoise(p.x * rs + ro, p.y * rs + ro, p.z * rs + ro)
           + 0.33 * vnoise(p.x * rs * 2.1 + ro, p.y * rs * 2.1 + ro, p.z * rs * 2.1 + ro);
    var ridge = 1 - Math.abs(2 * rn - 1);
    var hR = hN + BIOME.ridgeAmp * (ridge - BIOME.ridgeMid);
    var col = biomeGrid(t, m);
    var wetW = (1 - smoothstep(0.0, 0.02, h)) * smoothstep(0.55, 0.75, m) * smoothstep(0.20, 0.35, t) * bp.marsh;
    col = mix3(col, BIOME.wet, wetW);
    var rockW = smoothstep(0.35, 0.70, hR);
    col = mix3(col, mix3([col[0] * BIOME.rockDark, col[1] * BIOME.rockDark, col[2] * BIOME.rockDark], BIOME.rock, BIOME.rockGrey), rockW);
    var snowW = Math.max(smoothstep(0.95, 1.25, hR) * (1 - smoothstep(0.25, 0.45, t)),
                         1 - smoothstep(BIOME.snowT - 0.12, BIOME.snowT, t));
    col = mix3(col, BIOME.snow, snowW);
    var wc = hexRgb(body && body.color);
    var wl = Math.max((wc[0] + wc[1] + wc[2]) / 3, 0.05);
    var tinted = [col[0] * (1 + (wc[0] / wl - 1) * BIOME.tint), col[1] * (1 + (wc[1] / wl - 1) * BIOME.tint),
                  col[2] * (1 + (wc[2] / wl - 1) * BIOME.tint)];
    var rgb = mix3(wc, tinted, bp.mix);
    return { name: biomeName(body, T0, bp, t, m, sea, ice, wetW, rockW, snowW, sunB, p, elev),
             rgb: rgb, t: t, m: m, wet: wetW, rock: rockW, snow: snowW };
  }
  function biomeGrid(t, m) {
    var g = BIOME.grid;
    var ti = Math.max(0, Math.min(1, t)) * 3, mi = Math.max(0, Math.min(1, m)) * 2;
    var i0 = Math.min(2, Math.floor(ti)), j0 = Math.min(1, Math.floor(mi));
    var ft = ti - i0, fm = mi - j0;
    var a = mix3(g[i0][j0], g[i0][j0 + 1], fm), b = mix3(g[i0 + 1][j0], g[i0 + 1][j0 + 1], fm);
    return mix3(a, b, ft);
  }
  /* What it is called. Not a shader line: the picture blends, the name
   * picks whichever thing dominates. */
  function biomeName(body, T0, bp, t, m, sea, ice, wetW, rockW, snowW, sunB, p, elev) {
    var type = body && body.type;
    if (sea > 0.5) return T0.lava ? 'lava sea' : type === 'desert' ? 'salt flat' : 'sea';
    if (ice > 0.5) return 'ice cap';
    var band = body && body.habitableBand;
    if (band === 'terminator' && sunB) {
      var ndl = p.x * sunB.x + p.y * sunB.y + p.z * sunB.z;
      if (smoothstep(0.40, 0.64, ndl + (elev - 0.5) * 0.16) > 0.5) return 'scorched rock';
    } else if (band === 'equator') {
      var k = spinAxis(body);
      if (smoothstep(0.34, 0.58, Math.abs(p.x * k.x + p.y * k.y + p.z * k.z) + (elev - 0.5) * 0.12) > 0.5) return 'polar waste';
    }
    if (!(bp.mix > 0)) return type === 'molten' ? 'lava plain' : type === 'iceball' ? 'ice' : 'bare rock';
    if (snowW > 0.5) return 'snowfield';
    if (rockW > 0.5) return 'mountain';
    if (wetW > 0.5) return 'wetland';
    /* A desert world's scrub only counts where the biome has actually
     * coloured the ground; elsewhere it is the world's own sand. */
    if (type === 'desert' && m < 0.30) return 'desert';
    if (t < 1 / 6) return 'tundra';
    if (t < 0.5) return m < 0.25 ? 'steppe' : 'taiga';
    if (t < 5 / 6) return m < 0.25 ? 'desert' : m < 0.62 ? 'grassland' : 'temperate forest';
    return m < 0.30 ? 'desert' : m < 0.65 ? 'savanna' : 'rainforest';
  }

  var Weather = {
    TERRAIN: TERRAIN, terrainOf: terrainOf, terrainAt: terrainAt,
    dryAt: dryAt, digFloor: digFloor, padDir: padDir, DIG_MARGIN: DIG_MARGIN, DIG_NUDGE: DIG_NUDGE,
    BIOME: BIOME, biomeParams: biomeParams, biomeAt: biomeAt, biomeGrid: biomeGrid,
    elevationAt: elevationAt, bodyFixed: bodyFixed, spinAxis: spinAxis,
    K: K, fbm: fbm, hashSeed: hashSeed, sample: sample, lookup: lookup,
    report: report, describe: describe, hasWeather: hasWeather,
    aloft: aloft, overhead: overhead, gloomOf: gloomOf, DECK_LO: DECK_LO, DECK_HI: DECK_HI,
    stormClock: stormClock, saltOf: saltOf,
    FLASH_RHYTHMS: FLASH_RHYTHMS, FLASH_CYCLE: FLASH_CYCLE
  };

  global.Weather = Weather;
  if (typeof module !== 'undefined' && module.exports) module.exports = Weather;
})(typeof window !== 'undefined' ? window : globalThis);
