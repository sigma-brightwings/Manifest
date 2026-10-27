/* people.js — a crewman as a Quaternius body in our suit (2026-10-26).
 *
 * Astra: "let's do the quaternius models". The figure under everything is
 * now one of Quaternius' Universal Base Characters (CC0, src/people-data.js),
 * moved by his animation library (rig.js). What made each role read across a
 * room — the helmet, the pack, the vest and its stencilling, the harness,
 * the frame, the rifle, the kit on the face — is all still built by
 * npcmodel.js, exactly as before, and moved across:
 *
 *   THE SUIT'S PAINT. The old body's skin atlas (torso, pelvis, sleeves,
 *   legs, boots, gloves, each role's markings) is wrapped round the new body
 *   the way it was wrapped round the old boxes: every vertex of the new body
 *   gets the texture coordinate the old part in the same place had — around
 *   the torso and up it, around each limb and along it. The UVs depend only
 *   on the body, so they are worked out once per body and shared; each
 *   person brings their own painted atlas.
 *
 *   THE KIT. Every mesh npcmodel made after the bare figure is lifted off
 *   its old bone and set on the matching bone of the new skeleton: what was
 *   on the head is fitted to this head's size, what was on the torso to the
 *   torso's width at that height, what was on an arm is swung from hanging
 *   to the T-pose the new body is bound in, and leg kit follows its joint.
 *
 *   People.build(key, name, liv, gear) → { kind:'rig', body, kit, canvas, old, scale }
 *   People.layers(person, t)           → clip layers for Rig.pose
 */
