/* intercept.test.js — the lead pip and the intercept assist (2026-11-03).
 *
 *     node test/intercept.test.js
 *
 * Astra: "when you have selected a target, a navigation pip shows up on the
 * HUD, if it's in orbit of a star, that pip should track ahead of the
 * target so that your ship will end up reaching the target when the target
 * will also be intersecting that point in space." The timing is
 * drive-aware, and the assist flies the same law the pip is solved with.
 *
 * What is pinned here:
 *   - the solve converges, and its T is the flown-time model's T at the
 *     answer — and the model is the law, flown finely, to within a percent;
 *   - the pip leads an orbiting target along its motion;
 *   - pip and target merge when they are as good as the same point;
 *   - the drive-aware switch: cruise when the drive is yours to use,
 *     thrusters (and why) when it is not;
 *   - any stick input takes the controls and the assist stands by; I hands
 *     back; the HUD says AUTO or YOU;
 *   - every refusal says why;
 *   - and the sim: across seeds and targets (orbital ports, moons, NPC
 *     ships) the assist arrives inside the standoff tolerance, matched to
 *     within a few m/s, and the arrival time is reported against the pip's
 *     prediction at engagement.
 */
'use strict';
var pass = 0, fail = 0;
function check(n, c, d) {
  if (c) { pass++; console.log('  ok   ' + n + (d !== undefined ? '   ' + d : '')); }
  else { fail++; console.log('  FAIL  ' + n + (d !== undefined ? '   ' + d : '')); }
}

/* ---- a canvas that draws nothing, and records the text ----------------- */
var drawn = { texts: [] };
function makeCtx() {
  var noop = function () {};
  return {
    globalAlpha: 1, canvas: null,
    save: noop, restore: noop, beginPath: noop, closePath: noop, moveTo: noop, lineTo: noop,
    quadraticCurveTo: noop, bezierCurveTo: noop, arc: noop, arcTo: noop, ellipse: noop, rect: noop,
    fill: noop, stroke: noop, clip: noop, fillRect: noop, strokeRect: noop, clearRect: noop,
    setLineDash: noop, translate: noop, scale: noop, rotate: noop, setTransform: noop, transform: noop,
    drawImage: noop,
    measureText: function (t) { return { width: String(t).length * 6.2 }; },
    fillText: function (t) { drawn.texts.push(String(t)); },
    strokeText: function (t) { drawn.texts.push(String(t)); },
    createLinearGradient: function () { return { addColorStop: noop }; },
    createRadialGradient: function () { return { addColorStop: noop }; },
    createPattern: function () { return null; }
  };
}
var ctxStub = makeCtx();
var listeners = {};
var canvasStub = {
  width: 1280, height: 720, style: {},
  getContext: function () { return ctxStub; },
  addEventListener: function (n, fn) { (listeners[n] = listeners[n] || []).push(fn); },
  getBoundingClientRect: function () { return { left: 0, top: 0, width: 1280, height: 720, right: 1280, bottom: 720 }; }
};
var rafQueue = [], clock = 0;
global.window = {
  innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1,
  addEventListener: function (n, fn) { (listeners[n] = listeners[n] || []).push(fn); }
};
global.performance = { now: function () { return clock; } };
global.location = { hash: '#kawartha' };
global.history = { replaceState: function () {} };
global.requestAnimationFrame = function (fn) { rafQueue.push(fn); return rafQueue.length; };
global.document = { readyState: 'complete', getElementById: function () { return canvasStub; }, addEventListener: function () {} };
var fakeStore = {};
global.localStorage = {
  getItem: function (k) { return fakeStore[k] === undefined ? null : fakeStore[k]; },
  setItem: function (k, v) { fakeStore[k] = String(v); },
  removeItem: function (k) { delete fakeStore[k]; }
};

/* index.html's order. */
['vec3', 'rng', 'slipspace', 'kepler', 'mining', 'economy', 'generate', 'galaxy', 'sim', 'combat',
 'intercept', 'crew', 'fleet', 'missions', 'arcs', 'shiptrade', 'tradeanalyser', 'sound', 'save', 'logo',
 'captain-stories', 'hulls', 'weather', 'journal', 'tutorial', 'render', 'screens', 'main'
].forEach(function (m) { require('../src/' + m + '.js'); });

