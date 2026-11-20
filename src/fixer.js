/* THE FIXER'S BUSINESS (2026-11-19). Slice 2 of the engaging-stations plan
 * (claude/engaging-stations-plan.md): the bar's Syndicate fixer had a name,
 * a temper and four lines, and the four things a fixer is FOR - work, grey
 * goods, word, and a way in - were never built. This is them.
 *
 * The station rule holds here as everywhere: every answer is read off state
 * the game already keeps. The job is a real contract on the real ledger;
 * "where are grey guns sold" names systems whose shelves really carry them;
 * "who is looking for me" reads the law and the navy's notoriety; and "how
 * do I get in" counts the actual standing the Long Arrangement is gated on.
 *
 * WHAT A FIXER DOES NOT SELL: the forged transponder. combat.js keeps it
 * unlisted on purpose - "the whole of what it is worth is that you cannot
 * buy it" - and it is the Long Arrangement's reward. The fixer says so,
 * which is true and is also the best advertisement that chain could have.
 *
 * Seeded per port and contract window (missions.js WINDOW, two days), so a
 * fixer offers the same job until the window turns, and the one you took
 * is gone until it does. */
(function (global) {
  'use strict';

  var WINDOW = 2 * 86400;
  var SMUGGLE_DAYS = 3, SABOTAGE_DAYS = 5;
  var GREY_CORRUPT = 60;          // the grey shelf's own gate (combat.js GUNS minCorrupt)
  var GREY_LY = 10, GREY_LOOK = 8;
  var JOB_STANDING = 3;           // what completeAtDock / onSabotage book for one of these
  var GATE_FALLBACK = 10;

  function Eco() { return global.Economy; }
  function winOf(t) { return Math.floor((t || 0) / WINDOW); }
  function crs(n) { return Math.round(n).toLocaleString('en-US') + ' cr'; }
  function facName(G, id) {
    var f = G && G.galaxy && G.galaxy.factionById ? G.galaxy.factionById[id] : null;
    return (f && f.name) || id || 'them';
  }
  function taken(G, id) {
    if (G.doneMissions && G.doneMissions[id]) return true;
    return (G.missions || []).some(function (m) { return m.id === id; });
  }

  /* ---- the job ------------------------------------------------------------
   * Smuggling where the bar sits on a black market with something to move
   * and somewhere to move it; otherwise a lawful port in this system holed
   * with a rock torpedo. Both are ordinary contract types the ledger
   * already settles (completeAtDock, onSabotage), booked against `outlaw`,
   * so finishing one is Syndicate standing - which is the way in. */
  function jobAt(G, port, sys, t) {
    if (!port || !port.market || !sys) return null;
    var win = winOf(t), id = 'fx|' + port.id + '|' + win;
    var next = (win + 1) * WINDOW;
    if (taken(G, id)) return { taken: true, id: id, back: next };
    var RNG = global.RNG, E = Eco();
    if (!RNG || !E) return null;
    var rng = new RNG('fixer|' + port.id + '|' + win + '|' + (sys.seed || ''));
    var others = (sys.ports || []).filter(function (p) { return p !== port && p.market && !p.dark; });
    var hot = port.market.blackMarket ? Object.keys(port.market.rows || {}).filter(function (cid) {
      return E.BY_ID[cid] && E.BY_ID[cid].contraband;
    }).sort() : [];
    var base = t - (t % WINDOW);
    if (hot.length && others.length) {
      var cid = rng.pick(hot), tn = rng.int(4, 12), dst = rng.pick(others);
      var nm = E.BY_ID[cid].name;
      return {
        id: id, type: 'smuggle', cid: cid, tonnes: tn,
        from: port.id, fromName: port.name, toPortId: dst.id, toName: dst.name,
        faction: 'outlaw', fixer: true,
        pay: tn * rng.int(150, 210),
        deadline: base + SMUGGLE_DAYS * 86400,
        text: tn + 't of ' + nm + ', off the books, to ' + dst.name,
        desc: tn + ' tonnes of ' + nm.toLowerCase() + ', loaded tonight, for a buyer at ' + dst.name +
              '. Nobody signs anything, and if a customs scan finds it, it was never ours.'
      };
    }
    var lawful = others.filter(function (p) { return p.faction && p.faction !== 'outlaw'; });
    if (!lawful.length) return null;
    var tg = rng.pick(lawful);
    return {
      id: id, type: 'sabotage', cid: null, tonnes: 0,
      from: port.id, fromName: port.name, toPortId: tg.id, toName: tg.name,
      faction: 'outlaw', fixer: true,
      pay: rng.int(48, 64) * 100,
      deadline: base + SABOTAGE_DAYS * 86400,
      text: 'hole ' + tg.name + ' with a rock torpedo',
      desc: 'Somebody would like ' + tg.name + ' closed for a season. A Guild rock torpedo does it, if it ' +
            'lands on the station. Paid when it does. You were never here.'
    };
  }

  /* ---- grey goods ---------------------------------------------------------
   * Where the bootleg guns are: a grey shelf is stocked wherever corruption
   * reaches the grey gate, so the answer is a list of systems, nearest
   * first. `systemFor` is main.js's cached generator (Fleet.systemFor). */
  function greyHere(G, sys) {
    var C = global.Combat;
    var c = C && C.systemCorruption ? C.systemCorruption(G, sys) : (sys && sys.corruption) || 0;
    return c >= GREY_CORRUPT;
  }
  function greyNear(G, here, systemFor) {
    var Gx = global.Galaxy, C = global.Combat;
    if (!G.galaxy || !here || !Gx || !systemFor) return [];
    var near = G.galaxy.stars.filter(function (s) { return s !== here && s.factionId; })
      .map(function (s) { return { star: s, ly: Gx.distance3(here, s) }; })
      .filter(function (e) { return e.ly > 0 && e.ly <= GREY_LY; })
      .sort(function (a, b) { return a.ly - b.ly; })
      .slice(0, GREY_LOOK);
    var out = [];
    near.forEach(function (e) {
      var s2 = null;
      try { s2 = systemFor(e.star); } catch (err) { s2 = null; }
      if (!s2 || !(s2.ports || []).some(function (p) { return p.market; })) return;
      var c = C && C.systemCorruption ? C.systemCorruption(G, s2, e.star.id) : s2.corruption || 0;
      if (c >= GREY_CORRUPT) out.push({ name: e.star.name, ly: e.ly });
    });
    return out;
  }
  function greyWord(G, sys, here, systemFor) {
    var tail = ' Forged papers are another thing: nobody sells those. The overboss gives them to people who see the Long Arrangement through.';
    if (greyHere(G, sys)) {
      return 'Right here. Everyone in this system with a hand out has been paid, so the outfitters keep bootleg guns in the back. They run hot and they sometimes do not fire.' + tail;
    }
    var list = greyNear(G, here, systemFor);
    if (!list.length) return 'Nowhere close. Nobody within ' + GREY_LY + ' light years is bent enough to stock them.' + tail;
    var said = list.slice(0, 2).map(function (e) { return e.name + ', ' + e.ly.toFixed(1) + ' ly'; });
    return 'Not here. Try ' + said.join(', or ') + ' - the officials there are bought, and the outfitters stock what they like.' + tail;
  }

  /* ---- who is looking for you --------------------------------------------- */
  function lookingFor(G, t) {
    var bits = [];
    var W = G.wanted || {};
    Object.keys(W).sort().forEach(function (f) {
      if (W[f] > 0) bits.push(facName(G, f) + ' want ' + crs(W[f]) + ' from you');
    });
    var H = global.Hunters, N = G.notoriety || {};
    if (H && H.notoriety) {
      Object.keys(N).sort().forEach(function (emp) {
        var n = H.notoriety(G, emp, t);
        if (n >= (H.HUNT_THREE || 120)) bits.push('the ' + facName(G, emp) + ' navy sends hunters after you in threes');
        else if (n >= (H.HUNT_AT || 60)) bits.push('the ' + facName(G, emp) + ' navy has hunters out for you');
        else if (n >= (H.HUNT_AT || 60) / 2) bits.push('the ' + facName(G, emp) + ' navy knows your name, but not well enough to send anyone yet');
      });
    }
    if (!bits.length) return 'Nobody. You are not worth the trouble yet.';
    var s = bits.join('; ') + '.';
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  /* ---- the way in ----------------------------------------------------------
   * The Syndicate's chain (arcs.js POWER_ARCS.syndicate) opens at a standing
   * with `outlaw`; this says how far off that is in jobs, and where the
   * first chapter is when it is open. */
  function gate() {
    var A = global.Arcs, a = A && A.POWER_ARCS && A.POWER_ARCS.syndicate;
    return (a && typeof a.gate === 'number') ? a.gate : GATE_FALLBACK;
  }
  function standing(G) {
    var M = global.Missions;
    return M && M.standing ? M.standing(G, 'outlaw') : ((G.standing || {}).outlaw || 0);
  }
  function jobsToGate(G) {
    var need = gate() - standing(G);
    return need <= 0 ? 0 : Math.ceil(need / JOB_STANDING);
  }
  function wayIn(G, t) {
    if (G.marks && G.marks.outlaw) return 'You are marked. Nobody who works for us will touch you, and I am only talking to you because I am curious.';
    if (G.allegiance && G.allegiance !== 'syndicate') return 'You fly for the navy now. That door shut when you picked the other one.';
    var pw = (G.powers || {}).syndicate;
    if (pw && pw.status === 'completed') return 'You are in. Your name is on the slate, and the slate does not get wiped.';
    if (pw && pw.status === 'active') return 'You are already doing a favour for us. Finish it.';
    if (pw && pw.cooldownUntil && t < pw.cooldownUntil) return 'Somebody asked you once and you let them down. Give it a few days.';
    var n = jobsToGate(G);
    if (!n) return 'Somebody wants a favour done and will not say by whom. It is on the contract board at any port we run, or anywhere the officials are bought.';
    var st = standing(G);
    return (st < 0 ? 'First you have to get back to being nobody to us. ' : 'Do some work for us. ') +
           (n === 1 ? 'One more job like mine' : n + ' more jobs like mine') + ', and somebody will want a word.';
  }

  var Fixer = {
    WINDOW: WINDOW, GREY_CORRUPT: GREY_CORRUPT, GREY_LY: GREY_LY, JOB_STANDING: JOB_STANDING,
    jobAt: jobAt, greyHere: greyHere, greyNear: greyNear, greyWord: greyWord,
    lookingFor: lookingFor, wayIn: wayIn, jobsToGate: jobsToGate, gate: gate
  };
  global.Fixer = Fixer;
  if (typeof module !== 'undefined' && module.exports) module.exports = Fixer;
})(typeof window !== 'undefined' ? window : globalThis);
