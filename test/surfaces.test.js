/* surfaces.test.js — the surface detail on stations, their decks and ships.
 *
 *     node test/surfaces.test.js
 *
 * Astra, 2026-11-10: "hexagonal deck plates on syndicate stations, and Navy
 * stations should have armor plates on the exterior, and this should be
 * textured. All exterior and interior station models must be textured";
 * then "textures can include higher-quality bars and ship hulls, also" -
 * the bars being "the general station interior decoration, with the
 * billboards and whatnot. Everything from disembarking from the ship
 * onward", and the hulls "all ships, outside and in".
 *
 * Node cannot run a shader, so this pins what can be pinned: the shader
 * carries each surface (checked against gl.js's own text); walk.js hands
 * every deck face a material and its quad's metres, and the dressing says
 * what each prop is made of, in every livery; and every draw path that
 * puts station or ship metal on screen sets a surface round it. A new
 * path that forgets is the thing this catches.
 */
global.window = global.window || global;
var fs = require('fs'), path = require('path');
var Walk = require('../src/walk.js');
require('../src/dressing.js');

var pass = 0, fail = 0;
function check(n, c, d) {
  if (c) { pass++; console.log('  ok   ' + n + (d ? '   ' + d : '')); }
  else { fail++; console.log('  FAIL  ' + n + (d ? '   ' + d : '')); }
}
function src(f) { return fs.readFileSync(path.join(__dirname, '..', 'src', f), 'utf8'); }
var gl = src('gl.js'), main = src('main.js'), render = src('render.js');

console.log('--- the shader carries each surface ---');
check('hex deck plates, on the Syndicate\'s decks and not on a hull',
      gl.indexOf('vec4 hexCell(vec2 p)') > 0 &&
      gl.indexOf("float hexOn = (style > 0.5 && style < 1.5 && isFloor > 0.5 && ship < 0.5)") > 0);
check('armour plate on the Navy\'s outsides only',
      gl.indexOf("float armOn = (style > 1.5 && ind < 0.5)") > 0);
check('a hull\'s plating shrunk to her size, and no windows on her',
      gl.indexOf("if (uSurfK.x > 0.5) sP *= uSurfK.y;") > 0 &&
      gl.indexOf("if (ind < 0.5 && isWall > 0.5 && ship < 0.5)") > 0);
check('deck plans stand y up and are turned for the shader',
      gl.indexOf("if (uSurf.w > 0.5) { sP = sP.xzy; sN = sN.xzy; }") > 0);
check('glass is left unplated', gl.indexOf('vAlpha * uAlpha > 0.98') > 0);
check('the material and quad attributes run vertex to fragment',
      gl.indexOf("'in float aMat;'") > 0 && gl.indexOf("'in vec4 aQuad;'") > 0 &&
      gl.indexOf('flat out float vMat; out vec4 vQuad;') > 0 && gl.indexOf('flat in float vMat; in vec4 vQuad;') > 0);
check('uSurfK is looked up and uploaded',
      gl.indexOf("'uSurfK'") > 0 && gl.indexOf('gl.uniform2f(meshUni.uSurfK') > 0);
check('a station\'s rooms walked on foot keep her surface in the cockpit pass',
      /surf: surfFlag \};\s*\}\s*cockpitQ = \{/.test(gl));
var codes = Walk.SURF_MAT, missing = [];
Object.keys(codes).forEach(function (k) {
  if (k === 'plain') return;
  if (gl.indexOf('mi == ' + codes[k]) < 0) missing.push(k);
});
check('every material walk.js names has its branch in surfMat', missing.length === 0, missing.join(', '));