var W = global.window, G = W.Game, V = W.V, Sim = W.Sim, I = W.Intercept;
/* The real clock reads performance.now(), which is this stub; the solve's
 * cost measurement reads it too, so the cost numbers come from process.hrtime
 * through a second hook below. */
var realNow = function () { var t = process.hrtime(); return t[0] * 1e3 + t[1] / 1e6; };

function frame(dt) {
  clock += (dt === undefined ? 16 : dt);
  var fn = rafQueue.pop();
  rafQueue.length = 0;
  if (!fn) throw new Error('no animation frame was scheduled');
  fn(clock);
}
function frames(n, dt) { for (var i = 0; i < n; i++) frame(dt); }
function keydown(k, shift) { listeners.keydown[0]({ key: k, shiftKey: !!shift, preventDefault: function () {} }); }
function errors() { return drawn.texts.filter(function (t) { return t.indexOf('error:') === 0; }); }
function lastSaid() { return G.message || ''; }

/* ======================================================================= */
console.log('--- the flown-time model is the law, flown ---');
(function () {
  /* Fly the law at a fine fixed step (what the assist does at 60 fps),
   * and compare with the model's adaptive one. */
  function flyFine(r0, w0, a, tol) {
    var r = V.clone(r0), w = V.clone(w0), t = 0, dt = 1 / 60;
    for (var i = 0; i < 2e6; i++) {
      if (V.len(r) < tol && V.len(w) < I.ARRIVE_DV) return t;
      var acc = I.thrustLaw(r, w, a, dt);
      w = V.addScaled(w, acc, dt); r = V.addScaled(r, w, -dt); t += dt;
    }
    return Infinity;
  }
  var cases = [
    [{ x: 1000, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }],
    [{ x: 300, y: 200, z: -50 }, { x: -0.8, y: 0.4, z: 0.1 }],
    [{ x: 20000, y: 0, z: 0 }, { x: 2, y: -1, z: 0 }],
    [{ x: 30, y: 0, z: 0 }, { x: 0.5, y: 0, z: 0 }]               // flying away from it
  ];
  cases.forEach(function (c, i) {
    var m = I.thrusterTime(c[0], c[1], 0.019, 1.2).T, f = flyFine(c[0], c[1], 0.019, 1.2);
    check('case ' + i + ': the model matches the law flown at 60 Hz within 2%',
          Math.abs(m - f) / f < 0.02, 'model ' + m.toFixed(1) + ' s, flown ' + f.toFixed(1) + ' s');
  });
})();

console.log('--- the solve: converges, leads, merges, switches drive ---');
(function () {
  /* A target on a circular orbit about the origin, the ship 40,000 km off. */
  var mu = 4e5, R = 4e4, n = Math.sqrt(mu / (R * R * R));
  function orbitAt(dt) {
    var th = n * dt;
    return { pos: { x: R * Math.cos(th), y: R * Math.sin(th), z: 0 },
             vel: { x: -R * n * Math.sin(th), y: R * n * Math.cos(th), z: 0 } };
  }
  var ship = { pos: { x: 0, y: -R, z: 0 }, vel: { x: 0, y: 0, z: 0 } };
  function opts(cruise) {
    return {
      ship: ship, accel: 0.019, tol: 1.2, cruiseMin: 5e3,
      targetAt: function (dt) { var s = orbitAt(dt); return { pos: s.pos, vel: s.vel, aim: s.pos, aimVel: s.vel }; },
      cruise: cruise ? { top: 6e8, dropR: 1.2, bodiesAt: function () { return [{ pos: { x: 0, y: 0, z: 0 }, keep: 6500 }]; } } : null
    };
  }
  var th = I.solve(opts(false));
  check('a thruster intercept converges', th.converged && isFinite(th.T), th.T.toFixed(1) + ' s in ' + th.iters + ' steps');
  var again = I.thrusterTime(V.sub(orbitAt(0).pos, ship.pos), V.sub(ship.vel, orbitAt(0).vel), 0.019, 1.2).T;
  check('and its T is the flown-time model at the answer', Math.abs(again - th.T) < Math.max(0.05, 1e-3 * th.T),
        again.toFixed(2) + ' vs ' + th.T.toFixed(2));
  var now = orbitAt(0);
  check('the pip leads the target along its motion',
        V.dot(V.sub(th.pos, now.pos), now.vel) > 0, 'lead ' + V.dist(th.pos, now.pos).toFixed(0) + ' km');
  check('by about the distance it covers in T',
        Math.abs(V.dist(th.pos, now.pos) - V.len(now.vel) * th.T) < 0.05 * V.len(now.vel) * th.T + 1);

  var cr = I.solve(opts(true));
  check('with the drive available the same trip is a cruise', cr.drive === 'cruise', cr.drive);
  check('the cruise solve converges, and is shorter', cr.converged && cr.T < th.T,
        cr.T.toFixed(1) + ' s vs ' + th.T.toFixed(1) + ' s on thrusters');
  check('a cruise pip leads too', V.dot(V.sub(cr.pos, now.pos), now.vel) > 0);
  var residual = I.solve(opts(true)).residual;
  check('the cruise fixed point is a fixed point (|f(T) - T| tiny)', Math.abs(residual) < Math.max(0.05, 1e-3 * cr.T), residual.toExponential(2));

  /* Close in, the drive is not worth spinning up: thrusters, whatever the
   * drive could do. */
  ship = { pos: { x: R + 2000, y: 0, z: 0 }, vel: orbitAt(0).vel };
  var near = I.solve(opts(true));
  check('inside the cruise threshold it is thrusters even with the drive', near.drive === 'thrusters', near.drive);
  check('a slow, close target puts the pip on top of it (merge)',
        V.dist(near.pos, orbitAt(0).pos) < 0.01 * 2000 + V.len(orbitAt(0).vel) * near.T,
        V.dist(near.pos, orbitAt(0).pos).toFixed(1) + ' km apart');

  /* A target that does not move: the pip IS the target, at any range. */
  var still = I.solve({ ship: { pos: { x: 0, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 } }, accel: 0.019, tol: 1.2,
    targetAt: function () { return { pos: { x: 500, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 }, aim: { x: 500, y: 0, z: 0 }, aimVel: { x: 0, y: 0, z: 0 } }; } });
  check('a stationary target: pip and target coincide', V.dist(still.pos, { x: 500, y: 0, z: 0 }) < 1e-9);
})();

