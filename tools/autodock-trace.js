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


/* Fly the autopilot at a port and watch the range. An approach that works
 * is monotone once it is past the turnaround; an approach that swings is
 * one where the range goes back up after it has come down. */
function trace(port, startKm, off, label) {
  var ps = Sim.bodyState(port, G.sys, G.t);
  G.ship.docked = null; G.ship.landed = false;
  G.cruise = null; G.autodock = null; G.dockTarget = null;
  G.ship.pos = V.addScaled(ps.pos, V.norm(off), startKm);
  G.ship.vel = V.clone(ps.vel);
  Sim.refreshShip(G.ship);
  G.navTarget = { kind: 'body', id: port.id };
  frames(1);
  var keydown = listeners.keydown[0];
  keydown({ key: 't', shiftKey: false, preventDefault: function () {} });
  keydown({ key: 't', shiftKey: false, preventDefault: function () {} });
  if (!G.autodock) { console.log(label + ': autopilot refused'); return; }

  var hist = [], guard = 0, minR = Infinity, swings = 0, lastR = Infinity, rising = false;
  while (!G.ship.docked && G.autodock && guard++ < 20000) {
    frame();
    var s2 = Sim.bodyState(port, G.sys, G.t);
    var r = V.dist(G.ship.pos, s2.pos);
    if (r < minR) minR = r;
    /* A swing is the range turning back UP by more than a tenth after it
     * has already been inside four capture radii — the part of the
     * approach where it should only ever be coming down. */
    if (r < port.dockCaptureRadius * 6) {
      if (r > lastR * 1.10 && !rising) { rising = true; swings++; }
      else if (r < lastR) rising = false;
      lastR = r;
    }
    if (guard % 200 === 0) hist.push(r.toFixed(2));
  }
  console.log(pad(label, 30) +
              pad(G.ship.docked ? 'DOCKED' : (G.autodock ? 'gave up' : 'cancelled'), 11) +
              pad(guard + ' f', 10) + pad('closest ' + minR.toFixed(2) + ' km', 22) +
              'swings ' + swings + (swings ? '   ' + hist.slice(-14).join(' ') : ''));
}
function pad(s, n) { s = String(s); while (s.length < n) s = s + ' '; return s; }

newFlying('kawartha');
frames(2);
var orbital = G.sys.ports.filter(function (p) { return !p.surface && p.docking; });
var surface = G.sys.ports.filter(function (p) { return p.surface; });
console.log('orbital ports: ' + orbital.length + ', surface: ' + surface.length);
[260, 1200, 12000].forEach(function (km) {
  newFlying('kawartha'); frames(2);
  var p = orbital[0];
  if (p) trace(p, km, { x: 1, y: 0.3, z: 0.2 }, 'orbital, ' + km + ' km');
});
['mule', 'kestrel'].forEach(function (hid) {
  newFlying('kawartha'); frames(2);
  G.ship.credits = 9e6;
  Combat.buyHull(G, hid);
  Sim.refreshShip(G.ship);
  var p = orbital[0];
  if (p) trace(p, 1200, { x: 1, y: 0.3, z: 0.2 }, hid + ', 1200 km');
});
/* --- surface pads, placed relative to the WORLD -----------------------
 * A start position measured from the PAD is meaningless on a big world:
 * 900 km from a pad on a 3,700 km planet, in an arbitrary direction, is
 * underground. Everything below is placed from the host's centre. */
function traceGround(port, altKm, side, label) {
  var host = port.parentBody;
  newFlying('kawartha'); frames(2);
  var ps = Sim.bodyState(port, G.sys, G.t);
  var hp = Sim.bodyPosition(host, G.sys, G.t);
  var padUp = V.norm(V.sub(ps.pos, hp));
  var dir;
  if (side === 'over') dir = padUp;
  else if (side === 'far') dir = V.scale(padUp, -1);
  else {                                   // 90 degrees round
    var any = Math.abs(padUp.z) < 0.9 ? { x: 0, y: 0, z: 1 } : { x: 1, y: 0, z: 0 };
    dir = V.norm(V.cross(padUp, any));
  }
  G.ship.docked = null; G.ship.landed = false;
  G.cruise = null; G.autodock = null; G.dockTarget = null;
  G.ship.pos = V.addScaled(hp, dir, host.radius + altKm);
  G.ship.vel = V.clone(ps.vel);
  Sim.refreshShip(G.ship);
  G.navTarget = { kind: 'body', id: port.id };
  frames(1);
  var kd = listeners.keydown[0];
  kd({ key: 't', shiftKey: false, preventDefault: function () {} });
  kd({ key: 't', shiftKey: false, preventDefault: function () {} });
  if (!G.autodock) { console.log(pad(label, 34) + 'autopilot refused'); return; }
  var guard = 0, minAlt = Infinity;
  while (!G.ship.docked && !G.ship.landed && G.autodock && guard++ < 25000) {
    frame();
    var a = V.dist(G.ship.pos, Sim.bodyPosition(host, G.sys, G.t)) - host.radius;
    if (a < minAlt) minAlt = a;
  }
  console.log(pad(label, 34) +
              pad(G.ship.docked ? 'DOCKED' : G.ship.landed ? 'CRASHED/LANDED'
                  : G.autodock ? 'gave up' : 'cancelled', 16) +
              pad(guard + ' f', 10) + 'lowest ' + minAlt.toFixed(1) + ' km');
}
console.log('');
console.log('--- pads, from every side of the world ---');
surface.forEach(function (p, i) {
  var tag = 'pad ' + i + ' (' + (p.underground ? 'shaft' : 'open') +
            ', r=' + p.parentBody.radius.toFixed(0) + ')';
  ['over', 'side', 'far'].forEach(function (sd) {
    traceGround(p, p.parentBody.radius * 0.3, sd, tag + ' ' + sd + ', high');
  });
  traceGround(p, 4, 'far', tag + ' far, LOW');
});
