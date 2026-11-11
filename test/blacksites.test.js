/* blacksites.test.js - the installations nobody lists, and the coil that
 * finds them (2026-11-10).
 *
 *     node test/blacksites.test.js
 *
 * Astra: "we can use the magnetometer to detect space ports in systems you
 * don't have a chart for, especially for classified military or corporate
 * outposts."
 *
 * What this holds:
 *   - ADDITIVE: the same seed with opts.noBlackSites produces exactly the
 *     bodies, orbits, markets, timetable and patrols it always did, so no
 *     career loses anything and the save version does not move;
 *   - SEEDED: the same seed gives the same site, in the same place, of the
 *     same sort, every time;
 *   - BUDGETED: no more than a handful per organization per empire, which
 *     is a fact about the whole map and so lives in galaxy.js, not in a
 *     per-system roll; none at all on an unclaimed star;
 *   - LATENT: a few are allocated and deliberately not built until a career
 *     is pointed at them (opts.reveal);
 *   - REMOTE: far out and off the plane, and certain in a restricted system;
 *   - THE SWEEP: inverse square, audible across its own system, tied down
 *     only from close in - and it writes down the hidden ones only.
 */
global.window = global.window || global;
require('../src/vec3.js');
require('../src/rng.js');
require('../src/kepler.js');
require('../src/economy.js');
var Gen = require('../src/generate.js');
var Galaxy = require('../src/galaxy.js');
require('../src/rings.js');
var Sim = require('../src/sim.js');
var Sv = require('../src/survey.js');
var V = global.V;

var pass = 0, fail = 0;
function check(n, c, d) {
  if (c) { pass++; console.log('  ok   ' + n + (d ? '   ' + d : '')); }
  else { fail++; console.log('  FAIL  ' + n + (d ? '   ' + d : '')); }
}

var gal = Galaxy.build('kawartha');
var N = 120;
var built = [];
for (var i = 0; i < N && i < gal.stars.length; i++) {
  var st = gal.stars[i];
  built.push({ st: st, sys: Gen.generateSystem(st.seed, Galaxy.systemOpts(gal, st)) });
}

console.log('--- additive, or it does not ship ---');
(function () {
  /* The fingerprint deliberately covers the things a shifted rng stream
   * would scramble: ids, names, orbits, market roles, and the counts of
   * the two passes that read every port. */
  function fingerprint(sys) {
    return (sys.bodies || []).filter(function (b) { return !b.classified; }).map(function (b) {
      return [b.id, b.name, b.kind, ((b.orbit && b.orbit.a) || 0).toFixed(6),
              (b.market && b.market.roleName) || ''].join('|');
    }).join('\n') + '\nTRAFFIC ' + (sys.traffic || []).length +
       '\nPATROLS ' + (sys.patrols || []).length +
       '\nPADS ' + (sys.pads || []).length;
  }
  var same = 0, moved = null;
  for (var k = 0; k < 40; k++) {
    var o = Galaxy.systemOpts(gal, built[k].st);
    var off = {};
    for (var key in o) if (Object.prototype.hasOwnProperty.call(o, key)) off[key] = o[key];
    off.noBlackSites = true;
    var bare = Gen.generateSystem(built[k].st.seed, off);
    if (fingerprint(built[k].sys) === fingerprint(bare)) same++;
    else if (!moved) moved = built[k].st.id;
  }
  check('with the sites off, nothing else in the system moves', same === 40,
        same + '/40' + (moved ? ', first difference at ' + moved : ''));
  var bareCount = 0;
  for (var m = 0; m < 10; m++) {
    var o2 = Galaxy.systemOpts(gal, built[m].st);
    var off2 = {}; for (var k2 in o2) if (Object.prototype.hasOwnProperty.call(o2, k2)) off2[k2] = o2[k2];
    off2.noBlackSites = true;
    bareCount += (Gen.generateSystem(built[m].st.seed, off2).blackSites || []).length;
  }
  check('and there are none of them', bareCount === 0);
})();

