// path-show.cjs - the way a ship goes, from open space to a berth in a GROWN dock.
//
//   node "Claude outputs/path-show.cjs" [model ...]      -> Claude outputs/path-show.html
//
// Astra, 2026-10-30: "show me the pathing for a ship that berths in a grown
// station, flying in through the L bay and following the elevators in."
//
// Every leg here is read from data the game already holds, nothing drawn
// freehand:
//   approach  the hold off the PRIMARY L berth (Growth.wayIn) and in through
//             its doors to the L stand
//   core      that berth route's own corners (src/ports.js `via`), as far as
//             the growth point the add-on stands on
//   ride      a leg the route takes on a hoist car or lift (the art's `ride`
//             and `lift`/`shaft`, the same legs sim.js rides: rideAt)
//   neck      the corridor cut from the route out through the wall
//             (slot.neck, growth-points `from` -> `at`)
//   through   across a pass-through piece, door to the way on its child
//             stands on (the chopper keeps the way on, not the corridor)
//   bay       the add-on dock's own route, door to stand, cut from the
//             original model's berth route by the chopper (modules.json),
//             turned and placed exactly as Growth placed the piece
global.window = global;
var fs = require('fs'), path = require('path');
var ROOT = path.join(__dirname, '..'), R = path.join(ROOT, 'src') + '/';
['ports', 'growth-points', 'modules'].forEach(function (m) { require(R + m + '.js'); });
var Gr = require(R + 'growth.js');
var Chop = require(path.join(ROOT, 'tools', 'chop-modules.cjs'));
var MODDIR = path.join(__dirname, 'modules') + '/';
var CAT = JSON.parse(fs.readFileSync(MODDIR + 'modules.json', 'utf8'));
var catById = {};
CAT.modules.forEach(function (e) { catById[e.id] = e; });

function sub(a, b) { return [a[0]-b[0], a[1]-b[1], a[2]-b[2]]; }
function add(a, b) { return [a[0]+b[0], a[1]+b[1], a[2]+b[2]]; }
function mul(a, s) { return [a[0]*s, a[1]*s, a[2]*s]; }
function dot(a, b) { return a[0]*b[0] + a[1]*b[1] + a[2]*b[2]; }
function len(a) { return Math.sqrt(dot(a, a)); }
function mv(M, v) { return [M[0]*v[0]+M[1]*v[1]+M[2]*v[2], M[3]*v[0]+M[4]*v[1]+M[5]*v[2], M[6]*v[0]+M[7]*v[1]+M[8]*v[2]]; }
function toGame(p) { return [p[0], -p[2], p[1]]; }
function near(a, b, e) { return len(sub(a, b)) < e; }

/* ---- meshes (as growth-paper.cjs) --------------------------------------- */
function decimate(tris, n) {
  var l = tris.map(function (t) {
    var u = sub(t[1], t[0]), v = sub(t[2], t[0]);
    var x = u[1]*v[2]-u[2]*v[1], y = u[2]*v[0]-u[0]*v[2], z = u[0]*v[1]-u[1]*v[0];
    return { t: t, a: x*x + y*y + z*z };
  });
  l.sort(function (p, q) { return q.a - p.a; });
  return l.slice(0, n).map(function (o) { return o.t; });
}
var meshCache = {};
function modMesh(mod) {
  if (meshCache[mod.id]) return meshCache[mod.id];
  var m = Chop.readModel(MODDIR + 'glb/' + mod.id + '.glb'), tris = [], g = m.g;
  m.units.forEach(function (u) { u.tris.forEach(function (t) { tris.push(t); }); });
  function hex(idx) {
    var mt = ((g.json.materials || [])[idx]) || {}, pbr = mt.pbrMetallicRoughness || {}, em = mt.emissiveFactor || [0,0,0];
    var c = (em[0]+em[1]+em[2]) > 0.25 ? em : (pbr.baseColorFactor || [0.7,0.7,0.75]);
    return '#' + c.slice(0,3).map(function (v) { return ('0' + Math.max(0, Math.min(255, Math.round(Math.pow(v, 1/2.2) * 255))).toString(16)).slice(-2); }).join('');
  }
  var k = modScale(mod);
  var out = decimate(tris, 700).map(function (t) {
    return [0,1,2].map(function (q) { return mul(toGame(t[q]), k); }).concat([hex(t[3])]);
  });
  return (meshCache[mod.id] = out);
}
/* ship pieces are drawn at the game's 25 m hull (module-index.cjs) */
function modScale(mod) {
  var e = catById[mod.id];
  return mod.liv === 'ship' && e && e.modelSpan ? 25 / e.modelSpan : 1;
}
/* a point in a piece's own frame (game axes, metres, base origin) to port units */
function placeOf(s, mpu) {
  return function (m) { var r = mv(s.R, sub(m, s.jc)); return add(s.at, mul(r, 1 / mpu)); };
}

