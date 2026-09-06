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
var drawn = { texts: [], calls: 0 };

function makeCtx() {
  var noop = function () { drawn.calls++; };
  var ctx = {
    canvas: null,
    save: noop, restore: noop, beginPath: noop, closePath: noop,
    moveTo: noop, lineTo: noop, quadraticCurveTo: noop, bezierCurveTo: noop,
    arc: noop, arcTo: noop, ellipse: noop, rect: noop,
    fill: noop, stroke: noop, clip: noop,
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
 * It is installed around those sections rather than for the whole file, on
 * purpose. Leaving it on globally changes what the rest of the suite is
 * running against: every dock starts actually serialising a career, and with
 * it switched on the slipspace-corridor section below fails (the charge
 * phase never advances, and drawing deep space reads `.mu` off undefined).
 * That looks like a real interaction between the save system and the
 * corridor and it is worth chasing — but it is not this file's job to change
 * the conditions the existing tests were written under while chasing it. */
var fakeStore = {};
var realStorage = global.localStorage;
function withStorage(on) {
  if (on) {
    global.localStorage = {
      getItem: function (k) { return fakeStore[k] === undefined ? null : fakeStore[k]; },
      setItem: function (k, v) { fakeStore[k] = String(v); },
      removeItem: function (k) { delete fakeStore[k]; }
    };
  } else {
    global.localStorage = realStorage;
  }
}

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
require('../src/sound.js');
require('../src/save.js');
require('../src/hulls.js');
require('../src/render.js');
require('../src/screens.js');
require('../src/main.js');

var W = global.window;
var G = W.Game;
var V = W.V, Sim = W.Sim, Galaxy = W.Galaxy, Eco = W.Economy;

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

function errorsSince(mark) {
  return drawn.texts.slice(mark).filter(function (t) { return t.indexOf('error:') === 0; });
}

function scenario(name, setup, count) {
  var mark = drawn.texts.length;
  var callsBefore = drawn.calls;
  var threw = null;
  try {
    if (setup) setup();
    frames(count || 3);
  } catch (e) {
    threw = e;
  }
  var errs = errorsSince(mark);
  check(name, !threw && errs.length === 0,
        threw ? (threw.message + ' | ' + String(threw.stack).split('\n')[1]) : errs[0]);
  check(name + ' — actually drew something', drawn.calls > callsBefore + 50,
        (drawn.calls - callsBefore) + ' calls');
}

console.log('--- exterior view ---');
scenario('orbit view renders', function () { G.viewMode = 'orbit'; }, 4);
scenario('orbit view with prediction and grid off', function () {
  G.showPrediction = false; G.showGrid = false; G.showOrbits = false;
}, 2);
scenario('orbit view with everything on', function () {
  G.showPrediction = true; G.showGrid = true; G.showOrbits = true;
}, 2);

console.log('--- cockpit ---');
scenario('cockpit renders', function () { G.viewMode = 'cockpit'; }, 4);

/* Look all the way round in both axes. This is the case that did not exist
 * before free look and that the near-plane clipping is there to survive:
 * at wide angles the canopy has corners in front of the eye and behind it
 * in the same polygon. */
var angles = [-2.3, -1.8, -1.2, -0.6, -0.2, 0, 0.2, 0.6, 1.2, 1.8, 2.3];
var lookBad = 0, lookThrew = null;
var lookMark = drawn.texts.length;
try {
  for (var ai = 0; ai < angles.length; ai++) {
    for (var pi = -1; pi <= 1; pi++) {
      G.look.yaw = angles[ai];
      G.look.pitch = pi * 1.1;
      frame();
    }
  }
} catch (e) { lookThrew = e; }
check('the cockpit survives every head angle',
      !lookThrew && errorsSince(lookMark).length === 0,
      lookThrew ? lookThrew.message : errorsSince(lookMark)[0]);
G.look.yaw = 0; G.look.pitch = 0;

scenario('cockpit with the interior hidden', function () { G.showCockpitFrame = false; }, 2);
scenario('cockpit with the interior shown', function () { G.showCockpitFrame = true; }, 2);

/* ---- the screens set into the dashboard --------------------------------
 * These are real quads on the console with flat pages mapped onto them, so
 * there are two separate things to pin: that the geometry comes back sane
 * at every window size and head angle, and that the affine fit actually
 * lands the page's own pixel space on the panel's corners. A panel that
 * projects but maps wrong is a panel with its contents smeared off the
 * console, and it would look like nothing at all in a screenshot. */
console.log('--- dashboard panels ---');
(function () {
  var cam = new W.Render.Camera();
  var missing = 0, wrongSpace = 0, badQuad = 0, noEmitter = 0, seen = {};
  var sizes = [[1600, 900], [1280, 800], [1024, 768], [3840, 2160], [900, 1600]];
  var heads = [[0, 0], [0.5, 0.2], [-0.9, -0.4], [1.6, 0.9], [-2.2, -1.1]];

  sizes.forEach(function (d) {
    heads.forEach(function (hd) {
      cam.buildCockpit(G.ship, d[0], d[1], { yaw: hd[0], pitch: hd[1] });
      var inner = W.Render.drawCockpitInterior(ctxStub, cam, G.ship, d[0], d[1]);
      if (!inner || !inner.mfds) { missing++; return; }
      if (inner.emitters.length !== inner.mfds.length) noEmitter++;
      /* A panel drops out the moment one of its corners passes behind the
       * eye, which is what turning your head does to the far end of the
       * console. The bezel is projected the same way and goes with it, so a
       * screen and its surround vanish together rather than leaving half a
       * panel smeared across the dash. Facing forward all three must be
       * there; turned, the near ones still must be. */
      if (Math.abs(hd[0]) < 0.1 && inner.mfds.length !== 3) missing++;
      if (Math.abs(hd[0]) < 1.0 && inner.mfds.length < 2) missing++;
      inner.mfds.forEach(function (p) {
        seen[p.id] = true;
        if (p.w !== 460 || p.h !== 178) wrongSpace++;
        if (p.quad.length !== 4) { badQuad++; return; }
        for (var i = 0; i < 4; i++) {
          if (!isFinite(p.quad[i].x) || !isFinite(p.quad[i].y)) badQuad++;
        }
      });
    });
  });

  check('all three panels exist whenever the console is in front of you', missing === 0, missing + ' bad');
  check('every panel is left, centre or right',
        !!(seen.left && seen.centre && seen.right), Object.keys(seen).join(','));

  /* And the two on the bulkhead, which only exist because the seat now
   * turns all the way round. Facing forward they must NOT be drawn — they
   * are behind the eye and projecting them anyway is how a panel ends up
   * smeared across the sky. */
  cam.buildCockpit(G.ship, 1600, 900, { yaw: 0, pitch: 0 });
  var fwdIds = W.Render.drawCockpitInterior(ctxStub, cam, G.ship, 1600, 900)
    .mfds.map(function (p) { return p.id; });
  check('the rear panels are not drawn while you face front',
        fwdIds.indexOf('rear-left') < 0 && fwdIds.indexOf('rear-right') < 0, fwdIds.join(','));

  var rearSeen = {};
  [Math.PI, -Math.PI, 2.7, -2.7].forEach(function (yaw) {
    cam.buildCockpit(G.ship, 1600, 900, { yaw: yaw, pitch: 0 });
    W.Render.drawCockpitInterior(ctxStub, cam, G.ship, 1600, 900)
      .mfds.forEach(function (p) { rearSeen[p.id] = true; });
  });
  check('turning right round finds both bulkhead panels',
        !!(rearSeen['rear-left'] && rearSeen['rear-right']), Object.keys(rearSeen).join(','));
  check('every panel offers the same flat page space the console pages use',
        wrongSpace === 0, wrongSpace + ' wrong');
  check('every projected corner is finite at every head angle', badQuad === 0, badQuad + ' bad');
  check('every panel gets a light emitter for the glass wash', noEmitter === 0, noEmitter + ' bad');

  /* The affine fit itself: (0,0) must land on the top-left corner, (w,0) on
   * the top-right, and (0,h) on the bottom-left. */
  cam.buildCockpit(G.ship, 1600, 900, { yaw: 0, pitch: 0 });
  var panels = W.Render.drawCockpitInterior(ctxStub, cam, G.ship, 1600, 900).mfds;
  var rec = makeCtx(), got = null;
  rec.transform = function (a, b, c, d, e, f) { got = [a, b, c, d, e, f]; };
  var panel = panels[1];
  var began = W.Render.mfdBegin(rec, panel);
  check('a forward-facing panel is big enough to draw on', began === true);
  if (began) W.Render.mfdEnd(rec);

  function at(x, y) {
    return { x: got[0] * x + got[2] * y + got[4], y: got[1] * x + got[3] * y + got[5] };
  }
  function near(p, q) { return Math.hypot(p.x - q.x, p.y - q.y) < 0.5; }
  check('page origin lands on the panel top-left', !!got && near(at(0, 0), panel.quad[0]));
  check('page right edge lands on the panel top-right',
        !!got && near(at(panel.w, 0), panel.quad[1]));
  check('page bottom edge lands on the panel bottom-left',
        !!got && near(at(0, panel.h), panel.quad[3]));
})();

/* And the pages themselves are on them — the titles are the cheapest proof
 * that the panel content actually ran, rather than the panels being three
 * empty rectangles that project beautifully. */
(function () {
  G.viewMode = 'cockpit';
  G.showCockpitFrame = true;
  G.panel = 0;
  var mark = drawn.texts.length;
  frame();
  var texts = drawn.texts.slice(mark);
  function count(s) { return texts.filter(function (t) { return t === s; }).length; }
  check('the orbit page is drawn on the dashboard', count('ORBIT') >= 1);
  check('the target page is drawn on the dashboard', count('TARGET') >= 1);
  check('the scope is drawn twice: on the dash and on the flat band',
        count('SCOPE') >= 2, count('SCOPE') + ' times');
  check('and the frame still had no errors in it', errorsSince(mark).length === 0,
        errorsSince(mark)[0]);

  /* Clicking a panel changes what it shows. The click targets are the
   * bounding boxes of the projected quads, replayed into the hotspot list
   * after the console rebuilds it — a rebuild that used to throw them away,
   * which is a bug you cannot see in a screenshot. */
  var panelHots = G.hotspots.filter(function (s) { return s.hint === 'click to change this panel'; });
  check('every visible panel is clickable', panelHots.length === 3, panelHots.length + ' targets');
  var before = G.dashPages.centre;
  var pages = {};
  for (var n = 0; n < 12 && panelHots.length; n++) {
    panelHots.forEach(function (s) { s.fn(); });
    pages[G.dashPages.centre] = true;
  }
  check('clicking walks a panel through the pages',
        Object.keys(pages).length > 4, Object.keys(pages).join(','));
  check('and comes back round to where it started', !!pages[before]);
  G.dashPages.centre = before;

  /* The aft view is a page like any other, so it must survive being put on
   * a panel you are looking straight at — and it must actually draw the
   * picture rather than an empty bezel. */
  var aftMark = drawn.texts.length;
  G.dashPages.centre = 'aft';
  frame();
  var aftTexts = drawn.texts.slice(aftMark);
  check('the aft view can be put on any panel',
        aftTexts.indexOf('AFT') !== -1, aftTexts.slice(0, 6).join(' | '));
  check('and it renders without error', errorsSince(aftMark).length === 0,
        errorsSince(aftMark)[0]);
  /* It reports what is behind you: either a nearest contact or, honestly,
   * that there is nothing there. */
  check('it says what is astern',
        aftTexts.some(function (t) { return /^nearest |^nothing astern$/.test(t); }),
        aftTexts.join(' | ').slice(0, 120));
  G.dashPages.centre = 'orbit';

  /* The whole point of the rear pair: turn round and they are there. */
  G.look.yaw = Math.PI;
  var rearMark = drawn.texts.length;
  frame();
  var rearHots = G.hotspots.filter(function (s) { return s.hint === 'click to change this panel'; });
  check('the bulkhead panels are clickable once you turn round', rearHots.length >= 1,
        rearHots.length + ' targets');
  check('and looking behind you renders cleanly', errorsSince(rearMark).length === 0,
        errorsSince(rearMark)[0]);
  G.look.yaw = 0;
  frame();
})();

console.log('--- every screen, in both views ---');
(function () {
  /* The user-facing layout, in order. If this list and the one in main.js
   * ever disagree, one of them is a lie about what F5 does. */
  var labels = ['FLIGHT', 'SYSTEM', 'NAV', 'COMMS', 'SHIP', 'GALAXY',
                'MISSIONS', 'JUMP', 'AIM', 'NODES'];
  ['cockpit', 'orbit'].forEach(function (mode) {
    G.viewMode = mode;
    for (var p = 0; p < labels.length; p++) {
      G.panel = p;
      scenario(labels[p] + ' screen (' + mode + ')', null, 2);
    }
  });
  G.starMap = null;
  G.panel = 0;

  /* The icon bar is the whole navigation model of the ship, so the keys
   * that drive it are worth asserting rather than assuming. Function keys
   * first, digits as the fallback for browsers with opinions about F1. */
  var keydown = listeners.keydown[0];
  G.panel = 0;
  keydown({ key: 'F5', shiftKey: false, preventDefault: function () {} });
  check('F5 opens ship status and inventory', G.panel === 4, String(G.panel));
  keydown({ key: '9', shiftKey: false, preventDefault: function () {} });
  check('the number row does the same thing', G.panel === 8, String(G.panel));
  keydown({ key: 'Escape', shiftKey: false, preventDefault: function () {} });
  check('Escape comes back to the cockpit from anywhere', G.panel === 0, String(G.panel));
  keydown({ key: 'F3', shiftKey: false, preventDefault: function () {} });
  keydown({ key: 'F1', shiftKey: false, preventDefault: function () {} });
  check('and so does F1', G.panel === 0, String(G.panel));

  /* Every slot in the bar reports a hit box, and clicking it selects that
   * screen. A bar of labelled buttons you can only reach from the keyboard
   * is a keyboard shortcut wearing a costume. */
  frames(1);
  var bar = G.hotspots.filter(function (s) { return s.hint === 'GALAXY'; });
  check('the icon bar offers itself to the mouse', bar.length === 1,
        bar.length + ' GALAXY hot spots');
  if (bar.length) {
    var mousedown = listeners.mousedown[0];
    mousedown({ clientX: bar[0].x + bar[0].w / 2, clientY: bar[0].y + bar[0].h / 2 });
    check('clicking a slot opens that screen', G.panel === 5, String(G.panel));
    keydown({ key: 'Escape', shiftKey: false, preventDefault: function () {} });
  }
  G.panel = 0;
  G.starMap = null;
})();

console.log('--- F1 flips the camera, F2 is the orbit map ---');
var MODES_COUNT = 10;   // slots in the icon bar; hotspots beyond these are content
(function () {
  var keydown = listeners.keydown[0];
  function press(k) { keydown({ key: k, shiftKey: false, preventDefault: function () {} }); }

  // F1 from a screen returns to flight without touching the view...
  G.panel = 4;
  G.viewMode = 'orbit';
  press('F1');
  check('F1 from a screen returns to flight', G.panel === 0 && G.viewMode === 'orbit');

  // ...and F1 again flips cockpit/exterior, both ways.
  press('F1');
  check('F1 again enters the cockpit', G.viewMode === 'cockpit');
  G.cam.dist = 50000;                   // parked way out at system scale
  press('F1');
  check('F1 flips back out to a chase camera', G.viewMode === 'orbit');
  check('and parks it close enough to see the hull', G.cam.dist < 1,
        G.cam.dist + ' km');
  press('F1');
  check('the number row does the same flip', (press('1'), G.viewMode === 'orbit'));

  // F2: the boot view — world drawn, orbits forced, camera borrowed.
  G.viewMode = 'cockpit';
  G.showOrbits = false;                 // even with the toggle off
  var distBefore = G.cam.dist;
  var mark = drawn.texts.length;
  var callsBefore = drawn.calls;
  press('F2');
  check('F2 opens the orbit map', G.panel === 1);
  check('the map is an exterior view whatever you were doing', G.viewMode === 'orbit');
  frames(3);
  check('it draws the world, not a data screen', drawn.calls - callsBefore > 3000,
        (drawn.calls - callsBefore) + ' calls');
  check('and renders cleanly with orbits forced on', errorsSince(mark).length === 0,
        errorsSince(mark)[0]);
  check('the body list offers itself to the mouse', G.hotspots.length > MODES_COUNT,
        G.hotspots.length + ' hotspots');

  press('Escape');
  check('leaving the map hands the camera back',
        G.panel === 0 && G.viewMode === 'cockpit' && G.cam.dist === distBefore,
        G.viewMode + ' at ' + G.cam.dist);
  G.showOrbits = true;
  frames(2);
})();

console.log('--- the hull library ---');
(function () {
  var R = W.Render;
  var lib = W.HullLib;
  var ids = R.hullIds();

  check('the library imported every model', ids.length >= 24, ids.length + ' models');

  /* Every imported model obeys the renderer's contract: unit length on its
   * longest axis, centred on the origin, a colour for every face, and an
   * emissive engine glow somewhere — the converter promises all of this,
   * and a regenerated hulls.js that breaks the promise should fail here,
   * not as a black shape in the sky. */
  var allGood = true, allLit = true, detail = '';
  for (var i = 0; i < ids.length; i++) {
    var mesh = R.libHull(ids[i]);
    var mins = [1e9, 1e9, 1e9], maxs = [-1e9, -1e9, -1e9];
    for (var vi = 0; vi < mesh.v.length; vi++) {
      for (var a = 0; a < 3; a++) {
        if (mesh.v[vi][a] < mins[a]) mins[a] = mesh.v[vi][a];
        if (mesh.v[vi][a] > maxs[a]) maxs[a] = mesh.v[vi][a];
      }
    }
    var longest = Math.max(maxs[0] - mins[0], maxs[1] - mins[1], maxs[2] - mins[2]);
    var centred = Math.abs(maxs[0] + mins[0]) < 0.05 &&
                  Math.abs(maxs[1] + mins[1]) < 0.05 &&
                  Math.abs(maxs[2] + mins[2]) < 0.05;
    if (Math.abs(longest - 1) > 0.02 || !centred ||
        mesh.c.length !== mesh.f.length || mesh.v.length < 200) {
      allGood = false; detail += ids[i] + ' ';
    }
    if (!mesh.c.some(function (c) { return c && c.charAt(0) === '!'; })) {
      allLit = false;
    }
  }
  check('every model is unit-length, centred, and fully painted', allGood, detail || 'all 24');
  check('every model has a lit engine somewhere', allLit);

  /* The casting table only ever points at models that exist, and the
   * classes the game actually flies all resolve to imported hulls. */
  var assignedOk = true;
  for (var kind in R.HULL_ASSIGN) {
    if (!lib[R.HULL_ASSIGN[kind]]) { assignedOk = false; detail = kind; }
  }
  check('every assignment points at a real model', assignedOk, detail);
  check('the classes in service fly imported hulls',
        R.shipMeshes().courier.v.length > 500 &&
        R.shipMeshes().police.v.length > 500 &&
        R.shipMeshes().pirate.v.length > 500);
  check('reassignment by ID works and rejects nonsense',
        R.assignHull('pirate', 'fighter-s') === true &&
        R.shipMeshes().pirate === R.libHull('fighter-s') &&
        R.assignHull('pirate', 'no-such-model') === false);
  R.assignHull('pirate', 'fighter-m');   // put the casting back

  // It all draws, in both views, without complaint.
  G.panel = 0;
  var mark = drawn.texts.length;
  ['orbit', 'cockpit'].forEach(function (v) {
    G.viewMode = v;
    frames(3);
  });
  check('imported hulls render in both views', errorsSince(mark).length === 0, errorsSince(mark)[0]);
  G.viewMode = 'orbit';

  /* Registrations: deterministic, formatted, and on the ships. */
  var Sim2 = W.Sim;
  check('a registration is stable and shaped like one',
        Sim2.regCode('t7') === Sim2.regCode('t7') &&
        /^[A-Z]{2}-\d{4}$/.test(Sim2.regCode('t7')), Sim2.regCode('t7'));
  check('different ships read differently',
        Sim2.regCode('t7') !== Sim2.regCode('t8'));
  var anyShip = Sim2.shipsAll(G.sys, G.t)[0];
  check('traffic carries its registration', !!(anyShip && anyShip.reg), anyShip && anyShip.reg);
  check('and so do you', /^[A-Z]{2}-\d{4}$/.test(G.ship.reg || ''), G.ship.reg);
})();

console.log('--- the hold, and throwing things out of it ---');
(function () {
  var keydown = listeners.keydown[0];
  var mousedown = listeners.mousedown[0];
  var mark = drawn.texts.length;

  G.ship.cargo = { grain: 12, robotics: 4, waste: 6 };
  Sim.refreshShip(G.ship);
  G.ship.docked = null;
  G.panel = 4;                       // ship status and inventory
  G.invSel = 0;
  frames(2);
  check('the inventory renders a full hold', errorsSince(mark).length === 0, errorsSince(mark)[0]);

  /* Every cargo line offers two eject controls, and NOTHING else on the
   * screen does. Fitted equipment is listed on the same screen precisely so
   * that the absence of a button next to it is visible. */
  var ejects = G.hotspots.filter(function (s) {
    return s.hint === 'EJECT 1t' || s.hint === 'EJECT ALL';
  });
  check('each cargo gets an eject control, and only cargo does',
        ejects.length === 6, ejects.length + ' controls for 3 cargoes');

  var massBefore = Sim.cargoMass(G.ship);
  var one = G.hotspots.filter(function (s) { return s.hint === 'EJECT 1t'; })[0];
  mousedown({ clientX: one.x + 2, clientY: one.y + 2 });
  check('clicking eject drops exactly one tonne',
        Math.abs(Sim.cargoMass(G.ship) - (massBefore - 1)) < 1e-6,
        massBefore + ' -> ' + Sim.cargoMass(G.ship));
  check('and the ship got lighter for it', G.ship.mass < massBefore + G.ship.dryMass + 1e9);

  /* It goes somewhere. A canister on your old trajectory is the difference
   * between deleting cargo and jettisoning it. */
  var cans = Sim.canistersAll(G.sys);
  check('the tonnage becomes a canister in space', cans.length === 1,
        cans.length + ' canisters');
  if (cans.length) {
    check('the canister knows what it is', cans[0].tonnes === 1 && !!cans[0].cid);
    check('and it was pushed clear of the ship',
          V.dist(cans[0].pos, G.ship.pos) > 0 &&
          V.dist(cans[0].vel, G.ship.vel) > 0);
  }

  // Shift+Delete empties the selected line.
  G.invSel = 0;
  var sel = Object.keys(G.ship.cargo).length;
  keydown({ key: 'Delete', shiftKey: true, preventDefault: function () {} });
  check('Shift+Del ejects the whole line',
        Object.keys(G.ship.cargo).length === sel - 1,
        sel + ' -> ' + Object.keys(G.ship.cargo).length);

  frames(60);
  check('canisters survive being simulated', errorsSince(mark).length === 0, errorsSince(mark)[0]);

  G.ship.cargo = {};
  G.sys.canisters = [];
  Sim.refreshShip(G.ship);
  G.panel = 0;
  frames(2);
})();

console.log('--- the yard, the board, and a fight on screen ---');
(function () {
  var mark = drawn.texts.length;
  var mousedown = listeners.mousedown[0];
  var port = G.sys.ports[0];

  // Dock, with an empty hold, and open the ship screen: the yard is there.
  G.ship.cargo = {};
  Sim.refreshShip(G.ship);
  Sim.dockShip(G.ship, port, G.sys, G.t);
  G.panel = 4;
  frames(2);
  check('the yard renders while docked', errorsSince(mark).length === 0, errorsSince(mark)[0]);

  /* The yard is three tabs now — FIT what is bolted on, BUY the stock, HULLS
   * the ships. Only one is drawn at a time, so asking the default tab for a
   * missile rack finds nothing and says so as "0 buttons", which reads like
   * a dead shop rather than a tab that isn't open. Walk them. */
  var yardBtns = [];
  ['fit', 'buy', 'hulls'].forEach(function (tab) {
    G.yardTab = tab;
    frames(2);
    check('the ' + tab.toUpperCase() + ' tab renders', errorsSince(mark).length === 0,
          errorsSince(mark)[0]);
    yardBtns = yardBtns.concat(G.hotspots.filter(function (s) {
      return s.hint && /HAWK|TURRET|SHIELD|MULE|DART|KESTREL/.test(s.hint);
    }));
  });
  check('it sells weapons and hulls', yardBtns.length >= 3, yardBtns.length + ' buttons');

  /* Buying happens on BUY, so be on it before clicking the rack. */
  G.yardTab = 'buy';
  frames(2);
  var missile = G.hotspots.filter(function (s) { return s.hint && /HAWK/.test(s.hint); })[0];
  if (missile) {
    G.ship.credits = 10000;
    var had = G.ship.missiles;
    mousedown({ clientX: missile.x + 2, clientY: missile.y + 2 });
    check('clicking the rack buys a missile', G.ship.missiles === had + 1,
          had + ' -> ' + G.ship.missiles);
  }

  // The board, and a signature on it.
  G.panel = 6;
  frames(2);
  check('the mission board renders while docked', errorsSince(mark).length === 0, errorsSince(mark)[0]);
  var acceptBtn = G.hotspots.filter(function (s) { return s.hint === 'ACCEPT'; })[0];
  check('the board offers contracts', !!acceptBtn);
  if (acceptBtn) {
    var before = (G.missions || []).length;
    mousedown({ clientX: acceptBtn.x + 2, clientY: acceptBtn.y + 2 });
    check('clicking ACCEPT signs the contract', (G.missions || []).length === before + 1);
  }

  // Undocked again: comms carries the piracy submenu for ship contacts.
  Sim.undockShip(G.ship, G.sys, G.t, 0.003);
  G.dockTarget = null;
  G.panel = 3;
  frames(2);
  var contacts = W.Screens.commsContacts();
  var shipIdx = -1;
  for (var ci = 0; ci < contacts.length; ci++) {
    if (contacts[ci].kind === 'ship' && !contacts[ci].hostile) { shipIdx = ci; break; }
  }
  check('there is a ship to lean on', shipIdx >= 0);
  if (shipIdx >= 0) {
    G.commsSel = shipIdx;
    frames(2);
    var pir = G.hotspots.filter(function (s) { return s.hint === 'Piracy…'; })[0];
    check('the piracy option is on the channel', !!pir);
    if (pir) {
      mousedown({ clientX: pir.x + 2, clientY: pir.y + 2 });
      frames(2);
      var demands = G.hotspots.filter(function (s) { return /^Demand /.test(s.hint || ''); });
      check('it opens onto the two demands', demands.length === 2, demands.length + ' options');
      var never = G.hotspots.filter(function (s) { return s.hint === 'Never mind'; })[0];
      if (never) mousedown({ clientX: never.x + 2, clientY: never.y + 2 });
    }
  }

  // Combat visuals paint without complaint.
  G.panel = 0;
  var nowS = performance.now() / 1000;
  G.beams = [{ from: V.clone(G.ship.pos),
               to: V.addScaled(V.clone(G.ship.pos), G.ship.fwd, 8),
               color: '#ff6b5a', until: nowS + 5 }];
  G.explosions = [{ pos: V.addScaled(V.clone(G.ship.pos), G.ship.fwd, 5),
                    at: performance.now(), size: 2 }];
  G.sys.missiles = [{ pos: V.addScaled(V.clone(G.ship.pos), G.ship.fwd, 3),
                      vel: V.addScaled(V.clone(G.ship.vel), G.ship.fwd, 0.2),
                      target: { live: { pos: V.clone(G.ship.pos), vel: V.clone(G.ship.vel) } },
                      dmg: 1, accel: 0.01, born: G.t, dies: G.t + 2, fuse: 0.0001 }];
  ['cockpit', 'orbit'].forEach(function (v) { G.viewMode = v; frames(3); });
  check('beams, missiles and explosions draw in both views',
        errorsSince(mark).length === 0, errorsSince(mark)[0]);

  // The status column reports the fighting numbers.
  G.viewMode = 'orbit';
  G.wanted = { somefac: 900 };
  G.ship.hullHp = 40;
  frames(2);
  check('hull and warrants reach the status column',
        drawn.texts.indexOf('hull') !== -1 && drawn.texts.indexOf('WANTED') !== -1,
        'hull=' + (drawn.texts.indexOf('hull') !== -1) +
        ' wanted=' + (drawn.texts.indexOf('WANTED') !== -1) +
        ' err=' + (drawn.texts.filter(function (t) { return t.indexOf('error:') === 0; })[0] || 'none'));

  G.wanted = {};
  G.ship.hullHp = G.ship.hullMax;
  G.sys.missiles = [];
  G.beams = [];
  G.missions = [];
  frames(2);
})();

console.log('--- underground bays ---');
(function () {
  G.newGame('kawartha');
  frames(2);
  var mark = drawn.texts.length;
  var callsBefore = drawn.calls;

  /* 'kawartha' has at least one underground bay by construction (see the
   * independent 'underground-bays' RNG stream in generate.js), but this
   * searches rather than hardcodes a name — a name is cosmetic and this
   * test should survive a rename even though it could not survive a
   * reseed of that stream. */
  var bay = null;
  for (var i = 0; i < G.sys.bodies.length; i++) {
    if (G.sys.bodies[i].underground) { bay = G.sys.bodies[i]; break; }
  }
  check('the seeded system has an underground bay to test against', !!bay);
  if (!bay) return;

  var world = bay.parentBody;
  var worldPos = Sim.bodyPosition(world, G.sys, G.t);
  var mouth = Sim.portEntrance(bay, G.sys, G.t);
  var truePos = Sim.bodyPosition(bay, G.sys, G.t);

  check('the entrance sits exactly on the visible surface',
        Math.abs(V.dist(mouth.pos, worldPos) - world.radius) < 1e-6);
  check('the bay itself sits shaftDepth below that, on the same radial line',
        Math.abs((world.radius - V.dist(truePos, worldPos)) - bay.shaftDepth) < 1e-6);
  check('entrance and bay line up on the same axis through the world centre',
        V.len(V.cross(V.norm(V.sub(mouth.pos, worldPos)), V.norm(V.sub(truePos, worldPos)))) < 1e-6);

  // Dock: the ship should end up genuinely inside the shaft, not merely
  // hovering at the visible surface the way an open pad would — dockShip
  // and updateDockedShip need no bay-specific code at all for this to be
  // true, since elevation was already generic (see sim.js).
  G.ship.landed = false; G.ship.crashed = false; G.ship.landedOn = null;
  G.ship.cargo = {};
  Sim.refreshShip(G.ship);
  Sim.dockShip(G.ship, bay, G.sys, G.t);
  check('docking an underground bay latches onto it', G.ship.docked === bay.id);
  var shipDepth = world.radius - V.dist(G.ship.pos, worldPos);
  check('the docked ship sits below the surface, inside the shaft',
        shipDepth > bay.shaftDepth * 0.5, shipDepth + ' vs shaftDepth ' + bay.shaftDepth);

  // Render it, in both views, while docked.
  G.dockTarget = bay;
  G.panel = 0;
  ['cockpit', 'orbit'].forEach(function (v) { G.viewMode = v; frames(3); });
  check('an underground bay renders without error while docked, in both views',
        errorsSince(mark).length === 0, errorsSince(mark)[0]);
  check('it actually drew something', drawn.calls > callsBefore + 50);

  // Undock: the push-off should be back UP the shaft, toward the surface.
  var beforeUndock = world.radius - V.dist(G.ship.pos, worldPos);
  Sim.undockShip(G.ship, G.sys, G.t, 0.003);
  G.dockTarget = null;
  check('undocking clears the docked flag', G.ship.docked === null);
  var afterUndock = world.radius - V.dist(G.ship.pos, worldPos);
  check('undocking climbs back toward the surface, not further down',
        afterUndock < beforeUndock, beforeUndock + ' -> ' + afterUndock);

  /* From well outside, the bay must draw at its ENTRANCE and not float in
   * front of the planet at its true, buried position — the whole reason
   * stationFrame() and the world body-list hang it from the mouth instead
   * of from Sim.bodyPosition. If this regresses, the bay would appear to
   * hover in open space in front of the world's near side. */
  G.ship.landed = false; G.ship.crashed = false; G.ship.landedOn = null;
  G.ship.pos = V.addScaled(worldPos, V.norm(V.sub(mouth.pos, worldPos)), world.radius * 6);
  G.ship.vel = V.zero();
  Sim.refreshShip(G.ship);
  G.viewMode = 'orbit';
  G.cam.dist = world.radius * 9;
  G.cam.target = V.clone(worldPos);
  frames(3);
  check('viewed from well outside, the system still renders cleanly with a buried bay present',
        errorsSince(mark).length === 0, errorsSince(mark)[0]);

  G.panel = 0;
  G.viewMode = 'cockpit';
  frames(2);
})();

console.log('--- mouse aim ---');
(function () {
  var keydown = listeners.keydown[0];
  var mousedown = listeners.mousedown[0];
  var mousemove = listeners.mousemove[0];
  var mouseup = listeners.mouseup[0];

  G.panel = 0;
  G.viewMode = 'cockpit';
  G.mouseAim = false;
  G.look.yaw = 0;
  frames(2);

  // Head mode: the drag turns your head and leaves the nose alone.
  var fwd0 = V.clone(G.ship.fwd);
  mousedown({ clientX: 800, clientY: 450 });
  mousemove({ clientX: 900, clientY: 450 });
  mouseup({});
  frames(2);
  check('in head mode the drag turns the head', Math.abs(G.look.yaw) > 1e-6);
  check('and leaves the nose where it was', V.dist(fwd0, G.ship.fwd) < 1e-6);

  // Aim mode: the drag flies the ship and leaves your head alone.
  G.look.yaw = 0;
  keydown({ key: 'F9', shiftKey: false, preventDefault: function () {} });
  keydown({ key: 'Enter', shiftKey: false, preventDefault: function () {} });
  check('Enter on the aim screen switches modes', G.mouseAim === true);
  keydown({ key: 'Escape', shiftKey: false, preventDefault: function () {} });
  frames(2);

  fwd0 = V.clone(G.ship.fwd);
  mousedown({ clientX: 800, clientY: 450 });
  mousemove({ clientX: 900, clientY: 450 });
  mouseup({});
  frames(6);
  check('in aim mode the drag points the nose', V.dist(fwd0, G.ship.fwd) > 1e-6);
  check('and does not turn the head', Math.abs(G.look.yaw) < 1e-9);

  // And it settles rather than spinning forever.
  frames(120);
  var spin = Math.abs(G.ship.angRate.yaw) + Math.abs(G.ship.angRate.pitch);
  check('the commanded rate decays once the mouse stops', spin < 0.02, spin.toFixed(4));

  G.mouseAim = false;
  G.look.yaw = 0;
  G.viewMode = 'orbit';
  frames(2);
})();

console.log('--- navigation lock ---');
(function () {
  var mark = drawn.texts.length;
  // Lock each kind of thing in turn: a body, a station, and a ship.
  var station = G.sys.ports[0];
  var planet = G.sys.bodies.filter(function (b) { return b.kind === 'planet'; })[0];
  var ships = Sim.shipsAll(G.sys, G.t);

  G.navTarget = { kind: 'body', id: planet.id };
  G.panel = 2;                       // the navigation screen, so the lock is on it
  frames(2);
  check('a locked planet resolves', !!G.navTarget);

  G.navTarget = { kind: 'body', id: station.id };
  frames(2);
  check('a locked station resolves', !!G.navTarget);

  if (ships.length) {
    G.navTarget = { kind: 'ship', id: ships[0].id };
    frames(2);
    check('a locked ship resolves', !!G.navTarget);
  }

  // A lock on something that no longer exists must clear itself rather
  // than throwing every frame forever.
  G.navTarget = { kind: 'ship', id: 'no-such-ship' };
  frames(2);
  check('a stale lock releases itself', G.navTarget === null);

  check('no errors while locked on', errorsSince(mark).length === 0, errorsSince(mark)[0]);
})();

console.log('--- dialogs ---');
scenario('the star chart renders', function () {
  G.starMap = { sel: 0, list: [] };
}, 3);
check('the territory legend actually drew a faction name',
      G.galaxy.factions.some(function (f) { return drawn.texts.indexOf(f.name) !== -1; }));
scenario('the star chart with a far selection', function () {
  G.starMap.sel = 40;
}, 2);
scenario('closing the chart', function () { G.starMap = null; }, 1);

scenario('the trade console renders', function () {
  G.ship.cargo.ores = 12;
  Sim.refreshShip(G.ship);
  G.market = { port: G.sys.ports[0], sel: 0 };
}, 3);
scenario('the trade console scrolled down', function () { G.market.sel = 9; }, 2);
scenario('closing the trade console', function () {
  G.market = null;
  delete G.ship.cargo.ores;
  Sim.refreshShip(G.ship);
}, 1);

scenario('the help card renders', function () { G.showHelp = true; }, 2);
scenario('closing the help card', function () { G.showHelp = false; }, 1);

console.log('--- states ---');
scenario('docked', function () {
  var port = G.sys.ports[0];
  var ps = Sim.bodyState(port, G.sys, G.t);
  G.ship.pos = V.clone(ps.pos);
  G.ship.vel = V.clone(ps.vel);
  Sim.dockShip(G.ship, port, G.sys, G.t);
}, 3);
scenario('undocked again', function () {
  Sim.undockShip(G.ship, G.sys, G.t, 0.003);
  G.dockTarget = null;
}, 2);

scenario('landed', function () {
  G.ship.landed = true;
  G.ship.crashed = true;
  G.ship.landedOn = G.sys.bodies.filter(function (b) { return b.kind === 'planet'; })[0];
  G.ship.impactSpeed = 1.2;
}, 2);
scenario('flying again', function () {
  G.newGame('kawartha');
}, 3);

scenario('out of reaction mass', function () {
  G.ship.thrusterFuel = 0;
  G.ship.fuelOut = true;
  Sim.refreshShip(G.ship);
}, 2);
scenario('out of jump fuel', function () {
  G.ship.fuel = 0;
  Sim.refreshShip(G.ship);
  G.starMap = { sel: 0, list: [] };
}, 2);
scenario('refuelled', function () {
  G.starMap = null;
  G.ship.fuel = G.ship.fuelCap;
  G.ship.thrusterFuel = G.ship.thrusterCap;
  G.ship.fuelOut = false;
  Sim.refreshShip(G.ship);
}, 2);

console.log('--- an encounter, drawn ---');
(function () {
  var mark = drawn.texts.length;
  var pirate = (G.sys.patrols || []).filter(function (p) { return p.kind === 'pirate'; })[0];
  if (!pirate) { check('a pirate exists to draw', false); return; }
  var rail = Sim.patrolState(pirate, G.sys, G.t);
  G.ship.pos = V.addScaled(rail.pos, { x: 1, y: 0, z: 0 }, 600);
  G.ship.vel = V.clone(rail.vel);
  G.ship.cargo.rare = 20;
  Sim.refreshShip(G.ship);
  G.viewMode = 'cockpit';
  frames(6);
  check('an encounter renders in the cockpit', errorsSince(mark).length === 0, errorsSince(mark)[0]);
  G.viewMode = 'orbit';
  frames(4);
  check('an encounter renders in the exterior view', errorsSince(mark).length === 0, errorsSince(mark)[0]);
})();

console.log('--- a jump, end to end ---');
(function () {
  G.newGame('kawartha');
  frames(2);
  var before = G.here.id, t0 = G.t, fuel0 = G.ship.fuel;
  var reach = Galaxy.reachable(G.galaxy, G.here, G.ship);
  check('somewhere is reachable from the start', reach.length > 0);
  var plan = Galaxy.jumpPlan(G.galaxy, G.here, reach[0].star, G.ship);
  var mark = drawn.texts.length;
  /* Drive the real key handler through the real flow: F6 opens the chart,
   * Enter lays in the course, F8 brings up the drive, Enter engages it.
   * Plotting and engaging are two acts on two screens now — pressing Enter
   * on a list should not be able to move you eight light years. */
  var keydown = listeners.keydown[0];
  keydown({ key: 'F6', shiftKey: false, preventDefault: function () {} });
  frames(1);
  check('F6 opens the chart', !!G.starMap);
  keydown({ key: 'Enter', shiftKey: false, preventDefault: function () {} });
  frames(1);
  check('laying in a course does not itself jump', !G.hyper);
  check('and it moves you to the drive screen', G.panel === 7, String(G.panel));
  keydown({ key: 'Enter', shiftKey: false, preventDefault: function () {} });
  frames(2);

  /* The jump is a sequence now, not an assignment. It should still be
   * running several frames in — a jump you cannot see is the thing this
   * replaced. */
  check('engaging the drive starts the transit rather than teleporting', !!G.hyper);
  check('and it drops you back into the cockpit to watch', G.panel === 0, String(G.panel));

  var sawCharge = false, sawTunnel = false, sawExit = false;
  var clockRose = false, lastClock = G.hyper ? G.hyper.clock : 0;
  var guard = 0;
  while (G.hyper && guard++ < 2000) {
    if (G.hyper.phase === 'charge') sawCharge = true;
    if (G.hyper.phase === 'tunnel') sawTunnel = true;
    if (G.hyper.phase === 'exit') sawExit = true;
    if (G.hyper.clock > lastClock) clockRose = true;
    lastClock = G.hyper.clock;
    frame();
  }
  check('the transit runs all three phases', sawCharge && sawTunnel && sawExit,
        [sawCharge, sawTunnel, sawExit].join(','));
  check('the date visibly runs forward during it', clockRose);
  check('and it ends', !G.hyper, guard + ' frames');
  check('it took a few seconds, not a frame', guard > 60, guard + ' frames');

  check('the jump moved us to another star', G.here.id !== before, G.here.id);
  check('the clock advanced by the transit time',
        Math.abs((G.t - t0) - plan.seconds) < 1, ((G.t - t0) / 86400).toFixed(2) + ' d');
  check('it cost jump fuel', G.ship.fuel < fuel0,
        fuel0.toFixed(1) + ' -> ' + G.ship.fuel.toFixed(1) + ' t');
  check('we arrived in a real system', !!G.sys && G.sys.bodies.length > 3);
  check('the arrival rendered cleanly', errorsSince(mark).length === 0, errorsSince(mark)[0]);

  // And the system we left is remembered rather than regenerated.
  check('the system we left is cached', !!G.systemCache[before]);
})();

console.log('--- the tunnel, drawn ---');
(function () {
  G.newGame('kawartha');
  frames(2);
  var reach = Galaxy.reachable(G.galaxy, G.here, G.ship);
  var plan = Galaxy.jumpPlan(G.galaxy, G.here, reach[0].star, G.ship);

  // Both views, all the way through, with the head turned.
  ['cockpit', 'orbit'].forEach(function (mode) {
    G.newGame('kawartha');
    frames(2);
    G.viewMode = mode;
    G.look.yaw = mode === 'cockpit' ? 0.9 : 0;
    var mark = drawn.texts.length;
    var callsBefore = drawn.calls;
    var threw = null, guard = 0;
    try {
      doJumpViaMap();
      while (G.hyper && guard++ < 2000) frame();
    } catch (e) { threw = e; }
    check('the tunnel renders in ' + mode + ' view',
          !threw && errorsSince(mark).length === 0,
          threw ? threw.message + ' | ' + String(threw.stack).split('\n')[1] : errorsSince(mark)[0]);
    check('and it drew a great deal in ' + mode, drawn.calls > callsBefore + 5000,
          (drawn.calls - callsBefore) + ' calls');
    G.look.yaw = 0;
  });

  /* The real route to a jump: chart, course, drive, engage. Four keys, and
   * every one of them goes through the same handler the player's does. */
  function doJumpViaMap() {
    var press = function (k) {
      listeners.keydown[0]({ key: k, shiftKey: false, preventDefault: function () {} });
    };
    press('F6'); frame();
    press('Enter'); frame();
    press('Enter'); frame();
  }

  // Controls are dead in the tunnel: nothing you press should fly the ship.
  G.newGame('kawartha');
  frames(2);
  doJumpViaMap();
  frames(3);
  check('a jump is under way', !!G.hyper);
  if (G.hyper) {
    var beforeKeys = JSON.stringify(G.keys);
    ['w', 'ArrowUp', 'm', 'j', 't', '1'].forEach(function (k) {
      listeners.keydown[0]({ key: k, shiftKey: false, preventDefault: function () {} });
    });
    check('the controls are dead in transit',
          JSON.stringify(G.keys) === beforeKeys && !G.market && !G.starMap);
    var g2 = 0;
    while (G.hyper && g2++ < 2000) frame();
  }

  // The renderer itself, poked at every phase directly.
  var Render = W.Render;
  var threw2 = null;
  try {
    [0, 0.2, 0.5, 0.8, 1].forEach(function (I) {
      [0, 0.5, 1].forEach(function (fl) {
        W.Render.drawHyperspace(ctxStub, 1600, 900,
          { time: I * 7, intensity: I, flash: fl, twist: I * 3 });
      });
    });
  } catch (e) { threw2 = e; }
  check('drawHyperspace survives every intensity and flash', !threw2, threw2 && threw2.message);

  // The streaks belong to the tunnel, not to the frame: same set every time.
  var a = W.Render.hyperStars(), b = W.Render.hyperStars();
  check('the tunnel is the same tunnel every jump', a === b && a.length > 100,
        a.length + ' streaks');
  check('depth maps to screen radius monotonically',
        W.Render.hyperRadius(0.2, 100) < W.Render.hyperRadius(0.6, 100) &&
        W.Render.hyperRadius(0.6, 100) < W.Render.hyperRadius(1.0, 100));
})();

/* ---- the corridor, flown --------------------------------------------------
 * The unit tests in slipspace.test.js prove the arithmetic. What they cannot
 * see is whether the game draws it, whether the three live keys reach it, and
 * whether being torn out lands you somewhere the renderer can cope with. That
 * is what this harness is for — it boots the real main.js and fails on any
 * frame that paints an error.
 *
 * A live corridor needs traffic, and traffic is a function of when you leave.
 * Rather than hunt the timetable for a busy moment, the corridor is opened
 * normally and then given contacts directly: what is under test here is the
 * flying and the drawing, not whether the schedule cooperated. */
console.log('--- the slipspace corridor ---');
(function () {
  var Slip = W.Slipspace;
  check('slipspace is loaded into the game', !!Slip);
  if (!Slip) return;

  /* Snapshot the display and flight preferences, and put them back at the
   * end of this block.
   *
   * These sections all share one global G, and the options-menu test far
   * below is order-dependent in a way that is easy to break by accident:
   * ArrowRight on a toggle SETS it true rather than flipping it, so a toggle
   * only registers a change on the first pass over the list, and the test
   * survives its later passes only because earlier sections have left the
   * volume and sensitivity sliders sitting on their stops. Any new block
   * that calls newGame — this one calls it five times — can move those and
   * make a test two thousand lines away fail for no visible reason.
   *
   * Restoring rather than resetting is the point: this block should be
   * invisible to everything after it. */
  var prefsBefore = {
    soundVolume: G.soundVolume, soundMuted: G.soundMuted,
    showOrbits: G.showOrbits, showPrediction: G.showPrediction,
    showGrid: G.showGrid, showTraffic: G.showTraffic,
    cockpitChrome: G.cockpitChrome, assist: G.assist,
    flightMode: G.flightMode, mouseAim: G.mouseAim,
    aimSens: G.aimSens, showHelp: G.showHelp
  };

  function press(k) {
    listeners.keydown[0]({ key: k, shiftKey: false, preventDefault: function () {} });
  }
  function release(k) {
    listeners.keyup[0]({ key: k, preventDefault: function () {} });
  }
  function jumpViaMap() { press('F6'); frame(); press('Enter'); frame(); press('Enter'); frame(); }

  /* Give the corridor somebody soft to catch, and somebody hunting us. */
  function populate(cor, opts) {
    opts = opts || {};
    cor.contacts = [];
    if (opts.victim !== false) {
      cor.contacts.push({
        id: 'v', name: 'Halcyon Drover', cls: 'freighter', className: 'freighter',
        color: '#d8c79a', tonnes: 620, hullClass: 'III', anchor: null, baffle: null,
        sameWay: true, hostile: false, progress: 0.02, rate: 0
      });
    }
    if (opts.hunter) {
      cor.contacts.push({
        id: 'h', name: 'The Shrike', cls: 'pirate', className: 'interdictor',
        color: '#ff8a76', tonnes: 180, hullClass: 'I', anchor: null, baffle: null,
        sameWay: true, hostile: true, progress: 0.0, rate: 0
      });
    }
    cor.live = true;
    return cor;
  }

  /* --- it draws, in both views, with the head turned ------------------- */
  ['cockpit', 'orbit'].forEach(function (mode) {
    G.newGame('kawartha');
    frames(2);
    G.viewMode = mode;
    G.look.yaw = mode === 'cockpit' ? 0.8 : 0;
    jumpViaMap();
    check('a jump started (' + mode + ')', !!G.hyper);
    if (!G.hyper) return;
    populate(G.hyper.corridor, { hunter: true });
    var mark = drawn.texts.length;
    var threw = null, guard = 0;
    try {
      // Long enough to get through charge and well into the corridor.
      while (G.hyper && guard++ < 400) frame();
    } catch (e) { threw = e; }
    check('the corridor renders in ' + mode + ' view',
          !threw && errorsSince(mark).length === 0,
          threw ? threw.message + ' | ' + String(threw.stack).split('\n')[1]
                : errorsSince(mark)[0]);
    G.look.yaw = 0;
  });

  /* --- the three live keys, and only those three ----------------------- */
  G.newGame('kawartha');
  frames(2);
  jumpViaMap();
  if (G.hyper) {
    populate(G.hyper.corridor);
    frames(140);                      // clear the 1.5 s charge phase
    var cor = G.hyper.corridor;
    check('the corridor is flying', G.hyper.phase === 'tunnel', G.hyper.phase);

    var t0 = cor.throttle;
    press('.');
    frames(20);
    check('. opens the throttle', cor.throttle > t0,
          t0.toFixed(2) + ' -> ' + cor.throttle.toFixed(2));
    release('.');
    var held = cor.throttle;
    frames(20);
    check('and the throttle is a lever, not a momentary key',
          Math.abs(cor.throttle - held) < 1e-6,
          held.toFixed(3) + ' -> ' + cor.throttle.toFixed(3));
    press(',');
    frames(40);
    release(',');
    check(', closes it again', cor.throttle < held, cor.throttle.toFixed(2));

    /* Everything else must still be dead. Pressing F6 mid-corridor should
     * not open a chart, and w should not fly the ship. */
    press('w'); press('F6'); press('1');
    frames(2);
    check('steering is still dead in the corridor', !G.keys['w']);
    check('and the screens are still locked out', !G.starMap && G.panel === 0,
          String(G.panel));

    var g3 = 0;
    while (G.hyper && g3++ < 4000) frame();
    check('the corridor terminates', !G.hyper, g3 + ' frames');
  }

  /* --- interdicting somebody, and landing in deep space ---------------- */
  G.newGame('kawartha');
  frames(2);
  var fuelBefore = G.ship.fuel;
  jumpViaMap();
  if (G.hyper) {
    populate(G.hyper.corridor);
    frames(140);
    var cor2 = G.hyper.corridor;
    var victim = cor2.contacts[0];
    var mark2 = drawn.texts.length;
    press(' ');
    var g4 = 0;
    /* Hold station on them, which is what a pilot achieves with the
     * throttle — pinned here so the test is about the lock, not the flying. */
    while (G.hyper && g4++ < 6000) {
      cor2.progress = victim.progress;
      frame();
    }
    release(' ');
    check('holding the trigger alongside tears them out', !G.hyper && !!G.sys,
          g4 + ' frames');
    check('and lands us in interstellar space', !!G.sys && G.sys.interstellar === true,
          G.sys && G.sys.name);
    check('which has exactly one body in it — a distant sun',
          !!G.sys && G.sys.bodies.length === 1, G.sys && String(G.sys.bodies.length));
    check('nobody is stranded: there is fuel to reach it',
          G.ship.fuel > 0, G.ship.fuel.toFixed(2) + ' t');
    check('the victim is there with us',
          !!G.sys && G.sys.patrols.length === 1,
          G.sys && String(G.sys.patrols.length));
    check('and we are pointed at them', !!G.navTarget);

    /* THE THING THE UNIT TESTS CANNOT SEE: does a place with no planets,
     * no ports and a star a light year away actually survive being drawn? */
    var threw3 = null;
    try { frames(30); } catch (e) { threw3 = e; }
    check('deep space renders without throwing',
          !threw3, threw3 && threw3.message + ' | ' + String(threw3.stack).split('\n')[1]);
    check('deep space renders without painting an error',
          errorsSince(mark2).length === 0, errorsSince(mark2)[0]);

    G.viewMode = 'orbit';
    var mark3 = drawn.texts.length;
    var threw4 = null;
    try { frames(20); } catch (e) { threw4 = e; }
    check('and from the exterior view too',
          !threw4 && errorsSince(mark3).length === 0,
          threw4 ? threw4.message : errorsSince(mark3)[0]);
    G.viewMode = 'cockpit';

    /* You must be able to leave. The chart is measured from where you
     * actually are, so the nearer star should be a cheap hop. */
    var out = W.Galaxy.reachable(G.galaxy, G.here, G.ship);
    check('somewhere is reachable from deep space', out.length > 0,
          String(out.length));
    check('and the jump out costs less than the one that got us here',
          out.length > 0 && out[0].distance < 3, out.length ? out[0].distance.toFixed(2) + ' ly' : '-');
  }

  /* --- being interdicted ----------------------------------------------- */
  G.newGame('kawartha');
  frames(2);
  jumpViaMap();
  if (G.hyper) {
    populate(G.hyper.corridor, { victim: false, hunter: true });
    frames(140);
    var cor3 = G.hyper.corridor;
    var hunter = cor3.contacts[0];
    var mark4 = drawn.texts.length;
    var g5 = 0;
    while (G.hyper && g5++ < 6000) {
      cor3.progress = hunter.progress;
      frame();
    }
    check('an unanchored ship is torn out by a hunter', !!G.sys && G.sys.interstellar === true,
          G.sys && G.sys.name);
    check('and the pirate is there waiting',
          !!G.sys && G.sys.patrols.length === 1 && G.sys.patrols[0].kind === 'pirate',
          G.sys && G.sys.patrols[0] && G.sys.patrols[0].kind);
    var threw5 = null;
    try { frames(30); } catch (e) { threw5 = e; }
    check('being interdicted renders cleanly',
          !threw5 && errorsSince(mark4).length === 0,
          threw5 ? threw5.message + ' | ' + String(threw5.stack).split('\n')[1]
                 : errorsSince(mark4)[0]);
  }

  /* --- an anchor turns the same hunter away ---------------------------- */
  G.newGame('kawartha');
  frames(2);
  G.ship.modules = { anchor: 'I', baffle: null };
  jumpViaMap();
  if (G.hyper) {
    check('the fitted anchor reached the corridor',
          G.hyper.corridor.anchor === 'I', String(G.hyper.corridor.anchor));
    populate(G.hyper.corridor, { victim: false, hunter: true });
    frames(140);
    var cor4 = G.hyper.corridor;
    var h4 = cor4.contacts[0];
    var g6 = 0;
    while (G.hyper && g6++ < 1200) { cor4.progress = h4.progress; frame(); }
    check('an anchored ship survives the same light interdictor',
          !!G.sys && !G.sys.interstellar,
          G.sys && G.sys.name);
  }

  /* Leave the world where the next section expects to find it. This block
   * can finish mid-corridor, in deep space, or with modules fitted, and every
   * later section shares one global G — an options-menu test two thousand
   * lines further down failed for exactly this reason, because its key
   * presses were being swallowed by a jump that was still running. */
  G.hyper = null;
  G.keys = {};
  G.newGame('kawartha');
  for (var pk in prefsBefore) G[pk] = prefsBefore[pk];
  frames(2);
})();

/* ---- wakes, drawn ---------------------------------------------------------
 * The red and blue clouds are the part of this feature the player actually
 * looks at, and drawing is exactly what the unit tests cannot check. */
console.log('--- slipspace wakes ---');
(function () {
  var Slip = W.Slipspace;
  if (!Slip) return;
  var prefs = { showTraffic: G.showTraffic, aimSens: G.aimSens,
                soundVolume: G.soundVolume, showHelp: G.showHelp };

  G.newGame('kawartha');
  frames(2);

  /* Find a moment when the home star actually has wakes. The timetable owes
   * us nothing at t=0, so search rather than assume. */
  var found = -1, wakes = [];
  for (var t = 0; t < 3000000 && found < 0; t += 5400) {
    var w = Slip.wakesAt(G.galaxy, G.here, t);
    if (w.length >= 2) { found = t; wakes = w; }
  }
  check('the home star has wakes at some point', found >= 0, String(found));
  if (found < 0) return;

  G.t = found;
  G.showTraffic = true;
  var mark = drawn.texts.length;
  var calls0 = drawn.calls;
  var threw = null;
  try { frames(4); } catch (e) { threw = e; }
  check('a sky with wakes in it renders',
        !threw && errorsSince(mark).length === 0,
        threw ? threw.message + ' | ' + String(threw.stack).split('\n')[1]
              : errorsSince(mark)[0]);
  check('and it drew something', drawn.calls > calls0 + 50,
        (drawn.calls - calls0) + ' calls');

  /* Park the ship right on a wake and check the caption appears and says
   * something specific. Being close is the whole scan mechanic — there is no
   * key for it — so this is the test that it works at all. */
  var sunPos = W.Sim.bodyPosition(G.sys.root, G.sys, G.t);
  var radius = Slip.jumpRingRadius(G.sys);
  check('the jump ring sits outside the system',
        radius > 0 && isFinite(radius), String(radius));
  var target = wakes[0];
  var wpos = Slip.wakePosition(target, sunPos, radius);
  G.ship.pos = { x: wpos.x + 500, y: wpos.y, z: wpos.z };
  G.ship.vel = { x: 0, y: 0, z: 0 };
  G.followShip = true;
  G.cam.target = { x: wpos.x, y: wpos.y, z: wpos.z };

  var mark2 = drawn.texts.length;
  var threw2 = null;
  try { frames(4); } catch (e) { threw2 = e; }
  var texts = drawn.texts.slice(mark2);
  check('sitting on a wake renders cleanly',
        !threw2 && errorsSince(mark2).length === 0,
        threw2 ? threw2.message + ' | ' + String(threw2.stack).split('\n')[1]
               : errorsSince(mark2)[0]);
  var captioned = texts.some(function (s) {
    return s === 'DEPARTURE WAKE' || s === 'ARRIVAL WAKE';
  });
  check('and the scanner captions it', captioned,
        texts.slice(0, 6).join(' | '));

  /* The read itself, through the same path the caption uses. */
  var read = Slip.scanWake(target, 500);
  check('a point-blank read names the destination', !!read.destination,
        read.note);
  check('and it is a real star in the galaxy',
        !!read.destination && !!G.galaxy.byId[read.destination.id],
        read.destination && read.destination.id);

  /* Far away, the same wake must tell us nothing — and still not throw. */
  G.ship.pos = { x: wpos.x + Slip.WAKE_SCAN_RANGE * 3, y: wpos.y, z: wpos.z };
  var mark3 = drawn.texts.length;
  var threw3 = null;
  try { frames(3); } catch (e) { threw3 = e; }
  check('a wake out of scan range renders without a caption',
        !threw3 && errorsSince(mark3).length === 0 &&
        !drawn.texts.slice(mark3).some(function (s) {
          return s === 'DEPARTURE WAKE' || s === 'ARRIVAL WAKE';
        }),
        threw3 ? threw3.message : errorsSince(mark3)[0]);

  /* Deep space has no lanes running through it, so it must produce no wakes
   * and no captions — and jumpRingRadius must still answer for a system with
   * nothing in orbit rather than dividing by a universe that is not there. */
  var deep = W.Gen.interstellarSystem(G.here);
  check('an interstellar locale still has a finite jump ring',
        isFinite(Slip.jumpRingRadius(deep)) && Slip.jumpRingRadius(deep) > 0,
        String(Slip.jumpRingRadius(deep)));

  G.newGame('kawartha');
  for (var k in prefs) G[k] = prefs[k];
  frames(2);
})();

console.log('--- the cruise drive ---');
(function () {
  G.newGame('kawartha');
  frames(2);
  var keydown = listeners.keydown[0];
  function press(k) { keydown({ key: k, shiftKey: false, preventDefault: function () {} }); }

  // Docked, it must refuse: you cannot spin a warp bubble up on the clamps.
  var port = G.sys.ports.filter(function (p) { return !p.surface; })[0];
  var ps = Sim.bodyState(port, G.sys, G.t);
  G.ship.pos = V.clone(ps.pos); G.ship.vel = V.clone(ps.vel);
  Sim.dockShip(G.ship, port, G.sys, G.t);
  frames(1);
  press('z');
  check('cruise refuses to engage on the clamps', !G.cruise);
  Sim.undockShip(G.ship, G.sys, G.t, 0.003);
  G.dockTarget = null;

  // Close to a planet, it must refuse: mass lock.
  var planet = G.sys.bodies.filter(function (b) { return b.kind === 'planet'; })[1];
  var bs = Sim.bodyState(planet, G.sys, G.t);
  G.ship.pos = V.addScaled(bs.pos, { x: 1, y: 0, z: 0 }, planet.radius * 1.4);
  G.ship.vel = V.clone(bs.vel);
  frames(1);
  press('z');
  check('cruise is mass locked close to a planet', !G.cruise);

  /* Well clear, it engages. Reset the hull properly first — the mass-lock
   * probe above parks the ship at 1.4 radii with no orbital velocity, which
   * is a controlled fall, and a ship that has hit the ground stays hit. */
  G.ship.landed = false;
  G.ship.crashed = false;
  G.ship.landedOn = null;
  G.ship.docked = null;
  G.ship.pos = V.addScaled(bs.pos, { x: 1, y: 0, z: 0 }, planet.radius * 60);
  G.ship.vel = V.clone(bs.vel);
  Sim.refreshShip(G.ship);
  frames(1);
  press('z');
  check('cruise engages in clear space', !!G.cruise);
  if (!G.cruise) return;

  var mark = drawn.texts.length;
  var startFuel = G.ship.thrusterFuel;
  var startPos = V.clone(G.ship.pos);
  var lastSpeed = G.cruise.speed;

  // Speed control, and the ceiling that comes with where you are.
  press('.'); press('.'); press('.');
  check('the speed keys open the throttle', G.cruise.speed > lastSpeed,
        lastSpeed.toFixed(0) + ' -> ' + G.cruise.speed.toFixed(0) + ' km/s');
  check('and never past the mass-lock ceiling', G.cruise.speed <= G.cruise.maxSpeed + 1e-6);

  // It flies, and it costs.
  ['cockpit', 'orbit'].forEach(function (mode) {
    G.viewMode = mode;
    frames(20);
  });
  check('cruise renders in both views', errorsSince(mark).length === 0, errorsSince(mark)[0]);
  check('cruise actually moves the ship', V.dist(G.ship.pos, startPos) > 1000,
        fmtKm(V.dist(G.ship.pos, startPos)));
  check('cruise burns reaction mass', G.ship.thrusterFuel < startFuel,
        (startFuel - G.ship.thrusterFuel).toFixed(3) + ' t');

  // Dropping out must leave a usable orbit, not a dead stop next to a well.
  press('z');
  check('cruise disengages', !G.cruise);
  var oe = Sim.oscElements(G.ship, G.sys, G.t);
  check('and drops you into an orbit rather than a fall',
        oe && oe.closed && oe.periAlt > 0,
        oe ? ('peri ' + fmtKm(oe.periAlt) + ' ecc ' + oe.e.toFixed(3)) : 'no elements');

  // Running the tank dry must drop you out rather than fly on for free.
  press('z');
  if (G.cruise) {
    G.ship.thrusterFuel = 2e-5;
    Sim.refreshShip(G.ship);
    var g = 0;
    while (G.cruise && g++ < 600) frame();
    check('an empty tank drops you out of cruise', !G.cruise, g + ' frames');
    check('and the tank really is empty', G.ship.thrusterFuel === 0);
  }
})();

console.log('--- auto-dock ---');
(function () {
  G.newGame('kawartha');
  frames(2);
  var keydown = listeners.keydown[0];
  function press(k) { keydown({ key: k, shiftKey: false, preventDefault: function () {} }); }

  var port = G.sys.ports.filter(function (p) { return !p.surface; })[0];
  var ps = Sim.bodyState(port, G.sys, G.t);

  // Sit a few hundred km off, drifting, and hand it over.
  G.ship.pos = V.addScaled(ps.pos, { x: 1, y: 0.3, z: 0.2 }, 260);
  G.ship.vel = V.addScaled(ps.vel, { x: 0, y: 1, z: 0 }, 0.05);
  G.ship.docked = null;
  Sim.refreshShip(G.ship);
  G.navTarget = { kind: 'body', id: port.id };
  frames(1);

  var mark = drawn.texts.length;
  press('t');                          // assign the clamp
  check('the first T assigns the docking clamp', G.dockTarget === port && !G.autodock);
  press('t');                          // and again to fly it
  check('the second T engages auto-dock', !!G.autodock);

  var guard = 0, startRange = V.dist(G.ship.pos, ps.pos);
  while (!G.ship.docked && G.autodock && guard++ < 12000) frame();
  check('it renders without error', errorsSince(mark).length === 0, errorsSince(mark)[0]);
  check('auto-dock actually docks the ship', G.ship.docked === port.id,
        'docked=' + G.ship.docked + ' after ' + guard + ' frames, from ' + fmtKm(startRange));
  check('and it flew there rather than teleporting', guard > 20, guard + ' frames');

  // A hand on the controls always wins.
  if (G.ship.docked) Sim.undockShip(G.ship, G.sys, G.t, 0.003);
  G.ship.docked = null;
  G.dockTarget = null;
  G.autodock = null;
  ps = Sim.bodyState(port, G.sys, G.t);
  G.ship.pos = V.addScaled(ps.pos, { x: 1, y: 0, z: 0 }, 220);
  G.ship.vel = V.clone(ps.vel);
  G.navTarget = { kind: 'body', id: port.id };
  frames(1);
  press('t'); press('t');
  check('auto-dock re-engages', !!G.autodock);
  G.keys.w = true;
  frames(2);
  check('any manual burn hands control back', !G.autodock);
  G.keys.w = false;
})();

/* ---- the other two autopilots -----------------------------------------
 * Match orbit and follow are the same guidance law with a different aim
 * point, so what has to be pinned is not the maths but the outcome: the
 * relative velocity actually goes to nothing, the hold actually holds, and
 * neither of them can be flown into the ground by a sign error. */
console.log('--- match orbit and follow ---');
(function () {
  G.newGame('kawartha');
  frames(2);
  var keydown = listeners.keydown[0];
  function press(k, shift) {
    keydown({ key: k, shiftKey: !!shift, ctrlKey: false, preventDefault: function () {} });
  }

  var port = G.sys.ports.filter(function (p) { return !p.surface; })[0];
  var ps = Sim.bodyState(port, G.sys, G.t);

  /* Sitting near it with 90 m/s of drift across — a flyby, not a
   * rendezvous, which is exactly the state match orbit exists for. */
  G.ship.pos = V.addScaled(ps.pos, { x: 1, y: 0.2, z: 0 }, 120);
  G.ship.vel = V.addScaled(ps.vel, { x: 0, y: 1, z: 0.3 }, 0.09);
  G.ship.docked = null;
  G.cruise = null; G.autodock = null;
  Sim.refreshShip(G.ship);
  G.navTarget = { kind: 'body', id: port.id };
  frames(1);

  var mark = drawn.texts.length;
  var relBefore = V.len(V.sub(G.ship.vel, ps.vel));
  press('t', true);
  check('Shift+T engages match orbit', !!G.autodock && G.autodock.mode === 'match');

  var guard = 0;
  while (G.autodock && guard++ < 8000) frame();
  var psNow = Sim.bodyState(port, G.sys, G.t);
  var relAfter = V.len(V.sub(G.ship.vel, psNow.vel));
  check('it finishes rather than running for ever', !G.autodock, guard + ' frames');
  check('and the relative velocity is gone', relAfter < 0.01,
        (relBefore * 1000).toFixed(1) + ' -> ' + (relAfter * 1000).toFixed(1) + ' m/s');
  check('matching renders without error', errorsSince(mark).length === 0, errorsSince(mark)[0]);

  /* Follow: put the ship a long way off station-keeping distance and check
   * it closes to the hold and then stays there rather than drifting on or
   * oscillating. */
  G.autodock = null;
  ps = Sim.bodyState(port, G.sys, G.t);
  G.ship.pos = V.addScaled(ps.pos, { x: 0.6, y: 0.8, z: 0 }, 400);
  G.ship.vel = V.clone(ps.vel);
  Sim.refreshShip(G.ship);
  G.navTarget = { kind: 'body', id: port.id };
  frames(1);
  var followMark = drawn.texts.length;
  press('l', true);
  check('Shift+L engages follow', !!G.autodock && G.autodock.mode === 'follow');

  var far = V.dist(G.ship.pos, ps.pos);
  for (var i = 0; i < 4000 && G.autodock; i++) frame();
  var near = V.dist(G.ship.pos, Sim.bodyState(port, G.sys, G.t).pos);
  check('follow is still flying — it is a mode, not an errand', !!G.autodock);
  check('and it closed the gap', near < far * 0.5, fmtKm(far) + ' -> ' + fmtKm(near));

  var held = near;
  for (i = 0; i < 1500 && G.autodock; i++) frame();
  var after = V.dist(G.ship.pos, Sim.bodyState(port, G.sys, G.t).pos);
  check('and then holds it rather than drifting off', Math.abs(after - held) < held * 0.6 + 5,
        fmtKm(held) + ' -> ' + fmtKm(after));
  check('following renders without error', errorsSince(followMark).length === 0,
        errorsSince(followMark)[0]);

  /* Shift+L must not also clear the lock — L on its own does that, and one
   * key doing both would make follow impossible to engage. */
  check('Shift+L left the nav lock alone', !!G.navTarget);
  G.autodock = null;

  /* Auto-dock from anywhere. It used to refuse past 300,000 km; now it
   * spins the cruise drive up itself, flies the leg, drops out near the
   * station and hands over to the approach law. Two million km away is the
   * case that used to be a refusal message. */
  G.newGame('kawartha');
  frames(2);
  var far2 = G.sys.ports.filter(function (p) { return !p.surface; })[0];
  var fs = Sim.bodyState(far2, G.sys, G.t);
  G.ship.pos = V.addScaled(fs.pos, { x: 0.8, y: 0.6, z: 0.1 }, 2.0e6);
  G.ship.vel = V.clone(fs.vel);
  G.ship.docked = null;
  G.cruise = null; G.autodock = null;
  Sim.refreshShip(G.ship);
  G.navTarget = { kind: 'body', id: far2.id };
  frames(1);

  var longMark = drawn.texts.length;
  var startFar = V.dist(G.ship.pos, fs.pos);
  press('t'); press('t');
  check('auto-dock engages from two million km out', !!G.autodock,
        'from ' + fmtKm(startFar));
  var sawCruise = false;
  for (i = 0; i < 30000 && G.autodock && !G.ship.docked; i++) {
    frame();
    if (G.cruise) sawCruise = true;
  }
  check('it used the cruise drive for the long leg', sawCruise);
  check('and it still docks at the end of it', G.ship.docked === far2.id,
        'docked=' + G.ship.docked + ' after ' + i + ' frames');
  check('the whole run renders without error', errorsSince(longMark).length === 0,
        errorsSince(longMark)[0]);
})();

function fmtKm(k) { return k > 1000 ? (k / 1000).toFixed(1) + ' Mm' : k.toFixed(1) + ' km'; }

/* ---- damage you can see from the seat ---------------------------------
 * Hull loss used to be a number on a page. A hit that reaches the hull can
 * now take a console screen with it, and it stays out until a yard
 * replaces the glass. Worth pinning: that it happens, that it can never
 * blind you completely, that a dead panel draws something rather than
 * nothing, and that the repair is a real transaction. */
console.log('--- damage in the cockpit ---');
(function () {
  G.newGame('kawartha');
  frames(2);
  G.viewMode = 'cockpit';
  G.showCockpitFrame = true;
  G.cockpitChrome = 1;
  G.deadPanels = {};
  var mark = drawn.texts.length;

  var hits = 0;
  for (var n = 0; n < 500 && W.Combat.deadPanelCount(G) < 4; n++) {
    W.Combat.damagePlayer(G, 12, G.hooks);
    G.ship.hullHp = G.ship.hullMax;      // keep it flying; we are testing glass
    G.ship.shieldHp = 0;
    hits++;
  }
  var dead = Object.keys(G.deadPanels).filter(function (k) { return G.deadPanels[k]; });
  check('hull hits eventually take a console screen out', dead.length > 0,
        dead.join(',') + ' after ' + hits + ' hits');
  check('but never every screen at once', dead.length <= 4,
        dead.length + ' of 5: ' + dead.join(','));

  G.look.yaw = 0;
  frames(2);
  var texts = drawn.texts.slice(mark);
  check('a dead panel says so where the pilot can see it',
        texts.indexOf('PANEL OUT') !== -1);
  check('and the cockpit still renders with screens out',
        errorsSince(mark).length === 0, errorsSince(mark)[0]);

  // The bill, and the fix.
  G.ship.hullHp = G.ship.hullMax;
  var cost = W.Combat.repairCost(G.ship, G);
  check('dead screens are on the repair bill', cost > 0,
        cost + ' cr for ' + dead.length + ' screens');
  G.ship.credits = cost + 1000;
  var paid = W.Combat.repair(G);
  check('paying it clears them', paid === cost && W.Combat.deadPanelCount(G) === 0,
        'paid ' + paid);

  // And it is damage, so it survives the save.
  G.deadPanels = { centre: true };
  var snap = W.Save.snapshot(G);
  check('the save carries the broken screen', !!(snap.deadPanels || {}).centre);
  G.deadPanels = {};
  W.Save.restore(G, snap, {});
  check('and a restored career still has it out', !!G.deadPanels.centre);
  G.deadPanels = {};
})();

/* ---- manoeuvre nodes, end to end --------------------------------------
 * The sim-level maths is checked analytically in test/nodes.test.js. What
 * cannot be checked there is the part that only exists once the real
 * main.js is running: that the keys reach the node, that the cursor takes
 * the mouse away from the camera, that a handle can be dragged, and that
 * the autopilot actually flies the plan rather than just claiming to. */
console.log('--- manoeuvre nodes ---');
(function () {
  G.newGame('kawartha');
  frames(2);
  var keydown = listeners.keydown[0];
  var keyup = listeners.keyup[0];
  function press(k, mods) {
    var e = { key: k, shiftKey: false, ctrlKey: false, preventDefault: function () {} };
    if (mods) for (var m in mods) e[m] = mods[m];
    keydown(e);
  }

  // A clean circular orbit to plan from, so the numbers are predictable.
  var planet = G.sys.bodies.filter(function (b) { return b.kind === 'planet'; })[1];
  G.ship = Sim.circularOrbit(planet, G.sys, G.t, 900);
  G.ship.docked = null;
  G.cruise = null; G.autodock = null;
  Sim.refreshShip(G.ship);
  frames(2);

  var mark = drawn.texts.length;
  press('i');
  check('I places a node', !!G.node, 'no node');
  frames(3);
  check('and the plan computes', !!G.nodePlan, 'no plan');
  check('a node with no delta-v predicts no new orbit', !G.nodeAfter);

  // Prograde is the first axis, so = adds to it straight away.
  var before = G.node.dv.pro;
  press('=');
  check('= adds prograde delta-v', G.node.dv.pro > before,
        before + ' -> ' + G.node.dv.pro);
  press('-'); press('-');
  check('and - takes it away again', G.node.dv.pro < before, String(G.node.dv.pro));
  press('='); press('='); press('=');   // settle on a real burn

  press('i');
  check('I again cycles the axis rather than placing a second node',
        G.nodeAxis === 1 && !!G.node, 'axis=' + G.nodeAxis);
  press('i'); press('i'); press('i');
  check('the axis cycle wraps back to prograde', G.nodeAxis === 0, 'axis=' + G.nodeAxis);

  press("'");
  check('apoapsis snap moves the node', G.node.t > G.t, 'node in the past');
  frames(3);
  check('the plan survives the snap', !!G.nodePlan && !!G.nodeAfter);
  check('the plan raises the orbit it was asked to raise',
        G.nodePlan.after.apoAlt > G.nodePlan.before.apoAlt,
        G.nodePlan.before.apoAlt + ' -> ' + G.nodePlan.after.apoAlt);
  check('and it costs a finite burn of real propellant',
        G.nodePlan.burn.duration > 0 && G.nodePlan.burn.fuel > 0,
        JSON.stringify(G.nodePlan.burn));
  check('ignition leads the node by half the burn',
        Math.abs((G.node.t - G.nodePlan.ignition) - G.nodePlan.burn.duration / 2) < 1e-9);

  G.panel = 9;
  frames(2);
  check('the NODE page renders the plan', errorsSince(mark).length === 0, errorsSince(mark)[0]);

  /* Back to the cockpit for the mouse. The handles are drawn on the world,
   * not on a screen, so they only exist while the world is what you are
   * looking at — and a drag on a full-screen mode deliberately does nothing
   * at all, because there is no camera visible to swing. */
  G.panel = 0;
  frames(2);

  /* The cursor. Without the modifier the mouse swings the camera; with it,
   * the camera must not move at all — that separation is the entire reason
   * the modifier exists, so it is worth asserting rather than assuming. */
  var mousemove = listeners.mousemove[0];
  var mousedown = listeners.mousedown[0];
  var mouseup = listeners.mouseup[0];

  G.viewMode = 'orbit';
  G.followShip = true;
  frames(2);
  var yawBefore = G.cam.yaw;
  mousedown({ clientX: 400, clientY: 400 });
  mousemove({ clientX: 460, clientY: 400 });
  mouseup({});
  check('without the modifier, dragging still swings the camera',
        G.cam.yaw !== yawBefore, 'yaw unchanged');

  keydown({ key: 'Alt', location: 1, preventDefault: function () {} });
  check('left Alt raises the cursor', G.cursor.active);
  yawBefore = G.cam.yaw;
  mousedown({ clientX: 400, clientY: 400 });
  mousemove({ clientX: 520, clientY: 430 });
  mouseup({});
  check('and with it the mouse no longer touches the camera',
        G.cam.yaw === yawBefore, 'camera moved under the cursor');

  // Now actually grab a handle. The renderer publishes their screen
  // positions each frame, which is the only way to know where they are.
  frames(3);
  var handles = G.nodeHandles;
  check('the handles are offered to the mouse while the cursor is out',
        !!handles && handles.length === 3, handles ? handles.length + ' handles' : 'none');
  if (handles && handles.length) {
    var h = handles.filter(function (q) { return q.axis === 'pro'; })[0] || handles[0];
    var dvBefore = G.node.dv[h.axis];
    mousemove({ clientX: h.x, clientY: h.y });
    check('the cursor picks the handle up', !!G.cursor.over && G.cursor.over.axis === h.axis);
    mousedown({ clientX: h.x, clientY: h.y });
    check('mousedown starts a drag', !!G.nodeDrag);
    // Drag 40 px along the handle's own screen axis.
    mousemove({ clientX: h.x + h.dirX * 40, clientY: h.y + h.dirY * 40, shiftKey: false });
    check('dragging the handle changes the delta-v',
          Math.abs(G.node.dv[h.axis] - dvBefore) > 1e-6,
          dvBefore + ' -> ' + G.node.dv[h.axis]);
    check('and by roughly what the pixel scale promised',
          Math.abs((G.node.dv[h.axis] - dvBefore) - 40 * h.kmsPerPx) < 1e-9,
          String(G.node.dv[h.axis] - dvBefore));
    mouseup({});
    check('mouseup ends the drag', !G.nodeDrag);
  }
  keyup({ key: 'Alt' });
  check('releasing Alt puts the cursor away', !G.cursor.active);
  frames(2);
  check('and the next frame takes the handles off the mouse with it',
        !G.nodeHandles, 'handles still live');

  /* Fly it. Put the node a few seconds out so the whole align-wait-burn
   * cycle fits in a test, then let the real loop run it. */
  G.node.dv = { pro: 0.05, nor: 0, rad: 0 };
  G.node.t = G.t + 6;
  G.nodeStale = 0;
  frames(2);
  var plannedApo = G.nodePlan.after.apoAlt;
  var plannedDv = G.nodePlan.magnitude;
  var fuelBefore = G.ship.thrusterFuel;
  var jumpFuelBefore = G.ship.fuel;

  mark = drawn.texts.length;
  press('\\');
  check('\\ arms the autopilot', !!G.nodeBurn && G.nodeBurn.phase === 'align');

  var guard = 0, sawBurn = false;
  while (G.nodeBurn && guard++ < 4000) {
    frame(100);
    if (G.nodeBurn && G.nodeBurn.phase === 'burn') sawBurn = true;
  }
  check('the autopilot lights the engine', sawBurn, 'never left align');
  check('and finishes on its own', !G.nodeBurn, 'still burning after ' + guard + ' frames');
  check('the node is consumed once flown', !G.node);
  check('it renders throughout the burn', errorsSince(mark).length === 0, errorsSince(mark)[0]);

  var flown = Sim.oscElements(G.ship, G.sys, G.t);
  check('the burn put the ship on roughly the orbit that was planned',
        Math.abs(flown.apoAlt - plannedApo) / Math.abs(plannedApo) < 0.06,
        'planned ' + fmtKm(plannedApo) + ', flew ' + fmtKm(flown.apoAlt));
  check('it spent reaction mass doing it', G.ship.thrusterFuel < fuelBefore,
        fuelBefore + ' -> ' + G.ship.thrusterFuel);
  /* The invariant that matters most: manoeuvring must never reach into the
   * jump tank. Blur those two and range stops being a decision. */
  check('and never touched the jump tank', G.ship.fuel === jumpFuelBefore,
        jumpFuelBefore + ' -> ' + G.ship.fuel);
  check('the delta-v delivered matches the plan',
        Math.abs(plannedDv - 0.05) < 1e-9, String(plannedDv));

  // A hand on the thrust keys takes it back, exactly like auto-dock.
  G.ship = Sim.circularOrbit(planet, G.sys, G.t, 900);
  Sim.refreshShip(G.ship);
  frames(2);
  press('i');
  G.node.dv = { pro: 0.03, nor: 0, rad: 0 };
  G.node.t = G.t + 5;
  G.nodeStale = 0;
  frames(2);
  press('\\');
  check('armed again', !!G.nodeBurn);
  G.keys.w = true;
  frames(2);
  check('a hand on the thrust keys cancels the autopilot', !G.nodeBurn);
  G.keys.w = false;

  press('i', { shiftKey: true });
  check('shift-I clears the node', !G.node);
})();

/* The zoom used to have a floor of 1 km, set for a camera that spends most
 * of its life looking at planets. The chase camera parks at 60 m, so the
 * FIRST notch of the wheel in the exterior view did not zoom in at all — it
 * clamped the camera a kilometre off a ten-metre ship, which is a hull about
 * nine pixels long, and no amount of further zooming could get back under
 * the floor. These assertions are about the ship staying a ship. */
console.log('--- zoom ---');
(function () {
  var keydown = listeners.keydown[0];
  var wheel = listeners.wheel && listeners.wheel[0];
  function press(k, shift) {
    keydown({ key: k, shiftKey: !!shift, preventDefault: function () {} });
  }
  function turn(dy) { wheel({ deltaY: dy, preventDefault: function () {} }); }

  check('the canvas takes a wheel at all', !!wheel);

  // ---- exterior: the wheel must go IN, and keep going in.
  G.panel = 0;
  G.viewMode = 'orbit';
  G.node = null;
  G.cam.dist = 0.06;                       // the chase distance F1 parks at
  var before = G.cam.dist;
  turn(-100);                              // scroll up = zoom in
  check('one notch inward brings the camera closer, not further',
        G.cam.dist < before, before + ' -> ' + G.cam.dist + ' km');

  for (var i = 0; i < 60; i++) turn(-100);
  check('holding the wheel in gets right up to the hull', G.cam.dist < 0.02,
        G.cam.dist + ' km');
  check('but never inside it', G.cam.dist >= 0.006, G.cam.dist + ' km');

  frames(2);
  check('and the hull fills a good part of the screen there',
        W.Render.shipScreenLength(G.cam, G.ship) > 200,
        W.Render.shipScreenLength(G.cam, G.ship).toFixed(0) + ' px');

  // Out and back is a round trip, not a one-way door.
  for (i = 0; i < 40; i++) turn(+100);
  var out = G.cam.dist;
  check('scrolling out pulls away again', out > 0.02, out + ' km');
  for (i = 0; i < 40; i++) turn(-100);
  check('and scrolling back in returns to about where it was',
        Math.abs(G.cam.dist - 0.006) < 0.02 || G.cam.dist < out / 4,
        G.cam.dist + ' km');

  // ---- the keyboard does the same thing.
  G.cam.dist = 0.06;
  press('-');
  check('minus zooms the exterior camera out', G.cam.dist > 0.06, G.cam.dist + ' km');
  press('=');
  press('=');
  check('and equals brings it back in', G.cam.dist < 0.06, G.cam.dist + ' km');

  // ---- cockpit: there is no boom to shorten, so zoom is a field of view.
  G.viewMode = 'cockpit';
  var distIn = G.cam.dist, fovIn = G.cockpitFov;
  turn(-100);
  check('the wheel narrows the canopy field of view in the seat',
        G.cockpitFov < fovIn, (fovIn) + ' -> ' + G.cockpitFov);
  check('and leaves the exterior camera where it was', G.cam.dist === distIn);
  for (i = 0; i < 80; i++) turn(-100);
  check('the canopy zoom stops somewhere sane', G.cockpitFov > 0.3,
        (G.cockpitFov * 180 / Math.PI).toFixed(1) + ' deg');
  var zoomMark = drawn.texts.length;
  frames(2);
  check('and the cockpit still renders zoomed in',
        errorsSince(zoomMark).length === 0, errorsSince(zoomMark)[0]);

  press('-');
  var widened = G.cockpitFov;
  check('minus widens it again', widened > 0.3);

  // ---- Home is the way back from either view.
  press('Home');
  check('Home restores the canopy field of view',
        Math.abs(G.cockpitFov - 68 * Math.PI / 180) < 1e-9,
        String(G.cockpitFov));
  G.viewMode = 'orbit';
  G.cam.dist = 900;
  press('Home');
  check('and Home outside puts the ship back on screen', G.cam.dist < 0.1,
        G.cam.dist + ' km');

  // ---- F1 rescues a camera stranded at the old floor.
  G.cam.dist = 1.0;                        // exactly where the old clamp left it
  press('F1');                             // into the cockpit
  press('F1');                             // and back out
  check('F1 reframes a camera stranded at the old 1 km floor', G.cam.dist < 0.1,
        G.cam.dist + ' km');

  // ---- a live manoeuvre node still owns the +/- keys.
  G.viewMode = 'orbit';
  var distNode = G.cam.dist;
  press('i');                              // place a node
  check('a node was placed', !!G.node);
  if (G.node) {
    press('=');
    check('+/- adjust the node rather than the camera while one is up',
          G.cam.dist === distNode);
  }
  press('i', true);                        // Shift+I clears it
  check('and clearing the node hands the keys back', !G.node);
})();

/* The pause menu is the only screen that is allowed to stop time, and the
 * only one that can change which galaxy you are in. Both of those are worth
 * holding still. */
console.log('--- the pause menu ---');
withStorage(true);
(function () {
  var keydown = listeners.keydown[0];
  function press(k, shift) {
    keydown({ key: k, shiftKey: !!shift, preventDefault: function () {} });
  }
  function type(s) { for (var i = 0; i < s.length; i++) press(s[i]); }

  // Get back to a clean flying state first.
  G.menu = null; G.title = null; G.market = null; G.showHelp = false;
  G.panel = 0;
  G.node = null;
  frames(2);

  press('Escape');
  check('Escape in flight opens the pause menu', !!G.menu && G.menu.page === 'main');
  var mark = drawn.texts.length;
  frames(2);
  check('the menu draws', drawn.texts.slice(mark).indexOf('PAUSED') >= 0);
  check('and it draws cleanly', errorsSince(mark).length === 0, errorsSince(mark)[0]);

  // Time stops. Not G.paused — the player's own pause must survive.
  var tBefore = G.t, pausedBefore = G.paused;
  frames(10, 100);
  check('the world stops while the menu is up', G.t === tBefore,
        tBefore + ' -> ' + G.t);
  check('without touching the player\'s own pause', G.paused === pausedBefore);

  // Nothing behind the overlay is clickable.
  check('the menu takes every hotspot', G.hotspots.length > 0 && G.hotspots.length <= 8,
        G.hotspots.length + ' hotspots');

  // The instrument keys are swallowed rather than acting behind the modal.
  press('F3');
  check('F-keys do not change the page behind the menu', G.panel === 0 && !!G.menu);

  press('Escape');
  check('Escape again resumes', !G.menu);
  frames(2);
  check('and time runs again', G.t > tBefore, tBefore + ' -> ' + G.t);

  // ---- saving to a slot.
  press('Escape');
  press('ArrowDown');                       // Resume -> Save game
  press('Enter');
  check('Save game opens the slot list', G.menu.page === 'save');
  check('there are six slots', W.Save.slots().length === 6);
  check('and they start empty', W.Save.slots()[0].used === false);

  press('Enter');                           // save into slot 1, naming it
  check('saving asks for a name', !!G.menu.edit);
  check('and offers where you are as the default', !!G.menu.edit.value);
  for (var i = 0; i < 60; i++) press('Backspace');
  type('shakedown');
  press('Enter');
  check('the slot is written', W.Save.slots()[0].used === true);
  check('under the name that was typed', W.Save.slots()[0].label === 'shakedown',
        String(W.Save.slots()[0].label));
  check('with the seed it was written in',
        W.Save.readSlot(1).data.seed === G.seed, W.Save.readSlot(1).data.seed);
  check('and enough to recognise it by',
        W.Save.slots()[0].meta.credits === G.ship.credits &&
        !!W.Save.slots()[0].meta.system);

  mark = drawn.texts.length;
  frames(2);
  check('the slot list draws with a used slot in it',
        errorsSince(mark).length === 0, errorsSince(mark)[0]);

  // ---- loading it back.
  var creditsAtSave = G.ship.credits;
  G.ship.credits = creditsAtSave + 999999;   // spend the intervening career
  press('Escape');                           // back to the main page
  press('ArrowDown'); press('ArrowDown');    // Resume -> Save -> Load
  press('Enter');
  check('Load game opens the slot list', G.menu.page === 'load');
  press('1');                                // digits pick a slot outright
  check('loading closes the menu', !G.menu);
  check('and rolls the career back to the slot', G.ship.credits === creditsAtSave,
        G.ship.credits + ' vs ' + creditsAtSave);
  check('back in flight, not on whatever screen was up', G.panel === 0);
  mark = drawn.texts.length;
  frames(3);
  check('and the game runs after a load', errorsSince(mark).length === 0,
        errorsSince(mark)[0]);

  // ---- deleting a slot.
  press('Escape');
  press('ArrowDown'); press('ArrowDown'); press('Enter');   // Load page
  press('Delete');
  check('Delete clears the highlighted slot', W.Save.slots()[0].used === false);
  press('Escape'); press('Escape');
  check('and Escape walks back out again', !G.menu);
})();

console.log('--- options ---');
(function () {
  var keydown = listeners.keydown[0];
  function press(k) { keydown({ key: k, shiftKey: false, preventDefault: function () {} }); }

  G.menu = null; G.title = null; G.panel = 0;
  press('Escape');
  press('ArrowDown'); press('ArrowDown'); press('ArrowDown');
  press('Enter');
  check('Options opens', G.menu.page === 'options');

  var mark = drawn.texts.length;
  frames(2);
  check('the options page draws', drawn.texts.slice(mark).indexOf('OPTIONS') >= 0);
  check('and draws cleanly', errorsSince(mark).length === 0, errorsSince(mark)[0]);

  /* Walking the list must never leave the cursor on a row where the keys do
   * nothing — the headings ARE rows in the table, and moving over them is
   * what makes them free to add. Twenty steps is more than the list is long,
   * so the wrap is covered too.
   *
   * "Did something" is measured as a change in the settings the page owns.
   * Two rows are exempt: a slider already against its stop, and the
   * keybindings row, whose whole job is to close the menu — so the walk
   * re-opens Options and carries on rather than pressing arrow keys at the
   * flight controls, which is how the first version of this test fooled
   * itself. */
  function settingsFingerprint() {
    return JSON.stringify([G.soundVolume, G.soundMuted, G.showOrbits,
                           G.showPrediction, G.showGrid, G.showTraffic,
                           G.cockpitChrome, G.assist, G.flightMode,
                           G.mouseAim, G.aimSens, G.showHelp]);
  }
  function openOptions() {
    if (G.menu && G.menu.page === 'options') return;
    G.menu = null; G.showHelp = false;
    press('Escape');
    press('ArrowDown'); press('ArrowDown'); press('ArrowDown');
    press('Enter');
  }
  var stuck = [], where = null;
  for (var i = 0; i < 20; i++) {
    if (!G.menu || G.menu.page !== 'options') {
      openOptions();
      if (where !== null) G.menu.sel = where;    // carry on from where we were
    }
    press('ArrowDown');
    where = G.menu.sel;
    var before = settingsFingerprint();
    press('ArrowRight');
    var atStop = (G.soundVolume === 0 || G.soundVolume === 1 ||
                  G.aimSens === 0.25 || G.aimSens === 3);
    if (G.menu && settingsFingerprint() === before && !atStop) stuck.push(where);
  }
  openOptions();
  G.showHelp = false;
  check('every row the cursor can reach does something',
        stuck.length === 0, 'rows ' + stuck.join(','));

  // Volume is reachable and actually moves.
  G.menu.sel = 1;                            // the volume row
  var v0 = G.soundVolume;
  press('ArrowLeft');
  check('left turns the volume down', G.soundVolume < v0,
        v0 + ' -> ' + G.soundVolume);
  press('ArrowRight'); press('ArrowRight');
  check('and right turns it back up', G.soundVolume > v0 - 0.001);
  G.soundVolume = 0;
  press('ArrowLeft');
  check('it does not go below zero', G.soundVolume === 0);
  G.soundVolume = 1;
  press('ArrowRight');
  check('nor above one', G.soundVolume === 1);

  // A display toggle, driven from the page rather than its key.
  var orbitsBefore = G.showOrbits;
  G.menu.sel = 4;                            // 'Orbit lines' — first display toggle
  press('Enter');
  check('Enter flips a display toggle', G.showOrbits !== orbitsBefore);
  press('Enter');
  check('and flips it back', G.showOrbits === orbitsBefore);

  // Settings survive the session, and are NOT part of the career snapshot.
  G.soundVolume = 0.31;
  G.menu.sel = 1;
  press('ArrowRight'); press('ArrowLeft');   // any change writes prefs
  var prefs = W.Save.loadPrefs();
  check('options are written to preferences', !!prefs && typeof prefs.soundVolume === 'number',
        JSON.stringify(prefs && prefs.soundVolume));
  var snap = W.Save.snapshot(G);
  check('and are kept out of the career save',
        snap.soundVolume === undefined && snap.showOrbits === undefined);

  press('Escape');
  check('Escape returns to the main menu page', G.menu.page === 'main');
  press('Escape');
})();

console.log('--- quit to the main menu ---');
(function () {
  var keydown = listeners.keydown[0];
  function press(k) { keydown({ key: k, shiftKey: false, preventDefault: function () {} }); }
  function type(s) { for (var i = 0; i < s.length; i++) press(s[i]); }

  G.menu = null; G.title = null; G.panel = 0;
  var seedBefore = G.seed;
  press('Escape');
  press('ArrowUp');                          // wraps to the last item: Quit
  press('Enter');
  check('Quit leaves the game for a title screen', !!G.title && !G.menu);
  check('and commits the career on the way out', !!W.Save.load(seedBefore));

  var mark = drawn.texts.length;
  frames(2);
  check('the title screen draws',
        drawn.texts.slice(mark).indexOf('PROCEDURAL SPACE GAME') >= 0);
  check('and draws cleanly', errorsSince(mark).length === 0, errorsSince(mark)[0]);

  var tBefore = G.t;
  frames(6, 100);
  check('time is stopped on the title screen too', G.t === tBefore);

  // New career: a seed is typed, and it really is a different galaxy.
  press('ArrowDown'); press('ArrowDown');    // Resume -> Load -> New career
  press('Enter');
  check('New career asks for a seed', !!G.title.edit);
  for (var i = 0; i < 40; i++) press('Backspace');
  type('elsewhere');
  press('Enter');
  check('the new seed is running', G.seed === 'elsewhere', G.seed);
  check('the title screen is gone', !G.title && !G.menu);
  check('and it is a different galaxy', G.seed !== seedBefore);
  mark = drawn.texts.length;
  frames(3);
  check('which draws like any other', errorsSince(mark).length === 0, errorsSince(mark)[0]);

  // Escape out of the title screen resumes rather than trapping you.
  G.title = { sel: 0, edit: null, note: null };
  press('Escape');
  check('Escape on the title screen resumes', !G.title);
})();
withStorage(false);

console.log('--- input does not throw ---');
(function () {
  var keydown = listeners.keydown[0];
  var mark = drawn.texts.length;
  var threw = null;
  var keys = ['Enter', '1', '2', '3', '[', ']', 'l', 'Home', 't', 'u', 'm', 'j',
              'Escape', 'c', 'o', 'v', 'g', 'y', 'k', 'h', 'p', ',', '.', 'x',
              'b', 'Backspace', 'Tab', 'ArrowUp', 'ArrowLeft', 'q', 'e', 'w', 's',
              // render scale, three times round so it returns to native and
              // the storage write is exercised in both directions
              '`', '`', '`',
              // manoeuvre nodes, including the panel key and the modifier
              '0', 'F10', 'i', 'i', '-', '=', '_', '+', ';', "'", '\\', 'Alt'];
  try {
    for (var i = 0; i < keys.length; i++) {
      keydown({ key: keys[i], shiftKey: false, preventDefault: function () {} });
      frame();
    }
  } catch (e) { threw = e; }
  check('every key binding survives being pressed', !threw && errorsSince(mark).length === 0,
        threw ? threw.message + ' | ' + String(threw.stack).split('\n')[1] : errorsSince(mark)[0]);
})();

console.log('');
console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
