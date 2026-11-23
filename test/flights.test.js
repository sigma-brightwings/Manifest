/* flights.test.js - ship AI slice 2: flights and moods (2026-11-22).
 *
 *     node test/flights.test.js
 *
 * claude/ship-ai-profiles.md sections 4 and 7. Astra: loyalty "isn't in
 * relation to the player, but to the 'flight leader' of the group", and
 * "all syndicate ships will have loyal for one another". Pinned:
 *  - ships of one organisation lifted near each other form a flight; other
 *    organisations, other bands and ships far off do not join it;
 *  - the leader is chosen by rank (a capital over her tender, a heavy over
 *    a runner, a hired gun over the freighter she guards) and keeps it;
 *  - a wingmate covers a mate who is hit; every Syndicate ship in reach
 *    answers any Syndicate ship hit, in a flight or not;
 *  - you hit a pirate: her band turns on you; you hit a cutter: her
 *    wingmate is left to the law's own answer (crime and warrant);
 *  - the leader falls: the senior captain takes the lead if she has the
 *    cohesion, otherwise the flight scatters and stays scattered a while;
 *  - fear and anger rise with events and fall with their half-lives;
 *    anger outweighs fear by nerve; an angered pirate holds on longer;
 *  - a wingmate whose fear beats her cohesion breaks formation and runs;
 *  - wingmates follow the leader into a fight, but a band does not pile
 *    onto a freighter its leader is only robbing;
 *  - the same meeting plays out the same way twice.
 */
'use strict';
global.window = global.window || global;
['vec3', 'rng', 'kepler', 'economy', 'generate', 'sim'].forEach(function (m) { require('../src/' + m + '.js'); });
var Combat = require('../src/combat.js');
require('../src/crew.js');
require('../src/journal.js');
require('../src/missions.js');
require('../src/shiptrade.js');
require('../src/captains.js');
var Galaxy = require('../src/galaxy.js');
var A = require('../src/aggression.js');
var AI = require('../src/shipai.js');
var V = global.V, Sim = global.Sim, Gen = global.Gen;

var pass = 0, fail = 0;
function check(n, c, d) {
  if (c) { pass++; console.log('  ok   ' + n + (d ? '   ' + d : '')); }
  else { fail++; console.log('  FAIL  ' + n + (d ? '   ' + d : '')); }
}
function hooks() { var h = { said: [], say: function (m) { h.said.push(m); }, sound: function () {} }; return h; }
function saidAny(h, re) { return h.said.some(function (m) { return re.test(m); }); }

var g = Galaxy.build('kawartha');
var star = null, sys = null;
for (var si = 0; si < g.stars.length && !sys; si++) {
  var cand = g.stars[si], f = g.factionById[cand.factionId];
  if (!f || f.outlaw || f.minor || f.pirate) continue;
  var sy = Gen.generateSystem(cand.seed, Galaxy.systemOpts(g, cand));
  sy.starId = cand.id;
  if (!sy.ports || sy.ports.length < 2) continue;
  star = cand; sys = sy;
}
check('a lawful system to fight in', !!sys, sys && sys.name);
Sim.policeNearby = function () { return null; };

var T = 4e6;
function live(pos) {
  return { pos: V.clone(pos), vel: { x: 0, y: 0, z: 0 }, fwd: { x: 1, y: 0, z: 0 }, up: { x: 0, y: 0, z: 1 }, right: { x: 0, y: 1, z: 0 } };
}
var nId = 0;
function npc(kind, faction, x, extra) {
  var sp = { id: 'fz' + (nId++), name: kind + ' ' + nId, kind: kind, cls: kind === 'pirate' ? 'pirate' : kind,
             faction: faction, hullMax: 100, hullHp: 100, shieldHp: 0, shieldMax: 0, accel: 0.05,
             live: live({ x: x, y: 0, z: 0 }), mode: kind === 'pirate' ? 'intercept' : 'shadow', modeSince: 0,
             rail: { type: 'lifted' } };
  for (var k in (extra || {})) sp[k] = extra[k];
  sp.live.spec = sp;
  sys.patrols.push(sp);
  return sp;
}
function game() {
  return { seed: 'kawartha', t: T, galaxy: g, here: star, sys: sys, standing: {}, journal: [], distress: [],
           ship: { pos: { x: 0, y: 1000, z: 0 }, vel: { x: 0, y: 0, z: 0 }, cargo: {}, credits: 100, weapons: ['laser'],
                   hullMax: 100, hullHp: 100, fit: {}, docked: null } };
}
function fresh() { sys.patrols = []; sys._ships = null; sys._flights = null; sys._flightsAt = undefined; sys._moodsAt = undefined; }
/* Fix a captain's character for a test that is about one. */
function make(G, sp, d) { var ai = AI.aiOf(G, sys, sp); for (var k in d) ai.dials[k] = d[k]; ai.at = T; return ai; }

