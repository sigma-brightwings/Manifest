/* airdata.test.js — the speed box, the G meter and the altitude box.
 *
 *     node test/airdata.test.js
 *
 * Astra, 2026-10-18, on why altitude has to be right: "we have atmosphere
 * mining which will be dependent on the altitude". Felt G is what the crew
 * feels (gravity excluded, as on a fighter's meter); altitude is above the
 * surface of the same body the heading tape and ladder use.
 */
global.window = global.window || global;
var V = require('../src/vec3.js');
require('../src/economy.js');
var Gen = require('../src/generate.js');
var Sim = require('../src/sim.js');
require('../src/hulls.js');
require('../src/ports.js');
var Render = require('../src/render.js');
var Galaxy = require('../src/galaxy.js');

var pass = 0, fail = 0;
function check(n, c, d) {
  if (c) { pass++; console.log('  ok   ' + n + (d ? '   ' + d : '')); }
  else { fail++; console.log('  FAIL  ' + n + (d ? '   ' + d : '')); }
}
function near(a, b, tol) { return Math.abs(a - b) <= (tol || 1e-9); }

console.log('--- what goes in the boxes ---');
function rd(r) { return r.value + ' ' + r.unit; }
[[0.0052, false, '5.2 M/S'], [0.4123, false, '412 M/S'], [7.842, false, '7.84 KM/S'],
 [31.47, false, '31.5 KM/S'], [452.6, false, '453 KM/S'],
 [0.412 * 299792.458, true, '0.412 c'], [3.1 * 299792.458, true, '3.10 c'],
 [0.0001 * 299792.458, true, '30.0 KM/S']].forEach(function (c) {
  var r = Render.airSpeedReadout(c[0], c[1]);
  check('speed ' + c[0].toPrecision(4) + (c[1] ? ' cruising' : '') + ' reads ' + c[2], rd(r) === c[2], rd(r));
});
[[0.5, '500 M'], [8.42, '8,420 M'], [184.23, '184.2 KM'], [18600, '18,600 KM'], [2.5e6, '2.50 MKM']].forEach(function (c) {
  var r = Render.altitudeReadout(c[0]);
  check('altitude ' + c[0] + ' km reads ' + c[1], rd(r) === c[1], rd(r));
});
var up = Render.vsReadout(0.012), dn = Render.vsReadout(-0.45), still = Render.vsReadout(0);
check('climbing 12 m/s points up', up.dir === 1 && up.text === '12.0 m/s', up.text);
check('sinking 450 m/s points down', dn.dir === -1 && dn.text === '450 m/s', dn.text);
check('holding level has no arrow', still.dir === 0);

console.log('--- the air line ---');
var thick = { atmosphere: { rho0: 1.2, scaleHeight: 8, top: 96 } };
check('a world with no air gets no line', Render.airReadout({}, 50, 0) === null);
var inA = Render.airReadout(thick, 20, Sim.airDensityAt(thick, 20));
check('inside the air: density, flagged', inA && inA.inside && /^ρ 0\.099 kg\/m³$/.test(inA.text), inA && inA.text);
var thin = Render.airReadout(thick, 90, Sim.airDensityAt(thick, 90));
check('thin air goes to exponent form', thin && /e-/.test(thin.text), thin && thin.text);
var above = Render.airReadout(thick, 436, 0);
check('above it: how far down the top is, with a pointer', above && !above.inside && above.text === 'AIR ▼ 340 km', above && above.text);
check('density at the top is zero', Sim.airDensityAt(thick, 96) === 0);

console.log('--- felt G in flight ---');
var empty = { gravBodies: [], byId: {} };
function flyer(th, vel) {
  return { pos: { x: 1e9, y: 0, z: 0 }, vel: vel || { x: 0, y: 0, z: 0 }, thrust: th, noDrag: true, mass: 80 };
}
check('coasting is weightless whatever is pulling', near(V.len(Sim.feltAccel(flyer({ x: 0, y: 0, z: 0 }), empty, 0)), 0));
var oneG = V.len(Sim.feltAccel(flyer({ x: Sim.G0, y: 0, z: 0 }), empty, 0)) / Sim.G0;
check('a 1 G burn reads 1.0', near(oneG, 1, 1e-12), oneG);
var diag = V.len(Sim.feltAccel(flyer({ x: 3 * Sim.G0, y: 4 * Sim.G0, z: 0 }), empty, 0)) / Sim.G0;
check('a burn on two axes reads its magnitude', near(diag, 5, 1e-9), diag);

