/* profile-frame.js — where the frame goes, by view.
 *
 *     node tools/profile-frame.js
 *
 * Boots the real game against the same stub canvas render.test.js uses and
 * counts the 2D context calls each view spends per frame. A stub cannot
 * measure rasterisation, so this is not a frame time — it is the CALL
 * COUNT, which is what a canvas frame's cost is actually made of once the
 * pixels are the GPU's problem. A view that issues four times as many
 * calls as another is four times as expensive to submit, whatever the
 * hardware underneath.
 */
/* render.test.js — actually run the renderer.
 *
 *     node test/render.test.js
 *
 * Every other suite tests physics and generation, which are pure functions
 * and easy to reason about. The drawing code is neither, and it is the part
 * that fails as a black screen rather than as a wrong number — so this
 * stubs a canvas context, boots the real game against it, and steps frames
 * through every view, panel page and dialog it has.
 *
 * main.js wraps its frame in a try/catch and paints the message onto the
 * canvas rather than throwing, which is right for a player and useless for
 * a test — so the stub records every fillText and we fail on anything that
 * starts with "error:". A silent catch is not a passing test.
 */
var pass = 0, fail = 0;
function check(n, c, d) { if (c) pass++; else { fail++; console.log('  FAIL  ' + n + (d ? '   ' + d : '')); } }

/* ---- the fake canvas -------------------------------------------------- */
var drawn = { texts: [], calls: 0, glass: [] };

function makeCtx() {
  var noop = function () { drawn.calls++; };
  var alphaStack = [];
  var ctx = {
    globalAlpha: 1,
    canvas: null,
    /* save/restore actually stack globalAlpha, unlike the rest of this
     * stub. A no-op restore would let a leaked opacity look like a clean
     * one — the drawing code would fail to put it back, the stub would
     * never notice, and every hull painted after a pane of glass would come
     * out washed out in the real game only. */
    save: function () { drawn.calls++; alphaStack.push(this.globalAlpha); },
    restore: function () {
      drawn.calls++;
      if (alphaStack.length) this.globalAlpha = alphaStack.pop();
    },
    beginPath: noop, closePath: noop,
    moveTo: noop, lineTo: noop, quadraticCurveTo: noop, bezierCurveTo: noop,
    arc: noop, arcTo: noop, ellipse: noop, rect: noop,
    /* TRANSLUCENT fills only, and only those. Translucency is otherwise
     * invisible to a stub — globalAlpha is a property nobody reads — and it
     * is the one observable that separates a pane of glass from a solid
     * wall of the same colour.
     *
     * Opaque fills are deliberately not recorded. The suite steps many
     * thousands of frames and paints a few hundred triangles in most of
     * them, so keeping all of them would be a six-figure array of objects
     * held for the whole run to answer a question nothing asks. */
    fill: function () {
      drawn.calls++;
      var a = this.globalAlpha;
      if (typeof a === 'number' && a < 1) {
        drawn.glass.push({ style: this.fillStyle, alpha: a });
      }
    },
    stroke: noop, clip: noop,
    fillRect: noop, strokeRect: noop, clearRect: noop,
    setLineDash: noop, translate: noop, scale: noop, rotate: noop,
    setTransform: noop, transform: noop, drawImage: noop,
    measureText: function (t) { drawn.calls++; return { width: String(t).length * 6.2 }; },
    fillText: function (t) { drawn.calls++; drawn.texts.push(String(t)); },
    strokeText: function (t) { drawn.calls++; drawn.texts.push(String(t)); },
    createLinearGradient: function () { return { addColorStop: function () {} }; },
    createRadialGradient: function () { return { addColorStop: function () {} }; },
    createPattern: function () { return null; }
  };
  return ctx;
}

var ctxStub = makeCtx();
/* The canvas registers listeners too (mousedown, wheel, touch), and until
 * the manoeuvre-node cursor arrived nothing here needed them. They go into
 * the same map as the window's: the two sets do not overlap, and a pointer
 * gesture that cannot be replayed is a pointer gesture that cannot be
 * tested. getBoundingClientRect is here for the same reason — the cursor
 * converts client coordinates through it. */
