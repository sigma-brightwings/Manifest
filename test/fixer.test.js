/* fixer.test.js - the fixer's business (fixer.js, 2026-11-19).
 *
 *     node test/fixer.test.js
 *
 * Pinned: everything the fixer offers or says is true.
 *   - the job is the same all window, gone once taken, and a new one comes
 *     with the next window;
 *   - a smuggling job is offered only where the bar sits on a black market
 *     with contraband on it, and a sabotage only against a lawful port;
 *   - taking it is an ordinary contract on the ledger, and finishing a
 *     smuggle books Syndicate standing - the way in counts those jobs;
 *   - grey guns are named only where corruption reaches the grey gate;
 *   - "who is looking for me" says only what the law and the navy hold;
 *   - the conversation reaches all of it through the business sheet.
 */
var path = require('path');
var SRC = path.join(__dirname, '..', 'src');
['rng', 'economy', 'generate', 'galaxy', 'sim', 'crew', 'combat', 'rumours', 'hunters', 'missions', 'arcs', 'journal', 'captains', 'dialogue'].forEach(function (m) {
  try { require(path.join(SRC, m + '.js')); } catch (e) { console.log('  (could not load ' + m + ': ' + e.message + ')'); }
});
var F = require(path.join(SRC, 'fixer.js'));
var Galaxy = global.Galaxy, Gen = global.Gen, Sim = global.Sim, M = global.Missions, E = global.Economy;
if (!global.Journal && this && this.Journal) global.Journal = this.Journal;

var pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  ok   ' + name + (detail ? '   ' + detail : '')); }
  else { fail++; console.log('  FAIL ' + name + (detail ? '   ' + detail : '')); }
}

var g = Galaxy.build('kawartha');
var cache = {};
function systemFor(star) {
  if (!cache[star.id]) {
    cache[star.id] = Gen.generateSystem(star.seed, { faction: g.factionById[star.factionId], allFactions: g.factions });
    cache[star.id].starId = star.id;
  }
  return cache[star.id];
}
function freshG(star, sys) {
  return { galaxy: g, here: star, sys: sys, t: 3 * 86400, standing: {}, missions: [], doneMissions: {},
           ship: { credits: 50000, cargo: {}, cargoCap: 60, docked: null, hull: 'cobra' } };
}

/* A black-market port with something hot on it, and a port without one. */
var bm = null, plain = null;
for (var i = 0; i < g.stars.length && (!bm || !plain); i++) {
  var st = g.stars[i];
  if (!st.factionId) continue;
  var sy = systemFor(st);
  (sy.ports || []).forEach(function (p) {
    if (!p.market || p.dark) return;
    var others = sy.ports.filter(function (q) { return q !== p && q.market && !q.dark; });
    if (!others.length) return;
    var hot = p.market.blackMarket && Object.keys(p.market.rows).some(function (c) { return E.BY_ID[c] && E.BY_ID[c].contraband; });
    if (hot && !bm) bm = { star: st, sys: sy, port: p };
    if (!p.market.blackMarket && !plain && others.some(function (q) { return q.faction && q.faction !== 'outlaw'; })) plain = { star: st, sys: sy, port: p };
  });
}
check('a black-market port to drink in', !!bm, bm && bm.port.name);
check('an honest port to drink in', !!plain, plain && plain.port.name);

console.log('\n--- the job ---');
var G = freshG(bm.star, bm.sys);
var j1 = F.jobAt(G, bm.port, bm.sys, G.t), j2 = F.jobAt(G, bm.port, bm.sys, G.t + 3600);
check('a smuggling job over a black market', j1 && j1.type === 'smuggle', j1 && j1.text);
check('its goods are contraband sold here', j1 && E.BY_ID[j1.cid].contraband && !!bm.port.market.rows[j1.cid]);
check('to another real port in the system', j1 && bm.sys.ports.some(function (p) { return p.id === j1.toPortId && p !== bm.port; }));
check('booked against the Syndicate', j1 && j1.faction === 'outlaw');
check('the same job all window', j1 && j2 && j1.id === j2.id && j1.pay === j2.pay && j1.cid === j2.cid);
check('the deadline is in the future', j1 && j1.deadline > G.t);
var jp = F.jobAt(freshG(plain.star, plain.sys), plain.port, plain.sys, 3 * 86400);
check('no black market: a sabotage instead', jp && jp.type === 'sabotage', jp && jp.text);
check('...against a lawful port', jp && plain.sys.ports.some(function (p) { return p.id === jp.toPortId && p.faction && p.faction !== 'outlaw'; }));

var r = M.accept(G, j1, null);
check('taking it signs an ordinary contract', r.ok && G.missions.some(function (m) { return m.id === j1.id; }), r.why);
check('the freight is in the hold', (G.ship.cargo[j1.cid] || 0) >= j1.tonnes);
var j3 = F.jobAt(G, bm.port, bm.sys, G.t + 60);
check('then the job is gone, and says when the next is', j3 && j3.taken && j3.back > G.t);
var jn = F.jobAt(G, bm.port, bm.sys, j3.back + 10);
check('a new window, a new job', jn && !jn.taken && jn.id !== j1.id);