/* Drag counts — a scoop pass in air is felt even with the drive off. */
var gal = Galaxy.build('kawartha');
function optsFor(st) {
  var fac = gal.factionById ? gal.factionById[st.factionId] : null;
  return fac ? { faction: fac, allFactions: gal.factions } : undefined;
}
var airy = null, pad = null, orbital = null;
for (var s = 0; s < gal.stars.length && (!airy || !pad || !orbital); s++) {
  var sys = Gen.generateSystem(gal.stars[s].seed, optsFor(gal.stars[s]));
  /* The first MOLTEN world with air, the kind the brick below was measured
   * on: kawartha's first air-bearing world was molten Mirven I (17.45 G at
   * full drag); since stars stage 2 it is a thin-aired desert, and the first
   * molten world is kawartha:s2's Linethor I. */
  if (!airy) sys.gravBodies.forEach(function (b) { if (!airy && b.atmosphere && b.radius && b.type === 'molten') airy = { sys: sys, body: b }; });
  (sys.ports || []).forEach(function (p) {
    if (!p.docking) return;
    if (!pad && p.surface && p.parentBody && p.parentBody.mu) pad = { sys: sys, port: p };
    if (!orbital && !p.surface) orbital = { sys: sys, port: p };
  });
}
check('the galaxy has a world with air', !!airy);
if (airy) {
  var b = airy.body, st = Sim.bodyState(b, airy.sys, 0);
  var at = b.atmosphere, h = at.scaleHeight * 2;
  var p = V.addScaled(st.pos, { x: 1, y: 0, z: 0 }, b.radius + h);
  /* 2 km/s through the AIR, which turns with its world (2026-11-03): this
   * was 2 km/s against the world's centre, which was 2 km/s through the air
   * only while the drag pretended the air stood still. Same coast, same
   * expected number, measured in the frame the drag now uses. */
  var sh = { pos: p, vel: V.add(Sim.surfaceVelocity(b, p, airy.sys, 0), { x: 0, y: 2, z: 0 }), thrust: { x: 0, y: 0, z: 0 }, mass: 80, dragArea: 14 };
  var fd = V.len(Sim.feltAccel(sh, airy.sys, 0));
  var rho = Sim.airDensityAt(b, h);
  var expect = 0.5 * rho * 2 * 2 * 14 * Sim.DRAG_SCALE / 80;
  check('coasting through air, drag is what you feel', near(fd, expect, expect * 1e-6), (fd / Sim.G0).toFixed(3) + ' G');
  /* Astra, 2026-10-19: "make the air drag less brutal". The same coast
   * read 17.4 G before on Mirven I; on Linethor I (stars stage 2, see the
   * pick above) it would read 28.08 G at full drag, and a quarter of that
   * now. */
  check('and it is a quarter of the brick it used to be', Sim.DRAG_SCALE === 0.25 &&
        near(fd / Sim.G0, 28.078 * 0.25, 0.01), (fd / Sim.G0).toFixed(2) + ' G, was 28.08');
}

