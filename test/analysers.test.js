/* analysers.test.js — the two instruments you can buy, and the rumours you
 * cannot.
 *
 *     node test/analysers.test.js
 *
 * Astra: "a trade analyzer component which we can buy. The purpose of it
 * is to identify what in a system there are shortages of, and what there
 * is an excess of." And: "a Combat Analyzer which shows shield, hull and
 * weapons status for targeted ships. Using the thing isn't a hostile
 * action, unless you fire upon them." And: "Rumors when hailing other
 * ships, especially about trade deals?"
 *
 * The rule all three share, and the one this file exists to hold: NOTHING
 * HERE INVENTS A FACT. The trade page is the market model sorted; the arms
 * line is the gun the NPC loop would fire; a rumour is one line off the
 * same two. So every check is "does the instrument agree with the thing
 * it claims to read" — and a test that stubs the world to make the
 * instrument look right would be the bug.
 */
global.window = global;
var path = require('path');
var SRC = path.join(__dirname, '..', 'src');
var V = require(path.join(SRC, 'vec3.js'));
var Eco = require(path.join(SRC, 'economy.js'));
var Gen = require(path.join(SRC, 'generate.js'));
var Sim = require(path.join(SRC, 'sim.js'));
var Combat = require(path.join(SRC, 'combat.js'));

var pass = 0, fail = 0;
function check(n, c, d) { if (c) pass++; else { fail++; console.log('  FAIL  ' + n + (d ? '   ' + d : '')); } }

console.log('--- the trade analyser reads the market, it does not have one ---');
(function () {
  var T = 3 * 86400, seen = 0, sysN = 0, agree = true, order = true;
  for (var k = 0; k < 12; k++) {
    var sys = Gen.generateSystem('ana-' + k);
    if (!sys.ports || sys.ports.length < 2) continue;
    sysN++;
    var a = Eco.systemAnalysis(sys, T);
    var i;
    for (i = 0; i < a.shortages.length; i++) {
      var s = a.shortages[i], p = Eco.price(s.port, s.cid, T);
      seen++;
      /* The named port, asked directly, says the same thing. */
      if (!p || !p.importer || p.fill > Eco.SHORT_FILL || Math.abs(p.sell - s.bid) > 1e-9) agree = false;
      if (i > 0 && a.shortages[i - 1].fill > s.fill + 1e-12) order = false;
    }
    for (i = 0; i < a.excesses.length; i++) {
      var e = a.excesses[i], q = Eco.price(e.port, e.cid, T);
      seen++;
      if (!q || q.fill < Eco.GLUT_FILL) agree = false;
      if (e.waste ? (q.sink || q.buy >= 0) : (!q.exporter || !q.tradeable || Math.abs(q.buy - e.ask) > 1e-9)) agree = false;
      if (i > 0 && a.excesses[i - 1].fill < e.fill - 1e-12) order = false;
    }
    for (i = 0; i < a.runs.length; i++) {
      var r = a.runs[i];
      var pa = Eco.price(r.from, r.cid, T), pb = Eco.price(r.to, r.cid, T);
      if (r.from === r.to || !(r.margin > 0) || !pa || !pb ||
          Math.abs(pb.sell - pa.buy - r.margin) > 1e-9) agree = false;
      if (i > 0 && a.runs[i - 1].margin < r.margin - 1e-9) order = false;
    }
  }
  check('twelve systems, every line agrees with the port it names', agree && seen > 50, seen + ' lines');
  check('emptiest shortage first, fullest excess first, fattest run first', order);
  check('a run is a real ask and a real bid at two different ports', agree);

  /* THE THRESHOLDS ARE THE ACUTE QUARTILES, not a third and two thirds —
   * an importer's warehouse is low by construction. If somebody loosens
   * them the page goes back to flagging half the market. */
  check('the shortage cut-off is the acute quartile', Eco.SHORT_FILL <= 0.2, Eco.SHORT_FILL);
  check('and so is the excess cut-off', Eco.GLUT_FILL >= 0.8, Eco.GLUT_FILL);

  /* A signal, not the screen: the lists are a minority of the rows. */
  var sys2 = Gen.generateSystem('ana-1'), rows = 0;
  sys2.ports.forEach(function (p) { rows += p.market ? p.market.order.length : 0; });
  var a2 = Eco.systemAnalysis(sys2, T);
  check('shortages are a minority of the market rows',
        a2.shortages.length < rows * 0.25, a2.shortages.length + ' of ' + rows);
  check('and so are excesses', a2.excesses.length < rows * 0.25, a2.excesses.length + ' of ' + rows);
  check('a pure function of the clock',
        JSON.stringify(Eco.systemAnalysis(sys2, T).runs.map(function (r) { return r.cid + r.margin; })) ===
        JSON.stringify(a2.runs.map(function (r) { return r.cid + r.margin; })));
})();

