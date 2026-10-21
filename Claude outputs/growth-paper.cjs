// "On paper": a core growing under three builders, at three moments, with real module meshes.
global.window = global;
var fs = require('fs'), path = require('path');
var ROOT = path.join(__dirname, '..');           // runs from whichever copy it sits in
var R = path.join(ROOT, 'src') + '/';
['ports', 'growth-points', 'modules'].forEach(function (m) { require(R + m + '.js'); });
var Gr = require(R + 'growth.js');
var Chop = require(path.join(ROOT, 'tools', 'chop-modules.cjs'));
var MODDIR = path.join(__dirname, 'modules', 'glb') + '/';
/* A neck is a square corridor from the berth route out through the wall;
 * as wide as the biggest ship its route takes needs. */
var NECK_W = { SM: 30, L: 60 };   // metres
function neckTris(nk, mpu, col) {
  var a = nk.from, b = nk.to, d = [b[0]-a[0], b[1]-a[1], b[2]-a[2]];
  var l = Math.hypot(d[0], d[1], d[2]);
  if (l < 1e-6) return [];
  d = d.map(function (v) { return v / l; });
  var up = Math.abs(d[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  var u = [d[1]*up[2]-d[2]*up[1], d[2]*up[0]-d[0]*up[2], d[0]*up[1]-d[1]*up[0]], ul = Math.hypot(u[0], u[1], u[2]);
  u = u.map(function (v) { return v / ul; });
  var v = [d[1]*u[2]-d[2]*u[1], d[2]*u[0]-d[0]*u[2], d[0]*u[1]-d[1]*u[0]];
  var w = (NECK_W[nk.cls] || NECK_W.SM) / 2 / mpu;
  var c = [[1,1],[-1,1],[-1,-1],[1,-1]];
  function P(o, k) { return [0,1,2].map(function (i) { return Math.round((o[i] + (u[i] * c[k][0] + v[i] * c[k][1]) * w) * 1000); }); }
  var out = [];
  for (var k = 0; k < 4; k++) {
    var k2 = (k + 1) % 4;
    out.push([P(a, k), P(b, k), P(b, k2), col]);
    out.push([P(a, k), P(b, k2), P(a, k2), col]);
  }
  return out;
}
var model = process.argv[2] || 'spine-l';
var lib = PortLib[model], mpu = lib.metresPerUnit;
var core = require(R + 'ports/' + model + '.js');

function decimate(tris, n) {
  var l = tris.map(function (t) {
    var a = t[0], b = t[1], c = t[2];
    var u = [b[0]-a[0], b[1]-a[1], b[2]-a[2]], v = [c[0]-a[0], c[1]-a[1], c[2]-a[2]];
    var x = u[1]*v[2]-u[2]*v[1], y = u[2]*v[0]-u[0]*v[2], z = u[0]*v[1]-u[1]*v[0];
    return { t: t, a: x*x + y*y + z*z };
  });
  l.sort(function (p, q) { return q.a - p.a; });
  return l.slice(0, n).map(function (o) { return o.t; });
}
var coreTris = decimate(core.f.map(function (f, i) { return [core.v[f[0]], core.v[f[1]], core.v[f[2]], (core.pal[core.ci[i]] || '#889').replace('!', '')]; }), 30000);

var meshCache = {};
function modMesh(mod) {
  if (meshCache[mod.id]) return meshCache[mod.id];
  var m = Chop.readModel(MODDIR + mod.id + '.glb');
  var tris = [];
  m.units.forEach(function (u) { u.tris.forEach(function (t) { tris.push(t); }); });
  var g = m.g;
  function hex(idx) {
    var mt = ((g.json.materials || [])[idx]) || {}, pbr = mt.pbrMetallicRoughness || {}, em = mt.emissiveFactor || [0,0,0];
    var c = (em[0]+em[1]+em[2]) > 0.25 ? em : (pbr.baseColorFactor || [0.7,0.7,0.75]);
    return '#' + c.slice(0,3).map(function (v) { return ('0' + Math.max(0, Math.min(255, Math.round(Math.pow(v, 1/2.2) * 255))).toString(16)).slice(-2); }).join('');
  }
  // glb (y up, metres or ship units) -> game axes; ship modules scaled to metres
  var big = Math.max.apply(null, mod.s), raw = 0;
  tris.forEach(function (t) { for (var k = 0; k < 3; k++) raw = Math.max(raw, Math.abs(t[k][0]), Math.abs(t[k][1]), Math.abs(t[k][2])); });
  var out = decimate(tris, 500).map(function (t) {
    return [0,1,2].map(function (k) { var p = t[k]; return [p[0], -p[2], p[1]]; }).concat([hex(t[3])]);
  });
  // scale: module's game size s is metres; glb extents give its own units
  var ext = [0,0,0];
  out.forEach(function (t) { for (var k = 0; k < 3; k++) for (var a = 0; a < 3; a++) ext[a] = Math.max(ext[a], Math.abs(t[k][a])); });
  var sc = mod.liv === 'ship' ? (Math.max.apply(null, mod.s) / Math.max(1e-6, Math.max(ext[0] * 2, ext[1] * 2, ext[2]))) : 1;
  out = out.map(function (t) { return [t[0].map(function (v) { return v * sc; }), t[1].map(function (v) { return v * sc; }), t[2].map(function (v) { return v * sc; }), t[3]]; });
  return (meshCache[mod.id] = out);
}
function mv(R, v) { return [R[0]*v[0]+R[1]*v[1]+R[2]*v[2], R[3]*v[0]+R[4]*v[1]+R[5]*v[2], R[6]*v[0]+R[7]*v[1]+R[8]*v[2]]; }

var cases = [
  { name: 'Union (rich, lawful)', sys: { development: 0.75, corruption: 10, violence: 10 }, dev: 0.55, livery: 'civ' },
  { name: 'Moonlighters (middling)', sys: { development: 0.45, corruption: 55, violence: 35 }, dev: 0.25, livery: 'civ' },
  { name: 'Wreckhold (poor Syndicate hold)', sys: { development: 0.3, corruption: 85, violence: 60, pirateHeld: true }, dev: 0.08, livery: 'syn' }
];
var times = [0, 5, 15];
var panels = [];
cases.forEach(function (cs, ci) {
  var m = model;
  if (cs.livery !== 'civ' && PortLib[model.replace(/-([sml])$/, '-' + cs.livery + '-$1')]) m = model.replace(/-([sml])$/, '-' + cs.livery + '-$1');
  var ctx = { G: {}, sys: cs.sys, port: { id: 'p' + ci, livery: cs.livery, market: { dev: cs.dev, role: 'orbital' } }, starId: 'paper' + ci, model: m, key: 'paper:' + ci };
  var pl = Gr.plan(ctx);
  times.forEach(function (ty) {
    var st = Gr.stateAt(ctx, ty * Gr.YEAR);
    var tris = [];
    st.slots.forEach(function (x) {
      var s = x.slot, mesh = modMesh(s.mod);
      var scaffold = x.phase === 'building';
      if (s.neck) neckTris(s.neck, mpu, scaffold ? '#e0b030' : '#7dff4a').forEach(function (t) { tris.push(t.concat(['n'])); });
      mesh.forEach(function (t, ti) {
        if (scaffold && (ti % 3)) return;                     // a building piece: a third of it, as frame
        var w = [0,1,2].map(function (k) {
          var r = mv(s.R, [t[k][0] - s.jc[0], t[k][1] - s.jc[1], t[k][2] - s.jc[2]]);
          return [ (s.at[0] + r[0] / mpu) * 1000, (s.at[1] + r[1] / mpu) * 1000, (s.at[2] + r[2] / mpu) * 1000 ].map(Math.round);
        });
        tris.push(w.concat([scaffold ? '#e0b030' : t[3], s.builder[0]]));
      });
    });
    panels.push({ title: cs.name + ' — year ' + ty + ' — order ' + st.order.toFixed(2) + ', ' + st.slots.length + ' pieces' +
      (st.crawlers.length ? ', ' + st.crawlers.length + ' Crawler on site' : ''),
      add: tris, cr: st.crawlers.map(function (c) { return c.at.map(function (v) { return Math.round(v * 1000); }); }) });
  });
});
var coreQ = coreTris.map(function (t) { return [t[0], t[1], t[2]].map(function (p) { return p.map(function (v) { return Math.round(v * 1000); }); }).concat([t[3]]); });
var html = '<!doctype html><meta charset=utf-8><title>Ports growing</title><style>body{background:#0b0e14;color:#cfd6e4;font:13px system-ui;margin:12px}.g{display:grid;grid-template-columns:1fr;gap:8px}.p canvas{width:100%;background:#0e131c;border:1px solid #232b3a}</style>' +
'<h2 style="font-size:16px">' + model + ' growing — core in grey, add-ons in their own paint, amber = under construction, green = necks (corridor cut from the berth route out to the piece), magenta diamond = Crawler. Drag any panel to turn all.</h2><div class=g id=g></div><script>var C=' + JSON.stringify(coreQ) + ',P=' + JSON.stringify(panels) + ';var yaw=0.7,pit=1.0;var cv=[];' +
'P.forEach(function(p){var d=document.createElement("div");d.className="p";d.innerHTML="<div>"+p.title+"</div>";var c=document.createElement("canvas");c.width=760;c.height=520;d.appendChild(c);document.getElementById("g").appendChild(d);cv.push([c,p])});' +
'function R(q){var cy=Math.cos(yaw),sy=Math.sin(yaw);var x=q[0]*cy-q[1]*sy,y=q[0]*sy+q[1]*cy,z=q[2];var cp=Math.cos(pit),sp=Math.sin(pit);return[x,y*cp-z*sp,y*sp+z*cp]}' +
'function shade(h,k){var r=parseInt(h.substr(1,2),16),g=parseInt(h.substr(3,2),16),b=parseInt(h.substr(5,2),16);return"rgb("+(r*k|0)+","+(g*k|0)+","+(b*k|0)+")"}' +
'function draw(){cv.forEach(function(e){var c=e[0],p=e[1],x=c.getContext("2d");x.clearRect(0,0,c.width,c.height);var s=c.width/2500,ox=c.width/2,oy=c.height/2;' +
'var all=C.map(function(t){return[t[0],t[1],t[2],t[3],1]}).concat(p.add.map(function(t){return[t[0],t[1],t[2],t[3],0]}));' +
'var fs=all.map(function(t){var a=R(t[0]),b=R(t[1]),e=R(t[2]);return{a:a,b:b,e:e,z:(a[2]+b[2]+e[2])/3,c:t[3],core:t[4]}}).sort(function(u,v){return v.z-u.z});' +
'fs.forEach(function(o){var u=[o.b[0]-o.a[0],o.b[1]-o.a[1],o.b[2]-o.a[2]],v=[o.e[0]-o.a[0],o.e[1]-o.a[1],o.e[2]-o.a[2]];var n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];var l=Math.hypot(n[0],n[1],n[2])||1;var k=0.4+0.6*Math.abs((n[0]*0.3+n[1]*0.5-n[2]*0.8)/l);x.globalAlpha=o.core?0.35:1;x.fillStyle=o.core?shade("#7d8590",k*0.8):shade(o.c,k*1.15);x.beginPath();x.moveTo(ox+o.a[0]*s,oy+o.a[1]*s);x.lineTo(ox+o.b[0]*s,oy+o.b[1]*s);x.lineTo(ox+o.e[0]*s,oy+o.e[1]*s);x.closePath();x.fill();x.strokeStyle=x.fillStyle;x.lineWidth=0.4;x.stroke()});' +
'p.cr.forEach(function(q){var r=R(q);var X=ox+r[0]*s,Y=oy+r[1]*s;x.fillStyle="#ff3fd2";x.beginPath();x.moveTo(X,Y-9);x.lineTo(X+7,Y);x.lineTo(X,Y+9);x.lineTo(X-7,Y);x.fill()})})}' +
'var dr=null;window.onmousedown=function(e){dr=[e.clientX,e.clientY]};window.onmouseup=function(){dr=null};window.onmousemove=function(e){if(!dr)return;yaw+=(e.clientX-dr[0])*0.01;pit+=(e.clientY-dr[1])*0.01;dr=[e.clientX,e.clientY];draw()};draw();</script>';
fs.writeFileSync(path.join(__dirname, 'growth-paper-' + model + '.html'), html);
console.log('ok', panels.map(function (p) { return p.title; }).join('\n'));