console.log('--- felt G in a berth ---');
function newShip(pos, vel) {
  return { cls: 'courier', dryMass: 80, hullHp: 100, gear: true, thrusterCap: 10,
           pos: V.clone(pos), vel: V.clone(vel), cargo: {}, thrust: { x: 0, y: 0, z: 0 },
           fwd: { x: 1, y: 0, z: 0 }, up: { x: 0, y: 0, z: 1 }, right: { x: 0, y: -1, z: 0 },
           cleared: {} };
}
check('the galaxy has a ground pad', !!pad);
if (pad) {
  var t = 5000;
  var ps = Sim.bodyState(pad.port, pad.sys, t);
  var s1 = newShip(ps.pos, ps.vel);
  Sim.dockShip(s1, pad.port, pad.sys, t);
  check('docked on the pad', s1.docked === pad.port.id);
  if (s1.docked === pad.port.id) {
    /* Astra, 2026-10-19: pads and common areas have "clarke-tech
     * artificial gravity generators ... just to make design easier".
     * The world under this pad pulls a few hundredths of a G; the deck
     * reads one, pressing up out of the ground. */
    var world = pad.port.parentBody;
    Sim.updateDockedShip(s1, pad.sys, t);
    var ws = Sim.bodyState(world, pad.sys, t);
    var r = V.sub(s1.pos, ws.pos);
    var got = Sim.feltAccel(s1, pad.sys, t);
    check('a pad reads one standard G whatever the world', near(V.len(got) / Sim.G0, 1, 1e-12),
          (V.len(got) / Sim.G0).toFixed(3) + ' G on a world of ' +
          (world.mu / V.dot(r, r) / Sim.G0).toFixed(3) + ' G');
    check('and it pushes up, out of the ground', V.dot(got, r) > 0);

    /* The rail: nothing while the hull is still being drawn in from
     * outside, the deck once it is through the door. */
    var railer = { pos: s1.pos, vel: s1.vel, thrust: { x: 0, y: 0, z: 0 }, noDrag: true,
                   arrival: { port: pad.port.id, berth: s1.dockOffset.berth, at: t, lead: 10 } };
    check('on the rail lead-in, outside: nothing to feel', near(V.len(Sim.feltAccel(railer, pad.sys, t + 5)), 0));
    check('on the rail inside: the deck\'s 1 G', near(V.len(Sim.feltAccel(railer, pad.sys, t + 15)) / Sim.G0, 1, 1e-12));
  }
}
check('the galaxy has an orbital port', !!orbital);
if (orbital) {
  var os = Sim.bodyState(orbital.port, orbital.sys, 0);
  var s2 = newShip(os.pos, os.vel);
  Sim.dockShip(s2, orbital.port, orbital.sys, 0);
  var g2 = V.len(Sim.feltAccel(s2, orbital.sys, 0)) / Sim.G0;
  check('a station berth reads one standard G too', s2.docked === orbital.port.id && near(g2, 1, 1e-12), g2.toFixed(4) + ' G');
}

console.log('--- drawing it ---');
function stubCtx() {
  var texts = [];
  return new Proxy({ texts: texts }, {
    get: function (o, k) {
      if (k in o) return o[k];
      if (k === 'fillText') return function (s, x, y) { texts.push({ s: s, x: x, y: y }); };
      if (k === 'measureText') return function (s) { return { width: String(s).length * 11 }; };
      return function () {};
    },
    set: function (o, k, v) { o[k] = v; return true; }
  });
}
var ctx = stubCtx();
var ext = Render.drawAirData(ctx, 1600, 900, {
  cy: 450, speed: Render.airSpeedReadout(0.4123), g: 2.43, peak: 5.07,
  alt: Render.altitudeReadout(184.2), vs: Render.vsReadout(-0.012),
  air: Render.airReadout(thick, 184.2, 0)
});
function has(s) { return ctx.texts.some(function (t) { return t.s === s; }); }
function xOf(s) { return ctx.texts.filter(function (t) { return t.s === s; })[0].x; }
check('speed box shows 412 and its unit', has('412') && has('M/S'));
check('G and peak under it', has('G 2.4') && has('PK 5.1'));
check('altitude box shows 184.2 KM', has('184.2') && has('KM'));
check('vertical speed under altitude', has('VS') && has('12.0 m/s'));
check('air line under that', has('AIR ▼ 88 km'));
check('speed sits left of centre, altitude right', xOf('412') < 800 && xOf('184.2') > 800);
check('both clear of the ladder (±190 px at least)', ext.left < 800 - 190 && ext.right > 800 + 190, ext.left + ' .. ' + ext.right);
var ctx2 = stubCtx();
Render.drawAirData(ctx2, 1600, 900, { cy: 450, speed: Render.airSpeedReadout(0), g: 1, peak: null, alt: null });
check('docked: peak shows --', ctx2.texts.some(function (t) { return t.s === 'PK --'; }));

/* ---- facing into or against the way you are going --------------------
 * Astra, 2026-10-19: "we need a way to know if the ship is facing into or
 * out of the direction of travel that's easier to find". */