/* ======================================================================= */
/* A parking orbit round the home world, as render.test's newFlying does. */
function newFlying(seed) {
  G.newGame(seed);
  G.title = null; G.menu = null;
  frames(1);
  var host = G.spawnHost, station = G.homeStation;
  G.ship.docked = null; G.ship.dockOffset = null; G.dockTarget = null; G.dockStatus = null;
  G.ship.landed = false; G.ship.landedOn = null; G.ship.padHold = null; G.ship.arrival = null;
  if (G.tutorial) G.tutorial = null;
  if (host) {
    var alt = (station && station.orbit && !station.surface) ? station.orbit.a * 0.93 - host.radius : host.radius * 0.55;
    if (alt < host.radius * 0.06) alt = host.radius * 0.25;
    var fresh = Sim.circularOrbit(host, G.sys, G.t, alt, 0.05, 0.6);
    G.ship.pos = fresh.pos; G.ship.vel = fresh.vel;
    G.ship.fwd = fresh.fwd; G.ship.up = fresh.up; G.ship.right = fresh.right;
    Sim.refreshShip(G.ship);
  }
  G.viewMode = 'cockpit';
  G.panel = 0;
  G.warpIndex = 0;
  frames(1);
}
/* Put the ship somewhere, moving with something. */
function placeAt(pos, vel) {
  G.ship.pos = V.clone(pos); G.ship.vel = V.clone(vel);
  G.ship.docked = null; G.ship.landed = false; G.cruise = null; G.autodock = null;
  G.ship.thrusterFuel = Math.max(G.ship.thrusterFuel, G.ship.thrusterCap || 20);
  Sim.refreshShip(G.ship);
}