/* ---- the path ----------------------------------------------------------- */
function berthRoute(lib, b) {
  var B = lib.anchors.berths;
  var head = (b.entry !== undefined && B[b.entry]) ? [B[b.entry].mid] : [];
  var pts = head.concat(b.via || [], [b.mid]);
  /* which legs ride: `ride` is [i-1, i] in via; via[i] sits at pts[i + head] */
  var ride = {};
  if (b.ride && typeof b.ride[0] === 'number') ride[b.ride[0] + head.length] = 'hoist';
  if (b.lift && b.via && b.via.length >= 2) ride[head.length] = 'lift';
  return { pts: pts, ride: ride, node: b.node };
}
/* the core route a growth point sits on, cut at the point's `from` */
function coreLegs(model, lib, q, H) {
  var best = null;
  (lib.anchors.berths || []).forEach(function (b) {
    if (b.node !== q.via || !b.via) return;
    var r = berthRoute(lib, b);
    for (var i = 0; i + 1 < r.pts.length; i++) {
      var a = r.pts[i], d = sub(r.pts[i + 1], a), L2 = dot(d, d) || 1e-12;
      var t = Math.max(0, Math.min(1, dot(sub(q.from, a), d) / L2));
      var p = add(a, mul(d, t)), e = len(sub(p, q.from));
      if (!best || e < best.e) best = { e: e, r: r, i: i, p: p };
    }
  });
  if (!best) return null;
  var legs = [];
  for (var i = 0; i <= best.i; i++) {
    var b = i === best.i ? best.p : best.r.pts[i + 1];
    legs.push({ kind: best.r.ride[i] || 'core', a: best.r.pts[i], b: b });
  }
  return { legs: legs, miss: best.e, berth: best.r.node };
}