console.log('--- facing ---');
var PRO = { x: 0, y: 1, z: 0 };
function face(deg) {
  var r = deg * Math.PI / 180;
  return { x: Math.sin(r), y: Math.cos(r), z: 0 };
}
var f0 = Render.facingInfo(face(0), PRO, 2);
check('nose on prograde: PROGRADE, on it', f0.mode === 'pro' && f0.locked && f0.deg < 1e-6);
var f8 = Render.facingInfo(face(8), PRO, 2);
check('8° off still counts as on it', f8.mode === 'pro' && f8.locked && Math.abs(f8.deg - 8) < 1e-6);
var f40 = Render.facingInfo(face(40), PRO, 2);
check('40° off: prograde side, not on it', f40.mode === 'pro' && !f40.locked && Math.abs(f40.deg - 40) < 1e-6);
var f175 = Render.facingInfo(face(175), PRO, 2);
check('tail to the motion: RETROGRADE, 5° off, on it', f175.mode === 'retro' && f175.locked && Math.abs(f175.deg - 5) < 1e-6);
var f120 = Render.facingInfo(face(120), PRO, 2);
check('120° off prograde reads 60° off retrograde', f120.mode === 'retro' && Math.abs(f120.deg - 60) < 1e-6);
check('not moving: nothing to face', Render.facingInfo(face(0), PRO, 0).mode === 'still');
function cueTexts(info) {
  var c = stubCtx();
  Render.drawFacingCue(c, 1600, 900, info, 500);
  return c.texts.map(function (t) { return t.s; });
}
check('the cue says PROGRADE when on it', cueTexts(f0).indexOf('PROGRADE ') >= 0);
check('and gives the angle when off', cueTexts(f40).indexOf('PROGRADE 40° OFF') >= 0, cueTexts(f40).join('|'));
check('and RETROGRADE when the tail leads', cueTexts(f175).indexOf('RETROGRADE 5° OFF') >= 0, cueTexts(f175).join('|'));

/* THE HUD'S SPEED, NEAR A WORLD (2026-11-02). Coming down onto a sea
 * platform the band read ~178 m/s against the world's centre: the world's
 * own spin. Near a world it is measured against the ground or the air
 * turning with it (Sim.hudSpeed), and a ship sitting still on the turning
 * ground reads about nothing; in orbit it is the orbit's, as before. */
console.log('--- the HUD speed, near a world ---');
var spun = [];
for (var s2 = 0; s2 < gal.stars.length && spun.length < 12; s2++) {
  var sy2 = Gen.generateSystem(gal.stars[s2].seed, optsFor(gal.stars[s2]));
  (sy2.ports || []).forEach(function (p) {
    var hb = p.parentBody;
    if (!p.surface || !hb || !hb.rotation || !(hb.kind === 'planet' || hb.kind === 'moon')) return;
    if (spun.length < 12) spun.push({ sys: sy2, port: p });
  });
}
check('the galaxy has surface ports on turning worlds', spun.length >= 6, spun.length + ' sampled');
var worstStill = 0, bestSpin = 0, airSeen = 0, gndSeen = 0;
spun.forEach(function (q) {
  var t = 7777, ps = Sim.bodyState(q.port, q.sys, t), hb = q.port.parentBody;
  var still = { pos: ps.pos, vel: ps.vel };
  var hs = Sim.hudSpeed(still, q.sys, t, hb);
  worstStill = Math.max(worstStill, hs.kms);
  if (hs.frame === 'air') airSeen++; else if (hs.frame === 'ground') gndSeen++;
  bestSpin = Math.max(bestSpin, V.len(V.sub(ps.vel, Sim.bodyVelocity(hb, q.sys, t))));
  /* The orbital frame on request (the map) is the old number. */
  var orb = Sim.hudSpeed(still, q.sys, t, hb, true);
  if (orb.frame !== 'orbit' || Math.abs(orb.kms - V.len(V.sub(ps.vel, Sim.bodyVelocity(hb, q.sys, t)))) > 1e-12) worstStill = Infinity;
});
check('a ship sitting still on a turning world reads about 0', worstStill < 1e-6,
      (worstStill * 1000).toFixed(6) + ' m/s at worst, where the old reading was up to ' + (bestSpin * 1000).toFixed(0) + ' m/s');
check('and says what it is against: air or ground', airSeen + gndSeen === spun.length, airSeen + ' air, ' + gndSeen + ' ground');
check('the old reading was the spin, not nothing', bestSpin > 0.02, (bestSpin * 1000).toFixed(0) + ' m/s');
/* A descent at 5 m/s straight down over a pad reads 5 m/s, not 5 plus the spin. */
if (spun.length) {
  var q0 = spun[0], t0 = 7777, p0 = Sim.bodyState(q0.port, q0.sys, t0), hb0 = q0.port.parentBody;
  var upv = V.norm(V.sub(p0.pos, Sim.bodyPosition(hb0, q0.sys, t0)));
  var hov = { pos: V.addScaled(p0.pos, upv, 0.2), vel: V.addScaled(p0.vel, upv, -0.005) };
  var hd = Sim.hudSpeed(hov, q0.sys, t0, hb0);
  /* 200 m up the ground's own velocity is a hair more than the pad's
   * (omega x r, r longer by 0.2 km): that is the whole difference. */
  check('a 5 m/s descent over the pad reads 5 m/s', Math.abs(hd.kms - 0.005) < 0.0005, (hd.kms * 1000).toFixed(2) + ' m/s ' + hd.frame);
}
/* Out of the air and high, it is the orbit. */
if (airy) {
  var ob = airy.body, ost = Sim.bodyState(ob, airy.sys, 0);
  var high = Sim.circularOrbit(ob, airy.sys, 0, ob.atmosphere.top + 400, 0, 0);
  var ho = Sim.hudSpeed(high, airy.sys, 0, ob);
  check('in orbit over the air, the speed is the orbit\'s', ho.frame === 'orbit' &&
        Math.abs(ho.kms - V.len(V.sub(high.vel, ost.vel))) < 1e-9, ho.frame + ' ' + ho.kms.toFixed(3) + ' km/s');
}

