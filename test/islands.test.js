/* islands.test.js - islands felt everywhere (comsats.js slice 3, 2026-11-20).
 *
 *     node test/islands.test.js
 *
 * Pinned:
 *   - a linked port's figures are live; an island's are seen as the last
 *     courier out of it carried them, never older than the day it went
 *     dark; an island's own desk sees the others as the last courier in
 *     brought them;
 *   - your own visit is a courier too (G.portSeen);
 *   - fuelled, the island is live again;
 *   - the trade analyser and the survey array read an island at that age;
 *   - an island's mail: sacks out of it, mail held for it everywhere else,
 *     pay that grows with the dark, freight no market lists.
 */
global.window = global.window || global;
require('../src/vec3.js');
require('../src/rng.js');
require('../src/kepler.js');
var Eco = require('../src/economy.js');
var Gen = require('../src/generate.js');
var Galaxy = require('../src/galaxy.js');
require('../src/rings.js');
var Sim = require('../src/sim.js');
require('../src/rumours.js');
var Cs = require('../src/comsats.js');
var TA = require('../src/tradeanalyser.js');
var Ms = require('../src/missions.js');
var DAY = 86400;

var pass = 0, fail = 0;
function check(n, c, d) {
  if (c) { pass++; console.log('  ok   ' + n + (d ? '   ' + d : '')); }
  else { fail++; console.log('  FAIL  ' + n + (d ? '   ' + d : '')); }
}

var gal = Galaxy.build('kawartha');
function sysOf(st) { var s = Gen.generateSystem(st.seed, Galaxy.systemOpts(gal, st)); s.starId = st.id; return s; }

console.log('--- the timetable arithmetic ---');
var sch = { t0: 100, period: 1000, cruise: 200, layover: 50, from: 'A', to: 'B' };
/* Cycle 0: leave A at 100, at B 300-350, back at A at 550. */
check('the last ship out of B to have reached A', Cs.lastOut(sch, 'B', 560) === 350 && Cs.lastOut(sch, 'B', 540) === 350 - 1000);
check('the last ship out of A to have reached B', Cs.lastOut(sch, 'A', 310) === 100 && Cs.lastOut(sch, 'A', 290) === -900);
check('the last ship into B left A at', Cs.lastIn(sch, 'B', 300) === 100 && Cs.lastIn(sch, 'B', 299) === -900);

console.log('--- an island ---');
/* A world dark for a while, with a port on it that a lane joins to a lit
 * port elsewhere in the system. */
var hit = null;
for (var k = 0; k < gal.stars.length && !hit; k++) {
  var st = gal.stars[k];
  if (!st.factionId) continue;
  var sys = sysOf(st), seenW = {};
  var rl = Cs.relaysFor(sys, st.id);
  for (var i = 0; i < rl.length && !hit; i++) {
    if (seenW[rl[i].body]) continue;
    seenW[rl[i].body] = 1;
    for (var d = 60; d < 1825 && !hit; d += 3) {
      var L = Cs.darkSpan({}, st.id, rl[i].body, d * DAY);
      if (!L || L.to - L.from < 15 * DAY) continue;
      var w = sys.byId[rl[i].body];
      var isl = sys.ports.filter(function (p) { return p.market && p.parentBody === w && Cs.lanesAt(sys, p.id).length; })[0];
      var lit = sys.ports.filter(function (p) { return p.market && p.parentBody !== w; })[0];
      if (isl && lit) hit = { st: st, sys: sys, L: L, isl: isl, lit: lit };
    }
  }
}
check('found one', !!hit, hit && hit.isl.name + ' (' + hit.st.name + '), ' + Math.round((hit.L.to - hit.L.from) / DAY) + ' days dark');
var S = hit.sys, sid = hit.st.id, Lx = hit.L, I = hit.isl, Lp = hit.lit;
var tm = Lx.from + 10 * DAY;
var G0 = {};
check('it is an island then', Cs.isIsland(G0, S, sid, I, tm));
check('a lit port is read live', Cs.seenAt(G0, S, sid, Lp, tm, null) === tm);
var seenI = Cs.seenAt(G0, S, sid, I, tm, null);
check('the island is read as its last courier left it', seenI < tm && seenI >= Lx.from,
      Cs.fmtCourier((tm - seenI) / 3600));
check('which is a real departure, or the day it went dark',
      seenI === Lx.from || Cs.lanesAt(S, I.id).some(function (ln) { return Cs.lastOut(ln.sched, I.id, tm) === seenI; }));
check('docked at the island, it is live to you', Cs.seenAt(G0, S, sid, I, tm, I) === tm);
var fromI = Cs.seenAt(G0, S, sid, Lp, tm, I);
check('and from its desk the others are courier-old', fromI <= tm && fromI >= Lx.from,
      Cs.fmtCourier((tm - fromI) / 3600));
