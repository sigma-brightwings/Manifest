/* city-sites.test.js - the town on a city site stands somewhere of its own.
 *
 *     node test/city-sites.test.js
 *
 * Astra, 2026-10-24: "randomize the location of the city portion and the
 * domes on those ports, without putting them on the landing apron or the
 * door to get some more variety." What this holds:
 *   - the cut takes the city's triangles, all of them and nothing else,
 *     counted against the .glb (a centre test once took a slab of ground);
 *   - nothing is lost: the shell and the city together are the port;
 *   - every spot keeps every corner of the city off the pad, the runway
 *     and its line, the doors, and everything standing on the site;
 *   - inside CITY_REACH, so it never stands in the town dressing;
 *   - the same port gets the same spot every time, and ports differ;
 *   - the frame draws exactly what the placement says;
 *   - generation gives each surface port a seed and moves nothing else.
 */
global.window = global.window || global;
var fs = require('fs'), path = require('path');
var ROOT = path.join(__dirname, '..');
['vec3', 'rng', 'slipspace', 'kepler', 'economy', 'generate', 'hulls', 'ports', 'port-sites', 'render']
  .forEach(function (m) { require(path.join(ROOT, 'src', m + '.js')); });
var R = global.Render, Sites = global.PortSites;

var pass = 0, fail = 0;
function check(n, c, d) {
  if (c) { pass++; console.log('  ok   ' + n + (d ? '   ' + d : '')); }
  else { fail++; console.log('  FAIL  ' + n + (d ? '   ' + d : '')); }
}

function artCityTris(id) {
  var file = path.join(ROOT, 'ref', 'ports', id + '.glb');
  if (!fs.existsSync(file)) return null;
  var buf = fs.readFileSync(file);
  var J = JSON.parse(buf.slice(20, 20 + buf.readUInt32LE(12)).toString('utf8'));
  var at = J.nodes.findIndex(function (n) { return n.name === 'city'; });
  function tris(i) {
    var n = J.nodes[i], t = 0;
    if (n.mesh !== undefined) J.meshes[n.mesh].primitives.forEach(function (p) {
      t += (p.indices !== undefined ? J.accessors[p.indices].count : J.accessors[p.attributes.POSITION].count) / 3;
    });
    (n.children || []).forEach(function (c) { t += tris(c); });
    return t;
  }
  return at < 0 ? null : tris(at);
}

var ids = Object.keys(Sites || {});
check('there are city sites to move', ids.length === 6, ids.join(' '));

console.log('--- the cut ---');
ids.forEach(function (id) {
  var lib = R.libPort(id);
  var want = artCityTris(id);
  var got = lib && lib.city ? lib.city.f.length : 0;
  check(id + ': the city, all of it and nothing else', want !== null && got === want, got + ' cut, ' + want + ' in the art');
  /* NOTHING LOST: the game's own copy of the model, face for face. The
   * solid shell is the port without the city (cars included), and the
   * drawn shell is that without the cars. */
  var file = require(path.join(ROOT, 'src', 'ports', id + '.js'));
  var cars = (lib.movers || []).reduce(function (a, m) { return a + m.mesh.f.length; }, 0);
  check(id + ': the port without its city, and the city, are the whole model',
    lib.solidShell.f.length + got === file.f.length && lib.shell.f.length + cars === lib.solidShell.f.length,
    lib.solidShell.f.length + ' + ' + got + ' of ' + file.f.length);
});

