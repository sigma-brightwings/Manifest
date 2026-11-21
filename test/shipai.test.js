/* shipai.test.js - ship AI slice 1: six roles and six dials per captain.
 *
 *     node test/shipai.test.js
 *
 * claude/ship-ai-profiles.md. Pinned here:
 *  - every one of the six roles turns up in a real galaxy, read off the
 *    ship (a Syndicate heavy is not a cop, a liner is not a freighter);
 *  - the dials are a pure function of seed and captain, inside 0..1;
 *  - the roles differ the way the design says (a passenger is the most
 *    skittish, the Navy the steadiest, the Syndicate holds together);
 *  - the system PULLS a captain's probity, it does not set it: a bought
 *    system bends most of its cops, a few stay straight, a clean one keeps
 *    a few bent; a pirate answers to no institution;
 *  - the Navy has "a few" bent officers (Astra), not none and not many;
 *  - the live path reads corruption through Combat, bribes included.
 */
'use strict';

var path = require('path');
var SRC = path.join(__dirname, '..', 'src');
global.window = global;
require(path.join(SRC, 'vec3.js'));
require(path.join(SRC, 'kepler.js'));
require(path.join(SRC, 'rng.js'));
require(path.join(SRC, 'economy.js'));
var Gen = require(path.join(SRC, 'generate.js'));
var Galaxy = require(path.join(SRC, 'galaxy.js'));
require(path.join(SRC, 'sim.js'));
var Combat = require(path.join(SRC, 'combat.js'));
require(path.join(SRC, 'missions.js'));
var Cap = require(path.join(SRC, 'captains.js'));
var AI = require(path.join(SRC, 'shipai.js'));

var pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail !== undefined ? '   ' + detail : '')); }
}
function section(n) { console.log('\n' + n); }

var SEED = 'kawartha';
var gal = Galaxy.build(SEED);
function systemFor(star) {
  var sys = Gen.generateSystem(star.seed, { faction: gal.factionById[star.factionId], allFactions: gal.factions });
  sys.starId = star.id;
  return sys;
}
function makeG(star) {
  return { seed: SEED, galaxy: gal, here: star, t: 0, standing: {}, wanted: {} };
}

/* ---- the captains of a real galaxy -------------------------------------- */
var crew = [];          // { G, sys, contact, p, role }
var byRole = {};
AI.ROLES.forEach(function (r) { byRole[r] = []; });
var stars = gal.stars.filter(function (s) { return s.factionId; });
for (var si = 0; si < stars.length && si < 140; si++) {
  var star = stars[si], sys = systemFor(star), G = makeG(star);
  var list = [];
  (sys.traffic || []).forEach(function (r) { if (r.kind !== 'fleet' && r.from) list.push({ route: r, id: r.id, name: r.name, kind: r.kind }); });
  (sys.patrols || []).forEach(function (sp) { if (sp.id && !sp.liftedFrom) list.push(sp); });
  for (var ci = 0; ci < list.length; ci++) {
    var p = Cap.profile(G, sys, list[ci]);
    if (!p) continue;
    var role = AI.roleOf(list[ci], p);
    var rec = { G: G, sys: sys, contact: list[ci], p: p, role: role };
    crew.push(rec); byRole[role].push(rec);
  }
  Cap._clearCache();
}

section('roles');
AI.ROLES.forEach(function (r) {
  check(r + ' captains exist in a real galaxy', byRole[r].length > 0, byRole[r].length);
});
console.log('       ' + AI.ROLES.map(function (r) { return r + ' ' + byRole[r].length; }).join(', ') +
            ' (' + crew.length + ' captains)');
var heavy = crew.filter(function (c) { return c.contact.heavy; })[0];
check('a Syndicate heavy is syndicate, not police', !heavy || heavy.role === 'syndicate', heavy && heavy.role);
var liner = crew.filter(function (c) { return c.contact.route && c.contact.route.cls === 'liner'; })[0];
check('a liner is a passenger ship', !!liner && liner.role === 'passenger', liner && liner.role);
var feeder = crew.filter(function (c) { return c.contact.route && c.contact.route.cls === 'shuttle' && !c.contact.route.souls && c.role !== 'syndicate' && c.role !== 'pirate'; })[0];
check('a feeder shuttle carries freight, so she is a trader', !feeder || feeder.role === 'trader', feeder && feeder.role);
var outRun = crew.filter(function (c) { return c.contact.route && c.contact.route.flag === 'outlaw'; })[0];
check('a Syndicate-flagged runner is syndicate', !outRun || outRun.role === 'syndicate', outRun && outRun.role);

section('pure, bounded');
var a = crew[7], d1 = AI.dials(a.G, a.sys, a.contact), d2 = AI.dials(a.G, a.sys, a.contact);
check('same captain, same dials', JSON.stringify(d1) === JSON.stringify(d2));
var other = AI.dialsFor('another-seed', a.p, a.role, 40);
check('another seed wobbles them', other.nerve !== d1.nerve || other.greed !== d1.greed);
var inRange = crew.every(function (c) {
  var d = AI.dialsFor(SEED, c.p, c.role, c.sys.corruption);
  return ['nerve', 'greed', 'probity', 'discipline', 'heat', 'cohesion'].every(function (k) { return d[k] >= 0 && d[k] <= 1; });
});
check('every dial of every captain is inside 0..1', inRange);