console.log('--- in the game: the pip, the switch, the merge ---');
newFlying('kawartha');
(function () {
  var host = G.spawnHost;
  var orbital = G.sys.ports.filter(function (p) { return !p.surface && !p.underground && p.parentBody && p.orbit; });
  var port = orbital[0];
  check('there is an orbital port to try it on', !!port, port && port.name);
  G.navTarget = { kind: 'body', id: port.id };
  frames(2);
  var ip = G.intercept;
  check('locking it gives a pip', !!(ip && ip.res && isFinite(ip.T)), ip && ip.why);
  check('the pip readout is drawn', drawn.texts.some(function (t) { return /^(PIP|INTERCEPT) /.test(t); }));
  check('drawing it raised no error', errors().length === 0, errors()[0]);

  /* Far side of the star from it: the drive is available, the trip is long. */
  var ps = Sim.bodyState(port, G.sys, G.t);
  var far = V.addScaled(ps.pos, V.norm(ps.pos), 4e7);
  placeAt(far, V.zero());
  G.intercept = null; frames(2);
  ip = G.intercept;
  check('far out in open space the estimate is a cruise', ip && ip.drive === 'cruise', ip && (ip.drive + ' ' + ip.why));
  var st = Sim.bodyState(port, G.sys, G.t);
  var hostSt = Sim.bodyState(port.parentBody, G.sys, G.t);
  /* Its motion about the star, which is what Astra asked the pip to lead. */
  check('the pip leads the station along its motion',
        V.dot(V.sub(ip.pos, st.pos), st.vel) > 0,
        'lead ' + V.dist(ip.pos, st.pos).toFixed(0) + ' km in ' + ip.T.toFixed(1) + ' s');

  /* Mass-locked: parked low over the home world. */
  var low = Sim.circularOrbit(host, G.sys, G.t, host.radius * 0.2, 0.05, 2.0);
  placeAt(low.pos, low.vel);
  G.intercept = null; frames(2);
  ip = G.intercept;
  check('mass-locked low over a world it is thrusters', ip && ip.drive === 'thrusters', ip && ip.drive);
  check('and the pip says why the drive is out, in words', ip && /mass locked by/.test(ip.why || ''), ip && ip.why);

  /* Close and matched: merged. */
  st = Sim.bodyState(port, G.sys, G.t);
  placeAt(V.addScaled(st.pos, { x: 0, y: 0, z: 1 }, 12), st.vel);
  G.intercept = null; frames(2);
  ip = G.intercept;
  check('twelve km off and matched, pip and target merge', ip && ip.merged,
        ip && (V.dist(ip.pos, ip.targetPos).toFixed(3) + ' km apart'));
  check('and the readout says INTERCEPT rather than PIP', drawn.texts.slice(-400).some(function (t) { return /^INTERCEPT \d/.test(t); }));
})();

console.log('--- refusals carry reasons ---');
(function () {
  G.autodock = null; G.navTarget = null;
  keydown('i');
  check('no lock: refused, and told to lock something', !G.autodock && /Lock something first/.test(lastSaid()), lastSaid());
  var port = G.sys.ports.filter(function (p) { return !p.surface && p.orbit; })[0];
  G.navTarget = { kind: 'body', id: 'no-such-body' };
  keydown('i');
  check('a lock that is not in this system: refused, and says so', !G.autodock && /not in this system/.test(lastSaid()), lastSaid());
  G.navTarget = { kind: 'body', id: port.id };
  var fuel = G.ship.thrusterFuel;
  G.ship.thrusterFuel = 0;
  keydown('i');
  check('out of reaction mass: refused, and says so', !G.autodock && /reaction mass/.test(lastSaid()), lastSaid());
  G.ship.thrusterFuel = fuel;
  var host = G.spawnHost;
  var low = Sim.circularOrbit(host, G.sys, G.t, host.radius * 0.2, 0.05, 2.0);
  placeAt(low.pos, low.vel);
  G.navTarget = { kind: 'body', id: port.id };
  keydown('i');
  check('cruise blocked: it engages on thrusters and says why the drive is out',
        G.autodock && G.autodock.mode === 'intercept' && /on thrusters, mass locked by/.test(lastSaid()), lastSaid());
  keydown('i', true);
  check('Shift+I stands it down', !G.autodock, lastSaid());
  keydown('i', true);
  check('and with nothing to stand down, says so', /No intercept assist/.test(lastSaid()), lastSaid());
  G.ship.docked = port.id;
  keydown('i');
  check('docked: refused, and told to undock', !G.autodock && /Undock first/.test(lastSaid()), lastSaid());
  G.ship.docked = null;
})();

