/* sound.js — every noise in the game, synthesised from nothing.
 *
 * No audio files: a file is a download, a loading order, and a licence,
 * and an oscillator is none of those. Everything here is built the moment
 * it is needed from oscillators and filtered noise, in the same utilitarian
 * spirit as the meshes — at the fidelity this game runs at, the information
 * is in the envelope, not the waveform.
 *
 * The context is created lazily on the first real user gesture, because
 * browsers rightly refuse to let a page make noise before the user has
 * touched it. Until then, and in the headless test harness where
 * AudioContext does not exist at all, every call is a silent no-op — sound
 * must never be load-bearing.
 */
(function (global) {
  'use strict';

  var ctx = null;
  var master = null;
  var thrustNode = null, thrustGain = null;
  var enabled = true;
  var VOLUME = 0.5;

  function ready() {
    if (!enabled) return null;
    if (ctx) return ctx;
    var AC = global.AudioContext || global.webkitAudioContext;
    if (!AC) { enabled = false; return null; }
    try {
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = VOLUME;
      master.connect(ctx.destination);
    } catch (e) { enabled = false; ctx = null; }
    return ctx;
  }

  /* Called from input handlers: browsers unlock audio on a gesture, and
   * this is the gesture. */
  function poke() {
    var c = ready();
    if (c && c.state === 'suspended') c.resume().catch(function () {});
  }

  function env(node, t0, a, peak, decay) {
    node.gain.setValueAtTime(0.0001, t0);
    node.gain.linearRampToValueAtTime(peak, t0 + a);
    node.gain.exponentialRampToValueAtTime(0.0001, t0 + a + decay);
  }

  function tone(type, f0, f1, dur, peak, a) {
    var c = ready();
    if (!c) return;
    var t0 = c.currentTime;
    var o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t0);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
    env(g, t0, a || 0.005, peak, dur);
    o.connect(g); g.connect(master);
    o.start(t0); o.stop(t0 + dur + 0.1);
  }

  var noiseBuf = null;
  function noise(dur, peak, freq, q, drop) {
    var c = ready();
    if (!c) return;
    if (!noiseBuf) {
      noiseBuf = c.createBuffer(1, c.sampleRate * 1.2, c.sampleRate);
      var d = noiseBuf.getChannelData(0);
      for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    var t0 = c.currentTime;
    var src = c.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    var f = c.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.setValueAtTime(freq, t0); f.Q.value = q || 1;
    if (drop) f.frequency.exponentialRampToValueAtTime(Math.max(20, drop), t0 + dur);
    var g = c.createGain();
    env(g, t0, 0.004, peak, dur);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t0); src.stop(t0 + dur + 0.1);
  }

  /* One entry per thing that happens. Naming them here rather than passing
   * envelopes around means the whole soundscape can be retuned on one
   * screenfull. */
  var FX = {
    laser:     function () { tone('sawtooth', 880, 140, 0.12, 0.16); },
    turret:    function () { tone('square', 620, 200, 0.08, 0.10); },
    missile:   function () { noise(0.7, 0.22, 400, 0.8, 2400); tone('sine', 90, 240, 0.5, 0.12); },
    explosion: function () { noise(1.1, 0.5, 180, 0.5, 40); tone('sine', 70, 24, 0.9, 0.3); },
    hit:       function () { noise(0.18, 0.35, 900, 1.2, 200); },
    shieldHit: function () { tone('sine', 520, 320, 0.16, 0.14); },
    nearMiss:  function () { noise(0.12, 0.10, 2400, 2, 900); },
    dock:      function () { tone('sine', 120, 60, 0.28, 0.25); noise(0.2, 0.12, 300, 1, 120); },
    undock:    function () { noise(0.3, 0.12, 250, 1, 500); },
    jump:      function () { tone('sine', 60, 780, 2.2, 0.16, 0.4); },
    warn:      function () { tone('square', 660, 660, 0.09, 0.12); tone('square', 520, 520, 0.09, 0.12, 0.12); },
    click:     function () { tone('square', 1400, 900, 0.03, 0.05); },
    pay:       function () { tone('sine', 780, 1240, 0.14, 0.12); },
    scoop:     function () { tone('sine', 300, 520, 0.18, 0.10); }
  };

  function fx(name) {
    if (!enabled || !FX[name]) return;
    try { FX[name](); } catch (e) { /* a failed noise is still a no-op */ }
  }

  /* The drive. A looped filtered rumble whose gain follows the throttle —
   * started once, steered forever, because starting a source per frame is
   * how audio contexts die. */
  function thrust(level) {
    var c = ready();
    if (!c) return;
    if (!thrustNode) {
      if (!noiseBuf) fx('click');   // builds the buffer quietly
      if (!noiseBuf) return;
      thrustNode = c.createBufferSource();
      thrustNode.buffer = noiseBuf; thrustNode.loop = true;
      var f = c.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = 130; f.Q.value = 0.6;
      thrustGain = c.createGain(); thrustGain.gain.value = 0;
      thrustNode.connect(f); f.connect(thrustGain); thrustGain.connect(master);
      thrustNode.start();
    }
    var want = Math.min(0.32, Math.max(0, level) * 0.32);
    thrustGain.gain.setTargetAtTime(want, c.currentTime, 0.08);
  }

  function setVolume(v) {
    VOLUME = Math.max(0, Math.min(1, v));
    if (master) master.gain.value = VOLUME;
  }

  function mute(on) { enabled = !on ? true : false; if (on && thrustGain) thrustGain.gain.value = 0; }

  var Sound = { fx: fx, thrust: thrust, poke: poke, setVolume: setVolume, mute: mute };
  global.Sound = Sound;
  if (typeof module !== 'undefined' && module.exports) module.exports = Sound;
})(typeof window !== 'undefined' ? window : globalThis);
