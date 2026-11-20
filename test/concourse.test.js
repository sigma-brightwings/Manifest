/* concourse.test.js - the station speaks (concourse.js, 2026-11-18).
 *
 *     node test/concourse.test.js
 *
 * What is pinned is that everything the station says is true:
 *   - the board's departures agree with Sim.berthOccupants about who is in
 *     a berth and when they leave, and a scheduled departure is when the
 *     route's own timetable puts her at this port;
 *   - an arrival on the board is when trafficState says she gets here;
 *   - the PA says your bounty only when there is one on you here, the
 *     market's shortages only for goods the desk is short of, and never the
 *     same thing twice a visit;
 *   - overheard lines come only from people who would say them.
 */
var path = require('path');
var SRC = path.join(__dirname, '..', 'src');
['rng', 'economy', 'generate', 'galaxy', 'sim', 'crew', 'combat', 'rumours'].forEach(function (m) {
  require(path.join(SRC, m + '.js'));
});
var C = require(path.join(SRC, 'concourse.js'));
var Galaxy = global.Galaxy, Gen = global.Gen, Sim = global.Sim;

var pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  ok   ' + name + (detail ? '   ' + detail : '')); }
  else { fail++; console.log('  FAIL ' + name + (detail ? '   ' + detail : '')); }
}

var g = Galaxy.build('kawartha');
var star = g.stars.filter(function (s) { return s.name === 'Mirven'; })[0] || g.stars[0];
var sys = Gen.generateSystem(star.seed, { faction: g.factionById[star.factionId], allFactions: g.factions });
var port = sys.bodies.filter(function (b) { return /Threshold/.test(b.name || ''); })[0] ||
           (sys.ports || []).filter(function (p) { return p.market; })[0];
check('a busy port to read', !!port && sys.traffic.some(function (r) { return r.from === port.id || r.to === port.id; }),
      port && port.name);

console.log('\n--- the board is the timetable ---');
var bad = 0, seenAt = 0, seenDue = 0, arrOk = 0, arrBad = 0;
for (var k = 0; k < 12; k++) {
  var t = 86400 * 2 + k * 7919;
  var sch = C.schedule(port, sys, t);
  var occ = Sim.berthOccupants(port, sys, t), occBy = {};
  occ.forEach(function (o) { occBy[o.route.id] = o.leavesAt; });
  sch.departures.forEach(function (d) {
    if (d.at < t) bad++;
    if (occBy[d.id] !== undefined) { seenAt++; if (Math.abs(occBy[d.id] - d.at) > 1e-6 || d.status === 'SCHEDULED') bad++; }
    else if (d.status === 'AT BERTH' || d.status === 'BOARDING') bad++;
    else seenDue++;
  });
  /* Every ship in a berth is on the board (unless she leaves past it). */
  occ.forEach(function (o) {
    if (o.leavesAt <= t + 24 * 3600 && !sch.departures.some(function (d) { return d.id === o.route.id; })) bad++;
  });
  /* An arrival: a moment after it, trafficState has her at this port. */
  sch.arrivals.slice(0, 4).forEach(function (a) {
    var r = sys.traffic.filter(function (q) { return q.id === a.id; })[0];
    var st = Sim.trafficState(r, sys, a.at + 1);
    /* A moment before it she is on her way here; a moment after, here. */
    var before = Sim.trafficState(r, sys, a.at - 60);
    if (st && st.to && st.to.id === port.id && before && before.to && before.to.id === port.id) arrOk++;
    else arrBad++;
  });
}
check('departures agree with the berth queue, and none is in the past', bad === 0,
      seenAt + ' in a berth, ' + seenDue + ' due, ' + bad + ' wrong');
check('ships in berths and ships due both show up', seenAt > 0 && seenDue > 0);
check('an arrival is when trafficState brings her here', arrBad === 0 && arrOk > 0, arrOk + ' ok, ' + arrBad + ' off');
var s0 = C.schedule(port, sys, 86400 * 2);
check('sorted soonest first', s0.departures.every(function (d, i, a) { return !i || a[i - 1].at <= d.at; }) &&
      s0.arrivals.every(function (d, i, a) { return !i || a[i - 1].at <= d.at; }));
check('a destination is a real port name', s0.departures.every(function (d) {
  return sys.bodies.some(function (b) { return b.name === d.to; });
}), s0.departures.slice(0, 3).map(function (d) { return d.name + ' -> ' + d.to; }).join('; '));