var canvasStub = {
  width: 1600, height: 900, style: {},
  getContext: function () { return ctxStub; },
  addEventListener: function (n, fn) { (listeners[n] = listeners[n] || []).push(fn); },
  getBoundingClientRect: function () {
    return { left: 0, top: 0, width: 1600, height: 900, right: 1600, bottom: 900 };
  }
};

var listeners = {};
var rafQueue = [];
var clock = 0;

global.window = {
  innerWidth: 1600, innerHeight: 900, devicePixelRatio: 1,
  addEventListener: function (n, fn) { (listeners[n] = listeners[n] || []).push(fn); }
};
global.performance = { now: function () { return clock; } };
global.location = { hash: '#kawartha' };
global.history = { replaceState: function () {} };
global.requestAnimationFrame = function (fn) { rafQueue.push(fn); return rafQueue.length; };
global.document = {
  readyState: 'complete',
  getElementById: function () { return canvasStub; },
  addEventListener: function () {}
};
global.prompt = function () { return 'kawartha'; };

/* A fake localStorage, so the save slots, the autosave and the options
 * preferences are reachable headless — without it save.js correctly degrades
 * to "no save system" and the menu tests would pass by testing nothing.
 *
 * IT IS ON FOR THE WHOLE FILE, which is the condition a browser actually
 * runs under. It used to be installed only around the menu sections,
 * because switching it on globally broke the slipspace-corridor section
 * two thousand lines below: the charge phase never advanced and drawing
 * deep space read `.mu` off undefined. That was a real interaction between
 * the save system and the corridor, and it no longer reproduces — the
 * corridor's 32 checks pass with storage live, phase and all.
 *
 * So the workaround is gone rather than parameterised. A harness that runs
 * under conditions the game never sees is a harness that will miss the
 * next one of these, and the corridor check below ("the corridor is
 * flying") is now the thing standing guard over it. */
var fakeStore = {};
global.localStorage = {
  getItem: function (k) { return fakeStore[k] === undefined ? null : fakeStore[k]; },
  setItem: function (k, v) { fakeStore[k] = String(v); },
  removeItem: function (k) { delete fakeStore[k]; }
};
/* Kept as a no-op so the call sites below still read as "this section is
 * about the save system". Nothing can turn storage off any more. */
function withStorage() {}

/* Load in the same order index.html does. */
require('../src/vec3.js');
require('../src/rng.js');
/* Loaded EXPLICITLY, matching index.html's order. galaxy.js would pull it in
 * as a side effect anyway, which is how this harness happened to work before
 * the line existed — but a dependency that only holds because some other
 * module happens to require it first is a dependency waiting to break. */
require('../src/slipspace.js');
require('../src/kepler.js');
require('../src/economy.js');
require('../src/generate.js');
require('../src/galaxy.js');
require('../src/sim.js');
require('../src/combat.js');
require('../src/missions.js');
/* The campaign layer. It was missing here for as long as it has existed,
 * which is why the yard could hold a reward nobody could collect and no
 * render test noticed: screens.js guards every Arcs call with a
 * `global.Arcs &&`, so its absence read as "no campaigns running" rather
 * than as a harness that had never loaded the module. */
require('../src/arcs.js');
require('../src/sound.js');
require('../src/save.js');
require('../src/hulls.js');
require('../src/render.js');
require('../src/screens.js');
require('../src/main.js');

var W = global.window;
var G = W.Game;
var V = W.V, Sim = W.Sim, Galaxy = W.Galaxy, Eco = W.Economy;
/* Combat, because two sections now assert on what a port will and will not
 * open for, and reaching through W every time made those lines unreadable. */
var Combat = W.Combat;

check('the game booted', !!G && !!G.sys && !!G.ship, G ? 'no system' : 'no Game');
check('a galaxy was built around the seed', !!G.galaxy && G.galaxy.stars.length > 1);
check('the seed still lands in the original system', G.here.seed === 'kawartha');

