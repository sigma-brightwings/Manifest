/* interior.js - one seeded interior per world (2026-11-22).
 *
 * Astra brought the plan (claude/planetary-interiors.md): "make the magnetic
 * field of a surveyed planet correspond to the rest of the planet's
 * features." Every instrument used to carry its own partial planet - gravity
 * knew a core, the magnetometer knew a dipole, and the two had never met.
 * This file is the one planet they all read.
 *
 * FORWARD MODEL, NEVER INVERSION. The game builds the interior first and
 * works out what each instrument would read from it. It never works
 * backwards from readings: many interiors fit the same surface data, which
 * is why real surveys still drill. One interior per seed means the
 * instruments agree by construction - and the player is the one doing the
 * inversion, with a drill or a drone to prove them right or wrong.
 *
 * SLICE 1 IS DATA ONLY. Nothing reads this yet. It wraps gravity.js
 * profileOf WITHOUT CHANGING IT: rc and kc are taken as they are, and the
 * new layers (crust, inner core, mantle state) are names on that same
 * two-density profile, carrying no weight of their own. That is deliberate:
 * give the crust its own density and g moves on every world, and every
 * gravity contact moves with it. Weight comes later, if a reading needs it.
 *
 * WHAT DECIDES A DYNAMO. A field needs a liquid outer core that is still
 * stirring - and what stirs it is heat leaving the core, not spin alone
 * (Venus turns slowly, but mostly it has no field because its heat leaks
 * out slowly). So: `heat` from the world's type, its size (a big world
 * keeps its heat) and tidal kneading (a moon of a giant), which sets how
 * much of the core is still liquid; spin multiplies it, as the old roll's
 * x1.2 / x0.7 did. Giants always have one: metallic hydrogen and an ionic
 * ocean are conductors that convect.
 *
 * `drive` is 0..1, how hard the dynamo runs. It is not the field strength:
 * slice 6 turns it into one, keeping buildMagnetospheres' own draws.
 *
 * THE CURIE DEPTH. Magnetic minerals lose their magnetism above a
 * temperature (magnetite at about 580 C), and rock gets hotter with depth,
 * so below some depth nothing stays magnetised. A body below it is heavy on
 * the gravimeter and silent on the coil, which is what keeps the
 * gravimeter's deep band its own.
 *
 * SEED DATA, DRAWING NOTHING. Hashes of star, body and purpose, like
 * survey.js and gravity.js; cached per body. Asking a world its interior
 * touches no rng. */