console.log('\n--- the public address ---');
var G = { ship: { name: 'Patience', crew: [] }, here: star, wanted: {}, rumours: [] };
var said = {}, lines = [];
for (var i = 0; i < 12; i++) {
  var l = C.paLine(G, port, sys, 86400 * 2, said);
  if (!l) break;
  check('never said twice: ' + l.key, !said[l.key]);
  said[l.key] = 1; lines.push(l.text);
}
check('a ship called as departing is not then called as the next sailing', !lines.some(function (x, i) {
  var m = /^Next sailing: (.+?) for /.exec(x);
  return m && lines.slice(0, i).some(function (y) { return y.indexOf(m[1] + ' for ') === 0 && /departing/.test(y); });
}), lines.join(' / '));
check('without a bounty the PA never mentions one', !lines.some(function (x) { return /flagged/.test(x); }));
G.wanted[star.factionId] = 600;
var lb = C.paLine(G, port, sys, 86400 * 2, {});
var dueNow = C.schedule(port, sys, 86400 * 2, { hours: 1 }).departures.some(function (d) { return d.at - 86400 * 2 <= 600 && d.status !== 'AT ANCHOR'; });
check('with one, port security says it (after any sailing due)', dueNow || (lb && /flagged, 600 credits/.test(lb.text)), lb && lb.text);
check('bountyHere is the figure on the books', C.bountyHere(G, port) === 600);
check('a named ship is "the" her name', C.shipCalled(G) === 'the Patience');
check('an unnamed one is called by her class, never "the a ship"',
      /^a .+ in port$/.test(C.shipCalled({ ship: { hullId: 'talon' } })) && !/the a /.test(C.shipCalled({ ship: {} })),
      C.shipCalled({ ship: { hullId: 'talon' } }));
var short = C.marketShort(port);
var sl = lines.filter(function (x) { return /market desk is buying/.test(x); })[0];
check('a shortage said is a shortage the desk has', !sl || short.some(function (n) { return sl.toLowerCase().indexOf(n.toLowerCase()) >= 0; }), sl);

console.log('\n--- overheard ---');
check('staff at a counter do not chatter', C.overheard(G, port, sys, { id: 'x', role: 'clerk', staff: 'Market clerk' }, 86400 * 2) === null);
check('nor does the law', C.overheard(G, port, sys, { id: 'y', role: 'security' }, 86400 * 2) === null);
var dep = C.schedule(port, sys, 86400 * 2).departures[0];
var crewLine = C.overheard(G, port, sys, { id: 'z', role: 'hand', route: { id: dep.id } }, 86400 * 2);
check('a docked crew talks about their own sailing', crewLine && crewLine.indexOf(dep.to) >= 0, crewLine);
check('the same person says the same thing', C.overheard(G, port, sys, { id: 'z', role: 'hand', route: { id: dep.id } }, 86400 * 2) === crewLine);
check('the clock reads like the HUD', C.clock(3600 * 25 + 60 * 7) === '01:07');

console.log('\n--- somebody comes over ---');
/* Astra: "a nice surprise; not super often, more with higher notoriety." */
check('rare for a nobody', C.approachChance(0) <= 0.1, C.approachChance(0));
check('likelier the more you are known', C.approachChance(1) > C.approachChance(0) && C.approachChance(4) > C.approachChance(1));
check('never a certainty', C.approachChance(1000) <= 0.6);
var G0 = { ship: { cargo: {} }, here: star, wanted: {}, rumours: [], galaxy: g };
var f0 = C.fame(G0, port, sys, 86400 * 2);
G0.wanted[star.factionId] = 300;
var f1 = C.fame(G0, port, sys, 86400 * 2);
check('a bounty here makes you better known', f1.score === f0.score + 1 && f1.bounty === 300, f0.score + ' -> ' + f1.score);
check('staff, the law and your own crew do not come over',
      !C.canApproach({ role: 'clerk', staff: 'x' }) && !C.canApproach({ role: 'security' }) &&
      !C.canApproach({ role: 'hand', aboard: true }) && C.canApproach({ role: 'hand' }));
/* The tip is true: a port in this system, short of the good it names. */
var tp = C.tip(G0, port, sys);
var others = (sys.ports || sys.bodies).filter(function (p) { return p !== port && p.market && p.market.rows; });
var truthful = !tp || others.some(function (p) {
  if (tp.indexOf(p.name) < 0) return false;
  return Object.keys(p.market.rows).some(function (cid) {
    var r = p.market.rows[cid], c = global.Economy.BY_ID[cid];
    return c && r.cons > r.prod * 1.6 && tp.toLowerCase().indexOf(c.name.toLowerCase()) >= 0;
  });
});
check('a tip names a real port that is really short of that good', truthful, tp);
/* With that good in your hold, the tip is about your hold. */
var want = null;
others.forEach(function (p) { Object.keys(p.market.rows).forEach(function (cid) {
  var r = p.market.rows[cid], c = global.Economy.BY_ID[cid];
  if (!want && c && !c.contraband && r.cons > r.prod * 1.6) want = { cid: cid, name: c.name };
}); });
if (want) {
  G0.ship.cargo[want.cid] = 5;
  var tp2 = C.tip(G0, port, sys);
  check('a good in your hold comes first', /in your hold/.test(tp2), tp2);
}
var ap = C.approach(G0, port, sys, 86400 * 2, { id: 'stranger-1', role: 'hand' });
check('someone with nothing on you still has a true tip, or does not come', ap === null || /cr|short|crying|enough|Security/.test(ap.text), ap && ap.text);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
