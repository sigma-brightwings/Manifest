/* npcgl.js — the people, drawn on the GPU (2026-10-25).
 *
 * One draw call per body. Each body is one vertex buffer in its rest pose
 * (npcmodel.js), one painted 512x512 skin, and eleven bone matrices a frame;
 * the vertex shader moves every vertex by the bone it rides on. That is the
 * whole reason the bodies are skinned rather than built out of more
 * polygons (Astra: "skin them all so we're not using more polygons for the
 * same effect"): the detail is in the texture, and posing costs eleven
 * matrices rather than a new mesh.
 *
 * WHERE IT SITS IN THE FRAME. A pass handed to gl.js (GLWorld.addPass),
 * which runs it after the cockpit room and before the screens — so a body
 * is depth-tested against the room it stands in, and a screen on a console
 * still draws over a crewman's shoulder rather than under it. The same
 * projection and logarithmic depth as the mesh pass, so the two agree to the
 * last bit about which is nearer.
 *
 * Lighting is the cockpit's indoor rule — no sun, a lamp at the eye on
 * |N·V| so winding cannot matter — plus a little light from the ceiling,
 * which a room full of overhead strips has and a face needs to read. The
 * face normal is taken from screen-space derivatives, so the buffer needs no
 * normals and every face is flat, as the rest of the game is.
 */
