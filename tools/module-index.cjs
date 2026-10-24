/* module-index.cjs — the game's index of station modules.
 *
 *     node tools/module-index.cjs [modulesDir]     -> src/modules.js
 *     default modulesDir: "Claude outputs/modules" (tools/chop-modules.cjs)
 *
 * The chopper's catalog is a review document: every module in every paint,
 * with part lists and source lists. The game needs much less, and needs it
 * in its own frame and units, so this folds it to what src/growth.js reads:
 *
 *   - ONE ENTRY PER FORM AND PAINT. The same berth at s/m/l, or turned to
 *     another pose, is one form; its civil, navy and Syndicate paints stay
 *     separate entries so a navy port grows in navy paint.
 *   - GAME AXES (+z up; glb2hulls' toGame) and METRES. Port models are
 *     authored in metres. Ships are authored at no fixed scale and every
 *     hull is drawn at SHIP_LEN (25 m), so a ship module is scaled by
 *     25 / the ship's longest side.
 *   - Origin at the module's base, as the chopper wrote it.
 *   - Growth points kept to the useful ones: every way on, door and route
 *     point, and up to HULL_KEEP hull points spread over the faces.
 *
 * Point record: [x, y, z, face, type, cls, from?]
 *   face  0..5 = +x -x +y -y +z -z (the outward normal)
 *   type  'r' route, 'd' outer door, 'x' way on, 'h' hull
 *   cls   'L' | 'SM' | null
 *   from  route points with a neck: [x, y, z] on the module's own route
 *         where the neck starts (2026-10-21)
 */
'use strict';
var fs = require('fs');
var path = require('path');
var ROOT = path.join(__dirname, '..');
var DIR = path.resolve(process.argv[2] || path.join(ROOT, 'Claude outputs', 'modules'));
var SHIP_LEN_M = 25;          // render.js SHIP_LEN, 0.025 km
var HULL_KEEP = 12;
var TURN_SPREAD = 60;         // metres: a dock's mouths this close share one doorway when it is turned in

function toGame(p) { return [p[0], -p[2], p[1]]; }
function face(n) {
  var a = Math.abs(n[0]) > 0.5 ? 0 : Math.abs(n[1]) > 0.5 ? 1 : 2;
  return a * 2 + ((n[a] > 0) ? 0 : 1);
}
function r2(v) { return Math.round(v * 100) / 100; }

function liveryOf(entry) {
  if (entry.from === 'ship') return 'ship';
  var m = entry.sources[0].model;
  return /-navy-/.test(m) ? 'navy' : /-syn-/.test(m) ? 'syn' : 'civ';
}

