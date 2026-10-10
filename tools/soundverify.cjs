/* Scratch probe: count Sound calls per frame in a real headless frame loop.
 *
 * Astra reported "a constant clicking/grinding sound... a beep happening so
 * fast it's grating", which Escape silences — so it is something in the sim
 * step making noise every frame. Reading all 54 fx() call sites found every
 * one of them latched, which means the eye is wrong and the thing has to be
 * measured instead. Doctrine 6, applied to audio.
 *
 * Run: node tools/soundverify.cjs
 * Untracked, like the other *verify.cjs scratch files.
 */
var path = require('path');
var root = path.join(__dirname, '..');

/* ---- the same headless shims render.test.js installs -------------------- */
var clock = 0;
var rafQueue = [];
var ctxStub = new Proxy({}, {
  get: function (t, k) {
    if (k === 'canvas') return { width: 1280, height: 720 };
    if (k === 'measureText') return function (s) { return { width: String(s).length * 8.4 }; };
    if (k === 'createLinearGradient' || k === 'createRadialGradient') {
      return function () { return { addColorStop: function () {} }; };
    }
    if (k === 'getImageData') return function () { return { data: [0, 0, 0, 0] }; };
    return function () {};
  },
  set: function () { return true; }
});
var canvasStub = {
  width: 1280, height: 720,
  style: {}, clientWidth: 1280, clientHeight: 720,
  getContext: function () { return ctxStub; },
  addEventListener: function () {},
  getBoundingClientRect: function () { return { left: 0, top: 0, width: 1280, height: 720 }; }
};
global.window = global;
global.performance = { now: function () { return clock; } };
global.requestAnimationFrame = function (fn) { rafQueue.push(fn); return rafQueue.length; };
global.devicePixelRatio = 1;
global.innerWidth = 1280;
global.innerHeight = 720;
global.addEventListener = function () {};
global.document = {
  readyState: 'complete',
  getElementById: function () { return canvasStub; },
  addEventListener: function () {}
};
global.prompt = function () { return 'kawartha'; };
global.location = { hash: '', href: 'game://local/', search: '' };
global.navigator = { userAgent: 'node' };

require(path.join(root, 'src/vec3.js'));
require(path.join(root, 'src/rng.js'));
require(path.join(root, 'src/slipspace.js'));
require(path.join(root, 'src/kepler.js'));
require(path.join(root, 'src/economy.js'));
require(path.join(root, 'src/generate.js'));
require(path.join(root, 'src/galaxy.js'));
require(path.join(root, 'src/sim.js'));
require(path.join(root, 'src/combat.js'));
require(path.join(root, 'src/missions.js'));
require(path.join(root, 'src/sound.js'));
require(path.join(root, 'src/save.js'));
require(path.join(root, 'src/hulls.js'));
require(path.join(root, 'src/render.js'));
require(path.join(root, 'src/screens.js'));
require(path.join(root, 'src/main.js'));

var G = global.Game;

/* ---- the instrument -----------------------------------------------------
 * Wrap Sound rather than replace it: `thrust` is called unconditionally
 * every frame BY DESIGN (it steers a gain on a node started once), so the
 * interesting number is how many ONE-SHOT fx() calls a frame makes. */
var counts = {};
var thrustCalls = 0;
var realFx = global.Sound.fx;
global.Sound.fx = function (name) {
  counts[name] = (counts[name] || 0) + 1;
  return realFx.apply(this, arguments);
};
var realThrust = global.Sound.thrust;
global.Sound.thrust = function () {
  thrustCalls++;
  return realThrust.apply(this, arguments);
};

function frame(dt) {
  clock += (dt === undefined ? 16 : dt);
  var fn = rafQueue.pop();
  rafQueue.length = 0;
  if (!fn) throw new Error('no animation frame was scheduled');
  fn(clock);
}

function report(label, n) {
  var total = 0, parts = [];
  for (var k in counts) { total += counts[k]; parts.push(k + '=' + counts[k]); }
  console.log(label.padEnd(34) + ' frames=' + String(n).padStart(4) +
              '  fx=' + String(total).padStart(5) +
              '  thrust=' + String(thrustCalls).padStart(5) +
              '   ' + (parts.join(' ') || '(none)'));
  counts = {}; thrustCalls = 0;
}

/* Settle first — boot fires legitimate one-shots. */
var i;
for (i = 0; i < 30; i++) frame();
counts = {}; thrustCalls = 0;

for (i = 0; i < 120; i++) frame();
report('fresh career, sitting still', 120);

/* Undock and fly: the state Astra was NOT in, as a control. */
if (G.ship.docked || G.ship.landed) {
  try { global.Sim.undock(G.ship, G.sys, G.t); } catch (e) {}
}
for (i = 0; i < 30; i++) frame();
counts = {}; thrustCalls = 0;
for (i = 0; i < 120; i++) frame();
report('flying, no throttle', 120);

G.ship.throttle = 1;
for (i = 0; i < 30; i++) frame();
counts = {}; thrustCalls = 0;
for (i = 0; i < 120; i++) frame();
report('flying, full throttle', 120);

console.log('\nA per-frame offender shows fx at or near the frame count.');