console.log('--- a run is a rate when the caller says how fast it flies ---');
(function () {
  var T = 3 * 86400, sys = Gen.generateSystem('ana-1');
  var plain = Eco.systemAnalysis(sys, T);
  var timed = Eco.systemAnalysis(sys, T, { accel: 0.02 });
  check('runs carry hours and a rate', timed.runs.length && timed.runs.every(function (r) { return r.hours > 0 && r.perHour > 0; }));
  check('and are sorted by the rate', timed.runs.every(function (r, i) { return i === 0 || timed.runs[i - 1].perHour >= r.perHour - 1e-9; }));
  check('the same runs, only reordered', timed.runs.length === plain.runs.length);
  var slow = Eco.systemAnalysis(sys, T, { accel: 0.005 });
  check('a slower hull quotes longer hours for the same leg',
        slow.runs.every(function (r) {
          var m = timed.runs.filter(function (x) { return x.cid === r.cid && x.from === r.from && x.to === r.to; })[0];
          return m && r.hours > m.hours;
        }));
  check('hours are the timetable\'s flip-and-burn', timed.runs.every(function (r) {
    return Math.abs(r.hours * 3600 - Math.max(600, 2 * Math.sqrt(r.distance / 0.02))) < 1e-6;
  }));
})();

console.log('--- the fittings ---');
(function () {
  var ta = Combat.EQUIPMENT.tradescan, ca = Combat.EQUIPMENT.combatanalyser;
  check('the trade analyser is a utility fitting of its own kind',
        ta && ta.slot === 'utility' && ta.kind === 'analyser' && ta.unique);
  check('the combat analyser is the third rung of the scanner ladder',
        ca && ca.kind === 'scanner' && ca.scan === 3 && ca.uniqueGroup === 'scanner');
  check('and costs more than the rung below it',
        ca.price > Combat.EQUIPMENT.combatscan.price &&
        Combat.EQUIPMENT.combatscan.price > Combat.EQUIPMENT.hullscan.price);
  check('the pitch says looking is not shooting', /not shooting/i.test(ca.pitch));

  var s = {}; Combat.initShip(s); s.hullId = 'kestrel'; s.credits = 1e6; s.cargo = {};
  check('a bare ship has no analyser', !Combat.hasTradeAnalyser(s) && Combat.scanLevel(s) === 0);
  var f1 = Combat.canFit(s, 'combatscan');
  check('the combat scanner fits', f1.ok, f1.why);
  Combat.fitItem(s, 'combatscan');
  var f2 = Combat.canFit(s, 'combatanalyser');
  check('a second scanner is refused in words — one instrument answers that question',
        !f2.ok && /scanner/i.test(f2.why), f2.why);
})();