console.log('--- who flies with whom ---');
fresh();
var G = game();
var p1 = npc('pirate', 'pb0', 0), p2 = npc('pirate', 'pb0', 150), p3 = npc('pirate', 'pb0', 280);
var q1 = npc('pirate', 'pb1', 100);                       // another band, in among them
var far = npc('pirate', 'pb0', 5000);                     // same band, a long way off
var cop = npc('police', star.factionId, 120);
AI.formFlights(G, sys, T);
var fp = AI.flightOf(p1);
check('a band near each other is one flight, chained ship to ship (single linkage)', !!fp && fp.members.length === 3 &&
      fp.members.indexOf(p3) >= 0, fp && fp.members.map(function (m) { return m.id; }).join(','));
check('another band in among them is not in it', fp && fp.members.indexOf(q1) < 0 && !AI.flightOf(q1));
check('her own band 5000 km off is not in it', fp && fp.members.indexOf(far) < 0 && !AI.flightOf(far));
check('a cutter among pirates is in no flight of theirs', !AI.flightOf(cop));

fresh();
var capital = npc('capital', star.factionId, 0, { kind: 'capital', sizeLetter: 'l', size: 0.5 });
var tender = npc('tender', star.factionId, 40, { kind: 'tender', parentShip: capital.id });
var cutterA = npc('police', star.factionId, 60), cutterB = npc('police', star.factionId, 90);
AI.formFlights(G, sys, T);
var fn = AI.flightOf(capital);
check('a capital and her tender fly together, the capital leading', fn && fn.members.indexOf(tender) >= 0 && fn.leader === capital);
var fc = AI.flightOf(cutterA);
check('two cutters of the same force are a police pair', fc && fc.members.length === 2 && fc.org === 'police:' + star.factionId);

fresh();
var heavy = npc('police', 'outlaw', 0, { heavy: true, sizeLetter: 'm' });
var runner = npc('trader', 'outlaw', 100, { liftedFrom: { id: 'rr1', flag: 'outlaw' } });
AI.formFlights(G, sys, T);
var fs = AI.flightOf(runner);
check('the Syndicate\'s heavy and a runner are one organisation, the heavy leading', fs && fs.org === 'syndicate' && fs.leader === heavy);

fresh();
var hauler = npc('trader', star.factionId, 0, { liftedFrom: { id: 'h77' } });
var merc = npc('merc', star.factionId, 80, { escorting: 'h77' });
AI.formFlights(G, sys, T);
var fe = AI.flightOf(hauler);
check('a freighter and her hired escort fly together, the escort leading', fe && fe.org === 'escort:h77' && fe.leader === merc);
var lone = npc('trader', star.factionId, 120, { liftedFrom: { id: 'h78' } });
AI.formFlights(G, sys, T + 3);
check('an independent freighter flies alone', !AI.flightOf(lone));

console.log('--- the leader keeps the job ---');
fresh();
var l1 = npc('pirate', 'pb0', 0), l2 = npc('pirate', 'pb0', 100);
AI.formFlights(G, sys, T);
var lead0 = AI.flightOf(l1).leader;
/* The other one edges ahead on rank: she does not take over a sitting leader. */
var other = lead0 === l1 ? l2 : l1;
other.size = 2;
AI.formFlights(G, sys, T + 2);
check('a sitting leader keeps the flight when a junior edges ahead', AI.flightOf(l1).leader === lead0);