console.log('--- the world\'s labels keep off the readouts (2026-11-03) ---');
(function () {
  /* Seen in the cockpit: "Seapickle" printed across "PITCH ... REF
   * MIRVEN I". placeLabels now moves a label off Render.hudReadoutBoxes;
   * that is only as good as the boxes, so the instruments are drawn here
   * into a recording context, as drawCockpitView draws them, and every
   * glyph run they print must lie inside a box. Then labels everywhere
   * across the middle of the glass must come out clear of every box. */
  /* The third number is the deck's top where the band covers the foot of
   * the glass: at 800 x 600 the glass is laid out on 592 px and the band
   * starts at 378. */
  [[800, 560], [800, 592, 378], [1280, 640], [1280, 720, 498], [1920, 1000]].forEach(function (vp) {
    var w = vp[0], hv = vp[1], foot = vp[2] || hv, ref = 'MIRVEN I';
    var texts = [];
    var font = '11px';
    var ctx = {
      save: function () {}, restore: function () {}, beginPath: function () {}, moveTo: function () {},
      lineTo: function () {}, closePath: function () {}, stroke: function () {}, fill: function () {},
      fillRect: function () {}, strokeRect: function () {}, arc: function () {}, setLineDash: function () {},
      strokeText: function () {}, createLinearGradient: function () { return { addColorStop: function () {} }; },
      measureText: function (t) { return { width: String(t).length * (parseFloat(/(\d+)px/.exec(this.font || font)[1]) * 0.6) }; },
      fillText: function (t, x, y) {
        var px = parseFloat(/(\d+)px/.exec(this.font)[1]), tw = String(t).length * px * 0.6;
        var x0 = this.textAlign === 'center' ? x - tw / 2 : this.textAlign === 'right' ? x - tw : x;
        texts.push({ t: String(t), x0: x0, x1: x0 + tw, y0: y - px * 0.8, y1: y + px * 0.2 });
      },
      font: '11px monospace', textAlign: 'left'
    };
    Render.drawAirData(ctx, w, hv, { cy: hv / 2, speed: { value: '161,987', unit: 'KM/S' }, g: 1.2, peak: 3.4,
      alt: { value: '161,987', unit: 'KM' }, vs: { text: '-120 m/s', dir: -1 }, air: { text: 'AIR ▼ 161,840 km' } });
    Render.drawHeadingTape(ctx, w, hv, { heading: 291, bug: 300 }, { cy: Math.max(40, hv * 0.30 - 74 - 44), ref: ref });
    ctx.font = 'bold 11px ui-monospace, monospace'; ctx.textAlign = 'center';
    ctx.fillText('PITCH -79.1°   ROLL 168.5°   REF ' + ref, w / 2, hv / 2 + 40);
    Render.drawFacingCue(ctx, w, hv, { mode: 'retro', deg: 80, locked: false }, hv / 2 + 66);
    var boxes = Render.hudReadoutBoxes(w, hv, ref, foot);
    var out = texts.filter(function (t) {
      return !boxes.some(function (b) { return t.x0 >= b.x0 && t.x1 <= b.x1 && t.y0 >= b.y0 && t.y1 <= b.y1; });
    });
    check(w + 'x' + hv + ': every readout the glass prints is inside a reserved box', texts.length > 10 && out.length === 0,
          texts.length + ' texts; ' + out.map(function (t) { return '"' + t.t + '" ' + t.x0.toFixed(0) + '..' + t.x1.toFixed(0) + ',' + t.y0.toFixed(0) + '..' + t.y1.toFixed(0); }).join('; '));
    var bad = 0, eg = '';
    for (var y = 20; y < foot - 20; y += 3) {
      for (var x = w * 0.15; x < w * 0.85; x += 17) {
        var tw = 9 * 7.2;   // "Seapickle", bold 12 px
        var ly = Render.labelOffReadouts(x, y, tw, boxes, foot);
        boxes.forEach(function (b) {
          if (x + tw + 2 > b.x0 && x - 2 < b.x1 && ly + 3 > b.y0 && ly - 10 < b.y1) { bad++; if (!eg) eg = b.id + ' at ' + x.toFixed(0) + ',' + y; }
        });
      }
    }
    check(w + 'x' + hv + ': a planet label anywhere on the glass is moved clear of them', bad === 0, bad + ' ' + eg);
  });
})();

