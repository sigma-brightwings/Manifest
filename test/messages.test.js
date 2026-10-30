/* messages.test.js — what you say on the band, what it is read as, who comes.
 *
 *     node test/messages.test.js
 *
 * DESIGN-NOTES-CAPTAINS-RUMOURS-DISGUISE-v3, step 3. Pinned:
 *
 *  - the reader fills the three claim slots, handles negation, and reads
 *    back every call the game composes (the two directions cannot drift);
 *  - claims are checked against the real ship, and a distress call from a
 *    ship that is fine is flagged before it is sent;
 *  - lies are weighed on the design's two axes, and "freed slaves, drive
 *    about to explode" is the worst kind;
 *  - responders are chosen by values, and arriving is where lies are found;
 *  - NPC lures are a pure function of the seed and the clock, and a
 *    pirate's bait can be checked (real maydays: test/upkeep.test.js).
 */
'use strict';

var path = require('path');
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
var M = require(path.join(SRC, 'messages.js'));
var Save = require(path.join(SRC, 'save.js'));

var pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail !== undefined ? '   ' + detail : '')); }
}
function section(n) { console.log('\n' + n); }

var SEED = 'kawartha';
var galaxy = Galaxy.build(SEED);
var cache = {};
function systemFor(star) {
  if (!cache[star.id]) {
    cache[star.id] = Gen.generateSystem(star.seed,
      { faction: galaxy.factionById[star.factionId], allFactions: galaxy.factions });
    cache[star.id].starId = star.id;
  }
  return cache[star.id];
}
function busy(withPirates) {
  for (var i = 0; i < galaxy.stars.length && i < 150; i++) {
    var sys = systemFor(galaxy.stars[i]);
    if ((sys.traffic || []).length < 4) continue;
    var pir = (sys.patrols || []).some(function (p) { return p.kind === 'pirate'; });
    if (withPirates && !pir) continue;
    return galaxy.stars[i];
  }
  return galaxy.home;
}
function makeG(star) {
  star = star || busy(false);
  var sys = systemFor(star);
  var planet = sys.bodies.filter(function (b) { return b.kind === 'planet'; })[0];
  var ship = Sim.circularOrbit(planet, sys, 0, planet.radius * 0.6, 0.1, 0);
  ship.credits = 5000; ship.cargo = {}; ship.passengers = 0;
  Combat.initShip(ship);
  Sim.refreshShip(ship);
  ship.shipName = 'Brightwing'; ship.bornId = 'hull-A';
  return { seed: SEED, ship: ship, sys: sys, t: 1000, galaxy: galaxy, here: star,
           standing: {}, wanted: {}, missions: [], doneMissions: {}, distress: [] };
}

/* ======================================================================== */
section('--- the reader ---');
(function () {
  var r = M.read('Carrying freed slaves, drive about to explode!');
  check('freed slaves read as people in the hold', r.cargo && r.cargo.value === 'humanitarian' &&
        !r.cargo.neg, JSON.stringify(r.cargo));
  check('about to explode reads as explosion', r.situation && r.situation.value === 'explosion',
        JSON.stringify(r.situation));

  r = M.read('We are NOT carrying slaves.');
  check('negation: NOT carrying slaves is a denial', r.cargo && r.cargo.neg, JSON.stringify(r.cargo));

  r = M.read('Under attack by pirates, carrying narcotics');
  check('under attack + pirates + narcotics', r.situation && r.situation.value === 'attack' &&
        r.threat && r.threat.value === 'pirates' && r.cargo && r.cargo.value === 'contraband',
        JSON.stringify(r));

  r = M.read('Our drive has completely failed and we have wounded aboard');
  check('a filler word does not break "drive ... failed"',
        r.situation && (r.situation.value === 'drive' || r.situation.value === 'casualties'),
        JSON.stringify(r.situation));

  r = M.read('Medical supplies for the colony, hull breach, venting');
  check('medical supplies, not just "supplies"', r.cargo && r.cargo.label === 'medical supplies',
        r.cargo && r.cargo.label);
  check('hull breach read', r.situation && r.situation.value === 'breach');

  r = M.read('hello there, nice weather');
  check('small talk reads as nothing', !r.cargo && !r.situation && !r.threat);

  check('Read-as summary names the words matched',
        /refugee/.test(M.describeClaims(M.read('we have refugees')))) ;

  /* Every call the game composes reads back as what it meant. */
  var bad = 0, n = 0;
  ['drive', 'breach', 'lifesupport', 'casualties', 'explosion', 'attack'].forEach(function (s) {
    ['humanitarian', 'valuable', 'ordinary'].forEach(function (c) {
      for (var k = 0; k < 6; k++) {
        var claims = { situation: { value: s }, cargo: { value: c } };
        var txt = M.compose(claims, s + c + k);
        var back = M.read(txt);
        n++;
        if (!back.situation || back.situation.value !== s) { bad++; console.log('     misread: ' + txt); }
      }
    });
  });
  check('every composed call reads back its situation (' + n + ' calls)', bad === 0, bad + ' misread');
})();