(function (global) {
  'use strict';

  var VERT = [
    '#version 300 es',
    'in vec3 aPos;',
    'in vec2 aUV;',
    'in float aBone;',
    'in float aEmis;',
    'uniform mat4 uBones[11];',
    'uniform vec3 uModelRel;',
    'uniform mat3 uRot;',
    'uniform float uScale;',
    'uniform vec3 uRight, uUp, uFwd;',
    'uniform float uFlen;',
    'uniform vec2 uCenterPx, uViewportPx;',
    'uniform float uNear;',
    'out vec3 vRel; out vec2 vUV; out float vEmis;',
    'void main() {',
    '  vec3 p = (uBones[int(aBone + 0.5)] * vec4(aPos, 1.0)).xyz;',
    '  vec3 rel = uModelRel + uRot * (p * uScale);',
    '  vRel = rel; vUV = aUV; vEmis = aEmis;',
    /* The mesh pass's projection, clip-honest at the near plane — see the
     * long note on VERT_MESH in gl.js for why it is written this way. */
    '  float depth = dot(rel, uFwd);',
    '  vec2 c2 = uCenterPx * 2.0 / uViewportPx;',
    '  vec2 axis = vec2(dot(rel, uRight), dot(rel, uUp));',
    '  vec2 span = axis * (2.0 * uFlen) / uViewportPx;',
    '  gl_Position = vec4((c2.x - 1.0) * depth + span.x, (1.0 - c2.y) * depth + span.y, depth - 2.0 * uNear, depth);',
    '}'
  ].join('\n');

  var FRAG = [
    '#version 300 es',
    'precision highp float;',
    'in vec3 vRel; in vec2 vUV; in float vEmis;',
    'uniform sampler2D uTex;',
    'uniform vec3 uFwd;',
    'uniform vec3 uCeil;',          // the room's up, in world axes
    'uniform float uNear, uInvLogRange;',
    'out vec4 frag;',
    'void main() {',
    '  float depth = dot(vRel, uFwd);',
    '  gl_FragDepth = clamp(log2(max(uNear, depth) / uNear) * uInvLogRange, 0.0, 1.0);',
    /* The skin was painted top-down on a canvas; v runs up. */
    '  vec3 tex = texture(uTex, vec2(vUV.x, 1.0 - vUV.y)).rgb;',
    '  if (vEmis > 0.5) { frag = vec4(tex * 1.15, 0.55); return; }',
    '  vec3 n = normalize(cross(dFdx(vRel), dFdy(vRel)));',
    '  vec3 toCam = normalize(-vRel);',
    '  if (dot(n, toCam) < 0.0) n = -n;',
    '  float lamp = abs(dot(n, toCam));',
    '  float top = max(0.0, dot(n, uCeil));',
    '  frag = vec4(tex * (0.20 + 0.55 * lamp + 0.30 * top), 0.0);',
    '}'
  ].join('\n');

  /* THE QUATERNIUS BODIES (2026-10-26; people.js, rig.js). Two draws a
   * person through one program: the body — indexed, four bone weights a
   * vertex, its own normals so it shades round rather than faceted — and
   * the kit lifted off the old figure — one bone a vertex, flat-faced like
   * everything else in the game, lamps self-lit. Both are painted from the
   * person's own skin atlas. The light is the same indoor rule as above,
   * plus a little rim so a dark suit still has an edge against a dark
   * room. */
  var VERT_RIG = [
    '#version 300 es',
    'in vec3 aPos; in vec3 aNrm; in vec4 aJ; in vec4 aW; in vec2 aUV; in float aEmis;',
    'uniform mat4 uBones[23];',
    'uniform float uKit;',
    'uniform vec3 uModelRel;',
    'uniform mat3 uRot;',
    'uniform float uScale;',
    'uniform vec3 uRight, uUp, uFwd;',
    'uniform float uFlen;',
    'uniform vec2 uCenterPx, uViewportPx;',
    'uniform float uNear;',
    'out vec3 vRel; out vec3 vN; out vec2 vUV; out float vEmis;',
    'void main() {',
    /* One path for body and kit alike (the kit's weights are 1,0,0,0). */
    '  ivec4 j = ivec4(aJ + 0.5);',
    '  mat4 S = uBones[j.x] * aW.x + uBones[j.y] * aW.y + uBones[j.z] * aW.z + uBones[j.w] * aW.w;',
    '  vec3 p = (S * vec4(aPos, 1.0)).xyz;',
    '  vec3 rel = uModelRel + uRot * (p * uScale);',
    '  vRel = rel; vUV = aUV; vEmis = aEmis; vN = uRot * (mat3(S) * aNrm);',
    '  float depth = dot(rel, uFwd);',
    '  vec2 c2 = uCenterPx * 2.0 / uViewportPx;',
    '  vec2 axis = vec2(dot(rel, uRight), dot(rel, uUp));',
    '  vec2 span = axis * (2.0 * uFlen) / uViewportPx;',
    '  gl_Position = vec4((c2.x - 1.0) * depth + span.x, (1.0 - c2.y) * depth + span.y, depth - 2.0 * uNear, depth);',
    '}'
  ].join('\n');
  var FRAG_RIG = [
    '#version 300 es',
    'precision highp float;',
    'in vec3 vRel; in vec3 vN; in vec2 vUV; in float vEmis;',
    'uniform sampler2D uTex;',
    'uniform vec3 uFwd;',
    'uniform vec3 uCeil;',
    'uniform float uKit;',
    'uniform float uNear, uInvLogRange;',
    'out vec4 frag;',
    'void main() {',
    '  float depth = dot(vRel, uFwd);',
    '  gl_FragDepth = clamp(log2(max(uNear, depth) / uNear) * uInvLogRange, 0.0, 1.0);',
    '  vec3 tex = texture(uTex, vec2(vUV.x, 1.0 - vUV.y)).rgb;',
    '  if (vEmis > 0.5) { frag = vec4(tex * 1.15, 0.55); return; }',
    '  vec3 n = uKit > 0.5 ? normalize(cross(dFdx(vRel), dFdy(vRel))) : normalize(vN);',
    '  vec3 toCam = normalize(-vRel);',
    '  if (dot(n, toCam) < 0.0) n = -n;',
    '  float lamp = abs(dot(n, toCam));',
    '  float top = max(0.0, dot(n, uCeil));',
    '  float rim = pow(1.0 - lamp, 3.0);',
    '  frag = vec4(tex * (0.20 + 0.55 * lamp + 0.30 * top) + vec3(0.10, 0.12, 0.15) * rim, 0.0);',
    '}'
  ].join('\n');

  var gl = null, prog = null, uni = null, failed = false, progR = null, uniR = null;
  var queue = [];

  function setup(g, env) {
    if (prog || failed) return !!prog;
    gl = g;
    try {
      prog = env.link(gl, VERT, FRAG, 'npc');
      uni = env.uniforms(gl, prog, ['uBones', 'uModelRel', 'uRot', 'uScale', 'uRight', 'uUp', 'uFwd', 'uFlen',
                                    'uCenterPx', 'uViewportPx', 'uNear', 'uInvLogRange', 'uTex', 'uCeil']);
      try {
        progR = env.link(gl, VERT_RIG, FRAG_RIG, 'npc-rig');
        uniR = env.uniforms(gl, progR, ['uBones', 'uKit', 'uModelRel', 'uRot', 'uScale', 'uRight', 'uUp', 'uFwd', 'uFlen',
                                        'uCenterPx', 'uViewportPx', 'uNear', 'uInvLogRange', 'uTex', 'uCeil']);
      } catch (e2) { progR = null; if (global.console) console.error('npc rig pass: ' + e2.message); }
    } catch (e) {
      failed = true;
      if (global.console) console.error('npc pass: ' + e.message);
      return false;
    }
    return true;
  }

  /* The body's buffers and skin, made the first time it is drawn and kept
   * on the model (models are cached by npcmodel.js, so identity is stable). */
  function upload(model) {
    if (model._gl) return model._gl;
    var vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    function attr(data, name, n) {
      var b = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      var l = gl.getAttribLocation(prog, name);
      if (l >= 0) { gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, n, gl.FLOAT, false, 0, 0); }
    }
    attr(model.pos, 'aPos', 3); attr(model.uv, 'aUV', 2);
    attr(model.bone, 'aBone', 1); attr(model.emis, 'aEmis', 1);
    gl.bindVertexArray(null);
    var tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    try {
      if (model.canvas) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, model.canvas);
      else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([140, 145, 150, 255]));
    } catch (e) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([140, 145, 150, 255]));
    }
    /* Mipmapped: across a concourse a face is a few pixels, and an
     * unfiltered 512 skin at that size sparkles. The swatches are 16 px
     * squares, so the bleed between them stays inside their own colour
     * for the first few levels. */
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    model._gl = { vao: vao, count: model.count, tex: tex };
    return model._gl;
  }

  /* A Quaternius body's buffers, once per body (shared by everyone wearing
   * it); a person's kit buffers and atlas, once per person. */
  function attrR(data, name, n, type, norm) {
    var b = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    var l = gl.getAttribLocation(progR, name);
    if (l >= 0) { gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, n, type, norm, 0, 0); }
  }
  function constR(name, v) { var l = gl.getAttribLocation(progR, name); if (l >= 0) { gl.disableVertexAttribArray(l); if (v.length === 4) gl.vertexAttrib4f(l, v[0], v[1], v[2], v[3]); else gl.vertexAttrib3f(l, v[0], v[1], v[2]); } }
  function uploadRig(person) {
    var mesh = person.mesh;
    if (!mesh._gl) {
      var vao = gl.createVertexArray();
      gl.bindVertexArray(vao);
      attrR(mesh.pos, 'aPos', 3, gl.FLOAT, false); attrR(mesh.nrm, 'aNrm', 3, gl.BYTE, true);
      var jf = new Float32Array(mesh.j.length), wf = new Float32Array(mesh.w.length);
      for (var q = 0; q < jf.length; q++) { jf[q] = mesh.j[q]; wf[q] = mesh.w[q] / 255; }
      attrR(jf, 'aJ', 4, gl.FLOAT, false); attrR(wf, 'aW', 4, gl.FLOAT, false);
      attrR(mesh.uv, 'aUV', 2, gl.FLOAT, false);
      var le = gl.getAttribLocation(progR, 'aEmis'); if (le >= 0) { gl.disableVertexAttribArray(le); gl.vertexAttrib1f(le, 0); }
      var ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.idx, gl.STATIC_DRAW);
      gl.bindVertexArray(null);
      mesh._gl = { vao: vao, count: mesh.idx.length, type: mesh.idx instanceof Uint32Array ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT };
    }
    if (!person._gl) {
      var k = person.kit, kv = gl.createVertexArray();
      gl.bindVertexArray(kv);
      var kj = new Float32Array(k.count * 4), kw = new Float32Array(k.count * 4);
      for (var q2 = 0; q2 < k.count; q2++) { kj[q2 * 4] = k.j[q2]; kw[q2 * 4] = 1; }
      attrR(k.pos, 'aPos', 3, gl.FLOAT, false); attrR(kj, 'aJ', 4, gl.FLOAT, false); attrR(kw, 'aW', 4, gl.FLOAT, false);
      attrR(k.uv, 'aUV', 2, gl.FLOAT, false); attrR(new Float32Array(k.emis), 'aEmis', 1, gl.FLOAT, false);
      var ln = gl.getAttribLocation(progR, 'aNrm'); if (ln >= 0) { gl.disableVertexAttribArray(ln); gl.vertexAttrib3f(ln, 0, 1, 0); }
      gl.bindVertexArray(null);
      var tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      try { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, person.canvas); }
      catch (e) { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([140, 145, 150, 255])); }
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      person._gl = { vao: kv, count: k.count, tex: tex };
    }
    return person._gl;
  }

  /* Queue this frame's people. `frame` is { pos, right, up, fwd } — the
   * ship's own, for the deck it carries and for a station deck drawn in the
   * docked ship's frame — and `scale` turns a metre into the world's km.
   * `figs` is [{ model, mats }] with `mats` from NpcModel.skin. */
  function queueFigures(cam, frame, scale, figs) {
    if (!figs || !figs.length) return false;
    var GW = global.GLWorld;
    if (!GW || !GW.available || !GW.addPass) return false;
    queue.push({ cam: cam, frame: frame, scale: scale, figs: figs,
                 rel: { x: frame.pos.x - cam.eye.x, y: frame.pos.y - cam.eye.y, z: frame.pos.z - cam.eye.z } });
    return true;
  }

  function draw(g, env) {
    if (!queue.length) return;
    var q = queue;
    queue = [];
    if (!setup(g, env)) return;
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LESS);
    /* Whatever the pass before left, a body writes its own depth — a smooth
     * body is all overlapping front and back, and without depth writes its
     * back showed through its chest in shards (2026-10-26). */
    gl.depthMask(true);
    gl.disable(gl.POLYGON_OFFSET_FILL);
    gl.disable(gl.STENCIL_TEST);
    gl.disable(gl.BLEND);
    gl.useProgram(prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform1i(uni.uTex, 0);
    function common(U, it) {
      var cam = it.cam, f = it.frame;
      gl.uniform2f(U.uViewportPx, env.vw, env.vh);
      gl.uniform2f(U.uCenterPx, cam.cx, cam.cy);
      gl.uniform1f(U.uFlen, cam.flen);
      gl.uniform3f(U.uRight, cam.r.x, cam.r.y, cam.r.z);
      gl.uniform3f(U.uUp, cam.u.x, cam.u.y, cam.u.z);
      gl.uniform3f(U.uFwd, cam.f.x, cam.f.y, cam.f.z);
      gl.uniform1f(U.uNear, env.near);
      gl.uniform1f(U.uInvLogRange, env.invLogRange);
      gl.uniform3f(U.uModelRel, it.rel.x, it.rel.y, it.rel.z);
      gl.uniform1f(U.uScale, it.scale);
      gl.uniform3f(U.uCeil, f.up.x, f.up.y, f.up.z);
      gl.uniformMatrix3fv(U.uRot, false, [f.right.x, f.right.y, f.right.z, f.up.x, f.up.y, f.up.z, f.fwd.x, f.fwd.y, f.fwd.z]);
    }
    /* The new bodies first, through their own program. */
    if (progR) {
      gl.useProgram(progR);
      gl.uniform1i(uniR.uTex, 0);
      for (var ir = 0; ir < q.length; ir++) {
        var itr = q[ir], any = false;
        for (var kr = 0; kr < itr.figs.length; kr++) {
          var fr = itr.figs[kr];
          if (!fr.rig || !fr.rmats) continue;
          if (!any) { common(uniR, itr); any = true; }
          var ur = uploadRig(fr.rig);
          /* Where the person stands, added here in double precision: the
           * bones only carry the pose about their feet. */
          var rp = fr.rpos || { x: 0, y: 0, z: 0 }, fF = itr.frame, sc2 = itr.scale;
          gl.uniform3f(uniR.uModelRel,
            itr.rel.x + (fF.right.x * rp.x + fF.up.x * rp.y + fF.fwd.x * rp.z) * sc2,
            itr.rel.y + (fF.right.y * rp.x + fF.up.y * rp.y + fF.fwd.y * rp.z) * sc2,
            itr.rel.z + (fF.right.z * rp.x + fF.up.z * rp.y + fF.fwd.z * rp.z) * sc2);
          gl.uniformMatrix4fv(uniR.uBones, false, fr.rmats);
          gl.bindTexture(gl.TEXTURE_2D, ur.tex);
          gl.uniform1f(uniR.uKit, 0);
          gl.bindVertexArray(fr.rig.mesh._gl.vao);
          gl.drawElements(gl.TRIANGLES, fr.rig.mesh._gl.count, fr.rig.mesh._gl.type, 0);
          gl.uniform1f(uniR.uKit, 1);
          gl.bindVertexArray(ur.vao);
          gl.drawArrays(gl.TRIANGLES, 0, ur.count);
        }
      }
      gl.useProgram(prog);
    }
    for (var i = 0; i < q.length; i++) {
      var it = q[i], cam = it.cam, f = it.frame;
      gl.uniform2f(uni.uViewportPx, env.vw, env.vh);
      gl.uniform2f(uni.uCenterPx, cam.cx, cam.cy);
      gl.uniform1f(uni.uFlen, cam.flen);
      gl.uniform3f(uni.uRight, cam.r.x, cam.r.y, cam.r.z);
      gl.uniform3f(uni.uUp, cam.u.x, cam.u.y, cam.u.z);
      gl.uniform3f(uni.uFwd, cam.f.x, cam.f.y, cam.f.z);
      gl.uniform1f(uni.uNear, env.near);
      gl.uniform1f(uni.uInvLogRange, env.invLogRange);
      gl.uniform3f(uni.uModelRel, it.rel.x, it.rel.y, it.rel.z);
      gl.uniform1f(uni.uScale, it.scale);
      gl.uniform3f(uni.uCeil, f.up.x, f.up.y, f.up.z);
      gl.uniformMatrix3fv(uni.uRot, false, [f.right.x, f.right.y, f.right.z, f.up.x, f.up.y, f.up.z, f.fwd.x, f.fwd.y, f.fwd.z]);
      for (var k = 0; k < it.figs.length; k++) {
        var fig = it.figs[k];
        if (!fig.model || !fig.mats || (fig.rig && fig.rmats && progR)) continue;
        var up = upload(fig.model);
        gl.bindVertexArray(up.vao);
        gl.bindTexture(gl.TEXTURE_2D, up.tex);
        gl.uniformMatrix4fv(uni.uBones, false, fig.mats);
        gl.drawArrays(gl.TRIANGLES, 0, up.count);
      }
    }
    gl.bindVertexArray(null);
    gl.enable(gl.BLEND);
  }

  var registered = false;
  function register() {
    var GW = global.GLWorld;
    if (registered || !GW || !GW.addPass) return;
    GW.addPass(draw);
    registered = true;
  }

  var NpcGL = {
    queue: function (cam, frame, scale, figs) { register(); return queueFigures(cam, frame, scale, figs); },
    available: function () { return !!(global.GLWorld && global.GLWorld.available && global.GLWorld.addPass && !failed); }
  };

  global.NpcGL = NpcGL;
  if (typeof module !== 'undefined' && module.exports) module.exports = NpcGL;
})(typeof window !== 'undefined' ? window : globalThis);
