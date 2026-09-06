/* rng.js — deterministic seeded randomness.
 *
 * The whole universe is a pure function of one seed. That only holds if every
 * consumer draws from its OWN named substream: if planets and moons shared a
 * single sequence, adding one extra moon roll tomorrow would shift every
 * number after it and silently rewrite every system in the game. fork(label)
 * gives each consumer an independent stream derived from (seed, label), so we
 * can add new generators later without disturbing anything already generated.
 */
(function (global) {
  'use strict';

  // FNV-1a, 32-bit. Cheap, well-mixed, and identical across JS engines.
  function hashString(str) {
    var h = 2166136261 >>> 0;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
  }

  // mulberry32: 32-bit state, passes gjrand, ~2^32 period. Plenty for worldgen.
  function mulberry32(a) {
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function RNG(seed) {
    this.seed = (typeof seed === 'string') ? hashString(seed) : (seed >>> 0);
    this._next = mulberry32(this.seed);
    this._spare = null;
  }

  RNG.prototype.next = function () { return this._next(); };

  RNG.prototype.range = function (lo, hi) { return lo + (hi - lo) * this._next(); };

  RNG.prototype.int = function (lo, hi) { // inclusive both ends
    return lo + Math.floor(this._next() * (hi - lo + 1));
  };

  RNG.prototype.pick = function (arr) { return arr[this.int(0, arr.length - 1)]; };

  RNG.prototype.chance = function (p) { return this._next() < p; };

  // Box-Muller, caching the second deviate.
  RNG.prototype.gauss = function (mean, sd) {
    if (this._spare !== null) {
      var s = this._spare; this._spare = null;
      return mean + sd * s;
    }
    var u, v, r;
    do {
      u = this._next() * 2 - 1;
      v = this._next() * 2 - 1;
      r = u * u + v * v;
    } while (r === 0 || r >= 1);
    var f = Math.sqrt(-2 * Math.log(r) / r);
    this._spare = v * f;
    return mean + sd * u * f;
  };

  // Log-uniform: useful for masses and radii, which span orders of magnitude.
  RNG.prototype.logRange = function (lo, hi) {
    return Math.exp(this.range(Math.log(lo), Math.log(hi)));
  };

  RNG.prototype.angle = function () { return this._next() * Math.PI * 2; };

  // Independent named substream. Deterministic in (this.seed, label) only —
  // NOT in how many numbers this generator has already produced.
  RNG.prototype.fork = function (label) {
    return new RNG(hashString(label + '|' + this.seed));
  };

  RNG.hashString = hashString;

  global.RNG = RNG;
  if (typeof module !== 'undefined' && module.exports) module.exports = RNG;
})(typeof window !== 'undefined' ? window : globalThis);