section('--- the truth ---');
(function () {
  var G = makeG();
  var chk = M.check(G, G.sys, G.t, M.read('Drive failure, carrying refugees'), 'distress');
  check('a healthy ship calling mayday is flagged first', chk.items[0].slot === 'distress' &&
        !chk.items[0].ok);
  check('refugees with no passengers is a lie', chk.lies.some(function (l) { return l.slot === 'cargo'; }));
  check('and so is the drive', chk.lies.some(function (l) { return l.slot === 'situation'; }));
  check('a lie that exploits compassion and lures rescuers is the worst kind',
        chk.weight.event === 'exploited' && chk.weight.compassion, JSON.stringify(chk.weight));

  G.ship.passengers = 6;
  G.ship.thrusterFuel = 0;
  chk = M.check(G, G.sys, G.t, M.read('Drive failure, carrying refugees'), 'distress');
  check('with people aboard and dry tanks it is all true', chk.honest, JSON.stringify(chk.lies));

  G.ship.cargo = { grain: 10 };
  chk = M.check(G, G.sys, G.t, M.read('hold full of narcotics'), 'message');
  check('naming cargo you do not carry is a manifest lie',
        chk.lies.length === 1 && chk.lies[0].slot === 'cargo' && /manifest/.test(chk.lies[0].prompt));
  chk = M.check(G, G.sys, G.t, M.read('just carrying grain'), 'message');
  check('naming cargo you do carry is true', chk.honest);
  chk = M.check(G, G.sys, G.t, M.read('no narcotics aboard'), 'message');
  check('denying cargo you do not carry is true', chk.honest, JSON.stringify(chk.items));
  var w = M.weighLie([{ slot: 'cargo', value: 'valuable', neg: false }]);
  check('a cargo fib is cheap', w.cost === 1 && w.event === 'lied' && w.greed);
})();

section('--- who answers, and what they find ---');
(function () {
  var G = makeG();
  var hooks = { said: [], say: function (m) { hooks.said.push(m); } };
  var d = M.draft(G, G.sys, G.t, 'distress', 'Refugees aboard, drive about to explode, please', null);
  check('a draft is made and held for Read-as', G.msgDraft === d && !!d.check);
  var b = M.sendDistress(G, G.sys, G.t, d, hooks);
  check('the draft is consumed by sending', !G.msgDraft);
  check('the broadcast is recorded with its lies', b.lies.length >= 2, JSON.stringify(b.lies));
  console.log('     responders: ' + b.responders.length + '  ' +
              b.responders.map(function (r) { return r.name; }).join(', '));
  check('somebody answers a call like that in a busy system', b.responders.length > 0,
        hooks.said.join(' | '));
  if (!b.responders.length) return;
  check('each responder says they are coming', hooks.said.length >= b.responders.length);

  /* Fast-forward to every arrival. */
  var last = Math.max.apply(null, b.responders.map(function (r) { return r.etaAt; }));
  hooks.said.length = 0;
  M.update(G.sys, G, last + 1, hooks);
  check('every responder arrives', b.responders.every(function (r) { return r.arrived; }));
  var r0 = b.responders[0];
  var mem = Cap.memory(G, r0.key);
  check('they find the lie', r0.foundLie === 'exploited', r0.foundLie);
  check('and remember it as the worst kind', mem && mem.tag === 'EXPLOITED_COMPASSION', mem && mem.tag);
  check('and it is on your public record', Cap.recordOf(G).lies >= 1);
  check('and they say so', hooks.said.some(function (s) { return /nobody dying/.test(s); }),
        hooks.said.join(' | '));

  /* An honest call from a ship really in trouble. */
  var H = makeG();
  H.ship.thrusterFuel = 0;
  var hh = { said: [], say: function (m) { hh.said.push(m); } };
  var d2 = M.draft(H, H.sys, H.t, 'distress', 'Our drive is dead, we are drifting. Please help.', null);
  check('a true call reads as honest', d2.check.honest, JSON.stringify(d2.check.lies));
  var b2 = M.sendDistress(H, H.sys, H.t, d2, hh);
  check('an honest real mayday also goes out on the beacon',
        (H.distress || []).some(function (x) { return x.mine; }));
  if (b2.responders.length) {
    var t2 = Math.max.apply(null, b2.responders.map(function (r) { return r.etaAt; })) + 1;
    M.update(H.sys, H, t2, hh);
    check('an honest call finds no lie', b2.responders.every(function (r) { return !r.foundLie; }));
    check('and the first to arrive passes a hose', H.ship.thrusterFuel > 0, H.ship.thrusterFuel);
  }

  /* Values decide who comes: a humanitarian claim pulls abolitionists. */
  var J = makeG();
  var list = Sim.shipsAll(J.sys, J.t), abol = 0, total = 0;
  list.forEach(function (c) {
    if (c.hostile || !Cap.hasCaptain(c)) return;
    var p = Cap.profile(J, J.sys, c);
    var w = M.desireFor(J, J.sys, c, M.read('refugees aboard, drive failure'), 0);
    var w2 = M.desireFor(J, J.sys, c, M.read('hold full of luxury goods, drive failure'), 0);
    if (!w || !w2) return;
    total++;
    if (p.values === 'abolitionist' && w.desire > w2.desire) abol++;
  });
  var abolCount = list.filter(function (c) {
    if (c.hostile) return false;
    var p = Cap.hasCaptain(c) && Cap.profile(J, J.sys, c); return p && p.values === 'abolitionist';
  }).length;
  check('an abolitionist wants people in a hold more than money in it', abol === abolCount,
        abol + ' of ' + abolCount);

  /* Saved and back. */
  var snap = JSON.parse(JSON.stringify(Save.snapshot(G)));
  check('broadcasts survive a save', Array.isArray(snap.broadcasts) && snap.broadcasts.length === 1 &&
        snap.broadcasts[0].responders.length === b.responders.length);
})();