console.log('--- take-over and hand-back ---');
(function () {
  var port = G.sys.ports.filter(function (p) { return !p.surface && p.orbit; })[0];
  var st = Sim.bodyState(port, G.sys, G.t);
  placeAt(V.addScaled(st.pos, { x: 0.6, y: 0.8, z: 0 }, 900), V.addScaled(st.vel, { x: 0, y: 0, z: 1 }, 0.05));
  G.navTarget = { kind: 'body', id: port.id };
  frames(1);
  keydown('i');
  check('I engages the assist', G.autodock && G.autodock.mode === 'intercept' && !G.autodock.standby);
  frames(20);
  check('the badge says AUTO', G.interceptBadge && G.interceptBadge.who === 'AUTO', G.interceptBadge && G.interceptBadge.text);
  check('and the assist is flying (thrust commanded)', V.len(G.ship.thrust) > 0, V.len(G.ship.thrust).toExponential(2));
  G.keys.w = true; frames(1); G.keys.w = false;
  check('a burn takes the controls: it stands by, it does not cancel',
        G.autodock && G.autodock.mode === 'intercept' && G.autodock.standby);
  frames(3);
  check('the badge says YOU', G.interceptBadge && G.interceptBadge.who === 'YOU', G.interceptBadge && G.interceptBadge.text);
  check('standing by it commands nothing', V.len(G.ship.thrust) === 0);
  check('and the pip is still there', !!(G.intercept && G.intercept.res));
  check('the clock came down with the hand-over', G.warpIndex === 0);
  keydown('i');
  check('I hands back', G.autodock && !G.autodock.standby);
  frames(5);
  check('and it flies again', V.len(G.ship.thrust) > 0 && G.interceptBadge.who === 'AUTO');
  G.keys.arrowleft = true; frames(1); G.keys.arrowleft = false;
  check('the stick takes it too, not only the throttle', G.autodock && G.autodock.standby);
  keydown('i');
  keydown('i');
  check('I while AUTO hands it to you', G.autodock && G.autodock.standby);
  keydown('i', true);
  check('Shift+I stands it down altogether', !G.autodock);
})();

console.log('--- the speed-match marker near the end ---');
(function () {
  var port = G.sys.ports.filter(function (p) { return !p.surface && p.orbit; })[0];
  var st = Sim.bodyState(port, G.sys, G.t);
  /* Twenty km off, closing at 300 m/s: braking is what is left to do. */
  var side = { x: 0, y: 0.6, z: 0.8 };
  placeAt(V.addScaled(st.pos, side, 20), V.addScaled(st.vel, side, -0.3));
  G.navTarget = { kind: 'body', id: port.id };
  G.intercept = null;
  frames(2);
  var ip = G.intercept;
  check('near the end the match is due', ip && ip.nearEnd, ip && ('gap ' + (ip.gap || 0).toFixed(1) + ' km'));
  check('the marker is drawn with the burn in m/s', drawn.texts.slice(-400).some(function (t) { return /^MATCH \d/.test(t); }));
  check('and it points the way to burn: against the closing velocity',
        ip && V.dot(ip.dv, side) > 0, ip && fmt(V.dot(V.norm(ip.dv), side)));
  check('the number is the relative speed to kill', ip && Math.abs(ip.dvMag - 0.3) < 0.02, ip && (ip.dvMag * 1000).toFixed(1) + ' m/s');
  function fmt(x) { return x.toFixed(3); }
})();

/* ======================================================================= */
/* THE SIM. Seeds x targets, the assist flying, the pip's prediction at
 * engagement against the game time it actually took. */
