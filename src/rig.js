/* rig.js — the people's skeleton and animation (2026-10-26).
 *
 * Astra: "let's do the quaternius models". The bodies are Quaternius'
 * Universal Base Characters on his Universal Animation Library (CC0; the
 * data is src/people-data.js, made by tools/glb2people.cjs). This file is
 * the runtime half: decode a body once, sample and blend clips, and write
 * one 4x4 per bone (23 of them) that carries a vertex from the bind pose to
 * this frame's pose in the figure's place in the room — the same contract
 * npcmodel.skin() had for the old boxes, so npcgl.js draws either.
 *
 *   Rig.body(name)                 the decoded body (typed arrays, skeleton), cached
 *   Rig.pose(body, layers, place, out)
 *       layers: [{ clip, t, w }] — clips blended by weight (nlerp per bone),
 *       place:  { x, y, z, yaw, lean, scale } — yaw turns the body to face
 *               (sin yaw, 0, cos yaw), walk.js's convention
 *   Rig.posed(body, mats, i)        a vertex under a pose (tests, 2D fallback)
 *   Rig.clipLength(name)
 *
 * Clips are local rotations, so they fit any body on the rig; the hips'
 * translation is scaled by how much taller this body's hips are than the
 * library's mannequin, so a short body doesn't float or sink.
 */