/* Step one frame, and fail loudly on the error path main.js would
 * otherwise quietly paint onto the canvas. */
function frame(dt) {
  clock += (dt === undefined ? 16 : dt);
  var fn = rafQueue.pop();
  rafQueue.length = 0;
  if (!fn) throw new Error('no animation frame was scheduled');
  fn(clock);
}

function frames(n, dt) { for (var i = 0; i < n; i++) frame(dt); }

/* A NEW CAREER NOW STARTS ON A PAD, and almost every section below was
 * written when it started in a parking orbit. Rather than each one quietly
 * coping, they say what they need: `newFlying` starts a career and gets it
 * off the ground, `G.newGame` is left for the one section that is about the
 * opening state itself.
 *
 * This matters more than it looks. The three tests that failed when the
 * docked start landed were not testing docking at all — a wake chase, the
 * chase banner, and auto-dock — and none of them failed loudly. They ran
 * their guard loops to exhaustion, 6,433 and 8,000 frames apiece, and took
 * the whole suite past its time budget. A test that starts in the wrong
 * state does not usually announce it; it just gets slow and wrong. */
/* It is NOT enough to undock. The fresh career now berths at a port on the
 * planet's SURFACE, so undocking leaves the ship sitting just off a pad a
 * couple of hundred kilometres under the orbital station — which is a
 * completely different problem from the parking orbit these sections were
 * written against. Auto-dock, told to fly from there to the station, ran its
 * 6,279-frame guard out and reported nothing, and the failure said
 * "docked=null" rather than "your fixture moved".
 *
 * So this reproduces the OLD opening state exactly: the parking orbit
 * spawnShip used to leave you in, 93% of the station's orbital radius at the
 * station's own inclination. */
function newFlying(seed) {
  G.newGame(seed);
  frames(1);
  var host = G.spawnHost;
  var station = G.homeStation;
  G.ship.docked = null;
  G.ship.dockOffset = null;
  G.dockTarget = null;
  G.dockStatus = null;
  if (host) {
    var alt = (station && station.orbit)
      ? station.orbit.a * 0.93 - host.radius
      : host.radius * 0.55;
    if (alt < host.radius * 0.06) alt = host.radius * 0.25;
    var fresh = Sim.circularOrbit(host, G.sys, G.t, alt,
      (station && station.orbit) ? station.orbit.inc : 0.05, 0.6);
    G.ship.pos = fresh.pos; G.ship.vel = fresh.vel;
    G.ship.fwd = fresh.fwd; G.ship.up = fresh.up; G.ship.right = fresh.right;
    Sim.refreshShip(G.ship);
  }
  G.viewMode = 'orbit';
  frames(1);
}

function errorsSince(mark) {
  return drawn.texts.slice(mark).filter(function (t) { return t.indexOf('error:') === 0; });
}

/* ---- the opening state ---------------------------------------------------
 * The one section that wants a career exactly as a new player gets it, so
 * it calls G.newGame rather than newFlying. It runs before everything else
 * and leaves the world airborne so the sections after it see what they were
 * written against. */

function frame(dt) {
  clock += (dt === undefined ? 16 : dt);
  var fn = rafQueue.pop();
  rafQueue.length = 0;
  if (!fn) throw new Error('no animation frame was scheduled');
  fn(clock);
}
function frames(n, dt) { for (var i = 0; i < n; i++) frame(dt); }

function newFlying(seed) {
  G.newGame(seed);
  frames(1);
  var host = G.spawnHost, station = G.homeStation;
  G.ship.docked = null; G.ship.dockOffset = null;
  G.dockTarget = null; G.dockStatus = null;
  if (host) {
    var alt = (station && station.orbit) ? station.orbit.a * 0.93 - host.radius
                                         : host.radius * 0.55;
    if (alt < host.radius * 0.06) alt = host.radius * 0.25;
    var fresh = Sim.circularOrbit(host, G.sys, G.t, alt,
      (station && station.orbit) ? station.orbit.inc : 0.05, 0.6);
    G.ship.pos = fresh.pos; G.ship.vel = fresh.vel;
    G.ship.fwd = fresh.fwd; G.ship.up = fresh.up; G.ship.right = fresh.right;
    Sim.refreshShip(G.ship);
  }
  G.viewMode = 'orbit';
  frames(1);
}

