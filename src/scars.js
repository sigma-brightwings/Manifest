/* scars.js - what weapon fire leaves on a hull (2026-11-20).
 *
 * Astra: "heated metal from weapon fire striking a station or ship, as well
 * as damage decals which show a glowing, arcing interior, or which show gas
 * venting from the ship's interior."
 *
 * Until now a hit that came through the shield was a half-second bloom and
 * then nothing: a pirate at nine hull points looked exactly like one at
 * ninety. This keeps the damage ON the hull, where it happened.
 *
 *   HOT METAL. Every hull hit leaves a spot in the hull's own frame that
 *   holds heat and cools exponentially (HEAT_TAU). Hits close to an
 *   existing spot (MERGE_COS) heat that spot rather than starting a new
 *   one, so a beam held on one place cooks it white while a spray of
 *   pulses leaves a dozen dull-red freckles. The colour is the drawing's
 *   business (heatRGB): white, yellow, orange, cherry, gone.
 *
 *   BREACHES. The damage a spot has taken, as a share of the hull, is its
 *   DOSE. Past BREACH_DOSE the plating is open, and what is behind it shows:
 *     - 'arc'  the interior glows and the wiring arcs across the hole,
 *              fiercely at first and in fits later (arcAt);
 *     - 'vent' atmosphere streams out of it until the compartment is empty
 *              (VENT_LIFE), and then it is a dark hole with a hot lip.
 *   Which one is a hash of the target and the spot, so the same fight
 *   leaves the same wounds.
 *
 * SIM TIME, NOT WALL TIME. The flash and the shield flare are lights and
 * run on the wall clock (Combat.markImpact). These are the state of a
 * hull: a vent that is still venting after a warp has had its air run out
 * in game time, and a hot spot cools while the world moves, not while the
 * screen does.
 *
 * WHERE. A ship's scar is a DIRECTION in her own axes (right, up, fwd);
 * the renderer puts it on her hull at draw time, because only the renderer
 * knows the hull's shape. A station's is a POINT and a normal in its own
 * frame, found by the shot itself against the station's mesh
 * (main.js portHitTest), because a wheel is mostly empty space and a
 * scorch mark floating between the spokes would be a lie.
 *
 * Not saved. A hull at full strength has no scars (cleared on repair),
 * and a reload is a fresh look at a ship that has been patched or not. */
