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
/* PSG_STORAGE=1 pins storage on for the WHOLE file, which is the condition a
 * browser actually runs under. It exists so the interaction above can be
 * reproduced on demand instead of by hand-editing this file, and so the day
 * it is fixed there is a one-word way to prove it. */
var STORAGE_ALWAYS = process.env.PSG_STORAGE === '1';
function withStorage(on) {
  if (on || STORAGE_ALWAYS) {
    global.localStorage = {
      getItem: function (k) { return fakeStore[k] === undefined ? null : fakeStore[k]; },
      setItem: function (k, v) { fakeStore[k] = String(v); },
      removeItem: function (k) { delete fakeStore[k]; }
    };
  } else {
    global.localStorage = realStorage;
  }
}

if (STORAGE_ALWAYS) withStorage(true);

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
console.log('--- a new career starts on a pad ---');
(function () {
  G.newGame('kawartha');
  frames(2);

  check('a fresh career begins docked', !!G.ship.docked, String(G.ship.docked));
  var port = G.sys.byId[G.ship.docked];
  check('at a real port with a market to trade at', !!port && !!port.market,
        port && port.name);
  check('and the game knows it as home', G.homeStation === port);
  check('stationary, not holding an orbit it did not establish',
        V.len(G.ship.thrust) === 0 && !G.autodock && !G.cruise);

  /* THE THING THE ORIGINAL REPORT WAS ABOUT. The ship was never actually on
   * its side — the attitude was exactly level and stayed level in roll, and
   * the pitch drift is the orbital rate, which is correct for a hull with
   * nothing holding its attitude. What looked wrong was the opening FRAME:
   * the exterior camera's up is the world z axis, and the spawn orbit is
   * nearly the world xy plane, so a level ship was drawn belly-sideways.
   * Docked in the seat is unambiguous, so this pins the view too. */
  check('and looking out of the cockpit rather than at the hull from a'
        + ' camera with no idea where down is', G.viewMode === 'cockpit',
        G.viewMode);

  /* Launch clearance is NOT granted: asking for it is the first action, and
   * newGame says which keys do that. What must not happen is being unable
   * to find out. */
  check('with no launch clearance yet — asking is the first thing you do',
        !W.Combat.launchCleared(G, port));
  /* Read off G.message rather than the drawn text, because `say` holds ONE
   * message — which is the bug this check caught: the opening was two calls,
   * so the line naming the port was overwritten before it was ever drawn. */
  check('and the way off the pad is spelled out in one message',
        /F4/.test(G.message || '') && /U$|U\b/.test(G.message || '') &&
        /Docked at/.test(G.message || ''), G.message);

  /* A respawn after a crash still arrives in ORBIT, not on a pad — being
   * handed your ship back berthed would quietly undo the cost of having
   * crashed. The docked start is gated on `fresh`, which respawnShip does
   * not pass, and this is the assertion that keeps that true: enterSystem
   * without `fresh` leaves the ship flying. */
  /* A BERTHED SHIP IS SQUARE IN ITS BAY, and this pair of checks has now
   * been on both sides of the same argument.
   *
   * The original bug was real: dockShip built `right` from
   * anyPerpendicular, which picks ANY vector at right angles to the nose, so
   * the roll was whatever fell out of the arithmetic. save.js re-docks on
   * load and main.js restores the autosave at boot, so quitting on the
   * clamps and coming back meant coming back at a random bank angle.
   *
   * The fix was to level the hull against the planet, and that was the wrong
   * half to fix. A station's model +z is its ORBIT NORMAL, so a ship parked
   * square on a bay floor is genuinely banked relative to the world —
   * levelling it to the planet therefore rolled it ninety degrees OUT of its
   * own berth, which is what Astra saw and reported as "the ship is parked
   * on its side". Being level moved to the instrument (main.js `attitudeUp`)
   * and the hull got its bay back.
   *
   * So what is pinned here is an EXACT attitude rather than merely a
   * non-random one, which is strictly stronger than what it replaced: nose
   * along the berth's own normal, up along the bay's floor. */
  var orbPort = (G.sys.ports || []).filter(function (p) { return !p.surface; })[0];
  check('the home system has an orbital port to test against', !!orbPort);
  if (orbPort) {
    var ops = Sim.bodyState(orbPort, G.sys, G.t);
    G.ship.docked = null;
    G.ship.pos = V.addScaled(ops.pos, { x: 1, y: 0, z: 0 }, 0.4);
    G.ship.vel = V.clone(ops.vel);
    /* Deliberately absurd: rolled onto its back. Whatever it flew in at, the
     * berth decides how it sits. */
    G.ship.up = V.scale(G.ship.up, -1);
    G.ship.right = V.scale(G.ship.right, -1);
    Sim.refreshShip(G.ship);
    Sim.dockShip(G.ship, orbPort, G.sys, G.t);
    frames(1);
    var bay = Sim.berthState(orbPort, G.sys, G.t,
                             (G.ship.dockOffset || {}).berth);
    check('the berth answers for a docked station', !!bay);
    if (bay) {
      var want = Sim.berthFacing ? Sim.berthFacing(bay.basis, bay.off) : null;
      if (want) {
        check('the nose comes out along the berth\'s own normal, whatever it flew in at',
              V.dot(G.ship.fwd, want) > 0.999,
              'dot ' + V.dot(G.ship.fwd, want).toFixed(4));
      }
      check('and its up is the bay floor, not the planet',
            V.dot(G.ship.up, bay.basis.up) > 0.999,
            'dot ' + V.dot(G.ship.up, bay.basis.up).toFixed(4));
      /* AND THE INSTRUMENT AGREES, which is the other half of the trade.
       * Read against the bay the ladder says level; read against the planet
       * it would say ninety degrees, and that is not an error, it is the
       * ladder answering a question you stopped asking when you docked. */
      var attBay = Sim.attitudeAngles(G.ship, bay.basis.up);
      check('so the ladder reads level while you are standing on that deck',
            Math.abs(attBay.rollDeg) < 1.0, attBay.rollDeg + '°');
    }
    /* The offset is captured from where the ship IS, so a ship snapped onto
     * the clamps stays on them rather than floating a few hundred km off. */
    check('and it is actually at the port, not merely flagged as docked',
          V.dist(G.ship.pos, Sim.bodyState(orbPort, G.sys, G.t).pos) < 2,
          V.dist(G.ship.pos, ops.pos).toFixed(2) + ' km');

    /* IN THE BAY, not beside it, and this check is the one the old code
     * would have failed. "At the port" above was satisfied by the ship
     * sitting anywhere within two kilometres, because docking used to
     * capture wherever the approach happened to end and freeze it — so a
     * hull hung in open space off the station's flank while the market and
     * the comms behaved as though it were on a deck. Astra, looking at
     * exactly that: "why is the ship floating in empty space and not parked
     * in the docking bay?"
     *
     * AGAINST THE BERTH ITSELF, not against a radius. The first version of
     * this asked whether the hull was within a bay-sized ball of the
     * station centre, and it passed with the fix reverted — the approach is
     * posed 0.4 km out and the shed reaches further than that, so a loose
     * bound could not tell the two states apart. The exact question is the
     * useful one: is the ship where the berth is? */
    check('the dock assigned a berth rather than freezing the approach',
          !!(G.ship.dockOffset && G.ship.dockOffset.station),
          JSON.stringify(G.ship.dockOffset));

    /* A berth is a berth on both kinds of port. berthState was written
     * against groundBasis and therefore answered null for anything in
     * orbit, which is the single line that kept the whole berth mechanism
     * off stations — so assert it answers at all. */
    var oBerthed = Sim.berthState(orbPort, G.sys, G.t,
                                  (G.ship.dockOffset || {}).berth);
    check('berthState answers for an orbital port too', !!oBerthed);
    check('and the hull is standing in it rather than beside the station',
          !!oBerthed && V.dist(G.ship.pos, oBerthed.pos) < 1e-6,
          oBerthed ? V.dist(G.ship.pos, oBerthed.pos).toFixed(6) + ' km off its berth'
                   : 'no berth');

    /* And it keeps answering as the station moves and turns: a docked hull
     * is re-placed from `t` every frame, so if the frame it is placed in
     * drifted away from the frame the station is drawn in, the ship would
     * slide out of its own bay over time rather than all at once. */
    if (oBerthed) {
      var slidePos = V.clone(G.ship.pos);
      frames(120);
      var oLater = Sim.berthState(orbPort, G.sys, G.t,
                                  (G.ship.dockOffset || {}).berth);
      check('and it is still standing in it two seconds later',
            !!oLater && V.dist(G.ship.pos, oLater.pos) < 1e-6,
            oLater ? V.dist(G.ship.pos, oLater.pos).toFixed(6) + ' km off' : 'no berth');
      check('and it moved with the station rather than staying put in space',
            V.dist(G.ship.pos, slidePos) > 0,
            'moved ' + V.dist(G.ship.pos, slidePos).toFixed(4) + ' km');
    }
  }

  check('the harness can arrive somewhere without starting a career',
        typeof G.enterSystem === 'function');
  G.enterSystem(G.here, {});
  frames(2);
  check('re-entering a system without a fresh career does not berth you',
        !G.ship.docked, String(G.ship.docked));

  newFlying('kawartha');                 // leave the world as the rest expects
  check('and the harness can get it airborne again', !G.ship.docked);
})();

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
  /* mfdBegin RETURNS THE CONTEXT to draw the readout into, not a boolean.
   * It used to return true and transform the caller's own context; it now
   * hands back either that same context (2D path, old affine applied) or an
   * offscreen one whose canvas becomes a textured quad on the GPU. Callers
   * test it for truthiness exactly as before — `if (!mfdBegin(...)) continue`
   * — so the guard is unchanged, but `=== true` is no longer the contract.
   *
   * Headless, there is no document.createElement and no GLWorld, so this
   * takes the 2D path and the affine assertions below still describe what
   * actually runs. */
  var began = W.Render.mfdBegin(rec, panel);
  check('a forward-facing panel is big enough to draw on', !!began);
  check('and mfdBegin hands back something drawable',
        !!began && typeof began.fillRect === 'function');
  check('which headless is the caller\'s own context, not an offscreen one',
        began === rec);
  if (began) W.Render.mfdEnd(rec, panel);

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

  /* THE PANELS ARE READ-ONLY IN THE COCKPIT, and this used to assert the
   * opposite. Astra: "Clicking on the panels should do nothing now. This is
   * because it's too easy to change your MFDs right now." The old target
   * was the bounding box of a projected quad, so at any oblique angle it
   * covered canopy that was not the panel and an instrument changed under a
   * stray reach. Assignment moved to F5 → PANELS. */
  var panelHots = G.hotspots.filter(function (s) { return s.hint === 'click to change this panel'; });
  check('a panel in the cockpit is not a button', panelHots.length === 0,
        panelHots.length + ' targets');

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
  check('and the bulkhead pair are not buttons either', rearHots.length === 0,
        rearHots.length + ' targets');
  check('and looking behind you renders cleanly', errorsSince(rearMark).length === 0,
        errorsSince(rearMark)[0]);
  G.look.yaw = 0;
  frame();

  /* ---- F5 → PANELS is where the assignment lives now -------------------
   *
   * The layout is read off Render.MFD_MOUNTS rather than typed out here, so
   * a console that grows a screen grows a tile; what this pins is that
   * EVERY mount is reachable and that picking a page actually assigns it —
   * the two halves that make the tab a replacement rather than a picture. */
  G.panel = 4; G.shipTab = 'panels'; G.panelPick = 'centre';
  var panelsMark = drawn.texts.length;
  frame();
  check('the PANELS tab renders without error', errorsSince(panelsMark).length === 0,
        errorsSince(panelsMark)[0]);

  var mountHots = G.hotspots.filter(function (s) { return s.hint === 'select this mount'; });
  check('every console mount has a tile on it',
        mountHots.length === W.Render.MFD_MOUNTS.length,
        mountHots.length + ' of ' + W.Render.MFD_MOUNTS.length);

  var pageHots = G.hotspots.filter(function (s) { return s.hint === 'show this page here'; });
  check('and the pages are offered as a list', pageHots.length > 4,
        pageHots.length + ' pages');

  /* Pick a different mount, then a page, and the assignment lands on THAT
   * mount — the bug this guards is a picker that always writes to one. */
  var wasCentre = G.dashPages.centre;
  mountHots[mountHots.length - 1].fn();
  var picked = G.panelPick;
  check('picking a tile selects that mount', picked !== 'centre', String(picked));
  frame();
  var pages2 = G.hotspots.filter(function (s) { return s.hint === 'show this page here'; });
  var target = null;
  for (var pi = 0; pi < pages2.length; pi++) {
    pages2[pi].fn();
    if (G.dashPages[picked] !== undefined) { target = G.dashPages[picked]; break; }
  }
  check('and choosing a page assigns it to the mount you picked',
        !!target && G.dashPages.centre === wasCentre,
        picked + ' → ' + target + ', centre still ' + G.dashPages.centre);

  G.shipTab = 'status'; G.panel = 0;
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

  /* K CYCLES THE COCKPIT CHROME, and this is here because it did not.
   *
   * `cockpitChrome`'s own comment said "cycled by K" and drawStowedHint put
   * "K for the band" on the screen, but the only writer was the options
   * menu — the key was never wired. The MFD console is the whole reason
   * that mode exists, and the one control that reaches it did nothing, so a
   * player who pressed the key the game told them to press concluded the
   * console had been removed. Astra did.
   *
   * A hint that names a key is a promise; this is the test that keeps it. */
  var chrome0 = G.cockpitChrome || 0;
  var seen = [];
  for (var ck = 0; ck < 3; ck++) {
    keydown({ key: 'k', shiftKey: false, preventDefault: function () {} });
    seen.push(G.cockpitChrome);
  }
  check('K cycles the cockpit chrome', seen.length === 3 &&
        seen[0] !== chrome0 && seen[2] === chrome0 &&
        seen[0] !== seen[1] && seen[1] !== seen[2],
        'from ' + chrome0 + ' -> ' + seen.join(' -> '));
  check('and the bare canopy does not claim to have a frame',
        (function () {
          G.cockpitChrome = 2;
          keydown({ key: 'k', shiftKey: false, preventDefault: function () {} });
          var wrapped = G.showCockpitFrame;
          G.cockpitChrome = 2; G.showCockpitFrame = false;
          return wrapped === true;
        })());
  G.cockpitChrome = chrome0;
  G.showCockpitFrame = chrome0 !== 2;
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

  /* IDS STAY PLAIN. A model id is the contract — it is a filename on disk,
   * a key in generated JSON, and a value the renderer looks up — so it
   * lives in the character set all three agree on.
   *
   * This is the check that earned the right to rename art rather than work
   * around it. The 2026-09-11 drop arrived carrying `enf._heavy`, an
   * abbreviation whose full stop had reached the filename. It survives JSON
   * because the generator quotes its keys, so nothing broke and nothing
   * would have, right up until something did — a path split, a regex, a
   * save migration. Renamed to `enforcer_heavy` at the staging step, and
   * asserted here so the next odd character is caught at the door.
   *
   * That every assignment resolves is checked below, where the casting
   * table is. */
  var odd = ids.filter(function (id) { return !/^[A-Za-z0-9_-]+$/.test(id); });
  check('every model id is safe as a filename and a key', odd.length === 0,
        odd.join(', '));

  /* Every imported model obeys the renderer's contract: unit length on its
   * longest axis, centred on the origin, a colour for every face, and an
   * emissive engine glow somewhere — the converter promises all of this,
   * and a regenerated hulls.js that breaks the promise should fail here,
   * not as a black shape in the sky. */
  /* MEASURED OVER THE WHOLE MODEL, hull and gear together. The landing
   * legs are no longer part of `mesh.v` — they come out as separate hinged
   * parts so they can actually move — but they are still part of the ship,
   * and the promise being checked here is about the MODEL. Measuring the
   * hull alone would quietly accept a converter that dropped the legs
   * somewhere else entirely.
   *
   * A part's vertices are relative to its own pivot, so the pivot is what
   * puts them back in hull space. That makes this check strictly stronger
   * than it was: it now fails if a leg is emitted in the wrong place, which
   * is the one mistake the split makes possible. */
  var allGood = true, allLit = true, detail = '';
  for (var i = 0; i < ids.length; i++) {
    var mesh = R.libHull(ids[i]);
    var mins = [1e9, 1e9, 1e9], maxs = [-1e9, -1e9, -1e9];
    var a;
    function grow(x, y, z) {
      var p = [x, y, z];
      for (var k = 0; k < 3; k++) {
        if (p[k] < mins[k]) mins[k] = p[k];
        if (p[k] > maxs[k]) maxs[k] = p[k];
      }
    }
    for (var vi = 0; vi < mesh.v.length; vi++) {
      grow(mesh.v[vi][0], mesh.v[vi][1], mesh.v[vi][2]);
    }
    (mesh.gear || []).forEach(function (part) {
      for (var g = 0; g < part.mesh.v.length; g++) {
        grow(part.pivot[0] + part.mesh.v[g][0],
             part.pivot[1] + part.mesh.v[g][1],
             part.pivot[2] + part.mesh.v[g][2]);
      }
    });
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

  var afterEject = Sim.cargoMass(G.ship);
  frames(60);
  check('canisters survive being simulated', errorsSince(mark).length === 0, errorsSince(mark)[0]);

  /* THE BUG THIS BLOCK EXISTS FOR, and it hid here for months behind a
   * frames(60) that only ever checked for exceptions. Jettison was a no-op:
   * a crate leaves the airlock 50 m astern, the scoop reaches 80 m, and the
   * ship swallowed it again on the very next frame. The hold came out
   * unchanged and the only symptom was cargo that would not go away. */
  check('what you eject stays ejected',
        Math.abs(Sim.cargoMass(G.ship) - afterEject) < 1e-6,
        afterEject + ' -> ' + Sim.cargoMass(G.ship));
  check('and it is still out there to be gone back for',
        Sim.canistersAll(G.sys).length > 0,
        Sim.canistersAll(G.sys).length + ' canisters');

  /* The other half: catching is a FITTING now. Plant a crate on the nose
   * matched to the ship's own velocity, so range and closing speed are both
   * well inside the envelope and the only thing left deciding is the
   * equipment. `armed` is deliberately absent — cargo somebody else dumped
   * is catchable at once, which is what makes robbing a freighter work. */
  var Combat2 = W.Combat;
  function plantCrate() {
    G.sys.canisters = [{
      kind: 'canister', id: 'testcan', name: 'Cargo canister',
      cid: 'grain', tonnes: 2,
      pos: { x: G.ship.pos.x, y: G.ship.pos.y, z: G.ship.pos.z },
      vel: { x: G.ship.vel.x, y: G.ship.vel.y, z: G.ship.vel.z },
      born: G.t, expires: G.t + 86400, spin: 0.3, radius: 0.004
    }];
  }
  G.ship.cargo = {};
  Sim.refreshShip(G.ship);
  var scoopSlot = Combat2.fittedList(G.ship).filter(function (f) {
    return f.item.kind === 'scoop';
  })[0];
  check('a new ship leaves the yard with a cargo scoop', !!scoopSlot);
  if (scoopSlot) {
    Combat2.unfitItem(G.ship, scoopSlot.key);
    Sim.refreshShip(G.ship);
    plantCrate();
    frames(4);
    check('without a scoop a crate cannot be picked up',
          !(G.ship.cargo.grain > 0) && G.sys.canisters.length === 1,
          JSON.stringify(G.ship.cargo));

    Combat2.fitItem(G.ship, 'cargoscoop', scoopSlot.key);
    Sim.refreshShip(G.ship);
    plantCrate();
    frames(4);
    check('with one fitted the same crate goes aboard',
          G.ship.cargo.grain === 2, JSON.stringify(G.ship.cargo));

    /* AND AFTER YOU HAVE DIED, which is the state every pilot is in shortly
     * after their first mistake. stripForRespawn hand-wrote a fit map, and
     * migrateFit only issues the starting kit when the map is EMPTY — so the
     * scoop was handed to new pilots and silently withheld from everyone who
     * had ever been shot down.
     *
     * The symptom was not "no scoop". It was that PIRACY STOPPED WORKING: a
     * robbed freighter dumps its hold exactly as before and none of it can be
     * picked up, with a refusal that speaks once every twelve seconds. The
     * two checks above both passed throughout, because both ran on a ship
     * that had never died. This is the one that would have caught it. */
    G.ship.cargo = {};
    Combat2.stripForRespawn(G.ship);
    Sim.refreshShip(G.ship);
    check('a respawned ship still has a scoop', Combat2.hasScoop(G.ship),
          JSON.stringify(G.ship.fit));
    plantCrate();
    frames(4);
    check('so cargo robbed after a respawn still comes aboard',
          G.ship.cargo.grain === 2, JSON.stringify(G.ship.cargo));
  }

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

    /* Everything below is the FIRST draw of this screen with a contract
     * actually in the list. The board above was rendered before anything
     * was signed, so the ACTIVE CONTRACTS path had never been exercised by
     * any test at all — which is exactly how it went years carrying a
     * destination and a long form that nothing drew. */
    var cMark = drawn.texts.length;
    frames(2);
    check('a signed contract renders', errorsSince(cMark).length === 0,
          errorsSince(cMark)[0]);
    check('and spells out where it is going',
          drawn.texts.slice(cMark).some(function (s) {
            return String(s).indexOf('→ ') === 0;
          }),
          drawn.texts.slice(cMark).slice(0, 8).join(' | '));

    var detBtns = G.hotspots.filter(function (s) { return s.hint === 'DETAILS'; })
                            .sort(function (a, b) { return a.x - b.x; });
    check('a signed contract offers DETAILS of its own', detBtns.length > 0);
    var signed = (G.missions || [])[0];
    check('and it kept the long form it was signed with',
          !!(signed && signed.desc && signed.desc.length > 20));
    if (detBtns.length && signed && signed.desc) {
      // Leftmost is the contract column's; the board's sit further right.
      mousedown({ clientX: detBtns[0].x + 2, clientY: detBtns[0].y + 2 });
      var dMark = drawn.texts.length;
      frames(2);
      var head3 = signed.desc.split(' ').slice(0, 3).join(' ');
      check('clicking it opens that long form on the contract',
            drawn.texts.slice(dMark).some(function (s) {
              return String(s).indexOf(head3) === 0;
            }), head3);
    }
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

/* A tracer's length is the thing that was wrong — the bolts read as fat
 * short slugs, and the fix was to let the packet debunch as it flies. The
 * drawing itself is invisible to this harness (the stub records no
 * geometry), but the span that drives it is a pure function and can be held
 * to the physics it claims. */
console.log('--- bolt span ---');
(function () {
  var R = W.Render;
  check('the bolt span is exported', typeof R.boltSpan === 'function');
  if (typeof R.boltSpan !== 'function') return;

  var CROSS = 0.20;
  var born = R.boltSpan(0, CROSS);
  check('a bolt starts at the muzzle', born.head === 0 && born.tail === 0);

  /* The head is linear in time until it arrives, and arrives exactly once. */
  var quarter = R.boltSpan(CROSS * 0.25, CROSS);
  var half = R.boltSpan(CROSS * 0.5, CROSS);
  check('the head crosses at a constant rate',
        Math.abs(quarter.head - 0.25) < 1e-9 && Math.abs(half.head - 0.5) < 1e-9,
        quarter.head + ' / ' + half.head);
  check('the head stops at the target and does not overshoot',
        R.boltSpan(CROSS, CROSS).head === 1 &&
        R.boltSpan(CROSS * 4, CROSS).head === 1);

  /* The whole point: it gets LONGER on the way out. Monotonically, so there
   * is no frame where it briefly shortens and reads as a stutter. */
  var prev = -1, grew = true, samples = 0;
  for (var f = 0; f <= 1; f += 0.05) {
    var s = R.boltSpan(CROSS * f, CROSS);
    if (s.len < prev - 1e-9) grew = false;
    prev = s.len; samples++;
  }
  check('the streak elongates all the way to the target', grew && samples > 15,
        samples + ' samples');
  check('and it is several times its muzzle length by arrival',
        R.boltSpan(CROSS, CROSS).len > R.boltSpan(CROSS * 0.02, CROSS).len * 4,
        R.boltSpan(CROSS, CROSS).len + ' vs ' + R.boltSpan(CROSS * 0.02, CROSS).len);

  /* Long enough to read as a streak rather than a dot, short enough that it
   * is not simply a bar from the muzzle to the target — which is what the
   * beam variety is for, and the two must not look the same. */
  var atHit = R.boltSpan(CROSS, CROSS).len;
  check('the streak is a streak, not a dot and not a bar',
        atHit > 0.25 && atHit < 0.75, String(atHit));

  /* After arrival the head is pinned and the tail keeps running, so the
   * streak collapses into the impact point instead of blinking out. */
  var after = R.boltSpan(CROSS * 1.2, CROSS);
  check('the tail keeps going after the head arrives',
        after.tail > R.boltSpan(CROSS, CROSS).tail && after.head === 1,
        after.tail + ' > ' + R.boltSpan(CROSS, CROSS).tail);
  var gone = R.boltSpan(CROSS * 3, CROSS);
  check('and the streak is eventually gone rather than inverted',
        gone.len === 0 && gone.tail <= gone.head, gone.len + ' / ' + gone.tail);

  /* Nothing here may hand the caller a fraction outside the run, or the
   * tracer would be drawn behind the muzzle or past the target. */
  var sane = true;
  for (var g = -0.5; g <= 3; g += 0.07) {
    var q = R.boltSpan(CROSS * g, CROSS);
    if (!(q.tail >= 0 && q.tail <= 1 && q.head >= 0 && q.head <= 1 &&
          q.tail <= q.head)) sane = false;
  }
  check('every span stays inside the muzzle-to-target run', sane);

  /* A zero or missing cross would divide by nothing; it falls back rather
   * than handing the renderer a NaN to draw with. */
  var safe = R.boltSpan(0.1, 0);
  check('a missing crossing time falls back instead of going NaN',
        isFinite(safe.head) && isFinite(safe.tail) && safe.head > 0);

  /* ---- and the perspective, which was the second report ----------------
   * The bolt was drawn between two projected endpoints with the width on a
   * fixed pixel ramp, so every shot tapered identically however it was
   * pointed, and the head crossed the screen at a constant rate however far
   * it was receding. Both of those are what "the perspective is wrong" looks
   * like, and both are testable off a real camera without a canvas. */
  var cam = new R.Camera();
  cam.eye = { x: 0, y: 0, z: 0 };
  cam.f = { x: 0, y: 0, z: 1 };      // looking down +z
  cam.r = { x: 1, y: 0, z: 0 };
  cam.u = { x: 0, y: 1, z: 0 };
  cam.near = 0.001;
  cam.flen = 600; cam.cx = 800; cam.cy = 450; cam.w = 1600; cam.h = 900;

  /* The distances below are all inside the taper band — roughly 3 km to
   * 22 km at this focal length. That is deliberate and it is the thing the
   * first version of this test failed to check: with an honestly physical
   * 1.5 m packet the width floors at 1.8 km, so every sample at combat range
   * came back at exactly the floor and "constant width broadside" passed by
   * being constant everywhere. A test that cannot fail is not a test. */

  /* BROADSIDE: a shot crossing the view at a constant 8 km. Both ends are
   * the same distance away, so it must be a ribbon of CONSTANT width — the
   * case the old fixed 4.4x taper got most visibly wrong. */
  var side = R.boltRibbon(cam, { x: -6, y: 0, z: 8 }, { x: 12, y: 0, z: 0 },
                          0, 1, 1);
  check('a broadside shot projects a ribbon', !!side);
  if (side) {
    var wMin = Infinity, wMax = 0;
    side.forEach(function (s) { wMin = Math.min(wMin, s.w); wMax = Math.max(wMax, s.w); });
    check('and it is the same width along its whole length',
          wMax - wMin < 1e-9 || wMax / wMin < 1.02, wMin + ' .. ' + wMax);
  }

  /* RECEDING: a shot fired away from the camera and off to one side, from
   * 4 km out to 20. Now the far end genuinely is further away, so it must
   * narrow — and the samples must CROWD toward the far end, which is the
   * travel half of the bug. Angled rather than straight down the boresight,
   * because a shot exactly along the view axis projects to a single point
   * and has no spacing to measure. */
  var away = R.boltRibbon(cam, { x: 0.5, y: 0, z: 4 }, { x: 5.5, y: 0, z: 16 },
                          0, 1, 1);
  check('a receding shot projects a ribbon', !!away);
  if (away && side) {
    var n = away.length - 1;
    check('a receding shot narrows with distance', away[0].w > away[n].w,
          away[0].w + ' -> ' + away[n].w);
    check('and it narrows differently from a broadside one — which is the '
          + 'whole bug', (away[0].w / away[n].w) > (side[0].w / side[n].w) * 1.5,
          (away[0].w / away[n].w).toFixed(2) + ' vs ' +
          (side[0].w / side[n].w).toFixed(2));

    /* THE TRAVEL. Evenly spaced fractions of a receding world ray do not
     * land evenly on the screen: they bunch toward the vanishing point. The
     * old code walked the head linearly in pixels, which is why a bolt slid
     * at uniform speed and read as painted on the glass. */
    var gaps = [];
    for (var g = 0; g < n; g++) {
      gaps.push(Math.hypot(away[g + 1].x - away[g].x, away[g + 1].y - away[g].y));
    }
    var shrinking = true;
    for (var h = 1; h < gaps.length; h++) if (gaps[h] > gaps[h - 1] + 1e-9) shrinking = false;
    check('equal steps down a receding ray crowd together on screen',
          shrinking && gaps[0] > gaps[gaps.length - 1] * 1.2,
          gaps.map(function (x) { return x.toFixed(1); }).join(' '));

    /* Broadside, the same steps stay evenly spaced — no false foreshortening
     * on a shot that is not going anywhere. */
    var even = true;
    for (var e = 1; e < n; e++) {
      var g0 = Math.hypot(side[1].x - side[0].x, side[1].y - side[0].y);
      var ge = Math.hypot(side[e + 1].x - side[e].x, side[e + 1].y - side[e].y);
      if (Math.abs(ge - g0) > 0.01) even = false;
    }
    check('and broadside they stay evenly spaced', even);
  }

  /* The floor and the cap. A bolt a kilometre out must still be a visible
   * hairline, and one a metre from the eye must not become the canopy. */
  var farOff = R.boltRibbon(cam, { x: 0, y: 0, z: 4000 }, { x: 1, y: 0, z: 0 },
                            0, 1, 1);
  check('a distant bolt is floored to a hairline rather than vanishing',
        !!farOff && farOff[0].w === R.BOLT_MIN_W, farOff && String(farOff[0].w));
  var muzzle = R.boltRibbon(cam, { x: 0, y: 0, z: 0.0015 },
                            { x: 0.001, y: 0, z: 0 }, 0, 1, 1);
  check('and one at the muzzle is capped rather than filling the canopy',
        !!muzzle && muzzle[0].w === R.BOLT_MAX_W, muzzle && String(muzzle[0].w));

  /* A ray that straddles the eye has no honest ribbon; the caller is meant
   * to fall back rather than draw a folded one. */
  check('a ray through the camera refuses rather than folding',
        R.boltRibbon(cam, { x: 0, y: 0, z: -50 }, { x: 0, y: 0, z: 100 },
                     0, 1, 1) === null);
})();

/* Wreckage. The mesh pool is the part with a real constraint behind it —
 * gl.js caches GPU buffers on the mesh object, so a unique mesh per shard
 * would upload a buffer per fragment of every kill and never free one. */
console.log('--- wreckage ---');
(function () {
  var R = W.Render;
  check('the shard pool is exported', typeof R.shardMeshes === 'function');
  if (typeof R.shardMeshes !== 'function') return;

  var pool = R.shardMeshes();
  check('it is a small fixed pool', pool.length === R.SHARD_COUNT && pool.length <= 12,
        pool.length + ' shapes');
  check('BUILT ONCE — object identity is what makes the GPU cache work',
        R.shardMeshes() === pool && R.shardMeshes()[0] === pool[0]);
  check('every shard is a closed mesh with faces',
        pool.every(function (m) { return m.v.length >= 8 && m.f.length >= 12; }));

  /* Seeded from one fixed stream, so the same eight shapes exist in every
   * system of every seed — a property of the game, like a hull model, not
   * of any place in it. */
  var shapes = {};
  pool.forEach(function (m) { shapes[JSON.stringify(m.v)] = true; });
  check('and no two of them are the same shape',
        Object.keys(shapes).length === pool.length);

  /* Plates, not dice: a roughly cubical shard tumbles into a speck and
   * reads as dirt on the canopy rather than as part of a ship. */
  var platey = pool.every(function (m) {
    var lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
    m.v.forEach(function (p) {
      for (var a = 0; a < 3; a++) {
        if (p[a] < lo[a]) lo[a] = p[a];
        if (p[a] > hi[a]) hi[a] = p[a];
      }
    });
    var w = hi[0] - lo[0], t = hi[1] - lo[1], l = hi[2] - lo[2];
    return Math.max(w, l) > t * 1.6;
  });
  check('each one is a plate rather than a lump', platey);

  /* And the sim's mesh index has to actually land in this pool — the two
   * halves live in different files and combat.test.js can only bound the
   * index against a literal. */
  var sysD = G.sys;
  sysD.canisters = [];
  /* FLYING, NOT PARKED. A berth is a pad in orbit now: sit inside one and
   * the station takes you, gear down and stationary being the cleanest
   * possible arrival. This block had inherited a ship sitting in its own
   * berth at Waypoint Dock from an earlier section, so the four frames
   * below docked it and the scoop stopped — a fixture reading as a scoop
   * bug. Put it out in open space, which is where you scavenge anyway. */
  (function () {
    var far = (sysD.ports || []).filter(function (p) { return !p.surface; })[0];
    if (!far) return;
    var fs = Sim.bodyState(far, G.sys, G.t);
    G.ship.docked = null;
    G.ship.arrival = null;
    G.dockTarget = null;
    G.ship.pos = V.addScaled(fs.pos, { x: 1, y: 0, z: 0 }, 40);   // km clear
    G.ship.vel = V.clone(fs.vel);
    Sim.refreshShip(G.ship);
  })();
  var made = Sim.spawnDebris(sysD, 'render-probe', V.clone(G.ship.pos),
                             V.clone(G.ship.vel), 0.08, G.t,
                             [{ cid: 'alloys', tonnes: 9 }]);
  check('every shard the sim makes indexes a mesh that exists',
        made.every(function (c) { return !!pool[c.shard]; }));

  /* Checked BEFORE any frames run. The field is planted on top of the
   * player here, so stepping the game immediately scoops the salvage and
   * clears its cid — which is the scoop working, and which quietly emptied
   * this assertion when it sat after the draw. */
  var salv = made.filter(function (c) { return c.cid; });
  check('some of it is worth taking', salv.length > 0);
  check('and the rest carries nothing to take',
        made.length - salv.length > salv.length);

  /* THE THING THE UNIT TESTS CANNOT SEE: does a field of tumbling wreckage
   * survive being drawn, in both views, with salvage in it? */
  var mark = drawn.texts.length;
  var threw = null;
  G.panel = 0;
  try {
    ['cockpit', 'orbit'].forEach(function (v) { G.viewMode = v; frames(4); });
  } catch (e) { threw = e; }
  check('a debris field renders in both views',
        !threw && errorsSince(mark).length === 0,
        threw ? threw.message + ' | ' + String(threw.stack).split('\n')[1]
              : errorsSince(mark)[0]);

  /* Salvage goes aboard through the canister path and scrap does not, so a
   * debris field is something to pick through rather than to hoover. The
   * field above is planted right on the ship, so four frames is enough for
   * the scoop to have taken what it could. */
  check('flying through it takes the salvage and leaves the scrap',
        made.filter(function (c) { return c.cid; }).length < salv.length,
        salv.length + ' -> ' + made.filter(function (c) { return c.cid; }).length);
  check('and the scrap is still there to fly through',
        Sim.debrisAll(sysD).length === made.length, Sim.debrisAll(sysD).length + '');

  sysD.canisters = [];
  G.viewMode = 'cockpit';
  frames(2);
})();

/* The spent heat sink. It rides the debris path for its physics and is not
 * debris in any other sense, so what is worth checking is precisely the
 * places it has to differ: it outlives a shard, the wreck of a ship must not
 * be able to delete it, and its heat is a closed-form read rather than
 * something ticked — which means it has to be correct after a jump in time
 * as well as after a frame. */
console.log('--- the spent heat sink ---');
(function () {
  newFlying();
  var sysS = G.sys;
  sysS.canisters = [];

  var t0 = G.t;
  var sink = Sim.spawnSink(sysS, G.ship, 180, t0);
  check('an ejection makes an object', !!sink);
  if (!sink) return;

  check('and it goes in the one list loose things live in',
        sysS.canisters.indexOf(sink) !== -1);
  check('it rides the shard path rather than being a fourth kind',
        sink.kind === 'debris' && sink.sink === true);
  check('it is thrown clear of the ship rather than left in the exhaust',
        V.dist(sink.vel, G.ship.vel) > 0.01,
        V.dist(sink.vel, G.ship.vel).toFixed(4) + ' km/s');
  check('and thrown backwards, not forwards',
        V.dot(V.sub(sink.pos, G.ship.pos), G.ship.fwd) < 0);

  /* THE HEAT IS THE WHOLE OBJECT. It leaves with what the sink was holding
   * and sheds half of it per half-life, read off `born` — so a test may
   * jump time rather than step it, which is the property that makes the
   * closed-form version worth having. */
  check('it leaves carrying what the sink was holding',
        Math.abs(Sim.sinkHeatAt(sink, t0) - 180) < 1e-9,
        Sim.sinkHeatAt(sink, t0).toFixed(2));
  check('half of it is gone one half-life later',
        Math.abs(Sim.sinkHeatAt(sink, t0 + Sim.SINK_HALFLIFE) - 90) < 1e-6,
        Sim.sinkHeatAt(sink, t0 + Sim.SINK_HALFLIFE).toFixed(2));
  check('and it is all but cold by the time it expires',
        Sim.sinkHeatAt(sink, t0 + Sim.SINK_LIFE) < 180 * 0.06,
        Sim.sinkHeatAt(sink, t0 + Sim.SINK_LIFE).toFixed(2));
  check('a cold block is not a negative one',
        Sim.sinkHeatAt(sink, t0 + 10000) >= 0);
  check('and nothing else in the field claims to be carrying heat',
        Sim.sinkHeatAt({ kind: 'debris' }, t0) === 0);

  /* It has to still be there when the fight is over, which is the one thing
   * the debris cap would otherwise take away from it. */
  check('it outlasts wreckage', Sim.SINK_LIFE > Sim.DEBRIS_LIFE,
        Sim.SINK_LIFE + ' vs ' + Sim.DEBRIS_LIFE + ' s');
  for (var w = 0; w < 12; w++) {
    Sim.spawnDebris(sysS, 'cull-probe-' + w, V.clone(G.ship.pos),
                    V.clone(G.ship.vel), 0.09, G.t, null);
  }
  var shards = Sim.debrisAll(sysS).filter(function (c) { return !c.sink; });
  check('a dozen wrecks fill the field to the cap',
        shards.length === Sim.DEBRIS_MAX, shards.length + ' of ' + Sim.DEBRIS_MAX);
  check('and the cap did not eat the evidence',
        sysS.canisters.indexOf(sink) !== -1);

  /* Drawn. It is the only piece of debris that is a light source, so the
   * thing a unit test cannot see is whether the glow survives contact with
   * both renderers. */
  var mark = drawn.texts.length, threw = null;
  G.panel = 0;
  try {
    ['cockpit', 'orbit'].forEach(function (v) { G.viewMode = v; frames(3); });
  } catch (e) { threw = e; }
  check('a glowing sink renders in both views',
        !threw && errorsSince(mark).length === 0,
        threw ? threw.message + ' | ' + String(threw.stack).split('\n')[1]
              : errorsSince(mark)[0]);

  /* And a cold one, which takes the other branch of every colour decision. */
  sink.born = G.t - Sim.SINK_LIFE * 0.9;
  sink.expires = sink.born + Sim.SINK_LIFE;
  var coldMark = drawn.texts.length, coldThrew = null;
  try {
    ['cockpit', 'orbit'].forEach(function (v) { G.viewMode = v; frames(3); });
  } catch (e2) { coldThrew = e2; }
  check('and so does a cold one, fading out',
        !coldThrew && errorsSince(coldMark).length === 0,
        coldThrew ? coldThrew.message : errorsSince(coldMark)[0]);

  sysS.canisters = [];
  G.viewMode = 'cockpit';
  frames(2);
})();

/* The GUNS board. It used to be a deck MFD page; it now lives as a tab on
 * the F5 SHIP screen (its only home). The claim tested is unchanged — that
 * it says the same thing Combat does — only where it is shown has moved. */
console.log('--- the guns panel ---');
(function () {
  newFlying();
  var Combat = W.Combat;
  var keydown = listeners.keydown[0];
  var beforePanel = G.panel, beforeTab = G.shipTab;
  G.viewMode = 'cockpit';
  keydown({ key: 'F5', shiftKey: false, preventDefault: function () {} });
  G.shipTab = 'guns';

  var mark = drawn.texts.length;
  frame();
  var texts = drawn.texts.slice(mark);
  function saw(s) { return texts.indexOf(s) !== -1; }

  check('the guns board shows on the SHIP screen guns tab', saw('GUNS'),
        texts.slice(0, 8).join(' | '));
  check('and it renders without error', errorsSince(mark).length === 0,
        errorsSince(mark)[0]);
  check('both triggers are named', saw('GROUP A') && saw('GROUP B'));

  /* A fresh career has its starting gun on trigger A and nothing on B, and
   * that second fact is the single most useful thing this panel can say —
   * an empty group is a trigger that does nothing, which is otherwise
   * indistinguishable from a broken one. */
  var inA = Combat.gunsInGroup(G.ship, 'a'), inB = Combat.gunsInGroup(G.ship, 'b');
  check('the starting fit puts a gun on the first trigger', inA.length > 0,
        inA.length + '');
  check('and the panel counts the same guns Combat does',
        saw(inA.length + (inA.length === 1 ? ' gun' : ' guns')),
        texts.join(' | ').slice(0, 160));
  if (!inB.length) {
    check('an empty group says so rather than showing nothing', saw('empty'));
  }
  check('the gun in the slot is named on the panel',
        texts.some(function (t) { return t.indexOf(inA[0].item.name.slice(0, 10)) === 0; }),
        inA[0].item.name);

  /* Membership is read live, so moving a gun to the other trigger has to
   * show up on the next frame with nothing else touched. */
  Combat.setGroup(G.ship, inA[0].key, 'b');
  var m2 = drawn.texts.length;
  frame();
  var t2 = drawn.texts.slice(m2);
  check('moving a gun to the other trigger moves it on the panel',
        t2.indexOf('empty') !== -1 && t2.indexOf('GROUP B') !== -1,
        t2.join(' | ').slice(0, 160));
  Combat.setGroup(G.ship, inA[0].key, 'a');

  /* fireGroup refuses under time compression. A panel that still said
   * "space fires A" there would be describing a trigger that does nothing,
   * so it says the real thing instead. */
  var warpWas = G.warpIndex;
  G.warpIndex = 3;
  var m3 = drawn.texts.length;
  frame();
  check('under time compression it says the triggers are inhibited',
        drawn.texts.slice(m3).some(function (t) { return /inhibited/.test(t); }),
        drawn.texts.slice(m3).join(' | ').slice(0, 160));
  G.warpIndex = warpWas;

  G.panel = beforePanel;
  G.shipTab = beforeTab;
  frames(2);
})();

/* The landing gear, which for a long time was three legs welded to the
 * belly of every ship in the game. The models were authored gear-down and
 * the converter baked every node transform into the vertices, so the legs
 * were permanently extended and Shift+G — which was working perfectly the
 * whole time — had nothing on screen it could change.
 *
 * What is worth asserting is the two ends of the travel and the order of
 * the middle, all measured through Render.gearBounds so this exercises the
 * renderer's own arithmetic rather than a copy of it. */
console.log('--- the landing gear ---');
(function () {
  var R = W.Render;
  check('the pose helper is exported', typeof R.gearBounds === 'function');
  if (typeof R.gearBounds !== 'function') return;

  var ids = R.hullIds();
  var rigged = ids.filter(function (id) {
    var m = R.libHull(id);
    return m && m.gear && m.gear.length;
  });
  check('the library ships rigged hulls', rigged.length > 0,
        rigged.length + ' of ' + ids.length);
  if (!rigged.length) return;

  /* Every rigged hull, not just the courier: a converter that got the axis
   * right on one model and wrong on another is exactly the failure this
   * catches, and it is invisible in a screenshot of the ship you happened
   * to be flying. */
  var badAxis = [], badStow = [], noLift = [], noFold = [], badDoor = [];
  rigged.forEach(function (id) {
    var m = R.libHull(id);
    m.gear.forEach(function (p) {
      var len = Math.hypot(p.axis[0], p.axis[1], p.axis[2]);
      if (Math.abs(len - 1) > 1e-3) badAxis.push(id);
      /* A hinge that turns by nothing is a hinge the converter failed to
       * measure, and it would read on screen as gear that never moves —
       * which is the bug this whole change exists to fix. */
      if (!(Math.abs(p.stow) > 0.2)) badStow.push(id + '/' + p.role);
    });

    var down = R.gearBounds(m, 1), up = R.gearBounds(m, 0);

    /* DEPLOYED, the leg hangs below the bay it came out of; STOWED, it is
     * pulled back up. Those two comparisons are the whole feature, and both
     * are claims about this code rather than about the models.
     *
     * NOT "the feet are the lowest thing on the ship", which was the first
     * version of this check and which `bulk-s` fails honestly: its keel
     * hangs lower than its gear does, so the hauler would settle on its
     * belly. That is a fact about the art, and asserting it here would be
     * this suite failing every time a modeller drew a deep hull. */
    var bay = Infinity;
    for (var g = 0; g < m.gear.length; g++) {
      if (m.gear[g].pivot[1] < bay) bay = m.gear[g].pivot[1];
    }
    if (!(down.lo[1] < bay - 0.01)) noLift.push(id + ' ' + down.lo[1].toFixed(3) +
                                                ' vs bay ' + bay.toFixed(3));
    if (!(up.lo[1] > down.lo[1] + 0.005)) noFold.push(id + ' ' + down.lo[1].toFixed(3) +
                                                     ' -> ' + up.lo[1].toFixed(3));
  });
  check('every hinge axis is a unit vector', badAxis.length === 0, badAxis.join(' '));
  check('and every hinge actually turns', badStow.length === 0, badStow.slice(0, 4).join(' '));
  check('deployed, every leg hangs below its own bay', noLift.length === 0,
        noLift.slice(0, 3).join(' | '));
  check('and stowing pulls them up into the hull', noFold.length === 0,
        noFold.slice(0, 3).join(' | '));

  /* THE DOOR LEADS THE LEG. A strut swinging through a shut door is worse
   * than no animation, so the phases are staggered — and the assertion is
   * on the ordering rather than on the constants, so retuning the feel does
   * not break the test. */
  check('a door is already moving before the leg starts',
        R.gearPhase('door', 0.2) > 0 && R.gearPhase('strut', 0.2) === 0,
        R.gearPhase('door', 0.2).toFixed(2) + ' vs ' + R.gearPhase('strut', 0.2).toFixed(2));
  check('and both are home at the end',
        R.gearPhase('door', 1) === 1 && R.gearPhase('strut', 1) === 1);
  check('and both are away at the start',
        R.gearPhase('door', 0) === 0 && R.gearPhase('strut', 0) === 0);

  /* The travel itself: a switch, and a thing that takes time to follow it. */
  var probe = { gear: true, gearTravel: 0 };
  var ticks = 0;
  while (probe.gearTravel < 1 && ticks < 1000) { Sim.updateGear(probe, 0.1); ticks++; }
  check('the gear takes about as long as it says to swing',
        Math.abs(ticks * 0.1 - Sim.GEAR_TRAVEL_TIME) < 0.25,
        (ticks * 0.1).toFixed(1) + 's vs ' + Sim.GEAR_TRAVEL_TIME);
  probe.gear = false;
  Sim.updateGear(probe, 0.1);
  check('and it comes back up again', probe.gearTravel < 1);

  /* On the ground you are standing on the legs, whatever the switch says —
   * a berthed ship drawn belly-down would be the same class of lie the
   * welded-on legs were. */
  var berthed = { gear: false, docked: 'b1' };
  Sim.updateGear(berthed, 10);
  check('a berthed ship is on its gear whatever the switch says',
        berthed.gearTravel === 1, String(berthed.gearTravel));

  /* An NPC has never been near Sim.updateGear and must still read as a
   * ship in flight rather than one permanently on approach. */
  check('a ship the sim has never touched reads as stowed',
        R.gearTravelOf({}) === 0);

  /* And it survives being drawn, at both ends and mid-swing, in both
   * views — six extra meshes a frame on whichever path is live. */
  newFlying();
  var mark = drawn.texts.length, threw = null;
  try {
    [0, 0.32, 1].forEach(function (t) {
      G.ship.gear = t > 0.5; G.ship.gearTravel = t;
      ['cockpit', 'orbit'].forEach(function (v) { G.viewMode = v; frames(2); });
    });
  } catch (e) { threw = e; }
  check('a ship renders at every point of the swing, in both views',
        !threw && errorsSince(mark).length === 0,
        threw ? threw.message + ' | ' + String(threw.stack).split('\n')[1]
              : errorsSince(mark)[0]);
  G.viewMode = 'cockpit';
  frames(2);
})();

/* Shields. The shell is a hull mesh pushed out along its own normals, so
 * the testable claims are geometric: it wraps the ship, it stands off it by
 * the right amount, and there is exactly one of them per kind — that last
 * one for the same reason the shard pool is fixed, because gl.js caches GPU
 * buffers on the mesh object. */
console.log('--- shields ---');
(function () {
  var R = W.Render;
  check('the shell mesh is exported', typeof R.shellMesh === 'function');
  if (typeof R.shellMesh !== 'function') return;

  var shell = R.shellMesh('courier');
  var hull = R.shipMeshes().courier;
  check('BUILT ONCE — object identity is what makes the GPU cache work',
        R.shellMesh('courier') === shell);

  /* A FIXED BUDGET, WHATEVER THE MODEL. The first version was a true offset
   * of the hull, which is prettier and cost 1.8-4.8 ms PER SHIP because the
   * imported models run to thousands of triangles — four shielded ships came
   * to 12.2 ms against a renderer that costs about 3 ms for everything else.
   * The resolution is this file's decision now, not the modeller's. */
  var counts = ['courier', 'police', 'navy', 'freighter', 'tanker']
    .map(function (k) { return R.shellMesh(k).f.length; });
  check('every shell costs the same however dense the hull is',
        counts.every(function (n) { return n === counts[0]; }), counts.join(' '));
  check('and that is a couple of hundred faces, not a couple of thousand',
        counts[0] < 400 && counts[0] < hull.f.length / 4,
        counts[0] + ' vs the hull\'s ' + hull.f.length);
  check('with no degenerate faces', shell.f.every(function (f) {
    return f[0] !== f[1] && f[1] !== f[2] && f[0] !== f[2];
  }));
  check('and every index inside the vertex list', shell.f.every(function (f) {
    return f.every(function (ix) { return ix >= 0 && ix < shell.v.length; });
  }));

  /* Held OFF the hull, by about the width of a medium engine bell. Measured
   * on the bounding box, because a per-vertex distance is not the claim —
   * concave corners legitimately pinch inward. */
  function box(m) {
    var lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
    m.v.forEach(function (p) {
      for (var a = 0; a < 3; a++) {
        if (p[a] < lo[a]) lo[a] = p[a];
        if (p[a] > hi[a]) hi[a] = p[a];
      }
    });
    return { lo: lo, hi: hi };
  }
  var bh = box(hull), bs = box(shell);
  var grew = true, tooMuch = false;
  for (var a = 0; a < 3; a++) {
    if (!(bs.hi[a] > bh.hi[a] && bs.lo[a] < bh.lo[a])) grew = false;
    /* Standoff is per-side, so each dimension should gain about twice it.
     * Generous bounds: a normal that averages several faces does not point
     * straight out, so the real growth is a little under the nominal. */
    var gain = (bs.hi[a] - bs.lo[a]) - (bh.hi[a] - bh.lo[a]);
    if (gain > R.SHIELD_STANDOFF * 3) tooMuch = true;
  }
  check('the shell stands outside the hull on every axis', grew,
        JSON.stringify(bs.hi) + ' vs ' + JSON.stringify(bh.hi));
  check('and only by about the standoff, not by a whole hull length', !tooMuch);

  /* Every face knows which way it lies from the ship's centre — that table
   * is what makes the impact maths a dot product instead of a cross. */
  check('each face carries a unit direction from the hull centre',
        !!shell.dirs && shell.dirs.length === shell.f.length &&
        shell.dirs.every(function (d) {
          return Math.abs(Math.hypot(d[0], d[1], d[2]) - 1) < 1e-9;
        }));

  /* Reassigning a class must rebuild its shell, or a form-fitting field
   * would fit the wrong ship — worse than a sphere. */
  var before = R.shellMesh('shuttle');
  R.assignHull('shuttle', 'shuttle-l');
  check('reassigning a hull throws its old shell away',
        R.shellMesh('shuttle') !== before);

  /* And while the shuttle is on the large model it can carry a generator —
   * the size letter is a real property and it lives in HULL_ASSIGN. */
  var bigShuttle = { cls: 'shuttle' };
  W.Combat.npcShield(bigShuttle);
  check('a large shuttle has the room for a shield',
        W.Combat.hullSize('shuttle') === 'l' && bigShuttle.shieldMax > 0,
        W.Combat.hullSize('shuttle') + ' / ' + bigShuttle.shieldMax);
  R.assignHull('shuttle', 'shuttle-s');
  var smallShuttle = { cls: 'shuttle' };
  W.Combat.npcShield(smallShuttle);
  check('and a small one does not', smallShuttle.shieldMax === 0);
  var pod = { cls: 'escape_pod' };
  W.Combat.npcShield(pod);
  check('nor an escape pod, at any size', pod.shieldMax === 0);

  /* THE HUE IS THE GAUGE. A shield you cannot read is a number on a panel
   * you are not looking at during a fight. */
  function rgb(hex) {
    var n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  var full = rgb(R.shieldTint(1)), half = rgb(R.shieldTint(0.5)), gone = rgb(R.shieldTint(0.02));
  check('a full shield reads cool', full[2] > full[0], full.join(','));
  check('a failing one reads hot', gone[0] > gone[2], gone.join(','));
  check('and it runs one way, not back and forth',
        full[2] > half[2] && half[2] > gone[2],
        full[2] + ' > ' + half[2] + ' > ' + gone[2]);
  var sane = true;
  for (var f = -0.5; f <= 1.5; f += 0.05) {
    if (!/^#[0-9a-f]{6}$/.test(R.shieldTint(f))) sane = false;
  }
  check('every charge, in range or out, is a valid colour', sane);

  /* THE FLARE. One curve does spot, spread and dissipate: a bump centred on
   * the impact whose width grows to cover the shell while its height decays. */
  var atHit = R.shellFlare(1, 0);
  var farSide = R.shellFlare(-1, 0);
  check('a fresh hit is bright where it landed', atHit > 0.9, String(atHit));
  check('and dark on the far side of the ship', farSide < atHit * 0.05,
        String(farSide));

  /* The far side lights up LATER — that is the energy spreading, and it is
   * the thing the user asked for. */
  var farEarly = R.shellFlare(-1, R.SHIELD_FLASH_LIFE * 0.1);
  var farMid = R.shellFlare(-1, R.SHIELD_FLASH_LIFE * 0.5);
  check('the far side brightens as the energy spreads into the bubble',
        farMid > farEarly, farEarly.toFixed(5) + ' -> ' + farMid.toFixed(5));
  check('while the impact point itself is fading',
        R.shellFlare(1, R.SHIELD_FLASH_LIFE * 0.5) < atHit);
  check('and it is all over afterwards',
        R.shellFlare(1, R.SHIELD_FLASH_LIFE * 1.01) === 0 &&
        R.shellFlare(-1, R.SHIELD_FLASH_LIFE * 2) === 0);
  var finite = true;
  for (var c = -1; c <= 1; c += 0.1) {
    for (var g = -0.2; g < R.SHIELD_FLASH_LIFE * 1.2; g += 0.05) {
      var val = R.shellFlare(c, g);
      if (!isFinite(val) || val < 0) finite = false;
    }
  }
  check('and never negative or NaN anywhere in its domain', finite);

  /* THE THING THE UNIT TESTS CANNOT SEE: does a shielded ship under fire
   * actually survive being drawn, in both views, with a flare on it?
   *
   * This calls newGame, so it snapshots the twelve tracked preferences and
   * puts them back at the end. The harness note near the corridor block
   * explains why: the options test two thousand lines further down only
   * passes because earlier sections leave the sliders on their stops, and a
   * block that resets them makes it fail for no visible reason. */
  var prefsBefore = {
    soundVolume: G.soundVolume, soundMuted: G.soundMuted,
    showOrbits: G.showOrbits, showPrediction: G.showPrediction,
    showGrid: G.showGrid, showTraffic: G.showTraffic,
    cockpitChrome: G.cockpitChrome, assist: G.assist,
    flightMode: G.flightMode, mouseAim: G.mouseAim,
    aimSens: G.aimSens, showHelp: G.showHelp
  };
  newFlying('kawartha');
  frames(2);
  var mark = drawn.texts.length;
  var spec = (G.sys.patrols || [])[0];
  var threw = null;
  if (spec) {
    spec.cls = 'navy';
    delete spec.hullHp; delete spec.shieldMax;
    W.Combat.npcHull(spec); W.Combat.npcShield(spec);
    /* Built the way liftTrader builds one, fields and all. A hand-rolled
     * `live` missing `name` is not a shield bug — it is a malformed ship,
     * and the NAV panel walks every live contact and clips its name, so the
     * first version of this test crashed the dashboard rather than the
     * renderer. Worth the extra lines: the thing under test is the shell,
     * and the fixture should not be the reason it fails. */
    spec.live = { pos: V.addScaled(V.clone(G.ship.pos), G.ship.fwd, 3),
                  vel: V.clone(G.ship.vel), fwd: V.clone(G.ship.fwd),
                  up: V.clone(G.ship.up), right: V.clone(G.ship.right),
                  spec: spec, id: spec.id, name: spec.name || 'Test Cutter',
                  kind: spec.kind, cls: spec.cls,
                  className: spec.className || 'naval cutter',
                  size: spec.size || 0.24, color: spec.color || '#b8c6d8',
                  faction: spec.faction || null, phase: 'live' };
    /* lastHitAt is SIM time (it gates regeneration, a delay in the world);
     * an impact's `at` is REAL seconds (it drives a light). Getting those two
     * the wrong way round is the bug this pair of lines exists to pin. */
    spec.lastHitAt = G.t;
    spec.impacts = [{ dir: { x: 1, y: 0, z: 0 }, at: performance.now() / 1000,
                      shield: 8, hull: 0, soaked: true, through: false }];
    try {
      ['cockpit', 'orbit'].forEach(function (v) { G.viewMode = v; frames(3); });
    } catch (e) { threw = e; }
    check('a shielded ship under fire renders in both views',
          !threw && errorsSince(mark).length === 0,
          threw ? threw.message + ' | ' + String(threw.stack).split('\n')[1]
                : errorsSince(mark)[0]);
  }

  /* And the player's own, which is the half you actually experience: a
   * soaked hit has to bloom on the canopy, because you cannot see your own
   * hull from the seat. */
  var mark2 = drawn.texts.length;
  var threw2 = null;
  G.ship.shield = 'shield';
  G.ship.shieldHp = 20;
  G.ship.lastHitAt = performance.now();
  var nowS = performance.now() / 1000;
  G.ship.impacts = [{ dir: V.clone(G.ship.fwd), at: nowS,
                      shield: 6, hull: 0, soaked: true, through: false },
                    /* One from dead astern, which projectDir cannot answer
                     * and which must pin to the edge rather than vanish. */
                    { dir: V.scale(G.ship.fwd, -1), at: nowS,
                      shield: 4, hull: 0, soaked: true, through: false },
                    /* And one that came through, which is the bloom. */
                    { dir: V.clone(G.ship.right), at: nowS,
                      shield: 2, hull: 9, soaked: true, through: true }];
  try {
    ['cockpit', 'orbit'].forEach(function (v) { G.viewMode = v; frames(3); });
  } catch (e) { threw2 = e; }
  check('your own shield draws from the seat and from outside',
        !threw2 && errorsSince(mark2).length === 0,
        threw2 ? threw2.message + ' | ' + String(threw2.stack).split('\n')[1]
               : errorsSince(mark2)[0]);

  G.ship.impacts = [];
  G.ship.shield = null;
  G.ship.shieldHp = 0;
  G.ship.lastHitAt = 0;
  G.viewMode = 'cockpit';
  for (var pk in prefsBefore) G[pk] = prefsBefore[pk];
  frames(2);
})();

/* Imported ports. The pipeline is: model -> glb2hulls --ports -> ports.js ->
 * here, and the part worth guarding is that the anchors are LOAD-BEARING —
 * a modelled bay's own dimensions have to reach the camera clamp and the
 * berths, or the model is decoration pretending to be geometry. */
console.log('--- imported ports ---');
(function () {
  var R = W.Render;
  var Gen = W.Gen || global.Gen;
  check('the port library reader is exported', typeof R.libPort === 'function');
  if (typeof R.libPort !== 'function') return;

  /* WITH NOTHING LOADED, which is the shipping state today: ports.js is
   * generated and optional, and every role has to fall back to the
   * procedural mesh it already had. */
  /* On W, not on node's `global`. render.js's IIFE is handed `window` when
   * one exists, so its `global` IS this harness's fake window — the same
   * trap that stopped sim.js resolving RNG headlessly. */
  var had = W.PortLib;
  W.PortLib = undefined;
  R.reloadPorts();
  check('with no port library, nothing is claimed', R.libPort('orbital') === null);
  check('and there are no port ids', R.portIds().length === 0);
  var bare = R.stationMeshes();
  check('every procedural role still exists',
        !!bare.orbital && !!bare.highport && !!bare.refinery && !!bare.shipyard &&
        !!bare.surface && !!bare.bay && !!bare.underground);

  /* And a bay with no model gets the shared constant table, unchanged. */
  var fakePort = { radius: 2, shaftDepth: 1.8, surface: true };
  var g0 = Gen.bayGeometry(fakePort);
  /* Against the TABLE, not against copied-out numbers. What matters here is
   * that an unmodelled bay falls back to the shared table at all; the values
   * in it are tuned against the fleet and have moved twice already, and a
   * test that restates them just fails every time somebody does the tuning
   * it is supposed to be protecting. */
  var tbl = Gen.shaftBay(fakePort);
  check('an unmodelled bay uses the shared table',
        g0.mouthR === tbl.mouthR && g0.chamberX === tbl.chamberX &&
        g0.chamberY === tbl.chamberY && g0.berths === tbl.berths,
        JSON.stringify(g0));
  check('and its floor is its own shaft depth',
        Math.abs(g0.floorZ + 0.9) < 1e-9, String(g0.floorZ));
  check('with the ceiling a HEIGHT above that floor, not an absolute',
        Math.abs((g0.ceilZ - g0.floorZ) - tbl.headroom) < 1e-9,
        g0.floorZ + ' -> ' + g0.ceilZ);

  /* NOW WITH A MODEL. Shaped exactly as the converter writes it — the
   * numbers below are the ones tools/make-port-fixture.js produces and
   * were checked against the tool's output by hand. */
  /* Held in a variable because a later block swaps the library out to test
   * pooling and has to put this one back — the checks after it are written
   * against these two fixtures. */
  var fixtureLib = {
    bay: {
      kind: 'surface',
      v: [[0, 0, 0], [1, 0, 0], [0, 1, 0]], f: [[0, 1, 2]],
      pal: ['#808080'], ci: [0],
      geom: { floorZ: -0.9, ceilZ: -0.58, mouthR: 0.42,
              chamberX: 1.6, chamberY: 0.9, berths: 3 },
      anchors: {
        /* min/max as well as mid, because that is what the converter
         * actually writes and a fixture that is easier than the real thing
         * tests an easier thing. berthOffset reads the floor off `min` to
         * stand a hull on the deck rather than in the middle of the air;
         * with mid alone it silently got a different answer. */
        berths: [{ min: [-1.05, -0.7, -0.9], max: [-0.85, -0.5, -0.75], mid: [-0.95, -0.6, -0.9] },
                 { min: [-0.12, -0.7, -0.9], max: [0.12, -0.5, -0.72], mid: [0, -0.6, -0.9] },
                 { min: [0.85, -0.7, -0.9], max: [1.05, -0.5, -0.75], mid: [0.95, -0.6, -0.9] }],
        signs: [{ mid: [0, -0.55, 0.04] }]
      }
    },
    orbital: {
      kind: 'orbital',
      v: [[0, 0, 0], [1, 0, 0], [0, 1, 0]], f: [[0, 1, 2]],
      pal: ['#808080'], ci: [0],
      spin: { v: [[0, 0, 0], [1, 0, 0], [0, 0, 1]], f: [[0, 1, 2]],
              pal: ['#909090'], ci: [0] },
      anchors: { docks: [{ mid: [0, -0.3, 0] }, { mid: [0, 0.3, 0] }] }
    }
  };
  W.PortLib = fixtureLib;
  R.reloadPorts();

  var p = R.libPort('bay');
  check('a modelled port is read back', !!p && p.kind === 'surface');
  check('its palette is decompressed into per-face colours',
        !!p && p.shell.c.length === p.shell.f.length && p.shell.c[0] === '#808080');
  check('and it is cached rather than rebuilt', R.libPort('bay') === p);
  var st = R.libPort('orbital');
  check('a spinning ring is kept apart from the hub that does not turn',
        !!st && !!st.spin && st.spin.f.length === 1);
  check('and its dock anchors survive', !!st.anchors && st.anchors.docks.length === 2);

  /* THE LOAD-BEARING BIT. The modelled bay's own dimensions must reach
   * bayGeometry, because that is what the camera clamps against and what
   * places ships in berths. */
  var g1 = Gen.bayGeometry({ radius: 2, shaftDepth: 1.8, surface: true });
  check('a modelled bay overrides the shared table',
        g1.chamberX === 1.6 && g1.chamberY === 0.9 && g1.mouthR === 0.42,
        JSON.stringify(g1));
  check('and its berth count comes from the model', g1.berths === 3, String(g1.berths));
  check('its ceiling is taken as an ABSOLUTE height, not added to the floor',
        Math.abs(g1.ceilZ + 0.58) < 1e-9, String(g1.ceilZ));
  check('leaving a usable headroom rather than a roof under the floor',
        g1.ceilZ > g1.floorZ, g1.floorZ + ' -> ' + g1.ceilZ);
  check('and anything the model did not declare still falls back',
        g1.throatR === tbl.throatR, String(g1.throatR));

  /* STANDOFF IS THE EXCEPTION, and deliberately. Every other field in the
   * table is a proportion of the port; gear-to-floor clearance is not —
   * it is a distance between a hull and a deck, and the same fraction that
   * is 1.2 m at a small pad was 80 m at a station. bayGeometry now caps it
   * at half the tallest hull in the fleet plus a metre for the gear, so
   * the number that comes out is an absolute clearance divided by the
   * radius rather than a shape. Checked against the fleet rather than
   * against a literal, so a re-exported hull moves this on its own. */
  var tallest = 0;
  Object.keys(R.HULL_ASSIGN).forEach(function (k) {
    var sp = R.hullSpan(k); if (sp && sp.h > tallest) tallest = sp.h;
  });
  check('the fleet has a tallest hull to measure the clearance from', tallest > 0);
  check('and the parked clearance is that, not a fraction of the port',
        Math.abs(g1.standoff * 2 - (tallest * 0.5 + 0.001)) < 1e-9,
        (g1.standoff * 2 * 1000).toFixed(2) + ' m at a 2 km port');
  /* Still capped by the old fraction, so a port small enough that this
   * would be a large share of its own bay keeps the answer it had. */
  var gSmall = Gen.bayGeometry({ radius: 0.1, shaftDepth: 0.09, surface: true });
  check('a small pad keeps the proportional clearance it always had',
        gSmall.standoff === tbl.standoff,
        (gSmall.standoff * 0.1 * 1000).toFixed(2) + ' m at a 100 m pad');

  /* A MODEL THAT TURNS PART OF ITSELF. The procedural stations spin by
   * rotating the whole frame, which is right for a wheel drawn as one
   * mesh — but it means a modelled hub would rotate with its own ring, and
   * a hub that turns is not something you can aim a docking approach at. So
   * a declared `stationSpin` bucket is drawn on its own frame.
   *
   * This is also the gap that would have silently eaten a modelled ring:
   * the first wiring only took `shell` into the mesh table, so anything in
   * the spin bucket was dropped and never drawn at all. */
  check('a role whose model declares a spinning part says so',
        R.portSpins('orbital') === true);
  check('and one that does not, does not', R.portSpins('bay') === false);
  check('nor does a procedural role with no model at all',
        R.portSpins('refinery') === false);
  /* And it actually draws. A camera far enough back that the whole thing
   * projects, and a frame in front of it. */
  var pcam = new R.Camera();
  pcam.eye = { x: 0, y: 0, z: 0 };
  pcam.f = { x: 0, y: 0, z: 1 }; pcam.r = { x: 1, y: 0, z: 0 };
  pcam.u = { x: 0, y: 1, z: 0 };
  pcam.near = 0.001; pcam.flen = 667;
  pcam.cx = 800; pcam.cy = 450; pcam.w = 1600; pcam.h = 900;
  var pframe = { pos: { x: 0, y: 0, z: 40 }, fwd: { x: 0, y: 0, z: 1 },
                 up: { x: 0, y: 1, z: 0 }, right: { x: 1, y: 0, z: 0 } };
  var before = drawn.calls;
  check('the spinning part draws on its own frame',
        R.drawPortPart(ctxStub, pcam, pframe, 2, { x: 0, y: 0, z: -1 },
                       'orbital', 'spin', '#ffffff') === true);
  check('and it really put something on the canvas', drawn.calls > before,
        (drawn.calls - before) + ' calls');
  check('asking for a part that is not there is a no-op, not a throw',
        R.drawPortPart(ctxStub, pcam, pframe, 2, { x: 0, y: 0, z: -1 },
                       'bay', 'spin', '#ffffff') === false);
  check('and neither is asking a role with no model at all',
        R.drawPortPart(ctxStub, pcam, pframe, 2, { x: 0, y: 0, z: -1 },
                       'refinery', 'spin', '#ffffff') === false);

  /* ---- SEVERAL MODELS FOR ONE ROLE -------------------------------------
   * The art does not divide the way the roles do: one surface role and
   * several cities, one buried role and several deep bays, seven orbital
   * roles and four space stations. So a role points at a LIST, and which
   * entry a port gets is HASHED FROM THE PORT — never drawn — because a
   * city has to be the same city every time you fly back to it. */
  var portA = { id: 'p-alpha', surface: true };
  var portB = { id: 'p-beta', surface: true };
  check('with no assignment a role is its own procedural key',
        R.portModelFor(portA) === 'bay', R.portModelFor(portA));

  R.assignPort('bay', ['city-a', 'city-b', 'city-c']);
  var a1 = R.portModelFor(portA), b1 = R.portModelFor(portB);
  check('an assigned role hands out one of its models',
        ['city-a', 'city-b', 'city-c'].indexOf(a1) >= 0, a1);
  check('the SAME port gets the SAME model every time it is asked',
        R.portModelFor(portA) === a1 && R.portModelFor(portA) === a1, a1);
  check('and it survives being asked from a fresh object with the same id',
        R.portModelFor({ id: 'p-alpha', surface: true }) === a1, a1);

  /* Spread, not sameness: a list of three that always answered 'city-a'
   * would pass every check above and be worthless. */
  var spread = {};
  for (var pn = 0; pn < 60; pn++) {
    spread[R.portModelFor({ id: 'port-' + pn, surface: true })] = true;
  }
  check('different ports do get different models',
        Object.keys(spread).length === 3, Object.keys(spread).join(' '));

  /* A single-entry list is the old one-to-one behaviour exactly. */
  R.assignPort('underground', 'deep-drum');
  check('a role with one model always gives that one',
        R.portModelFor({ id: 'x', underground: true }) === 'deep-drum');

  /* THE INDIRECTION HAS TO REACH THE DIMENSIONS TOO. It is not enough for
   * an assignment to change which mesh is drawn — bayGeometry has to follow
   * the same pointer, or the game draws one shed and parks ships to
   * another's floor. Assign the role at the model the fixture library
   * actually holds and the modelled numbers must come back. */
  R.assignPort('bay', 'bay');
  var gA = Gen.bayGeometry({ id: 'p-alpha', surface: true, radius: 2, shaftDepth: 1.8 });
  check('an assignment redirects the DIMENSIONS, not just the mesh',
        gA.chamberX === 1.6 && gA.berths === 3, JSON.stringify(gA));
  R.assignPort('bay', ['city-a', 'city-b', 'city-c']);
  var gB = Gen.bayGeometry({ id: 'p-alpha', surface: true, radius: 2, shaftDepth: 1.8 });
  var tblB = Gen.shaftBay({ radius: 2, shaftDepth: 1.8 });
  check('and pointing it at an unmodelled name falls back to the table',
        gB.chamberX === tblB.chamberX && gB.berths === tblB.berths,
        JSON.stringify(gB));

  R.assignPort('bay', null);
  R.assignPort('underground', null);
  check('clearing an assignment falls back to the procedural key',
        R.portModelFor(portA) === 'bay' &&
        R.portModelFor({ id: 'x', underground: true }) === 'underground');

  /* ---- POOLS BY FILENAME ------------------------------------------------
   * The route that needs no code at all: the prefix says which pool a model
   * joins, so four station-* files spread across all seven orbital roles
   * just by being in the folder. */
  W.PortLib = {
    'station-ring': { kind: 'orbital', v: [[0, 0, 0]], f: [], pal: [], ci: [] },
    'station-drum': { kind: 'orbital', v: [[0, 0, 0]], f: [], pal: [], ci: [] },
    'station-spindle': { kind: 'orbital', v: [[0, 0, 0]], f: [], pal: [], ci: [] },
    'station-cluster': { kind: 'orbital', v: [[0, 0, 0]], f: [], pal: [], ci: [] },
    'city-market': { kind: 'surface', v: [[0, 0, 0]], f: [], pal: [], ci: [] },
    'city-tiered': { kind: 'surface', v: [[0, 0, 0]], f: [], pal: [], ci: [] },
    'deep-silo': { kind: 'surface', v: [[0, 0, 0]], f: [], pal: [], ci: [] }
  };
  R.reloadPorts();

  check('station-* forms the orbital pool',
        R.poolFor('orbital').length === 4 && R.poolFor('refinery').length === 4,
        R.poolFor('orbital').join(' '));
  check('city-* the surface pool, deep-* the buried one',
        R.poolFor('bay').length === 2 && R.poolFor('underground').length === 1,
        R.poolFor('bay').join(' ') + ' | ' + R.poolFor('underground').join(' '));
  check('and the pools do not leak into each other',
        R.poolFor('orbital').every(function (id) { return id.indexOf('station-') === 0; }));

  /* Every orbital role draws from the same four, which is what "pooled"
   * means — and the four are actually spread across ports rather than one
   * of them answering everything. */
  var orbSeen = {};
  for (var q = 0; q < 80; q++) {
    orbSeen[R.portModelFor({ id: 'st-' + q, market: { role: 'refinery' } })] = true;
  }
  check('a pooled role spreads across all four models',
        Object.keys(orbSeen).length === 4, Object.keys(orbSeen).join(' '));
  check('and a different role draws from the same pool',
        R.poolFor('agri').join() === R.poolFor('shipyard').join());
  check('a surface port gets a city, not a station',
        R.portModelFor({ id: 'c1', surface: true }).indexOf('city-') === 0,
        R.portModelFor({ id: 'c1', surface: true }));
  check('and a buried one gets the deep model',
        R.portModelFor({ id: 'u1', underground: true }) === 'deep-silo');

  /* Stable across repeated asks, which is the doctrine. */
  var pooled = R.portModelFor({ id: 'st-7', market: { role: 'agri' } });
  check('a pooled pick is stable for the same port',
        R.portModelFor({ id: 'st-7', market: { role: 'agri' } }) === pooled, pooled);

  /* PRECEDENCE. A file named for the role pins it; an explicit assignment
   * beats even that. This is how legibility is bought back one role at a
   * time rather than all or nothing. */
  W.PortLib.shipyard = { kind: 'orbital', v: [[0, 0, 0]], f: [], pal: [], ci: [] };
  R.reloadPorts();
  check('a file named for a role pins that role out of the pool',
        R.portModelFor({ id: 'sy1', market: { role: 'shipyard' } }) === 'shipyard');
  check('while its neighbours stay pooled',
        R.portModelFor({ id: 'sy1', market: { role: 'agri' } }).indexOf('station-') === 0);
  R.assignPort('shipyard', 'station-cluster');
  check('and an explicit assignment beats the named file',
        R.portModelFor({ id: 'sy1', market: { role: 'shipyard' } }) === 'station-cluster');
  R.assignPort('shipyard', null);

  /* Put the two-fixture library back: the checks below this were written
   * against it, and a block that changes the world for everything after it
   * is the thing the corridor section's own note warns about. */
  W.PortLib = fixtureLib;
  R.reloadPorts();

  /* Berths are numbered left to right, which is what stops a re-export
   * moving a parked ship. */
  var xs = p.anchors.berths.map(function (b) { return b.mid[0]; });
  var rising = true;
  for (var i = 1; i < xs.length; i++) if (xs[i] <= xs[i - 1]) rising = false;
  check('berths are ordered across the shed', rising, xs.join(' '));

  /* ---- a berth offset lands INSIDE the berth ---------------------------
   * The number this is standing in for is one nobody can check by reading:
   * berthOffset used to lay bays out from a constant table — three x
   * positions against two walls, six berths, every station the same shed —
   * while the renderer drew whatever the model actually was. Since docking
   * now parks the hull at the berth, a table that disagrees with the art is
   * a ship inside a wall, which is the failure PORT-MODELS.md calls out and
   * the one the anchors exist to prevent.
   *
   * So: ask for each berth in turn and assert the answer is within the
   * model's own box for it. Layout is invisible to this suite, but
   * containment is arithmetic, and containment is the part that matters. */
  var gen = W.Gen;
  var pPort = { id: 'bay-fixture', radius: 1, shaftDepth: 0, surface: true };

  /* THE EXPECTED BOXES COME FROM THE FIXTURE, not from the function under
   * test. Reading them back through modelledBerths made every check below
   * conditional on modelledBerths working — so breaking it turned three
   * assertions into no assertions and the suite went green with one
   * complaint. The fixture is the ground truth here; if berthOffset stops
   * consulting the model it falls back to the constant table and the
   * containment check fails, which is what it is for. */
  var declared = p.anchors.berths;
  check('the model\'s berths reach generate.js',
        !!(gen.modelledBerths && gen.modelledBerths(pPort)),
        'modelledBerths returned nothing');
  check('and the bay count comes off the model rather than the constant',
        gen.bayGeometry(pPort).berths === declared.length,
        gen.bayGeometry(pPort).berths + ' vs ' + declared.length);

  var outside = [];
  for (var bi = 0; bi < declared.length; bi++) {
    var off = gen.berthOffset(pPort, bi);
    /* x and y must sit inside the box outright. z is the floor plus a
     * standoff, so it is allowed to be a little ABOVE the top — a ship
     * parked in a shallow bay stands proud of it — but never below the
     * floor, which would be through the deck. */
    var b = declared[bi];
    if (off.x < b.min[0] || off.x > b.max[0]) outside.push(bi + ':x ' + off.x);
    if (off.y < b.min[1] || off.y > b.max[1]) outside.push(bi + ':y ' + off.y);
    if (off.z < b.min[2]) outside.push(bi + ':below the floor ' + off.z);
  }
  check('every berth offset lands inside the berth the model declares',
        outside.length === 0, outside.join(', '));

  /* And asking twice gives the same bay. A re-export reorders glTF nodes
   * freely, so the sort is what keeps a saved career parked where it
   * left off. */
  var twice = true;
  for (var ti = 0; ti < declared.length; ti++) {
    var a1 = gen.berthOffset(pPort, ti), a2 = gen.berthOffset(pPort, ti);
    if (a1.x !== a2.x || a1.y !== a2.y || a1.z !== a2.z) twice = false;
  }
  check('and berth numbering is stable between asks', twice);

  /* An imported role takes over the mesh the renderer draws, and the roles
   * it does not supply keep theirs. */
  var meshes = W.Render.libPort ? R.stationMeshes() : null;
  check('an imported port replaces its procedural mesh',
        !!meshes && meshes.bay.f.length === 1,
        meshes && String(meshes.bay.f.length));
  check('and an unmodelled role keeps the procedural one',
        !!meshes && meshes.refinery.f.length > 20,
        meshes && String(meshes.refinery.f.length));

  W.PortLib = had;
  R.reloadPorts();
  frames(1);
})();

/* Berthed in a shed, the shed is the world. The camera clamp already kept
 * the eye between the walls and the stars were already gone, but the
 * planets, orbit lines, grid, traffic and trajectory were all still drawn —
 * so you looked past the end of the hangar and saw the solar system. Half
 * enclosed reads worse than not enclosed: it makes the walls look like a
 * texture rather than a room. */
console.log('--- docked, the dock is all there is ---');
(function () {
  var prefs = {
    showOrbits: G.showOrbits, showGrid: G.showGrid, showTraffic: G.showTraffic,
    showPrediction: G.showPrediction, soundVolume: G.soundVolume,
    soundMuted: G.soundMuted, cockpitChrome: G.cockpitChrome, assist: G.assist,
    flightMode: G.flightMode, mouseAim: G.mouseAim, aimSens: G.aimSens,
    showHelp: G.showHelp
  };

  G.newGame('kawartha');          // a fresh career begins berthed
  frames(2);
  check('the career starts berthed', !!G.ship.docked);

  /* NOT WHEREVER THE CAREER STARTED, and this is the correction to a test
   * that asserted it was. The fresh start prefers a surface port on the
   * host world and falls back to the orbital station when that world has
   * none — measured across 40 galaxies, 16 start on a pad and 24 at the
   * station. Both are spaceports and both are correct, so a test that
   * demanded a pad was failing the game for a coin toss.
   *
   * Only a surface port has an inside (berthedPort filters on `.surface`),
   * so the enclosure is tested by berthing at one deliberately. Every seed
   * sampled had between three and twelve of them, so this is not luck. */
  var port = (G.sys.ports || []).filter(function (p) {
    return p.surface && p.market;
  })[0];
  check('and the system has a surface port, which is the kind with an inside',
        !!port, port && port.name);
  if (!port) { for (var k0 in prefs) G[k0] = prefs[k0]; return; }
  G.ship.cleared = G.ship.cleared || {};
  G.ship.cleared[port.id] = true;
  Sim.dockShip(G.ship, port, G.sys, G.t);
  frames(2);
  check('berthed in it', G.ship.docked === port.id, String(G.ship.docked));

  /* Everything on, so the suppression is doing the work rather than the
   * toggles happening to be off. */
  G.showOrbits = true; G.showGrid = true;
  G.showTraffic = true; G.showPrediction = true;
  G.viewMode = 'orbit';
  G.panel = 0;
  frames(3);

  var mark = drawn.texts.length;
  var before = drawn.calls;
  frames(3);
  check('the docked exterior view draws without error',
        errorsSince(mark).length === 0, errorsSince(mark)[0]);
  check('and it still draws SOMETHING — the dock itself',
        drawn.calls > before + 30, (drawn.calls - before) + ' calls');

  /* Two observables, both deterministic. `gridStep` is set to 0 before the
   * branch and only written inside it, so berthed it is exactly 0. And the
   * bodies loop is what fills labelQueue, so with every body but the port
   * skipped there is at most one label in it — the port's own. */
  check('the ecliptic grid is not drawn through the hangar wall',
        G.gridStep === 0, String(G.gridStep));
  var dockedLabels = G.labelQueue.length;
  check('and no other body is drawn — at most the dock itself',
        dockedLabels <= 1, dockedLabels + ' labels');

  /* Undock and the world comes back. This is the half that proves the
   * suppression is conditional rather than a toggle someone left off. */
  Sim.undockShip(G.ship, G.sys, G.t, 0.003);
  G.dockTarget = null; G.dockStatus = null;
  frames(3);
  check('and once undocked the rest of the system is drawn again',
        G.labelQueue.length > dockedLabels,
        dockedLabels + ' -> ' + G.labelQueue.length + ' labels');

  /* THE ESCAPE HATCH, and the bug this nearly shipped as. F2 is the orbit
   * chart — the player asking to see the system from outside itself.
   * Answering with the inside of a hangar because that is where the hull is
   * parked would be a blank map. */
  Sim.dockShip(G.ship, port, G.sys, G.t);
  frames(2);
  check('docked again', !!G.ship.docked);
  var mark2 = drawn.texts.length;
  /* Through the key, not by poking state: mapMode reads G.panel via MODES,
   * so setting a `mode` field would have tested nothing at all. */
  var pressKey = listeners.keydown[0];
  pressKey({ key: 'F2', shiftKey: false, preventDefault: function () {} });
  frames(3);
  /* The assertion IS that the system is visible: if the enclosure
   * suppression reached the chart, this would be at most one label. */
  check('the chart still shows the system while berthed',
        G.labelQueue.length > 1,
        G.labelQueue.length + ' labels, panel ' + G.panel);
  check('and it draws cleanly', errorsSince(mark2).length === 0,
        errorsSince(mark2)[0]);

  pressKey({ key: 'Escape', shiftKey: false, preventDefault: function () {} });
  frames(2);

  newFlying('kawartha');
  for (var k in prefs) G[k] = prefs[k];
  frames(2);
})();

/* Glass, in two renderers and one shader.
 *
 * The greenhouses are the case that forced this. generate.js grows them
 * because a colony on an unbreathable world has to make its own air, and
 * render.js draws an EMISSIVE crop inside each one and then a glass drum
 * over it — with a comment saying that green is the whole point of the
 * building. The glass was opaque, so the point of the building was sealed
 * inside an unlit drum and never appeared on screen at all.
 *
 * WHAT THESE TESTS CANNOT DO: compile the shader. There is no GL in node,
 * so the GPU half is checked by pinning the dither matrix — the one part of
 * it that fails silently and looks like a texture bug rather than an error. */
/* The cockpit kit: one set of parts, assembled per ship. */
console.log('--- the cockpit kit ---');
(function () {
  var R = W.Render;
  function hullShip(id, mass) {
    return { hullId: id, dryMass: mass, bornId: id + '@test#1' };
  }
  var talon = R.cockpitSpec(hullShip('talon', 42));
  var mule = R.cockpitSpec(hullShip('mule', 80));
  var dart = R.cockpitSpec(hullShip('dart', 30));

  /* THE TALON IS THE BASELINE, and this is the check that protects the
   * hand-tuned cockpit from the parametric one. Every multiplier is 1.0 for
   * it, so its bridge must come out exactly the size it always was. */
  check('the Talon is the unchanged baseline',
        Math.abs(talon.size - 1) < 1e-9 &&
        Math.abs(talon.reach - R.CANOPY_Z) < 1e-9,
        talon.size + ' / ' + talon.reach);

  check('a heavier hull gets a roomier bridge', mule.size > talon.size,
        talon.size.toFixed(3) + ' -> ' + mule.size.toFixed(3));
  check('and a lighter one a tighter bridge', dart.size < talon.size,
        dart.size.toFixed(3));
  /* Cube root, not linear: mass is a volume and the bridge is a length.
   * Mule is 80/42 = 1.9x the mass and must NOT be 1.9x the room. */
  check('size grows as a length, not as a mass', mule.size < 1.3,
        mule.size.toFixed(3));

  check('an interceptor wraps more glass than a freighter',
        dart.arch.wrap > mule.arch.wrap);
  check('and a freighter carries more brow than an interceptor',
        mule.arch.brow > dart.arch.brow);

  /* FLAIR IS SEEDED BY bornId, NOT BY reg. A registration is a field the
   * player edits; if the bridge were hung on it, renaming the ship would
   * rebuild the cockpit around them. */
  var a = R.cockpitSpec(hullShip('talon', 42));
  var b = R.cockpitSpec(hullShip('talon', 42));
  check('the same ship gets the same cockpit twice',
        a.flair.panes === b.flair.panes &&
        Math.abs(a.flair.lean - b.flair.lean) < 1e-12);
  var renamed = hullShip('talon', 42);
  renamed.reg = 'ZZ-9999'; renamed.shipName = 'Renamed';
  check('and renaming or re-registering it does not change the room',
        Math.abs(R.cockpitSpec(renamed).flair.lean - a.flair.lean) < 1e-12);
  var other = R.cockpitSpec({ hullId: 'talon', dryMass: 42,
                              bornId: 'talon@elsewhere#77' });
  check('but a different hull, bought elsewhere, is a different room',
        Math.abs(other.flair.lean - a.flair.lean) > 1e-9,
        a.flair.lean.toFixed(4) + ' vs ' + other.flair.lean.toFixed(4));

  /* A save written before any of this has no bornId at all. It must still
   * produce a stable cockpit rather than a different one every frame. */
  var old1 = R.cockpitSpec({ hullId: 'kestrel', dryMass: 60 });
  var old2 = R.cockpitSpec({ hullId: 'kestrel', dryMass: 60 });
  check('a save with no bornId still gets a consistent bridge',
        Math.abs(old1.flair.lean - old2.flair.lean) < 1e-12);

  /* THE CANOPY. Segment 0 is the windscreen and must stay flat — a pane on
   * a sphere projects as tan(e)/cos(a) and bows off the screen at the
   * corners, which is exactly what the cockpit suite caught. */
  var segs = R.canopySegments(talon);
  check('the canopy is a windscreen plus quarter-lights', segs.length >= 3,
        segs.length + ' panes');
  var zs = segs[0].map(function (p) { return p[2]; });
  var flat = Math.max.apply(null, zs) - Math.min.apply(null, zs);
  check('the windscreen is flat, so it cannot bow off the view',
        flat < 1e-9, 'z spread ' + flat.toExponential(1));

  /* The quarter-lights must actually be outboard of it, or they are not
   * buying any visibility. */
  var mainX = Math.max.apply(null, segs[0].map(function (p) { return p[0]; }));
  var wingX = 0;
  for (var s = 1; s < segs.length; s++) {
    for (var c = 0; c < segs[s].length; c++) {
      wingX = Math.max(wingX, Math.abs(segs[s][c][0]));
    }
  }
  check('the quarter-lights reach further out than the windscreen',
        wingX > mainX, mainX.toFixed(2) + ' -> ' + wingX.toFixed(2));
  check('and they are hinged on its edge, not floating free',
        Math.abs(Math.min.apply(null,
          segs[1].map(function (p) { return Math.abs(p[0]); })) - mainX) < 1e-9);

  /* An interceptor should see further round than a freighter. */
  function sweep(sp) {
    var g = R.canopySegments(sp), m = 0;
    for (var i = 0; i < g.length; i++) {
      for (var j = 0; j < g[i].length; j++) m = Math.max(m, Math.abs(g[i][j][0]));
    }
    return m / sp.size;                 // in hull-independent terms
  }
  check('an interceptor sees further round than a freighter',
        sweep(dart) > sweep(mule),
        sweep(dart).toFixed(2) + ' vs ' + sweep(mule).toFixed(2));

  /* Rake is read off the hull where a model exists, and falls back to the
   * archetype where it does not — which is every hull under this harness. */
  /* RAKE IS MEASURED OFF THE MODEL when there is one, and this harness
   * loads the hull library — so the Talon's rake comes from its own mesh,
   * not from the table. Asserting the fallback here was wrong: it would
   * have passed only in an environment where the feature does nothing. */
  var fine = R.hullFineness('talon');
  check('the Talon has a model to measure', typeof fine === 'number' && fine > 0,
        String(fine));
  check('and its rake is derived from that hull, not from the table',
        Math.abs(talon.rake - R.COCKPIT_ARCH.talon.rake) > 1e-9,
        'measured ' + talon.rake.toFixed(3) +
        ' vs table ' + R.COCKPIT_ARCH.talon.rake);
  check('the derived rake stays inside its clamp',
        talon.rake >= 0.18 && talon.rake <= 0.72, String(talon.rake));
  /* And the fallback still works for a hull with no model at all. */
  var nomodel = R.cockpitSpec({ hullId: 'no-such-hull', dryMass: 42 });
  check('a hull with no model falls back to the archetype',
        R.hullFineness('no-such-hull') === null &&
        Math.abs(nomodel.rake - R.COCKPIT_ARCH.talon.rake) < 1e-9,
        String(nomodel.rake));
  check('a fine-nosed hull is raked more than a blunt one',
        dart.rake > mule.rake, dart.rake + ' vs ' + mule.rake);
})();

console.log('--- glass ---');
(function () {
  var R = W.Render;
  var Gen = W.Gen || global.Gen;
  var mat = R.faceMaterial;
  check('a plain colour is opaque and lit by the sun',
        mat('#405060').color === '#405060' && mat('#405060').alpha === 1 &&
        mat('#405060').lit === false);
  check("'!' still means emissive, and emissive is still opaque",
        mat('!#405060').color === '#405060' && mat('!#405060').lit === true &&
        mat('!#405060').alpha === 1);
  check("'~9' means glass at nine fifteenths",
        mat('~9#405060').color === '#405060' &&
        Math.abs(mat('~9#405060').alpha - 9 / 15) < 1e-9,
        String(mat('~9#405060').alpha));
  check('and the hex digit runs the whole range, f being solid glass',
        mat('~0#405060').alpha === 0 && mat('~f#405060').alpha === 1,
        mat('~0#405060').alpha + '..' + mat('~f#405060').alpha);
  /* A malformed prefix has to read as OPAQUE. Falling back to zero would
   * make a typo in one face colour delete a whole building, which reads as
   * a mesh that failed to load rather than as the one-character mistake it
   * is. */
  check('a malformed opacity digit falls back to opaque, not invisible',
        mat('~z#405060').alpha === 1 && mat('~z#405060').color === '#405060');
  check('and no colour at all still means "use the tint"',
        mat(null).color === null && mat(null).alpha === 1);

  /* The 2D path, end to end: build a real port's dressing mesh and paint
   * it. The observable is the stub's translucent-fill log — a pane of glass
   * and a solid wall of the same colour are otherwise identical. */
  newFlying('kawartha');
  frames(2);
  var domePort = null, i;
  for (i = 0; i < (G.sys.ports || []).length; i++) {
    var p = G.sys.ports[i];
    if (p.surface && p.dressing && p.dressing.domes && p.dressing.domes.length) {
      domePort = p; break;
    }
  }
  check('a surface port in the seeded system has greenhouses', !!domePort,
        domePort && domePort.name);

  if (domePort) {
    var mesh = R.portDressingMesh(domePort);
    check('its dressing mesh builds', !!(mesh && mesh.f && mesh.f.length));

    if (mesh && mesh.c) {
      var glassFaces = 0, cropFaces = 0;
      for (i = 0; i < mesh.c.length; i++) {
        var m = mat(mesh.c[i]);
        if (m.alpha < 1) glassFaces++;
        /* The crop is the only emissive green in there. */
        if (m.lit && /^#[0-9a-f]{6}$/i.test(m.color)) {
          var n = parseInt(m.color.slice(1), 16);
          if (((n >> 8) & 255) > ((n >> 16) & 255) + 30) cropFaces++;
        }
      }
      check('the panes are translucent', glassFaces > 0, glassFaces + ' faces');
      check('and there is a lit crop underneath to see through them',
            cropFaces > 0, cropFaces + ' faces');
    }

    /* And it reaches the canvas. paintMesh is called directly rather than
     * through a frame, because the GPU layer is absent under node and the
     * frame path would take the fallback anyway — this makes that explicit
     * instead of depending on it. */
    var before = drawn.glass.length;
    var gcam = new R.Camera();
    gcam.eye = { x: 0, y: 0, z: 0 };
    gcam.f = { x: 0, y: 0, z: 1 }; gcam.r = { x: 1, y: 0, z: 0 };
    gcam.u = { x: 0, y: 1, z: 0 };
    gcam.near = 0.001; gcam.flen = 667;
    gcam.cx = 800; gcam.cy = 450; gcam.w = 1600; gcam.h = 900;
    var gframe = { pos: { x: 0, y: 0, z: 40 }, fwd: { x: 0, y: 0, z: 1 },
                   up: { x: 0, y: 1, z: 0 }, right: { x: 1, y: 0, z: 0 } };
    ctxStub.globalAlpha = 1;
    R.paintMesh(ctxStub, gcam, gframe, mesh, domePort.radius || 1,
                { x: 0, y: 0, z: 1 }, '#8894a8');
    check('painting it fills something at less than full opacity',
          drawn.glass.length > before,
          (drawn.glass.length - before) + ' translucent fills');
    var got = drawn.glass.slice(before);
    var right = 0;
    for (i = 0; i < got.length; i++) {
      if (Math.abs(got[i].alpha - 9 / 15) < 1e-9) right++;
    }
    check('at exactly the opacity the face asked for', right === got.length,
          right + '/' + got.length);
    /* globalAlpha is a sticky property. Leaving it below 1 would silently
     * wash out every hull painted after a greenhouse. */
    check('and the opacity is put back before anything else is drawn',
          !(ctxStub.globalAlpha < 1), String(ctxStub.globalAlpha));
  }

  /* ---- the dither matrix, pinned ---------------------------------------
   * A reference implementation of the shader's bayer8, verified here for
   * the two properties that make it a Bayer matrix rather than blotches:
   * over one 8x8 tile it hits all 64 levels exactly once, and at 50% every
   * 2x2 block is exactly half lit. Then the shader's own six bit terms are
   * read out of the GLSL and compared, which is what catches the real
   * failure mode — a transposed shift compiles perfectly and just quietly
   * clumps the pattern into visible blocks. */
  function bayer8(px, py) {
    var x = (px ^ py) & 7, y = py & 7;
    return (((x >> 2) & 1)) | (((y >> 2) & 1) << 1) |
           (((x >> 1) & 1) << 2) | (((y >> 1) & 1) << 3) |
           ((x & 1) << 4) | ((y & 1) << 5);
  }
  var seen = {}, distinct = 0;
  for (var jy = 0; jy < 8; jy++) {
    for (var ix = 0; ix < 8; ix++) {
      var v = bayer8(ix, jy);
      if (!seen[v]) { seen[v] = 1; distinct++; }
    }
  }
  check('the dither matrix hits all 64 levels exactly once', distinct === 64,
        distinct + ' distinct');
  var worst = 0;
  for (jy = 0; jy < 8; jy += 2) {
    for (ix = 0; ix < 8; ix += 2) {
      var on = 0;
      for (var b = 0; b < 2; b++) {
        for (var a = 0; a < 2; a++) if (bayer8(ix + a, jy + b) < 32) on++;
      }
      worst = Math.max(worst, Math.abs(on - 2));
    }
  }
  check('and it disperses — every 2x2 is half lit at 50%', worst === 0,
        'worst imbalance ' + worst);

  /* The GLSL as text. There is no WebGL under node, so the shader cannot be
   * compiled here — but it is a string in a file, and the one part of it
   * that fails SILENTLY is worth reading even so. Sliced to the bayer8 body
   * so the pattern below cannot match arithmetic from anywhere else. */
  var glsrc = require('fs').readFileSync(
    require('path').join(__dirname, '..', 'src', 'gl.js'), 'utf8');
  var at = glsrc.indexOf('float bayer8');
  var src = at < 0 ? '' : glsrc.slice(at, at + 900);
  check('the mesh shader carries a dither at all', at >= 0);
  /* Six terms of the form ((x >> N) & 1) << M, in source order. Read as
   * pairs so whitespace and formatting can change without breaking this,
   * but a swapped shift or a swapped destination bit cannot. */
  var terms = [];
  var re = /\(\((x|y) >> (\d)\) & 1\)|\((x|y) & 1\)/g, mm;
  while ((mm = re.exec(src))) {
    terms.push(mm[1] ? (mm[1] + mm[2]) : (mm[3] + '0'));
  }
  check('and its bit order is the one verified above',
        terms.join(',') === 'x2,y2,x1,y1,x0,y0', terms.join(','));
  check('the opaque path short-circuits, so a hull pays one compare',
        /a < 0\.999 && a < bayer8/.test(glsrc) && /discard/.test(glsrc));
})();

console.log('--- the near plane belongs to the hardware ---');
(function () {
  /* WHAT THIS IS GUARDING.
   *
   * Both vertex shaders used to answer "this vertex is behind the eye" by
   * moving it to NDC (2,2) and returning. That is not clipping: the
   * triangle still rasterizes, now with a made-up third corner, so a wall
   * the eye is standing inside paints as a huge flat wedge with a hard
   * straight edge across the canopy — the thing Astra reported four times
   * as a camera bug — and a console panel a foot from the pilot's face
   * skews out of its housing the moment you turn your head.
   *
   * The fix hands the rasterizer honest clip coordinates and lets IT cut
   * the triangle, which is the only stage that can make new vertices. This
   * checks both halves of that: the shader text no longer parks anything,
   * and the arithmetic it replaced the divide with is the same arithmetic.
   * There is no WebGL under node, so the text is read as text — the same
   * bargain the dither check above makes. */
  var glsrc2 = require('fs').readFileSync(
    require('path').join(__dirname, '..', 'src', 'gl.js'), 'utf8');
  /* The GLSL only, with the JS block comments around it stripped out.
     Without that strip this reads the prose as if it were code — and the
     note on VERT_MESH QUOTES the line it replaced, which is exactly the
     line these checks are looking for. It caught itself the first time it
     ran. */
  function shader(name) {
    var a = glsrc2.indexOf('var ' + name + ' = [');
    if (a < 0) return '';
    var b = glsrc2.indexOf("].join('\\n')", a);
    if (b < 0) return '';
    return glsrc2.slice(a, b).replace(/\/\*[\s\S]*?\*\//g, '');
  }
  var mesh = shader('VERT_MESH'), panel = shader('VERT_PANEL');
  check('both vertex shaders are there to read', mesh.length > 200 && panel.length > 200,
        mesh.length + ' / ' + panel.length);

  /* The park-off-screen hack, gone from both. The stars shader keeps its
   * own — a point is a single vertex with nothing to interpolate against,
   * so moving it off screen IS the correct answer there. */
  check('the mesh shader no longer parks a behind-eye vertex off screen',
        mesh.indexOf('vec4(2.0, 2.0') < 0);
  check('nor does the panel shader',
        panel.indexOf('vec4(2.0, 2.0') < 0);
  check('and the stars shader still does, because a point has no triangle',
        shader('VERT_STARS').indexOf('vec4(2.0, 2.0') >= 0);

  /* The near plane itself. z = depth - 2*uNear against w = depth makes
   * GL's own z >= -w test read exactly "depth >= uNear". */
  var zw = /gl_Position = vec4\(clipXY, depth - 2\.0 \* uNear, depth\)/;
  check('the mesh shader clips at uNear and nowhere else', zw.test(mesh));
  check('so does the panel shader', zw.test(panel));
  check('the mesh vertex stage declares the uNear it now needs',
        /uniform float uNear/.test(mesh));
  check('and so does the panel vertex stage',
        /uniform float uNear/.test(panel));
  /* No divide left in either — the whole point is that the clip
   * coordinates stay finite for a vertex at or behind the eye. */
  check('neither vertex shader divides by depth any more',
        mesh.indexOf('uFlen / depth') < 0 && panel.indexOf('uFlen / depth') < 0);

  /* THE ARITHMETIC IS THE SAME ARITHMETIC. Expanding ndc*depth by hand
   * cancels the 1/depth; in front of the eye the new expression has to
   * agree with the old one to the last bit that matters, or every hull in
   * the game moves. Both written out here from the shader text's own
   * shape rather than imported, because there is nothing to import. */
  var W = 1024, H = 768, flen = 613.2, cx = W / 2, cy = H / 2;
  function oldClip(R, U, d) {
    var k = flen / d;
    var px = cx + R * k, py = cy - U * k;
    return { x: (px / W * 2 - 1) * d, y: (1 - py / H * 2) * d, w: d };
  }
  function newClip(R, U, d) {
    var c2x = cx * 2 / W, c2y = cy * 2 / H;
    return { x: (c2x - 1) * d + R * (2 * flen) / W,
             y: (1 - c2y) * d + U * (2 * flen) / H, w: d };
  }
  var worst = 0;
  for (var R = -400; R <= 400; R += 37) {
    for (var U = -400; U <= 400; U += 41) {
      for (var d = 0.0002; d < 4000; d *= 3.7) {
        var o = oldClip(R, U, d), n = newClip(R, U, d);
        /* Relative to w, because clip coordinates are only ever read
         * after the divide by it. */
        worst = Math.max(worst, Math.abs(o.x - n.x) / d, Math.abs(o.y - n.y) / d);
      }
    }
  }
  /* In NDC, where 1 unit is half the viewport. The residual is float64
   * cancellation in the OLD form — it computes (px/W*2 - 1) as a number
   * just over 1 minus 1 — and the new form is the better-conditioned of
   * the two, not the worse. At half a 1024-pixel viewport this bound is
   * well under a millionth of a pixel. */
  check('in front of the eye the new clip coords are the old ones',
        worst < 1e-8, 'worst ndc error ' + worst);

  /* And the cut lands where it says it does. GL clips an edge where
   * z + w changes sign; along a segment running from in front of the eye
   * to behind it, that crossing has to be at depth == uNear. */
  var near = 1e-4;
  function zPlusW(d) { return (d - 2 * near) + d; }
  var d0 = 3.0, d1 = -2.0;
  var tCross = zPlusW(d0) / (zPlusW(d0) - zPlusW(d1));
  var dCross = d0 + (d1 - d0) * tCross;
  check('a segment crossing the eye is cut at the near plane',
        Math.abs(dCross - near) < 1e-15, 'cut at ' + dCross);
  check('and a vertex just inside the near plane survives', zPlusW(near * 1.001) > 0);
  check('while one just outside it does not', zPlusW(near * 0.999) < 0);
})();

console.log('--- and the 2D painter cuts the same wall ---');
(function () {
  /* The other renderer, same wall. paintMesh used to project the three
   * corners and drop the face the moment one came back null, which is what
   * Camera.project does for a point behind the eye — so berthed inside a
   * station, where most of the room straddles the eye, the 2D path lost
   * most of the room. A hole is a quieter failure than the GPU path's
   * smear and it is the same failure: the near plane was nobody's job.
   *
   * Its own recording context, because the shared stub deliberately keeps
   * no path points (see the note on `fill`) and this test is entirely
   * about which points reached the path. */
  var pts = [], fills = 0;
  var rec = {
    globalAlpha: 1, save: function () {}, restore: function () {},
    beginPath: function () {}, closePath: function () {},
    moveTo: function (x, y) { pts.push({ x: x, y: y }); },
    lineTo: function (x, y) { pts.push({ x: x, y: y }); },
    fill: function () { fills++; }, stroke: function () {}
  };
  function reset() { pts = []; fills = 0; rec.globalAlpha = 1; }

  var R = W.Render;
  var cam = new R.Camera();
  cam.eye = { x: 0, y: 0, z: 0 };
  cam.f = { x: 0, y: 0, z: 1 }; cam.r = { x: 1, y: 0, z: 0 };
  cam.u = { x: 0, y: 1, z: 0 };
  cam.near = 1e-4; cam.flen = 600;
  cam.cx = 400; cam.cy = 300; cam.w = 800; cam.h = 600;
  var frame = { pos: { x: 0, y: 0, z: 0 }, fwd: { x: 0, y: 0, z: 1 },
                up: { x: 0, y: 1, z: 0 }, right: { x: 1, y: 0, z: 0 } };
  var sun = { x: 0, y: 0, z: 1 };

  /* A floor slab running from two km ahead to two km behind the eye — the
   * shape of every deck you are parked on. */
  var straddle = {
    v: [[-1, -0.5, 2], [1, -0.5, 2], [1, -0.5, -2], [-1, -0.5, -2]],
    f: [[0, 1, 2], [0, 2, 3]],
    c: ['#8993a1', '#8993a1']
  };
  reset();
  R.paintMesh(rec, cam, frame, straddle, 1, sun, '#8993a1');
  check('a face straddling the eye still reaches the canvas', fills === 2,
        fills + ' fills');
  check('and every point it put there is a real coordinate',
        pts.length >= 6 && pts.every(function (q) {
          return isFinite(q.x) && isFinite(q.y);
        }), pts.length + ' points');
  /* The give-away of the old sign flip: a corner behind the eye projects
   * to the mirror image of where it belongs, hundreds of screens away. */
  check('none of them is off in the flipped half of the projection',
        pts.every(function (q) {
          return Math.abs(q.x) <= 2e4 && Math.abs(q.y) <= 2e4;
        }));

  /* AND NOTHING CHANGES FOR ORDINARY GEOMETRY. A face wholly in front of
   * the eye survives the clip untouched, three corners in and three out —
   * which is the whole of what the old path could do, still done. */
  var ahead = {
    v: [[-1, -0.5, 4], [1, -0.5, 4], [0, 1, 4]],
    f: [[0, 1, 2]], c: ['#8993a1']
  };
  reset();
  R.paintMesh(rec, cam, frame, ahead, 1, sun, '#8993a1');
  check('a face wholly in front of the eye is drawn as a triangle',
        fills === 1 && pts.length === 3, fills + ' fills, ' + pts.length + ' points');
  var expect = [
    { x: 400 - 150, y: 300 + 75 }, { x: 400 + 150, y: 300 + 75 },
    { x: 400, y: 300 - 150 }
  ];
  var off = 0;
  for (var i = 0; i < expect.length && i < pts.length; i++) {
    off = Math.max(off, Math.abs(pts[i].x - expect[i].x),
                        Math.abs(pts[i].y - expect[i].y));
  }
  check('at exactly the pixels the projection has always put it at',
        off < 1e-9, 'worst ' + off + ' px');

  /* Wholly behind, and it is gone. Clipping is not a licence to draw what
   * is at your back. */
  var behind = {
    v: [[-1, -0.5, -4], [1, -0.5, -4], [0, 1, -4]],
    f: [[0, 1, 2]], c: ['#8993a1']
  };
  reset();
  R.paintMesh(rec, cam, frame, behind, 1, sun, '#8993a1');
  check('a face wholly behind the eye is still dropped',
        fills === 0 && pts.length === 0, fills + ' fills');
})();

console.log('--- underground bays ---');
(function () {
  newFlying('kawartha');
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
  newFlying('kawartha');
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
  newFlying('kawartha');
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
  newFlying('kawartha');
  frames(2);
  var reach = Galaxy.reachable(G.galaxy, G.here, G.ship);
  var plan = Galaxy.jumpPlan(G.galaxy, G.here, reach[0].star, G.ship);

  // Both views, all the way through, with the head turned.
  ['cockpit', 'orbit'].forEach(function (mode) {
    newFlying('kawartha');
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
  newFlying('kawartha');
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
    newFlying('kawartha');
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
  newFlying('kawartha');
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
  newFlying('kawartha');
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

    /* THE PAYOFF, end to end. The chase, the lock and the drop-out were all
     * built before there was anything to do at the end of them: the planted
     * ship flies an interstellar lane, no system's traffic list has ever
     * heard of it, so it inherited no manifest and reported itself running
     * empty every single time. An empty room at the end of the best sequence
     * in the game. */
    var tornSpec = G.sys.patrols[0];
    var hold = W.Combat.holdOf(G.sys, tornSpec);
    check('the ship we tore out is actually carrying something',
          hold.length > 0 && (hold[0].qty || hold[0].tonnes) > 0,
          JSON.stringify(hold));
    check('and it has a purse worth taking',
          W.Combat.purseOf(G.sys, tornSpec) > 0,
          String(W.Combat.purseOf(G.sys, tornSpec)));

    /* Reachable from the seat, not just from the API — the demand lives on
     * the comms channel and this is the path a player actually walks. */
    G.panel = 3;
    frames(2);
    var cl = W.Screens.commsContacts();
    var si = -1;
    for (var cc = 0; cc < cl.length; cc++) if (cl[cc].kind === 'ship') { si = cc; break; }
    check('the torn-out ship is on the comms list', si >= 0);
    if (si >= 0) {
      G.commsSel = si;
      frames(2);
      var pirOpt = G.hotspots.filter(function (s) { return s.hint === 'Piracy…'; })[0];
      check('and the piracy option is on its channel', !!pirOpt);

      var quiet = { say: function () {}, sound: function () {} };
      var credBefore = G.ship.credits;
      W.Combat.demandFrom(G.sys, G, G.t, cl[si].obj, 'credits', quiet);
      var afterFirst = G.ship.credits;
      check('a demand out here actually pays', afterFirst > credBefore,
            (afterFirst - credBefore) + ' cr');
      W.Combat.demandFrom(G.sys, G, G.t, cl[si].obj, 'credits', quiet);
      W.Combat.demandFrom(G.sys, G, G.t, cl[si].obj, 'credits', quiet);
      check('and asking again does not — no infinite bank in deep space',
            G.ship.credits === afterFirst,
            (G.ship.credits - afterFirst) + ' cr extra');
    }
    G.panel = 0;
    frames(2);

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
  newFlying('kawartha');
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
  newFlying('kawartha');
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
  newFlying('kawartha');
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

  newFlying('kawartha');
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

  /* --- following a wake, through the real key handler ------------------
   * This is the verb the whole scanning mechanic exists for: read a wake,
   * lay in a course after it, and be told whether the chase is on. */
  function pressK(k, shift) {
    listeners.keydown[0]({ key: k, shiftKey: !!shift,
                           preventDefault: function () {} });
  }

  /* Out of range first: it must refuse rather than lay in a course to
   * nowhere. */
  G.ship.pos = { x: wpos.x + Slip.WAKE_SCAN_RANGE * 4, y: wpos.y, z: wpos.z };
  G.wakeChase = null;
  G.starMap = null;
  frames(1);
  pressK('J', true);
  frames(1);
  check('Shift+J with no wake in range lays in nothing', !G.wakeChase && !G.starMap);

  /* Now sitting on it. */
  G.ship.pos = { x: wpos.x + 400, y: wpos.y, z: wpos.z };
  frames(1);
  var readNow = Slip.scanWake(target, 400);
  pressK('J', true);
  frames(1);
  check('Shift+J on a readable wake lays in a chase', !!G.wakeChase,
        readNow.note);
  if (G.wakeChase) {
    check('and it names the star the wake pointed at',
          G.wakeChase.starId === readNow.destination.id,
          G.wakeChase.starId + ' vs ' + readNow.destination.id);
    check('and the chart is sitting on that same star',
          !!G.starMap && G.starMap.list[G.starMap.sel].to.id === readNow.destination.id);
    /* A full read must produce an actual verdict, not a shrug. */
    if (readNow.tonnes) {
      check('a full read yields a real intercept verdict',
            G.wakeChase.blind === false && typeof G.wakeChase.at === 'number',
            JSON.stringify({ blind: G.wakeChase.blind, at: G.wakeChase.at }));
      check('and does not claim to be an estimate',
            G.wakeChase.estimated === false);
    }
  }

  /* The persistent banner must survive the transient message fading — that
   * is the entire reason it exists, since you fly for a while before you
   * jump and re-scanning may no longer give you the same fidelity. */
  var markC = drawn.texts.length;
  frames(3);
  check('the chase banner is drawn while flying',
        drawn.texts.slice(markC).some(function (s) {
          return typeof s === 'string' && s.indexOf('CHASING') === 0;
        }),
        drawn.texts.slice(markC).slice(0, 5).join(' | '));

  /* Shift+J must NOT also open the chart — J does that, and a shifted
   * binding that fires both would make the unshifted one unusable. */
  G.starMap = null;
  G.panel = 0;
  pressK('J', true);
  frames(1);
  check('Shift+J does not open the chart screen', G.panel === 0, String(G.panel));

  /* A partial read should estimate from the hull class and SAY so, rather
   * than either refusing or pretending to certainty. Exercised directly,
   * since finding a wake at exactly the right fidelity is not something the
   * timetable owes us. */
  var midRead = Slip.scanWake(target, Slip.WAKE_SCAN_RANGE * 0.62);
  if (midRead.hullClass && !midRead.tonnes) {
    check('a class-only read still estimates a tonnage',
          Slip.classTypicalTonnes(midRead.hullClass) > 0,
          midRead.hullClass);
  }
  check('every hull class has a representative tonnage',
        ['I', 'II', 'III', 'IV'].every(function (c) {
          return Slip.classTypicalTonnes(c) > 0;
        }));
  check('and they rise with the class',
        Slip.classTypicalTonnes('I') < Slip.classTypicalTonnes('II') &&
        Slip.classTypicalTonnes('II') < Slip.classTypicalTonnes('III') &&
        Slip.classTypicalTonnes('III') < Slip.classTypicalTonnes('IV'));

  /* And arriving anywhere clears the chase — its arithmetic was computed
   * from a departure point you are no longer standing on. */
  G.wakeChase = { starId: 'x', name: 'ghost', blind: true };
  newFlying('kawartha');
  frames(2);
  check('a new career clears any wake chase', !G.wakeChase);

  newFlying('kawartha');
  for (var k in prefs) G[k] = prefs[k];
  frames(2);
})();

console.log('--- the cruise drive ---');
(function () {
  newFlying('kawartha');
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
  newFlying('kawartha');
  frames(2);
  var keydown = listeners.keydown[0];
  function press(k) { keydown({ key: k, shiftKey: false, preventDefault: function () {} }); }

  /* A PORT WITH ROOM IN IT, chosen rather than assumed.
   *
   * What this section is about is an approach flown clean being met with a
   * clearance instead of a citation, and a port only hails a ship it can
   * actually take. Taking whichever orbital port sorted first meant the
   * section tested that on some timetables and the congestion rule on
   * others — which is how it came to read as a renderer failure the day
   * the fuel tanks grew: a heavier hull moved a surface port off the
   * qualifying list, which moved the traffic, which left the first port in
   * the array with all five of its small berths full at the minute this
   * runs. The berth pool a shuttle competes for is the one to ask about,
   * which is what passing G.ship does. */
  var orbital = G.sys.ports.filter(function (p) { return !p.surface && p.docking; });
  var port = orbital.filter(function (p) {
    return !Sim.berthStatus(p, G.sys, G.t, G.ship).full;
  })[0] || orbital[0];
  check('there is an orbital port with a berth free to fly to', !!port &&
        !Sim.berthStatus(port, G.sys, G.t, G.ship).full,
        port && port.name);
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

  /* THAT DOCK USED TO BE UNANNOUNCED, and this block used to assert the
   * price of it: the port logged the ship FUGITIVE, and a fugitive's ports
   * do not open. That was the exact chain that made a real career
   * unfinishable — an approach flown perfectly into a fine, a standing hit
   * and every door in the system shut.
   *
   * The port hails you now. Ten kilometres out it looked at its berths and
   * its warrant list, found nothing wrong, and cleared the ship without
   * being asked, so the arrival settled that clearance instead of booking
   * an offence. Which is the whole point of the change, and pinning it HERE
   * is what says the two halves are actually wired to each other: the sweep
   * in main.js and the price in combat.js, met by a ship that flew the
   * approach on autopilot and touched nothing. */
  check('flying an approach no longer makes you a fugitive',
        !Combat.dockRefusal(G, port),
        Combat.dockRefusal(G, port) ? Combat.dockRefusal(G, port).short : '');
  check('and the clearance it was given was spent on arriving, not left lying around',
        !Combat.isCleared(G, port));
  G.fugitive = null;
  G.wanted = {};

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
  newFlying('kawartha');
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
  newFlying('kawartha');
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

/* ---- a port that will not open says so ---------------------------------
 * The failure this pins is not a wrong number, it is a silence. A barred
 * station used to let auto-dock fly the whole approach, sit in the capture
 * envelope, and do nothing except mutter about a bounty once every six
 * seconds - and it named a bounty whichever bar it actually was. From the
 * seat that is indistinguishable from an autopilot that cannot fly, which
 * is exactly how it was reported.
 *
 * So: the refusal carries a reason (house rule 5), auto-dock refuses to
 * start rather than flying an errand it cannot finish, and the clearance
 * readout says REFUSED rather than the actively misleading NOT REQUESTED. */
console.log('--- a barred port ---');
(function () {
  newFlying('kawartha');
  frames(2);
  var keydown = listeners.keydown[0];
  function press(k) { keydown({ key: k, shiftKey: false, preventDefault: function () {} }); }

  var port = G.sys.ports.filter(function (p) {
    return !p.surface && p.faction;
  })[0];
  check('there is an orbital port with a faction to be barred by', !!port);
  if (!port) return;

  var fac = port.faction.id || port.faction;
  G.fugitive = null;
  G.expelled = null;
  check('and it is open to begin with', !Combat.dockRefusal(G, port));

  /* Logged FUGITIVE with whoever holds it - one unannounced arrival does
   * this, which is the case the player is most likely to meet. */
  G.fugitive = { faction: fac, amount: 400, port: port.name, sinceT: G.t };

  var bar = Combat.dockRefusal(G, port);
  check('now it refuses', !!bar);
  check('and the refusal knows which bar it is', bar && bar.why === 'fugitive', bar && bar.why);
  check('and says so in words rather than a flag',
        !!(bar && bar.text && bar.text.length > 20));
  check('with a short form for a readout', !!(bar && bar.short));

  var ps = Sim.bodyState(port, G.sys, G.t);
  G.ship.docked = null; G.dockTarget = null; G.autodock = null; G.cruise = null;
  G.ship.pos = V.addScaled(ps.pos, { x: 1, y: 0.3, z: 0.2 }, 300);
  G.ship.vel = V.clone(ps.vel);
  Sim.refreshShip(G.ship);
  G.navTarget = { kind: 'body', id: port.id };
  frames(1);

  var mark = drawn.texts.length;
  press('t');                       // clamp assigned - you may still fly there
  press('t');                       // and this is where it should say no
  check('auto-dock refuses to engage against a barred port', !G.autodock);
  frames(2);
  var said = drawn.texts.slice(mark).join(' | ');
  check('and it explains why on screen', said.indexOf('fugitive') >= 0, said.slice(-260));

  /* Barred MID-FLIGHT is the other half: a bounty can grow while you are
   * already on the approach, and the autopilot has to notice.
   *
   * ONE press, not two. The clamp is already assigned from the refused
   * attempt above, so the first T is the engage — a second would read as
   * "cancel". */
  G.fugitive = null;
  press('t');
  check('with the bar lifted it engages again', !!G.autodock);
  G.fugitive = { faction: fac, amount: 400, port: port.name, sinceT: G.t };
  frames(3);
  check('and it gives up once the doors shut mid-approach', !G.autodock);

  G.fugitive = null;
  G.autodock = null;
  G.dockTarget = null;
})();

/* ---- a station berth is a room you are inside -------------------------
 * Berthing at an orbital station used to leave you outdoors: the solar
 * system was drawn straight through the hull you were sitting in - orbit
 * lines, planet markers and the altitude ladder painted over solid plate.
 * enclosedPort answered only for surface ports, so nothing downstream knew
 * you were indoors.
 *
 * Three things follow from widening it, and all three are worth pinning
 * because two of them fail silently: the camera has to be held inside the
 * ALCOVE the ship is actually parked in rather than a hall at the hub, and
 * the modelled interior must NOT be drawn from an alcove that is nowhere
 * near it - that one reads as a screenful of grey slabs. */
console.log('--- berthed inside a station ---');
(function () {
  var Render = W.Render, Gen = W.Gen;
  newFlying('kawartha');
  frames(2);
  var port = G.sys.ports.filter(function (p) { return !p.surface; })[0];
  check('there is an orbital station to berth in', !!port);
  if (!port) return;
  var role = Render.portModelFor(port);

  /* THE ROOM IS THE BERTH when the art declares one. A modelled station's
   * alcove, not the chamber table - the ring's rim berths sit at 0.65 radii
   * while the hall table describes something at the hub. Earlier blocks in
   * this file swap the port library for fixtures and back, so whether a
   * model is loaded right here is not this section's business; the berth
   * assertions run when there is one and the camera assertions run either
   * way, because the clamp has to work for a bare station too. */
  var room = Sim.berthRoom(port, 0);
  if (room) {
    var g = Gen.bayGeometry(port);
    check('and it is NOT the shared chamber table',
          Math.abs(room.x1 - g.chamberX) > 1e-6 ||
          Math.abs(room.y1 - g.chamberY) > 1e-6,
          JSON.stringify(room) + ' vs chamber ' + g.chamberX + '/' + g.chamberY);
    check('with real extent in all three axes',
          room.x1 > room.x0 && room.y1 > room.y0 && room.z1 > room.z0,
          JSON.stringify(room));
  }
  /* Same index means the same alcove to every reader of it. */
  var a = Sim.berthRoom(port, 2), b2 = Sim.berthRoom(port, 2);
  check('asking twice gives the same alcove, or none at all',
        (!a && !b2) || (!!a && !!b2 && a.x0 === b2.x0 && a.z1 === b2.z1));

  /* THE CAMERA. Berthed, the boom has to come in to fit the room - and it
   * must NOT collapse onto the hull, which is what a clearance margin
   * bigger than the room it is clearing would do. */
  Sim.dockShip(G.ship, port, G.sys, G.t);
  /* The clamp only runs while the camera is following the SHIP - with the
   * focus parked on some other body it is a chart, not a window, and an
   * earlier section leaves one set. */
  G.focus = null;
  G.followShip = true;
  G.viewMode = 'orbit';
  G.cam.dist = 500;                       // km, absurdly far for a berth
  frames(3);
  check('the boom is pulled in to fit the berth', G.cam.dist < 500,
        'dist ' + G.cam.dist.toFixed(4) + ' km');
  check('but not welded to the hull', G.cam.dist > 0.006 * 1.0001,
        'dist ' + G.cam.dist.toFixed(4) + ' km');
  check('and it renders from in there without error',
        errorsSince(drawn.texts.length - 1).length === 0);


  /* THE INTERIOR is the hall at the hub, and from a rim alcove you are not
   * in it. Drawing it anyway is the slab bug: paintMesh sorts within one
   * mesh, so a hall you are not standing in lands on top of the wall a few
   * metres from your face. */
  var lib = Render.libPort(role);
  check('the interior gate answers without a model rather than throwing',
        Render.insideInterior({ eye: { x: 0, y: 0, z: 0 } },
                              { pos: { x: 0, y: 0, z: 0 },
                                right: { x: 1, y: 0, z: 0 },
                                up: { x: 0, y: 1, z: 0 },
                                fwd: { x: 0, y: 0, z: 1 } }, 1, 'no-such-role') === false);
  if (lib && lib.interior) {
    var far = { eye: { x: 1e9, y: 1e9, z: 1e9 } };
    var frame = { pos: { x: 0, y: 0, z: 0 },
                  right: { x: 1, y: 0, z: 0 },
                  up: { x: 0, y: 1, z: 0 },
                  fwd: { x: 0, y: 0, z: 1 } };
    check('an eye nowhere near the hall is not inside it',
          Render.insideInterior(far, frame, 1, role) === false);
    var atHub = { eye: { x: 0, y: 0, z: 0 } };
    check('and an eye at the hub is', Render.insideInterior(atHub, frame, 1, role) === true);
    check('a missing camera answers no rather than throwing',
          Render.insideInterior(null, frame, 1, role) === false);
  }

  /* AND THE MODELS THAT DECLARE NO INTERIOR AT ALL. Three of the fifteen
   * orbital models are like this, and for them drawStationInterior falls
   * back to the procedural hall — so the gate has to fall back to the SAME
   * mesh's bounds. Answering null here would have meant the room was drawn
   * by one half of the pair and gated to death by the other: never visible
   * at a city port, for the life of the game, with nothing to see in the
   * logs. */
  (function () {
    /* ports.js is not loaded in this suite - it is 15 MB of generated art
     * and the shipping page loads it separately - so the bare model is a
     * fixture, the same way the import section above builds its fixtures.
     * What is being pinned is the FALLBACK, and a fixture with no interior
     * bucket is exactly as bare as a city port. */
    var had = W.PortLib;
    W.PortLib = { 'bare-station': { kind: 'orbital', v: [[0, 0, 0]], f: [], pal: [], ci: [] } };
    Render.reloadPorts();
    var bare = 'bare-station';
    var bb = Render.interiorBounds(bare);
    check('a station model with no interior still has a room to be inside',
          !!bb, bare);
    if (!bb) { W.PortLib = had; Render.reloadPorts(); return; }
    var frame2 = { pos: { x: 0, y: 0, z: 0 },
                   right: { x: 1, y: 0, z: 0 },
                   up: { x: 0, y: 1, z: 0 },
                   fwd: { x: 0, y: 0, z: 1 } };
    var mid = { eye: { x: (bb.lo[0] + bb.hi[0]) / 2,
                       y: (bb.lo[1] + bb.hi[1]) / 2,
                       z: (bb.lo[2] + bb.hi[2]) / 2 } };
    check('and standing in the middle of it reads as inside',
          Render.insideInterior(mid, frame2, 1, bare) === true,
          JSON.stringify(mid.eye));
    /* The room is the procedural hall, so it has to be the hall's size and
     * not the shed's — the two tables are a factor of two apart and the
     * mesh used to be built from whichever one a stub port resolved to. */
    var g2 = Gen.stationBay({ radius: 1 });
    check('and that room is the hall, at the hall\'s size',
          bb.hi[0] <= g2.chamberX * 1.10 && bb.hi[0] >= g2.chamberX * 0.90,
          'x extends to ' + bb.hi[0].toFixed(3) + ', chamberX ' + g2.chamberX);
    W.PortLib = had;
    Render.reloadPorts();
  })();

  Sim.undockShip(G.ship, G.sys, G.t, 0.003);
  G.ship.docked = null;
  G.dockTarget = null;
})();

/* ---- leaving does not put the sky back inside the station ---------------
 * Astra photographed this: undock, and the stars, the planets and the orbit
 * lines are drawn straight through the hull around you, while the ship is
 * still sitting in the throat. Being DOCKED was never the right question —
 * the question is whether something is over your head — and enclosedPort
 * only knew about the docked flag and a running arrival.
 *
 * Sim.insideStation answers it off the model's own geometry, so this pins
 * the geometry rather than the flag: berthed, just-undocked, and well clear
 * all have to come out right, and the middle one is the bug. */
console.log('--- leaving a station, still inside it ---');
(function () {
  newFlying('kawartha');
  frames(2);
  var port = G.sys.ports.filter(function (p) { return !p.surface && p.docking; })[0];
  check('there is a station to leave', !!port);
  if (!port || !Sim.insideStation) return;

  Sim.dockShip(G.ship, port, G.sys, G.t);
  frames(1);
  check('berthed, the station is where you are',
        Sim.insideStation(G.ship.pos, G.sys, G.t) === port);

  /* THE MOMENT THE CLAMPS LET GO. Nothing has moved yet — that is the
   * point. A predicate that keyed off the docked flag flips here; one that
   * asks the model does not. */
  Sim.undockShip(G.ship, G.sys, G.t, 0.003);
  frames(1);
  check('and the instant the clamps let go, you are still inside it',
        Sim.insideStation(G.ship.pos, G.sys, G.t) === port,
        'docked=' + G.ship.docked);

  /* AND OUT. Four radii off is unambiguously space, and if this ever says
   * otherwise the grid has leaked and the sky would vanish in open flight. */
  var out = V.addScaled(Sim.bodyPosition(port, G.sys, G.t), { x: 1, y: 0, z: 0 },
                        (port.radius || 1) * 4);
  check('but well clear of it you are not', !Sim.insideStation(out, G.sys, G.t));

  G.ship.docked = null;
  G.dockTarget = null;
})();

/* ---- the port calls you ------------------------------------------------
 * Ten kilometres out, a port with room hails an approaching ship and clears
 * it. Combat owns the judgement and combat.test.js pins it; what THIS pins
 * is the sweep — that it happens at all, at the right range, off nothing
 * but proximity and a closing velocity.
 *
 * Worth its own section because the bug it closes cost a real career. The
 * clearance ritual was three keystrokes with the answer yes almost every
 * time, and forgetting it once was a fine, a standing hit and a FUGITIVE
 * flag, which shut every door in the system including the one an open
 * mission needed. */
console.log('--- the port calls you ---');
(function () {
  newFlying('kawartha');
  frames(2);
  /* WITH ROOM IN IT — same reason as auto-dock's, above. A full port is
   * silent by design, so pinning the sweep at one pins nothing. */
  var orbital = G.sys.ports.filter(function (p) { return !p.surface && p.docking; });
  var port = orbital.filter(function (p) {
    return !Sim.berthStatus(p, G.sys, G.t, G.ship).full;
  })[0] || orbital[0];
  check('there is a port to approach', !!port);
  if (!port) return;
  check('and it has a berth free, so silence would mean something',
        !Sim.berthStatus(port, G.sys, G.t, G.ship).full, port.name);

  /* FAR OUT FIRST, so the range is doing work rather than the test finding
   * a ship that happened to already be next to something. */
  G.ship.cleared = {};
  G.wanted = {};
  G.fugitive = null;
  var here = Sim.bodyPosition(port, G.sys, G.t);
  var away = V.addScaled(here, { x: 1, y: 0, z: 0 }, 200);      // 200 km off
  G.ship.pos = away;
  G.ship.vel = V.clone(Sim.bodyState(port, G.sys, G.t).vel);
  G.ship.docked = null;
  G.dockTarget = null;
  frames(60);
  check('two hundred kilometres out, nobody calls', !Combat.isCleared(G, port));

  /* NOW ON APPROACH. Placed inside the range and given a closing velocity,
   * because the sweep asks for both — a ship drifting away from a port it
   * just left is not arriving at it. */
  here = Sim.bodyPosition(port, G.sys, G.t);
  G.ship.pos = V.addScaled(here, { x: 1, y: 0, z: 0 }, 6);       // 6 km off
  G.ship.vel = V.addScaled(Sim.bodyState(port, G.sys, G.t).vel,
                           { x: -1, y: 0, z: 0 }, 0.05);         // closing
  frames(60);
  check('six kilometres out and closing, the port clears you unasked',
        Combat.isCleared(G, port));

  /* AND THE OTHER DIRECTION. A ship on its way out is not hailed, which is
   * what keeps a launch from being talked over by an arrival clearance. */
  G.ship.cleared = {};
  G.ship.vel = V.addScaled(Sim.bodyState(port, G.sys, G.t).vel,
                           { x: 1, y: 0, z: 0 }, 0.05);          // opening
  frames(60);
  check('but a ship on its way OUT is left alone', !Combat.isCleared(G, port));

  /* AND A WANTED SHIP GETS NOTHING, silently — the refusal is Combat's and
   * this only checks that the sweep respects it rather than clearing
   * everyone in range. */
  G.ship.cleared = {};
  G.wanted = {}; G.wanted[port.faction || 'civil'] = 5000;
  G.ship.vel = V.addScaled(Sim.bodyState(port, G.sys, G.t).vel,
                           { x: -1, y: 0, z: 0 }, 0.05);
  frames(60);
  check('and a wanted ship is not cleared however close it gets',
        !Combat.isCleared(G, port));
  G.wanted = {};
})();

/* ---- carried into a station -------------------------------------------
 * The orbital arrival is the one sequence in the game whose entire purpose
 * is to be WATCHED, which makes the camera a correctness question rather
 * than a nicety: a boom collapsed onto the hull is thirteen seconds of grey
 * plating filling the screen, and nothing throws.
 *
 * It collapsed for a reason worth a test of its own. clampCameraToHangar
 * read the berth from `dockOffset`, which dockShip writes — and dockShip
 * does not run until the rail ENDS. So for the whole arrival it clamped to
 * berth 0 of a station the ship was being carried into berth 2 of: a box a
 * hundred metres away, every slab test negative, the boom at MIN_CAM_DIST
 * from the moment the doors closed.
 *
 * ports.js is not loaded in this suite, so this is the hall route. The
 * clamp is the same code either way; it is the berth INDEX that was wrong,
 * and an unmodelled station has six of them to pick the wrong one from. */
console.log('--- carried into a station ---');
(function () {
  newFlying('kawartha');
  frames(2);
  var port = G.sys.ports.filter(function (p) { return !p.surface; })[0];
  check('there is a station to be carried into', !!port);
  if (!port) return;

  G.focus = null;
  G.followShip = true;
  G.viewMode = 'orbit';
  G.cam.dist = 2;                          // km, a normal flying boom
  /* PITCHED INTO THE DECK, deliberately, because that is the hard case.
   * Looking down, the nearest surface is the floor a hull's standoff below
   * the ship — ten metres — so the slab test in that direction has nothing
   * to give and the boom used to collapse onto the hull and stay there.
   * Pointing the camera somewhere comfortable would have made this section
   * pass without exercising anything. */
  G.cam.pitch = -0.9;
  G.cam.yaw = 0.7;
  var began = Sim.beginArrival(G.ship, port, G.sys, G.t);
  check('the station accepts an arrival', began === true);
  if (!began) return;

  /* The berth it was actually assigned, which is the thing the clamp has to
   * agree with. If this is 0 the test still runs but proves less, so say so
   * rather than letting a silent zero make it look green. */
  var berth = G.ship.arrival.berth;
  console.log('  assigned berth ' + berth + ' of ' +
              W.Gen.bayGeometry(port).berths +
              (berth === 0 ? '  (berth 0 — this run cannot catch the index bug)' : ''));

  var legs = {}, worstDist = Infinity, welded = 0, sawSky = 0, sawInside = 0;
  /* `frame()` at its default 16 ms, because that is what this harness's
   * clock is in — and the arrival is timed in sim seconds that come from
   * that clock. Passing 0.05 here, meaning "fifty milliseconds", advances
   * it by fifty MICROseconds and the rail never leaves its first leg. */
  var guard = 0;
  while (Sim.arrivalActive(G.ship) && guard++ < 4000) {
    frame();
    var ap = G.arrivalPose;
    if (!ap) break;
    legs[ap.legId] = true;
    if (ap.enclosed) sawInside++; else sawSky++;
    if (G.cam.dist < worstDist) worstDist = G.cam.dist;
    if (G.cam.dist <= 0.006 * 1.0001) { welded++;
      if (welded < 3) console.log('   WELD leg ' + ap.legId + ' view ' + G.viewMode +
        ' follow ' + G.followShip + ' focus ' + (G.focus ? G.focus.id : 'null') +
        ' encl ' + ap.enclosed + ' docked ' + G.ship.docked + ' pitch ' + G.cam.pitch.toFixed(2)); }
  }
  check('the arrival runs to completion and docks', !!G.ship.docked,
        'after ' + guard + ' frames');
  check('and it goes through every leg on the way',
        Object.keys(legs).length === Sim.ORBITAL_LEGS.length,
        Object.keys(legs).join(' '));
  check('there is a stretch outside and a stretch inside',
        sawSky > 0 && sawInside > 0, sawSky + ' out / ' + sawInside + ' in');
  check('and the boom is never welded to the hull', welded === 0,
        welded + ' frames at MIN_CAM_DIST, closest ' + worstDist.toFixed(4) + ' km');

  Sim.undockShip(G.ship, G.sys, G.t, 0.003);
  G.ship.docked = null;
  G.dockTarget = null;
})();

/* ---- loading a career is not arriving at a port -----------------------
 * The bug this pins made loading your own save a crime, and it was
 * reported from a real career as "the autopilot cannot reach the station".
 *
 * main.js detects a dock as the EDGE from not-docked to docked, which is
 * right: there are two places a ship can dock and only one of them is a
 * call site. But a restore parks the ship straight onto the clamps with
 * wasDocked freshly cleared, so the next frame saw that edge and ran the
 * whole arrival - contracts settled again, and Combat.arriveAtPort booked
 * the player for arriving UNANNOUNCED at a port they had been sitting in
 * since before they saved. That is a fine and a FUGITIVE flag, and a
 * fugitive's ports do not open: every door in the system shut, and the
 * mission that was open became impossible to finish.
 *
 * Save.restore now sets wasDocked to match the ship it just put down. */
console.log('--- loading a docked career ---');
(function () {
  newFlying('kawartha');
  frames(2);
  var port = G.sys.ports.filter(function (p) { return !p.surface; })[0];
  Sim.dockShip(G.ship, port, G.sys, G.t);
  frames(2);

  /* Settle everything the first dock cost, so anything found after the
   * load was put there BY the load. */
  G.wanted = {};
  G.fugitive = null;
  G.expelled = null;
  G.ship.cleared = {};
  var snap = W.Save.snapshot(G);
  check('the save knows the ship was on the clamps', !!snap.ship.docked);

  /* THE REAL SEQUENCE, and it is the sequence that matters: loading
   * rebuilds the world from the slot's own seed FIRST (newGame, which
   * clears wasDocked and leaves the ship flying) and only then drops the
   * snapshot into it. Restoring on top of an already-docked ship would
   * never have shown the bug, because the edge would not be there to
   * cross. */
  newFlying('kawartha');
  frames(2);
  check('and the fresh career is flying, not docked', !G.ship.docked && !G.wasDocked);
  W.Save.restore(G, snap, {});
  check('the restored career is back on the clamps', !!G.ship.docked);
  check('and the load did not look like an arrival, before a frame runs',
        !!G.wasDocked);
  frames(3);
  check('no fine for arriving somewhere you never left',
        Object.keys(G.wanted || {}).length === 0, JSON.stringify(G.wanted));
  check('and you are not logged fugitive for loading a save',
        !G.fugitive, JSON.stringify(G.fugitive));
  check('so the port is still open to you', !Combat.dockRefusal(G, port));
})();

/* The seed belongs somewhere you can reach without abandoning the career:
 * it is the difference between a bug report that is a story and one that
 * is a test case. */
console.log('--- the seed is readable in flight ---');
(function () {
  newFlying('kawartha');
  frames(2);
  G.menu = null; G.title = null; G.market = null; G.showHelp = false;
  frames(1);
  var keydown = listeners.keydown[0];
  keydown({ key: 'Escape', shiftKey: false, preventDefault: function () {} });
  var mark = drawn.texts.length;
  frames(2);
  var said = drawn.texts.slice(mark).join(' | ');
  check('the pause menu names the seed', said.indexOf('seed "kawartha"') >= 0,
        said.slice(0, 240));
  keydown({ key: 'Escape', shiftKey: false, preventDefault: function () {} });
  frames(1);
})();

/* ---- damage you can see from the seat ---------------------------------
 * Hull loss used to be a number on a page. A hit that reaches the hull can
 * now take a console screen with it, and it stays out until a yard
 * replaces the glass. Worth pinning: that it happens, that it can never
 * blind you completely, that a dead panel draws something rather than
 * nothing, and that the repair is a real transaction. */
console.log('--- damage in the cockpit ---');
(function () {
  newFlying('kawartha');
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
  newFlying('kawartha');
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
  /* THE PLANNER HAS ITS OWN SCREEN NOW, and its keyboard went with it. The
   * six node keys used to answer in the cockpit; they answer on Shift+F2.
   * This block presses exactly the same keys it always did — the change is
   * that it has to be looking at the planner first, which is the whole
   * point of the move and is what this line asserts. */
  press('F2', { shiftKey: true });
  check('Shift+F2 leaves the cockpit for the planner', G.panel !== 0,
        'panel=' + G.panel);
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

  /* Reached by its real binding rather than by index. This line used to be
   * `G.panel = 9`, which was the node page once and became the MANIFEST
   * page when F10 was reassigned — so it had quietly been rendering the
   * wrong screen and asserting only that it did not throw. An index is a
   * thing that goes stale silently; a keystroke is not. */
  press('F2', { shiftKey: true });
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
  /* Back to the planner: the block above dropped to the cockpit to test the
   * mouse handles, and the node keys answer on the planner now. Arming is
   * the one that would bite hardest if it did not — you would be sitting on
   * the screen that draws the burn, pressing the key that flies it, with
   * nothing happening. */
  press('F2', { shiftKey: true });
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
  press('F2', { shiftKey: true });      // the planner owns these keys now
  press('i');
  G.node.dv = { pro: 0.03, nor: 0, rad: 0 };
  G.node.t = G.t + 5;
  G.nodeStale = 0;
  frames(2);
  press('\\');
  check('armed again', !!G.nodeBurn);
  /* The thrust keys still cancel it from anywhere — taking the controls back
   * is a flying act and must not require being on the right screen. */
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

  /* ---- a live manoeuvre node NO LONGER steals the zoom keys.
   *
   * This used to assert the opposite: with a node up, - and = became its
   * delta-v nudge and stopped zooming. That meant the camera controls
   * silently changed meaning depending on whether you happened to have a
   * burn planned somewhere else in the system, which is the kind of modal
   * surprise you only forgive in software you wrote yourself.
   *
   * The nudge went to the planner with the rest of the node cluster, so in
   * the cockpit these two are simply zoom, always. */
  G.viewMode = 'orbit';
  G.node = null;
  press('F2', true);                       // Shift+F2 — the planner owns I now
  press('i');
  check('a node was placed', !!G.node);
  press('F1');                             // and back to the cockpit
  var distNode = G.cam.dist;
  if (G.node) {
    press('=');
    check('the zoom keys stay the zoom keys with a node up',
          G.cam.dist !== distNode, 'camera did not move');
  }
  G.node = null;
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
    /* renderScale joined the list when it came off the backtick and became
     * an Options row — a setting the cursor can reach has to be a setting
     * this fingerprint can see, or the row reads as doing nothing. */
    return JSON.stringify([G.soundVolume, G.soundMuted, G.showOrbits,
                           G.showPrediction, G.showGrid, G.showTraffic,
                           G.cockpitChrome, G.assist, G.flightMode,
                           G.mouseAim, G.aimSens, G.showHelp, G.renderScale]);
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

  /* ---- and quitting the game, not just the career -----------------------
   * The title screen was the only way out of a career and had no way out of
   * the GAME, so the last thing on it was Options. */
  G.title = { sel: 0, edit: null, note: null };
  var qMark = drawn.texts.length;
  frames(2);
  check('the main menu offers a way out of the game',
        drawn.texts.slice(qMark).indexOf('Quit') >= 0);

  /* In a browser it must refuse in words. window.close() only works on a
   * window a script opened, so in a tab the call does nothing whatsoever —
   * the failure mode this project keeps naming as indistinguishable from a
   * bug. The harness has no `game:` origin, so this is the browser path. */
  var closed = 0;
  W.close = function () { closed++; };
  G.title = { sel: 0, edit: null, note: null };
  frames(2);
  press('ArrowUp');                            // wraps to the last item: Quit
  press('Enter');
  check('quitting from a browser tab does not pretend to close it', closed === 0);
  check('and says why, rather than doing nothing at all',
        !!G.title && /close/i.test(G.title.note || ''), G.title && G.title.note);
  check('the career is committed even though the window stayed open',
        !!W.Save.load(G.seed));

  /* Under the desktop shell it really does close. The shell is recognised by
   * its origin — electron/main.js serves the game over `game://` — rather
   * than by sniffing a user-agent string anything may claim. */
  var protoBefore = global.location.protocol;
  global.location.protocol = 'game:';
  G.title = { sel: 0, edit: null, note: null };
  frames(2);
  press('ArrowUp');
  press('Enter');
  check('under the desktop shell it closes the window', closed === 1,
        String(closed));
  global.location.protocol = protoBefore;
  delete W.close;

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

/* ---- the audio graph ---------------------------------------------------
 * Two bugs, one shipped and one latent, and neither was visible to any test
 * that existed — because node has no AudioContext, so sound.js disables
 * itself on load and every call in every other suite is a no-op. A module
 * that is inert under test is a module with no tests.
 *
 * THE SHIPPED ONE: main.js calls Sound.thrust() once a frame with the
 * throttle. thrust() wanted the shared noise buffer and asked for it by
 * calling fx('click') — a comment said "builds the buffer quietly" — but
 * 'click' is a tone and tones never touch the buffer. So the buffer stayed
 * null, thrust bailed out before starting its node, and it did that AFTER
 * emitting a 30 ms square blip. Sixty of those a second is what Astra heard
 * as a constant grinding, and Escape silenced it only because Escape stops
 * the frame loop.
 *
 * THE LATENT ONE: fx() returns early on a name it does not know, so
 * hooks.sound('alarm') was five call sites of nothing. Silence is a
 * perfectly good impression of a working sound effect.
 *
 * A stub context is installed and sound.js is re-required fresh, because
 * `enabled` latches false at first load and would otherwise keep this
 * section as inert as everything else. */
console.log('--- sound ---');
(function () {
  var made = { sources: 0, oscillators: 0, buffers: 0 };
  function param() {
    return { value: 0, setValueAtTime: function () {}, linearRampToValueAtTime: function () {},
             exponentialRampToValueAtTime: function () {}, setTargetAtTime: function () {} };
  }
  function node(extra) {
    var n = { connect: function () {}, disconnect: function () {},
              start: function () {}, stop: function () {} };
    for (var k in extra) n[k] = extra[k];
    return n;
  }
  var StubAC = function () {
    this.currentTime = 0;
    this.sampleRate = 48000;
    this.state = 'running';
    this.destination = node({});
  };
  StubAC.prototype.createGain = function () { return node({ gain: param() }); };
  StubAC.prototype.createOscillator = function () {
    made.oscillators++;
    return node({ type: 'sine', frequency: param() });
  };
  StubAC.prototype.createBufferSource = function () {
    made.sources++;
    return node({ buffer: null, loop: false });
  };
  StubAC.prototype.createBiquadFilter = function () {
    return node({ type: 'lowpass', frequency: param(), Q: param() });
  };
  StubAC.prototype.createBuffer = function (ch, len) {
    made.buffers++;
    /* A real 1.2 s buffer at 48 kHz is 57,600 floats to fill with
     * Math.random(). The code under test only cares that it gets an array
     * of the right length back, so a typed array costs nothing and the
     * fill loop still runs for real. */
    var data = new Float32Array(len);
    return { length: len, getChannelData: function () { return data; } };
  };

  /* ON `window`, NOT on `global`. sound.js closes over
   * `typeof window !== 'undefined' ? window : globalThis`, and this harness
   * gives `window` its own object rather than aliasing it to the node
   * global — so a stub installed on `global` is invisible to the module
   * that needs it, and the first run of this section duly measured a drive
   * that had never been switched on. */
  var savedAC = W.AudioContext;
  W.AudioContext = StubAC;
  var soundPath = require.resolve('../src/sound.js');
  var savedSound = W.Sound;
  delete require.cache[soundPath];
  var S = require('../src/sound.js');

  /* THE REGRESSION. Sixty frames of the drive, exactly as main.js drives
   * it, and the node must be built once and steered thereafter. */
  var i;
  for (i = 0; i < 60; i++) S.thrust(0.5);
  check('the drive loop starts exactly one source across 60 frames',
        made.sources === 1, 'sources=' + made.sources);
  check('and builds the noise buffer exactly once',
        made.buffers === 1, 'buffers=' + made.buffers);
  /* The blip itself: thrust must not be making one-shots. An oscillator is
   * how every one-shot tone in this file is built, so counting them counts
   * the clicks. */
  check('the drive loop emits no one-shot tones at all',
        made.oscillators === 0, 'oscillators=' + made.oscillators);

  /* And it must still be steerable after all that, rather than having
   * thrown its way into a dead node. */
  var threw = null;
  try { S.thrust(0); S.thrust(1); S.mute(true); S.mute(false); S.thrust(0.2); }
  catch (e) { threw = e; }
  check('the drive survives being muted and restored', !threw,
        threw ? threw.message : '');

  /* EVERY NAME THAT IS ASKED FOR EXISTS. Static, over the real sources —
   * this is the check that would have caught 'alarm' and 'blip', and it
   * costs nothing to keep. */
  var fs = require('fs'), path = require('path');
  var srcDir = path.join(__dirname, '..', 'src');
  var asked = {};
  fs.readdirSync(srcDir).forEach(function (f) {
    if (!/\.js$/.test(f) || f === 'sound.js') return;
    var txt = fs.readFileSync(path.join(srcDir, f), 'utf8');
    var re = /(?:sound|fx)\(\s*'([a-zA-Z]+)'\s*\)/g, m;
    while ((m = re.exec(txt))) {
      (asked[m[1]] = asked[m[1]] || []).push(f);
    }
  });
  var names = Object.keys(asked);
  var missing = names.filter(function (n) { return !S.has(n); });
  check('every sound the game asks for exists in the table',
        missing.length === 0,
        missing.map(function (n) { return n + ' (' + asked[n][0] + ')'; }).join(', '));
  /* Guard the guard: if the scrape ever stops finding call sites, the check
   * above passes by testing nothing. It found more than a dozen names when
   * this was written. */
  check('and the scrape actually found call sites to check',
        names.length >= 10, 'found ' + names.length);

  W.AudioContext = savedAC;
  delete require.cache[soundPath];
  W.Sound = savedSound;
})();

console.log('');
console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
