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
    DRIFT1: 0.42, DRIFT2: 0.28
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

  /* Does this port have weather worth mentioning at all? An orbital clamp
   * is not in anybody's air. */
  function hasWeather(port) {
    return !!(port && port.parentBody && port.parentBody.atmosphere &&
              (port.surface || port.underground));
  }

  var Weather = {
    K: K, fbm: fbm, hashSeed: hashSeed, sample: sample, lookup: lookup,
    report: report, describe: describe, hasWeather: hasWeather
  };

  global.Weather = Weather;
  if (typeof module !== 'undefined' && module.exports) module.exports = Weather;
})(typeof window !== 'undefined' ? window : globalThis);