console.log('--- seeded ---');
(function () {
  var withOne = built.filter(function (b) { return (b.sys.blackSites || []).length; });
  check('some systems hide one', withOne.length > 0, withOne.length + ' of ' + built.length);
  if (!withOne.length) return;
  var a = withOne[0], again = Gen.generateSystem(a.st.seed, Galaxy.systemOpts(gal, a.st));
  var s1 = a.sys.blackSites[0], s2 = again.blackSites[0];
  check('the same seed gives the same site, in the same place',
        !!s2 && s1.name === s2.name && s1.classified.kind === s2.classified.kind &&
        Math.abs(s1.orbit.a - s2.orbit.a) < 1e-9 && Math.abs(s1.orbit.inc - s2.orbit.inc) < 1e-12,
        s1.name);
  /* The ONE thing a careless implementation gets wrong: a site generated
   * without the galaxy's opts must not change the system around it. */
  var lone = Gen.generateSystem(a.st.seed);
  check('and generating it without the galaxy still makes a coherent system',
        lone.bodies.length > 0 && (lone.ports || []).length > 0);
  /* And hides nothing: there is no empire round a bare seed to have hidden
   * anything, and the budget is the galaxy's to spend. */
  check('a bare seed hides nothing at all', (lone.blackSites || []).length === 0);
})();

console.log('--- the budget is the galaxy\'s ---');
(function () {
  /* Astra: "there shouldn't be more than maybe five or ten black sites per
   * organization per empire, and a few of them shouldn't even be generated
   * until you're supposed to be looking for them." Both halves of that are
   * decided in galaxy.js, over the whole map, which is the only place a
   * sentence like that can be true. */
  var sites = gal.stars.filter(function (st) { return st.blackSite; });
  check('the galaxy allocates them, not the systems', sites.length > 0,
        sites.length + ' of ' + gal.stars.length + ' stars');
  var per = {}, worst = 0, worstKey = '';
  sites.forEach(function (st) {
    var k = st.blackSite.faction + '/' + st.blackSite.kind;
    per[k] = (per[k] || 0) + 1;
    if (per[k] > worst) { worst = per[k]; worstKey = k; }
  });
  check('no more than ten of any one sort for any one power', worst <= 10,
        'worst is ' + worstKey + ' with ' + worst);
  check('and enough of them to be a mechanic', worst >= 3, JSON.stringify(per));
  /* The three organizations all keep some: the ask named military and
   * corporate first, so a galaxy that is all Syndicate is the failure. */
  var kinds = {};
  sites.forEach(function (st) { kinds[st.blackSite.kind] = (kinds[st.blackSite.kind] || 0) + 1; });
  check('the fleet, industry and the Syndicate each keep some',
        kinds.listening > 0 && kinds.works > 0 && kinds.cache > 0, JSON.stringify(kinds));
  /* "No port, no market, no law" is what an unclaimed star MEANS. */
  check('nothing is hidden on an unclaimed star',
        sites.every(function (st) { return !!st.factionId; }));
  /* And never on the doorstep of a new career. */
  check('none on the doorstep of home',
        sites.every(function (st) { return st !== gal.stars[0]; }));
  /* A restricted star is the certainty. */
  var restricted = gal.stars.filter(function (st) { return st.restricted; });
  check('every warship yard and penal colony is hiding one',
        restricted.length > 0 && restricted.every(function (st) { return !!st.blackSite; }),
        restricted.length + ' restricted');
  /* Same seed, same allocation. */
  var again = Galaxy.build('kawartha');
  var same = again.stars.every(function (st, i) {
    var x = gal.stars[i].blackSite, y = st.blackSite;
    if (!x && !y) return true;
    return !!x && !!y && x.id === y.id && x.kind === y.kind && x.gated === y.gated;
  });
  check('and the same seed allocates the same ones', same);
})();

console.log('--- the latent ones ---');
(function () {
  var gated = gal.stars.filter(function (st) { return st.blackSite && st.blackSite.gated; });
  check('a few are held back until you are sent', gated.length > 0,
        gated.length + ' of ' + gal.stars.filter(function (st) { return st.blackSite; }).length);
  var withheld = 0, appears = 0;
  gated.forEach(function (st) {
    var o = Galaxy.systemOpts(gal, st);
    if (!(Gen.generateSystem(st.seed, o).blackSites || []).length) withheld++;
    var o2 = Galaxy.systemOpts(gal, st);
    o2.reveal = {}; o2.reveal[st.blackSite.id] = true;
    if ((Gen.generateSystem(st.seed, o2).blackSites || []).length) appears++;
  });
  check('and none of them is in the world by default', withheld === gated.length,
        withheld + '/' + gated.length);
  check('but each appears once a career is pointed at it', appears === gated.length,
        appears + '/' + gated.length);
  /* Revealing one must not conjure the others. */
  if (gated.length > 1) {
    var one = gated[0], other = gated[1];
    var o3 = Galaxy.systemOpts(gal, other);
    o3.reveal = {}; o3.reveal[one.blackSite.id] = true;
    check('revealing one does not reveal the rest',
          (Gen.generateSystem(other.seed, o3).blackSites || []).length === 0);
  }
  /* An ungated one needs no permission. */
  var open = gal.stars.filter(function (st) { return st.blackSite && !st.blackSite.gated; })[0];
  if (open) {
    check('an ungated one is simply there',
          (Gen.generateSystem(open.seed, Galaxy.systemOpts(gal, open)).blackSites || []).length === 1);
  }
})();