console.log('--- the combat analyser reads the gun the NPC would fire ---');
(function () {
  var sys = Gen.generateSystem('kawartha');
  function spec(kind, cls, faction) {
    return { id: 'x-' + kind + cls, kind: kind, cls: cls, className: cls,
             faction: faction || 'f', size: 0.1 };
  }
  var s = {}; Combat.initShip(s); s.hullId = 'kestrel'; s.cargo = {};
  check('nothing fitted reads nothing', Combat.scanShip(s, spec('trader', 'freighter'), sys) === null);
  Combat.fitItem(s, 'combatscan');
  var l2 = Combat.scanShip(s, spec('trader', 'freighter'), sys);
  check('the combat scanner gives numbers but no arms line',
        l2 && l2.level === 2 && l2.hullHp !== undefined && l2.arms === undefined);
  s.fit = {}; Combat.syncLegacy && Combat.syncLegacy(s);
  Combat.fitItem(s, 'combatanalyser');
  var l3 = Combat.scanShip(s, spec('trader', 'freighter'), sys);
  check('the analyser adds one', l3 && l3.level === 3 && !!l3.arms, JSON.stringify(l3));

  /* THE SAME TABLES THE GUNNERY LOOP FIRES FROM. */
  var shuttle = Combat.npcArmament(spec('trader', 'shuttle'), sys);
  check('a shuttle is unarmed, as the loop treats it', !shuttle.armed && /unarmed/.test(shuttle.text));
  var trader = Combat.npcArmament(spec('trader', 'freighter'), sys);
  check('a trader carries the defensive gun', trader.armed &&
        trader.dmg === Combat.TRADER_GUN.dmg && trader.range === Combat.TRADER_GUN.range, JSON.stringify(trader));
  var cop = Combat.npcArmament(spec('police', 'police', 'navyfac'), sys);
  check('a cutter carries the patrol laser', cop.dmg === Combat.NPC_GUN.dmg && /patrol laser/.test(cop.gun));
  var mob = Combat.npcArmament(spec('police', 'police', 'outlaw'), sys);
  check("the Syndicate's own wing carries the muon beam",
        mob.dmg === Combat.SYNDICATE_GUN.dmg && /muon/.test(mob.gun));
  check('and it is the strongest thing on the list', mob.dps > cop.dps && cop.dps > trader.dps);
  var pir = Combat.npcArmament(spec('pirate', 'pirate'), sys);
  check('a pirate reads its rack the way its first shot would settle it',
        pir.rack === !!Combat.pirateRack(sys, spec('pirate', 'pirate')));
  /* AGAINST YOUR OWN GUNS. */
  var bare = {}; Combat.initShip(bare); bare.hullId = 'talon'; bare.cargo = {}; bare.fit = {};
  var vsBare = Combat.npcArmament(spec('trader', 'freighter'), sys, bare);
  check('with no guns aboard, anything armed out-guns you', vsBare.vsYou === Infinity);
  Combat.fitItem(bare, 'phpulse');
  var vsOne = Combat.npcArmament(spec('trader', 'freighter'), sys, bare);
  check('one photon pulse out-guns a trader\'s pea-shooter', vsOne.vsYou < 1 &&
        Math.abs(vsOne.vsYou - (Combat.TRADER_GUN.dmg / Combat.TRADER_GUN.cooldown) / Combat.playerDps(bare)) < 1e-9);
  var vsMob = Combat.npcArmament(spec('police', 'police', 'outlaw'), sys, bare);
  check('and the Syndicate beam out-guns one photon pulse', vsMob.vsYou > 1);
  check('no ship, no comparison', Combat.npcArmament(spec('trader', 'freighter'), sys).vsYou === undefined);
  var fleet = Combat.npcArmament({ kind: 'fleet', cls: 'courier', id: 'fleet|x' }, sys);
  check('a ship of yours under orders reads as a civil hull', fleet.armed && /defensive/.test(fleet.gun));

  /* LOOKING IS NOT SHOOTING. A scan changes nothing anybody reacts to. */
  var victim = spec('trader', 'freighter', 'f');
  victim.hostileToPlayer = false; victim.mode = 'shadow';
  var G = { ship: s, sys: sys, t: 0, wanted: {}, standing: {} };
  var before = JSON.stringify({ h: victim.hostileToPlayer, m: victim.mode, w: G.wanted, st: G.standing });
  Combat.scanShip(s, victim, sys); Combat.scanShip(s, victim, sys);
  var after = JSON.stringify({ h: victim.hostileToPlayer, m: victim.mode, w: G.wanted, st: G.standing });
  check('scanning twice leaves the target, the law and your standing untouched', before === after);
})();

