/* Does she still boot, and is the jump path intact?
 *
 *     node tools/electron-probe.cjs tools/probe-boot.js "Claude outputs\boot"
 *
 * Cheap insurance after an edit to main.js: the suite parses the file but
 * only the real thing proves the frame loop runs. Also checks the one
 * seam the 2026-11-14 jump-air fix touched, from inside the page. */
await wait(2500);
await shot('booted');

log('Outside module: ' + (typeof window.Outside));
log('step arity: ' + (window.Outside ? window.Outside.step.length : 'n/a') +
    '   (4 = it takes opts)');

/* The fix calls step with an opts object. Exercise that signature here,
 * against the live module rather than a required copy. */
if (window.Outside) {
  var g = {
    t: 0, here: { id: 'sys' }, paused: false,
    adrift: [{ id: 'x', name: 'Probe', o2: 3600, t0: 0, sysKey: 'sys',
               pos: { x: 9e9, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 } }],
    outside: null, crewRep: 0, standing: {}, marks: {},
    ship: { pos: { x: 0, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 },
            thrust: { x: 0, y: 0, z: 0 }, hullHp: 10, hullMax: 10,
            docked: null, landed: false }
  };
  var before = g.adrift[0].o2;
  window.Outside.step(g, 2 * 3600, null, { noPickup: true });
  log('a 2 h interval handed over whole: air ' + before + ' -> ' +
      g.adrift[0].o2 + ', dead: ' + (g.adrift[0].dead ? 'yes' : 'no'));
  log(g.adrift[0].o2 === 0 && g.adrift[0].dead
      ? 'PASS  the candle burns on an interval handed over whole'
      : 'FAIL  the interval did not burn the candle');
}

/* And the game's own clock is running, which is the boot check. */
var t0 = (window.G && window.G.t) || 0;
await wait(1200);
var t1 = (window.G && window.G.t) || 0;
log('sim clock: ' + t0.toFixed(1) + ' -> ' + t1.toFixed(1) +
    (t1 > t0 ? '   PASS  the frame loop is running' : '   (paused or on a menu)'));
await shot('after');
