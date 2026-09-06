/* vec3.js — 3D vector math.
 *
 * UNITS, fixed once here and obeyed everywhere:
 *   distance  kilometres (km)
 *   mass      kilograms (kg)
 *   time      seconds (s)
 *   G         6.67430e-20 km^3 kg^-1 s^-2
 * Doubles carry ~15-16 significant digits, so at 1e9 km (about 6.7 AU) we
 * still resolve well under a millimetre. No need for fancy coordinate tricks.
 *
 * World axes: X/Y span the ecliptic plane, +Z is system north. Orbital
 * inclination therefore tilts a body out of the XY plane, which is exactly
 * what we want to see in a 3D view.
 */
(function (global) {
  'use strict';

  var V = {
    G: 6.67430e-20,

    make: function (x, y, z) { return { x: x || 0, y: y || 0, z: z || 0 }; },
    clone: function (a) { return { x: a.x, y: a.y, z: a.z }; },
    add: function (a, b) { return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }; },
    sub: function (a, b) { return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }; },
    scale: function (a, s) { return { x: a.x * s, y: a.y * s, z: a.z * s }; },
    dot: function (a, b) { return a.x * b.x + a.y * b.y + a.z * b.z; },
    cross: function (a, b) {
      return {
        x: a.y * b.z - a.z * b.y,
        y: a.z * b.x - a.x * b.z,
        z: a.x * b.y - a.y * b.x
      };
    },
    len: function (a) { return Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z); },
    len2: function (a) { return a.x * a.x + a.y * a.y + a.z * a.z; },
    dist: function (a, b) {
      var dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
      return Math.sqrt(dx * dx + dy * dy + dz * dz);
    },
    norm: function (a) {
      var l = V.len(a);
      return l > 0 ? { x: a.x / l, y: a.y / l, z: a.z / l } : { x: 0, y: 0, z: 0 };
    },
    // a + b*s, the workhorse of every integrator step.
    addScaled: function (a, b, s) {
      return { x: a.x + b.x * s, y: a.y + b.y * s, z: a.z + b.z * s };
    },
    zero: function () { return { x: 0, y: 0, z: 0 }; },

    /* Rodrigues' rotation formula: rotate v by angle radians about a UNIT
     * axis. Used for integrating ship attitude — small per-frame rotations
     * applied to a basis, cheaper and more transparent than a quaternion
     * library for the handful of rotations a frame needs. */
    rotateAroundAxis: function (v, axis, angle) {
      var c = Math.cos(angle), s = Math.sin(angle);
      var cross = V.cross(axis, v);
      var dot = V.dot(axis, v);
      return {
        x: v.x * c + cross.x * s + axis.x * dot * (1 - c),
        y: v.y * c + cross.y * s + axis.y * dot * (1 - c),
        z: v.z * c + cross.z * s + axis.z * dot * (1 - c)
      };
    }
  };

  global.V = V;
  if (typeof module !== 'undefined' && module.exports) module.exports = V;
})(typeof window !== 'undefined' ? window : globalThis);
