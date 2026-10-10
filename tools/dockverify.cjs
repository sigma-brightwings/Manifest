/* Scratch probe: what does the pad berth actually return now?
 * Three attitude checks went from level to 90 degrees of bank when berthing
 * was generalised, and one of them is the SURFACE case, which should not
 * have changed at all. So look rather than reason. Untracked. */
var path = require('path');
var root = path.join(__dirname, '..');

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
  width: 1280, height: 720, style: {}, clientWidth: 1280, clientHeight: 720,
  getContext: function () { return ctxStub; },
  addEventListener: function () {},
  getBoundingClientRect: function () { return { left: 0, top: 0, width: 1280, height: 720 }; }
};
global.window = {};
var W = global.window;
W.performance = global.performance = { now: function () { return clock; } };
W.requestAnimationFrame = global.requestAnimationFrame = function (fn) { rafQueue.push(fn); return 1; };
W.devicePixelRatio = global.devicePixelRatio = 1;
W.innerWidth = global.innerWidth = 1280;
W.innerHeight = global.innerHeight = 720;
W.addEventListener = global.addEventListener = function () {};
W.document = global.document = {
  readyState: 'complete',
  getElementById: function () { return canvasStub; },
  addEventListener: function () {}
};
W.prompt = global.prompt = function () { return 'kawartha'; };
W.location = global.location = { hash: '', href: 'game://local/', search: '' };
W.navigator = global.navigator = { userAgent: 'node' };

['vec3', 'rng', 'slipspace', 'kepler', 'economy', 'generate', 'galaxy', 'sim',
 'combat', 'missions', 'sound', 'save', 'hulls', 'render', 'screens', 'main']
  .forEach(function (m) { require(path.join(root, 'src/' + m + '.js')); });

var G = W.Game, Sim = W.Sim, V = W.V;

function frame(dt) {
  clock += (dt === undefined ? 16 : dt);
  var fn = rafQueue.pop();
  rafQueue.length = 0;
  if (fn) fn(clock);
}
for (var i = 0; i < 5; i++) frame();

var pad = G.sys.byId[G.ship.docked];
console.log('docked at:', G.ship.docked, 'surface?', !!(pad && pad.surface),
            'role', pad && pad.role);

var gb = Sim.groundBasis(pad, G.sys, G.t);
var pb = Sim.portBasis(pad, G.sys, G.t);
console.log('groundBasis null?', !gb, ' portBasis null?', !pb);
var bs = Sim.berthState(pad, G.sys, G.t, G.ship.dockOffset && G.ship.dockOffset.berth);
console.log('berthState null?', !bs, ' dockOffset:', JSON.stringify(G.ship.dockOffset));

var lv = Sim.localVertical(G.ship.pos, G.sys, G.t);
var att = Sim.attitudeAngles(G.ship, lv.up);
console.log('pad attitude roll=', att.rollDeg.toFixed(3), ' pitch=', att.pitchDeg.toFixed(3));
if (bs) {
  console.log('berth basis up . localVertical =', V.dot(bs.basis.up, lv.up).toFixed(4));
  console.log('ship.up . localVertical        =', V.dot(G.ship.up, lv.up).toFixed(4));
}

/* And the station case, posed exactly as the failing test poses it. */
var orb = (G.sys.ports || []).filter(function (p) { return !p.surface; })[0];
if (orb) {
  var ops = Sim.bodyState(orb, G.sys, G.t);
  G.ship.docked = null;
  G.ship.pos = V.addScaled(ops.pos, { x: 1, y: 0, z: 0 }, 0.4);
  G.ship.vel = V.clone(ops.vel);
  Sim.refreshShip(G.ship);
  Sim.dockShip(G.ship, orb, G.sys, G.t);
  frame();
  var sbs = Sim.berthState(orb, G.sys, G.t, G.ship.dockOffset && G.ship.dockOffset.berth);
  var lv2 = Sim.localVertical(G.ship.pos, G.sys, G.t);
  var att2 = Sim.attitudeAngles(G.ship, lv2.up);
  console.log('\nstation:', orb.name, ' berthed?', !!(G.ship.dockOffset && G.ship.dockOffset.station));
  console.log('station attitude roll=', att2.rollDeg.toFixed(3));
  if (sbs) {
    console.log('station berth up . localVertical =', V.dot(sbs.basis.up, lv2.up).toFixed(4));
  }
}
