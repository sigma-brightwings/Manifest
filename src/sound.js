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

  /* One second and a bit of white noise, built once and shared by every
   * noise-based effect and by the drive loop.
   *
   * IT IS A FUNCTION, and that is the whole of a bug that made the game
   * grind. `thrust` needs this buffer, and it used to reach for it with
   *
   *     if (!noiseBuf) fx('click');   // builds the buffer quietly
   *     if (!noiseBuf) return;
   *
   * which is a comment describing something that never happened: 'click' is
   * a `tone`, and tones do not touch the buffer — only `noise` did, and only
   * as a side effect of being called. So the buffer stayed null, thrust
   * returned before starting its node, and it did all that AFTER emitting a
   * 30 ms square blip. main.js calls thrust every frame with the throttle,
   * so the result was sixty clicks a second, for the life of the session,
   * which Astra heard as a constant grinding. Escape silenced it because
   * Escape stops the frame loop.
   *
   * A side effect nobody can see is not a constructor. This is. */
  var noiseBuf = null;
  function noiseBuffer(c) {
    if (noiseBuf) return noiseBuf;
    noiseBuf = c.createBuffer(1, c.sampleRate * 1.2, c.sampleRate);
    var d = noiseBuf.getChannelData(0);
    for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return noiseBuf;
  }

  function noise(dur, peak, freq, q, drop) {
    var c = ready();
    if (!c) return;
    var t0 = c.currentTime;
    var src = c.createBufferSource(); src.buffer = noiseBuffer(c); src.loop = true;
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
    /* The mass driver: a coil dumping into a slug — a hard electric crack
     * over a low knock you feel through the deck (2026-11-02). */
    massdriver: function () { noise(0.10, 0.30, 3200, 1.5, 600); tone('sine', 140, 55, 0.22, 0.20); },
    missile:   function () { noise(0.7, 0.22, 400, 0.8, 2400); tone('sine', 90, 240, 0.5, 0.12); },
    explosion: function () { noise(1.1, 0.5, 180, 0.5, 40); tone('sine', 70, 24, 0.9, 0.3); },
    hit:       function () { noise(0.18, 0.35, 900, 1.2, 200); },
    shieldHit: function () { tone('sine', 520, 320, 0.16, 0.14); },
    nearMiss:  function () { noise(0.12, 0.10, 2400, 2, 900); },
    dock:      function () { tone('sine', 120, 60, 0.28, 0.25); noise(0.2, 0.12, 300, 1, 120); },
    undock:    function () { noise(0.3, 0.12, 250, 1, 500); },
    jump:      function () { tone('sine', 60, 780, 2.2, 0.16, 0.4); },
    warn:      function () { tone('square', 660, 660, 0.09, 0.12); tone('square', 520, 520, 0.09, 0.12, 0.12); },
    /* Both of these were CALLED and did not exist. slipspace's contact and
     * interdiction events ask for 'blip' and 'alarm', and dropOut asks for
     * 'alarm' again — five call sites, all of them silently doing nothing,
     * because fx() returns early on a name it does not know. A missing
     * entry is indistinguishable from a working one that happens to be
     * quiet, which is how they survived.
     *
     * The alarm is deliberately harsher than `warn`: warn is an instrument
     * telling you something, and this is somebody reaching for you in the
     * dark a light year from anywhere. */
    alarm:     function () { tone('square', 440, 880, 0.16, 0.16); tone('square', 880, 440, 0.16, 0.16, 0.18); },
    blip:      function () { tone('sine', 1050, 1050, 0.05, 0.07); },
    click:     function () { tone('square', 1400, 900, 0.03, 0.05); },
    pay:       function () { tone('sine', 780, 1240, 0.14, 0.12); },
    scoop:     function () { tone('sine', 300, 520, 0.18, 0.10); },
    /* The station's own (2026-11-19, ambience below). The PA's two-note
     * chime before it speaks; freight set down somewhere in the hall; a
     * forklift backing up. Quiet: they are the room, not an event. */
    chime:     function () { tone('sine', 659, 659, 0.5, 0.07); tone('sine', 523, 523, 0.7, 0.07, 0.25); },
    clank:     function () { noise(0.16, 0.06, 700 + Math.random() * 900, 2.5, 220); tone('sine', 120 + Math.random() * 60, 70, 0.3, 0.04); },
    forklift:  function () {
      var c = ready(); if (!c) return;
      for (var i = 0; i < 3; i++) {
        var t0 = c.currentTime + i * 0.55, o = c.createOscillator(), g = c.createGain();
        o.type = 'square'; o.frequency.value = 1150;
        env(g, t0, 0.005, 0.018, 0.28);
        o.connect(g); g.connect(master); o.start(t0); o.stop(t0 + 0.35);
      }
    },
    /* Detained: a door shut hard and the officer's word. */
    detain:    function () { noise(0.22, 0.12, 260, 1, 90); tone('square', 330, 330, 0.12, 0.06, 0.18); },
    /* THUNDER (2026-11-10). One sound with a distance knob, because a
     * strike overhead and a strike on the horizon are the same event heard
     * through different amounts of air: the crack is the shock front and
     * only a near one still has it, and the roll is that same front smeared
     * by the miles it came through - longer, softer and lower the further
     * off it was. `near` is 0 (far) to 1 (on top of you). */
    thunder:   function (near) {
      near = near === undefined ? 0.5 : Math.max(0, Math.min(1, near));
      if (near > 0.45) noise(0.08 + 0.10 * near, 0.16 * near, 1600 + 2800 * near, 1.1, 300);
      noise(0.9 + 2.4 * (1 - near), 0.08 + 0.30 * near, 140 + 170 * near, 0.6, 40);
      tone('sine', 60 + 30 * near, 24, 0.8 + 1.5 * (1 - near), 0.05 + 0.15 * near);
    }
  };

  function fx(name, a) {
    if (!enabled || !FX[name]) return;
    try { FX[name](a); } catch (e) { /* a failed noise is still a no-op */ }
  }

  /* The drive. A looped filtered rumble whose gain follows the throttle —
   * started once, steered forever, because starting a source per frame is
   * how audio contexts die. */
  function thrust(level) {
    var c = ready();
    if (!c) return;
    if (!thrustNode) {
      thrustNode = c.createBufferSource();
      thrustNode.buffer = noiseBuffer(c); thrustNode.loop = true;
      var f = c.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = 130; f.Q.value = 0.6;
      thrustGain = c.createGain(); thrustGain.gain.value = 0;
      thrustNode.connect(f); f.connect(thrustGain); thrustGain.connect(master);
      thrustNode.start();
    }
    var want = Math.min(0.32, Math.max(0, level) * 0.32);
    thrustGain.gain.setTargetAtTime(want, c.currentTime, 0.08);
  }

  /* ---- A PLACE'S SOUND (2026-11-19) ------------------------------------------
   * Astra, asked whether station sound should be generated or wait for
   * recordings: "sound effects, yes." So, from nothing, like the rest:
   * five beds that run for as long as the game does, each a filtered noise
   * or a pair of sines, and a level for each per kind of room. Walking from
   * one room into the next crossfades them (setTargetAtTime, a second and a
   * half), so a door is heard as well as seen.
   *
   *   hum     mains and plant: 50 and 100 Hz sines
   *   murmur  people: band-passed noise round 450 Hz, its level breathing
   *           on a slow LFO so it reads as voices coming and going
   *   rumble  machinery through the deck: low-passed noise under 90 Hz
   *   air     ventilation: high-passed noise, very quiet
   *   music   the bar only: soft triangle notes on a slow minor walk
   *
   * And now and then, in the rooms that have them, a one-shot: a clank of
   * freight in the cargo hall and the hangar, a forklift's reverse beeps in
   * the cargo hall. Their timing is Math.random, like the noise buffer:
   * a sound is not part of the seed, and nothing reads it back. */
  var AMB = {
    bar:       { hum: 0.015, murmur: 0.075, rumble: 0.015, air: 0.008, music: 1 },
    concourse: { hum: 0.020, murmur: 0.060, rumble: 0.025, air: 0.012 },
    crewhall:  { hum: 0.020, murmur: 0.040, rumble: 0.020, air: 0.012 },
    cargohall: { hum: 0.020, murmur: 0.012, rumble: 0.080, air: 0.020, clank: [5, 14], beep: [16, 34] },
    corridor:  { hum: 0.045, murmur: 0.010, rumble: 0.030, air: 0.028 },
    lport:     { hum: 0.040, murmur: 0.012, rumble: 0.045, air: 0.030, clank: [9, 22] },
    berth:     { hum: 0.030, murmur: 0.000, rumble: 0.055, air: 0.030, clank: [8, 20] },
    tube:      { hum: 0.020, murmur: 0.000, rumble: 0.015, air: 0.040 }
  };
  var amb = null, ambKind = null, ambNext = {}, ambNoteAt = 0, ambStep = 0;
  function ambBuild(c) {
    var nb = noiseBuffer(c);
    function noiseLayer(type, f, q) {
      var s = c.createBufferSource(); s.buffer = nb; s.loop = true;
      /* Each starts at a different point in the buffer, so the layers are
       * not one noise heard through four filters in lockstep. */
      var fl = c.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q || 0.7;
      var g = c.createGain(); g.gain.value = 0;
      s.connect(fl); fl.connect(g); g.connect(master);
      s.start(0, Math.random() * 1.1);
      return g;
    }
    var hum = c.createGain(); hum.gain.value = 0; hum.connect(master);
    [50, 100].forEach(function (f, i) {
      var o = c.createOscillator(), og = c.createGain();
      o.type = 'sine'; o.frequency.value = f; og.gain.value = i ? 0.5 : 1;
      o.connect(og); og.connect(hum); o.start();
    });
    var murmur = noiseLayer('bandpass', 450, 0.6);
    /* Voices come and go: a 0.23 Hz wobble on the murmur's own gain. */
    var lfo = c.createOscillator(), lfoG = c.createGain();
    lfo.frequency.value = 0.23; lfoG.gain.value = 0;
    lfo.connect(lfoG); lfoG.connect(murmur.gain); lfo.start();
    var music = c.createGain(); music.gain.value = 0;
    var mf = c.createBiquadFilter(); mf.type = 'lowpass'; mf.frequency.value = 1600;
    music.connect(mf); mf.connect(master);
    return { hum: hum, murmur: murmur, murmurLfo: lfoG, rumble: noiseLayer('lowpass', 90, 0.5),
             air: noiseLayer('highpass', 3200, 0.5), music: music };
  }
  /* A slow walk round A minor; one soft note at a time, a little off the
   * beat now and then, so it is somebody's tape rather than a metronome. */
  var BAR_NOTES = [220, 261.6, 329.6, 293.7, 246.9, 196, 220, 329.6, 392, 349.2, 293.7, 261.6];
  function barNote(c, t0) {
    var f = BAR_NOTES[ambStep++ % BAR_NOTES.length];
    [f, f * 2].forEach(function (ff, k) {
      var o = c.createOscillator(), g = c.createGain();
      o.type = 'triangle'; o.frequency.value = ff;
      env(g, t0, 0.03, k ? 0.012 : 0.03, 1.4);
      o.connect(g); g.connect(amb.music); o.start(t0); o.stop(t0 + 1.6);
    });
  }
  /* `kind` is the room you are in (walk.js room kinds) or null for none:
   * aboard, in flight, on the title card. Called every frame. */
  function ambience(kind, dt) {
    var c = ready();
    if (!c) return;
    var lv = (kind && AMB[kind]) || null;
    if (!amb) { if (!lv) return; amb = ambBuild(c); }
    var now = c.currentTime;
    if (kind !== ambKind) {
      ambKind = kind;
      var L = lv || {};
      amb.hum.gain.setTargetAtTime(L.hum || 0, now, 0.5);
      amb.murmur.gain.setTargetAtTime(L.murmur || 0, now, 0.5);
      amb.murmurLfo.gain.setTargetAtTime((L.murmur || 0) * 0.45, now, 0.5);
      amb.rumble.gain.setTargetAtTime(L.rumble || 0, now, 0.5);
      amb.air.gain.setTargetAtTime(L.air || 0, now, 0.5);
      amb.music.gain.setTargetAtTime(L.music ? 1 : 0, now, 0.6);
      ambNext = {};
    }
    if (!lv) return;
    if (lv.music && now >= ambNoteAt) {
      barNote(c, now + 0.02);
      ambNoteAt = now + 0.62 + (Math.random() < 0.2 ? 0.31 : 0);
    }
    ['clank', 'beep'].forEach(function (k) {
      if (!lv[k]) return;
      if (ambNext[k] === undefined) ambNext[k] = now + lv[k][0] + Math.random() * (lv[k][1] - lv[k][0]);
      if (now < ambNext[k]) return;
      ambNext[k] = now + lv[k][0] + Math.random() * (lv[k][1] - lv[k][0]);
      fx(k === 'clank' ? 'clank' : 'forklift');
    });
  }

  function setVolume(v) {
    VOLUME = Math.max(0, Math.min(1, v));
    if (master) master.gain.value = VOLUME;
  }

  function mute(on) {
    enabled = !on ? true : false;
    if (on && thrustGain) thrustGain.gain.value = 0;
    if (on && amb) { ['hum', 'murmur', 'murmurLfo', 'rumble', 'air', 'music'].forEach(function (k) { amb[k].gain.value = 0; }); ambKind = '__muted'; }
  }

  /* Does the table know this name? For the test that scrapes every
   * `sound('x')` call site out of the other modules and asserts each one
   * lands on something — fx() answers a name it does not know with silence,
   * which is exactly what a working effect sounds like when nothing is
   * happening, and that is how 'alarm' and 'blip' stayed missing. */
  function has(name) { return Object.prototype.hasOwnProperty.call(FX, name); }

  var Sound = { fx: fx, thrust: thrust, poke: poke, setVolume: setVolume,
                mute: mute, has: has, ambience: ambience, AMB: AMB };
  global.Sound = Sound;
  if (typeof module !== 'undefined' && module.exports) module.exports = Sound;
})(typeof window !== 'undefined' ? window : globalThis);