var Gv = { portSeen: {} };
Gv.portSeen[I.id] = tm - 600;
check('your own visit carries it out', Cs.seenAt(Gv, S, sid, I, tm, null) === Math.max(seenI, tm - 600));
var early = Cs.seenAt(G0, S, sid, I, Lx.from + 60, null);
check('never older than the day it went dark', early >= Lx.from, ((Lx.from + 60 - early) / 3600).toFixed(2) + ' h');
var Gfx = {};
Cs.fixLapse(Gfx, Lx, tm);
check('fuelled, it is live again', Cs.seenAt(Gfx, S, sid, I, tm + 60, null) === tm + 60);

console.log('--- the instruments ---');
var ctx = { via: 'fitting', port: I, t: tm, seen: seenI, adjust: null };
var data = TA.build(ctx);
var row = data.rows.filter(function (r) { return r.buy !== null || r.sell !== null; })[0];
var then = Eco.priceAt(I, row.id, seenI);
check('the analyser reads an island at that age', data.ageH > 0 && Math.abs(data.ageH - (tm - seenI) / 3600) < 1e-6 &&
      row.buy === then.buy && row.sell === then.sell, data.ageH.toFixed(1) + ' h');
var live = TA.build({ via: 'fitting', port: Lp, t: tm, seen: tm, adjust: null });
check('and a lit port live', live.ageH === 0);
var a0 = Eco.systemAnalysis(S, tm, {}), a1 = Eco.systemAnalysis(S, tm, { seenAt: function () { return tm; } });
check('the survey array is unchanged when nothing is an island', JSON.stringify(a0.shortages.map(function (x) { return x.cid + x.port.id + x.bid; })) ===
      JSON.stringify(a1.shortages.map(function (x) { return x.cid + x.port.id + x.bid; })));
var a2 = Eco.systemAnalysis(S, tm, { seenAt: function (p) { return Cs.seenAt(G0, S, sid, p, tm, null); } });
check('and reads the island as the courier left it', !!a2 && Array.isArray(a2.runs));

console.log('--- word of you, over the wire (Astra, 2026-11-20) ---');
var Rm = global.Rumours;
Rm._clearCache();
var heard = Rm.propagate(S, 'P:' + Lp.id, tm);
var lit2 = S.ports.filter(function (p) { return p !== Lp && p.market && Rm.wireLinked(S, p, tm + Rm.WIRE_S); });
check('a port on the network hears it in minutes', lit2.length > 0 && lit2.every(function (p) {
  return heard['P:' + p.id] && heard['P:' + p.id].t - tm <= Rm.WIRE_S + 1;
}), lit2.length + ' ports, ' + Rm.WIRE_S / 60 + ' min');
var hi = heard['P:' + I.id];
check('the island only when a ship brings it', !hi || hi.t - tm > Rm.WIRE_S + 1,
      hi ? ((hi.t - tm) / 3600).toFixed(1) + ' h' : 'not before the rumour fades');

console.log('--- an island\'s mail ---');
var bI = Ms.boardAt(I, S, gal, hit.st, tm, {}).filter(function (o) { return o.mail; });
var out = bI[0];
var bL = Ms.boardAt(Lp, S, gal, hit.st, tm, {}).filter(function (o) { return o.mail; });
var inn = bL.filter(function (o) { return o.toPortId === I.id; })[0];
/* 85% and 80% a window: look a few windows on if this one is quiet. */
for (var wk = 1; wk < 6 && (!out || !inn); wk++) {
  var tw = tm + wk * 2 * DAY;
  if (!out) out = Ms.boardAt(I, S, gal, hit.st, tw, {}).filter(function (o) { return o.mail; })[0];
  if (!inn) inn = Ms.boardAt(Lp, S, gal, hit.st, tw, {}).filter(function (o) { return o.mail && o.toPortId === I.id; })[0];
}
check('the island posts its sacks', !!out && out.cid === 'mail' && out.type === 'haul' && out.toPortId !== I.id, out && out.text + ' (' + out.pay + ' cr)');
check('and its mail waits at other desks', !!inn && inn.cid === 'mail', inn && inn.text + ' (' + inn.pay + ' cr)');
var quiet = Ms.boardAt(I, S, gal, hit.st, Lx.from - 5 * DAY, {}).filter(function (o) { return o.mail; });
check('no mail work while the relays are lit', quiet.length === 0);
check('the longer dark, the better it pays', Ms.mailPay(30, 2) > Ms.mailPay(3, 2) && Ms.mailPay(9999, 3) <= Ms.MAIL_CAP * 1.4);
check('mail is freight no market lists', Eco.BY_ID.mail && Eco.BY_ID.mail.base === 0 &&
      S.ports.every(function (p) { return !p.market || !p.market.rows.mail; }));
var Gm = { t: tm, missions: [], ship: Sim.makeShip({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }) };
Gm.ship.cargo = {}; Gm.ship.cargoCap = 20; Gm.ship.credits = 0;
var acc = Ms.accept(Gm, out, {});
check('signed, the sacks come aboard', acc.ok && Gm.ship.cargo.mail === out.tonnes, acc.why || '');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