console.log('--- an attack on one is an attack on her ---');
fresh();
G = game();
var w1 = npc('pirate', 'pb0', 0), w2 = npc('pirate', 'pb0', 150);
var hunter = npc('police', star.factionId, 900, { faction: 'rival-' + star.factionId });
AI.formFlights(G, sys, T);
make(G, w1, { cohesion: 0.6, nerve: 0.6 }); make(G, w2, { cohesion: 0.6, nerve: 0.6 });
var h = hooks();
var hitOne = AI.flightOf(w1).leader === w1 ? w2 : w1, mate = hitOne === w1 ? w2 : w1;
A.onNpcHit(sys, G, hitOne, hunter, T, h);
check('her wingmate turns on whoever hit her', mate.target === hunter && mate.mode === 'chase' && mate.defending === hitOne,
      mate.mode + ' -> ' + (mate.target && mate.target.id));
check('and says so, near you', saidAny(h, /breaks to cover/), h.said.join(' | '));
var mh = AI.moodOf(G, sys, hitOne, T), mm = AI.moodOf(G, sys, mate, T);
check('the one hit is frightened and angered; her mate is angered', mh.fear > 0 && mh.anger > 0 && mm.anger > 0,
      'hit f' + mh.fear.toFixed(2) + ' a' + mh.anger.toFixed(2) + ', mate a' + mm.anger.toFixed(2));

fresh();
G = game();
var r1 = npc('trader', 'outlaw', 0, { liftedFrom: { id: 'rr2', flag: 'outlaw' } });
var hv = npc('police', 'outlaw', 2500, { heavy: true });     // in reach, but no flight of hers
var thug = npc('pirate', 'pb0', 30);
AI.formFlights(G, sys, T);
make(G, hv, { cohesion: 0.8, nerve: 0.7 });
check('a Syndicate heavy 2500 km off is in no flight with the runner', !AI.flightOf(r1) || AI.flightOf(r1).members.indexOf(hv) < 0);
A.onNpcHit(sys, G, r1, thug, T, hooks());
check('...and still answers when the runner is hit: the Syndicate looks after its own', hv.target === thug && hv.defending === r1);

console.log('--- you hit one of them ---');
fresh();
G = game();
var b1 = npc('pirate', 'pb0', 0), b2 = npc('pirate', 'pb0', 120);
AI.formFlights(G, sys, T);
make(G, b1, { cohesion: 0.7, nerve: 0.6 }); make(G, b2, { cohesion: 0.7, nerve: 0.6 });
h = hooks();
A.onPlayerHit(sys, G, b1, T, h);
check('you hit a pirate: her band mate turns on you', b2.hostileToPlayer === true && b2.mode === 'attack');
check('"weapons hot", near you', saidAny(h, /weapons hot/), h.said.join(' | '));
fresh();
var c1 = npc('police', star.factionId, 0), c2 = npc('police', star.factionId, 100);
AI.formFlights(G, sys, T);
A.onPlayerHit(sys, G, c1, T, hooks());
check('you hit a cutter: her wingmate is left to the crime and the warrant', !c2.hostileToPlayer);

console.log('--- the leader falls ---');
fresh();
G = game();
var s1 = npc('pirate', 'pb0', 0, { size: 1 }), s2 = npc('pirate', 'pb0', 100), s3 = npc('pirate', 'pb0', 200);
AI.formFlights(G, sys, T);
var fl = AI.flightOf(s1);
check('the biggest ship leads the band', fl.leader === s1);
var rest = [s2, s3].sort(function (a, b) { return AI.rankOf(G, b) - AI.rankOf(G, a); });
make(G, rest[0], { cohesion: 0.8, nerve: 0.7 }); make(G, rest[1], { cohesion: 0.8, nerve: 0.7 });
s1.dead = true;
h = hooks();
A.onNpcKill(sys, G, s1, null, T, h);
check('a cohesive senior captain takes the lead', fl.leader === rest[0] && fl.members.length === 2, fl.leader && fl.leader.id);
check('"takes the lead", near you', saidAny(h, /takes the lead/), h.said.join(' | '));
check('and losing her leader frightened every captain left', AI.moodOf(G, sys, rest[1], T).fear > 0);
AI.formFlights(G, sys, T + 2);
check('the new leader keeps the flight when it is formed again', AI.flightOf(rest[1]) && AI.flightOf(rest[1]).leader === rest[0]);