console.log('--- the intercept pip\'s two-line label keeps off them too (2026-11-03) ---');
(function () {
  /* Seen with the pip just under the nose: "PIP 17.0 min" and its drive
   * line through PITCH / ROLL. main.js moves the pair with labelOffReadouts'
   * `extra` (13 px: the second line). Both lines must come out clear. */
  [[800, 592, 378], [1280, 720, 498]].forEach(function (vp) {
    var w = vp[0], hv = vp[1], foot = vp[2];
    var boxes = Render.hudReadoutBoxes(w, hv, 'MIRVEN I', foot), bad = 0, eg = '';
    var tw = 33 * 6.6;   // "thrusters · too close for the drive"
    for (var y = 30; y < foot - 40; y += 2) {
      var x = w / 2 - tw / 2, ly = Render.labelOffReadouts(x, y, tw, boxes, foot, 13);
      boxes.forEach(function (b) {
        [ly, ly + 13].forEach(function (yy) {
          if (x + tw + 2 > b.x0 && x - 2 < b.x1 && yy + 3 > b.y0 && yy - 10 < b.y1) { bad++; if (!eg) eg = b.id + ' from ' + y; }
        });
      });
    }
    check(w + 'x' + hv + ': both lines of the pip\'s label land clear of every readout', bad === 0, bad + ' ' + eg);
  });
})();

console.log('--- ships in one berth do not overprint each other (2026-11-03) ---');
(function () {
  /* Terminus Downport (Cydoren): three ships in the pit, their names all
   * written at the same few pixels. Seven at one spot, beside the port's
   * own name already placed: none of the drawn names may touch another or
   * the port's, the extra ones are counted on one that was drawn, and
   * nothing goes into the hint line at the foot of the view. */
  var tags = [];
  for (var i = 0; i < 7; i++) tags.push({ text: ['Redsail Tender', 'Coldwater Lighter', 'Overwater Wain', 'Juno Runner',
                                               'Halcyon Carrier', 'Fender 6  [port tug]', 'Ironwake Packet'][i],
                                       x: 600 + i * 0.4, y: 440 + i * 0.3, pri: 10 - i });
  var portBox = { x: 640, y: 466, w: 120, h: 13 };
  var foot = 478, reserved = [{ id: 'foot', x0: 0, x1: 1280, y0: foot - 21, y1: 760 }];
  var placed = Render.stackLabels(tags, [portBox], reserved, foot, function (t) { return t.length * 6.6; });
  var boxes = placed.map(function (p) { return { x: p.x - 2, y: p.y - 10, w: p.q.text.length * 6.6 + 4, h: 13 }; });
  var touch = 0;
  for (var a = 0; a < boxes.length; a++) {
    var A = boxes[a];
    if (A.x < portBox.x + portBox.w && A.x + A.w > portBox.x && A.y < portBox.y + portBox.h && A.y + A.h > portBox.y) touch++;
    if (A.y + A.h > foot - 21) touch++;
    for (var b = a + 1; b < boxes.length; b++) {
      var B = boxes[b];
      if (A.x < B.x + B.w && A.x + A.w > B.x && A.y < B.y + B.h && A.y + A.h > B.y) touch++;
    }
  }
  var more = placed.reduce(function (n, p) { return n + p.more; }, 0);
  check('no two ship names, the port\'s name or the hint line overlap', touch === 0, touch + ' overlaps, ' + placed.length + ' drawn');
  check('several are drawn, stacked, and every one left out is counted on one that is',
        placed.length >= 3 && placed.length + more === tags.length, placed.length + ' drawn + ' + more + ' counted');
  check('the first by priority keeps its own spot', placed[0].q.text === 'Redsail Tender' && placed[0].y === 440);
})();

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