(function (global) {
  'use strict';

  var HEAT_TAU = 22;          // s of sim time for a spot to lose 63% of its heat
  var HEAT_PER_SHARE = 9;     // heat per share of the hull a hit took (0.1 of the hull -> 0.9)
  var HEAT_MAX = 1.6;         // white-hot; more is not whiter
  var MERGE_COS = 0.94;       // about 20 degrees: the same spot
  var BREACH_DOSE = 0.14;     // of the hull, into one spot, to open it
  var VENT_LIFE = 150;        // s for a breached compartment to empty
  var ARC_FADE = 480;         // s for the arcing to settle into fits
  var MAX_SCARS = 10;

  function hash01(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); h ^= h >>> 15;
    return (h >>> 0) / 4294967296;
  }
  function dot(a, b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
  function norm(a) {
    var l = Math.sqrt(dot(a, a));
    return l > 1e-12 ? { x: a.x / l, y: a.y / l, z: a.z / l } : null;
  }

  /* World direction into a frame's own axes ({x: right, y: up, z: fwd}). */
  function toLocal(frame, d) {
    return { x: dot(d, frame.right), y: dot(d, frame.up), z: dot(d, frame.fwd) };
  }

  /* A spot's heat at t: what it was given, cooling since. */
  function heatAt(sc, t) {
    var dt = Math.max(0, t - sc.ht);
    return Math.min(HEAT_MAX, sc.heat * Math.exp(-dt / HEAT_TAU));
  }
  /* How hard a vent is blowing at t: 1 when it opens, 0 when it is empty. */
  function ventAt(sc, t) {
    if (sc.kind !== 'vent') return 0;
    var u = (t - sc.openAt) / VENT_LIFE;
    return u < 0 ? 0 : u >= 1 ? 0 : (1 - u) * (1 - u * 0.5);
  }
  /* How alive the wiring is at t: fierce at first, then in fits. */
  function arcAt(sc, t) {
    if (sc.kind !== 'arc') return 0;
    var u = Math.max(0, t - sc.openAt) / ARC_FADE;
    return 0.25 + 0.75 * Math.exp(-u * 2);
  }

  /* A hit came through. `target` carries the list; `frame` is its axes
   * (a ship's live frame) and `dir` the world direction from its centre
   * to where the shot came from (Combat.markImpact's), or `opts.p` / `opts.n`
   * a local point and normal (a station, measured by the shot). `share` is
   * the hit's share of the hull, 0..1. `key` names the target for the
   * hash. Returns the scar, or null. */
  function add(target, frame, dir, share, t, key, opts) {
    if (!target || !(share > 0) || !isFinite(t)) return null;
    opts = opts || {};
    var n = null, p = null;
    if (opts.n) { n = norm(opts.n); p = opts.p || null; }
    else if (dir && frame && frame.fwd) n = norm(toLocal(frame, dir));
    if (!n) n = { x: 0, y: 1, z: 0 };
    var list = target.scars || (target.scars = []);
    var best = null, bc = MERGE_COS;
    for (var i = 0; i < list.length; i++) {
      var c = dot(list[i].n, n);
      if (c > bc) { bc = c; best = list[i]; }
    }
    if (!best) {
      best = { n: n, p: p, heat: 0, ht: t, dose: 0, kind: null, openAt: null,
               seq: (target.scarSeq = (target.scarSeq || 0) + 1) };
      list.push(best);
      /* The oldest COLD, closed spot goes first; a breach outlives freckles. */
      while (list.length > MAX_SCARS) {
        var drop = 0, worst = Infinity;
        for (var k = 0; k < list.length; k++) {
          var w = (list[k].kind ? 10 : 0) + heatAt(list[k], t);
          if (w < worst) { worst = w; drop = k; }
        }
        list.splice(drop, 1);
      }
    }
    best.heat = Math.min(HEAT_MAX * 1.5, heatAt(best, t) + share * HEAT_PER_SHARE);
    best.ht = t;
    best.dose += share;
    if (!best.kind && best.dose >= BREACH_DOSE) {
      best.kind = hash01((key || '') + '|' + best.seq) < 0.5 ? 'arc' : 'vent';
      best.openAt = t;
    }
    return best;
  }

  /* Patched: a hull back at full strength carries no scars. */
  function clear(target) { if (target) { target.scars = []; } }
  function reconcile(target, hullHp, hullMax) {
    if (target && target.scars && target.scars.length && hullMax > 0 && hullHp >= hullMax - 1e-6) clear(target);
  }

  /* The colour metal glows at a heat, 0..HEAT_MAX: dull cherry, orange,
   * yellow, then white. [r, g, b, alpha]. Blackbody in spirit. */
  function heatRGB(h) {
    var u = Math.max(0, Math.min(1, h / HEAT_MAX));
    var r = 255;
    var g = Math.round(40 + 215 * Math.pow(u, 0.9));
    var b = Math.round(20 + 220 * Math.pow(Math.max(0, u - 0.55) / 0.45, 1.5) * (u > 0.55 ? 1 : 0));
    if (u < 0.18) { r = Math.round(120 + 135 * u / 0.18); }
    return [r, g, b, Math.min(1, 0.15 + 1.1 * u)];
  }

  /* The live ones, for a frame: anything still warm, or open. */
  function visible(target, t) {
    var out = [], list = target && target.scars;
    if (!list) return out;
    for (var i = 0; i < list.length; i++) {
      var sc = list[i];
      if (sc.kind || heatAt(sc, t) > 0.02) out.push(sc);
    }
    return out;
  }

  var Scars = {
    HEAT_TAU: HEAT_TAU, HEAT_PER_SHARE: HEAT_PER_SHARE, HEAT_MAX: HEAT_MAX, MERGE_COS: MERGE_COS,
    BREACH_DOSE: BREACH_DOSE, VENT_LIFE: VENT_LIFE, ARC_FADE: ARC_FADE, MAX_SCARS: MAX_SCARS,
    add: add, heatAt: heatAt, ventAt: ventAt, arcAt: arcAt, clear: clear, reconcile: reconcile,
    heatRGB: heatRGB, visible: visible, toLocal: toLocal, hash01: hash01
  };
  global.Scars = Scars;
  if (typeof module !== 'undefined' && module.exports) module.exports = Scars;
})(typeof window !== 'undefined' ? window : globalThis);