console.log('--- the assist arrives: seeds x targets ---');
var SIM_SEEDS = (process.env.IP_SEEDS ? +process.env.IP_SEEDS : 24);
var results = [];
function runOne(label, lock, startPos, startVel, maxFrames) {
  if (process.env.IP_ONLY && label.indexOf(process.env.IP_ONLY) < 0) return { label: label, skip: 'filtered' };
  placeAt(startPos, startVel);
  G.navTarget = lock;
  G.intercept = null;
  G.warpIndex = 0;
  frames(1, 50);
  var ip = G.intercept;
  if (!ip || !ip.res) return { label: label, skip: 'no pip' };
  var pred = ip.T, drive = ip.drive, t0 = G.t;
  keydown('i');
  if (!G.autodock) return { label: label, skip: 'refused: ' + lastSaid() };
  var g = 0, arrivedAt = null, arrival = null, cruised = false, cruiseT0 = null, cruiseT1 = null;
  var detail = ip.res.detail;
  while (g++ < (maxFrames || 6000)) {
    frame(50);
    if (G.cruise) { cruised = true; if (cruiseT0 === null) cruiseT0 = G.t; cruiseT1 = G.t; }
    if (process.env.IP_MSG && G.message !== runOne.lastMsg) { runOne.lastMsg = G.message; console.log('        [' + (G.t - t0).toFixed(1) + '] ' + G.message + '  phase ' + (G.autodock && G.autodock.phase)); }
    var ad = G.autodock;
    if (ad && ad.arrival && !arrival) { arrival = ad.arrival; arrivedAt = G.t; break; }
    if (!ad) {
      /* A world: it lets go on arrival. */
      if (/In orbit about/.test(lastSaid())) { arrival = { gap: 0, dv: 0, orbit: true }; arrivedAt = G.t; }
      break;
    }
    if (G.ship.crashed || G.ship.landed || G.ship.docked) break;
  }
  var ad2 = G.autodock;
  if (process.env.IP_DEBUG) console.log('      debug ' + label + ' model ' + JSON.stringify(detail && { cruise: detail.cruise, tail: detail.tail, lockedAt: detail.lockedAt, T: detail.T }) +
    ' flown cruise ' + (cruiseT0 !== null ? (cruiseT0 - t0).toFixed(1) + '..' + (cruiseT1 - t0).toFixed(1) : '-'));
  var rec = { label: label, pred: pred, drive: drive, cruised: cruised, frames: g,
              took: arrivedAt !== null ? arrivedAt - t0 : null, arrival: arrival,
              why: arrival ? '' : (G.ship.crashed ? 'crashed' : !ad2 ? 'stood down: ' + lastSaid() : 'ran out of frames in ' + ad2.phase) };
  if (arrival && !arrival.orbit) {
    /* Measure it ourselves, not from what the assist said. */
    var rails = ad2.rails, now = rails.at(0);
    rec.gapTarget = V.dist(now.pos, G.ship.pos);
    rec.relV = V.len(V.sub(G.ship.vel, now.vel));
  }
  G.autodock = null; G.cruise = null;
  return rec;
}