function main() {
  var cat = JSON.parse(fs.readFileSync(path.join(DIR, 'modules.json'), 'utf8'));
  var seen = {}, mods = [];
  cat.modules.forEach(function (e) {
    var liv = liveryOf(e), key = e.form + '|' + liv;
    if (seen[key]) { seen[key].n += e.sources.length; return; }
    var k = e.from === 'ship' ? SHIP_LEN_M / Math.max(e.modelSpan || 1, 1e-6) : 1;
    var s = toGame(e.size).map(function (v) { return r2(Math.abs(v) * k); });
    if (Math.max(s[0], s[1], s[2]) < 2) return;            // under two metres: dressing, not a module
    var pts = (e.growth && e.growth.points) || [];
    var keep = pts.filter(function (q) { return !q.hull; });
    var hull = pts.filter(function (q) { return q.hull; });
    /* spread the kept hull points over the faces: round-robin by face */
    var byFace = [[], [], [], [], [], []];
    hull.forEach(function (q) { byFace[face(q.normal)].push(q); });
    for (var i = 0; keep.length < pts.length && hull.length && i < HULL_KEEP; i++) {
      var f = byFace[i % 6];
      if (f.length) keep.push(f.shift());
    }
    var P = keep.map(function (q) {
      var type = q.exit ? 'x' : q.door ? 'd' : q.hull ? 'h' : 'r';
      var rec = [r2(q.at[0] * k), r2(q.at[1] * k), r2(q.at[2] * k), face(q.normal), type, q.cls || null];
      /* a route point's NECK: where on the module's own route it starts */
      if (type === 'r' && q.from && q.neck > 0.005) rec.push([r2(q.from[0] * k), r2(q.from[1] * k), r2(q.from[2] * k)]);
      return rec;
    });
    var cls = null;
    e.berths.forEach(function (b) { if (b.cls === 'L') cls = 'L'; else if (!cls && b.cls) cls = b.cls; });
    /* The face a berth module joins its parent by: where its first routed
     * berth's route comes in. Without one it stands on its base, -z,
     * except a pass-through, which joins by a way on (below). */
    var join = 5;
    var routed = e.berths.filter(function (b) { return b.route && b.door && b.door.normal; });
    var rb = routed[0];
    if (rb) join = face(toGame(rb.door.normal));
    /* THE WAY IN (Astra, 2026-10-24: ships "enter from the primary L size
     * berth and be taken through to their docking bay somewhere inside").
     *   in  the class of ship that can come in through the join face's
     *       doorway, or null when there is none;
     *   ob  how many of its bays open only to space (no way in from inside);
     *   jd  where that doorway is (game axes, metres), so a neck lands on it.
     * A dock comes in through the doorway its routed berths share. A piece
     * with no berth that routes run through (a pass-through) joins by one
     * of its ways on, door to door, instead of standing on its base. */
    var inn = null, jd = null, turned = false;
    var ds = e.berths.map(function (b) { return b.door; });
    var anyL = e.berths.some(function (b) { return b.cls === 'L'; }) ? 'L' : 'SM';
    if (rb) {
      inn = routed.some(function (b) { return b.cls === 'L'; }) ? 'L' : 'SM';
      jd = toGame(rb.door.at).map(function (v) { return r2(v * k); });
    } else if (e.berths.length && ds.every(function (d) { return d && d.normal && face(toGame(d.normal)) === face(toGame(ds[0].normal)); }) &&
               ds.every(function (d) { return Math.hypot(d.at[0] - ds[0].at[0], d.at[1] - ds[0].at[1], d.at[2] - ds[0].at[2]) <= TURN_SPREAD; })) {
      /* A dock whose bays open straight to space through ONE face, mouths
       * together: TURNED IN, that face set against the station so its
       * outer door becomes the doorway in from inside (Astra, 2026-10-19:
       * "outer doors can then become the doors between the inside and
       * outside of the NEXT add-on"). */
      join = face(toGame(ds[0].normal)); inn = anyL; turned = true;
      jd = toGame(ds[0].at).map(function (v) { return r2(v * k); });
    } else if (!e.berths.length && e.carries) {
      var wo = P.filter(function (q) { return q[4] === 'x'; })[0];
      if (wo) { join = wo[3]; inn = e.carries; jd = [wo[0], wo[1], wo[2]]; }
    }
    var ob = turned ? 0 : e.berths.length - routed.length;
    /* the station (or ship) family it was cut from: 'spine', 'ring', 'bulk'...
     * so a port can grow in its own family's pieces and keep its theme */
    var fam = path.basename(e.sources[0].model, '.glb').replace(/\(\d+\)/g, '')
      .replace(/-(navy|syn)(?=-|$)/, '').replace(/-[sml]$/, '');
    var rec = { id: e.id, k: e.kind, f: e.form, liv: liv, fam: fam, s: s, t: e.tris, cls: cls, nb: e.berths.length,
                pass: e.carries || null, door: !!e.outerDoor, join: join, p: P, n: e.sources.length };
    if (inn) { rec['in'] = inn; rec.jd = jd; }
    if (turned) rec.ti = 1;
    if (ob) rec.ob = ob;
    seen[key] = rec;
    mods.push(rec);
  });
  var out = { v: 1, faces: [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]], mods: mods };
  var file = path.join(ROOT, 'src', 'modules.js');
  fs.writeFileSync(file,
    '/* GENERATED by tools/module-index.cjs from the chopper\'s catalog\n' +
    ' * (tools/chop-modules.cjs). Station modules for src/growth.js: one per\n' +
    ' * form and paint, game axes, metres, origin at the base. */\n' +
    '(function (g) { g.ModuleLib = ' + JSON.stringify(out) + ';\n' +
    '  if (typeof module !== "undefined" && module.exports) module.exports = g.ModuleLib;\n' +
    '})(typeof window !== "undefined" ? window : globalThis);\n');
  var by = {};
  mods.forEach(function (m) { by[m.k] = (by[m.k] || 0) + 1; });
  console.log(mods.length + ' modules -> ' + path.relative(ROOT, file) + ' (' + Math.round(fs.statSync(file).size / 1024) + ' KB)');
  console.log(JSON.stringify(by));
}
main();
