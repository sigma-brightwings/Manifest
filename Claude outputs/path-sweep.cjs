// Sweep (2026-10-24): every port model x rich/middling/poor x 4 seeds.
// Every grown docking bay reached from the primary L berth through doorways,
// nothing in the primary's approach lane, nothing over its mouth - checked
// from the raw port data (as test/growth.test.js "the way in"), not growth.js.
global.window = global;
var path = require('path'), ROOT = path.join(__dirname, '..'), R = path.join(ROOT, 'src') + '/';
['ports', 'growth-points', 'modules'].forEach(function (m) { require(R + m + '.js'); });
var Gr = require(R + 'growth.js');
var RICH = { development: 0.75, corruption: 10, violence: 10 };
var MID = { development: 0.45, corruption: 55, violence: 35 };
var POOR = { development: 0.3, corruption: 85, violence: 60, pirateHeld: true };
function key(B, b) {
  return b.doorVia ? 'E' + b.door : b.entry !== undefined ? String(b.entry)
    : b.exitVia ? String(B.findIndex(function (x) { return x.node === b.exitVia; })) : null;
}
function primaryOf(m) {
  var L = PortLib[m], B = L.anchors.berths || [], cnt = {};
  B.forEach(function (b) { var e = key(B, b); if (e !== null && e !== '-1') cnt[e] = (cnt[e] || 0) + 1; });
  var best = Object.keys(cnt).sort(function (a, b) { return cnt[b] - cnt[a]; })[0];
  if (best === undefined) return null;
  var enters = {}; B.forEach(function (b) { if (key(B, b) === best) enters[b.node] = true; });
  return { mouth: best[0] === 'E' ? L.entrances[+best.slice(1)] : B[+best], enters: enters };
}
var fits = function (need, have) { return !!have && (need !== 'L' || have === 'L'); };
var T = { plans: 0, bays: 0, reached: 0, lane: 0, pieces: 0, cover: 0, noBays: 0, Lbays: 0 }, why = {}, perFam = {};
var k = 5000;
Object.keys(GrowthPoints).forEach(function (m) {
  [[RICH, 0.55], [MID, 0.25], [POOR, 0.08]].forEach(function (cs) {
    for (var seed = 0; seed < 4; seed++) {
      var c = { G: {}, sys: cs[0], port: { id: 'p' + k, livery: /-syn-/.test(m) ? 'syn' : /-navy-/.test(m) ? 'navy' : 'civ', market: { dev: cs[1], role: 'orbital' } },
                starId: 's' + k, model: m, key: 'sweep:' + (k++) };
      var p = Gr.plan(c), P = primaryOf(m), G = GrowthPoints[m], H = G.half || 1;
      T.plans++;
      var fam = m.replace(/-(navy|syn)(?=-|$)/, '').replace(/-[sml]$/, '');
      var pf = perFam[fam] = perFam[fam] || { plans: 0, bays: 0 };
      pf.plans++;
      var nb = 0;
      p.slots.forEach(function (s) {
        T.pieces++;
        if (!s.mod.nb) return;
        nb++; T.bays++; pf.bays++;
        if (s.mod.cls === 'L') T.Lbays++;
        var need = s.mod.cls || 'SM', cur = s, ok = true, r = '';
        for (var hop = 0; hop < 12; hop++) {
          var md = cur.mod;
          if (md.nb && md.ob) { ok = false; r = 'bay open to space'; break; }
          if (!fits(need, md['in'])) { ok = false; r = md['in'] ? 'doorway too small' : 'no doorway'; break; }
          if (cur.parent < 0) {
            var q = G.points[cur.point];
            if (!P || !q || q.hull || q.door) { ok = false; r = 'core hull/door'; break; }
            if (!P.enters[q.via]) { ok = false; r = 'other entrance'; break; }
            if (!fits(need, q.cls)) { ok = false; r = 'route too small'; break; }
            break;
          }
          if (cur.via !== 'r' && cur.via !== 'x') { ok = false; r = 'piece hull/door'; break; }
          cur = p.slots[cur.parent];
        }
        if (ok) T.reached++; else why[r] = (why[r] || 0) + 1;
      });
      if (!nb) T.noBays++;
      if (!P) return;
      var mo = P.mouth, n = mo.normal, a = Math.abs(n[0]) > 0.5 ? 0 : Math.abs(n[1]) > 0.5 ? 1 : 2;
      var w = 45 / (PortLib[m].metresPerUnit || 100);
      p.slots.forEach(function (s) {
        if (s.parent < 0 && G.points[s.point] && G.points[s.point].door && G.points[s.point].via === mo.node) T.cover++;
        var b = s.box, hit = true;
        for (var i = 0; i < 3; i++) {
          var lo, hi;
          if (i === a) { lo = n[a] > 0 ? mo.mid[a] : mo.mid[a] - 1.5 * H; hi = n[a] > 0 ? mo.mid[a] + 1.5 * H : mo.mid[a]; }
          else { var hw = Math.max(w, mo.max && mo.min ? (mo.max[i] - mo.min[i]) / 2 : 0); lo = mo.mid[i] - hw; hi = mo.mid[i] + hw; }
          if (b.max[i] <= lo || b.min[i] >= hi) hit = false;
        }
        if (hit) T.lane++;
      });
    }
  });
});
console.log(JSON.stringify(T));
console.log('unreached by reason', JSON.stringify(why));
console.log('bays per plan by family', Object.keys(perFam).map(function (f) { return f + ' ' + (perFam[f].bays / perFam[f].plans).toFixed(1); }).join(', '));