function mean(rs, k, corr) {
  if (!rs.length) return NaN;
  var s = 0;
  rs.forEach(function (c) { s += AI.dialsFor(SEED, c.p, c.role, corr === undefined ? c.sys.corruption : corr)[k]; });
  return s / rs.length;
}
function bentShare(rs, corr) {
  if (!rs.length) return NaN;
  var n = 0;
  rs.forEach(function (c) { if (AI.dialsFor(SEED, c.p, c.role, corr === undefined ? c.sys.corruption : corr).bent) n++; });
  return n / rs.length;
}
function f(x) { return (Math.round(x * 1000) / 1000).toString(); }

section('the roles differ the way the design says');
var nP = mean(byRole.passenger, 'nerve'), nT = mean(byRole.trader, 'nerve'),
    nC = mean(byRole.police, 'nerve'), nN = mean(byRole.navy, 'nerve');
check('nerve: passenger < trader < police < navy', nP < nT && nT < nC && nC < nN,
      [nP, nT, nC, nN].map(f).join(' < '));
var cS = mean(byRole.syndicate, 'cohesion'), cN = mean(byRole.navy, 'cohesion'),
    cPi = mean(byRole.pirate, 'cohesion'), cT = mean(byRole.trader, 'cohesion');
check('cohesion: the Syndicate and the Navy hold together, pirates and traders less',
      Math.min(cS, cN) > Math.max(cPi, cT) + 0.2, 'syn ' + f(cS) + ' navy ' + f(cN) + ' pirate ' + f(cPi) + ' trader ' + f(cT));
check('greed: pirates are the greediest, the Navy the least',
      mean(byRole.pirate, 'greed') > mean(byRole.trader, 'greed') && mean(byRole.navy, 'greed') < mean(byRole.police, 'greed'));
check('discipline: navy > police > pirate',
      mean(byRole.navy, 'discipline') > mean(byRole.police, 'discipline') &&
      mean(byRole.police, 'discipline') > mean(byRole.pirate, 'discipline'));
var gruff = crew.filter(function (c) { return c.p.temper === 'gruff'; }),
    friendly = crew.filter(function (c) { return c.p.temper === 'friendly'; });
check('heat: gruff captains run hotter than friendly ones', mean(gruff, 'heat') > mean(friendly, 'heat') + 0.3,
      f(mean(gruff, 'heat')) + ' vs ' + f(mean(friendly, 'heat')));

section('corruption pulls probity, it does not set it');
var cleanCops = bentShare(byRole.police, 15), boughtCops = bentShare(byRole.police, 80);
console.log('       bent police: ' + Math.round(cleanCops * 100) + '% at 15, ' + Math.round(boughtCops * 100) + '% at 80');
check('a clean system still has the odd bent cop', cleanCops > 0 && cleanCops < 0.15, f(cleanCops));
check('a bought system bends a good share more of them', boughtCops > cleanCops + 0.2, f(boughtCops));
check('...but some stay straight in a bought system', boughtCops < 0.9, f(boughtCops));
var navyBent = bentShare(byRole.navy), navyBought = bentShare(byRole.navy, 80);
console.log('       bent navy: ' + Math.round(navyBent * 1000) / 10 + '% where they serve, ' +
            Math.round(navyBought * 1000) / 10 + '% if every system were bought');
check('the Navy has "a few" bent officers, not none', navyBent > 0 && navyBent < 0.1, f(navyBent));
check('the Navy bends less than the police in a bought system', navyBought < boughtCops, f(navyBought));
var pi0 = mean(byRole.pirate, 'probity', 10), pi1 = mean(byRole.pirate, 'probity', 90);
check('a pirate answers to no institution: corruption leaves her code alone', pi0 === pi1, f(pi0) + ' / ' + f(pi1));
var lawful = byRole.police.filter(function (c) { return c.p.values === 'lawful'; }),
    pirateV = byRole.police.filter(function (c) { return c.p.values !== 'lawful'; });
check('a lawful cop is straighter than one who isn\'t', mean(lawful, 'probity', 40) > mean(pirateV, 'probity', 40));
var t40 = AI.dialsFor(SEED, a.p, a.role, 40);
check('at 40% corruption nobody is pulled', Math.abs(t40.probity - t40.seedProbity) < 1e-12 || t40.probity === 0 || t40.probity === 1);

section('the live path reads corruption through Combat');
var cop = byRole.police.filter(function (c) { return !c.contact.heavy; })[0];
var before = AI.dials(cop.G, cop.sys, cop.contact);
cop.G.corruptionShift = {}; cop.G.corruptionShift[cop.G.here.id] = { v: 40, t: 0 };
var after = AI.dials(cop.G, cop.sys, cop.contact);
check('your bribes in a system bend its police a little further', after.corruption > before.corruption && after.probity <= before.probity,
      before.corruption + '->' + after.corruption + ', ' + f(before.probity) + '->' + f(after.probity));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
