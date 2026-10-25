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

console.log('--- the city in parts ---');
ids.forEach(function (id) {
  var parts = R.cityParts(id), site = Sites[id];
  var domeTris = site.domes.map(function (d) { return parts && parts.domes[d.k] ? parts.domes[d.k].f.length : 0; });
  var total = parts ? parts.core.f.length + domeTris.reduce(function (a, b) { return a + b; }, 0) : 0;
  var tubes = site.runs.filter(function (r) { return /^(tube|roof|port)$/.test(r[0]); }).reduce(function (a, r) { return a + r[1]; }, 0);
  check(id + ': core, five domes and the art\'s tubes are the whole city', parts && site.domes.length === 5 && total + tubes === R.libPort(id).city.f.length,
    'core ' + (parts && parts.core.f.length) + ', domes ' + domeTris.join('/') + ', art tubes ' + tubes);
  /* each dome's slice lies round its own centre, inside its reach */
  var stray = 0;
  site.domes.forEach(function (d) {
    var m = parts.domes[d.k];
    m.f.forEach(function (t) { t.forEach(function (vi) { var v = m.v[vi]; if (Math.hypot(v[0] - d.c[0], v[1] - d.c[1]) > d.reach + 1e-3) stray++; }); });
  });
  check(id + ': every dome slice is that dome', stray === 0, stray + ' corners outside');
});

console.log('--- the tubes ---');
function placed(chain, p) { return R.cityPlace(chain, p); }
ids.forEach(function (id) {
  var site = Sites[id], S = R.citySizes(site), n = 300;
  var net = 0, loose = 0, offHub = 0, wallBad = 0, tooTall = 0, notThicker = 0, crossed = 0, crowded = 0, sheds = {};
  for (var i = 0; i < n; i++) {
    var sp = R.citySpot(id, { id: 't' + i, surface: true, dressing: { citySeed: (i + 0.5) / n } });
    var L = sp.layout;
    if (!L) continue;
    net++;
    var B = L.branch, F = L.face, own = site.sheds[F.s];
    sheds[F.s + ':' + F.n.join(',')] = 1;
    /* every dome: its tube starts at the branch point and ends AT ITS DOOR,
     * where the door actually is once the dome is turned and placed */
    L.domes.forEach(function (d) {
      var art = site.domes.filter(function (x) { return x.k === d.k; })[0];
      var door = placed([{ rot: d.rot, x: d.c[0], y: d.c[1], cx: art.c[0], cy: art.c[1] }], [art.mouth[0], art.mouth[1], 0]);
      if (Math.hypot(door[0] - d.m[0], door[1] - d.m[1]) > 1e-9) loose++;
      /* and the door faces the branch point */
      var toB = [B[0] - d.m[0], B[1] - d.m[1]], out = [d.m[0] - d.c[0], d.m[1] - d.c[1]];
      if (toB[0] * out[0] + toB[1] * out[1] <= 0) loose++;
    });
    /* the trunk: from the branch point into the middle of a shed wall */
    var onWall = F.n[0] !== 0
      ? Math.abs(F.at[0] - (F.n[0] > 0 ? own[3] : own[0])) < 1e-9 && Math.abs(F.at[1] - (own[1] + own[4]) / 2) < 1e-9
      : Math.abs(F.at[1] - (F.n[1] > 0 ? own[4] : own[1])) < 1e-9 && Math.abs(F.at[0] - (own[0] + own[3]) / 2) < 1e-9;
    var dir = [B[0] - F.at[0], B[1] - F.at[1]], dl = Math.hypot(dir[0], dir[1]);
    var square = Math.abs(dir[0] / dl - F.n[0]) < 1e-9 && Math.abs(dir[1] / dl - F.n[1]) < 1e-9;
    if (!onWall || !square || L.trunkW > F.w * 0.85 + 1e-12) wallBad++;
    if (S.ground + S.trunkH > own[5] + 1e-12) tooTall++;               // under the eave
    if (!(L.trunkW > S.thin * 1.2 && S.trunkH > S.thin)) notThicker++;
    /* nothing crosses anything: domes apart, tubes clear of other domes and
     * of every building, the trunk clear of all but its own shed */
    L.domes.forEach(function (d, a) {
      L.domes.forEach(function (e, b) {
        if (a < b && Math.hypot(d.c[0] - e.c[0], d.c[1] - e.c[1]) < d.reach + e.reach) crowded++;
        if (a !== b && R._distPtSeg && R._distPtSeg(e.c[0], e.c[1], B[0], B[1], d.m[0], d.m[1]) < e.reach + S.thin / 2) crossed++;
      });
      (site.stands || []).forEach(function (s) {
        if (R._distPtBox(d.c[0], d.c[1], s) < d.reach) crowded++;
        if (R._segHitsBox(B[0], B[1], d.m[0], d.m[1], s, S.thin / 2)) crossed++;
      });
    });
  }
  check(id + ': every port joins its domes with tubes', net === n, net + ' of ' + n);
  check(id + ': every tube runs from the branch point to its own dome\'s door, and the door faces it', loose === 0, loose + ' wrong');
  check(id + ': the trunk goes square into the middle of a shed wall, and fits it', wallBad === 0, wallBad + ' wrong; ' + Object.keys(sheds).length + ' different walls used');
  check(id + ': and stays under the eave', tooTall === 0);
  check(id + ': the trunk is thicker than the tubes', notThicker === 0,
    'trunk ' + (S.thin * 2).toFixed(4) + ' wide at most, ' + S.trunkH.toFixed(4) + ' tall; tubes ' + S.thin.toFixed(4));
  check(id + ': no dome stands in another or in a building', crowded === 0, crowded + ' found');
  check(id + ': no tube runs through a dome or a building', crossed === 0, crossed + ' found');
});