(function (global) {
  'use strict';

  function D() { return global.PeopleData || (typeof require === 'function' ? (function () { try { return require('./people-data.js'); } catch (e) { return null; } })() : null); }

  function unb64(s, T) {
    var bin;
    if (typeof Buffer !== 'undefined') { var b = Buffer.from(s, 'base64'); bin = new Uint8Array(b.buffer, b.byteOffset, b.byteLength).slice(); }
    else { var raw = atob(s); bin = new Uint8Array(raw.length); for (var i = 0; i < raw.length; i++) bin[i] = raw.charCodeAt(i); }
    return new T(bin.buffer, 0, bin.byteLength / T.BYTES_PER_ELEMENT);
  }

  /* ---- 4x4, column-major ------------------------------------------------- */
  function mul(a, b, o) {
    o = o || new Float32Array(16);
    for (var c = 0; c < 4; c++) {
      var b0 = b[c*4], b1 = b[c*4+1], b2 = b[c*4+2], b3 = b[c*4+3];
      o[c*4]   = a[0]*b0 + a[4]*b1 + a[8]*b2  + a[12]*b3;
      o[c*4+1] = a[1]*b0 + a[5]*b1 + a[9]*b2  + a[13]*b3;
      o[c*4+2] = a[2]*b0 + a[6]*b1 + a[10]*b2 + a[14]*b3;
      o[c*4+3] = a[3]*b0 + a[7]*b1 + a[11]*b2 + a[15]*b3;
    }
    return o;
  }
  function trs(t, q, s, o) {
    o = o || new Float32Array(16);
    var x = q[0], y = q[1], z = q[2], w = q[3], sx = s ? s[0] : 1, sy = s ? s[1] : 1, sz = s ? s[2] : 1;
    o[0] = (1-2*(y*y+z*z))*sx; o[1] = (2*(x*y+z*w))*sx; o[2] = (2*(x*z-y*w))*sx; o[3] = 0;
    o[4] = (2*(x*y-z*w))*sy; o[5] = (1-2*(x*x+z*z))*sy; o[6] = (2*(y*z+x*w))*sy; o[7] = 0;
    o[8] = (2*(x*z+y*w))*sz; o[9] = (2*(y*z-x*w))*sz; o[10] = (1-2*(x*x+y*y))*sz; o[11] = 0;
    o[12] = t[0]; o[13] = t[1]; o[14] = t[2]; o[15] = 1;
    return o;
  }
  function place4(p) {
    var c = Math.cos(p.yaw || 0), s = Math.sin(p.yaw || 0), k = p.scale || 1, l = p.lean || 0, cl = Math.cos(l), sl = Math.sin(l);
    /* T · Ry(yaw) · Rx(lean) · S */
    var ry = [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, p.x || 0, p.y || 0, p.z || 0, 1];
    var rx = [k, 0, 0, 0, 0, cl * k, sl * k, 0, 0, -sl * k, cl * k, 0, 0, 0, 0, 1];
    return mul(ry, rx);
  }

  /* ---- data ----------------------------------------------------------------- */
  var BODY = {}, CLIP = {};
  function body(name) {
    if (BODY[name]) return BODY[name];
    var PD = D(); if (!PD || !PD.bodies[name]) return null;
    var b = PD.bodies[name], n = PD.bones.length;
    var o = { kind: 'rig', name: name, verts: b.verts, tris: b.tris, mats: b.mats, parts: b.parts, lo: b.lo, hi: b.hi,
      pos: unb64(b.pos, Float32Array), nrm: unb64(b.nrm, Int8Array), j: unb64(b.j, Uint8Array), w: unb64(b.w, Uint8Array),
      m: unb64(b.m, Uint8Array), idx: unb64(b.idx, b.idx32 ? Uint32Array : Uint16Array),
      parent: b.skel.parent, rest: b.skel.rest, rt: b.skel.retarget || null, ibm: b.skel.ibm.map(function (a) { return new Float32Array(a); }),
      above: new Float32Array(b.skel.above), bones: n };
    o.count = o.idx.length;
    o.hipScale = PD.clipHip ? b.skel.rest[1].t[1] / PD.clipHip[1] : 1;
    o.height = b.hi[1] - b.lo[1];
    BODY[name] = o;
    return o;
  }
  function clip(name) {
    if (CLIP[name]) return CLIP[name];
    var PD = D(); if (!PD || !PD.clips[name]) return null;
    var c = PD.clips[name];
    return (CLIP[name] = { frames: c.frames, dur: c.dur, rot: unb64(c.rot, Int16Array), hip: unb64(c.hip, Float32Array), bones: PD.bones.length });
  }

  /* ---- posing ----------------------------------------------------------------- */
  var tmpQ = new Float32Array(4), tmpQ2 = new Float32Array(4), tmpL = new Float32Array(16);
  function qmulInto(a, b, o) {
    var x = a[3]*b[0] + a[0]*b[3] + a[1]*b[2] - a[2]*b[1], y = a[3]*b[1] - a[0]*b[2] + a[1]*b[3] + a[2]*b[0],
        z = a[3]*b[2] + a[0]*b[1] - a[1]*b[0] + a[2]*b[3], w = a[3]*b[3] - a[0]*b[0] - a[1]*b[1] - a[2]*b[2];
    o[0] = x; o[1] = y; o[2] = z; o[3] = w;
  }
  function pose(b, layers, p, out) {
    var n = b.bones;
    out = out || new Float32Array(16 * n);
    var W = pose._W && pose._W.length === n ? pose._W : (pose._W = []);
    for (var i = 0; i < n; i++) if (!W[i]) W[i] = new Float32Array(16);
    var place = mul(place4(p || {}), b.above);
    var q = [0, 0, 0, 0], hip = [0, 0, 0], tw = 0;
    var L = (layers || []).map(function (l) { return { c: clip(l.clip), t: l.t || 0, w: l.w == null ? 1 : l.w }; }).filter(function (l) { return l.c && l.w > 0; });
    for (var k = 0; k < L.length; k++) tw += L[k].w;
    for (i = 0; i < n; i++) {
      var r = b.rest[i], qx = 0, qy = 0, qz = 0, qw = 0, hx = 0, hy = 0, hz = 0;
      if (!L.length) { qx = r.r[0]; qy = r.r[1]; qz = r.r[2]; qw = r.r[3]; }
      for (k = 0; k < L.length; k++) {
        var c = L[k].c, f = (L[k].t * 30) % (c.frames - 1); if (f < 0) f += c.frames - 1;
        var f0 = Math.floor(f), u = f - f0, f1 = Math.min(c.frames - 1, f0 + 1), wgt = L[k].w / tw;
        var a0 = (f0 * n + i) * 4, a1 = (f1 * n + i) * 4;
        var x = c.rot[a0] * (1 - u) + c.rot[a1] * u, y = c.rot[a0+1] * (1 - u) + c.rot[a1+1] * u,
            z = c.rot[a0+2] * (1 - u) + c.rot[a1+2] * u, w = c.rot[a0+3] * (1 - u) + c.rot[a1+3] * u;
        if (k && x * qx + y * qy + z * qz + w * qw < 0) { x = -x; y = -y; z = -z; w = -w; }
        qx += x * wgt; qy += y * wgt; qz += z * wgt; qw += w * wgt;
        if (i === 1) {
          hx += (c.hip[f0*3] * (1 - u) + c.hip[f1*3] * u) * wgt; hy += (c.hip[f0*3+1] * (1 - u) + c.hip[f1*3+1] * u) * wgt; hz += (c.hip[f0*3+2] * (1 - u) + c.hip[f1*3+2] * u) * wgt;
        }
      }
      var ql = Math.hypot(qx, qy, qz, qw) || 1;
      tmpQ[0] = qx / ql; tmpQ[1] = qy / ql; tmpQ[2] = qz / ql; tmpQ[3] = qw / ql;
      /* A body with its own proportions takes the clip through its retarget
       * pair (glb2people.cjs): A · q · B. */
      if (b.rt && L.length) { qmulInto(b.rt[i].a, tmpQ, tmpQ2); qmulInto(tmpQ2, b.rt[i].b, tmpQ); }
      var t = r.t;
      if (i === 1 && L.length) t = [hx * b.hipScale, hy * b.hipScale, hz * b.hipScale];
      trs(t, tmpQ, r.s, tmpL);
      mul(b.parent[i] < 0 ? place : W[b.parent[i]], tmpL, W[i]);
      var S = mul(W[i], b.ibm[i], tmpL);
      for (var e = 0; e < 16; e++) out[i * 16 + e] = S[e];
    }
    return out;
  }

  /* A vertex under a pose: the weighted sum of its bones' matrices. */
  function posed(b, mats, v) {
    var x = b.pos[v*3], y = b.pos[v*3+1], z = b.pos[v*3+2], o = [0, 0, 0];
    for (var c = 0; c < 4; c++) {
      var w = b.w[v*4+c] / 255; if (!w) continue;
      var m = b.j[v*4+c] * 16;
      o[0] += w * (mats[m] * x + mats[m+4] * y + mats[m+8] * z + mats[m+12]);
      o[1] += w * (mats[m+1] * x + mats[m+5] * y + mats[m+9] * z + mats[m+13]);
      o[2] += w * (mats[m+2] * x + mats[m+6] * y + mats[m+10] * z + mats[m+14]);
    }
    return o;
  }

  var Rig = {
    body: body, clip: clip, pose: pose, posed: posed,
    clipLength: function (name) { var c = clip(name); return c ? c.dur : 0; },
    clips: function () { var PD = D(); return PD ? Object.keys(PD.clips) : []; },
    bodies: function () { var PD = D(); return PD ? Object.keys(PD.bodies) : []; },
    bones: function () { var PD = D(); return PD ? PD.bones.slice() : []; }
  };
  global.Rig = Rig;
  if (typeof module !== 'undefined' && module.exports) module.exports = Rig;
})(typeof window !== 'undefined' ? window : globalThis);