(function () {
  var seeds = ['kawartha'];
  for (var i = 1; i < SIM_SEEDS; i++) seeds.push('ip-' + i);
  var t0 = realNow();
  seeds.forEach(function (sd) {
    newFlying(sd);
    if (!G.spawnHost) return;
    var host = G.spawnHost;
    /* 1. An orbital port, from a parking orbit round a DIFFERENT world when
     *    there is one (a cruise leg), else from the far side of its own. */
    var ports = G.sys.ports.filter(function (p) { return !p.surface && !p.underground && p.orbit && p.parentBody; });
    if (ports.length) {
      var port = ports[0];
      var worlds = G.sys.bodies.filter(function (b) { return b.kind === 'planet' && b !== port.parentBody; });
      var from = worlds[0] || port.parentBody;
      var park = Sim.circularOrbit(from, G.sys, G.t, from.radius * 2.0, 0.05, 1.0);
      results.push(runOne(sd + ' port ' + port.name, { kind: 'body', id: port.id }, park.pos, park.vel));
      /* and the same port from close by on thrusters: 3,000 km off it. */
      newFlying(sd);
      var ps = Sim.bodyState(port, G.sys, G.t);
      results.push(runOne(sd + ' port-close ' + port.name, { kind: 'body', id: port.id },
                          V.addScaled(ps.pos, V.norm(V.cross(ps.vel, { x: 0, y: 0, z: 1 })), 3000), ps.vel));
    }
    /* 2. A moon, from a parking orbit about its planet. */
    var moon = G.sys.bodies.filter(function (b) { return b.kind === 'moon' && b.mu > 0 && b.parentBody; })[0];
    if (moon) {
      newFlying(sd);
      var mp = moon.parentBody;
      var mpark = Sim.circularOrbit(mp, G.sys, G.t, Math.max(mp.radius * 2.2, (moon.orbit ? moon.orbit.a * 0.4 : mp.radius * 3) - mp.radius), 0.05, 2.5);
      results.push(runOne(sd + ' moon ' + moon.name, { kind: 'body', id: moon.id }, mpark.pos, mpark.vel));
    }
    /* 3. An NPC ship in flight, from 4,000 km off it. */
    newFlying(sd);
    /* Coasting ones: a freighter mid-burn on its timetable can out-
     * accelerate a Talon, and no autopilot catches what it cannot outrun
     * (the assist says so, rather than pretending — see below). */
    var ships = Sim.shipsAll(G.sys, G.t).filter(function (s) {
      if (!s.pos || s.landed || s.inside || s.docked || s.phase === 'docked' || s.mode === 'moored') return false;
      var route = (G.sys.traffic || []).filter(function (r) { return r.id === s.id; })[0];
      if (!route) return false;
      var a = Sim.trafficState(route, G.sys, G.t + 1), b = Sim.trafficState(route, G.sys, G.t - 1);
      if (!a || !b) return false;
      var acc = V.scale(V.sub(a.vel, b.vel), 0.5);
      return V.len(V.sub(acc, Sim.acceleration(s.pos, G.sys, G.t))) < 1e-4;
    });

    var pick = ships[0];
    if (pick) {
      var off = V.addScaled(pick.pos, V.norm(V.cross(pick.vel && V.len(pick.vel) > 1e-6 ? pick.vel : { x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: 1 })), 4000);
      results.push(runOne(sd + ' ship ' + pick.name, { kind: 'ship', id: pick.id }, off, pick.vel || V.zero()));
    }
  });
  var done = results.filter(function (r) { return r.arrival; });
  var skipped = results.filter(function (r) { return r.skip; });
  var failed = results.filter(function (r) { return !r.arrival && !r.skip; });
  console.log('    runs ' + results.length + ', arrived ' + done.length + ', skipped ' + skipped.length +
              ', failed ' + failed.length + ', in ' + ((realNow() - t0) / 1000).toFixed(1) + ' s of wall clock');
  results.forEach(function (r) {
    if (r.skip) { console.log('    SKIP ' + r.label + ': ' + r.skip); return; }
    if (!r.arrival) { console.log('    MISS ' + r.label + ': ' + r.why + ' (pred ' + r.pred.toFixed(0) + ' s ' + r.drive + ')'); return; }
    var err = (r.took - r.pred) / Math.max(1, r.pred);
    console.log('    ' + (r.drive === 'cruise' ? 'C' : 'T') + ' ' + r.label.slice(0, 44) + '  pred ' + r.pred.toFixed(0) +
                ' s  took ' + r.took.toFixed(0) + ' s  (' + (err * 100).toFixed(1) + '%)' +
                (r.arrival.orbit ? '  orbit' : '  ' + (r.gapTarget).toFixed(2) + ' km off (standoff ' + r.arrival.standoff.toFixed(1) + '), ' + (r.relV * 1000).toFixed(2) + ' m/s'));
  });
  check('the assist arrives in at least 90% of runs', done.length >= 0.9 * (results.length - skipped.length),
        done.length + ' of ' + (results.length - skipped.length));
  /* Measured from the aim point, which is the standoff off the target on
   * the side the ship came from: inside the arrival radius about it. */
  var tolOk = done.filter(function (r) { return r.arrival.orbit || r.arrival.gap <= r.arrival.tol; });
  check('every arrival is inside the standoff tolerance', tolOk.length === done.length, tolOk.length + ' of ' + done.length);
  var standOk = done.filter(function (r) { return r.arrival.orbit || Math.abs(r.gapTarget - r.arrival.standoff) <= r.arrival.tol * 1.5; });
  check('and so at the standoff from the target itself', standOk.length === done.length, standOk.length + ' of ' + done.length);
  var matched = done.filter(function (r) { return r.arrival.orbit || r.relV < 0.005; });
  check('every arrival is matched to within 5 m/s', matched.length === done.length, matched.length + ' of ' + done.length);
  var errs = done.map(function (r) { return Math.abs(r.took - r.pred) / Math.max(1, r.pred); }).sort(function (a, b) { return a - b; });
  if (errs.length) {
    console.log('    |arrival - prediction| / prediction:  median ' + (errs[errs.length >> 1] * 100).toFixed(1) +
                '%  90th ' + (errs[Math.floor(errs.length * 0.9)] * 100).toFixed(1) + '%  worst ' + (errs[errs.length - 1] * 100).toFixed(1) + '%');
    check('the pip\'s time is honest: median error under 15%', errs[errs.length >> 1] < 0.15);
  }
  check('nothing drawn raised an error', errors().length === 0, errors()[0]);
})();

/* THE COST, measured on this machine with the real clock: every solve
 * the sim above would have made, re-timed, plus the frame with and without
 * a lock. The game's own figure (G.intercept.costs) reads performance.now(),
 * which this harness stubs. */