console.log('--- where it goes ---');
function moveFn(sp) {
  var cs = Math.cos(sp.rot), sn = Math.sin(sp.rot);
  return function (p) { var dx = p[0] - sp.cx, dy = p[1] - sp.cy; return [cs * dx - sn * dy + sp.x, sn * dx + cs * dy + sp.y, p[2]]; };
}
ids.forEach(function (id) {
  var lib = R.libPort(id), site = Sites[id], city = lib.city;
  /* the city's own corners, once, then moved per port */
  var used = {};
  city.f.forEach(function (t) { used[t[0]] = used[t[1]] = used[t[2]] = 1; });
  var verts = Object.keys(used).map(function (k) { return city.v[k]; });
  var n = 300, home = 0, onLand = 0, onKeep = 0, out = 0, spots = {}, quads = [0, 0, 0, 0];
  for (var i = 0; i < n; i++) {
    var port = { id: 'c' + i, surface: true, dressing: { citySeed: (i + 0.5) / n } };
    var sp = R.citySpot(id, port);
    if (sp.home) { home++; continue; }
    spots[sp.x.toFixed(3) + ',' + sp.y.toFixed(3)] = 1;
    quads[Math.floor(((sp.rot % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) / (Math.PI / 2)) % 4]++;
    var mv = moveFn(sp), hitL = false, hitK = false, far = false;
    for (var v = 0; v < verts.length; v++) {
      var p = mv(verts[v]);
      if (Math.hypot(p[0], p[1]) > R.CITY_REACH + 1e-9) far = true;
      for (var a = 0; a < site.land.length && !hitL; a++) {
        var b = site.land[a];
        if (p[0] > b[0] && p[0] < b[2] && p[1] > b[1] && p[1] < b[3]) hitL = true;
      }
      for (var k = 0; k < site.keep.length && !hitK; k++) {
        var q = site.keep[k];
        if (p[0] > q[0] && p[0] < q[2] && p[1] > q[1] && p[1] < q[3]) hitK = true;
      }
      if (site.strip) {
        var s = site.strip, long = s[3] - s[1] >= s[2] - s[0];
        if (long ? (p[0] > s[0] && p[0] < s[2]) : (p[1] > s[1] && p[1] < s[3])) hitL = true;   // the runway's line, any distance
      }
    }
    if (hitL) onLand++;
    if (hitK) onKeep++;
    if (far) out++;
  }
  check(id + ': off the pad, the runway, its line and the doors', onLand === 0, onLand + ' of ' + n);
  check(id + ': off everything standing on the site', onKeep === 0, onKeep + ' of ' + n);
  check(id + ': inside CITY_REACH, clear of the town dressing', out === 0, out + ' of ' + n);
  check(id + ': most ports find a place of their own', home < n * 0.05, home + ' stay where the art had it');
  check(id + ': and the places differ', Object.keys(spots).length > n * 0.9 && quads.every(function (x) { return x > 0; }),
    Object.keys(spots).length + ' places, headings by quarter ' + quads.join('/'));
});

console.log('--- the same port, the same place ---');
(function () {
  var id = ids[0];
  var a = R.citySpot(id, { id: 'x', surface: true, dressing: { citySeed: 0.4242 } });
  var b = R.citySpot(id, { id: 'y', surface: true, dressing: { citySeed: 0.4242 } });
  check('one seed, one place', a.x === b.x && a.y === b.y && a.rot === b.rot);
  var c = R.citySpot(id, { id: 'old-save', name: 'Ashford Downport', surface: true });
  var d = R.citySpot(id, { id: 'old-save', name: 'Ashford Downport', surface: true });
  check('a port with no seed still gets a place, and keeps it', c && d && c.x === d.x && c.rot === d.rot);
  check('a model with no city has nothing to move', R.citySpot('spine-l', { id: 'z', surface: true }) === null);
})();

console.log('--- the frame ---');
(function () {
  var id = ids[0], sp = R.citySpot(id, { id: 'f', surface: true, dressing: { citySeed: 0.77 } });
  var frame = { pos: { x: 10, y: -4, z: 2 }, right: { x: 0, y: 1, z: 0 }, up: { x: 0, y: 0, z: 1 }, fwd: { x: 1, y: 0, z: 0 } };
  var km = 3.5, fr = R.cityFrame(frame, sp, km), mv = moveFn(sp), worst = 0;
  [[0.5, 0.1, 0.02], [0.7, -0.15, 0.08], [0.6, 0, 0]].forEach(function (p) {
    var m = mv(p);
    var want = { x: frame.pos.x + (frame.right.x * m[0] + frame.up.x * m[1] + frame.fwd.x * m[2]) * km,
                 y: frame.pos.y + (frame.right.y * m[0] + frame.up.y * m[1] + frame.fwd.y * m[2]) * km,
                 z: frame.pos.z + (frame.right.z * m[0] + frame.up.z * m[1] + frame.fwd.z * m[2]) * km };
    var got = { x: fr.pos.x + (fr.right.x * p[0] + fr.up.x * p[1] + fr.fwd.x * p[2]) * km,
                y: fr.pos.y + (fr.right.y * p[0] + fr.up.y * p[1] + fr.fwd.y * p[2]) * km,
                z: fr.pos.z + (fr.right.z * p[0] + fr.up.z * p[1] + fr.fwd.z * p[2]) * km };
    worst = Math.max(worst, Math.abs(got.x - want.x), Math.abs(got.y - want.y), Math.abs(got.z - want.z));
  });
  check('the city frame draws where the placement says', worst < 1e-9, 'worst ' + worst.toExponential(1) + ' km');
  var cr = { x: fr.right.y * fr.up.z - fr.right.z * fr.up.y, y: fr.right.z * fr.up.x - fr.right.x * fr.up.z, z: fr.right.x * fr.up.y - fr.right.y * fr.up.x };
  var hand = cr.x * fr.fwd.x + cr.y * fr.fwd.y + cr.z * fr.fwd.z;
  var hand0 = (function (f) { var c = { x: f.right.y * f.up.z - f.right.z * f.up.y, y: f.right.z * f.up.x - f.right.x * f.up.z, z: f.right.x * f.up.y - f.right.y * f.up.x }; return c.x * f.fwd.x + c.y * f.fwd.y + c.z * f.fwd.z; })(frame);
  check('and keeps its handedness, so no face turns inside out', Math.abs(hand - hand0) < 1e-9);
  check('an orbital port draws no city', R.drawPortCity(null, null, frame, { id: 'o', surface: false }, 1, null, id, null) === false);
})();

console.log('--- generation ---');
(function () {
  var Galaxy = require(path.join(ROOT, 'src', 'galaxy.js'));
  var g = Galaxy.build('kawartha'), surf = 0, seeded = 0, orbital = 0, orbSeeded = 0, same = true;
  for (var i = 0; i < 6; i++) {
    var st = g.stars[i], fac = g.factionById ? g.factionById[st.factionId] : null;
    var opts = fac ? { faction: fac, allFactions: g.factions } : undefined;
    var a = Gen.generateSystem(st.seed, opts), b = Gen.generateSystem(st.seed, opts);
    (a.ports || []).forEach(function (p, k) {
      var d = p.dressing || {};
      if (p.surface) { surf++; if (typeof d.citySeed === 'number' && d.citySeed >= 0 && d.citySeed < 1) seeded++; }
      else { orbital++; if (d.citySeed !== null && d.citySeed !== undefined) orbSeeded++; }
      if (d.citySeed !== (b.ports[k].dressing || {}).citySeed) same = false;
    });
  }
  check('every surface port has a city seed', surf > 0 && seeded === surf, seeded + ' of ' + surf);
  check('an orbital port has none', orbSeeded === 0, orbital + ' orbital');
  check('the same system gives the same seeds', same);
})();

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