console.log('--- remote, and off the plane ---');
(function () {
  var withOne = built.filter(function (b) { return (b.sys.blackSites || []).length; });
  check('some of the sampled systems hide one', withOne.length > 0,
        withOne.length + ' of ' + built.length);
  var offPlane = 0, outer = 0;
  withOne.forEach(function (b) {
    var s2 = b.sys.blackSites[0];
    if (s2.orbit.inc > 20 * Math.PI / 180) offPlane++;
    var host = s2.parentBody, furthest = true;
    b.sys.bodies.forEach(function (x) {
      if (x.kind === 'planet' && x !== host &&
          ((x.orbit && x.orbit.a) || 0) > ((host.orbit && host.orbit.a) || 0)) furthest = false;
    });
    if (furthest) outer++;
  });
  check('every one of them is steeply off the ecliptic', offPlane === withOne.length,
        offPlane + '/' + withOne.length);
  check('and every one is round the outermost world', outer === withOne.length,
        outer + '/' + withOne.length);
  var restricted = built.filter(function (b) { return b.st.restricted; });
  if (restricted.length) {
    var flagged = 0, navyPorts = 0;
    restricted.forEach(function (b) {
      (b.sys.ports || []).forEach(function (pt) {
        if (pt.livery === 'navy' || pt.livery === 'syn') { navyPorts++; if (pt.classified) flagged++; }
      });
    });
    check('a restricted system\'s military berths go unlisted too',
          navyPorts === 0 || flagged === navyPorts, flagged + '/' + navyPorts);
  }
})();

console.log('--- it is a real port ---');
(function () {
  var withOne = built.filter(function (b) { return (b.sys.blackSites || []).length; });
  if (!withOne.length) return;
  var ok = withOne.every(function (b) {
    var s = b.sys.blackSites[0];
    return s.docking && s.market && s.market.rows && b.sys.byId[s.id] === s &&
           b.sys.ports.indexOf(s) >= 0 && b.sys.bodies.indexOf(s) >= 0;
  });
  check('you can dock at one and it has a market', ok);
  /* Nothing on the public timetable calls there: the timetable was laid
   * down before the site was attached, which is the whole trick. */
  var quiet = withOne.every(function (b) {
    var s = b.sys.blackSites[0];
    return !(b.sys.traffic || []).some(function (r) {
      return r.a === s || r.b === s || r.from === s || r.to === s;
    });
  });
  check('and no scheduled traffic ever calls at it', quiet);
})();