/* the whole way in to grown dock S */
function pathTo(pl, S, model, lib, core, mpu) {
  var chain = [S];
  while (chain[0].parent >= 0) chain.unshift(pl.slots[chain[0].parent]);
  var S0 = chain[0], q = core.points[S0.point];
  if (!q || !q.from || !q.via) return null;
  var way = Gr.wayIn(model), H = core.half || 1;
  var legs = [], notes = [];
  /* 1. the hold off the primary L berth, and in through its doors */
  var hold = add(way.mid, mul(way.normal, 0.45 * H));
  legs.push({ kind: 'approach', a: hold, b: way.mid });
  /* 2. the core berth route, as far as the growth point */
  var cl = coreLegs(model, lib, q, H);
  if (!cl) return null;
  if (!near(cl.legs[0].a, way.mid, 1e-3)) notes.push('route does not start at the primary (' + cl.berth + ')');
  legs = legs.concat(cl.legs);
  /* 3. the neck out through the wall */
  var nk = S0.neck || { from: q.from, to: S0.at };
  legs.push({ kind: 'neck', a: cl.legs[cl.legs.length - 1].b, b: nk.to });
  /* 4. across each pass-through piece to where the next one stands */
  for (var i = 0; i + 1 < chain.length; i++) legs.push({ kind: 'through', a: chain[i].at, b: chain[i + 1].at });
  /* 5. the dock's own route, door to stand, placed as Growth placed it */
  var e = catById[S.mod.id];
  var rb = e && e.berths.filter(function (b) { return b.route && b.route.length > 1; })[0];
  if (!rb) return null;
  var k = modScale(S.mod), P = placeOf(S, mpu);
  var pts = rb.route.map(function (p) { return P(mul(toGame(p), k)); });
  var gap = len(sub(pts[0], S.at)) * mpu;
  if (gap > 2) legs.push({ kind: 'inside', a: S.at, b: pts[0] });
  for (var j = 0; j + 1 < pts.length; j++) legs.push({ kind: rb.lift ? 'lift' : 'bay', a: pts[j], b: pts[j + 1] });
  return { legs: legs, chain: chain, stand: pts[pts.length - 1], notes: notes, doorGapM: gap,
           coreBerth: cl.berth, coreMiss: cl.miss * mpu,
           rides: legs.filter(function (l) { return l.kind === 'hoist' || l.kind === 'lift'; }).length,
           metres: legs.reduce(function (s2, l) { return s2 + len(sub(l.b, l.a)); }, 0) * mpu };
}

/* ---- which docks to show ------------------------------------------------ */
var CASES = [
  { name: 'Union', sys: { development: 0.75, corruption: 10, violence: 10 }, dev: 0.55 },
  { name: 'Moonlighters', sys: { development: 0.45, corruption: 55, violence: 35 }, dev: 0.25 }
];
var models = process.argv.slice(2);
if (!models.length) models = ['spine-l', 'cylinder-l', 'cradle-l'];
var panels = [], report = [];
models.forEach(function (model) {
  var lib = PortLib[model], core = GrowthPoints[model], mpu = lib.metresPerUnit;
  var cm = require(R + 'ports/' + model + '.js');
  var coreTris = decimate(cm.f.map(function (f, i) { return [cm.v[f[0]], cm.v[f[1]], cm.v[f[2]], (cm.pal[cm.ci[i]] || '#889').replace('!', '')]; }), 22000);
  var K = function (p) { return p.map(function (v) { return Math.round(v * 1000); }); };
  var coreQ = coreTris.map(function (t) { return [K(t[0]), K(t[1]), K(t[2]), t[3]]; });
  CASES.forEach(function (cs, ci) {
    for (var seed = 0; seed < 8; seed++) {
      var ctx = { G: {}, sys: cs.sys, port: { id: 'p' + seed, livery: 'civ', market: { dev: cs.dev, role: 'orbital' } },
                  starId: 'path' + ci + seed, model: model, key: 'path:' + model + ':' + ci + ':' + seed };
      var pl = Gr.plan(ctx);
      var done = pl.buildout.t1 + 0.1 * Gr.YEAR;
      var standing = Gr.stateAt(ctx, done).slots.map(function (x) { return x.slot; });
      var paths = standing.filter(function (s) { return s.mod.nb && s.reach; })
        .map(function (s) { var p = pathTo(pl, s, model, lib, core, mpu); if (p) p.slot = s; return p; })
        .filter(Boolean);
      paths.forEach(function (p) { report.push({ model: model, who: cs.name, seed: seed, depth: p.chain.length, rides: p.rides,
        gap: p.doorGapM, miss: p.coreMiss, m: p.metres, notes: p.notes }); });
      if (!paths.length) continue;
      /* show the most telling one: a ride if there is one, then the longest chain */
      paths.sort(function (a, b) { return (b.rides > 0) - (a.rides > 0) || b.chain.length - a.chain.length || b.metres - a.metres; });
      var best = paths[0], inChain = {};
      best.chain.forEach(function (s) { inChain[s.id] = true; });
      var tris = [];
      standing.forEach(function (s) {
        var P = placeOf(s, mpu), hot = !!inChain[s.id];
        modMesh(s.mod).forEach(function (t) { tris.push([K(P(t[0])), K(P(t[1])), K(P(t[2])), t[3], hot ? 1 : 0]); });
      });
      panels.push({ title: model + ' — ' + cs.name + ' build, seed ' + seed + ': a ' + (best.slot.mod.cls || 'SM') + ' dock ' +
          best.chain.length + ' piece' + (best.chain.length > 1 ? 's' : '') + ' out, ' + Math.round(best.metres) + ' m in from the primary L bay' +
          (best.rides ? ', ' + best.rides + ' ride' + (best.rides > 1 ? 's' : '') + ' on a hoist or lift' : ''),
        core: coreQ, add: tris, stand: K(best.stand),
        legs: best.legs.map(function (l) { return [l.kind, K(l.a), K(l.b)]; }) });
      break;
    }
  });
});

