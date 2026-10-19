/* captains.test.js — every ship has somebody in the chair, and they remember.
 *
 *     node test/captains.test.js
 *
 * DESIGN-NOTES-CAPTAINS-RUMOURS-DISGUISE-v3. Pinned here, because each one
 * would break silently:
 *
 *  - a captain is a pure function of (seed, star, ship): same seed, same
 *    person, and no draw taken from any stream generation relied on;
 *  - nobody is SAVED until they have actually dealt with you;
 *  - the dials clamp, the memorable tag keeps the biggest event, and a
 *    burst of fire is one grievance rather than six;
 *  - a lifted trader is the same person as the timetabled ship it was;
 *  - a police cutter is not crewed by a merchant;
 *  - the greeting runs from furious to grateful, says WHY, and SEEN BEATS
 *    HEARD: the captain you saved is grateful even if the lanes call you a
 *    pirate;
 *  - the crime and rescue paths actually feed it, and it survives a save.
 */
'use strict';

var path = require('path');
var fs = require('fs');
var SRC = path.join(__dirname, '..', 'src');
global.window = global;
var V = require(path.join(SRC, 'vec3.js'));
require(path.join(SRC, 'kepler.js'));
var RNG = require(path.join(SRC, 'rng.js'));
require(path.join(SRC, 'economy.js'));
var Gen = require(path.join(SRC, 'generate.js'));
var Galaxy = require(path.join(SRC, 'galaxy.js'));
var Sim = require(path.join(SRC, 'sim.js'));
var Combat = require(path.join(SRC, 'combat.js'));
require(path.join(SRC, 'missions.js'));
require(path.join(SRC, 'shiptrade.js'));
var Cap = require(path.join(SRC, 'captains.js'));
var Save = require(path.join(SRC, 'save.js'));

var pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail !== undefined ? '   ' + detail : '')); }
}
function section(n) { console.log('\n' + n); }

/* ---- fixtures ------------------------------------------------------------ */

var SEED = 'kawartha';
var galaxies = {};
var sysCache = {};
function galaxyFor(seed) { return galaxies[seed] || (galaxies[seed] = Galaxy.build(seed)); }
function systemFor(seed, star) {
  var k = seed + '|' + star.id;
  if (!sysCache[k]) {
    var g = galaxyFor(seed);
    sysCache[k] = Gen.generateSystem(star.seed,
      { faction: g.factionById[star.factionId], allFactions: g.factions });
    sysCache[k].starId = star.id;
  }
  return sysCache[k];
}

/* A star whose system has traffic and patrols, found rather than assumed. */
function busyStar(seed) {
  var g = galaxyFor(seed);
  for (var i = 0; i < g.stars.length && i < 60; i++) {
    var sys = systemFor(seed, g.stars[i]);
    if ((sys.traffic || []).length >= 4) return g.stars[i];
  }
  return g.home;
}

function makeG(seed, star) {
  seed = seed || SEED;
  star = star || busyStar(seed);
  var sys = systemFor(seed, star);
  var planet = sys.bodies.filter(function (b) { return b.kind === 'planet'; })[0];
  var ship = Sim.circularOrbit(planet, sys, 0, planet.radius * 0.6, 0.1, 0);
  ship.credits = 1000; ship.cargo = {};
  Combat.initShip(ship);
  Sim.refreshShip(ship);
  ship.shipName = 'Brightwing'; ship.bornId = 'hull-A';
  return { seed: seed, ship: ship, sys: sys, t: 0, galaxy: galaxyFor(seed), here: star,
           standing: {}, wanted: {}, missions: [], doneMissions: {} };
}

function trafficContact(G, i) {
  var route = G.sys.traffic[i % G.sys.traffic.length];
  return Sim.trafficState(route, G.sys, G.t);
}

/* First traffic contact whose captain holds the given values. */
function captainWith(G, values, role) {
  var list = Sim.shipsAll(G.sys, G.t);
  for (var i = 0; i < list.length; i++) {
    var p = Cap.profile(G, G.sys, list[i]);
    if (p && p.values === values && (!role || p.role === role)) return list[i];
  }
  return null;
}