console.log('--- the sweep ---');
(function () {
  var hit = null, t0 = 0;
  for (var k = 0; k < built.length && !hit; k++) {
    var cand = built[k];
    if (!(cand.sys.blackSites || []).length) continue;
    var ord = cand.sys.ports.filter(function (p) { return !p.classified; });
    if (ord.length < 2) continue;
    /* A long leg, or there is no curve to measure: in a compact system the
     * site is already fixed from the inner port, which is a true answer to
     * a question this section is not asking. */
    var cs = Sim.bodyPosition(cand.sys.blackSites[0], cand.sys, t0);
    var far = 0;
    ord.forEach(function (p) {
      var d = V.dist(Sim.bodyPosition(p, cand.sys, t0), cs);
      if (d > far) far = d;
    });
    if (far > 8e8) hit = cand;
  }
  if (!hit) { check('found a system with a site and ordinary ports', false); return; }
  var sys = hit.sys, site = sys.blackSites[0], t = 0;
  var sitePos = Sim.bodyPosition(site, sys, t);
  var star = sys.root || sys.bodies[0];
  var starPos = Sim.bodyPosition(star, sys, t);
  var inner = sys.ports.filter(function (p) { return !p.classified; }).sort(function (a, b) {
    return V.dist(Sim.bodyPosition(a, sys, t), starPos) - V.dist(Sim.bodyPosition(b, sys, t), starPos);
  })[0];
  var innerPos = Sim.bodyPosition(inner, sys, t);
  function at(f) {
    var pos = V.add(innerPos, V.scale(V.sub(sitePos, innerPos), f));
    var cs = Sv.sweepContacts(sys, pos, 1, t);
    for (var i = 0; i < cs.length; i++) if (cs[i].id === site.id) return cs[i];
    return null;
  }
  var far = at(0), mid = at(0.75), near = at(0.97);
  check('a site is audible from across its own system', !!far && far.fix < 0.3,
        far ? 'fix ' + far.fix.toFixed(2) : 'not heard at all');
  check('but only as a direction with a shrug in it',
        !!far && far.error > 1e8, far ? (far.error / 1e6).toFixed(0) + ' Mkm of error' : '');
  check('the fix tightens as you close', !!mid && !!near && near.fix > mid.fix && mid.fix > far.fix,
        far && mid && near ? [far.fix, mid.fix, near.fix].map(function (x) { return x.toFixed(2); }).join(' -> ') : '');
  check('and ties down before you are on top of it', !!near && near.fix >= Sv.FIX_GOOD,
        near ? 'fix ' + near.fix.toFixed(2) + ' at ' + (near.range / 1e6).toFixed(0) + ' Mkm' : '');
  /* Inverse square, checked rather than asserted. */
  var a1 = at(0.5), a2 = at(0.75);
  if (a1 && a2) {
    var ratio = (a2.signal / a1.signal) / Math.pow(a1.range / a2.range, 2);
    check('the signal goes as the inverse square of range', Math.abs(ratio - 1) < 0.01, ratio.toFixed(4));
  }
  /* A quiet pad is harder to hear than a station of the same size. */
  var pad = sys.ports.filter(function (p) { return p.surface; })[0];
  if (pad) {
    var twin = { radius: pad.radius, market: pad.market };
    check('a surface pad is quieter than the same thing in clean space',
          Sv.sourceField(pad) < Sv.sourceField(twin) * 0.6,
          Sv.sourceField(pad).toFixed(2) + ' vs ' + Sv.sourceField(twin).toFixed(2));
  }

  console.log('--- running one ---');
  global.Combat = global.Combat || {};
  var MAG = 1;
  global.Combat.magLevel = function () { return MAG; };
  global.Combat.surveyLevel = function () { return 0; };
  global.Combat.fitSummary = function () { return { powerFree: 4 }; };
  function fresh(f) {
    var pos = V.add(innerPos, V.scale(V.sub(sitePos, innerPos), f));
    return { here: { id: hit.st.id }, sys: sys, t: t, found: {},
             ship: { pos: pos, vel: { x: 0, y: 0, z: 0 }, docked: null } };
  }
  MAG = 0;
  check('no magnetometer, no sweep', !Sv.runSweep(fresh(0), sys, t).ok);
  MAG = 1;
  var G1 = fresh(0);
  var r1 = Sv.runSweep(G1, sys, t);
  check('a sweep from the inner system hears things', r1.ok && r1.contacts.length > 0,
        r1.ok ? r1.contacts.length + ' contacts' : r1.why);
  check('but does not find the hidden one from there', r1.ok && r1.news.length === 0);
  check('and leaves a readout to draw', !!G1.sweep && G1.sweep.contacts.length === r1.contacts.length);
  var G2 = fresh(0.97);
  var r2 = Sv.runSweep(G2, sys, t);
  check('a sweep from close in finds it', r2.ok && r2.news.length === 1,
        r2.ok ? r2.news.map(function (c) { return c.port.name; }).join(', ') : r2.why);
  /* Presence, not truth: the value is the epoch, and this test runs at 0. */
  check('it is written down',
        Object.prototype.hasOwnProperty.call(G2.found, hit.st.id + ':' + site.id),
        Object.keys(G2.found).join(','));
  check('and only the hidden ones are', Object.keys(G2.found).length === 1,
        Object.keys(G2.found).length + ' keys');
  var r3 = Sv.runSweep(G2, sys, t);
  check('sweeping again does not find it twice', r3.ok && r3.news.length === 0);
  check('foundPort agrees', Sv.foundPort(G2, site) && !Sv.foundPort(G1, site));
  check('and an ordinary port was never hidden', Sv.foundPort(G1, inner));
  /* Power buys time, not range. */
  global.Combat.fitSummary = function () { return { powerFree: -2 }; };
  var slow = Sv.runSweep(fresh(0.97), sys, t);
  global.Combat.fitSummary = function () { return { powerFree: 4 }; };
  var fast = Sv.runSweep(fresh(0.97), sys, t);
  check('a tight reactor makes the sweep slower, not deafer',
        slow.secs > fast.secs && slow.contacts.length === fast.contacts.length,
        slow.secs.toFixed(1) + ' s vs ' + fast.secs.toFixed(1) + ' s');
})();

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