console.log('--- rumours are true, and a ship has one a day ---');
(function () {
  var T = 3 * 86400, sys = Gen.generateSystem('ana-2');
  var s = {}; Combat.initShip(s); s.hullId = 'talon'; s.cargo = {}; s.credits = 1000;
  var G = { ship: s, sys: sys, t: T, galaxy: null, here: { id: 'star-a' }, wanted: {}, standing: {} };
  var list = Sim.trafficAll(sys, T);
  /* Parked beside the first ship, inside transmitter range. */
  s.pos = V.add(list[0].pos, { x: 5, y: 0, z: 0 }); s.vel = V.clone(list[0].vel);
  check('there is traffic to hail', list.length > 3, list.length);
  var a = Eco.systemAnalysis(sys, T);
  var shortAt = {}, excessAt = {}, i;
  a.shortages.forEach(function (x) { shortAt[x.port.name + '|' + x.name.toLowerCase()] = true; });
  a.excesses.forEach(function (x) { excessAt[x.port.name + '|' + (x.waste ? 'waste' : x.name.toLowerCase())] = true; });

  var facts = 0, honest = true, kinds = {};
  for (i = 0; i < list.length; i++) {
    var st = list[i];
    var got = Combat.rumourFacts(G, sys, T, st);
    for (var j = 0; j < got.length; j++) {
      var f = got[j]; facts++; kinds[f.kind] = (kinds[f.kind] || 0) + 1;
      if (f.kind === 'shortage' && f.weight === 3) {
        var okS = Object.keys(shortAt).some(function (k) {
          var pn = k.split('|')[0], cn = k.split('|')[1];
          return f.text.indexOf(pn) === 0 && f.text.indexOf(cn) > 0;
        });
        if (!okS) honest = false;
      }
      if (f.kind === 'excess') {
        var okE = Object.keys(excessAt).some(function (k) {
          var pn = k.split('|')[0], cn = k.split('|')[1];
          return f.text.indexOf(pn) === 0 && (cn === 'waste' ? /drums/.test(f.text) : f.text.indexOf(cn) > 0);
        });
        if (!okE) honest = false;
      }
      if (f.kind === 'run' && a.runs.length) {
        if (f.text.indexOf(a.runs[0].from.name) < 0 || f.text.indexOf(a.runs[0].to.name) < 0) honest = false;
      }
    }
  }
  check('every trade rumour names a port the analyser would name', honest && facts > 0, facts + ' facts');
  check('ships know their own two ports first',
        Object.keys(kinds).length >= 2, JSON.stringify(kinds));

  /* One a day, the same all day, different tomorrow. */
  var said = [];
  var hooks = { say: function (t) { said.push(t); } };
  var ship = list[0];
  var r1 = Combat.hailShip(G, sys, T, ship, 'rumour', hooks);
  check('a hail gets a rumour', r1 && r1.rumour && said.length === 1, said.join('|'));
  var r2 = Combat.hailShip(G, sys, T + 3600, ship, 'rumour', hooks);
  check('an hour later they have said their piece', r2 && r2.told && /all I have heard/.test(said[1]));
  delete ship.route._rumourDay;
  var again = [];
  Combat.hailShip(G, sys, T + 3600, ship, 'rumour', { say: function (t) { again.push(t); } });
  check('and it is the same rumour all day, not a reroll', again[0] === said[0], again[0]);
  var next = [];
  Combat.hailShip(G, sys, T + Combat.RUMOUR_DAY, ship, 'rumour', { say: function (t) { next.push(t); } });
  check('tomorrow they answer again', next.length === 1 && !/all I have heard/.test(next[0]));

  /* THE NEIGHBOURS, but only ones whose systems already exist. */
  var far = Gen.generateSystem('ana-3');
  var Gn = { ship: s, sys: sys, t: T, wanted: {}, standing: {},
             here: { id: 'star-a', x: 0, y: 0, z: 0 },
             galaxy: { stars: [{ id: 'star-a', name: 'Here', x: 0, y: 0, z: 0 },
                               { id: 'star-b', name: 'Yonder', x: 5, y: 0, z: 0 },
                               { id: 'star-c', name: 'Never', x: 2, y: 0, z: 0 }], factionById: {} },
             systemCache: { 'star-b': far } };
  var Galaxy = require(path.join(SRC, 'galaxy.js'));
  var nf = Combat.rumourFacts(Gn, sys, T, list[0]);
  var abroad = nf.filter(function (f) { return f.kind === 'abroad'; });
  check('a crew in from a visited star knows its markets', abroad.length === 1 && /Yonder/.test(abroad[0].text), JSON.stringify(abroad));
  var farA = Eco.systemAnalysis(far, T);
  check('and what it says is true there',
        farA.shortages.length ? abroad[0].text.indexOf(farA.shortages[0].port.name) > 0 : true, abroad[0].text);
  check('the nearer star nobody has visited is not gossiped about', !/Never/.test(abroad[0].text));

  /* A HOSTILE ANSWERS NOTHING, as with every other intent. */
  var quiet = [];
  Combat.hailShip(G, sys, T, { name: 'Raider', hostile: true, pos: s.pos, route: { id: 'r' } }, 'rumour',
                  { say: function (t) { quiet.push(t); } });
  check('a pirate does not gossip', /does not answer/.test(quiet[0]));
})();

console.log('');
console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
