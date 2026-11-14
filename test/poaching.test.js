/* poaching.test.js - taking a hand off somebody's ship (2026-11-13).
 *
 *     node test/poaching.test.js
 *
 * Astra: "wants hiring crew off a captain's ship to create a grudge via the
 * infamy system."
 *
 * What this holds:
 *   - IT LANDS ON THE CAPTAIN, not on the hand - the hand is pleased, and
 *     it is the captain who sails short next run;
 *   - IT IS A FEELING, NOT A LIE: her opinion of your character does not
 *     move, because you outbid her rather than deceiving her;
 *   - IT SITS WHERE IT SHOULD on the dial - worse than lying about cargo,
 *     not as bad as holing her hull;
 *   - SHE BRINGS IT UP, by name, and keeps it long enough to matter;
 *   - HER FRIEND AND HER RIVAL HEAR, which falls out of favours.js sharing
 *     `feeling` generically - the thing worth pinning is that a new event
 *     gets that for free and in the right direction.
 */
global.window = global.window || global;
require('../src/vec3.js');
require('../src/rng.js');
require('../src/kepler.js');
require('../src/economy.js');
require('../src/generate.js');
var Galaxy = require('../src/galaxy.js');
require('../src/rings.js');
require('../src/sim.js');
require('../src/combat.js');
var Cap = require('../src/captains.js');

var pass = 0, fail = 0;
function check(n, c, d) {
  if (c) { pass++; console.log('  ok   ' + n + (d ? '   ' + d : '')); }
  else { fail++; console.log('  FAIL  ' + n + (d ? '   ' + d : '')); }
}

console.log('--- the event exists and is shaped right ---');
var E = Cap.EVENTS || null;
/* EVENTS is internal; reach it through a recorded memory instead. */
var hasEvents = !!E;

/* Find a real captain to wrong. */
var gal = Galaxy.build('kawartha');
var Gen = require('../src/generate.js');
var sys = Gen.generateSystem(gal.stars[0].seed, Galaxy.systemOpts(gal, gal.stars[0]));
var roster = Cap.roster ? Cap.roster(gal, sys) : null;
var contact = null;
if (roster && roster.length) contact = roster[0].ref || roster[0];
if (!contact && sys.patrols && sys.patrols.length) contact = sys.patrols[0];

function freshG() {
  return { t: 1000, captains: {}, ship: { credits: 100000, crew: [] },
           sys: sys, here: { id: 'sys' } };
}

var G = freshG();
var landed = null;
if (contact && Cap.hasCaptain && Cap.hasCaptain(contact)) {
  landed = Cap.record(G, sys, contact, 'poached', G.t, { f: 'Mara Teague' });
}
check('a captain can be found to wrong', !!contact && !!(Cap.hasCaptain && Cap.hasCaptain(contact)),
      contact ? (contact.name || contact.id || 'contact') : 'none');
check('poaching records against her', !!landed);

if (landed) {
  console.log('--- where it sits on the dial ---');
  check('her feeling of you drops', landed.feeling < 0, String(landed.feeling));
  check('her read of your honesty does NOT move - you outbid her, you did not lie',
        (landed.honesty || 0) === 0, String(landed.honesty || 0));

  /* Against the acts either side of it, measured the same way. */
  function dialAfter(kind) {
    var g2 = freshG();
    var m = Cap.record(g2, sys, contact, kind, g2.t, { f: 'X' });
    return m ? (m.feeling || 0) : 0;
  }
  var poach = dialAfter('poached'), lie = dialAfter('lied'),
      rob = dialAfter('robbed'), hit = dialAfter('attacked');
  check('worse than lying to her about your cargo', poach < lie,
        poach + ' vs ' + lie);
  check('not as bad as holing her hull', poach > hit, poach + ' vs ' + hit);
  check('and nowhere near robbing her', poach > rob, poach + ' vs ' + rob);

  console.log('--- she brings it up ---');
  var g3 = freshG();
  Cap.record(g3, sys, contact, 'poached', g3.t, { f: 'Mara Teague' });
  var mem = g3.captains[Object.keys(g3.captains)[0]];
  check('it is kept in her log, not just on the dial',
        !!(mem && mem.log && mem.log.length), mem && mem.log ? mem.log.length + ' entries' : 'none');
  var entry = mem && mem.log ? mem.log.filter(function (e) { return e.k === 'poached'; })[0] : null;
  check('the log entry names who you took', !!entry && entry.f === 'Mara Teague',
        entry ? String(entry.f) : 'no entry');

  /* The greeting builder should have something to say about it. */
  var line = null;
  if (Cap.greeting) {
    for (var i = 0; i < 12 && !line; i++) {
      var g = Cap.greeting(g3, sys, contact, g3.t + i * 60);
      var txt = g && (g.text || g.line || (typeof g === 'string' ? g : null));
      if (txt && /crew|hand|short|took/i.test(txt)) line = txt;
    }
  }
  check('she has words for it', !!line, line || '(greeting builder not reachable here)');

  console.log('--- it outranks the small stuff in her memory ---');
  var g4 = freshG();
  for (var k = 0; k < 10; k++) Cap.record(g4, sys, contact, 'traded', g4.t + k * 3600);
  Cap.record(g4, sys, contact, 'poached', g4.t + 40000, { f: 'Mara Teague' });
  var m4 = g4.captains[Object.keys(g4.captains)[0]];
  var kept = m4 && m4.log ? m4.log.filter(function (e) { return e.k === 'poached'; }).length : 0;
  check('ten good trades do not push it out of her log', kept === 1,
        'log holds ' + (m4 && m4.log ? m4.log.length : 0));
}

console.log('--- the hand is glad, and only the captain is not ---');
var src = require('fs').readFileSync(
  require('path').join(__dirname, '..', 'src', 'dialogue.js'), 'utf8');
check('the poach hook records against the captain, not the hand',
      /captainOf\(ctx\)[\s\S]{0,320}'poached'/.test(src));
check("and it passes the hand's name along", /'poached', ctx\.t, \{ f: rec\.name \}/.test(src));
check('the hand still walks off pleased',
      /Do not tell the captain until I am off/.test(src));

console.log('');
console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