console.log('--- the decks walked on foot ---');
function deck(liv) {
  var p = Walk.layout('b15', { seed: 'surfaces', livery: liv, ships: [{ id: 's', size: 'S' }] });
  var m = Walk.meshFor(p), by = {};
  m.mat.forEach(function (c) { by[c] = (by[c] || 0) + 1; });
  return { plan: p, mesh: m, by: by };
}
var civ = deck('civ'), syn = deck('syn'), navy = deck('navy');
check('every face has a material and every vertex its quad\'s metres',
      civ.mesh.mat.length === civ.mesh.f.length && civ.mesh.uvq.length === civ.mesh.v.length,
      civ.mesh.f.length + ' faces');
var C = codes;
check('a civil deck: tile, boards, wood, vinyl, paint, rust, pipe, brass, ad boards',
      ['tile', 'woodfloor', 'wood', 'vinyl', 'paint', 'rust', 'pipe', 'brass', 'board'].every(function (k) { return civ.by[C[k]] > 0; }),
      JSON.stringify(civ.by));
check('the Syndicate\'s concourse is deck (hex plate), not tile; its banners are cloth',
      !syn.by[C.tile] && syn.by[C.cloth] > 0);
check('the Navy\'s "wood" is laminate', navy.by[C.laminate] > 0 && !navy.by[C.wood]);
var bar = civ.plan.rooms.filter(function (r) { return r.kind === 'bar'; })[0];
check('the bar has a room to floor', !!bar);
var uv = Walk.quadUV([[0, 0, 0], [3.4, 0, 0], [3.4, 1.3, 0], [0, 1.3, 0]]);
check('a board\'s quad metres: 3.4 by 1.3, from its corner',
      Math.abs(uv[2][0] - 3.4) < 1e-9 && Math.abs(uv[2][1] - 1.3) < 1e-9 && uv[0][2] === 3.4 && Math.abs(uv[0][3] - 1.3) < 1e-9);

console.log('--- every draw path wears a surface ---');
/* Between `open` (the last before `call`) and `call`, nothing that clears. */
function wrapped(text, call, open, close) {
  var at = text.indexOf(call);
  if (at < 0) return false;
  var o = text.lastIndexOf(open, at), c = text.indexOf(close, at);
  if (o < 0 || c < 0) return false;
  var between = text.slice(o + open.length, at);
  return between.indexOf(close) < 0;
}
check('the station model, spin and interior', wrapped(main, 'Render.drawStationModel(', 'Render.setSurface(b, skin)', 'Render.setSurface(null)') &&
      wrapped(main, 'Render.drawStationInterior(', 'Render.setSurface(b, skin)', 'Render.setSurface(null)'));
check('the outworks', wrapped(main, 'Render.drawStationOutworks(', 'Render.setSurface(b, skin)', 'Render.setSurface(null)'));
check('a ground port\'s dressing, lamps and doors',
      wrapped(main, 'Render.drawPortDressing(', 'Render.setSurface(b, skin)', 'Render.setSurface(null)') &&
      wrapped(main, 'Render.drawPortDoors(', 'Render.setSurface(b, skin)', 'Render.setSurface(null)'));
check('her hangar seen from aboard, and her deck and rooms on foot',
      wrapped(main, 'global.Walk.meshFor(hp)', 'walkSurface(true)', 'walkSurface(false)') &&
      wrapped(main, 'global.GLWorld.queueCockpit(cam, F, null, global.Walk.meshFor(p)', 'walkSurface(true)', 'walkSurface(false)'));
['function drawHullModel(', 'function drawShipModel(', 'function queueRoomsInPlace(', 'function queueCockpitRoom('].forEach(function (fn) {
  var at = render.indexOf(fn), end = render.indexOf('\n  function ', at + 10);
  var body = at >= 0 ? render.slice(at, end) : '';
  check('a ship: ' + fn.slice(9, -1), body.indexOf('pushShipSurface(') > 0 && body.indexOf('popSurface(') > 0);
});
check('the station\'s surface is given back after a ship drawn inside her',
      gl.indexOf('GL.getSurface = function') > 0 && gl.indexOf('GL.putSurface = function') > 0);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