/* ======================================================================== */
section('--- who is in the chair ---');
(function () {
  var G = makeG();
  var c = trafficContact(G, 0);
  var p = Cap.profile(G, G.sys, c);
  check('a traffic ship has a captain', !!p && !!p.name, p && p.name);
  check('with a temperament and values from the design lists',
        Cap.TEMPERS.indexOf(p.temper) >= 0 && Cap.VALUES.indexOf(p.values) >= 0,
        p.temper + ' / ' + p.values);
  check('and a home port: where the route starts',
        p.home === c.route.from, p.home + ' vs ' + c.route.from);
  check('and one friend and one rival, neither of them themself, not the same person',
        !!p.friend && !!p.rival && p.friend !== p.key && p.rival !== p.key && p.friend !== p.rival,
        p.friend + ' / ' + p.rival);

  /* Same seed, same person — and a cleared memo proves it is recomputed,
   * not merely cached. */
  Cap._clearCache();
  var p2 = Cap.profile(G, G.sys, trafficContact(G, 0));
  check('same seed, same captain, recomputed from nothing',
        p2.name === p.name && p2.temper === p.temper && p2.values === p.values &&
        p2.friend === p.friend && p2.rival === p.rival);

  /* Different seed, same star id and route id → a different person (on the
   * whole). Sampled, because two of 48 given names can collide by chance. */
  var differ = 0, n = 0;
  for (var i = 0; i < 8; i++) {
    var G2 = makeG('other-' + i);
    var cc = trafficContact(G2, 0);
    var q = Cap.profile(G2, G2.sys, cc);
    var fake = { seed: 'yet-another-' + i, here: G2.here, ship: G2.ship };
    var r = Cap.profile(fake, G2.sys, cc);
    if (q && r) { n++; if (q.name !== r.name || q.temper !== r.temper) differ++; }
  }
  check('a different seed puts a different person in the same chair', n > 0 && differ >= n - 1,
        differ + '/' + n);

  /* The star is in the key: every system's 'r0' is somebody else. */
  var g = galaxyFor(SEED), names = {}, keys = {};
  for (var s = 0; s < 12; s++) {
    var sy = systemFor(SEED, g.stars[s]);
    if (!sy.traffic.length) continue;
    var Gs = { seed: SEED, here: g.stars[s], ship: G.ship };
    var ps = Cap.profile(Gs, sy, Sim.trafficState(sy.traffic[0], sy, 0));
    keys[ps.key] = true; names[ps.name] = true;
  }
  check('route r0 in different systems is a different captain',
        Object.keys(keys).length >= 3 && Object.keys(names).length >= Object.keys(keys).length - 1,
        Object.keys(names).length + ' names for ' + Object.keys(keys).length + ' keys');

  /* DOCTRINE 1 and 2. */
  var src = fs.readFileSync(path.join(SRC, 'captains.js'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '');
  check('captains.js never calls Math.random', !/Math\.random/.test(src));
  var before = JSON.stringify(Gen.describe(G.sys));
  Cap._clearCache();
  for (var k = 0; k < G.sys.traffic.length; k++) Cap.profile(G, G.sys, trafficContact(G, k));
  var fresh = Gen.generateSystem(G.here.seed,
    { faction: G.galaxy.factionById[G.here.factionId], allFactions: G.galaxy.factions });
  check('generating every captain changes nothing about the system',
        JSON.stringify(Gen.describe(fresh)) === before);
})();

section('--- patrols and lifted traders ---');
(function () {
  var G = makeG();
  var cop = null, pirate = null;
  for (var si = 0; si < 40 && (!cop || !pirate); si++) {
    var star = G.galaxy.stars[si];
    var sys = systemFor(SEED, star);
    var Gs = { seed: SEED, here: star, ship: G.ship };
    (sys.patrols || []).forEach(function (sp) {
      var st = Sim.shipsAll(sys, 0).filter(function (x) { return x.id === sp.id; })[0];
      if (!st) return;
      if (!cop && (sp.kind === 'police' || sp.kind === 'navy')) cop = Cap.profile(Gs, sys, st);
      if (!pirate && sp.kind === 'pirate') pirate = Cap.profile(Gs, sys, st);
    });
  }
  check('a police or navy patrol has a captain', !!cop);
  check('and it is crewed by the law, not a merchant', cop && cop.role !== 'trade',
        cop && cop.role);
  check('a pirate has a captain, flying the outlaw flag', !!pirate && pirate.role === 'pirate' &&
        !!pirate.faction, pirate && (pirate.role + ' ' + pirate.faction));

  /* Lift a trader off its rails: same person. */
  var c = trafficContact(G, 1);
  var before = Cap.profile(G, G.sys, c);
  var spec = Combat.liftTrader(G.sys, c, G.t);
  var after = Cap.profile(G, G.sys, spec);
  var afterLive = Cap.profile(G, G.sys, spec.live);
  check('a lifted trader is the same captain as its route',
        !!spec && after.key === before.key && after.name === before.name,
        (after && after.key) + ' vs ' + before.key);
  check('and its live state answers to the same key', afterLive && afterLive.key === before.key);

  /* Your own fleet has no stranger aboard. */
  check('a fleet-kind route has no captain',
        !Cap.hasCaptain({ route: { id: 'f1', kind: 'fleet', from: 'x' }, id: 'f1' }));
})();

section('--- memory: lazy, clamped, ranked ---');
(function () {
  var G = makeG();
  var c = trafficContact(G, 2);
  Cap.profile(G, G.sys, c);
  Cap.greeting(G, G.sys, c, 0);
  Cap.describe(G, G.sys, c);
  check('looking at a captain saves nothing', !G.captains || !Object.keys(G.captains).length);

  Cap.noteMet(G, G.sys, c, 10);
  var key = Cap.keyOf(G, G.sys, c);
  var m = Cap.memory(G, key);
  check('a hail makes them someone the save remembers', !!m && m.met === 10);
  check('without moving a dial', m.feeling === 0 && m.honesty === 0 && m.seen === 0);

  Cap.record(G, G.sys, c, 'attacked', 100);
  Cap.record(G, G.sys, c, 'attacked', 101);
  Cap.record(G, G.sys, c, 'attacked', 102);
  check('a burst of fire is one grievance', m.seen === 1 && m.feeling === Cap.EVENTS.attacked.feeling,
        m.seen + ' seen, feeling ' + m.feeling);
  check('and it is the memorable thing', m.tag === 'ATTACKED_ME');
  check('from the hull they saw', m.hulls.indexOf('hull-A') >= 0, m.hulls.join(','));

  Cap.record(G, G.sys, c, 'traded', 1000);
  check('a fair trade does not overwrite being shot at', m.tag === 'ATTACKED_ME', m.tag);
  check('but it does count as honest dealing', m.honesty === 1, m.honesty);

  for (var i = 0; i < 10; i++) Cap.record(G, G.sys, c, 'robbed', 2000 + i * 1000);
  check('feeling clamps at -' + Cap.DIAL, m.feeling === -Cap.DIAL, m.feeling);
  check('the worse act becomes the memory', m.tag === 'ROBBED_ME' || m.tag === 'ATTACKED_ME', m.tag);

  /* Honesty and feeling are separate dials. */
  var c2 = trafficContact(G, 3);
  for (var j = 0; j < 4; j++) Cap.record(G, G.sys, c2, 'answered', 20000 + j * 1000);
  Cap.record(G, G.sys, c2, 'lied', 40000);
  var m2 = Cap.memory(G, Cap.keyOf(G, G.sys, c2));
  check('a captain can like you and know you lie', m2.feeling > 0 && m2.honesty < 0,
        'feeling ' + m2.feeling + ', honesty ' + m2.honesty);
})();

section('--- the greeting: furious to grateful ---');
(function () {
  var G = makeG();
  var lawful = captainWith(G, 'lawful');
  if (!lawful) { G = makeG('kawartha-2'); lawful = captainWith(G, 'lawful'); }
  check('there is a lawful trader to ask', !!lawful);

  var clean = Cap.greeting(G, G.sys, lawful, 0);
  check('a clean newcomer gets a neutral greeting', clean.band === 'neutral', clean.band);
  check('which addresses you by your ship name', /Brightwing/.test(clean.text) ||
        !/\{you\}/.test(clean.text), clean.text);
  check('and invents no reason', clean.text.indexOf('Every trader') < 0);

  /* A pirate, in public. */
  G.record = { self: { piracy: 6, kills: 2, pirateKills: 0, rescues: 0 } };
  var dirty = Cap.greeting(G, G.sys, lawful, 0);
  check('a lawful captain who has heard you are a pirate is furious or angry',
        dirty.band === 'furious' || dirty.band === 'angry', dirty.band);
  check('and says why', /know what you do|Every trader/.test(dirty.text), dirty.text);

  /* A pirate-minded captain reads the same record as a reference. */
  var crook = captainWith(G, 'pirate');
  if (crook) {
    var admired = Cap.greeting(G, G.sys, crook, 0);
    check('a pirate-minded captain reads the same record warmly',
          ['warm', 'glad'].indexOf(admired.band) >= 0, admired.band + ': ' + admired.text);
  } else {
    check('(no pirate-minded trader in this system to compare — skipped)', true);
  }

  /* A rescuer, in public. */
  G.record = { self: { piracy: 0, kills: 0, pirateKills: 0, rescues: 3 } };
  var nice = Cap.greeting(G, G.sys, lawful, 0);
  check('a lawful captain who has heard you rescue people is warm or glad',
        nice.band === 'warm' || nice.band === 'glad', nice.band);
  check('and says why', /stranded ships/.test(nice.text), nice.text);
  check('but not GRATEFUL: they owe you nothing personally', nice.band !== 'grateful');

  /* SEEN BEATS HEARD. A pirate in public who saved THIS captain. */
  G.record = { self: { piracy: 8, kills: 3, pirateKills: 0, rescues: 0 } };
  Cap.record(G, G.sys, lawful, 'rescued', 500);
  var saved = Cap.greeting(G, G.sys, lawful, 600);
  check('the captain you saved is grateful whatever the lanes say',
        saved.band === 'grateful', saved.band + ': ' + saved.text);
  check('and remembers what for', /saved|owe you|would have lost|pulled us out/.test(saved.text),
        saved.text);

  /* And the reverse: a public saint who robbed THIS captain. */
  var victim = captainWith(G, 'profit') || trafficContact(G, 4);
  G.record = { self: { piracy: 0, kills: 0, pirateKills: 0, rescues: 6 } };
  Cap.record(G, G.sys, victim, 'robbed', 700);
  Cap.record(G, G.sys, victim, 'attacked', 1000);
  var robbed = Cap.greeting(G, G.sys, victim, 1100);
  check('the captain you robbed is angry whatever the lanes say',
        robbed.band === 'angry' || robbed.band === 'furious', robbed.band);
  check('and says what you did', /hull|shooting|opened fire|guns|gunpoint|robbed|crate|airlock/.test(robbed.text),
        robbed.text);

  /* Stable within a day, so hailing twice does not reroll the mood. */
  var a = Cap.greeting(G, G.sys, victim, 1200).text;
  var b = Cap.greeting(G, G.sys, victim, 1300).text;
  check('the same captain says the same thing all day', a === b);

  /* No placeholder ever leaks. */
  var leaks = 0, total = 0;
  Cap.BANDS.forEach(function (band) {
    var set = Cap.OPENERS[band];
    Object.keys(set).forEach(function (k) {
      set[k].forEach(function (line) {
        total++;
        var out = line.replace(/\{you\}/g, 'X').replace(/\{me\}/g, 'Y');
        if (/[{}]/.test(out)) leaks++;
      });
    });
  });
  check('every opener fills cleanly (' + total + ' lines)', leaks === 0);
  check('every band has lines', Cap.BANDS.every(function (b) {
    return Cap.OPENERS[b] && Cap.OPENERS[b].any.length >= 3;
  }));
})();

section('--- the game actually feeds it ---');
(function () {
  var G = makeG();
  var c = trafficContact(G, 0);
  var spec = Combat.liftTrader(G.sys, c, G.t);
  Combat.crime(G.sys, G, 50, 'assault', spec, null);
  Combat.crime(G.sys, G, 51, 'assault', spec, null);
  var m = Cap.memory(G, Cap.keyOf(G, G.sys, spec));
  check('an assault is remembered by the victim', !!m && m.tag === 'ATTACKED_ME',
        m && m.tag);
  check('and goes on the public record once', G.record && G.record.self.piracy === 1, G.record && G.record.self.piracy);
  Combat.crime(G.sys, G, 60, 'demand', spec, null);
  check('a demand is robbery', m.tag === 'ATTACKED_ME' || m.tag === 'ROBBED_ME');
  check('and a second line on the record', G.record.self.piracy === 2, G.record.self.piracy);

  /* Answering a call. */
  var c2 = trafficContact(G, 2);
  var spec2 = Combat.liftTrader(G.sys, c2, G.t);
  var call = { from: spec2.id, name: spec2.name, faction: spec2.faction, pos: V.clone(G.ship.pos),
               at: 0, until: 1e9, victim: spec2 };
  var r = Combat.answerDistress(G.sys, G, 100, call, null);
  var m2 = Cap.memory(G, Cap.keyOf(G, G.sys, spec2));
  check('answering a distress call is remembered by that captain',
        r.ok && !!m2 && m2.tag === 'ANSWERED_MY_DISTRESS', r.why || (m2 && m2.tag));
  check('and counts as a rescue in public', G.record.self.rescues === 1, G.record.self.rescues);
})();

section('--- saved and restored ---');
(function () {
  var G = makeG();
  var c = trafficContact(G, 1);
  Cap.record(G, G.sys, c, 'answered', 10);
  Cap.bumpRecord(G, 'rescues');
  var snap = Save.snapshot(G);
  check('the snapshot carries the captains who know you', !!snap.captains &&
        Object.keys(snap.captains).length === 1);
  check('and the public record', snap.record && snap.record.self.rescues === 1);
  var json = JSON.parse(JSON.stringify(snap));
  var H = makeG();
  H.captains = {}; H.record = null;
  /* restore() needs a world; borrow just the two lines this feature owns. */
  H.captains = json.captains; H.record = json.record;
  var back = Cap.greeting(H, H.sys, trafficContact(H, 1), 20);
  check('and the greeting after a reload is the greeting before it',
        back.text === Cap.greeting(G, G.sys, c, 20).text, back.text);
  /* An old career has neither field. */
  var old = JSON.parse(JSON.stringify(snap)); delete old.captains; delete old.record;
  check('an older save simply has nobody who remembers it',
        (old.captains || {}) && Cap.opinion({ seed: SEED, here: G.here, ship: G.ship,
          standing: {}, wanted: {} }, G.sys, c).band === 'neutral');
})();

section('--- doctrine 6: what the bands actually look like across seeds ---');
(function () {
  /* Not a pass/fail on a guessed threshold — a measurement, printed, with
   * only the floor asserted: every temper and value actually occurs, and a
   * pirate career draws mostly hostility from traders while a rescuer's
   * draws mostly warmth. */
  var tempers = {}, values = {}, pirateBands = {}, saintBands = {}, n = 0;
  for (var s = 0; s < 24; s++) {
    var G = makeG('measure-' + s);
    var list = Sim.shipsAll(G.sys, 0);
    for (var i = 0; i < list.length; i++) {
      var p = Cap.profile(G, G.sys, list[i]);
      if (!p) continue;
      n++;
      tempers[p.temper] = (tempers[p.temper] || 0) + 1;
      values[p.values] = (values[p.values] || 0) + 1;
      if (p.role !== 'trade') continue;
      G.record = { self: { piracy: 5, kills: 1 } };
      var b1 = Cap.opinion(G, G.sys, list[i]).band;
      pirateBands[b1] = (pirateBands[b1] || 0) + 1;
      G.record = { self: { rescues: 4 } };
      var b2 = Cap.opinion(G, G.sys, list[i]).band;
      saintBands[b2] = (saintBands[b2] || 0) + 1;
    }
  }
  console.log('     ' + n + ' captains  tempers ' + JSON.stringify(tempers));
  console.log('     values ' + JSON.stringify(values));
  console.log('     traders on a pirate:  ' + JSON.stringify(pirateBands));
  console.log('     traders on a rescuer: ' + JSON.stringify(saintBands));
  check('every temper occurs', Cap.TEMPERS.every(function (t) { return tempers[t] > 0; }));
  check('every set of values occurs', Cap.VALUES.every(function (v) { return values[v] > 0; }));
  var hostile = (pirateBands.angry || 0) + (pirateBands.furious || 0) + (pirateBands.cold || 0);
  var pTotal = 0; for (var k in pirateBands) pTotal += pirateBands[k];
  var warm = (saintBands.warm || 0) + (saintBands.glad || 0);
  var sTotal = 0; for (var k2 in saintBands) sTotal += saintBands[k2];
  check('most traders are hostile to a pirate', hostile > pTotal * 0.6, hostile + '/' + pTotal);
  check('most traders are warm to a rescuer', warm > sTotal * 0.6, warm + '/' + sTotal);
  check('but not all of them — values matter', hostile < pTotal, hostile + '/' + pTotal);
})();

/* ======================================================================== */
section('--- recall: deeds and words, never the same line twice ---');
(function () {
  var G = makeG();
  var c = trafficContact(G, 0);

  /* Astra's own example: "you saved my cargo and my crew, not to mention
   * my ship. Looking for another fleetmate? We could go into business
   * together." */
  Cap.record(G, G.sys, c, 'rescued', 100, { stakes: ['cargo', 'crew', 'ship'] });
  var seen = {}, hits = { stakes: 0, offer: 0, ship: 0 }, n = 0, sameOpen = 0, lastLine = '';
  for (var i = 0; i < 40; i++) {
    var g = Cap.speak(G, G.sys, c, 200 + i);
    n++;
    seen[g.text] = true;
    if (/my cargo and my crew/.test(g.text)) hits.stakes++;
    if (/ship/.test(g.text)) hits.ship++;
    if (/fleetmate|business together/.test(g.text)) hits.offer++;
    if (i < 3) console.log('     ' + g.speaker + ': "' + g.text + '"');
    /* Compare the parts actually used, not the first sentence — two
     * different greetings can both begin "Brightwing!". */
    if (i > 0 && lastLine && g.bits &&
        (g.bits.s === lastLine.s || g.bits.r === lastLine.r || (g.bits.c && g.bits.c === lastLine.c))) sameOpen++;
    lastLine = g.bits;
  }
  check('the captain you saved names what you saved', hits.stakes > 0 && hits.ship > 0,
        JSON.stringify(hits));
  check('and sometimes offers to go into business with you', hits.offer > 0, hits.offer);
  check('back-to-back hails never reuse a greeting, a memory or a closing', sameOpen === 0,
        sameOpen + ' of 39');
  check('forty hails, forty different lines', Object.keys(seen).length === n,
        Object.keys(seen).length + ' distinct of ' + n);
  check('the greeting is grateful', Cap.greeting(G, G.sys, c, 300).band === 'grateful');

  /* "last time I responded to your call, you were lying" — with your words. */
  var c2 = trafficContact(G, 1);
  Cap.record(G, G.sys, c2, 'lied', 100, { log: 'liedCall',
             q: 'Drive about to explode, refugees aboard, please hurry, we have children here and the reactor is going' });
  var lines = [];
  for (var j = 0; j < 12; j++) lines.push(Cap.speak(G, G.sys, c2, 400 + j).text);
  console.log('     e.g. "' + lines[0] + '"');
  check('a captain you lied to says so', lines.every(function (s) {
    return /lying|lie|liar|None of it was true/.test(s); }), lines.join(' | '));
  check('and sometimes quotes you', lines.some(function (s) { return /"Drive about to explode/.test(s); }));
  check('a long quote is clipped at a word, not mid-word',
        lines.filter(function (s) { return /"Drive/.test(s); }).every(function (s) {
          return /\w…"|[a-z]"/.test(s) && s.length < 220; }));
  check('no line repeats', new Set(lines).size === lines.length);

  /* Telling a stranger something keeps your words without wiping out what
   * they had heard about you. */
  G.record = { self: { piracy: 6, kills: 1 } };
  var lawful = captainWith(G, 'lawful');
  if (lawful) {
    var before = Cap.opinion(G, G.sys, lawful).band;
    Cap.record(G, G.sys, lawful, 'told', 500, { q: 'Lovely day for it' });
    var after = Cap.greeting(G, G.sys, lawful, 600);
    check('a chat does not erase your record', after.band === before, before + ' -> ' + after.band);
    check('but they remember what you said', /Lovely day for it/.test(after.text), after.text);
  }

  /* The log is capped and keeps what mattered. */
  var c3 = trafficContact(G, 2);
  Cap.record(G, G.sys, c3, 'rescued', 10, { stakes: ['ship'] });
  for (var k = 0; k < 20; k++) Cap.record(G, G.sys, c3, 'told', 1000 + k * 200, { q: 'chat ' + k });
  var m3 = Cap.memory(G, Cap.keyOf(G, G.sys, c3));
  check('the log is capped', m3.log.length === Cap.LOG_MAX, m3.log.length);
  check('and the rescue survived twenty chats', m3.log.some(function (e) { return e.k === 'rescued'; }));

  /* Every recall template fills cleanly with and without a quote. */
  var leaks = 0, total = 0;
  Object.keys(Cap.RECALL).forEach(function (k) {
    Cap.RECALL[k].forEach(function (tpl) {
      total++;
      var out = tpl.replace(/\{q\}/g, 'x').replace(/\{Stakes\}|\{stakes\}/g, 'y').replace(/\{when\}/g, 'z')
                     .replace(/\{f\}/g, 'w');   // a friend's or rival's name (favours.js)
      if (/[{}]/.test(out)) leaks++;
    });
  });
  check('every recall template fills cleanly (' + total + ')', leaks === 0);
  check('stakes read naturally', Cap.stakesPhrase(['cargo', 'crew', 'ship'], 0) ===
        'my cargo and my crew, not to mention my ship', Cap.stakesPhrase(['cargo', 'crew', 'ship'], 0));
})();

/* ======================================================================== */
section('--- step 2: who you say you are ---');

/* A docked G at a port whose system is bought (corruption >= 60), and one
 * at an honest one — found by searching, not assumed. */
function dockedAt(wantShady) {
  var g = galaxyFor(SEED);
  for (var i = 0; i < g.stars.length && i < 120; i++) {
    var star = g.stars[i];
    var sys = systemFor(SEED, star);
    if (!sys.ports || !sys.ports.length || (sys.traffic || []).length < 3) continue;
    var G = makeG(SEED, star);
    var corr = Combat.systemCorruption(G, sys);
    if ((corr >= Cap.SHADY_CORRUPTION) !== wantShady) continue;
    var port = sys.ports[0];
    Sim.dockShip(G.ship, port, sys, 0);
    G.ship.docked = port.id;
    G.ship.credits = 50000;
    return { G: G, port: port };
  }
  return null;
}

(function () {
  var G = makeG();
  var id = Cap.identity(G);
  check('honest colours are the real you', id.key === 'self' && !id.disguised && id.name === 'Brightwing');
  G.ship.shipName = 'Silverwing'; G.ship.reg = 'KX-1234';
  check('a legal rename is still the real you — the registry links it',
        Cap.identity(G).key === 'self' && Cap.identity(G).name === 'Silverwing');
  var f1 = Cap.companyFleet(G), f2 = Cap.companyFleet({ seed: SEED });
  check('your fleet code is three letters, fixed by the seed',
        /^[A-Z]{3}$/.test(f1.code) && f1.code === f2.code && f1.colours.length === 2, f1.code);
  var fac = G.galaxy.factions[0];
  var ff = Cap.factionFleet(G, G.sys, fac.id);
  check('a faction fleet flies a tricolour off its chart colour',
        ff && ff.colours.length === 3 && ff.colours[0] === (fac.color || '#cccccc'), ff && ff.colours.join(','));

  check('no refit in flight, and it says why',
        /clamps/.test(Cap.refitRefusal(G, G.sys, G.sys.ports[0], 'paint') || ''));
})();

(function () {
  var honest = dockedAt(false), shady = dockedAt(true);
  check('found an honest yard and a bought one to compare', !!honest && !!shady);
  if (!honest || !shady) return;

  var why = Cap.refitRefusal(honest.G, honest.G.sys, honest.port, 'paint');
  check('an honest yard will not touch a transponder, and says so', /nobody here/.test(why || ''), why);

  shady.G.ship.credits = 100;
  check('a bought yard still wants paying, and says how much',
        /short by/.test(Cap.refitRefusal(shady.G, shady.G.sys, shady.port, 'full') || ''));
  shady.G.ship.credits = 50000;

  /* A pirate in public, robbing a lawful captain first so they know the hull. */
  var G = shady.G;
  var lawful = captainWith(G, 'lawful') || trafficContact(G, 0);
  var stranger = null;
  var list = Sim.shipsAll(G.sys, 0);
  for (var i = 0; i < list.length; i++) {
    var pp = Cap.profile(G, G.sys, list[i]);
    if (pp && pp.values === 'lawful' && pp.key !== Cap.keyOf(G, G.sys, lawful)) { stranger = list[i]; break; }
  }
  G.record = { self: { piracy: 7, kills: 1, pirateKills: 0, rescues: 0 } };
  Cap.record(G, G.sys, lawful, 'robbed', 10);
  var before = stranger ? Cap.opinion(G, G.sys, stranger).band : null;

  var cr = G.ship.credits;
  var r = Cap.refit(G, G.sys, shady.port, 'paint');
  check('a bought yard refits you', r.ok, r.why);
  check('and charges for it', G.ship.credits === cr - Cap.REFITS.paint.price);
  var id = Cap.identity(G);
  check('you broadcast a new name and a spoofed transponder',
        id.disguised && id.name !== 'Brightwing' && /^[A-Z]{2}-\d{4}$/.test(id.transponder),
        id.name + ' ' + id.transponder);
  check('the greeting calls you by the false name',
        !stranger || Cap.greeting(G, G.sys, stranger, 0).text.indexOf('Brightwing') < 0);

  /* Deterministic: the same career doing the same thing draws the same false name. */
  var G2 = makeG(SEED, shady.G.here);
  Sim.dockShip(G2.ship, shady.port, G2.sys, 0); G2.ship.docked = shady.port.id; G2.ship.credits = 50000;
  Cap.refit(G2, G2.sys, shady.port, 'paint');
  check('same career, same refit, same false name', Cap.identity(G2).name === id.name &&
        Cap.identity(G2).transponder === id.transponder);

  if (stranger) {
    var after = Cap.opinion(G, G.sys, stranger).band;
    check('a stranger who only knew your record: the new face is clean',
          (before === 'furious' || before === 'angry' || before === 'cold') && after === 'neutral',
          before + ' -> ' + after);
  }

  /* Acts in disguise go on the disguise's sheet. */
  Cap.bumpRecord(G, 'piracy');
  check('piracy in disguise goes on the false sheet', Cap.recordOf(G).piracy === 1 &&
        G.record.self.piracy === 7, JSON.stringify(G.record));

  /* Restore. */
  var back = Cap.restoreIdentity(G, shady.port);
  check('restoring your colours works at the yard', back.ok && !Cap.identity(G).disguised);
  check('and your own record is waiting for you', Cap.recordOf(G).piracy === 7);
})();

(function () {
  /* SEEING THROUGH IT. Measured over many captains rather than asserted on
   * one: every captain has seen the hull once (one robbery), then the
   * hull is refitted. Paint should be seen through about half the time,
   * a full refit much less. */
  var shady = dockedAt(true);
  if (!shady) return;
  function trial(extent) {
    var through = 0, n = 0;
    for (var s = 0; s < 10; s++) {
      /* Same system and yard, a different career each time: the seed is
       * what the false transponder and so the recognition roll hang off. */
      var G = makeG(SEED, shady.G.here);
      G.seed = 'seen-' + s;
      Sim.dockShip(G.ship, shady.port, G.sys, 0); G.ship.docked = shady.port.id;
      G.ship.credits = 50000;
      var list = Sim.shipsAll(G.sys, 0).filter(function (c) { return Cap.hasCaptain(c); });
      list.forEach(function (c, i) { Cap.record(G, G.sys, c, 'robbed', i * 1000); });
      Cap.refit(G, G.sys, shady.port, extent);
      list.forEach(function (c) { n++; if (Cap.resolve(G, G.sys, c).through) through++; });
    }
    return { rate: through / Math.max(1, n), n: n };
  }
  var paint = trial('paint'), full = trial('full');
  console.log('     seen through: paint ' + (paint.rate * 100).toFixed(0) + '% of ' + paint.n +
              ', full refit ' + (full.rate * 100).toFixed(0) + '% of ' + full.n +
              '  (expected ~' + (Cap.recognitionChance({ seen: 1 }, { extent: 'paint' }) * 100).toFixed(0) +
              '% / ~' + (Cap.recognitionChance({ seen: 1 }, { extent: 'full' }) * 100).toFixed(0) + '%)');
  check('paint is seen through roughly as often as designed',
        Math.abs(paint.rate - Cap.recognitionChance({ seen: 1 }, { extent: 'paint' })) < 0.12, paint.rate);
  check('a full refit is seen through far less', full.rate < paint.rate * 0.6, full.rate);
  check('but not never', full.rate > 0.05, full.rate);
})();

(function () {
  /* One captain, both outcomes, on purpose. */
  var shady = dockedAt(true);
  if (!shady) return;
  var G = shady.G;
  var list = Sim.shipsAll(G.sys, 0).filter(function (c) { return Cap.hasCaptain(c); });
  list.forEach(function (c, i) { Cap.record(G, G.sys, c, 'robbed', i * 1000); });
  Cap.refit(G, G.sys, shady.port, 'paint');
  var sharp = null, fooled = null;
  list.forEach(function (c) {
    var r = Cap.resolve(G, G.sys, c);
    if (r.through && !sharp) sharp = c;
    if (!r.through && r.fooled && !fooled) fooled = c;
  });
  check('some captains see through the paint and some do not', !!sharp && !!fooled);
  if (!sharp || !fooled) return;

  var g = Cap.greeting(G, G.sys, sharp, 5000);
  check('the one who sees through it says so', /New paint/.test(g.text), g.text);
  Cap.noteMet(G, G.sys, sharp, 5000);
  var self = Cap.memory(G, Cap.keyOf(G, G.sys, sharp));
  check('and it is a seen lie on the real you', self.caught && self.caught.length === 1 &&
        self.honesty < 0, JSON.stringify(self.caught) + ' honesty ' + self.honesty);
  Cap.noteMet(G, G.sys, sharp, 6000);
  check('caught once per disguise, not once per hail', self.caught.length === 1 && self.seen === 2,
        'seen ' + self.seen);

  var fg = Cap.opinion(G, G.sys, fooled);
  check('the one who is fooled greets a stranger', fg.band !== 'angry' && fg.band !== 'furious' &&
        !fg.firstHand, fg.band);
  var realBefore = JSON.stringify(Cap.memory(G, Cap.keyOf(G, G.sys, fooled)));
  Cap.noteMet(G, G.sys, fooled, 7000);
  Cap.record(G, G.sys, fooled, 'answered', 8000);
  check('what you do to them in disguise stays with the disguise',
        JSON.stringify(Cap.memory(G, Cap.keyOf(G, G.sys, fooled))) === realBefore);
  check('and the disguise has a memory of its own now', Cap.opinion(G, G.sys, fooled).firstHand &&
        Cap.opinion(G, G.sys, fooled).memory.tag === 'ANSWERED_MY_DISTRESS');
  check('fooled stays fooled: hailing again does not reroll it',
        !Cap.resolve(G, G.sys, fooled).through);

  /* Saved with the ship. */
  var snap = JSON.parse(JSON.stringify(Save.snapshot(G)));
  check('the disguise is saved with the ship', snap.ship.disguise &&
        snap.ship.disguise.transponder === Cap.identity(G).transponder && snap.ship.disguiseCount === 1);
})();

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