function measure(label, setup, n) {
  newFlying('kawartha');
  frames(4);
  if (setup) setup();
  frames(4);                        // let anything cached settle
  drawn.texts.length = 0;
  var c0 = drawn.calls, t0 = drawn.texts.length;
  var wall = Date.now();
  frames(n || 60);
  var per = (drawn.calls - c0) / (n || 60);
  var txt = (drawn.texts.length - t0) / (n || 60);
  console.log(pad(label, 38) + pad(Math.round(per), 9) +
              pad(Math.round(txt), 8) + pad(((Date.now() - wall) / (n || 60)).toFixed(2) + ' ms', 10));
  return per;
}
function pad(s, n) { s = String(s); while (s.length < n) s = s + ' '; return s; }

/* WHERE INSIDE THE COCKPIT, which is the only question worth asking once
 * the view total is known. Wrap each Render entry point the cockpit uses
 * and attribute every context call made underneath it. */
var bill = {};
['drawCockpitShell', 'drawCockpitInterior', 'drawGlass', 'drawProjectionWash',
 'drawAttitudeLadder', 'drawFlightPathMarker', 'drawBankScale', 'drawHoloTarget'
].forEach(function (name) {
  var fn = W.Render[name];
  if (!fn) return;
  W.Render[name] = function () {
    var c0 = drawn.calls;
    var out = fn.apply(this, arguments);
    bill[name] = (bill[name] || 0) + (drawn.calls - c0);
    return out;
  };
});
/* The dash pages are main.js's, drawn into the three screens set in the
 * console — billed together by clearing the ledger around the interior
 * call is not possible from out here, so they land inside
 * drawCockpitInterior's share where they belong. */

console.log(pad('', 38) + pad('calls/f', 9) + pad('texts', 8) + 'js/frame');
console.log(new Array(66).join('-'));

var orbit = measure('orbit view, band up', function () {
  G.viewMode = 'orbit'; G.panel = 0; G.cockpitChrome = 0;
});
var cockpit = measure('cockpit, chrome off (band only)', function () {
  G.viewMode = 'cockpit'; G.panel = 0; G.cockpitChrome = 1;
});
var full = measure('cockpit, full chrome', function () {
  G.viewMode = 'cockpit'; G.panel = 0; G.cockpitChrome = 0;
  G.showCockpitFrame = true;
});
var noframe = measure('cockpit, interior but no shell', function () {
  G.viewMode = 'cockpit'; G.panel = 0; G.cockpitChrome = 0;
  G.showCockpitFrame = false;
});
console.log(new Array(66).join('-'));
console.log('cockpit costs ' + (full / orbit).toFixed(2) + 'x the orbit view');
console.log('the shell alone is ' + Math.round(full - noframe) + ' calls/frame');

console.log('');
console.log('--- inside one full-chrome cockpit frame ---');
newFlying('kawartha');
frames(4);
G.viewMode = 'cockpit'; G.panel = 0; G.cockpitChrome = 0; G.showCockpitFrame = true;
frames(4);
bill = {};
var N = 60, c0 = drawn.calls;
frames(N);
var total = (drawn.calls - c0) / N;
Object.keys(bill).sort(function (a, b) { return bill[b] - bill[a]; })
  .forEach(function (k) {
    var per = bill[k] / N;
    console.log('  ' + pad(k, 26) + pad(Math.round(per), 8) +
                (per / total * 100).toFixed(1) + '%');
  });
console.log('  ' + pad('(everything else)', 26) +
            pad(Math.round(total - Object.keys(bill).reduce(function (s2, k) {
              return s2 + bill[k] / N; }, 0)), 8));
console.log('  ' + pad('TOTAL', 26) + Math.round(total));