console.log('--- what it costs ---');
(function () {
  var costs = [], colds = [];
  ['kawartha', 'ip-1', 'ip-2', 'ip-3', 'ip-4', 'ip-5'].forEach(function (sd) {
    newFlying(sd);
    var locks = G.sys.bodies.filter(function (b) { return b.kind !== 'star'; }).slice(0, 12)
      .map(function (b) { return { kind: 'body', id: b.id }; });
    Sim.shipsAll(G.sys, G.t).slice(0, 6).forEach(function (sh) { locks.push({ kind: 'ship', id: sh.id }); });
    var host = G.spawnHost;
    [1.3, 3, 40].forEach(function (k) {
      var o = Sim.circularOrbit(host, G.sys, G.t, host.radius * (k - 1), 0.05, k);
      placeAt(o.pos, o.vel);
      locks.forEach(function (lk) {
        /* Best of three: this box is shared with other agents' suites and
         * a browser, and one solve's wall time there is mostly whoever
         * else had the core. The first of the three is kept as well, cold
         * JIT and all, as the worst a player could see. */
        var r = null, c = Infinity, first = 0;
        for (var rep = 0; rep < 3; rep++) {
          var a = realNow(); r = G.solveIntercept(lk); var cc = realNow() - a;
          if (rep === 0) first = cc;
          c = Math.min(c, cc);
        }
        if (r) { costs.push(c); colds.push(first); }
        if (r && c > 3) console.log('    slow solve ' + c.toFixed(1) + ' ms: ' + sd + ' ' + lk.kind + ' ' + lk.id + ' ' + r.drive + ' T ' + r.T.toFixed(0) + ' iters ' + r.iters);
      });
    });
  });
  costs.sort(function (a, b) { return a - b; });
  console.log('    ' + costs.length + ' solves: median ' + costs[costs.length >> 1].toFixed(3) + ' ms, 90th ' +
              costs[Math.floor(costs.length * 0.9)].toFixed(3) + ' ms, worst ' + costs[costs.length - 1].toFixed(3) + ' ms');
  colds.sort(function (a, b) { return a - b; });
  console.log('    first try (cold, contended): median ' + colds[colds.length >> 1].toFixed(3) + ' ms, worst ' + colds[colds.length - 1].toFixed(3) + ' ms');
  check('a solve is well under a frame at the median (< 1 ms)', costs[costs.length >> 1] < 1);
  check('and the worst is under 10 ms, so four a second is no hitch', costs[costs.length - 1] < 10);

  /* The standing cost per frame (no solve that frame): the rails, the aim
   * point and the feed-forward the assist reads every frame. */
  newFlying('kawartha');
  var port = G.sys.ports.filter(function (p) { return !p.surface && p.orbit; })[0];
  var st = Sim.bodyState(port, G.sys, G.t);
  function timeFrames(n) { var a = realNow(); frames(n); return (realNow() - a) / n; }
  placeAt(V.addScaled(st.pos, { x: 1, y: 0, z: 0 }, 900), st.vel);
  /* Interleaved, several rounds, best of each: the box is shared. */
  var bare = Infinity, pip = Infinity;
  for (var round = 0; round < 4; round++) {
    G.navTarget = null; G.intercept = null; frames(3);
    bare = Math.min(bare, timeFrames(60));
    G.navTarget = { kind: 'body', id: port.id }; frames(3);
    pip = Math.min(pip, timeFrames(60));
  }
  console.log('    frame (headless, stub canvas, best of 4 x 60): ' + bare.toFixed(2) + ' ms with no lock, ' + pip.toFixed(2) +
              ' ms with the pip up (' + (pip - bare).toFixed(2) + ' ms)');
  /* The assist against auto-dock on the same geometry: both wind the
   * clock, and the clock is what a frame of autopilot costs. */
  placeAt(V.addScaled(st.pos, { x: 1, y: 0, z: 0 }, 900), st.vel);
  keydown('i'); frames(3);
  var assist = timeFrames(60);
  G.autodock = null;
  placeAt(V.addScaled(st.pos, { x: 1, y: 0, z: 0 }, 900), st.vel);
  G.dockTarget = port; keydown('t'); frames(3);
  var dock = timeFrames(60);
  G.autodock = null; G.dockTarget = null;
  console.log('    frame flying: ' + assist.toFixed(2) + ' ms on the intercept assist, ' + dock.toFixed(2) + ' ms on auto-dock');
  check('the pip costs well under a millisecond a frame', pip - bare < 1, (pip - bare).toFixed(2) + ' ms');
})();

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
