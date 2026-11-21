/* hunt-digrelays.js (bug hunt 2026-11-21): does a world dig's relay cover
 * depend on WHEN the relays were first asked for? Session A: relays asked
 * on arrival, the dig opens while you are there. Session B: the same
 * system after a reload, dig already open when it is handed out.
 */
'use strict';
global.window = global.window || global;
['vec3', 'rng', 'kepler', 'economy', 'appeal', 'generate', 'galaxy', 'rings', 'sim', 'rumours', 'comsats', 'digs']
  .forEach(function (f) { require('../src/' + f + '.js'); });
var Gen = global.Gen, Galaxy = global.Galaxy, Cs = global.Comsats, Dg = global.Digs, DAY = 86400;
var gal = Galaxy.build('kawartha');
var found = 0, differ = 0, examples = [];
gal.stars.filter(function (s) { return s.factionId; }).slice(0, 150).forEach(function (st) {
  function sysNew() { var s = Gen.generateSystem(st.seed, Galaxy.systemOpts(gal, st)); s.starId = st.id; return s; }
  var probe = sysNew();
  var plan = Dg.planFor(probe, st.id);
  plan.forEach(function (dig) {
    var worldHasPorts = (probe.ports || []).some(function (p) { return p.parentBody && p.parentBody.id === dig.body; });
    if (worldHasPorts) return;
    found++;
    var tOpen = dig.doneAt0 + DAY;
    /* A: arrive before it opens, relays asked then, it opens while you are there. */
    var A = sysNew(), GA = { t: dig.startAt, digs: {}, comsats: [] };
    var nA0 = Cs.relaysFor(A, st.id).length;
    GA.t = tOpen; Dg.update(GA, A, st.id, tOpen, null);
    var relA = Cs.relaysFor(A, st.id).filter(function (r) { return r.body === dig.body; }).length;
    /* B: reload after it opened: handed out with the dig injected first. */
    var B = sysNew(), GB = { t: tOpen, digs: {}, comsats: [] };
    Dg.inject(GB, B, st.id);
    var relB = Cs.relaysFor(B, st.id).filter(function (r) { return r.body === dig.body; }).length;
    if (relA !== relB) { differ++; if (examples.length < 6) examples.push(st.name + ' ' + dig.bodyName + ': before reload ' + relA + ' relays over it, after ' + relB); }
  });
});
console.log('world digs on portless worlds: ' + found + ', relay cover depends on when you looked: ' + differ);
console.log(examples.join('\n'));