/* ---- the page ----------------------------------------------------------- */
var COL = { approach: '#ffffff', core: '#3ff0ff', hoist: '#ff4fd8', lift: '#ff4fd8', neck: '#7dff4a',
            through: '#ffd23f', inside: '#ffd23f', bay: '#ff9a3f' };
var html = '<!doctype html><meta charset=utf-8><title>Way in to a grown dock</title>' +
'<style>body{background:#0b0e14;color:#cfd6e4;font:13px system-ui;margin:12px}canvas{background:#0e131c;border:1px solid #232b3a;display:block;margin:4px 0 14px;max-width:100%}' +
'.k span{display:inline-block;width:22px;height:4px;margin:0 5px 2px 12px;vertical-align:middle}</style>' +
'<h2 style="font-size:16px;margin:0 0 6px">The way in to a grown dock, from open space</h2>' +
'<div class=k>' + [['approach', 'hold off the primary L bay, in through its doors'], ['core', "the station's own berth route"],
  ['hoist', 'riding a hoist car or lift'], ['neck', 'corridor out through the wall'], ['through', 'across a pass-through piece'],
  ['bay', "the add-on dock's own route to its stand"]].map(function (k) {
    return '<span style="background:' + COL[k[0]] + '"></span>' + k[1]; }).join('') +
