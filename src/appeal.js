/* appeal.js - would anybody go there for the pleasure of it?
 *
 * Worlds worth visiting, slice 1 (claude/worlds-people-and-infrastructure.md).
 * Astra, 2026-10-17: "HZ worlds, especially worlds which have nice weather
 * and a good view have more passenger destinations ... This also gives the
 * shuttle a purpose." She added the aurorae and "earthlike conditions".
 *
 * A score in 0..1 per world with air, made of three things:
 *
 *   EARTHLIKE  gravity, air and warmth near home, and WHERE on it you can
 *              live: the whole globe, a tipped world's equator band, or a
 *              locked world's twilight ring. Each is a bell around Earth's
 *              value; the three are averaged geometrically, so one hostile
 *              number sinks the lot - nobody holidays where they cannot
 *              stand up, however good the light.
 *   CLIMATE    the generator's own cloudiness (the uCloud the shader draws).
 *              A little cloud is pleasant; an ocean world under 85% cover
 *              is grey for a week at a time.
 *   VIEW       what is in the sky. A giant overhead (the postcard: a moon of
 *              a gas giant), more so if the giant is ringed; big moons close
 *              enough to see as discs; aurorae (a field over real air,
 *              burning by how hard the star drives it); and the twilight
 *              ring's sun that never sets. No second sun yet: the galaxy
 *              has no binaries (measured, 120 of 120 single).
 *
 *   appeal = earthlike^0.7 x (0.5 + 0.25 climate + 0.4 view), capped at 1.
 *
 * The view lifts a livable world; it cannot rescue a lethal one, which is
 * why earthlike multiplies rather than adds. Pure: read off fields the
 * generator already wrote, no draw from any stream, nothing saved.
 */
