/* licence.test.js - a licence to found a station (2026-10-31).
 *
 *     node test/licence.test.js
 *
 * Pinned: who issues one (the government; the Syndicate in its holds;
 * nobody in a pirate band's space); the standing gate and the fee; a
 * forged blank bought only in a Syndicate hold and filled in at founding;
 * the weekly check, likelier in a clean system; caught, a week to pay the
 * real fee, then due for seizure; and the save.
 */
'use strict';
global.window = global.window || global;
['vec3', 'rng', 'kepler', 'economy'].forEach(function (m) { require('../src/' + m + '.js'); });
var Gen = require('../src/generate.js');
var Galaxy = require('../src/galaxy.js');
var L = require('../src/licence.js');
var Save = require('../src/save.js');

var pass = 0, fail = 0;
function check(n, c, d) {
  if (c) { pass++; console.log('  ok   ' + n + (d ? '   ' + d : '')); }
  else { fail++; console.log('  FAIL  ' + n + (d ? '   ' + d : '')); }
}
function hooks() { var h = { said: [], say: function (m) { h.said.push(m); } }; return h; }

var g = Galaxy.build('kawartha');
function sysOf(fn) {
  var st = g.stars.filter(function (s) { var f = g.factionById[s.factionId]; return f && fn(f); })[0];
  var sys = Gen.generateSystem(st.seed, { faction: g.factionById[st.factionId], allFactions: g.factions });
  sys.starId = st.id;
  return sys;
}
var lawful = sysOf(function (f) { return !f.outlaw && !f.minor; });
var hold = sysOf(function (f) { return f.id === 'outlaw'; });
var band = sysOf(function (f) { return !!f.pirate; });
function G0(standing, credits) {
  var st = {}; st[L.issuer(lawful)] = standing; st.outlaw = standing;
  return { seed: 'kawartha', t: 1000, ship: { credits: credits }, standing: st };
}

console.log('who issues it');
check('a lawful system: its government', L.issuer(lawful) === lawful.factions[0].id && L.needed(lawful));
check('a Syndicate hold: the Syndicate', L.issuer(hold) === 'outlaw');
check('a pirate band\'s space: nobody, and nobody asks', L.issuer(band) === null && L.holds(G0(0, 0), band));

console.log('the gate');
var p = L.price(lawful);
check('a fee about a mid-tier ship\'s price', p >= 30000 && p <= 120000, p + ' cr');
var cold = G0(0, 1e6);
var r0 = L.buy(cold, lawful, 1000, hooks());
check('refused below WARM standing', !r0.ok && /WARM/.test(r0.why), r0.why);
var broke = G0(20, 10);
check('refused without the fee', !L.buy(broke, lawful, 1000, hooks()).ok);
var Gw = G0(20, 1e6);
var c0 = Gw.ship.credits;
var r1 = L.buy(Gw, lawful, 1000, hooks());
check('granted, and paid', r1.ok && c0 - Gw.ship.credits === p && L.holds(Gw, lawful) && !L.rec(Gw, lawful).forged);
check('and not sold twice', !L.buy(Gw, lawful, 2000, hooks()).ok);
var Gm = G0(20, 1e6); Gm.marks = {}; Gm.marks[L.issuer(lawful)] = { kills: 0 };
check('never to a marked pirate', /pirates/.test(L.refusal(Gm, lawful)));

console.log('a forgery');
var Gf = G0(0, 1e6);
check('no blank outside a Syndicate hold', !L.buyForged(Gf, lawful, 1000, hooks()).ok);
var rf = L.buyForged(Gf, hold, 1000, hooks());
check('a blank in a hold, for about a third of the real thing', rf.ok && Gf.forgedBlanks === 1 && L.forgedPrice() < p);
check('without one and without standing, no founding here', !L.forFounding(G0(0, 0), lawful, 1000, hooks()).ok);
var ff = L.forFounding(Gf, lawful, 5000, hooks());
check('the blank is filled in at founding', ff.ok && ff.forged && Gf.forgedBlanks === 0 && L.rec(Gf, lawful).forged);
check('the first check is when the founding starts', L.rec(Gf, lawful).nextCheck === 5000);
var clean = { corruption: 10 }, dirty = { corruption: 90 };
check('a clean system checks far more often than a corrupt one', L.checkOdds(Gf, clean) > L.checkOdds(Gf, dirty) * 3,
      L.checkOdds(Gf, clean).toFixed(3) + ' vs ' + L.checkOdds(Gf, dirty).toFixed(3));
check('a check that passes', L.tick(Gf, lawful, 5000, hooks(), 0.99) === 'ok' && L.rec(Gf, lawful).nextCheck === 5000 + L.CHECK_EVERY);
check('and none again until next week', L.tick(Gf, lawful, 6000, hooks(), 0) === 'ok');
var hc = hooks();
check('a check that finds it', L.tick(Gf, lawful, 5000 + L.CHECK_EVERY, hc, 0) === 'caught' && /INSPECTION/.test(hc.said[0]), hc.said[0]);
check('a week to pay', L.tick(Gf, lawful, 5000 + L.CHECK_EVERY + 3 * 86400, hooks()) === 'caught');
check('then the station is due to be seized', L.tick(Gf, lawful, 5000 + 2 * L.CHECK_EVERY + 1, hooks()) === 'due');
var Gr = G0(0, 1e6);
L.buyForged(Gr, hold, 0, hooks()); L.forFounding(Gr, lawful, 0, hooks()); L.tick(Gr, lawful, 0, hooks(), 0);
check('caught, low standing: no paying your way out', !L.buy(Gr, lawful, 10, hooks()).ok);
Gr.standing[L.issuer(lawful)] = 30;
var hr = hooks();
check('with standing, paying the real fee regularises it', L.buy(Gr, lawful, 10, hr).ok && !L.rec(Gr, lawful).forged && /regularised/.test(hr.said[0]));
check('and a real licence is never checked', L.tick(Gr, lawful, 1e9, hooks(), 0) === null);

console.log('the save');
var snapG = { seed: 'k', t: 0, ship: { pos: { x: 0, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 }, fwd: { x: 0, y: 0, z: 1 }, up: { x: 0, y: 1, z: 0 }, cargo: {}, credits: 0 },
              licences: Gw.licences, forgedBlanks: 2 };
var snap;
try { snap = JSON.parse(JSON.stringify(Save.snapshot(snapG))); } catch (e) { snap = null; }
check('licences and blanks are saved', snap && snap.licences && snap.licences[lawful.starId] && snap.forgedBlanks === 2,
      snap ? '' : 'snapshot threw');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