console.log('--- where it goes ---');
ids.forEach(function (id) {
  var site = Sites[id];
  var n = 300, home = 0, onLand = 0, onKeep = 0, out = 0, spots = {}, quads = [0, 0, 0, 0], skew = 0;
  for (var i = 0; i < n; i++) {
    var port = { id: 'c' + i, surface: true, dressing: { citySeed: (i + 0.5) / n } };
    var sp = R.citySpot(id, port);
    if (sp.home) { home++; continue; }
    spots[sp.x.toFixed(3) + ',' + sp.y.toFixed(3)] = 1;
    var qt = sp.rot / (Math.PI / 2);
    if (Math.abs(qt - Math.round(qt)) > 1e-9) skew++;
    quads[((Math.round(qt) % 4) + 4) % 4]++;
    /* EVERY CORNER OF EVERYTHING DRAWN - core, domes, tubes, drum, trunk -
     * through the same chains drawPortCity uses */
    var verts = [];
    R.cityDrawList(id, port).forEach(function (it) {
      var used = {};
      it.mesh.f.forEach(function (t) { used[t[0]] = used[t[1]] = used[t[2]] = 1; });
      Object.keys(used).forEach(function (k) { verts.push(placed(it.chain, it.mesh.v[k])); });
    });
    var hitL = false, hitK = false, far = false;
    for (var v = 0; v < verts.length; v++) {
      var p = verts[v];
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
  /* Astra, 2026-10-24: the building the domes connect to stands at a right
   * angle to the other structures' walls - the slab turns in quarter turns */
  check(id + ': the slab and its sheds stand square to the site', skew === 0, skew + ' at an angle');
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
  var km = 3.5, fr = R.cityFrame(frame, sp, km), mv = function (p) { return placed([sp], p); }, worst = 0;
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
  /* and a dome, through TWO frames, lands where cityPlace says */
  var list = R.cityDrawList(id, { id: 'f', surface: true, dressing: { citySeed: 0.77 } });
  var dome = list.filter(function (it) { return it.chain.length === 2; })[0], worst2 = 0;
  if (dome) {
    var f2 = R.cityFrame(R.cityFrame(frame, dome.chain[0], km), dome.chain[1], km);
    dome.mesh.f.slice(0, 20).forEach(function (t) {
      var p = dome.mesh.v[t[0]], m = placed(dome.chain, p);
      var want = { x: frame.pos.x + (frame.right.x * m[0] + frame.up.x * m[1] + frame.fwd.x * m[2]) * km,
                   y: frame.pos.y + (frame.right.y * m[0] + frame.up.y * m[1] + frame.fwd.y * m[2]) * km,
                   z: frame.pos.z + (frame.right.z * m[0] + frame.up.z * m[1] + frame.fwd.z * m[2]) * km };
      var got = { x: f2.pos.x + (f2.right.x * p[0] + f2.up.x * p[1] + f2.fwd.x * p[2]) * km,
                  y: f2.pos.y + (f2.right.y * p[0] + f2.up.y * p[1] + f2.fwd.y * p[2]) * km,
                  z: f2.pos.z + (f2.right.z * p[0] + f2.up.z * p[1] + f2.fwd.z * p[2]) * km };
      worst2 = Math.max(worst2, Math.abs(got.x - want.x), Math.abs(got.y - want.y), Math.abs(got.z - want.z));
    });
  }
  check('a dome, through two frames, draws where its placement says', !!dome && worst2 < 1e-9, 'worst ' + worst2.toExponential(1) + ' km');
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