section('--- the band is not only yours ---');
(function () {
  var star = busy(true);
  var G = makeG(star);
  /* THE SCHEDULE HERE IS BAIT ONLY (2026-10-30). Real maydays are ships
   * whose tanks really let go (upkeep.js; test/upkeep.test.js answers
   * one); this schedule's real calls were phantoms and are gone. */
  var found = 0, fakes = 0, slots = 3000;
  for (var s = 0; s < slots; s++) {
    var c = M.npcCallFor(G, G.sys, s);
    if (!c) continue;
    found++;
    if (c.fake) fakes++;
    var again = M.npcCallFor(G, G.sys, s);
    if (JSON.stringify(again) !== JSON.stringify(c)) { check('same slot, same call', false); return; }
  }
  console.log('     ' + found + ' calls in ' + slots + ' slots, ' + fakes + ' of them pirates');
  check('lures happen at roughly the designed rate', found > slots * 0.015 && found < slots * 0.05, found);
  check('and every call off this schedule is a lure, not a phantom', fakes === found, fakes + '/' + found);

  var bait = null;
  for (var s2 = 0; s2 < slots && !bait; s2++) {
    var c2 = M.npcCallFor(G, G.sys, s2);
    if (c2 && c2.fake) bait = c2;
  }
  check('found a bait call', !!bait);
  if (!bait) return;

  var hooks = { said: [], say: function (m) { hooks.said.push(m); } };
  G.distress = [];
  M.updateNpcCalls(G, G.sys, bait.at + 10);
  check('a lure goes on the band once, not every frame', (M.updateNpcCalls(G, G.sys, bait.at + 20),
        G.distress.filter(function (x) { return x.from === bait.from; }).length === 1));

  G.distress = [];
  M.updateNpcCalls(G, G.sys, bait.at + 10);
  var live2 = G.distress.filter(function (x) { return x.from === bait.from; })[0];
  check('a pirate call goes on the band too', !!live2);
  if (!live2) return;
  var reg = M.checkTransponder(G, G.sys, bait.at + 10, live2);
  check('and its transponder does not check out', !/checks out/.test(reg), reg);
  G.ship.pos = V.clone(live2.pos);
  var r2 = Combat.answerDistress(G.sys, G, bait.at + 30, live2, hooks);
  check('answering it walks you into the pirate', r2.ok && r2.fake);
  check('which says so', hooks.said.some(function (s) { return /not on any timetable/.test(s); }));
  check('and nobody is grateful for it', !(Cap.recordOf(G).rescues > 0));

  /* After its window the call does not come back. */
  G.distress = [];
  M.updateNpcCalls(G, G.sys, bait.until + 5);
  check('a call does not outlive its window',
        !G.distress.some(function (x) { return x.from === bait.from; }));
})();