console.log('\n--- the way in ---');
var before = M.standing(G, 'outlaw'), need0 = F.jobsToGate(G);
check('a nobody needs jobs to reach the gate', need0 === Math.ceil(F.gate() / F.JOB_STANDING), need0 + ' jobs to ' + F.gate());
check('and is told the count', new RegExp(need0 + ' more jobs').test(F.wayIn(G, G.t)), F.wayIn(G, G.t));
var dst = bm.sys.ports.filter(function (p) { return p.id === j1.toPortId; })[0];
G.t += 3600;
M.completeAtDock(G, dst, bm.sys, G.t, null);
var after = M.standing(G, 'outlaw');
check('delivering it is Syndicate standing', after - before === F.JOB_STANDING, before + ' -> ' + after);
check('and one job fewer to go', F.jobsToGate(G) === need0 - 1);
check('it paid', G.ship.credits === 50000 + j1.pay, G.ship.credits);
G.standing.outlaw = F.gate();
check('at the gate: told where the favour is', /contract board/.test(F.wayIn(G, G.t)));
G.powers = { syndicate: { status: 'completed' } };
check('through the chain: told you are in', /slate/.test(F.wayIn(G, G.t)));
G.allegiance = 'navy'; G.powers = {};
check('a navy pilot is told the door is shut', /navy/.test(F.wayIn(G, G.t)));

console.log('\n--- grey goods ---');
var Cb = global.Combat;
var bent = null, clean = null;
g.stars.forEach(function (s) {
  if (!s.factionId || (bent && clean)) return;
  var sy2 = systemFor(s), c = Cb.systemCorruption({}, sy2, s.id);
  if (c >= F.GREY_CORRUPT && !bent) bent = { star: s, sys: sy2 };
  if (c < F.GREY_CORRUPT && !clean) clean = { star: s, sys: sy2 };
});
check('a bought system and a clean one', !!bent && !!clean);
var G2 = freshG(bent.star, bent.sys);
check('in a bought system: right here', /^Right here/.test(F.greyWord(G2, bent.sys, bent.star, systemFor)));
var G3 = freshG(clean.star, clean.sys), near = F.greyNear(G3, clean.star, systemFor);
var lie = near.filter(function (e) {
  var s = g.stars.filter(function (x) { return x.name === e.name; })[0];
  return Cb.systemCorruption(G3, systemFor(s), s.id) < F.GREY_CORRUPT || e.ly > F.GREY_LY;
});
check('every system named stocks the grey shelf, inside the range', near.length === 0 || lie.length === 0, near.map(function (e) { return e.name; }).join(', ') || 'none near');
var said = F.greyWord(G3, clean.sys, clean.star, systemFor);
check('a clean system says not here', /^(Not here|Nowhere close)/.test(said), said.slice(0, 80));
check('and never sells the forged papers', /nobody sells those/.test(said));

console.log('\n--- who is looking ---');
var G4 = freshG(clean.star, clean.sys);
check('nobody, when nobody is', /^Nobody/.test(F.lookingFor(G4, G4.t)));
var fac = clean.star.factionId;
G4.wanted = {}; G4.wanted[fac] = 1200;
check('a fine, in the faction\'s name and amount', /1,200 cr/.test(F.lookingFor(G4, G4.t)), F.lookingFor(G4, G4.t));
if (global.Hunters) {
  G4.notoriety = {}; G4.notoriety[fac] = { v: global.Hunters.HUNT_AT + 5, at: G4.t };
  check('hunters, when the navy has sent them', /hunters out/.test(F.lookingFor(G4, G4.t)));
}

console.log('\n--- the conversation ---');
var D = global.Dialogue;
if (D && D.open) {
  var G5 = freshG(bm.star, bm.sys); G5.ship.docked = bm.port.id;
  var who = { id: 'fx1', name: 'Vel Arrin', role: 'fixer', staff: 'Fixer', x: 0, z: 0 };
  var stt = null;
  try { stt = D.open(G5, bm.sys, bm.port, who, G5.t); } catch (e) { console.log('  (open threw: ' + e.message + ')'); }
  if (stt) {
    var opts = D.options(G5, bm.sys, bm.port, stt);
    var wi = opts.map(function (o) { return o.id; }).indexOf('work');
    check('the fixer offers business', wi >= 0, opts.map(function (o) { return o.id; }).join(','));
    if (wi >= 0) {
      D.choose(G5, bm.sys, bm.port, stt, wi);
      var sheet = D.options(G5, bm.sys, bm.port, stt).map(function (o) { return o.id; });
      check('the sheet has work, grey goods, papers, the law and the way in',
            ['x-job', 'x-grey', 'x-papers', 'x-look', 'x-way'].every(function (k) { return sheet.indexOf(k) >= 0; }), sheet.join(','));
      D.choose(G5, bm.sys, bm.port, stt, sheet.indexOf('x-job'));
      var jb = D.options(G5, bm.sys, bm.port, stt).map(function (o) { return o.id; });
      check('asking for work shows the job and asks', jb[0] === 'j-take', stt.line.slice(0, 80));
      D.choose(G5, bm.sys, bm.port, stt, 0);
      check('taking it in words signs it', G5.missions.some(function (m) { return /^fx\|/.test(m.id); }), stt.line);
    }
  }
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