(function (global) {
  'use strict';
  function NM() { return global.NpcModel || (typeof require === 'function' ? require('./npcmodel.js') : null); }
  function RG() { return global.Rig || (typeof require === 'function' ? require('./rig.js') : null); }

  var BI = {};   // rig bone name -> index
  function bi(n) { if (!BI.ready) { RG().bones().forEach(function (b, i) { BI[b] = i; }); BI.ready = true; } return BI[n]; }

  /* ---- small matrix kit ------------------------------------------------------ */
  function inv4(m) {
    var a = m, o = new Float32Array(16);
    var b00 = a[0]*a[5]-a[1]*a[4], b01 = a[0]*a[6]-a[2]*a[4], b02 = a[0]*a[7]-a[3]*a[4], b03 = a[1]*a[6]-a[2]*a[5],
        b04 = a[1]*a[7]-a[3]*a[5], b05 = a[2]*a[7]-a[3]*a[6], b06 = a[8]*a[13]-a[9]*a[12], b07 = a[8]*a[14]-a[10]*a[12],
        b08 = a[8]*a[15]-a[11]*a[12], b09 = a[9]*a[14]-a[10]*a[13], b10 = a[9]*a[15]-a[11]*a[13], b11 = a[10]*a[15]-a[11]*a[14];
    var d = b00*b11 - b01*b10 + b02*b09 + b03*b08 - b04*b07 + b05*b06; d = 1 / d;
    o[0] = (a[5]*b11 - a[6]*b10 + a[7]*b09)*d; o[1] = (a[2]*b10 - a[1]*b11 - a[3]*b09)*d; o[2] = (a[13]*b05 - a[14]*b04 + a[15]*b03)*d; o[3] = (a[10]*b04 - a[9]*b05 - a[11]*b03)*d;
    o[4] = (a[6]*b08 - a[4]*b11 - a[7]*b07)*d; o[5] = (a[0]*b11 - a[2]*b08 + a[3]*b07)*d; o[6] = (a[14]*b02 - a[12]*b05 - a[15]*b01)*d; o[7] = (a[8]*b05 - a[10]*b02 + a[11]*b01)*d;
    o[8] = (a[4]*b10 - a[5]*b08 + a[7]*b06)*d; o[9] = (a[1]*b08 - a[0]*b10 - a[3]*b06)*d; o[10] = (a[12]*b04 - a[13]*b02 + a[15]*b00)*d; o[11] = (a[9]*b02 - a[8]*b04 - a[11]*b00)*d;
    o[12] = (a[5]*b07 - a[4]*b09 - a[6]*b06)*d; o[13] = (a[0]*b09 - a[1]*b07 + a[2]*b06)*d; o[14] = (a[13]*b01 - a[12]*b03 - a[14]*b00)*d; o[15] = (a[8]*b03 - a[9]*b01 + a[10]*b00)*d;
    return o;
  }
  function apply(m, x, y, z) { return [m[0]*x + m[4]*y + m[8]*z + m[12], m[1]*x + m[5]*y + m[9]*z + m[13], m[2]*x + m[6]*y + m[10]*z + m[14]]; }

  /* ---- a body, measured once ------------------------------------------------------
   * Where each bone sits in the bind pose, how big the head is, how wide and
   * deep the torso and hips are at each height, and the atlas coordinates
   * of every vertex. */
  var FIT = {};
  /* BUILD VARIETY (2026-10-26). Astra: "We should make sure that the female
   * characters are well represented in race and bust size, as it is
   * important." A woman's body comes in one of BUSTS sizes, seeded by who she
   * is: the shape is changed in the bind pose before anything is measured,
   * so a vest or a harness is fitted to her, not to the stock body. Skin tone
   * is the portrait's (npcmodel SKIN, seven tones, even odds, independent
   * of the body). */
  var BUSTS = [0.45, 0.65, 0.85, 1.0, 1.15];
  function shapeBust(b, P, k) {
    if (k === 1) return P;
    var Q = new Float32Array(P), V = b.verts;
    /* The two fronts of the chest and the wall under them, measured off the
     * body itself. */
    var c = [0, 0, -9], wall = -9;
    for (var v = 0; v < V; v++) { var x = P[v*3], y = P[v*3+1], z = P[v*3+2]; if (x > 0.02 && y > 1.2 && y < 1.5 && z > c[2]) c = [x, y, z]; }
    for (v = 0; v < V; v++) { var x2 = P[v*3], y2 = P[v*3+1]; if (Math.abs(x2 - c[0]) < 0.025 && y2 > c[1] - 0.13 && y2 < c[1] - 0.09) wall = Math.max(wall, P[v*3+2]); }
    if (wall < -1) wall = c[2] - 0.06;
    var R0 = 0.105;
    for (v = 0; v < V; v++) {
      var px = P[v*3], py = P[v*3+1], pz = P[v*3+2];
      if (pz < wall - 0.01) continue;
      var cx = px < 0 ? -c[0] : c[0], r = Math.hypot(px - cx, (py - c[1]) * 1.1);
      if (r >= R0) continue;
      var t = 1 - r / R0, w = t * t * (3 - 2 * t);
      Q[v*3+2] = wall + (pz - wall) * (1 + (k - 1) * w);
      Q[v*3] = cx + (px - cx) * (1 + (k - 1) * 0.3 * w);
      Q[v*3+1] = c[1] + (py - c[1]) * (1 + (k - 1) * 0.25 * w) - (k - 1) * 0.012 * w;
    }
    return Q;
  }
  function fit(name, bust) {
    bust = /female/i.test(name) && bust != null ? bust : 1;
    var key = name + '|' + bust;
    if (FIT[key]) return FIT[key];
    var R = RG(), b = R.body(name); if (!b) return null;
    var names = R.bones(), J = {};
    names.forEach(function (n, i) { var w = inv4(b.ibm[i]); J[n] = [w[12], w[13], w[14]]; });
    var V = b.verts, P = shapeBust(b, b.pos, bust), dom = function (v) { return names[b.j[v * 4]]; };
    /* The head: its centre and half-sizes, from the vertices it carries. */
    var lo = [9, 9, 9], hi = [-9, -9, -9];
    for (var v = 0; v < V; v++) if (dom(v) === 'head') for (var c = 0; c < 3; c++) { lo[c] = Math.min(lo[c], P[v*3+c]); hi[c] = Math.max(hi[c], P[v*3+c]); }
    var head = { c: [(lo[0]+hi[0])/2, (lo[1]+hi[1])/2, (lo[2]+hi[2])/2], r: [(hi[0]-lo[0])/2, (hi[1]-lo[1])/2, (hi[2]-lo[2])/2] };
    /* The trunk, in 2 cm bands: half-width, half-depth and the depth's centre. */
    var TRUNK = { hips: 1, 'spine.001': 1, 'spine.002': 1, 'spine.003': 1, 'shoulder.L': 1, 'shoulder.R': 1, neck: 1 };
    var bands = {};
    for (v = 0; v < V; v++) {
      if (!TRUNK[dom(v)]) continue;
      var x = P[v*3], y = P[v*3+1], z = P[v*3+2], k = Math.round(y / 0.02);
      if (Math.abs(x) > 0.3) continue;
      var bd = bands[k] || (bands[k] = { x: 0, z0: 9, z1: -9 });
      bd.x = Math.max(bd.x, Math.abs(x)); bd.z0 = Math.min(bd.z0, z); bd.z1 = Math.max(bd.z1, z);
    }
    function trunkAt(y) {
      var k = Math.round(y / 0.02);
      for (var d = 0; d < 12; d++) { var bd = bands[k + d] || bands[k - d]; if (bd) return { hw: Math.max(0.05, bd.x), hd: Math.max(0.04, (bd.z1 - bd.z0) / 2), zc: (bd.z1 + bd.z0) / 2 }; }
      return { hw: 0.17, hd: 0.11, zc: 0 };
    }
    /* The foot, heel to toe, so the old boots can be stretched to fit. */
    var foot = { heel: 9, tip: -9, top: 0 };
    for (v = 0; v < V; v++) { var dn = dom(v); if (dn !== 'foot.L' && dn !== 'toe.L') continue; foot.heel = Math.min(foot.heel, P[v*3+2]); foot.tip = Math.max(foot.tip, P[v*3+2]); }
    var f = { name: name, bust: bust, pos: P, body: b, J: J, head: head, trunkAt: trunkAt, foot: foot,
              torso: { y0: Math.max(J['spine.001'][1] - 0.04, 0.95), y1: J.neck[1] } };
    f.uv = atlasUV(f);
    /* Everyone wears a sealed helmet, so the head under it is drawn a size
     * smaller about its own centre: a nose or a chin never pokes through a
     * flat-fronted slab helmet. The helmet is still fitted to the head's
     * real size (above). */
    var HB = names.indexOf('head'), hc = head.c;
    for (var hv = 0; hv < f.uv.verts; hv++) if (f.uv.j[hv * 4] === HB) for (var hcI = 0; hcI < 3; hcI++)
      f.uv.pos[hv * 3 + hcI] = hc[hcI] + (f.uv.pos[hv * 3 + hcI] - hc[hcI]) * 0.82;
    FIT[key] = f;
    return f;
  }

  /* ---- the paint: atlas coordinates for every vertex ---------------------------------
   * Mirrors how npcmodel.js laid its parts' UVs: a cylinder's u runs round
   * from the back (θ0 = π + π/n) with x = r·sin θ, z = r·cos θ, and v from 0
   * at the bottom to 1 at the top; the torso is a lathe with v by profile
   * point. mapUV then insets each into its rectangle of the 512 atlas. */
  function atlasUV(f) {
    var M = NM(), REG = M.REG, S = M.ATLAS, TORSO = M.TORSO, b = f.body, R = RG(), names = R.bones();
    var V = b.verts, P = f.pos, out = new Float32Array(V * 2), regOf = new Array(V), uOf = new Float32Array(V);
    function rect(reg, u, v) { var r = REG[reg], i0 = 0.75; return [(r[0] + i0 + u * (r[2] - 2 * i0)) / S, 1 - (r[1] + i0 + (1 - v) * (r[3] - 2 * i0)) / S]; }
    function cylU(x, z, n) { var t0 = Math.PI + Math.PI / n, a = Math.atan2(x, z) - t0; a = a / (2 * Math.PI); return a - Math.floor(a); }
    var PY = TORSO.map(function (p) { return p[1]; });
    function torsoV(y) {   // old torso spanned 1.0..1.475 by profile point; map the new torso onto it
      var yo = (y - f.torso.y0) / (f.torso.y1 - f.torso.y0) * (PY[PY.length - 1] - PY[0]) + PY[0];
      if (yo <= PY[0]) return 0; if (yo >= PY[PY.length - 1]) return 1;
      for (var i = 0; i < PY.length - 1; i++) if (yo <= PY[i + 1]) return (i + (yo - PY[i]) / (PY[i + 1] - PY[i])) / (PY.length - 1);
      return 1;
    }
    var J = f.J;
    for (var v = 0; v < V; v++) {
      var x = P[v*3], y = P[v*3+1], z = P[v*3+2], d = names[b.j[v*4]], side = x < 0 ? 'L' : 'R', sd = x < 0 ? -1 : 1, rs = x < 0 ? 'R' : 'L';
      var reg, u = 0.5, vv = 0.5;
      if (d === 'head' || d === 'neck') { reg = 'head'; u = 0.5; vv = 0.3; }
      else if (d === 'hand.L' || d === 'hand.R') { reg = 'hand' + side; }
      else if (d.indexOf('foot') === 0 || d.indexOf('toe') === 0 || (d.indexOf('shin') === 0 && y < 0.17)) { reg = 'boot' + side; u = 0.5; vv = 0.6; }
      else if (d.indexOf('thigh') === 0 || d.indexOf('shin') === 0) {
        var jt = J['thigh.' + rs], js = J['shin.' + rs], jf = J['foot.' + rs], isThigh = d.indexOf('thigh') === 0;
        reg = (isThigh ? 'thigh' : 'shin') + side;
        u = cylU(x - jt[0], z - jt[2], 6);
        vv = isThigh ? (y - js[1]) / (jt[1] - js[1]) : (y - jf[1]) / (js[1] - jf[1]);
      } else if (d.indexOf('upper_arm') === 0 || d.indexOf('forearm') === 0) {
        var up = d.indexOf('upper') === 0, j0 = J[(up ? 'upper_arm.' : 'forearm.') + rs], j1 = J[(up ? 'forearm.' : 'hand.') + rs];
        reg = (up ? 'up' : 'fo') + side;
        /* The old arm hung down; this one is held out. Round the arm, the
         * old x is this body's y (towards the hanging side), z is z. */
        u = cylU(sd * (y - j0[1]), z - j0[2], 6);
        vv = 1 - Math.max(0, Math.min(1, Math.abs(x - j0[0]) / Math.abs(j1[0] - j0[0])));
      } else if (y < f.torso.y0) {
        var tp = f.trunkAt(y);
        reg = 'pelvis'; u = cylU(x / tp.hw, (z - tp.zc) / tp.hd, 8);
        vv = Math.max(0, Math.min(1, (y - (f.torso.y0 - 0.14)) / 0.14));
      } else {
        var tt = f.trunkAt(Math.min(y, f.torso.y1));
        reg = 'torso'; u = cylU(x / tt.hw, (z - tt.zc) / tt.hd, 8); vv = torsoV(y);
      }
      regOf[v] = reg; uOf[v] = u;
      var r2 = rect(reg, Math.max(0, Math.min(1, u)), Math.max(0, Math.min(1, vv)));
      out[v*2] = r2[0]; out[v*2+1] = r2[1];
    }
    /* Where a triangle straddles the seam at the back of a part, its far
     * corner gets a copy with u pulled to the near edge, so the texture
     * doesn't smear the whole part across one thin triangle. */
    var idx = b.idx, extra = [], nidx = new (b.idx.constructor)(idx.length), copies = {};
    var nextV = V;
    for (var t = 0; t < idx.length; t += 3) {
      var a = idx[t], c = idx[t+1], e = idx[t+2];
      nidx[t] = a; nidx[t+1] = c; nidx[t+2] = e;
      if (regOf[a] !== regOf[c] || regOf[a] !== regOf[e]) continue;
      var us = [uOf[a], uOf[c], uOf[e]];
      if (Math.max.apply(null, us) - Math.min.apply(null, us) < 0.5) continue;
      for (var q = 0; q < 3; q++) {
        var vi = idx[t+q];
        if (uOf[vi] >= 0.5) continue;
        var key = vi;
        if (copies[key] == null) { copies[key] = nextV++; extra.push(vi); }
        nidx[t+q] = copies[key];
      }
    }
    var NV = nextV, uv = new Float32Array(NV * 2); uv.set(out);
    var M2 = { pos: new Float32Array(NV * 3), nrm: new Int8Array(NV * 3), j: new Uint8Array(NV * 4), w: new Uint8Array(NV * 4) };
    M2.pos.set(f.pos); M2.nrm.set(b.nrm); M2.j.set(b.j); M2.w.set(b.w);
    extra.forEach(function (src, k) {
      var dst = V + k;
      for (var c2 = 0; c2 < 3; c2++) { M2.pos[dst*3+c2] = f.pos[src*3+c2]; M2.nrm[dst*3+c2] = b.nrm[src*3+c2]; }
      for (c2 = 0; c2 < 4; c2++) { M2.j[dst*4+c2] = b.j[src*4+c2]; M2.w[dst*4+c2] = b.w[src*4+c2]; }
      var r3 = rect(regOf[src], 0.999, 0.5), yv = uv[src*2+1];
      uv[dst*2] = r3[0]; uv[dst*2+1] = yv;
    });
    return { uv: uv, pos: M2.pos, nrm: M2.nrm, j: M2.j, w: M2.w, idx: NV > 65535 && !(nidx instanceof Uint32Array) ? Uint32Array.from(nidx) : nidx, verts: NV };
  }

  /* ---- the kit, lifted across ----------------------------------------------------------- */
  var OLD_HEAD = { c: [0, 1.61, 0], r: [0.098, 0.119, 0.104] };
  function liftKit(old, f) {
    var K = old.kit, n = K.count, OB = old.bones, J = f.J, out = { pos: new Float32Array(n * 3), uv: K.uv, emis: K.emis, j: new Uint8Array(n), count: n };
    var TORSO = NM().TORSO, B = old.bulk || 1;
    function oldR(y) {     // the old torso's radius at a height (lathe, around 1.23)
      var yy = y - 1.23, T = TORSO;
      if (yy <= T[0][1]) return T[0][0] * B; if (yy >= T[T.length - 1][1]) return T[T.length - 1][0] * B;
      for (var i = 0; i < T.length - 1; i++) if (yy <= T[i + 1][1]) return (T[i][0] + (T[i + 1][0] - T[i][0]) * (yy - T[i][1]) / (T[i + 1][1] - T[i][1])) * B;
      return 0.15 * B;
    }
    /* Inside the old surface a point scales with the new trunk; outside it
     * (a pauldron, a pack) it keeps its distance from the surface, so kit
     * doesn't stretch with a broader chest. */
    function across(c, rOld, rNew) { var a = Math.abs(c); return a <= rOld ? c * rNew / rOld : Math.sign(c) * (rNew + (a - rOld)); }
    var hk = Math.max(f.head.r[0] / OLD_HEAD.r[0], f.head.r[2] / OLD_HEAD.r[2], f.head.r[1] / OLD_HEAD.r[1]);
    var inv = OB.restW.map(inv4), s0 = (old.look ? old.look.h : 1) * (old.key === 'heavy' ? 1.06 : 1);
    /* Across the shoulders the old torso narrowed to its neck and the arms'
     * shoulder balls stood out at 0.25 m: that is the width kit sat against. */
    function oldW(y) { return y > 1.36 ? Math.max(oldR(y), 0.25 * B + 0.02) : oldR(y); }
    /* Which band a piece of root kit belongs to is decided once for the
     * whole piece, by its middle — a pauldron that reaches up past the
     * collar stays one pauldron. (Straps, part < 0, go vertex by vertex: they
     * stretch between bones anyway.) */
    var mid = {};
    for (var v0 = 0; v0 < n; v0++) { var pt = K.part[v0]; if (pt <= 0) continue; var mm = mid[pt] || (mid[pt] = [0, 0]); mm[0] += K.pos[v0*3+1]; mm[1]++; }
    for (var v = 0; v < n; v++) {
      /* The old figure was scaled by its own height (and a heavy by a
       * little more); the kit is taken back to the standard figure first —
       * the new body gets the person's height from its own scale. */
      var x = K.pos[v*3] / s0, y = K.pos[v*3+1] / s0, z = K.pos[v*3+2] / s0, ob = OB.names[K.bone[v]], p, nb;
      var band = K.part[v] > 0 ? mid[K.part[v]][0] / mid[K.part[v]][1] / s0 : y;
      if (ob === 'root') {
        if (band >= 1.47) {               // the head: helmets, visors, the kit on the face, the seal ring
          p = [f.head.c[0] + (x - OLD_HEAD.c[0]) * hk, f.head.c[1] + (y - OLD_HEAD.c[1]) * hk, f.head.c[2] + (z - OLD_HEAD.c[2]) * hk];
          nb = band < 1.53 ? 'neck' : 'head';
          if (band < 1.53) p[1] = J.neck[1] + (y - 1.5) * hk + 0.01;
        } else if (band >= 1.0) {         // the chest and back: vests, packs, plates, collars
          var yn = f.torso.y0 + (y - 1.0) / 0.475 * (f.torso.y1 - f.torso.y0), ta = f.trunkAt(yn), r = oldR(y);
          p = [across(x, oldW(y), ta.hw), yn, ta.zc + across(z, r * 0.62, ta.hd)];
          nb = yn > J['spine.003'][1] ? 'spine.003' : yn > J['spine.002'][1] ? 'spine.002' : 'spine.001';
        } else {                        // the hips: belts, holsters, coat skirts
          var yh = y + (f.torso.y0 - 1.0), th = f.trunkAt(Math.max(yh, J.hips[1] - 0.05)), r0 = 0.17 * B;
          p = [across(x, r0, th.hw), yh, th.zc + across(z, r0 * 0.7, th.hd)];
          nb = 'hips';
        }
      } else {
        var bIx = K.bone[v], loc = apply(inv[bIx], x, y, z), wx = OB.restW[bIx][12], sd = wx < 0 ? -1 : 1, rs = sd < 0 ? 'R' : 'L';
        var kind = ob.replace(/[LR]$/, '');
        if (kind === 'sh' || kind === 'elbow') {
          /* Swing the hanging arm out to the T-pose: (0,-1,0) → (sd,0,0). */
          var jn = J[(kind === 'sh' ? 'upper_arm.' : 'forearm.') + rs];
          p = [jn[0] - sd * loc[1], jn[1] + sd * loc[0], jn[2] + loc[2]];
          nb = (kind === 'sh' ? 'upper_arm.' : 'forearm.') + rs;
        } else {
          var map = { hip: 'thigh.', knee: 'shin.', ankle: 'foot.' }, jl = J[map[kind] + rs];
          p = [jl[0] + loc[0], jl[1] + loc[1], jl[2] + loc[2]];
          if (kind === 'ankle') {   // the old boot ran heel -0.095 .. toe 0.165 about the ankle, sole on the floor
            var zz = loc[2], zN = f.foot.heel - 0.01 + (zz + 0.095) / 0.26 * (f.foot.tip - f.foot.heel + 0.02);
            p = [jl[0] + loc[0] * 1.05, (loc[1] + 0.09) * 1.0, zN];
          }
          nb = map[kind] + rs;
        }
      }
      out.pos[v*3] = p[0]; out.pos[v*3+1] = p[1]; out.pos[v*3+2] = p[2];
      out.j[v] = bi(nb);
    }
    return out;
  }

  /* ---- which body ------------------------------------------------------------------------
   * WHO IS A WOMAN (2026-10-26). Astra: "let's be representative of how it's
   * a nearly 50/50 split, in terms of men and women born ... and that
   * smaller, more violent cultures might only survive by keeping the women
   * out of the fighting." So:
   *   - Across a big society (civilian, navy, Syndicate) people are close
   *     to the birth ratio — about 105 boys to 100 girls — with a mild tilt:
   *     a few more men in the fighting jobs, a few more women in the rest.
   *   - The pirates are the small, violent culture: their fighters are
   *     nearly all men, and the women aboard keep the ship running.
   * P_MALE[culture][kind] is the chance a person is a man. Seeded per
   * person, so nobody changes. */
  var FIGHTERS = { raider: 1, captain: 1, marine: 1, tactical: 1, heavy: 1, enforcer: 1, security: 1, gunner: 1 };
  var P_MALE = { big: { fight: 0.6, other: 0.44 }, pirate: { fight: 0.95, other: 0.35 } };
  function seedOf(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function cultureOf(key, liv) { return key === 'raider' || key === 'captain' || liv === 'pir' ? 'pirate' : 'big'; }
  function maleOdds(key, liv) { return P_MALE[cultureOf(key, liv)][FIGHTERS[key] ? 'fight' : 'other']; }
  function bodyFor(key, name, liv) {
    if (People.only) return People.only;     // previews and probes: one body for everyone
    var R = RG(), all = R.bodies().filter(function (n) { return n !== 'mannequin'; });
    if (!all.length) return R.body('mannequin') ? 'mannequin' : null;
    var men = all.filter(function (n) { return !/female/i.test(n); }), women = all.filter(function (n) { return /female/i.test(n); });
    if (!men.length || !women.length) return all[seedOf(name + '|' + key + '|body') % all.length];
    var man = (seedOf(name + '|' + key + '|sex') % 10000) / 10000 < maleOdds(key, liv);
    var pool = man ? men : women;
    return pool[seedOf(name + '|' + key + '|body') % pool.length];
  }

  function bustFor(key, name, bname, liv) {
    if (!/female/i.test(bname || bodyFor(key, name, liv) || '')) return 1;
    if (People.forceBust != null) return People.forceBust;   // previews
    return BUSTS[seedOf(name + '|' + key + '|bust') % BUSTS.length];
  }
  /* Woman or man, for the portrait and anything else that must agree with
   * the body: 'f', 'm', or null with no bodies loaded. */
  function sexOf(key, name, liv) { var b = bodyFor(key, name, liv); return !b || b === 'mannequin' ? null : /female/i.test(b) ? 'f' : 'm'; }

  var CACHE = {};
  function build(key, name, liv, gear) {
    var M = NM(), R = RG();
    if (!M || !R) return null;
    var bname = bodyFor(key, name, liv); if (!bname) return null;
    var old = M.build(key, name, liv, gear); if (!old) return null;
    var bust = bustFor(key, name, bname, liv);
    var ck = bname + '|' + bust + '|' + key + '|' + name + '|' + (old.liv || '') + '|' + (old.gear || '');
    if (CACHE[ck]) return CACHE[ck];
    var f = fit(bname, bust);
    var person = { kind: 'rig', key: key, name: name, bodyName: bname, fit: f, body: f.body, mesh: f.uv, kit: liftKit(old, f),
                   canvas: old.canvas, old: old, scale: (old.look ? old.look.h : 1) * 1.78 / Math.max(1.5, f.body.height) };
    CACHE[ck] = person;
    return person;
  }

  /* ---- what they're doing → which clips ------------------------------------------------------
   * `p` is an npc.js person. Walking blends into standing by gait; sitting
   * and lying fade in by sit/lie. The walk is timed off the person's own
   * stride phase so the feet land where npc.js moves them. */
  var WALK = 'Walk_Loop', IDLE = 'Idle_Loop', TALK = 'Idle_Talking_Loop', SIT = 'Sitting_Idle_Loop', SITTALK = 'Sitting_Talking_Loop', WORK = 'Interact';
  function layers(p, talking) {
    var R = RG(), g = p.gait || 0, s = p.sit || 0, l = p.lie || 0, t = (p.phase || 0) / 1.3;
    var stand = Math.max(0, 1 - g) * Math.max(0, 1 - s), L = [];
    if (g > 0.01) L.push({ clip: WALK, t: (p.phase || 0) / (2 * Math.PI) * R.clipLength(WALK), w: g * (1 - s) });
    if (stand > 0.01) {
      var still = p.act === 'work' ? WORK : talking ? TALK : IDLE;
      L.push({ clip: still, t: t, w: stand * (1 - l * 0.0) });
    }
    if (s > 0.01) L.push({ clip: talking ? SITTALK : SIT, t: t, w: s });
    return L;
  }

  var People = { build: build, fit: fit, layers: layers, bodyFor: bodyFor, bustFor: bustFor, sexOf: sexOf, BUSTS: BUSTS, P_MALE: P_MALE, FIGHTERS: FIGHTERS, maleOdds: maleOdds, _clear: function () { CACHE = {}; FIT = {}; } };
  global.People = People;
  if (typeof module !== 'undefined' && module.exports) module.exports = People;
})(typeof window !== 'undefined' ? window : globalThis);