section('--- talking to one ship ---');
(function () {
  var G = makeG();
  var hooks = { said: [], say: function (m) { hooks.said.push(m); } };
  var list = Sim.shipsAll(G.sys, G.t).filter(function (c) { return !c.hostile && Cap.hasCaptain(c); });
  var asked = 0, refused = 0;
  list.forEach(function (c) {
    var r = M.askCargo(G, G.sys, G.t, c, hooks);
    if (r && r.refused) refused++; else if (r) asked++;
  });
  check('most captains will tell a stranger what they carry', asked > 0, asked + ' told, ' + refused + ' refused');
  check('and some will not', refused >= 0);
  var told = hooks.said.filter(function (s) { return /bound for/.test(s); })[0];
  if (told) console.log('     e.g. ' + told);

  var c = list[0];
  hooks.said.length = 0;
  var d = M.draft(G, G.sys, G.t, 'message', 'Watch out, pirates near the inner moon', c);
  M.sendMessage(G, G.sys, G.t, c, d, hooks);
  check('a warning gets an answer', hooks.said.length === 1, hooks.said[0]);
})();

/* ---- the model reader ---------------------------------------------------
 * Only when `npm run models` has staged the model (lang/ is gitignored), so
 * a fresh clone still runs this suite. With it: the shipped settings must
 * hold the accuracy the benchmark chose them for, and the Read-as draft
 * must wait for the model and then show its reading. */
(async function () {
  var fs = require('fs');
  var LANG = path.join(__dirname, '..', 'lang');
  var MODEL = 'Xenova/all-MiniLM-L12-v2';
  if (!fs.existsSync(path.join(LANG, MODEL))) {
    console.log('\n--- the model reader --- (skipped: run `npm run models`)');
    return;
  }
  section('--- the model reader ---');
  var T = await import('@huggingface/transformers');
  T.env.allowRemoteModels = false;
  T.env.localModelPath = LANG;
  T.env.cacheDir = LANG;
  var ext = await T.pipeline('feature-extraction', MODEL, { dtype: 'q8' });
  var embed = async function (texts) { return (await ext(texts, { pooling: 'mean', normalize: true })).tolist(); };
  var protos = await M.preparePrototypes(embed);
  var fx = JSON.parse(fs.readFileSync(path.join(__dirname, 'reader-phrases.json'), 'utf8')).items;
  function got(c) { return c ? (c.neg ? 'NOT ' : '') + c.value : null; }
  var ok = 0, all = 0, okLex = 0, para = 0, paraOk = 0;
  for (var i = 0; i < fx.length; i++) {
    var r = await M.embedRead(fx[i].text, embed, protos);
    var lx = M.read(fx[i].text);
    ['cargo', 'situation', 'threat'].forEach(function (slot) {
      var want = fx[i][slot] == null ? null : fx[i][slot];
      all++;
      if (got(r[slot]) === want) ok++;
      if (got(lx[slot]) === want) okLex++;
      if (fx[i].kind === 'para') { para++; if (got(r[slot]) === want) paraOk++; }
    });
  }
  console.log('     model ' + (ok / all * 100).toFixed(1) + '%   matcher ' + (okLex / all * 100).toFixed(1) +
              '%   paraphrases ' + (paraOk / para * 100).toFixed(1) + '%');
  check('the model reads at least 92% of claim slots', ok / all >= 0.92, (ok / all * 100).toFixed(1));
  check('and beats the matcher alone', ok > okLex, ok + ' vs ' + okLex);
  var r1 = await M.embedRead('Our engines are toast and we can\'t steer', embed, protos);
  check('"engines are toast, can\'t steer" is a drive failure, not a denial of one',
        r1.situation && r1.situation.value === 'drive' && !r1.situation.neg, JSON.stringify(r1.situation));
  var r2 = await M.embedRead('We are not carrying slaves.', embed, protos);
  check('and a real denial is still a denial', r2.cargo && r2.cargo.neg, JSON.stringify(r2.cargo));

  /* The live draft path, as the game uses it. */
  M.useEmbedder(embed, protos, MODEL);
  var G = makeG();
  /* A paraphrase the matcher cannot read at all, so the reading shown can
   * only have come from the model. */
  var d = M.draft(G, G.sys, G.t, 'distress', 'Thrusters are offline and we are spinning', null);
  check('the matcher alone reads nothing in it', !M.read(d.text).situation);
  check('with a model, the draft waits while it reads', d.pending === true);
  for (var k = 0; k < 50 && d.pending; k++) await new Promise(function (res) { setTimeout(res, 20); });
  check('then shows the model\'s reading', !d.pending && d.reader === MODEL &&
        d.claims.situation && d.claims.situation.value === 'drive', JSON.stringify(d.claims));
  var stale = M.draft(G, G.sys, G.t, 'distress', 'Hull breach', null);
  G.msgDraft = null;     // the player cancels before the model answers
  await new Promise(function (res) { setTimeout(res, 300); });
  check('a cancelled draft is not brought back by a late reading', G.msgDraft === null && stale.pending);
  M.useEmbedder(null, null, null);
})().then(function () {
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
}, function (e) {
  console.log('  FAIL model reader threw: ' + (e && e.stack || e));
  process.exit(1);
});