fresh();
G = game();
var u1 = npc('pirate', 'pb0', 0, { size: 1 }), u2 = npc('pirate', 'pb0', 100), u3 = npc('pirate', 'pb0', 200);
AI.formFlights(G, sys, T);
make(G, u2, { cohesion: 0.2 }); make(G, u3, { cohesion: 0.2 });
u1.dead = true;
h = hooks();
A.onNpcKill(sys, G, u1, null, T, h);
check('with no cohesive captain left, the flight scatters', !AI.flightOf(u2) && !AI.flightOf(u3));
check('"the flight scatters", near you', saidAny(h, /flight scatters/), h.said.join(' | '));
AI.formFlights(G, sys, T + 30);
check('...and does not regroup half a minute later', !AI.flightOf(u2) && !AI.flightOf(u3));
AI.formFlights(G, sys, T + AI.SCATTER_S + 5);
check('...but does once the scatter has worn off', !!AI.flightOf(u2) && AI.flightOf(u2) === AI.flightOf(u3));

console.log('--- fear and anger ---');
fresh();
G = game();
var m1 = npc('trader', star.factionId, 0, { liftedFrom: { id: 'mm1' } });
var ai1 = make(G, m1, { nerve: 0.5, heat: 0.5 });
AI.feel(G, sys, m1, 'hit', T);
var f0 = ai1.fear, a0 = ai1.anger;
AI.settle(ai1, T + AI.fearHalf(ai1.dials));
check('fear halves in her fear half-life', Math.abs(ai1.fear - f0 / 2) < 1e-9, f0.toFixed(3) + ' -> ' + ai1.fear.toFixed(3) + ' in ' + AI.fearHalf(ai1.dials).toFixed(0) + ' s');
check('anger lasts far longer than fear', ai1.anger > a0 * 0.9, a0.toFixed(3) + ' -> ' + ai1.anger.toFixed(3));
var hot = npc('pirate', 'pb0', 0), cool = npc('pirate', 'pb0', 9000);
make(G, hot, { heat: 0.9 }); make(G, cool, { heat: 0.1 });
check('a hot-tempered captain stays angry longer', AI.angerHalf(hot._ai.dials) > AI.angerHalf(cool._ai.dials) * 3,
      AI.angerHalf(hot._ai.dials) + ' s vs ' + AI.angerHalf(cool._ai.dials) + ' s');
var brave = npc('pirate', 'pb0', 20000), timid = npc('pirate', 'pb0', 30000);
make(G, brave, { nerve: 0.9, heat: 0.6 }); make(G, timid, { nerve: 0.15, heat: 0.2 });
for (var i = 0; i < 3; i++) { AI.feel(G, sys, brave, 'hit', T); AI.feel(G, sys, timid, 'hit', T); }
check('three hits: the brave hot captain is angered, the timid one scared',
      AI.moodOf(G, sys, brave, T).stance === 'angered' && AI.moodOf(G, sys, timid, T).stance === 'scared',
      AI.moodOf(G, sys, brave, T).stance + ' / ' + AI.moodOf(G, sys, timid, T).stance);
check('an angered pirate holds on to half the hull a calm one runs at',
      AI.runHull(G, sys, brave, 0.4, T) === 0.2 && AI.runHull(G, sys, timid, 0.4, T) === 0.4,
      AI.runHull(G, sys, brave, 0.4, T) + ' / ' + AI.runHull(G, sys, timid, 0.4, T));