(function (global) {
  'use strict';

  var G0 = 9.80665;                   // m/s^2
  var EARTH_RHO = 1.225;              // kg/m^3 at the surface
  var G_SIGMA = 3.5;                  // m/s^2: a 6 or a 13 is livable, a 20 is not
  var RHO_SIGMA = 0.9;                // in ln: half or double the air is fine
  var INS_SIGMA = 0.45;               // in ln: two-thirds to one and a half suns
  var BAND = { global: 1.0, equator: 0.8, terminator: 0.65 };
  var CLOUD_EASY = 0.25;              // below this, cloud costs nothing
  var GIANT_VIEW = 0.45, RING_VIEW = 0.25, MOON_VIEW = 0.15, MOON_VIEW_MAX = 0.3;
  var AURORA_VIEW = 0.25, SUNSET_VIEW = 0.15;
  var MOON_DISC = 0.005;              // rad: half the full Moon's 0.009 still reads as a disc
  var TIERS = [[0.7, 'postcard'], [0.5, 'pleasant'], [0.3, 'livable'], [0, 'harsh']];

  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function bell(x, sigma) { return Math.exp(-0.5 * (x / sigma) * (x / sigma)); }

  function gravityOf(body) {
    var Gen = global.Gen;
    if (Gen && Gen.surfaceGravity) return Gen.surfaceGravity(body);
    return (body.mu && body.radius) ? body.mu / (body.radius * body.radius) * 1000 : G0;
  }

  /* Discs in her sky: moons of hers, and - for a moon - the planet she
   * circles and its other moons. Angular size is diameter over distance. */
  function skyDiscs(sys, body) {
    var out = [], byId = (sys && sys.byId) || {};
    (body.children || []).forEach(function (m) {
      if (m && m.radius && m.orbit && m.orbit.a) out.push({ body: m, ang: 2 * m.radius / m.orbit.a });
    });
    if (body.kind === 'moon' && body.orbit) {
      var host = byId[body.orbit.parent];
      if (host && host.radius) out.push({ body: host, ang: 2 * host.radius / body.orbit.a, host: true });
    }
    return out;
  }

  function of(sys, body) {
    if (!body || !body.atmosphere || !(body.atmosphere.rho0 > 0)) return null;
    if (body.type === 'gasGiant' || body.type === 'iceGiant' || body.kind === 'star') return null;
    var why = [];

    var g = gravityOf(body);
    var fg = bell(g - G0, G_SIGMA);
    var fair = bell(Math.log(body.atmosphere.rho0 / EARTH_RHO), RHO_SIGMA);
    var fwarm = bell(Math.log(Math.max(1e-6, body.insolation || 0) / 1), INS_SIGMA);
    /* No band: the generator only marks PLANETS habitable, so a moon with
     * good air round a giant in the zone (the postcard) would be crushed by
     * a flag it was never eligible for. The warmth bell already says whether
     * she is in the zone; the band only says how much of her is livable. */
    var band = body.habitableBand ? BAND[body.habitableBand] : body.kind === 'moon' ? 0.9 : 0.6;
    var earthlike = Math.cbrt(fg * fair * fwarm) * band;

    var cloud = typeof body.atmosphere.cloud === 'number' ? body.atmosphere.cloud : 0.5;
    var climate = clamp01(1 - 0.8 * Math.max(0, cloud - CLOUD_EASY) / (1 - CLOUD_EASY));
    if (cloud < 0.3) why.push('clear skies');
    else if (cloud > 0.75) why.push('grey skies');

    var view = 0, giant = null, moons = 0;
    skyDiscs(sys, body).forEach(function (d) {
      var b = d.body;
      if (d.host && (b.type === 'gasGiant' || b.type === 'iceGiant')) {
        giant = b; view += GIANT_VIEW;
        if (b.ring) view += RING_VIEW;
      } else if (d.ang >= MOON_DISC) {
        moons++;
      }
    });
    if (giant) why.push(giant.ring ? 'a ringed giant overhead' : 'a giant overhead');
    view += Math.min(MOON_VIEW_MAX, moons * MOON_VIEW);
    if (moons) why.push(moons === 1 ? 'a big moon' : moons + ' big moons');
    var mag = body.magnetosphere;
    if (mag && body.atmosphere.rho0 > 0.05) {
      var burn = clamp01((mag.strength || 0) * (0.5 + (mag.activity || 0)));
      if (burn > 0.15) { view += AURORA_VIEW * burn; why.push('aurorae'); }
    }
    if (body.habitableBand === 'terminator') { view += SUNSET_VIEW; why.push('a sun that never sets'); }
    view = clamp01(view);

    if (fg < 0.5) why.push(g > G0 ? 'heavy gravity' : 'light gravity');
    if (fair < 0.5) why.push(body.atmosphere.rho0 < EARTH_RHO ? 'thin air' : 'thick air');
    if (fwarm < 0.5) why.push(body.insolation > 1 ? 'hot' : 'cold');

    var score = clamp01(Math.pow(earthlike, 0.7) * (0.5 + 0.25 * climate + 0.4 * view));
    return {
      score: score, tier: tierOf(score),
      earthlike: earthlike, climate: climate, view: view,
      gravity: g, why: why
    };
  }

  function tierOf(score) {
    for (var i = 0; i < TIERS.length; i++) if (score >= TIERS[i][0]) return TIERS[i][1];
    return 'harsh';
  }

  /* One line for a chart: "pleasant - clear skies, aurorae". */
  function describe(sys, body) {
    var a = of(sys, body);
    if (!a) return null;
    return a.tier + (a.why.length ? ' - ' + a.why.slice(0, 3).join(', ') : '');
  }

  var Appeal = {
    of: of, describe: describe, tierOf: tierOf, skyDiscs: skyDiscs,
    TIERS: TIERS, BAND: BAND, G_SIGMA: G_SIGMA, RHO_SIGMA: RHO_SIGMA, INS_SIGMA: INS_SIGMA,
    GIANT_VIEW: GIANT_VIEW, RING_VIEW: RING_VIEW, AURORA_VIEW: AURORA_VIEW, MOON_DISC: MOON_DISC
  };
  global.Appeal = Appeal;
  if (typeof module !== 'undefined' && module.exports) module.exports = Appeal;
})(typeof window !== 'undefined' ? window : globalThis);