'</div><p style="color:#8aa0c0;margin:6px 0">Core faint, pieces on this way in bright, other add-ons dim; white ring = the stand. Drag to turn, wheel to zoom.</p>' +
'<div id=w></div><script>var P=' + JSON.stringify(panels) + ',COL=' + JSON.stringify(COL) + ';' +
'P.forEach(function(p){var t=document.createElement("div");t.textContent=p.title;var c=document.createElement("canvas");c.width=900;c.height=620;' +
'document.getElementById("w").appendChild(t);document.getElementById("w").appendChild(c);var yaw=0.7,pit=0.95,zoom=1;' +
'function R(q){var cy=Math.cos(yaw),sy=Math.sin(yaw);var x=q[0]*cy-q[1]*sy,y=q[0]*sy+q[1]*cy,z=q[2];var cp=Math.cos(pit),sp=Math.sin(pit);return[x,y*cp-z*sp,y*sp+z*cp]}' +
'function shade(h,k){var r=parseInt(h.substr(1,2),16),g=parseInt(h.substr(3,2),16),b=parseInt(h.substr(5,2),16);return"rgb("+(r*k|0)+","+(g*k|0)+","+(b*k|0)+")"}' +
'function draw(){var x=c.getContext("2d");x.clearRect(0,0,c.width,c.height);var s=c.width/2600*zoom,ox=c.width/2,oy=c.height/2;function S(q){var r=R(q);return[ox+r[0]*s,oy+r[1]*s]}' +
'var all=p.core.map(function(t){return[t[0],t[1],t[2],t[3],0]}).concat(p.add.map(function(t){return[t[0],t[1],t[2],t[3],t[4]?2:1]}));' +
'all.map(function(t){var a=R(t[0]),b=R(t[1]),e=R(t[2]);return{a:a,b:b,e:e,z:(a[2]+b[2]+e[2])/3,c:t[3],w:t[4]}}).sort(function(u,v){return v.z-u.z}).forEach(function(o){' +
'var u=[o.b[0]-o.a[0],o.b[1]-o.a[1],o.b[2]-o.a[2]],v=[o.e[0]-o.a[0],o.e[1]-o.a[1],o.e[2]-o.a[2]];var n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];var l=Math.hypot(n[0],n[1],n[2])||1;var k=0.4+0.6*Math.abs((n[0]*0.3+n[1]*0.5-n[2]*0.8)/l);' +
'x.globalAlpha=o.w===0?0.22:o.w===1?0.35:0.95;x.fillStyle=o.w===0?shade("#7d8590",k):shade(o.c,k);x.beginPath();x.moveTo(ox+o.a[0]*s,oy+o.a[1]*s);x.lineTo(ox+o.b[0]*s,oy+o.b[1]*s);x.lineTo(ox+o.e[0]*s,oy+o.e[1]*s);x.closePath();x.fill()});x.globalAlpha=1;' +
'p.legs.forEach(function(L){var a=S(L[1]),b=S(L[2]);x.strokeStyle=COL[L[0]]||"#fff";x.lineWidth=4;x.lineCap="round";x.beginPath();x.moveTo(a[0],a[1]);x.lineTo(b[0],b[1]);x.stroke();' +
'var dx=b[0]-a[0],dy=b[1]-a[1],d=Math.hypot(dx,dy);if(d>14){var mx=(a[0]+b[0])/2,my=(a[1]+b[1])/2,ux=dx/d,uy=dy/d;x.fillStyle=x.strokeStyle;x.beginPath();x.moveTo(mx+ux*9,my+uy*9);x.lineTo(mx-ux*6-uy*7,my-uy*6+ux*7);x.lineTo(mx-ux*6+uy*7,my-uy*6-ux*7);x.closePath();x.fill()}});' +
'var st=S(p.stand);x.strokeStyle="#fff";x.lineWidth=2;x.beginPath();x.arc(st[0],st[1],8,0,7);x.stroke()}' +
'var dr=null;c.onmousedown=function(e){dr=[e.clientX,e.clientY]};window.addEventListener("mouseup",function(){dr=null});c.onmousemove=function(e){if(!dr)return;yaw+=(e.clientX-dr[0])*0.01;pit+=(e.clientY-dr[1])*0.01;dr=[e.clientX,e.clientY];draw()};' +
'c.onwheel=function(e){e.preventDefault();zoom*=e.deltaY<0?1.15:1/1.15;draw()};draw()});</script>';
fs.writeFileSync(path.join(__dirname, 'path-show.html'), html);

/* ---- the numbers -------------------------------------------------------- */
var n = report.length, gaps = report.map(function (r) { return r.gap; }).sort(function (a, b) { return a - b; });
console.log(panels.length + ' panels; ' + n + ' docks traced');
console.log('  with a hoist or lift ride: ' + report.filter(function (r) { return r.rides; }).length +
            '; chained through other pieces: ' + report.filter(function (r) { return r.depth > 1; }).length);
console.log('  growth point off its route (m): max ' + Math.max.apply(null, report.map(function (r) { return r.miss; })).toFixed(2));
console.log('  dock door to where it stands (m): median ' + (gaps[n >> 1] || 0).toFixed(1) + ', max ' + (gaps[n - 1] || 0).toFixed(1));
console.log('  routes not starting at the primary: ' + report.filter(function (r) { return r.notes.length; }).length);
panels.forEach(function (p) { console.log('  ' + p.title); });