/* In the fight itself: hurt to 0.3 of her hull, the calm pirate breaks off, the angered one does not. */
fresh();
G = game();
var vic = npc('trader', star.factionId, 50, { liftedFrom: { id: 'vv1' } });
var pc = npc('pirate', 'pb7', 0, { hullHp: 30 }), pa = npc('pirate', 'pb8', 4000, { hullHp: 30 });
pc.target = vic; pa.target = vic; pc.mode = pa.mode = 'chase';
make(G, pc, { nerve: 0.3, heat: 0.1 }); make(G, pa, { nerve: 0.9, heat: 0.9 });
pa._ai.anger = 0.9;
A.onNpcHit(sys, G, pc, vic, T, hooks());
A.onNpcHit(sys, G, pa, vic, T, hooks());
check('at 30% hull the calm pirate breaks off, the angered one fights on', pc.mode === 'breakoff' && pa.mode !== 'breakoff',
      'calm ' + pc.mode + ', angered ' + pa.mode);

console.log('--- breaking formation, following the leader ---');
fresh();
G = game();
var k1 = npc('pirate', 'pb0', 0, { size: 1 }), k2 = npc('pirate', 'pb0', 100);
var foe = npc('police', star.factionId, 600);
AI.formFlights(G, sys, T);
make(G, k1, { cohesion: 0.8, nerve: 0.8 });
var ak2 = make(G, k2, { cohesion: 0.3, nerve: 0.3, heat: 0.1 });
ak2.fear = 0.9;
h = hooks();
AI.tick(sys, G, T + 0.01, h);
sys._moodsAt = undefined;
AI.tick(sys, G, T + 1.5, h);
check('a wingmate whose fear beats her cohesion breaks formation and runs', k2.mode === 'breakoff' && !AI.flightOf(k2), k2.mode);
check('"breaks formation", near you', saidAny(h, /breaks formation/), h.said.join(' | '));

fresh();
G = game();
var e1 = npc('police', star.factionId, 0, { size: 1 }), e2 = npc('police', star.factionId, 100);
var crook = npc('pirate', 'pb0', 800);
AI.formFlights(G, sys, T);
make(G, e1, { cohesion: 0.8 }); make(G, e2, { cohesion: 0.8 });
e1.target = crook; e1.mode = 'chase';
AI.tick(sys, G, T + 2.5, hooks());
check('the leader engages: her wingmate engages the same ship', e2.target === crook && e2.mode === 'chase');

fresh();
G = game();
var j1 = npc('pirate', 'pb0', 0, { size: 1 }), j2 = npc('pirate', 'pb0', 100);
var mark = npc('trader', star.factionId, 300, { liftedFrom: { id: 'mk1' } });
AI.formFlights(G, sys, T);
make(G, j1, { cohesion: 0.8 }); make(G, j2, { cohesion: 0.8 });
j1.target = mark; j1.mode = 'chase';
AI.tick(sys, G, T + 2.5, hooks());
check('a band does not pile onto a freighter its leader is only robbing', j2.target !== mark);
mark.refused = true;
sys._moodsAt = undefined;
AI.tick(sys, G, T + 5, hooks());
check('...but closes in once she refuses and fights', j2.target === mark);

console.log('--- the same meeting, twice ---');
function meeting() {
  fresh();
  var G2 = game();
  var x1 = npc('pirate', 'pb0', 0), x2 = npc('pirate', 'pb0', 100), x3 = npc('pirate', 'pb0', 220);
  AI.formFlights(G2, sys, T);
  var L = AI.flightOf(x1).leader;
  A.onNpcHit(sys, G2, x2, x3, T, hooks());
  L.dead = true;
  A.onNpcKill(sys, G2, L, null, T + 1, hooks());
  return [L.name, AI.flightOf(x2) ? AI.flightOf(x2).leader.name : 'scattered',
          AI.moodOf(G2, sys, x2, T + 1).fear.toFixed(6), AI.moodOf(G2, sys, x3, T + 1).anger.toFixed(6)].join('|');
}
nId = 1000; var m1s = meeting();
nId = 1000; var m2s = meeting();
check('the same seed and the same meeting give the same leaders and moods', m1s === m2s, m1s);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
