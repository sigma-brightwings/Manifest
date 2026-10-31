/* Your own body, and crouching (2026-10-31).
 *
 * Astra: "Can we give the player first person view a body when we look
 * down? And we also need to be able to crouch with L Ctrl". walk.js poses a
 * pilot's body from the walker every frame (Walk.selfFigure) and the camera
 * stands where its eyes are; Left Ctrl, held, crouches.
 */
'use strict';
const path = require('path');
const ROOT = path.join(__dirname, '..');
require(path.join(ROOT, 'src', 'npcmodel.js'));
require(path.join(ROOT, 'src', 'walk.js'));
const W = globalThis.Walk, NM = globalThis.NpcModel;

let pass = 0, fail = 0;
function ok(c, msg, extra) {
  if (c) { pass++; console.log('  ok   ' + msg + (extra ? '   ' + extra : '')); }
  else { fail++; console.log('  FAIL ' + msg + (extra ? '   ' + extra : '')); }
}

const plan = W.layout('test-port', { seed: 'self', ships: [{ id: 'a', size: 'S', name: 'Talon', mine: true, current: true }] });

function walker() { const w = W.start(plan); w.x = 0; w.z = 1.5; w.yaw = 0; return w; }
function run(w, keys, secs) { for (let t = 0; t < secs; t += 1 / 60) W.step(w, keys, 1 / 60); return w; }
function body(w, floor) {
  const f = W.selfFigure(w, floor || 0, 'Commander', 'civ');
  let lo = Infinity, hi = -Infinity, front = -Infinity;
  const fx = Math.sin(w.yaw), fz = Math.cos(w.yaw);
  for (let v = 0; v < f.model.count; v++) {
    const q = NM.posed(f.model, f.mats, v);
    lo = Math.min(lo, q[1]); hi = Math.max(hi, q[1]);
    front = Math.max(front, (q[0] - w.x) * fx + (q[2] - w.z) * fz);
  }
  return { f, lo, hi, front };
}

console.log('--- crouching ---');
{
  const w = walker();
  ok(Math.abs(W.eyeOf(w) - W.EYE) < 1e-9, 'standing, with no body yet, the eye is EYE');
  run(w, { crouch: true }, 1);
  ok(w.crouch === 1, 'Left Ctrl held a second: all the way down', w.crouch);
  ok(Math.abs(W.eyeOf(w) - W.CROUCH_EYE) < 1e-9, 'and the eye is CROUCH_EYE without a body', W.eyeOf(w));
  run(w, {}, 0.1);
  ok(w.crouch > 0 && w.crouch < 1, 'let go: coming up, not snapped up', w.crouch.toFixed(2));
  run(w, {}, 1);
  ok(w.crouch === 0, 'and up');
}
{
  const a = walker(), b = walker(), c = walker();
  b.crouch = 1; c.crouch = 1;             // already down
  run(a, { w: true }, 1);
  run(b, { w: true, crouch: true }, 1);
  run(c, { w: true, shift: true, crouch: true }, 1);
  const da = a.z - 1.5, db = b.z - 1.5, dc = c.z - 1.5;
  ok(db < da * 0.65, 'crouched you walk slower', 'standing ' + da.toFixed(2) + ' m, crouched ' + db.toFixed(2) + ' m in 1 s');
  ok(Math.abs(dc - db) < 0.05, 'and Shift does not run while crouched', dc.toFixed(2));
}

console.log('--- the body ---');
{
  const w = walker();
  const b = body(w, 0);
  const full = NM.build('pilot', 'Commander', 'civ');
  ok(b.f && b.f.model.self, 'a body is built for you');
  ok(b.f.model.tris < full.tris * 0.75 && b.f.model.tris > full.tris * 0.4, 'without its head', b.f.model.tris + ' of ' + full.tris + ' triangles');
  ok(Math.abs(b.lo) < 0.005, 'boots on the floor', b.lo.toFixed(3));
  ok(Math.abs(w.bodyEye - W.EYE) < 0.01, 'standing, the body\'s eyes are at EYE', w.bodyEye.toFixed(3));
  ok(b.hi < w.bodyEye - 0.1, 'nothing of it within 10 cm below the eye', 'top ' + b.hi.toFixed(2));
  ok(b.front < 0.02, 'the eye is in front of the chest, so looking down shows its outside', 'front ' + b.front.toFixed(3));
  const b2 = body(w, -1.1);
  ok(Math.abs(b2.lo + 1.1) < 0.005, 'on a ship deck at floorY -1.1, still on the floor', b2.lo.toFixed(3));
  run(w, { crouch: true }, 1);
  const c = body(w, 0);
  ok(Math.abs(c.lo) < 0.005, 'crouched, boots still on the floor', c.lo.toFixed(3));
  ok(w.bodyEye > 0.95 && w.bodyEye < 1.35, 'crouched, the eye drops to the crouched body\'s eyes', w.bodyEye.toFixed(2));
  ok(Math.abs(W.eyeOf(w) - w.bodyEye) < 1e-9, 'and the camera goes there');
  const yawed = walker(); yawed.yaw = 2.1; yawed.x = 3; yawed.z = 4;
  const y = body(yawed, 0);
  ok(y.front < 0.02 && Math.abs(y.lo) < 0.005, 'turned and moved, it comes with you');
}
{
  const w = walker();
  run(w, { w: true }, 0.6);
  const f = W.selfFigure(w, 0, 'Commander', 'civ');
  const p = W.selfPose(w);
  ok(w.gait > 0.5, 'walking: the gait is up', w.gait.toFixed(2));
  ok(Math.abs(p.hipL - p.hipR) > 0.05 || Math.abs(p.shL - p.shR) > 0.05, 'and the legs and arms swing');
  const still = walker();
  run(still, { w: true }, 0.6); run(still, {}, 1);
  ok(still.gait < 0.05, 'stopped: the gait settles', still.gait.toFixed(3));
}

console.log('--- looking down ---');
{
  const w = walker();
  W.look(w, 0, -5);
  ok(w.pitch < -1.4 && w.pitch > -1.5, 'you can look down far enough to see yourself', w.pitch.toFixed(2) + ' rad');
  W.look(w, 0, 10);
  ok(Math.abs(w.pitch - 1.2) < 1e-9, 'up is still capped at 1.2');
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