(function (global) {
  'use strict';

  var CACHE = new WeakMap();
  var M_EARTH = 5.972e24;

  /* First guesses by type, to tune by measuring (tools/measure-interiors.js).
   *   crust  km of rock crust (shell: km of ice shell instead)
   *   heat   how much heat the type keeps, before size and tides
   *   curie  km to the Curie depth on a world of this type
   *   remn   chance a world with no dynamo keeps patches of old magnetised
   *          crust (Mars does), and so a coil worth carrying */
  var TYPE = {
    terran:    { crust: [10, 60],  heat: 0.75, curie: [20, 40], remn: 0.30 },
    ocean:     { crust: [8, 40],   heat: 0.70, curie: [15, 35], remn: 0.25 },
    tundra:    { crust: [30, 70],  heat: 0.70, curie: [25, 45], remn: 0.40 },
    desert:    { crust: [30, 80],  heat: 0.62, curie: [30, 55], remn: 0.50 },
    rocky:     { crust: [40, 100], heat: 0.36, curie: [45, 90], remn: 0.60 },
    molten:    { crust: [2, 15],   heat: 1.00, curie: [1, 5],   remn: 0.05 },
    rockyMoon: { crust: [30, 90],  heat: 0.20, curie: [40, 80], remn: 0.45 },
    iceball:   { shell: [5, 100],  heat: 0.25, curie: [40, 80], remn: 0.10 },
    iceMoon:   { shell: [5, 100],  heat: 0.20, curie: [40, 80], remn: 0.05 },
    gasGiant:  { giant: 'metallic hydrogen', heat: 1, curie: null, remn: 0 },
    iceGiant:  { giant: 'ionic ocean',       heat: 1, curie: null, remn: 0 }
  };

  /* What each mass is made of, and the two properties that follow from it.
   *   sign  denser (+1) or lighter (-1) than the rock it sits in
   *   mag   how strongly it is magnetised, 0..1, above the Curie depth */
  var COMP = {
    iron:     { name: 'iron-nickel',       sign: 1,  mag: 1.00 },
    sulphide: { name: 'sulphide',          sign: 1,  mag: 0.50 },
    rare:     { name: 'heavy rare-metal',  sign: 1,  mag: 0.15 },
    fissile:  { name: 'fissile-bearing',   sign: 1,  mag: 0 },
    ice:      { name: 'ice',               sign: -1, mag: 0 },
    salt:     { name: 'salt',              sign: -1, mag: 0 }
  };
  /* The share past which grade IV reads a body "dense for its size"
   * (gravity.js contacts: s.share > 0.55). A heavy rare-metal body is
   * exactly that, so the tell and the composition can never disagree. */
  var RARE_SHARE = 0.55;
  /* Iron over sulphide, for a metal body that is not rare. */
  var IRON_P = 0.6;
  /* A liquid shell thinner than this (radius fraction) cannot hold a dynamo
   * however hot the world: Earth's outer core is about 0.35. */
  var SHELL_MIN = 0.08;
  /* The dynamo number past which it runs: shell x heat x spin. */
  var DYNAMO_AT = 0.4;
  var MOLTEN_FLUX = 0.6;

  function deps() { return global.Survey && global.Gravity; }
  function h01(tag) { return global.Survey.hash01(tag); }
  function spanAt(span, h) { return span[0] + (span[1] - span[0]) * h; }
  function clamp(x, a, b) { return x < a ? a : (x > b ? b : x); }

  function tagOf(body, sys) {
    var star = sys && sys.star ? sys.star.id : (sys && sys.root && sys.root.id) || '';
    return (sys && (sys.seedTag || sys.name) || star) + '|' + (body ? body.id : '') + '|int:';
  }

  /* The survey's own type key (survey.js typeKey), so the interior and the
   * ore table agree on what a world is. */
  function typeOf(body) {
    var S = global.Survey;
    if (S.typeKey) return S.typeKey(body);
    if (body.kind === 'moon') return /ice/i.test(body.typeName || '') ? 'iceMoon' : 'rockyMoon';
    return TYPE[body.type] ? body.type : 'rocky';
  }

  function parentOf(body, sys) {
    var pid = body.orbit && body.orbit.parent;
    if (!pid || !sys) return null;
    if (sys.byId) return sys.byId[pid] || sys.byId.get && sys.byId.get(pid) || null;
    for (var i = 0; i < (sys.bodies || []).length; i++) if (sys.bodies[i].id === pid) return sys.bodies[i];
    return null;
  }

  /* Spin as the old roll weighed it: a fast spinner stirs harder, a slow
   * or a tidally locked one less. */
  function spinOf(body) {
    var per = body.rotation ? Math.abs(body.rotation.period) / 3600 : 24;
    var f = per < 14 ? 1.2 : (per > 50 ? 0.7 : 1);
    if (body.tidallyLocked) f *= 0.6;
    return f;
  }

  /* How much heat the world still has, 0..~1.2. */
  function heatOf(body, sys, T, tag) {
    var h = T.heat;
    var m = body.mass > 0 ? body.mass / M_EARTH : 1;
    h += clamp(0.12 * Math.log(m) / Math.LN10, -0.2, 0.15);
    var par = parentOf(body, sys);
    var tidal = 0;
    if (body.kind === 'moon' && par && /Giant$/.test(par.type || '')) tidal = 0.30 * h01(tag + 'tidal');
    h += tidal;
    h += 0.15 * (h01(tag + 'heat') - 0.5);
    return { heat: clamp(h, 0, 1.2), tidal: tidal };
  }

  /* Every mass in the world, tagged with what it is made of: exactly the
   * gravity sources - provinces, hotspots, buried bodies, and since slice 2
   * the light ones, buried ice and salt (gravity.js lightBodies, which uses
   * the same hashes slice 1 laid ice down with here). One list, so the
   * interior and the gravimeter can never disagree about what is down
   * there. */
  function bodiesOf(body, sys, tag, curieKm) {
    var out = [];
    (global.Gravity.sourcesOf(body, sys) || []).forEach(function (s) {
      var comp;
      if (s.kind === 'fissile') comp = 'fissile';
      else if (s.kind === 'ice') comp = 'ice';
      else if (s.kind === 'salt') comp = 'salt';
      else if (s.share > RARE_SHARE) comp = 'rare';
      else comp = h01(tag + 'comp:' + s.id) < IRON_P ? 'iron' : 'sulphide';
      out.push(mass(s.id, s.kind, comp, s, curieKm));
    });
    return out;
  }
  function mass(id, kind, comp, s, curieKm) {
    var C = COMP[comp];
    var above = curieKm != null && s.zKm <= curieKm;
    return { id: id, kind: kind, comp: comp, compName: C.name,
             c: s.c, cover: s.cover, radKm: s.radKm, zKm: s.zKm, band: s.band,
             w: s.w, sign: C.sign, surface: !!s.surface,
             mag: C.mag, aboveCurie: above,
             /* What a coil could ever hear from it: nothing below Curie. */
             magnetic: above && C.mag > 0 };
  }

  /* The layers, outside in, as radius fractions: what the cutaway draws.
   * Names only - the weight is profileOf's two densities. */
  function layersOf(T, p, crustKm, shellKm, oceanKm, innerFrac, R) {
    var L = [], rc = p.rc;
    if (T.giant) {
      L.push({ name: 'envelope', from: 0.8, to: 1 });
      L.push({ name: T.giant, from: rc, to: 0.8 });
      L.push({ name: 'rock and ice core', from: 0, to: rc });
      return L;
    }
    var top = 1;
    if (shellKm) {
      var sh = clamp(shellKm / R, 0, 0.5);
      L.push({ name: 'ice shell', from: top - sh, to: top }); top -= sh;
      if (oceanKm) {
        var oc = clamp(oceanKm / R, 0, top - rc - 0.02);
        L.push({ name: 'water ocean', from: top - oc, to: top }); top -= oc;
      }
    } else {
      var cr = clamp(crustKm / R, 0, 0.3);
      L.push({ name: 'crust', from: top - cr, to: top }); top -= cr;
    }
    L.push({ name: 'mantle', from: rc, to: top });
    var ri = rc * innerFrac;
    if (ri < rc - 1e-6) L.push({ name: 'outer core', from: ri, to: rc });
    if (ri > 1e-6) L.push({ name: 'inner core', from: 0, to: ri });
    return L;
  }

  function of(body, sys) {
    if (!deps() || !body) return null;
    if (body.kind !== 'planet' && body.kind !== 'moon') return null;
    var hit = CACHE.get(body);
    if (hit && hit.sys === sys) return hit;
    var p = global.Gravity.profileOf(body, sys);
    if (!p) return null;
    var key = typeOf(body), T = TYPE[key] || TYPE.rocky, tag = tagOf(body, sys);
    var R = body.radius || 1;
    var out = { sys: sys, type: key, rc: p.rc, kc: p.kc, D: p.D };

    if (T.giant) {
      out.crustKm = 0; out.shellKm = 0; out.oceanKm = 0;
      out.innerFrac = 0; out.mantle = T.giant;
      out.heat = 1; out.tidal = 0; out.spin = spinOf(body);
      out.outerShell = 0.8 - p.rc;
      out.dynamo = true; out.drive = 1; out.remanence = 0;
      out.curieKm = null;
      out.layers = layersOf(T, p, 0, 0, 0, 0, R);
      /* No rock to hold a lump in. gravity.js sourcesOf does still list
       * provinces and buried bodies on a giant (a seam from before the
       * interior, noted for slice 2); the interior does not repeat it. */
      out.bodies = [];
      CACHE.set(body, out);
      return out;
    }

    var ht = heatOf(body, sys, T, tag);
    var heat = ht.heat;
    /* How much of the core is still liquid: none below heat 0.25, all of
     * it past 0.85. Earth (heat ~0.75) lands an inner core about a third
     * of the core's radius, which is where Earth's sits. */
    var liquid = clamp((heat - 0.25) / 0.6, 0, 1);
    var innerFrac = clamp(1 - liquid * (0.55 + 0.4 * h01(tag + 'inner')), 0, 1);
    var outerShell = p.rc * (1 - innerFrac);
    var spin = spinOf(body);
    /* A magma ocean over the core is nearly as hot as the core, so little
     * heat leaves it and the dynamo struggles: "often, but noisy". */
    var flux = key === 'molten' ? MOLTEN_FLUX : 1;
    var q = (outerShell / 0.3) * heat * spin * flux;
    var dynamo = outerShell >= SHELL_MIN && q >= DYNAMO_AT;

    var crustKm = 0, shellKm = 0, oceanKm = 0, mantle;
    if (T.shell) {
      shellKm = Math.min(spanAt(T.shell, h01(tag + 'shell')), 0.3 * R);
      /* An ocean under the ice wants heat - tides, mostly. */
      if (heat + ht.tidal > 0.35) oceanKm = Math.min(shellKm * (0.5 + 1.5 * h01(tag + 'ocean')), 0.2 * R);
      mantle = oceanKm ? 'water ocean' : 'solid ice';
    } else {
      crustKm = Math.min(spanAt(T.crust, h01(tag + 'crust')), 0.3 * R);
      mantle = key === 'molten' ? 'magma ocean' : (heat >= 0.45 ? 'convecting' : 'solid');
    }

    /* The Curie depth: the type's span, hotter is shallower. Under an ice
     * shell it is measured from the surface, through the shell, into the
     * rock. */
    var curieKm = spanAt(T.curie, h01(tag + 'curie')) * clamp(T.heat / Math.max(0.2, heat), 0.6, 1.6);
    curieKm = Math.min(curieKm + shellKm, 0.3 * R);

    /* Old magnetised crust, where there is no dynamo to drown it. */
    var remanence = 0;
    if (!dynamo && h01(tag + 'remn') < T.remn) remanence = 0.1 + 0.4 * h01(tag + 'remn:w');

    out.crustKm = crustKm; out.shellKm = shellKm; out.oceanKm = oceanKm;
    out.innerFrac = innerFrac; out.mantle = mantle;
    out.heat = heat; out.tidal = ht.tidal; out.spin = spin;
    out.outerShell = outerShell;
    out.dynamo = dynamo;
    out.drive = dynamo ? clamp(q, 0, 1) : 0;
    out.remanence = remanence;
    out.curieKm = curieKm;
    out.layers = layersOf(T, p, crustKm, shellKm, oceanKm, innerFrac, R);
    out.bodies = bodiesOf(body, sys, tag, curieKm);
    CACHE.set(body, out);
    return out;
  }

  var Interior = {
    of: of, TYPE: TYPE, COMP: COMP, RARE_SHARE: RARE_SHARE, IRON_P: IRON_P,
    SHELL_MIN: SHELL_MIN, DYNAMO_AT: DYNAMO_AT, MOLTEN_FLUX: MOLTEN_FLUX
  };
  global.Interior = Interior;
  if (typeof module !== 'undefined' && module.exports) module.exports = Interior;
})(typeof window !== 'undefined' ? window : globalThis);
